<?php include('../config/conexaoadm.php'); 

// include('../admin/login-check.php');
header('Access-Control-Allow-Origin: *');

function getPartesPorMes($conn, $id_irmao, $dia_parte, $mes) {
    $sql = "SELECT COUNT(*) as total FROM partes WHERE id_irmao = '$id_irmao' AND MONTH(STR_TO_DATE(dia_parte, '%d/%m/%Y')) = '$mes'";
    $res = mysqli_query($conn, $sql);
    $row = mysqli_fetch_assoc($res);
    return $row['total'];
    //return $sql;
}

function getPartesPorFuncao($conn, $id_irmao, $id_funcao, $mes) {
    $sql = "SELECT COUNT(*) as total FROM partes WHERE id_irmao = '$id_irmao' AND id_funcao = '$id_funcao' AND MONTH(STR_TO_DATE(dia_parte, '%d/%m/%Y')) = '$mes'";
    $res = mysqli_query($conn, $sql);
    $row = mysqli_fetch_assoc($res);
    return $row['total'];
    //return $sql;
}

if(isset($_GET['edt'])){
    $edt = $_GET['edt'];
    $id_parte_edt = $_GET['id_parte_edt'];
}
else{
    $edt = "true";
}

if(isset($_GET['id_funcao']) && isset($_GET['dia_parte'])){
    $id_funcao = $_GET['id_funcao'];
    $dia_parte = $_GET['dia_parte'];
    $mes = $_GET['mes'];
    if($mes == 'Janeiro'){
        $mesNum = 1;
    } elseif($mes == 'Fevereiro'){
        $mesNum = 2;
    }
    elseif($mes == 'Março'){
        $mesNum = 3;
    }
    elseif($mes == 'Abril'){
        $mesNum = 4;
    }
    elseif($mes == 'Maio'){
        $mesNum = 5;
    }
    elseif($mes == 'Junho'){
        $mesNum = 6;
    }
    elseif($mes == 'Julho'){
        $mesNum = 7;
    }
    elseif($mes == 'Agosto'){
        $mesNum = 8;
    }
    elseif($mes == 'Setembro'){
        $mesNum = 9;
    }
    elseif($mes == 'Outubro'){
        $mesNum = 10;
    }
    elseif($mes == 'Novembro'){
        $mesNum = 11;
    }
    elseif($mes == 'Dezembro'){
        $mesNum = 12;
    }
    


    $fim = $_GET['fim'];

    $slctFuncao = "SELECT * FROM funcao WHERE id_funcao = '$id_funcao'";
    $resFuncao = mysqli_query($conn, $slctFuncao);
    $rowFuncao = mysqli_fetch_assoc($resFuncao);
    $nome_funcao = $rowFuncao['nome_funcao'];
	}

?>

<div class="modal-header">
<button type="button" class="btn"><i class="fa fa-chevron-left back-arrow" style="margin-top: 25% !important;" data-dismiss="modal" data-bs-dismiss="modal" aria-label="Close"></i></button>    
 
        <div class="bg-nav col-8" id="search-bar">
            <div class=" container-xxl">
                <div class="input-group w-100">
                
                <input type="text" id="search-input-pesquisa" class="form-control form-control-sm col-9" placeholder="🔍 Pesquisar Irmão..." style="max-width: 90%;">
                
                </div>
            </div>
        </div>
        <button type="button" class="btn-close" style="margin: 0 !important;"  data-dismiss="modal" data-bs-dismiss="modal" aria-label="Fechar"></button>
            
    </div>

        <div class="modal-body fullscreen">

        <div class="table-responsive col-md-12">
<table>
    <thead>
        <tr style="background-color: #0035c952; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;">
            <td style= "width: 25% !important;"><?php echo $dia_parte; ?></td>
            <td style= "width: 25% !important;"><?php echo $mes; ?></td>
            <td style= "width: 25% !important;">Como <?php echo $nome_funcao;?> </td>
            <td style= "width: 25% !important;">Selecione o Irmão</td>
        </tr>
    <thead>

