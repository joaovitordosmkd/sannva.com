/* DistribuiPro 38.4 · OS da assistência técnica (B02). Carregado pelo os-pro-v1.js em todas as páginas (as respostas
   dos clientes chegam em qualquer tela); as partes de tela só agem em ordens-servico.html e garantias.html.
   1) Senha / padrão do aparelho: service_orders.deviceLock {type:'none'|'pin'|'password'|'pattern'|'not_informed', value,
      pattern:[0-8]}. Fica mascarada; o olho só aparece para admin, gerente e técnico. Não vai para o link do cliente; desde a
      39.5.1 sai na OS impressa (80 mm e A4) e na "Via da bancada". É apagada sozinha ao faturar, entregar ou cancelar.
   2) Termo de entrada: settings.osEntryTerms (texto pronto e editável em Garantias › Texto da garantia ou no botão
      "Termo de entrada" da tela de OS). Sai na impressão (80 mm e A4) e na assinatura de entrada (na loja e pelo link).
      A OS guarda o texto que o cliente aceitou em checklistIn.termsText (editar o padrão depois não muda a OS).
   3) "Aguardando peça" (status awaiting_parts) com a encomenda em service_orders.partsOrder {supplierId, supplierName, part,
      cost, orderedAt, expectedAt, notes, receivedAt}. "Peça chegou" volta para Em manutenção e grava no histórico.
   4) Sinal / adiantamento: service_orders.deposits [{id, amount, method, at, by, cashRegisterId, movementId}] e depositTotal.
      Entra no caixa aberto (cash_movements referenceType 'service_order_deposit'); o faturamento cobra só o saldo
      (core-services); ao cancelar a OS: devolver (estorno no caixa, do jeito que entrou) ou reter.
   Funciona nas 5 versões (Mensal, MySQL, Firebase, Offline e demo). */
