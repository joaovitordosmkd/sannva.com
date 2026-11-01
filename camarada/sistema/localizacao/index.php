<?php
// Configuração detalhada de erros
ini_set('display_errors', 1);
ini_set('display_startup_errors', 1);
error_reporting(E_ALL);

// Dados de conexão DIRETOS no código (como você solicitou)
$db_host = "localhost";
$db_user = "tecautov_sistema";
$db_pass = "hevRQ6#Ur]6R";
$db_name = "tecautov_sistema";

// Conexão com tratamento robusto de erros
try {
    $db = new mysqli($db_host, $db_user, $db_pass, $db_name);
    
    if ($db->connect_error) {
        throw new Exception("Falha na conexão: " . $db->connect_error);
    }
    
    $db->set_charset("utf8mb4");
    
} catch (Exception $e) {
    die("<div style='padding:20px;background:#ffebee;border:2px solid #f44336;margin:20px;'>
            <h2>Erro de Banco de Dados</h2>
            <p><strong>Mensagem:</strong> {$e->getMessage()}</p>
            <p>Verifique as credenciais e a conexão com o MySQL.</p>
        </div>");
}

// --- INÍCIO: Definição de $simple_url (Exemplo) ---
// Certifique-se de que $simple_url esteja definida ANTES de usá-la.
// Se ela vem de um arquivo de configuração, inclua-o aqui.
// Exemplo de como ela PODE ser definida (adapte à sua realidade):
if (!isset($simple_url)) { // Evita redefinir se já existir
    // Tenta obter do host HTTP, removendo 'www.' se presente
    $host = $_SERVER['HTTP_HOST'] ?? 'dominio-padrao.com'; // Use um padrão se não houver host
    $simple_url = preg_replace('/^www\./', '', $host);
    // Você pode precisar de uma lógica mais robusta dependendo dos seus domínios
}
// --- FIM: Definição de $simple_url (Exemplo) ---

// --- INÍCIO: Configurações de SEO ---
$seo_title = "Marketplace - Encontre Lojas Online na Sua Região";
$seo_description = "Explore uma variedade de lojas e estabelecimentos locais em nosso marketplace. Encontre produtos e serviços perto de você.";
$seo_keywords = "marketplace, lojas online, compras locais, estabelecimentos, comércio local, " . $simple_url; // Adiciona o domínio base às keywords
$seo_og_image = "https://{$simple_url}/_core/_cdn/img/og-image-padrao.jpg"; // Crie uma imagem padrão para compartilhamento social
$seo_canonical_url = "https://{$_SERVER['HTTP_HOST']}{$_SERVER['REQUEST_URI']}"; // URL canônica da página atual
// --- FIM: Configurações de SEO ---

// 1. Consulta DEBUG para verificar se há estabelecimentos
$debug_query = $db->query("SELECT COUNT(*) as total FROM estabelecimentos");
$total_estab = $debug_query->fetch_assoc()['total'];

// 2. Consulta DEBUG para verificar estabelecimentos ativos
$debug_query = $db->query("SELECT COUNT(*) as total FROM estabelecimentos WHERE status = '1' AND excluded != '1'");
$total_estab_ativos = $debug_query->fetch_assoc()['total'];

// Consulta OTIMIZADA para estabelecimentos
$estabelecimentos = [];
$query_estab = "SELECT id, nome, cidade, subdominio, perfil, descricao, segmento 
               FROM estabelecimentos 
               WHERE status = '1' AND excluded != '1'
               ORDER BY nome ASC LIMIT 50";

$result = $db->query($query_estab);

if ($result) {
    while ($row = $result->fetch_assoc()) {
        // Define o domínio base (com ou sem subdomínio) usando $simple_url
        $baseUrl = !empty($row['subdominio'])
            ? "https://{$row['subdominio']}.{$simple_url}" // Usa subdomínio + domínio principal
            : "https://{$simple_url}"; // Usa apenas o domínio principal

        // URL amigável para o botão/link da loja
        $row['url'] = !empty($row['subdominio'])
            ? $baseUrl // Usa https://subdominio.dominio-principal.com
            : "{$baseUrl}/loja/{$row['id']}"; // Usa https://dominio-principal.com/loja/id

        // Imagem do estabelecimento (logo) - Usando $baseUrl e o caminho correto /_core/_uploads/
        if (!empty($row['perfil'])) {
            // Assume que $row['perfil'] contém o caminho relativo a partir de _uploads ou apenas o nome do arquivo
            // Se $row['perfil'] já contiver algo como '186/2023/02/arquivo.png', funcionará.
            // Se contiver apenas 'arquivo.png', você pode precisar adicionar a estrutura de pastas aqui se ela for fixa.
            $row['logo'] = "{$baseUrl}/_core/_uploads/{$row['perfil']}"; // Caminho corrigido
        } else {
            // Imagem padrão (usando o domínio principal como base)
            $row['logo'] = "https://{$simple_url}/_core/_cdn/img/no-image.png"; // Caminho da imagem padrão mantido
        }

        $estabelecimentos[] = $row;
    }
}
?>
<!DOCTYPE html>
<html lang="pt-BR">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <!-- SEO Meta Tags -->
    <title><?php echo htmlspecialchars($seo_title); ?></title>
    <meta name="description" content="<?php echo htmlspecialchars($seo_description); ?>">
    <meta name="keywords" content="<?php echo htmlspecialchars($seo_keywords); ?>">
    <link rel="canonical" href="<?php echo htmlspecialchars($seo_canonical_url); ?>" />

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="<?php echo htmlspecialchars($seo_canonical_url); ?>">
    <meta property="og:title" content="<?php echo htmlspecialchars($seo_title); ?>">
    <meta property="og:description" content="<?php echo htmlspecialchars($seo_description); ?>">
    <meta property="og:image" content="<?php echo htmlspecialchars($seo_og_image); ?>">

    <!-- Twitter -->
    <meta property="twitter:card" content="summary_large_image">
    <meta property="twitter:url" content="<?php echo htmlspecialchars($seo_canonical_url); ?>">
    <meta property="twitter:title" content="<?php echo htmlspecialchars($seo_title); ?>">
    <meta property="twitter:description" content="<?php echo htmlspecialchars($seo_description); ?>">
    <meta property="twitter:image" content="<?php echo htmlspecialchars($seo_og_image); ?>">
    <!-- Fim SEO Meta Tags -->

    <!-- Favicon -->
    <link rel="icon" type="image/png" href="https://<?php echo $simple_url; ?>/_core/_cdn/img/favicon.png">
    <!-- Para outros tipos de favicon (opcional): -->
    <!-- <link rel="apple-touch-icon" sizes="180x180" href="https://<?php echo $simple_url; ?>/_core/_cdn/img/apple-touch-icon.png"> -->
    <!-- <link rel="icon" type="image/png" sizes="32x32" href="https://<?php echo $simple_url; ?>/_core/_cdn/img/favicon-32x32.png"> -->
    <!-- <link rel="icon" type="image/png" sizes="16x16" href="https://<?php echo $simple_url; ?>/_core/_cdn/img/favicon-16x16.png"> -->
    <!-- <link rel="manifest" href="https://<?php echo $simple_url; ?>/_core/_cdn/img/site.webmanifest"> -->

    <link href="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/css/bootstrap.min.css" rel="stylesheet">
    <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css">
    <style>
    body {
        font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
        background-color: #f8f9fa;
        color: #343a40;
    }
    .header {
        background: linear-gradient(135deg, #5664d3 0%, #6b4f9e 100%);
        color: white;
        padding: 3rem 0;
        margin-bottom: 2.5rem;
        border-bottom: 3px solid rgba(0,0,0,0.1);
    }
    .header h1 {
        font-weight: 600;
    }
    .card {
        border: none;
        border-radius: 12px;
        overflow: hidden;
        transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
        box-shadow: 0 4px 12px rgba(0,0,0,0.08);
        margin-bottom: 25px;
        background-color: #ffffff;
    }
    .card:hover {
        transform: translateY(-6px);
        box-shadow: 0 8px 20px rgba(0,0,0,0.12);
    }
    .card-img-top {
        height: 180px; /* Aumentado de 140px para 180px (ou outro valor desejado) */
        object-fit: cover;
        border-bottom: 1px solid #eee;
    }
    .card-body {
        padding: 0.7rem;
        display: flex;
        flex-direction: column;
        flex-grow: 1;
    }
    .card-title {
        font-size: 1rem;
        font-weight: 600;
        margin-bottom: 0.2rem;
        color: #495057;
    }
    .card-body .text-muted {
        font-size: 0.78rem;
        margin-bottom: 0.4rem;
        line-height: 1.2;
    }
    .card-footer {
        background-color: #ffffff;
        border-top: none;
        padding: 0.3rem 0.7rem 0.5rem; /* Subiu o botão ao reduzir padding inferior */
        margin-top: -20px; /* Puxa o botão para cima sem quebrar layout */
    }
    .card-footer .btn {
        padding: 0.35rem 0.7rem;
        font-size: 0.85rem;
    }
    .debug-info {
        background-color: #e9ecef;
        border-left: 4px solid #adb5bd;
        padding: 15px 20px;
        margin-bottom: 2.5rem;
        font-family: Consolas, Monaco, 'Andale Mono', 'Ubuntu Mono', monospace;
        font-size: 0.85rem;
        border-radius: 4px;
    }
    .alert-info {
        background-color: #e7f3fe;
        border-color: #d0eaff;
        color: #0c5464;
        padding: 2rem;
        border-radius: 8px;
    }
    </style>
</head>
<body>
    <!-- Header -->
    <header class="header text-center">
        <div class="container">
            <h1><i class="fas fa-store-alt"></i> Nossas Lojas Online</h1>
            <p class="lead">Encontre os melhores estabelecimentos para compra seus produtos</p>
        </div>
    </header>

    <!-- Debug Information -->
    <div class="container debug-info mb-4">
        <h4>Informações Estabelecimentos:</h4>
        <p>Total de estabelecimentos no banco: <strong><?php echo $total_estab; ?></strong></p>
        <p>Estabelecimentos ativos: <strong><?php echo $total_estab_ativos; ?></strong></p>
    </div>

    <!-- Main Content -->
    <div class="container mb-5">
        <div>
            <?php if (empty($estabelecimentos)): ?>
                <div class="alert alert-info text-center">
                    <i class="fas fa-info-circle fa-2x mb-3"></i>
                    <h4>Nenhuma loja disponível no momento</h4>
                    <p>Verifique os critérios de filtro ou cadastre novos estabelecimentos.</p>
                    <p class="small">Total no banco: <?php echo $total_estab; ?> | Ativos (contagem): <?php echo $total_estab_ativos; ?></p>
                </div>
            <?php else: ?>
                <div class="row">
                    <?php foreach ($estabelecimentos as $estab): ?>
                        <div class="col-6 col-md-3 mb-4">
                            <div class="card h-100">
                                <a href="<?php echo $estab['url']; ?>">
                                    <img src="<?php echo $estab['logo']; ?>" class="card-img-top" alt="<?php echo htmlspecialchars($estab['nome']); ?>" style="object-fit: cover;"> 
                                </a>
                                <div class="card-body d-flex flex-column">
                                    <h5 class="card-title">
                                         <?php echo htmlspecialchars($estab['nome']); ?>
                                    </h5>
                                    <p class="text-muted small mb-2">
                                        <i class="fas fa-map-marker-alt fa-fw"></i> <?php echo htmlspecialchars($estab['cidade']); ?>
                                        <?php if (!empty($estab['segmento'])): ?>
                                            <br><i class="fas fa-tag fa-fw"></i> <?php echo htmlspecialchars($estab['segmento']); ?>
                                        <?php endif; ?>
                                    </p>
                                </div>
                                <div class="card-footer bg-white border-top-0 pt-0 mt-auto">
                                    <a href="<?php echo $estab['url']; ?>" class="btn btn-outline-primary btn-sm w-100">
                                        Visitar Loja <i class="fas fa-arrow-right ms-1"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <!-- Footer -->
    <footer class="bg-dark text-white py-4">
        <div class="container text-center">
            <p class="mb-0">© <?php echo date('Y'); ?> Digita Vitrine Marketplace. Todos os direitos reservados.</p>
        </div>
    </footer>

    <!-- Scripts -->
    <script src="https://cdn.jsdelivr.net/npm/bootstrap@5.3.0/dist/js/bootstrap.bundle.min.js"></script>
</body>
</html>
<?php
// Fechar conexão com o banco de dados ao final do script
if (isset($db) && $db instanceof mysqli) {
    $db->close();
}
?>