<?php

// Log para verificar se o config.php está sendo carregado
if (function_exists('log_data_ajax')) {
    log_data_ajax('Início da execução do config.php correto');
}

// Log após incluir fast_config.php
if (function_exists('log_data_ajax')) {
    log_data_ajax('Incluindo fast_config.php');
}
include('fast_config.php');
if (function_exists('log_data_ajax')) {
    log_data_ajax('fast_config.php incluído com sucesso');
}

set_time_limit(90);

ob_start();

// Debug
if (function_exists('log_data_ajax')) {
    log_data_ajax('Configurando relatórios de erro');
}
error_reporting(0);

// Time
if (function_exists('log_data_ajax')) {
    log_data_ajax('Configurando timezone');
}
date_default_timezone_set('America/Sao_Paulo');

// Url
if (function_exists('log_data_ajax')) {
    log_data_ajax('Configurando URLs');
}
$httprotocol = "https://";

if( !$_SERVER['HTTPS'] ) {
	$fixprotocol = 'https://'.$_SERVER['HTTP_HOST'].$_SERVER['REQUEST_URI'];
	header("Location: ".$fixprotocol);
}

// Log após configurar URLs
if (function_exists('log_data_ajax')) {
    log_data_ajax('URLs configuradas com sucesso');
}

$suport_url = $httprotocol."conheca.$dominio/#contato";
$system_url = $httprotocol."$dominio/administracao";
$panel_url = $httprotocol."$dominio/painel";
$admin_url = $httprotocol."$dominio/administracao";
$just_url = $httprotocol."$dominio";
$app_url = $httprotocol."$dominio/app";
$simple_url = "$dominio";
$afiliado_url = $httprotocol."$dominio/afiliado";

// Comissão Afiliados
$comissao_afiliados = "40";

// Title

$seo_title = "$nome_loja";
$seo_description = "Compre sem sair de casa!";
//$titulo_topo = "Velox Imports<strong>.</strong>"; //TITULO DA LOGO PARA USAR TITULO INVES DE IMAGEM TIRAR OS // DO COMEÇO E COLOCAR NO DE BAIXO 
$titulo_topo = '<img src="/_core/_cdn/img/logo.png">'; //US4R LOGO INVES DE TITUL5
$titulo_rodape ="$nome_loja";
$sub_titulo_rodape ="O CATÁLOGO VIRTUAL DESCOMPLICADO!"; //Endereço ou Slogan
$titulo_rodape_marketplace ="$nome_loja, Compre sem sair de casa!"; //Endereço ou Slogan


// Redes/Whatsapp/Email
$whatsapp = $numero_whatsapp;
$usrtelefone = $numero_whatsapp;
$email ="#";
$youtube ="#";
$instagram="#";
$facebook ="#";

// Db

$db_host = "$fast_db_host";
$db_user = "$fast_db_user";
$db_pass = "$fast_db_pass";
$db_name = "$fast_db_name";

// SMTP

$smtp_name = "$nome_loja";
$smtp_user = "SEUEMAIL@gmail.com";
$smtp_pass = "(-eFF%.Ci}J8";

// Manunten

$manutencao = false;

if( $manutencao ) {

	include("manutencao.php");
	die;

}

// Includes

include("functions.php");

// Tokens


// Recaptcha
// Gerar em: https://www.google.com/recaptcha/admin/
$recaptcha_sitekey = "$fast_recaptcha_sitekey";
$recaptcha_secretkey = "$fast_recaptcha_secretkey";

//External token Utilizado para receber os callbacks do mercado pago pro sistema, pode manter padr
$external_token = "$fast_external_token";

// Mercado pago
// Gerar em: https://www.mercadopago.com.br/developers/panel/credentials
$mp_sandbox = false;

if ($mp_sandbox == true) {
	$mp_public_key = "$fast_mp_public_key";
	$mp_acess_token = "$fast_mp_acess_token";
} else {
	$mp_public_key = "$fast_mp_public_key";
	$mp_acess_token = "$fast_mp_acess_token";
	$mp_client_id = "$fast_mp_client_id";
	$mp_client_secret = "$fast_mp_client_secret";
}

// Plano padr (id)

$plano_default = "$fast_plano_default";

// Root path

$rootpath = $_SERVER["DOCUMENT_ROOT"];

// Images

$image_max_width = 1000;
$image_max_height = 1000;
$gallery_max_files  = 10;

// Global header and footer

$system_header = "";
$system_footer = "";

// Keep Alive
if( $_SESSION['user']['logged'] == "1" && strlen( $_SESSION['user']['keepalive'] ) >= 10 && $_SESSION['user']['keepalive'] != $_COOKIE['keepalive'] ) {
	setcookie( 'keepalive', "kill", time() - 3600 );
	if( strlen( $_SESSION['user']['keepalive'] ) >= 10 ) {
		setcookie( 'keepalive', $_SESSION['user']['keepalive'], (time() + (120 * 24 * 3600)) );
	}
}

$keepalive = $_COOKIE['keepalive'];

if( $_SESSION['user']['logged'] != "1" && strlen( $keepalive ) >= 10 ) {

	make_login($keepalive,"","keepalive","2");

}

function ajusta_brilho($cor, $mudanca) {
    $cor = ltrim($cor, '#');
    if(strlen($cor) == 3) {
        $cor = $cor[0].$cor[0].$cor[1].$cor[1].$cor[2].$cor[2];
    }
    $r = hexdec(substr($cor, 0, 2));
    $g = hexdec(substr($cor, 2, 2));
    $b = hexdec(substr($cor, 4, 2));
    
    $r = max(0, min(255, $r + $mudanca));
    $g = max(0, min(255, $g + $mudanca));
    $b = max(0, min(255, $b + $mudanca));
    
    return '#'.str_pad(dechex($r), 2, '0', STR_PAD_LEFT)
              .str_pad(dechex($g), 2, '0', STR_PAD_LEFT)
              .str_pad(dechex($b), 2, '0', STR_PAD_LEFT);
}

// Log para indicar que o config.php foi carregado com sucesso
if (function_exists('log_data_ajax')) {
    log_data_ajax('Config.php correto carregado com sucesso');
}

?>




