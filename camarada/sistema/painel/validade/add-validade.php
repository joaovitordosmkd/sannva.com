<?php
// CORE
include('../../_core/_includes/config.php');
// RESTRICT
restrict(2);
atualiza_estabelecimento( $_SESSION['estabelecimento']['id'], "online" );
// SEO
$seo_subtitle = "Integração";
$seo_description = "";
$seo_keywords = "";
// HEADER

global $db_con;
$eid = $_SESSION['estabelecimento']['id'];
$meudominio = $httprotocol.data_info("estabelecimentos",$_SESSION['estabelecimento']['id'],"subdominio").".".$simple_url;

?>

<?php

if (isset($_POST['novavalidade']) && $_SERVER['REQUEST_METHOD'] == 'POST') {

  $novavalidade = $_POST['novavalidade'];


  if(isset($_POST['dia_validade'])){
    $dia_validade = $_POST['dia_validade'];
  }
  if(isset($_POST['id_validade'])){
    $id_validade = $_POST['id_validade'];
  }

         
  if ($novavalidade == "true"){

   // id_validade	id_irmao	id_funcao	dia_validade

        $sql = "INSERT INTO validades SET id_irmao = '$id_irmao', id_funcao = '$id_funcao', dia_validade = '$dia_validade', obs = '$observacao'";
        $res = mysqli_query($db_con, $sql);
        if($res == true){
          // $slctvalidades = "SELECT * FROM validades";
         
        }
        else{
          echo "Erro ao cadastrar categoria: " . mysqli_error($db_con);
        }     
  }
    else if ($novavalidade == "apagar"){

          $sqlDel = "DELETE FROM validades WHERE id = '$id_validade'";
          $resDel = mysqli_query($db_con, $sqlDel);
          if($resDel == true){
            // $slctvalidades = "SELECT * FROM validades";
          
          }
          else{
            echo "Erro ao cadastrar categoria: " . mysqli_error($db_con);
          }
    }
      else if ($novavalidade == "editar"){     

            $sqlEdit = "UPDATE validades SET id_irmao = '$id_irmao', id_funcao = '$id_funcao', dia_validade = '$dia_validade', obs = '$observacao' WHERE id_validade = '$id_validade'";
            $resEdit = mysqli_query($db_con, $sqlEdit);
            if($resEdit == true){
              // $slctvalidades = "SELECT * FROM validades";
              
            }
            else{
              echo "Erro ao cadastrar categoria: " . mysqli_error($db_con);
            }
        }
  }

?>