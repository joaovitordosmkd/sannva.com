/* DistribuiPro 38.3 · Compras Pro (compras.html, todas as versões).
   - Prazo da compra ("28/35/42", "30/60/90", "3x30"): gera as parcelas e grava purchases.paymentTerms + installments
     [{n, of, days, dueDate:'AAAA-MM-DD', amount}]. O prazo do fornecedor (Fornecedores › Condições) já vem preenchido.
   - Receber compra: as parcelas viram contas em Contas a Pagar (financial_entries: fornecedor, vencimento, valor,
     origin:'purchase', purchaseId) e a compra guarda payableIds. À vista entra já paga (o fluxo de caixa mostra a saída).
     O DRE não conta como despesa (o custo da mercadoria entra no CMV quando ela é vendida).
   - Cancelar compra: cancela as contas em aberto e, se a mercadoria voltou, tira os itens do estoque (lotes desta compra primeiro).
   - Sugestão de compra: produtos abaixo do mínimo ou que acabam em menos de X dias (média de venda dos últimos 30 dias:
     vendas não canceladas, menos devoluções, mais as peças usadas em OS),
     por fornecedor (products.supplierId), arredondado para a embalagem de compra, descontando o que já está em compra pendente.
     Gera a compra (abre "Nova compra" preenchida) ou manda a lista no WhatsApp do fornecedor. */
