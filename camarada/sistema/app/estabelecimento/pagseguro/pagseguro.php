<?php

// CORE

include($virtualpath.'/_layout/define.php');



// APP

global $app;
global $db_con;

//PAGUSEGURO CONFIG
include('config.php');

//Se PagSeguro está ativo
if ($data_estabelecimento['pagamento_pagseguro'] == 2) {
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

// print_r($app);
// echo $vpedido."<br>";
// echo $tpedido;


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



// print_r($_SESSION['checkout']);

// print_r($app);






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

                        <input type="hidden" name="paymentMethod" id="paymentMethod" value="creditCard">
                        <input type="hidden" name="receiverEmail" id="receiverEmail" value="<?php echo EMAIL_LOJA; ?>">
                        <input type="hidden" name="currency" id="currency" value="<?php echo MOEDA_PAGAMENTO; ?>">
                        <input type="hidden" name="itemId1" id="itemId1" value="<?=$pedido?>">
                        <input type="hidden" name="itemDescription1" id="itemDescription1" value="Compras - <?=$app['title']?>">
                        <input type="hidden" name="itemAmount1" id="itemAmount1" value="<?php echo number_format($pedido_total, 2);?>">
                        <input type="hidden" name="itemQuantity1" id="itemQuantity1" value="1">
                        <input type="hidden" name="notificationURL" id="notificationURL" value="<?php echo URL_NOTIFICACAO; ?>">
                        <input type="hidden" name="reference" id="reference" value="<?=$pedido?>">

                        <?php if ($sandbox == 1) { ?>
                            <div class="cont" style="background-color:green; padding:20px;color:white">
                                <div style="text-align:left">
                                    <h3>MODO TESTE</h3>
                                    <p>Este gateway está configurado com as credenciais de teste (sandbox).</p>
                                </div>
                            </div>
                        <?php } ?>
                        <img src="//assets.pagseguro.com.br/ps-integration-assets/banners/pagamento/todos_animado_550_50.gif" alt="Logotipos de meios de pagamento do PagSeguro" title="Este site aceita pagamentos com as principais bandeiras e bancos, saldo em conta PagSeguro e boleto.">
                       <br><br>
                        <!-- <div class="cont">
                            <div style="text-align:left">
                                <h3>DETALHES DA COMPRA</h3>
                                <p><strong>METÓDO:</strong> PAGSEGURO</p>
                                <p><strong>SUBTOTAL:</strong> R$ <?=$data_pedido['v_pedido']?></p>
                                <p><strong>TAXA:</strong> R$ <?=$data_pedido['taxa']?></p>
                                <p><strong>TOTAL:</strong> R$<?=$pedido_total?></p>
                            </div>
                        </div> -->
                        <div class="cont">

                            <h2>Dados do Comprador</h2>
                            <label>Nome</label>
                            <input type="text" name="senderName" id="senderName" placeholder="Nome completo" required><br><br>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Data de Nascimento</label>
                                    <input  type="text" data-mask="99/99/9999" name="creditCardHolderBirthDate" id="creditCardHolderBirthDate" placeholder="Data de Nascimento. Ex: 12/12/1912" required><br><br>

                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CPF</label>
                                    <input  type="text" name="senderCPF" data-mask="99999999999" id="senderCPF" placeholder="CPF sem traço" required><br><br>
                                </div>
                            </div>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Telefone</label>
                                    <div class="row">
                                        <div class="col-4 col-md-4 col-sm-4">
                                            <input  type="text" name="senderAreaCode" data-mask="999" id="senderAreaCode" placeholder="DDD" required>
                                        </div>
                                        <div class="col-8 col-md-8 col-sm-8">
                                            <input type="text" name="senderPhone" id="senderPhone" data-mask="999999999" placeholder="Somente número" required><br><br>
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>E-mail</label>
                                    <input  type="email" name="senderEmail" id="senderEmail" placeholder="E-mail do comprador" required><br><br>
                                </div>
                            </div>

                        </div>

                        <hr>

                        <div class="cont">

                            <label>Endereço</label>
                            <input type="text" name="billingAddressStreet" id="billingAddressStreet" required placeholder="Av. Rua"><br><br>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Número</label>
                                    <input  type="text" name="billingAddressNumber" id="billingAddressNumber" required placeholder="Número">
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Complemento</label>
                                    <input  type="text" name="billingAddressComplement" id="billingAddressComplement" required placeholder="Complemento"><br><br>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Bairro</label>
                                    <input  type="text" name="billingAddressDistrict" required id="billingAddressDistrict" required placeholder="Bairro">
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CEP</label>
                                    <input type="text" name="billingAddressPostalCode" required data-mask="99999999" id="billingAddressPostalCode" placeholder="CEP sem traço"><br><br>
                                </div>
                            </div>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Estado</label>
                                    <select id="billingAddressState" required name="billingAddressState">
                                        <option value="" default >Selecione uma opção</option>
                                        <option value="AC">Acre</option>
                                        <option value="AL">Alagoas</option>
                                        <option value="AP">Amapá</option>
                                        <option value="AM">Amazonas</option>
                                        <option value="BA">Bahia</option>
                                        <option value="CE">Ceará</option>
                                        <option value="DF">Distrito Federal</option>
                                        <option value="ES">Espírito Santo</option>
                                        <option value="GO">Goiás</option>
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
                                    <input  type="text" name="billingAddressCity" required id="billingAddressCity" placeholder="Cidade"><br><br>
                                </div>
                            </div>

                            <input type="hidden" name="billingAddressCountry" id="billingAddressCountry" value="BRL"><br><br>
                        </div>

                       
                        <input type="hidden" name="shippingAddressRequired" id="shippingAddressRequired" value="false" required>
                        <input type="hidden" name="shippingAddressStreet" id="shippingAddressStreet" placeholder="Av. Rua">
                        <input type="hidden" name="shippingAddressNumber" id="shippingAddressNumber" placeholder="Número">
                        <input type="hidden" name="shippingAddressComplement" id="shippingAddressComplement" placeholder="Complemento">
                        <input type="hidden" name="shippingAddressDistrict" id="shippingAddressDistrict" placeholder="Bairro">
                        <input type="hidden" name="shippingAddressPostalCode" id="shippingAddressPostalCode" placeholder="CEP sem traço">
                        <input type="hidden" name="shippingAddressCity" id="shippingAddressCity" placeholder="Cidade">
                        <select style="display: none;" id="shippingAddressState"  name="shippingAddressState">
                            <option value="" default >Selecione uma opção</option>
                            <option value="AC">Acre</option>
                            <option value="AL">Alagoas</option>
                            <option value="AP">Amapá</option>
                            <option value="AM">Amazonas</option>
                            <option value="BA">Bahia</option>
                            <option value="CE">Ceará</option>
                            <option value="DF">Distrito Federal</option>
                            <option value="ES">Espírito Santo</option>
                            <option value="GO">Goiás</option>
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
                        <input type="hidden" name="shippingAddressCountry" id="shippingAddressCountry" value="BRL">
                        <input type="hidden" name="shippingType" value="1"> 
                        <input type="hidden" name="shippingType" value="2"> 
                        <input type="hidden" name="shippingType" value="3" checked> 
                        <input type="hidden" name="shippingCost" id="senderCPF" placeholder="Preço do frete. Ex: 2.10" value="0.00">




                        <div class="cont">
                            <h2>Dados do Cartão</h2>
                            
                            <label>Número do cartão</label>
                            <input type="text" name="numCartao" required id="numCartao"><br><br>

                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>Nome no Cartão</label>
                                    <input  type="text" name="creditCardHolderName" id="creditCardHolderName" placeholder="Nome igual ao escrito no cartão" required>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CPF do Cartão</label>
                                    <input  type="text" name="creditCardHolderCPF" id="creditCardHolderCPF" placeholder="CPF sem traço" required><br><br>
                                </div>
                            </div>
                            <label>Quantidades de Parcelas</label>
                            <select name="qntParcelas" id="qntParcelas" required class="select-qnt-parcelas">
                                <option value="">Selecione</option>
                            </select><br><br>
                            <div class="row">
                                <div class="col-6 col-md-6 col-sm-6">
                                    <div class="row">
                                        <div class="col-6 col-md-6 col-sm-6">
                                            <label>Mês de Validade</label>
                                            <input placeholder="XX" type="text" name="mesValidade" required id="mesValidade" maxlength="2">
                                        </div>
                                        <div class="col-6 col-md-6 col-sm-6">
                                            <label>Ano de Validade</label>
                                            <input placeholder="XXXX" type="text" name="anoValidade" required id="anoValidade" maxlength="4">
                                        </div>
                                    </div>
                                </div>
                                <div class="col-6 col-md-6 col-sm-6">
                                    <label>CVV do cartão</label>
                                    <input type="text" name="cvvCartao" required id="cvvCartao" maxlength="3">
                                </div>
                            </div>

                            <!-- <label>Valor Parcelas</label> -->
                            <input type="hidden" name="bandeiraCartao" id="bandeiraCartao">
                            <input type="hidden" name="valorParcelas" id="valorParcelas">
                            <input type="hidden" name="tokenCartao" id="tokenCartao">
                            <input type="hidden" name="hashCartao" id="hashCartao">
                            
                            <br><br>
                            <input type="submit" name="btnComprar" id="btnComprar" value="Concluir Pagamento">
                        </div>

                        

                    </form>
                                    

				        <div class="meio-pag"></div>

				    </center>
                            <br><br><br>
				    
				         <span class="endereco" data-endereco="<?php echo URL; ?>"></span>

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



  <script type="text/javascript" src="<?php echo SCRIPT_PAGSEGURO; ?>"></script>
  <script type="text/javascript">
    alertify.defaults.glossary.title = 'Aviso';
    alertify.defaults.glossary.ok = 'OK';
    alertify.defaults.glossary.cancel = 'CANCELAR';
  </script>

  <script src="https://cdnjs.cloudflare.com/ajax/libs/jquery.mask/1.14.16/jquery.mask.min.js" integrity="sha512-pHVGpX7F/27yZ0ISY+VVjyULApbDlD0/X0rgGbTqCE7WFW5MezNTWG/dnhtbBuICzsd0WQPgpE4REBLv+UqChw==" crossorigin="anonymous" referrerpolicy="no-referrer"></script>
  <script>

  

var amount = $('#itemAmount1').val()
var amount = parseFloat(amount).toFixed(2)


     function pagamento(){

        var endereco = jQuery('.endereco').attr("data-endereco");

        $.ajax({
            url: endereco+"pagseguro_id",
            type: 'POST',
            dataType: 'json',
            success: function (retorno) {
                // console.log(retorno.id)
                PagSeguroDirectPayment.setSessionId(retorno.id);
            },
            complete: function (retorno) {
                listarMeiosPag();
            },
            error: function (error) {
                // alert('erro'+error)
            }
        });
    }

    

    

    function listarMeiosPag() {

        PagSeguroDirectPayment.getPaymentMethods({

            success: function (retorno) {
                // console.log(retorno);
                // $('.meio-pag').append("<br><br>");
                // $.each(retorno.paymentMethods.CREDIT_CARD.options, function(i, obj){
                //     $('.meio-pag').append("<span class='img-band'><img src='https://stc.pagseguro.uol.com.br" + obj.images.SMALL.path + "'></span>");
                // });
            },

           
            },
            complete: function (retorno) {
                // Callback para todas chamadas.
            }

        });

    }

    
    $('#numCartao').on('keyup', function () {
        //Receber o número do cartão digitado pelo usuário
        var numCartao = $(this).val();

        //Contar quantos números o usuário digitou
        var qntNumero = numCartao.length;

        //Validar o cartão quando o usuário digitar 6 digitos do cartão
        if (qntNumero == 6) {

            //Instanciar a API do PagSeguro para validar o cartão
            PagSeguroDirectPayment.getBrand({
                cardBin: numCartao,
                success: function (retorno) {
                    $('#msg').empty();

                    //Enviar para o index a imagem da bandeira
                    var imgBand = retorno.brand.name;
                    $('.bandeira-cartao').html("<img src='https://stc.pagseguro.uol.com.br/public/img/payment-methods-flags/42x20/" + imgBand + ".png'>");
                    $('#bandeiraCartao').val(imgBand);
                    recupParcelas(imgBand);
                },
                error: function (retorno) {

                    //Enviar para o index a mensagem de erro
                    $('.bandeira-cartao').empty();
                    $('#msg').html("Cartão inválido");
                }
            });
        }
    });
    
    //Enviar o valor parcela para o formulário
    $('#qntParcelas').change(function () {
    
        $('#valorParcelas').val($('#qntParcelas').find(':selected').attr('data-parcelas'));
    });

        function recupParcelas(bandeira) {

        PagSeguroDirectPayment.getInstallments({
            amount: amount,
            maxInstallmentNoInterest: 3,
            brand: bandeira,
            success: function (retorno) {

                $('#qntParcelas').html("")
                $.each(retorno.installments, function (ia, obja) {

                    $('#qntParcelas').show().append("<option value='' default >Selecione a qtd. de Parcelas</option>");

                    $.each(obja, function (ib, objb) {
                        //Converter o preço para o formato real com JavaScript
                        var valorParcela = objb.installmentAmount.toFixed(2).replace(".", ",");
                        //Apresentar quantidade de parcelas e o valor das parcelas para o usuário no campo SELECT
                        var valorParcelaDouble = objb.installmentAmount.toFixed(2)
                        

                        $('#qntParcelas').show().append("<option value='" + objb.quantity + "' data-parcelas='" + valorParcelaDouble + "'>" + objb.quantity + " parcelas de R$ " + valorParcela + "</option>");
                    });
                });
            },
            error: function (retorno) {
                // callback para chamadas que falharam.
            },
            complete: function (retorno) {
                // Callback para todas chamadas.
            }
        });
    }
    


        //Recuperar o hash do cartão
        $("#formPagamento").on("submit", function (event) {

            event.preventDefault();

            PagSeguroDirectPayment.createCardToken({
                cardNumber: $('#numCartao').val(), // Número do cartão de crédito
                brand: $('#bandeiraCartao').val(), // Bandeira do cartão
                cvv: $('#cvvCartao').val(), // CVV do cartão
                expirationMonth: $('#mesValidade').val(), // Mês da expiração do cartão
                expirationYear: $('#anoValidade').val(), // Ano da expiração do cartão, é necessário os 4 dígitos.
                success: function (retorno) {
                    $('#tokenCartao').val(retorno.card.token);
                },
                error: function (retorno) {
                    // Callback para chamadas que falharam.
                },
                complete: function (retorno) {
                    // Callback para todas chamadas.
                    recupHashCartao();
                }
            });

        });


        //Recuperar o hash do cartão
        function recupHashCartao() {
            
            PagSeguroDirectPayment.onSenderHashReady(function (retorno) {
                if (retorno.status == 'error') {
                    alertify.alert('Ocorreu um erro no hash do cartão. Contate o lojista.');
                } else {
                    $("#hashCartao").val(retorno.senderHash);
                    var dados = $("#formPagamento").serialize();
                    // console.log(dados);
                    
                    var endereco = jQuery('.endereco').attr("data-endereco");
                    // console.log(endereco);
                    $.ajax({
                        method: "POST",
                        url: endereco + "pagseguro_process",
                        data: dados,
                        dataType: 'json',
                        success: function(retorna){

                            var resp = JSON.stringify(retorna)
                            var resp = JSON.parse(resp)

                            if (resp.dados.error) {

                                // console.log(resp.dados.error.code)
                                // console.log(resp.dados.error.message)

                                switch(resp.dados.error.code) {

                                    case "10000":
                                    	alertify.alert('Bandeira do seu cartão é inválida.');
                                        break;
                                    case"10001":
                                        alertify.alert('O número do seu cartão de crédito está incorreto.');
                                        break;
                                    case "10002":
                                        alertify.alert('Data com formato inválido.');
                                        break;
                                    case "10003":
                                        alertify.alert('Campo de segurança inválido');
                                        break;
                                    case "10004":
                                        alertify.alert('CVV é obrigatório');
                                        break;;
                                    case "10006": 
                                        alertify.alert('Campo de segurança com tamanho inválido.');
                                        break;
                                    case "53004": 
                                        alertify.alert('Quantidade items é inválido.');
                                        break;
                                    case "53005":
                                        alertify.alert('A moeda é obrigatória.');
                                        break;
                                    case "53006":
                                        alertify.alert('Valor da moeda é inválido.');
                                        break;
                                    case "53007":
                                        alertify.alert('Referência tem uma tamanho inválido.');
                                        break;
                                    case "53008":
                                        alertify.alert('notificationURL é inválida.');
                                        break;
                                    case "53009":
                                        alertify.alert('notificationURL é inválida.');
                                        break;
                                    case "53010":
                                        alertify.alert('Email é inválido.');
                                        break;
                                    case "53011":
                                        alertify.alert('Email é inválido.');
                                        break;
                                    case "53012":
                                        alertify.alert('Email é inválido.');
                                        break;
                                    case "53013":
                                        alertify.alert('Nome é inválido.');
                                        break;
                                    case "53014":
                                        alertify.alert('Nome é inválido.');
                                        break;
                                    case "53015":
                                        alertify.alert('Nome é inválido.');
                                        break;
                                    case "53017":
                                        alertify.alert('CPF  é inválido.');
                                        break;
                                    case "53018":
                                        alertify.alert('CEP é obrigatório');
                                        break;
                                    case "53019":
                                        alertify.alert('CEP é inválido.');
                                        break;
                                    case "53020":
                                        alertify.alert('Telefone é obrigatório');
                                        break;
                                    case "53021":
                                        alertify.alert('Telefone é inválido.');
                                        break;
                                    case "53022":
                                        alertify.alert('CEP é obrigatório.');
                                        break;
                                    case "53023":
                                        alertify.alert('CEP é inválido.');
                                        break;
                                    case "53024":
                                        alertify.alert('A Rua é obrigatória.');
                                        break;
                                    case "53025":
                                        alertify.alert('A Rua é inválida.');
                                        break;
                                    case "53026":
                                        alertify.alert('Numero da endereço é obrigatório.');
                                        break;
                                    case "53027":
                                        alertify.alert('Numero da endereço é inválida.');
                                        break;
                                    case "53028":
                                        alertify.alert('Complemento do endereço é obrigtório.');
                                        break;
                                    case "53029":
                                        alertify.alert('Estado é obrigatório.');
                                        break;
                                    case "53030":
                                        alertify.alert('Estado é inválido.');
                                        break;
                                    case "53031":
                                        alertify.alert('Cidade é obrigatória.');
                                        break;
                                    case "53032":
                                        alertify.alert('Cidade é inválida.');
                                        break;
                                    case "53033":
                                        alertify.alert('Estado é obrigatório.');
                                        break;
                                    case "53034":
                                        alertify.alert('Estado é inválido.');
                                        break;
                                    case "53035":
                                        alertify.alert('Pais é obrigatório.');
                                        break;
                                    case "53036":
                                        alertify.alert('Pais é inválido.');
                                        break;
                                    case "53037":
                                        alertify.alert('Verifique os dados do cartão de crédito.');
                                        break;
                                    case "53038":
                                        alertify.alert('Quantidade de parcelas é obrigtório.');
                                        break;
                                    case "53039":
                                        alertify.alert('Quantidade de parcelas é inválido.');
                                        break;
                                    case "53040":
                                        alertify.alert('Valor da parcela é obrigatória.');
                                        break;
                                    case "53041":
                                        alertify.alert('Valor da parcela é inválido.');
                                        break;
                                    case "53042":
                                        alertify.alert('Titular do cartão é obrigatório.');
                                        break;
                                    case "53043":
                                        alertify.alert('Titular do cartão é inválido.');
                                        break;
                                    case "53044":
                                        alertify.alert('Titular do cartão é inválido.');
                                        break;
                                    case "53045":
                                        alertify.alert('CPF do titular é obrigatório.');
                                        break;
                                    case "53046":
                                        alertify.alert('CPF do titular é inválido.');
                                        break;
                                    case "53047":
                                        alertify.alert('Aniversário do Titular é obrigatório.');
                                        break;
                                    case "53048":
                                        alertify.alert('Aniversário do Titular é inválido.');
                                        break;
                                    case "53049":
                                        alertify.alert('CEP do Titular é obrigatório.');
                                        break;
                                    case "53050":
                                        alertify.alert('CEP do Titular é obrigatório.');
                                        break;
                                    case "53051":
                                        alertify.alert('Telefone do Titular é obrigatório.');
                                        break;
                                    case "53052":
                                        alertify.alert('Telefone do Titular é inválido.');
                                        break;
                                    case "53053":
                                        alertify.alert('CEP é obrigatório');
                                        break;
                                    case "53054":
                                        alertify.alert('CEP é inválido.');
                                        break;
                                    case "53055":
                                        alertify.alert('Endereço é obrigatório.');
                                        break;
                                    case "53056":
                                        alertify.alert('Endereço é inválido.');
                                        break;
                                    case "53057":
                                        alertify.alert('Número do endereço é obrigatório.');
                                        break;
                                    case "53058":
                                        alertify.alert('Número do endereço é inválido.');
                                        break;
                                    case "53059":
                                        alertify.alert('Complemento do endereço é inválido.');
                                        break;
                                    case "53060":
                                        alertify.alert('Distrito do Endereço é obrigatório.');
                                        break;
                                    case "53061":
                                        alertify.alert('Distrito do Endereço é inválido.');
                                        break;
                                    case "53062":
                                        alertify.alert('Cidade é obrigatório.');
                                        break;
                                    case "53063":
                                        alertify.alert('Cidade é inválido.');
                                        break;
                                    case "53064":
                                        alertify.alert('Estado é obrigatório.');
                                        break;
                                    case "53065":
                                        alertify.alert('Estado é invalid value: {0}');
                                        break;
                                    case "53066":
                                        alertify.alert('Pais é obrigatório.');
                                        break;
                                    case "53067":
                                        alertify.alert('Pais é inválido.');
                                        break;
                                    case "53068":
                                        alertify.alert('E-mail é inválido.');
                                        break;
                                    case "53069":
                                        alertify.alert('E-mail é inválido.');
                                        break;
                                    case "53070":
                                        alertify.alert('ID do item é obrigatório.');
                                        break;
                                    case "53071":
                                        alertify.alert('ID do item é inválido.');
                                        break;
                                    case "53072":
                                        alertify.alert('Descrição do item é obrigatório.');
                                        break;
                                    case "53073":
                                        alertify.alert('Descrição do item é inválido.');
                                        break;
                                    case "53074":
                                        alertify.alert('Quantidade do item é obrigatório.');
                                        break;
                                    case "53075":
                                        alertify.alert('Quantidade do item é inválido.');
                                        break;
                                    case "53076":
                                        alertify.alert('Quantidade do item é inválido.');
                                        break;
                                    case "53077":
                                        alertify.alert('Valor do item é obrigatório.');
                                        break;
                                    case "53078":
                                        alertify.alert('Valor do item é inválido:');
                                        break;
                                    case "53079":
                                        alertify.alert('Valor do item é inválido.');
                                        break;
                                    case "53081":
                                        alertify.alert('O e-mail do vendedor é o mesmo do pagador.');
                                        break;
                                    case "53084":
                                        alertify.alert('O e-mail do vendedor é o mesmo do pagador.');
                                        break;
                                    case "53085":
                                        alertify.alert('O método de pagamento está indisponível.');
                                        break;
                                    case "53086":
                                        alertify.alert('Total é inválido.');
                                        break;
                                    case "53087":
                                        alertify.alert('Data do cartão de crédito é inválida.');
                                        break;
                                    case "53091":
                                        alertify.alert('Hash Inválido.');
                                        break;
                                    case "53092":
                                        alertify.alert('Bandeira de cartão de crédit não é aceita.');
                                        break;
                                    case "53095":
                                        alertify.alert('shipping type invalid pattern: {0}');
                                        break;
                                    case "53096":
                                        alertify.alert('shipping cost invalid pattern: {0}');
                                        break;
                                    case "53097":
                                        alertify.alert('shipping cost out of range: {0}');
                                        break;
                                    case "53098":
                                        alertify.alert('Valor Total é negativo.');
                                        break;
                                    case "53099":
                                        alertify.alert('extra amount invalid pattern: {0} Must fit the patern: ');
                                        break;
                                    case "53101":
                                        alertify.alert('Modo de pagamento é inválido.');
                                        break;
                                    case "53102":
                                        alertify.alert('Modo de pagamento é inválido.');
                                        break;
                                    case "53104":
                                        alertify.alert('shipping cost was provided, shipping address must be complete');
                                        break;
                                    case "53105":
                                        alertify.alert('Informe o e-mail do comprador.');
                                        break;
                                    case "53106":
                                        alertify.alert('Dados do comprador estão incompletos.');
                                        break;
                                    case "53109":
                                        alertify.alert('shipping address information was provided, sender email must be provided too');
                                        break;
                                    case "53110":
                                        alertify.alert('Banco é obrigatório.');
                                        break;;
                                    case "53111":
                                        alertify.alert('Banco é inválido..');
                                        break;
                                    case "53115":
                                        alertify.alert('sender born date invalid value: {0}');
                                        break;
                                    case "53117":
                                        alertify.alert('CNPJ é inválido.');
                                        break;
                                    case "53122":
                                        alertify.alert('Dominio do e-mail é inválido.');
                                        break;
                                    case "53140":
                                        alertify.alert('Quantidade de parcelas precisa ser maior que 0.');
                                        break;
                                    case "53141":
                                        alertify.alert('Comprador está bloquedo.');
                                        break;
                                    case "53142":
                                        alertify.alert('Token do cartão de crédito é inválido.');
                                        break;
                                    default:
                                        alertify.alert('Confira todos seus dados corretamente.');
                                        break;;
                                }

                            } else {

                                var pedido = '<?=$data_pedido["id"]?>';
                                var estabelecimento = '<?=$app["id"]?>';
                                var data = '<?=date("d-m-Y")?>';
                                var hora = '<?=date("H:i")?>';
                                var valor = resp.dados.grossAmount;
                                var gateway = 'pagseguro';
                                var codigo = resp.dados.code;
                                var status =  resp.dados.status;

                                $.ajax({
                                    method: "POST",
                                    url: endereco + "pagseguro_create_payment",
                                    data: {
                                        pedido:pedido,
                                        data:data,
                                        hora:hora,
                                        estabelecimento:estabelecimento,
                                        valor:valor,
                                        gateway:gateway,
                                        codigo:codigo,
                                        status:status
                                    },
                                    dataType: 'json',
                                    success: function(retorna){
                                        window.location.href =  '<?=$app["url"]?>/pagseguro_status?pedido='+pedido+'&estabelecimento='+<?=$app["id"]?>+'&pagamento='+codigo;
                                    },
                                    error: function(retorna) {
                                        alertify.alert('Seu pagamento foi processado, mas ocorreu um erro inesperado. Contate o lojista.');
                                    }
                                });

                            

                            }

                        },
                        error: function(retorna){

                            alertify.alert('Ocorreu um erro no processamento da api. Contate o suporte.');
                        }
                    });
                }
            });
        }


   

        
    pagamento()





  </script>

