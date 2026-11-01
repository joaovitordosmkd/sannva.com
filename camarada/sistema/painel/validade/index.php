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

if (isset($_GET['ano'])) {
	$ano = $_GET['ano'];
	if ($ano != "todos") {
		$_SESSION['ano'] = $ano;
	} else {
		$_SESSION['ano']="todos";
	}
}

if(isset($_GET['id_validade'])) {
	$id_validade = $_GET['id_validade'];
	$_SESSION['id_validade'] = $id_validade;
} else {
	$_SESSION['id_validade'] = 0;
}

?>
<!-- CONTENT -->
<div id="content">
		
		<!-- NAVBAR -->

	
<br>
<div class="w-100 d-flex justify-content-center">

<nav class="navbar ano">
	<ul class="nav navbar-nav">
	



	<li style="margin: 5px;">

		<div class="search-bar">

				<div class="clear"></div>

				<input type="text" id="busca-produto" name="buscar-produto" placeholder="Digite sua busca..." value="">
				<input type="hidden" name="categoria" value="">
				<button>
					<i class="lni lni-search-alt"></i>
				</button>
				<div class="clear"></div>

		</div>

			</li>


		<li class="dropdown ano" style="margin: 5px;">
			<a class="dropdown-toggle" data-toggle="dropdown" href="#">
				<spam class="spamano"><?php if (isset($_SESSION['ano'])) { echo $_SESSION['ano']; } else { echo "Todos os Anos"; }?></spam>
				<i class="lni lni-chevron-down icon-right"></i>
			</a>
			<ul class="dropdown-menu ano">
				<li><a href="#" data-ano="todos">todos</a></li>
				<?php for($ano = 24; $ano <= 30; $ano++): ?>
					<li><a href="#" data-ano="<?php echo $ano; ?>"><?php echo $ano; ?></a></li>
				<?php endfor; ?>
			</ul>
		</li>
		<li style="margin: 5px;"><a class="adicionar-validade" data-eid = "<?php echo $eid; ?>" href="#">➕</a></li>
	</ul>
</nav>

<div class="listing-table table-pedidos" style="max-height: 500px; /* Ajuste conforme necessário */ max-width: 100%; /* Ajuste conforme necessário */ overflow: auto; /* Adiciona a barra de rolagem */ border: 1px solid rgba(0, 0, 0, .2); border-radius: 4px; border-collapse: separate; background: #fff;">
	<!-- fake-table clean-table -->
	<div class="order">
		<div class="head">
		</div>

	<!-- titulo ccom um fundo de comprimento da tabela escrito reunião de meio de semana centralizado e grande -->


	<table id="validades" class="table table-bordered">

	</table>
	<div class="w-100 d-flex justify-content-center">
		
	</div>
				
			</div>
		</div>
	</div>
</div>

<script>
	$(document).ready(function () {
		$('#validades').load('<?php panel_url(); ?>/validade/ano_index.php?id_validade='+<?php echo $_SESSION['id_validade']; ?>+'&ano='+<?php echo '"'.$_SESSION['ano'].'"'; ?>);
		$('.dropdown-menu.ano a').click(function (e) {
			e.preventDefault();
			var ano = $(this).data('ano');
			$('.spamano').text(ano);
			$('#validades').load('<?php panel_url(); ?>/validade/ano_index.php?ano=' + ano);
		});

		$('.adicionar-validade').click(function (e) {
			var eid = $(this).data('eid');

			Swal.fire({
			title: 'Adicione a validade do produto',
			text: 'Digite o mês e o ano, seguidos pelo nome do produto. O dia é opcional. Exemplo: 03/25 Dipirona 20mg',
			input: 'text',
			inputPlaceholder: 'MM/AA ou DD/MM/AA + nome do produto',
			showCancelButton: true,
			confirmButtonText: 'Adicionar',
			cancelButtonText: 'Cancelar',
			}).then((result) => {
			if (result.isConfirmed) {
				var produto = result.value; // Aqui você tem a data e o nome do produto inseridos pelo usuário
				var whatsapp = '<?php echo $whatsapp;?>';

				fetch('https://n8n.pedz.top/webhook/valeu', {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
				},
				body: JSON.stringify({
					data: {
					key: {
						remoteJid: "55"+whatsapp.replace(/\D/g, ''),
						fromMe: true
					},
					message: {
						conversation: produto
					},
					eid: eid,
					event: "adicionar",
					}
				}),
				})
				.then(response => response.json())
				.then(data => {

        // Verifique o status da resposta e exiba um alerta SweetAlert personalizado
        switch(data.status) {
            case 'invalido':
                Swal.fire('Erro', 'Dados inválidos.', 'error');
				$('#validades').load('<?php panel_url(); ?>/validade/ano_index.php?ano='+<?php echo '"'.$_SESSION['ano'].'"'; ?>);
                break;
            case 'duplicado':
                Swal.fire('Aviso', 'Dados duplicados.', 'warning');
				$('#validades').load('<?php panel_url(); ?>/validade/index.php?id_validade='+data.id_retorno);
                break;
            case 'inserido':
                Swal.fire('Sucesso', 'Dados inseridos com sucesso.', 'success');
				$('#validades').load('<?php panel_url(); ?>/validade/ano_index.php?ano='+<?php echo '"'.$_SESSION['ano'].'"'; ?>);
                break;
            case 'atualizado':
                Swal.fire('Sucesso', 'Dados atualizados com sucesso.', 'success');
				$('#validades').load('<?php panel_url(); ?>/validade/index.php?id_validade='+data.id_retorno);
                break;
            default:
                Swal.fire('Informação', 'Operação concluída.', 'info');
        }
    })
    .catch((error) => {
        console.error('Erro:', error);
				});

			}
			});
		});
	});


</script>




<?php 
// FOOTER
$system_footer .= "";
include('../_layout/rdp.php');
include('../_layout/footer.php');
?>