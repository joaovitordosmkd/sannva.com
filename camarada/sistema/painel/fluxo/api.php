<?php
// Arquivo: saveFlow.php
// Salva o fluxo no banco de dados

require 'db.php';

$data = json_decode(file_get_contents('php://input'), true);

if (!$data) {
    echo json_encode(['error' => 'Dados inválidos']);
    exit;
}

$query = "INSERT INTO flows (data) VALUES (?)";
$stmt = $pdo->prepare($query);
if ($stmt->execute([json_encode($data)])) {
    echo json_encode(['success' => true]);
} else {
    echo json_encode(['error' => 'Erro ao salvar']);
}

?>

<?php
// Arquivo: loadFlow.php
// Carrega o fluxo salvo no banco de dados

require 'db.php';

$query = "SELECT data FROM flows ORDER BY id DESC LIMIT 1";
$stmt = $pdo->query($query);
$result = $stmt->fetch(PDO::FETCH_ASSOC);

echo json_encode($result ? json_decode($result['data'], true) : ['error' => 'Nenhum fluxo encontrado']);
?>

<?php
// Arquivo: openai.php
// Integração com OpenAI para resposta inteligente

require 'config.php';

$data = json_decode(file_get_contents('php://input'), true);
$message = $data['message'] ?? '';

if (!$message) {
    echo json_encode(['error' => 'Mensagem vazia']);
    exit;
}

$ch = curl_init('https://api.openai.com/v1/completions');
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, [
    'Content-Type: application/json',
    'Authorization: Bearer ' . OPENAI_API_KEY,
]);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode([
    'model' => 'gpt-3.5-turbo',
    'messages' => [['role' => 'system', 'content' => 'Responda como um assistente profissional.'], ['role' => 'user', 'content' => $message]],
    'temperature' => 0.7
]));

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>

<?php
// Arquivo: evolutionConnect.php
// Conecta com a Evolution API e gera QR Code

require 'config.php';

$data = json_decode(file_get_contents('php://input'), true);
$instance = $data['instance'] ?? '';
$key = $data['key'] ?? '';

if (!$instance || !$key) {
    echo json_encode(['error' => 'Credenciais inválidas']);
    exit;
}

$ch = curl_init("https://evolution-api.com/connect?instance=$instance&key=$key");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>

<?php
// Arquivo: evolutionSendMessage.php
// Envia mensagens pelo WhatsApp via Evolution API

require 'config.php';

$data = json_decode(file_get_contents('php://input'), true);
$number = $data['number'] ?? '';
$message = $data['message'] ?? '';
$instance = $data['credentials']['instance'] ?? '';
$key = $data['credentials']['key'] ?? '';

if (!$number || !$message || !$instance || !$key) {
    echo json_encode(['error' => 'Dados inválidos']);
    exit;
}

$ch = curl_init("https://evolution-api.com/sendMessage?instance=$instance&key=$key");
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_POST, true);
curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode(['number' => $number, 'message' => $message]));
curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json']);

$response = curl_exec($ch);
curl_close($ch);

echo $response;
?>
