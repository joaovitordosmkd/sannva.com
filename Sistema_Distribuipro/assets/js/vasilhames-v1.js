/* DistribuiPro 38.1 · Vasilhames (cascos retornáveis) — todas as versões.
   Cerveja 600 ml, litrão, galão de água, botijão de gás: no caixa o cliente troca o vazio, paga o casco ou leva emprestado.
   Coleções: bottle_types { name, depositPrice, emptyStock, lentOut, active, deleted }
             bottle_moves { bottleTypeId, bottleTypeName, customerId, customerName, saleId, saleNumber, type, qty, amount,
                            notes, supplierName, userId, userName, createdAt, reverted }
               type: 'troca' | 'emprestimo' | 'devolucao' | 'compra_casco' | 'retorno_fornecedor' | 'ajuste'
             customers.bottles { <bottleTypeId>: cascos que o cliente está devendo }
             products.returnable { enabled, bottleTypeId }
             settings/general.bottlesEnabled: fora do Mensal mostra o item "Vasilhames" no menu (no Mensal vale o ramo).
   Telas: PDV ("Trouxe o casco?" + cobrança do casco + empréstimo), Produtos (bloco Retornável), Clientes (aba Cascos),
          Configurações › Vendas (chave) e vasilhames.html (vazios, quem deve, devoluções, histórico).
   Venda cancelada: os cascos dela são desfeitos sozinhos na próxima vez que a tela Vasilhames ou a ficha abrir. */
