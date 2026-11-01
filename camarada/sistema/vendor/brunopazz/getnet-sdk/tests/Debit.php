<?php
namespace Getnet\API;
/**
 * Created by PhpStorm.
 * User: brunopaz
 * Date: 09/07/2018
 * Time: 02:41
 */
include "../vendor/autoload.php";
$getnet = new Getnet("c076e924-a3fe-492d-a41f-1f8de48fb4b1", "bc097a2f-28e0-43ce-be92-d846253ba748", "SANDBOX");
$transaction = new Transaction();
$transaction->setSellerId("1955a180-2fa5-4b65-8790-2ba4182a94cb");
$transaction->setCurrency("BRL");
$transaction->setAmount("1000");

$card = new Token("4012001037141112", "customer_21081826", $getnet);
$transaction->Debit("")
    ->setAuthenticated(false)
    ->setDynamicMcc("1799")
    ->setSoftDescriptor("LOJA*TESTE*COMPRA-123")
    ->setDelayed(false)
    ->setPreAuthorization(true)
    ->setNumberInstallments("2")
    ->setSaveCardData(false)
    ->setTransactionType("FULL")
    ->Card($card)
    ->setBrand("MasterCard")
    ->setExpirationMonth("12")
    ->setExpirationYear("20")
    ->setCardholderName("Bruno Paz")
    ->setSecurityCode("123");

$transaction->Customer("customer_21081826")
    ->setDocumentType("CPF")
    ->setEmail("customer@email.com.br")
    ->setFirstName("Bruno")
    ->setLastName("Paz")
    ->setName("Bruno Paz")
    ->setPhoneNumber("5551999887766")
    ->setDocumentNumber("12345678912")
    ->BillingAddress("90230060")
    ->setCity("São Paulo")
    ->setComplement("Sala 1")
    ->setCountry("Brasil")
    ->setDistrict("Centro")
    ->setNumber("1000")
    ->setPostalCode("90230060")
    ->setState("SP")
    ->setStreet("Av. Brasil");

$transaction->Shippings("")
    ->setEmail("customer@email.com.br")
    ->setFirstName("João")
    ->setName("João da Silva")
    ->setPhoneNumber("5551999887766")
    ->ShippingAddress("90230060")
    ->setCity("Porto Alegre")
    ->setComplement("Sala 1")
    ->setCountry("Brasil")
    ->setDistrict("São Geraldo")
    ->setNumber("1000")
    ->setPostalCode("90230060")
    ->setState("RS")
    ->setStreet("Av. Brasil");

$transaction->Order("123456")
    ->setProductType("service")
    ->setSalesTax("0");

$transaction->Device("hash-device-id")->setIpAddress("127.0.0.1");

$response = $getnet->Authorize($transaction);
print_r($response->getStatus() . "\n");

##### EMULA O REDIRECIONAMENTO E POST LADO CLIENTE -  $response->getRedirectUrl()

//URL QUE A GETNET IRÁ RETORNAR com o parametro payer_authentication_response
$URL_NOTIFY = urlencode("https://azpay.com.br/receiver");

// EMULA POST
$curl = curl_init();
curl_setopt_array($curl, array(
    CURLOPT_URL            => $response->getRedirectUrl(),
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_ENCODING       => "",
    CURLOPT_MAXREDIRS      => 10,
    CURLOPT_TIMEOUT        => 30,
    CURLOPT_HTTP_VERSION   => CURL_HTTP_VERSION_1_1,
    CURLOPT_CUSTOMREQUEST  => "POST",
    CURLOPT_POSTFIELDS     => "MD=" . $response->getIssuerPaymentId() . "&PaReq=" . $response->getPayerAuthenticationRequest() . "&TermUrl=" . $URL_NOTIFY,
    CURLOPT_HTTPHEADER     => array(
        "Cache-Control: no-cache",
        "Content-Type: application/x-www-form-urlencoded"
    ),
));
$response_curl = curl_exec($curl);
curl_close($curl);


// DEVERÁ SER COLETADO - demo abaixo
$payer_authentication_response = "im2qu4ap639nl9lof2pobdh8q8jm99nb3zbu1gc5kj8o2vftnp9488tjn2e2r3qlgqd8qevggbds7on81c9r496v1sobmnxip0zrecdgezm6omfd94sn11y6sv2rpicb9g75p7g51esccfxc13ng1jcglv4rr52000z5zt12o9r5nl6l36amnvdplb9an1a0d0tg2qxwdb0bpg6dqrsll8snj7k64wpkx1kpztktgzhogpi9qyryej3ib6uyaovdnu3c0jnoa6yd4ljnwhbjsle9a47e800k4ln269kw5puhucxnch0dfc8u9969o9nweukgvxfe393zuhlwnwmaamrm8xxfyoad95419wqe2ejtezpvseaky7vppm68x7yvf182oc0xh93stpbst73dh64klc54mzuke9n9u3qgisi1s8ps3c2royvup6d065nebc1fxzmqjjnyty2d6q5wbbmetgco8lm3rrjvi8jtc0nmsp4k9c9x";
###############################################################

//CONFIRMAR O PAGAMENTO COM payer_authentication_response recibo na URL de Noficação
$response = $getnet->AuthorizeConfirmDebit($response->getPaymentId(), $payer_authentication_response);
print_r($response->getStatus() . "\n");


### CANCELA PAGAMENTO (CANCEL)
$cancel = $getnet->AuthorizeCancel($response->getPaymentId(), $response->getAmount());
print_r($cancel->getStatus() . "\n");


