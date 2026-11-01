<?php

// CORE
include('../../_core/_includes/config.php');
//include "config.php";

global $db_con;
global $_SESSION;


$db_conn = $db_con;

$token = $_SESSION['estabelecimento']['id'];
$id_estabelecimento = $token;

function log_data_ajax($message, $data = null)
{
    //return; // Comente para ativar o log

    date_default_timezone_set('America/Sao_Paulo');

    $log_dir = __DIR__;
    $log_file = $log_dir . '/log.txt';

    if (!file_exists($log_dir)) {
        mkdir($log_dir, 0755, true);
    }

    $current = file_exists($log_file) ? file_get_contents($log_file) : '';
    $log_entry = "[" . date("Y-m-d H:i:s") . "] " . $message;

    if ($data !== null) {
        $log_entry .= " - " . json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    }

    $log_entry .= "\n";

    file_put_contents($log_file, $current . $log_entry);
}

//Processar AJAX registrar_pedido_pdv

// Verificar se a requisição é POST
if ($_SERVER['REQUEST_METHOD'] == 'POST') {
    // Obter dados do pedido
    $pedido = $_POST['pedido'];
    // $peid = $_POST['pedido']; // Removido, $peid é definido após inserção
    // log_data_ajax('Pedido Array: ' . print_r($pedido, true));

    // Adicionar log detalhado para depuração
    log_data_ajax('Dados recebidos no backend (completo)', $pedido);

    // Obter dados do cliente e itens do pedido
    $cliente = $pedido['cliente'];
    $itens = $pedido['itens']; // Definir $itens AQUI

    // >>> NOVO LOG: Verificar os itens recebidos
    log_data_ajax('Itens recebidos do frontend (array $itens)', $itens); // Agora $itens está definido e pode ser logado corretamente

    //$token = $cliente['token']; // $token já definido pela sessão
    $rel_segmentos_id = $cliente['rel_segmentos_id'];
    $rel_estabelecimentos_id = $cliente['rel_estabelecimentos_id'];
    $nome = mysqli_real_escape_string($db_conn, $cliente['nome']); // Escapar dados do cliente
    $whatsapp = mysqli_real_escape_string($db_conn, $cliente['whatsapp']);
    $estado = mysqli_real_escape_string($db_conn, $cliente['estado']);
    $cidade = mysqli_real_escape_string($db_conn, $cliente['cidade']);
    $forma_entrega = mysqli_real_escape_string($db_conn, $cliente['forma_entrega']);
    $forma_entrega_nome = mysqli_real_escape_string($db_conn, $cliente['forma_entrega_nome']);
    $endereco_cep = mysqli_real_escape_string($db_conn, $cliente['endereco_cep']);
    $endereco_numero = mysqli_real_escape_string($db_conn, $cliente['endereco_numero']);
    $endereco_bairro = mysqli_real_escape_string($db_conn, $cliente['endereco_bairro']);
    $endereco_rua = mysqli_real_escape_string($db_conn, $cliente['endereco_rua']);
    $endereco_complemento = mysqli_real_escape_string($db_conn, $cliente['endereco_complemento']);
    $endereco_referencia = mysqli_real_escape_string($db_conn, $cliente['endereco_referencia']);
    $forma_pagamento = mysqli_real_escape_string($db_conn, $cliente['forma_pagamento']);
    $forma_pagamento_nome = mysqli_real_escape_string($db_conn, $cliente['forma_pagamento_nome']);
    $forma_pagamento_informacao = mysqli_real_escape_string($db_conn, $cliente['forma_pagamento_informacao']);
    $data_hora = $cliente['data_hora']; // Usar a data/hora do frontend
    // $vpedido = $cliente['vpedido']; // Será recalculado no backend para segurança
    $cupom_info = $cliente['cupom']; // Pode ser valor (ex: 10.50) ou porcentagem (ex: 15)

    // --- Início: Recalcular Subtotal, Desconto e Total no Backend ---
    $subtotal_recalculado = 0;
    foreach ($itens as $item) {
        // Garantir que preço e quantidade são numéricos
        $preco_item = floatval($item['preco'] ?? 0);
        $quantidade_item = intval($item['quantidade'] ?? 0);
        // >>> NOVO LOG: Verificar preço e quantidade de cada item
        log_data_ajax('Item para cálculo', ['id' => $item['produto_id'] ?? 'N/A', 'preco_recebido' => $item['preco'] ?? 'N/A', 'preco_float' => $preco_item, 'qtd' => $quantidade_item]);
        $subtotal_recalculado += ($preco_item * $quantidade_item);
    }

    // Calcular valor do desconto
    $desconto_valor_final = 0;
    $desconto_aplicado_texto = ""; // Texto para o comprovante
    if (!empty($cupom_info)) {
        if (is_numeric($cupom_info) && $cupom_info > 0) {
             // Verifica se é porcentagem (enviado como número pelo JS antigo) ou valor fixo
             // Assumindo que o JS antigo envia a porcentagem como número (ex: 15 para 15%)
             // E valor fixo como número (ex: 10.50)
             // Precisamos diferenciar. Uma heurística: se for inteiro <= 100, pode ser %. Senão, valor.
             // **MELHORIA FUTURA:** O frontend deveria enviar tipo e valor do desconto separados.
             if (strpos($cliente['forma_pagamento_informacao'], '%') !== false || (ctype_digit(strval($cupom_info)) && floatval($cupom_info) <= 100)) {
                 // Assume porcentagem
                 $desconto_percentual = floatval($cupom_info);
                 if ($desconto_percentual > 0 && $desconto_percentual <= 100) {
                     $desconto_valor_final = ($subtotal_recalculado * $desconto_percentual) / 100;
                     $desconto_aplicado_texto = number_format($desconto_percentual, 0) . "%";
                 }
             } else {
                 // Assume valor fixo
                 $desconto_valor_final = floatval($cupom_info);
                 // Garante que o desconto não seja maior que o subtotal
                 if ($desconto_valor_final > $subtotal_recalculado) {
                     $desconto_valor_final = $subtotal_recalculado;
                 }
                 $desconto_aplicado_texto = "R$ " . number_format($desconto_valor_final, 2, ',', '.');
             }
        }
    }
     // Garante que o desconto não seja negativo
     $desconto_valor_final = max(0, $desconto_valor_final);


    // Extrair taxa de entrega
    $taxa_entrega_valor = 0.00;
    if (!empty($forma_entrega_nome)) {
        // Expressão regular para encontrar 'R$ XX,XX' ou 'R$ XX.XX'
        if (preg_match('/R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/', $forma_entrega_nome, $matches)) {
            // Substitui vírgula por ponto para conversão em float
            $taxa_entrega_valor = floatval(str_replace(',', '.', $matches[1]));
        }
    }
     // Garante que a taxa não seja negativa
     $taxa_entrega_valor = max(0, $taxa_entrega_valor);

    // Calcular total final (Subtotal - Desconto + Taxa)
    $total_final_recalculado = $subtotal_recalculado - $desconto_valor_final + $taxa_entrega_valor;
     // Garante que o total não seja negativo
     $total_final_recalculado = max(0, $total_final_recalculado);

    // Log dos valores recalculados
    log_data_ajax('Valores Recalculados', [
        'subtotal' => $subtotal_recalculado,
        'desconto_valor' => $desconto_valor_final,
        'taxa_entrega' => $taxa_entrega_valor,
        'total_final' => $total_final_recalculado
    ]);
    // --- Fim: Recalcular Subtotal, Desconto e Total no Backend ---


    // Preparar e enviar a resposta
    $response = [];
    try {
        //Registrar pedido usando os valores recalculados
        if ($pedido_pdv = new_pedido_pdv(
            $db_conn,
            $token,
            $rel_segmentos_id,
            $rel_estabelecimentos_id,
            $nome,
            $whatsapp,
            $estado, // Passando estado e cidade para a função
            $cidade,
            $forma_entrega,
            $endereco_cep,
            $endereco_numero,
            $endereco_bairro,
            $endereco_rua,
            $endereco_complemento,
            $endereco_referencia,
            $forma_pagamento,
            $forma_pagamento_informacao,
            $data_hora,
            $desconto_aplicado_texto, // Passa o texto do desconto (ex: "10%" ou "R$ 5,00")
            $total_final_recalculado // Passa o valor total recalculado
        )) {
            log_data_ajax('Pedido PDV Inserido com Sucesso ID: ' . $pedido_pdv);

            $peid = $pedido_pdv; // ID do pedido inserido

            // >>> NOVO LOG: Verificar valores ANTES de chamar gera_comprovante_pdv
            log_data_ajax('Valores ANTES de gerar comprovante', [
                'itens_array' => $itens,
                'subtotal_passado' => $subtotal_recalculado,
                'desconto_valor_passado' => $desconto_valor_final,
                'taxa_entrega_passada' => $taxa_entrega_valor,
                'total_final_passado' => $total_final_recalculado
            ]);

            // Chama a função gera_comprovante_pdv com os valores corretos
            $comprovante = gera_comprovante_pdv(
                $rel_estabelecimentos_id,
                "texto", // modo
                "1", // tamanho (não usado na lógica atual da função)
                $peid, // numero do pedido
                $nome,
                $whatsapp,
                $forma_entrega, // ID da forma de entrega
                $forma_entrega_nome, // Nome da forma de entrega (com valor)
                $endereco_rua,
                $endereco_numero,
                $endereco_bairro,
                $endereco_cep,
                $endereco_complemento,
                $cidade, // Passando cidade
                $endereco_referencia,
                $forma_pagamento_nome, // Nome da forma de pagamento
                $forma_pagamento_informacao, // Info extra (troco, transação)
                $itens, // Array de itens do carrinho
                $desconto_aplicado_texto, // Texto do desconto
                $subtotal_recalculado, // Subtotal (soma dos preços*qtd originais)
                $desconto_valor_final, // Valor numérico do desconto
                $taxa_entrega_valor, // Valor numérico da taxa
                $total_final_recalculado // Valor total final
            );

            // Gerar comprovante e registrar no log
            log_data_ajax('Comprovante gerado (texto)', $comprovante);

            // Salvar comprovante no banco de dados
            $comprovante_escapado = mysqli_real_escape_string($db_conn, $comprovante);
            mysqli_query($db_conn, "UPDATE pedidos SET comprovante = '$comprovante_escapado' WHERE id = '$peid'");

            // Chama novamente para comprovante_html (se necessário)
            $comprovante_html = gera_comprovante_pdv(
                 $rel_estabelecimentos_id,
                 "html", // modo
                 "1", // tamanho
                 $peid,
                 $nome,
                 $whatsapp,
                 $forma_entrega,
                 $forma_entrega_nome,
                 $endereco_rua,
                 $endereco_numero,
                 $endereco_bairro,
                 $endereco_cep,
                 $endereco_complemento,
                 $cidade, // Passando cidade
                 $endereco_referencia,
                 $forma_pagamento_nome,
                 $forma_pagamento_informacao,
                 $itens,
                 $desconto_aplicado_texto,
                 $subtotal_recalculado,
                 $desconto_valor_final,
                 $taxa_entrega_valor,
                 $total_final_recalculado
            );
            $comprovante_html_escapado = mysqli_real_escape_string($db_conn, $comprovante_html);

            mysqli_query($db_conn, "UPDATE pedidos SET comprovante_html = '$comprovante_html_escapado' WHERE id = '$peid'");

            // Confirmar pedido (mudar status para 'Confirmado' ou similar) - Status 6 pode ser 'Confirmado'
            $confirmar_pedido = mysqli_query($db_conn, "UPDATE pedidos SET status = '6' WHERE id = '$peid' AND rel_estabelecimentos_id = '$rel_estabelecimentos_id'");

            // Adicionar verificação de erro para a consulta de atualização do status
            if (!$confirmar_pedido) {
                log_data_ajax('Erro ao atualizar status do pedido no banco de dados', mysqli_error($db_conn));
                $response['status'] = 'erro';
                $response['mensagem'] = 'Erro ao atualizar o status do pedido. Por favor, tente novamente.';
                echo json_encode($response);
                exit;
            } else {
                 log_data_ajax('Status do Pedido ID ' . $peid . ' atualizado para 6 (Confirmado)');
            }

            // Garantir que o pedido seja exibido no painel
            $atualizar_painel = mysqli_query($db_conn, "UPDATE pedidos SET visivel_painel = 1 WHERE id = '$peid'");
            if (!$atualizar_painel) {
                log_data_ajax('Erro ao atualizar visibilidade do pedido no painel', mysqli_error($db_conn));
                // Não crítico, continua mas loga o erro
            } else {
                 log_data_ajax('Visibilidade do Pedido ID ' . $peid . ' atualizada para 1');
            }

            // patch-bessa update de estoque - Verificar se a lógica está correta
             foreach ($pedido["itens"] as $prodkey => $product) {
                 $productId = intval($product["produto_id"] ?? 0);
                 $ammoutPurchased = intval($product["quantidade"] ?? 0);
                 // $ammoutInStock = intval($product["estoque"] ?? 0); // Estoque enviado pelo frontend pode estar desatualizado

                 if ($productId > 0 && $ammoutPurchased > 0) {
                     // Buscar estoque atual do banco para segurança
                     $queryEstoqueAtual = "SELECT posicao FROM produtos WHERE id = $productId";
                     $resultEstoque = mysqli_query($db_conn, $queryEstoqueAtual);
                     if ($rowEstoque = mysqli_fetch_assoc($resultEstoque)) {
                         $ammoutInStock = intval($rowEstoque['posicao']);
                         $stockAfterDeduction = $ammoutInStock - $ammoutPurchased;
                         // Evitar estoque negativo se a lógica permitir
                         // $stockAfterDeduction = max(0, $stockAfterDeduction);

                         $updatedquery = "UPDATE produtos SET posicao = $stockAfterDeduction WHERE id = $productId";
                         if (mysqli_query($db_conn, $updatedquery)) {
                             log_data_ajax("Estoque do produto ID $productId atualizado para $stockAfterDeduction");
                         } else {
                             log_data_ajax("Erro ao atualizar estoque do produto ID $productId", mysqli_error($db_conn));
                         }
                     } else {
                         log_data_ajax("Produto ID $productId não encontrado para atualização de estoque.");
                     }
                 }
             }


            log_data_ajax('Processamento do Pedido ID ' . $peid . ' concluído com sucesso.');

            $response['status'] = 'sucesso';
            $response['mensagem'] = 'Pedido registrado com sucesso.';
            $response['pedido_pdv'] = $pedido_pdv; // Envia o ID do pedido de volta
        } else {
            // Erro na função new_pedido_pdv
            log_data_ajax('Erro ao chamar new_pedido_pdv', mysqli_error($db_conn)); // Logar erro do DB se houver
            $response['status'] = 'erro';
            $response['mensagem'] = 'Ocorreu um erro ao inserir o pedido no banco de dados. Por favor, tente novamente.';
            // $response['debug'] = $pedido_pdv; // $pedido_pdv seria false aqui
        }
    } catch (Exception $e) {
        // Em caso de erro inesperado (Exception)
        log_data_ajax('Exceção durante processamento do pedido: ' . $e->getMessage());
        $response['status'] = 'erro';
        $response['mensagem'] = 'Ocorreu um erro inesperado ao registrar o pedido. Por favor, tente novamente.';
    }

    // Enviar resposta em formato JSON
    header('Content-Type: application/json');
    echo json_encode($response);
    exit; // Termina o script após enviar a resposta JSON

} else {
    // Resposta para métodos não permitidos
    log_data_ajax('Tentativa de acesso com método não permitido: ' . $_SERVER['REQUEST_METHOD']);
    header("HTTP/1.1 405 Method Not Allowed");
    exit;
}


