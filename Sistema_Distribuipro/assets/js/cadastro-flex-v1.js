/* DistribuiPro 35.0 · Cadastro flexível (Produtos e Categorias).
   - Unidades para qualquer ramo: metro, kg, litro, m², rolo, par, jogo, serviço, hora...
   - Tipo do item: Produto (controla estoque) ou Serviço (vende sem estoque).
   - Estoque e estoque mínimo aceitam fração (ex.: 152,5 m de cabo).
   - Mais embalagens de venda (rolo, bobina, barra, cento, milheiro, saco...).
   - Biblioteca de ícones por ramo, com busca, em Produtos e Categorias.
   Só acrescenta ao que a página já faz: o cadastro continua salvo pela própria página. */
(function () {
    'use strict';
    const C = window.DPCatalog;
    if (!C) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    function css() {
        if ($('dpFlexCss')) return;
        const st = document.createElement('style'); st.id = 'dpFlexCss';
        st.textContent = `
.dpi-pickbox{display:block;width:100%;max-width:100%;min-width:0;height:auto;box-sizing:border-box;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface);padding:10px}
.dpi-top{display:flex;gap:8px;align-items:center;margin-bottom:8px}
.dpi-top input{flex:1;min-width:0;font-size:12px;padding:7px 10px}
.dpi-tabs{display:flex;gap:5px;overflow-x:auto;padding-bottom:6px;margin-bottom:6px;scrollbar-width:thin}
.dpi-tab{flex:0 0 auto;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:999px;padding:4px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap}
.dpi-tab.on{background:var(--accent);border-color:var(--accent);color:#fff}
.dpi-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(38px,1fr));gap:5px;max-height:190px;overflow-y:auto;padding:2px}
.dpi-grid .icon-pick,.dpi-grid .dpi-pick{width:100%;height:38px;font-size:20px;border:1px solid var(--border-color);background:var(--bg-secondary);border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0;transition:transform .12s,border-color .12s}
.dpi-grid .icon-pick:hover,.dpi-grid .dpi-pick:hover{transform:scale(1.08);border-color:var(--accent)}
.dpi-grid .active,.dpi-grid .on{border-color:var(--accent)!important;background:var(--accent-muted,rgba(99,102,241,.15))!important}
.dpi-empty{grid-column:1/-1;font-size:11px;color:var(--text-muted);padding:10px;text-align:center}
.dpf-type{display:flex;gap:8px}
.dpf-type label{flex:1;display:flex;align-items:center;gap:8px;border:1px solid var(--border-color);border-radius:10px;padding:9px 11px;cursor:pointer;font-size:12px;background:var(--bg-secondary)}
.dpf-type label.on{border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.12))}
.dpf-type input{accent-color:var(--accent)}
.dpf-type b{display:block;font-size:12px;color:var(--text-heading)}
.dpf-type small{display:block;font-size:10px;color:var(--text-muted)}
.dpf-note{font-size:10.5px;color:var(--text-muted);margin-top:4px}
.dpf-svc-off{opacity:.45;pointer-events:none}
@media(max-width:640px){.dpf-type{flex-direction:column}}`;
        document.head.appendChild(st);
    }

    /* ---------- Biblioteca de ícones (componente) ---------- */
    function iconPicker(host, opts) {
        // opts: { buttonClass, onPick(icon, btn), current() }
        let tab = 'Todos', q = '';
        host.innerHTML = `<div class="dpi-pickbox"><div class="dpi-top"><input type="search" class="form-control dpi-q" placeholder="Buscar ícone: lâmpada, cabo, câmera, tinta..."></div><div class="dpi-tabs"></div><div class="dpi-grid"></div></div>`;
        const tabs = host.querySelector('.dpi-tabs'), grid = host.querySelector('.dpi-grid');
        const names = ['Todos'].concat(C.ICONS.map(g => g.name));
        tabs.innerHTML = names.map(n => `<button type="button" class="dpi-tab${n === tab ? ' on' : ''}" data-tab="${esc(n)}">${esc(n)}</button>`).join('');
        tabs.addEventListener('click', e => { const b = e.target.closest('.dpi-tab'); if (!b) return; tab = b.dataset.tab; tabs.querySelectorAll('.dpi-tab').forEach(x => x.classList.toggle('on', x === b)); draw(); });
        host.querySelector('.dpi-q').addEventListener('input', e => { q = norm(e.target.value); draw(); });
        function draw() {
            const seen = new Set(), list = [];
            C.ICONS.forEach(g => {
                if (tab !== 'Todos' && g.name !== tab) return;
                g.icons.forEach(([ic, label]) => {
                    if (seen.has(ic)) return;
                    if (q && !norm(label + ' ' + g.name).includes(q)) return;
                    seen.add(ic); list.push([ic, label]);
                });
            });
            const cur = opts.current ? opts.current() : '';
            grid.innerHTML = list.length ? list.map(([ic, label]) =>
                `<button type="button" class="${opts.buttonClass}${ic === cur ? ' active on' : ''}" title="${esc(label)}" data-icon="${esc(ic)}">${ic}</button>`).join('')
                : '<div class="dpi-empty">Nenhum ícone com esse nome. Tente outra palavra.</div>';
        }
        grid.addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (!b) return; grid.querySelectorAll('.active,.on').forEach(x => x.classList.remove('active', 'on')); b.classList.add('active', 'on'); opts.onPick(b.dataset.icon, b); });
        draw();
        return { refresh: draw };
    }

    /* =================== PRODUTOS =================== */
    function setupProducts() {
        const unitSel = $('prodUnit');
        if (!unitSel || !$('productModal')) return;
        css();

        // Unidades
        unitSel.innerHTML = C.selectOptionsHtml(unitSel.value || 'un');
        const unitLabel = unitSel.closest('.form-group')?.querySelector('.form-label');
        if (unitLabel) unitLabel.textContent = 'Unidade de venda';

        // Textos que eram só de bebida
        const brand = $('prodBrand'); if (brand) brand.placeholder = 'Ex: WEG, Tramontina, Ambev';
        const vol = $('prodVolume');
        if (vol) { vol.placeholder = 'Ex: 2,5 mm², 20 A, 600 ml'; const l = vol.closest('.form-group')?.querySelector('.form-label'); if (l) l.textContent = 'Medida / especificação'; }

        // Estoque com fração
        // Campo texto: o campo numérico do navegador recusa vírgula ("152,5" virava vazio)
        ['prodStock', 'prodMinStock'].forEach(id => { const el = $(id); if (el) { el.type = 'text'; el.setAttribute('inputmode', 'decimal'); el.placeholder = '0'; } });

        // Linha da unidade base mostra a unidade escolhida
        const costRow = $('prodCost')?.closest('div[style*="grid-template-columns"]');
        const baseTitle = costRow && [...costRow.querySelectorAll('div')].find(d => d.children.length === 0 && d.textContent.trim() === 'Unidade');
        const baseSub = baseTitle?.nextElementSibling;
        const baseIcon = costRow?.querySelector('span');
        function paintUnit() {
            const u = C.unit(unitSel.value);
            if (baseTitle) baseTitle.textContent = u.label;
            if (baseSub) baseSub.textContent = 'Preço por ' + u.abbr + (u.frac ? ' · vende fracionado' : '');
            if (baseIcon) baseIcon.innerHTML = '<i class="fas ' + (u.frac ? 'fa-ruler' : (u.value === 'serv' || u.value === 'h' ? 'fa-screwdriver-wrench' : 'fa-box')) + '"></i>';
            const stockLab = $('prodStock')?.closest('.form-group')?.querySelector('.form-label');
            if (stockLab) stockLab.textContent = 'Estoque atual (' + u.abbr + ')';
        }
        unitSel.addEventListener('change', () => { paintUnit(); if (['serv', 'h', 'dia', 'mes', 'vb'].includes(unitSel.value)) setType('service'); });

        // Mais embalagens no seletor "Adicionar embalagem"
        try {
            if (typeof PKG_OPTIONS !== 'undefined' && Array.isArray(PKG_OPTIONS)) {
                C.PACKAGES.forEach(([value, label, icon, defaultFactor]) => { if (!PKG_OPTIONS.some(o => o.value === value)) PKG_OPTIONS.push({ value, label, icon, defaultFactor }); });
            }
        } catch (e) { /* página sem embalagens */ }

        // Tipo do item: Produto ou Serviço
        const statusGroup = $('prodStatus')?.closest('.form-group');
        let typeVal = 'product';
        let stockAoAbrir = null; // 40.73 · estoque mostrado ao abrir a edição (null = produto novo)
        if (statusGroup && !$('dpfType')) {
            const g = document.createElement('div');
            g.className = 'form-group'; g.id = 'dpfTypeGroup'; g.style.gridColumn = '1/-1';
            g.innerHTML = `<label class="form-label">Tipo do item</label><div class="dpf-type" id="dpfType">
                <label data-v="product"><input type="radio" name="dpfType" value="product" checked><span><b><i class="fas fa-box"></i> Produto</b><small>Controla estoque e dá baixa na venda</small></span></label>
                <label data-v="service"><input type="radio" name="dpfType" value="service"><span><b><i class="fas fa-screwdriver-wrench"></i> Serviço</b><small>Mão de obra, instalação, projeto — vende sem estoque</small></span></label></div>`;
            const row = statusGroup.parentElement;
            row.parentElement.insertBefore(g, row);
            // A página limpa o value de todos os inputs ao abrir o cadastro: o tipo vem do data-v do rótulo.
            g.addEventListener('change', e => { const l = e.target.closest('label[data-v]'); if (l) setType(l.dataset.v); });
        }
        function setType(v) {
            typeVal = v === 'service' ? 'service' : 'product';
            document.querySelectorAll('#dpfType label').forEach(l => { l.classList.toggle('on', l.dataset.v === typeVal); l.querySelector('input').checked = l.dataset.v === typeVal; });
            ['prodStock', 'prodMinStock'].forEach(id => $(id)?.closest('.form-group')?.classList.toggle('dpf-svc-off', typeVal === 'service'));
        }

        // Biblioteca de ícones no lugar dos 15 ícones de bebida
        const picker = $('imageIconPicker');
        if (picker) {
            const holder = document.createElement('div'); holder.style.cssText = 'width:100%;min-width:0';
            // Sem min-width:0 a fileira de abas empurra a caixa para fora do modal
            picker.style.minWidth = '0'; if (picker.parentElement) picker.parentElement.style.minWidth = '0';
            picker.innerHTML = ''; picker.appendChild(holder);
            const pk = iconPicker(holder, {
                buttonClass: 'icon-pick',
                current: () => { try { return selectedIcon; } catch (e) { return ''; } },
                onPick: icon => {
                    try { selectedIcon = icon; } catch (e) { }
                    const pv = $('prodImagePreview'); if (pv) pv.innerHTML = window.dpProductGlyph ? dpProductGlyph(icon) : icon;
                }
            });
            window.dpFlexRefreshProductIcons = pk.refresh;
        }

        // Ao abrir o cadastro: unidade antiga continua existindo, tipo e ícone corretos
        const origOpen = window.openProductModal;
        if (typeof origOpen === 'function') {
            window.openProductModal = function (productId) {
                const r = origOpen.apply(this, arguments);
                try {
                    let p = null;
                    try { p = productId ? (allProducts || []).find(x => x.id === productId) : null; } catch (e) { }
                    const wanted = p ? (p.unit || 'un') : 'un';
                    unitSel.innerHTML = C.selectOptionsHtml(wanted);
                    unitSel.value = [...unitSel.options].some(o => o.value === C.norm(wanted)) ? C.norm(wanted) : wanted;
                    stockAoAbrir = null;
                    if (p) {
                        const st = $('prodStock'), mn = $('prodMinStock');
                        const br = v => Number(v || 0).toLocaleString('pt-BR', { useGrouping: false, maximumFractionDigits: 3 });
                        if (st) { st.value = br(p.currentStock); stockAoAbrir = C.parseQty(st.value); }
                        if (mn) mn.value = br(p.minStock);
                    }
                    setType(p && (p.productType === 'service' || p.controlStock === false) ? 'service' : 'product');
                    paintUnit();
                    window.dpFlexRefreshProductIcons && window.dpFlexRefreshProductIcons();
                } catch (e) { console.warn('cadastro-flex', e); }
                return r;
            };
        }

        // Na hora de salvar: estoque com fração e tipo do item
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpFlex) {
            svc.__dpFlex = true;
            const wrap = name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && $('productModal')?.classList.contains('active')) {
                        const qtd = C.parseQty($('prodStock')?.value);
                        // 40.73 · Editando sem mexer no estoque: não regrava. A proteção da 39.3 (produtos.html tira currentStock)
                        // era desfeita aqui, e o "Salvar" do produto desfazia vendas e entradas feitas com a janela aberta.
                        if (name === 'update' && typeVal !== 'service' && stockAoAbrir !== null && qtd === stockAoAbrir) delete data.currentStock;
                        else data.currentStock = typeVal === 'service' ? Number(data.currentStock || 0) : qtd;
                        data.minStock = typeVal === 'service' ? 0 : C.parseQty($('prodMinStock')?.value);
                        data.productType = typeVal;
                        data.controlStock = typeVal !== 'service';
                        data.unit = unitSel.value || data.unit || 'un';
                    }
                    return orig.apply(this, arguments);
                };
            };
            wrap('create'); wrap('update');
        }
        paintUnit(); setType('product');
    }

    /* =================== CATEGORIAS =================== */
    function setupCategories() {
        const sel = $('catIcon');
        if (!sel) return;
        css();
        const legacy = [...sel.options].map(o => [o.value, o.text.replace(o.value, '').trim()]);
        const known = new Set();
        let html = C.ICONS.map(g => `<optgroup label="${esc(g.name)}">` + g.icons.filter(([ic]) => !known.has(ic) && known.add(ic)).map(([ic, l]) => `<option value="${esc(ic)}">${ic} ${esc(l)}</option>`).join('') + '</optgroup>').join('');
        const extra = legacy.filter(([v]) => v && !known.has(v));
        if (extra.length) html = `<optgroup label="Seus ícones">${extra.map(([v, l]) => `<option value="${esc(v)}">${v} ${esc(l)}</option>`).join('')}</optgroup>` + html;
        sel.innerHTML = html;
        sel.value = '📦';

        const holder = document.createElement('div'); holder.style.marginTop = '8px';
        sel.insertAdjacentElement('afterend', holder);
        const pk = iconPicker(holder, {
            buttonClass: 'dpi-pick',
            current: () => sel.value,
            onPick: icon => { ensure(icon); sel.value = icon; }
        });
        sel.addEventListener('change', () => pk.refresh());
        function ensure(icon) {
            if (!icon || [...sel.options].some(o => o.value === icon)) return;
            const o = document.createElement('option'); o.value = icon; o.textContent = icon + ' Personalizado'; sel.insertBefore(o, sel.firstChild);
        }
        ['openCategoryModal', 'editCategory'].forEach(fn => {
            const orig = window[fn]; if (typeof orig !== 'function') return;
            window[fn] = function (id) {
                if (fn === 'editCategory') { try { const c = (allCategories || []).find(x => x.id === id); if (c) ensure(c.icon); } catch (e) { } }
                const r = orig.apply(this, arguments);
                pk.refresh();
                return r;
            };
        });
    }

    function boot() { try { setupProducts(); } catch (e) { console.warn('cadastro-flex produtos', e); } try { setupCategories(); } catch (e) { console.warn('cadastro-flex categorias', e); } }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
