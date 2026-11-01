<?php
// CORE
include('../../../_core/_includes/config.php');
// RESTRICT
restrict_estabelecimento();
restrict_expirado();
// SEO
$seo_subtitle = "Editar pedido";
$seo_description = "";
$seo_keywords = "";
// HEADER
$system_header .= "";
include('../../_layout/head.php');
?>

<?php

  // Formas de pagamento (adicionado)
  $formas_pagamento = array(
      '1' => 'Dinheiro',
      '2' => '(Enviar maquininha)',
      // '3' => 'Cartão de Crédito', // Comentado
      '6' => 'PIX',
      '7' => 'Mercado Pago'
  );

  // Globals

  global $numeric_data;
  global $gallery_max_files;
  $eid = $_SESSION['estabelecimento']['id'];
  $id = mysqli_real_escape_string( $db_con, $_GET['id'] );
  // Modificado para buscar forma_pagamento
  $edit = mysqli_query( $db_con, "SELECT *, forma_pagamento FROM pedidos WHERE id = '$id' LIMIT 1");
  $hasdata = mysqli_num_rows( $edit );
  $data = mysqli_fetch_array( $edit );
  //print_r($data['comprovante']);

  // Checar se formulário foi executado

  $formdata = $_POST['formdata'];

  if( $formdata ) {

    // Setar campos

    $status = mysqli_real_escape_string( $db_con, $_POST['status'] );

    // Checar Erros

    $checkerrors = 0;
    $errormessage = array();

      // -- Statis

      if( !$status ) {
        $checkerrors++;
        $errormessage[] = "O status não pode ser nulo";
      }

      // -- Estabelecimento

      if( $data['rel_estabelecimentos_id'] != $eid ) {
        $checkerrors++;
        $errormessage[] = "Ação inválida";
      }

    // Executar registro

    if( !$checkerrors ) {

      if( edit_pedido( $id,$status ) ) {

        header("Location: index.php?msg=sucesso&id=".$id);

      } else {

        header("Location: index.php?msg=erro&id=".$id);

      }

    }

  }
  
?>

<div class="comprovante comprovante-print">
  <div class="content">
    <?php
      // Busca o nome da forma de pagamento
      $forma_pagamento_id = $data['forma_pagamento'];
      $forma_pagamento_texto = "ID " . htmlspecialchars($forma_pagamento_id) . " (Não reconhecida)"; // Texto padrão
      if (isset($formas_pagamento[$forma_pagamento_id])) {
          $forma_pagamento_texto = htmlspecialchars($formas_pagamento[$forma_pagamento_id]);
      }

      // Prepara a string para inserção
      $linha_forma_pagamento = "*Forma de Pagamento:*\n" . $forma_pagamento_texto . "\n------";

      // Remove a chamada à função bbzap inexistente e substitui a seção original da forma de pagamento
      $comprovante_original = $data['comprovante'];
      // Substitui a linha "*Forma de pagamento:*" e tudo até a próxima linha "------" pela linha formatada
      $comprovante_modificado = preg_replace('/\*Forma de pagamento:\*.*?------/s', $linha_forma_pagamento, $comprovante_original, 1);
      echo nl2br( $comprovante_modificado );
    ?>
  </div>
</div>

<?php 
// FOOTER
$system_footer .= "";
include('../../_layout/footer.php');
?>

<script>

  window.print();

</script>