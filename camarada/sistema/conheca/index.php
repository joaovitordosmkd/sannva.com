<?php include('../_core/_includes/config.php'); 

global $plano_default;

// Consulta SQL para selecionar o link do video_landing
$query_video_landing = mysqli_query($db_con, "SELECT link FROM link WHERE nome='video_landing'");
$datalink_video_landing = mysqli_fetch_array($query_video_landing);
$link_video_landing = $datalink_video_landing['link'];
    
?>

<!DOCTYPE html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta content="width=device-width, initial-scale=1.0" name="viewport">
<title><?php echo $nome_loja; ?> - O seu catálogo Online de produtos e serviços. A melhor escolha.</title>
<meta name=description content="Crie seu catálogo online de produtos com pedidos via WhatsApp. Simples, rápido e integrado com whatsapp, facebook e instagran." />
<meta name=keywords content="catalogo online, catalogo digital, catalogo online, cardapio online, catalogo via whatsapp, cardapios online, app de cardapio" />
<meta name=resource-type content=document />
<meta name=revisit-after content=1 />
<meta name=distribution content=Global />
<meta name=rating content=General />
<meta name=author content="<?php echo $nome_loja; ?> - Catálogo Online de Produtos" />
<meta name=language content=pt-br />
<meta name=doc-class content=Completed />
<meta name=doc-rights content=Public />
<meta name=Subject content="Crie seu catálogo online de produtos com pedidos via WhatsApp." />
<meta name=audience content=all />
<meta name=robots content="index,follow" />
<meta name=googlebot content=all />
<meta name=copyright content="<?php echo $nome_loja; ?> - Catálogo Online de Produtos" />
<meta name=url content="https://<?php echo $simple_url; ?>" />
<meta name=audience content=all />
<meta property="og:url" content="https://<?php echo $simple_url; ?>/" />
<meta property="og:type" content="website" />
<meta property="og:title" content="<?php echo $nome_loja; ?> - O seu catálogo Online de produtos e serviços. Crie o seu agora mesmo." />
<meta property="og:description" content="Crie seu catálogo online de produtos com pedidos via WhatsApp. <?php echo $nome_loja; ?>!" />
<meta property="og:image" content="https://conheca.<?php echo $simple_url; ?>/assets/img/favicon.png" />
<link href="https://conheca.<?php echo $simple_url; ?>/assets/img/favicon.png" rel="icon">
<link href="https://conheca.<?php echo $simple_url; ?>/assets/img/apple-touch-icon.png" rel="apple-touch-icon">
<link href="https://fonts.googleapis.com/css?family=Open+Sans:300,300i,400,400i,600,600i,700,700i|Montserrat:300,300i,400,400i,500,500i,600,600i,700,700i|Poppins:300,300i,400,400i,500,500i,600,600i,700,700i" rel="stylesheet">
<link href="assets/vendor/aos/aos.css" rel="stylesheet">
<link href="assets/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
<link href="assets/vendor/bootstrap-icons/bootstrap-icons.css" rel="stylesheet">
<link href="assets/vendor/boxicons/css/boxicons.min.css" rel="stylesheet">
<link href="assets/vendor/glightbox/css/glightbox.min.css" rel="stylesheet">
<link href="assets/vendor/remixicon/remixicon.css" rel="stylesheet">
<link href="assets/vendor/swiper/swiper-bundle.min.css" rel="stylesheet">
<link href="assets/css/style.css" rel="stylesheet">   
<style>
    /* Estilos adicionais mantendo a estrutura original */
    .testimonials {
        padding: 80px 0;
    }
    .testimonial-item {
        background: #fff;
        border-radius: 10px;
        padding: 30px;
        margin-bottom: 30px;
        box-shadow: 0 5px 15px rgba(0,0,0,0.05);
    }
    .stars {
        color: #ffc107;
        margin-bottom: 15px;
    }
    .testimonial-img {
        width: 80px;
        height: 80px;
        border-radius: 50%;
        object-fit: cover;
        margin-right: 15px;
    }
    .automation-section {
        background: #f8f9fa;
        padding: 80px 0;
    }
