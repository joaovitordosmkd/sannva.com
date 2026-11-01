<?php
// CORE
include('../../_core/_includes/config.php');

// RESTRICT
restrict('1');

// SEO
$seo_subtitle = "Dashboard";
$seo_description = "Painel administrativo do sistema";
$seo_keywords = "admin, dashboard, sistema";

// HEADER
$system_header .= "";
include('../_layout/head.php');
include('../_layout/top.php');
include('../_layout/sidebars.php');
include('../_layout/modal.php');

// Processar formulário de notificação (versão original)
if ($_SERVER["REQUEST_METHOD"] == "POST") {
    $titulo = trim($_POST['titulo']);
    $descricao = trim($_POST['descricao']);

    if (!empty($titulo) && !empty($descricao)) {
        try {
            // Configurações originais do banco de dados para notificações
            $host = 'localhost';
            $dbname = 'catalag1_not2025';
            $user = 'catalag1_not2025';
            $pass = '$xaPGfJRaDs$';

            $pdo = new PDO("mysql:host=$host;dbname=$dbname", $user, $pass);
            $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

            // Usando a estrutura original da tabela (com 'descricao' em vez de 'mensagem')
            $sql = "INSERT INTO notificacoes (titulo, descricao, data_criacao) VALUES (?, ?, NOW())";
            $stmt = $pdo->prepare($sql);
            $stmt->execute([$titulo, $descricao]);

            header("Location: index.php?sucesso=1");
            exit();
        } catch (PDOException $e) {
            $error_message = "Erro no banco de dados: " . $e->getMessage();
        }
    } else {
        $error_message = "Por favor, preencha todos os campos obrigatórios.";
    }
}

global $db_con;

// Obter dados de localização
$queryestados = mysqli_query($db_con, "SELECT * FROM estados WHERE id = $estop");
$dataest = mysqli_fetch_array($queryestados);

$querycidades = mysqli_query($db_con, "SELECT * FROM cidades WHERE id = $cidop");
$datacid = mysqli_fetch_array($querycidades);

// Consultar links
$links = [];
$link_types = ['video', 'wppmkt', 'video_landing'];
foreach ($link_types as $type) {
    $query = mysqli_query($db_con, "SELECT link FROM link WHERE nome='$type'");
    $data = mysqli_fetch_array($query);
    $links[$type] = $data ? $data['link'] : '';
}

// Função para atualizar links
function atualizar_link($db_con, $tipo_link) {
    $link = 'link_'.$tipo_link;
    $link = isset($_GET[$link]) ? mysqli_real_escape_string($db_con, $_GET[$link]) : null;
    $querylink = mysqli_query($db_con, "SELECT link FROM link WHERE nome='$tipo_link'");
    $datalink = mysqli_fetch_array($querylink);

    if($datalink) {
        mysqli_query($db_con, "UPDATE link SET link = '$link' WHERE nome = '$tipo_link'");
    } else {
        mysqli_query($db_con, "INSERT INTO link (nome, link) VALUES ('$tipo_link', '$link')");
    }
    
    header("Location: index.php?msg=sucesso");
    exit();
}

// Processar atualizações de links
foreach ($link_types as $type) {
    if(isset($_GET['set_'.$type])) {
        atualizar_link($db_con, $type);
    }
}

// Mensagens de alerta
if(isset($_GET['msg'])) {
    if($_GET['msg'] == "erro") { 
        modal_alerta("Erro, tente novamente mais tarde!","erro"); 
    } elseif($_GET['msg'] == "sucesso") {
        modal_alerta("Alteração realizada com sucesso!","sucesso");
    }
}


// Criar modais
//criar_modal('video', '🎬 Vídeo Aulas Ajudar', $links['video']);
//criar_modal('wppmkt', '💬 WhatsApp Marketing', $links['wppmkt']);
//criar_modal('video_landing', '🎥 ID do Vídeo da Página de Vendas', $links['video_landing']);
?>




<script>
$(document).ready(function() {
    // Adicionar eventos aos botões salvar (corrigido)
    ['video', 'wppmkt', 'video_landing'].forEach(function(tipo_link) {
        $('#botao_salvar_' + tipo_link).click(function() {
            var link = $('#link_' + tipo_link).val();
            var url = "<?php echo admin_url(); ?>/inicio/?link_" + tipo_link + "=" + encodeURIComponent(link) + "&set_" + tipo_link + "=true";
            window.location.href = url;
        });
    });
});
</script>




