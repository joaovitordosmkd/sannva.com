<?php
// ************************************************
// CONFIGURAÇÕES INICIAIS E CARREGAMENTO DE RECURSOS
// ************************************************

// Carregando definições do sistema
include($virtualpath.'/_layout/define.php');
include('../../_core/_includes/config.php');

// Configurações globais da aplicação
global $app;
is_active($app['id']);
global $seo_title;

// Captura de parâmetros de busca e categoria
$busca = mysqli_real_escape_string($db_con, $_GET['busca']);
$categoria = mysqli_real_escape_string($db_con, $_GET['categoria']);

// ************************************************
// CONFIGURAÇÕES DE SEO (OTIMIZAÇÃO PARA BUSCADORES)
// ************************************************

$seo_subtitle = $app['title'];
$seo_description = $app['description_clean'];
$seo_keywords = $app['title'].", ".$seo_title;
$seo_image = thumber($app['avatar_clean'], 400);

// ************************************************
// INCLUSÃO DOS ARQUIVOS DE LAYOUT
// ************************************************

$system_header .= "";
include($virtualpath.'/_layout/head.php');
include($virtualpath.'/_layout/top.php');
include($virtualpath.'/_layout/sidebars.php');
include($virtualpath.'/_layout/modal.php');
instantrender();

// Captura URL atual para compartilhamento
$pegaurlx = "https://$_SERVER[HTTP_HOST]$_SERVER[REQUEST_URI]";
?>

