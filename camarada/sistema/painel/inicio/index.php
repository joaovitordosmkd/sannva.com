<?php
// CORE - Inclusão dos arquivos de configuração básicos
include('../../_core/_includes/config.php');
include('../../_core/_includes/fast_config.php');

// RESTRICT - Restrição de acesso apenas para estabelecimentos logados
restrict_estabelecimento();

// SEO - Configurações para otimização de mecanismos de busca
$seo_subtitle = "Início";
$seo_description = "";
$seo_keywords = "";

// HEADER - Inclusão dos componentes de layout
$system_header .= "";
include('../_layout/head.php');
include('../_layout/top.php');
include('../_layout/sidebars.php');
include('../_layout/modal.php');

// Variáveis globais
$id = $_SESSION['estabelecimento']['id'];
$expiracao = $_SESSION['estabelecimento']['expiracao'];

// Obtenção dos dados do estabelecimento
$queryestabelecimento = mysqli_query($db_con, "SELECT * FROM estabelecimentos WHERE id = '$id' LIMIT 1");
$dataestabelecimento = mysqli_fetch_array($queryestabelecimento);
$idcidade = $dataestabelecimento['cidade'];

// Definir cor primária baseada na cor padrão do estabelecimento
$cor_primaria = $dataestabelecimento['cor1'] ?: ($dataestabelecimento['cor'] ?: '#4e73df');
$cor_secundaria = $dataestabelecimento['cor2'] ?: '#2e59d9';

// Função para atualizar os links no banco de dados
function atualizar_link($db_con, $tipo_link) {
    $link = 'link_'.$tipo_link;
    $link = isset($_GET[$link]) ? mysqli_real_escape_string($db_con, $_GET[$link]) : null;
    $querylink = mysqli_query($db_con, "SELECT link FROM link WHERE nome='$tipo_link'");
    $datalink = mysqli_fetch_array($querylink);

    if($datalink) {
        // Se $datalink não estiver vazio, atualiza o registro
        if(mysqli_query($db_con, "UPDATE link SET link = '$link' WHERE nome = '$tipo_link'")) {
            header("Location: index.php?msg=sucesso");
        }
    } else {
        // Se $datalink estiver vazio, insere um novo registro
        if(mysqli_query($db_con, "INSERT INTO link (nome, link) VALUES ('$tipo_link', '$link')")) {
            header("Location: index.php?msg=sucesso");
        }
    }
}
?>

<!-- Script para gerenciamento dos modais -->
<script>
// Função para adicionar evento de clique ao botão salvar
function adicionar_evento(tipo_link) {
    document.getElementById('botao_salvar_'+tipo_link).addEventListener('click', function(e) {
        e.preventDefault();
        var link = document.getElementById('link_'+tipo_link).value;
        var url = "<?php echo panel_url(); ?>/inicio/?link_" + tipo_link + "=" + encodeURIComponent(link) + "&set_" + tipo_link + "=true";
        console.log(url);
        window.location.href = url;
    });
}

// Adicionando eventos aos botões salvar
adicionar_evento('duvida');
</script>

<?php
// Obtenção de dados de usuário da cidade
$queryusr = mysqli_query($db_con, "SELECT * FROM users_data WHERE cidade = '$idcidade' LIMIT 1");
$hasusr = mysqli_num_rows($queryusr);

// Contadores e estatísticas
// Total de vendas
$querytotalvendas = mysqli_query($db_con, "SELECT v_pedido, SUM(v_pedido) AS soma1 FROM pedidos WHERE rel_estabelecimentos_id = '$id' AND status = '2'");
$datatotalvendas = mysqli_fetch_array($querytotalvendas);

// Total de pedidos
$querypedidos = mysqli_query($db_con, "SELECT id FROM pedidos WHERE rel_estabelecimentos_id = '$id'");
$datapedidos = mysqli_num_rows($querypedidos);

// Total de vendas do mês atual
$mesatual = date("m");
$querytotalvendasm = mysqli_query($db_con, "SELECT v_pedido, SUM(v_pedido) AS soma2 FROM pedidos WHERE MONTH(data_hora) = '$mesatual' AND rel_estabelecimentos_id = '$id' AND status = '2'");
$datatotalvendasm = mysqli_fetch_array($querytotalvendasm);

// Alertas e mensagens para o usuário
if(isset($_GET['msg'])) {
    if($_GET['msg'] == "inativo") {
        modal_alerta("Seu plano encontrasse inativo, contrate um novo plano para continuar a usar os serviços!","erro");
    }

    if($_GET['msg'] == "funcaodesativada") {
        modal_alerta("Seu plano não tem acesso a essa funcionalidade, contrate um correspondente verificando a aba meu plano!","erro");
    }

    if($_GET['msg'] == "bemvindo") {
        modal_alerta("Seu catálogo foi criado com sucesso. Aproveite o seu período de testes!<br/><br/>Ao final do período você deve escolher um plano para continuar utilizando o sistema.","sucesso");
    }
}

