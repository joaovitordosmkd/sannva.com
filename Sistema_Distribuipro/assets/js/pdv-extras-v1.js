/* DistribuiPro 36.6 · PDV extras — pdv.html (carregar depois de crediario-v1.js)
   1. Caixa obrigatório: ao finalizar, se não há caixa aberto, abre o caixa ali mesmo (troco + turno) e a venda continua.
      Pill "Caixa aberto / fechado" no topo do PDV; a venda sempre entra no caixa aberto.
   2. Fiado: pergunta o vencimento (e parcelas, se quiser) antes de finalizar e exige o cliente da venda.
   3. Cliente escolhido fica evidente: faixa verde com ícone de confirmado no carrinho e nome no cabeçalho; "Consumidor Final" fica cinza.
   4. Itens que são serviço (productType = service) vão marcados na venda para a comissão de serviços.
   Funciona nas 5 versões (Mensal, MySQL, Firebase, Offline e demo). */
(function () {
    'use strict';
    if (!document.getElementById('btnFinalize') || typeof window.finalizeSale !== 'function') return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtT = v => { const d = toDate(v); return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; };
    // Variáveis "let" do pdv.html (escopo global, mas fora do window)
    const G = {
        get custId() { try { return selectedCustomerId; } catch (e) { return null; } },
        get custName() { try { return selectedCustomerNameVal; } catch (e) { return ''; } },
        get payment() { try { return selectedPayment; } catch (e) { return ''; } },
        get cart() { try { return cart; } catch (e) { return []; } },
        get products() { try { return products; } catch (e) { return []; } },
        get cash() { try { return activeCashRegister; } catch (e) { return null; } },
        set cash(v) { try { activeCashRegister = v; } catch (e) { window.activeCashRegister = v; } }
    };

    const st = document.createElement('style');
    st.textContent = `
#selectedCustomerBadge.pdx-on{background:rgba(16,185,129,.14)!important;border:1px solid rgba(16,185,129,.45)}
#selectedCustomerBadge.pdx-on #selectedCustomerName{color:#059669!important;font-size:13px!important;font-weight:700!important}
#selectedCustomerBadge.pdx-off{background:var(--bg-secondary)!important;border:1px dashed var(--border-color)}
#selectedCustomerBadge.pdx-off #selectedCustomerName{color:var(--text-muted)!important;font-weight:500!important}
.pdx-cart-cust{font-size:11px;font-weight:600;color:var(--text-muted);margin-left:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:46%}
.pdx-cart-cust.on{color:#059669}
.pdx-cart-cust i{margin-right:4px;opacity:.85}
#customerSearch.pdx-cust-search{padding-left:36px!important;background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Ccircle cx='11' cy='11' r='8'/%3E%3Cpath d='m21 21-4.3-4.3'/%3E%3C/svg%3E")!important;background-repeat:no-repeat!important;background-position:12px 50%!important;background-size:16px 16px!important}
.pdx-cash{display:inline-flex;align-items:center;gap:6px;border-radius:999px;padding:6px 12px;font-size:12px;font-weight:700;border:1px solid transparent;cursor:pointer;white-space:nowrap;font-family:inherit;margin-left:8px;flex-shrink:0}
.pdx-cash.open{background:rgba(16,185,129,.12);color:#059669;border-color:rgba(16,185,129,.35)}
.pdx-cash.closed{background:rgba(239,68,68,.12);color:#dc2626;border-color:rgba(239,68,68,.35);animation:pdxPulse 2s infinite}
.pdx-cash.wait{background:var(--bg-secondary);color:var(--text-muted)}
@keyframes pdxPulse{0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,.25)}50%{box-shadow:0 0 0 6px rgba(239,68,68,0)}}
@media (max-width:768px){.pdx-cash span{display:none}.pdx-cash{padding:6px 9px}}
.pdx-modal .modal{max-width:430px}.pdx-modal .form-group{margin-bottom:12px}.pdx-prev{background:var(--bg-secondary);border-radius:10px;padding:10px 12px;font-size:12px;color:var(--text-secondary);line-height:1.5}`;
    document.head.appendChild(st);

    /* ================= 3. Cliente visível ================= */
    let painting = false;
    function paintCustomer() {
        if (painting) return; painting = true;
        try {
            const badge = $('selectedCustomerBadge'), nameEl = $('selectedCustomerName'), inp = $('customerSearch');
            const on = !!G.custId, name = G.custName || 'Consumidor Final';
            if (badge) { badge.classList.toggle('pdx-on', on); badge.classList.toggle('pdx-off', !on); }
            if (nameEl) {
                // 37.6 · Compara pelo texto e pela classe do ícone (o desenho do ícone é trocado pelo dp-icons; comparar o innerHTML repintava sem parar)
                const shown = (nameEl.textContent || '').trim();
                const icon = on ? 'fa-circle-check' : 'fa-user-slash';
                const text = on ? (shown && shown !== 'Consumidor Final' && !/nenhum cliente escolhido$/.test(shown) ? shown : name) : 'Consumidor Final — nenhum cliente escolhido';
                const ic = nameEl.querySelector('i');
                if (!(ic && ic.classList.contains(icon) && shown === text)) nameEl.innerHTML = `<i class="fas ${icon}" style="margin-right:5px${on ? '' : ';opacity:.6'}"></i>${esc(text)}`;
            }
            if (inp) { inp.placeholder = on ? `Cliente: ${name}` : 'Buscar cliente por nome ou telefone...'; inp.classList.add('pdx-cust-search'); }
            const hd = document.querySelector('.cart-header');
            if (hd) {
                let el = $('pdxCartCust');
                if (!el) { el = document.createElement('span'); el.id = 'pdxCartCust'; el.className = 'pdx-cart-cust'; const cnt = hd.querySelector('.cart-count'); if (cnt) hd.insertBefore(el, cnt); else hd.appendChild(el); }
                const k = (on ? '1|' : '0|') + name;
                if (el.dataset.k !== k) { el.dataset.k = k; el.innerHTML = `<i class="fas fa-user"></i><span>${esc(on ? name : 'Consumidor Final')}</span>`; }
                el.classList.toggle('on', on); el.title = on ? 'Cliente da venda: ' + name : 'Nenhum cliente selecionado';
            }
        } finally { painting = false; }
    }
    ['selectCustomer', 'clearCustomer'].forEach(fn => { const o = window[fn]; if (typeof o === 'function') window[fn] = function () { const r = o.apply(this, arguments); paintCustomer(); return r; }; });
    const nameNode = $('selectedCustomerName');
    if (nameNode && window.MutationObserver) new MutationObserver(() => { if (!painting) paintCustomer(); }).observe(nameNode, { childList: true, characterData: true, subtree: true });

    /* ================= 1. Caixa obrigatório ================= */
    let cashReg = null;
    async function findOpenCash() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); return s.empty ? null : { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { }
        try { const s = await db.collection('cash_registers').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.status === 'open') || null; } catch (e) { return null; }
    }
    function paintCash(state) {
        const hd = document.querySelector('.pdv-header'); if (!hd) return;
        let b = $('pdxCash');
        if (!b) { b = document.createElement('button'); b.id = 'pdxCash'; b.type = 'button'; hd.appendChild(b); b.addEventListener('click', () => { if (cashReg) toast('info', `Caixa aberto por ${cashReg.operatorName || 'operador'}${fmtT(cashReg.openedAt) ? ' às ' + fmtT(cashReg.openedAt) : ''} · troco inicial ${money(cashReg.initialAmount)}`); else openCashModal(); }); }
        const s = state || (cashReg ? 'open' : 'closed');
        b.className = 'pdx-cash ' + s;
        b.innerHTML = s === 'open' ? '<i class="fas fa-lock-open"></i><span>Caixa aberto</span>' : s === 'closed' ? '<i class="fas fa-lock"></i><span>Caixa fechado</span>' : '<i class="fas fa-spinner fa-spin"></i><span>Caixa...</span>';
        b.title = s === 'open' ? `Caixa aberto por ${cashReg && cashReg.operatorName || ''}` : 'Caixa fechado: clique para abrir. A venda só é finalizada com o caixa aberto.';
    }
    let refreshing = null;
    function refreshCash() {
        if (refreshing) return refreshing;
        paintCash(cashReg ? 'open' : 'wait');
        refreshing = findOpenCash().then(r => { cashReg = r; G.cash = r; paintCash(); return r; }).catch(() => { paintCash(); return cashReg; }).finally(() => { refreshing = null; });
        return refreshing;
    }
    function openCashModal(next) {
        if (document.querySelector('.pdx-modal.cash')) return;
        const ov = document.createElement('div'); ov.className = 'modal-overlay active pdx-modal cash';
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-cash-register" style="color:var(--accent);margin-right:8px"></i>Abrir caixa</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="pdx-prev" style="margin-bottom:12px"><i class="fas fa-circle-info" style="color:var(--accent);margin-right:6px"></i>Nenhum caixa aberto. Abra o caixa para a venda entrar no fechamento do dia (vendas, sangrias e suprimentos ficam na tela Caixa).</div>
            <div class="form-group"><label class="form-label">Valor inicial em dinheiro (troco)</label><input type="number" class="form-control" id="pdxCashInit" step="0.01" min="0" placeholder="0,00" value="0"></div>
            <div class="form-group"><label class="form-label">Turno</label><select class="form-control" id="pdxCashShift"><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="night">Noite</option></select></div>
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Agora não</button><button class="btn btn-primary" type="button" data-ok style="white-space:normal;line-height:1.25"><i class="fas fa-lock-open"></i> Abrir caixa${next ? ' e vender' : ''}</button></div></div>`;
        document.body.appendChild(ov);
        const h = new Date().getHours(); ov.querySelector('#pdxCashShift').value = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'night';
        ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ov.remove());
        const ok = ov.querySelector('[data-ok]');
        ok.onclick = async () => {
            ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo...';
            try {
                const amount = parseFloat(ov.querySelector('#pdxCashInit').value) || 0;
                const id = await CashService.open(amount, ov.querySelector('#pdxCashShift').value);
                ov.remove(); toast('success', 'Caixa aberto!');
                await refreshCash();
                if (!cashReg && id) { let who = ''; try { who = (currentUser && currentUser.name) || ''; } catch (e) { } cashReg = { id, initialAmount: amount, status: 'open', openedAt: new Date(), operatorName: who }; G.cash = cashReg; paintCash(); }
                if (typeof next === 'function') next();
            } catch (e) { toast('error', 'Não foi possível abrir o caixa: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); ok.disabled = false; ok.innerHTML = '<i class="fas fa-lock-open"></i> Abrir caixa'; }
        };
        ov.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok.click(); } });
        setTimeout(() => { const f = ov.querySelector('#pdxCashInit'); if (f) { f.focus(); f.select(); } }, 60);
    }

    /* ================= 2. Fiado: vencimento + parcelas ================= */
    let fiadoChoice = null;
    function cartTotalNow() {
        const t = ($('cartTotal') && $('cartTotal').textContent) || '';
        let s = t.replace(/[^\d,.-]/g, ''); if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        const n = Number(s); if (Number.isFinite(n) && n > 0) return n;
        return r2(G.cart.reduce((a, i) => a + Number(i.total || 0), 0));
    }
    function addMonths(base, i) { const d = new Date(base.getFullYear(), base.getMonth() + i, base.getDate()); if (d.getDate() !== base.getDate()) d.setDate(0); return d; }
    function openFiadoModal(total, next) {
        if (document.querySelector('.pdx-modal.fiado')) return;
        const def = new Date(); def.setDate(def.getDate() + 30);
        const ov = document.createElement('div'); ov.className = 'modal-overlay active pdx-modal fiado';
        const hasCred = !!$('dpcPayBtn');
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3><i class="fas fa-handshake" style="color:#f59e0b;margin-right:8px"></i>Venda fiado — vencimento</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>
          <div class="modal-body">
            <div class="pdx-prev" style="margin-bottom:12px"><b style="color:var(--text-primary)">${esc(G.custName)}</b> · total <b style="color:var(--text-primary)">${money(total)}</b><br>A conta vai para Contas a Receber com o vencimento escolhido.</div>
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
              <div class="form-group"><label class="form-label">Vencimento</label><input type="date" class="form-control" id="pdxFiadoDate" value="${ymd(def)}"></div>
              <div class="form-group"><label class="form-label">Parcelas</label><select class="form-control" id="pdxFiadoN">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(n => `<option value="${n}">${n === 1 ? 'À vista (1x)' : n + 'x mensais'}</option>`).join('')}</select></div>
            </div>
            <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">${[7, 15, 30, 45, 60].map(d => `<button type="button" class="btn btn-sm btn-outline" data-days="${d}" style="font-size:11px">${d} dias</button>`).join('')}</div>
            <div class="pdx-prev" id="pdxFiadoPrev"></div>
            ${hasCred ? '<div style="font-size:11px;color:var(--text-muted);margin-top:8px"><i class="fas fa-circle-info" style="margin-right:4px"></i>Para entrada, juros e carnê use a forma <b>Crediário</b>.</div>' : ''}
          </div>
          <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Voltar</button><button class="btn btn-primary" type="button" data-ok><i class="fas fa-check-circle"></i> Confirmar e finalizar</button></div></div>`;
        document.body.appendChild(ov);
        const dateEl = ov.querySelector('#pdxFiadoDate'), nEl = ov.querySelector('#pdxFiadoN'), prev = ov.querySelector('#pdxFiadoPrev');
        const paint = () => {
            const n = Number(nEl.value) || 1; const [y, m, d] = (dateEl.value || ymd(def)).split('-').map(Number); const base = new Date(y, m - 1, d);
            if (isNaN(base)) { prev.textContent = 'Informe o vencimento.'; return; }
            const first = base.toLocaleDateString('pt-BR'), last = addMonths(base, n - 1).toLocaleDateString('pt-BR');
            prev.innerHTML = n === 1 ? `Vence em <b>${first}</b> · ${money(total)}` : `<b>${n}x de ${money(total / n)}</b> · 1ª em ${first}, última em ${last}`;
        };
        dateEl.oninput = paint; nEl.onchange = paint; paint();
        ov.querySelectorAll('[data-days]').forEach(b => b.onclick = () => { const d = new Date(); d.setDate(d.getDate() + Number(b.dataset.days)); dateEl.value = ymd(d); paint(); });
        ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => ov.remove());
        ov.querySelector('[data-ok]').onclick = () => {
            if (!dateEl.value) { toast('warning', 'Informe o vencimento.'); return; }
            fiadoChoice = { date: dateEl.value, parcelas: Number(nEl.value) || 1 };
            ov.remove(); next();
        };
        ov.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ov.querySelector('[data-ok]').click(); } });
        setTimeout(() => dateEl.focus(), 60);
    }
    const origBuild = window.buildSalePayments;
    if (typeof origBuild === 'function') window.buildSalePayments = function (total) {
        const list = origBuild.apply(this, arguments);
        const c = fiadoChoice;
        if (!c || !Array.isArray(list) || list.length !== 1 || list[0].method !== 'fiado') return list;
        const p = list[0], n = Math.max(1, Math.min(24, Number(c.parcelas) || 1));
        if (n === 1) { p.dueDate = c.date; p.installments = 1; return list; }
        const [y, m, d] = c.date.split('-').map(Number); const base = new Date(y, m - 1, d);
        const out = []; let acc = 0; const tot = Number(total) || 0;
        for (let i = 0; i < n; i++) {
            const amt = i === n - 1 ? r2(tot - acc) : r2(tot / n); acc = r2(acc + amt);
            out.push({ ...p, amount: amt, dueDate: ymd(addMonths(base, i)), installments: 1, parcela: `${i + 1}/${n}`, netAmount: amt, feeValue: 0, feePercent: 0, cashReceived: 0, changeValue: 0 });
        }
        return out;
    };

    /* ================= Finalizar: caixa → fiado → venda ================= */
    const origFinalize = window.finalizeSale;
    let passing = false;
    window.finalizeSale = async function () {
        if (passing) return origFinalize.apply(this, arguments);
        const items = G.cart;
        if (!Array.isArray(items) || !items.length) return origFinalize.apply(this, arguments); // a original avisa "carrinho vazio"
        const reg = await refreshCash();
        if (!reg) { openCashModal(() => window.finalizeSale()); return; }
        if (G.payment === 'fiado' && !fiadoChoice) {
            if (!G.custId) {
                toast('warning', 'Para vender fiado, escolha o cliente da venda.');
                const i = $('customerSearch'); if (i) { try { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } i.focus(); }
                return;
            }
            openFiadoModal(cartTotalNow(), () => window.finalizeSale());
            return;
        }
        passing = true;
        try { return await origFinalize.apply(this, arguments); }
        finally { passing = false; fiadoChoice = null; }
    };

    /* ================= 4. Serviços marcados + caixa na venda ================= */
    if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function') {
        const oc = SalesService.create;
        SalesService.create = async function (saleData) {
            try {
                if (saleData && Array.isArray(saleData.items)) {
                    const prods = G.products || [];
                    const isSvc = p => !!p && (typeof window.dpIsServiceProduct === 'function' ? window.dpIsServiceProduct(p) : p.productType === 'service');
                    saleData.items.forEach(it => { if (!it.isService) { const p = prods.find(x => x.id === it.productId); if (isSvc(p)) it.isService = true; } });
                }
                if (saleData && !saleData.cashRegisterId && cashReg) saleData.cashRegisterId = cashReg.id;
            } catch (e) { }
            const r = await oc.apply(this, arguments);
            setTimeout(paintCustomer, 300);
            return r;
        };
    }

    /* ================= 5. Depois da venda: limpa a observação e oferece o WhatsApp ================= */
    const PAYN = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado', multi: 'Múltiplo' };
    const waPhone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) return d; return d.length === 10 || d.length === 11 ? '55' + d : d; };
    let company = null;
    async function companyName() { if (company) return company; company = 'Nossa loja'; try { const s = await db.collection('settings').doc('general').get(); const g = s.exists ? (s.data() || {}) : {}; company = g.nomeFantasia || g.razaoSocial || company; } catch (e) { } return company; }
    async function receiptText(sale) {
        const co = await companyName();
        const items = (sale.items || []).map(i => `• ${(Number(i.quantity) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}x ${i.productName} — ${money(i.total)}${i.notes ? `\n   ${i.notes}` : ''}`);
        const pays = (sale.payments || []).map(p => `${PAYN[p.method] || p.method}${(sale.payments || []).length > 1 ? ' ' + money(p.amount) : ''}${p.method === 'credito' && Number(p.installments) > 1 ? ' em ' + p.installments + 'x' : ''}${p.method === 'fiado' && p.dueDate ? ' (vence ' + String(p.dueDate).split('-').reverse().join('/') + ')' : ''}`);
        return [`*${co}*`, `Comprovante da venda #V-${String(sale.saleNumber || 0).padStart(4, '0')}`, new Date().toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }), '',
            ...items, '',
            Number(sale.discount) > 0 ? `Desconto: - ${money(sale.discount)}` : '', Number(sale.deliveryFee) > 0 ? `Entrega: ${money(sale.deliveryFee)}` : '',
            `*Total: ${money(sale.total)}*`, pays.length ? `Pagamento: ${pays.join(' + ')}` : '',
            sale.sellerName ? `Vendedor: ${sale.sellerName}` : '', sale.notes ? `Obs.: ${sale.notes}` : '', '', 'Obrigado pela preferência!'].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== '')).join('\n');
    }
    async function sendReceiptWhats(sale) {
        let phone = '';
        try { const c = (allPdvCustomers || []).find(x => x.id === sale.customerId); if (c) phone = c.whatsapp || c.phone || ''; } catch (e) { }
        if (!phone && sale.customerId) { try { const d = await db.collection('customers').doc(sale.customerId).get(); if (d.exists) { const c = d.data() || {}; phone = c.whatsapp || c.phone || ''; } } catch (e) { } }
        if (!phone) { const t = window.prompt('Número de WhatsApp do cliente (com DDD):', ''); if (!t) return; phone = t; }
        window.open(`https://wa.me/${waPhone(phone)}?text=${encodeURIComponent(await receiptText(sale))}`, '_blank');
    }
    window.dpSendReceiptWhats = sendReceiptWhats;
    function waBar(sale, a4) {
        document.getElementById('pdxWaBar')?.remove();
        const bar = document.createElement('div'); bar.id = 'pdxWaBar';
        bar.style.cssText = 'position:fixed;left:50%;bottom:22px;transform:translateX(-50%);z-index:9000;background:var(--bg-card);border:1px solid var(--border-color);box-shadow:var(--shadow-lg);border-radius:14px;padding:10px 12px;display:flex;align-items:center;gap:10px;font-size:13px;max-width:94vw;flex-wrap:wrap';
        bar.innerHTML = `<span>Venda #V-${String(sale.saleNumber || 0).padStart(4, '0')} concluída</span>${a4 ? '<button type="button" class="btn btn-sm btn-outline" data-a4><i class="fas fa-file-lines"></i> Imprimir A4</button>' : ''}<button type="button" class="btn btn-sm" data-wa style="background:#25d366;color:#fff;border:0"><i class="fab fa-whatsapp"></i> Enviar comprovante</button><button type="button" class="btn btn-sm btn-secondary" data-x aria-label="Fechar"><i class="fas fa-xmark"></i></button>`;
        if (a4) bar.querySelector('[data-a4]').onclick = () => window.DPSaleA4.print(sale);
        bar.querySelector('[data-wa]').onclick = () => { sendReceiptWhats(sale); bar.remove(); };
        bar.querySelector('[data-x]').onclick = () => bar.remove();
        document.body.appendChild(bar);
        setTimeout(() => bar.remove(), 20000);
    }
    const origAfter = window.handlePrintAfterSale;
    if (typeof origAfter === 'function') window.handlePrintAfterSale = async function (sale) {
        // A observação desta venda já foi gravada: limpa o campo para não passar para a próxima venda
        try { const n = $('saleNotes'); if (n) n.value = ''; } catch (e) { }
        const r = await origAfter.apply(this, arguments);
        try {
            // 37.0 · Comprovante em folha A4 (só com a opção ligada em Configurações › Impressão)
            let a4 = false; try { a4 = !!(window.DPSaleA4 && await window.DPSaleA4.enabled()); } catch (e) { }
            const ov = $('printPromptOverlay');
            // 37.8 · a linha dos botões Não/Imprimir (a 1ª div com display:flex é o círculo do ícone)
            const row = ov && [...ov.querySelectorAll('.modal-body > div')].find(d => d.querySelector('button'));
            if (row) {
                row.style.flexWrap = 'wrap';
                if (a4) {
                    const p = document.createElement('button'); p.type = 'button'; p.className = 'btn btn-outline'; p.style.cssText = 'flex-basis:100%;margin-top:2px';
                    p.innerHTML = '<i class="fas fa-file-lines"></i> Imprimir em folha A4';
                    p.onclick = () => { window.DPSaleA4.print(sale); ov.remove(); };
                    row.appendChild(p);
                }
                const b = document.createElement('button'); b.type = 'button'; b.className = 'btn'; b.style.cssText = 'flex-basis:100%;background:#25d366;color:#fff;border:0;margin-top:2px';
                b.innerHTML = '<i class="fab fa-whatsapp"></i> Enviar comprovante no WhatsApp';
                b.onclick = () => sendReceiptWhats(sale);
                row.appendChild(b);
            } else waBar(sale, a4);
        } catch (e) { console.warn(e); }
        return r;
    };

    /* ================= início ================= */
    paintCustomer();
    const oi = window.initPDV;
    if (typeof oi === 'function') window.initPDV = async function () { const r = await oi.apply(this, arguments); refreshCash(); paintCustomer(); return r; };
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(refreshCash, 900); }); } catch (e) { setTimeout(refreshCash, 1500); }
    setInterval(() => { if (!document.hidden) refreshCash(); }, 60000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) refreshCash(); });
})();
