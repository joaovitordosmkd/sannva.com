<?php

// ini_set('display_errors', 1); ini_set('display_startup_errors', 1); error_reporting(E_ALL);
include 'vendor/autoload.php';
include 'config.php';

use Getnet\API\Getnet;
use Getnet\API\Transaction;
use Getnet\API\Environment;
use Getnet\API\Token;
use Getnet\API\Credit;
use Getnet\API\Customer;
use Getnet\API\Card;
use Getnet\API\Order;
use Getnet\API\Boleto;





$contents = $_POST;


// print_r(json_encode($contents));

// $client_id      = "72d4ce9d-348a-4bea-9052-7d515332b21f";
// $client_secret  = "d170206f-4001-417c-922a-60da6d2f65db";
// $seller_id      = "c892fe42-2d75-43aa-8fa8-d248a0fa82ab";

$client_id      = CLIENT_ID;
$client_secret  = CLIENT_SECRET;
$seller_id      = SELLER_ID;
// echo $client_id;
// echo $client_secret;
// echo $seller_id;
if ($sandbox == 1) {
    $environment = Environment::sandbox();
} else {
    $environment = Environment::production();
}


// //Opicional, passar chave se você quiser guardar o token do auth na sessão para não precisar buscar a cada trasação, só quando expira
$keySession = null;

// //Autenticação da API
$getnet = new Getnet($client_id, $client_secret, $environment, $keySession);



// // Inicia uma transação
$transaction = new Transaction();

// // Dados do pedido - Transação
$transaction->setSellerId($seller_id);
$transaction->setCurrency("BRL");
$transaction->setAmount($_POST['total']);

// // Detalhes do Pedido
$transaction->order($_POST['pedido'])
->setProductType(Order::PRODUCT_TYPE_SERVICE)
->setSalesTax(0);

// // Gera token do cartão - Obrigatório
$tokenCard = new Token(trim($_POST['cliente_cartao']), $_POST['pedido'] , $getnet);


// print_r($tokenCard);

// echo "===========<br>";
// // Dados do método de pagamento do comprador

if ($_POST['cliente_parcelas'] == 1) {

    $transaction->credit()
    ->setAuthenticated(false)
    ->setDynamicMcc("1799")
    ->setSoftDescriptor($_POST['descricao'])
    ->setDelayed(false)
    ->setPreAuthorization(false)
    ->setNumberInstallments("1")
    ->setSaveCardData(false)
    ->setTransactionType(Credit::TRANSACTION_TYPE_FULL)
    ->card($tokenCard)
        ->setBrand(Card::BRAND_MASTERCARD)
        ->setExpirationMonth($_POST['cliente_mes'])
        ->setExpirationYear($_POST['cliente_ano'])
        ->setCardholderName($_POST['cliente_titular'])
        ->setSecurityCode($_POST['cliente_cvv']);



} else {
    
    $transaction->credit()
    ->setAuthenticated(false)
    ->setDynamicMcc("1799")
    ->setSoftDescriptor($_POST['descricao'])
    ->setDelayed(false)
    ->setPreAuthorization(false)
    ->setNumberInstallments($_POST['cliente_parcelas'])
    ->setSaveCardData(false)
    ->setTransactionType(Credit::TRANSACTION_TYPE_INSTALL_NO_INTEREST)
    ->card($tokenCard)
        ->setBrand(Card::BRAND_MASTERCARD)
        ->setExpirationMonth($_POST['cliente_mes'])
        ->setExpirationYear($_POST['cliente_ano'])
        ->setCardholderName($_POST['cliente_titular'])
        ->setSecurityCode($_POST['cliente_cvv']);
    
}



// // Dados pessoais do comprador
$transaction->customer($_POST['pedido'])
            ->setDocumentType(Customer::DOCUMENT_TYPE_CPF)
            ->setEmail($_POST['cliente_email'])
            ->setFirstName($_POST['cliente_nome'])
            ->setLastName($_POST['cliente_nome'])
            ->setName($_POST['cliente_nome'])
            ->setPhoneNumber($_POST['cliente_telefone'])
            ->setDocumentNumber($_POST['cliente_cpf'])
            ->billingAddress()
                ->setCity($_POST['cliente_cidade'])
                ->setComplement($_POST['cliente_complemento'])
                ->setCountry('Brasil')
                ->setDistrict('Centro')
                ->setNumber($_POST['cliente_numero'])
                ->setPostalCode($_POST['cliente_cep'])
                ->setState($_POST['cliente_estado'])
                ->setStreet($_POST['cliente_rua']);

