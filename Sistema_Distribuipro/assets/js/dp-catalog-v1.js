/* DistribuiPro 35.0 · Catálogo compartilhado: unidades de medida e biblioteca de ícones.
   Usado em Produtos, Categorias, PDV e Orçamentos. Serve para qualquer ramo (não só distribuidora). */
(function () {
    'use strict';

    // value = gravado no produto · abbr = mostrado na tela · frac = aceita quantidade quebrada (2,5 m)
    const UNITS = [
        { group: 'Contagem', items: [
            ['un', 'UN', 'Unidade'], ['pc', 'PÇ', 'Peça'], ['par', 'PAR', 'Par'], ['jg', 'JG', 'Jogo'],
            ['kit', 'KIT', 'Kit'], ['cj', 'CJ', 'Conjunto'], ['dz', 'DZ', 'Dúzia'], ['ct', 'CT', 'Cento'],
            ['mil', 'MIL', 'Milheiro'], ['cart', 'CART', 'Cartela'], ['bl', 'BL', 'Blister']
        ] },
        { group: 'Embalagem', items: [
            ['cx', 'CX', 'Caixa'], ['pct', 'PCT', 'Pacote'], ['fd', 'FD', 'Fardo'], ['sc', 'SC', 'Saco'],
            ['rl', 'RL', 'Rolo'], ['bob', 'BOB', 'Bobina'], ['br', 'BR', 'Barra'], ['tb', 'TB', 'Tubo'],
            ['fr', 'FR', 'Frasco'], ['lata', 'LATA', 'Lata'], ['gl', 'GL', 'Galão'], ['bd', 'BD', 'Balde'],
            ['tambor', 'TAMB', 'Tambor'], ['pallet', 'PLT', 'Pallet']
        ] },
        { group: 'Comprimento (aceita fração)', frac: true, items: [
            ['mt', 'M', 'Metro'], ['cm', 'CM', 'Centímetro'], ['mm', 'MM', 'Milímetro']
        ] },
        { group: 'Área e volume (aceita fração)', frac: true, items: [
            ['m2', 'M²', 'Metro quadrado'], ['m3', 'M³', 'Metro cúbico']
        ] },
        { group: 'Peso (aceita fração)', frac: true, items: [
            ['kg', 'KG', 'Quilograma'], ['g', 'G', 'Grama'], ['ton', 'T', 'Tonelada']
        ] },
        { group: 'Líquidos (aceita fração)', frac: true, items: [
            ['lt', 'L', 'Litro'], ['ml', 'ML', 'Mililitro']
        ] },
        { group: 'Serviço e tempo', items: [
            ['serv', 'SERV', 'Serviço'], ['h', 'H', 'Hora', true], ['dia', 'DIA', 'Diária'],
            ['mes', 'MÊS', 'Mês'], ['vb', 'VB', 'Verba / empreitada']
        ] }
    ];
    // Valores antigos que podem existir em cadastros importados
    const ALIASES = { m: 'mt', metro: 'mt', l: 'lt', litro: 'lt', und: 'un', unid: 'un', um: 'un', pç: 'pc', peca: 'pc', t: 'ton', srv: 'serv', sv: 'serv', servico: 'serv' };

    const byValue = {};
    UNITS.forEach(g => g.items.forEach(([value, abbr, label, frac]) => {
        byValue[value] = { value, abbr, label, frac: !!(frac || g.frac), group: g.group };
    }));

    function norm(u) {
        const k = String(u || 'un').trim().toLowerCase();
        return byValue[k] ? k : (ALIASES[k] || k);
    }
    function unit(u) {
        const k = norm(u);
        return byValue[k] || { value: k, abbr: String(u || 'UN').toUpperCase(), label: String(u || 'Unidade'), frac: false, group: 'Outros' };
    }
    function isFrac(u) { return unit(u).frac; }
    function fmtQty(q, u) {
        const n = Number(q || 0);
        const frac = isFrac(u) || Math.abs(n % 1) > 0.0001;
        return n.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: frac ? 3 : 0 });
    }
    function parseQty(v) {
        if (typeof v === 'number') return v;
        const s = String(v || '').trim().replace(/\s/g, '');
        if (!s) return 0;
        // "1.234,5" → 1234.5 · "2,5" → 2.5 · "2.5" → 2.5
        const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s);
        return Number.isFinite(n) ? n : 0;
    }
    function selectOptionsHtml(current) {
        const cur = norm(current);
        let html = UNITS.map(g => `<optgroup label="${g.group}">` + g.items.map(([v, a, l]) =>
            `<option value="${v}"${v === cur ? ' selected' : ''}>${a} — ${l}</option>`).join('') + '</optgroup>').join('');
        if (current && !byValue[cur]) html = `<option value="${String(current).replace(/"/g, '&quot;')}" selected>${String(current).toUpperCase()}</option>` + html;
        return html;
    }

    // Embalagens de venda (fator = quantas unidades base vão em cada embalagem)
    const PACKAGES = [
        ['caixa', 'Caixa', '📦', 12], ['fardo', 'Fardo', '🗃️', 24], ['pack', 'Pack', '🧳', 6], ['kit', 'Kit', '🎁', 6],
        ['duzia', 'Dúzia', '🔢', 12], ['pallet', 'Pallet', '🏗️', 120], ['pacote', 'Pacote', '🛍️', 10], ['cento', 'Cento', '💯', 100],
        ['milheiro', 'Milheiro', '🔟', 1000], ['rolo', 'Rolo', '🧵', 100], ['bobina', 'Bobina', '🧶', 500], ['barra', 'Barra', '📏', 6],
        ['jogo', 'Jogo', '🧰', 3], ['par', 'Par', '👟', 2], ['saco', 'Saco', '🛄', 50], ['cartela', 'Cartela', '🃏', 10],
        ['galao', 'Galão', '🛢️', 5], ['lata', 'Lata', '🥫', 18], ['balde', 'Balde', '🪣', 20], ['display', 'Display', '🗂️', 12]
    ];

    // Biblioteca de ícones por ramo [ícone, nome]
    const ICONS = [
        { name: 'Geral', icons: [['📦','Caixa'],['🏷️','Etiqueta'],['🛍️','Sacola'],['🛒','Carrinho'],['🎁','Presente'],['⭐','Destaque'],['🔥','Promoção'],['🆕','Novidade'],['💎','Premium'],['♻️','Reciclável'],['🧾','Nota'],['💰','Dinheiro'],['💳','Cartão'],['📋','Lista'],['✅','Pronto'],['🔖','Marcador']] },
        { name: 'Elétrica', icons: [['⚡','Energia'],['💡','Lâmpada'],['🔌','Tomada / plugue'],['🔋','Bateria'],['🪫','Bateria fraca'],['🔦','Lanterna'],['🎛️','Quadro / painel'],['🎚️','Dimmer'],['🔘','Interruptor'],['🧵','Fio / cabo'],['➰','Cabo enrolado'],['🔗','Conector'],['⚙️','Motor'],['🧲','Bobina / ímã'],['🔆','Refletor'],['☀️','Energia solar'],['🌞','Placa solar'],['🌀','Ventilador'],['❄️','Ar-condicionado'],['🔔','Campainha'],['🏭','Industrial'],['🛰️','Antena'],['📡','Parabólica'],['📶','Sinal / Wi-Fi'],['🕯️','Iluminação'],['🔴','Sinaleiro'],['🧯','Proteção']] },
        { name: 'Segurança eletrônica', icons: [['📹','Câmera'],['🎥','Filmadora'],['📷','Câmera foto'],['🚨','Alarme'],['🔒','Cadeado'],['🔐','Fechadura'],['🔑','Chave'],['🗝️','Chave tetra'],['🛡️','Proteção'],['👁️','Monitoramento'],['🚪','Porta'],['☎️','Interfone'],['📟','Central'],['🪪','Controle de acesso'],['🕹️','Controle remoto'],['🚧','Cerca / barreira'],['⚠️','Atenção'],['🧑‍✈️','Vigilância']] },
        { name: 'Informática e celular', icons: [['💻','Notebook'],['🖥️','Computador'],['⌨️','Teclado'],['🖱️','Mouse'],['🖨️','Impressora'],['💾','Armazenamento'],['💽','HD / SSD'],['💿','CD'],['📀','DVD'],['📱','Celular'],['📲','Smartphone'],['📞','Telefone'],['📠','Fax'],['🎧','Fone'],['🎤','Microfone'],['🔊','Caixa de som'],['📺','TV'],['📻','Rádio'],['⌚','Relógio'],['🎮','Videogame'],['🖲️','Acessório'],['🔌','Carregador'],['🧮','Calculadora']] },
        { name: 'Ferramentas e ferragens', icons: [['🔧','Chave inglesa'],['🔨','Martelo'],['🪛','Chave de fenda'],['🪚','Serrote'],['🛠️','Ferramentas'],['⚒️','Martelo e picareta'],['🧰','Caixa de ferramentas'],['🔩','Parafuso / porca'],['🪝','Gancho'],['⛓️','Corrente'],['🪜','Escada'],['📏','Régua / trena'],['📐','Esquadro'],['✂️','Tesoura'],['🗜️','Grampo / morsa'],['⛏️','Picareta'],['🪓','Machado'],['🧷','Alfinete'],['📎','Clipe'],['🔪','Faca'],['🧤','Luva'],['🥽','Óculos de proteção'],['⛑️','Capacete']] },
        { name: 'Construção e hidráulica', icons: [['🧱','Tijolo / bloco'],['🪨','Pedra / brita'],['🏗️','Obra'],['🏠','Casa'],['🏢','Prédio'],['🪵','Madeira'],['🎨','Tinta'],['🖌️','Pincel'],['🖍️','Massa / giz'],['🧹','Vassoura'],['🪣','Balde'],['🧽','Esponja'],['🚿','Chuveiro'],['🚰','Torneira'],['🛁','Banheira'],['🚽','Vaso sanitário'],['🪠','Desentupidor'],['💧','Água'],['🪟','Janela'],['🚪','Porta'],['🪞','Espelho'],['🌡️','Aquecedor'],['🔥','Gás'],['⛲','Bomba d’água'],['🛢️','Tambor / óleo']] },
        { name: 'Casa e utilidades', icons: [['🍽️','Prato'],['🍴','Talheres'],['🥄','Colher'],['🥣','Tigela'],['🍳','Frigideira'],['🫖','Chaleira'],['☕','Xícara'],['🛋️','Sofá'],['🪑','Cadeira'],['🛏️','Cama'],['🖼️','Quadro'],['🕰️','Relógio de parede'],['🪴','Vaso de planta'],['🧸','Brinquedo'],['🎈','Balão'],['🎉','Festa'],['🧺','Cesto'],['🧻','Papel'],['🗑️','Lixeira'],['🧊','Gelo']] },
        { name: 'Limpeza e higiene', icons: [['🧼','Sabão'],['🧴','Frasco'],['🧽','Esponja'],['🧹','Vassoura'],['🪣','Balde'],['🧻','Papel higiênico'],['🪥','Escova de dente'],['🧪','Químico'],['🫧','Espuma'],['🧤','Luvas'],['😷','Máscara'],['🗑️','Saco de lixo']] },
        { name: 'Beleza e farmácia', icons: [['💄','Batom'],['💅','Esmalte'],['💇','Cabelo'],['💈','Barbearia'],['🪒','Barbeador'],['🧴','Creme'],['🌸','Perfume'],['💊','Remédio'],['💉','Injeção'],['🩹','Curativo'],['🩺','Saúde'],['🌡️','Termômetro'],['👓','Óculos'],['🕶️','Óculos de sol'],['🦷','Dental']] },
        { name: 'Moda e calçados', icons: [['👕','Camiseta'],['👖','Calça'],['👗','Vestido'],['👚','Blusa'],['👔','Camisa'],['🧥','Casaco'],['🩳','Bermuda'],['👙','Biquíni'],['🩱','Maiô'],['🧦','Meia'],['🧢','Boné'],['👒','Chapéu'],['👟','Tênis'],['👞','Sapato'],['👠','Salto'],['👡','Sandália'],['👢','Bota'],['🥿','Sapatilha'],['👜','Bolsa'],['👛','Carteira'],['🎒','Mochila'],['💍','Anel'],['🧣','Cachecol'],['🩲','Cueca']] },
        { name: 'Bebidas', icons: [['🍺','Cerveja'],['🍻','Cervejas'],['🥤','Refrigerante'],['🧃','Suco'],['💧','Água'],['🧊','Gelo'],['⚡','Energético'],['🥃','Destilado'],['🍸','Drink'],['🍷','Vinho'],['🍾','Espumante'],['🥂','Brinde'],['🍹','Coquetel'],['☕','Café'],['🍵','Chá'],['🧉','Mate'],['🥛','Leite'],['🍶','Saquê']] },
        { name: 'Alimentos', icons: [['🍞','Pão'],['🥖','Baguete'],['🥐','Croissant'],['🧀','Queijo'],['🥚','Ovos'],['🍗','Frango'],['🥩','Carne'],['🍖','Churrasco'],['🐟','Peixe'],['🍤','Camarão'],['🍕','Pizza'],['🍔','Hambúrguer'],['🌭','Cachorro-quente'],['🍟','Batata frita'],['🌮','Taco'],['🍝','Massa'],['🍚','Arroz'],['🥫','Enlatado'],['🍪','Biscoito'],['🍫','Chocolate'],['🍬','Bala'],['🍭','Pirulito'],['🍩','Rosquinha'],['🍰','Bolo'],['🍦','Sorvete'],['🍯','Mel'],['🧂','Sal / tempero'],['🥜','Amendoim'],['🍿','Pipoca'],['🧈','Manteiga'],['🥪','Sanduíche'],['🥗','Salada']] },
        { name: 'Hortifrúti', icons: [['🍎','Maçã'],['🍌','Banana'],['🍇','Uva'],['🍉','Melancia'],['🍊','Laranja'],['🍋','Limão'],['🍓','Morango'],['🍍','Abacaxi'],['🥭','Manga'],['🥥','Coco'],['🥑','Abacate'],['🍅','Tomate'],['🥕','Cenoura'],['🥔','Batata'],['🧅','Cebola'],['🧄','Alho'],['🥬','Folhas'],['🥦','Brócolis'],['🌶️','Pimenta'],['🍄','Cogumelo'],['🥒','Pepino'],['🌽','Milho']] },
        { name: 'Papelaria e escritório', icons: [['✏️','Lápis'],['🖊️','Caneta'],['🖋️','Caneta tinteiro'],['📝','Bloco'],['📒','Caderno'],['📚','Livros'],['📄','Folha'],['📋','Prancheta'],['📌','Tachinha'],['📎','Clipe'],['🗂️','Pasta'],['📁','Arquivo'],['🖍️','Giz de cera'],['📦','Envio'],['✉️','Envelope'],['🏷️','Etiqueta']] },
        { name: 'Automotivo', icons: [['🚗','Carro'],['🚙','Utilitário'],['🛻','Picape'],['🚚','Caminhão'],['🏍️','Moto'],['🛵','Scooter'],['🚲','Bicicleta'],['🛞','Pneu'],['⛽','Combustível'],['🛢️','Óleo'],['🔧','Mecânica'],['🔋','Bateria'],['🚦','Sinalização'],['🧯','Extintor'],['🪪','Documento']] },
        { name: 'Pet e agro', icons: [['🐶','Cachorro'],['🐱','Gato'],['🐦','Pássaro'],['🐠','Peixe'],['🐴','Cavalo'],['🐄','Gado'],['🐔','Aves'],['🦴','Osso'],['🐾','Pet'],['🌱','Semente / muda'],['🌾','Grãos'],['🌻','Girassol'],['🚜','Trator'],['🪴','Jardinagem'],['🌳','Árvore'],['🎣','Pesca'],['🪱','Isca']] },
        { name: 'Esporte e lazer', icons: [['⚽','Futebol'],['🏀','Basquete'],['🏐','Vôlei'],['🎾','Tênis'],['🏓','Pingue-pongue'],['🥊','Luta'],['🏋️','Academia'],['🚴','Ciclismo'],['🏊','Natação'],['🎯','Alvo'],['🎲','Jogos'],['♟️','Xadrez'],['🎸','Violão'],['🎹','Teclado'],['🥁','Bateria'],['🧩','Quebra-cabeça']] },
        { name: 'Serviços', icons: [['🛠️','Serviço'],['👷','Técnico / obra'],['🧑‍🔧','Mecânico / eletricista'],['🧑‍💻','TI'],['🚚','Entrega / frete'],['📋','Ordem de serviço'],['🕒','Hora técnica'],['📅','Agenda'],['🤝','Contrato'],['📞','Atendimento'],['🧽','Limpeza'],['✂️','Corte'],['🔍','Vistoria'],['📐','Projeto']] }
    ];

    window.DPCatalog = { UNITS, PACKAGES, ICONS, norm, unit, isFrac, fmtQty, parseQty, selectOptionsHtml };
})();
