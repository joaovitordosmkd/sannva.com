<?php



include($virtualpath.'/_layout/define.php');

global $app;
global $db_con;

define("URL", "https://$_SERVER[HTTP_HOST]/");


$eid = $app['id'];
$data_estabelecimento = mysqli_query( $db_con, "SELECT * FROM estabelecimentos WHERE id = '$eid'");
$hasestabelecimento = mysqli_num_rows( $data_estabelecimento );
$data_estabelecimento = mysqli_fetch_array( $data_estabelecimento );

$sandbox = $data_estabelecimento['pagamento_getnet_sandbox'];

if ($hasestabelecimento) {

    if($sandbox == 1){

        define("CLIENT_ID", $data_estabelecimento['pagamento_getnet_client_id']);
        define("CLIENT_SECRET", $data_estabelecimento['pagamento_getnet_client_secret']);
        define("SELLER_ID", $data_estabelecimento['pagamento_getnet_seller_id']);


    }else{

        define("CLIENT_ID", $data_estabelecimento['pagamento_getnet_client_id']);
        define("CLIENT_SECRET", $data_estabelecimento['pagamento_getnet_client_secret']);
        define("SELLER_ID", $data_estabelecimento['pagamento_getnet_seller_id']);


    }

} else {
    header("Location: ".$app['url']."/sacola");
}



?>