// // Dados de entrega do pedido
// // $transaction->shipping()
// //             ->setFirstName("Jax")
// //             ->setEmail("customer@email.com.br")
// //             ->setName("Jax Teller")
// //             ->setPhoneNumber("5551999887766")
// //             ->setShippingAmount(0)
// //             ->address()
// //                 ->setCity("Porto Alegre")
// //                 ->setComplement("Sons of Anarchy")
// //                 ->setCountry("Brasil")
// //                 ->setDistrict("São Geraldo")
// //                 ->setNumber("1000")
// //                 ->setPostalCode("90230060")
// //                 ->setState("RS")
// //                 ->setStreet("Av. Brasil");

// //Ou pode adicionar entrega com os mesmos dados do customer
$transaction->addShippingByCustomer($transaction->getCustomer())->setShippingAmount(0);

// // FingerPrint - Antifraude
$transaction->device("device_id")->setIpAddress("127.0.0.1");

// // Processa a Transação
$response = get_object_vars($getnet->authorize($transaction));

// // Resultado da transação - Consultar tabela abaixo
// print_r($response);

    $error = "";
    $message = "";
    $status = "";
    $id_pagamento = "";

    if ($response['error_code'] == "") {
      
      
        switch ($response['status']) {
            case "":
                break;
                case "PENDING":
                    $status = "PENDING";
                    $message = "Sua compra foi  Registrada ou Aguardando ação.";
                    $id_pagamento = $response['payment_id'];
                    break;
                case "CANCELED":
                    $status = "CANCELED";
                    $message = "Sua compra foi  Desfeita ou Cancelada. ";
                    $id_pagamento = $response['payment_id'];
                    break;
                case "APPROVED":
                    $status = "APPROVED";
                    $message = "Parabéns, Sua compra foi Aprovada.";
                    $id_pagamento = $response['payment_id'];
                    break;
                case "DENIED":
                    $status = "DENIED";
                    $message = "Sua compra foi  Negada. ";
                    $id_pagamento = $response['payment_id'];
                    break;
                case "AUTHORIZED":
                    $status = "AUTHORIZED";
                    $message = "Sua compra foi Autorizada pelo emissor";
                    $id_pagamento = $response['payment_id'];
                    break;
                case "CONFIRMED":
                    $status = "CONFIRMED";
                    $message = "Sua compra foi Confirmada ou Capturada.";
                    $id_pagamento = $response['payment_id'];
                    break;
        }
      

    } else {
     

        if ($response['status_code'] == 400) {

            switch ($response['error_code']) {
             
                case "PAYMENTS-012":
                    $error = $response['error_code'];	
                    $message =  "Valor da entrada maior ou igual ao valor da transação";
                        break;
                case "PAYMENTS-013":
                    $error = $response['error_code'];	
                    $message =  "Valor da parcela inválido";
                        break;
                case "PAYMENTS-015":
                    $error = $response['error_code'];	
                    $message =  "Contatar emissor";
                        break;
                case "PAYMENTS-016":
                    $error = $response['error_code'];	
                    $message =  "NSU inválido";
                        break;
                case "PAYMENTS-019":
                    $error = $response['error_code'];	
                    $message =  "Data de emissão do cartão inválida";
                        break;
                case "PAYMENTS-020":
                    $error = $response['error_code'];	
                    $message =  "Data de vencimento inválida";
                        break;
                case "PAYMENTS-024":
                    $error = $response['error_code'];	
                    $message =  "Transação desfeita";
                        break;
                case "PAYMENTS-025":
                    $error = $response['error_code'];	
                    $message =  "Autenticação inválida";
                        break;
                case "PAYMENTS-026":
                    $error = $response['error_code'];	
                    $message =  "Autorização inválida";
                        break;
                case "PAYMENTS-029":
                    $error = $response['error_code'];	
                    $message =  "Pré-autorização inválida";
                        break;
                case "PAYMENTS-044":
                    $error = $response['error_code'];	
                    $message =  "Erro de formato";
                        break;
                case "PAYMENTS-050":
                    $error = $response['error_code'];	
                    $message =  "Entrar em contato com a instituição";
                        break;
                case "PAYMENTS-051":
                    $error = $response['error_code'];	
                    $message =  "Resposta parametrizada negativa";
                        break;
                case "PAYMENTS-054":
                    $error = $response['error_code'];	
                    $message =  "Pendente de confirmação";
                        break;
                case "PAYMENTS-055":
                    $error = $response['error_code'];	
                    $message =  "Transação cancelada";
                        break;
                case "PAYMENTS-056":
                    $error = $response['error_code'];	
                    $message =  "Transação não permitida neste ciclo";
                        break;
                case "PAYMENTS-058":
                    $error = $response['error_code'];	
                    $message =  "Transação estornada";
                        break;
                case "PAYMENTS-060":
                    $error = $response['error_code'];	
                    $message =  "Cartão obrigatório na transação";
                        break;
                case "PAYMENTS-061":
                    $error = $response['error_code'];	
                    $message =  "Rejeição genérica";
                        break;
                case "PAYMENTS-066":
                    $error = $response['error_code'];	
                    $message =  "Forma de pagamento inválido";
                        break;
                case "PAYMENTS-068":
                    $error = $response['error_code'];	
                    $message =  "Dígito cartão inválido";
                        break;
                case "PAYMENTS-069":
                    $error = $response['error_code'];	
                    $message =  "Transação repetida";
                        break;
                case "PAYMENTS-070":
                    $error = $response['error_code'];	
                    $message =  "Número do cartão não confere";
                        break;
                case "PAYMENTS-072":
                    $error = $response['error_code'];	
                    $message =  "Transação não cancelável";
                        break;
                case "PAYMENTS-073":
                    $error = $response['error_code'];	
                    $message =  "Transação já cancelada";
                        break;
                case "PAYMENTS-078":
                    $error = $response['error_code'];	
                    $message =  "Dados inválidos no cancelamento";
                        break;
                case "PAYMENTS-079":
                    $error = $response['error_code'];	
                    $message =  "Valor cancelamento inválido";
                        break;
                case "PAYMENTS-080":
                    $error = $response['error_code'];	
                    $message =  "Cartão inválido";
                        break;
                case "PAYMENTS-081":
                    $error = $response['error_code'];	
                    $message =  "Excede data";
                        break;
                case "PAYMENTS-082":
                    $error = $response['error_code'];	
                    $message =  "Cancelamento inválido";
                        break;
                case "PAYMENTS-083":
                    $error = $response['error_code'];	
                    $message =  "Use função débito";
                        break;
                case "PAYMENTS-084":
                    $error = $response['error_code'];	
                    $message =  "Use função crédito";
                        break;
                case "PAYMENTS-085":
                    $error = $response['error_code'];	
                    $message =  "Transação já efetuada";
                        break;
                case "PAYMENTS-090":
                    $error = $response['error_code'];	
                    $message =  "Transação não autorizada pelo cartão";
                        break;
                case "PAYMENTS-091":
                    $error = $response['error_code'];	
                    $message =  "Fora do prazo permitido";
                        break;
                case "PAYMENTS-093":
                    $error = $response['error_code'];	
                    $message =  "Autorização já encontra-se em processamento";
                        break;
                case "PAYMENTS-094":
                    $error = $response['error_code'];	
                    $message =  "Autorização a confirmar o recebimento";
                        break;
                case "PAYMENTS-098":
                    $error = $response['error_code'];	
                    $message =  "Cliente não cadastrado";
                        break;
                case "PAYMENTS-117":
                    $error = $response['error_code'];	
                    $message =  "Solicite ao portator ligar para o emissor";
                        break;
                case "PAYMENTS-118":
                    $error = $response['error_code'];	
                    $message =  "Cartao invalido ou produto não habilitado";
                        break;
                case "PAYMENTS-999":
                    $error = $response['error_code'];	
                    $message =  "Transacao nao processada";
                        break;
                case "GENERIC-400":
                    $error = $response['error_code'];	
                    $message = "Preencha todos os dados do cartão e titular corretamente.";
                    break;
                default:
                    $error = $response['error_code'];	
                    $message =  "Ocorreu um erro temporário na Getnet (400). Contate o lojista.";
                        break;
            }
        } else if ($response['status_code'] == 404) {

            switch ($response['error_code']) {
                case "PAYMENTS-043":
                    $error = $response['error_code'];
                    $message = "Registro não encontrado";
                    break;
                case "PAYMENTS-057":
                    $error = $response['error_code'];
                    $message = "Transação não existe";
                    break;
                case "PAYMENTS-076":
                    $error = $response['error_code'];
                    $message = "Transação não disponível";
                    break;
                case "PAYMENTS-095":
                    $error = $response['error_code'];
                    $message = "Autorização não encontrada";
                    break;
                default:
                    $error = $response['error_code'];	
                    $message =  "Ocorreu um erro temporário na Getnet (404). Contate o lojista.";
                        break;
            }

        } else if ($response['status_code'] == 500) {

            switch ($response['error_code']) {
                case "PAYMENTS-042":
                    $error = $response['error_code'];
                    $message = "Resposta inválida";
                    break;
                case "PAYMENTS-059":
                    $error = $response['error_code'];
                    $message = "Problema rede local";
                    break;
                case "PAYMENTS-062":
                    $error = $response['error_code'];
                    $message = "Instituição temporariamente fora de operação";
                    break;
                case "PAYMENTS-063":
                    $error = $response['error_code'];
                    $message = "Mal funcionamento do sistema";
                    break;
                case "PAYMENTS-064":
                    $error = $response['error_code'];
                    $message = "Erro banco de dados";
                    break;
                case "PAYMENTS-071":
                    $error = $response['error_code'];
                    $message = "Autorizadora temporariamente bloqueada";
                    break;
                case "PAYMENTS-086":
                    $error = $response['error_code'];
                    $message = "Erro na transação";
                    break;
                case "PAYMENTS-099":
                    $error = $response['error_code'];
                    $message = "Autorizadora não inicializada";
                    break;
                case "PAYMENTS-100":
                    $error = $response['error_code'];
                    $message = "Canal desconectado";
                    break;
                case "PAYMENTS-107":
                    $error = $response['error_code'];
                    $message = "Erro de comunicação";
                    break;
                case "PAYMENTS-500":
                    $error = $response['error_code'];
                    $message = "Internal Server Error";
                    break;
                default:
                    $error = $response['error_code'];	
                    $message =  "Ocorreu um erro temporário na Getnet (500). Contate o lojista.";
                        break;
            }

        } else if ($response['status_code'] == 503) {

            if ($response['error_code'] == "PAYMENTS-021") {

                $error = $response['error_code'];
                $message = "Sistema do Emissor indisponível - Tente novamente";

            } else {

                $error = $response['error_code'];
                $message = "Sistema do Emissor indisponível - Tente novamente";
            }

        } else if ($response['status_code'] == 504) {

            switch ($response['error_code']) {
                case "PAYMENTS-031":
                    $error = $response['error_code'];
                    $message = "Timeout";
                    break;
                case "PAYMENTS-089":
                    $error = $response['error_code'];
                    $message = "Timeout interno";
                    break;
                default:
                    $error = $response['error_code'];	
                    $message =  "Ocorreu um erro temporário na Getnet (504). Contate o lojista.";
                        break;
            }

        } else if ($response['status_code'] == 402) {

            switch ($response['description_detail']) {
              case "00001 - Nosso número inválido/incompatível":
                $error = $response['error_code'];
                $message = "00001 - Nosso número inválido/incompatível";
                break;
              case "00007 - Espécie do documento inválida":
                $error = $response['error_code'];
                $message = "00007 - Espécie do documento inválida";
                break;
              case "00016 - Data de vencimento inválida":
                $error = $response['error_code'];
                $message = "00016 - Data de vencimento inválida";
                break;
              case "00057 - CEP do sacado incorreto":
                $error = $response['error_code'];
                $message = "00057 - CEP do sacado incorreto";
                break;
              case "00058 - CPF/CNPJ incorreto":
                $error = $response['error_code'];
                $message = "00058 - CPF/CNPJ incorreto";
                break;
              case "00093 - Valor do título não informado":
                $error = $response['error_code'];
                $message = "00093 - Valor do título não informado";
                break;
              case "00098 - Data emissão inválida":
                $error = $response['error_code'];
                $message = "00098 - Data emissão inválida";
                break;
              case "00100 - Data emissão maior que a data vencimento":
                $error = $response['error_code'];
                $message = "00100 - Data emissão maior que a data vencimento";
                break;
              case "00102 - Endereço do sacado não informado":
                $error = $response['error_code'];
                $message = "00102 - Endereço do sacado não informado";
                break;
              case "00103 - Município do sacado não informado":
                $error = $response['error_code'];
                $message = "00103 - Município do sacado não informado";
                break;
              case "00107 - Unidade da federação incorreta":
                $error = $response['error_code'];
                $message = "00107 - Unidade da federação incorreta";
                break;
              case "00113 - Valor desconto inválido":
                $error = $response['error_code'];
                $message = "00113 - Valor desconto inválido";
                break;
              case "00124 - CEP do sacado não encontrado":
                $error = $response['error_code'];
                $message = "00124 - CEP do sacado não encontrado";
                break;
              case "00128 - Código protesto inválido":
                $error = $response['error_code'];
                $message = "00128 - Código protesto inválido";
                break;
              case "00145 - Tipo de documento inválido":
                $error = $response['error_code'];
                $message = "00145 - Tipo de documento inválido";
                break;
              case "00147 - Quantidade de dias para protesto inválido":
                $error = $response['error_code'];
                $message = "00147 - Quantidade de dias para protesto inválido";
                break;
              case "00160 - Bairro do sacado não informado":
                $error = $response['error_code'];
                $message = "00160 - Bairro do sacado não informado";
                break;
              case "00176 - Registro não encontrado":
                $error = $response['error_code'];
                $message = "00176 - Registro não encontrado";
                break;
              case "00422 - Certificado inconsistente":
                $error = $response['error_code'];
                $message = "00422 - Certificado inconsistente";
                break;
              case "00423 - Estação não é do convênio":
                $error = $response['error_code'];
                $message = "00423 - Estação não é do convênio";
                break;
              case "00424 - Convênio não marcado para troca de mensagem para entrada online":
                $error = $response['error_code'];
                $message = "00424 - Convênio não marcado para troca de mensagem para entrada online";
                break;
              case "00425 - Ambiente marcado como teste e NSU não é de teste":
                $error = $response['error_code'];
                $message = "00425 - Ambiente marcado como teste e NSU não é de teste";
                break;
              case "00426 - Ambiente marcado como produção com NSU de teste":
                $error = $response['error_code'];
                $message = "00426 - Ambiente marcado como produção com NSU de teste";
                break;
              case "00427 - Código estação não pertence ao convênio":
                $error = $response['error_code'];
                $message = "00427 - Código estação não pertence ao convênio";
                break;
              case "00428 - Convênio não está ativo":
                $error = $response['error_code'];
                $message = "00428 - Convênio não está ativo";
                break;
              case "00429 - Tipo desconto inválido":
                $error = $response['error_code'];
                $message = "00429 - Tipo desconto inválido";
                break;
              case "00430 - Isento com valor de desconto":
                $error = $response['error_code'];
                $message = "00430 - Isento com valor de desconto";
                break;
              case "00431 - Campo nosso número não numérico":
                $error = $response['error_code'];
                $message = "00431 - Campo nosso número não numérico";
                break;
              case "00432 - Cliente não possui entrada online":
                $error = $response['error_code'];
                $message = "00432 - Cliente não possui entrada online";
                break;
              case "00433 - Data limite desconto inválida":
                $error = $response['error_code'];
                $message = "00433 - Data limite desconto inválida";
                break;
            default:
                $error = $response['error_code'];	
                $message =  "Ocorreu um erro temporário na Getnet (402). Contate o lojista.";
                    break;
            }

        }
    }






    

    $response = array (
        'error' => $error,
        'status' => $status,
        'message' => $message,
        'id' => $id_pagamento,
    );




    
    $pedido = $_POST['pedido'];
    $estabelecimento = $app['id'];
    $data = date('d-m-Y');
    $hora = date('H:i');
    $valor = $_POST['total'];
    $codigo = $response['id'];
    $status = $response['status'];
    $gateway = 'getnet';
    $status_description = $response['message'];


    //Cria pagamento

    if ( mysqli_query( $db_con, " INSERT INTO pagamentos(estabelecimento, pedido, data, hora, valor,gateway, codigo, status) VALUES ('$estabelecimento', '$pedido', '$data','$hora','$valor','$gateway','$codigo','$status') ")   ) {
        
        //Atualiza o status do pedido se o pagamento for aprovado.
        if ($response['status'] == "APPROVED") {
            //Atualizando status do pedido.
            mysqli_query( $db_con, "UPDATE pedidos SET status = '8' WHERE id = '$pedido'");

            //Atualiza o comprovante com código se o pagamento for aprovado.
            $_SESSION['checkout']['id_pagamento'] = $codigo;
            $comprovante = gera_comprovante($estabelecimento,"texto","1",$pedido);
            mysqli_query( $db_con, "UPDATE pedidos SET comprovante = '$comprovante' WHERE id = '$pedido'" );

            //Limpa a sacola
            unset( $_SESSION['sacola'] );
            unset( $_SESSION['checkout']['id_pagamento'] );

         

        
        } 
  


    }  

    print_r(json_encode($response));

?>