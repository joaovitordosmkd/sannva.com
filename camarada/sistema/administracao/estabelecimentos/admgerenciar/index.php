<?php
include('../../../_core/_includes/config.php');
restrict('1');
$subtitle = "Duplicar";
$mode2 = $_GET['mode2'];
$id = $_GET['id'];

// reportar todos os erros
error_reporting(E_ALL);
// display dos erros
ini_set('display_errors', 1);
// Função para duplicar o estabelecimento
function duplicate_estabelecimento($id) {
    global $db_con;

    function insertIntoDB($row) {
        $columns = [];
        $values = [];
    
        foreach ($row as $column => $value) {
            if ($column == 'id') {
                continue;  // Ignora a coluna de chave primária
            }
            if ($column == 'subdominio') {
                $value .= '-copy';  // Adiciona sufixo ao subdominio
            }
            if ($column == 'nome') {
                $value .= '_copy';  // Adiciona sufixo ao nome
            }
            if (is_numeric($value) && $value !== NULL) {
                $columns[] = $column;
                $values[] = $value;
            }
            else if ($value !== NULL) {
                $columns[] = $column;
                $values[] = "'" . addslashes($value) . "'";
            }            
        }
    
        $columns = implode(', ', $columns);
        $values = implode(', ', $values);
    
        return "INSERT INTO estabelecimentos ($columns) VALUES ($values)";
    }
    
    // Buscar estabelecimento original
    $sql_select = "SELECT * FROM estabelecimentos WHERE id = $id";
    $result_select = mysqli_query($db_con, $sql_select);
    $row = mysqli_fetch_assoc($result_select);  // Use mysqli_fetch_assoc aqui

    $sql_insert = insertIntoDB($row);
    $result_insert = mysqli_query($db_con, $sql_insert);
    if (!$result_insert) {
        return $sql_insert . "</br>" . mysqli_error($db_con);
    }
}


function duplicate_produtos($original_estabelecimento_id, $new_estabelecimento_id) {
    global $db_con;
    
    $sql_select = "SELECT * FROM produtos WHERE rel_estabelecimentos_id = $original_estabelecimento_id";
    $result_select = mysqli_query($db_con, $sql_select);
    
    while ($row = mysqli_fetch_array($result_select)) {
        $rel_estabelecimentos_id = $new_estabelecimento_id;
        $rel_categorias_id = $row['rel_categorias_id'];
        $destaque = $row['destaque'];
        $ref = $row['ref'];
        $codigo_pdv = $row['codigo_pdv'];
        $pontos = $row['pontos'];
        $permitir_troca = $row['permitir_troca'];
        $pontos_item = $row['pontos_item'];
        $nome = $row['nome'];
        $video_link = $row['video_link'];
        $descricao = $row['descricao'];
        $valor = $row['valor'];
        $oferta = $row['oferta'];
        $valor_promocional = $row['valor_promocional'];
        $variacao = $row['variacao'];
        $visible = $row['visible'];
        $status = $row['status'];
        $created = $row['created'];
        $last_modified = $row['last_modified'];
        $statusp = $row['statusp'];
        $integrado = $row['integrado'];
        $pesofrete = $row['pesofrete'];
        $alturafrete = $row['alturafrete'];
        $largurafrete = $row['largurafrete'];
        $comprimentofrete = $row['comprimentofrete'];
        $diametrofrete = $row['diametrofrete'];
        $estoque = $row['estoque'];
        $posicao = $row['posicao'];
        
        $sql_insert = "INSERT INTO produtos (rel_estabelecimentos_id, rel_categorias_id, destaque, ref, codigo_pdv, pontos, permitir_troca, pontos_item, nome, video_link, descricao, valor, oferta, valor_promocional, variacao, visible, status, created, last_modified, statusp, integrado, pesofrete, alturafrete, largurafrete, comprimentofrete, diametrofrete, estoque, posicao) VALUES ('$rel_estabelecimentos_id', '$rel_categorias_id', '$destaque', '$ref', '$codigo_pdv', '$pontos', '$permitir_troca', '$pontos_item', '$nome', '$video_link', '$descricao', '$valor', '$oferta', '$valor_promocional', '$variacao', '$visible', '$status', '$created', '$last_modified', '$statusp', '$integrado', '$pesofrete', '$alturafrete', '$largurafrete', '$comprimentofrete', '$diametrofrete', '$estoque', '$posicao')";
            
        $result_insert = mysqli_query($db_con, $sql_insert);
        if (!$result_insert) {
            return mysqli_error($db_con);
            // false;
        }
    }
    return true;
}

