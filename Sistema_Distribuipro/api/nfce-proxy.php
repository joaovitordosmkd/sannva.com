<?php
/**
 * Proxy da nota fiscal — Focus NFe e Asaas
 * Resolve o bloqueio de CORS fazendo a chamada pelo servidor PHP
 *
 * 38.7 · Segurança: este arquivo só conversa com os endereços oficiais da Focus NFe e do Asaas
 * (homologação/sandbox e produção), escritos aqui no servidor. Nenhum endereço vem do navegador
 * (o XML e o DANFE são achados pela ref da nota) e o token só vai para o provedor: nunca volta na resposta.
 *
 * 39.7 · Além da NFC-e: NF-e (tipo=nfe) e NFS-e (tipo=nfse) da Focus, e a NFS-e do Asaas (provedor=asaas,
 * chave no cabeçalho X-Asaas-Key). O Windows Offline não usa este arquivo: o desktop/main.js faz as mesmas chamadas.
 *
 * 39.10 · Base by Asaas (provedor=base, chave no cabeçalho X-Base-Key): NFC-e e NF-e pelo pedido de venda do Base.
 * "acao=aviso" é o endereço que o Base chama quando a nota sai (webhook): só responde 200 e não guarda nada; o sistema lê
 * os avisos depois pela própria API do Base (lista de envios do webhook), com o link do PDF e do XML.
 */

// Permitir chamadas do seu domínio
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Focus-Token, X-Asaas-Key, X-Base-Key');
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

// Responder preflight OPTIONS
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// ── CONFIGURAÇÃO ──────────────────────────────────────────────
// O token DEVE ser enviado pelo sistema via header X-Focus-Token
// (configurado em Configurações → Fiscal). Sem ele, o PHP retorna erro.
//
// Se você quiser testar este arquivo direto via curl/Postman, descomente
// as linhas abaixo e use seus tokens (não use os tokens de outros clientes!):
// $FALLBACK_TOKEN_HOMOLOG  = 'seu_token_homologacao_aqui';
// $FALLBACK_TOKEN_PRODUCAO = 'seu_token_producao_aqui';

// Os ÚNICOS endereços que este proxy chama. Nunca troque por um endereço vindo da requisição.
$FOCUS_URLS = array(
    'homologacao' => 'https://homologacao.focusnfe.com.br',
    'producao'    => 'https://api.focusnfe.com.br',
);
$ASAAS_URLS = array(
    'homologacao' => 'https://api-sandbox.asaas.com/v3',
    'producao'    => 'https://api.asaas.com/v3',
);
// Ações aceitas por tipo de nota da Focus (qualquer outra é recusada antes de chamar a Focus).
$ACOES = array(
    'nfce' => array('emitir', 'consultar', 'preview', 'cancelar', 'danfe', 'xml', 'danfe_html'),
    'nfe'  => array('emitir', 'consultar', 'cancelar', 'danfe', 'xml', 'danfe_pdf'),
    'nfse' => array('emitir', 'consultar', 'cancelar', 'danfe', 'xml'),
    'nfsen' => array('emitir', 'consultar', 'cancelar', 'danfe', 'xml'), // NFS-e Nacional (DPS)
);
// Ações do Asaas (só NFS-e: a API da conta Asaas não emite NF-e nem NFC-e)
$ACOES_ASAAS = array('conta', 'info_fiscal', 'opcoes_municipais', 'servicos', 'cliente_buscar', 'cliente_criar', 'nota_buscar', 'nota_criar', 'nota_emitir', 'nota_consultar', 'nota_cancelar', 'nota_xml');
// 39.10 · Base by Asaas (ERP do Asaas): NFC-e e NF-e
$BASE_URLS = array(
    'homologacao' => 'https://api-sandbox.baseerp.com.br',
    'producao'    => 'https://api.baseerp.com.br',
);
$ACOES_BASE = array('bancos', 'produto_buscar', 'produto_criar', 'produto_atualizar', 'cliente_buscar', 'cliente_criar', 'cliente_atualizar',
    'pedido_buscar', 'pedido_criar', 'pedido_consultar', 'pedido_remover', 'nota_emitir', 'nota_reemitir', 'nota_cancelar',
    'avisos', 'aviso_criar', 'aviso_atualizar', 'aviso_eventos', 'arquivo');

// ── PARÂMETROS DA REQUISIÇÃO ──────────────────────────────────
$provedor = _nfceParam('provedor');
if ($provedor !== 'asaas' && $provedor !== 'base') $provedor = 'focus';
$acao     = array_key_exists('acao', $_GET) ? _nfceParam('acao') : 'emitir';
$ambiente = _nfceParam('ambiente') === 'producao' ? 'producao' : 'homologacao';
$tipo     = _nfceParam('tipo') === '' ? 'nfce' : _nfceParam('tipo');
$ref      = _nfceParam('ref');
$metodo   = strtoupper((string) $_SERVER['REQUEST_METHOD']);

