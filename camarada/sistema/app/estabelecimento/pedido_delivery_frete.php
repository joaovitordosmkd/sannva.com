<?php

// CORE
include($virtualpath.'/_layout/define.php');

// APP
global $app;
is_active( $app['id'] );
$back_button = "true";

// Querys
$exibir = "8";
$app_id = $app['id'];
$query_content = mysqli_query( $db_con, "SELECT * FROM estabelecimentos WHERE id = '$app_id' ORDER BY id ASC LIMIT 1" );
$data_content = mysqli_fetch_array( $query_content );
$has_content = mysqli_num_rows( $query_content );

// SEO
$seo_subtitle = $app['title']." - Meu pedido";
$seo_description = "Meu pedido ".$app['title']." no ".$seo_title;
$seo_keywords = $app['title'].", ".$seo_title;
$seo_image = thumber( $app['avatar_clean'], 400 );

// HEADER
$system_header .= "";
include($virtualpath.'/_layout/head.php');
include($virtualpath.'/_layout/top.php');
include($virtualpath.'/_layout/sidebars.php');
include($virtualpath.'/_layout/modal.php');
include($virtualpath.'/../../_core/_includes/functions/frete.php');

//variaveis globais para calculo de frete
$cep = "";
$largura = 0;
$altura = 0;
$comprimento = 0;
$peso = 0;

//fim globais , salientar que essas var sofrem alteracao la em baixo com o for

if(isset($_COOKIE['cep'])){ 
	$cep = $_COOKIE['cep'];
} else { 
	$cep = $_SESSION['checkout']['endereco_cep'];
}

if(isset($_GET['cep']) && strlen($_GET['cep']) >= 8){ 
	$cep = preg_replace("/[^0-9]/", "", $_GET['cep']);
}

if (!empty($cep)) {
	$cep_destino = $cep;
	$cep_origem = data_info( "estabelecimentos", $app['id'], "endereco_cep");
	$cep_origem = preg_replace("/[^0-9]/", "", $cep_origem);
	$fretes = calcular_frete_pacote($cep_origem, $cep_destino, $altura, $largura, $comprimento, $peso);
	if (empty($fretes)) {
		$frete_error = "Não foi possivel calcular o frete.";
	}
}

?>

<?php

	// Globals
	$eid = $app['id'];
	global $numeric_data;

	// Cupom
  	$datetime = date("Y-m-d H:i:s");
	$cupom = strtoupper( mysqli_real_escape_string( $db_con, $_GET['cupom'] ) );

	if( $cupom ) {
		$checkcupom = mysqli_query( $db_con, "SELECT * FROM cupons WHERE codigo = '$cupom' AND rel_estabelecimentos_id = '$eid' LIMIT 1");
		$hascupom = mysqli_num_rows( $checkcupom );
		$datacupom = mysqli_fetch_array( $checkcupom );

		if( !$hascupom ) {
			$cupom_use = "0";
			$cupom_msg = "Cupom inválido ou expirado";
		}

		if( $hascupom ) {
			if( $datacupom['quantidade'] <= 0 OR $datetime >= $datacupom['validade'] ) {
				$cupom_use = "0";
				$cupom_msg = "Cupom inválido ou expirado!";
			} else {
				if( $datacupom['tipo'] == "1" ) {
					$cupom_desconto = $datacupom['desconto_porcentagem']."%";
				}
				if( $datacupom['tipo'] == "2" ) {
					$cupom_desconto = "R$ ".dinheiro( $datacupom['desconto_fixo'], "BR");
				}
				$cupom_use = "1";
				$cupom_msg = "Cupom ativo (".$cupom_desconto." de desconto)!";
			}
		}
	}

	// Checar se formulário foi executado
	$formdata = $_POST['formdata'];

