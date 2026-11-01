<?php
// Dentro do código que processa novos pedidos (após inserir no banco):
$pedido_id = mysqli_insert_id($db_con); // Pega o ID do pedido recém-criado

// Aciona a impressão IMEDIATAMENTE
echo "<script>
    window.open('".panel_url()."/pedidos/imprimir/?id=$pedido_id', '_blank');
</script>";
?>