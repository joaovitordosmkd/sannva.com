/* DistribuiPro 35.44 · Importar produtos de planilha (Produtos › Importar planilha).
   Traz o cadastro de outro sistema sem digitar: lê o CSV exportado (ou salvo pelo Excel) e cadastra
   produtos, categorias e o estoque inicial.
   - Detecta separador (; , tab |), aspas, acentos (UTF-8 ou Windows) e o formato ="0123" do Excel.
   - Reconhece as colunas pelo nome (nome, categoria, sku, codigo_barras, preco_custo, preco_venda,
     estoque, unidade, ativo, ncm, cfop…); dá para trocar na tela antes de importar.
   - Mostra prévia e avisa o que já existe (atualizar, pular ou cadastrar de novo).
   - Fotos: se o sistema antigo exportou só o nome do arquivo, é só escolher as fotos e elas são ligadas
     a cada produto pelo nome. Dá para escolher (ou arrastar) a pasta inteira: planilha + fotos de uma vez.
   - Grava em lotes, registra o saldo inicial em Movimentações e marca a importação para poder desfazer. */
(function () {
    'use strict';
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const key = s => norm(s).replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    const digits = s => String(s || '').replace(/\D/g, '');
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore.FieldValue);
    const ts = () => FV().serverTimestamp();
    const uid = () => (window.auth && auth.currentUser && auth.currentUser.uid) || 'system';
    const HIST = 'dp_import_hist';

    /* ---------- Campos do sistema e nomes de coluna que cada um aceita ---------- */
    const FIELDS = [
        ['name', 'Nome do produto', true, ['nome', 'produto', 'nome_produto', 'name', 'titulo', 'descricao_produto', 'item', 'nome_do_produto']],
        ['category', 'Categoria', false, ['categoria', 'category', 'grupo', 'departamento', 'secao', 'familia', 'categoria_produto', 'categorias', 'grupo_produto', 'subgrupo']],
        ['code', 'Código / SKU', false, ['sku', 'codigo', 'cod', 'codigo_interno', 'referencia', 'ref', 'code', 'codigo_produto', 'cod_produto']],
        ['barcode', 'Código de barras', false, ['codigo_barras', 'codigo_de_barras', 'cod_barras', 'ean', 'ean13', 'gtin', 'barcode', 'cod_barra']],
        ['costPrice', 'Preço de custo', false, ['preco_custo', 'custo', 'valor_custo', 'preco_de_custo', 'preco_compra', 'cost', 'custo_unitario']],
        ['salePrice', 'Preço de venda', true, ['preco_venda', 'preco', 'valor_venda', 'preco_de_venda', 'valor', 'price', 'pvenda', 'venda', 'preco_varejo']],
        ['stock', 'Estoque', false, ['estoque_inicial', 'estoque', 'estoque_atual', 'quantidade', 'qtd', 'qtde', 'saldo', 'stock']],
        ['minStock', 'Estoque mínimo', false, ['estoque_minimo', 'estoque_min', 'minimo', 'min_stock', 'qtd_minima']],
        ['unit', 'Unidade', false, ['unidade', 'un', 'und', 'unid', 'unit', 'unidade_medida', 'medida']],
        ['brand', 'Marca', false, ['marca', 'fabricante', 'brand', 'marcas']],
        ['description', 'Descrição / detalhes', false, ['descricao', 'description', 'detalhes', 'observacao', 'observacoes', 'obs', 'descricao_completa']],
        ['active', 'Ativo', false, ['ativo', 'status', 'situacao', 'active', 'habilitado']],
        ['controlStock', 'Controlar estoque', false, ['controlar_estoque', 'controla_estoque', 'controle_estoque', 'movimenta_estoque']],
        ['image', 'Foto (arquivo ou link)', false, ['imagem_url', 'imagem', 'foto', 'image', 'url_imagem', 'foto_url', 'imagem_produto']],
        ['ncm', 'NCM', false, ['ncm']],
        ['cest', 'CEST', false, ['cest']],
        ['cfop', 'CFOP', false, ['cfop', 'cfop_interno', 'cfop_estadual', 'cfop_dentro_do_estado', 'cfop_venda']],
        ['csosn', 'CSOSN / CST do ICMS', false, ['csosn', 'situacao_tributaria_icms', 'situacao_tributaria', 'cst_csosn', 'csosn_cst', 'st_icms', 'cst_ou_csosn']],
        ['origem', 'Origem', false, ['origem', 'origem_mercadoria', 'origem_do_produto']],
        // 38.2 · Autopeças: referência do fabricante, aplicação (veículos compatíveis) e local na prateleira
        ['reference', 'Referência do fabricante', false, ['referencia_fabricante', 'ref_fabricante', 'codigo_fabricante', 'cod_fabricante', 'codigo_original', 'part_number', 'oem', 'referencias', 'referencia', 'ref', 'cod_fornecedor', 'codigo_fornecedor', 'cod_do_fornecedor']],
        ['application', 'Aplicação (veículos)', false, ['aplicacao', 'aplicacoes', 'aplicacao_veiculos', 'veiculos', 'veiculos_compativeis', 'compatibilidade', 'application']],
        ['stockLocation', 'Local no estoque', false, ['localizacao', 'local_estoque', 'local_no_estoque', 'prateleira', 'endereco_estoque', 'posicao', 'local']],
        // 38.6 · Loja de roupa: Tamanho e Cor viram grade (o pai é agrupado pelo nome · grade-v1.js)
        ['gradeSize', 'Tamanho (grade)', false, ['tamanho', 'tam', 'tamanhos', 'size', 'grade_tamanho', 'numeracao']],
        ['gradeColor', 'Cor (grade)', false, ['cor', 'cores', 'color', 'colour', 'grade_cor', 'cor_produto']]
    ];
    // Outras colunas fiscais: guardadas no produto (campo fiscal) para a nota fiscal no futuro
    const FISCAL_EXTRA = ['cst_icms', 'cst_pis', 'cst_cofins', 'unidade_tributavel', 'aliquota_icms', 'reducao_bc_icms', 'aliquota_pis', 'aliquota_cofins', 'tem_icms_st', 'mva_st', 'aliquota_st', 'reducao_bc_st', 'fcp', 'fcp_st', 'cst_ipi', 'aliquota_ipi', 'ipi_enquadramento', 'cst_ibscbs', 'cclass_trib', 'cbenef',
        'cfop_interestadual', 'cfop_fora_do_estado', 'peso_bruto', 'peso_liq', 'peso_liquido']; // 39.14
    // Ícone da categoria nova pelo nome (vale para qualquer ramo; o resto fica 📦)
    const CAT_ICONS = [[/cervej|chope|chopp/, '🍺'], [/vinho|espumante/, '🍷'], [/destilad|licor|whisk|vodka|cachac|\bgin\b/, '🥃'], [/energet/, '⚡'], [/gelo/, '🧊'], [/suco|\bchas?\b|isoton/, '🧃'], [/\bices?\b|drink/, '🍹'], [/doce|\bbalas?\b|chocolate|bombom/, '🍬'], [/cigarr|tabac/, '🚬'], [/combo/, '🎁'], [/churrasc|carne|carvao|acougue/, '🍖'], [/salgad|petisc|snack/, '🍿'], [/copo|descart/, '🍽️'], [/taxa|entrega/, '🛵'],
        [/equipament/, '🧰'], [/vidro/, '🪟'], [/shampoo|lavagem/, '🧼'], [/microfibra|toalha/, '🧽'], [/escova|pincel|aplicador/, '🖌️'], [/boina|\bpads?\b|interface/, '🌀'], [/couro|estofad|interior/, '💺'], [/lancamento|aviso/, '📝'],
        [/lampad|luz|led/, '💡'], [/filtro/, '🔧'], [/palheta|limpa|parabrisa/, '🧽'], [/oleo|lubrific/, '🛢️'], [/fluido|arrefec|aditivo|agua/, '💧'], [/estetica|cera|polimento|limpeza/, '✨'], [/aromatiz|perfum/, '🌸'], [/pneu|roda/, '🛞'], [/spray/, '🧴'], [/motor/, '⚙️'], [/freio|seguranca|suspens|direc/, '🛡️'], [/carroceria|automo|carro|veic/, '🚗'], [/bebida|refriger|cerveja/, '🥤'], [/aliment|mercearia/, '🛒'], [/eletr|cabo|fio/, '🔌'], [/ferrament/, '🛠️'], [/roupa|vestu|moda/, '👕'], [/celular|acessorio/, '📱']];
    const catIcon = name => { const n = norm(name); const hit = CAT_ICONS.find(([re]) => re.test(n)); return hit ? hit[1] : '📦'; };

    let S = null; // estado da importação aberta

    /* ---------- Leitura do arquivo ---------- */
    async function readText(file) {
        const buf = await file.arrayBuffer();
        try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
        catch (e) { return new TextDecoder('windows-1252').decode(buf); }
    }
    function parseCSV(text) {
        text = text.replace(/^﻿/, '');
        const nl = text.indexOf('\n'), first = nl > -1 ? text.slice(0, nl) : text;
        const delim = [';', ',', '\t', '|'].map(d => [d, first.split(d).length]).sort((a, b) => b[1] - a[1])[0][0];
        const rows = []; let row = [], cell = '', q = false;
        for (let i = 0; i < text.length; i++) {
            const ch = text[i];
            if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; }
            else if (ch === '"') q = true;
            else if (ch === delim) { row.push(cell); cell = ''; }
            else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; }
            else if (ch !== '\r') cell += ch;
        }
        if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
        return { delim, rows: rows.filter(r => r.some(c => String(c).trim() !== '')) };
    }
    /* 39.14 · Planilha do Excel direto (.xlsx), a ".xls" que vários sistemas exportam (é uma página HTML ou XML com a
       tabela) e o CSV. Ler o .xlsx direto evita o estrago do "Salvar como CSV" do Excel, que grava o código de barras
       como 7,90841E+12 (perde os últimos números). Sem biblioteca de fora: o .xlsx é um zip; o navegador descompacta. */
    const isPlanilha = f => /\.(csv|txt|xlsx|xlsm|xls)$/i.test(f.name);
    async function unzip(buf) {
        const u8 = new Uint8Array(buf), dv = new DataView(buf), out = new Map();
        let eocd = -1; for (let i = u8.length - 22; i >= Math.max(0, u8.length - 70000); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
        if (eocd < 0) throw new Error('O arquivo .xlsx está corrompido ou não é do Excel.');
        let p = dv.getUint32(eocd + 16, true); const n = dv.getUint16(eocd + 10, true), dec = new TextDecoder();
        for (let k = 0; k < n; k++) {
            if (dv.getUint32(p, true) !== 0x02014b50) break;
            const metodo = dv.getUint16(p + 10, true), tam = dv.getUint32(p + 20, true), ln = dv.getUint16(p + 28, true), le = dv.getUint16(p + 30, true), lc = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
            const nome = dec.decode(u8.subarray(p + 46, p + 46 + ln)); p += 46 + ln + le + lc;
            if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|styles\.xml|worksheets\/[^/]+\.xml)$/.test(nome)) continue;
            const ini = off + 30 + dv.getUint16(off + 26, true) + dv.getUint16(off + 28, true), dados = u8.subarray(ini, ini + tam);
            if (metodo === 0) { out.set(nome, dec.decode(dados)); continue; }
            if (metodo !== 8 || typeof DecompressionStream === 'undefined') throw new Error('Este navegador não abre .xlsx. Atualize o navegador ou salve a planilha como CSV UTF-8.');
            const s = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
            out.set(nome, await new Response(s).text());
        }
        return out;
    }
    const xmlDoc = s => new DOMParser().parseFromString(s || '<x/>', 'application/xml');
    const tags = (el, nome) => [...el.getElementsByTagName(nome)];
    const textoDe = el => tags(el, 't').map(t => t.textContent).join('');
    // Número do Excel em texto sem notação científica (código de barras de 13 números continua inteiro)
    const numTxt = v => { const s = String(v ?? '').trim(); if (!/e/i.test(s)) return s; const n = Number(s); return Number.isFinite(n) ? (Number.isInteger(n) ? BigInt(Math.round(n)).toString() : String(n)) : s; };
    const serialData = n => { const d = new Date(Math.round((Number(n) - 25569) * 864e5)); return isNaN(d) ? String(n) : `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
    async function lerXlsx(buf) {
        const z = await unzip(buf), wb = xmlDoc(z.get('xl/workbook.xml')), rels = xmlDoc(z.get('xl/_rels/workbook.xml.rels'));
        const sheet = tags(wb, 'sheet')[0]; if (!sheet) throw new Error('A planilha não tem nenhuma aba.');
        const rid = sheet.getAttribute('r:id') || sheet.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id');
        const rel = tags(rels, 'Relationship').find(r => r.getAttribute('Id') === rid);
        const alvo = rel ? rel.getAttribute('Target').replace(/^\/?(xl\/)?/, 'xl/') : 'xl/worksheets/sheet1.xml';
        const shared = tags(xmlDoc(z.get('xl/sharedStrings.xml')), 'si').map(textoDe);
        // Estilos de data: a célula guarda um número (dias desde 1900) e o formato diz que é data
        const st = xmlDoc(z.get('xl/styles.xml')), fmts = new Map(tags(st, 'numFmt').map(f => [f.getAttribute('numFmtId'), f.getAttribute('formatCode') || '']));
        const xfs = tags(tags(st, 'cellXfs')[0] || st, 'xf').map(x => { const id = x.getAttribute('numFmtId') || '0', n = Number(id); return (n >= 14 && n <= 22) || (n >= 45 && n <= 47) || /(^|[^\\"])[dmy]{1,4}/i.test((fmts.get(id) || '').replace(/"[^"]*"/g, '')); });
        const ws = xmlDoc(z.get(alvo) || z.get('xl/worksheets/sheet1.xml')), rows = [];
        const col = ref => { const m = /^([A-Z]+)/.exec(ref || ''); if (!m) return -1; let c = 0; for (const ch of m[1]) c = c * 26 + ch.charCodeAt(0) - 64; return c - 1; };
        tags(ws, 'row').forEach(r => {
            const lin = []; let prox = 0;
            tags(r, 'c').forEach(c => {
                const i = c.getAttribute('r') ? col(c.getAttribute('r')) : prox; prox = i + 1;
                const t = c.getAttribute('t') || 'n', v = (tags(c, 'v')[0] || {}).textContent ?? '';
                let val = t === 's' ? (shared[Number(v)] ?? '') : t === 'inlineStr' ? textoDe(c) : t === 'b' ? (v === '1' ? 'Sim' : 'Não') : t === 'str' || t === 'e' ? v : numTxt(v);
                if (t === 'n' && v !== '' && xfs[Number(c.getAttribute('s') || 0)]) val = serialData(v);
                lin[i] = val;
            });
            rows.push(Array.from(lin, x => x ?? ''));
        });
        return rows.filter(r => r.some(x => String(x).trim() !== ''));
    }
    // ".xls" que é página HTML (<table>) ou XML do Excel 2003 (<Workbook>)
    function lerHtmlXls(texto) {
        if (/<Workbook[\s>]/i.test(texto) && /<Row[\s>]/i.test(texto)) {
            const d = xmlDoc(texto); return tags(d, 'Row').map(r => { const lin = []; let i = 0; tags(r, 'Cell').forEach(c => { const idx = Number(c.getAttribute('ss:Index') || c.getAttributeNS('urn:schemas-microsoft-com:office:spreadsheet', 'Index') || 0); if (idx) i = idx - 1; lin[i++] = ((tags(c, 'Data')[0] || {}).textContent || '').trim(); }); return Array.from(lin, x => x ?? ''); }).filter(r => r.some(x => x !== ''));
        }
        const d = new DOMParser().parseFromString(texto, 'text/html');
        d.querySelectorAll('br').forEach(b => b.replaceWith('\n')); // dois telefones na mesma célula ("62…<br>62…") continuam separados
        return [...d.querySelectorAll('tr')].map(tr => [...tr.children].map(td => (td.textContent || '').replace(/ /g, ' ').split('\n').map(s => s.trim()).filter(Boolean).join('\n'))).filter(r => r.some(x => x !== ''));
    }
    async function readTable(file) {
        const nome = file.name || '', buf = await file.arrayBuffer(), u8 = new Uint8Array(buf.slice(0, 8));
        if (/\.xls[xm]$/i.test(nome) || (u8[0] === 0x50 && u8[1] === 0x4b)) return { rows: await lerXlsx(buf), kind: 'xlsx' };
        if (u8[0] === 0xd0 && u8[1] === 0xcf && u8[2] === 0x11 && u8[3] === 0xe0) throw new Error('Esta é uma planilha .xls antiga (Excel 97-2003). Abra no Excel e use Arquivo › Salvar como › "Pasta de Trabalho do Excel (.xlsx)" e escolha o arquivo novo.');
        let texto; try { texto = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { texto = new TextDecoder('windows-1252').decode(buf); }
        if (/\.xls$/i.test(nome) || /^\s*(<\?xml|<html|<table|<!doctype)/i.test(texto.slice(0, 400))) return { rows: lerHtmlXls(texto), kind: 'xls' };
        return { rows: parseCSV(texto).rows, kind: 'csv' };
    }
    // Tira o ="0123" do Excel e o apóstrofo usado para manter zeros à esquerda
    const clean = v => { let s = String(v ?? '').trim(); if (/^=/.test(s)) s = s.slice(1).replace(/^"|"$/g, ''); if (/^'/.test(s)) s = s.slice(1); return s.trim(); };
    function num(v, style) {
        let s = clean(v).replace(/[R$\s%]/g, ''); if (!s) return null;
        s = style === 'br' ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
        const n = Number(s); return Number.isFinite(n) ? n : null;
    }
    function bool(v, dflt) {
        const s = norm(clean(v)); if (!s) return dflt;
        if (['sim', 's', 'yes', 'y', 'true', '1', 'ativo', 'ativa', 'x', 'a', 'on'].includes(s)) return true;
        if (['nao', 'n', 'no', 'false', '0', 'inativo', 'inativa', 'i', 'off', 'bloqueado'].includes(s)) return false;
        return dflt;
    }
    const unitOf = u => { const s = clean(u); if (!s) return 'un'; return window.DPCatalog ? DPCatalog.norm(s) : s.toLowerCase(); };

    function autoMap(headers) {
        const keys = headers.map(key), map = {};
        FIELDS.forEach(([f, , , names]) => { const i = names.map(n => keys.indexOf(n)).find(i => i > -1); map[f] = i === undefined ? -1 : i; });
        // Sem coluna "nome": a "descrição" costuma ser o nome do produto
        if (map.name < 0 && map.description > -1) { map.name = map.description; map.description = -1; }
        // Só uma coluna "Referência": ela fica como código (a busca acha pelos dois)
        if (map.reference > -1 && map.reference === map.code) map.reference = -1;
        return map;
    }
    function detectStyle(rows, map) {
        const cols = ['costPrice', 'salePrice', 'stock', 'minStock'].map(f => map[f]).filter(i => i > -1);
        for (const r of rows) for (const i of cols) { const s = clean(r[i]).replace(/[R$\s]/g, ''); if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) return 'br'; }
        return 'dot';
    }

    /* ---------- Monta os produtos ---------- */
    function build() {
        const { headers, rows, map, style } = S;
        const get = (r, f) => map[f] > -1 ? clean(r[map[f]]) : '';
        const fiscalCols = FISCAL_EXTRA.map(k => [k, headers.map(key).indexOf(k)]).filter(([, i]) => i > -1);
        const out = [];
        rows.forEach((r, idx) => {
            const warn = [];
            const name = get(r, 'name').replace(/\s+/g, ' ');
            if (!name) { out.push({ line: idx + 2, skip: true, warn: ['sem nome'] }); return; }
            const cost = num(get(r, 'costPrice'), style) || 0, price = num(get(r, 'salePrice'), style);
            if (!price) warn.push('sem preço de venda');
            const control = bool(get(r, 'controlStock'), true), active = bool(get(r, 'active'), true);
            const stock = num(get(r, 'stock'), style) || 0, min = num(get(r, 'minStock'), style) || 0;
            const img = get(r, 'image');
            const fiscal = {}; fiscalCols.forEach(([k, i]) => { const v = clean(r[i]); if (v !== '') fiscal[k] = v; });
            // 39.14 · Coluna "código de barras" com código interno misturado (36, 00570, THQG21683): só GTIN de verdade
            // (8, 12, 13 ou 14 números) fica como código de barras; o resto vira o código do produto (a busca acha igual)
            let code = get(r, 'code'), barcode = get(r, 'barcode');
            if (barcode && !/^(\d{8}|\d{12,14})$/.test(barcode.replace(/[\s.-]/g, ''))) { if (!code) code = barcode; barcode = ''; }
            if (/^\d+,\d+e\+\d+$/i.test(get(r, 'barcode'))) warn.push('código de barras estragado pelo Excel (use o arquivo .xlsx)');
            const desc = get(r, 'description');
            out.push({
                line: idx + 2, warn, name,
                category: get(r, 'category') || 'Geral',
                code, barcode: digits(barcode) || barcode,
                cost, price: price || 0, stock, min, unit: unitOf(get(r, 'unit')), brand: get(r, 'brand'),
                description: norm(desc).replace(/\s+/g, ' ') === norm(name).replace(/\s+/g, ' ') ? '' : desc, active, control,
                image: img, imageIsUrl: /^https?:\/\//i.test(img),
                ncm: digits(get(r, 'ncm')), cest: digits(get(r, 'cest')), cfop: digits(get(r, 'cfop')), csosn: digits(get(r, 'csosn')), origem: get(r, 'origem'),
                fiscal,
                // 38.2 · só vão para o produto as colunas que a planilha tem (atualizar não apaga o que já existe)
                ...(map.reference > -1 ? { reference: get(r, 'reference') } : {}), ...(map.application > -1 ? { application: get(r, 'application') } : {}), ...(map.stockLocation > -1 ? { stockLocation: get(r, 'stockLocation') } : {}),
                ...(map.gradeSize > -1 || map.gradeColor > -1 ? { gradeSize: get(r, 'gradeSize'), gradeColor: get(r, 'gradeColor') } : {}) // 38.6 · grade
            });
        });
        if (window.DPGrade && DPGrade.importNames) DPGrade.importNames(out); // 38.6 · "Calça Skinny" + 38 + Azul = "Calça Skinny · 38 · Azul"
        // Já existe no sistema? (código de barras → código → nome)
        const ex = S.existing;
        out.forEach(p => {
            if (p.skip) return;
            p.match = (p.barcode && ex.byBarcode.get(digits(p.barcode))) || (p.code && ex.byCode.get(norm(p.code))) || ex.byName.get(norm(p.name)) || null;
        });
        // Repetidos dentro da própria planilha
        const seen = new Map();
        out.forEach(p => { if (p.skip) return; const k = p.barcode ? 'b' + digits(p.barcode) : p.code ? 'c' + norm(p.code) : ''; if (!k) return; if (seen.has(k)) p.warn.push('código repetido na planilha (linha ' + seen.get(k) + ')'); else seen.set(k, p.line); });
        S.items = out;
    }

    /* ---------- Tela ---------- */
    function css() {
        if ($('impCss')) return;
        const st = document.createElement('style'); st.id = 'impCss';
        st.textContent = `
.imp-modal{width:min(1100px,calc(100vw - 24px));max-width:1100px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
.imp-modal .modal-body{overflow-y:auto;padding:18px 20px}
.imp-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:34px 18px;border:2px dashed var(--border-color);border-radius:16px;cursor:pointer;background:var(--bg-secondary);transition:border-color .15s,background .15s}
.imp-drop:hover,.imp-drop.over{border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.08))}
.imp-drop i{font-size:34px;color:var(--accent)}
.imp-drop b{font-size:15px;color:var(--text-heading)}
.imp-drop small{color:var(--text-muted);font-size:12px;max-width:560px;line-height:1.5}
.imp-folder{display:flex;gap:12px;align-items:center;margin-top:12px;padding:12px 14px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-card)}
.imp-folder .btn{flex-shrink:0}
.imp-folder small{font-size:12px;color:var(--text-muted);line-height:1.5}
.imp-pick{display:flex;flex-direction:column;gap:8px;align-items:flex-start}
@media (max-width:640px){.imp-folder{flex-direction:column;align-items:flex-start}}
.imp-help{margin-top:14px;font-size:12.5px;color:var(--text-secondary);line-height:1.6}
.imp-help b{color:var(--text-heading)}
.imp-sum{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin-bottom:14px}
.imp-card{border:1px solid var(--border-color);border-radius:12px;padding:11px 13px;background:var(--bg-secondary)}
.imp-card span{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.imp-card b{display:block;font-size:20px;color:var(--text-heading);margin-top:3px}
.imp-card small{display:block;font-size:11px;color:var(--text-muted)}
.imp-sec{border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:12px;background:var(--bg-card)}
.imp-sec h4{margin:0 0 10px;font-size:13.5px;color:var(--text-heading);display:flex;align-items:center;gap:8px}
.imp-sec h4 i{color:var(--accent)}
.imp-sec>p{margin:-4px 0 10px;font-size:12px;color:var(--text-muted)}
.imp-map{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 14px}
.imp-map label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-secondary)}
.imp-map label em{font-style:normal;color:#ef4444}
.imp-map select{font-size:12.5px;padding:7px 9px}
.imp-map label.miss select{border-color:#ef4444}
.imp-opts{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-primary)}
.imp-opts label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}
.imp-opts input{margin-top:3px;accent-color:var(--accent)}
.imp-opts small{display:block;color:var(--text-muted);font-size:11.5px}
.imp-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.imp-table-wrap{overflow-x:auto;border:1px solid var(--border-color);border-radius:12px}
.imp-table{width:100%;border-collapse:collapse;font-size:12px;min-width:860px}
.imp-table th{position:sticky;top:0;background:var(--bg-secondary);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);padding:8px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap}
.imp-table td{padding:7px 10px;border-bottom:1px solid var(--border-color);color:var(--text-primary);vertical-align:top}
.imp-table tr:last-child td{border-bottom:0}
.imp-table .r{text-align:right;white-space:nowrap}
.imp-table .nm{max-width:300px}
.imp-table .nm small{display:block;color:var(--text-muted);font-size:10.5px}
.imp-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap}
.imp-tag.new{background:rgba(16,185,129,.14);color:#10b981}.imp-tag.upd{background:rgba(59,130,246,.14);color:#3b82f6}.imp-tag.skip{background:rgba(100,116,139,.15);color:var(--text-muted)}.imp-tag.warn{background:rgba(245,158,11,.15);color:#d97706}
.imp-warns{font-size:12px;color:#d97706;margin-top:8px;line-height:1.55}
.imp-bar{height:10px;border-radius:99px;background:var(--bg-secondary);overflow:hidden;margin:14px 0 8px}
.imp-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.imp-done{text-align:center;padding:16px 8px}
.imp-done i.big{font-size:44px;color:#10b981}
.imp-done h3{margin:10px 0 6px;color:var(--text-heading)}
.imp-done p{color:var(--text-secondary);font-size:13px;line-height:1.6;margin:0 auto;max-width:620px}
.imp-modal .modal-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}
.imp-modal .modal-footer .sp{flex:1}
.imp-hist{margin-top:14px;font-size:12px;color:var(--text-muted)}
.imp-hist button{margin-left:6px}
@media(max-width:900px){.imp-sum{grid-template-columns:repeat(2,minmax(0,1fr))}.imp-map{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.imp-modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}.imp-map{grid-template-columns:1fr}.imp-modal .modal-footer .btn{flex:1;justify-content:center}.imp-modal .modal-footer .sp{display:none}}`;
        document.head.appendChild(st);
    }
    function shell() {
        if ($('impModal')) return;
        css();
        const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'impModal';
        ov.innerHTML = `<div class="modal imp-modal"><div class="modal-header"><h3><i class="fas fa-file-import" style="color:var(--accent);margin-right:8px"></i>Importar produtos de planilha</h3><button class="modal-close" type="button" data-imp="close"><i class="fas fa-times"></i></button></div><div class="modal-body" id="impBody"></div><div class="modal-footer" id="impFoot"></div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', onClick);
        ov.addEventListener('change', onChange);
    }
    function open() { shell(); S = null; stepFile(); $('impModal').classList.add('active'); }
    function close() { if (S && S.busy) { toast('warning', 'Aguarde a importação terminar.'); return; } $('impModal')?.classList.remove('active'); }

    function hist() { try { return JSON.parse(localStorage.getItem(HIST) || '[]'); } catch (e) { return []; } }
    function saveHistory(h) { try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, 10))); } catch (e) { } }

    function stepFile() {
        const last = hist().find(h => !h.undone && h.created);
        $('impBody').innerHTML = `<label class="imp-drop" id="impDrop"><input type="file" id="impFile" accept=".xlsx,.xls,.xlsm,.csv,.txt,text/csv,image/*" multiple hidden data-no-camera><i class="fas fa-file-excel"></i><b>Escolha a planilha de produtos (Excel ou CSV)</b><small>Arraste o arquivo aqui ou toque para escolher. Serve a planilha do Excel (.xlsx), a exportação .xls do sistema antigo do cliente ou um CSV. Tem as fotos também? Arraste a pasta inteira (planilha + fotos) que elas já entram junto.</small></label>
${FOLDER_OK ? `<div class="imp-folder"><label class="btn btn-outline btn-sm" style="cursor:pointer"><input type="file" id="impFolder" webkitdirectory multiple hidden data-no-camera><i class="fas fa-folder-open"></i> Escolher a pasta (planilha + fotos)</label><small>Escolha a pasta onde estão a planilha e as fotos: o sistema acha o CSV dos produtos e liga cada foto ao produto sozinho. Se o navegador perguntar se pode carregar os arquivos, confirme (nada sai do computador antes de você importar).</small></div>` : ''}
<div class="imp-help"><b>Como funciona:</b> o sistema reconhece as colunas pelo nome (nome, categoria, código, código de barras, preço de custo, preço de venda, estoque, unidade, ativo e os dados da nota fiscal: NCM, CEST, origem, CFOP, CSOSN/CST…). Antes de gravar você vê uma prévia, confere as colunas e escolhe o que fazer com produtos que já existem. As categorias que faltarem são criadas e o estoque entra como saldo inicial em Movimentações.<br><b>Planilha do Excel?</b> Escolha o arquivo .xlsx direto (não precisa salvar como CSV: o CSV do Excel estraga o código de barras).</div>
${last ? `<div class="imp-hist"><i class="fas fa-clock-rotate-left"></i> Última importação neste aparelho: <b>${esc(last.file)}</b> em ${new Date(last.at).toLocaleString('pt-BR')} (${last.created} produto(s) novo(s)).<button type="button" class="btn btn-outline btn-sm" data-imp="undo" data-id="${esc(last.id)}"><i class="fas fa-rotate-left"></i> Desfazer</button></div>` : ''}`;
        $('impFoot').innerHTML = `<span class="sp"></span><button class="btn btn-outline" type="button" data-imp="close">Fechar</button>`;
        const drop = $('impDrop');
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', e => { if (e.dataTransfer) droppedFiles(e.dataTransfer).then(files => { if (files.length) loadFiles(files); }); });
    }

    /* 35.52 · Planilha + fotos de uma vez: a pasta inteira (escolhida ou arrastada) ou o CSV junto com as fotos. */
    const FOLDER_OK = (() => { try { return 'webkitdirectory' in document.createElement('input') && !matchMedia('(pointer: coarse)').matches; } catch (e) { return false; } })();
    const isCsv = isPlanilha; // 39.14 · CSV, .xlsx ou .xls
    const isImg = f => /^image\//i.test(f.type || '') || /\.(jpe?g|png|webp|gif|bmp)$/i.test(f.name);
    let PICK = null; // várias planilhas na pasta: espera o usuário dizer qual é a de produtos
    // Arrastar uma pasta: os itens só valem durante o evento, por isso as entradas são lidas antes do primeiro await.
    async function droppedFiles(dt) {
        const plain = [...(dt.files || [])];
        const entries = [...(dt.items || [])].map(i => (i.webkitGetAsEntry ? i.webkitGetAsEntry() : null)).filter(Boolean);
        if (!entries.some(en => en.isDirectory)) return plain;
        const out = [];
        const walk = async en => {
            if (out.length >= 5000) return;
            if (en.isFile) { const f = await new Promise(r => en.file(r, () => r(null))); if (f) out.push(f); return; }
            if (!en.isDirectory) return;
            const rd = en.createReader();
            for (;;) { const part = await new Promise(r => rd.readEntries(r, () => r([]))); if (!part.length) break; for (const x of part) await walk(x); }
        };
        for (const en of entries) await walk(en);
        return out;
    }
    function loadFiles(list) {
        const files = [...list], csvs = files.filter(isCsv), imgs = files.filter(isImg);
        if (!csvs.length) { toast('warning', imgs.length ? 'Faltou a planilha (Excel ou CSV) junto com as fotos.' : 'Escolha a planilha: arquivo do Excel (.xlsx ou .xls) ou CSV.'); return; }
        const pick = csvs.length === 1 ? csvs[0] : csvs.find(f => /produt/i.test(f.name));
        if (pick) return loadFile(pick, imgs);
        PICK = { csvs, imgs };
        $('impBody').innerHTML = `<div class="imp-sec"><h4><i class="fas fa-file-csv"></i>Qual é a planilha de produtos?</h4><p>Achei ${csvs.length} planilhas${imgs.length ? ` e ${imgs.length} foto(s)` : ''} nessa pasta. Escolha a que tem os produtos:</p><div class="imp-pick">${csvs.map((f, i) => `<button type="button" class="btn btn-outline btn-sm" data-imp="pick" data-i="${i}"><i class="fas fa-file-csv"></i> ${esc(f.webkitRelativePath || f.name)}</button>`).join('')}</div></div>`;
        $('impFoot').innerHTML = `<button class="btn btn-outline" type="button" data-imp="again"><i class="fas fa-arrow-left"></i> Voltar</button>`;
    }

    async function loadExisting() {
        const [ps, cs] = await Promise.all([db.collection('products').get(), db.collection('categories').get()]);
        const products = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.deleted !== true);
        const cats = cs.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.deleted !== true);
        const byBarcode = new Map(), byCode = new Map(), byName = new Map();
        products.forEach(p => { if (digits(p.barcode)) byBarcode.set(digits(p.barcode), p); if (p.code) byCode.set(norm(p.code), p); if (p.name) byName.set(norm(p.name), p); });
        const catByName = new Map(); cats.forEach(c => { if (c.name) catByName.set(norm(c.name), c.name); });
        products.forEach(p => { if (p.category && !catByName.has(norm(p.category))) catByName.set(norm(p.category), p.category); });
        return { byBarcode, byCode, byName, catByName, count: products.length };
    }

    async function loadFile(file, imgs) {
        if (!isPlanilha(file)) { toast('warning', 'Escolha a planilha: arquivo do Excel (.xlsx ou .xls) ou CSV.'); return; }
        $('impBody').innerHTML = `<div class="imp-done"><i class="fas fa-spinner fa-spin big" style="color:var(--accent)"></i><h3>Lendo a planilha…</h3><p>${esc(file.name)}</p></div>`;
        try {
            const [{ rows, kind }, existing] = await Promise.all([readTable(file), loadExisting()]), delim = kind;
            if (rows.length < 2) throw new Error('A planilha está vazia ou só tem o cabeçalho.');
            const headers = rows[0].map(h => clean(h));
            const data = rows.slice(1).map(r => headers.map((_, i) => r[i] ?? ''));
            const map = autoMap(headers);
            S = { file: file.name, delim, headers, rows: data, map, existing, style: 'dot', mode: 'update', stockExisting: false, skipNoPrice: false, photos: new Map(), busy: false };
            (imgs || []).forEach(f => S.photos.set(norm(f.name), f)); // fotos que vieram junto (pasta ou vários arquivos)
            S.style = detectStyle(data, map);
            build(); stepPreview();
        } catch (e) { console.error(e); $('impBody').innerHTML = `<div class="imp-done"><i class="fas fa-triangle-exclamation big" style="color:#ef4444"></i><h3>Não foi possível ler a planilha</h3><p>${esc(e.message)}</p></div>`; $('impFoot').innerHTML = `<button class="btn btn-outline" type="button" data-imp="again"><i class="fas fa-arrow-left"></i> Escolher outro arquivo</button>`; }
    }

    function counts() {
        const items = S.items.filter(p => !p.skip), willSkipNoPrice = p => S.skipNoPrice && !p.price;
        const news = items.filter(p => !p.match && !willSkipNoPrice(p)), matches = items.filter(p => p.match && !willSkipNoPrice(p));
        const newCats = new Set(); items.forEach(p => { if (!S.existing.catByName.has(norm(p.category))) newCats.add(norm(p.category)); });
        const photoNames = items.filter(p => p.image && !p.imageIsUrl);
        return { items, news, matches, newCats: newCats.size, withStock: items.filter(p => p.control && p.stock > 0).length, invalid: S.items.filter(p => p.skip).length,
            photoNames, photosMatched: photoNames.filter(p => S.photos.has(norm(p.image.split(/[\\/]/).pop()))).length, noPrice: items.filter(p => !p.price).length };
    }

    function stepPreview() {
        const c = counts(), H = S.headers;
        const opt = (sel) => `<option value="-1">— não usar —</option>` + H.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || 'coluna ' + (i + 1))}</option>`).join('');
        const usedIdx = new Set(Object.values(S.map).filter(i => i > -1)), fiscalKeys = new Set(FISCAL_EXTRA);
        const ignored = H.filter((h, i) => !usedIdx.has(i) && !fiscalKeys.has(key(h)));
        const action = p => p.skip ? '<span class="imp-tag skip">Ignorada</span>' : (S.skipNoPrice && !p.price) ? '<span class="imp-tag skip">Pular</span>' : p.match ? (S.mode === 'skip' ? '<span class="imp-tag skip">Já existe · pular</span>' : S.mode === 'update' ? '<span class="imp-tag upd">Atualizar</span>' : '<span class="imp-tag new">Novo (cópia)</span>') : '<span class="imp-tag new">Novo</span>';
        const rows = S.items.slice(0, 30).map(p => p.skip ? `<tr><td>${p.line}</td><td colspan="8" class="nm">Linha sem nome</td><td>${action(p)}</td></tr>` : `<tr><td>${p.line}</td><td class="nm"><b>${esc(p.name)}</b><small>${esc([p.code, p.barcode].filter(Boolean).join(' · '))}</small></td><td>${esc(p.category)}</td><td class="r">${money(p.cost)}</td><td class="r"><b>${money(p.price)}</b></td><td class="r">${p.control ? esc(String(p.stock).replace('.', ',')) : 'serviço'}</td><td>${esc((window.DPCatalog ? DPCatalog.unit(p.unit).abbr : p.unit))}</td><td>${p.active ? 'Sim' : 'Não'}</td><td>${p.ncm ? esc(p.ncm) : '—'}</td><td>${action(p)}${p.warn.length ? ` <span class="imp-tag warn" title="${esc(p.warn.join(' · '))}">!</span>` : ''}</td></tr>`).join('');
        const warns = S.items.filter(p => !p.skip && p.warn.length).slice(0, 8).map(p => `Linha ${p.line} · ${esc(p.name)}: ${esc(p.warn.join(', '))}`);
        $('impBody').innerHTML = `