<style>
    /* Estilos corrigidos e melhorados */
    .header-dashboard {
        display: flex;
        flex-direction: column;
        align-items: center;
        text-align: center;
        margin-bottom: 20px;
    }
    
    @media (min-width: 768px) {
        .header-dashboard {
            flex-direction: row;
            justify-content: space-between;
            align-items: center;
            text-align: left;
        }
    }
    
    .btn-whatsapp {
        background-color: #25D366;
        color: white;
        font-weight: bold;
        border-radius: 50px;
        padding: 10px 20px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        margin-top: 10px;
    }
    
    @media (min-width: 768px) {
        .btn-whatsapp {
            margin-top: 0;
        }
    }
    
    .btn-whatsapp:hover {
        background-color: #128C7E;
        color: white;
        transform: translateY(-2px);
        box-shadow: 0 4px 8px rgba(0,0,0,0.2);
    }
    
    .card-menu {
        border: none;
        border-radius: 10px;
        transition: all 0.3s;
        margin-bottom: 15px; /* Reduzido de 20px para 15px */
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        background-color: white;
    }
    
    .card-menu:hover {
        transform: translateY(-5px);
        box-shadow: 0 5px 15px rgba(0,0,0,0.2);
    }
    
    .card-menu a {
        text-decoration: none;
        color: #333;
        display: block;
        padding: 15px; /* Reduzido de 20px para 15px */
    }
    
    .menu-title {
        font-weight: bold;
        font-size: 16px;
        margin-bottom: 5px;
    }
    
    .menu-desc {
        font-size: 13px;
        color: #666;
        margin-bottom: 5px; /* Adicionado para melhor espaçamento */
    }
    
    .notification-card {
        border-radius: 10px;
        box-shadow: 0 2px 10px rgba(0,0,0,0.1);
        background-color: white;
        margin-top: 15px; /* Espaçamento acima do card de notificação */
    }
    
    .notification-header {
        background-color: #4e73df;
        color: white;
        border-radius: 10px 10px 0 0 !important;
        padding: 12px 15px; /* Ajuste no padding */
    }
    
    .form-control {
        border-radius: 5px;
        padding: 10px;
        border: 1px solid #ddd;
        margin-bottom: 10px; /* Espaçamento entre campos */
    }
    
    .btn-primary {
        background-color: #4e73df;
        border: none;
        border-radius: 50px;
        padding: 10px 25px;
        font-weight: bold;
        margin-top: 10px; /* Espaçamento acima do botão */
    }
    
    .btn-primary:hover {
        background-color: #2e59d9;
    }
    
    .modal-footer .btn-secondary {
        background-color: #6c757d;
    }
    
    .modal-footer .btn {
        color: white !important;
    }
    
    /* Novos estilos para o rodapé */
    .footer-dashboard {
        text-align: center;
        padding: 15px 0;
        margin-top: 20px;
        border-top: 1px solid #eee;
        color: #666;
        font-size: 12px;
        width: 100%;
    }
    
    /* Espaçamento entre seções */
    .section-spacing {
        margin-bottom: 15px;
    }
 .footer-wrapper {
    width: 100%;
    background-color: #2f54eb; /* ou a cor que quiser */
    color: white;
    text-align: center;
    font-weight: 500;
    font-size: 14px;
    padding: 10px;
    margin-top: 40px; /* Espaço entre rodapé e a seção de cima */
    box-sizing: border-box;
}

body {
    margin: 0;
    padding: 0;
    min-height: 100vh;
    display: flex;
    flex-direction: column;
}

.main-content {
    flex: 1;
}

</style>




