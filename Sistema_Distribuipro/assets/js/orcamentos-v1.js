/* DistribuiPro 35.0 · Orçamentos para clientes.
   Monta orçamento com produtos do estoque e itens avulsos/serviços, imprime (A4 ou cupom),
   envia pelo WhatsApp e leva para o PDV, onde vira venda com um toque.
   Coleção: quotes · numeração: settings/general.quoteNumberSequence */
(function () {
    'use strict';
    const C = window.DPCatalog;
    const COL = 'quotes';
    const ST = {
        draft: ['Rascunho', 'fa-pen'], sent: ['Enviado', 'fa-paper-plane'], approved: ['Aprovado', 'fa-thumbs-up'],
        rejected: ['Recusado', 'fa-thumbs-down'], converted: ['Vendido', 'fa-cart-shopping'], expired: ['Vencido', 'fa-hourglass-end']
    };
    let quotes = [], products = [], customers = [], editing = null, booted = false;
    // 36.9 · Vendedor responsável, formas de pagamento cadastradas e permissões
    let sellers = [], payActive = ['dinheiro', 'pix', 'debito', 'credito', 'fiado'];
    const PAY_LABEL = { dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão de débito', credito: 'Cartão de crédito', fiado: 'Fiado / a receber', multi: 'Mais de uma forma' };
    const me = () => { try { return currentUser || {}; } catch (e) { return {}; } };
    const isAdm = () => ['admin'].includes(me().role);
    const canSellQuote = () => isAdm() || !((me().permissions || {}).blockSell || (me().permissions || {}).blockQuoteToSale);

    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    // Versão MySQL (app mensal e zip MySQL) não tem o objeto "firebase": usa DPFieldValue
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const today = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
    const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const addDays = n => { const d = today(); d.setDate(d.getDate() + n); return isoDate(d); };
    const brDate = iso => { if (!iso) return '—'; const [y, m, d] = String(iso).slice(0, 10).split('-'); return d ? `${d}/${m}/${y}` : '—'; };
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : new Date(v.__ts || v.seconds * 1000 || v); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtWhen = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const label = q => String(q.quoteNumber || 0).padStart(6, '0');
    const parseQty = v => C ? C.parseQty(v) : Number(String(v).replace(',', '.')) || 0;
    const parseMoney = v => { const s = String(v ?? '').trim(); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const unitOf = u => C ? C.unit(u) : { value: u || 'un', abbr: String(u || 'UN').toUpperCase(), label: u || 'Unidade', frac: false };
    const fmtQty = (q, u) => C ? C.fmtQty(q, u) : String(q);
    // 39.5 · Aparelho / equipamento do orçamento: quotes.device {name, serial, problem}
    const devOf = q => { const d = (q && q.device) || {}; return { name: String(d.name || ''), serial: String(d.serial || ''), problem: String(d.problem || '') }; };
    const isVehMode = () => { try { return !!(window.DPRamo && DPRamo.vehicle && DPRamo.vehicle()); } catch (e) { return false; } };
    const devSegment = () => { try { return ['celular', 'oficina', 'servicos'].includes(window.DPRamo && DPRamo.segment ? DPRamo.segment() : ''); } catch (e) { return false; } };
    const devIdLabel = () => isVehMode() ? 'Placa' : 'IMEI / Série';

    function effStatus(q) {
        if ((q.status === 'draft' || q.status === 'sent') && q.validUntil) {
            const [y, m, d] = q.validUntil.split('-').map(Number);
            if (new Date(y, m - 1, d) < today()) return 'expired';
        }
        return ST[q.status] ? q.status : 'draft';
    }
    function badge(s) { const v = ST[s] || ST.draft; return `<span class="orc-status orc-st-${s}"><i class="fas ${v[1]}"></i>${v[0]}</span>`; }

    /* ======================= LISTA ======================= */
    function shell() {
        const root = $('orcRoot');
        root.innerHTML = `
<div class="orc-stats">
  <div class="stat-card"><div class="stat-icon blue"><i class="fas fa-file-signature"></i></div><div class="stat-value" id="orcStOpen">0</div><div class="stat-label">Em aberto</div></div>
  <div class="stat-card"><div class="stat-icon purple"><i class="fas fa-coins"></i></div><div class="stat-value" id="orcStOpenVal">R$ 0,00</div><div class="stat-label">Valor em aberto</div></div>
  <div class="stat-card"><div class="stat-icon green"><i class="fas fa-thumbs-up"></i></div><div class="stat-value" id="orcStApproved">0</div><div class="stat-label">Aprovados</div></div>
  <div class="stat-card"><div class="stat-icon yellow"><i class="fas fa-cart-shopping"></i></div><div class="stat-value" id="orcStConv">0%</div><div class="stat-label">Viraram venda (90 dias)</div></div>
</div>
<div class="card" style="padding:14px 16px;margin-bottom:16px">
  <div class="orc-toolbar">
    <div class="search-box"><i class="fas fa-search"></i><input id="orcSearch" type="text" placeholder="Buscar por número, cliente, telefone ou produto..."></div>
    <select id="orcFilter" class="form-control"><option value="">Todos os status</option><option value="open">Em aberto</option><option value="draft">Rascunho</option><option value="sent">Enviado</option><option value="approved">Aprovado</option><option value="converted">Vendido</option><option value="rejected">Recusado</option><option value="expired">Vencido</option></select>
    <select id="orcPeriod" class="form-control"><option value="30">Últimos 30 dias</option><option value="90" selected>Últimos 90 dias</option><option value="365">Último ano</option><option value="0">Todo o período</option></select>
    <button class="btn btn-primary" id="orcNew"><i class="fas fa-plus"></i> Novo orçamento</button>
  </div>
</div>
<div class="card orc-list-card"><div class="orc-table-wrap"><table class="data-table orc-table"><thead><tr><th>Nº</th><th>Cliente</th><th>Data</th><th class="orc-c-items">Itens</th><th>Total</th><th>Status</th><th style="text-align:right">Ações</th></tr></thead><tbody id="orcTbody"><tr><td colspan="7" class="orc-empty"><i class="fas fa-spinner fa-spin"></i>Carregando...</td></tr></tbody></table></div></div>`;
        $('orcSearch').addEventListener('input', renderList);
        $('orcFilter').addEventListener('change', renderList);
        $('orcPeriod').addEventListener('change', renderList);
        $('orcNew').addEventListener('click', () => openEditor(null));
        $('orcTbody').addEventListener('click', onRowAction);
        // Menu "mais opções" fica no <body>: assim a tabela pode rolar sem cortar o menu
        const drop = document.createElement('div'); drop.className = 'orc-drop'; drop.id = 'orcDrop'; document.body.appendChild(drop);
        drop.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (!b) return; const q = quotes.find(x => x.id === drop.dataset.id); closeMenu(); if (q) runAction(b.dataset.act, q); });
        document.addEventListener('click', e => { if (!e.target.closest('#orcDrop') && !e.target.closest('[data-act="menu"]')) closeMenu(); });
        window.addEventListener('scroll', closeMenu, true); window.addEventListener('resize', closeMenu);
        editorShell();
    }

    function renderStats() {
        const open = quotes.filter(q => ['draft', 'sent', 'approved'].includes(effStatus(q)));
        $('orcStOpen').textContent = open.length;
        $('orcStOpenVal').textContent = money(open.reduce((s, q) => s + Number(q.total || 0), 0));
        $('orcStApproved').textContent = quotes.filter(q => effStatus(q) === 'approved').length;
        const since = Date.now() - 90 * 864e5;
        const recent = quotes.filter(q => (toDate(q.createdAt) || new Date()).getTime() >= since);
        const conv = recent.filter(q => q.status === 'converted').length;
        $('orcStConv').textContent = recent.length ? Math.round(conv / recent.length * 100) + '%' : '0%';
    }

    function renderList() {
        renderStats();
        const q = norm($('orcSearch')?.value), f = $('orcFilter')?.value || '', days = Number($('orcPeriod')?.value || 0);
        const since = days ? Date.now() - days * 864e5 : 0;
        let list = quotes.filter(x => x.deleted !== true);
        if (since) list = list.filter(x => (toDate(x.createdAt) || new Date()).getTime() >= since);
        if (f === 'open') list = list.filter(x => ['draft', 'sent', 'approved'].includes(effStatus(x)));
        else if (f) list = list.filter(x => effStatus(x) === f);
        if (q) list = list.filter(x => norm([label(x), x.quoteNumber, x.customerName, x.customerPhone, x.customerDoc, devOf(x).name, devOf(x).serial, ...(x.items || []).map(i => i.productName)].join(' ')).includes(q));
        const tb = $('orcTbody');
        if (!list.length) {
            tb.innerHTML = `<tr><td colspan="7" class="orc-empty"><i class="fas fa-file-signature"></i>${quotes.length ? 'Nenhum orçamento com esse filtro.' : 'Nenhum orçamento ainda.<br><small>Clique em <b>Novo orçamento</b> para montar o primeiro.</small>'}</td></tr>`;
            return;
        }
        tb.innerHTML = list.map(x => {
            const s = effStatus(x), n = (x.items || []).length;
            const canSell = !['converted', 'rejected'].includes(s) && canSellQuote();
            return `<tr data-id="${esc(x.id)}">
<td data-label="Nº"><span class="orc-num">${label(x)}</span></td>
<td class="orc-cli"><b>${esc(x.customerName || 'Cliente não informado')}</b><small>${esc([x.customerPhone, x.sellerName].filter(Boolean).join(' · '))}</small>${devOf(x).name ? `<small class="orc-dev-l"><i class="fas fa-mobile-screen"></i> ${esc(devOf(x).name)}${devOf(x).serial ? ' · ' + esc(devOf(x).serial) : ''}</small>` : ''}</td>
<td data-label="Data" class="orc-date">${fmtWhen(x.createdAt)}<small>${x.validUntil ? 'válido até ' + brDate(x.validUntil).slice(0, 5) : ''}</small></td>
<td data-label="Itens" class="orc-c-items">${n}</td>
<td data-label="Total"><span class="orc-total">${money(x.total)}</span></td>
<td data-label="Status">${badge(s)}${x.saleNumber ? `<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Venda #V-${String(x.saleNumber).padStart(4, '0')}</div>` : ''}</td>
<td class="orc-acts-cell"><div class="orc-acts">
 <button class="orc-act" data-act="edit" title="Abrir / editar"><i class="fas fa-pen"></i></button>
 <button class="orc-act" data-act="print" title="Imprimir ou salvar PDF"><i class="fas fa-print"></i></button>
 <button class="orc-act wa" data-act="wa" title="Enviar pelo WhatsApp"><i class="fab fa-whatsapp"></i></button>
 ${canSell ? `<button class="orc-act sell${s === 'approved' ? ' is-ready' : ''}" data-act="pdv" title="Faturar: abre no PDV com os itens, o cliente e o vendedor para finalizar a venda"><i class="fas fa-cash-register"></i><span>Faturar</span></button>` : ''}
 <button class="orc-act" data-act="menu" title="Mais opções"><i class="fas fa-ellipsis-vertical"></i></button>
</div></td></tr>`;
        }).join('');
    }

    function closeMenu() { const d = $('orcDrop'); if (d) { d.classList.remove('open'); d.dataset.id = ''; } }
    function openMenu(q, btn) {
        const d = $('orcDrop'); if (!d) return;
        if (d.classList.contains('open') && d.dataset.id === q.id) { closeMenu(); return; }
        const s = effStatus(q);
        d.innerHTML = (s !== 'converted' && s !== 'rejected' && canSellQuote() ? `<button data-act="pdv" class="orc-drop-main"><i class="fas fa-cash-register"></i> Faturar (levar ao PDV)</button><hr>` : '') + (s !== 'converted' ? `<button data-act="st-sent"><i class="fas fa-paper-plane"></i> Marcar como enviado</button><button data-act="st-approved"><i class="fas fa-thumbs-up"></i> Cliente aprovou</button><button data-act="st-rejected"><i class="fas fa-thumbs-down"></i> Cliente recusou</button><hr>` : '')
            + `<button data-act="print-cupom"><i class="fas fa-receipt"></i> Imprimir em cupom (80 mm)</button><button data-act="dup"><i class="fas fa-copy"></i> Duplicar orçamento</button><hr><button data-act="del" class="danger"><i class="fas fa-trash"></i> Excluir</button>`;
        d.dataset.id = q.id; d.classList.add('open');
        const r = btn.getBoundingClientRect(), w = d.offsetWidth, h = d.offsetHeight;
        const top = r.bottom + 6 + h > innerHeight ? Math.max(8, r.top - h - 6) : r.bottom + 6;
        d.style.top = top + 'px'; d.style.left = Math.max(8, Math.min(innerWidth - w - 8, r.right - w)) + 'px';
    }

    function onRowAction(e) {
        const b = e.target.closest('[data-act]'); if (!b) return;
        const tr = b.closest('tr[data-id]'); const q = quotes.find(x => x.id === tr?.dataset.id); if (!q) return;
        if (b.dataset.act === 'menu') { e.stopPropagation(); openMenu(q, b); return; }
        closeMenu(); runAction(b.dataset.act, q);
    }
    async function runAction(act, q) {
        if (act === 'edit') openEditor(q.id);
        else if (act === 'print') printQuote(q, 'a4');
        else if (act === 'print-cupom') printQuote(q, 'cupom');
        else if (act === 'wa') sendWhatsApp(q);
        else if (act === 'pdv') { if (!canSellQuote()) { toast('warning', 'Seu usuário não tem permissão para transformar orçamento em venda.'); return; } sendToPdv(q); }
        else if (act === 'dup') openEditor(null, q);
        else if (act.startsWith('st-')) setStatus(q, act.slice(3));
        else if (act === 'del') {
            const go = async () => { try { await db.collection(COL).doc(q.id).set({ deleted: true, deletedAt: ts(), updatedAt: ts() }, { merge: true }); toast('success', 'Orçamento excluído'); await reload(); } catch (err) { toast('error', 'Erro ao excluir: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); } };
            if (window.Confirm && Confirm.show) Confirm.show('Excluir orçamento', `Excluir o orçamento <strong>Nº ${label(q)}</strong>?`, go); else if (confirm('Excluir orçamento?')) go();
        }
    }

    async function setStatus(q, s) {
        try {
            await db.collection(COL).doc(q.id).set({ status: s, updatedAt: ts(), [s + 'At']: ts() }, { merge: true });
            q.status = s; renderList();
            toast('success', 'Orçamento marcado como ' + ST[s][0].toLowerCase());
            // 37.1 · Aprovou: pergunta se já quer faturar (abre no PDV com tudo preenchido)
            if (s === 'approved' && canSellQuote()) {
                const go = () => sendToPdv(q);
                const msg = `O orçamento <strong>Nº ${label(q)}</strong> foi aprovado.<br>Quer <b>faturar agora</b>? Ele abre no PDV com os itens, o cliente e o vendedor; é só escolher a forma de pagamento e finalizar.`;
                if (window.Confirm && Confirm.show) Confirm.show('Faturar orçamento', msg, go); else if (confirm('Orçamento aprovado. Faturar agora no PDV?')) go();
            }
        } catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    }

    /* ======================= EDITOR ======================= */
    function editorShell() {
        if ($('orcModal')) return;
        const m = document.createElement('div');
        m.className = 'modal-overlay'; m.id = 'orcModal';
        m.innerHTML = `<div class="modal orc-modal">
<div class="modal-header"><div><h3 id="orcTitle"><i class="fas fa-file-signature" style="color:var(--accent);margin-right:8px"></i>Novo orçamento</h3><p style="margin:4px 0 0;font-size:12px;color:var(--text-muted)">Monte o orçamento, imprima ou mande no WhatsApp. Quando o cliente aprovar, é só levar para o PDV.</p></div><button class="modal-close" id="orcClose"><i class="fas fa-times"></i></button></div>
<div class="modal-body">
 <section class="orc-sec"><div class="orc-sec-t"><span class="ic"><i class="fas fa-user"></i></span><div><strong>Cliente</strong><small>Escolha um cliente cadastrado ou digite o nome de um cliente avulso</small></div></div>
  <div id="orcCustBox"></div></section>
 <details class="orc-sec orc-dev" id="orcDevSec"><summary class="orc-sec-t"><span class="ic"><i class="fas fa-mobile-screen"></i></span><div><strong id="orcDevTitle">Aparelho / equipamento</strong><small>Para qual aparelho é este orçamento (assistência técnica, conserto, instalação). Opcional</small></div></summary>
  <div class="orc-g orc-g2" style="margin-top:10px">
   <div class="form-group"><label class="form-label" id="orcDevNameL">Aparelho (tipo, marca e modelo)</label><input id="orcDevName" class="form-control" maxlength="120" placeholder="Ex.: Celular Samsung Galaxy A15"></div>
   <div class="form-group"><label class="form-label" id="orcDevIdL">IMEI / número de série</label><input id="orcDevId" class="form-control" maxlength="60" placeholder="Opcional"></div>
   <div class="form-group orc-full"><label class="form-label">Defeito relatado pelo cliente</label><input id="orcDevProblem" class="form-control" maxlength="300" placeholder="Ex.: Tela quebrada, não carrega"></div>
  </div></details>
 <section class="orc-sec"><div class="orc-sec-t"><span class="ic"><i class="fas fa-list"></i></span><div><strong>Itens do orçamento</strong><small>Busque pelo nome, código ou código de barras. Para mão de obra ou item fora do estoque, use "Item avulso / serviço"</small></div></div>
  <div class="orc-add-row"><div class="orc-search"><input type="text" class="form-control" id="orcProdQ" placeholder="Buscar produto para adicionar..." autocomplete="off"><div class="orc-results" id="orcProdRes"></div></div>
  <button type="button" class="btn btn-outline" id="orcAddFree"><i class="fas fa-plus"></i> Item avulso / serviço</button></div>
  <div style="overflow-x:auto"><table class="orc-items"><thead><tr><th class="c-desc">Descrição</th><th class="c-qty">Qtd</th><th class="c-un">Un</th><th class="c-pr">Valor unit.</th><th class="c-ds">Desconto R$</th><th class="c-tt" style="text-align:right">Total</th><th class="c-x"></th></tr></thead><tbody id="orcItems"></tbody></table></div></section>
 <section class="orc-sec"><div class="orc-sec-t"><span class="ic"><i class="fas fa-handshake"></i></span><div><strong>Condições e totais</strong><small>Aparecem no orçamento impresso e na mensagem do WhatsApp</small></div></div>
  <div class="orc-sum"><div class="orc-g orc-g2">
   <div class="form-group"><label class="form-label">Validade do orçamento</label><input type="date" id="orcValid" class="form-control"></div>
   <div class="form-group"><label class="form-label">Prazo de entrega / execução</label><input id="orcDeliveryTime" class="form-control" placeholder="Ex.: 5 dias úteis após aprovação"></div>
   <div class="form-group"><label class="form-label">Vendedor responsável</label><select id="orcSeller" class="form-control"></select></div>
   <div class="form-group"><label class="form-label">Forma de pagamento</label><select id="orcPayMethod" class="form-control"></select></div>
   <div class="form-group orc-full"><label class="form-label">Detalhes do pagamento <small style="color:var(--text-muted)">(opcional)</small></label><input id="orcPayTerms" class="form-control" placeholder="Ex.: 5% de desconto à vista ou cartão em até 3x"></div>
   <div class="form-group orc-full"><label class="form-label">Observações para o cliente</label><textarea id="orcNotes" class="form-control" rows="2" placeholder="Ex.: Material sujeito à disponibilidade de estoque. Instalação inclusa."></textarea></div>
   <div class="form-group orc-full"><label class="form-label">Anotações internas <small style="color:var(--text-muted)">(não aparecem para o cliente)</small></label><textarea id="orcInternal" class="form-control" rows="2" placeholder="Ex.: Cliente pediu para ligar sexta-feira"></textarea></div>
  </div>
  <div class="orc-sum-box">
   <div class="orc-sum-row"><span>Subtotal</span><b id="orcSub">R$ 0,00</b></div>
   <div class="orc-sum-row"><span>Desconto</span><span class="pair"><input id="orcDiscPct" class="form-control pct" inputmode="decimal" placeholder="%"><input id="orcDisc" class="form-control" inputmode="decimal" placeholder="0,00"></span></div>
   <div class="orc-sum-row"><span>Frete / deslocamento</span><input id="orcFee" class="form-control" inputmode="decimal" placeholder="0,00"></div>
   <div class="orc-sum-total"><span>Total</span><b id="orcTotal">R$ 0,00</b></div>
  </div></div></section>
</div>
<div class="modal-footer orc-foot"><div class="orc-foot-total"><span>Total do orçamento</span><strong id="orcFootTotal">R$ 0,00</strong></div>
 <div class="orc-foot-acts"><button class="btn btn-secondary" id="orcSave"><i class="fas fa-floppy-disk"></i> Salvar</button><button class="btn btn-primary" id="orcSavePrint"><i class="fas fa-print"></i> Salvar e imprimir</button><button class="btn btn-wa" id="orcSaveWa"><i class="fab fa-whatsapp"></i> Salvar e enviar</button><button class="btn btn-success orc-bill-btn" id="orcSaveBill" title="Salva e abre no PDV para finalizar a venda"><i class="fas fa-cash-register"></i> Salvar e faturar</button></div></div>
</div>`;
        document.body.appendChild(m);
        $('orcClose').onclick = closeEditor;
        $('orcSave').onclick = () => saveQuote('none');
        $('orcSavePrint').onclick = () => saveQuote('print');
        $('orcSaveWa').onclick = () => saveQuote('wa');
        $('orcSaveBill').onclick = () => { if (!canSellQuote()) { toast('warning', 'Seu usuário não tem permissão para transformar orçamento em venda.'); return; } saveQuote('pdv'); };
        $('orcAddFree').onclick = () => { editing.items.push({ productId: '', productName: '', productCode: '', unit: 'serv', quantity: 1, unitPrice: 0, costPrice: 0, discount: 0, total: 0, isService: true }); renderItems(true); };
        const pq = $('orcProdQ');
        pq.addEventListener('input', () => productResults(pq.value));
        pq.addEventListener('focus', () => { if (pq.value) productResults(pq.value); });
        pq.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); const first = $('orcProdRes').querySelector('.orc-res'); if (first) first.click(); }
            if (e.key === 'Escape') $('orcProdRes').classList.remove('open');
        });
        $('orcProdRes').addEventListener('click', e => { const r = e.target.closest('.orc-res[data-id]'); if (r) addProduct(r.dataset.id); });
        document.addEventListener('click', e => { if (!e.target.closest('.orc-search')) document.querySelectorAll('.orc-results.open').forEach(x => x.classList.remove('open')); });
        $('orcItems').addEventListener('input', onItemInput);
        $('orcItems').addEventListener('change', onItemInput);
        $('orcItems').addEventListener('click', e => { const x = e.target.closest('[data-del]'); if (x) { editing.items.splice(Number(x.dataset.del), 1); renderItems(); } });
        $('orcDisc').addEventListener('input', () => { editing.discount = parseMoney($('orcDisc').value); editing.discountPct = ''; $('orcDiscPct').value = ''; recalc(); });
        $('orcDiscPct').addEventListener('input', () => { editing.discountPct = $('orcDiscPct').value; recalc(true); });
        $('orcFee').addEventListener('input', () => { editing.deliveryFee = parseMoney($('orcFee').value); recalc(); });
    }

    function openEditor(id, cloneFrom) {
        const src = id ? quotes.find(q => q.id === id) : cloneFrom;
        editing = src ? JSON.parse(JSON.stringify({
            customerId: src.customerId || '', customerName: src.customerName || '', customerPhone: src.customerPhone || '', customerDoc: src.customerDoc || '', customerAddress: src.customerAddress || '',
            items: src.items || [], discount: src.discount || 0, deliveryFee: src.deliveryFee || 0, validUntil: src.validUntil || addDays(defaultValidity()),
            paymentTerms: src.paymentTerms || '', deliveryTime: src.deliveryTime || '', notes: src.notes || '', internalNotes: src.internalNotes || '', status: src.status || 'draft',
            sellerId: src.sellerId || '', sellerName: src.sellerName || '', paymentMethod: src.paymentMethod || '', paymentDetails: src.paymentDetails != null ? src.paymentDetails : (src.paymentMethod ? '' : (src.paymentTerms || '')),
            device: devOf(src)
        })) : { customerId: '', customerName: '', customerPhone: '', customerDoc: '', customerAddress: '', items: [], discount: 0, deliveryFee: 0, validUntil: addDays(defaultValidity()), paymentTerms: '', deliveryTime: '', notes: '', internalNotes: '', status: 'draft', sellerId: '', sellerName: '', paymentMethod: '', paymentDetails: '', device: devOf(null) };
        editing.id = id || null;
        if (!editing.sellerId) { editing.sellerId = (auth.currentUser && auth.currentUser.uid) || ''; editing.sellerName = me().name || ''; }
        fillSellerAndPay();
        if (!id && cloneFrom) { editing.status = 'draft'; editing.validUntil = addDays(defaultValidity()); }
        const locked = id && src && src.status === 'converted';
        $('orcTitle').innerHTML = `<i class="fas fa-file-signature" style="color:var(--accent);margin-right:8px"></i>${id ? 'Orçamento Nº ' + label(src) : (cloneFrom ? 'Cópia do orçamento Nº ' + label(cloneFrom) : 'Novo orçamento')}${locked ? ' <span class="orc-status orc-st-converted" style="margin-left:8px"><i class="fas fa-cart-shopping"></i>Vendido</span>' : ''}`;
        $('orcValid').value = editing.validUntil;
        $('orcDeliveryTime').value = editing.deliveryTime;
        $('orcPayTerms').value = editing.paymentDetails || '';
        $('orcNotes').value = editing.notes;
        $('orcInternal').value = editing.internalNotes;
        $('orcDisc').value = editing.discount ? num2(editing.discount) : '';
        $('orcDiscPct').value = '';
        $('orcFee').value = editing.deliveryFee ? num2(editing.deliveryFee) : '';
        $('orcProdQ').value = '';
        // 39.5 · Aparelho do orçamento: aberto quando já tem algo ou o ramo é de conserto (celular, oficina, serviços)
        const dv = editing.device, veh = isVehMode();
        $('orcDevName').value = dv.name; $('orcDevId').value = dv.serial; $('orcDevProblem').value = dv.problem;
        $('orcDevTitle').textContent = veh ? 'Veículo' : 'Aparelho / equipamento';
        $('orcDevNameL').textContent = veh ? 'Veículo (marca, modelo e ano)' : 'Aparelho (tipo, marca e modelo)';
        $('orcDevIdL').textContent = veh ? 'Placa' : 'IMEI / número de série';
        $('orcDevName').placeholder = veh ? 'Ex.: Fiat Uno 2015' : 'Ex.: Celular Samsung Galaxy A15';
        $('orcDevSec').open = !!(dv.name || dv.serial || dv.problem) || devSegment();
        renderCustomer(); renderItems();
        $('orcModal').classList.add('active');
    }
    function closeEditor() { $('orcModal').classList.remove('active'); editing = null; }
    function fillSellerAndPay() {
        const ss = $('orcSeller'), ps = $('orcPayMethod'); if (!ss || !ps) return;
        const list = sellers.slice();
        if (editing.sellerId && !list.some(u => u.id === editing.sellerId)) list.unshift({ id: editing.sellerId, name: editing.sellerName || 'Vendedor' });
        ss.innerHTML = list.map(u => `<option value="${esc(u.id)}">${esc(u.name || u.nome || u.email || 'Usuário')}</option>`).join('') || '<option value="">—</option>';
        ss.value = editing.sellerId || '';
        const keys = payActive.filter(k => PAY_LABEL[k]);
        if (editing.paymentMethod && !keys.includes(editing.paymentMethod) && PAY_LABEL[editing.paymentMethod]) keys.push(editing.paymentMethod);
        ps.innerHTML = '<option value="">A combinar</option>' + keys.map(k => `<option value="${k}">${PAY_LABEL[k]}</option>`).join('') + (keys.includes('multi') ? '' : `<option value="multi">${PAY_LABEL.multi}</option>`);
        ps.value = editing.paymentMethod || '';
    }
    // "Salvar e imprimir": escolhe cupom térmico ou folha A4 (lembra a última escolha)
    function choosePrint() {
        return new Promise(resolve => {
            let last = 'a4'; try { last = localStorage.getItem('dp_quote_print') || 'a4'; } catch (e) { }
            const ov = document.createElement('div'); ov.className = 'modal-overlay active'; ov.style.zIndex = 4000;
            ov.innerHTML = `<div class="modal" style="max-width:420px"><div class="modal-header"><h3><i class="fas fa-print" style="color:var(--accent);margin-right:8px"></i>Imprimir orçamento</h3><button class="modal-close" type="button" data-f=""><i class="fas fa-times"></i></button></div>
              <div class="modal-body"><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
                <button type="button" class="btn ${last === 'cupom' ? 'btn-primary' : 'btn-outline'}" data-f="cupom" style="padding:16px 8px;flex-direction:column;height:auto"><i class="fas fa-receipt" style="font-size:22px;display:block;margin-bottom:6px"></i>Cupom térmico<br><small>80 mm</small></button>
                <button type="button" class="btn ${last === 'a4' ? 'btn-primary' : 'btn-outline'}" data-f="a4" style="padding:16px 8px;flex-direction:column;height:auto"><i class="fas fa-file-lines" style="font-size:22px;display:block;margin-bottom:6px"></i>Folha A4<br><small>impressora comum / PDF</small></button>
              </div></div></div>`;
            document.body.appendChild(ov);
            ov.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (!b && e.target !== ov) return; const f = b ? b.dataset.f : ''; ov.remove(); if (f) { try { localStorage.setItem('dp_quote_print', f); } catch (er) { } } resolve(f || null); });
        });
    }
    function defaultValidity() { try { return Number(localStorage.getItem('dp_quote_validity') || 7) || 7; } catch (e) { return 7; } }

    // Cliente
    function renderCustomer() {
        const box = $('orcCustBox');
        if (atacado().length) recalc(); // 38.1 · cliente de atacado / com desconto
        if (editing.customerId || editing.customerName) {
            const initial = (editing.customerName || '?').trim().charAt(0).toUpperCase();
            box.innerHTML = `<div class="orc-chip"><span class="av">${esc(initial)}</span><div><b>${esc(editing.customerName)}</b><small>${esc([editing.customerPhone, editing.customerDoc, editing.customerId ? '' : 'Cliente avulso (não cadastrado)'].filter(Boolean).join(' · '))}</small></div><button type="button" class="btn btn-outline btn-sm" id="orcCustChange"><i class="fas fa-rotate"></i> Trocar</button></div>
            <div class="form-group" style="margin-top:10px"><label class="form-label">Endereço no orçamento</label><input id="orcCustAddr" class="form-control" value="${esc(editing.customerAddress)}" placeholder="Rua, número, bairro, cidade/UF" maxlength="240"></div>
            ${editing.customerId ? '' : `<div class="orc-g orc-g2" style="margin-top:10px"><div class="form-group"><label class="form-label">Telefone / WhatsApp</label><input id="orcCustPhone" class="form-control" inputmode="tel" value="${esc(editing.customerPhone)}" placeholder="(00) 00000-0000"></div><div class="form-group"><label class="form-label">CPF / CNPJ</label><input id="orcCustDoc" class="form-control" value="${esc(editing.customerDoc)}"></div></div>`}`;
            $('orcCustChange').onclick = () => { editing.customerId = ''; editing.customerName = ''; editing.customerPhone = ''; editing.customerDoc = ''; editing.customerAddress = ''; renderCustomer(); setTimeout(() => $('orcCustQ')?.focus(), 30); };
            $('orcCustPhone')?.addEventListener('input', e => { editing.customerPhone = e.target.value; });
            $('orcCustDoc')?.addEventListener('input', e => { editing.customerDoc = e.target.value; });
            $('orcCustAddr')?.addEventListener('input', e => { editing.customerAddress = e.target.value; });
            return;
        }
        box.innerHTML = `<div class="orc-search"><input type="text" class="form-control" id="orcCustQ" placeholder="Buscar cliente por nome, telefone ou CPF/CNPJ..." autocomplete="off"><div class="orc-results" id="orcCustRes"></div></div>`;
        const q = $('orcCustQ'), res = $('orcCustRes');
        const draw = () => {
            const t = norm(q.value), digits = q.value.replace(/\D/g, '');
            let list = customers;
            if (t) list = customers.filter(c => norm([c.name, c.nome, c.document, c.cpf, c.cnpj].join(' ')).includes(t) || (digits.length >= 3 && String(c.phone || c.whatsapp || c.celular || '').replace(/\D/g, '').includes(digits)));
            list = list.slice(0, 30);
            res.innerHTML = list.map(c => `<div class="orc-res" data-cid="${esc(c.id)}"><span class="em"><i class="fas fa-user"></i></span><span class="tx"><b>${esc(c.name || c.nome || 'Cliente')}</b><small>${esc([c.phone || c.whatsapp || c.celular, c.document || c.cpf || c.cnpj, c.city].filter(Boolean).join(' · '))}</small></span></div>`).join('')
                + (q.value.trim() ? `<div class="orc-res" data-free="1"><span class="em"><i class="fas fa-user-pen"></i></span><span class="tx"><b>Usar "${esc(q.value.trim())}" como cliente avulso</b><small>Sem cadastro — informe o telefone em seguida</small></span></div>` : '')
                + (!list.length && !q.value.trim() ? '<div class="orc-res-empty">Nenhum cliente cadastrado ainda.</div>' : '');
            res.classList.add('open');
        };
        q.addEventListener('input', draw); q.addEventListener('focus', draw);
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); res.querySelector('.orc-res')?.click(); } });
        res.addEventListener('click', e => {
            const r = e.target.closest('.orc-res'); if (!r) return;
            if (r.dataset.free) { editing.customerId = ''; editing.customerName = q.value.trim(); }
            else {
                const c = customers.find(x => x.id === r.dataset.cid); if (!c) return;
                applyCustomer(c);
            }
            renderCustomer();
        });
    }
    /* 39.0 · Endereço completo do cadastro: rua, número, complemento + bairro + cidade/UF (sem repetir) */
    const fullAddr = ((x) => { const st = x.street ? [x.street, x.number, x.complement].filter(Boolean).join(', ') : (x.address || ''); const low = String(st).toLowerCase(); const nb = x.neighborhood || x.bairro || '', cy = x.city || x.cidade || '', uf = x.state || x.uf || ''; return [st, nb && !low.includes(String(nb).toLowerCase()) ? nb : '', cy && !low.includes(String(cy).toLowerCase()) ? cy + (uf ? '/' + uf : '') : ''].filter(Boolean).join(', '); });
    function applyCustomer(c) {
        editing.customerId = c.id; editing.customerName = c.name || c.nome || 'Cliente';
        editing.customerPhone = c.whatsapp || c.phone || c.celular || c.telefone || '';
        editing.customerDoc = c.document || c.cpf || c.cnpj || '';
        editing.customerAddress = fullAddr(c); /* 39.0 · com bairro e cidade (antes só rua e número) */
    }

    // Produtos
    function productResults(text) {
        const res = $('orcProdRes'), t = norm(text).trim();
        if (!t) { res.classList.remove('open'); return; }
        const exact = products.filter(p => norm(p.barcode) === t || norm(p.code) === t);
        const DI = window.DPItens; // 38.2 · aplicação e referência da peça (itens-cliente-v1.js)
        const list = (exact.length ? exact : products.filter(p => norm([p.name, p.code, p.barcode, p.brand, p.category].join(' ')).includes(t) || !!(DI && DI.prodMatch(p, t)))).filter(p => !p.isGradeParent).slice(0, 40); // 38.6 · grade: escolhe o tamanho/cor, não o pai
        res.innerHTML = list.length ? list.map(p => {
            const u = unitOf(p.unit), svc = p.productType === 'service' || p.controlStock === false;
            const stock = svc ? 'Serviço' : `Estoque: ${fmtQty(p.currentStock || 0, u.value)} ${u.abbr}`;
            return `<div class="orc-res" data-id="${esc(p.id)}"><span class="em">${window.dpProductGlyph ? dpProductGlyph(p.imageType === 'icon' || !p.imageType ? p.icon : '') : (p.imageType === 'icon' || !p.imageType ? esc(p.icon || '📦') : '📦')}</span><span class="tx"><b>${esc(p.name)}</b><small>${esc([p.code, p.brand, stock].filter(Boolean).join(' · '))}</small>${DI && DI.prodInfo(p) ? `<small>${DI.prodInfo(p)}</small>` : ''}</span><span class="pr">${money(p.promoPrice > 0 ? p.promoPrice : p.salePrice)}<small style="display:block;font-size:10px;color:var(--text-muted);font-weight:600;text-align:right">por ${esc(u.abbr)}</small></span></div>`;
        }).join('') : `<div class="orc-res-empty">Nenhum produto encontrado. Use <b>Item avulso / serviço</b> para incluir algo fora do cadastro.</div>`;
        res.classList.add('open');
    }
    function addProduct(id) {
        const p = products.find(x => x.id === id); if (!p) return;
        const price = r2(p.promoPrice > 0 ? p.promoPrice : p.salePrice);
        const same = editing.items.find(i => i.productId === p.id && (Number(i.unitPrice) === price || i._dpRule)); // 38.1 · linha com preço de atacado também soma
        if (same) { same.quantity = Math.round((Number(same.quantity) + 1) * 1000) / 1000; same.total = r2(same.quantity * same.unitPrice - (same.discount || 0)); }
        else editing.items.push({ productId: p.id, productName: p.name, productCode: p.code || p.barcode || '', unit: C ? C.norm(p.unit || 'un') : (p.unit || 'un'), quantity: 1, unitPrice: price, costPrice: Number(p.costPrice || 0), discount: 0, total: price, icon: p.icon || '', isService: p.productType === 'service' || p.controlStock === false });
        $('orcProdQ').value = ''; $('orcProdRes').classList.remove('open');
        renderItems();
        const rows = $('orcItems').querySelectorAll('tr'); const last = same ? null : rows[rows.length - 1];
        if (last && C && C.isFrac(p.unit)) setTimeout(() => { const qi = last.querySelector('[data-f="quantity"]'); qi?.focus(); qi?.select(); }, 30);
        else $('orcProdQ').focus();
    }

    function unitSelect(cur, i) {
        const opts = C ? C.selectOptionsHtml(cur) : `<option value="un">UN</option>`;
        return `<select class="form-control" data-i="${i}" data-f="unit">${opts}</select>`;
    }
    function renderItems(focusLast) {
        const tb = $('orcItems');
        if (!editing.items.length) { tb.innerHTML = `<tr><td colspan="7" class="orc-noitems"><i class="fas fa-box-open" style="font-size:22px;opacity:.4;display:block;margin-bottom:6px"></i>Nenhum item ainda. Busque um produto acima ou adicione um item avulso.</td></tr>`; recalc(); return; }
        tb.innerHTML = editing.items.map((it, i) => {
            const u = unitOf(it.unit);
            const desc = (it.productId
                ? `<div class="orc-it-name"><b>${esc(it.icon ? it.icon + ' ' : '')}${esc(it.productName)}</b><small>${esc(it.productCode || '')}${it.isService ? ' · serviço' : ''}</small></div>`
                : `<input class="form-control" data-i="${i}" data-f="productName" value="${esc(it.productName)}" placeholder="Descreva o item ou serviço (ex.: Mão de obra instalação)">`)
                + `<input class="form-control" data-i="${i}" data-f="notes" value="${esc(it.notes || '')}" placeholder="Nº de série / IMEI / observação do item" style="margin-top:4px;font-size:12px;padding:5px 8px;height:auto">`;
            return `<tr>
<td class="c-desc">${desc}</td>
<td class="c-qty" data-label="Qtd"><input class="form-control num" data-i="${i}" data-f="quantity" inputmode="decimal" value="${esc(fmtQty(it.quantity, u.value))}"></td>
<td class="c-un" data-label="Un">${it.productId ? `<span class="un-tag">${esc(u.abbr)}</span>` : unitSelect(it.unit, i)}</td>
<td class="c-pr" data-label="Valor unit."><input class="form-control num" data-i="${i}" data-f="unitPrice" inputmode="decimal" value="${num2(it.unitPrice)}"></td>
<td class="c-ds" data-label="Desconto R$"><input class="form-control num" data-i="${i}" data-f="discount" inputmode="decimal" value="${it.discount ? num2(it.discount) : ''}" placeholder="0,00"></td>
<td class="c-tt" data-label="Total" id="orcLine${i}">${money(it.total)}</td>
<td class="c-x"><button type="button" class="orc-x" data-del="${i}" title="Remover"><i class="fas fa-trash"></i></button></td></tr>`;
        }).join('');
        recalc();
        if (focusLast) { const rows = tb.querySelectorAll('tr'); rows[rows.length - 1]?.querySelector('input')?.focus(); }
    }
    function onItemInput(e) {
        const el = e.target.closest('[data-f]'); if (!el) return;
        const it = editing.items[Number(el.dataset.i)]; if (!it) return;
        const f = el.dataset.f;
        if (f === 'notes') { it.notes = el.value; return; }
        if (f === 'productName') it.productName = el.value;
        else if (f === 'unit') it.unit = el.value;
        else if (f === 'quantity') it.quantity = Math.round(parseQty(el.value) * 1000) / 1000;
        else if (f === 'unitPrice') it.unitPrice = r2(parseMoney(el.value));
        else if (f === 'discount') it.discount = r2(parseMoney(el.value));
        it.total = r2(Number(it.quantity || 0) * Number(it.unitPrice || 0) - Number(it.discount || 0));
        const cell = $('orcLine' + el.dataset.i); if (cell) cell.textContent = money(it.total);
        recalc();
    }
    function totals(q) {
        const subtotal = r2((q.items || []).reduce((s, i) => s + Number(i.total || 0), 0));
        const discount = r2(q.discount || 0), fee = r2(q.deliveryFee || 0);
        return { subtotal, discount, fee, total: r2(Math.max(0, subtotal - discount + fee)) };
    }
    // 38.1 · Preço por quantidade e tabela do cliente (preco-atacado-v1.js): atualiza o valor dos itens automáticos
    function atacado() {
        if (!editing || !window.DPAtacado) return [];
        const ch = DPAtacado.applyLines(editing.items, { kind: 'quote', products, customer: customers.find(c => c.id === editing.customerId) || null });
        ch.forEach(i => { const it = editing.items[i], pr = document.querySelector(`#orcItems [data-i="${i}"][data-f="unitPrice"]`), cell = $('orcLine' + i); if (pr && document.activeElement !== pr) pr.value = num2(it.unitPrice); if (cell) cell.textContent = money(it.total); });
        return ch;
    }
    function recalc(fromPct) {
        if (!editing) return;
        atacado();
        const sub = r2(editing.items.reduce((s, i) => s + Number(i.total || 0), 0));
        if (fromPct) { const p = parseQty(editing.discountPct); editing.discount = r2(sub * p / 100); $('orcDisc').value = editing.discount ? num2(editing.discount) : ''; }
        const t = totals(editing);
        $('orcSub').textContent = money(t.subtotal);
        $('orcTotal').textContent = money(t.total);
        $('orcFootTotal').textContent = money(t.total);
    }

    async function nextNumber() {
        const ref = db.collection('settings').doc('general');
        let seq = 0;
        try { const s = await ref.get(); seq = Number((s.exists && s.data().quoteNumberSequence) || 0); } catch (e) { }
        const maxExisting = quotes.reduce((m, q) => Math.max(m, Number(q.quoteNumber || 0)), 0);
        const n = Math.max(seq, maxExisting) + 1;
        try { await ref.set({ quoteNumberSequence: n }, { merge: true }); } catch (e) { }
        return n;
    }

    async function saveQuote(after) {
        if (!editing) return;
        editing.validUntil = $('orcValid').value || addDays(defaultValidity());
        editing.deliveryTime = $('orcDeliveryTime').value.trim();
        editing.paymentDetails = $('orcPayTerms').value.trim();
        editing.paymentMethod = ($('orcPayMethod') && $('orcPayMethod').value) || '';
        editing.paymentTerms = [editing.paymentMethod ? PAY_LABEL[editing.paymentMethod] : '', editing.paymentDetails].filter(Boolean).join(' · ');
        const sSel = $('orcSeller'); if (sSel && sSel.value) { editing.sellerId = sSel.value; editing.sellerName = (sSel.selectedOptions[0] && sSel.selectedOptions[0].textContent) || editing.sellerName; }
        editing.notes = $('orcNotes').value.trim();
        editing.internalNotes = $('orcInternal').value.trim();
        editing.device = { name: $('orcDevName').value.trim(), serial: $('orcDevId').value.trim(), problem: $('orcDevProblem').value.trim() };
        if (!editing.customerName.trim()) { toast('warning', 'Informe o cliente do orçamento'); $('orcCustQ')?.focus(); return; }
        const items = editing.items.filter(i => (i.productName || '').trim() && Number(i.quantity) > 0);
        if (!items.length) { toast('warning', 'Adicione pelo menos um item com quantidade'); return; }
        if (items.some(i => !(Number(i.unitPrice) > 0))) { toast('warning', 'Há item sem valor. Confira o valor unitário.'); return; }
        const t = totals({ ...editing, items });
        const user = (() => { try { return currentUser || {}; } catch (e) { return {}; } })();
        const data = {
            customerId: editing.customerId || '', customerName: editing.customerName.trim(), customerPhone: (editing.customerPhone || '').trim(),
            customerDoc: (editing.customerDoc || '').trim(), customerAddress: editing.customerAddress || '',
            items: items.map(i => ({ productId: i.productId || '', productName: i.productName.trim(), productCode: i.productCode || '', unit: i.unit || 'un', quantity: Number(i.quantity), unitPrice: r2(i.unitPrice), costPrice: Number(i.costPrice || 0), discount: r2(i.discount || 0), total: r2(i.total), isService: !!i.isService, icon: i.icon || '', notes: (i.notes || '').trim() })),
            subtotal: t.subtotal, discount: t.discount, deliveryFee: t.fee, total: t.total,
            validUntil: editing.validUntil, paymentTerms: editing.paymentTerms, paymentMethod: editing.paymentMethod, paymentDetails: editing.paymentDetails, deliveryTime: editing.deliveryTime, notes: editing.notes, internalNotes: editing.internalNotes,
            device: editing.device, // 39.5 · {name, serial, problem}
            sellerId: editing.sellerId || (auth.currentUser && auth.currentUser.uid) || '', sellerName: editing.sellerName || user.name || '',
            updatedAt: ts()
        };
        const btns = ['orcSave', 'orcSavePrint', 'orcSaveWa'].map($); btns.forEach(b => b && (b.disabled = true));
        try {
            let id = editing.id;
            if (id) {
                await db.collection(COL).doc(id).set(data, { merge: true });
            } else {
                data.quoteNumber = await nextNumber();
                data.status = 'draft';
                if (!data.sellerId) data.sellerId = auth.currentUser?.uid || '';
                if (!data.sellerName) data.sellerName = user.name || auth.currentUser?.displayName || auth.currentUser?.email || '';
                data.createdBy = auth.currentUser?.uid || ''; data.createdByName = user.name || '';
                data.createdAt = ts(); data.deleted = false;
                const ref = await db.collection(COL).add(data);
                id = ref.id;
            }
            toast('success', 'Orçamento salvo');
            closeEditor();
            await reload();
            const saved = quotes.find(q => q.id === id);
            if (saved && after === 'print') { const f = await choosePrint(); if (f) printQuote(saved, f); }
            if (saved && after === 'wa') sendWhatsApp(saved);
            if (saved && after === 'pdv') sendToPdv(saved);
        } catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        finally { btns.forEach(b => b && (b.disabled = false)); }
    }

    /* ======================= SAÍDAS ======================= */
    async function company() {
        const c = { name: 'Minha Empresa', legalName: '', cnpj: '', phone: '', whatsapp: '', email: '', address: '', logoUrl: '' };
        try {
            const snap = await db.collection('settings').doc('general').get(); const d = snap.exists ? (snap.data() || {}) : {};
            const isDemo = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
            const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
            c.name = isDemo ? (brand.companyName || d.nomeFantasia || d.razaoSocial || 'DistribuiPRO') : (d.nomeFantasia || brand.companyName || d.razaoSocial || 'Minha Empresa');
            c.legalName = d.razaoSocial || ''; c.cnpj = d.cnpj || ''; c.phone = d.telefone || ''; c.whatsapp = d.whatsapp || ''; c.email = d.email || '';
            const rua = [d.logradouro, d.numero].filter(Boolean).join(', '); const cidadeUf = [d.cidade, d.uf].filter(Boolean).join(' - ');
            c.address = [rua, [d.bairro, cidadeUf, d.cep ? 'CEP ' + d.cep : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
            c.logoUrl = isDemo ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || '');
            c.photos = d.orcamentoFotos === true; // 36.7 · Configurações › Vendas: foto do produto no orçamento A4
        } catch (e) { }
        return c;
    }
    // Foto do produto (cadastro: link ou arquivo enviado) com endereço absoluto, porque a janela de impressão não tem base
    function itemPhoto(i) {
        const p = (products || []).find(x => x.id === i.productId); if (!p) return '';
        const src = p.imageType === 'url' ? p.imageUrl : p.imageType === 'file' ? p.imageFile : '';
        if (!src) return '';
        try { return new URL(src, location.href).href; } catch (e) { return src; }
    }

    async function printQuote(q, mode) {
        const co = await company();
        try { const cu = q.customerId ? customers.find(x => x.id === q.customerId) : null; const fa = cu ? fullAddr(cu) : '', sv = String(q.customerAddress || '').trim(); if (fa && fa.length > sv.length && fa.toLowerCase().startsWith(sv.toLowerCase())) q = Object.assign({}, q, { customerAddress: fa }); } catch (e) { }
        const t = totals(q);
        const s = effStatus(q);
        const w = window.open('', '_blank', mode === 'cupom' ? 'width=430,height=900' : 'width=900,height=1000');
        if (!w) { toast('warning', 'Libere as janelas pop-up para imprimir'); return; }
        const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp, co.email].filter(Boolean).map(esc).join(' · ');
        const items = q.items || [];
        let html;
        if (mode === 'cupom') {
            html = `<!doctype html><html><head><meta charset="utf-8"><title>Orçamento ${label(q)}</title><style>@page{size:80mm auto;margin:2mm}*{box-sizing:border-box}body{width:72mm;margin:0 auto;padding:2mm;font-family:"Courier New",monospace;font-size:10.5px;color:#000;font-weight:700}.c{text-align:center}.sep{border-top:1px dashed #000;margin:2mm 0}.row{display:flex;justify-content:space-between;gap:2mm}.it{margin:1.2mm 0}.tot{font-size:14px;border-top:1px dashed #000;border-bottom:1px dashed #000;padding:1.4mm 0;margin-top:1mm}.sm{font-size:9px;font-weight:400}button{font:700 13px Arial;padding:9px 16px;margin-top:4mm}@media print{button{display:none}}</style></head><body>
<div class="c"><div style="font-size:13px">${esc(co.name)}</div>${contact ? `<div class="sm">${contact}</div>` : ''}${co.address ? `<div class="sm">${esc(co.address)}</div>` : ''}</div>
<div class="sep"></div><div class="c" style="font-size:13px">ORÇAMENTO Nº ${label(q)}</div><div class="c sm">${fmtWhen(q.createdAt)} · válido até ${brDate(q.validUntil)}</div><div class="sep"></div>
<div>Cliente: ${esc(q.customerName)}</div>${q.customerPhone ? `<div>Tel: ${esc(q.customerPhone)}</div>` : ''}${q.sellerName ? `<div>Vendedor: ${esc(q.sellerName)}</div>` : ''}${(() => { const d = devOf(q); return d.name || d.serial || d.problem ? `<div class="sep"></div>${d.name ? `<div>${isVehMode() ? 'Veículo' : 'Aparelho'}: ${esc(d.name)}</div>` : ''}${d.serial ? `<div>${devIdLabel()}: ${esc(d.serial)}</div>` : ''}${d.problem ? `<div class="sm">Defeito: ${esc(d.problem)}</div>` : ''}` : ''; })()}<div class="sep"></div>
${items.map(i => { const u = unitOf(i.unit); return `<div class="it"><div>${esc(i.productName)}</div>${i.notes ? `<div class="sm">Série/obs.: ${esc(i.notes)}</div>` : ''}<div class="row"><span>${fmtQty(i.quantity, u.value)} ${esc(u.abbr)} x ${num2(i.unitPrice)}${i.discount ? ' -' + num2(i.discount) : ''}</span><span>${num2(i.total)}</span></div></div>`; }).join('')}
<div class="sep"></div><div class="row"><span>Subtotal</span><span>${money(t.subtotal)}</span></div>${t.discount ? `<div class="row"><span>Desconto</span><span>- ${money(t.discount)}</span></div>` : ''}${t.fee ? `<div class="row"><span>Frete</span><span>${money(t.fee)}</span></div>` : ''}
<div class="row tot"><span>TOTAL</span><span>${money(t.total)}</span></div>
${q.paymentTerms ? `<div class="sm" style="margin-top:2mm">Pagamento: ${esc(q.paymentTerms)}</div>` : ''}${q.deliveryTime ? `<div class="sm">Prazo: ${esc(q.deliveryTime)}</div>` : ''}${q.notes ? `<div class="sm" style="white-space:pre-wrap;margin-top:1mm">${esc(q.notes)}</div>` : ''}
<div class="c sm" style="margin-top:3mm">Orçamento sem valor fiscal</div><div class="c"><button onclick="window.print()">Imprimir</button></div></body></html>`;
        } else {
            html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Orçamento ${label(q)} - ${esc(q.customerName)}</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:12px;background:#f1f5f9}
.page{max-width:210mm;margin:0 auto;background:#fff;padding:14mm 13mm;min-height:297mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:12px}
.co{display:flex;gap:12px;align-items:center}.co img{max-height:58px;max-width:150px;object-fit:contain}.co h1{margin:0;font-size:19px}.co p{margin:2px 0 0;color:#475569;font-size:10.5px;line-height:1.45}
.doc{text-align:right}.doc .t{font-size:11px;letter-spacing:2px;color:#4f46e5;font-weight:800}.doc .n{font-size:24px;font-weight:900}.doc p{margin:2px 0;color:#475569;font-size:10.5px}
.st{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:#eef2ff;color:#4338ca;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.box{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
.box .l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}.box .v{font-size:12.5px;font-weight:600}
table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#f8fafc;color:#475569;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:8px;border-bottom:2px solid #e2e8f0}
td{padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top}td.r,th.r{text-align:right;white-space:nowrap}td small{color:#64748b;display:block;font-size:10px}tr:nth-child(even) td{background:#fcfdff}
.sum{display:flex;justify-content:flex-end;margin-top:12px}.sum table{width:280px;margin:0}.sum td{border:0;padding:4px 8px}.sum .g td{font-size:17px;font-weight:900;border-top:2px solid #0f172a;padding-top:8px;color:#4f46e5}
.cond{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cond div{border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px}.cond b{display:block;font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px}.cond .full{grid-column:1/-1;white-space:pre-wrap}
.sign{display:flex;gap:40px;margin-top:46px}.sign div{flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:5px;font-size:10.5px;color:#475569}
.ft{margin-top:16px;text-align:center;color:#94a3b8;font-size:9.5px}.end{break-inside:avoid;page-break-inside:avoid}
th.ph,td.ph{width:46px;padding:5px 4px}td.ph img{width:38px;height:38px;object-fit:contain;border-radius:6px;border:1px solid #e2e8f0;background:#fff;display:block}tr{break-inside:avoid;page-break-inside:avoid}.bar{position:sticky;top:0;background:#0f172a;padding:10px;text-align:center}.bar button{font:700 13px Arial;padding:9px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;cursor:pointer;margin:0 4px}
@media print{body{background:#fff}.page{padding:0;min-height:0}.bar{display:none}}
</style></head><body><div class="bar"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div><div class="page">
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${co.legalName && co.legalName !== co.name ? esc(co.legalName) + '<br>' : ''}${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">ORÇAMENTO</div><div class="n">Nº ${label(q)}</div><p>Emitido em ${fmtWhen(q.createdAt)}</p><p>Válido até <b>${brDate(q.validUntil)}</b></p><span class="st">${esc(ST[s][0])}</span></div></div>
<div class="box"><div><div class="l">Cliente</div><div class="v">${esc(q.customerName)}</div></div><div><div class="l">Telefone</div><div class="v">${esc(q.customerPhone || '—')}</div></div>
${q.customerDoc ? `<div><div class="l">CPF / CNPJ</div><div class="v">${esc(q.customerDoc)}</div></div>` : ''}${q.customerAddress ? `<div><div class="l">Endereço</div><div class="v">${esc(q.customerAddress)}</div></div>` : ''}${q.sellerName ? `<div><div class="l">Atendente</div><div class="v">${esc(q.sellerName)}</div></div>` : ''}</div>
${(() => { const d = devOf(q); return d.name || d.serial || d.problem ? `<div class="box"><div><div class="l">${isVehMode() ? 'Veículo' : 'Aparelho / equipamento'}</div><div class="v">${esc(d.name || '—')}</div></div><div><div class="l">${devIdLabel()}</div><div class="v">${esc(d.serial || '—')}</div></div>${d.problem ? `<div style="grid-column:1/-1"><div class="l">Defeito relatado</div><div class="v">${esc(d.problem)}</div></div>` : ''}</div>` : ''; })()}
<table><thead><tr><th style="width:34px">#</th>${co.photos ? '<th class="ph"></th>' : ''}<th>Descrição</th><th class="r">Qtd</th><th>Un</th><th class="r">Valor unit.</th><th class="r">Desconto</th><th class="r">Total</th></tr></thead><tbody>
${items.map((i, k) => { const u = unitOf(i.unit); const ph = co.photos ? itemPhoto(i) : ''; return `<tr><td>${k + 1}</td>${co.photos ? `<td class="ph">${ph ? `<img src="${esc(ph)}" alt="">` : ''}</td>` : ''}<td><b>${esc(i.productName)}</b>${i.productCode ? `<small>Cód.: ${esc(i.productCode)}</small>` : ''}${i.notes ? `<small>Série / obs.: ${esc(i.notes)}</small>` : ''}</td><td class="r">${fmtQty(i.quantity, u.value)}</td><td>${esc(u.abbr)}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${i.discount ? money(i.discount) : '—'}</td><td class="r"><b>${money(i.total)}</b></td></tr>`; }).join('')}
</tbody></table>
<div class="sum"><table><tr><td>Subtotal</td><td class="r">${money(t.subtotal)}</td></tr>${t.discount ? `<tr><td>Desconto</td><td class="r">- ${money(t.discount)}</td></tr>` : ''}${t.fee ? `<tr><td>Frete / deslocamento</td><td class="r">${money(t.fee)}</td></tr>` : ''}<tr class="g"><td>TOTAL</td><td class="r">${money(t.total)}</td></tr></table></div>
<div class="cond"><div><b>Forma de pagamento</b>${esc(q.paymentTerms || 'A combinar')}</div><div><b>Prazo de entrega / execução</b>${esc(q.deliveryTime || 'A combinar')}</div>${q.notes ? `<div class="full"><b>Observações</b>${esc(q.notes)}</div>` : ''}</div>
<div class="end"><div class="sign"><div>${esc(co.name)}</div><div>De acordo — ${esc(q.customerName)}</div></div>
<div class="ft">Orçamento válido até ${brDate(q.validUntil)}. Documento sem valor fiscal. ${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}</div></div>
</div></body></html>`;
        }
        w.document.write(html); w.document.close(); w.focus();
    }

    function waText(q, coName) {
        const t = totals(q);
        const lines = (q.items || []).map(i => { const u = unitOf(i.unit); return `• ${fmtQty(i.quantity, u.value)} ${u.abbr} — ${i.productName}: ${money(i.total)}`; });
        return [
            `*Orçamento Nº ${label(q)}*${coName ? ' — ' + coName : ''}`,
            `Olá, ${String(q.customerName || '').split(' ')[0]}! Segue o seu orçamento:`, '',
            devOf(q).name ? `${isVehMode() ? '🚗 Veículo' : '📱 Aparelho'}: ${devOf(q).name}${devOf(q).serial ? ' (' + devIdLabel() + ': ' + devOf(q).serial + ')' : ''}` : '',
            devOf(q).problem ? `🔧 Defeito: ${devOf(q).problem}` : '',
            '', // linhas vazias repetidas somem no filtro abaixo
            ...lines, '',
            `Subtotal: ${money(t.subtotal)}`,
            t.discount ? `Desconto: - ${money(t.discount)}` : '',
            t.fee ? `Frete / deslocamento: ${money(t.fee)}` : '',
            `*Total: ${money(t.total)}*`, '',
            q.paymentTerms ? `Pagamento: ${q.paymentTerms}` : '',
            q.deliveryTime ? `Prazo: ${q.deliveryTime}` : '',
            `Válido até ${brDate(q.validUntil)}.`,
            q.notes ? '\n' + q.notes : ''
        ].filter((l, i, a) => l !== '' || (a[i - 1] !== '' && i > 0)).join('\n');
    }
    async function sendWhatsApp(q) {
        const co = await company();
        let phone = String(q.customerPhone || '').replace(/\D/g, '');
        if (phone && phone.length <= 11) phone = '55' + phone;
        const url = `https://wa.me/${phone}?text=${encodeURIComponent(waText(q, co.name))}`;
        window.open(url, '_blank');
        if (q.status === 'draft') { try { await db.collection(COL).doc(q.id).set({ status: 'sent', sentAt: ts(), updatedAt: ts() }, { merge: true }); q.status = 'sent'; renderList(); } catch (e) { } }
    }

    async function sendToPdv(q) {
        if (!(q.items || []).length) { toast('warning', 'Este orçamento não tem itens'); return; }
        const missing = (q.items || []).filter(i => i.productId && !products.some(p => p.id === i.productId));
        const payload = {
            quoteId: q.id, quoteNumber: q.quoteNumber, quoteNumberLabel: label(q),
            customerId: q.customerId || null, customerName: q.customerName || '', customerPhone: q.customerPhone || '',
            items: (q.items || []).map(i => ({ ...i, productId: products.some(p => p.id === i.productId) ? i.productId : '' })),
            discount: r2(q.discount || 0), deliveryFee: r2(q.deliveryFee || 0),
            // 36.9 · Quem fatura vê tudo o que foi combinado no orçamento
            sellerId: q.sellerId || '', sellerName: q.sellerName || '', paymentMethod: q.paymentMethod || '', paymentTerms: q.paymentTerms || '',
            deliveryTime: q.deliveryTime || '', notes: q.notes || '', internalNotes: q.internalNotes || '', createdByName: q.createdByName || q.sellerName || '',
            device: devOf(q) // 39.5
        };
        try { sessionStorage.setItem('dp_quote_to_pdv', JSON.stringify(payload)); } catch (e) { toast('error', 'Não foi possível levar para o PDV: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return; }
        if (q.status !== 'approved') { try { await db.collection(COL).doc(q.id).set({ status: 'approved', approvedAt: ts(), updatedAt: ts() }, { merge: true }); } catch (e) { } }
        if (missing.length) toast('info', missing.length + ' item(ns) não existem mais no cadastro e entram como item avulso.');
        location.href = 'pdv.html?orcamento=' + encodeURIComponent(q.id);
    }

    /* ======================= CARGA ======================= */
    // 40.0 · Usuário com "ver só os orçamentos e as OS dele" (Usuários › Acesso às telas): só os que ele criou ou em que é o vendedor
    const soDele = lista => { const u = me(), uid = (auth.currentUser && auth.currentUser.uid) || u.uid || ''; if (isAdm() || !((u.permissions || {}).soProprios) || !uid) return lista; return lista.filter(q => q.sellerId === uid || q.createdBy === uid); };
    const simpleList = async (col, ...r) => { const l = await window.simpleList(col, ...r); return col === COL ? soDele(l) : l; }; // o global, na hora (pode estar embrulhado)
    async function reload() {
        quotes = await simpleList(COL, 'createdAt', 'desc', 5000);
        quotes.sort((a, b) => Number(b.quoteNumber || 0) - Number(a.quoteNumber || 0));
        renderList();
    }
    async function boot() {
        if (booted) return; booted = true;
        shell();
        try {
            const [q, p, c] = await Promise.all([simpleList(COL, 'createdAt', 'desc', 5000), simpleList('products', 'name', 'asc', 10000), simpleList('customers', 'name', 'asc', 10000)]);
            quotes = q.sort((a, b) => Number(b.quoteNumber || 0) - Number(a.quoteNumber || 0));
            products = p.filter(x => x.status !== 'inactive' && x.active !== false);
            customers = c.filter(x => x.status !== 'inactive');
            try { sellers = (await simpleList('users', 'name', 'asc', 1000)).filter(u => !u.deleted && u.status !== 'inactive' && !['waiter', 'kitchen', 'delivery'].includes(u.role)); } catch (e) { sellers = []; }
            try { const s = await db.collection('settings').doc('general').get(); const g = s.exists ? (s.data() || {}) : {}; if (Array.isArray(g.formasPagamentoAtivas) && g.formasPagamentoAtivas.length) payActive = g.formasPagamentoAtivas; } catch (e) { }
            renderList();
            const params = new URLSearchParams(location.search);
            if (params.get('novo') === '1') openEditor(null);
            // 35.37 · Vindo da ficha do cliente: ?id=<orçamento> abre o orçamento; ?cliente=<id> abre um novo já com o cliente
            const qid = params.get('id'), cid = params.get('cliente');
            if (qid && quotes.some(x => x.id === qid)) openEditor(qid);
            else if (cid) {
                let cli = customers.find(x => x.id === cid);
                if (!cli) { try { const s = await db.collection('customers').doc(cid).get(); if (s.exists) cli = { id: cid, ...s.data() }; } catch (e) { } }
                openEditor(null);
                if (cli) { applyCustomer(cli); renderCustomer(); }
            }
            if (qid || cid) { try { history.replaceState(null, '', location.pathname); } catch (e) { } }
        } catch (e) { console.error(e); $('orcTbody').innerHTML = `<tr><td colspan="7" class="orc-empty"><i class="fas fa-triangle-exclamation"></i>Não foi possível carregar os orçamentos: ${esc(e.message)}</td></tr>`; }
    }
    window.initPage = boot;
    window.dpQuotes = { reload, openEditor, printQuote, sendWhatsApp, sendToPdv };
    // Se o app.js já tiver passado do ponto de chamar initPage, a página sobe sozinha após o login.
    try { auth.onAuthStateChanged(u => { if (u) setTimeout(boot, 700); }); } catch (e) { }
})();
