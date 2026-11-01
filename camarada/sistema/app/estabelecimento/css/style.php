<?php
header("Content-type: text/css");
include('../../../_core/_includes/config.php');

// Busca a cor do estabelecimento
$id = mysqli_real_escape_string($db_con, $_GET['id']);
$define_query = mysqli_query($db_con, "SELECT cor FROM estabelecimentos WHERE id = '$id' LIMIT 1");
$define_data = mysqli_fetch_array($define_query);
$cor = $define_data['cor'];

// Cor padrão caso não exista
if(!$cor) {
    $cor = "#27293E";
}
?>

/* ===================================
   ELEMENTOS COM COR PERSONALIZADA
   =================================== */

/* Elementos com a cor como texto */
.colored,
.shop-bag i,
.naver .navbar a i,
.header .naver .navbar .social a:hover i,
.naver .navbar a:hover,
.user-menu i,
.search-bar-mobile button i,
.categoria .vertudo i,
.categoria .counter,
.bread i,
.produto-detalhes .categoria a,
.campo-numero i,
.sacola-table .sacola-remover i,
.sacola-table .sacola-change i,
.adicionado .checkicon,
.title-line i,
.back-button i,
.sidebar-info i,
.filter-select .outside,
.filter-select .fake-select i,
.pagination i,
.funcionamento-mobile i,
.fake-select i,
.search-bar button i,
.holder-shop-bag i {
    color: <?php echo $cor; ?> !important;
}

/* Elementos com a cor como borda */
.top {
    border-color: <?php echo $cor; ?> !important;
}

.tv-infinite-menu a.active,
.tv-infinite-menu a:hover,
.fancybox-thumbs__list a::before {
    border-color: <?php echo $cor; ?> !important;
}

/* Elementos com a cor como background */
.footer-info,
.categoria .produto .detalhes,
.carousel-indicators .active,
.botao-acao,
.sidebar .sidebar-header,
.minitop,
.opcoes .opcao.active .check,
.floatbar {
    background: <?php echo $cor; ?> !important;
}

/* Paginação com a cor personalizada */
.pagination > li > a:hover, 
.pagination > .active > a, 
.pagination > .active > a:focus, 
.pagination > .active > a:hover, 
.pagination > .active > span, 
.pagination > .active > span:focus, 
.pagination > .active > span:hover {
    background: <?php echo $cor; ?> !important;
    color: #fff !important;
}

/* ===================================
   ESTILOS FIXOS
   =================================== */

/* Avatar fixo */
.is-sticky .avatar {
    height: 70px !important;
    width: 70px !important;
}

/* Classes de visibilidade */
.invisible {
    visibility: hidden !important;
}

/* ===================================
   ESTILOS DOS PRODUTOS
   =================================== */

/* Imagem do produto */
.produto .capa {
    background-repeat: no-repeat;
    background-position: center center;
    height: 250px;
    width: 100%;
    background-size: cover;
}

