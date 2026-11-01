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

header('Access-Control-Allow-Origin: *');


if(isset($_GET['ano'])) {
	$ano = $_GET['ano'];
	if ($ano != "todos" && $ano != "") {
		$_SESSION['ano'] = $ano;
		$sqlValidade = "SELECT * FROM validades WHERE rel_estabelecimentos_id = '$eid' AND ano = '$ano' ORDER BY produto ASC";
	} else {
		$_SESSION['ano']="todos";
		$sqlValidade = "SELECT * FROM validades WHERE rel_estabelecimentos_id = '$eid' ORDER BY ano ASC";
	}
}  

if(isset($_GET['id_validade'])) {
	$id_validade_get = $_GET['id_validade'];
	$_SESSION['id_validade'] = $id_validade_get;
} else {
	unset($_SESSION['id_validade']);
	$id_validade_get = 0;
}

		$script_validade = "<script> $('#validade').load('ano_index.php?";

		if (isset($_SESSION['ano'])) {
			$script_validade .= "ano=" . $_SESSION['ano'];
		} 

		else if (isset($_SESSION['id_validade'])) {
			$script_validade .= "id_validade=" . $_SESSION['id_validade'];
		}

		$script_validade .= "'); </script>";



					
		$meses = ['1' => 'Janeiro', '2' => 'Fevereiro', '3' => 'Março', '4' => 'Abril', '5' => 'Maio', '6' => 'Junho', '7' => 'Julho', '8' => 'Agosto', '9' => 'Setembro', '10' => 'Outubro', '11' => 'Novembro', '12' => 'Dezembro'];

$dados = [];
$resValidade = mysqli_query($db_con, $sqlValidade);
$resContato_whatsapp = mysqli_query($db_con, "SELECT * FROM `estabelecimentos` WHERE `id` = '$eid'");
$rowContato_whatsapp = mysqli_fetch_assoc($resContato_whatsapp);
$whatsapp = $rowContato_whatsapp['contato_whatsapp'];

while ($row = mysqli_fetch_assoc($resValidade)) {
    $id_validade = $row['id'];
	$dia_validade = $row['dia'];
    $mes_validade = $row['mes'];
    $ano_validade = $row['ano'];
    $nome_produto_validade = $row['produto'];
    $dados[$mes_validade][] = ["produto" => "{$nome_produto_validade} - ({$ano_validade})", "id" => $id_validade, "dia" => $dia_validade, "mes" => $mes_validade, "ano" => $ano_validade, "nome_produto" => "{$nome_produto_validade}"]; // Armazene o id junto com os dados do produto
}

echo "<tr class='titulo-mes'>";
foreach($meses as $nome) {
    echo "<th style='border: 1px solid #000; font-weight: bold; font-size: 16px;'>$nome</th>";
}
echo "</tr>";

$maxRows = max(array_map('count', $dados));
for($i = 0; $i < $maxRows; $i++) {
    echo "<tr>";
    foreach($meses as $num => $nome) {
        echo "<td style='" . ($id_validade_get == $dados[$num][$i]["id"] && $id_validade_get != 0 ? "border: 2px solid #000; background-color: #ffa3b4; font-weight: bold;" : "border: 1px solid #ccc; background-color: #fff;" ) . "'>";
        if(isset($dados[$num][$i])){
             // Exiba os dados do produto
			echo "<div class='produto-pesquisa' class='btn-group' style='margin-left: 5px;'>";
			echo $dados[$num][$i]["produto"];
			echo "<br>";
            echo "<a class='btn btn-terceiro-invertido editar-validade' role='button' data-eid=" . $eid . " data-id_validade=" . $dados[$num][$i]["id"] . " data-dia_validade=" . $dados[$num][$i]["dia"] . " data-mes=" . $num . " data-ano=" . $dados[$num][$i]["ano"] . " data-produto='" . $dados[$num][$i]["nome_produto"] . "' style='background: #fff !important; max-height: 70px !important; padding: 2px !important; margin-bottom: 5px !important;'>✏️</a> ";
            echo '<a class="btn btn-branco-vermelho apa-validade" role="button" data-eid=' . $eid . ' data-id_validade=' . $dados[$num][$i]["id"] . ' data-dia_validade=' . $num . ' data-mes=' . $nome . ' style="background: #fff !important; max-height: 70px !important; padding: 2px !important; margin-bottom: 5px !important;">🗑️</a> </div> '; // Use o id do registro correspondente
        }
        echo "</td>";
    }
    echo "</tr>";
}

				
?>



