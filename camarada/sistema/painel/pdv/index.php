<?php

// CORE

include('../../_core/_includes/config.php');

// RESTRICT

// restrict_estabelecimento();

// SEO



//ini_set('display_errors', 1);

//ini_set('display_startup_errors', 1);

//error_reporting(E_ALL);





$seo_subtitle = "PDV";

$seo_description = "";

$seo_keywords = "";

// HEADER

$system_header .= "";

include('../_layout/head.php');

//include('../_layout/top.php');

include('../_layout/sidebars.php');

include('../_layout/modal.php');

//include "config.php";



global $db_con;



$db_conn = $db_con;



$token = $_SESSION['estabelecimento']['id'];

$id_estabelecimento = $token;





?>

  

  

  <?php

//Session



$datetime = date('Y-m-d H:i:s');



$rel_estabelecimentos_id = $id_estabelecimento;

$dataestabelecimento = mysqli_fetch_array(mysqli_query($db_con, "SELECT * FROM estabelecimentos WHERE id = '$id_estabelecimento' LIMIT 1"));

echo $nome = $dataestabelecimento['nome'];

$foto_url = $dataestabelecimento['perfil'];

$subdominio = $dataestabelecimento['subdominio'];

$retirada_local = $dataestabelecimento['entrega_retirada'];

$rel_segmentos_id = $dataestabelecimento['segmento'];



//Variaveis de pagamento do estabelecimento

$pagamento_dinheiro = $dataestabelecimento['pagamento_dinheiro'];

$pagamento_cartao_debito = $dataestabelecimento['pagamento_cartao_debito'];

$pagamento_cartao_debito_bandeiras = $dataestabelecimento['pagamento_cartao_debito_bandeiras'];

$pagamento_cartao_credito = $dataestabelecimento['pagamento_cartao_credito'];

$pagamento_cartao_credito_bandeiras = $dataestabelecimento['pagamento_cartao_credito_bandeiras'];

$pagamento_cartao_alimentacao = $dataestabelecimento['pagamento_cartao_alimentacao'];

$pagamento_cartao_alimentacao_bandeiras = $dataestabelecimento['pagamento_cartao_alimentacao_bandeiras'];

$pagamento_outros = $dataestabelecimento['pagamento_outros'];

$pagamento_outros_descricao = $dataestabelecimento['pagamento_outros_descricao'];

$pagamento_outros_descricao_nome = $dataestabelecimento['pagamento_outros_descricao_nome'];

$pagamento_outros_nome = $dataestabelecimento['pagamento_outros_nome'];

$pagamento_pix = $dataestabelecimento['pagamento_pix'];



if ($pagamento_outros_nome == '' && $pagamento_outros_descricao_nome == '') {

    $pagamento_outros_nome_texto = '';

} else if ($pagamento_outros_nome != '' && $pagamento_outros_descricao_nome == '') {

    $pagamento_outros_nome_texto = '<p class="pagamento-texto nome-pix">Nome: <span class="nome-pix-valor">' . $pagamento_outros_nome . '</span></p>';

} else if ($pagamento_outros_nome == '' && $pagamento_outros_descricao_nome != '') {

    $pagamento_outros_nome_texto = '<p class="pagamento-texto nome-pix">Nome: <span class="nome-pix-valor">' . $pagamento_outros_descricao_nome . '</span></p>';

} else if ($pagamento_outros_nome != '' && $pagamento_outros_descricao_nome != '') {

    $pagamento_outros_nome_texto = '<p class="pagamento-texto nome-pix">Nome: <span class="nome-pix-valor">' . $pagamento_outros_nome . ' (' . $pagamento_outros_descricao_nome . ')</span></p>';

}



function log_data($message, $data = null)

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



?>



<!DOCTYPE html>



<html>



<head>

    <!--Alterar o favicon-->

    <link rel="shortcut icon" href="https://<?php echo $simple_url ?>/_core/_uploads/<?php echo $foto_url; ?>" type="image/x-icon">

    <link href="https://<?php echo $simple_url ?>/_core/_uploads/<?php echo $foto_url; ?>" rel="icon">

    <!--Alterar o titulo da página-->

    <title>PDV - <?php echo $nome; ?></title>



    <script src="https://code.jquery.com/jquery-3.5.1.min.js"></script>



    <style>

        .icon-adicionado {

            background-color: #67b017;

            border-radius: 100%;

            color: white !important;

        }



        .botoes-response {

            display: flex;

            width: 100%;

            align-items: center;

            gap: 15px;

            flex-wrap: nowrap;

            justify-content: center;

        }



        .btn-response {

            color: white;

            display: flex;

            gap: 15px;

            align-items: center;

            font-size: 15px;

            padding: 16px 26px !important;

        }



        .modal-response {

            display: flex;

            position: fixed;

            left: 0;

            top: 0;

            width: 100%;

            height: 100%;

            align-items: center;

            justify-content: center;

            background-color: #00000047;

            z-index: 999999;

        }



        .modal-response-content {

            background-color: white;

            padding: 30px;

            border-radius: 10px;

            width: 38%;

            display: flex;

            flex-direction: column;

        }



        .modal-response-content i.lni-checkmark-circle {

            font-size: 100px;

            color: green;

            text-align: center;

            font-weight: 800;

        }



        p.modal-response-texto {

            font-size: 20px;

            font-weight: 600;

            color: black;

            text-align: center;

            margin: 25px 0px;

        }



        body {

            background-color: #f1f1f1;

            padding: 10px;

        }



        .header-pdv {

            display: flex;

            background-color: white;

            flex-wrap: nowrap;

            padding: 10px 15px;

        }



        .info-estabelecimento {

            display: flex;

            flex-wrap: nowrap;

            align-items: center;

        }



        .img-estabelecimento {

            width: 40px;

            height: 40px;

        }



        .titulo-estabelecimento {

            width: 50%;

            font-weight: 600;

            margin: 0px 15px;

            font-size: 20px;

        }



        .inputs-pdv {

            display: flex;

            flex-wrap: nowrap;

            align-items: center;

        }



        .input-header-linha {

            display: flex;

            align-items: center;

            margin-left: 15px;

            position: relative;

        }



        .input-header-linha i {

            position: absolute;

            right: 10px;

        }



        .input-header-linha input {

            width: 350px;

            height: 38px;

        }



        .linha-1-pdv,

        .linha-2-pdv {

            display: flex;

            align-items: flex-start;

            gap: 25px;

            margin-top: 15px;

        }



        .sugestao-produtos {

            display: grid;

            grid-template-columns: 1fr 1fr 1fr 1fr !important;

            column-gap: 25px !important;

            row-gap: 0px !important;

            width: 65%;

            background-color: white;

            padding: 10px 20px;

            height: 360px;

            overflow-y: auto;

        }



        .produto {

            margin: 0 0 10px 0;

            box-shadow: 0 10px 20px rgba(0, 0, 0, .15);

            border-radius: 12px;

            overflow: hidden;

            transition: 0.3s;

            height: 164px;

        }



        .produto-img img {

            width: 100%;

            height: 93px;

            object-fit: cover;

        }



        .produto-info {

            padding: 8px 12px 5px 12px;

        }



        h3.produto-nome {

            display: block;

            margin: 0px;

            font-weight: 600;

            color: rgba(0, 0, 0, .5);

            font-size: 12px;

            line-height: 16px;

            height: 19px;

        }



        .produto-linha {

            display: flex;

            align-items: center;

            padding: 0px 10px 10px 10px;

        }



        .escolha-variacao {

            background-color: #457d08;

            height: 40px;

        }



        .escolha-variacao .produto-preco {

            width: 100%;

            display: flex;

            justify-content: center;

            align-items: center;

            padding-top: 5px;

            color: white;

            font-weight: 500;

        }



        p.produto-preco {

            display: block;

            margin: 0;

            font-weight: 600;

            font-size: 18px;

            line-height: 22px;

            color: #67b017;

        }



        p.produto-preco-promocional {

            display: block;

            margin: 0 0 0px 0;

            font-size: 10px;

            line-height: 10px;

            color: red;

            text-decoration: line-through;

        }



        .produto-preço-div {

            width: 70%;

            float: left;

        }



        .mais {

            float: right;

            width: 40%;

        }



        .mais i {

            display: block;

            margin: auto;

            float: right;

            font-size: 25px;

            color: #67b017;

            transition: 0.3s;

            cursor: pointer;

        }



        .carrinho-compras {

            width: 35%;

            background-color: white;

            padding: 0px 20px 10px 20px;

            height: 360px;

            overflow-y: auto;

        }



        h2.titulo-carrinho {

            font-size: 22px;

            font-weight: 600;

            display: flex;

            align-items: center;

            justify-content: space-between;

        }



        /* Para o Google Chrome, Safari e Edge */

        input[type="number"]::-webkit-inner-spin-button,

        input[type="number"]::-webkit-outer-spin-button {

            -webkit-appearance: none;

            margin: 0;

        }



        /* Para o Mozilla Firefox */

        input[type="number"] {

            -moz-appearance: textfield;

        }



        .item-carrinho-linha {

            display: flex;

            flex-wrap: nowrap;

            gap: 10px;

            align-items: center;

        }



        .botoes-input {

            display: flex;

            flex-wrap: nowrap;

        }



        .botao-quantidade {

            color: black;

            background-color: #afadad !important;

            padding: 10px;

            height: 35px;

            font-weight: 600;

            display: flex;

            font-size: 16px;

            line-height: 0;

            align-items: center;

        }



        input.quantidade {

            height: 35px;

            background-color: white;

            width: 40px;

            font-size: 16px;

            font-weight: 600;

            padding: 0px 0px 0px 16px;

        }



        p.item-carrinho-nome {

            font-size: 13px;

            margin: 0;

            width: 50%;

        }



        p.item-carrinho-preco {

            font-size: 16px;

            font-weight: 600;

            width: 20%;

            margin: 0;

            color: black;

        }



        .itens-carrinho {

            margin-top: 25px;

        }



        .item-carrinho {

            padding-bottom: 20px;

            padding-top: 15px;

            border-bottom: 1px #c9c9c9 solid;

        }



        .botao-quantidade i {

            margin: 0;

            color: black !important;

        }



        .lni-close {

            cursor: pointer;

        }



        p.sem-produtos {

            grid-column-start: 1;

            grid-column-end: 3;

            display: inline-flex;

            font-weight: 600;

            margin-top: 10px;

        }



        h2.titulo-dados-cliente {

            font-size: 22px;

            font-weight: 600;

        }



        .dados-cliente {

            width: 65%;

            background-color: white;

            padding: 0px 20px 10px 20px;

            height: 270px;

            overflow-y: auto;

        }



        .dados-client-content {

            display: flex;

            flex-wrap: wrap;

            gap: 20px;

        }



        .w-50 {

            width: calc(50% - 10px);

        }



        .w-100 {

            width: 100%;

        }



        .fake-select,

        .fake-select select {

            position: relative;

            cursor: pointer !important;

        }



        i.lni.lni-chevron-down {

            margin: 20px 15px 0 0;

        }



        p.endereco-cliente {

            font-size: 16px;

            font-weight: 600;

        }



        .endereco-cliente-inputs {

            display: grid;

            grid-template-columns: 1fr 1fr;

            column-gap: 25px;

            row-gap: 15px;

            margin-bottom: 18px;

        }



        .form-field-default {

            margin: 0 !important;

        }



        .horarios-div {

            grid-column: 1/3;

        }



        .pagamento-div {

            width: 35%;

            background-color: white;

            padding: 20px;

            height: 270px;

            overflow-y: auto;

        }



        .total-pdv {

            width: 35%;

            background-color: white;

            padding: 20px 20px 0px 20px;

            position: relative;

            display: flex;

            flex-direction: column;

            align-items: flex-end;

        }



        .linha-2-pdv {

            gap: 15px !important;

        }



        .variacoes-modal {

            display: flex;

            position: fixed;

            left: 0;

            top: 0;

            width: 100%;

            height: 100%;

            align-items: center;

            justify-content: center;

            background-color: #00000047;

            z-index: 9999;

        }



           .variacoes-content-modal {

            background-color: white;

            padding: 30px;

            border-radius: 10px;

            width: 38%;

            display: flex;

            flex-direction: column;

             max-height: 400px; /* Ajuste conforme necessário */

    overflow-y: auto

        }



        .variacao-itens {

            display: flex;

            gap: 15px;

            flex-wrap: wrap;

        }



        .variacao-item {

            display: flex;

            float: left;

            align-items: center;

            margin: 0 0 10px 0;

            background: rgba(0, 0, 0, .05);

            cursor: pointer;

            width: calc(50% - 8px);

            min-height: 62px;

            padding: 0;

        }



        .check {

            display: flex;

            align-items: center;

            justify-content: center;

            width: 15%;

            float: left;

            padding: 10px 10px 8px 10px;

            height: 35px;

            transition: .4s;

            background: rgba(0, 0, 0, .05);

        }



        .detalhes {

            display: block;

            width: 800px !important;

            float: left;

            padding: 10px 10px 8px 10px;

            min-height: 80px;

        }



        span.titulo {

            display: block;

            padding: 2px 0 0 0;

            font-weight: 600;

        }



        .check.marcado {

            background-color: #27293e;

            color: white;

        }



        .variacao-nome {

            width: 100%;

            margin-top: 15px;

            color: black;

            font-weight: 600;

        }



        button.adicionar-ao-carrinho {

            color: white;

            font-size: 15px;

            margin-top: 15px;

        }



        .fechar-modal-variacoes {

            text-align: right;

        }



        a.fechar-modal-variacoes {

            text-align: right;

        }



        p.total-itens-total {

            position: absolute;

            left: 20px;

            font-size: 15px;

            font-weight: 600;

            color: black;

        }



        .subtotal-total {

            font-size: 16px;

            font-weight: 600;

            color: black;

            margin-bottom: 5px;

        }



        .entrega-total {

            font-size: 16px;

            font-weight: 600;

            color: black;

            margin-bottom: 5px;

        }



        .desconto-total {
            display: none; /* Oculta o desconto sem remover o elemento do DOM */
        }

        p.total-total {

            font-size: 22px;

            font-weight: 700;

            color: black;

            margin-bottom: 5px;

            margin-top: 25px;

        }



        button.finalizar-pedido {

            width: calc(100% + 40px);

            margin: 20px -20px 0px -20px;

            background-color: #67b017 !important;

            color: black;

            font-size: 20px;

            font-weight: 700;

            line-height: 0px;

            display: flex;

            align-items: center;

            justify-content: center;

            padding: 15px 0;

            cursor: pointer;

        }



        .pagamento-content {

            margin-top: 25px;

        }



        p.pagamento-texto {

            text-align: center;

            font-weight: 600;

            margin-bottom: 25px;

        }



        p.texto-troco {

            margin-top: 15px;

            text-align: center;

            color: black;

            font-size: 16px;

            font-weight: 500;

        }



        .pagamento.whatsapp i {

            font-size: 50px;

            text-align: center;

            width: 100%;

            margin-bottom: 15px;

            color: #80808066;

        }



        .pagamento-inputs .input-dados-cliente {

            margin-bottom: 20px;

        }

    </style>



    <!--responsivo-->

    <style>

        @media (max-width: 800px) {



            .modal-response-content {

                width: 100%;

                z-index: 999999;

            }



            .linha-1-pdv {

                align-items: center;

                flex-wrap: wrap;

                justify-content: center;

            }



            .sugestao-produtos {

                width: 100%;

                height: 700px;

                grid-template-columns: 1fr 1fr !important;

            }



            .header-pdv {

                flex-wrap: wrap;

                flex-direction: column;

                align-items: center;

                width: 100%;

            }



            .inputs-pdv {

                flex-wrap: wrap !important;

                flex-direction: column;

            }



            .input-header-linha input {

                width: 300px;

                margin-top: 15px;

            }



            i.lni.lni-search-alt {

                top: 26px;

            }



            .input-header-linha {

                margin-left: 0;

            }



            h2.titulo-estabelecimento {

                width: 45%;

                margin: 0;

            }



            .info-estabelecimento {

                width: 100%;

                justify-content: center;

            }



            .header-pdv a {

                width: 100%;

                text-align: center;

            }



            .produto {

                height: 185px;

            }



            p.produto-preco-promocional {

                font-size: 12px;

            }



            h3.produto-nome {

                height: 37px;

            }



            .escolha-variacao .produto-preco {

                font-size: 12px;

            }



            .produto-img img {

                height: 95px;

            }



            .carrinho-compras {

                width: 100%;

            }



            .variacoes-content-modal {

                width: 100%;

            }



            .linha-2-pdv {

                flex-wrap: wrap;

                align-items: center;

                justify-content: center;

            }



            .dados-cliente {

                width: 100%;

                height: 100%;

                padding: 0px 20px 20px 20px;

            }



            .pagamento-div {

                width: 100%;

                height: 100%;

            }



            .total-pdv {

                width: 100%;

            }



        }

    </style>

