/* DistribuiPro 35.0 · PDV flexível.
   - Quantidade digitada e fracionada (2,5 m de cabo, 1,250 kg), tocando no número do item.
   - Produtos vendidos por metro/kg/litro já perguntam a quantidade ao entrar no carrinho.
   - Serviços (sem controle de estoque) podem ser vendidos mesmo com estoque zerado.
   - Recebe um orçamento aprovado (aba Orçamentos → "Vender no PDV") e marca o orçamento como vendido.
   Só acrescenta: o cálculo e o registro da venda continuam sendo os da página. */

/* 35.37 · "Nova venda" na ficha do cliente (Clientes) abre o PDV com o cliente já escolhido */
(function () {
    let c = null;
    try { c = JSON.parse(sessionStorage.getItem('dp_pdv_customer') || 'null'); sessionStorage.removeItem('dp_pdv_customer'); } catch (e) { }
    if (!c || !c.id) return;
    let n = 0;
    const t = setInterval(() => {
        n++;
        let ready = false; try { ready = Array.isArray(allPdvCustomers) && allPdvCustomers.length > 0; } catch (e) { }
        if (!ready && n < 40) return;
        clearInterval(t);
        try { if (typeof selectCustomer === 'function') { selectCustomer(c.id, c.name || 'Cliente', c.phone || ''); Toast.info('Venda para ' + String(c.name || 'o cliente').replace(/[<>&]/g, '')); } } catch (e) { }
    }, 250);
})();

