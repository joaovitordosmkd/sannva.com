<?php
// CORE
require_once('../../_core/_includes/config.php');

if( $_SESSION['user']['logged'] == "1" ) {

  if( $_SESSION['user']['level'] == "1" ) {
    header("Location: ../../administracao/inicio");
  }

  if( $_SESSION['user']['level'] == "2" ) {
    header("Location: ../../painel/inicio");
  }

}

// SEO
$seo_subtitle = "Cadastrar";
$seo_description = "Cadastrar";
$seo_keywords = $app['title'].", ".$seo_title;
$seo_image = get_just_url()."/_core/_cdn/img/favicon.png";
// HEADER
$system_header .= "";
include('../../_core/_layout/head.php');
include('../../_core/_layout/top.php');
include('../../_core/_layout/sidebars.php');
include('../../_core/_layout/modal.php');
global $recaptcha_sitekey;
global $recaptcha_secretkey;
require_once('../../_core/_cdn/recaptcha/autoload.php');
global $simple_url;
$afiliado = $_SESSION['afiliado'];
?>

<?php

  // Globals

  global $numeric_data;

  // Checar se formulário foi executado

  $formdata = $_POST['formdata'];

  if( $formdata ) {

    // Setar campos
    
      
      $captcha = "2";

      if( isset( $_POST['g-recaptcha-response'] ) ) {

        //$recaptcha = new \ReCaptcha\ReCaptcha($recaptcha_secretkey);
        //$resp = $recaptcha->setExpectedHostname($_SERVER['SERVER_NAME'])->verify($_POST['g-recaptcha-response'], $_SERVER['REMOTE_ADDR']);

        $grabcaptcha = $_POST['g-recaptcha-response'];

        $curl = curl_init();
        curl_setopt_array($curl, array(
            CURLOPT_RETURNTRANSFER => 1,
            CURLOPT_URL => 'https://www.google.com/recaptcha/api/siteverify',
            CURLOPT_POST => 1,
            CURLOPT_POSTFIELDS => array(
                'secret' => $recaptcha_secretkey,
                'response' => $grabcaptcha
            )
        ));
        $response = curl_exec($curl);
        curl_close($curl);

        if( strpos($response, '"success": true') !== FALSE ) {
          $captcha = "1";
        } else {
          $captcha = "2";
        }

      }

      // Afiliado

        $afiliado = mysqli_real_escape_string( $db_con, $_POST['afiliado'] );

      // Dados gerais

        $nome = mysqli_real_escape_string( $db_con, $_POST['nome'] );
        $descricao = mysqli_real_escape_string( $db_con, $_POST['descricao'] );
        $segmento = mysqli_real_escape_string( $db_con, $_POST['segmento'] );
        $estado = mysqli_real_escape_string( $db_con, $_POST['estado'] );
        $cidade = mysqli_real_escape_string( $db_con, $_POST['cidade'] );
        $subdominio = subdomain( mysqli_real_escape_string( $db_con, $_POST['subdominio'] ) );

      // Responsável

        $responsavel_nome = mysqli_real_escape_string( $db_con, $_POST['responsavel_nome'] );
        $responsavel_nascimento = mysqli_real_escape_string( $db_con, $_POST['responsavel_nascimento'] );
        $responsavel_documento_tipo = mysqli_real_escape_string( $db_con, $_POST['responsavel_documento_tipo'] );
        $responsavel_documento = clean_str( mysqli_real_escape_string( $db_con, $_POST['responsavel_documento'] ) );

      // Acesso

        $email = mysqli_real_escape_string( $db_con, $_POST['email'] );
        $pass = mysqli_real_escape_string( $db_con, $_POST['pass'] );
        $repass = mysqli_real_escape_string( $db_con, $_POST['repass'] );

      // Terms

        $terms = mysqli_real_escape_string( $db_con, $_POST['terms'] );

    // Checar Erros

    $checkerrors = 0;
    $errormessage = array();

      // Geral

        // -- Nome

          if( !$nome ) {
            $checkerrors++;
            $errormessage[] = "O nome não pode ser nulo";
          }

        // -- Descrição

          if( !$descricao ) {
            $checkerrors++;
            $errormessage[] = "A descrição não pode ser nula";
          }

        // -- Segmento

          $data_exists = "";
          $results = "";
          $results = mysqli_query( $db_con, "SELECT * FROM segmentos WHERE id = '$segmento'");
          $data_exists = mysqli_num_rows($results);
          if( !$data_exists ) {
            $checkerrors++;
            $errormessage[] = "O Segmento não é valido.";
          }

        // -- Estado

          $data_exists = "";
          $results = "";
          $results = mysqli_query( $db_con, "SELECT * FROM estados WHERE id = '$estado'");
          $data_exists = mysqli_num_rows($results);
          if( !$data_exists ) {
            $checkerrors++;
            $errormessage[] = "O estado não é valido.";
          }

        // -- Cidade

          $data_exists = "";
          $results = "";
          $results = mysqli_query( $db_con, "SELECT * FROM cidades WHERE id = '$cidade'");
          $data_exists = mysqli_num_rows($results);
          if( !$data_exists ) {
            $checkerrors++;
            $errormessage[] = "A cidade não é valida.";
          }

        // -- Subdominio

          $data_exists = "";
          $results = "";
          $results = mysqli_query( $db_con, "SELECT * FROM subdominios WHERE subdominio = '$subdominio'");
          $data_exists = mysqli_num_rows($results);
          if( $data_exists ) {
            $checkerrors++;
            $errormessage[] = "O subdominio não é valido.";
          }

      // Acesso

        // -- Responsavel

          if( !$responsavel_nome ) {
            $checkerrors++;
            $errormessage[] = "O nome do responsável não pode ser nulo";
          }

          if( !$responsavel_nascimento ) {
            $checkerrors++;
            $errormessage[] = "A data de nascimento do responsável não pode ser nula";
          }

          if( !$responsavel_documento_tipo ) {
            $checkerrors++;
            $errormessage[] = "O tipo de documento do responsável não pode ser nulo";
          }

          if( !$responsavel_documento ) {
            $checkerrors++;
            $errormessage[] = "O documento do responsável não pode ser nulo";
          }

        // -- E-mail

          $data_exists = "";
          $results = "";
          $results = mysqli_query( $db_con, "SELECT * FROM users WHERE email = '$email'");
          $data_exists = mysqli_num_rows($results);
          if( $data_exists ) {
            $checkerrors++;
            $errormessage[] = "O e-mail já está registrado no sistema, por favor tente outro ou faça login!";
          }

        // -- Senhas

        if( $pass != $repass ) {
          $checkerrors++;
          $errormessage[] = "As senhas não coincidem.";
        }

      // Terms

        if( !$terms ) {
          $checkerrors++;
          $errormessage[] = "Você deve aceitar os termos de uso";
        }

        if( $captcha != "1" ) {
            $checkerrors++;
            $errormessage[] = "Captcha inválido";
          }

    // Executar registro

    if( !$checkerrors ) {

      if(new_simples( 
            $afiliado,
            $nome,
            $descricao,
            $segmento,
            $estado,
            $cidade,
            $subdominio,
            $responsavel_nome,
            $responsavel_nascimento,
            $responsavel_documento_tipo,
            $responsavel_documento,
            $email,
            $pass
       ) ) {

        if( make_login( $email,$pass,"login","1" ) ) {

          //header("Location: ".get_just_url()."/painel/plano/listar?msg=bemvindo");
          header("Location: ".get_just_url()."/painel/configuracoes/?msg=complete");

        } else {

          header("Location: ".get_just_url()."/login?msg=erro&email=".$email);

        }

      } else {

        header("Location: index.php?msg=erro");
        // echo "Não cadastrou";

      }

    }

  }
  
