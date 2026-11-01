<?php

// CORE

include($virtualpath.'/_layout/define.php');
require('config.php');


// // APP

global $app;
global $db_con;

// //PAGUSEGURO CONFIG
// include('config.php');

//Se PagSeguro está ativo
if ($data_estabelecimento['pagamento_getnet'] == 2) {
    header("Location: ".$app['url']."/sacola");
}

is_active( $app['id'] );

$back_button = "true";

// Querys

$exibir = "8";

$app_id = $app['id'];

$pedido = mysqli_real_escape_string( $db_con, $_GET['pedido'] );

$forma_pagamento = mysqli_real_escape_string( $db_con, $_GET['forma'] );

$vpedido = mysqli_real_escape_string( $db_con, $_GET['codex'] );

$tpedido = mysqli_real_escape_string( $db_con, $_GET['taxa'] );




if ($tpedido > 0)

	$vpedido += $tpedido;



$whatsapp_linkx = whatsapp_link( $pedido );



if($forma_pagamento == 6) {

    

$msg1="\n";

$msg1.="*O cliente confirmou o pagamento deste pedido via PIX*\n";

$msg1;

$text1 = urlencode($msg1);



$msg2="\n";

$msg2.="*Período de confirmação do PIX foi finalizado. Confirme com o cliente via WhatsAPP*\n";

$msg2;

$text2 = urlencode($msg2);



  $whatsapp_link = $whatsapp_linkx."".$text1."";

  

  $whatsapp_linF = $whatsapp_linkx."".$text2."";



} else {

  

  $whatsapp_link = whatsapp_link( $pedido );  

    

}





// SEO

$seo_subtitle = $app['title']." - Pedido efetuado com sucesso!";

$seo_description = "Seu pedido ".$app['title']." no ".$seo_title." foi efetuado com sucesso!";

$seo_keywords = $app['title'].", ".$seo_title;

$seo_image = thumber( $app['avatar_clean'], 400 );

// HEADER

$system_header .= "";

include($virtualpath.'/_layout/head.php');

include($virtualpath.'/_layout/top.php');

include($virtualpath.'/_layout/sidebars.php');

include($virtualpath.'/_layout/modal.php');



$acompanhamento_finalizacao = '';



$query = "SELECT acompanhamento_finalizacao FROM estabelecimentos WHERE id = " . $app['id'];

$res = mysqli_query($db_con, $query);

$row = mysqli_fetch_row($res);



if ($row) {

  $acompanhamento_finalizacao = $row[0];

}





// Verificando e coletando pedido

$data_pedido = mysqli_query( $db_con, "SELECT * FROM pedidos WHERE id = '$pedido'");
$haspedido = mysqli_num_rows( $data_pedido );
$data_pedido = mysqli_fetch_array( $data_pedido );


    if ($haspedido) {

        //1 pendente
        if ($data_pedido['status'] == 1) {

            $pedido_total = ($data_pedido['v_pedido'] + $data_pedido['taxa']);

        } else {
            header("Location: ".$app['url']."/pedidosabertos");
        }        

    } else {
        header("Location: ".$app['url']."/pedidosabertos");
    }





?>




<style>

    h2 {
        text-transform: uppercase;
        font-size: 25px;
    }
    label {
        text-align: left;
    }

    select {
        width: 100%;
        height: 47px;
        background-color: #f2f2f2;
        border:1px solid #f2f2f2;
        padding: 5px;
    }

    .cont {
        margin-right: 250px;
        margin-left: 250px;
    }

    #btnComprar {
        background-color: #c64c35;
        text-transform: uppercase;
        color: #FFF;
        width: 100%;
        height: 50px;
        border:1px solid #c64c35;
    }

    @media(max-width:1000px) {
        .cont {
            margin-right: 150px;
             margin-left: 150px;
        }
    }


    @media(max-width:768px) {
        .cont {
            margin-right: 10px;
             margin-left: 10px;
        }
    }

