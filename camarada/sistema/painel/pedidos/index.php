<?php

// CORE

include('../../_core/_includes/config.php');

// RESTRICT

restrict_estabelecimento();

restrict_expirado();

// SEO

$seo_subtitle = "Pedidos";

$seo_description = "";

$seo_keywords = "";

// HEADER

$system_header .= "";

include('../_layout/head.php');

include('../_layout/top.php');

include('../_layout/sidebars.php');

include('../_layout/modal.php');

?>




<?php if( $_GET['msg'] == "aceito" ) {

    

$nome = $_GET['nome'];

$whats = $_GET['whats'];

   

$msg4="Olá, ".strtoupper($nome)."\n";

$msg4.="\n";

$msg4.="*Seu pedido foi aceito*\n";

$msg4;

$text4 = urlencode($msg4);



$url = "https://api.whatsapp.com/send?phone=55".$whats."&text=".$text4."";



?>



<script type="text/javascript">window.open('<?php print $url;?>', '_blank');</script>


<?php

}

?>



<?php if( $_GET['msg'] == "finalizado" ) {

    

$nome = $_GET['nome'];

$whats = $_GET['whats'];

 $tipo = $_GET['tipo'];

$msg4="Olá, ".strtoupper($nome)."\n";

$msg4.="\n";

if ($tipo == "retirada") {
	$msg4 = "*Seu pedido foi finalizado. Agradecemos a sua preferência.*\n";
} else {

	$msg4.="*Seu pedido foi entregue. Agradecemos a sua preferência.*\n";
}


$msg4;

$text4 = urlencode($msg4);



$url = "https://api.whatsapp.com/send?phone=55".$whats."&text=".$text4."";



?>



<script type="text/javascript">window.open('<?php print $url;?>', '_blank');</script>



<?php

}

?>



<?php if( $_GET['msg'] == "excluir" ) {

    

$nome = $_GET['nome'];

$whats = $_GET['whats'];

 $tipo = $_GET['tipo'];

$msg4="Olá, ".strtoupper($nome)."\n";

$msg4.="\n";


	$msg4.="*Precisamos cancelar o seu pedido* ❌\n";
	
	
$msg4;

$text4 = urlencode($msg4);



$url = "https://api.whatsapp.com/send?phone=55".$whats."&text=".$text4."";



?>



<script type="text/javascript">window.open('<?php print $url;?>', '_blank');</script>



<?php

}

?>




<?php if( $_GET['msg'] == "disponivel" ) {

    

$nome = $_GET['nome'];

$whats = $_GET['whats'];

 $tipo = $_GET['tipo'];

$msg4="Olá, ".strtoupper($nome)."\n";

$msg4.="\n";

if ($tipo == "retirada") {
	$msg4 = "*Seu pedido está disponível para retirada.* 🏪\n";
} else {

    $msg4 = "*Seu pedido saiu para a entrega.* 🛵\n";
}


$msg4;

$text4 = urlencode($msg4);



$url = "https://api.whatsapp.com/send?phone=55".$whats."&text=".$text4."";



?>



<script type="text/javascript">window.open('<?php print $url;?>', '_blank');</script>



<?php

}

?>






<?php if( $_GET['msg'] == "reembolsado" ) {

    

$nome = $_GET['n'];

$whats = $_GET['whats'];

$pedido = $_GET['pedido'];
   

$msg4="Olá, ".strtoupper($nome)."\n,";

$msg4.="\n";

$msg4.="Seu pagamento referente ao pedido *N° ".$pedido."* foi *reembolsado*.\n";

$msg4;

$text4 = urlencode($msg4);



$url = "https://api.whatsapp.com/send?phone=55".$whats."&text=".$text4."";



?>



<script type="text/javascript">window.open('<?php print $url;?>', '_blank');</script>



<?php

}

?>
























<!-- 

<meta http-equiv="refresh" content="60;URL=./" /> -->















<?php



global $db_con;

$eid = $_SESSION['estabelecimento']['id'];



// Variables



$estabelecimento = mysqli_real_escape_string( $db_con, $_GET['estabelecimento_id'] );