// Lógica para aviso de expiração do plano
$expiration_msg = '';
if ($expiracao <= 15) {
    if ($expiracao <= 0) {
        $expiration_msg = "Seu plano expirou! Para continuar utilizando os serviços, por favor, renove seu plano.";
    } else {
        $plural = ($expiracao == 1) ? '' : 's';
        $expiration_msg = "Atenção! Seu plano expira em <strong>" . $expiracao . " dia" . $plural . "</strong>. Renove para evitar interrupções.";
    }
}
?>

<!-- Estilos CSS para o Dashboard -->
<style>
  html, body {
    margin: 0;
    padding: 0;
    height: 100%;
  }
  .middle.home-middle.minfit.bg-gray {
    min-height: auto !important;
    padding-top: 0 !important; /* Remover espaço acima do header */
    margin-top: 0 !important;  /* Remover margem acima do header */
  }
  
  /* Variáveis de cores baseadas nas cores do estabelecimento */
  :root {
    --cor-primaria: <?php echo $cor_primaria; ?>;
    --cor-secundaria: <?php echo $cor_secundaria; ?>;
    --cor-texto: #333;
    --cor-fundo: #f8f9fc;
    --cor-card: #fff;
    --sombra: 0 4px 20px rgba(0, 0, 0, 0.08);
  }
  
  /* Estilos do dashboard principal */
  body {
    font-family: 'Segoe UI', Roboto, sans-serif;
    background-color: var(--cor-fundo);
    color: var(--cor-texto);
    margin: 0;
    padding: 20px;
  }
  
  .container {
    max-width: 1400px;
    margin: 0 auto;
    padding-top: 0 !important; /* Remover espaço extra acima do header */
  }
  
  .header {
    text-align: center;
    margin-bottom: 30px; /* Reduzido de 30px para 15px */
  }
  
  .header h1 {
    color: var(--cor-primaria);
    font-size: 2.2rem;
    margin-bottom: 10px;
  }
  
  .dashboard-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 20px;
    margin-bottom: 30px;
  }
  
  .card {
    background: var(--cor-card);
    border-radius: 12px;
    padding: 20px;
    box-shadow: var(--sombra);
    transition: all 0.3s ease;
    position: relative;
    overflow: hidden;
  }
  
  .card:hover {
    transform: translateY(-5px);
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.12);
  }
  
  .card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    width: 5px;
    height: 100%;
    background: var(--cor-primaria);
  }
  
  /* Cores para os diferentes tipos de cards */
  .card-important { border-left: 5px solid #e74a3b; }
  .card-success { border-left: 5px solid #1cc88a; }
  .card-warning { border-left: 5px solid #f6c23e; }
  .card-info { border-left: 5px solid #36b9cc; }
  
  .card-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 15px;
    display: flex;
    align-items: center;
  }
  
  .card-title span { margin-left: 10px; }
  
  .card-content {
    font-size: 1.8rem;
    font-weight: 700;
    margin-bottom: 10px;
  }
  
  .card-subtext {
    font-size: 0.9rem;
    color: #6c757d;
  }
  
  /* Estilos para os badges de status */
  .status-badge {
    display: inline-block;
    padding: 5px 10px;
    border-radius: 20px;
    font-size: 0.8rem;
    font-weight: 600;
    margin-top: 10px;
  }
  
  .status-open {
    background-color: rgba(28, 200, 138, 0.1);
    color: #1cc88a;
  }
  
  .status-closed {
    background-color: rgba(231, 74, 59, 0.1);
    color: #e74a3b;
  }
  
  /* Grid de menu de navegação */
  .menu-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
    gap: 20px;
    margin-top: 30px;
  }
  
  .menu-card {
    background: var(--cor-card);
    border-radius: 12px;
    padding: 20px;
    box-shadow: var(--sombra);
    transition: all 0.3s ease;
    text-align: center;
    cursor: pointer;
    border: 1px solid #e3e6f0;
  }
  
  .menu-card:hover {
    transform: translateY(-3px);
    box-shadow: 0 8px 20px rgba(0, 0, 0, 0.1);
    border-color: var(--cor-primaria);
  }
  
  .menu-icon {
    font-size: 2.5rem;
    margin-bottom: 15px;
    display: inline-block;
    transition: transform 0.3s ease;
  }
  
  .menu-card:hover .menu-icon {
    transform: scale(1.1);
  }
  
  .menu-title {
    font-size: 1.1rem;
    font-weight: 600;
    margin-bottom: 5px;
  }
  
  .menu-counter {
    background: var(--cor-primaria);
    color: white;
    border-radius: 50%;
    width: 25px;
    height: 25px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    font-size: 0.8rem;
    margin-left: 5px;
  }
  
  /* Estilos para o painel de alertas */
  .alert-panel {
    background: #fff8e1;
    border-left: 5px solid #ffc107;
    padding: 15px;
    border-radius: 8px;
    margin-bottom: 30px;
    display: flex;
    align-items: center;
  }
  
  .alert-icon {
    font-size: 1.5rem;
    margin-right: 15px;
    color: #ffc107;
  }
  
  .alert-content { flex: 1; }
  
  .alert-action { margin-left: 15px; }
  
  .alert-action a {
    background: var(--cor-primaria);
    color: white;
    padding: 8px 15px;
    border-radius: 5px;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.3s;
  }
  
  .alert-action a:hover {
    background: var(--cor-secundaria);
  }
  
  hr {
    border: 0;
    height: 1px;
    background: #e3e6f0;
    margin: 30px 0;
  }
  
  /* Responsividade */
  @media (max-width: 768px) {
    .dashboard-grid {
      grid-template-columns: 1fr;
    }
    
    .menu-grid {
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    }
  }
  
  /* Animações */
  @keyframes pulse {
    0% { transform: scale(1); }
    50% { transform: scale(1.05); }
    100% { transform: scale(1); }
  }
  
  .pulse {
    animation: pulse 2s infinite;
  }
  
  /* Efeito de onda ao clicar */
  .ripple {
    position: relative;
    overflow: hidden;
  }
  
  .ripple:after {
    content: "";
    display: block;
    position: absolute;
    width: 100%;
    height: 100%;
    top: 0;
    left: 0;
    pointer-events: none;
    background-image: radial-gradient(circle, #000 10%, transparent 10.01%);
    background-repeat: no-repeat;
    background-position: 50%;
    transform: scale(10, 10);
    opacity: 0;
    transition: transform .5s, opacity 1s;
  }

  /* Estilos para categorias no menu */
  .menu-category {
    margin-bottom: 20px;
  }
  
  .category-title {
    font-size: 1.4rem;
    font-weight: 600;
    color: var(--cor-primaria);
    margin-bottom: 15px;
    padding-bottom: 5px;
    border-bottom: 2px solid var(--cor-primaria);
  }
  
  /* Ajuste do espaçamento entre categorias */
  .menu-category + .menu-category {
    margin-top: 30px;
  }

  /* Adicionando cores da empresa em todos os elementos temáticos */
  .notification-icon .badge {
    background: var(--cor-primaria);
  }
  
  .popup-footer a {
    background-color: var(--cor-primaria);
  }
  
  .popup-footer a:hover {
    background-color: var(--cor-secundaria);
  }
  
  .button {
    background-color: var(--cor-primaria);
  }
  
  .button:hover {
    background-color: var(--cor-secundaria);
  }
  
  /* Melhorar contraste e destaque */
  .menu-counter {
    background: var(--cor-primaria);
  }
  
  #markAsRead {
    background-color: var(--cor-primaria);
    color: white;
    border: none;
    padding: 8px 15px;
    border-radius: 5px;
    cursor: pointer;
  }
  
  #markAsRead:hover {
    background-color: var(--cor-secundaria);
  }

  /* Estilos específicos para a seção de Divulgação */
  .main-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .promotion-container {
    max-width: 1000px;
    width: 100%;
    background-color: #fff5e5;
    padding: 20px;
    margin: 20px;
    border-radius: 10px;
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    gap: 20px;
  }

  .promotion-image {
    flex-shrink: 0;
    width: 150px;
    height: 150px;
    background-image: url('/conheca/assets/img/divulga.png');
    background-size: cover;
    background-position: center;
    border-radius: 10px;
  }

  .promotion-content {
    flex: 1;
    text-align: left;
  }

  .header-text {
    font-size: 22px;
    font-weight: bold;
    margin-bottom: 15px;
    color: #333;
  }

  .content-text {
    font-size: 16px;
    line-height: 1.5;
    color: #555;
    margin-bottom: 20px;
  }

  .benefits {
    list-style: none;
    padding: 0;
    margin-bottom: 20px;
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }

  .benefits li {
    display: flex;
    align-items: center;
    font-size: 16px;
    margin-bottom: 10px;
    color: #333;
    width: 48%;
  }

  .benefits li::before {
    content: '✔️';
    margin-right: 8px;
    color: #4CAF50;
  }

  .info-box {
    background-color: #e0f7fa;
    padding: 10px;
    border-radius: 5px;
    font-size: 14px;
    color: #00796b;
    margin-bottom: 20px;
  }

  .button {
    background-color: #ff6f3c;
    color: #fff;
    padding: 12px 25px;
    font-size: 16px;
    font-weight: bold;
    text-align: center;
    border: none;
    border-radius: 5px;
    cursor: pointer;
    transition: background-color 0.3s;
    text-decoration: none;
    display: inline-block;
  }

  .button:hover {
    background-color: #ff5722;
  }

  /* Responsividade */
  @media (max-width: 768px) {
    .promotion-container {
      flex-direction: column;
      text-align: center;
    }

    .promotion-image {
      width: 100%;
      height: 200px;
    }

    .benefits li {
      width: 100%;
    }
  }

  /* Estilos para o botão de status */
  .menu-card.funcionamento {
    padding: 18px;
    cursor: pointer;
    transition: all 0.3s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    min-height: auto; /* Remover altura mínima fixa */
  }
  
  .menu-card.funcionamento.bg-success {
    background-color: #ffffff !important; /* Fundo branco normal para aberto */
  }
  
  .menu-card.funcionamento.bg-danger {
    background-color: rgba(231, 74, 59, 0.1) !important; /* Fundo vermelho claro para fechado */
  }
  
  .status-icon-container {
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 18px;
    width: 100%;
    padding-top: 0; /* Remover padding extra */
    position: relative; /* Para posicionar os ícones de forma absoluta */
  }
  
  .menu-card.funcionamento .open-status {
    display: inline-block;
    width: 22px; /* Aumentado */
    height: 22px; /* Aumentado */
    border-radius: 50%;
    margin-right: 10px;
    vertical-align: middle;
    position: absolute;
    left: 50%;
    margin-left: -70px; /* Deslocamento para a esquerda do centro */
  }
  
  .menu-card.funcionamento .lni-shuffle {
    font-size: 1.3rem; /* Aumentado */
    vertical-align: middle;
    position: absolute;
    right: 50%;
    margin-right: -70px; /* Deslocamento para a direita do centro */
  }
  
  .menu-card.funcionamento .funcionamento-text {
    font-size: 1.4rem; /* Aumentado */
    font-weight: 600;
    margin: 0;
    text-align: center;
    position: relative;
    z-index: 1; /* Garantir que o texto fique acima dos ícones */
  }
  
  /* Ajustes para o modo de carregamento */
  .menu-card.funcionamento .atualizando {
    display: flex;
    justify-content: center;
    align-items: center;
    width: 100%;
    height: auto; /* Auto height instead of fixed */
    padding: 25px 0; /* Add padding to match the normal state height */
  }
  
  .menu-card.funcionamento .atualizando i {
    font-size: 2.5rem; /* Smaller icon to match the container size */
    color: var(--cor-primaria);
  }
</style>

<div class="middle home-middle minfit bg-gray">
  <div class="container">
    <!-- Cabeçalho -->
    <div class="header">
        <h1>👋 Olá, <?php echo $usuario['nome']; ?></h1>
        <p>Bem-vindo ao painel de controle do seu estabelecimento</p>
    </div>

    <!-- Aviso de Expiração do Plano -->
    <?php if (!empty($expiration_msg)): ?>
    <div class="alert-panel ripple">
        <i class="lni lni-warning alert-icon"></i>
        <div class="alert-content"><?php echo $expiration_msg; ?></div>
        <div class="alert-action">
            <a href="<?php panel_url(); ?>/plano">Ver Plano</a>
        </div>
    </div>
    <?php endif; ?>

    <!-- Cards de resumo -->
    <div class="dashboard-grid">
        <!-- Faturamento -->
        <div class="card ripple">
            <div class="card-title">💰 Faturado na Plataforma</div>
            <div class="card-content">R$ <?php print number_format($datatotalvendas['soma1'], 2, ',', '.'); ?></div>
            <div class="card-subtext">Total acumulado</div>
        </div>
        
        <!-- Vendas do mês -->
        <div class="card ripple">
            <div class="card-title">📈 Vendas do Mês</div>
            <div class="card-content">R$ <?php print number_format($datatotalvendasm['soma2'], 2, ',', '.'); ?></div>
            <div class="card-subtext"><?php print date("m/Y"); ?></div>
        </div>
        
        <!-- Pedidos do mês -->
        <div class="card ripple">
            <div class="card-title">📦 Pedidos do Mês</div>
            <div class="card-content"><?php print $datapedidos; ?></div>
            <div class="card-subtext"><?php print date("m/Y"); ?></div>
        </div>
    </div>

    <hr>

    <!-- MENU PRINCIPAL - Categoria 1 -->
    <div class="menu-category">
        <h2 class="category-title">📋 Menu Principal</h2>
        <div class="menu-grid">
            <!-- Pedidos -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/pedidos'">
                <div class="menu-icon">📋</div>
                <div class="menu-title">Pedidos 
                    <?php if(isset($_SESSION['estabelecimento']['status']) && $_SESSION['estabelecimento']['status'] == "1"): ?>
                        <span class="menu-counter"><?php echo counter($_SESSION['estabelecimento']['id'], "pedido"); ?></span>
                    <?php endif; ?>
                </div>
                <div class="card-subtext">Ver pedidos realizados</div>
            </div>
            
            <!-- PDV -->
            <div class="menu-card ripple" onclick="window.open('<?php panel_url(); ?>/pdv', '_blank')">
                <div class="menu-icon">💻</div>
                <div class="menu-title">PDV</div>
                <div class="card-subtext">Ponto de Venda</div>
            </div>
            
            <!-- Cupons -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/cupons'">
                <div class="menu-icon">🎫</div>
                <div class="menu-title">Cupons</div>
                <div class="card-subtext">Gerenciar descontos</div>
            </div>
            
            <!-- Relatórios -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/relatorio'">
                <div class="menu-icon">📊</div>
                <div class="menu-title">Relatórios</div>
                <div class="card-subtext">Gerar relatórios</div>
            </div>
        </div>
    </div>

    <!-- CADASTROS - Categoria 2 -->
    <div class="menu-category">
        <h2 class="category-title">📝 Cadastros</h2>
        <div class="menu-grid">
            <!-- Categorias -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/categorias'">
                <div class="menu-icon">🗂️</div>
                <div class="menu-title">Categorias 
                    <span class="menu-counter"><?php echo counter($_SESSION['estabelecimento']['id'], "categoria"); ?></span>
                </div>
                <div class="card-subtext">Gerenciar categorias</div>
            </div>
            
            <!-- Produtos -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/produtos'">
                <div class="menu-icon">🍕</div>
                <div class="menu-title">Produtos 
                    <span class="menu-counter"><?php echo counter($_SESSION['estabelecimento']['id'], "produto"); ?></span>
                </div>
                <div class="card-subtext">Gerenciar cardápio</div>
            </div>
            
            <!-- Banners (condicionais) -->
            <?php if(isset($_SESSION['estabelecimento']['funcionalidade_banners']) && $_SESSION['estabelecimento']['funcionalidade_banners'] == "1"): ?>
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/banners'">
                <div class="menu-icon">🖼️</div>
                <div class="menu-title">Banners 
                    <span class="menu-counter"><?php echo counter($_SESSION['estabelecimento']['id'], "banner"); ?></span>
                </div>
                <div class="card-subtext">Gerenciar banners</div>
            </div>
            <?php endif; ?>
            
            <!-- Formas de Entrega -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/frete'">
                <div class="menu-icon">🚚</div>
                <div class="menu-title">Formas de Entrega</div>
                <div class="card-subtext">Configurar entregas</div>
            </div>

                        <!-- Rastreamento -->
          <div class="menu-card ripple" onclick="window.location='<?php echo panel_url(); ?>/inicio/rastreio.php'">
             <div class="menu-icon">✈️</div>
             <div class="menu-title">Rastreio</div>
             <div class="card-subtext">Rastrear Encomendas</div>
          </div>

            
            <!-- Opções de Entrega (condicional) -->
           <!-- <?php if(isset($dataestabelecimento['outros']) && $dataestabelecimento['outros'] == 1): ?>
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/local'">
                <div class="menu-icon">📍</div>
                <div class="menu-title">Opções de Entrega</div>
                <div class="card-subtext">Configurar áreas</div>
            </div>
            <?php endif; ?>-->
        </div>
    </div>

    <!-- CONFIGURAÇÕES - Categoria 3 -->
    <div class="menu-category">
        <h2 class="category-title">⚙️ Configurações</h2>
        <div class="menu-grid">
            <!-- Meu Plano -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/plano'">
                <div class="menu-icon">💎</div>
                <div class="menu-title">Meu Plano</div>
                <div class="card-subtext">Visualizar detalhes</div>
            </div>
            
            <!-- Configurações -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/configuracoes'">
                <div class="menu-icon">⚙️</div>
                <div class="menu-title">Configurações</div>
                <div class="card-subtext">Ajustes do sistema</div>
            </div>
            
            <!-- Horário de Funcionamento -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/horarios'">
                <div class="menu-icon">🕒</div>
                <div class="menu-title">Horário de Funcionamento</div>
                <div class="card-subtext">Definir horários</div>
            </div>
            
            <!-- Botão de Status da Loja -->
            <?php 
            // Get the status and store in variable for use in multiple conditions
            $horario_status = verifica_horario($id);
            
            // Different behavior based on horario_status
            if ($horario_status == "disabled") {
                // Manual control mode - interactive button
                $funcStatus = data_info("estabelecimentos", $_SESSION['estabelecimento']['id'], "funcionamento");
                $bgClass = ($funcStatus == "1") ? 'bg-success' : 'bg-danger';
                $is_open = ($funcStatus == "1");
                ?>
                <div class="menu-card funcionamento <?php echo $bgClass; ?>" id="funcionamento">
                    <?php if ($is_open) { ?>
                        <div class="aberto">
                            <div class="status-icon-container">
                                <i class="open-status"></i>
                                <span class="funcionamento-text">Aberto</span>
                                <i class="lni lni-shuffle" style="color: #1cc88a;"></i>
                            </div>
                            <div class="menu-title">Estabelecimento disponível</div>
                            <div class="card-subtext">aberto para pedidos</div>
                        </div>
                    <?php } else { ?>
                        <div class="fechado">
                            <div class="status-icon-container">
                                <i class="open-status"></i>
                                <span class="funcionamento-text">Fechado</span>
                                <i class="lni lni-shuffle" style="color: #e74a3b;"></i>
                            </div>
                            <div class="menu-title">Estabelecimento indisponível</div>
                            <div class="card-subtext">fechado para pedidos</div>
                        </div>
                    <?php } ?>
                </div>
            <?php } else if ($horario_status == "open") { 
                // Automatic mode - currently open - informational only
            ?>
                <div class="menu-card funcionamento bg-success">
                    <div class="aberto">
                        <div class="status-icon-container">
                            <i class="open-status"></i>
                            <span class="funcionamento-text">Aberto</span>
                            <i class="lni lni-clock" style="color: #1cc88a;"></i>
                        </div>
                        <div class="menu-title">Conforme Horário</div>
                        <div class="card-subtext">Aberto pelo horário de funcionamento</div>
                    </div>
                </div>
            <?php } else if ($horario_status == "close") { 
                // Automatic mode - currently closed - informational only
            ?>
                <div class="menu-card funcionamento bg-danger">
                    <div class="fechado">
                        <div class="status-icon-container">
                            <i class="open-status"></i>
                            <span class="funcionamento-text">Fechado</span>
                            <i class="lni lni-clock" style="color: #e74a3b;"></i>
                        </div>
                        <div class="menu-title">Conforme Horário</div>
                        <div class="card-subtext">Fechado pelo horário de funcionamento</div>
                    </div>
                </div>
            <?php } ?>
        </div>
    </div>

    <!-- SUPORTE - Categoria 4 -->
    <div class="menu-category">
        <h2 class="category-title">🔧 Suporte e Ferramentas</h2>
        <div class="menu-grid">
            <!-- Suporte Técnico -->
            <?php if(isset($usrtelefone)): ?>
            <div class="menu-card ripple" onclick="window.open('https://wa.me/55<?php print $usrtelefone;?>', '_blank')">
                <div class="menu-icon">💬</div>
                <div class="menu-title">Suporte Técnico</div>
                <div class="card-subtext">Contato via WhatsApp</div>
            </div>
            <?php endif; ?>
            
            <!-- Vídeo Aulas -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/tutoriais'">
                <div class="menu-icon">🎬</div>
                <div class="menu-title">Vídeo Aulas</div>
                <div class="card-subtext">Tutoriais do sistema</div>
            </div>
            
            <!-- QRCode -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/qrcode'">
                <div class="menu-icon">📲</div>
                <div class="menu-title">QRCode da Empresa</div>
                <div class="card-subtext">Acessar QRCode</div>
            </div>
            
            <!-- Integração -->
            <div class="menu-card ripple" onclick="window.location='<?php panel_url(); ?>/integracao'">
                <div class="menu-icon">🔗</div>
                <div class="menu-title">Integração</div>
                <div class="card-subtext">Configurar integrações</div>
            </div>
        </div>
    </div>
    
    
    

<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Painel de Divulgação</title>
    <style>
        /* Prefixo 'tds-' para isolar os estilos */
        .tds-main-content {
            font-family: Arial, sans-serif;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 20px;
            box-sizing: border-box;
        }

        .tds-promotion-container {
            max-width: 1000px;
            width: 100%;
            background-color: #fff5e5;
            padding: 20px;
            margin: 20px 0;
            border-radius: 10px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            display: flex;
            align-items: center;
            gap: 20px;
            box-sizing: border-box;
        }

        .tds-promotion-image {
            flex-shrink: 0;
            width: 150px;
            height: 150px;
            background-image: url('/conheca/assets/img/divulga.png');
            background-size: cover;
            background-position: center;
            border-radius: 10px;
        }

        .tds-promotion-content {
            flex: 1;
            text-align: left;
        }

        .tds-header-text {
            font-size: 22px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #333;
        }

        .tds-content-text {
            font-size: 16px;
            line-height: 1.5;
            color: #555;
            margin-bottom: 20px;
        }

        .tds-benefits {
            list-style: none;
            padding: 0;
            margin-bottom: 20px;
            display: flex;
            flex-wrap: wrap;
            gap: 10px;
        }

        .tds-benefits li {
            display: flex;
            align-items: center;
            font-size: 16px;
            margin-bottom: 10px;
            color: #333;
            width: 48%;
        }

        .tds-benefits li::before {
            content: '✔️';
            margin-right: 8px;
            color: #4CAF50;
        }

        .tds-info-box {
            background-color: #e0f7fa;
            padding: 10px;
            border-radius: 5px;
            font-size: 14px;
            color: #00796b;
            margin-bottom: 20px;
        }

        .tds-button {
            background-color: #ff6f3c;
            color: #fff;
            padding: 12px 25px;
            font-size: 16px;
            font-weight: bold;
            text-align: center;
            border: none;
            border-radius: 5px;
            cursor: pointer;
            transition: background-color 0.3s;
            text-decoration: none;
            display: inline-block;
        }

        .tds-button:hover {
            background-color: #ff5722;
        }

        /* Responsividade */
        @media (max-width: 768px) {
            .tds-promotion-container {
                flex-direction: column;
                text-align: center;
            }

            .tds-promotion-image {
                width: 100%;
                height: 200px;
            }

            .tds-promotion-content {
                text-align: center;
            }

            .tds-benefits li {
                width: 100%;
                justify-content: center;
            }
        }
    </style>
</head>
<body>
    <div class="tds-main-content">
        <div class="tds-promotion-container">
            <!-- Imagem de divulgação -->
            <div class="tds-promotion-image"></div>

            <!-- Conteúdo de divulgação -->
            <div class="tds-promotion-content">
                <div class="tds-header-text">É hora de divulgar sua loja</div>
                <div class="tds-content-text">
                    Aumente as visitas à sua loja com nosso pacote de marketing. Fale com a equipe da Top Dk Soluções Catálogos Online e impulsione seu negócio para atrair potenciais clientes. Destrave seu negócio no digital!
                </div>
                
                <ul class="tds-benefits">
                    <li>Anuncie no Google e no Instagram</li>
                    <li>Tráfego qualificado</li>
                    <li>Campanhas por geolocalização</li>
                    <li>Aproveite sua audiência para remarketing</li>
                    <li>Gerar mais vendas</li>
                    <li>Atualização do perfil no google</li>
                </ul>
                
                <div class="tds-info-box">
                    O Facebook atualmente conta com mais de 2,2 bilhões de usuários ativos e o Instagram com mais de 3 bilhões. Aproveite para divulgar nessas redes.
                </div>
                
                <!-- Botão customizável -->
                <a href="https://api.whatsapp.com/send?phone=+00000000&text=Olá, gostaria de mais informações!" class="tds-button">Desbloquear o digital</a>
            </div>
        </div>
    </div>
</body>
</html>




<?php
// Configurações de conexão com o banco de dados
$host = 'localhost';
$dbname = 'catalag1_not2025';
$user = 'catalag1_not2025';
$pass = '$xaPGfJRaDs$';

try {
    // Conectar ao banco de dados
    $pdo = new PDO("mysql:host=$host;dbname=$dbname", $user, $pass);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

    // Obter o número de notificações não visualizadas
    $stmt = $pdo->prepare("SELECT COUNT(*) AS naoVisualizadas FROM notificacoes WHERE visualizado = FALSE");
    $stmt->execute();
    $resultado = $stmt->fetch(PDO::FETCH_ASSOC);
    $naoVisualizadas = $resultado['naoVisualizadas'] ?? 0;

    // Obter as notificações não visualizadas
    $stmt = $pdo->prepare("SELECT * FROM notificacoes WHERE visualizado = FALSE ORDER BY data_criacao DESC");
    $stmt->execute();
    $notificacoes = $stmt->fetchAll(PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    die("Erro na conexão: " . $e->getMessage());
}
?>




<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Notificações</title>
    <style>
        /* Estilos para o ícone de notificação e a lista de notificações */
        body {
            margin: 0;
            padding: 0;
            font-family: Arial, sans-serif;
        }
        .notification-container {
            position: absolute; /* Mudei para absolute */
            top: 10px; /* Distância do topo */
            right: 10px; /* Distância da direita */
            z-index: 1000; /* Fica acima de outros elementos */
        }
        .notification-icon {
            font-size: 24px;
            cursor: pointer;
            position: relative;
            display: inline-block;
        }
        .notification-icon .badge {
            position: absolute;
            top: -5px;
            right: -10px;
            background: red;
            color: white;
            border-radius: 50%;
            padding: 4px 8px;
            font-size: 12px;
        }
        .notifications-list {
            display: none;
            position: absolute;
            right: 0;
            background: white;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
            width: 300px;
            max-height: 400px;
            overflow-y: auto;
            z-index: 10;
            padding: 10px;
            border-radius: 8px;
        }
        .notifications-list ul {
            list-style-type: none;
            margin: 0;
            padding: 0;
        }
        .notifications-list li {
            padding: 10px;
            border-bottom: 1px solid #ccc;
            cursor: pointer; /* Torna o item clicável */
        }
        .notifications-list li:hover {
            background-color: #f0f0f0; /* Destaque ao passar o mouse */
        }
        .notifications-list h3 {
            margin: 0;
            font-size: 16px;
        }
        .notifications-list p {
            font-size: 14px;
        }

        /* Estilos do Modal */
        .modal {
            display: none; /* Oculto por padrão */
            position: fixed;
            z-index: 1000;
            left: 0;
            top: 0;
            width: 100%;
            height: 100%;
            overflow: auto;
            background-color: rgba(0, 0, 0, 0.4); /* Fundo escuro */
            justify-content: center;
            align-items: center;
        }
        .modal-content {
            background-color: #fefefe;
            margin: auto; /* Centralizado */
            padding: 20px;
            border: 1px solid #888;
            width: 80%;
            max-width: 600px; /* Limite máximo de largura */
            border-radius: 5px;
            box-shadow: 0 4px 8px rgba(0, 0, 0, 0.2);
        }
        .close {
            color: #aaa;
            float: right;
            font-size: 28px;
            font-weight: bold;
        }
        .close:hover,
        .close:focus {
            color: black;
            text-decoration: none;
            cursor: pointer;
        }

        /* Responsividade */
        @media (max-width: 768px) {
            .notification-icon {
                font-size: 20px; /* Tamanho menor em dispositivos menores */
            }
            .notifications-list {
                width: 250px; /* Largura menor em dispositivos menores */
            }
        }
    </style>
</head>
<body>

<div class="notification-container">
    <!-- Ícone de notificação com o número de não visualizadas -->
    <div class="notification-icon" onclick="toggleNotifications()">
        🔔
        <?php if ($naoVisualizadas > 0): ?>
            <span class="badge"><?php echo $naoVisualizadas; ?></span>
        <?php endif; ?>
    </div>

    <!-- Lista de notificações (dropdown) -->
    <div class="notifications-list" id="notifications-list">
        <ul>
            <?php if (!empty($notificacoes)): ?>
                <?php foreach ($notificacoes as $notificacao): ?>
                    <li onclick="openModal(<?php echo $notificacao['id']; ?>, '<?php echo htmlspecialchars($notificacao['titulo']); ?>', '<?php echo htmlspecialchars($notificacao['descricao']); ?>')">
                        <h3><?php echo htmlspecialchars($notificacao['titulo']); ?></h3>
                        <p><?php echo htmlspecialchars($notificacao['descricao']); ?></p>
                        <small><?php echo date('d/m/Y H:i', strtotime($notificacao['data_criacao'])); ?></small>
                    </li>
                <?php endforeach; ?>
            <?php else: ?>
                <li><p>Sem novas notificações.</p></li>
            <?php endif; ?>
        </ul>
    </div>
</div>

<!-- Modal para exibir a notificação -->
<div class="modal" id="notificationModal">
    <div class="modal-content">
        <span class="close" id="closeModal">&times;</span>
        <h2 id="modalTitle">Título da Notificação</h2>
        <p id="modalDescription">Descrição da notificação aqui.</p>
        <button id="markAsRead" style="margin-top: 10px;">Marcar como Lida</button>
    </div>
</div>

<script>
    // Função para alternar a exibição da lista de notificações
    function toggleNotifications() {
        const list = document.getElementById('notifications-list');
        list.style.display = list.style.display === 'block' ? 'none' : 'block';
    }

    // Fechar a lista ao clicar fora dela
    window.onclick = function(event) {
        if (!event.target.matches('.notification-icon') && !event.target.closest('.notifications-list')) {
            const list = document.getElementById('notifications-list');
            list.style.display = 'none';
        }
    }

    // Abrir o modal com detalhes da notificação
    function openModal(id, title, description) {
        document.getElementById('modalTitle').innerText = title;
        document.getElementById('modalDescription').innerText = description;
        document.getElementById('notificationModal').style.display = 'flex'; // Mostra o modal
        toggleNotifications(); // Fecha a lista de notificações

        // Marcar a notificação como lida ao clicar no botão
        document.getElementById('markAsRead').onclick = function() {
            markAsRead(id);
        };
    }

    // Fechar o modal
    document.getElementById('closeModal').onclick = function() {
        document.getElementById('notificationModal').style.display = 'none'; // Oculta o modal
    }

    // Função para marcar a notificação como lida
    function markAsRead(id) {
        // Aqui você deve fazer uma requisição AJAX para atualizar o status da notificação no banco de dados
        const xhr = new XMLHttpRequest();
        xhr.open('POST', 'mark_as_read.php', true);
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.onload = function() {
            if (xhr.status === 200) {
                // Se a notificação foi marcada como lida com sucesso, fecha o modal e atualiza o badge
                document.getElementById('notificationModal').style.display = 'none';
                const badge = document.querySelector('.notification-icon .badge');
                if (badge) {
                    badge.innerText = parseInt(badge.innerText) - 1; // Decrementa o número de notificações
                    if (badge.innerText == 0) {
                        badge.remove(); // Remove o badge se for zero
                    }
                }
            } else {
                alert('Erro ao marcar a notificação como lida.'); // Exibe um alerta em caso de erro
            }
        };
        xhr.send('id=' + id);
    }
</script>


<!-- Script para efeitos -->
<script type="text/javascript">
// Adiciona classe ripple a todos os elementos com a classe ripple
document.querySelectorAll('.ripple').forEach(element => {
    element.addEventListener('click', function(e) {
        // Remove qualquer onda anterior
        let ripple = this.querySelector('.ripple-effect');
        if (ripple) {
            ripple.remove();
        }
        
        // Cria a nova onda
        ripple = document.createElement('span');
        ripple.classList.add('ripple-effect');
        this.appendChild(ripple);
        
        // Posiciona a onda
        let rect = this.getBoundingClientRect();
        let x = e.clientX - rect.left;
        let y = e.clientY - rect.top;
        
        ripple.style.left = `${x}px`;
        ripple.style.top = `${y}px`;
        
        // Remove a onda após a animação
        setTimeout(() => {
            ripple.remove();
        }, 1000);
    });
});

// Atualiza dinamicamente a cor primária quando alterada nas configurações
function updatePrimaryColor(newColor) {
    document.documentElement.style.setProperty('--cor-primaria', newColor);
    // Ajusta a cor secundária para uma variação mais escura
    document.documentElement.style.setProperty('--cor-secundaria', shadeColor(newColor, -20));
}

// Função para escurecer/clarear cores
function shadeColor(color, percent) {
    let R = parseInt(color.substring(1,3), 16);
    let G = parseInt(color.substring(3,5), 16);
    let B = parseInt(color.substring(5,7), 16);

    R = parseInt(R * (100 + percent) / 100);
    G = parseInt(G * (100 + percent) / 100);
    B = parseInt(B * (100 + percent) / 100);

    R = (R<255)?R:255;  
    G = (G<255)?G:255;  
    B = (G<255)?G:255;  

    R = Math.round(R);
    G = Math.round(G);
    B = Math.round(G);

    var RR = ((R.toString(16).length==1)?"0"+R.toString(16):R.toString(16));
    var GG = ((G.toString(16).length==1)?"0"+G.toString(16):G.toString(16));
    var BB = ((B.toString(16).length==1)?"0"+B.toString(16):B.toString(16));

    return "#"+RR+GG+BB;
}
</script>




<?php 
// FOOTER - Inclusão dos arquivos de rodapé
$system_footer .= "";
include('../_layout/rdp.php');
include('../_layout/footer.php');
?>

<script>
$("#funcionamento").click(function() {
    var currentClass = $(this).hasClass('bg-success') ? 'bg-success' : 'bg-danger';
    var newClass = currentClass === 'bg-success' ? 'bg-danger' : 'bg-success';
    
    $(this).html("<div class='atualizando'><i class='lni lni-reload rotating'></i></div>");
    
    // Remove a classe atual e adiciona a nova classe
    $(this).removeClass(currentClass).addClass(newClass);
    
    setTimeout(() => {