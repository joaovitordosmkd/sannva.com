/* DistribuiPro 38.3 · Troca, devolução e vale-troca (crédito do cliente) — trocas-v1.js (igual em todas as versões)
   - "Troca / devolução" nos detalhes da venda (Pedidos) e no PDV: acha a venda pelo número do cupom ou pelo cliente
     (ou sem cupom, lendo o código da peça e usando o preço de hoje), escolhe as peças e as quantidades
     (nunca mais do que o vendido menos o que já voltou), o motivo e o destino do dinheiro:
       vale-troca (crédito na loja) · dinheiro (sai do caixa aberto) · abater no fiado / crediário.
     O estoque volta (StockService.entry ... 'return'), a comissão cai na proporção do que ficou e o cliente perde o
     valor no "total comprado". Na troca direta do PDV o vale já entra pagando a compra nova.
   - Forma de pagamento "Vale-troca" no PDV: lê o código (ou o código de barras do cupom) ou usa o crédito do cliente
     escolhido; não conta como dinheiro no caixa e o saldo que sobrar continua no vale.
   - Aparelho na troca (usados-v1.js): o valor vira crédito do cliente (sem vencimento). O seminovo vendido no PDV
     baixa sozinho na Compra de usados com o preço e o lucro.
   - Ficha do cliente: aba "Vales e créditos". Relatórios: "Trocas e devoluções" e "Vales em aberto".
   Coleções: store_credits { code:'VT-0001-XXXX', customerId, customerName, amount, balance, source:'return'|'device_purchase'|'manual',
             refId, refLabel, expiresAt (ms ou null), status:'open'|'used'|'cancelled', history:[{type, amount, saleId, saleNumber, balanceAfter, at, by}] }
             returns { number, saleId, saleNumber, customerId, customerName, items:[{productId, name, qty, unitPrice, total, restock}],
             total, reason, mode:'credito'|'dinheiro'|'abater_fiado', creditId, creditCode, ... }
   Venda: items[i].returnedQty, returnedTotal, returnCount. Cliente: storeCreditBalance (saldo dos vales em aberto).
   Configurações › Vendas (formas-pagamento-v1.js): valeTrocaAtivo e valeDias (validade, padrão 90). */
