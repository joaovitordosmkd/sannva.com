<?php
function generatePassword($length) {
  $password = "";
  for($i = 0; $i < $length; $i++) {
    // Gera um número aleatório entre 0 e 1
    $num = rand(0, 1);
    if($num == 0) {
      // Gera um dígito aleatório
      $password .= rand(0, 9);
    } else {
      // Gera uma letra aleatória
      $password .= chr(rand(97, 122));
    }
  }
  return $password;
}

// Gera uma senha de 8 caracteres
$password = generatePassword(8);
echo $password;
?>