<div class="imp-sum">
  <div class="imp-card"><span>Produtos na planilha</span><b>${c.items.length}</b><small>${c.invalid ? c.invalid + ' linha(s) sem nome ignorada(s)' : esc(S.file)}</small></div>
  <div class="imp-card"><span>Novos</span><b>${c.news.length}</b><small>serão cadastrados</small></div>
  <div class="imp-card"><span>Já existem</span><b>${c.matches.length}</b><small>de ${S.existing.count} no sistema</small></div>
  <div class="imp-card"><span>Categorias novas</span><b>${c.newCats}</b><small>criadas sozinhas</small></div>
  <div class="imp-card"><span>Com estoque</span><b>${c.withStock}</b><small>entram como saldo inicial</small></div>
</div>
<div class="imp-sec"><h4><i class="fas fa-table-columns"></i>Colunas da planilha → campos do sistema</h4><p>Já reconhecidas pelo nome. Confira e troque se alguma estiver errada. Números lidos no formato ${S.style === 'br' ? '<b>1.234,56</b>' : '<b>1234.56</b>'}.</p>
  <div class="imp-map">${FIELDS.map(([f, label, req]) => `<label class="${req && S.map[f] < 0 ? 'miss' : ''}"><span>${esc(label)}${req ? ' <em>*</em>' : ''}</span><select class="form-control" data-map="${f}">${opt(S.map[f])}</select></label>`).join('')}</div>
  ${ignored.length ? `<p style="margin:10px 0 0">Colunas que não serão usadas: ${esc(ignored.join(', '))}.</p>` : ''}