<script>
$(document).ready(function() {
	$(document).ready(function() {
  $("#busca-produto").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    $(".produto-pesquisa").filter(function() {
      $(this).toggle($(this).text().toLowerCase().indexOf(value) > -1)
    });
  });
});

  });

			</script>



<script>

	// $('.adc-validade').on('click', function() {
	
	// 	var dia_validade = $(this).data('dia_validade');
	// 	var id_funcao = $(this).data('id_funcao');
	// 	var mes = $(this).data('mes');
	// 	var fim = $(this).data('fim');


	// 			$('#modal-concluido').modal('show');

	// 			$('#modal-content-concluido').load('refechados-irmaos.php?id_funcao=' + id_funcao + '&dia_validade=' + dia_validade + '&mes=' + mes + '&fim=' + fim);


		
	// });

	$('.apa-validade').on('click', function() {
			var id_validade = $(this).data('id_validade');
							//sweetalert aqui
					Swal.fire({
						title: 'Tem certeza que deseja Apagar?',
						text: "Você não poderá reverter isso!",
						icon: 'warning',
						showCancelButton: true,
						confirmButtonColor: '#3085d6',
						cancelButtonColor: '#d33',
						confirmButtonText: 'Sim, apagar!',
						cancelButtonText: 'Cancelar!'
					}).then((result) => {
						if (result.isConfirmed) {
							// inicia o objeto FormData
		   	 				var formData = new FormData();
							formData.append('novavalidade', 'apagar');
							formData.append('id_validade', id_validade);
							$.ajax({
							url: 'add-validade.php',
							type: 'POST',
							data: formData,
							processData: false, // Diz ao jQuery para não processar os dados
							contentType: false, // Diz ao jQuery para não definir o cabeçalho do tipo de conteúdo
							success: function(data) {
								setTimeout(function() {
									$('#validades').load('<?php panel_url(); ?>/validade/ano_index.php?ano='+<?php echo '"'.$_SESSION['ano'].'"'; ?>);
								}, 500);
							},
							error: function(data) {
								console.log('Erro ao apagar produto!');
							}
							
						});

							
						}
							else {
								// Aqui você pode adicionar o código para cancelar a exclusão

							}
					})				
	});

	$('.editar-validade').on('click', function() {
		var id_validade = $(this).data('id_validade');
		var eid = $(this).data('eid');
		var dia_validade = $(this).data('dia_validade');
		var mes = $(this).data('mes');
		var ano = $(this).data('ano');
		var produto = $(this).attr('data-produto');

		Swal.fire({
		title: 'Edite a validade do produto',
		text: 'Digite o mês e o ano, seguidos pelo nome do produto. O dia é opcional. Exemplo: 03/25 Dipirona 20mg',
		input: 'text',
		inputValue: dia_validade + '/' + mes + '/' + ano + ' ' + produto,
		inputPlaceholder: 'MM/AA ou DD/MM/AA + nome do produto',
		showCancelButton: true,
		confirmButtonText: 'Salvar',
		cancelButtonText: 'Cancelar',
		}).then((result) => {
		if (result.isConfirmed) {
			var produtos = result.value; // Aqui você tem a data e o nome do produto inseridos pelo usuário
			var whatsapp = '<?php echo $whatsapp;?>';

			fetch('https://n8n.pedz.top/webhook/valeu', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
			},
			body: JSON.stringify({
				data: {
				key: {
					remoteJid: whatsapp,
					fromMe: true
				},
				message: {
					conversation: produtos
				},
				id_validade: id_validade,
				eid: eid,
				event: "editar",
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



	
</script>



<script>
$(document).ready(function() {
  $(".busca-produto").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    
    // percorre cada título de categoria
    $(".titulocat").each(function() {
      // obtém o nome da categoria
      var catnome = $(this).attr("name");
      // inicializa a variável que indica se há algum item correspondente
      var hasMatch = false;
      // percorre cada item dessa categoria
      $(".itens[data-catnome='" + catnome + "']").each(function() {
        // verifica se o texto do item contém o valor da pesquisa
        var match = $(this).text().toLowerCase().indexOf(value) > -1;
        // mostra ou oculta o item de acordo com a condição
        $(this).toggle(match);
        // atualiza a variável que indica se há algum item correspondente
        hasMatch = hasMatch || match;
      });
      // mostra ou oculta o título de acordo com a variável
      $(this).toggle(hasMatch);
    });
  });
});

			</script>

<!-- <script>
	         function filtrarIrmaos() {
             var input = $("#irmaos").val();
            
             if (input.length > 1) {
                
                 $.ajax({
                     url: '../admin/pesquisa_irmaos.php', // Substitua por seu arquivo PHP que retorna os dados do banco de dados
                     type: 'POST',
                     data: {query: input},
                     success: function(data) {
                         $('#sugestoes').html(data);
                     }
                 });
             }
         }
</script> -->

<?php //echo $script_validade;?>

<!-- 
<script>
 $(document).ready(function() {
    $(".irmao-validade").on('click', function() {


	   var id_irmao_edt = $(this).data('id_irmao_edt');
       var nome_edt = $(this).data('nome_edt');
       var dia_edt = $(this).data('dia_edt');
       var id_funcao_edt = $(this).data('id_funcao_edt');
       var dia_semana_edt = $(this).data('dia_semana_edt');

        if(dia_semana_edt = "fim")
        {
             dia_semana_edt = "Fim de Semana";
        }   
            else if (dia_semana_edt = "meio")
            {
                dia_semana_edt = "Meio de Semana";
            }

        // Cria o HTML do resumo do agendamento
        var resumoHtml = `
            <div class="container resumo-agendamento">
                <div style="width: 100%;">
                    <h3 class="text-center mt-4"><i class="fas fa-calendar-check"></i> Resumo</h3>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-clock"></i> Irmão: </h4>
                        <div class="text-right">${nome_edt}</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-cut"></i> Ajudante</h4>
                        <div class="text-right">--</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-person"></i> Data</h4>
                        <div class="text-right">${dia_edt}</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-currency-dollar"></i> Reunião de <span class="text-right text-success"><b>${dia_semana_edt}</b></span></h4>
                        
                    </div>
                </div>
                <div class="input-container col-12" style="grid-column: 1/-1;">
                    <div class="input-group">
                        <label for="modal_message">Observação: <b>*</b></label>
                        <textarea maxlength="2000" class="agendamento-observacao form-control orcamento-input-gal" id="modal_message" placeholder="Ex: (Auditório) / (Entrada)" rows="3" required></textarea>
                    </div>
                </div>
            </div>`;
            

         // oculta todos os modais
         $('.modal').modal('hide');

        // Mostra o resumo do agendamento
        Swal.fire({
            html: resumoHtml,
            showCloseButton: true,
            focusConfirm: false,
            confirmButtonText: 'Confirmar',
            confirmButtonAriaLabel: 'Confirmar',  
            showCancelButton: true,
            cancelButtonText: 'Cancelar',
            cancelButtonAriaLabel: 'Cancelar',
            footer: '<button class="btn btn-verde-whatsapp" style="margin-top: -20px;">Confirmar + Whatsapp</button>',
            confirmButtonColor: '#3085d6',
            cancelButtonColor: '#d33'

        }).then((result) => {
            if (result.isConfirmed) {
                // Coleta a observação
                var observacao = $('.agendamento-observacao').val();

                if (!observacao) {
                    observacao = 'Nenhuma observação';
                }

               
            // Adiciona catid ao objeto FormData
		    var formData = new FormData();
			
			// Faça algo se o elemento tem o ID 'meuId'
			formData.append('novavalidade', true);
            formData.append('id_irmao', id_irmao_edt);
			formData.append('id_funcao', id_funcao_edt);
			formData.append('dia_validade', dia_edt);
            formData.append('observacao', observacao);
				
						$.ajax({
							url: '../admin/add-validade.php',
							type: 'POST',
							data: formData,
							processData: false, // Diz ao jQuery para não processar os dados
							contentType: false, // Diz ao jQuery para não definir o cabeçalho do tipo de conteúdo
							success: function(data) {
							//dar um replace para pegar eliminar tudo aquilo que não for número do data
							//var idcat = String(data.replaceAll(/[^\d]/g, ''));
                            $('.main-geral').load('../admin/refechados.php');
							},
							error: function(data) {
								console.log('Erro ao adicionar validade!');
							}
							
						});
                
                
            } else {
                // Mostra o modal de agendamento
               
            }
        });
    });
});

  
</script> -->
