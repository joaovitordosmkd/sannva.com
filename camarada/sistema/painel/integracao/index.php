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
$system_header .= "";
include('../_layout/head.php');
include('../_layout/top.php');
include('../_layout/sidebars.php');
include('../_layout/modal.php');

global $db_con;
$eid = $_SESSION['estabelecimento']['id'];
$meudominio = $httprotocol.data_info("estabelecimentos",$_SESSION['estabelecimento']['id'],"subdominio").".".$simple_url;

?>

<div class="middle minfit bg-gray">

	<div class="container">

		<div class="row">

			<div class="col-md-12">

				<div class="title-icon pull-left">
					<i class="lni lni-database"></i>
					<span>Integração</span>
				</div>

				<div class="bread-box pull-right">
					<div class="bread">
						<a href="<?php panel_url(); ?>"><i class="lni lni-home"></i></a>
						<span>/</span>
						<a href="<?php panel_url(); ?>/integracao">Integração</a>
					</div>
				</div>

			</div>

		</div>

		<div class="integracao">

			<div class="data box-white mt-16">

	            <div class="row">

	              <div class="col-md-12">

	                <div class="title-line pd-0">
	                  <i class="lni lni-instagram"></i>
	                  <span>Facebook / Instagram Shopping</span>
	                  <div class="clear"></div>
	                </div>

	              </div>

	            </div>

<!-- 	            <div class="row">

	              <div class="col-md-12">

		              <div class="form-field-default">

		                  <label>Tutorial (Passo a passo):</label>
		                  <span class="form-tip">Assista o vídeo abaixo para aprender como importar os seus produtos automaticamente par ao seu facebook / instagram shopping.</span>
		                  <iframe></iframe>

		              </div>

	              </div>

	            </div> -->

	          <div class="row">

	            <div class="col-md-9">

	              <div class="form-field-default">

	                  <label>URL de importação:</label>
	                  <input id="copyme" type="text" value="<?php echo $meudominio; ?>/shopping.xml" DISABLED/>

	              </div>

	            </div>

	            <div class="col-md-3">
	            	<label></label>
	              	<button class="fullwidth" data-clipboard-text="<?php echo $meudominio; ?>/shopping.xml">
	              		<span>
	              			<i class="lni lni-clipboard"></i> Copiar
	              		</span>
	              	</button>
	              </div>

	          </div>

			</div>

		</div>

	</div>

</div>


<!DOCTYPE html>
<html lang="pt-br">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Como integrar a sacolinha do Instagram com um arquivo XML</title>
    <style>
        /* Estilo isolado para o container */
        .instagram-integration-container {
            font-family: Arial, sans-serif;
            background-color: #f2f2f2; /* Fundo branco mais escuro */
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 20px;
        }
        .instagram-integration-content {
            background-color: #fff;
            padding: 30px;
            max-width: 800px;
            width: 100%;
            border-radius: 8px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
        }
        .instagram-integration-content h2 {
            color: #333;
            text-align: center;
            margin-bottom: 30px;
        }
        .instagram-step {
            margin-bottom: 20px;
        }
        .instagram-step-title {
            font-weight: bold;
            color: #555;
            font-size: 18px;
            text-align: center;
            margin-bottom: 10px;
        }
        .instagram-integration-content p {
            text-align: center;
            color: #666;
        }
    </style>
</head>
<body>

    <div class="instagram-integration-container">
        <div class="instagram-integration-content">
            <h2>Como integrar a sacolinha do Instagram com um arquivo XML</h2>

            <div class="instagram-step">
                <p class="instagram-step-title">1. Crie uma conta comercial no Instagram</p>
                <p>Vá até o app e converta sua conta pessoal para uma conta comercial.</p>
            </div>

            <div class="instagram-step">
                <p class="instagram-step-title">2. Ative o Instagram Shopping</p>
                <p>No gerenciador de negócios do Facebook, conecte seu catálogo de produtos.</p>
                <p>Com a função de Compras (Sacolinha), você pode transformar seu perfil profissional em uma extensão da sua loja Digitaleezy Catálogos Online, exibindo todos os seus produtos com preços e marcando-os nas postagens para redirecionar seus clientes diretamente à sua loja virtual na Digitaleezy Catálogos Online e finalizar a compra.</p>
            </div>

            <div class="instagram-step">
                <p class="instagram-step-title">3. Suba o XML para o catálogo</p>
                <p>No gerenciador de catálogos do Facebook, vá em <strong>Fonte de Dados &gt; Adicionar Produto &gt; Usar Feed de Dados</strong>. Coloque o link do seu arquivo XML.</p>
            </div>

            <div class="instagram-step">
                <p class="instagram-step-title">4. Espere a aprovação</p>
                <p>O Facebook/Instagram vai revisar seu catálogo. Depois, a opção de marcação de produtos ficará disponível no app.</p>
                <p>Mesmo após seguir todos os passos, será necessário aguardar a análise do Instagram. Eles podem aprovar ou não sua solicitação conforme os <strong>Requisitos de qualificação para comércio</strong>. Essa análise pode levar menos de 24 horas ou até algumas semanas.</p>
            </div>

            <div class="instagram-step">
                <p class="instagram-step-title">Pronto!</p>
                <p>Agora você poderá marcar produtos nas postagens.</p>
            </div>
        </div>
    </div>

</body>
</html>



<?php 
// FOOTER
$system_footer .= "";
include('../_layout/rdp.php');
include('../_layout/footer.php');
?>