</style>
</head>
<body>
<header id="header" class="fixed-top d-flex align-items-center header-transparent">
    <div class="container d-flex align-items-center justify-content-between">
        <div class="logo">
            <a href="index.html">
                <img src="assets/img/logowhite.png" alt="" class="img-fluid">
            </a>
        </div>
        <nav id="navbar" class="navbar">
            <ul>
                <li><a class="nav-link scrollto active" href="#hero">Inicial</a></li>
                <li><a class="nav-link scrollto" href="#about">Passo a Passo</a></li>
                <li><a class="nav-link scrollto" href="#features">Funcionalidades</a></li>
                <li><a class="nav-link scrollto" href="#testimonials">Depoimentos</a></li>
                <li><a class="nav-link scrollto" href="#automation">Automação</a></li>
                <li><a class="nav-link scrollto" href="#faq">Dúvidas</a></li>
                <li><a class="nav-link scrollto" href="#pricing">Contrate</a></li>
                <li><a class="nav-link scrollto" href="#contact">Contato</a></li>
            </ul> 
            <i class="bi bi-list mobile-nav-toggle"></i>
        </nav>
    </div>
</header>

<section id="hero">
    <div class="container">
        <div class="row justify-content-between">
            <div class="col-lg-7 pt-5 pt-lg-0 order-2 order-lg-1 d-flex align-items-center">
                <div data-aos="zoom-out">
                    <h1>Comece a vender pela internet <span>hoje mesmo</span></h1>
                    <h2>Tenha um cardápio ou catálogo digital conectado com seu Facebook, WhatsApp e Instagram, com nossas mais de 30 funcionalidades, temos a solução completa para você!</h2>
                    <div class="text-center text-lg-start"> 
                        <a href="https://<?php echo $simple_url; ?>/comece" class="btn-get-started scrollto">Criar Conta</a>
                    </div>
                </div>
            </div>
            <div class="col-lg-4 order-1 order-lg-2 hero-img" data-aos="zoom-out" data-aos-delay="300">
                <img src="assets/img/hero-img.png" class="img-fluid animated" alt="">
            </div>
        </div>
    </div>
    <svg class="hero-waves" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" viewBox="0 24 150 28 " preserveAspectRatio="none">
        <defs>
            <path id="wave-path" d="M-160 44c30 0 58-18 88-18s 58 18 88 18 58-18 88-18 58 18 88 18 v44h-352z"></path>
        </defs>
        <g class="wave1">
            <use xlink:href="#wave-path" x="50" y="3" fill="rgba(255,255,255, .1)"></use>
        </g>
        <g class="wave2">
            <use xlink:href="#wave-path" x="50" y="0" fill="rgba(255,255,255, .2)"></use>
        </g>
        <g class="wave3">
            <use xlink:href="#wave-path" x="50" y="9" fill="#fff"></use>
        </g>
    </svg>
</section>



