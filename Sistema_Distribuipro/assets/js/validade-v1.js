/* DistribuiPro 38.3 · Validade e lote (todas as versões).
   - Produto com "Controlar validade e lote" (products.trackExpiry) pede lote e validade na entrada:
     receber compra (Compras), entrada rápida (Produtos) e ajuste de entrada (Estoque).
   - Lotes em stock_lots {productId, productName, lot, expiry:'AAAA-MM-DD', qty, initialQty, unitCost, depositId,
     purchaseId, purchaseNumber, supplierName, origin, createdAtMs}. O estoque total continua em products.currentStock.
   - Saída (venda, OS, consignado, perda, ajuste): embrulha StockService.exit (flag __dpLots, igual ao depositos-v1.js)
     e baixa primeiro o lote que vence antes (FEFO). Lote vencido só sai se não houver outro (ele fica no aviso até
     virar perda). Cada baixa fica em stock_lot_moves {lotId, productId, qty, back, kind:'out', refType, refId}:
     cancelar a venda (ou estornar perda/consignado) devolve a quantidade ao mesmo lote.
   - Estoque › aba Validades: vencidos / até 7 dias / até 30 dias, custo em risco, "Baixar como perda" e
     "Pôr em promoção". Início: cartão de alerta. PDV: cobra o preço promocional que está valendo
     (window.dpPrecoVigente) e avisa quando o produto tem lote vencido.
   - Mensal (e demo, com o selo): promoção automática X dias antes do vencimento e a perda entra no Controle de desperdício. */