<?php 
	$sql = "SELECT * FROM irmaos ORDER BY nome_sobrenome_irmao ASC";
	$res = mysqli_query($conn, $sql);

   $count = mysqli_num_rows($res);
   

   if($count > 0)
   {
       while($row = mysqli_fetch_assoc($res))
       { //  id_irmao  nome_sobrenome_irmao Ascendente telefone_irmao genero_irmao
        $id_irmao = $row['id_irmao'];
        $nome_sobrenome_irmao = $row['nome_sobrenome_irmao'];
        $telefone_irmao = $row['telefone_irmao'];
        $genero_irmao = $row['genero_irmao'];

        $partesPorMes = getPartesPorMes($conn, $id_irmao, $dia_parte, $mesNum);
        $partesPorFuncao = getPartesPorFuncao($conn, $id_irmao, $id_funcao, $mesNum);

        if ($partesPorMes == 0) {
            $corDeMes = '#fff';  // branco
        } else if ($partesPorMes <= 3) {
            $corDeMes = '#10ff008f';  // verde
        } else if ($partesPorMes > 2 && $partesPorMes <= 4) {
            $corDeMes = '#ffe0008f';  // amarelo
        } else if ($partesPorMes > 4) {
            $corDeMes = '#ff00008f';  // vermelho
        }

        
        if ($partesPorFuncao == 0) {
            $corDeFuncao = '#fff';  // branco
        } else if ($partesPorFuncao > 0 && $partesPorFuncao <= 2) {
            $corDeFuncao = '#10ff008f';  // verde
        } else if ($partesPorFuncao > 2 && $partesPorFuncao <= 4) {
            $corDeFuncao = '#ffe0008f';  // amarelo
        } else if ($partesPorFuncao > 2) {
            $corDeFuncao = '#ff00008f';  // vermelho
        }

        
        ?>
        <tr class="nometr" data-nome_tr="<?php echo $nome_sobrenome_irmao; ?>">
            
                <?php
                    $slctCountParteIrmaoDia = "SELECT * FROM partes WHERE id_irmao = '$id_irmao' AND dia_parte = '$dia_parte'";
                    $resCountParteIrmaoDia = mysqli_query($conn, $slctCountParteIrmaoDia);
                    $countParteIrmaoDia = mysqli_num_rows($resCountParteIrmaoDia);
                    if ($countParteIrmaoDia == 0) {
                        echo "<td style= 'width: 25% !important; background-color: #fff; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;'>$countParteIrmaoDia</td>";
                    } else if ($countParteIrmaoDia == 1) {
                        echo "<td style= 'width: 25% !important; background-color: #10ff008f; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;'>$countParteIrmaoDia</td>";
                    } else if ($countParteIrmaoDia == 2) {
                        echo "<td style= 'width: 25% !important; background-color: #ffe0008f; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;'>$countParteIrmaoDia</td>";
                    }
                     else if ($countParteIrmaoDia > 2) {
                        echo "<td style= 'width: 25% !important; background-color: #ff00008f; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;'>$countParteIrmaoDia</td>";
                    }

                    
        

                ?>

           
            <td style="width: 25% !important; background-color: <?php echo $corDeMes; ?>; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;"><?php echo $partesPorMes; ?></td>
            <td style="width: 25% !important; background-color: <?php echo $corDeFuncao; ?>; color: black; border: 1px solid #000; font-weight: bold; font-size: 16px;"><?php echo $partesPorFuncao; ?></td>
            <td style="width: 25% !important; border: 1px solid #000;">  <button class="btn btn-primary slc-irmao" data-nome_funcao="<?php echo $nome_funcao; ?>" data-edt="<?php echo $edt; ?>" <?php if(isset($id_parte_edt)){ echo "data-id_parte_edt='$id_parte_edt'"; };?> data-dia_semana="<?php echo $fim; ?>" data-id-irmao="<?php echo $id_irmao; ?>" data-nome="<?php echo $nome_sobrenome_irmao; ?>" data-dia="<?php echo $dia_parte; ?>" data-id_funcao="<?php echo $id_funcao; ?>" data-contdia="<?php echo $countParteIrmaoDia; ?>" style="width: 100% !important;"> <?php echo $nome_sobrenome_irmao; ?> </button>  </td>
        </tr>


        
        <?php
       }
   }
   ?>
   		
</table>

</div>

</div>


