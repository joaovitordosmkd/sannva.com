/* DistribuiPro 38.4 · Adicionais com preço (todas as versões) — window.DPAddons.
   Mesma coleção do Cardápio digital: addon_groups {name, min, max, active, options[{id, name, price, active}],
   categories[] (nomes das categorias), products[] (ids), order}.
   - Produtos › aba "Adicionais": cadastro dos grupos (no Mensal, o Cardápio digital mostra o mesmo cadastro).
   - PDV e Mesas (e, no Mensal, o App do garçom): o produto que tem grupo (ou que é de uma categoria com vários sabores,
     sabores-v1.js) abre a janela de escolha antes de entrar no carrinho. O item ganha addons[{groupId, group, id, name, price}]
     e unitPrice = preço + adicionais; o cupom e a via da cozinha imprimem "+ Bacon".
   - Página pública do cardápio (c.html, sem banco): só as contas (extraOf, check, picked).
   API: extraOf(groups, ids), check(groups, ids), picked(groups, ids), load(force), groupsOf(product), needs(product),
        choose(product, {products, priceOf, qty}) -> Promise<{productName, unitPrice, basePrice, extra, addons, flavors, flavorGroup, notes, qty} | null>,
        cartFields(r), saleFields(item), cartHtml(item), manager(host, {products, cats}) */
