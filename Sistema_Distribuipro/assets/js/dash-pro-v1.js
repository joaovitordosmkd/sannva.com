/* DistribuiPro Dashboard Pro 1.0
   - Setas de crescimento reais (comparando com o período anterior) no lugar dos números fixos.
   - Minigráfico de 14 dias no faturamento.
   - Meta do mês com anel de progresso, previsão de fechamento e quanto falta por dia.
   - Destaques dos últimos 30 dias: melhor dia, horário de pico, produto campeão e clientes.
   - Gráficos corrigidos: eixo começa no zero (sem "R$ -1"), valores em reais, comparação com o
     período anterior e legenda própria nas formas de pagamento (sem "undefined").
   Lê os mesmos dados que o painel já carregou (não faz leituras extras no banco). */
(() => {
  'use strict';
  if (typeof window.loadDashboard !== 'function') return;
  const DAY = 864e5;
  const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const brlShort = v => { v = Number(v) || 0; const a = Math.abs(v); if (a >= 1e6) return 'R$ ' + (v / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mi'; if (a >= 1e3) return 'R$ ' + (v / 1e3).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + ' mil'; return 'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 }); };
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const dateOf = v => (v && v.toDate ? v.toDate() : new Date(v || 0));
  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const done = s => s && ['completed','delivered'].includes(s.status);
  const sumIn = (sales, a, b) => { let t = 0, n = 0; for (const s of sales) { if (!done(s)) continue; const d = dateOf(s.createdAt); if (d >= a && d <= b) { t += Number(s.total) || 0; n++; } } return { t, n }; };
  const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();

  /* ---------- Reaproveita a leitura do painel (sem ler o banco duas vezes) ---------- */
  const origFetch = window.fetchAll, cache = {};
  if (typeof origFetch === 'function') {
    window.fetchAll = (c, l, o) => { const k = c + ':' + l + ':' + (o && typeof o === 'object' ? JSON.stringify(o) : (o || '')), e = cache[k]; if (e && Date.now() - e.t < 5000) return e.p; const p = origFetch(c, l, o); cache[k] = { t: Date.now(), p }; return p; };
  }
  let lastSales = [], lastProducts = [];

  /* ---------- Períodos de comparação ---------- */
  function ranges(period) {
    const now = new Date(), today = sod(now);
    if (period === 'week') { const a = new Date(today - 6 * DAY); return { cur: [a, now], prev: [new Date(a - 7 * DAY), new Date(a - 1)], label: 'vs. 7 dias anteriores' }; }
    if (period === 'month') {
      const a = new Date(now.getFullYear(), now.getMonth(), 1), pa = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const pDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      const pb = new Date(pa.getFullYear(), pa.getMonth(), Math.min(now.getDate(), pDays), now.getHours(), now.getMinutes());
      return { cur: [a, now], prev: [pa, pb], label: 'vs. mesmo período do mês passado' };
    }
    return { cur: [today, now], prev: [new Date(today - DAY), new Date(now - DAY)], label: 'vs. ontem até este horário' };
  }
  function chip(el, cur, prev, label) {
    if (!el) return;
    el.hidden = false; el.title = label;
    if (!prev && !cur) { el.className = 'stat-change dpd-flat'; el.innerHTML = '<i class="fas fa-minus"></i> sem movimento'; return; }
    if (!prev) { el.className = 'stat-change up'; el.innerHTML = '<i class="fas fa-bolt"></i> novo'; return; }
    const pct = (cur - prev) / prev * 100, up = pct >= 0;
    el.className = 'stat-change ' + (Math.abs(pct) < 0.5 ? 'dpd-flat' : up ? 'up' : 'down');
    el.innerHTML = `<i class="fas fa-arrow-${up ? 'up' : 'down'}"></i> ${Math.abs(pct).toLocaleString('pt-BR', { maximumFractionDigits: Math.abs(pct) < 10 ? 1 : 0 })}%`;
  }
  function trends(period, sales) {
    const r = ranges(period), c = sumIn(sales, ...r.cur), p = sumIn(sales, ...r.prev);
    const card = id => document.getElementById(id)?.closest('.stat-card');
    chip(card('statRevenue')?.querySelector('.stat-change'), c.t, p.t, r.label);
    chip(card('statOrders')?.querySelector('.stat-change'), c.n, p.n, r.label);
    chip(card('statTicket')?.querySelector('.stat-change'), c.n ? c.t / c.n : 0, p.n ? p.t / p.n : 0, r.label);
    // Atalhos nos cartões sem comparação
    [['statPending', 'pedidos.html', 'Ver pedidos'], ['statDelivered', 'entregas.html', 'Ver entregas'], ['statLowStock', 'estoque.html', 'Ver estoque']].forEach(([id, href, txt]) => {
      const cd = card(id); if (!cd || cd.querySelector('.dpd-link')) return;
      const a = document.createElement('a'); a.className = 'dpd-link'; a.href = href; a.innerHTML = `${txt} <i class="fas fa-arrow-right"></i>`; cd.appendChild(a);
    });
  }

  /* ---------- 36.6 · Lucro bruto (faturamento − custo dos produtos vendidos) ---------- */
  const costOf = (s, pm) => (s.items || []).reduce((a, i) => { if (i.isService) return a; const own = Number(i.costPrice) || 0; const unit = own > 0 ? own : Number(((pm || {})[i.productId] || {}).costPrice) || 0; return a + (Number(i.quantity) || 0) * (Number(i._factor) || 1) * unit; }, 0);
  const prodMapOf = products => { const m = {}; (products || []).forEach(p => { m[p.id] = p; }); return m; };
  function profitCard(period, sales, products) {
    const revCard = document.getElementById('statRevenue')?.closest('.stat-card'); if (!revCard) return;
    let card = document.getElementById('dpdProfitCard');
    if (!card) card = profitShell(revCard);
    const pm = prodMapOf(products), r = ranges(period);
    const calc = (a, b) => { let rev = 0, cost = 0; for (const s of sales) { if (!done(s)) continue; const d = dateOf(s.createdAt); if (d >= a && d <= b) { rev += Number(s.total) || 0; cost += costOf(s, pm); } } return { rev, cost, profit: rev - cost }; };
    const c = calc(...r.cur), p = calc(...r.prev);
    card.querySelector('#statProfit').textContent = brl(c.profit);
    card.querySelector('.stat-label').innerHTML = `Lucro bruto<small class="dpc-sub">Margem ${c.rev ? Math.round(c.profit / c.rev * 100) : 0}%</small>`;
    chip(card.querySelector('.stat-change'), c.profit, p.profit, r.label);
    card.title = `Faturamento ${brl(c.rev)} − custo dos produtos vendidos ${brl(c.cost)} (custo gravado em cada item da venda ou no cadastro do produto)`;
  }
  // Resumo financeiro: o lucro estimado desconta também o custo dos produtos vendidos no mês
  const origFin = window.renderFinancial;
  if (typeof origFin === 'function') window.renderFinancial = function (receitas, despesas, aReceber) {
    const r = origFin.apply(this, arguments);
    (async () => {
      try {
        const [sales, products] = await Promise.all([window.fetchAll('sales', 2000, window.dashSalesOpts ? dashSalesOpts() : 'createdAt'), window.fetchAll('products', window.DASH_PRODUCTS ? 10000 : 500, window.DASH_PRODUCTS)]);
        const pm = prodMapOf(products), n = new Date(), mStart = new Date(n.getFullYear(), n.getMonth(), 1);
        let cmv = 0; for (const s of sales) { if (done(s) && dateOf(s.createdAt) >= mStart) cmv += costOf(s, pm); }
        const lucroEl = document.getElementById('finLucro'); if (!lucroEl) return;
        const lucroRow = lucroEl.parentElement;
        let cmvRow = document.getElementById('dpdCmvRow');
        if (!cmvRow) { cmvRow = document.createElement('div'); cmvRow.id = 'dpdCmvRow'; cmvRow.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:12px 16px;background:var(--bg-secondary);border-radius:var(--radius-md)'; cmvRow.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><i class="fas fa-boxes-stacked" style="color:var(--text-muted)"></i><span style="font-size:13px;color:var(--text-secondary)">Custo dos produtos vendidos</span></div><span class="mono fw-bold" style="color:var(--text-secondary)" id="finCMV">—</span>'; lucroRow.insertAdjacentElement('beforebegin', cmvRow); }
        document.getElementById('finCMV').textContent = '- ' + brl(cmv);
        const lucro = (Number(receitas) || 0) - (Number(despesas) || 0) - cmv;
        lucroEl.textContent = brl(lucro); lucroEl.style.color = lucro >= 0 ? 'var(--accent)' : 'var(--danger)';
        const lbl = lucroRow.querySelector('span'); if (lbl && !/custo/.test(lbl.textContent)) lbl.innerHTML = 'Lucro estimado <small style="color:var(--text-muted)">(receitas − custo dos produtos − despesas)</small>';
      } catch (e) { console.warn('resumo financeiro:', e); }
    })();
    return r;
  };

  /* ---------- 39.16 · Cards no novo visual: ícone + nome em cima, selo de status no canto ---------- */
  // [id do valor, tipo, ícone, canto ('info' = ícone de ajuda com explicação, ou ícone do selo), explicação]
  const KINDS = [
    ['statRevenue', 'rev', 'fa-chart-simple', 'info', 'Soma das vendas concluídas no período escolhido (Hoje, Semana ou Mês). A seta compara com o período anterior e o gráfico mostra os últimos 14 dias.'],
    ['statProfit', 'profit', 'fa-coins', 'info', 'Faturamento menos o custo dos produtos vendidos (custo gravado em cada item da venda ou no cadastro do produto). O gráfico mostra os últimos 14 dias.'],
    ['statOrders', 'orders', 'fa-cart-shopping', '', 'Vendas concluídas no período. O gráfico mostra os últimos 14 dias.'],
    ['statTicket', 'ticket', 'fa-receipt', '', 'Valor médio de cada venda no período. O gráfico mostra os últimos 14 dias.'],
    ['statPending', 'pending', 'fa-file-lines', 'fa-clock', ''],
    ['statDelivered', 'delivered', 'fa-truck', 'fa-circle-check', ''],
    ['statLowStock', 'low', 'fa-box', 'fa-triangle-exclamation', '']
  ];
  function profitShell(revCard) {
    const card = document.createElement('div'); card.className = 'stat-card'; card.id = 'dpdProfitCard';
    card.innerHTML = '<div class="stat-icon green"><i class="fas fa-coins"></i></div><div class="stat-value" id="statProfit">—</div><div class="stat-label">Lucro bruto<small class="dpc-sub">Margem —</small></div><span class="stat-change" hidden></span>';
    revCard.insertAdjacentElement('afterend', card); prepCard(card); return card;
  }
  function prepCard(card) {
    const k = KINDS.find(([id]) => card.querySelector('#' + id)); if (!k || card.dataset.dpc) return;
    const [, kind, icon, aux, help] = k; card.dataset.dpc = kind; card.classList.add('dpc', 'dpc-' + kind);
    const ic = card.querySelector('.stat-icon'); if (ic) ic.innerHTML = `<i class="fas ${icon}"></i>`;
    if (aux) { const s = document.createElement('span'); s.className = 'dpc-aux ' + (aux === 'info' ? 'dpc-info' : 'dpc-badge'); s.innerHTML = `<i class="fas ${aux === 'info' ? 'fa-circle-info' : aux}"></i>`; if (help) { s.title = help; s.setAttribute('aria-label', help); } card.appendChild(s); }
    else if (help) card.title = help;
  }
  function prepCards() {
    const rev = document.getElementById('statRevenue')?.closest('.stat-card');
    document.querySelectorAll('#statsGrid > .stat-card').forEach(prepCard);
    if (rev && !document.getElementById('dpdProfitCard')) profitShell(rev);
  }

  /* ---------- Minigráfico de 14 dias (faturamento, lucro, pedidos e ticket médio) ---------- */
  const SPARKS = [['statRevenue', 'rev'], ['statProfit', 'profit'], ['statOrders', 'orders'], ['statTicket', 'ticket']];
  let sparkVals = null;
  function sparkSeries(sales, products) {
    const pm = prodMapOf(products), today = sod(new Date()), out = { rev: [], profit: [], orders: [], ticket: [] };
    for (let i = 13; i >= 0; i--) {
      const a = new Date(today - i * DAY), b = new Date(+a + DAY - 1); let t = 0, n = 0, c = 0;
      for (const s of sales) { if (!done(s)) continue; const d = dateOf(s.createdAt); if (d >= a && d <= b) { t += Number(s.total) || 0; n++; c += costOf(s, pm); } }
      out.rev.push(t); out.profit.push(t - c); out.orders.push(n); out.ticket.push(n ? t / n : 0);
    }
    return out;
  }
  function drawSpark(cardEl, key, vals) {
    let svg = cardEl.querySelector('.dpd-spark');
    if (!svg) { svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'dpd-spark'); svg.setAttribute('preserveAspectRatio', 'none'); svg.setAttribute('aria-hidden', 'true'); cardEl.appendChild(svg); }
    // A largura do desenho é a do card (em pixels): as bolinhas não ficam ovais
    const box = svg.getBoundingClientRect(), w = Math.max(60, Math.round(box.width || cardEl.clientWidth - 36)), h = Math.max(24, Math.round(box.height || 46)), pad = 4;
    svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
    const max = Math.max(...vals), min = Math.min(0, ...vals);
    if (!(max > min)) { svg.innerHTML = `<path d="M${pad} ${h - pad} L${w - pad} ${h - pad}" fill="none" stroke="currentColor" stroke-width="1.6" stroke-dasharray="3 5" opacity=".35"/>`; return; }
    const step = (w - pad * 2) / (vals.length - 1);
    const pts = vals.map((v, i) => [pad + i * step, h - pad - (v - min) / (max - min) * (h - pad * 2 - 6)]);
    const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const last = pts[pts.length - 1], gid = 'dpcSg-' + key;
    svg.innerHTML = `<defs><linearGradient id="${gid}" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="currentColor" stop-opacity=".22"/><stop offset="1" stop-color="currentColor" stop-opacity="0"/></linearGradient></defs>`
      + `<path d="${line} L${last[0].toFixed(1)} ${h} L${pad} ${h}Z" fill="url(#${gid})"/><path d="${line}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/>`
      + pts.slice(0, -1).map(p => `<circle cx="${p[0].toFixed(1)}" cy="${p[1].toFixed(1)}" r="2.1" fill="currentColor"/>`).join('')
      + `<circle cx="${last[0].toFixed(1)}" cy="${last[1].toFixed(1)}" r="3.6" fill="currentColor" stroke="var(--dpc-bg, #fff)" stroke-width="1.6"/>`;
  }
  function spark(sales, products) {
    if (sales) sparkVals = sparkSeries(sales, products);
    if (!sparkVals) return;
    SPARKS.forEach(([id, key]) => { const c = document.getElementById(id)?.closest('.stat-card'); if (c) drawSpark(c, key, sparkVals[key]); });
  }
  let sparkT = 0; window.addEventListener('resize', () => { clearTimeout(sparkT); sparkT = setTimeout(() => spark(), 120); });

  /* ---------- Meta do mês + destaques ---------- */
  const GOAL_KEY = 'dp_goal_month_v1';
  // 36.6 · A meta da loja fica no banco (coleção goals, doc AAAA-MM — a mesma da tela Metas); localStorage só como reserva
  const goalDocId = () => { const n = new Date(); return n.getFullYear() + '-' + String(n.getMonth() + 1).padStart(2, '0'); };
  let dbGoal = null;
  async function loadDbGoal() { try { const d = await db.collection('goals').doc(goalDocId()).get(); dbGoal = d.exists ? (Number((d.data() || {}).store) || 0) : 0; } catch (e) { dbGoal = null; } }
  const getGoal = () => { if (dbGoal) return dbGoal; try { return Number(localStorage.getItem(GOAL_KEY)) || 0; } catch { return 0; } };
  const setGoal = v => {
    dbGoal = v; try { localStorage.setItem(GOAL_KEY, String(v)); } catch { }
    try {
      const FV = window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
      db.collection('goals').doc(goalDocId()).set({ month: goalDocId(), store: v, updatedAt: FV ? FV.serverTimestamp() : new Date(), updatedBy: (window.auth && auth.currentUser && auth.currentUser.uid) || '' }, { merge: true }).catch(e => console.warn('meta:', e));
    } catch (e) { }
  };
  function ensureRow() {
    let row = document.getElementById('dpdRow'); if (row) return row;
    const grid = document.getElementById('statsGrid'); if (!grid) return null;
    row = document.createElement('section'); row.id = 'dpdRow'; row.className = 'dpd-row';
    row.innerHTML = `<article class="card dpd-goal" id="dpdGoal"></article><article class="card dpd-insights" id="dpdInsights"></article>`;
    grid.insertAdjacentElement('afterend', row);
    return row;
  }
  function goalCard(sales) {
    const el = document.getElementById('dpdGoal'); if (!el) return;
    const now = new Date(), mStart = new Date(now.getFullYear(), now.getMonth(), 1), dim = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const mtd = sumIn(sales, mStart, now).t;
    const prevMonth = sumIn(sales, new Date(now.getFullYear(), now.getMonth() - 1, 1), new Date(mStart - 1)).t;
    let goal = getGoal(); const suggested = Math.max(1000, Math.ceil(((prevMonth || mtd / Math.max(1, now.getDate()) * dim) * 1.1) / 500) * 500);
    const auto = !goal; if (auto) goal = suggested;
    const pct = goal ? Math.min(100, mtd / goal * 100) : 0;
    const left = Math.max(0, goal - mtd), daysLeft = Math.max(1, dim - now.getDate() + 1);
    // 35.10 · Meta do dia fica fixa no começo do dia e o "falta hoje" cai a cada venda
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const soldToday = sumIn(sales, todayStart, now).t, soldBefore = Math.max(0, mtd - soldToday);
    const dayGoal = Math.max(0, goal - soldBefore) / daysLeft, leftToday = Math.max(0, dayGoal - soldToday);
    const nextDays = daysLeft > 1 ? left / (daysLeft - 1) : 0;
    const dayPct = dayGoal > 0 ? Math.min(100, soldToday / dayGoal * 100) : 100;
    // Previsão: conta a partir do primeiro dia com venda no mês (loja que começou no meio do mês não sai prejudicada)
    let firstDay = now.getDate();
    for (const s of sales) { if (!done(s)) continue; const d = dateOf(s.createdAt); if (d >= mStart && d <= now && d.getDate() < firstDay) firstDay = d.getDate(); }
    const periodDays = dim - firstDay + 1, elapsed = Math.max(1, now.getDate() - firstDay + now.getHours() / 24);
    const proj = mtd / elapsed * periodDays;
    const R = 52, C = 2 * Math.PI * R, ok = proj >= goal;
    if (!document.getElementById('dpdTodayCss')) {
      const st = document.createElement('style'); st.id = 'dpdTodayCss';
      st.textContent = '.dpd-today{grid-column:1/-1;padding:10px 12px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-color)}.dpd-today .h{display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap}.dpd-today dt{font-size:11px;font-weight:700;color:var(--text-muted)}.dpd-today dd{margin:0;font-size:17px;font-weight:800;font-variant-numeric:tabular-nums}.dpd-today dd.pos{color:var(--success)}.dpd-today dd.neg{color:var(--warning)}.dpd-today .bar{height:7px;border-radius:99px;background:var(--border-color);overflow:hidden;margin:8px 0 6px}.dpd-today .bar i{display:block;height:100%;border-radius:99px;background:linear-gradient(90deg,#f59e0b,#22c55e)}.dpd-today small{font-size:11px;color:var(--text-muted)}';
      document.head.appendChild(st);
    }
    const monthName = now.toLocaleDateString('pt-BR', { month: 'long' });
    el.innerHTML = `<div class="card-header"><div><div class="card-title">Meta de ${esc(monthName)}</div><div class="card-subtitle">${auto ? 'Meta sugerida · toque em editar para definir a sua' : 'Faturamento do mês até agora'}</div></div><div style="display:flex;gap:6px;flex-wrap:wrap"><a class="btn btn-sm btn-secondary" href="metas.html" title="Metas da loja e por vendedor"><i class="fas fa-bullseye"></i> Por vendedor</a><button class="btn btn-sm btn-secondary" data-dpd-goal><i class="fas fa-pen"></i> Editar</button></div></div>
      <div class="dpd-goal-body">
        <div class="dpd-ring" style="--p:${pct.toFixed(1)}"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="${R}" class="bg"/><circle cx="60" cy="60" r="${R}" class="fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pct / 100)).toFixed(1)}"/></svg><div><strong>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</strong><small>da meta</small></div></div>
        <dl class="dpd-goal-data">
          <div><dt>Vendido no mês</dt><dd>${brl(mtd)}</dd></div>
          <div><dt>Meta</dt><dd>${brl(goal)}</dd></div>
          ${left > 0 ? `<div class="dpd-today"><div class="h"><div><dt>Meta de hoje</dt><dd>${brl(dayGoal)}</dd></div><div style="text-align:right"><dt>${leftToday > 0 ? 'Falta hoje' : 'Meta do dia batida!'}</dt><dd class="${leftToday > 0 ? 'neg' : 'pos'}">${leftToday > 0 ? brl(leftToday) : (window.dpIcon ? dpIcon('party-popper') + ' ' : '') + brl(soldToday - dayGoal) + ' acima'}</dd></div></div><div class="bar"><i style="width:${dayPct.toFixed(1)}%"></i></div><small>Vendido hoje: <b>${brl(soldToday)}</b></small></div>` : ''}
          ${now.getDate() - firstDay >= 3 ? `<div><dt>Previsão de fechamento</dt><dd class="${ok ? 'pos' : 'neg'}">${brl(proj)}</dd></div>` : `<div><dt>Média por dia</dt><dd>${brl(mtd / Math.max(1, now.getDate() - firstDay + 1))}</dd></div>`}
          <div><dt>${left <= 0 ? 'Meta do mês batida!' : daysLeft > 1 ? 'Por dia, a partir de amanhã' : 'Último dia do mês'}</dt><dd>${left <= 0 ? (window.dpIcon ? dpIcon('party-popper') + ' ' : '') + brl(mtd - goal) + ' acima' : daysLeft > 1 ? brl(nextDays) : brl(left)}</dd></div>
        </dl>
      </div>
      <form class="dpd-goal-form" hidden><label>Meta de faturamento do mês (R$)<input type="text" inputmode="decimal" name="goal" value="${goal ? goal.toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : ''}"></label><button class="btn btn-primary btn-sm" type="submit">Salvar meta</button><button class="btn btn-secondary btn-sm" type="button" data-dpd-cancel>Cancelar</button></form>`;
  }
  function insights(sales, products) {
    const el = document.getElementById('dpdInsights'); if (!el) return;
    const now = new Date(), from = new Date(sod(now) - 29 * DAY);
    const list = sales.filter(s => done(s) && dateOf(s.createdAt) >= from);
    const wd = Array(7).fill(0), wdN = Array(7).fill(0), hr = Array(24).fill(0), prod = {}, cust = {};
    const seen = new Set();
    for (const s of list) {
      const d = dateOf(s.createdAt), key = d.toDateString();
      wd[d.getDay()] += Number(s.total) || 0; if (!seen.has(key)) { seen.add(key); wdN[d.getDay()]++; }
      hr[d.getHours()]++;
      (s.items || []).forEach(it => { const k = it.productName || it.productId || '—'; prod[k] = (prod[k] || 0) + (Number(it.subtotal) || Number(it.total) || (Number(it.quantity) || 0) * (Number(it.unitPrice || it.salePrice) || 0)); });
      const c = s.customerId || ''; if (c) cust[c] = (cust[c] || 0) + 1;
    }
    const days = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const wdAvg = wd.map((t, i) => wdN[i] ? t / wdN[i] : 0), bestD = wdAvg.indexOf(Math.max(...wdAvg));
    const bestH = hr.indexOf(Math.max(...hr));
    const topP = Object.entries(prod).sort((a, b) => b[1] - a[1])[0];
    const nCust = Object.keys(cust).length, back = Object.values(cust).filter(n => n > 1).length;
    const empty = !list.length;
    const tile = (icon, color, label, value, sub) => `<div class="dpd-tile"><span class="dpd-ti ${color}"><i class="fas ${icon}"></i></span><div><small>${label}</small><strong>${value}</strong><em>${sub}</em></div></div>`;
    el.innerHTML = `<div class="card-header"><div><div class="card-title">Destaques do negócio</div><div class="card-subtitle">Últimos 30 dias · ${list.length} venda(s)</div></div><span class="dpd-badge"><i class="fas fa-wand-magic-sparkles"></i> Automático</span></div>` +
      (empty ? `<div class="dpd-empty-box"><i class="fas fa-chart-line"></i><p>Assim que as vendas acontecerem, aqui aparecem seu melhor dia, horário de pico e produto campeão.</p></div>` :
        `<div class="dpd-tiles">
        ${tile('fa-calendar-check', 'green', 'Melhor dia da semana', esc(days[bestD].charAt(0).toUpperCase() + days[bestD].slice(1)), 'média de ' + brl(wdAvg[bestD]))}
        ${tile('fa-clock', 'blue', 'Horário de pico', String(bestH).padStart(2, '0') + 'h às ' + String((bestH + 1) % 24).padStart(2, '0') + 'h', hr[bestH] + ' venda(s) nesse horário')}
        ${tile('fa-crown', 'yellow', 'Produto campeão', esc(topP ? topP[0] : '—'), topP ? brl(topP[1]) + ' vendidos' : '')}
        ${tile('fa-user-group', 'purple', 'Clientes atendidos', String(nCust), nCust ? back + ' voltaram a comprar' : 'cadastre clientes no PDV')}
      </div>`);
  }

  /* ---------- Gráfico de vendas ---------- */
  function buckets(period, sales, shiftDays) {
    const labels = [], data = [], today = sod(new Date()), sh = shiftDays * DAY;
    if (period === 'today') {
      const H = new Date().getHours();
      for (let h = 0; h <= H; h++) { const a = new Date(+today + h * 36e5 - sh), b = new Date(+a + 36e5 - 1); labels.push(String(h).padStart(2, '0') + 'h'); data.push(sumIn(sales, a, b).t); }
    } else {
      const n = period === 'week' ? 7 : 30;
      for (let i = n - 1; i >= 0; i--) { const a = new Date(today - i * DAY - sh), b = new Date(+a + DAY - 1), d = new Date(today - i * DAY); labels.push(period === 'week' ? d.toLocaleDateString('pt-BR', { weekday: 'short' }).replace('.', '') : String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0')); data.push(sumIn(sales, a, b).t); }
    }
    return { labels, data };
  }
  window.updateSalesChart = function (period, allSales) {
    const cv = document.getElementById('salesChart'); if (!cv || typeof Chart === 'undefined') return;
    lastSales = allSales || lastSales;
    const shift = period === 'today' ? 1 : period === 'week' ? 7 : 30;
    const cur = buckets(period, allSales, 0), prev = buckets(period, allSales, shift);
    const accent = css('--accent') || '#6366f1', dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const max = Math.max(...cur.data, ...prev.data);
    const hexA = (c, a) => /^#[0-9a-f]{6}$/i.test(c) ? c + a : `rgba(99,102,241,${(parseInt(a, 16) / 255).toFixed(2)})`;
    const ctx = cv.getContext('2d'), g = ctx.createLinearGradient(0, 0, 0, cv.parentElement.clientHeight || 280);
    g.addColorStop(0, hexA(accent, '55')); g.addColorStop(1, hexA(accent, '00'));
    const prevLabel = period === 'today' ? 'Ontem' : period === 'week' ? '7 dias anteriores' : '30 dias anteriores';
    const bars = period === 'today';
    if (window.salesChart && window.salesChart.destroy) window.salesChart.destroy();
    try { if (typeof salesChart !== 'undefined' && salesChart && salesChart.destroy) salesChart.destroy(); } catch { }
    const chart = new Chart(ctx, {
      type: bars ? 'bar' : 'line',
      data: {
        labels: cur.labels, datasets: [
          { label: 'Período atual', data: cur.data, borderColor: accent, backgroundColor: bars ? accent : g, fill: !bars, tension: .38, borderWidth: 2.4, pointRadius: 0, pointHoverRadius: 5, borderRadius: 6, maxBarThickness: 22, order: 1 },
          { label: prevLabel, data: prev.data, borderColor: dark ? 'rgba(255,255,255,.28)' : 'rgba(15,23,42,.25)', backgroundColor: dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.07)', borderDash: bars ? [] : [5, 5], fill: false, tension: .38, borderWidth: 1.6, pointRadius: 0, pointHoverRadius: 4, borderRadius: 6, maxBarThickness: 22, order: 2 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
        plugins: { legend: { display: true, position: 'top', align: 'end', labels: { usePointStyle: true, pointStyle: 'circle', boxWidth: 7, boxHeight: 7, padding: 14 } }, tooltip: { callbacks: { label: c => ` ${c.dataset.label}: ${brl(c.raw)}` } } },
        scales: {
          x: { grid: { display: false }, ticks: { maxTicksLimit: period === 'month' ? 8 : 12, autoSkip: true } },
          y: { beginAtZero: true, min: 0, suggestedMax: max > 0 ? max * 1.15 : 100, ticks: { maxTicksLimit: 5, precision: 0, callback: v => brlShort(v) } }
        }
      }
    });
    try { salesChart = chart; } catch { window.salesChart = chart; }
    const wrap = cv.parentElement; let note = wrap.querySelector('.dpd-chart-empty');
    if (!cur.data.some(Boolean)) { if (!note) { note = document.createElement('div'); note.className = 'dpd-chart-empty'; wrap.appendChild(note); } note.innerHTML = `<i class="fas fa-chart-line"></i><b>Sem vendas ${period === 'today' ? 'hoje ainda' : 'neste período'}</b>${prev.data.some(Boolean) ? `<span>A linha cinza mostra ${prevLabel.toLowerCase()} para comparar.</span>` : ''}`; }
    else if (note) note.remove();
    const sub = cv.closest('.card')?.querySelector('.card-subtitle'); if (sub) sub.textContent = period === 'today' ? 'Faturamento por hora · comparado com ontem' : period === 'week' ? 'Faturamento dos últimos 7 dias · comparado com a semana anterior' : 'Faturamento dos últimos 30 dias · comparado com os 30 anteriores';
  };

  /* ---------- Formas de pagamento ---------- */
  window.updatePaymentChart = function (periodSales) {
    const cv = document.getElementById('paymentChart'); if (!cv || typeof Chart === 'undefined') return;
    const names = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', credito_parcelado: 'Crédito', debito: 'Débito', fiado: 'Fiado', sinal: 'Sinal da OS' };
    const colors = { Dinheiro: '#10b981', PIX: css('--accent') || '#6366f1', 'Crédito': '#f59e0b', 'Débito': '#3b82f6', Fiado: '#ef4444', Outros: '#a855f7' };
    const totals = {};
    (periodSales || []).forEach(s => (s.payments && s.payments.length ? s.payments : [{ method: s.paymentMethod || 'dinheiro', amount: s.total }]).forEach(p => { const k = names[p.method] || 'Outros'; totals[k] = (totals[k] || 0) + (Number(p.amount) || 0); }));
    const labels = Object.keys(totals).filter(k => totals[k] > 0).sort((a, b) => totals[b] - totals[a]), vals = labels.map(k => totals[k]), sum = vals.reduce((a, b) => a + b, 0);
    try { if (typeof paymentChart !== 'undefined' && paymentChart && paymentChart.destroy) paymentChart.destroy(); } catch { }
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const center = { id: 'dpdCenter', afterDraw(ch) { const { ctx, chartArea: a } = ch; if (!a) return; const x = (a.left + a.right) / 2, y = (a.top + a.bottom) / 2; ctx.save(); ctx.textAlign = 'center'; ctx.fillStyle = dark ? '#9aa0ad' : '#64748b'; ctx.font = "600 11px 'Plus Jakarta Sans', sans-serif"; ctx.fillText(sum ? 'Total' : 'Sem vendas', x, y - (sum ? 10 : 0)); if (sum) { ctx.fillStyle = dark ? '#f4f5f7' : '#0f172a'; ctx.font = "800 16px 'Plus Jakarta Sans', sans-serif"; ctx.fillText(brlShort(sum), x, y + 12); } ctx.restore(); } };
    const chart = new Chart(cv.getContext('2d'), {
      type: 'doughnut',
      data: { labels: labels.length ? labels : ['Sem vendas'], datasets: [{ data: vals.length ? vals : [1], backgroundColor: labels.length ? labels.map(l => colors[l]) : [dark ? 'rgba(255,255,255,.08)' : 'rgba(15,23,42,.08)'], borderWidth: 0, hoverOffset: labels.length ? 6 : 0, spacing: labels.length > 1 ? 2 : 0 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '72%', plugins: { legend: { display: false }, tooltip: { enabled: !!labels.length, callbacks: { label: c => ` ${c.label}: ${brl(c.raw)} (${Math.round(c.raw / sum * 100)}%)` } } } },
      plugins: [center]
    });
    try { paymentChart = chart; } catch { window.paymentChart = chart; }
    const card = cv.closest('.card'); let lg = card.querySelector('.dpd-legend');
    if (!lg) { lg = document.createElement('ul'); lg.className = 'dpd-legend'; card.appendChild(lg); }
    lg.innerHTML = labels.length ? labels.map((l, i) => `<li><i style="background:${colors[l]}"></i><span>${l}</span><b>${brl(vals[i])}</b><em>${Math.round(vals[i] / sum * 100)}%</em></li>`).join('') : '<li class="dpd-legend-empty">As formas de pagamento aparecem aqui quando houver vendas no período.</li>';
  };

  /* ---------- Atualização e montagem ---------- */
  function stamp() {
    const left = document.querySelector('.page-content .toolbar .toolbar-left'); if (!left) return;
    let s = document.getElementById('dpdStamp');
    if (!s) { s = document.createElement('button'); s.id = 'dpdStamp'; s.type = 'button'; s.className = 'dpd-stamp'; s.title = 'Atualizar agora'; s.addEventListener('click', () => { s.classList.add('spin'); window.loadDashboard(typeof currentPeriod !== 'undefined' ? currentPeriod : 'today'); }); left.appendChild(s); }
    s.classList.remove('spin');
    s.innerHTML = `<i class="dpd-live"></i> Atualizado às ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })} <i class="fas fa-rotate-right"></i>`;
  }
  async function enhance(period) {
    try {
      const [sales, products] = await Promise.all([window.fetchAll('sales', 2000, window.dashSalesOpts ? dashSalesOpts() : 'createdAt'), window.fetchAll('products', window.DASH_PRODUCTS ? 10000 : 500, window.DASH_PRODUCTS)]);
      lastSales = sales || []; lastProducts = products || [];
      trends(period, lastSales); profitCard(period, lastSales, lastProducts); spark(lastSales, lastProducts);
      await loadDbGoal();
      if (ensureRow()) { goalCard(lastSales); insights(lastSales, lastProducts); }
      stamp();
    } catch (e) { console.warn('dash-pro:', e); }
  }
  const origLoad = window.loadDashboard;
  window.loadDashboard = async function (period) { const r = await origLoad.apply(this, arguments); await enhance(period || 'today'); return r; };

  // Valores fixos de exemplo que apareciam antes de carregar
  ['finReceitas', 'finDespesas', 'finLucro', 'finAReceber'].forEach(id => { const e = document.getElementById(id); if (e) e.textContent = '—'; });
  document.querySelectorAll('#statsGrid .stat-change').forEach(e => { e.hidden = true; });
  prepCards();
  const alerts = document.getElementById('alertsContainer'); if (alerts) alerts.innerHTML = '<div class="dpd-empty-box"><i class="fas fa-spinner fa-spin"></i><p>Verificando alertas…</p></div>';

  // Meta: editar / salvar
  document.addEventListener('click', e => {
    const card = document.getElementById('dpdGoal'); if (!card) return;
    if (e.target.closest('[data-dpd-goal]')) { const f = card.querySelector('.dpd-goal-form'); f.hidden = false; f.querySelector('input').focus(); }
    if (e.target.closest('[data-dpd-cancel]')) card.querySelector('.dpd-goal-form').hidden = true;
  });
  document.addEventListener('submit', e => {
    if (!e.target.closest('.dpd-goal-form')) return; e.preventDefault();
    let v = String(e.target.elements.goal.value || '').replace(/[R$\s]/g, ''); if (v.includes(',')) v = v.replace(/\./g, '').replace(',', '.');
    const n = Math.round(Number(v) * 100) / 100; if (!Number.isFinite(n) || n <= 0) { window.Toast?.warning?.('Informe um valor, como 15.000,00'); return; }
    setGoal(n); goalCard(lastSales); window.Toast?.success?.('Meta do mês salva.');
  });
  document.body.classList.add('dpd');
})();

/* 37.3 · Número grande (ex.: R$ 1.234.567,89) que não cabe no card: diminui a fonte só daquele card até caber. */
(function () {
  'use strict';
  function fit(el) {
    if (!el || !el.isConnected) return;
    el.style.removeProperty('font-size');
    const box = el.clientWidth; if (!box) return;
    const r = document.createRange(); r.selectNodeContents(el);
    let w = r.getBoundingClientRect().width, size = parseFloat(getComputedStyle(el).fontSize) || 24, n = 0;
    while (w > box && size > 13 && n++ < 20) { size -= 1; el.style.setProperty('font-size', size + 'px', 'important'); w = r.getBoundingClientRect().width; }
  }
  let t = 0;
  const all = () => { clearTimeout(t); t = setTimeout(() => document.querySelectorAll('.stat-card .stat-value').forEach(fit), 60); };
  const start = () => {
    all();
    new MutationObserver(m => { if (m.some(x => { const el = x.target.nodeType === 3 ? x.target.parentElement : x.target; return !!(el && el.closest && el.closest('.stat-value')); })) all(); })
      .observe(document.body, { subtree: true, childList: true, characterData: true });
    window.addEventListener('resize', all);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
