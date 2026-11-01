<?php 

include($virtualpath.'/_layout/define.php');

global $app;
global $db_con;

define("URL", "https://$_SERVER[HTTP_HOST]/");


$eid = $app['id'];
$data_estabelecimento = mysqli_query( $db_con, "SELECT * FROM estabelecimentos WHERE id = '$eid'");
$hasestabelecimento = mysqli_num_rows( $data_estabelecimento );
$data_estabelecimento = mysqli_fetch_array( $data_estabelecimento );


$sandbox = $data_estabelecimento['pagamento_mercadopago_sandbox'];

if ($hasestabelecimento) {

    if($sandbox == 1){

        define("PUBLIC_MERCADOPAGO", $data_estabelecimento['pagamento_mercadopago_public']);
        define("SECRET_MERCADOPAGO", $data_estabelecimento['pagamento_mercadopago_secret']);

    }else{

        define("PUBLIC_MERCADOPAGO", $data_estabelecimento['pagamento_mercadopago_public']);
        define("SECRET_MERCADOPAGO", $data_estabelecimento['pagamento_mercadopago_secret']);

    }

} else {
    header("Location: ".$app['url']."/sacola");
}



?>