if ($provedor === 'asaas') {
    if (!in_array($acao, $ACOES_ASAAS, true)) _nfceResponder(400, array('erro' => 'Ação inválida', 'codigo' => 'acao_invalida'));
    _nfceAsaas($ASAAS_URLS[$ambiente], $acao, $metodo);
}
if ($provedor === 'base') {
    // Aviso do Base (webhook): responde 200 para a fila do Base seguir. Nada é lido nem guardado aqui.
    if ($acao === 'aviso') _nfceResponder(200, array('ok' => true));
    if (!in_array($acao, $ACOES_BASE, true)) _nfceResponder(400, array('erro' => 'Ação inválida', 'codigo' => 'acao_invalida'));
    _nfceBase($BASE_URLS[$ambiente], $acao, $metodo);
}

if (!isset($ACOES[$tipo])) {
    _nfceResponder(400, array('erro' => 'Tipo de nota inválido', 'codigo' => 'tipo_invalido'));
}
if (!in_array($acao, $ACOES[$tipo], true)) {
    _nfceResponder(400, array('erro' => 'Ação inválida', 'codigo' => 'acao_invalida'));
}
// ref da nota: só letras, números, ponto, hífen e sublinhado (ex.: venda-abc123-1)
if ($ref !== '' && (!preg_match('/^[A-Za-z0-9._-]{1,120}$/D', $ref) || strpos($ref, '..') !== false)) {
    _nfceResponder(400, array('erro' => 'Parâmetro ref inválido', 'codigo' => 'ref_invalida'));
}

$baseUrl = $FOCUS_URLS[$ambiente];

// ── TOKEN: vem do header enviado pelo sistema ─────────────────
// (o antigo "&debug=1" saiu: mostrava a versão do PHP para qualquer um; "Testar conexão" em Configurações › Fiscal já diz se o token chega)
$token = _nfceCabecalho('X-Focus-Token');
if ($token === '' && isset($FALLBACK_TOKEN_HOMOLOG) && isset($FALLBACK_TOKEN_PRODUCAO)) {
    $token = ($ambiente === 'producao') ? $FALLBACK_TOKEN_PRODUCAO : $FALLBACK_TOKEN_HOMOLOG;
}

// Se ainda não tem token, retorna erro claro
if ($token === '') {
    _nfceResponder(401, array(
        'erro' => 'Token não enviado',
        'mensagem' => 'O header X-Focus-Token está vazio. Verifique se o token foi salvo em Configurações → Fiscal.',
        'codigo' => 'token_ausente'
    ));
}
// Token com espaço, dois-pontos ou quebra de linha não é da Focus (e iria estragar a autenticação)
if (!preg_match('/^[\x21-\x39\x3B-\x7E]{8,200}$/D', $token)) {
    _nfceResponder(401, array(
        'erro' => 'Token inválido',
        'mensagem' => 'O token da Focus NFe parece errado. Copie de novo em Configurações → Fiscal.',
        'codigo' => 'token_invalido'
    ));
}

// ── ROTEAMENTO ────────────────────────────────────────────────
// Todos os endereços abaixo são montados aqui: base oficial da Focus + caminho fixo + ref já conferida.
if ($ref === '' && $acao !== 'preview') {
    _nfceResponder(400, array('erro' => 'Parâmetro ref é obrigatório', 'codigo' => 'ref_ausente'));
}
$refUrl = rawurlencode($ref);

