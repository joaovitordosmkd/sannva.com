/* DistribuiPro 37.9 · Agenda de serviços (agenda.html): barbearia, salão, estética, pet shop, lava-jato e oficina.
   - Dia: uma coluna por profissional, linhas no intervalo do expediente; clique no horário vazio para marcar.
   - Lista: o dia em ordem de horário com os botões do balcão (bom no celular). Semana: um profissional.
   - Fila de hoje: encaixe de quem chegou sem horário, espera prevista e "Puxar próximo" para quem está livre.
   - Aviso de conflito, de fora do expediente e de cliente com faltas; horários livres sugeridos.
   - WhatsApp: confirmar, lembrete de amanhã (grava remindedAt) e "está pronto".
   - "Fechar no caixa": leva os serviços, com o profissional de cada um, para o PDV (comissão por item); ao
     finalizar a venda o horário fica "Concluído" com o número da venda.
   - Ajustes: expediente, equipe (quem atende, cor, horário de cada dia) e mensagens.
   Usa o DPAgenda (agenda-core-v1.js). Igual nas 5 versões. */
(function () {
    'use strict';
    const root = document.getElementById('agRoot');
    if (!root || typeof db === 'undefined' || !window.DPAgenda) return;
    const A = window.DPAgenda;
    const { esc, money, r2, toMin, fromMin, dateKey, parseKey, firstName, norm } = A;
    const I = A.ic;
    const $ = id => document.getElementById(id);
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const SLOT = 22;
    const nowMin = () => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
    const todayKey = () => dateKey(new Date());
    const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return dateKey(d); };
    const weekStart = k => { const d = parseKey(k); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return dateKey(d); };
    const initials = n => String(n || '?').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
    const brDate = k => { const d = parseKey(k); return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`; };
    const hm = v => { const ms = A.toMs(v); return ms ? new Date(ms).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''; };
    const dhm = v => { const ms = A.toMs(v); return ms ? new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : ''; };
    const qs = new URLSearchParams(location.search);
    const S = {
        date: /^\d{4}-\d\d-\d\d$/.test(qs.get('data') || '') ? qs.get('data') : todayKey(),
        view: ['dia', 'lista', 'semana'].includes(qs.get('modo')) ? qs.get('modo') : (window.innerWidth < 700 ? 'lista' : 'dia'),
        weekPro: '', allPros: [], pros: [], users: [], appts: [], customers: null, products: null, unsub: null, key: '', booted: false, shell: false, hl: qs.get('ver') || '', scrolled: ''
    };
    try { const v = localStorage.getItem('dp_agenda_view'); if (!qs.get('modo') && ['dia', 'lista', 'semana'].includes(v) && window.innerWidth >= 700) S.view = v; } catch (e) { }

    /* ===================== HORÁRIOS ===================== */
    // Cada serviço pode ser com um profissional: Corte (João) 15:00–15:30 e Sobrancelha (Ana) 15:30–15:45
    function segs(ap) {
        const base = toMin(ap.start), items = Array.isArray(ap.items) ? ap.items : [];
        if (ap.status === 'bloqueio' || !items.length) return [{ pro: ap.professionalId || '', s: base, e: base + Math.max(5, Number(ap.durationMin) || (toMin(ap.end) - base) || 30), items, first: true }];
        const out = []; let t = base;
        items.forEach(it => {
            const d = Math.max(5, Number(it.durationMin) || 30), pro = it.professionalId || ap.professionalId || '';
            const last = out[out.length - 1];
            if (last && last.pro === pro && last.e === t) { last.e += d; last.items.push(it); } else out.push({ pro, s: t, e: t + d, items: [it], first: !out.length });
            t += d;
        });
        return out;
    }
    const durOf = ap => { const g = segs(ap); return g.length ? g[g.length - 1].e - g[0].s : 30; };
    const onGrid = x => x.deleted !== true && x.status !== 'cancelado' && !(x.walkIn && x.status === 'chegou');
    const takesTime = x => x.deleted !== true && !['cancelado', 'faltou'].includes(x.status) && !(x.walkIn && x.status === 'chegou');
    const proById = id => S.allPros.find(p => p.id === id) || null;
    const colorOfPro = id => (proById(id) || {}).color || '#94a3b8';
    // 38.6 · Ganchos para módulos (ex.: Pacotes do Mensal): window.DPAgendaExt = { badge(x), detail(ov, x, api) }
    const ext = (k, ...a) => { try { const f = window.DPAgendaExt && window.DPAgendaExt[k]; return typeof f === 'function' ? (f(...a) || '') : ''; } catch (e) { return ''; } };
    function conflicts(ap, list) {
        const mine = segs(ap), out = [];
        (list || S.appts).forEach(o => {
            if (o.id === ap.id || o.date !== ap.date || !takesTime(o)) return;
            segs(o).forEach(g => mine.forEach(m => { if (m.pro && g.pro === m.pro && g.s < m.e && m.s < g.e) out.push({ o, g, m }); }));
        });
        return out;
    }
    function outside(ap) {
        const msgs = [];
        segs(ap).forEach(g => {
            const p = proById(g.pro); if (!p) return;
            const h = A.hoursOf(p, ap.date);
            if (!h) msgs.push(`${firstName(p.name)} não trabalha neste dia`);
            else if (g.s < toMin(h[0]) || g.e > toMin(h[1])) msgs.push(`fora do horário de ${firstName(p.name)} (${h[0]} às ${h[1]})`);
        });
        return [...new Set(msgs)];
    }
    // Horários livres do profissional no dia para a duração pedida
    function freeSlots(proId, date, dur, ignoreId, list) {
        const p = proById(proId); if (!p) return [];
        const h = A.hoursOf(p, date); if (!h) return [];
        const step = A.cfg.step, out = [], min = date === todayKey() ? Math.ceil(nowMin() / step) * step : 0;
        for (let t = toMin(h[0]); t + dur <= toMin(h[1]); t += step) {
            if (t < min) continue;
            const fake = { id: ignoreId || '_', date, start: fromMin(t), professionalId: proId, items: [{ durationMin: dur, professionalId: proId }] };
            if (!conflicts(fake, list).length) out.push(fromMin(t));
        }
        return out;
    }

    /* ===================== DADOS ===================== */
    function range() { if (S.view === 'semana') { const a = weekStart(S.date); return [a, addDays(a, 6)]; } return [S.date, S.date]; }
    const query = (a, b) => a === b ? db.collection('appointments').where('date', '==', a) : db.collection('appointments').where('date', '>=', a).where('date', '<=', b);
    const docs = snap => snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.deleted !== true);
    function subscribe() {
        if (S.unsub) { try { S.unsub(); } catch (e) { } S.unsub = null; }
        const [a, b] = range(); const key = a + '|' + b; S.key = key;
        try {
            const q = query(a, b);
            if (typeof q.onSnapshot === 'function') S.unsub = q.onSnapshot(snap => { if (S.key !== key) return; S.appts = docs(snap); render(); }, () => refresh());
            else refresh();
        } catch (e) { refresh(); }
        loadRemind();
    }
    async function refresh() {
        const [a, b] = range(); const key = a + '|' + b;
        try { const list = docs(await query(a, b).get()); if (S.key && S.key !== key) return; S.appts = list; }
        catch (e) { toast('error', 'Não foi possível carregar a agenda: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        render(); loadRemind();
    }
    async function loadRemind() {
        const k = addDays(todayKey(), 1);
        try {
            const list = docs(await db.collection('appointments').where('date', '==', k).get()).filter(x => ['agendado', 'confirmado'].includes(x.status) && !x.walkIn && mine(x));
            S.remindN = list.filter(x => !x.remindedAt && x.customerPhone).length;
        } catch (e) { S.remindN = 0; }
        const n = $('agRemN'); if (n) { n.textContent = S.remindN; n.style.display = S.remindN ? '' : 'none'; }
    }
    async function loadPros(force) {
        S.allPros = await A.professionals(force);
        S.users = await A.allUsers();
        const me = A.myId();
        S.pros = A.seesAll() ? S.allPros : S.allPros.filter(p => p.id === me);
        if (!S.weekPro || !S.pros.some(p => p.id === S.weekPro)) S.weekPro = (S.pros.find(p => p.id === me) || S.pros[0] || {}).id || '';
    }
    const mine = x => A.seesAll() || segs(x).some(g => g.pro === A.myId()) || (!x.professionalId && x.walkIn);
    // O Firestore recusa campo "undefined": tira de objetos e listas simples (marcadores de data ficam como estão)
    const clean = v => Array.isArray(v) ? v.filter(x => x !== undefined).map(clean) : (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) ? Object.fromEntries(Object.entries(v).filter(([k, x]) => x !== undefined && k !== '_eta' && k !== '_etaPro').map(([k, x]) => [k, clean(x)])) : v;
    async function save(id, data) {
        const u = clean({ ...data, updatedAt: ts(), updatedBy: A.myId() });
        if (id) await db.collection('appointments').doc(id).set(u, { merge: true });
        else { const ref = await db.collection('appointments').add({ ...u, origin: data.origin || 'balcao', createdBy: A.myId(), createdByName: A.myName(), createdAt: ts(), deleted: false }); id = ref.id; }
        await refresh();
        return id;
    }
    async function customers() {
        if (S.customers) return S.customers;
        let list = [];
        try { list = typeof simpleList === 'function' ? await simpleList('customers', 'name', 'asc', 10000) : docs(await db.collection('customers').get()); } catch (e) { }
        S.customers = list.filter(c => !c.deleted).map(c => ({ id: c.id, name: c.name || c.nome || 'Cliente', phone: c.whatsapp || c.phone || c.telefone || '', doc: c.document || c.cpf || '' }));
        return S.customers;
    }
    async function products() {
        if (S.products) return S.products;
        let list = [];
        try { list = typeof simpleList === 'function' ? await simpleList('products', 'name', 'asc', 10000) : docs(await db.collection('products').get()); } catch (e) { }
        S.products = list.filter(p => !p.deleted && p.status !== 'inactive' && p.active !== false);
        return S.products;
    }
    const services = () => { const s = (S.products || []).filter(A.isService); return s.length ? s : (S.products || []); };
    async function history(customerId) {
        if (!customerId) return [];
        try { return docs(await db.collection('appointments').where('customerId', '==', customerId).get()); } catch (e) { return []; }
    }

    /* ===================== TELA ===================== */
    function shell() {
        if (S.shell) return; S.shell = true;
        root.innerHTML = `<div class="ag">
<div class="ag-top">
  <div class="ag-nav"><button type="button" class="ag-ib" data-a="prev" title="Anterior">${I('chevron-left')}</button><button type="button" class="ag-today" data-a="today">Hoje</button><button type="button" class="ag-ib" data-a="next" title="Próximo">${I('chevron-right')}</button></div>
  <label class="ag-date" title="Escolher o dia">${I('calendar')}<span id="agDateTxt"></span><input type="date" id="agDate" aria-label="Dia"></label>
  <div class="ag-seg" id="agView"><button type="button" data-v="dia">${I('columns-3')} Dia</button><button type="button" data-v="lista">${I('list')} Lista</button><button type="button" data-v="semana">${I('calendar-range')} Semana</button></div>
  <select class="form-control ag-pro-sel" id="agWeekPro" style="display:none" aria-label="Profissional da semana"></select>
  <span class="ag-sp"></span>
  <div class="ag-act">
    <button type="button" class="btn btn-outline" data-a="remind" title="Lembretes de amanhã pelo WhatsApp">${I('bell')}<span class="lbl">Lembretes</span><span class="n" id="agRemN" style="display:none"></span></button>
    <button type="button" class="btn btn-outline" data-a="walkin" title="Cliente chegou sem horário">${I('user-plus')}<span class="lbl">Encaixe</span></button>
    <button type="button" class="btn btn-outline" data-a="block" title="Almoço, folga ou compromisso">${I('lock')}<span class="lbl">Bloquear</span></button>
    <button type="button" class="btn btn-primary" data-a="new">${I('plus')}<span class="lbl">Agendar</span></button>
    <button type="button" class="btn btn-outline" data-a="cfg" title="Expediente, equipe e mensagens" id="agCfgBtn">${I('settings')}<span class="lbl">Ajustes</span></button>
    <button type="button" class="btn btn-outline" data-a="print" title="Imprimir a agenda">${I('printer')}</button>
  </div>
</div>
<div id="agOff"></div>
<div class="ag-kpis" id="agKpis"></div>
<div class="ag-main" id="agMain"><div class="ag-board" id="agBoard"></div><aside class="ag-side" id="agSide"></aside></div>
</div>`;
        $('agCfgBtn').style.display = A.isBoss() ? '' : 'none';
        $('agDate').addEventListener('change', e => { if (e.target.value) go(e.target.value); });
        $('agWeekPro').addEventListener('change', e => { S.weekPro = e.target.value; render(); });
        root.addEventListener('click', onClick);
        root.addEventListener('mousemove', onMove);
    }
    function go(k) { S.date = k; S.scrolled = ''; subscribe(); render(); try { history.replaceState(null, '', location.pathname + '?data=' + k); } catch (e) { } }
    function setView(v) { S.view = v; S.scrolled = ''; try { localStorage.setItem('dp_agenda_view', v); } catch (e) { } subscribe(); render(); }

    function paintTop() {
        const d = parseKey(S.date);
        $('agDateTxt').textContent = S.view === 'semana' ? `Semana de ${brDate(weekStart(S.date))} a ${brDate(addDays(weekStart(S.date), 6))}` : d.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' }).replace(/^./, c => c.toUpperCase());
        $('agDate').value = S.date;
        root.querySelectorAll('#agView [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === S.view));
        const sel = $('agWeekPro');
        sel.style.display = S.view === 'semana' && S.pros.length > 1 ? '' : 'none';
        sel.innerHTML = S.pros.map(p => `<option value="${esc(p.id)}" ${p.id === S.weekPro ? 'selected' : ''}>${esc(p.name || 'Profissional')}</option>`).join('');
        const off = $('agOff');
        off.innerHTML = A.cfg.enabled ? '' : `<div class="ag-warn">${I('info')}<div>A agenda está <b>desligada no menu</b>. Você pode usar normalmente por aqui; para ela aparecer no menu de todos, ${A.isBoss() ? '<a href="#" data-a="enable" style="font-weight:700;color:var(--accent)">ligue a agenda</a>' : 'peça ao administrador para ligar em Configurações'}.</div></div>`;
    }
    function paintKpis() {
        const [a, b] = range();
        const list = S.appts.filter(x => x.date >= a && x.date <= b && x.status !== 'bloqueio' && x.status !== 'cancelado' && mine(x));
        const n = s => list.filter(x => x.status === s).length;
        const prev = r2(list.filter(x => x.status !== 'faltou').reduce((s, x) => s + Number(x.total || 0), 0));
        const k = (ic, c, v, l) => `<span class="ag-kpi" style="--kc:${c}">${I(ic)}<b>${v}</b>${l}</span>`;
        $('agKpis').innerHTML = k('calendar-days', 'var(--accent)', list.length, list.length === 1 ? 'atendimento' : 'atendimentos') + k('calendar-check', '#0ea5e9', n('confirmado'), 'confirmados')
            + (S.view !== 'semana' && S.date === todayKey() ? k('hourglass', '#f59e0b', n('chegou'), 'na fila') + k('scissors', '#8b5cf6', n('atendendo'), 'atendendo') : '')
            + k('circle-check', '#10b981', n('concluido'), 'concluídos') + k('user-x', '#ef4444', n('faltou'), 'faltas') + (A.isBoss() ? k('wallet', '#10b981', money(prev), 'previsto') : '');
    }

    function render() {
        if (!S.shell) return;
        paintTop(); paintKpis();
        const board = $('agBoard'), side = $('agSide'), main = $('agMain');
        if (!S.allPros.length) { board.innerHTML = onboardingHtml(); side.style.display = 'none'; main.classList.add('nofila'); return; }
        if (!S.pros.length) { board.innerHTML = `<div class="ag-empty">${I('user-x')}<h3>Você ainda não está na agenda</h3><p>Peça ao administrador para marcar "Atende na agenda" no seu usuário (em Usuários ou em Agenda › Ajustes › Equipe).</p></div>`; side.style.display = 'none'; main.classList.add('nofila'); return; }
        board.innerHTML = S.view === 'lista' ? listHtml() : gridHtml(S.view);
        const showFila = S.view !== 'semana' && S.date === todayKey();
        side.style.display = showFila ? '' : 'none'; main.classList.toggle('nofila', !showFila);
        if (showFila) side.innerHTML = filaHtml();
        if (S.view !== 'lista' && S.scrolled !== S.key) {
            S.scrolled = S.key;
            const target = S.hl ? board.querySelector(`.ag-blk[data-id="${CSS.escape(S.hl)}"]`) : null;
            const top = target ? target.offsetTop - 80 : (S.date === todayKey() || S.view === 'semana') && S.range ? (Math.max(S.range.from, nowMin() - 60) - S.range.from) / S.range.step * SLOT : 0;
            board.scrollTop = Math.max(0, top);
        }
    }

    /* ---------- Grade (dia e semana) ---------- */
    function proHead(p) {
        const list = S.appts.filter(x => x.date === S.date && onGrid(x) && x.status !== 'bloqueio' && segs(x).some(g => g.pro === p.id));
        const h = A.hoursOf(p, S.date);
        let sub = h ? `<small>${h[0]}–${h[1]}</small>` : '<small class="off">Folga</small>';
        if (h && S.date === todayKey()) {
            const nm = nowMin();
            const cur = S.appts.find(x => x.date === S.date && x.status === 'atendendo' && segs(x).some(g => g.pro === p.id));
            const sched = S.appts.find(x => x.date === S.date && ['agendado', 'confirmado', 'chegou'].includes(x.status) && !x.walkIn && segs(x).some(g => g.pro === p.id && g.s <= nm && nm < g.e));
            if (cur) sub = `<small class="busy">Atendendo ${esc(firstName(cur.customerName) || '')}</small>`;
            else if (sched) sub = `<small class="busy">Horário de ${esc(firstName(sched.customerName) || 'cliente')}</small>`;
            else if (nm >= toMin(h[0]) && nm < toMin(h[1])) sub = '<small class="free">Livre agora</small>';
        }
        return `<div class="ag-hd"><span class="av" style="background:${esc(p.color)}">${esc(initials(p.name))}</span><div style="min-width:0"><b>${esc(p.name || 'Profissional')}</b>${sub}</div><small style="margin-left:auto;font-weight:800;color:var(--text-muted)" title="Atendimentos no dia">${list.length}</small></div>`;
    }
    function dayHead(k, p) {
        const n = S.appts.filter(x => x.date === k && onGrid(x) && x.status !== 'bloqueio' && segs(x).some(g => g.pro === p.id)).length, d = parseKey(k), h = A.hoursOf(p, k);
        return `<div class="ag-hd day ${k === todayKey() ? 'today' : ''}" data-day="${k}" title="Abrir o dia"><div><b>${A.WD3[d.getDay()]} ${brDate(k)}</b><small class="${h ? '' : 'off'}">${h ? n + (n === 1 ? ' horário' : ' horários') : 'Folga'}</small></div></div>`;
    }
    function blockHtml(x, g, from, step) {
        const st = A.STATUS[x.status] || A.STATUS.agendado;
        const color = x.status === 'bloqueio' ? '#64748b' : colorOfPro(g.pro);
        const top = (g.s - from) / step * SLOT + 1, h = Math.max(SLOT - 3, (g.e - g.s) / step * SLOT - 2);
        const size = h < 32 ? 'tiny' : h < 52 ? 'small' : '';
        const title = x.status === 'bloqueio' ? (x.notes || 'Horário bloqueado') : (x.customerName || 'Cliente');
        const sub = x.status === 'bloqueio' ? '' : [g.items.map(i => i.name).join(' + '), x.itemName].filter(Boolean).join(' · ');
        const t = `${fromMin(g.s)}–${fromMin(g.e)}${size === 'tiny' ? ' · ' + esc(title) : ''}${x.walkIn ? ' · encaixe' : ''}${g.first ? '' : ' · continuação'}`;
        return `<div class="ag-blk s-${esc(x.status || 'agendado')} ${size} ${g.first ? '' : 'cont'} ${S.hl === x.id ? 'hl' : ''}" data-id="${esc(x.id)}" style="top:${top}px;height:${h}px;--pc:${esc(color)};--sc:${st[1]}" title="${esc(fromMin(g.s) + '–' + fromMin(g.e) + ' · ' + title + (sub ? ' · ' + sub : '') + ' · ' + st[0])}"><div class="t">${x.status === 'bloqueio' ? I('lock') : ''}${t}</div><div class="c">${esc(title)}${ext('badge', x)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}${['agendado', 'bloqueio'].includes(x.status) ? '' : `<span class="st">${I(st[2])}${size ? '' : esc(st[0])}</span>`}</div>`;
    }
    function gridHtml(mode) {
        const cfg = A.cfg, step = cfg.step, per = 60 / step;
        let cols;
        if (mode === 'semana') {
            const pro = S.pros.find(p => p.id === S.weekPro) || S.pros[0]; S.weekPro = pro.id;
            const a = weekStart(S.date);
            cols = [...Array(7)].map((_, i) => { const k = addDays(a, i); return { date: k, pro, head: dayHead(k, pro) }; });
        } else {
            cols = S.pros.map(p => ({ date: S.date, pro: p, head: proHead(p) }));
            const orphan = S.appts.some(x => x.date === S.date && onGrid(x) && segs(x).some(g => !S.allPros.some(p => p.id === g.pro)));
            if (orphan && A.seesAll()) cols.push({ date: S.date, pro: { id: '_', name: 'Sem profissional', color: '#94a3b8' }, head: `<div class="ag-hd"><span class="av" style="background:#94a3b8">${I('user')}</span><div><b>Sem profissional</b><small>escolha quem atende</small></div></div>` });
        }
        let from = toMin(cfg.open), to = toMin(cfg.close);
        cols.forEach(c => { const h = c.pro.id !== '_' && A.hoursOf(c.pro, c.date); if (h) { from = Math.min(from, toMin(h[0])); to = Math.max(to, toMin(h[1])); } });
        S.appts.forEach(x => { if (!onGrid(x) || !cols.some(c => c.date === x.date)) return; segs(x).forEach(g => { from = Math.min(from, g.s); to = Math.max(to, g.e); }); });
        from = Math.max(0, Math.floor(from / 60) * 60); to = Math.min(1440, Math.ceil(to / 60) * 60); if (to <= from) to = Math.min(1440, from + 60);
        S.range = { from, to, step };
        const H = (to - from) / step * SLOT, nm = nowMin(), tk = todayKey();
        const times = []; for (let m = from; m < to; m += 60) times.push(`<div>${fromMin(m)}</div>`);
        const body = cols.map(c => {
            const offs = [];
            if (c.pro.id !== '_') { const h = A.hoursOf(c.pro, c.date); if (!h) offs.push([from, to]); else { if (toMin(h[0]) > from) offs.push([from, toMin(h[0])]); if (toMin(h[1]) < to) offs.push([toMin(h[1]), to]); } }
            const blocks = [];
            S.appts.forEach(x => { if (x.date !== c.date || !onGrid(x)) return; segs(x).forEach(g => { if (c.pro.id === '_' ? !S.allPros.some(p => p.id === g.pro) : g.pro === c.pro.id) blocks.push(blockHtml(x, g, from, step)); }); });
            const now = c.date === tk && nm >= from && nm <= to ? `<div class="ag-now" style="top:${(nm - from) / step * SLOT}px"></div>` : '';
            return `<div class="ag-col" data-pro="${esc(c.pro.id)}" data-date="${c.date}" style="height:${H}px">${offs.map(([s, e]) => `<div class="off" style="top:${(s - from) / step * SLOT}px;height:${(e - s) / step * SLOT}px"></div>`).join('')}<div class="hover"></div>${blocks.join('')}${now}</div>`;
        });
        return `<div class="ag-grid" style="--per:${per};grid-template-columns:var(--tcol) repeat(${cols.length},minmax(${mode === 'semana' ? 120 : 160}px,1fr))"><div class="ag-corner"></div>${cols.map(c => c.head).join('')}<div class="ag-times" style="height:${H}px">${times.join('')}</div>${body.join('')}</div>`;
    }

    /* ---------- Lista do dia ---------- */
    function quickActs(x) {
        const ph = !!A.waPhone(x.customerPhone);
        switch (x.status) {
            case 'agendado': return [['chegou', 'user-check', 'Chegou'], ph ? ['wa-confirm', 'whatsapp', 'Confirmar', 'wa'] : null];
            case 'confirmado': return [['chegou', 'user-check', 'Chegou'], ph ? ['wa-remind', 'whatsapp', 'Lembrar', 'wa'] : null];
            case 'chegou': return [x.professionalId ? ['iniciar', 'play', 'Iniciar'] : null, ['caixa', 'scan-barcode', 'Caixa', 'go']];
            case 'atendendo': return [['pronto', 'bell', 'Pronto'], ['caixa', 'scan-barcode', 'Caixa', 'go']];
            case 'pronto': return [ph ? ['wa-ready', 'whatsapp', 'Avisar', 'wa'] : null, ['caixa', 'scan-barcode', 'Caixa', 'go']];
            default: return [];
        }
    }
    const qBtns = x => quickActs(x).filter(Boolean).filter(a => a[0] !== 'caixa' || canPdv()).map(([a, ic, l, c]) => `<button type="button" class="ag-mini ${c || ''}" data-qa="${a}" data-id="${esc(x.id)}">${I(ic)}${l}</button>`).join('');
    function listHtml() {
        const list = S.appts.filter(x => x.date === S.date && x.deleted !== true && mine(x)).sort((a, b) => toMin(a.start) - toMin(b.start) || (A.toMs(a.arrivedAt) - A.toMs(b.arrivedAt)));
        if (!list.length) return `<div class="ag-empty">${I('calendar')}<h3>Nenhum horário ${S.date === todayKey() ? 'hoje' : 'neste dia'}</h3><p>Toque em "Agendar" para marcar, ou em "Encaixe" para quem chegou sem horário.</p><button type="button" class="btn btn-primary" data-a="new">${I('plus')} Agendar</button></div>`;
        return `<div class="ag-list">${list.map(x => {
            const st = A.STATUS[x.status] || A.STATUS.agendado;
            if (x.status === 'bloqueio') return `<div class="ag-li dim" data-id="${esc(x.id)}"><div class="h">${esc(x.start)}<small>até ${esc(x.end || '')}</small></div><div class="c"><b>${I('lock')} ${esc(x.notes || 'Horário bloqueado')}</b><small>${esc(x.professionalName || '')}</small></div><div class="a"></div></div>`;
            const pros = [...new Set(segs(x).map(g => g.pro))].map(id => proById(id)).filter(Boolean);
            return `<div class="ag-li ${['cancelado', 'faltou', 'concluido'].includes(x.status) ? 'dim' : ''}" data-id="${esc(x.id)}"><div class="h">${esc(x.start || '')}<small>${durOf(x)} min</small></div>
<div class="c"><b><span class="dot" style="background:${esc(colorOfPro(x.professionalId))}"></span>${esc(x.customerName || 'Cliente')}${ext('badge', x)}${x.walkIn ? ' <span class="ag-pill" style="--sc:#f59e0b">encaixe</span>' : ''}</b><small>${esc((x.items || []).map(i => i.name).join(' + ') || 'Atendimento')}${x.itemName ? ' · ' + esc(x.itemName) : ''} · ${pros.length ? esc(pros.map(p => firstName(p.name)).join(' e ')) : 'qualquer profissional'}${Number(x.total) ? ' · ' + money(x.total) : ''}</small></div>
<div class="a"><span class="ag-pill" style="--sc:${st[1]}">${I(st[2])}${esc(st[0])}</span>${qBtns(x)}</div></div>`;
        }).join('')}</div>`;
    }

    /* ---------- Fila de hoje ---------- */
    function queue() {
        const nm = nowMin(), tk = todayKey();
        const list = S.appts.filter(x => x.date === tk && x.deleted !== true);
        const working = S.pros.filter(p => { const h = A.hoursOf(p, tk); return h && nm >= toMin(h[0]) - 5 && nm < toMin(h[1]); });
        const busy = list.filter(x => x.status === 'atendendo' && mine(x));
        const busyPro = id => busy.find(x => segs(x).some(g => g.pro === id));
        const freeAt = {};
        working.forEach(p => { const cur = busyPro(p.id); freeAt[p.id] = cur ? Math.max(nm, ...segs(cur).filter(g => g.pro === p.id).map(g => g.e)) : nm; });
        // Horários reservados de cada um: quem tem hora marcada tem a vez; o encaixe entra nos buracos
        const iv = {};
        working.forEach(p => { iv[p.id] = list.filter(x => ['agendado', 'confirmado'].includes(x.status) && !x.walkIn).flatMap(x => segs(x).filter(g => g.pro === p.id).map(g => [g.s, g.e])); });
        const fit = (p, d) => { let t = freeAt[p.id] ?? nm, moved = true; while (moved) { moved = false; for (const [s, e] of iv[p.id]) if (s < t + d && e > t) { t = e; moved = true; } } return t; };
        const free = working.filter(p => !busyPro(p.id));
        const arr = x => A.toMs(x.arrivedAt) || 0;
        const wait = [...list.filter(x => x.status === 'chegou' && !x.walkIn).sort((a, b) => toMin(a.start) - toMin(b.start) || arr(a) - arr(b)), ...list.filter(x => x.status === 'chegou' && x.walkIn).sort((a, b) => arr(a) - arr(b))];
        wait.forEach(w => {
            const d = durOf(w), cands = w.professionalId ? working.filter(p => p.id === w.professionalId) : working;
            let best = null;
            cands.forEach(p => { const t = fit(p, d); if (!best || t < best.t) best = { t, p }; });
            if (best) { w._eta = best.t; w._etaPro = best.p; iv[best.p.id].push([best.t, best.t + d]); } else { w._eta = null; w._etaPro = null; }
        });
        wait.sort((a, b) => (a._eta ?? 1e9) - (b._eta ?? 1e9) || arr(a) - arr(b));
        return { busy, wait: wait.filter(mine), free, working, nm };
    }
    function filaHtml() {
        const q = queue();
        const etaTxt = w => w._eta == null ? `<span class="w">${w.professionalId ? 'aguardando ' + esc(firstName(w.professionalName) || 'o profissional') : 'ninguém trabalhando agora'}</span>` : (w._eta - q.nm <= 2 ? '<span class="w">pode entrar agora</span>' : `<span class="w">espera ~${w._eta - q.nm} min</span>`) + (w._etaPro && !w.professionalId ? ` · provável: ${esc(firstName(w._etaPro.name))}` : '');
        const next = p => { const r = S.appts.filter(x => x.date === todayKey() && ['agendado', 'confirmado'].includes(x.status) && segs(x).some(g => g.pro === p.id && g.s >= q.nm)).sort((a, b) => toMin(a.start) - toMin(b.start))[0]; return r ? `próximo horário ${r.start}` : 'sem horário marcado'; };
        return `<h4>${I('users')} Fila de hoje<span class="sp"></span><button type="button" class="ag-mini pri" data-a="walkin">${I('user-plus')} Encaixe</button></h4>
<h5>Atendendo agora</h5>${q.busy.map(x => { const p = proById(x.professionalId); return `<div class="ag-q on" data-id="${esc(x.id)}"><span class="p">${esc(initials(p ? p.name : '?'))}</span><div><b>${esc(x.customerName || 'Cliente')}</b><small>${esc((x.items || []).map(i => i.name).join(' + ') || 'Atendimento')} · com ${esc(firstName(p ? p.name : x.professionalName) || '—')}${x.startedAt ? ' · desde ' + hm(x.startedAt) : ''}</small></div><div class="acts">${qBtns(x)}</div></div>`; }).join('') || '<div class="none">Ninguém sendo atendido agora.</div>'}
<h5>Esperando (${q.wait.length})</h5>${q.wait.map((w, i) => `<div class="ag-q" data-id="${esc(w.id)}"><span class="p">${i + 1}</span><div><b>${esc(w.customerName || 'Cliente')}</b><small>${esc((w.items || []).map(x => x.name).join(' + ') || 'Atendimento')} · ${w.professionalId ? 'com ' + esc(firstName(w.professionalName)) : 'qualquer profissional'}${w.walkIn ? '' : ' · horário ' + esc(w.start)}</small><small>Chegou ${hm(w.arrivedAt) || w.start} · ${etaTxt(w)}</small></div><div class="acts">${w.professionalId ? `<button type="button" class="ag-mini pri" data-qa="iniciar" data-id="${esc(w.id)}">${I('play')}Atender</button>` : ''}<button type="button" class="ag-mini bad" data-qa="desistiu" data-id="${esc(w.id)}">${I('x')}Desistiu</button></div></div>`).join('') || '<div class="none">Ninguém esperando. Quem chegar sem horário entra pelo botão "Encaixe".</div>'}
<h5>Livres agora</h5>${q.free.map(p => `<div class="ag-free"><span class="dot" style="background:${esc(p.color)}"></span><span>${esc(firstName(p.name))}<small style="display:block;font-weight:500;color:var(--text-muted);font-size:11px">${next(p)}</small></span><button type="button" class="ag-mini pri" data-pull="${esc(p.id)}" ${q.wait.some(w => !w.professionalId || w.professionalId === p.id) ? '' : 'disabled style="opacity:.5"'}>${I('play')}Puxar próximo</button></div>`).join('') || '<div class="none">Ninguém livre agora.</div>'}`;
    }
    async function pull(proId) {
        const p = proById(proId); if (!p) return;
        const w = queue().wait.find(x => !x.professionalId || x.professionalId === proId);
        if (!w) { toast('info', 'Ninguém esperando para ' + firstName(p.name) + '.'); return; }
        await startWith(w, p);
        toast('success', `${firstName(w.customerName) || 'Cliente'} com ${firstName(p.name)} agora.`);
    }
    async function startWith(x, p) {
        const st = Math.floor(nowMin() / 5) * 5;
        const items = (x.items || []).map(i => ({ ...i, professionalId: i.professionalId || p.id, professionalName: i.professionalName || p.name || '' }));
        const ap = { ...x, items, professionalId: x.professionalId || p.id, start: x.walkIn ? fromMin(st) : x.start };
        await save(x.id, { status: 'atendendo', startedAt: ts(), professionalId: ap.professionalId, professionalName: x.professionalName || p.name || '', items, start: ap.start, end: fromMin(toMin(ap.start) + durOf(ap)) });
    }

    /* ---------- Começo: quem atende ---------- */
    function onboardingHtml() {
        if (!A.isBoss()) return `<div class="ag-empty">${I('calendar-days')}<h3>A agenda ainda não tem profissionais</h3><p>Peça ao administrador para escolher quem atende (Agenda › Ajustes › Equipe).</p></div>`;
        const users = S.users.filter(u => ['admin', 'manager', 'seller', 'cashier', 'technician'].includes(u.role || 'admin'));
        return `<div class="ag-empty">${I('calendar-days')}<h3>Quem atende na agenda?</h3><p>Cada profissional vira uma coluna, com o horário de trabalho dele. Marque quem corta, faz unha, dá banho, lava ou conserta. Dá para mudar depois em Ajustes › Equipe.</p>
<div class="ag-onb">${users.map(u => `<label><input type="checkbox" value="${esc(u.id)}" ${['seller', 'technician'].includes(u.role) || users.length === 1 ? 'checked' : ''}><span>${esc(u.name || u.email || 'Usuário')}</span><small>${esc({ admin: 'Administrador', manager: 'Gerente', seller: 'Vendedor', cashier: 'Caixa', technician: 'Técnico' }[u.role] || '')}</small></label>`).join('')}</div>
<p style="margin-top:12px;font-size:12px">Horário de trabalho inicial: ${esc(A.cfg.open)} às ${esc(A.cfg.close)}, ${A.cfg.days.map(d => A.WD3[d]).join(', ')}. Falta alguém? Cadastre em <a href="usuarios.html" style="color:var(--accent);font-weight:700">Usuários</a>.</p>
<button type="button" class="btn btn-primary" data-a="onb-save">${I('check')} Começar a usar a agenda</button></div>`;
    }
    async function saveOnboarding() {
        const ids = [...root.querySelectorAll('.ag-onb input:checked')].map(i => i.value);
        if (!ids.length) { toast('warning', 'Marque pelo menos uma pessoa.'); return; }
        const h = {}; for (let wd = 0; wd < 7; wd++) h[wd] = A.cfg.days.includes(wd) ? [A.cfg.open, A.cfg.close] : [];
        try {
            for (let i = 0; i < ids.length; i++) await db.collection('users').doc(ids[i]).set({ agenda: true, agendaColor: A.COLORS[i % A.COLORS.length], agendaHours: h, agendaOrder: i + 1, updatedAt: ts() }, { merge: true });
            if (A.cfg.enabled !== true && A.settings && A.settings.agendaEnabled !== false) await A.saveSettings({ agendaEnabled: true });
            await loadPros(true); render(); toast('success', 'Pronto! Clique num horário vazio para marcar.');
        } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    }

    /* ===================== CLIQUES ===================== */
    const canPdv = () => { const a = document.querySelector('.sidebar-menu a.menu-item[href="pdv.html"]'); return a ? getComputedStyle(a).display !== 'none' : ['admin', 'manager', 'seller', 'cashier', ''].includes(A.role()); };
    const byId = id => S.appts.find(x => x.id === id);
    function onClick(e) {
        const a = e.target.closest('[data-a]');
        if (a) { e.preventDefault(); return topAction(a.dataset.a); }
        const v = e.target.closest('#agView [data-v]'); if (v) return setView(v.dataset.v);
        const qa = e.target.closest('[data-qa]'); if (qa) { e.stopPropagation(); const x = byId(qa.dataset.id); if (x) act(qa.dataset.qa, x); return; }
        const pl = e.target.closest('[data-pull]'); if (pl) { if (!pl.disabled) pull(pl.dataset.pull); return; }
        const day = e.target.closest('[data-day]'); if (day) { S.view = 'dia'; go(day.dataset.day); return; }
        const blk = e.target.closest('.ag-blk, .ag-li, .ag-q'); if (blk && blk.dataset.id) { const x = byId(blk.dataset.id); if (x) openDetail(x); return; }
        const col = e.target.closest('.ag-col');
        if (col && S.range) {
            const y = e.clientY - col.getBoundingClientRect().top;
            const t = S.range.from + Math.floor(y / SLOT) * S.range.step;
            const pro = col.dataset.pro === '_' ? '' : col.dataset.pro;
            openForm(null, { professionalId: pro, date: col.dataset.date, start: fromMin(t) });
        }
    }
    let moveT = 0;
    function onMove(e) {
        if (Date.now() - moveT < 30) return; moveT = Date.now();
        const col = e.target.closest('.ag-col'); if (!col || !S.range || e.target.closest('.ag-blk')) { root.querySelectorAll('.ag-col .hover').forEach(h => h.style.display = 'none'); return; }
        const y = e.clientY - col.getBoundingClientRect().top, i = Math.floor(y / SLOT);
        const hv = col.querySelector('.hover'); if (!hv) return;
        root.querySelectorAll('.ag-col .hover').forEach(h => { if (h !== hv) h.style.display = 'none'; });
        hv.style.display = 'block'; hv.style.top = (i * SLOT) + 'px'; hv.textContent = '+ ' + fromMin(S.range.from + i * S.range.step);
    }
    function topAction(a) {
        if (a === 'prev') return go(addDays(S.date, S.view === 'semana' ? -7 : -1));
        if (a === 'next') return go(addDays(S.date, S.view === 'semana' ? 7 : 1));
        if (a === 'today') return go(todayKey());
        if (a === 'new') return openForm(null, {});
        if (a === 'walkin') return openForm(null, { walkIn: true });
        if (a === 'block') return openBlock(null, {});
        if (a === 'remind') return openRemind(addDays(todayKey(), 1));
        if (a === 'cfg') return openSettings('exp');
        if (a === 'print') return window.print();
        if (a === 'onb-save') return saveOnboarding();
        if (a === 'enable') return A.saveSettings({ agendaEnabled: true }).then(() => { toast('success', 'Agenda ligada no menu.'); render(); });
    }

    /* ===================== AÇÕES DO HORÁRIO ===================== */
    async function act(a, x) {
        try {
            if (a === 'confirmar') { await save(x.id, { status: 'confirmado', confirmedAt: ts() }); toast('success', 'Horário confirmado.'); }
            else if (a === 'chegou') { await save(x.id, { status: 'chegou', arrivedAt: ts() }); toast('success', `${firstName(x.customerName) || 'Cliente'} chegou.`); }
            else if (a === 'iniciar') { const p = proById(x.professionalId) || proById((queue().free[0] || {}).id); if (!p) { toast('warning', 'Escolha o profissional (Editar).'); return openForm(x); } await startWith(x, p); }
            else if (a === 'pronto') { await save(x.id, { status: 'pronto', readyAt: ts() }); if (A.waPhone(x.customerPhone) && confirm('Avisar o cliente pelo WhatsApp que está pronto?')) await act('wa-ready', { ...x, status: 'pronto' }); else toast('success', 'Marcado como pronto.'); }
            else if (a === 'caixa') { if (x.status === 'concluido' && x.saleId) { toast('info', 'Este atendimento já foi cobrado.'); return; } if (!(x.items || []).length && !confirm('Este horário não tem serviço. Abrir o caixa só com o cliente?')) return; A.toPdv(x); }
            else if (a === 'faltou') { if (!confirm(`Marcar falta de ${x.customerName || 'cliente'}?`)) return; await save(x.id, { status: 'faltou', noShowAt: ts() }); toast('info', 'Falta registrada. Ela aparece na ficha do cliente.'); }
            else if (a === 'cancelar') { const why = prompt('Cancelar o horário. Motivo (opcional):', ''); if (why === null) return; await save(x.id, { status: 'cancelado', cancelledAt: ts(), cancelReason: why || '' }); toast('info', 'Horário cancelado.'); }
            else if (a === 'desistiu') { if (!confirm(`${x.customerName || 'Cliente'} desistiu de esperar?`)) return; await save(x.id, { status: 'cancelado', cancelledAt: ts(), cancelReason: 'Desistiu da fila' }); }
            else if (a === 'desfazer') { await save(x.id, { status: 'agendado' }); toast('success', 'Voltou para agendado.'); }
            else if (a === 'excluir') { if (!confirm('Excluir este bloqueio?')) return; await save(x.id, { deleted: true, deletedAt: ts() }); }
            else if (a === 'editar') { return x.status === 'bloqueio' ? openBlock(x) : openForm(x); }
            else if (a === 'reagendar') { const c = { ...x }; delete c.id; return openForm(null, { ...c, status: 'agendado', date: S.date >= todayKey() ? S.date : todayKey(), start: '' }); }
            else if (a === 'checkin') { return openCheckin(x); }
            else if (a.startsWith('wa')) {
                const kind = a.slice(3);
                if (!A.waPhone(x.customerPhone) && kind) { toast('warning', 'Este cliente não tem WhatsApp no cadastro.'); }
                const tpl = kind === 'confirm' ? A.cfg.msgConfirm : kind === 'remind' ? A.cfg.msgRemind : kind === 'ready' ? A.cfg.msgReady : '';
                await A.openWa(x.customerPhone, tpl ? await A.fill(tpl, x) : '');
                if (kind === 'remind') await save(x.id, { remindedAt: ts() });
                if (kind === 'confirm') await save(x.id, { confirmSentAt: ts() });
                if (kind === 'ready') await save(x.id, { readyNotifiedAt: ts() });
            }
            if ($('agModal') && !['editar', 'reagendar', 'checkin', 'caixa'].includes(a)) { const fresh = byId(x.id); closeModal(); if (fresh && !['excluir', 'cancelar', 'desistiu'].includes(a)) setTimeout(() => { const f2 = byId(x.id); if (f2) openDetail(f2); }, 250); }
        } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    }

    /* ===================== JANELAS ===================== */
    function modal(html, cls) {
        closeModal();
        const ov = document.createElement('div'); ov.className = 'ag-ov'; ov.id = 'agModal';
        ov.innerHTML = `<div class="ag-md ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
        document.body.appendChild(ov);
        ov.addEventListener('mousedown', e => { if (e.target === ov) closeModal(); });
        ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', closeModal));
        return ov;
    }
    function closeModal() { $('agModal')?.remove(); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && $('agModal')) closeModal(); });
    const head = (ic, t) => `<div class="ag-mh"><h3>${I(ic)}${t}</h3><button type="button" class="x" data-x aria-label="Fechar">${I('x')}</button></div>`;

    /* ---------- Detalhe ---------- */
    async function openDetail(x) {
        const st = A.STATUS[x.status] || A.STATUS.agendado, p = proById(x.professionalId);
        if (x.status === 'bloqueio') {
            const ov = modal(head('lock', 'Horário bloqueado') + `<div class="ag-mb"><dl class="ag-dl"><dt>Profissional</dt><dd>${esc(x.professionalName || (p && p.name) || '—')}</dd><dt>Quando</dt><dd>${esc(A.dayLabel(x.date))} · ${esc(x.start)} às ${esc(x.end || fromMin(toMin(x.start) + durOf(x)))}</dd><dt>Motivo</dt><dd>${esc(x.notes || '—')}</dd></dl></div><div class="ag-mf"><button type="button" class="btn btn-outline" data-d="excluir">${I('trash-2')} Excluir bloqueio</button><button type="button" class="btn btn-primary" data-d="editar">${I('pencil')} Editar</button></div>`, 'sm');
            ov.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (b) act(b.dataset.d, x); });
            return;
        }
        const g = segs(x), end = fromMin(toMin(x.start) + durOf(x));
        const items = (x.items || []).map(i => { const ip = proById(i.professionalId || x.professionalId); return `<div><span>${esc(i.name)}<small>${ip ? 'com ' + esc(ip.name) + ' · ' : ''}${Number(i.durationMin) || 30} min</small></span><b>${money(i.price)}</b></div>`; }).join('');
        const ck = x.checkin && x.checkin.items ? Object.entries(x.checkin.items).filter(([, v]) => v === 'fail').map(([k]) => ((x.checkin.list || []).find(l => l.k === k) || { l: k }).l) : [];
        const info = [
            ['Quando', `${esc(A.dayLabel(x.date))} · ${esc(x.start || '')}–${end}${x.walkIn ? ' · encaixe' : ''}`],
            ['Profissional', esc([...new Set(g.map(s => (proById(s.pro) || {}).name).filter(Boolean))].join(' e ') || x.professionalName || 'qualquer profissional')],
            x.itemName ? ['Pet / veículo', esc(x.itemName)] : null,
            x.arrivedAt ? ['Chegou', hm(x.arrivedAt)] : null,
            x.startedAt ? ['Começou', hm(x.startedAt)] : null,
            x.remindedAt ? ['Lembrete', 'enviado ' + dhm(x.remindedAt)] : null,
            x.confirmSentAt && !x.remindedAt ? ['Confirmação', 'enviada ' + dhm(x.confirmSentAt)] : null,
            x.saleNumber ? ['Venda', `#V-${String(x.saleNumber).padStart(4, '0')}`] : null,
            x.cancelReason ? ['Motivo', esc(x.cancelReason)] : null,
            x.notes ? ['Observações', esc(x.notes)] : null,
            x.createdByName ? ['Marcado por', esc(x.createdByName) + (x.createdAt ? ' · ' + dhm(x.createdAt) : '')] : null
        ].filter(Boolean).map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('');
        const B = (d, ic, l, cls) => `<button type="button" class="btn ${cls || 'btn-outline'}" data-d="${d}">${I(ic)} ${l}</button>`;
        const ph = !!A.waPhone(x.customerPhone);
        const acts = {
            agendado: [B('confirmar', 'calendar-check', 'Confirmar', 'btn-primary'), ph ? B('wa-confirm', 'whatsapp', 'Confirmar no WhatsApp', 'ag-wa') : '', B('chegou', 'user-check', 'Chegou'), B('faltou', 'user-x', 'Faltou'), B('editar', 'pencil', 'Editar / remarcar'), B('cancelar', 'calendar-x', 'Cancelar')],
            confirmado: [B('chegou', 'user-check', 'Chegou', 'btn-primary'), ph ? B('wa-remind', 'whatsapp', 'Lembrete no WhatsApp', 'ag-wa') : '', B('faltou', 'user-x', 'Faltou'), B('editar', 'pencil', 'Editar / remarcar'), B('cancelar', 'calendar-x', 'Cancelar')],
            chegou: [B('iniciar', 'play', 'Iniciar atendimento', 'btn-primary'), B('checkin', 'clipboard-check', 'Check-in'), canPdv() ? B('caixa', 'scan-barcode', 'Fechar no caixa', 'btn-success') : '', B('editar', 'pencil', 'Editar')],
            atendendo: [B('pronto', 'bell', 'Pronto', 'btn-primary'), canPdv() ? B('caixa', 'scan-barcode', 'Fechar no caixa', 'btn-success') : '', B('checkin', 'clipboard-check', 'Check-in'), B('editar', 'pencil', 'Editar')],
            pronto: [ph ? B('wa-ready', 'whatsapp', 'Avisar que está pronto', 'ag-wa') : '', canPdv() ? B('caixa', 'scan-barcode', 'Fechar no caixa', 'btn-success') : '', B('editar', 'pencil', 'Editar')],
            concluido: [B('reagendar', 'calendar-days', 'Marcar o próximo')],
            faltou: [B('reagendar', 'calendar-days', 'Remarcar', 'btn-primary'), ph ? B('wa', 'whatsapp', 'Conversar', 'ag-wa') : '', B('desfazer', 'rotate-ccw', 'Desfazer falta')],
            cancelado: [B('reagendar', 'calendar-days', 'Remarcar', 'btn-primary'), B('desfazer', 'rotate-ccw', 'Desfazer cancelamento')]
        }[x.status] || [];
        const ov = modal(head('calendar-days', 'Atendimento') + `<div class="ag-mb"><div class="ag-det">
<div class="ag-det-h"><span class="av" style="background:${esc(p ? p.color : '#6366f1')}">${esc(initials(x.customerName))}</span><div style="flex:1;min-width:0"><h4>${esc(x.customerName || 'Cliente')}</h4><p>${x.customerPhone ? esc(x.customerPhone) : 'sem telefone'}${ph ? ` · <a href="#" data-d="wa" style="color:#16a34a;font-weight:700">${I('whatsapp')} WhatsApp</a>` : ''}${x.customerId ? ` · <a href="clientes.html?id=${encodeURIComponent(x.customerId)}&aba=agenda" style="color:var(--accent);font-weight:700">ficha</a>` : ''}</p></div><span class="ag-pill" style="--sc:${st[1]}">${I(st[2])}${esc(st[0])}</span></div>
<div id="agDetWarn"></div>
<dl class="ag-dl">${info}</dl>
${items ? `<div class="ag-items">${items}<div class="t"><span>Total</span><b>${money(x.total)}</b></div></div>` : ''}
${ck.length || (x.checkin && x.checkin.notes) ? `<div class="ag-warn">${I('clipboard-check')}<div><b>Check-in:</b> ${ck.length ? esc(ck.join(', ')) : 'tudo certo'}${x.checkin.notes ? ' · ' + esc(x.checkin.notes) : ''}</div></div>` : ''}
</div></div><div class="ag-mf" style="justify-content:flex-start">${acts.join('')}</div>`);
        ov.addEventListener('click', e => { const b = e.target.closest('[data-d]'); if (!b) return; e.preventDefault(); act(b.dataset.d, byId(x.id) || x); });
        ext('detail', ov, x, { close: closeModal, refresh });
        if (x.customerId) history(x.customerId).then(h => {
            const f = h.filter(y => y.status === 'faltou' && y.id !== x.id); const box = $('agDetWarn'); if (!box || !f.length) return;
            box.innerHTML = `<div class="ag-warn bad">${I('triangle-alert')}<div>Este cliente já faltou <b>${f.length} ${f.length === 1 ? 'vez' : 'vezes'}</b> (última em ${brDate(f.sort((a, b) => b.date.localeCompare(a.date))[0].date)}). Vale confirmar antes.</div></div>`;
        });
    }

    /* ---------- Agendar / editar / encaixe ---------- */
    async function openForm(ap, preset) {
        preset = preset || {};
        const isNew = !ap || !ap.id, walkIn = !!(preset.walkIn || (ap && ap.walkIn && ap.status === 'chegou'));
        const src = ap || preset;
        const F = {
            id: ap ? ap.id : '', customerId: src.customerId || '', customerName: src.customerName || '', customerPhone: src.customerPhone || '', itemName: src.itemName || '',
            items: (src.items || []).map(i => ({ ...i })), professionalId: src.professionalId !== undefined ? src.professionalId : (walkIn ? '' : (S.pros.length === 1 ? S.pros[0].id : (S.pros.find(p => p.id === A.myId()) || {}).id || '')),
            date: walkIn ? todayKey() : (src.date || S.date), start: src.start || '', notes: src.notes || '', dur: Number(src.durationMin) || 30
        };
        if (!F.professionalId && !walkIn && S.pros.length && !A.seesAll()) F.professionalId = S.pros[0].id;
        if (preset.customerId && !F.customerName) { const c = (await customers()).find(x => x.id === preset.customerId); if (c) { F.customerName = c.name; F.customerPhone = c.phone; } }
        await products();
        const proOpts = sel => (walkIn ? `<option value="" ${!sel ? 'selected' : ''}>Qualquer um (o primeiro livre)</option>` : (S.pros.length ? '' : '<option value="">Sem profissional</option>')) + (A.seesAll() ? S.allPros : S.pros).map(p => `<option value="${esc(p.id)}" ${p.id === sel ? 'selected' : ''}>${esc(p.name || 'Profissional')}</option>`).join('');
        const top = services().slice().sort((a, b) => String(a.name).localeCompare(String(b.name), 'pt-BR')).slice(0, 10);
        const ov = modal(head(walkIn ? 'user-plus' : isNew ? 'calendar-days' : 'pencil', walkIn ? 'Encaixe: chegou sem horário' : isNew ? 'Novo horário' : 'Editar horário') + `<div class="ag-mb">
<div class="ag-f ag-dd" id="fCustWrap"><label>Cliente</label><div id="fCust"></div></div>
<div id="fCustWarn"></div>
<div class="ag-f"><label>Pet, veículo ou detalhe (opcional)</label><input class="form-control" id="fItem" maxlength="80" value="${esc(F.itemName)}" placeholder="Ex.: Thor (shih-tzu, porte P) · Gol prata ABC1D23"></div>
<div class="ag-f ag-dd"><label>Serviços</label><input class="form-control" id="fSvcQ" autocomplete="off" placeholder="Buscar serviço: corte, barba, banho, lavagem..."><div class="list" id="fSvcL"></div></div>
${top.length ? `<div class="ag-qs" id="fQuick">${top.map(p => `<button type="button" data-p="${esc(p.id)}">+ ${esc(p.name)}</button>`).join('')}</div>` : ''}
<div class="ag-svcs" id="fSvcs"></div>
<div class="ag-tot"><span id="fDurTxt"></span><b id="fTotal"></b></div>
<div class="${walkIn ? 'ag-row' : 'ag-row3'}"><div class="ag-f"><label>Profissional</label><select class="form-control" id="fPro">${proOpts(F.professionalId)}</select></div>
${walkIn ? `<div class="ag-f"><label>Duração sem serviço (min)</label><input class="form-control" type="number" id="fDur" min="5" step="5" value="${F.dur}"></div>` : `<div class="ag-f"><label>Dia</label><input class="form-control" type="date" id="fDate" value="${esc(F.date)}"></div><div class="ag-f"><label>Horário</label><input class="form-control" type="time" id="fStart" step="300" value="${esc(F.start)}"></div>`}</div>
${walkIn ? '' : `<div class="ag-f" id="fDurBox"><label>Duração sem serviço (min)</label><input class="form-control" type="number" id="fDur" min="5" step="5" value="${F.dur}"></div>`}
<div id="fFree"></div>
<div class="ag-f"><label>Observações</label><textarea class="form-control" id="fNotes" rows="2" maxlength="400" placeholder="Ex.: prefere máquina 2 · cão bravo · trazer o documento">${esc(F.notes)}</textarea></div>
<div id="fWarn" style="display:grid;gap:6px"></div>
</div><div class="ag-mf">${walkIn ? '' : `<label style="margin-right:auto;display:inline-flex;align-items:center;gap:7px;font-size:12.5px;color:var(--text-secondary);cursor:pointer"><input type="checkbox" id="fWa" ${isNew ? 'checked' : ''}> ${I('whatsapp')} Enviar confirmação no WhatsApp</label>`}<button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary" id="fSave">${I('check')} ${walkIn ? 'Pôr na fila' : 'Salvar horário'}</button></div>`);
        const q = sel => ov.querySelector(sel);
        /* cliente */
        function paintCust() {
            const box = q('#fCust');
            if (window.DPItens) DPItens.agendaChips(q('#fItem'), F.customerId, (ap && ap.itemId) || preset.itemId || '', F); // 38.2 · pets/veículos do cliente
            if (F.customerName) {
                box.innerHTML = `<span class="ag-chip">${I('user')}${esc(F.customerName)}${F.customerPhone ? ' · ' + esc(F.customerPhone) : ''}${F.customerId ? '' : ' <small style="font-weight:500;color:var(--text-muted)">(sem cadastro)</small>'}<button type="button" data-clr title="Trocar cliente">${I('x')}</button></span>`;
                box.querySelector('[data-clr]').onclick = () => { F.customerId = ''; F.customerName = ''; F.customerPhone = ''; q('#fCustWarn').innerHTML = ''; paintCust(); setTimeout(() => q('#fCustQ')?.focus(), 30); };
                custWarn();
            } else {
                box.innerHTML = `<input class="form-control" id="fCustQ" autocomplete="off" placeholder="Nome ou telefone do cliente"><div class="list" id="fCustL"></div>`;
                const inp = box.querySelector('#fCustQ'), list = box.querySelector('#fCustL');
                const paint = async () => {
                    const t = inp.value.trim(), n = norm(t), dg = t.replace(/\D/g, '');
                    if (t.length < 2) { list.classList.remove('on'); return; }
                    const hits = (await customers()).filter(c => norm(c.name).includes(n) || (dg.length >= 3 && String(c.phone).replace(/\D/g, '').includes(dg))).slice(0, 8);
                    list.innerHTML = hits.map(c => `<button type="button" data-c="${esc(c.id)}">${I('user')}${esc(c.name)}<small>${esc(c.phone || '')}</small></button>`).join('')
                        + `<button type="button" data-new>${I('user-plus')}Cadastrar "${esc(t)}" como cliente novo</button><button type="button" data-loose>${I('user')}Usar "${esc(t)}" sem cadastro</button>`;
                    list.classList.add('on');
                };
                inp.addEventListener('input', paint);
                inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); list.querySelector('button')?.click(); } });
                list.addEventListener('click', async e => {
                    const b = e.target.closest('button'); if (!b) return;
                    const t = inp.value.trim();
                    if (b.dataset.c) { const c = (await customers()).find(x => x.id === b.dataset.c); if (c) { F.customerId = c.id; F.customerName = c.name; F.customerPhone = c.phone; } }
                    else if ('loose' in b.dataset) { F.customerId = ''; F.customerName = t; F.customerPhone = ''; }
                    else if ('new' in b.dataset) return newCustomer(t);
                    paintCust(); check();
                });
                setTimeout(() => inp.focus(), 60);
            }
        }
        function newCustomer(name) {
            const box = q('#fCust');
            const digits = /^[\d\s()+-]+$/.test(name) ? name : '';
            box.innerHTML = `<div class="ag-row"><input class="form-control" id="fNcName" placeholder="Nome do cliente" value="${esc(digits ? '' : name)}"><input class="form-control" id="fNcPhone" inputmode="tel" placeholder="WhatsApp com DDD" value="${esc(digits)}"></div><div style="display:flex;gap:8px;margin-top:8px"><button type="button" class="btn btn-primary btn-sm" id="fNcOk">${I('check')} Cadastrar</button><button type="button" class="btn btn-secondary btn-sm" id="fNcNo">Voltar</button></div>`;
            box.querySelector('#fNcNo').onclick = () => paintCust();
            box.querySelector('#fNcOk').onclick = async () => {
                const nm = box.querySelector('#fNcName').value.trim(), ph = box.querySelector('#fNcPhone').value.trim();
                if (!nm) { toast('warning', 'Informe o nome.'); return; }
                const dup = (await customers()).find(c => (ph && String(c.phone).replace(/\D/g, '').slice(-8) === ph.replace(/\D/g, '').slice(-8) && ph.replace(/\D/g, '').length >= 8) || norm(c.name) === norm(nm));
                if (dup && confirm(`Já existe "${dup.name}"${dup.phone ? ' (' + dup.phone + ')' : ''}. Usar esse cadastro?`)) { F.customerId = dup.id; F.customerName = dup.name; F.customerPhone = dup.phone; paintCust(); check(); return; }
                try {
                    const ref = await db.collection('customers').add({ name: nm, phone: ph, whatsapp: ph, status: 'active', type: 'PF', source: 'agenda', totalPurchases: 0, purchaseCount: 0, deleted: false, createdAt: ts(), updatedAt: ts() });
                    S.customers && S.customers.push({ id: ref.id, name: nm, phone: ph, doc: '' });
                    F.customerId = ref.id; F.customerName = nm; F.customerPhone = ph; paintCust(); check(); toast('success', 'Cliente cadastrado.');
                } catch (e) { toast('error', 'Não foi possível cadastrar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            };
            setTimeout(() => box.querySelector(digits ? '#fNcName' : '#fNcPhone').focus(), 50);
        }
        async function custWarn() {
            const w = q('#fCustWarn'); if (!w) return; w.innerHTML = '';
            if (!F.customerId) return;
            const h = await history(F.customerId); if (!$('agModal')) return;
            const falt = h.filter(y => y.status === 'faltou'), fut = h.filter(y => y.id !== F.id && A.OPEN_ST.includes(y.status) && y.date >= todayKey()).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
            w.innerHTML = (falt.length ? `<div class="ag-warn bad">${I('triangle-alert')}<div>Este cliente já faltou <b>${falt.length} ${falt.length === 1 ? 'vez' : 'vezes'}</b>. Vale confirmar na véspera.</div></div>` : '')
                + (fut.length ? `<div class="ag-warn" style="margin-top:6px">${I('calendar-clock')}<div>Já tem horário: <b>${esc(A.dayLabel(fut[0].date))} às ${esc(fut[0].start)}</b>${fut[0].professionalName ? ' com ' + esc(firstName(fut[0].professionalName)) : ''}.</div></div>` : '');
        }
        /* serviços */
        const mainPro = () => q('#fPro').value || '';
        function addSvc(p, name) {
            const pro = proById(mainPro());
            F.items.push(p ? { productId: p.id, name: p.name, price: r2(Number(p.promoPrice) > 0 && Number(p.promoPrice) < Number(p.salePrice) ? p.promoPrice : p.salePrice), durationMin: A.duration(p), professionalId: pro ? pro.id : '', professionalName: pro ? pro.name : '' }
                : { productId: '', name, price: 0, durationMin: 30, professionalId: pro ? pro.id : '', professionalName: pro ? pro.name : '' });
            paintSvcs(); check();
        }
        function paintSvcs() {
            const host = q('#fSvcs');
            const pros = A.seesAll() ? S.allPros : S.pros;
            host.innerHTML = F.items.map((it, i) => `<div class="ag-svc" data-i="${i}"><b title="${esc(it.name)}">${esc(it.name)}</b><select class="form-control" data-f="pro" title="Quem faz este serviço"><option value="">${walkIn ? 'Qualquer um' : 'Profissional do horário'}</option>${pros.map(p => `<option value="${esc(p.id)}" ${p.id === it.professionalId ? 'selected' : ''}>${esc(firstName(p.name))}</option>`).join('')}</select><input class="form-control" type="number" min="5" step="5" data-f="dur" value="${Number(it.durationMin) || 30}" title="Minutos"><input class="form-control" type="number" min="0" step="0.01" data-f="price" value="${r2(it.price).toFixed(2)}" title="Preço"><button type="button" class="rm" data-rm="${i}" title="Tirar">${I('trash-2')}</button></div>`).join('');
            const dur = F.items.reduce((s, i) => s + (Number(i.durationMin) || 30), 0), tot = r2(F.items.reduce((s, i) => s + Number(i.price || 0), 0));
            q('#fDurTxt').textContent = F.items.length ? `${F.items.length} ${F.items.length === 1 ? 'serviço' : 'serviços'} · ${dur} min` : 'Nenhum serviço escolhido';
            q('#fTotal').textContent = money(tot);
            const db_ = q('#fDurBox'); if (db_) db_.style.display = F.items.length ? 'none' : '';
            if (walkIn && q('#fDur')) q('#fDur').closest('.ag-f').style.display = F.items.length ? 'none' : '';
        }
        q('#fSvcs').addEventListener('change', e => {
            const row = e.target.closest('[data-i]'); if (!row) return; const it = F.items[Number(row.dataset.i)]; if (!it) return;
            const f = e.target.dataset.f;
            if (f === 'pro') { const p = proById(e.target.value); it.professionalId = p ? p.id : ''; it.professionalName = p ? p.name : ''; }
            if (f === 'dur') it.durationMin = Math.max(5, Math.round(Number(e.target.value) || 30));
            if (f === 'price') it.price = Math.max(0, r2(String(e.target.value).replace(',', '.')));
            paintSvcs(); check();
        });
        q('#fSvcs').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (!b) return; F.items.splice(Number(b.dataset.rm), 1); paintSvcs(); check(); });
        const sq = q('#fSvcQ'), sl = q('#fSvcL');
        sq.addEventListener('input', () => {
            const t = sq.value.trim(), n = norm(t); if (!t) { sl.classList.remove('on'); return; }
            const hits = services().filter(p => norm(p.name).includes(n) || norm(p.code || '').includes(n)).slice(0, 8);
            const more = hits.length < 3 ? (S.products || []).filter(p => !hits.includes(p) && norm(p.name).includes(n)).slice(0, 4) : [];
            sl.innerHTML = [...hits, ...more].map(p => `<button type="button" data-p="${esc(p.id)}">${I(A.isService(p) ? 'scissors' : 'package')}${esc(p.name)}<small>${money(p.salePrice)} · ${A.duration(p)} min</small></button>`).join('') + `<button type="button" data-free>${I('plus')}Usar "${esc(t)}" (serviço avulso)</button>`;
            sl.classList.add('on');
        });
        sq.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); sl.querySelector('button')?.click(); } });
        sl.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.p) addSvc((S.products || []).find(p => p.id === b.dataset.p)); else addSvc(null, sq.value.trim()); sq.value = ''; sl.classList.remove('on'); sq.focus(); });
        q('#fQuick')?.addEventListener('click', e => { const b = e.target.closest('[data-p]'); if (b) addSvc((S.products || []).find(p => p.id === b.dataset.p)); });
        ov.addEventListener('click', e => { if (!e.target.closest('.ag-dd')) ov.querySelectorAll('.ag-dd .list').forEach(l => l.classList.remove('on')); });
        q('#fPro').addEventListener('change', () => {
            const p = proById(mainPro()), old = F.professionalId; F.professionalId = p ? p.id : '';
            F.items.forEach(i => { if (!i.professionalId || i.professionalId === old) { i.professionalId = p ? p.id : ''; i.professionalName = p ? p.name : ''; } });
            paintSvcs(); check();
        });
        ['#fDate', '#fStart', '#fDur'].forEach(s => q(s)?.addEventListener('change', check));
        /* conferência */
        function draft() {
            const pro = proById(mainPro());
            const items = F.items.map(i => ({ ...i, professionalId: i.professionalId || (pro ? pro.id : ''), professionalName: i.professionalId ? i.professionalName : (pro ? pro.name : '') }));
            const date = walkIn ? todayKey() : (q('#fDate').value || S.date), start = walkIn ? fromMin(nowMin()) : (q('#fStart').value || '');
            return { id: F.id, date, start, professionalId: pro ? pro.id : '', professionalName: pro ? pro.name : '', items, durationMin: items.length ? 0 : Math.max(5, Math.round(Number(q('#fDur') && q('#fDur').value) || 30)), status: ap ? ap.status : 'agendado' };
        }
        let checkT = 0;
        function check() {
            clearTimeout(checkT); checkT = setTimeout(async () => {
                const d = draft(), warn = q('#fWarn'), free = q('#fFree'); if (!warn) return;
                const dur = durOf(d);
                if (!walkIn && d.date !== S.date && !S.appts.some(x => x.date === d.date)) { try { const extra = docs(await query(d.date, d.date).get()); d._list = extra; } catch (e) { } }
                const list = d._list || S.appts;
                const msgs = [];
                if (!walkIn && d.start) {
                    const c = conflicts(d, list);
                    if (c.length) { const f = c[0]; msgs.push(`<div class="ag-warn bad">${I('triangle-alert')}<div><b>Conflito:</b> ${esc(firstName((proById(f.g.pro) || {}).name) || 'o profissional')} já tem ${f.o.status === 'bloqueio' ? 'um bloqueio (' + esc(f.o.notes || 'horário bloqueado') + ')' : esc(f.o.customerName || 'cliente')} das ${fromMin(f.g.s)} às ${fromMin(f.g.e)}.</div></div>`); }
                    outside(d).forEach(m => msgs.push(`<div class="ag-warn">${I('clock')}<div>Atenção: ${esc(m)}.</div></div>`));
                    if (d.date < todayKey()) msgs.push(`<div class="ag-warn">${I('info')}<div>Este dia já passou.</div></div>`);
                }
                warn.innerHTML = msgs.join('');
                if (!walkIn && d.professionalId) {
                    const sl = freeSlots(d.professionalId, d.date, dur, F.id, list);
                    free.innerHTML = sl.length ? `<div class="ag-f"><label>Horários livres de ${esc(firstName(d.professionalName))} (${dur} min)</label><div class="ag-qs">${sl.slice(0, 14).map(t => `<button type="button" data-t="${t}" ${t === d.start ? 'style="border-color:var(--accent);color:var(--accent);font-weight:800"' : ''}>${t}</button>`).join('')}</div></div>` : `<div class="ag-warn">${I('calendar-x')}<div>${esc(firstName(d.professionalName))} não tem horário livre de ${dur} min neste dia.</div></div>`;
                } else free.innerHTML = '';
            }, 120);
        }
        q('#fFree').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; q('#fStart').value = b.dataset.t; check(); });
        q('#fSave').addEventListener('click', async () => {
            const d = draft();
            const nameNow = F.customerName || (q('#fCustQ') && q('#fCustQ').value.trim()) || '';
            if (!nameNow && !F.itemName && !q('#fItem').value.trim()) { toast('warning', 'Informe o cliente.'); q('#fCustQ')?.focus(); return; }
            if (!walkIn) {
                if (!d.start) { toast('warning', 'Escolha o horário.'); q('#fStart').focus(); return; }
                if (!d.professionalId && S.pros.length) { toast('warning', 'Escolha o profissional.'); q('#fPro').focus(); return; }
                const c = conflicts(d, d._list || S.appts);
                if (c.length && !confirm(`${firstName((proById(c[0].g.pro) || {}).name) || 'O profissional'} já tem ${c[0].o.customerName || 'um horário'} das ${fromMin(c[0].g.s)} às ${fromMin(c[0].g.e)}. Marcar mesmo assim (encaixe)?`)) return;
            }
            const total = r2(d.items.reduce((s, i) => s + Number(i.price || 0), 0)), dur = durOf(d);
            const data = {
                date: d.date, start: d.start, end: fromMin(toMin(d.start) + dur), durationMin: dur,
                professionalId: d.professionalId, professionalName: d.professionalName,
                customerId: F.customerId || '', customerName: nameNow, customerPhone: F.customerPhone || '',
                itemId: q('#fItem').dataset.itemId !== undefined ? q('#fItem').dataset.itemId : ((ap && ap.itemId) || preset.itemId || ''), itemName: q('#fItem').value.trim(), items: d.items, total,
                notes: q('#fNotes').value.trim(), walkIn
            };
            if (isNew) Object.assign(data, walkIn ? { status: 'chegou', arrivedAt: ts() } : { status: 'agendado' });
            const btn = q('#fSave'); btn.disabled = true;
            try {
                const id = await save(F.id, data);
                closeModal();
                toast('success', walkIn ? `${firstName(nameNow) || 'Cliente'} entrou na fila.` : isNew ? 'Horário marcado.' : 'Horário atualizado.');
                if (!walkIn && d.date !== S.date) go(d.date);
                S.hl = id;
                if (!walkIn && q('#fWa') && q('#fWa').checked && A.waPhone(data.customerPhone)) await A.openWa(data.customerPhone, await A.fill(A.cfg.msgConfirm, { ...data, id })).then(() => save(id, { confirmSentAt: ts() }));
            } catch (e) { btn.disabled = false; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
        paintCust(); paintSvcs(); check();
        if (!F.customerName) setTimeout(() => q('#fCustQ')?.focus(), 80);
    }

    /* ---------- Bloqueio (almoço, folga) ---------- */
    function openBlock(ap, preset) {
        preset = preset || {};
        const src = ap || preset, pros = A.seesAll() ? S.allPros : S.pros;
        const pro = src.professionalId || (pros.find(p => p.id === A.myId()) || pros[0] || {}).id || '';
        const st = src.start || '12:00', en = src.end || fromMin(toMin(st) + 60);
        const ov = modal(head('lock', ap ? 'Editar bloqueio' : 'Bloquear horário') + `<div class="ag-mb">
<div class="ag-row"><div class="ag-f"><label>Profissional</label><select class="form-control" id="bPro">${pros.map(p => `<option value="${esc(p.id)}" ${p.id === pro ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></div><div class="ag-f"><label>Dia</label><input type="date" class="form-control" id="bDate" value="${esc(src.date || S.date)}"></div></div>
<div class="ag-row"><div class="ag-f"><label>Das</label><input type="time" class="form-control" id="bStart" step="300" value="${esc(st)}"></div><div class="ag-f"><label>Até</label><input type="time" class="form-control" id="bEnd" step="300" value="${esc(en)}"></div></div>
<label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer"><input type="checkbox" id="bAll"> O dia todo (folga)</label>
<div class="ag-f"><label>Motivo</label><input class="form-control" id="bWhy" maxlength="80" value="${esc(src.notes || '')}" placeholder="Almoço, folga, curso, médico..."><div class="ag-qs" style="margin-top:6px">${['Almoço', 'Folga', 'Curso', 'Compromisso'].map(t => `<button type="button" data-w="${t}">${t}</button>`).join('')}</div></div>
</div><div class="ag-mf"><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary" id="bSave">${I('lock')} Bloquear</button></div>`, 'sm');
        const q = s => ov.querySelector(s);
        ov.querySelectorAll('[data-w]').forEach(b => b.onclick = () => { q('#bWhy').value = b.dataset.w; if (b.dataset.w === 'Folga') { q('#bAll').checked = true; } });
        q('#bSave').onclick = async () => {
            const p = proById(q('#bPro').value), date = q('#bDate').value || S.date;
            let s = q('#bStart').value, e = q('#bEnd').value;
            if (q('#bAll').checked) { const h = (p && A.hoursOf(p, date)) || [A.cfg.open, A.cfg.close]; s = h[0]; e = h[1]; }
            if (!p || !s || !e || toMin(e) <= toMin(s)) { toast('warning', 'Confira o profissional e o horário.'); return; }
            try { await save(ap ? ap.id : '', { status: 'bloqueio', date, start: s, end: e, durationMin: toMin(e) - toMin(s), professionalId: p.id, professionalName: p.name || '', items: [], total: 0, customerId: '', customerName: '', notes: q('#bWhy').value.trim() || 'Horário bloqueado' }); closeModal(); toast('success', 'Horário bloqueado.'); if (date !== S.date) go(date); }
            catch (err) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        };
    }

    /* ---------- Lembretes (WhatsApp) ---------- */
    async function openRemind(k) {
        const ov = modal(head('bell', 'Lembretes pelo WhatsApp') + `<div class="ag-mb"><div class="ag-row"><div class="ag-f"><label>Dia dos horários</label><input type="date" class="form-control" id="rDate" value="${k}"></div><div class="ag-f" style="align-self:end;font-size:12px;color:var(--text-muted)">Toque em "Enviar" em cada cliente: o WhatsApp abre com a mensagem pronta. Quem já recebeu fica marcado.</div></div><div id="rList"><div class="ag-empty">${I('loader-circle')}</div></div></div><div class="ag-mf"><button type="button" class="btn btn-secondary" data-x>Fechar</button></div>`, 'lg');
        const paint = async () => {
            const day = ov.querySelector('#rDate').value; const box = ov.querySelector('#rList');
            let list = [];
            try { list = docs(await db.collection('appointments').where('date', '==', day).get()).filter(x => ['agendado', 'confirmado'].includes(x.status) && !x.walkIn && mine(x)).sort((a, b) => toMin(a.start) - toMin(b.start)); } catch (e) { }
            if (!$('agModal')) return;
            box.innerHTML = list.length ? list.map(x => `<div class="ag-rem" data-id="${esc(x.id)}"><span class="h">${esc(x.start)}</span><div><b>${esc(x.customerName || 'Cliente')}</b><small>${esc((x.items || []).map(i => i.name).join(' + ') || 'Atendimento')} · ${esc(firstName(x.professionalName) || '')}${x.customerPhone ? ' · ' + esc(x.customerPhone) : ' · <span style="color:#dc2626">sem telefone</span>'}</small>${x.remindedAt ? `<span class="sent">${I('check-check')} lembrete enviado ${dhm(x.remindedAt)}</span>` : ''}</div><div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">${x.status === 'agendado' ? `<button type="button" class="ag-mini" data-r="ok">${I('calendar-check')}Confirmado</button>` : '<span class="ag-pill" style="--sc:#0ea5e9">confirmado</span>'}${A.waPhone(x.customerPhone) ? `<button type="button" class="ag-mini ${x.remindedAt ? '' : 'go'}" data-r="send">${I('whatsapp')}${x.remindedAt ? 'Reenviar' : 'Enviar'}</button>` : ''}</div></div>`).join('') : `<div class="ag-empty">${I('calendar-check')}<h3>Nada para lembrar</h3><p>Não há horários marcados neste dia.</p></div>`;
            box.onclick = async e => {
                const b = e.target.closest('[data-r]'); if (!b) return; const row = b.closest('[data-id]'); const x = list.find(y => y.id === row.dataset.id); if (!x) return;
                if (b.dataset.r === 'send') { await A.openWa(x.customerPhone, await A.fill(A.cfg.msgRemind, x)); await save(x.id, { remindedAt: ts() }); }
                if (b.dataset.r === 'ok') await save(x.id, { status: 'confirmado', confirmedAt: ts() });
                setTimeout(paint, 250); loadRemind();
            };
        };
        ov.querySelector('#rDate').addEventListener('change', paint);
        paint();
    }

    /* ---------- Check-in (pet, veículo ou geral) ---------- */
    const CK = {
        pet: ['Pet', [['pulgas', 'Pulgas'], ['carrapatos', 'Carrapatos'], ['feridas', 'Feridas ou machucados'], ['nos', 'Nós no pelo'], ['unhas', 'Unhas grandes'], ['ouvido', 'Ouvido sujo ou com cheiro'], ['agitado', 'Agitado ou morde'], ['sensivel', 'Idoso ou cardíaco (sem secador forte)']]],
        veiculo: ['Veículo', [['riscos', 'Riscos na pintura'], ['amassados', 'Amassados'], ['vidros', 'Vidro trincado'], ['rodas', 'Rodas ou calotas com dano'], ['objetos', 'Objetos de valor no carro'], ['sujeira', 'Sujeira pesada (barro, pelo)'], ['bancos', 'Bancos manchados'], ['painel', 'Luz acesa no painel']]],
        geral: ['Geral', [['alergia', 'Alergia ou sensibilidade'], ['pele', 'Pele irritada ou com ferida'], ['quimica', 'Química recente no cabelo'], ['gestante', 'Gestante'], ['atencao', 'Pediu atenção especial']]]
    };
    function ckDefault() {
        const g = A.settings || {}, seg = String(g.segment || ''), ds = String(g.demoDataset || '');
        if (g.petEnabled || ['petshop', 'pet'].includes(seg) || ds === 'petshop') return 'pet';
        if (g.osVehicleMode || ['oficina', 'lavajato', 'lava-jato', 'autocenter'].includes(seg) || ds === 'auto_service') return 'veiculo';
        return 'geral';
    }
    function openCheckin(x) {
        let model = (x.checkin && x.checkin.model) || ckDefault();
        const cur = (x.checkin && x.checkin.items) || {};
        const ov = modal(head('clipboard-check', 'Check-in') + `<div class="ag-mb"><div class="ag-tabs" id="ckTabs">${Object.entries(CK).map(([k, v]) => `<button type="button" data-m="${k}" class="${k === model ? 'on' : ''}">${v[0]}</button>`).join('')}</div><p style="margin:0;font-size:12.5px;color:var(--text-muted)">Marque só o que precisa de atenção. O resto fica como "ok". Fica guardado no atendimento.</p><div class="ag-ck" id="ckList"></div><div class="ag-f"><label>Observações</label><textarea class="form-control" id="ckNotes" rows="2" maxlength="300">${esc((x.checkin && x.checkin.notes) || '')}</textarea></div></div><div class="ag-mf"><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary" id="ckSave">${I('check')} Salvar check-in</button></div>`);
        const paint = () => { ov.querySelector('#ckList').innerHTML = CK[model][1].map(([k, l]) => `<label class="${cur[k] === 'fail' ? 'fail' : ''}"><input type="checkbox" value="${k}" ${cur[k] === 'fail' ? 'checked' : ''}>${esc(l)}</label>`).join(''); ov.querySelectorAll('#ckTabs [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === model)); };
        ov.querySelector('#ckTabs').onclick = e => { const b = e.target.closest('[data-m]'); if (b) { model = b.dataset.m; paint(); } };
        ov.querySelector('#ckList').onchange = e => { const l = e.target.closest('label'); if (l) { l.classList.toggle('fail', e.target.checked); cur[e.target.value] = e.target.checked ? 'fail' : 'ok'; } };
        ov.querySelector('#ckSave').onclick = async () => {
            const list = CK[model][1].map(([k, l]) => ({ k, l })), items = {};
            list.forEach(({ k }) => { items[k] = cur[k] === 'fail' ? 'fail' : 'ok'; });
            try { await save(x.id, { checkin: { model, list, items, notes: ov.querySelector('#ckNotes').value.trim(), at: new Date().toISOString(), by: A.myName() } }); closeModal(); toast('success', 'Check-in salvo.'); setTimeout(() => { const f = byId(x.id); if (f) openDetail(f); }, 250); }
            catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
        paint();
    }

    /* ---------- Ajustes: expediente, equipe e mensagens ---------- */
    async function openSettings(tab) {
        if (!A.isBoss()) return;
        await loadPros(true);
        const c = A.cfg;
        const users = S.users.filter(u => ['admin', 'manager', 'seller', 'cashier', 'technician'].includes(u.role || 'admin'));
        const hoursHtml = h => [1, 2, 3, 4, 5, 6, 0].map(wd => { const d = h && (h[wd] || h[String(wd)]); const on = Array.isArray(d) && d[0]; return `<label class="${on ? '' : 'off'}" data-wd="${wd}"><input type="checkbox" ${on ? 'checked' : ''}><b>${A.WD3[wd]}</b><input type="time" value="${esc(on ? d[0] : c.open)}" step="300"> <input type="time" value="${esc(on ? d[1] : c.close)}" step="300"></label>`; }).join('');
        const defH = () => { const h = {}; for (let wd = 0; wd < 7; wd++) h[wd] = c.days.includes(wd) ? [c.open, c.close] : []; return h; };
        const ov = modal(head('settings', 'Ajustes da agenda') + `<div class="ag-mb"><div class="ag-tabs" id="sTabs"><button type="button" data-t="exp">${I('clock')} Expediente</button><button type="button" data-t="team">${I('users')} Equipe</button><button type="button" data-t="msg">${I('whatsapp')} Mensagens</button></div>
<div data-p="exp"><div class="ag-row3"><div class="ag-f"><label>Abre às</label><input type="time" class="form-control" id="sOpen" step="300" value="${esc(c.open)}"></div><div class="ag-f"><label>Fecha às</label><input type="time" class="form-control" id="sClose" step="300" value="${esc(c.close)}"></div><div class="ag-f"><label>Intervalo da grade</label><select class="form-control" id="sStep">${[10, 15, 20, 30, 60].map(n => `<option value="${n}" ${n === c.step ? 'selected' : ''}>${n} minutos</option>`).join('')}</select></div></div>
<div class="ag-f" style="margin-top:10px"><label>Dias de funcionamento</label><div class="ag-days" id="sDays">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="${c.days.includes(d) ? 'on' : ''}"><input type="checkbox" value="${d}" ${c.days.includes(d) ? 'checked' : ''}>${A.WD3[d]}</label>`).join('')}</div></div>
<label style="display:flex;align-items:center;gap:8px;font-size:13px;margin-top:12px;cursor:pointer"><input type="checkbox" id="sOn" ${c.enabled ? 'checked' : ''}> Mostrar a Agenda no menu de todos</label>
<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0">O horário de cada profissional fica na aba Equipe. O expediente é o padrão para quem não tem horário próprio.</p></div>
<div data-p="team" style="display:none"><div class="ag-team">${users.map((u, i) => `<div class="ag-tm ${u.agenda ? 'on' : ''}" data-u="${esc(u.id)}"><div class="ag-tm-h"><span class="av" style="width:30px;height:30px;border-radius:50%;display:grid;place-items:center;color:#fff;font-weight:800;font-size:12px;background:${esc(A.colorOf(u, i))}">${esc(initials(u.name))}</span><b>${esc(u.name || u.email || 'Usuário')}</b><small>${esc({ admin: 'Administrador', manager: 'Gerente', seller: 'Vendedor', cashier: 'Caixa', technician: 'Técnico' }[u.role] || '')}</small><label class="sw"><input type="checkbox" data-on ${u.agenda ? 'checked' : ''}> Atende</label></div>
<div class="ag-tm-b"><div class="dpa-colors">${A.COLORS.map(col => `<button type="button" data-c="${col}" style="background:${col}" class="${(u.agendaColor || A.colorOf(u, i)) === col ? 'on' : ''}"></button>`).join('')}</div><div class="dpa-hours">${hoursHtml(u.agendaHours || defH())}</div></div></div>`).join('')}</div>
<p style="font-size:12px;color:var(--text-muted);margin:8px 0 0">Falta alguém? Cadastre em <a href="usuarios.html" style="color:var(--accent);font-weight:700">Usuários</a> (perfil Vendedor ou Técnico já serve) e volte aqui.</p></div>
<div data-p="msg" style="display:none"><div class="ag-vars">Use: <code>{nome}</code> <code>{dia}</code> <code>{hora}</code> <code>{profissional}</code> <code>{servicos}</code> <code>{empresa}</code> <code>{item}</code> (pet ou veículo)</div>
<div class="ag-f"><label>Confirmação ao marcar</label><textarea class="form-control" id="sMsgC" rows="3">${esc(c.msgConfirm)}</textarea></div>
<div class="ag-f"><label>Lembrete da véspera</label><textarea class="form-control" id="sMsgR" rows="3">${esc(c.msgRemind)}</textarea></div>
<div class="ag-f"><label>Pronto para retirar (pet, carro)</label><textarea class="form-control" id="sMsgP" rows="2">${esc(c.msgReady)}</textarea></div>
<button type="button" class="btn btn-outline btn-sm" id="sMsgDef" style="justify-self:start">${I('rotate-ccw')} Voltar às mensagens padrão</button></div>
</div><div class="ag-mf"><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary" id="sSave">${I('check')} Salvar ajustes</button></div>`, 'lg');
        const q = s => ov.querySelector(s);
        const show = t => { ov.querySelectorAll('#sTabs [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === t)); ov.querySelectorAll('[data-p]').forEach(p => p.style.display = p.dataset.p === t ? '' : 'none'); };
        q('#sTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t); };
        q('#sDays').onchange = e => { const l = e.target.closest('label'); if (l) l.classList.toggle('on', e.target.checked); };
        q('#sMsgDef').onclick = () => { q('#sMsgC').value = A.MSG.confirm; q('#sMsgR').value = A.MSG.remind; q('#sMsgP').value = A.MSG.ready; };
        ov.querySelectorAll('.ag-tm').forEach(tm => {
            tm.querySelector('[data-on]').onchange = e => tm.classList.toggle('on', e.target.checked);
            tm.querySelector('.dpa-colors').onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; tm.querySelectorAll('[data-c]').forEach(x => x.classList.toggle('on', x === b)); };
            tm.querySelector('.dpa-hours').onchange = e => { const l = e.target.closest('label[data-wd]'); if (l && e.target.type === 'checkbox') l.classList.toggle('off', !e.target.checked); };
        });
        q('#sSave').onclick = async () => {
            const days = [...q('#sDays').querySelectorAll('input:checked')].map(i => Number(i.value));
            const open = q('#sOpen').value || c.open, close = q('#sClose').value || c.close;
            if (toMin(close) <= toMin(open)) { toast('warning', 'O horário de fechar precisa ser depois do de abrir.'); show('exp'); return; }
            const btn = q('#sSave'); btn.disabled = true;
            try {
                await A.saveSettings({ agendaEnabled: q('#sOn').checked, agenda: { open, close, step: Number(q('#sStep').value) || 15, days: days.length ? days : c.days, msgConfirm: q('#sMsgC').value.trim() || A.MSG.confirm, msgRemind: q('#sMsgR').value.trim() || A.MSG.remind, msgReady: q('#sMsgP').value.trim() || A.MSG.ready } });
                let order = 0;
                for (const tm of ov.querySelectorAll('.ag-tm')) {
                    const u = S.users.find(x => x.id === tm.dataset.u); if (!u) continue;
                    const on = tm.querySelector('[data-on]').checked, color = (tm.querySelector('[data-c].on') || {}).dataset?.c || u.agendaColor || '';
                    const h = {}; tm.querySelectorAll('label[data-wd]').forEach(l => { const [cb, a, b] = l.querySelectorAll('input'); h[l.dataset.wd] = cb.checked && a.value && b.value ? [a.value, b.value] : []; });
                    if (on) order++;
                    const changed = on !== (u.agenda === true) || (on && (color !== u.agendaColor || JSON.stringify(h) !== JSON.stringify(u.agendaHours || null) || Number(u.agendaOrder) !== order));
                    if (changed) await db.collection('users').doc(u.id).set(on ? { agenda: true, agendaColor: color, agendaHours: h, agendaOrder: order, updatedAt: ts() } : { agenda: false, updatedAt: ts() }, { merge: true });
                }
                closeModal(); await loadPros(true); render(); toast('success', 'Ajustes da agenda salvos.');
            } catch (e) { btn.disabled = false; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
        show(tab || 'exp');
    }

    /* ===================== INÍCIO ===================== */
    async function demoSample() {
        if (!db.__isLocalDemo) return false;
        if (!window.DPAgendaDemo) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/js/agenda-demo-v1.js?v=' + A.VER; s.onload = r; s.onerror = r; document.head.appendChild(s); });
        if (!window.DPAgendaDemo || typeof window.DPAgendaDemo.sample !== 'function') return false;
        try { return await window.DPAgendaDemo.sample(); } catch (e) { console.warn('Agenda demo', e); return false; }
    }
    async function boot() {
        if (S.booted) return; S.booted = true;
        await A.loadCfg(true);
        shell();
        await loadPros(true);
        if (!S.allPros.length && await demoSample()) await loadPros(true);
        subscribe();
        await refresh();
        if (qs.get('novo')) openForm(null, { customerId: qs.get('cliente') || '', itemId: qs.get('item') || '', itemName: qs.get('itemNome') || '' });
        else if (S.hl) { const x = byId(S.hl); if (x) openDetail(x); }
        setInterval(() => { if (document.visibilityState === 'visible' && !$('agModal')) render(); }, 60000);
        document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') refresh(); });
    }
    window.initPage = boot;
    document.addEventListener('dp:agenda-render', () => { try { if (S.shell) render(); } catch (e) { } });
    document.addEventListener('dp:agenda-refresh', () => { if (S.shell) refresh(); });
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 500); }); } catch (e) { }
})();