(function () {
    'use strict';
    if (window.OSB || typeof db === 'undefined') return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const LAN = !!window.DISTRIBUIPRO_OFFLINE;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch (e) { return 'Operador'; } };
    const uid = () => { try { return auth.currentUser?.uid || ''; } catch (e) { return ''; } };
    const nowIso = () => new Date().toISOString();
    const osNum = o => '#OS-' + String((o && o.orderNumber) || 0).padStart(4, '0');
    const device = o => [o && o.deviceType, o && o.brand, o && o.model].filter(Boolean).join(' ');
    const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'cliente';
    const ic = (n, fa) => (window.dpIcon && dpIcon(n)) || `<i class="fas ${fa || 'fa-circle'}"></i>`;
    const nativeOpen = window.open;
    const pad2 = n => String(n).padStart(2, '0');
    const ymd = d => d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
    const dayMs = s => { if (!s) return null; const t = Date.parse(String(s).slice(0, 10) + 'T12:00:00'); return isNaN(t) ? null : t; };
    const brDay = s => { const t = dayMs(s); return t ? new Date(t).toLocaleDateString('pt-BR') : ''; };
    const brShort = s => { const t = dayMs(s); return t ? new Date(t).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : ''; };
    // 39.5 · data da OS (Timestamp do Firestore, {seconds}, número ou texto) em milissegundos
    const msOf = v => { if (!v) return 0; try { const d = v.toDate ? v.toDate() : typeof v === 'number' ? new Date(v) : new Date(v.seconds ? v.seconds * 1000 : v.__ts || v); return isNaN(d) ? 0 : d.getTime(); } catch (e) { return 0; } };
    const brTime = ms => ms ?new Date(ms).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';
    const orders = () => { try { return (typeof serviceOrders !== 'undefined' && Array.isArray(serviceOrders)) ? serviceOrders : []; } catch (e) { return []; } };
    const custs = () => { try { return (typeof osCustomers !== 'undefined' && Array.isArray(osCustomers)) ? osCustomers : []; } catch (e) { return []; } };
    const svc = () => (typeof FirestoreService !== 'undefined' ? FirestoreService : (typeof DataService !== 'undefined' ? DataService : null));
    const isVeh = o => !!(window.DPTerm && DPTerm.isVehicle && DPTerm.isVehicle(o));
    const vehMode = () => { try { return !!(window.DPRamo && DPRamo.vehicle && DPRamo.vehicle()); } catch (e) { return false; } };
    function role() { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } }
    // Quem vê a senha guardada: administrador, gerente e técnico (sem cargo = instalação de um usuário só)
    const canSee = () => { const r = role(); return !r || ['admin', 'manager', 'technician'].includes(r); };
    const canEditTerms = () => { const r = role(); return !r || ['admin', 'manager'].includes(r); };
    const PAY = { pix: 'PIX', dinheiro: 'Dinheiro', debito: 'Cartão de débito', credito: 'Cartão de crédito' };

    async function getOs(id) {
        const local = orders().find(x => x.id === id) || null;
        try { const s = await db.collection('service_orders').doc(id).get(); return s.exists ? { id, ...s.data() } : local; } catch (e) { return local; }
    }
    function mergeLocal(id, patch) { const o = orders().find(x => x.id === id); if (o) Object.keys(patch).forEach(k => { if (k !== 'updatedAt') o[k] = patch[k]; }); }
    async function reload() { if (typeof loadServiceOrders === 'function' && $('osTbody')) { try { await loadServiceOrders(); } catch (e) { } } }
    function hist(o, status, label) { const h = Array.isArray(o.statusHistory) ? o.statusHistory.slice() : []; h.push({ status, label, at: nowIso(), by: uname(), uid: uid() }); return h; }

    /* =================== TERMO DE ENTRADA =================== */
    const DEFAULT_TERMS = '1. Backup: fotos, contatos, contas e arquivos são de responsabilidade do cliente. No conserto o aparelho pode ser formatado ou perder dados.\n2. Aparelho molhado (oxidado), que já foi aberto antes ou que chegou sem ligar pode apresentar outros defeitos durante ou depois do conserto, sem culpa da loja.\n3. O orçamento vale por 7 dias. Depois disso o preço das peças pode mudar.\n4. Se o orçamento for recusado, pode ser cobrada a taxa de diagnóstico informada no balcão.\n5. Aparelho não retirado em até 90 dias depois do aviso de pronto (ou do orçamento recusado) poderá ser considerado abandonado, e a loja poderá dar a ele o destino que achar melhor para cobrir as despesas.\n6. A senha ou o padrão de desbloqueio informado é usado só para testar o aparelho e é apagado do sistema na entrega.\n7. A garantia cobre só o serviço feito e as peças trocadas, nas condições do certificado de garantia.';
    const DEFAULT_TERMS_VEH = '1. Retire do veículo objetos de valor. A oficina não responde por objetos deixados e não informados na entrada.\n2. O orçamento vale por 7 dias. Depois disso o preço das peças pode mudar.\n3. Se o orçamento for recusado, pode ser cobrada a taxa de diagnóstico informada no balcão.\n4. O cliente autoriza o teste do veículo na rua pelo mecânico responsável, quando for preciso para o diagnóstico ou para conferir o serviço.\n5. Veículo não retirado em até 5 dias depois do aviso de pronto (ou do orçamento recusado) pode ter cobrança de diária de pátio. Depois de 90 dias poderá ser considerado abandonado.\n6. As peças trocadas ficam à disposição do cliente na retirada; as que não forem retiradas são descartadas.\n7. A garantia cobre só o serviço feito e as peças trocadas, nas condições do certificado de garantia.';
    let cfg = null;
    const settings = () => cfg || (window.OSPRO && OSPRO.settings) || {};
    async function loadCfg() { try { const s = await db.collection('settings').doc(DOC).get(); cfg = s.exists ? (s.data() || {}) : {}; } catch (e) { cfg = cfg || {}; } return cfg; }
    const defaultTerms = () => (vehMode() ? DEFAULT_TERMS_VEH : DEFAULT_TERMS);
    const termsOn = () => settings().osEntryTermsOff !== true;
    const entryTerms = () => termsOn() ? String(settings().osEntryTerms || defaultTerms()).trim() : '';
    // Texto que vale para esta OS: o que o cliente aceitou (guardado na OS) ou o padrão atual da loja
    const termsFor = o => String((o && o.checklistIn && o.checklistIn.termsText) || entryTerms() || '').trim();
    const termsBox = t => t ? `<div class="osb-terms-box"><b>${ic('file-check', 'fa-file-contract')} Termo de entrada</b><div>${esc(t)}</div></div>` : '';
    function termsEditorHtml() {
        const s = settings(), ro = !canEditTerms();
        return `<div class="card osb-terms-card" id="osbTermsCard"><div class="osb-h"><span class="ic">${ic('file-check', 'fa-file-contract')}</span><div><b>Termo de entrada da OS</b><small>Sai na impressão da OS (térmica e A4) e aparece para o cliente antes de assinar a entrada, na loja ou pelo link. Cada OS guarda o texto que o cliente aceitou.</small></div></div>
<label class="osb-switch"><input type="checkbox" id="osbTermsOn"${s.osEntryTermsOff === true ? '' : ' checked'}${ro ? ' disabled' : ''}> Usar termo de entrada nas OS</label>
<textarea id="osbTermsTxt" class="form-control" rows="10"${ro ? ' readonly' : ''}>${esc(s.osEntryTerms || defaultTerms())}</textarea>
${ro ? '<p class="osb-note">Só o administrador ou o gerente pode mudar o termo.</p>' : `<div class="osb-acts"><button type="button" class="btn btn-outline" id="osbTermsReset">Usar o texto padrão</button><button type="button" class="btn btn-primary" id="osbTermsSave">${ic('check', 'fa-check')} Salvar termo</button></div>`}</div>`;
    }
    function bindTermsEditor(root, after) {
        const reset = root.querySelector('#osbTermsReset'), save = root.querySelector('#osbTermsSave');
        if (reset) reset.onclick = () => { root.querySelector('#osbTermsTxt').value = defaultTerms(); };
        if (save) save.onclick = async () => {
            const txt = root.querySelector('#osbTermsTxt').value.trim(), on = root.querySelector('#osbTermsOn').checked;
            save.disabled = true;
            try {
                const patch = { osEntryTerms: txt === defaultTerms() ? '' : txt, osEntryTermsOff: !on };
                await db.collection('settings').doc(DOC).set(patch, { merge: true });
                cfg = { ...(cfg || {}), ...patch }; if (window.OSPRO && OSPRO.settings) Object.assign(OSPRO.settings, patch);
                toast('success', on ? 'Termo de entrada salvo. As OS já assinadas continuam com o texto da época.' : 'Termo de entrada desligado.');
                if (after) after();
            } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } finally { save.disabled = false; }
        };
    }
    // Garantias › Texto da garantia: o termo de entrada fica logo abaixo das condições da garantia
    function mountTermsEditor(container) {
        if (!container || $('osbTermsCard')) return;
        const run = () => { if ($('osbTermsCard')) return; container.insertAdjacentHTML('beforeend', termsEditorHtml()); const card = $('osbTermsCard'); card.style.marginTop = '14px'; card.style.padding = '18px'; bindTermsEditor(card); };
        if (cfg) run(); else loadCfg().then(run);
    }
    async function openTermsEditor() {
        await loadCfg();
        if (!window.OSPRO || !OSPRO.dlg) return;
        const ov = OSPRO.dlg(`<h3>${ic('file-check', 'fa-file-contract')} Termo de entrada</h3>${termsEditorHtml()}`, true);
        const card = ov.querySelector('#osbTermsCard'); card.classList.remove('card'); card.querySelector('.osb-h').remove();
        bindTermsEditor(ov, () => ov.remove());
    }

    /* =================== SENHA / PADRÃO DO APARELHO =================== */
    const LOCK_TYPES = [['not_informed', 'Cliente não informou'], ['none', 'Aparelho sem senha'], ['pin', 'PIN (só números)'], ['password', 'Senha (letras e números)'], ['pattern', 'Padrão (desenho)']];
    const lockLabel = t => (LOCK_TYPES.find(x => x[0] === t) || [0, 'Cliente não informou'])[1];
    const hasSecret = L => !!(L && ((L.type === 'pin' || L.type === 'password') ? L.value : L.type === 'pattern' ? (L.pattern || []).length : false));
    const PT = i => [18 + (i % 3) * 60, 18 + Math.floor(i / 3) * 60];
    const patText = seq => (seq || []).map(i => i + 1).join(' › ');
    function patSvg(seq, show, print) {
        const pts = show ? (seq || []) : [], col = print ? '#000' : '';
        const line = pts.length > 1 ? `<polyline points="${pts.map(i => PT(i).join(',')).join(' ')}" ${print ? 'stroke="#000" stroke-width="5" fill="none" stroke-linecap="round" stroke-linejoin="round"' : 'class="ln"'}/>` : '';
        const dots = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => {
            const [x, y] = PT(i), k = pts.indexOf(i), on = k >= 0;
            return `<circle cx="${x}" cy="${y}" r="${on ? 8 : 5}" ${print ? `fill="${on ? '#000' : '#999'}"` : `class="d${on ? ' on' : ''}"`}/>` + (on ? `<text x="${x + 9}" y="${y - 8}" ${print ? 'font-size="12" font-weight="700" fill="' + col + '"' : 'class="n"'}>${k + 1}</text>` : '');
        }).join('');
        return `<svg viewBox="0 0 156 156" width="${print ? '30mm' : '156'}" height="${print ? '30mm' : '156'}" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${line}${dots}</svg>`;
    }
    let lock = { osId: null, type: 'not_informed', saved: null, pattern: [], padEdit: true, show: false, drawing: false, typed: false, locked: false };
    function lockHtml() {
        return `<div class="form-group os-span-4" id="osbLockWrap"><div class="osb-lock" id="osbLock">
<div class="osb-h"><span class="ic">${ic('lock', 'fa-lock')}</span><div><b>Senha ou padrão de desbloqueio</b><small>Para o técnico testar o aparelho. Sai na OS impressa (não vai para o link do cliente) e é apagada sozinha na entrega.</small></div></div>
<div class="osb-lock-row"><select id="osbLockType" class="form-control">${LOCK_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select>
<div class="osb-val" id="osbValWrap" hidden><input id="osbLockVal" class="form-control osb-mask" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="64"><button type="button" class="btn-icon" id="osbEye" title="Mostrar / esconder">${ic('eye', 'fa-eye')}</button></div></div>
<div class="osb-pat" id="osbPatWrap" hidden><div class="osb-pad" id="osbPad"></div><div class="osb-pat-side"><span id="osbPatTxt"></span><div class="osb-acts-l"><button type="button" class="btn btn-outline btn-sm" id="osbPatEye">${ic('eye', 'fa-eye')} Mostrar</button><button type="button" class="btn btn-outline btn-sm" id="osbPatNew">${ic('pencil', 'fa-pen')} Trocar padrão</button><button type="button" class="btn btn-outline btn-sm" id="osbPatClear">${ic('eraser', 'fa-eraser')} Limpar</button></div></div></div>
<div class="osb-note" id="osbLockNote" hidden></div>
<div class="osb-acts-l" id="osbBenchWrap" hidden><button type="button" class="btn btn-outline btn-sm" id="osbBenchBtn">${ic('printer', 'fa-print')} Imprimir via da bancada</button></div>
</div></div>`;
    }
    function mountLock() {
        if ($('osbLock')) return $('osbLock');
        const grid = $('osImei')?.closest('.os-section')?.querySelector('.os-grid'); if (!grid) return null;
        grid.insertAdjacentHTML('beforeend', lockHtml());
        $('osbLockType').addEventListener('change', e => { lock.type = e.target.value; lock.show = false; if (lock.type === 'pattern' && !(lock.saved && lock.saved.type === 'pattern' && (lock.saved.pattern || []).length)) lock.padEdit = true; paintLock(); });
        $('osbLockVal').addEventListener('input', e => { lock.typed = true; if (lock.type === 'pin') e.target.value = e.target.value.replace(/\D/g, '').slice(0, 16); paintEye(); });
        $('osbEye').addEventListener('click', () => { lock.show = !lock.show; paintEye(); });
        $('osbPatEye').addEventListener('click', () => { lock.show = !lock.show; paintPad(); });
        $('osbPatNew').addEventListener('click', () => { lock.padEdit = true; lock.pattern = []; lock.show = true; paintPad(); });
        $('osbPatClear').addEventListener('click', () => { lock.pattern = []; lock.show = true; paintPad(); });
        $('osbBenchBtn').addEventListener('click', () => { if (lock.osId) printBench(lock.osId); });
        const padEl = $('osbPad');
        const hit = e => { const r = padEl.getBoundingClientRect(), x = (e.clientX - r.left) * 156 / r.width, y = (e.clientY - r.top) * 156 / r.height; for (let i = 0; i < 9; i++) { const [px, py] = PT(i); if (Math.hypot(px - x, py - y) < 24) return i; } return -1; };
        const add = i => {
            if (i < 0 || lock.pattern.includes(i)) return;
            const last = lock.pattern[lock.pattern.length - 1];
            if (last !== undefined) { const ra = Math.floor(last / 3), ca = last % 3, rb = Math.floor(i / 3), cb = i % 3; if ((ra + rb) % 2 === 0 && (ca + cb) % 2 === 0) { const mid = ((ra + rb) / 2) * 3 + (ca + cb) / 2; if (!lock.pattern.includes(mid)) lock.pattern.push(mid); } }
            lock.pattern.push(i); paintPad();
        };
        padEl.addEventListener('pointerdown', e => { if (!lock.padEdit || lock.locked) return; e.preventDefault(); try { padEl.setPointerCapture(e.pointerId); } catch (er) { } lock.drawing = true; lock.show = true; lock.pattern = []; add(hit(e)); paintPad(); });
        padEl.addEventListener('pointermove', e => { if (!lock.drawing) return; e.preventDefault(); add(hit(e)); });
        ['pointerup', 'pointercancel'].forEach(ev => padEl.addEventListener(ev, () => { lock.drawing = false; paintPad(); }));
        return $('osbLock');
    }
    function paintEye() {
        const inp = $('osbLockVal'), eye = $('osbEye'); if (!inp) return;
        // Valor guardado: só admin, gerente e técnico revelam. O que acabou de ser digitado, quem digitou pode conferir.
        const allowed = canSee() || lock.typed;
        inp.classList.toggle('osb-mask', !(lock.show && allowed));
        eye.hidden = !allowed || !inp.value;
        eye.innerHTML = lock.show && allowed ? ic('eye-off', 'fa-eye-slash') : ic('eye', 'fa-eye');
    }
    function paintPad() {
        const savedPat = lock.saved && lock.saved.type === 'pattern' ? (lock.saved.pattern || []) : [];
        const showing = lock.padEdit ? lock.pattern : savedPat;
        const allowed = lock.padEdit ? true : canSee();
        const visible = lock.show && allowed;
        $('osbPad').innerHTML = patSvg(showing, visible || (lock.padEdit && lock.drawing), false);
        $('osbPad').classList.toggle('editing', lock.padEdit && !lock.locked);
        const txt = $('osbPatTxt');
        if (lock.padEdit) txt.innerHTML = lock.pattern.length ? `${lock.pattern.length} pontos · ordem <b>${patText(lock.pattern)}</b>${lock.pattern.length < 4 ? '<br><span class="osb-warn">Ligue pelo menos 4 pontos.</span>' : ''}` : 'Desenhe o padrão com o dedo ou o mouse, começando pelo primeiro ponto (os pontos são numerados de 1 a 9, da esquerda para a direita).';
        else txt.innerHTML = savedPat.length ? (visible ? `Padrão salvo · ordem <b>${patText(savedPat)}</b>` : `Padrão salvo (${savedPat.length} pontos) · <b>oculto</b>${canSee() ? '' : '<br>Só o técnico, o gerente ou o administrador vê.'}`) : 'Nenhum padrão salvo.';
        $('osbPatEye').hidden = lock.padEdit || !canSee() || !savedPat.length;
        $('osbPatEye').innerHTML = visible ? `${ic('eye-off', 'fa-eye-slash')} Esconder` : `${ic('eye', 'fa-eye')} Mostrar`;
        $('osbPatNew').hidden = lock.padEdit || lock.locked;
        $('osbPatClear').hidden = !lock.padEdit || !lock.pattern.length || lock.locked;
    }
    function paintLock() {
        if (!mountLock()) return;
        const wrap = $('osbLockWrap'), o = lock.osId ? orders().find(x => x.id === lock.osId) : null;
        // Oficina (veículo): não tem senha de aparelho
        const veh = o ? isVeh(o) : vehMode();
        wrap.hidden = veh; if (veh) return;
        const sel = $('osbLockType'); sel.value = lock.type; sel.disabled = lock.locked;
        const L = lock.saved, isSecret = lock.type === 'pin' || lock.type === 'password';
        $('osbValWrap').hidden = !isSecret; $('osbPatWrap').hidden = lock.type !== 'pattern';
        const inp = $('osbLockVal');
        if (isSecret) {
            inp.inputMode = lock.type === 'pin' ? 'numeric' : 'text'; inp.disabled = lock.locked;
            const savedSame = L && L.type === lock.type && L.value;
            if (!lock.typed) inp.value = savedSame && canSee() ? L.value : '';
            inp.placeholder = savedSame && !canSee() ? 'Já informada · digite só se for trocar' : (lock.type === 'pin' ? 'Ex.: 1234' : 'Senha do aparelho');
            paintEye();
        }
        if (lock.type === 'pattern') paintPad();
        const note = $('osbLockNote');
        if (L && L.clearedAt) { note.hidden = false; note.innerHTML = `${ic('shield-check', 'fa-shield-halved')} Senha apagada em ${brTime(L.clearedAt)} (${esc(L.clearedWhy || 'OS entregue')}), para proteger os dados do cliente.`; }
        else note.hidden = true;
        $('osbBenchWrap').hidden = !lock.osId;
    }
    function readLock() {
        if (!$('osbLock') || $('osbLockWrap').hidden || lock.locked) return { changed: false };
        // Senha já apagada (OS entregue/cancelada e reaberta) conta como "não informada"
        const t = lock.type, L = lock.saved && !lock.saved.clearedAt ? lock.saved : { type: 'not_informed', value: '', pattern: [] };
        const val = ($('osbLockVal').value || '').trim();
        const data = { type: t, value: '', pattern: [], updatedAt: Date.now(), by: uname() };
        if (t === 'pin' || t === 'password') {
            data.value = val || (L.type === t && !canSee() ? (L.value || '') : '');
            if (!data.value) { toast('warning', t === 'pin' ? 'Digite o PIN do aparelho ou escolha outra opção em "Senha ou padrão".' : 'Digite a senha do aparelho ou escolha outra opção em "Senha ou padrão".'); $('osbLockVal').focus(); return false; }
            if (t === 'pin' && /\D/.test(data.value)) { toast('warning', 'O PIN tem só números. Para letras, escolha "Senha".'); return false; }
        }
        if (t === 'pattern') {
            data.pattern = lock.padEdit ? lock.pattern.slice() : (L.pattern || []).slice();
            if (data.pattern.length < 4) { toast('warning', data.pattern.length ? 'O padrão precisa ligar pelo menos 4 pontos.' : 'Desenhe o padrão de desbloqueio ou escolha outra opção.'); return false; }
        }
        const changed = (L.type || 'not_informed') !== data.type || (L.value || '') !== data.value || (L.pattern || []).join() !== data.pattern.join();
        return { changed, data };
    }
    async function clearLock(id, why) {
        try {
            const s = await db.collection('service_orders').doc(id).get(); if (!s.exists) return;
            const L = (s.data() || {}).deviceLock; if (!hasSecret(L)) return;
            const patch = { deviceLock: { type: L.type, value: '', pattern: [], clearedAt: Date.now(), clearedWhy: why, by: L.by || '' }, updatedAt: ts() };
            await db.collection('service_orders').doc(id).update(patch); mergeLocal(id, patch);
        } catch (e) { console.warn('Senha do aparelho não apagada:', e); }
    }

    /* =================== AGUARDANDO PEÇA =================== */
    let suppliers = null;
    async function loadSuppliers() {
        if (suppliers) return suppliers;
        try { suppliers = (await db.collection('suppliers').get()).docs.map(d => ({ id: d.id, ...(d.data() || {}) })).filter(s => !s.deleted && s.status !== 'inactive').map(s => ({ id: s.id, name: s.fantasyName || s.name || s.razaoSocial || '' })).filter(s => s.name); } catch (e) { suppliers = []; }
        return suppliers;
    }
    const supId = name => { const n = String(name || '').trim().toLowerCase(); const s = (suppliers || []).find(x => x.name.toLowerCase() === n); return s ? s.id : ''; };
    function partsFields(p, pre) {
        p = p || {}; const k = pre || 'osb';
        return `<div class="osb-parts-grid"><label class="osp-lbl osb-span2">Peça encomendada *<input class="form-control" id="${k}Part" maxlength="120" value="${esc(p.part || '')}" placeholder="Ex.: Tela OLED iPhone 13"></label>
<label class="osp-lbl">Fornecedor<input class="form-control" id="${k}Supplier" list="osbSupList" maxlength="120" value="${esc(p.supplierName || '')}" placeholder="De quem foi comprada"></label>
<label class="osp-lbl">Custo da peça (R$)<input class="form-control" id="${k}PartCost" type="number" min="0" step="0.01" value="${p.cost ? r2(p.cost) : ''}"></label>
<label class="osp-lbl">Pedido em<input class="form-control" id="${k}OrderedAt" type="date" value="${esc(p.orderedAt || ymd(new Date()))}"></label>
<label class="osp-lbl">Previsão de chegada<input class="form-control" id="${k}ExpectedAt" type="date" value="${esc(p.expectedAt || '')}"></label>
<label class="osp-lbl osb-full">Observação (só a loja vê)<input class="form-control" id="${k}PartNotes" maxlength="200" value="${esc(p.notes || '')}" placeholder="Ex.: número do pedido, rastreio"></label></div>`;
    }
    function readParts(pre) {
        const k = pre || 'osb', v = id => (($(k + id) || {}).value || '').trim();
        const supplierName = v('Supplier');
        return { part: v('Part'), supplierName, supplierId: supId(supplierName), cost: r2(v('PartCost')), orderedAt: v('OrderedAt'), expectedAt: v('ExpectedAt'), notes: v('PartNotes') };
    }
    const partsLabel = p => `Aguardando peça: ${p.part || 'peça'}${p.expectedAt ? ' · previsão ' + brShort(p.expectedAt) : ''}`;
    function ensureDatalist() { if ($('osbSupList')) return; const dl = document.createElement('datalist'); dl.id = 'osbSupList'; document.body.appendChild(dl); loadSuppliers().then(list => { dl.innerHTML = list.map(s => `<option value="${esc(s.name)}"></option>`).join(''); }); }
    function mountParts() {
        if ($('osbParts')) return $('osbParts');
        const sec = $('osStatus')?.closest('.os-section'); if (!sec) return null;
        ensureDatalist();
        sec.insertAdjacentHTML('beforeend', `<div class="osb-parts" id="osbParts" hidden><div class="osb-h"><span class="ic orange">${ic('package-open', 'fa-box-open')}</span><div><b>Peça encomendada</b><small>O cliente vê no link que a OS está aguardando peça e a previsão de chegada. Fornecedor, custo e observação ficam só com a loja.</small></div></div><div id="osbPartsBody"></div><div class="osb-acts-l" id="osbArrivedWrap" hidden><button type="button" class="btn btn-success btn-sm" id="osbArrived">${ic('package-open', 'fa-box-open')} Peça chegou · voltar para manutenção</button></div></div>`);
        $('osStatus').addEventListener('change', paintParts);
        $('osbArrived').addEventListener('click', async () => { const id = lock.osId; if (!id) return; if (typeof closeModal === 'function') closeModal('osModal'); await partArrived(id); });
        return $('osbParts');
    }
    let partsFor = null;
    function paintParts() {
        if (!mountParts()) return;
        const o = lock.osId ? orders().find(x => x.id === lock.osId) : null, st = $('osStatus').value;
        const box = $('osbParts'); box.hidden = st !== 'awaiting_parts';
        if (partsFor !== (lock.osId || 'new')) { const p = o && o.partsOrder && !o.partsOrder.receivedAt ? o.partsOrder : null; $('osbPartsBody').innerHTML = partsFields(p); partsFor = lock.osId || 'new'; }
        $('osbArrivedWrap').hidden = !(o && o.status === 'awaiting_parts' && st === 'awaiting_parts');
    }
    async function setAwaiting(id, p, notify) {
        const o = await getOs(id); if (!o) return;
        const po = { ...p, receivedAt: null, setAt: Date.now() };
        const patch = { status: 'awaiting_parts', partsOrder: po, statusHistory: hist(o, 'awaiting_parts', partsLabel(po)), updatedAt: ts(), updatedBy: uid() };
        await db.collection('service_orders').doc(id).update(patch); mergeLocal(id, patch);
        toast('success', 'OS em "Aguardando peça".'); await reload();
        if (notify && window.OSPRO && OSPRO.openWhats) OSPRO.openWhats(id); else nudgeParts(id);
    }
    async function partArrived(id) {
        const o = await getOs(id); if (!o) return;
        const po = { ...(o.partsOrder || {}), receivedAt: Date.now() };
        const patch = { status: 'in_progress', partsOrder: po, statusHistory: hist(o, 'in_progress', `Peça chegou${po.part ? ' (' + po.part + ')' : ''} · voltou para manutenção`), updatedAt: ts(), updatedBy: uid() };
        await db.collection('service_orders').doc(id).update(patch); mergeLocal(id, patch);
        toast('success', 'Peça recebida. A OS voltou para "Em manutenção".'); await reload();
    }
    function partsDialog(id) {
        const o = orders().find(x => x.id === id); if (!o || !window.OSPRO) return;
        ensureDatalist();
        const ov = OSPRO.dlg(`<h3>${ic('package-open', 'fa-box-open')} Aguardando peça · ${esc(osNum(o))}</h3><p class="osp-sub">${esc(o.customerName || '')} · ${esc(device(o))}. A OS fica parada em "Aguardando peça" e o cliente vê a previsão no link.</p>${partsFields(o.partsOrder && !o.partsOrder.receivedAt ? o.partsOrder : null, 'osbD')}
<label class="osb-switch"><input type="checkbox" id="osbDWa" checked> Avisar o cliente no WhatsApp com a previsão</label>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-x2>Voltar</button><button type="button" class="btn btn-primary" data-ok>${ic('check', 'fa-check')} Salvar</button></div>`, true);
        ov.querySelector('[data-x2]').onclick = () => ov.remove();
        ov.querySelector('[data-ok]').onclick = async ev => {
            const p = readParts('osbD'); if (!p.part) { toast('warning', 'Informe qual peça está sendo aguardada.'); $('osbDPart').focus(); return; }
            ev.currentTarget.disabled = true; const wa = $('osbDWa').checked; ov.remove();
            try { await setAwaiting(id, p, wa); } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
        setTimeout(() => $('osbDPart')?.focus(), 40);
    }
    function nudgeParts(id) {
        const o = orders().find(x => x.id === id); if (!o) return;
        document.querySelector('.osp-nudge.osb-nudge')?.remove();
        const n = document.createElement('div'); n.className = 'osp-nudge osb-nudge';
        n.innerHTML = `${ic('whatsapp', 'fa-whatsapp')}<div><b>Aguardando peça</b><small>${esc(osNum(o))} · ${esc(o.customerName || '')}</small></div><button type="button" class="btn btn-sm btn-success" style="background:#25d366;border-color:#25d366;color:#fff">Avisar a previsão</button><button type="button" class="osp-nx" aria-label="Fechar">×</button>`;
        n.querySelector('.btn').onclick = () => { n.remove(); if (window.OSPRO) OSPRO.openWhats(id); };
        n.querySelector('.osp-nx').onclick = () => n.remove();
        document.body.appendChild(n); setTimeout(() => n.remove(), 20000);
    }
    // Mensagem pronta (os-pro-v1.js › templates): "Aguardando peça (previsão dd/mm)"
    function waTemplate(o, n, dev, link) {
        const p = o.partsOrder || {}, eta = p.expectedAt && !p.receivedAt ? brDay(p.expectedAt) : '';
        return ['awaiting_parts', 'Aguardando peça' + (eta ? ' (previsão ' + brShort(p.expectedAt) + ')' : ''), `Olá, ${n}! O seu ${dev} (${osNum(o)}) está aguardando a chegada da peça${p.part ? ' (' + p.part + ')' : ''} do fornecedor.${eta ? ` A previsão de chegada é *${eta}*.` : ''} Assim que ela chegar, a gente termina o serviço e te avisa.${link}`];
    }

    /* =================== SINAL / ADIANTAMENTO =================== */
    const depLive = o => (Array.isArray(o.deposits) ? o.deposits : []).filter(d => !d.refundedAt);
    async function findOpenCash() { try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!s.empty) return { id: s.docs[0].id }; } catch (e) { } try { const s = await db.collection('cash_registers').get(); const d = s.docs.find(x => (x.data() || {}).status === 'open'); return d ? { id: d.id } : null; } catch (e) { return null; } }
    async function ensureCash(text, button) {
        const F = window.OSF || {};
        let c = F.openCash ? await F.openCash() : await findOpenCash(); if (c) return c;
        if (!F.askOpenCash) { toast('warning', 'Abra o caixa primeiro (tela Caixa).'); return null; }
        if (!(await F.askOpenCash({ text, button }))) return null;
        return F.openCash ? await F.openCash() : await findOpenCash();
    }
    async function receiveDeposit(id, amount, method, notes) {
        const o = await getOs(id); if (!o) throw new Error('OS não encontrada.');
        if (o.saleId || ['cancelled', 'delivered', 'returned'].includes(o.status)) throw new Error('Esta OS já foi faturada ou cancelada.');
        const total = r2(o.total), paid = r2(o.depositTotal);
        if (total > 0 && r2(paid + amount) - total > 0.009) throw new Error(`O sinal passa do total da OS. O máximo agora é ${money(r2(total - paid))}.`);
        const cash = await ensureCash('Para receber o sinal o caixa precisa estar aberto. Abra agora e o sinal entra em seguida.', 'Abrir caixa e receber'); if (!cash) return null;
        const S = svc(); if (!S) throw new Error('Serviço de dados indisponível.');
        const mov = await S.create('cash_movements', { cashRegisterId: cash.id, type: 'sale', amount, paymentMethod: method, installments: 1, cardBrand: '', feeValue: 0, netAmount: amount, description: `Sinal da OS #${String(o.orderNumber || 0).padStart(4, '0')} - ${o.customerName || 'Cliente'} · ${method}`, referenceId: id, referenceType: 'service_order_deposit', serviceOrderId: id, source: 'service_order', reversed: false });
        const dep = { id: 'dp' + Date.now().toString(36), amount, method, at: Date.now(), by: uname(), byUid: uid(), cashRegisterId: cash.id, movementId: (mov && mov.id) || '', notes: notes || '' };
        const deposits = (Array.isArray(o.deposits) ? o.deposits.slice() : []).concat([dep]);
        const patch = { deposits, depositTotal: r2(paid + amount), depositStatus: 'open', statusHistory: hist(o, o.status, `Sinal recebido: ${money(amount)} (${PAY[method] || method})`), updatedAt: ts(), updatedBy: uid() };
        await db.collection('service_orders').doc(id).update(patch); mergeLocal(id, patch);
        return { o: { ...o, ...patch }, dep };
    }
    async function depositDialog(id) {
        const o = await getOs(id); if (!o || !window.OSPRO) return;
        if (o.saleId || ['cancelled', 'delivered', 'returned'].includes(o.status)) { toast('info', 'Esta OS já foi faturada ou cancelada.'); return; }
        const total = r2(o.total), paid = r2(o.depositTotal), bal = total > 0 ? r2(total - paid) : null;
        if (bal !== null && bal <= 0) { toast('info', 'O sinal já cobre o total desta OS.'); return; }
        const sug = bal !== null ? r2(Math.round(bal * 50) / 100) : '';
        const ov = OSPRO.dlg(`<h3>${ic('hand-coins', 'fa-hand-holding-dollar')} Receber sinal · ${esc(osNum(o))}</h3><p class="osp-sub">${esc(o.customerName || '')} · ${esc(device(o))}. O valor entra no caixa agora e é descontado quando a OS for faturada.</p>
<div class="osb-sum"><div><small>Total da OS</small><b>${total > 0 ? money(total) : 'A definir'}</b></div><div><small>Sinal já pago</small><b>${money(paid)}</b></div><div><small>Falta pagar</small><b>${bal !== null ? money(bal) : '—'}</b></div></div>
<label class="osp-lbl">Valor do sinal (R$) *<input class="form-control" type="number" min="0.01" step="0.01" data-amt value="${sug}"></label>
${bal !== null ? `<div class="osb-chips"><button type="button" data-pct="30">30%</button><button type="button" data-pct="50">50%</button><button type="button" data-pct="100">Tudo</button></div>` : ''}
<label class="osp-lbl">Forma de pagamento<select class="form-control" data-m>${Object.entries(PAY).map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></label>
<label class="osp-lbl">Observação<input class="form-control" data-n maxlength="160" placeholder="Ex.: para encomendar a tela"></label>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-x2>Voltar</button><button type="button" class="btn btn-success" data-ok>${ic('check', 'fa-check')} Receber sinal</button></div>`);
        const amt = ov.querySelector('[data-amt]');
        ov.querySelectorAll('[data-pct]').forEach(b => b.onclick = () => { amt.value = r2(Math.round(bal * Number(b.dataset.pct)) / 100).toFixed(2); });
        ov.querySelector('[data-x2]').onclick = () => ov.remove();
        ov.querySelector('[data-ok]').onclick = async ev => {
            const v = r2(amt.value); if (!(v > 0)) { toast('warning', 'Informe o valor do sinal.'); amt.focus(); return; }
            if (bal !== null && v - bal > 0.009) { toast('warning', `O sinal não pode passar do que falta pagar (${money(bal)}).`); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            try {
                const res = await receiveDeposit(id, v, ov.querySelector('[data-m]').value, ov.querySelector('[data-n]').value.trim());
                if (!res) { btn.disabled = false; return; }
                ov.remove(); toast('success', `Sinal de ${money(v)} recebido na ${osNum(o)}.`);
                await reload(); paintDep(); afterDeposit(res.o, res.dep);
            } catch (e) { btn.disabled = false; toast('error', 'Não foi possível receber o sinal: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
        setTimeout(() => { amt.focus(); amt.select(); }, 40);
    }
    function afterDeposit(o, dep) {
        const ov = OSPRO.dlg(`<h3>${ic('circle-check', 'fa-circle-check')} Sinal recebido</h3><p class="osp-sub">${esc(osNum(o))} · ${esc(o.customerName || '')} · ${money(dep.amount)} (${esc(PAY[dep.method] || dep.method)}). Falta pagar ${r2(o.total) > 0 ? money(Math.max(0, r2(o.total) - r2(o.depositTotal))) : 'o valor que for orçado'}.</p>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-p>${ic('printer', 'fa-print')} Imprimir recibo</button><button type="button" class="btn btn-outline" data-w>${ic('whatsapp', 'fa-whatsapp')} Enviar no WhatsApp</button><button type="button" class="btn btn-primary" data-x2>Fechar</button></div>`);
        ov.querySelector('[data-x2]').onclick = () => ov.remove();
        ov.querySelector('[data-p]').onclick = () => printDepositReceipt(o, dep);
        ov.querySelector('[data-w]').onclick = () => {
            const c = custs().find(x => x.id === o.customerId) || {};
            let ph = String(c.whatsapp || c.phone || c.telefone || c.celular || '').replace(/\D/g, ''); if (ph.length === 10 || ph.length === 11) ph = '55' + ph;
            const rest = r2(o.total) > 0 ? ` Falta pagar na retirada: *${money(Math.max(0, r2(o.total) - r2(o.depositTotal)))}*.` : '';
            const msg = `Olá, ${firstName(o.customerName)}! Recebemos o sinal de *${money(dep.amount)}* (${PAY[dep.method] || dep.method}) da sua ordem de serviço ${osNum(o)} (${device(o) || 'aparelho'}).${rest} Obrigado!`;
            window.open('https://wa.me/' + (ph.length >= 12 ? ph : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
        };
    }
    async function settleDeposit(o, act, cash) {
        const total = r2(o.depositTotal); if (!(total > 0)) return;
        const now = Date.now(), live = depLive(o).filter(d => !d.retainedAt);
        if (act === 'retain') {
            const patch = { deposits: (o.deposits || []).map(d => (!d.refundedAt && !d.retainedAt) ? { ...d, retainedAt: now } : d), depositStatus: 'retained', statusHistory: hist(o, o.status, `Sinal retido pela loja: ${money(total)}`), updatedAt: ts() };
            await db.collection('service_orders').doc(o.id).update(patch); mergeLocal(o.id, patch); return;
        }
        // Devolver do mesmo jeito que entrou: um estorno por forma de pagamento no caixa aberto
        const by = {}; (live.length ? live : [{ method: 'dinheiro', amount: total }]).forEach(d => { by[d.method || 'dinheiro'] = r2((by[d.method || 'dinheiro'] || 0) + Number(d.amount || 0)); });
        const S = svc(), movs = {};
        for (const [method, amt] of Object.entries(by)) {
            const m = await S.create('cash_movements', { cashRegisterId: cash.id, type: 'sale', amount: -amt, paymentMethod: method, installments: 1, cardBrand: '', feeValue: 0, netAmount: -amt, description: `Devolução do sinal da OS #${String(o.orderNumber || 0).padStart(4, '0')} - ${o.customerName || 'Cliente'} · ${method}`, referenceId: o.id, referenceType: 'service_order_deposit_refund', serviceOrderId: o.id, source: 'service_order', reversed: false });
            movs[method] = (m && m.id) || '';
        }
        const how = Object.keys(by).map(k => PAY[k] || k).join(' + ');
        const patch = { deposits: (o.deposits || []).map(d => d.refundedAt ? d : { ...d, refundedAt: now, refundMovementId: movs[d.method || 'dinheiro'] || '', refundCashRegisterId: cash.id }), depositTotal: 0, depositRefunded: r2(Number(o.depositRefunded || 0) + total), depositStatus: 'refunded', statusHistory: hist(o, o.status, `Sinal devolvido ao cliente: ${money(total)} (${how})`), updatedAt: ts() };
        await db.collection('service_orders').doc(o.id).update(patch); mergeLocal(o.id, patch);
    }
    function depPanelHtml() {
        return `<div class="osb-dep" id="osbDep"><div class="osb-h"><span class="ic green">${ic('hand-coins', 'fa-hand-holding-dollar')}</span><div><b>Sinal / adiantamento</b><small>Recebido antes do conserto (ex.: 50% para encomendar a peça). Entra no caixa na hora e é descontado no faturamento.</small></div></div><div id="osbDepBody"></div><div class="osb-acts-l"><button type="button" class="btn btn-outline btn-sm" id="osbDepBtn">${ic('hand-coins', 'fa-hand-holding-dollar')} Receber sinal</button></div></div>`;
    }
    function mountDep() {
        if ($('osbDep')) return $('osbDep');
        const sec = $('osLabor')?.closest('.os-section'); if (!sec) return null;
        sec.insertAdjacentHTML('beforeend', depPanelHtml());
        $('osbDepBtn').addEventListener('click', () => { if (lock.osId) depositDialog(lock.osId); });
        ['osLabor', 'osPartsValue', 'osDiscount'].forEach(k => $(k)?.addEventListener('input', paintDep));
        $('osbDepBody').addEventListener('click', e => { const b = e.target.closest('[data-rec]'); if (!b) return; const o = orders().find(x => x.id === lock.osId); const d = o && (o.deposits || []).find(x => x.id === b.dataset.rec); if (d) printDepositReceipt(o, d); });
        return $('osbDep');
    }
    function paintDep() {
        if (!mountDep()) return;
        const o = lock.osId ? orders().find(x => x.id === lock.osId) : null;
        const ds = o && Array.isArray(o.deposits) ? o.deposits : [];
        const liveTotal = Math.max(0, Number($('osLabor')?.value || 0) + Number($('osPartsValue')?.value || 0) - Number($('osDiscount')?.value || 0));
        const paid = o ? r2(o.depositTotal) : 0, billed = !!(o && (o.saleId || ['cancelled', 'delivered', 'returned'].includes(o.status)));
        $('osbDep').hidden = billed && !ds.length;
        const rows = ds.map(d => `<li class="${d.refundedAt ? 'off' : ''}"><span>${brTime(d.at)} · <b>${money(d.amount)}</b> · ${esc(PAY[d.method] || d.method)}${d.by ? ' · ' + esc(d.by) : ''}${d.refundedAt ? ' · <em>devolvido</em>' : d.retainedAt ? ' · <em>retido</em>' : ''}</span>${d.refundedAt ? '' : `<button type="button" class="btn-icon" data-rec="${esc(d.id)}" title="Imprimir recibo do sinal">${ic('printer', 'fa-print')}</button>`}</li>`).join('');
        $('osbDepBody').innerHTML = (rows ? `<ul class="osb-dep-list">${rows}</ul>` : '<p class="osb-note">Nenhum sinal recebido nesta OS.</p>') + (paid > 0 ? `<div class="osb-sum sm"><div><small>Total da OS</small><b>${money(liveTotal)}</b></div><div><small>Sinal pago</small><b>${money(paid)}</b></div><div><small>Falta pagar</small><b>${money(Math.max(0, r2(liveTotal - paid)))}</b></div></div>${paid - liveTotal > 0.009 ? `<p class="osb-warn">O sinal passou do total da OS. Na entrega, devolva ${money(r2(paid - liveTotal))} ao cliente.</p>` : ''}` : '');
        const btn = $('osbDepBtn'); btn.hidden = billed; btn.disabled = !lock.osId; btn.title = lock.osId ? '' : 'Salve a OS primeiro';
    }

    /* =================== IMPRESSÃO =================== */
    async function companyInfo() { try { return (window.OSPRO && OSPRO.company) ? await OSPRO.company() : {}; } catch (e) { return {}; } }
    async function custOf(o) {
        let c = custs().find(x => x.id === o.customerId);
        if (!c && o.customerId) { try { const s = await db.collection('customers').doc(o.customerId).get(); c = s.exists ? s.data() : null; } catch (e) { } }
        return c || {};
    }
    const THERMAL_CSS = '@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}html,body{margin:0;padding:0;background:#fff}body{width:72mm;max-width:72mm;margin:0 auto;padding:2mm 1.5mm 3mm;font-family:"Courier New",Courier,monospace;color:#000;font-size:10.5px;line-height:1.22;font-weight:700}body *{color:#000!important}.c{text-align:center}.t{font-size:14px;letter-spacing:.4px}.big{font-size:16px;letter-spacing:.06em}.sep{border-top:1px dashed #000;margin:2.2mm 0}.row{display:flex;gap:2mm;justify-content:space-between;padding:.5mm 0}.row span:first-child{flex:0 0 24mm}.row b,.row span+span{text-align:right;overflow-wrap:anywhere}.sec{padding:1mm 0}.sec .h{font-size:9.2px;text-transform:uppercase;margin-bottom:.6mm}.sec .v{white-space:pre-wrap;overflow-wrap:anywhere}.lk{border:1.5px solid #000;border-radius:2mm;padding:2mm;margin:1.5mm 0}.pt{display:flex;gap:3mm;align-items:center}.warn{border:1px dashed #000;padding:1.2mm;margin-top:1.5mm;font-size:9.5px}.sig{margin:10mm 5mm 0;border-top:1px solid #000;text-align:center;padding-top:1mm;font-size:9px}.ft{text-align:center;font-size:8.3px;margin-top:3mm}.screen{text-align:center;margin-top:4mm}.screen button{font:700 13px Arial,sans-serif;padding:9px 16px;border:1px solid #111;border-radius:6px;background:#fff;color:#111;cursor:pointer}@media print{body{margin:0;padding:0}.screen{display:none}}';
    function thermalWin(title, inner) {
        const w = nativeOpen.call(window, '', '_blank', 'width=430,height=900');
        if (!w) { toast('warning', 'Libere as janelas pop-up para imprimir.'); return null; }
        w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${THERMAL_CSS}</style></head><body data-osb-print="1">${inner}<div class="screen"><button onclick="window.print()">Imprimir</button></div></body></html>`);
        w.document.close(); w.focus(); return w;
    }
    // Via da bancada: fica com o aparelho na bancada. Tem a senha/padrão; não é entregue ao cliente.
    async function printBench(id) {
        const o = await getOs(id); if (!o) return;
        const [co, c] = await Promise.all([companyInfo(), custOf(o)]);
        const see = canSee(), L = o.deviceLock || {}, phone = c.whatsapp || c.phone || c.telefone || c.celular || '';
        let lk;
        if (L.clearedAt) lk = `<div class="lk c">Senha apagada em ${brTime(L.clearedAt)}</div>`;
        else if (L.type === 'pin' || L.type === 'password') lk = `<div class="lk"><div class="row"><span>${L.type === 'pin' ? 'PIN:' : 'SENHA:'}</span><b class="big">${see ? esc(L.value) : '•••• (só o técnico vê)'}</b></div></div>`;
        else if (L.type === 'pattern') lk = `<div class="lk"><div>PADRÃO DE DESBLOQUEIO:</div>${see ? `<div class="pt">${patSvg(L.pattern, true, true)}<div>Ordem:<br><span class="big">${patText(L.pattern)}</span><br><small>(pontos 1 a 9, da esquerda para a direita, de cima para baixo)</small></div></div>` : '<div>•••• (só o técnico vê)</div>'}</div>`;
        else lk = `<div class="lk"><div class="row"><span>Bloqueio:</span><b>${esc(lockLabel(L.type || 'not_informed'))}</b></div></div>`;
        const ck = window.OSPRO && OSPRO.checkSummary ? OSPRO.checkSummary(o.checklistIn) : null;
        const fails = ck ? ck.items.filter(i => i.state === 'fail').map(i => i.label) : [];
        const st = (typeof OS_STATUS !== 'undefined' && OS_STATUS[o.status] && OS_STATUS[o.status][0]) || o.status || '';
        const p = o.partsOrder && o.status === 'awaiting_parts' ? o.partsOrder : null;
        const sec = (h, v) => v && String(v).trim() ? `<div class="sec"><div class="h">${esc(h)}</div><div class="v">${esc(v)}</div></div>` : '';
        // 39.14.4 · O que foi digitado sai (diagnóstico, serviço, peças e os itens, sem preço: é a via do técnico); vazio não sai
        thermalWin('Via da bancada ' + osNum(o), `<div class="c t">VIA DA BANCADA</div><div class="c">Uso interno · não entregar ao cliente</div><div class="sep"></div>
<div class="c big">${esc(osNum(o).replace('#', ''))}</div><div class="c">${esc(co.name || '')}</div><div class="sep"></div>
<div class="row"><span>Cliente:</span><b>${esc(o.customerName || '')}</b></div>${phone ? `<div class="row"><span>Contato:</span><b>${esc(phone)}</b></div>` : ''}
<div class="row"><span>Aparelho:</span><b>${esc(device(o) || '—')}</b></div>${o.imei ? `<div class="row"><span>IMEI:</span><b>${esc(o.imei)}</b></div>` : ''}${o.serial ? `<div class="row"><span>Série:</span><b>${esc(o.serial)}</b></div>` : ''}
<div class="row"><span>Status:</span><b>${esc(st)}</b></div>${o.technicianName ? `<div class="row"><span>Técnico:</span><b>${esc(o.technicianName)}</b></div>` : ''}${o.estimatedDate && typeof osDate === 'function' ? `<div class="row"><span>Previsão:</span><b>${esc(osDate(o.estimatedDate))}</b></div>` : ''}
${lk}
${sec('Problema relatado', o.problemReported)}${sec('Acessórios recebidos', o.accessories)}${sec('Condição na entrada', o.entryCondition)}
${sec('Diagnóstico técnico', o.diagnosis)}${sec('Serviço a executar', o.serviceDescription)}${sec('Peças / itens', o.partsDescription)}${sec('Itens da OS', (Array.isArray(o.items) ? o.items : []).filter(i => i && String(i.name || '').trim()).map(i => `${(Number(i.qty) || 1).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}x ${i.name}${i.kind === 'service' ? ' (serviço)' : ''}`).join('\n'))}
${fails.length || (ck && ck.battery) ? `<div class="sec"><div class="h">Checklist de entrada</div><div class="v">${fails.length ? 'Com defeito: ' + esc(fails.join(', ')) : 'Sem defeitos marcados'}${ck && ck.battery ? '\n' + esc(ck.gauge || 'Bateria') + ': ' + esc(ck.battery) + '%' : ''}</div></div>` : ''}
${p ? `<div class="warn">AGUARDANDO PEÇA: ${esc(p.part || '')}${p.supplierName ? ' · ' + esc(p.supplierName) : ''}${p.expectedAt ? ' · chega ' + esc(brDay(p.expectedAt)) : ''}</div>` : ''}
${sec('Observações internas', o.notes)}
<div class="ft">A senha é apagada do sistema na entrega do aparelho.<br>${esc(new Date().toLocaleString('pt-BR'))}</div>`);
    }
    async function printDepositReceipt(o, dep) {
        const co = await companyInfo(), rest = r2(o.total) > 0 ? Math.max(0, r2(o.total) - r2(o.depositTotal)) : null;
        thermalWin('Recibo de sinal ' + osNum(o), `<div class="c t">${esc(co.name || '')}</div>${co.phone ? `<div class="c">${esc(co.phone)}</div>` : ''}<div class="sep"></div><div class="c t">RECIBO DE SINAL</div><div class="c">${esc(osNum(o))}</div><div class="sep"></div>
<div class="row"><span>Data:</span><b>${brTime(dep.at)}</b></div><div class="row"><span>Cliente:</span><b>${esc(o.customerName || '')}</b></div><div class="row"><span>Aparelho:</span><b>${esc(device(o) || '—')}</b></div>
<div class="sep"></div><div class="row"><span>Valor do sinal:</span><b class="big">${money(dep.amount)}</b></div><div class="row"><span>Forma:</span><b>${esc(PAY[dep.method] || dep.method)}</b></div>
${r2(o.total) > 0 ? `<div class="row"><span>Total da OS:</span><b>${money(o.total)}</b></div><div class="row"><span>Falta pagar:</span><b>${money(rest)}</b></div>` : '<div class="sec">O valor do serviço ainda será orçado. O sinal será descontado do total.</div>'}
${dep.notes ? `<div class="sec"><div class="h">Observação</div><div class="v">${esc(dep.notes)}</div></div>` : ''}
<div class="sec">Este valor será descontado no faturamento da OS. Em caso de desistência, a devolução segue o termo de entrada.</div>
<div class="sig">Recebido por ${esc(dep.by || co.name || '')}</div><div class="ft">${esc(co.name || '')}${co.address ? '<br>' + esc(co.address) : ''}</div>`);
    }
    // Via do cliente (térmica e A4): sinal pago, saldo, previsão da peça, termo de entrada/entrega, garantia e a senha (39.5.1).
    function injectPrint(win, o) {
        try {
            const doc = win && win.document; if (!doc || doc.body?.dataset.osbPrint || doc.getElementById('osbPrintCss')) return;
            const thermal = !!doc.querySelector('.receipt'), a4 = !!doc.querySelector('.page .end'); if (!thermal && !a4) return;
            const st = doc.createElement('style'); st.id = 'osbPrintCss';
            st.textContent = thermal ? '.osb-pt{margin:2mm 0;padding-top:1.6mm;border-top:1px dashed #000;page-break-inside:avoid}.osb-pt .h{font-size:9.4px;text-transform:uppercase;margin-bottom:.8mm}.osb-pt .x{font-size:8.4px;line-height:1.25;white-space:pre-wrap;overflow-wrap:anywhere}.osb-due{font-size:12px}'
                : '.osb-pt{margin-top:14px;font-size:10px;line-height:1.5;color:#334155;white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;break-inside:avoid}.osb-pt b{display:block;font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px;white-space:normal}.sum .osb-due td{font-size:14px;font-weight:900;color:#0f172a}';
            doc.head.appendChild(st);
            const dep = r2(o.depositTotal);
            if (dep > 0 && !o.saleId) {
                const due = Math.max(0, r2(r2(o.total) - dep));
                if (thermal) { const tot = doc.querySelector('.total'); if (tot) tot.insertAdjacentHTML('afterend', `<div class="money-row"><span>Sinal pago</span><span>- ${money(dep)}</span></div><div class="money-row osb-due"><span>SALDO A PAGAR</span><span>${money(due)}</span></div>`); }
                else { const tb = doc.querySelector('.sum table tbody') || doc.querySelector('.sum table'); if (tb) tb.insertAdjacentHTML('beforeend', `<tr><td>Sinal pago</td><td class="r">- ${money(dep)}</td></tr><tr class="osb-due"><td>Saldo a pagar</td><td class="r">${money(due)}</td></tr>`); }
            }
            const p = o.partsOrder;
            if (o.status === 'awaiting_parts' && p && p.expectedAt) {
                const txt = `${p.part ? p.part + ' · ' : ''}previsão ${brDay(p.expectedAt)}`;
                if (thermal) { const r = [...doc.querySelectorAll('.row')].find(x => /^Status/.test((x.querySelector('.key') || {}).textContent || '')); if (r) r.insertAdjacentHTML('afterend', `<div class="row"><span class="key">Peça:</span><span class="value">${esc(txt)}</span></div>`); }
                else { const s = doc.querySelector('.doc .st'); if (s) s.insertAdjacentHTML('afterend', `<p>Peça: <b>${esc(txt)}</b></p>`); }
            }
            const t = !['delivered', 'cancelled', 'returned'].includes(o.status) ? termsFor(o) : '';
            if (t) {
                if (thermal) { const sig = doc.querySelector('.signature'); if (sig) { sig.insertAdjacentHTML('beforebegin', `<div class="osb-pt"><div class="h">Termo de entrada</div><div class="x">${esc(t)}</div></div>`); sig.textContent = 'Assinatura do cliente (de acordo com o termo)'; } }
                else { const end = doc.querySelector('.page .end'); if (end) end.insertAdjacentHTML('beforebegin', `<div class="osb-pt"><b>Termo de entrada</b>${esc(t)}</div>`); }
            }
            // 39.5 · OS entregue: o termo de saída e a garantia saem na MESMA folha da OS (antes era o certificado à parte)
            if (o.status === 'delivered') {
                const days = Number(o.warrantyDays || 0), from = msOf(o.deliveredAt) || msOf(o.readyAt) || Date.now(), until = from + days * 864e5;
                const P = window.OSPRO, wt = days > 0 ? String((P && P.settings && P.settings.warrantyTerms) || (P && P.DEFAULT_TERMS) || '').trim() : '';
                const gar = days > 0 ? `${days} dias: de ${new Date(from).toLocaleDateString('pt-BR')} até ${new Date(until).toLocaleDateString('pt-BR')}` : 'Este serviço não tem garantia.';
                const saida = `Declaro que recebi o ${isVeh(o) ? 'veículo' : 'aparelho'} descrito nesta ordem de serviço em ${new Date(from).toLocaleDateString('pt-BR')}, testado e funcionando conforme o serviço realizado, e que estou de acordo com os valores e com as condições da garantia.`;
                if (thermal) {
                    const sig = doc.querySelector('.signature');
                    const html = `<div class="osb-pt"><div class="h">Garantia</div><div class="x"><b>${esc(gar)}</b></div></div>${wt ? `<div class="osb-pt"><div class="h">Condições da garantia</div><div class="x">${esc(wt)}</div></div>` : ''}<div class="osb-pt"><div class="h">Termo de entrega</div><div class="x">${esc(saida)}</div></div>`;
                    if (sig) { sig.insertAdjacentHTML('beforebegin', html); sig.textContent = 'Recebi o aparelho · assinatura do cliente'; }
                } else {
                    const end = doc.querySelector('.page .end');
                    if (end) end.insertAdjacentHTML('beforebegin', `<div class="osb-pt osb-gar"><b>Garantia</b><span style="font-size:13px;font-weight:800;color:#0f172a">${esc(gar)}</span></div>${wt ? `<div class="osb-pt"><b>Condições da garantia</b>${esc(wt)}</div>` : ''}<div class="osb-pt"><b>Termo de entrega (saída)</b>${esc(saida)}</div>`);
                    const t1 = doc.querySelector('.doc .t'); if (t1) t1.textContent = days > 0 ? 'OS · ENTREGA E GARANTIA' : 'OS · ENTREGA';
                    const s1 = doc.querySelector('.sign div'); if (s1) s1.textContent = 'Recebi o aparelho — ' + (o.customerName || 'Cliente');
                }
            }
            // 39.14.5 · Devolvido sem reparo: termo de devolução (sem garantia) e "Recebi o aparelho sem reparo"
            if (o.status === 'returned') {
                const obj = isVeh(o) ? 'veículo' : 'aparelho', ret = msOf(o.returnedAt);
                const termo = `Declaro que recebi de volta o ${obj} descrito nesta ordem de serviço${ret ? ' em ' + brTime(ret) : ''}, SEM REPARO (${o.returnReasonText || 'devolvido sem conserto'}), da mesma maneira que foi deixado na loja, com os acessórios entregues na entrada. Nenhum serviço foi executado e nada foi cobrado por reparo.`;
                if (thermal) { const sig = doc.querySelector('.signature'); if (sig) { sig.insertAdjacentHTML('beforebegin', `<div class="osb-pt"><div class="h">Termo de devolução sem reparo</div><div class="x">${esc(termo)}</div></div>`); sig.textContent = `Recebi o ${obj} sem reparo · assinatura do cliente`; } }
                else {
                    const end = doc.querySelector('.page .end'); if (end) end.insertAdjacentHTML('beforebegin', `<div class="osb-pt"><b>Termo de devolução sem reparo</b>${esc(termo)}</div>`);
                    const t1 = doc.querySelector('.doc .t'); if (t1) t1.textContent = 'OS · DEVOLUÇÃO SEM REPARO';
                    const s1 = doc.querySelector('.sign div'); if (s1) s1.textContent = `Recebi o ${obj} sem reparo — ` + (o.customerName || 'Cliente');
                }
            }
            // 39.5 · Senha / padrão do aparelho SEMPRE na OS impressa (pedido do dono: o técnico precisa dela para testar).
            // Some sozinha depois da entrega, porque o sistema apaga a senha ao faturar/entregar/cancelar.
            {
                const L = o.deviceLock;
                if (L && !L.clearedAt && hasSecret(L)) {
                    const lab = L.type === 'pattern' ? 'Padrão de desbloqueio' : L.type === 'pin' ? 'PIN do aparelho' : 'Senha do aparelho';
                    const val = L.type === 'pattern' ? `<div style="display:flex;gap:10px;align-items:center">${patSvg(L.pattern, true, true)}<span>Ordem: <b>${esc(patText(L.pattern))}</b><br><small>pontos 1 a 9, da esquerda para a direita, de cima para baixo</small></span></div>` : `<b style="font-size:16px;letter-spacing:1px">${esc(L.value)}</b>`;
                    if (thermal) { const r = doc.querySelector('.signature') || doc.querySelector('.total'); if (r) r.insertAdjacentHTML('beforebegin', `<div class="osb-pt"><div class="h">${lab}</div><div class="x">${val}</div></div>`); }
                    else { const box = [...doc.querySelectorAll('.box')][1] || doc.querySelector('.box'); if (box) box.insertAdjacentHTML('afterend', `<div class="osb-pt" style="border:2px solid #0f172a"><b>${lab} · para o técnico testar o aparelho</b>${val}</div>`); }
                }
            }
        } catch (e) { console.warn('Impressão da OS (sinal/termo):', e); }
    }

    /* =================== DADOS PÚBLICOS (link do cliente) =================== */
    // Vai para os_tracking junto com o resto (os-extras-v1.js › snapshot). Sem senha, sem fornecedor e sem custo.
    function publicExtra(o) {
        const p = o.partsOrder && !o.partsOrder.receivedAt ? o.partsOrder : null;
        return { partsName: o.status === 'awaiting_parts' && p ? String(p.part || '') : '', partsEta: o.status === 'awaiting_parts' && p ? dayMs(p.expectedAt) : null, depositTotal: o.saleId ? 0 : r2(o.depositTotal), entryTerms: termsFor(o) };
    }
    const publicSig = o => [o.partsOrder ? (o.partsOrder.part || '') + (o.partsOrder.expectedAt || '') + (o.partsOrder.receivedAt ? 1 : 0) : '', r2(o.depositTotal), o.checklistIn && o.checklistIn.termsText ? o.checklistIn.termsText.length : 0].join('|');

    /* =================== LISTA DE OS =================== */
    function decorate() {
        const tb = $('osTbody'); if (!tb) return;
        tb.querySelectorAll('tr').forEach(tr => {
            tr.querySelectorAll('.osb-row,.osb-tag').forEach(x => x.remove());
            const act = tr.querySelector('.os-actions'); if (!act) return;
            const id = (act.innerHTML.match(/printServiceOrder\('([^']+)'\)/) || [])[1]; if (!id) return;
            const o = orders().find(x => x.id === id); if (!o) return;
            const tds = tr.children;
            const p = o.partsOrder;
            if (o.status === 'awaiting_parts' && p && tds[4]) {
                const late = p.expectedAt && dayMs(p.expectedAt) < dayMs(ymd(new Date()));
                tds[4].insertAdjacentHTML('beforeend', `<div class="osb-tag osb-eta${late ? ' late' : ''}" title="${esc([p.part, p.supplierName].filter(Boolean).join(' · '))}">${ic('package-open', 'fa-box-open')}${esc(p.part || 'Peça')}${p.expectedAt ? (late ? ' · atrasada (' + brShort(p.expectedAt) + ')' : ' · chega ' + brShort(p.expectedAt)) : ''}</div>`);
            }
            const dep = r2(o.depositTotal);
            if (dep > 0 && !o.saleId && tds[5]) tds[5].insertAdjacentHTML('beforeend', `<div class="osb-tag osb-depl">Sinal ${money(dep)}${r2(o.total) > 0 ? ' · falta ' + money(Math.max(0, r2(o.total) - dep)) : ''}</div>`);
            if (o.saleId || ['cancelled', 'delivered', 'returned'].includes(o.status)) return;
            let b = '';
            if (['approved', 'in_progress'].includes(o.status)) b += `<button class="btn-icon osb-row" title="Aguardando peça (encomenda e previsão)" onclick="OSB.partsDialog('${esc(id)}')">${ic('package-open', 'fa-box-open')}</button>`;
            if (['awaiting_approval', 'approved', 'in_progress', 'awaiting_parts'].includes(o.status) && (r2(o.total) <= 0 || dep < r2(o.total))) b += `<button class="btn-icon osb-row" title="Receber sinal (adiantamento)" onclick="OSB.depositDialog('${esc(id)}')">${ic('hand-coins', 'fa-hand-holding-dollar')}</button>`;
            if (b) act.insertAdjacentHTML('afterbegin', b);
        });
    }

    /* =================== FATURAR E CANCELAR =================== */
    function paintPay(id) {
        const m = $('osPaymentModal'); if (!m) return;
        $('osbPayNote')?.remove();
        const hid = m.querySelectorAll('[data-osb-hid]');
        hid.forEach(el => { el.style.display = ''; el.removeAttribute('data-osb-hid'); });
        if (hid.length && typeof updateOsPaymentFields === 'function') updateOsPaymentFields();
        const o = orders().find(x => x.id === id); if (!o) return;
        const dep = r2(o.depositTotal), total = r2(o.total); if (!(dep > 0)) return;
        const due = Math.max(0, r2(total - dep));
        if (due <= 0) {
            m.querySelectorAll('.modal-body .os-grid > .form-group').forEach(g => { if (!g.contains($('osPaymentNotes'))) { g.setAttribute('data-osb-hid', '1'); g.style.display = 'none'; } });
            m.querySelector('.modal-body .os-grid')?.insertAdjacentHTML('beforebegin', `<div class="os-alert os-alert-info" id="osbPayNote" style="margin:0 0 12px">${ic('circle-check', 'fa-circle-check')}<span>O sinal de <b>${money(dep)}</b> já paga o total da OS. Confirme para entregar.${dep - total > 0.009 ? ` <b>Atenção:</b> o sinal passou do total; devolva ${money(r2(dep - total))} ao cliente.` : ''}</span></div>`);
        }
    }
    function cancelChoice(id) {
        $('osbCancelDep')?.remove();
        const o = orders().find(x => x.id === id), dep = o ? r2(o.depositTotal) : 0; if (!(dep > 0)) return;
        const body = $('osCancelModal')?.querySelector('.modal-body'); if (!body) return;
        const how = [...new Set(depLive(o).map(d => PAY[d.method] || d.method))].join(' + ') || 'Dinheiro';
        body.insertAdjacentHTML('beforeend', `<div id="osbCancelDep" style="margin-top:14px"><div class="os-alert os-alert-lock" style="margin:0">${ic('hand-coins', 'fa-hand-holding-dollar')}<span>Esta OS tem <b>sinal de ${money(dep)}</b> (${esc(how)}). O que fazer com ele?</span></div>
<div class="osb-choice"><label><input type="radio" name="osbDepAct" value="refund"><span><b>Devolver ao cliente</b><small>Sai do caixa aberto como estorno, do mesmo jeito que entrou (${esc(how)}).</small></span></label>
<label><input type="radio" name="osbDepAct" value="retain"><span><b>Reter (fica com a loja)</b><small>Ex.: taxa de diagnóstico ou peça já comprada, conforme o termo de entrada. O valor continua no caixa.</small></span></label></div></div>`);
    }

    /* =================== LIGAÇÃO COM A TELA DE OS =================== */
    function wrap(name, fn) { const orig = window[name]; if (typeof orig !== 'function' || orig.__osb) return; const w = fn(orig); w.__osb = true; window[name] = w; }
    function openHook(id) {
        const o = id ? orders().find(x => x.id === id) : null, L = o && o.deviceLock, cleared = !!(L && L.clearedAt);
        lock = { osId: id || null, type: (L && !cleared && L.type) || 'not_informed', saved: L ? JSON.parse(JSON.stringify(L)) : null, pattern: [], padEdit: !(L && !cleared && L.type === 'pattern' && (L.pattern || []).length), show: false, drawing: false, typed: false, locked: !!(o && (o.saleId || ['delivered', 'cancelled', 'returned'].includes(o.status))) };
        partsFor = null;
        paintLock(); paintParts(); paintDep();
    }
    function hookPage() {
        if (!$('osModal')) return;
        wrap('openServiceOrder', orig => function (id = null) { const r = orig.apply(this, arguments); try { openHook(id); } catch (e) { console.warn('OS (senha/peça/sinal):', e); } return r; });
        wrap('saveServiceOrder', orig => async function () {
            const editing = typeof editingOsId !== 'undefined' ? editingOsId : null;
            const old = editing ? orders().find(x => x.id === editing) : null;
            const st = $('osStatus') ? $('osStatus').value : '';
            const po = st === 'awaiting_parts' ? readParts() : null;
            if (po && !po.part) { toast('warning', 'Informe qual peça está sendo aguardada.'); $('osbPart')?.focus(); return; }
            const lk = readLock(); if (lk === false) return;
            const before = new Set(orders().map(o => o.id));
            const r = await orig.apply(this, arguments);
            if ($('osModal')?.classList.contains('active')) return r; // não salvou (campo faltando ou erro)
            let id = editing;
            if (!id) { const created = orders().filter(o => !before.has(o.id)).sort((a, b) => Number(b.orderNumber || 0) - Number(a.orderNumber || 0))[0]; id = created && created.id; }
            if (!id) return r;
            try {
                const cur = await getOs(id); if (!cur) return r;
                const patch = {};
                if (lk.changed) patch.deviceLock = lk.data;
                const wasAw = !!old && old.status === 'awaiting_parts';
                if (po) {
                    const prev = old && old.partsOrder && !old.partsOrder.receivedAt ? old.partsOrder : {};
                    patch.partsOrder = { ...prev, ...po, receivedAt: null, setAt: prev.setAt || Date.now() };
                    if (!wasAw) {
                        // "Aguardando peça" no histórico com a peça e a previsão (o cliente vê no link; fornecedor e custo não)
                        const h = (cur.statusHistory || []).slice(), last = h[h.length - 1];
                        if (old && last && last.status === 'awaiting_parts') last.label = partsLabel(po); else h.push({ status: 'awaiting_parts', label: partsLabel(po), at: nowIso(), by: uname(), uid: uid() });
                        patch.statusHistory = h;
                    }
                } else if (wasAw && cur.partsOrder && !cur.partsOrder.receivedAt) {
                    patch.partsOrder = { ...cur.partsOrder, receivedAt: Date.now() };
                    const h = (cur.statusHistory || []).slice(); const last = h[h.length - 1]; if (last && last.status === 'in_progress') { last.label = `Peça chegou${cur.partsOrder.part ? ' (' + cur.partsOrder.part + ')' : ''} · voltou para manutenção`; patch.statusHistory = h; }
                }
                if (Object.keys(patch).length) {
                    patch.updatedAt = ts();
                    await db.collection('service_orders').doc(id).update(patch); mergeLocal(id, patch);
                    if (typeof renderServiceOrders === 'function') renderServiceOrders();
                    if (!LAN && cur.trackingToken && window.OSX && OSX.ensureTracking) { try { await OSX.ensureTracking(id); } catch (e) { } }
                }
                if (po && !wasAw) nudgeParts(id);
            } catch (e) { toast('error', 'A OS foi salva, mas a senha/peça não: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            return r;
        });
        wrap('advanceServiceOrder', orig => async function (id, next) {
            const o = orders().find(x => x.id === id);
            if (o && o.status === 'awaiting_parts' && next === 'in_progress') { try { await partArrived(id); } catch (e) { toast('error', 'Erro ao atualizar OS: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } return; }
            return orig.apply(this, arguments);
        });
        wrap('renderServiceOrders', orig => function () { const r = orig.apply(this, arguments); try { decorate(); } catch (e) { } return r; });
        wrap('receiveServiceOrder', orig => async function (id) { const r = await orig.apply(this, arguments); try { paintPay(id); } catch (e) { } return r; });
        wrap('cancelServiceOrder', orig => function (id) { const r = orig.apply(this, arguments); try { cancelChoice(id); } catch (e) { } return r; });
        wrap('confirmCancelServiceOrder', orig => async function () {
            const id = typeof cancellingOsId !== 'undefined' ? cancellingOsId : null;
            const o = id ? orders().find(x => x.id === id) : null, dep = o ? r2(o.depositTotal) : 0;
            let act = null, cash = null;
            if (dep > 0 && ($('osCancelReason')?.value || '').trim()) {
                act = (document.querySelector('input[name="osbDepAct"]:checked') || {}).value;
                if (!act) { toast('warning', 'Escolha se o sinal será devolvido ao cliente ou retido pela loja.'); return; }
                if (act === 'refund') { cash = await ensureCash('Para devolver o sinal o caixa precisa estar aberto. Abra agora e o cancelamento continua.', 'Abrir caixa e devolver'); if (!cash) return; }
            }
            const r = await orig.apply(this, arguments);
            if (act && id) {
                const fresh = await getOs(id);
                if (fresh && fresh.status === 'cancelled') {
                    try { await settleDeposit(fresh, act, cash); toast('success', act === 'refund' ? `Sinal de ${money(dep)} devolvido (estorno no caixa).` : `Sinal de ${money(dep)} retido.`); } catch (e) { toast('error', 'A OS foi cancelada, mas o sinal não foi resolvido: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
                    await reload();
                }
            }
            return r;
        });
        // Imprimir: por fora de todos (os-print, os-extras e os-pro), para o termo ficar logo acima da assinatura
        wrap('printServiceOrder', orig => async function (id) {
            const realOpen = window.open; let win = null;
            window.open = function () { win = realOpen.apply(window, arguments); return win; };
            try { await orig.apply(this, arguments); } finally { window.open = realOpen; }
            if (win) { const o = await getOs(id); if (o) injectPrint(win, o); }
        });
        // Barra da lista: botão do termo de entrada (ao lado do formato de impressão)
        const anchor = $('osPrintFormat') || $('osStatusFilter');
        if (anchor && !$('osbTermsBtn')) { const b = document.createElement('button'); b.type = 'button'; b.id = 'osbTermsBtn'; b.className = 'btn btn-outline'; b.title = 'Termo de entrada que o cliente aceita ao deixar o aparelho'; b.innerHTML = `${ic('file-check', 'fa-file-contract')} <span>Termo de entrada</span>`; b.onclick = openTermsEditor; anchor.insertAdjacentElement('afterend', b); }
        decorate();
    }
    function hookServices() {
        // ServiceOrderService é "const" do core-services (fora do window): acessa pelo nome
        if (typeof ServiceOrderService === 'undefined' || !ServiceOrderService || ServiceOrderService.__osb) return;
        ServiceOrderService.__osb = true;
        const recv = ServiceOrderService.receivePayment, canc = ServiceOrderService.cancelOrder, devol = ServiceOrderService.returnWithoutRepair;
        // 39.14.5 · Devolvido sem reparo = aparelho saiu da loja: a senha também sai do sistema
        if (typeof devol === 'function') ServiceOrderService.returnWithoutRepair = async function (orderId) { const r = await devol.apply(this, arguments); await clearLock(orderId, 'OS devolvida sem reparo'); return r; };
        // Faturou = aparelho entregue: a senha sai do sistema (LGPD)
        if (typeof recv === 'function') ServiceOrderService.receivePayment = async function (orderId) { const r = await recv.apply(this, arguments); await clearLock(orderId, 'OS faturada e entregue'); return r; };
        if (typeof canc === 'function') ServiceOrderService.cancelOrder = async function (orderId) { const r = await canc.apply(this, arguments); await clearLock(orderId, 'OS cancelada'); return r; };
        if (window.OSPRO && typeof OSPRO.deliverWarranty === 'function' && !OSPRO.deliverWarranty.__osb) { const dw = OSPRO.deliverWarranty; OSPRO.deliverWarranty = async function (id) { const r = await dw.apply(this, arguments); const o = await getOs(id); if (o && o.status === 'delivered') await clearLock(id, 'OS entregue'); return r; }; OSPRO.deliverWarranty.__osb = true; }
    }

    const CSS = `.osb-h{display:flex;gap:10px;align-items:flex-start;margin-bottom:10px}.osb-h .ic{width:32px;height:32px;border-radius:10px;background:rgba(99,102,241,.12);color:var(--accent);display:flex;align-items:center;justify-content:center;flex:none;font-size:15px}.osb-h .ic.orange{background:rgba(249,115,22,.13);color:#f97316}.osb-h .ic.green{background:rgba(16,185,129,.13);color:#10b981}.osb-h b{display:block;font-size:12.5px;color:var(--text-primary)}.osb-h small{display:block;font-size:10.5px;color:var(--text-muted);margin-top:2px;line-height:1.4}
.osb-lock{border:1px dashed var(--border-color);border-radius:12px;padding:12px;background:var(--bg-card)}.osb-lock-row{display:grid;grid-template-columns:240px minmax(0,1fr);gap:10px;align-items:center}.osb-val{display:flex;gap:6px;align-items:center}.osb-lock [hidden],.osb-parts [hidden],.osb-dep [hidden],#osbLockWrap[hidden],.osb-parts[hidden],.osb-dep[hidden]{display:none!important}.osb-val input{flex:1;min-width:0;font-family:ui-monospace,Consolas,monospace;letter-spacing:.08em}.osb-mask{-webkit-text-security:disc}
.osb-pat{display:flex;gap:14px;align-items:center;flex-wrap:wrap;margin-top:10px}.osb-pad{width:156px;height:156px;touch-action:none;border-radius:14px;background:var(--bg-secondary);border:1px solid var(--border-color);user-select:none;-webkit-user-select:none;flex:none}.osb-pad.editing{cursor:crosshair;border-color:var(--accent)}.osb-pad svg{display:block;width:100%;height:100%}.osb-pad .d{fill:var(--text-muted);opacity:.55}.osb-pad .d.on{fill:var(--accent);opacity:1}.osb-pad .ln{stroke:var(--accent);stroke-width:5;fill:none;stroke-linecap:round;stroke-linejoin:round;opacity:.75}.osb-pad .n{font:700 11px Inter,Arial,sans-serif;fill:var(--text-primary)}
.osb-pat-side{display:flex;flex-direction:column;gap:8px;font-size:11.5px;color:var(--text-secondary);max-width:280px;line-height:1.45}.osb-acts-l{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.osb-pat-side .osb-acts-l{margin-top:0}.osb-acts{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.osb-note{font-size:11px;color:var(--text-muted);margin:8px 0 0;display:flex;gap:6px;align-items:center}.osb-warn{color:#f59e0b;font-size:11px;font-weight:700;margin:6px 0 0}
.osb-parts{margin-top:12px;border:1px solid rgba(249,115,22,.35);background:rgba(249,115,22,.05);border-radius:12px;padding:12px}.osb-parts-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:2px 10px}.osb-parts-grid .osp-lbl{min-width:0}.osb-full{grid-column:1/-1}.osb-span2{grid-column:span 2}
.osb-dep{margin-top:12px;border:1px solid rgba(16,185,129,.3);background:rgba(16,185,129,.05);border-radius:12px;padding:12px}.osb-dep-list{list-style:none;margin:0;padding:0;display:grid;gap:6px}.osb-dep-list li{display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:12px;color:var(--text-secondary);border:1px solid var(--border-color);border-radius:9px;padding:6px 8px;background:var(--bg-card)}.osb-dep-list li.off{opacity:.55}.osb-dep-list em{font-style:normal;color:#f59e0b;font-weight:700}
.osb-sum{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:4px 0 10px}.osb-sum>div{padding:9px;border-radius:9px;background:var(--bg-input,var(--bg-secondary));border:1px solid var(--border-color)}.osb-sum small{display:block;font-size:10px;color:var(--text-muted)}.osb-sum b{display:block;font-size:14px;color:var(--text-primary);margin-top:2px}.osb-sum.sm{margin-top:10px}.osb-sum>div:last-child b{color:#10b981}
.osb-chips{display:flex;gap:6px;margin-top:6px}.osb-chips button{border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:99px;padding:5px 12px;font-size:11.5px;font-weight:700;cursor:pointer}.osb-chips button:hover{border-color:var(--accent);color:var(--accent)}
.osb-tag{font-size:10px;margin-top:4px;font-weight:700;display:flex;gap:4px;align-items:center;white-space:nowrap}.osb-eta{color:#f97316}.osb-eta.late{color:#ef4444}.osb-depl{color:#10b981}
.osb-choice{display:grid;gap:8px;margin-top:10px}.osb-choice label{display:flex;gap:10px;align-items:flex-start;border:1px solid var(--border-color);border-radius:10px;padding:10px;cursor:pointer;font-size:12px;color:var(--text-secondary)}.osb-choice label:has(input:checked){border-color:var(--accent);background:rgba(99,102,241,.07)}.osb-choice input{margin-top:3px;accent-color:var(--accent)}.osb-choice b{display:block;color:var(--text-primary);font-size:12.5px}.osb-choice small{display:block;margin-top:2px}
.osb-terms-box{max-height:190px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;padding:10px 12px;background:var(--bg-secondary);margin:0 0 12px;font-size:11.5px;line-height:1.5;color:var(--text-secondary)}.osb-terms-box b{display:flex;gap:6px;align-items:center;font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);margin-bottom:4px}.osb-terms-box div{white-space:pre-wrap}
.osb-switch{display:flex;gap:8px;align-items:center;font-size:12.5px;color:var(--text-secondary);margin:6px 0 10px;cursor:pointer}.osb-switch input{accent-color:var(--accent)}.osb-terms-card textarea{font-size:12.5px;line-height:1.5}
#osbTermsBtn{white-space:nowrap}@media(max-width:900px){#osbTermsBtn span{display:none}}
@media(max-width:640px){.osb-lock-row{grid-template-columns:1fr}.osb-parts-grid{grid-template-columns:1fr}.osb-span2{grid-column:1}.osb-sum{grid-template-columns:1fr 1fr 1fr}.osb-sum b{font-size:12.5px}}`;
    function start() {
        if (!document.getElementById('osbCss')) { const s = document.createElement('style'); s.id = 'osbCss'; s.textContent = CSS; document.head.appendChild(s); }
        hookServices();
        if ($('osModal')) {
            // Depois do os-print, os-extras e os-pro (que também embrulham estas funções)
            let n = 0; const t = setInterval(() => { n++; if ((window.printServiceOrder && window.printServiceOrder.__osp) || n > 30) { clearInterval(t); hookPage(); hookServices(); } }, 100);
        }
        const gar = $('garTerms'); if (gar) mountTermsEditor(gar.closest('.card')?.parentElement);
    }
    try { auth.onAuthStateChanged(u => { if (u) loadCfg(); }); } catch (e) { }
    window.OSB = { version: '38.4', entryTerms, termsFor, termsBox, defaultTerms, DEFAULT_TERMS, DEFAULT_TERMS_VEH, openTermsEditor, mountTermsEditor, printBench, printDepositReceipt, depositDialog, receiveDeposit, partsDialog, setAwaiting, partArrived, waTemplate, publicExtra, publicSig, settleDeposit, clearLock, canSee, patSvg, patText, lockLabel, decorate, loadCfg, get settings() { return settings(); } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(start, 0)); else setTimeout(start, 0);
})();