</div>
<div class="imp-sec"><h4><i class="fas fa-sliders"></i>Opções</h4><div class="imp-opts">
  <div><b style="font-size:12.5px">Produtos que já existem no sistema</b> <small>(mesmo código de barras, código ou nome)</small></div>
  <label><input type="radio" name="impMode" value="update" ${S.mode === 'update' ? 'checked' : ''}><span>Atualizar o cadastro com os dados da planilha<small>Nome, preços, categoria, códigos, unidade e dados fiscais.</small></span></label>
  <label><input type="radio" name="impMode" value="skip" ${S.mode === 'skip' ? 'checked' : ''}><span>Pular (não mexer nos que já existem)</span></label>
  <label><input type="radio" name="impMode" value="dup" ${S.mode === 'dup' ? 'checked' : ''}><span>Cadastrar de novo mesmo assim</span></label>
  <label><input type="checkbox" id="impStockEx" ${S.stockExisting ? 'checked' : ''}><span>Nos que já existem, trocar o estoque pelo da planilha<small>Deixe desmarcado se a loja já está vendendo pelo sistema.</small></span></label>
  ${c.noPrice ? `<label><input type="checkbox" id="impSkipNoPrice" ${S.skipNoPrice ? 'checked' : ''}><span>Pular os ${c.noPrice} produto(s) sem preço de venda</span></label>` : ''}