(function () {
    'use strict';
    const C = window.DPCatalog;
    if (!C || typeof window.renderCart !== 'function') return;
    const QKEY = 'dp_quote_to_pdv';
    const getCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
    const getProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
    const byId = id => getProducts().find(p => p.id === id);
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    // 36.9 · Também é serviço o produto da categoria "Serviço(s)" (cadastros antigos não tinham o tipo marcado)
    const noStock = p => !!p && !p.isGradeParent && (p.productType === 'service' || p.controlStock === false || C.norm(p.unit) === 'serv' || /^servi[cç]os?\b/i.test(String(p.category || '').trim())); // 38.6 · pai da grade não é serviço (o estoque está nos tamanhos)
    window.dpIsServiceProduct = noStock;
    // Versão MySQL não tem o objeto "firebase": usa DPFieldValue
    const serverTs = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const money = v => (window.Utils && Utils.currency) ? Utils.currency(v) : (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

    const st = document.createElement('style');
    st.textContent = `.dpq-qty{cursor:pointer;border-bottom:1px dashed currentColor;padding:0 2px}.dpq-qty small{font-size:9px;font-weight:600;opacity:.7;margin-left:2px}
#dpqOverlay{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px}
#dpqOverlay .dpq-box{background:var(--bg-card);border-radius:16px;padding:20px;width:100%;max-width:340px;box-shadow:var(--shadow-xl,0 20px 50px rgba(0,0,0,.35))}
#dpqOverlay h4{margin:0 0 4px;font-size:15px;color:var(--text-heading)}#dpqOverlay p{margin:0 0 12px;font-size:12px;color:var(--text-muted)}
#dpqOverlay .dpq-in{display:flex;align-items:center;gap:8px}#dpqOverlay input{font-size:22px;font-weight:800;text-align:center;flex:1}
#dpqOverlay .dpq-u{font-weight:800;color:var(--accent);min-width:34px}#dpqOverlay .dpq-tot{margin-top:10px;font-size:13px;color:var(--text-secondary)}
#dpqOverlay .dpq-tot b{color:var(--success)}#dpqOverlay .dpq-act{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.dpq-banner{display:flex;align-items:center;gap:10px;background:rgba(99,102,241,.12);border:1px solid rgba(99,102,241,.35);color:var(--text-primary);border-radius:10px;padding:8px 12px;margin:0 0 10px;font-size:12px}
.dpq-banner b{color:var(--accent)}.dpq-banner button{margin-left:auto;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:12px}`;
    document.head.appendChild(st);

    /* ---------- Quantidade digitada ---------- */
    function askQty(index, isNew) {
        const item = getCart()[index]; if (!item) return;
        const p = byId(item.productId);
        const u = C.unit(p ? p.unit : (item._unit || 'un'));
        const factor = Number(item._factor || 1);
        const frac = u.frac && factor === 1;
        document.getElementById('dpqOverlay')?.remove();
        const ov = document.createElement('div'); ov.id = 'dpqOverlay';
        ov.innerHTML = `<div class="dpq-box"><h4>${esc(item.productName)}</h4><p>${frac ? 'Digite a quantidade (aceita fração, ex.: 2,5)' : 'Digite a quantidade'}</p>
            <div class="dpq-in"><input type="text" inputmode="decimal" class="form-control" id="dpqInput" value="${C.fmtQty(item.quantity, frac ? u.value : 'un')}"><span class="dpq-u">${esc(item._pkgLabel || u.abbr)}</span></div>
            <div class="dpq-tot">Total do item: <b id="dpqTot">${money(item.total)}</b> · ${money(item.unitPrice)} por ${esc(item._pkgLabel || u.abbr)}</div>
            <div class="dpq-act"><button type="button" class="btn btn-secondary" id="dpqCancel">${isNew ? 'Manter 1' : 'Cancelar'}</button><button type="button" class="btn btn-primary" id="dpqOk"><i class="fas fa-check"></i> Confirmar</button></div></div>`;
        document.body.appendChild(ov);
        const inp = ov.querySelector('#dpqInput');
        const read = () => { let q = C.parseQty(inp.value); if (!frac) q = Math.round(q); return Math.round(q * 1000) / 1000; };
        inp.addEventListener('input', () => { ov.querySelector('#dpqTot').textContent = money(r2(read() * item.unitPrice)); });
        const close = () => ov.remove();
        const ok = () => {
            const q = read();
            if (!(q > 0)) { window.Toast?.warning?.('Informe uma quantidade maior que zero'); return; }
            if (p && !noStock(p) && !window.DP_VENDA_SEM_ESTOQUE) { // 39.2 · "Permitir venda sem estoque" (Configurações › Vendas)
                const others = getCart().filter((c, i) => i !== index && c.productId === item.productId).reduce((s, c) => s + c.quantity * (c._factor || 1), 0);
                if (q * factor + others > Number(p.currentStock || 0) + 1e-9) { window.Toast?.warning?.(`Estoque insuficiente: há ${C.fmtQty(p.currentStock, u.value)} ${u.abbr}`); return; }
            }
            item.quantity = q; item.total = r2(q * item.unitPrice);
            close(); renderCart();
        };
        ov.querySelector('#dpqOk').onclick = ok;
        ov.querySelector('#dpqCancel').onclick = close;
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } if (e.key === 'Escape') close(); });
        setTimeout(() => { inp.focus(); inp.select(); }, 30);
    }
    window.dpAskQty = askQty;

    // Serviço vende sem estoque: durante a ação a página "enxerga" estoque livre.
    function withFreeStock(product, fn) {
        if (!noStock(product)) return fn();
        const old = product.currentStock;
        product.currentStock = 1e9;
        try { return fn(); } finally { product.currentStock = old; }
    }

    const origAdd = window.addToCartWithPkg;
    window.addToCartWithPkg = function (product, pkgIndex) {
        const before = getCart().length;
        const r = withFreeStock(product, () => origAdd.apply(this, arguments));
        try {
            const c = getCart();
            if (product && c.length > before && C.isFrac(product.unit) && Number(c[c.length - 1]._factor || 1) === 1) askQty(c.length - 1, true);
        } catch (e) { }
        return r;
    };
    const origUpd = window.updateQuantity;
    if (typeof origUpd === 'function') window.updateQuantity = function (index, delta) {
        const item = getCart()[index];
        const p = item && byId(item.productId);
        return withFreeStock(p, () => origUpd.apply(this, arguments));
    };
    const origShowPkg = window.showPackagingSelector;
    if (typeof origShowPkg === 'function') window.showPackagingSelector = function (product) {
        return withFreeStock(product, () => origShowPkg.apply(this, arguments));
    };

    /* ---------- Carrinho: unidade e número clicável ---------- */
    function decorateCart() {
        const rows = document.querySelectorAll('#cartItems .cart-item');
        const c = getCart();
        rows.forEach((row, i) => {
            const item = c[i]; if (!item) return;
            const p = byId(item.productId);
            const u = C.unit(p ? p.unit : (item._unit || 'un'));
            const lab = item._pkgLabel || u.abbr;
            const span = row.querySelector('.ci-qty span');
            if (span) {
                span.className = 'dpq-qty'; span.title = 'Toque para digitar a quantidade';
                span.innerHTML = `${C.fmtQty(item.quantity, u.value)}${u.value !== 'un' || item._pkgLabel ? `<small>${esc(lab)}</small>` : ''}`;
                span.onclick = () => askQty(i, false);
            }
            const price = row.querySelector('.ci-price span');
            if (price && /\/un\s*$/.test(price.textContent) && (u.value !== 'un' || item._pkgLabel)) price.textContent = price.textContent.replace(/\/un\s*$/, '/' + lab.toLowerCase());
        });
    }
    function decorateProducts() {
        document.querySelectorAll('#productsGrid .product-card').forEach(card => {
            const m = (card.getAttribute('onclick') || '').match(/addToCart\('([^']+)'\)/); if (!m) return;
            const p = byId(m[1]); if (!p) return;
            const stockEl = card.querySelector('.p-stock');
            if (noStock(p)) {
                card.style.opacity = ''; card.style.pointerEvents = ''; card.classList.remove('pdx-out');
                if (stockEl) { stockEl.className = 'p-stock'; stockEl.innerHTML = '<i class="fas fa-screwdriver-wrench"></i> Serviço'; }
            } else if (stockEl && C.norm(p.unit) !== 'un') {
                const u = C.unit(p.unit), s = Number(p.currentStock || 0);
                if (s > 0) stockEl.innerHTML = `<i class="fas ${u.frac ? 'fa-ruler' : 'fa-box'}"></i> ${C.fmtQty(s, u.value)} ${esc(u.abbr)}`;
            }
        });
    }
    const origRender = window.renderCart;
    window.renderCart = function () {
        getCart().forEach(i => { i.total = r2(i.total); });
        const r = origRender.apply(this, arguments);
        try { decorateCart(); decorateProducts(); } catch (e) { console.warn('pdv-flex', e); }
        return r;
    };
    const origRP = window.renderProducts;
    if (typeof origRP === 'function') window.renderProducts = function () {
        const r = origRP.apply(this, arguments);
        try { decorateProducts(); } catch (e) { }
        return r;
    };

    /* ---------- Baixa de estoque: serviço e item avulso não baixam ---------- */
    if (typeof StockService !== 'undefined' && StockService && typeof StockService.exit === 'function' && !StockService.__dpFlex) {
        StockService.__dpFlex = true;
        const origExit = StockService.exit;
        StockService.exit = async function (productId, quantity) {
            if (!productId) return 0;
            const p = byId(productId);
            if (noStock(p)) return Number(p.currentStock || 0);
            try { return await origExit.apply(this, arguments); }
            catch (e) { if (/não encontrado/i.test(e && e.message || '')) return 0; throw e; }
        };
    }

    /* ---------- Visualização dos produtos: grade (padrão) ou lista sem imagem ---------- */
    const VKEY = 'dp_pdv_view';
    const vcss = document.createElement('style');
    vcss.textContent = `.dpv-toggle{display:inline-flex;flex:0 0 auto;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;margin-left:8px;background:var(--bg-secondary)}
.dpv-toggle button{border:0;background:transparent;color:var(--text-muted);width:38px;height:36px;cursor:pointer;font-size:14px;display:flex;align-items:center;justify-content:center}
.dpv-toggle button:hover{color:var(--accent)}
.dpv-toggle button.on{background:var(--accent);color:#fff}
#productsGrid.dpv-list{display:flex!important;flex-direction:column!important;gap:5px!important;padding:6px!important}
#productsGrid.dpv-list .product-card{flex:0 0 auto!important;display:flex!important;flex-direction:row!important;align-items:center!important;width:auto!important;max-width:none!important;margin:0!important;padding:9px 14px!important;min-height:0!important;height:auto!important;border-radius:10px!important;gap:12px!important}
#productsGrid.dpv-list .product-card:hover{transform:none!important}
#productsGrid.dpv-list .product-card .p-thumb{display:none!important}
#productsGrid.dpv-list .product-card .p-info{display:flex!important;flex-direction:row!important;align-items:center!important;gap:14px!important;flex:1 1 auto!important;min-width:0!important;min-height:0!important;height:auto!important;padding:0!important;margin:0!important}
#productsGrid.dpv-list .product-card .p-name{flex:1 1 auto!important;min-width:0!important;min-height:0!important;display:block!important;-webkit-line-clamp:unset!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important;font-size:13.5px!important;margin:0!important}
#productsGrid.dpv-list .product-card .p-code{flex:0 0 140px!important;margin:0!important;font-size:11px!important;white-space:nowrap!important;overflow:hidden!important;text-overflow:ellipsis!important}
#productsGrid.dpv-list .product-card .p-meta-row{display:flex!important;flex:0 0 auto!important;align-items:center!important;gap:14px!important;margin:0!important;padding:0!important;border:0!important}
#productsGrid.dpv-list .product-card .p-stock{min-width:92px!important;max-width:none!important;justify-content:center!important;margin:0!important}
#productsGrid.dpv-list .product-card .p-price{min-width:100px!important;text-align:right!important;font-size:15.5px!important;margin:0!important}
#productsGrid.dpv-list .product-card .pdx-qty{top:50%!important;left:-4px!important;right:auto!important;transform:translateY(-50%)!important}
@media(max-width:760px){#productsGrid.dpv-list .product-card .p-code{display:none!important}#productsGrid.dpv-list .product-card{padding:9px 10px!important}#productsGrid.dpv-list .product-card .p-stock{min-width:0!important}#productsGrid.dpv-list .product-card .p-price{min-width:0!important}.dpv-toggle button{width:34px;height:34px}}`;
    document.head.appendChild(vcss);
    function getView() { try { return localStorage.getItem(VKEY) === 'list' ? 'list' : 'grid'; } catch (e) { return 'grid'; } }
    function setView(v) {
        try { localStorage.setItem(VKEY, v); } catch (e) { }
        document.getElementById('productsGrid')?.classList.toggle('dpv-list', v === 'list');
        document.querySelectorAll('.dpv-toggle button').forEach(b => b.classList.toggle('on', b.dataset.v === v));
    }
    (function mountViewToggle() {
        const head = document.querySelector('.pdv-header');
        if (!head || head.querySelector('.dpv-toggle')) return;
        const t = document.createElement('div'); t.className = 'dpv-toggle'; t.setAttribute('role', 'group'); t.setAttribute('aria-label', 'Visualização dos produtos');
        t.innerHTML = '<button type="button" data-v="grid" title="Ver em grade (com imagens)"><i class="fas fa-table-cells-large"></i></button><button type="button" data-v="list" title="Ver em lista (sem imagens)"><i class="fas fa-list"></i></button>';
        t.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (b) setView(b.dataset.v); });
        head.appendChild(t);
        setView(getView());
    })();

    /* ---------- Impressão do cupom não pode travar a venda ----------
       Com pop-up bloqueado, printReceipt quebrava DEPOIS de gravar a venda: aparecia "Erro ao finalizar venda"
       e o carrinho não era limpo (risco de vender duas vezes). Agora só avisa e a venda termina normalmente. */
    const oPrint = window.printReceipt;
    if (typeof oPrint === 'function') window.printReceipt = function () {
        const warn = e => { console.warn('Impressão do cupom:', e); window.Toast?.warning?.('Venda registrada. O cupom não abriu: libere os pop-ups deste site no navegador para imprimir.'); };
        try { const r = oPrint.apply(this, arguments); if (r && typeof r.catch === 'function') return r.catch(warn); return r; }
        catch (e) { warn(e); }
    };

    /* ---------- Item avulso: vender serviço/produto sem cadastro (botão ou F6) ---------- */
    const acss = document.createElement('style');
    acss.textContent = `.dpa-btn{flex:0 0 auto;margin-left:8px;height:36px;border:1px solid var(--accent);background:rgba(99,102,241,.1);color:var(--accent);border-radius:10px;padding:0 12px;font-weight:700;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.dpa-btn:hover{background:var(--accent);color:#fff}
#dpaOverlay{position:fixed;inset:0;z-index:10030;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
#dpaOverlay .dpa-dlg{background:var(--bg-card);color:var(--text-primary);border-radius:16px;width:100%;max-width:460px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
#dpaOverlay h3{margin:0 0 4px;font-size:16px;color:var(--text-heading)}#dpaOverlay p.s{margin:0 0 14px;font-size:12px;color:var(--text-muted)}
#dpaOverlay .dpa-type{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px}
#dpaOverlay .dpa-type button{border:2px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);border-radius:12px;padding:10px;cursor:pointer;font-weight:700;font-size:13px}
#dpaOverlay .dpa-type button.on{border-color:var(--accent);background:rgba(99,102,241,.12)}
#dpaOverlay label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin:0 0 4px}
#dpaOverlay .dpa-g{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}
#dpaOverlay .dpa-tot{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-secondary);display:flex;justify-content:space-between;align-items:center;font-size:13px}
#dpaOverlay .dpa-tot b{font-size:18px;color:var(--success)}
#dpaOverlay .dpa-save{display:flex;align-items:flex-start;gap:8px;margin-top:12px;font-size:12px;color:var(--text-secondary);cursor:pointer}
#dpaOverlay .dpa-save input{margin-top:2px;accent-color:var(--accent)}
#dpaOverlay .dpa-act{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
@media(max-width:760px){.dpa-btn span{display:none}.dpa-btn{padding:0 10px}}`;
    document.head.appendChild(acss);

    function openAvulso(prefill) {
        document.getElementById('dpaOverlay')?.remove();
        let kind = 'service';
        const ov = document.createElement('div'); ov.id = 'dpaOverlay';
        ov.innerHTML = `<div class="dpa-dlg" role="dialog" aria-label="Item avulso"><h3><i class="fas fa-bolt" style="color:var(--accent);margin-right:6px"></i>Item avulso</h3>
<p class="s">Venda um serviço ou produto que não está cadastrado, digitando na hora.</p>
<div class="dpa-type"><button type="button" data-k="service" class="on"><i class="fas fa-screwdriver-wrench"></i> Serviço</button><button type="button" data-k="product"><i class="fas fa-box"></i> Produto</button></div>
<label>Descrição *</label><input type="text" class="form-input form-control" id="dpaName" placeholder="Ex.: Instalação de tomada, Conserto, Taxa de visita..." autocomplete="off">
<div class="dpa-g"><div><label>Valor (R$) *</label><input type="text" inputmode="decimal" class="form-input form-control" id="dpaPrice" placeholder="0,00"></div>
<div><label>Quantidade</label><input type="text" inputmode="decimal" class="form-input form-control" id="dpaQty" value="1"></div></div>
<div class="dpa-g"><div><label>Custo (opcional)</label><input type="text" inputmode="decimal" class="form-input form-control" id="dpaCost" placeholder="0,00" title="Para o relatório de lucro"></div><div></div></div>
<div class="dpa-tot"><span>Total do item</span><b id="dpaTotal">R$ 0,00</b></div>
<label class="dpa-save"><input type="checkbox" id="dpaSave"><span>Salvar no cadastro para vender de novo depois <small style="display:block;color:var(--text-muted)">Fica em Produtos com o tipo escolhido. Sem marcar, vale só para esta venda.</small></span></label>
<div class="dpa-act"><button type="button" class="btn btn-secondary" id="dpaCancel">Cancelar</button><button type="button" class="btn btn-primary" id="dpaOk"><i class="fas fa-cart-plus"></i> Adicionar ao carrinho</button></div></div>`;
        document.body.appendChild(ov);
        const $ = id => ov.querySelector('#' + id);
        if (prefill) $('dpaName').value = prefill;
        const total = () => r2(C.parseQty($('dpaPrice').value) * (C.parseQty($('dpaQty').value) || 0));
        const paint = () => { $('dpaTotal').textContent = money(total()); };
        ['dpaPrice', 'dpaQty'].forEach(id => $(id).addEventListener('input', paint));
        ov.querySelectorAll('.dpa-type button').forEach(b => b.addEventListener('click', () => { kind = b.dataset.k; ov.querySelectorAll('.dpa-type button').forEach(x => x.classList.toggle('on', x === b)); }));
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); close(); } if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'checkbox') { e.preventDefault(); e.stopPropagation(); add(); } };
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        $('dpaCancel').onclick = close;
        let busy = false;
        async function add() {
            if (busy) return;
            const name = $('dpaName').value.trim(), price = r2(C.parseQty($('dpaPrice').value)), qty = Math.round(C.parseQty($('dpaQty').value) * 1000) / 1000, cost = r2(C.parseQty($('dpaCost').value));
            if (!name) { window.Toast?.warning?.('Digite a descrição do item'); $('dpaName').focus(); return; }
            if (!(price > 0)) { window.Toast?.warning?.('Digite o valor do item'); $('dpaPrice').focus(); return; }
            if (!(qty > 0)) { window.Toast?.warning?.('Quantidade precisa ser maior que zero'); $('dpaQty').focus(); return; }
            busy = true; $('dpaOk').disabled = true;
            let pid = '', unit = kind === 'service' ? 'serv' : 'un';
            try {
                if ($('dpaSave').checked) pid = await saveToCatalog(name, price, cost, kind, unit);
            } catch (e) { window.Toast?.warning?.('Não foi possível salvar no cadastro: ' + e.message + '. O item entra só nesta venda.'); }
            getCart().push({
                _cartKey: 'avulso_' + Date.now(), _factor: 1, _pkgLabel: '', _unit: unit,
                productId: pid, productName: name, productCode: '', unitPrice: price, originalUnitPrice: price,
                notes: '', costPrice: cost, quantity: qty, discount: 0, total: r2(price * qty), isService: kind === 'service'
            });
            close(); renderCart();
            window.Toast?.success?.(kind === 'service' ? 'Serviço adicionado' : 'Item adicionado');
        }
        $('dpaOk').onclick = add;
        setTimeout(() => (prefill ? $('dpaPrice') : $('dpaName')).focus(), 30);
    }
    async function saveToCatalog(name, price, cost, kind, unit) {
        const catName = kind === 'service' ? 'Serviços' : 'Geral';
        try {
            const cats = (await db.collection('categories').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted);
            if (!cats.some(c => String(c.name || '').toLowerCase() === catName.toLowerCase())) await db.collection('categories').add({ name: catName, icon: kind === 'service' ? '🛠️' : '📦', color: '#6366f1', active: true, status: 'active', deleted: false, createdAt: serverTs(), updatedAt: serverTs() });
        } catch (e) { }
        const data = {
            name, code: '', barcode: '', unit, category: catName, brand: '', volume: '', costPrice: cost, salePrice: price, promoPrice: null,
            profitMargin: cost > 0 ? Number(((price - cost) / cost * 100).toFixed(1)) : 0, currentStock: 0, minStock: 0, stockLocation: '',
            supplierId: '', supplierName: '', packagings: [], status: 'active', active: true,
            productType: kind === 'service' ? 'service' : 'product', controlStock: kind !== 'service',
            description: 'Cadastrado pelo PDV (item avulso)', imageType: 'icon', icon: kind === 'service' ? '🛠️' : '📦', imageUrl: '', imageFile: '', deleted: false,
            createdAt: serverTs(), updatedAt: serverTs()
        };
        const ref = await db.collection('products').add(data);
        try { getProducts().push({ id: ref.id, ...data, currentStock: 0 }); renderProducts && renderProducts(); } catch (e) { }
        return ref.id;
    }
    window.dpOpenAvulso = openAvulso;
    (function mountAvulso() {
        const head = document.querySelector('.pdv-header');
        if (!head || head.querySelector('.dpa-btn')) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'dpa-btn'; b.title = 'Vender item sem cadastro (F6)';
        b.innerHTML = '<i class="fas fa-bolt"></i><span>Item avulso</span>';
        b.addEventListener('click', () => openAvulso(''));
        const toggle = head.querySelector('.dpv-toggle');
        toggle ? head.insertBefore(b, toggle) : head.appendChild(b);
        document.addEventListener('keydown', e => { if (e.key === 'F6') { e.preventDefault(); openAvulso(''); } });
    })();

    /* ---------- Orçamento → PDV ---------- */
    let pendingQuote = null;
    function readQuote() { try { return JSON.parse(sessionStorage.getItem(QKEY) || 'null'); } catch (e) { return null; } }
    function clearQuote() { try { sessionStorage.removeItem(QKEY); } catch (e) { } pendingQuote = null; document.getElementById('dpqBanner')?.remove(); }
    window.dpCancelQuoteInPdv = () => { const ap = pendingQuote && pendingQuote.appointmentId; clearQuote(); window.Toast?.info?.(ap ? 'Atendimento da agenda desvinculado desta venda.' : 'Orçamento desvinculado desta venda.'); };
    // 37.9 · Agenda: pdv.html?agenda=<id> aberto em outra aba carrega o atendimento pelo mesmo caminho (agenda-core-v1.js)
    window.dpLoadQuotePayload = p => { try { sessionStorage.setItem(QKEY, JSON.stringify(p)); } catch (e) { } pendingQuote = p; loadQuote(p); };

    function loadQuote(q) {
        const list = getCart(); list.length = 0;
        (q.items || []).forEach((it, i) => {
            const p = it.productId ? byId(it.productId) : null;
            // "Vender de novo" (ficha do cliente): usa o preço de hoje quando o produto ainda existe e é vendido por unidade
            const cur = q.useCurrentPrice && p && Number(it._factor || 1) === 1 && Number(p.salePrice) > 0 ? Number(p.salePrice) : null;
            const qty = Number(it.quantity || 1), price = r2(cur != null ? cur : it.unitPrice), line = r2(cur != null ? qty * cur : (it.total != null ? it.total : qty * price));
            // O desconto por item do orçamento vira preço unitário já com desconto
            const unitPrice = qty > 0 ? Math.round(line / qty * 10000) / 10000 : price;
            list.push({
                _cartKey: (p ? p.id : 'avulso') + '_orc_' + i,
                _factor: Number(it._factor || 1),
                _pkgLabel: it._pkgLabel || '',
                productId: p ? p.id : '',
                productName: it.productName || (p && p.name) || 'Item',
                productCode: it.productCode || (p && p.code) || '',
                unitPrice, originalUnitPrice: p ? Number(p.salePrice || unitPrice) : unitPrice,
                notes: it.notes || '', costPrice: Number(it.costPrice || (p && p.costPrice) || 0),
                quantity: qty, discount: 0, total: r2(qty * unitPrice), _unit: it.unit || 'un',
                ...(p ? {} : { isService: true }),
                ...(it.sellerId ? { sellerId: it.sellerId, sellerName: it.sellerName || '' } : {}) // 37.9 · profissional do item (Agenda)
            });
        });
        if (Number(q.deliveryFee || 0) > 0) list.push({ _cartKey: 'frete_orc', _factor: 1, _pkgLabel: '', productId: '', productName: 'Frete / deslocamento', productCode: '', unitPrice: r2(q.deliveryFee), originalUnitPrice: r2(q.deliveryFee), notes: '', costPrice: 0, quantity: 1, discount: 0, total: r2(q.deliveryFee), isService: true });
        try { discount = r2(q.discount || 0); } catch (e) { }
        try { if (q.customerName && typeof selectCustomer === 'function') selectCustomer(q.customerId || null, q.customerName, q.customerPhone || ''); } catch (e) { }
        renderCart();
        // 36.9 · Leva o que foi combinado: observações para o cliente, vendedor e forma de pagamento
        if (!q.bannerText || q.appointmentId) {
            try { const n = document.getElementById('saleNotes'); if (n && q.notes && !n.value.trim()) n.value = String(q.notes).slice(0, 500); } catch (e) { }
            if (q.paymentMethod && ['dinheiro', 'pix', 'fiado'].includes(q.paymentMethod) && typeof selectPayment === 'function') {
                try { const btn = [...document.querySelectorAll('.pay-method')].find(b => (b.getAttribute('onclick') || '').includes("'" + q.paymentMethod + "'")); if (btn && btn.style.display !== 'none') selectPayment(q.paymentMethod, btn); } catch (e) { }
            }
            if (q.sellerId) {
                let tries = 0;
                const setSeller = () => {
                    const sel = document.getElementById('sellerSelect');
                    const ok = sel && [...sel.options].some(o => o.value === q.sellerId);
                    if (ok) { sel.value = q.sellerId; try { selectSellerFromDropdown(q.sellerId); } catch (e) { } return; }
                    if (++tries < 30) setTimeout(setSeller, 200);
                };
                setSeller();
            }
        }
        const holder = document.getElementById('cartItems');
        if (holder && !document.getElementById('dpqBanner')) {
            const b = document.createElement('div'); b.id = 'dpqBanner'; b.className = 'dpq-banner';
            const PAYN = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Débito', credito: 'Crédito', fiado: 'Fiado', multi: 'Mais de uma forma' };
            const info = [q.sellerName ? `Vendedor: <b>${esc(q.sellerName)}</b>` : '', q.paymentTerms ? `Pagamento combinado: <b>${esc(q.paymentTerms)}</b>` : (q.paymentMethod ? `Pagamento: <b>${esc(PAYN[q.paymentMethod] || q.paymentMethod)}</b>` : ''), q.deliveryTime ? `Prazo: ${esc(q.deliveryTime)}` : '', q.notes ? `Obs.: ${esc(q.notes)}` : '', q.internalNotes ? `<span style="color:var(--warning)">Anotação interna: ${esc(q.internalNotes)}</span>` : ''].filter(Boolean);
            b.style.flexWrap = 'wrap';
            b.innerHTML = q.bannerText
                ? `<i class="fas ${esc(q.bannerIcon || 'fa-rotate-right')}"></i><span>${esc(q.bannerText)}</span><button type="button" onclick="dpCancelQuoteInPdv()" title="Fechar aviso">✕</button>`
                : `<i class="fas fa-file-signature"></i><span>Orçamento <b>Nº ${esc(q.quoteNumberLabel || q.quoteNumber || '')}</b> no carrinho. Escolha o pagamento e finalize.</span><button type="button" onclick="dpCancelQuoteInPdv()" title="Desvincular orçamento">✕</button>${info.length ? `<div style="flex-basis:100%;font-size:11.5px;line-height:1.55;color:var(--text-secondary)">${info.join(' · ')}</div>` : ''}`;
            holder.parentElement.insertBefore(b, holder);
        }
        try { Toast.success(q.toastText || 'Orçamento carregado no PDV'); } catch (e) { }
    }
    function tryLoadQuote(tries) {
        const q = readQuote(); if (!q) return;
        if (!getProducts().length && tries < 40) { setTimeout(() => tryLoadQuote(tries + 1), 250); return; }
        pendingQuote = q; loadQuote(q);
        // Sem orçamento para marcar como vendido (ex.: "Vender de novo"): não recarrega o carrinho se a página abrir de novo
        if (!q.quoteId && !q.appointmentId) { try { sessionStorage.removeItem(QKEY); } catch (e) { } }
    }
    if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function') {
        const origCreate = SalesService.create;
        SalesService.create = async function (data) {
            // Item avulso/serviço: a página não leva esses campos para a venda; os relatórios usam
            try { const c = getCart(); (data && Array.isArray(data.items) ? data.items : []).forEach((it, i) => { const ci = c[i]; if (!ci || ci.productName !== it.productName) return; if (ci.isService || noStock(byId(ci.productId))) it.isService = true; if (ci._unit) it.unit = ci._unit; if (ci.notes && !it.notes) it.notes = ci.notes; }); } catch (e) { }
            // 36.9 · A venda guarda de qual orçamento veio e o que foi combinado
            try { const pq = pendingQuote; if (pq && pq.quoteId && data) { data.quoteId = pq.quoteId; data.quoteNumber = pq.quoteNumber || null; if (pq.paymentTerms) data.quotePaymentTerms = pq.paymentTerms; if (pq.internalNotes) data.quoteInternalNotes = pq.internalNotes; } } catch (e) { }
            const r = await origCreate.apply(this, arguments);
            const q = pendingQuote;
            if (q && r && r.id) {
                if (q.quoteId) {
                    try {
                        await db.collection('quotes').doc(q.quoteId).set({
                            status: 'converted', saleId: r.id, saleNumber: r.saleNumber || null,
                            convertedAt: serverTs(), updatedAt: serverTs()
                        }, { merge: true });
                    } catch (e) { console.warn('Orçamento não marcado como vendido', e); }
                }
                clearQuote();
            }
            return r;
        };
    }
    setTimeout(() => tryLoadQuote(0), 400);

    /* ---------- 37.1 · Botão "Orçamento / pré-venda" no PDV: busca e fatura sem sair da tela ---------- */
    const QST = { draft: 'Rascunho', sent: 'Enviado', approved: 'Aprovado' };
    const toD = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v)); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const qLabel = q => String(q.quoteNumber || 0).padStart(6, '0');
    const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    async function listQuotes() {
        let rows = [];
        if (typeof simpleList === 'function') rows = await simpleList('quotes', 'createdAt', 'desc', 3000);
        else { const s = await db.collection('quotes').limit(3000).get(); rows = s.docs.map(d => ({ id: d.id, ...d.data() })); }
        return rows.filter(q => q.deleted !== true && ['draft', 'sent', 'approved'].includes(q.status || 'draft') && (q.items || []).length)
            .sort((a, b) => (a.status === 'approved' ? 0 : 1) - (b.status === 'approved' ? 0 : 1) || Number(b.quoteNumber || 0) - Number(a.quoteNumber || 0));
    }
    function payloadOf(q) {
        const has = id => getProducts().some(p => p.id === id);
        return {
            quoteId: q.id, quoteNumber: q.quoteNumber, quoteNumberLabel: qLabel(q),
            customerId: q.customerId || null, customerName: q.customerName || '', customerPhone: q.customerPhone || '',
            items: (q.items || []).map(i => ({ ...i, productId: has(i.productId) ? i.productId : '' })),
            discount: r2(q.discount || 0), deliveryFee: r2(q.deliveryFee || 0),
            sellerId: q.sellerId || '', sellerName: q.sellerName || '', paymentMethod: q.paymentMethod || '', paymentTerms: q.paymentTerms || '',
            deliveryTime: q.deliveryTime || '', notes: q.notes || '', internalNotes: q.internalNotes || ''
        };
    }
    function useQuote(q) {
        const go = () => {
            document.getElementById('dpqPick')?.remove();
            document.getElementById('dpqBanner')?.remove();
            const p = payloadOf(q);
            try { sessionStorage.setItem(QKEY, JSON.stringify(p)); } catch (e) { }
            pendingQuote = p; loadQuote(p);
            if (q.status !== 'approved') { try { db.collection('quotes').doc(q.id).set({ status: 'approved', approvedAt: serverTs(), updatedAt: serverTs() }, { merge: true }); } catch (e) { } }
        };
        if (getCart().length && !confirm('O carrinho atual será trocado pelos itens do orçamento Nº ' + qLabel(q) + '. Continuar?')) return;
        go();
    }
    async function openPicker() {
        document.getElementById('dpqPick')?.remove();
        const ov = document.createElement('div'); ov.id = 'dpqPick';
        ov.innerHTML = `<div class="dpqp-box" role="dialog" aria-label="Buscar orçamento ou pré-venda">
<div class="dpqp-head"><div><h4><i class="fas fa-file-signature"></i> Orçamentos e pré-vendas</h4><p>Escolha um orçamento para faturar. Os aprovados aparecem primeiro.</p></div><button type="button" class="dpqp-x" aria-label="Fechar">✕</button></div>
<div class="dpqp-search"><i class="fas fa-search"></i><input type="text" placeholder="Número, cliente, telefone ou produto..." autocomplete="off"></div>
<div class="dpqp-list"><div class="dpqp-empty"><i class="fas fa-spinner fa-spin"></i> Carregando...</div></div></div>`;
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('.dpqp-x')) close(); });
        document.addEventListener('keydown', function k(e) { if (e.key === 'Escape') { close(); document.removeEventListener('keydown', k); } });
        const inp = ov.querySelector('input'), box = ov.querySelector('.dpqp-list');
        setTimeout(() => inp.focus(), 50);
        let all = [];
        try { all = await listQuotes(); } catch (e) { box.innerHTML = `<div class="dpqp-empty">Não foi possível carregar os orçamentos: ${esc(e.message)}</div>`; return; }
        const paint = () => {
            const q = nrm(inp.value);
            const list = all.filter(x => !q || nrm([qLabel(x), x.quoteNumber, x.customerName, x.customerPhone, ...(x.items || []).map(i => i.productName)].join(' ')).includes(q)).slice(0, 80);
            if (!list.length) { box.innerHTML = `<div class="dpqp-empty"><i class="fas fa-file-circle-question"></i> ${all.length ? 'Nenhum orçamento com essa busca.' : 'Nenhum orçamento em aberto. Crie em Vendas › Orçamentos.'}</div>`; return; }
            box.innerHTML = list.map(x => { const d = toD(x.createdAt); return `<button type="button" class="dpqp-row" data-id="${esc(x.id)}"><span class="dpqp-n">Nº ${qLabel(x)}</span><span class="dpqp-c"><b>${esc(x.customerName || 'Cliente não informado')}</b><small>${(x.items || []).length} item(ns)${x.sellerName ? ' · ' + esc(x.sellerName) : ''}${d ? ' · ' + d.toLocaleDateString('pt-BR') : ''}</small></span><span class="dpqp-st st-${esc(x.status || 'draft')}">${QST[x.status] || 'Rascunho'}</span><span class="dpqp-t">${money(x.total)}</span><span class="dpqp-go"><i class="fas fa-cash-register"></i> Faturar</span></button>`; }).join('');
        };
        inp.addEventListener('input', paint);
        inp.addEventListener('keydown', e => { if (e.key === 'Enter') { const f = box.querySelector('.dpqp-row'); if (f) f.click(); } });
        box.addEventListener('click', e => { const b = e.target.closest('.dpqp-row'); if (!b) return; const q = all.find(x => x.id === b.dataset.id); if (q) useQuote(q); });
        paint();
    }
    window.dpOpenQuotePicker = openPicker;
    const st2 = document.createElement('style');
    st2.textContent = `.dpq-pick-btn{display:inline-flex;align-items:center;gap:7px;height:40px;padding:0 14px;border:1px solid rgba(99,102,241,.45);border-radius:10px;background:rgba(99,102,241,.12);color:var(--accent);font-weight:700;font-size:13px;cursor:pointer;white-space:nowrap;flex:none}
.dpq-pick-btn:hover{background:rgba(99,102,241,.2)}
#dpqPick{position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:10000;display:flex;align-items:flex-start;justify-content:center;padding:6vh 14px 14px}
#dpqPick .dpqp-box{background:var(--bg-card);border-radius:16px;width:100%;max-width:720px;max-height:82vh;display:flex;flex-direction:column;box-shadow:var(--shadow-xl,0 20px 50px rgba(0,0,0,.35));overflow:hidden}
.dpqp-head{display:flex;justify-content:space-between;gap:10px;padding:16px 18px 10px}.dpqp-head h4{margin:0;font-size:16px;color:var(--text-heading)}.dpqp-head h4 i{color:var(--accent);margin-right:6px}.dpqp-head p{margin:4px 0 0;font-size:12px;color:var(--text-muted)}
.dpqp-x{border:none;background:transparent;font-size:18px;color:var(--text-muted);cursor:pointer;height:32px}
.dpqp-search{display:flex;align-items:center;gap:8px;margin:0 18px 10px;padding:0 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input,var(--bg-secondary))}.dpqp-search i{color:var(--text-muted)}.dpqp-search input{flex:1;border:none;background:transparent;height:42px;font-size:14px;color:var(--text-primary);outline:none}
.dpqp-list{overflow:auto;padding:0 10px 12px}
.dpqp-row{display:grid;grid-template-columns:88px 1fr auto auto auto;align-items:center;gap:10px;width:100%;padding:11px 10px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--text-primary);text-align:left;cursor:pointer;font:inherit}
.dpqp-row:hover{background:var(--bg-secondary);border-color:var(--border-color)}
.dpqp-n{font-weight:800;color:var(--accent);font-size:13px}.dpqp-c b{display:block;font-size:13.5px}.dpqp-c small{color:var(--text-muted);font-size:11.5px}
.dpqp-st{font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:var(--bg-secondary);color:var(--text-secondary)}.dpqp-st.st-approved{background:rgba(22,163,74,.14);color:#16a34a}
.dpqp-t{font-weight:800;white-space:nowrap}.dpqp-go{font-size:12px;font-weight:700;color:#fff;background:#16a34a;padding:6px 10px;border-radius:8px;white-space:nowrap}
.dpqp-empty{padding:30px 10px;text-align:center;color:var(--text-muted);font-size:13px}
@media(max-width:600px){.dpqp-row{grid-template-columns:1fr auto;}.dpqp-n{grid-column:1/-1}.dpqp-go{display:none}.dpq-pick-btn span{display:none}}`;
    document.head.appendChild(st2);
    function addPickButton(tries) {
        if (document.getElementById('dpqPickBtn')) return;
        const s = document.getElementById('pdvSearch');
        if (!s) { if (tries < 30) setTimeout(() => addPickButton(tries + 1), 300); return; }
        const b = document.createElement('button'); b.type = 'button'; b.id = 'dpqPickBtn'; b.className = 'dpq-pick-btn'; b.title = 'Buscar orçamento ou pré-venda para faturar (F7)';
        b.innerHTML = '<i class="fas fa-file-signature"></i><span>Orçamento / pré-venda</span>';
        b.addEventListener('click', openPicker);
        const host = s.closest('.pdv-search-bar, .pdv-search, .search-box, .pdv-search-box') || s.parentElement;
        host.parentElement.insertBefore(b, host.nextSibling);
        if (getComputedStyle(host.parentElement).display !== 'flex') { host.parentElement.style.display = 'flex'; host.parentElement.style.gap = '8px'; host.parentElement.style.alignItems = 'center'; host.style.flex = '1'; }
    }
    addPickButton(0);
    // pdv.html?orcamento=<id> aberto em outra aba (sem o orçamento guardado na sessão): busca e carrega
    (function byUrl(tries) {
        let id = ''; try { id = new URLSearchParams(location.search).get('orcamento') || ''; } catch (e) { }
        if (!id || readQuote() || pendingQuote) return;
        if (!getProducts().length && tries < 40) { setTimeout(() => byUrl(tries + 1), 250); return; }
        db.collection('quotes').doc(id).get().then(s => { if (!s.exists) return; const q = { id: s.id, ...s.data() }; if (q.deleted || q.status === 'converted' || !(q.items || []).length) return; const p = payloadOf(q); pendingQuote = p; loadQuote(p); }).catch(() => { });
    })(0);
    document.addEventListener('keydown', e => { if (e.key === 'F7' && !e.ctrlKey && !e.altKey) { e.preventDefault(); openPicker(); } });
})();
