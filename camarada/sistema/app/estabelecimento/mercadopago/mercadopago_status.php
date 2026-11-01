<?php
// CORE
include($virtualpath.'/_layout/define.php');

// Obtém os parâmetros da URL com validação
$pedido = isset($_GET['pedido']) ? $_GET['pedido'] : null;
$status = isset($_GET['status']) ? $_GET['status'] : null;

$status_code = null;

// Verifica o status do pagamento
switch ($status) {
    case 'approved':
        $status_transacao = "Pagamento Aprovado";
        $status_transacao_descricao = "Seu pagamento foi aprovado com sucesso!";
        $status_code = 8;
        break;
    case 'pending':
        $status_transacao = "Pagamento Pendente";
        $status_transacao_descricao = "Seu pagamento está em análise. Aguarde a confirmação.";
        break;
    case 'failure':
        $status_transacao = "Pagamento Recusado";
        $status_transacao_descricao = "Seu pagamento foi recusado. Tente novamente.";
        break;
    default:
        header("Location: " . $app['url'] . "/pedidosabertos");
        exit;
}


// Atualiza o status do pedido apenas se for "approved"
if ($status_code !== null) {
    $stmt = $db_con->prepare("UPDATE pedidos SET status = ? WHERE id = ?");
    $stmt->bind_param("ii", $status_code, $pedido);
    $stmt->execute();
    $stmt->close();
}

// Limpar o carrinho
unset($_SESSION['sacola']);

header("Location: " . $app['url'] . "/pedidosabertos");
exit;
?>