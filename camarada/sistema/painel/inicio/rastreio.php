<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Rastreamento de Encomendas</title>

  <!-- Font Awesome para ícones -->
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.0.0-beta3/css/all.min.css" integrity="sha512-Fo3rlrZj/kTcFVcXn+6NeWfHIHUW8XTC63oTOFk0MlN4Aq92mbuzO1LPWzmkA7dRQyJqdP1IwzFzRdL6ebQFsw==" crossorigin="anonymous" referrerpolicy="no-referrer" />

  <style>
    body, html {
      margin: 0;
      padding: 0;
      min-height: 100vh;
      background: linear-gradient(to right, #f0f8ff, #e6f7ff);
      font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
    }

    .tracking-wrapper {
      flex: 1;
      display: flex;
      justify-content: center;
      align-items: center;
    }

    .tracking-container {
      background: #fff;
      border-radius: 12px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.1);
      padding: 40px;
      max-width: 500px;
      width: 90%;
      text-align: center;
    }

    .logo-container {
      margin-bottom: 25px;
    }

    .logo-container img {
      height: 60px;
    }

    .tracking-header {
      display: flex;
      flex-direction: column;
      align-items: center;
      margin-bottom: 20px;
    }

    .tracking-header i {
      font-size: 50px;
      color: #007BFF;
      margin-bottom: 10px;
    }

    .tracking-header h2 {
      margin: 0;
      font-size: 24px;
      color: #333;
    }

    .tracking-instructions {
      font-size: 16px;
      color: #555;
      margin-bottom: 20px;
    }

    #YQNum {
      width: 100%;
      padding: 14px;
      margin-bottom: 20px;
      border: 1px solid #ccc;
      border-radius: 6px;
      font-size: 16px;
      text-align: center;
      transition: border-color 0.3s ease;
    }

    #YQNum:focus {
      border-color: #007BFF;
      outline: none;
    }

    .button {
      background-color: #007BFF;
      color: #fff;
      padding: 14px 0;
      width: 100%;
      border: none;
      border-radius: 6px;
      font-size: 18px;
      cursor: pointer;
      transition: background-color 0.3s ease;
    }

    .button:hover {
      background-color: #0056b3;
    }

    #YQContainer {
      margin-top: 30px;
    }

    footer {
      text-align: center;
      padding: 15px 10px;
      font-size: 14px;
      background-color: #f1f1f1;
      color: #666;
    }
  </style>
</head>
<body>

  <div class="tracking-wrapper">
    <div class="tracking-container">
      <!-- Local para colocar sua LOGO -->
      <div class="logo-container">
        <a href="https://digitavitrine.com.br/conheca/" target="_blank">
          <img src="https://imagens.digitavitrine.com.br/imagens/RASTREAMENTO.png" alt="Logo da empresa">
        </a>
      </div>

      <div class="tracking-header">
        <i class="fas fa-shipping-fast"></i>
        <h2>Rastreie sua Encomenda</h2>
      </div>

      <div class="tracking-instructions">
        Insira abaixo o código de rastreio recebido por email:
      </div>

      <input type="text" id="YQNum" maxlength="50" placeholder="Digite o código de rastreio">
      <input type="button" class="button" value="Rastrear" onclick="doTrack()">
    </div>
  </div>

  <div id="YQContainer"></div>

  <footer>
    © 2025 Todos os direitos reservados.
  </footer>

  <!-- Script de rastreio via 17track -->
  <script src="//www.17track.net/externalcall.js" type="text/javascript"></script> 
  <script type="text/javascript">
    function doTrack() {
      var num = document.getElementById("YQNum").value.trim();
      if (num === "") {
        alert("Por favor, preencha o código de rastreio corretamente."); 
        return;
      }
      YQV5.trackSingle({
        YQ_ContainerId: "YQContainer",
        YQ_Height: 560,
        YQ_Fc: "0",
        YQ_Lang: "pt",
        YQ_Num: num
      });
    }
  </script>
</body>
</html>
