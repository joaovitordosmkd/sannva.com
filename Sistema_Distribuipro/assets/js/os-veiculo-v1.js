/* DistribuiPro 38.2 · OS de veículo (oficina, auto center, lava-jato). Igual nas 5 versões.
   Carregado pelo itens-cliente-v1.js quando "OS para veículos" está ligada (Configurações › Empresa).
   - Na OS, a seção do veículo ganha "Veículo do cliente": escolhe o carro cadastrado ou cadastra na hora (com aviso de
     placa repetida), KM de entrada (obrigatório na OS nova) e combustível. Tipo, marca, modelo e placa vão para os campos
     de sempre (deviceType, brand, model, serial = placa): busca, impressão, link de acompanhamento e garantia continuam iguais.
   - Grava na OS vehicleId, plate, kmIn e fuelIn e atualiza o KM do veículo (customer_items.lastKm).
   - Lista de OS: placa e KM na coluna, busca pela placa (com ou sem traço) e "Ficha do veículo".
   - Faturar a OS: troca de óleo e revisão do cadastro de produtos viram lembrete com a próxima data e KM. */
(function () {
    'use strict';
    const P = window.DPItens;
    if (!P || window.DPOsVeiculo || !document.getElementById('osModal') || typeof window.openServiceOrder !== 'function') return;
    const $ = id => document.getElementById(id);
    const { esc, I, plateKey, plateOk, plateFmt, parseNum, intFmt, kmFmt } = P;
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const orders = () => { try { return Array.isArray(serviceOrders) ? serviceOrders : []; } catch (e) { return []; } };
    const custs = () => { try { return Array.isArray(osCustomers) ? osCustomers : []; } catch (e) { return []; } };
    const editingId = () => { try { return editingOsId || null; } catch (e) { return null; } };
    const VT_RE = [['moto', /moto|motocicleta|scooter/i], ['caminhonete', /caminhonete|picape|pick-?up/i], ['caminhao', /caminh[aã]o/i], ['utilitario', /utilit|van\b|furg/i]];
    const vtypeOf = t => (VT_RE.find(([, re]) => re.test(String(t || ''))) || ['carro'])[0];
    let vehicles = [], chosen = null, current = null, locked = false, fuel = '', seq = 0;

    // Veículo pedido por "Nova OS para este carro" (ficha do veículo): ?veiculo= ou sessionStorage
    let pend = null;
    try { const v = new URLSearchParams(location.search).get('veiculo'); const c = new URLSearchParams(location.search).get('cliente'); if (v) pend = { vehicleId: v, customerId: c || '' }; } catch (e) { }
    try { const s = JSON.parse(sessionStorage.getItem('dp_os_vehicle') || 'null'); if (s && Date.now() - Number(s.at || 0) < 600000) pend = pend || { vehicleId: s.vehicleId, customerId: s.customerId }; sessionStorage.removeItem('dp_os_vehicle'); } catch (e) { }

    function css() {
        P.css();
        if ($('osvCss')) return;
        const st = document.createElement('style'); st.id = 'osvCss';
        st.textContent = `.osv-box{grid-column:1/-1;border:1px solid var(--border-color);border-radius:12px;padding:12px;background:color-mix(in srgb,var(--accent,#6366f1) 5%,var(--bg-card,#fff))}
.osv-box[hidden]{display:none}.osv-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(0,.8fr) minmax(0,1.3fr);gap:12px;align-items:start}
.osv-pick{display:flex;gap:6px}.osv-pick select{flex:1;min-width:0}.osv-f{min-width:0}.osv-f .form-label{display:block}
.osv-f small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:5px;line-height:1.4}.osv-f small.bad{color:#dc2626;font-weight:600}.osv-f small.warn{color:#d97706;font-weight:600}.osv-f small.ok{color:#059669;font-weight:600}
.osv-km{font-size:11px;color:var(--text-muted);margin-top:4px}
.osv-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:10px 14px!important;margin-bottom:12px}.osv-bar .tx{flex:1;min-width:200px;font-size:13px}.osv-bar .tx small{display:block;color:var(--text-muted);font-size:12px}
@media(max-width:760px){.osv-row{grid-template-columns:minmax(0,1fr)}.osv-pick{flex-wrap:wrap}}`;
        document.head.appendChild(st);
    }

    /* ---------- Seção na OS ---------- */
    function mount() {
        if ($('osvBox')) return true;
        const dt = $('osDeviceType'), grid = dt && dt.closest('.os-grid'); if (!grid) return false;
        css();
        const box = document.createElement('div'); box.id = 'osvBox'; box.className = 'osv-box';
        box.innerHTML = `<div class="osv-row">
<div class="osv-f"><label class="form-label">Veículo do cliente</label><div class="osv-pick"><select id="osvSel" class="form-control"><option value="">Escolha o cliente primeiro</option></select><button type="button" class="dpit-b" id="osvNew" title="Cadastrar um veículo para este cliente">${I('plus')} Novo</button><button type="button" class="dpit-b" id="osvSheet" title="Ficha do veículo (histórico, garantia e trocas)" disabled>${I('history')} Ficha</button></div><small id="osvInfo">Escolha o carro ou digite a placa abaixo: o veículo é cadastrado sozinho na ficha do cliente.</small></div>
<div class="osv-f"><label class="form-label">KM de entrada *</label><input id="osvKm" class="form-control" inputmode="numeric" autocomplete="off" placeholder="Ex.: 85.000"><small id="osvKmHint"></small></div>
<div class="osv-f"><label class="form-label">Combustível na entrada</label><div class="dpit-seg" id="osvFuel">${P.FUEL_LEVEL.map(f => `<button type="button" data-v="${esc(f)}">${esc(f)}</button>`).join('')}</div></div></div>`;
        grid.insertBefore(box, grid.firstChild);
        $('osvSel').addEventListener('change', () => { const v = vehicles.find(x => x.id === $('osvSel').value) || null; pick(v, true); });
        $('osvNew').addEventListener('click', newVehicle);
        $('osvSheet').addEventListener('click', () => { if (chosen) P.openItem(chosen.id); });
        $('osvFuel').addEventListener('click', e => { const b = e.target.closest('[data-v]'); if (!b) return; fuel = fuel === b.dataset.v ? '' : b.dataset.v; paintFuel(); });
        $('osvKm').addEventListener('blur', () => { const n = parseNum($('osvKm').value); if (n) $('osvKm').value = intFmt(n); kmHint(); });
        $('osvKm').addEventListener('input', kmHint);
        $('osSerial').addEventListener('blur', plateTyped);
        $('osCustomer').addEventListener('change', () => loadFor($('osCustomer').value, true));
        return true;
    }
    const paintFuel = () => $('osvFuel').querySelectorAll('[data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === fuel));
    function info(t, cls) { const el = $('osvInfo'); if (el) { el.className = cls || ''; el.innerHTML = t; } }
    function kmHint() {
        const el = $('osvKmHint'); if (!el) return;
        const km = parseNum($('osvKm').value), last = chosen ? Number(chosen.lastKm) || 0 : 0;
        if (last && km && km < last - 1000) { el.className = 'warn'; el.textContent = `Menor que o último registrado (${kmFmt(last)}). Confira.`; }
        else if (last) { el.className = ''; el.textContent = `Último registrado: ${kmFmt(last)}${chosen.lastKmAt ? ' em ' + P.fmtD(chosen.lastKmAt) : ''}`; }
        else { el.className = ''; el.textContent = ''; }
    }
    function paintSel() {
        const sel = $('osvSel'); if (!sel) return;
        const cid = $('osCustomer').value;
        sel.innerHTML = !cid ? '<option value="">Escolha o cliente primeiro</option>'
            : (vehicles.length ? '<option value="">Outro veículo (preencher abaixo)</option>' : '<option value="">Nenhum veículo cadastrado: use "Novo" ou digite a placa</option>')
            + vehicles.map(v => `<option value="${esc(v.id)}">${esc([P.title(v), v.plate ? plateFmt(v.plate) : '', Number(v.lastKm) > 0 ? kmFmt(v.lastKm) : ''].filter(Boolean).join(' · '))}${P.active(v) ? '' : ' (inativo)'}</option>`).join('');
        sel.value = chosen ? chosen.id : '';
        sel.disabled = !cid; $('osvNew').disabled = !cid || locked; $('osvSheet').disabled = !chosen;
    }
    function fire(id) { const el = $(id); if (el) el.dispatchEvent(new Event('input', { bubbles: true })); }
    function pick(v, fromUser) {
        chosen = v || null;
        if (chosen && !locked) {
            const set = (id, val) => { const el = $(id); if (el && val !== undefined) el.value = val; };
            set('osDeviceType', P.VTYPES[chosen.vtype] || 'Carro'); set('osBrand', chosen.brand || ''); set('osModel', [chosen.model, chosen.year].filter(Boolean).join(' '));
            set('osSerial', chosen.plate ? plateFmt(chosen.plate) : ''); set('osImei', chosen.chassis || '');
            fire('osDeviceType');
        }
        if (chosen) {
            const w = P.warnText(chosen);
            info(`${P.plateTag(chosen.plate)} ${esc(P.sub(chosen) || P.title(chosen))}${w.length ? ` · <b style="color:#dc2626">${esc(w.join(' · '))}</b>` : ''}`, '');
        } else if (fromUser) info('Preencha tipo, marca, modelo e placa abaixo: o veículo é cadastrado sozinho ao salvar.', '');
        paintSel(); kmHint();
    }
    async function loadFor(cid, auto) {
        const my = ++seq;
        vehicles = []; if (!cid) { chosen = null; paintSel(); return; }
        const list = (await P.itemsOf(cid)).filter(x => P.isVeh(x) && (P.active(x) || (current && current.vehicleId === x.id)));
        if (my !== seq || cid !== $('osCustomer').value) return;
        vehicles = list;
        let v = null;
        if (pend && (!pend.customerId || pend.customerId === cid)) { v = list.find(x => x.id === pend.vehicleId) || null; pend = null; }
        if (!v && current && current.vehicleId) v = list.find(x => x.id === current.vehicleId) || null;
        if (!v && current && !current.vehicleId) { const k = plateKey(current.plate || current.serial); if (k) v = list.find(x => x.plate === k) || null; }
        if (!v && auto && !current && list.filter(P.active).length === 1) v = list.filter(P.active)[0];
        pick(v, false);
        if (!v) { paintSel(); info(list.length ? 'Escolha o carro na lista ou cadastre outro.' : 'Cliente sem veículo cadastrado: use "Novo" ou digite a placa abaixo (o veículo é cadastrado sozinho ao salvar).', ''); }
    }
    async function plateTyped() {
        if (locked) return;
        const k = plateKey($('osSerial').value); if (!k) return;
        if (!plateOk(k)) { info('Confira a placa: ABC1234 (antiga) ou ABC1D23 (Mercosul).', 'bad'); return; }
        $('osSerial').value = plateFmt(k);
        if (chosen && chosen.plate === k) return;
        const mine = vehicles.find(x => x.plate === k);
        if (mine) { pick(mine, true); return; }
        chosen = null; paintSel();
        const other = await P.findByPlate(k);
        if (other && other.customerId !== $('osCustomer').value) info(`A placa ${esc(plateFmt(k))} está no cadastro de <b>${esc(other.customerName || 'outro cliente')}</b> (${esc(P.title(other))}). Ao salvar, você pode passar o veículo para este cliente.`, 'warn');
        else info(`Veículo novo: a placa ${esc(plateFmt(k))} vai para a ficha do cliente ao salvar a OS.`, 'ok');
    }
    async function newVehicle() {
        const cid = $('osCustomer').value; if (!cid) { toast('warning', 'Escolha o cliente primeiro.'); return; }
        const c = custs().find(x => x.id === cid) || {};
        const pk = plateKey($('osSerial').value);
        const r = await P.openForm({ kind: 'veiculo', customerId: cid, customerName: c.name || c.nome || '', customerPhone: c.whatsapp || c.phone || c.telefone || '', vtype: vtypeOf($('osDeviceType').value), plate: plateOk(pk) ? pk : '', brand: $('osBrand').value.trim(), model: $('osModel').value.trim(), chassis: $('osImei').value.trim(), lastKm: parseNum($('osvKm').value) || null });
        if (r && r.id && !r.deleted) { pend = { vehicleId: r.id, customerId: cid }; await loadFor(cid, false); }
    }
    function show() {
        const box = $('osvBox'); if (!box) return;
        box.hidden = !(P.vehOn() || (current && (current.vehicleId || current.kmIn)));
    }

    /* ---------- Abrir / salvar OS ---------- */
    const oOpen = window.openServiceOrder;
    window.openServiceOrder = function (id = null) {
        const r = oOpen.apply(this, arguments);
        try {
            current = id ? orders().find(x => x.id === id) || null : null;
            locked = !!(current && current.saleId);
            if (mount()) {
                chosen = null; vehicles = [];
                $('osvKm').value = current && Number(current.kmIn) > 0 ? intFmt(current.kmIn) : '';
                fuel = (current && current.fuelIn) || ''; paintFuel(); show();
                info(current ? '' : 'Escolha o carro ou digite a placa abaixo: o veículo é cadastrado sozinho na ficha do cliente.', '');
                $('osvKmHint').textContent = '';
                loadFor($('osCustomer').value, !id);
            }
        } catch (e) { console.warn('OS de veículo', e); }
        return r;
    };
    const oSave = window.saveServiceOrder;
    window.saveServiceOrder = async function () {
        const box = $('osvBox');
        if (!box || box.hidden || locked) return oSave.apply(this, arguments);
        const cid = $('osCustomer').value, problem = ($('osProblem') || {}).value || '';
        if (!cid || !problem.trim()) return oSave.apply(this, arguments); // a página mostra o aviso
        const editing = editingId();
        const km = parseNum($('osvKm').value);
        const pk = plateKey($('osSerial').value);
        if (pk && !plateOk(pk)) { toast('warning', 'Confira a placa: ABC1234 (antiga) ou ABC1D23 (Mercosul).'); $('osSerial').focus(); return; }
        if (chosen && pk && chosen.plate && pk !== chosen.plate) chosen = vehicles.find(x => x.plate === pk) || null;
        if (!chosen && pk) chosen = vehicles.find(x => x.plate === pk) || null;
        if (!editing && !(km > 0)) { toast('warning', 'Informe o KM de entrada do veículo.'); $('osvKm').focus(); return; }
        if (chosen && km && Number(chosen.lastKm) > 0 && km < Number(chosen.lastKm) - 1000 && !confirm(`O KM de entrada (${kmFmt(km)}) é menor que o último registrado (${kmFmt(chosen.lastKm)}). Salvar assim mesmo?`)) return;
        const c = custs().find(x => x.id === cid) || {};
        const cust = { customerId: cid, customerName: c.name || c.nome || 'Cliente', customerPhone: c.whatsapp || c.phone || c.telefone || '' };
        // Placa digitada sem cadastro: cadastra o veículo (ou passa de outro dono, se confirmar)
        if (!chosen && pk) {
            try {
                const other = await P.findByPlate(pk);
                const data = { kind: 'veiculo', ...cust, vtype: vtypeOf($('osDeviceType').value), plate: pk, brand: $('osBrand').value.trim(), model: $('osModel').value.trim(), chassis: $('osImei').value.trim().toUpperCase(), status: 'active' };
                data.name = [data.brand, data.model].filter(Boolean).join(' ');
                if (km > 0) data.lastKm = Math.round(km);
                if (other && other.customerId && other.customerId !== cid) {
                    if (!confirm(`A placa ${plateFmt(pk)} está no cadastro de ${other.customerName || 'outro cliente'} (${P.title(other)}).\n\nO carro mudou de dono? OK passa o veículo (com o histórico) para ${cust.customerName}.\nCancelar volta para a OS.`)) return;
                    await P.saveItem(other.id, { ...cust, status: 'active', previousOwners: [...(Array.isArray(other.previousOwners) ? other.previousOwners : []), { customerId: other.customerId, customerName: other.customerName || '', until: P.today() }] });
                    chosen = { ...other, ...cust, status: 'active' };
                } else if (other) chosen = other;
                else { const id = await P.saveItem(null, data); chosen = { ...data, id }; toast('info', `Veículo ${plateFmt(pk)} cadastrado na ficha de ${cust.customerName}.`); }
                vehicles = vehicles.filter(x => x.id !== chosen.id).concat(chosen);
            } catch (e) { toast('error', 'Não foi possível cadastrar o veículo: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        }
        if (!$('osDeviceType').value.trim()) $('osDeviceType').value = chosen ? (P.VTYPES[chosen.vtype] || 'Carro') : 'Veículo';
        if (chosen) { if (!$('osBrand').value.trim()) $('osBrand').value = chosen.brand || ''; if (!$('osModel').value.trim()) $('osModel').value = chosen.model || ''; if (!$('osSerial').value.trim() && chosen.plate) $('osSerial').value = plateFmt(chosen.plate); }
        const v = chosen, f = fuel, before = new Set(orders().map(o => o.id));
        const r = await oSave.apply(this, arguments);
        try {
            let id = null;
            if (editing) { if (!$('osModal').classList.contains('active')) id = editing; }
            else { const created = orders().filter(o => !before.has(o.id)).sort((a, b) => Number(b.orderNumber || 0) - Number(a.orderNumber || 0))[0]; if (created) id = created.id; }
            if (!id || (!v && !pk && !(km > 0) && !f)) return r; // OS sem nada de veículo (ex.: aparelho): não mexe
            const patch = { itemTerm: 'veiculo', fuelIn: f || '' };
            if (km > 0) patch.kmIn = Math.round(km);
            if (v) Object.assign(patch, { vehicleId: v.id, plate: v.plate || pk || '', vehicleName: P.title(v) });
            else if (pk) patch.plate = pk;
            await db.collection('service_orders').doc(id).set(patch, { merge: true });
            const o = orders().find(x => x.id === id); if (o) Object.assign(o, patch);
            if (v && km > Number(v.lastKm || 0)) await P.saveItem(v.id, { lastKm: Math.round(km), lastKmAt: P.today() });
            try { renderServiceOrders(); } catch (e) { }
        } catch (e) { toast('warning', 'A OS foi salva, mas o veículo/KM não: ' + e.message); }
        return r;
    };
    window.DPOsVeiculo = {
        newFor(it) {
            pend = { vehicleId: it.id, customerId: it.customerId };
            openServiceOrder();
            const sel = $('osCustomer'); if (!sel) return;
            if (![...sel.options].some(o => o.value === it.customerId)) sel.add(new Option(it.customerName || 'Cliente', it.customerId));
            sel.value = it.customerId; sel.dispatchEvent(new Event('change', { bubbles: true }));
        },
        sheet(osId) { const o = orders().find(x => x.id === osId); if (o && o.vehicleId) P.openItem(o.vehicleId); else if (o) byPlate(o.plate || o.serial); },
        byPlate
    };

    /* ---------- Lista: placa e KM, ficha do veículo, barra da placa ---------- */
    async function byPlate(raw) {
        const k = plateKey(raw);
        if (!plateOk(k)) { toast('warning', 'Digite a placa: ABC1234 ou ABC1D23.'); return; }
        const v = await P.findByPlate(k);
        if (v) { P.openItem(v.id); return; }
        const os = orders().filter(o => plateKey(o.plate || o.serial) === k);
        toast('info', os.length ? `A placa ${plateFmt(k)} aparece em ${os.length} OS, mas ainda não tem ficha. Abra uma dessas OS e salve: o veículo é cadastrado sozinho.` : `Nenhum veículo com a placa ${plateFmt(k)}.`);
    }
    function decorate() {
        const tb = $('osTbody'); if (!tb || !P.vehOn()) return;
        const th = tb.closest('table') && tb.closest('table').querySelectorAll('thead th')[2];
        if (th && /^(IMEI \/ Serial|Placa \/ Chassi)$/.test(th.textContent.trim())) th.textContent = 'Placa / KM';
        tb.querySelectorAll('tr').forEach(tr => {
            const act = tr.querySelector('.os-actions'); if (!act) return;
            const id = (act.innerHTML.match(/printServiceOrder\('([^']+)'\)/) || [])[1]; if (!id) return;
            const o = orders().find(x => x.id === id); if (!o) return;
            if (!(o.vehicleId || o.plate || o.kmIn || (window.DPTerm && DPTerm.isVehicle(o)))) return;
            const cell = tr.children[2]; if (!cell) return;
            const plate = o.plate || plateKey(o.serial), sig = [plate, o.kmIn || '', o.vehicleId || ''].join('|');
            if (cell.dataset.osv !== sig) { cell.dataset.osv = sig; cell.innerHTML = `${plate && plateOk(plate) ? P.plateTag(plate) : (o.serial ? esc(o.serial) : '<span style="color:var(--text-muted)">sem placa</span>')}<div class="osv-km">${o.kmIn ? kmFmt(o.kmIn) : ''}</div>`; }
            if ((o.vehicleId || (plate && plateOk(plate))) && !act.querySelector('.osv-sheet')) act.insertAdjacentHTML('afterbegin', `<button class="btn-icon osv-sheet" title="Ficha do veículo: histórico, garantia e trocas" onclick="DPOsVeiculo.sheet('${esc(id)}')"><i class="fas fa-clock-rotate-left"></i></button>`);
        });
        plateBar();
    }
    async function plateBar() {
        const q = $('osSearch'), card = $('osTbody') && $('osTbody').closest('.card'); if (!q || !card) return;
        const k = plateKey(q.value);
        let bar = $('osvPlateBar');
        if (!plateOk(k)) { if (bar) bar.remove(); return; }
        const v = await P.findByPlate(k);
        if (plateKey(q.value) !== k) return;
        if (!bar) { bar = document.createElement('div'); bar.id = 'osvPlateBar'; bar.className = 'card osv-bar'; card.parentElement.insertBefore(bar, card); }
        if (!v) { bar.innerHTML = `${I('car')}<div class="tx"><b>Placa ${esc(plateFmt(k))}</b><small>Sem ficha de veículo. Ao salvar uma OS com essa placa, o veículo é cadastrado sozinho.</small></div>`; return; }
        const n = orders().filter(o => o.vehicleId === v.id || plateKey(o.plate || o.serial) === k).length;
        bar.innerHTML = `${P.avatar(v)}<div class="tx"><b>${esc(P.title(v))}</b> ${P.plateTag(v.plate)}<small>${esc(v.customerName || '')}${Number(v.lastKm) > 0 ? ' · ' + kmFmt(v.lastKm) : ''} · ${n} ${n === 1 ? 'OS' : 'OS'}</small></div><button type="button" class="dpit-b" data-osv="sheet">${I('history')} Ficha do veículo</button><button type="button" class="dpit-b pri" data-osv="new">${I('plus')} Nova OS para este carro</button>`;
        bar.onclick = e => { const b = e.target.closest('[data-osv]'); if (!b) return; if (b.dataset.osv === 'sheet') P.openItem(v.id); else window.DPOsVeiculo.newFor(v); };
    }
    function toolbar() {
        const s = $('osSearch'); if (!s || $('osvFind')) return;
        if (P.vehOn()) s.placeholder = 'Buscar cliente, placa, veículo, chassi...';
        const b = document.createElement('button'); b.type = 'button'; b.id = 'osvFind'; b.className = 'dpit-b'; b.title = 'Abrir a ficha do veículo pela placa';
        b.innerHTML = `${I('car')} Ficha do veículo`;
        b.addEventListener('click', () => {
            const ov = P.modal(P.head('car', 'Ficha do veículo pela placa', 'Histórico, KM, peças, garantia e próximas trocas') + `<div class="dpit-mb"><div class="dpit-f"><label>Placa</label><input class="form-control" id="osvFindQ" maxlength="8" autocomplete="off" placeholder="ABC1D23 ou ABC-1234" style="text-transform:uppercase;font-weight:700;letter-spacing:.05em;font-size:16px"></div></div><div class="dpit-mf"><span class="sp"></span><button type="button" class="dpit-b" data-x>Cancelar</button><button type="button" class="dpit-b pri" id="osvFindOk">${I('search')} Abrir ficha</button></div>`, 'small');
            const go = () => { const v = ov.querySelector('#osvFindQ').value; P.close(ov); byPlate(v); };
            ov.querySelector('#osvFindOk').onclick = go;
            ov.querySelector('#osvFindQ').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
            setTimeout(() => ov.querySelector('#osvFindQ').focus(), 50);
        });
        const host = s.closest('.search-box'); if (host) host.insertAdjacentElement('afterend', b);
    }
    const oRender = window.renderServiceOrders;
    if (typeof oRender === 'function') window.renderServiceOrders = function () { const r = oRender.apply(this, arguments); try { decorate(); } catch (e) { } return r; };

    /* ---------- Faturar: venda ligada ao veículo e lembrete da troca de óleo/revisão ---------- */
    if (typeof ServiceOrderService !== 'undefined' && ServiceOrderService && typeof ServiceOrderService.receivePayment === 'function' && !ServiceOrderService.__osv) {
        ServiceOrderService.__osv = true;
        const oRecv = ServiceOrderService.receivePayment;
        ServiceOrderService.receivePayment = async function (orderId) {
            const r = await oRecv.apply(this, arguments);
            try {
                if (r && r.saleId) {
                    const snap = await db.collection('service_orders').doc(orderId).get(); const o = snap.exists ? (snap.data() || {}) : null;
                    if (o && o.vehicleId) {
                        const it = await P.getItem(o.vehicleId);
                        if (it) {
                            await db.collection('sales').doc(r.saleId).set({ itemId: it.id, itemName: P.short(it), itemKind: 'veiculo', plate: it.plate || '' }, { merge: true });
                            const list = Array.isArray(o.items) ? o.items.filter(i => i.productId) : [];
                            if (list.length) {
                                const prods = (await db.collection('products').get()).docs.map(d => ({ id: d.id, ...d.data() }));
                                const done = [], km = Number(o.kmIn) || Number(it.lastKm) || null;
                                for (const i of list) {
                                    const p = prods.find(x => x.id === i.productId); if (!p || !p.itemEventType || !P.EV[p.itemEventType]) continue;
                                    const x = P.EV[p.itemEventType]; if (x.kind && x.kind !== 'veiculo') continue;
                                    if (done.some(d => d.t === p.itemEventType)) continue; // óleo + filtro na mesma OS: um lembrete só
                                    const days = p.repeatDays !== undefined && p.repeatDays !== null && p.repeatDays !== '' ? Number(p.repeatDays) || 0 : (x.days || 0);
                                    const step = Number(p.repeatKm) > 0 ? Number(p.repeatKm) : (x.km || 0);
                                    const nextDue = days > 0 ? P.addDays(P.today(), days) : '', nextKm = km && step ? km + step : null;
                                    await P.addEvent(it, { type: p.itemEventType, name: p.eventName || p.name, appliedAt: P.today(), km, nextDue, nextKm, productId: p.id, saleId: r.saleId, serviceOrderId: orderId, price: r2((Number(i.qty) || 1) * (Number(i.price) || 0)), origin: 'os', vetName: o.technicianName || '' });
                                    done.push({ t: p.itemEventType, n: `${x.l}${nextKm ? ' (próxima aos ' + kmFmt(nextKm) + ')' : nextDue ? ' (próxima em ' + P.fmtD(nextDue) + ')' : ''}` });
                                }
                                if (done.length) toast('success', `Na ficha do ${P.title(it)}: ${done.map(d => d.n).join(', ')}.`);
                            }
                        }
                    }
                }
            } catch (e) { console.warn('Lembrete da OS de veículo', e); }
            return r;
        };
    }
    function r2(n) { return Math.round((Number(n) || 0) * 100) / 100; }

    css(); toolbar();
    // A OS já aberta (ex.: ?os=) antes deste arquivo carregar
    if ($('osModal').classList.contains('active')) { try { current = orders().find(x => x.id === editingId()) || null; locked = !!(current && current.saleId); if (mount()) { $('osvKm').value = current && Number(current.kmIn) > 0 ? intFmt(current.kmIn) : ''; fuel = (current && current.fuelIn) || ''; paintFuel(); show(); loadFor($('osCustomer').value, !current); } } catch (e) { } }
    try { decorate(); } catch (e) { }
    document.addEventListener('dp:ramo', () => { show(); try { renderServiceOrders(); } catch (e) { } });
})();