if( $formdata ) {
  		$token = session_id();
    	// Setar campos
		$datetime = date('Y-m-d H:i:s');

		// Dados gerais
		$rel_estabelecimentos_id = $app['id'];
		$rel_segmentos_id = data_info( "estabelecimentos",$rel_estabelecimentos_id,"segmento" );
		$nome = mysqli_real_escape_string( $db_con, $_POST['nome'] );
		$cookie_name = "nomecli";
		$cookie_value1 = $nome;
		setcookie($cookie_name, $cookie_value1, time() + (86400 * 90));
		$whatsapp = clean_str( mysqli_real_escape_string( $db_con, $_POST['whatsapp'] ) );
		$cookie_cel = "celcli";
		$cookie_value2 = $whatsapp;
		setcookie($cookie_cel, $cookie_value2, time() + (86400 * 90));
		$forma_entrega = mysqli_real_escape_string( $db_con, $_POST['forma_entrega'] );
		$quicksql = mysqli_query( $db_con, "SELECT * FROM frete WHERE id = '$forma_entrega' LIMIT 1" );
		$quickdata = mysqli_fetch_row($quicksql) ;
		$taxa = $quickdata[3];

		$frete_correios = mysqli_real_escape_string( $db_con, $_POST['frete_correios'] );
		$detalhes_frete = "";
		$valor_itens = 0;
		if(!empty($frete_correios)){
			$frete_correios = explode( "__", $frete_correios );
			$taxa = $frete_correios[1];
			$detalhes_frete = $frete_correios[0];

			// $valor_itens = $vpedido;
			// $vpedido += $taxa;
		}

		// Recuperando Valor da Taxa
		$estado = mysqli_real_escape_string( $db_con, $_POST['estado'] );
		$cidade = mysqli_real_escape_string( $db_con, $_POST['cidade'] );
		$endereco_cep = mysqli_real_escape_string( $db_con, $_POST['endereco_cep'] );
		$cookie_num = "cep";
		$cookie_value3 = $endereco_cep;
		setcookie($cookie_num, $cookie_value3, time() + (86400 * 90));
		$endereco_numero = mysqli_real_escape_string( $db_con, $_POST['endereco_numero'] );
		$cookie_num = "numero";
		$cookie_value3 = $endereco_numero;
		setcookie($cookie_num, $cookie_value3, time() + (86400 * 90));
		$endereco_bairro = mysqli_real_escape_string( $db_con, $_POST['endereco_bairro'] );
		$endereco_rua = mysqli_real_escape_string( $db_con, $_POST['endereco_rua'] );
		$endereco_complemento = mysqli_real_escape_string( $db_con, $_POST['endereco_complemento'] );
		$endereco_referencia = mysqli_real_escape_string( $db_con, $_POST['endereco_referencia'] );
		$forma_pagamento = mysqli_real_escape_string( $db_con, $_POST['forma_pagamento'] );
		$forma_pagamento_informacao = mysqli_real_escape_string( $db_con, $_POST['forma_pagamento_informacao'] );
		$mesa = 0;

		if(!$forma_pagamento_informacao) {
		    $forma_pagamento_informacao = "Não preciso de troco";
		}
		$vpedido = mysqli_real_escape_string( $db_con, $_POST['vpedido'] );
		$res = mysqli_query( $db_con, "SELECT valor FROM frete WHERE id = '$forma_entrega' AND rel_estabelecimentos_id = '$eid' LIMIT 1");
		$row = mysqli_fetch_row($res);

		if ($row) {
			$tpedido = $row[0];
		} else {
			$tpedido = 0;
		}
		$data_hora = $datetime;

		// Checar Erros
		$checkerrors = 0;
		$errormessage = array();

		// Geral
		// -- Nome
		if( !$nome ) {
			$checkerrors++;
			$errormessage[] = "Informe seu nome";
		}

		// -- Whatsapp
		if( !$whatsapp ) {
			$checkerrors++;
			$errormessage[] = "Informe seu nº de whatsapp";
		}

		// -- Endereço
		if( $forma_entrega == "2" ) {
			if( !$endereco_rua && !$endereco_bairro && !$endereco_numero ) {
				$checkerrors++;
				$errormessage[] = "O endereço não pode estar incompleto";
			}
		}
   		// Executar registro

    if( !$checkerrors ) {

		if( $pedido = new_pedido(
			$token,
			$rel_segmentos_id,
			$rel_estabelecimentos_id,
			$nome,
			$whatsapp,
			$estado,
			$cidade,
			$forma_entrega,
			$endereco_cep,
			$endereco_numero,
			$endereco_bairro,
			$endereco_rua,
			$endereco_complemento,
			$endereco_referencia,
			$forma_pagamento,
			$forma_pagamento_informacao,
			$data_hora,
			$cupom,
			$vpedido,
			$taxa,
			$detalhes_frete,
			$valor_itens
		)){

      		// Mercado Pago
    		if ($forma_pagamento == 7) {
    			header("Location: ".$app['url']."/mercadopago?pedido=".$pedido."&forma=".$forma_pagamento."&codex=".$vpedido."&taxa=".$tpedido);
    		// PagSeguro

    		} else if ($forma_pagamento == 8) {
    			header("Location: ".$app['url']."/pagseguro?pedido=".$pedido."&forma=".$forma_pagamento."&codex=".$vpedido."&taxa=".$tpedido);
    		//Getnet
    		} else if ($forma_pagamento == 9) {
    
    			header("Location: ".$app['url']."/getnet?pedido=".$pedido."&forma=".$forma_pagamento."&codex=".$vpedido."&taxa=".$tpedido);

    		// PIX, DINHEIRO, TICKETS E OUTROS.
    		} else {
    			unset( $_SESSION['sacola'][$app['id']] );
    			header("Location: ".$app['url']."/obrigado?pedido=".$pedido."&forma=".$forma_pagamento."&codex=".$vpedido."&taxa=".$tpedido);
    		}
		} else {
			header("Location: ".$app['url']."/pedido?msg=error");
		}
    }
}