?>

<div class="middle minfit bg-gray">

	<div class="container">

		<div class="row">

			<div class="col-md-12">

        <div class="title-icon pull-left">
          <i class="lni lni-rocket icon-white"></i>
          <span>Nova Conta</span>
        </div>

        <br/>
        
			</div>

		</div>

		<!-- Content -->

		<div class="data box-white mt-16">

      <form id="the_form" class="form-wizard form-registrar" method="POST" enctype="multipart/form-data">

          <div class="row">

            <div class="col-md-12">

              <?php if( $checkerrors ) { list_errors(); } ?>

              <?php if( $_GET['msg'] == "erro" ) { ?>

                <?php modal_alerta("Erro, tente novamente!","erro"); ?>

              <?php } ?>

              <?php if( $_GET['msg'] == "sucesso" ) { ?>

                <?php modal_alerta("Cadastro efetuado com sucesso!","sucesso"); ?>

              <?php } ?>

            </div>

          </div>

          <div id="wizard-estabelecimento">

            <h3>Geral</h3>
            <section>
              <!-- Dados Gerais -->

                <div class="row">

                  <div class="col-md-12">

                    <div class="title-line mt-0 pd-0">
                      <i class="lni lni-question-circle"></i>
                      <span>Dados do Estabelecimento</span>
                      <div class="clear"></div>
                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>Nome:</label>
                        <input type="text" name="nome" placeholder="Nome do seu estabelecimento" value="<?php echo htmlclean( $_POST['nome'] ); ?>">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>Descrição:</label>
                        <textarea rows="6" name="descricao" placeholder="Descrição do seu estabelecimento"><?php echo htmlclean( $_POST['descricao'] ); ?></textarea>

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>URL:</label>
                        <span class="form-tip">A URL que seus clientes usarão para acessar a estabelecimento, não serão permitidos acentos, cedilha, pontos e caracteres especiais.</span>
                        <div class="row lowpadd">
                          <div class="col-md-3 col-xs-6 col-sm-6">
                            <input class="subdomain" type="text" name="subdominio" placeholder="estabelecimento" value="<?php echo subdomain( htmlclean( $_POST['subdominio'] ) ); ?>">
                          </div>
                          <div class="col-md-9 col-xs-6 col-sm-6">
                            <input type="text" id="input-nome" name="url" value=".<?php echo $simple_url; ?>" DISABLED>
                          </div>
                        </div>
                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-4">

                    <div class="form-field-default">

                        <label>Segmento:</label>
                        <div class="fake-select">
                          <i class="lni lni-chevron-down"></i>
                          <select id="input-segmento" name="segmento">

                              <option value="">Segmento</option>
                              <?php 
                              $quicksql = mysqli_query( $db_con, "SELECT * FROM segmentos ORDER BY nome ASC LIMIT 999" );
                              while( $quickdata = mysqli_fetch_array( $quicksql ) ) {
                              ?>

                                <option <?php if( $_POST['segmento'] == $quickdata['id'] ) { echo "SELECTED"; }; ?> value="<?php echo $quickdata['id']; ?>"><?php echo $quickdata['nome']; ?></option>

                              <?php } ?>

                          </select>
                          <div class="clear"></div>
                      </div>

                    </div>

                  </div>

                  <div class="col-md-4">

                    <div class="form-field-default">

                        <label>Estado:</label>
                        <div class="fake-select">
                          <i class="lni lni-chevron-down"></i>
                          <select id="input-estado" name="estado">

                              <option value="">Estado</option>
                              <?php 
                              $quicksql = mysqli_query( $db_con, "SELECT * FROM estados ORDER BY nome ASC LIMIT 999" );
                              while( $quickdata = mysqli_fetch_array( $quicksql ) ) {
                              ?>

                                <option <?php if( $_POST['estado'] == $quickdata['id'] ) { echo "SELECTED"; }; ?> value="<?php echo $quickdata['id']; ?>"><?php echo $quickdata['nome']; ?></option>

                              <?php } ?>

                          </select>
                          <div class="clear"></div>
                      </div>

                    </div>

                  </div>

                  <div class="col-md-4">

                    <div class="form-field-default">

                        <label>Cidade:</label>
                        <div class="fake-select">
                          <i class="lni lni-chevron-down"></i>
                          <select id="input-cidade" name="cidade">

                            <option value="">Cidade</option>

                          </select>
                          <div class="clear"></div>
                      </div>

                    </div>

                  </div>

                </div>

              <!-- / Dados Gerais -->
            </section>


            <h3>Usuário</h3>
            <section>

              <!-- Informações de usuario -->

                <div class="row">

                  <div class="col-md-12">

                    <div class="title-line mt-0 pd-0">
                      <i class="lni lni-user"></i>
                      <span>Responsável</span>
                      <div class="clear"></div>
                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>Nome completo:</label>
                        <input type="text" id="input-nome" name="responsavel_nome" placeholder="Nome completo" value="<?php echo htmlclean( $_POST['responsavel_nome'] ); ?>">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                      <div class="form-field-default">

                        <label>Data de nascimento:</label>
                        <input type="text" class="maskdate" id="input-nascimento" name="responsavel_nascimento" placeholder="Data de nascimento" value="<?php echo htmlclean( $_POST['responsavel_nascimento'] ); ?>">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-6">

                    <div class="form-field-default">

                        <label>Tipo de documento:</label>
                        <div class="fake-select">
                          <i class="lni lni-chevron-down"></i>
                          <select id="input-documento_tipo" name="responsavel_documento_tipo">
                            <option></option>
                            <?php for( $x = 0; $x < count( $numeric_data['documento_tipo'] ); $x++ ) { ?>
                            <option value="<?php echo $numeric_data['documento_tipo'][$x]['value']; ?>" <?php if( $_POST['responsavel_documento_tipo'] == $numeric_data['documento_tipo'][$x]['value'] ) { echo 'SELECTED'; }; ?>><?php echo $numeric_data['documento_tipo'][$x]['name']; ?></option>
                            <?php } ?>
                          </select>
                          <div class="clear"></div>
                      </div>

                    </div>

                  </div>

                  <div class="col-md-6">

                    <div class="form-field-default">

                        <label>Nº do documento:</label>
                        <input type="text" id="input-documento" name="responsavel_documento" placeholder="Nº do documento" value="<?php echo htmlclean( $_POST['responsavel_documento'] ); ?>">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="title-line mt-0 pd-0">
                      <i class="lni lni-user"></i>
                      <span>Login</span>
                      <div class="clear"></div>
                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>E-mail</label>
                        <input type="text" name="email" placeholder="E-mail" value="<?php echo htmlclean( $_POST['email'] ); ?>">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-6 col-sm-6 col-xs-6">

                    <div class="form-field-default">

                        <label>Senha</label>
                        <input type="password" name="pass" placeholder="******">

                    </div>

                  </div>

                  <div class="col-md-6 col-sm-6 col-xs-6">

                    <div class="form-field-default">

                        <label>Redigite</label>
                        <input type="password" name="repass" placeholder="******">

                    </div>

                  </div>

                </div>

                <div class="row">

                  <div class="col-md-12">

                    <div class="form-field-default">

                        <label>Termos de uso</label>
                        <textarea rows="8" DISABLED><?php include('../../termos.txt'); ?></textarea>
                        <br/><br/>

                        <div class="form-field-terms">
                          <label>Código de indicação ( opcional )</label>   
                          <span class="form-tip">O código é o e-mail da pessoa que te indicou, por acaso não apareça abaixo, digite-o ou se não tem deixe em branco</span>
                          <input type="text" name="afiliado" placeholder="Digite o e-mail de indicação" value="<?php echo htmlclean( $afiliado ); ?>"/>
                          <input type="hidden" name="formdata" value="1"/>
                          <input type="radio" name="terms" value="1" <?php if( $_POST['terms'] ){ echo 'CHECKED'; }; ?>> Eu aceito os termos de uso
                        </div>

                        <div class="ocaptcha">
                          <div class="g-recaptcha form-field" data-sitekey="<?php echo $recaptcha_sitekey; ?>"></div>
                        </div>

                    </div>

                  </div>

                </div>

              <!-- / Informações de usuario -->

            </section>

          </div>

      </form>

      <script type="text/javascript" src="https://www.google.com/recaptcha/api.js?hl=pt-BR"></script>

		</div>

		<!-- / Content -->

	</div>

