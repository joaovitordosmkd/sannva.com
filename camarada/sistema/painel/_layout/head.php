<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no">
    <title><?php seo( "title" ); ?></title>
    <meta name="description" content="<?php seo( "description" ); ?>">
    <meta name="keywords" content="<?php seo( "keywords" ); ?>">
    <link rel="shortcut icon" href="<?php just_url(); ?>/_core/_cdn/img/favicon.png"/>
    <link href="<?php just_url(); ?>/_core/_cdn/img/favicon.png" rel="icon">
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
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/spectrum/css/spectrum.min.css">
    <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@100;200;300;400;500;600;700;800;900&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/sidr/css/jquery.sidr.light.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/steps/css/jquery.steps.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/_core/_cdn/multiUpload/css/image-uploader.min.css">
    <link rel="stylesheet" href="<?php just_url(); ?>/painel/_layout/style.php?id=<?php echo $_SESSION['estabelecimento']['id']; ?>">
    <link href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/5.10.0/css/all.min.css" rel="stylesheet">
    <script src="//cdn.jsdelivr.net/npm/sweetalert2@11"></script>
    <script src="https://ajax.googleapis.com/ajax/libs/jquery/3.5.1/jquery.min.js"></script>

    <?php system_header(); ?>

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