?>

<script src="https://unpkg.com/htmx.org@2.0.3" integrity="sha384-0895/pl2MU10Hqc6jd4RvrthNlDiE9U1tWmX7WRESftEDRosgxNsQG/Ze9YMRzHq" crossorigin="anonymous"></script>
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

<div class="minfit sceneElement">
		<div class="middle">
			<div class="container nopaddmobile">
				<div class="row rowtitle">
					<div class="col-md-12">
						<div class="title-icon">
							<span>Checkout Seguro🛡️</span>
						</div>
						<div class="bread-box">
							<div class="bread">
								<a href="<?php echo $app['url']; ?>"><i class="lni lni-home"></i></a>
								<span>/</span>
								<a href="<?php echo $app['url']; ?>/sacola.php">Minha Sacola</a>
								<span>/</span>
								<a href="<?php echo $app['url']; ?>/pedido.php">Seção de Pedidos</a>
							</div>
						</div>
					</div>

					<div class="col-md-12 hidden-xs hidden-sm">
						<div class="clearline"></div>
					</div>
				</div>

				<div class="row">
					<div class="col-md-12">
					  <?php if( $checkerrors ) { list_errors(); } ?>
					  <?php if( $_GET['msg'] == "erro" ) { ?>
					    <?php modal_alerta("Erro, tente novamente!","erro"); ?>
					  <?php } ?>

					  <?php if( $_GET['msg'] == "sucesso" ) { ?>
					    <?php modal_alerta("Cadastro efetuado com sucesso!","sucesso"); ?>
					  <?php } ?>
					</div>
				</div>

				<div class="pedido">
					<form id="the_form" method="POST">
						<div class="row">
							<div class="col-md-8 muda-checkout">
								<div class="titler">
									<div class="row">
										<div class="col-md-12">
											<div class="title-line mt-0 pd-0">
												<i class="lni lni-user"></i>
												<span>Dados do cliente</span>
												<div class="clear"></div>
											</div>
										</div>
									</div>
								</div>
								<div class="elemento-usuario">
									<div class="row">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Nome completo:</label>
										      <input type="text" name="nome" placeholder="Nome:" <?php if(isset($_COOKIE['nomecli'])){ ?> value="<?php print $_COOKIE['nomecli']; ?>" <?php } else { ?> value="<?php echo htmlclean( $_SESSION['checkout']['nome'] ); ?>" <?php } ?>>
										  </div>
										</div>
									</div>
									<div class="row">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Whatsapp:</label>
										      <input class="maskcel" type="text" name="whatsapp" placeholder="Whatsapp:" <?php if(isset($_COOKIE['celcli'])){ ?> value="<?php print $_COOKIE['celcli']; ?>" <?php } else { ?> value="<?php echo htmlclean( $_SESSION['checkout']['whatsapp'] ); ?>" <?php } ?>>
										  </div>
										</div>
									</div>
								</div>
								<div class="titler mtminus">
									<div class="row">
										<div class="col-md-12">
											<div class="title-line mt-0 pd-0">
												<i class="lni lni-cart"></i>
												<span>Entrega</span>
												<div class="clear"></div>
											</div>
										</div>
									</div>
								</div>

								<div class="elemento-entrega">
									<input type="hidden" name="estado" value="<?php echo $app['estado']; ?>">
									<input type="hidden" name="cidade" value="<?php echo $app['cidade']; ?>">
									<!-- <span class="form-tip">Entrega: <?php echo $frete_valor; ?></span> -->
									
									<div class="row">
										<div class="col-md-6 col-sm-6 col-xs-6">
										  <div class="form-field-default">
										      <label>CEP</label>
										      <input class="maskcep" type="text" name="endereco_cep" placeholder="CEP" <?php if(isset($_COOKIE['cep'])){ ?> value="<?php print $_COOKIE['cep']; ?>" <?php } else { ?> value="<?php echo htmlclean( $_SESSION['checkout']['endereco_cep'] ); ?>" <?php } ?> required hx-get="#" hx-trigger="change" hx-swap="outerHTML" hx-target="#frete" hx-select="#frete">
										  </div>
										</div>
										<div class="col-md-6 col-sm-6 col-xs-6">
										  <div class="form-field-default">
										      <label>Nº</label>
										      <input type="text" name="endereco_numero" placeholder="Nº" <?php if(isset($_COOKIE['numero'])){ ?> value="<?php print $_COOKIE['numero']; ?>" <?php } else { ?> value="<?php echo htmlclean( $_SESSION['checkout']['endereco_numero'] ); ?>" <?php } ?>>
										  </div>
										</div>
									</div>
									<div class="row">
										<input type="hidden" name="endereco_bairro" value="<?php echo htmlclean( $_SESSION['checkout']['endereco_bairro'] ); ?>">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Rua</label>
										      <input type="text" name="endereco_rua" placeholder="Rua" value="<?php echo htmlclean( $_SESSION['checkout']['endereco_rua'] ); ?>">
										  </div>
										</div>
									</div>
									<div class="row">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Complemento</label>
										      <input type="text" name="endereco_complemento" placeholder="Complemento" value="<?php echo htmlclean( $_SESSION['checkout']['endereco_complemento'] ); ?>">
										  </div>
										</div>
									</div>
									<div class="row">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Ponto de referência</label>
										      <input type="text" name="endereco_referencia" placeholder="Complemento" value="<?php echo htmlclean( $_SESSION['checkout']['endereco_referencia'] ); ?>">
										  </div>
										</div>
									</div>
								</div>
								
								<?php if ( data_info( "estabelecimentos", $app['id'], "calcular_frete") == "1" ): ?>
								<div class="row" id="frete">
									<div class="col-md-12">
										<div class="form-field-default">
										<label>Escolha o Frete</label>
											<?php if (!empty($fretes)): ?>
												<?php foreach ($fretes as $frete): ?>
													<?php if ($frete['price'] && ($frete['name'] == "PAC" || $frete['name'] == "SEDEX")): ?>
														<div class="form-field-radio">
															<input type="radio" name="frete_correios" value="<?= $frete['name']."__".$frete['price']; ?>" > <?php echo $frete['name']; ?> - R$ <?php echo dinheiro($frete['price'], "BR"); ?> <br>
															<small><?= $frete['delivery_range']["min"]; ?> a <?= $frete['delivery_range']["max"]; ?> dias</small>
														</div>
													<?php endif; ?>
												<?php endforeach; ?>
											<?php else: ?>
												<div class="form-field-radio">
													<span>Informe o cep para calcular o frete</span>
												</div>
											<?php endif; ?>

										</div>
									</div>
								</div>
								<?php endif; ?>

								<div class="titler mtminus">

									<div class="row">



										<div class="col-md-12">



											<div class="title-line mt-0 pd-0">

												<i class="lni lni-coin"></i>

												<span>Pagamento</span>

												<div class="clear"></div>

											</div>



										</div>



									</div>



								</div>



								<div class="elemento-forma-pagamento">



									<div class="row">



										<div class="col-md-12">



										  <div class="form-field-default">



										      <label>Forma de pagamento:</label>

												<div class="fake-select">

													<i class="lni lni-chevron-down"></i>

													<select id="input-forma-pagamento" name="forma_pagamento">

													  <?php if( $data_content['pagamento_dinheiro'] == "1" ) { ?>

													  <option value="1" SELECTED>Dinheiro</option>

													  <?php } ?>

													  <?php if( $data_content['pagamento_cartao_debito'] == "1" ) { ?>

													  <option value="2">Enviar maquininha</option>

													  <?php } ?>

													  <?php if( $data_content['pagamento_cartao_credito'] == "1" ) { ?>

												<!--	  <option value="3">Cartão de Crédito</option>

													  <?php } ?>-->

													  <?php if( $data_content['pagamento_pix'] == "1" ) { ?>

													  <option value="6">PIX</option>

													  <?php } ?>

													  

													  

													  <!---->

													  

													   <?php if( $data_content['pagamento_mercadopago'] == "1" ) { ?>

													  <option value="7">Mercado Pago</option>

													  <?php } ?>

													  

													  

													  

													  <?php if( $data_content['pagamento_pagseguro'] == "1" ) { ?>

													  <option value="8">PagSeguro</option>

													  <?php } ?>

													  

													  

													  <?php if(

									    				$data_content['pagamento_getnet'] == "1" ) { ?>

													  <option value="9">Getnet</option>

													  <?php } ?>

													  

													  

													  

													  <!---->

													  <?php if( $data_content['pagamento_cartao_alimentacao'] == "1" ) { ?>
													  <option value="4">Ticket alimentação</option>
													  <?php } ?>

													  	<?php if( $data_content['pagamento_outros'] == "1" ) { ?>
													  	<option value="5">Outros</option>
														<?php } ?>

													</select>
													<div class="clear"></div>
												</div>
										  </div>
										</div>
									</div>
								</div>

								<div class="elemento-forma-pagamento-descricao">
									<div class="row">
										<div class="col-md-12">
										  <div class="form-field-default">
										      <label>Deseja troco?</label>
										      <span class="form-tip" style="display: none;"></span>
										      <input type="text" name="forma_pagamento_informacao" placeholder="Deixe em branco se não precisar" value="<?php echo htmlclean( $_SESSION['checkout']['forma_pagamento_informacao'] ); ?>">
										  </div>
										</div>
									</div>
								</div>

								<div class="row">
									<div class="col-md-9">
									  <div class="form-field-default">
									      <label>Cupom de desconto:</label>
									      <input class="strupper" type="text" name="cupom" placeholder="Código do cupom" value="<?php echo $cupom; ?>">
									  </div>
									</div>

									<div class="col-md-3">
									  <div class="form-field-default">
									      <label class="hidden-xs hidden-sm"> </label>
									      <span class="botao-acao botao-aplicar"><i class="lni lni-ticket"></i> Aplicar</span>
									  </div>
									</div>
								</div>

								<div class="row">
									<div class="col-md-12">

										<?php if( $cupom_use == "0" ) { ?>

											<span class="cupom-msg cupom-fail"><?php echo $cupom_msg; ?></span>

										<?php } ?>

										<?php if( $cupom_use == "1" ) { ?>

											<span class="cupom-msg cupom-ok"><?php echo $cupom_msg; ?></span>

										<?php } ?>

									</div>
								</div>
							</div>

							<div class="col-md-4 muda-comprovante">
								<div class="titler titlerzero">
									<div class="row">
										<div class="col-md-12">
											<div class="title-line mt-0 pd-0">
												<i class="lni lni-ticket-alt"></i>
												<span>Resumo do pedido</span>
												<div class="clear"></div>
											</div>
										</div>
									</div>
								</div>

								<div class="comprovante-parent grudado-desktop">
									<div class="comprovante">
										<div class="content"></div>
									</div>
									<span class="alerta-comprovante">
										Tudo certo! Vamos finalizar seu pedido 🛒✨
										<br/>
									</span>
								</div>
								<div class="clear"></div>
							</div>
						</div>

						<div class="pedido-actions">
							<div class="row error-pedido-minimo">
								<div class="col-md-12">

									<?php

									$eid = $app['id'];

									$subtotal = array();

									foreach( $_SESSION['sacola'][$eid] AS $key => $value ) {

										$produto = $value['id'];

										$query_produtos = mysqli_query( $db_con, "SELECT * FROM produtos WHERE id = '$produto' AND status = '1' ORDER BY id ASC LIMIT 1" );

										$data_produtos = mysqli_fetch_array( $query_produtos );

										if( $data_produtos['oferta'] == "1" ) {

											$valor_final = $data_produtos['valor_promocional'];

										} else {

											$valor_final = $data_produtos['valor'];

										}

										$subtotal[] = ( ( $valor_final + $_SESSION['sacola'][$eid][$key]['valor_adicional'] ) * $_SESSION['sacola'][$eid][$key]['quantidade'] );

										// Soma as dimensões multiplicadas pela quantidade
										$largura_total     += $data_produtos['largura'];
										$altura_total      += $data_produtos['altura'];
										$comprimento_total += $data_produtos['comprimento'];
										$peso_total        += $data_produtos['peso'];

									}



									$subtotal = array_sum( $subtotal );

									if( $subtotal >= $app['pedido_minimo_valor'] ) {

										$field_minimo = "1";

									}

									?>

									<input type="text" class="hidden" name="vpedido" value="<?php echo $subtotal; ?>"/>
									<input type="text" class="fake-hidden" name="pedido_minimo" value="<?php echo $field_minimo; ?>"/>
								</div>
							</div>
							<div class="row">
								<div class="col-md-3 col-xs-5 col-sm-5">
									<a class="back-button" href="<?php echo $app['url']; ?>/sacola"><i class="lni lni-arrow-left"></i> <span>Alterar</span></a>
								</div>
								<div class="col-md-3 col-xs-7 col-sm-7">
    <input type="hidden" name="formdata" value="1"/>
    <button class="botao-acao">
        <i class="lni lni-shopping-basket"></i> 
        <span>Finalizar Pedido</span>
    </button>