<div class="sceneElement">
    <!-- ************************************************ -->
    <!-- CABEÇALHO MOBILE COM INFORMAÇÕES DO ESTABELECIMENTO -->
    <!-- ************************************************ -->
    <div class="container nopadd visible-xs visible-sm">
        <!-- Imagem de capa do estabelecimento -->
        <!-- Adicionado background-size: cover; e restaurado o IMG condicional -->
        <div class="cover" style="background: url('<?php echo $app['cover']; ?>') no-repeat top center; background-size: cover;">
            <?php if(data_info("estabelecimentos", $app['id'], "capa")) { ?>
                <img src="<?php echo $app['cover']; ?>" style="width: 100%; height: auto; display: block;"/>
            <?php } ?>
        </div>

        <!-- Avatar do estabelecimento -->
        <div class="grudado">
            <div class="avatar">
                <div class="holder">
                    <a href="<?php echo $app['url']; ?>">
                        <img src="<?php echo $app['avatar']; ?>" alt="<?php echo $app['title']; ?>" title="<?php echo $app['title']; ?>"/>
                    </a>
                </div>    
            </div>
        </div>
        
        <!-- Informações do estabelecimento -->
        <div class="app-infos">
            <!-- Nome do estabelecimento -->
            <div class="row">
                <div class="col-md-12">
                    <span class="title"><?php echo $app['title']; ?></span>
                </div>
            </div>
            
            <!-- Descrição do estabelecimento -->
            <div class="row">
                <div class="col-md-12">
                    <span class="description"><?php echo $app['description']; ?></span>
                </div>
            </div>
            
            <!-- Status de funcionamento (aberto/fechado) -->
            <div class="row">
                <div class="col-md-12">
                    <div align="center">
                        <span>
                        <?php if(verifica_horario($app['id']) == "disabled") { ?>
                            <?php if(data_info("estabelecimentos", $app['id'], "funcionamento") == "1") { ?>
                                <button class="btn btn-success btn-sm"><i class="lni lni-restaurant" style="color:#FFFFFF"></i> Aberto para Pedidos</button>
                            <?php } else { ?>
                                <button class="btn btn-danger btn-sm"><i class="lni lni-cross-circle" style="color:#FFFFFF"></i> Fechado para Pedidos</button>
                            <?php } ?>
                        <?php } else if(verifica_horario($app['id']) == "open") { ?>
                                <button class="btn btn-success btn-sm"><i class="lni lni-restaurant" style="color:#FFFFFF"></i> Aberto para Pedidos</button>
                        <?php } else if(verifica_horario($app['id']) == "close") { ?>
                                <button class="btn btn-danger btn-sm"><i class="lni lni-cross-circle" style="color:#FFFFFF"></i> Fechado para Pedidos</button>
                        <?php } ?>
                        </span>
                    </div>
                </div>
            </div>
            
            <!-- Informações adicionais (pedido mínimo e compartilhamento) -->
            <div class="row">
                <div class="col-md-12">
                    <div class="info-badges flex">
                        <?php if($app['pedido_minimo']) { ?>
                        <div class="info-badge">
                            <i class="lni lni-money-protection"></i> 
                            <span>
                                Pedido minímo:<br/>
                                <?php echo $app['pedido_minimo']; ?>
                            </span>
                            <div class="clear"></div>
                        </div>
                        <?php } ?>
                        <div class="info-badge">
                            <i class="lni lni-whatsapp"></i>
                            <span><a href="https://api.whatsapp.com/send?text=*Abre%20ai*%20e%20confere%20essa%20novidade.%20%20<?php print $pegaurlx; ?>" target="_blank">
                                Compartilhe<br/>
                                no WhatsAPP
                            </a></span>
                            <div class="clear"></div>
                        </div>
                    </div>
                </div>
            </div>    

            <!-- Botões de Instalação PWA (Mobile) -->
            <div class="row visible-xs visible-sm">
                <div class="col-xs-12">
                    <!-- Removido text-align: center; Adicionado flex para alinhar lado a lado -->
                    <div class="install-buttons" style="display: flex; justify-content: center; align-items: center; margin-top: 10px; margin-bottom: 15px;">
                        <button id="installButton" class="btn btn-primary btn-sm" style="margin-right: 5px; display: none;">Instalar App (Android)</button>
                        <button id="showInstructionsButton" class="btn btn-info btn-sm" style="display: none;">Instalar App (iOS)</button>
                    </div>
                </div>
            </div>

        </div>
    </div>

    <!-- Popup de Instruções iOS -->
    <div id="instructionsPopup" style="display: none; position: fixed; left: 0; top: 0; width: 100%; height: 100%; background-color: rgba(0,0,0,0.7); z-index: 1050; padding: 20px; box-sizing: border-box; align-items: center; justify-content: center;">
        <div style="background-color: white; padding: 25px; border-radius: 8px; max-width: 450px; margin: 20px auto; position: relative; text-align: left; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">
            <button id="closePopupButton" style="position: absolute; top: 10px; right: 15px; background: none; border: none; font-size: 2em; color: #888; line-height: 1;">&times;</button>
            <h4 style="margin-top: 0; margin-bottom: 15px; font-size: 1.3em; color: #333;">Instruções para iOS</h4>
            <p style="margin-bottom: 15px; color: #555;">Para adicionar este app à sua Tela de Início:</p>
            <ol style="padding-left: 20px; margin-bottom: 0; color: #555;">
                <li style="margin-bottom: 10px;">Toque no botão de <strong>Compartilhar</strong> <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" class="bi bi-box-arrow-up" viewBox="0 0 16 16" style="vertical-align: -2px;"><path fill-rule="evenodd" d="M3.5 6a.5.5 0 0 0-.5.5v8a.5.5 0 0 0 .5.5h9a.5.5 0 0 0 .5-.5v-8a.5.5 0 0 0-.5-.5h-2a.5.5 0 0 1 0-1h2A1.5 1.5 0 0 1 14 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 14.5v-8A1.5 1.5 0 0 1 3.5 5h2a.5.5 0 0 1 0 1h-2z"/><path fill-rule="evenodd" d="M7.646.146a.5.5 0 0 1 .708 0l3 3a.5.5 0 0 1-.708.708L8.5 1.707V10.5a.5.5 0 0 1-1 0V1.707L5.354 3.854a.5.5 0 1 1-.708-.708l3-3z"/></svg> (na barra inferior do Safari).</li>
                <li style="margin-bottom: 10px;">Role para baixo e toque em "<strong>Adicionar à Tela de Início</strong>".</li>
                <li>Confirme tocando em "<strong>Adicionar</strong>" no canto superior direito.</li>
            </ol>
        </div>
    </div>
    <!-- Fim Popup -->

    <!-- ************************************************ -->
    <!-- CONTEÚDO PRINCIPAL DA PÁGINA -->
    <!-- ************************************************ -->
    <div class="middle minfit">
        <div class="container">
            <!-- Linha divisória para mobile -->
            <div class="row visible-xs visible-sm">
                <div class="col-md-12">
                    <div class="clearline"></div>
                </div>
            </div>
            
            <!-- ************************************************ -->
            <!-- BARRA DE BUSCA E NAVEGAÇÃO MOBILE -->
            <!-- ************************************************ -->
            <div class="row">
                <!-- Campo de busca mobile -->
                <div class="col-md-12">
                    <div class="search-bar-mobile visible-xs visible-sm">
                        <form class="align-middle" action="<?php echo $app['url']; ?>/categoria" method="GET">
                            <input type="text" name="busca" placeholder="Digite sua busca..." value="<?php echo htmlclean($_GET['busca']); ?>"/>
                            <input type="hidden" name="categoria" value="<?php echo $categoria; ?>"/>
                            <button>
                                <i class="lni lni-search-alt"></i>
                            </button>
                            <div class="clear"></div>
                        </form>
                    </div>
                </div>
                
                <!-- Menu de categorias mobile -->
                <div class="col-md-12">
                    <div class="search-bar-mobile visible-xs visible-sm">
                        <div class="tv-infinite tv-infinite-menu">
                            <a class="<?php if(!$categoria){ echo 'active'; }; ?>" href="<?php echo $app['url']; ?>/categoria?<?php echo $query_busca; ?>">Todas</a>
                            <?php        
                            $query_categorias = mysqli_query($db_con, "SELECT * FROM categorias WHERE rel_estabelecimentos_id = '$app_id' AND visible = '1' AND status = '1' ORDER BY ordem ASC");
                            while($data_categoria = mysqli_fetch_array($query_categorias)) {
                            ?>
                            <a class="<?php if($data_categoria['id'] == $categoria){ echo 'active'; }; ?>" href="<?php echo $app['url']; ?>/categoria/<?php echo $data_categoria['id']; ?><?php if($query_busca) { echo "?".$query_busca; }; ?>"><?php echo $data_categoria['nome']; ?></a>
                            <?php } ?>
                        </div>
                    </div>
                </div>
            </div>

            <!-- ************************************************ -->
            <!-- SEÇÃO DE BANNERS PROMOCIONAIS (QUANDO ATIVADO) -->
            <!-- ************************************************ -->
            <?php if($app['funcionalidade_banners']) { ?>
                <?php
                $eid = $app['id'];
                $query_banners = mysqli_query($db_con, "SELECT * FROM banners WHERE rel_estabelecimentos_id = '$eid' AND status = '1' ORDER BY id DESC LIMIT 8");
                $has_banners = mysqli_num_rows($query_banners);
                if($has_banners && $app['funcionalidade_banners'] == 1) {
                ?>
                <div class="banners">
                    <div id="carouselbanners" class="carousel slide">
                        <div class="carousel-inner">
                            <?php
                            $actual = 0;
                            while($data_banners = mysqli_fetch_array($query_banners)) {
                            $banner_video_link = $data_banners['video_link'];
                            $desktop = $data_banners['desktop'];
                            $mobile = $data_banners['mobile'];
                            if(!$mobile) {
                                $mobile = $desktop;
                            }
                            ?>
                            <div class="item <?php if($actual == 0) { echo 'active'; }; ?>">
                                <?php if($data_banners['link']) { ?>
                                <a href="<?php echo linker($data_banners['link']); ?>">
                                <?php } ?>
                                    <img class="hidden-xs hidden-sm" src="<?php echo imager($desktop); ?>"/>
                                    <?php
                                        // Se tiver o link do vídeo para o banner, será renderizado o vídeo, do contrário, será renderizado a imagem
                                        if($banner_video_link) {
                                    ?>
                                        <iframe class="visible-xs visible-sm" width="100%" height="240px" src="https://www.youtube.com/embed/<?php echo $banner_video_link; ?>" frameborder="0" allowfullscreen>
                                        </iframe>
                                    <?php
                                        } else {
                                    ?>
                                        <img class="visible-xs visible-sm" src="<?php echo imager($mobile); ?>"/>
                                    <?php
                                        };
                                    ?>
                                <?php if($data_banners['link']) { ?>
                                </a>
                                <?php } ?>
                            </div>
                            <?php $actual++; } ?>
                        </div>
                        
                        <!-- Controles do carrossel (apenas se tiver mais de um banner) -->
                        <?php if($has_banners >= 1 && $actual >= 2) { ?>
                            <a class="left seta seta-esquerda carousel-control" href="#carouselbanners" data-slide="prev">
                                <span class="glyphicon glyphicon-chevron-left"></span>
                            </a>
                            <a class="right seta seta-direita carousel-control" href="#carouselbanners" data-slide="next">
                                <span class="glyphicon glyphicon-chevron-right"></span>
                        <?php } ?>
                    </div>
                </div>
                <?php } ?>
            <?php } ?>

            <!-- ************************************************ -->
            <!-- LISTAGEM DE CATEGORIAS E PRODUTOS -->
            <!-- ************************************************ -->
            <div class="categorias">
                <?php
                $app_id = $app['id'];
                // Consulta que agrupa produtos por categoria, contando quantos produtos existem em cada
                $query_categoria = 
                "
                SELECT *, count(*) as total, categorias.nome as categoria_nome, categorias.id as categoria_id, count(produtos.id) as produtos_total
                FROM categorias AS categorias 
                INNER JOIN produtos AS produtos 
                ON produtos.rel_categorias_id = categorias.id 
                WHERE categorias.rel_estabelecimentos_id = '$app_id' 
                AND categorias.visible = '1' 
                AND categorias.status = '1' 
                GROUP BY categorias.id 
                ORDER BY categorias.ordem ASC
                LIMIT 20
                ";
                $query_categoria = mysqli_query($db_con, $query_categoria);
                while($data_categoria = mysqli_fetch_array($query_categoria)) {
                ?>
                <!-- Reduzido margin-bottom para diminuir espaço entre categorias -->
                <div class="categoria" style="margin-bottom: 15px;">
                    <!-- Cabeçalho da categoria com título e link "ver tudo" -->
                    <div class="row">
                        <div class="col-md-8 col-sm-8 col-xs-8">
                            <span class="title"><?php echo htmlclean($data_categoria['categoria_nome']); ?></span>
                        </div>
                        <div class="col-md-4 col-sm-4 col-xs-4">
                            <a class="vertudo" href="<?php echo $app['url']; ?>/categoria/<?php echo $data_categoria['categoria_id']; ?>">Ver tudo <i class="lni lni-arrow-right"></i></a>
                        </div>
                    </div>
                    
                    <!-- Listagem de produtos da categoria -->
                    <div class="produtos">
                        <div class="row">
                            <!-- Definição do tipo de exibição com base na configuração do app -->
                            <?php if($app['exibicao'] == 1){ ?>
                            <!-- Ajuste de padding/margin para mobile no container tv-infinite -->
                            <div class="tv-infinite" style="margin-left: -5px; margin-right: -5px;"> 
                            <?php } ?>
                            
                            <?php if($app['exibicao'] == 2){ ?>
                            <div class="novalistagem">
                            <?php } ?>
                                
                                <?php
                                // Detecção de dispositivo móvel (mantida para referência, mas não usada para LIMIT)
                                $userAgent = $_SERVER['HTTP_USER_AGENT'];
                                $isMobile = preg_match('/(android|avantgo|blackberry|bolt|boost|cricket|docomo|fone|hiptop|mini|mobi|palm|phone|pie|tablet|up\.browser|up\.link|webos|wos)/i', $userAgent);
                                
                                // Consulta dos produtos da categoria atual - SEM LIMIT
                                $cat_id = $data_categoria['categoria_id'];
                                $query_produtos = mysqli_query($db_con, "SELECT * FROM produtos WHERE rel_categorias_id = '$cat_id' AND visible = '1' AND status = '1' ORDER BY id ASC"); // SEM LIMIT
                                while($data_produtos = mysqli_fetch_array($query_produtos)) {
                                    // Definição do valor final (normal ou promocional)
                                    if($data_produtos['oferta'] == "1") {
                                        $valor_final = $data_produtos['valor_promocional'];
                                    } else {
                                        $valor_final = $data_produtos['valor'];
                                    }
                                ?>
                                
                                <!-- EXIBIÇÃO TIPO 2: Layout com imagem à direita e texto à esquerda -->
                                <?php if($app['exibicao'] == 2){ ?>
                                    <!-- Adicionado col-xs-12 para garantir que ocupe a largura total em mobile -->
                                    <div class="col-md-6 col-sm-12 col-xs-12">
                                        <div class="novoproduto">
                                            <a href="<?php echo $app['url']; ?>/produto/<?php echo $data_produtos['id']; ?>" title="<?php echo $data_produtos['nome']; ?>">
                                                <div class="row">
                                                    <!-- Informações do produto (nome, descrição, preço) -->
                                                    <div class="col-md-9 col-sm-7 col-xs-7 npr">
                                                        <span class="nome"><?php echo htmlclean($data_produtos['nome']); ?></span>
                                                        <span class="descricao"><?php echo htmlclean($data_produtos['descricao']); ?></span>
                                                        <div class="preco">
                                                            <?php if($valor_final > 0) { ?>
                                                                <?php if($data_produtos['oferta'] == "1") { ?>
                                                                    <span class="valor valor-green">Por R$ <?php echo dinheiro($valor_final, "BR"); ?></span>
                                                                <?php } else { ?>
                                                                    <span class="valor valor-green">R$: <?php echo dinheiro($valor_final, "BR"); ?></span>
                                                                <?php } ?>
                                                            <?php } else { ?>
                                                                <!-- Produto com preço variável ou opcionais -->
                                                                <span class="valor ">VER OPÇÕES</span>
                                                            <?php } ?>
                                                        </div>
                                                    </div>
                                                    
                                                    <!-- Imagem do produto -->
                                                    <div class="col-md-3 col-sm-5 col-xs-5">
                                                        <div class="capa">
                                                            <img src="<?php echo thumber($data_produtos['destaque'], 450); ?>"/>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <!-- Botão de compra ou aviso de sem estoque -->
                                                <?php if($data_produtos['estoque'] == 1 || ($data_produtos['estoque'] == 2 && $data_produtos['posicao'] > 0)) { ?>
                                                    <div class="detalhes"><i class="icone icone-sacola"></i> <span>Comprar</span></div>
                                                <?php } else { ?>
                                                    <div style="padding:5px; color:#333; font-size:12px;"><i class="lni lni-close" style="color:#FF0000; font-weight:bold;"></i> <span>Sem Estoque</span></div>
                                                <?php } ?>
                                            </a>
                                        </div>
                                    </div>
                                <?php } ?>
                                
                                <!-- EXIBIÇÃO TIPO 1: Layout de cards com imagem em destaque -->
                                <?php if($app['exibicao'] == 1){ ?>
                                    <!-- REMOVIDO col-md-3 col-sm-4 col-xs-6 -->
                                    <div class="col-infinite" style="padding-left: 5px; padding-right: 5px;">
                                        <div class="produto">
                                            <a href="<?php echo $app['url']; ?>/produto/<?php echo $data_produtos['id']; ?>" title="<?php echo $data_produtos['nome']; ?>">
                                                <div class="capa" style="background-image: url(<?php echo thumber($data_produtos['destaque'], 450); ?>);"></div>
                                                <span class="nome"><?php echo htmlclean($data_produtos['nome']); ?></span>
                                                
                                                <?php if($valor_final > 0) { ?>
                                                    <?php if($data_produtos['oferta'] == "1") { ?>
                                                        <span class="valor_anterior">De: <?php echo dinheiro($data_produtos['valor'], "BR"); ?></span>
                                                    <?php } else { ?>
                                                        <span class="valor_anterior invisible">&nbsp;</span>
                                                    <?php } ?>
                                                    <span class="apenas">Por apenas</span>
                                                    <span class="valor">R$ <?php echo dinheiro($valor_final, "BR"); ?></span>
                                                    
                                                    <!-- Verificação de estoque -->
                                                    <?php if($data_produtos['estoque'] == 1 || ($data_produtos['estoque'] == 2 && $data_produtos['posicao'] > 0)) { ?>
                                                        <div class="detalhes"><i class="icone icone-sacola"></i> <span>Comprar</span></div>
                                                    <?php } else { ?>
                                                        <div class="detalhes sem-estoque"><i class="lni lni-close"></i> <span>Sem Estoque</span></div>
                                                    <?php } ?>
                                                <?php } else { ?>
                                                    <!-- Produto com preço variável/opcionais -->
                                                    <span class="apenas">Este item possui</span>
                                                    <span class="apenas">opcionais</span>
                                                    <span class="valor" style="color:#FFFFFF">.</span>
                                                    <div class="detalhes"><i class="icone icone-sacola"></i> <span>Selecione</span></div>
                                                <?php } ?>
                                            </a>
                                        </div>
                                    </div>
                                <?php } ?>
                                <?php } ?>
                                
                                <!-- Botão "Ver tudo" adicional apenas para mobile - MANTIDO REMOVIDO -->
                                <?php /* if($app['exibicao'] == 1){ ?>
                                <div class="col-md-3 col-sm-4 col-xs-6 col-infinite col-infinite-last visible-xs visible-sm" style="padding-left: 5px; padding-right: 5px;">
                                    <a class="vertudo" href="<?php echo $app['url']; ?>/categoria/<?php echo $data_categoria['categoria_id']; ?>">Ver tudo <i class="lni lni-arrow-right"></i></a>
                                </div>
                                <?php } */ ?>
                            </div>
                        </div>
                    </div>
                </div>
                <?php } ?>
            </div>
        </div>
    </div>