(function () {
    'use strict';
    if (window.DPValidade) return;
    const LOTS = 'stock_lots', MOVES = 'stock_lot_moves';
    // Saídas que podem voltar (cancelar/editar venda, troca/devolução, estornar desperdício/consignado/OS): a volta vai
    // para o mesmo lote. Chave = tipo da entrada; valor = tipo da saída que ela desfaz.
    const REVERSIBLE = { sale: 'sale', return: 'sale', waste: 'waste', consignment: 'consignment', service_order: 'service_order', loss: 'loss', purchase_cancel: 'purchase_cancel' };
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const n3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); const x = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return Number.isFinite(x) ? x : 0; };
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qf = v => n3(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const n2in = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const today = () => ymd(new Date());
    const dOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
    const daysTo = s => { const d = dOf(s); if (!d) return null; return Math.round((d - dOf(today())) / 864e5); };
    const br = s => { const d = dOf(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const isYmd = s => /^\d{4}-\d{2}-\d{2}$/.test(String(s || ''));
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || ''; } catch (e) { return ''; } };
    const plural = (n, a, b) => (Number(n) === 1 ? a : b);
    const rel = d => d === null ? 'sem data' : d < 0 ? `venceu há ${-d} ${plural(-d, 'dia', 'dias')}` : d === 0 ? 'vence hoje' : d === 1 ? 'vence amanhã' : `vence em ${d} dias`;
    let MENSAL = null; // recursos do Mensal (bloco no fim do arquivo; não vai para os pacotes)

    /* =================== Configuração (settings/general.validade) =================== */
    const CFG_KEY = 'dp_validade_cfg';
    let cfg = { alertDays: 30, promoAuto: { on: false, days: 7, pct: 20 } };
    try { const c = JSON.parse(localStorage.getItem(CFG_KEY) || 'null'); if (c && typeof c === 'object') cfg = { ...cfg, ...c, promoAuto: { ...cfg.promoAuto, ...(c.promoAuto || {}) } }; } catch (e) { }
    const alertDays = () => Math.max(8, Math.min(120, Number(cfg.alertDays) || 30));
    async function loadCfg() {
        try {
            const s = await db.collection('settings').doc('general').get(); const v = s.exists ? (s.data() || {}).validade : null;
            if (v && typeof v === 'object') { cfg = { ...cfg, ...v, promoAuto: { ...cfg.promoAuto, ...(v.promoAuto || {}) } }; try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { } }
        } catch (e) { }
        return cfg;
    }
    async function saveCfg(next) {
        cfg = { ...cfg, ...next, promoAuto: { ...cfg.promoAuto, ...((next && next.promoAuto) || {}) } };
        try { localStorage.setItem(CFG_KEY, JSON.stringify(cfg)); } catch (e) { }
        await db.collection('settings').doc('general').set({ validade: cfg }, { merge: true });
    }

    /* =================== Preço que vale agora (promoção com data) =================== */
    function promoOn(p) {
        if (!p) return false;
        const s = Number(p.salePrice || p.price) || 0, pr = Number(p.promoPrice) || 0;
        return pr > 0 && (s <= 0 || pr < s) && (!p.promoUntil || !isYmd(p.promoUntil) || p.promoUntil >= today());
    }
    window.dpPrecoVigente = p => promoOn(p) ? Number(p.promoPrice) : (Number(p && (p.salePrice || p.price)) || 0);

    /* =================== Produto controla validade? =================== */
    let trackedSet = null, trackedAt = 0, trackedP = null;
    function pageLists() {
        const out = [];
        try { if (typeof products !== 'undefined' && Array.isArray(products)) out.push(products); } catch (e) { }
        try { if (typeof allProducts !== 'undefined' && Array.isArray(allProducts)) out.push(allProducts); } catch (e) { }
        return out;
    }
    function pageProduct(pid) { for (const l of pageLists()) { const p = l.find(x => x && x.id === pid); if (p) return p; } return null; }
    function trackedIds(force) {
        if (!force && trackedSet && Date.now() - trackedAt < 60000) return Promise.resolve(trackedSet);
        if (trackedP) return trackedP;
        trackedP = (async () => {
            try { const s = await db.collection('products').where('trackExpiry', '==', true).get(); trackedSet = new Set(s.docs.filter(d => (d.data() || {}).trackExpiry === true).map(d => d.id)); }
            catch (e) { trackedSet = null; }
            trackedAt = Date.now(); trackedP = null; return trackedSet;
        })();
        return trackedP;
    }
    async function isTracked(pid) {
        if (!pid) return false;
        const p = pageProduct(pid); if (p && p.trackExpiry === true) return true;
        const set = await trackedIds(); if (set) return set.has(pid);
        try { const d = await db.collection('products').doc(pid).get(); return !!(d.exists && (d.data() || {}).trackExpiry === true); } catch (e) { return false; }
    }

    /* =================== Lotes =================== */
    const docOf = d => ({ id: d.id, ...d.data() });
    const alive = l => l && !l.deleted && Number(l.qty) > 0.0005;
    async function lotsOf(pid) { const s = await db.collection(LOTS).where('productId', '==', pid).get(); return s.docs.map(docOf).filter(l => !l.deleted); }
    async function loadActiveLots() {
        let docs;
        try { docs = (await db.collection(LOTS).where('qty', '>', 0).get()).docs; }
        catch (e) { docs = (await db.collection(LOTS).get()).docs; }
        return docs.map(docOf).filter(alive);
    }
    async function loadTrackedProducts() {
        let docs;
        try { docs = (await db.collection('products').where('trackExpiry', '==', true).get()).docs; }
        catch (e) { docs = (await db.collection('products').get()).docs; }
        const list = docs.map(docOf).filter(p => p.trackExpiry === true && !p.deleted);
        trackedSet = new Set(list.map(p => p.id)); trackedAt = Date.now();
        return list;
    }
    // Ordem de saída: vence antes sai antes; lote vencido fica por último (vai para o aviso, não para o cliente)
    function fefoCmp(a, b) {
        const t = today();
        const xa = a.expiry && a.expiry < t ? 1 : 0, xb = b.expiry && b.expiry < t ? 1 : 0;
        if (xa !== xb) return xa - xb;
        const ea = a.expiry || '9999-12-31', eb = b.expiry || '9999-12-31';
        if (ea !== eb) return ea < eb ? -1 : 1;
        return (Number(a.createdAtMs) || 0) - (Number(b.createdAtMs) || 0);
    }
    function depHere() { try { return window.DPDepositos && DPDepositos.list().length > 1 ? DPDepositos.here() : 'principal'; } catch (e) { return 'principal'; } }
    const prefer = {}; // productId -> { lotId, purchaseId, at }: a próxima saída começa por este lote (perda de um lote, devolver compra)
    function preferir(pid, o) { if (pid) prefer[pid] = { ...(o || {}), at: Date.now() }; }
    function saida(lots, pid) {
        const pr = prefer[pid] && Date.now() - prefer[pid].at < 120000 ? prefer[pid] : null;
        if (prefer[pid]) delete prefer[pid];
        const dep = depHere(), hit = l => !!pr && ((pr.lotId && l.id === pr.lotId) || (pr.purchaseId && l.purchaseId === pr.purchaseId));
        return lots.filter(alive).sort((a, b) => {
            const pa = hit(a) ? 0 : 1, pb = hit(b) ? 0 : 1; if (pa !== pb) return pa - pb;
            const da = (a.depositId || 'principal') === dep ? 0 : 1, dB = (b.depositId || 'principal') === dep ? 0 : 1; if (da !== dB) return da - dB;
            return fefoCmp(a, b);
        });
    }
    async function consumir(pid, qty, refType, refId) {
        let left = n3(qty); const used = [];
        if (!(left > 0)) return used;
        const lots = saida(await lotsOf(pid), pid);
        for (const l of lots) {
            if (left <= 0.0005) break;
            const take = n3(Math.min(left, Number(l.qty) || 0)); if (!(take > 0)) continue;
            const nq = n3(Number(l.qty) - take);
            await db.collection(LOTS).doc(l.id).update({ qty: nq, updatedAt: ts() });
            await db.collection(MOVES).add({ lotId: l.id, lot: l.lot || '', expiry: l.expiry || '', productId: pid, qty: take, back: 0, kind: 'out', refType: refType || '', refId: refId || '', createdAtMs: Date.now(), createdAt: ts(), userId: uid() });
            used.push({ lot: l, take, left: nq }); left = n3(left - take);
            if (nq <= 0.0005) await fimDoLote(pid, l);
        }
        pdvCacheAfter(pid, used);
        return used;
    }
    async function devolver(pid, qty, refType, refId) {
        let left = n3(qty), done = 0;
        if (!(left > 0) || !refId) return 0;
        let moves = [];
        try { moves = (await db.collection(MOVES).where('refId', '==', refId).get()).docs.map(docOf); } catch (e) { return 0; }
        moves = moves.filter(m => m.productId === pid && m.kind === 'out' && m.refType === refType && n3(Number(m.qty) - Number(m.back || 0)) > 0)
            .sort((a, b) => (Number(b.createdAtMs) || 0) - (Number(a.createdAtMs) || 0));
        for (const m of moves) {
            if (left <= 0.0005) break;
            const give = n3(Math.min(left, n3(Number(m.qty) - Number(m.back || 0))));
            let cur = null; try { const d = await db.collection(LOTS).doc(m.lotId).get(); cur = d.exists ? d.data() : null; } catch (e) { }
            if (!cur || cur.deleted) continue;
            await db.collection(LOTS).doc(m.lotId).update({ qty: n3(Number(cur.qty || 0) + give), updatedAt: ts() });
            await db.collection(MOVES).doc(m.id).update({ back: n3(Number(m.back || 0) + give) });
            left = n3(left - give); done = n3(done + give);
        }
        return done;
    }
    /** Entrada com lote: soma no mesmo lote (mesmo código, validade, local e compra) ou cria um lote novo. */
    async function entrada(pid, qty, info) {
        info = info || {}; qty = n3(qty);
        if (!pid || !(qty > 0)) return null;
        const exp = isYmd(info.expiry) ? info.expiry : '', lot = String(info.lot || '').trim().slice(0, 40);
        let p = info.product || pageProduct(pid);
        if (!p) { try { const d = await db.collection('products').doc(pid).get(); p = d.exists ? { id: pid, ...d.data() } : { id: pid }; } catch (e) { p = { id: pid }; } }
        const dep = depHere(), pur = info.purchaseId || '';
        let same = null;
        if (lot || exp) { try { same = (await lotsOf(pid)).find(l => (l.lot || '') === lot && (l.expiry || '') === exp && (l.depositId || 'principal') === dep && (l.purchaseId || '') === pur); } catch (e) { } }
        if (same) {
            await db.collection(LOTS).doc(same.id).update({ qty: n3(Number(same.qty || 0) + qty), initialQty: n3(Number(same.initialQty || 0) + qty), updatedAt: ts() });
            return same.id;
        }
        const ref = await db.collection(LOTS).add({
            productId: pid, productName: p.name || info.productName || '', lot, expiry: exp, qty, initialQty: qty,
            unitCost: Math.round((Number(info.unitCost) || Number(p.costPrice) || 0) * 10000) / 10000, depositId: dep,
            purchaseId: pur, purchaseNumber: info.purchaseNumber || '', supplierName: info.supplierName || '', origin: info.origin || 'manual',
            createdAtMs: Date.now(), createdAt: ts(), createdBy: uid(), deleted: false
        });
        return ref.id;
    }
    // Lote informado na tela (entrada rápida / ajuste): vale para a próxima entrada deste produto
    const pending = {};
    function proximaEntrada(pid, info) { if (pid && info && (info.expiry || info.lot)) pending[pid] = { ...info, at: Date.now() }; }
    function takePending(pid) { const p = pending[pid]; if (!p) return null; delete pending[pid]; return Date.now() - p.at < 90000 ? p : null; }
    // Lote acabou: a promoção feita para ele (validade) termina junto
    async function fimDoLote(pid, lot) {
        try {
            const pg = pageProduct(pid); let p = pg;
            if (!p || p.promoLotId === undefined) { const d = await db.collection('products').doc(pid).get(); p = d.exists ? d.data() : null; }
            if (p && p.promoLotId === lot.id && /^validade/.test(String(p.promoReason || ''))) {
                const off = { promoPrice: null, promoUntil: null, promoReason: '', promoLotId: '', promoAuto: false };
                await db.collection('products').doc(pid).update(off);
                if (pg) Object.assign(pg, off);
            }
        } catch (e) { }
    }

    /* =================== StockService: entradas e saídas mexem nos lotes =================== */
    function wrapStock() {
        if (typeof StockService === 'undefined' || !StockService || StockService.__dpLots) return;
        const oe = StockService.entry, ox = StockService.exit, oa = StockService.adjust;
        StockService.entry = async function (pid, quantity, reason, refType, refId) {
            const r = await oe.apply(this, arguments);
            try {
                const q = n3(quantity), pd = takePending(pid);
                if (pd) await entrada(pid, q, { ...pd, origin: pd.origin || 'entrada' });
                else if (refId && REVERSIBLE[refType] && await isTracked(pid)) await devolver(pid, q, REVERSIBLE[refType], refId);
            } catch (e) { console.warn('validade (entrada):', e && e.message); }
            return r;
        };
        StockService.exit = async function (pid, quantity, reason, refType, refId) {
            const r = await ox.apply(this, arguments);
            try { if (pid && n3(quantity) > 0 && await isTracked(pid)) await consumir(pid, n3(quantity), refType, refId); }
            catch (e) { console.warn('validade (saída):', e && e.message); }
            return r;
        };
        if (typeof oa === 'function') StockService.adjust = async function (pid, newQty) {
            let before = null, tr = false;
            try { tr = await isTracked(pid); if (tr) { const d = await db.collection('products').doc(pid).get(); before = Number((d.data() || {}).currentStock || 0); } } catch (e) { }
            const r = await oa.apply(this, arguments);
            try {
                const pd = takePending(pid);
                if (tr && before !== null) { const delta = n3(Number(newQty) - before); if (delta < 0) await consumir(pid, -delta, 'adjustment', ''); else if (delta > 0 && pd) await entrada(pid, delta, { ...pd, origin: 'inventario' }); }
            } catch (e) { console.warn('validade (inventário):', e && e.message); }
            return r;
        };
        StockService.__dpLots = true;
    }
    try { wrapStock(); } catch (e) { }

    /* =================== Resumo (aba Validades e Início) =================== */
    function mkRow(l, p, q) {
        const d = daysTo(l.expiry), cost = Number(p.costPrice) || Number(l.unitCost) || 0;
        const bucket = d === null ? 'sem' : d < 0 ? 'vencido' : d <= 7 ? 'd7' : d <= alertDays() ? 'd30' : 'ok';
        return { ...l, qty: q, product: p, productId: p.id, days: d, bucket, risk: r2(q * cost) };
    }
    async function resumo(prods) {
        prods = prods || await loadTrackedProducts();
        const lots = prods.length ? await loadActiveLots() : [];
        const byP = {}; lots.forEach(l => (byP[l.productId] = byP[l.productId] || []).push(l));
        const rows = [], semLote = [];
        for (const p of prods) {
            const pl = (byP[p.id] || []).filter(alive).sort(fefoCmp);
            const stock = Math.max(0, n3(p.currentStock));
            // Saídas feitas por fora (cadastro, outra tela): o que sobra a mais nos lotes saiu na ordem de venda
            let excess = n3(pl.reduce((s, l) => s + Number(l.qty || 0), 0) - stock), mine = 0;
            for (const l of pl) {
                let q = n3(l.qty);
                if (excess > 0) { const t = Math.min(excess, q); q = n3(q - t); excess = n3(excess - t); }
                if (q > 0.0005) { rows.push(mkRow(l, p, q)); mine = n3(mine + q); }
            }
            const free = n3(stock - mine); if (free > 0.0005) semLote.push({ product: p, qty: free });
        }
        rows.sort((a, b) => { const ea = a.expiry || '9999-12-31', eb = b.expiry || '9999-12-31'; return ea < eb ? -1 : ea > eb ? 1 : String(a.product.name || '').localeCompare(String(b.product.name || ''), 'pt-BR'); });
        const z = () => ({ n: 0, qty: 0, risk: 0 }), k = { vencido: z(), d7: z(), d30: z(), ok: z(), sem: z() };
        rows.forEach(r => { const b = k[r.bucket]; b.n++; b.qty = n3(b.qty + r.qty); b.risk = r2(b.risk + r.risk); });
        return { prods, rows, semLote, k, risk: r2(k.vencido.risk + k.d7.risk + k.d30.risk) };
    }
    // Promoções de validade que já passaram da data: o preço volta ao normal
    async function limparPromos(prods) {
        let n = 0;
        for (const p of prods || []) {
            if (!/^validade/.test(String(p.promoReason || '')) || !isYmd(p.promoUntil) || p.promoUntil >= today()) continue;
            try { await db.collection('products').doc(p.id).update({ promoPrice: null, promoUntil: null, promoReason: '', promoLotId: '', promoAuto: false }); Object.assign(p, { promoPrice: null, promoUntil: null, promoReason: '', promoLotId: '', promoAuto: false }); n++; } catch (e) { }
        }
        return n;
    }

    /* =================== Visual =================== */
    function css() {
        if ($('vldCss')) return;
        const st = document.createElement('style'); st.id = 'vldCss';
        st.textContent = `
.vld-hide{display:none!important}
.vld-tabs{display:inline-flex;gap:4px;padding:4px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-card);margin:0 0 16px;max-width:100%}
.vld-tabs button{display:inline-flex;align-items:center;gap:8px;border:0;background:transparent;color:var(--text-secondary);font-weight:600;font-size:13px;padding:8px 14px;border-radius:9px;cursor:pointer;white-space:nowrap}
.vld-tabs button.on{background:var(--accent);color:#fff}
.vld-tabs svg{width:16px;height:16px}
.vld-cnt{min-width:18px;height:18px;padding:0 5px;border-radius:9px;background:#dc2626;color:#fff;font-size:10.5px;line-height:18px;text-align:center}
.vld-tabs button.on .vld-cnt{background:#fff;color:#dc2626}
.vld-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:14px}
.vld-head h3{margin:0;font-size:17px;color:var(--text-heading,var(--text-primary))}
.vld-head p{margin:4px 0 0;font-size:12.5px;color:var(--text-muted);max-width:620px;line-height:1.5}
.vld-head-act{display:flex;gap:8px;flex-wrap:wrap}
.vld-head-act .btn svg,.vld-btn svg{width:15px;height:15px}
.vld-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.vld-kpi{display:flex;flex-direction:column;gap:2px;text-align:left;padding:14px 16px;border-radius:14px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);cursor:pointer;font:inherit;border-left-width:4px}
.vld-kpi small{font-size:11.5px;color:var(--text-muted);font-weight:600}
.vld-kpi b{font-size:20px;font-weight:800}
.vld-kpi span{font-size:11.5px;color:var(--text-muted)}
.vld-kpi.bad{border-left-color:#dc2626}.vld-kpi.bad b{color:#dc2626}
.vld-kpi.warn{border-left-color:#d97706}.vld-kpi.warn b{color:#d97706}
.vld-kpi.info{border-left-color:#2563eb}.vld-kpi.info b{color:#2563eb}
.vld-kpi.money{border-left-color:var(--accent);cursor:default}
.vld-kpi.sel{box-shadow:0 0 0 2px var(--accent) inset}
.vld-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px}
.vld-chips{display:flex;gap:6px;flex-wrap:wrap}
.vld-chips button{border:1px solid var(--border-color);background:var(--bg-surface,transparent);color:var(--text-secondary);font-size:12px;font-weight:600;padding:6px 12px;border-radius:999px;cursor:pointer}
.vld-chips button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.vld-t td{vertical-align:middle}
.vld-t td small{display:block;font-size:11px;color:var(--text-muted);margin-top:2px}
.vld-t .r{text-align:right;white-space:nowrap}
.vld-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11.5px;font-weight:700;white-space:nowrap}
.vld-pill.vencido{background:rgba(220,38,38,.12);color:#dc2626}
.vld-pill.d7{background:rgba(217,119,6,.14);color:#b45309}
.vld-pill.d30{background:rgba(37,99,235,.12);color:#2563eb}
.vld-pill.ok,.vld-pill.sem{background:rgba(16,185,129,.12);color:#059669}
[data-theme="dark"] .vld-pill.d7{color:#fbbf24}[data-theme="dark"] .vld-pill.d30{color:#60a5fa}
.vld-promo{display:inline-flex;align-items:center;gap:4px;margin-top:3px;padding:1px 8px;border-radius:999px;background:rgba(16,185,129,.12);color:#059669;font-size:11px;font-weight:700}
.vld-promo svg,.vld-pill svg{width:12px;height:12px}
.vld-act{display:flex;gap:4px;justify-content:flex-end}
.vld-act .btn-icon svg{width:16px;height:16px}
.vld-empty{text-align:center;padding:34px 16px;color:var(--text-muted);font-size:13px;line-height:1.6}
.vld-empty svg{width:34px;height:34px;opacity:.5;display:block;margin:0 auto 8px}
.vld-free{display:flex;align-items:center;gap:10px;padding:10px 0;border-top:1px solid var(--border-color);font-size:13px}
.vld-free:first-of-type{border-top:0}
.vld-free b{flex:1;min-width:0}
.vld-free span{color:var(--text-muted);white-space:nowrap}
.vld-info{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:10px;background:var(--bg-secondary);margin-bottom:14px}
.vld-info b{font-size:14px;color:var(--text-heading,var(--text-primary))}
.vld-info span{font-size:12px;color:var(--text-muted)}
.vld-note{font-size:12px;color:var(--text-muted);line-height:1.5;margin:8px 0 0}
.vld-warn{color:#b45309;font-weight:600}
.vld-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.vld-g2 .form-group{margin-bottom:8px}
.vld-unit{display:flex;align-items:center;gap:6px}.vld-unit input{flex:1;min-width:0}.vld-unit span{color:var(--text-muted);font-size:13px;font-weight:600}
.vld-track{display:flex;align-items:flex-start;gap:10px;margin:2px 0 14px;padding:12px 14px;border-radius:12px;border:1px solid var(--border-color);background:var(--bg-secondary);cursor:pointer}
.vld-track input{margin-top:3px;width:16px;height:16px;accent-color:var(--accent);flex:none}
.vld-track-ic{flex:none;width:32px;height:32px;border-radius:9px;display:grid;place-items:center;background:rgba(99,102,241,.12);color:var(--accent)}
.vld-track-ic svg{width:17px;height:17px}
.vld-track b{display:block;font-size:13px;color:var(--text-heading,var(--text-primary))}
.vld-track small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.45;margin-top:2px}
.vld-track em{display:block;font-style:normal;font-size:11.5px;color:var(--accent);margin-top:4px;font-weight:600}
.vld-entry{margin-top:12px;padding:12px 14px 4px;border-radius:10px;border:1px dashed var(--accent);background:rgba(99,102,241,.05)}
.vld-entry-h{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;color:var(--accent);margin-bottom:8px}
.vld-entry-h svg{width:15px;height:15px}
.vld-rec{width:100%;border-collapse:collapse;font-size:12.5px}
.vld-rec th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:6px 6px}
.vld-rec td{padding:8px 6px;border-top:1px solid var(--border-color);vertical-align:top}
.vld-rec td small{display:block;color:var(--text-muted);font-size:11px}
.vld-rec input{width:100%;min-width:0}
.vld-dash{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:14px 18px;margin:0 0 20px;border-radius:14px;border:1px solid var(--border-color);background:var(--bg-card);border-left:4px solid #d97706}
.vld-dash.bad{border-left-color:#dc2626}
.vld-dash-ic{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(217,119,6,.14);color:#d97706}
.vld-dash.bad .vld-dash-ic{background:rgba(220,38,38,.12);color:#dc2626}
.vld-dash-ic svg{width:22px;height:22px}
.vld-dash-tx{flex:1;min-width:200px}
.vld-dash-tx b{display:block;font-size:14.5px;color:var(--text-heading,var(--text-primary))}
.vld-dash-tx span{font-size:12.5px;color:var(--text-muted)}
.vld-dash a{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--accent);text-decoration:none;white-space:nowrap}
.vld-dash a svg{width:15px;height:15px}
.product-card .vld-was{font-size:10px;color:var(--text-muted);text-decoration:line-through;margin-right:4px;font-weight:600}
.product-card .vld-tag{position:absolute;top:6px;left:6px;z-index:2;padding:1px 7px;border-radius:999px;background:#059669;color:#fff;font-size:9.5px;font-weight:800;letter-spacing:.02em}
@media(max-width:900px){.vld-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.vld-hide-sm{display:none}.vld-tabs{display:flex}.vld-tabs button{flex:1;justify-content:center;padding:8px 10px}.vld-kpi{padding:12px}.vld-kpi b{font-size:17px}.vld-g2{grid-template-columns:1fr}.vld-head-act{width:100%}.vld-head-act .btn{flex:1;justify-content:center}}`;
        (document.head || document.documentElement).appendChild(st);
    }
    /** Janela simples. onOk(body) devolve false para continuar aberta. */
    function dialog(o) {
        css();
        return new Promise(resolve => {
            const ov = document.createElement('div'); ov.className = 'modal-overlay active'; ov.id = o.id || '';
            ov.innerHTML = `<div class="modal" style="max-width:${o.width || 460}px"><div class="modal-header"><h3 style="display:flex;align-items:center;gap:8px">${o.icon ? `<span style="display:inline-flex;color:var(--accent)">${o.icon}</span>` : ''}${esc(o.title)}</h3><button class="modal-close" data-x aria-label="Fechar">${ic('x', 'times')}</button></div>
<div class="modal-body">${o.body}</div>
<div class="modal-footer">${o.extra || ''}<button class="btn btn-secondary" data-x>${esc(o.cancel || 'Cancelar')}</button><button class="btn ${o.danger ? 'btn-danger' : 'btn-primary'}" data-ok>${o.okIcon || ''} ${esc(o.ok || 'Salvar')}</button></div></div>`;
            document.body.appendChild(ov);
            const body = ov.querySelector('.modal-body');
            const close = v => { ov.remove(); resolve(v); };
            ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => close(null)));
            ov.addEventListener('click', e => { if (e.target === ov) close(null); });
            const ok = ov.querySelector('[data-ok]');
            ok.addEventListener('click', async () => {
                ok.disabled = true;
                try { const v = await o.onOk(body, ov); if (v === false) { ok.disabled = false; return; } close(v === undefined ? true : v); }
                catch (e) { ok.disabled = false; toast('error', 'Não deu certo: ' + (e && e.message || e)); }
            });
            if (o.onOpen) try { o.onOpen(body, ov); } catch (e) { }
        });
    }

    /* =================== Compras › receber: lote e validade de cada item =================== */
    function pedirLotes(compra, produtos, opts) {
        const items = (compra && compra.items) || [];
        const byId = id => (Array.isArray(produtos) ? produtos : []).find(p => p && p.id === id);
        const list = items.map((it, i) => ({ it, i, p: byId(it.productId) })).filter(x => x.p && x.p.trackExpiry === true);
        if (!list.length) return Promise.resolve(opts);
        const body = `<p class="vld-note" style="margin:0 0 12px">${list.length === 1 ? 'Este produto controla' : 'Estes produtos controlam'} a validade. Informe o lote e a data que estão na embalagem: a venda vai baixar primeiro o que vence antes, e o Estoque avisa quando estiver perto de vencer.</p>
<div style="overflow-x:auto"><table class="vld-rec"><thead><tr><th>Produto</th><th style="width:120px">Lote</th><th style="width:150px">Validade *</th></tr></thead><tbody>
${list.map(x => `<tr data-i="${x.i}"><td><b>${esc(x.it.productName || x.p.name)}</b><small>entra ${qf(x.it.unitsTotal || x.it.quantity)} un</small></td><td><input type="text" class="vld-lot" maxlength="40" placeholder="Opcional"></td><td><input type="date" class="vld-exp" min="${ymd(Date.now() - 365 * 864e5)}"></td></tr>`).join('')}
</tbody></table></div>`;
        return dialog({
            title: 'Lote e validade', icon: ic('calendar-clock', 'calendar'), body, width: 600, ok: 'Receber compra', okIcon: ic('check', 'check'), cancel: 'Voltar',
            onOk: async root => {
                const lotes = [];
                for (const tr of root.querySelectorAll('tr[data-i]')) {
                    const exp = tr.querySelector('.vld-exp').value, lot = tr.querySelector('.vld-lot').value.trim();
                    if (!exp) { toast('warning', 'Informe a validade de ' + tr.querySelector('b').textContent + '.'); tr.querySelector('.vld-exp').focus(); return false; }
                    lotes[Number(tr.dataset.i)] = { lot, expiry: exp };
                }
                const vencidos = lotes.filter(l => l && l.expiry < today()).length;
                if (vencidos && !confirm(`${vencidos === 1 ? 'Um item está' : vencidos + ' itens estão'} com a validade já vencida. Receber mesmo assim?`)) return false;
                return { ...(opts || {}), lotes };
            }
        });
    }
    async function lotesDaCompra(compra, lotes) {
        let n = 0;
        for (const [i, it] of ((compra && compra.items) || []).entries()) {
            const l = lotes && lotes[i]; if (!l || !it.productId) continue;
            await entrada(it.productId, Number(it.unitsTotal || it.quantity) || 0, { lot: l.lot, expiry: l.expiry, purchaseId: compra.id, purchaseNumber: compra.purchaseNumber || '', supplierName: compra.supplierName || '', unitCost: it.costPrice, productName: it.productName, origin: 'compra' });
            n++;
        }
        return n;
    }

    /* =================== Produtos: liga a validade e pede o lote na entrada =================== */
    function setupProdutos() {
        const modal = $('productModal'), promo = $('prodPromoPrice');
        if (modal && promo && !$('vldTrackBox')) {
            css();
            const box = document.createElement('label'); box.id = 'vldTrackBox'; box.className = 'vld-track';
            box.innerHTML = `<input type="checkbox" id="prodTrackExpiry"><span class="vld-track-ic">${ic('calendar-clock', 'calendar')}</span><span><b>Controlar validade e lote</b><small>Ao receber compras e dar entrada, o sistema pede o lote e a validade. A venda baixa primeiro o que vence antes e o Estoque avisa o que está perto de vencer.</small><em id="vldTrackInfo"></em></span>`;
            const row = promo.closest('.form-row') || promo.closest('.form-group');
            row.parentElement.insertBefore(box, row.nextSibling);
            const chk = $('prodTrackExpiry'), info = $('vldTrackInfo');
            const cur = () => { try { return typeof editingProductId !== 'undefined' && editingProductId ? (allProducts || []).find(x => x.id === editingProductId) : null; } catch (e) { return null; } };
            const oOpen = window.openProductModal;
            if (typeof oOpen === 'function') window.openProductModal = function () {
                const r = oOpen.apply(this, arguments);
                try {
                    const p = cur(); chk.checked = !!(p && p.trackExpiry === true); info.textContent = '';
                    if (p && p.trackExpiry === true) lotsOf(p.id).then(ls => { const a = ls.filter(alive).sort(fefoCmp); if (cur() !== p) return; info.textContent = a.length ? `${a.length} ${plural(a.length, 'lote', 'lotes')} no estoque · o próximo a vencer: ${a[0].lot ? 'lote ' + a[0].lot + ', ' : ''}${br(a[0].expiry)}` : 'Nenhum lote informado ainda.'; }).catch(() => { });
                } catch (e) { }
                return r;
            };
            // Grava junto com o cadastro (mesmo jeito do preco-atacado-v1.js)
            const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
            if (svc && !svc.__dpVld) {
                svc.__dpVld = true;
                ['create', 'update'].forEach(name => {
                    const orig = svc[name]; if (typeof orig !== 'function') return;
                    svc[name] = function (col, a, b) {
                        const data = name === 'create' ? a : b;
                        if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modal.classList.contains('active')) { data.trackExpiry = !!chk.checked; trackedAt = 0; }
                        return orig.apply(this, arguments);
                    };
                });
            }
        }
        // Entrada rápida de estoque: lote e validade
        const sum = $('stockEntrySummary');
        if ($('stockEntryModal') && sum && !$('vldEntryBox')) {
            css();
            const b = document.createElement('div'); b.id = 'vldEntryBox'; b.className = 'vld-entry'; b.hidden = true;
            b.innerHTML = `<div class="vld-entry-h">${ic('calendar-clock', 'calendar')} Lote e validade desta entrada</div><div class="vld-g2"><div class="form-group"><label class="form-label">Lote</label><input type="text" class="form-control" id="vldEntLot" maxlength="40" placeholder="Opcional"></div><div class="form-group"><label class="form-label">Validade *</label><input type="date" class="form-control" id="vldEntExp"></div></div>`;
            sum.insertAdjacentElement('afterend', b);
            let curId = null;
            const oOpenSE = window.openStockEntry;
            if (typeof oOpenSE === 'function') window.openStockEntry = function (pid) {
                curId = pid; const r = oOpenSE.apply(this, arguments);
                try { const p = (allProducts || []).find(x => x.id === pid); b.hidden = !(p && p.trackExpiry === true); $('vldEntLot').value = ''; $('vldEntExp').value = ''; } catch (e) { }
                return r;
            };
            const oConf = window.confirmStockEntry;
            if (typeof oConf === 'function') window.confirmStockEntry = function () {
                if (!b.hidden && curId) {
                    const exp = $('vldEntExp').value;
                    if (!exp) { toast('warning', 'Informe a validade deste lote.'); $('vldEntExp').focus(); return; }
                    proximaEntrada(curId, { lot: $('vldEntLot').value.trim(), expiry: exp, origin: 'entrada' });
                }
                return oConf.apply(this, arguments);
            };
        }
    }

    /* =================== Estoque: ajuste com lote + aba Validades =================== */
    function hookAjuste() {
        const m = $('modalAjuste'), prev = $('ajustePreview');
        if (!m || !prev || $('vldAdjBox')) return;
        const b = document.createElement('div'); b.id = 'vldAdjBox'; b.className = 'vld-entry'; b.hidden = true;
        b.innerHTML = `<div class="vld-entry-h">${ic('calendar-clock', 'calendar')} Lote e validade do que está entrando</div><div class="vld-g2"><div class="form-group"><label class="form-label">Lote</label><input type="text" class="form-input" id="vldAdjLot" maxlength="40" placeholder="Opcional"></div><div class="form-group"><label class="form-label">Validade *</label><input type="date" class="form-input" id="vldAdjExp"></div></div>`;
        prev.insertAdjacentElement('afterend', b);
        const sync = async () => {
            const pid = $('ajusteProduto') && $('ajusteProduto').value, t = $('ajusteTipo') && $('ajusteTipo').value;
            if (!pid || (t !== 'entry' && t !== 'adjust')) { b.hidden = true; return; }
            const set = await trackedIds(); b.hidden = !(set && set.has(pid));
        };
        m.addEventListener('change', e => { if (e.target && (e.target.id === 'ajusteProduto' || e.target.id === 'ajusteTipo')) sync(); });
        new MutationObserver(() => { if (m.classList.contains('active')) { $('vldAdjLot').value = ''; $('vldAdjExp').value = ''; sync(); } }).observe(m, { attributes: true, attributeFilter: ['class'] });
        // Antes do "Confirmar ajuste" da página (fase de captura): confere a validade e deixa o lote pronto para a entrada
        m.addEventListener('click', e => {
            const btn = e.target.closest && e.target.closest('.modal-footer .btn-primary'); if (!btn || b.hidden) return;
            const pid = $('ajusteProduto').value, exp = $('vldAdjExp').value;
            if (!exp) { e.preventDefault(); e.stopPropagation(); toast('warning', 'Informe a validade do lote que está entrando.'); $('vldAdjExp').focus(); return; }
            proximaEntrada(pid, { lot: $('vldAdjLot').value.trim(), expiry: exp, origin: 'ajuste' });
        }, true);
    }
    let panelState = { f: '', q: '' }, lastR = null;
    function setupEstoque() {
        const pc = document.querySelector('.page-content');
        if (!pc || !$('modalAjuste') || !$('stockFilterStatus') || $('vldTabs')) return;
        css();
        const tabs = document.createElement('div'); tabs.id = 'vldTabs'; tabs.className = 'vld-tabs'; tabs.setAttribute('role', 'tablist');
        tabs.innerHTML = `<button type="button" role="tab" data-t="estoque" class="on">${ic('boxes', 'boxes-stacked')}<span>Estoque</span></button><button type="button" role="tab" data-t="validades">${ic('calendar-clock', 'calendar')}<span>Validades</span><b class="vld-cnt" id="vldCnt" hidden></b></button>`;
        const panel = document.createElement('div'); panel.id = 'vldPanel'; panel.hidden = true;
        pc.insertBefore(tabs, pc.firstChild); pc.appendChild(panel);
        const show = t => {
            [...pc.children].forEach(el => { if (el === tabs) return; if (el === panel) el.hidden = t !== 'validades'; else el.classList.toggle('vld-hide', t === 'validades'); });
            tabs.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.t === t));
            try { history.replaceState(null, '', location.pathname + location.search + (t === 'validades' ? '#validades' : '')); } catch (e) { }
            if (t === 'validades') renderPanel(true);
        };
        tabs.addEventListener('click', e => { const x = e.target.closest('button[data-t]'); if (x) show(x.dataset.t); });
        panel.addEventListener('click', onPanelClick);
        panel.addEventListener('input', e => { if (e.target.id === 'vldQ') { panelState.q = e.target.value; const pos = e.target.selectionStart; drawPanel(); const n = $('vldQ'); if (n) { n.focus(); try { n.setSelectionRange(pos, pos); } catch (_) { } } } });
        if (location.hash === '#validades') show('validades');
        else resumo().then(R => { lastR = R; badge(R); }).catch(() => { });
        hookAjuste();
    }
    function badge(R) { const c = $('vldCnt'); if (!c || !R) return; const n = R.k.vencido.n + R.k.d7.n; c.hidden = !n; c.textContent = n; }
    async function renderPanel(fresh) {
        const panel = $('vldPanel'); if (!panel) return;
        if (fresh || !lastR) {
            panel.innerHTML = `<div class="vld-empty">${ic('loader-circle', 'spinner')}Carregando as validades…</div>`;
            try { await loadCfg(); lastR = await resumo(); await limparPromos(lastR.prods); if (MENSAL && MENSAL.promoAuto) { const n = await MENSAL.promoAuto(lastR, true); if (n) lastR = await resumo(); } }
            catch (e) { panel.innerHTML = `<div class="vld-empty">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
        }
        badge(lastR); drawPanel();
    }
    function drawPanel() {
        const panel = $('vldPanel'), R = lastR; if (!panel || !R) return;
        const k = R.k, d30 = alertDays();
        if (!R.prods.length) {
            panel.innerHTML = `<div class="card"><div class="vld-empty">${ic('calendar-clock', 'calendar')}<b style="color:var(--text-primary)">Nenhum produto controla a validade ainda.</b><br>Em Produtos › Editar, marque <b>Controlar validade e lote</b> nos itens que vencem (iogurte, frios, bebidas, ração, remédio).<br>Depois, ao receber a compra ou dar entrada, informe o lote e a validade. O aviso aparece aqui e no Início.</div></div>`;
            return;
        }
        const nq = String(panelState.q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
        const match = r => !nq || [r.product.name, r.product.code, r.lot, r.supplierName].join(' ').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(nq);
        const rows = R.rows.filter(r => (!panelState.f || r.bucket === panelState.f || (panelState.f === 'ok' && r.bucket === 'sem')) && match(r));
        const kpi = (key, cls, label) => `<button type="button" class="vld-kpi ${cls}${panelState.f === key ? ' sel' : ''}" data-f="${key}"><small>${label}</small><b>${k[key].n} ${plural(k[key].n, 'lote', 'lotes')}</b><span>${qf(k[key].qty)} un · ${money(k[key].risk)}</span></button>`;
        const promoTag = p => promoOn(p) ? `<span class="vld-promo">${ic('badge-percent', 'tag')}Promoção ${money(p.promoPrice)}${p.promoUntil ? ' até ' + br(p.promoUntil).slice(0, 5) : ''}</span>` : '';
        panel.innerHTML = `<div class="vld-head"><div><h3>Validades e lotes</h3><p>A venda sempre baixa primeiro o lote que vence antes. Lote vencido fica aqui até você dar baixa como perda.</p></div>
<div class="vld-head-act"><button type="button" class="btn btn-outline vld-btn" data-a="informar">${ic('package-plus', 'plus')} Informar lote</button><button type="button" class="btn btn-outline vld-btn" data-a="cfg">${ic('settings', 'gear')} Avisos</button></div></div>
<div class="vld-kpis">${kpi('vencido', 'bad', 'Vencidos')}${kpi('d7', 'warn', 'Vencem em até 7 dias')}${kpi('d30', 'info', `Vencem em até ${d30} dias`)}<div class="vld-kpi money"><small>Custo em risco</small><b>${money(R.risk)}</b><span>vencidos e até ${d30} dias</span></div></div>
<div class="card"><div class="vld-bar"><div class="vld-chips">${[['', 'Todos'], ['vencido', 'Vencidos'], ['d7', 'Até 7 dias'], ['d30', `Até ${d30} dias`], ['ok', 'Mais tarde']].map(([f, l]) => `<button type="button" data-f="${f}" class="${panelState.f === f ? 'on' : ''}">${l}</button>`).join('')}</div>
<div class="toolbar-search"><input type="text" id="vldQ" placeholder="Buscar produto ou lote" value="${esc(panelState.q)}" autocomplete="off"><i class="fas fa-search"></i></div></div>
<div class="table-container"><table class="data-table vld-t"><thead><tr><th>Produto</th><th>Lote</th><th>Validade</th><th class="r">Qtd.</th><th class="r vld-hide-sm">Custo</th><th></th></tr></thead><tbody>
${rows.length ? rows.map(r => `<tr><td><b>${esc(r.product.name)}</b>${r.product.code ? `<small>${esc(r.product.code)}</small>` : ''}${promoTag(r.product)}</td>
<td>${r.lot ? esc(r.lot) : '<span style="color:var(--text-muted)">—</span>'}<small>${r.purchaseNumber ? 'Compra #' + esc(r.purchaseNumber) : esc({ entrada: 'Entrada', ajuste: 'Ajuste', inventario: 'Estoque que já tinha', manual: 'Informado' }[r.origin] || '')}${r.supplierName ? ' · ' + esc(r.supplierName) : ''}</small></td>
<td><span class="vld-pill ${r.bucket}">${esc(rel(r.days))}</span><small>${br(r.expiry)}</small></td>
<td class="r"><b>${qf(r.qty)}</b> ${esc(String(r.product.unit || 'un').toLowerCase())}</td>
<td class="r vld-hide-sm">${money(r.risk)}</td>
<td><div class="vld-act">${r.bucket === 'vencido' ? '' : `<button type="button" class="btn-icon" title="Pôr em promoção" data-a="promo" data-id="${esc(r.id)}">${ic('badge-percent', 'tag')}</button>`}<button type="button" class="btn-icon" title="Corrigir lote ou validade" data-a="edit" data-id="${esc(r.id)}">${ic('pencil', 'pen')}</button><button type="button" class="btn-icon btn-danger" title="Baixar como perda" data-a="perda" data-id="${esc(r.id)}">${ic('trash-2', 'trash')}</button></div></td></tr>`).join('')
            : `<tr><td colspan="6"><div class="vld-empty">${R.rows.length ? 'Nada neste filtro.' : 'Nenhum lote com validade informada ainda.'}</div></td></tr>`}
</tbody></table></div></div>
${R.semLote.length ? `<div class="card" style="margin-top:16px"><h4 style="margin:0 0 4px;font-size:15px;display:flex;align-items:center;gap:8px">${ic('circle-help', 'circle-question')} Estoque sem validade informada</h4><p class="vld-note" style="margin:0 0 6px">Estes produtos controlam a validade, mas parte do estoque entrou sem lote (antes de ligar o controle ou pelo cadastro). Informe a validade do que está na prateleira.</p>
${R.semLote.map(s => `<div class="vld-free"><b>${esc(s.product.name)}</b><span>${qf(s.qty)} un sem lote</span><button type="button" class="btn btn-sm btn-outline vld-btn" data-a="informar" data-pid="${esc(s.product.id)}">${ic('calendar-check', 'calendar-check')} Informar</button></div>`).join('')}</div>` : ''}`;
    }
    const rowById = id => lastR && lastR.rows.find(r => r.id === id);
    async function onPanelClick(e) {
        const f = e.target.closest('[data-f]');
        if (f && f.closest('#vldPanel')) { const v = f.dataset.f; panelState.f = panelState.f === v && f.classList.contains('vld-kpi') ? '' : v; drawPanel(); return; }
        const b = e.target.closest('[data-a]'); if (!b) return;
        const a = b.dataset.a;
        if (a === 'cfg') return cfgDialog();
        if (a === 'informar') return informarDialog(b.dataset.pid || '');
        const r = rowById(b.dataset.id); if (!r) return;
        if (a === 'perda') return perdaDialog(r);
        if (a === 'promo') return promoDialog(r);
        if (a === 'edit') return editDialog(r);
    }
    async function refreshAfter() { if ($('vldPanel')) await renderPanel(true); }

    async function perdaDialog(r) {
        const p = r.product, cost = Number(p.costPrice) || Number(r.unitCost) || 0;
        const ok = await dialog({
            title: 'Baixar como perda', icon: ic('trash-2', 'trash'), danger: true, ok: 'Baixar do estoque', okIcon: ic('check', 'check'),
            body: `<div class="vld-info"><b>${esc(p.name)}</b><span>${r.lot ? 'Lote ' + esc(r.lot) + ' · ' : ''}${esc(rel(r.days))} (${br(r.expiry)}) · ${qf(r.qty)} un</span></div>
<div class="vld-g2"><div class="form-group"><label>Quantidade</label><input type="text" id="vldPq" inputmode="decimal" value="${qf(r.qty)}"></div>
<div class="form-group"><label>Motivo</label><select id="vldPm"><option value="venceu">Venceu</option><option value="estragou">Estragou</option><option value="caiu">Avaria / embalagem danificada</option></select></div></div>
<p class="vld-note">Sai do estoque e aparece em Movimentações. Custo da perda: <b id="vldPc">${money(r.qty * cost)}</b>.${MENSAL && MENSAL.perdaNota ? ' ' + MENSAL.perdaNota() : ''}</p>`,
            onOpen: root => { const q = root.querySelector('#vldPq'); q.addEventListener('input', () => { root.querySelector('#vldPc').textContent = money(Math.min(num(q.value), r.qty) * cost); }); setTimeout(() => q.select(), 30); },
            onOk: async root => {
                const qty = n3(num(root.querySelector('#vldPq').value)), motivo = root.querySelector('#vldPm').value;
                if (!(qty > 0)) { toast('warning', 'Informe a quantidade.'); return false; }
                if (qty > r.qty + 0.0005) { toast('warning', `Este lote tem ${qf(r.qty)} un.`); return false; }
                const label = { venceu: 'Venceu', estragou: 'Estragou', caiu: 'Avaria' }[motivo] || 'Perda';
                const nota = `${r.lot ? 'Lote ' + r.lot + ' · ' : ''}validade ${br(r.expiry)}`;
                preferir(p.id, { lotId: r.id });
                if (MENSAL && MENSAL.perda) await MENSAL.perda(p, r, qty, motivo, nota, cost);
                else await StockService.exit(p.id, qty, `Perda por validade (${label}) · ${nota}`, 'loss', r.id);
                toast('success', `Baixa feita: ${qf(qty)} un de ${p.name} (${money(qty * cost)}).`);
                return true;
            }
        });
        if (ok) refreshAfter();
    }
    async function promoDialog(r) {
        const p = r.product, sale = Number(p.salePrice) || 0, cost = Number(p.costPrice) || 0;
        if (!(sale > 0)) { toast('warning', 'Este produto está sem preço de venda.'); return; }
        if (r.days !== null && r.days < 0) { toast('warning', 'Lote vencido não pode ser vendido, nem em promoção. Dê baixa como perda.'); return; }
        const on = promoOn(p), pct0 = Number(cfg.promoAuto && cfg.promoAuto.pct) || 20;
        const price0 = on ? Number(p.promoPrice) : r2(sale * (1 - pct0 / 100));
        const until0 = on && isYmd(p.promoUntil) ? p.promoUntil : (r.expiry && r.expiry >= today() ? r.expiry : ymd(Date.now() + 7 * 864e5));
        const ok = await dialog({
            title: on ? 'Promoção do produto' : 'Pôr em promoção', icon: ic('badge-percent', 'tag'), ok: on ? 'Salvar promoção' : 'Pôr em promoção', okIcon: ic('check', 'check'),
            extra: on ? `<button class="btn btn-outline" data-off style="margin-right:auto">${ic('x', 'times')} Tirar da promoção</button>` : '',
            body: `<div class="vld-info"><b>${esc(p.name)}</b><span>Preço normal ${money(sale)}${cost ? ' · custo ' + money(cost) : ''}${r.expiry ? ' · lote ' + (r.lot ? esc(r.lot) + ' ' : '') + rel(r.days) : ''}</span></div>
<div class="vld-g2"><div class="form-group"><label>Desconto</label><div class="vld-unit"><input type="text" id="vldDp" inputmode="decimal" value="${n2in(r2((1 - price0 / sale) * 100)).replace(/,00$/, '')}"><span>%</span></div></div>
<div class="form-group"><label>Preço na promoção</label><div class="vld-unit"><span>R$</span><input type="text" id="vldPp" inputmode="decimal" value="${n2in(price0)}"></div></div></div>
<div class="form-group"><label>Vale até</label><input type="date" id="vldPu" value="${until0}" min="${today()}"></div>
<p class="vld-note" id="vldPn"></p>`,
            onOpen: (root, ov) => {
                const dp = root.querySelector('#vldDp'), pp = root.querySelector('#vldPp'), pn = root.querySelector('#vldPn');
                const note = () => { const v = num(pp.value); pn.innerHTML = `O PDV, os orçamentos e as mesas cobram ${money(v)} até a data escolhida. A promoção acaba sozinha quando este lote acabar.${cost && v < cost ? ` <span class="vld-warn">Abaixo do custo (${money(cost)}): vale a pena para não perder o produto, mas confira.</span>` : ''}`; };
                dp.addEventListener('input', () => { pp.value = n2in(r2(sale * (1 - Math.min(95, num(dp.value)) / 100))); note(); });
                pp.addEventListener('input', () => { const v = num(pp.value); dp.value = v > 0 ? String(r2((1 - v / sale) * 100)).replace('.', ',') : ''; note(); });
                note();
                const off = ov.querySelector('[data-off]');
                if (off) off.addEventListener('click', async () => { off.disabled = true; try { await db.collection('products').doc(p.id).update({ promoPrice: null, promoUntil: null, promoReason: '', promoLotId: '', promoAuto: false }); toast('success', 'O preço voltou ao normal.'); ov.remove(); refreshAfter(); } catch (e) { off.disabled = false; toast('error', e.message); } });
            },
            onOk: async root => {
                const v = r2(num(root.querySelector('#vldPp').value)), until = root.querySelector('#vldPu').value;
                if (!(v > 0) || v >= sale) { toast('warning', `O preço da promoção precisa ser menor que ${money(sale)}.`); return false; }
                if (!isYmd(until) || until < today()) { toast('warning', 'Escolha até quando vale a promoção.'); return false; }
                await db.collection('products').doc(p.id).update({ promoPrice: v, promoUntil: until, promoReason: 'validade', promoLotId: r.id, promoAuto: false, updatedAt: ts() });
                toast('success', `${p.name} em promoção por ${money(v)} até ${br(until)}.`);
                return true;
            }
        });
        if (ok) refreshAfter();
    }
    async function editDialog(r) {
        const ok = await dialog({
            title: 'Corrigir lote', icon: ic('pencil', 'pen'), ok: 'Salvar', okIcon: ic('check', 'check'),
            extra: `<button class="btn btn-outline" data-del style="margin-right:auto">${ic('trash-2', 'trash')} Tirar este lote</button>`,
            body: `<div class="vld-info"><b>${esc(r.product.name)}</b><span>${qf(r.qty)} un neste lote</span></div>
<div class="vld-g2"><div class="form-group"><label>Lote</label><input type="text" id="vldEl" maxlength="40" value="${esc(r.lot || '')}" placeholder="Opcional"></div><div class="form-group"><label>Validade</label><input type="date" id="vldEe" value="${esc(r.expiry || '')}"></div></div>
<p class="vld-note">Use para corrigir um erro de digitação. O estoque não muda. "Tirar este lote" deixa a quantidade como estoque sem validade informada.</p>`,
            onOpen: (root, ov) => { const del = ov.querySelector('[data-del]'); del.addEventListener('click', async () => { if (!confirm('Tirar este lote da lista? O estoque não muda.')) return; del.disabled = true; try { await db.collection(LOTS).doc(r.id).update({ deleted: true, deletedAt: ts(), deletedBy: uname() }); ov.remove(); toast('success', 'Lote retirado.'); refreshAfter(); } catch (e) { del.disabled = false; toast('error', e.message); } }); },
            onOk: async root => {
                const exp = root.querySelector('#vldEe').value; if (!isYmd(exp)) { toast('warning', 'Informe a validade.'); return false; }
                await db.collection(LOTS).doc(r.id).update({ lot: root.querySelector('#vldEl').value.trim().slice(0, 40), expiry: exp, updatedAt: ts() });
                return true;
            }
        });
        if (ok) refreshAfter();
    }
    async function informarDialog(pid) {
        const R = lastR || await resumo();
        const opts = R.semLote.length ? R.semLote : R.prods.map(p => ({ product: p, qty: 0 }));
        if (!opts.length) { toast('info', 'Nenhum produto controla a validade ainda.'); return; }
        const first = opts.find(s => s.product.id === pid) || opts[0];
        const ok = await dialog({
            title: 'Informar lote do estoque', icon: ic('package-plus', 'plus'), ok: 'Salvar lote', okIcon: ic('check', 'check'),
            body: `<p class="vld-note" style="margin:0 0 12px">Para o que já está na prateleira e entrou sem lote. O estoque não muda: só passa a ter validade.</p>
<div class="form-group"><label>Produto</label><select id="vldIp">${opts.map(s => `<option value="${esc(s.product.id)}" ${s === first ? 'selected' : ''}>${esc(s.product.name)}${s.qty ? ` (${qf(s.qty)} un sem lote)` : ''}</option>`).join('')}</select></div>
<div class="vld-g2"><div class="form-group"><label>Lote</label><input type="text" id="vldIl" maxlength="40" placeholder="Opcional"></div><div class="form-group"><label>Validade *</label><input type="date" id="vldIe"></div></div>
<div class="form-group"><label>Quantidade</label><input type="text" id="vldIq" inputmode="decimal" value="${first.qty ? qf(first.qty) : ''}"></div>`,
            onOpen: root => { const s = root.querySelector('#vldIp'); s.addEventListener('change', () => { const o = opts.find(x => x.product.id === s.value); root.querySelector('#vldIq').value = o && o.qty ? qf(o.qty) : ''; }); },
            onOk: async root => {
                const id = root.querySelector('#vldIp').value, o = opts.find(x => x.product.id === id), qty = n3(num(root.querySelector('#vldIq').value)), exp = root.querySelector('#vldIe').value;
                if (!isYmd(exp)) { toast('warning', 'Informe a validade.'); root.querySelector('#vldIe').focus(); return false; }
                if (!(qty > 0)) { toast('warning', 'Informe a quantidade.'); return false; }
                const stock = Math.max(0, n3(o && o.product.currentStock)), free = o && o.qty ? o.qty : stock;
                if (qty > free + 0.0005 && !confirm(`O estoque sem lote deste produto é ${qf(free)} un. Informar ${qf(qty)} mesmo assim?`)) return false;
                await entrada(id, qty, { lot: root.querySelector('#vldIl').value.trim(), expiry: exp, product: o && o.product, origin: 'inventario' });
                toast('success', 'Lote informado.');
                return true;
            }
        });
        if (ok) refreshAfter();
    }
    async function cfgDialog() {
        await loadCfg();
        const ok = await dialog({
            title: 'Avisos de validade', icon: ic('settings', 'gear'), ok: 'Salvar', okIcon: ic('check', 'check'), width: 500,
            body: `<div class="form-group"><label>Avisar com antecedência de</label><select id="vldCa">${[15, 30, 45, 60, 90].map(d => `<option value="${d}" ${alertDays() === d ? 'selected' : ''}>${d} dias</option>`).join('')}</select></div>
<p class="vld-note" style="margin-top:0">Os lotes que vencem dentro deste prazo aparecem no Início e na aba Validades. Os que vencem em até 7 dias ficam em destaque.</p>${MENSAL && MENSAL.cfgHtml ? MENSAL.cfgHtml(cfg) : ''}`,
            onOk: async root => {
                const next = { alertDays: Number(root.querySelector('#vldCa').value) || 30 };
                if (MENSAL && MENSAL.cfgRead) { const pa = MENSAL.cfgRead(root); if (pa === false) return false; next.promoAuto = pa; }
                await saveCfg(next); toast('success', 'Avisos salvos.'); return true;
            }
        });
        if (ok) refreshAfter();
    }

    /* =================== Início: cartão de alerta =================== */
    async function setupDash() {
        const grid = $('statsGrid'); if (!grid || $('vldDash')) return;
        let prods = []; try { prods = await loadTrackedProducts(); } catch (e) { return; }
        if (!prods.length) return;
        await loadCfg();
        let R; try { R = await resumo(prods); } catch (e) { return; }
        try { await limparPromos(R.prods); } catch (e) { }
        if (MENSAL && MENSAL.promoAuto) { try { await MENSAL.promoAuto(R, false); } catch (e) { } }
        const k = R.k; if (!k.vencido.n && !k.d7.n && !k.d30.n) return;
        css();
        const el = document.createElement('div'); el.id = 'vldDash'; el.className = 'vld-dash' + (k.vencido.n ? ' bad' : '');
        const parts = [k.vencido.n ? `<b style="display:inline;color:#dc2626">${k.vencido.n} ${plural(k.vencido.n, 'lote vencido', 'lotes vencidos')}</b>` : '', k.d7.n ? `${k.d7.n} ${plural(k.d7.n, 'vence', 'vencem')} em até 7 dias` : '', k.d30.n ? `${k.d30.n} em até ${alertDays()} dias` : ''].filter(Boolean);
        el.innerHTML = `<span class="vld-dash-ic">${ic(k.vencido.n ? 'calendar-x' : 'calendar-clock', 'calendar')}</span><div class="vld-dash-tx"><b>Validades</b><span>${parts.join(' · ')} · custo em risco ${money(R.risk)}</span></div><a href="estoque.html#validades">Ver validades ${ic('arrow-right', 'arrow-right')}</a>`;
        grid.insertAdjacentElement('afterend', el);
    }

    /* =================== PDV: preço da promoção e aviso de lote vencido =================== */
    let pdvLots = null; const warned = {};
    function pdvCacheAfter(pid, used) { if (!pdvLots || !used || !used.length) return; used.forEach(u => { const l = (pdvLots[pid] || []).find(x => x.id === u.lot.id); if (l) l.qty = u.left; }); }
    function pdvList() { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } }
    async function loadPdvLots() {
        if (!pdvList().some(p => p && p.trackExpiry === true)) return;
        try { const ls = await loadActiveLots(); pdvLots = {}; ls.forEach(l => (pdvLots[l.productId] = pdvLots[l.productId] || []).push(l)); } catch (e) { }
    }
    function avisoVencido(product) {
        if (!product || product.trackExpiry !== true || !pdvLots || warned[product.id]) return;
        const ls = (pdvLots[product.id] || []).filter(alive), t = today();
        const old = ls.filter(l => l.expiry && l.expiry < t).sort(fefoCmp); if (!old.length) return;
        warned[product.id] = 1;
        const good = ls.some(l => !l.expiry || l.expiry >= t);
        const q = old.reduce((s, l) => s + Number(l.qty || 0), 0);
        toast('warning', `${product.name}: ${qf(q)} un ${old[0].lot ? 'do lote ' + old[0].lot + ' ' : ''}venceram em ${br(old[0].expiry)}. ${good ? 'Venda do lote novo e tire o vencido da prateleira.' : 'Confira a data na embalagem antes de vender.'}`);
    }
    function decoratePdv() {
        const grid = $('productsGrid'); if (!grid) return;
        const promo = pdvList().filter(promoOn); if (!promo.length) return;
        const cards = [...grid.querySelectorAll('.product-card')];
        for (const p of promo) {
            const c = cards.find(x => (x.getAttribute('onclick') || '').includes(`'${p.id}'`)); if (!c || c.querySelector('.vld-tag')) continue;
            if (getComputedStyle(c).position === 'static') c.style.position = 'relative';
            c.insertAdjacentHTML('afterbegin', '<span class="vld-tag">Promoção</span>');
            const pr = c.querySelector('.p-price'); if (pr) pr.insertAdjacentHTML('afterbegin', `<span class="vld-was">${money(p.salePrice)}</span>`);
        }
    }
    function setupPdv() {
        if (!$('productsGrid') || typeof window.addToCartWithPkg !== 'function' || window.addToCartWithPkg.__vld) return;
        css();
        const o = window.addToCartWithPkg;
        const w = function (product) { const r = o.apply(this, arguments); try { avisoVencido(product); } catch (e) { } return r; };
        w.__vld = true; window.addToCartWithPkg = w;
        const oRP = window.renderProducts;
        if (typeof oRP === 'function' && !oRP.__vld) { const rp = function () { const r = oRP.apply(this, arguments); try { decoratePdv(); } catch (e) { } return r; }; rp.__vld = true; window.renderProducts = rp; }
        // O PDV pode desenhar os produtos antes deste arquivo carregar: com promoção valendo, desenha de novo (preço certo no cartão)
        let n = 0; const t = setInterval(() => { n++; if (pdvList().length || n > 40) { clearInterval(t); loadPdvLots(); try { if (pdvList().some(promoOn) && typeof window.renderProducts === 'function') window.renderProducts(); else decoratePdv(); } catch (e) { } } }, 500);
    }

    window.DPValidade = { entrada, consumir, devolver, preferir, proximaEntrada, pedirLotes, lotesDaCompra, resumo, isTracked, promoOn, lotsOf, loadCfg, get cfg() { return cfg; } };



    /* =================== Início =================== */
    async function start() {
        wrapStock();
        try { setupProdutos(); } catch (e) { console.warn('validade (produtos):', e); }
        try { setupEstoque(); } catch (e) { console.warn('validade (estoque):', e); }
        try { setupPdv(); } catch (e) { console.warn('validade (PDV):', e); }
        try { await setupDash(); } catch (e) { console.warn('validade (início):', e); }
    }
    const boot = () => {
        wrapStock();
        let done = false;
        const go = () => { if (done) return; done = true; start(); };
        try { if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') { auth.onAuthStateChanged(u => { if (u) go(); }); return; } } catch (e) { }
        go();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