(function () {
    'use strict';
    if (window.DPVasilhames) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const int = v => Math.max(0, Math.round(num(v)));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fq = q => (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const uid = () => (auth.currentUser && auth.currentUser.uid) || '';
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } };
    const meName = () => me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador';
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || v.value || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const ms = v => { const d = toDate(v); return d ? d.getTime() : 0; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const waNum = v => { const d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) return d; return d.length === 10 || d.length === 11 ? '55' + d : ''; };
    const plural = (n, a, b) => `${fq(n)} ${Number(n) === 1 ? a : b}`;
    const custName = c => (c && (c.name || c.nome || c.razaoSocial)) || 'Cliente';
    const custPhone = c => (c && (c.whatsapp || c.phone || c.celular || c.telefone)) || '';
    const kind = () => (window.DPEdition && DPEdition.kind) || 'nucleo';

    /* =================== Dados =================== */
    let types = null, company = null;
    const TKEY = 'dp_bottle_types_n';
    async function loadTypes(force) {
        if (types && !force) return types;
        try {
            const s = await db.collection('bottle_types').get();
            types = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(t => !t.deleted).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        } catch (e) { types = types || []; }
        try { localStorage.setItem(TKEY, String(types.length)); } catch (e) { }
        return types;
    }
    const typeOf = id => (types || []).find(t => t.id === id) || null;
    const typeName = id => (typeOf(id) || {}).name || 'Casco';
    const owes = c => { const b = (c && c.bottles) || {}; return Object.keys(b).filter(k => num(b[k]) > 0).map(k => ({ typeId: k, qty: int(b[k]) })); };
    const owesTotal = c => owes(c).reduce((s, x) => s + x.qty, 0);
    const owesText = c => owes(c).map(x => `${plural(x.qty, 'casco', 'cascos')} de ${typeName(x.typeId)}`).join(' e ');
    async function loadCompany() {
        if (company) return company;
        company = 'nossa loja';
        try { const s = await db.collection('settings').doc('general').get(); const g = s.exists ? (s.data() || {}) : {}; let b = {}; try { b = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {}; } catch (e) { } company = g.nomeFantasia || b.companyName || g.razaoSocial || company; } catch (e) { }
        return company;
    }
    async function bumpType(id, f) {
        const inc = {}; Object.keys(f).forEach(k => { if (num(f[k])) inc[k] = FV().increment(num(f[k])); });
        if (!id || !Object.keys(inc).length) return;
        inc.updatedAt = ts();
        await db.collection('bottle_types').doc(id).update(inc);
        const t = typeOf(id); if (t) Object.keys(f).forEach(k => { t[k] = num(t[k]) + num(f[k]); });
    }
    async function bumpCustomer(cid, typeId, delta) {
        if (!cid || !typeId || !delta) return null;
        const ref = db.collection('customers').doc(cid);
        const s = await ref.get(); const c = s.exists ? (s.data() || {}) : {};
        const b = { ...(c.bottles || {}) };
        b[typeId] = Math.max(0, int(b[typeId]) + delta);
        await ref.set({ bottles: b, bottlesUpdatedAt: ts() }, { merge: true });
        return b;
    }
    async function addMove(m) {
        return db.collection('bottle_moves').add({
            bottleTypeId: m.bottleTypeId, bottleTypeName: m.bottleTypeName || typeName(m.bottleTypeId),
            customerId: m.customerId || '', customerName: m.customerName || '', saleId: m.saleId || '', saleNumber: m.saleNumber || null,
            type: m.type, qty: num(m.qty), amount: r2(m.amount || 0), notes: m.notes || '', supplierName: m.supplierName || '',
            userId: uid(), userName: meName(), reverted: false, deleted: false, createdAt: ts()
        });
    }
    async function openCash() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { }
        try { const s = await db.collection('cash_registers').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.status === 'open') || null; } catch (e) { return null; }
    }

    /** Venda concluída: grava troca, casco cobrado e empréstimo de cada tipo. */
    async function recordSale(list, info) {
        await loadTypes();
        for (const b of list) {
            const base = { bottleTypeId: b.typeId, bottleTypeName: b.name || typeName(b.typeId), customerId: info.customerId || '', customerName: info.customerName || '', saleId: info.saleId || '', saleNumber: info.saleNumber || null };
            if (b.troca > 0) { await addMove({ ...base, type: 'troca', qty: b.troca }); await bumpType(b.typeId, { emptyStock: b.troca }); }
            if (b.cobrar > 0) await addMove({ ...base, type: 'compra_casco', qty: b.cobrar, amount: r2(b.cobrar * num(b.depositPrice)) });
            if (b.emprestar > 0) {
                await addMove({ ...base, type: 'emprestimo', qty: b.emprestar });
                await bumpType(b.typeId, { lentOut: b.emprestar });
                if (info.customerId) await bumpCustomer(info.customerId, b.typeId, b.emprestar);
            }
        }
    }
    /** Cliente devolveu: primeiro abate o que ele devia; tudo entra no estoque de vazios. */
    async function registerReturn(o) {
        const qty = int(o.qty); if (!qty || !o.typeId) throw new Error('Informe a quantidade.');
        let owed = 0;
        if (o.customerId) { try { const s = await db.collection('customers').doc(o.customerId).get(); owed = int(((s.exists && s.data().bottles) || {})[o.typeId]); } catch (e) { } }
        const loan = Math.min(qty, owed);
        let refund = r2(o.refund || 0);
        if (refund > 0) {
            const cash = await openCash();
            if (!cash) throw new Error('Para devolver dinheiro, abra o caixa primeiro (Caixa › Abrir caixa).');
            const desc = `Devolução de casco · ${o.customerName || 'cliente'} · ${qty} × ${typeName(o.typeId)}`;
            if (typeof CashService !== 'undefined' && CashService && typeof CashService.withdraw === 'function') await CashService.withdraw(cash.id, refund, desc);
            else await db.collection('cash_movements').add({ cashRegisterId: cash.id, type: 'withdraw', amount: -refund, paymentMethod: 'dinheiro', description: desc, referenceId: '', referenceType: 'bottle', reversed: false, createdAt: ts() });
        }
        await addMove({ bottleTypeId: o.typeId, customerId: o.customerId || '', customerName: o.customerName || '', type: 'devolucao', qty, amount: -refund, notes: o.notes || (loan ? `${loan} que devia` : '') });
        await bumpType(o.typeId, { emptyStock: qty, lentOut: -loan });
        if (o.customerId && loan) await bumpCustomer(o.customerId, o.typeId, -loan);
        return { loan, refund };
    }
    async function registerLoan(o) {
        const qty = int(o.qty); if (!qty || !o.typeId || !o.customerId) throw new Error('Escolha o cliente, o casco e a quantidade.');
        await addMove({ bottleTypeId: o.typeId, customerId: o.customerId, customerName: o.customerName || '', type: 'emprestimo', qty, notes: o.notes || 'Lançado à mão' });
        await bumpType(o.typeId, { lentOut: qty });
        await bumpCustomer(o.customerId, o.typeId, qty);
    }
    async function registerSupplier(o) {
        const qty = int(o.qty); if (!qty || !o.typeId) throw new Error('Informe a quantidade.');
        await addMove({ bottleTypeId: o.typeId, type: 'retorno_fornecedor', qty: -qty, supplierName: o.supplierName || '', notes: o.notes || '' });
        await bumpType(o.typeId, { emptyStock: -qty });
    }
    async function registerCount(o) {
        const t = typeOf(o.typeId); if (!t) throw new Error('Casco não encontrado.');
        const diff = Math.round(num(o.emptyStock)) - Math.round(num(t.emptyStock));
        if (!diff) return 0;
        await addMove({ bottleTypeId: o.typeId, type: 'ajuste', qty: diff, notes: o.notes || 'Contagem dos vazios' });
        await bumpType(o.typeId, { emptyStock: diff });
        return diff;
    }
    /** Venda cancelada: desfaz troca e empréstimo dela (uma vez só). */
    async function reconcile(moves) {
        try {
            if (!moves) { const s = await db.collection('bottle_moves').get(); moves = s.docs.map(d => ({ id: d.id, ...d.data() })); }
            const pend = moves.filter(m => m.saleId && !m.reverted && !m.deleted && ['troca', 'emprestimo', 'compra_casco'].includes(m.type));
            if (!pend.length) return 0;
            const s = await db.collection('sales').where('status', '==', 'cancelled').get();
            const cancelled = new Set(s.docs.map(d => d.id));
            let n = 0;
            for (const m of pend) {
                if (!cancelled.has(m.saleId)) continue;
                if (m.type === 'troca') await bumpType(m.bottleTypeId, { emptyStock: -num(m.qty) });
                if (m.type === 'emprestimo') { await bumpType(m.bottleTypeId, { lentOut: -num(m.qty) }); if (m.customerId) await bumpCustomer(m.customerId, m.bottleTypeId, -int(m.qty)); }
                await db.collection('bottle_moves').doc(m.id).update({ reverted: true, revertedAt: ts(), notes: [m.notes, 'Venda cancelada: desfeito'].filter(Boolean).join(' · ') });
                m.reverted = true; n++;
            }
            return n;
        } catch (e) { console.warn('vasilhames: conferência de vendas canceladas', e); return 0; }
    }

    /* =================== Estilo =================== */
    const css = `.vas-chip{display:inline-flex;align-items:center;gap:5px;margin-top:4px;border:1px solid rgba(16,185,129,.35);background:rgba(16,185,129,.1);color:#059669;border-radius:999px;padding:1px 9px;font-size:10.5px;font-weight:700;cursor:pointer;line-height:17px}
.vas-chip.lend{border-color:rgba(217,119,6,.4);background:rgba(245,158,11,.12);color:#b45309}.vas-chip.pay{border-color:rgba(99,102,241,.35);background:rgba(99,102,241,.1);color:var(--accent)}
[data-theme="dark"] .vas-chip{color:#34d399}[data-theme="dark"] .vas-chip.lend{color:#fbbf24}
.vas-ov{position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.vas-dlg{background:var(--bg-card);color:var(--text-primary);border-radius:16px;width:100%;max-width:440px;padding:18px;box-shadow:0 24px 60px rgba(0,0,0,.35);max-height:92vh;overflow:auto}
.vas-dlg.wide{max-width:520px}
.vas-hd{display:flex;align-items:flex-start;gap:12px;margin-bottom:14px}.vas-hd h4{margin:0;font-size:16px;color:var(--text-heading)}.vas-hd p{margin:3px 0 0;font-size:12px;color:var(--text-muted);line-height:1.4}
.vas-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(16,185,129,.13);color:#059669;font-size:19px}
.vas-x{margin-left:auto;border:none;background:transparent;color:var(--text-muted);cursor:pointer;font-size:16px;padding:4px}
.vas-opts{display:flex;flex-direction:column;gap:8px}
.vas-opt{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:2px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);border-radius:12px;padding:11px 12px;cursor:pointer;font:inherit}
.vas-opt:hover,.vas-opt.on{border-color:var(--accent)}.vas-opt.on{background:rgba(99,102,241,.08)}
.vas-opt>i,.vas-opt>svg{font-size:18px;color:var(--accent);flex:none;width:22px}.vas-opt span{flex:1;min-width:0}.vas-opt b{display:block;font-size:13.5px}.vas-opt small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:1px}
.vas-opt kbd{font:700 11px/1 inherit;border:1px solid var(--border-color);border-radius:6px;padding:4px 7px;color:var(--text-muted);background:var(--bg-card)}
.vas-opt.warn small{color:#b45309}
.vas-link{border:none;background:none;color:var(--accent);font-weight:700;font-size:12px;cursor:pointer;padding:8px 0 0}
.vas-split{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-top:10px}.vas-split label{font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:3px}.vas-split input{text-align:center;font-weight:800}
.vas-note{margin-top:10px;font-size:12px;padding:8px 10px;border-radius:10px;background:rgba(245,158,11,.1);color:#92400e;line-height:1.45}[data-theme="dark"] .vas-note{color:#fcd34d}
.vas-act{display:flex;justify-content:flex-end;gap:8px;margin-top:16px}
.vas-f{margin-bottom:12px}.vas-f label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:4px}.vas-f small{display:block;font-size:11px;color:var(--text-muted);margin-top:4px}
.vas-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.vas-pick{position:relative}.vas-dd{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;z-index:30;max-height:220px;overflow:auto;box-shadow:var(--shadow-lg,0 10px 30px rgba(0,0,0,.2))}
.vas-dd button{display:block;width:100%;text-align:left;border:none;background:none;color:var(--text-primary);padding:8px 12px;cursor:pointer;font:inherit;font-size:13px;border-bottom:1px solid var(--border-color)}.vas-dd button:hover{background:var(--bg-secondary)}.vas-dd small{color:var(--text-muted)}
.vas-who{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--bg-secondary);font-size:13px}.vas-who b{flex:1}.vas-who button{border:none;background:none;color:var(--accent);font-weight:700;cursor:pointer;font-size:12px}
.vas-check{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--text-secondary);cursor:pointer;margin:4px 0 8px}.vas-check input{margin-top:2px;accent-color:var(--accent)}
.vas-owe-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;background:rgba(245,158,11,.1);border:1px solid rgba(217,119,6,.3);color:var(--text-primary);border-radius:10px;padding:8px 12px;margin:0 0 10px;font-size:12px}
.vas-owe-bar i,.vas-owe-bar svg{color:#d97706}.vas-owe-bar button{margin-left:auto;border:1px solid rgba(217,119,6,.45);background:transparent;color:#b45309;border-radius:8px;padding:4px 10px;font-weight:700;font-size:11.5px;cursor:pointer}
[data-theme="dark"] .vas-owe-bar button{color:#fbbf24}
.vas-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:14px;margin-bottom:16px}
.vas-bar{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px}
.vas-sec{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border-color);flex-wrap:wrap}.vas-sec h3{margin:0;font-size:15px;color:var(--text-heading);display:flex;align-items:center;gap:8px}.vas-sec h3 i,.vas-sec h3 svg{color:var(--accent)}.vas-sec .sp{flex:1}
.vas-tb td,.vas-tb th{white-space:nowrap}.vas-tb td.wrap{white-space:normal}
.vas-n{font-weight:800;font-size:15px}.vas-n.bad{color:#d97706}.vas-mute{color:var(--text-muted);font-size:11.5px}
.vas-acts{display:flex;gap:6px;flex-wrap:wrap}
.vas-btn{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:8px;padding:5px 10px;font-size:12px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none}
.vas-btn:hover{border-color:var(--accent);color:var(--accent)}.vas-btn.wa{color:#16a34a;border-color:rgba(22,163,74,.35)}.vas-btn.ok{color:#059669;border-color:rgba(16,185,129,.4)}
.vas-empty{text-align:center;padding:30px 16px;color:var(--text-muted);font-size:13px}.vas-empty i,.vas-empty svg{display:block;margin:0 auto 8px;font-size:28px;opacity:.35}
.vas-presets{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 4px}.vas-presets button{border:1px dashed var(--border-color);background:var(--bg-secondary);color:var(--text-primary);border-radius:999px;padding:6px 12px;font-size:12px;font-weight:600;cursor:pointer}.vas-presets button:hover{border-color:var(--accent);color:var(--accent)}
.vas-off{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:12px 14px;border-radius:12px;margin-bottom:16px;background:rgba(99,102,241,.08);border:1px solid rgba(99,102,241,.3);font-size:13px}.vas-off b{color:var(--text-heading)}
.vas-mv-rev td{text-decoration:line-through;opacity:.55}
.vas-tag{display:inline-block;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 8px;background:var(--bg-secondary);color:var(--text-secondary)}
.vas-tag.troca{background:rgba(16,185,129,.12);color:#059669}.vas-tag.emprestimo{background:rgba(245,158,11,.14);color:#b45309}.vas-tag.devolucao{background:rgba(59,130,246,.12);color:#2563eb}.vas-tag.compra_casco{background:rgba(99,102,241,.12);color:var(--accent)}.vas-tag.retorno_fornecedor{background:rgba(100,116,139,.15);color:#475569}
.vas-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px;margin-bottom:14px}.vas-card{border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;background:var(--bg-card)}.vas-card small{display:block;color:var(--text-muted);font-size:11.5px}.vas-card b{display:block;font-size:20px;margin-top:2px}
.vas-dlg [hidden],#vasBox [hidden],.vas-owe-bar [hidden]{display:none!important}
@media(pointer:coarse){.vas-opt kbd{display:none}}
@media(max-width:640px){.vas-g2,.vas-split{grid-template-columns:1fr}.vas-hide{display:none}}`;
    function addCss() { if ($('vasCss')) return; const st = document.createElement('style'); st.id = 'vasCss'; st.textContent = css; document.head.appendChild(st); }
    function modal(html, cls) {
        addCss();
        const ov = document.createElement('div'); ov.className = 'vas-ov';
        ov.innerHTML = `<div class="vas-dlg ${cls || ''}" role="dialog">${html}</div>`;
        document.body.appendChild(ov);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); close(); } };
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-vx]')) close(); });
        return { ov, close, q: s => ov.querySelector(s) };
    }

    /* ---------- Escolher cliente (diálogos) ---------- */
    let custList = null;
    async function loadCustomers(force) {
        if (custList && !force) return custList;
        try { const s = await db.collection('customers').get(); custList = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted && c.status !== 'inactive').sort((a, b) => custName(a).localeCompare(custName(b), 'pt-BR')); }
        catch (e) { custList = custList || []; }
        return custList;
    }
    function custPicker(host, onPick, initial) {
        let cur = initial || null;
        const paint = () => {
            if (cur) {
                host.innerHTML = `<div class="vas-who"><i class="fas fa-user"></i><b>${esc(custName(cur))}</b><span class="vas-mute">${esc(owesTotal(cur) ? 'deve ' + owesText(cur) : 'não deve casco')}</span><button type="button" data-ch>Trocar</button></div>`;
                host.querySelector('[data-ch]').onclick = () => { cur = null; onPick(null); paint(); setTimeout(() => host.querySelector('input')?.focus(), 30); };
                return;
            }
            host.innerHTML = `<div class="vas-pick"><input type="text" class="form-control" placeholder="Buscar cliente por nome ou telefone..." autocomplete="off"><div class="vas-dd" hidden></div></div>`;
            const inp = host.querySelector('input'), dd = host.querySelector('.vas-dd');
            const draw = async () => {
                const list = await loadCustomers(); const q = norm(inp.value.trim()), d = inp.value.replace(/\D/g, '');
                const found = (q ? list.filter(c => norm(custName(c)).includes(q) || (d.length >= 3 && String(custPhone(c)).replace(/\D/g, '').includes(d))) : list.filter(c => owesTotal(c) > 0)).slice(0, 12);
                dd.innerHTML = found.map((c, i) => `<button type="button" data-i="${i}">${esc(custName(c))} <small>${esc([custPhone(c), owesTotal(c) ? 'deve ' + plural(owesTotal(c), 'casco', 'cascos') : ''].filter(Boolean).join(' · '))}</small></button>`).join('') || `<div class="vas-mute" style="padding:10px 12px">${q ? 'Nenhum cliente encontrado.' : 'Digite o nome do cliente.'}</div>`;
                dd.hidden = false;
                dd.onclick = e => { const b = e.target.closest('[data-i]'); if (!b) return; cur = found[Number(b.dataset.i)]; onPick(cur); paint(); };
            };
            inp.addEventListener('input', draw); inp.addEventListener('focus', draw);
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); dd.querySelector('[data-i]')?.click(); } });
        };
        paint();
        return { get: () => cur };
    }
    const typeOptions = (sel) => (types || []).map(t => `<option value="${esc(t.id)}" ${t.id === sel ? 'selected' : ''}>${esc(t.name)}${num(t.depositPrice) ? ' · ' + money(t.depositPrice) : ''}</option>`).join('');

    /* ---------- Diálogo: cliente devolveu ---------- */
    async function returnDialog(o) {
        o = o || {};
        await loadTypes();
        if (!(types || []).length) { toast('warning', 'Cadastre primeiro o tipo de casco em Estoque › Vasilhames.'); return; }
        let cust = o.customer || null;
        const m = modal(`<div class="vas-hd"><span class="vas-ic"><i class="fas fa-rotate-left"></i></span><div><h4>Cliente devolveu casco</h4><p>O vazio entra no depósito. Se o cliente estava devendo, a dívida de casco baixa primeiro.</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
<div class="vas-f"><label>Cliente</label><div id="vasRCust"></div><small>Sem cadastro? Deixe em branco: o vazio entra no depósito do mesmo jeito.</small></div>
<div class="vas-g2"><div class="vas-f"><label>Casco</label><select class="form-control" id="vasRType">${typeOptions(o.typeId)}</select></div><div class="vas-f"><label>Quantidade</label><input type="text" class="form-control" id="vasRQty" inputmode="numeric" value="1"></div></div>
<div class="vas-note" id="vasRInfo" hidden></div>
<label class="vas-check"><input type="checkbox" id="vasRRefund"><span>Devolver o valor do casco em dinheiro <small class="vas-mute" style="display:block">Para quem pagou o casco e agora trouxe de volta. Sai do caixa aberto.</small></span></label>
<div class="vas-g2" id="vasRRefBox" hidden><div class="vas-f"><label>Cascos a reembolsar</label><input type="text" class="form-control" id="vasRRefQty" inputmode="numeric" value="1"></div><div class="vas-f"><label>Valor a devolver</label><input type="text" class="form-control" id="vasRRefVal" inputmode="decimal"></div></div>
<div class="vas-act"><button type="button" class="btn btn-secondary" data-vx>Cancelar</button><button type="button" class="btn btn-primary" id="vasROk"><i class="fas fa-check"></i> Registrar devolução</button></div>`);
        const q = m.q;
        const picker = custPicker(q('#vasRCust'), c => { cust = c; if (c) { const ow = owes(c); if (ow.length && !ow.some(x => x.typeId === q('#vasRType').value)) q('#vasRType').value = ow[0].typeId; const n = (ow.find(x => x.typeId === q('#vasRType').value) || {}).qty; if (n) q('#vasRQty').value = String(n); } info(); }, cust);
        if (cust) { const ow = owes(cust); const t = o.typeId || (ow[0] && ow[0].typeId); if (t) q('#vasRType').value = t; const n = (ow.find(x => x.typeId === q('#vasRType').value) || {}).qty; if (n) q('#vasRQty').value = String(n); }
        // Só reembolsa o casco que foi PAGO: o que o cliente devia (emprestado) não volta dinheiro
        const extraOf = () => { const tid = q('#vasRType').value, n = int(q('#vasRQty').value), owed = cust ? int((cust.bottles || {})[tid]) : 0; return Math.max(0, n - Math.min(n, owed)); };
        function info() {
            const tid = q('#vasRType').value, t = typeOf(tid) || {}, n = int(q('#vasRQty').value), owed = cust ? int(((cust.bottles || {})[tid])) : 0;
            const loan = Math.min(n, owed), extra = n - loan;
            const box = q('#vasRInfo');
            if (cust && owed) { box.hidden = false; box.innerHTML = `${esc(custName(cust))} devia <b>${plural(owed, 'casco', 'cascos')}</b> de ${esc(t.name || 'casco')}. ${loan >= owed ? 'Fica <b>sem dever</b>.' : `Vai ficar devendo <b>${plural(owed - loan, 'casco', 'cascos')}</b>.`}${extra > 0 ? ` ${plural(extra, 'casco a mais', 'cascos a mais')} (pago antes).` : ''}`; }
            else box.hidden = true;
            q('#vasRRefBox').hidden = !q('#vasRRefund').checked;
            if (!q('#vasRRefQty').dataset.touched) q('#vasRRefQty').value = String(extra);
            const rq = Math.min(n, int(q('#vasRRefQty').value));
            if (!q('#vasRRefVal').dataset.touched) q('#vasRRefVal').value = num2(r2(rq * num(t.depositPrice)));
        }
        q('#vasRType').onchange = info; q('#vasRQty').oninput = info;
        q('#vasRRefund').onchange = () => { if (q('#vasRRefund').checked && !extraOf() && !q('#vasRRefQty').dataset.touched) toast('info', 'Este cliente devia esses cascos (empréstimo): normalmente não há valor a devolver.'); info(); };
        q('#vasRRefQty').oninput = () => { q('#vasRRefQty').dataset.touched = '1'; delete q('#vasRRefVal').dataset.touched; info(); };
        q('#vasRRefVal').oninput = () => { q('#vasRRefVal').dataset.touched = '1'; };
        info();
        setTimeout(() => (cust ? q('#vasRQty') : q('#vasRCust input'))?.focus(), 40);
        q('#vasROk').onclick = async () => {
            const btn = q('#vasROk'); if (btn.disabled) return;
            const n = int(q('#vasRQty').value); if (!n) { toast('warning', 'Informe quantos cascos voltaram.'); return; }
            const c = picker.get(), refund = q('#vasRRefund').checked ? r2(num(q('#vasRRefVal').value)) : 0;
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try {
                const r = await registerReturn({ typeId: q('#vasRType').value, qty: n, customerId: c ? c.id : '', customerName: c ? custName(c) : '', refund });
                m.close();
                toast('success', `${plural(n, 'casco devolvido', 'cascos devolvidos')}${r.refund ? ' · ' + money(r.refund) + ' devolvido no caixa' : ''}.`);
                custList = null;
                if (typeof o.onDone === 'function') o.onDone(r);
            } catch (e) { toast('error', e.message); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Registrar devolução'; }
        };
    }
    /* ---------- Diálogo: emprestar (saldo antigo, sem venda) ---------- */
    async function loanDialog(o) {
        o = o || {}; await loadTypes();
        if (!(types || []).length) { toast('warning', 'Cadastre primeiro o tipo de casco.'); return; }
        let cust = o.customer || null;
        const m = modal(`<div class="vas-hd"><span class="vas-ic" style="background:rgba(245,158,11,.14);color:#b45309"><i class="fas fa-handshake"></i></span><div><h4>Lançar casco emprestado</h4><p>Para começar com quem já devia casco antes do sistema, ou empréstimo sem venda. Na venda, use o PDV.</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
<div class="vas-f"><label>Cliente</label><div id="vasLCust"></div></div>
<div class="vas-g2"><div class="vas-f"><label>Casco</label><select class="form-control" id="vasLType">${typeOptions(o.typeId)}</select></div><div class="vas-f"><label>Quantidade</label><input type="text" class="form-control" id="vasLQty" inputmode="numeric" value="1"></div></div>
<div class="vas-f"><label>Observação</label><input type="text" class="form-control" id="vasLNotes" maxlength="120" placeholder="Ex.: saldo do caderno, festa de sábado..."></div>
<div class="vas-act"><button type="button" class="btn btn-secondary" data-vx>Cancelar</button><button type="button" class="btn btn-primary" id="vasLOk"><i class="fas fa-check"></i> Lançar</button></div>`);
        const q = m.q;
        const picker = custPicker(q('#vasLCust'), c => { cust = c; }, cust);
        setTimeout(() => (cust ? q('#vasLQty') : q('#vasLCust input'))?.focus(), 40);
        q('#vasLOk').onclick = async () => {
            const c = picker.get(), n = int(q('#vasLQty').value);
            if (!c) { toast('warning', 'Escolha o cliente que ficou com o casco.'); return; }
            if (!n) { toast('warning', 'Informe a quantidade.'); return; }
            const btn = q('#vasLOk'); btn.disabled = true;
            try { await registerLoan({ typeId: q('#vasLType').value, qty: n, customerId: c.id, customerName: custName(c), notes: q('#vasLNotes').value.trim() }); m.close(); toast('success', `${custName(c)} ficou devendo ${plural(n, 'casco', 'cascos')}.`); custList = null; if (typeof o.onDone === 'function') o.onDone(); }
            catch (e) { toast('error', e.message); btn.disabled = false; }
        };
    }
    /* ---------- Diálogo: devolvi vazios ao fornecedor ---------- */
    async function supplierDialog(o) {
        o = o || {}; await loadTypes();
        if (!(types || []).length) { toast('warning', 'Cadastre primeiro o tipo de casco.'); return; }
        let sups = []; try { const s = await db.collection('suppliers').get(); sups = s.docs.map(d => d.data() || {}).filter(x => !x.deleted).map(x => x.name || x.fantasyName || x.companyName).filter(Boolean); } catch (e) { }
        const m = modal(`<div class="vas-hd"><span class="vas-ic" style="background:rgba(100,116,139,.15);color:#475569"><i class="fas fa-truck"></i></span><div><h4>Devolvi vazios ao fornecedor</h4><p>Os vazios saem do depósito (troca na cervejaria, na distribuidora de gás ou de água).</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
<div class="vas-g2"><div class="vas-f"><label>Casco</label><select class="form-control" id="vasSType">${typeOptions(o.typeId)}</select></div><div class="vas-f"><label>Quantidade</label><input type="text" class="form-control" id="vasSQty" inputmode="numeric" value="1"><small id="vasSHave"></small></div></div>
<div class="vas-f"><label>Fornecedor</label><input type="text" class="form-control" id="vasSSup" list="vasSupList" placeholder="Ex.: Ambev, Liquigás..." autocomplete="off"><datalist id="vasSupList">${sups.map(s => `<option value="${esc(s)}">`).join('')}</datalist></div>
<div class="vas-f"><label>Observação</label><input type="text" class="form-control" id="vasSNotes" maxlength="120" placeholder="Ex.: nota 4521, crédito de R$ 200"></div>
<div class="vas-act"><button type="button" class="btn btn-secondary" data-vx>Cancelar</button><button type="button" class="btn btn-primary" id="vasSOk"><i class="fas fa-check"></i> Registrar</button></div>`);
        const q = m.q;
        const have = () => { const t = typeOf(q('#vasSType').value); q('#vasSHave').textContent = t ? `No depósito: ${fq(num(t.emptyStock))} vazio(s)` : ''; if (t && !q('#vasSQty').dataset.touched) q('#vasSQty').value = String(Math.max(1, int(t.emptyStock))); };
        q('#vasSType').onchange = have; q('#vasSQty').oninput = () => { q('#vasSQty').dataset.touched = '1'; }; have();
        q('#vasSOk').onclick = async () => {
            const t = typeOf(q('#vasSType').value), n = int(q('#vasSQty').value);
            if (!n) { toast('warning', 'Informe a quantidade.'); return; }
            if (t && n > num(t.emptyStock) && !confirm(`O sistema mostra só ${fq(num(t.emptyStock))} vazio(s) de ${t.name} no depósito. Registrar ${n} mesmo assim?`)) return;
            const btn = q('#vasSOk'); btn.disabled = true;
            try { await registerSupplier({ typeId: q('#vasSType').value, qty: n, supplierName: q('#vasSSup').value.trim(), notes: q('#vasSNotes').value.trim() }); m.close(); toast('success', `${plural(n, 'vazio', 'vazios')} devolvido(s) ao fornecedor.`); if (typeof o.onDone === 'function') o.onDone(); }
            catch (e) { toast('error', e.message); btn.disabled = false; }
        };
    }
    /* ---------- Diálogo: tipo de casco ---------- */
    const PRESETS = [['Casco 600 ml', 8], ['Casco 1 L (litrão)', 10], ['Casco 300 ml', 5], ['Galão de água 20 L', 25], ['Botijão de gás P13', 150]];
    async function typeDialog(t, onDone, preset) {
        const isNew = !t;
        const m = modal(`<div class="vas-hd"><span class="vas-ic"><i class="fas fa-recycle"></i></span><div><h4>${isNew ? 'Novo tipo de casco' : 'Editar casco'}</h4><p>O mesmo casco serve para várias marcas (ex.: Skol, Brahma e Antarctica 600 ml usam o "Casco 600 ml").</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
${isNew ? `<div class="vas-presets">${PRESETS.map(([n, v]) => `<button type="button" data-p="${esc(n)}" data-v="${v}">${esc(n)}</button>`).join('')}</div>` : ''}
<div class="vas-f"><label>Nome</label><input type="text" class="form-control" id="vasTName" maxlength="60" value="${esc(t ? t.name : '')}" placeholder="Ex.: Casco 600 ml"></div>
<div class="vas-g2"><div class="vas-f"><label>Valor do casco (R$)</label><input type="text" class="form-control" id="vasTPrice" inputmode="decimal" value="${t && num(t.depositPrice) ? num2(t.depositPrice) : ''}" placeholder="0,00"><small>Quanto o cliente paga quando leva sem trazer o vazio.</small></div>
${isNew ? `<div class="vas-f"><label>Vazios no depósito hoje</label><input type="text" class="form-control" id="vasTStock" inputmode="numeric" value="0"><small>Conte os vazios que você tem agora.</small></div>` : '<div></div>'}</div>
<div class="vas-act">${!isNew ? '<button type="button" class="btn btn-outline" id="vasTDel" style="margin-right:auto;color:#dc2626">Excluir</button>' : ''}<button type="button" class="btn btn-secondary" data-vx>Cancelar</button><button type="button" class="btn btn-primary" id="vasTOk"><i class="fas fa-check"></i> Salvar</button></div>`);
        const q = m.q;
        m.ov.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { q('#vasTName').value = b.dataset.p; q('#vasTPrice').value = num2(b.dataset.v); q('#vasTStock')?.focus(); });
        const pre = isNew && preset && PRESETS.find(x => x[0] === preset);
        if (pre) { q('#vasTName').value = pre[0]; q('#vasTPrice').value = num2(pre[1]); }
        setTimeout(() => (pre ? q('#vasTStock') : q('#vasTName')).focus(), 40);
        q('#vasTOk').onclick = async () => {
            const name = q('#vasTName').value.trim(), price = r2(num(q('#vasTPrice').value));
            if (!name) { toast('warning', 'Dê um nome ao casco.'); return; }
            if ((types || []).some(x => x.id !== (t && t.id) && norm(x.name) === norm(name))) { toast('warning', 'Já existe um casco com esse nome.'); return; }
            const btn = q('#vasTOk'); btn.disabled = true;
            try {
                if (isNew) {
                    const stock = Math.round(num(q('#vasTStock').value));
                    const ref = await db.collection('bottle_types').add({ name, depositPrice: price, emptyStock: stock, lentOut: 0, active: true, deleted: false, createdAt: ts(), updatedAt: ts() });
                    await loadTypes(true);
                    m.close(); toast('success', `${name} cadastrado.`); if (onDone) onDone(ref.id);
                } else {
                    await db.collection('bottle_types').doc(t.id).update({ name, depositPrice: price, updatedAt: ts() });
                    await loadTypes(true); m.close(); toast('success', 'Casco atualizado.'); if (onDone) onDone(t.id);
                }
            } catch (e) { toast('error', e.message); btn.disabled = false; }
        };
        if (q('#vasTDel')) q('#vasTDel').onclick = async () => {
            if (!confirm(`Excluir "${t.name}"? Os produtos ligados a ele deixam de perguntar pelo casco. O histórico continua.`)) return;
            try { await db.collection('bottle_types').doc(t.id).update({ deleted: true, active: false, updatedAt: ts() }); await loadTypes(true); m.close(); toast('success', 'Casco excluído.'); if (onDone) onDone(null); } catch (e) { toast('error', e.message); }
        };
    }
    async function countDialog(t, onDone) {
        const m = modal(`<div class="vas-hd"><span class="vas-ic"><i class="fas fa-clipboard-check"></i></span><div><h4>Contagem dos vazios · ${esc(t.name)}</h4><p>Contou os vazios no depósito e o número não bate? Informe quantos tem de verdade.</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
<div class="vas-g2"><div class="vas-f"><label>O sistema mostra</label><input type="text" class="form-control" value="${esc(fq(num(t.emptyStock)))}" disabled></div><div class="vas-f"><label>Contei agora</label><input type="text" class="form-control" id="vasCQty" inputmode="numeric" value="${esc(String(Math.max(0, Math.round(num(t.emptyStock)))))}"></div></div>
<div class="vas-f"><label>Motivo</label><input type="text" class="form-control" id="vasCNotes" maxlength="120" placeholder="Ex.: casco quebrado, contagem do mês"></div>
<div class="vas-act"><button type="button" class="btn btn-secondary" data-vx>Cancelar</button><button type="button" class="btn btn-primary" id="vasCOk"><i class="fas fa-check"></i> Acertar</button></div>`);
        setTimeout(() => { const i = m.q('#vasCQty'); i.focus(); i.select(); }, 40);
        m.q('#vasCOk').onclick = async () => {
            try { const d = await registerCount({ typeId: t.id, emptyStock: m.q('#vasCQty').value, notes: m.q('#vasCNotes').value.trim() || 'Contagem dos vazios' }); m.close(); toast(d ? 'success' : 'info', d ? `Contagem acertada (${d > 0 ? '+' : ''}${d}).` : 'Nada mudou.'); if (onDone) onDone(); }
            catch (e) { toast('error', e.message); }
        };
    }
    async function waCharge(c) {
        const wa = waNum(custPhone(c)); if (!wa) { toast('warning', 'Este cliente não tem WhatsApp cadastrado.'); return; }
        const co = await loadCompany();
        const first = custName(c).split(' ')[0];
        const msg = `Olá, ${first}! Aqui é da ${co}. Consta aqui que você está com ${owesText(c)} nosso${owesTotal(c) === 1 ? '' : 's'}. Quando puder, traga na próxima compra ou avise que passamos aí para buscar. Obrigado!`;
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
    }

    const api = { loadTypes, typeOf, owes, owesTotal, owesText, recordSale, registerReturn, registerLoan, registerSupplier, registerCount, reconcile, returnDialog, loanDialog, supplierDialog, typeDialog, waCharge };
    window.DPVasilhames = api;

    /* =================== PDV =================== */
    function setupPdv() {
        if (typeof window.renderCart !== 'function' || !$('cartItems')) return;
        addCss();
        loadTypes();
        const getCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
        const getProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
        const byId = id => getProducts().find(p => p.id === id);
        const retType = p => p && p.returnable && p.returnable.enabled && p.returnable.bottleTypeId ? p.returnable.bottleTypeId : '';
        const selCustId = () => { try { return selectedCustomerId || null; } catch (e) { return null; } };
        const curCust = () => {
            if (typeof window.dpPdvCustomer === 'function') return window.dpPdvCustomer();
            const id = selCustId(); if (!id) return null;
            try { return (allPdvCustomers || []).find(x => String(x.id) === String(id)) || null; } catch (e) { return null; }
        };
        function counts(it) {
            const units = Math.max(0, Math.round(num(it.quantity) * (num(it._factor) || 1)));
            const b = it._bottle || {};
            if (b.mode === 'misto') { const c = Math.min(int(b.cobrar), units), e = Math.min(int(b.emprestar), units - c); return { units, troca: units - c - e, cobrar: c, emprestar: e }; }
            return { units, troca: b.mode === 'troca' || !b.mode ? units : 0, cobrar: b.mode === 'cobrar' ? units : 0, emprestar: b.mode === 'emprestar' ? units : 0 };
        }
        function label(it) {
            const k = counts(it), parts = [];
            if (k.troca) parts.push((k.troca === k.units ? '' : k.troca + ' ') + 'troca');
            if (k.cobrar) parts.push((k.cobrar === k.units ? '' : k.cobrar + ' ') + 'cobrado');
            if (k.emprestar) parts.push((k.emprestar === k.units ? '' : k.emprestar + ' ') + 'emprestado');
            return { text: 'Casco: ' + (parts.join(' · ') || 'troca'), cls: k.emprestar ? 'lend' : k.cobrar ? 'pay' : '' };
        }
        // Linha "Casco 600 ml (casco)" com a quantidade de cascos cobrados
        let lastCart = null; const feeSeen = new Set();
        function sync() {
            const c = getCart();
            if (c !== lastCart) { feeSeen.clear(); lastCart = c; }
            const need = {};
            c.forEach(it => {
                if (!it || it._dpBottleFee) return;
                if (!it._bottle) { const tid = retType(byId(it.productId)); if (tid) it._bottle = { typeId: tid, mode: 'troca', cobrar: 0, emprestar: 0 }; }
                if (!it._bottle) return;
                const k = counts(it); if (k.cobrar) need[it._bottle.typeId] = (need[it._bottle.typeId] || 0) + k.cobrar;
            });
            for (let i = c.length - 1; i >= 0; i--) {
                const it = c[i]; if (!it || !it._dpBottleFee) continue;
                const n = need[it._dpBottleFee] || 0;
                if (!n) { c.splice(i, 1); feeSeen.delete(it._dpBottleFee); continue; }
                it.quantity = n; it.total = r2(n * num(it.unitPrice)); delete need[it._dpBottleFee];
            }
            Object.keys(need).forEach(tid => {
                if (feeSeen.has(tid)) { // a pessoa tirou a linha do casco do carrinho: não cobra, vira troca
                    c.forEach(it => { if (it._bottle && it._bottle.typeId === tid) { if (it._bottle.mode === 'cobrar') it._bottle.mode = 'troca'; else if (it._bottle.mode === 'misto') it._bottle.cobrar = 0; } });
                    feeSeen.delete(tid); toast('info', `${typeName(tid)}: casco não será cobrado (ficou como troca).`);
                    return;
                }
                const t = typeOf(tid) || { name: 'Casco', depositPrice: 0 }, price = r2(num(t.depositPrice)), n = need[tid];
                c.push({ _cartKey: 'casco_' + tid, _dpBottleFee: tid, _factor: 1, _pkgLabel: '', _unit: 'un', productId: '', productName: (t.name || 'Casco') + ' (casco)', productCode: '', unitPrice: price, originalUnitPrice: price, notes: '', costPrice: 0, quantity: n, discount: 0, total: r2(n * price) });
                feeSeen.add(tid);
            });
        }
        function decorate() {
            const rows = document.querySelectorAll('#cartItems .cart-item'), c = getCart();
            rows.forEach((row, i) => {
                const it = c[i]; if (!it) return;
                const info = row.querySelector('.ci-info'); if (!info || info.querySelector('.vas-chip')) return;
                if (it._bottle) {
                    const l = label(it), b = document.createElement('button'); b.type = 'button'; b.className = 'vas-chip ' + l.cls; b.title = 'Trocar: troca, cobrar o casco ou emprestar';
                    b.innerHTML = `<i class="fas fa-recycle"></i>${esc(l.text)}`; b.onclick = e => { e.stopPropagation(); ask(i); };
                    info.appendChild(b);
                } else if (it._dpBottleFee) {
                    const s = document.createElement('span'); s.className = 'vas-chip pay'; s.style.cursor = 'default'; s.innerHTML = '<i class="fas fa-coins"></i>Casco cobrado'; info.appendChild(s);
                }
            });
            paintOwe();
        }
        // Cliente da venda que está devendo casco
        function paintOwe() {
            const holder = $('cartItems'); if (!holder) return;
            const c = selCustId() ? curCust() : null, bar = $('vasOweBar');
            if (!c || !owesTotal(c)) { if (bar) bar.remove(); return; }
            const html = `<i class="fas fa-recycle"></i><span><b>${esc(custName(c))}</b> está devendo ${esc(owesText(c))}.</span><button type="button" id="vasOweBtn">Devolveu agora</button>`;
            if (bar && bar.dataset.k === c.id + '|' + owesTotal(c)) return;
            const el = bar || document.createElement('div'); el.id = 'vasOweBar'; el.className = 'vas-owe-bar'; el.dataset.k = c.id + '|' + owesTotal(c); el.innerHTML = html;
            if (!bar) holder.parentElement.insertBefore(el, holder);
            el.querySelector('#vasOweBtn').onclick = () => returnDialog({ customer: c, onDone: async () => { try { const s = await db.collection('customers').doc(c.id).get(); if (s.exists) { c.bottles = (s.data() || {}).bottles || {}; } } catch (e) { } renderCart(); } });
        }
        function ask(index) {
            const it = getCart()[index]; if (!it || !it._bottle) return;
            if (document.querySelector('.vas-ov')) return;
            const t = typeOf(it._bottle.typeId) || { name: 'Casco', depositPrice: 0 }, k = counts(it), price = num(t.depositPrice);
            const cust = selCustId() ? curCust() : null, owedHere = cust ? int((cust.bottles || {})[it._bottle.typeId]) : 0;
            const m = modal(`<div class="vas-hd"><span class="vas-ic"><i class="fas fa-recycle"></i></span><div><h4>Trouxe o casco?</h4><p>${esc(it.productName)} · ${plural(k.units, 'casco', 'cascos')} de ${esc(t.name)}</p></div><button type="button" class="vas-x" data-vx aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
<div class="vas-opts">
  <button type="button" class="vas-opt ${it._bottle.mode === 'troca' ? 'on' : ''}" data-m="troca"><i class="fas fa-recycle"></i><span><b>Troca</b><small>Trouxe o vazio</small></span><kbd>1</kbd></button>
  <button type="button" class="vas-opt ${it._bottle.mode === 'cobrar' ? 'on' : ''}" data-m="cobrar"><i class="fas fa-coins"></i><span><b>Cobrar casco${price ? ' ' + money(price) : ''}</b><small>${price ? `Não trouxe: entra ${money(r2(price * k.units))} na venda` : 'Cadastre o valor do casco em Vasilhames'}</small></span><kbd>2</kbd></button>
  <button type="button" class="vas-opt ${it._bottle.mode === 'emprestar' ? 'on' : ''} ${cust ? '' : 'warn'}" data-m="emprestar"><i class="fas fa-handshake"></i><span><b>Emprestar</b><small>${cust ? `${esc(custName(cust))} fica devendo` : 'Fica devendo · escolha o cliente da venda'}</small></span><kbd>3</kbd></button>
</div>
${k.units > 1 ? '<button type="button" class="vas-link" id="vasSplitBtn"><i class="fas fa-sliders"></i> Dividir: parte troca, parte cobra ou empresta</button>' : ''}
<div id="vasSplit" hidden><div class="vas-split"><div><label>Troca</label><input class="form-control" id="vasSpT" disabled></div><div><label>Cobrar</label><input class="form-control" id="vasSpC" inputmode="numeric" value="${k.cobrar}"></div><div><label>Emprestar</label><input class="form-control" id="vasSpE" inputmode="numeric" value="${k.emprestar}"></div></div>
<div class="vas-act" style="margin-top:10px"><button type="button" class="btn btn-primary" id="vasSpOk"><i class="fas fa-check"></i> Confirmar</button></div></div>
${owedHere ? `<div class="vas-note">${esc(custName(cust))} já deve <b>${plural(owedHere, 'casco', 'cascos')}</b> deste tipo.</div>` : ''}`);
            const set = mode => { it._bottle.mode = mode; it._bottle.cobrar = 0; it._bottle.emprestar = 0; m.close(); renderCart(); if (mode === 'emprestar' && !selCustId()) toast('info', 'Escolha o cliente da venda: ele fica devendo o casco.'); };
            m.ov.querySelectorAll('[data-m]').forEach(b => b.onclick = () => set(b.dataset.m));
            const sp = () => { const c = Math.min(int(m.q('#vasSpC').value), k.units), e = Math.min(int(m.q('#vasSpE').value), k.units - c); m.q('#vasSpT').value = String(k.units - c - e); return { c, e }; };
            if (m.q('#vasSplitBtn')) m.q('#vasSplitBtn').onclick = () => { m.q('#vasSplit').hidden = false; m.q('#vasSplitBtn').hidden = true; sp(); setTimeout(() => m.q('#vasSpC').focus(), 30); };
            if (m.q('#vasSpC')) { m.q('#vasSpC').oninput = sp; m.q('#vasSpE').oninput = sp; }
            if (m.q('#vasSpOk')) m.q('#vasSpOk').onclick = () => { const { c, e } = sp(); it._bottle.mode = (c || e) ? 'misto' : 'troca'; it._bottle.cobrar = c; it._bottle.emprestar = e; m.close(); renderCart(); };
            // Atalhos 1/2/3: se as teclas chegam coladas é o leitor de código bipando o próximo produto, não o caixa
            let pend = null, lastKey = 0;
            m.ov.addEventListener('keydown', e => {
                if (e.target.tagName === 'INPUT') { if (e.key === 'Enter') { e.preventDefault(); m.q('#vasSpOk')?.click(); } return; }
                const now = performance.now(), fast = now - lastKey < 70; lastKey = now;
                if (pend) { clearTimeout(pend); pend = null; }
                if (fast) return;
                const map = { '1': 'troca', '2': 'cobrar', '3': 'emprestar' };
                if (map[e.key]) { e.preventDefault(); const mode = map[e.key]; pend = setTimeout(() => { pend = null; set(mode); }, 90); }
                else if (e.key === 'Enter') { e.preventDefault(); set(it._bottle.mode || 'troca'); }
            });
            const obs = new MutationObserver(() => { if (!m.ov.isConnected) { obs.disconnect(); setTimeout(nextAsk, 80); } });
            obs.observe(document.body, { childList: true });
            setTimeout(() => (m.ov.querySelector('.vas-opt.on') || m.ov.querySelector('.vas-opt'))?.focus(), 30);
        }
        // Vários retornáveis seguidos: uma pergunta de cada vez
        const queue = [];
        function nextAsk() {
            if (document.querySelector('.vas-ov') || document.getElementById('dpqOverlay')) return;
            while (queue.length) { const it = queue.shift(), i = getCart().indexOf(it); if (i >= 0 && it._bottle) { ask(i); return; } }
        }
        function askLater(it) { if (!queue.includes(it)) queue.push(it); nextAsk(); }
        window.dpVasAsk = ask;

        const oAdd = window.addToCartWithPkg;
        if (typeof oAdd === 'function') window.addToCartWithPkg = function (product) {
            const before = getCart().length;
            const r = oAdd.apply(this, arguments);
            try {
                const c = getCart(), tid = retType(product);
                if (tid && c.length > before) {
                    const idx = c.length - 1, it = c[idx];
                    if (it && it.productId === product.id && !it._vasAsked) { // linha nova (o renderCart já pode ter posto "troca")
                        it._vasAsked = true;
                        if (!it._bottle) it._bottle = { typeId: tid, mode: 'troca', cobrar: 0, emprestar: 0 };
                        const open = () => { if (document.getElementById('dpqOverlay')) return setTimeout(open, 300); askLater(it); };
                        loadTypes().then(() => setTimeout(open, 60));
                    }
                }
            } catch (e) { }
            return r;
        };
        const oRender = window.renderCart;
        window.renderCart = function () {
            try { sync(); } catch (e) { console.warn('vasilhames', e); }
            const r = oRender.apply(this, arguments);
            try { decorate(); } catch (e) { }
            return r;
        };
        // Empréstimo precisa do cliente
        const oFin = window.finalizeSale;
        if (typeof oFin === 'function') window.finalizeSale = function () {
            const lend = getCart().some(it => it && it._bottle && counts(it).emprestar > 0);
            if (lend && !selCustId()) {
                toast('warning', 'Para emprestar casco, escolha o cliente da venda (ele fica devendo o casco).');
                const i = $('customerSearch'); if (i) { try { i.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } i.focus(); }
                return;
            }
            return oFin.apply(this, arguments);
        };
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function' && !SalesService.__dpVas) {
            SalesService.__dpVas = true;
            const oc = SalesService.create;
            SalesService.create = async function (data) {
                const agg = {};
                try {
                    const c = getCart();
                    (data && Array.isArray(data.items) ? data.items : []).forEach((it, i) => {
                        const ci = c[i]; if (!ci || ci.productName !== it.productName) return;
                        if (ci._dpBottleFee) { it.bottleFee = ci._dpBottleFee; return; }
                        if (!ci._bottle) return;
                        const k = counts(ci), tid = ci._bottle.typeId, t = typeOf(tid) || {};
                        it.bottle = { typeId: tid, troca: k.troca, cobrar: k.cobrar, emprestar: k.emprestar };
                        const a = agg[tid] = agg[tid] || { typeId: tid, name: t.name || 'Casco', depositPrice: num(t.depositPrice), troca: 0, cobrar: 0, emprestar: 0 };
                        a.troca += k.troca; a.cobrar += k.cobrar; a.emprestar += k.emprestar;
                    });
                    // o valor do casco é o que foi cobrado de verdade na linha (pode ter sido mudado à mão)
                    c.forEach(ci => { if (ci && ci._dpBottleFee && agg[ci._dpBottleFee]) agg[ci._dpBottleFee].depositPrice = num(ci.unitPrice); });
                    if (Object.keys(agg).length && data) data.bottles = Object.values(agg);
                } catch (e) { }
                const r = await oc.apply(this, arguments);
                const list = Object.values(agg);
                if (r && r.id && list.length && data && data.status !== 'cancelled') {
                    try {
                        await recordSale(list, { saleId: r.id, saleNumber: r.saleNumber, customerId: data.customerId || '', customerName: data.customerName || '' });
                        const lent = list.reduce((s, x) => s + x.emprestar, 0);
                        if (lent && data.customerId) { try { const cc = (allPdvCustomers || []).find(x => String(x.id) === String(data.customerId)); if (cc) { cc.bottles = { ...(cc.bottles || {}) }; list.forEach(x => { if (x.emprestar) cc.bottles[x.typeId] = int(cc.bottles[x.typeId]) + x.emprestar; }); } } catch (e) { } }
                    } catch (e) { console.warn(e); toast('warning', 'Venda registrada, mas os cascos não foram anotados: ' + e.message); }
                }
                return r;
            };
        }
    }

    /* =================== Produtos › cadastro =================== */
    function setupProducts() {
        const modalEl = $('productModal'), promo = $('prodPromoPrice');
        if (!modalEl || !promo || $('vasBox')) return;
        addCss();
        const box = document.createElement('details'); box.className = 'dpat'; box.id = 'vasBox';
        box.innerHTML = `<summary><span class="dpat-t"><i class="fas fa-recycle"></i> Vasilhame retornável (casco)</span><span class="dpat-s" id="vasState">Não</span><span class="dpat-ch"><i class="fas fa-chevron-down"></i></span></summary>
<div class="dpat-b">
  <label class="vas-check" style="font-size:13px"><input type="checkbox" id="prodRetOn"><span><b>Este produto vem em casco retornável</b><small class="vas-mute" style="display:block">Cerveja 600 ml, litrão, galão de água, botijão de gás. No PDV o caixa escolhe: troca, cobrar o casco ou emprestar.</small></span></label>
  <div class="vas-g2" id="prodRetBox" hidden><div class="vas-f" style="margin:0"><label>Tipo de casco</label><select class="form-control" id="prodRetType"></select></div><div class="vas-f" style="margin:0;display:flex;align-items:flex-end"><button type="button" class="btn btn-outline btn-sm" id="prodRetNew"><i class="fas fa-plus"></i> Novo tipo de casco</button></div></div>
</div>`;
        const anchor = $('dpatBox') || promo.closest('.form-row') || promo.closest('.form-group');
        anchor.parentElement.insertBefore(box, anchor.nextSibling);
        const fillTypes = sel => { const s = $('prodRetType'); s.innerHTML = (types || []).length ? typeOptions(sel) : '<option value="">Cadastre um tipo de casco</option>'; if (sel) s.value = sel; };
        const paint = () => { const on = $('prodRetOn').checked; $('prodRetBox').hidden = !on; const st = $('vasState'); const t = typeOf($('prodRetType').value); st.textContent = on ? (t ? t.name : 'Escolha o casco') : 'Não'; st.classList.toggle('on', on); };
        $('prodRetOn').addEventListener('change', async () => { if ($('prodRetOn').checked) { await loadTypes(); fillTypes($('prodRetType').value); if (!(types || []).length) typeDialog(null, id => { fillTypes(id); paint(); }); } paint(); });
        $('prodRetType').addEventListener('change', paint);
        $('prodRetNew').addEventListener('click', () => typeDialog(null, id => { fillTypes(id); paint(); }));
        loadTypes().then(() => fillTypes($('prodRetType').value));
        const curProduct = () => { try { return typeof editingProductId !== 'undefined' && editingProductId ? (allProducts || []).find(x => x.id === editingProductId) : null; } catch (e) { return null; } };
        const oOpen = window.openProductModal;
        if (typeof oOpen === 'function') window.openProductModal = function () {
            const r = oOpen.apply(this, arguments);
            try {
                const p = curProduct() || {}, ret = p.returnable || {};
                $('prodRetOn').checked = !!ret.enabled; fillTypes(ret.bottleTypeId || '');
                box.open = !!ret.enabled; paint();
                if (ret.enabled) loadTypes().then(() => { fillTypes(ret.bottleTypeId || ''); paint(); });
            } catch (e) { console.warn('vasilhames produto', e); }
            return r;
        };
        const oSave = window.saveProduct;
        if (typeof oSave === 'function') window.saveProduct = function () {
            if ($('prodRetOn').checked && !$('prodRetType').value) { box.open = true; toast('warning', 'Escolha o tipo de casco do produto retornável (ou cadastre um).'); return; }
            return oSave.apply(this, arguments);
        };
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpVas) {
            svc.__dpVas = true;
            ['create', 'update'].forEach(name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modalEl.classList.contains('active')) {
                        const on = $('prodRetOn').checked && !!$('prodRetType').value;
                        data.returnable = on ? { enabled: true, bottleTypeId: $('prodRetType').value } : { enabled: false, bottleTypeId: '' };
                    }
                    return orig.apply(this, arguments);
                };
            });
        }
    }

    /* =================== Clientes › aba Cascos =================== */
    function setupClients() {
        if (!window.dpClientes) return; // clientes-pro-v1.js (ficha do cliente)
        addCss();
        let hasTypes = false; try { hasTypes = Number(localStorage.getItem(TKEY) || 0) > 0; } catch (e) { }
        loadTypes().then(t => { hasTypes = t.length > 0; });
        const refresh = id => { try { if (window.dpClientes && window.dpClientes.open) window.dpClientes.open(id, { tab: 'cascos', replace: true }); } catch (e) { } };
        window.DPClientTabs = window.DPClientTabs || [];
        if (window.DPClientTabs.some(t => t && t.id === 'cascos')) return;
        window.DPClientTabs.push({
            id: 'cascos', icon: 'fa-recycle', label: 'Cascos',
            show: D => !!(D && D.c) && (hasTypes || owesTotal(D.c) > 0),
            count: D => owesTotal(D && D.c) || '',
            render: async (body, D) => {
                const c = D.c;
                body.innerHTML = '<div class="vas-empty"><i class="fas fa-spinner fa-spin"></i>Carregando...</div>';
                await loadTypes();
                let moves = [];
                try { const s = await db.collection('bottle_moves').where('customerId', '==', c.id).get(); moves = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => !m.deleted); } catch (e) { }
                if (await reconcile(moves)) { try { const s = await db.collection('customers').doc(c.id).get(); if (s.exists) c.bottles = (s.data() || {}).bottles || {}; } catch (e) { } }
                moves.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
                const ow = owes(c), wa = waNum(custPhone(c));
                body.innerHTML = `<div class="card" style="padding:16px">
  <div class="cli-sec-h" style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><h3 style="margin:0;font-size:15px"><i class="fas fa-recycle" style="color:var(--accent);margin-right:6px"></i>Cascos com o cliente</h3><span style="flex:1"></span>
    <button type="button" class="vas-btn ok" data-v="ret"><i class="fas fa-rotate-left"></i> Cliente devolveu</button>
    <button type="button" class="vas-btn" data-v="loan"><i class="fas fa-handshake"></i> Lançar empréstimo</button>
    ${wa && ow.length ? '<button type="button" class="vas-btn wa" data-v="wa"><i class="fab fa-whatsapp"></i> Cobrar no WhatsApp</button>' : ''}</div>
  ${ow.length ? `<div class="vas-cards">${ow.map(x => { const t = typeOf(x.typeId) || {}; return `<div class="vas-card"><small>${esc(t.name || 'Casco')}</small><b style="color:#d97706">${fq(x.qty)} devendo</b><small>${num(t.depositPrice) ? 'Vale ' + money(r2(x.qty * num(t.depositPrice))) : ''}</small></div>`; }).join('')}</div>`
                        : '<div class="vas-empty" style="padding:14px"><i class="fas fa-circle-check"></i>Não está devendo nenhum casco.</div>'}
  <div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin:6px 0 8px">Histórico</div>
  ${moves.length ? `<div class="table-container"><table class="data-table vas-tb"><thead><tr><th>Quando</th><th>O que</th><th>Casco</th><th style="text-align:right">Qtd</th><th style="text-align:right">Valor</th></tr></thead><tbody>${moves.slice(0, 40).map(mv => `<tr class="${mv.reverted ? 'vas-mv-rev' : ''}"><td>${fmtDT(mv.createdAt)}</td><td>${moveTag(mv)}${mv.saleNumber ? ` <span class="vas-mute">Venda #${esc(String(mv.saleNumber))}</span>` : ''}</td><td>${esc(mv.bottleTypeName || typeName(mv.bottleTypeId))}</td><td style="text-align:right">${fq(Math.abs(num(mv.qty)))}</td><td style="text-align:right">${num(mv.amount) ? money(Math.abs(num(mv.amount))) : '—'}</td></tr>`).join('')}</tbody></table></div>`
                        : '<div class="vas-mute">Nenhuma movimentação de casco ainda.</div>'}
</div>`;
                body.querySelectorAll('[data-v]').forEach(b => b.onclick = () => {
                    const v = b.dataset.v, done = () => refresh(c.id);
                    if (v === 'ret') returnDialog({ customer: c, onDone: done });
                    else if (v === 'loan') loanDialog({ customer: c, onDone: done });
                    else if (v === 'wa') waCharge(c);
                });
            }
        });
    }
    const MOVE = { troca: 'Troca', emprestimo: 'Emprestou', devolucao: 'Devolveu', compra_casco: 'Pagou o casco', retorno_fornecedor: 'Devolvido ao fornecedor', ajuste: 'Ajuste' };
    const moveTag = mv => `<span class="vas-tag ${esc(mv.type)}">${esc(MOVE[mv.type] || mv.type)}</span>${mv.reverted ? ' <span class="vas-mute">(venda cancelada)</span>' : ''}`;

    /* =================== Configurações › Vendas: chave =================== */
    function setupSettings() {
        const tab = $('tabVendas'); if (!tab || $('vasCfgCard')) return;
        addCss();
        const card = document.createElement('div'); card.className = 'card'; card.id = 'vasCfgCard'; card.style.marginBottom = '20px';
        const mensal = kind() !== 'nucleo'; // Mensal e demo: o menu segue o ramo do negócio (Seu negócio e o menu)
        card.innerHTML = `<h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:6px"><i class="fas fa-recycle" style="color:var(--accent);margin-right:8px"></i>Vasilhames (cascos retornáveis)</h3>
<p style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Para depósito de bebidas, gás e água: o PDV pergunta se o cliente trouxe o casco, cobra o casco ou anota o empréstimo, e a tela Vasilhames mostra quem está devendo.</p>
${mensal ? `<div class="dpat-cfg-row"><div><b>Aparece no menu conforme o ramo do negócio</b><small>Distribuidora, mercado e "outro" veem Estoque › Vasilhames. Para mostrar ou esconder, use Empresa › Seu negócio e o menu.</small></div><a class="btn btn-outline btn-sm" href="vasilhames.html"><i class="fas fa-recycle"></i> Abrir Vasilhames</a></div>`
                : `<div class="dpat-cfg-row"><div><b>Usar controle de vasilhames</b><small>Mostra Estoque › Vasilhames no menu. Salva sozinho.</small></div><label class="cfg-toggle"><input type="checkbox" id="vasCfgOn"><span class="cfg-toggle-slider"></span></label></div>`}
<p style="font-size:11.5px;color:var(--text-muted);margin:12px 0 0"><i class="fas fa-circle-info" style="margin-right:5px"></i>Depois, em cada produto retornável, marque <b>Vasilhame retornável</b> no cadastro (Produtos).</p>`;
        const scale = $('dpatScaleCard'), tail = tab.lastElementChild;
        if (scale) tab.insertBefore(card, scale);
        else if (tail && tail.querySelector && tail.querySelector('button[onclick*="saveTab"]')) tab.insertBefore(card, tail); else tab.appendChild(card);
        const on = $('vasCfgOn'); if (!on) return;
        db.collection('settings').doc('general').get().then(s => { on.checked = !!(s.exists && (s.data() || {}).bottlesEnabled); }).catch(() => { });
        on.addEventListener('change', async () => {
            try {
                await db.collection('settings').doc('general').set({ bottlesEnabled: on.checked, updatedAt: ts() }, { merge: true });
                try { localStorage.setItem('dp_bottles_on', on.checked ? '1' : '0'); } catch (e) { }
                document.querySelectorAll('.sidebar-menu a.menu-item[href="vasilhames.html"]').forEach(a => a.classList.toggle('dp-off', !on.checked));
                toast('success', on.checked ? 'Vasilhames ligado: está no menu Estoque.' : 'Vasilhames desligado.');
            } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); on.checked = !on.checked; }
        });
    }

    /* =================== Tela Vasilhames =================== */
    function setupPage() {
        const root = $('vasRoot'); if (!root) return;
        addCss();
        let moves = [], customers = [], prods = [], general = {}, filt = { q: '', t: '' }, loading = false;
        async function load() {
            if (loading) return; loading = true;
            try {
                await loadTypes(true);
                const [m, c, p, g] = await Promise.all([
                    db.collection('bottle_moves').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted)).catch(() => []),
                    loadCustomers(true),
                    db.collection('products').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted)).catch(() => []),
                    db.collection('settings').doc('general').get().then(s => s.exists ? (s.data() || {}) : {}).catch(() => ({}))
                ]);
                moves = m; customers = c; prods = p; general = g;
                try { localStorage.setItem('dp_bottles_on', general.bottlesEnabled ? '1' : '0'); } catch (e) { }
                if (await reconcile(moves)) { await loadTypes(true); customers = await loadCustomers(true); }
                // "Na rua" é a soma do que os clientes devem: corrige o número guardado no tipo se ficou diferente
                for (const t of types) {
                    const owed = customers.reduce((s, x) => s + int((x.bottles || {})[t.id]), 0);
                    if (owed !== Math.round(num(t.lentOut))) { try { await db.collection('bottle_types').doc(t.id).update({ lentOut: owed, updatedAt: ts() }); t.lentOut = owed; } catch (e) { } }
                }
                moves.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
            } finally { loading = false; }
            render();
        }
        const fullOf = tid => prods.filter(p => p.returnable && p.returnable.enabled && p.returnable.bottleTypeId === tid && p.status !== 'inactive').reduce((s, p) => s + Math.max(0, num(p.currentStock)), 0);
        function render() {
            const off = kind() === 'nucleo' && !general.bottlesEnabled;
            const owers = customers.filter(c => owesTotal(c) > 0).sort((a, b) => owesTotal(b) - owesTotal(a));
            const emptyAll = types.reduce((s, t) => s + num(t.emptyStock), 0), outAll = types.reduce((s, t) => s + num(t.lentOut), 0);
            const fullAll = types.reduce((s, t) => s + fullOf(t.id), 0), outVal = types.reduce((s, t) => s + num(t.lentOut) * num(t.depositPrice), 0);
            if (!types.length) {
                root.innerHTML = `${off ? offBar() : ''}<div class="card" style="max-width:640px;margin:10px auto;padding:26px 24px;text-align:center">
  <span class="vas-ic" style="margin:0 auto 10px;width:54px;height:54px;font-size:26px"><i class="fas fa-recycle"></i></span>
  <h3 style="margin:0 0 6px;color:var(--text-heading)">Controle de cascos retornáveis</h3>
  <p style="color:var(--text-muted);font-size:13px;line-height:1.55;margin:0 auto 14px;max-width:470px">Saiba quantos vazios tem no depósito, quantos cascos estão na rua e quem está devendo. Comece cadastrando o tipo de casco que você trabalha:</p>
  <div class="vas-presets" style="justify-content:center">${PRESETS.map(([n]) => `<button type="button" data-new="${esc(n)}">${esc(n)}</button>`).join('')}</div>
  <button type="button" class="btn btn-primary" id="vasNewType" style="margin-top:12px"><i class="fas fa-plus"></i> Cadastrar tipo de casco</button>
  <p class="vas-mute" style="margin-top:14px">Depois, marque "Vasilhame retornável" nos produtos (ex.: Skol 600 ml usa o Casco 600 ml).</p></div>`;
                bindCommon();
                root.querySelectorAll('[data-new]').forEach(b => b.onclick = () => typeDialog(null, () => load(), b.dataset.new));
                $('vasNewType').onclick = () => typeDialog(null, () => load());
                return;
            }
            const q = norm(filt.q);
            const list = owers.filter(c => (!q || norm(custName(c)).includes(q) || String(custPhone(c)).replace(/\D/g, '').includes(filt.q.replace(/\D/g, '') || '§')) && (!filt.t || int((c.bottles || {})[filt.t]) > 0));
            const lastLoan = cid => { const mv = moves.find(m => m.customerId === cid && m.type === 'emprestimo' && !m.reverted); return mv ? mv.createdAt : null; };
            root.innerHTML = `${off ? offBar() : ''}
<div class="vas-bar">
  <button type="button" class="btn btn-primary" data-a="ret"><i class="fas fa-rotate-left"></i> Cliente devolveu</button>
  <button type="button" class="btn btn-outline" data-a="sup"><i class="fas fa-truck"></i> Devolvi vazios ao fornecedor</button>
  <button type="button" class="btn btn-outline" data-a="loan"><i class="fas fa-handshake"></i> Lançar empréstimo</button>
  <button type="button" class="btn btn-outline" data-a="type"><i class="fas fa-plus"></i> Tipo de casco</button>
</div>
<div class="vas-stats">
  <div class="stat-card"><div class="stat-icon green"><i class="fas fa-warehouse"></i></div><div class="stat-value">${fq(emptyAll)}</div><div class="stat-label">Vazios no depósito</div></div>
  <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-handshake"></i></div><div class="stat-value">${fq(outAll)}</div><div class="stat-label">Na rua (com clientes)</div></div>
  <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-boxes-stacked"></i></div><div class="stat-value">${fq(fullAll)}</div><div class="stat-label">Cheios no estoque</div></div>
  <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-coins"></i></div><div class="stat-value">${money(outVal)}</div><div class="stat-label">Valor dos cascos na rua</div></div>
</div>
<div class="card" style="padding:0;margin-bottom:16px">
  <div class="vas-sec"><h3><i class="fas fa-recycle"></i> Cascos</h3></div>
  <div class="table-container"><table class="data-table vas-tb"><thead><tr><th>Casco</th><th style="text-align:right">Valor</th><th style="text-align:right">Vazios no depósito</th><th style="text-align:right">Na rua</th><th style="text-align:right" class="vas-hide">Cheios</th><th>Ações</th></tr></thead><tbody>
  ${types.map(t => `<tr><td><b>${esc(t.name)}</b></td><td style="text-align:right">${num(t.depositPrice) ? money(t.depositPrice) : '<span class="vas-mute">sem valor</span>'}</td><td style="text-align:right"><span class="vas-n ${num(t.emptyStock) < 0 ? 'bad' : ''}">${fq(num(t.emptyStock))}</span></td><td style="text-align:right"><span class="vas-n ${num(t.lentOut) > 0 ? 'bad' : ''}">${fq(num(t.lentOut))}</span></td><td style="text-align:right" class="vas-hide">${fq(fullOf(t.id))}</td>
    <td><div class="vas-acts"><button type="button" class="vas-btn" data-t="count" data-id="${esc(t.id)}" title="Acertar a contagem dos vazios"><i class="fas fa-clipboard-check"></i> Contagem</button><button type="button" class="vas-btn" data-t="edit" data-id="${esc(t.id)}"><i class="fas fa-pen"></i> Editar</button></div></td></tr>`).join('')}
  </tbody></table></div>
</div>
<div class="card" style="padding:0;margin-bottom:16px">
  <div class="vas-sec"><h3><i class="fas fa-users"></i> Quem está devendo casco</h3><span class="sp"></span>
    <div class="toolbar-search" style="min-width:200px;flex:0 1 260px"><input type="text" id="vasQ" placeholder="Buscar cliente..." value="${esc(filt.q)}"><i class="fas fa-search"></i></div>
    ${types.length > 1 ? `<select class="toolbar-select form-control" id="vasT" style="width:auto"><option value="">Todos os cascos</option>${types.map(t => `<option value="${esc(t.id)}" ${filt.t === t.id ? 'selected' : ''}>${esc(t.name)}</option>`).join('')}</select>` : ''}
  </div>
  ${list.length ? `<div class="table-container"><table class="data-table vas-tb"><thead><tr><th>Cliente</th><th>Devendo</th><th class="vas-hide">Desde</th><th>Ações</th></tr></thead><tbody>
  ${list.map(c => `<tr><td class="wrap"><b>${esc(custName(c))}</b>${custPhone(c) ? `<div class="vas-mute">${esc(custPhone(c))}</div>` : ''}</td><td class="wrap">${owes(c).map(x => `<div><span class="vas-n bad">${fq(x.qty)}</span> ${esc(typeName(x.typeId))}</div>`).join('')}</td><td class="vas-hide">${fmtD(lastLoan(c.id))}</td>
    <td><div class="vas-acts"><button type="button" class="vas-btn ok" data-c="ret" data-id="${esc(c.id)}"><i class="fas fa-rotate-left"></i> Devolveu</button>${waNum(custPhone(c)) ? `<button type="button" class="vas-btn wa" data-c="wa" data-id="${esc(c.id)}"><i class="fab fa-whatsapp"></i> Cobrar</button>` : ''}<a class="vas-btn" href="clientes.html?id=${encodeURIComponent(c.id)}&aba=cascos" title="Abrir a ficha"><i class="fas fa-user"></i></a></div></td></tr>`).join('')}
  </tbody></table></div>` : `<div class="vas-empty"><i class="fas fa-circle-check"></i>${owers.length ? 'Ninguém com essa busca.' : 'Nenhum cliente devendo casco.'}</div>`}
</div>
<div class="card" style="padding:0">
  <div class="vas-sec"><h3><i class="fas fa-clock-rotate-left"></i> Últimas movimentações</h3></div>
  ${moves.length ? `<div class="table-container"><table class="data-table vas-tb"><thead><tr><th>Quando</th><th>O que</th><th>Cliente / fornecedor</th><th>Casco</th><th style="text-align:right">Qtd</th><th style="text-align:right" class="vas-hide">Valor</th><th class="vas-hide">Por</th></tr></thead><tbody>
  ${moves.slice(0, 80).map(mv => `<tr class="${mv.reverted ? 'vas-mv-rev' : ''}"><td>${fmtDT(mv.createdAt)}</td><td>${moveTag(mv)}${mv.saleNumber ? ` <span class="vas-mute">#${esc(String(mv.saleNumber))}</span>` : ''}</td><td class="wrap">${esc(mv.customerName || mv.supplierName || '—')}${mv.notes ? `<div class="vas-mute">${esc(mv.notes)}</div>` : ''}</td><td>${esc(mv.bottleTypeName || typeName(mv.bottleTypeId))}</td><td style="text-align:right">${num(mv.qty) > 0 && mv.type === 'ajuste' ? '+' : ''}${fq(mv.type === 'ajuste' ? num(mv.qty) : Math.abs(num(mv.qty)))}</td><td style="text-align:right" class="vas-hide">${num(mv.amount) ? (num(mv.amount) < 0 ? '−' : '') + money(Math.abs(num(mv.amount))) : '—'}</td><td class="vas-hide">${esc(mv.userName || '')}</td></tr>`).join('')}
  </tbody></table></div>` : '<div class="vas-empty"><i class="fas fa-clock-rotate-left"></i>As trocas, empréstimos e devoluções aparecem aqui.</div>'}
</div>
<p class="vas-mute" style="margin-top:12px"><i class="fas fa-circle-info" style="margin-right:5px"></i>No PDV, ao vender um produto retornável, o caixa escolhe: <b>Troca</b> (trouxe o vazio), <b>Cobrar casco</b> (entra o valor na venda) ou <b>Emprestar</b> (o cliente fica devendo).</p>`;
            bindCommon();
            const qi = $('vasQ'); if (qi) qi.oninput = e => { filt.q = e.target.value; render(); const i = $('vasQ'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
            const ts2 = $('vasT'); if (ts2) ts2.onchange = e => { filt.t = e.target.value; render(); };
            root.querySelectorAll('[data-t]').forEach(b => b.onclick = () => { const t = typeOf(b.dataset.id); if (!t) return; if (b.dataset.t === 'count') countDialog(t, load); else typeDialog(t, () => load()); });
            root.querySelectorAll('[data-c]').forEach(b => b.onclick = () => { const c = customers.find(x => x.id === b.dataset.id); if (!c) return; if (b.dataset.c === 'wa') waCharge(c); else returnDialog({ customer: c, onDone: load }); });
        }
        function offBar() { return `<div class="vas-off"><i class="fas fa-circle-info" style="color:var(--accent)"></i><span><b>O controle de vasilhames está desligado.</b> A tela funciona, mas não aparece no menu.</span><button type="button" class="btn btn-primary btn-sm" id="vasTurnOn" style="margin-left:auto">Ligar e mostrar no menu</button></div>`; }
        function bindCommon() {
            root.querySelectorAll('[data-a]').forEach(b => b.onclick = () => ({ ret: () => returnDialog({ onDone: load }), sup: () => supplierDialog({ onDone: load }), loan: () => loanDialog({ onDone: load }), type: () => typeDialog(null, () => load()) })[b.dataset.a]());
            const on = $('vasTurnOn'); if (on) on.onclick = async () => {
                try { await db.collection('settings').doc('general').set({ bottlesEnabled: true, updatedAt: ts() }, { merge: true }); general.bottlesEnabled = true; try { localStorage.setItem('dp_bottles_on', '1'); } catch (e) { } document.querySelectorAll('.sidebar-menu a.menu-item[href="vasilhames.html"]').forEach(a => a.classList.remove('dp-off')); toast('success', 'Vasilhames ligado.'); render(); }
                catch (e) { toast('error', e.message); }
            };
        }
        root.innerHTML = '<div class="vas-empty"><i class="fas fa-spinner fa-spin"></i>Carregando vasilhames...</div>';
        const go = () => load().catch(e => { root.innerHTML = `<div class="card vas-empty">Não foi possível carregar: ${esc(e.message)}</div>`; });
        if (auth.currentUser) go(); else { let done = false; auth.onAuthStateChanged(u => { if (u && !done) { done = true; go(); } }); }
    }

    function boot() {
        try { setupPdv(); } catch (e) { console.warn('vasilhames pdv', e); }
        try { setupProducts(); } catch (e) { console.warn('vasilhames produtos', e); }
        try { setupClients(); } catch (e) { console.warn('vasilhames clientes', e); }
        try { setupSettings(); } catch (e) { console.warn('vasilhames configurações', e); }
        try { setupPage(); } catch (e) { console.warn('vasilhames tela', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
