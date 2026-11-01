<?php
/**
 * DistribuiPro 39.1 · Entrega o retrato da lista de produtos (versão Firebase).
 *
 * O arquivo data/produtos-snapshot.json é gerado na importação inicial de uma base grande (milhares de
 * produtos) com a mesma data de sincronização gravada nos documentos. Na primeira abertura em cada
 * navegador o config/produtos-cache.js pega este retrato em vez de ler a coleção inteira do Firestore:
 * zero leituras. Depois só busca o que mudou.
 * A pasta data/ fica fechada (data/.htaccess): o retrato só sai por aqui, para usuário logado e ativo.
 * Sem o arquivo responde 404 e o sistema lê do Firestore como sempre.
 */
require __DIR__ . '/firebase-token.php';

header('X-Content-Type-Options: nosniff');
if ($_SERVER['REQUEST_METHOD'] !== 'GET') dp_fb_json(405, array('ok' => false, 'erro' => 'Use GET.'));

$arq = dirname(__DIR__) . '/data/produtos-snapshot.json';
// 39.14.16 · Pasta que já foi publicada no Cloudflare pelo PUBLICAR-NO-CLOUDFLARE.cmd: o retrato tem nome secreto.
if (!is_file($arq)) {
    $secretos = glob(dirname(__DIR__) . '/data/retrato-*.json') ?: array();
    $secretos = array_values(array_filter($secretos, function ($c) { return (bool) preg_match('/\/retrato-[0-9a-f]{32}\.json$/', str_replace('\\', '/', $c)); }));
    usort($secretos, function ($a, $b) { return filemtime($b) - filemtime($a); });
    if ($secretos) $arq = $secretos[0];
}
if (!is_file($arq)) dp_fb_json(404, array('ok' => false, 'erro' => 'Sem retrato de produtos nesta hospedagem.'));

dp_fb_exigir_login();

$conteudo = (string) file_get_contents($arq);
header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: private, no-store');
header('X-DP-Snapshot-Date: ' . gmdate('Y-m-d\TH:i:s\Z', filemtime($arq)));
$gzip = function_exists('gzencode') && isset($_SERVER['HTTP_ACCEPT_ENCODING']) && stripos($_SERVER['HTTP_ACCEPT_ENCODING'], 'gzip') !== false && !ini_get('zlib.output_compression');
if ($gzip) {
    $out = gzencode($conteudo, 6);
    header('Content-Encoding: gzip');
    header('Vary: Accept-Encoding');
    header('Content-Length: ' . strlen($out));
    echo $out;
} else {
    header('Content-Length: ' . strlen($conteudo));
    echo $conteudo;
}
