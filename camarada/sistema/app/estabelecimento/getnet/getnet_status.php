<?php

// CORE

include($virtualpath.'/_layout/define.php');

// APP

global $app;

is_active( $app['id'] );

$back_button = "true";

$back_url =  $_SERVER['HTTP_REFERER'];



// Querys
$pedido = mysqli_real_escape_string( $db_con, $_GET['pedido'] );
$estabelecimento = mysqli_real_escape_string( $db_con, $_GET['estabelecimento'] );
$pagamento = mysqli_real_escape_string( $db_con, $_GET['pagamento'] );
$status = mysqli_real_escape_string( $db_con, $_GET['status'] );

//Comprovante
$whatsapp_link = whatsapp_link($pedido);


// Verificando pagamento
$pagamento_data = mysqli_query($db_con, "SELECT * FROM pagamentos WHERE pedido='$pedido' and estabelecimento='$estabelecimento' and codigo='$pagamento' ");
$haspagamento = mysqli_num_rows($pagamento_data);
$pagamento_data = mysqli_fetch_array($pagamento_data);

//Se o pedido é delivery ou balcão  - Redirecina em caso de falha do pagamento para pagar novamente
$link_pagar_novamente = $app['url']."/mercadopago?pedido=".$pedido;


    // echo $haspagamento;
    if($haspagamento) {

        switch ($pagamento_data['status']) {
            case "APPROVED":
                $status_transacao = "Pagamento Aprovado";
                $status_transacao_descricao = $status;
                break;
            case "PENDING":
                $status_transacao = "Pagamento Em análise";
                $status_transacao_descricao =$status;
                break;
            case "DENIED":
                $status_transacao = "Pagamento Recusado";
                $status_transacao_descricao =$status;
                break;
          
        }     


    } else {
        header("Location: ".$app['url']."/pedidosabertos");
    }


// SEO

$seo_subtitle = $app['title']." - Status do Pagamento!";
$seo_description = "Status do Pagamento!";
$seo_keywords = $app['title'].", ".$seo_title;
$seo_image = thumber( $app['avatar_clean'], 400 );

// HEADER

$system_header .= "";

include($virtualpath.'/_layout/head.php');
include($virtualpath.'/_layout/top.php');
include($virtualpath.'/_layout/sidebars.php');
include($virtualpath.'/_layout/modal.php');



?>

<div class="sceneElement">
	<div class="header-interna">
		<div class="locked-bar visible-xs visible-sm">
			<div class="avatar">
				<div class="holder">
					<a href="<?php echo $app['url']; ?>">
						<img src="<?php echo $app['avatar']; ?>"/>
					</a>
				</div>	
			</div>
		</div>
		<div class="holder-interna holder-interna-nopadd holder-interna-sacola visible-xs visible-sm"></div>
	</div>
	<div class="minfit">
			<div class="middle">
				<div class="container nopaddmobile">
						
					<div class="obrigado">
						<div class="row">
							<div class="col-md-12" align="center" >

                                <div class="adicionado">
									<!-- <i class="checkicon lni lni-checkmark-circle"></i> -->
                                    <h2><?=$status_transacao?></h2>
									<span class="text"><?=$status_transacao_descricao?></span>
                                    
                                    <!-- Enviar Comprovante -->
                                    <?php if ($pagamento_data['status'] == "APPROVED") { ?>
                                        <a target="_blank" href="<?php echo $whatsapp_link; ?>" class="botao-acao"><i class="lni lni-whatsapp"></i> <span>Enviar comprovante</span></a>
                                    <?php } ?>
								</div>

                                <!-- Acompanhar pedido -->
                                <?php if ($pagamento_data['status'] == "PENDING" || $pagamento_data['status'] == "APPROVED") { ?>
                                    <div class="adicionado">
                                            <a target="_blank" href="<?php echo pedidosabertos; ?>" class="botao-acao"><i class="lni lni-alarm-clock"></i> <span>Acompanhar pedido</span></a>
                                    </div>
                                <?php } ?>

                                <!-- Tentar novamente -->
                                <?php if ($pagamento_data['status'] == "DENIED") { ?>
                                    <div class="adicionado">
                                            <a target="_blank" href="<?=$link_pagar_novamente?>" class="botao-acao"><i class="lni lni-share-alt"></i> <span>Tentar Pagar Novamente</span></a>
                                    </div>
                                <?php } ?>



						    </div>
						</div>
					</div>
				</div>
			</div>
	</div>
</div>



<?php 

// FOOTER

$system_footer .= "";

//include($virtualpath.'/_layout/rdp.php');

include($virtualpath.'/_layout/footer.php');

?>



