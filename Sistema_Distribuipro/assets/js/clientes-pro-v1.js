/* DistribuiPro 35.37 · Clientes — central do cliente.
   Lista com busca, filtros e fiado em aberto; ficha completa de cada cliente com dados, compras,
   fiado/contas a receber, ordens de serviço, orçamentos, garantias e aparelhos comprados.
   Pela ficha dá para vender, abrir OS, orçar, lançar fiado, receber, cobrar no WhatsApp e imprimir extrato.
   Coleções: customers, sales, financial_entries, service_orders, quotes, device_purchases
   Abrir direto: clientes.html?id=<cliente>&aba=fiado · clientes.html?novo=1 */
(function () {
    'use strict';
    const root = document.getElementById('cliRoot');
    if (!root) return;

    /* ======================= UTILITÁRIOS ======================= */
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const digits = s => String(s ?? '').replace(/\D/g, '');
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    // 39.14 · Formatadores criados uma vez só: toLocaleString/localeCompare com opções montam um novo a cada chamada e,
    // com centenas de clientes, a lista travava a tela (ordenar 922 nomes levava quase 2 s num computador simples).
    const F_BRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }), F_N2 = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), F_QTY = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 3 });
    const NOME_AZ = new Intl.Collator('pt-BR', { sensitivity: 'base' });
    const money = v => F_BRL.format(Number(v) || 0);
    const num2 = v => F_N2.format(Number(v) || 0);
    const qtyFmt = v => F_QTY.format(Number(v) || 0);
    const parseMoney = v => {
        let s = String(v ?? '').replace(/[^\d,.-]/g, '').trim(); if (!s) return 0;
        if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
        const n = Number(s); return Number.isFinite(n) ? n : 0;
    };
    const sumAmt = list => r2(list.reduce((a, e) => a + Number(e.amount || 0), 0));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    // Funciona nas 4 versões: MySQL/Mensal (DPFieldValue) e Firebase/Offline (firebase.firestore)
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue);
    const ts = () => FV().serverTimestamp();
    const tsAt = d => { const T = window.DPTimestamp || (window.firebase && firebase.firestore && firebase.firestore.Timestamp); return T && typeof T.fromDate === 'function' ? T.fromDate(d) : d; };
    const uid = () => (auth.currentUser && auth.currentUser.uid) || '';
    // 36.6 · CRUD genérico: DataService (MySQL/Mensal) ou FirestoreService (Firebase/Offline/demo) — antes dava "DataService is not defined"
    const DS = () => (typeof DataService !== 'undefined' ? DataService : (typeof FirestoreService !== 'undefined' ? FirestoreService : null));
    const toDate = v => {
        if (!v) return null;
        try {
            if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); }
            const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.value || v.__ts || (v.seconds ? v.seconds * 1000 : v)));
            return isNaN(d) ? null : d;
        } catch (e) { return null; }
    };
    const ms = v => { const d = toDate(v); return d ? d.getTime() : 0; };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const day0 = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const isoDay = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    function daysAgo(v) {
        const d = toDate(v); if (!d) return '';
        const n = Math.round((day0() - day0(d)) / 864e5);
        if (n < 0) return n === -1 ? 'amanhã' : `em ${-n} dias`;
        if (n === 0) return 'hoje'; if (n === 1) return 'ontem'; if (n < 30) return `há ${n} dias`;
        if (n < 365) { const m = Math.round(n / 30); return `há ${m} ${m === 1 ? 'mês' : 'meses'}`; }
        const y = Math.floor(n / 365); return `há ${y} ${y === 1 ? 'ano' : 'anos'}`;
    }
    const saleNo = s => s.saleNumber ? '#V-' + String(s.saleNumber).padStart(4, '0') : '#' + String(s.id || '').slice(-6).toUpperCase();
    const osNo = o => '#OS-' + String(o.orderNumber || 0).padStart(4, '0');
    const quoteNo = q => 'Nº ' + String(q.quoteNumber || 0).padStart(6, '0');
    const device = o => [o.deviceType, o.brand, o.model].filter(Boolean).join(' · ') || 'Equipamento';

    // Telefone: aceita número com +55, com 0 na frente, com ou sem máscara
    function phoneDigits(v) {
        let d = digits(v);
        if (d.length > 11 && d.startsWith('55')) d = d.slice(2);
        if (d.length > 10 && d[0] === '0') d = d.replace(/^0+/, '');
        return d;
    }
    function fmtPhone(v) {
        const d = phoneDigits(v);
        if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
        if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        if (d.length === 9) return `${d.slice(0, 5)}-${d.slice(5)}`;
        if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
        return String(v || '').trim();
    }
    function waNum(v) { const d = phoneDigits(v); if (d.length === 10 || d.length === 11) return '55' + d; return d.length >= 12 ? d : ''; }
    function telHref(v) { const d = phoneDigits(v); return 'tel:' + (d.length >= 10 ? '+55' + d : d); }
    function maskPhone(v) {
        let d = digits(v); if (d.length > 11 && d.startsWith('55')) d = d.slice(2); d = d.slice(0, 11);
        if (!d) return ''; if (d.length <= 2) return '(' + d;
        if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
        if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
        return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    }
    function fmtDoc(v) {
        const d = digits(v);
        if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
        if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
        return String(v || '').trim();
    }
    function maskDoc(v) {
        const d = digits(v).slice(0, 14);
        if (d.length <= 11) return d.replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
        return d.replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    }
    const maskCep = v => digits(v).slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');

    const COLORS = ['#6366f1', '#f59e0b', '#ef4444', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#14b8a6'];
    const initials = n => String(n || '?').trim().split(/\s+/).filter(w => !/^(d[aeo]s?|e)$/i.test(w)).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';
    const colorOf = n => { let h = 0; for (const ch of String(n || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0; return COLORS[h % COLORS.length]; };
    // 36.8 · Foto do cliente (campo photo, guardada reduzida no próprio cadastro — funciona nas 5 versões)
    const avatar = (c, cls = '') => c.photo ? `<span class="cli-av cli-av-img ${cls}" style="background-image:url('${String(c.photo).replace(/'/g, '%27')}')"></span>` : `<span class="cli-av ${cls}" style="background:${colorOf(c.name)}">${esc(initials(c.name))}</span>`;
    let formPhoto = '';
    function shrinkPhoto(file, max = 320) {
        return new Promise((resolve, reject) => {
            const img = new Image(); const url = URL.createObjectURL(file);
            img.onload = () => { try { const s = Math.min(1, max / Math.max(img.width, img.height)); const w = Math.max(1, Math.round(img.width * s)), h = Math.max(1, Math.round(img.height * s)); const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(img, 0, 0, w, h); URL.revokeObjectURL(url); resolve(cv.toDataURL('image/jpeg', 0.82)); } catch (e) { reject(e); } };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Imagem inválida')); };
            img.src = url;
        });
    }
    function paintFormPhoto() {
        const box = $('cliPhotoBox'); if (!box) return;
        const name = ($('clientNome') && $('clientNome').value) || '';
        box.innerHTML = formPhoto ? `<img src="${formPhoto}" alt="">` : `<span>${esc(initials(name || '?'))}</span>`;
        box.style.background = formPhoto ? '#fff' : colorOf(name);
        const rm = $('cliPhotoRm'); if (rm) rm.style.display = formPhoto ? '' : 'none';
    }
    (function photoCss() { const s = document.createElement('style'); s.textContent = '.cli-av-img{background-size:cover;background-position:center;color:transparent!important}.cli-photo{display:flex;align-items:center;gap:14px;grid-column:1/-1;margin-bottom:4px}.cli-photo-box{width:72px;height:72px;border-radius:50%;overflow:hidden;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:800;font-size:24px;border:2px solid var(--border-color);flex-shrink:0}.cli-photo-box img{width:100%;height:100%;object-fit:cover}.cli-photo-acts{display:flex;gap:8px;flex-wrap:wrap}.cli-photo small{display:block;font-size:11px;color:var(--text-muted);margin-top:4px}'; document.head.appendChild(s); })();
    const badge = (txt, cls, ic) => `<span class="cli-b ${cls}">${ic ? `<i class="fas ${ic}"></i>` : ''}${esc(txt)}</span>`;

    /* ======================= RÓTULOS ======================= */
    const CLS = { normal: 'Normal', vip: 'VIP', premium: 'Premium' };
    const PAY = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Crédito', debito: 'Débito', fiado: 'Fiado', multi: 'Várias formas', transferencia: 'Transferência', boleto: 'Boleto', outro: 'Outro', sinal: 'Sinal da OS' };
    const SALE_ST = { completed: ['Concluída', 'ok'], new: ['Novo pedido', 'info'], preparing: ['Preparando', 'warn'], waiting: ['Aguardando', 'warn'], delivering: ['Em entrega', 'info'], delivered: ['Entregue', 'ok'], cancelled: ['Cancelada', 'bad'] };
    const SALE_TYPE = { balcao: 'Balcão', pickup: 'Retirada', delivery: 'Entrega', service_order: 'Ordem de serviço' };
    const OS_ST = { received: ['Recebido', 'info'], analyzing: ['Em análise', 'warn'], awaiting_approval: ['Aguardando aprovação', 'purple'], approved: ['Orçamento aprovado', 'ok'], in_progress: ['Em manutenção', 'info'], awaiting_parts: ['Aguardando peça', 'warn'], ready: ['Pronto para entrega', 'ok'], delivered: ['Entregue', 'ok'], returned: ['Devolvido sem reparo', 'info'], cancelled: ['Cancelado', 'bad'] };
    const OS_PAY = { paid: ['Pago', 'cli-ok'], receivable: ['A receber', ''], partial_receivable: ['Parcial / a receber', ''], reversed: ['Estornado', 'cli-bad'], pending: ['Pagamento pendente', ''] };
    const Q_ST = { draft: ['Rascunho', 'muted'], sent: ['Enviado', 'info'], approved: ['Aprovado', 'ok'], rejected: ['Recusado', 'bad'], converted: ['Vendido', 'purple'], expired: ['Vencido', 'warn'] };
    const USED_ST = { evaluation: ['Avaliação', 'muted'], purchased: ['Comprado', 'ok'], declined: ['Recusado', 'bad'], sold: ['Vendido', 'purple'] };
    const RCV_METHODS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['debito', 'Cartão de débito'], ['credito', 'Cartão de crédito'], ['transferencia', 'Transferência'], ['boleto', 'Boleto'], ['outro', 'Outro']];

    function payLabel(s) {
        const ps = Array.isArray(s.payments) ? s.payments.filter(p => p && p.method) : [];
        const one = p => { let l = PAY[p.method] || p.method; if (p.method === 'credito' && Number(p.installments || 1) > 1) l += ' ' + p.installments + 'x'; return l; };
        if (ps.length > 1) return ps.map(one).join(' + ');
        if (ps.length === 1) return one(ps[0]);
        return PAY[s.paymentMethod] || s.paymentMethod || '—';
    }
    function qStatus(q) {
        if ((q.status === 'draft' || q.status === 'sent') && q.validUntil) { const d = toDate(q.validUntil); if (d && d < day0()) return 'expired'; }
        return Q_ST[q.status] ? q.status : 'draft';
    }
    function warranty(o) {
        const days = Number(o.warrantyDays || 0), from = ms(o.deliveredAt);
        if (o.status !== 'delivered' || !from || !days) return null;
        const until = from + days * 864e5;
        return { until, valid: Date.now() <= until, left: Math.ceil((until - Date.now()) / 864e5) };
    }

    /* ======================= CLIENTE ======================= */
    function normC(raw) {
        const c = { ...raw };
        c.name = String(raw.name || raw.nome || raw.razaoSocial || '').trim() || 'Cliente sem nome';
        c.phone = raw.phone || raw.telefone || raw.celular || '';
        c.whatsapp = raw.whatsapp || '';
        c.document = raw.document || raw.cpfCnpj || raw.cpf || raw.cnpj || '';
        c.street = raw.street || raw.rua || '';
        c.number = raw.number || raw.numero || '';
        c.complement = raw.complement || raw.complemento || '';
        c.neighborhood = raw.neighborhood || raw.bairro || '';
        c.city = raw.city || raw.cidade || '';
        c.state = raw.state || raw.uf || '';
        c.zip = raw.zip || raw.cep || '';
        c.addressRef = raw.addressRef || raw.referencia || raw.reference || '';
        const t = String(raw.type || '').toLowerCase();
        c.type = t === 'pj' || (!t && digits(c.document).length === 14) ? 'pj' : 'pf';
        const k = String(raw.classification || '').toLowerCase();
        c.cls = CLS[k] ? k : 'normal';
        c.inactive = raw.status === 'inactive';
        c._phones = [c.phone, c.whatsapp].map(phoneDigits).filter(Boolean);
        c._docD = digits(c.document);
        c._search = norm([c.name, c.email, c.city, c.neighborhood, c.document, c.notes].join(' '));
        return c;
    }
    const mainPhone = c => c.whatsapp || c.phone || '';
    const cityOf = c => [c.city, c.state].filter(Boolean).join(' - ');
    function streetLine(c) { return c.street ? [c.street, c.number, c.complement].filter(Boolean).join(', ') : (c.address || ''); }
    function addrLine(c) { return [streetLine(c), c.neighborhood, cityOf(c), c.zip ? 'CEP ' + c.zip : ''].filter(Boolean).join(' · '); }

    // Permissões: segue o que o menu lateral mostra para o perfil do usuário
    const me = () => { try { return (typeof currentUser !== 'undefined' && currentUser) || {}; } catch (e) { return {}; } };
    const isAdmin = () => me().role === 'admin';
    function canGo(href) {
        if (isAdmin()) return true;
        const a = document.querySelector(`#sidebar .menu-item[href="${href}"]`);
        return !a || a.style.display !== 'none';
    }
    const canFin = () => canGo('contas-receber.html');
    const canDelete = () => isAdmin() || me().role === 'manager' || !!(me().permissions && me().permissions.deleteRecords);

    /* ======================= ESTADO ======================= */
    const POR_PAGINA = 100; // 39.14 · lista em páginas de 100 (antes "Mostrar mais" ia juntando tudo na mesma tela)
    let customers = [], openMap = new Map(), booted = false, listLoaded = false, pg = 0;
    let view = 'list', curId = null, D = null, tab = 'resumo', loadSeq = 0, pushedDetail = false, listScroll = 0;
    let saleF = { period: '0', q: '' }, salesShown = 40, finF = 'open', editingId = null, companyCache = null;
    let extHits = null; // 38.2 · clientes achados pelo nome do pet ou pela placa (itens-cliente-v1.js)
    const byId = id => customers.find(c => c.id === id) || null;

    async function getAll(col, field, value) {
        let q = db.collection(col); if (field) q = q.where(field, '==', value);
        const s = await q.get();
        return s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.deleted !== true);
    }
    async function company() {
        if (companyCache) return companyCache;
        const c = { name: '', cnpj: '', phone: '', address: '' };
        try {
            const snap = await db.collection('settings').doc('general').get(); const d = snap.exists ? (snap.data() || {}) : {};
            const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
            c.name = d.nomeFantasia || brand.companyName || d.razaoSocial || '';
            c.cnpj = d.cnpj || ''; c.phone = d.whatsapp || d.telefone || '';
            c.address = [[d.logradouro, d.numero].filter(Boolean).join(', '), d.bairro, [d.cidade, d.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ');
        } catch (e) { }
        return (companyCache = c);
    }

    /* ======================= LISTA ======================= */
    function shell() {
        root.innerHTML = `
<section id="cliList">
  <div class="cli-stats">
    <div class="stat-card cli-stat" data-f="active" tabindex="0" role="button"><div class="stat-icon blue"><i class="fas fa-users"></i></div><div class="stat-value" id="cliStTotal">0</div><div class="stat-label">Clientes ativos</div><div class="cli-stat-sub" id="cliStTotalSub">&nbsp;</div></div>
    <div class="stat-card cli-stat" data-f="open" tabindex="0" role="button"><div class="stat-icon yellow"><i class="fas fa-hand-holding-dollar"></i></div><div class="stat-value" id="cliStOpen">R$ 0,00</div><div class="stat-label">Fiado em aberto</div><div class="cli-stat-sub" id="cliStOpenSub">&nbsp;</div></div>
    <div class="stat-card cli-stat" data-f="late" tabindex="0" role="button"><div class="stat-icon red"><i class="fas fa-triangle-exclamation"></i></div><div class="stat-value" id="cliStLate">R$ 0,00</div><div class="stat-label">Em atraso</div><div class="cli-stat-sub" id="cliStLateSub">&nbsp;</div></div>
    <div class="stat-card cli-stat" data-f="vip" tabindex="0" role="button"><div class="stat-icon purple"><i class="fas fa-star"></i></div><div class="stat-value" id="cliStVip">0</div><div class="stat-label">VIP e Premium</div><div class="cli-stat-sub" id="cliStVipSub">&nbsp;</div></div>
  </div>
  <div class="card cli-toolbar-card"><div class="cli-toolbar">
    <div class="search-box"><i class="fas fa-search"></i><input id="cliQ" type="search" autocomplete="off" placeholder="Buscar por nome, telefone, CPF/CNPJ, e-mail ou cidade..."></div>
    <select id="cliF" class="form-control" aria-label="Filtro">
      <option value="">Todos os clientes</option><option value="active">Somente ativos</option><option value="inactive">Somente inativos</option>
      <option value="vip">VIP e Premium</option><option value="open">Com fiado em aberto</option><option value="late">Com conta atrasada</option>
      <option value="bday">Aniversariantes do mês</option><option value="nophone">Sem telefone</option>
    </select>
    <select id="cliT" class="form-control" aria-label="Tipo"><option value="">PF e PJ</option><option value="pf">Pessoa física</option><option value="pj">Pessoa jurídica</option></select>
    <select id="cliS" class="form-control" aria-label="Ordenar">
      <option value="name">Ordenar: A–Z</option><option value="buy">Quem mais compra</option><option value="recent">Compra recente</option>
      <option value="debt">Maior fiado</option><option value="new">Cadastro recente</option>
    </select>
    <div class="cli-tb-btns">
      <button class="btn btn-outline" id="cliPdf" type="button"><i class="fas fa-file-pdf" style="color:#ef4444"></i> PDF</button>
      <button class="btn btn-primary" id="cliNew" type="button"><i class="fas fa-user-plus"></i> Novo cliente</button>
    </div>
  </div></div>
  <div class="card cli-list-card">
    <div class="cli-table-wrap"><table class="cli-table">
      <thead><tr><th>Cliente</th><th>Telefone / WhatsApp</th><th>Cidade</th><th class="r">Compras</th><th>Última compra</th><th class="r">Fiado em aberto</th><th>Situação</th><th class="r">Ações</th></tr></thead>
      <tbody id="cliTb"><tr><td colspan="8" class="cli-empty"><i class="fas fa-spinner fa-spin"></i>Carregando clientes...</td></tr></tbody>
    </table></div>
    <div class="cli-more" id="cliMore"></div>
  </div>
</section>
<section id="cliDetail" hidden></section>`;

        const rerender = () => { pg = 0; renderList(); };
        let qT = 0; $('cliQ').addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(rerender, 180); });
        ['cliF', 'cliT', 'cliS'].forEach(id => $(id).addEventListener('change', rerender));
        $('cliNew').addEventListener('click', () => openForm(null));
        $('cliPdf').addEventListener('click', exportPdf);
        root.querySelectorAll('.cli-stat').forEach(el => {
            const go = () => { const f = $('cliF'); f.value = f.value === el.dataset.f ? '' : el.dataset.f; rerender(); };
            el.addEventListener('click', go);
            el.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
        });
        $('cliTb').addEventListener('click', onListClick);
        $('cliMore').addEventListener('click', e => {
            const b = e.target.closest('[data-pg]'); if (!b || b.disabled) return;
            pg = Number(b.dataset.pg) || 0; renderList();
            try { root.querySelector('.cli-list-card').scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (err) { }
        });
        $('cliDetail').addEventListener('click', onDetailClick);
        $('cliDetail').addEventListener('change', onDetailChange);
        $('cliDetail').addEventListener('input', onDetailInput);

        const drop = document.createElement('div'); drop.className = 'cli-drop'; drop.id = 'cliDrop'; document.body.appendChild(drop);
        drop.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; closeMenu(); runAction(b.dataset.act, b); });
        document.addEventListener('click', e => { if (!e.target.closest('#cliDrop') && !e.target.closest('[data-act="more"]')) closeMenu(); });
        window.addEventListener('scroll', closeMenu, true); window.addEventListener('resize', closeMenu);
    }

    async function loadList() {
        const [cs, fin] = await Promise.all([getAll('customers'), getAll('financial_entries', 'type', 'income').catch(() => [])]);
        customers = cs.map(normC);
        openMap = new Map();
        const t0 = day0().getTime();
        fin.forEach(e => {
            if (e.status !== 'pending' || !e.customerId) return;
            const o = openMap.get(e.customerId) || { open: 0, late: 0, n: 0, nLate: 0 };
            const amt = Number(e.amount || 0); o.open = r2(o.open + amt); o.n++;
            const due = ms(e.dueDate); if (due && due < t0) { o.late = r2(o.late + amt); o.nLate++; }
            openMap.set(e.customerId, o);
        });
        listLoaded = true;
    }

    function filtered() {
        const raw = $('cliQ').value || '', q = norm(raw).trim(), qd = digits(raw);
        const f = $('cliF').value, t = $('cliT').value, s = $('cliS').value;
        const month = new Date().getMonth() + 1;
        let list = customers.slice();
        if (f === 'active') list = list.filter(c => !c.inactive);
        else if (f === 'inactive') list = list.filter(c => c.inactive);
        else if (f === 'vip') list = list.filter(c => c.cls !== 'normal');
        else if (f === 'open') list = list.filter(c => openMap.has(c.id));
        else if (f === 'late') list = list.filter(c => (openMap.get(c.id) || {}).late > 0);
        else if (f === 'bday') list = list.filter(c => { const d = toDate(c.birthDate); return d && d.getMonth() + 1 === month; });
        else if (f === 'nophone') list = list.filter(c => !c._phones.length);
        if (t) list = list.filter(c => c.type === t);
        extHits = q && window.DPClientFind ? window.DPClientFind(raw) : null;
        // 38.2 · placa (ABC1D23) não procura os números dela no telefone/CPF: só busca por número quando não tem letras
        if (q) list = list.filter(c => c._search.includes(q) || (qd.length >= 3 && !/[a-z]{2}/i.test(raw) && (c._phones.some(p => p.includes(qd)) || c._docD.includes(qd))) || !!(extHits && extHits.has(c.id)));
        const open = c => (openMap.get(c.id) || {}).open || 0;
        const sorters = {
            name: (a, b) => NOME_AZ.compare(a.name, b.name),
            buy: (a, b) => Number(b.totalPurchases || 0) - Number(a.totalPurchases || 0),
            recent: (a, b) => ms(b.lastPurchase) - ms(a.lastPurchase),
            debt: (a, b) => open(b) - open(a),
            new: (a, b) => ms(b.createdAt) - ms(a.createdAt)
        };
        if (f === 'bday' && s === 'name') list.sort((a, b) => toDate(a.birthDate).getDate() - toDate(b.birthDate).getDate());
        else list.sort(sorters[s] || sorters.name);
        return list;
    }

    function renderStats() {
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        let open = 0, late = 0, nOpen = 0, nLate = 0;
        openMap.forEach((o, id) => { if (!byId(id)) return; open += o.open; late += o.late; nOpen++; if (o.late) nLate++; });
        const vip = customers.filter(c => c.cls === 'vip').length, prem = customers.filter(c => c.cls === 'premium').length;
        set('cliStTotal', customers.filter(c => !c.inactive).length);
        set('cliStTotalSub', plural(customers.length, 'cadastrado', 'cadastrados'));
        set('cliStOpen', money(open)); set('cliStOpenSub', nOpen ? plural(nOpen, 'cliente devendo', 'clientes devendo') : 'Ninguém devendo');
        set('cliStLate', money(late)); set('cliStLateSub', nLate ? plural(nLate, 'cliente atrasado', 'clientes atrasados') : 'Tudo em dia');
        set('cliStVip', vip + prem); set('cliStVipSub', `${vip} VIP · ${prem} Premium`);
        const f = $('cliF').value; root.querySelectorAll('.cli-stat').forEach(el => el.classList.toggle('on', el.dataset.f === f));
    }

    function statusBadges(c, o) {
        return `<div class="cli-tags" style="margin:0">${c.inactive ? badge('Inativo', 'muted') : badge('Ativo', 'ok')}${c.cls === 'vip' ? badge('VIP', 'gold', 'fa-star') : c.cls === 'premium' ? badge('Premium', 'purple', 'fa-gem') : ''}${o && o.late ? badge('Em atraso', 'bad', 'fa-triangle-exclamation') : ''}</div>`;
    }

    function rowHtml(c) {
        const o = openMap.get(c.id), ph = mainPhone(c), cnt = Number(c.purchaseCount || 0);
        const sub = [extHits && extHits.get(c.id), c.document ? fmtDoc(c.document) : '', c.type === 'pj' ? 'Pessoa jurídica' : ''].filter(Boolean).join(' · ') || 'Pessoa física';
        return `<tr data-id="${esc(c.id)}">
<td class="cli-c-name"><div class="cli-who">${avatar(c)}<div style="min-width:0"><b>${esc(c.name)}</b><small>${esc(sub)}</small></div></div></td>
<td data-label="Telefone" class="${ph || c.email ? '' : 'cli-nil'}">${ph ? `<span class="cli-phone">${c.whatsapp ? '<i class="fab fa-whatsapp"></i>' : '<i class="fas fa-phone cli-mute" style="font-size:11px"></i>'}${esc(fmtPhone(ph))}</span>` : '<span class="cli-mute">—</span>'}${c.email ? `<small class="cli-em">${esc(c.email)}</small>` : ''}</td>
<td data-label="Cidade" class="${cityOf(c) ? '' : 'cli-nil'}">${cityOf(c) ? esc(cityOf(c)) : '<span class="cli-mute">—</span>'}</td>
<td data-label="Compras" class="r ${Number(c.totalPurchases || 0) || cnt ? '' : 'cli-nil'}"><span class="cli-money">${money(c.totalPurchases)}</span>${cnt ? `<small>${plural(cnt, 'compra', 'compras')}</small>` : ''}</td>
<td data-label="Última compra" class="${c.lastPurchase ? '' : 'cli-nil'}"><span class="cli-num">${c.lastPurchase ? fmtD(c.lastPurchase) : '—'}</span>${c.lastPurchase ? `<small>${daysAgo(c.lastPurchase)}</small>` : ''}</td>
<td data-label="Fiado em aberto" class="r ${o ? '' : 'cli-nil'}">${o ? `<span class="cli-money ${o.late ? 'cli-bad' : ''}">${money(o.open)}</span><small class="${o.late ? 'cli-bad' : ''}">${o.late ? money(o.late) + ' atrasado' : plural(o.n, 'conta', 'contas')}</small>` : '<span class="cli-mute">—</span>'}</td>
<td data-label="Situação">${statusBadges(c, o)}</td>
<td class="cli-acts-cell"><div class="cli-acts">
  <button type="button" class="cli-act pri" data-act="open" title="Abrir a ficha completa do cliente"><i class="fas fa-id-card"></i><span>Abrir ficha</span></button>
  ${waNum(ph) ? `<a class="cli-act wa" href="https://wa.me/${waNum(ph)}" target="_blank" rel="noopener" title="Conversar no WhatsApp"><i class="fab fa-whatsapp"></i></a>` : ''}
  ${canGo('pdv.html') ? '<button type="button" class="cli-act" data-act="sell" title="Nova venda para este cliente"><i class="fas fa-cash-register"></i></button>' : ''}
  <button type="button" class="cli-act" data-act="edit" title="Editar cadastro"><i class="fas fa-pen"></i></button>
</div></td></tr>`;
    }

    function renderList() {
        renderStats();
        const tb = $('cliTb'), more = $('cliMore');
        if (!listLoaded) return;
        const list = filtered();
        if (!list.length) {
            const filteredOut = customers.length > 0;
            tb.innerHTML = `<tr><td colspan="8" class="cli-empty"><i class="fas fa-users"></i>${filteredOut ? 'Sem clientes para essa busca ou filtro.' : 'Você ainda não cadastrou clientes.'}<br>${filteredOut ? '' : '<button class="btn btn-primary" type="button" data-act="new"><i class="fas fa-user-plus"></i> Cadastrar o primeiro cliente</button>'}</td></tr>`;
            more.innerHTML = ''; return;
        }
        const pages = Math.ceil(list.length / POR_PAGINA); pg = Math.max(0, Math.min(pg, pages - 1));
        const ini = pg * POR_PAGINA, page = list.slice(ini, ini + POR_PAGINA);
        tb.innerHTML = page.map(rowHtml).join('');
        more.innerHTML = `<span>Mostrando ${pages > 1 ? `${ini + 1} a ${ini + page.length} de ` : ''}${plural(list.length, 'cliente', 'clientes')}</span>${pages > 1 ? pager(pages) : ''}`;
    }
    // Botões das páginas: ‹ Anterior  1 … 4 5 6 … 10  Próxima ›
    function pager(n) {
        const nums = [...new Set([0, pg - 1, pg, pg + 1, n - 1])].filter(i => i >= 0 && i < n).sort((a, b) => a - b);
        let h = '', antes = -1;
        nums.forEach(i => { if (i - antes > 1) h += '<span class="cli-pg-gap">…</span>'; h += `<button type="button" class="cli-pg${i === pg ? ' on' : ''}" data-pg="${i}"${i === pg ? ' aria-current="page"' : ''}>${i + 1}</button>`; antes = i; });
        return `<div class="cli-pager"><button type="button" class="cli-pg cli-pg-nav" data-pg="${pg - 1}" ${pg ? '' : 'disabled'} title="Página anterior">‹ Anterior</button>${h}<button type="button" class="cli-pg cli-pg-nav" data-pg="${pg + 1}" ${pg < n - 1 ? '' : 'disabled'} title="Próxima página">Próxima ›</button></div>`;
    }

    function onListClick(e) {
        const b = e.target.closest('[data-act]');
        if (b && b.dataset.act === 'new') return openForm(null);
        const tr = e.target.closest('tr[data-id]'); if (!tr) return;
        const id = tr.dataset.id;
        if (b) {
            if (b.dataset.act === 'edit') return openForm(id);
            if (b.dataset.act === 'sell') return goSell(byId(id));
            return openDetail(id);
        }
        if (e.target.closest('a[href]')) return;
        openDetail(id);
    }

    /* ======================= FICHA ======================= */
    function show(which) {
        view = which;
        $('cliList').hidden = which !== 'list';
        $('cliDetail').hidden = which !== 'detail';
        document.body.classList.toggle('cli-detail-mode', which === 'detail');
    }
    const topOfPage = () => { try { window.scrollTo(0, 0); document.querySelector('.main-content')?.scrollTo?.(0, 0); } catch (e) { } };

    async function openDetail(id, opts = {}) {
        if (!id) return;
        if (view === 'list') listScroll = window.scrollY || 0;
        curId = id; tab = opts.tab || 'resumo'; saleF = { period: '0', q: '' }; salesShown = 40; finF = 'open';
        if (!opts.fromPop) {
            const url = `${location.pathname}?id=${encodeURIComponent(id)}${tab !== 'resumo' ? '&aba=' + tab : ''}`;
            if (opts.replace) history.replaceState({ cli: id }, '', url);
            else { history.pushState({ cli: id }, '', url); pushedDetail = true; }
        }
        show('detail'); closeMenu();
        $('cliDetail').innerHTML = '<div class="cli-loading"><i class="fas fa-spinner fa-spin fa-2x"></i><div style="margin-top:10px">Abrindo ficha do cliente...</div></div>';
        topOfPage();
        await loadDetail(id);
        if (curId === id && view === 'detail') renderDetail();
    }

    async function loadDetail(id) {
        const token = ++loadSeq;
        try {
            const [cd, sales, fin, os, quotes] = await Promise.all([
                db.collection('customers').doc(id).get(),
                getAll('sales', 'customerId', id).catch(() => []),
                getAll('financial_entries', 'customerId', id).catch(() => []),
                getAll('service_orders', 'customerId', id).catch(() => []),
                getAll('quotes', 'customerId', id).catch(() => [])
            ]);
            if (token !== loadSeq) return;
            if (!cd.exists || (cd.data() || {}).deleted === true) { D = { missing: true }; return; }
            const c = normC({ id, ...cd.data() });
            const i = customers.findIndex(x => x.id === id); if (i >= 0) customers[i] = c;
            const desc = f => (a, b) => ms(b[f]) - ms(a[f]);
            D = {
                c, sales: sales.sort(desc('createdAt')), fin: fin.filter(e => e.type !== 'expense').sort(desc('dueDate')),
                os: os.sort(desc('createdAt')), quotes: quotes.sort(desc('createdAt')), used: []
            };
            D.used = await loadUsed(c).catch(() => []);
            if (token !== loadSeq) return;
            compute();
        } catch (e) { console.error(e); if (token === loadSeq) D = { error: e.message || 'Erro ao carregar' }; }
    }

    // Aparelhos usados que a loja comprou deste cliente (o vendedor fica gravado pelo CPF/telefone)
    async function loadUsed(c) {
        const ph8 = c._phones.map(p => p.slice(-8)).filter(p => p.length === 8);
        if (c._docD.length < 11 && !ph8.length) return [];
        const all = await getAll('device_purchases');
        return all.filter(p => { const s = p.seller || {}; const d = digits(s.doc), p8 = digits(s.phone).slice(-8); return (c._docD.length >= 11 && d === c._docD) || (p8.length === 8 && ph8.includes(p8)); })
            .sort((a, b) => (ms(b.purchasedAt) || ms(b.createdAt)) - (ms(a.purchasedAt) || ms(a.createdAt)));
    }

    function compute() {
        const { c, sales, fin, os } = D;
        const valid = sales.filter(s => s.status !== 'cancelled');
        const total = r2(valid.reduce((a, s) => a + Number(s.total || 0), 0));
        const last = valid.reduce((m, s) => Math.max(m, ms(s.createdAt)), 0);
        const t0 = day0().getTime();
        const pend = fin.filter(e => e.status === 'pending');
        const late = pend.filter(e => ms(e.dueDate) && ms(e.dueDate) < t0);
        const yearAgo = Date.now() - 365 * 864e5;
        D.k = {
            total, count: valid.length, avg: valid.length ? r2(total / valid.length) : 0, last,
            cancelled: sales.length - valid.length,
            open: sumAmt(pend), late: sumAmt(late), nOpen: pend.length, nLate: late.length,
            oldestLate: late.reduce((m, e) => Math.min(m, ms(e.dueDate)), Infinity),
            paid12: sumAmt(fin.filter(e => e.status === 'received' && ms(e.paidAt) >= yearAgo)),
            osOpen: os.filter(o => !['delivered', 'cancelled', 'returned'].includes(o.status)).length,
            osReady: os.filter(o => o.status === 'ready').length,
            warrActive: os.filter(o => (warranty(o) || {}).valid).length
        };
        if (pend.length) openMap.set(c.id, { open: D.k.open, late: D.k.late, n: pend.length, nLate: late.length }); else openMap.delete(c.id);
        syncTotals(c, D.k);
    }

    // Os totais gravados no cadastro (usados na lista) não descontavam vendas canceladas.
    // Ao abrir a ficha, eles são conferidos com as vendas reais e corrigidos se estiverem diferentes.
    function syncTotals(c, k) {
        if (!k.count) return;
        const diff = Math.abs(Number(c.totalPurchases || 0) - k.total) > 0.009 || Number(c.purchaseCount || 0) !== k.count || (k.last && Math.abs(ms(c.lastPurchase) - k.last) > 60000);
        if (!diff) return;
        const data = { totalPurchases: k.total, purchaseCount: k.count, averageTicket: k.avg, lastPurchase: tsAt(new Date(k.last)) };
        Object.assign(c, data);
        db.collection('customers').doc(c.id).update(data).catch(e => console.warn('Totais do cliente não atualizados', e));
    }

    function renderDetail() {
        const box = $('cliDetail');
        const back = '<div class="cli-back-row"><button class="btn btn-outline btn-sm" type="button" data-act="back"><i class="fas fa-arrow-left"></i> Todos os clientes</button><span>Ficha do cliente</span></div>';
        if (!D || D.missing) { box.innerHTML = back + '<div class="card cli-blank"><i class="fas fa-user-slash"></i>Este cliente não foi encontrado. Ele pode ter sido excluído.</div>'; return; }
        if (D.error) { box.innerHTML = back + `<div class="card cli-blank"><i class="fas fa-triangle-exclamation"></i>Não foi possível abrir a ficha: ${esc(D.error)}<br><button class="btn btn-primary btn-sm" type="button" data-act="reload"><i class="fas fa-rotate"></i> Tentar de novo</button></div>`; return; }
        const { c, k } = D, ph = mainPhone(c), wa = waNum(ph);
        const bd = toDate(c.birthDate), now = new Date();
        const bdToday = bd && bd.getDate() === now.getDate() && bd.getMonth() === now.getMonth();
        const meta = [
            c.document ? `<span><i class="fas fa-id-card"></i>${c.type === 'pj' ? 'CNPJ' : 'CPF'} ${esc(fmtDoc(c.document))}</span>` : '',
            c.phone ? `<span><i class="fas fa-phone"></i><a href="${telHref(c.phone)}">${esc(fmtPhone(c.phone))}</a></span>` : '',
            c.whatsapp && phoneDigits(c.whatsapp) !== phoneDigits(c.phone) ? `<span><i class="fab fa-whatsapp"></i>${wa ? `<a href="https://wa.me/${wa}" target="_blank" rel="noopener">${esc(fmtPhone(c.whatsapp))}</a>` : esc(fmtPhone(c.whatsapp))}</span>` : '',
            c.email ? `<span><i class="fas fa-envelope"></i><a href="mailto:${esc(c.email)}">${esc(c.email)}</a></span>` : '',
            cityOf(c) ? `<span><i class="fas fa-location-dot"></i>${esc(cityOf(c))}</span>` : '',
            c.createdAt ? `<span><i class="fas fa-calendar"></i>Cliente desde ${fmtD(c.createdAt)}</span>` : '',
            bd ? `<span><i class="fas fa-cake-candles"></i>${bdToday ? '<b class="cli-ok">Aniversário hoje!</b>' : 'Aniversário ' + bd.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}</span>` : ''
        ].filter(Boolean).join('');
        const q = (act, ic, label, cls = '', show = true) => show ? `<button type="button" class="cli-q ${cls}" data-act="${act}"><i class="${ic}"></i><span>${label}</span></button>` : '';
        const limit = Number(c.creditLimit || 0), avail = r2(limit - k.open), usedPct = limit ? Math.min(100, Math.round(k.open / limit * 100)) : 0;
        box.innerHTML = `${back}
<div class="card cli-hero">
  <div class="cli-hero-top">
    ${avatar(c, 'xl')}
    <div class="cli-hero-info">
      <h2>${esc(c.name)}</h2>
      <div class="cli-tags">${badge(c.type === 'pj' ? 'Pessoa jurídica' : 'Pessoa física', 'muted')}${c.inactive ? badge('Inativo', 'muted', 'fa-ban') : badge('Ativo', 'ok')}${c.cls === 'vip' ? badge('VIP', 'gold', 'fa-star') : c.cls === 'premium' ? badge('Premium', 'purple', 'fa-gem') : ''}${c.priceList === 'atacado' ? badge('Preço de atacado', 'info', 'fa-tags') : ''}${Number(c.discountPct) > 0 ? badge('Desconto de ' + String(c.discountPct).replace('.', ',') + '%', 'info', 'fa-percent') : ''}${k.late ? badge('Conta em atraso', 'bad', 'fa-triangle-exclamation') : ''}${Number(c.storeCreditBalance) > 0.004 ? badge('Crédito de troca ' + money(c.storeCreditBalance), 'ok', 'fa-ticket') : ''}${k.osReady ? badge(plural(k.osReady, 'OS pronta', 'OS prontas') + ' p/ entregar', 'info', 'fa-box-open') : ''}</div>
      <div class="cli-hero-meta">${meta || '<span class="cli-mute">Sem dados de contato — clique em Editar para completar.</span>'}</div>
    </div>
    <div class="cli-hero-side">
      <button class="btn btn-outline btn-sm" type="button" data-act="edit"><i class="fas fa-pen"></i> Editar</button>
      <button class="cli-act" type="button" data-act="more" title="Mais opções" aria-label="Mais opções"><i class="fas fa-ellipsis-vertical"></i></button>
    </div>
  </div>
  <div class="cli-quick">
    ${q('sell', 'fas fa-cash-register', 'Nova venda', '', canGo('pdv.html'))}
    ${q('os', 'fas fa-screwdriver-wrench', 'Nova OS', '', canGo('ordens-servico.html'))}
    ${q('quote', 'fas fa-file-signature', 'Orçamento', '', canGo('orcamentos.html'))}
    ${q('charge', 'fas fa-hand-holding-dollar', 'Lançar fiado', 'warn', canFin())}
    ${q('receive', 'fas fa-circle-check', 'Receber', 'money', canFin() && k.nOpen > 0)}
    ${q('wa', 'fab fa-whatsapp', 'WhatsApp', 'wa', !!wa)}
    ${q('collect', 'fas fa-bell', 'Cobrar', 'wa', !!wa && k.nOpen > 0)}
    ${q('print', 'fas fa-print', 'Extrato')}
  </div>
</div>
<div class="cli-kpis">
  <div class="cli-kpi"><span>Total comprado</span><b>${money(k.total)}</b><small>${plural(k.count, 'compra', 'compras')}${k.cancelled ? ' · ' + plural(k.cancelled, 'cancelada', 'canceladas') : ''}</small></div>
  <div class="cli-kpi"><span>Ticket médio</span><b>${money(k.avg)}</b><small>por compra</small></div>
  <div class="cli-kpi"><span>Última compra</span><b>${k.last ? fmtD(k.last) : '—'}</b><small>${k.last ? daysAgo(k.last) : 'ainda não comprou'}</small></div>
  <div class="cli-kpi ${k.late ? 'bad' : ''}"><span>Fiado em aberto</span><b>${money(k.open)}</b><small>${k.nOpen ? plural(k.nOpen, 'conta', 'contas') + (k.late ? ' · ' + money(k.late) + ' atrasado' : ' · em dia') : 'nada pendente'}</small></div>
  <div class="cli-kpi ${limit && avail < 0 ? 'bad' : ''}"><span>Limite de fiado</span><b>${limit ? money(Math.max(0, avail)) : 'Sem limite'}</b><small>${limit ? (avail < 0 ? 'passou ' + money(-avail) + ' do limite' : 'disponível de ' + money(limit)) : 'defina em Editar'}</small>${limit ? `<div class="cli-bar ${usedPct >= 100 ? 'bad' : usedPct >= 80 ? 'warn' : ''}"><i style="width:${usedPct}%"></i></div>` : ''}</div>
  <div class="cli-kpi"><span>Ordens de serviço</span><b>${k.osOpen}</b><small>${D.os.length ? 'em andamento · ' + plural(D.os.length, 'no total', 'no total') : 'nenhuma aberta ainda'}</small></div>
</div>
${k.late ? `<div class="cli-alert"><i class="fas fa-triangle-exclamation"></i><div><b>${money(k.late)} em atraso</b> em ${plural(k.nLate, 'conta', 'contas')}. A mais antiga venceu em ${fmtD(k.oldestLate)} (${daysAgo(k.oldestLate)}).</div><div class="cli-alert-acts">${canFin() ? '<button class="btn btn-success btn-sm" type="button" data-act="receive"><i class="fas fa-check"></i> Receber</button>' : ''}${wa ? '<button class="btn btn-sm cli-btn-wa" type="button" data-act="collect"><i class="fab fa-whatsapp"></i> Cobrar no WhatsApp</button>' : ''}</div></div>` : ''}
<div class="cli-tabs" id="cliTabs" role="tablist">${tabsHtml()}</div>
<div id="cliTabBody"></div>`;
        paintTab();
    }

    function tabsHtml() {
        const k = D.k;
        const tabs = [
            ['resumo', 'fa-user', 'Resumo', ''],
            ['compras', 'fa-bag-shopping', 'Compras', D.sales.length],
            ['fiado', 'fa-hand-holding-dollar', 'Fiado / A receber', k.nOpen, k.nLate ? 'bad' : ''],
            ['os', 'fa-screwdriver-wrench', 'Ordens de serviço', D.os.length],
            ['orc', 'fa-file-signature', 'Orçamentos', D.quotes.length]
        ];
        if (D.os.length) tabs.push(['gar', 'fa-shield-halved', 'Garantias', k.warrActive]);
        if (D.used.length) tabs.push(['usados', 'fa-mobile-screen', 'Aparelhos comprados', D.used.length]);
        // 37.9 · Abas de outros módulos (ex.: Agenda): window.DPClientTabs = [{ id, icon, label, show(D), count(D), render(body, D) }]
        (window.DPClientTabs || []).forEach(t => { try { if (t && t.id && (!t.show || t.show(D))) tabs.push([t.id, t.icon || 'fa-circle', t.label || t.id, t.count ? t.count(D) : '']); } catch (e) { } });
        if (!tabs.some(t => t[0] === tab)) tab = 'resumo';
        return tabs.map(([id, ic, label, n, cls]) => `<button type="button" role="tab" data-tab="${id}" class="${tab === id ? 'on' : ''}"><i class="fas ${ic}"></i>${label}${n !== '' && n !== undefined ? `<span class="n ${cls || ''}">${n}</span>` : ''}</button>`).join('');
    }

    function setTab(t) {
        tab = t;
        document.querySelectorAll('#cliTabs [data-tab]').forEach(b => b.classList.toggle('on', b.dataset.tab === t));
        history.replaceState(history.state, '', `${location.pathname}?id=${encodeURIComponent(curId)}${t !== 'resumo' ? '&aba=' + t : ''}`);
        paintTab();
        document.querySelector(`#cliTabs [data-tab="${t}"]`)?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
    }

    function paintTab() {
        const body = $('cliTabBody'); if (!body) return;
        const ext = (window.DPClientTabs || []).find(t => t && t.id === tab && t.render);
        if (ext) { body.innerHTML = ''; try { ext.render(body, D); } catch (e) { console.warn('aba ' + tab, e); } return; }
        const fn = { resumo: tabResumo, compras: tabCompras, fiado: tabFiado, os: tabOS, orc: tabOrc, gar: tabGar, usados: tabUsados }[tab] || tabResumo;
        body.innerHTML = fn();
    }

    const blank = (ic, txt, btn = '') => `<div class="cli-blank"><i class="fas ${ic}"></i>${txt}${btn ? '<br>' + btn : ''}</div>`;
    const secH = (ic, title, right = '') => `<div class="cli-sec-h"><h3><i class="fas ${ic}"></i>${title}</h3><span class="sp"></span>${right}</div>`;
    const dash = '<span class="cli-mute">—</span>';

    /* ---------- Aba: Resumo ---------- */
    function tabResumo() {
        const { c } = D;
        const bd = toDate(c.birthDate);
        const age = bd ? Math.floor((Date.now() - bd.getTime()) / (365.25 * 864e5)) : 0;
        const addr = addrLine(c);
        const limit = Number(c.creditLimit || 0);
        const dl = [
            ['Nome / Razão social', esc(c.name)],
            [c.type === 'pj' ? 'CNPJ' : 'CPF', c.document ? esc(fmtDoc(c.document)) : dash],
            ['Telefone', c.phone ? `<a href="${telHref(c.phone)}">${esc(fmtPhone(c.phone))}</a>` : dash],
            ['WhatsApp', c.whatsapp ? (waNum(c.whatsapp) ? `<a href="https://wa.me/${waNum(c.whatsapp)}" target="_blank" rel="noopener">${esc(fmtPhone(c.whatsapp))}</a>` : esc(fmtPhone(c.whatsapp))) : (c.phone ? '<span class="cli-mute">mesmo do telefone</span>' : dash)],
            ['E-mail', c.email ? `<a href="mailto:${esc(c.email)}">${esc(c.email)}</a>` : dash],
            ['Nascimento', bd ? `${bd.toLocaleDateString('pt-BR')}${age > 0 && age < 120 ? ` <span class="cli-mute">(${age} anos)</span>` : ''}` : dash],
            ['Endereço', addr ? `${esc(addr)} <a class="cli-act" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addr.replace(/ · /g, ', '))}" target="_blank" rel="noopener" title="Ver no mapa"><i class="fas fa-map-location-dot"></i> Mapa</a>` : dash],
            ['Referência', c.addressRef ? esc(c.addressRef) : dash],
            ['Classificação', c.cls === 'vip' ? badge('VIP', 'gold', 'fa-star') : c.cls === 'premium' ? badge('Premium', 'purple', 'fa-gem') : 'Normal'],
            ['Limite de fiado', limit ? money(limit) : '<span class="cli-mute">Sem limite definido</span>'],
            ['Observações', c.notes ? `<span class="cli-notes">${esc(c.notes)}</span>` : dash]
        ].map(([t, v]) => `<dt>${t}</dt><dd>${v}</dd>`).join('');

        const top = topProducts();
        const tl = timeline();
        return `<div class="cli-grid2">
<div>
  <div class="cli-sec">${secH('fa-address-card', 'Dados do cliente', '<button class="cli-act" type="button" data-act="edit"><i class="fas fa-pen"></i><span>Editar</span></button>')}<dl class="cli-dl">${dl}</dl></div>
  <div class="cli-sec">${secH('fa-ranking-star', 'O que mais compra')}${top.length ? `<ul class="cli-top">${top.map((p, i) => `<li><span class="pos">${i + 1}</span><span class="nm">${esc(p.name)}<small>${qtyFmt(p.qty)} ${esc(p.unit || 'un')} · última vez ${fmtD(p.last)}</small></span><span class="vl">${money(p.total)}</span></li>`).join('')}</ul>` : blank('fa-basket-shopping', 'Ainda sem compras para mostrar aqui.')}</div>
</div>
<div>
  <div class="cli-sec">${secH('fa-clock-rotate-left', 'Atividade recente')}${tl.length ? `<ul class="cli-tl">${tl.map(ev => `<li><span class="dot ${ev.cl || ''}"><i class="fas ${ev.ic}"></i></span><div><b>${esc(ev.b)}</b><small>${fmtDT(ev.t)}${ev.s ? ' · ' + esc(ev.s) : ''}</small></div></li>`).join('')}</ul>` : blank('fa-clock', 'Sem movimentações ainda. Use os atalhos acima para vender, abrir OS ou orçar.')}</div>
</div>
</div>`;
    }

    function topProducts() {
        const m = new Map();
        D.sales.filter(s => s.status !== 'cancelled').forEach(s => (s.items || []).forEach(it => {
            const key = it.productId || norm(it.productName); if (!key) return;
            const o = m.get(key) || { name: it.productName || 'Item', qty: 0, total: 0, last: 0, unit: it.unit || '' };
            o.qty += Number(it.quantity || 0); o.total = r2(o.total + Number(it.total != null ? it.total : Number(it.unitPrice || 0) * Number(it.quantity || 0)));
            o.last = Math.max(o.last, ms(s.createdAt)); m.set(key, o);
        }));
        return [...m.values()].sort((a, b) => b.total - a.total).slice(0, 6);
    }

    function timeline() {
        const ev = [];
        D.sales.forEach(s => ev.push({ t: ms(s.createdAt), ic: s.status === 'cancelled' ? 'fa-ban' : 'fa-bag-shopping', cl: s.status === 'cancelled' ? 'bad' : '', b: `Compra ${saleNo(s)} · ${money(s.total)}`, s: s.status === 'cancelled' ? 'Cancelada' : payLabel(s) }));
        D.fin.forEach(e => {
            if (e.status === 'received' && e.paidAt) ev.push({ t: ms(e.paidAt), ic: 'fa-circle-check', cl: 'ok', b: `Pagamento recebido · ${money(e.amount)}`, s: [e.description, PAY[e.paymentMethod]].filter(Boolean).join(' · ') });
            const inst = e.installment && e.installment.total > 1 ? e.installment : null;
            if (!['sale', 'service_order'].includes(e.referenceType) && !e.partialOf && (!inst || inst.number === 1))
                ev.push({ t: ms(e.createdAt), ic: 'fa-hand-holding-dollar', cl: 'warn', b: inst ? `Conta lançada em ${inst.total}x de ${money(e.amount)}` : `Conta lançada · ${money(e.amount)}`, s: String(e.description || '').replace(/ \(1\/\d+\)$/, '') });
        });
        D.os.forEach(o => {
            ev.push({ t: ms(o.createdAt), ic: 'fa-screwdriver-wrench', b: `OS ${osNo(o)} aberta`, s: device(o) });
            if (o.deliveredAt) ev.push({ t: ms(o.deliveredAt), ic: 'fa-box-open', cl: 'ok', b: `OS ${osNo(o)} entregue`, s: money(o.total) });
        });
        D.quotes.forEach(q => ev.push({ t: ms(q.createdAt), ic: 'fa-file-signature', b: `Orçamento ${quoteNo(q)} · ${money(q.total)}`, s: Q_ST[qStatus(q)][0] }));
        D.used.forEach(p => ev.push({ t: ms(p.purchasedAt) || ms(p.createdAt), ic: 'fa-mobile-screen', b: `Loja comprou aparelho · ${money(p.offeredPrice)}`, s: [p.device?.brand, p.device?.model].filter(Boolean).join(' ') }));
        return ev.filter(e => e.t).sort((a, b) => b.t - a.t).slice(0, 12);
    }

    /* ---------- Aba: Compras ---------- */
    function salesFiltered() {
        const days = Number(saleF.period || 0), since = days ? Date.now() - days * 864e5 : 0, q = norm(saleF.q).trim();
        return D.sales.filter(s => (!since || ms(s.createdAt) >= since) && (!q || norm([saleNo(s), ...(s.items || []).map(i => i.productName)].join(' ')).includes(q)));
    }
    function tabCompras() {
        const list = salesFiltered(), valid = list.filter(s => s.status !== 'cancelled'), tot = r2(valid.reduce((a, s) => a + Number(s.total || 0), 0));
        const opt = (v, l) => `<option value="${v}" ${saleF.period === v ? 'selected' : ''}>${l}</option>`;
        const right = `<div class="search-box"><i class="fas fa-search"></i><input type="search" data-in="saleq" placeholder="Buscar produto ou nº da venda" value="${esc(saleF.q)}"></div>
<select class="form-control" data-ch="saleperiod">${opt('0', 'Todo o período')}${opt('30', 'Últimos 30 dias')}${opt('90', 'Últimos 90 dias')}${opt('365', 'Último ano')}</select>
${canGo('pdv.html') ? '<button class="btn btn-primary btn-sm" type="button" data-act="sell"><i class="fas fa-plus"></i> Nova venda</button>' : ''}`;
        const rows = list.slice(0, salesShown).map(saleRow).join('');
        return `<div class="cli-sec">${secH('fa-bag-shopping', 'Compras do cliente', right)}
<div class="cli-sum"><span><b>${plural(valid.length, 'compra', 'compras')}</b></span><span>Total: <b>${money(tot)}</b></span><span>Ticket médio: <b>${money(valid.length ? tot / valid.length : 0)}</b></span>${list.length - valid.length ? `<span>Canceladas: <b>${list.length - valid.length}</b></span>` : ''}</div>
<div class="cli-rows" id="cliSaleRows">${rows || blank('fa-bag-shopping', D.sales.length ? 'Sem compras nesse período ou busca.' : 'Este cliente ainda não comprou.', D.sales.length || !canGo('pdv.html') ? '' : '<button class="btn btn-primary btn-sm" type="button" data-act="sell"><i class="fas fa-cash-register"></i> Fazer a primeira venda</button>')}</div>
${list.length > salesShown ? `<div style="text-align:center;margin-top:10px"><button class="btn btn-outline btn-sm" type="button" data-act="moresales">Mostrar mais (${list.length - salesShown})</button></div>` : ''}</div>`;
    }
    function saleRow(s) {
        const st = SALE_ST[s.status] || SALE_ST.completed, n = (s.items || []).length || Number(s.itemCount || 0);
        const names = (s.items || []).slice(0, 3).map(i => i.productName).filter(Boolean).join(', ') + ((s.items || []).length > 3 ? '…' : '');
        const hasFiado = s.paymentMethod === 'fiado' || (s.payments || []).some(p => p.method === 'fiado');
        const ic = s.status === 'cancelled' ? 'bad' : hasFiado ? 'warn' : '';
        return `<div class="cli-row click ${s.status === 'cancelled' ? 'dim' : ''}" data-sale="${esc(s.id)}">
<div class="cli-row-main"><span class="cli-row-ic ${ic}"><i class="fas ${s.type === 'delivery' ? 'fa-truck-fast' : s.type === 'service_order' ? 'fa-screwdriver-wrench' : 'fa-bag-shopping'}"></i></span>
<div class="cli-row-tx"><b>${esc(saleNo(s))} · ${plural(n, 'item', 'itens')}${names ? ' — ' + esc(names) : ''}</b><small>${fmtDT(s.createdAt)} · ${esc(payLabel(s))}${SALE_TYPE[s.type] ? ' · ' + SALE_TYPE[s.type] : ''}${s.sellerName ? ' · ' + esc(s.sellerName) : ''}</small></div></div>
<div class="cli-row-side">${badge(st[0], st[1])}<div class="cli-row-val"><b>${money(s.total)}</b></div><i class="fas fa-chevron-down cli-mute" style="font-size:11px"></i></div>
</div>`;
    }
    function saleDetail(s) {
        const items = (s.items || []).map(i => `<tr><td>${esc(i.productName || 'Item')}${i.notes ? `<div class="cli-mute" style="font-size:11px">${esc(i.notes)}</div>` : ''}</td><td class="r">${qtyFmt(i.quantity)} ${esc(i._pkgLabel || i.unit || '')}</td><td class="r">${money(i.unitPrice)}</td><td class="r"><b>${money(i.total != null ? i.total : Number(i.unitPrice || 0) * Number(i.quantity || 0))}</b></td></tr>`).join('');
        const pays = (s.payments || []).filter(p => p && p.method).map(p => `${PAY[p.method] || p.method}${p.method === 'credito' && Number(p.installments || 1) > 1 ? ' ' + p.installments + 'x' : ''} ${money(p.amount)}${p.method === 'fiado' && p.dueDate ? ' (vence ' + fmtD(p.dueDate) + ')' : ''}`).join(' + ');
        const meta = [
            pays ? `<span>Pagamento: <b>${esc(pays)}</b></span>` : `<span>Pagamento: <b>${esc(payLabel(s))}</b></span>`,
            Number(s.discount || 0) ? `<span>Desconto: <b>${money(s.discount)}</b></span>` : '',
            Number(s.deliveryFee || 0) ? `<span>Taxa de entrega: <b>${money(s.deliveryFee)}</b></span>` : '',
            s.sellerName ? `<span>Vendedor: <b>${esc(s.sellerName)}</b></span>` : '',
            s.operatorName ? `<span>Operador: <b>${esc(s.operatorName)}</b></span>` : '',
            s.type === 'delivery' && s.address ? `<span>Entrega: <b>${esc(s.address)}</b>${s.motoboyName ? ' · ' + esc(s.motoboyName) : ''}</span>` : '',
            s.serviceOrderNumber ? `<span>Da OS: <b>#OS-${String(s.serviceOrderNumber).padStart(4, '0')}</b></span>` : '',
            s.notes ? `<span>Obs.: <b>${esc(s.notes)}</b></span>` : ''
        ].filter(Boolean).join('');
        const canRepeat = canGo('pdv.html') && (s.items || []).length && s.type !== 'service_order';
        return `<div class="cli-row-det">${items ? `<table class="cli-items"><thead><tr><th>Produto</th><th class="r">Qtd</th><th class="r">Unit.</th><th class="r">Total</th></tr></thead><tbody>${items}</tbody></table>` : ''}<div class="cli-det-meta">${meta}</div>
<div class="cli-det-acts">${canRepeat ? `<button class="btn btn-primary btn-sm" type="button" data-act="repeat" data-id="${esc(s.id)}"><i class="fas fa-rotate-right"></i> Vender de novo no PDV</button>` : ''}${s.serviceOrderId && canGo('ordens-servico.html') ? `<a class="btn btn-outline btn-sm" href="ordens-servico.html?os=${encodeURIComponent(s.serviceOrderId)}"><i class="fas fa-screwdriver-wrench"></i> Abrir OS</a>` : ''}</div></div>`;
    }

    /* ---------- Aba: Fiado / A receber ---------- */
    function finOrigin(e) {
        if (e.referenceType === 'sale') { const s = D.sales.find(x => x.id === e.referenceId); return s ? 'Venda ' + saleNo(s) : 'Venda'; }
        if (e.referenceType === 'service_order') { const o = D.os.find(x => x.id === e.referenceId); return o ? 'OS ' + osNo(o) : 'Ordem de serviço'; }
        return e.partialOf ? 'Saldo de pagamento parcial' : 'Lançamento manual';
    }
    function tabFiado() {
        const k = D.k, t0 = day0().getTime(), fin = canFin(), wa = waNum(mainPhone(D.c));
        let list = D.fin.slice();
        if (finF === 'open') list = list.filter(e => e.status === 'pending');
        else if (finF === 'late') list = list.filter(e => e.status === 'pending' && ms(e.dueDate) && ms(e.dueDate) < t0);
        else if (finF === 'paid') list = list.filter(e => e.status === 'received');
        if (finF === 'open' || finF === 'late') list.sort((a, b) => (ms(a.dueDate) || 9e15) - (ms(b.dueDate) || 9e15));
        else if (finF === 'paid') list.sort((a, b) => ms(b.paidAt) - ms(a.paidAt));
        const right = `${fin ? '<button class="btn btn-outline btn-sm" type="button" data-act="charge"><i class="fas fa-plus"></i> Lançar conta</button>' : ''}${fin && k.nOpen ? '<button class="btn btn-success btn-sm" type="button" data-act="receive"><i class="fas fa-check"></i> Receber pagamento</button>' : ''}${wa && k.nOpen ? '<button class="btn btn-sm cli-btn-wa" type="button" data-act="collect"><i class="fab fa-whatsapp"></i> Cobrar</button>' : ''}`;
        const chip = (id, label) => `<button type="button" class="cli-chip ${finF === id ? 'on' : ''}" data-finf="${id}">${label}</button>`;
        const rows = list.map(e => finRow(e, t0, fin)).join('');
        const emptyTxt = { open: 'Este cliente não tem contas em aberto.', late: 'Sem contas atrasadas.', paid: 'Sem pagamentos recebidos ainda.', all: 'Sem contas lançadas para este cliente.' }[finF];
        return `<div class="cli-sec">${secH('fa-hand-holding-dollar', 'Fiado e contas a receber', right)}
<div class="cli-sum"><span>Em aberto: <b>${money(k.open)}</b></span><span>Atrasado: <b class="${k.late ? 'cli-bad' : ''}">${money(k.late)}</b></span><span>Recebido nos últimos 12 meses: <b class="cli-ok">${money(k.paid12)}</b></span>${Number(D.c.creditLimit || 0) ? `<span>Limite: <b>${money(D.c.creditLimit)}</b></span>` : ''}</div>
<div class="cli-chips" style="margin-bottom:8px">${chip('open', 'Em aberto')}${chip('late', 'Atrasadas')}${chip('paid', 'Recebidas')}${chip('all', 'Todas')}</div>
<div class="cli-rows">${rows || blank('fa-circle-check', emptyTxt, finF === 'open' && fin ? '<button class="btn btn-outline btn-sm" type="button" data-act="charge"><i class="fas fa-plus"></i> Lançar uma conta / fiado</button>' : '')}</div>
${!fin ? '<div class="cli-hint" style="margin-top:8px"><i class="fas fa-lock"></i> Seu perfil não pode receber nem lançar contas. Peça ao administrador.</div>' : ''}</div>`;
    }
    function finRow(e, t0, fin) {
        const due = ms(e.dueDate), late = e.status === 'pending' && due && due < t0, today = e.status === 'pending' && due && day0(new Date(due)).getTime() === t0;
        let ic = 'warn', fa = 'fa-clock', when;
        if (e.status === 'received') { ic = 'ok'; fa = 'fa-circle-check'; when = `Recebido em ${fmtD(e.paidAt)}${e.paymentMethod ? ' · ' + (PAY[e.paymentMethod] || e.paymentMethod) : ''}`; }
        else if (e.status === 'cancelled') { ic = 'muted'; fa = 'fa-ban'; when = 'Cancelada'; }
        else if (late) { ic = 'bad'; fa = 'fa-triangle-exclamation'; when = `<span class="cli-bad">Venceu ${fmtD(due)} · ${daysAgo(due)}</span>`; }
        else if (today) when = '<b style="color:#d97706">Vence hoje</b>';
        else when = due ? `Vence ${fmtD(due)} · ${daysAgo(due)}` : 'Sem vencimento';
        const inst = e.installment && e.installment.total > 1 ? ` · parcela ${e.installment.number}/${e.installment.total}` : '';
        return `<div class="cli-row ${e.status === 'cancelled' ? 'dim' : ''}">
<div class="cli-row-main"><span class="cli-row-ic ${ic}"><i class="fas ${fa}"></i></span>
<div class="cli-row-tx"><b>${esc(e.description || e.category || 'Conta a receber')}</b><small>${esc([e.category, finOrigin(e)].filter(Boolean).join(' · '))}${inst}</small><small>${when}</small></div></div>
<div class="cli-row-side"><div class="cli-row-val"><b class="${late ? 'cli-bad' : ''}">${money(e.amount)}</b>${e.originalAmount ? `<small>de ${money(e.originalAmount)}</small>` : ''}</div>
${fin && e.status === 'pending' ? `<button class="cli-act ok" type="button" data-act="receive1" data-id="${esc(e.id)}"><i class="fas fa-check"></i><span>Receber</span></button><button class="cli-act danger" type="button" data-act="delfin" data-id="${esc(e.id)}" title="Excluir conta"><i class="fas fa-trash"></i></button>` : ''}</div>
</div>`;
    }

    /* ---------- Aba: Ordens de serviço ---------- */
    function tabOS() {
        const right = canGo('ordens-servico.html') ? '<button class="btn btn-primary btn-sm" type="button" data-act="os"><i class="fas fa-plus"></i> Nova OS</button>' : '';
        const rows = D.os.map(o => {
            const st = OS_ST[o.status] || [o.status || '—', 'muted'], pay = OS_PAY[o.paymentStatus];
            return `<div class="cli-row click ${o.status === 'cancelled' ? 'dim' : ''}" data-os="${esc(o.id)}">
<div class="cli-row-main"><span class="cli-row-ic ${o.status === 'ready' ? 'ok' : o.status === 'cancelled' ? 'bad' : ''}"><i class="fas ${o.isWarranty ? 'fa-rotate-left' : 'fa-screwdriver-wrench'}"></i></span>
<div class="cli-row-tx"><b>${esc(osNo(o))} · ${esc(device(o))}${o.isWarranty ? ' · retorno em garantia' : ''}</b><small>Aberta em ${fmtD(o.createdAt)}${o.problemReported ? ' · ' + esc(String(o.problemReported).slice(0, 80)) : ''}</small>${o.technicianName ? `<small>Técnico: ${esc(o.technicianName)}</small>` : ''}</div></div>
<div class="cli-row-side">${badge(st[0], st[1])}<div class="cli-row-val"><b>${money(o.total)}</b>${pay ? `<small class="${pay[1]}">${pay[0]}</small>` : ''}</div><i class="fas fa-chevron-right cli-mute" style="font-size:11px"></i></div>
</div>`;
        }).join('');
        return `<div class="cli-sec">${secH('fa-screwdriver-wrench', 'Ordens de serviço', right)}<div class="cli-rows">${rows || blank('fa-screwdriver-wrench', 'Este cliente ainda não tem ordens de serviço.', right)}</div></div>`;
    }

    /* ---------- Aba: Orçamentos ---------- */
    function tabOrc() {
        const right = canGo('orcamentos.html') ? '<button class="btn btn-primary btn-sm" type="button" data-act="quote"><i class="fas fa-plus"></i> Novo orçamento</button>' : '';
        const rows = D.quotes.map(q => {
            const s = qStatus(q), st = Q_ST[s], n = (q.items || []).length;
            return `<div class="cli-row click ${s === 'rejected' || s === 'expired' ? 'dim' : ''}" data-quote="${esc(q.id)}">
<div class="cli-row-main"><span class="cli-row-ic ${s === 'converted' || s === 'approved' ? 'ok' : ''}"><i class="fas fa-file-signature"></i></span>
<div class="cli-row-tx"><b>Orçamento ${esc(quoteNo(q))} · ${plural(n, 'item', 'itens')}</b><small>${fmtD(q.createdAt)}${q.validUntil ? ' · válido até ' + fmtD(q.validUntil) : ''}${q.saleNumber ? ' · virou a venda #V-' + String(q.saleNumber).padStart(4, '0') : ''}</small></div></div>
<div class="cli-row-side">${badge(st[0], st[1])}<div class="cli-row-val"><b>${money(q.total)}</b></div><i class="fas fa-chevron-right cli-mute" style="font-size:11px"></i></div>
</div>`;
        }).join('');
        return `<div class="cli-sec">${secH('fa-file-signature', 'Orçamentos', right)}<div class="cli-rows">${rows || blank('fa-file-signature', 'Ainda sem orçamentos para este cliente.', right)}</div></div>`;
    }

    /* ---------- Aba: Garantias ---------- */
    function tabGar() {
        const list = D.os.map(o => ({ o, w: warranty(o) })).filter(x => x.w || x.o.isWarranty).sort((a, b) => ((b.w || {}).until || ms(b.o.createdAt)) - ((a.w || {}).until || ms(a.o.createdAt)));
        const right = canGo('garantias.html') ? '<a class="btn btn-outline btn-sm" href="garantias.html"><i class="fas fa-shield-halved"></i> Abrir Garantias</a>' : '';
        const rows = list.map(({ o, w }) => {
            const b = o.isWarranty ? badge('Retorno em garantia', 'info', 'fa-rotate-left') : w.valid ? badge(`Na garantia · ${plural(w.left, 'dia', 'dias')}`, 'ok', 'fa-shield-halved') : badge('Garantia vencida', 'muted');
            return `<div class="cli-row click" data-os="${esc(o.id)}">
<div class="cli-row-main"><span class="cli-row-ic ${w && w.valid ? 'ok' : 'muted'}"><i class="fas fa-shield-halved"></i></span>
<div class="cli-row-tx"><b>${esc(device(o))}</b><small>${esc(osNo(o))}${o.deliveredAt ? ' · entregue em ' + fmtD(o.deliveredAt) : ''}${w ? ` · ${o.warrantyDays} dias, até ${fmtD(w.until)}` : o.warrantyOfNumber ? ' · da OS #OS-' + String(o.warrantyOfNumber).padStart(4, '0') : ''}</small></div></div>
<div class="cli-row-side">${b}<i class="fas fa-chevron-right cli-mute" style="font-size:11px"></i></div></div>`;
        }).join('');
        return `<div class="cli-sec">${secH('fa-shield-halved', 'Garantias dos serviços', right)}<div class="cli-rows">${rows || blank('fa-shield-halved', 'Sem garantias: as garantias aparecem quando uma OS com prazo de garantia é entregue.')}</div></div>`;
    }

    /* ---------- Aba: Aparelhos comprados (usados) ---------- */
    function tabUsados() {
        const right = canGo('usados.html') ? '<a class="btn btn-outline btn-sm" href="usados.html"><i class="fas fa-mobile-screen"></i> Abrir Compra de usados</a>' : '';
        const rows = D.used.map(p => {
            const st = USED_ST[p.status] || [p.status || '—', 'muted'], dv = p.device || {};
            return `<div class="cli-row"><div class="cli-row-main"><span class="cli-row-ic"><i class="fas fa-mobile-screen"></i></span>
<div class="cli-row-tx"><b>${esc([dv.brand, dv.model].filter(Boolean).join(' ') || 'Aparelho')}${p.number ? ' · #' + String(p.number).padStart(4, '0') : ''}</b><small>${fmtD(p.purchasedAt || p.createdAt)}${dv.imei1 ? ' · IMEI ' + esc(dv.imei1) : dv.serial ? ' · Série ' + esc(dv.serial) : ''}${p.paymentMethod ? ' · ' + esc(PAY[p.paymentMethod] || p.paymentMethod) : ''}</small></div></div>
<div class="cli-row-side">${badge(st[0], st[1])}<div class="cli-row-val"><b>${money(p.offeredPrice)}</b><small>pago ao cliente</small></div></div></div>`;
        }).join('');
        return `<div class="cli-sec">${secH('fa-mobile-screen', 'Aparelhos que a loja comprou deste cliente', right)}<div class="cli-rows">${rows}</div></div>`;
    }

    /* ======================= AÇÕES DA FICHA ======================= */
    function onDetailClick(e) {
        const el = e.target.closest('[data-act],[data-tab],[data-finf],[data-sale],[data-os],[data-quote]');
        if (!el) return;
        if (el.dataset.act) { if (el.tagName === 'A') return; e.preventDefault(); return runAction(el.dataset.act, el); }
        if (e.target.closest('a[href],input,select')) return;
        if (el.dataset.tab) return setTab(el.dataset.tab);
        if (el.dataset.finf) { finF = el.dataset.finf; return paintTab(); }
        if (el.dataset.os) { location.href = 'ordens-servico.html?os=' + encodeURIComponent(el.dataset.os); return; }
        if (el.dataset.quote) { location.href = 'orcamentos.html?id=' + encodeURIComponent(el.dataset.quote); return; }
        if (el.dataset.sale) {
            if (e.target.closest('.cli-row-det')) return;
            const open = el.querySelector('.cli-row-det');
            if (open) { open.remove(); el.querySelector('.fa-chevron-up')?.classList.replace('fa-chevron-up', 'fa-chevron-down'); return; }
            const s = D.sales.find(x => x.id === el.dataset.sale); if (!s) return;
            el.insertAdjacentHTML('beforeend', saleDetail(s));
            el.querySelector('.fa-chevron-down')?.classList.replace('fa-chevron-down', 'fa-chevron-up');
        }
    }
    function onDetailChange(e) {
        if (e.target.dataset.ch === 'saleperiod') { saleF.period = e.target.value; salesShown = 40; paintTab(); }
    }
    let saleQT = 0;
    function onDetailInput(e) {
        if (e.target.dataset.in !== 'saleq') return;
        saleF.q = e.target.value; clearTimeout(saleQT);
        saleQT = setTimeout(() => {
            const body = $('cliTabBody'); if (!body) return;
            const pos = e.target.selectionStart; paintTab();
            const inp = body.querySelector('[data-in="saleq"]'); if (inp) { inp.focus(); try { inp.setSelectionRange(pos, pos); } catch (x) { } }
        }, 250);
    }

    function runAction(act, el) {
        const c = D && D.c;
        switch (act) {
            case 'back': return backToList();
            case 'reload': return openDetail(curId, { fromPop: true, tab });
            case 'edit': return openForm(c ? c.id : curId);
            case 'more': return openMenu(el);
            case 'sell': return c && goSell(c);
            case 'os': location.href = 'ordens-servico.html?cliente=' + encodeURIComponent(c.id); return;
            case 'quote': location.href = 'orcamentos.html?cliente=' + encodeURIComponent(c.id); return;
            case 'charge': return openCharge();
            case 'receive': return openReceive(null);
            case 'receive1': return openReceive(el.dataset.id);
            case 'delfin': return delFin(el.dataset.id);
            case 'wa': { const w = waNum(mainPhone(c)); if (w) window.open('https://wa.me/' + w, '_blank'); return; }
            case 'collect': return collect();
            case 'print': return printStatement();
            case 'repeat': return repeatSale(D.sales.find(s => s.id === el.dataset.id));
            case 'moresales': salesShown += 60; return paintTab();
            case 'toggle': return toggleActive();
            case 'copy': return copyData();
            case 'delete': return delCustomer();
        }
    }

    function openMenu(btn) {
        const drop = $('cliDrop'); if (!D || !D.c) return;
        if (drop.classList.contains('open')) return closeMenu();
        const c = D.c;
        drop.innerHTML = `<button type="button" data-act="edit"><i class="fas fa-pen"></i>Editar cadastro</button>
<button type="button" data-act="copy"><i class="fas fa-copy"></i>Copiar dados do cliente</button>
<button type="button" data-act="print"><i class="fas fa-print"></i>Imprimir extrato</button>
<button type="button" data-act="toggle"><i class="fas ${c.inactive ? 'fa-user-check' : 'fa-user-slash'}"></i>${c.inactive ? 'Reativar cliente' : 'Desativar cliente'}</button>
${canDelete() ? '<hr><button type="button" class="danger" data-act="delete"><i class="fas fa-trash"></i>Excluir cliente</button>' : ''}`;
        drop.classList.add('open');
        const r = btn.getBoundingClientRect(), w = drop.offsetWidth, h = drop.offsetHeight;
        drop.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
        drop.style.top = (r.bottom + h + 8 > window.innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6) + 'px';
    }
    function closeMenu() { $('cliDrop')?.classList.remove('open'); }

    function backToList() {
        closeMenu();
        if (pushedDetail && history.state && history.state.cli) { history.back(); return; }
        history.replaceState(null, '', location.pathname);
        showList();
    }
    function showList() {
        curId = null; D = null; pushedDetail = false; show('list'); renderList();
        requestAnimationFrame(() => { try { window.scrollTo(0, listScroll || 0); } catch (e) { } });
    }
    function syncRoute() {
        const p = new URLSearchParams(location.search), id = p.get('id');
        if (id) { if (view === 'detail' && curId === id) return; openDetail(id, { fromPop: true, tab: p.get('aba') || 'resumo' }); }
        else if (view !== 'list') showList();
    }

    async function refreshDetail() {
        if (!curId) return;
        await loadDetail(curId);
        if (view === 'detail') { renderDetail(); }
        renderStats();
    }

    /* ---------- Atalhos para outras telas ---------- */
    function goSell(c) {
        if (!c) return;
        try {
            sessionStorage.removeItem('dp_quote_to_pdv');
            sessionStorage.setItem('dp_pdv_customer', JSON.stringify({ id: c.id, name: c.name, phone: fmtPhone(mainPhone(c)) }));
        } catch (e) { }
        location.href = 'pdv.html';
    }
    function repeatSale(s) {
        if (!s || !D) return;
        const c = D.c;
        const items = (s.items || []).map(i => ({ productId: i.productId || '', productName: i.productName || 'Item', productCode: i.productCode || '', unitPrice: Number(i.unitPrice || 0), quantity: Number(i.quantity || 1), total: i.total != null ? Number(i.total) : r2(Number(i.unitPrice || 0) * Number(i.quantity || 1)), notes: i.notes || '', costPrice: Number(i.costPrice || 0), unit: i.unit || 'un', _factor: Number(i._factor || 1), _pkgLabel: i._pkgLabel || '' }));
        const payload = {
            customerId: c.id, customerName: c.name, customerPhone: fmtPhone(mainPhone(c)), items, discount: 0, deliveryFee: 0, useCurrentPrice: true,
            bannerText: `Repetindo a compra ${saleNo(s)} de ${c.name}. Confira as quantidades e finalize.`, toastText: 'Compra anterior carregada no PDV'
        };
        try { sessionStorage.removeItem('dp_pdv_customer'); sessionStorage.setItem('dp_quote_to_pdv', JSON.stringify(payload)); } catch (e) { toast('error', 'Não foi possível levar para o PDV: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        location.href = 'pdv.html';
    }

    async function toggleActive() {
        const c = D.c, next = c.inactive ? 'active' : 'inactive';
        const run = async () => {
            try { await DS().update('customers', c.id, { status: next }); toast('success', next === 'active' ? 'Cliente reativado' : 'Cliente desativado'); await refreshDetail(); }
            catch (e) { toast('error', 'Erro: ' + esc(e.message)); }
        };
        if (next === 'inactive') Confirm.show('Desativar cliente', `<b>${esc(c.name)}</b> deixa de aparecer na busca do PDV, mas o histórico continua guardado. Você pode reativar quando quiser.`, run);
        else run();
    }
    function delCustomer() {
        const c = D.c, k = D.k;
        const warn = k.nOpen ? `<br><br><b style="color:#ef4444">Atenção: ${esc(c.name)} ainda tem ${money(k.open)} em aberto.</b> As contas continuam no Contas a Receber.` : '';
        Confirm.show('Excluir cliente', `Excluir o cadastro de <b>${esc(c.name)}</b>? As vendas e OS antigas continuam no sistema com o nome dele.${warn}`, async () => {
            try {
                await DS().softDelete('customers', c.id);
                customers = customers.filter(x => x.id !== c.id); openMap.delete(c.id);
                toast('success', 'Cliente excluído'); backToList();
            } catch (e) { toast('error', 'Erro: ' + esc(e.message)); }
        });
    }
    async function copyData() {
        const c = D.c;
        const txt = [c.name, c.document && (c.type === 'pj' ? 'CNPJ: ' : 'CPF: ') + fmtDoc(c.document), mainPhone(c) && 'Telefone: ' + fmtPhone(mainPhone(c)), c.email && 'E-mail: ' + c.email, addrLine(c) && 'Endereço: ' + addrLine(c), c.addressRef && 'Referência: ' + c.addressRef].filter(Boolean).join('\n');
        try { await navigator.clipboard.writeText(txt); toast('success', 'Dados copiados'); }
        catch (e) { const ta = document.createElement('textarea'); ta.value = txt; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); toast('success', 'Dados copiados'); } catch (x) { toast('error', 'Não foi possível copiar: ' + (window.dpErroHumano ? dpErroHumano(x) : (x && x.message))); } ta.remove(); }
    }

    /* ---------- Cobrança no WhatsApp ---------- */
    async function collect() {
        const c = D.c, wa = waNum(mainPhone(c));
        if (!wa) { toast('warning', 'Cadastre o WhatsApp do cliente para cobrar.'); return; }
        const t0 = day0().getTime();
        const pend = D.fin.filter(e => e.status === 'pending').sort((a, b) => (ms(a.dueDate) || 9e15) - (ms(b.dueDate) || 9e15));
        if (!pend.length) { toast('info', 'Este cliente não tem contas em aberto.'); return; }
        const co = await company();
        const lines = pend.slice(0, 15).map(e => `• ${e.description || e.category || 'Conta'} — ${money(e.amount)} — venc. ${fmtD(e.dueDate)}${ms(e.dueDate) && ms(e.dueDate) < t0 ? ' (vencida)' : ''}`);
        if (pend.length > 15) lines.push(`• ...e mais ${pend.length - 15} conta(s)`);
        const first = c.name.split(/\s+/)[0];
        const msg = `Olá, ${first}! Tudo bem?\n\nPassando para lembrar ${pend.length === 1 ? 'da sua conta em aberto' : 'das suas contas em aberto'}${co.name ? ' com a ' + co.name : ''}:\n\n${lines.join('\n')}\n\n*Total em aberto: ${money(sumAmt(pend))}*\n\nQualquer dúvida é só chamar. Obrigado!`;
        window.open(`https://wa.me/${wa}?text=${encodeURIComponent(msg)}`, '_blank');
    }

    /* ======================= MODAIS ======================= */
    function modals() {
        const UF = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
        const wrap = document.createElement('div');
        wrap.innerHTML = `
<div class="modal-overlay" id="modalCliente"><div class="modal cli-modal">
  <div class="modal-header"><h3 id="cliFormTitle"><i class="fas fa-user-plus" style="color:var(--accent);margin-right:8px"></i>Novo cliente</h3><button class="modal-close" type="button" data-close><i class="fas fa-times"></i></button></div>
  <div class="modal-body">
    <div class="cli-fs"><div class="cli-fs-t"><i class="fas fa-user"></i>Dados principais</div><div class="cli-g">
      <div class="cli-photo"><div class="cli-photo-box" id="cliPhotoBox"><span>?</span></div><div><div class="cli-photo-acts"><button type="button" class="btn btn-outline btn-sm" id="cliPhotoBtn"><i class="fas fa-camera"></i> Foto do cliente</button><button type="button" class="btn btn-outline btn-sm" id="cliPhotoRm" style="display:none;color:var(--danger)"><i class="fas fa-trash"></i> Remover</button></div><small>Opcional. Tire a foto pela câmera ou escolha um arquivo; fica na ficha e nas listas.</small><input type="file" id="cliPhotoFile" accept="image/*" data-camera="user" data-camera-max="800" style="display:none"></div></div>
      <div class="form-group cli-s3"><label class="form-label" for="clientNome">Nome completo / Razão social *</label><input type="text" id="clientNome" class="form-control" maxlength="150" autocomplete="off" placeholder="Nome do cliente"></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientTipo">Tipo</label><select id="clientTipo" class="form-control"><option value="pf">Pessoa física</option><option value="pj">Pessoa jurídica</option></select></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientDoc">CPF / CNPJ</label><input type="text" id="clientDoc" class="form-control" inputmode="numeric" autocomplete="off" placeholder="000.000.000-00"></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientNascimento">Data de nascimento</label><input type="date" id="clientNascimento" class="form-control"></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientTelefone">Telefone / celular</label><input type="tel" id="clientTelefone" class="form-control" inputmode="tel" autocomplete="off" placeholder="(00) 00000-0000"></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientWhatsApp">WhatsApp</label><input type="tel" id="clientWhatsApp" class="form-control" inputmode="tel" autocomplete="off" placeholder="(00) 00000-0000">
        <label class="cli-hint" style="display:flex;gap:6px;align-items:center;cursor:pointer;margin-top:6px"><input type="checkbox" id="cliSameWa" style="width:15px;height:15px;accent-color:var(--accent)"> O WhatsApp é o mesmo número do telefone</label></div>
      <div class="form-group cli-s4"><label class="form-label" for="clientEmail">E-mail</label><input type="email" id="clientEmail" class="form-control" autocomplete="off" placeholder="email@exemplo.com"></div>
    </div></div>
    <div class="cli-fs"><div class="cli-fs-t"><i class="fas fa-location-dot"></i>Endereço<small>Digite o CEP que o resto se preenche</small></div><div class="cli-g">
      <div class="form-group cli-s1"><label class="form-label" for="clientCEP">CEP</label><div class="cli-cep"><input type="text" id="clientCEP" class="form-control" inputmode="numeric" autocomplete="off" placeholder="00000-000"><i class="fas fa-magnifying-glass" id="cliCepIc"></i></div></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientRua">Rua / logradouro</label><input type="text" id="clientRua" class="form-control" placeholder="Rua, avenida..."></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientNumero">Número</label><input type="text" id="clientNumero" class="form-control" placeholder="Nº"></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientComplemento">Complemento</label><input type="text" id="clientComplemento" class="form-control" placeholder="Apto, bloco..."></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientBairro">Bairro</label><input type="text" id="clientBairro" class="form-control" placeholder="Bairro"></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientCidade">Cidade</label><input type="text" id="clientCidade" class="form-control" placeholder="Cidade"></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientUF">UF</label><select id="clientUF" class="form-control"><option value="">UF</option>${UF.map(u => `<option value="${u}">${u}</option>`).join('')}</select></div>
      <div class="form-group cli-s4"><label class="form-label" for="clientReferencia">Ponto de referência</label><input type="text" id="clientReferencia" class="form-control" placeholder="Ajuda o entregador a achar o endereço"></div>
    </div></div>
    <div class="cli-fs"><div class="cli-fs-t"><i class="fas fa-sliders"></i>Configurações</div><div class="cli-g">
      <div class="form-group cli-s1"><label class="form-label" for="clientClassificacao">Classificação</label><select id="clientClassificacao" class="form-control"><option value="normal">Normal</option><option value="vip">VIP</option><option value="premium">Premium</option></select></div>
      <div class="form-group cli-s1"><label class="form-label" for="clientStatus">Situação</label><select id="clientStatus" class="form-control"><option value="active">Ativo</option><option value="inactive">Inativo</option></select></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientLimite">Limite de fiado (R$)</label><input type="text" id="clientLimite" class="form-control" inputmode="decimal" placeholder="0,00 = sem limite"></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientPriceList">Tabela de preço</label><select id="clientPriceList" class="form-control"><option value="varejo">Varejo (preço normal)</option><option value="atacado">Atacado (bar, mercadinho, revenda)</option></select></div>
      <div class="form-group cli-s2"><label class="form-label" for="clientDiscPct">Desconto do cliente (%)</label><input type="text" id="clientDiscPct" class="form-control" inputmode="decimal" placeholder="0 = sem desconto"></div>
      <div class="form-group cli-s4"><label class="form-label" for="clientObs">Observações</label><textarea id="clientObs" class="form-control" rows="3" placeholder="Preferências, horários, combinados com o cliente..."></textarea></div>
    </div></div>
  </div>
  <div class="modal-footer"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="cliSaveBtn"><i class="fas fa-check"></i> Salvar cliente</button></div>
</div></div>
<div class="modal-overlay" id="cliRcvModal"><div class="modal cli-modal sm">
  <div class="modal-header"><h3><i class="fas fa-circle-check" style="color:#10b981;margin-right:8px"></i>Receber pagamento</h3><button class="modal-close" type="button" data-close><i class="fas fa-times"></i></button></div>
  <div class="modal-body" id="cliRcvBody"></div>
  <div class="modal-footer"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-success" type="button" id="cliRcvBtn"><i class="fas fa-check"></i> Confirmar recebimento</button></div>
</div></div>
<div class="modal-overlay" id="cliChgModal"><div class="modal cli-modal sm">
  <div class="modal-header"><h3><i class="fas fa-hand-holding-dollar" style="color:#d97706;margin-right:8px"></i>Lançar fiado / conta a receber</h3><button class="modal-close" type="button" data-close><i class="fas fa-times"></i></button></div>
  <div class="modal-body" id="cliChgBody"></div>
  <div class="modal-footer"><button class="btn btn-secondary" type="button" data-close>Cancelar</button><button class="btn btn-primary" type="button" id="cliChgBtn"><i class="fas fa-check"></i> Lançar</button></div>
</div></div>`;
        while (wrap.firstElementChild) document.body.appendChild(wrap.firstElementChild);
        document.querySelectorAll('#modalCliente,#cliRcvModal,#cliChgModal').forEach(m => m.addEventListener('click', e => { if (e.target.closest('[data-close]')) m.classList.remove('active'); }));

        // Máscaras e CEP
        const bindMask = (id, fn) => $(id).addEventListener('input', e => { const v = fn(e.target.value); if (v !== e.target.value) e.target.value = v; });
        bindMask('clientTelefone', maskPhone); bindMask('clientWhatsApp', maskPhone); bindMask('clientDoc', maskDoc);
        $('clientTelefone').addEventListener('input', () => { if ($('cliSameWa').checked) $('clientWhatsApp').value = $('clientTelefone').value; });
        $('cliSameWa').addEventListener('change', syncSameWa);
        $('clientDoc').addEventListener('input', e => { const n = digits(e.target.value).length; if (n === 14) $('clientTipo').value = 'pj'; else if (n === 11) $('clientTipo').value = 'pf'; });
        $('clientCEP').addEventListener('input', e => { const v = maskCep(e.target.value); if (v !== e.target.value) e.target.value = v; if (digits(v).length === 8) lookupCep(digits(v)); });
        $('clientLimite').addEventListener('blur', e => { const v = parseMoney(e.target.value); e.target.value = v ? num2(v) : ''; });
        $('cliSaveBtn').addEventListener('click', () => saveForm(false));
        $('cliRcvBtn').addEventListener('click', doReceive);
        $('cliChgBtn').addEventListener('click', doCharge);
    }
    function syncSameWa() {
        const same = $('cliSameWa').checked, wa = $('clientWhatsApp');
        wa.disabled = same; if (same) wa.value = $('clientTelefone').value;
    }
    let cepSeq = 0;
    async function lookupCep(cep) {
        const ic = $('cliCepIc'), my = ++cepSeq;
        ic.className = 'fas fa-spinner fa-spin';
        try {
            const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const d = await r.json();
            if (my !== cepSeq) return;
            if (d.erro) { ic.className = 'fas fa-circle-xmark cli-bad'; toast('warning', 'CEP não encontrado'); return; }
            const set = (id, v) => { if (v) $(id).value = v; };
            set('clientRua', d.logradouro); set('clientBairro', d.bairro); set('clientCidade', d.localidade); set('clientUF', d.uf);
            ic.className = 'fas fa-circle-check cli-ok';
            setTimeout(() => $('clientNumero').focus(), 60);
        } catch (e) { if (my === cepSeq) { ic.className = 'fas fa-magnifying-glass'; toast('warning', 'Não foi possível buscar o CEP agora. Preencha o endereço à mão.'); } }
    }

    /* ---------- Cadastro / edição ---------- */
    function openForm(id) {
        editingId = id || null;
        const c = id ? ((D && D.c && D.c.id === id) ? D.c : byId(id)) : null;
        if (id && !c) { toast('error', 'Cliente não encontrado'); return; }
        $('cliFormTitle').innerHTML = `<i class="fas ${c ? 'fa-pen' : 'fa-user-plus'}" style="color:var(--accent);margin-right:8px"></i>${c ? 'Editar cliente' : 'Novo cliente'}`;
        const set = (fid, v) => { $(fid).value = v ?? ''; };
        set('clientNome', c ? c.name : ''); set('clientTipo', c ? c.type : 'pf'); set('clientDoc', c ? maskDoc(c.document) : '');
        set('clientNascimento', c && toDate(c.birthDate) ? isoDay(toDate(c.birthDate)) : '');
        set('clientTelefone', c ? maskPhone(c.phone) : ''); set('clientWhatsApp', c ? maskPhone(c.whatsapp) : '');
        set('clientEmail', c ? c.email : ''); set('clientCEP', c ? maskCep(c.zip) : '');
        set('clientRua', c ? (c.street || c.address || '') : ''); set('clientNumero', c ? c.number : ''); set('clientComplemento', c ? c.complement : '');
        set('clientBairro', c ? c.neighborhood : ''); set('clientCidade', c ? c.city : '');
        $('clientUF').value = c && c.state ? String(c.state).toUpperCase() : '';
        set('clientReferencia', c ? c.addressRef : ''); set('clientClassificacao', c ? c.cls : 'normal');
        set('clientStatus', c && c.inactive ? 'inactive' : 'active');
        set('clientLimite', c && Number(c.creditLimit) ? num2(c.creditLimit) : ''); set('clientObs', c ? c.notes : '');
        set('clientPriceList', c && c.priceList === 'atacado' ? 'atacado' : 'varejo'); set('clientDiscPct', c && Number(c.discountPct) > 0 ? String(c.discountPct).replace('.', ',') : ''); // 38.1
        try { if (window.DPEntregas) DPEntregas.customerForm(c); } catch (e) { } // 38.4 · rota de entrega do cliente (entregas-pro-v1.js)
        formPhoto = (c && c.photo) || ''; paintFormPhoto();
        if (!$('cliPhotoBtn').__wired) {
            $('cliPhotoBtn').__wired = true;
            $('cliPhotoBtn').addEventListener('click', () => $('cliPhotoFile').click());
            $('cliPhotoRm').addEventListener('click', () => { formPhoto = ''; $('cliPhotoFile').value = ''; paintFormPhoto(); });
            $('cliPhotoFile').addEventListener('change', async e => { const f = e.target.files && e.target.files[0]; if (!f) return; try { formPhoto = await shrinkPhoto(f); paintFormPhoto(); } catch (err) { toast('error', 'Não deu para usar essa imagem: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); } });
            $('clientNome').addEventListener('input', () => { if (!formPhoto) paintFormPhoto(); });
        }
        $('cliSameWa').checked = !c || !c.whatsapp || phoneDigits(c.whatsapp) === phoneDigits(c.phone);
        syncSameWa(); $('cliCepIc').className = 'fas fa-magnifying-glass';
        $('modalCliente').querySelectorAll('.dpcnpj-st').forEach(x => x.remove());
        $('modalCliente').classList.add('active');
        setTimeout(() => { if (!matchMedia('(pointer: coarse)').matches) $('clientNome').focus(); }, 80);
    }

    function findDup(data, selfId) {
        const doc = digits(data.document), phs = [data.phone, data.whatsapp].map(p => phoneDigits(p).slice(-8)).filter(p => p.length === 8);
        const list = customers.filter(c => c.id !== selfId);
        if (doc.length >= 11) { const c = list.find(x => x._docD === doc); if (c) return { c, why: 'o mesmo CPF/CNPJ' }; }
        if (phs.length) { const c = list.find(x => x._phones.some(p => p.length >= 8 && phs.includes(p.slice(-8)))); if (c) return { c, why: 'o mesmo telefone' }; }
        return null;
    }

    async function saveForm(force) {
        const name = $('clientNome').value.trim();
        if (!name) { toast('warning', 'Informe o nome do cliente'); $('clientNome').focus(); return; }
        const phone = $('clientTelefone').value.trim(), same = $('cliSameWa').checked;
        const street = $('clientRua').value.trim(), number = $('clientNumero').value.trim(), complement = $('clientComplemento').value.trim();
        const data = {
            name, type: $('clientTipo').value, document: $('clientDoc').value.trim(),
            phone, whatsapp: same ? phone : $('clientWhatsApp').value.trim(), email: $('clientEmail').value.trim().toLowerCase(),
            birthDate: $('clientNascimento').value || '',
            zip: $('clientCEP').value.trim(), street, number, complement, address: [street, number, complement].filter(Boolean).join(', '),
            neighborhood: $('clientBairro').value.trim(), city: $('clientCidade').value.trim(), state: $('clientUF').value,
            addressRef: $('clientReferencia').value.trim(), classification: $('clientClassificacao').value, status: $('clientStatus').value,
            creditLimit: r2(parseMoney($('clientLimite').value)), notes: $('clientObs').value.trim(),
            priceList: $('clientPriceList').value === 'atacado' ? 'atacado' : 'varejo', discountPct: Math.min(90, Math.max(0, r2(parseMoney($('clientDiscPct').value)))), // 38.1 · preço de atacado / desconto do cliente no PDV
            photo: formPhoto || '',
            ...(window.DPEntregas ? DPEntregas.customerData() : {}) // 38.4 · routeId (só quando a empresa usa rotas)
        };
        const doc = digits(data.document);
        if (doc && doc.length !== 11 && doc.length !== 14) { toast('warning', 'O CPF tem 11 números e o CNPJ tem 14. Confira o documento.'); $('clientDoc').focus(); return; }
        if (data.email && !/^\S+@\S+\.\S+$/.test(data.email)) { toast('warning', 'Confira o e-mail digitado'); $('clientEmail').focus(); return; }
        const pd = phoneDigits(phone).length;
        if (phone && pd !== 10 && pd !== 11) { toast('warning', 'Telefone incompleto: use DDD + número, ex.: (11) 98765-4321'); $('clientTelefone').focus(); return; }
        if (!force) {
            const dup = findDup(data, editingId);
            if (dup) {
                Confirm.show('Cliente parecido já cadastrado', `Já existe <b>${esc(dup.c.name)}</b> com ${dup.why}.<br><br>Para não duplicar, você pode cancelar e abrir a ficha dele. Salvar mesmo assim?`, () => saveForm(true));
                return;
            }
        }
        const btn = $('cliSaveBtn'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        try {
            let newId = null;
            if (editingId) { await DS().update('customers', editingId, data); toast('success', 'Cliente atualizado!'); }
            else { const r = await DS().create('customers', data); newId = r.id; toast('success', `${esc(name)} cadastrado!`); }
            $('modalCliente').classList.remove('active');
            await loadList().catch(() => { });
            if (newId) openDetail(newId);
            else if (view === 'detail' && curId === editingId) await refreshDetail();
            else renderList();
        } catch (e) { console.error(e); toast('error', 'Erro ao salvar: ' + esc(e.message)); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar cliente'; }
    }

    /* ---------- Receber (um ou vários; aceita valor parcial) ---------- */
    let rcv = null;
    const pendingSorted = () => D.fin.filter(e => e.status === 'pending').sort((a, b) => (ms(a.dueDate) || 9e15) - (ms(b.dueDate) || 9e15));
    function lastMethod() { try { return localStorage.getItem('dp_cli_rcv_method') || 'dinheiro'; } catch (e) { return 'dinheiro'; } }
    function openReceive(onlyId) {
        if (!canFin()) { toast('warning', 'Seu perfil não tem acesso ao financeiro.'); return; }
        const pend = pendingSorted();
        if (!pend.length) { toast('info', 'Este cliente não tem contas em aberto.'); return; }
        // Versões com Crediário: usa o mesmo recebimento de Contas a Receber (multa/juros, parcial, entrada no caixa e comprovante)
        if (window.DPCrediario && typeof DPCrediario.openReceive === 'function') {
            DPCrediario.openReceive({ customerId: D.c.id, label: D.c.name, entryIds: onlyId ? [onlyId] : undefined, onDone: () => refreshDetail() });
            return;
        }
        const sel = new Set(onlyId ? [onlyId] : pend.map(e => e.id));
        rcv = { pend, sel, touched: false };
        const t0 = day0().getTime();
        $('cliRcvBody').innerHTML = `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:10px">Cliente: <b style="color:var(--text-heading)">${esc(D.c.name)}</b> · marque as contas que ele está pagando.</div>
<div class="cli-pay-list">${pend.map(e => { const late = ms(e.dueDate) && ms(e.dueDate) < t0; return `<label class="cli-pay-it"><input type="checkbox" data-rid="${esc(e.id)}" ${sel.has(e.id) ? 'checked' : ''}><span class="tx"><b>${esc(e.description || e.category || 'Conta')}</b><small class="${late ? 'cli-bad' : ''}">Vence ${fmtD(e.dueDate)}${late ? ' · atrasada' : ''}</small></span><span class="vl">${money(e.amount)}</span></label>`; }).join('')}</div>
<div class="cli-g">
  <div class="form-group cli-s2"><label class="form-label" for="cliRcAmt">Valor recebido (R$)</label><input type="text" id="cliRcAmt" class="form-control" inputmode="decimal" style="font-weight:800;font-size:16px"></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliRcMethod">Forma de pagamento</label><select id="cliRcMethod" class="form-control">${RCV_METHODS.map(([v, l]) => `<option value="${v}" ${v === lastMethod() ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliRcDate">Data do recebimento</label><input type="date" id="cliRcDate" class="form-control" value="${isoDay(new Date())}" max="${isoDay(new Date())}"></div>
</div>
<div class="cli-preview" id="cliRcPrev"></div>`;
        const body = $('cliRcvBody');
        body.querySelectorAll('[data-rid]').forEach(cb => cb.addEventListener('change', () => { cb.checked ? rcv.sel.add(cb.dataset.rid) : rcv.sel.delete(cb.dataset.rid); if (!rcv.touched) fillAmt(); rcvPreview(); }));
        $('cliRcAmt').addEventListener('input', () => { rcv.touched = true; rcvPreview(); });
        $('cliRcAmt').addEventListener('blur', e => { const v = parseMoney(e.target.value); if (v) e.target.value = num2(v); });
        fillAmt(); rcvPreview();
        $('cliRcvModal').classList.add('active');
    }
    const rcvSelected = () => rcv.pend.filter(e => rcv.sel.has(e.id));
    function fillAmt() { $('cliRcAmt').value = num2(sumAmt(rcvSelected())); }
    function allocate(list, amount) {
        let left = r2(amount); const full = []; let partial = null;
        for (const e of list) {
            if (left <= 0.004) break;
            const a = r2(e.amount);
            if (left >= a - 0.004) { full.push(e); left = r2(left - a); } else { partial = { e, paid: left, rest: r2(a - left) }; left = 0; }
        }
        return { full, partial, change: r2(left) };
    }
    function rcvPreview() {
        const prev = $('cliRcPrev'), list = rcvSelected(), amt = r2(parseMoney($('cliRcAmt').value));
        prev.className = 'cli-preview';
        if (!list.length) { prev.className = 'cli-preview warn'; prev.innerHTML = 'Marque pelo menos uma conta.'; return; }
        if (amt <= 0) { prev.className = 'cli-preview warn'; prev.innerHTML = 'Informe o valor que o cliente pagou.'; return; }
        const a = allocate(list, amt), applied = r2(amt - a.change);
        const parts = [];
        if (a.full.length) parts.push(`Quita <b>${plural(a.full.length, 'conta', 'contas')}</b> (${money(sumAmt(a.full))})`);
        if (a.partial) parts.push(`${a.full.length ? 'e abate' : 'Abate'} <b>${money(a.partial.paid)}</b> de "${esc(a.partial.e.description || 'Conta')}" — os <b>${money(a.partial.rest)}</b> restantes continuam em aberto com o mesmo vencimento`);
        let html = parts.join(' ') + '.';
        if (a.change > 0) { prev.className = 'cli-preview warn'; html += `<br>O valor passa ${money(a.change)} do total marcado: esse troco não é lançado.`; }
        html += `<br>Depois disso o cliente fica devendo <b>${money(Math.max(0, r2(D.k.open - applied)))}</b>.`;
        prev.innerHTML = html;
    }
    async function doReceive() {
        if (!rcv) return;
        const list = rcvSelected(), amt = r2(parseMoney($('cliRcAmt').value));
        if (!list.length) { toast('warning', 'Marque pelo menos uma conta'); return; }
        if (amt <= 0) { toast('warning', 'Informe o valor recebido'); $('cliRcAmt').focus(); return; }
        const when = $('cliRcDate').value || isoDay(new Date());
        const paidAt = when === isoDay(new Date()) ? ts() : tsAt(new Date(when + 'T12:00:00'));
        const method = $('cliRcMethod').value;
        try { localStorage.setItem('dp_cli_rcv_method', method); } catch (e) { }
        const a = allocate(list, amt), base = { status: 'received', paidAt, paymentMethod: method, receivedBy: uid(), updatedAt: ts() };
        const btn = $('cliRcvBtn'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
        try {
            for (const e of a.full) await db.collection('financial_entries').doc(e.id).update({ ...base, customerName: e.customerName || D.c.name });
            if (a.partial) {
                const { e, paid, rest } = a.partial;
                await db.collection('financial_entries').doc(e.id).update({ ...base, customerName: e.customerName || D.c.name, amount: paid, originalAmount: r2(e.amount), notes: [e.notes, `Pagamento parcial de ${money(paid)}; o restante (${money(rest)}) ficou em nova conta.`].filter(Boolean).join('\n') });
                await db.collection('financial_entries').add({
                    type: 'income', customerId: e.customerId || D.c.id, customerName: e.customerName || D.c.name,
                    debtorName: e.debtorName || '', debtorPhone: e.debtorPhone || '', debtorDoc: e.debtorDoc || '', debtorAddress: e.debtorAddress || '',
                    amount: rest, description: `${String(e.description || 'Conta').replace(/ — saldo restante$/, '')} — saldo restante`, category: e.category || 'Fiado',
                    dueDate: e.dueDate || null, status: 'pending', notes: '', installment: e.installment || null,
                    referenceType: e.referenceType || null, referenceId: e.referenceId || null, saleId: e.saleId || null, partialOf: e.id,
                    deleted: false, createdAt: ts(), createdBy: uid()
                });
            }
            toast('success', `Recebimento de ${money(r2(amt - a.change))} registrado!`);
            $('cliRcvModal').classList.remove('active'); rcv = null;
            await refreshDetail();
        } catch (e) { console.error(e); toast('error', 'Erro ao registrar: ' + esc(e.message)); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar recebimento'; }
    }

    function delFin(id) {
        const e = D.fin.find(x => x.id === id); if (!e) return;
        Confirm.show('Excluir conta', `Excluir "<b>${esc(e.description || 'Conta')}</b>" de ${money(e.amount)}? Use isso só para lançamentos errados. Se o cliente pagou, use <b>Receber</b>.`, async () => {
            try { await db.collection('financial_entries').doc(id).update({ deleted: true, deletedAt: ts(), deletedBy: uid() }); toast('success', 'Conta excluída'); await refreshDetail(); }
            catch (x) { toast('error', 'Erro: ' + esc(x.message)); }
        });
    }

    /* ---------- Lançar fiado / conta ---------- */
    function openCharge() {
        if (!canFin()) { toast('warning', 'Seu perfil não tem acesso ao financeiro.'); return; }
        const d = new Date(); d.setDate(d.getDate() + 30);
        $('cliChgBody').innerHTML = `<div style="font-size:13px;color:var(--text-secondary);margin-bottom:12px">Cliente: <b style="color:var(--text-heading)">${esc(D.c.name)}</b></div>
<div class="cli-g">
  <div class="form-group cli-s4"><label class="form-label" for="cliCgDesc">Descrição</label><input type="text" id="cliCgDesc" class="form-control" maxlength="120" placeholder="Ex.: Compras do mês, empréstimo, serviço..."></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliCgVal">Valor total (R$) *</label><input type="text" id="cliCgVal" class="form-control" inputmode="decimal" placeholder="0,00" style="font-weight:800;font-size:16px"></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliCgDue">1º vencimento *</label><input type="date" id="cliCgDue" class="form-control" value="${isoDay(d)}"></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliCgCat">Categoria</label><select id="cliCgCat" class="form-control"><option>Fiado</option><option>Venda</option><option>Serviço</option><option>Empréstimo</option><option>Outros</option></select></div>
  <div class="form-group cli-s2"><label class="form-label" for="cliCgParc">Parcelas</label><select id="cliCgParc" class="form-control">${Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}">${i ? (i + 1) + 'x (mensal)' : 'À vista (1x)'}</option>`).join('')}</select></div>
  <div class="form-group cli-s4"><label class="form-label" for="cliCgObs">Observações</label><textarea id="cliCgObs" class="form-control" rows="2"></textarea></div>
</div>
<div class="cli-preview" id="cliCgPrev" hidden></div>`;
        const prev = () => {
            const v = r2(parseMoney($('cliCgVal').value)), n = Number($('cliCgParc').value || 1), p = $('cliCgPrev'), lim = Number(D.c.creditLimit || 0);
            const lines = [];
            if (v > 0 && n > 1) lines.push(`${n} parcelas de ${money(Math.floor(v / n * 100) / 100)}${r2(v - Math.floor(v / n * 100) / 100 * n) ? ' (a última leva os centavos)' : ''}, uma por mês.`);
            if (v > 0 && lim && r2(D.k.open + v) > lim) lines.push(`<b class="cli-bad">Passa do limite de fiado</b> (${money(lim)}): o cliente ficaria devendo ${money(r2(D.k.open + v))}.`);
            p.hidden = !lines.length; p.className = 'cli-preview' + (lines.some(l => l.includes('limite')) ? ' warn' : ''); p.innerHTML = lines.join('<br>');
        };
        $('cliCgVal').addEventListener('input', prev); $('cliCgParc').addEventListener('change', prev);
        $('cliCgVal').addEventListener('blur', e => { const v = parseMoney(e.target.value); if (v) e.target.value = num2(v); });
        $('cliChgModal').classList.add('active');
        setTimeout(() => $('cliCgDesc').focus(), 80);
    }
    async function doCharge() {
        const total = r2(parseMoney($('cliCgVal').value)), due = $('cliCgDue').value, n = Number($('cliCgParc').value || 1);
        if (total <= 0) { toast('warning', 'Informe o valor'); $('cliCgVal').focus(); return; }
        if (!due) { toast('warning', 'Informe o vencimento'); return; }
        const c = D.c, desc = $('cliCgDesc').value.trim() || $('cliCgCat').value, cat = $('cliCgCat').value, obs = $('cliCgObs').value.trim();
        const part = Math.floor(total / n * 100) / 100, lastPart = r2(total - part * (n - 1));
        const btn = $('cliChgBtn'); btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Lançando...';
        try {
            for (let p = 0; p < n; p++) {
                const d = new Date(due + 'T12:00:00'); d.setMonth(d.getMonth() + p);
                await db.collection('financial_entries').add({
                    type: 'income', customerId: c.id, customerName: c.name, debtorName: '', debtorPhone: mainPhone(c), debtorDoc: c.document || '',
                    debtorAddress: [streetLine(c), cityOf(c)].filter(Boolean).join(', '),
                    amount: p === n - 1 ? lastPart : part, description: n > 1 ? `${desc} (${p + 1}/${n})` : desc, category: cat,
                    dueDate: tsAt(d), status: 'pending', notes: obs, installment: n > 1 ? { number: p + 1, total: n } : null,
                    deleted: false, createdAt: ts(), createdBy: uid()
                });
            }
            toast('success', n > 1 ? `${n} parcelas lançadas para ${esc(c.name)}` : `${money(total)} lançado para ${esc(c.name)}`);
            $('cliChgModal').classList.remove('active');
            finF = 'open'; tab = 'fiado';
            await refreshDetail();
            setTab('fiado');
        } catch (e) { console.error(e); toast('error', 'Erro ao lançar: ' + esc(e.message)); }
        finally { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Lançar'; }
    }

    /* ======================= IMPRESSÃO ======================= */
    const PRINT_CSS = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Segoe UI',Arial,sans-serif;color:#1e293b;font-size:12px;background:#fff}
.page{padding:28px 32px;max-width:1050px;margin:0 auto}.hd{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;padding-bottom:16px;border-bottom:3px solid #6366f1;margin-bottom:18px}
h1{font-size:20px;font-weight:800}h2{font-size:13px;text-transform:uppercase;letter-spacing:.6px;color:#6366f1;margin:20px 0 8px}.sub{color:#64748b;font-size:11.5px;margin-top:4px;line-height:1.5}.co{text-align:right}.co b{font-size:15px;color:#6366f1}
.sum{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:6px}.sc{border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#f8fafc}.sc span{display:block;font-size:9.5px;font-weight:700;text-transform:uppercase;color:#94a3b8;letter-spacing:.5px}.sc b{font-size:16px}
table{width:100%;border-collapse:collapse}th{background:#eef2ff;color:#4338ca;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:7px 8px}td{padding:7px 8px;border-bottom:1px solid #f1f5f9;font-size:11.5px}.r{text-align:right;white-space:nowrap}.bad{color:#dc2626;font-weight:700}.ok{color:#059669}
tfoot td{font-weight:800;background:#f8fafc;border-top:2px solid #c7d2fe}.ft{margin-top:22px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;color:#94a3b8;font-size:10px}
#pb{position:fixed;top:14px;right:14px;display:flex;gap:8px}#pb button{border:0;border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;cursor:pointer}@media print{#pb{display:none}@page{margin:10mm}}`;
    const PRINT_BTNS = `<div id="pb"><button onclick="window.print()" style="background:#6366f1;color:#fff">🖨️ Imprimir / Salvar PDF</button><button onclick="window.close()" style="background:#f1f5f9;color:#64748b">✕ Fechar</button></div>`;
    function openPrint(title, body) {
        const w = window.open('', '_blank', 'width=1000,height=800');
        if (!w) { toast('warning', 'O navegador bloqueou a janela. Libere os pop-ups deste site.'); return; }
        w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${PRINT_BTNS}<div class="page">${body}</div></body></html>`);
        w.document.close();
    }

    async function printStatement() {
        if (!D || !D.c) return;
        const co = await company(), { c, k } = D, t0 = day0().getTime(), now = new Date();
        const pend = pendingSorted();
        const paid = D.fin.filter(e => e.status === 'received' && ms(e.paidAt) >= Date.now() - 90 * 864e5).sort((a, b) => ms(b.paidAt) - ms(a.paidAt));
        const sales = D.sales.filter(s => s.status !== 'cancelled').slice(0, 20);
        const body = `<div class="hd"><div><h1>Extrato do cliente</h1><div class="sub"><b style="color:#1e293b;font-size:13px">${esc(c.name)}</b><br>${[c.document && (c.type === 'pj' ? 'CNPJ ' : 'CPF ') + esc(fmtDoc(c.document)), mainPhone(c) && esc(fmtPhone(mainPhone(c))), c.email && esc(c.email)].filter(Boolean).join(' · ')}${addrLine(c) ? '<br>' + esc(addrLine(c)) : ''}</div></div>
<div class="co"><b>${esc(co.name || 'Minha empresa')}</b><div class="sub">${[co.cnpj && 'CNPJ ' + esc(co.cnpj), co.phone && esc(fmtPhone(co.phone))].filter(Boolean).join(' · ')}${co.address ? '<br>' + esc(co.address) : ''}<br>Emitido em ${now.toLocaleString('pt-BR')}</div></div></div>
<div class="sum"><div class="sc"><span>Em aberto</span><b>${money(k.open)}</b></div><div class="sc"><span>Atrasado</span><b class="${k.late ? 'bad' : ''}">${money(k.late)}</b></div><div class="sc"><span>Total comprado</span><b>${money(k.total)}</b></div><div class="sc"><span>Compras</span><b>${k.count}</b></div></div>
<h2>Contas em aberto</h2>${pend.length ? `<table><thead><tr><th>Descrição</th><th>Origem</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody>${pend.map(e => { const late = ms(e.dueDate) && ms(e.dueDate) < t0; return `<tr><td>${esc(e.description || e.category || 'Conta')}</td><td>${esc(finOrigin(e))}</td><td class="${late ? 'bad' : ''}">${fmtD(e.dueDate)}${late ? ' (vencida)' : ''}</td><td class="r">${money(e.amount)}</td></tr>`; }).join('')}</tbody><tfoot><tr><td colspan="3" class="r">TOTAL EM ABERTO</td><td class="r">${money(k.open)}</td></tr></tfoot></table>` : '<div class="sub">Nada em aberto. ✔</div>'}
${paid.length ? `<h2>Pagamentos recebidos (últimos 90 dias)</h2><table><thead><tr><th>Data</th><th>Descrição</th><th>Forma</th><th class="r">Valor</th></tr></thead><tbody>${paid.map(e => `<tr><td>${fmtD(e.paidAt)}</td><td>${esc(e.description || e.category || 'Conta')}</td><td>${esc(PAY[e.paymentMethod] || e.paymentMethod || '—')}</td><td class="r ok">${money(e.amount)}</td></tr>`).join('')}</tbody></table>` : ''}
${sales.length ? `<h2>Últimas compras</h2><table><thead><tr><th>Data</th><th>Venda</th><th>Itens</th><th>Pagamento</th><th class="r">Total</th></tr></thead><tbody>${sales.map(s => `<tr><td>${fmtD(s.createdAt)}</td><td>${esc(saleNo(s))}</td><td>${esc((s.items || []).map(i => `${qtyFmt(i.quantity)}x ${i.productName}`).slice(0, 4).join(', '))}${(s.items || []).length > 4 ? '…' : ''}</td><td>${esc(payLabel(s))}</td><td class="r">${money(s.total)}</td></tr>`).join('')}</tbody></table>` : ''}
<div class="ft"><div>${esc(co.name || 'DistribuiPRO')} · Extrato de ${esc(c.name)}</div><div>${now.toLocaleDateString('pt-BR')}</div></div>`;
        openPrint('Extrato — ' + c.name, body);
    }

    async function exportPdf() {
        const list = filtered(), co = await company(), now = new Date();
        const fSel = $('cliF'), tSel = $('cliT');
        const label = [fSel.value ? fSel.options[fSel.selectedIndex].text : '', tSel.value ? tSel.options[tSel.selectedIndex].text : '', $('cliQ').value.trim() ? `Busca: "${$('cliQ').value.trim()}"` : ''].filter(Boolean).join(' · ') || 'Todos os clientes';
        const tot = r2(list.reduce((a, c) => a + Number(c.totalPurchases || 0), 0));
        const open = r2(list.reduce((a, c) => a + ((openMap.get(c.id) || {}).open || 0), 0));
        const rows = list.map((c, i) => { const o = openMap.get(c.id); return `<tr><td style="color:#94a3b8">${i + 1}</td><td><b>${esc(c.name)}</b>${c.email ? `<div style="font-size:10px;color:#94a3b8">${esc(c.email)}</div>` : ''}</td><td>${esc(fmtDoc(c.document)) || '—'}</td><td style="white-space:nowrap">${esc(fmtPhone(mainPhone(c))) || '—'}</td><td>${esc(cityOf(c)) || '—'}</td><td class="r">${money(c.totalPurchases)}</td><td class="r ${o && o.late ? 'bad' : ''}">${o ? money(o.open) : '—'}</td><td>${c.lastPurchase ? fmtD(c.lastPurchase) : '—'}</td><td>${c.inactive ? 'Inativo' : 'Ativo'}${c.cls !== 'normal' ? ' · ' + CLS[c.cls] : ''}</td></tr>`; }).join('');
        openPrint('Clientes — ' + (co.name || 'DistribuiPRO'), `<div class="hd"><div><h1>👥 Cadastro de clientes</h1><div class="sub">${esc(label)}</div></div><div class="co"><b>${esc(co.name || 'DistribuiPRO')}</b><div class="sub">Gerado em ${now.toLocaleString('pt-BR')}</div></div></div>
<div class="sum"><div class="sc"><span>Clientes</span><b>${list.length}</b></div><div class="sc"><span>Ativos</span><b>${list.filter(c => !c.inactive).length}</b></div><div class="sc"><span>Total em compras</span><b>${money(tot)}</b></div><div class="sc"><span>Fiado em aberto</span><b>${money(open)}</b></div></div>
<table><thead><tr><th>#</th><th>Cliente</th><th>CPF/CNPJ</th><th>Telefone</th><th>Cidade</th><th class="r">Compras</th><th class="r">Fiado</th><th>Última compra</th><th>Situação</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td colspan="5" class="r">TOTAL</td><td class="r">${money(tot)}</td><td class="r">${money(open)}</td><td colspan="2"></td></tr></tfoot></table>
<div class="ft"><div>DistribuiPRO · Cadastro de clientes</div><div>${plural(list.length, 'cliente', 'clientes')}</div></div>`);
    }

    /* ======================= INÍCIO ======================= */
    async function boot() {
        if (booted) return; booted = true;
        shell(); modals();
        window.addEventListener('popstate', syncRoute);
        const p = new URLSearchParams(location.search), id = p.get('id');
        if (id) openDetail(id, { replace: true, tab: p.get('aba') || 'resumo' });
        try { await loadList(); }
        catch (e) { console.error(e); $('cliTb').innerHTML = `<tr><td colspan="8" class="cli-empty"><i class="fas fa-triangle-exclamation"></i>Não foi possível carregar os clientes: ${esc(e.message)}</td></tr>`; return; }
        if (view === 'list') renderList(); else renderStats();
        if (p.get('novo') === '1' && !id) openForm(null);
    }
    window.initPage = boot;
    window.dpClientes = { open: (id, o) => openDetail(id, o || {}), edit: id => openForm(id), reload: async () => { await loadList(); renderList(); } };
    // Se o app.js já tiver passado do ponto de chamar initPage, a página sobe sozinha após o login.
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 700); }); } catch (e) { }
})();
