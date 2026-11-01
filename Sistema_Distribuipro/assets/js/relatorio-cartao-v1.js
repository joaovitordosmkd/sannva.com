/* DistribuiPro 37.1 · Relatório "Cartão e Pix: líquido das taxas" (Relatórios).
   Soma as vendas no crédito, débito e Pix (e formas cadastradas como cartão) do período, com a taxa de cada
   pagamento e o valor que realmente cai na conta. A taxa vem da própria venda (feeValue/feePercent); vendas antigas
   sem taxa gravada usam as taxas de Configurações › Vendas. */
(function () {
    'use strict';
    if (!/relatorios\.html$/i.test(location.pathname)) return;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const toD = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const BR = { visa: 'Visa', mastercard: 'Mastercard', master: 'Mastercard', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard', outras: 'Outras', '': '' };
    const NAME = { credito: 'Crédito', debito: 'Débito', pix: 'Pix' };

    function range() {
        const f = document.getElementById('rptDateFrom'), t = document.getElementById('rptDateTo');
        const a = f && f.value ? new Date(f.value + 'T00:00:00') : (() => { const d = new Date(); d.setDate(1); d.setHours(0, 0, 0, 0); return d; })();
        const b = t && t.value ? new Date(t.value + 'T23:59:59.999') : (() => { const d = new Date(); d.setHours(23, 59, 59, 999); return d; })();
        return { a, b };
    }
    async function list(col, n) {
        if (typeof simpleList === 'function') return simpleList(col, 'createdAt', 'desc', n);
        const s = await db.collection(col).limit(n).get(); return s.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    async function cfg() { try { const s = await db.collection('settings').doc('general').get(); return s.exists ? (s.data() || {}) : {}; } catch (e) { return {}; } }

    async function build() {
        const area = document.getElementById('reportArea'); if (!area) return;
        const { a, b } = range();
        const [sales, g] = await Promise.all([list('sales', 8000), cfg()]);
        const extras = (Array.isArray(g.formasPagamentoExtras) ? g.formasPagamentoExtras : []);
        const kindOf = m => { if (['credito', 'debito', 'pix'].includes(m)) return m; const x = extras.find(e => e.id === m); return x && ['credito', 'debito', 'pix', 'cartao'].includes(x.kind) ? (x.kind === 'cartao' ? 'credito' : x.kind) : null; };
        const label = m => NAME[m] || (extras.find(e => e.id === m) || {}).name || m;
        const brandRate = (method, brand) => {
            if (method === 'pix') return Number(g.taxaPix || 0);
            if (method === 'debito') return Number(g.taxaDebito || 0);
            const k = { visa: 'Visa', mastercard: 'Mastercard', master: 'Mastercard', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard' }[String(brand || '').toLowerCase()] || 'Outras';
            return Number(g['taxaCredito' + k] || g.taxaCredito || 0);
        };
        const groups = {}, rows = [];
        let gross = 0, fee = 0;
        sales.filter(s => !s.deleted && ['completed', 'delivered'].includes(s.status)).forEach(s => {
            const d = toD(s.createdAt); if (!d || d < a || d > b) return;
            const pays = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod, amount: s.total, cardBrand: s.cardBrand, installments: s.installments, feeValue: s.paymentFeeValue, feePercent: s.paymentFeePercent }];
            pays.forEach(p => {
                const m = p.method || ''; const kind = kindOf(m); if (!kind) return;
                const amt = r2(p.amount); if (!amt) return;
                const ext = extras.find(e => e.id === m);
                let f = p.feeValue != null && p.feeValue !== '' ? Number(p.feeValue) : (p.feePercent != null ? amt * Number(p.feePercent) / 100 : null);
                if (f == null || isNaN(f)) f = amt * (ext ? Number(ext.fee || 0) : brandRate(kind, p.cardBrand)) / 100;
                f = r2(f);
                const inst = Number(p.installments || 1), br = BR[String(p.cardBrand || '').toLowerCase()] ?? p.cardBrand ?? '';
                const key = [label(m), kind === 'credito' ? br : '', kind === 'credito' ? inst : 1].join('|');
                const gr = groups[key] || (groups[key] = { method: label(m), brand: kind === 'credito' ? br : '', inst: kind === 'credito' ? inst : 1, n: 0, gross: 0, fee: 0 });
                gr.n++; gr.gross += amt; gr.fee += f; gross += amt; fee += f;
                rows.push({ d, num: s.saleNumber, customer: s.customerName || 'Consumidor', method: label(m), brand: br, inst, amt, fee: f });
            });
        });
        const net = r2(gross - fee), avg = gross ? fee / gross * 100 : 0;
        const gl = Object.values(groups).sort((x, y) => y.gross - x.gross);
        const stat = (t, v, c, sub) => `<div class="card" style="padding:16px;text-align:center;border-top:3px solid ${c}"><div style="font-size:12px;color:var(--text-muted)">${t}</div><div style="font-size:22px;font-weight:800;color:${c};margin-top:4px">${v}</div>${sub ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${sub}</div>` : ''}</div>`;
        area.innerHTML = `<div class="card" style="padding:20px">
<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:18px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:17px;font-weight:700;color:var(--text-primary)"><i class="fas fa-credit-card" style="color:#0ea5e9;margin-right:8px"></i>Cartão e Pix: líquido das taxas</h3><div style="font-size:12px;color:var(--text-muted);margin-top:3px">Quanto você vendeu, quanto ficou de taxa e quanto realmente entra na conta</div></div><span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${a.toLocaleDateString('pt-BR')} a ${b.toLocaleDateString('pt-BR')}</span></div>
<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px">${stat('Vendido (bruto)', money(gross), '#6366f1', rows.length + ' pagamento(s)')}${stat('Taxas', money(fee), '#ef4444', avg.toFixed(2).replace('.', ',') + '% em média')}${stat('Líquido (cai na conta)', money(net), '#10b981', '')}</div>
<h4 style="font-size:14px;margin:0 0 10px;color:var(--text-primary)">Por forma, bandeira e parcelas</h4>
<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Forma</th><th>Bandeira</th><th>Parcelas</th><th style="text-align:right">Qtd.</th><th style="text-align:right">Bruto</th><th style="text-align:right">Taxa</th><th style="text-align:right">% taxa</th><th style="text-align:right">Líquido</th></tr></thead><tbody>
${gl.length ? gl.map(x => `<tr><td><b>${esc(x.method)}</b></td><td>${esc(x.brand || '—')}</td><td>${x.inst > 1 ? x.inst + 'x' : 'à vista'}</td><td style="text-align:right">${x.n}</td><td style="text-align:right">${money(x.gross)}</td><td style="text-align:right;color:#ef4444">${money(x.fee)}</td><td style="text-align:right">${x.gross ? (x.fee / x.gross * 100).toFixed(2).replace('.', ',') : '0,00'}%</td><td style="text-align:right;font-weight:700;color:#10b981">${money(x.gross - x.fee)}</td></tr>`).join('') : `<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma venda no cartão ou Pix neste período.</td></tr>`}
</tbody>${gl.length ? `<tfoot><tr><td colspan="3">Total</td><td style="text-align:right">${rows.length}</td><td style="text-align:right">${money(gross)}</td><td style="text-align:right">${money(fee)}</td><td style="text-align:right">${avg.toFixed(2).replace('.', ',')}%</td><td style="text-align:right">${money(net)}</td></tr></tfoot>` : ''}</table></div>
${rows.length ? `<h4 style="font-size:14px;margin:22px 0 10px;color:var(--text-primary)">Vendas do período</h4><div style="overflow-x:auto;max-height:520px"><table class="data-table"><thead><tr><th>Data</th><th>Venda</th><th>Cliente</th><th>Forma</th><th style="text-align:right">Bruto</th><th style="text-align:right">Taxa</th><th style="text-align:right">Líquido</th></tr></thead><tbody>${rows.sort((x, y) => y.d - x.d).slice(0, 1500).map(r => `<tr><td>${r.d.toLocaleDateString('pt-BR')} ${r.d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</td><td>${r.num ? '#V-' + String(r.num).padStart(4, '0') : '—'}</td><td>${esc(r.customer)}</td><td>${esc(r.method)}${r.brand ? ' · ' + esc(r.brand) : ''}${r.inst > 1 ? ' · ' + r.inst + 'x' : ''}</td><td style="text-align:right">${money(r.amt)}</td><td style="text-align:right;color:#ef4444">${money(r.fee)}</td><td style="text-align:right;font-weight:600">${money(r.amt - r.fee)}</td></tr>`).join('')}</tbody></table></div>` : ''}
<p style="font-size:11.5px;color:var(--text-muted);margin-top:14px"><i class="fas fa-circle-info"></i> A taxa é a gravada em cada venda. Vendas antigas sem taxa usam as taxas de Configurações › Vendas. Para mudar as taxas, vá em Configurações.</p></div>`;
        try { window.currentData = { csvRows: [['Data', 'Venda', 'Cliente', 'Forma', 'Bandeira', 'Parcelas', 'Bruto', 'Taxa', 'Liquido'], ...rows.map(r => [r.d.toLocaleString('pt-BR'), r.num || '', r.customer, r.method, r.brand, r.inst, r.amt.toFixed(2), r.fee.toFixed(2), (r.amt - r.fee).toFixed(2)])] }; } catch (e) { }
    }

    function wrap() {
        const orig = window.showReport;
        if (typeof orig !== 'function' || orig.__dpCartao) return false;
        const mine = async function (type) {
            if (type !== 'cartao') return orig.apply(this, arguments);
            document.querySelectorAll('[onclick*="showReport"]').forEach(el => { el.style.borderColor = 'transparent'; });
            const c = document.querySelector(`[onclick="showReport('cartao')"]`); if (c) c.style.borderColor = 'var(--accent)';
            const area = document.getElementById('reportArea');
            if (area) { area.innerHTML = '<div style="text-align:center;padding:60px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:16px">Gerando relatório...</div></div>'; area.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
            try { await build(); } catch (e) { if (area) area.innerHTML = `<div class="card" style="text-align:center;padding:40px;color:#ef4444">Erro ao carregar relatório: ${esc(e.message)}</div>`; }
        };
        mine.__dpCartao = true; window.showReport = mine; return true;
    }
    function addCard() {
        if (document.querySelector(`[onclick="showReport('cartao')"]`)) return true;
        const ref = document.querySelector(`[onclick="showReport('dre')"]`) || document.querySelector(`[onclick="showReport('vendas')"]`);
        if (!ref) return false;
        const c = ref.cloneNode(true); c.setAttribute('onclick', "showReport('cartao')"); c.style.borderColor = 'transparent';
        const ic = c.querySelector('i.fas, i.fa-solid'); if (ic) { ic.className = 'fas fa-credit-card'; }
        const box = ic && ic.parentElement; if (box) { box.style.background = 'rgba(14,165,233,.12)'; ic.style.color = '#0ea5e9'; }
        const texts = [...c.querySelectorAll('div,span,h4,strong,b,p,small')].filter(e => !e.children.length && e.textContent.trim());
        if (texts[0]) texts[0].textContent = 'Cartão e Pix (líquido)';
        if (texts[1]) texts[1].textContent = 'Vendas no cartão e Pix menos as taxas';
        ref.parentElement.insertBefore(c, ref.nextSibling);
        return true;
    }
    let n = 0; const t = setInterval(() => { const okW = wrap() || (window.showReport && window.showReport.__dpCartao); const okC = addCard(); if ((okW && okC) || ++n > 80) clearInterval(t); }, 300);
    // Se a página redefinir o showReport depois, embrulha de novo
    setInterval(() => { if (window.showReport && !window.showReport.__dpCartao) wrap(); }, 2000);
})();