<script>
 $(document).ready(function() {
    $(".slc-irmao").on('click', function() {
       var id_irmao = $(this).data('id-irmao');
       var nome = $(this).data('nome');
       var dia = $(this).data('dia');
       var id_funcao = $(this).data('id_funcao');
       var dia_semana = $(this).data('dia_semana');
       var edt = $(this).data('edt');
       var contDia = $(this).data('contdia');
       var nome_funcao = $(this).data('nome_funcao');
       var frase = '';
       
        if(dia_semana = "fim")
        {
             dia_semana = "Fim de Semana";
        }   
            else if (dia_semana = "meio")
            {
                dia_semana = "Meio de Semana";
            }

        // Cria o HTML do resumo do agendamento
        var resumoHtml = `
            <div class="container resumo-agendamento">
                <div style="width: 100%;">
                    <h3 class="text-center mt-4"><i class="fas fa-calendar-check"></i> Resumo</h3>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-person"></i> Irmão: </h4>
                        <div class="text-right">${nome}</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-engine"></i> Função: </h4>
                        <div class="text-right">${nome_funcao}</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-cut"></i> Ajudante</h4>
                        <div class="text-right">--</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4><i class="bi bi-clock"></i> Data</h4>
                        <div class="text-right">${dia}</div>
                    </div>
                    <hr>
                    <div style="text-align: left;">
                        <h4> Reunião de <span class="text-right text-success"><b>${dia_semana}</b></span></h4>
                        
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
         function handleResult(result, observacao) {
            if (result.isConfirmed) {
                var formData = new FormData();
                formData.append('novaparte', edt);
                if (edt == "editar") {
                    id_parte_edt = $(".slc-irmao").data('id_parte_edt');
                    formData.append('id_parte', id_parte_edt);
                }
                formData.append('id_irmao', id_irmao);
                formData.append('id_funcao', id_funcao);
                formData.append('dia_parte', dia);
                formData.append('observacao', observacao || 'Nenhuma observação');
                $.ajax({
                    url: '../admin/add-parte.php',
                    type: 'POST',
                    data: formData,
                    processData: false,
                    contentType: false,
                    success: function(data) {
                        $('.main-geral').load('../admin/refechados.php');
                    },
                    error: function(data) {
                        console.log('Erro ao adicionar parte!');
                    }
                });
            } else {
                $('#modal-concluido').modal('show');
            }
        }

        if (contDia > 0 && contDia <= 2) {
            Swal.fire({
                icon: 'warning',
                title: 'Alerta!',
                text: 'O irmão já tem uma designação no dia ' + dia + '!',
                focusConfirm: false,
                confirmButtonText: 'Escolher outro',
                confirmButtonAriaLabel: 'Escolher outro',
                showCancelButton: true,
                cancelButtonText: 'Designar mesmo assim',
                cancelButtonAriaLabel: 'Designar mesmo assim',
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    $('#modal-concluido').modal('show');
                    return;
                } else {
                    Swal.fire({
                        html: resumoHtml,
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
                        var observacao = $('.agendamento-observacao').val();
                        handleResult(result, observacao);
                    });
                }
            });
        } else  if(contDia > 2){
            Swal.fire({
                icon: 'warning',
                title: 'Alerta!',
                text: 'Isso não é amoroso, o irmão tem mais de duas designações para o dia ' + dia + '!',
                focusConfirm: false,
                confirmButtonText: 'Escolher outro',
                confirmButtonAriaLabel: 'Escolher outro',
                showCancelButton: true,
                cancelButtonText: 'Designar mesmo assim',
                cancelButtonAriaLabel: 'Designar mesmo assim',
                confirmButtonColor: '#3085d6',
                cancelButtonColor: '#d33'
            }).then((result) => {
                if (result.isConfirmed) {
                    $('#modal-concluido').modal('show');
                    return;
                } else {
                    Swal.fire({
                        html: resumoHtml,
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
                        var observacao = $('.agendamento-observacao').val();
                        handleResult(result, observacao);
                    });
                }
            });

        }

        if (contDia == 0) {
            Swal.fire({
                html: resumoHtml,
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
                var observacao = $('.agendamento-observacao').val();
                handleResult(result, observacao);
            });
        }
        });
        });

</script>


<script>

$(document).ready(function() {
  $("#search-input-pesquisa").on("keyup", function() {
    var value = $(this).val().toLowerCase();
    
    // percorre cada título de categoria
    $(".nometr").each(function() {
      // obtém o nome da categoria
      var nome_irmao = $(this).data('nome_tr').toLowerCase().indexOf(value) > -1;
        
      
      // inicializa a variável que indica se há algum item correspondente
      var hasMatch = false;
      
        $(this).toggle(nome_irmao);
        // atualiza a variável que indica se há algum item correspondente
        hasMatch = hasMatch || nome_irmao;
     
      // mostra ou oculta o título de acordo com a variável
      $(this).toggle(hasMatch);
    });
  });
});

</script>