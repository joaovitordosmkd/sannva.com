/* DistribuiPro 37.1 · Depósitos: estoque separado por loja / depósito.
   - Locais em settings/general.depositos = [{ id, name }]. O local "principal" (Loja) sempre existe.
   - O estoque total continua em products.currentStock (relatórios e PDV não mudam). Quanto está em cada depósito
     extra fica em products.stockByLocation {id: qtd}; a Loja (principal) é o total menos os outros depósitos.
   - Cada computador escolhe de qual local sai a venda e entra a compra ("Depósito deste computador").
     As entradas e saídas do StockService passam a mexer nesse local.
   - Transferências entre locais: products.stockByLocation + coleção stock_transfers (histórico). */
(function () {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const n3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
    const fmt = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const LK = 'dp_deposito', CK = 'dp_depositos';
    let locs = [{ id: 'principal', name: 'Loja (principal)' }];
    try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (Array.isArray(c) && c.length) locs = c; } catch (e) { }
    const here = () => { try { const v = localStorage.getItem(LK) || 'principal'; return locs.some(l => l.id === v) ? v : 'principal'; } catch (e) { return 'principal'; } };
    const setHere = id => { try { localStorage.setItem(LK, id); } catch (e) { } };
    const nameOf = id => (locs.find(l => l.id === id) || {}).name || (id === 'principal' ? 'Loja (principal)' : id);
    async function load() {
        try {
            const s = await db.collection('settings').doc('general').get(); const g = s.exists ? (s.data() || {}) : {};
            const l = Array.isArray(g.depositos) ? g.depositos.filter(x => x && x.id && x.name) : [];
            locs = [{ id: 'principal', name: (l.find(x => x.id === 'principal') || {}).name || 'Loja (principal)' }, ...l.filter(x => x.id !== 'principal')];
            try { localStorage.setItem(CK, JSON.stringify(locs)); } catch (e) { }
        } catch (e) { }
        return locs;
    }
    const qtyAt = (p, id) => { const by = (p && p.stockByLocation) || {}; if (id !== 'principal') return n3(by[id] || 0); const others = Object.entries(by).filter(([k]) => k !== 'principal' && locs.some(l => l.id === k)).reduce((s, [, v]) => s + Number(v || 0), 0); return n3(Number(p.currentStock || 0) - others); };
    window.DPDepositos = { load, list: () => locs, here, setHere, qtyAt, nameOf };

    /* ---------- Entradas e saídas mexem no local deste computador ---------- */
    async function bump(productId, loc, delta) {
        if (!productId || loc === 'principal' || !delta) return;
        try {
            const s = await db.collection('products').doc(productId).get(); const p = s.data() || {};
            const by = { ...(p.stockByLocation || {}) }; by[loc] = n3(Number(by[loc] || 0) + delta);
            await db.collection('products').doc(productId).update({ stockByLocation: by });
        } catch (e) { console.warn('depósito:', e.message); }
    }
    function wrapStock() {
        if (typeof StockService === 'undefined' || !StockService || StockService.__dpDep) return;
        const oe = StockService.entry, ox = StockService.exit;
        StockService.entry = async function (productId, quantity) { const r = await oe.apply(this, arguments); if (locs.length > 1) await bump(productId, here(), Number(quantity) || 0); return r; };
        StockService.exit = async function (productId, quantity) { const r = await ox.apply(this, arguments); if (locs.length > 1) await bump(productId, here(), -(Number(quantity) || 0)); return r; };
        StockService.__dpDep = true;
    }
    try { wrapStock(); } catch (e) { }

    /* ---------- Seletor "de onde sai" no PDV / compras / estoque ---------- */
    function chip() {
        if (locs.length < 2 || document.getElementById('dpDepChip')) return;
        const host = document.querySelector('.pdv-header') || document.querySelector('.page-header, .content-header, .top-header .header-left, .header-left');
        if (!host) return;
        const c = document.createElement('label'); c.id = 'dpDepChip';
        c.style.cssText = 'display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 10px;border:1px solid var(--border-color);border-radius:10px;font-size:12px;color:var(--text-secondary);background:var(--bg-card);white-space:nowrap;margin-left:8px';
        c.title = 'De qual local saem as vendas e entram as compras feitas neste computador';
        c.innerHTML = `<i class="fas fa-warehouse" style="color:var(--accent)"></i><select style="border:none;background:transparent;font-weight:700;color:var(--text-primary);font-size:12px;max-width:160px">${locs.map(l => `<option value="${esc(l.id)}" ${l.id === here() ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select>`;
        c.querySelector('select').addEventListener('change', e => { setHere(e.target.value); toast('info', 'Este computador agora usa: ' + nameOf(e.target.value)); });
        host.appendChild(c);
    }

    /* ---------- Página Depósitos ---------- */
    async function page() {
        const root = document.getElementById('depRoot'); if (!root) return;
        const st = document.createElement('style');
        st.textContent = `.dep-grid{display:grid;grid-template-columns:minmax(260px,340px) 1fr;gap:16px;align-items:start}@media(max-width:900px){.dep-grid{grid-template-columns:1fr}}
.dep-loc{display:flex;align-items:center;gap:8px;padding:10px 0;border-top:1px solid var(--border-color)}.dep-loc:first-of-type{border-top:0}.dep-loc b{flex:1;font-size:13.5px}.dep-loc .tag{font-size:10.5px;padding:2px 8px;border-radius:20px;background:rgba(99,102,241,.12);color:var(--accent);font-weight:700}
.dep-tbl td,.dep-tbl th{white-space:nowrap}.dep-tbl td.q{text-align:right;font-variant-numeric:tabular-nums}.dep-neg{color:var(--danger);font-weight:700}`;
        document.head.appendChild(st);
        let products = [], q = '', transfers = [];
        async function refresh() {
            await load();
            const all = typeof simpleList === 'function' ? await simpleList('products', 'name', 'asc', 10000) : (await db.collection('products').limit(10000).get()).docs.map(d => ({ id: d.id, ...d.data() }));
            products = all.filter(p => !p.deleted && p.productType !== 'service' && p.controlStock !== false && p.status !== 'inactive');
            try { transfers = (typeof simpleList === 'function' ? await simpleList('stock_transfers', 'createdAt', 'desc', 50) : []).slice(0, 20); } catch (e) { transfers = []; }
            render();
        }
        function render() {
            const nq = String(q || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            const list = products.filter(p => !nq || String([p.name, p.code, p.barcode].join(' ')).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(nq)).slice(0, 400);
            root.innerHTML = `<div class="dep-grid"><div>
<div class="card" style="padding:16px"><h4 style="margin:0 0 4px;font-size:15px"><i class="fas fa-warehouse" style="color:var(--accent);margin-right:6px"></i>Locais de estoque</h4><p style="margin:0 0 8px;font-size:12px;color:var(--text-muted)">A Loja é o local principal. Cadastre os depósitos e outras lojas.</p>
${locs.map(l => `<div class="dep-loc"><b>${esc(l.name)}</b>${l.id === here() ? '<span class="tag">este computador</span>' : ''}<button class="btn-icon" data-a="ren" data-id="${esc(l.id)}" title="Renomear"><i class="fas fa-pen"></i></button>${l.id !== 'principal' ? `<button class="btn-icon btn-danger" data-a="del" data-id="${esc(l.id)}" title="Excluir"><i class="fas fa-trash"></i></button>` : ''}</div>`).join('')}
<div style="display:flex;gap:8px;margin-top:10px"><input class="form-input" id="depNew" placeholder="Novo depósito (ex.: Depósito 2, Loja Centro)" maxlength="40"><button class="btn btn-primary" data-a="add"><i class="fas fa-plus"></i></button></div></div>
<div class="card" style="padding:16px;margin-top:16px"><h4 style="margin:0 0 4px;font-size:15px"><i class="fas fa-desktop" style="color:var(--accent);margin-right:6px"></i>Depósito deste computador</h4><p style="margin:0 0 8px;font-size:12px;color:var(--text-muted)">As vendas feitas neste computador saem daqui e as compras entram aqui.</p><select class="form-input" id="depHere">${locs.map(l => `<option value="${esc(l.id)}" ${l.id === here() ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div>
<div class="card" style="padding:16px;margin-top:16px"><h4 style="margin:0 0 10px;font-size:15px"><i class="fas fa-right-left" style="color:var(--accent);margin-right:6px"></i>Transferir estoque</h4>${locs.length < 2 ? '<p style="font-size:12px;color:var(--text-muted);margin:0">Cadastre um depósito para transferir.</p>' : `
<div class="form-group"><label>Produto</label><input class="form-input" id="depTq" list="depTqList" placeholder="Digite o nome ou código"><datalist id="depTqList">${products.slice(0, 3000).map(p => `<option value="${esc((p.code ? p.code + ' · ' : '') + p.name)}">`).join('')}</datalist></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px"><div class="form-group"><label>De</label><select class="form-input" id="depTf">${locs.map(l => `<option value="${esc(l.id)}">${esc(l.name)}</option>`).join('')}</select></div><div class="form-group"><label>Para</label><select class="form-input" id="depTt">${locs.map((l, i) => `<option value="${esc(l.id)}" ${i === 1 ? 'selected' : ''}>${esc(l.name)}</option>`).join('')}</select></div></div>
<div style="display:flex;gap:8px;align-items:end"><div class="form-group" style="flex:1;margin:0"><label>Quantidade</label><input class="form-input" id="depTn" inputmode="decimal" placeholder="0"></div><button class="btn btn-primary" data-a="transfer"><i class="fas fa-check"></i> Transferir</button></div>`}</div>
${transfers.length ? `<div class="card" style="padding:16px;margin-top:16px"><h4 style="margin:0 0 8px;font-size:14px">Últimas transferências</h4>${transfers.map(t => `<div style="font-size:12px;padding:6px 0;border-top:1px solid var(--border-color)"><b>${fmt(t.quantity)}</b> × ${esc(t.productName)}<br><span style="color:var(--text-muted)">${esc(nameOf(t.fromId))} → ${esc(nameOf(t.toId))}${t.userName ? ' · ' + esc(t.userName) : ''}</span></div>`).join('')}</div>` : ''}
</div>
<div class="card" style="padding:16px"><div style="display:flex;gap:8px;align-items:center;margin-bottom:10px;flex-wrap:wrap"><h4 style="margin:0 auto 0 0;font-size:15px">Estoque por local</h4><div class="search-box" style="min-width:240px"><i class="fas fa-search"></i><input id="depQ" placeholder="Buscar produto" value="${esc(q)}"></div></div>
<div style="overflow-x:auto;max-height:70vh"><table class="data-table dep-tbl"><thead><tr><th>Produto</th>${locs.map(l => `<th style="text-align:right">${esc(l.name)}</th>`).join('')}<th style="text-align:right">Total</th></tr></thead><tbody>
${list.length ? list.map(p => `<tr><td><b>${esc(p.name)}</b>${p.code ? `<small style="color:var(--text-muted);margin-left:6px">${esc(p.code)}</small>` : ''}</td>${locs.map(l => { const v = qtyAt(p, l.id); return `<td class="q ${v < 0 ? 'dep-neg' : ''}">${fmt(v)}</td>`; }).join('')}<td class="q"><b>${fmt(p.currentStock)}</b></td></tr>`).join('') : `<tr><td colspan="${locs.length + 2}" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum produto.</td></tr>`}
</tbody></table></div></div></div>`;
            const qi = root.querySelector('#depQ'); qi.addEventListener('input', () => { q = qi.value; const pos = qi.selectionStart; render(); const n = root.querySelector('#depQ'); n.focus(); n.setSelectionRange(pos, pos); });
            root.querySelector('#depHere').addEventListener('change', e => { setHere(e.target.value); toast('success', 'Este computador agora usa: ' + nameOf(e.target.value)); render(); });
        }
        async function saveLocs(l, msg) {
            try { await db.collection('settings').doc('general').set({ depositos: l, updatedAt: ts() }, { merge: true }); toast('success', msg); } catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            await refresh();
        }
        root.addEventListener('click', async e => {
            const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a;
            if (a === 'add') { const nm = root.querySelector('#depNew').value.trim(); if (nm.length < 2) { toast('warning', 'Digite o nome do depósito.'); return; } if (locs.some(l => l.name.toLowerCase() === nm.toLowerCase())) { toast('warning', 'Já existe um local com esse nome.'); return; } await saveLocs([...locs, { id: 'dep_' + Date.now().toString(36), name: nm }], 'Depósito cadastrado'); }
            if (a === 'ren') { const l = locs.find(x => x.id === b.dataset.id); const nm = prompt('Novo nome:', l ? l.name : ''); if (!nm || nm.trim().length < 2) return; await saveLocs(locs.map(x => x.id === b.dataset.id ? { ...x, name: nm.trim() } : x), 'Nome alterado'); }
            if (a === 'del') { const id = b.dataset.id; const used = products.filter(p => Number(((p.stockByLocation || {})[id]) || 0) !== 0); if (used.length) { toast('warning', `Este depósito ainda tem estoque de ${used.length} produto(s). Transfira para outro local antes de excluir.`); return; } if (!confirm('Excluir este depósito?')) return; if (here() === id) setHere('principal'); await saveLocs(locs.filter(x => x.id !== id), 'Depósito excluído'); }
            if (a === 'transfer') {
                const txt = root.querySelector('#depTq').value.trim(), f = root.querySelector('#depTf').value, t = root.querySelector('#depTt').value, qn = n3(String(root.querySelector('#depTn').value).replace(',', '.'));
                const p = products.find(x => (x.code ? x.code + ' · ' : '') + x.name === txt) || products.find(x => x.name === txt || x.code === txt || x.barcode === txt);
                if (!p) { toast('warning', 'Escolha o produto na lista.'); return; } if (f === t) { toast('warning', 'Escolha locais diferentes.'); return; } if (!(qn > 0)) { toast('warning', 'Informe a quantidade.'); return; }
                const avail = qtyAt(p, f); if (qn > avail + 1e-9 && !confirm(`Em ${nameOf(f)} há ${fmt(avail)}. Transferir ${fmt(qn)} mesmo assim?`)) return;
                b.disabled = true;
                try {
                    const s = await db.collection('products').doc(p.id).get(); const cur = s.data() || {}; const by = { ...(cur.stockByLocation || {}) };
                    if (f !== 'principal') by[f] = n3(Number(by[f] || 0) - qn);
                    if (t !== 'principal') by[t] = n3(Number(by[t] || 0) + qn);
                    await db.collection('products').doc(p.id).update({ stockByLocation: by });
                    let userName = ''; try { userName = (currentUser && currentUser.name) || ''; } catch (err) { }
                    await db.collection('stock_transfers').add({ productId: p.id, productName: p.name, quantity: qn, fromId: f, toId: t, userId: (auth.currentUser && auth.currentUser.uid) || '', userName, createdAt: ts() });
                    toast('success', `${fmt(qn)} × ${p.name}: ${nameOf(f)} → ${nameOf(t)}`);
                    await refresh();
                } catch (err) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); } finally { b.disabled = false; }
            }
        });
        root.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
        await refresh();
    }

    const start = () => {
        wrapStock();
        if (document.getElementById('depRoot')) { page(); return; }
        load().then(() => { if (/(pdv|compras|estoque|movimentacoes)\.html$/i.test(location.pathname)) chip(); });
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