$numero = mysqli_real_escape_string( $db_con, $_GET['numero'] );

$nome = mysqli_real_escape_string( $db_con, $_GET['nome'] );

$status = mysqli_real_escape_string( $db_con, $_GET['status'] );

$cupom = mysqli_real_escape_string( $db_con, $_GET['cupom'] );




$getdata = "";



foreach($_GET as $query_string_variable => $value) {

  if( $query_string_variable != "pagina" ) {

    $getdata .= "&$query_string_variable=".htmlclean($value);

  }

}



// Config



$limite = 20;

$pagina = $_GET["pagina"] == "" ? 1 : $_GET["pagina"];

$inicio = ($pagina * $limite) - $limite;



// Query



$query .= "SELECT * FROM pedidos ";



$query .= "WHERE 1=1 ";

if (isset($_GET['filtered'])) {


		if( $numero ) {

		$query .= "AND id = '$numero' ";

		}



		if( $nome ) {

		$query .= "AND nome LIKE '%$nome%' ";

		}



		if( $status != 9 ) {

			$query .= "AND status = '$status' ";

		} else {

			// $query .= "AND (status = '1' OR status = '4' OR status = '5' OR status = '6' OR status = '7' OR status ='8')";

		}



		if( $cupom ) {

		$query .= "AND cupom = '$cupom' ";

		}



		$data_inicial = mysqli_real_escape_string( $db_con, $_GET['data_inicial'] );

		if( !$data_inicial ) { $data_inicial = date("d/m/").(date(Y)-1); }

		$data_inicial_sql = datausa_min( $data_inicial );

		$data_inicial_sql = $data_inicial_sql." 00:00:00";



		$data_final = mysqli_real_escape_string( $db_con, $_GET['data_final'] );

		if( !$data_final ) { $data_final = date("d/m/Y"); }

		$data_final_sql = datausa_min( $data_final );

		$data_final_sql = $data_final_sql." 23:59:59";

}

if( strlen( $data_inicial ) >= 1 OR strlen( $data_final ) >= 1 ) {

  $query .= "AND (data_hora > '$data_inicial_sql' AND data_hora < '$data_final_sql') ";

}



$query .= "AND rel_estabelecimentos_id = '$eid' ";



$query_full = $query;



$query .= "ORDER BY id DESC LIMIT $inicio,$limite";



// Run



$sql = mysqli_query( $db_con, $query );



$total_results = mysqli_num_rows( $sql );



	$sql_full = mysqli_query( $db_con, $query_full );




$total_results_full = mysqli_num_rows( $sql_full );



$total_paginas = Ceil($total_results_full / $limite) + ($limite / $limite);



if( !$pagina OR $pagina > $total_paginas OR !is_numeric($pagina) ) {



    $pagina = 1;



}



?>



<?php if( $_GET['msg'] == "erro" ) { ?>



<?php modal_alerta("Erro, tente novamente!","erro"); ?>



<?php } ?>



<?php if( $_GET['msg'] == "sucesso" ) { ?>



<?php modal_alerta("Ação efetuada com sucesso!","sucesso"); ?>



<?php } ?>




<div id="modalwhats" class="modal fade" role="dialog">
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <button type="button" class="close" data-dismiss="modal">×</button>
		<h4 class="modal-title">Observação para o motoboy (será anexada ao comprovante)</h4>
      </div>
      <div class="modal-body">
        <textarea id="userMessage" rows="4" cols="50"></textarea>
      </div>
      <div class="modal-footer">
	  	<a href="#" class="btn btn-default" style="background-color: black; color: white;" data-dismiss="modal">Fechar</a>
        <a href="#" id="whatsappButton" class="btn btn-success">Enviar <i class="lni lni-whatsapp"></i></a>
      </div>
    </div>
  </div>
</div>