</head>



<body>

    <div class="modal-response" style="display: none;">

        <div class="modal-response-content">

            <i class="lni lni-checkmark-circle"></i>

            <p class="modal-response-texto">Pedido Registrado com Sucesso!</p>

            <div class="botoes-response">

                <button class="btn-response btn-novo-pedido"><i class="lni lni-plus"></i> Novo Pedido</button>

                <button class="btn-response btn-imprimir"><i class="lni lni-printer"></i> Imprimir Comprovante</button>

            </div>

        </div>

    </div>



    <div class="header-pdv">

        <a href="/painel/pdv">

            <div class="info-estabelecimento">

                <img src="../../_core/_uploads/<?php echo $foto_url; ?>" class="img-circle img-estabelecimento" alt="Estabelecimento Perfil">

                <h2 class="titulo-estabelecimento"><?php echo $nome; ?></h2>

            </div>

        </a>



        <div class="inputs-pdv">

            <div class="input-header-linha">

                <input type="text" id="pesquisar-produto" placeholder="CÓD./REF./Nome">

                <i class="lni lni-search-alt"></i>

            </div>

            <div class="input-header-linha">

                <input type="text" id="categoria-produto" placeholder="Categoria">

                <i class="lni lni-search-alt"></i>

            </div>

        </div>

    </div>



    <div class="linha-1-pdv">



        <div class="sugestao-produtos">

            <p class="sem-produtos" style="display: none;">Nenhum produto disponível.</p>

            <?php



            //Exibir produtos do estabelecimento selecionado e com estoque disponível e ativos

            $query = "SELECT p.*, p.id as produto_id, p.nome as produto_nome, c.nome as categoria_nome 

          FROM produtos p

          LEFT JOIN categorias c ON p.rel_categorias_id = c.id

          WHERE p.rel_estabelecimentos_id = '$id_estabelecimento' AND p.status = '1'

          ORDER BY p.id DESC";



            $result = mysqli_query($db_conn, $query);



            if (!$result) {

                die("Erro na consulta SQL: " . mysqli_error($db_conn));

                echo "Erro na consulta SQL: " . mysqli_error($db_conn);

            }



            while ($row = mysqli_fetch_array($result)) {

                $id = $row['id'];

                $nome = $row['nome'];

                $produto_variacao_nomer = $row['produto_nome'];
                $produto_variacao_idr = $row['produto_id'];



                $oferta = $row['oferta'];

                $preco_texto_produto = '';



                //Se oferta for igual a 1 pega o valor promocional

                if ($oferta == 1) {

                    $preco = $row['valor_promocional'];

                    $preco_promocional = $row['valor_promocional'];

                    $preco_normal = $row['valor'];



                    $preco_texto_produto = "<p class='produto-preco'>" . number_format($preco, 2, ',', '.') . "</p>

                    <p class='produto-preco-promocional'> De R$ " . number_format($preco_normal, 2, ',', '.') . "</p>";

                } else {

                    $preco = $row['valor'];

                    $preco_promocional = '';

                    $preco_normal = $row['valor'];



                    $preco_texto_produto = "<p class='produto-preco'>" . number_format($preco, 2, ',', '.') . "</p>";

                }



                $foto = $row['destaque'];

                $categoria = $row['rel_categorias_id'];

                

                $variacoes = $row['variacao'];

                $descricao = $row['descricao'];

                $status = $row['status'];

                $ref = $row['ref'];

                $rel_estabelecimentos_id = $row['rel_estabelecimentos_id'];

                $estoque = $row['posicao'];

                $categoria_nome = $row['categoria_nome'];

                

                $variacao = $row['variacao'];



                $variacoes = json_decode($row['variacao'], true);

                $atributos_variacoes = "";

                $html_variacoes = "";

                $variacoes_modal = "";

                $escolha_maxima_texto = "";



                if ($preco == 0) {

                    $preco_texto_na_variacao = '';

                } else {

                    $preco_texto_na_variacao = "Valor do produto: R$ $preco";

                }



// var_dump($variacoes);



                if (!empty($variacoes)) {

                    foreach ($variacoes as $indice_variacao => $variacao) {

                        $nome_variacao = htmljson($variacao['nome']);

                        $escolha_minima = htmljson($variacao['escolha_minima']);

                        $escolha_maxima = htmljson($variacao['escolha_maxima']);



                        if ($escolha_maxima <= 1) {

                            $escolha_maxima_texto = " (Selecionte $escolha_maxima opção)";

                        } else {

                            $escolha_maxima_texto = " (Selecionte até $escolha_maxima opções)";

                        }



                        // Adicionar atributos de variação

                        $atributos_variacoes .= " data-variacao-$indice_variacao='sim'";

                        $atributos_variacoes .= " data-nome-variacao-$indice_variacao='$nome_variacao'";

                        $atributos_variacoes .= " data-escolha-minima-$indice_variacao='$escolha_minima'";

                        $atributos_variacoes .= " data-escolha-maxima-$indice_variacao='$escolha_maxima'";



                        //HTML de variação

                        $html_variacoes .= "<p class='variacao-nome' data-variacao-$indice_variacao='sim'

                        data-nome-variacao-$indice_variacao='$nome_variacao' data-escolha-minima-$indice_variacao='$escolha_minima'

                        data-escolha-maxima-$indice_variacao='$escolha_maxima'>$nome_variacao <span class='qtdescolha'>$escolha_maxima_texto</span></p>";





                        $html_variacoes .= "<div class='variacao-itens variacao-$indice_variacao'>";



                        foreach ($variacao['item'] as $indice_item => $item) {

                            

                            $nome_item_variacao = htmljson($item['nome']);

                            $descricao_item_variacao = htmljson($item['descricao']);

                            $valor_item_variacao = htmljson($item['valor']);

                            $quantidade_item_variacao = htmljson($item['quantidade']);

                            // $estoque_item_variacao = htmljson($item['estoque']);



                            // //Se o estoque do item de variação for 0, não exibir

                            // if ($estoque_item_variacao == 0) {

                            //     continue;

                            // }



                            // Adicionar atributos de itens de variação

                            $atributos_variacoes .= " data-nome-item-variacao-$indice_variacao-$indice_item='$nome_item_variacao'";
                            $atributos_variacoes .= " data-descricao-item-variacao-$indice_variacao-$indice_item='$descricao_item_variacao'";
                            $atributos_variacoes .= " data-valor-item-variacao-$indice_variacao-$indice_item='$valor_item_variacao'";
                            $atributos_variacoes .= " data-quantidade-item-variacao-$indice_variacao-$indice_item='$quantidade_item_variacao'";
                            $atributos_variacoes .= " data-estoque-item-variacao-$indice_variacao-$indice_item='$estoque_item_variacao'";



                            //HTML de itens de variação

                            $html_variacoes .= "<div class='variacao-item' data-nome-item-variacao-$indice_variacao-$indice_item='$nome_item_variacao'";
                            $html_variacoes .= " data-valor-item-variacao-$indice_variacao-$indice_item='$valor_item_variacao'"; // Adicionado aqui
                            $html_variacoes .= " data-quantidade-item-variacao-$indice_variacao-$indice_item='$quantidade_item_variacao'";
                            $html_variacoes .= " data-estoque-item-variacao-$indice_variacao-$indice_item='$estoque_item_variacao'>";



                            $html_variacoes .= "<div class='check desmarcado' data-variacao-indice='$indice_variacao' data-item-variacao-indice='$indice_item' style='height: 80px;'>

                            <i class='lni'></i>

                            <input type='checkbox' name='variacao-$indice_variacao-$indice_item' value='0' style='display: none;'>

                            </div>";

                            $html_variacoes .= "<div class='detalhes' style='width: 47%;'>";

                            $html_variacoes .= "<span class='titulo'>$nome_item_variacao - R$ $valor_item_variacao</span>";

                            $html_variacoes .= "<span class='descricao'>$descricao_item_variacao</span>";

                            $html_variacoes .= "<div class='clear'></div>";

                            $html_variacoes .= "</div>";



                            $html_variacoes .= "</div>";

                        }



                        $html_variacoes .= "</div>";

                    }



                    $variacoes_modal = "<div class='variacoes-modal' style='display: none;'>

                                            <div class='variacoes-content-modal'>

                                                <a href='#' class='fechar-modal-variacoes'><i class='lni lni-close'></i></a>

                                                <p class='preco-produto-na-variacao' data-valor-produto-c-variacao='$preco' data-nome-produto-c-variacao='$produto_variacao_nomer'>$preco_texto_na_variacao</p>

                                                $html_variacoes

                                                <button class='adicionar-ao-carrinho'>Adicionar ao Carrinho</button>

                                            </div>

                                        </div>";

                }



                //Limitar nome do produto

                $nome_limitado = mb_strimwidth($nome, 0, 22, "...");



                //Transformar valor do produto em R$ 0,00 e verificar se é vazio

                if (!empty($variacoes)) {

                    $produto_linha = "<div class='produto-linha escolha-variacao'>

                                            <div class='produto-preço-div w-100' data-produto-id='$id' data-estoque='$estoque'>

                                                <a title='$nome' href='#' class='produto-preco ver-variacao' >Escolha a Variação</a>

                                            </div>

                                        </div>";

                } else {

                    $produto_linha = "<div class='produto-linha'>

                                        <div class='produto-preço-div'>

                                            $preco_texto_produto

                                        </div>

                                        <div class='mais' data-produto-id='$id' data-estoque='$estoque'>

                                            <i title='$nome' class='lni lni-circle-plus'></i>

                                        </div>

                                    </div>";

                }



                echo "

                <div class='produto' data-produto-id='$id' data-nome-completo='$nome' data-estoque='$estoque' data-ref='$ref'

                data-categoria='$categoria_nome' $atributos_variacoes>



                    <div class='produto-img'>

                        <img title='$nome' src='../../_core/_uploads/$foto' alt='Produto'>

                    </div>

                    <div class='produto-info'>

                        <h3 class='produto-nome' title='$nome'>$nome_limitado</h3>

                    </div>

                    $produto_linha

                    $variacoes_modal

                </div>

                ";

            }



            ?>

        </div>



        <div class="carrinho-compras">

            <h2 class="titulo-carrinho">Itens do Carrinho <i class="lni lni-cart"></i></h2>



            <div class="itens-carrinho">

                <!-- Itens do carrinho -->

                <p class="sem-itens">Nenhum item no carrinho.</p>

            </div>

        </div>



    </div>



    <div class="linha-2-pdv">



        <div class="dados-cliente">



            <h2 class="titulo-dados-cliente"><i class="lni lni-user"></i> Dados do Cliente</h2>



            <div class="dados-client-content">

                <div class="input-dados-cliente w-50">

                    <label for="nome-cliente">Nome do Cliente</label>

                    <input type="text" id="nome-cliente" placeholder="Nome do Cliente">

                </div>



                <div class="input-dados-cliente w-50">

                    <label for="whatsapp-cliente">WhatsApp</label>

                    <input type="text" id="whatsapp-cliente" placeholder="WhatsApp" maxlength="15">

                </div>



                <div class="input-dados-cliente w-100">

                    <div class="form-field-default">

                        <label for="entrega-frete"><i class="lni lni-truck"></i> Entrega / Frete</label>

                        <div class="fake-select">

                            <i class="lni lni-chevron-down"></i>

                            <select name="entrega-frete" id="entrega-frete">

                                <?php



                                if ($retirada_local == 1) {

                                    echo "<option value='0' data-preco-frete='0,00'>Retirar no Local</option>";

                                }



                                //Buscar frete cadastrado com base no id do estabelecimento

                                $result_frete_pdv = mysqli_query($db_conn, "SELECT * FROM frete WHERE rel_estabelecimentos_id = '$id_estabelecimento' ORDER BY NOME ASC");





                                if (!$result_frete_pdv) {

                                    die('Erro na consulta SQL: ' . mysqli_error($db_conn));

                                    echo 'Erro na consulta SQL: ' . mysqli_error($db_conn);

                                }



                                while ($fretedata = mysqli_fetch_array($result_frete_pdv)) {

                                    $id_frete = $fretedata['id'];

                                    $nome_frete = $fretedata['nome'];

                                    $valor_frete = $fretedata['valor'];



                                    //Transformar valor do frete em R$ 0,00

                                    $valor_frete = number_format($valor_frete, 2, ',', '.');



                                    echo "<option value='$id_frete' data-preco-frete='$valor_frete'>$nome_frete - R$ $valor_frete</option>";

                                }

                                ?>

                            </select>

                            <div class="clear"></div>

                        </div>

                    </div>

                </div>



                <div class="input-dados-cliente w-100 dados-endereco" style="display: none;">

                    <p class="endereco-cliente">Endereço</p>



                    <div class="endereco-cliente-inputs">

                        <div>

                            <label for="cep-cliente">CEP</label>

                            <input type="text" id="cep-cliente" placeholder="CEP">

                        </div>



                        <div>

                            <label for="rua-cliente">Rua</label>

                            <input type="text" id="rua-cliente" placeholder="Rua">

                        </div>



                        <div>

                            <label for="numero-cliente">Número</label>

                            <input type="text" id="numero-cliente" placeholder="Número">

                        </div>



                        <div>

                            <label for="bairro-cliente">Bairro</label>

                            <input type="text" id="bairro-cliente" placeholder="Bairro">

                        </div>



                        <div class="form-field-default">

                            <label for="estado-cliente">Estado</label>

                            <div class="fake-select">

                                <i class="lni lni-chevron-down"></i>



                                <select name="estado-cliente" id="estado-cliente">



                                    <option value="">Estado</option>

                                    <?php

                                    $sql = mysqli_query($db_conn, "SELECT * FROM estados ORDER BY nome ASC");

                                    while ($quickdata = mysqli_fetch_array($sql)) {

                                    ?>

                                        <option value="<?php echo $quickdata['id']; ?>" data-uf="<?php echo $quickdata['uf']; ?>"><?php echo $quickdata['nome']; ?></option>

                                    <?php } ?>

                                </select>



                                <div class="clear"></div>

                            </div>

                        </div>



                        <div class="form-field-default">

                            <label for="cidade-cliente">Cidade</label>

                            <div class="fake-select">

                                <i class="lni lni-chevron-down"></i>

                                <select name="cidade-cliente" id="cidade-cliente">

                                    <option value="">Cidade</option>

                                </select>

                                <div class="clear"></div>

                            </div>

                        </div>



                        <div>

                            <label for="complemento-cliente">Complemento</label>

                            <input type="text" id="complemento-cliente" placeholder="Complemento">

                        </div>



                        <div>

                            <label for="referencia-cliente">Ponto de Referência</label>

                            <input type="text" id="referencia-cliente" placeholder="Referência">

                        </div>



                        <div class="form-field-default horarios-div">

                            <label for="horario-entrega-cliente"><i class="lni lni-alarm-clock"></i> Horário de Entrega</label>

                            <div class="fake-select">

                                <i class="lni lni-chevron-down"></i>

                                <select name="horario-entrega-cliente" id="horario-entrega-cliente">

                                    <option value="" selected disabled>Escolha o horário</option>

                                    <option value="manha">Manhã</option>

                                    <option value="tarde">Tarde</option>

                                    <option value="noite">Noite</option>

                                </select>

                                <div class="clear"></div>

                            </div>

                        </div>



                    </div>

                </div>

            </div>



        </div>



        <div class="pagamento-div">



            <div class="input-dados-cliente w-100 forma-pagamento">



                <div class="forma-pagamento-inputs">



                    <div class="form-field-default">

                        <label for="forma_pagamento"><i class="lni lni-credit-cards"></i> Forma de Pagamento</label>

                        <div class="fake-select">

                            <i class="lni lni-chevron-down"></i>



                            <select id="input-forma-pagamento" name="forma_pagamento">

                                <option value="0" selected>Selecione a forma de pagamento</option>

                                <?php if ($pagamento_pix == 1) { ?>

                                    <option value="6" data-forma-pagamento='pix'>Pix</option>

                                <?php } ?>

                                <?php if ($pagamento_dinheiro == 1) { ?>

                                    <option value="1" data-forma-pagamento='dinheiro'>Dinheiro</option>

                                <?php } ?>

                                <?php if ($pagamento_cartao_debito == 1) { ?>

                                    <option value="2" data-forma-pagamento='cartao_debito'>Pague Com Cartão</option>

                                <?php } ?>

                                <?php if ($pagamento_cartao_credito == 1) { ?>

                                    <option value="3" data-forma-pagamento='cartao_credito'>Cartão de Crédito</option>

                                <?php } ?>

                                <?php if ($pagamento_cartao_alimentacao == 1) { ?>

                                    <option value="4" data-forma-pagamento='cartao_alimentacao'>Cartão Alimentação</option>

                                <?php } ?>

                                <?php if ($pagamento_outros == 1) { ?>

                                    <option value="5" data-forma-pagamento='outros'><?php echo $pagamento_outros_nome_texto; ?></option>

                                <?php } ?>

                            </select>



                            <div class="clear"></div>

                        </div>



                    </div>



                </div>



            </div>



            <div class="pagamento-content">



            </div>

        </div>



        <div class="total-pdv">

            <p class="total-itens-total">0 Itens</p>

            <p class="subtotal-total">Subtotal: R$ 0,00</p>

            <p class="entrega-total"></p>

            <div class="desconto-total">
                <span class="desconto-text">Desconto: </span>
                <div class="inputs-desconto">
                    <label for="desconto-porcentagem">%</label>
                    <input type="number" id="desconto-porcentagem" placeholder="0" max="100" maxlength="3" readonly>
                </div>
                <div class="inputs-desconto">
                    <label for="desconto-valor">R$</label>
                    <input type="text" id="desconto-valor" placeholder="0,00" readonly>
                </div>
            </div>
            <p class="total-total">Total: R$ 0,00</p>
            <button class="finalizar-pedido">FECHAR COMPRA <i class="lni lni-arrow-right-circle"></i></button>
        </div>


    <!-- JavaScript -->

    <script>
        jQuery(document).ready(function($) {



            //Confirmar se o usuário deseja sair e avisar que o carrinho será esvaziado

            window.onbeforeunload = function() {

                return 'Deseja sair?';

            };



            //Exibir somente 6 produtos na tela

            $('.sugestao-produtos .produto').slice(0, 8).show();



            //Modal de variações

            $('.ver-variacao').click(function(e) {

                e.preventDefault();



                //Fade in no modal mais próximo

                $(this).parent().parent().parent().find('.variacoes-modal').fadeIn();

            });



            function verificarQuantidadeMaxima(variacao, indice) {

                var max = parseInt(variacao.data('escolha-maxima-' + indice), 10);



                var itensVariacao = $('.variacao-itens.variacao-' + indice);

                var inputsteste = itensVariacao.find('.variacao-item .check input');

                var marcados = itensVariacao.find('.variacao-item .marcado').length;



                console.log('Máximo: ' + max + ' - Marcados: ' + marcados);



                return marcados <= max;

            }



            function verificarQuantidadeMaximaMinima(variacao, indice) {

                var min = parseInt(variacao.data('escolha-minima-' + indice), 10);

                var max = parseInt(variacao.data('escolha-maxima-' + indice), 10);



                var itensVariacao = $('.variacao-itens.variacao-' + indice);

                var inputsteste = itensVariacao.find('.variacao-item .check input');

                var marcados = itensVariacao.find('.variacao-item .marcado').length;



                console.log('Máximo: ' + max + ' - Mínimo: ' + min + ' - Marcados: ' + marcados);



                return marcados >= min && marcados <= max;

            }





            $('.variacao-item').click(function() {

                var checkElement = $(this).find('.check');

                var IndiceVariacao = checkElement.data('variacao-indice');

                var input = checkElement.find('input');

                var isChecked = input.prop('checked');

                var variacao = $('.variacoes-content-modal p[data-variacao-' + IndiceVariacao + '="sim"]');



                if (isChecked) {

                    checkElement.find('i').removeClass('lni-checkmark');

                    checkElement.removeClass('marcado').addClass('desmarcado');

                    input.prop('checked', false);

                    input.val(0);

                } else {

                    checkElement.find('i').addClass('lni-checkmark');

                    checkElement.addClass('marcado').removeClass('desmarcado');

                    input.prop('checked', true);

                    input.val(1);

                }



                // Verificar quantidade máxima e mínima

                if (!verificarQuantidadeMaxima(variacao, IndiceVariacao)) {

                    alert("Quantidade escolhida máxima de opções da variação atingida.");

                    checkElement.find('i').removeClass('lni-checkmark');

                    checkElement.removeClass('marcado').addClass('desmarcado');

                    input.prop('checked', false);

                    input.val(0);

                    return;

                }



            });



            //Fechar modal de variações
            $('.fechar-modal-variacoes').click(function(e) {
                e.preventDefault();

                //Desmarcar variações
                var variacao = $(this).parent().find('.variacao-item .check.marcado');

                variacao.each(function() {
                    $(this).find('i').removeClass('lni-checkmark');
                    $(this).removeClass('marcado').addClass('desmarcado');
                    $(this).find('input').prop('checked', false);
                    $(this).find('input').val(0);
                });

                $(this).parent().find('.qtdescolha').css('color', 'black');

                //Fade out no modal mais próximo
                $(this).parent().parent().fadeOut();
            });



            //Adicionar ao carrinho a partir do modal de variações

            /*$('.adicionar-ao-carrinho').click(function(e) {
                e.preventDefault();
                var btnAddCarrinho = $(this);

                // Obter elementos principais
                var $modal = $(this).closest('.variacoes-modal');
                //var produto_id = $modal.data('produto-id');
                var produto_id = $modal.find('[produto-id]').attr('produto-id');
                //var produto_nome = $modal.find('.produto-nome').attr('title');
                var produto_nome = $modal.find('[data-nome-produto-c-variacao]').attr('data-nome-produto-c-variacao');
                var produto_estoque = $modal.data('estoque');
                var produto_preco = parseFloat($modal.find('.preco-produto-na-variacao').data('valor-produto-c-variacao'));
                var produto_ref = $modal.data('produto-ref') || ''; // Adicionado fallback para produto_ref

                // Variáveis para armazenar as variações
                var variacoes_selecionadas = true;
                var texto_erro = "";
                var variacao_nome = "";
                var variacao_valor = 0;
                var variacao_estoque = 0;
                var variacoes_info = [];

                // Verificar todas as variações
                $modal.find('.variacao-itens').each(function() {
                    var $variacao = $(this);
                    var indice_variacao = $variacao.data('variacao-indice') || $variacao.attr('class').match(/variacao-(\d+)/)[1];
                    var $itens_marcados = $variacao.find('.check.marcado');

                    // Verificar se pelo menos um item foi selecionado
                    if ($itens_marcados.length === 0) {
                        variacoes_selecionadas = false;
                        texto_erro = "Selecione todas as variações do produto.";
                        return false; // Sai do each
                    }

                    // Processar cada item selecionado
                    $itens_marcados.each(function() {
                        var $item = $(this).closest('.variacao-item');
                        var indice_item = $(this).data('item-variacao-indice');
                        
                        // Obter nome e valor da variação
                        var nome_item = $item.data('nome-item-variacao-' + indice_variacao + '-' + indice_item) || 
                                    $item.find('.titulo').text().split(' - R$ ')[0];
                        
                        var valor_item = parseFloat($item.data('valor-item-variacao-' + indice_variacao + '-' + indice_item)) || 
                                    parseFloat($item.find('.titulo').text().split(' - R$ ')[1].replace(',', '.')) || 0;
                        
                        var estoque_item = parseInt($item.data('estoque-item-variacao-' + indice_variacao + '-' + indice_item)) || 0;

                        // Acumular valores
                        variacao_valor += valor_item;
                        variacao_estoque = Math.min(variacao_estoque, estoque_item) || estoque_item; // Pega o menor estoque
                        
                        // Formatando o nome para exibição
                        if (variacao_nome !== "") {
                            variacao_nome += " / ";
                        }
                        variacao_nome += nome_item;
                        
                        // Armazenar informações detalhadas
                        variacoes_info.push({
                            nome: nome_item,
                            valor: valor_item,
                            estoque: estoque_item,
                            variacao: indice_variacao,
                            item: indice_item
                        });
                    });
                });

                // Validar seleção de variações
                if (!variacoes_selecionadas) {
                    alert(texto_erro);
                    return;
                }

                // Calcular valor total
                var valor_total = produto_preco + variacao_valor;
                var valor_total_formatado = valor_total.toFixed(2).replace('.', ',');

                // Criar HTML do item do carrinho
                var item_carrinho = `
                    <div class='item-carrinho item-c-variacao' data-produto-id='${produto_id}' data-estoque='${produto_estoque}' data-ref='${produto_ref}'>
                        <div class='item-carrinho-linha'>
                            <div class='botoes-input'>
                                <button class='botao-quantidade botao-quantidade-menos'><i class="lni lni-trash"></i></button>
                                <input type='number' class='quantidade' value='1' min='1'>
                                <button class='botao-quantidade botao-quantidade-mais'>+</button>
                            </div>
                            <p class='item-carrinho-nome'>${produto_nome}<br>
                                <span class="variacoes-carrinho" data-estoque-variacao-item="${variacao_estoque}">
                                    <strong>Variações:</strong><br>${variacao_nome}
                                </span>
                            </p>
                            <p class='item-carrinho-preco'>R$ ${valor_total_formatado}</p>
                        </div>
                    </div>
                `;

                // Verificar se o produto já está no carrinho
                var $produto_no_carrinho = $('.itens-carrinho .item-carrinho[data-produto-id="' + produto_id + '"]');
                
                if ($produto_no_carrinho.length > 0) {
                    // Aumentar quantidade
                    var $quantidade = $produto_no_carrinho.find('.quantidade');
                    $quantidade.val(parseInt($quantidade.val()) + 1);
                } else {
                    // Adicionar novo item
                    $('.itens-carrinho').append(item_carrinho);
                    $('.sem-itens').hide();
                }

                // Fechar modal e atualizar totais
                $modal.hide();
                totalizarCarrinho();
                
                // Feedback visual
                btnAddCarrinho.prop('disabled', true).html('Adicionado!');
                setTimeout(function() {
                    btnAddCarrinho.prop('disabled', false).html('Adicionar ao Carrinho');
                }, 2000);
            });
            */

            $('.adicionar-ao-carrinho').click(function(e) {
    e.preventDefault();
    var btnAddCarrinho = $(this);

    // Obter elementos principais
    var $modal = $(this).closest('.variacoes-modal');
    var produto_id = $modal.find('[produto-id]').attr('produto-id');
    var produto_nome = $modal.find('[data-nome-produto-c-variacao]').attr('data-nome-produto-c-variacao');
    var produto_estoque = $modal.data('estoque');
    var produto_preco = parseFloat($modal.find('.preco-produto-na-variacao').data('valor-produto-c-variacao'));
    var produto_ref = $modal.data('produto-ref') || '';

    // Variáveis para armazenar as variações
    var variacoes_selecionadas = true;
    var texto_erro = "";
    var variacao_nome = "";
    var variacao_valor = 0;
    var variacao_estoque = 0;
    var variacoes_info = [];
    var hash_variacoes = "";

    // Verificar todas as variações
    $modal.find('.variacao-itens').each(function() {
        var $variacao = $(this);
        var indice_variacao = $variacao.data('variacao-indice') || $variacao.attr('class').match(/variacao-(\d+)/)[1];
        var $itens_marcados = $variacao.find('.check.marcado');

        // Verificar se pelo menos um item foi selecionado
        if ($itens_marcados.length === 0) {
            variacoes_selecionadas = false;
            texto_erro = "Selecione todas as variações do produto.";
            return false;
        }

        // Processar cada item selecionado
        $itens_marcados.each(function() {
            var $item = $(this).closest('.variacao-item');
            var indice_item = $(this).data('item-variacao-indice');
            
            // Obter dados da variação
            var nome_item = $item.data('nome-item-variacao-' + indice_variacao + '-' + indice_item) || 
                          $item.find('.titulo').text().split(' - R$ ')[0];
            
            var valor_item = parseFloat($item.data('valor-item-variacao-' + indice_variacao + '-' + indice_item)) || 
                          parseFloat($item.find('.titulo').text().split(' - R$ ')[1].replace(',', '.')) || 0;
            
            var estoque_item = parseInt($item.data('estoque-item-variacao-' + indice_variacao + '-' + indice_item)) || 0;

            // Acumular valores
            variacao_valor += valor_item;
            variacao_estoque = Math.min(variacao_estoque, estoque_item) || estoque_item;
            
            // Formatando o nome para exibição
            if (variacao_nome !== "") {
                variacao_nome += " / ";
            }
            variacao_nome += nome_item;
            
            // Armazenar informações para o hash
            variacoes_info.push({
                v: indice_variacao,
                i: indice_item,
                n: nome_item,
                val: valor_item
            });
        });
    });

    // Validar seleção de variações
    if (!variacoes_selecionadas) {
        alert(texto_erro);
        return;
    }

    // Calcular valor total
    var valor_total = produto_preco + variacao_valor;
    var valor_total_formatado = valor_total.toFixed(2).replace('.', ',');

    // Gerar hash único para as variações (ordena para consistência)
    variacoes_info.sort((a, b) => a.v - b.v || a.i - b.i);
    hash_variacoes = JSON.stringify(variacoes_info);

    // Verificar se já existe no carrinho
    var item_existente = null;
    $('.item-carrinho').each(function() {
        var $item = $(this);
        if ($item.data('produto-id') == produto_id && 
            $item.data('hash-variacoes') == hash_variacoes) {
            item_existente = $item;
            return false; // sair do loop
        }
    });

    // Criar HTML do item do carrinho
    var item_carrinho = `
        <div class='item-carrinho item-c-variacao' 
             data-produto-id='${produto_id}'
             data-hash-variacoes='${hash_variacoes}'
             data-estoque='${produto_estoque}' 
             data-ref='${produto_ref}'>
            <div class='item-carrinho-linha'>
                <div class='botoes-input'>
                    <button class='botao-quantidade botao-quantidade-menos'><i class="lni lni-trash"></i></button>
                    <input type='number' class='quantidade' value='1' min='1'>
                    <button class='botao-quantidade botao-quantidade-mais'>+</button>
                </div>
                <p class='item-carrinho-nome'>${produto_nome}<br>
                    <span class="variacoes-carrinho" data-estoque-variacao-item="${variacao_estoque}">
                        <strong>Variações:</strong><br>${variacao_nome}
                    </span>
                </p>
                <p class='item-carrinho-preco'>R$ ${valor_total_formatado}</p>
            </div>
        </div>
    `;

    if (item_existente) {
        // Incrementar quantidade se for a mesma combinação
        var $quantidade = item_existente.find('.quantidade');
        $quantidade.val(parseInt($quantidade.val()) + 1);
    } else {
        // Adicionar novo item
        $('.itens-carrinho').append(item_carrinho);
        $('.sem-itens').hide();
    }

    // Fechar modal e atualizar totais
    $modal.hide();
    totalizarCarrinho();
    
    // Feedback visual
    btnAddCarrinho.prop('disabled', true).html('Adicionado!');
    setTimeout(function() {
        btnAddCarrinho.prop('disabled', false).html('Adicionar ao Carrinho');
    }, 2000);
});
            //Inserir produtos no carrinho

            $('.mais').click(function() {



                //Obter ID do produto

                var produto_id = $(this).data('produto-id');



                //Obter informações do produto

                var produto_nome = $(this).parent().parent().find('.produto-nome').attr('title');

                var produto_preco = $(this).parent().parent().find('.produto-preco').text();

                var produto_estoque = $(this).data('estoque');



                //Adicionar produto ao carrinho

                var item_carrinho = `

                                <div class='item-carrinho' data-produto-id='${produto_id}' data-estoque='${produto_estoque}'>

                                    <div class='item-carrinho-linha'>

                                    <div class='botoes-input'>

                                        <button class='botao-quantidade botao-quantidade-menos'><i class="lni lni-trash"></i></button>

                                        <input type='number' class='quantidade' value='1'>

                                        <button class='botao-quantidade botao-quantidade-mais'>+</button>

                                    </div>

                                    <p class='item-carrinho-nome'>${produto_nome}</p>

                                    <p class='item-carrinho-preco'>${produto_preco}</p>

                                    </div>

                                </div>

                            `;



                //Verificar se o produto já está no carrinho

                var produto_no_carrinho = false;



                $('.itens-carrinho .item-carrinho').each(function() {

                    var produto_id_carrinho = $(this).data('produto-id');

                    if (produto_id_carrinho == produto_id) {

                        produto_no_carrinho = true;

                    }

                });



                if (produto_no_carrinho) {

                    //Aumentar quantidade do produto no carrinho

                    var quantidade = $('.itens-carrinho .item-carrinho[data-produto-id="' + produto_id + '"] .quantidade').val();

                    quantidade++;

                    $('.itens-carrinho .item-carrinho[data-produto-id="' + produto_id + '"] .quantidade').val(quantidade).trigger('change');

                } else {

                    $('.itens-carrinho').append(item_carrinho);

                    $('.sem-itens').hide();

                    totalizarCarrinho();

                }



                //Adicionar classe .icon-adicionado ao botao mais e trocar o icone

                $(this).find('i').removeClass('lni-circle-plus').addClass('lni-checkmark-circle').addClass('icon-adicionado');

                setTimeout(function() {

                    $('.mais').find('i').removeClass('lni-checkmark-circle').addClass('lni-circle-plus').removeClass('icon-adicionado');

                }, 1200);



                $('.sem-itens').hide();

                totalizarCarrinho();

            });



            //Alterar quantidade de itens no carrinho

            $('.itens-carrinho').on('click', '.botao-quantidade-menos', function() {

                var quantidade = $(this).parent().find('.quantidade').val();

                if (quantidade == 1) {

                    $(this).parent().parent().parent().remove().trigger('change');

                } else {

                    quantidade--;

                    $(this).parent().find('.quantidade').val(quantidade).trigger('change');

                }



                totalizarCarrinho();

            });



            $('.itens-carrinho').on('click', '.botao-quantidade-mais', function() {

                var quantidade = $(this).parent().find('.quantidade').val();

                quantidade++;

                $(this).parent().find('.quantidade').val(quantidade).trigger('change');



                totalizarCarrinho();

            });



            $('.itens-carrinho').on('change', '.quantidade', function() {

                var quantidade = $(this).val();

                if (quantidade == 1) {

                    $('.botao-quantidade-menos').html('<i class="lni lni-trash"></i>');

                } else if (quantidade <= 0) {

                    $(this).parent().parent().parent().remove().trigger('change');

                    $('.itens-carrinho').text('Nenhum item no carrinho.');

                } else {

                    $('.botao-quantidade-menos').html('-');

                }



                // //Verificar se o produto está em estoque

                var estoque = '';

                // if ($(this).hasClass('item-c-variacao')) {

                //     estoque = $(this).find('.variacoes-carrinho').data('estoque-variacao-item');

              

                    estoque = $(this).parent().parent().parent().data('estoque');

                



                // if (quantidade > estoque) {

                //     alert('Quantidade indisponível em estoque. Estoque atual: ' + estoque + ' unidades.');

                //     $(this).val(estoque);

                // }



                //Atualizar subtotal e total

                totalizarCarrinho();

            });



            //Pesquisar produtos por nome e ref, exibir somente os que contém os termos pesquisados

            $('#pesquisar-produto').keyup(function() {

                var termo_pesquisa = $(this).val().toLowerCase();

                var icon_pesquisa_produto = $(this).parent().find('i');

                var produtosVisiveis = 0;



                if (termo_pesquisa == '') {

                    $('.sugestao-produtos .produto').hide();

                    $('.sugestao-produtos .produto').slice(0, 8).show();

                    icon_pesquisa_produto.removeClass('lni-close').addClass('lni-search-alt');

                } else {

                    $('.sugestao-produtos .produto').each(function() {

                        var nome_produto = $(this).data('nome-completo').toLowerCase();



                        var ref_produto = $(this).data('ref');

                        if (ref_produto == undefined) {

                            ref_produto = '';

                        } // Se for número

                        else if (!isNaN(ref_produto)) {

                            ref_produto = ref_produto.toString();

                        } // Se for string

                        else {

                            ref_produto = ref_produto.toLowerCase();

                        }





                        if (nome_produto.indexOf(termo_pesquisa) > -1 || ref_produto.indexOf(termo_pesquisa) > -1) {

                            $(this).show();

                            produtosVisiveis++;

                        } else {

                            $(this).hide();

                        }

                    });

                    icon_pesquisa_produto.removeClass('lni-search-alt').addClass('lni-close');

                }



                if (produtosVisiveis === 0 && termo_pesquisa != '') {

                    $('.sem-produtos').show().text('Nenhum produto corresponde à sua pesquisa.');

                } //Se o resultado for menos que 4 produtos e o usuário estiver no celular

                else if (produtosVisiveis <= 4 && $(window).width() <= 768) {

                    $('.sugestao-produtos').css('height', '100%');



                } else {

                    $('.sem-produtos').hide();

                }

            });



            //Pesquisar produtos por categoria, exibir somente os que contém os termos pesquisados

            $('#categoria-produto').keyup(function() {

                var termo_pesquisa = $(this).val().toLowerCase();

                var icon_pesquisa_produto = $(this).parent().find('i');

                var produtosVisiveis = 0;



                if (termo_pesquisa == '') {

                    $('.sugestao-produtos .produto').hide();

                    $('.sugestao-produtos .produto').slice(0, 8).show();

                    icon_pesquisa_produto.removeClass('lni-close').addClass('lni-search-alt');

                } else {

                    $('.sugestao-produtos .produto').each(function() {

                        var categoria_produto = $(this).data('categoria').toLowerCase();

                        // var subcategoria_produto = $(this).data('subcategoria').toLowerCase();

                        if (categoria_produto.indexOf(termo_pesquisa) > -1) { // || subcategoria_produto.indexOf(termo_pesquisa) > -1

                            $(this).show();

                            produtosVisiveis++;

                        } else {

                            $(this).hide();

                        }

                    });

                    icon_pesquisa_produto.removeClass('lni-search-alt').addClass('lni-close');

                }



                if (produtosVisiveis === 0 && termo_pesquisa != '') {

                    $('.sem-produtos').show().text('Nenhum produto corresponde à sua pesquisa.');

                } else {

                    $('.sem-produtos').hide();

                }

            });



            $(document).on('click', '.lni-close', function() {

                $('#pesquisar-produto, #categoria-produto').val('');

                $('#pesquisar-produto, #categoria-produto').trigger('keyup');



                //Exibir somente 6 produtos na tela

                $('.sugestao-produtos .produto').hide();

                $('.sugestao-produtos .produto').slice(0, 8).show();

            });



            //Exibir endereço do cliente caso a entrega seja selecionada e não contiver "retira" ou "local" no nome

            $('#entrega-frete').change(function() {

                var entrega = $(this).children("option:selected").text().toLowerCase();

                if (entrega.indexOf('retira') > -1 || entrega.indexOf('local') > -1) {

                    $('.dados-endereco').slideUp();

                } else {

                    $('.dados-endereco').slideDown();

                }



                //Se a entrega tiver preço, adicionar ao total

                var preco_entrega = $(this).children("option:selected").data('preco-frete');



                //Se preço for vazio, indefinido ou nullo, então ele é 0,00

                if (preco_entrega == '' || preco_entrega == undefined || preco_entrega == null) {

                    preco_entrega = 0.00;

                }



                $('.entrega-total').text('Entrega: R$ ' + preco_entrega);



                console.log('Preço Entrega: ', preco_entrega);



                totalizarCarrinho();

            });



            //Completar cidades de acordo com o estado selecionado

            $("#estado-cliente").change(function() {

                var estado = $(this).children("option:selected").val();

                $("#cidade-cliente").html("<option>-- Carregando cidades --</option>");

                $("#cidade-cliente").load("/_core/_ajax/cidades.php?myacc=<?php echo urlencode($myacc);?>&estado=" + estado);

            });



            //Mascará CEP e Telefone em jQuery puro sem plugins

            $('#cep-cliente').on('input', function() {

                var cep = $(this).val().replace(/\D/g, '');

                $(this).val(cep.substring(0, 5) + (cep.length > 5 ? '-' + cep.substring(5, 8) : ''));

            });



            $('#whatsapp-cliente').on('input', function() {

                var tel = $(this).val().replace(/\D/g, '');

                tel = tel.replace(/^(\d{2})(\d)/g, "($1) $2");

                tel = tel.replace(/(\d)(\d{4})$/, "$1-$2");

                $(this).val(tel);

            });



            //Api via CEP

            $('#cep-cliente').blur(function() {

                var cep = $(this).val().replace(/\D/g, '');

                if (cep != "") {

                    var validacep = /^[0-9]{8}$/;

                    if (validacep.test(cep)) {

                        $('#rua-cliente').val('...');

                        $('#bairro-cliente').val('...');

                        $('#cidade-cliente').val('...');

                        $('#estado-cliente').val('...');

                        $.getJSON("https://viacep.com.br/ws/" + cep + "/json/?callback=?", function(dados) {

                            if (!("erro" in dados)) {

                                console.log(dados);

                                $('#rua-cliente').val(dados.logradouro);

                                $('#bairro-cliente').val(dados.bairro);



                                //Selecionar estado pelo atributo UF

                                var estado = dados.uf;



                                //Encontrar estado pelo atributo UF

                                $("#estado-cliente option").each(function() {

                                    if ($(this).data('uf') == estado) {

                                        $(this).attr('selected', 'selected');

                                    }

                                });





                                //Carregar cidades

                                var estadoSelecionado = $("#estado-cliente").children("option:selected").val();

                                $("#cidade-cliente").html("<option>-- Carregando cidades --</option>");

                                $("#cidade-cliente").load("/_core/_ajax/cidades.php?myacc=<?php echo urlencode($myacc);?>&estado=" + estadoSelecionado, function() {

                                    //Aguardar carregar cidades e selecionar a cidade do CEP

                                    $("#cidade-cliente option").each(function() {

                                        if ($(this).text() == dados.localidade) {

                                            $(this).attr('selected', 'selected');

                                        }

                                    });

                                });

                            } else {

                                alert("CEP não encontrado.");

                            }

                        });

                    } else {

                        alert("Formato de CEP inválido.");

                    }

                }

            });



            //Totalizar itens do carrinho

            // Totalizar itens do carrinho com tratamento robusto
function totalizarCarrinho() {
    try {
        // Inicializa totais
        let total_itens = 0;
        let subtotal = 0;
        let desconto = 0;
        let valor_entrega = 0;
        
        // 1. Calcular itens do carrinho
        $('.itens-carrinho .item-carrinho').each(function() {
            const $item = $(this);
            const quantidade = parseInt($item.find('.quantidade').val()) || 0;
            const precoText = $item.find('.item-carrinho-preco').text().trim();
            
            // Extrair o valor numérico do texto do preço (ex: "R$ 10,50" -> 10.50)
            let preco = 0;
            if (precoText) {
                const precoLimpo = precoText.replace('R$', '').trim();
                preco = parseFloat(precoLimpo.replace(/\./g, '').replace(',', '.'));
            }
            
            const subtotal_item = quantidade * preco;
            total_itens += quantidade;
            subtotal += subtotal_item;
            
            console.log('Item: Qtd=' + quantidade + ', Preço=' + preco + ', Subtotal=' + subtotal_item);
        });

        // 2. Aplicar descontos (comentado no momento)
        const desconto_porcentagem = $('#desconto-porcentagem').val() ? $('#desconto-porcentagem').val().trim() : '';
        const desconto_valor = $('#desconto-valor').val() ? $('#desconto-valor').val().trim() : '';
        
        if (desconto_porcentagem && !desconto_valor) {
            desconto = subtotal * (parseFloat(desconto_porcentagem) / 100);
        } else if (desconto_valor && !desconto_porcentagem) {
            desconto = parseFloat(desconto_valor.replace(',', '.')) || 0;
        }

        // 3. Calcular entrega
        const entregaText = $('.entrega-total').text().trim();
        if (entregaText.includes('R$')) {
            const entregaValor = entregaText.replace('Entrega: R$', '').trim();
            valor_entrega = parseFloat(entregaValor.replace(/\./g, '').replace(',', '.')) || 0;
        }

        // 4. Calcular total final
        let total = subtotal + valor_entrega - desconto;
        
        // 5. Atualizar UI
        $('.total-itens-total').text(total_itens + (total_itens === 1 ? ' Item' : ' Itens'));
        
        $('.subtotal-total').text('Subtotal: R$ ' + subtotal.toLocaleString('pt-BR', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        }));
        
        if (desconto > 0 && total <= 0) {
            $('.total-total').text('Grátis').css('color', 'green');
        } else {
            $('.total-total').text('Total: R$ ' + total.toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
            })).css('color', 'black');
        }
        
        // Log para depuração
        console.log('Totalizando: Itens=' + total_itens + ', Subtotal=' + subtotal + 
                  ', Entrega=' + valor_entrega + ', Desconto=' + desconto + ', Total=' + total);
        
        // Verificar se tem algum item no carrinho e esconder mensagem "sem itens" se necessário
        if (total_itens > 0) {
            $('.sem-itens').hide();
        } else {
            $('.sem-itens').show();
        }
        
        return {
            total_itens,
            subtotal,
            desconto,
            valor_entrega,
            total
        };
        
    } catch (error) {
        console.error('Erro ao calcular carrinho:', error);
        // Fallback para evitar quebra da UI
        $('.total-itens-total').text('0 Itens');
        $('.subtotal-total').text('Subtotal: R$ 0,00');
        $('.total-total').text('Total: R$ 0,00').css('color', 'black');
        return {
            total_itens: 0,
            subtotal: 0,
            desconto: 0,
            valor_entrega: 0,
            total: 0
        };
    }
}


            //Totalizar itens do carrinho ao carregar a página

            totalizarCarrinho();



            //Mascara para valor do desconto

            $('#desconto-valor').on('keyup', function() {

                var valor = $(this).val().replace(/\D/g, '');

                valor = (valor / 100).toFixed(2) + '';

                valor = valor.replace(".", ",");

                valor = valor.replace(/(\d)(\d{3})(\d{2}),/g, "$1.$2,$3");

                $(this).val(valor);



            });



            // Função debounce

            function debounce(func, wait) {

                var timeout;

                return function() {

                    var context = this,

                        args = arguments;

                    clearTimeout(timeout);

                    timeout = setTimeout(function() {

                        func.apply(context, args);

                    }, wait);

                };

            }



            // Função que aplica o desconto

            function aplicarDesconto() {

                var valor_porcentagem = $('#desconto-porcentagem').val();

                var valor_desconto = $('#desconto-valor').val();

                var totalPedido = $('.total-total').text().replace('Total: R$ ', '').replace(',', '.');



                if (valor_desconto > totalPedido) {

                    alert('O valor do desconto não pode ser maior que o valor total do pedido.');

                    $(this).val('');

                    totalizarCarrinho();

                    return;

                } else if (valor_porcentagem > 100) {

                    alert('O valor do desconto não pode ser maior que 100%.');

                    $(this).val('');

                    totalizarCarrinho();

                    return;

                }



                totalizarCarrinho();

            }



            // Aplicando debounce na função aplicarDesconto

            var aplicarDescontoDebounced = debounce(aplicarDesconto, 1500);



            $('#desconto-porcentagem, #desconto-valor').on('input', aplicarDescontoDebounced);



            $('#desconto-porcentagem, #desconto-valor').on('click', function() {

                var valor = $(this).val();

                var totalPedido = $('.total-total').text().replace('Total: R$ ', '').replace(',', '.');



                if (totalPedido == 0) {

                    alert('O pedido está vazio. Adicione itens ao carrinho para aplicar o desconto.');

                    $(this).val('');

                    return;

                }



                $(this).removeAttr('readonly');

            });



            //Formas de Pagamento

            $('#input-forma-pagamento').change(function() {

                var forma_pagamento = $(this).children("option:selected").val();

                var forma_pagamento_nome = $(this).children("option:selected").text();

                var pagamentoContent = $('.pagamento-content');

                var totalPedido = $('.total-total').text().replace('Total: R$ ', '').replace(',', '.');



                if (totalPedido == 0) {

                    alert('O pedido está vazio. Adicione itens ao carrinho para selecionar a forma de pagamento.');

                    $(this).val(0);

                    return;

                }



                //WhatsApp Pay

                if (forma_pagamento == 5) {

                    pagamentoContent.html(`

                        <div class="pagamento pix">

                            <p class="pagamento-texto">Valor a ser pago na forma de pagamento <?php echo $pagamento_outros_nome_texto; ?>: R$ <span class="dinheiro-valor">${totalPedido}</span></p>

                        </div>

                    `);

                }



                //Dinheiro

                if (forma_pagamento == 1) {

                    pagamentoContent.html(`

                        <div class="pagamento dinheiro">

                            <p class="pagamento-texto">Valor a ser pago em dinheiro: R$ <span class="dinheiro-valor">${totalPedido}</span></p>

                            <div class="pagamento-inputs">

                                <div class="input-dados-cliente w-100">

                                    <label for="valor-pago-dinheiro">Valor Pago</label>

                                    <input type="text" id="valor-pago-dinheiro" placeholder="Insira o valor pago">

                                </div>

                                <div class="input-dados-cliente w-100">

                                    <p class="texto-troco">Troco: R$ 0,00</p>

                                </div>

                            </div>

                        </div>

                    `);

                }



                //Cartão de Débito

                if (forma_pagamento == 2) {

                    pagamentoContent.html(`

                        <div class="pagamento cartao-debito">

                            <p class="pagamento-texto">Valor a ser pago no cartão: R$ <span class="cartao-debito-valor">${totalPedido}</span></p>

                        

                            <div class="pagamento-inputs">

                                <div class="input-dados-cliente w-100">

                                    <label for="valor-pago-cartao-debito">Valor Pago</label>

                                    <input type="text" id="valor-pago-cartao-debito" placeholder="Insira o valor pago">

                                </div>

                            </div>

                        </div>

                    `);

                }



                //Cartão de Crédito

                if (forma_pagamento == 3) {

                    pagamentoContent.html(`

                        <div class="pagamento cartao-credito">

                            <p class="pagamento-texto">Valor a ser pago no cartão de crédito: R$ <span class="cartao-credito-valor">${totalPedido}</span></p>

                            

                            <div class="pagamento-inputs">

                                <div class="input-dados-cliente w-100">

                                    <label for="valor-pago-cartao-credito">Valor Pago</label>

                                    <input type="text" id="valor-pago-cartao-credito" placeholder="Insira o valor pago">

                                </div>

                                <div class="input-dados-cliente w-100">

                                    <label for="numero-transacao-cartao-credito">N° da Transação</label>

                                    <input type="text" id="numero-transacao-cartao-credito" placeholder="Insira o número da transação que saí junto com o comprovante da compra.">

                                </div>

                            </div>

                        </div>

                    `);

                }



                //Cartão Alimentação

                if (forma_pagamento == 4) {

                    pagamentoContent.html(`

                        <div class="pagamento cartao-alimentacao">

                            <p class="pagamento-texto">Valor a ser pago no cartão de alimentação: R$ <span class="cartao-alimentacao-valor">${totalPedido}</span></p>

                            

                            <div class="pagamento-inputs">

                                <div class="input-dados-cliente w-100">

                                    <label for="valor-pago-cartao-alimentacao">Valor Pago</label>

                                    <input type="text" id="valor-pago-cartao-alimentacao" placeholder="Insira o valor pago">

                                </div>

                                <div class="input-dados-cliente w-100">

                                    <label for="numero-transacao-cartao-alimentacao">N° da Transação</label>

                                    <input type="text" id="numero-transacao-cartao-alimentacao" placeholder="Insira o número da transação que saí junto com o comprovante da compra.">

                                </div>

                            </div>

                        </div>

                    `);

                }



                //PIX

                if (forma_pagamento == 6) {

                    pagamentoContent.html(`

                        <div class="pagamento pix">

                            <p class="pagamento-texto">Valor a ser pago no PIX: R$ <span class="cartao-alimentacao-valor">${totalPedido}</span></p>

                            <div class="pixqrcode">

							</div>

                            <p class="pagamento-texto chave-pix">Receba o Pagamento Via Pix: <span class="chave-pix-valor"><?php echo $chave_pix; ?></span></p>

                        </div>

                    `);



                    //Gerar QR Code

                    // refreshPIX();

                }



            });



            $(document).on('keyup', '#valor-pago-dinheiro', function() {

                var valor = $(this).val().replace(/\D/g, '');

                valor = (valor / 100).toFixed(2) + '';

                valor = valor.replace(".", ",");

                valor = valor.replace(/(\d)(\d{3})(\d{2}),/g, "$1.$2,$3");

                $(this).val(valor);



                var valorPago = $(this).val().replace('.', '').replace(',', '.');

                var totalPedido = $('.total-total').text().replace('Total: R$ ', '').replace(/\./g, '').replace(',', '.');

                var troco = parseFloat(valorPago) - parseFloat(totalPedido);

                var restam = parseFloat(totalPedido) - parseFloat(valorPago);



                if (troco < 0 && restam > 0) {

                    $('.texto-troco').text('Restam R$ ' + restam.toFixed(2).replace('.', ',') + ' para completar o pagamento.');

                } else {

                    $('.texto-troco').text('Troco: R$ ' + troco.toFixed(2).replace('.', ','));

                }



            });



            $(document).on('keyup', '#valor-pago-cartao-debito, #valor-pago-cartao-credito, #valor-pago-cartao-alimentacao', function() {

                var valor = $(this).val().replace(/\D/g, '');

                valor = (valor / 100).toFixed(2) + '';

                valor = valor.replace(".", ",");

                valor = valor.replace(/(\d)(\d{3})(\d{2}),/g, "$1.$2,$3");

                $(this).val(valor);

            });



            //Finalizar Pedido

            $('.finalizar-pedido').click(function() {



                //Verificar se o carrinho está vazio

                if ($('.itens-carrinho .item-carrinho').length == 0) {

                    alert('O carrinho está vazio. Adicione itens ao carrinho para finalizar o pedido.');

                    return;

                }



                var valor_pago_pagamento = '';

                var numero_transacao_pagamento = '';

                var informacao_pagamento = '';



                //Obter informações da forma de pagamento

                var forma_pagamento = $('#input-forma-pagamento').children("option:selected").data('forma-pagamento');



                //Obter informações dos inputs de pagamento

                if (forma_pagamento == 'cartao-debito' || forma_pagamento == 'cartao-credito' || forma_pagamento == 'cartao-alimentacao') {

                    valor_pago_pagamento = $('#valor-pago-' + forma_pagamento).val();

                    numero_transacao_pagamento = $('#numero-transacao-' + forma_pagamento).val();



                    informacao_pagamento = 'Valor Pago: R$ ' + valor_pago_pagamento + ' - N° da Transação: ' + numero_transacao_pagamento;

                } else if (forma_pagamento == 'dinheiro') {

                    valor_pago_pagamento = $('#valor-pago-' + forma_pagamento).val();

    

                    if(valor_pago_pagamento != ''){

                        informacao_pagamento = 'Valor Pago em Dinheiro: R$ ' + valor_pago_pagamento;

                    }

                } else if (forma_pagamento == 'pix') {

                    informacao_pagamento = $('#informacao-pagamento').val();

                }



                //Horário da Entrega

                var horario_entrega = $('#horario-entrega-cliente').val();



                if (horario_entrega == '' || horario_entrega == undefined || horario_entrega == null) {

                    horario_entrega = '';

                } else {

                    horario_entrega = ' - Horário da Entrega: ' + horario_entrega;

                }



                //Desconto

                /*var desconto = 0;

                var desconto_porcentagem = $('#desconto-porcentagem').val();

                var desconto_valor = $('#desconto-valor').val();



                if (desconto_porcentagem != '' && desconto_valor == '') {

                    desconto = desconto_porcentagem;

                } else if (desconto_valor != '' && desconto_porcentagem == '') {

                    desconto = desconto_valor.replace(',', '.');

                }*/

                

                // Inicializa o desconto

                var desconto = 0;

                

                // Obtém os valores do desconto

                var desconto_porcentagem = $('#desconto-porcentagem').val().replace(',', '.');

                var desconto_valor = $('#desconto-valor').val().replace(',', '.');

                

                // Converte os valores para número (se existirem)

                desconto_porcentagem = desconto_porcentagem ? parseFloat(desconto_porcentagem) : 0;

                desconto_valor = desconto_valor ? parseFloat(desconto_valor) : 0;

                

                if (desconto_porcentagem > 0 && desconto_valor === 0) {

                    desconto = desconto_porcentagem; // Se for percentual, aplica depois ao subtotal

                } else if (desconto_valor > 0 && desconto_porcentagem === 0) {

                    desconto = desconto_valor; // Se for valor fixo, subtrai diretamente

                }



                //Obter dados do pedido

                var pedido = {

                    'itens': [],

                    'cliente': {

                        'token': '<?php echo $token; ?>',

                        'rel_segmentos_id': '<?php echo $rel_segmentos_id; ?>',

                        'rel_estabelecimentos_id': '<?php echo $rel_estabelecimentos_id; ?>',

                        'nome': $('#nome-cliente').val(),

                        'whatsapp': $('#whatsapp-cliente').val(),

                        'estado': $('#estado-cliente').val(),

                        'cidade': $('#cidade-cliente').val(),

                        'forma_entrega': $('#entrega-frete').val(),

                        'forma_entrega_nome': $('#entrega-frete').children("option:selected").text(),

                        'endereco_cep': $('#cep-cliente').val(),

                        'endereco_numero': $('#numero-cliente').val(),

                        'endereco_bairro': $('#bairro-cliente').val(),

                        'endereco_rua': $('#rua-cliente').val(),

                        'endereco_complemento': $('#complemento-cliente').val() + horario_entrega,

                        'endereco_referencia': $('#referencia-cliente').val(),

                        'forma_pagamento': $('#input-forma-pagamento').val(),

                        'forma_pagamento_nome': $('#input-forma-pagamento').children("option:selected").text(),

                        'forma_pagamento_informacao': informacao_pagamento,

                        'data_hora': '<?php echo $datetime ?>',

                        'vpedido': $('.total-total').text().replace('Total: R$ ', '').replace(',', '.'),

                        'cupom': desconto

                    }

                };

                

                



                //Obter itens do carrinho

                $('.itens-carrinho .item-carrinho').each(function() {

                    if ($(this).hasClass('item-c-variacao')) {

                        var produto_id = $(this).data('produto-id');

                        var produto_nome = $(this).find('.item-carrinho-nome').text();

                        var produto_ref = $(this).data('ref');

                        var quantidade = $(this).find('.quantidade').val();

                        var preco = $(this).find('.item-carrinho-preco').text().replace('R$ ', '').replace(',', '.');

                        // Calcula o subtotal inicial do item

                        var subtotal_item = quantidade * preco;

                        

                        // Aplica o desconto

                        if (desconto_porcentagem > 0 && desconto_valor === 0) {

                            subtotal_item -= (subtotal_item * desconto_porcentagem / 100);

                        } else if (desconto_valor > 0 && desconto_porcentagem === 0) {

                            subtotal_item -= desconto_valor;

                        }

                    

                        // Garante que o subtotal nunca seja negativo

                        subtotal_item = Math.max(0, subtotal_item);

                        

                        var variacoes = $(this).find('.variacoes-carrinho').text();

                        // var estoque_item_variacao = $(this).find('.variacoes-carrinho').data('estoque-variacao-item');

                        var estoque = $(this).data('estoque');



                        var item = {

                            'produto_id': produto_id,

                            'produto_nome': produto_nome,

                            'ref': produto_ref,

                            'quantidade': quantidade,

                            'preco': preco,

                            'subtotal_item': subtotal_item,

                            'variacoes': variacoes,

                            // 'estoque_item_variacao': estoque_item_variacao,

                            'estoque': estoque

                        };



                    } else {

                        var produto_id = $(this).data('produto-id');

                        var produto_nome = $(this).find('.item-carrinho-nome').text();

                        var produto_ref = $(this).data('ref');

                        var quantidade = $(this).find('.quantidade').val();

                        var preco = $(this).find('.item-carrinho-preco').text().replace('R$ ', '').replace(',', '.');

                        var float 

                        // Calcula o subtotal inicial do item

                        var subtotal_item = quantidade * preco;

                        

                        // Aplica o desconto

                        if (desconto_porcentagem > 0 && desconto_valor === 0) {

                            subtotal_item -= (subtotal_item * desconto_porcentagem / 100);

                        } else if (desconto_valor > 0 && desconto_porcentagem === 0) {

                            subtotal_item -= desconto_valor;

                        }

                    

                        // Garante que o subtotal nunca seja negativo

                        subtotal_item = Math.max(0, subtotal_item);

                        

                        var estoque = $(this).data('estoque');



                        var item = {

                            'produto_id': produto_id,

                            'produto_nome': produto_nome,

                            'ref': produto_ref,

                            'quantidade': quantidade,

                            'preco': preco,

                            'subtotal_item': subtotal_item,

                            'estoque': estoque

                        };

                    }



                    pedido.itens.push(item);

                });



                //Verificar se todos os campos foram preenchidos

                var campos_preenchidos = true;

                var campos_preenchidos_texto = '';



                //Verificar se o nome foi preenchido

                if (pedido.cliente.nome == '') {

                    campos_preenchidos = false;

                    campos_preenchidos_texto += 'Preencha o nome do cliente.\n';

                }



                //Verificar se o whatsapp foi preenchido

                if (pedido.cliente.whatsapp == '') {

                    campos_preenchidos = false;

                    campos_preenchidos_texto += 'Preencha o WhatsApp do cliente.\n';

                }



                //Verificar se o endereço está visível e se sim se foi preenchido

                if ($('.dados-endereco').is(':visible')) {

                    //Verificar se o estado foi preenchido

                    if (pedido.cliente.estado == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha o estado do cliente.\n';

                    }



                    //Verificar se a cidade foi preenchida

                    if (pedido.cliente.cidade == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha a cidade do cliente.\n';

                    }



                    //Verificar se o CEP foi preenchido

                    if (pedido.cliente.endereco_cep == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha o CEP do cliente.\n';

                    }



                    //Verificar se o número foi preenchido

                    if (pedido.cliente.endereco_numero == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha o número do endereço do cliente.\n';

                    }



                    //Verificar se o bairro foi preenchido

                    if (pedido.cliente.endereco_bairro == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha o bairro do endereço do cliente.\n';

                    }



                    //Verificar se a rua foi preenchida

                    if (pedido.cliente.endereco_rua == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha a rua do endereço do cliente.\n';

                    }



                    //Verifica se o horário de entrega foi preenchido

                    if (pedido.cliente.data_hora == '') {

                        campos_preenchidos = false;

                        campos_preenchidos_texto += 'Preencha o horário de entrega.\n';

                    }

                }



                //Verificar se a forma de entrega foi selecionada

                if (pedido.cliente.forma_entrega == '') {

                    campos_preenchidos = false;

                    campos_preenchidos_texto += 'Selecione a forma de entrega.\n';

                }



                //Verificar se a forma de pagamento foi selecionada

                if (pedido.cliente.forma_pagamento == 0) {

                    campos_preenchidos = false;

                    campos_preenchidos_texto += 'Selecione a forma de pagamento.\n';

                }



                if (!campos_preenchidos) {

                    alert(campos_preenchidos_texto);

                    return;

                }

                

                console.log(pedido);



                //Registrar pedido

                $.ajax({

                    url: 'ajax_pdv.php',

                    type: 'POST',

                    dataType: 'json',

                    data: {

                        pedido: pedido

                    },

                    success: function(data) {

                        console.log(data);

                        if (data.status == 'sucesso') {

                            $('.modal-response').fadeIn();

                            $('.modal-response-texto').text('Pedido #' + data.pedido_pdv + ' registrado com sucesso!');

                            $('.modal-response-content i.lni-close').removeClass('lni-close').addClass('lni-checkmark-circle').css('color', 'green');

                            $('.btn-novo-pedido').show();

                            $('.btn-imprimir').show();

                            var btn_tentar_novamente = $('.btn-tenatar-novamente');

                            if (btn_tentar_novamente.length > 0) {

                                btn_tentar_novamente.remove();

                            }

                             $(document).click(function(event) {

                        if (!$(event.target).closest('.modal-response').length) {

                            $('.modal-response').fadeOut();

                        }

                        });

                        

                        // Fecha o modal quando clicar no ícone

                        $('.lni-close').click(function() {

                            $('.modal-response').fadeOut();

                        });

                        } else {

                            $('.modal-response').fadeIn();

                            $('.modal-response-texto').text('Erro ao registrar pedido. Tente novamente.');

                            $('.modal-response-content i.lni-checkmark-circle').removeClass('lni-checkmark-circle').addClass('lni-close').css('color', 'red');

                            $('.btn-novo-pedido, .btn-imprimir').hide();

                            var btn_tentar_novamente = '<button class="btn-response btn-tenatar-novamente"><i class="lni lni-reload"></i> Tentar Novamente</button>';

                            btn_tentar_novamente.remove();

                            $('.botoes-response').html(btn_tentar_novamente);

                             $(document).click(function(event) {

                        if (!$(event.target).closest('.modal-response').length) {

                            $('.modal-response').fadeOut();

                        }

                        });

                        

                        // Fecha o modal quando clicar no ícone

                        $('.lni-close').click(function() {

                            $('.modal-response').fadeOut();

                        });

                        }

                    },

                    error: function(jqXHR, textStatus, errorThrown) {

                        console.log(jqXHR, textStatus, errorThrown);

                        $('.modal-response').fadeIn();

                        $('.modal-response-texto').text('Ocorreu um erro ao registrar o pedido. Tente novamente mais tarde.');

                        $('.modal-response-content i.lni-checkmark-circle').removeClass('lni-checkmark-circle').addClass('lni-close').css('color', 'red');

                        $('.btn-novo-pedido, .btn-imprimir').hide();

                        var btn_tentar_novamente = '<button class="btn-response btn-tenatar-novamente"><i class="lni lni-reload"></i> Tentar Novamente</button>';

                        $('.botoes-response').html(btn_tentar_novamente);

                        $(document).click(function(event) {

                        if (!$(event.target).closest('.modal-response').length) {

                            $('.modal-response').fadeOut();

                        }

                        });

                        

                        // Fecha o modal quando clicar no ícone

                        $('.lni-close').click(function() {

                            $('.modal-response').fadeOut();

                        });

                    }



                });

            });



            //Botão Tentar Novamente

            $(document).on('click', '.btn-tenatar-novamente', function() {

                $('.finalizar-pedido').trigger('click');

            });



            //Botão Novo Pedido

            $(document).on('click', '.btn-novo-pedido', function() {

                location.reload();

            });



            //Botão Imprimir

            //$(document).on('click', '.btn-imprimir', function() {

                //var pedido_pdv = $('.modal-response-texto').text().replace('Pedido #', '').replace(' registrado com sucesso!', '');

              //  window.open('comprovante/<?php echo $simple_url;?>/painel/pedidos/imprimir/?id=' + pedido_pdv, '_blank');

          //  });

          

          

        //  $(document).on('click', '.btn-imprimir', function() { 

    // Extrair o ID do pedido

    //var pedido_pdv = $('.modal-response-texto').text().replace('Pedido #', '').replace(' registrado com sucesso!', '');

    

    // Criar a URL com o caminho correto (ajuste se necessário)

   // var url = '/painel/pedidos/imprimir/?id=' + pedido_pdv;

    

    // Abrir a nova janela com o comprovante

   // window.open(url, '_blank');