<main id="main">
    <section id="about" class="about">
        <div class="container-fluid">
            <div class="row">
                <?php
                // Tratamento do vídeo
                $video_embed = '';
                $link = $link_video_landing;

                if (strpos($link, 'youtube.com/watch') !== false || strpos($link, 'youtu.be') !== false) {
                    parse_str(parse_url($link, PHP_URL_QUERY), $yt_params);
                    $video_id = isset($yt_params['v']) ? $yt_params['v'] : basename(parse_url($link, PHP_URL_PATH));
                    $video_embed = '<iframe width="100%" height="315" src="https://www.youtube.com/embed/' . $video_id . '?autoplay=1" frameborder="0" allowfullscreen></iframe>';
                } elseif (strpos($link, 'youtube.com/embed') !== false) {
                    $video_embed = '<iframe width="100%" height="315" src="' . $link . '?autoplay=1" frameborder="0" allowfullscreen></iframe>';
                } elseif (preg_match('/\.(mp4|webm|ogg)$/', $link)) {
                    $ext = pathinfo($link, PATHINFO_EXTENSION);
                    $video_embed = '<video width="100%" height="315" controls autoplay><source src="' . $link . '" type="video/' . $ext . '">Seu navegador não suporta vídeo HTML5.</video>';
                } else {
                    $video_embed = '<p style="color: red;">Formato de vídeo não suportado.</p>';
                }

                // Caminho da imagem de miniatura padrão
                $thumbnail_path = 'assets/img/miniatura.png';
                ?>

                <div class="col-xl-5 col-lg-6 video-box d-flex justify-content-center align-items-center" data-aos="fade-right">
                    <div id="video-container" style="width: 100%; cursor: pointer;">
                        <img src="<?php echo $thumbnail_path; ?>" alt="Miniatura do Vídeo" style="width: 100%; height: auto; border-radius: 8px;">
                    </div>
                </div>

                <div class="col-xl-7 col-lg-6 icon-boxes d-flex flex-column align-items-stretch justify-content-center py-5 px-lg-5" data-aos="fade-left">
                    <h3>São 3 passos simples para você automatizar as suas vendas e impulsionar seu negócio.</h3>
                    <p>Um cardápio ou catálogo digital para você vender mais de forma simples, descomplicada, conectado com seu WhatsApp e Instagram sem taxas e sem intermediários.</p>

                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="100">
                        <div class="icon"><i class='bx bx-store'></i></div>
                        <h4 class="title"><a href="#">Crie sua conta</a></h4>
                        <p class="description">Personalize seu cardápio ou catálogo de acordo com seu negócio, produto ou serviço. Crie um link personalizado, cores, marca e identidade própria.</p>
                    </div>

                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="200">
                        <div class="icon"><i class='bx bxs-t-shirt'></i></div>
                        <h4 class="title"><a href="#">Cadastre seus produtos</a></h4>
                        <p class="description">Crie as categorias, produtos e variações, taxas, formas de pagamentos, fotos e muito mais de acordo com a sua necessidade.</p>
                    </div>

                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="300">
                        <div class="icon"><i class='bx bx-link-alt'></i></div>
                        <h4 class="title"><a href="#">Comece a usar</a></h4>
                        <p class="description">Agora é só divulgar o link do seu cardápio ou catálogo nas suas redes sociais e alavancar ainda mais as suas vendas.</p>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <script>
    document.getElementById('video-container').addEventListener('click', function() {
        this.innerHTML = `<?php echo $video_embed; ?>`;
    });
    </script>
