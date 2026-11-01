/* DistribuiPRO Caixa Pro 1.0
   - "Dinheiro na gaveta" (troco inicial + vendas em dinheiro + suprimentos − sangrias) sempre à vista.
   - Caixa aberto há quanto tempo, nº de vendas e ticket médio.
   - Formas de pagamento em barras com % (no lugar de 6 cartões apertados).
   - Movimentações com etiqueta colorida por tipo; histórico mostra "Sobrou / Faltou".
   - Valores rápidos em Abrir caixa, Suprimento e Sangria; no fechamento, botão para usar o valor esperado.
   Só exibe: os cálculos de abertura, sangria e fechamento continuam os mesmos. */
(() => {
  'use strict';
  if (typeof window.renderCashState !== 'function') return;
  const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const tsDate = t => (t && t.toDate ? t.toDate() : t && t.seconds ? new Date(t.seconds * 1000) : t ? new Date(t) : null);
  const getCash = () => { try { return currentCash; } catch { return null; } };
  const getMovs = () => { try { return Array.isArray(cashMovements) ? cashMovements : []; } catch { return []; } };
  const METHODS = [['dinheiro', 'Dinheiro', '#10b981', 'fa-money-bill-wave'], ['pix', 'PIX', '#6366f1', 'fa-qrcode'], ['credito', 'Crédito', '#a855f7', 'fa-credit-card'], ['debito', 'Débito', '#06b6d4', 'fa-credit-card'], ['fiado', 'Fiado', '#f59e0b', 'fa-handshake'], ['outros', 'Outros', '#94a3b8', 'fa-layer-group']];
  let lastHistory = [], timer = 0;
  document.body.classList.add('cxp');

  function calc() {
    const c = getCash(), m = getMovs().filter(x => x.reversed !== true);
    const sales = m.filter(x => x.type === 'sale');
    const by = {}; METHODS.forEach(([k]) => by[k] = 0);
    sales.forEach(s => { const k = by[s.paymentMethod] !== undefined ? s.paymentMethod : 'outros'; by[k] += Number(s.amount) || 0; });
    const supply = m.filter(x => x.type === 'supply').reduce((a, x) => a + (Number(x.amount) || 0), 0);
    const withdraw = m.filter(x => x.type === 'withdraw').reduce((a, x) => a + Math.abs(Number(x.amount) || 0), 0);
    const total = Object.values(by).reduce((a, b) => a + b, 0), initial = Number(c?.initialAmount) || 0;
    return { c, by, supply, withdraw, total, initial, n: sales.length, drawer: initial + by.dinheiro + supply - withdraw };
  }
  const since = d => { if (!d) return ''; const m = Math.max(0, Math.round((Date.now() - d) / 6e4)); const h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}min` : `${m} min`; };

  function hero(k) {
    const card = document.getElementById('cashActions')?.closest('.card'); if (!card) return;
    card.classList.add('cx-hero', k.c ? 'is-open' : 'is-closed');
    card.classList.toggle('is-open', !!k.c); card.classList.toggle('is-closed', !k.c);
    const label = document.getElementById('cashStatusLabel');
    if (label) label.innerHTML = k.c ? '<span class="cx-pill on"><i></i>Caixa aberto</span>' : '<span class="cx-pill off"><i></i>Caixa fechado</span>';
    const info = document.getElementById('cashOpenInfo'), opened = tsDate(k.c?.openedAt);
    if (info && k.c) info.innerHTML = `Aberto há <b>${since(opened)}</b> · desde ${opened ? opened.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—'} · troco inicial ${brl(k.initial)}`;
    let box = document.getElementById('cxKpis');
    if (!box) { box = document.createElement('div'); box.id = 'cxKpis'; box.className = 'cx-kpis'; card.appendChild(box); }
    if (k.c) {
      box.innerHTML = `<div class="cx-kpi main"><small><i class="fas fa-money-bill-wave"></i> Dinheiro na gaveta</small><strong>${brl(k.drawer)}</strong><em>troco ${brl(k.initial)} + dinheiro ${brl(k.by.dinheiro)}${k.supply ? ' + supr. ' + brl(k.supply) : ''}${k.withdraw ? ' − sangria ' + brl(k.withdraw) : ''}</em></div>
        <div class="cx-kpi"><small>Vendas neste caixa</small><strong>${brl(k.total)}</strong><em>todas as formas</em></div>
        <div class="cx-kpi"><small>Nº de vendas</small><strong>${k.n}</strong><em>ticket médio ${brl(k.n ? k.total / k.n : 0)}</em></div>`;
    } else {
      const h = lastHistory[0], d = h ? tsDate(h.closedAt) : null, diff = Number(h?.difference) || 0;
      box.innerHTML = h ? `<div class="cx-kpi"><small>Último fechamento</small><strong>${d ? d.toLocaleDateString('pt-BR') : '—'}</strong><em>${h.operatorName || ''}</em></div><div class="cx-kpi"><small>Valor conferido</small><strong>${brl(h.actualAmount)}</strong><em>${diff === 0 ? 'sem diferença' : diff > 0 ? 'sobrou ' + brl(diff) : 'faltou ' + brl(-diff)}</em></div>` : '<div class="cx-kpi"><small>Pronto para começar</small><strong>Abra o caixa</strong><em>informe o troco inicial da gaveta</em></div>';
    }
  }
  function payments(k) {
    const grid = document.querySelector('.page-content > .stat-grid'); if (!grid) return;
    let card = document.getElementById('cxPay');
    if (!card) { card = document.createElement('section'); card.id = 'cxPay'; card.className = 'card cx-pay'; grid.insertAdjacentElement('beforebegin', card); }
    const list = METHODS.filter(([key]) => k.by[key] > 0 || ['dinheiro', 'pix', 'credito', 'debito'].includes(key)).sort((a, b) => k.by[b[0]] - k.by[a[0]]);
    const max = Math.max(1, ...list.map(([key]) => k.by[key]));
    card.innerHTML = `<div class="cx-pay-head"><h4><i class="fas fa-chart-simple"></i> Formas de pagamento</h4><span>${k.c ? 'neste caixa' : 'abra o caixa para acompanhar'}</span></div>
      <div class="cx-bars">${list.map(([key, name, color, icon]) => { const v = k.by[key], p = k.total ? Math.round(v / k.total * 100) : 0; return `<div class="cx-bar"><span class="cx-bar-ic" style="color:${color};background:${color}22"><i class="fas ${icon}"></i></span><div class="cx-bar-main"><div class="cx-bar-top"><b>${name}</b><span>${brl(v)}<em>${p}%</em></span></div><div class="cx-track"><i style="width:${Math.round(v / max * 100)}%;background:${color}"></i></div></div></div>`; }).join('')}</div>
      <div class="cx-pay-foot"><span>Total em vendas</span><b>${brl(k.total)}</b></div>`;
  }
  function tables() {
    const tb = document.querySelectorAll('.data-table tbody');
    const map = { 'Venda': 'sale', 'Ordem de Serviço': 'os', 'Suprimento': 'supply', 'Sangria': 'withdraw', 'Abertura': 'open' };
    tb[0]?.querySelectorAll('tr').forEach(tr => {
      const td = tr.children[1]; if (!td || td.dataset.cx) return; td.dataset.cx = '1';
      const txt = td.textContent.trim(), base = txt.split(' · ')[0], cls = map[base];
      if (cls) td.innerHTML = `<span class="cx-chip ${cls}">${txt}</span>`;
    });
    tb[1]?.querySelectorAll('tr').forEach(tr => {
      const cells = tr.children; if (cells.length < 5 || cells[4].dataset.cx) return; cells[4].dataset.cx = '1';
      const v = Number(String(cells[3].textContent).replace(/[^\d,-]/g, '').replace(',', '.')) || 0;
      cells[4].innerHTML = v === 0 ? '<span class="badge badge-success">Conferido</span>' : v > 0 ? '<span class="badge badge-info">Sobrou</span>' : '<span class="badge badge-danger">Faltou</span>';
    });
  }

  const orig = window.renderCashState;
  window.renderCashState = function (history) {
    lastHistory = Array.isArray(history) ? history : [];
    const r = orig.apply(this, arguments);
    try { const k = calc(); hero(k); payments(k); tables(); } catch (e) { console.warn('caixa-pro', e); }
    return r;
  };
  clearInterval(timer); timer = setInterval(() => { if (getCash()) try { hero(calc()); } catch { } }, 60000);

  /* ---------- Valores rápidos nos modais ---------- */
  function chips(input, values) {
    if (!input || input.dataset.cxChips) return; input.dataset.cxChips = '1';
    const row = document.createElement('div'); row.className = 'cx-quick';
    row.innerHTML = values.map(v => `<button type="button" data-v="${v}">${v ? brl(v).replace(',00', '') : 'R$ 0'}</button>`).join('');
    row.addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; input.value = Number(b.dataset.v).toFixed(2); input.dispatchEvent(new Event('input', { bubbles: true })); input.focus(); });
    input.insertAdjacentElement('afterend', row);
  }
  chips(document.getElementById('supplyAmount'), [20, 50, 100, 200]);
  chips(document.getElementById('withdrawAmount'), [50, 100, 200, 500]);
  new MutationObserver(() => {
    const ini = document.getElementById('cashInitialAmount'); if (ini) chips(ini, [0, 100, 200, 300]);
    const counted = document.getElementById('valorContado'), modal = document.getElementById('modalFechamento');
    if (counted && modal?.classList.contains('active') && !modal.querySelector('.cx-fill')) {
      const k = calc(); const b = document.createElement('button'); b.type = 'button'; b.className = 'cx-fill';
      b.innerHTML = `<i class="fas fa-wand-magic-sparkles"></i> Usar o esperado: ${brl(k.drawer)}`;
      b.addEventListener('click', () => { counted.value = k.drawer.toFixed(2); ['input', 'keyup', 'change'].forEach(ev => counted.dispatchEvent(new Event(ev, { bubbles: true }))); });
      counted.insertAdjacentElement('afterend', b);
    }
  }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });

  // Se o caixa já foi desenhado antes deste arquivo carregar, aplica o layout novo
  const refresh = () => { if (!document.getElementById('cxKpis') && document.getElementById('cashStatusLabel')?.textContent.trim() !== '—' && typeof loadCashState === 'function') loadCashState(); };
  setTimeout(refresh, 300); setTimeout(refresh, 1500);
})();