(function () {
    'use strict';
    if (window.DPAddons) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/[R$\s]/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const I = n => (window.dpIcon ? dpIcon(n) : '');

    /* =================== CONTAS (também na página pública) =================== */
    const activeOpts = g => (Array.isArray(g && g.options) ? g.options : []).filter(o => o && o.active !== false && o.name);
    function extraOf(groups, ids) { const set = new Set(ids || []); let e = 0; (groups || []).forEach(g => activeOpts(g).forEach(o => { if (set.has(o.id)) e += Number(o.price) || 0; })); return r2(e); }
    function check(groups, ids) {
        const set = new Set(ids || []);
        for (const g of (groups || [])) {
            const n = activeOpts(g).filter(o => set.has(o.id)).length, min = Number(g.min) || 0, max = Number(g.max) || 0;
            if (n < min) return { group: g, msg: `Escolha ${min > 1 ? min + ' opções' : 'uma opção'} em "${g.name}".` };
            if (max && n > max) return { group: g, msg: `Em "${g.name}" dá para escolher até ${max}.` };
        }
        return null;
    }
    function picked(groups, ids) { const set = new Set(ids || []), out = []; (groups || []).forEach(g => activeOpts(g).forEach(o => { if (set.has(o.id)) out.push({ groupId: g.id || '', group: g.name || '', id: o.id, name: o.name, price: r2(o.price) }); })); return out; }
    const ruleTxt = g => { const min = Number(g.min) || 0, max = Number(g.max) || 0; return (min ? 'Obrigatório · ' : '') + (max === 1 ? 'escolha 1' : max ? 'até ' + max : 'quantos quiser'); };
    // Campos que vão para o item (carrinho, comanda e venda)
    function cartFields(r) {
        if (!r) return {};
        const out = {};
        if (Array.isArray(r.addons) && r.addons.length) out.addons = r.addons.map(a => ({ groupId: a.groupId || '', group: a.group || '', id: a.id || '', name: a.name || '', price: r2(a.price) }));
        if (Array.isArray(r.flavors) && r.flavors.length > 1) { out.flavors = r.flavors.map(f => ({ productId: f.productId || '', name: f.name || '', frac: Number(f.frac) || 0, price: r2(f.price) })); out.flavorGroup = r.flavorGroup || ''; }
        return out;
    }
    const saleFields = it => cartFields(it);
    // Embaixo do nome no carrinho do PDV
    function cartHtml(it) { const a = Array.isArray(it && it.addons) ? it.addons : []; return a.length ? `<div class="dpad-cl">${a.map(x => '+ ' + esc(x.name)).join(' · ')}</div>` : ''; }

    const api = { extraOf, check, picked, ruleTxt, cartFields, saleFields, cartHtml };
    window.DPAddons = api;
    if (typeof db === 'undefined') return; // página pública do cardápio: só as contas

    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const rid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

    /* =================== DADOS =================== */
    let groups = null, loading = null;
    function load(force) {
        if (groups && !force) return Promise.resolve(groups);
        if (loading && !force) return loading;
        loading = (async () => {
            try { const s = await db.collection('addon_groups').get(); groups = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(g => !g.deleted).sort((a, b) => (a.order || 0) - (b.order || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR')); }
            catch (e) { groups = groups || []; }
            loading = null;
            return groups;
        })();
        return loading;
    }
    const catOf = p => String((p && (p.category || p._cat)) || '');
    function groupsOf(p) {
        if (!p || !groups) return [];
        const c = catOf(p);
        return groups.filter(g => g.active !== false && activeOpts(g).length && ((g.products || []).includes(p.id) || (c && (g.categories || []).includes(c)) || (p._cat && (g.categories || []).includes(p._cat))));
    }
    const flavorMax = p => (window.DPFlavors && DPFlavors.max ? DPFlavors.max(p) : 1);
    const needs = p => !!p && (groupsOf(p).length > 0 || flavorMax(p) > 1);
    const defPrice = p => { const v = window.dpPrecoVigente ? Number(dpPrecoVigente(p)) || 0 : 0; if (v > 0) return v; const s = Number(p.salePrice || p.price || 0), pr = Number(p.promoPrice || 0); return pr > 0 && pr < s ? pr : s; };

    /* =================== JANELA DE ESCOLHA =================== */
    const QUICK = ['Sem cebola', 'Bem passado', 'Ao ponto', 'Sem gelo', 'Para viagem'];
    function choose(p, o) {
        o = o || {};
        const priceOf = typeof o.priceOf === 'function' ? o.priceOf : defPrice;
        css();
        return new Promise(done => {
            const gs = groupsOf(p);
            const fc = window.DPFlavors ? DPFlavors.cfgOf(p) : null;
            const cand = fc && fc.max > 1 ? DPFlavors.candidates(p, o.products || [], priceOf) : null;
            const st = { qty: Math.max(1, Number(o.qtyStart) || 1), ids: new Set(), fl: [p.id], fq: '' };
            const flList = () => st.fl.map(id => cand.find(x => x.id === id)).filter(Boolean);
            const base = () => cand ? DPFlavors.price(flList(), fc.rule) : r2(priceOf(p));
            const extra = () => extraOf(gs, [...st.ids]);
            const unit = () => r2(base() + extra());
            $('dpadOv')?.remove();
            const ov = document.createElement('div'); ov.className = 'dpad-ov'; ov.id = 'dpadOv';
            const flHtml = () => {
                const q = norm(st.fq), list = cand.filter(x => !q || norm(x.name).includes(q) || st.fl.includes(x.id)), full = st.fl.length >= fc.max;
                return list.map(x => { const on = st.fl.includes(x.id); return `<button type="button" class="dpad-fo${on ? ' on' : ''}${!on && full ? ' dis' : ''}" data-f="${esc(x.id)}"><span class="nm">${esc(x.short)}</span><span class="pr">${money(x.price)}</span><i class="ck">${I('check')}</i></button>`; }).join('') || '<p class="dpad-muted">Nenhum sabor encontrado.</p>';
            };
            const flName = () => { const l = flList(); return l.length > 1 ? DPFlavors.name(l) : p.name; };
            ov.innerHTML = `<div class="dpad-box" role="dialog" aria-modal="true" aria-label="${esc(p.name)}">
<header class="dpad-h"><div class="dpad-ht"><b>${esc(cand ? (fc.cat || p.name) : p.name)}</b><small id="dpadSub"></small></div><button type="button" class="dpad-x" data-a="x" aria-label="Fechar">${I('x')}</button></header>
<div class="dpad-b">
${cand ? `<section class="dpad-g dpad-flg"><div class="dpad-gh"><b>${window.DPFlavors.icon()} Sabores</b><span class="dpad-rule"><em>Escolha até ${fc.max}</em> · ${fc.rule === 'media' ? 'cobra a média' : 'cobra o mais caro'}</span></div>
${cand.length > 8 ? `<div class="dpad-fsearch">${I('search')}<input type="search" id="dpadFq" placeholder="Buscar sabor" autocomplete="off"></div>` : ''}
<div class="dpad-fls" id="dpadFls">${flHtml()}</div><div class="dpad-flsel" id="dpadFsel"></div></section>` : ''}
${gs.map(g => { const max = Number(g.max) || 0, radio = max === 1 && (Number(g.min) || 0) >= 1; return `<section class="dpad-g" data-g="${esc(g.id)}"><div class="dpad-gh"><b>${esc(g.name)}</b><span class="dpad-rule">${(Number(g.min) || 0) ? '<em>Obrigatório</em> · ' : ''}${max === 1 ? 'escolha 1' : max ? 'até ' + max : 'quantos quiser'}</span></div>
${activeOpts(g).map(op => `<label class="dpad-o"><input type="${radio ? 'radio' : 'checkbox'}" name="dpad_${esc(g.id)}" value="${esc(op.id)}"><span class="nm">${esc(op.name)}</span>${Number(op.price) ? `<b>+ ${money(op.price)}</b>` : '<small>grátis</small>'}</label>`).join('')}</section>`; }).join('')}
<label class="dpad-obs"><span>${I('message-circle')} Observação para a cozinha</span><input id="dpadObs" maxlength="120" placeholder="Ex.: sem cebola, bem passado" autocomplete="off"></label>
<div class="dpad-quick">${QUICK.map(x => `<button type="button" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</div>
</div>
<footer class="dpad-f">${o.qty ? `<div class="dpad-qty"><button type="button" data-a="m" aria-label="Menos">${I('minus')}</button><b id="dpadQty">1</b><button type="button" data-a="p" aria-label="Mais">${I('plus')}</button></div>` : ''}<button type="button" class="dpad-add" data-a="ok">${I('plus')} Adicionar <b id="dpadTot"></b></button></footer></div>`;
            const box = ov.querySelector('.dpad-box');
            const paint = () => {
                $('dpadSub').textContent = cand ? (st.fl.length > 1 ? flName() : 'Escolha os sabores') : (gs.length ? gs.map(g => g.name).join(' · ') : '');
                $('dpadTot').textContent = money(unit() * st.qty);
                if ($('dpadQty')) $('dpadQty').textContent = st.qty;
                if (cand) { $('dpadFls').innerHTML = flHtml(); const l = flList(); $('dpadFsel').innerHTML = l.length > 1 ? `${I('check-check')} ${esc(flName())} · <b>${money(base())}</b>` : `Toque em mais ${fc.max > 2 ? 'sabores' : 'um sabor'} para fazer ${fc.max > 2 ? 'a pizza com vários sabores' : 'meio a meio'}.`; }
            };
            const sync = () => {
                st.ids = new Set([...box.querySelectorAll('.dpad-o input:checked')].map(i => i.value));
                box.querySelectorAll('.dpad-g[data-g]').forEach(el => {
                    const g = gs.find(x => x.id === el.dataset.g), max = Number(g && g.max) || 0; if (max <= 1) return;
                    const n = el.querySelectorAll('input:checked').length;
                    el.querySelectorAll('input:not(:checked)').forEach(i => { i.disabled = n >= max; i.closest('.dpad-o').classList.toggle('dis', n >= max); });
                });
                paint();
            };
            const end = v => { document.removeEventListener('keydown', key, true); ov.remove(); done(v); };
            const ok = () => {
                const err = check(gs, [...st.ids]);
                if (err) { toast('warning', err.msg); box.querySelector(`[data-g="${CSS.escape(err.group.id)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
                const l = cand ? flList() : [], b = base(), n = l.length;
                const flavors = n > 1 ? l.map(x => ({ productId: x.id, name: x.short, frac: Math.round(10000 / n) / 10000, price: r2(x.price) })) : null;
                end({ productName: n > 1 ? flName() : p.name, unitPrice: unit(), basePrice: b, extra: extra(), addons: picked(gs, [...st.ids]), flavors, flavorGroup: n > 1 ? (fc.cat || '') : '', notes: ($('dpadObs').value || '').trim(), qty: st.qty });
            };
            const key = e => {
                if (!document.body.contains(ov)) return;
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); end(null); }
                else if (e.key === 'Enter' && e.target && (e.target.id === 'dpadObs' || e.target === document.body || box.contains(e.target)) && e.target.id !== 'dpadFq' && e.target.tagName !== 'BUTTON') { e.preventDefault(); ok(); }
            };
            ov.addEventListener('mousedown', e => { if (e.target === ov) end(null); });
            ov.addEventListener('change', e => {
                const i = e.target;
                if (i.type === 'checkbox' && i.checked) { const el = i.closest('.dpad-g'), g = gs.find(x => x.id === (el && el.dataset.g)); if (g && Number(g.max) === 1) el.querySelectorAll('input:checked').forEach(x => { if (x !== i) x.checked = false; }); }
                sync();
            });
            ov.addEventListener('input', e => { if (e.target.id === 'dpadFq') { st.fq = e.target.value; $('dpadFls').innerHTML = flHtml(); } });
            ov.addEventListener('click', e => {
                const a = e.target.closest('[data-a]'), f = e.target.closest('[data-f]'), q = e.target.closest('[data-q]');
                if (f) {
                    const id = f.dataset.f, i = st.fl.indexOf(id);
                    if (i >= 0) { if (st.fl.length > 1) st.fl.splice(i, 1); else toast('info', 'Escolha pelo menos um sabor.'); }
                    else if (st.fl.length >= fc.max) toast('info', `Dá para escolher até ${fc.max} sabores. Toque num sabor marcado para tirar.`);
                    else st.fl.push(id);
                    return paint();
                }
                if (q) { const i = $('dpadObs'); i.value = [i.value.trim(), q.dataset.q.toLowerCase()].filter(Boolean).join(', '); return; }
                if (!a) return;
                if (a.dataset.a === 'x') return end(null);
                if (a.dataset.a === 'm') { st.qty = Math.max(1, st.qty - 1); return paint(); }
                if (a.dataset.a === 'p') { st.qty = Math.min(99, st.qty + 1); return paint(); }
                if (a.dataset.a === 'ok') return ok();
            });
            document.addEventListener('keydown', key, true);
            document.body.appendChild(ov);
            paint();
            setTimeout(() => ov.classList.add('show'), 10);
            setTimeout(() => { const first = box.querySelector('.dpad-o input'); if (window.matchMedia && matchMedia('(pointer:fine)').matches) (first || box.querySelector('.dpad-add')).focus(); }, 60);
        });
    }

    /* =================== CADASTRO DOS GRUPOS (Produtos › Adicionais e Cardápio digital) =================== */
    const TPL = {
        extras: { name: 'Adicionais', min: 0, max: 0, options: [['Bacon', 4], ['Cheddar', 3], ['Queijo extra', 3], ['Ovo', 2]] },
        ponto: { name: 'Ponto da carne', min: 1, max: 1, options: [['Mal passado', 0], ['Ao ponto', 0], ['Bem passado', 0]] },
        borda: { name: 'Borda recheada', min: 0, max: 1, options: [['Catupiry', 8], ['Cheddar', 8], ['Chocolate', 10]] }
    };
    async function loadLite() {
        const base = db.collection('products'), q = typeof base.select === 'function' ? base.select('name', 'category', 'deleted', 'status') : base;
        const products = (await q.get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        let names = [];
        try { names = (await db.collection('categories').get()).docs.map(d => d.data() || {}).filter(c => !c.deleted && c.name).map(c => String(c.name)); } catch (e) { }
        const cats = [...new Set([...names, ...products.map(p => p.category).filter(Boolean)])].sort((a, b) => a.localeCompare(b, 'pt-BR'));
        return { products, cats };
    }
    async function manager(host, o) {
        if (!host) return;
        css();
        o = o || {};
        host.innerHTML = `<div class="dpag-load">${I('loader-circle')} Carregando os adicionais…</div>`;
        let products = o.products, cats = o.cats;
        try { if (!products || !cats) { const l = await loadLite(); products = products || l.products; cats = cats || l.cats; } await load(true); }
        catch (e) { host.innerHTML = `<div class="dpag-load">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
        const pname = id => (products.find(p => p.id === id) || {}).name || 'produto';
        const paint = () => {
            const list = groups || [];
            host.innerHTML = `<div class="dpag">
<div class="dpag-head"><div class="dpag-ic">${I('layers')}</div><div class="dpag-tx"><h3>Adicionais e opções</h3><p>Bacon, cheddar, borda recheada, ponto da carne… No PDV e nas Mesas, o produto que tem grupo abre a escolha antes de entrar no carrinho: o preço do adicional soma no item e sai no cupom e na via da cozinha (“+ Bacon”). ${o.mensal ? 'O Cardápio digital e o App do garçom usam os mesmos grupos.' : ''}</p></div><button type="button" class="btn btn-primary" data-ag="new">${I('plus')} Novo grupo</button></div>
${list.length ? '' : `<div class="dpag-empty"><b>Comece por um modelo pronto</b><span>Dá para mudar tudo depois.</span><div>${Object.entries(TPL).map(([k, t]) => `<button type="button" class="btn btn-outline btn-sm" data-ag="tpl" data-t="${k}">${I('sparkles')} ${esc(t.name)}</button>`).join('')}</div></div>`}
<div class="dpag-list">${list.map(g => `<article class="dpag-card${g.active === false ? ' off' : ''}" data-id="${esc(g.id)}"><div class="dpag-main"><div class="dpag-t"><b>${esc(g.name)}</b><span class="dpag-pill${Number(g.min) ? ' req' : ''}">${esc(ruleTxt(g))}</span>${g.active === false ? '<span class="dpag-pill">pausado</span>' : ''}</div>
<div class="dpag-opts">${activeOpts(g).map(x => `<span>${esc(x.name)}${Number(x.price) ? ' <b>+' + money(x.price) + '</b>' : ''}</span>`).join('') || '<em>sem opções</em>'}</div>
<div class="dpag-where">${I('tag')} ${[...(g.categories || []).map(esc), ...(g.products || []).map(id => esc(pname(id)))].join(', ') || '<span class="bad">não vale para nenhum item: escolha as categorias ou os produtos</span>'}</div></div>
<div class="dpag-act"><button type="button" class="btn btn-outline btn-sm" data-ag="edit">${I('pencil')} Editar</button></div></article>`).join('')}</div></div>`;
        };
        const dialog = g => {
            const isNew = !g.id;
            const ov = document.createElement('div'); ov.className = 'modal-overlay active dpag-dlg'; ov.id = 'dpagDlg';
            const optRow = x => `<div class="dpag-opt" data-oid="${esc(x.id || rid())}"><input name="o_name" placeholder="Ex.: Bacon" value="${esc(x.name || '')}" maxlength="60" class="form-input"><span>+ R$</span><input name="o_price" value="${brl(x.price || 0)}" inputmode="decimal" class="form-input"><label title="Ativo"><input type="checkbox" name="o_on" ${x.active !== false ? 'checked' : ''}> ativo</label><button type="button" class="btn-icon" data-x="opt-del" title="Tirar">${I('trash-2')}</button></div>`;
            const chip = (name, val, on, cls) => `<label class="dpag-chip${on ? ' on' : ''}${cls ? ' ' + cls : ''}"><input type="checkbox" name="${name}" value="${esc(val.v)}" ${on ? 'checked' : ''}><span>${esc(val.t)}</span></label>`;
            ov.innerHTML = `<div class="modal" style="max-width:660px"><div class="modal-header"><h3>${I('layers')} ${isNew ? 'Novo grupo de adicionais' : 'Editar grupo'}</h3><button class="modal-close" type="button" data-x="close" aria-label="Fechar">${I('x')}</button></div>
<form class="modal-body dpag-form" id="dpagForm" onsubmit="return false">
<div class="dpag-grid3"><label><span>Nome do grupo</span><input name="name" class="form-input" required maxlength="60" placeholder="Ex.: Adicionais" value="${esc(g.name || '')}"></label>
<label><span>Mínimo</span><input name="min" class="form-input" type="number" min="0" max="20" value="${Number(g.min) || 0}"><small>1 ou mais = obrigatório</small></label>
<label><span>Máximo</span><input name="max" class="form-input" type="number" min="0" max="50" value="${Number(g.max) || 0}"><small>0 = sem limite · 1 = escolhe um só</small></label></div>
<label class="dpag-check"><input type="checkbox" name="active" ${g.active !== false ? 'checked' : ''}> Grupo ativo</label>
<div class="dpag-field"><span>Opções</span><div id="dpagOpts">${(g.options || []).map(optRow).join('')}</div><button type="button" class="btn btn-outline btn-sm" data-x="opt-add">${I('plus')} Opção</button></div>
<div class="dpag-field"><span>Vale para as categorias</span><div class="dpag-chips">${cats.map(c => chip('cat', { v: c, t: c }, (g.categories || []).includes(c))).join('') || '<small>Nenhuma categoria cadastrada.</small>'}</div></div>
<div class="dpag-field"><span>E/ou para os produtos</span><input id="dpagPq" class="form-input" placeholder="Buscar produto para incluir…" autocomplete="off"><div class="dpag-chips" id="dpagProds">${(g.products || []).map(id => { const p = products.find(x => x.id === id); return p ? chip('prod', { v: p.id, t: p.name }, true) : ''; }).join('')}</div><div class="dpag-chips" id="dpagFound"></div></div>
</form>
<div class="modal-footer">${!isNew ? `<button class="btn btn-outline" type="button" data-x="del" style="margin-right:auto;color:var(--danger)">${I('trash-2')} Excluir</button>` : ''}<button class="btn btn-outline" type="button" data-x="close">Cancelar</button><button class="btn btn-primary" type="button" data-x="save">${I('save')} Salvar grupo</button></div></div>`;
            document.body.appendChild(ov);
            const f = ov.querySelector('#dpagForm');
            ov.querySelector('#dpagPq').addEventListener('input', e => {
                const q = norm(e.target.value), chosen = new Set([...f.querySelectorAll('[name=prod]')].map(i => i.value));
                ov.querySelector('#dpagFound').innerHTML = q.length < 2 ? '' : products.filter(p => !chosen.has(p.id) && norm(p.name).includes(q)).slice(0, 12).map(p => `<button type="button" class="dpag-add" data-add="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('') || '<small>Nenhum produto encontrado.</small>';
            });
            ov.addEventListener('change', e => { const c = e.target.closest('.dpag-chip'); if (c) c.classList.toggle('on', e.target.checked); });
            ov.addEventListener('click', async e => {
                const add = e.target.closest('[data-add]');
                if (add) { const p = products.find(x => x.id === add.dataset.add); if (p) ov.querySelector('#dpagProds').insertAdjacentHTML('beforeend', chip('prod', { v: p.id, t: p.name }, true)); add.remove(); return; }
                const b = e.target.closest('[data-x]'); if (!b) return;
                const x = b.dataset.x;
                if (x === 'close') return ov.remove();
                if (x === 'opt-add') { ov.querySelector('#dpagOpts').insertAdjacentHTML('beforeend', optRow({ id: rid(), name: '', price: 0, active: true })); const l = ov.querySelectorAll('#dpagOpts [name=o_name]'); l[l.length - 1].focus(); return; }
                if (x === 'opt-del') return b.closest('.dpag-opt').remove();
                if (x === 'del') {
                    if (!confirm(`Excluir o grupo "${g.name}"? Os itens já vendidos continuam com o adicional.`)) return;
                    try { await db.collection('addon_groups').doc(g.id).set({ deleted: true, updatedAt: ts() }, { merge: true }); ov.remove(); await load(true); paint(); toast('success', 'Grupo excluído.'); } catch (err) { toast('error', err.message); }
                    return;
                }
                if (x === 'save') {
                    const el = f.elements, name = el.name.value.trim();
                    const options = [...f.querySelectorAll('.dpag-opt')].map(r => ({ id: r.dataset.oid, name: r.querySelector('[name=o_name]').value.trim(), price: r2(Math.max(0, num(r.querySelector('[name=o_price]').value))), active: r.querySelector('[name=o_on]').checked })).filter(z => z.name);
                    const min = Math.max(0, parseInt(el.min.value, 10) || 0), max = Math.max(0, parseInt(el.max.value, 10) || 0);
                    if (!name) { toast('warning', 'Dê um nome ao grupo.'); el.name.focus(); return; }
                    if (!options.length) { toast('warning', 'Cadastre pelo menos uma opção.'); return; }
                    if (max && min > max) { toast('warning', 'O mínimo não pode ser maior que o máximo.'); return; }
                    const categories = [...f.querySelectorAll('[name=cat]:checked')].map(i => i.value), prods = [...f.querySelectorAll('[name=prod]:checked')].map(i => i.value);
                    const data = { name, min, max, active: el.active.checked, options, categories, products: prods, order: g.order || Date.now(), deleted: false, updatedAt: ts() };
                    b.disabled = true;
                    try {
                        if (!isNew) await db.collection('addon_groups').doc(g.id).set(data, { merge: true });
                        else await db.collection('addon_groups').add({ ...data, createdAt: ts() });
                        ov.remove(); await load(true); paint();
                        toast(categories.length || prods.length ? 'success' : 'warning', categories.length || prods.length ? 'Grupo salvo.' : 'Grupo salvo, mas ainda não vale para nenhum item: escolha as categorias ou os produtos.');
                    } catch (err) { b.disabled = false; toast('error', err.message); }
                }
            });
            setTimeout(() => (isNew ? f.elements.name : null)?.focus(), 60);
        };
        host.onclick = e => {
            const b = e.target.closest('[data-ag]'); if (!b) return;
            const a = b.dataset.ag;
            if (a === 'new') return dialog({ name: '', min: 0, max: 0, active: true, options: [{ id: rid(), name: '', price: 0, active: true }], categories: [], products: [] });
            if (a === 'tpl') { const t = TPL[b.dataset.t]; return dialog({ name: t.name, min: t.min, max: t.max, active: true, options: t.options.map(([n, pr]) => ({ id: rid(), name: n, price: pr, active: true })), categories: [], products: [] }); }
            if (a === 'edit') { const g = (groups || []).find(x => x.id === b.closest('[data-id]').dataset.id); if (g) dialog(JSON.parse(JSON.stringify(g))); }
        };
        paint();
    }

    /* =================== Produtos › aba Adicionais =================== */
    function setupProdutos() {
        if (!$('productsTable') || $('dpadTabs')) return;
        const pc = document.querySelector('.page-content'), stats = pc && pc.querySelector('.stat-grid'), main = $('productsTable').closest('.card');
        if (!pc || !main) return;
        css();
        const bar = document.createElement('div'); bar.className = 'dpad-tabs'; bar.id = 'dpadTabs';
        bar.innerHTML = `<button type="button" class="on" data-t="p">${I('package')} Produtos</button><button type="button" data-t="a">${I('layers')} Adicionais</button>`;
        const panel = document.createElement('div'); panel.id = 'dpadPanel'; panel.className = 'card'; panel.hidden = true;
        pc.insertBefore(bar, stats || main);
        main.insertAdjacentElement('afterend', panel);
        let built = false;
        const show = t => {
            bar.querySelectorAll('[data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t));
            const a = t === 'a'; if (stats) stats.style.display = a ? 'none' : ''; main.style.display = a ? 'none' : ''; panel.hidden = !a; panel.style.display = a ? '' : 'none';
            if (a && !built) { built = true; manager(panel, { mensal: !!window.DPCardapio }); }
            try { history.replaceState(null, '', a ? '#adicionais' : location.pathname + location.search); } catch (e) { }
        };
        bar.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); });
        if (location.hash === '#adicionais') show('a');
    }

    /* =================== VISUAL =================== */
    function css() {
        if ($('dpadCss')) return;
        const s = document.createElement('style'); s.id = 'dpadCss';
        s.textContent = `.dpad-ov{position:fixed;inset:0;z-index:10060;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .15s}.dpad-ov.show{opacity:1}
.dpad-box{width:min(540px,100%);max-height:min(92vh,860px);display:flex;flex-direction:column;background:var(--bg-card,#fff);color:var(--text-primary,#1e293b);border:1px solid var(--border-color,rgba(0,0,0,.08));border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);overflow:hidden}
.dpad-box svg.dpi{width:1em;height:1em;vertical-align:-.125em}
.dpad-h{display:flex;align-items:flex-start;gap:10px;padding:16px 18px 12px;border-bottom:1px solid var(--border-color,rgba(0,0,0,.08))}.dpad-ht{flex:1;min-width:0}.dpad-ht b{display:block;font-size:17px;color:var(--text-heading,#0f172a);line-height:1.25}.dpad-ht small{display:block;font-size:12.5px;color:var(--text-muted,#64748b);margin-top:3px}
.dpad-x{border:0;background:var(--bg-surface,#f3f4f8);color:var(--text-secondary,#64748b);width:34px;height:34px;border-radius:10px;cursor:pointer;font-size:17px;display:flex;align-items:center;justify-content:center;flex:none}
.dpad-b{overflow:auto;padding:6px 18px 14px;flex:1}.dpad-g{padding:12px 0;border-bottom:1px solid var(--border-color,rgba(0,0,0,.08))}.dpad-gh{display:flex;align-items:baseline;justify-content:space-between;gap:10px;margin-bottom:6px}.dpad-gh b{font-size:14px;color:var(--text-heading,#0f172a);display:inline-flex;gap:6px;align-items:center}
.dpad-rule{font-size:11.5px;color:var(--text-muted,#64748b);text-align:right}.dpad-rule em{font-style:normal;font-weight:700;color:var(--warning,#d97706)}
.dpad-o{display:flex;align-items:center;gap:10px;min-height:44px;padding:6px 8px;margin:0 -8px;border-radius:10px;cursor:pointer;font-size:14px}.dpad-o:hover{background:var(--bg-surface,#f3f4f8)}.dpad-o input{width:18px;height:18px;accent-color:var(--accent,#6366f1);flex:none}.dpad-o .nm{flex:1}.dpad-o b{font-size:13px;color:var(--success,#10b981);white-space:nowrap}.dpad-o small{font-size:11.5px;color:var(--text-muted,#64748b)}.dpad-o.dis{opacity:.45;cursor:not-allowed}
.dpad-fls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dpad-fo{position:relative;display:flex;flex-direction:column;align-items:flex-start;gap:2px;padding:10px 34px 10px 12px;border-radius:12px;border:1px solid var(--border-color,rgba(0,0,0,.1));background:var(--bg-surface,#f8f9fc);color:var(--text-primary,#1e293b);cursor:pointer;text-align:left;font:inherit;min-height:52px}
.dpad-fo .nm{font-weight:700;font-size:13.5px}.dpad-fo .pr{font-size:12px;color:var(--text-muted,#64748b)}.dpad-fo .ck{position:absolute;right:10px;top:50%;transform:translateY(-50%);width:20px;height:20px;border-radius:50%;border:1.5px solid var(--border-hover,rgba(0,0,0,.2));display:flex;align-items:center;justify-content:center;font-size:12px;color:transparent}
.dpad-fo.on{border-color:var(--accent,#6366f1);background:var(--accent-muted,rgba(99,102,241,.12))}.dpad-fo.on .ck{background:var(--accent,#6366f1);border-color:var(--accent,#6366f1);color:#fff}.dpad-fo.dis{opacity:.5}
.dpad-flsel{margin-top:8px;font-size:12.5px;color:var(--text-secondary,#64748b);display:flex;gap:6px;align-items:center;flex-wrap:wrap}.dpad-flsel b{color:var(--success,#10b981)}
.dpad-fsearch{display:flex;align-items:center;gap:8px;border:1px solid var(--border-color,rgba(0,0,0,.1));border-radius:10px;padding:0 10px;margin-bottom:8px;color:var(--text-muted,#64748b)}.dpad-fsearch input{border:0;background:transparent;flex:1;height:38px;font:inherit;color:var(--text-primary,#1e293b);outline:none}
.dpad-obs{display:block;margin-top:12px}.dpad-obs span{display:flex;gap:6px;align-items:center;font-size:13px;font-weight:700;color:var(--text-heading,#0f172a);margin-bottom:6px}.dpad-obs input{width:100%;height:42px;border-radius:10px;border:1px solid var(--border-color,rgba(0,0,0,.12));background:var(--bg-input,#f3f4f8);color:var(--text-primary,#1e293b);padding:0 12px;font:inherit}
.dpad-quick{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.dpad-quick button{border:1px solid var(--border-color,rgba(0,0,0,.12));background:transparent;color:var(--text-secondary,#64748b);border-radius:999px;padding:5px 11px;font:inherit;font-size:12px;cursor:pointer}.dpad-quick button:hover{border-color:var(--accent,#6366f1);color:var(--accent,#6366f1)}
.dpad-f{display:flex;gap:10px;align-items:center;padding:12px 18px 14px;border-top:1px solid var(--border-color,rgba(0,0,0,.08))}.dpad-qty{display:flex;align-items:center;gap:4px;border:1px solid var(--border-color,rgba(0,0,0,.12));border-radius:12px;padding:3px}.dpad-qty button{width:36px;height:36px;border:0;border-radius:9px;background:var(--bg-surface,#f3f4f8);color:var(--text-primary,#1e293b);cursor:pointer;font-size:15px;display:flex;align-items:center;justify-content:center}.dpad-qty b{min-width:26px;text-align:center}
.dpad-add{flex:1;height:46px;border:0;border-radius:12px;background:var(--accent,#6366f1);color:#fff;font:inherit;font-weight:700;font-size:15px;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px}.dpad-add b{font-weight:800}
.dpad-muted{font-size:12.5px;color:var(--text-muted,#64748b);grid-column:1/-1}.dpad-cl{font-size:10.5px;color:var(--text-muted);margin-top:2px;white-space:normal}
@media(max-width:640px){.dpad-ov{align-items:flex-end;padding:0}.dpad-box{width:100%;max-height:92vh;border-radius:18px 18px 0 0}.dpad-fls{grid-template-columns:1fr 1fr}}
.dpad-tabs{display:inline-flex;gap:4px;padding:4px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border-color);margin-bottom:14px}.dpad-tabs button{display:inline-flex;align-items:center;gap:7px;border:0;background:transparent;color:var(--text-secondary);font:inherit;font-weight:600;font-size:13.5px;padding:8px 14px;border-radius:9px;cursor:pointer}.dpad-tabs button.on{background:var(--accent);color:#fff}.dpad-tabs svg.dpi{width:1em;height:1em}
.dpag svg.dpi,.dpag-dlg svg.dpi{width:1em;height:1em;vertical-align:-.125em}.dpag-load{padding:40px;text-align:center;color:var(--text-muted)}
.dpag-head{display:flex;gap:14px;align-items:flex-start;margin-bottom:14px}.dpag-ic{width:44px;height:44px;border-radius:12px;background:var(--accent-muted);color:var(--accent);display:flex;align-items:center;justify-content:center;font-size:22px;flex:none}.dpag-tx{flex:1;min-width:0}.dpag-tx h3{margin:0 0 4px;font-size:16px;color:var(--text-heading)}.dpag-tx p{margin:0;font-size:12.5px;color:var(--text-muted);line-height:1.5}
.dpag-empty{border:1px dashed var(--border-color);border-radius:14px;padding:18px;text-align:center;margin-bottom:12px}.dpag-empty b{display:block;color:var(--text-heading)}.dpag-empty span{display:block;font-size:12.5px;color:var(--text-muted);margin:2px 0 10px}.dpag-empty div{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}
.dpag-list{display:grid;gap:10px}.dpag-card{display:flex;gap:12px;align-items:center;padding:14px 16px;border-radius:14px;border:1px solid var(--border-color);background:var(--bg-secondary)}.dpag-card.off{opacity:.6}.dpag-main{flex:1;min-width:0}.dpag-t{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dpag-t b{font-size:14.5px;color:var(--text-heading)}
.dpag-pill{font-size:11px;font-weight:600;padding:2px 8px;border-radius:999px;background:var(--bg-surface);color:var(--text-secondary)}.dpag-pill.req{background:var(--warning-bg);color:var(--warning)}
.dpag-opts{display:flex;flex-wrap:wrap;gap:4px 12px;margin:6px 0 4px;font-size:12.5px;color:var(--text-primary)}.dpag-opts b{color:var(--success);font-weight:700}.dpag-where{font-size:12px;color:var(--text-muted)}.dpag-where .bad{color:var(--danger)}
.dpag-form{display:flex;flex-direction:column;gap:12px}.dpag-grid3{display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px}.dpag-grid3 label,.dpag-field{display:flex;flex-direction:column;gap:4px;font-size:12.5px;font-weight:600;color:var(--text-secondary)}.dpag-grid3 small{font-weight:400;color:var(--text-muted);font-size:11px}
.dpag-check{display:flex;gap:8px;align-items:center;font-size:13px;cursor:pointer}.dpag-opt{display:grid;grid-template-columns:1fr auto 90px auto auto;gap:8px;align-items:center;margin-bottom:6px}.dpag-opt span{font-size:12px;color:var(--text-muted)}.dpag-opt label{display:flex;gap:4px;align-items:center;font-size:12px;font-weight:400}
.dpag-chips{display:flex;flex-wrap:wrap;gap:6px}.dpag-chip{display:inline-flex;align-items:center;padding:6px 11px;border-radius:999px;border:1px solid var(--border-color);font-size:12.5px;font-weight:500;cursor:pointer;color:var(--text-primary)}.dpag-chip input{display:none}.dpag-chip.on{background:var(--accent-muted);border-color:var(--accent);color:var(--accent)}
.dpag-add{border:1px dashed var(--accent);background:transparent;color:var(--accent);border-radius:999px;padding:5px 10px;font:inherit;font-size:12px;cursor:pointer}
@media(max-width:640px){.dpag-head{flex-wrap:wrap}.dpag-grid3{grid-template-columns:1fr 1fr}.dpag-grid3 label:first-child{grid-column:1/-1}.dpag-opt{grid-template-columns:1fr 80px auto}.dpag-opt>span,.dpag-opt label{display:none}.dpag-card{flex-wrap:wrap}}`;
        document.head.appendChild(s);
    }

    Object.assign(api, { load, groupsOf, needs, choose, manager, css, get groups() { return groups || []; } });
    // Carrega os grupos cedo nas telas que vendem (o clique no produto já sabe se abre a escolha)
    const SELLS = () => !!($('productsGrid') || $('mesRoot') || $('gcRoot'));
    const boot = () => { if (SELLS()) load(); setupProdutos(); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    try { auth.onAuthStateChanged(u => { if (u) { if (SELLS() || $('productsTable')) load(true); setupProdutos(); } }); } catch (e) { }
})();
