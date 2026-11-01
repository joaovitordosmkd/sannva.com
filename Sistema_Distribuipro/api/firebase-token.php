<?php
/**
 * DistribuiPro 39.1 · Confere no servidor quem está logado no Firebase (versão Firebase).
 *
 * As páginas mandam o token do usuário logado (Authorization: Bearer <idToken>). Aqui o token é
 * conferido com as chaves públicas do Google (assinatura RS256, validade, projeto) e depois o
 * cadastro users/{uid} é lido no Firestore com o próprio token: só usuário ativo do sistema passa.
 * Não guarda senha nem token de ninguém. Precisa de PHP 5.6+ com openssl e curl ou allow_url_fopen.
 *
 * Uso:  require __DIR__ . '/firebase-token.php';  $uid = dp_fb_exigir_login();
 */

function dp_fb_project_id() {
    static $id = null;
    if ($id !== null) return $id;
    $id = '';
    $f = __DIR__ . '/../config/firebase-config.js';
    if (is_file($f)) {
        $t = (string) file_get_contents($f);
        if (preg_match('/["\']?projectId["\']?\s*:\s*["\']([A-Za-z0-9._-]+)["\']/', $t, $m)) $id = $m[1];
    }
    return $id;
}

function dp_fb_json($code, $arr) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($arr, JSON_UNESCAPED_UNICODE);
    exit;
}

function dp_fb_b64url($s) {
    $s = strtr($s, '-_', '+/');
    $pad = strlen($s) % 4;
    if ($pad) $s .= str_repeat('=', 4 - $pad);
    return base64_decode($s);
}

function dp_fb_http($url, $headers = array()) {
    if (function_exists('curl_init')) {
        $c = curl_init($url);
        curl_setopt_array($c, array(CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 12, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_FOLLOWLOCATION => false, CURLOPT_HTTPHEADER => $headers, CURLOPT_SSL_VERIFYPEER => true));
        $body = curl_exec($c);
        $code = (int) curl_getinfo($c, CURLINFO_HTTP_CODE);
        curl_close($c);
        return array($code, $body === false ? '' : $body);
    }
    $ctx = stream_context_create(array('http' => array('method' => 'GET', 'timeout' => 12, 'header' => implode("\r\n", $headers), 'ignore_errors' => true)));
    $body = @file_get_contents($url, false, $ctx);
    $code = 0;
    if (isset($http_response_header) && preg_match('#HTTP/\S+\s+(\d{3})#', $http_response_header[0], $m)) $code = (int) $m[1];
    return array($code, $body === false ? '' : $body);
}