</div>

<?php 
// FOOTER
$system_footer .= "";
include('../../_core/_layout/rdp.php');
include('../../_core/_layout/footer.php');
?>

<script>

  function exibe_cidades() {
    var estado = $("#input-estado").children("option:selected").val();
    $("#input-cidade").html("<option>-- Carregando cidades --</option>");
    $("#input-cidade").load("<?php just_url(); ?>/_core/_ajax/cidades.php?estado="+estado);
  }

  // Autopreenchimento de estado
  $( "#input-estado" ).change(function() {
    exibe_cidades();
  });
  <?php if( $_POST['estado'] ) { ?>
    exibe_cidades();
  <?php } ?>

</script>

<script>

$(document).ready( function() {
          
  var form = $("#the_form");
  form.validate({
      focusInvalid: true,
      invalidHandler: function() {
        alert("Existem campos obrigatórios a serem preenchidos!");
      },
      errorPlacement: function errorPlacement(error, element) { element.after(error); },
      rules:{

        nome: {
            required: true
        },
        descricao: {
            required: true
        },
        segmento: {
            required: true
        },
        estado: {
            required: true
        },
        cidade: {
            required: true
        },
        subdominio: {
            required: true,
            minlength: 2,
            maxlength: 40,
            remote: "<?php just_url(); ?>/_core/_ajax/check_subdominio.php"
        },
        perfil: {
            required: true
        },
        cor: {
            required: true
        },
        pedido_minimo: {
            required: true
        },
        endereco_rua: {
            required: true
        },
        endereco_bairro: {
            required: true
        },
        endereco_numero: {
            required: true
        },
        contato_whatsapp: {
            required: true
        },
        responsavel_nome: {
            required: true
        },
        responsavel_nascimento: {
            required: true
        },
        responsavel_documento_tipo: {
            required: true
        },
        responsavel_documento: {
            required: true
        },
        email: {
            required: true,
            minlength: 4,
            maxlength: 50,
            email: true,
            remote: "<?php just_url(); ?>/_core/_ajax/check_email.php"
        },
        pass: {
            required: true,
            minlength: 6,
            maxlength: 40
        },
        repass: {
            required: true,
            minlength: 6,
            maxlength: 40,
            equalTo: "input[name=pass]"
        },
        terms: {
            required: true
        }

      },
      messages:{

        nome: {
            required: "Esse campo é obrigatório"
        },
        descricao: {
            required: "Esse campo é obrigatório"
        },
        segmento: {
            required: "Esse campo é obrigatório"
        },
        estado: {
            required: "Esse campo é obrigatório"
        },
        cidade: {
            required: "Esse campo é obrigatório"
        },
        subdominio: {
            required: "Esse campo é obrigatório",
            remote: "Subdominio já registrado no sistema, por favor escolha outro!",
            minlength: "Mínimo de 2 caracteres",
            maxlength: "Maximo de 40 caracteres"
        },
        perfil: {
            required: "Obrigatório"
        },
        pedido_minimo: {
            required: "Esse campo é obrigatório"
        },
        endereco_rua: {
            required: "Esse campo é obrigatório"
        },
        endereco_bairro: {
            required: "Esse campo é obrigatório"
        },
        endereco_numero: {
            required: "Esse campo é obrigatório"
        },
        contato_whatsapp: {
            required: "Esse campo é obrigatório"
        },
        responsavel_nome: {
            required: "Esse campo é obrigatório"
        },
        responsavel_nascimento: {
            required: "Esse campo é obrigatório"
        },
        responsavel_documento_tipo: {
            required: "Esse campo é obrigatório"
        },
        responsavel_documento: {
            required: "Esse campo é obrigatório"
        },
        email: {
            required: "Esse campo é obrigatório",
            email: "Por favor escolha um e-mail válido!",
            remote: "E-mail já registrado no sistema, por favor escolha outro!",
            minlength: "Mínimo de 4 caracteres",
            maxlength: "Maximo de 50 caracteres"
        },
        pass: {
            required: "Esse campo é obrigatório",
            minlength: "A senha é muito curta"
        },
        repass: {
            required: "Esse campo é obrigatório",
            minlength: "A senha é muito curta",
            equalTo: "As senhas não coincidem"
        },
        terms: {
            required: "Esse campo é obrigatório"
        }

      }
  });
  $("#wizard-estabelecimento").steps({
      headerTag: "h3",
      bodyTag: "section",
      transitionEffect: "slideLeft",
      enableAllSteps: true,
      transitionEffectSpeed: 600,
      labels: {
        previous: "Anterior",
        next: "Próximo",
        finish: "Cadastrar"
      },
      onStepChanging: function (event, currentIndex, newIndex) {
          form.validate().settings.ignore = ":disabled,:hidden";
          return form.valid();
          $('#the_form').trigger("change");
      },
      onFinishing: function (event, currentIndex){
          form.validate().settings.ignore = ":disabled";
          return form.valid();
          $('#the_form').trigger("change");
      },
      onFinished: function (event, currentIndex){
          form.submit();
      }
  });

});

