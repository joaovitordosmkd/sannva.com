<?php
// CORE
include('../../_core/_includes/config.php');
// RESTRICT
restrict_estabelecimento();
// SEO
$seo_subtitle = "Início";
$seo_description = "";
$seo_keywords = "";
// HEADER
$system_header .= "";
include('../_layout/head.php');
include('../_layout/top.php');
include('../_layout/sidebars.php');
include('../_layout/modal.php');



// Globals
  $id = $_SESSION['estabelecimento']['id'];

  $expiracao = $_SESSION['estabelecimento']['expiracao'];

//   atualiza_estabelecimento( $id, "online" );
  


  $queryestabelecimento = mysqli_query( $db_con, "SELECT * FROM estabelecimentos WHERE id = '$id' LIMIT 1");
  $dataestabelecimento = mysqli_fetch_array( $queryestabelecimento );
  
  $idcidade = $dataestabelecimento['cidade'];

    // Consulta SQL para selecionar o link do vídeo
    $query_video = mysqli_query($db_con, "SELECT link FROM link WHERE nome='video'");
    $datalink_video = mysqli_fetch_array($query_video);
    $link_video = $datalink_video['link'];
    
    // Consulta SQL para selecionar o link do wppmkt
    $query_wppmkt = mysqli_query($db_con, "SELECT link FROM link WHERE nome='wppmkt'");
    $datalink_wppmkt = mysqli_fetch_array($query_wppmkt);
    $link_wppmkt = $datalink_wppmkt['link'];
    
    
    // Consulta SQL para selecionar o link do vídeo
    $query_duvida = mysqli_query($db_con, "SELECT link FROM link WHERE nome='duvida'");
    $datalink_duvida = mysqli_fetch_array($query_duvida);
    $link_duvida = $datalink_duvida['link'];

    
    
    function atualizar_link($db_con, $tipo_link) {
        $link = 'link_'.$tipo_link;
        $link = isset($_GET[$link]) ? mysqli_real_escape_string($db_con, $_GET[$link]) : null;
        $querylink = mysqli_query($db_con, "SELECT link FROM link WHERE nome='$tipo_link'");
        $datalink = mysqli_fetch_array($querylink);
    
        if($datalink){
            // Se $datalink não estiver vazio, atualize o registro
            if(mysqli_query($db_con, "UPDATE link SET link = '$link' WHERE nome = '$tipo_link'")){
                header("Location: index.php?msg=sucesso");
            }
        } else {
            // Se $datalink estiver vazio, insira um novo registro
            if(mysqli_query($db_con, "INSERT INTO link (nome, link) VALUES ('$tipo_link', '$link')")){
                header("Location: index.php?msg=sucesso");
            }
        }
    }

    
    
    if(isset($_GET['set_duvida'])){
        atualizar_link($db_con, 'video');
    }

    
    
// Função para criar um modal
function criar_modal($id_modal, $titulo, $link) {
    global $datalink;
    echo '
    <div id="modal'.$id_modal.'" class="modal fade" role="dialog">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header">
                    <button type="button" class="close" data-dismiss="modal">×</button>
                    <h4 class="modal-title">'.$titulo.'</h4>
                </div>
                <div class="modal-body">
                <small>Para criar o link, clique aqui -> <a href="https://api.chatpro.com.br/gerador-de-links" style="color: blue !important;">Gerador de Links</a>. No campo número do WhatsApp, insira o número do vendedor.</small>
                    <textarea id="link_'.$id_modal.'" rows="1" cols="50">'.$link.'</textarea>
                </div>
                <div class="modal-footer">
                    <a href="#" class="btn btn-default" style="background-color: black; color: white;" data-dismiss="modal">Fechar</a>
                    <a href="#" id="botao_salvar_'.$id_modal.'" class="btn navigator" style="padding: 6px 12px !important; color: white;"> Salvar <i class="lni lni-save"></i></a>
                </div>
            </div>
        </div>
    </div>
    ';
}

// Criação dos modais
criar_modal('duvida', 'Link para tirar dúvidas no whatsapp', $link_duvida);

?>