// Chaves públicas do Google (trocam de tempos em tempos): guardadas por 1 hora na pasta temporária.
function dp_fb_certs($forcar = false) {
    $cache = sys_get_temp_dir() . '/dp-firebase-certs-' . md5(__DIR__) . '.json';
    if (!$forcar && is_file($cache) && filemtime($cache) > time() - 3600) {
        $j = json_decode((string) file_get_contents($cache), true);
        if (is_array($j) && count($j)) return $j;
    }
    list($code, $body) = dp_fb_http('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
    $j = $code === 200 ? json_decode($body, true) : null;
    if (is_array($j) && count($j)) { @file_put_contents($cache, json_encode($j)); return $j; }
    if (is_file($cache)) { $j = json_decode((string) file_get_contents($cache), true); if (is_array($j)) return $j; }
    return array();
}

/** Devolve o conteúdo (payload) do token ou null, com o motivo em $motivo. */
function dp_fb_verificar($jwt, &$motivo = '') {
    $motivo = '';
    $pid = dp_fb_project_id();
    if ($pid === '') { $motivo = 'projectId não encontrado em config/firebase-config.js'; return null; }
    $p = explode('.', (string) $jwt);
    if (count($p) !== 3) { $motivo = 'token mal formado'; return null; }
    $h = json_decode(dp_fb_b64url($p[0]), true);
    $b = json_decode(dp_fb_b64url($p[1]), true);
    $sig = dp_fb_b64url($p[2]);
    if (!is_array($h) || !is_array($b) || empty($h['kid']) || (isset($h['alg']) && $h['alg'] !== 'RS256')) { $motivo = 'cabeçalho inválido'; return null; }
    $now = time();
    if (empty($b['exp']) || $b['exp'] < $now - 60) { $motivo = 'token vencido'; return null; }
    if (isset($b['iat']) && $b['iat'] > $now + 300) { $motivo = 'token do futuro'; return null; }
    if (empty($b['aud']) || $b['aud'] !== $pid) { $motivo = 'token de outro projeto'; return null; }
    if (empty($b['iss']) || $b['iss'] !== 'https://securetoken.google.com/' . $pid) { $motivo = 'emissor inválido'; return null; }
    if (empty($b['sub']) || !is_string($b['sub']) || strlen($b['sub']) > 128) { $motivo = 'usuário inválido'; return null; }
    if (!function_exists('openssl_verify')) { $motivo = 'PHP sem openssl'; return null; }
    $certs = dp_fb_certs();
    if (!isset($certs[$h['kid']])) { $certs = dp_fb_certs(true); }
    if (!isset($certs[$h['kid']])) { $motivo = 'chave do Google não encontrada'; return null; }
    $key = openssl_pkey_get_public($certs[$h['kid']]);
    if (!$key) { $motivo = 'chave pública inválida'; return null; }
    $ok = openssl_verify($p[0] . '.' . $p[1], $sig, $key, OPENSSL_ALGO_SHA256);
    if (PHP_VERSION_ID < 80000 && is_resource($key)) openssl_free_key($key);
    if ($ok !== 1) { $motivo = 'assinatura inválida'; return null; }
    return $b;
}

function dp_fb_bearer() {
    $h = '';
    if (isset($_SERVER['HTTP_AUTHORIZATION'])) $h = $_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) $h = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    elseif (function_exists('getallheaders')) { foreach (getallheaders() as $k => $v) { if (strcasecmp($k, 'Authorization') === 0) { $h = $v; break; } } }
    if (preg_match('/^Bearer\s+([A-Za-z0-9._-]+)$/', trim((string) $h), $m)) return $m[1];
    return '';
}

/** O usuário existe em users/{uid} e está ativo (ou é admin) e não foi excluído? Lê com o token dele. */
function dp_fb_usuario_ativo($token, $uid) {
    $pid = dp_fb_project_id();
    $url = 'https://firestore.googleapis.com/v1/projects/' . rawurlencode($pid) . '/databases/(default)/documents/users/' . rawurlencode($uid);
    list($code, $body) = dp_fb_http($url, array('Authorization: Bearer ' . $token));
    if ($code !== 200) return false;
    $j = json_decode($body, true);
    if (!is_array($j) || empty($j['fields'])) return false;
    $f = $j['fields'];
    $str = function ($k) use ($f) { return isset($f[$k]['stringValue']) ? (string) $f[$k]['stringValue'] : ''; };
    $deleted = isset($f['deleted']['booleanValue']) ? (bool) $f['deleted']['booleanValue'] : false;
    if ($deleted) return false;
    return $str('status') === 'active' || $str('role') === 'admin';
}

/** Para nos arquivos da API: devolve o uid do usuário logado ou responde 401 e encerra. */
function dp_fb_exigir_login() {
    $tok = dp_fb_bearer();
    if ($tok === '') dp_fb_json(401, array('ok' => false, 'erro' => 'Faça login no sistema.', 'codigo' => 'sem_token'));
    $motivo = '';
    $b = dp_fb_verificar($tok, $motivo);
    if (!$b) dp_fb_json(401, array('ok' => false, 'erro' => 'Login não reconhecido: ' . $motivo, 'codigo' => 'token_invalido'));
    if (!dp_fb_usuario_ativo($tok, $b['sub'])) dp_fb_json(403, array('ok' => false, 'erro' => 'Usuário sem cadastro ativo no sistema.', 'codigo' => 'usuario_inativo'));
    return $b['sub'];
}