(function () {
    'use strict';
    if (window.DPComprasPro) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const n3 = v => Math.round((Number(v) || 0) * 1000) / 1000;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qf = v => n3(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const tsOf = d => (window.DPTimestamp || firebase.firestore.Timestamp).fromDate(d);
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const ymd = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
    const dOf = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12) : null; };
    const toD = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.value || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const msOf = v => { const d = toD(v); return d ? d.getTime() : 0; };
    const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
    const br = s => { const d = dOf(s); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const plural = (n, a, b) => (Number(n) === 1 ? a : b);

    /* =================== Prazo e parcelas =================== */
    function parseTerms(s) {
        const t = String(s || '').toLowerCase().replace(/dias?/g, '').trim();
        if (!t || /vista/.test(t)) return [];
        const x = /^(\d{1,2})\s*x\s*(\d{1,3})$/.exec(t); // "3x30" = 30/60/90
        if (x) { const n = Math.min(24, +x[1]), step = +x[2]; return step > 0 ? Array.from({ length: n }, (_, i) => step * (i + 1)) : []; }
        const days = (t.match(/\d{1,3}/g) || []).map(Number).filter(d => d >= 0 && d <= 720);
        const out = [...new Set(days)].sort((a, b) => a - b).slice(0, 24);
        return out.length === 1 && out[0] === 0 ? [] : out;
    }
    function termsOfMethod(m) {
        const s = String(m || '');
        const mm = s.match(/(\d{1,3}(?:\s*\/\s*\d{1,3})*)\s*dias?/i);
        return mm ? parseTerms(mm[1]) : [];
    }
    function parcelas(total, days, base) {
        total = r2(total); const b = dOf(base) || new Date();
        if (!days || !days.length) return [{ n: 1, of: 1, days: 0, dueDate: ymd(b), amount: total }];
        const n = days.length, each = Math.floor(total / n * 100) / 100;
        return days.map((d, i) => ({ n: i + 1, of: n, days: d, dueDate: ymd(addDays(b, d)), amount: i === n - 1 ? r2(total - each * (n - 1)) : each }));
    }

    /* =================== Visual =================== */
    function css() {
        if ($('cproCss')) return;
        const st = document.createElement('style'); st.id = 'cproCss';
        st.textContent = `
.cpro-chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}
.cpro-chips button{border:1px solid var(--border-color);background:var(--bg-surface,transparent);color:var(--text-secondary);font-size:11px;font-weight:600;padding:3px 9px;border-radius:999px;cursor:pointer}
.cpro-chips button:hover{border-color:var(--accent);color:var(--accent)}
.cpro-parc{display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:10px 12px;border-radius:10px;background:var(--bg-secondary);font-size:12.5px;color:var(--text-secondary)}
.cpro-parc svg{width:15px;height:15px;color:var(--accent)}
.cpro-parc b{color:var(--text-primary)}
.cpro-p{display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:999px;background:var(--bg-card);border:1px solid var(--border-color);white-space:nowrap}
.cpro-p small{color:var(--accent);font-weight:800}
.cpro-parc .cpro-hint{flex-basis:100%;font-size:11px;color:var(--text-muted)}
.cpro-det{margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-secondary);font-size:13px}
.cpro-det>b{display:flex;align-items:center;gap:6px;margin-bottom:4px}
.cpro-det>b svg{width:15px;height:15px;color:var(--accent)}
.cpro-det div{display:grid;grid-template-columns:70px 1fr auto;gap:8px;padding:4px 0;border-top:1px solid var(--border-color)}
.cpro-det small{display:block;margin-top:6px;color:var(--text-muted);font-size:11.5px}
.cpro-btn svg{width:15px;height:15px}
.cpro-sug .modal{max-width:980px;width:100%}
.cpro-sug .modal-body{max-height:72vh;overflow:auto}
.cpro-intro{font-size:13px;color:var(--text-secondary);line-height:1.9;margin:0 0 12px}
.cpro-days{display:inline-flex;gap:4px;vertical-align:middle;margin:0 2px}
.cpro-days button{border:1px solid var(--border-color);background:var(--bg-surface,transparent);color:var(--text-secondary);font-weight:700;font-size:12px;padding:3px 10px;border-radius:999px;cursor:pointer}
.cpro-days button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.cpro-sum{display:flex;flex-wrap:wrap;gap:8px 18px;padding:10px 14px;border-radius:10px;background:var(--bg-secondary);font-size:13px;margin-bottom:14px}
.cpro-sum b{color:var(--text-heading,var(--text-primary))}
.cpro-g{border:1px solid var(--border-color);border-radius:14px;margin-bottom:14px;background:var(--bg-card);overflow:hidden}
.cpro-gh{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:12px 14px;border-bottom:1px solid var(--border-color);background:var(--bg-secondary)}
.cpro-gh b{display:block;font-size:14.5px;color:var(--text-heading,var(--text-primary))}
.cpro-gh small{font-size:12px;color:var(--text-muted)}
.cpro-ga{display:flex;gap:6px;flex-wrap:wrap}
.cpro-ga .btn{font-size:12px;padding:6px 12px;display:inline-flex;align-items:center;gap:6px}
.cpro-ga .btn svg{width:15px;height:15px}
.cpro-l{display:grid;grid-template-columns:22px minmax(0,1fr) 150px 84px 120px;gap:10px;align-items:center;padding:10px 14px;border-top:1px solid var(--border-color)}
.cpro-l:first-of-type{border-top:0}
.cpro-l.off{opacity:.45}
.cpro-l input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent)}
.cpro-l .nm b{display:block;font-size:13px;color:var(--text-primary)}
.cpro-l .nm small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.45}
.cpro-l .nm .why{color:#b45309;font-weight:600}
.cpro-l select,.cpro-l input[type=text]{width:100%;padding:6px 8px;font-size:12.5px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-input);color:var(--text-primary)}
.cpro-l input[type=text]{text-align:center;font-weight:700}
.cpro-l .tot{text-align:right;font-size:12px;color:var(--text-muted);line-height:1.4}
.cpro-l .tot b{display:block;font-size:13px;color:var(--text-primary)}
.cpro-empty{text-align:center;padding:36px 16px;color:var(--text-muted);font-size:13px;line-height:1.6}
.cpro-empty svg{width:34px;height:34px;opacity:.5;display:block;margin:0 auto 8px}
.cpro-chk{display:flex;align-items:flex-start;gap:10px;margin:12px 0;padding:12px 14px;border-radius:10px;background:var(--bg-secondary);cursor:pointer;font-size:13px}
.cpro-chk input{margin-top:2px;width:16px;height:16px;accent-color:var(--accent);flex:none}
.cpro-chk small{display:block;color:var(--text-muted);font-size:11.5px;margin-top:2px}
.cpro-ul{margin:0 0 10px;padding-left:18px;font-size:13px;line-height:1.6;color:var(--text-secondary)}
@media(max-width:760px){.cpro-l{grid-template-columns:22px minmax(0,1fr) 84px;grid-template-areas:"c n n" "c s q" "c t t"}.cpro-l>input[type=checkbox]{grid-area:c;align-self:start;margin-top:3px}.cpro-l .nm{grid-area:n}.cpro-l .pk{grid-area:s}.cpro-l .qt{grid-area:q}.cpro-l .tot{grid-area:t;text-align:left}.cpro-ga{width:100%}.cpro-ga .btn{flex:1;justify-content:center}.cpro-ga .btn[data-a=gen]{flex-basis:100%}}`;
        (document.head || document.documentElement).appendChild(st);
    }
    function overlay(id, title, icon, bodyHtml, cls) {
        css(); $(id)?.remove();
        const ov = document.createElement('div'); ov.id = id; ov.className = 'modal-overlay active ' + (cls || '');
        ov.innerHTML = `<div class="modal"><div class="modal-header"><h3 style="display:flex;align-items:center;gap:8px"><span style="display:inline-flex;color:var(--accent)">${icon}</span>${esc(title)}</h3><button class="modal-close" data-x aria-label="Fechar">${ic('x', 'times')}</button></div><div class="modal-body">${bodyHtml}</div><div class="modal-footer"></div></div>`;
        document.body.appendChild(ov);
        ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov.remove()));
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        return ov;
    }

    /* =================== Nova compra: prazo e parcelas =================== */
    let suppliersCache = null;
    async function suppliers() {
        if (suppliersCache) return suppliersCache;
        try { suppliersCache = (await db.collection('suppliers').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(s => !s.deleted); } catch (e) { suppliersCache = []; }
        return suppliersCache;
    }
    const modalEls = () => { const m = $('modalCompra'); if (!m) return {}; const sels = m.querySelectorAll('.form-grid select'); return { m, sup: sels[0], pay: sels[1], date: m.querySelector('.form-grid input[type=date]') }; };
    const isVista = v => /vista|pix|dinheiro/i.test(String(v || '')) && !/\d/.test(String(v || ''));
    function totalNow() {
        let t = 0; document.querySelectorAll('#purchaseItems tr').forEach(row => { t += (parseFloat(row.querySelector('.purch-qty')?.value || 0) || 0) * (parseFloat(row.querySelector('.purch-cost')?.value || 0) || 0); });
        return r2(t);
    }
    function drawParc() {
        const box = $('cproParc'), pz = $('cproPrazo'); if (!box || !pz) return;
        const { date } = modalEls(), days = parseTerms(pz.value), ps = parcelas(totalNow(), days, date && date.value);
        box.innerHTML = !days.length
            ? `${ic('wallet', 'wallet')}<span><b>À vista.</b> Quando a compra for recebida, entra em Contas a Pagar já paga, para o fluxo de caixa mostrar a saída.</span>`
            : `${ic('calendar-days', 'calendar')}<b>${ps.length} ${plural(ps.length, 'parcela', 'parcelas')}</b>${ps.map(p => `<span class="cpro-p"><small>${p.n}/${p.of}</small>${br(p.dueDate)} · ${money(p.amount)}</span>`).join('')}<span class="cpro-hint">Viram contas a pagar quando a compra for recebida. O vencimento conta da data da compra.</span>`;
    }
    function setPrazo(v, touched) { const pz = $('cproPrazo'); if (!pz) return; pz.value = v; if (touched !== undefined) pz.dataset.touched = touched ? '1' : ''; syncPay(); drawParc(); }
    function syncPay() {
        const { pay } = modalEls(), pz = $('cproPrazo'); if (!pay || !pz) return;
        const days = parseTerms(pz.value);
        if (days.length && isVista(pay.value)) pay.value = 'Boleto';
        if (!days.length && /^boleto/i.test(pay.value)) pay.value = [...pay.options].find(o => /vista/i.test(o.text)) ? [...pay.options].find(o => /vista/i.test(o.text)).value : pay.value;
    }
    function setupModal() {
        const { m, sup, pay, date } = modalEls();
        if (!m || !pay || $('cproPrazo')) return;
        css();
        if (![...pay.options].some(o => o.text === 'Boleto')) { const o = document.createElement('option'); o.text = 'Boleto'; pay.add(o, pay.options[2] || null); }
        const grp = document.createElement('div'); grp.className = 'form-group'; grp.id = 'cproPrazoGrp';
        grp.innerHTML = `<label>Prazo em dias</label><input type="text" id="cproPrazo" inputmode="numeric" placeholder="À vista (ou 28/35/42)" autocomplete="off"><div class="cpro-chips">${[['', 'À vista'], ['7', '7'], ['14', '14'], ['28', '28'], ['30', '30'], ['28/35/42', '28/35/42'], ['30/60/90', '30/60/90']].map(([v, l]) => `<button type="button" data-pz="${v}">${l}</button>`).join('')}</div>`;
        const payGrp = pay.closest('.form-group');
        payGrp.insertAdjacentElement('afterend', grp);
        const box = document.createElement('div'); box.className = 'cpro-parc'; box.id = 'cproParc'; box.style.gridColumn = '1 / -1';
        grp.insertAdjacentElement('afterend', box);
        const pz = $('cproPrazo');
        pz.addEventListener('input', () => { pz.dataset.touched = '1'; syncPay(); drawParc(); });
        grp.querySelector('.cpro-chips').addEventListener('click', e => { const b = e.target.closest('[data-pz]'); if (b) setPrazo(b.dataset.pz, true); });
        pay.addEventListener('change', () => { const v = pay.value; const d = (v.match(/(\d{1,3})\s*dias/i) || [])[1]; if (d) setPrazo(d, true); else if (isVista(v)) setPrazo('', true); else if (/^boleto/i.test(v) && !parseTerms(pz.value).length) setPrazo('28', true); else drawParc(); });
        if (sup) sup.addEventListener('change', async () => {
            if (pz.dataset.touched === '1') return;
            const s = (await suppliers()).find(x => x.id === sup.value);
            const days = s ? parseTerms(s.paymentTerms) : [];
            if (days.length) { setPrazo(days.join('/')); toast('info', `Prazo do fornecedor: ${days.join('/')} dias.`); }
        });
        if (date) date.addEventListener('change', drawParc);
        m.addEventListener('input', e => { if (e.target && e.target.closest && e.target.closest('#purchaseItems')) drawParc(); });
        const tot = $('purchaseTotal'); if (tot) new MutationObserver(drawParc).observe(tot, { childList: true, characterData: true, subtree: true });
        // "Nova Compra": prazo limpo e a data de hoje (antes o campo vinha com uma data fixa do modelo)
        document.querySelectorAll('[onclick*="modalCompra"]').forEach(b => { if (b.closest('#modalCompra')) return; b.addEventListener('click', () => { const d = modalEls().date; if (d) d.value = ymd(new Date()); setPrazo('', false); }); });
        if (date && (!date.value || date.value === '2026-04-05')) date.value = ymd(new Date());
        drawParc();
        // Botão "Sugestão de compra" ao lado de "Nova Compra"
        const right = document.querySelector('.toolbar .toolbar-right');
        if (right && !$('cproSugBtn')) {
            const b = document.createElement('button'); b.type = 'button'; b.id = 'cproSugBtn'; b.className = 'btn btn-outline cpro-btn';
            b.innerHTML = `${ic('lightbulb', 'lightbulb')} Sugestão de compra`; b.addEventListener('click', sugestao);
            right.insertBefore(b, right.firstChild);
        }
    }
    /** Campos novos da compra (chamado por savePurchase em pages.js). */
    function camposCompra(total, dateStr) {
        const pz = $('cproPrazo'); if (!pz) return {};
        const { pay } = modalEls(), forma = pay ? pay.value : '', days = parseTerms(pz.value);
        const out = { paymentTerms: days.join('/'), installments: parcelas(total, days, dateStr) };
        if (days.length) out.paymentMethod = (/^boleto/i.test(forma) || isVista(forma) ? 'Boleto' : forma) + ' ' + days.join('/') + ' dias';
        return out;
    }

    /* =================== Receber: lança em Contas a Pagar =================== */
    async function contasDaCompra(p) {
        let list = [];
        try { list = (await db.collection('financial_entries').where('purchaseId', '==', p.id).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { }
        if (!list.length && Array.isArray(p.payableIds)) for (const id of p.payableIds) { try { const d = await db.collection('financial_entries').doc(id).get(); if (d.exists) list.push({ id, ...d.data() }); } catch (e) { } }
        return list.filter(c => !c.deleted);
    }
    async function lancarContas(p) {
        if (Array.isArray(p.payableIds) && p.payableIds.length) return [];
        if (!(Number(p.total) > 0)) return []; // compra sem custo informado: nada a pagar
        if ((await contasDaCompra(p)).length) return []; // já lançadas (receber de novo depois de um erro)
        const pd = toD(p.purchaseDate) || toD(p.createdAt) || new Date();
        const ps = Array.isArray(p.installments) && p.installments.length ? p.installments : parcelas(p.total, termsOfMethod(p.paymentMethod), ymd(pd));
        const vistaMethod = /pix/i.test(p.paymentMethod || '') ? 'PIX' : /cart/i.test(p.paymentMethod || '') ? 'Cartão' : 'Dinheiro';
        const ids = [];
        for (const x of ps) {
            if (!(Number(x.amount) > 0)) continue;
            const paid = !(Number(x.days) > 0), due = dOf(x.dueDate) || new Date();
            const data = {
                type: 'expense', category: 'Fornecedores',
                description: `Compra #${p.purchaseNumber || ''} · ${p.supplierName || 'Fornecedor'}${x.of > 1 ? ` (${x.n}/${x.of})` : ''}`,
                amount: r2(x.amount), dueDate: tsOf(due), status: paid ? 'paid' : 'pending',
                paymentMethod: paid ? vistaMethod : 'Boleto', recurrence: '', notes: p.nfNumber ? 'NF ' + p.nfNumber : '',
                supplierId: p.supplierId || '', supplierName: p.supplierName || '',
                origin: 'purchase', purchaseId: p.id, purchaseNumber: p.purchaseNumber || '', installmentLabel: x.of > 1 ? `${x.n}/${x.of}` : '',
                deleted: false, createdAt: ts(), createdBy: uid(), ...(paid ? { paidAt: ts() } : {})
            };
            const ref = await db.collection('financial_entries').add(data); ids.push(ref.id);
        }
        const open = ps.filter(x => Number(x.days) > 0);
        if (open.length) toast('info', `${open.length} ${plural(open.length, 'conta lançada', 'contas lançadas')} em Contas a Pagar (${money(open.reduce((s, x) => s + Number(x.amount || 0), 0))}).`);
        else toast('info', 'Pagamento à vista lançado no financeiro.');
        return ids;
    }
    /** Depois de receber (chamado por receivePurchase em pages.js): contas a pagar + lotes. Devolve campos para a compra. */
    async function aoReceber(p, opts) {
        const out = {};
        try { const ids = await lancarContas(p); if (ids.length) out.payableIds = ids; }
        catch (e) { console.error(e); toast('warning', 'A compra entrou no estoque, mas as contas a pagar não foram lançadas: ' + e.message); }
        try { if (window.DPValidade && opts && Array.isArray(opts.lotes)) await DPValidade.lotesDaCompra(p, opts.lotes); }
        catch (e) { console.error(e); toast('warning', 'Lote e validade não foram gravados: ' + e.message); }
        try { if (window.DPSerial && opts && opts.seriais) await DPSerial.seriaisDaCompra(p, opts.seriais); } // 38.5 · IMEI/série de cada aparelho
        catch (e) { console.error(e); toast('warning', 'Os números dos aparelhos não foram gravados: ' + e.message); }
        return out;
    }

    /* =================== Cancelar / excluir =================== */
    async function cancelarContas(p, motivo) {
        const abertas = (await contasDaCompra(p)).filter(c => c.status === 'pending');
        for (const c of abertas) await db.collection('financial_entries').doc(c.id).update({ status: 'cancelled', cancelledAt: ts(), cancelReason: motivo || `Compra #${p.purchaseNumber || ''} cancelada` });
        return { n: abertas.length, total: r2(abertas.reduce((s, c) => s + Number(c.amount || 0), 0)) };
    }
    /** Lixeira da compra: as contas em aberto dela não ficam soltas no financeiro. */
    async function aoExcluir(p) {
        try { const r = await cancelarContas(p, `Compra #${p.purchaseNumber || ''} excluída`); if (r.n) toast('info', `${r.n} ${plural(r.n, 'conta a pagar em aberto foi cancelada', 'contas a pagar em aberto foram canceladas')}.`); } catch (e) { }
    }
    async function cancelar(p, reload) {
        if (!p) return;
        if (p.status === 'cancelled') { toast('info', 'Esta compra já está cancelada.'); return; }
        const contas = await contasDaCompra(p).catch(() => []);
        const abertas = contas.filter(c => c.status === 'pending'), pagas = contas.filter(c => c.status === 'paid');
        const sum = l => money(l.reduce((s, c) => s + Number(c.amount || 0), 0)), rec = p.status === 'received';
        const ov = overlay('cproCancel', `Cancelar compra #${p.purchaseNumber || ''}`, ic('ban', 'ban'), `
<p style="margin:0 0 8px;font-size:13px">${esc(p.supplierName || '')} · ${money(p.total)}</p>
<ul class="cpro-ul">${abertas.length ? `<li>${abertas.length} ${plural(abertas.length, 'conta a pagar em aberto', 'contas a pagar em aberto')} (${sum(abertas)}) ${plural(abertas.length, 'será cancelada', 'serão canceladas')}.</li>` : `<li>Nenhuma conta a pagar em aberto${rec ? '' : ' (a compra ainda não foi recebida)'}.</li>`}
${pagas.length ? `<li>${pagas.length} ${plural(pagas.length, 'parcela já paga', 'parcelas já pagas')} (${sum(pagas)}) ${plural(pagas.length, 'continua', 'continuam')} como ${plural(pagas.length, 'está', 'estão')}: combine a devolução com o fornecedor.</li>` : ''}
${rec ? '' : '<li>O estoque não muda: a mercadoria ainda não tinha entrado.</li>'}</ul>
${rec ? `<label class="cpro-chk"><input type="checkbox" id="cproDev" checked><span><b>Tirar do estoque os itens desta compra</b><small>A mercadoria voltou para o fornecedor. Desmarque se ela ficou na loja.</small></span></label>` : ''}
<div class="form-group"><label>Motivo (opcional)</label><input type="text" id="cproMot" maxlength="120" placeholder="Ex.: pedido errado, mercadoria avariada"></div>`);
        const ft = ov.querySelector('.modal-footer');
        ft.innerHTML = `<button class="btn btn-secondary" data-x>Voltar</button><button class="btn btn-danger" id="cproCancelOk">${ic('ban', 'ban')} Cancelar compra</button>`;
        ft.querySelector('[data-x]').addEventListener('click', () => ov.remove());
        const ok = $('cproCancelOk');
        ok.addEventListener('click', async () => {
            ok.disabled = true;
            const motivo = ($('cproMot').value || '').trim(), dev = rec && !!($('cproDev') && $('cproDev').checked);
            try {
                const r = await cancelarContas(p, motivo ? 'Compra cancelada: ' + motivo : '');
                if (dev) for (const it of (p.items || [])) {
                    if (!it.productId) continue;
                    if (window.DPValidade) DPValidade.preferir(it.productId, { purchaseId: p.id });
                    try { await StockService.exit(it.productId, Number(it.unitsTotal || it.quantity) || 0, `Cancelamento compra #${p.purchaseNumber || ''}${motivo ? ' — ' + motivo : ''}`, 'purchase_cancel', p.id); } catch (e) { console.warn('estoque:', e); }
                }
                if (dev && window.DPSerial) await DPSerial.onPurchaseCancelled(p, motivo); // 38.5 · os aparelhos (IMEI/série) desta compra saem da lista
                await db.collection('purchases').doc(p.id).update({ status: 'cancelled', cancelledAt: ts(), cancelledBy: uid(), cancelReason: motivo, stockReturned: dev });
                ov.remove();
                toast('success', `Compra #${p.purchaseNumber || ''} cancelada.${r.n ? ` ${r.n} ${plural(r.n, 'conta cancelada', 'contas canceladas')}.` : ''}${dev ? ' Itens retirados do estoque.' : ''}`);
                if (typeof reload === 'function') await reload();
            } catch (e) { ok.disabled = false; toast('error', 'Não deu para cancelar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
    }
    /** Bloco "Pagamento" na janela da compra (viewPurchase em pages.js). */
    function detalheHtml(p) {
        css();
        const pd = toD(p.purchaseDate) || toD(p.createdAt);
        const ps = Array.isArray(p.installments) && p.installments.length ? p.installments : (Number(p.total) > 0 ? parcelas(p.total, termsOfMethod(p.paymentMethod), pd ? ymd(pd) : '') : []);
        if (!ps.length) return '';
        const lbl = x => x.of > 1 ? x.n + '/' + x.of : (Number(x.days) > 0 ? 'Única' : 'À vista');
        const foot = p.status === 'cancelled' ? 'Compra cancelada: as contas em aberto foram canceladas.' : (p.payableIds && p.payableIds.length ? 'Lançadas em <a href="contas-pagar.html">Contas a Pagar</a>.' : p.status === 'pending' ? 'Viram contas a pagar quando a compra for recebida.' : '');
        return `<div class="cpro-det"><b>${ic('receipt-text', 'receipt')} Pagamento${p.paymentTerms ? ' · ' + esc(p.paymentTerms) + ' dias' : ''}</b>${ps.map(x => `<div><span>${lbl(x)}</span><span>${br(x.dueDate)}</span><b>${money(x.amount)}</b></div>`).join('')}${foot ? `<small>${foot}</small>` : ''}</div>`;
    }

    /* =================== Sugestão de compra =================== */
    const PKCODE = { caixa: 'cx', fardo: 'fd', pack: 'pk', kit: 'kt', duzia: 'cx', pallet: 'cx' };
    const isService = p => p.productType === 'service' || p.controlStock === false || /^serv/i.test(String(p.unit || '')) || /^servi[cç]os?\b/i.test(String(p.category || '').trim());
    function packOptions(p) {
        const out = [{ label: 'Unidade', code: 'un', factor: 1 }];
        (Array.isArray(p.packagings) ? p.packagings : []).forEach(k => { const f = Number(k && k.factor) || 0; if (f > 1 && !out.some(o => o.factor === f)) out.push({ label: k.label || 'Caixa', code: PKCODE[k.type] || 'cx', factor: f, cost: Number(k.cost) || 0, type: k.type }); });
        return out;
    }
    function packOf(p, last) {
        const opts = packOptions(p);
        if (last && last.factor > 1) { const o = opts.find(x => x.factor === last.factor); if (o) return o; const lb = String(last.packaging || 'Caixa').replace(/\s*\(.*$/, '') || 'Caixa'; const c = { label: lb, code: { Fardo: 'fd', Pack: 'pk', Kit: 'kt' }[lb] || 'cx', factor: last.factor }; opts.push(c); return c; }
        if (last && last.factor === 1) return opts[0];
        const big = opts.filter(o => o.factor > 1 && o.type !== 'pallet').sort((a, b) => b.factor - a.factor)[0];
        return big || opts[0];
    }
    async function carregarBase() {
        const list = async (col, ord, lim) => typeof simpleList === 'function' ? simpleList(col, ord, 'desc', lim) : (await db.collection(col).limit(lim).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted);
        const since = new Date(Date.now() - 30 * 864e5);
        const [products, sups, purchases] = await Promise.all([list('products', 'name', 10000), suppliers(), list('purchases', 'createdAt', 3000)]);
        // Saída de venda: as vendas dos últimos 30 dias (cancelada não conta; devolução desconta). Peça usada em OS: movimentações da OS.
        let sales = [], moves = [];
        try { sales = (await db.collection('sales').where('createdAt', '>=', since).get()).docs.map(d => d.data()); }
        catch (e) { try { sales = await list('sales', 'createdAt', 5000); } catch (_) { sales = []; } }
        sales = sales.filter(s => !s.deleted && s.status !== 'cancelled' && msOf(s.createdAt) >= since.getTime());
        try { moves = (await db.collection('stock_movements').where('referenceType', '==', 'service_order').get()).docs.map(d => d.data()); } catch (e) { moves = []; }
        moves = moves.filter(m => m.type === 'exit' && msOf(m.createdAt) >= since.getTime());
        let empresa = '';
        try { const g = await db.collection('settings').doc('general').get(); const d = g.exists ? g.data() || {} : {}; empresa = d.nomeFantasia || d.razaoSocial || ''; } catch (e) { }
        return { products, sups, purchases, sales, moves, empresa };
    }
    function calcular(B, dias) {
        const now = Date.now();
        // Média por dia: divide pelos dias que existem de histórico (mínimo 7, máximo 30), para quem começou agora não sair baixo demais
        const oldest = B.sales.concat(B.moves).reduce((m, x) => Math.min(m, msOf(x.createdAt) || now), now);
        const win = Math.max(7, Math.min(30, Math.ceil((now - oldest) / 864e5) || 30));
        const sold = {};
        B.sales.forEach(s => (s.items || []).forEach(i => {
            if (!i || !i.productId || i.isService) return;
            const q = ((Number(i.quantity) || 0) - (Number(i.returnedQty) || 0)) * (Number(i._factor) || 1);
            if (q > 0) sold[i.productId] = (sold[i.productId] || 0) + q;
        }));
        B.moves.forEach(m => { const q = Number(m.quantity) || 0; if (m.productId && q > 0) sold[m.productId] = (sold[m.productId] || 0) + q; });
        const onOrder = {}, orderNo = {}, last = {};
        B.purchases.filter(p => !p.deleted && p.status !== 'cancelled').sort((a, b) => msOf(a.createdAt) - msOf(b.createdAt)).forEach(p => (p.items || []).forEach(i => {
            if (!i.productId) return;
            if (p.status === 'pending') { onOrder[i.productId] = (onOrder[i.productId] || 0) + (Number(i.unitsTotal || i.quantity) || 0); (orderNo[i.productId] = orderNo[i.productId] || []).push('#' + (p.purchaseNumber || '')); }
            last[i.productId] = { factor: Number(i.factor) || 1, packaging: i.packaging || '', costPackage: Number(i.costPackage) || 0, supplierId: p.supplierId || '', supplierName: p.supplierName || '' };
        }));
        const groups = {}; let covered = 0;
        for (const p of B.products) {
            if (p.deleted || p.status === 'inactive' || isService(p)) continue;
            const stock = Number(p.currentStock) || 0, min = Number(p.minStock) || 0;
            const avg = Math.max(0, (sold[p.id] || 0) / win), ord = onOrder[p.id] || 0;
            const cover = avg > 0 ? stock / avg : Infinity;
            const low = min > 0 && stock < min, short = avg > 0 && cover < dias;
            if (!low && !short) continue;
            const target = Math.max(min, Math.ceil(avg * dias - 1e-9));
            const need = n3(target - stock - ord);
            if (!(need > 0)) { covered++; continue; }
            const lp = last[p.id], pk = packOf(p, lp);
            const packs = Math.max(1, Math.ceil(need / pk.factor - 1e-9));
            const pkCost = lp && lp.factor === pk.factor && lp.costPackage > 0 ? lp.costPackage : r2((Number(p.costPrice) || 0) * pk.factor);
            const supId = p.supplierId || (lp && lp.supplierId) || '';
            const g = groups[supId || '_'] = groups[supId || '_'] || { supId, lines: [] };
            const why = low ? `abaixo do mínimo (${qf(min)})` : `acaba em ${Math.max(0, Math.floor(cover))} ${plural(Math.floor(cover), 'dia', 'dias')}`;
            g.lines.push({ p, stock, min, avg, cover, ord, ordNo: orderNo[p.id] || [], need, pk, packs, pkCost, opts: packOptions(p).concat(packOptions(p).some(o => o.factor === pk.factor) ? [] : [pk]), why, on: true });
        }
        const out = Object.values(groups).map(g => { const s = B.sups.find(x => x.id === g.supId) || null; return { ...g, sup: s, name: s ? (s.fantasyName || s.name) : (g.supId ? (g.lines[0] && last[g.lines[0].p.id] && last[g.lines[0].p.id].supplierName) || 'Fornecedor' : 'Sem fornecedor definido') }; });
        out.sort((a, b) => (a.supId ? 0 : 1) - (b.supId ? 0 : 1) || a.name.localeCompare(b.name, 'pt-BR'));
        return { groups: out, covered, win };
    }
    const lineCost = l => r2(l.packs * (l.pkCost > 0 ? l.pkCost : (Number(l.p.costPrice) || 0) * l.pk.factor));
    const pkName = (pk, n) => { if (pk.factor === 1) return 'un'; const s = String(pk.label || 'caixa').toLowerCase(); return n === 1 ? s : (/a$|o$|e$|k$|t$/.test(s) ? s + 's' : s); };
    function msgPedido(g, lines, empresa) {
        const who = g.sup ? (g.sup.representative || g.sup.fantasyName || g.sup.name || '') : '';
        const L = lines.map(l => `• ${qf(l.packs)} ${pkName(l.pk, l.packs)}${l.pk.factor > 1 ? ` (${qf(l.packs * l.pk.factor)} un)` : ''} – ${l.p.name}${l.p.code ? ' · cód. ' + l.p.code : ''}`);
        return `Olá${who ? ', ' + who.split(' ')[0] : ''}! Segue o pedido${empresa ? ' da ' + empresa : ''}:\n\n${L.join('\n')}\n\nPode me confirmar o valor e a data de entrega? Obrigado!`;
    }
    const waPhone = s => { let d = String(s || '').replace(/\D/g, ''); if (!d) return ''; if (d.length >= 10 && d.length <= 11 && !d.startsWith('55')) d = '55' + d; return d; };
    async function sugestao() {
        const ov = overlay('cproSug', 'Sugestão de compra', ic('lightbulb', 'lightbulb'), `<div class="cpro-empty">${ic('loader-circle', 'spinner')}Calculando o que precisa comprar…</div>`, 'cpro-sug');
        const body = ov.querySelector('.modal-body'), foot = ov.querySelector('.modal-footer');
        foot.innerHTML = `<button class="btn btn-secondary" data-x>Fechar</button>`; foot.querySelector('[data-x]').addEventListener('click', () => ov.remove());
        let B; try { B = await carregarBase(); } catch (e) { body.innerHTML = `<div class="cpro-empty">Não foi possível calcular: ${esc(e.message)}</div>`; return; }
        let dias = 15; try { dias = Number(localStorage.getItem('dp_sug_dias')) || 15; } catch (e) { }
        let R = calcular(B, dias);
        const draw = () => {
            const all = R.groups.flatMap(g => g.lines.filter(l => l.on));
            const head = `<div class="cpro-intro">Produtos abaixo do estoque mínimo ou que acabam em menos de <span class="cpro-days">${[7, 15, 30].map(d => `<button type="button" data-d="${d}" class="${d === dias ? 'on' : ''}">${d}</button>`).join('')}</span> dias, pela média de venda dos últimos ${R.win} dias. O que já está em compra pendente é descontado.</div>`;
            if (!R.groups.length) { body.innerHTML = head + `<div class="cpro-empty">${ic('circle-check', 'check-circle')}<b style="color:var(--text-primary)">Nada para comprar agora.</b><br>Nenhum produto está abaixo do mínimo nem acaba nos próximos ${dias} dias${R.covered ? `, e ${R.covered} ${plural(R.covered, 'produto já está', 'produtos já estão')} em compra pendente` : ''}.<br>Dica: preencha o estoque mínimo e o fornecedor principal no cadastro dos produtos.</div>`; return; }
            body.innerHTML = head + `<div class="cpro-sum"><span><b>${all.length}</b> ${plural(all.length, 'produto', 'produtos')} para repor</span><span><b>${R.groups.length}</b> ${plural(R.groups.length, 'fornecedor', 'fornecedores')}</span><span>Estimado: <b>${money(all.reduce((s, l) => s + lineCost(l), 0))}</b></span>${R.covered ? `<span>${R.covered} já em compra pendente</span>` : ''}</div>` +
                R.groups.map((g, gi) => { const on = g.lines.filter(l => l.on); const ph = g.sup && waPhone(g.sup.whatsapp || g.sup.phone); return `<section class="cpro-g" data-g="${gi}"><div class="cpro-gh"><div><b>${esc(g.name)}</b><small>${on.length} ${plural(on.length, 'item', 'itens')} · ${money(on.reduce((s, l) => s + lineCost(l), 0))} estimado${g.sup && (g.sup.whatsapp || g.sup.phone) ? ' · ' + esc(g.sup.whatsapp || g.sup.phone) : ''}</small></div>
<div class="cpro-ga"><button type="button" class="btn btn-outline" data-a="copy">${ic('copy', 'copy')} Copiar</button><button type="button" class="btn btn-outline" data-a="wa" title="${ph ? 'Abrir a conversa com o fornecedor' : 'Escolher o contato no WhatsApp'}">${ic('whatsapp', 'whatsapp')} WhatsApp</button><button type="button" class="btn btn-primary" data-a="gen">${ic('shopping-cart', 'cart-shopping')} Gerar compra</button></div></div>
${g.lines.map((l, li) => `<div class="cpro-l${l.on ? '' : ' off'}" data-l="${li}"><input type="checkbox" data-a="on" ${l.on ? 'checked' : ''} aria-label="Incluir"><div class="nm"><b>${esc(l.p.name)}</b><small><span class="why">${esc(l.why)}</span> · tem ${qf(l.stock)}${l.avg > 0 ? ` · vende ${l.avg.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}/dia` : ''}${l.ord ? ` · ${qf(l.ord)} un já pedidas (${esc(l.ordNo.join(', '))})` : ''}</small></div>
<div class="pk"><select data-a="pk">${l.opts.map((o, oi) => `<option value="${oi}" ${o.factor === l.pk.factor ? 'selected' : ''}>${esc(o.label)}${o.factor > 1 ? ' (' + o.factor + ' un)' : ''}</option>`).join('')}</select></div>
<div class="qt"><input type="text" inputmode="numeric" data-a="qty" value="${qf(l.packs)}" aria-label="Quantidade"></div>
<div class="tot"><b>${qf(l.packs * l.pk.factor)} un</b>${money(lineCost(l))}</div></div>`).join('')}</section>`; }).join('');
        };
        draw();
        const lineOf = el => { const g = R.groups[Number(el.closest('[data-g]').dataset.g)], l = el.closest('[data-l]'); return { g, l: l ? g.lines[Number(l.dataset.l)] : null }; };
        body.addEventListener('click', async e => {
            const d = e.target.closest('[data-d]');
            if (d) { dias = Number(d.dataset.d); try { localStorage.setItem('dp_sug_dias', String(dias)); } catch (_) { } R = calcular(B, dias); draw(); return; }
            const b = e.target.closest('button[data-a]'); if (!b) return;
            const { g } = lineOf(b), lines = g.lines.filter(l => l.on && l.packs > 0);
            if (!lines.length) { toast('warning', 'Marque pelo menos um produto.'); return; }
            const msg = msgPedido(g, lines, B.empresa);
            if (b.dataset.a === 'copy') { try { await navigator.clipboard.writeText(msg); toast('success', 'Lista copiada.'); } catch (_) { prompt('Copie a lista:', msg); } }
            if (b.dataset.a === 'wa') { const ph = g.sup ? waPhone(g.sup.whatsapp || g.sup.phone) : ''; window.open(`https://wa.me/${ph}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener'); }
            if (b.dataset.a === 'gen') { ov.remove(); preencherCompra(g, lines); }
        });
        body.addEventListener('change', e => {
            const el = e.target; if (!el.closest || !el.closest('[data-l]')) return;
            const { l } = lineOf(el); if (!l) return;
            if (el.dataset.a === 'on') l.on = el.checked;
            if (el.dataset.a === 'pk') { const o = l.opts[Number(el.value)]; if (o) { l.pk = o; l.packs = Math.max(1, Math.ceil(l.need / o.factor - 1e-9)); l.pkCost = r2((Number(l.p.costPrice) || 0) * o.factor); } }
            if (el.dataset.a === 'qty') { const v = Math.max(0, Math.round(Number(String(el.value).replace(',', '.')) || 0)); l.packs = v; if (!v) l.on = false; }
            const st = body.scrollTop; draw(); body.scrollTop = st;
        });
    }
    function preencherCompra(g, lines) {
        const { m, sup, date } = modalEls(), tb = $('purchaseItems');
        if (!m || !tb || typeof window.addPurchaseItem !== 'function') { toast('error', 'Abra a tela de Compras para gerar a compra.'); return; }
        tb.innerHTML = '';
        if (date) date.value = ymd(new Date());
        const pz = $('cproPrazo'); if (pz) { pz.value = ''; pz.dataset.touched = ''; }
        if (sup) { sup.value = g.supId && [...sup.options].some(o => o.value === g.supId) ? g.supId : ''; sup.dispatchEvent(new Event('change', { bubbles: true })); }
        const fire = (el, t) => el && el.dispatchEvent(new Event(t, { bubbles: true }));
        for (const l of lines) {
            window.addPurchaseItem(); const row = tb.lastElementChild; if (!row) continue;
            const ps = row.querySelector('.purch-product'); if (!ps) continue;
            ps.value = l.p.id; if (ps.value !== l.p.id) { row.remove(); continue; }
            fire(ps, 'change');
            const ty = row.querySelector('.purch-pkg-type'); if (ty) ty.value = l.pk.code || 'un';
            const f = row.querySelector('.purch-factor'); if (f) { f.value = l.pk.factor; fire(f, 'input'); }
            const q = row.querySelector('.purch-qty'); if (q) { q.value = l.packs; fire(q, 'input'); }
            const c = row.querySelector('.purch-cost');
            if (c && l.pkCost > 0 && Math.abs((parseFloat(c.value) || 0) - l.pkCost) > 0.004) { c.value = l.pkCost.toFixed(2); fire(c, 'input'); }
        }
        if (typeof window.calcPurchTotal === 'function') window.calcPurchTotal();
        const obs = m.querySelector('textarea'); if (obs && !obs.value.trim()) obs.value = 'Gerada pela sugestão de compra';
        if (typeof openModal === 'function') openModal('modalCompra'); else m.classList.add('active');
        drawParc();
        toast('info', 'Confira as quantidades e os custos e toque em Registrar Compra.');
    }

    window.DPComprasPro = { parseTerms, parcelas, termsOfMethod, camposCompra, aoReceber, lancarContas, cancelar, cancelarContas, aoExcluir, detalheHtml, sugestao, contasDaCompra };
    const start = () => { try { setupModal(); } catch (e) { console.warn('compras-pro:', e); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
