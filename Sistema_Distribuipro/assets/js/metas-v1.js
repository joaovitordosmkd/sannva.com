/* DistribuiPro 36.6 · Metas — metas.html
   Meta de faturamento da loja e por vendedor, mês a mês, com o andamento em tempo real (vendido, falta, ritmo, previsão).
   Coleção goals (doc AAAA-MM: { month, store, sellers: { uid: valor } }). O painel (dashboard) lê a mesma meta da loja.
   Admin/gerente editam; vendedor vê a loja e a própria meta. Funciona nas 5 versões. */
(function () {
    'use strict';
    const root = document.getElementById('metaRoot');
    if (!root) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => Number(v) || 0;
    const parseMoney = v => { let s = String(v ?? '').replace(/[^\d,.-]/g, '').trim(); if (!s) return 0; if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, ''); const n = Number(s); return Number.isFinite(n) ? r2(n) : 0; };
    const fmtIn = v => v ? num(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const uid = () => (auth.currentUser && auth.currentUser.uid) || '';
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } }; // currentUser é "let" do app.js (fora do window)
    const isAdmin = () => ['admin', 'manager'].includes(me().role);
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const ym = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const monthLabel = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }); };
    const ROLE = { admin: 'Admin', manager: 'Gerente', seller: 'Vendedor', cashier: 'Caixa', technician: 'Técnico' };
    let month = ym(new Date());
    let goal = { store: 0, sellers: {} }, users = [], sales = [], dirty = false;

    const st = document.createElement('style');
    st.textContent = `.meta-grid{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:16px;margin-bottom:16px}@media(max-width:900px){.meta-grid{grid-template-columns:1fr}}
.meta-ring{display:flex;align-items:center;gap:18px;flex-wrap:wrap}.meta-ring svg{width:124px;height:124px;transform:rotate(-90deg)}.meta-ring circle{fill:none;stroke-width:11}.meta-ring .bg{stroke:var(--border-color)}.meta-ring .fg{stroke:var(--accent);stroke-linecap:round;transition:stroke-dashoffset .6s}.meta-ring .fg.ok{stroke:#10b981}.meta-ring .fg.warn{stroke:#f59e0b}
.meta-ringwrap{position:relative;width:124px;height:124px}.meta-ringwrap div{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}.meta-ringwrap strong{font-size:24px;font-weight:800}.meta-ringwrap small{font-size:11px;color:var(--text-muted)}
.meta-kv{display:grid;grid-template-columns:1fr 1fr;gap:10px;flex:1;min-width:220px}.meta-kv div{background:var(--bg-secondary);border-radius:10px;padding:8px 12px}.meta-kv dt{font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px}.meta-kv dd{margin:0;font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}.meta-kv dd.pos{color:#10b981}.meta-kv dd.neg{color:#f59e0b}
.meta-tips{display:grid;grid-template-columns:1fr 1fr;gap:10px}.meta-tip{display:flex;gap:10px;align-items:flex-start;background:var(--bg-secondary);border-radius:10px;padding:10px 12px}.meta-tip i{width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:var(--accent-muted,rgba(99,102,241,.14));color:var(--accent);flex-shrink:0}.meta-tip small{display:block;font-size:10px;color:var(--text-muted);font-weight:700;text-transform:uppercase}.meta-tip b{font-size:15px}.meta-tip em{display:block;font-style:normal;font-size:11px;color:var(--text-muted)}
.meta-in{width:130px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:8px;color:var(--text-primary);font-family:inherit;font-size:13px;text-align:right}.meta-in:disabled{opacity:.6}
.meta-bar{height:8px;border-radius:99px;background:var(--border-color);overflow:hidden;min-width:90px}.meta-bar i{display:block;height:100%;border-radius:99px;background:var(--accent)}.meta-bar i.ok{background:#10b981}.meta-bar i.warn{background:#f59e0b}
.meta-rank{display:inline-flex;width:24px;height:24px;border-radius:50%;align-items:center;justify-content:center;font-size:11px;font-weight:800;background:var(--bg-secondary);color:var(--text-muted)}.meta-rank.g{background:#fef3c7;color:#b45309}.meta-rank.s{background:#e2e8f0;color:#475569}.meta-rank.b{background:#fde8d6;color:#9a3412}
@media(max-width:768px){.meta-hide{display:none}.meta-tips{grid-template-columns:1fr}}`;
    document.head.appendChild(st);

    /* ---------- dados ---------- */
    async function loadBase() {
        try { users = (await simpleList('users', 'name', 'asc', 1000)).filter(u => !u.deleted && u.status !== 'inactive' && ['seller', 'admin', 'manager', 'cashier', 'technician'].includes(u.role || 'seller')); } catch (e) { users = []; }
        try { sales = (await simpleList('sales', 'createdAt', 'desc', 5000)).filter(s => !s.deleted); } catch (e) { sales = []; }
    }
    async function loadGoal(m) { try { const d = await db.collection('goals').doc(m).get(); const g = d.exists ? (d.data() || {}) : {}; return { store: num(g.store), sellers: Object.assign({}, g.sellers || {}) }; } catch (e) { return { store: 0, sellers: {} }; } }
    function range(m) { const [y, mm] = m.split('-').map(Number); return { a: new Date(y, mm - 1, 1), b: new Date(y, mm, 0, 23, 59, 59, 999), days: new Date(y, mm, 0).getDate() }; }
    function monthSales(m) { const { a, b } = range(m); return sales.filter(s => ['completed', 'delivered'].includes(s.status) && (d => d && d >= a && d <= b)(toDate(s.createdAt))); }
    async function save() {
        if (!isAdmin()) return;
        const store = parseMoney($('mStore') ? $('mStore').value : goal.store);
        const sellers = {}; root.querySelectorAll('input[data-seller]').forEach(i => { const v = parseMoney(i.value); if (v > 0) sellers[i.dataset.seller] = v; });
        goal = { store, sellers };
        const F = FV();
        await db.collection('goals').doc(month).set({ month, store, sellers, updatedAt: F ? F.serverTimestamp() : new Date(), updatedBy: uid() }, { merge: true });
        try { if (month === ym(new Date())) localStorage.setItem('dp_goal_month_v1', String(store)); } catch (e) { }
        dirty = false; toast('success', `Metas de ${monthLabel(month)} salvas.`); render();
    }

    /* ---------- tela ---------- */
    function ring(pct, cls) { const R = 52, C = 2 * Math.PI * R; return `<div class="meta-ringwrap"><svg viewBox="0 0 120 120"><circle class="bg" cx="60" cy="60" r="${R}"></circle><circle class="fg ${cls}" cx="60" cy="60" r="${R}" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - Math.min(100, pct) / 100)).toFixed(1)}"></circle></svg><div><strong>${pct.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}%</strong><small>da meta</small></div></div>`; }
    function render() {
        const { b, days } = range(month); const now = new Date(); const isCur = ym(now) === month; const isPast = b < now;
        const ms = monthSales(month); const sold = r2(ms.reduce((x, s) => x + num(s.total), 0));
        const dayNow = isCur ? now.getDate() : (isPast ? days : 0);
        const daysLeft = isCur ? Math.max(1, days - now.getDate() + 1) : 0;
        const pct = goal.store ? sold / goal.store * 100 : 0;
        const left = Math.max(0, goal.store - sold);
        let firstDay = dayNow || 1; ms.forEach(s => { const d = toDate(s.createdAt); if (d && d.getDate() < firstDay) firstDay = d.getDate(); });
        const elapsed = Math.max(1, dayNow - firstDay + 1);
        const avg = dayNow ? sold / elapsed : 0; const proj = isCur ? avg * (days - firstDay + 1) : sold;
        const perDay = isCur && daysLeft ? left / daysLeft : 0;
        const ticket = ms.length ? sold / ms.length : 0;
        const cls = pct >= 100 ? 'ok' : (isCur && proj < goal.store * 0.9 && goal.store) ? 'warn' : '';
        const by = {}; ms.forEach(s => { const id = s.sellerId || s.operatorId || 'sem'; if (!by[id]) by[id] = { total: 0, n: 0, name: s.sellerName || s.operatorName || '' }; by[id].total += num(s.total); by[id].n++; });
        let rows = users.map(u => ({ id: u.id, name: u.name || u.nome || u.email || 'Usuário', role: u.role, goal: num(goal.sellers[u.id]), sold: r2((by[u.id] || {}).total || 0), n: (by[u.id] || {}).n || 0 }));
        Object.keys(by).forEach(id => { if (!rows.some(r => r.id === id) && by[id].total > 0) rows.push({ id, name: by[id].name || 'Vendedor sem cadastro', role: '', goal: num(goal.sellers[id]), sold: r2(by[id].total), n: by[id].n, ghost: true }); });
        rows.sort((x, y) => y.sold - x.sold);
        const admin = isAdmin(); const myId = uid();
        const visible = admin ? rows : rows.filter(r => r.id === myId);
        const sumGoal = rows.reduce((a, r) => a + r.goal, 0), sumSold = rows.reduce((a, r) => a + r.sold, 0);
        root.innerHTML = `
        <div class="card" style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:12px 16px;margin-bottom:16px">
          <button class="btn btn-outline btn-sm" id="mPrev" title="Mês anterior"><i class="fas fa-chevron-left"></i></button>
          <input type="month" class="form-input" id="mMonth" value="${month}" style="width:170px;padding:6px 10px">
          <button class="btn btn-outline btn-sm" id="mNext" title="Próximo mês"><i class="fas fa-chevron-right"></i></button>
          <strong style="font-size:15px;text-transform:capitalize;color:var(--text-primary)">${monthLabel(month)}</strong>${isCur ? '<span class="badge badge-info">mês atual</span>' : ''}
          <span style="flex:1"></span>
          ${admin ? `<button class="btn btn-outline btn-sm" id="mCopy" title="Copia as metas do mês anterior"><i class="fas fa-clone"></i> Copiar do mês anterior</button><button class="btn btn-primary" id="mSave"><i class="fas fa-check"></i> Salvar metas</button>` : ''}
        </div>
        <div class="meta-grid">
          <div class="card">
            <div class="card-header" style="margin-bottom:12px"><div><div class="card-title">Meta da loja</div><div class="card-subtitle">${goal.store ? 'Faturamento do mês até agora' : (admin ? 'Defina a meta de faturamento do mês' : 'Sem meta definida para este mês')}</div></div></div>
            <div class="meta-ring">
              ${ring(pct, cls)}
              <dl class="meta-kv">
                <div><dt>Vendido no mês</dt><dd>${money(sold)}</dd></div>
                <div><dt>Meta</dt><dd>${admin ? `<input type="text" inputmode="decimal" class="meta-in" id="mStore" value="${fmtIn(goal.store)}" placeholder="Ex: 50.000,00">` : money(goal.store)}</dd></div>
                <div><dt>${left > 0 || !goal.store ? 'Falta' : 'Acima da meta'}</dt><dd class="${left > 0 ? 'neg' : 'pos'}">${goal.store ? (left > 0 ? money(left) : '<i class="fas fa-trophy"></i> ' + money(sold - goal.store)) : '—'}</dd></div>
                <div><dt>Vendas · ticket</dt><dd>${ms.length} · ${money(ticket)}</dd></div>
              </dl>
            </div>
          </div>
          <div class="card">
            <div class="card-header" style="margin-bottom:12px"><div><div class="card-title">Ritmo do mês</div><div class="card-subtitle">${isCur ? `Dia ${now.getDate()} de ${days} · faltam ${daysLeft} dia(s) contando hoje` : isPast ? 'Mês encerrado' : 'Mês ainda não começou'}</div></div></div>
            <div class="meta-tips">
              <div class="meta-tip"><i class="fas fa-calendar-day"></i><div><small>Média por dia</small><b>${money(avg)}</b><em>desde o 1º dia com venda</em></div></div>
              <div class="meta-tip"><i class="fas fa-chart-line"></i><div><small>Previsão de fechamento</small><b style="color:${goal.store ? (proj >= goal.store ? '#10b981' : '#f59e0b') : 'inherit'}">${money(proj)}</b><em>${goal.store ? (proj >= goal.store ? 'no ritmo atual bate a meta' : 'no ritmo atual fica abaixo') : 'mantendo o ritmo atual'}</em></div></div>
              <div class="meta-tip"><i class="fas fa-bullseye"></i><div><small>Precisa vender por dia</small><b>${goal.store && isCur ? money(perDay) : '—'}</b><em>${goal.store && isCur ? 'para fechar a meta' : 'defina a meta do mês'}</em></div></div>
              <div class="meta-tip"><i class="fas fa-users"></i><div><small>Metas dos vendedores</small><b>${money(sumSold)} / ${money(sumGoal)}</b><em>${sumGoal ? Math.round(sumSold / sumGoal * 100) + '% das metas individuais' : 'sem metas individuais'}</em></div></div>
            </div>
          </div>
        </div>
        <div class="card" style="padding:0">
          <div style="padding:14px 18px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px"><div><div class="card-title">Metas por vendedor</div><div class="card-subtitle">${admin ? 'Informe a meta de cada um; o vendido vem das vendas do mês (vendedor da venda)' : 'Seu andamento no mês'}</div></div>${admin && sumGoal && goal.store && Math.abs(sumGoal - goal.store) > 0.5 ? `<span style="font-size:11px;color:var(--text-muted)"><i class="fas fa-circle-info"></i> soma das metas individuais: ${money(sumGoal)} (loja: ${money(goal.store)})</span>` : ''}</div>
          <div class="table-container"><table class="data-table"><thead><tr><th>#</th><th>Vendedor</th><th>Meta</th><th>Vendido</th><th style="min-width:150px">Andamento</th><th class="meta-hide">Falta</th><th class="meta-hide">Vendas</th><th class="meta-hide">Por dia p/ bater</th><th class="meta-hide">Previsão</th></tr></thead><tbody>
            ${visible.length ? visible.map((r, i) => { const p = r.goal ? r.sold / r.goal * 100 : 0; const lf = Math.max(0, r.goal - r.sold); const pr = isCur && dayNow ? r.sold / elapsed * (days - firstDay + 1) : r.sold; const c = p >= 100 ? 'ok' : (r.goal && isCur && pr < r.goal * 0.9) ? 'warn' : ''; const rk = rows.indexOf(r); return `<tr>
              <td><span class="meta-rank ${rk === 0 ? 'g' : rk === 1 ? 's' : rk === 2 ? 'b' : ''}">${rk + 1}</span></td>
              <td><strong style="color:var(--text-primary)">${esc(r.name)}</strong>${r.role ? `<div style="font-size:11px;color:var(--text-muted)">${esc(ROLE[r.role] || r.role)}</div>` : r.ghost ? '<div style="font-size:11px;color:var(--text-muted)">não está nos usuários ativos</div>' : ''}</td>
              <td>${admin ? `<input type="text" inputmode="decimal" class="meta-in" data-seller="${esc(r.id)}" value="${fmtIn(r.goal)}" placeholder="0,00">` : money(r.goal)}</td>
              <td style="font-weight:700">${money(r.sold)}</td>
              <td><div style="display:flex;align-items:center;gap:8px"><div class="meta-bar" style="flex:1"><i class="${c}" style="width:${Math.min(100, p).toFixed(1)}%"></i></div><span style="font-size:12px;font-weight:700;min-width:38px;text-align:right">${r.goal ? p.toFixed(0) + '%' : '—'}</span></div></td>
              <td class="meta-hide" style="color:${lf > 0 ? 'var(--warning)' : 'var(--success)'}">${r.goal ? (lf > 0 ? money(lf) : '<i class="fas fa-trophy"></i> bateu') : '—'}</td>
              <td class="meta-hide">${r.n}</td>
              <td class="meta-hide">${r.goal && isCur && lf > 0 ? money(lf / daysLeft) : '—'}</td>
              <td class="meta-hide" style="color:${r.goal ? (pr >= r.goal ? 'var(--success)' : 'var(--warning)') : 'inherit'}">${isCur ? money(pr) : '—'}</td>
            </tr>`; }).join('') : '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhum vendedor ativo. Cadastre em Usuários.</td></tr>'}
          </tbody>${admin && visible.length ? `<tfoot><tr style="font-weight:800;background:var(--bg-secondary)"><td></td><td>TOTAL</td><td>${money(sumGoal)}</td><td>${money(sumSold)}</td><td>${sumGoal ? Math.round(sumSold / sumGoal * 100) + '%' : '—'}</td><td class="meta-hide">${money(Math.max(0, sumGoal - sumSold))}</td><td class="meta-hide">${rows.reduce((a, r) => a + r.n, 0)}</td><td class="meta-hide"></td><td class="meta-hide"></td></tr></tfoot>` : ''}</table></div>
        </div>
        <div style="font-size:12px;color:var(--text-muted);margin-top:12px"><i class="fas fa-circle-info" style="margin-right:5px"></i>Conta vendas concluídas e entregues (PDV, OS faturadas e acertos de consignado); vendas canceladas ficam de fora. A meta da loja também aparece no Dashboard.</div>`;
        $('mPrev').onclick = () => go(-1); $('mNext').onclick = () => go(1);
        $('mMonth').onchange = e => { if (/^\d{4}-\d{2}$/.test(e.target.value)) switchMonth(e.target.value); };
        const sv = $('mSave'); if (sv) sv.onclick = async () => { sv.disabled = true; sv.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; try { await save(); } catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); sv.disabled = false; sv.innerHTML = '<i class="fas fa-check"></i> Salvar metas'; } };
        const cp = $('mCopy'); if (cp) cp.onclick = async () => { const [y, mm] = month.split('-').map(Number); const prev = ym(new Date(y, mm - 2, 1)); const g = await loadGoal(prev); if (!g.store && !Object.keys(g.sellers).length) { toast('info', `Não há metas em ${monthLabel(prev)}.`); return; } goal = g; dirty = true; render(); toast('info', `Metas de ${monthLabel(prev)} copiadas. Clique em "Salvar metas" para confirmar.`); };
        root.querySelectorAll('.meta-in').forEach(i => { i.addEventListener('input', () => { dirty = true; }); i.addEventListener('blur', () => { const v = parseMoney(i.value); i.value = v ? fmtIn(v) : ''; }); });
    }
    function go(delta) { const [y, mm] = month.split('-').map(Number); switchMonth(ym(new Date(y, mm - 1 + delta, 1))); }
    async function switchMonth(m) {
        if (dirty && !confirm('Há metas não salvas. Trocar de mês mesmo assim?')) { render(); return; }
        month = m; dirty = false; goal = await loadGoal(month); render();
    }

    /* ---------- início ---------- */
    root.innerHTML = '<div style="text-align:center;padding:60px 16px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
    let started = false;
    // Espera o app.js carregar o perfil (currentUser) para saber se pode editar
    const waitUser = async () => { for (let i = 0; i < 40; i++) { if (me().role) return; await new Promise(r => setTimeout(r, 100)); } };
    const start = async () => { if (started) return; started = true; await waitUser(); await loadBase(); goal = await loadGoal(month); render(); };
    try { auth.onAuthStateChanged(u => { if (u) start(); }); } catch (e) { start(); }
    window.addEventListener('beforeunload', e => { if (dirty) { e.preventDefault(); e.returnValue = ''; } });
})();
