/* DistribuiPro 37.1 · Formas de pagamento: cadastrar, ativar e desativar.
   - As 5 de sempre (Dinheiro, PIX, Crédito, Débito, Fiado) continuam em settings/general.formasPagamentoAtivas.
   - As novas (ex.: Vale-alimentação, Boleto, Transferência, Cheque) ficam em settings/general.formasPagamentoExtras:
     [{ id, name, kind: 'dinheiro'|'pix'|'credito'|'debito'|'outro', fee (%), active }]
   - No PDV as novas aparecem como botões (e no pagamento dividido); a taxa delas entra no relatório de cartão.
   window.DPPayMethods = { load, extras, active, label, kindOf } */
(function () {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const BASE = [['dinheiro', 'Dinheiro', 'fa-money-bill-wave'], ['pix', 'PIX', 'fa-qrcode'], ['credito', 'Cartão de crédito', 'fa-credit-card'], ['debito', 'Cartão de débito', 'fa-credit-card'], ['fiado', 'Fiado / a receber', 'fa-handshake']];
    const KINDS = { dinheiro: ['Dinheiro / vale', 'fa-money-bill-wave'], pix: ['Pix / transferência', 'fa-qrcode'], credito: ['Cartão de crédito', 'fa-credit-card'], debito: ['Cartão de débito', 'fa-credit-card'], outro: ['Outro', 'fa-wallet'] };
    // 38.3 · Forma base "vale" (Vale-troca / crédito do cliente): o PDV e a troca/devolução ficam em trocas-v1.js.
    // Não conta como dinheiro no caixa. Liga/desliga: settings/general.valeTrocaAtivo; validade: valeDias (padrão 90).
    const VALE = ['vale', 'Vale-troca / crédito', 'fa-ticket'];
    const CK = 'dp_pay_extras';
    let cache = null, activeBase = null, valeCfg = { on: true, dias: 90 };
    try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c) { cache = c.extras || []; activeBase = c.base || null; if (c.vale) valeCfg = c.vale; } } catch (e) { }
    const ref = () => db.collection('settings').doc('general');
    async function load() {
        try {
            const s = await ref().get(); const g = s.exists ? (s.data() || {}) : {};
            cache = (Array.isArray(g.formasPagamentoExtras) ? g.formasPagamentoExtras : []).filter(x => x && x.id && x.name);
            activeBase = Array.isArray(g.formasPagamentoAtivas) && g.formasPagamentoAtivas.length ? g.formasPagamentoAtivas : ['dinheiro', 'pix', 'debito', 'credito', 'fiado'];
            valeCfg = { on: g.valeTrocaAtivo !== false, dias: Math.max(1, Math.round(Number(g.valeDias) || 90)) };
            try { localStorage.setItem(CK, JSON.stringify({ extras: cache, base: activeBase, vale: valeCfg })); } catch (e) { }
        } catch (e) { cache = cache || []; }
        return cache;
    }
    const extras = () => cache || [];
    const label = id => { if (id === VALE[0]) return VALE[1]; const b = BASE.find(x => x[0] === id); if (b) return b[1]; const x = extras().find(e => e.id === id); return x ? x.name : ''; };
    const kindOf = id => id === VALE[0] ? 'vale' : BASE.some(b => b[0] === id) ? id : ((extras().find(e => e.id === id) || {}).kind || 'outro');
    window.DPPayMethods = { load, extras, label, kindOf, active: () => extras().filter(e => e.active !== false), vale: () => valeCfg };
    const slug = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 30) || 'forma';

    /* ---------------- PDV ---------------- */
    function pdv() {
        if (typeof window.selectPayment !== 'function') return;
        const box = document.querySelector('.payment-methods'); if (!box) return;
        const paint = () => {
            box.querySelectorAll('.pay-method[data-extra]').forEach(b => b.remove());
            const multi = [...box.querySelectorAll('.pay-method')].find(b => /'multi'/.test(b.getAttribute('onclick') || ''));
            window.DPPayMethods.active().forEach(x => {
                const b = document.createElement('button'); b.className = 'pay-method'; b.dataset.extra = x.id;
                b.setAttribute('onclick', `selectPayment('${x.id}',this)`);
                b.innerHTML = `<i class="fas ${(KINDS[x.kind] || KINDS.outro)[1]}"></i>${esc(x.name)}`;
                box.insertBefore(b, multi || null);
            });
        };
        // Taxa das formas novas e nome no pagamento dividido / comprovante
        if (typeof window.calcPaymentFeeFor === 'function' && !window.calcPaymentFeeFor.__dpx) {
            const o = window.calcPaymentFeeFor;
            window.calcPaymentFeeFor = function (method, amount) { const x = extras().find(e => e.id === method); if (x) { const pct = Number(x.fee) || 0; return { pct, value: Number(amount || 0) * pct / 100 }; } return o.apply(this, arguments); };
            window.calcPaymentFeeFor.__dpx = true;
        }
        if (typeof window.getActiveSplitMethods === 'function' && !window.getActiveSplitMethods.__dpx) {
            const o = window.getActiveSplitMethods;
            window.getActiveSplitMethods = function () { const l = o.apply(this, arguments) || []; return l.concat(window.DPPayMethods.active().map(x => x.id).filter(id => !l.includes(id))); };
            window.getActiveSplitMethods.__dpx = true;
        }
        if (typeof window.splitMethodLabel === 'function' && !window.splitMethodLabel.__dpx) {
            const o = window.splitMethodLabel;
            window.splitMethodLabel = function (m) { const x = extras().find(e => e.id === m); return x ? x.name : o.apply(this, arguments); };
            window.splitMethodLabel.__dpx = true;
        }
        // A página esconde os botões que não estão na lista das 5: as novas voltam a aparecer
        if (typeof window.applyActivePaymentMethods === 'function' && !window.applyActivePaymentMethods.__dpx) {
            const o = window.applyActivePaymentMethods;
            window.applyActivePaymentMethods = function () { const r = o.apply(this, arguments); box.querySelectorAll('.pay-method[data-extra]').forEach(b => { b.style.display = ''; }); return r; };
            window.applyActivePaymentMethods.__dpx = true;
        }
        paint();
        load().then(paint);
    }

    /* ---------------- Configurações › Vendas ---------------- */
    function cfg(tries) {
        const host = document.getElementById('paymentMethodsBadges');
        if (!host) { if (tries < 40) setTimeout(() => cfg(tries + 1), 250); return; }
        if (document.getElementById('dpxPayCfg')) return;
        const card = document.createElement('div'); card.id = 'dpxPayCfg';
        card.style.cssText = 'margin-top:14px;padding:14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-secondary)';
        (host.closest('.cfg-section, .card, .form-group') || host.parentElement).appendChild(card);
        const st = document.createElement('style');
        st.textContent = `#dpxPayCfg h5{margin:0 0 2px;font-size:14px;color:var(--text-heading)}#dpxPayCfg>p{margin:0 0 10px;font-size:12px;color:var(--text-muted)}
.dpx-row{display:grid;grid-template-columns:28px 1fr 150px 90px auto auto;gap:8px;align-items:center;padding:8px 0;border-top:1px solid var(--border-color)}
.dpx-row:first-of-type{border-top:0}.dpx-row i.ic{color:var(--accent);text-align:center}.dpx-row .nm{font-weight:600;font-size:13px}.dpx-row small{display:block;color:var(--text-muted);font-size:11px;font-weight:400}
.dpx-row input,.dpx-row select{height:34px;padding:4px 8px;font-size:13px}
.dpx-sw{position:relative;width:42px;height:24px;flex:none}.dpx-sw input{opacity:0;width:0;height:0}.dpx-sw span{position:absolute;inset:0;border-radius:20px;background:var(--border-color);cursor:pointer;transition:.2s}.dpx-sw span:before{content:'';position:absolute;width:18px;height:18px;left:3px;top:3px;border-radius:50%;background:#fff;transition:.2s}.dpx-sw input:checked+span{background:var(--success,#10b981)}.dpx-sw input:checked+span:before{transform:translateX(18px)}
.dpx-new{display:grid;grid-template-columns:1fr 160px 100px auto;gap:8px;margin-top:10px}
@media(max-width:700px){.dpx-row{grid-template-columns:24px 1fr auto auto}.dpx-row .k,.dpx-row .f{display:none}.dpx-new{grid-template-columns:1fr 1fr}}`;
        document.head.appendChild(st);
        const getBase = () => (window._getActivePayMethods ? window._getActivePayMethods() : (activeBase || BASE.map(b => b[0])));
        const setBase = arr => { if (window._setActivePayMethods) window._setActivePayMethods(arr); };
        async function save(data, msg) {
            try { await ref().set({ ...data, updatedAt: (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp() }, { merge: true }); toast('success', msg || 'Formas de pagamento salvas'); }
            catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            await load(); paint();
        }
        const sw = (on, attrs) => `<label class="dpx-sw" title="${on ? 'Ativa: aparece no PDV' : 'Desativada: não aparece no PDV'}"><input type="checkbox" ${on ? 'checked' : ''} ${attrs}><span></span></label>`;
        function paint() {
            const base = getBase(), ex = extras();
            card.innerHTML = `<h5><i class="fas fa-wallet" style="color:var(--accent);margin-right:6px"></i>Formas de pagamento</h5><p>Ative ou desative o que aparece no PDV e cadastre formas novas (vale-alimentação, boleto, transferência, cheque…). Salva na hora.</p>
${BASE.map(([id, nm, ic]) => `<div class="dpx-row"><i class="fas ${ic} ic"></i><div class="nm">${nm}<small>Padrão do sistema</small></div><div class="k"></div><div class="f"></div><span></span>${sw(base.includes(id), `data-base="${id}"`)}</div>`).join('')}
<div class="dpx-row"><i class="fas ${VALE[2]} ic"></i><div class="nm">${VALE[1]}<small>Troca, devolução e aparelho na troca · não entra como dinheiro no caixa</small></div><div class="k" style="display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted)">Validade <input type="number" min="1" max="3650" value="${valeCfg.dias}" data-vdias title="Dias que o vale-troca vale" style="width:62px"> dias</div><div class="f"></div><span></span>${sw(valeCfg.on, 'data-vale-on')}</div>
${ex.map(x => `<div class="dpx-row" data-id="${esc(x.id)}"><i class="fas ${(KINDS[x.kind] || KINDS.outro)[1]} ic"></i><div class="nm"><input type="text" value="${esc(x.name)}" data-f="name" maxlength="40"></div><select class="k" data-f="kind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${x.kind === k ? 'selected' : ''}>${v[0]}</option>`).join('')}</select><div class="f" style="display:flex;align-items:center;gap:4px"><input type="number" min="0" max="30" step="0.01" value="${Number(x.fee || 0)}" data-f="fee" title="Taxa em %" style="width:70px">%</div><button type="button" class="btn-icon btn-danger" data-del title="Excluir"><i class="fas fa-trash"></i></button>${sw(x.active !== false, 'data-ex')}</div>`).join('')}
<div class="dpx-new"><input type="text" id="dpxNewName" placeholder="Nova forma de pagamento (ex.: Vale-alimentação)" maxlength="40"><select id="dpxNewKind">${Object.entries(KINDS).map(([k, v]) => `<option value="${k}">${v[0]}</option>`).join('')}</select><input type="number" id="dpxNewFee" min="0" max="30" step="0.01" placeholder="Taxa %"><button type="button" class="btn btn-primary btn-sm" id="dpxAdd"><i class="fas fa-plus"></i> Cadastrar</button></div>`;
            card.querySelectorAll('[data-base]').forEach(c => c.addEventListener('change', async () => {
                let arr = getBase().filter(m => m !== c.dataset.base); if (c.checked) arr.push(c.dataset.base);
                arr = BASE.map(b => b[0]).filter(m => arr.includes(m));
                if (!arr.length && !extras().some(x => x.active !== false)) { c.checked = true; toast('warning', 'Deixe pelo menos uma forma de pagamento ativa.'); return; }
                setBase(arr); await save({ formasPagamentoAtivas: arr.length ? arr : ['dinheiro'] }, c.checked ? 'Forma de pagamento ativada' : 'Forma de pagamento desativada');
            }));
            card.querySelector('[data-vale-on]')?.addEventListener('change', e => save({ valeTrocaAtivo: e.target.checked }, e.target.checked ? 'Vale-troca ativado' : 'Vale-troca desativado (sai do PDV)'));
            card.querySelector('[data-vdias]')?.addEventListener('change', e => { const d = Math.max(1, Math.min(3650, Math.round(Number(e.target.value) || 90))); save({ valeDias: d }, `O vale-troca passa a valer ${d} dias`); });
            const list = () => extras().map(x => ({ ...x }));
            card.querySelectorAll('.dpx-row[data-id]').forEach(row => {
                const id = row.dataset.id, upd = async (patch, msg) => { const l = list().map(x => x.id === id ? { ...x, ...patch } : x); await save({ formasPagamentoExtras: l }, msg); };
                row.querySelector('[data-ex]').addEventListener('change', e => upd({ active: e.target.checked }, e.target.checked ? 'Forma ativada' : 'Forma desativada'));
                row.querySelector('[data-f=name]').addEventListener('change', e => { const v = e.target.value.trim(); if (v.length < 2) { toast('warning', 'Dê um nome para a forma de pagamento.'); paint(); return; } upd({ name: v }); });
                row.querySelector('[data-f=kind]').addEventListener('change', e => upd({ kind: e.target.value }));
                row.querySelector('[data-f=fee]').addEventListener('change', e => upd({ fee: Math.max(0, Math.min(30, Number(String(e.target.value).replace(',', '.')) || 0)) }));
                row.querySelector('[data-del]').addEventListener('click', async () => { if (!confirm('Excluir esta forma de pagamento? As vendas antigas continuam com o nome dela.')) return; await save({ formasPagamentoExtras: list().filter(x => x.id !== id) }, 'Forma de pagamento excluída'); });
            });
            card.querySelector('#dpxAdd').addEventListener('click', async () => {
                const nm = card.querySelector('#dpxNewName').value.trim(); if (nm.length < 2) { toast('warning', 'Digite o nome da forma de pagamento.'); return; }
                const l = list(); let id = 'pg_' + slug(nm); if (BASE.some(b => b[0] === id) || l.some(x => x.id === id)) id += '_' + Date.now().toString(36).slice(-4);
                if (l.some(x => x.name.toLowerCase() === nm.toLowerCase())) { toast('warning', 'Já existe uma forma com esse nome.'); return; }
                l.push({ id, name: nm, kind: card.querySelector('#dpxNewKind').value, fee: Math.max(0, Math.min(30, Number(String(card.querySelector('#dpxNewFee').value).replace(',', '.')) || 0)), active: true });
                await save({ formasPagamentoExtras: l }, 'Forma de pagamento cadastrada');
            });
        }
        paint(); load().then(paint);
    }

    const start = () => {
        if (document.querySelector('.payment-methods') && typeof window.selectPayment === 'function') pdv();
        if (/configuracoes\.html$/i.test(location.pathname)) cfg(0);
        else load();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