// Função para inserir o pedido no banco de dados
// ATENÇÃO: A ordem dos parâmetros foi ajustada para corresponder à chamada
function new_pedido_pdv(
    $db_conn,
    $token, // ID do estabelecimento da sessão
    $rel_segmentos_id,
    $rel_estabelecimentos_id,
    $nome,
    $whatsapp,
    $estado, // Adicionado
    $cidade, // Adicionado
    $forma_entrega, // ID da forma de entrega
    $endereco_cep,
    $endereco_numero,
    $endereco_bairro,
    $endereco_rua,
    $endereco_complemento,
    $endereco_referencia,
    $forma_pagamento, // ID da forma de pagamento
    $forma_pagamento_informacao,
    $data_hora,
    $cupom_texto, // Texto do desconto (ex: "10%" ou "R$ 5,00")
    $vpedido // Valor total final recalculado
) {

    // session_id( $token ); // Não necessário se já estiver usando a sessão
    $status = "1"; // Status inicial (Pendente ou similar, será atualizado depois)

    // Usar prepared statements para segurança
    $sql = "INSERT INTO pedidos (
              rel_segmentos_id,
              rel_estabelecimentos_id,
              nome,
              whatsapp,
              forma_entrega,
              estado,
              cidade,
              endereco_cep,
              endereco_numero,
              endereco_bairro,
              endereco_rua,
              endereco_complemento,
              endereco_referencia,
              forma_pagamento,
              forma_pagamento_informacao,
              status,
              data_hora,
              cupom,
              v_pedido
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)";

    $stmt = mysqli_prepare($db_conn, $sql);

    if ($stmt) {
        // Garante que os IDs sejam inteiros antes de fazer o bind
        $rel_segmentos_id_int = intval($rel_segmentos_id);
        $rel_estabelecimentos_id_int = intval($rel_estabelecimentos_id);
        $forma_entrega_int = intval($forma_entrega);
        $forma_pagamento_int = intval($forma_pagamento);

        mysqli_stmt_bind_param(
            $stmt,
            "iisiisssssssssisssd", // Mantém os tipos corretos aqui
            $rel_segmentos_id_int, // Usa a variável convertida
            $rel_estabelecimentos_id_int, // Usa a variável convertida
            $nome,
            $whatsapp,
            $forma_entrega_int, // Usa a variável convertida
            $estado,
            $cidade,
            $endereco_cep,
            $endereco_numero,
            $endereco_bairro,
            $endereco_rua,
            $endereco_complemento,
            $endereco_referencia,
            $forma_pagamento_int, // Usa a variável convertida
            $forma_pagamento_informacao,
            $status, // Passa o status como string '1'
            $data_hora,
            $cupom_texto,
            $vpedido
        );

        if (mysqli_stmt_execute($stmt)) {
            $peid = mysqli_insert_id($db_conn); // Pega o ID do pedido inserido
            mysqli_stmt_close($stmt);

            return $peid; // Retorna o ID do pedido inserido

        } else {
            // Erro ao executar o statement
            // Log detalhado do erro MySQL
            log_data_ajax("Erro MySQL ao executar statement: (" . mysqli_stmt_errno($stmt) . ") " . mysqli_stmt_error($stmt));
            mysqli_stmt_close($stmt);
            return false;
        }
    } else {
        // Erro ao preparar o statement
        // Log detalhado do erro MySQL
        log_data_ajax("Erro MySQL ao preparar statement: (" . mysqli_errno($db_conn) . ") " . mysqli_error($db_conn));
        return false;
    }
}