<div class="middle minfit bg-gray">



	<div class="container">



		<div class="row">



			<div class="col-md-12">



				<div class="title-icon pull-left">

					<i class="lni lni-ticket-alt"></i>

					<span>Pedidos</span>

				</div>



				<div class="bread-box pull-right">

					<div class="bread">

						<a href="<?php panel_url(); ?>"><i class="lni lni-home"></i></a>

						<span>/</span>

						<a href="<?php panel_url(); ?>/pedidos">Pedidos</a>

					</div>

				</div>



			</div>



		</div>



		<!-- Filters -->



		<div class="row">



			<div class="col-md-12">



				<div class="panel-group panel-filters">

					<div class="panel panel-default">

						<div class="panel-heading">

							<h4 class="panel-title">

								<a data-toggle="collapse" href="#collapse-filtros">

									<span class="desc">Filtrar</span>

									<i class="lni lni-funnel"></i>

									<div class="clear"></div>

								</a>

							</h4>

						</div>

						<div id="collapse-filtros" class="panel-collapse collapse <?php if( $_GET['filtered'] ) { echo 'in'; }; ?>">

							<div class="panel-body">



								<form class="form-filters form-100" method="GET">



									<div class="row">

										<div class="col-md-4 col-xs-6 col-sm-6">

											<div class="form-field-default">

												<label>Nº:</label>

												<input type="text" name="numero" placeholder="Nº" value="<?php echo htmlclean( $numero ); ?>"/>

											</div>

										</div>

										<div class="col-md-4 col-xs-6 col-sm-6">

							              <div class="form-field-default">

							              <div class="clear"></div>

							               <label>Status:</label>

											<div class="fake-select">

												<i class="lni lni-chevron-down"></i>

												<select name="status">

													<option></option>

		                                            <?php for( $x = 0; $x < count( $numeric_data['status_pedido'] ); $x++ ) {
		                                            ?>

		                                            <option value="<?php echo $numeric_data['status_pedido'][$x]['value']; ?>" <?php if( $_GET['status'] == $numeric_data['status_pedido'][$x]['value'] ) { echo 'SELECTED'; }; ?>><?php echo $numeric_data['status_pedido'][$x]['name']; ?></option>

		                                            <?php } ?>

												</select>

											</div>

							              </div>

										</div>

										<div class="clear visible-xs visible-sm"></div>

										<div class="col-md-4">

											<div class="form-field-default">

												<label>Nome do cliente:</label>

												<input type="text" name="nome" placeholder="Nome" value="<?php echo htmlclean( $nome ); ?>"/>

											</div>

										</div>

										<div class="clear visible-xs visible-sm"></div>

										<div class="col-md-3 half-left col-sm-6 col-xs-6">

											<div class="form-field-default">

												<label>Data inicial:</label>

												<input class="maskdate datepicker" type="text" name="data_inicial" placeholder="Data inicial" value="<?php echo htmlclean( $data_inicial ); ?>"/>

											</div>

										</div>

										<div class="col-md-3 half-right col-sm-6 col-xs-6">

											<div class="form-field-default">

												<label>Data final:</label>

												<input class="maskdate datepicker" type="text" name="data_final" placeholder="Data inicial" value="<?php echo htmlclean( $data_final ); ?>"/>

											</div>

										</div>

										<div class="clear visible-xs visible-sm"></div>

										<div class="col-md-3 half-left col-sm-12 col-xs-12">

											<div class="form-field-default">

												<label>Cupom:</label>

												<input type="text" name="cupom" placeholder="Cupom" value="<?php echo htmlclean( $cupom ); ?>"/>

											</div>

										</div>

										<div class="clear visible-xs visible-sm"></div>

										<div class="col-md-3">

											<div class="form-field-default">

												<label class="hidden-xs hidden-sm"></label>

												<input type="hidden" name="filtered" value="1"/>

												<button>

													<span>Buscar</span>

													<i class="lni lni-search-alt"></i>

												</button>

											</div>

										</div>

									</div>

									<?php if( $_GET['filtered'] ) { ?>

									<div class="row">

										<div class="col-md-12">

										    <a href="<?php panel_url(); ?>/pedidos" class="limpafiltros"><i class="lni lni-close"></i> Limpar filtros</a>

										</div>

									</div>

									<?php } ?>

								</form>



							</div>

						</div>

					</div>

				</div> 



			</div>



		</div>



		<!-- / Filters -->



		<!-- Content -->



		<div class="listing">



			<div class="row">

				<div class="col-md-6 col-sm-6 col-xs-6">

					<span class="listing-title"><strong class="counter"><?php echo $total_results_full; ?></strong> Registros:</span>

				</div>

			</div>



			<div class="row">



				<div class="col-md-12">



					<table class="listing-table fake-table clean-table table-pedidos">

						<thead>

							<th>Nº</th>

							<th>Nome</th>

							<th>Whatsapp</th>

							<th>Status</th>

							<th>Data/Hora</th>

							<th></th>

						</thead>

						<tbody>



							<?php

                            while ( $data = mysqli_fetch_array( $sql ) ) {
                                
                                    // REMOVE OS PEDIDOS EXCLUIDOS DA LISTA E SÓ OS LISTA SE NA FILTRAGEM O STATUS ESTIVER COMO EXCLUIDO
                                    if ($data['status'] == 9 && $_GET['status'] != 9) {
                                        continue;
                                    }

                            ?>



							<tr class="fullwidth">

								<td>

                                    <span class="fake-table-title hidden-xs hidden-sm">Nº</span>

                                    <div class="fake-table-data"><span class="pedido-numero"></span>#<?php echo $data['id']; ?></span></div>

                                    <div class="fake-table-break"></div>

								</td>

								<td>

                                    <span class="fake-table-title hidden-xs hidden-sm">Nome</span>

                                    <div class="fake-table-data"><?php echo htmlclean( $data['nome'] ); ?></div>

                                    <div class="fake-table-break"></div>

								</td>

								<td class="hidden-xs hidden-sm">

                                    <span class="fake-table-title">Whatsapp</span>

                                    <a href="https://api.whatsapp.com/send?phone=<?php echo  preg_replace('/\D/', '', formato( $data['whatsapp'], "whatsapp" )); ?>" target="_blank">
                                        <div class="fake-table-data colored">
                                            
                                            <?php echo formato( $data['whatsapp'], "whatsapp" ); ?>
                                        </div>
                                    </a>


                                    <div class="fake-table-break"></div>

								</td>
								
								
								<td>

                                    <span class="fake-table-title hidden-xs hidden-sm">Status</span>

                                    <div class="fake-table-data">

                                    	<?php if( $data['status'] == "1" ) { ?>

                                    	    <script type="text/javascript">var audio=new Audio('../_layout/campainha.mp3');audio.addEventListener('canplaythrough',function(){audio.play();});</script>

                                    		<span class="badge badge-pendente">Pendente</span>

                                    	<?php } ?>

                                    	<?php if( $data['status'] == "2" ) { ?>

                                    		<span class="badge badge-concluido">Concluído</span>

                                    	<?php } ?>

                                    	<?php if( $data['status'] == "3" ) { ?>

                                    		<span class="badge badge-cancelado">Cancelado</span>

                                    	<?php } ?>

                                    	<?php if( $data['status'] == "4" ) { ?>

                                    		<span class="badge badge-cancelado">Aceito</span>

                                    	<?php } ?>

                                    	<?php if( $data['status'] == "5" ) { ?>

                                    		<span class="badge badge-cancelado">Para Entrega</span>

                                    	<?php } ?>

                                    	<?php if( $data['status'] == "6" ) { ?>

                                    		<span class="badge badge-cancelado">Disponível p/ Retirada</span>

                                    	<?php } ?>

										<?php if( $data['status'] == "7" ) { ?>

											<span class="badge " style="background-color: #ff0000d9;">Reembolsado</span>

										<?php } ?>

										<?php if( $data['status'] == "8" ) { ?>

											<span class="badge " style="background-color: blue;">Pago</span>

										<?php } ?>
										
										<?php if( $data['status'] == "9" ) { ?>

											<span class="badge " style="background-color: red;">Excluído</span>

										<?php } ?>



                                    </div>

                                    <div class="fake-table-break"></div>

								</td>

								<td>

                                    <span class="fake-table-title hidden-xs hidden-sm">Data/Hora</span>

                                    <div class="fake-table-data"><?php echo databr( $data['data_hora'] ); ?></div>

                                    <div class="fake-table-break"></div>

								</td>

								<td>

									<span class="fake-table-title hidden-xs hidden-sm">Ações</span>

                                    <div class="fake-table-data">

										<div class="form-actions pull-right">

										    <a class="color-green" href = "<?php panel_url(); ?>/pedidos/aceitar/?id=<?php echo $data['id']; ?>&nome=<?php echo $data['nome']; ?>&whats=<?php echo $data['whatsapp']; ?>" title="Aceitar"><i class="lni lni-checkmark"></i></a>

											 <a class="color-red" href = "<?php panel_url(); ?>/pedidos/disponivel/?id=<?php echo $data['id']; ?>&nome=<?php echo $data['nome']; ?>&whats=<?php echo $data['whatsapp']; ?>" title="Saiu para entrega"><i class="lni lni-bi-cycle"></i></a>
											 <a class="color-yellow" href = "<?php panel_url(); ?>/pedidos/?msg=motoboy&id=<?php echo $data['id']; ?>" title="Mensagem ao motoboy"><i class="lni lni-bi-cycle"></i></a>
											

											

											<a class="color-white" href = "<?php panel_url(); ?>/pedidos/concluir/?id=<?php echo $data['id']; ?>&nome=<?php echo $data['nome']; ?>&whats=<?php echo $data['whatsapp']; ?>" title="Concluir Pedido"><i class="lni lni-pointer-right"></i></a>

											<a class="color-white" href = "<?php panel_url(); ?>/pedidos/reembolsar/?id=<?php echo $data['id']; ?>&nome=<?php echo $data['nome']; ?>&whats=<?php echo $data['whatsapp']; ?>" title="Reembolsar"><i class="lni lni-share-alt"></i></a>


											

											<a target="_blank" class="color-white" href="<?php panel_url(); ?>/pedidos/imprimir2?id=<?php echo $data['id']; ?>" title="Imprimir"><i class="lni lni-printer"></i></a>

											<a class="color-yellow" href="<?php panel_url(); ?>/pedidos/editar?id=<?php echo $data['id']; ?>" title="Editar"><i class="lni lni-magnifier"></i></a>
											
											<a class="color-red" onclick="if(confirm('Tem certeza que deseja cancelar este pedido?')) document.location = '<?php panel_url(); ?>/pedidos/excluir/?id=<?php echo $data['id']; ?>&nome=<?php echo $data['nome']; ?>&whats=<?php echo $data['whatsapp']; ?>'" title="Excluir Pedido"><i class="lni lni-trash"></i></a>
											
											<!-- Antigo botão de exclusão -->
											<!-- <a class="color-red" onclick="if(confirm('Tem certeza que deseja cancelar este pedido?')) document.location = '<?php panel_url(); ?>/pedidos/deletar/?id=<?php echo $data['id']; ?>'" href="#" title="Excluir"><i class="lni lni-trash"></i></a> -->

										</div>

                                    </div>

                                    <div class="fake-table-break"></div>

								</td>

							</tr>



                            <?php } ?>



                            <?php if( $total_results == 0 ) { ?>



                               <tr class="fullwidth">

                                <td colspan="6">

                                  <div class="fake-table-data">

                                    <span class="nulled">Nenhum registro cadastrado ou compatível com a sua filtragem!</span>

                                  </div>

                                  <div class="fake-table-break"></div>

                                </td>

                               </tr>



                            <?php } ?>



						</tbody>

					</table>



				</div>



			</div>



		</div>



		<!-- / Content -->



		<!-- Pagination -->



        <div class="paginacao">



          <ul class="pagination">



            <?php

            $paginationpath = "pedidos";

            if($pagina > 1) {

              $back = $pagina-1;

              echo '<li class="page-item pagination-back"><a class="page-link" href=" '.get_panel_url().'/'.$paginationpath.'/?pagina='.$back.$getdata.' "><i class="lni lni-chevron-left"></i></a></li>';

            }

     

              for($i=$pagina-1; $i <= $pagina-1; $i++) {



                  if($i > 0) {

                  

                      echo '<li class="page-item pages-before"><a class="page-link" href=" '.get_panel_url().'/'.$paginationpath.'/?pagina='.$i.$getdata.' ">'.$i.'</a></li>';

                  }



              }



              if( $pagina >= 1 ) {



                echo '<li class="page-item active"><a class="page-link" href=" '.get_panel_url().'/'.$paginationpath.'/?pagina='.$i.$getdata.'" class="page-link">'.$i.'</a></li>';



              }



              for($i=$pagina+1; $i <= $pagina+1; $i++) {



                  if($i >= $total_paginas) {

                    break;

                  }  else {

                      echo '<li class="page-item pages-after"><a class="page-link" href=" '.get_panel_url().'/'.$paginationpath.'/?pagina='.$i.$getdata.' ">'.$i.'</a></li> ';

                  }

              

              }



            if($pagina < $total_paginas-1) {

              $next = $pagina+1;

              echo '<li class="page-item pagination-next"><a class="page-link" href=" '.get_panel_url().'/'.$paginationpath.'/?pagina='.$next.$getdata.' "><i class="lni lni-chevron-right"></i></a></li>';

            }



            ?>



          </ul>



        </div>



		<!-- / Pagination -->



	</div>