</div></div>
${c.photoNames.length ? `<div class="imp-sec"><h4><i class="fas fa-image"></i>Fotos dos produtos <small style="font-weight:500;color:var(--text-muted)">(opcional)</small></h4><p>A planilha traz só o <b>nome do arquivo</b> da foto de ${c.photoNames.length} produto(s) (ex.: ${esc(c.photoNames[0].image)}). As fotos não vêm dentro do CSV: se você tiver a pasta de imagens do sistema antigo, escolha os arquivos e elas são ligadas a cada produto pelo nome.</p>
  <div class="imp-row"><label class="btn btn-outline btn-sm" style="cursor:pointer"><input type="file" id="impPhotos" accept="image/*" multiple hidden data-no-camera><i class="fas fa-images"></i> Escolher fotos</label><span style="font-size:12.5px;color:var(--text-secondary)">${S.photos.size ? `<b>${c.photosMatched}</b> de ${c.photoNames.length} fotos encontradas (${S.photos.size} arquivo(s) escolhido(s))` : 'Nenhuma foto escolhida: os produtos ficam com o ícone da categoria.'}</span></div></div>` : ''}
<div class="imp-sec"><h4><i class="fas fa-eye"></i>Prévia ${S.items.length > 30 ? '<small style="font-weight:500;color:var(--text-muted)">(primeiras 30 linhas)</small>' : ''}</h4>
  <div class="imp-table-wrap"><table class="imp-table"><thead><tr><th>Linha</th><th>Produto</th><th>Categoria</th><th class="r">Custo</th><th class="r">Venda</th><th class="r">Estoque</th><th>Un.</th><th>Ativo</th><th>NCM</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${warns.length ? `<div class="imp-warns"><i class="fas fa-triangle-exclamation"></i> ${warns.join('<br>')}${S.items.filter(p => !p.skip && p.warn.length).length > 8 ? '<br>…' : ''}</div>` : ''}
