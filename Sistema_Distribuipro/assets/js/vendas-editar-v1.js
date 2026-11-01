/* DistribuiPro 36.6 · Editar e cancelar vendas já realizadas — pedidos.html
   - "Editar venda": troca o vendedor (recalcula a comissão), o cliente e as observações; com o caixa da venda ainda aberto,
     também os itens (quantidade, preço, remover, adicionar) com acerto automático de estoque, caixa, fiado, cliente e totais.
   - "Cancelar venda" completo (também para vendas concluídas): devolve o estoque, estorna o caixa, cancela o fiado pendente
     e corrige os totais do cliente. A exclusão passa a fazer o mesmo acerto antes de apagar.
   - Mostra vendedor e comissão nos detalhes da venda. Funciona nas 5 versões. */
(function () {
    'use strict';
    // 38.3 · Troca/devolução (trocas-v1.js): comissão recalculada com a regra gravada na venda, sobre o que ficou
    window.DPSaleEdit = window.DPSaleEdit || {};
    window.DPSaleEdit.recalcCommission = async function (s, items, finalTotal) {
        const r2 = n => Math.round((Number(n) || 0) * 100) / 100, num = v => Number(v) || 0, out = {};
        const rule = { commissionType: s.commissionType || 'none', commissionValue: num(s.commissionValue), commissionServiceType: s.commissionServiceType || 'inherit', commissionServiceValue: num(s.commissionServiceValue) };
        if (window.DPCommission) { const sp = DPCommission.split(items, finalTotal, s.deliveryFee); Object.assign(out, DPCommission.calc(rule, sp.productBase, sp.serviceBase)); out.commissionBase = r2(sp.productBase + sp.serviceBase); }
        else { const base = Math.max(0, num(finalTotal) - num(s.deliveryFee)); out.commissionBase = base; out.commissionAmount = rule.commissionType === 'percent' ? r2(base * rule.commissionValue / 100) : (rule.commissionType === 'fixed' && base > 0 ? rule.commissionValue : 0); }
        const orig = Array.isArray(s.commissionSplitsOriginal) ? s.commissionSplitsOriginal : (Array.isArray(s.commissionSplits) && s.commissionSplits.length ? s.commissionSplits : null);
        if (orig) { // agenda: uma parte por profissional, todas na mesma proporção (a parte já paga não muda)
            const b0 = Math.max(0, num(s.total) - num(s.deliveryFee)), k = b0 > 0 ? Math.max(0, Math.min(1, (num(finalTotal) - num(s.deliveryFee)) / b0)) : 0;
            out.commissionSplitsOriginal = orig;
            out.commissionSplits = orig.map(x => x.status === 'paid' ? { ...x } : { ...x, productBase: r2(num(x.productBase) * k), serviceBase: r2(num(x.serviceBase) * k), productAmount: r2(num(x.productAmount) * k), serviceAmount: r2(num(x.serviceAmount) * k), amount: r2(num(x.amount) * k), status: r2(num(x.amount) * k) > 0 ? (x.status || 'pending') : 'none' });
            ['productAmount', 'serviceAmount', 'amount'].forEach(f => { out['commission' + f.charAt(0).toUpperCase() + f.slice(1)] = r2(out.commissionSplits.reduce((a, x) => a + num(x[f]), 0)); });
        }
        out.commissionStatus = num(out.commissionAmount) > 0 ? (s.commissionStatus === 'paid' ? 'paid' : 'pending') : 'none';
        return out;
    };
    if (!document.getElementById('modalPedido') || typeof window.openDetail !== 'function') return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => Number(v) || 0;
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const TS = () => FV().serverTimestamp();
    const uid = () => (auth.currentUser && auth.currentUser.uid) || '';
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } }; // currentUser é "let" do app.js (fora do window)
    const meName = () => me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador';
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const Sales = () => { try { return allSales; } catch (e) { return []; } };
    const isAdmin = () => ['admin', 'manager'].includes(me().role);
    const canCancel = () => isAdmin() || !!(me().permissions && me().permissions.cancelSales);
    const canEdit = () => isAdmin() || !!(me().permissions && (me().permissions.cancelSales || me().permissions.changePrices));
    const saleNo = s => '#V-' + String(s.saleNumber || 0).padStart(4, '0');
    const isOS = s => s.source === 'service_order' || s.type === 'service_order';
    const cache = { users: null, customers: null, products: null };

    const st = document.createElement('style');
    st.textContent = `.dpe .modal{max-width:760px;width:96%}.dpe .sec{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 6px}.dpe table{width:100%;border-collapse:collapse;font-size:13px}.dpe th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:6px 6px;border-bottom:1px solid var(--border-color)}.dpe td{padding:6px;border-bottom:1px solid var(--border-color);vertical-align:middle}.dpe td input{width:84px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;text-align:right}.dpe td input:disabled{opacity:.55}.dpe .lock{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:var(--text-secondary);border-radius:10px;padding:10px 12px;font-size:12px;line-height:1.5}.dpe .dd{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;z-index:30;max-height:220px;overflow:auto;box-shadow:var(--shadow-lg)}.dpe .dd div{padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color)}.dpe .dd div:hover{background:var(--bg-secondary)}.dpe .tot{display:flex;justify-content:space-between;padding:4px 0;font-size:13px}.dpe .tot.b{font-weight:800;font-size:16px;border-top:1px solid var(--border-color);margin-top:4px;padding-top:8px}.dpe .chip{display:inline-flex;align-items:center;gap:6px;background:rgba(16,185,129,.12);color:#059669;border-radius:999px;padding:4px 10px;font-size:12px;font-weight:700}.dpe .chip button{background:none;border:0;color:inherit;cursor:pointer}`;
    document.head.appendChild(st);

    /* ---------- dados ligados à venda ---------- */
    async function byRef(col, saleId) {
        try { const s = await db.collection(col).where('referenceId', '==', saleId).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })); }
        catch (e) { try { const s = await db.collection(col).get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.referenceId === saleId || x.saleId === saleId); } catch (e2) { return []; } }
    }
    async function bumpCustomer(cid, deltaTotal, deltaCount) {
        try {
            const d = await db.collection('customers').doc(cid).get(); if (!d.exists) return; const c = d.data() || {};
            const total = Math.max(0, num(c.totalPurchases) + deltaTotal), count = Math.max(0, num(c.purchaseCount) + deltaCount);
            await db.collection('customers').doc(cid).update({ totalPurchases: r2(total), purchaseCount: count, averageTicket: count ? r2(total / count) : 0 });
        } catch (e) { console.warn('cliente não atualizado:', e); }
    }
    function unitsByProduct(items) { const m = {}; (items || []).forEach(i => { if (!i.productId || i.isService) return; m[i.productId] = (m[i.productId] || 0) + num(i.quantity) * (num(i._factor) || 1); }); return m; }

    /* ---------- cancelamento completo ---------- */
    async function reverseSale(s, reason, opts) {
        const id = s.id, live = s.status !== 'cancelled';
        if (live) {
            // Devolve só o que é produto (serviço não tem estoque); registra na auditoria
            await db.collection('sales').doc(id).update({ status: 'cancelled', cancelledAt: TS(), cancelledBy: uid(), cancelReason: reason });
            for (const it of (s.items || [])) if (it.productId && !it.isService) await StockService.entry(it.productId, num(it.quantity) * (num(it._factor) || 1), `Cancelamento Venda ${saleNo(s)}`, 'sale', id);
            try { AuditService.log('cancel', 'sales', id, { saleNumber: s.saleNumber, reason }); } catch (e) { }
            for (const m of await byRef('cash_movements', id)) if (m.reversed !== true) await db.collection('cash_movements').doc(m.id).update({ reversed: true, reversedAt: TS(), reversedBy: uid(), reverseReason: reason });
            for (const f of await byRef('financial_entries', id)) if (f.status === 'pending') await db.collection('financial_entries').doc(f.id).update({ status: 'cancelled', deleted: true, cancelledAt: TS(), cancelReason: reason });
            if (s.customerId) await bumpCustomer(s.customerId, -num(s.total), -1);
            if (window.DPTrocas && DPTrocas.onSaleCancelled) await DPTrocas.onSaleCancelled(s); // 38.3 · venda paga com vale: o valor volta para o vale
            if (window.DPSerial && DPSerial.onSaleCancelled) await DPSerial.onSaleCancelled(s); // 38.5 · aparelho com IMEI/série volta ao estoque
        }
        const upd = { commissionStatus: s.commissionStatus === 'paid' ? 'paid' : 'none' };
        if (opts && opts.deleteToo) Object.assign(upd, { deleted: true, deletedAt: TS(), deletedBy: uid(), deletedReason: reason });
        await db.collection('sales').doc(id).update(upd);
    }
    function blocked(s) {
        if (isOS(s)) return 'Esta venda veio de uma Ordem de Serviço: cancele ou edite pela tela Ordens de Serviço.';
        if (s.source === 'consignment') return 'Esta venda é um acerto de consignado: desfaça pela tela Consignado.';
        if (num(s.returnedTotal) > 0) return 'Esta venda já teve troca/devolução: para desfazer o que sobrou, use "Troca / devolução" (dá para devolver em dinheiro).'; // 38.3
        return '';
    }
    window.cancelSale = function (id) {
        const s = Sales().find(x => x.id === id); if (!s) return;
        if (!canCancel()) { toast('warning', 'Seu perfil não tem permissão para cancelar vendas.'); return; }
        const b = blocked(s); if (b) { toast('warning', b); return; }
        if (s.status === 'cancelled') { toast('info', 'Esta venda já está cancelada.'); return; }
        const ov = document.createElement('div'); ov.className = 'modal-overlay active';
        ov.innerHTML = `<div class="modal" style="max-width:440px"><div class="modal-header"><h3 style="color:var(--danger)"><i class="fas fa-ban" style="margin-right:8px"></i>Cancelar venda ${saleNo(s)}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px"><b style="color:var(--text-primary)">${esc(s.customerName || 'Consumidor Final')}</b> · ${money(s.total)} · ${fmtDT(s.createdAt)}</div>
            <div style="background:var(--bg-secondary);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text-secondary);line-height:1.6;margin-bottom:12px">
              <div><i class="fas fa-boxes-stacked" style="color:var(--accent);width:18px"></i> Estoque dos produtos volta</div>
              <div><i class="fas fa-vault" style="color:var(--accent);width:18px"></i> Movimento do caixa é estornado</div>
              <div><i class="fas fa-handshake" style="color:var(--accent);width:18px"></i> Fiado pendente é cancelado</div>
              <div><i class="fas fa-user" style="color:var(--accent);width:18px"></i> Totais do cliente e comissão são corrigidos</div>
            </div>
            <div class="form-group"><label class="form-label">Motivo do cancelamento *</label><textarea class="form-control" id="dpeReason" rows="2" placeholder="Ex: venda lançada errada, cliente desistiu..."></textarea></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Voltar</button><button class="btn btn-danger" id="dpeCancelOk"><i class="fas fa-ban"></i> Cancelar venda</button></div></div>`;
        document.body.appendChild(ov);
        const ok = ov.querySelector('#dpeCancelOk');
        ok.onclick = async () => {
            const reason = ov.querySelector('#dpeReason').value.trim(); if (!reason) { toast('warning', 'Informe o motivo.'); return; }
            ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Cancelando...';
            try { await reverseSale(s, reason); ov.remove(); toast('success', `Venda ${saleNo(s)} cancelada. Estoque, caixa e contas acertados.`); if (typeof closeModal === 'function') closeModal('modalPedido'); if (typeof loadOrders === 'function') await loadOrders(); }
            catch (e) { console.error(e); toast('error', 'Erro ao cancelar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); ok.disabled = false; ok.innerHTML = '<i class="fas fa-ban"></i> Cancelar venda'; }
        };
    };
    const origConfirmDelete = window.confirmDeleteSale;
    window.confirmDeleteSale = async function (id) {
        const s = Sales().find(x => x.id === id);
        if (!s) return typeof origConfirmDelete === 'function' ? origConfirmDelete.apply(this, arguments) : undefined;
        const ov = $('deleteConfirmOverlay'); const btn = ov && ov.querySelector('.btn-danger');
        const b = blocked(s); if (b) { toast('warning', b); if (ov) ov.remove(); return; }
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Excluindo...'; }
        try {
            await reverseSale(s, 'Venda excluída', { deleteToo: true });
            toast('success', 'Venda excluída. Estoque, caixa e contas foram acertados.');
            if (ov) ov.remove(); if (typeof closeModal === 'function') closeModal('modalPedido'); if (typeof loadOrders === 'function') await loadOrders();
        } catch (e) { console.error(e); toast('error', 'Erro ao excluir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-trash"></i> Sim, excluir'; } }
    };

    /* ---------- detalhes: vendedor, comissão e botões ---------- */
    const origOpen = window.openDetail;
    window.openDetail = function (id) { const r = origOpen.apply(this, arguments); try { enhance(id); } catch (e) { console.warn(e); } return r; };
    function enhance(id) {
        const s = Sales().find(x => x.id === id); if (!s) return;
        const body = $('modalPedidoBody'), foot = $('modalPedidoFooter'); if (!body || !foot) return;
        const grid = body.querySelector('div[style*="grid-template-columns:1fr 1fr"]');
        const box = document.createElement('div');
        box.style.cssText = 'padding:10px 12px;border-radius:10px;background:var(--bg-surface);border:1px solid var(--border-color);margin-bottom:16px;display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap';
        const comm = num(s.commissionAmount) > 0 ? `${money(s.commissionAmount)} · ${s.commissionStatus === 'paid' ? 'paga' : 'pendente'}${num(s.commissionServiceAmount) > 0 ? ` <span style="font-size:11px;color:var(--text-muted)">(serviços ${money(s.commissionServiceAmount)})</span>` : ''}` : '—';
        box.innerHTML = `<div><div style="font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Vendedor</div><div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:3px">${esc(s.sellerName || s.operatorName || '—')}</div></div>
          <div style="text-align:right"><div style="font-size:10px;color:var(--text-muted);font-weight:600;text-transform:uppercase;letter-spacing:.5px">Comissão</div><div style="font-size:13px;font-weight:600;color:var(--text-primary);margin-top:3px">${comm}</div></div>
          ${s.editedAt ? `<div style="flex-basis:100%;font-size:11px;color:var(--warning)"><i class="fas fa-pen" style="margin-right:4px"></i>Editada em ${fmtDT(s.editedAt)}${s.editedByName ? ' por ' + esc(s.editedByName) : ''}${Array.isArray(s.editHistory) && s.editHistory.length ? ' · ' + esc(s.editHistory[s.editHistory.length - 1].changes.join(', ')) : ''}</div>` : ''}
          ${s.status === 'cancelled' && s.cancelReason ? `<div style="flex-basis:100%;font-size:11px;color:var(--danger)"><i class="fas fa-ban" style="margin-right:4px"></i>Cancelada: ${esc(s.cancelReason)}</div>` : ''}`;
        if (grid) grid.insertAdjacentElement('afterend', box); else body.prepend(box);
        const status = s.status || 'completed';
        // 37.0 · Reimprimir em folha A4 (só com a opção ligada em Configurações › Impressão)
        if (window.DPSaleA4) window.DPSaleA4.enabled().then(on => {
            if (!on || foot.querySelector('.dpe-a4')) return;
            const a = document.createElement('button'); a.className = 'btn btn-outline dpe-a4'; a.innerHTML = '<i class="fas fa-file-lines"></i> Imprimir A4'; a.onclick = () => window.DPSaleA4.print(s);
            const rp = foot.querySelector('button[onclick^="reprintSale"]'); if (rp) { rp.innerHTML = '<i class="fas fa-receipt"></i> Cupom'; rp.insertAdjacentElement('afterend', a); } else foot.appendChild(a);
        }).catch(() => { });
        if (status !== 'cancelled' && canEdit() && !blocked(s)) {
            const b = document.createElement('button'); b.className = 'btn btn-outline'; b.innerHTML = '<i class="fas fa-pen"></i> Editar venda'; b.onclick = () => openEdit(s.id);
            const rp = foot.querySelector('button[onclick^="reprintSale"]'); if (rp) rp.insertAdjacentElement('afterend', b); else foot.appendChild(b);
        }
        if (['completed', 'delivered'].includes(status) && canCancel() && !blocked(s) && !foot.querySelector('button[onclick^="cancelSale"]')) {
            const c = document.createElement('button'); c.className = 'btn btn-danger'; c.innerHTML = '<i class="fas fa-ban"></i> Cancelar venda'; c.onclick = () => window.cancelSale(s.id);
            const del = foot.querySelector('button[onclick^="deleteSale"]'); if (del) del.insertAdjacentElement('beforebegin', c); else foot.appendChild(c);
        }
    }

    /* ---------- edição ---------- */
    function itemLock(s) {
        if (s.fiscal && s.fiscal.status === 'autorizado') return 'Venda com nota fiscal autorizada: os itens não podem mudar (cancele e refaça a venda).';
        const pays = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod || 'dinheiro', amount: s.total }];
        if (pays.length > 1) return 'Venda com mais de uma forma de pagamento (ou parcelada): os itens não podem mudar. Para corrigir, cancele e refaça a venda.';
        if (s.crediario) return 'Venda no crediário: os itens não podem mudar. Para corrigir, cancele e refaça a venda.';
        return '';
    }
    async function cashLock(s) {
        if (!s.cashRegisterId) return '';
        try { const d = await db.collection('cash_registers').doc(s.cashRegisterId).get(); if (d.exists && (d.data() || {}).status === 'closed') return 'O caixa desta venda já foi fechado: itens e valores não podem mudar (vendedor, cliente e observações podem). Para corrigir valores, cancele e refaça.'; } catch (e) { }
        return '';
    }
    async function openEdit(id) {
        const s = Sales().find(x => x.id === id); if (!s) return;
        const b = blocked(s); if (b) { toast('warning', b); return; }
        if (document.querySelector('.dpe')) return;
        try {
            if (!cache.users) cache.users = (await simpleList('users', 'name', 'asc', 1000)).filter(u => !u.deleted && u.status !== 'inactive');
            if (!cache.customers) cache.customers = (await simpleList('customers', 'name', 'asc', 10000)).filter(c => !c.deleted);
        } catch (e) { toast('error', 'Não foi possível carregar vendedores/clientes: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        const lock = itemLock(s) || await cashLock(s);
        const state = { sellerId: s.sellerId || s.operatorId || '', customerId: s.customerId || '', customerName: s.customerName || 'Consumidor Final', items: (s.items || []).map(i => ({ ...i })) };
        const sellerOpts = cache.users.map(u => `<option value="${esc(u.id)}" ${u.id === state.sellerId ? 'selected' : ''}>${esc(u.name || u.nome || u.email || 'Usuário')}${u.role ? ' · ' + esc({ admin: 'Admin', manager: 'Gerente', seller: 'Vendedor', cashier: 'Caixa', technician: 'Técnico' }[u.role] || u.role) : ''}</option>`).join('');
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpe';
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-pen" style="color:var(--accent);margin-right:8px"></i>Editar venda ${saleNo(s)}</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
              <div class="form-group" style="margin:0"><label class="form-label">Vendedor / responsável</label><select class="form-control" id="dpeSeller">${state.sellerId && !cache.users.some(u => u.id === state.sellerId) ? `<option value="${esc(state.sellerId)}" selected>${esc(s.sellerName || 'Vendedor atual')}</option>` : ''}${sellerOpts}</select><div id="dpeSellerHint" style="font-size:11px;color:var(--text-muted);margin-top:4px"></div></div>
              <div class="form-group" style="margin:0;position:relative"><label class="form-label">Cliente</label><input type="text" class="form-control" id="dpeCustQ" placeholder="Buscar cliente por nome ou telefone..." autocomplete="off"><div class="dd" id="dpeCustDD" style="display:none"></div><div id="dpeCustChip" style="margin-top:6px"></div></div>
            </div>
            <div class="form-group" style="margin-top:12px"><label class="form-label">Observações</label><textarea class="form-control" id="dpeNotes" rows="2">${esc(s.notes || '')}</textarea></div>
            <div class="sec">Itens da venda</div>
            ${lock ? `<div class="lock" style="margin-bottom:8px"><i class="fas fa-lock" style="margin-right:6px"></i>${esc(lock)}</div>` : `<div style="position:relative;margin-bottom:8px"><input type="text" class="form-control" id="dpeProdQ" placeholder="+ Adicionar produto: digite nome ou código..." autocomplete="off"><div class="dd" id="dpeProdDD" style="display:none"></div></div>`}
            <div style="overflow:auto"><table><thead><tr><th>Produto</th><th style="text-align:right">Qtd</th><th style="text-align:right">Preço un.</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody id="dpeItems"></tbody></table></div>
            <div style="margin-top:10px;max-width:320px;margin-left:auto" id="dpeTotals"></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-primary" type="button" id="dpeSave"><i class="fas fa-check"></i> Salvar alterações</button></div></div>`;
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-x]').forEach(x => x.onclick = () => ov.remove());
        const sellerSel = ov.querySelector('#dpeSeller');
        const paintSeller = () => { const u = cache.users.find(x => x.id === sellerSel.value) || {}; const h = ov.querySelector('#dpeSellerHint'); if (s.commissionStatus === 'paid') { h.textContent = 'Comissão já paga: o vendedor não pode ser trocado.'; sellerSel.disabled = true; return; } h.textContent = u.commissionType === 'percent' ? `Comissão: ${u.commissionValue}% sobre produtos${u.commissionServiceType && u.commissionServiceType !== 'inherit' ? ' · serviços ' + (u.commissionServiceType === 'percent' ? u.commissionServiceValue + '%' : u.commissionServiceType === 'fixed' ? money(u.commissionServiceValue) : 'sem') : ''}` : u.commissionType === 'fixed' ? `Comissão: ${money(u.commissionValue)} por venda` : 'Sem comissão'; };
        sellerSel.onchange = paintSeller; paintSeller();
        // cliente
        const chip = () => { ov.querySelector('#dpeCustChip').innerHTML = state.customerId ? `<span class="chip"><i class="fas fa-circle-check"></i>${esc(state.customerName)}<button type="button" title="Tirar cliente (Consumidor Final)" data-clr>✕</button></span>` : '<span style="font-size:12px;color:var(--text-muted)"><i class="fas fa-user-slash" style="margin-right:4px"></i>Consumidor Final</span>'; const c = ov.querySelector('[data-clr]'); if (c) c.onclick = () => { state.customerId = ''; state.customerName = 'Consumidor Final'; chip(); }; };
        chip();
        const cq = ov.querySelector('#dpeCustQ'), cdd = ov.querySelector('#dpeCustDD');
        cq.oninput = () => { const q = norm(cq.value.trim()); if (q.length < 2) { cdd.style.display = 'none'; return; } const dig = q.replace(/\D/g, ''); const hits = cache.customers.filter(c => norm(c.name || c.nome).includes(q) || (dig.length >= 3 && String((c.phone || '') + (c.whatsapp || '')).replace(/\D/g, '').includes(dig))).slice(0, 8); cdd.innerHTML = hits.length ? hits.map(c => `<div data-id="${esc(c.id)}"><b>${esc(c.name || c.nome)}</b>${c.phone ? ` <span style="color:var(--text-muted);font-size:11px">· ${esc(c.phone)}</span>` : ''}</div>`).join('') : '<div style="color:var(--text-muted)">Nenhum cliente encontrado</div>'; cdd.style.display = 'block'; cdd.querySelectorAll('[data-id]').forEach(d => d.onclick = () => { const c = cache.customers.find(x => x.id === d.dataset.id); if (c) { state.customerId = c.id; state.customerName = c.name || c.nome || ''; } cq.value = ''; cdd.style.display = 'none'; chip(); }); };
        // itens
        const tb = ov.querySelector('#dpeItems'), tot = ov.querySelector('#dpeTotals');
        const paintItems = () => {
            tb.innerHTML = state.items.map((i, k) => `<tr><td><div style="font-weight:600">${esc(i.productName)}</div>${i.notes ? `<div style="font-size:11px;color:var(--text-muted)">${esc(i.notes)}</div>` : ''}${i._pkgLabel ? `<div style="font-size:11px;color:var(--text-muted)">${esc(i._pkgLabel)}</div>` : ''}</td><td style="text-align:right"><input type="number" step="any" min="0" value="${num(i.quantity)}" data-k="${k}" data-f="quantity" ${lock ? 'disabled' : ''}></td><td style="text-align:right"><input type="number" step="0.01" min="0" value="${num(i.unitPrice).toFixed(2)}" data-k="${k}" data-f="unitPrice" ${lock ? 'disabled' : ''}></td><td style="text-align:right;font-weight:700;white-space:nowrap">${money(i.total)}</td><td>${lock ? '' : `<button type="button" class="btn-icon btn-danger" title="Remover item" data-rm="${k}"><i class="fas fa-trash"></i></button>`}</td></tr>`).join('') || '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px">Sem itens</td></tr>';
            const subtotal = r2(state.items.reduce((a, i) => a + num(i.total), 0)), discount = Math.min(num(s.discount), subtotal), fee = num(s.deliveryFee), sur = num(s.cardSurcharge);
            const total = r2(subtotal - discount + fee + sur);
            tot.innerHTML = `<div class="tot"><span>Subtotal</span><b>${money(subtotal)}</b></div>${discount ? `<div class="tot"><span>Desconto</span><b style="color:var(--warning)">- ${money(discount)}</b></div>` : ''}${fee ? `<div class="tot"><span>Taxa de entrega</span><b>${money(fee)}</b></div>` : ''}${sur ? `<div class="tot"><span>Acréscimo cartão</span><b>${money(sur)}</b></div>` : ''}<div class="tot b"><span>Total</span><b style="color:var(--success)">${money(total)}</b></div>${Math.abs(total - num(s.total)) > 0.004 ? `<div style="font-size:11px;color:var(--warning);text-align:right">antes: ${money(s.total)}</div>` : ''}`;
            tb.querySelectorAll('input[data-k]').forEach(inp => inp.onchange = () => { const it = state.items[Number(inp.dataset.k)]; if (!it) return; const v = Math.max(0, Number(inp.value) || 0); it[inp.dataset.f] = v; it.total = r2(num(it.quantity) * num(it.unitPrice)); if (inp.dataset.f === 'unitPrice') it.priceChanged = Math.abs(num(it.originalUnitPrice || it.unitPrice) - v) > 0.001; paintItems(); });
            tb.querySelectorAll('[data-rm]').forEach(b => b.onclick = () => { state.items.splice(Number(b.dataset.rm), 1); paintItems(); });
        };
        paintItems();
        const pq = ov.querySelector('#dpeProdQ'), pdd = ov.querySelector('#dpeProdDD');
        if (pq) pq.oninput = async () => {
            const q = norm(pq.value.trim()); if (q.length < 2) { pdd.style.display = 'none'; return; }
            if (!cache.products) { pdd.innerHTML = '<div style="color:var(--text-muted)">Carregando produtos...</div>'; pdd.style.display = 'block'; try { cache.products = (await simpleList('products', 'name', 'asc', 10000)).filter(p => !p.deleted && p.status !== 'inactive'); } catch (e) { cache.products = []; } }
            const hits = cache.products.filter(p => !p.isGradeParent && (norm(p.name).includes(q) || norm(p.code || p.sku || '').includes(q))).slice(0, 8); // 38.6 · grade: o tamanho/cor, não o pai
            pdd.innerHTML = hits.length ? hits.map(p => `<div data-id="${esc(p.id)}"><b>${esc(p.name)}</b> <span style="color:var(--text-muted);font-size:11px">· ${money(p.salePrice)} · estoque ${num(p.currentStock)}</span></div>`).join('') : '<div style="color:var(--text-muted)">Nenhum produto encontrado</div>';
            pdd.style.display = 'block';
            pdd.querySelectorAll('[data-id]').forEach(d => d.onclick = () => { const p = cache.products.find(x => x.id === d.dataset.id); if (p) { const ex = state.items.find(i => i.productId === p.id && (num(i._factor) || 1) === 1); if (ex) { ex.quantity = num(ex.quantity) + 1; ex.total = r2(ex.quantity * num(ex.unitPrice)); } else state.items.push({ productId: p.id, productName: p.name, productCode: p.code || '', unitPrice: num(p.salePrice), originalUnitPrice: num(p.salePrice), priceChanged: false, notes: '', _factor: 1, costPrice: num(p.costPrice), quantity: 1, discount: 0, total: num(p.salePrice), isService: p.productType === 'service' }); } pq.value = ''; pdd.style.display = 'none'; paintItems(); });
        };
        document.addEventListener('click', e => { if (!ov.contains(e.target)) return; if (!e.target.closest('#dpeCustQ,#dpeCustDD')) cdd.style.display = 'none'; if (pdd && !e.target.closest('#dpeProdQ,#dpeProdDD')) pdd.style.display = 'none'; });
        const save = ov.querySelector('#dpeSave');
        save.onclick = async () => {
            save.disabled = true; save.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                const ok = await saveEdit(s, { sellerId: sellerSel.value, customerId: state.customerId, customerName: state.customerName, notes: ov.querySelector('#dpeNotes').value.trim(), items: lock ? null : state.items });
                if (ok) { ov.remove(); toast('success', `Venda ${saleNo(s)} atualizada.`); if (typeof closeModal === 'function') closeModal('modalPedido'); if (typeof loadOrders === 'function') await loadOrders(); }
                else { save.disabled = false; save.innerHTML = '<i class="fas fa-check"></i> Salvar alterações'; }
            } catch (e) { console.error(e); toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); save.disabled = false; save.innerHTML = '<i class="fas fa-check"></i> Salvar alterações'; }
        };
    }
    const simplifyItems = items => (items || []).map(i => [i.productId, num(i.quantity), r2(i.unitPrice), r2(i.total)]);
    async function saveEdit(s, form) {
        const changes = [], upd = {};
        const curSeller = s.sellerId || s.operatorId || '';
        if (form.sellerId && form.sellerId !== curSeller) {
            if (s.commissionStatus === 'paid') throw new Error('A comissão desta venda já foi paga: não dá para trocar o vendedor.');
            const u = cache.users.find(x => x.id === form.sellerId) || {};
            upd.sellerId = form.sellerId; upd.sellerName = u.name || u.nome || u.email || 'Vendedor';
            changes.push(`vendedor: ${s.sellerName || s.operatorName || '—'} → ${upd.sellerName}`);
        }
        if ((form.customerId || '') !== (s.customerId || '')) { upd.customerId = form.customerId || null; upd.customerName = form.customerName || 'Consumidor Final'; changes.push(`cliente: ${s.customerName || 'Consumidor Final'} → ${upd.customerName}`); }
        if ((form.notes || '') !== (s.notes || '')) { upd.notes = form.notes; changes.push('observações'); }
        let finalTotal = num(s.total);
        if (form.items) {
            if (!form.items.length) throw new Error('A venda precisa ter pelo menos um item. Para desfazer tudo, use "Cancelar venda".');
            if (form.items.some(i => num(i.quantity) <= 0)) throw new Error('Há item com quantidade zero: remova o item ou informe a quantidade.');
            if (JSON.stringify(simplifyItems(form.items)) !== JSON.stringify(simplifyItems(s.items))) {
                const subtotal = r2(form.items.reduce((a, i) => a + num(i.total), 0)), discount = Math.min(num(s.discount), subtotal);
                finalTotal = r2(subtotal - discount + num(s.deliveryFee) + num(s.cardSurcharge));
                upd.items = form.items.map(i => ({ ...i })); upd.subtotal = subtotal; upd.discount = discount; upd.total = finalTotal; upd.itemCount = form.items.reduce((a, i) => a + num(i.quantity), 0);
                changes.push(`itens/valores: ${money(s.total)} → ${money(finalTotal)}`);
            }
        }
        if (!changes.length) { toast('info', 'Nada foi alterado.'); return false; }
        if (upd.items) {
            if (window.DPSerial && DPSerial.checkEdit) DPSerial.checkEdit(s, upd.items); // 38.5 · aparelho com IMEI/série: um por linha
            const before = unitsByProduct(s.items), after = unitsByProduct(upd.items);
            for (const pid of new Set([...Object.keys(before), ...Object.keys(after)])) {
                const delta = r2((after[pid] || 0) - (before[pid] || 0)); if (!pid || !delta) continue;
                if (delta > 0) await StockService.exit(pid, delta, `Edição Venda ${saleNo(s)}`, 'sale', s.id); else await StockService.entry(pid, -delta, `Edição Venda ${saleNo(s)}`, 'sale', s.id);
            }
            if (window.DPSerial && DPSerial.onSaleEdited) await DPSerial.onSaleEdited(s, upd.items); // 38.5 · linha de aparelho tirada: a unidade volta ao estoque
            const p0 = (Array.isArray(s.payments) && s.payments[0]) || { method: s.paymentMethod || 'dinheiro', amount: s.total };
            const feePct = num(p0.feePercent), feeVal = r2(finalTotal * feePct / 100), net = r2(finalTotal - feeVal);
            const received = p0.method === 'dinheiro' ? Math.max(num(p0.cashReceived), finalTotal) : 0;
            upd.payments = [{ ...p0, amount: finalTotal, feeValue: feeVal, netAmount: net, cashReceived: received, changeValue: p0.method === 'dinheiro' ? r2(received - finalTotal) : 0 }];
            upd.paymentFeeValue = feeVal; upd.paymentNetAmount = net;
            for (const m of await byRef('cash_movements', s.id)) if (m.reversed !== true && m.type === 'sale') await db.collection('cash_movements').doc(m.id).update({ amount: finalTotal, netAmount: net, feeValue: feeVal, editedAt: TS() });
            const pend = (await byRef('financial_entries', s.id)).filter(f => f.status === 'pending');
            if (pend.length === 1) await db.collection('financial_entries').doc(pend[0].id).update({ amount: finalTotal, updatedAt: TS() });
        }
        const oldCid = s.customerId || '', newCid = upd.customerId !== undefined ? (upd.customerId || '') : oldCid, oldTotal = num(s.total);
        if (oldCid !== newCid) { if (oldCid) await bumpCustomer(oldCid, -oldTotal, -1); if (newCid) await bumpCustomer(newCid, finalTotal, 1); }
        else if (oldCid && Math.abs(finalTotal - oldTotal) > 0.004) await bumpCustomer(oldCid, finalTotal - oldTotal, 0);
        if (upd.customerId !== undefined) for (const f of await byRef('financial_entries', s.id)) await db.collection('financial_entries').doc(f.id).update({ customerId: upd.customerId || '', customerName: upd.customerName, description: String(f.description || '').replace(s.customerName || 'Consumidor Final', upd.customerName) });
        if (upd.sellerId !== undefined || upd.total !== undefined) {
            const sellerId = upd.sellerId !== undefined ? upd.sellerId : curSeller;
            const u = cache.users.find(x => x.id === sellerId) || {}, items = upd.items || s.items || [];
            if (window.DPCommission) { const sp = DPCommission.split(items, finalTotal, s.deliveryFee); Object.assign(upd, DPCommission.calc(u, sp.productBase, sp.serviceBase)); upd.commissionBase = r2(sp.productBase + sp.serviceBase); }
            // 37.9 · Agenda: venda com profissional por item ou % própria do serviço → recalcula a parte de cada um
            if (window.DPCommission && DPCommission.recalcSplits) { const rs = await DPCommission.recalcSplits(items, { uid: sellerId, name: upd.sellerName || s.sellerName || '', cfg: u }, finalTotal, s.deliveryFee, cache.users, s.commissionSplits); if (rs) Object.assign(upd, rs); else if (Array.isArray(s.commissionSplits)) upd.commissionSplits = null; }
            else { const base = Math.max(0, finalTotal - num(s.deliveryFee)), v = num(u.commissionValue); upd.commissionType = u.commissionType || 'none'; upd.commissionValue = v; upd.commissionBase = base; upd.commissionAmount = u.commissionType === 'percent' ? r2(base * v / 100) : u.commissionType === 'fixed' ? v : 0; }
            upd.commissionStatus = num(upd.commissionAmount) > 0 ? (s.commissionStatus === 'paid' ? 'paid' : 'pending') : 'none';
        }
        const hist = Array.isArray(s.editHistory) ? s.editHistory.slice(-19) : [];
        hist.push({ at: new Date().toISOString(), by: uid(), byName: meName(), changes });
        Object.assign(upd, { editHistory: hist, editedAt: TS(), editedBy: uid(), editedByName: meName(), updatedAt: TS() });
        await db.collection('sales').doc(s.id).update(upd);
        try { AuditService.log('edit', 'sales', s.id, { saleNumber: s.saleNumber, changes }); } catch (e) { }
        return true;
    }
})();
