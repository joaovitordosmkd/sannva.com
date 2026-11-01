/* DistribuiPro 36.6 · Consignado — consignado.html
   Remessa: mercadoria sai do estoque e fica "em poder do cliente". Acerto: o que vendeu vira uma venda (com a forma de
   pagamento escolhida, entra no caixa e no fiado), o que devolveu volta para o estoque. Pode acertar aos poucos.
   Coleção: consignments. Numeração em settings/general.consignmentSequence. Funciona nas 5 versões. */
(function () {
    'use strict';
    const root = document.getElementById('conRoot');
    if (!root) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qty = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => Number(v) || 0;
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const TSc = () => window.DPTimestamp || (window.firebase && firebase.firestore && firebase.firestore.Timestamp);
    const ts = () => FV().serverTimestamp();
    const tsAt = d => { const T = TSc(); return T && typeof T.fromDate === 'function' ? T.fromDate(d) : d; };
    const uid = () => (auth.currentUser && auth.currentUser.uid) || '';
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } }; // currentUser é "let" do app.js (fora do window)
    const meName = () => me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador';
    const toDate = v => { if (!v) return null; try { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); } const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day0 = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const COL = 'consignments';
    const conNo = c => '#C-' + String(c.number || 0).padStart(4, '0');
    const pendQty = i => Math.max(0, num(i.quantity) - num(i.soldQty) - num(i.returnedQty));
    const pendOf = c => (c.items || []).reduce((a, i) => a + pendQty(i), 0);
    const pendValue = c => r2((c.items || []).reduce((a, i) => a + pendQty(i) * num(i.unitPrice), 0));
    const totalValue = c => r2((c.items || []).reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0));
    const soldValue = c => r2((c.items || []).reduce((a, i) => a + num(i.soldQty) * num(i.unitPrice), 0));
    const STATUS = { open: ['Em aberto', 'badge-info'], partial: ['Acerto parcial', 'badge-warning'], closed: ['Fechada', 'badge-success'], cancelled: ['Cancelada', 'badge-danger'] };
    let list = [], customers = null, products = null, users = null, company = null;
    const filter = { q: '', st: 'open' };

    const st = document.createElement('style');
    st.textContent = `.con-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:16px}.con-stat{background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;padding:14px 16px}.con-stat small{display:block;font-size:11px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.4px}.con-stat b{display:block;font-size:20px;font-weight:800;margin-top:4px}.con-m .modal{max-width:780px;width:96%}.con-m table{width:100%;border-collapse:collapse;font-size:13px}.con-m th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:6px;border-bottom:1px solid var(--border-color)}.con-m td{padding:6px;border-bottom:1px solid var(--border-color);vertical-align:middle}.con-m td input{width:82px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;text-align:right}.con-m .dd{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;z-index:30;max-height:230px;overflow:auto;box-shadow:var(--shadow-lg)}.con-m .dd div{padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color)}.con-m .dd div:hover{background:var(--bg-secondary)}.con-m .chip{display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,.12);color:#059669;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700}.con-m .sec{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px}.con-m .tot{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}.con-m .tot.b{font-weight:800;font-size:16px;border-top:1px solid var(--border-color);margin-top:4px;padding-top:8px}.con-late{color:var(--danger);font-weight:700}.con-row-actions{display:flex;gap:4px;flex-wrap:wrap}@media(max-width:768px){.con-hide{display:none}}`;
    document.head.appendChild(st);

    /* ---------- dados ---------- */
    async function load() { try { list = (await simpleList(COL, 'createdAt', 'desc', 3000)).filter(c => !c.deleted); } catch (e) { console.error(e); toast('error', 'Erro ao carregar consignados: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } render(); }
    async function loadCustomers() { if (!customers) customers = (await simpleList('customers', 'name', 'asc', 10000)).filter(c => !c.deleted && c.status !== 'inactive'); return customers; }
    async function loadProducts() { if (!products) products = (await simpleList('products', 'name', 'asc', 10000)).filter(p => !p.deleted && p.status !== 'inactive'); return products; }
    async function loadUsers() { if (!users) users = (await simpleList('users', 'name', 'asc', 1000)).filter(u => !u.deleted && u.status !== 'inactive'); return users; }
    async function loadCompany() {
        if (company) return company;
        const c = { name: 'DistribuiPRO', doc: '', phone: '', address: '' };
        try { const d = await db.collection('settings').doc('general').get(); const g = d.exists ? (d.data() || {}) : {}; let brand = {}; try { brand = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {}; } catch (e) { } c.name = g.nomeFantasia || brand.companyName || g.razaoSocial || c.name; c.doc = g.cnpj || ''; c.phone = g.telefone || g.whatsapp || ''; c.address = [[g.logradouro, g.numero].filter(Boolean).join(', '), g.bairro, [g.cidade, g.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · '); } catch (e) { }
        company = c; return c;
    }
    async function nextNumber() {
        const ref = db.collection('settings').doc('general'); const d = await ref.get();
        const n = (d.exists ? num((d.data() || {}).consignmentSequence) : 0) + 1;
        await ref.set({ consignmentSequence: n }, { merge: true }); return n;
    }
    async function openCash() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { }
        try { const s = await db.collection('cash_registers').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.status === 'open') || null; } catch (e) { return null; }
    }

    /* ---------- tela ---------- */
    function render() {
        const today = day0();
        const open = list.filter(c => ['open', 'partial'].includes(c.status));
        const inHands = r2(open.reduce((a, c) => a + pendValue(c), 0));
        const late = open.filter(c => { const d = toDate(c.dueDate); return d && day0(d) < today; });
        const mStart = new Date(today.getFullYear(), today.getMonth(), 1);
        const soldMonth = r2(list.reduce((a, c) => a + (c.settlements || []).filter(s => { const d = toDate(s.at); return d && d >= mStart; }).reduce((b, s) => b + num(s.soldValue), 0), 0));
        let rows = list.slice();
        if (filter.st === 'open') rows = rows.filter(c => ['open', 'partial'].includes(c.status));
        else if (filter.st === 'late') rows = late;
        else if (filter.st !== 'all') rows = rows.filter(c => c.status === filter.st);
        if (filter.q) { const q = norm(filter.q); rows = rows.filter(c => norm(c.customerName).includes(q) || String(c.number || '').includes(q) || (c.items || []).some(i => norm(i.productName).includes(q))); }
        root.innerHTML = `
        <div class="con-stats">
          <div class="con-stat"><small>Em poder de clientes</small><b style="color:var(--accent)">${money(inHands)}</b><span style="font-size:11px;color:var(--text-muted)">${open.length} remessa(s) em aberto</span></div>
          <div class="con-stat"><small>Acertos no mês</small><b style="color:var(--success)">${money(soldMonth)}</b><span style="font-size:11px;color:var(--text-muted)">vendido via consignado</span></div>
          <div class="con-stat"><small>Acerto atrasado</small><b style="color:${late.length ? 'var(--danger)' : 'var(--text-primary)'}">${late.length}</b><span style="font-size:11px;color:var(--text-muted)">passou a data prevista</span></div>
          <div class="con-stat"><small>Clientes com consignado</small><b>${new Set(open.map(c => c.customerId || c.customerName)).size}</b><span style="font-size:11px;color:var(--text-muted)">no momento</span></div>
        </div>
        <div class="card" style="padding:0">
          <div class="toolbar" style="padding:14px 18px;border-bottom:1px solid var(--border-color);display:flex;gap:10px;flex-wrap:wrap;align-items:center">
            <div class="toolbar-search" style="flex:1;min-width:200px"><input type="text" id="conQ" placeholder="Buscar por cliente, número ou produto..." value="${esc(filter.q)}"><i class="fas fa-search"></i></div>
            <select class="toolbar-select" id="conSt"><option value="open" ${filter.st === 'open' ? 'selected' : ''}>Em aberto</option><option value="late" ${filter.st === 'late' ? 'selected' : ''}>Atrasadas</option><option value="closed" ${filter.st === 'closed' ? 'selected' : ''}>Fechadas</option><option value="cancelled" ${filter.st === 'cancelled' ? 'selected' : ''}>Canceladas</option><option value="all" ${filter.st === 'all' ? 'selected' : ''}>Todas</option></select>
            <button class="btn btn-primary" id="conNew"><i class="fas fa-plus"></i> Nova remessa</button>
          </div>
          <div class="table-container"><table class="data-table"><thead><tr><th>Nº</th><th>Cliente</th><th class="con-hide">Saída</th><th>Prev. acerto</th><th class="con-hide">Vendedor</th><th>Pendente</th><th>Em aberto (R$)</th><th>Status</th><th>Ações</th></tr></thead><tbody>
            ${rows.length ? rows.map(c => { const d = toDate(c.dueDate); const isLate = d && day0(d) < today && ['open', 'partial'].includes(c.status); const [lbl, cls] = STATUS[c.status] || [c.status, 'badge-info']; return `<tr>
              <td><strong>${conNo(c)}</strong></td>
              <td><strong style="color:var(--text-primary)">${esc(c.customerName)}</strong>${c.customerPhone ? `<div style="font-size:11px;color:var(--text-muted)">${esc(c.customerPhone)}</div>` : ''}</td>
              <td class="con-hide">${fmtD(c.createdAt)}</td>
              <td class="${isLate ? 'con-late' : ''}">${fmtD(c.dueDate)}${isLate ? ' <i class="fas fa-triangle-exclamation" title="Atrasado"></i>' : ''}</td>
              <td class="con-hide" style="font-size:12px">${esc(c.sellerName || '—')}</td>
              <td>${qty(pendOf(c))} / ${qty((c.items || []).reduce((a, i) => a + num(i.quantity), 0))} un</td>
              <td style="font-weight:700">${money(pendValue(c))}</td>
              <td><span class="badge ${cls}">${lbl}</span></td>
              <td><div class="con-row-actions">${['open', 'partial'].includes(c.status) ? `<button class="btn btn-sm btn-success" style="font-size:11px;padding:4px 10px" data-act="settle" data-id="${c.id}"><i class="fas fa-hand-holding-dollar"></i> Acertar</button>` : ''}<button class="btn-icon" title="Ver detalhes" data-act="view" data-id="${c.id}"><i class="fas fa-eye"></i></button><button class="btn-icon" title="Imprimir comprovante" data-act="print" data-id="${c.id}"><i class="fas fa-print"></i></button>${c.customerPhone ? `<a class="btn-icon" title="WhatsApp" style="color:#25d366" target="_blank" href="https://wa.me/55${String(c.customerPhone).replace(/\D/g, '')}?text=${encodeURIComponent(`Olá ${c.customerName}! Sobre a mercadoria em consignação (${conNo(c)}), podemos combinar o acerto? Valor em aberto: ${money(pendValue(c))}.`)}"><i class="fab fa-whatsapp"></i></a>` : ''}${c.status === 'open' && !(c.settlements || []).length ? `<button class="btn-icon btn-danger" title="Cancelar remessa (devolve tudo ao estoque)" data-act="cancel" data-id="${c.id}"><i class="fas fa-ban"></i></button>` : ''}</div></td>
            </tr>`; }).join('') : `<tr><td colspan="9" style="text-align:center;padding:36px;color:var(--text-muted)"><i class="fas fa-box-open" style="font-size:28px;opacity:.3;display:block;margin-bottom:8px"></i>${filter.q || filter.st !== 'open' ? 'Nenhuma remessa encontrada.' : 'Nenhuma mercadoria em consignação. Clique em "Nova remessa" para começar.'}</td></tr>`}
          </tbody></table></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:12px"><i class="fas fa-circle-info" style="margin-right:5px"></i>Como funciona: na <b>remessa</b> a mercadoria sai do estoque e fica com o cliente. No <b>acerto</b>, o que ele vendeu vira uma venda (entra no caixa, fiado ou cartão) e o que devolveu volta ao estoque. Dá para acertar em partes.</div>`;
        $('conQ').oninput = e => { filter.q = e.target.value; render(); const i = $('conQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
        $('conSt').onchange = e => { filter.st = e.target.value; render(); };
        $('conNew').onclick = openNew;
        root.querySelectorAll('[data-act]').forEach(b => b.onclick = () => { const c = list.find(x => x.id === b.dataset.id); if (!c) return; ({ settle: openSettle, view: openView, print: printRemessa, cancel: cancelRemessa })[b.dataset.act](c); });
    }

    /* ---------- nova remessa ---------- */
    async function openNew() {
        if (document.querySelector('.con-m')) return;
        try { await Promise.all([loadCustomers(), loadUsers()]); } catch (e) { toast('error', 'Erro ao carregar cadastros: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        const state = { customerId: '', customerName: '', customerPhone: '', items: [] };
        const def = new Date(); def.setDate(def.getDate() + 15);
        const myId = uid();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active con-m';
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-box-open" style="color:var(--accent);margin-right:8px"></i>Nova remessa em consignação</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0;position:relative"><label class="form-label">Cliente *</label><input type="text" class="form-control" id="conCustQ" placeholder="Buscar por nome ou telefone..." autocomplete="off"><div class="dd" id="conCustDD" style="display:none"></div><div id="conCustChip" style="margin-top:6px;font-size:12px;color:var(--text-muted)">Nenhum cliente escolhido</div></div>
              <div class="form-group" style="margin:0"><label class="form-label">Vendedor / responsável</label><select class="form-control" id="conSeller">${users.map(u => `<option value="${esc(u.id)}" ${u.id === myId ? 'selected' : ''}>${esc(u.name || u.nome || u.email)}</option>`).join('')}</select></div>
              <div class="form-group" style="margin:0"><label class="form-label">Previsão do acerto</label><input type="date" class="form-control" id="conDue" value="${ymd(def)}"></div>
              <div class="form-group" style="margin:0"><label class="form-label">Observações</label><input type="text" class="form-control" id="conNotes" placeholder="Ex: acerto toda sexta, buscar sobras..."></div>
            </div>
            <div class="sec">Mercadorias</div>
            <div style="position:relative;margin-bottom:8px"><input type="text" class="form-control" id="conProdQ" placeholder="+ Adicionar produto: digite nome ou código..." autocomplete="off"><div class="dd" id="conProdDD" style="display:none"></div></div>
            <div style="overflow:auto"><table><thead><tr><th>Produto</th><th style="text-align:right">Estoque</th><th style="text-align:right">Qtd</th><th style="text-align:right">Preço un.</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody id="conItems"></tbody></table></div>
            <div style="margin-top:10px;max-width:320px;margin-left:auto" id="conTotals"></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-primary" type="button" id="conSave"><i class="fas fa-check"></i> Salvar remessa</button></div></div>`;
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-x]').forEach(x => x.onclick = () => ov.remove());
        const cq = ov.querySelector('#conCustQ'), cdd = ov.querySelector('#conCustDD'), chip = ov.querySelector('#conCustChip');
        const paintChip = () => { chip.innerHTML = state.customerId ? `<span class="chip"><i class="fas fa-circle-check"></i>${esc(state.customerName)}${state.customerPhone ? ' · ' + esc(state.customerPhone) : ''}</span>` : 'Nenhum cliente escolhido'; };
        cq.oninput = () => { const q = norm(cq.value.trim()); if (q.length < 2) { cdd.style.display = 'none'; return; } const dig = q.replace(/\D/g, ''); const hits = customers.filter(c => norm(c.name || c.nome).includes(q) || (dig.length >= 3 && String((c.phone || '') + (c.whatsapp || '')).replace(/\D/g, '').includes(dig))).slice(0, 8); cdd.innerHTML = hits.length ? hits.map(c => `<div data-id="${esc(c.id)}"><b>${esc(c.name || c.nome)}</b>${c.phone ? ` <span style="color:var(--text-muted);font-size:11px">· ${esc(c.phone)}</span>` : ''}</div>`).join('') : '<div style="color:var(--text-muted)">Nenhum cliente. Cadastre em Clientes.</div>'; cdd.style.display = 'block'; cdd.querySelectorAll('[data-id]').forEach(d => d.onclick = () => { const c = customers.find(x => x.id === d.dataset.id); if (c) { state.customerId = c.id; state.customerName = c.name || c.nome || ''; state.customerPhone = c.whatsapp || c.phone || ''; } cq.value = ''; cdd.style.display = 'none'; paintChip(); }); };
        const tb = ov.querySelector('#conItems'), tot = ov.querySelector('#conTotals');
        const paintItems = () => {
            tb.innerHTML = state.items.map((i, k) => `<tr><td><b>${esc(i.productName)}</b>${i.productCode ? `<div style="font-size:11px;color:var(--text-muted)">${esc(i.productCode)}</div>` : ''}</td><td style="text-align:right;color:${num(i.stock) < num(i.quantity) ? 'var(--danger)' : 'var(--text-muted)'}">${qty(i.stock)}</td><td style="text-align:right"><input type="number" step="any" min="0" value="${num(i.quantity)}" data-k="${k}" data-f="quantity"></td><td style="text-align:right"><input type="number" step="0.01" min="0" value="${num(i.unitPrice).toFixed(2)}" data-k="${k}" data-f="unitPrice"></td><td style="text-align:right;font-weight:700;white-space:nowrap">${money(num(i.quantity) * num(i.unitPrice))}</td><td><button type="button" class="btn-icon btn-danger" data-rm="${k}"><i class="fas fa-trash"></i></button></td></tr>`).join('') || '<tr><td colspan="6" style="text-align:center;color:var(--text-muted);padding:14px">Nenhum produto. Busque acima para adicionar.</td></tr>';
            const total = r2(state.items.reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0)), units = state.items.reduce((a, i) => a + num(i.quantity), 0);
            tot.innerHTML = `<div class="tot"><span>Itens</span><b>${state.items.length} · ${qty(units)} un</b></div><div class="tot b"><span>Valor da remessa</span><b style="color:var(--accent)">${money(total)}</b></div>`;
            tb.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const it = state.items[Number(inp.dataset.k)]; if (it) it[inp.dataset.f] = Math.max(0, Number(inp.value) || 0); paintItems(); });
            tb.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { state.items.splice(Number(b.dataset.rm), 1); paintItems(); });
        };
        paintItems();
        const pq = ov.querySelector('#conProdQ'), pdd = ov.querySelector('#conProdDD');
        pq.oninput = async () => {
            const q = norm(pq.value.trim()); if (q.length < 2) { pdd.style.display = 'none'; return; }
            if (!products) { pdd.innerHTML = '<div style="color:var(--text-muted)">Carregando produtos...</div>'; pdd.style.display = 'block'; try { await loadProducts(); } catch (e) { products = []; } }
            const hits = products.filter(p => p.productType !== 'service' && !p.isGradeParent && (norm(p.name).includes(q) || norm(p.code || p.sku || p.barcode || '').includes(q))).slice(0, 8);
            pdd.innerHTML = hits.length ? hits.map(p => `<div data-id="${esc(p.id)}"><b>${esc(p.name)}</b> <span style="color:var(--text-muted);font-size:11px">· ${money(p.salePrice)} · estoque ${qty(p.currentStock)}</span></div>`).join('') : '<div style="color:var(--text-muted)">Nenhum produto encontrado</div>';
            pdd.style.display = 'block';
            pdd.querySelectorAll('[data-id]').forEach(d => d.onclick = () => { const p = products.find(x => x.id === d.dataset.id); if (p) { const ex = state.items.find(i => i.productId === p.id); if (ex) ex.quantity = num(ex.quantity) + 1; else state.items.push({ productId: p.id, productName: p.name, productCode: p.code || '', unitPrice: num(p.salePrice), costPrice: num(p.costPrice), quantity: 1, soldQty: 0, returnedQty: 0, _factor: 1, stock: num(p.currentStock) }); } pq.value = ''; pdd.style.display = 'none'; paintItems(); pq.focus(); });
        };
        document.addEventListener('click', e => { if (!ov.contains(e.target)) return; if (!e.target.closest('#conCustQ,#conCustDD')) cdd.style.display = 'none'; if (!e.target.closest('#conProdQ,#conProdDD')) pdd.style.display = 'none'; });
        const save = ov.querySelector('#conSave');
        save.onclick = async () => {
            if (!state.customerId) { toast('warning', 'Escolha o cliente da remessa.'); cq.focus(); return; }
            const items = state.items.filter(i => num(i.quantity) > 0);
            if (!items.length) { toast('warning', 'Adicione pelo menos um produto com quantidade.'); return; }
            const short = items.filter(i => num(i.stock) < num(i.quantity));
            if (short.length && !confirm(`Estoque insuficiente em: ${short.map(i => i.productName).join(', ')}. Salvar mesmo assim?`)) return;
            save.disabled = true; save.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                const sel = ov.querySelector('#conSeller'); const seller = users.find(u => u.id === sel.value) || {};
                const dueStr = ov.querySelector('#conDue').value; const due = dueStr ? toDate(dueStr) : null;
                const number = await nextNumber();
                const doc = {
                    number, customerId: state.customerId, customerName: state.customerName, customerPhone: state.customerPhone,
                    sellerId: sel.value || uid(), sellerName: seller.name || seller.nome || meName(),
                    items: items.map(i => ({ productId: i.productId, productName: i.productName, productCode: i.productCode, unitPrice: r2(i.unitPrice), costPrice: r2(i.costPrice), quantity: num(i.quantity), soldQty: 0, returnedQty: 0, _factor: 1 })),
                    totalQty: items.reduce((a, i) => a + num(i.quantity), 0), totalValue: r2(items.reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0)), settledValue: 0,
                    status: 'open', dueDate: due ? tsAt(due) : null, notes: ov.querySelector('#conNotes').value.trim(), settlements: [],
                    createdAt: ts(), updatedAt: ts(), createdBy: uid(), createdByName: meName(), deleted: false
                };
                const ref = await db.collection(COL).add(doc);
                for (const i of items) { try { await StockService.exit(i.productId, num(i.quantity), `Consignado ${conNo(doc)} — ${state.customerName}`, 'consignment', ref.id); } catch (e) { console.warn('estoque:', e); } }
                try { AuditService.log('create', 'consignments', ref.id, { number, customer: state.customerName, total: doc.totalValue }); } catch (e) { }
                ov.remove(); toast('success', `Remessa ${conNo(doc)} salva! Estoque baixado.`);
                await load();
                const c = list.find(x => x.id === ref.id); if (c && confirm('Imprimir o comprovante para o cliente assinar?')) printRemessa(c);
            } catch (e) { console.error(e); toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); save.disabled = false; save.innerHTML = '<i class="fas fa-check"></i> Salvar remessa'; }
        };
        setTimeout(() => cq.focus(), 60);
    }

    /* ---------- acerto ---------- */
    async function openSettle(c) {
        if (document.querySelector('.con-m')) return;
        const pend = (c.items || []).map((i, idx) => ({ ...i, idx, pend: pendQty(i) })).filter(i => i.pend > 0);
        if (!pend.length) { toast('info', 'Nada pendente nesta remessa.'); return; }
        const ov = document.createElement('div'); ov.className = 'modal-overlay active con-m';
        const dueDef = new Date(); dueDef.setDate(dueDef.getDate() + 30);
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-hand-holding-dollar" style="color:var(--success);margin-right:8px"></i>Acerto ${conNo(c)} · ${esc(c.customerName)}</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px"><button type="button" class="btn btn-sm btn-outline" id="conAllSold" style="font-size:11px"><i class="fas fa-check-double"></i> Vendeu tudo</button><button type="button" class="btn btn-sm btn-outline" id="conAllBack" style="font-size:11px"><i class="fas fa-rotate-left"></i> Devolveu tudo</button><span style="font-size:11px;color:var(--text-muted);align-self:center">Informe por item o que foi vendido e o que voltou; o resto continua com o cliente.</span></div>
            <div style="overflow:auto"><table><thead><tr><th>Produto</th><th style="text-align:right">Pendente</th><th style="text-align:right">Vendido</th><th style="text-align:right">Devolvido</th><th style="text-align:right">Fica</th><th style="text-align:right">R$ vendido</th></tr></thead><tbody id="conSetItems"></tbody></table></div>
            <div class="sec">Pagamento do que foi vendido</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0"><label class="form-label">Forma</label><select class="form-control" id="conPay"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Cartão débito</option><option value="credito">Cartão crédito</option><option value="fiado">Fiado (contas a receber)</option></select></div>
              <div class="form-group" style="margin:0" id="conDueWrap" hidden><label class="form-label">Vencimento do fiado</label><input type="date" class="form-control" id="conPayDue" value="${ymd(dueDef)}"></div>
            </div>
            <div style="margin-top:10px;max-width:340px;margin-left:auto" id="conSetTot"></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-success" type="button" id="conSetOk"><i class="fas fa-check"></i> Confirmar acerto</button></div></div>`;
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-x]').forEach(x => x.onclick = () => ov.remove());
        const tb = ov.querySelector('#conSetItems'), tot = ov.querySelector('#conSetTot'), pay = ov.querySelector('#conPay');
        pay.onchange = () => { ov.querySelector('#conDueWrap').hidden = pay.value !== 'fiado'; };
        const vals = pend.map(i => ({ sold: 0, back: 0 }));
        const paint = () => {
            tb.innerHTML = pend.map((i, k) => { const v = vals[k]; const stay = Math.max(0, i.pend - v.sold - v.back); return `<tr><td><b>${esc(i.productName)}</b><div style="font-size:11px;color:var(--text-muted)">${money(i.unitPrice)} /un</div></td><td style="text-align:right">${qty(i.pend)}</td><td style="text-align:right"><input type="number" step="any" min="0" max="${i.pend}" value="${v.sold}" data-k="${k}" data-f="sold"></td><td style="text-align:right"><input type="number" step="any" min="0" max="${i.pend}" value="${v.back}" data-k="${k}" data-f="back"></td><td style="text-align:right;color:${stay > 0 ? 'var(--warning)' : 'var(--text-muted)'}">${qty(stay)}</td><td style="text-align:right;font-weight:700">${money(v.sold * num(i.unitPrice))}</td></tr>`; }).join('');
            const soldV = r2(pend.reduce((a, i, k) => a + vals[k].sold * num(i.unitPrice), 0)), backN = pend.reduce((a, i, k) => a + vals[k].back, 0), stayN = pend.reduce((a, i, k) => a + Math.max(0, i.pend - vals[k].sold - vals[k].back), 0);
            tot.innerHTML = `<div class="tot"><span>Devolvido ao estoque</span><b>${qty(backN)} un</b></div><div class="tot"><span>Continua com o cliente</span><b>${qty(stayN)} un</b></div><div class="tot b"><span>Total vendido (a receber)</span><b style="color:var(--success)">${money(soldV)}</b></div>`;
            tb.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const k = Number(inp.dataset.k), v = vals[k], i = pend[k]; let n = Math.max(0, Number(inp.value) || 0); const other = inp.dataset.f === 'sold' ? v.back : v.sold; if (n + other > i.pend + 1e-9) { n = Math.max(0, i.pend - other); toast('warning', 'Vendido + devolvido não pode passar do pendente.'); } v[inp.dataset.f] = n; paint(); });
        };
        ov.querySelector('#conAllSold').onclick = () => { pend.forEach((i, k) => { vals[k] = { sold: i.pend, back: 0 }; }); paint(); };
        ov.querySelector('#conAllBack').onclick = () => { pend.forEach((i, k) => { vals[k] = { sold: 0, back: i.pend }; }); paint(); };
        paint();
        const ok = ov.querySelector('#conSetOk');
        ok.onclick = async () => {
            const sold = pend.map((i, k) => ({ ...i, n: vals[k].sold })).filter(x => x.n > 0), back = pend.map((i, k) => ({ ...i, n: vals[k].back })).filter(x => x.n > 0);
            if (!sold.length && !back.length) { toast('warning', 'Informe o que foi vendido ou devolvido.'); return; }
            const method = pay.value, soldV = r2(sold.reduce((a, i) => a + i.n * num(i.unitPrice), 0));
            let cash = null;
            if (sold.length && method !== 'fiado') { cash = await openCash(); if (!cash) { toast('warning', 'Abra o caixa (tela Caixa ou PDV) antes de receber em dinheiro, PIX ou cartão.'); return; } }
            ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Acertando...';
            try {
                for (const i of back) await StockService.entry(i.productId, i.n * (num(i._factor) || 1), `Devolução consignado ${conNo(c)} — ${c.customerName}`, 'consignment', c.id);
                let saleInfo = null;
                if (sold.length) {
                    const dueStr = ov.querySelector('#conPayDue').value || ymd(dueDef);
                    if (!window.DP_STOCK_HANDLED_OK) for (const i of sold) await StockService.entry(i.productId, i.n * (num(i._factor) || 1), `Acerto consignado ${conNo(c)} (ajuste)`, 'consignment', c.id);
                    const items = sold.map(i => ({ productId: i.productId, productName: i.productName, productCode: i.productCode || '', unitPrice: r2(i.unitPrice), originalUnitPrice: r2(i.unitPrice), priceChanged: false, notes: `Consignado ${conNo(c)}`, _factor: num(i._factor) || 1, costPrice: r2(i.costPrice), quantity: i.n, discount: 0, total: r2(i.n * num(i.unitPrice)) }));
                    const payment = { method, amount: soldV, installments: 1, cardBrand: '', feePercent: 0, feeValue: 0, netAmount: soldV, cashReceived: method === 'dinheiro' ? soldV : 0, changeValue: 0, dueDate: method === 'fiado' ? dueStr : '' };
                    const saleData = { items, subtotal: soldV, discount: 0, deliveryFee: 0, total: soldV, payments: [payment], paymentMethod: method, paymentFeePercent: 0, paymentFeeValue: 0, paymentNetAmount: soldV, cardBrand: '', customerId: c.customerId || null, customerName: c.customerName || 'Cliente', sellerId: c.sellerId || uid(), sellerName: c.sellerName || meName(), notes: `Acerto de consignado ${conNo(c)}`, type: 'balcao', source: 'consignment', sourceLabel: 'Consignado', consignmentId: c.id, consignmentNumber: c.number, status: 'completed', cashRegisterId: cash ? cash.id : null, operatorId: uid(), operatorName: meName(), itemCount: sold.reduce((a, i) => a + i.n, 0), stockHandled: true };
                    saleInfo = await SalesService.create(saleData);
                }
                const items = (c.items || []).map(i => ({ ...i }));
                sold.forEach(x => { items[x.idx].soldQty = num(items[x.idx].soldQty) + x.n; }); back.forEach(x => { items[x.idx].returnedQty = num(items[x.idx].returnedQty) + x.n; });
                const allDone = items.every(i => pendQty(i) <= 1e-9);
                const settlements = Array.isArray(c.settlements) ? c.settlements.slice() : [];
                settlements.push({ at: new Date().toISOString(), by: uid(), byName: meName(), soldValue: soldV, soldQty: sold.reduce((a, i) => a + i.n, 0), returnedQty: back.reduce((a, i) => a + i.n, 0), method: sold.length ? method : '', saleId: saleInfo ? saleInfo.id : null, saleNumber: saleInfo ? saleInfo.saleNumber : null, items: [...sold.map(i => ({ productId: i.productId, productName: i.productName, sold: i.n, returned: 0 })), ...back.map(i => ({ productId: i.productId, productName: i.productName, sold: 0, returned: i.n }))] });
                await db.collection(COL).doc(c.id).update({ items, settlements, settledValue: r2(num(c.settledValue) + soldV), status: allDone ? 'closed' : 'partial', closedAt: allDone ? ts() : null, updatedAt: ts(), updatedBy: uid() });
                try { AuditService.log('settle', 'consignments', c.id, { number: c.number, soldValue: soldV, saleNumber: saleInfo && saleInfo.saleNumber }); } catch (e) { }
                ov.remove();
                toast('success', `Acerto feito!${saleInfo ? ` Venda #V-${String(saleInfo.saleNumber).padStart(4, '0')} gerada (${money(soldV)}).` : ''}${allDone ? ' Remessa fechada.' : ''}`);
                await load();
            } catch (e) { console.error(e); toast('error', 'Erro no acerto: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); ok.disabled = false; ok.innerHTML = '<i class="fas fa-check"></i> Confirmar acerto'; }
        };
    }

    /* ---------- detalhes / cancelar / imprimir ---------- */
    function openView(c) {
        if (document.querySelector('.con-m')) return;
        const [lbl, cls] = STATUS[c.status] || [c.status, 'badge-info'];
        const ov = document.createElement('div'); ov.className = 'modal-overlay active con-m';
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-box-open" style="color:var(--accent);margin-right:8px"></i>Remessa ${conNo(c)} <span class="badge ${cls}" style="margin-left:8px">${lbl}</span></h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;font-size:13px">
              <div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Cliente</div><b>${esc(c.customerName)}</b>${c.customerPhone ? `<div style="font-size:12px;color:var(--text-muted)">${esc(c.customerPhone)}</div>` : ''}</div>
              <div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Saída</div>${fmtDT(c.createdAt)}<div style="font-size:12px;color:var(--text-muted)">por ${esc(c.createdByName || c.sellerName || '—')}</div></div>
              <div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Previsão do acerto</div>${fmtD(c.dueDate)}</div>
              <div><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;font-weight:700">Vendedor</div>${esc(c.sellerName || '—')}</div>
            </div>
            ${c.notes ? `<div style="margin-top:10px;font-size:12px;color:var(--text-secondary)"><i class="fas fa-note-sticky" style="margin-right:4px"></i>${esc(c.notes)}</div>` : ''}
            <div class="sec">Mercadorias</div>
            <div style="overflow:auto"><table><thead><tr><th>Produto</th><th style="text-align:right">Enviado</th><th style="text-align:right">Vendido</th><th style="text-align:right">Devolvido</th><th style="text-align:right">Pendente</th><th style="text-align:right">Preço</th><th style="text-align:right">Em aberto</th></tr></thead><tbody>
              ${(c.items || []).map(i => `<tr><td><b>${esc(i.productName)}</b></td><td style="text-align:right">${qty(i.quantity)}</td><td style="text-align:right;color:var(--success)">${qty(i.soldQty)}</td><td style="text-align:right">${qty(i.returnedQty)}</td><td style="text-align:right;font-weight:700">${qty(pendQty(i))}</td><td style="text-align:right">${money(i.unitPrice)}</td><td style="text-align:right;font-weight:700">${money(pendQty(i) * num(i.unitPrice))}</td></tr>`).join('')}
            </tbody></table></div>
            <div style="margin-top:10px;max-width:340px;margin-left:auto"><div class="tot"><span>Valor da remessa</span><b>${money(totalValue(c))}</b></div><div class="tot"><span>Já vendido / acertado</span><b style="color:var(--success)">${money(soldValue(c))}</b></div><div class="tot b"><span>Em aberto com o cliente</span><b style="color:var(--accent)">${money(pendValue(c))}</b></div></div>
            ${(c.settlements || []).length ? `<div class="sec">Acertos</div>${c.settlements.map(s => `<div style="font-size:12px;padding:8px 10px;background:var(--bg-secondary);border-radius:8px;margin-bottom:6px"><b>${fmtDT(s.at)}</b> · ${esc(s.byName || '')}${s.saleNumber ? ` · venda #V-${String(s.saleNumber).padStart(4, '0')}` : ''}${s.method ? ` · ${esc(s.method)}` : ''}<div style="color:var(--text-muted)">vendido ${qty(s.soldQty)} un (${money(s.soldValue)}) · devolvido ${qty(s.returnedQty)} un</div></div>`).join('')}` : ''}
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Fechar</button><button class="btn btn-outline" type="button" id="conViewPrint"><i class="fas fa-print"></i> Imprimir</button>${['open', 'partial'].includes(c.status) ? `<button class="btn btn-success" type="button" id="conViewSettle"><i class="fas fa-hand-holding-dollar"></i> Acertar</button>` : ''}</div></div>`;
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-x]').forEach(x => x.onclick = () => ov.remove());
        ov.querySelector('#conViewPrint').onclick = () => printRemessa(c);
        const sb = ov.querySelector('#conViewSettle'); if (sb) sb.onclick = () => { ov.remove(); openSettle(c); };
    }
    function cancelRemessa(c) {
        if ((c.settlements || []).length || c.status !== 'open') { toast('warning', 'Remessa com acerto não pode ser cancelada.'); return; }
        Confirm.show('Cancelar remessa', `Cancelar a remessa ${conNo(c)} de ${esc(c.customerName)}? Toda a mercadoria volta para o estoque.`, async () => {
            try {
                for (const i of (c.items || [])) await StockService.entry(i.productId, pendQty(i) * (num(i._factor) || 1), `Cancelamento consignado ${conNo(c)}`, 'consignment', c.id);
                await db.collection(COL).doc(c.id).update({ status: 'cancelled', cancelledAt: ts(), cancelledBy: uid(), updatedAt: ts() });
                toast('success', 'Remessa cancelada e estoque devolvido.'); await load();
            } catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
    }
    async function printRemessa(c) {
        if (window.DPCondicional && DPCondicional.usesTerm(c)) return DPCondicional.printTerm(c); // 38.6 · condicional: termo para a cliente assinar (condicional-v1.js)
        const w = window.open('', '_blank', 'width=900,height=820');
        if (!w) { toast('warning', 'O navegador bloqueou a janela de impressão. Permita pop-ups.'); return; }
        const co = await loadCompany();
        const rows = (c.items || []).map(i => `<tr><td>${esc(i.productName)}</td><td class="n">${qty(i.quantity)}</td><td class="n">${money(i.unitPrice)}</td><td class="n">${money(num(i.quantity) * num(i.unitPrice))}</td></tr>`).join('');
        const sett = (c.settlements || []).map(s => `<tr><td>${fmtDT(s.at)}</td><td>${qty(s.soldQty)} vendido · ${qty(s.returnedQty)} devolvido</td><td class="n">${money(s.soldValue)}</td></tr>`).join('');
        const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Consignação ${conNo(c)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#f1f5f9;color:#111;padding:70px 10px 30px;font-family:"Segoe UI",Arial,sans-serif}
.bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;gap:8px;align-items:center;z-index:9}.bar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155}.bar button.on{background:#e0e7ff;border-color:#6366f1;color:#4338ca}.bar button.p{background:#6366f1;color:#fff;border-color:#6366f1}.bar .sp{flex:1}
.doc{background:#fff;margin:0 auto;padding:14px}.hd{text-align:center;margin-bottom:8px}.co{font-weight:800;font-size:1.15em}.sub{font-size:.85em;color:#475569}.ttl{text-align:center;font-weight:800;margin:8px 0;padding:6px 0;border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8}
.r{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.sec{font-weight:800;font-size:.8em;letter-spacing:.5px;margin:10px 0 4px;color:#334155}
table{width:100%;border-collapse:collapse;font-size:.9em}th{text-align:left;border-bottom:1px solid #94a3b8;padding:3px 2px}td{padding:3px 2px;border-bottom:1px dotted #e2e8f0;vertical-align:top}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:800;border-top:1px solid #94a3b8}
.term{font-size:.85em;color:#334155;margin-top:10px;line-height:1.45}.sig{display:flex;gap:16px;margin-top:30px}.sig div{flex:1;text-align:center;font-size:.8em;color:#334155}.sig span{display:block;border-top:1px solid #334155;margin-bottom:4px}.ft{text-align:center;font-size:.75em;color:#94a3b8;margin-top:10px}
body.t80 .doc{width:72mm;font-family:"Courier New",monospace;font-size:11.5px;line-height:1.3;padding:6px}body.a4 .doc{max-width:720px;font-size:13px;line-height:1.45;padding:28px 32px;border:1px solid #e2e8f0}
@media print{body{background:#fff;padding:0}.bar{display:none}.doc{border:0!important;margin:0;max-width:none}}</style><style id="pg"></style></head><body class="a4">
<div class="bar"><strong style="font-size:13px;color:#334155">Formato:</strong><button id="b80" onclick="setMode('t80')">Cupom 80mm</button><button id="ba4" onclick="setMode('a4')">Folha A4</button><span class="sp"></span><button class="p" onclick="window.print()" style="display:inline-flex;align-items:center;gap:6px"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>Imprimir</button><button onclick="window.close()">Fechar</button></div>
<div class="doc">
  <div class="hd"><div class="co">${esc(co.name)}</div>${co.doc ? `<div class="sub">CNPJ ${esc(co.doc)}</div>` : ''}${co.address ? `<div class="sub">${esc(co.address)}</div>` : ''}${co.phone ? `<div class="sub">${esc(co.phone)}</div>` : ''}</div>
  <div class="ttl">COMPROVANTE DE CONSIGNAÇÃO ${conNo(c)}</div>
  <div class="r"><span>Cliente</span><b>${esc(c.customerName)}</b></div>${c.customerPhone ? `<div class="r"><span>Telefone</span><b>${esc(c.customerPhone)}</b></div>` : ''}
  <div class="r"><span>Data da saída</span><b>${fmtDT(c.createdAt)}</b></div><div class="r"><span>Previsão do acerto</span><b>${fmtD(c.dueDate)}</b></div><div class="r"><span>Responsável</span><b>${esc(c.sellerName || c.createdByName || '')}</b></div>
  <div class="sec">MERCADORIAS</div>
  <table><thead><tr><th>Produto</th><th class="n">Qtd</th><th class="n">Preço</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>TOTAL</td><td class="n">${qty(c.totalQty)}</td><td></td><td class="n">${money(totalValue(c))}</td></tr></tfoot></table>
  ${sett ? `<div class="sec">ACERTOS JÁ FEITOS</div><table><thead><tr><th>Data</th><th>Resumo</th><th class="n">Vendido</th></tr></thead><tbody>${sett}</tbody></table><div class="r" style="margin-top:6px"><span>Em aberto com o cliente</span><b>${money(pendValue(c))}</b></div>` : ''}
  ${c.notes ? `<div class="sec">OBSERVAÇÕES</div><div class="term">${esc(c.notes)}</div>` : ''}
  <div class="term">Recebi as mercadorias acima em consignação. Comprometo-me a pagar o valor das peças vendidas e a devolver, em perfeito estado, as que não forem vendidas até a data prevista para o acerto.</div>
  <div class="sig"><div><span></span>${esc(c.customerName)}</div><div><span></span>${esc(co.name)}</div></div>
  <div class="ft">Impresso em ${new Date().toLocaleString('pt-BR')} · DistribuiPRO</div>
</div>
<script>function setMode(m){document.body.className=m;document.getElementById('pg').textContent=m==='t80'?'@page{size:80mm auto;margin:3mm}':'@page{size:A4;margin:12mm}';document.getElementById('b80').className=m==='t80'?'on':'';document.getElementById('ba4').className=m==='a4'?'on':'';}setMode('a4');<\/script></body></html>`;
        w.document.open(); w.document.write(html); w.document.close();
    }

    /* ---------- início ---------- */
    root.innerHTML = '<div style="text-align:center;padding:60px 16px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    let started = false;
    const start = () => { if (started) return; started = true; load(); if (new URLSearchParams(location.search).get('novo') === '1') setTimeout(openNew, 400); };
    try { auth.onAuthStateChanged(u => { if (u) start(); }); } catch (e) { start(); }
})();
