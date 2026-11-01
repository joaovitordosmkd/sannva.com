/* DistribuiPro 37.9 · Agenda de serviços — o que entra em todas as telas (carregado pelo os-pro-v1.js).
   - Menu: item "Agenda" logo depois do PDV quando a agenda está ligada (Configurações › Empresa, ou ramo de
     serviços/beleza/pet/oficina, ou demo de barbearia e pet shop). Vendedor e técnico veem só a própria coluna.
   - Configurações › Empresa: chave "Agenda de serviços".
   - Produtos: "Duração do serviço (min)" (products.durationMin, padrão 30) e "Comissão própria (%)"
     (products.commissionPercent, vence a regra do usuário).
   - Usuários: "Atende na agenda", cor da coluna e horário de cada dia (users.agenda, agendaColor, agendaHours).
   - Clientes: aba "Agenda" na ficha (próximos horários e faltas).
   - PDV: profissional em cada item (comissão por item) e, ao finalizar uma venda que veio da agenda, o horário
     fica "Concluído" com o número da venda.
   - Início: faixa "Agenda de hoje".
   Coleção appointments {date:'AAAA-MM-DD', start:'HH:MM', end, durationMin, professionalId, professionalName,
   customerId, customerName, customerPhone, itemId, itemName, items:[{productId, name, price, durationMin,
   professionalId, professionalName}], total, status, walkIn, arrivedAt, startedAt, remindedAt, checkin, saleId,
   notes, createdBy, createdAt}. Igual nas 5 versões. */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.DPAgenda) return;
    window.DPAgendaCore = true;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const VER = (/[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || '') || [])[1] || '1';
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const I = (n, cls) => (window.dpIcon ? window.dpIcon(n, cls) : '');
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();

    /* ===================== CONFIGURAÇÃO ===================== */
    const MSG = {
        confirm: 'Olá, {nome}! Seu horário na {empresa} ficou para {dia} às {hora} com {profissional} ({servicos}). Podemos confirmar?',
        remind: 'Oi, {nome}! Passando para lembrar: amanhã, {dia}, às {hora}, você tem {servicos} com {profissional} na {empresa}. Confirma? Se precisar remarcar, é só responder aqui.',
        ready: 'Oi, {nome}! {item} já está pronto para retirar aqui na {empresa}. Obrigado pela preferência!'
    };
    const DEF = { open: '08:00', close: '20:00', step: 15, days: [1, 2, 3, 4, 5, 6], msgConfirm: MSG.confirm, msgRemind: MSG.remind, msgReady: MSG.ready };
    const SEG_ON = ['servicos', 'beleza', 'barbearia', 'salao', 'estetica', 'petshop', 'pet', 'oficina', 'lavajato', 'lava-jato', 'autocenter'];
    function demoSeg() { try { const raw = sessionStorage.getItem('dp_demo_segment_v1') || localStorage.getItem('dp_demo_segment_v1'); const s = raw ? JSON.parse(raw) : null; return s && typeof s === 'object' ? s : null; } catch (e) { return null; } }
    function demoOn(g) {
        if (!db.__isLocalDemo) return false;
        const ds = (g && g.demoDataset) || (demoSeg() || {}).dataset || '', k = (demoSeg() || {}).key || '';
        return ['barbershop', 'petshop', 'auto_service'].includes(ds) || ['barbearia', 'petshop', 'oficina'].includes(k);
    }
    const cacheKey = () => 'dp_agenda_cfg_v1' + (db.__isLocalDemo ? ':' + ((demoSeg() || {}).key || 'general') : '');
    let settings = null;
    let cfg = (() => { try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch (e) { return null; } })() || { ...DEF, enabled: demoOn(null) };
    function build(g) {
        const a = (g && typeof g.agenda === 'object' && g.agenda) || {};
        const on = g.agendaEnabled === true || (g.agendaEnabled !== false && (SEG_ON.includes(String(g.segment || '')) || demoOn(g)));
        const step = [5, 10, 15, 20, 30, 60].includes(Number(a.step)) ? Number(a.step) : DEF.step;
        return {
            enabled: on, open: /^\d\d:\d\d$/.test(a.open || '') ? a.open : DEF.open, close: /^\d\d:\d\d$/.test(a.close || '') ? a.close : DEF.close, step,
            days: Array.isArray(a.days) && a.days.length ? a.days.map(Number) : DEF.days.slice(),
            msgConfirm: a.msgConfirm || DEF.msgConfirm, msgRemind: a.msgRemind || DEF.msgRemind, msgReady: a.msgReady || DEF.msgReady
        };
    }
    let cfgP = null;
    function loadCfg(force) {
        if (cfgP && !force) return cfgP;
        cfgP = db.collection('settings').doc(DOC).get().then(d => {
            settings = d.exists ? (d.data() || {}) : {};
            cfg = build(settings);
            try { localStorage.setItem(cacheKey(), JSON.stringify(cfg)); } catch (e) { }
            return cfg;
        }).catch(() => cfg);
        return cfgP;
    }
    async function saveSettings(patch) {
        await db.collection('settings').doc(DOC).set(patch, { merge: true });
        await loadCfg(true); syncMenu();
        return cfg;
    }

    /* ===================== QUEM ESTÁ USANDO ===================== */
    function me() { try { if (typeof currentUser !== 'undefined' && currentUser) return currentUser; } catch (e) { } return null; }
    function role() { const u = me(); if (u && u.role) return u.role; try { return localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } }
    function myId() { const u = me(); if (u && (u.uid || u.id)) return String(u.uid || u.id); try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } }
    function myName() { const u = me(); try { return (u && u.name) || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador'; } catch (e) { return 'Operador'; } }
    const isBoss = () => ['admin', 'manager', ''].includes(role());
    const seesAll = () => ['admin', 'manager', 'cashier', ''].includes(role());
    const ROLES = ['admin', 'manager', 'seller', 'cashier', 'technician'];

    /* ===================== AJUDANTES ===================== */
    const pad = n => String(n).padStart(2, '0');
    const dateKey = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseKey = k => { const [y, m, d] = String(k || '').split('-').map(Number); return new Date(y || 1970, (m || 1) - 1, d || 1, 12); };
    const toMin = t => { const m = /^(\d{1,2}):(\d{2})/.exec(String(t || '')); return m ? Number(m[1]) * 60 + Number(m[2]) : 0; };
    const fromMin = m => `${pad(Math.floor(Math.max(0, m) / 60) % 24)}:${pad(Math.max(0, m) % 60)}`;
    const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
    const WD3 = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    const dayLabel = k => { const d = parseKey(k), t = dateKey(new Date()), tm = dateKey(new Date(Date.now() + 864e5)); const base = `${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; return k === t ? 'hoje (' + base + ')' : k === tm ? 'amanhã (' + base + ')' : base; };
    const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
    const waPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) return d; if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };
    const toMs = v => { if (!v) return 0; try { if (typeof v === 'number') return v; if (v.toDate) return v.toDate().getTime(); if (v.__ts) return Number(v.__ts); if (v.seconds) return v.seconds * 1000; if (v.value) return Date.parse(v.value) || 0; const n = Date.parse(v); return isNaN(n) ? 0 : n; } catch (e) { return 0; } };
    // Serviço = tipo Serviço, sem controle de estoque, unidade "serv" ou categoria "Serviços" (igual ao PDV)
    const isService = p => !!p && (p.productType === 'service' || p.controlStock === false || norm(p.unit) === 'serv' || /^servi[cç]os?\b/i.test(String(p.category || '').trim()));
    const duration = p => { const n = Math.round(Number(p && p.durationMin)); return n > 0 ? n : 30; };
    const COLORS = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#ef4444', '#14b8a6', '#84cc16', '#f97316'];
    const colorOf = (u, i) => (u && /^#[0-9a-f]{6}$/i.test(u.agendaColor || '') ? u.agendaColor : COLORS[(Number(i) || 0) % COLORS.length]);
    const STATUS = {
        agendado: ['Agendado', '#6366f1', 'calendar'], confirmado: ['Confirmado', '#0ea5e9', 'calendar-check'], chegou: ['Chegou', '#f59e0b', 'user-check'],
        atendendo: ['Atendendo', '#8b5cf6', 'scissors'], pronto: ['Pronto', '#14b8a6', 'bell'], concluido: ['Concluído', '#10b981', 'circle-check'],
        faltou: ['Faltou', '#ef4444', 'user-x'], cancelado: ['Cancelado', '#94a3b8', 'calendar-x'], bloqueio: ['Bloqueado', '#64748b', 'lock']
    };
    const OPEN_ST = ['agendado', 'confirmado', 'chegou', 'atendendo', 'pronto'];

    let coName = null;
    async function company() {
        if (coName) return coName;
        let g = settings; if (!g) { await loadCfg(); g = settings || {}; }
        const b = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {};
        coName = (db.__isLocalDemo ? b.companyName : '') || g.nomeFantasia || b.companyName || g.razaoSocial || 'nossa loja';
        return coName;
    }
    // Mensagem pronta: {nome} {dia} {hora} {profissional} {servicos} {empresa} {item}
    async function fill(tpl, ap) {
        const emp = await company();
        const serv = (ap.items || []).map(i => i.name).filter(Boolean).join(' + ') || 'seu atendimento';
        const d = parseKey(ap.date), dia = `${WD[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
        const map = { nome: firstName(ap.customerName) || 'tudo bem', dia, hora: ap.start || '', profissional: firstName(ap.professionalName) || 'nossa equipe', servicos: serv, empresa: emp, item: ap.itemName || serv, pet: ap.itemName || '' };
        return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m)).replace(/\s+([,.!?])/g, '$1').trim();
    }
    async function openWa(phone, text) {
        const n = waPhone(phone);
        const url = n ? `https://wa.me/${n}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
        window.open(url, '_blank', 'noopener');
        return !!n;
    }

    let usersP = null;
    function allUsers(force) {
        if (usersP && !force) return usersP;
        usersP = db.collection('users').get().then(s => s.docs.map(d => ({ id: d.id, uid: d.id, ...d.data() })).filter(u => !u.deleted && (u.status || 'active') === 'active')).catch(() => []);
        return usersP;
    }
    async function professionals(force) {
        const list = (await allUsers(force)).filter(u => u.agenda === true);
        list.sort((a, b) => (Number(a.agendaOrder) || 0) - (Number(b.agendaOrder) || 0) || String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        return list.map((u, i) => ({ ...u, color: colorOf(u, i) }));
    }
    // Horário de trabalho do profissional no dia (null = folga)
    function hoursOf(u, key) {
        const wd = parseKey(key).getDay();
        const h = u && u.agendaHours && typeof u.agendaHours === 'object' ? u.agendaHours : null;
        if (h) { const d = h[wd] || h[String(wd)]; return Array.isArray(d) && d.length >= 2 && d[0] && d[1] ? [d[0], d[1]] : null; }
        return cfg.days.includes(wd) ? [cfg.open, cfg.close] : null;
    }

    /* ===================== PONTE AGENDA → PDV ===================== */
    const QKEY = 'dp_quote_to_pdv';
    function payloadOf(ap) {
        const items = (ap.items || []).map(i => ({ productId: i.productId || '', productName: i.name || 'Serviço', quantity: 1, unitPrice: r2(i.price), total: r2(i.price), unit: 'serv', sellerId: i.professionalId || ap.professionalId || '', sellerName: i.professionalName || ap.professionalName || '' }));
        const who = [ap.customerName || 'Cliente', ap.itemName].filter(Boolean).join(' · ');
        return {
            appointmentId: ap.id, customerId: ap.customerId || null, customerName: ap.customerName || '', customerPhone: ap.customerPhone || '',
            items, discount: 0, deliveryFee: 0, sellerId: ap.professionalId || '', sellerName: ap.professionalName || '',
            bannerIcon: 'fa-calendar-check', bannerText: `Atendimento da agenda: ${who}${ap.start ? ' · ' + ap.start : ''}${ap.professionalName ? ' com ' + firstName(ap.professionalName) : ''}. Some produtos se quiser, escolha o pagamento e finalize.`,
            toastText: 'Atendimento da agenda no caixa'
        };
    }
    function toPdv(ap) {
        try { sessionStorage.setItem(QKEY, JSON.stringify(payloadOf(ap))); } catch (e) { toast('error', 'Não foi possível levar para o caixa: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        location.href = 'pdv.html?agenda=' + encodeURIComponent(ap.id);
    }
    async function markSold(apId, sale) {
        if (!apId || !sale) return;
        await db.collection('appointments').doc(apId).set({ status: 'concluido', saleId: sale.id || '', saleNumber: sale.saleNumber || null, concludedAt: ts(), updatedAt: ts() }, { merge: true });
    }

    /* ===================== MENU ===================== */
    function syncMenu() {
        const menu = document.querySelector('.sidebar-menu'); if (!menu) return;
        let a = menu.querySelector('a.menu-item[href="agenda.html"]');
        const r = role(), show = cfg.enabled && (!r || ROLES.includes(r));
        if (!show) { if (a && !a.dataset.static) a.remove(); return; }
        if (!a) {
            a = document.createElement('a'); a.href = 'agenda.html'; a.className = 'menu-item'; a.dataset.page = 'agenda';
            a.innerHTML = '<i class="fas fa-calendar-days"></i><span class="menu-text">Agenda</span>';
            const anchor = menu.querySelector('a.menu-item[href="pdv.html"]');
            if (anchor) anchor.insertAdjacentElement('afterend', a); else menu.appendChild(a);
        }
        if (PAGE === 'agenda') { menu.querySelectorAll('.menu-item.active').forEach(x => { if (x !== a) x.classList.remove('active'); }); a.classList.add('active'); }
    }

    /* ===================== ESTILO ===================== */
    function css() {
        if ($('dpaCoreCss')) return;
        const st = document.createElement('style'); st.id = 'dpaCoreCss';
        st.textContent = `
.dpa-pro-chip{display:inline-flex;align-items:center;gap:5px;margin-top:4px;max-width:100%;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:999px;padding:2px 9px 2px 6px;font:600 10.5px/1.6 inherit;font-family:inherit;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpa-pro-chip svg.dpi{width:12px;height:12px;flex:none}.dpa-pro-chip .dot{width:8px;height:8px;border-radius:50%;flex:none}
.dpa-pro-chip.on{border-color:color-mix(in srgb,var(--pc,#6366f1) 45%,transparent);background:color-mix(in srgb,var(--pc,#6366f1) 12%,transparent);color:var(--text-primary)}
.dpa-pop{position:fixed;z-index:10050;min-width:220px;max-width:280px;max-height:320px;overflow:auto;background:var(--bg-card);border:1px solid var(--border-color);border-radius:12px;box-shadow:var(--shadow-xl,0 18px 40px rgba(0,0,0,.3));padding:6px}
.dpa-pop h5{margin:4px 8px 6px;font-size:11px;letter-spacing:.4px;text-transform:uppercase;color:var(--text-muted)}
.dpa-pop button{display:flex;align-items:center;gap:8px;width:100%;border:0;background:transparent;color:var(--text-primary);padding:8px 9px;border-radius:8px;font:600 13px inherit;font-family:inherit;text-align:left;cursor:pointer}
.dpa-pop button:hover,.dpa-pop button.on{background:var(--bg-secondary)}.dpa-pop .dot{width:10px;height:10px;border-radius:50%;flex:none}.dpa-pop small{margin-left:auto;color:var(--text-muted);font-weight:500;font-size:11px}
.dpa-fields{display:grid;grid-template-columns:1fr 1fr;gap:10px;grid-column:1/-1}
.dpa-fields .dpf-note{font-size:10.5px;color:var(--text-muted);margin-top:4px}
.dpa-user{grid-column:1/-1;background:var(--bg-secondary);border-radius:10px;padding:12px 14px}
.dpa-user-h{display:flex;align-items:center;gap:10px;font-size:13px;font-weight:700;color:var(--text-heading);cursor:pointer}
.dpa-user-h svg.dpi{color:var(--accent);width:16px;height:16px}.dpa-user-h input{width:16px;height:16px;accent-color:var(--accent);margin-left:auto}
.dpa-user-b{margin-top:10px;display:none}.dpa-user.on .dpa-user-b{display:block}
.dpa-colors{display:flex;flex-wrap:wrap;gap:6px;margin:4px 0 10px}.dpa-colors button{width:24px;height:24px;border-radius:50%;border:2px solid transparent;cursor:pointer;padding:0}
.dpa-colors button.on{border-color:var(--text-heading);box-shadow:0 0 0 2px var(--bg-card) inset}
.dpa-hours{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:6px}
.dpa-hours label{display:flex;align-items:center;gap:6px;background:var(--bg-card);border:1px solid var(--border-color);border-radius:8px;padding:5px 7px;font-size:12px}
.dpa-hours label b{width:30px;font-size:11.5px}.dpa-hours input[type=time]{width:66px;padding:2px 3px;font-size:11.5px;border:1px solid var(--border-color);border-radius:6px;background:var(--bg-input,var(--bg-secondary));color:var(--text-primary)}
.dpa-hours label.off input[type=time]{opacity:.35;pointer-events:none}
.dpa-today{display:flex;align-items:center;gap:14px;flex-wrap:wrap;padding:12px 16px!important;margin-bottom:16px}
.dpa-today .ico{width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent,#6366f1) 12%,transparent);color:var(--accent)}
.dpa-today .ico svg{width:20px;height:20px}.dpa-today .tx{flex:1;min-width:200px}.dpa-today .tx b{display:block;font-size:14px;color:var(--text-heading)}
.dpa-today .tx small{font-size:12px;color:var(--text-muted)}.dpa-today .nx{display:flex;gap:8px;flex-wrap:wrap}
.dpa-today .nx span{font-size:12px;background:var(--bg-secondary);border-radius:8px;padding:5px 9px;color:var(--text-secondary)}.dpa-today .nx span b{color:var(--text-heading)}
.dpa-ctab .cli-row-ic svg{width:16px;height:16px}.dpa-st{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:3px 8px;border-radius:999px;background:color-mix(in srgb,var(--c) 14%,transparent);color:var(--c)}
.dpa-st svg.dpi{width:12px;height:12px}`;
        document.head.appendChild(st);
    }

    /* ===================== CONFIGURAÇÕES › EMPRESA ===================== */
    function setupConfig() {
        const host = $('tabEmpresa'); if (!host || $('dpaCfgCard')) return;
        const card = document.createElement('div'); card.className = 'card osp-cfg'; card.id = 'dpaCfgCard';
        card.innerHTML = `<div class="osp-cfg-h"><div class="ico">${I('calendar-days')}</div><div><h3>Agenda de serviços</h3>
<p>Para barbearia, salão, estética, pet shop (banho e tosa), lava-jato, oficina e quem trabalha com hora marcada. Liga no menu a <b>Agenda</b>: uma coluna por profissional, encaixe e fila de quem chegou, lembrete pelo WhatsApp e "Fechar no caixa" com a comissão de cada profissional.</p>
<p style="margin-top:6px"><a href="agenda.html" class="dpa-cfg-link" style="font-weight:700;color:var(--accent)">Abrir a agenda</a> <span style="color:var(--text-muted)">· o expediente, a equipe e as mensagens ficam no botão "Ajustes" da própria agenda.</span></p></div>
<label class="osp-sw" title="Ligar ou desligar"><input type="checkbox" id="dpaCfgOn"><span></span></label></div>`;
        const after = $('ospCfgCard') || $('mesCfgCard');
        if (after) after.insertAdjacentElement('afterend', card); else host.insertBefore(card, host.firstChild);
        const on = $('dpaCfgOn'); on.checked = !!cfg.enabled; loadCfg(true).then(() => { on.checked = !!cfg.enabled; });
        on.addEventListener('change', async () => {
            try { await saveSettings({ agendaEnabled: on.checked }); toast('success', on.checked ? 'Agenda ligada: ela já está no menu, logo abaixo do PDV.' : 'Agenda desligada.'); }
            catch (e) { on.checked = !on.checked; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
    }

    /* ===================== PRODUTOS: duração e comissão própria ===================== */
    const pctOk = v => v !== undefined && v !== null && v !== '' && isFinite(Number(v)) && Number(v) >= 0;
    function setupProducts(tries) {
        if (!$('productModal') || !$('prodUnit')) return;
        const typeGroup = $('dpfTypeGroup');
        if (!typeGroup) { if ((tries || 0) < 30) setTimeout(() => setupProducts((tries || 0) + 1), 200); return; }
        if ($('dpaProdFields')) return;
        const g = document.createElement('div'); g.className = 'dpa-fields form-group'; g.id = 'dpaProdFields';
        g.innerHTML = `<div id="dpaDurBox"><label class="form-label">Duração do serviço (min)</label><input type="number" id="dpaDur" class="form-control" min="5" step="5" placeholder="30"><div class="dpf-note">Usada na Agenda para reservar o horário.</div></div>
<div><label class="form-label">Comissão própria (%)</label><input type="number" id="dpaPct" class="form-control" min="0" max="100" step="0.5" placeholder="Usar a do usuário"><div class="dpf-note">Opcional. Ex.: química 40%. Vence a comissão do cadastro do usuário.</div></div>`;
        typeGroup.insertAdjacentElement('afterend', g);
        const typeNow = () => { const l = document.querySelector('#dpfType label.on'); return l ? l.dataset.v : 'product'; };
        const paintType = () => { const box = $('dpaDurBox'); if (box) box.style.display = typeNow() === 'service' ? '' : 'none'; };
        const tg = $('dpfType'); if (tg && window.MutationObserver) new MutationObserver(paintType).observe(tg, { attributes: true, subtree: true, attributeFilter: ['class'] });
        paintType();
        const origOpen = window.openProductModal;
        if (typeof origOpen === 'function' && !origOpen.__dpa) {
            const w = function (productId) {
                const r = origOpen.apply(this, arguments);
                try {
                    let p = null; try { p = productId ? (allProducts || []).find(x => x.id === productId) : null; } catch (e) { }
                    $('dpaDur').value = p && Number(p.durationMin) > 0 ? Number(p.durationMin) : '';
                    $('dpaPct').value = p && pctOk(p.commissionPercent) ? Number(p.commissionPercent) : '';
                    paintType();
                } catch (e) { }
                return r;
            };
            w.__dpa = true; window.openProductModal = w;
        }
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpAgenda) {
            svc.__dpAgenda = true;
            const wrap = name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && $('productModal')?.classList.contains('active') && $('dpaPct')) {
                        const dur = Math.round(Number($('dpaDur').value));
                        if (typeNow() === 'service') data.durationMin = dur > 0 ? dur : 30;
                        const pct = String($('dpaPct').value || '').replace(',', '.').trim();
                        data.commissionPercent = pct !== '' && pctOk(pct) ? Math.min(100, Number(pct)) : null;
                    }
                    return orig.apply(this, arguments);
                };
            };
            wrap('create'); wrap('update');
        }
    }

    /* ===================== USUÁRIOS: atende na agenda ===================== */
    function setupUsers() {
        const modal = $('modalUsuario'), anchor = $('uCommissionServiceType');
        if (!modal || !anchor || $('dpaUserBox')) return;
        const block = anchor.closest('div[style*="grid-column:1/-1"]') || anchor.closest('.form-group');
        if (!block) return;
        const box = document.createElement('div'); box.className = 'dpa-user'; box.id = 'dpaUserBox';
        box.innerHTML = `<label class="dpa-user-h">${I('calendar-days')}<span>Atende na agenda<small style="display:block;font-weight:500;font-size:11px;color:var(--text-muted)">Aparece como coluna na Agenda (barbeiro, cabeleireira, tosador, lavador, mecânico...)</small></span><input type="checkbox" id="dpaUserOn"></label>
<div class="dpa-user-b"><div style="font-size:12px;font-weight:600;color:var(--text-secondary)">Cor na agenda</div><div class="dpa-colors" id="dpaUserColors">${COLORS.map(c => `<button type="button" data-c="${c}" style="background:${c}" title="${c}"></button>`).join('')}</div>
<div style="font-size:12px;font-weight:600;color:var(--text-secondary);margin-bottom:6px">Dias e horário de trabalho</div><div class="dpa-hours" id="dpaUserHours"></div>
<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Desmarque o dia de folga. O almoço ou uma saída você bloqueia direto na Agenda.</div></div>`;
        block.insertAdjacentElement('afterend', box);
        let color = COLORS[0];
        const paintColors = () => box.querySelectorAll('[data-c]').forEach(b => b.classList.toggle('on', b.dataset.c === color));
        box.querySelector('#dpaUserColors').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; color = b.dataset.c; paintColors(); });
        const on = box.querySelector('#dpaUserOn');
        on.addEventListener('change', () => box.classList.toggle('on', on.checked));
        const hoursHost = box.querySelector('#dpaUserHours');
        function paintHours(h) {
            hoursHost.innerHTML = [1, 2, 3, 4, 5, 6, 0].map(wd => { const d = h && (h[wd] || h[String(wd)]); const act = Array.isArray(d) && d[0]; return `<label class="${act ? '' : 'off'}" data-wd="${wd}"><input type="checkbox" ${act ? 'checked' : ''}><b>${WD3[wd]}</b><input type="time" value="${esc(act ? d[0] : cfg.open)}" step="300"> <input type="time" value="${esc(act ? d[1] : cfg.close)}" step="300"></label>`; }).join('');
        }
        hoursHost.addEventListener('change', e => { const l = e.target.closest('label[data-wd]'); if (l && e.target.type === 'checkbox') l.classList.toggle('off', !e.target.checked); });
        const defHours = () => { const h = {}; for (let wd = 0; wd < 7; wd++) h[wd] = cfg.days.includes(wd) ? [cfg.open, cfg.close] : []; return h; };
        async function fillFor() {
            const editing = /editar/i.test(($('modalUsuarioTitle') || {}).textContent || '');
            const email = String(($('uEmail') || {}).value || '').trim().toLowerCase();
            let u = null;
            if (editing && email) u = (await allUsers(true)).find(x => String(x.email || '').trim().toLowerCase() === email) || null;
            const users = await allUsers();
            on.checked = !!(u && u.agenda === true); box.classList.toggle('on', on.checked);
            color = u && u.agendaColor ? u.agendaColor : COLORS[users.filter(x => x.agenda === true).length % COLORS.length];
            paintColors(); paintHours(u && u.agendaHours ? u.agendaHours : defHours());
        }
        let was = false;
        new MutationObserver(() => { const act = modal.classList.contains('active'); if (act && !was) setTimeout(fillFor, 30); was = act; }).observe(modal, { attributes: true, attributeFilter: ['class'] });
        paintHours(defHours()); paintColors();
        // Lido pelo saveUser (pages.js) na hora de salvar
        window.DPAgenda.userFields = () => {
            if (!$('dpaUserOn')) return {};
            const h = {};
            hoursHost.querySelectorAll('label[data-wd]').forEach(l => { const [c, a, b] = l.querySelectorAll('input'); h[l.dataset.wd] = c.checked && a.value && b.value ? [a.value, b.value] : []; });
            return { agenda: on.checked, agendaColor: color, agendaHours: h };
        };
    }

    /* ===================== CLIENTES: aba Agenda ===================== */
    function setupClientTab() {
        window.DPClientTabs = window.DPClientTabs || [];
        if (window.DPClientTabs.some(t => t.id === 'agenda')) return;
        window.DPClientTabs.push({
            id: 'agenda', icon: 'fa-calendar-days', label: 'Agenda',
            show: () => cfg.enabled,
            render: async (body, D) => {
                const c = D && D.c; if (!c) return;
                body.innerHTML = `<div class="cli-sec dpa-ctab"><div class="cli-blank">${I('loader-circle')} Carregando a agenda do cliente...</div></div>`;
                let list = [];
                try { list = (await db.collection('appointments').where('customerId', '==', c.id).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { }
                if (!document.querySelector('#cliTabs [data-tab="agenda"].on')) return;
                const today = dateKey(new Date()), nowMin = new Date().getHours() * 60 + new Date().getMinutes();
                list = list.filter(a => a.status !== 'bloqueio' && a.deleted !== true);
                const next = list.filter(a => OPEN_ST.includes(a.status) && (a.date > today || (a.date === today && toMin(a.end || a.start) >= nowMin - 60))).sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
                const past = list.filter(a => !next.includes(a)).sort((a, b) => (b.date + (b.start || '')).localeCompare(a.date + (a.start || ''))).slice(0, 30);
                const faltas = list.filter(a => a.status === 'faltou').length, feitos = list.filter(a => a.status === 'concluido').length;
                const can = !!document.querySelector('.sidebar-menu a.menu-item[href="agenda.html"]') || isBoss();
                const btn = can ? `<a class="btn btn-primary btn-sm" href="agenda.html?novo=1&cliente=${encodeURIComponent(c.id)}">${I('plus')} Agendar horário</a>` : '';
                const row = a => { const st = STATUS[a.status] || STATUS.agendado; return `<div class="cli-row ${['cancelado', 'faltou'].includes(a.status) ? 'dim' : ''}"><div class="cli-row-main"><span class="cli-row-ic" style="color:${st[1]}">${I(st[2])}</span><div class="cli-row-tx"><b>${esc(dayLabel(a.date))} · ${esc(a.start || '')}${a.walkIn ? ' · encaixe' : ''}</b><small>${esc((a.items || []).map(i => i.name).join(' + ') || 'Atendimento')}${a.professionalName ? ' · com ' + esc(a.professionalName) : ''}${a.itemName ? ' · ' + esc(a.itemName) : ''}</small></div></div><div class="cli-row-side"><span class="dpa-st" style="--c:${st[1]}">${esc(st[0])}</span><div class="cli-row-val"><b>${money(a.total)}</b>${a.saleNumber ? `<small>venda #V-${String(a.saleNumber).padStart(4, '0')}</small>` : ''}</div><a class="cli-act" href="agenda.html?data=${esc(a.date)}&ver=${encodeURIComponent(a.id)}" title="Abrir na agenda">${I('chevron-right')}</a></div></div>`; };
                body.innerHTML = `<div class="cli-sec dpa-ctab"><div class="cli-sec-h"><h3>${I('calendar-days')} Agenda do cliente</h3><span class="sp"></span>${btn}</div>
<div class="cli-sum"><span>Próximos: <b>${next.length}</b></span><span>Atendimentos concluídos: <b>${feitos}</b></span><span>Faltas: <b class="${faltas ? 'cli-bad' : ''}">${faltas}</b></span></div>
${faltas >= 2 ? `<div class="cli-alert" style="margin-bottom:10px">${I('triangle-alert')}<div><b>Cliente com ${faltas} faltas.</b> Vale confirmar pelo WhatsApp na véspera ou pedir um sinal.</div></div>` : ''}
<div style="font-size:12px;font-weight:700;color:var(--text-muted);margin:6px 0">PRÓXIMOS HORÁRIOS</div><div class="cli-rows">${next.map(row).join('') || `<div class="cli-blank">${I('calendar')} Nenhum horário marcado.${btn ? '<br>' + btn : ''}</div>`}</div>
${past.length ? `<div style="font-size:12px;font-weight:700;color:var(--text-muted);margin:14px 0 6px">HISTÓRICO</div><div class="cli-rows">${past.map(row).join('')}</div>` : ''}</div>`;
            }
        });
    }

    /* ===================== PDV: profissional por item ===================== */
    function setupPdv() {
        if (!$('btnFinalize') || typeof window.renderCart !== 'function' || window.__dpaPdv) return;
        window.__dpaPdv = true;
        const G = { get cart() { try { return cart; } catch (e) { return []; } }, get products() { try { return products; } catch (e) { return []; } } };
        let pros = [], people = [];
        allUsers().then(async list => {
            pros = await professionals();
            const others = list.filter(u => !u.agenda && ['seller', 'admin', 'manager', 'cashier', 'technician'].includes(String(u.role || '')));
            people = [...pros, ...others.map((u, i) => ({ ...u, color: colorOf(u, pros.length + i) }))];
            decorate();
        });
        const prodOf = id => (G.products || []).find(p => p.id === id);
        function decorate() {
            const rows = document.querySelectorAll('#cartItems .cart-item'), c = G.cart || [];
            if (!rows.length || rows.length !== c.length) return;
            const any = c.some(i => i.sellerId);
            if (!cfg.enabled && !any) return;
            rows.forEach((row, i) => {
                const it = c[i]; if (!it) return;
                const p = prodOf(it.productId), serv = it.isService || isService(p);
                const info = row.querySelector('.ci-info'); if (!info) return;
                info.querySelector('.dpa-pro-chip')?.remove();
                if (!serv && !it.sellerId) return;
                const u = people.find(x => x.id === it.sellerId);
                const b = document.createElement('button'); b.type = 'button'; b.className = 'dpa-pro-chip' + (it.sellerId ? ' on' : ''); b.dataset.i = i;
                if (u) b.style.setProperty('--pc', u.color);
                b.title = 'Quem fez este serviço (comissão do item)';
                b.innerHTML = it.sellerId ? `<span class="dot" style="background:${esc(u ? u.color : '#6366f1')}"></span><span>${esc(it.sellerName || (u && u.name) || 'Profissional')}</span>${I('chevron-down')}` : `${I('user')}<span>Profissional: vendedor da venda</span>${I('chevron-down')}`;
                b.addEventListener('click', e => { e.stopPropagation(); pick(i, b); });
                info.appendChild(b);
            });
        }
        function pick(i, btn) {
            document.getElementById('dpaPop')?.remove();
            const it = (G.cart || [])[i]; if (!it) return;
            const pop = document.createElement('div'); pop.id = 'dpaPop'; pop.className = 'dpa-pop';
            pop.innerHTML = `<h5>Quem fez: ${esc(it.productName)}</h5><button type="button" data-u="" class="${it.sellerId ? '' : 'on'}">${I('user')}<span>Vendedor da venda</span></button>` + people.map(u => `<button type="button" data-u="${esc(u.id)}" class="${it.sellerId === u.id ? 'on' : ''}"><span class="dot" style="background:${esc(u.color)}"></span><span>${esc(u.name || u.email || 'Usuário')}</span>${u.agenda ? '<small>agenda</small>' : ''}</button>`).join('');
            document.body.appendChild(pop);
            const r = btn.getBoundingClientRect();
            pop.style.left = Math.max(8, Math.min(window.innerWidth - pop.offsetWidth - 8, r.left)) + 'px';
            pop.style.top = (r.bottom + pop.offsetHeight + 8 > window.innerHeight ? Math.max(8, r.top - pop.offsetHeight - 6) : r.bottom + 6) + 'px';
            pop.addEventListener('click', e => {
                const b = e.target.closest('[data-u]'); if (!b) return;
                const u = people.find(x => x.id === b.dataset.u);
                if (u) { it.sellerId = u.id; it.sellerName = u.name || u.email || ''; } else { delete it.sellerId; delete it.sellerName; }
                pop.remove(); try { renderCart(); } catch (e2) { }
            });
            setTimeout(() => document.addEventListener('click', function off(e) { if (!pop.contains(e.target)) { pop.remove(); document.removeEventListener('click', off); } }), 0);
        }
        const origRender = window.renderCart;
        window.renderCart = function () { const r = origRender.apply(this, arguments); try { decorate(); } catch (e) { } return r; };
        // Na venda: profissional de cada item, % própria do produto e o horário da agenda que virou venda
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function') {
            const oc = SalesService.create;
            SalesService.create = async function (data) {
                let apId = '';
                try {
                    const c = G.cart || [];
                    (data && Array.isArray(data.items) ? data.items : []).forEach((it, i) => {
                        const ci = c[i]; if (!ci || ci.productName !== it.productName) return;
                        if (ci.sellerId) { it.sellerId = ci.sellerId; it.sellerName = ci.sellerName || ''; }
                        const p = prodOf(it.productId);
                        if (p && pctOk(p.commissionPercent)) it.commissionPercent = Number(p.commissionPercent);
                        if (!it.isService && (ci.isService || isService(p))) it.isService = true;
                    });
                    const q = JSON.parse(sessionStorage.getItem(QKEY) || 'null');
                    if (q && q.appointmentId) { apId = q.appointmentId; data.appointmentId = apId; }
                } catch (e) { }
                const r = await oc.apply(this, arguments);
                if (apId && r && r.id) { try { await markSold(apId, r); } catch (e) { console.warn('Agenda não marcada como concluída', e); } }
                return r;
            };
        }
        // pdv.html?agenda=<id> aberto em outra aba: busca o horário e carrega no carrinho
        (function byUrl(tries) {
            let id = ''; try { id = new URLSearchParams(location.search).get('agenda') || ''; } catch (e) { }
            if (!id) return;
            let q = null; try { q = JSON.parse(sessionStorage.getItem(QKEY) || 'null'); } catch (e) { }
            if (q) return;
            if ((!(G.products || []).length || typeof window.dpLoadQuotePayload !== 'function') && tries < 40) { setTimeout(() => byUrl(tries + 1), 250); return; }
            if (typeof window.dpLoadQuotePayload !== 'function') return;
            db.collection('appointments').doc(id).get().then(s => {
                if (!s.exists) return; const ap = { id: s.id, ...s.data() };
                if (ap.status === 'concluido' && ap.saleId) { toast('info', 'Este atendimento já foi cobrado (venda #V-' + String(ap.saleNumber || '').padStart(4, '0') + ').'); return; }
                window.dpLoadQuotePayload(payloadOf(ap));
            }).catch(() => { });
        })(0);
    }

    /* ===================== INÍCIO: agenda de hoje ===================== */
    async function setupDashboard() {
        if (PAGE !== 'index' || !cfg.enabled || $('dpaToday')) return;
        const host = document.querySelector('.page-content'); if (!host) return;
        // Demo de barbearia/pet shop: a agenda de exemplo já aparece no Início (o arquivo só existe na demo)
        if (db.__isLocalDemo && !(await professionals()).length) {
            try {
                if (!window.DPAgendaDemo) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/js/agenda-demo-v1.js?v=' + VER; s.onload = r; s.onerror = r; document.head.appendChild(s); });
                if (window.DPAgendaDemo && await window.DPAgendaDemo.sample()) { usersP = null; await loadCfg(true); syncMenu(); }
            } catch (e) { }
        }
        const today = dateKey(new Date());
        let list = [];
        try { list = (await db.collection('appointments').where('date', '==', today).get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (e) { return; }
        if ($('dpaToday')) return;
        list = list.filter(a => a.status !== 'bloqueio' && a.status !== 'cancelado' && a.deleted !== true);
        if (!seesAll()) { const mid = myId(); list = list.filter(a => a.professionalId === mid || (!a.professionalId && a.walkIn)); }
        const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
        const next = list.filter(a => ['agendado', 'confirmado'].includes(a.status) && toMin(a.start) >= nowMin - 10).sort((a, b) => toMin(a.start) - toMin(b.start)).slice(0, 3);
        const fila = list.filter(a => a.status === 'chegou').length, done = list.filter(a => a.status === 'concluido').length;
        const prev = r2(list.filter(a => a.status !== 'faltou').reduce((s, a) => s + Number(a.total || 0), 0));
        const card = document.createElement('div'); card.className = 'card dpa-today'; card.id = 'dpaToday';
        card.innerHTML = `<div class="ico">${I('calendar-days')}</div><div class="tx"><b>Agenda de hoje: ${list.length} ${list.length === 1 ? 'atendimento' : 'atendimentos'}</b><small>${done} concluído(s)${fila ? ' · ' + fila + ' esperando na fila' : ''}${isBoss() ? ' · previsto ' + money(prev) : ''}</small></div>
<div class="nx">${next.map(a => `<span><b>${esc(a.start)}</b> ${esc(firstName(a.customerName) || 'Cliente')}${a.professionalName ? ' · ' + esc(firstName(a.professionalName)) : ''}</span>`).join('') || '<span>Sem próximos horários hoje</span>'}</div>
<a class="btn btn-primary btn-sm" href="agenda.html">${I('calendar-days')} Abrir agenda</a>`;
        host.insertBefore(card, host.firstChild);
    }

    /* ===================== API ===================== */
    window.DPAgenda = {
        VER, DOC, DEF, MSG, STATUS, OPEN_ST, COLORS, WD, WD3,
        get cfg() { return cfg; }, get settings() { return settings; },
        loadCfg, saveSettings, syncMenu, role, myId, myName, isBoss, seesAll,
        dateKey, parseKey, toMin, fromMin, dayLabel, firstName, waPhone, toMs, isService, duration, colorOf, hoursOf,
        company, fill, openWa, allUsers, professionals, payloadOf, toPdv, markSold, esc, money, r2, ic: I, norm,
        userFields: () => ({})
    };

    function boot() {
        css(); syncMenu();
        try { setupConfig(); } catch (e) { console.warn('agenda cfg', e); }
        try { setupProducts(0); } catch (e) { console.warn('agenda produtos', e); }
        try { setupUsers(); } catch (e) { console.warn('agenda usuários', e); }
        try { setupPdv(); } catch (e) { console.warn('agenda pdv', e); }
        setTimeout(syncMenu, 1200);
    }
    try { setupClientTab(); } catch (e) { console.warn('agenda clientes', e); } // antes da ficha do cliente abrir (clientes.html carrega este arquivo antes do clientes-pro)
    ready(boot);
    // Comissão por item também nas telas que não carregam o arquivo direto (ex.: Mesas)
    (function () { if ((window.DPCommission && window.DPCommission.byItems) || document.querySelector('script[src*="comissao-itens-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/comissao-itens-v1.js?v=' + VER; document.head.appendChild(s); })();
    try { auth.onAuthStateChanged(u => { if (!u) return; loadCfg(true).then(() => { syncMenu(); ready(() => { try { setupConfig(); } catch (e) { } setupDashboard().catch(() => { }); }); }); }); } catch (e) { }
})();