</div>


<script>
// Sistema de Impressão Automática - Versão Simplificada
document.addEventListener('DOMContentLoaded', function() {
    // 1. Configuração
    const ESTAB_ID = <?php echo $_SESSION['estabelecimento']['id']; ?>;
    let ultimoPedido = localStorage.getItem('ultimoPedido') || 0;
    
    // 2. Função para verificar novos pedidos (SIMPLES)
    function verificarPedidos() {
        fetch(`<?php echo panel_url(); ?>/pedidos/ultimo_pedido.php?estabelecimento=${ESTAB_ID}`)
            .then(r => r.json())
            .then(data => {
                if (data.id && data.id > ultimoPedido) {
                    console.log('🔥 NOVO PEDIDO:', data.id);
                    imprimirPedido(data.id);
                    ultimoPedido = data.id;
                    localStorage.setItem('ultimoPedido', ultimoPedido);
                }
            });
    }

    // 3. Função IMPRIMIR (à prova de bloqueios)
    function imprimirPedido(id) {
        // Cria um link invisível e clica automaticamente
        const link = document.createElement('a');
        link.href = `<?php echo panel_url(); ?>/pedidos/imprimir/?id=${id}`;
        link.target = '_blank';
        link.style.display = 'none';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => document.body.removeChild(link), 100);
    }

    // Verifica a cada 3 segundos (intervalo curto para testes)
    setInterval(verificarPedidos, 3000);
    
    // Primeira verificação imediata
    verificarPedidos();
});
</script>