</div>`;
        const missing = FIELDS.filter(([f, , req]) => req && S.map[f] < 0);
        const total = c.news.length + (S.mode === 'skip' ? 0 : c.matches.length);
        $('impFoot').innerHTML = `<button class="btn btn-outline" type="button" data-imp="again"><i class="fas fa-arrow-left"></i> Outro arquivo</button><span class="sp"></span><button class="btn btn-primary" type="button" data-imp="run" ${missing.length || !total ? 'disabled' : ''}><i class="fas fa-file-import"></i> ${missing.length ? 'Escolha a coluna de ' + esc(missing[0][1]) : `Importar ${total} produto(s)`}</button>`;
    }

    function onChange(e) {
        const t = e.target;
        if ((t.id === 'impFile' || t.id === 'impFolder') && t.files.length) return loadFiles(t.files);
        if (!S) return;
        if (t.dataset.map) { S.map[t.dataset.map] = Number(t.value); if (['costPrice', 'salePrice', 'stock', 'minStock'].includes(t.dataset.map)) S.style = detectStyle(S.rows, S.map); build(); return stepPreview(); }
        if (t.name === 'impMode') { S.mode = t.value; return stepPreview(); }
        if (t.id === 'impStockEx') { S.stockExisting = t.checked; return; }
        if (t.id === 'impSkipNoPrice') { S.skipNoPrice = t.checked; return stepPreview(); }
        if (t.id === 'impPhotos') { [...t.files].forEach(f => S.photos.set(norm(f.name), f)); return stepPreview(); }
    }
    function onClick(e) {
        const b = e.target.closest('[data-imp]'); if (!b) return;
        const a = b.dataset.imp;
        if (a === 'close') return close();
        if (a === 'again') { if (S && S.busy) return; S = null; PICK = null; return stepFile(); }
        if (a === 'pick' && PICK) { const f = PICK.csvs[Number(b.dataset.i)], imgs = PICK.imgs; PICK = null; if (f) return loadFile(f, imgs); return; }
        if (a === 'run') return run();
        if (a === 'undo') return undo(b.dataset.id, b);
        if (a === 'reload') { close(); return; }
    }

    /* ---------- Gravação ---------- */
    // 39.3 · Mesma redução da tela de Produtos (DPImagem): sem a moldura fixa de 800x500 e com teto de bytes.
    // Uma foto que não der para ler vira '' (o produto entra sem foto), como antes.
    function photoData(file) {
        if (window.DPImagem) return DPImagem.reduzir(file, { maxLado: 1000, maxBytes: DPImagem.LIMITES.produto, transparencia: 'auto' }).catch(() => '');
        return new Promise(resolve => {
            const fr = new FileReader();
            fr.onerror = () => resolve('');
            fr.onload = () => {
                const img = new Image();
                img.onerror = () => resolve('');
                img.onload = () => {
                    const max = 1000, s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
                    const cv = document.createElement('canvas'); cv.width = Math.max(1, Math.round(img.naturalWidth * s)); cv.height = Math.max(1, Math.round(img.naturalHeight * s));
                    const ctx = cv.getContext('2d'); ctx.imageSmoothingQuality = 'high'; ctx.drawImage(img, 0, 0, cv.width, cv.height);
                    let url; try { url = cv.toDataURL('image/webp', 0.78); } catch (e) { url = ''; }
                    if (!url || url.length < 30 || !/^data:image\/webp/.test(url)) url = cv.toDataURL('image/jpeg', 0.8);
                    resolve(url);
                };
                img.src = fr.result;
            };
            fr.readAsDataURL(file);
        });
    }
    function productData(p, batchId, catName) {
        const margin = p.cost > 0 ? Number(((p.price - p.cost) / p.cost * 100).toFixed(1)) : 0;
        const d = {
            name: p.name, code: p.code, barcode: p.barcode, unit: p.unit || 'un', category: catName, brand: p.brand,
            costPrice: Math.round(p.cost * 100) / 100, salePrice: Math.round(p.price * 100) / 100, profitMargin: margin,
            minStock: p.min, status: p.active ? 'active' : 'inactive', active: p.active, description: p.description,
            productType: p.control ? 'product' : 'service', controlStock: p.control,
            ncm: p.ncm, cest: p.cest, cfop: p.cfop, csosn: p.csosn, origem: p.origem
        };
        if (Object.keys(p.fiscal).length) d.fiscal = p.fiscal;
        if (p.image && !p.imageIsUrl) d.legacyImage = p.image;
        ['reference', 'application', 'stockLocation'].forEach(k => { if (p[k] !== undefined) d[k] = p[k]; }); // 38.2 · autopeças
        return d;
    }
    async function commitChunks(ops, onStep) {
        const imgs = ops.some(o => o.data && o.data.imageFile);
        const size = imgs ? 12 : 40;
        for (let i = 0; i < ops.length; i += size) {
            const part = ops.slice(i, i + size), batch = db.batch();
            part.forEach(o => o.kind === 'set' ? batch.set(o.ref, o.data) : batch.update(o.ref, o.data));
            await batch.commit();
            onStep(Math.min(ops.length, i + size), ops.length);
        }
    }

    async function run() {
        if (!S || S.busy) return;
        const c = counts();
        const total = c.news.length + (S.mode === 'skip' ? 0 : c.matches.length);
        if (!total) return;
        if (!window.confirm(`Importar ${total} produto(s) de "${S.file}"?\n\n• ${c.news.length} novo(s)${S.mode === 'update' && c.matches.length ? `\n• ${c.matches.length} atualizado(s)` : ''}${S.mode === 'dup' && c.matches.length ? `\n• ${c.matches.length} cadastrado(s) de novo` : ''}${c.newCats ? `\n• ${c.newCats} categoria(s) nova(s)` : ''}`)) return;
        S.busy = true;
        const batchId = 'imp_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        $('impFoot').innerHTML = '';
        $('impBody').innerHTML = `<div class="imp-done"><i class="fas fa-spinner fa-spin big" style="color:var(--accent)"></i><h3>Importando produtos…</h3><p id="impStatus">Preparando…</p><div class="imp-bar"><i id="impBar"></i></div><p style="font-size:12px;color:var(--text-muted)">Não feche esta janela até terminar.</p></div>`;
        const status = t => { const el = $('impStatus'); if (el) el.textContent = t; };
        const bar = p => { const el = $('impBar'); if (el) el.style.width = Math.round(p * 100) + '%'; };
        const res = { created: 0, updated: 0, skipped: 0, cats: 0, moves: 0, photos: 0, errors: [] };
        try {
            // 1) Categorias que faltam
            const catOps = [], catNames = new Map(S.existing.catByName);
            c.items.forEach(p => {
                const k = norm(p.category); if (catNames.has(k)) return;
                catNames.set(k, p.category);
                catOps.push({ kind: 'set', ref: db.collection('categories').doc(), data: { name: p.category, icon: catIcon(p.category), color: '#6366f1', active: true, deleted: false, importBatch: batchId, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
            });
            if (catOps.length) { status(`Criando ${catOps.length} categoria(s)…`); await commitChunks(catOps, () => { }); res.cats = catOps.length; }
            // 2) Produtos (+ saldo inicial em Movimentações)
            const ops = [], todo = c.items.filter(p => !(S.skipNoPrice && !p.price));
            // 38.6 · Linhas com tamanho/cor: cria (ou acha) o produto-pai da grade e dá código de barras aos tamanhos (grade-v1.js)
            const grade = window.DPGrade && DPGrade.importPrep ? await DPGrade.importPrep(todo.filter(p => !(p.match && S.mode === 'skip')), { catNames, batchId, file: S.file }) : null;
            if (grade) { status(`Montando ${grade.parents} grade(s) de tamanho e cor…`); grade.ops.forEach(o => ops.push(o)); }
            for (let i = 0; i < todo.length; i++) {
                const p = todo[i], catName = catNames.get(norm(p.category)) || p.category;
                if (p.match && S.mode === 'skip') { res.skipped++; continue; }
                const d = productData(p, batchId, catName);
                const photo = p.image && !p.imageIsUrl ? S.photos.get(norm(p.image.split(/[\\/]/).pop())) : null;
                if (photo) { status(`Preparando fotos… ${i + 1} de ${todo.length}`); bar(i / todo.length * 0.3); const url = await photoData(photo); if (url) { Object.assign(d, { imageType: 'file', imageUrl: '', imageFile: url }); res.photos++; } }
                else if (p.imageIsUrl) Object.assign(d, { imageType: 'url', imageUrl: p.image, imageFile: '' });
                if (p.match && S.mode === 'update') {
                    if (p.control && S.stockExisting) d.currentStock = p.stock;
                    ops.push({ kind: 'update', ref: db.collection('products').doc(p.match.id), data: { ...d, ...(grade ? grade.fields(p) : {}), updatedAt: ts(), updatedBy: uid() } });
                    res.updated++;
                    if (p.control && S.stockExisting && p.stock !== Number(p.match.currentStock || 0)) {
                        ops.push({ kind: 'set', ref: db.collection('stock_movements').doc(), data: { productId: p.match.id, productName: p.name, type: 'adjustment', quantity: p.stock - Number(p.match.currentStock || 0), previousStock: Number(p.match.currentStock || 0), newStock: p.stock, reason: 'Ajuste pela importação da planilha', referenceType: 'import', referenceId: batchId, costPrice: d.costPrice, notes: S.file, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
                        res.moves++;
                    }
                    continue;
                }
                const ref = db.collection('products').doc();
                const full = { imageType: 'icon', icon: catIcon(catName), imageUrl: '', imageFile: '', volume: '', promoPrice: null, stockLocation: '', supplierId: '', supplierName: '', packagings: [], ...d, ...(grade ? grade.fields(p) : {}), currentStock: p.control ? p.stock : 0, importBatch: batchId, importSource: S.file, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() };
                ops.push({ kind: 'set', ref, data: full });
                res.created++;
                if (p.control && p.stock > 0) {
                    ops.push({ kind: 'set', ref: db.collection('stock_movements').doc(), data: { productId: ref.id, productName: p.name, type: 'entry', quantity: p.stock, previousStock: 0, newStock: p.stock, reason: 'Saldo inicial (importação da planilha)', referenceType: 'import', referenceId: batchId, costPrice: d.costPrice, notes: S.file, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
                    res.moves++;
                }
            }
            status(`Gravando ${res.created + res.updated} produto(s)…`);
            await commitChunks(ops, (n, t) => { bar(0.3 + 0.7 * n / t); status(`Gravando… ${n} de ${t} registros`); });
            const h = hist(); h.unshift({ id: batchId, file: S.file, at: Date.now(), created: res.created, updated: res.updated, cats: res.cats }); saveHistory(h);
            try { if (typeof window.AuditService !== 'undefined') AuditService.log('import', 'products', batchId, { file: S.file, created: res.created, updated: res.updated }); } catch (e) { }
            done(res, batchId);
        } catch (e) {
            console.error(e);
            S.busy = false;
            $('impBody').innerHTML = `<div class="imp-done"><i class="fas fa-triangle-exclamation big" style="color:#ef4444"></i><h3>A importação parou no meio</h3><p>${esc(e.message || 'Erro ao gravar')}.<br>Parte dos produtos pode já ter sido gravada. Use <b>Desfazer</b> para apagar o que entrou e tente de novo.</p></div>`;
            const h = hist(); h.unshift({ id: batchId, file: S.file, at: Date.now(), created: res.created, updated: 0, cats: res.cats, partial: true }); saveHistory(h);
            $('impFoot').innerHTML = `<button class="btn btn-outline" type="button" data-imp="undo" data-id="${esc(batchId)}"><i class="fas fa-rotate-left"></i> Desfazer o que entrou</button><span class="sp"></span><button class="btn btn-primary" type="button" data-imp="close">Fechar</button>`;
        }
        reloadPage();
    }
    function done(res, batchId) {
        S.busy = false;
        $('impBody').innerHTML = `<div class="imp-done"><i class="fas fa-circle-check big"></i><h3>Importação concluída!</h3><p><b>${res.created}</b> produto(s) cadastrado(s)${res.updated ? `, <b>${res.updated}</b> atualizado(s)` : ''}${res.skipped ? `, ${res.skipped} pulado(s)` : ''}.${res.cats ? ` ${res.cats} categoria(s) criada(s).` : ''}${res.moves ? ` ${res.moves} saldo(s) de estoque registrado(s) em Movimentações.` : ''}${res.photos ? ` ${res.photos} foto(s) ligada(s).` : ''}</p>