/* Nome do produto */
.produto .nome {
    color: #333;
    font-size: 16px;
    font-weight: 600;
    font-family: 'Open Sans', Arial, sans-serif;
    letter-spacing: -0.2px;
    display: block;
    margin-top: 5px; /* Reduzido */
    margin-bottom: 2px; /* Reduzido */
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Valor anterior (riscado) */
.produto .valor_anterior {
    color: #FF0000 !important;
    display: block;
    text-align: left;
    margin-bottom: 1px; /* Reduzido */
    min-height: unset; /* Removido min-height */
    line-height: 1.1; /* Reduzido */
}

/* Valor anterior invisível */
.produto .valor_anterior.invisible {
    visibility: hidden !important;
    color: transparent !important;
}

/* Texto "Por apenas" */
.produto .apenas {
    white-space: nowrap;
    display: block;
    text-align: left;
    margin-bottom: 1px; /* Reduzido */
    line-height: 1.1; /* Reduzido */
    height: auto; /* Removido height fixa */
}

/* Valor do produto */
.produto .valor {
    display: block;
    text-align: center;
    font-weight: bold;
    margin-bottom: 3px; /* Reduzido */
    line-height: 1.2; /* Adicionado para consistência */
}

/* Botão de detalhes */
.produto .detalhes {
    padding: 10px 0;
    text-align: center;
    color: #fff;
}

/* Estilo para sem estoque */
.produto .detalhes.sem-estoque {
    background-color: #C0C0C0 !important;
}

/* Dimensão consistente da coluna - Removido min-height fixo daqui */
.col-infinite {
    /* min-height: 420px; */ /* Removido ou comentado */
    margin-bottom: 15px; /* Adiciona um espaço inferior para separar as linhas de cards */
}

/* Container para scroll horizontal (Exibição Tipo 1) */
.tv-infinite {
    overflow-x: auto; /* Habilita scroll horizontal */
    white-space: nowrap; /* Impede que os itens quebrem linha */
    font-size: 0; /* Truque para remover espaço entre inline-block */
    margin-left: -5px; /* Mantém ajuste de padding */
    margin-right: -5px; /* Mantém ajuste de padding */
    padding-bottom: 10px; /* Espaço para a barra de rolagem não sobrepor */
}

/* Itens dentro do container de scroll */
.col-infinite {
    display: inline-block; /* Coloca itens lado a lado */
    vertical-align: top; /* Alinha itens pelo topo */
    white-space: normal; /* Restaura quebra de linha para o conteúdo interno */
    font-size: initial; /* Restaura tamanho da fonte para o conteúdo interno */
    width: 25%; /* Largura padrão (Desktop - 4 itens) */
    /* padding-left/right já estão inline no PHP, mantidos */
    margin-bottom: 0; /* Removido margin-bottom daqui, já que estão lado a lado */
}

/* ===================================
   MEDIA QUERIES
   =================================== */

/* MOBILE */
@media (max-width: 767px) { /* Ajustado breakpoint para mobile */
    .user-menu i {
        color: #fff !important;
    }
    
    .shop-bag i {
        color: #fff !important;
    }
    
    .shop-bag .counter {
        border: 0;
        padding-top: 2px;
    }
    
    .top {
        border-top: 0;
        background: <?php echo $cor; ?> !important;
    }
    
    /* Ajustes para a grade de produtos no mobile */
    .categoria {
        margin-bottom: 15px !important; /* Garante um espaçamento menor entre categorias */
    }

    .produto .capa {
        height: 180px; /* Altura reduzida para a imagem no mobile */
    }

    .col-infinite {
        min-height: auto; /* Remove altura mínima fixa no mobile */
        /* O margin-bottom adicionado acima cuidará do espaçamento vertical */
    }

    /* Ajuste no nome do produto para evitar quebra estranha */
    .produto .nome {
        font-size: 14px; /* Pode ajustar se necessário */
        white-space: normal; /* Permite quebra de linha se necessário */
        overflow: hidden; /* Mantém o overflow */
        text-overflow: ellipsis; /* Mantém o ellipsis */
        /* Adiciona uma altura máxima e limita a 2 linhas com ellipsis (opcional, mais complexo) */
        display: -webkit-box;
        -webkit-line-clamp: 2;
        -webkit-box-orient: vertical;
        line-height: 1.2; /* Ajustar conforme necessário */
        max-height: calc(1.3em * 2); /* line-height * número de linhas */
        min-height: calc(1.3em * 2); /* Garante espaço mesmo com 1 linha */
        margin-bottom: 3px; /* Reduzido espaçamento inferior do nome */
        margin-top: 0; /* Zerar margem superior */
        margin-bottom: 2px; /* Reduzido ainda mais */
        line-height: 1.2; /* Reduzir altura da linha */
        margin-top: 0 !important; /* Forçar sem margem superior */
        margin-bottom: 1px !important; /* Forçar margem inferior mínima */
        line-height: 1.1 !important; /* Forçar altura de linha mínima */
        max-height: calc(1.1em * 2) !important; /* Ajustar max-height com novo line-height */
        min-height: unset !important; /* Remover min-height */
    }

    /* Ajuste nos textos abaixo do nome para consistência */
    .produto .valor_anterior,
    .produto .apenas {
        min-height: auto; /* Remove altura mínima fixa se houver */
        height: auto;
        font-size: 12px; /* Reduz um pouco a fonte */
        margin-bottom: 1px; /* Reduzido espaçamento inferior */
        margin-top: 0; /* Zerar margem superior */
        margin-bottom: 1px; /* Manter reduzido */
        line-height: 1.1; /* Reduzir altura da linha */
        min-height: unset; /* Garantir que não haja altura mínima */
        height: auto;
        margin-top: 0 !important; /* Forçar sem margem superior */
        margin-bottom: 0 !important; /* Forçar sem margem inferior */
        line-height: 1 !important; /* Forçar altura de linha mínima */
        min-height: unset !important; /* Garantir sem min-height */
        height: auto !important; /* Garantir altura automática */
    }
    .produto .valor_anterior {
        min-height: auto; /* Removido min-height para juntar mais */
    }
    .produto .apenas {
        min-height: auto; /* Removido min-height para juntar mais */
    }

    .produto .valor {
        font-size: 15px; /* Ajusta tamanho do preço */
        margin-bottom: 5px; /* Reduzido espaçamento inferior do valor final */
        margin-top: 0; /* Zerar margem superior */
        margin-bottom: 4px; /* Reduzido ainda mais */
        line-height: 1.2; /* Reduzir altura da linha */
        margin-top: 0 !important; /* Forçar sem margem superior */
        margin-bottom: 2px !important; /* Forçar margem inferior mínima */
        line-height: 1.1 !important; /* Forçar altura de linha mínima */
    }

    .produto .detalhes {
        padding: 8px 0; /* Reduz padding do botão */
        font-size: 13px;
    }

    .tv-infinite .col-infinite {
        width: 50%; /* 2 itens visíveis no mobile */
    }
}

/* TABLET */
@media (min-width: 768px) and (max-width: 991px) {
    .tv-infinite .col-infinite {
        width: 33.333%; /* 3 itens visíveis no tablet */
    }
}

/* DESKTOP */
@media (min-width: 992px) {
    /* Estilos específicos para desktop */
    /* A largura de 25% para .col-infinite já está definida fora das media queries */
}

/* ===================================
   NOVOS ESTILOS
   =================================== */

.payment-list2 {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    align-items: center;
}

.cartoes {
    width: 45px;
    height: auto;
}

/* Ajuste do título "Formas de Pagamento" */
.formas-pagamento-titulo {
    font-size: 20px;
    font-weight: bold;
    color: #333;
    margin-bottom: 10px; /* Reduz o espaçamento abaixo do título */
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 10px;
}

/* Ícone do cartão */
.formas-pagamento-titulo i {
    font-size: 24px;
    color: #333;
}

/* Imagem das bandeiras */
.bandeiras-pagamento {
    max-width: 80%; /* Reduz o tamanho da imagem */
    height: auto;
    margin: 0 auto;
    display: block;
}

/* Ajustes responsivos */
@media (max-width: 768px) {
    .formas-pagamento-titulo {
        font-size: 18px;
    }

    .formas-pagamento-titulo i {
        font-size: 20px;
    }

    .bandeiras-pagamento {
        max-width: 90%; /* Ajusta o tamanho da imagem para telas menores */
    }
}