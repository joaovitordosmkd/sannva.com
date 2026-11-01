/* DistribuiPro 39.0 · Importar a nota fiscal de compra (XML da NF-e) — Produtos e Compras › "Importar XML da nota".
   O cliente comprou do fornecedor e recebeu o XML: em vez de digitar, ele escolhe o arquivo e o sistema
   - lê a nota no próprio navegador (nfeProc/NFe, modelo 55 ou 65) e confere a chave de acesso (a mesma nota não entra duas vezes);
   - acha o fornecedor pelo CNPJ (ou cadastra com os dados do emitente);
   - liga cada item a um produto: código de barras (GTIN) → código do fornecedor já usado antes (products.nfeCodes = "CNPJ:cProd")
     → nome igual. O que não achar vira produto novo (ou o usuário escolhe o produto certo / não importa o item);
   - embalagem: "CX com 12" vira 12 unidades no estoque (fator por item, lembrado para a próxima nota);
   - custo real por unidade: valor do item − desconto + frete, seguro, outras despesas, IPI e ICMS-ST rateados pela nota;
   - registra a compra já recebida (purchases, origem 'nfe-xml'), dá entrada no estoque (StockService → Movimentações),
     recalcula o custo médio (custo-medio-v1.js) e lança as duplicatas da nota em Contas a Pagar (compras-pro-v1.js).
   Desfazer: Compras › Cancelar a compra (tira do estoque e cancela as contas em aberto). */
