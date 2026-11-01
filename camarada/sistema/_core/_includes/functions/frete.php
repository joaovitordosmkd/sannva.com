<?php



function calcular_frete_pacote($cep_origem, $cep_destino, $altura, $largura, $comprimento, $peso) {
    try{

        $url = "https://www.melhorenvio.com.br/api/v2/me/shipment/calculate";
        $token = "eyJ0eXAiOiJKV1QiLCJhbGciOiJSUzI1NiJ9.eyJhdWQiOiIxIiwianRpIjoiZDg1ZmQzMWVkZTFkZDgxMzc4Yjc5NDJlYTY0MjUzMGIxNjMxOTk3ZWZjNjU3YjEyZmU1NTU3Nzg4ZmM0MDQ0OWIyOWYyOTFlZTVlNTBiMzUiLCJpYXQiOjE3NDQ3NDI0ODEuNTI5OTMsIm5iZiI6MTc0NDc0MjQ4MS41Mjk5MzIsImV4cCI6MTc3NjI3ODQ4MS40OTkwMDIsInN1YiI6ImEwNjA3ZDI0LTBkNTctNGVkYy05YzJmLTEyOTczMTc2NWEyOCIsInNjb3BlcyI6WyJjYXJ0LXJlYWQiLCJjYXJ0LXdyaXRlIiwiY29tcGFuaWVzLXJlYWQiLCJjb21wYW5pZXMtd3JpdGUiLCJjb3Vwb25zLXJlYWQiLCJjb3Vwb25zLXdyaXRlIiwibm90aWZpY2F0aW9ucy1yZWFkIiwib3JkZXJzLXJlYWQiLCJwcm9kdWN0cy1yZWFkIiwicHJvZHVjdHMtZGVzdHJveSIsInByb2R1Y3RzLXdyaXRlIiwicHVyY2hhc2VzLXJlYWQiLCJzaGlwcGluZy1jYWxjdWxhdGUiLCJzaGlwcGluZy1jYW5jZWwiLCJzaGlwcGluZy1jaGVja291dCIsInNoaXBwaW5nLWNvbXBhbmllcyIsInNoaXBwaW5nLWdlbmVyYXRlIiwic2hpcHBpbmctcHJldmlldyIsInNoaXBwaW5nLXByaW50Iiwic2hpcHBpbmctc2hhcmUiLCJzaGlwcGluZy10cmFja2luZyIsImVjb21tZXJjZS1zaGlwcGluZyIsInRyYW5zYWN0aW9ucy1yZWFkIiwidXNlcnMtcmVhZCIsInVzZXJzLXdyaXRlIiwid2ViaG9va3MtcmVhZCIsIndlYmhvb2tzLXdyaXRlIiwid2ViaG9va3MtZGVsZXRlIiwidGRlYWxlci13ZWJob29rIl19.MhVa_GK2H2Nh7Tjbcwrwu_0k7dE3EUVxDxqhzug9LMUgp6AEeAcvG8qO4QvMHAQvexDgmEQsVgyIu-4yiEkzQAIeCTqklCG0VpWrd09HqNqVMrZvukQLdc5NyRX8s0ZmERVyliCgU9d5a49GjXTX8DmqPcQ_bRxA5PUt92wpcj4PH6rcPLxfXQ5zwZZpu-zry8MBAygCsLLtpnOPOUGd_DBHu1y5D0WHPx9LgyiX37X7Ic2v3twr2iZmAb866zvf675BP27eURO86MnGZ8bE44G75pFAwGpGeHbm6zhwWrKs-IheAM2fzVcLW5LssCnqgLL-d_xD6Ojnpj_tLNBjQM-P4tb0UUUWrNGPlTPOd_c8i1Nc_zhzZNOrP90OylfhMHWg2T5L66IJ5-p46nFgMBz4tI_juNIt2dzte2R1Y3fOEVOt6DfYSUvSyB_Gqu_m6M2-HKmSD3AEXIQOMwdfjupvq7-ND4zZKgM_UJE1INVQmhXcnj-9PiPypcN-HJAqCBwIv07K6hG2bCXrYtYPp982EUUq-lIK1uIwqLvCzeQlRd_Q8K7AvhY0Ge7Eyifm-Lonn7uy_ysGrz1Lcsgc0tj50thowTteGLXV2clQZAHorJalR7NxtRYkbLy5ipIURhgBKCq1XfuoQTxGt2vAec64f91bg4BhQdRjI08q0Qo";
        
        // Dados a serem enviados
        $data = json_encode([
            "from" => [
                "postal_code" => $cep_origem ?? ""
            ],
            "to" => [
                "postal_code" => $cep_destino ?? ""
            ],
            "package" => [
                "height" => $altura ?? "",
                "width" => $largura ?? "",
                "length" => $comprimento ?? "",
                "weight" => $peso ?? ""
            ]
        ]);

        // Configuração do cabeçalho
        $headers = [
            "Accept: application/json",
            "Authorization: Bearer $token",
            "Content-Type: application/json",
            "User-Agent: Aplicação email@email.com"
        ];
    
        // Inicializando cURL
        $curl = curl_init();
    
        // Configurando a solicitação cURL
        curl_setopt_array($curl, [
            CURLOPT_URL => $url,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => $data,
            CURLOPT_HTTPHEADER => $headers,
        ]);
    
        // Executando a solicitação e capturando a resposta
        $response = curl_exec($curl);
    
        // Verificando erros
        if (curl_errno($curl)) {
            //'Erro na solicitação cURL: ' . curl_error($curl);
            return false; 
        } else {
            // Exibindo a resposta
            // echo "<pre>";
            // var_dump(json_decode($response, true));
            // echo "</pre>";
            return  json_decode($response, true);
        }
    }catch (Exception $e) {
        return false;
    }
}