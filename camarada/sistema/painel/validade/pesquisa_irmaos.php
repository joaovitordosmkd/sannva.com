<?php 
   
   include('../config/conexaoadm.php'); 



   $busca = $_POST['query']; // Substitua 'query' pelo nome do seu campo de entrada
   $busca = strtolower($busca); // Converte a busca para minúsculas
   $bairro = "SELECT * FROM `irmaos` WHERE LOWER(nome_sobrenome_irmao) LIKE '%$busca%'";
   $res_bairro = mysqli_query($conn, $bairro);
   if (!$res_bairro) {
      echo "Erro ao executar a consulta: " . mysqli_error($conn);
   } else {
    
   $count_bairro = mysqli_num_rows($res_bairro);
   if($count_bairro > 0){
       while($row_bairro = mysqli_fetch_assoc($res_bairro))
       {
           echo "<option style='background-color: #f00;' value='".$row_bairro['nome_sobrenome_irmao']."'>";
       }
    }
    
   }
    
   ?>
   
   