(function () {
    'use strict';
    if (window.DPImportNFe) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const digits = s => String(s || '').replace(/\D/g, '');
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const r4 = v => Math.round((Number(v) || 0) * 10000) / 10000;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qf = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore.FieldValue);
    const ts = () => FV().serverTimestamp();
    const tsOf = d => (window.DPTimestamp || firebase.firestore.Timestamp).fromDate(d);
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const DEMO = () => !!(window.db && db.__isLocalDemo);
    const SDOC = () => (DEMO() ? 'demo_general' : 'general');
    const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const dOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
    const fmtCnpj = s => { const d = digits(s); return d.length === 14 ? d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5') : d.length === 11 ? d.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, '$1.$2.$3-$4') : d; };
    const validGtin = s => { const d = digits(s); if (![8, 12, 13, 14].includes(d.length) || /^0+$/.test(d)) return ''; let sum = 0; for (let i = d.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) sum += +d[i] * w; return (10 - sum % 10) % 10 === +d[d.length - 1] ? d : ''; };
    const ICON = '<i class="fas fa-file-code" style="color:var(--accent);margin-right:8px"></i>';
    // Categoria do produto novo pelo NCM: [prefixo, categoria, outros nomes que o cliente pode já usar]
    const NCM_CATS = [['2203', 'Cervejas', ['cerveja', 'cervejas', 'bebidas']], ['2204', 'Vinhos', ['vinho', 'vinhos', 'bebidas']], ['2208', 'Destilados', ['destilados', 'bebidas']], ['2201', 'Águas', ['agua', 'aguas', 'bebidas']], ['2202', 'Refrigerantes', ['refrigerante', 'refrigerantes', 'bebidas']], ['22', 'Bebidas', ['bebida']],
        ['24', 'Tabacaria', ['cigarros', 'tabaco']], ['0401', 'Laticínios', ['frios', 'laticinio']], ['0402', 'Laticínios', ['frios']], ['0406', 'Laticínios', ['frios', 'queijos']], ['02', 'Carnes', ['acougue', 'carne']], ['03', 'Peixes', ['peixaria']], ['07', 'Hortifruti', ['verduras', 'legumes']], ['08', 'Hortifruti', ['frutas']],
        ['09', 'Mercearia', ['cafe', 'temperos']], ['10', 'Mercearia', ['graos', 'cereais']], ['11', 'Mercearia', ['farinhas']], ['15', 'Mercearia', ['oleos']], ['17', 'Doces', ['balas', 'bomboniere', 'doces']], ['18', 'Doces', ['chocolates', 'bomboniere']], ['19', 'Padaria', ['massas', 'biscoitos', 'mercearia']], ['20', 'Mercearia', ['conservas']], ['21', 'Mercearia', ['alimentos']],
        ['2309', 'Pet', ['petshop', 'racao', 'racoes']], ['30', 'Farmácia', ['medicamentos']], ['33', 'Higiene e beleza', ['higiene', 'perfumaria', 'cosmeticos', 'beleza']], ['3401', 'Limpeza', ['higiene']], ['34', 'Limpeza', ['produtos de limpeza']], ['3808', 'Limpeza', ['inseticidas']], ['3819', 'Autopeças', ['fluidos', 'oleos']], ['2710', 'Lubrificantes', ['oleos', 'autopecas']],
        ['39', 'Utilidades', ['descartaveis', 'plasticos']], ['4818', 'Descartáveis', ['higiene', 'papel']], ['48', 'Papelaria', ['papel']], ['61', 'Roupas', ['vestuario', 'moda']], ['62', 'Roupas', ['vestuario', 'moda']], ['64', 'Calçados', ['calcado', 'sapatos']], ['4011', 'Pneus', ['autopecas']],
        ['8708', 'Autopeças', ['pecas']], ['8714', 'Peças de moto', ['autopecas', 'motopecas']], ['8507', 'Baterias', ['autopecas']], ['8539', 'Iluminação', ['lampadas', 'autopecas']], ['8517', 'Celulares', ['eletronicos', 'acessorios']], ['85', 'Eletrônicos', ['eletrica', 'eletronicos']], ['84', 'Máquinas e equipamentos', ['equipamentos']], ['82', 'Ferramentas', ['ferramenta']], ['73', 'Ferragens', ['ferragem']], ['94', 'Móveis', ['moveis']], ['95', 'Brinquedos', ['brinquedo']]];
    function catFor(ncm, cats, fallback) {
        const n = digits(ncm), hit = n ? NCM_CATS.filter(([p]) => n.startsWith(p)).sort((a, b) => b[0].length - a[0].length)[0] : null;
        if (!hit) return fallback;
        const names = [hit[1], ...hit[2]].map(norm), have = cats.find(c => names.includes(norm(c))) || cats.find(c => names.some(x => norm(c).startsWith(x)));
        return have || hit[1];
    }

    let S = null; // importação aberta

    /* ============ Leitura do XML da NF-e ============ */
    const first = (el, name) => el ? (el.getElementsByTagNameNS('*', name)[0] || el.getElementsByTagName(name)[0] || null) : null;
    const all = (el, name) => el ? [...(el.getElementsByTagNameNS('*', name).length ? el.getElementsByTagNameNS('*', name) : el.getElementsByTagName(name))] : [];
    const txt = (el, name) => { const x = first(el, name); return x ? String(x.textContent || '').trim() : ''; };
    const num = (el, name) => { const v = parseFloat(txt(el, name)); return Number.isFinite(v) ? v : 0; };
    const child = (el, name) => el ? [...el.children].find(c => c.localName === name) || null : null; // filho direto (evita pegar o CNPJ do transportador)

    async function readFile(file) {
        const buf = await file.arrayBuffer();
        let text;
        try { text = new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch (e) { text = new TextDecoder('windows-1252').decode(buf); }
        return text.replace(/^﻿/, '');
    }
    function parseNFe(text) {
        const doc = new DOMParser().parseFromString(text, 'application/xml');
        if (doc.getElementsByTagName('parsererror').length) throw new Error('O arquivo não é um XML válido. Baixe de novo o XML da nota (o arquivo .xml, não o PDF do DANFE).');
        if (first(doc, 'resNFe')) throw new Error('Este XML é só o resumo da nota (sem os itens). Baixe o XML completo no portal da SEFAZ ou peça ao fornecedor.');
        if (first(doc, 'procEventoNFe') || first(doc, 'evento')) throw new Error('Este XML é um evento (cancelamento ou carta de correção), não a nota. Escolha o XML da NF-e.');
        const inf = first(doc, 'infNFe');
        if (!inf) throw new Error('Não encontrei uma NF-e neste arquivo. Escolha o XML da nota fiscal de compra.');
        const key = digits(inf.getAttribute('Id') || '') || digits(txt(first(doc, 'infProt'), 'chNFe'));
        const ide = child(inf, 'ide'), emit = child(inf, 'emit'), dest = child(inf, 'dest'), tot = first(child(inf, 'total'), 'ICMSTot');
        const cStat = txt(first(doc, 'infProt'), 'cStat');
        const tpNF = txt(ide, 'tpNF'); // 0 = entrada (emitida pelo próprio destinatário), 1 = saída
        const end = child(emit, 'enderEmit');
        const nf = {
            key, model: txt(ide, 'mod'), number: txt(ide, 'nNF'), serie: txt(ide, 'serie'), nature: txt(ide, 'natOp'), tpNF,
            issuedAt: txt(ide, 'dhEmi') || txt(ide, 'dEmi'), authorized: !cStat || ['100', '150'].includes(cStat), cStat,
            emit: {
                cnpj: digits(txt(emit, 'CNPJ') || txt(emit, 'CPF')), name: txt(emit, 'xNome'), fantasy: txt(emit, 'xFant'), ie: txt(emit, 'IE'),
                phone: digits(txt(end, 'fone')), street: txt(end, 'xLgr'), number: txt(end, 'nro'), district: txt(end, 'xBairro'),
                city: txt(end, 'xMun'), state: txt(end, 'UF'), zip: digits(txt(end, 'CEP'))
            },
            dest: { cnpj: digits(txt(dest, 'CNPJ') || txt(dest, 'CPF')), name: txt(dest, 'xNome') },
            totals: { products: num(tot, 'vProd'), discount: num(tot, 'vDesc'), freight: num(tot, 'vFrete'), insurance: num(tot, 'vSeg'), other: num(tot, 'vOutro'), ipi: num(tot, 'vIPI'), st: num(tot, 'vST'), fcpSt: num(tot, 'vFCPST'), total: num(tot, 'vNF') },
            dups: all(child(inf, 'cobr'), 'dup').map(d => ({ n: txt(d, 'nDup'), due: txt(d, 'dVenc'), amount: num(d, 'vDup') })).filter(d => d.amount > 0),
            payTypes: all(child(inf, 'pag'), 'tPag').map(x => String(x.textContent || '').trim()),
            items: []
        };
        if (!nf.emit.cnpj || !nf.number) throw new Error('A nota está incompleta (sem CNPJ do emitente ou número).');
        all(inf, 'det').forEach((det, i) => {
            const p = child(det, 'prod'), imp = child(det, 'imposto'); if (!p) return;
            const icms = first(imp, 'ICMS'), icmsGrp = icms && icms.children[0];
            const ipi = num(first(first(imp, 'IPI'), 'IPITrib'), 'vIPI');
            const st = icmsGrp ? num(icmsGrp, 'vICMSST') + num(icmsGrp, 'vFCPST') : 0;
            const qCom = num(p, 'qCom'), qTrib = num(p, 'qTrib');
            nf.items.push({
                n: Number(det.getAttribute('nItem')) || i + 1,
                code: txt(p, 'cProd'), gtin: validGtin(txt(p, 'cEAN')) || validGtin(txt(p, 'cEANTrib')),
                gtinTrib: validGtin(txt(p, 'cEANTrib')), name: txt(p, 'xProd').replace(/\s+/g, ' '),
                ncm: digits(txt(p, 'NCM')), cest: digits(txt(p, 'CEST')), cfop: digits(txt(p, 'CFOP')),
                unit: txt(p, 'uCom'), qty: qCom, unitPrice: num(p, 'vUnCom'), unitTrib: txt(p, 'uTrib'), qtyTrib: qTrib,
                gross: num(p, 'vProd'), discount: num(p, 'vDesc'), freight: num(p, 'vFrete'), insurance: num(p, 'vSeg'), other: num(p, 'vOutro'),
                ipi, st, origem: icmsGrp ? txt(icmsGrp, 'orig') : '', info: txt(det, 'infAdProd')
            });
        });
        if (!nf.items.length) throw new Error('A nota não tem itens.');
        return nf;
    }
    // Quantas unidades vêm na embalagem do item (CX 12, FD C/6, PCT 10UN…): 1) unidade tributável x comercial; 2) texto do nome
    function guessFactor(it) {
        const u = norm(it.unit);
        if (/^(un|und|unid|unidade|pc|pca|peca|kg|g|lt|l|ml|m|m2|m3|mt|cm)$/.test(u)) return 1;
        if (it.qtyTrib > 0 && it.qty > 0 && norm(it.unitTrib) !== u && /^(un|und|unid|pc|pca|peca)$/.test(norm(it.unitTrib))) {
            const f = it.qtyTrib / it.qty; if (f > 1 && Math.abs(f - Math.round(f)) < 0.001) return Math.round(f);
        }
        const txtAll = it.name + ' ' + (it.info || ''); // nome + informações adicionais do item ("FARDO COM 6 UNIDADES")
        const m = /(?:c\/|cx\s*c?\/?|com|x)\s*(\d{1,4})\s*(?:un|und|unid|pc|pcs|uni|garr|lt|lat)?\b/i.exec(txtAll) || /\b(\d{1,4})\s*(?:un|und|unid|unidades)\b/i.exec(txtAll);
        if (m && /^(cx|fd|fardo|pct|pc?t|dz|duzia|emb|caixa|display|dp|kit|pack|bd|bandeja|sc|saco)/.test(u)) { const f = +m[1]; if (f > 1 && f <= 1000) return f; }
        if (/^dz|duzia$/.test(u)) return 12;
        return 1;
    }
    // Custo real do item: valor − desconto + frete/seguro/outras + IPI + ST (se a nota trouxe só no total, rateia pelo valor dos itens)
    function itemCosts(nf) {
        const T = nf.totals, sum = k => nf.items.reduce((s, x) => s + x[k], 0);
        const share = (k, totalVal) => { const inItems = sum(k); const rest = r2(totalVal - inItems); return rest > 0.009 ? rest : 0; };
        const base = sum('gross') || 1;
        const extra = { freight: share('freight', T.freight), insurance: share('insurance', T.insurance), other: share('other', T.other), discount: share('discount', T.discount), ipi: share('ipi', T.ipi), st: share('st', T.st + T.fcpSt) };
        nf.items.forEach(it => {
            const w = it.gross / base;
            it.extras = r2(it.freight + it.insurance + it.other + it.ipi + it.st - it.discount + w * (extra.freight + extra.insurance + extra.other + extra.ipi + extra.st - extra.discount));
            it.total = r2(it.gross + it.extras);
        });
    }

    /* ============ Dados que já existem no sistema ============ */
    async function loadExisting(nf) {
        const [ps, cs, ss, pu, sd] = await Promise.all([
            db.collection('products').get(), db.collection('categories').get(), db.collection('suppliers').get(),
            nf.key ? db.collection('purchases').where('nfeKey', '==', nf.key).get().catch(() => ({ docs: [] })) : Promise.resolve({ docs: [] }),
            db.collection('settings').doc(SDOC()).get().catch(() => null)
        ]);
        const products = ps.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.deleted !== true && !p.isGradeParent);
        const byBarcode = new Map(), byNfe = new Map(), byName = new Map();
        products.forEach(p => {
            if (digits(p.barcode)) byBarcode.set(digits(p.barcode), p);
            (Array.isArray(p.packagings) ? p.packagings : []).forEach(k => { if (digits(k.barcode)) byBarcode.set(digits(k.barcode), p); });
            (Array.isArray(p.nfeCodes) ? p.nfeCodes : []).forEach(c => byNfe.set(String(c), p));
            if (p.name) byName.set(norm(p.name), p);
        });
        const cats = cs.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.deleted !== true && c.name).map(c => c.name);
        const supplier = ss.docs.map(d => ({ id: d.id, ...d.data() })).find(s => s.deleted !== true && digits(s.cnpj) === nf.emit.cnpj) || null;
        const dup = pu.docs.map(d => ({ id: d.id, ...d.data() })).find(p => p.deleted !== true && p.status !== 'cancelled') || null;
        const g = sd && sd.exists ? (sd.data() || {}) : {};
        const margin = g.margemPadrao !== undefined && g.margemPadrao !== '' ? (parseFloat(g.margemPadrao) || 50) : 50;
        return { products, byBarcode, byNfe, byName, cats, supplier, dup, myCnpj: digits(g.cnpj), margin, factors: g.nfeFactors || {} };
    }
    function matchItems() {
        const ex = S.ex, cnpj = S.nf.emit.cnpj;
        S.nf.items.forEach(it => {
            const link = cnpj + ':' + it.code;
            const p = (it.gtin && ex.byBarcode.get(it.gtin)) || (it.gtinTrib && ex.byBarcode.get(it.gtinTrib)) || ex.byNfe.get(link) || ex.byName.get(norm(it.name)) || null;
            it.how = p ? (it.gtin && ex.byBarcode.get(it.gtin) === p || it.gtinTrib && ex.byBarcode.get(it.gtinTrib) === p ? 'pelo código de barras' : ex.byNfe.get(link) === p ? 'pela nota anterior deste fornecedor' : 'pelo nome') : '';
            it.action = p ? 'link' : 'new';
            it.productId = p ? p.id : '';
            const learned = ex.factors[link];
            it.factor = learned > 0 ? learned : guessFactor(it);
            it.sale = 0; // preenchido na prévia (margem)
            it.cat = catFor(it.ncm, ex.cats, '');
        });
    }

    /* ============ Tela ============ */
    function css() {
        if ($('nfxCss')) return;
        const st = document.createElement('style'); st.id = 'nfxCss';
        st.textContent = `
.nfx-modal{width:min(1180px,calc(100vw - 24px));max-width:1180px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
.nfx-modal .modal-body{overflow-y:auto;padding:18px 20px}
.nfx-modal .modal-footer{display:flex;gap:8px;flex-wrap:wrap}.nfx-modal .modal-footer .sp{flex:1}
.nfx-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:34px 18px;border:2px dashed var(--border-color);border-radius:16px;cursor:pointer;background:var(--bg-secondary);transition:border-color .15s,background .15s}
.nfx-drop:hover,.nfx-drop.over{border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.08))}
.nfx-drop i{font-size:34px;color:var(--accent)}.nfx-drop b{font-size:15px;color:var(--text-heading)}.nfx-drop small{color:var(--text-muted);font-size:12px;max-width:600px;line-height:1.5}
.nfx-help{margin-top:14px;font-size:12.5px;color:var(--text-secondary);line-height:1.65}.nfx-help b{color:var(--text-heading)}
.nfx-head{display:grid;grid-template-columns:1.4fr 1fr 1fr;gap:10px;margin-bottom:12px}
.nfx-card{border:1px solid var(--border-color);border-radius:12px;padding:11px 13px;background:var(--bg-secondary);min-width:0}
.nfx-card span{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.nfx-card b{display:block;font-size:15px;color:var(--text-heading);margin-top:3px;overflow-wrap:anywhere}
.nfx-card small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:2px;line-height:1.45}
.nfx-alert{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:12px;margin-bottom:10px;font-size:12.5px;line-height:1.55}
.nfx-alert i{margin-top:2px}.nfx-alert.warn{background:rgba(245,158,11,.12);color:#b45309}.nfx-alert.bad{background:rgba(239,68,68,.12);color:#dc2626}.nfx-alert.ok{background:rgba(16,185,129,.12);color:#047857}
.nfx-sec{border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:12px;background:var(--bg-card)}
.nfx-sec h4{margin:0 0 10px;font-size:13.5px;color:var(--text-heading);display:flex;align-items:center;gap:8px}.nfx-sec h4 i{color:var(--accent)}
.nfx-opts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 18px;font-size:13px;color:var(--text-primary)}
.nfx-opts label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}.nfx-opts input[type=checkbox]{margin-top:3px;accent-color:var(--accent)}
.nfx-opts small{display:block;color:var(--text-muted);font-size:11.5px}
.nfx-field{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-secondary)}
.nfx-field input,.nfx-field select{font-size:13px;padding:7px 9px}
.nfx-tw{overflow-x:auto;border:1px solid var(--border-color);border-radius:12px}
.nfx-t{width:100%;border-collapse:collapse;font-size:12px;min-width:1040px}
.nfx-t th{position:sticky;top:0;background:var(--bg-secondary);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);padding:8px 9px;border-bottom:1px solid var(--border-color);white-space:nowrap}
.nfx-t td{padding:8px 9px;border-bottom:1px solid var(--border-color);color:var(--text-primary);vertical-align:top}
.nfx-t tr:last-child td{border-bottom:0}.nfx-t tr.off td{opacity:.45}
.nfx-t .r{text-align:right;white-space:nowrap}.nfx-t .nm{min-width:220px;max-width:320px}
.nfx-t .nm small{display:block;color:var(--text-muted);font-size:10.5px;line-height:1.45}
.nfx-t input,.nfx-t select{width:100%;font-size:12px;padding:5px 7px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary)}
.nfx-t input.f{width:64px;text-align:center}.nfx-t input.p{width:92px;text-align:right}
.nfx-t .act{min-width:220px}.nfx-t .act select{margin-bottom:5px}
.nfx-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap;margin-top:3px}
.nfx-tag.link{background:rgba(59,130,246,.14);color:#3b82f6}.nfx-tag.new{background:rgba(16,185,129,.14);color:#10b981}
.nfx-tot{display:flex;flex-wrap:wrap;gap:6px 18px;justify-content:flex-end;margin-top:10px;font-size:12.5px;color:var(--text-secondary)}.nfx-tot b{color:var(--text-heading)}
.nfx-parc{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.nfx-parc span{font-size:12px;padding:3px 9px;border-radius:99px;background:var(--bg-secondary);border:1px solid var(--border-color)}
.nfx-bar{height:10px;border-radius:99px;background:var(--bg-secondary);overflow:hidden;margin:14px 0 8px}.nfx-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.nfx-done{text-align:center;padding:16px 8px}.nfx-done i.big{font-size:44px;color:#10b981}.nfx-done h3{margin:10px 0 6px;color:var(--text-heading)}
.nfx-done p{color:var(--text-secondary);font-size:13px;line-height:1.6;margin:0 auto;max-width:640px}
@media(max-width:900px){.nfx-head{grid-template-columns:1fr}.nfx-opts{grid-template-columns:1fr}}
@media(max-width:640px){.nfx-modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}.nfx-modal .modal-footer .btn{flex:1;justify-content:center}.nfx-modal .modal-footer .sp{display:none}}`;
        document.head.appendChild(st);
    }
    function shell() {
        if ($('nfxModal')) return;
        css();
        const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'nfxModal';
        ov.innerHTML = `<div class="modal nfx-modal"><div class="modal-header"><h3>${ICON}Importar a nota fiscal de compra (XML)</h3><button class="modal-close" type="button" data-nfx="close" aria-label="Fechar"><i class="fas fa-times"></i></button></div><div class="modal-body" id="nfxBody"></div><div class="modal-footer" id="nfxFoot"></div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', onClick);
        ov.addEventListener('change', onChange);
        ov.addEventListener('input', onInput);
    }
    function open() { shell(); S = null; stepFile(); $('nfxModal').classList.add('active'); }
    function close() {
        if (S && S.busy) { toast('warning', 'Aguarde terminar de lançar a nota.'); return; }
        $('nfxModal')?.classList.remove('active');
        if (S && S.done && /compras\.html/i.test(location.pathname)) location.reload();
    }

    function stepFile() {
        $('nfxBody').innerHTML = `<label class="nfx-drop" id="nfxDrop"><input type="file" id="nfxFile" accept=".xml,text/xml,application/xml" hidden data-no-camera><i class="fas fa-file-code"></i><b>Escolha o XML da nota fiscal de compra</b><small>Arraste o arquivo .xml aqui ou toque para escolher. É o XML que o fornecedor manda por e-mail junto com o boleto (ou que você baixa no portal da SEFAZ). O PDF do DANFE não serve: tem que ser o arquivo .xml.</small></label>
<div class="nfx-help"><b>O que acontece:</b> o sistema lê a nota, acha o fornecedor pelo CNPJ e reconhece cada produto pelo código de barras, pelo código que esse fornecedor usou em notas anteriores ou pelo nome. Os que não existirem viram produtos novos. Antes de gravar você confere tudo: quantas unidades vêm na caixa, o preço de venda e o que fazer com cada item.<br><b>Ao confirmar:</b> a compra é registrada como recebida, o estoque entra, o custo médio é recalculado e as parcelas da nota vão para Contas a Pagar. Errou? Em <b>Compras</b>, cancele a compra e o estoque volta.</div>`;
        $('nfxFoot').innerHTML = `<span class="sp"></span><button class="btn btn-outline" type="button" data-nfx="close">Fechar</button>`;
        const drop = $('nfxDrop');
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
    }
    function fail(title, msg) {
        $('nfxBody').innerHTML = `<div class="nfx-done"><i class="fas fa-triangle-exclamation big" style="color:#ef4444"></i><h3>${esc(title)}</h3><p>${esc(msg)}</p></div>`;
        $('nfxFoot').innerHTML = `<button class="btn btn-outline" type="button" data-nfx="again"><i class="fas fa-arrow-left"></i> Escolher outro arquivo</button><span class="sp"></span><button class="btn btn-outline" type="button" data-nfx="close">Fechar</button>`;
    }
    async function loadFile(file) {
        if (!/\.xml$/i.test(file.name) && !/xml/i.test(file.type || '')) { toast('warning', 'Escolha o arquivo .xml da nota (não o PDF).'); return; }
        if (file.size > 5 * 1024 * 1024) { toast('warning', 'Arquivo grande demais para um XML de nota.'); return; }
        $('nfxBody').innerHTML = `<div class="nfx-done"><i class="fas fa-spinner fa-spin big" style="color:var(--accent)"></i><h3>Lendo a nota…</h3><p>${esc(file.name)}</p></div>`;
        $('nfxFoot').innerHTML = '';
        try {
            const nf = parseNFe(await readFile(file));
            itemCosts(nf);
            const ex = await loadExisting(nf);
            S = { file: file.name, nf, ex, busy: false, done: false, margin: ex.margin, updSale: false, category: '', pay: nf.dups.length ? 'dups' : 'vista', costMode: 'real' };
            S.category = ex.cats.find(c => norm(c) === 'geral') || 'Geral';
            matchItems();
            S.nf.items.forEach(it => { it.sale = suggestSale(it); });
            stepPreview();
        } catch (e) { console.error(e); fail('Não foi possível ler a nota', e.message || String(e)); }
    }

    const unitCost = it => { const total = S.costMode === 'real' ? it.total : r2(it.gross - it.discount); const units = it.qty * (it.factor || 1); return units > 0 ? r4(total / units) : 0; };
    const units = it => r4(it.qty * (it.factor || 1));
    const suggestSale = it => { const c = unitCost(it); const p = it.action === 'link' ? S.ex.products.find(x => x.id === it.productId) : null; if (p && !S.updSale && Number(p.salePrice) > 0) return r2(p.salePrice); return c > 0 ? r2(c * (1 + S.margin / 100)) : 0; };
    const productLabel = p => `${p.name}${p.code ? ' · ' + p.code : ''}${digits(p.barcode) ? ' · ' + digits(p.barcode) : ''}`;
    function linkInput(it) {
        const p = S.ex.products.find(x => x.id === it.productId);
        return `<input type="text" list="nfxProds" data-i="${it.n}" data-k="pick" placeholder="Digite para buscar o produto" value="${esc(p ? productLabel(p) : '')}">`;
    }
    function payTotal() { return r2(S.nf.totals.total || S.nf.items.reduce((s, x) => s + x.total, 0)); }

    function stepPreview() {
        const nf = S.nf, ex = S.ex, cnt = { link: 0, new: 0, skip: 0 };
        nf.items.forEach(it => { cnt[it.action]++; });
        const alerts = [];
        if (ex.dup) alerts.push(['bad', 'ban', `Esta nota já foi lançada (compra #${esc(ex.dup.purchaseNumber || '')}). Para lançar de novo, cancele aquela compra em Compras.`]);
        if (!nf.authorized) alerts.push(['bad', 'ban', `A SEFAZ não autorizou esta nota (situação ${esc(nf.cStat)}). Ela não pode entrar no estoque.`]);
        if (nf.tpNF === '0' && ex.myCnpj && nf.emit.cnpj === ex.myCnpj) alerts.push(['warn', 'triangle-exclamation', 'Esta é uma nota de entrada emitida pela sua própria empresa. Confira se é mesmo uma compra.']);
        else if (ex.myCnpj && nf.dest.cnpj && nf.dest.cnpj !== ex.myCnpj) alerts.push(['warn', 'triangle-exclamation', `A nota foi emitida para outro CNPJ (${esc(fmtCnpj(nf.dest.cnpj))} · ${esc(nf.dest.name)}), não para o da sua empresa (${esc(fmtCnpj(ex.myCnpj))}). Confira antes de lançar.`]);
        if (!ex.supplier) alerts.push(['ok', 'circle-plus', `Fornecedor novo: <b>${esc(nf.emit.name)}</b> será cadastrado em Fornecedores com os dados da nota.`]);
        const blocked = !!ex.dup || !nf.authorized;
        const issued = nf.issuedAt ? new Date(nf.issuedAt) : null;
        const prodsList = `<datalist id="nfxProds">${ex.products.slice(0, 5000).map(p => `<option value="${esc(productLabel(p))}"></option>`).join('')}</datalist>`;
        const rows = nf.items.map(it => {
            const p = it.action === 'link' ? ex.products.find(x => x.id === it.productId) : null;
            return `<tr class="${it.action === 'skip' ? 'off' : ''}" data-row="${it.n}">
<td>${it.n}</td>
<td class="nm"><b>${esc(it.name)}</b><small>Cód. fornecedor ${esc(it.code)}${it.gtin ? ' · EAN ' + esc(it.gtin) : ''}${it.ncm ? ' · NCM ' + esc(it.ncm) : ''}</small></td>
<td class="r">${qf(it.qty)} ${esc(it.unit)}<small style="display:block;color:var(--text-muted)">${money(it.total)}</small></td>
<td class="r"><input class="f" type="number" min="1" step="1" data-i="${it.n}" data-k="factor" value="${esc(it.factor)}" ${it.action === 'skip' ? 'disabled' : ''} title="Unidades dentro de cada ${esc(it.unit)}"><small style="display:block;color:var(--text-muted);margin-top:3px" data-units="${it.n}">= ${qf(units(it))} un</small></td>
<td class="r" data-cost="${it.n}">${money(unitCost(it))}</td>
<td class="act"><select data-i="${it.n}" data-k="action"><option value="link" ${it.action === 'link' ? 'selected' : ''}>Produto que já tenho</option><option value="new" ${it.action === 'new' ? 'selected' : ''}>Cadastrar produto novo</option><option value="skip" ${it.action === 'skip' ? 'selected' : ''}>Não lançar este item</option></select>
${it.action === 'link' ? linkInput(it) + (it.how ? `<span class="nfx-tag link">achado ${esc(it.how)}</span>` : '') : it.action === 'new' ? `<span class="nfx-tag new">novo · ${esc(it.cat || S.category || 'Geral')}</span>` : ''}</td>
<td class="r">${it.action === 'skip' ? '—' : `<input class="p" type="text" inputmode="decimal" data-i="${it.n}" data-k="sale" value="${esc(String(it.sale.toFixed(2)).replace('.', ','))}" ${it.action === 'link' && !S.updSale ? 'disabled title="Marque “Atualizar o preço de venda” para mudar"' : ''}>${p ? `<small style="display:block;color:var(--text-muted)">atual ${money(p.salePrice)}</small>` : ''}`}</td>
</tr>`;
        }).join('');
        const T = nf.totals;
        const dupsHtml = nf.dups.length ? `<div class="nfx-parc">${nf.dups.map((d, i) => `<span>${i + 1}/${nf.dups.length} · ${dOf(d.due) ? dOf(d.due).toLocaleDateString('pt-BR') : esc(d.due)} · <b>${money(d.amount)}</b></span>`).join('')}</div>` : '';
        $('nfxBody').innerHTML = `${prodsList}
${alerts.map(([t, i, m]) => `<div class="nfx-alert ${t}"><i class="fas fa-${i}"></i><div>${m}</div></div>`).join('')}
<div class="nfx-head">
  <div class="nfx-card"><span>Fornecedor</span><b>${esc(nf.emit.fantasy || nf.emit.name)}</b><small>${esc(nf.emit.name)}<br>CNPJ ${esc(fmtCnpj(nf.emit.cnpj))}${nf.emit.city ? ' · ' + esc(nf.emit.city) + '/' + esc(nf.emit.state) : ''}</small></div>
  <div class="nfx-card"><span>Nota fiscal</span><b>Nº ${esc(nf.number)} · série ${esc(nf.serie || '1')}</b><small>${issued && !isNaN(issued) ? 'Emitida em ' + issued.toLocaleDateString('pt-BR') : ''}${nf.nature ? '<br>' + esc(nf.nature) : ''}</small></div>
  <div class="nfx-card"><span>Total da nota</span><b>${money(T.total)}</b><small>${nf.items.length} item(ns) · ${cnt.link} já cadastrado(s) · ${cnt.new} novo(s)${cnt.skip ? ' · ' + cnt.skip + ' fora' : ''}</small></div>
</div>
<div class="nfx-sec"><h4><i class="fas fa-sliders"></i>Como lançar</h4><div class="nfx-opts">
  <label class="nfx-field">Categoria dos novos sem categoria pelo NCM<input class="form-control" type="text" list="nfxCats" data-k="category" value="${esc(S.category)}"><datalist id="nfxCats">${ex.cats.map(c => `<option value="${esc(c)}"></option>`).join('')}</datalist></label>
  <label class="nfx-field">Margem para o preço de venda (%)<input class="form-control" type="number" min="0" step="1" data-k="margin" value="${esc(S.margin)}"></label>
  <label class="nfx-field">Pagamento<select class="form-control" data-k="pay"><option value="dups" ${S.pay === 'dups' ? 'selected' : ''} ${nf.dups.length ? '' : 'disabled'}>Parcelas da nota em Contas a Pagar${nf.dups.length ? ' (' + nf.dups.length + ')' : ' (a nota não trouxe)'}</option><option value="vista" ${S.pay === 'vista' ? 'selected' : ''}>À vista (já paga)</option><option value="none" ${S.pay === 'none' ? 'selected' : ''}>Não lançar no financeiro</option></select>${S.pay === 'dups' ? dupsHtml : ''}</label>
  <div style="display:flex;flex-direction:column;gap:10px">
    <label><input type="checkbox" data-k="costMode" ${S.costMode === 'real' ? 'checked' : ''}><span>Custo com frete, IPI, ST e descontos<small>Recomendado: o custo de cada unidade fica igual ao que você pagou de verdade.</small></span></label>
    <label><input type="checkbox" data-k="updSale" ${S.updSale ? 'checked' : ''}><span>Atualizar o preço de venda dos produtos que já tenho<small>Desmarcado: só o custo e o estoque mudam.</small></span></label>
  </div>
</div></div>
<div class="nfx-sec"><h4><i class="fas fa-boxes-stacked"></i>Itens da nota</h4>
  <div class="nfx-tw"><table class="nfx-t"><thead><tr><th>#</th><th>Produto na nota</th><th class="r">Qtd na nota</th><th class="r">Un. por emb.</th><th class="r">Custo/un</th><th>O que fazer</th><th class="r">Preço de venda</th></tr></thead><tbody>${rows}</tbody></table></div>
  <div class="nfx-tot"><span>Produtos <b>${money(T.products)}</b></span>${T.discount ? `<span>Desconto <b>−${money(T.discount)}</b></span>` : ''}${T.freight ? `<span>Frete <b>${money(T.freight)}</b></span>` : ''}${T.ipi ? `<span>IPI <b>${money(T.ipi)}</b></span>` : ''}${T.st + T.fcpSt ? `<span>ICMS-ST <b>${money(T.st + T.fcpSt)}</b></span>` : ''}${T.other + T.insurance ? `<span>Outras <b>${money(T.other + T.insurance)}</b></span>` : ''}<span>Total <b>${money(T.total)}</b></span></div>
</div>`;
        const todo = nf.items.filter(it => it.action !== 'skip').length;
        const missing = nf.items.find(it => it.action === 'link' && !it.productId);
        $('nfxFoot').innerHTML = `<button class="btn btn-outline" type="button" data-nfx="again"><i class="fas fa-arrow-left"></i> Outra nota</button><span class="sp"></span><button class="btn btn-primary" type="button" data-nfx="run" ${blocked || !todo || missing ? 'disabled' : ''}><i class="fas fa-check"></i> ${blocked ? 'Não dá para lançar esta nota' : missing ? 'Escolha o produto do item ' + missing.n : `Lançar a nota (${todo} item(ns))`}</button>`;
    }

    const itemOf = el => S && S.nf.items.find(x => x.n === Number(el.dataset.i));
    function onChange(e) {
        const t = e.target;
        if (t.id === 'nfxFile' && t.files.length) return loadFile(t.files[0]);
        if (!S || S.busy) return;
        const k = t.dataset.k, it = itemOf(t);
        if (k === 'action' && it) { it.action = t.value; if (it.action === 'link' && !it.productId) it.how = ''; it.sale = suggestSale(it); return stepPreview(); }
        if (k === 'pick' && it) {
            const p = S.ex.products.find(x => productLabel(x) === t.value);
            if (p) { it.productId = p.id; it.how = ''; it.sale = suggestSale(it); return stepPreview(); }
            if (t.value.trim()) toast('warning', 'Escolha um produto da lista (digite parte do nome e toque na sugestão).');
            it.productId = ''; return stepPreview();
        }
        if (k === 'pay') { S.pay = t.value; return stepPreview(); }
        if (k === 'costMode') { S.costMode = t.checked ? 'real' : 'gross'; S.nf.items.forEach(x => { if (!x.saleTouched) x.sale = suggestSale(x); }); return stepPreview(); }
        if (k === 'updSale') { S.updSale = t.checked; S.nf.items.forEach(x => { if (!x.saleTouched) x.sale = suggestSale(x); }); return stepPreview(); }
        if (k === 'margin') { S.margin = Math.max(0, parseFloat(t.value) || 0); S.nf.items.forEach(x => { if (!x.saleTouched) x.sale = suggestSale(x); }); return stepPreview(); }
        if (k === 'factor' && it) { it.factor = Math.max(1, Math.round(parseFloat(t.value) || 1)); if (!it.saleTouched) it.sale = suggestSale(it); return stepPreview(); }
    }
    function onInput(e) {
        const t = e.target; if (!S || S.busy) return;
        const k = t.dataset.k, it = itemOf(t);
        if (k === 'category') S.category = t.value;
        if (k === 'sale' && it) { const v = parseFloat(String(t.value).replace(/\./g, '').replace(',', '.')); it.sale = Number.isFinite(v) ? r2(v) : 0; it.saleTouched = true; }
        if (k === 'factor' && it) { const f = Math.max(1, Math.round(parseFloat(t.value) || 1)); const u = $('nfxBody').querySelector(`[data-units="${it.n}"]`), c = $('nfxBody').querySelector(`[data-cost="${it.n}"]`); const old = it.factor; it.factor = f; if (u) u.textContent = '= ' + qf(units(it)) + ' un'; if (c) c.textContent = money(unitCost(it)); it.factor = old; }
    }
    function onClick(e) {
        const b = e.target.closest('[data-nfx]'); if (!b) return;
        const a = b.dataset.nfx;
        if (a === 'close') return close();
        if (a === 'again') { if (S && S.busy) return; S = null; return stepFile(); }
        if (a === 'run') return run();
        if (a === 'compras') { location.href = 'compras.html'; return; }
    }

    /* ============ Gravação ============ */
    const loadScript = src => new Promise(res => { if ([...document.scripts].some(s => s.src.includes(src.split('?')[0]))) return res(); const s = document.createElement('script'); s.src = src; s.onload = () => res(); s.onerror = () => res(); document.head.appendChild(s); });
    async function commit(ops) { for (let i = 0; i < ops.length; i += 40) { const b = db.batch(); ops.slice(i, i + 40).forEach(o => o.kind === 'set' ? b.set(o.ref, o.data) : b.update(o.ref, o.data)); await b.commit(); } }
    const unitOf = u => { const s = norm(u); if (!s) return 'un'; if (/^(kg|kilo|quilo)/.test(s)) return 'kg'; if (/^(lt|l|litro)$/.test(s)) return 'lt'; if (/^(pc|pca|peca)$/.test(s)) return 'pc'; return 'un'; };

    async function run() {
        if (!S || S.busy) return;
        const nf = S.nf, ex = S.ex, todo = nf.items.filter(it => it.action !== 'skip');
        if (ex.dup || !nf.authorized || !todo.length) return;
        if (todo.some(it => it.action === 'link' && !it.productId)) return;
        const news = todo.filter(it => it.action === 'new').length;
        if (!window.confirm(`Lançar a NF ${nf.number} de ${nf.emit.fantasy || nf.emit.name}?\n\n• ${todo.length} item(ns) entram no estoque${news ? `\n• ${news} produto(s) novo(s) no cadastro` : ''}${!ex.supplier ? '\n• fornecedor novo cadastrado' : ''}\n• ${S.pay === 'dups' ? nf.dups.length + ' parcela(s) em Contas a Pagar' : S.pay === 'vista' ? 'pagamento à vista lançado no financeiro' : 'nada no financeiro'}`)) return;
        S.busy = true;
        $('nfxFoot').innerHTML = '';
        $('nfxBody').innerHTML = `<div class="nfx-done"><i class="fas fa-spinner fa-spin big" style="color:var(--accent)"></i><h3>Lançando a nota…</h3><p id="nfxStatus">Preparando…</p><div class="nfx-bar"><i id="nfxBar"></i></div><p style="font-size:12px;color:var(--text-muted)">Não feche esta janela até terminar.</p></div>`;
        const status = t => { const el = $('nfxStatus'); if (el) el.textContent = t; };
        const bar = p => { const el = $('nfxBar'); if (el) el.style.width = Math.round(p * 100) + '%'; };
        const batchId = 'nfe_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        let purchaseId = '', stage = 'cadastro';
        try {
            const issued = nf.issuedAt ? new Date(nf.issuedAt) : new Date(), when = isNaN(issued) ? new Date() : issued;
            // 1) Fornecedor
            let supplierId = ex.supplier ? ex.supplier.id : '', supplierName = ex.supplier ? (ex.supplier.fantasyName || ex.supplier.name) : (nf.emit.fantasy || nf.emit.name);
            if (!supplierId) {
                status('Cadastrando o fornecedor…');
                const E = nf.emit, ref = db.collection('suppliers').doc(); supplierId = ref.id;
                await commit([{ kind: 'set', ref, data: { name: E.name, fantasyName: E.fantasy || '', cnpj: fmtCnpj(E.cnpj), stateRegistration: E.ie || '', phone: E.phone, whatsapp: '', email: '', representative: '', address: [E.street, E.number, E.district].filter(Boolean).join(', '), city: E.city, state: E.state, zip: E.zip, paymentTerms: '', categories: '', notes: `Cadastrado pela NF-e ${nf.number}`, status: 'active', active: true, deleted: false, importBatch: batchId, createdAt: ts(), updatedAt: ts(), createdBy: uid() } }]);
            }
            // 2) Categoria e produtos novos (estoque 0: a entrada vem da compra, com Movimentação)
            const ops = [], fallbackCat = (S.category || 'Geral').trim() || 'Geral', made = new Set(ex.cats.map(norm));
            todo.filter(it => it.action === 'new').forEach(it => {
                it.catName = (it.cat || fallbackCat).trim() || 'Geral';
                if (made.has(norm(it.catName))) return; made.add(norm(it.catName));
                ops.push({ kind: 'set', ref: db.collection('categories').doc(), data: { name: it.catName, icon: '📦', color: '#6366f1', active: true, deleted: false, importBatch: batchId, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
            });
            todo.filter(it => it.action === 'new').forEach(it => {
                const ref = db.collection('products').doc(); it.productId = ref.id;
                const cost = unitCost(it), sale = it.sale > 0 ? it.sale : r2(cost * (1 + S.margin / 100));
                ops.push({ kind: 'set', ref, data: {
                    name: it.name, code: '', barcode: it.gtin || '', unit: it.factor > 1 ? 'un' : unitOf(it.unit), category: it.catName, brand: '', volume: '',
                    costPrice: cost, salePrice: sale, promoPrice: null, profitMargin: cost > 0 ? Number(((sale - cost) / cost * 100).toFixed(1)) : 0,
                    currentStock: 0, minStock: 0, stockLocation: '', supplierId, supplierName, packagings: it.factor > 1 ? [{ label: `${it.unit || 'Caixa'} com ${it.factor}`, type: norm(it.unit).slice(0, 3) || 'cx', factor: it.factor, barcode: it.gtinTrib && it.gtinTrib !== it.gtin ? it.gtinTrib : '' }] : [],
                    status: 'active', active: true, description: it.info || '', productType: 'product', controlStock: true,
                    ncm: it.ncm, cest: it.cest, cfop: '', csosn: '', origem: it.origem,
                    imageType: 'icon', icon: '📦', imageUrl: '', imageFile: '', nfeCodes: [nf.emit.cnpj + ':' + it.code],
                    importBatch: batchId, importSource: 'NF-e ' + nf.number, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid()
                } });
            });
            if (ops.length) { status('Cadastrando os produtos novos…'); await commit(ops); }
            bar(0.15);
            // 3) Compra (pendente até a entrada no estoque terminar)
            stage = 'compra';
            const sref = await db.collection('settings').doc(SDOC()).get().catch(() => null);
            const seq = ((sref && sref.exists && sref.data().purchaseSequence) || 0) + 1;
            await db.collection('settings').doc(SDOC()).set({ purchaseSequence: seq }, { merge: true });
            const items = todo.map(it => {
                const p = ex.products.find(x => x.id === it.productId);
                const u = units(it), c = unitCost(it);
                return { productId: it.productId, productName: p ? p.name : it.name, packaging: it.factor > 1 ? `${it.unit} (${it.factor} un)` : 'Unidade', factor: it.factor, quantity: it.qty, unitsTotal: u,
                    costPrice: c, costPackage: r2(c * it.factor), salePrice: it.sale, salePricePackage: r2(it.sale * it.factor), subtotal: r2(c * u), nfeItem: it.n, nfeCode: it.code, nfeName: it.name };
            });
            const total = r2(items.reduce((s, i) => s + i.subtotal, 0));
            const payTot = payTotal();
            const installments = S.pay === 'dups' ? nf.dups.map((d, i) => { const due = dOf(d.due) || when; return { n: i + 1, of: nf.dups.length, days: Math.max(1, Math.round((due - new Date(when.getFullYear(), when.getMonth(), when.getDate(), 12)) / 864e5)), dueDate: ymd(due), amount: r2(d.amount) }; })
                : S.pay === 'vista' ? [{ n: 1, of: 1, days: 0, dueDate: ymd(when), amount: payTot }] : [];
            const purchase = {
                supplierId, supplierName, purchaseNumber: seq, purchaseDate: tsOf(new Date(when.getFullYear(), when.getMonth(), when.getDate(), 12)),
                nfNumber: nf.number, nfeKey: nf.key, nfeSerie: nf.serie, nfeModel: nf.model, nfeIssuedAt: nf.issuedAt, nfeTotal: nf.totals.total, supplierCnpj: nf.emit.cnpj,
                paymentMethod: S.pay === 'dups' ? `Boleto ${installments.map(x => x.days).join('/')} dias` : S.pay === 'vista' ? 'À Vista' : 'Não lançado', paymentTerms: installments.filter(x => x.days > 0).map(x => x.days).join('/'),
                installments, items, total: S.pay === 'none' ? total : payTot, itemsTotal: total, status: 'pending', source: 'nfe-xml', importBatch: batchId,
                notes: `Importada do XML da NF-e ${nf.number}${nf.serie ? ' série ' + nf.serie : ''} (${S.file})`, deleted: false, createdAt: ts(), createdBy: uid()
            };
            const pref = await db.collection('purchases').add(purchase); purchaseId = pref.id;
            // 4) Estoque, custo médio, código do fornecedor e preço de venda
            stage = 'estoque';
            const factors = {};
            for (let i = 0; i < items.length; i++) {
                const it = todo[i], item = items[i];
                status(`Dando entrada no estoque… ${i + 1} de ${items.length}`); bar(0.2 + 0.65 * i / items.length);
                const antes = window.DPCustoMedio ? await DPCustoMedio.produto(item.productId) : (await db.collection('products').doc(item.productId).get()).data();
                await StockService.entry(item.productId, item.unitsTotal, `Compra #${seq} — NF ${nf.number} — ${item.packaging}`, 'purchase', purchaseId);
                const upd = {}, link = nf.emit.cnpj + ':' + it.code, codes = Array.isArray(antes && antes.nfeCodes) ? antes.nfeCodes : [];
                if (it.action === 'link') {
                    if (item.costPrice > 0) upd.costPrice = window.DPCustoMedio ? DPCustoMedio.calc(antes ? antes.currentStock : 0, antes ? antes.costPrice : 0, item.unitsTotal, item.costPrice) : item.costPrice;
                    if (S.updSale && it.sale > 0) { upd.salePrice = it.sale; const c = upd.costPrice || (antes && antes.costPrice) || 0; if (c > 0) upd.profitMargin = Number(((it.sale - c) / c * 100).toFixed(1)); }
                    if (!codes.includes(link)) upd.nfeCodes = codes.concat(link).slice(-50);
                    if (antes && !antes.supplierId) { upd.supplierId = supplierId; upd.supplierName = supplierName; }
                    if (antes && !antes.ncm && it.ncm) upd.ncm = it.ncm;
                    if (antes && !digits(antes.barcode) && it.gtin && !ex.byBarcode.has(it.gtin)) upd.barcode = it.gtin;
                }
                if (Object.keys(upd).length) await db.collection('products').doc(item.productId).update({ ...upd, updatedAt: ts(), updatedBy: uid() });
                if (it.factor > 1) factors[link] = it.factor;
            }
            if (Object.keys(factors).length) { try { await db.collection('settings').doc(SDOC()).set({ nfeFactors: { ...(ex.factors || {}), ...factors } }, { merge: true }); } catch (e) { } }
            // 5) Contas a Pagar (mesmo formato da tela Compras) e compra recebida
            stage = 'financeiro';
            status('Lançando no financeiro…'); bar(0.9);
            const after = { status: 'received', receivedAt: ts() };
            if (installments.length) {
                if (!window.DPComprasPro) await loadScript('assets/js/compras-pro-v1.js?v=38.3');
                if (window.DPComprasPro && DPComprasPro.lancarContas) {
                    try { const ids = await DPComprasPro.lancarContas({ ...purchase, id: purchaseId }); if (ids && ids.length) after.payableIds = ids; }
                    catch (e) { console.error(e); toast('warning', 'A nota entrou no estoque, mas as contas a pagar não foram lançadas: ' + e.message); }
                }
            }
            await db.collection('purchases').doc(purchaseId).update(after);
            try { if (typeof window.AuditService !== 'undefined') AuditService.log('import', 'purchases', purchaseId, { nfe: nf.number, key: nf.key, items: items.length, total: purchase.total }); } catch (e) { }
            bar(1);
            S.busy = false; S.done = true;
            $('nfxBody').innerHTML = `<div class="nfx-done"><i class="fas fa-circle-check big"></i><h3>Nota lançada!</h3><p>Compra <b>#${seq}</b> da NF ${esc(nf.number)} (${esc(supplierName)}) registrada como recebida: <b>${items.length}</b> item(ns) entraram no estoque${news ? `, <b>${news}</b> produto(s) novo(s) cadastrado(s)` : ''} e o custo médio foi atualizado.${after.payableIds ? ` ${after.payableIds.length} lançamento(s) em Contas a Pagar.` : ''}</p>
<p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Na próxima nota deste fornecedor os produtos já são reconhecidos sozinhos. Para desfazer, cancele a compra #${seq} em Compras: o estoque volta e as contas em aberto são canceladas.</p></div>`;
            $('nfxFoot').innerHTML = `<button class="btn btn-outline" type="button" data-nfx="compras"><i class="fas fa-truck-ramp-box"></i> Ver em Compras</button><button class="btn btn-outline" type="button" data-nfx="again"><i class="fas fa-file-code"></i> Lançar outra nota</button><span class="sp"></span><button class="btn btn-primary" type="button" data-nfx="close"><i class="fas fa-check"></i> Pronto</button>`;
            toast('success', `NF ${nf.number} lançada no estoque!`);
        } catch (e) {
            console.error(e);
            S.busy = false;
            const where = stage === 'cadastro' ? 'Nada entrou no estoque ainda.' : stage === 'compra' ? 'Os produtos novos foram cadastrados, mas a compra não foi registrada.' : `A compra ficou como <b>pendente</b> em Compras e parte dos itens pode já ter entrado no estoque. Abra Compras, confira a compra e cancele se precisar lançar de novo.`;
            $('nfxBody').innerHTML = `<div class="nfx-done"><i class="fas fa-triangle-exclamation big" style="color:#ef4444"></i><h3>O lançamento parou no meio</h3><p>${esc(e.message || 'Erro ao gravar')}.<br>${where}</p></div>`;
            $('nfxFoot').innerHTML = `${purchaseId ? '<button class="btn btn-outline" type="button" data-nfx="compras">Abrir Compras</button>' : ''}<span class="sp"></span><button class="btn btn-primary" type="button" data-nfx="close">Fechar</button>`;
            S.done = true;
        }
        try { if (typeof window.loadProductsList === 'function') window.loadProductsList(); } catch (e) { }
        try { if (typeof window.loadCategoriesForSelect === 'function') window.loadCategoriesForSelect(); } catch (e) { }
    }

    /* ============ Botão nas telas Produtos e Compras ============ */
    function addButton() {
        if ($('nfxBtn')) return;
        const right = document.querySelector('.toolbar .toolbar-right'); if (!right) return;
        if (!/produtos\.html|compras\.html/i.test(location.pathname) && !$('productsTable') && !$('modalCompra')) return;
        const b = document.createElement('button'); b.type = 'button'; b.id = 'nfxBtn'; b.className = 'btn btn-outline';
        b.title = 'Lançar a compra pelo XML da nota fiscal do fornecedor: cadastra os produtos e dá entrada no estoque';
        b.innerHTML = '<i class="fas fa-file-code" style="color:var(--accent)"></i> Importar XML da nota';
        b.addEventListener('click', open);
        right.insertBefore(b, right.firstChild);
    }
    window.DPImportNFe = { open, close, parseNFe, guessFactor };
    const start = () => { try { addButton(); } catch (e) { console.warn('importar-nfe:', e); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
