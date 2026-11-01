

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

  // Globals

  global $numeric_data;
  global $gallery_max_files;
  $eid = $_SESSION['estabelecimento']['id'];
  $id = mysqli_real_escape_string( $db_con, $_GET['id'] );
  $edit = mysqli_query( $db_con, "SELECT * FROM pedidos WHERE id = '$id' LIMIT 1");
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
    <?php echo nl2br( bbzap( $data['comprovante'] ) ); ?>
  </div>
</div>





<?php
include('../../../../_core/_includes/config.php');
restrict_estabelecimento();

$id = mysqli_real_escape_string($db_con, $_GET['id']);
$eid = $_SESSION['estabelecimento']['id'];

$pedido = mysqli_query($db_con, "SELECT * FROM pedidos WHERE id = '$id' AND rel_estabelecimentos_id = '$eid' LIMIT 1");

if(mysqli_num_rows($pedido) > 0) {
    $data = mysqli_fetch_array($pedido);
?>
<!DOCTYPE html>
<html>
<head>
    <title>Comprovante #<?php echo $id; ?></title>
    <style>
        @media print {
            body * { visibility: hidden; }
            .comprovante, .comprovante * { visibility: visible; }
            .comprovante { 
                position: absolute; 
                left: 0; 
                top: 0; 
                width: 100%;
                padding: 20px;
            }
        }
    </style>
</head>
<body>
    <div class="comprovante">
        <?php echo nl2br(bbzap($data['comprovante'])); ?>
    </div>
    
    <script>
        // Imprime automaticamente
        window.onload = function() {
            setTimeout(function() {
                window.print();
            }, 500);
        };
    </script>
</body>
</html>
<?php
} else {
    die("Pedido não encontrado");
}
?>


<?php
include('../../../../_core/_includes/config.php');
restrict_estabelecimento();

$id = mysqli_real_escape_string($db_con, $_GET['id']);
$eid = $_SESSION['estabelecimento']['id'];

// CONSULTA FORTIFICADA
$pedido = mysqli_query($db_con, 
    "SELECT p.*, e.nome as estabelecimento 
     FROM pedidos p
     LEFT JOIN estabelecimentos e ON p.rel_estabelecimentos_id = e.id
     WHERE p.id = '$id' AND p.rel_estabelecimentos_id = '$eid' 
     LIMIT 1");

if(mysqli_num_rows($pedido) == 0) {
    die("<script>
        alert('Pedido #$id não encontrado ou não pertence a este estabelecimento!');
        window.close();
    </script>");
}

$data = mysqli_fetch_array($pedido);
?>
<!DOCTYPE html>
<html>
<head>
    <title>Comprovante #<?php echo $id; ?></title>
    <style>
        @page { size: auto; margin: 0; }
        body { 
            font-family: Arial; 
            width: 80mm;
            margin: 0 auto;
            padding: 10px;
        }
        .header { text-align: center; margin-bottom: 10px; }
        .divider { border-top: 1px dashed #000; margin: 10px 0; }
    </style>
    <script>
        window.onload = function() {
            setTimeout(function() {
                window.print();
                setTimeout(window.close, 2000);
            }, 500);
        };
    </script>
</head>
<body>
    <div class="header">
        <h3><?php echo htmlspecialchars($data['estabelecimento']); ?></h3>
        <p>Pedido #<?php echo $id; ?></p>
    </div>

    <div class="divider"></div>
    
    <strong>Endereço:</strong><br>
    <?php 
    echo htmlspecialchars(
        "Rua: {$data['endereco_rua']}, N°: {$data['endereco_numero']}, " .
        "CEP: {$data['endereco_cep']}, " .
        "Complemento: {$data['endereco_complemento']}"
    ); 
    ?>
    
    <div class="divider"></div>
    
    <strong>Pagamento:</strong><br>
    <?php echo htmlspecialchars($data['forma_pagamento']); ?>
    
    <div class="divider"></div>
    
    <strong>PRODUTOS:</strong><br>
    <?php echo nl2br(htmlspecialchars($data['comprovante'])); ?>
    
    <div class="divider"></div>
    
    <p><strong>Total: R$ <?php echo number_format($data['total'], 2, ',', '.'); ?></strong></p>
    
    <div class="footer" style="text-align: center; margin-top: 15px;">
        <?php echo date('d/m/Y H:i'); ?>
    </div>
</body>
</html>







<?php 
// FOOTER
$system_footer .= "";
include('../../_layout/footer.php');
?>

<script>

  window.print();

</script>