</div>

<?php 
// ************************************************
// CARREGAMENTO DO RODAPÉ
// ************************************************
$system_footer .= "";
?>

<script>
document.addEventListener('DOMContentLoaded', (event) => {
    const installButton = document.getElementById('installButton');
    const showInstructionsButton = document.getElementById('showInstructionsButton');
    const instructionsPopup = document.getElementById('instructionsPopup');
    const closePopupButton = document.getElementById('closePopupButton');
    let deferredPrompt; // Variável para guardar o evento beforeinstallprompt

    // --- Lógica PWA ---
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        console.log('`beforeinstallprompt` event fired.');
        // Se o prompt está disponível, potencialmente mostramos o botão Android
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
        if (!isStandalone && installButton) {
             // Apenas marca que o prompt está pronto, a exibição é tratada abaixo
        }
    });

    if (installButton) {
         installButton.addEventListener('click', async () => {
            if (deferredPrompt) {
                deferredPrompt.prompt();
                const { outcome } = await deferredPrompt.userChoice;
                console.log(`User response to the install prompt: ${outcome}`);
                deferredPrompt = null;
                installButton.style.display = 'none'; // Esconde após tentativa
            } else {
                 console.log('O prompt de instalação PWA não está disponível.');
                 // Poderia adicionar uma mensagem para o usuário aqui
            }
        });
    }

     window.addEventListener('appinstalled', () => {
        if (installButton) {
            installButton.style.display = 'none';
        }
        if (showInstructionsButton) {
             showInstructionsButton.style.display = 'none'; // Esconde botão iOS também se instalar
        }
        deferredPrompt = null;
        console.log('PWA foi instalado');
    });

    // --- Lógica de Exibição dos Botões ---
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;

    if (isStandalone) {
        console.log('Rodando como PWA standalone.');
        // Esconde ambos os botões se já estiver instalado/standalone
         if (installButton) installButton.style.display = 'none';
         if (showInstructionsButton) showInstructionsButton.style.display = 'none';
    } else {
         console.log('Rodando no navegador.');
         // Se não for standalone, mostra ambos os botões
         // O botão Android só funcionará se deferredPrompt estiver disponível
         if (installButton) {
             installButton.style.display = 'inline-block';
         }
         if (showInstructionsButton) {
             showInstructionsButton.style.display = 'inline-block';
         }
         // Opcional: Poderíamos desabilitar o botão Android se deferredPrompt for null
         // if (installButton && !deferredPrompt) {
         //     installButton.disabled = true;
         //     installButton.title = "Instalação não disponível neste navegador";
         // }
    }

    // --- Lógica Popup iOS ---
    if (showInstructionsButton && instructionsPopup) {
        showInstructionsButton.addEventListener('click', () => {
            instructionsPopup.style.display = 'flex'; // Usar flex para centralizar
        });
    }

    if (closePopupButton && instructionsPopup) {
        closePopupButton.addEventListener('click', () => {
            instructionsPopup.style.display = 'none';
        });
    }

    // Fechar popup clicando fora da caixa de diálogo
    if (instructionsPopup) {
        instructionsPopup.addEventListener('click', (e) => {
            // Verifica se o clique foi no fundo (o próprio popup) e não nos seus filhos
            if (e.target === instructionsPopup) { 
                instructionsPopup.style.display = 'none';
            }
        });
    }
});
</script>

<?php
include($virtualpath.'/_layout/rdp.php');
include($virtualpath.'/_layout/footer.php');
?>