/* DistribuiPro 38.4 · Pizza meio a meio e vários sabores (todas as versões) — window.DPFlavors.
   - Categorias: "Sabores por item" em cada categoria — categories.flavors = {max: 1 a 4, rule: 'maior' | 'media'}.
   - PDV, Mesas e (no Mensal) App do garçom e Cardápio digital: o produto de uma categoria com até N sabores abre
     "Escolha até N sabores" com os produtos da mesma categoria (na mesma janela dos adicionais, adicionais-v1.js).
     O item vira "1/2 Calabresa + 1/2 Frango", com o preço pela regra (o sabor mais caro ou a média) e
     flavors[{productId, name, frac, price}] + flavorGroup (nome da categoria). A via da cozinha imprime um sabor por linha.
   - Página pública do cardápio (c.html, sem banco): só as contas (price, name, shortName). O servidor refaz a conta.
   API: price(list, rule), name(list), shortName(productName, catName), icon(), load(force), cfgOf(product), max(product),
        candidates(product, products, priceOf), catFill(category), catData() */
(function () {
    'use strict';
    if (window.DPFlavors) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    // Ícone de pizza em traço fino (desenho do Lucide, licença ISC), no mesmo padrão do dp-icons
    const icon = () => '<svg class="dpi dpi-pizza" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M15 11h.01"/><path d="M11 15h.01"/><path d="M16 16h.01"/><path d="m2 16 20 6-6-20A20 20 0 0 0 2 16"/><path d="M5.71 17.11a17.04 17.04 0 0 1 11.4-11.4"/></svg>';

    /* =================== CONTAS =================== */
    // Regra: 'maior' = cobra o sabor mais caro; 'media' = média dos sabores
    function price(list, rule) {
        const p = (list || []).map(x => Number(x && x.price) || 0);
        if (!p.length) return 0;
        return rule === 'media' ? r2(p.reduce((s, v) => s + v, 0) / p.length) : r2(Math.max(...p));
    }
    const fracTxt = n => (n > 1 ? '1/' + n + ' ' : '');
    // Nome curto do sabor: tira as palavras que já estão no nome da categoria ("Pizza Calabresa Grande" em "Pizza Grande" → "Calabresa")
    function shortName(name, cat) {
        const words = String(name || '').trim().split(/\s+/), drop = new Set(norm(cat).split(/\s+/).filter(w => w.length > 1));
        const out = words.filter(w => !drop.has(norm(w).replace(/[^a-z0-9]/g, '')));
        const s = (out.length ? out : words).join(' ').replace(/^(pizza|esfiha|esfirra|pastel|crepe)\s+/i, '').replace(/^(de|da|do)\s+/i, '');
        return s || String(name || '');
    }
    function name(list) { const l = (list || []).filter(Boolean), n = l.length; return l.map(x => fracTxt(n) + (x.short || x.name || '')).join(' + '); }
    const api = { price, name, shortName, icon };
    window.DPFlavors = api;
    if (typeof db === 'undefined') return; // página pública: só as contas

    /* =================== CATEGORIAS =================== */
    const DOC_CATS = 'categories';
    let cats = null, loading = null;
    function load(force) {
        if (cats && !force) return Promise.resolve(cats);
        if (loading && !force) return loading;
        loading = (async () => {
            try { cats = (await db.collection(DOC_CATS).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted); }
            catch (e) { cats = cats || []; }
            loading = null;
            return cats;
        })();
        return loading;
    }
    const catOfProduct = p => {
        if (!p || !cats) return null;
        const byId = p.categoryId && cats.find(c => c.id === p.categoryId); if (byId) return byId;
        const nm = String(p.category || p._cat || ''); return nm ? cats.find(c => String(c.name || '') === nm) || null : null;
    };
    function cfgOf(p) {
        const c = catOfProduct(p), f = c && c.flavors;
        const max = Math.max(1, Math.min(4, Math.round(Number(f && f.max) || 1)));
        if (max < 2) return null;
        return { max, rule: f.rule === 'media' ? 'media' : 'maior', cat: String(c.name || '') };
    }
    const max = p => { const c = cfgOf(p); return c ? c.max : 1; };
    // Sabores possíveis: produtos ativos da mesma categoria (o produto tocado sempre entra)
    function candidates(p, products, priceOf) {
        const c = cfgOf(p), nm = c ? c.cat : '';
        const pf = typeof priceOf === 'function' ? priceOf : (x => Number(x._price || x.salePrice || x.price || 0));
        const same = (products || []).filter(x => x && !x.deleted && x.status !== 'inactive' && x.active !== false && !x.soldOut && (x.id === p.id || String(x.category || x._cat || '') === nm || (p.categoryId && x.categoryId === p.categoryId)));
        if (!same.some(x => x.id === p.id)) same.unshift(p);
        return same.map(x => ({ id: x.id, name: x.name || '', short: shortName(x.name, nm), price: r2(pf(x)) })).sort((a, b) => (a.id === p.id ? -1 : b.id === p.id ? 1 : a.short.localeCompare(b.short, 'pt-BR')));
    }

    /* =================== Categorias › campo "Sabores por item" =================== */
    function setupCategorias() {
        const body = document.querySelector('#modalCategoria .modal-body'); if (!body || $('dpflCat')) return;
        if (!$('dpflCss')) { const s = document.createElement('style'); s.id = 'dpflCss'; s.textContent = '.dpfl-cat{border:1px dashed var(--border-color);border-radius:12px;padding:12px 14px}.dpfl-cat>label{display:flex;gap:7px;align-items:center}.dpfl-cat svg.dpi{width:1.05em;height:1.05em;color:var(--accent)}.dpfl-cat small{display:block;color:var(--text-muted);font-size:11.5px;margin-top:6px;line-height:1.45}.dpfl-cat .dpfl-two{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:6px}@media(max-width:560px){.dpfl-cat .dpfl-two{grid-template-columns:1fr}}'; document.head.appendChild(s); }
        const box = document.createElement('div'); box.className = 'form-group dpfl-cat'; box.id = 'dpflCat';
        box.innerHTML = `<label>${icon()} Sabores por item <span style="font-weight:400;color:var(--text-muted)">(pizza meio a meio)</span></label>
<div class="dpfl-two"><select id="dpflMax"><option value="1">1 sabor (normal)</option><option value="2">Até 2 sabores (meio a meio)</option><option value="3">Até 3 sabores</option><option value="4">Até 4 sabores</option></select>
<select id="dpflRule" title="Preço quando tiver mais de um sabor"><option value="maior">Preço do sabor mais caro</option><option value="media">Preço pela média dos sabores</option></select></div>
<small>Com mais de um sabor, ao vender um produto desta categoria no PDV ou nas Mesas aparece "Escolha até N sabores" com os outros produtos da categoria. O cupom mostra "1/2 Calabresa + 1/2 Frango" e a via da cozinha, um sabor por linha.</small>`;
        const desc = $('catDesc'), after = desc && desc.closest('.form-group');
        if (after) after.insertAdjacentElement('afterend', box); else body.appendChild(box);
        $('dpflMax').addEventListener('change', () => { $('dpflRule').disabled = $('dpflMax').value === '1'; });
        catFill(null);
    }
    function catFill(c) {
        setupCategorias();
        const f = (c && c.flavors) || {}, m = Math.max(1, Math.min(4, Math.round(Number(f.max) || 1)));
        if ($('dpflMax')) { $('dpflMax').value = String(m); $('dpflRule').value = f.rule === 'media' ? 'media' : 'maior'; $('dpflRule').disabled = m === 1; }
    }
    function catData() {
        if (!$('dpflMax')) return {};
        const m = Math.max(1, Math.min(4, Number($('dpflMax').value) || 1));
        cats = null; // a próxima venda relê as categorias
        return { flavors: { max: m, rule: $('dpflRule').value === 'media' ? 'media' : 'maior' } };
    }

    Object.assign(api, { load, cfgOf, max, candidates, catFill, catData, get cats() { return cats || []; } });
    const SELLS = () => !!($('productsGrid') || $('mesRoot') || $('gcRoot'));
    const boot = () => { if (SELLS()) load(); setupCategorias(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    try { auth.onAuthStateChanged(u => { if (u && SELLS()) load(true); }); } catch (e) { }
})();
