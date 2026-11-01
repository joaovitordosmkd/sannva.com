/* DistribuiPro 38.4 · Via da cozinha (todas as versões) — window.DPKitchenPrint.
   - Um só desenho de via COZINHA/BAR (cupom 80 mm, sem preços), usado pelo PDV (balcão, retirada e entrega), pelas Mesas,
     por Pedidos ("Via da cozinha" = reimprimir) e, no Mensal, pela tela Cozinha (KDS) para mostrar sabores e adicionais.
   - Configurações › Vendas, cartão "Via da cozinha" (salva na hora), em settings/general (demo: demo_general):
       kitchenPrint    'auto' (imprime sozinho) | 'perguntar' | 'nao'. Sem escolha: 'auto' no ramo restaurante, 'nao' nos outros.
       kitchenSplitBar true = duas vias, COZINHA e BAR; as categorias do bar ficam em settings/cozinha.barCategories
                       (as mesmas da tela Cozinha do Mensal). Sem lista, bebidas vão para o bar pelo nome da categoria.
   - PDV: ao finalizar, se a venda tem item que não é serviço, sai a via. No balcão e na retirada a SENHA (número da venda)
     sai em letra grande; na entrega saem o endereço e o pagamento.
   - Impressão: janela escondida (sem pop-up); no aplicativo do Windows, janela própria. Mesas usa open()/write() para a
     pré-conta e a conta (o mesmo cupom de antes).
   API: cfg(), load(force), lines(item), title(item), addonText(item), receiptRows(item), ticket(o, w), afterSale(sale, products),
        reprint(saleId), button(sale), open(), write(w, title, inner, big), printHtml(html, w) */
