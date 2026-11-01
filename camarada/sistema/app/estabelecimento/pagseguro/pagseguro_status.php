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

//Comprovante
$whatsapp_link = whatsapp_link($pedido);


// Verificando pagamento
$pagamento_data = mysqli_query($db_con, "SELECT * FROM pagamentos WHERE pedido='$pedido' and estabelecimento='$estabelecimento' and codigo='$pagamento' ");
$haspagamento = mysqli_num_rows($pagamento_data);
$pagamento_data = mysqli_fetch_array($pagamento_data);



$link_pagar_novamente = $app['url']."/pagseguro?pedido=".$pedido;


    // echo $haspagamento;
    if($haspagamento) {

        switch ($pagamento_data['status']) {
            case "1":
                $status_transacao = "Aguardando pagamento";
                $status_transacao_descricao = "Seu pagamento está em análise. O PagSeguro não
                recebeu nenhuma informação sobre o pagamento.";
                break;
            case "2":
                $status_transacao = "Em análise";
                $status_transacao_descricao = "O PagSeguro está analisando o risco
                da transação.";
                break;
            case "3":
                $status_transacao = "Aprovado";
                $status_transacao_descricao = "Parabéns, seu pagamento foi aprovado.";
                break;
            case "4":
                $status_transacao = "Em Análise";
                $status_transacao_descricao = "A transação foi paga e chegou ao final de
                seu prazo de liberação sem ter sido retornada e sem
                que haja nenhuma disputa aberta.";
                break;
            case "5":
                $status_transacao = "Em Disputa";
                $status_transacao_descricao = "O comprador, dentro do prazo de liberação
                da transação, abriu uma disputa.";
                break;
            case "6":
                $status_transacao = "Devolvida";
                $status_transacao_descricao = "O valor da transação foi devolvido para o
                comprador..";
                break;
            case "7":
                $status_transacao = "Cancelada";
                $status_transacao_descricao = "A transação foi cancelada sem ter sido
                finalizada.";
                break;
            case "8":
                $status_transacao = "Debitado";
                $status_transacao_descricao = "O valor da transação foi devolvido para o
                comprador.";
                break;
            case "9":
                $status_transacao = "Retenção Temporária";
                $status_transacao_descricao = "O comprador abriu uma
                solicitação de chargeback junto à operadora do cartão
                de crédito.";
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
							<div class="col-md-12" align="center">

                                <div class="adicionado">
									<i class="checkicon lni lni-checkmark-circle"></i>
                                    <h2><?=$status_transacao?></h2>
									<span class="text"><?=$status_transacao_descricao?></span>
                                    
                                    <!-- Enviar Comprovante -->
                                    <?php if ($pagamento_data['status'] == 3) { ?>
                                        <a target="_blank" href="<?php echo $whatsapp_link; ?>" class="botao-acao"><i class="lni lni-whatsapp"></i> <span>Enviar comprovante</span></a>
                                    <?php } ?>
								</div>

                                <!-- Acompanhar pedido -->
                                <?php if ($pagamento_data['status'] == 1 || $pagamento_data['status'] == 2 || $pagamento_data['status'] == 4 || $pagamento_data['status'] == 5 || $pagamento_data['status'] == 9 || $pagamento_data['status'] == 3) { ?>
                                    <div class="adicionado">
                                            <a target="_blank" href="<?php echo pedidosabertos; ?>" class="botao-acao"><i class="lni lni-alarm-clock"></i> <span>Acompanhar pedido</span></a>
                                    </div>
                                <?php } ?>

                                <!-- Tentar novamente -->
                                <?php if ($pagamento_data['status'] == 6 || $pagamento_data['status'] == 7 || $pagamento_data['status'] == 8) { ?>
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

//<!--include($virtualpath.'/_layout/rdp.php');-->

include($virtualpath.'/_layout/footer.php');

?>



