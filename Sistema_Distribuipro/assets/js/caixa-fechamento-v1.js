/* DistribuiPro 36.6 · Fechamento de caixa impresso — caixa.html
   - Ao fechar o caixa aparece o resumo com "Imprimir fechamento" (cupom 80mm ou folha A4).
   - No Histórico de Caixas, o botão 🖨 reimprime qualquer fechamento; com o caixa aberto dá para imprimir a parcial.
   - caixa.html?imprimir=<id> mostra o botão de impressão daquele caixa (usado pelo relatório de Caixas).
   Lê cash_registers e cash_movements; funciona nas 5 versões (Mensal, MySQL, Firebase, Offline e demo). */
(function () {
    'use strict';
    if (!document.getElementById('btnCloseCash')) return;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const ms = v => { const d = toDate(v); return d ? d.getTime() : 0; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const fmtT = v => { const d = toDate(v); return d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '—'; };
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };

    /* ---------- dados ---------- */
    let company = null;
    async function loadCompany() {
        if (company) return company;
        const c = { name: 'DistribuiPRO', doc: '', phone: '', address: '' };
        try {
            const d = await db.collection('settings').doc('general').get();
            const g = d.exists ? (d.data() || {}) : {};
            let brand = {}; try { brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {}; } catch (e) { }
            c.name = g.nomeFantasia || brand.companyName || g.razaoSocial || c.name;
            c.doc = g.cnpj || ''; c.phone = g.telefone || g.whatsapp || '';
            const rua = [g.logradouro, g.numero].filter(Boolean).join(', '); const cid = [g.cidade, g.uf].filter(Boolean).join(' - ');
            c.address = [rua, g.bairro, cid].filter(Boolean).join(' · ');
        } catch (e) { }
        company = c; return c;
    }
    async function registerOf(id) { try { const d = await db.collection('cash_registers').doc(id).get(); return d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { return null; } }
    async function movementsOf(id) {
        let list = [];
        try { const s = await db.collection('cash_movements').where('cashRegisterId', '==', id).get(); list = s.docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { }
        if (!list.length) { try { const s = await db.collection('cash_movements').get(); list = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.cashRegisterId === id); } catch (e) { } }
        return list.sort((a, b) => ms(a.createdAt) - ms(b.createdAt));
    }
    const METHODS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ['fiado', 'Fiado / a receber']];
    function summarize(reg, moves) {
        const live = moves.filter(m => m.reversed !== true);
        const sales = live.filter(m => m.type === 'sale');
        const sum = l => l.reduce((s, m) => s + Number(m.amount || 0), 0);
        const known = new Set(METHODS.map(m => m[0]));
        const rows = METHODS.map(([k, label]) => { const l = sales.filter(m => m.paymentMethod === k); return { k, label, n: l.length, v: sum(l) }; });
        // 37.1 · Formas de pagamento cadastradas pelo lojista aparecem cada uma com o seu nome
        const others = sales.filter(m => !known.has(m.paymentMethod)), og = {};
        others.forEach(m => { const k = m.paymentMethod || 'outros'; (og[k] = og[k] || []).push(m); });
        Object.entries(og).forEach(([k, l]) => rows.push({ k, label: (window.DPPayMethods && DPPayMethods.label(k)) || (k === 'outros' ? 'Outros' : k), n: l.length, v: sum(l) }));
        const totalSales = sum(sales), supply = sum(live.filter(m => m.type === 'supply')), withdraw = Math.abs(sum(live.filter(m => m.type === 'withdraw')));
        const initial = Number(reg.initialAmount || 0), cash = rows[0].v;
        const expected = initial + cash + supply - withdraw;
        const closed = reg.status === 'closed';
        const actual = closed ? Number(reg.actualAmount || 0) : null;
        const diff = closed ? (reg.difference != null ? Number(reg.difference) : actual - expected) : null;
        const osCount = sales.filter(m => m.source === 'service_order' || m.referenceType === 'service_order').length;
        return { live, sales, rows, totalSales, salesCount: sales.length, osCount, supply, withdraw, initial, cash, expected, actual, diff, closed };
    }

    /* ---------- documento ---------- */
    function docHtml(reg, moves, s, co) {
        const shift = { morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' }[reg.shift] || (reg.shift || '—');
        const typeLabel = m => m.type === 'sale' ? ((m.source === 'service_order' || m.referenceType === 'service_order') ? 'OS' : 'Venda') : ({ supply: 'Suprimento', withdraw: 'Sangria' }[m.type] || m.type);
        const diffTxt = s.diff == null ? '—' : (Math.abs(s.diff) < 0.005 ? 'R$ 0,00 · fechou certinho' : (s.diff > 0 ? '+' + money(s.diff) + ' · sobra' : money(s.diff) + ' · falta'));
        const movRows = moves.map(m => { const neg = m.type === 'withdraw' || Number(m.amount) < 0; return `<tr class="${m.reversed ? 'rev' : ''}"><td>${fmtT(m.createdAt)}</td><td>${typeLabel(m)}${m.reversed ? ' (estornado)' : ''}</td><td>${esc(m.description || '')}</td><td class="n">${neg ? '' : '+'}${money(m.amount)}</td></tr>`; }).join('');
        return `<div class="doc">
  <div class="hd"><div class="co">${esc(co.name)}</div>${co.doc ? `<div class="sub">CNPJ ${esc(co.doc)}</div>` : ''}${co.address ? `<div class="sub">${esc(co.address)}</div>` : ''}${co.phone ? `<div class="sub">${esc(co.phone)}</div>` : ''}</div>
  <div class="ttl">${s.closed ? 'FECHAMENTO DE CAIXA' : 'CAIXA EM ABERTO (parcial)'}</div>
  <div class="box">
    <div class="r"><span>Operador</span><b>${esc(reg.operatorName || '—')}</b></div>
    <div class="r"><span>Turno</span><b>${esc(shift)}</b></div>
    <div class="r"><span>Abertura</span><b>${fmtDT(reg.openedAt)}</b></div>
    <div class="r"><span>Fechamento</span><b>${s.closed ? fmtDT(reg.closedAt) : '—'}</b></div>
  </div>
  <div class="sec">VENDAS POR FORMA DE PAGAMENTO</div>
  <div class="box">
    ${s.rows.filter(r => r.n > 0 || r.k === 'dinheiro').map(r => `<div class="r"><span>${r.label} <small>(${r.n})</small></span><b>${money(r.v)}</b></div>`).join('')}
    <div class="r tot"><span>Total de vendas <small>(${s.salesCount}${s.osCount ? ' · ' + s.osCount + ' OS' : ''})</small></span><b>${money(s.totalSales)}</b></div>
  </div>
  <div class="sec">CONFERÊNCIA DO DINHEIRO</div>
  <div class="box">
    <div class="r"><span>Valor inicial (troco)</span><b>${money(s.initial)}</b></div>
    <div class="r"><span>(+) Vendas em dinheiro</span><b>${money(s.cash)}</b></div>
    <div class="r"><span>(+) Suprimentos</span><b>${money(s.supply)}</b></div>
    <div class="r"><span>(−) Sangrias</span><b>${money(s.withdraw)}</b></div>
    <div class="r tot"><span>Esperado em dinheiro</span><b>${money(s.expected)}</b></div>
    ${s.closed ? `<div class="r"><span>Contado em caixa</span><b>${money(s.actual)}</b></div><div class="r ${s.diff > 0.004 ? 'pos' : s.diff < -0.004 ? 'neg' : ''}"><span>Diferença</span><b>${diffTxt}</b></div>` : ''}
  </div>
  ${reg.notes ? `<div class="sec">OBSERVAÇÕES</div><div class="box"><div class="obs">${esc(reg.notes)}</div></div>` : ''}
  <div class="sec">MOVIMENTAÇÕES (${moves.length})</div>
  <table class="mv"><thead><tr><th>Hora</th><th>Tipo</th><th>Descrição</th><th class="n">Valor</th></tr></thead><tbody>${movRows || '<tr><td colspan="4">Sem movimentações</td></tr>'}</tbody></table>
  <div class="sig"><div><span></span>Operador: ${esc(reg.operatorName || '')}</div><div><span></span>Conferido por</div></div>
  <div class="ft">Impresso em ${new Date().toLocaleString('pt-BR')} · DistribuiPRO</div>
</div>`;
    }
    function pageHtml(inner, mode) {
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Fechamento de caixa</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#f1f5f9;color:#111;padding:70px 10px 30px;font-family:"Segoe UI",Arial,sans-serif}
.bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;z-index:9}
.bar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155}.bar button.on{background:#e0e7ff;border-color:#6366f1;color:#4338ca}.bar button.p{background:#6366f1;color:#fff;border-color:#6366f1}.bar .sp{flex:1}
.doc{background:#fff;margin:0 auto;padding:14px}.hd{text-align:center;margin-bottom:8px}.co{font-weight:800;font-size:1.15em}.sub{font-size:.85em;color:#475569}
.ttl{text-align:center;font-weight:800;margin:8px 0;padding:6px 0;border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8}
.sec{font-weight:800;font-size:.8em;letter-spacing:.5px;margin:10px 0 4px;color:#334155}.box{border:1px solid #e2e8f0;border-radius:6px;padding:6px 8px}
.r{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.r small{color:#64748b;font-weight:400}.r.tot{border-top:1px solid #cbd5e1;margin-top:4px;padding-top:4px;font-weight:800}.r.pos b{color:#059669}.r.neg b{color:#dc2626}
.obs{white-space:pre-wrap;font-size:.9em}
table.mv{width:100%;border-collapse:collapse;font-size:.85em;margin-top:2px}.mv th{text-align:left;border-bottom:1px solid #94a3b8;padding:3px 2px;font-size:.9em}.mv td{padding:3px 2px;border-bottom:1px dotted #e2e8f0;vertical-align:top}.mv .n{text-align:right;white-space:nowrap}.mv tr.rev td{color:#94a3b8;text-decoration:line-through}
.sig{display:flex;gap:16px;margin-top:26px}.sig div{flex:1;text-align:center;font-size:.8em;color:#334155}.sig span{display:block;border-top:1px solid #334155;margin-bottom:4px}
.ft{text-align:center;font-size:.75em;color:#94a3b8;margin-top:10px}
body.t80 .doc{width:72mm;font-family:"Courier New",monospace;font-size:11.5px;line-height:1.3;padding:6px}body.t80 .box{border:0;padding:0}body.t80 .sec{border-bottom:1px dashed #94a3b8}body.t80 .sig{margin-top:18px}
body.a4 .doc{max-width:720px;font-size:13px;line-height:1.45;padding:28px 32px;border:1px solid #e2e8f0}
@media print{body{background:#fff;padding:0}.bar{display:none}.doc{border:0!important;margin:0;max-width:none}}
${window.DPPapel ? '@media print{' + DPPapel.box('body.t80 .doc') + '}' : ''}
</style><style id="pg"></style></head><body class="${mode}">
<div class="bar"><strong style="font-size:13px;color:#334155">Formato:</strong><button id="b80" onclick="setMode('t80')">Cupom 80mm</button><button id="ba4" onclick="setMode('a4')">Folha A4</button><span class="sp"></span><button class="p" onclick="window.print()">🖨️ Imprimir</button><button onclick="window.close()">Fechar</button></div>
${inner}
<script>function setMode(m){document.body.className=m;document.getElementById('pg').textContent=m==='t80'?'${window.DPPapel ? DPPapel.page() : '@page{size:80mm auto;margin:3mm}'}':'@page{size:A4;margin:12mm}';document.getElementById('b80').className=m==='t80'?'on':'';document.getElementById('ba4').className=m==='a4'?'on':'';try{localStorage.setItem('dp_cash_print_mode',m)}catch(e){}}setMode(document.body.className||'t80');<\/script>
</body></html>`;
    }

    /* ---------- imprimir ---------- */
    window.dpPrintCashRegister = async function (id, mode) {
        let m = mode; try { m = m || localStorage.getItem('dp_cash_print_mode') || 't80'; } catch (e) { m = m || 't80'; }
        // Abre a janela antes de buscar os dados (senão o navegador bloqueia o pop-up)
        const w = window.open('', '_blank', 'width=900,height=820');
        if (!w) { toast('warning', 'O navegador bloqueou a janela de impressão. Permita pop-ups para este site.'); return; }
        try { w.document.write('<p style="font-family:sans-serif;padding:20px">Preparando o fechamento...</p>'); } catch (e) { }
        const reg = await registerOf(id);
        if (!reg) { toast('error', 'Caixa não encontrado'); try { w.close(); } catch (e) { } return; }
        const [moves, co] = await Promise.all([movementsOf(id), loadCompany()]);
        const html = pageHtml(docHtml(reg, moves, summarize(reg, moves), co), m);
        w.document.open(); w.document.write(html); w.document.close();
    };

    /* ---------- depois de fechar: resumo + botão imprimir ---------- */
    function closedDialog(reg, s) {
        const row = (l, v, c) => `<div style="display:flex;justify-content:space-between;font-size:13px;padding:4px 0"><span style="color:var(--text-muted)">${l}</span><strong${c ? ` style="color:${c}"` : ''}>${v}</strong></div>`;
        const diffC = s.diff == null ? '' : Math.abs(s.diff) < 0.005 ? 'var(--success)' : s.diff > 0 ? 'var(--success)' : 'var(--danger)';
        const ov = document.createElement('div'); ov.className = 'modal-overlay active';
        ov.innerHTML = `<div class="modal" style="max-width:440px"><div class="modal-header"><h3><i class="fas fa-lock" style="color:var(--success);margin-right:8px"></i>Caixa fechado</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button></div>
          <div class="modal-body"><div style="background:var(--bg-secondary);border-radius:10px;padding:12px 14px">
            ${row('Operador', esc(reg.operatorName || '—'))}${row('Vendas (' + s.salesCount + ')', money(s.totalSales), 'var(--accent)')}${row('Esperado em dinheiro', money(s.expected))}${row('Contado', money(s.actual))}${row('Diferença', s.diff == null ? '—' : (s.diff > 0 ? '+' : '') + money(s.diff), diffC)}
          </div><div style="font-size:12px;color:var(--text-muted);margin-top:10px"><i class="fas fa-print" style="margin-right:5px"></i>Imprima o fechamento para conferência e assinatura. Depois dá para reimprimir no Histórico de Caixas.</div></div>
          <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Fechar</button><button class="btn btn-primary" onclick="dpPrintCashRegister('${reg.id}')"><i class="fas fa-print"></i> Imprimir fechamento</button></div></div>`;
        document.body.appendChild(ov);
    }
    const origConfirmClose = window.confirmCloseCash;
    if (typeof origConfirmClose === 'function') window.confirmCloseCash = async function () {
        let before = null; try { before = currentCash ? { ...currentCash } : null; } catch (e) { }
        const r = await origConfirmClose.apply(this, arguments);
        let after = null; try { after = currentCash; } catch (e) { }
        // 40.38 · com outro caixa aberto, o "after" é o outro (o fechado continua mostrando a janela de impressão)
        if (before && (!after || after.id !== before.id)) { try { const reg = await registerOf(before.id); if (reg) closedDialog(reg, summarize(reg, await movementsOf(before.id))); } catch (e) { console.warn('fechamento:', e); } }
        return r;
    };

    /* ---------- botões no histórico e na barra de ações ---------- */
    function addButtons(history) {
        const tb = document.querySelectorAll('.data-table tbody')[1];
        if (tb && Array.isArray(history)) {
            const rows = tb.querySelectorAll('tr');
            if (rows.length === history.length) rows.forEach((tr, i) => { const td = tr.lastElementChild; if (!td || td.querySelector('.dpcx-print') || !history[i] || !history[i].id) return; td.insertAdjacentHTML('beforeend', ` <button class="btn-icon dpcx-print" title="Imprimir fechamento" onclick="dpPrintCashRegister('${history[i].id}')"><i class="fas fa-print"></i></button>`); });
        }
        let open = null; try { open = currentCash; } catch (e) { }
        const act = document.getElementById('cashActions');
        if (act) { let b = document.getElementById('dpcxPrintNow'); if (open) { if (!b) { b = document.createElement('button'); b.id = 'dpcxPrintNow'; b.className = 'btn btn-outline'; b.title = 'Imprime a parcial do caixa aberto (conferência de turno)'; b.innerHTML = '<i class="fas fa-print"></i> Imprimir parcial'; b.onclick = () => dpPrintCashRegister(open.id); act.insertBefore(b, document.getElementById('btnCloseCash')); } } else if (b) b.remove(); }
    }
    const origRender = window.renderCashState;
    if (typeof origRender === 'function') window.renderCashState = function (history) { const r = origRender.apply(this, arguments); try { addButtons(history || []); } catch (e) { console.warn(e); } return r; };

    /* ---------- caixa.html?imprimir=<id> ---------- */
    const qp = new URLSearchParams(location.search).get('imprimir');
    if (qp) { const b = document.createElement('button'); b.className = 'btn btn-primary'; b.style.cssText = 'position:fixed;right:18px;bottom:18px;z-index:60;box-shadow:var(--shadow-lg)'; b.innerHTML = '<i class="fas fa-print"></i> Imprimir fechamento selecionado'; b.onclick = () => dpPrintCashRegister(qp); document.body.appendChild(b); }
})();