<script>
// Função para adicionar evento de clique ao botão salvar
function adicionar_evento(tipo_link) {
    document.getElementById('botao_salvar_'+tipo_link).addEventListener('click', function(e) {
        e.preventDefault();
        var link = document.getElementById('link_'+tipo_link).value;
        var url = "<?php echo panel_url(); ?>/inicio/?link_" + tipo_link + "=" + encodeURIComponent(link) + "&set_" + tipo_link + "=true";
        console.log(url);
        window.location.href = url;
    });
}

// Adicionando eventos aos botões salvar
adicionar_evento('duvida');

</script>

<?php

  $queryusr = mysqli_query( $db_con, "SELECT * FROM users_data WHERE cidade = '$idcidade' LIMIT 1");
  $hasusr = mysqli_num_rows( $queryusr );
  
  // soma vendas
  
  $querytotalvendas = mysqli_query( $db_con, "SELECT v_pedido, SUM(v_pedido) AS soma1 FROM pedidos WHERE rel_estabelecimentos_id = '$id' AND status = '2'");
  $datatotalvendas = mysqli_fetch_array( $querytotalvendas );
  
  // total de pedidos
  
  $querypedidos = mysqli_query( $db_con, "SELECT id FROM pedidos WHERE rel_estabelecimentos_id = '$id'");
  $datapedidos = mysqli_num_rows( $querypedidos );
  
    // soma vendas mês
  $mesatual = date("m");
  $querytotalvendasm = mysqli_query( $db_con, "SELECT v_pedido, SUM(v_pedido) AS soma2 FROM pedidos WHERE MONTH(data_hora) = '$mesatual' AND rel_estabelecimentos_id = '$id' AND status = '2'");
  $datatotalvendasm = mysqli_fetch_array( $querytotalvendasm );
  
  
?>





<?php if( $_GET['msg'] == "inativo" ) { ?>

<?php modal_alerta("Seu plano encontrasse inativo, contrate um novo plano para continuar a usar os serviços!","erro"); ?>

<?php } ?>

<?php if( $_GET['msg'] == "funcaodesativada" ) { ?>

<?php modal_alerta("Seu plano não tem acesso a essa funcionalidade, contrate um correspondente verificando a aba meu plano!","erro"); ?>

<?php } ?>

