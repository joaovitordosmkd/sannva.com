<?php
// CORE
include($virtualpath.'/_layout/define.php');

// Inclui as configurações do MercadoPago
include('config.php');

// Configura o SDK do MercadoPago
require_once './vendor/autoload.php';


// Receber a notificação do Mercado Pago
$json = file_get_contents('php://input');
$notification = json_decode($json, true);

// Verifica se é um evento de pagamento
if (isset($notification['type']) && $notification['type'] == 'payment') {
    $payment_id = $notification['data']['id'];

    // Consultar os detalhes do pagamento via API do Mercado Pago
    MercadoPago\SDK::setAccessToken(SECRET_MERCADOPAGO);

    $payment = MercadoPago\Payment::find_by_id($payment_id);
    if ($payment) {
        $status = $payment->status; // 'approved', 'pending', 'rejected', etc.
        $pedido_id = $payment->external_reference; // ID do seu pedido interno

        // Atualizar o status do pedido no banco de dados
        if ($status == 'approved') {
            // Marca o pedido como pago
            $status_code = 8; // Status "Pago"

            $stmt = $db_con->prepare("UPDATE pedidos SET status = ? WHERE id = ?");
            $stmt->bind_param("ii", $status_code, $pedido_id);
            $stmt->execute();
            $stmt->close();
        }
    }
}

// returna http200 com json vazio
header("Content-Type: application/json", true, 200);
echo json_encode([]);
exit;

?>