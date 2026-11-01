<?php
include('../../../_core/_includes/config.php');
restrict_estabelecimento();
restrict_expirado();
$subtitle = "Atualizar Status do Pedido";

// Obtém os parâmetros da URL
$id = $_GET['id'];
$eid = $_SESSION['estabelecimento']['id'];
$nome = $_GET['nome'];
$whats = $_GET['whats'];

// Verifica se o pedido pertence ao estabelecimento
$query = mysqli_query($db_con, "SELECT * FROM pedidos WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");
if (mysqli_num_rows($query) == 0) {
    header("Location: ../index.php?msg=erro&reason=pedido_nao_encontrado");
    exit;
}

// Obtém o status do pagamento associado ao pedido
$pagamento_query = mysqli_query($db_con, "SELECT * FROM pagamentos WHERE pedido = '$id' AND estabelecimento = '$eid' ORDER BY id DESC LIMIT 1");
if (mysqli_num_rows($pagamento_query) > 0) {
    $pagamento = mysqli_fetch_assoc($pagamento_query);
    $status_pagamento = $pagamento['status'];

    // Define o status do pedido com base no status do pagamento
    switch ($status_pagamento) {
        case 'approved':
            $novo_status = 8; // Status "Pago" (ajuste conforme seu sistema)
            break;
        case 'in_process':
            $novo_status = 1; // Status "Pendente" (ajuste conforme seu sistema)
            break;
        case 'rejected':
            $novo_status = 4; // Status "Recusado" (ajuste conforme seu sistema)
            break;
        default:
            $novo_status = 4; // Status padrão (Pendente)
            break;
    }

    // Atualiza o status do pedido
    $update_query = mysqli_query($db_con, "UPDATE pedidos SET status = '$novo_status' WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");

    if ($update_query) {
        // Redireciona com mensagem de sucesso
        header("Location: ../index.php?msg=sucesso&nome=$nome&whats=$whats");
        exit;
    } else {
        // Redireciona com mensagem de erro
        header("Location: ../index.php?msg=erro&reason=falha_ao_atualizar");
        exit;
    }
} else {
    // Se não houver pagamento associado, mantém o status como pendente
    $update_query = mysqli_query($db_con, "UPDATE pedidos SET status = '4' WHERE id = '$id' AND rel_estabelecimentos_id = '$eid'");

    if ($update_query) {
        header("Location: ../index.php?msg=aceito&nome=$nome&whats=$whats");
        exit;
    } else {
        header("Location: ../index.php?msg=erro&reason=falha_ao_atualizar");
        exit;
    }
}
?>