if ($acao === 'emitir') {
    // POST — emitir nova nota (NFC-e, NF-e ou NFS-e)
    if ($metodo !== 'POST') _nfceResponder(405, array('erro' => 'Método inválido'));
    $body = _nfceCorpo();
    if ($body === '' || json_decode($body) === null) _nfceResponder(400, array('erro' => 'Body vazio ou inválido'));
    $resposta = _chamarFocusNfe("$baseUrl/v2/$tipo?ref=$refUrl", 'POST', $token, $body);

} elseif ($acao === 'consultar') {
    // GET — consultar status da nota
    $completa = _nfceParam('completa') !== '' ? '?completa=' . (int) _nfceParam('completa') : '';
    $resposta = _chamarFocusNfe("$baseUrl/v2/$tipo/$refUrl$completa", 'GET', $token);

} elseif ($acao === 'preview') {
    // POST — pré-visualizar XML sem enviar à SEFAZ
    if ($metodo !== 'POST') _nfceResponder(405, array('erro' => 'Método inválido'));
    $resposta = _chamarFocusNfe("$baseUrl/v2/nfce/preview", 'POST', $token, _nfceCorpo());

} elseif ($acao === 'cancelar') {
    // A Focus cancela com DELETE e a justificativa no corpo (o sistema manda POST para cá)
    if ($metodo !== 'POST' && $metodo !== 'DELETE') _nfceResponder(405, array('erro' => 'Método inválido'));
    $resposta = _chamarFocusNfe("$baseUrl/v2/$tipo/$refUrl", 'DELETE', $token, _nfceCorpo());

} elseif ($acao === 'danfe') {
    // GET — retorna dados da nota (incluindo o caminho do DANFE)
    $resposta = _chamarFocusNfe("$baseUrl/v2/$tipo/$refUrl", 'GET', $token);

} else {
    // xml, danfe_html (NFC-e) e danfe_pdf (NF-e): o arquivo é achado pela ref, na própria Focus. O navegador não manda
    // endereço nenhum (antes mandava ?url=... e o servidor buscava qualquer endereço levando o token junto).
    $nota  = _chamarFocusNfe("$baseUrl/v2/$tipo/$refUrl", 'GET', $token);
    $dados = json_decode($nota['body'], true);
    if ($nota['status'] < 200 || $nota['status'] >= 300 || !is_array($dados)) {
        http_response_code($nota['status'] >= 400 ? $nota['status'] : 502);
        echo $nota['body'];
        exit;
    }
    $campo = $acao === 'xml' ? 'caminho_xml_nota_fiscal' : 'caminho_danfe';
    $urlArquivo = _nfceArquivoFocus($baseUrl, isset($dados[$campo]) ? $dados[$campo] : '');
    if ($urlArquivo === null) {
        _nfceResponder(404, array('erro' => ($acao === 'xml' ? 'XML' : 'DANFE') . ' ainda não disponível para esta nota', 'codigo' => 'arquivo_indisponivel'));
    }
    $arquivo = _chamarFocusNfe($urlArquivo, 'GET', $token, null, true);
    if ($arquivo['status'] < 200 || $arquivo['status'] >= 300 || $arquivo['body'] === '') {
        _nfceResponder(502, array('erro' => 'Falha ao buscar ' . ($acao === 'xml' ? 'o XML' : 'o DANFE') . ' na Focus NFe'));
    }

    if ($acao === 'xml') {
        header('Content-Type: application/xml; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'");
        echo $arquivo['body'];
        exit;
    }
    if ($acao === 'danfe_pdf') {
        header('Content-Type: application/pdf');
        header("Content-Security-Policy: default-src 'none'");
        echo $arquivo['body'];
        exit;
    }

    // danfe_html: injeta o CSS de 80mm para impressão térmica
    $html = $arquivo['body'];

    // CSS para impressão em 80mm
    $css80 = '<style>
        @page { size: 80mm auto !important; margin: 2mm !important; }
        @media print {
            html, body { width: 80mm !important; margin: 0 !important; padding: 0 !important; }
        }
        html, body { width: 80mm !important; max-width: 80mm !important; font-size: 9px !important; }
        table { width: 76mm !important; max-width: 76mm !important; font-size: 9px !important; border-collapse: collapse; }
        td, th { padding: 1px 2px !important; font-size: 9px !important; word-break: break-word; }
        img { max-width: 60mm !important; height: auto !important; }
        div { max-width: 76mm !important; word-wrap: break-word; }
        .container, .content, .wrapper { width: 76mm !important; max-width: 76mm !important; margin: 0 !important; padding: 0 !important; }
        h1,h2,h3,h4 { font-size: 10px !important; margin: 2px 0 !important; }
        p { margin: 2px 0 !important; font-size: 9px !important; }
    </style>
    <script>window.onload=function(){setTimeout(function(){window.print();},800);};</script>';

    // Injetar antes do </head>
    if (stripos($html, '</head>') !== false) {
        $html = str_ireplace('</head>', $css80 . '</head>', $html);
    } else {
        $html = $css80 . $html;
    }

    header('Content-Type: text/html; charset=utf-8');
    echo $html;
    exit;
}

// ── RETORNAR RESPOSTA ─────────────────────────────────────────
http_response_code($resposta['status']);
echo $resposta['body'];
exit;


// ── AJUDANTES ─────────────────────────────────────────────────
function _nfceResponder($status, $dados) {
    http_response_code($status);
    echo json_encode($dados, JSON_UNESCAPED_UNICODE);
    exit;
}

// Parâmetro da URL sempre como texto (lista ou outro tipo vira vazio)
function _nfceParam($nome) {
    $v = isset($_GET[$nome]) ? $_GET[$nome] : '';
    return is_string($v) ? trim($v) : '';
}

// Cabeçalho enviado pelo sistema. Apache às vezes prefixa com REDIRECT_; cobrimos os dois casos.
function _nfceCabecalho($nome) {
    $chave = 'HTTP_' . strtoupper(str_replace('-', '_', $nome));
    $v = '';
    if (isset($_SERVER[$chave]))                   $v = $_SERVER[$chave];
    elseif (isset($_SERVER['REDIRECT_' . $chave])) $v = $_SERVER['REDIRECT_' . $chave];
    elseif (function_exists('getallheaders')) {
        foreach (getallheaders() as $k => $x) {
            if (strcasecmp($k, $nome) === 0) { $v = $x; break; }
        }
    }
    return is_string($v) ? trim($v) : '';
}

// Corpo da requisição (até 2 MB)
function _nfceCorpo() {
    $body = file_get_contents('php://input', false, null, 0, 2097152);
    return is_string($body) ? $body : '';
}

// Caminho do arquivo (XML/DANFE) que a Focus devolveu na consulta da nota -> endereço na MESMA base oficial.
// Endereço de outro servidor, "..", "//" ou caractere estranho: recusado (null).
function _nfceArquivoFocus($baseUrl, $caminho) {
    if (!is_string($caminho) || $caminho === '') return null;
    if (preg_match('#^https://#i', $caminho)) {
        $host = strtolower((string) parse_url($caminho, PHP_URL_HOST));
        if ($host === '' || $host !== parse_url($baseUrl, PHP_URL_HOST) || parse_url($caminho, PHP_URL_PORT) || parse_url($caminho, PHP_URL_USER)) return null;
        $caminho = (string) parse_url($caminho, PHP_URL_PATH);
    }
    if (!preg_match('#^/[A-Za-z0-9_./-]{1,400}$#D', $caminho) || strpos($caminho, '..') !== false || strpos($caminho, '//') !== false) return null;
    return $baseUrl . $caminho;
}

// ── ASAAS (39.7) ──────────────────────────────────────────────
// Só a NFS-e (nota de serviço). Cada ação vira UM endereço fixo do Asaas; o id da nota/cliente e os filtros são conferidos aqui.
function _nfceAsaas($base, $acao, $metodo) {
    $chave = _nfceCabecalho('X-Asaas-Key');
    if ($chave === '') {
        _nfceResponder(401, array('erro' => 'Chave não enviada', 'mensagem' => 'A chave de API do Asaas não chegou. Confira em Configurações → Fiscal.', 'codigo' => 'chave_ausente'));
    }
    if (!preg_match('/^[\x21-\x7E]{20,400}$/D', $chave)) {
        _nfceResponder(401, array('erro' => 'Chave inválida', 'mensagem' => 'A chave de API do Asaas parece errada. Copie de novo em Configurações → Fiscal.', 'codigo' => 'chave_invalida'));
    }
    $id = _nfceParam('id');
    if ($id !== '' && !preg_match('/^[A-Za-z0-9_-]{1,80}$/D', $id)) _nfceResponder(400, array('erro' => 'Parâmetro id inválido', 'codigo' => 'id_invalido'));
    $precisaId = in_array($acao, array('nota_emitir', 'nota_consultar', 'nota_cancelar', 'nota_xml'), true);
    if ($precisaId && $id === '') _nfceResponder(400, array('erro' => 'Parâmetro id é obrigatório', 'codigo' => 'id_ausente'));
    $post = in_array($acao, array('cliente_criar', 'nota_criar', 'nota_emitir', 'nota_cancelar'), true);
    if ($post && $metodo !== 'POST') _nfceResponder(405, array('erro' => 'Método inválido'));
    $corpo = $post ? _nfceCorpo() : null;
    if ($post && $corpo !== '' && json_decode($corpo) === null) _nfceResponder(400, array('erro' => 'Body inválido'));
    $idUrl = rawurlencode($id);

    if ($acao === 'conta') {
        $url = "$base/myAccount/commercialInfo/";
    } elseif ($acao === 'info_fiscal') {
        $url = "$base/fiscalInfo";
    } elseif ($acao === 'opcoes_municipais') {
        $url = "$base/fiscalInfo/municipalOptions";
    } elseif ($acao === 'servicos') {
        $q = _nfceParam('q');
        if (function_exists('mb_substr')) $q = mb_substr($q, 0, 100, 'UTF-8'); else $q = substr($q, 0, 100);
        $url = "$base/fiscalInfo/services?limit=100" . ($q !== '' ? '&description=' . rawurlencode($q) : '');
    } elseif ($acao === 'cliente_buscar') {
        $doc = preg_replace('/\D/', '', _nfceParam('cpfCnpj'));
        if (strlen($doc) !== 11 && strlen($doc) !== 14) _nfceResponder(400, array('erro' => 'CPF/CNPJ inválido', 'codigo' => 'documento_invalido'));
        $url = "$base/customers?cpfCnpj=$doc&limit=1";
    } elseif ($acao === 'cliente_criar') {
        $url = "$base/customers";
    } elseif ($acao === 'nota_buscar') {
        $ext = _nfceParam('ref');
        if (!preg_match('/^[A-Za-z0-9._-]{1,100}$/D', $ext)) _nfceResponder(400, array('erro' => 'Parâmetro ref inválido', 'codigo' => 'ref_invalida'));
        $url = "$base/invoices?externalReference=" . rawurlencode($ext) . '&limit=10';
    } elseif ($acao === 'nota_criar') {
        $url = "$base/invoices";
    } elseif ($acao === 'nota_emitir') {
        $url = "$base/invoices/$idUrl/authorize";
    } elseif ($acao === 'nota_consultar') {
        $url = "$base/invoices/$idUrl";
    } elseif ($acao === 'nota_xml') {
        // 39.9 · XML da NFS-e (para o contador): o link vem da própria nota no Asaas; só HTTPS do Asaas ou do armazenamento
        // dele, e a chave NÃO vai junto (o link do arquivo é aberto sem ela)
        $n = _chamarAsaas("$base/invoices/$idUrl", 'GET', $chave, null);
        $d = json_decode($n['body'], true);
        if ($n['status'] < 200 || $n['status'] >= 300 || !is_array($d)) { http_response_code($n['status'] >= 400 ? $n['status'] : 502); echo $n['body']; exit; }
        $u = isset($d['xmlUrl']) && is_string($d['xmlUrl']) ? $d['xmlUrl'] : '';
        $host = strtolower((string) parse_url($u, PHP_URL_HOST));
        $hostOk = $host !== '' && (preg_match('/(^|\.)asaas\.com$/D', $host) || preg_match('/\.amazonaws\.com$/D', $host));
        if (!preg_match('#^https://#i', $u) || !$hostOk || parse_url($u, PHP_URL_USER) || parse_url($u, PHP_URL_PORT)) {
            _nfceResponder(404, array('erro' => 'XML ainda não disponível para esta nota', 'codigo' => 'arquivo_indisponivel'));
        }
        $ch = curl_init($u);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 40);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if (defined('CURLOPT_PROTOCOLS'))       curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        if (defined('CURLOPT_REDIR_PROTOCOLS')) curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept: */*', 'User-Agent: DistribuiPro'));
        $xml = curl_exec($ch);
        $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if (!is_string($xml) || $xml === '' || $st < 200 || $st >= 300) _nfceResponder(502, array('erro' => 'Falha ao buscar o XML no Asaas'));
        header('Content-Type: application/xml; charset=utf-8');
        header("Content-Security-Policy: default-src 'none'");
        echo $xml;
        exit;
    } else { // nota_cancelar
        $url = "$base/invoices/$idUrl/cancel";
    }
    $r = _chamarAsaas($url, $post ? 'POST' : 'GET', $chave, $corpo);
    http_response_code($r['status']);
    echo $r['body'];
    exit;
}

function _chamarAsaas($url, $method, $chave, $body = null) {
    if (!function_exists('curl_init')) {
        return array('status' => 500, 'body' => json_encode(array('erro' => 'O PHP deste servidor está sem a extensão cURL.'), JSON_UNESCAPED_UNICODE));
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    if (defined('CURLOPT_PROTOCOLS')) curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    curl_setopt($ch, CURLOPT_HTTPHEADER, array(
        'Content-Type: application/json',
        'Accept: application/json',
        'User-Agent: DistribuiPro',
        'access_token: ' . $chave,
    ));
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, ($body !== null && $body !== '') ? $body : '{}');
    } else {
        curl_setopt($ch, CURLOPT_HTTPGET, true);
    }
    $responseBody = curl_exec($ch);
    $httpStatus   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError    = curl_error($ch);
    curl_close($ch);
    if ($curlError) {
        return array('status' => 502, 'body' => json_encode(array('erro' => 'Erro de conexão com o Asaas: ' . $curlError), JSON_UNESCAPED_UNICODE));
    }
    if ($httpStatus === 0) $httpStatus = 500;
    return array(
        'status' => $httpStatus,
        'body'   => (is_string($responseBody) && $responseBody !== '') ? $responseBody : json_encode(array('erro' => 'Resposta vazia'))
    );
}

// ── BASE BY ASAAS (39.10) ─────────────────────────────────────
// NFC-e e NF-e pelo pedido de venda do Base. Cada ação vira UM endereço fixo do Base; ids e filtros são conferidos aqui.
// O navegador sempre manda POST nas ações que gravam: o método do Base (POST, PUT ou DELETE) é escolhido aqui.
function _nfceBase($base, $acao, $metodo) {
    $chave = _nfceCabecalho('X-Base-Key');
    if ($chave === '') {
        _nfceResponder(401, array('erro' => 'Chave não enviada', 'mensagem' => 'A chave de API do Base by Asaas não chegou. Confira em Configurações → Fiscal.', 'codigo' => 'chave_ausente'));
    }
    if (!preg_match('/^[\x21-\x7E]{20,400}$/D', $chave)) {
        _nfceResponder(401, array('erro' => 'Chave inválida', 'mensagem' => 'A chave de API do Base by Asaas parece errada. Copie de novo em Configurações → Fiscal.', 'codigo' => 'chave_invalida'));
    }
    $id  = _nfceParam('id');
    $wid = _nfceParam('wid');
    $ref = _nfceParam('ref');
    $idem = _nfceParam('idem');
    if ($id !== '' && !preg_match('/^\d{1,20}$/D', $id)) _nfceResponder(400, array('erro' => 'Parâmetro id inválido', 'codigo' => 'id_invalido'));
    if ($wid !== '' && !preg_match('/^[A-Za-z0-9-]{1,64}$/D', $wid)) _nfceResponder(400, array('erro' => 'Parâmetro wid inválido', 'codigo' => 'id_invalido'));
    if ($ref !== '' && !preg_match('/^[A-Za-z0-9._-]{1,120}$/D', $ref)) _nfceResponder(400, array('erro' => 'Parâmetro ref inválido', 'codigo' => 'ref_invalida'));
    if ($idem !== '' && !preg_match('/^[A-Za-z0-9._-]{1,120}$/D', $idem)) _nfceResponder(400, array('erro' => 'Parâmetro idem inválido', 'codigo' => 'ref_invalida'));
    $comId = array('produto_atualizar', 'cliente_atualizar', 'pedido_consultar', 'pedido_remover', 'nota_emitir', 'nota_reemitir', 'nota_cancelar');
    if (in_array($acao, $comId, true) && $id === '') _nfceResponder(400, array('erro' => 'Parâmetro id é obrigatório', 'codigo' => 'id_ausente'));
    if (in_array($acao, array('aviso_atualizar', 'aviso_eventos'), true) && $wid === '') _nfceResponder(400, array('erro' => 'Parâmetro wid é obrigatório', 'codigo' => 'id_ausente'));
    $escrita = array('produto_criar', 'produto_atualizar', 'cliente_criar', 'cliente_atualizar', 'pedido_criar', 'pedido_remover', 'nota_emitir', 'nota_reemitir', 'nota_cancelar', 'aviso_criar', 'aviso_atualizar');
    $post = in_array($acao, $escrita, true);
    if ($post && $metodo !== 'POST') _nfceResponder(405, array('erro' => 'Método inválido'));
    $corpo = $post ? _nfceCorpo() : null;
    if ($post && $corpo !== '' && json_decode($corpo) === null) _nfceResponder(400, array('erro' => 'Body inválido'));
    $api = $base . '/api/v1';
    $verbo = 'GET';

    if ($acao === 'arquivo') {
        // PDF/XML da nota: o link vem do aviso do Base. Só HTTPS do Base (/link/download/...); a chave NÃO vai junto.
        $u = _nfceParam('url');
        if (!preg_match('#^https://([a-z0-9-]+\.)*baseerp\.com\.br/link/download/[A-Za-z0-9._~-]{10,3000}$#D', $u)) {
            _nfceResponder(400, array('erro' => 'Endereço do arquivo inválido', 'codigo' => 'url_invalida'));
        }
        if (!function_exists('curl_init')) _nfceResponder(500, array('erro' => 'O PHP deste servidor está sem a extensão cURL.'));
        $ch = curl_init($u);
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_TIMEOUT, 40);
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
        curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
        if (defined('CURLOPT_PROTOCOLS'))       curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
        if (defined('CURLOPT_REDIR_PROTOCOLS')) curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
        curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
        curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
        curl_setopt($ch, CURLOPT_HTTPHEADER, array('Accept: */*', 'User-Agent: DistribuiPro'));
        $arq = curl_exec($ch);
        $st = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
        $ct = (string) curl_getinfo($ch, CURLINFO_CONTENT_TYPE);
        curl_close($ch);
        if (!is_string($arq) || $arq === '' || $st < 200 || $st >= 300) _nfceResponder(502, array('erro' => 'Falha ao buscar o arquivo no Base by Asaas'));
        header('Content-Type: ' . (stripos($ct, 'pdf') !== false ? 'application/pdf' : 'application/xml; charset=utf-8'));
        header("Content-Security-Policy: default-src 'none'");
        echo $arq;
        exit;
    }

    if ($acao === 'bancos') {
        $url = "$api/banks?page=0&size=100" . (_nfceParam('asaas') === '1' ? '&onlyAsaas=true' : '');
    } elseif ($acao === 'produto_buscar') {
        $cod = _nfceTexto('codigo', 60);
        if ($ref !== '') $url = "$api/products?page=0&size=20&externalReference=" . rawurlencode($ref);
        elseif ($cod !== '') $url = "$api/products?page=0&size=20&code=" . rawurlencode($cod);
        else _nfceResponder(400, array('erro' => 'Informe ref ou codigo', 'codigo' => 'filtro_ausente'));
    } elseif ($acao === 'produto_criar') {
        $url = "$api/products"; $verbo = 'POST';
    } elseif ($acao === 'produto_atualizar') {
        $url = "$api/products/$id"; $verbo = 'PUT';
    } elseif ($acao === 'cliente_buscar') {
        $doc = strtoupper(preg_replace('/[^0-9A-Za-z]/', '', _nfceParam('cpfCnpj')));
        $nome = _nfceTexto('nome', 60);
        if ($doc !== '') {
            if (!preg_match('/^[0-9A-Z]{11,14}$/D', $doc)) _nfceResponder(400, array('erro' => 'CPF/CNPJ inválido', 'codigo' => 'documento_invalido'));
            $url = "$api/customers?page=0&size=20&cpfCnpj=$doc";
        } elseif ($ref !== '') $url = "$api/customers?page=0&size=20&externalReference=" . rawurlencode($ref);
        elseif ($nome !== '') $url = "$api/customers?page=0&size=20&name=" . rawurlencode($nome);
        else _nfceResponder(400, array('erro' => 'Informe cpfCnpj, ref ou nome', 'codigo' => 'filtro_ausente'));
    } elseif ($acao === 'cliente_criar') {
        $url = "$api/customers"; $verbo = 'POST';
    } elseif ($acao === 'cliente_atualizar') {
        $url = "$api/customers/$id"; $verbo = 'PUT';
    } elseif ($acao === 'pedido_buscar') {
        if ($ref === '') _nfceResponder(400, array('erro' => 'Parâmetro ref é obrigatório', 'codigo' => 'ref_ausente'));
        $url = "$api/salesOrders?page=0&size=20&externalReference=" . rawurlencode($ref);
    } elseif ($acao === 'pedido_criar') {
        $url = "$api/salesOrders"; $verbo = 'POST';
    } elseif ($acao === 'pedido_consultar') {
        $url = "$api/salesOrders/$id";
    } elseif ($acao === 'pedido_remover') {
        $url = "$api/salesOrders/$id"; $verbo = 'DELETE'; $corpo = null;
    } elseif ($acao === 'nota_emitir') {
        $url = "$api/salesOrders/$id/invoice"; $verbo = 'POST';
    } elseif ($acao === 'nota_reemitir') {
        $url = "$api/salesOrders/$id/invoiceReissue"; $verbo = 'PUT';
    } elseif ($acao === 'nota_cancelar') {
        $url = "$api/salesOrders/$id/invoiceCancel"; $verbo = 'PUT';
    } elseif ($acao === 'avisos') {
        $url = "$api/webhooks?offset=0&limit=100";
    } elseif ($acao === 'aviso_criar') {
        $url = "$api/webhooks"; $verbo = 'POST';
    } elseif ($acao === 'aviso_atualizar') {
        $url = "$api/webhooks/" . rawurlencode($wid); $verbo = 'PUT';
    } else { // aviso_eventos: os envios do webhook (o PDF, o XML e o motivo do erro da nota vêm neles)
        $off = max(0, min(100000, (int) _nfceParam('offset')));
        $lim = _nfceParam('limit') === '' ? 100 : max(1, min(100, (int) _nfceParam('limit')));
        $url = "$api/webhooks/" . rawurlencode($wid) . "/requests?offset=$off&limit=$lim";
    }
    $r = _chamarBase($url, $verbo, $chave, $corpo, $idem);
    http_response_code($r['status']);
    echo $r['body'];
    exit;
}

