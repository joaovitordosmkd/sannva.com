/* DistribuiPro 35.22 · Garantias.
   - Consulta por IMEI, CPF, nome, telefone ou número da OS: mostra se está na garantia e até quando.
   - Certificado de garantia impresso com QR Code (consulta pelo celular).
   - Retorno em garantia: abre uma OS de garantia sem cobrança, ligada à OS original (controle de retornos).
   - Texto das condições da garantia (vai no certificado). */
(function () {
    'use strict';
    const root = document.getElementById('garRoot');
    if (!root || typeof db === 'undefined') return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const P = () => window.OSPRO || {};
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const toMs = v => (P().toMs ? P().toMs(v) : (v && v.toDate ? v.toDate().getTime() : Number(v) || null));
    const brDate = (ms, t) => ms ? new Date(ms).toLocaleString('pt-BR', t ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const digits = s => String(s || '').replace(/\D/g, '');
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const osNum = n => '#OS-' + String(n || 0).padStart(4, '0');
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch (e) { return 'Operador'; } };
    let orders = [], customers = {}, tab = 'search', booted = false, settings = {};

    function warranty(o) {
        const days = Number(o.warrantyDays || 0), from = toMs(o.deliveredAt);
        // 39.14.5 · Devolvida sem reparo: não teve serviço, então não tem garantia
        if (o.status === 'returned') return { state: 'none', label: 'Devolvida sem reparo', until: null };
        if (o.status !== 'delivered' || !from) return { state: o.status === 'cancelled' ? 'none' : 'pending', label: o.status === 'cancelled' ? 'Cancelada' : 'Ainda não entregue', until: null };
        if (!days) return { state: 'none', label: 'Sem garantia', until: null };
        const until = from + days * 864e5;
        return Date.now() <= until ? { state: 'valid', label: 'Na garantia', until, left: Math.ceil((until - Date.now()) / 864e5) } : { state: 'expired', label: 'Garantia vencida', until };
    }
    const returnsOf = id => orders.filter(x => x.isWarranty && x.warrantyOf === id);

    function shell() {
        root.innerHTML = `<div class="dpu-stats">
<div class="stat-card"><div class="stat-icon green"><i class="fas fa-shield-halved"></i></div><div class="stat-value" id="garStValid">0</div><div class="stat-label">Aparelhos na garantia</div></div>
<div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-rotate-left"></i></div><div class="stat-value" id="garStRet">0</div><div class="stat-label">Retornos (90 dias)</div></div>
<div class="stat-card"><div class="stat-icon purple"><i class="fas fa-percent"></i></div><div class="stat-value" id="garStRate">0%</div><div class="stat-label">Taxa de retorno (90 dias)</div></div>
<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-calendar-xmark"></i></div><div class="stat-value" id="garStSoon">0</div><div class="stat-label">Vencem em 15 dias</div></div></div>
<div class="dpu-tabs" id="garTabs"><button data-t="search" class="on"><i class="fas fa-magnifying-glass"></i> Consultar garantia</button><button data-t="returns"><i class="fas fa-rotate-left"></i> Retornos em garantia</button><button data-t="terms"><i class="fas fa-file-lines"></i> Texto da garantia</button></div>
<div id="garBody"></div>`;
        $('garTabs').onclick = e => { const b = e.target.closest('[data-t]'); if (!b) return; tab = b.dataset.t; $('garTabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); paint(); };
    }
    function stats() {
        const since = Date.now() - 90 * 864e5;
        const deliv90 = orders.filter(o => !o.isWarranty && o.status === 'delivered' && (toMs(o.deliveredAt) || 0) >= since).length;
        const ret90 = orders.filter(o => o.isWarranty && (toMs(o.createdAt) || 0) >= since).length;
        const retOs90 = orders.filter(o => o.isWarranty && !o.warrantyOfSale && (toMs(o.createdAt) || 0) >= since).length; // 38.5 · a taxa é só do conserto (aparelho vendido não conta)
        const valid = orders.filter(o => !o.isWarranty && warranty(o).state === 'valid');
        $('garStValid').textContent = valid.length + (window.DPSerial ? DPSerial.inWarrantyCount() : 0); $('garStRet').textContent = ret90; // 38.5 · + aparelhos vendidos na garantia
        $('garStRate').textContent = deliv90 ? (Math.round(retOs90 / deliv90 * 1000) / 10).toString().replace('.', ',') + '%' : '0%';
        $('garStSoon').textContent = valid.filter(o => warranty(o).left <= 15).length;
    }
    function card(o) {
        const w = warranty(o), c = customers[o.customerId] || {}, rets = returnsOf(o.id);
        const veh = !!(o.vehicleId || o.plate); // 38.2 · OS de veículo: placa e KM no lugar do IMEI
        return `<article class="dpu-card"><div class="top"><div><b>${osNum(o.orderNumber)} · ${esc(o.customerName || c.name || '—')}</b><br><small>${esc([o.deviceType, o.brand, o.model].filter(Boolean).join(' '))}${veh ? ' · Placa ' + esc(window.DPItens ? DPItens.plateFmt(o.plate || o.serial) : (o.plate || o.serial)) + (o.kmIn ? ' · ' + Number(o.kmIn).toLocaleString('pt-BR') + ' km' : '') : (o.imei ? ' · IMEI ' + esc(o.imei) : '')}</small></div><span class="dpu-st ${w.state === 'valid' ? 'valid' : 'expired'}">${esc(w.label)}</span></div>
<small>${esc(o.serviceDescription || o.problemReported || '')}</small>
<small>${o.deliveredAt ? `Entregue em ${brDate(toMs(o.deliveredAt))}` : ''}${w.until ? ` · garantia de ${o.warrantyDays} dias até <b>${brDate(w.until)}</b>${w.state === 'valid' ? ` (faltam ${w.left} dia${w.left > 1 ? 's' : ''})` : ''}` : ''}</small>
${c.document || c.cpf ? `<small>CPF/CNPJ: ${esc(c.document || c.cpf)}</small>` : ''}${rets.length ? `<small style="color:var(--warning)"><i class="fas fa-rotate-left"></i> ${rets.length} retorno(s) em garantia: ${rets.map(r => osNum(r.orderNumber)).join(', ')}</small>` : ''}
<div class="acts">${o.status === 'delivered' && Number(o.warrantyDays) > 0 ? `<button class="btn btn-outline btn-sm" data-cert="${o.id}"><i class="fas fa-certificate"></i> Certificado</button>` : ''}${o.status === 'delivered' ? `<button class="btn btn-primary btn-sm" data-ret="${o.id}"><i class="fas fa-rotate-left"></i> Abrir OS de garantia</button>` : ''}<a class="btn btn-outline btn-sm" href="ordens-servico.html?os=${encodeURIComponent(o.id)}"><i class="fas fa-up-right-from-square"></i> Ver OS</a></div></article>`;
    }
    function paint() {
        stats();
        const body = $('garBody');
        if (tab === 'search') {
            body.innerHTML = `<div class="card dpu-bar"><div class="search-box"><i class="fas fa-search"></i><input id="garQ" type="text" placeholder="Digite ${window.DPItens && DPItens.vehOn() ? 'a placa, o' : 'o IMEI,'} CPF, nome, telefone ou número da OS..." autocomplete="off"></div></div><div class="dpu-list" id="garRes"></div>`;
            const q = $('garQ'); q.oninput = () => results(q.value); q.focus();
            try { const q0 = new URLSearchParams(location.search).get('q'); if (q0 && !paint.q0) { paint.q0 = 1; q.value = q0; } } catch (e) { } // 38.2 · garantias.html?q=PLACA
            results(q.value);
        } else if (tab === 'returns') {
            const rets = orders.filter(o => o.isWarranty).sort((a, b) => (toMs(b.createdAt) || 0) - (toMs(a.createdAt) || 0));
            body.innerHTML = rets.length ? `<div class="card" style="padding:0"><div class="dpu-table-wrap"><table class="data-table"><thead><tr><th>OS de garantia</th><th>OS original</th><th>Cliente / aparelho</th><th>Aberta em</th><th>Motivo</th><th>Situação</th></tr></thead><tbody>${rets.map(o => `<tr><td><a href="ordens-servico.html?os=${encodeURIComponent(o.id)}"><b>${osNum(o.orderNumber)}</b></a></td><td>${o.warrantyOfNumber ? osNum(o.warrantyOfNumber) : o.warrantyOfSaleNumber ? 'Venda #V-' + String(o.warrantyOfSaleNumber).padStart(4, '0') : '—'}</td><td>${esc(o.customerName || '')}<br><small style="color:var(--text-muted)">${esc([o.brand, o.model].filter(Boolean).join(' '))}</small></td><td>${brDate(toMs(o.createdAt))}</td><td><small>${esc(String(o.problemReported || '').replace(/^Retorno em garantia[^:]*:\s*/, ''))}</small></td><td><span class="dpu-st ${o.status === 'delivered' ? 'valid' : 'return'}">${esc({ received: 'Recebido', analyzing: 'Em análise', in_progress: 'Em manutenção', awaiting_parts: 'Aguardando peça', ready: 'Pronto', delivered: 'Entregue', cancelled: 'Cancelada', approved: 'Aprovado', awaiting_approval: 'Aguardando' }[o.status] || o.status)}</span></td></tr>`).join('')}</tbody></table></div></div>`
                : `<div class="card dpu-empty"><i class="fas fa-face-smile"></i>Nenhum retorno em garantia. Ótimo sinal!</div>`;
        } else {
            body.innerHTML = `<div class="card" style="padding:18px"><h3 style="margin:0 0 6px;color:var(--text-heading)">Condições da garantia</h3><p style="margin:0 0 12px;color:var(--text-muted);font-size:13px">Este texto sai no certificado de garantia de todas as OS.</p><textarea id="garTerms" class="form-control" rows="9">${esc(settings.warrantyTerms || P().DEFAULT_TERMS || '')}</textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button class="btn btn-outline" id="garTermsReset">Usar o texto padrão</button><button class="btn btn-primary" id="garTermsSave"><i class="fas fa-check"></i> Salvar texto</button></div></div>`;
            $('garTermsReset').onclick = () => { $('garTerms').value = P().DEFAULT_TERMS || ''; };
            if (window.OSB && OSB.mountTermsEditor) OSB.mountTermsEditor(body); // 38.4 · termo de entrada da OS logo abaixo
            if (window.DPSerial && DPSerial.mountTermsEditor) DPSerial.mountTermsEditor(body); // 38.5 · garantia do aparelho vendido
            $('garTermsSave').onclick = async () => { try { await db.collection('settings').doc(DOC).set({ warrantyTerms: $('garTerms').value.trim() }, { merge: true }); settings.warrantyTerms = $('garTerms').value.trim(); if (window.OSPRO && OSPRO.settings) OSPRO.settings.warrantyTerms = settings.warrantyTerms; toast('success', 'Texto da garantia salvo.'); } catch (e) { toast('error', e.message); } };
        }
    }
    function results(qs) {
        const q = norm(qs).trim(), d = digits(qs), res = $('garRes');
        let list = orders.filter(o => !o.isWarranty && o.status !== 'cancelled');
        if (q) list = list.filter(o => {
            const c = customers[o.customerId] || {};
            if (d.length >= 4 && (digits(o.imei).includes(d) || digits(o.serial).includes(d) || digits(c.document || c.cpf || c.cpfCnpj) === d || digits(c.phone || c.whatsapp || c.telefone).includes(d) || String(o.orderNumber || '') === d.replace(/^0+/, ''))) return true;
            if (window.DPItens && DPItens.osMatch(o, qs)) return true; // 38.2 · placa com ou sem traço
            return norm([o.customerName, c.name, o.brand, o.model, o.imei, o.serial, o.plate].join(' ')).includes(q) || norm(osNum(o.orderNumber)).includes(q);
        });
        else list = list.filter(o => warranty(o).state === 'valid');
        list.sort((a, b) => (toMs(b.deliveredAt) || toMs(b.createdAt) || 0) - (toMs(a.deliveredAt) || toMs(a.createdAt) || 0));
        res.innerHTML = list.length ? list.slice(0, 60).map(card).join('') : `<div class="card dpu-empty" style="grid-column:1/-1"><i class="fas fa-magnifying-glass"></i>${q ? 'Nenhuma OS encontrada para essa busca.' : 'Nenhum aparelho na garantia agora.'}</div>`;
        if (!q) res.insertAdjacentHTML('afterbegin', `<p style="grid-column:1/-1;margin:0;color:var(--text-muted);font-size:13px">Aparelhos que estão na garantia agora. Busque pelo IMEI, CPF, nome ou nº da OS para ver qualquer atendimento.</p>`);
        if (window.DPSerial && DPSerial.garantiaCards) DPSerial.garantiaCards(qs, res, customers); // 38.5 · aparelhos vendidos com IMEI/série
    }
    async function openReturn(id) {
        const o = orders.find(x => x.id === id); if (!o) return;
        const w = warranty(o);
        if (w.state !== 'valid' && !confirm(`A garantia da ${osNum(o.orderNumber)} ${w.state === 'expired' ? 'venceu em ' + brDate(w.until) : 'não está ativa'}. Abrir a OS de garantia mesmo assim?`)) return;
        const ov = P().dlg(`<h3><i class="fas fa-rotate-left"></i> Retorno em garantia · ${osNum(o.orderNumber)}</h3><p class="osp-sub">${esc(o.customerName || '')} · ${esc([o.brand, o.model].filter(Boolean).join(' '))}. A nova OS é aberta <b>sem cobrança</b> e fica ligada a esta.</p><label class="osp-lbl">O que aconteceu? *<textarea class="form-control" rows="3" data-why maxlength="400" placeholder="Ex.: a tela trocada voltou a piscar"></textarea></label><div class="osp-acts"><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Abrir OS de garantia</button></div>`);
        ov.querySelector('[data-ok]').onclick = async ev => {
            const why = ov.querySelector('[data-why]').value.trim(); if (!why) { toast('warning', 'Descreva o problema.'); return; }
            ev.currentTarget.disabled = true;
            try {
                const s = await db.collection('settings').doc(DOC).get(); const seq = (s.exists ? Number(s.data().serviceOrderSequence || 0) : 0) + 1;
                await db.collection('settings').doc(DOC).set({ serviceOrderSequence: seq }, { merge: true });
                const ref = await db.collection('service_orders').add({
                    customerId: o.customerId || '', customerName: o.customerName || '', deviceType: o.deviceType || '', brand: o.brand || '', model: o.model || '', imei: o.imei || '', serial: o.serial || '', accessories: '', entryCondition: '',
                    problemReported: `Retorno em garantia da ${osNum(o.orderNumber)}: ${why}`, diagnosis: '', serviceDescription: o.serviceDescription || '', partsDescription: '', technicianId: o.technicianId || null, technicianName: o.technicianName || '',
                    laborValue: 0, partsValue: 0, discount: 0, total: 0, status: 'received', statusHistory: [{ status: 'received', label: `OS de garantia aberta (retorno da ${osNum(o.orderNumber)})`, at: new Date().toISOString(), by: uname(), uid: auth.currentUser?.uid || '' }],
                    warrantyDays: 0, estimatedDate: null, notes: '', isWarranty: true, warrantyOf: o.id, warrantyOfNumber: Number(o.orderNumber || 0), orderNumber: seq, deleted: false, paymentStatus: 'pending', createdAt: ts(), createdBy: auth.currentUser?.uid || '', updatedAt: ts(),
                    ...(o.vehicleId || o.plate ? { vehicleId: o.vehicleId || '', plate: o.plate || '', itemTerm: 'veiculo' } : {}) // 38.2 · retorno do mesmo veículo
                });
                ov.remove(); toast('success', `${osNum(seq)} de garantia aberta.`);
                location.href = 'ordens-servico.html?os=' + encodeURIComponent(ref.id);
            } catch (e) { ev.currentTarget.disabled = false; toast('error', 'Não foi possível abrir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        };
    }
    async function boot() {
        if (booted) return; booted = true;
        shell();
        try {
            const [os, cs, st] = await Promise.all([db.collection('service_orders').get(), db.collection('customers').get(), db.collection('settings').doc(DOC).get()]);
            orders = os.docs.map(d => ({ id: d.id, ...d.data() })).filter(o => !o.deleted);
            cs.docs.forEach(d => { customers[d.id] = d.data() || {}; });
            settings = st.exists ? (st.data() || {}) : {};
            paint();
        } catch (e) { console.error(e); $('garBody').innerHTML = `<div class="card dpu-empty"><i class="fas fa-triangle-exclamation"></i>Não foi possível carregar: ${esc(e.message)}</div>`; }
        root.addEventListener('click', e => { const c = e.target.closest('[data-cert]'); if (c) { P().printCertificate(c.dataset.cert); return; } const r = e.target.closest('[data-ret]'); if (r) openReturn(r.dataset.ret); });
    }
    window.initPage = boot;
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 700); }); } catch (e) { }
})();
