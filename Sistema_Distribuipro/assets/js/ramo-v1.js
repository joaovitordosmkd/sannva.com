/* DistribuiPro 38.1 · Ramo do negócio em todas as versões (carregado pelo os-pro-v1.js, que está em todas as páginas).
   - DPTerm(chave, os?): a palavra certa para o ramo. Com "OS para veículos" (oficina, auto center, lava-jato) a OS fala
     de veículo, placa e chassi em vez de aparelho, IMEI e série; na loja de roupas "Consignado" vira "Condicional";
     a observação do item no PDV dá o exemplo do ramo (IMEI no celular, "sem cebola" no restaurante...).
     Sem ramo nem chave ligada, devolve o texto de sempre.
   - Configurações › Empresa: chaves "Pet shop" (settings.petEnabled) e "OS para veículos" (settings.osVehicleMode),
     no mesmo padrão da "Agenda de serviços". Valem em todas as versões; no Mensal o ramo escolhido já liga sozinho.
   - Ordens de serviço com "OS para veículos": os campos da tela viram Veículo, Placa e Chassi.
   - Menu: "Consignado" aparece como "Condicional" na loja (rótulos por ramo em LABELS).
   Lê settings/general (demo: demo_general) e guarda uma cópia no navegador para a tela já abrir com o termo certo. */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.DPRamo) return;
    const DEMO = !!db.__isLocalDemo;
    const DOC = DEMO ? 'demo_general' : 'general';
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const $ = id => document.getElementById(id);
    const I = n => (window.dpIcon ? window.dpIcon(n) : '');
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const role = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } };
    const boss = () => ['', 'admin', 'manager'].includes(role());
    function demoKey() { try { const s = JSON.parse(sessionStorage.getItem('dp_demo_segment_v1') || localStorage.getItem('dp_demo_segment_v1') || 'null'); return (s && (s.key || s.dataset)) || 'general'; } catch (e) { return 'general'; } }
    const CACHE = 'dp_ramo_v1' + (DEMO ? ':' + demoKey() : '');

    /* ---------- Estado: ramo e chaves ---------- */
    let st = (() => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch (e) { return null; } })() || {};
    // Ramo: o salvo nas configurações; no Mensal/demo também o que o seletor de ramo já sabe.
    function segment() {
        if (st.segment) return st.segment;
        try { const c = window.DPMenuCfg && DPMenuCfg.cfg; if (c && c.segment) return c.segment; } catch (e) { }
        try { const m = JSON.parse(localStorage.getItem(DEMO ? 'dp_menu_cfg_demo_v1' : 'dp_menu_cfg_v1') || 'null'); if (m && m.segment && (!DEMO || m.demoKey === demoKey())) return m.segment; } catch (e) { }
        return '';
    }
    const vehicle = () => st.osVehicleMode === true || (st.osVehicleMode !== false && segment() === 'oficina');
    const pet = () => st.petEnabled === true || (st.petEnabled !== false && segment() === 'petshop');
    // Ramo usado para as palavras: o escolhido, ou o que as chaves dizem (núcleo sem seletor de ramo).
    const termSeg = () => segment() || (vehicle() ? 'oficina' : pet() ? 'petshop' : st.mesasEnabled === true ? 'restaurante' : ''); // 38.4 · Mesas ligadas = restaurante

    /* ---------- Palavras por ramo ---------- */
    const VEH_RE = /^(ve[ií]culo|carro|moto|motocicleta|caminh|utilit|picape|pick-?up|van\b|suv\b|autom[oó]vel|[oô]nibus|trator|quadriciclo)/i;
    // A OS é de veículo? (placa/veículo gravados, tipo "Carro", checklist de veículo; OS nova segue a chave da loja)
    function isVehicle(o) {
        if (!o) return vehicle();
        if (o.vehicleId || o.plate || o.itemTerm === 'veiculo') return true;
        const ck = o.checklistIn || o.checkIn || {};
        if (ck.model === 'veiculo' || /ve[ií]culo/i.test(ck.modelName || '')) return true;
        const t = String(o.deviceType || '').trim();
        return t ? VEH_RE.test(t) : vehicle();
    }
    // [veículo, padrão]
    const VEH = {
        'aparelho': ['veículo', 'aparelho'], 'Aparelho': ['Veículo', 'Aparelho'], 'o aparelho': ['o veículo', 'o aparelho'],
        'equipamento': ['veículo', 'equipamento'], 'Equipamento': ['Veículo', 'Equipamento'], 'Equipamento recebido': ['Veículo recebido', 'Equipamento recebido'],
        'Tipo de equipamento': ['Tipo de veículo', 'Tipo de equipamento'], 'Tipo de aparelho': ['Tipo de veículo', 'Tipo de aparelho'],
        'IMEI': ['Chassi', 'IMEI'], 'Série': ['Placa', 'Série'], 'Serial': ['Placa', 'Serial'], 'IMEI / Série': ['Placa / Chassi', 'IMEI / Série'], 'IMEI / Serial': ['Placa / Chassi', 'IMEI / Serial'],
        'reparo': ['serviço', 'reparo'], 'Reparo': ['Serviço', 'Reparo'], 'não liga': ['não dá partida', 'não liga'],
        'teste_ck': ['Confira o veículo na entrada e na saída. O cliente assina e você fica protegido contra "já veio assim".', 'Teste o aparelho na entrada e na saída. O cliente assina e você fica protegido contra "já veio assim".']
    };
    // Por ramo (padrão = como sempre foi, pensando em celular)
    const SEG = {
        'Consignado': { loja: 'Condicional' }, 'consignado': { loja: 'condicional' }, 'Consignados': { loja: 'Condicionais' },
        'obs_item_label': { _: 'Observação / IMEI / Serial deste item', restaurante: 'Observação para a cozinha', beleza: 'Observação deste serviço', petshop: 'Observação deste item', oficina: 'Observação / aplicação deste item', loja: 'Observação deste item', mercado: 'Observação deste item', distribuidora: 'Observação deste item', servicos: 'Observação deste item' },
        'obs_item_ph': { _: 'Ex.: IMEI 1..., IMEI 2..., Serial..., garantia...', restaurante: 'Ex.: sem cebola, bem passado, sem gelo', beleza: 'Ex.: tom da coloração, detalhe do corte', petshop: 'Ex.: nome do pet, sabor da ração, tamanho', oficina: 'Ex.: placa do carro, código da peça, aplicação', loja: 'Ex.: tamanho, cor, ajuste na barra', mercado: 'Ex.: validade, embalagem', distribuidora: 'Ex.: retornável, gelada, validade', servicos: 'Ex.: detalhe do serviço, garantia' },
        'obs_item_print': { _: 'IMEI/Serial/Obs.', restaurante: 'Obs.', beleza: 'Obs.', petshop: 'Obs.', oficina: 'Obs.', loja: 'Obs.', mercado: 'Obs.', distribuidora: 'Obs.', servicos: 'Obs.' }
    };
    function DPTerm(k, o) {
        if (VEH[k]) return isVehicle(o) ? VEH[k][0] : VEH[k][1];
        const m = SEG[k]; if (!m) return k;
        const s = termSeg();
        return (s && m[s] !== undefined) ? m[s] : (m._ !== undefined ? m._ : k);
    }
    DPTerm.isVehicle = isVehicle;
    DPTerm.segment = termSeg;
    window.DPTerm = DPTerm;

    /* ---------- Rótulos do menu por ramo ---------- */
    const LABELS = { consignado: 'Consignado' }; // página → chave de DPTerm
    function labels() {
        const menu = document.querySelector('.sidebar-menu'); if (!menu) return;
        Object.entries(LABELS).forEach(([p, k]) => {
            const t = DPTerm(k); if (t === k && !menu.querySelector(`a.menu-item[href="${p}.html"][data-dpr-orig]`)) return;
            menu.querySelectorAll(`a.menu-item[href="${p}.html"] .menu-text, .st-tabbar a[href="${p}.html"] span`).forEach(el => {
                const a = el.closest('a'); if (!a.dataset.dprOrig) a.dataset.dprOrig = el.textContent;
                const want = t === k ? a.dataset.dprOrig : t; if (el.textContent !== want) el.textContent = want;
            });
        });
        if (PAGE === 'consignado') {
            const h = document.querySelector('.header-left h2'); const t = DPTerm('Consignado');
            if (h && t !== 'Consignado' && h.textContent.trim() === 'Consignado') h.textContent = t;
        }
    }

    /* ---------- Ordens de serviço: tela de veículo ---------- */
    const lbl = id => { const el = $(id); return el && el.closest('.form-group') ? el.closest('.form-group').querySelector('.form-label') : null; };
    function osPage() {
        if (PAGE !== 'ordens-servico' || !$('osDeviceType')) return;
        const v = vehicle();
        const set = (el, attr, a, b) => { if (!el) return; const key = 'dprOrig' + attr; if (el.dataset[key] === undefined) el.dataset[key] = attr === 'text' ? el.textContent : (el.getAttribute(attr) || ''); const want = v ? a : el.dataset[key]; if (attr === 'text') { if (el.textContent !== want) el.textContent = want; } else if (el.getAttribute(attr) !== want) el.setAttribute(attr, want); };
        set(lbl('osDeviceType'), 'text', 'Tipo de veículo *'); set($('osDeviceType'), 'placeholder', 'Carro, moto, caminhonete...');
        set($('osBrand'), 'placeholder', 'Volkswagen, Fiat, Honda...'); set($('osModel'), 'placeholder', 'Gol 1.0 2015, Onix LT...');
        set(lbl('osImei'), 'text', 'Chassi'); set($('osImei'), 'placeholder', 'Chassi (opcional)');
        set(lbl('osSerial'), 'text', 'Placa'); set($('osSerial'), 'placeholder', 'ABC1D23');
        set($('osAccessories'), 'placeholder', 'Ex.: estepe, macaco, triângulo, documento (CRLV), som — ou Nenhum');
        set($('osCondition'), 'placeholder', 'Ex.: risco na porta, para-choque trincado, pneu careca, luz de injeção acesa...');
        set($('osService'), 'placeholder', 'Ex.: troca de óleo e filtro, alinhamento, revisão dos freios...');
        set($('osParts'), 'placeholder', 'Ex.: óleo 5W30, filtro de óleo, pastilha de freio...');
        set($('osSearch'), 'placeholder', 'Buscar cliente, veículo, placa, chassi...');
        const sec = $('osDeviceType').closest('.os-section'); set(sec && sec.querySelector('.os-section-title strong'), 'text', 'Veículo recebido');
        const ic = sec && sec.querySelector('.os-section-icon i'); if (ic) { const want = v ? 'fas fa-car' : (ic.dataset.dprOrig || ic.className); if (!ic.dataset.dprOrig) ic.dataset.dprOrig = ic.className; if (ic.className.split(' ').filter(c => c !== 'dpi-on').join(' ') !== want) ic.className = want; }
        const tb = $('osTbody'), table = tb && tb.closest('table');
        if (table) table.querySelectorAll('thead th').forEach(th => {
            const o = th.dataset.dprOrig || th.textContent.trim();
            if (o === 'Cliente / Equipamento') set(th, 'text', 'Cliente / Veículo'); else if (o === 'IMEI / Serial') set(th, 'text', window.DPOsVeiculo ? 'Placa / KM' : 'Placa / Chassi'); // 38.2 · os-veiculo-v1.js mostra placa e KM
        });
    }

    /* ---------- Configurações › Empresa: Pet shop e OS para veículos ---------- */
    const CARDS = [
        { id: 'dprPetCard', key: 'petEnabled', icon: 'paw-print', title: 'Pet shop',
            text: 'Para pet shop, banho e tosa e clínica veterinária. Liga o modo pet: a Agenda pergunta qual é o pet de cada horário e manda o aviso de <b>pet pronto</b> no WhatsApp, e a ficha do cliente guarda os pets dele.',
            on: 'Modo pet shop ligado.', off: 'Modo pet shop desligado.' },
        { id: 'dprVehCard', key: 'osVehicleMode', icon: 'car', title: 'OS para veículos',
            text: 'Para oficina mecânica, auto center, autopeças, funilaria e lava-jato. A Ordem de Serviço passa a falar de <b>veículo</b>: placa, chassi, checklist do veículo (lataria, vidros, pneus, estepe, documento e combustível) e as mensagens do WhatsApp dizem "seu veículo".',
            on: 'Pronto: as Ordens de Serviço agora são de veículo.', off: 'As Ordens de Serviço voltaram a ser de aparelho.' }
    ];
    function cards() {
        const host = $('tabEmpresa'); if (!host || !boss()) return;
        let after = $('dpaCfgCard') || $('ospCfgCard') || $('mesCfgCard');
        CARDS.forEach(c => {
            if ($(c.id)) { after = $(c.id); return; }
            const card = document.createElement('div'); card.className = 'card osp-cfg dpr-cfg'; card.id = c.id;
            card.innerHTML = `<div class="osp-cfg-h"><div class="ico">${I(c.icon)}</div><div><h3>${c.title}</h3><p>${c.text}</p></div>
<label class="osp-sw" title="Ligar ou desligar"><input type="checkbox" data-dpr="${c.key}"><span></span></label></div>`;
            if (after) after.insertAdjacentElement('afterend', card); else host.appendChild(card);
            after = card;
            const inp = card.querySelector('input');
            inp.checked = c.key === 'petEnabled' ? pet() : vehicle();
            inp.addEventListener('change', async () => {
                try { await save({ [c.key]: inp.checked }); toast('success', inp.checked ? c.on : c.off); }
                catch (e) { inp.checked = !inp.checked; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            });
        });
        if (!$('dprCss')) { const s = document.createElement('style'); s.id = 'dprCss'; s.textContent = '.dpr-cfg .osp-cfg-h .ico svg.dpi{width:24px;height:24px;color:var(--accent)}'; document.head.appendChild(s); }
    }
    function paintCards() { CARDS.forEach(c => { const i = document.querySelector(`#${c.id} input`); if (i && document.activeElement !== i) i.checked = c.key === 'petEnabled' ? pet() : vehicle(); }); }

    /* ---------- Carregar / salvar ---------- */
    function keep(g) {
        st = { segment: g.segment || '', osVehicleMode: g.osVehicleMode, petEnabled: g.petEnabled, agendaEnabled: g.agendaEnabled, mesasEnabled: g.mesasEnabled };
        try { localStorage.setItem(CACHE, JSON.stringify(st)); } catch (e) { }
    }
    async function load() {
        try { const d = await db.collection('settings').doc(DOC).get(); keep(d.exists ? (d.data() || {}) : {}); } catch (e) { }
        paint();
        // A lista de OS pode ter sido desenhada antes deste arquivo chegar: redesenha uma vez com Placa/Chassi
        if (PAGE === 'ordens-servico' && !load.osDone && typeof window.renderServiceOrders === 'function') { load.osDone = true; try { window.renderServiceOrders(); } catch (e) { } }
        return st;
    }
    async function save(patch) {
        await db.collection('settings').doc(DOC).set({ ...patch, updatedAt: ts() }, { merge: true });
        keep({ ...st, ...patch }); paint();
        try { document.dispatchEvent(new CustomEvent('dp:ramo', { detail: { ...st } })); } catch (e) { }
    }
    function paint() { labels(); osPage(); paintCards(); }

    window.DPRamo = { load, save, segment, vehicle, pet, isVehicle, LABELS, get state() { return { ...st, segment: segment() }; } };
    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    ready(() => { paint(); cards(); });
    // configuracoes.html#aba-vendas (link dos Primeiros passos): já abre na aba certa
    if (PAGE === 'configuracoes') ready(() => setTimeout(() => { const m = /^#aba-([a-z]+)$/.exec(location.hash || ''); const b = m && document.querySelector(`[onclick="showTab('${m[1]}')"]`); if (b) b.click(); }, 300));
    try { auth.onAuthStateChanged(u => { if (u) load(); }); } catch (e) { load(); }
    // Outros scripts mexem no menu e na Empresa depois (módulos, agenda, assistência): reaplica.
    document.addEventListener('dp:modules', () => labels());
    const mo = new MutationObserver(() => { clearTimeout(mo.t); mo.t = setTimeout(() => { labels(); if ($('tabEmpresa')) cards(); }, 200); });
    ready(() => { const m = document.querySelector('.sidebar-menu'); if (m) mo.observe(m, { childList: true }); const e = $('tabEmpresa'); if (e) mo.observe(e, { childList: true }); });
})();