<div class="middle minfit bg-gray"> 
    <div class="container">
        <!-- Cabeçalho centralizado e responsivo -->
        <div class="row mb-4">
            <div class="col-md-12">
                <div class="header-dashboard d-flex justify-content-between align-items-center flex-wrap">
                    <h3 class="mb-2 mb-md-0">
                        <strong>📊 Dashboard - Admin <?php echo $datacid['nome']; ?> <?php echo $dataest['uf']; ?></strong>
                    </h3>
                    <a href="https://wa.me/0000000000000?text=Ol%C3%A1%20preciso%20de%20ajudar%20com%20o%20sistema%3F" target="_blank" class="btn btn-success">
                        📞 Chamar Suporte
                    </a>
                </div>
                <hr>
            </div>
        </div>



        <!-- Cards de Navegação -->
        <div class="row">
            <?php if($oper == 1): ?>
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/usuarios">
                        <div class="menu-title">👥 Usuários</div>
                        <div class="menu-desc">Gerenciar acessos ao sistema</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>

            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/subdominios">
                        <div class="menu-title">🌐 Subdomínios</div>
                        <div class="menu-desc">Configurar URLs do sistema</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            <?php endif; ?>
            
            <?php if($oper == 2): ?>
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/segmentos">
                        <div class="menu-title">🏷️ Segmentos</div>
                        <div class="menu-desc">Categorias de estabelecimentos</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/estabelecimentos">
                        <div class="menu-title">🏢 Estabelecimentos</div>
                        <div class="menu-desc">Cadastro de lojas e empresas</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            <?php if($oper == 1): ?>
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/assinaturas">
                        <div class="menu-title">💰 Assinaturas</div>
                        <div class="menu-desc">Planos contratados</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            <?php endif; ?>
            
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/vouchers">
                        <div class="menu-title">🎫 Vouchers</div>
                        <div class="menu-desc">Cupons de desconto</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            <?php if($oper == 1): ?>
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/planos">
                        <div class="menu-title">📋 Planos</div>
                        <div class="menu-desc">Tipos de assinatura</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            
            
            <?php endif; ?>
            
            <!-- Links Especiais -->
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="#" data-toggle="modal" data-target="#modalvideo">
                        <div class="menu-title">🎬 Vídeo Aulas</div>
                        <div class="menu-desc">Tutoriais do sistema</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="#" data-toggle="modal" data-target="#modalwppmkt">
                        <div class="menu-title">💬 WhatsApp Marketing</div>
                        <div class="menu-desc">Links de contato</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="<?php admin_url(); ?>/marketplace">
                        <div class="menu-title">🛒 Marketplaces</div>
                        <div class="menu-desc">Todas As Lojas Do SIstema</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
            
            
            <div class="col-md-4">
                <div class="card card-menu">
                    <a href="#" data-toggle="modal" data-target="#modalvideo_landing">
                        <div class="menu-title">🎥 ID do Vídeo</div>
                        <div class="menu-desc">Configuração de vendas</div>
                        <div class="text-right"><i class="lni lni-chevron-right"></i></div>
                    </a>
                </div>
            </div>
        </div>
        
        
        
        
        

        <!-- Seção de Notificações (versão original) -->
        <div class="row mt-5">
            <div class="col-md-12">
                <div class="card notification-card">
                    <div class="card-header notification-header">
                        <h4 class="mb-0"><strong>🔔 Enviar Notificação</strong></h4>
                    </div>
                    <div class="card-body">
                        <?php if(isset($error_message)): ?>
                            <div class="alert alert-danger"><?php echo $error_message; ?></div>
                        <?php endif; ?>
                        
                        <form method="POST" action="">
                            <div class="form-group">
                                <label for="titulo"><strong>📌 Título:</strong></label>
                                <input type="text" id="titulo" name="titulo" class="form-control" required>
                            </div>
                            <div class="form-group">
                                <label for="descricao"><strong>✉️ Descrição:</strong></label>
                                <textarea id="descricao" name="descricao" class="form-control" rows="3" required></textarea>
                            </div>
                            <button type="submit" class="btn btn-primary">
                                <strong>📤 Enviar Notificação</strong>
                            </button>
                        </form>
                    </div>
                </div>
            </div>
        </div>

   
   
   
<?php
// ... [mantenha todo o código PHP anterior] ...

// Função para criar modais (versão corrigida)
function criar_modal($id_modal, $titulo, $link) {
    echo '
    <div id="modal'.$id_modal.'" class="modal fade" role="dialog">
        <div class="modal-dialog">
            <div class="modal-content">
                <div class="modal-header bg-primary text-white">
                    <h4 class="modal-title">'.$titulo.'</h4>
                    <button type="button" class="close text-white" data-dismiss="modal">&times;</button>
                </div>
                <form method="GET" action="">
                    <div class="modal-body">
                        <div class="form-group">
                            <label for="link_'.$id_modal.'"><b>URL:</b></label>
                            <input type="text" id="link_'.$id_modal.'" name="link_'.$id_modal.'" class="form-control" value="'.$link.'">
                            <input type="hidden" name="set_'.$id_modal.'" value="true">
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-dismiss="modal">
                            <span style="color: white;">Fechar</span>
                        </button>
                        <button type="submit" class="btn btn-primary">
                            <span style="color: white;">Salvar</span>
                        </button>
                    </div>
                </form>
            </div>
        </div>
    </div>
    ';
}

// Criar modais
criar_modal('video', '🎬 Vídeo Aulas Ajudar', $links['video']);
criar_modal('wppmkt', '💬 WhatsApp Marketing', $links['wppmkt']);
criar_modal('video_landing', '🎥 ID do Vídeo da Página de Vendas', $links['video_landing']);
?>



<body>
    <div class="main-content">
        <!-- Seu conteúdo do sistema aqui -->
    </div>

    <div class="footer-wrapper">
        COPYRIGHT DETALHE DIGITAL! 2025 – TODOS OS DIREITOS RESERVADOS
    </div>
</body>


<!-- Mantenha estas inclusões -->
<?php 
// FOOTER
$system_footer .= "";
include('../_layout/rdp2.php');
include('../_layout/footer.php');
?>