// Texto de filtro vindo da URL (sem caracteres de controle e com tamanho máximo)
function _nfceTexto($nome, $max) {
    $v = preg_replace('/[\x00-\x1F\x7F]+/', ' ', _nfceParam($nome));
    if (function_exists('mb_substr')) return trim(mb_substr($v, 0, $max, 'UTF-8'));
    return trim(substr($v, 0, $max));
}

function _chamarBase($url, $method, $chave, $body = null, $idem = '') {
    if (!function_exists('curl_init')) {
        return array('status' => 500, 'body' => json_encode(array('erro' => 'O PHP deste servidor está sem a extensão cURL.'), JSON_UNESCAPED_UNICODE));
    }
    $ch = curl_init($url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 40);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    if (defined('CURLOPT_PROTOCOLS')) curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, false);
    $cab = array('Content-Type: application/json', 'Accept: application/json', 'User-Agent: DistribuiPro', 'access_token: ' . $chave);
    if ($idem !== '') $cab[] = 'Idempotency-Key: ' . $idem;
    curl_setopt($ch, CURLOPT_HTTPHEADER, $cab);
    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, ($body !== null && $body !== '') ? $body : '{}');
    } elseif ($method === 'PUT') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'PUT');
        curl_setopt($ch, CURLOPT_POSTFIELDS, ($body !== null && $body !== '') ? $body : '{}');
    } elseif ($method === 'DELETE') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
    } else {
        curl_setopt($ch, CURLOPT_HTTPGET, true);
    }
    $responseBody = curl_exec($ch);
    $httpStatus   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError    = curl_error($ch);
    curl_close($ch);
    if ($curlError) {
        return array('status' => 502, 'body' => json_encode(array('erro' => 'Erro de conexão com o Base by Asaas: ' . $curlError), JSON_UNESCAPED_UNICODE));
    }
    if ($httpStatus === 0) $httpStatus = 500;
    // O Base responde sem corpo no 204 (pedido removido) e no 403 (chave recusada)
    $vazio = ($httpStatus >= 200 && $httpStatus < 300) ? json_encode(array('ok' => true)) : '{}';
    return array(
        'status' => $httpStatus,
        'body'   => (is_string($responseBody) && $responseBody !== '') ? $responseBody : $vazio
    );
}

