/* DistribuiPro 38.2 · Pets e veículos dos clientes (todas as versões: Mensal, demo, Firebase, MySQL e Windows Offline).
   Para pet shop, banho e tosa, clínica veterinária, oficina, auto center, lava-jato e autopeças.
   - Cadastro de pets (espécie, raça, porte, peso, alertas como "morde") e de veículos (placa antiga ou Mercosul, KM),
     ligados ao cliente: aba "Pets" / "Veículos" na ficha do cliente e busca de clientes pelo nome do pet ou pela placa
     (em Clientes e no PDV).
   - Ficha do pet ou do veículo: alertas em vermelho, próximas doses e revisões (por data e por KM), linha do tempo
     (vacinas e serviços, agenda, vendas e ordens de serviço), "Registrar aplicação/serviço", carteirinha de vacinas e
     histórico do veículo em A4, retorno em garantia e "Nova OS para este carro".
   - PDV: ao escolher o cliente aparece "Para qual pet/veículo?". Vender um produto que gera lembrete (vacina, vermífugo,
     antipulgas, troca de óleo, revisão) registra sozinho a aplicação na ficha, com a próxima data/KM.
   - Produtos: "Lembrete de recompra" (tipo e repetição em dias ou KM), referência do fabricante e aplicação (veículos
     compatíveis). A busca do PDV, de Produtos, da OS e do orçamento acha a peça pela aplicação ("pastilha gol g5").
   - Ordens de serviço: com "OS para veículos" ligada, carrega o os-veiculo-v1.js (veículo do cliente, KM e combustível).
   Liga com as chaves "Pet shop" (petEnabled) e "OS para veículos" (osVehicleMode) de Configurações › Empresa (ramo-v1.js).
   Coleções: customer_items, customer_item_events. API: window.DPItens. */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.DPItens) return;
    const VER = (/[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || '') || [])[1] || '38.2';
    const DEMO = !!db.__isLocalDemo, DOC = DEMO ? 'demo_general' : 'general';
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const COL = 'customer_items', EVC = 'customer_item_events';

    /* ===================== UTILITÁRIOS ===================== */
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const words = s => norm(s).replace(/[^a-z0-9]+/g, ' ').trim();
    const compact = s => norm(s).replace(/[^a-z0-9]/g, '');
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const intFmt = v => Math.round(Number(v) || 0).toLocaleString('pt-BR');
    const kmFmt = v => intFmt(v) + ' km';
    const parseNum = v => {
        let s = String(v ?? '').trim().replace(/\s/g, '').replace(/km$/i, ''); if (!s) return null;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.'); else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        const n = Number(s); return Number.isFinite(n) ? n : null;
    };
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const ts = () => FV().serverTimestamp();
    const pad = n => String(n).padStart(2, '0');
    const isoDay = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const today = () => isoDay(new Date());
    function toMs(v) {
        if (!v) return 0;
        try {
            if (typeof v === 'number') return v;
            if (typeof v === 'string') { if (/^\d{4}-\d\d-\d\d$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d, 12).getTime(); } const n = Date.parse(v); return isNaN(n) ? 0 : n; }
            if (typeof v.toDate === 'function') return v.toDate().getTime();
            if (v.seconds) return v.seconds * 1000;
            if (v.value) return Date.parse(v.value) || 0;
            if (v.__ts) return Number(v.__ts) || 0;
        } catch (e) { }
        return 0;
    }
    const addDays = (iso, n) => { const d = new Date(toMs(iso) || Date.now()); d.setDate(d.getDate() + Number(n || 0)); return isoDay(d); };
    const dayOf = v => { const ms = toMs(v); return ms ? isoDay(new Date(ms)) : ''; };
    const fmtD = v => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString('pt-BR') : '—'; };
    const fmtDM = v => { const ms = toMs(v); return ms ? new Date(ms).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; };
    function daysTo(iso) { const ms = toMs(iso); if (!ms) return null; const a = new Date(); a.setHours(12, 0, 0, 0); const b = new Date(ms); b.setHours(12, 0, 0, 0); return Math.round((b - a) / 864e5); }
    const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;
    const firstName = n => String(n || '').trim().split(/\s+/)[0] || '';
    const me = () => { try { return (typeof currentUser !== 'undefined' && currentUser) || {}; } catch (e) { return {}; } };
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const uname = () => me().name || (() => { try { return auth.currentUser.displayName || auth.currentUser.email || ''; } catch (e) { return ''; } })() || 'Operador';
    const role = () => { try { return me().role || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } };
    const boss = () => ['', 'admin', 'manager'].includes(role());
    const waPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); return d.length === 10 || d.length === 11 ? '55' + d : ''; };
    const osNum = o => '#OS-' + String((o && o.orderNumber) || 0).padStart(4, '0');
    const saleNum = s => s && s.saleNumber ? '#V-' + String(s.saleNumber).padStart(4, '0') : '';
    function docs(s) { return (s && s.docs ? s.docs : []).map(d => ({ id: d.id, ...d.data() })).filter(x => x && x.deleted !== true); }

    /* Ícones de traço fino (desenhos do Lucide, licença ISC). Os que o dp-icons-v1.js não tem ficam aqui. */
    const XI = {
        syringe: '<path d="m18 2 4 4"/><path d="m17 7 3-3"/><path d="M19 9 8.7 19.3c-1 1-2.5 1-3.4 0l-.6-.6c-1-1-1-2.5 0-3.4L15 5"/><path d="m9 11 4 4"/><path d="m5 19-3 3"/><path d="m14 4 6 6"/>',
        pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
        bug: '<path d="m8 2 1.88 1.88"/><path d="M14.12 3.88 16 2"/><path d="M9 7.13v-1a3.003 3.003 0 1 1 6 0v1"/><path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6"/><path d="M12 20v-9"/><path d="M6.53 9C4.6 8.8 3 7.1 3 5"/><path d="M6 13H2"/><path d="M3 21c0-2.1 1.7-3.9 3.8-4"/><path d="M20.97 5c0 2.1-1.6 3.8-3.5 4"/><path d="M22 13h-4"/><path d="M17.2 17c2.1.1 3.8 1.9 3.8 4"/>',
        weight: '<circle cx="12" cy="5" r="3"/><path d="M6.5 8a2 2 0 0 0-1.905 1.46L2.1 18.5A2 2 0 0 0 4 21h16a2 2 0 0 0 1.925-2.54L19.4 9.5A2 2 0 0 0 17.48 8Z"/>'
    };
    const I = (n, cls) => XI[n]
        ? `<svg class="dpi dpi-${n}${cls ? ' ' + cls : ''}" viewBox="0 0 24 24" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${XI[n]}</svg>`
        : (window.dpIcon ? window.dpIcon(n, cls) : '');

    /* ===================== CADASTROS FIXOS ===================== */
    // Tipos de aplicação/serviço: ícone, para quem (pet/veículo) e repetição padrão (dias e KM)
    const EV = {
        vacina: { l: 'Vacina', ic: 'syringe', kind: 'pet', days: 365, c: '#8b5cf6' },
        vermifugo: { l: 'Vermífugo', ic: 'pill', kind: 'pet', days: 90, c: '#0ea5e9' },
        antipulgas: { l: 'Antipulgas', ic: 'bug', kind: 'pet', days: 30, c: '#f59e0b' },
        consulta: { l: 'Consulta', ic: 'stethoscope', kind: 'pet', days: 0, c: '#10b981' },
        exame: { l: 'Exame', ic: 'flask-conical', kind: 'pet', days: 0, c: '#14b8a6' },
        oleo: { l: 'Troca de óleo', ic: 'droplet', kind: 'veiculo', days: 180, km: 5000, c: '#f59e0b' },
        revisao: { l: 'Revisão', ic: 'wrench', kind: 'veiculo', days: 365, km: 10000, c: '#6366f1' },
        lavagem: { l: 'Lavagem', ic: 'spray-can', kind: 'veiculo', days: 0, c: '#0ea5e9' },
        outro: { l: 'Outro', ic: 'circle-dot', kind: '', days: 0, c: '#64748b' }
    };
    const evOf = t => EV[t] || EV.outro;
    const SUGG = {
        vacina: ['V10', 'V8', 'Antirrábica', 'Gripe canina', 'Giárdia', 'Leishmaniose', 'V4 felina', 'V5 felina'],
        vermifugo: ['Drontal', 'Milbemax', 'Vermivet', 'Endogard', 'Vetmax'],
        antipulgas: ['NexGard', 'Bravecto', 'Simparic', 'Frontline', 'Revolution', 'Coleira Seresto'],
        consulta: ['Consulta clínica', 'Retorno', 'Check-up'], exame: ['Hemograma', 'Bioquímico', 'Ultrassom', 'Raio-X'],
        oleo: ['Óleo 5W30 sintético e filtro', 'Óleo 15W40 e filtro', 'Óleo 10W40 e filtro'],
        revisao: ['Revisão 10.000 km', 'Revisão completa', 'Alinhamento e balanceamento', 'Freios', 'Correia dentada'],
        lavagem: ['Lavagem simples', 'Lavagem completa', 'Higienização interna', 'Polimento']
    };
    const SPECIES = { cao: 'Cão', gato: 'Gato', ave: 'Ave', roedor: 'Roedor', outro: 'Outro' };
    const SIZES = { P: 'Pequeno', M: 'Médio', G: 'Grande', GG: 'Gigante' };
    const SEX = { M: 'Macho', F: 'Fêmea' };
    const COATS = { curto: 'Curto', medio: 'Médio', longo: 'Longo' };
    const VTYPES = { carro: 'Carro', moto: 'Moto', caminhonete: 'Caminhonete', caminhao: 'Caminhão', utilitario: 'Utilitário', outro: 'Outro' };
    const FUELS = { flex: 'Flex', gasolina: 'Gasolina', etanol: 'Etanol', diesel: 'Diesel', gnv: 'GNV', eletrico: 'Elétrico', hibrido: 'Híbrido' };
    const FUEL_LEVEL = ['Reserva', '1/4', '1/2', '3/4', 'Cheio'];
    const PET_ALERTS = ['Morde', 'Bravo com outros animais', 'Cardíaco', 'Não usar secador', 'Idoso', 'Medroso', 'Pele sensível'];
    const VEH_ALERTS = ['Chave reserva na loja', 'Não mexer no som', 'Cliente acompanha o serviço', 'Barulho já conhecido', 'Estepe ruim'];
    const BREEDS = ['SRD (sem raça definida)', 'Shih-tzu', 'Poodle', 'Yorkshire', 'Lhasa Apso', 'Spitz alemão (Lulu)', 'Maltês', 'Pinscher', 'Golden Retriever', 'Labrador', 'Bulldog francês', 'Pug', 'Border Collie', 'Pastor alemão', 'Rottweiler', 'Pit Bull', 'Dachshund (salsicha)', 'Beagle', 'Schnauzer', 'Chow Chow', 'Siamês', 'Persa', 'Maine Coon', 'Angorá'];
    const BRANDS = ['Volkswagen', 'Chevrolet', 'Fiat', 'Ford', 'Toyota', 'Hyundai', 'Honda', 'Renault', 'Jeep', 'Nissan', 'Peugeot', 'Citroën', 'Mitsubishi', 'Kia', 'BYD', 'Caoa Chery', 'BMW', 'Mercedes-Benz', 'Audi', 'Yamaha', 'Suzuki', 'Kawasaki'];
    const COLORS = ['Branco', 'Prata', 'Preto', 'Cinza', 'Vermelho', 'Azul', 'Verde', 'Bege', 'Marrom', 'Amarelo', 'Laranja'];

    /* ===================== PLACA ===================== */
    const plateKey = s => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
    const plateOk = s => /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/.test(plateKey(s));
    const plateFmt = s => { const k = plateKey(s); return /^[A-Z]{3}[0-9]{4}$/.test(k) ? k.slice(0, 3) + '-' + k.slice(3) : k; };
    const plateTag = p => p ? `<span class="dpit-plate" title="Placa">${esc(plateFmt(p))}</span>` : '';

    /* ===================== PET / VEÍCULO: textos ===================== */
    const isVeh = it => !!it && it.kind === 'veiculo';
    const active = it => !it.status || it.status === 'active';
    const alertsOf = it => (it && Array.isArray(it.alerts) ? it.alerts : []).map(a => String(a || '').trim()).filter(Boolean);
    const title = it => isVeh(it) ? ([it.brand, it.model].filter(Boolean).join(' ') || it.name || 'Veículo') : (it.name || 'Pet');
    const short = it => isVeh(it) ? [it.model || it.brand || it.name || 'Veículo', it.plate ? plateFmt(it.plate) : ''].filter(Boolean).join(' · ') : (it.name || 'Pet');
    const icOf = it => isVeh(it) ? (it.vtype === 'moto' ? 'bike' : it.vtype === 'caminhao' ? 'truck' : 'car') : 'paw-print';
    function age(b) {
        const ms = toMs(b); if (!ms) return '';
        const d = new Date(ms), n = new Date(); let m = (n.getFullYear() - d.getFullYear()) * 12 + n.getMonth() - d.getMonth(); if (n.getDate() < d.getDate()) m--;
        if (m < 0) return ''; if (m < 12) return m < 1 ? 'menos de 1 mês' : plural(m, 'mês', 'meses');
        return plural(Math.floor(m / 12), 'ano', 'anos');
    }
    function sub(it) {
        if (isVeh(it)) return [it.vtype && it.vtype !== 'carro' ? VTYPES[it.vtype] : '', it.year, it.color, FUELS[it.fuel] || '', Number(it.lastKm) > 0 ? kmFmt(it.lastKm) : ''].filter(Boolean).join(' · ');
        return [SPECIES[it.species] || '', it.breed, it.size ? 'Porte ' + it.size : '', SEX[it.sex] || '', age(it.birthDate), Number(it.weightKg) > 0 ? String(it.weightKg).replace('.', ',') + ' kg' : ''].filter(Boolean).join(' · ');
    }
    const stLabel = it => it.status === 'deceased' ? 'Falecido' : it.status === 'inactive' ? (isVeh(it) ? 'Não é mais do cliente' : 'Inativo') : 'Ativo';
    const avatar = (it, cls) => it.photoUrl
        ? `<span class="dpit-av ${cls || ''}" style="background-image:url('${String(it.photoUrl).replace(/'/g, '%27').replace(/"/g, '%22')}')"></span>`
        : `<span class="dpit-av ic ${cls || ''}">${I(icOf(it))}</span>`;
    function warnText(it) { return [...alertsOf(it), it.allergies ? 'Alergia: ' + it.allergies : ''].filter(Boolean); }

    /* ===================== MODO (chaves do ramo) ===================== */
    function demoKey() { try { const s = JSON.parse(sessionStorage.getItem('dp_demo_segment_v1') || localStorage.getItem('dp_demo_segment_v1') || 'null'); return (s && (s.key || s.dataset)) || 'general'; } catch (e) { return 'general'; } }
    const MKEY = 'dp_itens_mode_v1' + (DEMO ? ':' + demoKey() : '');
    let mode = (() => { try { return JSON.parse(localStorage.getItem(MKEY) || 'null'); } catch (e) { return null; } })() || {};
    // DPRamo (ramo-v1.js) também sabe o ramo escolhido no Mensal; "mode" é a leitura direta de Configurações
    function petOn() { try { if (window.DPRamo && DPRamo.pet()) return true; } catch (e) { } return !!mode.pet; }
    function vehOn() { try { if (window.DPRamo && DPRamo.vehicle()) return true; } catch (e) { } return !!mode.veh; }
    const kindsOn = () => [petOn() && 'pet', vehOn() && 'veiculo'].filter(Boolean);
    async function loadMode() {
        try {
            const d = await db.collection('settings').doc(DOC).get(); const g = d.exists ? (d.data() || {}) : {}; const seg = String(g.segment || '');
            mode = { pet: g.petEnabled === true || (g.petEnabled !== false && seg === 'petshop'), veh: g.osVehicleMode === true || (g.osVehicleMode !== false && seg === 'oficina') };
            try { localStorage.setItem(MKEY, JSON.stringify(mode)); } catch (e) { }
        } catch (e) { }
        return mode;
    }
    function term(items) {
        const k = new Set(kindsOn()); (items || []).forEach(x => k.add(isVeh(x) ? 'veiculo' : 'pet'));
        if (k.has('pet') && k.has('veiculo')) return { one: 'pet ou veículo', many: 'pets e veículos', title: 'Pets e veículos', ic: 'paw-print', fa: 'fa-paw', kinds: ['pet', 'veiculo'] };
        if (k.has('veiculo')) return { one: 'veículo', many: 'veículos', title: 'Veículos', ic: 'car', fa: 'fa-car', kinds: ['veiculo'] };
        return { one: 'pet', many: 'pets', title: 'Pets', ic: 'paw-print', fa: 'fa-paw', kinds: ['pet'] };
    }

    /* ===================== DADOS ===================== */
    let index = null, indexAt = 0, indexP = null;
    const listeners = new Set();
    const emit = () => listeners.forEach(f => { try { f(); } catch (e) { } });
    function loadIndex(force) {
        if (!force && index && Date.now() - indexAt < 60000) return Promise.resolve(index);
        if (indexP) return indexP;
        indexP = db.collection(COL).get().then(s => { index = docs(s); indexAt = Date.now(); indexP = null; emit(); return index; })
            .catch(e => { indexP = null; console.warn('Pets e veículos: não foi possível carregar', e); if (!index) index = []; return index; });
        return indexP;
    }
    const sortItems = l => l.slice().sort((a, b) => (Number(active(b)) - Number(active(a))) || (a.kind === b.kind ? 0 : isVeh(a) ? 1 : -1) || title(a).localeCompare(title(b), 'pt-BR'));
    const cached = cid => sortItems((index || []).filter(x => x.customerId === cid));
    async function itemsOf(cid) {
        if (!cid) return [];
        let list;
        try { list = docs(await db.collection(COL).where('customerId', '==', cid).get()); } catch (e) { return cached(cid); }
        if (index) { index = index.filter(x => x.customerId !== cid).concat(list); emit(); }
        return sortItems(list);
    }
    async function getItem(id) {
        try { const s = await db.collection(COL).doc(id).get(); if (!s.exists) return null; const d = { id: s.id, ...s.data() }; return d.deleted === true ? null : d; }
        catch (e) { return (index || []).find(x => x.id === id) || null; }
    }
    function remember(it) {
        if (!index) return;
        const i = index.findIndex(x => x.id === it.id);
        if (it.deleted === true) { if (i >= 0) index.splice(i, 1); } else if (i >= 0) index[i] = { ...index[i], ...it }; else index.push(it);
        emit();
    }
    async function saveItem(id, data) {
        const body = { ...data, updatedAt: ts(), updatedBy: uid() };
        if (id) await db.collection(COL).doc(id).set(body, { merge: true });
        else { const ref = await db.collection(COL).add({ status: 'active', ...body, deleted: false, createdAt: ts(), createdBy: uid(), createdByName: uname() }); id = ref.id; }
        const prev = (index || []).find(x => x.id === id) || {};
        const local = { ...prev, ...data, id }; if (!local.status) local.status = 'active';
        remember(local);
        return id;
    }
    async function findByPlate(plate) {
        const k = plateKey(plate); if (k.length < 5) return null;
        const list = await loadIndex();
        return list.find(x => isVeh(x) && x.plate === k) || null;
    }
    async function eventsOf(itemId) {
        try { return docs(await db.collection(EVC).where('itemId', '==', itemId).get()).sort(byApplied); } catch (e) { return []; }
    }
    async function eventsOfCustomer(cid) {
        try { return docs(await db.collection(EVC).where('customerId', '==', cid).get()).sort(byApplied); } catch (e) { return []; }
    }
    function byApplied(a, b) { return String(b.appliedAt || '').localeCompare(String(a.appliedAt || '')) || toMs(b.createdAt) - toMs(a.createdAt); }
    async function addEvent(it, ev) {
        const km = Number(ev.km) > 0 ? Math.round(Number(ev.km)) : null;
        const data = {
            itemId: it.id, itemName: short(it), kind: it.kind || 'pet', customerId: it.customerId || '', customerName: it.customerName || '', customerPhone: it.customerPhone || '',
            type: EV[ev.type] ? ev.type : 'outro', name: String(ev.name || evOf(ev.type).l).trim().slice(0, 80), batch: String(ev.batch || '').trim(), appliedAt: ev.appliedAt || today(),
            km, nextDue: ev.nextDue || '', nextKm: Number(ev.nextKm) > 0 ? Math.round(Number(ev.nextKm)) : null,
            productId: ev.productId || '', saleId: ev.saleId || '', saleNumber: ev.saleNumber || null, serviceOrderId: ev.serviceOrderId || '',
            vetName: String(ev.vetName || '').trim(), notes: String(ev.notes || '').trim(), price: ev.price != null && ev.price !== '' ? r2(ev.price) : null,
            origin: ev.origin || 'manual', createdBy: uid(), createdByName: uname(), createdAt: ts(), deleted: false
        };
        const ref = await db.collection(EVC).add(data);
        if (isVeh(it) && km && km > Number(it.lastKm || 0)) { try { await saveItem(it.id, { lastKm: km, lastKmAt: data.appliedAt }); it.lastKm = km; } catch (e) { } }
        return ref.id;
    }
    // Próximas doses/revisões: a última aplicação de cada tipo+nome vale (uma nova "cumpre" a anterior)
    function dues(it, evs) {
        const last = new Map();
        (evs || []).forEach(e => { if (e.itemId && it.id && e.itemId !== it.id) return; const k = e.type + '|' + words(e.name); const cur = last.get(k); if (!cur || String(e.appliedAt || '') > String(cur.appliedAt || '')) last.set(k, e); });
        const out = [], rank = { late: 0, soon: 1, ok: 2 };
        last.forEach(e => {
            if (!e.nextDue && !e.nextKm) return;
            const d = e.nextDue ? daysTo(e.nextDue) : null;
            const kmLeft = e.nextKm && Number(it.lastKm) > 0 ? Number(e.nextKm) - Number(it.lastKm) : null;
            let st = 'ok';
            if ((d !== null && d < 0) || (kmLeft !== null && kmLeft <= 0)) st = 'late';
            else if ((d !== null && d <= 15) || (kmLeft !== null && kmLeft <= 500)) st = 'soon';
            out.push({ e, d, kmLeft, st });
        });
        return out.sort((a, b) => (rank[a.st] - rank[b.st]) || ((a.d ?? 99999) - (b.d ?? 99999)));
    }
    function dueText(x) {
        const parts = [];
        if (x.d !== null) parts.push(x.d < 0 ? `venceu há ${plural(-x.d, 'dia', 'dias')} (${fmtD(x.e.nextDue)})` : x.d === 0 ? 'vence hoje' : x.d === 1 ? 'vence amanhã' : x.d <= 60 ? `vence em ${x.d} dias (${fmtDM(x.e.nextDue)})` : `próxima em ${fmtD(x.e.nextDue)}`);
        if (x.kmLeft !== null) parts.push(x.kmLeft <= 0 ? `passou ${kmFmt(-x.kmLeft)} do previsto` : `faltam ${kmFmt(x.kmLeft)}`);
        else if (x.e.nextKm) parts.push(`aos ${kmFmt(x.e.nextKm)}`);
        return { n: x.e.name || evOf(x.e.type).l, t: parts.join(' · ') };
    }
    function warranty(o) {
        const days = Number(o.warrantyDays || 0), from = toMs(o.deliveredAt);
        if (o.status !== 'delivered' || !from || !days) return { state: 'none', until: 0 };
        const until = from + days * 864e5;
        return Date.now() <= until ? { state: 'valid', until, left: Math.ceil((until - Date.now()) / 864e5) } : { state: 'expired', until };
    }
    let prodP = null;
    function eventProducts() {
        if (!prodP) prodP = db.collection('products').get().then(s => docs(s).filter(p => p.itemEventType && EV[p.itemEventType] && p.status !== 'inactive')).catch(() => []);
        return prodP;
    }
    let coP = null;
    function company() {
        if (coP) return coP;
        coP = (async () => {
            const c = { name: 'DistribuiPRO', legalName: '', cnpj: '', phone: '', whatsapp: '', email: '', address: '', logoUrl: '' };
            try {
                const snap = await db.collection('settings').doc('general').get(); const d = snap.exists ? (snap.data() || {}) : {};
                const isDemo = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
                const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
                c.name = isDemo ? (brand.companyName || d.nomeFantasia || d.razaoSocial || 'DistribuiPRO') : (d.nomeFantasia || brand.companyName || d.razaoSocial || 'DistribuiPRO');
                c.legalName = d.razaoSocial || ''; c.cnpj = d.cnpj || ''; c.phone = d.telefone || ''; c.whatsapp = d.whatsapp || ''; c.email = d.email || '';
                c.address = [[d.logradouro, d.numero].filter(Boolean).join(', '), d.bairro, [d.cidade, d.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
                const custom = isDemo ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || '');
                try { c.logoUrl = custom || new URL('assets/brand/distribuipro-mark.svg?v=41.5-logo', location.href).href; } catch (e) { c.logoUrl = custom; }
            } catch (e) { }
            return c;
        })();
        return coP;
    }

    /* ===================== ESTILO ===================== */
    function css() {
        if ($('dpitCss')) return;
        const st = document.createElement('style'); st.id = 'dpitCss';
        st.textContent = `
.dpit-ov{position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,.55);display:flex;align-items:flex-start;justify-content:center;padding:28px 14px;overflow-y:auto;-webkit-overflow-scrolling:touch}
.dpit-m{width:100%;max-width:620px;margin:auto 0;background:var(--bg-card,#fff);color:var(--text-primary);border:1px solid var(--border-color);border-radius:18px;box-shadow:0 28px 70px rgba(2,6,23,.35);overflow:hidden}
.dpit-m.wide{max-width:1000px}.dpit-m.small{max-width:440px}
.dpit-mh{display:flex;align-items:center;gap:12px;padding:15px 18px;border-bottom:1px solid var(--border-color)}
.dpit-mh h3{margin:0;font-size:16px;color:var(--text-heading);line-height:1.25}.dpit-mh small{display:block;font-size:12px;color:var(--text-muted);margin-top:2px}
.dpit-mi{width:38px;height:38px;border-radius:11px;display:grid;place-items:center;background:color-mix(in srgb,var(--accent,#6366f1) 13%,transparent);color:var(--accent,#6366f1);flex:none}.dpit-mi svg{width:19px;height:19px}
.dpit-x{margin-left:auto;border:0;background:transparent;color:var(--text-muted);width:34px;height:34px;border-radius:10px;cursor:pointer;display:grid;place-items:center;flex:none}.dpit-x:hover{background:var(--bg-secondary);color:var(--text-primary)}.dpit-x svg{width:18px;height:18px}
.dpit-mb{padding:16px 18px;display:grid;gap:12px}
.dpit-mf{display:flex;align-items:center;gap:8px;padding:12px 18px;border-top:1px solid var(--border-color);flex-wrap:wrap;background:var(--bg-secondary)}.dpit-mf .sp{flex:1}
.dpit-load{padding:40px;text-align:center;color:var(--text-muted)}.dpit-load svg{width:22px;height:22px;animation:dpitSpin 1s linear infinite;vertical-align:middle;margin-right:6px}@keyframes dpitSpin{to{transform:rotate(360deg)}}
.dpit-f{display:flex;flex-direction:column;gap:5px;min-width:0}.dpit-f>label{font-size:12px;font-weight:700;color:var(--text-secondary)}.dpit-f small{font-size:11px;color:var(--text-muted)}.dpit-f small.bad{color:#dc2626;font-weight:600}.dpit-f small.warn{color:#d97706;font-weight:600}
.dpit-g2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dpit-g3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}
.dpit-seg{display:flex;flex-wrap:wrap;gap:6px}.dpit-seg button{border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:9px;padding:7px 11px;font:600 12.5px/1.2 inherit;font-family:inherit;cursor:pointer;min-width:40px}
.dpit-seg button.on{border-color:var(--accent);background:color-mix(in srgb,var(--accent,#6366f1) 14%,transparent);color:var(--text-heading)}
.dpit-chips{display:flex;flex-wrap:wrap;gap:6px}.dpit-chips button{border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:999px;padding:5px 11px;font:600 12px/1.2 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:5px}
.dpit-chips button svg{width:13px;height:13px}.dpit-chips button.on{border-color:rgba(239,68,68,.55);background:rgba(239,68,68,.11);color:#dc2626}
.dpit-add{display:flex;gap:6px}.dpit-add input{flex:1;min-width:0}
.dpit-photo{display:flex;align-items:center;gap:14px}.dpit-photo .dpit-av{width:72px;height:72px}.dpit-photo .dpit-av.ic svg{width:30px;height:30px}.dpit-photo-acts{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.dpit-photo small{display:block;flex-basis:100%;font-size:11px;color:var(--text-muted)}
.dpit-b{display:inline-flex;align-items:center;justify-content:center;gap:6px;height:34px;padding:0 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);font:600 12.5px/1 inherit;font-family:inherit;cursor:pointer;text-decoration:none;white-space:nowrap}
.dpit-b:hover{border-color:var(--accent);color:var(--accent)}.dpit-b svg{width:15px;height:15px;flex:none}.dpit-b[disabled]{opacity:.5;pointer-events:none}
.dpit-b.pri{background:var(--accent);border-color:var(--accent);color:#fff}.dpit-b.pri:hover{color:#fff;filter:brightness(1.07)}
.dpit-b.wa{color:#16a34a;border-color:rgba(22,163,74,.35);background:rgba(22,163,74,.08)}.dpit-b.bad:hover{border-color:#ef4444;color:#ef4444}
.dpit-b.sm{height:28px;padding:0 9px;font-size:12px}.dpit-b.sm svg{width:13px;height:13px}
.dpit-plate{display:inline-block;position:relative;font:800 11.5px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.07em;color:#0f172a;background:#fff;border:1.5px solid #0f172a;border-radius:5px;padding:7px 7px 3px;vertical-align:middle;white-space:nowrap;overflow:hidden}
.dpit-plate::before{content:'';position:absolute;left:0;right:0;top:0;height:4px;background:#1d4ed8}
.dpit-av{width:44px;height:44px;border-radius:50%;background:center/cover no-repeat var(--bg-card);flex:none;border:2px solid var(--border-color);display:inline-block}
.dpit-av.ic{display:inline-grid;place-items:center;color:var(--accent);background:color-mix(in srgb,var(--accent,#6366f1) 12%,var(--bg-card,#fff))}.dpit-av.ic svg{width:21px;height:21px}.dpit-av.xl{width:70px;height:70px}.dpit-av.xl.ic svg{width:32px;height:32px}
.dpit-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(270px,1fr));gap:12px}
.dpit-card{border:1px solid var(--border-color);border-radius:14px;padding:12px;background:var(--bg-secondary);display:flex;flex-direction:column;gap:8px;cursor:pointer;transition:border-color .15s,transform .15s;min-width:0}
.dpit-card:hover{border-color:var(--accent)}.dpit-card.off{opacity:.62}
.dpit-card-h{display:flex;align-items:center;gap:10px;min-width:0}.dpit-card-h .tx{min-width:0;flex:1}.dpit-card-h b{font-size:14.5px;color:var(--text-heading);margin-right:6px}
.dpit-card-h small{display:block;font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
.dpit-st{font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:rgba(100,116,139,.15);color:var(--text-secondary);white-space:nowrap}
.dpit-alerts{display:flex;flex-wrap:wrap;gap:5px}.dpit-al{display:inline-flex;align-items:center;gap:4px;font-size:11.5px;font-weight:700;color:#dc2626;background:rgba(239,68,68,.11);border:1px solid rgba(239,68,68,.32);border-radius:999px;padding:3px 9px;line-height:1.3}.dpit-al svg{width:12px;height:12px;flex:none}
.dpit-due{display:flex;align-items:center;gap:7px;font-size:12px;color:var(--text-secondary);line-height:1.35}.dpit-due svg{width:14px;height:14px;flex:none}.dpit-due.late{color:#dc2626}.dpit-due.soon{color:#d97706}.dpit-due.ok svg{color:#10b981}
.dpit-card-f{display:flex;gap:6px;flex-wrap:wrap;margin-top:auto;padding-top:2px}
.dpit-old{margin-top:12px}.dpit-old summary{cursor:pointer;font-size:12.5px;font-weight:700;color:var(--text-muted);margin-bottom:10px}
.dpit-hero{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.dpit-chip{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:999px;padding:5px 11px 5px 8px;font:600 12px/1.2 inherit;font-family:inherit;cursor:pointer;max-width:100%}
.dpit-chip svg{width:14px;height:14px;color:var(--accent);flex:none}.dpit-chip>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dpit-chip.on{border-color:var(--accent);background:var(--accent);color:#fff}.dpit-chip.on svg{color:#fff}
.dpit-chip .warn{display:inline-flex}.dpit-chip .warn svg{color:#dc2626}.dpit-chip.on .warn svg{color:#fff}.dpit-chip.bad{border-color:rgba(239,68,68,.45)}
.dpit-sh-top{display:flex;gap:14px;align-items:flex-start;padding:16px 18px;border-bottom:1px solid var(--border-color)}
.dpit-sh-top .tx{flex:1;min-width:0}.dpit-sh-top h2{margin:0;font-size:20px;color:var(--text-heading);display:flex;align-items:center;gap:8px;flex-wrap:wrap;line-height:1.2}
.dpit-sh-sub{font-size:13px;color:var(--text-muted);margin-top:5px}
.dpit-owner{font-size:12.5px;margin-top:7px;color:var(--text-secondary);display:flex;gap:10px;flex-wrap:wrap;align-items:center}.dpit-owner svg{width:14px;height:14px;vertical-align:-2px}.dpit-owner a{color:var(--accent);font-weight:700;text-decoration:none}
.dpit-warnbox{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border-radius:12px;background:rgba(239,68,68,.09);border:1px solid rgba(239,68,68,.38);color:#dc2626;font-size:13px;line-height:1.45}.dpit-warnbox svg{width:18px;height:18px;flex:none;margin-top:1px}
.dpit-acts{display:flex;flex-wrap:wrap;gap:8px}
.dpit-cols{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:14px;align-items:start}
.dpit-box{border:1px solid var(--border-color);border-radius:14px;padding:12px 14px;background:var(--bg-card);min-width:0}
.dpit-box h4{margin:0 0 10px;font-size:11.5px;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted);display:flex;align-items:center;gap:6px}.dpit-box h4 svg{width:14px;height:14px}
.dpit-dl{display:grid;grid-template-columns:auto 1fr;gap:6px 12px;margin:0;font-size:13px}.dpit-dl dt{color:var(--text-muted)}.dpit-dl dd{margin:0;color:var(--text-primary);font-weight:600;overflow-wrap:anywhere}
.dpit-dues{display:grid;gap:6px}.dpit-du{display:flex;align-items:center;gap:10px;padding:8px 10px;border-radius:10px;background:var(--bg-secondary);font-size:13px}
.dpit-du>svg{width:17px;height:17px;flex:none;color:#10b981}.dpit-du .t{flex:1;min-width:0}.dpit-du .t b{display:block;color:var(--text-heading)}.dpit-du .t small{font-size:12px;color:var(--text-muted)}
.dpit-du.late{background:rgba(239,68,68,.09)}.dpit-du.late>svg,.dpit-du.late .t small{color:#dc2626}.dpit-du.soon{background:rgba(245,158,11,.11)}.dpit-du.soon>svg,.dpit-du.soon .t small{color:#d97706}
.dpit-tl{display:flex;flex-direction:column}
.dpit-tl-i{display:flex;gap:10px;padding:9px 2px;border-bottom:1px dashed var(--border-color)}.dpit-tl-i:last-child{border-bottom:0}
.dpit-tl-ic{width:30px;height:30px;border-radius:9px;display:grid;place-items:center;flex:none;background:color-mix(in srgb,var(--c,#6366f1) 14%,transparent);color:var(--c,#6366f1)}.dpit-tl-ic svg{width:15px;height:15px}
.dpit-tl-tx{flex:1;min-width:0}.dpit-tl-tx b{font-size:13px;color:var(--text-heading)}.dpit-tl-tx small{display:block;font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.45;overflow-wrap:anywhere}
.dpit-tl-tx .dpit-acts{margin-top:6px}
.dpit-tl-r{text-align:right;font-size:12px;color:var(--text-muted);white-space:nowrap}.dpit-tl-r b{display:block;font-size:13px;color:var(--text-primary)}
.dpit-pill{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:800;padding:2px 8px;border-radius:999px;background:color-mix(in srgb,var(--c,#64748b) 15%,transparent);color:var(--c,#64748b);vertical-align:1px;margin-left:4px}
.dpit-types{display:grid;grid-template-columns:repeat(auto-fill,minmax(104px,1fr));gap:6px}
.dpit-types button{display:flex;flex-direction:column;align-items:center;gap:5px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:11px;padding:10px 6px;font:600 12px/1.2 inherit;font-family:inherit;cursor:pointer;text-align:center}
.dpit-types button svg{width:19px;height:19px;color:var(--c,var(--accent))}.dpit-types button.on{border-color:var(--accent);color:var(--text-heading);background:color-mix(in srgb,var(--accent,#6366f1) 12%,transparent)}
.dpit-next{border:1px dashed var(--border-color);border-radius:12px;padding:10px 12px;display:grid;gap:8px}.dpit-next-h{display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:var(--text-heading)}.dpit-next-h svg{width:15px;height:15px;color:var(--accent)}.dpit-next>small{font-size:11px;color:var(--text-muted)}
.dpit-pick{display:grid;gap:8px}.dpit-pick button{display:flex;align-items:center;gap:10px;border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-primary);border-radius:12px;padding:10px 12px;font:600 13.5px/1.25 inherit;font-family:inherit;cursor:pointer;text-align:left}
.dpit-pick button:hover{border-color:var(--accent)}.dpit-pick button small{display:block;font-weight:500;font-size:12px;color:var(--text-muted)}.dpit-pick .dpit-av{width:36px;height:36px}.dpit-pick .dpit-av.ic svg{width:17px;height:17px}
.dpit-pdv{margin-top:8px;display:grid;gap:6px}.dpit-pdv[hidden]{display:none}
.dpit-pdv-h{display:flex;align-items:center;gap:6px;font-size:11.5px;font-weight:700;color:var(--text-muted)}.dpit-pdv-h svg{width:13px;height:13px;color:var(--accent);flex:none}
.dpit-chip.ghost{border-style:dashed;color:var(--accent);background:transparent}
.dpit-pdv-new{margin-left:auto;border:0;background:transparent;color:var(--accent);font:700 11.5px/1 inherit;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:3px;text-transform:none;letter-spacing:0;padding:2px}
.dpit-pdv-chips{display:flex;flex-wrap:wrap;gap:6px}.dpit-pdv-none{font-size:12px;color:var(--text-muted)}
.dpit-pdv-al{display:flex;gap:6px;align-items:flex-start;font-size:12px;color:#dc2626;background:rgba(239,68,68,.09);border-radius:8px;padding:6px 8px;line-height:1.4}.dpit-pdv-al svg{width:14px;height:14px;flex:none;margin-top:1px}
.dpit-pinfo{font-size:10.5px;color:var(--text-muted);line-height:1.35;margin-top:2px;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}.dpit-pinfo b{color:var(--text-secondary);font-weight:700}
.dpit-pf{display:grid;gap:10px}.dpit-pf-box{border:1px solid var(--border-color);border-radius:12px;padding:10px 12px;background:var(--bg-surface,var(--bg-secondary))}.dpit-pf-box[hidden]{display:none}
.dpit-pf-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:8px}.dpit-pf-h svg{width:16px;height:16px;color:var(--accent)}.dpit-pf-h b{font-size:13px;color:var(--text-heading)}.dpit-pf-h small{flex-basis:100%;font-size:11px;color:var(--text-muted)}
.dpit-pf-row{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:10px}.dpit-pf-row.two{grid-template-columns:1fr 1.4fr}
.dpit-empty{padding:22px 10px;text-align:center;color:var(--text-muted);font-size:13px}.dpit-empty svg{display:block;width:26px;height:26px;margin:0 auto 8px;opacity:.5}
@media(max-width:760px){.dpit-ov{padding:0}.dpit-m{border-radius:0;min-height:100%;border:0}.dpit-cols,.dpit-g2{grid-template-columns:minmax(0,1fr)}.dpit-g3{grid-template-columns:repeat(2,minmax(0,1fr))}.dpit-pf-row,.dpit-pf-row.two{grid-template-columns:minmax(0,1fr)}.dpit-sh-top h2{font-size:18px}.dpit-grid{grid-template-columns:minmax(0,1fr)}}`;
        document.head.appendChild(st);
    }

    /* ===================== JANELAS ===================== */
    const stack = [];
    function modal(html, cls) {
        css();
        const ov = document.createElement('div'); ov.className = 'dpit-ov';
        ov.innerHTML = `<div class="dpit-m ${cls || ''}" role="dialog" aria-modal="true">${html}</div>`;
        document.body.appendChild(ov); stack.push(ov);
        ov.addEventListener('mousedown', e => { ov._down = e.target === ov; });
        ov.addEventListener('click', e => { if ((e.target === ov && ov._down) || e.target.closest('[data-x]')) close(ov); });
        return ov;
    }
    function close(ov) { if (!ov || !ov.isConnected) return; ov.remove(); const i = stack.indexOf(ov); if (i >= 0) stack.splice(i, 1); if (typeof ov._onClose === 'function') ov._onClose(); }
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && stack.length) { e.stopPropagation(); close(stack[stack.length - 1]); } }, true);
    const head = (ic, t, s) => `<div class="dpit-mh"><span class="dpit-mi">${I(ic)}</span><div><h3>${esc(t)}</h3>${s ? `<small>${s}</small>` : ''}</div><button type="button" class="dpit-x" data-x aria-label="Fechar">${I('x')}</button></div>`;
    function shrink(file, max = 640) {
        return new Promise((resolve, reject) => {
            const img = new Image(), url = URL.createObjectURL(file);
            img.onload = () => { try { const s = Math.min(1, max / Math.max(img.width, img.height)); const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s)); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', 0.8)); } catch (e) { reject(e); } };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
            img.src = url;
        });
    }
    function openWa(phone, text) {
        const p = waPhone(phone); if (!p) { toast('warning', 'Cliente sem WhatsApp no cadastro.'); return; }
        window.open('https://wa.me/' + p + '?text=' + encodeURIComponent(text), '_blank', 'noopener');
    }
    async function reminderText(it, x) {
        const co = await company(), nm = firstName(it.customerName) || 'tudo bem', t = x.e.type, n = String(x.e.name || '').trim();
        const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
        const quando = x.e.nextDue ? (x.d < 0 ? `venceu no dia ${fmtD(x.e.nextDue)}` : `vence no dia ${fmtD(x.e.nextDue)}`) : (x.e.nextKm ? `está prevista para os ${kmFmt(x.e.nextKm)}` : 'está chegando');
        if (isVeh(it)) {
            const what = { oleo: 'a troca de óleo', revisao: 'a revisão', lavagem: 'a lavagem' }[t] || n || 'o serviço';
            return `Olá, ${nm}! Aqui é da ${co.name}. ${cap(what)} do seu ${title(it)}${it.plate ? ' (placa ' + plateFmt(it.plate) + ')' : ''} ${quando}. Quer agendar um horário?`;
        }
        const pet = (it.sex === 'F' ? 'da ' : 'do ') + (it.name || 'pet');
        const extra = re => n && !re.test(n) ? ` (${n})` : '';
        const what = t === 'vacina' ? `a vacina ${n.replace(/^vacina\s*/i, '')} ${pet}`.replace(/\s+/g, ' ')
            : t === 'vermifugo' ? `o vermífugo ${pet}${extra(/verm/i)}` : t === 'antipulgas' ? `o antipulgas ${pet}${extra(/pulga/i)}`
                : t === 'consulta' ? `o retorno ${pet}` : `${n || 'o cuidado'} ${pet}`;
        return `Olá, ${nm}! Aqui é da ${co.name}. ${cap(what)} ${quando}. Quer agendar? Estamos esperando vocês!`;
    }

    /* ===================== FORMULÁRIO: PET / VEÍCULO ===================== */
    function chooseKind() {
        return new Promise(resolve => {
            const ov = modal(head('plus', 'Cadastrar o quê?') + `<div class="dpit-mb"><div class="dpit-pick"><button type="button" data-k="pet">${avatar({ kind: 'pet' })}<span>Pet<small>Cão, gato, ave...</small></span></button><button type="button" data-k="veiculo">${avatar({ kind: 'veiculo' })}<span>Veículo<small>Carro, moto, caminhonete...</small></span></button></div></div>`, 'small');
            ov._onClose = () => resolve(ov._r || '');
            ov.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { ov._r = b.dataset.k; close(ov); } });
        });
    }
    const seg = (key, opts, val) => `<div class="dpit-seg" data-seg="${key}">${Object.entries(opts).map(([k, l]) => `<button type="button" data-v="${esc(k)}" class="${String(val ?? '') === k ? 'on' : ''}">${esc(l)}</button>`).join('')}</div>`;
    const dl = (id, list) => `<datalist id="${id}">${list.map(x => `<option value="${esc(x)}">`).join('')}</datalist>`;
    async function openForm(it, ctx = {}) {
        let kind = (it && it.kind) || ctx.kind || '';
        if (!kind) { const ks = kindsOn(); kind = ks.length === 1 ? ks[0] : await chooseKind(); if (!kind) return null; }
        const isNew = !it || !it.id, v = kind === 'veiculo';
        const F = { ...(it || {}), kind, alerts: alertsOf(it || {}), photoUrl: (it && it.photoUrl) || '' };
        const cust = { id: (it && it.customerId) || ctx.customerId || '', name: (it && it.customerName) || ctx.customerName || '', phone: (it && it.customerPhone) || ctx.customerPhone || '' };
        if (!cust.id) { toast('warning', 'Escolha o cliente primeiro.'); return null; }
        const pres = v ? VEH_ALERTS : PET_ALERTS;
        const statusOpts = v ? { active: 'Ativo', inactive: 'Não é mais do cliente' } : { active: 'Ativo', inactive: 'Inativo', deceased: 'Falecido' };
        const photo = `<div class="dpit-photo"><span id="fPhoto">${avatar(F)}</span><div class="dpit-photo-acts"><label class="dpit-b sm">${I('camera')} Foto<input type="file" accept="image/*" data-camera-max="900" id="fPhotoIn" hidden></label><button type="button" class="dpit-b sm bad" id="fPhotoRm" ${F.photoUrl ? '' : 'hidden'}>${I('trash-2')} Tirar</button><small>${v ? 'Ajuda a conferir o carro na entrada.' : 'Ajuda a reconhecer o pet no balcão.'}</small></div></div>`;
        const alerts = `<div class="dpit-f"><label>Alertas para a equipe <small style="display:inline;font-weight:500">(aparecem em vermelho)</small></label><div class="dpit-chips" id="fAlerts"></div><div class="dpit-add"><input class="form-control" id="fAlertNew" maxlength="60" placeholder="${v ? 'Outro alerta (ex.: trava antifurto no estepe)' : 'Outro alerta (ex.: só tosa na tesoura)'}"><button type="button" class="dpit-b" id="fAlertAdd">${I('plus')} Incluir</button></div></div>`;
        const body = v ? `${photo}
<div class="dpit-f"><label>Tipo</label>${seg('vtype', VTYPES, F.vtype || 'carro')}</div>
<div class="dpit-g2"><div class="dpit-f"><label>Placa <span id="fPlateReq">*</span></label><input class="form-control" id="fPlate" maxlength="8" autocomplete="off" autocapitalize="characters" placeholder="ABC1D23 ou ABC-1234" value="${esc(F.plate ? plateFmt(F.plate) : '')}" style="text-transform:uppercase;font-weight:700;letter-spacing:.05em"><small id="fPlateMsg"></small></div>
<div class="dpit-f"><label>KM atual</label><input class="form-control" id="fKm" inputmode="numeric" placeholder="Ex.: 85.000" value="${Number(F.lastKm) > 0 ? intFmt(F.lastKm) : ''}"></div></div>
<div class="dpit-g2"><div class="dpit-f"><label>Marca *</label><input class="form-control" id="fBrand" list="dpitBrands" maxlength="40" placeholder="Ex.: Volkswagen" value="${esc(F.brand || '')}">${dl('dpitBrands', BRANDS)}</div>
<div class="dpit-f"><label>Modelo *</label><input class="form-control" id="fModel" maxlength="60" placeholder="Ex.: Gol G5 1.0" value="${esc(F.model || '')}"></div></div>
<div class="dpit-g3"><div class="dpit-f"><label>Ano</label><input class="form-control" id="fYear" maxlength="9" inputmode="numeric" placeholder="2015/2016" value="${esc(F.year || '')}"></div>
<div class="dpit-f"><label>Cor</label><input class="form-control" id="fColor" list="dpitColors" maxlength="20" value="${esc(F.color || '')}">${dl('dpitColors', COLORS)}</div>
<div class="dpit-f"><label>Combustível</label><select class="form-control" id="fFuel"><option value="">—</option>${Object.entries(FUELS).map(([k, l]) => `<option value="${k}" ${F.fuel === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
<div class="dpit-f"><label>Chassi</label><input class="form-control" id="fChassis" maxlength="17" autocomplete="off" placeholder="Opcional" value="${esc(F.chassis || '')}" style="text-transform:uppercase"></div>
${alerts}
<div class="dpit-f"><label>Observações</label><textarea class="form-control" id="fNotes" rows="2" maxlength="400" placeholder="Ex.: usa só óleo sintético; som original">${esc(F.notes || '')}</textarea></div>
${isNew ? '' : `<div class="dpit-f"><label>Situação</label>${seg('status', statusOpts, F.status || 'active')}</div>`}`
            : `${photo}
<div class="dpit-g2"><div class="dpit-f"><label>Nome do pet *</label><input class="form-control" id="fName" maxlength="40" placeholder="Ex.: Thor" value="${esc(F.name || '')}"></div>
<div class="dpit-f"><label>Espécie</label><select class="form-control" id="fSpecies">${Object.entries(SPECIES).map(([k, l]) => `<option value="${k}" ${(F.species || 'cao') === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div></div>
<div class="dpit-g2"><div class="dpit-f"><label>Raça</label><input class="form-control" id="fBreed" list="dpitBreeds" maxlength="40" placeholder="Ex.: Shih-tzu" value="${esc(F.breed || '')}">${dl('dpitBreeds', BREEDS)}</div>
<div class="dpit-f"><label>Porte <small style="display:inline;font-weight:500">(define o preço do banho)</small></label>${seg('size', { P: 'P', M: 'M', G: 'G', GG: 'GG' }, F.size)}</div></div>
<div class="dpit-g3"><div class="dpit-f"><label>Sexo</label>${seg('sex', SEX, F.sex)}</div>
<div class="dpit-f"><label>Nascimento</label><input class="form-control" type="date" id="fBirth" value="${esc(dayOf(F.birthDate))}" max="${today()}"></div>
<div class="dpit-f"><label>Peso (kg)</label><input class="form-control" id="fWeight" inputmode="decimal" placeholder="Ex.: 8,5" value="${Number(F.weightKg) > 0 ? String(F.weightKg).replace('.', ',') : ''}"></div></div>
<div class="dpit-g2"><div class="dpit-f"><label>Pelagem</label>${seg('coat', COATS, F.coat)}</div>
<div class="dpit-f"><label>Castrado</label>${seg('neutered', { sim: 'Sim', nao: 'Não' }, F.neutered === true ? 'sim' : F.neutered === false ? 'nao' : '')}</div></div>
${alerts}
<div class="dpit-g2"><div class="dpit-f"><label>Alergias e remédios</label><input class="form-control" id="fAllergy" maxlength="120" placeholder="Ex.: alergia a shampoo de aveia" value="${esc(F.allergies || '')}"></div>
<div class="dpit-f"><label>Veterinário</label><input class="form-control" id="fVet" maxlength="60" placeholder="Nome ou clínica" value="${esc(F.vetName || '')}"></div></div>
<div class="dpit-f"><label>Observações</label><textarea class="form-control" id="fNotes" rows="2" maxlength="400" placeholder="Ex.: gosta de laço; tutor busca às 17h">${esc(F.notes || '')}</textarea></div>
${isNew ? '' : `<div class="dpit-f"><label>Situação</label>${seg('status', statusOpts, F.status || 'active')}</div>`}`;
        return new Promise(resolve => {
            const ov = modal(head(v ? 'car' : 'paw-print', isNew ? (v ? 'Novo veículo' : 'Novo pet') : (v ? 'Editar veículo' : 'Editar pet'), cust.name ? 'Cliente: ' + esc(cust.name) : '')
                + `<div class="dpit-mb">${body}</div><div class="dpit-mf">${!isNew && boss() ? `<button type="button" class="dpit-b bad" id="fDel">${I('trash-2')} Excluir</button>` : ''}<span class="sp"></span><button type="button" class="dpit-b" data-x>Cancelar</button><button type="button" class="dpit-b pri" id="fSave">${I('check')} ${isNew ? 'Cadastrar' : 'Salvar'}</button></div>`);
            ov._onClose = () => resolve(ov._r || null);
            const q = s => ov.querySelector(s);
            // segmentados (clicar no marcado desmarca, menos tipo e situação)
            ov.querySelectorAll('.dpit-seg').forEach(sg => sg.addEventListener('click', e => {
                const b = e.target.closest('button[data-v]'); if (!b) return;
                const must = ['vtype', 'status'].includes(sg.dataset.seg), was = b.classList.contains('on');
                sg.querySelectorAll('button').forEach(x => x.classList.remove('on'));
                if (!was || must) b.classList.add('on');
                if (sg.dataset.seg === 'vtype') plateReq();
            }));
            const segVal = k => { const b = ov.querySelector(`.dpit-seg[data-seg="${k}"] button.on`); return b ? b.dataset.v : ''; };
            // alertas
            const paintAlerts = () => {
                const all = [...new Set([...pres, ...F.alerts])];
                q('#fAlerts').innerHTML = all.map(a => `<button type="button" data-a="${esc(a)}" class="${F.alerts.includes(a) ? 'on' : ''}">${F.alerts.includes(a) ? I('triangle-alert') : ''}${esc(a)}</button>`).join('');
            };
            q('#fAlerts').addEventListener('click', e => { const b = e.target.closest('[data-a]'); if (!b) return; const a = b.dataset.a; F.alerts = F.alerts.includes(a) ? F.alerts.filter(x => x !== a) : [...F.alerts, a]; paintAlerts(); });
            const addAlert = () => { const t = q('#fAlertNew').value.trim().replace(/\s+/g, ' '); if (!t) return; if (!F.alerts.some(a => norm(a) === norm(t))) F.alerts.push(t); q('#fAlertNew').value = ''; paintAlerts(); };
            q('#fAlertAdd').onclick = addAlert;
            q('#fAlertNew').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addAlert(); } });
            paintAlerts();
            // foto
            q('#fPhotoIn').addEventListener('change', async e => {
                const f = e.target.files && e.target.files[0]; if (!f) return;
                try { F.photoUrl = await shrink(f, 640); q('#fPhoto').innerHTML = avatar(F); q('#fPhotoRm').hidden = false; } catch (er) { toast('error', 'Não foi possível usar essa foto: ' + (window.dpErroHumano ? dpErroHumano(er) : (er && er.message))); }
                e.target.value = '';
            });
            q('#fPhotoRm').onclick = () => { F.photoUrl = ''; q('#fPhoto').innerHTML = avatar(F); q('#fPhotoRm').hidden = true; };
            // placa
            let dup = null;
            function plateReq() { const r = q('#fPlateReq'); if (r) r.textContent = segVal('vtype') === 'outro' ? '' : '*'; }
            if (v) {
                const inp = q('#fPlate'), msg = q('#fPlateMsg');
                let tm = 0;
                const check = async () => {
                    const k = plateKey(inp.value); dup = null; msg.className = ''; msg.textContent = '';
                    if (!k) return;
                    if (k.length >= 7 && !plateOk(k)) { msg.className = 'bad'; msg.textContent = 'Confira a placa: ABC1234 (antiga) ou ABC1D23 (Mercosul).'; return; }
                    if (!plateOk(k)) return;
                    const hit = (await loadIndex()).find(x => isVeh(x) && x.plate === k && x.id !== F.id);
                    if (hit) { dup = hit; msg.className = 'warn'; msg.textContent = hit.customerId === cust.id ? 'Este cliente já tem um veículo com essa placa.' : `Essa placa está no cadastro de ${hit.customerName || 'outro cliente'} (${title(hit)}).`; }
                };
                inp.addEventListener('input', () => { const pos = inp.selectionStart; inp.value = inp.value.toUpperCase().replace(/[^A-Z0-9-]/g, ''); try { inp.setSelectionRange(pos, pos); } catch (e) { } clearTimeout(tm); tm = setTimeout(check, 250); });
                inp.addEventListener('blur', () => { if (plateOk(inp.value)) inp.value = plateFmt(inp.value); check(); });
                q('#fKm').addEventListener('blur', e => { const n = parseNum(e.target.value); if (n) e.target.value = intFmt(n); });
                plateReq(); check();
            }
            // excluir
            if (q('#fDel')) q('#fDel').onclick = async () => {
                if (!confirm(`Excluir ${v ? 'o veículo' : 'o pet'} "${title(F)}"? O histórico continua guardado nas vendas e ordens de serviço.`)) return;
                try { await db.collection(COL).doc(F.id).set({ deleted: true, deletedAt: ts(), deletedBy: uid() }, { merge: true }); remember({ id: F.id, deleted: true }); ov._r = { id: F.id, deleted: true }; close(ov); toast('success', 'Cadastro excluído.'); }
                catch (e) { toast('error', 'Não foi possível excluir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            };
            // salvar
            q('#fSave').onclick = async () => {
                const data = { kind, customerId: cust.id, customerName: cust.name || '', customerPhone: cust.phone || '', alerts: F.alerts.slice(0, 12), photoUrl: F.photoUrl || '', notes: q('#fNotes').value.trim() };
                if (!isNew) data.status = segVal('status') || 'active';
                if (v) {
                    const pk = plateKey(q('#fPlate').value), vt = segVal('vtype') || 'carro';
                    Object.assign(data, { vtype: vt, plate: pk, brand: q('#fBrand').value.trim(), model: q('#fModel').value.trim(), year: q('#fYear').value.trim(), color: q('#fColor').value.trim(), fuel: q('#fFuel').value, chassis: q('#fChassis').value.trim().toUpperCase() });
                    const km = parseNum(q('#fKm').value); if (km !== null && km >= 0) data.lastKm = Math.round(km);
                    if (!data.brand && !data.model) { toast('warning', 'Informe a marca ou o modelo.'); q('#fModel').focus(); return; }
                    if (vt !== 'outro' && !pk) { toast('warning', 'Informe a placa.'); q('#fPlate').focus(); return; }
                    if (pk && !plateOk(pk)) { toast('warning', 'Confira a placa: ABC1234 (antiga) ou ABC1D23 (Mercosul).'); q('#fPlate').focus(); return; }
                    data.name = [data.brand, data.model].filter(Boolean).join(' ');
                    const hit = pk ? (await loadIndex(true)).find(x => isVeh(x) && x.plate === pk && x.id !== F.id) : null;
                    if (hit && hit.customerId === cust.id) { toast('warning', 'Este cliente já tem um veículo com essa placa.'); return; }
                    if (hit) {
                        if (!confirm(`A placa ${plateFmt(pk)} está no cadastro de ${hit.customerName || 'outro cliente'} (${title(hit)}).\n\nO carro mudou de dono? OK passa o veículo (com o histórico) para ${cust.name || 'este cliente'}.`)) return;
                        try { await saveItem(hit.id, { ...data, status: 'active', previousOwners: [...(Array.isArray(hit.previousOwners) ? hit.previousOwners : []), { customerId: hit.customerId || '', customerName: hit.customerName || '', until: today() }] }); ov._r = { ...hit, ...data, id: hit.id }; close(ov); toast('success', 'Veículo passado para ' + (cust.name || 'o cliente') + '.'); }
                        catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
                        return;
                    }
                } else {
                    const nm = q('#fName').value.trim().replace(/\s+/g, ' ');
                    if (!nm) { toast('warning', 'Informe o nome do pet.'); q('#fName').focus(); return; }
                    const w = parseNum(q('#fWeight').value), neu = segVal('neutered');
                    Object.assign(data, { name: nm, species: q('#fSpecies').value || 'cao', breed: q('#fBreed').value.trim(), size: segVal('size'), sex: segVal('sex'), birthDate: q('#fBirth').value || '', weightKg: w && w > 0 ? r2(w) : null, coat: segVal('coat'), neutered: neu === 'sim' ? true : neu === 'nao' ? false : null, allergies: q('#fAllergy').value.trim(), vetName: q('#fVet').value.trim() });
                }
                const btn = q('#fSave'); btn.disabled = true;
                try { const id = await saveItem(isNew ? null : F.id, data); ov._r = { ...F, ...data, id }; close(ov); toast('success', isNew ? (v ? 'Veículo cadastrado.' : `${data.name} ${data.sex === 'F' ? 'cadastrada' : 'cadastrado'}.`) : 'Cadastro atualizado.'); }
                catch (e) { btn.disabled = false; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            };
            setTimeout(() => { const f = q(v ? '#fPlate' : '#fName'); if (f && !matchMedia('(pointer: coarse)').matches) f.focus(); }, 60);
        });
    }

    /* ===================== REGISTRAR APLICAÇÃO / SERVIÇO ===================== */
    async function openEvent(it, preset = {}) {
        const v = isVeh(it);
        const types = Object.entries(EV).filter(([, x]) => !x.kind || x.kind === (v ? 'veiculo' : 'pet'));
        let type = preset.type && EV[preset.type] ? preset.type : (v ? 'oleo' : 'vacina');
        const prods = await eventProducts();
        const REP = [[0, 'Não repete'], [15, '15 dias'], [21, '21 dias'], [30, '30 dias'], [60, '60 dias'], [90, '3 meses'], [180, '6 meses'], [365, '1 ano']];
        return new Promise(resolve => {
            const ov = modal(head(v ? 'wrench' : 'syringe', v ? 'Registrar serviço' : 'Registrar aplicação', esc(short(it) + (it.customerName ? ' · ' + it.customerName : ''))) + `<div class="dpit-mb">
<div class="dpit-f"><label>O que foi feito</label><div class="dpit-types" id="eTypes">${types.map(([k, x]) => `<button type="button" data-t="${k}" style="--c:${x.c}">${I(x.ic)}<span>${esc(x.l)}</span></button>`).join('')}</div></div>
<div class="dpit-g2"><div class="dpit-f"><label id="eNameL">Nome</label><input class="form-control" id="eName" list="dpitSugg" maxlength="80" autocomplete="off"><datalist id="dpitSugg"></datalist></div>
<div class="dpit-f"><label>Data</label><input class="form-control" type="date" id="eDate" value="${esc(preset.appliedAt || today())}" max="${today()}"></div></div>
<div class="dpit-g2">${v ? `<div class="dpit-f"><label>KM no serviço</label><input class="form-control" id="eKm" inputmode="numeric" placeholder="Ex.: 85.000" value="${Number(preset.km || it.lastKm) > 0 ? intFmt(preset.km || it.lastKm) : ''}"></div>` : `<div class="dpit-f" id="eBatchBox"><label>Lote</label><input class="form-control" id="eBatch" maxlength="40" placeholder="Lote do frasco"></div>`}
<div class="dpit-f"><label>${v ? 'Mecânico / responsável' : 'Veterinário / responsável'}</label><input class="form-control" id="eVet" maxlength="60" value="${esc(v ? '' : (it.vetName || ''))}"></div></div>
<div class="dpit-next"><div class="dpit-next-h">${I('calendar-clock')} ${v ? 'Próxima troca / revisão' : 'Próxima dose'}</div><div class="${v ? 'dpit-g3' : 'dpit-g2'}"><div class="dpit-f"><label>Repetir em</label><select class="form-control" id="eRep">${REP.map(([d, l]) => `<option value="${d}">${l}</option>`).join('')}<option value="x">Outra data</option></select></div>
<div class="dpit-f"><label>Data</label><input class="form-control" type="date" id="eNext"></div>${v ? `<div class="dpit-f"><label>Ou aos (KM)</label><input class="form-control" id="eNextKm" inputmode="numeric" placeholder="Ex.: 90.000"></div>` : ''}</div><small>O que vier primeiro. Deixe em branco se não repete.</small></div>
<div class="dpit-f"><label>Observações</label><textarea class="form-control" id="eNotes" rows="2" maxlength="300"></textarea></div></div>
<div class="dpit-mf"><span class="sp"></span><button type="button" class="dpit-b" data-x>Cancelar</button><button type="button" class="dpit-b pri" id="eSave">${I('check')} Registrar</button></div>`);
            ov._onClose = () => resolve(ov._r || null);
            const q = s => ov.querySelector(s);
            let kmTouched = false, nextTouched = false;
            const prodOf = () => prods.find(p => p.itemEventType === type && words(p.name) === words(q('#eName').value)) || null;
            const repDays = () => { const p = prodOf(); if (p && p.repeatDays !== undefined && p.repeatDays !== null && p.repeatDays !== '') return Number(p.repeatDays) || 0; return evOf(type).days || 0; };
            const repKm = () => { const p = prodOf(); return p && Number(p.repeatKm) > 0 ? Number(p.repeatKm) : (evOf(type).km || 0); };
            function setRep(d) { const sel = q('#eRep'); if ([...sel.options].some(o => o.value === String(d))) sel.value = String(d); else { let o = [...sel.options].find(x => x.dataset.c); if (!o) { o = new Option('', ''); o.dataset.c = '1'; sel.insertBefore(o, sel.lastElementChild); } o.value = String(d); o.textContent = plural(d, 'dia', 'dias'); sel.value = String(d); } }
            function calcNext() {
                const r = q('#eRep').value;
                if (r !== 'x' && !nextTouched) q('#eNext').value = Number(r) > 0 ? addDays(q('#eDate').value || today(), Number(r)) : '';
                if (v && !kmTouched) { const km = parseNum(q('#eKm').value), step = repKm(); q('#eNextKm').value = km && step ? intFmt(km + step) : ''; }
            }
            function paintType() {
                ov.querySelectorAll('#eTypes [data-t]').forEach(b => b.classList.toggle('on', b.dataset.t === type));
                const names = [...new Set([...prods.filter(p => p.itemEventType === type).map(p => p.name), ...(SUGG[type] || [])])];
                q('#dpitSugg').innerHTML = names.map(n => `<option value="${esc(n)}">`).join('');
                q('#eNameL').textContent = { vacina: 'Qual vacina', vermifugo: 'Qual vermífugo', antipulgas: 'Qual antipulgas', oleo: 'Óleo / filtro usado', revisao: 'Qual revisão' }[type] || 'Descrição';
                q('#eName').placeholder = (SUGG[type] || [])[0] ? 'Ex.: ' + SUGG[type][0] : '';
                const bb = q('#eBatchBox'); if (bb) bb.style.visibility = type === 'vacina' || type === 'vermifugo' || type === 'antipulgas' ? '' : 'hidden';
                nextTouched = false; setRep(repDays()); calcNext();
            }
            q('#eTypes').addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (!b) return; type = b.dataset.t; if (!preset.name) q('#eName').value = ''; paintType(); });
            q('#eName').addEventListener('change', () => { nextTouched = false; setRep(repDays()); calcNext(); });
            q('#eRep').addEventListener('change', () => { nextTouched = false; if (q('#eRep').value === 'x') { q('#eNext').focus(); return; } calcNext(); });
            q('#eDate').addEventListener('change', calcNext);
            q('#eNext').addEventListener('input', () => { nextTouched = true; q('#eRep').value = 'x'; });
            if (v) { q('#eKm').addEventListener('input', calcNext); q('#eKm').addEventListener('blur', e => { const n = parseNum(e.target.value); if (n) e.target.value = intFmt(n); }); q('#eNextKm').addEventListener('input', () => { kmTouched = true; }); }
            if (preset.name) q('#eName').value = preset.name;
            paintType();
            q('#eSave').onclick = async () => {
                const name = q('#eName').value.trim() || evOf(type).l;
                const km = v ? parseNum(q('#eKm').value) : null;
                if (v && km !== null && Number(it.lastKm) > 0 && km < Number(it.lastKm) - 1000 && !confirm(`O KM informado (${kmFmt(km)}) é menor que o último registrado (${kmFmt(it.lastKm)}). Registrar assim mesmo?`)) return;
                const p = prodOf();
                const ev = { type, name, appliedAt: q('#eDate').value || today(), km, batch: q('#eBatch') ? q('#eBatch').value : '', vetName: q('#eVet').value, notes: q('#eNotes').value, nextDue: q('#eNext').value || '', nextKm: v ? parseNum(q('#eNextKm').value) : null, productId: p ? p.id : '', origin: 'manual', serviceOrderId: preset.serviceOrderId || '' };
                const btn = q('#eSave'); btn.disabled = true;
                try { const id = await addEvent(it, ev); ov._r = { id, ...ev }; close(ov); toast('success', `${name} registrado para ${it.name && !v ? it.name : short(it)}.`); }
                catch (e) { btn.disabled = false; toast('error', 'Não foi possível registrar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            };
            setTimeout(() => { if (!matchMedia('(pointer: coarse)').matches) q('#eName').focus(); }, 60);
        });
    }

    /* ===================== FICHA DO PET / VEÍCULO ===================== */
    const OS_ST = { received: ['Recebido', '#3b82f6'], analyzing: ['Em análise', '#f59e0b'], awaiting_approval: ['Aguardando aprovação', '#8b5cf6'], approved: ['Aprovado', '#10b981'], in_progress: ['Em manutenção', '#3b82f6'], awaiting_parts: ['Aguardando peça', '#f97316'], ready: ['Pronto', '#10b981'], delivered: ['Entregue', '#10b981'], returned: ['Devolvido sem reparo', '#64748b'], cancelled: ['Cancelada', '#ef4444'] };
    const AP_ST = { agendado: 'Agendado', confirmado: 'Confirmado', chegou: 'Chegou', atendendo: 'Atendendo', pronto: 'Pronto', concluido: 'Concluído', faltou: 'Faltou', cancelado: 'Cancelado' };
    async function related(it) {
        const out = { appts: [], sales: [], orders: [] }, cid = it.customerId, nm = words(it.name);
        const q = async (col, f, val) => { try { return docs(await db.collection(col).where(f, '==', val).get()); } catch (e) { return []; } };
        const tasks = [];
        if (cid) {
            tasks.push(q('appointments', 'customerId', cid).then(l => { out.appts = l.filter(a => a.status !== 'bloqueio' && (a.itemId === it.id || (!a.itemId && !isVeh(it) && nm && words(a.itemName).split(' ').includes(nm.split(' ')[0])) || (!a.itemId && isVeh(it) && it.plate && plateKey(a.itemName).includes(it.plate)))); }));
            tasks.push(q('sales', 'customerId', cid).then(l => { out.sales = l.filter(s => s.itemId === it.id); }));
        }
        if (isVeh(it)) tasks.push((async () => {
            const byId = await q('service_orders', 'vehicleId', it.id);
            const extra = it.plate && cid ? (await q('service_orders', 'customerId', cid)).filter(o => !o.vehicleId && plateKey(o.plate || o.serial) === it.plate) : [];
            out.orders = byId.concat(extra.filter(o => !byId.some(x => x.id === o.id))).sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
        })());
        await Promise.all(tasks);
        return out;
    }
    function timeline(it, evs, rel) {
        const rows = [];
        evs.forEach(e => {
            const x = evOf(e.type);
            rows.push({
                at: toMs(e.appliedAt) || toMs(e.createdAt), c: x.c, ic: x.ic,
                t: `${esc(e.name || x.l)}${e.name && e.name !== x.l ? `<span class="dpit-pill" style="--c:${x.c}">${esc(x.l)}</span>` : ''}`,
                s: [e.batch ? 'Lote ' + esc(e.batch) : '', e.km ? kmFmt(e.km) : '', e.nextDue ? 'Próxima: ' + fmtD(e.nextDue) : '', e.nextKm ? 'Próxima aos ' + kmFmt(e.nextKm) : '', e.vetName ? esc(e.vetName) : '', e.saleNumber ? 'Venda ' + saleNum(e) : '', e.notes ? esc(e.notes) : ''].filter(Boolean).join(' · '),
                r: `${fmtD(e.appliedAt)}${e.price ? `<b>${money(e.price)}</b>` : ''}`
            });
        });
        rel.appts.forEach(a => rows.push({ at: toMs(a.date) + (parseInt(String(a.start || '0').replace(':', ''), 10) || 0), c: '#0ea5e9', ic: 'calendar-days', t: esc((a.items || []).map(i => i.name).join(' + ') || 'Atendimento na agenda'), s: [a.start ? 'às ' + esc(a.start) : '', a.professionalName ? 'com ' + esc(firstName(a.professionalName)) : '', esc(AP_ST[a.status] || a.status || '')].filter(Boolean).join(' · '), r: `${fmtD(a.date)}${Number(a.total) ? `<b>${money(a.total)}</b>` : ''}` }));
        rel.sales.forEach(s => rows.push({ at: toMs(s.createdAt), c: '#10b981', ic: 'shopping-bag', t: `Venda ${saleNum(s)}${s.status === 'cancelled' ? '<span class="dpit-pill" style="--c:#ef4444">Cancelada</span>' : ''}`, s: esc((s.items || []).map(i => i.productName).filter(Boolean).slice(0, 6).join(', ')), r: `${fmtD(s.createdAt)}<b>${money(s.total)}</b>` }));
        rel.orders.forEach(o => {
            const st = OS_ST[o.status] || [o.status || '—', '#64748b'], w = warranty(o);
            const parts = Array.isArray(o.items) && o.items.length ? o.items.map(i => i.name).filter(Boolean).join(', ') : (o.partsDescription || '');
            const acts = [`<a class="dpit-b sm" href="ordens-servico.html?os=${encodeURIComponent(o.id)}">${I('external-link')} Abrir OS</a>`];
            if (w.state === 'valid' && !o.isWarranty) acts.push(`<button type="button" class="dpit-b sm" data-ret="${esc(o.id)}">${I('rotate-ccw')} Retorno em garantia</button>`);
            rows.push({
                at: toMs(o.createdAt), c: '#6366f1', ic: 'wrench',
                t: `${osNum(o)} · ${esc(o.serviceDescription || o.problemReported || 'Ordem de serviço')}<span class="dpit-pill" style="--c:${st[1]}">${esc(st[0])}</span>${o.isWarranty ? '<span class="dpit-pill" style="--c:#f59e0b">Garantia</span>' : ''}${w.state === 'valid' ? `<span class="dpit-pill" style="--c:#10b981">${I('shield-check')} Garantia até ${fmtD(w.until)}</span>` : ''}`,
                s: [o.kmIn ? 'Entrada: ' + kmFmt(o.kmIn) : '', parts ? 'Peças: ' + esc(parts) : '', o.technicianName ? esc(o.technicianName) : ''].filter(Boolean).join(' · ') + `<div class="dpit-acts">${acts.join('')}</div>`,
                r: `${fmtD(o.createdAt)}${Number(o.total) ? `<b>${money(o.total)}</b>` : ''}`
            });
        });
        return rows.sort((a, b) => b.at - a.at).slice(0, 120);
    }
    const agendaOn = () => { try { return !!(window.DPAgenda && DPAgenda.cfg && DPAgenda.cfg.enabled) || !!document.querySelector('.sidebar-menu a.menu-item[href="agenda.html"]'); } catch (e) { return false; } };
    async function openItem(ref, opts = {}) {
        let it = typeof ref === 'string' ? await getItem(ref) : ref;
        if (!it) { toast('warning', 'Cadastro não encontrado. Ele pode ter sido excluído.'); return; }
        const ov = modal(`<div class="dpit-load">${I('loader-circle')} Abrindo a ficha...</div>`, 'wide');
        ov._onClose = () => { if (opts.onClose) opts.onClose(); };
        async function draw() {
            const fresh = await getItem(it.id); if (fresh) it = fresh;
            const [evs, rel] = await Promise.all([eventsOf(it.id), related(it)]);
            if (!ov.isConnected) return;
            const v = isVeh(it), du = dues(it, evs), warns = warnText(it), tl = timeline(it, evs, rel), wa = waPhone(it.customerPhone);
            const dlRows = v ? [['Placa', it.plate ? plateTag(it.plate) : '—'], ['Tipo', VTYPES[it.vtype] || 'Carro'], ['Marca', esc(it.brand || '—')], ['Modelo', esc(it.model || '—')], ['Ano', esc(it.year || '—')], ['Cor', esc(it.color || '—')], ['Combustível', esc(FUELS[it.fuel] || '—')], ['Chassi', esc(it.chassis || '—')], ['KM atual', Number(it.lastKm) > 0 ? kmFmt(it.lastKm) + (it.lastKmAt ? ` <small style="color:var(--text-muted);font-weight:500">em ${fmtD(it.lastKmAt)}</small>` : '') : '—'], ['Observações', esc(it.notes || '—')]]
                : [['Espécie', esc(SPECIES[it.species] || '—')], ['Raça', esc(it.breed || '—')], ['Porte', it.size ? esc(it.size + ' · ' + (SIZES[it.size] || '')) : '—'], ['Sexo', esc(SEX[it.sex] || '—')], ['Nascimento', it.birthDate ? `${fmtD(it.birthDate)} <small style="color:var(--text-muted);font-weight:500">(${esc(age(it.birthDate))})</small>` : '—'], ['Peso', Number(it.weightKg) > 0 ? String(it.weightKg).replace('.', ',') + ' kg' : '—'], ['Pelagem', esc(COATS[it.coat] || '—')], ['Castrado', it.neutered === true ? 'Sim' : it.neutered === false ? 'Não' : '—'], ['Veterinário', esc(it.vetName || '—')], ['Observações', esc(it.notes || '—')]];
            const acts = [
                `<button type="button" class="dpit-b pri" data-a="ev">${I(v ? 'wrench' : 'syringe')} ${v ? 'Registrar serviço' : 'Registrar aplicação'}</button>`,
                v ? `<button type="button" class="dpit-b" data-a="os">${I('clipboard-list')} Nova OS para este ${it.vtype === 'moto' ? 'veículo' : 'carro'}</button>` : '',
                `<button type="button" class="dpit-b" data-a="sell">${I('scan-barcode')} Vender no PDV</button>`,
                agendaOn() ? `<button type="button" class="dpit-b" data-a="agenda">${I('calendar-days')} Agendar</button>` : '',
                `<button type="button" class="dpit-b" data-a="print">${I('printer')} ${v ? 'Histórico em A4' : 'Carteirinha de vacinas'}</button>`,
                `<button type="button" class="dpit-b" data-a="edit">${I('pencil')} Editar</button>`
            ].filter(Boolean).join('');
            ov.querySelector('.dpit-m').innerHTML = `<div class="dpit-sh-top">${avatar(it, 'xl')}<div class="tx"><h2>${esc(v ? title(it) : it.name)} ${v ? plateTag(it.plate) : ''}${active(it) ? '' : `<span class="dpit-st">${esc(stLabel(it))}</span>`}</h2>
<div class="dpit-sh-sub">${esc(sub(it)) || (v ? 'Veículo' : 'Pet')}</div>
<div class="dpit-owner">${I('user')} <span>${v ? 'Cliente' : 'Tutor'}: <b>${esc(it.customerName || '—')}</b></span>${it.customerId ? `<a href="clientes.html?id=${encodeURIComponent(it.customerId)}">Abrir ficha do cliente</a>` : ''}${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${I('whatsapp')} WhatsApp</a>` : ''}</div></div><button type="button" class="dpit-x" data-x aria-label="Fechar">${I('x')}</button></div>
<div class="dpit-mb">
${warns.length ? `<div class="dpit-warnbox">${I('triangle-alert')}<div><b>Atenção:</b> ${warns.map(esc).join(' · ')}</div></div>` : ''}
<div class="dpit-acts">${acts}</div>
<div class="dpit-cols"><div style="display:grid;gap:14px;min-width:0">
<div class="dpit-box"><h4>${I('calendar-clock')} ${v ? 'Próximas trocas e revisões' : 'Próximas doses'}</h4>${du.length ? `<div class="dpit-dues">${du.map((x, i) => { const t = dueText(x); return `<div class="dpit-du ${x.st}">${I(evOf(x.e.type).ic)}<div class="t"><b>${esc(t.n)}</b><small>${esc(t.t)}</small></div>${wa && x.st !== 'ok' ? `<button type="button" class="dpit-b sm wa" data-wa="${i}" title="Avisar o cliente no WhatsApp">${I('whatsapp')} Avisar</button>` : ''}</div>`; }).join('')}</div>` : `<div class="dpit-empty">${I('calendar-clock')}Nada programado. Ao registrar ${v ? 'uma troca de óleo ou revisão' : 'uma vacina, vermífugo ou antipulgas'}, a próxima data aparece aqui.</div>`}</div>
<div class="dpit-box"><h4>${I(v ? 'car' : 'paw-print')} Dados</h4><dl class="dpit-dl">${dlRows.map(([a, b]) => `<dt>${a}</dt><dd>${b}</dd>`).join('')}</dl></div></div>
<div class="dpit-box"><h4>${I('history')} Histórico</h4>${tl.length ? `<div class="dpit-tl">${tl.map(r => `<div class="dpit-tl-i"><span class="dpit-tl-ic" style="--c:${r.c}">${I(r.ic)}</span><div class="dpit-tl-tx"><b>${r.t}</b>${r.s ? `<small>${r.s}</small>` : ''}</div><div class="dpit-tl-r">${r.r}</div></div>`).join('')}</div>` : `<div class="dpit-empty">${I('history')}Ainda sem histórico. ${v ? 'As ordens de serviço deste veículo e os serviços registrados aparecem aqui.' : 'Vacinas, banhos, consultas e compras para este pet aparecem aqui.'}</div>`}</div></div></div>`;
            ov.querySelector('.dpit-m').onclick = async e => {
                const b = e.target.closest('[data-a],[data-wa],[data-ret]'); if (!b) return;
                if (b.dataset.wa !== undefined) { const x = du[Number(b.dataset.wa)]; if (x) openWa(it.customerPhone, await reminderText(it, x)); return; }
                if (b.dataset.ret) { const o = rel.orders.find(x => x.id === b.dataset.ret); if (o) openReturn(o, it); return; }
                const a = b.dataset.a;
                if (a === 'ev') { if (await openEvent(it)) draw(); }
                else if (a === 'edit') { const r = await openForm(it); if (r && r.deleted) close(ov); else if (r) draw(); }
                else if (a === 'print') v ? printVehicle(it, evs, rel) : printCard(it, evs);
                else if (a === 'sell') sellFor(it);
                else if (a === 'agenda') location.href = `agenda.html?novo=1&cliente=${encodeURIComponent(it.customerId || '')}&item=${encodeURIComponent(it.id)}&itemNome=${encodeURIComponent(short(it))}`;
                else if (a === 'os') newOsFor(it, ov);
            };
        }
        try { await draw(); } catch (e) { console.warn(e); if (ov.isConnected) ov.querySelector('.dpit-m').innerHTML = head('triangle-alert', 'Não foi possível abrir a ficha') + `<div class="dpit-mb">${esc(e.message || '')}</div>`; }
        return ov;
    }
    function sellFor(it) {
        try {
            sessionStorage.removeItem('dp_quote_to_pdv');
            sessionStorage.setItem('dp_pdv_customer', JSON.stringify({ id: it.customerId, name: it.customerName || 'Cliente', phone: it.customerPhone || '' }));
            sessionStorage.setItem('dp_pdv_item', JSON.stringify({ customerId: it.customerId, itemId: it.id, at: Date.now() }));
        } catch (e) { }
        location.href = 'pdv.html';
    }
    function newOsFor(it, ov) {
        try { sessionStorage.setItem('dp_os_vehicle', JSON.stringify({ customerId: it.customerId, vehicleId: it.id, at: Date.now() })); } catch (e) { }
        if (PAGE === 'ordens-servico' && window.DPOsVeiculo && typeof DPOsVeiculo.newFor === 'function') { if (ov) close(ov); stack.slice().forEach(close); DPOsVeiculo.newFor(it); return; }
        location.href = `ordens-servico.html?cliente=${encodeURIComponent(it.customerId || '')}&veiculo=${encodeURIComponent(it.id)}`;
    }
    // Retorno em garantia (mesma regra do garantias-v1.js): OS nova sem cobrança, ligada à original
    async function openReturn(o, it) {
        const w = warranty(o);
        if (w.state !== 'valid' && !confirm(`A garantia da ${osNum(o)} ${w.state === 'expired' ? 'venceu em ' + fmtD(w.until) : 'não está ativa'}. Abrir a OS de garantia mesmo assim?`)) return;
        const v = isVeh(it);
        const ov = modal(head('rotate-ccw', 'Retorno em garantia · ' + osNum(o), esc([o.customerName, title(it), it.plate ? plateFmt(it.plate) : ''].filter(Boolean).join(' · '))) + `<div class="dpit-mb"><p style="margin:0;font-size:13px;color:var(--text-secondary)">A nova OS é aberta <b>sem cobrança</b> e fica ligada a esta.${w.state === 'valid' ? ` Garantia até <b>${fmtD(w.until)}</b>.` : ''}</p>
<div class="dpit-f"><label>O que aconteceu? *</label><textarea class="form-control" id="rWhy" rows="3" maxlength="400" placeholder="${v ? 'Ex.: o barulho no freio voltou' : 'Ex.: o defeito voltou'}"></textarea></div>
${v ? `<div class="dpit-f"><label>KM de entrada</label><input class="form-control" id="rKm" inputmode="numeric" value="${Number(it.lastKm) > 0 ? intFmt(it.lastKm) : ''}"></div>` : ''}</div>
<div class="dpit-mf"><span class="sp"></span><button type="button" class="dpit-b" data-x>Cancelar</button><button type="button" class="dpit-b pri" id="rOk">${I('check')} Abrir OS de garantia</button></div>`, 'small');
        ov.querySelector('#rOk').onclick = async ev => {
            const why = ov.querySelector('#rWhy').value.trim(); if (!why) { toast('warning', 'Descreva o problema.'); return; }
            const km = v ? parseNum(ov.querySelector('#rKm').value) : null;
            ev.currentTarget.disabled = true;
            try {
                const s = await db.collection('settings').doc(DOC).get(); const seq = (s.exists ? Number((s.data() || {}).serviceOrderSequence || 0) : 0) + 1;
                await db.collection('settings').doc(DOC).set({ serviceOrderSequence: seq }, { merge: true });
                const ref = await db.collection('service_orders').add({
                    customerId: o.customerId || '', customerName: o.customerName || '', deviceType: o.deviceType || '', brand: o.brand || '', model: o.model || '', imei: o.imei || '', serial: o.serial || '', accessories: '', entryCondition: '',
                    problemReported: `Retorno em garantia da ${osNum(o)}: ${why}`, diagnosis: '', serviceDescription: o.serviceDescription || '', partsDescription: '', technicianId: o.technicianId || null, technicianName: o.technicianName || '',
                    laborValue: 0, partsValue: 0, discount: 0, total: 0, status: 'received', statusHistory: [{ status: 'received', label: `OS de garantia aberta (retorno da ${osNum(o)})`, at: new Date().toISOString(), by: uname(), uid: uid() }],
                    warrantyDays: 0, estimatedDate: null, notes: '', isWarranty: true, warrantyOf: o.id, warrantyOfNumber: Number(o.orderNumber || 0), orderNumber: seq, deleted: false, paymentStatus: 'pending', createdAt: ts(), createdBy: uid(), updatedAt: ts(),
                    ...(v ? { vehicleId: it.id, plate: it.plate || '', itemTerm: 'veiculo', kmIn: km && km > 0 ? Math.round(km) : null } : {})
                });
                if (v && km && km > Number(it.lastKm || 0)) { try { await saveItem(it.id, { lastKm: Math.round(km), lastKmAt: today() }); } catch (e) { } }
                close(ov); toast('success', `${osNum({ orderNumber: seq })} de garantia aberta.`);
                location.href = 'ordens-servico.html?os=' + encodeURIComponent(ref.id);
            } catch (e) { ev.currentTarget.disabled = false; toast('error', 'Não foi possível abrir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
    }

    /* ===================== IMPRESSÃO A4 (mesmo modelo da OS em A4) ===================== */
    const A4CSS = `@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:12px;background:#f1f5f9}
.page{max-width:210mm;margin:0 auto;background:#fff;padding:14mm 13mm;min-height:297mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:12px}
.co{display:flex;gap:12px;align-items:center}.co img{max-height:58px;max-width:150px;object-fit:contain}.co h1{margin:0;font-size:19px}.co p{margin:2px 0 0;color:#475569;font-size:10.5px;line-height:1.45}
.doc{text-align:right;white-space:nowrap}.doc .t{font-size:11px;letter-spacing:2px;color:#4f46e5;font-weight:800}.doc .n{font-size:22px;font-weight:900}.doc p{margin:2px 0;color:#475569;font-size:10.5px}
.box{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:repeat(3,1fr);gap:6px 18px;break-inside:avoid}.box h3{grid-column:1/-1;margin:0 0 1px;font-size:9.5px;letter-spacing:1.2px;color:#4f46e5;text-transform:uppercase}
.box .l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}.box .v{font-size:12.5px;font-weight:600;overflow-wrap:anywhere}.box .full{grid-column:1/-1}
.pet{display:flex;gap:14px;align-items:center;grid-column:1/-1}.pet img{width:74px;height:74px;border-radius:50%;object-fit:cover;border:2px solid #e2e8f0}
.alert{grid-column:1/-1;border:1.5px solid #ef4444;color:#b91c1c;border-radius:8px;padding:6px 9px;font-weight:700}
h2{font-size:11px;letter-spacing:1.2px;color:#4f46e5;text-transform:uppercase;margin:18px 0 0}
table{width:100%;border-collapse:collapse;margin-top:6px}th{background:#f8fafc;color:#475569;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:7px 8px;border-bottom:2px solid #e2e8f0}
td{padding:7px 8px;border-bottom:1px solid #eef2f7;vertical-align:top}td.r,th.r{text-align:right;white-space:nowrap}td small{color:#64748b;display:block;font-size:10px}tr:nth-child(even) td{background:#fcfdff}tr{break-inside:avoid}
.empty{color:#94a3b8;font-style:italic;padding:10px 8px}.late{color:#b91c1c;font-weight:700}.soon{color:#b45309;font-weight:700}
.plate{display:inline-block;border:1.5px solid #0f172a;border-top:5px solid #1d4ed8;border-radius:4px;padding:1px 6px;font-family:Consolas,monospace;font-weight:800;letter-spacing:1px}
.sign{display:flex;gap:40px;margin-top:46px}.sign div{flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:5px;font-size:10.5px;color:#475569}
.ft{margin-top:16px;text-align:center;color:#94a3b8;font-size:9.5px}.bar{position:sticky;top:0;background:#0f172a;padding:10px;text-align:center}.bar button{font:700 13px Arial;padding:9px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{padding:0;min-height:0}.bar{display:none}}`;
    async function a4(docTitle, kicker, num, body, sign) {
        const co = await company();
        const w = window.open('', '_blank', 'width=900,height=1000');
        if (!w) { toast('warning', 'Libere as janelas pop-up para imprimir.'); return; }
        const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp, co.email].filter(Boolean).map(esc).join(' · ');
        w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(docTitle)}</title><style>${A4CSS}</style></head><body><div class="bar"><button onclick="window.print()">Imprimir / Salvar PDF</button></div><div class="page">
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div><div class="doc"><div class="t">${esc(kicker)}</div><div class="n">${num}</div><p>Emitido em ${new Date().toLocaleDateString('pt-BR')}</p></div></div>
${body}
${sign ? `<div class="sign">${sign}</div>` : ''}
<div class="ft">${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}${co.address ? ' · ' + esc(co.address) : ''}</div></div></body></html>`);
        w.document.close(); w.focus();
    }
    const fld = (l, v) => v ? `<div><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>` : '';
    function printCard(it, evs) {
        const by = t => evs.filter(e => t.includes(e.type)).sort((a, b) => String(a.appliedAt).localeCompare(String(b.appliedAt)));
        const nextCls = e => { const d = e.nextDue ? daysTo(e.nextDue) : null; return d === null ? '' : d < 0 ? 'late' : d <= 15 ? 'soon' : ''; };
        const table = (rows, kindCol) => rows.length ? `<table><thead><tr><th>Data</th>${kindCol ? '<th>Tipo</th>' : ''}<th>${kindCol ? 'Produto' : 'Vacina'}</th><th>Lote</th><th>Próxima</th><th>Responsável</th></tr></thead><tbody>${rows.map(e => `<tr><td>${fmtD(e.appliedAt)}</td>${kindCol ? `<td>${esc(evOf(e.type).l)}</td>` : ''}<td><b>${esc(e.name)}</b>${e.notes ? `<small>${esc(e.notes)}</small>` : ''}</td><td>${esc(e.batch || '—')}</td><td class="${nextCls(e)}">${e.nextDue ? fmtD(e.nextDue) : '—'}</td><td>${esc(e.vetName || e.createdByName || '')}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum registro.</div>';
        const warns = warnText(it);
        const body = `<div class="box"><h3>Pet</h3><div class="pet">${it.photoUrl ? `<img src="${esc(it.photoUrl)}" alt="">` : ''}<div><div class="l">Nome</div><div class="v" style="font-size:18px;font-weight:900">${esc(it.name || 'Pet')}</div></div></div>
${fld('Espécie', SPECIES[it.species])}${fld('Raça', it.breed)}${fld('Sexo', SEX[it.sex])}${fld('Nascimento', it.birthDate ? fmtD(it.birthDate) + ' (' + age(it.birthDate) + ')' : '')}${fld('Peso', Number(it.weightKg) > 0 ? String(it.weightKg).replace('.', ',') + ' kg' : '')}${fld('Porte', it.size ? it.size + ' · ' + (SIZES[it.size] || '') : '')}${fld('Pelagem', COATS[it.coat])}${fld('Castrado', it.neutered === true ? 'Sim' : it.neutered === false ? 'Não' : '')}${fld('Tutor', it.customerName)}${fld('Telefone', it.customerPhone)}${fld('Veterinário', it.vetName)}
${warns.length ? `<div class="alert">Atenção: ${warns.map(esc).join(' · ')}</div>` : ''}</div>
<h2>Vacinas</h2>${table(by(['vacina']))}
<h2>Vermífugos e antipulgas</h2>${table(by(['vermifugo', 'antipulgas']), true)}
${by(['consulta', 'exame', 'outro']).length ? `<h2>Consultas, exames e outros</h2>${table(by(['consulta', 'exame', 'outro']), true)}` : ''}`;
        a4(`Carteirinha - ${it.name || 'Pet'}`, 'CARTEIRA DE VACINAÇÃO', esc(it.name || 'Pet'), body, `<div>Responsável técnico</div><div>${esc(it.customerName || 'Tutor')}</div>`);
    }
    function printVehicle(it, evs, rel) {
        const orders = rel.orders.slice().sort((a, b) => toMs(a.createdAt) - toMs(b.createdAt));
        const du = dues(it, evs);
        const warns = warnText(it);
        const body = `<div class="box"><h3>Veículo</h3>${fld('Marca / modelo', title(it))}<div><div class="l">Placa</div><div class="v">${it.plate ? `<span class="plate">${esc(plateFmt(it.plate))}</span>` : '—'}</div></div>${fld('Ano', it.year)}${fld('Cor', it.color)}${fld('Combustível', FUELS[it.fuel])}${fld('Chassi', it.chassis)}${fld('KM atual', Number(it.lastKm) > 0 ? kmFmt(it.lastKm) : '')}${fld('Cliente', it.customerName)}${fld('Telefone', it.customerPhone)}
${warns.length ? `<div class="alert">Atenção: ${warns.map(esc).join(' · ')}</div>` : ''}</div>
${du.length ? `<h2>Próximas trocas e revisões</h2><table><thead><tr><th>Serviço</th><th>Quando</th></tr></thead><tbody>${du.map(x => { const t = dueText(x); return `<tr><td><b>${esc(t.n)}</b></td><td class="${x.st === 'late' ? 'late' : x.st === 'soon' ? 'soon' : ''}">${esc(t.t)}</td></tr>`; }).join('')}</tbody></table>` : ''}
<h2>Ordens de serviço</h2>${orders.length ? `<table><thead><tr><th>Data</th><th>OS</th><th class="r">KM</th><th>Serviço e peças</th><th>Mecânico</th><th class="r">Valor</th><th>Garantia</th></tr></thead><tbody>${orders.map(o => { const w = warranty(o); const parts = Array.isArray(o.items) && o.items.length ? o.items.map(i => `${(Number(i.qty) || 1).toLocaleString('pt-BR')}x ${i.name}`).join(', ') : (o.partsDescription || ''); return `<tr><td>${fmtD(o.createdAt)}</td><td><b>${esc(osNum(o))}</b>${o.isWarranty ? '<small>retorno em garantia</small>' : ''}</td><td class="r">${o.kmIn ? intFmt(o.kmIn) : '—'}</td><td><b>${esc(o.serviceDescription || o.problemReported || '')}</b>${parts ? `<small>${esc(parts)}</small>` : ''}</td><td>${esc(o.technicianName || '')}</td><td class="r">${money(o.total)}</td><td>${w.state === 'valid' ? 'até ' + fmtD(w.until) : w.state === 'expired' ? 'vencida' : '—'}</td></tr>`; }).join('')}</tbody></table>` : '<div class="empty">Nenhuma ordem de serviço.</div>'}
<h2>Serviços registrados</h2>${evs.length ? `<table><thead><tr><th>Data</th><th>Serviço</th><th class="r">KM</th><th>Próxima</th><th>Obs.</th></tr></thead><tbody>${evs.slice().reverse().map(e => `<tr><td>${fmtD(e.appliedAt)}</td><td><b>${esc(e.name)}</b><small>${esc(evOf(e.type).l)}</small></td><td class="r">${e.km ? intFmt(e.km) : '—'}</td><td>${[e.nextDue ? fmtD(e.nextDue) : '', e.nextKm ? kmFmt(e.nextKm) : ''].filter(Boolean).join(' ou ') || '—'}</td><td>${esc([e.vetName, e.notes].filter(Boolean).join(' · '))}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">Nenhum serviço registrado.</div>'}`;
        a4(`Histórico - ${plateFmt(it.plate) || title(it)}`, 'HISTÓRICO DO VEÍCULO', it.plate ? `<span class="plate">${esc(plateFmt(it.plate))}</span>` : esc(title(it)), body, '');
    }

    /* ===================== CARTÕES (aba da ficha do cliente) ===================== */
    function card(it, evs) {
        const al = warnText(it), all = dues(it, evs), du = all.filter(x => x.st !== 'ok').slice(0, 2), nx = du.length ? du : all.slice(0, 1);
        return `<article class="dpit-card ${active(it) ? '' : 'off'}" data-open="${esc(it.id)}">
<div class="dpit-card-h">${avatar(it)}<div class="tx"><b>${esc(isVeh(it) ? title(it) : it.name)}</b>${isVeh(it) ? plateTag(it.plate) : ''}<small>${esc(sub(it)) || '&nbsp;'}</small></div>${active(it) ? '' : `<span class="dpit-st">${esc(stLabel(it))}</span>`}</div>
${al.length ? `<div class="dpit-alerts">${al.map(a => `<span class="dpit-al">${I('triangle-alert')}${esc(a)}</span>`).join('')}</div>` : ''}
${active(it) ? nx.map(x => { const t = dueText(x); return `<div class="dpit-due ${x.st}">${I(evOf(x.e.type).ic)}<span><b>${esc(t.n)}</b> ${esc(t.t)}</span></div>`; }).join('') : ''}
<div class="dpit-card-f"><button type="button" class="dpit-b sm" data-open="${esc(it.id)}">${I('id-card')} Abrir ficha</button>${active(it) ? `<button type="button" class="dpit-b sm" data-ev="${esc(it.id)}">${I(isVeh(it) ? 'wrench' : 'syringe')} ${isVeh(it) ? 'Registrar serviço' : 'Registrar aplicação'}</button>` : ''}</div></article>`;
    }
    let tabCtx = null;
    async function renderTab(body, c, after) {
        css(); tabCtx = { body, c, after };
        body.innerHTML = `<div class="cli-sec dpit-tab"><div class="dpit-load">${I('loader-circle')} Carregando...</div></div>`;
        const [items, evs] = await Promise.all([itemsOf(c.id), eventsOfCustomer(c.id)]);
        if (!body.isConnected) return;
        const T = term(items), on = kindsOn();
        const canPet = on.includes('pet') || items.some(x => !isVeh(x)), canVeh = on.includes('veiculo') || items.some(isVeh);
        const btns = [canPet ? `<button type="button" class="dpit-b pri sm" data-new="pet">${I('plus')} Novo pet</button>` : '', canVeh ? `<button type="button" class="dpit-b ${canPet ? '' : 'pri'} sm" data-new="veiculo">${I('plus')} Novo veículo</button>` : ''].join('');
        const act = items.filter(active), old = items.filter(x => !active(x));
        const byItem = new Map(); evs.forEach(e => { if (!byItem.has(e.itemId)) byItem.set(e.itemId, []); byItem.get(e.itemId).push(e); });
        body.innerHTML = `<div class="cli-sec dpit-tab"><div class="cli-sec-h"><h3>${I(T.ic)} ${esc(T.title)} do cliente</h3><span class="sp"></span>${btns}</div>
${act.length ? `<div class="dpit-grid">${act.map(it => card(it, byItem.get(it.id) || [])).join('')}</div>` : `<div class="dpit-empty">${I(T.ic)}Nenhum ${T.one} cadastrado ainda.${canPet && !canVeh ? ' Cadastre o pet com porte, raça e alertas (ex.: morde) para a equipe saber no balcão.' : canVeh && !canPet ? ' Cadastre o carro pela placa: as ordens de serviço e as trocas de óleo ficam no histórico dele.' : ''}</div>`}
${old.length ? `<details class="dpit-old"><summary>${plural(old.length, 'cadastro inativo', 'cadastros inativos')}</summary><div class="dpit-grid">${old.map(it => card(it, byItem.get(it.id) || [])).join('')}</div></details>` : ''}</div>`;
        const box = body.querySelector('.dpit-tab');
        const redraw = () => { renderTab(body, c, after); if (after) after(); };
        box.addEventListener('click', async e => {
            const n = e.target.closest('[data-new]'), ev = e.target.closest('[data-ev]'), op = e.target.closest('[data-open]');
            const ctx = { customerId: c.id, customerName: c.name, customerPhone: c.whatsapp || c.phone || '' };
            if (n) { if (await openForm(null, { ...ctx, kind: n.dataset.new })) redraw(); return; }
            if (ev) { const it = items.find(x => x.id === ev.dataset.ev); if (it && await openEvent(it)) redraw(); return; }
            if (op) { openItem(op.dataset.open, { onClose: redraw }); }
        });
    }

    /* ===================== CLIENTES ===================== */
    let lastFind = new Map();
    // Busca de clientes pelo nome do pet ou pela placa. Devolve Map(clienteId -> texto já escapado para HTML).
    function findCustomers(raw) {
        const out = new Map(); lastFind = new Map();
        if (!index) { loadIndex(); return out; }
        const q = words(raw), pk = plateKey(raw);
        if (q.length < 2 && pk.length < 3) return out;
        for (const it of index) {
            if (!it.customerId) continue;
            let hit = false;
            if (isVeh(it)) hit = (pk.length >= 3 && /[0-9]/.test(pk) && String(it.plate || '').includes(pk)) || (pk.length >= 6 && plateKey(it.chassis).includes(pk)) || (q.length >= 3 && words([it.brand, it.model].join(' ')).includes(q));
            else hit = q.length >= 2 && words(it.name).includes(q);
            if (!hit || out.has(it.customerId)) continue;
            out.set(it.customerId, isVeh(it) ? esc([it.model || it.brand, it.plate ? plateFmt(it.plate) : ''].filter(Boolean).join(' ')) : 'pet ' + esc(it.name));
            lastFind.set(it.customerId, it.id);
        }
        return out;
    }
    function setupClientes() {
        if (!$('cliRoot')) return;
        window.DPClientFind = raw => { const m = findCustomers(raw); const t = new Map(); m.forEach((v, k) => t.set(k, v.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'"))); return t; };
        const curId = () => { try { return new URLSearchParams(location.search).get('id') || ''; } catch (e) { return ''; } };
        const count = cid => { if (!index) return ''; const n = cached(cid).filter(active).length; return n || ''; };
        window.DPClientTabs = window.DPClientTabs || [];
        if (!window.DPClientTabs.some(t => t.id === 'itens')) window.DPClientTabs.push({
            id: 'itens',
            get icon() { return term(cached(curId())).fa; },
            get label() { return term(cached(curId())).title; },
            show: D => kindsOn().length > 0 || cached(D && D.c ? D.c.id : curId()).length > 0,
            count: D => count(D && D.c ? D.c.id : curId()),
            render: (body, D) => { if (D && D.c) renderTab(body, D.c, () => { syncTab(); hero(true); }); }
        });
        function syncTab() {
            const tabs = $('cliTabs'), cid = curId(); if (!tabs || !cid) return;
            let b = tabs.querySelector('[data-tab="itens"]');
            const should = kindsOn().length > 0 || cached(cid).length > 0;
            if (!b && should) { b = document.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.dataset.tab = 'itens'; tabs.appendChild(b); }
            if (!b) return;
            const T = term(cached(cid)), n = count(cid);
            const html = `<i class="fas ${T.fa}"></i>${esc(T.title)}${n !== '' ? `<span class="n">${n}</span>` : ''}`;
            if (b.dataset.sig !== html) { b.dataset.sig = html; b.innerHTML = html; }
        }
        // Chips do pet/veículo no topo da ficha (com o alerta em vermelho)
        function hero(force) {
            const h = document.querySelector('#cliDetail .cli-hero .cli-hero-info'), cid = curId();
            if (!h || !cid) return;
            let box = h.querySelector('.dpit-hero');
            if (box && !force && box.dataset.cid === cid) return;
            if (!box) { box = document.createElement('div'); box.className = 'dpit-hero'; const tags = h.querySelector('.cli-tags'); if (tags) tags.insertAdjacentElement('afterend', box); else h.appendChild(box); }
            box.dataset.cid = cid;
            const list = cached(cid).filter(active);
            box.innerHTML = list.map(it => { const w = warnText(it); return `<button type="button" class="dpit-chip ${w.length ? 'bad' : ''}" data-open="${esc(it.id)}" title="${esc(w.join(' · ') || 'Abrir a ficha')}">${I(icOf(it))}<span>${esc(short(it))}</span>${w.length ? `<span class="warn">${I('triangle-alert')}</span>` : ''}</button>`; }).join('');
            box.hidden = !list.length;
        }
        document.addEventListener('click', e => {
            const b = e.target.closest('.dpit-hero [data-open]'); if (!b) return;
            openItem(b.dataset.open, { onClose: () => { hero(true); syncTab(); if (tabCtx && tabCtx.body.isConnected && document.querySelector('#cliTabs [data-tab="itens"].on')) renderTab(tabCtx.body, tabCtx.c, tabCtx.after); } });
        });
        function ph() { const qi = $('cliQ'), on = kindsOn(); if (!qi || !on.length) return; const want = `Buscar por nome, telefone, CPF/CNPJ${on.includes('pet') ? ', nome do pet' : ''}${on.includes('veiculo') ? ', placa' : ''} ou cidade...`; if (qi.placeholder !== want) qi.placeholder = want; }
        let t = 0;
        const mo = new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { hero(); syncTab(); ph(); }, 60); });
        const start = () => { const r = $('cliRoot'); if (r) mo.observe(r, { childList: true, subtree: true }); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
        listeners.add(() => {
            hero(true); syncTab(); ph();
            const q = $('cliQ'); if (q && q.value.trim() && !q.dataset.dpitRan) { q.dataset.dpitRan = '1'; q.dispatchEvent(new Event('input', { bubbles: true })); setTimeout(() => { delete q.dataset.dpitRan; }, 500); }
        });
        loadIndex();
    }

    /* ===================== PDV ===================== */
    function setupPdv() {
        if (!$('selectedCustomerBadge') || !$('btnFinalize') || window.__dpitPdv) return;
        window.__dpitPdv = true; css();
        const G = {
            get cid() { try { return selectedCustomerId || null; } catch (e) { return null; } },
            get cname() { try { return selectedCustomerNameVal || ''; } catch (e) { return ''; } },
            get cart() { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } },
            get products() { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } },
            phone(cid) { try { const c = (allPdvCustomers || []).find(x => String(x.id) === String(cid)); return c ? (c.whatsapp || c.phone || '') : ''; } catch (e) { return ''; } }
        };
        const S = { cid: null, items: [], chosen: null, seq: 0, warned: false };
        const box = document.createElement('div'); box.id = 'dpitPdv'; box.className = 'dpit-pdv'; box.hidden = true;
        $('selectedCustomerBadge').insertAdjacentElement('afterend', box);
        function paint() {
            const its = S.items, on = kindsOn();
            if (!S.cid || (!its.length && !on.length)) { box.hidden = true; box.innerHTML = ''; return; }
            const T = term(its), ch = S.chosen, w = ch ? warnText(ch) : [];
            box.hidden = false;
            box.innerHTML = `<div class="dpit-pdv-h">${I(T.ic)}<span>Para qual ${esc(T.one)}?</span></div>
<div class="dpit-pdv-chips">${its.map(it => { const ww = warnText(it); return `<button type="button" class="dpit-chip ${ch && ch.id === it.id ? 'on' : ''}" data-id="${esc(it.id)}" title="${esc(ww.join(' · ') || sub(it))}">${I(icOf(it))}<span>${esc(short(it))}</span>${ww.length ? `<span class="warn">${I('triangle-alert')}</span>` : ''}</button>`; }).join('')}${on.length ? `<button type="button" class="dpit-chip ghost" data-new title="Cadastrar ${esc(T.one)} deste cliente">${I('plus')}<span>${its.length ? 'Novo' : 'Cadastrar ' + esc(T.one)}</span></button>` : ''}</div>
${w.length ? `<div class="dpit-pdv-al">${I('triangle-alert')}<span><b>${esc(ch.name || short(ch))}:</b> ${esc(w.join(' · '))}</span></div>` : ''}`;
        }
        box.addEventListener('click', async e => {
            const c = e.target.closest('[data-id]');
            if (c) { const it = S.items.find(x => x.id === c.dataset.id); S.chosen = S.chosen && S.chosen.id === c.dataset.id ? null : it || null; paint(); return; }
            if (e.target.closest('[data-new]') && S.cid) {
                const r = await openForm(null, { customerId: S.cid, customerName: G.cname, customerPhone: G.phone(S.cid) });
                if (r && r.id) { S.items = (await itemsOf(S.cid)).filter(active); S.chosen = S.items.find(x => x.id === r.id) || null; paint(); }
            }
        });
        async function preselect(cid) {
            let pre = '';
            if (lastFind.has(cid)) pre = lastFind.get(cid);
            try { const p = JSON.parse(sessionStorage.getItem('dp_pdv_item') || 'null'); if (p && p.customerId === cid && Date.now() - Number(p.at || 0) < 600000) { pre = p.itemId; sessionStorage.removeItem('dp_pdv_item'); } } catch (e) { }
            if (!pre) {
                try {
                    const q = JSON.parse(sessionStorage.getItem('dp_quote_to_pdv') || 'null');
                    if (q && q.customerId === cid) {
                        if (q.itemId) pre = q.itemId;
                        else if (q.appointmentId) { const s = await db.collection('appointments').doc(q.appointmentId).get(); const a = s.exists ? (s.data() || {}) : {}; if (a.itemId) pre = a.itemId; else if (a.itemName) { const n = words(a.itemName), pk = plateKey(a.itemName); const hit = S.items.find(x => isVeh(x) ? (x.plate && pk.includes(x.plate)) : (words(x.name) && n.split(' ').includes(words(x.name).split(' ')[0]))); if (hit) pre = hit.id; } }
                    }
                } catch (e) { }
            }
            return pre;
        }
        async function refresh() {
            const cid = G.cid ? String(G.cid) : null;
            if (cid === S.cid) return;
            S.cid = cid; S.chosen = null; S.items = []; const my = ++S.seq;
            if (!cid) return paint();
            S.items = cached(cid).filter(active); paint();
            if (!kindsOn().length && index && !S.items.length) return; // ramo sem pets/veículos e cliente sem cadastro: nem consulta
            const list = (await itemsOf(cid)).filter(active); if (my !== S.seq) return;
            S.items = list;
            const pre = await preselect(cid); if (my !== S.seq) return;
            if (pre) S.chosen = S.items.find(x => x.id === pre) || null;
            paint();
        }
        const nameEl = $('selectedCustomerName');
        if (nameEl) new MutationObserver(() => setTimeout(refresh, 0)).observe(nameEl, { childList: true, characterData: true, subtree: true });
        setInterval(() => { if ((G.cid ? String(G.cid) : null) !== S.cid) refresh(); }, 1500);
        listeners.add(() => { if (S.cid && !S.items.length) { S.items = cached(S.cid).filter(active); paint(); } });
        refresh();

        // Produtos que geram lembrete: quem precisa de pet/veículo
        const evProd = id => { const p = G.products.find(x => x.id === id); return p && p.itemEventType && EV[p.itemEventType] ? p : null; };
        function askItem(cand, names) {
            return new Promise(resolve => {
                const T = term(cand);
                const ov = modal(head(T.ic, `Para qual ${T.one}?`, esc(names.join(', ')) + ' fica registrado na ficha, com a próxima data.') + `<div class="dpit-mb"><div class="dpit-pick">${cand.map(it => `<button type="button" data-id="${esc(it.id)}">${avatar(it)}<span>${esc(short(it))}<small>${esc(sub(it))}</small></span></button>`).join('')}<button type="button" data-id="">${I('x')}<span>Nenhum<small>Só vender, sem registrar na ficha</small></span></button></div></div>`, 'small');
                ov._onClose = () => resolve(ov._r);
                ov.addEventListener('click', e => { const b = e.target.closest('.dpit-pick [data-id]'); if (!b) return; ov._r = b.dataset.id ? cand.find(x => x.id === b.dataset.id) : null; close(ov); });
            });
        }
        const oFin = window.finalizeSale;
        if (typeof oFin === 'function' && !oFin.__dpit) {
            const w = async function () {
                try {
                    const need = G.cart.map(c => evProd(c.productId)).filter(Boolean);
                    if (need.length && S.cid && !S.chosen) {
                        const kinds = new Set(need.map(p => EV[p.itemEventType].kind).filter(Boolean));
                        const cand = S.items.filter(x => !kinds.size || kinds.has(x.kind));
                        if (cand.length === 1) { S.chosen = cand[0]; paint(); }
                        else if (cand.length > 1) { const r = await askItem(cand, [...new Set(need.map(p => p.name))]); if (r === undefined) return; S.chosen = r; paint(); }
                    } else if (need.length && !S.cid && !S.warned) { S.warned = true; toast('info', 'Dica: escolha o cliente e o pet/veículo para a próxima data ficar registrada na ficha.'); }
                } catch (e) { console.warn('pets/veículos', e); }
                return oFin.apply(this, arguments);
            };
            w.__dpit = true; window.finalizeSale = w;
        }
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function' && !SalesService.__dpit) {
            SalesService.__dpit = true;
            const oc = SalesService.create;
            SalesService.create = async function (data) {
                let it = null;
                try { if (data && S.chosen && data.customerId && String(data.customerId) === S.cid) { it = S.chosen; data.itemId = it.id; data.itemName = short(it); data.itemKind = it.kind || 'pet'; if (isVeh(it) && it.plate) data.plate = it.plate; } } catch (e) { }
                const r = await oc.apply(this, arguments);
                if (it && r && r.id) { try { await autoEvents(it, data, r); } catch (e) { console.warn('Lembrete não registrado', e); } }
                return r;
            };
        }
        async function autoEvents(it, data, r) {
            const done = [];
            for (const line of (data.items || [])) {
                const p = evProd(line.productId); if (!p) continue;
                const t = p.itemEventType, x = EV[t]; if (x.kind && x.kind !== (it.kind || 'pet')) continue;
                const days = p.repeatDays !== undefined && p.repeatDays !== null && p.repeatDays !== '' ? Number(p.repeatDays) || 0 : (x.days || 0);
                const step = Number(p.repeatKm) > 0 ? Number(p.repeatKm) : (x.km || 0), km = isVeh(it) && Number(it.lastKm) > 0 ? Number(it.lastKm) : null;
                const nextDue = days > 0 ? addDays(today(), days) : '';
                await addEvent(it, { type: t, name: p.eventName || p.name, appliedAt: today(), km, nextDue, nextKm: km && step ? km + step : null, productId: p.id, saleId: r.id, saleNumber: r.saleNumber || null, price: line.total, origin: 'pdv' });
                done.push(`${p.name}${nextDue ? ' (próxima em ' + fmtD(nextDue) + ')' : ''}`);
            }
            if (done.length) toast('success', `Registrado na ficha de ${it.name && !isVeh(it) ? it.name : short(it)}: ${done.join(', ')}.`);
        }

        // Cartões do PDV: aplicação e local da peça
        const decorate = () => {
            const grid = $('productsGrid'); if (!grid) return;
            grid.querySelectorAll('.product-card').forEach(cd => {
                if (cd.querySelector('.dpit-pinfo')) return;
                const id = cd.dataset.pid || ((cd.getAttribute('onclick') || '').match(/addToCart\('([^']+)'\)/) || [])[1]; if (!id) return;
                const p = G.products.find(x => x.id === id); const info = p && prodInfo(p); if (!info) return;
                const at = cd.querySelector('.p-code') || cd.querySelector('.p-name'); if (!at) return;
                const d = document.createElement('div'); d.className = 'dpit-pinfo'; d.innerHTML = info; at.insertAdjacentElement('afterend', d);
            });
        };
        const oRP = window.renderProducts;
        if (typeof oRP === 'function' && !oRP.__dpit) { const w = function () { const r = oRP.apply(this, arguments); try { decorate(); } catch (e) { } return r; }; w.__dpit = true; window.renderProducts = w; }
        setTimeout(decorate, 1500);
    }

    /* ===================== AGENDA: "Pet, veículo ou detalhe" com os do cliente ===================== */
    const agLabel = it => isVeh(it) ? [it.model || it.brand || 'Veículo', it.plate ? plateFmt(it.plate) : ''].filter(Boolean).join(' · ')
        : `${it.name || 'Pet'}${[it.breed || SPECIES[it.species] || '', it.size ? 'porte ' + it.size : ''].filter(Boolean).length ? ' (' + [it.breed || SPECIES[it.species] || '', it.size ? 'porte ' + it.size : ''].filter(Boolean).join(', ') + ')' : ''}`;
    function agendaChips(input, cid, initialId, F) {
        if (!input) return;
        css();
        let box = input.parentElement.querySelector('.dpit-agchips');
        if (!box) {
            box = document.createElement('div'); box.className = 'dpit-agchips dpit-pdv'; box.style.marginTop = '6px'; input.insertAdjacentElement('afterend', box);
            if (initialId) input.dataset.itemId = initialId;
            input.addEventListener('input', () => { input.dataset.itemId = ''; box.querySelectorAll('.dpit-chip.on').forEach(c => c.classList.remove('on')); });
        }
        if (box.dataset.cid && box.dataset.cid !== (cid || '')) { if (input.dataset.itemId) { input.dataset.itemId = ''; input.value = ''; } }
        box.dataset.cid = cid || '';
        let list = [];
        const paint = () => {
            if (box.dataset.cid !== (cid || '')) return;
            const on = kindsOn();
            if (!cid || (!list.length && !on.length)) { box.hidden = true; box.innerHTML = ''; return; }
            const T = term(list), cur = list.find(x => x.id === input.dataset.itemId), w = cur ? warnText(cur) : [];
            box.hidden = false;
            box.innerHTML = `<div class="dpit-pdv-chips">${list.map(it => `<button type="button" class="dpit-chip ${cur && cur.id === it.id ? 'on' : ''}" data-id="${esc(it.id)}">${I(icOf(it))}<span>${esc(short(it))}</span>${warnText(it).length ? `<span class="warn">${I('triangle-alert')}</span>` : ''}</button>`).join('')}${on.length ? `<button type="button" class="dpit-chip" data-new>${I('plus')}<span>Novo ${esc(T.one)}</span></button>` : ''}</div>${w.length ? `<div class="dpit-pdv-al">${I('triangle-alert')}<span><b>${esc(cur.name || short(cur))}:</b> ${esc(w.join(' · '))}</span></div>` : ''}`;
        };
        const pick = it => { input.value = agLabel(it); input.dataset.itemId = it.id; paint(); };
        box.onclick = async e => {
            const c = e.target.closest('[data-id]');
            if (c) { const it = list.find(x => x.id === c.dataset.id); if (!it) return; if (input.dataset.itemId === it.id) { input.dataset.itemId = ''; input.value = ''; paint(); } else pick(it); return; }
            if (e.target.closest('[data-new]')) {
                const r = await openForm(null, { customerId: cid, customerName: (F && F.customerName) || '', customerPhone: (F && F.customerPhone) || '' });
                if (r && r.id) { list = (await itemsOf(cid)).filter(active); const it = list.find(x => x.id === r.id); if (it) pick(it); else paint(); }
            }
        };
        if (!cid) { paint(); return; }
        list = cached(cid).filter(active); paint();
        itemsOf(cid).then(l => {
            list = l.filter(active);
            if (list.length === 1 && !input.value.trim() && !input.dataset.itemId && kindsOn().length) pick(list[0]); else paint();
        });
    }

    /* ===================== BUSCA DE PEÇA (aplicação e referência) ===================== */
    function prodMatch(p, q) {
        if (!p) return false;
        const toks = words(q).split(' ').filter(Boolean); if (!toks.length) return false;
        const extra = p.reference || p.application;
        if (toks.length < 2 && !extra) return false;
        const hay = ' ' + words([p.name, p.code, p.barcode, p.brand, p.reference, p.application, p.stockLocation].join(' ')) + ' ';
        if (toks.every(t => hay.includes(t))) return true;
        const cq = compact(q);
        return !!(p.reference && cq.length >= 3 && String(p.reference).split(/[,;\n/]+/).some(r => compact(r).includes(cq)));
    }
    function prodInfo(p) {
        if (!p) return '';
        const parts = [];
        if (p.application) parts.push(`<b>Aplica:</b> ${esc(String(p.application).slice(0, 90))}`);
        if (p.reference) parts.push(`<b>Ref.:</b> ${esc(String(p.reference).slice(0, 50))}`);
        if (p.stockLocation && (parts.length || vehOn())) parts.push(`<b>Local:</b> ${esc(p.stockLocation)}`);
        return parts.join(' · ');
    }
    // Lista de OS: placa digitada com ou sem traço
    function osMatch(o, q) { const k = plateKey(q); if (k.length < 3 || !/[0-9]/.test(k)) return false; return plateKey(o.plate).includes(k) || (!!o.vehicleId && plateKey(o.serial).includes(k)); }

    /* ===================== PRODUTOS: lembrete, referência e aplicação ===================== */
    function setupProducts(tries) {
        if (!$('productModal') || !$('prodUnit') || $('dpitProdFields')) return;
        const anchor = $('dpfTypeGroup');
        if (!anchor) { if ((tries || 0) < 40) setTimeout(() => setupProducts((tries || 0) + 1), 250); return; }
        css();
        const evOpts = `<optgroup label="Pet">${Object.entries(EV).filter(([, x]) => x.kind === 'pet').map(([k, x]) => `<option value="${k}">${x.l}</option>`).join('')}</optgroup><optgroup label="Veículo">${Object.entries(EV).filter(([, x]) => x.kind === 'veiculo').map(([k, x]) => `<option value="${k}">${x.l}</option>`).join('')}</optgroup><option value="outro">Outro</option>`;
        const g = document.createElement('div'); g.id = 'dpitProdFields'; g.className = 'form-group dpit-pf'; g.style.gridColumn = '1/-1';
        g.innerHTML = `<div class="dpit-pf-box" id="dpitPfEv" hidden><div class="dpit-pf-h">${I('calendar-clock')}<b>Lembrete de recompra</b><small>Vacina, vermífugo, antipulgas, troca de óleo, revisão... Vendido para um pet ou veículo, a próxima data entra sozinha na ficha dele.</small></div>
<div class="dpit-pf-row"><div><label class="form-label">Gera lembrete de</label><select id="dpitEvType" class="form-control"><option value="">Não gera lembrete</option>${evOpts}</select></div><div><label class="form-label">Repetir a cada (dias)</label><input id="dpitRepDays" type="number" min="0" step="1" class="form-control" placeholder="Ex.: 365"></div><div id="dpitRepKmBox"><label class="form-label">Ou a cada (km)</label><input id="dpitRepKm" type="number" min="0" step="500" class="form-control" placeholder="Ex.: 5000"></div></div></div>
<div class="dpit-pf-box" id="dpitPfAp" hidden><div class="dpit-pf-h">${I('car')}<b>Autopeças: referência e aplicação</b><small>A busca do PDV, da OS, do orçamento e de Produtos acha a peça pela aplicação ("pastilha gol g5") ou pelo código do fabricante.</small></div>
<div class="dpit-pf-row two"><div><label class="form-label">Referência do fabricante</label><input id="dpitRef" class="form-control" maxlength="200" placeholder="Ex.: Bosch 0986BB0606, Cobreq N-1084"></div><div><label class="form-label">Aplicação (veículos compatíveis)</label><input id="dpitApp" class="form-control" maxlength="400" placeholder="Ex.: Gol G5 1.0 2009-2013, Voyage, Fox"></div></div></div>`;
        const after = $('dpaProdFields') || anchor;
        after.insertAdjacentElement('afterend', g);
        let cur = null;
        const sel = $('dpitEvType'), days = $('dpitRepDays'), km = $('dpitRepKm');
        function paint() {
            const t = sel.value;
            $('dpitPfEv').hidden = !(petOn() || vehOn() || (cur && cur.itemEventType));
            $('dpitPfAp').hidden = !(vehOn() || (cur && (cur.reference || cur.application)));
            $('dpitRepKmBox').style.display = !t || (EV[t] && EV[t].kind === 'veiculo') || t === 'outro' ? '' : 'none';
            days.disabled = km.disabled = !t;
        }
        sel.addEventListener('change', () => { const x = EV[sel.value]; if (x) { days.value = x.days || ''; km.value = x.km || ''; } else { days.value = ''; km.value = ''; } paint(); });
        const origOpen = window.openProductModal;
        if (typeof origOpen === 'function' && !origOpen.__dpit) {
            const w = function (productId) {
                const r = origOpen.apply(this, arguments);
                try {
                    let p = null; try { p = productId ? (allProducts || []).find(x => x.id === productId) : null; } catch (e) { }
                    cur = p;
                    sel.value = p && EV[p.itemEventType] ? p.itemEventType : '';
                    days.value = p && p.repeatDays != null && p.repeatDays !== '' ? p.repeatDays : '';
                    km.value = p && Number(p.repeatKm) > 0 ? p.repeatKm : '';
                    $('dpitRef').value = (p && p.reference) || ''; $('dpitApp').value = (p && p.application) || '';
                    paint();
                } catch (e) { }
                return r;
            };
            w.__dpit = true; window.openProductModal = w;
        }
        const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
        if (svc && !svc.__dpit) {
            svc.__dpit = true;
            const wrap = name => {
                const orig = svc[name]; if (typeof orig !== 'function') return;
                svc[name] = function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && $('productModal') && $('productModal').classList.contains('active') && $('dpitProdFields')) {
                        if (!$('dpitPfEv').hidden) {
                            const t = sel.value;
                            data.itemEventType = EV[t] ? t : '';
                            const d = Number(days.value), k = Number(km.value);
                            data.repeatDays = t && days.value !== '' && d >= 0 ? Math.round(d) : null;
                            data.repeatKm = t && k > 0 ? Math.round(k) : null;
                        }
                        if (!$('dpitPfAp').hidden) { data.reference = $('dpitRef').value.trim(); data.application = $('dpitApp').value.trim(); }
                    }
                    return orig.apply(this, arguments);
                };
            };
            wrap('create'); wrap('update');
        }
        paint();
        document.addEventListener('dp:ramo', paint);
    }

    /* ===================== DEMO: pets e carros de exemplo (o arquivo só existe na demo) ===================== */
    let demoTried = false;
    async function demoSample() {
        if (!DEMO || demoTried) return; demoTried = true;
        const list = await loadIndex(); if (list.length) return;
        if (!window.DPItensDemo) await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/js/itens-demo-v1.js?v=' + VER; s.onload = r; s.onerror = r; document.head.appendChild(s); });
        try { if (window.DPItensDemo && await window.DPItensDemo.sample()) { prodP = null; await loadIndex(true); } } catch (e) { console.warn('demo pets/veículos', e); }
    }

    /* ===================== ORDENS DE SERVIÇO ===================== */
    function maybeOs() {
        if (PAGE !== 'ordens-servico' || !$('osModal') || window.DPOsVeiculo || document.querySelector('script[src*="os-veiculo-v1.js"]')) return;
        if (!vehOn()) return;
        const s = document.createElement('script'); s.src = 'assets/js/os-veiculo-v1.js?v=' + VER; document.head.appendChild(s);
    }

    /* ===================== API ===================== */
    window.DPItens = {
        VER, EV, SPECIES, SIZES, VTYPES, FUELS, FUEL_LEVEL, I, esc, words, plateKey, plateOk, plateFmt, plateTag, parseNum, intFmt, kmFmt, toMs, fmtD, today, addDays,
        petOn, vehOn, kindsOn, term, loadMode, loadIndex, cached, itemsOf, getItem, saveItem, findByPlate, eventsOf, addEvent, dues, dueText, warranty, warnText,
        title, short, sub, icOf, isVeh, active, avatar, css, modal, close, head, openForm, openItem, openEvent, openReturn, newOsFor, sellFor,
        findCustomers, prodMatch, prodInfo, osMatch, agendaChips, onChange: f => listeners.add(f), get index() { return index; }
    };

    /* ===================== INÍCIO ===================== */
    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    try { setupClientes(); } catch (e) { console.warn('pets/veículos clientes', e); } // antes da ficha abrir (clientes.html carrega este arquivo antes do clientes-pro)
    ready(() => {
        try { setupPdv(); } catch (e) { console.warn('pets/veículos pdv', e); }
        try { setupProducts(0); } catch (e) { console.warn('pets/veículos produtos', e); }
        maybeOs();
        if ($('productsGrid') || $('osModal') || $('orcRoot') || $('garRoot')) loadIndex();
    });
    try { auth.onAuthStateChanged(u => { if (!u) return; loadMode().then(() => { maybeOs(); emit(); if (DEMO) setTimeout(demoSample, 600); }); }); } catch (e) { loadMode().then(maybeOs); }
    document.addEventListener('dp:ramo', () => { maybeOs(); emit(); });
    setTimeout(maybeOs, 1500); setTimeout(maybeOs, 4000);
})();
