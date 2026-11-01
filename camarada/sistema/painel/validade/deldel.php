<?php
if (isset($_GET['id'])) {
    deleteRows($_GET['id']);
}

function deleteRows($id) {
    $servername = "localhost";
    $username = "lucas";
    $password = "Lulu2000*";
    $dbname = "xtrendit_delivery";

    // Cria a conexão
    $conn = new mysqli($servername, $username, $password, $dbname);

    // Verifica a conexão
    if ($conn->connect_error) {
        die("Conexão falhou: " . $conn->connect_error);
    }

    $sqlDel = "DELETE FROM `estabelecimentos` WHERE `estabelecimentos`.`id` = $id";
    $resultDel = $conn->query($sqlDel);
    
    if ($resultDel === TRUE) {
        echo "Registros deletados com sucesso";
    } else {
        echo "Erro ao deletar registros: " . $conn->error;
    }

    // Obtém todas as tabelas do banco de dados
    $result = $conn->query("SHOW TABLES");

    while ($row = $result->fetch_row()) {
        $table = $row[0];

        // SQL para deletar uma linha
        $sql = "DELETE FROM $table WHERE rel_estabelecimentos_id=$id";

        if ($conn->query($sql) === TRUE) {
            echo "Registros deletados com sucesso da tabela $table";
        } else {
            echo "Erro ao deletar registros da tabela $table: " . $conn->error;
        }
    }

    $conn->close();
}
?>
