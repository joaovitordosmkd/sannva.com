/* DistribuiPro 35.22 · Compra de usados (troca e aparelho na troca).
   Avaliação com checklist e preço sugerido, termo de compra com dados e documento do vendedor (exigência para
   revenda), assinatura do vendedor, entrada no estoque como seminovo e saída do caixa.
   Coleção: device_purchases · numeração: settings.usedPurchaseSequence · tabela de descontos: settings.usedPricing */
(function () {
    'use strict';
    const root = document.getElementById('dpuRoot');
    if (!root || typeof db === 'undefined') return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const COL = 'device_purchases';
    const P = () => window.OSPRO || {};
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num = v => { const s = String(v ?? '').trim().replace(/[R$\s]/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const toMs = v => (P().toMs ? P().toMs(v) : (v && v.toDate ? v.toDate().getTime() : Number(v) || null));
    const brDate = (ms, t) => ms ? new Date(ms).toLocaleString('pt-BR', t ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch (e) { return 'Operador'; } };
    const digits = s => String(s || '').replace(/\D/g, '');
    const ST = { evaluation: 'Avaliação', purchased: 'Comprado', declined: 'Recusado', sold: 'Vendido' };
    const COND = [['excelente', 'Excelente (sem marcas)'], ['bom', 'Bom (marcas leves de uso)'], ['regular', 'Regular (riscos/amassados)'], ['ruim', 'Ruim (muito desgaste)']];
    const PAYS = [['dinheiro', 'Dinheiro'], ['pix', 'PIX'], ['transferencia', 'Transferência'], ['troca', 'Crédito na troca (vira vale do cliente para usar no PDV)']];
    const DEF_PRICING = { condition: { excelente: 100, bom: 90, regular: 75, ruim: 55 }, deductions: { liga: 70, tela: 30, touch: 20, cam_frontal: 8, cam_traseira: 12, biometria: 15, botoes: 6, altofalante: 5, auricular: 5, microfone: 5, wifi: 10, bluetooth: 4, sinal: 15, carregamento: 10, vibracall: 3, carcaca: 8 }, batteryLimit: 80, batteryDeduction: 10, margin: 40 };
    let list = [], pricing = JSON.parse(JSON.stringify(DEF_PRICING)), booted = false, filter = '', search = '';

    function cpfOk(c) { c = digits(c); if (c.length !== 11 || /^(\d)\1+$/.test(c)) return false; let s = 0; for (let i = 0; i < 9; i++) s += +c[i] * (10 - i); let d = (s * 10) % 11 % 10; if (d !== +c[9]) return false; s = 0; for (let i = 0; i < 10; i++) s += +c[i] * (11 - i); d = (s * 10) % 11 % 10; return d === +c[10]; }
    function imeiOk(v) { const d = digits(v); if (d.length !== 15) return false; let s = 0; for (let i = 0; i < 15; i++) { let n = +d[i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; }
    function suggest(p) {
        const market = num(p.marketPrice); if (!(market > 0)) return { value: 0, pct: 0, why: [] };
        const why = []; let fail = 0;
        for (const [k, l] of (P().CHECK_ITEMS || [])) if ((p.checklist?.items || {})[k] === 'fail') { const d = Number(pricing.deductions[k] || 0); if (d) { fail += d; why.push(`${l} −${d}%`); } }
        const bat = num(p.checklist?.battery);
        if (bat > 0 && bat < Number(pricing.batteryLimit || 80)) { fail += Number(pricing.batteryDeduction || 0); why.push(`Bateria ${bat}% −${pricing.batteryDeduction}%`); }
        const cond = Number((pricing.condition || {})[p.condition || 'bom'] || 90);
        const factor = cond / 100 * Math.max(0.05, 1 - Math.min(95, fail) / 100);
        return { value: Math.max(0, Math.round(market * factor / 5) * 5), pct: Math.round(factor * 100), why: [`Estado: ${cond}%`].concat(why) };
    }

    /* ---------- lista ---------- */
    function shell() {
        root.innerHTML = `<div class="dpu-stats" style="grid-template-columns:repeat(auto-fit,minmax(170px,1fr))">
<div class="stat-card"><div class="stat-icon blue"><i class="fas fa-recycle"></i></div><div class="stat-value" id="dpuStMonth">0</div><div class="stat-label">Compras no mês</div></div>
<div class="stat-card"><div class="stat-icon purple"><i class="fas fa-sack-dollar"></i></div><div class="stat-value" id="dpuStPaid">R$ 0,00</div><div class="stat-label">Investido no mês</div></div>
<div class="stat-card"><div class="stat-icon green"><i class="fas fa-boxes-stacked"></i></div><div class="stat-value" id="dpuStStock">0</div><div class="stat-label">Comprados no estoque</div></div>
<div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-clipboard-check"></i></div><div class="stat-value" id="dpuStEval">0</div><div class="stat-label">Avaliações em aberto</div></div>
<div class="stat-card"><div class="stat-icon green"><i class="fas fa-arrow-trend-up"></i></div><div class="stat-value" id="dpuStProfit">R$ 0,00</div><div class="stat-label">Lucro dos vendidos no mês</div></div></div>
<div class="card dpu-bar"><div class="search-box"><i class="fas fa-search"></i><input id="dpuSearch" type="text" placeholder="Buscar por aparelho, IMEI, vendedor ou CPF..."></div>
<select id="dpuFilter" class="form-control" style="width:auto"><option value="">Todos</option><option value="evaluation">Avaliações</option><option value="purchased">Comprados</option><option value="sold">Vendidos</option><option value="declined">Recusados</option></select>
<button class="btn btn-outline" id="dpuPricing"><i class="fas fa-sliders"></i> Tabela de descontos</button><button class="btn btn-primary" id="dpuNew"><i class="fas fa-plus"></i> Nova avaliação</button></div>
<div class="card" style="padding:0"><div class="dpu-table-wrap"><table class="data-table"><thead><tr><th>Nº</th><th>Aparelho</th><th>Vendedor</th><th>Data</th><th>Valor</th><th>Situação</th><th style="text-align:right">Lucro</th><th style="text-align:right">Ações</th></tr></thead><tbody id="dpuTbody"><tr><td colspan="8" class="dpu-empty"><i class="fas fa-spinner fa-spin"></i>Carregando...</td></tr></tbody></table></div></div>`;
        $('dpuSearch').oninput = e => { search = e.target.value.toLowerCase(); render(); };
        $('dpuFilter').onchange = e => { filter = e.target.value; render(); };
        $('dpuNew').onclick = () => openEditor(null);
        $('dpuPricing').onclick = openPricing;
        $('dpuTbody').onclick = e => { const b = e.target.closest('[data-act]'); if (!b) return; const p = list.find(x => x.id === b.dataset.id); if (!p) return; if (b.dataset.act === 'open') openEditor(p); if (b.dataset.act === 'term') printTerm(p); if (b.dataset.act === 'sold') markSold(p); };
    }
    function render() {
        const now = new Date(), m0 = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const month = list.filter(p => p.status !== 'declined' && ['purchased', 'sold'].includes(p.status) && (toMs(p.purchasedAt) || 0) >= m0);
        $('dpuStMonth').textContent = month.length; $('dpuStPaid').textContent = money(month.reduce((s, p) => s + Number(p.offeredPrice || 0), 0));
        $('dpuStStock').textContent = list.filter(p => p.status === 'purchased').length; $('dpuStEval').textContent = list.filter(p => p.status === 'evaluation').length;
        const profit = p => p.status === 'sold' && Number(p.soldPrice) > 0 ? r2(Number(p.soldPrice) - Number(p.offeredPrice || 0)) : null; // 38.3 · lucro do seminovo vendido
        if ($('dpuStProfit')) $('dpuStProfit').textContent = money(list.filter(p => profit(p) !== null && (Number(p.soldAt) || 0) >= m0).reduce((s, p) => s + profit(p), 0));
        let rows = list.filter(p => !p.deleted);
        if (filter) rows = rows.filter(p => p.status === filter);
        if (search) rows = rows.filter(p => [p.number, p.device?.brand, p.device?.model, p.device?.imei1, p.device?.imei2, p.seller?.name, p.seller?.doc, digits(p.seller?.doc)].join(' ').toLowerCase().includes(search));
        $('dpuTbody').innerHTML = rows.length ? rows.map(p => `<tr><td><b>#${String(p.number || 0).padStart(4, '0')}</b></td><td><b>${esc([p.device?.brand, p.device?.model, p.device?.storage].filter(Boolean).join(' '))}</b><br><small style="color:var(--text-muted)">IMEI ${esc(p.device?.imei1 || '—')}</small></td><td>${esc(p.seller?.name || '—')}<br><small style="color:var(--text-muted)">${esc(p.seller?.doc || '')}</small></td><td>${brDate(toMs(p.purchasedAt) || toMs(p.createdAt))}</td><td><b>${money(p.offeredPrice)}</b>${p.creditCode ? `<br><small style="color:var(--text-muted)">vale ${esc(p.creditCode)}</small>` : ''}</td><td><span class="dpu-st ${p.status}">${ST[p.status] || p.status}</span>${p.status === 'sold' && p.saleNumber ? `<br><small style="color:var(--text-muted)">venda #V-${String(p.saleNumber).padStart(4, '0')}</small>` : ''}</td>
<td style="text-align:right;white-space:nowrap">${profit(p) !== null ? `<b style="color:${profit(p) >= 0 ? 'var(--success)' : 'var(--danger)'}">${money(profit(p))}</b><br><small style="color:var(--text-muted)">vendido por ${money(p.soldPrice)}</small>` : '<span style="color:var(--text-muted)">—</span>'}</td>
<td style="text-align:right;white-space:nowrap"><button class="btn btn-outline btn-sm" data-act="open" data-id="${p.id}"><i class="fas fa-pen"></i></button>${['purchased', 'sold'].includes(p.status) ? ` <button class="btn btn-outline btn-sm" data-act="term" data-id="${p.id}" title="Termo de compra"><i class="fas fa-file-contract"></i></button>` : ''}${p.status === 'purchased' ? ` <button class="btn btn-outline btn-sm" data-act="sold" data-id="${p.id}" title="Marcar como vendido"><i class="fas fa-tag"></i></button>` : ''}</td></tr>`).join('')
            : `<tr><td colspan="8" class="dpu-empty"><i class="fas fa-recycle"></i>${list.length ? 'Nada encontrado com esse filtro.' : 'Nenhuma avaliação ainda. Clique em <b>Nova avaliação</b> quando um cliente quiser vender ou dar o aparelho na troca.'}</td></tr>`;
    }
    async function reload() { const s = await db.collection(COL).get(); list = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => !p.deleted).sort((a, b) => Number(b.number || 0) - Number(a.number || 0)); render(); }

    /* ---------- avaliação / compra ---------- */
    function openEditor(p0) {
        const p = JSON.parse(JSON.stringify(p0 || { status: 'evaluation', seller: {}, device: { type: 'Celular', accessories: {} }, checklist: { items: {} }, condition: 'bom', paymentMethod: 'pix' }));
        p.seller = p.seller || {}; p.device = p.device || { accessories: {} }; p.device.accessories = p.device.accessories || {}; p.checklist = p.checklist || { items: {} }; p.checklist.items = p.checklist.items || {};
        const locked = ['purchased', 'sold'].includes(p.status);
        const m = document.createElement('div'); m.className = 'dpu-modal'; m.id = 'dpuModal';
        const f = (lbl, key, val, attrs = '', cls = '') => `<label class="${cls}">${lbl}<input class="form-control" data-f="${key}" value="${esc(val ?? '')}" ${attrs} ${locked ? 'disabled' : ''}></label>`;
        m.innerHTML = `<div class="dpu-box"><div class="dpu-head"><h3><i class="fas fa-recycle" style="color:var(--accent)"></i> ${p0 ? 'Avaliação #' + String(p.number || 0).padStart(4, '0') : 'Nova avaliação de aparelho usado'}</h3>${p0 ? `<span class="dpu-st ${p.status}">${ST[p.status]}</span>` : ''}<button type="button" data-x>×</button></div><div class="dpu-body">
<div class="dpu-sec"><h4><i class="fas fa-user"></i> Vendedor (quem está vendendo o aparelho)</h4><div class="dpu-grid">${f('Nome completo *', 'seller.name', p.seller.name, 'maxlength="90"', 'span2')}${f('CPF *', 'seller.doc', p.seller.doc, 'inputmode="numeric" maxlength="18"')}${f('RG', 'seller.rg', p.seller.rg, 'maxlength="20"')}${f('Telefone / WhatsApp', 'seller.phone', p.seller.phone, 'maxlength="20"')}${f('Endereço', 'seller.address', p.seller.address, 'maxlength="140"', 'span2')}${f('Cidade / UF', 'seller.city', p.seller.city, 'maxlength="60"')}</div></div>
<div class="dpu-sec"><h4><i class="fas fa-mobile-screen-button"></i> Aparelho</h4><div class="dpu-grid">${f('Tipo', 'device.type', p.device.type || 'Celular', 'maxlength="30"')}${f('Marca *', 'device.brand', p.device.brand, 'maxlength="40" placeholder="Apple, Samsung, Motorola…"')}${f('Modelo *', 'device.model', p.device.model, 'maxlength="60" placeholder="iPhone 12, Galaxy A54…"')}${f('Armazenamento', 'device.storage', p.device.storage, 'maxlength="20" placeholder="128 GB"')}${f('Cor', 'device.color', p.device.color, 'maxlength="30"')}${f('IMEI 1 *', 'device.imei1', p.device.imei1, 'inputmode="numeric" maxlength="20" placeholder="Disque *#06#"')}${f('IMEI 2', 'device.imei2', p.device.imei2, 'inputmode="numeric" maxlength="20"')}${f('Nº de série', 'device.serial', p.device.serial, 'maxlength="40"')}</div>
<div class="dpu-checks">${[['box', 'Caixa'], ['charger', 'Carregador'], ['invoice', 'Nota fiscal'], ['accountRemoved', 'Conta iCloud/Google removida'], ['noBlock', 'IMEI sem bloqueio (consultado)']].map(([k, l]) => `<label><input type="checkbox" data-acc="${k}" ${p.device.accessories[k] ? 'checked' : ''} ${locked ? 'disabled' : ''}> ${l}</label>`).join('')}</div><div id="dpuImeiMsg" style="font-size:12px;margin-top:6px"></div></div>
<div class="dpu-sec"><h4><i class="fas fa-list-check"></i> Checklist do aparelho${locked ? '' : ' <button type="button" class="btn btn-sm btn-secondary" data-ck-all style="margin-left:auto"><i class="fas fa-check-double"></i> Tudo OK</button>'}</h4><div class="osp-grid" id="dpuCk"></div><div class="dpu-grid" style="margin-top:10px">${f('Saúde da bateria (%)', 'checklist.battery', p.checklist.battery, 'inputmode="numeric" maxlength="3"')}<label>Estado geral<select class="form-control" data-f="condition" ${locked ? 'disabled' : ''}>${COND.map(([v, l]) => `<option value="${v}" ${p.condition === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>${f('Observações', 'checklist.notes', p.checklist.notes, 'maxlength="200"', 'span2')}</div></div>
<div class="dpu-sec"><h4><i class="fas fa-calculator"></i> Avaliação e pagamento</h4><div class="dpu-price">${f('Valor de mercado (referência) *', 'marketPrice', p.marketPrice ? String(p.marketPrice).replace('.', ',') : '', 'inputmode="decimal" placeholder="Quanto vale em bom estado"')}<div class="dpu-sug" id="dpuSug"></div>${f('Valor oferecido ao vendedor *', 'offeredPrice', p.offeredPrice ? String(p.offeredPrice).replace('.', ',') : '', 'inputmode="decimal"')}<label>Forma de pagamento<select class="form-control" data-f="paymentMethod" ${locked ? 'disabled' : ''}>${PAYS.map(([v, l]) => `<option value="${v}" ${p.paymentMethod === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>
${f('Observações da negociação', 'notes', p.notes, 'maxlength="300"', '')}</div>
<div class="dpu-sec"><h4><i class="fas fa-signature"></i> Assinatura do vendedor</h4><div id="dpuSig"></div></div>
${!locked ? `<div class="dpu-sec" id="dpuBuyOpts"><h4><i class="fas fa-cart-flatbed"></i> Ao comprar</h4><div class="dpu-checks"><label><input type="checkbox" id="dpuToStock" checked> Colocar no estoque como seminovo</label><label><input type="checkbox" id="dpuToCash" checked> Lançar a saída no caixa aberto (pagamento em dinheiro)</label></div><div class="dpu-grid" style="margin-top:8px"><label>Preço de venda (seminovo)<input class="form-control" id="dpuResale" inputmode="decimal"></label></div></div>` : (p.productId ? `<div class="dpu-sec"><small>${window.dpIcon ? dpIcon('package') + ' ' : ''}No estoque como seminovo${p.resalePrice ? ' · preço de venda ' + money(p.resalePrice) : ''}.</small></div>` : '')}
</div><div class="dpu-foot"><button type="button" class="btn btn-outline" data-x>Fechar</button>${locked ? `<button type="button" class="btn btn-primary" data-term><i class="fas fa-file-contract"></i> Termo de compra</button>` : `${p0 ? `<button type="button" class="btn btn-outline" data-decline style="color:var(--danger)"><i class="fas fa-ban"></i> Vendedor não aceitou</button>` : ''}<button type="button" class="btn btn-outline" data-print><i class="fas fa-print"></i> Imprimir avaliação</button><button type="button" class="btn btn-outline" data-save><i class="fas fa-floppy-disk"></i> Salvar avaliação</button><button type="button" class="btn btn-primary" data-buy><i class="fas fa-handshake"></i> Comprar e gerar termo</button>`}</div></div>`;
        document.body.appendChild(m);
        const set = (path, v) => { const [a, b] = path.split('.'); if (b) { p[a] = p[a] || {}; p[a][b] = v; } else p[a] = v; };
        const paintCk = () => { $('dpuCk').innerHTML = (P().CHECK_ITEMS || []).map(([k, l]) => { const v = p.checklist.items[k] || ''; return `<div class="osp-it ${v}" data-k="${k}"><span>${l}</span><div class="osp-3"><button type="button" data-v="ok" class="${v === 'ok' ? 'on' : ''}" ${locked ? 'disabled' : ''}>✓</button><button type="button" data-v="fail" class="${v === 'fail' ? 'on' : ''}" ${locked ? 'disabled' : ''}>✗</button><button type="button" data-v="na" class="${v === 'na' ? 'on' : ''}" ${locked ? 'disabled' : ''}>–</button></div></div>`; }).join(''); };
        const paintSug = () => {
            const s = suggest(p); p.suggestedPrice = s.value;
            $('dpuSug').innerHTML = `<small>Preço sugerido</small><b>${s.value ? money(s.value) : '—'}</b><em>${s.value ? esc(s.why.join(' · ')) : 'Informe o valor de mercado'}</em>`;
            const rs = $('dpuResale'); if (rs && !rs.dataset.touched) { const off = num(m.querySelector('[data-f="offeredPrice"]').value) || s.value; rs.value = off ? String(Math.round(off * (1 + Number(pricing.margin || 40) / 100) / 10) * 10).replace('.', ',') : ''; }
            const im = digits(p.device.imei1); $('dpuImeiMsg').innerHTML = im ? (imeiOk(im) ? '<span style="color:var(--success)">' + (window.dpIcon ? dpIcon('circle-check') + ' ' : '') + 'IMEI válido</span>' : '<span style="color:var(--warning)">' + (window.dpIcon ? dpIcon('triangle-alert') + ' ' : '') + 'IMEI parece inválido (confira os 15 dígitos com *#06#)</span>') : '';
        };
        const paintSig = () => { $('dpuSig').innerHTML = p.signature ? `<div class="osp-signed"><img src="${p.signature}" alt=""><div><b>${esc(p.signedName || p.seller.name || '')}</b><small>${brDate(toMs(p.signedAt), true)}</small>${locked ? '' : '<button type="button" class="btn btn-outline btn-sm" data-sign>Assinar de novo</button>'}</div></div>` : `<div class="osp-sig-ask"><span>O vendedor assina declarando ser o dono do aparelho e a origem lícita.</span><div><button type="button" class="btn btn-primary btn-sm" data-sign ${locked ? 'disabled' : ''}><i class="fas fa-pen-nib"></i> Vendedor assina na tela</button></div></div>`; };
        paintCk(); paintSug(); paintSig();
        m.addEventListener('input', e => {
            const t = e.target; if (t.id === 'dpuResale') { t.dataset.touched = '1'; return; }
            if (!t.dataset.f) return; let v = t.value;
            if (['marketPrice', 'offeredPrice'].includes(t.dataset.f)) v = num(v);
            set(t.dataset.f, v); if (['marketPrice', 'checklist.battery', 'condition', 'device.imei1', 'offeredPrice'].includes(t.dataset.f)) paintSug();
        });
        m.addEventListener('change', e => { const t = e.target; if (t.dataset.f) { set(t.dataset.f, t.value); paintSug(); } if (t.dataset.acc) p.device.accessories[t.dataset.acc] = t.checked; });
        m.addEventListener('click', async e => {
            if (e.target === m || e.target.closest('[data-x]')) { m.remove(); return; }
            if (e.target.closest('[data-ck-all]') && !locked) { (P().CHECK_ITEMS || []).forEach(([k]) => { if (p.checklist.items[k] !== 'fail') p.checklist.items[k] = 'ok'; }); paintCk(); paintSug(); return; }
            const v = e.target.closest('#dpuCk [data-v]'); if (v && !locked) { const k = v.closest('[data-k]').dataset.k; p.checklist.items[k] = p.checklist.items[k] === v.dataset.v ? '' : v.dataset.v; if (!p.checklist.items[k]) delete p.checklist.items[k]; paintCk(); paintSug(); return; }
            if (e.target.closest('[data-sign]')) { const r = await P().signOnScreen('Assinatura do vendedor', `Eu, vendedor(a), declaro ser o legítimo proprietário do aparelho ${esc([p.device.brand, p.device.model].join(' '))} (IMEI ${esc(p.device.imei1 || '—')}) e que ele tem origem lícita.`, p.seller.name || ''); if (r) { p.signature = r.signature; p.signedName = r.signedName; p.signedAt = Date.now(); paintSig(); } return; }
            if (e.target.closest('[data-print]')) { printTerm(p, true); return; }
            if (e.target.closest('[data-term]')) { printTerm(p); return; }
            if (e.target.closest('[data-save]')) { await save(p, 'evaluation', e.target.closest('button')); return; }
            if (e.target.closest('[data-decline]')) { if (confirm('Marcar esta avaliação como recusada pelo vendedor?')) await save(p, 'declined', e.target.closest('button')); return; }
            if (e.target.closest('[data-buy]')) { await buy(p, e.target.closest('button'), m); }
        });
    }
    async function nextNumber() { const s = await db.collection('settings').doc(DOC).get(); const n = (s.exists ? Number(s.data().usedPurchaseSequence || 0) : 0) + 1; await db.collection('settings').doc(DOC).set({ usedPurchaseSequence: n }, { merge: true }); return n; }
    const clean = p => { const o = JSON.parse(JSON.stringify(p)); delete o.id; return o; };
    async function save(p, status, btn) {
        if (!p.device.brand && !p.device.model) { toast('warning', 'Informe a marca e o modelo do aparelho.'); return false; }
        if (btn) btn.disabled = true;
        try {
            p.status = status; p.updatedAt = Date.now();
            if (!p.id) { p.number = await nextNumber(); const ref = await db.collection(COL).add({ ...clean(p), deleted: false, createdAt: ts(), createdBy: uname() }); p.id = ref.id; }
            else await db.collection(COL).doc(p.id).set({ ...clean(p), updatedAt: ts() }, { merge: true });
            toast('success', status === 'declined' ? 'Avaliação marcada como recusada.' : 'Avaliação salva.'); await reload();
            if (status !== 'evaluation') document.getElementById('dpuModal')?.remove();
            return true;
        } catch (e) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return false; } finally { if (btn) btn.disabled = false; }
    }
    async function buy(p, btn, modal) {
        const miss = [];
        if (!p.seller.name) miss.push('nome do vendedor'); if (!digits(p.seller.doc)) miss.push('CPF do vendedor'); if (!p.device.brand || !p.device.model) miss.push('marca e modelo'); if (!digits(p.device.imei1) && !p.device.serial) miss.push('IMEI (ou nº de série)'); if (!(num(p.offeredPrice) > 0)) miss.push('valor oferecido');
        if (miss.length) { toast('warning', 'Falta: ' + miss.join(', ') + '.'); return; }
        if (digits(p.seller.doc).length === 11 && !cpfOk(p.seller.doc) && !confirm('O CPF parece inválido. Continuar mesmo assim?')) return;
        if (!p.signature && !confirm('O vendedor ainda não assinou. Comprar sem a assinatura? (Ela pode ser feita no papel do termo.)')) return;
        const toStock = $('dpuToStock')?.checked, toCash = $('dpuToCash')?.checked, resale = num($('dpuResale')?.value);
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando...';
        try {
            p.offeredPrice = r2(num(p.offeredPrice)); p.purchasedAt = Date.now(); p.purchasedBy = uname();
            if (!await save(p, 'purchased', null)) throw new Error('não salvou');
            const label = [p.device.brand, p.device.model, p.device.storage, p.device.color].filter(Boolean).join(' ');
            const extra = {};
            // 38.3 · Aparelho na troca: o valor vira vale do cliente (sem vencimento) para abater na compra, no PDV (trocas-v1.js)
            if (p.paymentMethod === 'troca') {
                try {
                    if (!window.DPTrocas) throw new Error('o módulo de vale não carregou');
                    const cu = await DPTrocas.findOrCreateCustomer(p.seller);
                    const cr = await DPTrocas.createCredit({ customerId: cu.id, customerName: cu.name, amount: p.offeredPrice, source: 'device_purchase', refId: p.id, refLabel: `Aparelho na troca #${String(p.number).padStart(4, '0')} · ${label}`, expires: false });
                    Object.assign(extra, { customerId: cu.id, customerName: cu.name, creditId: cr.id, creditCode: cr.code });
                    toast('success', `Crédito de ${money(p.offeredPrice)} para ${cu.name}${cu.created ? ' (cliente cadastrado agora)' : ''}. No PDV, escolha o cliente e use o vale ${cr.code}.`);
                } catch (e) { toast('warning', 'Comprado, mas o crédito do cliente não foi gerado: ' + e.message); }
            }
            if (toStock) {
                try {
                    const cats = (await db.collection('categories').get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted);
                    let cat = cats.find(c => String(c.name || '').toLowerCase() === 'seminovos');
                    if (!cat) { const r = await db.collection('categories').add({ name: 'Seminovos', icon: '📱', color: '#0ea5e9', active: true, status: 'active', deleted: false, createdAt: ts(), updatedAt: ts() }); cat = { id: r.id, name: 'Seminovos' }; }
                    const prod = { name: `${label} (seminovo)`, code: 'USADO-' + String(p.number).padStart(4, '0'), barcode: digits(p.device.imei1) || '', unit: 'un', category: 'Seminovos', categoryId: cat.id, brand: p.device.brand || '', costPrice: p.offeredPrice, salePrice: resale || r2(p.offeredPrice * (1 + Number(pricing.margin || 40) / 100)), promoPrice: null, currentStock: 0, minStock: 0, status: 'active', active: true, productType: 'product', controlStock: true, imei: p.device.imei1 || '', description: `Comprado de ${p.seller.name} (avaliação #${String(p.number).padStart(4, '0')}). IMEI ${p.device.imei1 || '—'}.`, imageType: 'icon', icon: '📱', imageUrl: '', usedPurchaseId: p.id, deleted: false, createdAt: ts(), updatedAt: ts() };
                    const ref = await db.collection('products').add(prod);
                    if (typeof StockService !== 'undefined' && StockService.entry) await StockService.entry(ref.id, 1, 'Compra de usado #' + String(p.number).padStart(4, '0'), 'used_purchase', p.id);
                    else await db.collection('products').doc(ref.id).update({ currentStock: 1 });
                    extra.productId = ref.id; extra.resalePrice = prod.salePrice;
                } catch (e) { toast('warning', 'Comprado, mas não entrou no estoque: ' + e.message); }
            }
            if (toCash && p.paymentMethod === 'dinheiro') {
                try {
                    const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get();
                    if (!s.empty && typeof CashService !== 'undefined' && CashService.withdraw) { await CashService.withdraw(s.docs[0].id, p.offeredPrice, `Compra de usado #${String(p.number).padStart(4, '0')} · ${label}`); extra.cashRegisterId = s.docs[0].id; }
                    else toast('info', 'Nenhum caixa aberto: a saída do dinheiro não foi lançada.');
                } catch (e) { toast('warning', 'Comprado, mas a saída do caixa não foi lançada: ' + e.message); }
            }
            if (Object.keys(extra).length) { await db.collection(COL).doc(p.id).set(extra, { merge: true }); Object.assign(p, extra); }
            modal.remove(); await reload(); toast('success', `Compra #${String(p.number).padStart(4, '0')} registrada.`); printTerm(p);
        } catch (e) { if (e.message !== 'não salvou') toast('error', 'Não foi possível registrar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); btn.disabled = false; btn.innerHTML = '<i class="fas fa-handshake"></i> Comprar e gerar termo'; }
    }
    async function markSold(p) { // 38.3 · vendido no PDV baixa sozinho; aqui é para venda feita fora do sistema (pergunta o preço para o lucro)
        const v = prompt(`Por quanto o #${String(p.number).padStart(4, '0')} foi vendido? (deixe em branco se não souber)`, p.resalePrice ? String(p.resalePrice).replace('.', ',') : ''); if (v === null) return;
        const price = r2(num(v));
        await db.collection(COL).doc(p.id).set({ status: 'sold', soldAt: Date.now(), ...(price > 0 ? { soldPrice: price, profit: r2(price - Number(p.offeredPrice || 0)) } : {}), updatedAt: ts() }, { merge: true }); toast('success', 'Marcado como vendido.'); reload();
    }

    /* ---------- termo de compra (A4) ---------- */
    async function printTerm(p, evaluationOnly) {
        const win = window.open('', '_blank', 'width=900,height=1000'); if (!win) { toast('warning', 'Libere as janelas pop-up para imprimir.'); return; }
        const co = await P().company(); const d = p.device || {}, s = p.seller || {}, acc = d.accessories || {};
        const sum = P().checkSummary ? P().checkSummary(p.checklist) : null, sg = suggest(p);
        const ckHtml = sum ? `<table class="ck">${sum.items.map(i => `<tr><td>${esc(i.label)}</td><td class="${i.state}">${i.state === 'ok' ? 'OK' : i.state === 'fail' ? 'COM DEFEITO' : 'NÃO TESTADO'}</td></tr>`).join('')}</table>${sum.battery ? `<div style="margin-top:4px">Saúde da bateria: <b>${esc(sum.battery)}%</b></div>` : ''}` : '<div>Checklist não preenchido.</div>';
        const pay = (PAYS.find(x => x[0] === p.paymentMethod) || [0, p.paymentMethod])[1];
        const when = brDate(toMs(p.purchasedAt) || Date.now());
        P().writeA4(win, (evaluationOnly ? 'Avaliação ' : 'Termo de compra ') + String(p.number || 0).padStart(4, '0'), `
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${esc([co.legal && co.legal !== co.name ? co.legal : '', co.cnpj && 'CNPJ ' + co.cnpj, co.phone].filter(Boolean).join(' · '))}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">${evaluationOnly ? 'AVALIAÇÃO DE APARELHO' : 'TERMO DE COMPRA DE APARELHO USADO'}</div><div class="n">Nº ${String(p.number || 0).padStart(4, '0')}</div><p>${when}</p></div></div>
<div class="box"><h3>Vendedor</h3><div><div class="l">Nome</div><div class="v">${esc(s.name || '—')}</div></div><div><div class="l">CPF</div><div class="v">${esc(s.doc || '—')}</div></div><div><div class="l">RG</div><div class="v">${esc(s.rg || '—')}</div></div><div><div class="l">Telefone</div><div class="v">${esc(s.phone || '—')}</div></div><div style="grid-column:1/-1"><div class="l">Endereço</div><div class="v">${esc([s.address, s.city].filter(Boolean).join(' · ') || '—')}</div></div></div>
<div class="box"><h3>Aparelho</h3><div><div class="l">Aparelho</div><div class="v">${esc([d.type, d.brand, d.model, d.storage, d.color].filter(Boolean).join(' '))}</div></div><div><div class="l">IMEI</div><div class="v">${esc([d.imei1, d.imei2].filter(Boolean).join(' / ') || '—')}</div></div><div><div class="l">Nº de série</div><div class="v">${esc(d.serial || '—')}</div></div><div><div class="l">Estado</div><div class="v">${esc((COND.find(c => c[0] === p.condition) || [0, '—'])[1])}</div></div>
<div style="grid-column:1/-1"><div class="l">Itens e situação</div><div class="v">${[['box', 'caixa'], ['charger', 'carregador'], ['invoice', 'nota fiscal']].map(([k, l]) => (acc[k] ? '✔ ' : '✘ ') + l).join(' · ')} · ${acc.accountRemoved ? '✔ conta iCloud/Google removida' : '✘ conta iCloud/Google NÃO confirmada'} · ${acc.noBlock ? '✔ IMEI consultado sem bloqueio' : '✘ IMEI não consultado'}</div></div></div>
<div class="box"><h3>Checklist</h3><div style="grid-column:1/-1">${ckHtml}${p.checklist?.notes ? `<div style="margin-top:4px">Obs.: ${esc(p.checklist.notes)}</div>` : ''}</div></div>
<div class="big"><div><div class="l">${evaluationOnly ? 'Valor proposto' : 'Valor pago ao vendedor'}</div><b>${money(p.offeredPrice || sg.value)}</b><div style="font-size:12px;margin-top:4px">Forma de pagamento: <b>${esc(pay)}</b>${p.creditCode ? ` · vale <b>${esc(p.creditCode)}</b> no nome de ${esc(p.customerName || s.name || '')}` : ''}${sg.value ? ` · sugerido pela avaliação: ${money(sg.value)}` : ''}</div></div></div>
${evaluationOnly ? '<div class="terms">Avaliação válida por 3 dias, sujeita à conferência do aparelho na hora da compra.</div>' : `<div class="terms"><b>Declarações do vendedor</b>
1. Declaro ser o legítimo proprietário do aparelho descrito acima e que ele foi adquirido de forma lícita, não sendo produto de furto, roubo, receptação ou qualquer outra origem ilegal.
2. Declaro que o aparelho não possui restrição, bloqueio de IMEI, alienação ou pendência, e que removi as contas (iCloud, Google) e dados pessoais, ou autorizo a loja a apagá-los.
3. Vendo o aparelho à ${esc(co.legal || co.name)}${co.cnpj ? ' (CNPJ ' + esc(co.cnpj) + ')' : ''} pelo valor acima, dando plena e geral quitação, e assumo total responsabilidade civil e criminal pelas informações prestadas.
4. Se o aparelho for identificado como produto de furto, roubo ou com bloqueio, comprometo-me a devolver o valor recebido, sem prejuízo das medidas legais.
5. Autorizo a guarda dos meus dados e deste termo pela loja para cumprir as obrigações legais de registro de compra de aparelhos usados (LGPD, art. 7º, II).</div>`}
<div class="sign"><div>${p.signature ? `<img src="${p.signature}" alt="">` : ''}${esc(s.name || 'Vendedor')}<br>CPF ${esc(s.doc || '')}</div><div>${esc(co.name)}<br>${esc(p.purchasedBy || uname())}</div></div>`);
    }

    /* ---------- tabela de descontos ---------- */
    function openPricing() {
        const items = P().CHECK_ITEMS || [];
        const ov = P().dlg(`<h3><i class="fas fa-sliders"></i> Tabela de descontos da avaliação</h3><p class="osp-sub">O preço sugerido = valor de mercado × estado geral × (100% − soma dos defeitos). Ajuste conforme a sua loja.</p>
<div class="dpu-grid">${[['excelente', 'Excelente'], ['bom', 'Bom'], ['regular', 'Regular'], ['ruim', 'Ruim']].map(([k, l]) => `<label>${l} (% do valor)<input class="form-control" data-cond="${k}" inputmode="numeric" value="${pricing.condition[k]}"></label>`).join('')}</div>
<p class="osp-sub" style="margin-top:12px"><b>Desconto por defeito (%)</b></p><div class="dpu-grid">${items.map(([k, l]) => `<label>${l}<input class="form-control" data-ded="${k}" inputmode="numeric" value="${pricing.deductions[k] ?? 0}"></label>`).join('')}</div>
<div class="dpu-grid" style="margin-top:12px"><label>Bateria abaixo de (%)<input class="form-control" data-p="batteryLimit" value="${pricing.batteryLimit}"></label><label>Desconto da bateria (%)<input class="form-control" data-p="batteryDeduction" value="${pricing.batteryDeduction}"></label><label>Margem de revenda (%)<input class="form-control" data-p="margin" value="${pricing.margin}"></label></div>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-reset>Voltar ao padrão</button><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Salvar tabela</button></div>`, true);
        ov.querySelector('[data-reset]').onclick = () => { pricing = JSON.parse(JSON.stringify(DEF_PRICING)); ov.remove(); openPricing(); };
        ov.querySelector('[data-ok]').onclick = async () => {
            const np = { condition: {}, deductions: {} };
            ov.querySelectorAll('[data-cond]').forEach(i => { np.condition[i.dataset.cond] = Math.max(0, Math.min(100, Math.round(num(i.value)))); });
            ov.querySelectorAll('[data-ded]').forEach(i => { np.deductions[i.dataset.ded] = Math.max(0, Math.min(100, Math.round(num(i.value)))); });
            ov.querySelectorAll('[data-p]').forEach(i => { np[i.dataset.p] = Math.max(0, Math.min(300, Math.round(num(i.value)))); });
            try { await db.collection('settings').doc(DOC).set({ usedPricing: np }, { merge: true }); pricing = { ...DEF_PRICING, ...np }; ov.remove(); toast('success', 'Tabela de descontos salva.'); } catch (e) { toast('error', e.message); }
        };
    }

    async function boot() {
        if (booted) return; booted = true;
        shell();
        try {
            const s = await db.collection('settings').doc(DOC).get(); const up = s.exists ? (s.data() || {}).usedPricing : null;
            if (up) pricing = { ...DEF_PRICING, ...up, condition: { ...DEF_PRICING.condition, ...(up.condition || {}) }, deductions: { ...DEF_PRICING.deductions, ...(up.deductions || {}) } };
            await reload();
        } catch (e) { console.error(e); $('dpuTbody').innerHTML = `<tr><td colspan="8" class="dpu-empty"><i class="fas fa-triangle-exclamation"></i>Não foi possível carregar: ${esc(e.message)}</td></tr>`; }
    }
    window.initPage = boot;
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 700); }); } catch (e) { }
})();