// Função para gerar o comprovante - AJUSTADA PARA USAR VALORES CORRETOS
function gera_comprovante_pdv(
    $eid, // ID Estabelecimento (não usado diretamente aqui, mas pode ser útil)
    $modo, // "texto" ou "html"
    $tamanho, // Não usado
    $numero, // ID do pedido
    $nome, // Nome cliente
    $whatsapp, // WhatsApp cliente
    $forma_entrega_id, // ID forma entrega
    $forma_entrega_nome, // Nome forma entrega (com valor)
    $endereco_rua,
    $endereco_numero,
    $endereco_bairro,
    $endereco_cep,
    $endereco_complemento,
    $endereco_cidade, // Adicionado
    $endereco_referencia,
    $forma_pagamento_nome, // Nome forma pagamento
    $forma_pagamento_informacao, // Info extra pagamento
    $itens, // Array de itens
    $cupom_texto, // Texto do desconto (ex: "10%" ou "R$ 5,00")
    $subtotal_final, // Subtotal REAL (soma dos itens ANTES do desconto)
    $desconto_valor, // Valor numérico do desconto aplicado
    $taxa_entrega_valor, // Valor numérico da taxa de entrega
    $total_final // Valor total final (subtotal - desconto + taxa)
) {
    global $db_conn; // Usar a conexão global se precisar buscar dados extras

    // Buscar nome do estabelecimento (exemplo, se necessário)
    $nome_estabelecimento = "SHOP BURGER"; // Valor padrão
    $queryEstab = "SELECT nome FROM estabelecimentos WHERE id = '$eid' LIMIT 1";
    $resultEstab = mysqli_query($db_conn, $queryEstab);
    if ($dataEstab = mysqli_fetch_assoc($resultEstab)) {
        $nome_estabelecimento = $dataEstab['nome'];
    }

    $horario = date('d/m/Y \\à\\s H:i'); // Horário atual da geração do comprovante
    $nl = ($modo == "html") ? "<br>" : "\n"; // Nova linha dependendo do modo

    $comprovante = strtoupper($nome_estabelecimento) . $nl;
    $comprovante .= "Pedido #$numero" . $nl;
    $comprovante .= "$horario" . $nl;
    $comprovante .= "------" . $nl;
    $comprovante .= "Cliente: $nome" . $nl;
    if (!empty($whatsapp)) { // Exibe WhatsApp apenas se não estiver vazio
        $comprovante .= "WhatsApp: $whatsapp" . $nl;
    }
    $comprovante .= $nl; // Linha extra

    // Adiciona Endereço se houver (se não for retirada no local)
    if ($forma_entrega_id != '0' && !empty($endereco_rua)) { // Verifica se não é retirada (ID 0) e se tem rua
        $comprovante .= "Endereço:" . $nl;
        $comprovante .= "$endereco_rua, $endereco_numero" . (!empty($endereco_complemento) ? " - $endereco_complemento" : "") . $nl;
        $comprovante .= "$endereco_bairro - $endereco_cidade" . $nl; // Adiciona cidade
        $comprovante .= "CEP: $endereco_cep" . $nl;
        if (!empty($endereco_referencia)) {
            $comprovante .= "Referência: $endereco_referencia" . $nl;
        }
        $comprovante .= $nl; // Linha extra
    }

    // Adiciona Forma de Entrega
    if (!empty($forma_entrega_nome)) {
        // Remove o valor R$ da string para exibição mais limpa, se desejado
        $forma_entrega_texto = preg_replace('/ - R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)/', '', $forma_entrega_nome);
        $comprovante .= "Entrega: $forma_entrega_texto" . $nl . $nl;
    }

    // Adiciona Forma de Pagamento
    $comprovante .= "Forma de pagamento: $forma_pagamento_nome";
    if (!empty($forma_pagamento_informacao)) {
        // Limpa a info extra se for redundante (ex: "Valor Pago: R$ X")
        $info_pagamento_limpa = preg_replace('/Valor Pago: R\$\s*([0-9]+(?:[.,][0-9]{1,2})?)\s*-?\s*/i', '', $forma_pagamento_informacao);
         if (!empty(trim($info_pagamento_limpa))) {
              $comprovante .= " (" . trim($info_pagamento_limpa) . ")";
         }
    }
    $comprovante .= $nl;

    $comprovante .= "------" . $nl;

    // Processa cada item
    if (!empty($itens)) {
        foreach ($itens as $item) {
            $quantidade = intval($item['quantidade'] ?? 1);
            $nome_produto_completo = $item['produto_nome'] ?? 'Produto desconhecido';
            $preco_unitario = floatval($item['preco'] ?? 0); // Preço unitário original
            $subtotal_item = $preco_unitario * $quantidade; // Subtotal do item original

            // Limpeza do nome do produto (remover partes indesejadas como variações duplicadas se houver)
            // A lógica de extrair nome base e variações do JS antigo pode ser adaptada aqui se necessário
            $nome_produto_limpo = $nome_produto_completo; // Usar o nome como veio por enquanto
            // Tentar extrair nome base e variações se o formato for consistente
             $linhas_produto = explode("<br>", str_replace("\n", "<br>", $nome_produto_limpo)); // Normaliza quebras de linha
             $nome_base = trim(array_shift($linhas_produto)); // Primeira linha como nome base
             // Remove "Variações:" se presente
             if (isset($linhas_produto[0]) && stripos(trim($linhas_produto[0]), 'Variações:') === 0) {
                 array_shift($linhas_produto);
             }
             $variacoes_texto = implode($nl . "  ", array_map('trim', $linhas_produto)); // Junta variações com indentação


            // Monta a string do item no comprovante
            $comprovante .= "* $quantidade x " . $nome_base . $nl;
            if (!empty($variacoes_texto)) {
                $comprovante .= "  " . $variacoes_texto . $nl; // Exibe variações indentadas
            }
            // Exibe o subtotal do item (Preço Unitário * Quantidade)
            $comprovante .= "Valor: R$ " . number_format($subtotal_item, 2, ',', '.') . $nl;
            $comprovante .= "------" . $nl;
        }
         // Remove o último separador de itens
         $comprovante = rtrim($comprovante, "------" . $nl);
         $comprovante .= $nl; // Adiciona uma linha em branco antes dos totais
    } else {
         $comprovante .= "Nenhum item no pedido." . $nl; // Mensagem se o carrinho estiver vazio (improvável aqui)
    }


    $comprovante .= "------" . $nl;

    // Subtotal (valor total dos itens ANTES do desconto)
    $comprovante .= "Subtotal: R$ " . number_format($subtotal_final, 2, ',', '.') . $nl;

    // Mostra desconto se aplicado
    if ($desconto_valor > 0) {
        // Exibe o tipo de desconto (ex: "Desconto (10%)" ou "Desconto")
        $texto_label_desconto = "Desconto";
        if (!empty($cupom_texto) && strpos($cupom_texto, '%') !== false) {
            $texto_label_desconto .= " (" . trim($cupom_texto) . ")";
        } elseif (!empty($cupom_texto) && is_numeric(str_replace(['R$', ',', '.'], '', $cupom_texto))) {
             // Se for valor fixo, não adiciona nada extra ao label
        }

        $comprovante .= $texto_label_desconto . ": - R$ " . number_format($desconto_valor, 2, ',', '.') . $nl;
    }

    // Taxa de entrega
    $comprovante .= "Taxa de entrega: R$ " . number_format($taxa_entrega_valor, 2, ',', '.') . $nl;

    // Total final
    $comprovante .= "Total: R$ " . number_format($total_final, 2, ',', '.') . $nl;

    $comprovante .= $nl; // Linha extra antes da mensagem final
    $comprovante .= "Obrigado pela preferência!" . $nl;
    $comprovante .= "Volte sempre!";

    // Se o modo for HTML, fazer substituições adicionais se necessário
    if ($modo == "html") {
        // Exemplo: converter \n para <br> (já feito com $nl)
        // Pode adicionar outras formatações HTML aqui
    }

    return $comprovante;
}

?>
