<?php
include($virtualpath.'/_layout/define.php');
global $app;
global $db_con;

// Inclui as configurações do MercadoPago
include('config.php');

// Verifica se o MercadoPago está ativo
if ($data_estabelecimento['pagamento_mercadopago'] != 1) {
    header("Location: " . $app['url'] . "/sacola");
    exit;
}

// Obtém o pedido
$pedido = mysqli_real_escape_string($db_con, $_GET['pedido']);
$data_pedido = mysqli_query($db_con, "SELECT * FROM pedidos WHERE id = '$pedido'");
$haspedido = mysqli_num_rows($data_pedido);
$data_pedido = mysqli_fetch_array($data_pedido);

if (!$haspedido || $data_pedido['status'] != 1) {
    header("Location: " . $app['url'] . "/pedidosabertos");
    exit;
}


// Configura o SDK do MercadoPago
require_once './vendor/autoload.php';
MercadoPago\SDK::setAccessToken(SECRET_MERCADOPAGO);

// Cria a preferência de pagamento
$preference = new MercadoPago\Preference();

// Item do pedido
$item = new MercadoPago\Item();
$item->title = "Pedido #" . $pedido;
$item->quantity = 1;
$item->unit_price = $data_pedido['v_pedido'] + $data_pedido['taxa'];
$preference->items = array($item);

// URLs de retorno (dinâmicas)
$preference->back_urls = array(
    "success" => $app['url'] . "/mercadopago_status?pedido=" . $pedido . "&status=approved",
    "failure" => $app['url'] . "/mercadopago_status?pedido=" . $pedido . "&status=failure",
    "pending" => $app['url'] . "/mercadopago_status?pedido=" . $pedido . "&status=pending"
);

$preference->auto_return = "approved"; // Redireciona automaticamente após aprovação
$preference->notification_url = $app['url'] . "/mercadopago_webhook";
$preference->external_reference = $pedido;
$preference->save();

// Redireciona para o checkout do MercadoPago
header('Location: ' . $preference->init_point);
exit;
?>