<?php include('../config/conexaoadm.php'); 

include('../admin/login-check.php');


header('Access-Control-Allow-Origin: *');

$online_order_notif = "SELECT COUNT(*) AS total_unread_notifications FROM `fechamento` WHERE status_fechamento = 'Recebido'";

$res_online_order_notif = mysqli_query($conn, $online_order_notif);

$rowunread = mysqli_fetch_assoc($res_online_order_notif);

$row_online_order_notif = $rowunread["total_unread_notifications"];

$total_unread_notifications = $rowunread["total_unread_notifications"];


// Suponha que $sts_fecha_conc seja uma das opções: "Aceito", "Pronto" ou "Finalizado"
// Defina as cores de fundo e da fonte dos timeline-content de acordo com o status


if($total_unread_notifications > 0){
    ?>

<audio id="audio" autoplay> <source src="campainha.mp3" type="audio/mp3" /> </audio>
    
<?php
}

echo $script_partes;
?>



<input type="hidden" id="total-unread-notifications" value="<?php echo $total_unread_notifications; ?>" />

<!-- CONTENT -->
<div id="content">
		
		<!-- NAVBAR -->

	
<br>
<div class="w-100 d-flex justify-content-center">
<?php
// Inicie a sessão se ainda não tiver sido iniciada
if (session_status() == PHP_SESSION_NONE) {
    session_start();
}

// Defina $_SESSION['mes'] para o mês atual se não estiver definido
if (!isset($_SESSION['mes'])) {
    $_SESSION['mes'] = date('n');
}
?>

<select id="slctFimDeSem" class="m-2">
    <option value="fim" <?php echo ($_SESSION['fim'] == 'fim') ? 'selected' : ''; ?>>Fim de Semana</option>
    <option value="meio" <?php echo ($_SESSION['fim'] == 'meio') ? 'selected' : ''; ?>>Meio de Semana</option>
</select>

<select id="slctMes" class="m-2">
    <?php
    $meses = array(
        1 => 'Janeiro',
        2 => 'Fevereiro',
        3 => 'Março',
        4 => 'Abril',
        5 => 'Maio',
        6 => 'Junho',
        7 => 'Julho',
        8 => 'Agosto',
        9 => 'Setembro',
        10 => 'Outubro',
        11 => 'Novembro',
        12 => 'Dezembro'
    );
    foreach ($meses as $numero => $nome) {
        $selected = ($_SESSION['mes'] == $numero) ? 'selected' : '';
        echo "<option value='$numero' $selected>$nome</option>";
    }
    ?>
</select>

<button type="button" class="btn btn-secondary menu-button imp-ped" data-dismiss="modal" data-bs-dismiss="modal" data-bs-toggle="modal"><i class="fa fa-print"></i> Impressão </button>
</div>


			<div class="table-responsive col-md-12">
			<div class="order">
			<div class="head">
			</div>

	<!-- titulo ccom um fundo de comprimento da tabela escrito reunião de meio de semana centralizado e grande -->


	<table id="partes">

	</table>
				
			</div>
		
               
				</div>
				
			</div>

					</div>
					</div>
					</div>

			


	
	

	</section>
	<!-- CONTENT -->
	

	<script src="script-admin.js"></script>

<script>
    $(document).ready(function() {
		$('#partes').load('refechados-partes.php');
    });
</script>

	<script>
		$(document).ready(function () {
			// pega o valor do select slctFimDeSem 
			//verifica a mudança do select
			$('#slctFimDeSem, #slctMes').change(function () {
				var slctFimDeSem = $('#slctFimDeSem').val();
				var slctMes = $('#slctMes').val();
				$('#partes').load('refechados-partes.php?fim='+slctFimDeSem+'&mes='+slctMes);
			});


		});

	</script>
	

<script>
	$(".imp-ped").click(function() {
			var slctFimDeSem = $('#slctFimDeSem').val();
			var slctMes = $('#slctMes').val();
			var opcoesnotf = {
				title: 'Feche a tela de impressão',
				text: 'A tela de impressão impede que você continue mexendo no site.',
				icon: 'warning',
				showCancelButton: false,
				confirmButtonText: 'Ok',
				confirmButtonColor: '#009900',
			};
			// Mostrar a caixa de diálogo com a mensagem de erro
			Swal.fire(opcoesnotf).then((result) => {
				if (result.isConfirmed) {
					return false;
				}
					else {
						return false; // isso impede que o formulário seja enviado ou que o modal seja fechado
					}
			});
	
			window.open('<?php echo SITEURL;?>/admin/print.php?fim='+slctFimDeSem+'&mes='+slctMes, '_blank', 'width=800,height=600');
	});
</script>
	
<script>
		function checkWindowSize() {
			var win = $(window);
			if (win.width() <= 920) { 
				$('thead').hide();
			} else {
				$('thead').show();
			}
		}

		$(document).ready(checkWindowSize);
		$(window).on('resize', checkWindowSize);

</script>


















<!-- 
<script>

    // get variables in Javascript
    var totalUnreadNotifications = document.getElementById("total-unread-notifications").value;
    totalUnreadNotifications = parseInt(totalUnreadNotifications);

					var toggleMenu = $('.notif_menu');
					var classnum = $(".num");
					var classnum_ei = $(".num-ei");
					var notif_menu_message = $(".notif_menu-message");

    // show count in title bar
    showTitleBarNotifications();
 
    function showTitleBarNotifications() {
        // pattern to check if there is any counter number at the start of title bar
        var pattern = /^\(\d+\)/;
 
        if (totalUnreadNotifications == 0) {
            document.title = document.title.replace(pattern, "");
			// Usando .toggleClass()
			classnum.hide();
			classnum_ei.hide();
			notif_menu_message.text("Nenhum pedido pendende de aprovação no momento");


            return;
        }
 
        if (pattern.test(document.title)) {

            // update the counter
            document.title = document.title.replace(pattern, "(" + totalUnreadNotifications + ")");
        } else {
 
            // prepend the counter
            document.title = "(" + totalUnreadNotifications + ") " + document.title;
        }

		$(document).ready(function () {

					toggleMenu.toggleClass('active');
					// Exibe o valor total formatado com 2 casas decimais no botão "Adicionar" específico
					
					
					// Alterar o texto do botão
					classnum.text(totalUnreadNotifications);
					classnum_ei.text(totalUnreadNotifications);
					notif_menu_message.text("Você tem " + totalUnreadNotifications + " novo(s) pedido(s) pendente(s)!");
                });

		
    }
</script> -->