//});





$(document).on('click', '.btn-imprimir', function() { 

    // Extrair o ID do pedido

    var pedido_pdv = $('.modal-response-texto').text().replace('Pedido #', '').replace(' registrado com sucesso!', '');

    

    // Criar a URL do comprovante

    var url = '/painel/pedidos/imprimir2/?id=' + pedido_pdv;

    

    // Abrir a nova janela com o comprovante e focar de volta na janela principal

    var novaGuia = window.open(url, '_blank');

    

    // Forçar o foco de volta na guia do PDV após abrir o comprovante

    if (novaGuia) {

        novaGuia.blur(); // Tira o foco da nova guia

        window.focus(); // Foca de volta na guia atual do PDV

    }

});







            // function refreshPIX() {



            //     var eid = "<?php echo $id_estabelecimento; ?>";



            //     totalizarCarrinho();



            //     var valor_pedido = $('.total-total').text().replace('Total: R$ ', '').replace(',', '.');



            //     $.ajax({



            //         type: "GET",

            //         url: '/painel/pdv/pix_pdv.php?t=' + new Date().getTime(),

            //         data: "eid=<?php echo $id_estabelecimento; ?>&chave=<? echo $pagamento_outros_descricao; ?>&titular=<? echo $pagamento_outros_descricao_nome; ?>&valor-pedido=" + valor_pedido,

            //         success: function(data) {

            //             // data is ur summary

            //             $('.pixqrcode').html(data);

            //         }



            //     });

            // }



        });

    </script>