</div>
							</div>
						</div>
					</form>
				</div>
			</div>
		</div>
</div>

<?php 

// FOOTER

$system_footer .= "";

//include($virtualpath.'/_layout/rdp2.php');

include($virtualpath.'/_layout/footer.php');

?>

<script>

	$( ".botao-aplicar" ).click(function() {
		var cupom = $("input[name='cupom']").val();

		var gourl = "<?php echo $app['url'].'/pedido_delivery?cupom=';?>"+cupom;

		window.location.href = gourl;
	});
	// Autopreenchimento de estado

	$( "#input-estado" ).change(function() {

		<?php

		if( $_SESSION['checkout']['cidade'] && is_numeric( $_SESSION['checkout']['cidade'] ) ) {

			$cidade = mysqli_real_escape_string( $db_con, $_SESSION['checkout']['cidade'] );

		} else {

			$cidade = $app['cidade'];

		}

		?>

		var estado = $(this).children("option:selected").val();

		var cidade = "<?php echo $cidade; ?>";

		$("#input-cidade").html("<option>-- Carregando cidades --</option>");

		$("#input-cidade").load("<?php $app['url'] ?>/_core/_ajax/cidades.php?estado="+estado+"&cidade="+cidade);

	});

	$( "#input-estado" ).trigger("change");

	$( window ).resize(function() {



		var window_width = parseInt( $( window ).width(), 10);

		var height_muda_checkout = parseInt( ( $(".muda-checkout").height() - 150 ), 10);

		var height_muda_comprovante = parseInt( $(".comprovante").height(), 10);

		if( height_muda_comprovante == 0 ) {

			var height_muda_comprovante = parseInt( height_muda_checkout, 10);

		}



		if( window_width >= 980 ) {

			var footer_height = $('.footer').height(); 

			var actions_height = $('.pedido-actions').height();

			var limit_bottom = ( actions_height + footer_height + 50 );

			if( height_muda_checkout > height_muda_comprovante  ) {

				$('.grudado-desktop').sticky({topSpacing:0, bottomSpacing:limit_bottom});

			} else {

				if( $(".sticky-wrapper").hasClass("is-sticky") ) {

					$('.grudado-desktop').unstick();

					$('.muda-comprovante').css("margin-bottom","64px");
				}
			}
		}
	});

	$( window ).trigger("resize");

	$(document).ready( function() {
		var form = $("#the_form");

		form.validate({
			focusInvalid: true,
			invalidHandler: function() {
			},
			errorPlacement: function errorPlacement(error, element) { element.after(error); },
			rules:{
				nome: {
					required: true
				},
				whatsapp: {
					required: true
				},
				forma_entrega: {
					required: true
				},
				endereco_bairro: {
					required: true
				},
				endereco_rua: {
					required: true
				},
				forma_pagamento: {
					required: true
				},
				frete_correios: {
					required: true
				},
				pedido_minimo: {
					required: true
				}
			},

			messages:{
				nome: {
					required: "Esse campo é obrigatório"
				},
				whatsapp: {
					required: "Esse campo é obrigatório"
				},
				forma_entrega: {
					required: "Esse campo é obrigatório"
				},
				endereco_bairro: {
					required: "Esse campo é obrigatório"
				},
				endereco_rua: {
					required: "Esse campo é obrigatório"
				},
				forma_pagamento: {
					required: "Esse campo é obrigatório"
				},
				frete_correios: {
					required: "Esse campo é obrigatório"
				},
				pedido_minimo: {
					required: "Você deve ter no minimo R$ <?php echo $app['pedido_minimo']; ?> na sacola para poder efetuar a compra"
				}
			}
		});


		$('input[name="frete_correios"]').change(function() {
			// Obtém o valor do input selecionado
			var selectedValue = $(this).val();
			
			// Executa o código desejado
			console.log("Opção selecionada: " + selectedValue);
			$( ".muda-checkout" ).trigger("change");
		});

		$("input[name='endereco_cep']").change(function() {
			var cep = $(this).val();
			console.log("Cep alterado");
			console.log(cep);

			if( cep.length == 9 ) {
				htmx.ajax('GET', '?cep='+cep, {target:'#frete', select:'#frete', swap:'outerHTML'});
			}
		});

	});

