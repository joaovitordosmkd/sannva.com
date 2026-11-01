/* DistribuiPro 36.9 · Finalizar OS — ordens-servico.html (carregar depois de os-pro-v1.js)
   - "Faturar e entregar" com o caixa fechado: abre o caixa ali mesmo (troco + turno) e conclui o faturamento.
   - Depois de finalizar: janela com "Imprimir cupom (térmica)", "Imprimir A4" e "Enviar no WhatsApp".
   - Botão de WhatsApp em cada OS da lista: manda o resumo completo da OS para o cliente.
   Funciona nas 5 versões (Mensal, MySQL, Firebase, Offline e demo). */
(function () {
    'use strict';
    if (typeof window.confirmServiceOrderPayment !== 'function') return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const osNum = o => '#OS-' + String((o && o.orderNumber) || 0).padStart(4, '0');
    const orders = () => { try { return serviceOrders || []; } catch (e) { return []; } };
    const custs = () => { try { return osCustomers || []; } catch (e) { return []; } };
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : ''; };
    const waPhone = v => { let d = String(v || '').replace(/\D/g, ''); if (d.length > 11 && d.startsWith('55')) return d; if (d.length === 10 || d.length === 11) return '55' + d; return d; };
    const PAY = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado / a receber', multi: 'Múltiplas formas', sinal: 'Sinal' };

    const css = document.createElement('style');
    css.textContent = `.osf-ov{position:fixed;inset:0;z-index:10070;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.osf-box{background:var(--bg-card);color:var(--text-primary);border-radius:16px;width:100%;max-width:440px;padding:22px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.osf-box h3{margin:0 0 6px;font-size:17px;color:var(--text-heading)}.osf-box p{margin:0 0 14px;font-size:13px;color:var(--text-muted)}
.osf-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.osf-grid .full{grid-column:1/-1}
.osf-opt{border:2px solid var(--border-color);background:var(--bg-secondary);border-radius:12px;padding:14px 10px;cursor:pointer;text-align:center;color:var(--text-primary);font:inherit}
.osf-opt:hover{border-color:var(--accent)}.osf-opt i{font-size:24px;display:block;margin-bottom:6px}.osf-opt b{display:block;font-size:13px}.osf-opt small{display:block;font-size:11px;color:var(--text-muted);margin-top:2px}
.osf-opt.wa i{color:#25d366}.osf-foot{display:flex;justify-content:flex-end;gap:8px;margin-top:14px}
.osf-ret{max-width:500px}.osf-rs{display:grid;gap:6px;margin:0 0 12px}.osf-rs label{display:flex;gap:9px;align-items:flex-start;border:1px solid var(--border-color);border-radius:10px;padding:9px 11px;cursor:pointer;font-size:13px;background:var(--bg-secondary)}
.osf-rs label:has(input:checked){border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.1))}.osf-rs input{margin-top:2px}.osf-rs b{display:block;font-size:13px}.osf-rs small{display:block;font-size:11px;color:var(--text-muted);margin-top:2px}
.osf-retbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;border:1px dashed var(--border-color);border-radius:12px;padding:9px 12px;margin:0 0 14px;font-size:12.5px;color:var(--text-muted)}`;
    document.head.appendChild(css);

    /* ---------- abrir caixa ---------- */
    async function openCash() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!s.empty) return { id: s.docs[0].id }; } catch (e) { }
        try { const s = await db.collection('cash_registers').get(); const r = s.docs.find(d => (d.data() || {}).status === 'open'); return r ? { id: r.id } : null; } catch (e) { return null; }
    }
    // 38.4 · opt.text / opt.button: o sinal da OS (os-bancada-v1.js) usa a mesma janela com outro texto
    function askOpenCash(opt) {
        opt = opt || {};
        return new Promise(resolve => {
            const ov = document.createElement('div'); ov.className = 'osf-ov';
            const h = new Date().getHours();
            ov.innerHTML = `<div class="osf-box"><h3><i class="fas fa-cash-register" style="color:var(--accent);margin-right:6px"></i>Abrir o caixa</h3><p>${esc(opt.text || 'Para receber em PIX, dinheiro ou cartão o caixa precisa estar aberto. Abra agora e a OS é faturada em seguida.')}</p>
              <div class="form-group"><label class="form-label">Valor inicial em dinheiro (troco)</label><input type="number" class="form-control" id="osfInit" step="0.01" min="0" value="0"></div>
              <div class="form-group"><label class="form-label">Turno</label><select class="form-control" id="osfShift"><option value="morning">Manhã</option><option value="afternoon">Tarde</option><option value="night">Noite</option></select></div>
              <div class="osf-foot"><button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-primary" type="button" data-ok><i class="fas fa-lock-open"></i> ${esc(opt.button || 'Abrir caixa e faturar')}</button></div></div>`;
            document.body.appendChild(ov);
            ov.querySelector('#osfShift').value = h < 12 ? 'morning' : h < 18 ? 'afternoon' : 'night';
            ov.querySelector('[data-x]').onclick = () => { ov.remove(); resolve(false); };
            const ok = ov.querySelector('[data-ok]');
            ok.onclick = async () => {
                ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Abrindo...';
                try { await CashService.open(parseFloat(ov.querySelector('#osfInit').value) || 0, ov.querySelector('#osfShift').value); ov.remove(); toast('success', 'Caixa aberto!'); resolve(true); }
                catch (e) { toast('error', 'Não foi possível abrir o caixa: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); ok.disabled = false; ok.innerHTML = '<i class="fas fa-lock-open"></i> ' + esc(opt.button || 'Abrir caixa e faturar'); }
            };
            setTimeout(() => { const f = ov.querySelector('#osfInit'); if (f) { f.focus(); f.select(); } }, 50);
        });
    }
    window.OSF = { openCash, askOpenCash }; // 38.4 · o "Receber sinal" da OS usa o mesmo abrir caixa
    function needsCash() {
        const m = ($('osPaymentMethod') || {}).value || '';
        if (m === 'fiado') return false;
        try { const o = orders().find(x => x.id === receivingOsId); if (o && Number(o.total || 0) - Number(o.depositTotal || 0) <= 0.009) return false; } catch (e) { } // 38.4 · o sinal já pagou tudo
        if (m === 'multi') { try { return (osMultiPayments || []).some(p => p.method !== 'fiado' && Number(p.amount || 0) > 0); } catch (e) { return true; } }
        return true;
    }

    /* ---------- faturar ---------- */
    let lastDone = null;
    // ServiceOrderService é "const" do core-services (fora do window): acessa pelo nome
    if (typeof ServiceOrderService !== 'undefined' && ServiceOrderService && typeof ServiceOrderService.receivePayment === 'function') {
        const orig = ServiceOrderService.receivePayment;
        ServiceOrderService.receivePayment = async function (orderId) { const r = await orig.apply(this, arguments); lastDone = { orderId, result: r }; return r; };
    }
    const origConfirm = window.confirmServiceOrderPayment;
    window.confirmServiceOrderPayment = async function () {
        if (needsCash() && !(await openCash())) { if (!(await askOpenCash())) return; }
        lastDone = null;
        const r = await origConfirm.apply(this, arguments);
        if (lastDone) { const d = lastDone; lastDone = null; setTimeout(() => afterFinish(d.orderId, d.result), 350); }
        return r;
    };

    /* ---------- depois de finalizar ---------- */
    function printAs(id, fmt) {
        const KEY = 'dp_os_print_format'; let old = null;
        try { old = localStorage.getItem(KEY); localStorage.setItem(KEY, fmt); } catch (e) { }
        try { return window.printServiceOrder(id); }
        finally { setTimeout(() => { try { if (old == null) localStorage.removeItem(KEY); else localStorage.setItem(KEY, old); } catch (e) { } }, 50); }
    }
    function afterFinish(id, result) {
        const o = orders().find(x => x.id === id) || {};
        const ov = document.createElement('div'); ov.className = 'osf-ov';
        ov.innerHTML = `<div class="osf-box"><h3><i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>${esc(osNum(o))} finalizada!</h3><p>${esc(o.customerName || 'Cliente')} · ${money(result && result.total != null ? result.total : o.total)}${result && result.saleNumber ? ' · Venda #V-' + String(result.saleNumber).padStart(4, '0') : ''}</p>
          <div class="osf-grid"><button type="button" class="osf-opt" data-p="thermal"><i class="fas fa-receipt"></i><b>Cupom térmico</b><small>OS + entrega + garantia (80 mm)</small></button>
          <button type="button" class="osf-opt" data-p="a4"><i class="fas fa-file-lines"></i><b>Folha A4</b><small>OS + entrega + garantia numa folha</small></button>
          <button type="button" class="osf-opt wa full" data-w><i class="fab fa-whatsapp"></i><b>Enviar no WhatsApp</b><small>Resumo da OS para o cliente</small></button></div>
          <div class="osf-foot"><button class="btn btn-secondary" type="button" data-x>Fechar</button></div></div>`;
        document.body.appendChild(ov);
        ov.querySelector('[data-x]').onclick = () => ov.remove();
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        ov.querySelectorAll('[data-p]').forEach(b => b.onclick = () => printAs(id, b.dataset.p));
        ov.querySelector('[data-w]').onclick = () => sendWhats(id);
    }

    /* ---------- 39.14.5 · Devolver ao cliente SEM REPARO (pedido do dono) ----------
       Orçamento não aprovado ou aparelho sem conserto: fecha a OS sem venda e sem cobrança, sem marcar o serviço como
       executado (ServiceOrderService.returnWithoutRepair). Fica no histórico com o motivo e pode ser reaberta. Sinal: devolver
       (estorno no caixa aberto) ou reter, como no cancelamento (OSB.settleDeposit). Entra pela lista (botão) e pela janela
       "Faturar e entregar" (o aparelho vai voltar sem conserto?). */
    const RET_REASONS = [['orcamento', 'Orçamento não aprovado pelo cliente', 'O cliente não quis fazer o conserto'], ['sem_conserto', 'Aparelho sem conserto', 'Não tem reparo (peça fora de linha, dano grave...)'], ['outro', 'Outro motivo', 'Escreva o motivo']];
    const human = e => (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)) || 'erro desconhecido';
    async function returnDialog(id) {
        let o = orders().find(x => x.id === id);
        try { const d = await db.collection('service_orders').doc(id).get(); if (d.exists) o = { id, ...d.data() }; } catch (e) { }
        if (!o) return;
        if (o.saleId || ['delivered', 'cancelled', 'returned'].includes(o.status)) { toast('info', 'Esta OS já está encerrada.'); return; }
        const dev = [o.deviceType, o.brand, o.model].filter(Boolean).join(' · '), dep = Math.round(Number(o.depositTotal || 0) * 100) / 100;
        const ov = document.createElement('div'); ov.className = 'osf-ov';
        ov.innerHTML = `<div class="osf-box osf-ret"><h3><i class="fas fa-rotate-left" style="color:var(--accent);margin-right:6px"></i>Devolver ao cliente sem reparo</h3>
<p>${esc(osNum(o))} · ${esc(o.customerName || 'Cliente')}${dev ? ' · ' + esc(dev) : ''}</p>
<div class="osf-rs">${RET_REASONS.map(([v, l, s], i) => `<label><input type="radio" name="osfRet" value="${v}"${i === 0 ? ' checked' : ''}><span><b>${esc(l)}</b><small>${esc(s)}</small></span></label>`).join('')}</div>
<div class="form-group" data-outro hidden><label class="form-label">Qual o motivo? *</label><input class="form-control" data-f="outro" maxlength="120" placeholder="Ex.: o cliente desistiu do conserto"></div>
<div class="form-group"><label class="form-label">Observação (opcional)</label><textarea class="form-control" data-f="notes" rows="2" maxlength="500" placeholder="Ex.: peça fora de linha; aparelho devolvido como chegou"></textarea></div>
${dep > 0 ? `<div class="form-group"><label class="form-label">Esta OS tem sinal de ${money(dep)}. O que fazer com ele? *</label><div class="osf-rs"><label><input type="radio" name="osfRetDep" value="refund"><span><b>Devolver ao cliente</b><small>Sai do caixa aberto como estorno, do mesmo jeito que entrou.</small></span></label><label><input type="radio" name="osfRetDep" value="retain"><span><b>Reter (fica com a loja)</b><small>Ex.: taxa de diagnóstico, conforme o termo de entrada.</small></span></label></div></div>` : ''}
<div class="os-alert os-alert-info" style="margin:4px 0 0"><i class="fas fa-circle-info"></i><span>A OS fica encerrada como <b>Devolvido sem reparo</b>: nada é cobrado, o serviço não fica como executado e não tem garantia. Ela continua no histórico e pode ser reaberta.</span></div>
<div class="osf-foot"><button class="btn btn-secondary" type="button" data-x>Voltar</button><button class="btn btn-primary" type="button" data-ok><i class="fas fa-check"></i> Confirmar devolução</button></div></div>`;
        document.body.appendChild(ov);
        const outro = ov.querySelector('[data-outro]'), f = k => ov.querySelector(`[data-f="${k}"]`);
        ov.querySelectorAll('input[name="osfRet"]').forEach(r => r.addEventListener('change', () => { outro.hidden = r.value !== 'outro' || !r.checked; if (!outro.hidden) f('outro').focus(); }));
        ov.querySelector('[data-x]').onclick = () => ov.remove();
        const ok = ov.querySelector('[data-ok]');
        ok.onclick = async () => {
            const reason = (ov.querySelector('input[name="osfRet"]:checked') || {}).value || 'orcamento';
            const reasonText = reason === 'outro' ? f('outro').value.trim() : RET_REASONS.find(x => x[0] === reason)[1];
            if (!reasonText) { toast('warning', 'Escreva o motivo da devolução.'); f('outro').focus(); return; }
            let act = null, cash = null;
            if (dep > 0) {
                act = (ov.querySelector('input[name="osfRetDep"]:checked') || {}).value;
                if (!act) { toast('warning', 'Escolha se o sinal será devolvido ao cliente ou retido pela loja.'); return; }
                if (act === 'refund') {
                    cash = await openCash();
                    if (!cash) { if (!(await askOpenCash({ text: 'Para devolver o sinal o caixa precisa estar aberto. Abra agora e a devolução continua.', button: 'Abrir caixa e devolver' }))) return; cash = await openCash(); if (!cash) return; }
                }
            }
            ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Devolvendo...';
            try { await ServiceOrderService.returnWithoutRepair(id, { reason, reasonText, notes: f('notes').value.trim() }); }
            catch (e) { toast('error', 'Não foi possível devolver: ' + human(e)); ok.disabled = false; ok.innerHTML = '<i class="fas fa-check"></i> Confirmar devolução'; return; }
            if (act && window.OSB && OSB.settleDeposit) {
                try { const d = await db.collection('service_orders').doc(id).get(); await OSB.settleDeposit({ id, ...d.data() }, act, cash); toast('success', act === 'refund' ? `Sinal de ${money(dep)} devolvido (estorno no caixa).` : `Sinal de ${money(dep)} retido.`); }
                catch (e) { toast('error', 'A OS foi devolvida, mas o sinal não foi resolvido: ' + human(e)); }
            }
            ov.remove(); toast('success', `${osNum(o)} devolvida ao cliente sem reparo.`);
            if (typeof loadServiceOrders === 'function') { try { await loadServiceOrders(); } catch (e) { } }
            afterReturn(id);
        };
    }
    function afterReturn(id) {
        const o = orders().find(x => x.id === id) || {};
        const ov = document.createElement('div'); ov.className = 'osf-ov';
        ov.innerHTML = `<div class="osf-box"><h3><i class="fas fa-rotate-left" style="color:var(--accent);margin-right:6px"></i>${esc(osNum(o))} devolvida sem reparo</h3><p>${esc(o.customerName || 'Cliente')}${o.returnReasonText ? ' · ' + esc(o.returnReasonText) : ''} · sem cobrança</p>
          <div class="osf-grid"><button type="button" class="osf-opt" data-p="thermal"><i class="fas fa-receipt"></i><b>Cupom térmico</b><small>Comprovante de devolução (80 mm)</small></button>
          <button type="button" class="osf-opt" data-p="a4"><i class="fas fa-file-lines"></i><b>Folha A4</b><small>Comprovante de devolução</small></button>
          <button type="button" class="osf-opt wa full" data-w><i class="fab fa-whatsapp"></i><b>Avisar no WhatsApp</b><small>Mensagem para o cliente</small></button></div>
          <div class="osf-foot"><button class="btn btn-secondary" type="button" data-x>Fechar</button></div></div>`;
        document.body.appendChild(ov);
        ov.querySelector('[data-x]').onclick = () => ov.remove();
        ov.addEventListener('click', e => { if (e.target === ov) ov.remove(); });
        ov.querySelectorAll('[data-p]').forEach(b => b.onclick = () => printAs(id, b.dataset.p));
        ov.querySelector('[data-w]').onclick = () => sendWhats(id);
    }
    window.OSF.returnDialog = returnDialog;
    // Na janela "Faturar e entregar": o aparelho vai voltar sem conserto?
    (function () {
        const body = $('osPaymentModal') && $('osPaymentModal').querySelector('.modal-body'); if (!body || $('osfRetBar')) return;
        body.insertAdjacentHTML('afterbegin', `<div class="osf-retbar" id="osfRetBar"><span><i class="fas fa-circle-question"></i> O aparelho vai voltar <b>sem conserto</b> (orçamento recusado ou sem reparo)?</span><button type="button" class="btn btn-outline btn-sm"><i class="fas fa-rotate-left"></i> Devolver sem reparo</button></div>`);
        $('osfRetBar').querySelector('button').onclick = () => { const id = typeof receivingOsId !== 'undefined' ? receivingOsId : null; if (typeof closeModal === 'function') closeModal('osPaymentModal'); if (id) returnDialog(id); };
    })();
    // OS devolvida: o status e os valores ficam travados (para mexer, Reabrir)
    if (typeof window.openServiceOrder === 'function') {
        const origOpen = window.openServiceOrder;
        window.openServiceOrder = function (id = null) {
            const r = origOpen.apply(this, arguments);
            try {
                const o = id ? orders().find(x => x.id === id) : null;
                if (o && o.status === 'returned') {
                    ['osCustomer', 'osLabor', 'osPartsValue', 'osDiscount', 'osStatus'].forEach(k => { const el = $(k); if (el) el.disabled = true; });
                    const q = $('ospCliQ'); if (q) q.disabled = true;
                    const note = $('osLockedNote'); if (note) { note.style.display = 'flex'; note.innerHTML = `<i class="fas fa-rotate-left"></i><span>Devolvida ao cliente <b>sem reparo</b>${o.returnReasonText ? ' · ' + esc(o.returnReasonText) : ''}${o.returnedAt ? ' em ' + esc(fmtD(o.returnedAt)) : ''}. Sem cobrança. Para mexer, use <b>Reabrir</b> na lista.</span>`; }
                }
            } catch (e) { }
            return r;
        };
    }
    try { if (typeof renderServiceOrders === 'function' && typeof serviceOrders !== 'undefined' && serviceOrders.length) renderServiceOrders(); } catch (e) { }

    /* ---------- WhatsApp com o resumo da OS ---------- */
    async function sendWhats(id) {
        let o = orders().find(x => x.id === id);
        try { const d = await db.collection('service_orders').doc(id).get(); if (d.exists) o = { id, ...d.data() }; } catch (e) { }
        if (!o) return;
        const c = custs().find(x => x.id === o.customerId) || {};
        let phone = waPhone(c.whatsapp || c.phone || c.telefone || c.celular || o.customerPhone || '');
        let co = 'Nossa loja'; try { const s = await db.collection('settings').doc('general').get(); const g = s.exists ? (s.data() || {}) : {}; co = g.nomeFantasia || g.razaoSocial || co; } catch (e) { }
        let link = ''; try { if (window.OSX && OSX.ensureTracking) link = await OSX.ensureTracking(id); } catch (e) { }
        const st = (typeof OS_STATUS !== 'undefined' && OS_STATUS[o.status] && OS_STATUS[o.status][0]) || o.status || '';
        const dev = [o.deviceType, o.brand, o.model].filter(Boolean).join(' ');
        const items = Array.isArray(o.items) ? o.items.map(i => `• ${(Number(i.qty) || 1).toLocaleString('pt-BR')}x ${i.name} — ${money((Number(i.qty) || 1) * (Number(i.price) || 0))}`) : [];
        const pays = Array.isArray(o.payments) && o.payments.length ? o.payments.map(p => (PAY[p.method] || p.method) + (o.payments.length > 1 ? ' ' + money(p.amount) : '')).join(' + ') : '';
        const lines = [
            `*Ordem de Serviço ${osNum(o)}* — ${co}`,
            `Olá, ${String(o.customerName || '').split(' ')[0] || 'cliente'}!`, '',
            // 38.1 · OS de veículo: "Veículo", "Chassi" e "Placa" (DPTerm do ramo-v1.js)
            dev ? `${window.DPTerm && DPTerm.isVehicle(o) ? '🚗 Veículo' : '📱 Aparelho'}: ${dev}` : '', o.imei ? `${window.DPTerm ? DPTerm('IMEI', o) : 'IMEI'}: ${o.imei}` : '', o.serial ? `${window.DPTerm ? DPTerm('Série', o) : 'Série'}: ${o.serial}` : '',
            o.problemReported ? `🔧 Defeito relatado: ${o.problemReported}` : '',
            o.diagnosis ? `🩺 Diagnóstico: ${o.diagnosis}` : '',
            // 39.14.5 · Devolvido sem reparo: o serviço foi só orçado e nada é cobrado
            o.status === 'returned' ? `↩️ *Devolvido sem reparo*${o.returnReasonText ? ': ' + o.returnReasonText : ''}` : '',
            o.serviceDescription ? (o.status === 'returned' ? `📝 Serviço orçado (não executado): ${o.serviceDescription}` : `✅ Serviço: ${o.serviceDescription}`) : '',
            o.partsDescription ? `🔩 Peças: ${o.partsDescription}` : '',
            items.length ? '\n' + items.join('\n') : '',
            '', o.status === 'returned' ? (Number(o.total) > 0 ? `Orçamento: ${money(o.total)} · *sem cobrança*` : '*Sem cobrança*') : `💰 *Total: ${money(o.total)}*`,
            Number(o.depositTotal || 0) > 0 && !o.saleId ? `Sinal pago: ${money(o.depositTotal)} · Falta pagar: *${money(Math.max(0, Number(o.total || 0) - Number(o.depositTotal || 0)))}*` : '', // 38.4
            pays ? `Pagamento: ${pays}` : '',
            `Situação: ${st}`,
            Number(o.warrantyDays || 0) > 0 && o.status !== 'returned' ? `🛡️ Garantia: ${Number(o.warrantyDays)} dias${o.deliveredAt ? ' a partir de ' + fmtD(o.deliveredAt) : ''}` : '',
            link ? `\nAcompanhe sua OS: ${link}` : '',
            '', 'Obrigado pela preferência!'
        ].filter((l, i, a) => l !== '' || (i > 0 && a[i - 1] !== ''));
        const text = lines.join('\n');
        if (!phone) {
            const typed = window.prompt('Número de WhatsApp do cliente (com DDD):', '');
            if (!typed) return; phone = waPhone(typed);
        }
        window.open(`https://wa.me/${phone}?text=${encodeURIComponent(text)}`, '_blank');
    }
    window.dpSendOsWhats = sendWhats;

    // Permissão "Bloquear Vender / Faturar" (cadastro do usuário): some o Faturar e ele não roda
    const me = () => { try { return currentUser || {}; } catch (e) { return {}; } };
    const sellBlocked = () => { const u = me(); return u.role !== 'admin' && !!(u.permissions && u.permissions.blockSell); };
    const origReceive = window.receiveServiceOrder;
    if (typeof origReceive === 'function') window.receiveServiceOrder = function () { if (sellBlocked()) { toast('warning', 'Seu usuário não tem permissão para faturar. Peça ao administrador.'); return; } return origReceive.apply(this, arguments); };

    // Botão de WhatsApp em cada linha da lista (ao lado da impressora)
    function decorate() {
        if (sellBlocked()) document.querySelectorAll('#osTbody button[onclick^="receiveServiceOrder("]').forEach(b => b.remove());
        document.querySelectorAll('#osTbody button[onclick^="printServiceOrder("]').forEach(b => {
            if (b.nextElementSibling && b.nextElementSibling.classList.contains('osf-wa')) return;
            const m = (b.getAttribute('onclick') || '').match(/printServiceOrder\('([^']+)'\)/); if (!m) return;
            const w = document.createElement('button'); w.className = 'btn-icon osf-wa'; w.title = 'Enviar a OS no WhatsApp do cliente'; w.style.color = '#25d366';
            w.innerHTML = '<i class="fab fa-whatsapp"></i>'; w.onclick = e => { e.stopPropagation(); sendWhats(m[1]); };
            b.insertAdjacentElement('afterend', w);
        });
    }
    const tb = $('osTbody'); if (tb && window.MutationObserver) new MutationObserver(decorate).observe(tb, { childList: true });
    decorate();
})();