<script>
document.addEventListener("DOMContentLoaded", function() {
    // Garantir que o botão FECHAR COMPRA seja clicável apenas uma vez por ação
    var botaoFecharCompra = document.querySelector('.finalizar-pedido');
    if (botaoFecharCompra) {
        // Remover todos os eventos de clique existentes
        var cloneBtn = botaoFecharCompra.cloneNode(true);
        botaoFecharCompra.parentNode.replaceChild(cloneBtn, botaoFecharCompra);
        botaoFecharCompra = cloneBtn;
        
        // Garantir que o botão tenha aparência correta
        botaoFecharCompra.style.cursor = 'pointer'; 
        botaoFecharCompra.style.pointerEvents = 'auto';
        botaoFecharCompra.style.padding = '15px 0';
        
        // Adicionar apenas UM handler de clique que previne cliques múltiplos
        botaoFecharCompra.addEventListener('click', function(e) {
            // Impedir cliques duplicados desabilitando o botão
            if (this.getAttribute('data-processing') === 'true') {
                e.preventDefault();
                e.stopPropagation();
                return false;
            }
            
            // Marcar que está processando
            this.setAttribute('data-processing', 'true');
            this.style.opacity = '0.7';
            
            // Verificar se o carrinho está vazio
            if (document.querySelectorAll('.itens-carrinho .item-carrinho').length == 0) {
                alert('O carrinho está vazio. Adicione itens ao carrinho para finalizar o pedido.');
                // Reabilitar o botão em caso de erro
                this.removeAttribute('data-processing');
                this.style.opacity = '1';
                return;
            }
            
            // Chamar o código original de finalização do pedido
            var pedidoEnviado = false;
            try {
                // Usar o jQuery para chamar o código original que envia o pedido
                jQuery(this).triggerHandler('click.original');
                pedidoEnviado = true;
            } catch (err) {
                console.error("Erro ao enviar pedido:", err);
                alert("Ocorreu um erro ao enviar o pedido. Por favor, tente novamente.");
                // Reabilitar o botão em caso de erro
                this.removeAttribute('data-processing');
                this.style.opacity = '1';
            }
        });
    }
});
</script>

</body>



</html>





<script>document.addEventListener('DOMContentLoaded', function() {

    // Delegação de eventos para o botão

    document.body.addEventListener('click', function(e) {

        if (e.target.classList.contains('adicionar-ao-carrinho')) {

            e.preventDefault();

            

            // Obter o preço do produto

            const precoElement = document.querySelector('.preco-produto-na-variacao');

            const preco = precoElement.getAttribute('data-valor-produto-c-variacao');

            

            // Obter as variações selecionadas

            const variacoesSelecionadas = {};

            document.querySelectorAll('.variacoes-content-modal select').forEach(select => {

                variacoesSelecionadas[select.name] = select.value;

            });

            

            // Aqui você deve adicionar a lógica para adicionar ao carrinho

            console.log('Adicionar ao carrinho:', { preco, variacoesSelecionadas });

            // adicionarAoCarrinho(produtoId, variacoesSelecionadas, preco);

            

            // Fechar o modal

            document.querySelector('.variacoes-modal').style.display = 'none';

        }

    });

});</script>