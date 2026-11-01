/* DistribuiPro 35.20 · Mesas e comandas para bares, restaurantes e lanchonetes.
   - Configurações › Empresa: liga/desliga o módulo (só para quem é do segmento), quantidade de mesas e taxa de serviço.
     No demo, o segmento "Bar / restaurante / lanchonete" já vem com Mesas ligado.
   - Menu: o item "Mesas" aparece logo abaixo do PDV somente quando o módulo está ligado.
   - Página mesas.html: mapa de mesas (livre / ocupada / conta pedida), comandas avulsas, lançamento de itens,
     envio para a cozinha, pré-conta, transferir/juntar mesas, taxa de serviço, desconto, divisão por pessoa e
     fechamento com vários pagamentos. A conta fechada vira uma venda normal (SalesService): entra no caixa,
     baixa o estoque e aparece em Pedidos/Relatórios.
   Coleção: dining_tabs · Configuração: settings/general (demo: demo_general) mesasEnabled, mesasCount,
   mesasServicePct, mesasServiceDefault. Este arquivo é carregado em todas as páginas (para o menu).
   38.4 · Cupom e via da cozinha vêm do cozinha-print-v1.js (o mesmo do PDV); o produto com adicionais ou de categoria
   com vários sabores abre a escolha do adicionais-v1.js / sabores-v1.js e o item guarda addons[] e flavors[]. */