</main>


    
    

    <section id="features" class="features">
        <div class="container">
            <div class="section-title" data-aos="fade-up">
                <h2>WebApp <?php echo $nome_loja; ?></h2>
                <p>Todas as funcionalidades que você precisa</p>
            </div>
            <div class="row" data-aos="fade-left">
                <div class="col-lg-3 col-md-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="50"> 
                        <i class='bx bxl-whatsapp' style="color:#009900;"></i>
                        <h3><a href="">Link no WhatsApp</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4 mt-md-0">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="100"> 
                        <i class='bx bxl-facebook' style="color: #5578ff;"></i>
                        <h3><a href="">No Facebook</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4 mt-md-0">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="150"> 
                        <i class='bx bxl-instagram' style="color: #e80368;"></i>
                        <h3><a href="">No Instagram</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4 mt-lg-0">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="200"> 
                        <i class="ri-paint-brush-line" style="color: #e361ff;"></i>
                        <h3><a href="">Cores Personalizadas</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="250"> 
                        <i class='bx bx-link' style="color:#CC3300;"></i>
                        <h3><a href="">URL exclusiva</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="300"> 
                        <i class='bx bx-shape-square' style="color: #ffa76e;"></i>
                        <h3><a href="">Produtos e Variações</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="350"> 
                        <i class='bx bxs-cart-add' style="color: #11dbcf;"></i>
                        <h3><a href="">Cesta de Compras</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="400"> 
                        <i class='bx bxs-file-image' style="color: #4233ff;"></i>
                        <h3><a href="">Galeria de Fotos</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="450"> 
                        <i class='bx bxs-devices' style="color: #b2904f;"></i>
                        <h3><a href="">100% responsivo</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="500"> 
                        <i class='bx bxs-offer' style="color: #b20969;"></i>
                        <h3><a href="">Produtos em Oferta</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="550"> 
                        <i class="ri-base-station-line" style="color: #ff5828;"></i>
                        <h3><a href="">Pedido no Whats</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bxs-shopping-bags' style="color: #29cc61;"></i>
                        <h3><a href="">PWA Automático</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-qr' style="color: #FF0000;"></i>
                        <h3><a href="">QR-Code Empresa</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-qr-scan' style="color: #9966CC;"></i>
                        <h3><a href="">QR-Code de Atendimento</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-checkbox-checked' style="color: #CCCC33;"></i>
                        <h3><a href="">Painel de Pedidos</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-health' style="color: #666666;"></i>
                        <h3><a href="">Pagamento via PIX</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-bell' style="color: #FFA500;"></i>
                        <h3><a href="">Alerta de Novos Pedidos</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-credit-card' style="color: #0099CC;"></i>
                        <h3><a href="">Pagamento com Mercado Pago</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-store' style="color: #663399;"></i>
                        <h3><a href="">PDV Nativo</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-truck' style="color: #339933;"></i>
                        <h3><a href="">Cálculo de Frete</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-bike' style="color: #FF6600;"></i>
                        <h3><a href="">Sistema de Delivery</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-map' style="color: #0066CC;"></i>
                        <h3><a href="">Rastreamento de Encomendas</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-gift' style="color: #FF3399;"></i>
                        <h3><a href="">Cupons</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-stats' style="color: #993366;"></i>
                        <h3><a href="">Relatórios</a></h3>
                    </div>
                </div>
                <div class="col-lg-3 col-md-4 mt-4">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="600"> 
                        <i class='bx bx-support' style="color: #333333;"></i>
                        <h3><a href="">Suporte Técnico</a></h3>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <section id="counts" class="counts">
        <div class="container">
            <div class="section-title" data-aos="fade-up">
                <h2>Lojas Demo</h2>
                <p>Conheça alguns exemplos de lojas usando nossa plataforma</p>
            </div>
            <div class="row" data-aos="fade-up">
                <div class="col-lg-3 col-md-6">
                    <a href="https://shopburge.<?php echo $simple_url; ?>" target="_blank">
                        <div class="count-box">
                            <img src="https://shopburger.<?php echo $simple_url; ?>/_core/_uploads/186/2023/02/10012702235j4bejba4k_thumb.png" width="150" class="img-fluid">
                            <h4>Hamburgueria</h4>
                        </div>
                    </a>
                </div>
                <div class="col-lg-3 col-md-6 mt-5 mt-md-0">
                    <a href="https://demo2.<?php echo $simple_url; ?>" target="_blank">
                        <div class="count-box">
                            <img src="https://demo2.<?php echo $simple_url; ?>/_core/_uploads/28/2020/09/0058190920dedg383f0b_thumb.jpg" width="150" class="img-fluid">
                            <h4>Beaut Boutique</h4>
                        </div>
                    </a>
                </div>
                <div class="col-lg-3 col-md-6 mt-5 mt-lg-0">
                    <a href="https://motorcycle.<?php echo $simple_url; ?>" target="_blank">
                        <div class="count-box">
                            <img src="https://motorcycle.<?php echo $simple_url; ?>/_core/_uploads/153/2023/02/142621022308efh6813k_thumb.png" width="150" class="img-fluid">
                            <h4>Motorcycle</h4>
                        </div>
                    </a>
                </div>
                <div class="col-lg-3 col-md-6 mt-5 mt-lg-0">
                    <a href="https://demo4.<?php echo $simple_url; ?>" target="_blank">
                        <div class="count-box">
                            <img src="https://demo4.<?php echo $simple_url; ?>/_core/_uploads/39/2021/11/1453271121bhhke2bgkg_thumb.jpg" width="150" class="img-fluid">
                            <h4>O PetShop</h4>
                        </div>
                    </a>
                </div>
            </div>
        </div>
    </section>

    <!-- Nova Seção: Depoimentos -->
    <section id="testimonials" class="testimonials">
        <div class="container">
            <div class="section-title" data-aos="fade-up">
                <h2>Depoimentos</h2>
                <p>O que nossos clientes dizem</p>
            </div>
            <div class="row">
                <div class="col-lg-4 col-md-6" data-aos="fade-up" data-aos-delay="100">
                    <div class="testimonial-item">
                        <div class="stars">
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                        </div>
                        <p>
                            "Minhas vendas aumentaram 70% depois que comecei a usar o catálogo digital. Os clientes adoram a facilidade de pedir pelo WhatsApp!"
                        </p>
                        <div class="profile mt-auto">
                            <img src="assets/img/ana.png" class="testimonial-img" alt="Ana Silva">
                            <h3>Ana Silva</h3>
                            <h4>Boutique de Moda</h4>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6" data-aos="fade-up" data-aos-delay="200">
                    <div class="testimonial-item">
                        <div class="stars">
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                        </div>
                        <p>
                            "O sistema é incrivelmente fácil de usar. Em menos de 1 hora já tinha meu cardápio online funcionando e recebendo pedidos."
                        </p>
                        <div class="profile mt-auto">
                            <img src="assets/img/carlos.png" class="testimonial-img" alt="Carlos Oliveira">
                            <h3>Carlos Oliveira</h3>
                            <h4>Restaurante</h4>
                        </div>
                    </div>
                </div>
                <div class="col-lg-4 col-md-6" data-aos="fade-up" data-aos-delay="300">
                    <div class="testimonial-item">
                        <div class="stars">
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star-fill"></i>
                            <i class="bi bi-star"></i>
                        </div>
                        <p>
                            "A integração com Instagram foi o que mais me surpreendeu. Agora meus seguidores podem comprar sem sair do app. Recomendo muito!"
                        </p>
                        <div class="profile mt-auto">
                            <img src="assets/img/mariano.png" class="testimonial-img" alt="Mariana Costa">
                            <h3>Mariano Costa</h3>
                            <h4>Loja de Cosméticos</h4>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- Nova Seção: Automação -->
    <!--<section id="automation" class="automation-section">
        <div class="container">
            <div class="row">
                <div class="col-lg-6 d-flex flex-column justify-content-center" data-aos="fade-right">
                    <div class="content">
                        <h3>Automação Inteligente</h3>
                        <h2>Atendimento Automático via WhatsApp com IA</h2>
                        <p>
                           Com Nosso programa de agentes ia agora também podemos te oferecer, um assistente virtual inteligente que atende seus clientes 24 horas por dia diretamente no WhatsApp, sem que você precise ficar online o tempo todo.
                        </p>
                        <ul>
                            <li><i class="bi bi-check-circle-fill"></i> Responde perguntas frequentes sobre produtos</li>
                            <li><i class="bi bi-check-circle-fill"></i> Envia o catálogo automaticamente</li>
                            <li><i class="bi bi-check-circle-fill"></i> Recomenda produtos & envia link de compra</li>
                            <li><i class="bi bi-check-circle-fill"></i> Encaminha para atendimento humano quando necessário</li>
                        </ul>
                        <div class="text-center text-lg-start">
                            <a href="#contact" class="btn-get-started scrollto">Saiba Mais</a>
                        </div>
                    </div>
                </div>
                <div class="col-lg-6" data-aos="fade-left">
                    <img src="assets/img/agenteia.png" class="img-fluid" alt="Chat Automático WhatsApp">
                </div>
            </div>
        </div>
    </section>-->

    <section id="pricing" class="pricing">
        <div class="container">
            <div class="section-title" data-aos="fade-up">
                <h2>Planos</h2>
                <p>Escolha o plano ideal para o seu negócio</p>
            </div>
            <div class="row" data-aos="fade-left">
                <?php
                $query = "";
                $query .= "SELECT * FROM planos ";
                $query .= "WHERE 1=1 ";
                $query .= "AND status = '1' AND visible = '1' ";
                $query_full = $query;
                $query .= "ORDER BY ordem ASC";

                $sql = mysqli_query( $db_con, $query );
                $total_results = mysqli_num_rows( $sql );

                $firstPlan = true; // Variável de controle para o primeiro plano

                while ( $data = mysqli_fetch_array( $sql ) ) {
                ?>
                <div class="col-lg-3 col-md-6">
                    <div class="box" data-aos="zoom-in" data-aos-delay="100">
                        <span class="advanced <?php echo $firstPlan ? '' : 'd-none'; ?>"><?php echo $data['nome']; ?></span>
                        <h3><?php echo $data['nome']; ?></h3>
                        <h4 class="<?php echo $firstPlan ? 'd-none' : ''; ?>"><sup>R$</sup><?php echo dinheiro( $data['valor_mensal'], "BR" ); ?> <sub>/mês</sub></h4>
                        <h4 class="<?php echo $firstPlan ? '' : 'd-none'; ?>"><?php echo data_info( "planos",$plano_default,"duracao_dias" ); ?> <sub>dias grátis</sub></h4>
                        
                        <h6 class="align-left <?php echo $firstPlan ? 'd-none' : ''; ?>">R$<?php echo dinheiro( $data['valor_total'], "BR" ); ?> <sub>no total</sub></h6>
                        <br/>

                        <ul>
                            <?php
                            $descricao = $data['descricao'];
                            $linhas = explode("\n", $descricao);

                            foreach($linhas as $linha) {
                                echo "<li>" . $linha . "</li>";
                            }
                            ?>
                        </ul>
                        <div class="btn-wrap">
                            <?php if($firstPlan) { ?>
                                <a href="https://<?php echo $simple_url; ?>/comece" class="btn-buy">Comece por aqui</a>
                            <?php } else { ?>
                                Começe pelo plano grátis
                            <?php } ?>
                        </div>
                    </div>
                </div>
                <?php
                    $firstPlan = false;
                }
                ?>
            </div>
        </div>
    </section>

    <section id="faq" class="faq section-bg">
        <div class="container">
            <div class="section-title" data-aos="fade-up">
                <h2>Perguntas Frequentes</h2>
                <p>Não saia com dúvidas</p>
            </div>
            <div class="faq-list">
                <ul>
                    <li data-aos="fade-up"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" class="collapse" data-bs-target="#faq-list-1">
                            Por que iniciar com o plano grátis? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-1" class="collapse show" data-bs-parent=".faq-list">
                            <p>
                                Dessa forma você terá total acesso aos recursos de nossa ferramenta e <strong><?php echo data_info( "planos",$plano_default,"duracao_dias" ); ?> dias</strong> grátis. Após este período você poderá contratar qualquer um dos planos acima direto pelo painel do cliente.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="100"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-2" class="collapsed">
                            Vou ter acesso imediato sistema? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-2" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Sim. O acesso é liberado imediatamente após a finalização do cadastro. Lembre-se de colocar um email e número de celular válido para receber as notificações.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="200"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-3" class="collapsed">
                            Qual a forma de pagamento? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-3" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Ao contratar um de nossos planos você será redirecionado ao MERCADOPAGO onde poderá escolher o pagamento via: CARTÃO DE CRÉDITO, CARTÃO DE DÉBITO OU BOLETO.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="300"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-4" class="collapsed">
                            Como irei receber os meus pedidos? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-4" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Seus pedidos serão enviados para o WhatsApp do seu negócio. Os pedidos chegam de forma organizada e pronto para impressão. Oferecemos totalmente grátis um pequeno painel de recebimento de pedidos online que esta dentro da área do cliente.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-5" class="collapsed">
                            Precisa instalar algum aplicativo? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-5" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Não, você consegue acessar por celular ou computador sem necessidade de baixar aplicativo. O sistema também oferece a possibilidade do seu cliente instalar um aplicatovo PWA direto no celular como se foce um aplicativo.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-6" class="collapsed">
                            O que é PWA? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-6" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                O nosso sistema conta com a tecnologia PWA que oferece ao seu cliente a possibilidade de instalar um WEBAPP direto no celular e assim ter o seu catálogo instalado direto no celular sem a necessidade de acessar pelo link.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-7" class="collapsed">
                            Posso ter a sacolinha do instagram? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-7" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Sim, Nossa equipe de suporte pode lhe ajudar com um passo a passo de como habilitar a função de vendas do Instagram, assim você consegue com que seus seguidores e clientes comprem seus produtos sem sair da rede social e impulsionar suas vendas!
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-8" class="collapsed">
                            Serve para qualquer tipo de negócio? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-8" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Sim, O Sistema <?php echo $nome_loja; ?> é para qualquer tipo de negócio como: lojas de roupas, serviços, produtos, imobiliárias e muitos outros.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-9" class="collapsed">
                            Como posso solicitar o cancelamento? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-9" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Você pode solicitar o cancelamento a qualquer momento, para ser efetuado o cancelamento com o reembolso do valor pago nós te damos o prazo de 7 dias em qualquer um dos planos contratados, após esse prazo de 7 dias realizamos o cancelamento sem cobrar multa, porém não conseguimos mais reembolsar mesmo para planos parcelados.
                            </p>
                        </div>
                    </li>
                    <li data-aos="fade-up" data-aos-delay="400"> 
                        <i class="bx bx-help-circle icon-help"></i>  
                        <a data-bs-toggle="collapse" data-bs-target="#faq-list-10" class="collapsed">
                            Vocês possuem parcerias com agências? 
                            <i class="bx bx-chevron-down icon-show"></i>
                            <i class="bx bx-chevron-up icon-close"></i>
                        </a>
                        <div id="faq-list-10" class="collapse" data-bs-parent=".faq-list">
                            <p>
                                Sim, você pode divulgar os serviços do <?php echo $nome_loja; ?> em sua cidade e ainda ganhar uma boa comissão por cada cliente inserido em nosso sistema.
                                <br/>Para saber mais sobre nosso modelo de negócio basta entrar em contato no WhatsApp abaixo:
                                <br/>
                                <br/> <strong>(12) 92222-2222</strong>
                            </p>
                        </div>
                    </li>
                </ul>
            </div>
        </div>
    </section>

    <section id="contact" class="features">
        <div class="container">
            <div class="section-title">
                <h2>Fale Conosco</h2>
            </div>
            <div class="row" align="center">
                <div class="col-lg-6 col-md-6" style="margin-bottom:10px;">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="50"> 
                        <i class='bx bxl-whatsapp' style="color:#009900;"></i>
                        <h3><a class="box btn-wrap" href="https://wa.me/<?php echo $whatsapp; ?>">Chame no whatsapp</a></h3>
                    </div>
                </div>
                <div class="col-lg-6 col-md-6" style="margin-bottom:10px;">
                    <div class="icon-box" data-aos="zoom-in" data-aos-delay="50"> 
                        <i class='bx bx-mail-send' style="color:#FF6600;"></i>
                        <h3><a class="box btn-wrap" href="mailto:contato@<?php echo $simple_url; ?>">Mande um e-mail</a></h3>
                    </div>
                </div>
            </div>
        </div>
    </section>
</main>

<footer id="footer">
    <div class="container">
        <div class="copyright">
            &copy; Copyright <strong><span><?php echo $nome_loja; ?></span></strong>
            <br/>Todos os direitos reservados
        </div>
    </div>
</footer>

<a href="#" class="back-to-top d-flex align-items-center justify-content-center"><i class="bi bi-arrow-up-short"></i></a>

<div id="preloader"></div>

<script src="assets/vendor/purecounter/purecounter.js"></script>
<script src="assets/vendor/aos/aos.js"></script>
<script src="assets/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
<script src="assets/vendor/glightbox/js/glightbox.min.js"></script>
<script src="assets/vendor/swiper/swiper-bundle.min.js"></script>
<script src="assets/vendor/php-email-form/validate.js"></script>
<script src="assets/js/main.js"></script>

</body>
</html>