<script>
// Sistema à Prova de Falhas
function imprimirPedidoAutomatico() {
    // 1. Pega o último pedido pendente da tabela visível
    const ultimoPedido = document.querySelector('tr.fullwidth .pedido-numero')?.textContent.replace('#','');
    
    if(ultimoPedido && !localStorage.getItem('impresso_'+ultimoPedido)) {
        // 2. Abre em nova janela
        const janela = window.open(
            `<?php echo panel_url(); ?>/pedidos/imprimir/?id=${ultimoPedido}`,
            `print_${ultimoPedido}`,
            'width=600,height=700'
        );
        
        // 3. Marca como impresso
        localStorage.setItem('impresso_'+ultimoPedido, 'true');
        
        // 4. Força impressão mesmo se pop-up bloquear
        setTimeout(() => {
            if(!janela || janela.closed) {
                location.href = `<?php echo panel_url(); ?>/pedidos/imprimir/?id=${ultimoPedido}&force_print=1`;
            }
        }, 1000);
    }
}

// Verifica a cada 3 segundos
setInterval(imprimirPedidoAutomatico, 3000);

// Primeira execução
imprimirPedidoAutomatico();
</script>




<?php 

// FOOTER

$system_footer .= "";

include('../_layout/rdp.php');

include('../_layout/footer.php');

