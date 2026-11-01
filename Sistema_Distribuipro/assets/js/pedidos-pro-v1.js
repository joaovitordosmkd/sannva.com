/* DistribuiPRO Pedidos Pro 1.0
   - Busca (número, cliente, produto, endereço) e período (Hoje / 7 dias / 30 dias / Tudo).
   - Colunas sem repetição: Balcão/Retirada · Delivery em aberto · Entregues e cancelados
     (antes a mesma venda de balcão aparecia em duas colunas).
   - Delivery em aberto sempre aparece (de qualquer dia), com tempo de espera e botão "Entregue".
   - No celular, as colunas viram abas (antes era preciso rolar todas as vendas até achar o delivery).
   - Números do topo do dia, comparados com ontem. */
(() => {
  'use strict';
  if (typeof window.renderKanban !== 'function') return;
  const DAY = 864e5;
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const dateOf = s => (s.createdAt && s.createdAt.toDate ? s.createdAt.toDate() : new Date(s.createdAt || 0));
  const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const getAll = () => { try { return Array.isArray(allSales) ? allSales : []; } catch { return []; } };
  const state = { q: '', period: 'today', tab: 'balcao' };
  try { state.period = localStorage.getItem('pdk_period') || 'today'; } catch { }
  document.body.classList.add('pdk');

  const sod = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  function inPeriod(s) {
    if (state.period === 'all') return true;
    const d = dateOf(s), today = sod(new Date());
    if (state.period === 'today') return d >= today;
    return d >= new Date(today - (state.period === '7' ? 6 : 29) * DAY);
  }
  function match(s) {
    if (!state.q) return true;
    const q = norm(state.q).replace(/^#?v-?/, '');
    const hay = norm([s.saleNumber, String(s.saleNumber || '').padStart(4, '0'), s.customerName, s.address, s.motoboyName, (s.items || []).map(i => i.productName).join(' ')].join(' '));
    return hay.includes(q);
  }
  const isOpenDelivery = s => (s.type === 'delivery') && (!s.status || ['new', 'preparing', 'waiting', 'delivering'].includes(s.status));
  const ago = d => { const m = Math.max(0, Math.round((Date.now() - d) / 6e4)); if (m < 60) return m + ' min'; const h = Math.floor(m / 60); return h < 24 ? h + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') : Math.floor(h / 24) + ' dia(s)'; };

  /* ---------- Barra de busca e filtros ---------- */
  function mountToolbar() {
    const board = document.getElementById('kanbanBoard'); if (!board || document.getElementById('pdkBar')) return;
    const bar = document.createElement('div'); bar.id = 'pdkBar'; bar.className = 'pdk-bar';
    bar.innerHTML = `<label class="pdk-search"><i class="fas fa-search"></i><input type="search" placeholder="Buscar nº da venda, cliente, produto ou endereço" autocomplete="off"></label>
      <div class="pdk-seg" role="group" aria-label="Período">${[['today', 'Hoje'], ['7', '7 dias'], ['30', '30 dias'], ['all', 'Tudo']].map(([v, l]) => `<button type="button" data-p="${v}" class="${state.period === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <button type="button" class="pdk-refresh" title="Atualizar"><i class="fas fa-rotate-right"></i></button>`;
    board.insertAdjacentElement('beforebegin', bar);
    const tabs = document.createElement('div'); tabs.id = 'pdkTabs'; tabs.className = 'pdk-tabs'; board.insertAdjacentElement('beforebegin', tabs);
    let t = 0;
    bar.querySelector('input').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { state.q = e.target.value.trim(); window.renderKanban(); }, 180); });
    bar.querySelector('.pdk-seg').addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (!b) return; state.period = b.dataset.p; try { localStorage.setItem('pdk_period', state.period); } catch { } bar.querySelectorAll('[data-p]').forEach(x => x.classList.toggle('on', x === b)); window.renderKanban(); });
    bar.querySelector('.pdk-refresh').addEventListener('click', async e => { const i = e.currentTarget.querySelector('i'); i.classList.add('fa-spin'); try { await loadOrders(); } finally { i.classList.remove('fa-spin'); } });
    tabs.addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (!b) return; state.tab = b.dataset.tab; paintTabs(); });
  }
  function paintTabs(cols) {
    const tabs = document.getElementById('pdkTabs'), board = document.getElementById('kanbanBoard'); if (!tabs || !board) return;
    if (cols) tabs.innerHTML = cols.map(c => `<button type="button" data-tab="${c.id}"><i style="background:${c.dot}"></i>${c.short}<b>${c.items.length}</b></button>`).join('');
    tabs.querySelectorAll('[data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === state.tab));
    board.querySelectorAll('.kanban-col').forEach(c => c.classList.toggle('pdk-on', c.dataset.col === state.tab));
  }

  /* ---------- Colunas ---------- */
  window.renderKanban = function () {
    const board = document.getElementById('kanbanBoard'); if (!board) return;
    mountToolbar();
    const all = getAll().filter(match);
    const balcao = all.filter(s => ['balcao', 'pickup', undefined, ''].includes(s.type) && s.status !== 'cancelled' && inPeriod(s));
    const delivery = all.filter(isOpenDelivery).sort((a, b) => dateOf(a) - dateOf(b));
    const done = all.filter(s => ((s.type === 'delivery' && ['delivered', 'completed'].includes(s.status)) || s.status === 'cancelled') && inPeriod(s));
    const cols = [
      { id: 'balcao', cls: 'col-balcao', dot: '#6366f1', icon: 'fa-store', label: 'Balcão / Retirada', short: 'Balcão', items: balcao, empty: state.q ? 'Nada encontrado nesta busca' : 'Nenhuma venda de balcão no período' },
      { id: 'delivery', cls: 'col-delivery', dot: '#f59e0b', icon: 'fa-motorcycle', label: 'Delivery em aberto', short: 'Delivery', items: delivery, empty: 'Nenhuma entrega pendente' },
      { id: 'concluidos', cls: 'col-done', dot: '#10b981', icon: 'fa-check-double', label: 'Entregues e cancelados', short: 'Finalizados', items: done, empty: 'Nenhum delivery entregue ou venda cancelada no período' }
    ];
    if (!cols.some(c => c.id === state.tab)) state.tab = 'balcao';
    if (!state._auto && delivery.length) { state.tab = 'delivery'; } state._auto = true;
    board.innerHTML = cols.map(col => {
      const sum = col.items.filter(s => s.status !== 'cancelled').reduce((a, s) => a + (Number(s.total) || 0), 0);
      return `<div class="kanban-col ${col.cls}" data-col="${col.id}">
        <div class="kanban-col-header"><div class="kanban-col-title"><span class="pdk-dot" style="background:${col.dot}"></span>${col.label}</div><div class="pdk-head-r"><span class="pdk-sum">${brl(sum)}</span><span class="kanban-count">${col.items.length}</span></div></div>
        <div class="kanban-col-body">${col.items.length ? col.items.map(s => renderCard(s)).join('') : `<div class="kanban-col-empty"><i class="fas ${col.icon}"></i><span>${col.empty}</span></div>`}</div>
      </div>`;
    }).join('');
    // Delivery: tempo de espera e botão "Entregue"
    board.querySelectorAll('[data-col="delivery"] .kanban-card').forEach(card => {
      const id = ((card.getAttribute('onclick') || '').match(/openDetail\('([^']+)'\)/) || [])[1]; const s = delivery.find(x => x.id === id); if (!s) return;
      const mins = (Date.now() - dateOf(s)) / 6e4;
      const row = document.createElement('div'); row.className = 'pdk-act';
      row.innerHTML = `<span class="pdk-wait ${mins > 60 ? 'late' : mins > 30 ? 'warn' : ''}"><i class="fas fa-clock"></i> ${ago(dateOf(s))}${s.motoboyName ? ' · ' + s.motoboyName : ''}</span><button type="button" class="pdk-done"><i class="fas fa-check"></i> Entregue</button>`;
      row.querySelector('.pdk-done').addEventListener('click', ev => { ev.stopPropagation(); const b = ev.currentTarget; b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i>'; markDelivered(id); });
      card.appendChild(row);
    });
    paintTabs(cols);
  };

  /* ---------- Números do topo ---------- */
  window.updateStats = function () {
    const all = getAll(), today = sod(new Date()), yStart = new Date(today - DAY), yNow = new Date(Date.now() - DAY);
    const okSale = s => s.status !== 'cancelled';
    const t = all.filter(s => okSale(s) && dateOf(s) >= today), y = all.filter(s => okSale(s) && dateOf(s) >= yStart && dateOf(s) <= yNow);
    const sum = l => l.reduce((a, s) => a + (Number(s.total) || 0), 0);
    const open = all.filter(isOpenDelivery), oldest = open.reduce((m, s) => Math.min(m, +dateOf(s)), Infinity);
    const cards = document.querySelectorAll('.page-content > .stat-grid .stat-card');
    const set = (i, val, label, sub) => { const c = cards[i]; if (!c) return; const v = c.querySelector('.stat-value'); v.dataset.stCounting = '1'; v.textContent = val; setTimeout(() => { v.dataset.stCounting = '1'; v.textContent = val; }, 1100); if (label) c.querySelector('.stat-label').textContent = label; let e = c.querySelector('.pdk-sub'); if (!e) { e = document.createElement('div'); e.className = 'pdk-sub'; c.appendChild(e); } e.innerHTML = sub || ''; };
    const cmp = (a, b) => { if (!a && !b) return '<span class="flat">sem vendas ontem até agora</span>'; if (!b) return '<span class="up">ontem até agora: nenhuma</span>'; const p = (a - b) / b * 100; return `<span class="${p >= 0 ? 'up' : 'down'}"><i class="fas fa-arrow-${p >= 0 ? 'up' : 'down'}"></i> ${Math.abs(p).toFixed(0)}%</span> vs. ontem até agora`; };
    set(0, String(t.length), 'Vendas hoje', cmp(t.length, y.length));
    set(1, String(open.length), 'Delivery em aberto', open.length ? `mais antigo há <b>${ago(oldest)}</b>` : 'tudo entregue, sem pendências');
    set(2, brl(t.length ? sum(t) / t.length : 0), 'Ticket médio hoje', y.length ? `ontem: ${brl(sum(y) / y.length)}` : ''); const ic = cards[2]?.querySelector('.stat-icon i'); if (ic) ic.className = 'fas fa-receipt';
    set(3, brl(sum(t)), 'Faturamento hoje', cmp(sum(t), sum(y)));
  };

  // Se a lista já foi desenhada antes deste arquivo carregar, desenha de novo com o layout novo
  const refresh = () => { if (document.querySelector('#kanbanBoard .kanban-col:not([data-col])') || getAll().length && !document.getElementById('pdkBar')) { window.renderKanban(); window.updateStats(); } };
  refresh(); setTimeout(refresh, 400); setTimeout(refresh, 1500);
  // Altura do cabeçalho fixo do topo, para o título das colunas grudar logo abaixo dele
  const topVar = () => { const h = document.querySelector('.header'); if (!h) return; const cs = getComputedStyle(h); const fixed = cs.position === 'fixed' || cs.position === 'sticky'; const b = fixed ? Math.round(h.getBoundingClientRect().bottom) : 0; document.documentElement.style.setProperty('--pdk-top', Math.max(8, b + 8) + 'px'); };
  topVar(); addEventListener('resize', topVar, { passive: true }); setTimeout(topVar, 800);
})();