</script>

<script>
	var token = "<?php echo session_id(); ?>";

	$( ".muda-checkout" ).change(function() {
		
		var nome = $( "input[name='nome']" ).val();
		var whatsapp = $( "input[name='whatsapp']" ).val();
		var forma_entrega = $( "select[name='forma_entrega'] option:selected" ).val();
		var estado = $( "select[name='estado'] option:selected" ).val();
		var cidade = $( "select[name='cidade'] option:selected" ).val();
		var endereco_cep = $( "input[name='endereco_cep']" ).val();
		var endereco_numero = $( "input[name='endereco_numero']" ).val();
		var endereco_bairro = $( "input[name='endereco_bairro']" ).val();
		var endereco_rua = $( "input[name='endereco_rua']" ).val();
		var endereco_complemento = $( "input[name='endereco_complemento']" ).val();
		var endereco_referencia = $( "input[name='endereco_referencia']" ).val();
		var forma_pagamento = $( "select[name='forma_pagamento'] option:selected" ).val();
		var forma_pagamento_informacao = $( "input[name='forma_pagamento_informacao']" ).val();
		var modo = "checkout";
		var quantidade = $(this).find("input[name=quantidade]").val();
		var observacoes = $(this).find("textarea[name=observacoes]").val();
		var cupom = $( "input[name='cupom']" ).val();
		var frete_correios = $( "input[name='frete_correios']:checked" ).val();

		$.post( "<?php $app['url'] ?>/app/estabelecimento/_ajax/sacola.php", { 

			token: token,

			modo: modo,

			nome: nome,

			whatsapp: whatsapp,

			forma_entrega: forma_entrega,

			cidade: cidade,

			estado: estado,

			endereco_cep: endereco_cep,

			endereco_numero: endereco_numero,

			endereco_bairro: endereco_bairro,

			endereco_rua: endereco_rua,

			endereco_complemento: endereco_complemento,

			endereco_referencia: endereco_referencia,

			forma_pagamento: forma_pagamento,

			forma_pagamento_informacao: forma_pagamento_informacao,

			cupom: cupom,

			frete_correios: frete_correios

		})

		.done(function( data ) {
			console.log("alterou checkout da sacola");
		});

		var eid = "<?php echo $app['id']; ?>";
		

		atualiza_comprovante(eid,token);
		form.validate().settings.ignore = ":disabled,:hidden";

	});

	$( "#input-forma-entrega" ).change(function() {



		var forma_entrega = $(this).val();



		if( forma_entrega == "retirada" ) {

			$( ".elemento-entrega" ).hide();

		}



		if( forma_entrega != "retirada" ) {

			$( ".elemento-entrega" ).show();

		}



	});

	$( "#input-forma-pagamento" ).change(function() {



		var forma_pagamento = $(this).val();



		if( forma_pagamento == "1" ) {

			$( ".elemento-forma-pagamento-descricao" ).show();

			$( ".elemento-forma-pagamento-descricao label" ).html("Deseja troco para:");

			$( ".elemento-forma-pagamento-descricao input" ).attr("placeholder","Deixe em branco caso não precise");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).hide();

		}



		if( forma_pagamento == "2"  ) {

			$( ".elemento-forma-pagamento-descricao" ).show();

			$( ".elemento-forma-pagamento-descricao label" ).html("Bandeira do cartão:");

			$( ".elemento-forma-pagamento-descricao input" ).attr("placeholder","Bandeira do cartão:");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).html("Bandeiras aceitas: <?php echo $data_content['pagamento_cartao_debito_bandeiras']; ?>");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).show();

		}



		if( forma_pagamento == "3"  ) {

			$( ".elemento-forma-pagamento-descricao" ).show();

			$( ".elemento-forma-pagamento-descricao label" ).html("Bandeira do cartão:");

			$( ".elemento-forma-pagamento-descricao input" ).attr("placeholder","Bandeira do cartão:");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).html("Bandeiras aceitas: <?php echo $data_content['pagamento_cartao_credito_bandeiras']; ?>");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).show();

		}



		if( forma_pagamento == "4"  ) {



			$( ".elemento-forma-pagamento-descricao" ).show();

			$( ".elemento-forma-pagamento-descricao label" ).html("Bandeira do ticket alimentação:");

			$( ".elemento-forma-pagamento-descricao input" ).attr("placeholder","Bandeira do ticket alimentação:");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).html("Bandeiras aceitas: <?php echo $data_content['pagamento_cartao_alimentacao_bandeiras']; ?>");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).show();

		}



		if( forma_pagamento == "5"  ) {

			$( ".elemento-forma-pagamento-descricao" ).show();

			$( ".elemento-forma-pagamento-descricao label" ).html("Forma de pagamento:");

			$( ".elemento-forma-pagamento-descricao input" ).attr("placeholder","Forma de pagamento:");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).html("Formas aceitas: <?php echo $data_content['pagamento_outros_descricao']; ?>");

			$( ".elemento-forma-pagamento-descricao .form-tip" ).show();

		}



		if( forma_pagamento == "6"  ) {

			$( ".elemento-forma-pagamento-descricao" ).hide();

		}		

		if( forma_pagamento == "7" ) {
			$( ".elemento-forma-pagamento-descricao" ).hide();
		}

		if( forma_pagamento == "8" ) {
			$( ".elemento-forma-pagamento-descricao" ).hide();	
		}

		if( forma_pagamento == "9" ) {
			$( ".elemento-forma-pagamento-descricao" ).hide();	
		}

	});

	$( "#input-forma-entrega" ).trigger("change");
	$( ".muda-checkout" ).trigger("change");
	$( "#input-forma-pagamento" ).trigger("change");
	$( "input[name='frete_correios']" ).trigger("change");

</script>
<script src="<?php just_url(); ?>/_core/_cdn/cep/cep.js"></script>