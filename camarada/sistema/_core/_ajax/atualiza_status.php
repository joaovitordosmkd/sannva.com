<?php
session_start();
require_once("../config.php"); // ajuste se seu config estiver em outro caminho

header('Content-Type: application/json');

$input = json_decode(file_get_contents("php://input"), true);
$status = isset($input['status']) ? $input['status'] : null;
$id = $_SESSION['estabelecimento']['id'] ?? null;

if (!$id || !in_array($status, ['open', 'closed'])) {
    echo json_encode(['success' => false, 'message' => 'Requisição inválida']);
    exit;
}

$novo_valor = ($status === 'open') ? 1 : 0;

try {
    $pdo = new PDO("mysql:host=localhost;dbname=SEUBANCO", "USUARIO", "SENHA"); // AJUSTE
    $stmt = $pdo->prepare("UPDATE estabelecimentos SET funcionamento = ? WHERE id = ?");
    $stmt->execute([$novo_valor, $id]);

    echo json_encode(['success' => true]);
} catch (PDOException $e) {
    echo json_encode(['success' => false, 'message' => 'Erro no banco de dados']);
}
