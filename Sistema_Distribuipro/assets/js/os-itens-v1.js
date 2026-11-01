/* DistribuiPro 35.11 · Peças e serviços na Ordem de Serviço (avulsos ou do cadastro).
   - Cada item tem custo e preço: a OS mostra custo total e lucro estimado.
   - Peças somam em "Peças (R$)" e serviços em "Mão de obra (R$)" automaticamente.
   - Ao faturar, a venda recebe os itens com o custo (relatórios de lucro corretos);
     peça do cadastro com controle de estoque dá baixa, item avulso não mexe no estoque.
   Sem itens, a OS continua funcionando como antes (valores digitados à mão). */
(function () {
    'use strict';
    if (typeof window.openServiceOrder !== 'function' || !document.getElementById('osModal')) return;
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const fmt = v => (Number(v) || 0) ? (Number(v)).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const fq = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    let items = [], locked = false, catalog = null;

    const css = document.createElement('style');
    css.textContent = `.osi-bar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-bottom:10px}
.osi-search{position:relative;flex:1;min-width:220px}
.osi-res{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:60;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.25);max-height:260px;overflow-y:auto;display:none}
.osi-res.open{display:block}
.osi-res div{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;cursor:pointer;border-bottom:1px solid var(--border-color);font-size:12.5px}
.osi-res div:hover{background:var(--bg-secondary)}.osi-res small{color:var(--text-muted)}.osi-res b{color:var(--success);white-space:nowrap}
.osi-table{width:100%;border-collapse:collapse}
.osi-table th{font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:6px;border-bottom:1px solid var(--border-color)}
.osi-table td{padding:5px 6px;border-bottom:1px solid var(--border-color);vertical-align:middle}
.osi-table input{padding:7px 8px;font-size:12.5px}
.osi-table .n{text-align:right}
.osi-kind{display:inline-block;font-size:10px;font-weight:800;padding:3px 8px;border-radius:99px;white-space:nowrap;cursor:pointer}
.osi-kind.p{background:rgba(59,130,246,.14);color:#3b82f6}.osi-kind.s{background:rgba(168,85,247,.14);color:#a855f7}
.osi-x{border:0;background:rgba(239,68,68,.1);color:#ef4444;width:28px;height:28px;border-radius:8px;cursor:pointer}
.osi-empty{font-size:12px;color:var(--text-muted);text-align:center;padding:14px}
.osi-sum{display:flex;justify-content:flex-end;gap:18px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--text-secondary)}
.osi-sum b{color:var(--text-primary)}.osi-sum .lucro b{color:var(--success)}.osi-sum .lucro.neg b{color:var(--danger,#ef4444)}
.osi-auto{font-size:10px;color:var(--accent);font-weight:700;margin-left:4px}
@media(max-width:700px){.osi-table thead{display:none}.osi-table,.osi-table tbody,.osi-table tr,.osi-table td{display:block;width:100%}.osi-table tr{border:1px solid var(--border-color);border-radius:10px;padding:8px;margin-bottom:8px;position:relative}.osi-table td{border:0;padding:3px 0}.osi-table td.c{display:inline-block;width:calc(33% - 4px)}.osi-table td.x{position:absolute;top:6px;right:6px;width:auto}}`;
    document.head.appendChild(css);

    // Seção na OS, antes do "Orçamento"
    const finance = document.querySelector('#osModal .os-section-finance');
    if (!finance) return;
    const sec = document.createElement('section'); sec.className = 'os-section'; sec.id = 'osiSection';
    sec.innerHTML = `<div class="os-section-title"><span class="os-section-icon"><i class="fas fa-toolbox"></i></span><div><strong>Peças e serviços</strong><small>Item avulso (comprado na hora) ou do cadastro · informe custo e preço para o lucro sair certo</small></div></div>
<div class="osi-bar"><button type="button" class="btn btn-outline btn-sm" data-osi="peca"><i class="fas fa-plus"></i> Peça avulsa</button><button type="button" class="btn btn-outline btn-sm" data-osi="serv"><i class="fas fa-plus"></i> Serviço avulso</button>
<div class="osi-search"><input type="text" class="form-control" id="osiQ" placeholder="Ou busque no cadastro de produtos..." autocomplete="off"><div class="osi-res" id="osiRes"></div></div></div>
<div style="overflow-x:auto"><table class="osi-table"><thead><tr><th>Tipo</th><th>Descrição</th><th class="n">Qtd</th><th class="n">Custo un.</th><th class="n">Preço un.</th><th class="n">Total</th><th></th></tr></thead><tbody id="osiRows"></tbody></table></div>
<div class="osi-sum" id="osiSum"></div>`;
    finance.parentElement.insertBefore(sec, finance);
    const rowsEl = sec.querySelector('#osiRows');

    function render() {
        if (!items.length) {
            rowsEl.innerHTML = `<tr><td colspan="7" class="osi-empty">Nenhum item. Use <b>Peça avulsa</b> / <b>Serviço avulso</b> ou deixe os valores digitados no Orçamento abaixo.</td></tr>`;
        } else rowsEl.innerHTML = items.map((it, i) => `<tr>
<td><span class="osi-kind ${it.kind === 'service' ? 's' : 'p'}" data-i="${i}" data-k="1" title="Trocar tipo">${it.kind === 'service' ? 'SERVIÇO' : 'PEÇA'}</span></td>
<td><input class="form-control" data-i="${i}" data-f="name" value="${esc(it.name)}" placeholder="${it.kind === 'service' ? 'Ex.: Troca de tela' : 'Ex.: Tela iPhone 11'}" ${locked ? 'disabled' : ''}>${it.productId ? '<small style="color:var(--text-muted);font-size:10px">do cadastro' + (it.stock ? ' · baixa no estoque ao faturar' : '') + '</small>' : ''}</td>
<td class="c"><input class="form-control n" data-i="${i}" data-f="qty" inputmode="decimal" value="${fq(it.qty)}" ${locked ? 'disabled' : ''}></td>
<td class="c"><input class="form-control n" data-i="${i}" data-f="cost" inputmode="decimal" value="${fmt(it.cost)}" placeholder="0,00" ${locked ? 'disabled' : ''}></td>
<td class="c"><input class="form-control n" data-i="${i}" data-f="price" inputmode="decimal" value="${fmt(it.price)}" placeholder="0,00" ${locked ? 'disabled' : ''}></td>
<td class="n" id="osiT${i}"><b>${money(it.qty * it.price)}</b></td>
<td class="x">${locked ? '' : `<button type="button" class="osi-x" data-del="${i}" title="Remover"><i class="fas fa-trash"></i></button>`}</td></tr>`).join('');
        sync();
    }
    function sync() {
        const parts = r2(items.filter(i => i.kind !== 'service').reduce((s, i) => s + i.qty * i.price, 0));
        const labor = r2(items.filter(i => i.kind === 'service').reduce((s, i) => s + i.qty * i.price, 0));
        const cost = r2(items.reduce((s, i) => s + i.qty * i.cost, 0));
        const lab = document.getElementById('osLabor'), pv = document.getElementById('osPartsValue');
        [lab, pv].forEach(el => { if (!el) return; el.readOnly = items.length > 0; const l = el.closest('.form-group')?.querySelector('.form-label'); if (l) { l.querySelector('.osi-auto')?.remove(); if (items.length) l.insertAdjacentHTML('beforeend', '<span class="osi-auto">· pelos itens</span>'); } });
        if (items.length && !locked) { if (lab) lab.value = labor.toFixed(2); if (pv) pv.value = parts.toFixed(2); try { calcOsTotal(); } catch (e) { } }
        const disc = Math.max(0, num(document.getElementById('osDiscount')?.value));
        const total = Math.max(0, parts + labor - disc), profit = r2(total - cost);
        document.getElementById('osiSum').innerHTML = items.length
            ? `<span>Peças: <b>${money(parts)}</b></span><span>Serviços: <b>${money(labor)}</b></span><span>Custo: <b>${money(cost)}</b></span><span class="lucro ${profit < 0 ? 'neg' : ''}">Lucro estimado: <b>${money(profit)}</b></span>` : '';
    }
    function add(kind, extra) {
        items.push(Object.assign({ kind, name: '', qty: 1, cost: 0, price: 0, productId: '', stock: false }, extra || {}));
        render();
        if (!extra) { const inputs = rowsEl.querySelectorAll('input[data-f="name"]'); inputs[inputs.length - 1]?.focus(); }
    }
    sec.addEventListener('click', e => {
        if (locked) return;
        const b = e.target.closest('[data-osi]'); if (b) add(b.dataset.osi === 'serv' ? 'service' : 'part');
        const d = e.target.closest('[data-del]'); if (d) { items.splice(Number(d.dataset.del), 1); render(); }
        const k = e.target.closest('[data-k]'); if (k) { const it = items[Number(k.dataset.i)]; it.kind = it.kind === 'service' ? 'part' : 'service'; render(); }
        const r = e.target.closest('#osiRes [data-pid]'); if (r) pickProduct(r.dataset.pid);
    });
    rowsEl.addEventListener('input', e => {
        const el = e.target.closest('[data-f]'); if (!el) return;
        const it = items[Number(el.dataset.i)]; if (!it) return;
        if (el.dataset.f === 'name') it.name = el.value;
        else it[el.dataset.f] = el.dataset.f === 'qty' ? Math.round(num(el.value) * 1000) / 1000 : r2(num(el.value));
        const t = document.getElementById('osiT' + el.dataset.i); if (t) t.innerHTML = `<b>${money(it.qty * it.price)}</b>`;
        sync();
    });
    document.getElementById('osDiscount')?.addEventListener('input', sync);

    // Busca no cadastro
    const q = sec.querySelector('#osiQ'), res = sec.querySelector('#osiRes');
    async function loadCatalog() { if (catalog) return catalog; try { catalog = (await simpleList('products', 'name', 'asc', 10000)).filter(p => p.status !== 'inactive' && p.active !== false); } catch (e) { catalog = []; } return catalog; }
    q.addEventListener('input', async () => {
        const t = norm(q.value).trim(); if (!t) { res.classList.remove('open'); return; }
        const DI = window.DPItens; // 38.2 · aplicação e referência da peça (itens-cliente-v1.js)
        const list = (await loadCatalog()).filter(p => !p.isGradeParent && (norm([p.name, p.code, p.barcode].join(' ')).includes(t) || !!(DI && DI.prodMatch(p, t)))).slice(0, 30); // 38.6 · grade: escolhe o tamanho/cor, não o pai
        res.innerHTML = list.length ? list.map(p => `<div data-pid="${esc(p.id)}"><span>${esc(p.name)}<br><small>${esc(p.code || '')}${p.productType === 'service' || p.controlStock === false ? ' · serviço' : ' · estoque ' + fq(p.currentStock || 0)}</small>${DI && DI.prodInfo(p) ? `<small style="display:block">${DI.prodInfo(p)}</small>` : ''}</span><b>${money(p.salePrice)}</b></div>`).join('') : '<div style="cursor:default"><small>Nada no cadastro. Use Peça avulsa ou Serviço avulso.</small></div>';
        res.classList.add('open');
    });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); res.querySelector('[data-pid]')?.click(); } if (e.key === 'Escape') res.classList.remove('open'); });
    document.addEventListener('click', e => { if (!e.target.closest('.osi-search')) res.classList.remove('open'); });
    function pickProduct(id) {
        const p = (catalog || []).find(x => x.id === id); if (!p) return;
        const svc = p.productType === 'service' || p.controlStock === false;
        add(svc ? 'service' : 'part', { name: p.name, qty: 1, cost: r2(p.costPrice), price: r2(p.promoPrice > 0 ? p.promoPrice : p.salePrice), productId: p.id, stock: !svc });
        q.value = ''; res.classList.remove('open');
    }

    // Abrir OS: carrega os itens salvos
    const oOpen = window.openServiceOrder;
    window.openServiceOrder = function (id = null) {
        const r = oOpen.apply(this, arguments);
        try {
            const o = id ? (serviceOrders || []).find(x => x.id === id) : null;
            items = Array.isArray(o?.items) ? o.items.map(x => ({ kind: x.kind === 'service' ? 'service' : 'part', name: x.name || '', qty: Number(x.qty) || 1, cost: Number(x.cost) || 0, price: Number(x.price) || 0, productId: x.productId || '', stock: !!x.stock })) : [];
            locked = !!(o && o.saleId);
            sec.querySelectorAll('.osi-bar button, #osiQ').forEach(el => { el.disabled = locked; });
            render();
        } catch (e) { console.warn('itens da OS', e); }
        return r;
    };

    // Salvar OS: grava os itens junto
    const oSave = window.saveServiceOrder;
    window.saveServiceOrder = async function () {
        const editing = (() => { try { return editingOsId; } catch (e) { return null; } })();
        const clean = items.filter(i => i.name.trim() && i.qty > 0).map(i => ({ kind: i.kind, name: i.name.trim(), qty: i.qty, cost: r2(i.cost), price: r2(i.price), productId: i.productId || '', stock: !!i.stock }));
        if (items.length && !locked) {
            if (items.some(i => i.name.trim() && !(i.price > 0) && i.kind === 'service')) { /* serviço sem preço é permitido (cortesia) */ }
            sync();
            // A térmica imprime "Peças / itens": se estiver vazio, preenche com a lista
            const pt = document.getElementById('osParts');
            if (pt && !pt.value.trim()) pt.value = clean.map(i => `${fq(i.qty)}x ${i.name}`).join('; ');
        }
        const before = new Set(((() => { try { return serviceOrders; } catch (e) { return []; } })() || []).map(o => o.id));
        const r = await oSave.apply(this, arguments);
        if (locked) return r;
        try {
            let id = null;
            if (editing) { if (!document.getElementById('osModal')?.classList.contains('active')) id = editing; }
            else { const created = (serviceOrders || []).filter(o => !before.has(o.id)).sort((a, b) => Number(b.orderNumber || 0) - Number(a.orderNumber || 0))[0]; if (created) id = created.id; }
            if (id) {
                await db.collection('service_orders').doc(id).set({ items: clean, costTotal: r2(clean.reduce((s, i) => s + i.qty * i.cost, 0)) }, { merge: true });
                const o = (serviceOrders || []).find(x => x.id === id); if (o) { o.items = clean; o.costTotal = r2(clean.reduce((s, i) => s + i.qty * i.cost, 0)); }
            }
        } catch (e) { window.Toast?.warning?.('A OS foi salva, mas os itens não: ' + e.message); }
        return r;
    };

    // Faturar: a venda recebe os itens com custo; peça do cadastro baixa o estoque
    if (typeof ServiceOrderService !== 'undefined' && ServiceOrderService && typeof ServiceOrderService.receivePayment === 'function' && !ServiceOrderService.__osi) {
        ServiceOrderService.__osi = true;
        const oRecv = ServiceOrderService.receivePayment;
        ServiceOrderService.receivePayment = async function (orderId) {
            const r = await oRecv.apply(this, arguments);
            try {
                const snap = await db.collection('service_orders').doc(orderId).get();
                const o = snap.exists ? snap.data() : null;
                const list = o && Array.isArray(o.items) ? o.items : [];
                if (r && r.saleId && list.length) {
                    const label = `OS #${String(o.orderNumber || 0).padStart(4, '0')}`;
                    const saleItems = list.map(i => ({ productId: i.productId || '', productName: i.name, quantity: Number(i.qty) || 1, unitPrice: r2(i.price), originalUnitPrice: r2(i.price), costPrice: r2(i.cost), discount: 0, total: r2((Number(i.qty) || 1) * i.price), subtotal: r2((Number(i.qty) || 1) * i.price), isService: i.kind === 'service', serviceOrderId: orderId, _factor: 1 }));
                    await db.collection('sales').doc(r.saleId).set({ items: saleItems, itemCount: saleItems.length, costTotal: r2(list.reduce((s, i) => s + (Number(i.qty) || 1) * (Number(i.cost) || 0), 0)), notes: `Recebimento da ${label}` }, { merge: true });
                    if (typeof StockService !== 'undefined' && StockService && typeof StockService.exit === 'function') {
                        for (const i of list) if (i.productId && i.stock) { try { await StockService.exit(i.productId, Number(i.qty) || 1, label, 'service_order', orderId); } catch (e) { console.warn('baixa da peça', e); } }
                    }
                }
            } catch (e) { console.warn('itens da venda da OS', e); }
            return r;
        };
    }
    render();
})();