// ── FUNÇÃO CURL ───────────────────────────────────────────────
// $arquivo = true: XML/DANFE (aceita qualquer tipo e segue até 3 redirecionamentos HTTPS da Focus;
// o cURL não repassa o token para outro endereço).
function _chamarFocusNfe($url, $method, $token, $body = null, $arquivo = false) {
    if (!function_exists('curl_init')) {
        return array('status' => 500, 'body' => json_encode(array('erro' => 'O PHP deste servidor está sem a extensão cURL.'), JSON_UNESCAPED_UNICODE));
    }
    $ch = curl_init($url);

    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_TIMEOUT, 30);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);
    if (defined('CURLOPT_PROTOCOLS'))       curl_setopt($ch, CURLOPT_PROTOCOLS, CURLPROTO_HTTPS);
    if (defined('CURLOPT_REDIR_PROTOCOLS')) curl_setopt($ch, CURLOPT_REDIR_PROTOCOLS, CURLPROTO_HTTPS);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, (bool) $arquivo);
    if ($arquivo) curl_setopt($ch, CURLOPT_MAXREDIRS, 3);
    curl_setopt($ch, CURLOPT_UNRESTRICTED_AUTH, false);
    curl_setopt($ch, CURLOPT_HTTPAUTH, CURLAUTH_BASIC);
    curl_setopt($ch, CURLOPT_USERPWD, $token . ':');
    curl_setopt($ch, CURLOPT_HTTPHEADER, $arquivo ? array('Accept: */*') : array(
        'Content-Type: application/json',
        'Accept: application/json',
    ));

    if ($method === 'POST') {
        curl_setopt($ch, CURLOPT_POST, true);
        if ($body !== null && $body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } elseif ($method === 'DELETE') {
        curl_setopt($ch, CURLOPT_CUSTOMREQUEST, 'DELETE');
        if ($body !== null && $body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    } else {
        curl_setopt($ch, CURLOPT_HTTPGET, true);
    }

    $responseBody = curl_exec($ch);
    $httpStatus   = (int) curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curlError    = curl_error($ch);
    curl_close($ch);

    if ($curlError) {
        return array(
            'status' => 502,
            'body'   => json_encode(array('erro' => 'Erro de conexão com Focus NFe: ' . $curlError), JSON_UNESCAPED_UNICODE)
        );
    }

    // Garantir que o status seja válido
    if ($httpStatus === 0) $httpStatus = 500;

    return array(
        'status' => $httpStatus,
        'body'   => (is_string($responseBody) && $responseBody !== '') ? $responseBody : json_encode(array('erro' => 'Resposta vazia'))
    );
}