(function () {
    'use strict';
    if (window.DPKitchenPrint) return;
    const HAS_DB = typeof db !== 'undefined';
    const DEMO = HAS_DB && !!db.__isLocalDemo;
    const DOC = DEMO ? 'demo_general' : 'general';
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const I = n => (window.dpIcon ? dpIcon(n) : '');
    const msOf = v => v && v.toDate ? v.toDate().getTime() : typeof v === 'number' ? v : v ? (new Date(v.value || v).getTime() || 0) : 0;
    const hhmm = ms => new Date(ms || Date.now()).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    const fmtQ = q => { const n = Number(q) || 0; return Number.isInteger(n) ? String(n) : String(Math.round(n * 1000) / 1000).replace('.', ','); };
    const BAR_GUESS = /bebida|drink|cervej|chope|chopp|refri|suco|vinho|destilad|dose|caf[eé]|água|agua|energ|bar\b|whisk|vodka|cacha/i;
    const SERVICE = it => !!(it && (it.isService || it.productType === 'service'));

    /* ---------- configuração ---------- */
    function demoKey() { try { const s = JSON.parse(sessionStorage.getItem('dp_demo_segment_v1') || localStorage.getItem('dp_demo_segment_v1') || 'null'); return (s && (s.key || s.dataset)) || 'general'; } catch (e) { return 'general'; } }
    const CACHE = 'dp_kitchen_cfg_v1' + (DEMO ? ':' + demoKey() : '');
    let raw = (() => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null') || {}; } catch (e) { return {}; } })();
    let loadedAt = 0, loading = null;
    // Ramo restaurante (bar, lanchonete, pizzaria, padaria): pelo ramo escolhido ou pelas Mesas ligadas (núcleo sem seletor de ramo)
    function isFood() {
        try { if (window.DPTerm && DPTerm.segment && DPTerm.segment() === 'restaurante') return true; } catch (e) { }
        try { if (window.DPMesas && DPMesas.cfg && DPMesas.cfg.enabled) return true; } catch (e) { }
        return false;
    }
    function cfg() {
        const mode = ['auto', 'perguntar', 'nao'].includes(raw.kitchenPrint) ? raw.kitchenPrint : (isFood() ? 'auto' : 'nao');
        return { mode, chosen: !!raw.kitchenPrint, split: raw.kitchenSplitBar === true, barCats: Array.isArray(raw.barCats) ? raw.barCats : null };
    }
    function load(force) {
        if (!HAS_DB) return Promise.resolve(cfg());
        if (!force && Date.now() - loadedAt < 20000) return Promise.resolve(cfg());
        if (loading && !force) return loading;
        loading = (async () => {
            try {
                const [g, c] = await Promise.all([db.collection('settings').doc(DOC).get(), db.collection('settings').doc('cozinha').get().catch(() => null)]);
                const d = g && g.exists ? (g.data() || {}) : {}, k = c && c.exists ? (c.data() || {}) : {};
                raw = { kitchenPrint: d.kitchenPrint || '', kitchenSplitBar: d.kitchenSplitBar === true, barCats: Array.isArray(k.barCategories) ? k.barCategories : null };
                loadedAt = Date.now();
                try { localStorage.setItem(CACHE, JSON.stringify(raw)); } catch (e) { }
            } catch (e) { console.warn('via da cozinha: configuração', e && e.message); }
            loading = null;
            return cfg();
        })();
        return loading;
    }
    async function save(patch) { await db.collection('settings').doc(DOC).set({ ...patch, updatedAt: ts() }, { merge: true }); return load(true); }
    async function saveBar(list) { await db.collection('settings').doc('cozinha').set({ barCategories: list, updatedAt: ts() }, { merge: true }); return load(true); }

    /* ---------- texto do item (sabores e adicionais) ---------- */
    const flavorsOf = it => (Array.isArray(it && it.flavors) && it.flavors.length > 1 ? it.flavors : []);
    function fracTxt(f, n) { const d = Number(f) > 0 ? Math.round(1 / Number(f)) : n; return d > 1 ? '1/' + d : ''; }
    const addonsOf = it => (Array.isArray(it && it.addons) ? it.addons.filter(a => a && a.name) : []);
    // Linhas da cozinha: um sabor por linha e cada adicional com "+"
    function lines(it) {
        const fl = flavorsOf(it);
        return fl.map(f => (fracTxt(f.frac, fl.length) + ' ' + (f.name || '')).trim()).concat(addonsOf(it).map(a => '+ ' + a.name + (Number(a.qty) > 1 ? ' x' + a.qty : '')));
    }
    // Título na cozinha: a pizza de vários sabores aparece pelo grupo (ex.: "Pizza Grande") e os sabores embaixo
    const title = it => (flavorsOf(it).length ? (it.flavorGroup || it.productName || '') : (it && it.productName) || '');
    const addonText = it => addonsOf(it).map(a => '+ ' + a.name).join(', ');
    // Cupom do cliente (PDV e 2ª via em Pedidos): sabores e adicionais embaixo do nome
    function receiptRows(it) {
        const fl = flavorsOf(it), l = fl.map(f => (fracTxt(f.frac, fl.length) + ' ' + (f.name || '')).trim()).concat(addonsOf(it).map(a => '+ ' + a.name));
        return l.length ? `<tr><td colspan="2" style="font-size:11px;padding:0 0 5px 6px;line-height:1.3">${l.map(esc).join('<br>')}</td></tr>` : '';
    }

    /* ---------- impressão (80 mm) ---------- */
    const STYLE = big => `@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;padding:2mm;font-family:"Courier New",monospace;font-size:${big ? 14 : 11}px;color:#000;font-weight:700}.c{text-align:center}.sep{border-top:1px dashed #000;margin:2mm 0}.row{display:flex;justify-content:space-between;gap:2mm}.it{margin:1.4mm 0}.sm{font-size:9.5px;font-weight:400}.xl{font-size:${big ? 22 : 15}px}.tot{font-size:15px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:1.4mm 0;margin-top:1mm}.obs{font-size:${big ? 13 : 10}px;margin-left:3mm}
.via+.via{break-before:page;page-break-before:always}.lbl{text-align:center;font-size:19px;margin-top:1mm}.pw{border:2px solid #000;border-radius:2mm;text-align:center;margin:2mm 8mm;padding:1mm 0}.pw small{display:block;font-size:10px;letter-spacing:2px}.pw b{display:block;font-size:40px;line-height:1.05}.it b{font-size:15px}.ad{font-size:13px;margin-left:5mm}.box{font-size:12px;margin:1mm 0}.rp{display:inline-block;border:1px solid #000;padding:0 2mm;font-size:10px}
button{font:700 13px Arial;padding:9px 16px;margin-top:4mm}@media print{button,.noprint{display:none}}${window.DPPapel ? DPPapel.css() : ''}`; // 40.49 · ajuste da impressora desta empresa (papel-v1.js)
    const docHtml = (title, inner, big) => `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${STYLE(big)}</style></head><body>${inner}</body></html>`;
    const isApp = () => /Electron\//.test(navigator.userAgent || '');
    function printHtml(html, w) {
        api.last = html;
        if (!w && isApp()) { try { w = window.open('', '_blank', 'width=420,height=760'); } catch (e) { w = null; } }
        if (w && !w.closed) {
            try {
                w.document.open();
                w.document.write(html.replace('</body>', '<div class="c noprint"><button onclick="window.print()">Imprimir</button></div><script>setTimeout(function(){try{window.print()}catch(e){}},300)<\/script></body>'));
                w.document.close(); w.focus(); return true;
            } catch (e) { }
        }
        // Janela escondida: imprime sem pop-up (o navegador não bloqueia)
        const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.className = 'dpkp-frame';
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(f);
        const d = f.contentDocument; d.open(); d.write(html); d.close();
        setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(() => f.remove(), 4000); }, 300);
        return true;
    }
    // Pré-conta e conta das Mesas (antes ficava em mesas-v1.js): abre a janela no clique; se o pop-up for bloqueado, imprime escondido
    function open() { try { return window.open('', '_blank', 'width=420,height=760'); } catch (e) { return null; } }
    function write(w, title, inner, big) { return api.printHtml(docHtml(title, inner, big), w); }

    /* ---------- a via ---------- */
    const catOf = (it, products) => { const p = (products || []).find(x => x.id === it.productId); return String((p && (p.category || p._cat)) || it.category || ''); };
    const isBar = (it, products, cats) => { const c = catOf(it, products); return cats ? cats.includes(c) : (BAR_GUESS.test(c) || BAR_GUESS.test(it.productName || '')); };
    function sectors(items, products, c, only) {
        if (only) return [[only, items]];
        if (!c.split) return [['COZINHA', items]];
        const bar = [], kit = [];
        items.forEach(it => (isBar(it, products, c.barCats) ? bar : kit).push(it));
        return [['COZINHA', kit], ['BAR', bar]].filter(s => s[1].length);
    }
    function viaHtml(o, sector, items) {
        const who = [o.waiter, o.people ? o.people + ' pessoa(s)' : '', o.by && o.by !== o.waiter ? o.by : ''].filter(Boolean).join(' · ');
        const info = [
            o.customer ? `<div class="box">Cliente: ${esc(o.customer)}${o.phone ? ' · ' + esc(o.phone) : ''}</div>` : '',
            o.address ? `<div class="box">Entregar em: ${esc(o.address)}</div>` : '',
            o.payInfo ? `<div class="box">${esc(o.payInfo)}</div>` : '',
            o.notes ? `<div class="box">Obs. do pedido: ${esc(o.notes)}</div>` : ''
        ].join('');
        return `<section class="via"><div class="c xl">${esc(sector)}</div>${o.reprint ? '<div class="c"><span class="rp">2ª VIA</span></div>' : ''}
<div class="lbl">${esc(o.label || '')}</div>${o.senha ? `<div class="pw"><small>SENHA</small><b>${esc(o.senha)}</b></div>` : ''}
<div class="c sm">${hhmm(o.when)}${who ? ' · ' + esc(who) : ''}</div><div class="sep"></div>
${items.map(it => `<div class="it"><b>${esc(typeof o.fmtQty === 'function' ? o.fmtQty(it.quantity, it.unit) : fmtQ(it.quantity))}x ${esc(title(it))}</b>${lines(it).map(l => `<div class="ad">${esc(l)}</div>`).join('')}${it.notes ? `<div class="obs">** ${esc(it.notes)}</div>` : ''}</div>`).join('')}
<div class="sep"></div>${info}${info ? '<div class="sep"></div>' : ''}<div class="c sm">${items.length} item(ns) · ${esc(sector.toLowerCase())}</div></section>`;
    }
    /** o: {label, senha, items, products, when, by, waiter, people, customer, phone, address, notes, payInfo, reprint, sector} */
    function ticket(o, w) {
        o = o || {};
        const items = (o.items || []).filter(it => it && !SERVICE(it));
        if (!items.length) return null;
        const list = sectors(items, o.products, cfg(), o.sector);
        const html = docHtml('Cozinha ' + (o.label || ''), list.map(([s, l]) => viaHtml(o, s, l)).join(''), true);
        api.printHtml(html, w);
        return { vias: list.map(s => s[0]), html };
    }

    /* ---------- PDV e Pedidos ---------- */
    function kitchenItems(items, products) {
        return (items || []).filter(it => {
            if (!it || SERVICE(it) || it._dpBottleFee || /\(casco\)$/i.test(it.productName || '')) return false;
            const p = (products || []).find(x => x.id === it.productId);
            return !(p && (p.productType === 'service' || p.isService));
        });
    }
    function payInfo(s) {
        try { const t = window.DPEntregas && DPEntregas.payLine ? DPEntregas.payLine(s) : ''; if (t) return t; } catch (e) { } // 38.4 · "COBRAR R$ 58,00 · Dinheiro · levar troco R$ 42,00" (entregas-pro-v1.js)
        const N = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito', fiado: 'Fiado', vale: 'Vale' };
        const p = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod || 'dinheiro', amount: s.total }];
        const cash = p.find(x => x.method === 'dinheiro' && Number(x.cashReceived) > Number(x.amount));
        return 'Pagamento: ' + p.map(x => (N[x.method] || x.method || '') + ' ' + money(x.amount)).join(' + ') + (cash ? ' · troco para ' + money(cash.cashReceived) : '');
    }
    function fromSale(s, items, products, reprint) {
        const n = s.saleNumber || '', type = s.channel === 'mesa' ? 'mesa' : (s.type || 'balcao');
        const label = type === 'mesa' ? (s.tableLabel || 'Mesa') : (type === 'delivery' ? 'ENTREGA' : type === 'pickup' ? 'RETIRADA' : 'BALCÃO') + (n ? ' #' + n : '');
        const cust = /^consumidor final$/i.test(String(s.customerName || '').trim()) ? '' : (type === 'mesa' ? '' : s.customerName || '');
        return {
            label, senha: (type === 'balcao' || type === 'pickup') && n ? String(n) : '', items, products, when: msOf(s.createdAt) || Date.now(),
            by: s.sellerName || s.operatorName || '', customer: cust, phone: type === 'delivery' ? (s.customerPhone || '') : '',
            address: type === 'delivery' ? [s.address, s.addressRef].filter(Boolean).join(' · ') : '', notes: s.notes || '',
            payInfo: type === 'delivery' ? payInfo(s) : '', reprint: !!reprint
        };
    }
    function ask(s, items) {
        return new Promise(done => {
            document.getElementById('dpkpAsk')?.remove();
            const ov = document.createElement('div'); ov.className = 'modal-overlay active'; ov.id = 'dpkpAsk';
            ov.innerHTML = `<div class="modal" style="max-width:360px;text-align:center"><div class="modal-body" style="padding:26px 22px">
<div style="width:58px;height:58px;border-radius:50%;background:var(--warning-bg,rgba(245,158,11,.12));color:var(--warning,#f59e0b);display:flex;align-items:center;justify-content:center;margin:0 auto 14px;font-size:26px">${I('chef-hat')}</div>
<div style="font-size:17px;font-weight:700;color:var(--text-heading);margin-bottom:6px">Mandar para a cozinha?</div>
<div style="font-size:13px;color:var(--text-muted);margin-bottom:20px">Venda #V-${esc(String(s.saleNumber || '').padStart(4, '0'))} · ${items.length} item(ns) para preparar</div>
<div style="display:flex;gap:10px"><button type="button" class="btn btn-secondary" style="flex:1" data-k="0">Agora não</button><button type="button" class="btn btn-primary" style="flex:2" data-k="1">${I('printer')} Imprimir a via</button></div></div></div>`;
            const end = v => { document.removeEventListener('keydown', key, true); ov.remove(); done(v); };
            const key = e => { if (e.key === 'Escape') { e.preventDefault(); end(false); } else if (e.key === 'Enter') { e.preventDefault(); end(true); } };
            ov.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) end(b.dataset.k === '1'); });
            document.addEventListener('keydown', key, true);
            document.body.appendChild(ov);
            setTimeout(() => ov.querySelector('[data-k="1"]')?.focus(), 30);
        });
    }
    /** PDV: chamado depois de gravar a venda. Não imprime em loja que não é do ramo (padrão 'nao'). */
    async function afterSale(s, products) {
        if (!s || s.channel === 'mesa') return null;
        const c = await load();
        if (c.mode === 'nao') return null;
        const items = kitchenItems(s.items, products);
        if (!items.length) return null;
        if (c.mode === 'perguntar' && !(await ask(s, items))) return null;
        return ticket(fromSale(s, items, products));
    }
    async function loadProducts() {
        try {
            const base = db.collection('products'), q = typeof base.select === 'function' ? base.select('name', 'category', 'productType', 'deleted') : base;
            return (await q.get()).docs.map(d => ({ id: d.id, ...d.data() }));
        } catch (e) { return []; }
    }
    async function reprint(id) {
        try {
            const d = await db.collection('sales').doc(id).get();
            if (!d.exists) { toast('error', 'Venda não encontrada'); return null; }
            const s = { id, ...d.data() };
            const [, products] = await Promise.all([load(), loadProducts()]);
            const items = kitchenItems(s.items, products);
            if (!items.length) { toast('warning', 'Esta venda não tem itens para a cozinha.'); return null; }
            const r = ticket(fromSale(s, items, products, true));
            toast('success', 'Via da cozinha enviada para a impressora');
            return r;
        } catch (e) { toast('error', 'Não foi possível imprimir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return null; }
    }
    // Botão "Via da cozinha" no detalhe da venda (Pedidos): aparece no ramo restaurante ou quando a via está ligada
    function button(s) {
        if (!s || !s.id || !(isFood() || cfg().mode !== 'nao')) return '';
        if (!kitchenItems(s.items, []).length) return '';
        return `<button class="btn btn-outline" type="button" onclick="DPKitchenPrint.reprint('${esc(s.id)}')" title="Imprimir de novo a via da cozinha (sem preços)"><i class="fas fa-fire-burner"></i> Via da cozinha</button>`;
    }

    /* ---------- Configurações › Vendas ---------- */
    function css() {
        if ($('dpkpCss')) return;
        const st = document.createElement('style'); st.id = 'dpkpCss';
        st.textContent = `.dpkp-cfg .dpkp-h{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}.dpkp-cfg .dpkp-ic{width:44px;height:44px;border-radius:12px;background:var(--accent-muted);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}
.dpkp-cfg h3{margin:0 0 4px;font-size:16px;color:var(--text-heading)}.dpkp-cfg p{margin:0;font-size:12.5px;color:var(--text-muted);line-height:1.5}
.dpkp-modes{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px}.dpkp-modes label{display:flex;gap:8px;align-items:flex-start;padding:11px 12px;border-radius:12px;border:1px solid var(--border-color);background:var(--bg-secondary);cursor:pointer;font-size:13px;color:var(--text-primary)}
.dpkp-modes label.on{border-color:var(--accent);box-shadow:0 0 0 1px var(--accent) inset}.dpkp-modes input{margin-top:2px;accent-color:var(--accent)}.dpkp-modes small{display:block;color:var(--text-muted);font-size:11.5px;font-weight:400;margin-top:2px}
.dpkp-row{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--bg-secondary);font-size:13px;color:var(--text-primary);cursor:pointer}.dpkp-row input{margin-top:2px;accent-color:var(--accent)}.dpkp-row small{display:block;color:var(--text-muted);font-size:11.5px}
.dpkp-bar{margin:8px 0 0;padding:12px 14px;border-radius:12px;border:1px dashed var(--border-color)}.dpkp-bar>b{display:block;font-size:12.5px;color:var(--text-heading);margin-bottom:8px}.dpkp-chips{display:flex;flex-wrap:wrap;gap:6px}
.dpkp-chips label{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border-radius:999px;border:1px solid var(--border-color);font-size:12.5px;cursor:pointer;color:var(--text-primary)}.dpkp-chips label.on{background:var(--accent-muted);border-color:var(--accent);color:var(--accent)}.dpkp-chips input{display:none}
.dpkp-foot{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.dpkp-foot small{color:var(--text-muted);font-size:12px}.dpkp-cfg svg.dpi{width:1em;height:1em}
@media(max-width:760px){.dpkp-modes{grid-template-columns:1fr}}`;
        document.head.appendChild(st);
    }
    let cfgRefresh = null;
    function setupConfig() {
        const host = $('tabVendas'); if (!host || !HAS_DB) return;
        if ($('dpkpCfg')) { if (cfgRefresh) cfgRefresh(); return; }
        css();
        const card = document.createElement('div'); card.className = 'card dpkp-cfg'; card.id = 'dpkpCfg'; card.style.marginBottom = '20px';
        const first = host.querySelector('.card');
        if (first) first.insertAdjacentElement('afterend', card); else host.insertBefore(card, host.firstChild);
        let cats = [];
        const loadCats = async () => { try { const s = await db.collection('categories').get(); cats = [...new Set(s.docs.map(d => d.data() || {}).filter(c => !c.deleted && c.name).map(c => String(c.name)))].sort((a, b) => a.localeCompare(b, 'pt-BR')); } catch (e) { } };
        const MODES = [['auto', 'Imprimir sozinho', 'Sai na hora em que a venda é finalizada.'], ['perguntar', 'Perguntar a cada venda', 'O caixa escolhe se manda ou não.'], ['nao', 'Não imprimir', 'Use quando não tem cozinha.']];
        const paint = () => {
            const c = cfg(), bar = c.barCats || cats.filter(x => BAR_GUESS.test(x));
            card.innerHTML = `<div class="dpkp-h"><span class="dpkp-ic">${I('chef-hat')}</span><div><h3>Via da cozinha</h3><p>Para restaurante, lanchonete, pizzaria e padaria: ao finalizar a venda no PDV (balcão, retirada ou entrega) sai uma via para a cozinha, sem preços, com os adicionais, os sabores e as observações de cada item. No balcão e na retirada, a <b>senha</b> do pedido sai em letra grande. As Mesas usam a mesma via. Salva na hora.</p></div></div>
<div class="dpkp-modes" role="radiogroup">${MODES.map(([k, t, d]) => `<label class="${c.mode === k ? 'on' : ''}"><input type="radio" name="dpkpMode" value="${k}" ${c.mode === k ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}</div>
<label class="dpkp-row"><input type="checkbox" id="dpkpSplit" ${c.split ? 'checked' : ''}><span><b>Separar em duas vias: COZINHA e BAR</b><small>As bebidas saem numa via própria, para quem cuida do bar.</small></span></label>
${c.split ? `<div class="dpkp-bar"><b>Categorias que saem na via do BAR</b><div class="dpkp-chips">${cats.map(x => `<label class="${bar.includes(x) ? 'on' : ''}"><input type="checkbox" value="${esc(x)}" ${bar.includes(x) ? 'checked' : ''}>${esc(x)}</label>`).join('') || '<small>Cadastre as categorias em Produtos › Categorias.</small>'}</div></div>` : ''}
<div class="dpkp-foot"><button type="button" class="btn btn-outline btn-sm" id="dpkpTest">${I('printer')} Imprimir uma via de teste</button><small>${c.chosen ? '' : (isFood() ? 'Seu ramo é restaurante: a via já vem ligada.' : 'Desligada até você escolher.')}</small></div>`;
        };
        cfgRefresh = () => Promise.all([load(true), loadCats()]).then(paint);
        paint(); cfgRefresh();
        card.addEventListener('change', async e => {
            const t = e.target;
            try {
                if (t.name === 'dpkpMode') { await save({ kitchenPrint: t.value }); paint(); toast('success', t.value === 'auto' ? 'A via da cozinha vai sair sozinha ao finalizar a venda.' : t.value === 'perguntar' ? 'O PDV vai perguntar se manda a via para a cozinha.' : 'Via da cozinha desligada no PDV.'); }
                else if (t.id === 'dpkpSplit') { await save({ kitchenSplitBar: t.checked }); if (t.checked && !cfg().barCats) await saveBar(cats.filter(x => BAR_GUESS.test(x))); paint(); toast('success', t.checked ? 'Agora saem duas vias: COZINHA e BAR.' : 'Volta a sair uma via só.'); }
                else if (t.closest('.dpkp-chips')) { const list = [...card.querySelectorAll('.dpkp-chips input:checked')].map(i => i.value); await saveBar(list); paint(); toast('success', 'Categorias do bar salvas.'); }
            } catch (err) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); paint(); }
        });
        card.addEventListener('click', e => {
            if (!e.target.closest('#dpkpTest')) return;
            ticket({ label: 'BALCÃO #123', senha: '123', when: Date.now(), by: 'Teste', notes: 'Via de teste: confira se a impressora corta o papel.', items: [
                { productId: '', productName: 'X-Burguer', quantity: 2, notes: 'um sem cebola', addons: [{ name: 'Bacon', price: 4 }] },
                { productId: '', productName: '1/2 Calabresa + 1/2 Frango', flavorGroup: 'Pizza Grande', quantity: 1, flavors: [{ name: 'Calabresa', frac: 0.5 }, { name: 'Frango', frac: 0.5 }] },
                { productId: '', productName: 'Refrigerante lata', category: (cfg().barCats || ['Bebidas'])[0] || 'Bebidas', quantity: 2 }] });
        });
    }

    const api = { cfg, load, save, isFood, lines, title, addonText, receiptRows, ticket, afterSale, reprint, button, kitchenItems, fromSale, open, write, printHtml, docHtml, last: '' };
    window.DPKitchenPrint = api;
    if (!HAS_DB) return;
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupConfig); else setupConfig();
    try { auth.onAuthStateChanged(u => { if (u) { load(true); if ($('tabVendas')) setupConfig(); } }); } catch (e) { }
})();
