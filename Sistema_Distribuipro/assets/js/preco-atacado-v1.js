/* DistribuiPro 38.1 · Distribuidora e mercado no caixa (todas as versões).
   1. Preço por quantidade: products.priceTiers [{ minQty, price }] (quantidade em unidades base, somando fardo e unidade
      do mesmo produto no carrinho). Tabela do cliente: customers.priceList 'varejo' | 'atacado' e customers.discountPct.
      Vale o MENOR preço entre a faixa atingida, o preço de atacado (cliente de atacado, desde 1 un: products.wholesalePrice
      ou a 1ª faixa) e o desconto do cliente. Não soma descontos. Item com preço mudado à mão fica como está.
   2. Código de barras do fardo/caixa (packagings[].barcode, DUN-14): o leitor põe a embalagem certa no carrinho.
   3. Etiqueta de balança (EAN-13 que começa com 2): settings/general.scale { enabled, codeDigits 4|5|6, mode 'price'|'weight',
      valueDigits 5|6 }. O produto é achado pelo "Código na balança" (products.scaleCode; sem ele, pelo código interno) e entra
      com a quantidade fracionada (valor ÷ preço do kg, ou peso ÷ 1000).
   Telas: PDV (preço, leitor), Orçamentos e Contas fiado (preço), Produtos (campos), Configurações › Vendas (balança).
   API: window.DPAtacado = { priceFor, applyLines, tiersOf, parseScale, findPackCode, scaleCfg, loadSettings } */