</style>


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

				    

				    <center>

                    <form name="formPagamento" action="" id="formPagamento">

                        <input type="hidden" name="descricao" id="itemDescription1" value="Compras - <?=$app['title']?>">
                        <input type="hidden" name="total" id="itemAmount" value="<?php echo number_format($pedido_total, 2);?>">
                        <input type="hidden" name="pedido" id="itemAmount" value="<?php echo $data_pedido['id']?>">

                        <?php if ($sandbox == 1) { ?>
                            <div class="cont" style="background-color:green; padding:20px;color:white">
                                <div style="text-align:left">
                                    <h3>MODO TESTE</h3>
                                    <p>Este gateway está configurado com as credenciais de teste (sandbox).</p>
                                </div>
                            </div>
                        <?php } ?>

                        <img src="./_core/_cdn/img/getnet-bandeiras.png" alt="Logotipos de meios de pagamento do Getnet" title="Este site aceita pagamentos com as principais bandeiras e bancos, saldo em conta PagSeguro e boleto.">
                       <br><br>
               
                        <div class="cont">

                            <h2>Dados do Comprador</h2>
                            <label>Nome</label>
                            <input  type="text" name="cliente_nome" id="senderName" placeholder="Nome completo" required><br><br>

                            <div class="row">
                                <!-- <div class="col-6 col-md-6 col-sm-6">
                                    <label>Data de Nascimento</label>
                                    <input value="20/03/1998" type="text" data-mask="99/99/9999" name="creditCardHolderBirthDate" id="creditCardHolderBirthDate" placeholder="Data de Nascimento. Ex: 12/12/1912" required><br><br>

                                </div> -->
								<div class="col-6 col-md-6 col-sm-6">
                                    <label>E-mail</label>
                                    <input  type="email" name="cliente_email" id="senderEmail" placeholder="E-mail do comprador" required><br><br>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CPF</label>
                                    <input  type="text" name="cliente_cpf" data-mask="99999999999" id="senderCPF" placeholder="CPF sem traço" required><br><br>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Telefone</label>
                                    <div class="row">
                                        <div class="col-4 col-md-4 col-sm-4">
                                            <input  type="text" name="cliente_ddd" data-mask="999" id="senderAreaCode" placeholder="DDD" required>
                                        </div>
                                        <div class="col-8 col-md-8 col-sm-8">
                                            <input  type="text" name="cliente_telefone" id="senderPhone" data-mask="999999999" placeholder="Somente número" required><br><br>
                                        </div>
                                    </div>
                                </div>
                                
                            </div>

                        </div>

                        <hr>

                        <div class="cont">

                            <label>Endereço</label>
                            <input  type="text" name="cliente_rua" id="billingAddressStreet" required placeholder="Av. Rua"><br><br>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Número</label>
                                    <input  type="text" name="cliente_numero" id="billingAddressNumber" required placeholder="Número">
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Complemento</label>
                                    <input type="text" name="cliente_complemento" id="billingAddressComplement" required placeholder="Complemento"><br><br>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Bairro</label>
                                    <input type="text" name="cliente_bairro" required id="billingAddressDistrict" required placeholder="Bairro">
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CEP</label>
                                    <input type="text" name="cliente_cep" required data-mask="99999999" id="billingAddressPostalCode" placeholder="CEP sem traço"><br><br>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Estado</label>
                                    <select id="billingAddressState" required name="cliente_estado">
                                        <option value="" default >Selecione uma opção</option>
                                        <option value="AC">Acre</option>
                                        <option value="AL">Alagoas</option>
                                        <option value="AP">Amapá</option>
                                        <option value="AM">Amazonas</option>
                                        <option value="BA">Bahia</option>
                                        <option value="CE">Ceará</option>
                                        <option value="DF">Distrito Federal</option>
                                        <option value="ES">Espírito Santo</option>
                                        <option value="GO" >Goiás </option>
                                        <option value="MA">Maranhão</option>
                                        <option value="MT">Mato Grosso</option>
                                        <option value="MS">Mato Grosso do Sul</option>
                                        <option value="MG">Minas Gerais</option>
                                        <option value="PA">Pará</option>
                                        <option value="PB">Paraíba</option>
                                        <option value="PR">Paraná</option>
                                        <option value="PE">Pernambuco</option>
                                        <option value="PI">Piauí</option>
                                        <option value="RJ">Rio de Janeiro</option>
                                        <option value="RN">Rio Grande do Norte</option>
                                        <option value="RS">Rio Grande do Sul</option>
                                        <option value="RO">Rondônia</option>
                                        <option value="RR">Roraima</option>
                                        <option value="SC">Santa Catarina</option>
                                        <option value="SP">São Paulo</option>
                                        <option value="SE">Sergipe</option>
                                        <option value="TO">Tocantins</option>
                                        <option value="EX">Estrangeiro</option>
                                    </select>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Cidade</label>
                                    <input  type="text" name="cliente_cidade" required id="billingAddressCity" placeholder="Cidade"><br><br>
                                </div>
                            </div>

                            <input type="hidden" name="billingAddressCountry" id="cliente_moeda" value="BRL"><br><br>
                        </div>

                       
        
                        <div class="cont">
                            <h2>Dados do Cartão</h2>
                            
                            <label>Número do cartão</label>
                            <input type="text" name="cliente_cartao" required id="cliente_cartao"><br><br>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Nome no Cartão</label>
                                    <input  type="text" name="cliente_titular" id="creditCardHolderName" placeholder="Nome igual ao escrito no cartão" required>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CPF do Cartão</label>
                                    <input type="text" name="cliente_cpf" id="creditCardHolderCPF" placeholder="CPF sem traço" required><br><br>
                                </div>
                            </div>
                            <label>Quantidades de Parcelas</label>
                            <select name="cliente_parcelas" id="qntParcelas"  class="select-qnt-parcelas">
                                <option value="1"> A vista (Total R$ <?=number_format($pedido_total, 2)?>) </option>
								<option value="3"> 3x de parcelas de R$ <?php $p = number_format(($pedido_total/3), 2); echo $p;?>  - (Total R$ <?=number_format($pedido_total, 2)?>) </option>
								<option value="4"> 4x de parcelas de R$ <?php $p = number_format(($pedido_total/4), 2); echo $p;?>  - (Total R$ <?=number_format($pedido_total, 2)?>) </option>
								<option value="5"> 5x de parcelas de R$ <?php $p = number_format(($pedido_total/5), 2); echo $p;?>  - (Total R$ <?=number_format($pedido_total, 2)?>) </option>
								<option value="6"> 6x de parcelas de R$ <?php $p = number_format(($pedido_total/6), 2); echo $p;?>  - (Total R$ <?=number_format($pedido_total, 2)?>) </option>
                            </select><br><br>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <div class="row">
                                        <div class="col-6 col-md-6 col-sm-6">
                                            <label>Mês de Validade</label>
                                            <input  type="text" placeholder="XX" name="cliente_mes" required id="mesValidade" maxlength="2">
                                        </div>
                                        <div class="col-6 col-md-6 col-sm-6">
                                            <label>Ano de Validade</label>
                                            <input type="text" placeholder="XX" name="cliente_ano" required id="anoValidade" maxlength="2">
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CVV do cartão</label>
                                    <input  type="text" name="cliente_cvv" required id="cvvCartao" maxlength="4">
                                </div>
                            </div>
                            
                            <br><br>
                            <input type="submit" name="btnComprar" id="btnComprar" value="Concluir Pagamento">
                        </div>

                        

                    </form>
                      

				    </center>
                            <br><br><br>
				    

				</div>
			</div>
	</div>
