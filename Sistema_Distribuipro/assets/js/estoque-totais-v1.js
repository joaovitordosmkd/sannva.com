/* DistribuiPro 35.4 · Totalização do estoque (tela Estoque Atual).
   Quantidade total (por unidade), valor de custo, valor de venda e lucro estimado.
   Acompanha a busca e os filtros da tela: o pages.js avisa a cada desenho da tabela (evento dp:stock-render). */
(function () {
    'use strict';
    const C = window.DPCatalog;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qty = (v, u) => C ? C.fmtQty(v, u) : (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const unitAbbr = u => C ? C.unit(u).abbr : String(u || 'UN').toUpperCase();
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const st = document.createElement('style');
    st.textContent = `.stt-box{margin:0 0 20px}
.stt-head{display:flex;align-items:baseline;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 2px 10px}
.stt-head h3{margin:0;font-size:15px;color:var(--text-heading);display:flex;align-items:center;gap:8px}
.stt-head small{font-size:12px;color:var(--text-muted)}
.stt-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.stt-card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;padding:16px 18px;position:relative;overflow:hidden}
.stt-card:before{content:"";position:absolute;inset:0 auto 0 0;width:4px;background:var(--stt-c,#6366f1)}
.stt-card .t{font-size:12px;color:var(--text-muted);font-weight:600;display:flex;align-items:center;gap:7px}
.stt-card .t i{color:var(--stt-c,#6366f1)}
.stt-card .v{font-size:24px;font-weight:800;color:var(--text-heading);margin-top:6px;line-height:1.15;word-break:break-word}
.stt-card .s{font-size:11.5px;color:var(--text-muted);margin-top:5px;line-height:1.4}
.stt-card .v small{font-size:13px;font-weight:700;color:var(--text-secondary)}
.stt-units{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:5px;font-size:11.5px;color:var(--text-secondary)}
.stt-units b{color:var(--text-heading)}
@media(max-width:1100px){.stt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:560px){.stt-grid{grid-template-columns:1fr}.stt-card .v{font-size:21px}}`;
    document.head.appendChild(st);

    function mount() {
        let box = document.getElementById('sttBox');
        if (box) return box;
        const grid = document.querySelector('.page-content .stat-grid');
        if (!grid) return null;
        box = document.createElement('div'); box.id = 'sttBox'; box.className = 'stt-box';
        grid.insertAdjacentElement('afterend', box);
        // O card antigo era o valor pelo custo: deixa o nome claro
        const lbl = grid.querySelectorAll('.stat-label')[1];
        if (lbl && /Valor total em estoque/i.test(lbl.textContent)) lbl.textContent = 'Valor em estoque (custo)';
        return box;
    }

    function render(all, shown) {
        const box = mount(); if (!box) return;
        const list = (shown || []).filter(p => p.productType !== 'service' && p.controlStock !== false);
        const filtered = Array.isArray(all) && list.length !== all.filter(p => !p.deleted).length;
        let cost = 0, sale = 0, withStock = 0;
        const byUnit = {};
        list.forEach(p => {
            const q = Math.max(0, Number(p.currentStock) || 0);
            if (q > 0) withStock++;
            cost += q * (Number(p.costPrice) || 0);
            sale += q * (Number(p.salePrice || p.price) || 0);
            const u = C ? C.norm(p.unit || 'un') : (p.unit || 'un');
            byUnit[u] = (byUnit[u] || 0) + q;
        });
        const profit = sale - cost, margin = cost > 0 ? (profit / cost * 100) : 0, markup = sale > 0 ? (profit / sale * 100) : 0;
        const units = Object.entries(byUnit).filter(([, q]) => q > 0).sort((a, b) => b[1] - a[1]);
        const main = units[0] || ['un', 0];
        box.innerHTML = `<div class="stt-head"><h3><i class="fas fa-calculator" style="color:var(--accent)"></i> Totalização do estoque</h3>
<small>${filtered ? `Mostrando os totais do filtro: ${list.length} produto${list.length === 1 ? '' : 's'}` : `Todos os ${list.length} produtos com controle de estoque`}</small></div>
<div class="stt-grid">
 <div class="stt-card" style="--stt-c:#3b82f6"><div class="t"><i class="fas fa-cubes"></i> Quantidade em estoque</div>
  <div class="v">${qty(main[1], main[0])} <small>${esc(unitAbbr(main[0]))}</small></div>
  ${units.length > 1 ? `<div class="stt-units">${units.slice(1).map(([u, q]) => `<span><b>${qty(q, u)}</b> ${esc(unitAbbr(u))}</span>`).join('')}</div>` : ''}
  <div class="s">${withStock} de ${list.length} produto${list.length === 1 ? '' : 's'} com saldo</div></div>
 <div class="stt-card" style="--stt-c:#f59e0b"><div class="t"><i class="fas fa-receipt"></i> Valor de custo</div>
  <div class="v">${money(cost)}</div><div class="s">Quanto o estoque custou (quantidade × custo)</div></div>
 <div class="stt-card" style="--stt-c:#10b981"><div class="t"><i class="fas fa-tags"></i> Valor de venda</div>
  <div class="v">${money(sale)}</div><div class="s">Se vender tudo pelo preço atual (quantidade × preço)</div></div>
 <div class="stt-card" style="--stt-c:${profit >= 0 ? '#8b5cf6' : '#ef4444'}"><div class="t"><i class="fas fa-chart-line"></i> Lucro estimado</div>
  <div class="v" style="color:${profit >= 0 ? 'var(--success)' : 'var(--danger,#ef4444)'}">${money(profit)}</div>
  <div class="s">Margem sobre o custo: <b>${margin.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b> · sobre a venda: <b>${markup.toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%</b></div></div>
</div>`;
    }

    // Alertas de estoque com os produtos reais (o HTML antigo trazia exemplos fixos de bebida)
    function renderAlerts(all) {
        const boxes = document.querySelectorAll('.stock-alerts-grid');
        if (!boxes.length || !Array.isArray(all)) return;
        const list = all.filter(p => !p.deleted && p.productType !== 'service' && p.controlStock !== false);
        const zero = list.filter(p => (Number(p.currentStock) || 0) <= 0);
        const low = list.filter(p => { const s = Number(p.currentStock) || 0; return s > 0 && s <= (Number(p.minStock) || 5); });
        const alerts = zero.concat(low);
        const html = alerts.length ? alerts.map(p => {
            const s = Number(p.currentStock) || 0, isZero = s <= 0, u = unitAbbr(p.unit);
            const c = isZero ? '239,68,68' : '245,158,11', tc = isZero ? '#ef4444' : '#f59e0b';
            return `<div style="padding:12px;border-radius:10px;background:rgba(${c},.08);border:1px solid rgba(${c},.25)">
<div style="display:flex;justify-content:space-between;align-items:center;gap:8px"><strong style="color:var(--text-primary);font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.name)}</strong>
<span class="badge ${isZero ? 'badge-danger' : 'badge-warning'}" style="font-size:10px;flex:0 0 auto">${isZero ? 'SEM ESTOQUE' : 'BAIXO'}</span></div>
<div style="font-size:12px;color:var(--text-muted);margin-top:4px">Estoque: <strong style="color:${tc}">${qty(s, p.unit)}</strong> ${esc(u.toLowerCase())} · Mínimo: ${qty(Number(p.minStock) || 5, p.unit)} ${esc(u.toLowerCase())}</div></div>`;
        }).join('') : '<p style="color:var(--text-muted);font-size:13px;margin:0"><i class="fas fa-circle-check" style="color:var(--success);margin-right:6px"></i>Tudo certo: nenhum alerta de estoque.</p>';
        boxes.forEach(b => { b.innerHTML = html; });
    }

    document.addEventListener('dp:stock-render', e => {
        try { render(e.detail && e.detail.all, e.detail && e.detail.shown); } catch (err) { console.warn('totais do estoque', err); }
        try { renderAlerts(e.detail && e.detail.all); } catch (err) { console.warn('alertas do estoque', err); }
    });
    window.dpStockTotals = render;
})();
