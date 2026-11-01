<?php

$db_con = mysqli_connect($db_host,$db_user,$db_pass,$db_name);
mysqli_set_charset($db_con, "utf8mb4");

// if( !$db_con ) {
//     echo "Connection failed: " . mysqli_connect_error() . "\n";
//     die();
// }else {
//     //echo "Connected successfully\n";
// }
?>