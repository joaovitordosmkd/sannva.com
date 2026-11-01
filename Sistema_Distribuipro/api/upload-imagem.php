<?php
/**
 * DistribuiPro 39.1 · Recebe a foto do produto e grava em img/produtos/ (versão Firebase).
 *
 * Chamado pelo cadastro de produtos (config/foto-hospedagem.js) com a foto já reduzida (WebP/JPEG/PNG,
 * até 3 MB) e o login do Firebase no cabeçalho Authorization. Responde {ok:true, url:'img/produtos/arquivo.webp'}.
 * Só usuário ativo do sistema envia (api/firebase-token.php). O nome do arquivo é gerado aqui.
 * "apagar" = nome de um arquivo anterior da mesma pasta para remover (troca de foto).
 */
require __DIR__ . '/firebase-token.php';

header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { http_response_code(204); exit; }
if ($_SERVER['REQUEST_METHOD'] !== 'POST') dp_fb_json(405, array('ok' => false, 'erro' => 'Use POST.'));

$uid = dp_fb_exigir_login();

if (empty($_FILES['foto']) || !is_array($_FILES['foto']) || !isset($_FILES['foto']['tmp_name'])) dp_fb_json(400, array('ok' => false, 'erro' => 'Nenhuma foto enviada.'));
$f = $_FILES['foto'];
if (!empty($f['error'])) dp_fb_json(400, array('ok' => false, 'erro' => 'Falha no envio (código ' . (int) $f['error'] . ').'));
if (!is_uploaded_file($f['tmp_name'])) dp_fb_json(400, array('ok' => false, 'erro' => 'Envio inválido.'));
if ((int) $f['size'] <= 0 || (int) $f['size'] > 3 * 1024 * 1024) dp_fb_json(413, array('ok' => false, 'erro' => 'Foto grande demais (máximo 3 MB).'));

$tipos = array('image/webp' => 'webp', 'image/jpeg' => 'jpg', 'image/png' => 'png');
$mime = '';
if (function_exists('finfo_open')) { $fi = finfo_open(FILEINFO_MIME_TYPE); if ($fi) { $mime = (string) finfo_file($fi, $f['tmp_name']); finfo_close($fi); } }
if ($mime === '' && function_exists('mime_content_type')) $mime = (string) @mime_content_type($f['tmp_name']);
if ($mime === '' || !isset($tipos[$mime])) {
    // sem finfo: confere pelo cabeçalho do arquivo
    $head = (string) file_get_contents($f['tmp_name'], false, null, 0, 16);
    if (substr($head, 0, 4) === 'RIFF' && substr($head, 8, 4) === 'WEBP') $mime = 'image/webp';
    elseif (substr($head, 0, 3) === "\xFF\xD8\xFF") $mime = 'image/jpeg';
    elseif (substr($head, 0, 8) === "\x89PNG\r\n\x1a\n") $mime = 'image/png';
}
if (!isset($tipos[$mime])) dp_fb_json(415, array('ok' => false, 'erro' => 'Só WebP, JPG ou PNG.'));
if (function_exists('getimagesize') && $mime !== 'image/webp' && !@getimagesize($f['tmp_name'])) dp_fb_json(415, array('ok' => false, 'erro' => 'O arquivo não é uma imagem válida.'));

$dir = dirname(__DIR__) . '/img/produtos';
if (!is_dir($dir) && !@mkdir($dir, 0755, true)) dp_fb_json(500, array('ok' => false, 'erro' => 'Não consegui criar a pasta img/produtos na hospedagem.'));
if (!is_writable($dir)) dp_fb_json(500, array('ok' => false, 'erro' => 'A pasta img/produtos não aceita gravação (permissão).'));

$rand = function_exists('random_bytes') ? bin2hex(random_bytes(4)) : sprintf('%08x', mt_rand(0, 0x7fffffff));
$nome = 'f-' . date('Ymd-His') . '-' . $rand . '.' . $tipos[$mime];
$dest = $dir . '/' . $nome;
if (!@move_uploaded_file($f['tmp_name'], $dest)) dp_fb_json(500, array('ok' => false, 'erro' => 'Não consegui gravar a foto na hospedagem.'));
@chmod($dest, 0644);

// Foto anterior do mesmo produto (só arquivos gerados por aqui, dentro da pasta)
$apagar = isset($_POST['apagar']) ? basename((string) $_POST['apagar']) : '';
if ($apagar !== '' && $apagar !== $nome && preg_match('/^f-\d{8}-\d{6}-[0-9a-f]{8}\.(webp|jpg|png)$/', $apagar) && is_file($dir . '/' . $apagar)) @unlink($dir . '/' . $apagar);

dp_fb_json(200, array('ok' => true, 'url' => 'img/produtos/' . $nome, 'bytes' => (int) filesize($dest)));
