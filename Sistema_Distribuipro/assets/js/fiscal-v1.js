/* DistribuiPro 37.9 · Dados fiscais do produto (NCM, CEST, CFOP, CSOSN/CST e origem).
   - Produtos › cadastro: seção "Fiscal (nota fiscal)" com os mesmos campos que o importador de planilha já grava.
   - PDV: cada item da venda leva os dados fiscais e a unidade do produto (DPFiscal.of).
   - Nota fiscal: completa os itens de vendas antigas com o que está no cadastro (DPFiscal.fill).
   - Configurações › Fiscal: mostra quantos produtos ainda estão sem NCM.
   Só acrescenta: o cadastro continua sendo salvo pela própria página. */
(function () {
    'use strict';
    if (window.DPFiscal) return;
    const $ = id => document.getElementById(id);
    const digits = v => String(v ?? '').replace(/\D/g, '');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FIELDS = ['ncm', 'cest', 'cfop', 'csosn', 'origem'];
    const ORIGENS = [
        ['0', '0 · Nacional'],
        ['1', '1 · Estrangeira, importação direta'],
        ['2', '2 · Estrangeira, comprada no Brasil'],
        ['3', '3 · Nacional, mais de 40% importado'],
        ['4', '4 · Nacional, processo produtivo básico'],
        ['5', '5 · Nacional, até 40% importado'],
        ['6', '6 · Estrangeira sem similar, importação direta'],
        ['7', '7 · Estrangeira sem similar, comprada no Brasil'],
        ['8', '8 · Nacional, mais de 70% importado']
    ];
    const fmtNcm = v => { const d = digits(v); return d.length === 8 ? d.slice(0, 4) + '.' + d.slice(4, 6) + '.' + d.slice(6) : d; };
    const isService = p => !!p && (p.productType === 'service' || String(p.unit || '').toLowerCase() === 'serv');

    /** Dados fiscais + unidade do produto, só o que estiver preenchido (vai para o item da venda). */
    function of(p) {
        const out = {};
        if (!p) return out;
        const ncm = digits(p.ncm), cest = digits(p.cest), cfop = digits(p.cfop), csosn = digits(p.csosn), origem = digits(p.origem).charAt(0);
        if (ncm) out.ncm = ncm;
        if (cest) out.cest = cest;
        if (cfop) out.cfop = cfop;
        if (csosn) out.csosn = csosn;
        if (origem) out.origem = origem;
        if (p.unit) out.unit = String(p.unit);
        return out;
    }

    /** Itens sem NCM (ex.: vendas feitas antes desta versão): busca no cadastro do produto e completa. */
    async function fill(items) {
        const list = Array.isArray(items) ? items : [];
        const need = list.filter(it => it && it.productId && !digits(it.ncm));
        const ids = [...new Set(need.map(it => it.productId))];
        const found = {};
        await Promise.all(ids.map(async id => {
            try { const d = await db.collection('products').doc(id).get(); if (d.exists) found[id] = d.data(); } catch (e) { }
        }));
        need.forEach(it => {
            const f = of(found[it.productId]);
            FIELDS.forEach(k => { if (f[k] !== undefined && (it[k] === undefined || it[k] === null || it[k] === '')) it[k] = f[k]; });
            if (!it.unit && f.unit) it.unit = f.unit;
        });
        return list;
    }

    /* =================== Produtos › cadastro =================== */
    function css() {
        if ($('dpFiscalCss')) return;
        const st = document.createElement('style'); st.id = 'dpFiscalCss';
        st.textContent = `
.dpfx{border:1px solid var(--border-color);border-radius:12px;background:var(--bg-secondary);margin:0 0 12px;overflow:hidden}
.dpfx>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;padding:12px 14px;user-select:none}
.dpfx>summary::-webkit-details-marker{display:none}
.dpfx-t{font-size:13px;font-weight:700;color:var(--text-heading);display:flex;align-items:center;gap:8px}
.dpfx-t i,.dpfx-t svg{color:var(--accent)}
.dpfx-s{margin-left:auto;font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;white-space:nowrap}
.dpfx-s.ok{background:rgba(16,185,129,.12);color:#10b981}.dpfx-s.no{background:rgba(245,158,11,.14);color:#d97706}.dpfx-s.svc{background:var(--bg-surface);color:var(--text-muted)}
.dpfx-ch{color:var(--text-muted);transition:transform .15s;display:inline-flex}
.dpfx[open] .dpfx-ch{transform:rotate(180deg)}
.dpfx-b{padding:2px 14px 14px}
.dpfx-h{font-size:11.5px;color:var(--text-muted);margin:0 0 10px;line-height:1.5}
.dpfx-g{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}
.dpfx-g .form-group{margin:0;min-width:0}
.dpfx-g .dpfx-o{grid-column:1/-1}
.dpfx-g input,.dpfx-g select{width:100%;box-sizing:border-box}
.dpfx-e{font-size:11px;color:var(--danger,#ef4444);margin-top:4px;min-height:0}
@media(max-width:640px){.dpfx-g{grid-template-columns:repeat(2,minmax(0,1fr))}}`;
        document.head.appendChild(st);
    }

    let defaults = null;
    async function loadDefaults() {
        if (defaults) return defaults;
        defaults = {};
        try {
            const demo = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
            const d = await db.collection('settings').doc(demo ? 'demo_general' : 'general').get();
            const s = d.exists ? (d.data() || {}) : {};
            defaults = { ncm: digits(s.ncmPadrao), cfop: digits(s.cfopPadrao), csosn: digits(s.csosnPadrao), origem: String(s.origemPadrao ?? '') };
        } catch (e) { }
        return defaults;
    }

    function setupProducts() {
        const modal = $('productModal');
        const desc = $('prodDescription');
        if (!modal || !desc || $('dpfxBox')) return;
        css();
        const box = document.createElement('details');
        box.className = 'dpfx'; box.id = 'dpfxBox';
        box.innerHTML = `<summary><span class="dpfx-t"><i class="fas fa-file-invoice"></i> Fiscal (nota fiscal)</span><span class="dpfx-s no" id="dpfxState">Sem NCM</span><span class="dpfx-ch"><i class="fas fa-chevron-down"></i></span></summary>
<div class="dpfx-b">
  <p class="dpfx-h">Só precisa preencher se você emite nota fiscal (NFC-e). O NCM está na nota do fornecedor ou o contador informa. Campo vazio usa o padrão de Configurações › Fiscal.</p>
  <div class="dpfx-g">
    <div class="form-group"><label class="form-label">NCM</label><input type="text" class="form-control" id="prodNcm" inputmode="numeric" maxlength="10" placeholder="0000.00.00" autocomplete="off"><div class="dpfx-e" id="prodNcmErr"></div></div>
    <div class="form-group"><label class="form-label">CEST</label><input type="text" class="form-control" id="prodCest" inputmode="numeric" maxlength="9" placeholder="Se tiver" autocomplete="off"></div>
    <div class="form-group"><label class="form-label">CFOP</label><input type="text" class="form-control" id="prodCfop" inputmode="numeric" maxlength="4" placeholder="5102" autocomplete="off"></div>
    <div class="form-group"><label class="form-label">CSOSN / CST</label><input type="text" class="form-control" id="prodCsosn" inputmode="numeric" maxlength="3" placeholder="102" autocomplete="off"></div>
    <div class="form-group dpfx-o"><label class="form-label">Origem da mercadoria</label><select class="form-control" id="prodOrigem"><option value="">Padrão da loja</option>${ORIGENS.map(([v, l]) => `<option value="${v}">${esc(l)}</option>`).join('')}</select></div>
  </div>
</div>`;
        const group = desc.closest('.form-group') || desc;
        group.parentElement.insertBefore(box, group);

        const ncmEl = $('prodNcm');
        ncmEl.addEventListener('input', () => { $('prodNcmErr').textContent = ''; paintState(); });
        ncmEl.addEventListener('blur', () => { const d = digits(ncmEl.value); if (d.length === 8) ncmEl.value = fmtNcm(d); });
        ['prodCest', 'prodCfop', 'prodCsosn'].forEach(id => $(id).addEventListener('input', e => { e.target.value = digits(e.target.value); }));

        function curProduct() {
            try { return typeof editingProductId !== 'undefined' && editingProductId ? (allProducts || []).find(x => x.id === editingProductId) : null; } catch (e) { return null; }
        }
        function serviceSelected() {
            const r = document.querySelector('#dpfType input:checked');
            if (r) return r.value === 'service';
            return String($('prodUnit')?.value || '').toLowerCase() === 'serv';
        }
        function paintState() {
            const st = $('dpfxState'); if (!st) return;
            const d = digits(ncmEl.value);
            if (d.length === 8) { st.className = 'dpfx-s ok'; st.textContent = 'NCM ' + fmtNcm(d); }
            else if (!d && defaults && defaults.ncm) { st.className = 'dpfx-s svc'; st.textContent = 'Usa o NCM padrão'; }
            else if (!d && serviceSelected()) { st.className = 'dpfx-s svc'; st.textContent = 'Serviço'; }
            else { st.className = 'dpfx-s no'; st.textContent = d ? 'NCM incompleto' : 'Sem NCM'; }
        }
        function placeholders() {
            const d = defaults || {};
            if (d.cfop) $('prodCfop').placeholder = d.cfop;
            if (d.csosn) $('prodCsosn').placeholder = d.csosn;
            if (d.ncm) ncmEl.placeholder = 'Padrão ' + fmtNcm(d.ncm);
        }
        loadDefaults().then(() => { placeholders(); paintState(); });
        document.addEventListener('change', e => { if (e.target.closest && e.target.closest('#dpfType,#prodUnit')) paintState(); });

        // Ao abrir o cadastro: preenche com o que está no produto (a página limpa todos os campos antes)
        const origOpen = window.openProductModal;
        if (typeof origOpen === 'function') {
            window.openProductModal = function () {
                const r = origOpen.apply(this, arguments);
                try {
                    const p = curProduct() || {};
                    ncmEl.value = fmtNcm(p.ncm);
                    $('prodCest').value = digits(p.cest);
                    $('prodCfop').value = digits(p.cfop);
                    $('prodCsosn').value = digits(p.csosn);
                    $('prodOrigem').value = digits(p.origem).charAt(0);
                    $('prodNcmErr').textContent = '';
                    box.open = false;
                    paintState();
                } catch (e) { console.warn('fiscal produto', e); }
                return r;
            };
        }

        // Antes de salvar: confere os tamanhos (NCM 8 números, CEST 7, CFOP 4)
        const origSave = window.saveProduct;
        if (typeof origSave === 'function') {
            window.saveProduct = function () {
                const d = digits(ncmEl.value), cest = digits($('prodCest').value), cfop = digits($('prodCfop').value), cs = digits($('prodCsosn').value);
                let msg = '';
                if (d && d.length !== 8) msg = 'O NCM precisa ter 8 números (ex.: 2203.00.00).';
                else if (cest && cest.length !== 7) msg = 'O CEST precisa ter 7 números.';
                else if (cfop && cfop.length !== 4) msg = 'O CFOP precisa ter 4 números (ex.: 5102).';
                else if (cs && (cs.length < 2 || cs.length > 3)) msg = 'O CSOSN tem 3 números (ex.: 102) e o CST tem 2 (ex.: 00).';
                if (msg) {
                    box.open = true;
                    if (/NCM/.test(msg)) $('prodNcmErr').textContent = msg;
                    try { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { }
                    if (typeof Toast !== 'undefined') Toast.warning(msg);
                    return;
                }
                return origSave.apply(this, arguments);
            };
        }

        // Na hora de gravar: os campos fiscais entram junto com o resto do cadastro
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpFiscal) {
            svc.__dpFiscal = true;
            const wrap = name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modal.classList.contains('active')) {
                        data.ncm = digits(ncmEl.value);
                        data.cest = digits($('prodCest').value);
                        data.cfop = digits($('prodCfop').value);
                        data.csosn = digits($('prodCsosn').value);
                        data.origem = $('prodOrigem').value || '';
                    }
                    return orig.apply(this, arguments);
                };
            };
            wrap('create'); wrap('update');
        }
    }

    /* =================== Configurações › Fiscal =================== */
    function setupSettings() {
        const inp = $('cfg_ncm_padrao');
        if (!inp || $('dpfxCount')) return;
        inp.addEventListener('blur', () => { const d = digits(inp.value); if (d.length === 8) inp.value = fmtNcm(d); });
        const note = document.createElement('div');
        note.id = 'dpfxCount';
        note.style.cssText = 'margin-top:10px;font-size:12px;color:var(--text-muted);display:none';
        const host = inp.closest('div[style*="grid"]') || inp.parentElement;
        host.parentElement.insertBefore(note, host.nextSibling);
        let done = false;
        const count = async () => {
            if (done) return; done = true;
            try {
                let q = db.collection('products');
                if (typeof q.select === 'function') q = q.select('name', 'ncm', 'deleted', 'status', 'active', 'productType', 'unit');
                const snap = await q.get();
                const list = snap.docs.map(d => d.data() || {}).filter(p => !p.deleted && p.status !== 'inactive' && p.active !== false && !isService(p));
                const sem = list.filter(p => digits(p.ncm).length !== 8);
                if (!list.length) return;
                note.style.display = 'block';
                note.innerHTML = sem.length
                    ? `<i class="fas fa-triangle-exclamation" style="color:#d97706;margin-right:6px"></i><b style="color:var(--text-primary)">${sem.length} de ${list.length} produtos</b> estão sem NCM. Sem NCM no produto e sem NCM padrão, a nota não sai. Preencha em Produtos › editar › Fiscal${sem.length <= 5 ? ': ' + esc(sem.map(p => p.name).join(', ')) : ''}.`
                    : `<i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Todos os ${list.length} produtos têm NCM.`;
            } catch (e) { }
        };
        const tab = $('tabFiscal');
        if (tab && window.MutationObserver) {
            const mo = new MutationObserver(() => { if (tab.style.display !== 'none') { mo.disconnect(); count(); } });
            mo.observe(tab, { attributes: true, attributeFilter: ['style'] });
        }
    }

    window.DPFiscal = { of, fill, fmtNcm, FIELDS };

    function boot() {
        try { setupProducts(); } catch (e) { console.warn('fiscal produtos', e); }
        try { setupSettings(); } catch (e) { console.warn('fiscal configurações', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