<?php if( $_GET['msg'] == "bemvindo" ) { ?>

<?php modal_alerta("Seu catálogo foi criado com sucesso. Aproveite o seu período de testes!<br/><br/>Ao final do período você deve escolher um plano para continuar utilizando o sistema.","sucesso"); ?>

<?php } ?>


  <!--<div class="container">
        <div class="row">

			<div class="lista-menus">
				    <div class="col-md-4">
						<div class="lista-menus-menu lista-menus-nocounter">
							<a class="bt" href="#">
								<i class="lni lni-calculator"></i>
								<span>Faturado na Plataforma<br/>R$: <?php print number_format($datatotalvendas['soma1'], 2, ',', '.');?></span>
								<div class="clear"></div>
							</a>
						</div>
					</div>
					
					
					<!--<div class="col-md-4">
						<div class="lista-menus-menu lista-menus-nocounter">
							<a class="bt" href="#">
								<i class="lni lni-calculator"></i>
								<span>Comissionamento<br/>R$: <?php print number_format(($datatotalvendas['soma1'] / $comissao_afiliados), 2, ',', '.');?></span>
								<div class="clear"></div>
							</a>
						</div>
					</div>-->
					
					
				   <!-- <div class="col-md-4">
						<div class="lista-menus-menu lista-menus-nocounter">
							<a class="bt" href="#">
								<i class="lni lni-coin" style="color:#FFFFFF"></i>
								<span>Vendas do mês <?php print date("m");?>/<?php print date("Y");?><br/>R$: <?php print number_format($datatotalvendasm['soma2'], 2, ',', '.');?></span>
								<div class="clear"></div>
							</a>
						</div>
					</div>
					<div class="col-md-4">
						<div class="lista-menus-menu lista-menus-nocounter">
							<a class="bt" href="#">
								<i class="lni lni-restaurant"></i>
								<span>Pedidos em <?php print date("m");?>/<?php print date("Y");?><br/><?php print $datapedidos; ?></span>
								<div class="clear"></div>
							</a>
						</div>
					</div>-->
					
			<!--<div class="lista-menus" <?php if( $expiracao <= 0 ) { echo 'style="display:none;"';}?>>-->
			<!--	    <div class="col-md-12">-->
			<!--			<div class="lista-menus-menu lista-menus-nocounter">-->
			<!--				<a class="bt" href="<?php panel_url(); ?>/disparador">-->
							<!-- icone disparador -->
			<!--					<i class="lni lni-bolt"></i>-->
			<!--					<span>Disparador de Mensagens</span>-->
			<!--					<div class="clear"></div>-->
			<!--				</a>-->
			<!--			</div>-->
			<!--		</div>-->
			<!--</div>-->




		
		
		 
		<hr/>
		 

		<div class="lista-menus">

			<div class="row">

				<div class="col-md-4">
				    
				    <?php if( verifica_horario($id) == "disabled" ) { ?>
				        <div class="funcionamento" id="funcionamento">
				            
					<?php	        if ( data_info( "estabelecimentos", $_SESSION['estabelecimento']['id'], "funcionamento" ) == "1" ) {
					?>


            						<div class="aberto">
            
            							<div class="lista-menus-menu">
            								<div class="bt">
            									<i class="open-status"></i>
            									<span>Aberto para Pedidos</span>
            									<i class="lni lni-shuffle"></i>
            									<div class="clear"></div>
            								</div>
            							</div>
            							<span class="funcionamento-msg">O seu estabelecimento está disponível<br class="hidden-xs hidden-sm"/> para receber pedidos</span>
            
            						</div>
            
            						<?php } else { ?>
            
            						<div class="fechado">
            
            							<div class="lista-menus-menu">
            								<div class="bt">
            									<i class="open-status"></i>
            									<span>Fechado para Pedidos</span>
            									<i class="lni lni-shuffle"></i>
            									<div class="clear"></div>
            								</div>
            							</div>
            							<span class="funcionamento-msg">O seu estabelecimento não está disponível<br class="hidden-xs hidden-sm"/> para receber pedidos</span>
            
            						</div>
            			<?php   }    ?>
                            </div>
						<?php }
						    else {
						?>
						    <div class="funcionamento">
						    <?php if ( verifica_horario($id) == "open" ) { ?>
						           
						           <div class="aberto" style="cursor:auto;">
            
            							<div class="lista-menus-menu">
            								<div class="bt">
            									<i class="open-status"></i>
            									<span>Aberto para Pedidos</span>
            									<div class="clear"></div>
            								</div>
            							</div>
            							<span class="funcionamento-msg">O seu estabelecimento está disponível<br class="hidden-xs hidden-sm"/> para receber pedidos</span>
            							
            						</div>
						           
						    <?php } else if ( verifica_horario($id) == "close" ) { ?>
						            
						           <div class="fechado" style="cursor:auto;">
            
            							<div class="lista-menus-menu">
            								<div class="bt">
            									<i class="open-status"></i>
            									<span>Fechado para Pedidos</span>
            									<div class="clear"></div>
            								</div>
            							</div>
            							<span class="funcionamento-msg">O seu estabelecimento não está disponível<br class="hidden-xs hidden-sm"/> para receber pedidos</span>
            
            						</div>
						            
						    <?php } ?>
						
						    </div>
						<?php } ?>

				</div>




<?php 
// FOOTER
$system_footer .= "";
//clude('../_layout/rdp.php');
include('../_layout/footer.php');
?>

<script>

$("#funcionamento").click(function() {
	
	$( this ).html("<div class='atualizando'><i class='lni lni-reload rotating'></i></div>");
	setTimeout(() => { 
		$( this ).load("<?php panel_url(); ?>/_ajax/funcionamento.php?eid=<?php echo $_SESSION['estabelecimento']['id']; ?>&token=<?php echo session_id(); ?>");
    }, 400);

});

</script>

