<?php 

include($virtualpath.'/_layout/define.php');

global $app;
global $db_con;

//Cria registro do pagamento no banco de dados


if ($_POST) {

    $pedido = mysqli_real_escape_string( $db_con, $_POST['pedido'] );
    $estabelecimento = mysqli_real_escape_string( $db_con, $_POST['estabelecimento'] );
    $data = mysqli_real_escape_string( $db_con, $_POST['data'] );
    $hora = mysqli_real_escape_string( $db_con, $_POST['hora'] );
    $valor = mysqli_real_escape_string( $db_con, $_POST['valor'] );
    $codigo = mysqli_real_escape_string( $db_con, $_POST['codigo'] );
    $status = mysqli_real_escape_string( $db_con, $_POST['status'] );
    $gateway = mysqli_real_escape_string( $db_con, $_POST['gateway'] );
    //Verifica pedido


    //Cria pagamento
    if ( mysqli_query( $db_con, " INSERT INTO pagamentos(estabelecimento, pedido, data, hora, valor,gateway, codigo, status) VALUES ('$estabelecimento', '$pedido', '$data','$hora','$valor','$gateway','$codigo','$status') ")   ) {
        
        //Atualiza o status do pedido se o pagamento for aprovado.
        if ($status == "3") {
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

        echo "true";


    } else {
       echo "false";
    }

} else {
    echo "false";
}


//Atualiza status do pedido







?>