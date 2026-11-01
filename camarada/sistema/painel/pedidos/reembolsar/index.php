<?php

include('../../../_core/_includes/config.php');

restrict_estabelecimento();

restrict_expirado();

$subtitle = "Bloquear";

?>



<!-- Aditional Header's -->





<?php



	$id = $_GET['id'];

	$eid = $_SESSION['estabelecimento']['id'];

	$nome = $_GET['nome'];

    $whats = $_GET['whats'];

	

	



	// VERIFICA SE O USUARIO TEM DIREITOS



	$edit = mysqli_query( $db_con, "UPDATE pedidos SET status = '7' WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");

	$pedido_data = mysqli_query( $db_con, "SELECT * FROM pedidos WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");
	$pedido_data = $data_content = mysqli_fetch_array( $pedido_data );
	$pedido_tipo = $pedido_data['cidade'];

	if( $edit ) {



		header("Location: ../index.php?msg=reembolsado&n=$nome&whats=$whats&pedido=$id");

	

	} else {



		header("Location: ../index.php?msg=erro");



	}



?>