(function () {
    'use strict';
    if (window.DPAtacado) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/\s/g, '').replace(/^R\$/i, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const near = (a, b) => Math.abs(Number(a) - Number(b)) < 0.005;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fq = q => (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const C = () => window.DPCatalog || null;
    const unitAbbr = u => { const c = C(); return c ? c.unit(u).abbr : String(u || 'UN').toUpperCase(); };

    /* =================== Regras de preço =================== */
    function tiersOf(p) {
        const seen = {};
        (Array.isArray(p && p.priceTiers) ? p.priceTiers : []).forEach(t => { const q = num(t && t.minQty), pr = r2(num(t && t.price)); if (q > 0 && pr > 0) seen[q] = pr; });
        return Object.keys(seen).map(q => ({ minQty: Number(q), price: seen[q] })).sort((a, b) => a.minQty - b.minQty);
    }
    const wholesaleOf = p => { const w = r2(num(p && p.wholesalePrice)); if (w > 0) return w; const t = tiersOf(p); return t.length ? t[0].price : 0; };
    const isAtacado = c => !!c && String(c.priceList || '').toLowerCase() === 'atacado';
    const pctOf = c => { const v = num(c && c.discountPct); return v > 0 && v < 100 ? v : 0; };

    /** Preço de 1 unidade do produto para quem leva `units` unidades (base = preço normal da linha). */
    function priceFor(p, units, customer, base) {
        base = r2(base);
        let best = base, rule = '';
        if (!p || !(base > 0)) return { price: base, rule, base };
        const t = tiersOf(p).filter(x => Number(units || 0) + 1e-9 >= x.minQty).pop();
        if (t && t.price < best - 0.004) { best = t.price; rule = 'atacado ' + fq(t.minQty) + '+'; }
        if (isAtacado(customer)) { const w = wholesaleOf(p); if (w > 0 && w < best - 0.004) { best = w; rule = 'preço de atacado'; } }
        const pct = pctOf(customer);
        if (pct) { const d = r2(base * (1 - pct / 100)); if (d > 0 && d < best - 0.004) { best = d; rule = 'cliente −' + fq(pct) + '%'; } }
        return { price: best, rule, base };
    }
    // Preços que o próprio sistema pode ter posto na linha (não são "mudança à mão")
    function autoPrices(p, base, customer) {
        const s = [base]; tiersOf(p).forEach(t => s.push(t.price));
        const w = wholesaleOf(p); if (w) s.push(w);
        const pct = pctOf(customer); if (pct) s.push(r2(base * (1 - pct / 100)));
        return s;
    }
    const retailQuote = p => r2(num(p.promoPrice) > 0 ? num(p.promoPrice) : num(p.salePrice));
    const retailFiado = p => { const s = num(p.salePrice), pr = num(p.promoPrice); return r2(pr > 0 && pr < s ? pr : s); };
    const KIND = {
        // PDV: cart[] de pdv.html (fardo/caixa tem preço próprio: só a linha de unidade muda)
        pdv: { id: l => l.productId, qty: l => num(l.quantity), factor: l => num(l._factor) || 1, base: (l, p) => num(l.originalUnitPrice) || num(p.salePrice), get: l => num(l.unitPrice), set: (l, v) => { l.unitPrice = v; l.total = r2(num(l.quantity) * v); }, skip: l => !!l._dpScale },
        // Orçamentos: editing.items de orcamentos-v1.js (o desconto da linha continua valendo)
        quote: { id: l => l.productId, qty: l => num(l.quantity), factor: () => 1, base: (l, p) => retailQuote(p), get: l => num(l.unitPrice), set: (l, v) => { l.unitPrice = v; l.total = r2(num(l.quantity) * v - num(l.discount)); } },
        // Contas fiado (Mensal): itens da tela "Lançar na conta"
        fiado: { id: l => l.id, qty: l => num(l.qty), factor: () => 1, base: (l, p) => retailFiado(p), get: l => num(l.price), set: (l, v) => { l.price = v; } }
    };
    /** Reescreve o preço das linhas automáticas. Devolve os índices que mudaram. Marca a linha com _dpRule (ex.: "atacado 6+"). */
    function applyLines(lines, o) {
        o = o || {};
        const K = KIND[o.kind || 'pdv'] || KIND.pdv, prods = Array.isArray(o.products) ? o.products : [], cust = o.customer || null, changed = [];
        if (!Array.isArray(lines) || !lines.length) return changed;
        const byId = {}; prods.forEach(p => { if (p && p.id) byId[p.id] = p; });
        const units = {};
        lines.forEach(l => { const id = l && K.id(l); if (id) units[id] = (units[id] || 0) + K.qty(l) * K.factor(l); });
        lines.forEach((l, i) => {
            const id = l && K.id(l); if (!id || K.factor(l) !== 1 || (K.skip && K.skip(l))) return;
            const p = byId[id]; if (!p) return;
            if (!tiersOf(p).length && !isAtacado(cust) && !pctOf(cust) && !l._dpRule) return;
            const base = r2(K.base(l, p)); if (!(base > 0)) return;
            const cur = r2(K.get(l));
            const auto = near(cur, base) || (l._dpAuto != null && near(cur, l._dpAuto)) || autoPrices(p, base, cust).some(v => near(v, cur));
            if (!auto) { delete l._dpRule; delete l._dpAuto; return; } // preço mexido à mão: fica como está
            const r = priceFor(p, units[id], cust, base);
            // Sempre regrava preço e total (somar mais uma unidade na mesma linha refazia o total pelo preço cheio)
            const before = K.get(l) + '|' + l.total + '|' + (l._dpRule || '');
            K.set(l, r.price);
            if (r.rule) { l._dpRule = r.rule; l._dpAuto = r.price; } else { delete l._dpRule; delete l._dpAuto; }
            if (before !== K.get(l) + '|' + l.total + '|' + (l._dpRule || '')) changed.push(i);
        });
        return changed;
    }

    /* =================== Códigos: fardo (DUN-14) e balança =================== */
    const digits = s => String(s ?? '').replace(/\D/g, '');
    const noZeros = s => { const d = String(s ?? '').trim().toLowerCase(); return /^\d+$/.test(d) ? d.replace(/^0+/, '') : d; };
    const codesIn = v => String(v ?? '').split(/[\s,;|]+/).map(noZeros).filter(Boolean);
    function findPackCode(prods, raw) {
        const q = noZeros(String(raw || '').replace(/\s+/g, '')); if (!q) return null;
        for (const p of (prods || [])) {
            if (!p || p.deleted) continue;
            const pk = Array.isArray(p.packagings) ? p.packagings : [];
            for (let i = 0; i < pk.length; i++) if (pk[i] && codesIn(pk[i].barcode).includes(q)) return { product: p, pkgIndex: i + 1, pkg: pk[i] };
        }
        return null;
    }
    function ean13ok(code) {
        if (!/^\d{13}$/.test(code)) return false;
        let s = 0; for (let i = 0; i < 12; i++) s += Number(code[i]) * (i % 2 ? 3 : 1);
        return (10 - (s % 10)) % 10 === Number(code[12]);
    }
    const SCALE_KEY = 'dp_scale_cfg_v1';
    let settings = null;
    function scaleCfg() {
        let s = settings && settings.scale;
        if (!s) { try { s = JSON.parse(localStorage.getItem(SCALE_KEY) || 'null'); } catch (e) { s = null; } }
        s = s || {};
        const codeDigits = [4, 5, 6].includes(Number(s.codeDigits)) ? Number(s.codeDigits) : 4;
        let valueDigits = Number(s.valueDigits) === 6 ? 6 : 5;
        if (1 + codeDigits > 12 - valueDigits) valueDigits = 5;
        return { enabled: s.enabled === true, codeDigits, valueDigits, mode: s.mode === 'weight' ? 'weight' : 'price' };
    }
    async function loadSettings(force) {
        if (settings && !force) return settings;
        try { const d = await db.collection('settings').doc('general').get(); settings = d.exists ? (d.data() || {}) : {}; }
        catch (e) { settings = settings || {}; }
        try { localStorage.setItem(SCALE_KEY, JSON.stringify(settings.scale || {})); } catch (e) { }
        return settings;
    }
    function findPlu(prods, plu) {
        const z = noZeros(plu); if (!z) return null;
        const list = (prods || []).filter(p => p && !p.deleted && p.status !== 'inactive');
        return list.find(p => noZeros(digits(p.scaleCode)) === z && digits(p.scaleCode))
            || list.find(p => /^\d+$/.test(String(p.code || '').trim()) && noZeros(p.code) === z) || null;
    }
    /** Lê a etiqueta: { ok, product, plu, qty, total, price, dvOk, msg } */
    function parseScale(raw, cfg, prods) {
        const code = digits(raw); cfg = cfg || scaleCfg();
        if (code.length !== 13 || code[0] !== '2') return { ok: false, msg: 'Não é etiqueta de balança: o código tem 13 números e começa com 2.' };
        const dvOk = ean13ok(code);
        const plu = code.substr(1, cfg.codeDigits), raw5 = code.substr(12 - cfg.valueDigits, cfg.valueDigits), value = Number(raw5);
        const base = { code, plu, dvOk, value };
        if (!dvOk) return { ...base, ok: false, msg: 'Etiqueta lida com erro (o último número não confere). Bipe de novo.' };
        const product = findPlu(prods, plu);
        if (!product) return { ...base, ok: false, msg: `Etiqueta de balança: nenhum produto com o código ${noZeros(plu) || '0'} na balança. Cadastre em Produtos › Atacado, código do fardo e balança.` };
        const price = r2(num(product.salePrice));
        let qty, total;
        if (cfg.mode === 'weight') { qty = Math.round(value) / 1000; total = r2(qty * price); }
        else {
            total = r2(value / 100);
            if (!(price > 0)) return { ...base, product, ok: false, msg: `${product.name} está sem preço de venda.` };
            qty = Math.round(total / price * 1000) / 1000;
        }
        if (!(qty > 0)) return { ...base, product, ok: false, msg: 'Etiqueta com quantidade zero.' };
        return { ...base, ok: true, product, qty, total, price };
    }

    const api = { priceFor, applyLines, tiersOf, wholesaleOf, isAtacado, parseScale, findPackCode, scaleCfg, loadSettings, ean13ok };
    window.DPAtacado = api;

    /* =================== Estilo =================== */
    const css = `.dpat-tag{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;line-height:16px;padding:0 7px;border-radius:999px;background:rgba(16,185,129,.13);color:#059669;white-space:nowrap}
[data-theme="dark"] .dpat-tag{color:#34d399;background:rgba(52,211,153,.14)}
.dpat-card{display:block;font-size:10px;font-weight:700;color:#059669;margin-top:2px;white-space:nowrap}[data-theme="dark"] .dpat-card{color:#34d399}
details.dpat{border:1px solid var(--border-color);border-radius:12px;margin:0 0 14px;background:var(--bg-secondary)}
details.dpat>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;font-size:13px;font-weight:700;color:var(--text-heading)}
details.dpat>summary::-webkit-details-marker{display:none}
details.dpat .dpat-t{display:flex;align-items:center;gap:8px;flex:1;min-width:0}details.dpat .dpat-t i,details.dpat .dpat-t svg{color:var(--accent)}
details.dpat .dpat-s{font-size:11px;font-weight:700;padding:2px 9px;border-radius:999px;background:var(--bg-card);color:var(--text-muted);border:1px solid var(--border-color);white-space:nowrap}
details.dpat .dpat-s.on{background:rgba(16,185,129,.12);color:#059669;border-color:rgba(16,185,129,.35)}
details.dpat .dpat-ch{color:var(--text-muted);transition:transform .2s}details.dpat[open] .dpat-ch{transform:rotate(180deg)}
details.dpat .dpat-b{padding:0 14px 14px}
.dpat-sec{margin:2px 0 8px}.dpat-sec b{display:block;font-size:12.5px;color:var(--text-heading)}.dpat-sec small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.45;margin-top:2px}
.dpat-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:6px 0;font-size:12.5px;color:var(--text-secondary)}
.dpat-row>span{flex:none;white-space:nowrap}
.dpat-row input.form-control{width:84px!important;min-width:0!important;flex:0 0 84px!important;font-size:13px;padding:6px 9px;text-align:center;height:34px;margin:0}
.dpat-row .dpat-money input.form-control{width:96px!important;flex-basis:96px!important}
.dpat-row .dpat-money{display:inline-flex;align-items:center;gap:4px}.dpat-row .dpat-u{font-weight:700;color:var(--text-heading)}
.dpat-row .dpat-hint{font-size:11px;font-weight:700;color:#059669;min-width:42px}
.dpat-x{border:none;background:rgba(239,68,68,.1);color:#ef4444;width:30px;height:30px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.dpat-g{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px}.dpat-g .form-group{margin:0}.dpat-g small{display:block;font-size:11px;color:var(--text-muted);margin-top:4px;line-height:1.4}
.dpat-h{font-size:11.5px;color:var(--text-muted);margin:10px 0 0;line-height:1.45}
.dpat-pkgbar{grid-column:1/-1;display:flex;align-items:center;gap:8px;color:var(--text-muted);font-size:13px;margin-top:-2px}.dpat-pkgbar input{font-size:12px;padding:6px 10px}
.dpat-cfg-row{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:14px 16px;border-radius:12px;background:var(--bg-secondary);flex-wrap:wrap}
.dpat-cfg-row b{display:block;font-weight:600;font-size:14px;color:var(--text-primary)}.dpat-cfg-row small{display:block;font-size:12px;color:var(--text-muted)}
.dpat-cfg-row select{width:auto;min-width:170px}.dpat-test{margin-top:8px;font-size:12.5px;line-height:1.5;color:var(--text-secondary)}
.dpat-test .ok{color:#059669;font-weight:700}.dpat-test .bad{color:#dc2626;font-weight:700}
@media(max-width:640px){.dpat-g{grid-template-columns:1fr}.dpat-row input.form-control{width:72px!important;flex-basis:72px!important}}`;
    function addCss() { if ($('dpatCss')) return; const st = document.createElement('style'); st.id = 'dpatCss'; st.textContent = css; document.head.appendChild(st); }

    /* =================== PDV =================== */
    function setupPdv() {
        if (typeof window.renderCart !== 'function' || !$('cartItems')) return;
        addCss();
        const getCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
        const getProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
        const isSvc = p => !!p && (typeof window.dpIsServiceProduct === 'function' ? window.dpIsServiceProduct(p) : (p.productType === 'service' || p.controlStock === false));
        const custCache = {};
        function currentCustomer() {
            let id = null; try { id = selectedCustomerId; } catch (e) { }
            if (!id) return null;
            let list = []; try { list = Array.isArray(allPdvCustomers) ? allPdvCustomers : []; } catch (e) { }
            const c = list.find(x => String(x.id) === String(id)) || custCache[id];
            if (c) return c;
            if (!(id in custCache)) {
                custCache[id] = null;
                db.collection('customers').doc(id).get().then(s => { if (s.exists) { custCache[id] = { id, ...s.data() }; try { renderCart(); } catch (e) { } } }).catch(() => { });
            }
            return null;
        }
        window.dpPdvCustomer = currentCustomer;
        function decorate() {
            const rows = document.querySelectorAll('#cartItems .cart-item'), c = getCart();
            rows.forEach((row, i) => {
                const it = c[i]; if (!it || !it._dpRule) return;
                const box = row.querySelector('.ci-price'); if (!box || box.querySelector('.dpat-tag')) return;
                const t = document.createElement('span'); t.className = 'dpat-tag'; t.title = 'Preço automático (Produtos › Atacado / tabela do cliente)';
                t.innerHTML = '<i class="fas fa-tags"></i>' + esc(it._dpRule);
                box.appendChild(t);
            });
        }
        const oRender = window.renderCart;
        window.renderCart = function () {
            try { applyLines(getCart(), { kind: 'pdv', products: getProducts(), customer: currentCustomer() }); } catch (e) { console.warn('atacado', e); }
            const r = oRender.apply(this, arguments);
            try { decorate(); } catch (e) { }
            return r;
        };
        // Trocar o cliente da venda recalcula (cliente de atacado / com desconto)
        ['selectCustomer', 'clearCustomer'].forEach(fn => {
            const o = window[fn]; if (typeof o !== 'function') return;
            window[fn] = function () { const r = o.apply(this, arguments); try { if (getCart().length) renderCart(); } catch (e) { } return r; };
        });
        // Cartão do produto: "6+ R$ 3,20"
        function decorateCards() {
            document.querySelectorAll('#productsGrid .product-card').forEach(card => {
                if (card.querySelector('.dpat-card')) return;
                const m = (card.getAttribute('onclick') || '').match(/addToCart\('([^']+)'\)/); if (!m) return;
                const p = getProducts().find(x => x.id === m[1]); const t = p && tiersOf(p)[0]; if (!t) return;
                const pr = card.querySelector('.p-price'); if (!pr) return;
                const s = document.createElement('small'); s.className = 'dpat-card'; s.textContent = `${fq(t.minQty)}+ ${money(t.price)}`;
                pr.appendChild(s);
            });
        }
        const oRP = window.renderProducts;
        if (typeof oRP === 'function') window.renderProducts = function () { const r = oRP.apply(this, arguments); try { decorateCards(); } catch (e) { } return r; };
        const grid = $('productsGrid'); if (grid) new MutationObserver(() => { try { decorateCards(); } catch (e) { } }).observe(grid, { childList: true });
        // Na demo os produtos podem ser desenhados antes deste arquivo carregar
        [0, 800].forEach(ms => setTimeout(() => { try { decorateCards(); } catch (e) { } }, ms));

        // A venda guarda a regra de preço (não é "preço alterado pelo operador") e a etiqueta da balança
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function' && !SalesService.__dpAtacado) {
            SalesService.__dpAtacado = true;
            const oc = SalesService.create;
            SalesService.create = function (data) {
                try {
                    const c = getCart();
                    (data && Array.isArray(data.items) ? data.items : []).forEach((it, i) => {
                        const ci = c[i]; if (!ci || ci.productName !== it.productName) return;
                        if (ci._dpRule) { it.priceRule = ci._dpRule; it.priceChanged = false; }
                        if (ci._dpScale) { it.scaleLabel = ci._dpScale.code; it.priceChanged = false; }
                    });
                } catch (e) { }
                return oc.apply(this, arguments);
            };
        }

        /* ---- Leitor: código do fardo e etiqueta de balança (chamado por pdv-pro-v1.js quando o código não é de um produto) ---- */
        function addScale(code) {
            const r = parseScale(code, scaleCfg(), getProducts());
            if (!r.ok) { toast('warning', r.msg); return; }
            const p = r.product;
            const used = getCart().filter(c => c.productId === p.id).reduce((s, c) => s + num(c.quantity) * (num(c._factor) || 1), 0);
            // 39.2 · venda sem estoque liberada em Configurações (DP_VENDA_SEM_ESTOQUE). 39.3 · o comentário estava dentro do "{ }" e
            // engolia o fechamento da linha: o arquivo inteiro não carregava (erro de sintaxe) nas 5 versões.
            if (!isSvc(p) && !window.DP_VENDA_SEM_ESTOQUE && used + r.qty > num(p.currentStock) + 1e-9) { toast('warning', `Estoque insuficiente de ${p.name}: há ${fq(p.currentStock)} ${unitAbbr(p.unit)}.`); return; }
            getCart().push({
                _cartKey: p.id + '_bal_' + Date.now(), _factor: 1, _pkgLabel: '', _unit: p.unit || 'kg', _dpScale: { code: r.code },
                productId: p.id, productName: p.name, productCode: p.code || '', unitPrice: r.price, originalUnitPrice: r.price,
                notes: '', costPrice: num(p.costPrice), quantity: r.qty, discount: 0, total: r.total
            });
            renderCart();
            toast('success', `Balança: ${fq(r.qty)} ${unitAbbr(p.unit)} de ${p.name} · ${money(r.total)}`);
        }
        window.dpScanHook = function (raw) {
            const code = String(raw || '').replace(/\s+/g, ''); if (code.length < 6) return false;
            const pk = findPackCode(getProducts(), code);
            if (pk) {
                if (typeof window.addToCart === 'function' && window.addToCart.length >= 2) window.addToCart(pk.product.id, pk.pkgIndex);
                else window.addToCart(pk.product.id);
                return true;
            }
            if (/^2\d{12}$/.test(code) && scaleCfg().enabled) { addScale(code); return true; }
            return false;
        };
        loadSettings();
    }

    /* =================== Produtos › cadastro =================== */
    function setupProducts() {
        const modal = $('productModal'), promo = $('prodPromoPrice');
        if (!modal || !promo || $('dpatBox')) return;
        addCss();
        const box = document.createElement('details'); box.className = 'dpat'; box.id = 'dpatBox';
        box.innerHTML = `<summary><span class="dpat-t"><i class="fas fa-tags"></i> Atacado, código do fardo e balança</span><span class="dpat-s" id="dpatState">Sem atacado</span><span class="dpat-ch"><i class="fas fa-chevron-down"></i></span></summary>
<div class="dpat-b">
  <div class="dpat-sec"><b>Preço por quantidade</b><small>Quem leva mais paga menos, sem o caixa mexer no preço. Conta as unidades deste produto somadas no carrinho (fardo e unidade juntos).</small></div>
  <div id="dpatTiers"></div>
  <button type="button" class="btn btn-outline btn-sm" id="dpatAdd" style="font-size:11px"><i class="fas fa-plus"></i> Adicionar faixa</button>
  <div class="dpat-g">
    <div class="form-group"><label class="form-label" for="prodWholesale">Preço para cliente de atacado (R$)</label><input type="text" class="form-control" id="prodWholesale" inputmode="decimal" placeholder="Usa a 1ª faixa" autocomplete="off"><small>Vale desde 1 unidade para o cliente com a tabela "Atacado" (Clientes › Editar).</small></div>
    <div class="form-group"><label class="form-label" for="prodScaleCode">Código na balança</label><input type="text" class="form-control" id="prodScaleCode" inputmode="numeric" maxlength="6" placeholder="Ex.: 12" autocomplete="off"><small>O número deste item na balança etiquetadora (PLU). Liga a leitura em Configurações › Vendas.</small></div>
  </div>
  <p class="dpat-h"><i class="fas fa-barcode" style="margin-right:4px"></i>O código de barras do fardo ou da caixa (DUN-14) vai em cada embalagem, no quadro "Embalagens de venda".</p>
</div>`;
        const row = promo.closest('.form-row') || promo.closest('.form-group');
        row.parentElement.insertBefore(box, row.nextSibling);
        const list = $('dpatTiers');
        const salePrice = () => num($('prodPrice') && $('prodPrice').value);
        const ua = () => unitAbbr($('prodUnit') && $('prodUnit').value);
        function hint(r) {
            const p = num(r.querySelector('.dpat-p').value), s = salePrice(), h = r.querySelector('.dpat-hint');
            h.textContent = p > 0 && s > 0 && p < s ? '−' + fq(Math.round((1 - p / s) * 1000) / 10) + '%' : '';
        }
        function addRow(t) {
            const r = document.createElement('div'); r.className = 'dpat-row';
            r.innerHTML = `<span>A partir de</span><input type="text" class="form-control dpat-q" inputmode="decimal" placeholder="6" value="${t && t.minQty ? esc(fq(t.minQty)) : ''}"><span class="dpat-u">${esc(ua())}</span><span>cada um sai a</span><span class="dpat-money"><span>R$</span><input type="text" class="form-control dpat-p" inputmode="decimal" placeholder="0,00" value="${t && t.price ? esc(num2(t.price)) : ''}"></span><span class="dpat-hint"></span><button type="button" class="dpat-x" title="Tirar esta faixa" aria-label="Tirar esta faixa"><i class="fas fa-xmark"></i></button>`;
            list.appendChild(r); hint(r); paint();
            return r;
        }
        function readTiers() {
            return [...list.querySelectorAll('.dpat-row')].map(r => ({ minQty: Math.round(num(r.querySelector('.dpat-q').value) * 1000) / 1000, price: r2(num(r.querySelector('.dpat-p').value)) }))
                .filter(t => t.minQty > 0 || t.price > 0);
        }
        function paint() {
            const st = $('dpatState'); if (!st) return;
            const n = readTiers().filter(t => t.minQty > 0 && t.price > 0).length, w = num($('prodWholesale').value) > 0, sc = digits($('prodScaleCode').value);
            const parts = [n ? (n === 1 ? '1 faixa' : n + ' faixas') : '', w ? 'atacado' : '', sc ? 'balança ' + sc : ''].filter(Boolean);
            st.textContent = parts.length ? parts.join(' · ') : 'Sem atacado'; st.classList.toggle('on', !!parts.length);
            list.querySelectorAll('.dpat-u').forEach(u => { u.textContent = ua(); });
        }
        $('dpatAdd').addEventListener('click', () => { const r = addRow(null); setTimeout(() => r.querySelector('.dpat-q').focus(), 20); });
        list.addEventListener('click', e => { const x = e.target.closest('.dpat-x'); if (x) { x.closest('.dpat-row').remove(); paint(); } });
        list.addEventListener('input', e => { const r = e.target.closest('.dpat-row'); if (r) hint(r); paint(); });
        ['prodWholesale', 'prodScaleCode'].forEach(id => $(id).addEventListener('input', paint));
        $('prodScaleCode').addEventListener('input', e => { const d = digits(e.target.value).slice(0, 6); if (d !== e.target.value) e.target.value = d; });
        $('prodWholesale').addEventListener('blur', e => { const v = num(e.target.value); e.target.value = v > 0 ? num2(v) : ''; });
        document.addEventListener('change', e => { if (e.target && e.target.id === 'prodUnit') paint(); });
        $('prodPrice') && $('prodPrice').addEventListener('input', () => list.querySelectorAll('.dpat-row').forEach(hint));

        const curProduct = () => { try { return typeof editingProductId !== 'undefined' && editingProductId ? (allProducts || []).find(x => x.id === editingProductId) : null; } catch (e) { return null; } };
        const oOpen = window.openProductModal;
        if (typeof oOpen === 'function') window.openProductModal = function () {
            const r = oOpen.apply(this, arguments);
            try {
                const p = curProduct() || {};
                list.innerHTML = '';
                tiersOf(p).forEach(t => addRow(t));
                $('prodWholesale').value = num(p.wholesalePrice) > 0 ? num2(p.wholesalePrice) : '';
                $('prodScaleCode').value = digits(p.scaleCode);
                box.open = !!(tiersOf(p).length || num(p.wholesalePrice) > 0 || digits(p.scaleCode));
                paint();
            } catch (e) { console.warn('atacado produto', e); }
            return r;
        };
        // Código de barras de cada embalagem (fardo/caixa)
        const oAddPkg = window.addPackaging;
        if (typeof oAddPkg === 'function') window.addPackaging = function (pkg) {
            const r = oAddPkg.apply(this, arguments);
            try {
                const row = $('packagingList') && $('packagingList').lastElementChild;
                if (row && row.classList.contains('pkg-row') && !row.querySelector('.pkg-barcode')) {
                    const w = document.createElement('div'); w.className = 'dpat-pkgbar';
                    w.innerHTML = `<i class="fas fa-barcode"></i><input type="text" class="form-control pkg-barcode" inputmode="numeric" autocomplete="off" placeholder="Código de barras desta embalagem (DUN-14 do fardo ou da caixa), se tiver" value="${esc(pkg && pkg.barcode || '')}">`;
                    row.appendChild(w);
                }
            } catch (e) { }
            return r;
        };
        const oGetPkg = window.getPackagings;
        if (typeof oGetPkg === 'function') window.getPackagings = function () {
            const out = oGetPkg.apply(this, arguments);
            try {
                const rows = [...document.querySelectorAll('#packagingList .pkg-row')].filter(row => (parseFloat(row.querySelector('.pkg-factor')?.value) || 12) > 0);
                (out || []).forEach((p, i) => { const v = (rows[i] && rows[i].querySelector('.pkg-barcode') ? rows[i].querySelector('.pkg-barcode').value : '').trim(); if (v) p.barcode = v; else delete p.barcode; });
            } catch (e) { }
            return out;
        };
        // Antes de salvar: confere as faixas e se os códigos já estão em outro produto
        const oSave = window.saveProduct;
        if (typeof oSave === 'function') window.saveProduct = function () {
            const fail = m => { box.open = true; try { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } toast('warning', m); };
            const tiers = readTiers(), sale = salePrice(), seen = {};
            for (const t of tiers) {
                if (!(t.minQty > 1)) return fail('Na faixa de preço, a quantidade precisa ser 2 ou mais.');
                if (!(t.price > 0)) return fail(`Informe o preço da faixa a partir de ${fq(t.minQty)}.`);
                if (sale > 0 && t.price >= sale) return fail(`A faixa a partir de ${fq(t.minQty)} precisa sair mais barata que o preço normal (${money(sale)}).`);
                if (seen[t.minQty]) return fail(`Há duas faixas a partir de ${fq(t.minQty)}. Deixe só uma.`);
                seen[t.minQty] = 1;
            }
            let all = []; try { all = (allProducts || []).filter(p => !p.deleted); } catch (e) { }
            const me = curProduct(), others = all.filter(p => !me || p.id !== me.id);
            const sc = noZeros(digits($('prodScaleCode').value));
            if (sc) { const o = others.find(p => noZeros(digits(p.scaleCode)) === sc && digits(p.scaleCode)); if (o) return fail(`O código ${sc} da balança já está em "${o.name}".`); }
            for (const inp of document.querySelectorAll('#packagingList .pkg-barcode')) {
                const code = noZeros(inp.value.trim()); if (!code) continue;
                const o = others.find(p => codesIn(p.barcode).includes(code) || codesIn(p.code).includes(code) || (p.packagings || []).some(k => codesIn(k && k.barcode).includes(code)));
                if (o) { inp.focus(); return fail(`O código ${inp.value.trim()} já está em "${o.name}".`); }
                if (codesIn($('prodBarcode') && $('prodBarcode').value).includes(code)) { inp.focus(); return fail('O código da embalagem precisa ser diferente do código da unidade.'); }
            }
            return oSave.apply(this, arguments);
        };
        // Na hora de gravar: faixas, preço de atacado e código da balança entram junto com o cadastro
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpAtacado) {
            svc.__dpAtacado = true;
            ['create', 'update'].forEach(name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modal.classList.contains('active')) {
                        data.priceTiers = readTiers().filter(t => t.minQty > 1 && t.price > 0).sort((x, y) => x.minQty - y.minQty);
                        const w = r2(num($('prodWholesale').value)); data.wholesalePrice = w > 0 ? w : null;
                        data.scaleCode = digits($('prodScaleCode').value);
                    }
                    return orig.apply(this, arguments);
                };
            });
        }
    }

    /* =================== Configurações › Vendas: balança =================== */
    function setupSettings() {
        const tab = $('tabVendas'); if (!tab || $('dpatScaleCard')) return;
        addCss();
        const card = document.createElement('div'); card.className = 'card'; card.id = 'dpatScaleCard'; card.style.marginBottom = '20px';
        card.innerHTML = `<h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px"><i class="fas fa-scale-balanced" style="color:var(--accent);margin-right:8px"></i>Balança etiquetadora</h3>
<p style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Para açougue, frios, padaria e hortifrúti: o leitor bipa a etiqueta da balança (código que começa com 2) e o produto entra no PDV com o peso certo. Salva sozinho.</p>
<div style="display:flex;flex-direction:column;gap:12px">
  <div class="dpat-cfg-row"><div><b>Ler etiquetas de balança no PDV</b><small>Toledo, Filizola e outras que imprimem EAN-13 começando com 2</small></div><label class="cfg-toggle"><input type="checkbox" id="dpatScaleOn"><span class="cfg-toggle-slider"></span></label></div>
  <div class="dpat-cfg-row"><div><b>Código do produto na etiqueta</b><small>Quantos números vêm logo depois do 2</small></div><select class="form-input form-control" id="dpatScaleCd"><option value="4">4 números (padrão)</option><option value="5">5 números</option><option value="6">6 números</option></select></div>
  <div class="dpat-cfg-row"><div><b>A etiqueta traz</b><small>O que a balança imprime no código de barras</small></div><select class="form-input form-control" id="dpatScaleMode"><option value="price">Preço total (R$)</option><option value="weight">Peso (gramas)</option></select></div>
  <div class="dpat-cfg-row"><div><b>Tamanho do valor</b><small>Números do preço ou do peso antes do último dígito</small></div><select class="form-input form-control" id="dpatScaleVd"><option value="5">5 números (padrão)</option><option value="6">6 números</option></select></div>
  <div class="dpat-cfg-row" style="display:block"><b>Teste de leitura</b><small>Bipe uma etiqueta aqui (ou digite os 13 números) para conferir antes de usar no caixa.</small>
    <input type="text" class="form-input form-control" id="dpatScaleTest" inputmode="numeric" maxlength="20" placeholder="2001200015900" style="margin-top:8px;max-width:280px" autocomplete="off"><div class="dpat-test" id="dpatScaleOut"></div></div>
</div>
<p style="font-size:11.5px;color:var(--text-muted);margin:12px 0 0"><i class="fas fa-circle-info" style="margin-right:5px"></i>Em cada produto, preencha o <b>Código na balança</b> (Produtos › Atacado, código do fardo e balança). Sem ele, o sistema tenta o código interno do produto.</p>`;
        const tail = tab.lastElementChild;
        if (tail && tail.querySelector && tail.querySelector('button[onclick*="saveTab"]')) tab.insertBefore(card, tail); else tab.appendChild(card);
        let prods = null;
        const read = () => ({ enabled: $('dpatScaleOn').checked, codeDigits: Number($('dpatScaleCd').value) || 4, mode: $('dpatScaleMode').value === 'weight' ? 'weight' : 'price', valueDigits: Number($('dpatScaleVd').value) === 6 ? 6 : 5 });
        function fill() { const c = scaleCfg(); $('dpatScaleOn').checked = c.enabled; $('dpatScaleCd').value = String(c.codeDigits); $('dpatScaleMode').value = c.mode; $('dpatScaleVd').value = String(c.valueDigits); }
        async function save() {
            const s = read();
            if (1 + s.codeDigits > 12 - s.valueDigits) { s.valueDigits = 5; $('dpatScaleVd').value = '5'; toast('info', 'Com código de 6 números, o valor tem 5 números.'); }
            try {
                await db.collection('settings').doc('general').set({ scale: s, updatedAt: ts() }, { merge: true });
                settings = { ...(settings || {}), scale: s };
                try { localStorage.setItem(SCALE_KEY, JSON.stringify(s)); } catch (e) { }
                toast('success', 'Balança salva');
            } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            test();
        }
        async function test() {
            const v = digits($('dpatScaleTest').value), out = $('dpatScaleOut');
            if (!v) { out.innerHTML = ''; return; }
            if (!prods) { try { const s = await db.collection('products').get(); prods = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted); } catch (e) { prods = []; } }
            const cfg = read(); if (1 + cfg.codeDigits > 12 - cfg.valueDigits) cfg.valueDigits = 5;
            const r = parseScale(v, cfg, prods);
            if (v.length < 13) { out.innerHTML = `Faltam ${13 - v.length} número(s).`; return; }
            const parts = [];
            if (r.plu != null) parts.push(`Código na balança: <b>${esc(noZeros(r.plu) || '0')}</b>`);
            if (r.value != null) parts.push(cfg.mode === 'weight' ? `Peso: <b>${fq(r.value / 1000)} kg</b>` : `Preço na etiqueta: <b>${money(r.value / 100)}</b>`);
            out.innerHTML = (r.ok ? `<span class="ok"><i class="fas fa-circle-check"></i> Leu certo:</span> ${esc(r.product.name)} · <b>${fq(r.qty)} ${esc(unitAbbr(r.product.unit))}</b> · ${money(r.total)} (${money(r.price)} o ${esc(unitAbbr(r.product.unit).toLowerCase())})`
                : `<span class="bad"><i class="fas fa-circle-xmark"></i> ${esc(r.msg)}</span>`) + (parts.length ? `<br><small>${parts.join(' · ')}</small>` : '');
        }
        ['dpatScaleOn', 'dpatScaleCd', 'dpatScaleMode', 'dpatScaleVd'].forEach(id => $(id).addEventListener('change', save));
        $('dpatScaleTest').addEventListener('input', test);
        fill();
        loadSettings(true).then(fill);
    }

    function boot() {
        try { setupPdv(); } catch (e) { console.warn('atacado pdv', e); }
        try { setupProducts(); } catch (e) { console.warn('atacado produtos', e); }
        try { setupSettings(); } catch (e) { console.warn('atacado configurações', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
