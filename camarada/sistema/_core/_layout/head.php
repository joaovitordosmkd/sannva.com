<?php
global $app;
global $seo_subtitle;
global $seo_description;
global $seo_keywords;
global $seo_image;
$insubdominiourl = array_shift((explode('.', $_SERVER['HTTP_HOST'])));
?>
<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title><?php seo( "title" ); ?></title>
    <meta name="description" content="<?php seo( "description" ); ?>">
    <meta name="keywords" content="<?php seo( "keywords" ); ?>">
    <meta property="og:title" content="<?php echo seo_app( $seo_subtitle ); ?>">
    <meta property="og:description" content="<?php echo $seo_description; ?>">
    <meta property="og:image" content="<?php just_url(); ?>/_core/_cdn/img/favicon.png">
    <link rel="shortcut icon" href="<?php just_url(); ?>/_core/_cdn/img/favicon.png"/>
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/bootstrap/css/bootstrap.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/class.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/forms.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/typography.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/template.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/theme.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/panel/css/default.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/lineicons/css/LineIcons.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/avatarPreview/css/filepreview.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/autocomplete/css/autocomplete.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/sidr/css/jquery.sidr.light.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/steps/css/jquery.steps.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/multiUpload/css/image-uploader.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/datepicker/css/bootstrap-datepicker.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/spectrum/css/spectrum.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/fonts/style.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/fonts/logo/logofont.css">

    <?php system_header(); ?>
    


<style>
/* Reset básico */
body, html {
    margin: 0;
    padding: 0;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    background: #f7f9fb;
    color: #333;
}

/* Estilo do container principal */
.container {
    max-width: 1000px;
    margin: 30px auto;
    padding: 20px;
    background: #fff;
    border-radius: 12px;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.05);
}

/* Título da página */
h1, h2 {
    text-align: center;
    margin-bottom: 30px;
    color: #2c3e50;
}

/* Tabela */
table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 0 0 1px #eee;
}

th, td {
    padding: 15px;
    text-align: center;
    border-bottom: 1px solid #f0f0f0;
}

th {
    background-color: #f0f4f8;
    color: #333;
    font-weight: 600;
}

tr:hover {
    background-color: #f9fcff;
}

/* Botões */
.btn {
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 500;
    transition: all 0.3s ease;
    border: none;
}

.btn-primary {
    background-color: #3498db;
    color: #fff;
}

.btn-primary:hover {
    background-color: #2980b9;
}

.btn-success {
    background-color: #27ae60;
    color: #fff;
}

.btn-success:hover {
    background-color: #1e8449;
}

.btn-warning {
    background-color: #f39c12;
    color: #fff;
}

.btn-warning:hover {
    background-color: #d68910;
}

/* Alerta de sucesso */
.alert-custom {
    background-color: #e6ffed;
    border-left: 5px solid #27ae60;
    color: #2e7d32;
    padding: 15px;
    border-radius: 8px;
    margin: 20px auto;
    max-width: 600px;
    text-align: center;
    font-weight: 500;
    box-shadow: 0 4px 10px rgba(0, 0, 0, 0.04);
}

/* Modal */
.modal-content {
    border-radius: 12px;
    border: none;
}

.modal-header {
    background-color: #3498db;
    color: #fff;
    border-top-left-radius: 12px;
    border-top-right-radius: 12px;
}

.modal-footer {
    border-top: none;
    justify-content: space-between;
}

/* Input */
input[type="text"], textarea {
    width: 100%;
    padding: 10px 15px;
    border: 1px solid #ccc;
    border-radius: 8px;
    transition: border-color 0.3s;
    font-size: 15px;
}

input[type="text"]:focus,
textarea:focus {
    border-color: #3498db;
    outline: none;
    box-shadow: 0 0 0 2px rgba(52, 152, 219, 0.2);
}

/* Rodapé opcional */
.footer {
    margin-top: 30px;
    text-align: center;
    font-size: 14px;
    color: #999;
}

/* Responsivo */
@media (max-width: 768px) {
    th, td {
        font-size: 14px;
        padding: 10px;
    }

    .btn {
        padding: 6px 12px;
        font-size: 13px;
    }
}
</style>



  </head>
  <body>

  <div class="processing">

    <div class="fullfit align">

        <div class="center">

            <i class="lni lni-reload rotating"></i>
            <span>
                Processando seu pedido...<br/>
                Por favor aguarde!
            </span>

        </div>

    </div>

  </div>

  <?php

  if( $_GET['afiliado'] ) {
    $_SESSION['afiliado'] = mysqli_real_escape_string( $db_con, $_GET['afiliado'] );
  }

  ?>