</div>

<?php 

// FOOTER

$system_footer .= "";

include($virtualpath.'/_layout/rdp.php');

include($virtualpath.'/_layout/footer.php');

?>



  <script type="text/javascript" src=""></script>
  <script type="text/javascript">
    alertify.defaults.glossary.title = 'Aviso';
    alertify.defaults.glossary.ok = 'OK';
    alertify.defaults.glossary.cancel = 'CANCELAR';
  </script>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.mask/1.14.16/jquery.mask.min.js" integrity="sha512-pHVGpX7F/27yZ0ISY+VVjyULApbDlD0/X0rgGbTqCE7WFW5MezNTWG/dnhtbBuICzsd0WQPgpE4REBLv+UqChw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script>

							$('#formPagamento').submit(function(e) {
								e.preventDefault();

								var form = $(this).serialize()
								var endereco = '<?=$app['url']?>';

								$.ajax({
                                    method: "POST",
                                    url: endereco + "/getnet_process",
                                    data:form,
                                    // dataType: 'json',

                                    success: function(retorna){

										var response = JSON.parse(retorna)

										if (response.error == "") {
											 window.location.href = '<?=$app['url']?>/getnet_status?pedido=<?=$pedido?>&estabelecimento=<?=$app['id']?>&pagamento='+response.id+"&status="+response.message;
										} else {
											alertify.alert(response.message)
										}
										
                                    },
                                    error: function(retorna) {
										alertify.alert('Ocorreu um erro temporário no Getnet. Contate o proprietário do estabelecimento.')

									}
                                });
							})
  




  </script>