(function () {
    'use strict';
    if (typeof db === 'undefined') return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const COL = 'dining_tabs';
    const VER = (/[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || '') || [])[1] || '1';
    function ensureCss() { if (document.querySelector('link[href*="mesas-v1.css"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/mesas-v1.css?v=' + VER; document.head.appendChild(l); }
    const SEG_KEY = 'dp_demo_segment_v1';
    const ROLES = ['admin', 'manager', 'seller', 'cashier'];
    const C = window.DPCatalog;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/[R$\s]/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const hhmm = ms => ms ? new Date(Number(ms)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
    const dur = ms => { const m = Math.max(0, Math.floor((Date.now() - Number(ms || Date.now())) / 60000)); return m < 60 ? m + ' min' : Math.floor(m / 60) + 'h ' + String(m % 60).padStart(2, '0'); };
    const dayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const fmtQty = (q, u) => C ? C.fmtQty(q, u) : String(r2(q)).replace('.', ',');
    const isFrac = u => !!(C && C.isFrac && C.isFrac(u));
    const uid = () => { try { return auth.currentUser?.uid || ''; } catch (e) { return ''; } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch (e) { return 'Operador'; } };
    const PAY = { dinheiro: ['Dinheiro', 'fa-money-bill-wave', '#10b981'], pix: ['PIX', 'fa-qrcode', '#06b6d4'], debito: ['Débito', 'fa-credit-card', '#3b82f6'], credito: ['Crédito', 'fa-credit-card', '#8b5cf6'] };
    // 40.91 · Fiado só no fechamento da conta (Fechar mesa); o pagamento parcial continua só com as 4 formas acima
    const FIADO = ['Fiado', 'fa-handshake', '#f59e0b'];
    const payLbl = m => m === 'fiado' ? FIADO[0] : (PAY[m] ? PAY[m][0] : m);
    const brD = s => String(s || '').split('-').reverse().join('/');
    const fmtPhone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : String(v || ''); };
    const waPhone = v => { const d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) return d; return d.length === 10 || d.length === 11 ? '55' + d : d; };

    /* =================== CONFIGURAÇÃO =================== */
    function demoSeg() { try { const raw = sessionStorage.getItem(SEG_KEY) || localStorage.getItem(SEG_KEY); const s = raw ? JSON.parse(raw) : null; return s && typeof s === 'object' ? s : null; } catch (e) { return null; } }
    function demoRestaurant(d) {
        if (!db.__isLocalDemo) return false;
        if (d && (d.demoDataset === 'restaurant' || d.demoSegment === 'restaurante')) return true;
        if (d && d.demoDataset) return false;
        const s = demoSeg(); return !!s && (s.dataset === 'restaurant' || s.key === 'restaurante');
    }
    function normCfg(d) {
        d = d || {};
        const pctRaw = d.mesasServicePct;
        return {
            enabled: d.mesasEnabled === true || (d.mesasEnabled !== false && demoRestaurant(d)),
            count: Math.max(1, Math.min(300, Math.round(num(d.mesasCount)) || 12)),
            servicePct: pctRaw === undefined || pctRaw === null || pctRaw === '' ? 10 : Math.max(0, Math.min(30, num(pctRaw))),
            serviceDefault: d.mesasServiceDefault !== false
        };
    }
    const cacheKey = () => 'dp_mesas_cfg_v1' + (db.__isLocalDemo ? ':' + ((demoSeg() || {}).key || 'general') : '');
    function readCache() { try { const c = JSON.parse(localStorage.getItem(cacheKey()) || 'null'); return c && typeof c === 'object' ? c : null; } catch (e) { return null; } }
    function writeCache(c) { try { localStorage.setItem(cacheKey(), JSON.stringify(c)); } catch (e) { } }
    let cfg = readCache() || normCfg({});
    async function loadCfg() {
        try { const d = await db.collection('settings').doc(DOC).get(); cfg = normCfg(d.exists ? (d.data() || {}) : {}); writeCache(cfg); } catch (e) { console.warn('mesas: configuração', e.message); }
        return cfg;
    }
    async function saveCfg(patch) {
        await db.collection('settings').doc(DOC).set(patch, { merge: true });
        await loadCfg(); syncMenu();
        return cfg;
    }
    window.DPMesas = { loadCfg, saveCfg, get cfg() { return cfg; } };

    /* =================== MENU =================== */
    const isPage = !!$('mesRoot');
    function role() { try { return localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } }
    function syncMenu() {
        const menu = document.querySelector('.sidebar-menu'); if (!menu) return;
        let link = menu.querySelector('a.menu-item[data-page="mesas"]');
        const r = role(), allowed = !r || ROLES.includes(r);
        const modOk = !window.DPModules || DPModules.has('mesas'); // 35.59 · módulo no Mensal
        if (cfg.enabled && allowed && modOk) {
            if (!link) {
                const pdv = menu.querySelector('a.menu-item[data-page="pdv"]') || menu.querySelector('a.menu-item[href="pdv.html"]');
                link = document.createElement('a'); link.href = 'mesas.html'; link.className = 'menu-item'; link.dataset.page = 'mesas';
                link.innerHTML = '<i class="fas fa-utensils"></i><span class="menu-text">Mesas</span>';
                if (pdv) pdv.insertAdjacentElement('afterend', link); else menu.appendChild(link);
            }
            if (isPage) { menu.querySelectorAll('.menu-item.active').forEach(a => { if (a !== link) a.classList.remove('active'); }); link.classList.add('active'); }
        } else if (link) link.remove();
    }
    syncMenu();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncMenu);
    try { auth.onAuthStateChanged(u => { if (u) loadCfg().then(syncMenu); }); } catch (e) { }
    document.addEventListener('dp:modules', syncMenu);

    /* =================== CONFIGURAÇÕES › EMPRESA =================== */
    function setupConfig() {
        const host = $('tabEmpresa'); if (!host || $('mesCfgCard')) return;
        ensureCss();
        const card = document.createElement('div'); card.className = 'card mes-cfg'; card.id = 'mesCfgCard';
        card.innerHTML = `<div class="mes-cfg-h"><div class="ico"><i class="fas fa-utensils"></i></div><div><h3>Seu negócio é bar, restaurante ou lanchonete?</h3>
<p>Ligue para aparecer a aba <b>Mesas</b> no menu: abrir mesas e comandas, lançar o pedido de cada mesa, mandar para a cozinha, imprimir a pré-conta e fechar a conta com taxa de serviço e divisão por pessoa. A conta fechada vira uma venda normal: entra no caixa, baixa o estoque e aparece nos relatórios.</p></div>
<label class="mes-sw" title="Ligar ou desligar Mesas"><input type="checkbox" id="mesCfgOn"><span></span></label></div>
<div class="mes-cfg-b" id="mesCfgBody">
<label>Quantidade de mesas<input type="number" min="1" max="300" class="form-input" id="mesCfgCount"></label>
<label>Taxa de serviço (%)<input type="text" inputmode="decimal" class="form-input" id="mesCfgPct" placeholder="10"></label>
<label class="chk"><input type="checkbox" id="mesCfgSvc"> Já marcar a taxa de serviço na conta</label>
<div><button type="button" class="btn btn-primary" id="mesCfgSave"><i class="fas fa-check"></i> Salvar mesas</button><span class="mes-cfg-ok" id="mesCfgOk"></span></div></div>`;
        host.insertBefore(card, host.firstChild);
        const paint = () => {
            $('mesCfgOn').checked = cfg.enabled; $('mesCfgBody').style.display = cfg.enabled ? '' : 'none';
            $('mesCfgCount').value = cfg.count; $('mesCfgPct').value = String(cfg.servicePct).replace('.', ','); $('mesCfgSvc').checked = cfg.serviceDefault;
        };
        const ok = t => { const s = $('mesCfgOk'); s.textContent = t; setTimeout(() => { s.textContent = ''; }, 3000); };
        paint(); loadCfg().then(paint);
        $('mesCfgOn').addEventListener('change', async e => {
            const on = e.target.checked; $('mesCfgBody').style.display = on ? '' : 'none';
            try { await saveCfg({ mesasEnabled: on }); paint(); toast('success', on ? 'Mesas ligado: a aba "Mesas" já está no menu.' : 'Mesas desligado.'); }
            catch (err) { e.target.checked = !on; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        });
        $('mesCfgSave').addEventListener('click', async () => {
            const count = Math.round(num($('mesCfgCount').value)), pct = num($('mesCfgPct').value);
            if (!(count >= 1 && count <= 300)) { toast('warning', 'Informe de 1 a 300 mesas.'); return; }
            if (pct < 0 || pct > 30) { toast('warning', 'A taxa de serviço vai de 0 a 30%.'); return; }
            try { await saveCfg({ mesasEnabled: true, mesasCount: count, mesasServicePct: r2(pct), mesasServiceDefault: $('mesCfgSvc').checked }); paint(); ok('✓ Mesas salvas'); }
            catch (err) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupConfig); else setupConfig();

    if (!isPage) return;

    /* =================== PÁGINA MESAS =================== */
    let booted = false, tabs = [], products = [], cats = [], users = [], cash = null, fees = null;
    let panelStamp = 0, filter = 'all', search = '', openId = null, view = 'menu', catSel = '', prodSearch = '', closedToday = [], pollT = null;
    let chain = Promise.resolve();
    const tabOf = id => tabs.find(t => t.id === id);
    const isOpen = t => t && t.status === 'open' && t.deleted !== true;
    const priceOf = p => { const s = Number(p.salePrice || p.price || 0), pr = Number(p.promoPrice || 0); return pr > 0 && pr < s ? pr : s; };

    // Itens sem estoque (serviço/avulso) não baixam estoque e não travam a venda.
    function patchStock() {
        if (typeof StockService === 'undefined' || !StockService || StockService.__dpMesas || typeof StockService.exit !== 'function') return;
        StockService.__dpMesas = true;
        const orig = StockService.exit;
        StockService.exit = async function (productId) {
            if (!productId) return 0;
            const p = products.find(x => x.id === productId);
            if (p && (p.productType === 'service' || p.controlStock === false)) return Number(p.currentStock || 0);
            try { return await orig.apply(this, arguments); } catch (e) { if (/não encontrado/i.test(e && e.message || '')) return 0; throw e; }
        };
    }

    function totals(t) {
        const items = (t && t.items) || [];
        const sub = r2(items.reduce((s, i) => s + Number(i.total || 0), 0));
        const svc = t && t.serviceOn ? r2(sub * cfg.servicePct / 100) : 0;
        const disc = Math.min(r2((t && t.discount) || 0), r2(sub + svc));
        return { sub, svc, disc, total: r2(sub + svc - disc), qty: items.reduce((s, i) => s + Number(i.quantity || 0), 0), pending: items.filter(i => !i.sent).length };
    }

    /* ---------- dados ---------- */
    async function getAll(col) { const s = await db.collection(col).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.deleted !== true); }
    async function loadCatalog() {
        const [p, c] = await Promise.all([getAll('products').catch(() => []), getAll('categories').catch(() => [])]);
        const cmap = {}; c.forEach(x => { cmap[x.id] = x.name || ''; });
        products = p.filter(x => x.status !== 'inactive' && x.active !== false).map(x => ({ ...x, _cat: cmap[x.categoryId] || x.category || 'Outros', _price: priceOf(x) })).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        const order = {}; c.forEach((x, i) => { order[x.name] = Number(x.order ?? i); });
        cats = [...new Set(products.map(x => x._cat))].sort((a, b) => (order[a] ?? 999) - (order[b] ?? 999) || a.localeCompare(b, 'pt-BR'));
    }
    async function loadUsers() { try { users = (await getAll('users')).filter(u => u.status !== 'inactive').map(u => ({ id: u.id, name: u.name || u.email || 'Usuário' })).sort((a, b) => a.name.localeCompare(b.name, 'pt-BR')); } catch (e) { users = []; } }
    async function loadCash() { try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); cash = s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { cash = null; } }
    async function loadFees() { try { fees = window.DPInstallmentFees ? await DPInstallmentFees.loadFees(true) : ((await db.collection('settings').doc(DOC).get()).data() || {}); } catch (e) { fees = {}; } }
    async function reloadTabs() {
        const s = await db.collection(COL).where('status', '==', 'open').get();
        tabs = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(isOpen);
    }
    async function loadClosedToday() {
        try { const s = await db.collection(COL).where('closedDay', '==', dayKey()).get(); closedToday = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => t.status === 'closed').sort((a, b) => Number(b.closedAt || 0) - Number(a.closedAt || 0)); }
        catch (e) { closedToday = []; }
        renderStats();
    }

    /* Grava sempre a partir do documento mais recente (vários garçons na mesma mesa) */
    function queue(fn) { const p = chain.then(fn, fn); chain = p.catch(() => { }); return p; }
    function mutate(id, fn) {
        return queue(async () => {
            const ref = db.collection(COL).doc(id), snap = await ref.get();
            if (!snap.exists) throw new Error('Mesa não encontrada');
            const cur = { id, ...snap.data() };
            if (cur.status !== 'open') throw new Error('Esta mesa já foi fechada em outro aparelho');
            const patch = fn(cur) || {};
            patch.updatedAtMs = Date.now(); patch.updatedAt = ts();
            await ref.set(patch, { merge: true });
            const next = { ...cur, ...patch }, i = tabs.findIndex(t => t.id === id);
            if (i >= 0) tabs[i] = next; else tabs.push(next);
            return next;
        });
    }
    // Aplica na tela na hora e grava em seguida
    async function itemsOp(id, op) {
        const t = tabOf(id); if (!t) return;
        t.items = op((t.items || []).map(i => ({ ...i }))); t.updatedAtMs = Date.now();
        renderPanel(); renderGrid();
        try { await mutate(id, cur => ({ items: op((cur.items || []).map(i => ({ ...i }))) })); }
        catch (e) { toast('error', e.message); await refresh(true); }
        renderPanel(); renderGrid();
    }

    /* ---------- estrutura ---------- */
    function shell() {
        $('mesRoot').innerHTML = `
<div class="mes-stats">
  <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-utensils"></i></div><div class="stat-value" id="mesStBusy">0</div><div class="stat-label">Mesas ocupadas</div><div class="mes-occ"><i id="mesOcc"></i></div></div>
  <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-receipt"></i></div><div class="stat-value" id="mesStOpen">R$ 0,00</div><div class="stat-label">Em aberto nas mesas</div></div>
  <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-users"></i></div><div class="stat-value" id="mesStPpl">0</div><div class="stat-label">Pessoas sentadas</div></div>
  <div class="stat-card" style="cursor:pointer" id="mesStDayCard"><div class="stat-icon green"><i class="fas fa-cash-register"></i></div><div class="stat-value" id="mesStDay">R$ 0,00</div><div class="stat-label" id="mesStDayLbl">Fechadas hoje</div></div>
</div>
<div class="card mes-bar">
  <div class="search-box"><i class="fas fa-search"></i><input id="mesSearch" type="text" placeholder="Buscar mesa, comanda, cliente ou garçom..." autocomplete="off"></div>
  <div class="mes-seg" id="mesFilter"><button data-f="all" class="on">Todas</button><button data-f="free">Livres<b id="mesCFree"></b></button><button data-f="busy">Ocupadas<b id="mesCBusy"></b></button><button data-f="bill">Conta pedida<b id="mesCBill"></b></button></div>
  <button class="btn btn-outline" id="mesAvulsa"><i class="fas fa-ticket"></i> Comanda avulsa</button>
  <button class="btn btn-outline" id="mesHist"><i class="fas fa-clock-rotate-left"></i> Fechadas hoje</button>
  <a class="btn btn-outline" href="configuracoes.html" title="Quantidade de mesas e taxa de serviço"><i class="fas fa-gear"></i></a>
</div>
<div class="mes-legend"><span><i style="background:var(--success)"></i>Livre</span><span><i style="background:var(--warning)"></i>Ocupada</span><span><i style="background:var(--danger)"></i>Conta pedida</span><span id="mesCashInfo"></span></div>
<div class="mes-grid" id="mesGrid"></div>`;
        $('mesSearch').addEventListener('input', e => { search = norm(e.target.value); renderGrid(); });
        $('mesFilter').addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b) return; filter = b.dataset.f; $('mesFilter').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderGrid(); });
        $('mesAvulsa').addEventListener('click', () => openTableDialog(null));
        $('mesHist').addEventListener('click', openHistory);
        $('mesStDayCard').addEventListener('click', openHistory);
        $('mesGrid').addEventListener('click', e => {
            const b = e.target.closest('[data-tab],[data-num],[data-new]'); if (!b) return;
            if (b.dataset.tab) openPanel(b.dataset.tab);
            else if (b.dataset.new) openTableDialog(null);
            else openTableDialog(Number(b.dataset.num));
        });
    }
    function renderStats() {
        if (!$('mesStBusy')) return;
        const open = tabs.filter(isOpen);
        $('mesStBusy').textContent = `${open.filter(t => t.tableNumber).length} de ${cfg.count}`;
        if ($('mesOcc')) $('mesOcc').style.width = Math.min(100, open.filter(t => t.tableNumber).length / Math.max(1, cfg.count) * 100) + '%';
        $('mesStOpen').textContent = money(open.reduce((s, t) => s + totals(t).total, 0));
        $('mesStPpl').textContent = open.reduce((s, t) => s + Number(t.people || 0), 0);
        $('mesStDay').textContent = money(closedToday.reduce((s, t) => s + Number(t.total || 0), 0));
        $('mesStDayLbl').textContent = `Fechadas hoje (${closedToday.length})`;
        const ci = $('mesCashInfo'); if (ci) ci.innerHTML = cash ? `<i style="background:var(--info)"></i>Caixa aberto · ${esc(cash.operatorName || '')}` : '<i style="background:var(--text-muted)"></i>Caixa fechado: <a href="caixa.html" style="color:var(--accent);font-weight:700">abrir caixa</a>';
    }
    // 35.60 · Mesa desenhada: tampo com o número e as cadeiras em volta (as ocupadas ficam coloridas).
    function seats(n, used) {
        const total = Math.max(4, Math.min(8, n > 4 ? (n > 6 ? 8 : 6) : 4)), on = Math.min(total, used);
        return `<span class="mes-seats s${total}">${Array.from({ length: total }, (_, i) => `<i class="${i < on ? 'on' : ''}"></i>`).join('')}</span>`;
    }
    const initials = s => String(s || '').trim().split(/\s+/).slice(0, 2).map(x => x[0] || '').join('').toUpperCase();
    function cardHtml(t, n) {
        if (!t) return `<button class="mes-card st-free" data-num="${n}"><span class="mes-tag">Livre</span><span class="mes-tbl">${seats(4, 0)}<span class="mes-top">${n}</span></span><div class="mes-free"><i class="fas fa-plus"></i> Abrir mesa</div></button>`;
        const tt = totals(t), st = t.billRequested ? 'st-bill' : 'st-busy', avulsa = !t.tableNumber, ppl = Number(t.people || 0);
        return `<button class="mes-card ${st}${avulsa ? ' is-avulsa' : ''}" data-tab="${esc(t.id)}"><span class="mes-tag">${t.billRequested ? '<i class="fas fa-receipt"></i> Conta' : (tt.pending ? '<i class="fas fa-bell"></i> ' + tt.pending + ' novo' + (tt.pending > 1 ? 's' : '') : 'Ocupada')}</span>
<span class="mes-tbl">${avulsa ? '<span class="mes-top tk"><i class="fas fa-ticket"></i></span>' : seats(Math.max(ppl, 4), ppl || 1) + `<span class="mes-top">${t.tableNumber}</span>`}</span>
${avulsa ? `<div class="mes-n">${esc(t.label || 'Comanda')}</div>` : ''}
<div class="mes-tot">${money(tt.total)}</div><div class="mes-meta"><span><i class="fas fa-clock"></i>${dur(t.openedAt)}</span><span><i class="fas fa-user-group"></i>${ppl || '—'}</span></div>
<div class="mes-w">${t.waiterName ? `<span class="mes-av">${esc(initials(t.waiterName))}</span>` : ''}${esc([t.waiterName, t.customerName].filter(Boolean).join(' · ') || 'Aberta às ' + hhmm(t.openedAt))}</div></button>`;
    }
    function renderGrid() {
        const g = $('mesGrid'); if (!g) return;
        renderStats();
        const open = tabs.filter(isOpen), byNum = {};
        open.forEach(t => { if (t.tableNumber) byNum[t.tableNumber] = t; });
        const max = Math.max(cfg.count, ...open.map(t => Number(t.tableNumber || 0)));
        const cells = [];
        for (let n = 1; n <= max; n++) cells.push({ n, t: byNum[n] || null });
        open.filter(t => !t.tableNumber).sort((a, b) => Number(a.openedAt || 0) - Number(b.openedAt || 0)).forEach(t => cells.push({ n: 0, t }));
        const busy = cells.filter(c => c.t).length, bill = cells.filter(c => c.t && c.t.billRequested).length;
        $('mesCFree').textContent = cells.filter(c => !c.t).length; $('mesCBusy').textContent = busy; $('mesCBill').textContent = bill || '';
        let list = cells;
        if (filter === 'free') list = list.filter(c => !c.t);
        else if (filter === 'busy') list = list.filter(c => c.t);
        else if (filter === 'bill') list = list.filter(c => c.t && c.t.billRequested);
        if (search) list = list.filter(c => norm([c.n, c.t && c.t.label, c.t && c.t.waiterName, c.t && c.t.customerName].join(' ')).includes(search) || String(c.n) === search);
        g.innerHTML = list.length ? list.map(c => cardHtml(c.t, c.n)).join('') + (filter === 'all' && !search ? `<button class="mes-card mes-add" data-new="1"><i class="fas fa-ticket"></i><span>Comanda avulsa</span></button>` : '')
            : `<div class="mes-empty"><i class="fas fa-chair"></i>${filter === 'bill' ? 'Nenhuma mesa pediu a conta.' : filter === 'free' ? 'Todas as mesas estão ocupadas.' : 'Nada encontrado.'}</div>`;
    }

    /* ---------- diálogos ---------- */
    function dialog(title, sub, body, foot, wide) {
        closeDialog();
        const ov = document.createElement('div'); ov.className = 'mes-dlg-ov'; ov.id = 'mesDlg';
        ov.innerHTML = `<div class="mes-dlg${wide ? ' wide' : ''}" role="dialog"><div class="mes-dlg-h"><h3>${title}</h3>${sub ? `<p>${sub}</p>` : ''}</div><div class="mes-dlg-b">${body}</div><div class="mes-dlg-f">${foot}</div></div>`;
        ov.addEventListener('mousedown', e => { if (e.target === ov) closeDialog(); });
        document.body.appendChild(ov);
        return ov;
    }
    function closeDialog() { $('mesDlg')?.remove(); }
    function waiterOptions(selId) {
        const me = uid(), list = users.length ? users : [{ id: me, name: uname() }];
        return list.map(u => `<option value="${esc(u.id)}"${u.id === (selId || me) ? ' selected' : ''}>${esc(u.name)}</option>`).join('');
    }

    function openTableDialog(n, edit) {
        const t = edit ? tabOf(edit) : null, avulsa = t ? !t.tableNumber : !n;
        const title = t ? 'Dados da ' + (avulsa ? 'comanda' : 'mesa ' + t.tableNumber) : avulsa ? '<i class="fas fa-ticket" style="color:var(--accent)"></i> Nova comanda avulsa' : `<i class="fas fa-chair" style="color:var(--accent)"></i> Abrir mesa ${n}`;
        const ov = dialog(title, avulsa && !t ? 'Para balcão, retirada ou cliente sem mesa. Dê um nome ou número para a comanda.' : '',
            `${avulsa ? `<label class="f">Nome / número da comanda<input class="form-input" id="mdLabel" maxlength="40" placeholder="Ex.: Balcão - João, Comanda 15" value="${esc(t ? t.label : '')}"></label>` : ''}
<label class="f">Pessoas na mesa<div class="mes-ppl"><button type="button" data-p="-1">−</button><input class="form-input" id="mdPpl" inputmode="numeric" value="${t ? Number(t.people || 1) : (avulsa ? 1 : 2)}"><button type="button" data-p="1">+</button></div></label>
<label class="f">Garçom / atendente<select class="form-input" id="mdWaiter">${waiterOptions(t ? t.waiterId : '')}</select></label>
<label class="f">Cliente (opcional)<input class="form-input" id="mdCust" maxlength="60" placeholder="Nome do cliente" value="${esc(t ? t.customerName : '')}"></label>`,
            `<button class="btn btn-outline" id="mdCancel">Cancelar</button><button class="btn btn-primary" id="mdOk"><i class="fas fa-check"></i> ${t ? 'Salvar' : avulsa ? 'Abrir comanda' : 'Abrir mesa'}</button>`);
        ov.querySelector('.mes-ppl').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; const i = $('mdPpl'); i.value = Math.max(1, Math.min(99, Math.round(num(i.value)) + Number(b.dataset.p))); });
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = async () => {
            const label = avulsa ? ($('mdLabel').value.trim()) : '';
            if (avulsa && !label) { toast('warning', 'Dê um nome ou número para a comanda'); $('mdLabel').focus(); return; }
            const sel = $('mdWaiter'), people = Math.max(1, Math.min(99, Math.round(num($('mdPpl').value)) || 1));
            const info = { people, waiterId: sel.value, waiterName: sel.options[sel.selectedIndex]?.text || uname(), customerName: $('mdCust').value.trim() };
            $('mdOk').disabled = true;
            try {
                if (t) { await mutate(t.id, () => ({ ...info, ...(avulsa ? { label } : {}) })); closeDialog(); renderPanel(); renderGrid(); return; }
                await reloadTabs();
                const taken = n && tabs.find(x => x.tableNumber === n);
                if (taken) { closeDialog(); toast('info', `A mesa ${n} acabou de ser aberta em outro aparelho.`); renderGrid(); openPanel(taken.id); return; }
                const now = Date.now();
                const doc = { status: 'open', tableNumber: n || null, label: n ? 'Mesa ' + n : label, ...info, items: [], serviceOn: cfg.serviceDefault && cfg.servicePct > 0, discount: 0, billRequested: false, openedAt: now, openedBy: uid(), openedByName: uname(), updatedAtMs: now, deleted: false, createdAt: ts(), updatedAt: ts() };
                const ref = await db.collection(COL).add(doc);
                tabs.push({ id: ref.id, ...doc });
                closeDialog(); renderGrid(); openPanel(ref.id);
            } catch (e) { $('mdOk').disabled = false; toast('error', 'Não foi possível abrir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
        setTimeout(() => (avulsa && !t ? $('mdLabel') : $('mdOk')).focus(), 40);
    }

    /* ---------- painel da mesa ---------- */
    function openPanel(id) {
        openId = id; view = 'menu';
        if (!$('mesPanel')) {
            const p = document.createElement('div'); p.className = 'mes-panel'; p.id = 'mesPanel';
            p.addEventListener('mousedown', e => { if (e.target === p) closePanel(); });
            document.body.appendChild(p);
        }
        renderPanel(true);
    }
    function closePanel() { openId = null; $('mesPanel')?.remove(); renderGrid(); }
    function prodsHtml(t) {
        const q = norm(prodSearch), inTab = {};
        ((t && t.items) || []).forEach(i => { if (i.productId) inTab[i.productId] = (inTab[i.productId] || 0) + Number(i.quantity || 0); });
        let list = products;
        if (catSel) list = list.filter(p => p._cat === catSel);
        if (q) list = list.filter(p => norm([p.name, p.code, p.barcode, p._cat].join(' ')).includes(q));
        if (!list.length) return `<div class="mes-noitems" style="grid-column:1/-1"><i class="fas fa-magnifying-glass"></i>${products.length ? 'Nenhum produto encontrado.' : 'Cadastre seus pratos e bebidas em Produtos.'}<br><a href="#" data-avulso="1" style="color:var(--accent);font-weight:700">Lançar item avulso</a></div>`;
        return list.slice(0, 400).map(p => {
            const img = p.imageUrl && /^(https?:|data:image)/.test(p.imageUrl) ? `<img src="${esc(p.imageUrl)}" alt="" loading="lazy">` : (window.dpProductGlyph ? dpProductGlyph(p.icon) : esc(p.icon || ''));
            return `<button class="mes-prod" data-pid="${esc(p.id)}">${inTab[p.id] ? `<span class="mes-pq">${fmtQty(inTab[p.id], p.unit)}</span>` : ''}<span class="mes-pi">${img}</span><span class="mes-pn">${esc(p.name)}</span><span class="mes-pp">${money(p._price)}</span></button>`;
        }).join('');
    }
    // Só atualiza o número de cada produto já lançado (sem redesenhar a grade a cada toque)
    function paintBadges(t) {
        const box = $('mpProds'); if (!box) return;
        const inTab = {}; ((t && t.items) || []).forEach(i => { if (i.productId) inTab[i.productId] = (inTab[i.productId] || 0) + Number(i.quantity || 0); });
        box.querySelectorAll('[data-pid]').forEach(b => {
            const q = inTab[b.dataset.pid]; let s = b.querySelector('.mes-pq');
            if (q) { if (!s) { s = document.createElement('span'); s.className = 'mes-pq'; b.prepend(s); } const pr = products.find(x => x.id === b.dataset.pid); s.textContent = fmtQty(q, pr && pr.unit); } else if (s) s.remove();
        });
    }
    function itemsHtml(t) {
        const items = (t && t.items) || [];
        if (!items.length) return `<div class="mes-noitems"><i class="fas fa-bell-concierge"></i>Mesa aberta, ainda sem pedidos.<br>Toque nos produtos para lançar.</div>`;
        return items.map(i => `<div class="mes-it" data-key="${esc(i.key)}">
<div class="mes-step"><button data-q="-1" title="Diminuir">−</button><span data-qty="1" title="Digitar quantidade">${fmtQty(i.quantity, i.unit)}</span><button data-q="1" title="Aumentar">+</button></div>
<div class="mes-in"><b title="${esc(i.productName)}">${esc(i.productName)}</b><small>${money(i.unitPrice)} cada · ${i.sent ? `<span class="mes-sent"><i class="fas fa-check"></i> na cozinha ${hhmm(i.sentAt)}</span>` : '<span class="mes-new">novo</span>'}${extraTxt(i) ? ` · <span class="mes-note">${esc(extraTxt(i))}</span>` : ''}${i.notes ? ` · <span class="mes-note">${esc(i.notes)}</span>` : ''}</small></div>
<div class="mes-ir"><b>${money(i.total)}</b><a data-note="1" title="Observação para a cozinha"><i class="fas fa-comment-dots"></i> obs</a><a data-del="1" class="del" title="Remover"><i class="fas fa-trash"></i></a></div></div>`).join('');
    }
    function renderPanel(full) {
        const p = $('mesPanel'); if (!p || !openId) return;
        const t = tabOf(openId);
        if (!t) { closePanel(); return; }
        const tt = totals(t), avulsa = !t.tableNumber;
        panelStamp = t.updatedAtMs;
        const fresh = full || !p.querySelector('.mes-sheet');
        if (fresh) {
            p.innerHTML = `<div class="mes-sheet">
<div class="mes-ph"><div class="mes-badge" id="mpBadge"></div><div style="min-width:0"><h3 id="mpTitle"></h3><small id="mpSub"></small></div>
<button class="mes-x" id="mpEdit" title="Pessoas, garçom e cliente"><i class="fas fa-pen"></i></button><button class="mes-x" style="margin-left:6px" id="mpClose" title="Voltar para as mesas"><i class="fas fa-xmark"></i></button></div>
<div class="mes-tabsw" id="mpSw"><button data-v="menu"><i class="fas fa-book-open"></i> Cardápio</button><button data-v="bill"><i class="fas fa-receipt"></i> Conta <span id="mpSwTot"></span></button></div>
<div class="mes-pb" id="mpBody">
 <section class="mes-menu"><div class="mes-mtool"><div class="mes-srch"><div class="search-box"><i class="fas fa-search"></i><input id="mpSearch" type="text" placeholder="Buscar prato, bebida ou código..." autocomplete="off"></div><button class="btn btn-outline" id="mpAvulso" title="Item que não está no cadastro"><i class="fas fa-pen-to-square"></i> Avulso</button></div><div class="mes-cats" id="mpCats"></div></div><div class="mes-prods" id="mpProds"></div></section>
 <section class="mes-bill"><div class="mes-items" id="mpItems"></div><div class="mes-foot" id="mpFoot"></div></section>
</div></div>`;
            $('mpClose').onclick = closePanel;
            $('mpEdit').onclick = () => openTableDialog(null, openId);
            $('mpSw').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; view = b.dataset.v; paintView(); };
            $('mpSearch').value = prodSearch;
            $('mpSearch').addEventListener('input', e => { prodSearch = e.target.value; $('mpProds').innerHTML = prodsHtml(tabOf(openId)); });
            $('mpSearch').addEventListener('keydown', e => { if (e.key === 'Enter') { const first = $('mpProds').querySelector('[data-pid]'); if (first) first.click(); } });
            $('mpAvulso').onclick = () => openAvulso();
            $('mpCats').onclick = e => { const b = e.target.closest('[data-cat]'); if (!b) return; catSel = b.dataset.cat; paintCats(); $('mpProds').innerHTML = prodsHtml(tabOf(openId)); };
            $('mpProds').onclick = e => {
                if (e.target.closest('[data-avulso]')) { e.preventDefault(); openAvulso(); return; }
                const b = e.target.closest('[data-pid]'); if (!b) return;
                const prod = products.find(x => x.id === b.dataset.pid); if (!prod) return;
                b.classList.remove('flash'); void b.offsetWidth; b.classList.add('flash');
                if (isFrac(prod.unit)) askQty(prod.name, prod.unit, 1, q => addProduct(prod, q)); else addProduct(prod, 1);
            };
            $('mpItems').onclick = onItemClick;
            $('mpFoot').onclick = onFootClick;
            $('mpFoot').onchange = onFootChange;
            paintCats();
        }
        $('mpBadge').textContent = avulsa ? String(t.label || 'C').trim().charAt(0).toUpperCase() : t.tableNumber;
        $('mpBadge').style.background = t.billRequested ? 'var(--danger)' : 'var(--warning)';
        $('mpTitle').textContent = avulsa ? (t.label || 'Comanda') : 'Mesa ' + t.tableNumber;
        $('mpSub').textContent = [`aberta ${hhmm(t.openedAt)} (${dur(t.openedAt)})`, `${Number(t.people || 0)} pessoa${Number(t.people) === 1 ? '' : 's'}`, t.waiterName, t.customerName, t.billRequested ? 'CONTA PEDIDA' : ''].filter(Boolean).join(' · ');
        $('mpSwTot').textContent = '· ' + money(tt.total);
        if (fresh) $('mpProds').innerHTML = prodsHtml(t); else paintBadges(t);
        $('mpItems').innerHTML = itemsHtml(t);
        const per = Number(t.people || 0) > 1 ? r2(tt.total / Number(t.people)) : 0;
        $('mpFoot').innerHTML = `<div class="mes-row"><span>Itens (${fmtQty(tt.qty)})</span><b>${money(tt.sub)}</b></div>
${cfg.servicePct > 0 ? `<div class="mes-row"><label><input type="checkbox" id="mpSvc"${t.serviceOn ? ' checked' : ''}> Taxa de serviço (${String(cfg.servicePct).replace('.', ',')}%)</label><b>${money(tt.svc)}</b></div>` : ''}
<div class="mes-row"><a href="#" data-disc="1" style="color:var(--accent);font-weight:600;text-decoration:none"><i class="fas fa-tag"></i> ${tt.disc ? 'Desconto' : 'Dar desconto'}</a><b>${tt.disc ? '− ' + money(tt.disc) : ''}</b></div>
<div class="mes-row big"><span>Total</span><b>${money(tt.total)}</b></div>
${per ? `<div class="mes-row"><span><i class="fas fa-user-group"></i> Dividido por ${t.people}</span><b>${money(per)} cada</b></div>` : ''}
${partialsHtml(t, tt)}
<button class="mes-partial-btn" data-act="partial"${(t.items || []).length ? '' : ' disabled'}><i class="fas fa-hand-holding-dollar"></i> Pagamento parcial${partSum(t) ? ' · falta ' + money(Math.max(0, r2(tt.total - partSum(t)))) : ''}</button>
<div class="mes-acts"><button data-act="kitchen"${tt.pending ? '' : ' disabled'}><i class="fas fa-fire-burner"></i>Cozinha${tt.pending ? `<span class="mes-cnt">${tt.pending}</span>` : ''}</button><button data-act="pre"${(t.items || []).length ? '' : ' disabled'}><i class="fas fa-file-invoice"></i>${t.billRequested ? 'Pré-conta' : 'Pedir conta'}</button><button data-act="move"><i class="fas fa-right-left"></i>Transferir</button><button data-act="cancel"><i class="fas fa-ban"></i>Cancelar</button></div>
<button class="mes-close" data-act="close"${(t.items || []).length ? '' : ' disabled'}><i class="fas fa-cash-register"></i> Fechar conta · ${money(tt.total)}</button>`;
        paintView();
    }
    function paintCats() {
        const el = $('mpCats'); if (!el) return;
        el.innerHTML = [`<button data-cat=""${catSel ? '' : ' class="on"'}>Todos</button>`].concat(cats.map(c => `<button data-cat="${esc(c)}"${catSel === c ? ' class="on"' : ''}>${esc(c)}</button>`)).join('');
    }
    function paintView() { const b = $('mpBody'); if (!b) return; b.dataset.view = view; $('mpSw')?.querySelectorAll('button').forEach(x => x.classList.toggle('on', x.dataset.v === view)); }

    /* ---------- itens ---------- */
    const keyNew = () => 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    // 38.4 · opt = adicionais/sabores escolhidos na janela do adicionais-v1.js (o item fica numa linha só dele)
    function addProduct(p, qty, opt) {
        if (!opt && window.DPAddons && DPAddons.needs && DPAddons.needs(p)) { DPAddons.choose(p, { products, priceOf: x => x._price, qty: !isFrac(p.unit) }).then(r => { if (r) addProduct(p, isFrac(p.unit) ? qty : r.qty || 1, r); }); return; }
        const id = openId, key = keyNew(), now = Date.now(), who = uname(), price = opt ? opt.unitPrice : p._price;
        itemsOp(id, items => {
            const same = !opt && items.find(i => i.productId === p.id && !i.sent && !i.notes && !i.addons && !i.flavors);
            if (same) { same.quantity = r2(Number(same.quantity) + qty); same.total = r2(same.quantity * Number(same.unitPrice)); return items; }
            items.push({ key, productId: p.id, productName: opt ? opt.productName : p.name, productCode: p.code || p.internalCode || '', unit: p.unit || 'un', unitPrice: r2(price), costPrice: r2(p.costPrice || 0), quantity: qty, total: r2(qty * price), notes: opt ? opt.notes || '' : '', ...(opt && window.DPAddons ? DPAddons.cartFields(opt) : {}), sent: false, addedAt: now, addedBy: who });
            return items;
        });
    }
    const extraTxt = i => (window.DPKitchenPrint ? DPKitchenPrint.addonText(i) : '');
    function onItemClick(e) {
        const row = e.target.closest('[data-key]'); if (!row) return;
        const key = row.dataset.key, t = tabOf(openId); if (!t) return;
        const it = (t.items || []).find(i => i.key === key); if (!it) return;
        const setQty = q => itemsOp(openId, items => items.flatMap(i => i.key !== key ? [i] : (q > 0 ? [{ ...i, quantity: q, total: r2(q * Number(i.unitPrice)) }] : [])));
        const b = e.target.closest('[data-q]');
        if (b) {
            const step = isFrac(it.unit) ? 0.1 : 1, q = r2(Number(it.quantity) + Number(b.dataset.q) * step);
            if (q <= 0) return removeItem(it); return setQty(q);
        }
        if (e.target.closest('[data-qty]')) return askQty(it.productName, it.unit, it.quantity, q => setQty(q));
        if (e.target.closest('[data-del]')) return removeItem(it);
        if (e.target.closest('[data-note]')) {
            const ov = dialog('Observação para a cozinha', esc(it.productName), `<label class="f">Observação<input class="form-input" id="mdNote" maxlength="80" placeholder="Ex.: sem cebola, ponto da carne, gelo e limão" value="${esc(it.notes || '')}"></label>${it.sent ? '<div class="mes-warn">Este item já foi para a cozinha. Se mudar algo, avise a cozinha.</div>' : ''}`,
                `<button class="btn btn-outline" id="mdCancel">Cancelar</button><button class="btn btn-primary" id="mdOk">Salvar</button>`);
            $('mdCancel').onclick = closeDialog;
            const go = () => { const v = $('mdNote').value.trim(); closeDialog(); itemsOp(openId, items => items.map(i => i.key === key ? { ...i, notes: v } : i)); };
            $('mdOk').onclick = go; $('mdNote').addEventListener('keydown', ev => { if (ev.key === 'Enter') go(); });
            setTimeout(() => $('mdNote').focus(), 40); void ov;
        }
    }
    function removeItem(it) {
        const go = () => itemsOp(openId, items => items.filter(i => i.key !== it.key));
        if (!it.sent) return go();
        dialog('Remover item já enviado?', `${esc(it.productName)} já foi para a cozinha às ${hhmm(it.sentAt)}.`, '<div class="mes-warn">Avise a cozinha se o pedido for cancelado.</div>',
            `<button class="btn btn-outline" id="mdCancel">Manter</button><button class="btn btn-danger" id="mdOk"><i class="fas fa-trash"></i> Remover</button>`);
        $('mdCancel').onclick = closeDialog; $('mdOk').onclick = () => { closeDialog(); go(); };
    }
    function askQty(name, unit, cur, cb) {
        const u = C ? C.unit(unit) : { abbr: String(unit || 'UN').toUpperCase() };
        dialog('Quantidade', esc(name), `<div class="mes-ppl"><input class="form-input" id="mdQty" inputmode="decimal" style="width:140px!important" value="${String(r2(cur)).replace('.', ',')}"><b style="color:var(--accent)">${esc(u.abbr || '')}</b></div>`,
            `<button class="btn btn-outline" id="mdCancel">Cancelar</button><button class="btn btn-primary" id="mdOk">OK</button>`);
        const go = () => { const q = Math.round(num($('mdQty').value) * 1000) / 1000; if (!(q > 0)) { toast('warning', 'Quantidade inválida'); return; } closeDialog(); cb(q); };
        $('mdCancel').onclick = closeDialog; $('mdOk').onclick = go;
        $('mdQty').addEventListener('keydown', e => { if (e.key === 'Enter') go(); });
        setTimeout(() => { $('mdQty').focus(); $('mdQty').select(); }, 40);
    }
    function openAvulso() {
        dialog('<i class="fas fa-pen-to-square" style="color:var(--accent)"></i> Item avulso', 'Para algo que não está no cadastro (ex.: porção especial, couvert, rolha).',
            `<label class="f">Descrição<input class="form-input" id="maName" maxlength="60" placeholder="Ex.: Couvert artístico"></label>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Valor (R$)<input class="form-input" id="maPrice" inputmode="decimal" placeholder="0,00"></label><label class="f">Quantidade<input class="form-input" id="maQty" inputmode="decimal" value="1"></label></div>`,
            `<button class="btn btn-outline" id="mdCancel">Cancelar</button><button class="btn btn-primary" id="mdOk"><i class="fas fa-plus"></i> Lançar</button>`);
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = () => {
            const name = $('maName').value.trim(), price = r2(num($('maPrice').value)), qty = Math.round(num($('maQty').value) * 1000) / 1000;
            if (!name) { toast('warning', 'Digite a descrição'); $('maName').focus(); return; }
            if (!(price > 0)) { toast('warning', 'Digite o valor'); $('maPrice').focus(); return; }
            if (!(qty > 0)) { toast('warning', 'Quantidade inválida'); return; }
            closeDialog();
            const key = keyNew(), now = Date.now(), who = uname();
            itemsOp(openId, items => { items.push({ key, productId: '', productName: name, productCode: '', unit: 'un', unitPrice: price, costPrice: 0, quantity: qty, total: r2(price * qty), notes: '', sent: false, avulso: true, addedAt: now, addedBy: who }); return items; });
        };
        setTimeout(() => $('maName').focus(), 40);
    }

    /* ---------- rodapé da conta ---------- */
    async function onFootChange(e) {
        if (e.target.id !== 'mpSvc') return;
        const on = e.target.checked, t = tabOf(openId); if (!t) return;
        t.serviceOn = on; renderPanel(); renderGrid();
        try { await mutate(openId, () => ({ serviceOn: on })); } catch (err) { toast('error', err.message); }
    }
    function onFootClick(e) {
        const d = e.target.closest('[data-disc]');
        if (d) { e.preventDefault(); return askDiscount(); }
        const b = e.target.closest('[data-act]'); if (!b || b.disabled) return;
        const a = b.dataset.act;
        if (a === 'kitchen') return sendKitchen();
        if (a === 'pre') return preBill();
        if (a === 'move') return openMove();
        if (a === 'cancel') return cancelTab();
        if (a === 'close') return openClose();
        if (a === 'partial') return openPartial();
        if (a === 'rmpart') return removePartial(b.dataset.id);
    }

    /* ---------- 37.1 · pagamento parcial (cada um paga a sua parte; a mesa continua aberta) ---------- */
    const partSum = t => r2((t.partials || []).reduce((s, p) => s + Number(p.amount || 0), 0));
    function partialsHtml(t, tt) {
        const l = t.partials || []; if (!l.length) return '';
        const left = r2(tt.total - partSum(t));
        return `<div class="mes-parts">${l.map(p => `<div class="mes-row mes-part"><span><i class="fas ${(PAY[p.method] || PAY.dinheiro)[1]}" style="color:${(PAY[p.method] || PAY.dinheiro)[2]}"></i> ${esc(p.payer || 'Parcial')} · ${(PAY[p.method] || [p.method])[0]} <small>${hhmm(p.at)}</small></span><b>− ${money(p.amount)} <button type="button" data-act="rmpart" data-id="${esc(p.id)}" title="Estornar este pagamento"><i class="fas fa-xmark"></i></button></b></div>`).join('')}
<div class="mes-row big" style="color:${left > 0.004 ? 'var(--warning)' : 'var(--success)'}"><span>${left > 0.004 ? 'Falta pagar' : 'Pago'}</span><b>${money(Math.max(0, left))}</b></div></div>`;
    }
    function openPartial() {
        const t = tabOf(openId); if (!t || !(t.items || []).length) return;
        const tt = totals(t), left = r2(tt.total - partSum(t));
        if (left <= 0.004) { toast('info', 'A conta já está paga. Toque em Fechar conta.'); return; }
        const per = Number(t.people || 0) > 1 ? r2(tt.total / Number(t.people)) : 0;
        let method = 'pix';
        const ov = dialog('<i class="fas fa-hand-holding-dollar" style="color:var(--success)"></i> Pagamento parcial', `${esc(t.label || 'Conta')} · total ${money(tt.total)} · falta ${money(left)}`,
            `<div class="mes-pay-m" id="mpMeth">${Object.entries(PAY).map(([k, v]) => `<button type="button" data-m="${k}"${k === method ? ' class="on"' : ''}><i class="fas ${v[1]}" style="color:${v[2]}"></i>${v[0]}</button>`).join('')}</div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Valor pago (R$)<input class="form-input" id="mpAmt" inputmode="decimal" value="${String(Math.min(per || left, left).toFixed(2)).replace('.', ',')}"></label><label class="f">Quem pagou (opcional)<input class="form-input" id="mpWho" maxlength="40" placeholder="Ex.: João, pessoa 1"></label></div>
${per ? `<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="btn btn-outline btn-sm" data-fill="${per}">1 pessoa · ${money(per)}</button><button type="button" class="btn btn-outline btn-sm" data-fill="${left}">Tudo que falta · ${money(left)}</button></div>` : ''}
<label style="display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer"><input type="checkbox" id="mpPrint"> Imprimir comprovante desta parte</label>
<div class="mes-warn" style="margin-top:8px"><i class="fas fa-circle-info"></i> A mesa continua aberta. O valor entra no caixa e nos relatórios quando a conta for fechada.</div>`,
            `<button class="btn btn-outline" id="mdCancel">Voltar</button><button class="btn btn-success" id="mdOk" style="background:var(--success);border-color:var(--success);color:#fff"><i class="fas fa-check"></i> Registrar pagamento</button>`, true);
        ov.addEventListener('click', e => {
            const m = e.target.closest('[data-m]'); if (m) { method = m.dataset.m; ov.querySelectorAll('#mpMeth [data-m]').forEach(x => x.classList.toggle('on', x === m)); return; }
            const f = e.target.closest('[data-fill]'); if (f) $('mpAmt').value = String(Number(f.dataset.fill).toFixed(2)).replace('.', ',');
        });
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = async () => {
            const amt = r2(num($('mpAmt').value)); if (!(amt > 0)) { toast('warning', 'Digite o valor pago'); return; }
            if (amt > left + 0.004) { toast('warning', 'O valor é maior que o que falta (' + money(left) + '). Para troco, use Fechar conta.'); return; }
            const p = { id: 'p' + Date.now().toString(36), method, amount: amt, payer: $('mpWho').value.trim(), at: Date.now(), by: uname() };
            const wantPrint = $('mpPrint').checked, w = wantPrint ? openPrint() : null;
            $('mdOk').disabled = true;
            try {
                const fresh = await mutate(t.id, cur => ({ partials: (cur.partials || []).concat(p) }));
                closeDialog(); renderPanel(); renderGrid();
                const tt2 = totals(fresh), left2 = r2(tt2.total - partSum(fresh));
                toast('success', `Recebido ${money(amt)} de ${t.label || 'conta'} · falta ${money(Math.max(0, left2))}`);
                if (w) { const co = await company(); writePrint(w, 'Parcial ' + (t.label || ''), `<div class="c"><div style="font-size:13px">${esc(co.name)}</div></div><div class="sep"></div><div class="c xl">PAGAMENTO PARCIAL</div><div class="c">${esc(t.label || '')}${p.payer ? ' · ' + esc(p.payer) : ''}</div><div class="c sm">${new Date().toLocaleString('pt-BR')}</div><div class="sep"></div><div class="row tot"><span>${(PAY[method] || [method])[0]}</span><span>${money(amt)}</span></div><div class="row"><span>Total da conta</span><span>${money(tt2.total)}</span></div><div class="row"><span>Falta pagar</span><span>${money(Math.max(0, left2))}</span></div><div class="c sm" style="margin-top:3mm">Não é documento fiscal.</div>`); }
                if (left2 <= 0.004) setTimeout(() => openClose(), 300);
            } catch (err) { w && w.close(); $('mdOk').disabled = false; toast('error', err.message); }
        };
        setTimeout(() => { $('mpAmt').focus(); $('mpAmt').select(); }, 40);
    }
    function removePartial(id) {
        const t = tabOf(openId); const p = (t.partials || []).find(x => x.id === id); if (!p) return;
        if (!confirm(`Estornar o pagamento parcial de ${money(p.amount)}${p.payer ? ' (' + p.payer + ')' : ''}? Devolva o valor ao cliente.`)) return;
        mutate(t.id, cur => ({ partials: (cur.partials || []).filter(x => x.id !== id) })).then(() => { renderPanel(); renderGrid(); toast('info', 'Pagamento parcial estornado'); }).catch(err => toast('error', err.message));
    }
    function askDiscount() {
        const t = tabOf(openId), tt = totals(t);
        dialog('Desconto na conta', `Total antes do desconto: ${money(tt.sub + tt.svc)}`, `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="f">Desconto em R$<input class="form-input" id="mdDisc" inputmode="decimal" value="${tt.disc ? String(tt.disc).replace('.', ',') : ''}" placeholder="0,00"></label><label class="f">ou em %<input class="form-input" id="mdDiscP" inputmode="decimal" placeholder="0"></label></div>`,
            `<button class="btn btn-outline" id="mdCancel">Cancelar</button><button class="btn btn-primary" id="mdOk">Aplicar</button>`);
        $('mdDiscP').addEventListener('input', e => { const p = num(e.target.value); $('mdDisc').value = p > 0 ? String(r2((tt.sub + tt.svc) * Math.min(100, p) / 100)).replace('.', ',') : ''; });
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = async () => {
            const v = Math.max(0, Math.min(r2(num($('mdDisc').value)), r2(tt.sub + tt.svc)));
            closeDialog(); t.discount = v; renderPanel(); renderGrid();
            try { await mutate(openId, () => ({ discount: v })); } catch (err) { toast('error', err.message); }
        };
        setTimeout(() => $('mdDisc').focus(), 40);
    }
    function moveDialogHtml(t) {
        const open = tabs.filter(isOpen), byNum = {}; open.forEach(x => { if (x.tableNumber) byNum[x.tableNumber] = x; });
        const max = Math.max(cfg.count, ...open.map(x => Number(x.tableNumber || 0)));
        let h = '';
        for (let n = 1; n <= max; n++) { if (n === t.tableNumber) continue; const o = byNum[n]; h += `<button data-to="${n}"${o ? ` class="busy" data-merge="${esc(o.id)}"` : ''}>${n}<small>${o ? 'juntar' : 'livre'}</small></button>`; }
        open.filter(x => !x.tableNumber && x.id !== t.id).forEach(x => { h += `<button class="busy" data-merge="${esc(x.id)}" style="grid-column:span 2">${esc(x.label)}<small>juntar</small></button>`; });
        return h;
    }
    function openMove() {
        const t = tabOf(openId);
        const ov = dialog('<i class="fas fa-right-left" style="color:var(--accent)"></i> Transferir ou juntar', 'Mesa <b style="color:var(--success)">livre</b>: a conta muda de mesa. Mesa <b style="color:var(--warning)">ocupada</b>: os itens são somados na conta dela.', `<div class="mes-pick">${moveDialogHtml(t)}</div>`, `<button class="btn btn-outline" id="mdCancel">Fechar</button>`, true);
        $('mdCancel').onclick = closeDialog;
        ov.querySelector('.mes-pick').onclick = async e => {
            const b = e.target.closest('button'); if (!b) return;
            try {
                if (b.dataset.merge) {
                    const dest = tabOf(b.dataset.merge); if (!dest) return;
                    if (!confirm(`Juntar ${t.label || 'esta conta'} com ${dest.label}? Os itens vão para ${dest.label} e esta fica livre.`)) return;
                    closeDialog();
                    const src = await mutate(t.id, () => ({}));
                    await mutate(dest.id, cur => ({ items: (cur.items || []).concat((src.items || []).map(i => ({ ...i, notes: [i.notes, 'de ' + (t.label || '')].filter(Boolean).join(' · ') }))), people: Number(cur.people || 0) + Number(src.people || 0) }));
                    await db.collection(COL).doc(t.id).set({ status: 'merged', mergedInto: dest.id, items: [], closedAt: Date.now(), updatedAtMs: Date.now(), updatedAt: ts() }, { merge: true });
                    tabs = tabs.filter(x => x.id !== t.id);
                    toast('success', `Contas juntas em ${dest.label}`);
                    openPanel(dest.id); renderGrid();
                } else {
                    const to = Number(b.dataset.to);
                    await reloadTabs();
                    if (tabs.some(x => x.tableNumber === to)) { toast('warning', `A mesa ${to} acabou de ser ocupada.`); closeDialog(); renderGrid(); return; }
                    closeDialog();
                    await mutate(t.id, () => ({ tableNumber: to, label: 'Mesa ' + to }));
                    toast('success', `Conta transferida para a mesa ${to}`);
                    renderPanel(); renderGrid();
                }
            } catch (err) { toast('error', err.message); }
        };
    }
    function cancelTab() {
        const t = tabOf(openId), has = (t.items || []).length;
        dialog(`Cancelar ${t.label || 'mesa'}?`, has ? 'A mesa tem itens lançados. Nada será cobrado e a mesa fica livre.' : 'A mesa fica livre.',
            `${partSum(t) ? `<div class="mes-warn"><i class="fas fa-triangle-exclamation"></i> Esta mesa já recebeu ${money(partSum(t))} em pagamento parcial. Devolva esse valor ao cliente.</div>` : ''}<label class="f">Motivo (opcional)<input class="form-input" id="mdWhy" maxlength="80" placeholder="Ex.: cliente desistiu, aberta por engano"></label>`,
            `<button class="btn btn-outline" id="mdCancel">Voltar</button><button class="btn btn-danger" id="mdOk"><i class="fas fa-ban"></i> Cancelar mesa</button>`);
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = async () => {
            try {
                await mutate(t.id, () => ({}));
                await db.collection(COL).doc(t.id).set({ status: 'cancelled', cancelReason: $('mdWhy').value.trim(), cancelledAt: Date.now(), cancelledBy: uname(), closedDay: dayKey(), updatedAtMs: Date.now(), updatedAt: ts() }, { merge: true });
                tabs = tabs.filter(x => x.id !== t.id); closeDialog(); closePanel(); toast('info', `${t.label} cancelada`);
            } catch (err) { toast('error', err.message); }
        };
    }

    /* ---------- impressão (cupom 80 mm) ---------- */
    let coCache = null;
    async function company() {
        if (coCache) return coCache;
        const c = { name: 'Minha empresa', doc: '', phone: '', address: '' };
        try {
            const d = (await db.collection('settings').doc(DOC).get()).data() || {};
            const b = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {};
            c.name = (db.__isLocalDemo ? b.companyName : '') || d.nomeFantasia || b.companyName || d.razaoSocial || c.name;
            c.doc = d.cnpj ? 'CNPJ ' + d.cnpj : ''; c.phone = d.telefone || d.whatsapp || '';
            c.address = [[d.logradouro, d.numero].filter(Boolean).join(', '), d.bairro, [d.cidade, d.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
        } catch (e) { }
        return (coCache = c);
    }
    // 38.4 · Cupom 80 mm e via da cozinha no arquivo comum cozinha-print-v1.js (o mesmo do PDV e de Pedidos).
    // A janela abre no clique; se o navegador bloquear o pop-up, imprime numa janela escondida.
    const KP = () => window.DPKitchenPrint;
    function openPrint() { return KP() ? KP().open() : null; }
    function writePrint(w, title, inner, big) { if (KP()) KP().write(w, title, inner, big); else toast('warning', 'Atualize a página para imprimir.'); }
    function billHtml(co, t, tt, extra) {
        const items = t.items || [];
        return `<div class="c"><div style="font-size:13px">${esc(co.name)}</div>${co.doc || co.phone ? `<div class="sm">${esc([co.doc, co.phone].filter(Boolean).join(' · '))}</div>` : ''}${co.address ? `<div class="sm">${esc(co.address)}</div>` : ''}</div>
<div class="sep"></div><div class="c xl">${extra.title}</div><div class="c">${esc(t.label || '')}${t.customerName ? ' · ' + esc(t.customerName) : ''}</div>
<div class="c sm">Aberta ${hhmm(t.openedAt)} · ${new Date().toLocaleString('pt-BR')}${t.waiterName ? ' · ' + esc(t.waiterName) : ''}</div><div class="sep"></div>
${items.map(i => `<div class="it"><div>${esc(i.productName)}</div>${extraTxt(i) ? `<div class="sm">${esc(extraTxt(i))}</div>` : ''}<div class="row"><span>${fmtQty(i.quantity, i.unit)} x ${money(i.unitPrice).replace('R$', '').trim()}</span><span>${money(i.total).replace('R$', '').trim()}</span></div></div>`).join('')}
<div class="sep"></div><div class="row"><span>Subtotal</span><span>${money(tt.sub)}</span></div>${tt.svc ? `<div class="row"><span>Serviço ${String(cfg.servicePct).replace('.', ',')}%</span><span>${money(tt.svc)}</span></div>` : ''}${tt.disc ? `<div class="row"><span>Desconto</span><span>- ${money(tt.disc)}</span></div>` : ''}
<div class="row tot"><span>TOTAL</span><span>${money(tt.total)}</span></div>
${Number(t.people || 0) > 1 ? `<div class="row"><span>Por pessoa (${t.people})</span><span>${money(tt.total / Number(t.people))}</span></div>` : ''}
${extra.after || ''}<div class="c sm" style="margin-top:3mm">${extra.footer}</div>`;
    }
    async function preBill() {
        const t = tabOf(openId); if (!t) return;
        const w = openPrint();
        try {
            if (!t.billRequested) { t.billRequested = true; renderPanel(); renderGrid(); await mutate(t.id, () => ({ billRequested: true, billRequestedAt: Date.now() })); }
            writePrint(w, 'Pré-conta ' + (t.label || ''), billHtml(await company(), t, totals(t), { title: 'PRÉ-CONTA', footer: 'Confira os itens antes de pagar.<br>Não é documento fiscal.' }));
        } catch (e) { w && w.close(); toast('error', e.message); }
    }
    async function sendKitchen() {
        const t = tabOf(openId); if (!t) return;
        const pend = (t.items || []).filter(i => !i.sent); if (!pend.length) return;
        const now = Date.now(), keys = new Set(pend.map(i => i.key));
        // 38.4 · Mesma via do PDV (cozinha-print-v1.js): adicionais, um sabor por linha e, se ligado, vias separadas COZINHA e BAR
        if (KP()) KP().ticket({ label: t.label || '', items: pend, products, when: now, waiter: t.waiterName, people: t.people, customer: t.customerName, by: uname(), fmtQty });
        else toast('warning', 'Atualize a página para imprimir a via da cozinha.');
        await itemsOp(openId, items => items.map(i => keys.has(i.key) ? { ...i, sent: true, sentAt: now } : i));
        toast('success', 'Pedido enviado para a cozinha');
    }

    /* ---------- fechar conta ---------- */
    function openClose() {
        const t = tabOf(openId); if (!t || !(t.items || []).length) return;
        let svcOn = !!t.serviceOn, disc = r2(t.discount || 0);
        // 37.1 · Partes já pagas (pagamento parcial) entram travadas no fechamento
        const pays = (t.partials || []).map(p => ({ method: PAY[p.method] ? p.method : 'dinheiro', amount: r2(p.amount), locked: true, payer: p.payer || '' }));
        const calc = () => { const sub = totals(t).sub, svc = svcOn ? r2(sub * cfg.servicePct / 100) : 0, d = Math.min(disc, r2(sub + svc)); return { sub, svc, disc: d, total: r2(sub + svc - d) }; };
        let printOn = true; try { printOn = localStorage.getItem('dp_mesas_print') !== '0'; } catch (e) { }
        // 40.91 · Fiado: a conta (ou parte dela) vai para a conta do cliente cadastrado em Contas a Receber, como o fiado
        // do PDV (SalesService grava "Vendas Fiado" com o vencimento). Some se o Fiado estiver desligado nas formas de pagamento.
        const ativas = Array.isArray(fees.formasPagamentoAtivas) && fees.formasPagamentoAtivas.length ? fees.formasPagamentoAtivas : null;
        const fiOn = !ativas || ativas.includes('fiado');
        const PM = fiOn ? { ...PAY, fiado: FIADO } : PAY;
        const fi = { cust: null, due: dayKey(new Date(Date.now() + 30 * 864e5)), list: null, loading: false, novo: false, shown: false };
        const okTxt = f => f ? '<i class="fas fa-handshake"></i> Lançar no fiado' : '<i class="fas fa-check"></i> Receber';
        const ov = dialog(`<i class="fas fa-cash-register" style="color:var(--success)"></i> Fechar ${esc(t.label || 'conta')}`, `${(t.items || []).length} item(ns) · ${Number(t.people || 0)} pessoa(s) · aberta há ${dur(t.openedAt)}`,
            `<div class="mes-sum" id="mcSum"></div>
<div class="mes-pay-m${fiOn ? ' c5' : ''}" id="mcMeth">${Object.entries(PM).map(([k, v]) => `<button type="button" data-m="${k}"><i class="fas ${v[1]}" style="color:${v[2]}"></i>${v[0]}</button>`).join('')}</div>
<div class="mes-pays" id="mcPays"></div><div class="mes-left" id="mcLeft"></div>
${fiOn ? `<div class="mes-fi" id="mcFi" hidden><div class="mes-fi-h"><i class="fas fa-handshake"></i> Vai para a conta do cliente em Contas a Receber</div>
<div class="mes-fi-due"><span>Vencimento</span><input type="date" class="form-input" id="mcDue" value="${fi.due}">${[7, 15, 30].map(d => `<button type="button" data-due="${d}">${d} dias</button>`).join('')}</div></div>` : ''}
<label class="f"><span id="mcCustT">Cliente (opcional)</span><input class="form-input" id="mcCust" maxlength="60" value="${esc(t.customerName || '')}" placeholder="Nome para o cupom e o relatório" autocomplete="off"></label>
${fiOn ? '<div class="mes-fi-c" id="mcFiC" hidden></div>' : ''}
<label style="display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer"><input type="checkbox" id="mcPrint"${printOn ? ' checked' : ''}> Imprimir a conta ao fechar</label>
${cash ? '' : '<div class="mes-warn"><i class="fas fa-triangle-exclamation"></i> Nenhum caixa aberto: a venda entra nos relatórios, mas não no caixa. <a href="caixa.html" target="_blank">Abrir o caixa</a> e depois fechar a conta.</div>'}`,
            `<button class="btn btn-outline" id="mdCancel">Voltar</button><button class="btn btn-success" id="mdOk" style="background:var(--success);border-color:var(--success);color:#fff">${okTxt(false)}</button>`, true);
        // Cliente do fiado: busca no cadastro pelo nome ou telefone; dá para cadastrar ali mesmo (nome + WhatsApp)
        const findCust = q => {
            const n = norm(q).trim(), d = String(q || '').replace(/\D/g, '');
            if (!n || !fi.list) return [];
            return fi.list.filter(c => norm(c.name).includes(n) || (d.length >= 3 && String(c.phone).replace(/\D/g, '').includes(d)))
                .sort((a, b) => (norm(b.name).startsWith(n) - norm(a.name).startsWith(n)) || a.name.localeCompare(b.name, 'pt-BR')).slice(0, 6);
        };
        const paintCust = () => {
            const el = $('mcFiC'); if (!el || el.hidden) return;
            if (fi.cust) { el.innerHTML = `<div class="mes-fi-sel"><i class="fas fa-user-check"></i><span><b>${esc(fi.cust.name)}</b><small>${fi.cust.phone ? 'WhatsApp ' + esc(fmtPhone(fi.cust.phone)) : 'Sem WhatsApp no cadastro'}</small></span><button type="button" data-cx>Trocar</button></div>`; return; }
            if (!fi.list) { el.innerHTML = '<div class="mes-fi-msg"><i class="fas fa-spinner fa-spin"></i> Carregando os clientes…</div>'; return; }
            const q = $('mcCust').value.trim();
            if (fi.novo) { el.innerHTML = `<div class="mes-fi-new"><b>Cadastrar cliente</b><input class="form-input" id="mcNewNm" maxlength="60" value="${esc(q)}" placeholder="Nome do cliente"><input class="form-input" id="mcNewPh" inputmode="tel" maxlength="20" placeholder="WhatsApp com DDD (opcional)"><div><button type="button" class="btn btn-outline btn-sm" data-cnx>Voltar</button><button type="button" class="btn btn-primary btn-sm" data-cns><i class="fas fa-user-plus"></i> Cadastrar</button></div></div>`; return; }
            const hits = findCust(q);
            el.innerHTML = `<div class="mes-fi-msg">${!q ? 'Digite o nome ou o telefone do cliente.' : hits.length ? 'Toque no cliente:' : 'Nenhum cliente cadastrado com esse nome.'}</div>${hits.map(c => `<button type="button" class="mes-fi-opt" data-cu="${esc(c.id)}"><b>${esc(c.name)}</b><small>${esc(fmtPhone(c.phone))}</small></button>`).join('')}<button type="button" class="mes-fi-opt add" data-cn><i class="fas fa-user-plus"></i> Cadastrar ${q ? '“' + esc(q) + '”' : 'cliente novo'}</button>`;
        };
        const loadFiCust = async () => {
            if (fi.list || fi.loading) return; fi.loading = true;
            try {
                const cb = db.collection('customers');
                const s = await (typeof cb.select === 'function' ? cb.select('name', 'nome', 'razaoSocial', 'phone', 'whatsapp', 'deleted', 'status') : cb).get();
                fi.list = s.docs.map(d => { const c = d.data() || {}; return { id: d.id, name: String(c.name || c.nome || c.razaoSocial || '').trim(), phone: c.whatsapp || c.phone || '', off: c.deleted === true || c.status === 'inactive' }; }).filter(c => c.name && !c.off);
            } catch (e) { fi.list = []; toast('error', 'Não foi possível carregar os clientes: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            fi.loading = false;
            if (!ov.isConnected) return;
            // O nome que já estava na mesa (ex.: "francisco") escolhe sozinho quando só um cliente tem esse nome
            if (!fi.cust) { const n = norm($('mcCust').value).trim(), same = n ? fi.list.filter(c => norm(c.name).trim() === n) : []; if (same.length === 1) { fi.cust = same[0]; $('mcCust').value = same[0].name; } }
            paintCust(); paint();
        };
        let busy = false;
        const paint = () => {
            if (busy) return;
            const c = calc(), paid = r2(pays.reduce((s, p) => s + p.amount, 0)), cashIn = pays.filter(p => p.method === 'dinheiro').reduce((s, p) => s + p.amount, 0);
            $('mcSum').innerHTML = `<div class="mes-row"><span>Itens</span><b>${money(c.sub)}</b></div>${cfg.servicePct > 0 ? `<div class="mes-row"><label><input type="checkbox" id="mcSvc"${svcOn ? ' checked' : ''}> Taxa de serviço (${String(cfg.servicePct).replace('.', ',')}%)</label><b>${money(c.svc)}</b></div>` : ''}
<div class="mes-row"><span>Desconto (R$)</span><input class="form-input" id="mcDisc" inputmode="decimal" style="width:110px;text-align:right" value="${c.disc ? String(c.disc).replace('.', ',') : ''}" placeholder="0,00"></div>
<div class="mes-row big"><span>Total</span><b>${money(c.total)}</b></div>${Number(t.people || 0) > 1 ? `<div class="mes-row"><span>Dividido por ${t.people}</span><b>${money(c.total / Number(t.people))} cada</b></div>` : ''}`;
            $('mcPays').innerHTML = pays.map((p, i) => p.locked ? `<div class="mes-pay locked"><span><i class="fas ${PAY[p.method][1]}" style="color:${PAY[p.method][2]}"></i>${PAY[p.method][0]} <small>pago antes${p.payer ? ' · ' + esc(p.payer) : ''}</small></span><b style="margin-left:auto">${money(p.amount)}</b><span style="width:28px"></span></div>` : `<div class="mes-pay" data-i="${i}"><span><i class="fas ${PM[p.method][1]}" style="color:${PM[p.method][2]}"></i>${PM[p.method][0]}</span><input class="form-input" data-amt="${i}" inputmode="decimal" value="${String(p.amount.toFixed(2)).replace('.', ',')}"><button type="button" data-rm="${i}" title="Remover"><i class="fas fa-xmark"></i></button></div>`).join('') || '<div style="font-size:12.5px;color:var(--text-muted);text-align:center">Toque na forma de pagamento. Dá para combinar várias (ex.: parte no PIX, parte em dinheiro).</div>';
            const left = r2(c.total - paid), el = $('mcLeft');
            if (!pays.length) { el.className = 'mes-left'; el.textContent = ''; }
            else if (left > 0.004) { el.className = 'mes-left due'; el.textContent = 'Falta receber ' + money(left); }
            else if (left < -0.004) { el.className = 'mes-left ok'; el.textContent = cashIn >= -left ? 'Troco: ' + money(-left) : 'Valor maior que o total: ajuste os pagamentos'; }
            const fiAmt = r2(pays.filter(p => p.method === 'fiado').reduce((s, p) => s + p.amount, 0)), hasFi = pays.some(p => p.method === 'fiado');
            if (pays.length && Math.abs(left) <= 0.004) { el.className = 'mes-left ok'; el.textContent = fiAmt > 0 ? '✓ ' + money(fiAmt) + ' vai para o fiado' : '✓ Conta paga'; }
            if (fiOn && hasFi !== fi.shown) {
                fi.shown = hasFi; $('mcFi').hidden = !hasFi; $('mcFiC').hidden = !hasFi;
                $('mcCustT').textContent = hasFi ? 'Cliente do fiado (obrigatório)' : 'Cliente (opcional)';
                $('mcCust').placeholder = hasFi ? 'Nome ou telefone do cliente' : 'Nome para o cupom e o relatório';
                if (hasFi) { loadFiCust(); paintCust(); }
            }
            $('mdOk').disabled = !pays.length || left > 0.004 || (left < -0.004 && cashIn < -left) || (hasFi && (!fi.cust || !fi.due));
            $('mdOk').innerHTML = okTxt(fiAmt > 0);
        };
        ov.addEventListener('change', e => {
            if (e.target.id === 'mcSvc') { svcOn = e.target.checked; repay(); paint(); }
            if (e.target.id === 'mcDisc') { disc = Math.max(0, r2(num(e.target.value))); repay(); paint(); }
            if (e.target.dataset.amt !== undefined) { pays[Number(e.target.dataset.amt)].amount = Math.max(0, r2(num(e.target.value))); paint(); }
            if (e.target.id === 'mcDue') { fi.due = e.target.value; paint(); }
        });
        ov.addEventListener('input', e => {
            if (e.target.id !== 'mcCust' || !fi.shown) return;
            if (fi.cust && e.target.value.trim() !== fi.cust.name) { fi.cust = null; paint(); }
            paintCust();
        });
        ov.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.target.id === 'mcNewNm' || e.target.id === 'mcNewPh')) { e.preventDefault(); ov.querySelector('[data-cns]')?.click(); } });
        async function saveNewCust(b) {
            const name = $('mcNewNm').value.trim(), ph = $('mcNewPh').value.trim(), dg = ph.replace(/\D/g, '');
            if (!name) { toast('warning', 'Digite o nome do cliente.'); $('mcNewNm').focus(); return; }
            if (dg && dg.length < 10) { toast('warning', 'Digite o WhatsApp com DDD (ex.: 62 99999-9999).'); $('mcNewPh').focus(); return; }
            b.disabled = true;
            try {
                const ref = await db.collection('customers').add({ name, phone: ph, whatsapp: ph, status: 'active', type: 'PF', source: 'mesas', totalPurchases: 0, purchaseCount: 0, deleted: false, createdAt: ts(), updatedAt: ts() });
                const c = { id: ref.id, name, phone: ph };
                (fi.list || (fi.list = [])).push(c); fi.cust = c; fi.novo = false; $('mcCust').value = name;
                toast('success', name + ' cadastrado');
                paintCust(); paint();
            } catch (err) { b.disabled = false; toast('error', 'Não foi possível cadastrar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        }
        ov.addEventListener('click', e => {
            const cu = e.target.closest('[data-cu]');
            if (cu) { fi.cust = (fi.list || []).find(c => c.id === cu.dataset.cu) || null; if (fi.cust) $('mcCust').value = fi.cust.name; paintCust(); paint(); return; }
            if (e.target.closest('[data-cx]')) { fi.cust = null; $('mcCust').value = ''; paintCust(); paint(); $('mcCust').focus(); return; }
            if (e.target.closest('[data-cn]')) { fi.novo = true; paintCust(); const f = $('mcNewNm').value ? $('mcNewPh') : $('mcNewNm'); f && f.focus(); return; }
            if (e.target.closest('[data-cnx]')) { fi.novo = false; paintCust(); return; }
            const cs = e.target.closest('[data-cns]'); if (cs) { saveNewCust(cs); return; }
            const du = e.target.closest('[data-due]');
            if (du) { fi.due = dayKey(new Date(Date.now() + Number(du.dataset.due) * 864e5)); $('mcDue').value = fi.due; paint(); }
        });
        // Com um pagamento só, ele acompanha o total quando a taxa ou o desconto mudam
        const repay = () => { const free = pays.filter(p => !p.locked), lockedSum = r2(pays.filter(p => p.locked).reduce((s, p) => s + p.amount, 0)); if (free.length === 1 && free[0].method !== 'dinheiro') free[0].amount = Math.max(0, r2(calc().total - lockedSum)); };
        ov.addEventListener('click', e => {
            const m = e.target.closest('[data-m]');
            if (m) { const c = calc(), left = r2(c.total - pays.reduce((s, p) => s + p.amount, 0)); pays.push({ method: m.dataset.m, amount: left > 0 ? left : 0 }); paint(); const inp = ov.querySelector(`[data-amt="${pays.length - 1}"]`); if (inp) { inp.focus(); inp.select(); } return; }
            const rm = e.target.closest('[data-rm]'); if (rm && !(pays[Number(rm.dataset.rm)] || {}).locked) { pays.splice(Number(rm.dataset.rm), 1); paint(); }
        });
        $('mdCancel').onclick = closeDialog;
        $('mdOk').onclick = async () => {
            const c = calc(), paid = r2(pays.reduce((s, p) => s + p.amount, 0)), change = r2(Math.max(0, paid - c.total));
            const hasFi = pays.some(p => p.method === 'fiado' && p.amount > 0);
            if (hasFi && (!fi.cust || !fi.due)) { toast('warning', 'Escolha o cliente e o vencimento do fiado.'); return; }
            const fiado = hasFi ? { cust: fi.cust, due: fi.due } : null;
            const wantPrint = $('mcPrint').checked; try { localStorage.setItem('dp_mesas_print', wantPrint ? '1' : '0'); } catch (e) { }
            const w = wantPrint ? openPrint() : null;
            busy = true; $('mdOk').disabled = true; $('mdOk').innerHTML = '<i class="fas fa-spinner fa-spin"></i> Fechando...';
            try {
                const done = await finishTab(t, c, pays.map(p => ({ ...p })), change, fiado ? fiado.cust.name : $('mcCust').value.trim(), svcOn, w, fiado);
                closeDialog();
                if (fiado && done) fiadoDone(done, fiado);
            } catch (err) { busy = false; w && w.close(); $('mdOk').disabled = false; $('mdOk').innerHTML = okTxt(hasFi); toast('error', 'Não foi possível fechar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        };
        paint();
    }
    // 40.91 · Depois de lançar no fiado: comprovante pelo WhatsApp do cliente (o número digitado fica no cadastro dele)
    async function openBalance(customerId) {
        try {
            const s = await db.collection('financial_entries').where('customerId', '==', customerId).get();
            return r2(s.docs.map(d => d.data() || {}).filter(e => e.type === 'income' && e.status === 'pending' && e.deleted !== true).reduce((a, e) => a + Number(e.amount || 0), 0));
        } catch (e) { return 0; }
    }
    function fiadoText(co, d, fi, open) {
        const tt = d.tt, now = d.payments.filter(p => p.method !== 'fiado'), fiAmt = r2(d.payments.filter(p => p.method === 'fiado').reduce((s, p) => s + p.amount, 0));
        return [`*${co.name}*`, `Comprovante · ${d.label} · Venda #V-${String(d.saleNumber || 0).padStart(4, '0')}`, new Date(d.when).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), '',
            ...d.items.map(i => `• ${fmtQty(i.quantity, i.unit)} x ${i.productName} — ${money(i.total)}${extraTxt(i) ? '\n   ' + extraTxt(i) : ''}`), '',
            tt.svc ? `Serviço ${String(cfg.servicePct).replace('.', ',')}%: ${money(tt.svc)}` : '', tt.disc ? `Desconto: - ${money(tt.disc)}` : '',
            `*Total: ${money(tt.total)}*`, now.length ? `Pago agora: ${now.map(p => payLbl(p.method) + ' ' + money(p.amount)).join(' + ')}` : '',
            `*Fiado na conta de ${fi.cust.name}: ${money(fiAmt)}*`, `Vencimento: ${brD(fi.due)}`,
            open > fiAmt + 0.004 ? `Total em aberto na sua conta: ${money(open)}` : '', '', 'Obrigado pela preferência!'].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
    }
    function fiadoDone(d, fi) {
        const c = fi.cust, fiAmt = r2(d.payments.filter(p => p.method === 'fiado').reduce((s, p) => s + p.amount, 0));
        let open = 0; const coP = company();
        dialog('<i class="fas fa-handshake" style="color:#f59e0b"></i> Lançado no fiado', `${esc(d.label)} · Venda #V-${String(d.saleNumber || 0).padStart(4, '0')}`,
            `<div class="mes-sum"><div class="mes-row"><span>Conta de</span><b>${esc(c.name)}</b></div><div class="mes-row"><span>No fiado</span><b>${money(fiAmt)}</b></div><div class="mes-row"><span>Vencimento</span><b>${brD(fi.due)}</b></div><div class="mes-row" id="mfOpen" style="display:none"><span>Total em aberto na conta</span><b></b></div></div>
<label class="f">WhatsApp do cliente<input class="form-input" id="mfPh" inputmode="tel" maxlength="20" value="${esc(fmtPhone(c.phone))}" placeholder="(00) 00000-0000"></label>
${c.phone ? '' : '<div class="mes-fi-msg">O número fica salvo no cadastro do cliente para a próxima vez.</div>'}`,
            `<button class="btn btn-outline" id="mdCancel">Fechar</button><button class="btn" id="mdOk" style="background:#25d366;border-color:#25d366;color:#fff"><i class="fab fa-whatsapp"></i> Enviar comprovante</button>`);
        $('mdCancel').onclick = closeDialog;
        openBalance(c.id).then(v => { open = v; const r = $('mfOpen'); if (r && v > fiAmt + 0.004) { r.style.display = ''; r.querySelector('b').textContent = money(v); } });
        $('mfPh').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('mdOk').click(); } });
        $('mdOk').onclick = async () => {
            const ph = $('mfPh').value.trim(), dg = ph.replace(/\D/g, '');
            if (dg.length < 10) { toast('warning', 'Digite o WhatsApp do cliente com DDD.'); $('mfPh').focus(); return; }
            const txt = fiadoText(await coP, d, fi, open);
            window.open(`https://wa.me/${waPhone(dg)}?text=${encodeURIComponent(txt)}`, '_blank');
            closeDialog();
            if (!c.phone) { c.phone = ph; db.collection('customers').doc(c.id).set({ phone: ph, whatsapp: ph, updatedAt: ts() }, { merge: true }).catch(e => console.warn('WhatsApp do cliente não salvo', e)); }
        };
        setTimeout(() => { const i = $('mfPh'); if (i && !i.value) i.focus(); }, 60);
    }
    // fi (40.91): { cust: {id, name, phone}, due: 'aaaa-mm-dd' } quando parte da conta vai para o fiado
    async function finishTab(t0, c, pays, change, customer, svcOn, w, fi) {
        // Lê a versão mais recente (outro garçom pode ter lançado algo)
        const fresh = await mutate(t0.id, () => ({ serviceOn: svcOn, discount: c.disc }));
        const tt = totals(fresh), shown = pays.map(p => ({ ...p }));
        if (Math.abs(tt.total - c.total) > 0.009) throw new Error(`A conta mudou para ${money(tt.total)} (lançaram itens em outro aparelho). Confira e receba de novo.`);
        await loadCash(); await loadFees();
        // Troco sai do dinheiro
        let rest = change;
        for (const p of pays) if (p.method === 'dinheiro' && rest > 0) { const d = Math.min(rest, p.amount); p.amount = r2(p.amount - d); rest = r2(rest - d); }
        const payments = pays.filter(p => p.amount > 0).map(p => {
            const out = { method: p.method, amount: r2(p.amount), installments: 1, cardBrand: '' };
            if (['pix', 'debito', 'credito'].includes(p.method) && window.DPInstallmentFees) { const f = DPInstallmentFees.feeFor(fees, p.method, p.amount, 'outras', 1); out.feePercent = f.pct; out.feeValue = f.value; out.netAmount = r2(p.amount - f.value); }
            if (p.method === 'fiado' && fi) { out.dueDate = fi.due; out.netAmount = out.amount; }
            return out;
        });
        if (payments.some(p => p.method === 'fiado') && !(fi && fi.cust && fi.cust.id)) throw new Error('Escolha o cliente do fiado.');
        const feeTotal = r2(payments.reduce((s, p) => s + Number(p.feeValue || 0), 0));
        const waiter = users.find(u => u.id === fresh.waiterId);
        const label = fresh.label || (fresh.tableNumber ? 'Mesa ' + fresh.tableNumber : 'Comanda');
        const saleData = {
            items: (fresh.items || []).map(i => ({ productId: i.productId || '', productName: i.productName, productCode: i.productCode || '', unitPrice: r2(i.unitPrice), originalUnitPrice: r2(i.unitPrice), priceChanged: false, notes: i.notes || '', ...(window.DPAddons ? DPAddons.saleFields(i) : {}), _factor: 1, costPrice: r2(i.costPrice || 0), quantity: Number(i.quantity), discount: 0, total: r2(i.total) })),
            subtotal: tt.sub, discount: tt.disc, deliveryFee: 0, serviceFee: tt.svc, serviceFeePercent: tt.svc ? cfg.servicePct : 0, total: tt.total,
            payments, paymentMethod: payments.length > 1 ? 'multi' : (payments[0] ? payments[0].method : 'dinheiro'),
            paymentFeePercent: payments.length === 1 ? Number(payments[0].feePercent || 0) : 0, paymentFeeValue: feeTotal, paymentNetAmount: r2(tt.total - feeTotal), cardBrand: '',
            changeAmount: change, customerName: customer ? `${label} · ${customer}` : label, customerId: fi ? fi.cust.id : null,
            sellerId: waiter ? waiter.id : (fresh.waiterId || uid()), sellerName: fresh.waiterName || uname(),
            notes: [label, Number(fresh.people || 0) ? fresh.people + ' pessoa(s)' : '', 'aberta ' + hhmm(fresh.openedAt)].filter(Boolean).join(' · '),
            type: 'balcao', channel: 'mesa', tableNumber: fresh.tableNumber || null, tableLabel: label, tabId: fresh.id, people: Number(fresh.people || 0),
            status: 'completed', address: '', addressRef: '', motoboyId: '', motoboyName: '',
            cashRegisterId: cash ? cash.id : null, operatorId: uid(), operatorName: uname(), itemCount: tt.qty
        };
        const result = await SalesService.create(saleData);
        const now = Date.now();
        await db.collection(COL).doc(fresh.id).set({ status: 'closed', closedAt: now, closedDay: dayKey(), closedBy: uname(), saleId: result.id, saleNumber: result.saleNumber, subtotal: tt.sub, serviceFee: tt.svc, discount: tt.disc, total: tt.total, payments, changeAmount: change, customerName: customer || fresh.customerName || '', ...(fi ? { customerId: fi.cust.id, fiadoDue: fi.due } : {}), updatedAtMs: now, updatedAt: ts() }, { merge: true });
        tabs = tabs.filter(x => x.id !== fresh.id);
        closedToday.unshift({ ...fresh, status: 'closed', closedAt: now, total: tt.total, payments, saleNumber: result.saleNumber, changeAmount: change, customerName: customer || fresh.customerName || '' });
        // Fiado no cupom: de quem é a conta, o vencimento e a linha para o cliente assinar
        const fiTxt = fi ? `<div class="sep"></div><div class="row"><span>Fiado na conta de</span><span>${esc(fi.cust.name)}</span></div><div class="row"><span>Vencimento</span><span>${brD(fi.due)}</span></div><div class="c" style="margin-top:9mm">________________________________<br>${esc(fi.cust.name)}</div>` : '';
        if (w) writePrint(w, 'Conta ' + label, billHtml(await company(), fresh, tt, { title: 'CONTA · V-' + String(result.saleNumber).padStart(4, '0'), after: `<div class="sep"></div>${shown.filter(p => p.amount > 0).map(p => `<div class="row"><span>${payLbl(p.method)}</span><span>${money(p.amount)}</span></div>`).join('')}${change ? `<div class="row"><span>Troco</span><span>${money(change)}</span></div>` : ''}${fiTxt}`, footer: 'Obrigado pela preferência!<br>Não é documento fiscal.' }));
        closePanel(); renderStats();
        toast('success', `${label} fechada · Venda #V-${String(result.saleNumber).padStart(4, '0')} · ${money(tt.total)}${fi ? ' · fiado de ' + fi.cust.name : ''}`);
        return { saleNumber: result.saleNumber, label, tt, items: fresh.items || [], payments, when: now };
    }

    /* ---------- histórico do dia ---------- */
    async function openHistory() {
        await loadClosedToday();
        const tot = closedToday.reduce((s, t) => s + Number(t.total || 0), 0);
        const rows = closedToday.map(t => `<tr><td>${hhmm(t.closedAt)}</td><td><b>${esc(t.label || '')}</b><br><small style="color:var(--text-muted)">${esc([t.waiterName, t.customerName].filter(Boolean).join(' · '))}</small></td><td>${(t.payments || []).map(p => payLbl(p.method)).join(' + ')}</td><td class="r"><b>${money(t.total)}</b><br><small style="color:var(--text-muted)">V-${String(t.saleNumber || 0).padStart(4, '0')}</small></td><td class="r"><button class="btn btn-outline btn-sm" data-rp="${esc(t.id)}" title="Imprimir de novo"><i class="fas fa-print"></i></button></td></tr>`).join('');
        const ov = dialog('<i class="fas fa-clock-rotate-left" style="color:var(--accent)"></i> Contas fechadas hoje', `${closedToday.length} conta(s) · ${money(tot)}`,
            closedToday.length ? `<table class="mes-hist"><thead><tr><th>Hora</th><th>Mesa</th><th>Pagamento</th><th class="r">Total</th><th></th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="mes-noitems"><i class="fas fa-mug-hot"></i>Nenhuma conta fechada hoje ainda.</div>',
            `<button class="btn btn-outline" id="mdCancel">Fechar</button>`, true);
        $('mdCancel').onclick = closeDialog;
        ov.addEventListener('click', async e => {
            const b = e.target.closest('[data-rp]'); if (!b) return;
            const t = closedToday.find(x => x.id === b.dataset.rp); if (!t) return;
            const w = openPrint(), tt = { sub: Number(t.subtotal || totals(t).sub), svc: Number(t.serviceFee || 0), disc: Number(t.discount || 0), total: Number(t.total || 0) };
            writePrint(w, 'Conta ' + (t.label || ''), billHtml(await company(), t, tt, { title: 'CONTA · V-' + String(t.saleNumber || 0).padStart(4, '0') + ' (2ª via)', after: `<div class="sep"></div>${(t.payments || []).map(p => `<div class="row"><span>${payLbl(p.method)}</span><span>${money(p.amount)}</span></div>`).join('')}${t.changeAmount ? `<div class="row"><span>Troco</span><span>${money(t.changeAmount)}</span></div>` : ''}`, footer: 'Não é documento fiscal.' }));
        });
    }

    /* ---------- módulo desligado ---------- */
    function renderDisabled() {
        $('mesRoot').innerHTML = `<div class="card" style="padding:40px 20px;text-align:center;max-width:620px;margin:30px auto"><div style="font-size:40px;color:var(--accent);display:flex;justify-content:center"><i class="fas fa-utensils"></i></div><h2 style="margin:10px 0 6px;color:var(--text-heading)">Mesas está desligado</h2>
<p style="color:var(--text-muted);margin:0 0 18px">Esta função é para bares, restaurantes e lanchonetes. Ligue em <b>Configurações › Empresa</b> para usar a abertura de mesas e comandas.</p><a class="btn btn-primary" href="configuracoes.html"><i class="fas fa-gear"></i> Ir para Configurações</a></div>`;
    }

    /* ---------- demonstração: algumas mesas já ocupadas ---------- */
    async function seedDemo() {
        if (!db.__isLocalDemo || !demoRestaurant(null) || !products.length) return;
        try { const s = await db.collection(COL).limit(1).get(); if (!s.empty) return; } catch (e) { return; }
        const pick = (re, n) => products.filter(p => re.test(norm(p.name + ' ' + p._cat))).slice(0, n);
        const food = pick(/prato|parmeg|burg|x-|batata|porcao|lanche/, 4), drink = pick(/refri|suco|agua|cerveja|bebida|coca|guarana/, 3);
        const line = (p, q, sent, notes) => ({ key: keyNew() + Math.random().toString(36).slice(2, 5), productId: p.id, productName: p.name, productCode: p.code || '', unit: p.unit || 'un', unitPrice: r2(p._price), costPrice: r2(p.costPrice || 0), quantity: q, total: r2(q * p._price), notes: notes || '', sent, sentAt: sent ? Date.now() - 18 * 60000 : null, addedAt: Date.now() - 25 * 60000, addedBy: 'Demonstração' });
        const me = { waiterId: uid(), waiterName: uname() };
        const mk = (n, ppl, mins, items, extra) => ({ status: 'open', tableNumber: n, label: 'Mesa ' + n, people: ppl, ...me, customerName: '', items, serviceOn: cfg.servicePct > 0, discount: 0, billRequested: false, openedAt: Date.now() - mins * 60000, openedBy: uid(), openedByName: uname(), updatedAtMs: Date.now(), deleted: false, createdAt: ts(), updatedAt: ts(), ...(extra || {}) });
        const list = [];
        if (food[0]) list.push(mk(2, 2, 34, [line(food[0], 2, true, 'um sem cebola'), ...(drink[0] ? [line(drink[0], 2, true)] : [])]));
        if (food[1]) list.push(mk(5, 4, 12, [line(food[1], 3, true), ...(food[2] ? [line(food[2], 1, false, 'bem passado')] : []), ...(drink[1] ? [line(drink[1], 4, false)] : [])]));
        if (food[3] || food[0]) list.push(mk(7, 3, 68, [line(food[3] || food[0], 2, true), ...(drink[2] ? [line(drink[2], 3, true)] : [])], { billRequested: true, billRequestedAt: Date.now() - 4 * 60000 }));
        for (const d of list) { try { await db.collection(COL).add(d); } catch (e) { } }
    }

    /* ---------- atualização automática (vários aparelhos) ---------- */
    async function refresh(force) {
        try { await reloadTabs(); } catch (e) { return; }
        renderGrid();
        if (!openId) return;
        const t = tabOf(openId);
        if (!t) { closePanel(); toast('info', 'Esta mesa foi fechada em outro aparelho.'); return; }
        const typing = document.activeElement && $('mesPanel')?.contains(document.activeElement) && /INPUT|TEXTAREA/.test(document.activeElement.tagName);
        if (force || (!typing && t.updatedAtMs !== panelStamp)) renderPanel();
    }
    function startPolling() {
        clearInterval(pollT);
        pollT = setInterval(() => { if (document.hidden || $('mesDlg')) return; queue(() => refresh(false)); }, 8000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) queue(() => refresh(false)); });
        document.addEventListener('keydown', e => { if (e.key !== 'Escape') return; if ($('mesDlg')) closeDialog(); else if (openId) closePanel(); });
        setInterval(() => { if (!$('mesDlg')) { renderGrid(); if (openId && $('mpSub')) renderPanel(); } }, 60000);
    }

    async function boot() {
        if (booted) return; booted = true;
        patchStock();
        $('mesRoot').innerHTML = '<div style="padding:60px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Carregando mesas...</div>';
        await loadCfg(); syncMenu();
        // 35.59 · No Mensal, Mesas também é um módulo (vem liberado para todos; o Admin pode mudar).
        if (window.DPModules && !DPModules.has('mesas') && window.DPModuleGate) { booted = false; DPModuleGate('mesas', $('mesRoot')); return; }
        if (!cfg.enabled) { renderDisabled(); return; }
        shell();
        try {
            await Promise.all([loadCatalog(), loadUsers(), loadCash(), loadFees()]);
            await seedDemo();
            await reloadTabs();
            renderGrid(); loadClosedToday(); startPolling();
            const n = Number(new URLSearchParams(location.search).get('mesa') || 0);
            if (n) { const t = tabs.find(x => x.tableNumber === n); if (t) openPanel(t.id); else openTableDialog(n); }
        } catch (e) { console.error(e); $('mesGrid').innerHTML = `<div class="mes-empty"><i class="fas fa-triangle-exclamation"></i>Não foi possível carregar as mesas: ${esc(e.message)}</div>`; }
    }
    window.initPage = boot;
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 700); }); } catch (e) { }
})();
