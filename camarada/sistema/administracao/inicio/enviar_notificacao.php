<?php
// Configurações de conexão com o banco de dados
$host = 'localhost';
$dbname = 'tecautov_notificacao';
$user = 'tecautov_notificacao';
$pass = '].vy@*DpZwnS';

try {
    // Conectar ao banco de dados
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Verifica se o formulário foi enviado
    if ($_SERVER['REQUEST_METHOD'] === 'POST') {
        $titulo = trim($_POST['titulo']);
        $descricao = trim($_POST['descricao']);

        if (!empty($titulo) && !empty($descricao)) {
            // Inserir a notificação no banco de dados
            $stmt = $pdo->prepare("INSERT INTO notificacoes (titulo, descricao) VALUES (:titulo, :descricao)");
            $stmt->execute(['titulo' => $titulo, 'descricao' => $descricao]);

            echo "<script>alert('Notificação enviada com sucesso!');</script>";
        } else {
            echo "<script>alert('Por favor, preencha todos os campos.');</script>";
        }
    }
} catch (PDOException $e) {
    die("Erro na conexão: " . $e->getMessage());
}
?>

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Enviar Notificação</title>
    <style>
        /* Estilos para a página */
        body {
            font-family: Arial, sans-serif;
            margin: 0;
            padding: 0;
            display: flex;
            flex-direction: column;
            min-height: 100vh;
        }
        .container {
            flex: 1;
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .form-container {
            width: 100%;
            max-width: 600px;
            padding: 20px;
            border: 1px solid #ccc;
            border-radius: 10px;
            background-color: #f9f9f9;
            box-shadow: 0 2px 10px rgba(0, 0, 0, 0.1);
        }
        h2 {
            text-align: center;
        }
        .form-group {
            margin-bottom: 15px;
        }
        label {
            display: block;
            margin-bottom: 5px;
        }
        input[type="text"], textarea {
            width: 100%;
            padding: 10px;
            border: 1px solid #ccc;
            border-radius: 5px;
            box-sizing: border-box;
        }
        textarea {
            resize: vertical;
            height: 100px;
        }
        button {
            width: 100%;
            padding: 10px;
            background-color: #4CAF50;
            color: white;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            font-size: 16px;
        }
        button:hover {
            background-color: #45a049;
        }
        footer {
            text-align: center;
            padding: 10px;
            background-color: #f1f1f1;
            position: relative;
            bottom: 0;
            width: 100%;
        }

        /* Responsividade */
        @media (max-width: 768px) {
            .form-container {
                padding: 15px;
            }
            button {
                font-size: 14px;
            }
        }
    </style>
</head>
<body>

<div class="container">
    <div class="form-container">
        <h2>Enviar Notificação</h2>
        <form method="POST" action="">
            <div class="form-group">
                <label for="titulo">Título:</label>
                <input type="text" id="titulo" name="titulo" required>
            </div>
            <div class="form-group">
                <label for="descricao">Descrição:</label>
                <textarea id="descricao" name="descricao" required></textarea>
            </div>
            <button type="submit">Enviar</button>
        </form>
    </div>
</div>

<footer>
    &copy; <?php echo date('Y'); ?> Sua Empresa
</footer>

</body>
</html>