?>



<script>



$( document ).ready(function() {



	$( "input[name=estabelecimento]" ).change(function() {

		$( "input[name=estabelecimento_id]" ).trigger("change");

	});



	$( "input[name=estabelecimento_id]" ).change(function() {

	    var estabelecimento = $(this).val();

	    $("#input-categoria").html("<option>-- Carregando categorias --</option>");

	    $("#input-categoria").load("<?php just_url(); ?>/_core/_ajax/categorias.php?estabelecimento="+estabelecimento);

	});



});





</script>




<?php
if ($_GET['msg'] == "motoboy") {
    $type = $_GET['msg'];
    $id = $_GET['id'];

    // Busca o pedido no banco de dados
    $pedidoQuery = mysqli_query($db_con, "SELECT * FROM pedidos WHERE id = '$id'");
    $pedido = mysqli_fetch_array($pedidoQuery);

    // Monta o endereço concatenando as colunas do banco
    $rua = $pedido['endereco_rua'] ?? '';
    $numero = $pedido['endereco_numero'] ?? '';
    $bairro = $pedido['endereco_bairro'] ?? '';
    $cidade = $pedido['cidade'] ?? ''; // Certifique-se de que esta coluna contém o nome da cidade
    $estado = $pedido['estado'] ?? ''; // Certifique-se de que esta coluna contém o estado
    $cep = $pedido['endereco_cep'] ?? '';

    // Verifica se os dados estão completos
    if (!empty($rua) && !empty($numero) && !empty($cidade) && !empty($estado)) {
        $endereco = "$rua, $numero, $bairro, $cidade, $estado, $cep";
        $enderecoFormatado = urlencode($endereco); // Formata para o Google Maps
        $googleMapsLink = "https://www.google.com/maps/search/?api=1&query=$enderecoFormatado";
    } else {
        $googleMapsLink = "Endereço não disponível. Verifique os dados do pedido.";
    }

    // Monta o comprovante
    $comprovante = urlencode($pedido['comprovante'] ?? 'Informação indisponível');

    // Gera o script com os dados
    echo '<script>';
    echo 'var predefinedMessage = decodeURIComponent("' . $comprovante . '").replace(/\\+/g, " ");';
    echo 'var googleMapsLink = "' . $googleMapsLink . '";';
    echo '$(document).ready(function() {';
    echo '    $("#modalwhats").modal("show");';
    echo '    $("#whatsappButton").on("click", function() {';
    echo '        var userMessage = $("#userMessage").val();';
    echo '        var whatsappMessage = "*Observação:* " + userMessage + "\\n\\nComprovante\\n\\n" + predefinedMessage + "\\n\\n*Endereço no Google Maps:* " + googleMapsLink;';
    echo '        window.open("https://api.whatsapp.com/send?text=" + encodeURIComponent(whatsappMessage), "_blank");';
    echo '    });';
    echo '});';
    echo '</script>';
}
?>







<!--funcionando sem a do moto boy-->
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel de Pedidos</title>
    <script>
        function verificarUrlEAtualizar() {
            const urlAtual = window.location.pathname;
            const urlDesejada = '/painel/pedidos/';

            // Se a URL atual for a desejada, ativa a atualização automática
            if (urlAtual === urlDesejada) {
                // Atualiza a página a cada 2 minutos
                setTimeout(() => {
                    location.reload();
                }, 120000); // 120000 milissegundos = 2 minutos
            } else {
                // Se a URL não for a desejada, redireciona de volta
                window.location.href = urlDesejada;
            }
        }

        // Executa a verificação ao carregar a página
        window.addEventListener('load', verificarUrlEAtualizar);

        // Função para abrir links em nova guia
        function abrirNovaGuia(url) {
            window.open(url, '_blank'); // Abre a URL em uma nova guia
        }
    </script>
</head>
<body>
   <!-- <h1>Painel de Pedidos</h1>
    <button onclick="abrirNovaGuia('/outra-pagina');">Abrir Outra Página</button>
    <button onclick="abrirNovaGuia('/outra-pagina2');">Abrir Outra Página 2</button>
    <!-- Adicione mais botões conforme necessário -->
</body>
</html>





