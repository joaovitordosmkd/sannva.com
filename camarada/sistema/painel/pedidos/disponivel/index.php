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



	$edit = mysqli_query( $db_con, "UPDATE pedidos SET status = '5' WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");


	// print_r($comprovante['comprovante']);


	if( $edit ) {



		header("Location: ../index.php?msg=disponivel&id=".$id."&whats=".$whats);

	

	} else {



		header("Location: ../index.php?msg=erro");



	}



?>