<p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Se algo saiu errado, "Desfazer importação" apaga os produtos novos, as categorias criadas e os saldos lançados agora. Produtos que já existiam e foram atualizados não voltam ao que eram.</p></div>`;
        $('impFoot').innerHTML = `<button class="btn btn-outline" type="button" data-imp="undo" data-id="${esc(batchId)}"><i class="fas fa-rotate-left"></i> Desfazer importação</button><span class="sp"></span><button class="btn btn-primary" type="button" data-imp="close"><i class="fas fa-check"></i> Ver os produtos</button>`;
        toast('success', `${res.created + res.updated} produto(s) importado(s)!`);
    }
    function reloadPage() {
        try { if (typeof window.loadProductsList === 'function') window.loadProductsList(); } catch (e) { }
        try { if (typeof window.loadCategoriesForSelect === 'function') window.loadCategoriesForSelect(); } catch (e) { }
    }

    async function undo(batchId, btn) {
        if (!batchId || (S && S.busy)) return;
        if (!window.confirm('Desfazer esta importação?\n\nOs produtos novos, as categorias criadas e os saldos de estoque lançados por ela serão excluídos. Produtos que já existiam e foram atualizados continuam como estão.')) return;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Desfazendo…'; }
        try {
            const del = { deleted: true, deletedAt: ts(), deletedBy: uid() };
            const [ps, cs, ms] = await Promise.all([
                db.collection('products').where('importBatch', '==', batchId).get(),
                db.collection('categories').where('importBatch', '==', batchId).get(),
                db.collection('stock_movements').where('referenceId', '==', batchId).get()
            ]);
            const ops = [];
            ps.docs.filter(d => d.data().deleted !== true).forEach(d => ops.push({ kind: 'update', ref: db.collection('products').doc(d.id), data: { ...del, status: 'inactive', active: false } }));
            cs.docs.filter(d => d.data().deleted !== true).forEach(d => ops.push({ kind: 'update', ref: db.collection('categories').doc(d.id), data: del }));
            ms.docs.filter(d => d.data().deleted !== true && d.data().referenceType === 'import').forEach(d => ops.push({ kind: 'update', ref: db.collection('stock_movements').doc(d.id), data: del }));
            await commitChunks(ops, () => { });
            const h = hist().map(x => x.id === batchId ? { ...x, undone: true } : x); saveHistory(h);
            toast('success', `Importação desfeita: ${ps.size} produto(s) removido(s).`);
            reloadPage(); S = null; stepFile();
        } catch (e) { console.error(e); toast('error', 'Não foi possível desfazer: ' + esc(e.message)); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-rotate-left"></i> Desfazer'; } }
    }

    window.dpImportProducts = { open, close };
    // 38.1 · O mesmo leitor de planilha serve para Clientes e Fornecedores (importar-clientes-v1.js)
    const numStyle = (rows, cols) => { for (const r of rows) for (const i of cols) { const s = clean(r[i]).replace(/[R$\s]/g, ''); if (/^-?\d{1,3}(\.\d{3})+,\d+$/.test(s) || /^-?\d+,\d+$/.test(s)) return 'br'; } return 'dot'; };
    const mapCols = (headers, fields) => { const keys = headers.map(key), map = {}; fields.forEach(([f, , , names]) => { const i = names.map(n => keys.indexOf(n)).find(i => i > -1); map[f] = i === undefined ? -1 : i; }); return map; };
    window.DPPlanilha = { readText, parseCSV, readTable, isPlanilha, clean, num, bool, norm, key, digits, numStyle, mapCols };
})();