</script>

<script>
$(document).ready(function() {
    
  // Preview avatar
  $.uploadPreview({
    input_field: "#image-upload",
    preview_box: "#image-preview",
    label_field: "#image-label",
    label_default: "Envie ou arraste",
    label_selected: "Trocar imagem",
    no_label: false
  });

  // Preview capa
  $.uploadPreview({
    input_field: "#image-upload2",
    preview_box: "#image-preview2",
    label_field: "#image-label2",
    label_default: "Envie ou arraste",
    label_selected: "Trocar imagem",
    no_label: false
  });

  $(".subdomain").keyup(function(e) {
    var re = /[^a-zA-Z0-9\-]/;
      var strreplacer = $(this).val();
      strreplacer = strreplacer.replace(re, '');
      strreplacer = strreplacer.toLowerCase();
      $(this).val( strreplacer );
  });

  $( ".elemento-oculto" ).fadeOut(0);

  $(".form-field-radio").click(function() {
    var showlement = $(this).children('input').attr("element-show");
    var hidelement = $(this).children('input').attr("element-hide");
    $( showlement ).fadeIn(100);
    $( hidelement ).fadeOut(100);
    $(this).children('input').prop('checked',true);
  });

  $('#the_form input[type=password]').val('')

  $('.thecolorpicker').spectrum({
    type: "text",
    showPalette: "false",
    showInitial: "true",
    showAlpha: "false",
    cancelText: "Cancelar",
    chooseText: "Escolher"
  });

  $(window).trigger("resize");

  // Autopreenchimento de estado
  $( "#input-estado" ).change(function() {
    var estado = $(this).children("option:selected").val();
    $("#input-cidade").html("<option>-- Carregando cidades --</option>");
    $("#input-cidade").load("<?php just_url(); ?>/_core/_ajax/cidades.php?estado="+estado+"&cidade=<?php echo htmlclean( $_POST['cidade'] ); ?>");
  });

  $( "#input-estado" ).trigger("change");

  $(".maskdate").mask("99/99/9999",{placeholder:""});
  $(".maskrg").mask("99999999-99",{placeholder:""});
  $(".maskcpf").mask("999.999.999-99",{placeholder:""});
  $(".maskcnpj").mask("99.999.999/9999-99",{placeholder:""});
  $(".maskcel").mask("(99) 99999-9999");
  $(".maskcep").mask("99999-999");
  $(".dater").mask("99/99/9999");
  $(".masktime").mask("99:99:99");
  $(".maskmoney").maskMoney({
      prefix: "R$ ",
      decimal: ",",
      thousands: "."
  });


});

</script>

<script src="<?php just_url(); ?>/_core/_cdn/cep/cep.js"></script>