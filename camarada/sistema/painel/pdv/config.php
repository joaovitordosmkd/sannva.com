<?php


header('Access-Control-Allow-Origin: *');

// restrict_funcionalidade('funcionalidade_disparador');


date_default_timezone_set('America/Sao_Paulo'); // Substitua pelo fuso horário do usuário

$url = 'https://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];
$parsedUrl = parse_url($url);


function decryptData($response, $encryption_key) {
    $data = base64_decode($response);
    $iv = substr($data, 0, 16);
    $encrypted_data = substr($data, 16);
    $decrypted = openssl_decrypt($encrypted_data, 'aes-256-cbc', $encryption_key, 0, $iv);
    return json_decode($decrypted, true);
}

function processMyacc($myacc, $db_con) {
    $setLogin = false;
    $setVoucher = false;
    // Chave de criptografia
    $encryption_key = "56eed736fd834e8fa2293ba20caa9b03";

    // Decodifica os dados
    $data = decryptData($myacc, $encryption_key);

    // Inicializa o array de resultado
    $result = array();

    $banco = []; // Inicialize o array

    // Verifica se os dados decodificados são um JSON válido
    if (json_last_error() == JSON_ERROR_NONE) { 
    
        // Verifica se todas as variáveis necessárias existem
            if (
                isset($data['minhaurl']) &&
                isset($data['db_host']) &&
                isset($data['db_user']) &&
                isset($data['db_pass']) &&
                isset($data['db_name'])
            ) {
                $minhaurl = $data['minhaurl'];
                $db_host = $data['db_host'];
                $db_user = $data['db_user'];
                $db_pass = $data['db_pass'];
                $db_name = $data['db_name'];

                // Armazena as variáveis na sessão
                // verifique se a variável $_SESSION['banco'] não está definida e se estiver, se os dados são iguais aos do $data, se sim, não faz nada, se não, atualiza
                
                // Verifica se a sessão 'banco' está definida e se suas subvariáveis são iguais às do $data
                

                if(isset($banco)) {
                    foreach($data as $key => $value) {
                        if(!isset($banco[$key]) || $banco[$key] != $value) {
                            $banco[$key] = $value;
                        }
                    }
                } else {
                    $banco = $data;
                }

            $result['variables'] = $banco;
            return json_encode($result);
        } else {
            // Se qualquer uma das variáveis não existir, retorna false
            return false;
        }
    
    } else {
        return false;
    }
   
    } 

   




?>