(function () {
    'use strict';
    if (window.DPTrocas || typeof db === 'undefined') return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const r3 = n => Math.round((Number(n) || 0) * 1000) / 1000;
    const num = v => { if (typeof v === 'number') return isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/[R$\s]/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return isFinite(n) ? n : 0; };
    const qtxt = n => (Number(n) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const pad = (n, l) => String(Number(n) || 0).padStart(l || 4, '0');
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const TS = () => FV().serverTimestamp();
    const INC = n => FV().increment(n);
    const toDate = v => { if (v === null || v === undefined || v === '') return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const ms = v => { const d = toDate(v); return d ? d.getTime() : 0; };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } }; // currentUser é "let" do app.js
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const meName = () => { try { return me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador'; } catch (e) { return 'Operador'; } };
    const isBoss = () => ['admin', 'manager'].includes(me().role);
    const canCash = () => isBoss() || !!(me().permissions && me().permissions.cancelSales);
    const saleNo = s => '#V-' + pad(s && s.saleNumber);
    const retNo = n => '#D-' + pad(n);
    const isOS = s => s && (s.source === 'service_order' || s.type === 'service_order');
    const SDOC = () => (db.__isLocalDemo ? 'demo_general' : 'general');
    const COL = 'store_credits', RCOL = 'returns';
    const SRC = { return: 'Devolução', device_purchase: 'Aparelho na troca', manual: 'Crédito lançado' };
    const REASONS = [['troca', 'Troca (tamanho, cor ou modelo)'], ['defeito', 'Defeito'], ['desistencia', 'Desistência / arrependimento'], ['presente', 'Presente'], ['outro', 'Outro motivo']];
    const MODES = { credito: 'Vale-troca', dinheiro: 'Dinheiro de volta', abater_fiado: 'Abatido no fiado' };
    const PAYN = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado', multi: 'Dividido', vale: 'Vale-troca' };
    const payName = m => PAYN[m] || (window.DPPayMethods && DPPayMethods.label && DPPayMethods.label(m)) || m || '—';
    const docs = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

    /* ============================ visual ============================ */
    function css() {
        if ($('dptCss')) return;
        const st = document.createElement('style'); st.id = 'dptCss';
        st.textContent = `.dpt-ov .modal{max-width:760px;width:96%}.dpt-ov .modal-body{max-height:72vh;overflow:auto}
.dpt-ov h3 i,.dpt-ov h3 svg{color:var(--accent);margin-right:8px}
.dpt-p{font-size:13px;color:var(--text-secondary);margin:0 0 10px;line-height:1.5}.dpt-small{font-size:12px;color:var(--text-muted)}
.dpt-row{display:flex;gap:8px;align-items:center}.dpt-row .btn{white-space:nowrap}
.dpt-in{width:100%;padding:9px 12px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:10px;color:var(--text-primary);font-family:inherit;font-size:14px}
.dpt-in:focus{outline:none;border-color:var(--accent)}
.dpt-list{border:1px solid var(--border-color);border-radius:12px;overflow:hidden;margin-top:10px}
.dpt-li{display:flex;align-items:center;gap:10px;padding:10px 12px;border-top:1px solid var(--border-color);cursor:pointer;background:var(--bg-card)}
.dpt-li:first-child{border-top:0}.dpt-li:hover{background:var(--bg-secondary)}.dpt-li .t{flex:1;min-width:0}
.dpt-li .t b{display:block;font-size:13px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.dpt-li small{font-size:11.5px;color:var(--text-muted)}
.dpt-li .v{font-size:14px;font-weight:800;color:var(--text-heading);white-space:nowrap}
.dpt-tag{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;border-radius:999px;padding:2px 8px;background:rgba(245,158,11,.14);color:#b45309;margin-left:6px;vertical-align:middle}
.dpt-tag.ok{background:rgba(16,185,129,.14);color:#047857}.dpt-tag.bad{background:rgba(239,68,68,.12);color:#b91c1c}.dpt-tag.mute{background:var(--bg-secondary);color:var(--text-muted)}
.dpt-alt{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:14px;padding-top:12px;border-top:1px dashed var(--border-color)}
.dpt-head{display:flex;justify-content:space-between;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:12px;background:var(--bg-secondary);margin-bottom:10px}
.dpt-head b{display:block;font-size:14px;color:var(--text-heading)}.dpt-head small{font-size:12px;color:var(--text-muted)}.dpt-head .v{font-size:16px;font-weight:800;white-space:nowrap}
.dpt-tb{width:100%;border-collapse:collapse;font-size:13px}.dpt-tb th{font-size:10px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:6px;border-bottom:1px solid var(--border-color)}
.dpt-tb td{padding:7px 6px;border-bottom:1px solid var(--border-color);vertical-align:middle}.dpt-tb .r{text-align:right}.dpt-tb .c{text-align:center}.dpt-tb tr.off td{opacity:.5}
.dpt-qty{display:inline-flex;align-items:center;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;background:var(--bg-input)}
.dpt-qty button{width:30px;height:32px;border:0;background:var(--bg-secondary);color:var(--text-primary);cursor:pointer;display:flex;align-items:center;justify-content:center}
.dpt-qty button:disabled{opacity:.4;cursor:not-allowed}.dpt-qty input{width:54px;height:32px;border:0;text-align:center;background:transparent;color:var(--text-primary);font:inherit;font-weight:700}
.dpt-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:12px}.dpt-g2 label,.dpt-lbl{font-size:12px;font-weight:600;color:var(--text-secondary);display:block}
.dpt-g2 .dpt-in,.dpt-lbl .dpt-in{margin-top:4px;font-size:13px}
.dpt-chk{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--text-secondary);margin-top:10px;cursor:pointer}.dpt-chk input{width:16px;height:16px;accent-color:var(--accent)}
.dpt-sum{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;background:var(--bg-secondary);margin-top:12px;font-size:13px;color:var(--text-secondary)}
.dpt-sum b{font-size:21px;color:var(--success,#10b981)}
.dpt-warn{padding:9px 12px;border-radius:10px;font-size:12.5px;margin-top:8px;background:rgba(245,158,11,.12);color:var(--text-secondary);border:1px solid rgba(245,158,11,.35);line-height:1.45}
.dpt-warn.red{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35)}.dpt-warn.ok{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.35)}
.dpt-modes{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px;margin-top:6px}
.dpt-mode{border:1.5px solid var(--border-color);border-radius:12px;padding:12px;cursor:pointer;background:var(--bg-card);text-align:left;font:inherit;color:var(--text-primary)}
.dpt-mode.on{border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.1))}.dpt-mode:disabled{opacity:.5;cursor:not-allowed}
.dpt-mode .h{display:flex;align-items:center;gap:8px;font-weight:700;font-size:14px}.dpt-mode .h i,.dpt-mode .h svg{color:var(--accent)}
.dpt-mode p{margin:6px 0 0;font-size:12px;color:var(--text-muted);line-height:1.45}
.dpt-cust{position:relative;margin-top:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-surface,var(--bg-secondary))}
.dpt-dd{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;z-index:40;max-height:220px;overflow:auto;box-shadow:var(--shadow-lg)}
.dpt-dd div{padding:8px 12px;cursor:pointer;font-size:13px;border-bottom:1px solid var(--border-color)}.dpt-dd div:hover{background:var(--bg-secondary)}
.dpt-ok{text-align:center;padding:8px 6px}.dpt-ok .big{width:58px;height:58px;border-radius:50%;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;background:rgba(16,185,129,.12);color:#10b981;font-size:26px}
.dpt-ok h4{font-size:17px;color:var(--text-heading);margin:0 0 6px}.dpt-ok p{font-size:13px;color:var(--text-secondary);margin:3px 0}
.dpt-code{font-family:ui-monospace,Menlo,Consolas,monospace;font-weight:800;letter-spacing:.5px}
.dpt-chip{display:flex;align-items:center;gap:8px;margin-top:6px;padding:6px 8px 6px 10px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.35);color:#047857;font-size:12px;font-weight:700}
.dpt-chip i,.dpt-chip svg{flex-shrink:0}.dpt-chip span{flex:1;min-width:0}
.dpt-chip button{border:0;background:#10b981;color:#fff;border-radius:8px;padding:4px 10px;font:inherit;font-size:11.5px;font-weight:700;cursor:pointer}
.dpt-hbtn{flex:0 0 auto;flex-shrink:0;margin-left:8px;height:36px;border:1px solid var(--accent,#6366f1);background:rgba(99,102,241,.1);color:var(--accent,#6366f1);border-radius:10px;padding:0 12px;font-weight:700;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit}
.dpt-hbtn:hover{background:var(--accent,#6366f1);color:#fff}
@media (max-width:1500px){.dpt-hbtn{padding:0 10px}.dpt-hbtn span{display:none}}
.pay-method.dpt-on{background:rgba(16,185,129,.12)!important;border-color:#10b981!important;color:#047857!important}
.cs-row.dpt-vrow span:last-child{color:#047857;font-weight:700}.cs-row.dpt-prow{font-weight:800;color:var(--text-heading)}
.pdx-foot .cart-summary .cs-row.dpt-vrow,.pdx-foot .cart-summary .cs-row.dpt-prow{display:flex!important;font-size:13px}.pdx-foot .cart-summary .cs-row.dpt-prow span:last-child{font-size:18px;color:var(--accent)}
.dpt-ov .dpt-qty input{width:56px!important;min-width:0!important;height:32px!important;border:0!important;box-shadow:none!important;padding:0!important;border-radius:0!important;background:transparent!important}
.dpt-vcard{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;margin-top:8px;background:var(--bg-card)}
.dpt-vcard .t{flex:1;min-width:0}.dpt-vcard .t b{display:block;font-size:13px}.dpt-vcard .t small{font-size:11.5px;color:var(--text-muted)}
.dpt-vcard input{width:110px;padding:7px 9px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);font:inherit;text-align:right}
.dpt-kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:14px}
.dpt-kpi{padding:12px 14px;border-radius:12px;background:var(--bg-secondary)}.dpt-kpi span{display:block;font-size:11.5px;color:var(--text-muted)}.dpt-kpi b{display:block;font-size:19px;color:var(--text-heading);margin-top:2px}
.dpt-mob{display:none}.dpt-row .dpt-in{flex:1;min-width:0}
@media (max-width:640px){.dpt-g2{grid-template-columns:1fr}.dpt-tb-sale th:nth-child(2),.dpt-tb-sale td:nth-child(2),.dpt-tb-sale th:nth-child(3),.dpt-tb-sale td:nth-child(3){display:none}.dpt-mob{display:inline}.dpt-row .btn{padding-left:10px;padding-right:10px}.dpt-sum{flex-wrap:wrap}.dpt-ov .dpt-qty input{width:40px!important}.dpt-qty button{width:28px}}`;
        document.head.appendChild(st);
    }
    function overlay(id, title, icon, maxW) {
        css();
        $(id)?.remove();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpt-ov'; ov.id = id;
        ov.innerHTML = `<div class="modal"${maxW ? ` style="max-width:${maxW}px"` : ''}><div class="modal-header"><h3><i class="fas ${icon}"></i><span data-t>${esc(title)}</span></h3><button class="modal-close" type="button" data-x aria-label="Fechar"><i class="fas fa-xmark"></i></button></div><div class="modal-body" data-b></div><div class="modal-footer" data-f></div></div>`;
        document.body.appendChild(ov);
        ov.querySelector('[data-x]').addEventListener('click', () => ov.remove());
        return { ov, B: ov.querySelector('[data-b]'), F: ov.querySelector('[data-f]'), T: ov.querySelector('[data-t]'), close: () => ov.remove() };
    }

    /* ============================ configurações ============================ */
    let CFG = null;
    async function cfg(force) {
        if (CFG && !force) return CFG;
        let g = {};
        try { const s = await db.collection('settings').doc('general').get(); if (s.exists) g = s.data() || {}; } catch (e) { }
        if (db.__isLocalDemo) {
            try { const s = await db.collection('settings').doc('demo_general').get(); if (s.exists) g = { ...g, ...(s.data() || {}) }; } catch (e) { }
            try { Object.assign(g, JSON.parse(sessionStorage.getItem('erp_demo_settings_v139') || '{}') || {}); } catch (e) { }
        }
        CFG = { dias: Math.max(1, Math.min(3650, Math.round(Number(g.valeDias) || 90))), ativo: g.valeTrocaAtivo !== false, g };
        return CFG;
    }
    async function nextSeq(field) {
        const ref = db.collection('settings').doc(SDOC());
        const s = await ref.get(); const n = (s.exists ? Number((s.data() || {})[field] || 0) : 0) + 1;
        await ref.set({ [field]: n }, { merge: true });
        return n;
    }
    async function company() {
        let g = {}, b = {};
        try { const s = await db.collection('settings').doc('general').get(); if (s.exists) g = s.data() || {}; } catch (e) { }
        try { b = (window.BrandingManager && typeof BrandingManager.getBrand === 'function' && BrandingManager.getBrand()) || {}; } catch (e) { }
        const rua = [g.logradouro, g.numero].filter(Boolean).join(', '), cid = [g.cidade, g.uf].filter(Boolean).join(' - ');
        return { name: (db.__isLocalDemo ? b.companyName : '') || g.nomeFantasia || b.companyName || g.razaoSocial || 'Nossa loja', cnpj: g.cnpj || '', phone: g.telefone || g.whatsapp || '', address: [rua, g.bairro, cid].filter(Boolean).join(' · ') };
    }

    /* ============================ vales (store_credits) ============================ */
    const ALPH = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const rand4 = () => Array.from({ length: 4 }, () => ALPH[Math.floor(Math.random() * ALPH.length)]).join('');
    const CODE_RE = /^VT-?(\d{1,7})-?([A-Z0-9]{4})$/;
    function normCode(s) { const t = String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[‐-―−]/g, '-'); const m = t.match(CODE_RE); return m ? `VT-${pad(m[1])}-${m[2]}` : t; }
    const looksCode = s => CODE_RE.test(String(s || '').toUpperCase().replace(/\s+/g, '').replace(/[‐-―−]/g, '-'));
    const expired = c => !!(c && c.expiresAt && Number(c.expiresAt) < Date.now());
    function state(c) {
        if (!c || c.deleted) return 'deleted';
        if (c.status === 'cancelled') return 'cancelled';
        if (c.status === 'used' || !(r2(c.balance) > 0)) return 'used';
        return expired(c) ? 'expired' : 'open';
    }
    const STATE = { open: ['Em aberto', 'ok'], used: ['Usado', 'mute'], expired: ['Vencido', 'bad'], cancelled: ['Cancelado', 'mute'], deleted: ['Excluído', 'mute'] };
    const stateTag = c => { const s = STATE[state(c)] || STATE.open; return `<span class="dpt-tag ${s[1]}">${s[0]}</span>`; };
    async function getCredit(id) { const d = await db.collection(COL).doc(id).get(); return d.exists ? { id: d.id, ...d.data() } : null; }
    async function allCredits() { try { return docs(await db.collection(COL).get()).filter(c => !c.deleted); } catch (e) { return []; } }
    async function creditsOf(customerId) {
        if (!customerId) return [];
        try { return docs(await db.collection(COL).where('customerId', '==', String(customerId)).get()).filter(c => !c.deleted); }
        catch (e) { return (await allCredits()).filter(c => String(c.customerId) === String(customerId)); }
    }
    async function byCode(code) {
        const k = normCode(code); if (!k) return null;
        try { const s = await db.collection(COL).where('code', '==', k).get(); const l = docs(s).filter(c => !c.deleted); if (l.length) return l[0]; } catch (e) { }
        return (await allCredits()).find(c => c.code === k) || null;
    }
    // Saldo dos vales em aberto gravado no cliente (lista, ficha e PDV)
    async function syncBalance(customerId) {
        if (!customerId) return 0;
        const bal = r2((await creditsOf(customerId)).filter(c => state(c) === 'open').reduce((a, c) => a + Number(c.balance || 0), 0));
        try { await db.collection('customers').doc(String(customerId)).update({ storeCreditBalance: bal }); } catch (e) { }
        return bal;
    }
    async function createCredit(o) {
        const c0 = await cfg();
        const amount = r2(o.amount); if (!(amount > 0)) throw new Error('O valor do vale precisa ser maior que zero.');
        const n = await nextSeq('storeCreditSequence');
        const data = {
            code: `VT-${pad(n)}-${rand4()}`, number: n, customerId: o.customerId ? String(o.customerId) : '', customerName: o.customerName || '',
            amount, balance: amount, source: o.source || 'manual', refId: o.refId || '', refLabel: o.refLabel || '', note: o.note || '',
            expiresAt: o.expires === false ? null : Date.now() + Math.max(1, Number(o.days) || c0.dias) * 864e5, status: 'open',
            history: [{ type: 'create', amount, balanceAfter: amount, at: Date.now(), by: meName(), label: o.refLabel || SRC[o.source] || '' }],
            createdBy: uid(), createdByName: meName(), deleted: false, createdAt: TS(), updatedAt: TS()
        };
        const ref = await db.collection(COL).add(data);
        try { localStorage.setItem('dp_vales_on', '1'); } catch (e) { }
        if (data.customerId) await syncBalance(data.customerId);
        try { AuditService.log('create', 'store_credits', ref.id, { code: data.code, amount, source: data.source }); } catch (e) { }
        return { id: ref.id, ...data, createdAt: new Date() };
    }
    function useError(c, amount) {
        if (!c) return 'Vale não encontrado.';
        const st = state(c);
        if (st === 'used') return `O vale ${c.code} já foi usado.`;
        if (st === 'expired') return `O vale ${c.code} venceu em ${fmtD(c.expiresAt)}.`;
        if (st !== 'open') return `O vale ${c.code} não pode ser usado (${(STATE[st] || ['cancelado'])[0].toLowerCase()}).`;
        if (amount !== undefined && r2(amount) > r2(c.balance) + 0.004) return `O vale ${c.code} tem só ${money(c.balance)} de saldo.`;
        return '';
    }
    async function useCredit(id, amount, ref) {
        const c = await getCredit(id); const err = useError(c, amount); if (err) throw new Error(err);
        const amt = r2(amount), bal = r2(Number(c.balance) - amt);
        const hist = (Array.isArray(c.history) ? c.history.slice(-59) : []).concat([{ type: 'use', amount: amt, balanceAfter: bal, saleId: (ref && ref.saleId) || '', saleNumber: (ref && ref.saleNumber) || 0, at: Date.now(), by: meName() }]);
        await db.collection(COL).doc(id).update({ balance: bal, status: bal <= 0.004 ? 'used' : 'open', history: hist, lastUsedAt: Date.now(), updatedAt: TS() });
        if (c.customerId) await syncBalance(c.customerId);
        return { ...c, balance: bal, status: bal <= 0.004 ? 'used' : 'open' };
    }
    // Venda paga com vale foi cancelada: o valor volta para o vale (e o seminovo volta a "Comprado")
    async function onSaleCancelled(s) {
        if (!s || !s.id) return;
        const c0 = await cfg();
        for (const p of (Array.isArray(s.payments) ? s.payments : [])) {
            if (p.method !== 'vale' || !p.creditId) continue;
            try {
                const c = await getCredit(p.creditId); if (!c) continue;
                const back = r2(p.amount), bal = r2(Number(c.balance || 0) + back);
                const hist = (Array.isArray(c.history) ? c.history.slice(-59) : []).concat([{ type: 'refund', amount: back, balanceAfter: bal, saleId: s.id, saleNumber: s.saleNumber || 0, at: Date.now(), by: meName(), label: 'Venda cancelada' }]);
                const upd = { balance: bal, status: 'open', history: hist, updatedAt: TS() };
                if (expired(c)) upd.expiresAt = Date.now() + c0.dias * 864e5;
                await db.collection(COL).doc(c.id).update(upd);
                if (c.customerId) await syncBalance(c.customerId);
            } catch (e) { console.warn('vale não estornado', e); }
        }
        try {
            const l = docs(await db.collection('device_purchases').where('saleId', '==', s.id).get());
            for (const d of l) if (d.status === 'sold') await db.collection('device_purchases').doc(d.id).set({ status: 'purchased', saleId: '', saleNumber: 0, soldAt: null, soldPrice: null, profit: null, soldTo: '', updatedAt: TS() }, { merge: true });
        } catch (e) { }
    }

    /* ============================ clientes ============================ */
    let custCache = null;
    async function customers() {
        try { if (Array.isArray(allPdvCustomers) && allPdvCustomers.length) return allPdvCustomers; } catch (e) { }
        if (custCache) return custCache;
        try { custCache = docs(await db.collection('customers').get()).filter(c => !c.deleted); } catch (e) { custCache = []; }
        return custCache;
    }
    const cName = c => (c && (c.name || c.nome || c.razaoSocial)) || 'Cliente';
    const digits = s => String(s || '').replace(/\D/g, '');
    async function findOrCreateCustomer(p) {
        const dg = digits(p.doc), ph = digits(p.phone).slice(-8);
        let list = []; try { list = docs(await db.collection('customers').get()).filter(c => !c.deleted); } catch (e) { }
        const c = (dg.length >= 11 && list.find(x => [x.document, x.cpf, x.cnpj, x.doc, x.cpfCnpj].some(v => digits(v) === dg)))
            || (ph.length === 8 && list.find(x => [x.phone, x.whatsapp, x.telefone, x.celular].some(v => digits(v).slice(-8) === ph))) || null;
        if (c) return { id: c.id, name: cName(c), created: false };
        const [city, uf] = String(p.city || '').split('/').map(x => x.trim());
        const data = { name: String(p.name || 'Cliente').trim(), document: p.doc || '', phone: p.phone || '', whatsapp: p.phone || '', address: p.address || '', city: city || '', state: (uf || '').slice(0, 2).toUpperCase(), type: dg.length === 14 ? 'pj' : 'pf', status: 'active', source: 'usados', totalPurchases: 0, purchaseCount: 0, deleted: false, createdAt: TS(), updatedAt: TS() };
        const ref = await db.collection('customers').add(data);
        custCache = null;
        return { id: ref.id, name: data.name, created: true };
    }
    async function bumpCustomer(cid, delta) {
        if (!cid || !delta) return;
        try {
            const d = await db.collection('customers').doc(String(cid)).get(); if (!d.exists) return; const c = d.data() || {};
            const total = Math.max(0, r2(Number(c.totalPurchases || 0) + delta)), count = Number(c.purchaseCount || 0);
            await db.collection('customers').doc(String(cid)).update({ totalPurchases: total, averageTicket: count ? r2(total / count) : 0 });
        } catch (e) { }
    }
    // Campo de busca de cliente (nome ou telefone) com lista suspensa
    function custPicker(host, onPick) {
        host.innerHTML = `<input class="dpt-in" placeholder="Buscar cliente por nome ou telefone" autocomplete="off"><div class="dpt-dd" style="display:none"></div>`;
        const inp = host.querySelector('input'), dd = host.querySelector('.dpt-dd');
        inp.addEventListener('input', async () => {
            const q = norm(inp.value.trim()); if (q.length < 2) { dd.style.display = 'none'; return; }
            const dq = q.replace(/\D/g, ''), list = await customers();
            const hits = list.filter(c => norm(cName(c)).includes(q) || (dq.length >= 4 && digits((c.phone || '') + ' ' + (c.whatsapp || '') + ' ' + (c.telefone || '')).includes(dq))).slice(0, 8);
            dd.innerHTML = hits.length ? hits.map(c => `<div data-id="${esc(c.id)}"><b>${esc(cName(c))}</b>${c.phone || c.telefone ? ` <span class="dpt-small">· ${esc(c.phone || c.telefone)}</span>` : ''}</div>`).join('') : '<div class="dpt-small">Nenhum cliente encontrado</div>';
            dd.style.display = 'block';
            dd.querySelectorAll('[data-id]').forEach(d => d.addEventListener('click', () => { const c = list.find(x => String(x.id) === d.dataset.id); dd.style.display = 'none'; inp.value = ''; if (c) onPick({ id: c.id, name: cName(c) }); }));
        });
        inp.addEventListener('blur', () => setTimeout(() => { dd.style.display = 'none'; }, 200));
        return inp;
    }

    /* ============================ vendas ============================ */
    async function getSale(id) { const d = await db.collection('sales').doc(String(id)).get(); return d.exists ? { id: d.id, ...d.data() } : null; }
    async function recentSales(n) {
        try { if (typeof simpleList === 'function') return await simpleList('sales', 'createdAt', 'desc', n || 1500); } catch (e) { }
        try { return docs(await db.collection('sales').get()).filter(s => !s.deleted).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)); } catch (e) { return []; }
    }
    const returnable = s => s && !s.deleted && ['completed', 'delivered'].includes(s.status || 'completed') && !isOS(s);
    async function findSales(q) {
        q = String(q || '').trim();
        const dg = q.replace(/\D/g, '');
        let out = [];
        if (dg && /^#?\s*(v\s*-?\s*)?\d+$/i.test(q)) { try { out = docs(await db.collection('sales').where('saleNumber', '==', Number(dg)).get()); } catch (e) { } }
        if (!out.length) {
            const all = await recentSales(2000), nq = norm(q);
            if (!q) out = all.slice(0, 40);
            else {
                let ids = [];
                if (dg.length >= 8) ids = (await customers()).filter(c => digits((c.phone || '') + ' ' + (c.whatsapp || '') + ' ' + (c.telefone || '')).includes(dg)).map(c => String(c.id));
                out = all.filter(s => (dg && /^#?\s*(v\s*-?\s*)?\d+$/i.test(q) && Number(s.saleNumber) === Number(dg)) || (nq.length >= 2 && norm(s.customerName).includes(nq)) || (ids.length && ids.includes(String(s.customerId))));
            }
        }
        return out.filter(returnable).sort((a, b) => ms(b.createdAt) - ms(a.createdAt)).slice(0, 25);
    }
    // Valor que o cliente pagou por unidade (com o desconto geral da venda rateado; entrega e taxa de cartão não voltam)
    function linesOf(s) {
        const items = Array.isArray(s.items) ? s.items : [];
        const sub = Number(s.subtotal) || items.reduce((a, i) => a + Number(i.total || 0), 0);
        const f = sub > 0 ? Math.max(0, Math.min(1, (sub - Number(s.discount || 0)) / sub)) : 1;
        return items.map((it, idx) => {
            const q = Number(it.quantity) || 0, back = Number(it.returnedQty) || 0, tot = Number(it.total ?? (q * Number(it.unitPrice || 0))) || 0;
            const service = it.isService === true || it.productType === 'service';
            return { idx, productId: it.productId || '', name: it.productName || 'Item', code: it.productCode || '', barcode: it.barcode || '', sold: q, returned: back, max: service ? 0 : Math.max(0, r3(q - back)), unit: q > 0 ? r2(tot / q * f) : 0, factor: Number(it._factor) || 1, service, qty: 0 };
        });
    }
    async function productByCode(code) {
        const k = String(code || '').trim(); if (!k) return null;
        const low = k.toLowerCase();
        let list = []; try { if (Array.isArray(products) && products.length) list = products; } catch (e) { }
        let p = list.find(x => [x.code, x.barcode, x.sku, x.ean, x.gtin].some(v => v && String(v).toLowerCase() === low));
        if (p) return p;
        for (const f of ['code', 'barcode', 'sku']) { try { const l = docs(await db.collection('products').where(f, '==', k).get()).filter(x => !x.deleted); if (l.length) return l[0]; } catch (e) { } }
        return null;
    }
    const priceNow = p => { const promo = Number(p.promoPrice || 0); const until = p.promoUntil ? ms(p.promoUntil) : 0; return promo > 0 && (!until || until >= Date.now() - 864e5) ? promo : Number(p.salePrice || p.price || 0); };
    async function openDebts(customerId) {
        if (!customerId) return [];
        try { return docs(await db.collection('financial_entries').where('customerId', '==', String(customerId)).get()).filter(e => e.type === 'income' && e.status === 'pending' && !e.deleted && Number(e.amount) > 0); } catch (e) { return []; }
    }
    async function openRegister() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { }
        return null;
    }
    // Comissão: regra gravada na venda, sobre o que ficou (vendas-editar-v1.js expõe o recálculo; aqui fica a reserva)
    async function recalcCommission(s, items, finalTotal) {
        if (window.DPSaleEdit && typeof DPSaleEdit.recalcCommission === 'function') return DPSaleEdit.recalcCommission(s, items, finalTotal);
        const b0 = Math.max(0, Number(s.total || 0) - Number(s.deliveryFee || 0)), k = b0 > 0 ? Math.max(0, Math.min(1, (finalTotal - Number(s.deliveryFee || 0)) / b0)) : 0;
        const out = { commissionAmount: r2(Number(s.commissionAmount || 0) * k), commissionBase: r2(Number(s.commissionBase || b0) * k), commissionProductAmount: r2(Number(s.commissionProductAmount || 0) * k), commissionServiceAmount: r2(Number(s.commissionServiceAmount || 0) * k) };
        out.commissionStatus = out.commissionAmount > 0 ? (s.commissionStatus === 'paid' ? 'paid' : 'pending') : 'none';
        return out;
    }
    // Baixa contas em aberto do cliente (primeiro as da própria venda, depois as mais antigas); parcial vira "(saldo)"
    async function abate(customerId, saleId, value, label) {
        const list = (await openDebts(customerId)).sort((a, b) => ((b.referenceId === saleId) - (a.referenceId === saleId)) || (ms(a.dueDate) - ms(b.dueDate)));
        let pool = r2(value); const ids = [];
        for (const e of list) {
            if (pool <= 0.004) break;
            const due = r2(e.amount);
            const base = { status: 'received', paidAt: TS(), receivedMethod: 'devolucao', receivedBy: uid(), receivedByName: meName(), originalAmount: e.originalAmount != null ? e.originalAmount : due, returnLabel: label, updatedAt: TS() };
            if (pool + 0.004 >= due) { await db.collection('financial_entries').doc(e.id).update({ ...base, amount: due }); pool = r2(pool - due); ids.push(e.id); continue; }
            const paid = pool, rest = r2(due - paid); pool = 0;
            await db.collection('financial_entries').doc(e.id).update({ ...base, amount: paid, partial: true });
            const copy = { type: 'income', category: e.category || '', customerId: e.customerId || '', customerName: e.customerName || '', debtorName: e.debtorName || '', debtorPhone: e.debtorPhone || '', debtorDoc: e.debtorDoc || '', debtorAddress: e.debtorAddress || '', referenceType: e.referenceType || '', referenceId: e.referenceId || '', notes: e.notes || '' };
            if (e.installment) copy.installment = e.installment; if (e.crediario) copy.crediario = e.crediario; if (e.dueDate) copy.dueDate = e.dueDate;
            await db.collection('financial_entries').add({ ...copy, amount: rest, status: 'pending', description: String(e.description || 'Conta').replace(/\s*\(saldo\)$/, '') + ' (saldo)', parentId: e.id, deleted: false, createdAt: TS(), updatedAt: TS() });
            ids.push(e.id);
        }
        return { used: r2(value - pool), left: r2(pool), ids };
    }

    /* ============================ devolução (o motor) ============================ */
    // payload: { saleId?, lines:[{idx?, productId, name, code, qty, unit, factor}], customerId, customerName, reason, note, restock, mode }
    async function doReturn(P) {
        const lines = (P.lines || []).map(l => ({ ...l, qty: r3(l.qty) })).filter(l => l.qty > 0);
        if (!lines.length) throw new Error('Escolha pelo menos uma peça para devolver.');
        const mode = MODES[P.mode] ? P.mode : 'credito';
        let s = null;
        if (P.saleId) {
            s = await getSale(P.saleId);
            if (!s) throw new Error('Venda não encontrada.');
            if (s.status === 'cancelled' || s.deleted) throw new Error('Esta venda está cancelada.');
            if (!returnable(s)) throw new Error('Esta venda ainda não foi concluída ou veio de uma OS: não dá para devolver por aqui.');
            const cur = linesOf(s);
            for (const l of lines) {
                const c = cur[l.idx];
                if (!c || (l.productId && c.productId && c.productId !== l.productId)) throw new Error('A venda mudou enquanto a devolução era feita. Abra de novo.');
                if (c.service) throw new Error(`"${c.name}" é serviço: não tem devolução.`);
                if (l.qty > c.max + 0.0001) throw new Error(`Não dá para devolver ${qtxt(l.qty)} de "${c.name}": foram vendidas ${qtxt(c.sold)}${c.returned ? ' e ' + qtxt(c.returned) + ' já voltaram' : ''}.`);
                l.unit = c.unit; l.name = c.name; l.productId = c.productId; l.factor = c.factor; l.code = c.code;
            }
        }
        const total = r2(lines.reduce((a, l) => a + l.qty * Number(l.unit || 0), 0));
        if (!(total > 0)) throw new Error('O valor da devolução precisa ser maior que zero.');
        const customerId = String((s && s.customerId) || P.customerId || ''), customerName = (s && s.customerId ? s.customerName : '') || P.customerName || '';
        let reg = null;
        if (mode === 'dinheiro') {
            if (!canCash()) throw new Error('Seu perfil não pode devolver dinheiro do caixa. Peça para um gerente ou use o vale-troca.');
            reg = await openRegister(); if (!reg) throw new Error('Abra o caixa para devolver em dinheiro (ou use o vale-troca).');
        }
        if (mode === 'abater_fiado' && !customerId) throw new Error('Para abater no fiado, escolha o cliente.');
        const number = await nextSeq('returnSequence');
        const label = `Devolução ${retNo(number)}${s ? ' · Venda ' + saleNo(s) : ''}`;
        const result = { number, total, mode, saleId: s ? s.id : '', saleNumber: s ? s.saleNumber || 0 : 0, customerId, customerName, credit: null, notes: [] };

        // 1. venda: quantidades devolvidas e comissão
        if (s) {
            const items = (s.items || []).map(i => ({ ...i }));
            lines.forEach(l => { const it = items[l.idx]; it.returnedQty = r3(Number(it.returnedQty || 0) + l.qty); });
            const returnedTotal = r2(Number(s.returnedTotal || 0) + total);
            const upd = { items, returnedTotal, returnCount: Number(s.returnCount || 0) + 1, lastReturnAt: TS(), updatedAt: TS() };
            const before = r2(s.commissionAmount);
            if (s.commissionStatus === 'paid') result.notes.push('A comissão desta venda já foi paga: não mudou.');
            else if (before > 0 || Array.isArray(s.commissionSplits)) {
                const rest = items.map(i => { const q = Number(i.quantity) || 0, k = q > 0 ? Math.max(0, (q - Number(i.returnedQty || 0)) / q) : 0; return { ...i, quantity: r3(q * k), total: r2(Number(i.total || 0) * k) }; }).filter(i => i.quantity > 0);
                try { Object.assign(upd, await recalcCommission(s, rest, r2(Number(s.total || 0) - returnedTotal))); } catch (e) { console.warn('comissão', e); }
                if (upd.commissionAmount !== undefined && Math.abs(r2(upd.commissionAmount) - before) > 0.004) result.notes.push(`Comissão de ${s.sellerName || 'quem vendeu'}: ${money(before)} → ${money(upd.commissionAmount)}.`);
                result.commissionBefore = before; result.commissionAfter = r2(upd.commissionAmount ?? before);
            }
            await db.collection('sales').doc(s.id).update(upd);
        }
        // 2. estoque
        const restock = P.restock !== false;
        if (restock && typeof StockService !== 'undefined') {
            for (const l of lines) {
                if (!l.productId) continue;
                try { await StockService.entry(l.productId, r3(l.qty * (Number(l.factor) || 1)), label, 'return', s ? s.id : ''); }
                catch (e) { result.notes.push(`"${l.name}" não voltou para o estoque (${e.message}).`); }
            }
        }
        // 38.5 · Aparelho com IMEI/série (seriais-v1.js): a unidade volta ao estoque ou fica como devolvida com defeito
        if (s && window.DPSerial && DPSerial.onReturn) { try { await DPSerial.onReturn(s, lines, restock, label); } catch (e) { result.notes.push(`O número do aparelho não foi atualizado (${e.message}).`); } }
        // 3. destino do valor
        let creditValue = 0, cashRegisterId = '', receivableIds = [], abatido = 0;
        if (mode === 'credito') creditValue = total;
        if (mode === 'dinheiro') {
            await db.collection('cash_registers').doc(reg.id).update({ totalWithdraw: INC(total) });
            await db.collection('cash_movements').add({ cashRegisterId: reg.id, type: 'withdraw', amount: -total, paymentMethod: 'dinheiro', description: `${label}${customerName ? ' · ' + customerName : ''}`, referenceId: s ? s.id : '', referenceType: 'return', returnNumber: number, refund: true, reversed: false, createdBy: uid(), createdAt: TS(), updatedAt: TS() });
            cashRegisterId = reg.id;
        }
        if (mode === 'abater_fiado') {
            const a = await abate(customerId, s ? s.id : '', total, label);
            abatido = a.used; receivableIds = a.ids; creditValue = a.left;
            if (a.left > 0) result.notes.push(`O cliente devia menos que a devolução: ${money(a.left)} viraram vale-troca.`);
        }
        // 4. registro da devolução
        const ret = {
            number, saleId: s ? s.id : '', saleNumber: s ? s.saleNumber || 0 : 0, customerId, customerName,
            items: lines.map(l => ({ productId: l.productId || '', name: l.name, code: l.code || '', qty: l.qty, unitPrice: r2(l.unit), total: r2(l.qty * l.unit), restock: restock && !!l.productId })),
            total, reason: P.reason || 'troca', reasonLabel: (REASONS.find(x => x[0] === P.reason) || REASONS[0])[1], note: P.note || '', mode, restock,
            abatido, receivableIds, cashRegisterId, creditId: '', creditCode: '', creditValue: r2(creditValue), noReceipt: !s,
            sellerId: s ? (s.sellerId || '') : '', sellerName: s ? (s.sellerName || '') : '', commissionBefore: result.commissionBefore ?? null, commissionAfter: result.commissionAfter ?? null,
            by: uid(), byName: meName(), deleted: false, createdAt: TS(), updatedAt: TS()
        };
        const rref = await db.collection(RCOL).add(ret);
        result.id = rref.id; result.ret = { id: rref.id, ...ret, createdAt: new Date() };
        if (creditValue > 0) {
            const cr = await createCredit({ customerId, customerName, amount: creditValue, source: 'return', refId: rref.id, refLabel: label, note: P.note || '' });
            await db.collection(RCOL).doc(rref.id).update({ creditId: cr.id, creditCode: cr.code });
            result.credit = cr; result.ret.creditId = cr.id; result.ret.creditCode = cr.code;
        }
        // 5. cliente e auditoria
        if (s && s.customerId) await bumpCustomer(s.customerId, -total);
        try { AuditService.log('return', 'sales', s ? s.id : rref.id, { number, total, mode, items: ret.items.map(i => ({ name: i.name, qty: i.qty })) }); } catch (e) { }
        if (s) result.sale = { ...s, items: (s.items || []).map((i, k) => { const l = lines.find(x => x.idx === k); return l ? { ...i, returnedQty: r3(Number(i.returnedQty || 0) + l.qty) } : i; }) };
        return result;
    }

    /* ============================ impressão (80 mm) ============================ */
    // Code 128 (B): o leitor de código de barras do caixa lê o vale
    const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
    function barcodeSvg(text, h) {
        h = h || 52;
        const vals = [104];
        for (const ch of String(text || '')) { const v = ch.charCodeAt(0) - 32; if (v >= 0 && v <= 94) vals.push(v); }
        let sum = 104; for (let i = 1; i < vals.length; i++) sum += vals[i] * i;
        vals.push(sum % 103); vals.push(106);
        let x = 10, bars = '';
        vals.forEach(v => { const p = C128[v]; for (let i = 0; i < p.length; i++) { const w = +p[i]; if (i % 2 === 0) bars += `<rect x="${x}" y="0" width="${w}" height="${h}"/>`; x += w; } });
        const W = x + 10;
        return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" shape-rendering="crispEdges" style="display:block;width:100%;max-width:290px;height:${h}px;margin:0 auto"><g fill="#000">${bars}</g></svg>`;
    }
    async function printSlip(o) {
        const w = window.open('', '_blank', 'width=380,height=680');
        if (!w) { toast('warning', 'Libere as janelas pop-up para imprimir.'); return null; }
        const co = await company(), c = o.credit || null, r = o.ret || null;
        const who = (c && c.customerName) || (r && r.customerName) || '';
        const when = fmtDT((r && r.createdAt) || (c && c.createdAt) || new Date());
        const rows = (a, b) => `<tr><td>${a}</td><td class="r">${b}</td></tr>`;
        const items = r && Array.isArray(r.items) && r.items.length ? `<div class="ln"></div><div class="s">PEÇAS DEVOLVIDAS</div><table class="s">${r.items.map(i => rows(`${esc(qtxt(i.qty))}x ${esc(String(i.name || '').slice(0, 24))}`, money(i.total))).join('')}</table>` : '';
        const used = c ? r2(Number(c.amount || 0) - Number(c.balance || 0)) : 0;
        const head = c ? 'VALE-TROCA' : 'COMPROVANTE DE DEVOLUÇÃO';
        const msg = c ? 'Apresente este vale no caixa para usar o crédito em qualquer compra. O saldo que sobrar continua no vale. Não é trocado por dinheiro.'
            : (r && r.mode === 'dinheiro' ? `Recebi ${money(r.total)} em dinheiro referente às peças acima.` : `Valor abatido das contas em aberto do cliente.`);
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${c ? 'Vale ' + esc(c.code) : 'Devolução ' + retNo(r && r.number)}</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',Courier,monospace;font-size:13px;font-weight:700;width:302px;margin:0 auto;padding:8px 4px;color:#000;background:#fff}body,body *{color:#000!important}.c{text-align:center}.r{text-align:right}.s{font-size:11px}.ln{border-top:1px dashed #000;margin:7px 0}.dl{border-top:2px solid #000;margin:7px 0}table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:1px 0}.code{font-size:20px;letter-spacing:1px;margin-top:4px}.val{font-size:26px;margin-top:6px}@media print{body{width:100%;padding:0}@page{margin:4mm;size:80mm auto}}</style></head><body>
<div class="c"><div style="font-size:15px">${esc(co.name)}</div>${co.cnpj ? `<div class="s">CNPJ ${esc(co.cnpj)}</div>` : ''}${co.phone ? `<div class="s">${esc(co.phone)}</div>` : ''}${co.address ? `<div class="s">${esc(co.address)}</div>` : ''}</div>
<div class="dl"></div><div class="c" style="font-size:15px;letter-spacing:1px">${head}</div>
${c ? `<div style="margin:10px 0 0">${barcodeSvg(c.code)}</div><div class="c code">${esc(c.code)}</div><div class="c val">${money(c.balance)}</div>${used > 0.004 ? `<div class="c s">Vale de ${money(c.amount)} · já usado ${money(used)}</div>` : ''}`
            : `<div class="c val" style="margin:10px 0 4px">${money(r && r.total)}</div><div class="c s">${esc(MODES[r && r.mode] || '')}</div>`}
<div class="ln"></div><table class="s">${rows('Cliente', esc(who || 'Ao portador'))}${r ? rows('Devolução', retNo(r.number)) : ''}${r && r.saleNumber ? rows('Venda', '#V-' + pad(r.saleNumber)) : ''}${!r && c && c.refLabel ? rows('Origem', esc(c.refLabel)) : ''}${rows('Data', when)}${c ? rows('Validade', c.expiresAt ? fmtD(c.expiresAt) : 'sem vencimento') : ''}${r && r.reasonLabel ? rows('Motivo', esc(r.reasonLabel)) : ''}${rows('Atendente', esc((r && r.byName) || (c && c.createdByName) || meName()))}</table>
${items}<div class="ln"></div><div class="s c" style="line-height:1.35">${msg}</div>
${!c && r && r.mode === 'dinheiro' ? '<div class="c s" style="margin-top:30px">______________________________<br>Assinatura do cliente</div>' : ''}
<div style="height:18px"></div></body></html>`);
        w.document.close();
        let done = false; const go = () => { if (done) return; done = true; try { w.focus(); w.print(); } catch (e) { } };
        w.onload = go; setTimeout(go, 800);
        return w;
    }
    async function printCredit(id) { const c = typeof id === 'object' ? id : await getCredit(id); if (c) return printSlip({ credit: c }); }

    /* ============================ tela da devolução ============================ */
    let pdvHook = null; // o PDV registra: { apply(credit) } para a troca direta
    function openReturn(opts) {
        opts = opts || {};
        if ($('dptRet')) return;
        const D = overlay('dptRet', 'Troca / devolução', 'fa-arrow-right-arrow-left');
        const { B, F } = D;
        const S = { sale: null, lines: [], noRec: false, cust: null, reason: 'troca', note: '', restock: true, mode: 'credito', useNow: !!(opts.pdv && pdvHook), debts: null, reg: undefined, busy: false };
        const close = () => D.close();
        const total = () => r2(S.lines.reduce((a, l) => a + (Number(l.qty) || 0) * (Number(l.unit) || 0), 0));
        const pieces = () => S.lines.reduce((a, l) => a + (Number(l.qty) || 0), 0);

        /* ---- 1. achar a venda ---- */
        async function stepFind() {
            S.sale = null; S.noRec = false; S.lines = [];
            B.innerHTML = `<p class="dpt-p">Procure a venda pelo número do cupom (ex.: <b>12</b> ou <b>V-0012</b>) ou pelo nome do cliente.</p>
<div class="dpt-row"><input class="dpt-in" id="dptQ" placeholder="Número da venda ou nome do cliente" autocomplete="off"><button type="button" class="btn btn-primary" id="dptQGo"><i class="fas fa-magnifying-glass"></i> Buscar</button></div>
<div id="dptQRes"><div class="dpt-small" style="margin-top:12px"><i class="fas fa-spinner fa-spin"></i> Carregando as últimas vendas...</div></div>
<div class="dpt-alt"><button type="button" class="btn btn-outline btn-sm" id="dptNoRec"><i class="fas fa-barcode"></i> Sem cupom: ler o código da peça</button><span class="dpt-small">Quando o cliente não tem o cupom, a peça volta pelo preço de hoje.</span></div>`;
            F.innerHTML = `<button type="button" class="btn btn-secondary" data-close>Fechar</button>`;
            F.querySelector('[data-close]').onclick = close;
            const q = $('dptQ'), res = $('dptQRes');
            const paint = list => {
                res.innerHTML = list.length ? `<div class="dpt-list">${list.map(s => `<div class="dpt-li" data-sid="${esc(s.id)}"><div class="t"><b>${saleNo(s)} · ${esc(s.customerName || 'Consumidor Final')}${Number(s.returnedTotal) > 0 ? '<span class="dpt-tag">já teve troca</span>' : ''}</b><small>${fmtDT(s.createdAt)} · ${(() => { const u = (s.items || []).reduce((a, i) => a + (Number(i.quantity) || 0), 0); return qtxt(u) + (u === 1 ? ' unidade' : ' unidades'); })()} · ${esc(payName(s.paymentMethod))}${s.sellerName ? ' · ' + esc(s.sellerName) : ''}</small></div><span class="v">${money(s.total)}</span></div>`).join('')}</div>`
                    : `<div class="dpt-warn" style="margin-top:12px">Nenhuma venda concluída encontrada. Confira o número no cupom ou use <b>Sem cupom</b>.</div>`;
                res.querySelectorAll('[data-sid]').forEach(el => el.addEventListener('click', () => loadSale(el.dataset.sid)));
            };
            const go = async () => { res.innerHTML = '<div class="dpt-small" style="margin-top:12px"><i class="fas fa-spinner fa-spin"></i> Procurando...</div>'; try { const l = await findSales(q.value); if (l.length === 1 && q.value.trim() && /\d/.test(q.value) && !/[a-z]{3}/i.test(q.value)) return loadSale(l[0].id); paint(l.slice(0, q.value.trim() ? 25 : 8)); } catch (e) { res.innerHTML = `<div class="dpt-warn red">${esc(e.message)}</div>`; } };
            $('dptQGo').onclick = go;
            q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
            $('dptNoRec').onclick = () => { S.noRec = true; S.lines = []; S.cust = null; stepItems(); };
            setTimeout(() => q.focus(), 60);
            try { paint((await findSales('')).slice(0, 8)); } catch (e) { res.innerHTML = ''; }
        }
        async function loadSale(id) {
            B.innerHTML = '<div class="dpt-small" style="padding:24px;text-align:center"><i class="fas fa-spinner fa-spin"></i> Abrindo a venda...</div>';
            try {
                const s = await getSale(id);
                if (!s) throw new Error('Venda não encontrada.');
                if (s.status === 'cancelled' || s.deleted) throw new Error('Esta venda está cancelada.');
                if (!returnable(s)) throw new Error(isOS(s) ? 'Esta venda veio de uma Ordem de Serviço: serviço não tem devolução.' : 'Esta venda ainda não foi concluída (entrega em andamento).');
                S.sale = s; S.noRec = false; S.lines = linesOf(s);
                S.cust = s.customerId ? { id: String(s.customerId), name: s.customerName || 'Cliente' } : null;
                if (!S.lines.some(l => l.max > 0)) throw new Error('Todas as peças desta venda já foram devolvidas (ou são serviços).');
                stepItems();
            } catch (e) { toast('warning', e.message); if (opts.saleId) close(); else stepFind(); }
        }

        /* ---- 2. peças e quantidades ---- */
        function stepItems() {
            const s = S.sale;
            const head = s ? `<div class="dpt-head"><div><b>${saleNo(s)} · ${esc(s.customerName || 'Consumidor Final')}</b><small>${fmtDT(s.createdAt)} · Pago: ${esc(payName(s.paymentMethod))}${s.sellerName ? ' · Vendeu: ' + esc(s.sellerName) : ''}${Number(s.discount) > 0 ? ' · desconto de ' + money(s.discount) + ' já rateado' : ''}</small></div><span class="v">${money(s.total)}</span></div>`
                : `<div class="dpt-head"><div><b>Devolução sem cupom</b><small>Leia (ou digite) o código de cada peça. O valor é o preço de hoje.</small></div></div>`;
            B.innerHTML = `${head}
<div class="dpt-row" style="margin-bottom:10px"><input class="dpt-in" id="dptScan" placeholder="${s ? 'Ler o código da peça (opcional)' : 'Código ou código de barras da peça'}" autocomplete="off"><button type="button" class="btn btn-outline" id="dptScanGo"><i class="fas fa-barcode"></i> ${s ? 'Marcar' : 'Adicionar'}</button></div>
<div style="overflow:auto"><table class="dpt-tb${s ? ' dpt-tb-sale' : ''}"><thead><tr><th>Peça</th>${s ? '<th class="r">Vendida</th><th class="r">Já voltou</th>' : '<th class="r">Preço</th><th></th>'}<th class="c">Devolver</th><th class="r">Valor</th></tr></thead><tbody id="dptLines"></tbody></table></div>
<div class="dpt-g2"><label>Motivo<select class="dpt-in" id="dptReason">${REASONS.map(([k, l]) => `<option value="${k}" ${S.reason === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label><label>Observação (opcional)<input class="dpt-in" id="dptNote" maxlength="200" value="${esc(S.note)}" placeholder="Ex.: trocou M por G"></label></div>
<label class="dpt-chk"><input type="checkbox" id="dptRestock" ${S.restock ? 'checked' : ''}> As peças voltam para o estoque (estão em condição de venda)</label>
<div class="dpt-sum"><span id="dptPcs">Nenhuma peça marcada</span><span>Valor a devolver <b id="dptTot">${money(0)}</b></span></div><div id="dptErr"></div>`;
            F.innerHTML = `<button type="button" class="btn btn-secondary" data-back>${opts.saleId ? 'Fechar' : 'Voltar'}</button><button type="button" class="btn btn-primary" data-next><i class="fas fa-arrow-right"></i> Continuar</button>`;
            F.querySelector('[data-back]').onclick = () => opts.saleId ? close() : stepFind();
            F.querySelector('[data-next]').onclick = () => { const err = check(); if (err) { $('dptErr').innerHTML = `<div class="dpt-warn red">${esc(err)}</div>`; return; } stepDest(); };
            const tb = $('dptLines');
            const paint = () => {
                tb.innerHTML = S.lines.length ? S.lines.map((l, k) => {
                    const off = s && (l.service || l.max <= 0);
                    const qty = `<span class="dpt-qty"><button type="button" data-d="-1" data-k="${k}" ${off || !(l.qty > 0) ? 'disabled' : ''} aria-label="Menos"><i class="fas fa-minus"></i></button><input type="number" min="0" step="any" value="${l.qty || 0}" data-k="${k}" ${off ? 'disabled' : ''} aria-label="Quantidade"><button type="button" data-d="1" data-k="${k}" ${off || (s && l.qty >= l.max) ? 'disabled' : ''} aria-label="Mais"><i class="fas fa-plus"></i></button></span>`;
                    return `<tr class="${off ? 'off' : ''}"><td><b style="font-size:13px">${esc(l.name)}</b><div class="dpt-small">${money(l.unit)} cada${l.service ? ' · serviço (sem devolução)' : ''}${s ? `<span class="dpt-mob"> · vendida${l.sold === 1 ? '' : 's'} ${qtxt(l.sold)}${l.returned ? ', já voltou ' + qtxt(l.returned) : ''}</span>` : ''}</div></td>${s ? `<td class="r">${qtxt(l.sold)}</td><td class="r">${l.returned ? qtxt(l.returned) : '—'}</td>` : `<td class="r">${money(l.unit)}</td><td><button type="button" class="btn-icon btn-danger" data-rm="${k}" title="Tirar"><i class="fas fa-trash"></i></button></td>`}<td class="c">${qty}</td><td class="r" style="font-weight:700">${money((l.qty || 0) * l.unit)}</td></tr>`;
                }).join('') : `<tr><td colspan="5" class="dpt-small" style="text-align:center;padding:16px">${s ? 'Sem peças nesta venda.' : 'Leia o código da primeira peça.'}</td></tr>`;
                const n = pieces();
                $('dptPcs').textContent = n > 0 ? `${qtxt(n)} ${n === 1 ? 'peça' : 'peças'} para devolver` : 'Nenhuma peça marcada';
                $('dptTot').textContent = money(total());
            };
            const setQty = (k, v, src) => {
                const l = S.lines[k]; if (!l) return;
                let q = Math.max(0, r3(v));
                $('dptErr').innerHTML = '';
                if (s && q > l.max + 0.0001) { $('dptErr').innerHTML = `<div class="dpt-warn red">Não dá para devolver mais do que foi vendido: "${esc(l.name)}" teve ${qtxt(l.sold)} vendida${l.sold === 1 ? '' : 's'}${l.returned ? ' e ' + qtxt(l.returned) + ' já voltaram' : ''}.</div>`; q = l.max; }
                l.qty = q; paint();
                if (src) { const i = tb.querySelector(`input[data-k="${k}"]`); if (i) { i.focus(); try { i.select(); } catch (e) { } } }
            };
            tb.addEventListener('click', e => {
                const b = e.target.closest('[data-d]'); if (b && !b.disabled) { const k = Number(b.dataset.k); setQty(k, (Number(S.lines[k].qty) || 0) + Number(b.dataset.d)); return; }
                const rm = e.target.closest('[data-rm]'); if (rm) { S.lines.splice(Number(rm.dataset.rm), 1); paint(); }
            });
            tb.addEventListener('change', e => { const i = e.target.closest('input[data-k]'); if (i) setQty(Number(i.dataset.k), num(i.value), true); });
            $('dptReason').onchange = e => { S.reason = e.target.value; if (S.reason === 'defeito') { S.restock = false; $('dptRestock').checked = false; } };
            $('dptNote').oninput = e => { S.note = e.target.value; };
            $('dptRestock').onchange = e => { S.restock = e.target.checked; };
            const scan = $('dptScan');
            const doScan = async () => {
                const code = scan.value.trim(); if (!code) return; scan.value = '';
                const low = code.toLowerCase();
                if (s) {
                    let k = S.lines.findIndex(l => l.max > 0 && l.qty < l.max && [l.code, l.barcode].some(v => v && String(v).toLowerCase() === low));
                    if (k < 0) { const p = await productByCode(code); if (p) k = S.lines.findIndex(l => l.productId === p.id && l.max > 0 && l.qty < l.max); }
                    if (k < 0) { $('dptErr').innerHTML = `<div class="dpt-warn red">A peça "${esc(code)}" não está nesta venda (ou já foi toda devolvida).</div>`; return; }
                    setQty(k, (Number(S.lines[k].qty) || 0) + 1);
                } else {
                    const p = await productByCode(code);
                    if (!p) { $('dptErr').innerHTML = `<div class="dpt-warn red">Nenhum produto com o código "${esc(code)}".</div>`; return; }
                    const ex = S.lines.find(l => l.productId === p.id);
                    if (ex) ex.qty = r3((Number(ex.qty) || 0) + 1);
                    else S.lines.push({ productId: p.id, name: p.name || 'Produto', code: p.code || code, barcode: p.barcode || '', unit: r2(priceNow(p)), factor: 1, qty: 1, max: Infinity, sold: 0, returned: 0 });
                    $('dptErr').innerHTML = ''; paint();
                }
                scan.focus();
            };
            $('dptScanGo').onclick = doScan;
            scan.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); doScan(); } });
            paint();
            setTimeout(() => (s ? (tb.querySelector('input[data-k]:not([disabled])') || scan) : scan).focus(), 60);
        }
        function check() {
            if (!(pieces() > 0)) return 'Marque quantas peças o cliente está devolvendo.';
            if (S.sale) for (const l of S.lines) if (l.qty > l.max + 0.0001) return `Não dá para devolver mais do que foi vendido ("${l.name}").`;
            if (!(total() > 0)) return 'O valor da devolução precisa ser maior que zero.';
            return '';
        }

        /* ---- 3. para onde vai o valor ---- */
        async function stepDest() {
            const c0 = await cfg(), tot = total();
            if (S.reg === undefined) S.reg = await openRegister();
            if (S.cust && S.debts === null) S.debts = await openDebts(S.cust.id);
            const debt = r2((S.debts || []).reduce((a, e) => a + Number(e.amount || 0), 0));
            const until = new Date(Date.now() + c0.dias * 864e5);
            const cashOk = !!S.reg && canCash(), fiadoOk = !!S.cust && debt > 0;
            if (S.mode === 'dinheiro' && !cashOk) S.mode = 'credito';
            if (S.mode === 'abater_fiado' && !fiadoOk) S.mode = 'credito';
            B.innerHTML = `<div class="dpt-sum" style="margin-top:0"><span>${qtxt(pieces())} ${pieces() === 1 ? 'peça' : 'peças'}${S.sale ? ' da venda ' + saleNo(S.sale) : ' sem cupom'}</span><span>Valor <b>${money(tot)}</b></span></div>
<div class="dpt-sec" style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:16px 0 6px">Como o cliente recebe o valor</div>
<div class="dpt-modes">
<button type="button" class="dpt-mode ${S.mode === 'credito' ? 'on' : ''}" data-m="credito"><div class="h"><i class="fas fa-ticket"></i>Vale-troca</div><p>Fica com ${money(tot)} de crédito na loja, para usar quando quiser. Vale até ${until.toLocaleDateString('pt-BR')}.</p></button>
<button type="button" class="dpt-mode ${S.mode === 'dinheiro' ? 'on' : ''}" data-m="dinheiro" ${cashOk ? '' : 'disabled'}><div class="h"><i class="fas fa-money-bill-wave"></i>Dinheiro de volta</div><p>${!S.reg ? 'Abra o caixa para devolver em dinheiro.' : !canCash() ? 'Só gerente (ou quem pode cancelar vendas) devolve dinheiro.' : `Sai ${money(tot)} do caixa aberto.`}</p></button>
<button type="button" class="dpt-mode ${S.mode === 'abater_fiado' ? 'on' : ''}" data-m="abater_fiado" ${fiadoOk ? '' : 'disabled'}><div class="h"><i class="fas fa-hand-holding-dollar"></i>Abater no fiado</div><p>${!S.cust ? 'Escolha o cliente para ver o que ele deve.' : debt > 0 ? `${esc(S.cust.name.split(' ')[0])} deve ${money(debt)}: abate ${money(Math.min(debt, tot))}${tot > debt ? ' e o resto vira vale' : ''}.` : 'O cliente não tem conta em aberto.'}</p></button>
</div>
<div class="dpt-cust" id="dptCustBox"></div>
${opts.pdv && pdvHook ? `<label class="dpt-chk" id="dptUseNowW" style="${S.mode === 'credito' ? '' : 'display:none'}"><input type="checkbox" id="dptUseNow" ${S.useNow ? 'checked' : ''}> Troca direta: usar o vale agora, nesta compra</label>` : ''}
<div id="dptErr"></div>`;
            const box = $('dptCustBox');
            const paintCust = () => {
                if (S.cust) {
                    box.innerHTML = `<div class="dpt-row"><i class="fas fa-user" style="color:var(--accent)"></i><span style="flex:1;font-size:13px">Cliente: <b>${esc(S.cust.name)}</b></span>${S.sale && S.sale.customerId ? '' : '<button type="button" class="btn btn-outline btn-sm" data-cc>Trocar</button>'}</div>`;
                    box.querySelector('[data-cc]')?.addEventListener('click', () => { S.cust = null; S.debts = null; paintCust(); });
                } else {
                    box.innerHTML = `<div class="dpt-small" style="margin-bottom:6px"><i class="fas fa-user"></i> Cliente: <b>ninguém escolhido</b> — o vale sai <b>ao portador</b> (vale para quem apresentar o cupom). Escolha o cliente para o vale ficar no nome dele.</div><div id="dptCustPick" style="position:relative"></div>`;
                    custPicker($('dptCustPick'), async c => { S.cust = c; S.debts = await openDebts(c.id); stepDest(); });
                }
            };
            paintCust();
            B.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => { if (b.disabled) return; S.mode = b.dataset.m; B.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('on', x === b)); const u = $('dptUseNowW'); if (u) u.style.display = S.mode === 'credito' ? '' : 'none'; }));
            $('dptUseNow')?.addEventListener('change', e => { S.useNow = e.target.checked; });
            F.innerHTML = `<button type="button" class="btn btn-secondary" data-back>Voltar</button><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Confirmar devolução</button>`;
            F.querySelector('[data-back]').onclick = () => stepItems();
            const ok = F.querySelector('[data-ok]');
            ok.onclick = async () => {
                if (S.busy) return; S.busy = true;
                ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
                try {
                    const res = await doReturn({ saleId: S.sale ? S.sale.id : '', lines: S.lines.filter(l => l.qty > 0).map(l => ({ idx: l.idx, productId: l.productId, name: l.name, code: l.code, qty: l.qty, unit: l.unit, factor: l.factor })), customerId: S.cust ? S.cust.id : '', customerName: S.cust ? S.cust.name : '', reason: S.reason, note: S.note, restock: S.restock, mode: S.mode });
                    stepDone(res);
                } catch (e) { console.error(e); $('dptErr').innerHTML = `<div class="dpt-warn red">${esc(e.message)}</div>`; ok.disabled = false; ok.innerHTML = '<i class="fas fa-check"></i> Confirmar devolução'; }
                finally { S.busy = false; }
            };
        }

        /* ---- 4. pronto ---- */
        function stepDone(res) {
            const c = res.credit;
            let applied = false;
            if (c && S.useNow && S.mode === 'credito' && pdvHook) { try { pdvHook.apply(c); applied = true; } catch (e) { console.warn(e); } }
            const what = res.mode === 'credito' ? `Vale <span class="dpt-code">${esc(c ? c.code : '')}</span> de ${money(c ? c.amount : res.total)}`
                : res.mode === 'dinheiro' ? `${money(res.total)} devolvidos em dinheiro (saída do caixa)`
                    : `${money(res.ret.abatido)} abatidos no fiado${c ? ` + vale <span class="dpt-code">${esc(c.code)}</span> de ${money(c.amount)}` : ''}`;
            B.innerHTML = `<div class="dpt-ok"><div class="big"><i class="fas fa-circle-check"></i></div><h4>Devolução ${retNo(res.number)} registrada</h4><p>${what}</p>
<p class="dpt-small">${res.ret.restock ? 'As peças voltaram para o estoque.' : 'As peças não voltaram para o estoque.'}${res.customerName ? ' · Cliente: ' + esc(res.customerName) : ''}</p>
${res.notes.map(n => `<div class="dpt-warn" style="text-align:left">${esc(n)}</div>`).join('')}
${applied ? `<div class="dpt-warn ok" style="text-align:left"><i class="fas fa-ticket"></i> O vale já está no carrinho pagando a compra nova. Adicione as peças que o cliente vai levar e finalize.</div>` : ''}</div>`;
            F.innerHTML = `<button type="button" class="btn btn-outline" data-print><i class="fas fa-print"></i> ${c ? 'Imprimir vale' : 'Imprimir comprovante'}</button><button type="button" class="btn btn-primary" data-done><i class="fas fa-check"></i> Concluir</button>`;
            F.querySelector('[data-print]').onclick = () => printSlip({ credit: c, ret: res.ret });
            F.querySelector('[data-done]').onclick = () => { close(); try { opts.onDone && opts.onDone(res); } catch (e) { } };
            D.ov.querySelector('[data-x]').onclick = () => { close(); try { opts.onDone && opts.onDone(res); } catch (e) { } };
            toast('success', `Devolução ${retNo(res.number)} registrada.`);
        }

        if (opts.saleId || (opts.sale && opts.sale.id)) loadSale(opts.saleId || opts.sale.id);
        else stepFind();
    }

    /* ============================ PDV ============================ */
    function setupPdv() {
        const box = document.querySelector('.payment-methods');
        if (!box || typeof window.buildSalePayments !== 'function' || typeof SalesService === 'undefined' || $('dptPayBtn')) return;
        css();
        const G = {
            get cart() { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } },
            get custId() { try { return selectedCustomerId || null; } catch (e) { return null; } },
            get custName() { try { return selectedCustomerNameVal || ''; } catch (e) { return ''; } },
            get payment() { try { return selectedPayment; } catch (e) { return ''; } },
            base() { const s = this.cart.reduce((a, i) => a + Number(i.total || 0), 0); let d = 0, f = 0; try { d = Number(discount || 0); } catch (e) { } try { f = Number(deliveryFee || 0); } catch (e) { } return r2(Math.max(0, s - d + f)); }
        };
        let V = []; // vales aplicados nesta venda: [{ id, code, customerId, customerName, balance, want }]
        const valeMax = () => r2(V.reduce((a, c) => a + Math.min(Number(c.want ?? c.balance), Number(c.balance)), 0));
        const valeUse = () => r2(Math.min(valeMax(), G.base()));
        const parts = () => { let left = valeUse(); return V.map(c => { const u = r2(Math.max(0, Math.min(left, Number(c.want ?? c.balance), Number(c.balance)))); left = r2(left - u); return { c, u }; }).filter(x => x.u > 0); };

        // Botão "Troca / devolução" no topo do PDV
        const hd = document.querySelector('.pdv-header');
        if (hd && !$('dptRetBtn')) {
            const b = document.createElement('button'); b.type = 'button'; b.id = 'dptRetBtn'; b.className = 'dpt-hbtn'; b.title = 'Troca / devolução de peças (com vale-troca, dinheiro ou abatendo no fiado)';
            b.innerHTML = '<i class="fas fa-arrow-right-arrow-left"></i><span>Troca / devolução</span>';
            b.addEventListener('click', () => openReturn({ pdv: true, onDone: () => { try { loadProducts(); } catch (e) { } paintChip(true); } }));
            const search = hd.querySelector('.pdv-search-bar'); if (search && search.nextSibling) hd.insertBefore(b, search.nextSibling); else hd.appendChild(b);
        }
        // Forma de pagamento "Vale-troca"
        const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pay-method'; btn.id = 'dptPayBtn';
        btn.addEventListener('click', () => openUseVale(''));
        const multi = [...box.querySelectorAll('.pay-method')].find(b => /'multi'/.test(b.getAttribute('onclick') || ''));
        box.insertBefore(btn, multi || null);
        const paintBtn = () => {
            const on = V.length > 0, use = valeUse();
            btn.classList.toggle('dpt-on', on);
            const t = 'Vale-troca';
            if (btn.dataset.t !== t) { btn.dataset.t = t; btn.innerHTML = `<i class="fas fa-ticket"></i>${esc(t)}`; }
            btn.title = on ? `Vale-troca aplicado nesta venda: ${money(use || valeMax())} (clique para ver ou tirar)` : 'Pagar com vale-troca / crédito do cliente';
        };
        cfg().then(c => { btn.style.display = c.ativo ? '' : 'none'; });
        paintBtn();

        // Crédito do cliente escolhido (aparece embaixo do cliente)
        let lastCust = '__', chipSeq = 0;
        const chip = document.createElement('div'); chip.id = 'dptCredChip'; chip.className = 'dpt-chip'; chip.style.display = 'none';
        const badge = $('selectedCustomerBadge'); if (badge && badge.parentElement) badge.insertAdjacentElement('afterend', chip);
        async function paintChip(force) {
            const id = G.custId ? String(G.custId) : '';
            if (!force && id === lastCust) return;
            lastCust = id; const my = ++chipSeq;
            if (!id) { chip.style.display = 'none'; return; }
            const open = (await creditsOf(id)).filter(c => state(c) === 'open');
            if (my !== chipSeq) return;
            const applied = new Set(V.map(c => c.id));
            const avail = r2(open.filter(c => !applied.has(c.id)).reduce((a, c) => a + Number(c.balance || 0), 0));
            if (!(avail > 0)) { chip.style.display = 'none'; return; }
            chip.innerHTML = `<i class="fas fa-ticket"></i><span>Crédito de troca: ${money(avail)}</span><button type="button">Usar</button>`;
            chip.querySelector('button').onclick = () => openUseVale('', open.filter(c => !applied.has(c.id)));
            chip.style.display = '';
        }
        setInterval(() => { paintChip(false); }, 900);

        function refresh() { try { updateCartSummary(); } catch (e) { } try { updateBrandIndicator(); } catch (e) { } paintBtn(); paintChip(true); }
        function apply(c) {
            const err = useError(c); if (err) throw new Error(err);
            if (!V.some(x => x.id === c.id)) V.push({ id: c.id, code: c.code, customerId: c.customerId || '', customerName: c.customerName || '', balance: r2(c.balance), want: r2(c.balance), expiresAt: c.expiresAt || null, refLabel: c.refLabel || '' });
            // sem cliente na venda: o dono do vale vira o cliente da venda
            if (!G.custId && c.customerId) {
                try { if (typeof window.selectCustomerById === 'function' && (allPdvCustomers || []).some(x => String(x.id) === String(c.customerId))) window.selectCustomerById(c.customerId); else window.selectCustomer(c.customerId, c.customerName || 'Cliente', ''); } catch (e) { }
            }
            refresh();
        }
        pdvHook = { apply: c => apply(c) };

        // Janela "Pagar com vale-troca"
        async function openUseVale(code, preset) {
            const W = overlay('dptVale', 'Pagar com vale-troca', 'fa-ticket', 560);
            const draft = V.map(c => ({ ...c }));
            const base = G.base();
            const paint = async () => {
                const use = r2(Math.min(base, draft.reduce((a, c) => a + Math.min(Number(c.want ?? c.balance), Number(c.balance)), 0)));
                $('dptVSel').innerHTML = draft.length ? draft.map((c, k) => `<div class="dpt-vcard"><i class="fas fa-ticket" style="color:#10b981"></i><div class="t"><b><span class="dpt-code">${esc(c.code)}</span>${c.customerName ? ' · ' + esc(c.customerName) : ''}</b><small>Saldo ${money(c.balance)}${c.expiresAt ? ' · vale até ' + fmtD(c.expiresAt) : ''}</small></div><input inputmode="decimal" data-k="${k}" value="${String(r2(Math.min(Number(c.want ?? c.balance), Number(c.balance)))).replace('.', ',')}" aria-label="Valor a usar"><button type="button" class="btn-icon btn-danger" data-rm="${k}" title="Tirar este vale"><i class="fas fa-trash"></i></button></div>`).join('')
                    : '<div class="dpt-small" style="margin-top:8px">Nenhum vale escolhido ainda.</div>';
                const rest = r2(Math.max(0, base - use));
                $('dptVSum').innerHTML = `<div class="dpt-sum"><span>Compra ${money(base)}${use > 0 ? ` · vale ${money(use)}` : ''}</span><span>${base > 0 ? (rest > 0 ? 'Falta pagar' : 'Pago com o vale') : 'Carrinho vazio'} <b>${money(rest)}</b></span></div>${base > 0 && rest > 0 && use > 0 ? `<div class="dpt-small" style="margin-top:6px">O resto (${money(rest)}) vai na forma de pagamento escolhida no PDV (dinheiro, PIX, cartão...).</div>` : ''}${!(base > 0) && draft.length ? '<div class="dpt-small" style="margin-top:6px">Adicione as peças novas no carrinho: o vale já fica aplicado.</div>' : ''}${draft.some(c => Number(c.want ?? c.balance) < Number(c.balance) || use < draft.reduce((a, c) => a + Number(c.balance), 0)) && draft.length ? '<div class="dpt-small" style="margin-top:4px">O que não for usado continua no saldo do vale.</div>' : ''}`;
                $('dptVSel').querySelectorAll('input[data-k]').forEach(i => i.addEventListener('change', () => { const c = draft[Number(i.dataset.k)]; c.want = r2(Math.max(0, Math.min(Number(c.balance), num(i.value)))); paint(); }));
                $('dptVSel').querySelectorAll('[data-rm]').forEach(b => b.addEventListener('click', () => { draft.splice(Number(b.dataset.rm), 1); paint(); paintMine(); }));
            };
            W.B.innerHTML = `<div class="dpt-lbl">Código do vale<div class="dpt-row" style="margin-top:4px"><input class="dpt-in" id="dptVCode" placeholder="VT-0001-AB12 (pode ler o código de barras)" autocomplete="off"><button type="button" class="btn btn-primary" id="dptVGo"><i class="fas fa-magnifying-glass"></i> Buscar</button></div></div><div id="dptVMsg"></div>
<div id="dptVMine"></div><div class="dpt-sec" style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 4px">Vales nesta compra</div><div id="dptVSel"></div><div id="dptVSum"></div>`;
            W.F.innerHTML = `${V.length ? '<button type="button" class="btn btn-outline" data-clear style="color:var(--danger)"><i class="fas fa-xmark"></i> Tirar vale</button>' : ''}<button type="button" class="btn btn-secondary" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Usar vale</button>`;
            const msg = (t, red) => { $('dptVMsg').innerHTML = t ? `<div class="dpt-warn ${red ? 'red' : 'ok'}">${t}</div>` : ''; };
            const add = c => {
                const err = useError(c); if (err) { msg(esc(err), true); return false; }
                if (draft.some(x => x.id === c.id)) { msg('Este vale já está na compra.', true); return false; }
                const other = G.custId && c.customerId && String(c.customerId) !== String(G.custId);
                draft.push({ id: c.id, code: c.code, customerId: c.customerId || '', customerName: c.customerName || '', balance: r2(c.balance), want: r2(c.balance), expiresAt: c.expiresAt || null, refLabel: c.refLabel || '' });
                msg(`Vale ${esc(c.code)} encontrado: saldo de <b>${money(c.balance)}</b>.${other ? ` Atenção: o vale está no nome de <b>${esc(c.customerName)}</b>.` : ''}`);
                paint(); paintMine(); return true;
            };
            const go = async () => { const k = $('dptVCode').value.trim(); if (!k) return; $('dptVCode').value = ''; const c = await byCode(k); if (!c) { msg(`Nenhum vale com o código <b>${esc(normCode(k))}</b>. Confira o cupom.`, true); return; } add(c); };
            $('dptVGo').onclick = go;
            $('dptVCode').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
            let mine = Array.isArray(preset) ? preset : null;
            async function paintMine() {
                const host = $('dptVMine'); if (!host) return;
                if (!G.custId) { host.innerHTML = ''; return; }
                if (!mine) { host.innerHTML = '<div class="dpt-small" style="margin-top:10px"><i class="fas fa-spinner fa-spin"></i> Procurando os vales do cliente...</div>'; mine = (await creditsOf(G.custId)).filter(c => state(c) === 'open'); }
                const list = mine.filter(c => !draft.some(x => x.id === c.id));
                host.innerHTML = list.length ? `<div class="dpt-sec" style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:14px 0 4px">Créditos de ${esc(G.custName || 'cliente')}</div>${list.map(c => `<div class="dpt-vcard"><i class="fas fa-ticket" style="color:var(--accent)"></i><div class="t"><b><span class="dpt-code">${esc(c.code)}</span> · ${money(c.balance)}</b><small>${esc(c.refLabel || SRC[c.source] || '')}${c.expiresAt ? ' · vale até ' + fmtD(c.expiresAt) : ' · sem vencimento'}</small></div><button type="button" class="btn btn-outline btn-sm" data-use="${esc(c.id)}"><i class="fas fa-plus"></i> Usar</button></div>`).join('')}` : '';
                host.querySelectorAll('[data-use]').forEach(b => b.addEventListener('click', () => { const c = mine.find(x => x.id === b.dataset.use); if (c) add(c); }));
            }
            W.F.querySelector('[data-cancel]').onclick = () => W.close();
            W.F.querySelector('[data-clear]')?.addEventListener('click', () => { V = []; W.close(); refresh(); toast('info', 'Vale tirado desta venda (o saldo continua no vale).'); });
            W.F.querySelector('[data-ok]').onclick = () => {
                if (!draft.length) { msg('Leia o código do vale ou escolha um crédito do cliente.', true); return; }
                V = draft.filter(c => Number(c.want ?? c.balance) > 0);
                W.close();
                const first = V.find(c => c.customerId);
                if (!G.custId && first) { try { if (typeof window.selectCustomerById === 'function' && (allPdvCustomers || []).some(x => String(x.id) === String(first.customerId))) window.selectCustomerById(first.customerId); else window.selectCustomer(first.customerId, first.customerName || 'Cliente', ''); } catch (e) { } }
                refresh();
                const rest = r2(Math.max(0, G.base() - valeUse()));
                toast('success', V.length ? (G.base() > 0 ? (rest > 0 ? `Vale aplicado: falta pagar ${money(rest)}.` : 'Vale aplicado: a compra está paga.') : 'Vale aplicado. Adicione as peças da compra.') : 'Sem vale nesta venda.');
            };
            paint(); paintMine();
            if (code) { $('dptVCode').value = code; go(); } else setTimeout(() => $('dptVCode')?.focus(), 60);
        }

        // Taxa do cartão repassada só sobre o que não é vale
        const wrapSur = () => { const o = window.dpCardSurcharge; if (typeof o === 'function' && !o.__dpt) { const w = function (base) { return o.call(this, Math.max(0, r2(Number(base) - valeUse()))); }; w.__dpt = true; window.dpCardSurcharge = w; } };
        wrapSur(); setTimeout(wrapSur, 1500);
        // Pagamento dividido: divide só o que falta depois do vale
        const oTot = window.getCurrentSaleTotal;
        if (typeof oTot === 'function') window.getCurrentSaleTotal = function () { const t = oTot.apply(this, arguments); return r2(Math.max(0, t - valeUse())); };
        const oMulti = window.openMultiPaymentModal;
        if (typeof oMulti === 'function') window.openMultiPaymentModal = function () { const r = oMulti.apply(this, arguments); try { if (valeUse() > 0) { const sm = document.querySelector('#multiPaymentOverlay .modal-body small'); if (sm) sm.textContent = `Falta pagar (já tirado o vale de ${money(valeUse())})`; } } catch (e) { } return r; };
        // As formas de pagamento da venda: o resto + uma linha "vale" para cada vale usado
        const oBuild = window.buildSalePayments;
        window.buildSalePayments = function (total) {
            const ps = parts(); if (!ps.length) return oBuild.apply(this, arguments);
            const use = r2(ps.reduce((a, x) => a + x.u, 0)), rest = r2(Number(total) - use);
            let out = [];
            if (rest > 0.004) { out = oBuild.call(this, rest); if (!Array.isArray(out)) return out; }
            ps.forEach(x => out.push({ method: 'vale', amount: x.u, creditId: x.c.id, creditCode: x.c.code, cardBrand: '', installments: 1, feePercent: 0, feeValue: 0, netAmount: x.u, cashReceived: 0, changeValue: 0, dueDate: '' }));
            return out;
        };
        const oLabel = window.splitMethodLabel;
        if (typeof oLabel === 'function') window.splitMethodLabel = function (m) { return m === 'vale' ? 'Vale-troca' : oLabel.apply(this, arguments); };
        // Dinheiro: o troco é calculado só sobre o que falta
        const oCash = window.showCashFinalizeModal;
        if (typeof oCash === 'function') window.showCashFinalizeModal = function (total, html, cb) {
            const use = valeUse(); if (!(use > 0)) return oCash.apply(this, arguments);
            const rest = r2(Number(total) - use);
            if (rest <= 0.004) { // tudo no vale: não pede dinheiro, só confirma
                if (typeof Confirm !== 'undefined' && Confirm && typeof Confirm.show === 'function') Confirm.show('Finalizar Venda', String(html || ''), () => cb(0, 0)); else cb(0, 0);
                return;
            }
            return oCash.call(this, rest, String(html || '') + note(use, rest), cb);
        };
        const note = (use, rest) => `<div style="margin-top:10px;padding:9px 12px;border-radius:10px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.35);font-size:12.5px;text-align:left"><b>Vale-troca:</b> ${money(use)} (${V.map(c => esc(c.code)).join(', ')})<br>${rest > 0.004 ? `<b>Falta pagar:</b> ${money(rest)}` : '<b>Compra paga com o vale</b>'}</div>`;
        // Resumo de "Finalizar venda"
        try {
            if (typeof Confirm !== 'undefined' && Confirm && typeof Confirm.show === 'function' && !Confirm.show.__dpt) {
                const oShow = Confirm.show;
                const w = function (title, html) {
                    const a = Array.from(arguments);
                    if (title === 'Finalizar Venda' && typeof html === 'string' && valeUse() > 0) {
                        const use = valeUse();
                        const rest = r2(Math.max(0, (G.base() + (window.dpCardSurcharge ? window.dpCardSurcharge(G.base()) : 0)) - use));
                        let h = html; if (rest <= 0.004) h = h.replace(/•\s*[^<•]+<\/div>/, '• Vale-troca</div>');
                        a[1] = h.replace(/<\/div>\s*$/, note(use, rest) + '</div>');
                    }
                    return oShow.apply(this, a);
                };
                w.__dpt = true; Confirm.show = w;
            }
        } catch (e) { }
        // Com vale, o resto não vai para o crediário (as parcelas seriam sobre a venda toda)
        const oFin = window.finalizeSale;
        if (typeof oFin === 'function') window.finalizeSale = function () {
            if (V.length && $('dpcPayBtn') && $('dpcPayBtn').classList.contains('selected') && valeUse() < G.base() - 0.004) { toast('warning', 'Com vale-troca, o resto não pode ir para o crediário. Escolha Dinheiro, PIX, cartão ou Fiado para o que falta.'); return; }
            return oFin.apply(this, arguments);
        };
        // Carrinho: linhas do vale e do que falta pagar
        const oSum = window.updateCartSummary;
        if (typeof oSum === 'function') window.updateCartSummary = function () {
            const r = oSum.apply(this, arguments);
            try {
                const totalRow = $('cartTotal') && $('cartTotal').closest('.cs-row');
                let vr = $('dptValeRow'), pr = $('dptPayRow');
                if (V.length && totalRow) {
                    const use = valeUse(), base = G.base();
                    const sur = window.dpCardSurcharge ? Number(window.dpCardSurcharge(base)) || 0 : 0;
                    const rest = r2(Math.max(0, base + sur - use));
                    if (!vr) { vr = document.createElement('div'); vr.id = 'dptValeRow'; vr.className = 'cs-row dpt-vrow'; }
                    if (!pr) { pr = document.createElement('div'); pr.id = 'dptPayRow'; pr.className = 'cs-row dpt-prow'; }
                    vr.innerHTML = `<span>Vale-troca ${V.length === 1 ? '<span class="dpt-code" style="font-size:11px">' + esc(V[0].code) + '</span>' : '(' + V.length + ')'}</span><span class="mono">${base > 0 ? '- ' + money(use) : money(valeMax()) + ' disponível'}</span>`;
                    pr.innerHTML = `<span>${rest > 0.004 ? 'Falta pagar' : 'Pago com vale'}</span><span class="mono">${money(rest)}</span>`;
                    if (totalRow.nextElementSibling !== vr) totalRow.after(vr);
                    if (vr.nextElementSibling !== pr) vr.after(pr);
                } else { vr && vr.remove(); pr && pr.remove(); }
            } catch (e) { }
            paintBtn();
            return r;
        };
        // Grava a venda: confere os vales antes, baixa o saldo depois
        const oCreate = SalesService.create;
        SalesService.create = async function (data) {
            const vales = data && Array.isArray(data.payments) ? data.payments.filter(p => p.method === 'vale' && p.creditId) : [];
            if (vales.length) {
                const need = {}; vales.forEach(p => { need[p.creditId] = r2((need[p.creditId] || 0) + Number(p.amount || 0)); });
                for (const id of Object.keys(need)) { const c = await getCredit(id); const err = useError(c, need[id]); if (err) throw new Error(err); }
            }
            const r = await oCreate.apply(this, arguments);
            if (vales.length && r && r.id) {
                const usage = [];
                for (const p of vales) {
                    try { const c = await useCredit(p.creditId, p.amount, { saleId: r.id, saleNumber: r.saleNumber }); usage.push({ code: c.code, used: r2(p.amount), balance: r2(c.balance), expiresAt: c.expiresAt || null }); }
                    catch (e) { console.error(e); toast('warning', `A venda foi registrada, mas o saldo do vale ${p.creditCode || ''} não baixou: ${e.message}`); }
                }
                try { data.valeUsage = usage; } catch (e) { }
                V = []; setTimeout(refresh, 0);
            }
            return r;
        };
        // Cupom: "vale" vira "Vale-troca VT-..." e mostra o saldo que ficou
        const oPrint = window.printReceipt;
        if (typeof oPrint === 'function') window.printReceipt = function (sale) {
            const hasVale = sale && Array.isArray(sale.payments) && sale.payments.some(p => p.method === 'vale');
            if (!hasVale) return oPrint.apply(this, arguments);
            const realOpen = window.open; let w = null;
            window.open = function () { w = realOpen.apply(window, arguments); return w; };
            let r; try { r = oPrint.apply(this, arguments); } finally { window.open = realOpen; }
            try { if (w && w.document) receiptVale(w.document, sale.payments, sale.valeUsage); } catch (e) { console.warn('vale no cupom', e); }
            return r;
        };
        // Código do vale lido na busca de produtos abre a janela do vale
        window.addEventListener('keydown', e => {
            if (e.key !== 'Enter' || !e.target || e.target.id !== 'pdvSearch') return;
            const v = e.target.value.trim(); if (!looksCode(v)) return;
            e.preventDefault(); e.stopImmediatePropagation(); e.target.value = '';
            try { renderProducts(); } catch (x) { }
            openUseVale(v);
        }, true);
        window.addEventListener('keydown', e => { if (e.key === 'F7') { e.preventDefault(); openReturn({ pdv: true, onDone: () => { try { loadProducts(); } catch (x) { } paintChip(true); } }); } });
        const ps = document.querySelector('.pdv-shortcuts'); if (ps && !ps.querySelector('[data-dpt]')) { const sp = document.createElement('span'); sp.dataset.dpt = '1'; sp.innerHTML = '<kbd>F7</kbd> Troca'; ps.appendChild(sp); }
        window.DPTrocas.openUseVale = openUseVale;
        window.DPTrocas.pdvState = () => ({ vales: V.map(c => ({ ...c })), use: valeUse(), rest: r2(Math.max(0, G.base() - valeUse())) });
        setTimeout(refresh, 300);
    }
    // No cupom já impresso (PDV ou reimpressão): nome da forma e saldo do vale
    function receiptVale(doc, payments, usage) {
        const vales = (payments || []).filter(p => p.method === 'vale'); let k = 0;
        doc.querySelectorAll('td').forEach(td => { if (td.children.length === 0 && td.textContent.trim() === 'vale') { const p = vales[k++]; td.textContent = 'Vale-troca' + (p && p.creditCode ? ' ' + p.creditCode : ''); } });
        const u = (usage || []).filter(x => x && x.code);
        if (!u.length) return;
        const tables = [...doc.querySelectorAll('table')], last = tables.find(t => /TOTAL/.test(t.textContent));
        const div = doc.createElement('div');
        div.innerHTML = `<div style="border-top:1px dashed #000;margin:6px 0"></div>${u.map(x => `<div style="font-size:11px">Vale ${esc(x.code)}: ${x.balance > 0.004 ? 'saldo que ficou ' + money(x.balance) + (x.expiresAt ? ' (até ' + fmtD(x.expiresAt) + ')' : '') : 'usado todo'}</div>`).join('')}`;
        if (last && last.parentNode) last.parentNode.insertBefore(div, last.nextSibling); else doc.body.appendChild(div);
    }

    /* ============================ Pedidos (detalhes da venda) ============================ */
    function setupPedidos() {
        if (!$('modalPedido') || typeof window.openDetail !== 'function' || window.openDetail.__dpt) return;
        css();
        const allS = () => { try { return allSales; } catch (e) { return []; } };
        const reload = async () => { try { if (typeof closeModal === 'function') closeModal('modalPedido'); } catch (e) { } try { if (typeof loadOrders === 'function') await loadOrders(); } catch (e) { } };
        const o = window.openDetail;
        const w = function (id) {
            const r = o.apply(this, arguments);
            try { enhance(id); } catch (e) { console.warn('trocas', e); }
            return r;
        };
        w.__dpt = true; window.openDetail = w;
        async function enhance(id) {
            const s = allS().find(x => x.id === id); if (!s) return;
            const body = $('modalPedidoBody'), foot = $('modalPedidoFooter'); if (!body || !foot) return;
            // forma de pagamento "vale" com o nome certo
            body.querySelectorAll('div').forEach(d => { if (d.children.length === 0 && d.textContent.trim() === 'vale') d.textContent = 'Vale-troca'; });
            const lines = linesOf(s);
            if (returnable(s) && lines.some(l => l.max > 0) && !foot.querySelector('.dpt-retbtn')) {
                const b = document.createElement('button'); b.className = 'btn btn-outline dpt-retbtn'; b.innerHTML = '<i class="fas fa-arrow-right-arrow-left"></i> Troca / devolução';
                b.onclick = () => openReturn({ saleId: s.id, onDone: reload });
                const rp = foot.querySelector('button[onclick^="reprintSale"]'); if (rp) rp.insertAdjacentElement('afterend', b); else foot.appendChild(b);
            }
            if (!(Number(s.returnedTotal) > 0) || body.querySelector('.dpt-retbox')) return;
            const box = document.createElement('div'); box.className = 'dpt-retbox';
            box.style.cssText = 'padding:10px 12px;border-radius:10px;background:rgba(245,158,11,.08);border:1px solid rgba(245,158,11,.3);margin-bottom:14px';
            box.innerHTML = `<div style="font-size:11px;color:#b45309;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px"><i class="fas fa-arrow-right-arrow-left" style="margin-right:5px"></i>Trocas e devoluções · ${money(s.returnedTotal)}</div><div class="dpt-small">Carregando...</div>`;
            const totals = body.lastElementChild; if (totals) body.insertBefore(box, totals); else body.appendChild(box);
            let rets = [];
            try { rets = docs(await db.collection(RCOL).where('saleId', '==', s.id).get()).filter(x => !x.deleted).sort((a, b) => ms(a.createdAt) - ms(b.createdAt)); } catch (e) { }
            const lst = box.querySelector('.dpt-small');
            lst.outerHTML = rets.length ? rets.map(rt => `<div style="font-size:12.5px;color:var(--text-secondary);padding:3px 0"><b>${retNo(rt.number)}</b> · ${fmtDT(rt.createdAt)} · ${(rt.items || []).map(i => `${qtxt(i.qty)}x ${esc(i.name)}`).join(', ')} · <b>${money(rt.total)}</b> · ${esc(MODES[rt.mode] || rt.mode)}${rt.creditCode ? ' <span class="dpt-code">' + esc(rt.creditCode) + '</span>' : ''}${rt.byName ? ' · ' + esc(rt.byName) : ''}</div>`).join('')
                : lines.filter(l => l.returned > 0).map(l => `<div style="font-size:12.5px;color:var(--text-secondary)">${qtxt(l.returned)}x ${esc(l.name)} devolvida(s)</div>`).join('');
        }
        const oRep = window.reprintSale;
        if (typeof oRep === 'function') window.reprintSale = async function (id) {
            const s = allS().find(x => x.id === id);
            const vales = s && Array.isArray(s.payments) ? s.payments.filter(p => p.method === 'vale') : [];
            if (!vales.length) return oRep.apply(this, arguments);
            const usage = [];
            for (const p of vales) { try { const c = p.creditId ? await getCredit(p.creditId) : null; const h = c && (c.history || []).find(x => x.type === 'use' && x.saleId === id); if (c) usage.push({ code: c.code, balance: h ? Number(h.balanceAfter || 0) : Number(c.balance || 0), expiresAt: c.expiresAt }); } catch (e) { } }
            const realOpen = window.open; let w = null;
            window.open = function () { w = realOpen.apply(window, arguments); return w; };
            let r; try { r = oRep.apply(this, arguments); } finally { setTimeout(() => { window.open = realOpen; }, 0); }
            try { await r; } catch (e) { }
            window.open = realOpen;
            try { if (w && w.document) receiptVale(w.document, s.payments, usage); } catch (e) { }
            return r;
        };
    }

    /* ============================ Clientes (aba Vales e créditos) ============================ */
    function setupClientes() {
        if (!window.dpClientes) return;
        css();
        let used = false; try { used = localStorage.getItem('dp_vales_on') === '1'; } catch (e) { }
        allCredits().then(l => { used = l.length > 0; try { localStorage.setItem('dp_vales_on', used ? '1' : '0'); } catch (e) { } }).catch(() => { });
        const refresh = id => { try { window.dpClientes.open(id, { tab: 'vales', replace: true }); } catch (e) { } };
        window.DPClientTabs = window.DPClientTabs || [];
        if (window.DPClientTabs.some(t => t && t.id === 'vales')) return;
        window.DPClientTabs.push({
            id: 'vales', icon: 'fa-ticket', label: 'Vales e créditos',
            show: D => !!(D && D.c) && (used || Number(D.c.storeCreditBalance) > 0 || D.c.storeCreditBalance !== undefined || isBoss()),
            count: D => Number(D && D.c && D.c.storeCreditBalance) > 0.004 ? money(D.c.storeCreditBalance).replace(/,00$/, '') : '',
            render: async (body, D) => {
                const c = D.c;
                body.innerHTML = '<div class="card" style="padding:24px;text-align:center;color:var(--text-muted)"><i class="fas fa-spinner fa-spin"></i> Carregando os vales...</div>';
                const [list, rets] = await Promise.all([creditsOf(c.id), (async () => { try { return docs(await db.collection(RCOL).where('customerId', '==', String(c.id)).get()).filter(x => !x.deleted); } catch (e) { return []; } })()]);
                list.sort((a, b) => (state(a) === 'open' ? 0 : 1) - (state(b) === 'open' ? 0 : 1) || ms(b.createdAt) - ms(a.createdAt));
                rets.sort((a, b) => ms(b.createdAt) - ms(a.createdAt));
                const open = list.filter(x => state(x) === 'open'), bal = r2(open.reduce((a, x) => a + Number(x.balance || 0), 0));
                const soon = open.filter(x => x.expiresAt && Number(x.expiresAt) - Date.now() < 30 * 864e5);
                if (Math.abs(bal - Number(c.storeCreditBalance || 0)) > 0.004 || c.storeCreditBalance === undefined && list.length) { syncBalance(c.id); c.storeCreditBalance = bal; }
                body.innerHTML = `<div class="card" style="padding:16px">
<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap"><h3 style="margin:0;font-size:15px;flex:1"><i class="fas fa-ticket" style="color:var(--accent);margin-right:6px"></i>Vales e créditos</h3>${isBoss() ? '<button type="button" class="btn btn-outline btn-sm" data-v="new"><i class="fas fa-plus"></i> Lançar crédito</button>' : ''}</div>
<div class="dpt-kpis"><div class="dpt-kpi"><span>Saldo para usar</span><b style="color:#047857">${money(bal)}</b></div><div class="dpt-kpi"><span>Vales em aberto</span><b>${open.length}</b></div><div class="dpt-kpi"><span>Vencem em 30 dias</span><b style="${soon.length ? 'color:#b45309' : ''}">${soon.length ? money(soon.reduce((a, x) => a + Number(x.balance || 0), 0)) : '—'}</b></div><div class="dpt-kpi"><span>Trocas e devoluções</span><b>${rets.length}</b></div></div>
${list.length ? `<div style="overflow:auto"><table class="dpt-tb"><thead><tr><th>Vale</th><th>Origem</th><th class="r">Valor</th><th class="r">Saldo</th><th>Validade</th><th>Situação</th><th></th></tr></thead><tbody>${list.map(x => `<tr><td><span class="dpt-code">${esc(x.code)}</span><div class="dpt-small">${fmtD(x.createdAt)}</div></td><td>${esc(x.refLabel || SRC[x.source] || '—')}${x.note ? `<div class="dpt-small">${esc(x.note)}</div>` : ''}</td><td class="r">${money(x.amount)}</td><td class="r" style="font-weight:700">${money(x.balance)}</td><td>${x.expiresAt ? fmtD(x.expiresAt) : 'sem vencimento'}</td><td>${stateTag(x)}</td><td class="r" style="white-space:nowrap"><button type="button" class="btn-icon" title="Imprimir o vale" data-v="print" data-id="${esc(x.id)}"><i class="fas fa-print"></i></button>${isBoss() && ['open', 'expired'].includes(state(x)) && x.expiresAt ? ` <button type="button" class="btn-icon" title="Prorrogar a validade" data-v="ext" data-id="${esc(x.id)}"><i class="fas fa-calendar"></i></button>` : ''}</td></tr>`).join('')}</tbody></table></div>`
                        : '<div class="dpt-small" style="padding:10px 0">Este cliente ainda não tem vale-troca. O vale aparece aqui quando ele devolve uma peça (Troca / devolução) ou deixa um aparelho na troca.</div>'}
${rets.length ? `<div style="font-size:12px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px;margin:16px 0 6px">Trocas e devoluções</div>${rets.slice(0, 30).map(rt => `<div style="font-size:12.5px;color:var(--text-secondary);padding:5px 0;border-top:1px solid var(--border-color)"><b>${retNo(rt.number)}</b> · ${fmtDT(rt.createdAt)}${rt.saleNumber ? ' · venda #V-' + pad(rt.saleNumber) : ' · sem cupom'} · ${(rt.items || []).map(i => `${qtxt(i.qty)}x ${esc(i.name)}`).join(', ')} · <b>${money(rt.total)}</b> · ${esc(MODES[rt.mode] || rt.mode)} · ${esc(rt.reasonLabel || '')}</div>`).join('')}` : ''}
</div>`;
                body.querySelectorAll('[data-v]').forEach(b => b.addEventListener('click', async () => {
                    const v = b.dataset.v, x = list.find(y => y.id === b.dataset.id);
                    if (v === 'print' && x) printCredit(x);
                    if (v === 'ext' && x) {
                        const c0 = await cfg(); if (!confirm(`Prorrogar o vale ${x.code} por mais ${c0.dias} dias (a partir de hoje)?`)) return;
                        const hist = (x.history || []).concat([{ type: 'extend', amount: 0, balanceAfter: Number(x.balance || 0), at: Date.now(), by: meName(), label: 'Validade prorrogada' }]);
                        await db.collection(COL).doc(x.id).update({ expiresAt: Date.now() + c0.dias * 864e5, status: Number(x.balance) > 0 ? 'open' : x.status, history: hist, updatedAt: TS() });
                        await syncBalance(c.id); toast('success', 'Validade prorrogada.'); refresh(c.id);
                    }
                    if (v === 'new') manualCredit(c, () => refresh(c.id));
                }));
            }
        });
    }
    async function manualCredit(c, done) {
        const c0 = await cfg();
        const W = overlay('dptMan', 'Lançar crédito para o cliente', 'fa-ticket', 460);
        W.B.innerHTML = `<p class="dpt-p">Para dar um crédito de cortesia, acertar um vale antigo de papel ou compensar um problema. Fica registrado com o seu nome.</p>
<div class="dpt-g2" style="margin-top:0"><label>Valor (R$)<input class="dpt-in" id="dptMV" inputmode="decimal" placeholder="0,00"></label><label>Validade (dias)<input class="dpt-in" id="dptMD" inputmode="numeric" value="${c0.dias}"></label></div>
<label class="dpt-lbl" style="margin-top:10px">Motivo<input class="dpt-in" id="dptMN" maxlength="160" placeholder="Ex.: vale de papel nº 123"></label>
<label class="dpt-chk"><input type="checkbox" id="dptMX"> Sem vencimento</label><div id="dptErr"></div>`;
        W.F.innerHTML = `<button type="button" class="btn btn-secondary" data-c>Cancelar</button><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Lançar crédito</button>`;
        W.F.querySelector('[data-c]').onclick = () => W.close();
        W.F.querySelector('[data-ok]').onclick = async e => {
            const v = r2(num($('dptMV').value)), why = $('dptMN').value.trim();
            if (!(v > 0)) { $('dptErr').innerHTML = '<div class="dpt-warn red">Informe o valor.</div>'; return; }
            if (!why) { $('dptErr').innerHTML = '<div class="dpt-warn red">Escreva o motivo.</div>'; return; }
            e.target.disabled = true;
            try { const cr = await createCredit({ customerId: c.id, customerName: c.name, amount: v, source: 'manual', refLabel: 'Crédito lançado: ' + why, note: why, expires: !$('dptMX').checked, days: Number($('dptMD').value) || c0.dias }); W.close(); toast('success', `Vale ${cr.code} de ${money(v)} lançado.`); done && done(cr); }
            catch (err) { $('dptErr').innerHTML = `<div class="dpt-warn red">${esc(err.message)}</div>`; e.target.disabled = false; }
        };
    }

    /* ============================ Relatórios ============================ */
    function setupReports() {
        if (!/relatorios\.html$/i.test(location.pathname)) return;
        css();
        let active = null;
        const range = () => {
            const f = $('rptDateFrom'), t = $('rptDateTo');
            const a = f && f.value ? new Date(f.value + 'T00:00:00') : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
            const b = t && t.value ? new Date(t.value + 'T23:59:59.999') : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
            return { a, b };
        };
        let csv = null;
        const stat = (t, v, c, sub) => `<div class="card" style="padding:16px;text-align:center;border-top:3px solid ${c}"><div style="font-size:12px;color:var(--text-muted)">${t}</div><div style="font-size:21px;font-weight:800;color:${c};margin-top:4px">${v}</div>${sub ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${sub}</div>` : ''}</div>`;
        const head = (icon, color, title, sub, per) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:17px;font-weight:700;color:var(--text-primary)"><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${title}</h3><div style="font-size:12px;color:var(--text-muted);margin-top:3px">${sub}</div></div><span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${per}</span></div>`;
        async function rptTrocas() {
            const { a, b } = range();
            let rets = []; try { rets = docs(await db.collection(RCOL).get()).filter(r => !r.deleted && ms(r.createdAt) >= a.getTime() && ms(r.createdAt) <= b.getTime()); } catch (e) { }
            rets.sort((x, y) => ms(y.createdAt) - ms(x.createdAt));
            const sum = l => r2(l.reduce((s, r) => s + Number(r.total || 0), 0));
            const byMode = k => rets.filter(r => r.mode === k);
            const pcs = rets.reduce((s, r) => s + (r.items || []).reduce((t, i) => t + Number(i.qty || 0), 0), 0);
            const reasons = {}; rets.forEach(r => { const k = r.reasonLabel || r.reason || 'Outro'; reasons[k] = reasons[k] || { n: 0, v: 0 }; reasons[k].n++; reasons[k].v += Number(r.total || 0); });
            const prods = {}; rets.forEach(r => (r.items || []).forEach(i => { const k = i.name || 'Item'; prods[k] = prods[k] || { q: 0, v: 0 }; prods[k].q += Number(i.qty || 0); prods[k].v += Number(i.total || 0); }));
            const top = Object.entries(prods).sort((x, y) => y[1].q - x[1].q).slice(0, 10);
            csv = [['Data', 'Devolucao', 'Venda', 'Cliente', 'Pecas', 'Motivo', 'Destino', 'Vale', 'Valor', 'Atendente'], ...rets.map(r => [fmtDT(r.createdAt), retNo(r.number), r.saleNumber ? '#V-' + pad(r.saleNumber) : 'sem cupom', r.customerName || '', (r.items || []).map(i => `${qtxt(i.qty)}x ${i.name}`).join(' | '), r.reasonLabel || '', MODES[r.mode] || r.mode, r.creditCode || '', r2(r.total).toFixed(2), r.byName || ''])];
            $('reportArea').innerHTML = `<div class="card" style="padding:20px">${head('fa-arrow-right-arrow-left', '#f59e0b', 'Trocas e devoluções', 'Peças que voltaram no período, o motivo e para onde foi o valor', `${a.toLocaleDateString('pt-BR')} a ${b.toLocaleDateString('pt-BR')}`)}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">${stat('Devoluções', rets.length, '#f59e0b', qtxt(pcs) + ' peça(s)')}${stat('Valor devolvido', money(sum(rets)), '#ef4444')}${stat('Em vale-troca', money(sum(byMode('credito'))), '#10b981', byMode('credito').length + ' vale(s)')}${stat('Em dinheiro', money(sum(byMode('dinheiro'))), '#6366f1', 'saiu do caixa')}${stat('Abatido no fiado', money(sum(byMode('abater_fiado'))), '#0ea5e9')}</div>
<div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;margin-bottom:18px" class="dpt-rgrid">
<div><h4 style="font-size:14px;margin:0 0 8px;color:var(--text-primary)">Por motivo</h4><table class="data-table"><thead><tr><th>Motivo</th><th style="text-align:right">Qtd.</th><th style="text-align:right">Valor</th></tr></thead><tbody>${Object.entries(reasons).sort((x, y) => y[1].n - x[1].n).map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${v.n}</td><td style="text-align:right">${money(v.v)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">—</td></tr>'}</tbody></table></div>
<div><h4 style="font-size:14px;margin:0 0 8px;color:var(--text-primary)">Peças que mais voltam</h4><table class="data-table"><thead><tr><th>Peça</th><th style="text-align:right">Qtd.</th><th style="text-align:right">Valor</th></tr></thead><tbody>${top.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:right">${qtxt(v.q)}</td><td style="text-align:right">${money(v.v)}</td></tr>`).join('') || '<tr><td colspan="3" style="text-align:center;color:var(--text-muted)">—</td></tr>'}</tbody></table></div></div>
<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Data</th><th>Nº</th><th>Venda</th><th>Cliente</th><th>Peças</th><th>Motivo</th><th>Destino</th><th style="text-align:right">Valor</th><th>Atendente</th></tr></thead><tbody>
${rets.length ? rets.slice(0, 1000).map(r => `<tr><td>${fmtDT(r.createdAt)}</td><td><b>${retNo(r.number)}</b></td><td>${r.saleNumber ? '#V-' + pad(r.saleNumber) : '<span style="color:var(--text-muted)">sem cupom</span>'}</td><td>${esc(r.customerName || 'Ao portador')}</td><td>${(r.items || []).map(i => `${qtxt(i.qty)}x ${esc(i.name)}`).join('<br>')}</td><td>${esc(r.reasonLabel || '')}${r.note ? `<div style="font-size:11px;color:var(--text-muted)">${esc(r.note)}</div>` : ''}</td><td>${esc(MODES[r.mode] || r.mode)}${r.creditCode ? `<div class="dpt-code" style="font-size:11px">${esc(r.creditCode)}</div>` : ''}</td><td style="text-align:right;font-weight:700">${money(r.total)}</td><td>${esc(r.byName || '')}</td></tr>`).join('') : '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma troca ou devolução neste período.</td></tr>'}
</tbody></table></div>
<p style="font-size:11.5px;color:var(--text-muted);margin-top:14px"><i class="fas fa-circle-info"></i> A troca/devolução é feita no PDV (botão Troca / devolução) ou nos detalhes da venda, em Pedidos.</p></div><style>@media(max-width:800px){.dpt-rgrid{grid-template-columns:1fr!important}}</style>`;
        }
        async function rptVales() {
            const { a, b } = range();
            const all = await allCredits();
            const open = all.filter(c => state(c) === 'open').sort((x, y) => (Number(x.expiresAt) || 9e15) - (Number(y.expiresAt) || 9e15));
            const exp = all.filter(c => state(c) === 'expired' && Number(c.balance) > 0);
            const soon = open.filter(c => c.expiresAt && Number(c.expiresAt) - Date.now() < 30 * 864e5);
            let usedP = 0, createdP = 0;
            all.forEach(c => (c.history || []).forEach(h => { const t = Number(h.at) || 0; if (t < a.getTime() || t > b.getTime()) return; if (h.type === 'use') usedP += Number(h.amount || 0); if (h.type === 'refund') usedP -= Number(h.amount || 0); if (h.type === 'create') createdP += Number(h.amount || 0); }));
            const bal = l => r2(l.reduce((s, c) => s + Number(c.balance || 0), 0));
            const days = c => c.expiresAt ? Math.ceil((Number(c.expiresAt) - Date.now()) / 864e5) : null;
            csv = [['Vale', 'Cliente', 'Origem', 'Criado em', 'Valor', 'Saldo', 'Vence em', 'Situacao'], ...open.concat(exp).map(c => [c.code, c.customerName || 'Ao portador', c.refLabel || SRC[c.source] || '', fmtD(c.createdAt), r2(c.amount).toFixed(2), r2(c.balance).toFixed(2), c.expiresAt ? fmtD(c.expiresAt) : 'sem vencimento', (STATE[state(c)] || [''])[0]])];
            const row = c => { const d = days(c); return `<tr><td><span class="dpt-code">${esc(c.code)}</span></td><td>${esc(c.customerName || 'Ao portador')}</td><td>${esc(c.refLabel || SRC[c.source] || '')}</td><td>${fmtD(c.createdAt)}</td><td style="text-align:right">${money(c.amount)}</td><td style="text-align:right;font-weight:700">${money(c.balance)}</td><td>${c.expiresAt ? fmtD(c.expiresAt) + (d !== null ? ` <span class="dpt-tag ${d < 0 ? 'bad' : d <= 30 ? '' : 'mute'}">${d < 0 ? 'venceu há ' + Math.abs(d) + ' dia(s)' : d === 0 ? 'vence hoje' : 'faltam ' + d + ' dia(s)'}</span>` : '') : 'sem vencimento'}</td><td style="text-align:right"><button type="button" class="btn-icon" title="Imprimir" data-pr="${esc(c.id)}"><i class="fas fa-print"></i></button></td></tr>`; };
            $('reportArea').innerHTML = `<div class="card" style="padding:20px">${head('fa-ticket', '#10b981', 'Vales em aberto', 'Crédito que os clientes têm para gastar na loja (é um valor que a loja deve em mercadoria)', 'hoje · uso e emissão no período ' + a.toLocaleDateString('pt-BR') + ' a ' + b.toLocaleDateString('pt-BR'))}
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:20px">${stat('Saldo em aberto', money(bal(open)), '#10b981', open.length + ' vale(s)')}${stat('Vencem em 30 dias', money(bal(soon)), '#f59e0b', soon.length + ' vale(s)')}${stat('Vencidos com saldo', money(bal(exp)), '#ef4444', exp.length + ' vale(s)')}${stat('Emitido no período', money(createdP), '#6366f1')}${stat('Usado no período', money(usedP), '#0ea5e9')}</div>
<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Vale</th><th>Cliente</th><th>Origem</th><th>Criado</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th><th>Validade</th><th></th></tr></thead><tbody>
${open.length ? open.map(row).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum vale em aberto.</td></tr>'}
</tbody></table></div>
${exp.length ? `<h4 style="font-size:14px;margin:20px 0 8px;color:var(--text-primary)">Vencidos com saldo</h4><div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Vale</th><th>Cliente</th><th>Origem</th><th>Criado</th><th style="text-align:right">Valor</th><th style="text-align:right">Saldo</th><th>Validade</th><th></th></tr></thead><tbody>${exp.map(row).join('')}</tbody></table></div><p style="font-size:11.5px;color:var(--text-muted);margin-top:8px">Para aceitar um vale vencido, prorrogue a validade na ficha do cliente (aba Vales e créditos).</p>` : ''}</div>`;
            $('reportArea').querySelectorAll('[data-pr]').forEach(x => x.addEventListener('click', () => printCredit(x.dataset.pr)));
        }
        const RPT = { trocas: rptTrocas, vales: rptVales };
        async function run(type) {
            active = type;
            document.querySelectorAll('[onclick*="showReport"]').forEach(el => { el.style.borderColor = 'transparent'; });
            const card = document.querySelector(`[onclick="showReport('${type}')"]`); if (card) card.style.borderColor = 'var(--accent)';
            const area = $('reportArea'); if (!area) return;
            area.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:16px">Gerando relatório...</div></div>';
            if (window.__dpRptOpened) area.scrollIntoView({ behavior: 'smooth', block: 'start' });
            window.__dpRptOpened = true;
            try { await RPT[type](); } catch (e) { console.error(e); area.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:#ef4444">Erro ao carregar relatório: ${esc(e.message)}</div>`; }
        }
        function wrap() {
            const orig = window.showReport;
            if (typeof orig !== 'function' || orig.__dpTrocas) return typeof orig === 'function';
            const mine = async function (type) { if (RPT[type]) return run(type); active = null; return orig.apply(this, arguments); };
            mine.__dpTrocas = true; if (orig.__dpCartao) mine.__dpCartao = true;
            window.showReport = mine;
            const oGen = window.gerarRelatorio;
            if (typeof oGen === 'function' && !oGen.__dpTrocas) { const g = function () { if (active) return run(active); return oGen.apply(this, arguments); }; g.__dpTrocas = true; window.gerarRelatorio = g; }
            const oCsv = window.exportarCSV;
            if (typeof oCsv === 'function' && !oCsv.__dpTrocas) {
                const x = function () {
                    if (!active || !csv) return oCsv.apply(this, arguments);
                    const txt = csv.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
                    const blob = new Blob(['﻿' + txt], { type: 'text/csv;charset=utf-8' }), a = document.createElement('a');
                    a.href = URL.createObjectURL(blob); a.download = `${active === 'trocas' ? 'trocas-e-devolucoes' : 'vales-em-aberto'}.csv`; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
                };
                x.__dpTrocas = true; window.exportarCSV = x;
            }
            return true;
        }
        function cards() {
            if (document.querySelector(`[onclick="showReport('trocas')"]`)) return true;
            const ref = document.querySelector(`[onclick="showReport('consignado')"]`) || document.querySelector(`[onclick="showReport('receber')"]`) || document.querySelector(`[onclick="showReport('vendas')"]`);
            if (!ref) return false;
            const mk = (type, icon, color, rgb, title, sub) => { const c = document.createElement('div'); c.className = 'card'; c.style.cssText = 'cursor:pointer;border:2px solid transparent;transition:all .2s'; c.setAttribute('onclick', `showReport('${type}')`); c.setAttribute('onmouseover', `this.style.borderColor='${color}'`); c.setAttribute('onmouseout', "this.style.borderColor='transparent'"); c.innerHTML = `<div style="display:flex;align-items:center;gap:14px;margin-bottom:10px"><div style="width:46px;height:46px;border-radius:12px;background:rgba(${rgb},.12);display:flex;align-items:center;justify-content:center;flex-shrink:0"><i class="fas ${icon}" style="font-size:20px;color:${color}"></i></div><div><div style="font-weight:700;font-size:15px;color:var(--text-heading)">${title}</div><div style="font-size:11px;color:var(--text-muted)">${sub}</div></div></div>`; return c; };
            const c1 = mk('trocas', 'fa-arrow-right-arrow-left', '#f59e0b', '245,158,11', 'Trocas e devoluções', 'Peças que voltaram, motivo e destino do valor');
            const c2 = mk('vales', 'fa-ticket', '#10b981', '16,185,129', 'Vales em aberto', 'Crédito dos clientes, vencimentos e uso');
            ref.parentElement.insertBefore(c1, ref.nextSibling); c1.parentElement.insertBefore(c2, c1.nextSibling);
            return true;
        }
        let n = 0; const t = setInterval(() => { const ok = wrap() && cards(); if (ok || ++n > 80) clearInterval(t); }, 300);
        setInterval(() => { if (window.showReport && !window.showReport.__dpTrocas) wrap(); }, 2000);
    }

    /* ============================ seminovo vendido baixa sozinho ============================ */
    async function markDevicesSold(data, r) {
        if (!data || !r || !r.id || !Array.isArray(data.items)) return;
        let list = []; try { if (Array.isArray(products)) list = products; } catch (e) { }
        const sub = Number(data.subtotal) || data.items.reduce((a, i) => a + Number(i.total || 0), 0);
        const f = sub > 0 ? Math.max(0, Math.min(1, (sub - Number(data.discount || 0)) / sub)) : 1;
        for (const it of data.items) {
            if (!it.productId) continue;
            const p = list.find(x => x.id === it.productId) || {};
            if (!(p.usedPurchaseId || /^USADO-\d+/i.test(String(p.code || it.productCode || '')))) continue;
            try {
                let dp = null;
                if (p.usedPurchaseId) { const d = await db.collection('device_purchases').doc(p.usedPurchaseId).get(); if (d.exists) dp = { id: d.id, ...d.data() }; }
                if (!dp) dp = docs(await db.collection('device_purchases').where('productId', '==', it.productId).get()).find(x => !x.deleted && x.status === 'purchased') || null;
                if (!dp || dp.status !== 'purchased') continue;
                const price = r2(Number(it.total || 0) * f / Math.max(1, Number(it.quantity) || 1));
                await db.collection('device_purchases').doc(dp.id).set({ status: 'sold', saleId: r.id, saleNumber: r.saleNumber || 0, soldAt: Date.now(), soldPrice: price, profit: r2(price - Number(dp.offeredPrice || 0)), soldTo: data.customerName || '', soldBy: meName(), updatedAt: TS() }, { merge: true });
            } catch (e) { console.warn('seminovo não baixou', e); }
        }
    }
    function setupSaleHook() {
        if (typeof SalesService === 'undefined' || !SalesService || typeof SalesService.create !== 'function' || SalesService.__dpTrocasDev) return;
        SalesService.__dpTrocasDev = true;
        const o = SalesService.create;
        SalesService.create = async function (data) {
            const r = await o.apply(this, arguments);
            try { if (data && data.status !== 'cancelled') await markDevicesSold(data, r); } catch (e) { }
            return r;
        };
    }

    window.DPTrocas = { openReturn, doReturn, createCredit, useCredit, getCredit, byCode, creditsOf, allCredits, syncBalance, findOrCreateCustomer, onSaleCancelled, printCredit, printSlip, barcodeSvg, normCode, state, cfg, linesOf, markDevicesSold };
    const start = () => {
        try { setupSaleHook(); } catch (e) { console.warn('trocas', e); }
        try { setupPdv(); } catch (e) { console.warn('trocas pdv', e); }
        try { setupPedidos(); } catch (e) { console.warn('trocas pedidos', e); }
        try { setupClientes(); } catch (e) { console.warn('trocas clientes', e); }
        try { setupReports(); } catch (e) { console.warn('trocas relatórios', e); }
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