function duplicate_categorias($original_estabelecimento_id, $new_estabelecimento_id) {
    global $db_con;
    
    $sql_select = "SELECT * FROM categorias WHERE rel_estabelecimentos_id = $original_estabelecimento_id";
    $result_select = mysqli_query($db_con, $sql_select);
    
    while ($row = mysqli_fetch_array($result_select)) {
        $rel_estabelecimentos_id = $new_estabelecimento_id;
        $ordem = $row['ordem'];
        $nome = $row['nome'];
        $visible = $row['visible'];
        $status = $row['status'];
        $last_modified = $row['last_modified'];
        $domingo = $row['domingo'];
        $segunda = $row['segunda'];
        $terca = $row['terca'];
        $quarta = $row['quarta'];
        $quinta = $row['quinta'];
        $sexta = $row['sexta'];
        $sabado = $row['sabado'];
        $feriados = $row['feriados'];
        
        $sql_insert = "INSERT INTO categorias (rel_estabelecimentos_id, ordem, nome, visible, status, last_modified, domingo, segunda, terca, quarta, quinta, sexta, sabado, feriados) VALUES ('$rel_estabelecimentos_id', '$ordem', '$nome', '$visible', '$status', '$last_modified', '$domingo', '$segunda', '$terca', '$quarta', '$quinta', '$sexta', '$sabado', '$feriados')";
          
        $result_insert = mysqli_query($db_con, $sql_insert);
         if (!$result_insert) {
            return mysqli_error($db_con);
            // false;
        }
    }
    return true;
}

function troca_categorias($original_estabelecimento_id, $new_estabelecimento_id) {
    global $db_con;
    
    $sql_select = "SELECT * FROM produtos WHERE rel_estabelecimentos_id = $new_estabelecimento_id";
    $result_select = mysqli_query($db_con, $sql_select);
    
    while ($row = mysqli_fetch_array($result_select)) {
        
        $troca_categoria = mysqli_fetch_assoc(mysqli_query($db_con, "select id from categorias where nome = '".mysqli_fetch_assoc(mysqli_query($db_con, "select nome from categorias where id = ".$row['rel_categorias_id']))['nome']."' and rel_estabelecimentos_id = ".$row['rel_estabelecimentos_id']))['id'];
       // $nome_categoria = mysqli_fetch_assoc(mysqli_query($db_con, "SELECT nome FROM categorias WHERE id = " . $row['rel_categorias_id']))['nome'];
       // $troca_categoria = mysqli_fetch_assoc(mysqli_query($db_con, "SELECT id FROM categorias WHERE nome = '$nome_categoria'"))['id'];

        $sql_update = "UPDATE produtos SET rel_categorias_id = $troca_categoria where id = ".$row['id'];
          
        $result_insert = mysqli_query($db_con, $sql_update);
         if (!$result_insert) {
            return mysqli_error($db_con);
            // false;
        }
    }
    return true;
}



    
$new_estabelecimento_id = duplicate_estabelecimento($id);
//echo $new_estabelecimento_id;

$estabelecimento_name_query = "SELECT nome FROM estabelecimentos WHERE id = $id";
$estabelecimento_name_result = mysqli_query($db_con, $estabelecimento_name_query);
$estabelecimento_name_row = mysqli_fetch_assoc($estabelecimento_name_result);

$new_estabelecimento_name = $estabelecimento_name_row['nome'] . '_copy';
$new_estabelecimento_id_query = "SELECT id FROM estabelecimentos WHERE nome = '$new_estabelecimento_name'";
$new_estabelecimento_id_result = mysqli_query($db_con, $new_estabelecimento_id_query);
$new_estabelecimento_id_row = mysqli_fetch_assoc($new_estabelecimento_id_result);

$new_estabelecimento_id = $new_estabelecimento_id_row['id'];


if ($new_estabelecimento_id) {
    // Chamar a função para duplicar produtos associados ao estabelecimento
    $result = duplicate_produtos($id, $new_estabelecimento_id);
    $result2 = duplicate_categorias($id, $new_estabelecimento_id);
    $result3 = troca_categorias($id, $new_estabelecimento_id);


    if ($result3) {
        header("Location: ../index.php?msg=sucesso");
    } else {
        header("Location: ../index.php?msg=erro");
    }
} else {
    header("Location: ../index.php?msg=erro");
}

?>