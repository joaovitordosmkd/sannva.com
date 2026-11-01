<?php 

include($virtualpath.'/_layout/define.php');

global $app;
global $db_con;

define("URL", "https://$_SERVER[HTTP_HOST]/");


$eid = $app['id'];
$data_estabelecimento = mysqli_query( $db_con, "SELECT * FROM estabelecimentos WHERE id = '$eid'");
$hasestabelecimento = mysqli_num_rows( $data_estabelecimento );
$data_estabelecimento = mysqli_fetch_array( $data_estabelecimento );


$sandbox = $data_estabelecimento['pagamento_pagseguro_sandbox'];

if ($hasestabelecimento) {

    if($sandbox == 1){

        define("EMAIL_PAGSEGURO", $data_estabelecimento['pagamento_pagseguro_email']);
        define("TOKEN_PAGSEGURO", $data_estabelecimento['pagamento_pagseguro_token']);
        define("URL_PAGSEGURO", "https://ws.sandbox.pagseguro.uol.com.br/v2/");
        define("SCRIPT_PAGSEGURO", "https://stc.sandbox.pagseguro.uol.com.br/pagseguro/api/v2/checkout/pagseguro.directpayment.js");
        define("EMAIL_LOJA", $data_estabelecimento['pagamento_pagseguro_email']);
        define("MOEDA_PAGAMENTO", "BRL");
        define("URL_NOTIFICACAO", "https://minhaveznodigital.com/pagseguro_notificacoes");

    }else{

        define("EMAIL_PAGSEGURO", $data_estabelecimento['pagamento_pagseguro_email']);
        define("TOKEN_PAGSEGURO", $data_estabelecimento['pagamento_pagseguro_token']);
        define("URL_PAGSEGURO", "https://ws.pagseguro.uol.com.br/v2/");
        define("SCRIPT_PAGSEGURO", "https://stc.pagseguro.uol.com.br/pagseguro/api/v2/checkout/pagseguro.directpayment.js");
        define("EMAIL_LOJA", $data_estabelecimento['pagamento_pagseguro_email']);
        define("MOEDA_PAGAMENTO", "BRL");
        define("URL_NOTIFICACAO", "https://minhaveznodigital.com/pagseguro_notificacoes");

    }

} else {
    header("Location: ".$app['url']."/sacola");
}



?>