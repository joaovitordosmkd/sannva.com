<?php
//include('/_layout/define.php');
include('../../_config/_includ/config.php');

// Sanitização das entradas GET
$chave = htmlspecialchars($_GET['chave']);
$titular = htmlspecialchars($_GET['titular']);
$valor = htmlspecialchars($_GET['valor-pedido']);
$eid = htmlspecialchars($_GET['eid']);

include "../../app/estabelecimento/phpqrcode/qrlib.php";
include "../../app/estabelecimento/funcoes_pix.php";

// Geração do código Pix
$px = [
    "00" => "01",
    // "01" => "12", // Descomente para pagamento único
    "26" => [
        "00" => "br.gov.bcb.pix",
        "01" => $chave,
        // "02" => "Descricao",
    ],
    "52" => "0000",
    "53" => "986",
    "54" => $valor,
    "58" => "BR",
    "59" => $titular,
    "60" => "sp",
    "62" => [
        "05" => "***"
    ]
];

$pix = montaPix($px);
$pix .= "6304";
$pix .= crcChecksum($pix);

// Geração do QR Code
ob_start();
QRCode::png($pix, null, 'M', 5);
$imageString = base64_encode(ob_get_contents());
ob_end_clean();
?>

<p class="qrcode-pix-title">QRCode do Pix</p>
<p style="width: 100%; text-align: center;">
    <img src="data:image/png;base64,<?= $imageString ?>">
</p>

<textarea><?= $pix ?></textarea>

<style>
    /* Estilos removidos para brevidade */
</style>

<script src="../../_config/_dad/clipboard/clipboard.js"></script>
<a href="#pixqrcode" id="copy-button" data-clipboard-text="<?= htmlspecialchars($pix); ?>">
    <span>
        <i class="lni lni-clipboard"></i> Clique aqui para copiar o codigo PIX acima
    </span>
</a>
