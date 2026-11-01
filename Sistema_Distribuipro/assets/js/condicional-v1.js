/* DistribuiPro 38.6 · Condicional direto do PDV (todas as versões).
   A cliente leva as peças para provar em casa e devolve em poucos dias. O motor é o Consignado que já existe (coleção
   consignments, tela consignado.html): o condicional é uma remessa com kind:'condicional' e source:'pdv'.
   - window.DPCondicional.createFromCart(items, customer, dueDate, opts): grava a remessa (número em settings/general.consignmentSequence,
     o mesmo do Consignado), tira as peças do estoque (StockService.exit) e devolve o registro.
   - DPCondicional.printTerm(c, modo): termo para a cliente assinar, em cupom 80 mm ou folha A4 (peças com tamanho/cor, valor,
     prazo e linha de assinatura).
   - PDV: botão "Condicional" ao lado de Finalizar (ramo Loja ou settings.condicionalPdv). Exige cliente; prazo = hoje +
     settings.condicionalDias (padrão 2). Depois limpa o carrinho e imprime o termo.
   - Início: cartão "Condicionais vencidos" (ou "Consignados atrasados") com o WhatsApp de cada cliente.
   - Tela Consignado/Condicional: no ramo Loja os textos falam de condicional, o comprovante sai como termo e o link do Início abre
     já filtrado nos atrasados (#atrasadas). */
(function () {
    'use strict';
    if (window.DPCondicional) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => Number(v) || 0;
    const r2 = v => Math.round(num(v) * 100) / 100;
    const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qf = v => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const TSc = () => window.DPTimestamp || (window.firebase && firebase.firestore && firebase.firestore.Timestamp);
    const ts = () => FV().serverTimestamp();
    const tsAt = d => { const T = TSc(); return T && typeof T.fromDate === 'function' ? T.fromDate(d) : d; };
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const me = () => { try { return (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } };
    const meName = () => me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador';
    const DEMO = () => { try { return !!db.__isLocalDemo; } catch (e) { return false; } };
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const plural = (n, a, b) => (Number(n) === 1 ? a : b);
    const COL = 'consignments';
    const conNo = c => '#C-' + String((c && c.number) || 0).padStart(4, '0');
    const toDate = v => { if (!v) return null; try { if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) { const [y, m, d] = v.split('-').map(Number); return new Date(y, m - 1, d); } const d = v.toDate ? v.toDate() : (v instanceof Date ? v : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || v.value || (v.seconds ? v.seconds * 1000 : v)))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const fmtD = v => { const d = toDate(v); return d ? d.toLocaleDateString('pt-BR') : '—'; };
    const fmtDT = v => { const d = toDate(v); return d ? d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'; };
    const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const day0 = (d = new Date()) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const pendQty = i => Math.max(0, num(i.quantity) - num(i.soldQty) - num(i.returnedQty));
    const pendOf = c => (c.items || []).reduce((a, i) => a + pendQty(i), 0);
    const pendValue = c => r2((c.items || []).reduce((a, i) => a + pendQty(i) * num(i.unitPrice), 0));
    const segment = () => { try { return window.DPTerm && DPTerm.segment ? (DPTerm.segment() || '') : ''; } catch (e) { return ''; } };
    const isLoja = () => { try { return !!(window.DPTerm && DPTerm('Consignado') === 'Condicional'); } catch (e) { return false; } };

    /* ---------- Configuração (settings/general; demo: demo_general) ---------- */
    let CFG = null, cfgP = null;
    function loadCfg(force) {
        if (cfgP && !force) return cfgP;
        cfgP = (async () => {
            let g = {};
            try { const d = await db.collection('settings').doc('general').get(); if (d.exists) g = d.data() || {}; } catch (e) { }
            if (DEMO()) { try { const d = await db.collection('settings').doc('demo_general').get(); if (d.exists) g = { ...g, ...(d.data() || {}) }; } catch (e) { } }
            let brand = {}; try { brand = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {}; } catch (e) { }
            CFG = {
                dias: Math.max(1, Math.min(60, Math.round(num(g.condicionalDias)) || 2)), pdv: g.condicionalPdv,
                company: { name: g.nomeFantasia || brand.companyName || g.razaoSocial || 'Loja', doc: g.cnpj || '', phone: g.telefone || g.whatsapp || '', address: [[g.logradouro, g.numero].filter(Boolean).join(', '), g.bairro, [g.cidade, g.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · ') }
            };
            return CFG;
        })();
        return cfgP;
    }
    const pdvOn = () => { const c = CFG || {}; return c.pdv === true || (c.pdv !== false && segment() === 'loja'); };

    /* ---------- Gravar o condicional ---------- */
    async function nextNumber() {
        const ref = db.collection('settings').doc('general'); const d = await ref.get();
        const n = (d.exists ? num((d.data() || {}).consignmentSequence) : 0) + 1;
        await ref.set({ consignmentSequence: n }, { merge: true }); return n;
    }
    async function createFromCart(items, customer, dueDate, opts) {
        opts = opts || {};
        customer = customer || {};
        const lines = (items || []).map(i => {
            const f = num(i._factor) || 1;
            return { productId: i.productId, productName: String(i.productName || 'Peça'), productCode: i.productCode || '', unitPrice: r2(num(i.unitPrice) / f), costPrice: r2(i.costPrice), quantity: num(i.quantity) * f, soldQty: 0, returnedQty: 0, _factor: 1 };
        }).filter(i => i.productId && i.quantity > 0);
        if (!lines.length) throw new Error('Nenhuma peça para o condicional.');
        if (!customer.id && !customer.name) throw new Error('Escolha a cliente do condicional.');
        const due = toDate(dueDate) || (() => { const d = day0(); d.setDate(d.getDate() + ((CFG && CFG.dias) || 2)); return d; })();
        const number = await nextNumber();
        const doc = {
            number, kind: 'condicional', source: opts.source || 'pdv',
            customerId: customer.id || '', customerName: customer.name || 'Cliente', customerPhone: customer.phone || '',
            sellerId: opts.sellerId || uid(), sellerName: opts.sellerName || meName(),
            items: lines, totalQty: lines.reduce((a, i) => a + i.quantity, 0), totalValue: r2(lines.reduce((a, i) => a + i.quantity * i.unitPrice, 0)), settledValue: 0,
            status: 'open', dueDate: tsAt(due), notes: String(opts.notes || '').slice(0, 300), settlements: [],
            createdAt: ts(), updatedAt: ts(), createdBy: uid(), createdByName: meName(), deleted: false
        };
        const ref = await db.collection(COL).add(doc);
        for (let k = 0; k < lines.length; k++) {
            const i = lines[k];
            if (opts.onStep) { try { opts.onStep(k + 1, lines.length); } catch (e) { } }
            try { await StockService.exit(i.productId, i.quantity, `Condicional ${conNo(doc)} — ${doc.customerName}`, 'consignment', ref.id); } catch (e) { console.warn('condicional estoque:', e); }
        }
        try { AuditService.log('create', 'consignments', ref.id, { number, kind: 'condicional', customer: doc.customerName, total: doc.totalValue }); } catch (e) { }
        return { id: ref.id, ...doc, createdAt: new Date(), dueDate: due };
    }

    /* ---------- Termo para assinar (80 mm ou A4) ---------- */
    const usesTerm = c => !!c && (c.kind === 'condicional' || isLoja());
    // A janela abre já no toque (antes de esperar o banco), senão o navegador bloqueia o pop-up
    function termWindow() {
        const w = window.open('', '_blank', 'width=820,height=820');
        if (w) { try { w.document.write('<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Termo do condicional</title></head><body style="font:15px Arial,sans-serif;color:#475569;display:grid;place-items:center;height:90vh">Preparando o termo...</body></html>'); w.document.close(); } catch (e) { } }
        return w;
    }
    async function printTerm(c, mode, win) {
        const w = win && !win.closed ? win : termWindow();
        if (!w) { toast('warning', 'O navegador bloqueou a janela de impressão. Libere as janelas pop-up para imprimir o termo (Consignado › Imprimir).'); return; }
        const co = (await loadCfg()).company;
        try { w.document.open(); } catch (e) { }
        let saved = ''; try { saved = localStorage.getItem('dpcd_term_mode') || ''; } catch (e) { }
        mode = mode || saved || 't80';
        const due = toDate(c.dueDate), days = due ? Math.max(0, Math.round((day0(due) - day0(toDate(c.createdAt) || new Date())) / 864e5)) : 0;
        const rows = (c.items || []).map(i => `<tr><td>${esc(i.productName)}${i.productCode ? `<small>${esc(i.productCode)}</small>` : ''}</td><td class="n">${qf(i.quantity)}</td><td class="n">${money(i.unitPrice)}</td><td class="n">${money(num(i.quantity) * num(i.unitPrice))}</td></tr>`).join('');
        const total = r2((c.items || []).reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0)), pcs = (c.items || []).reduce((a, i) => a + num(i.quantity), 0);
        const pr = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>';
        w.document.write(`<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Condicional ${conNo(c)}</title><style>
*{box-sizing:border-box;margin:0;padding:0}body{background:#f1f5f9;color:#111;padding:66px 10px 30px;font-family:"Segoe UI",Arial,sans-serif}
.bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;gap:8px;align-items:center;z-index:9}.bar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155;display:inline-flex;gap:6px;align-items:center}.bar button.on{background:#e0e7ff;border-color:#6366f1;color:#4338ca}.bar button.p{background:#4f46e5;color:#fff;border-color:#4f46e5}.bar .sp{flex:1}
.doc{background:#fff;margin:0 auto;padding:14px}.hd{text-align:center;margin-bottom:8px}.co{font-weight:800;font-size:1.15em}.sub{font-size:.85em;color:#475569}
.ttl{text-align:center;font-weight:800;margin:8px 0;padding:6px 0;border-top:1px dashed #94a3b8;border-bottom:1px dashed #94a3b8;letter-spacing:.5px}
.r{display:flex;justify-content:space-between;gap:8px;padding:2px 0}.r b{text-align:right}.due{font-size:1.15em;margin:6px 0;padding:6px 8px;border:2px solid #111;border-radius:6px;text-align:center;font-weight:800}
.sec{font-weight:800;font-size:.8em;letter-spacing:.5px;margin:10px 0 4px;color:#334155}
table{width:100%;border-collapse:collapse;font-size:.9em}th{text-align:left;border-bottom:1px solid #94a3b8;padding:3px 2px}td{padding:3px 2px;border-bottom:1px dotted #cbd5e1;vertical-align:top}td small{display:block;color:#64748b;font-size:.85em}.n{text-align:right;white-space:nowrap}tfoot td{font-weight:800;border-top:1px solid #94a3b8;border-bottom:0}
.term{font-size:.88em;color:#1e293b;margin-top:10px;line-height:1.45}.term li{margin:3px 0 0 16px}
.sig{display:flex;gap:16px;margin-top:34px}.sig div{flex:1;text-align:center;font-size:.8em;color:#334155}.sig span{display:block;border-top:1px solid #111;margin-bottom:4px}
.ft{text-align:center;font-size:.75em;color:#94a3b8;margin-top:12px}
body.t80 .doc{width:72mm;font-family:"Courier New",monospace;font-size:11.5px;line-height:1.3;padding:6px}body.t80 .sig{flex-direction:column;gap:30px}
body.a4 .doc{max-width:720px;font-size:13px;line-height:1.45;padding:28px 32px;border:1px solid #e2e8f0}
@media print{body{background:#fff;padding:0}.bar{display:none}.doc{border:0!important;margin:0;max-width:none}body.t80 .doc{width:100%}@page{margin:4mm}}
</style></head><body class="${mode === 'a4' ? 'a4' : 't80'}">
<div class="bar"><strong style="font-size:13px;color:#334155">Formato:</strong><button id="b80" onclick="setMode('t80')">Cupom 80 mm</button><button id="ba4" onclick="setMode('a4')">Folha A4</button><span class="sp"></span><button class="p" onclick="window.print()">${pr} Imprimir</button><button onclick="window.close()">Fechar</button></div>
<div class="doc">
  <div class="hd"><div class="co">${esc(co.name)}</div>${co.doc ? `<div class="sub">CNPJ ${esc(co.doc)}</div>` : ''}${co.address ? `<div class="sub">${esc(co.address)}</div>` : ''}${co.phone ? `<div class="sub">${esc(co.phone)}</div>` : ''}</div>
  <div class="ttl">TERMO DE CONDICIONAL ${conNo(c)}</div>
  <div class="r"><span>Cliente</span><b>${esc(c.customerName)}</b></div>${c.customerPhone ? `<div class="r"><span>Telefone</span><b>${esc(c.customerPhone)}</b></div>` : ''}
  <div class="r"><span>Saída</span><b>${fmtDT(c.createdAt)}</b></div><div class="r"><span>Vendedor(a)</span><b>${esc(c.sellerName || c.createdByName || '')}</b></div>
  <div class="due">Devolver até ${fmtD(c.dueDate)}${days ? ` (${days} ${plural(days, 'dia', 'dias')})` : ''}</div>
  <div class="sec">PEÇAS QUE A CLIENTE LEVOU</div>
  <table><thead><tr><th>Peça</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Total</th></tr></thead><tbody>${rows}</tbody><tfoot><tr><td>${qf(pcs)} ${plural(pcs, 'peça', 'peças')}</td><td></td><td></td><td class="n">${money(total)}</td></tr></tfoot></table>
  ${c.notes ? `<div class="sec">OBSERVAÇÕES</div><div class="term">${esc(c.notes)}</div>` : ''}
  <div class="term">Recebi as peças acima para provar e me comprometo a, até <b>${fmtD(c.dueDate)}</b>:<ul><li>devolver as que eu não ficar, sem uso, limpas e com etiqueta;</li><li>pagar as que eu ficar, pelo valor acima.</li></ul>Peça com defeito de uso, manchada ou sem etiqueta conta como comprada.</div>
  <div class="sig"><div><span></span>${esc(c.customerName)}</div><div><span></span>${esc(co.name)}</div></div>
  <div class="ft">Impresso em ${new Date().toLocaleString('pt-BR')}</div>
</div>
<script>function setMode(m){document.body.className=m;document.getElementById('b80').classList.toggle('on',m==='t80');document.getElementById('ba4').classList.toggle('on',m==='a4');try{opener&&opener.localStorage.setItem('dpcd_term_mode',m)}catch(e){}}setMode(document.body.className);window.addEventListener('load',function(){setTimeout(function(){window.print()},300)});<\/script>
</body></html>`);
        w.document.close();
    }

    /* ---------- PDV: botão Condicional ---------- */
    function css() {
        if ($('dpcdCss')) return;
        const st = document.createElement('style'); st.id = 'dpcdCss';
        st.textContent = `
.dpcd-btn[hidden],.dpcd-m [hidden]{display:none!important}
.dpcd-btn{flex:1;display:inline-flex;align-items:center;justify-content:center;gap:6px;white-space:nowrap}.dpcd-btn svg{width:16px;height:16px;flex:none}
@media (max-width:1366px){.cart-actions .dpcd-btn span{display:none}}
.dpcd-chip[hidden]{display:none!important}
.dpcd-chip{margin-left:auto;margin-right:10px;display:inline-flex;align-items:center;gap:6px;height:30px;padding:0 12px;border-radius:99px;border:1px solid var(--accent);background:var(--accent-muted,rgba(99,102,241,.1));color:var(--accent);font:inherit;font-size:12.5px;font-weight:800;cursor:pointer;white-space:nowrap}
.dpcd-chip:hover{background:var(--accent);color:#fff}.dpcd-chip svg{width:15px;height:15px;flex:none}
.dpcd-m .modal{max-width:620px;width:min(620px,calc(100vw - 20px));max-height:94vh;display:flex;flex-direction:column}.dpcd-m .modal-body{overflow:auto}
.dpcd-m .modal-header h3{display:flex;align-items:center;gap:8px}.dpcd-m .modal-header h3 svg{width:20px;height:20px;color:var(--accent)}
.dpcd-who{display:flex;gap:10px;align-items:center;padding:10px 12px;border-radius:12px;background:var(--accent-muted,rgba(99,102,241,.1));margin-bottom:12px}.dpcd-who b{display:block;color:var(--text-heading)}.dpcd-who small{color:var(--text-muted)}.dpcd-who svg{width:22px;height:22px;color:var(--accent);flex:none}
.dpcd-t{width:100%;border-collapse:collapse;font-size:13px}.dpcd-t th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:6px;border-bottom:1px solid var(--border-color)}.dpcd-t td{padding:7px 6px;border-bottom:1px solid var(--border-color)}.dpcd-t .n{text-align:right;white-space:nowrap}.dpcd-t tfoot td{font-weight:800;color:var(--text-heading);border-bottom:0}
.dpcd-g{display:grid;grid-template-columns:1fr 1.4fr;gap:12px;margin-top:12px}.dpcd-g .form-group{margin:0}
.dpcd-warn{margin-top:10px;padding:9px 12px;border-radius:10px;background:rgba(245,158,11,.12);color:#b45309;font-size:12.5px;display:flex;gap:8px;align-items:flex-start}.dpcd-warn svg{width:16px;height:16px;flex:none;margin-top:1px}
.dpcd-btn-ic{display:inline-flex;align-items:center;gap:6px}.dpcd-btn-ic svg{width:16px;height:16px}
.dpcd-dash{display:flex;align-items:flex-start;gap:14px;flex-wrap:wrap;padding:14px 18px;margin:0 0 20px;border-radius:14px;border:1px solid var(--border-color);background:var(--bg-card);border-left:4px solid #dc2626}
.dpcd-dash-ic{flex:none;width:42px;height:42px;border-radius:12px;display:grid;place-items:center;background:rgba(220,38,38,.12);color:#dc2626}.dpcd-dash-ic svg{width:22px;height:22px}
.dpcd-dash-tx{flex:1;min-width:220px}.dpcd-dash-tx>b{display:block;font-size:14.5px;color:var(--text-heading,var(--text-primary))}.dpcd-dash-tx>span{font-size:12.5px;color:var(--text-muted)}
.dpcd-dash ul{list-style:none;margin:8px 0 0;padding:0;display:flex;flex-direction:column;gap:6px}
.dpcd-dash li{display:flex;align-items:center;gap:10px;font-size:13px;color:var(--text-primary)}.dpcd-dash li span{flex:1;min-width:0}.dpcd-dash li small{color:var(--danger,#dc2626);font-weight:700;white-space:nowrap}
.dpcd-wa{display:inline-flex;align-items:center;gap:5px;padding:5px 10px;border-radius:99px;border:1px solid rgba(37,211,102,.45);color:#128c4a;font-weight:700;font-size:12px;text-decoration:none;white-space:nowrap}.dpcd-wa:hover{background:rgba(37,211,102,.1)}.dpcd-wa svg{width:14px;height:14px}
.dpcd-dash>a{display:inline-flex;align-items:center;gap:6px;font-weight:700;font-size:13px;color:var(--accent);text-decoration:none;white-space:nowrap;align-self:center}.dpcd-dash>a svg{width:15px;height:15px}`;
        document.head.appendChild(st);
    }
    const pdvCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
    const pdvProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
    const isSvcItem = i => { const p = pdvProducts().find(x => x.id === i.productId); return !p || p.productType === 'service' || i.isService === true || (p.controlStock === false && !p.isGradeParent); };
    function setupPdv() {
        const fin = $('btnFinalize'); if (!fin || $('dpcdBtn')) return;
        css();
        // Fica na linha do total (ao lado de "Detalhes"): os 3 botões de baixo já ocupam a largura toda em 1366×768
        const row = document.querySelector('#pdvCart .pdx-items'), more = row && row.querySelector('.pdx-more');
        const b = document.createElement('button'); b.type = 'button'; b.id = 'dpcdBtn'; b.className = row ? 'dpcd-chip' : 'btn btn-outline dpcd-btn'; b.hidden = true;
        b.title = 'Condicional: a cliente leva as peças para provar e devolve no prazo';
        b.innerHTML = `${ic('shopping-bag', 'bag-shopping')}<span>Condicional</span>`;
        if (row && more) more.insertAdjacentElement('beforebegin', b); else fin.insertAdjacentElement('beforebegin', b);
        b.addEventListener('click', openFromPdv);
        const show = () => { b.hidden = !pdvOn(); };
        loadCfg().then(show); document.addEventListener('dp:ramo', show); document.addEventListener('dp:grade-cfg', e => { if (CFG && e.detail && 'condicionalPdv' in e.detail) { CFG.pdv = e.detail.condicionalPdv; show(); } });
        setTimeout(show, 1500);
    }
    async function openFromPdv() {
        const items = pdvCart();
        if (!items.length) { toast('warning', 'O carrinho está vazio. Ponha as peças que a cliente vai levar para provar.'); return; }
        let cid = null, cname = ''; try { cid = selectedCustomerId; cname = selectedCustomerNameVal; } catch (e) { }
        if (!cid) { toast('warning', 'Escolha a cliente primeiro: o condicional fica no nome dela.'); const cs = $('customerSearch'); if (cs) { cs.focus(); try { cs.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } } return; }
        if (items.some(i => Array.isArray(i.serialIds) && i.serialIds.length)) { toast('warning', 'Aparelho com IMEI/nº de série não vai no condicional. Tire do carrinho ou faça a venda.'); return; }
        const lines = items.filter(i => !isSvcItem(i)), skipped = items.length - lines.length;
        if (!lines.length) { toast('warning', 'Serviço não vai no condicional: ponha as peças no carrinho.'); return; }
        await loadCfg();
        let cust = null; try { const d = await db.collection('customers').doc(cid).get(); cust = d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { }
        const customer = { id: cid, name: (cust && (cust.name || cust.nome)) || cname || 'Cliente', phone: (cust && (cust.whatsapp || cust.phone || cust.telefone)) || '' };
        // Condicionais desta cliente ainda em aberto (aviso)
        let open = []; try { open = (await db.collection(COL).where('customerId', '==', cid).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted && ['open', 'partial'].includes(c.status)); } catch (e) { }
        const late = open.filter(c => { const d = toDate(c.dueDate); return d && day0(d) < day0(); });
        const due = day0(); due.setDate(due.getDate() + CFG.dias);
        let sellerId = uid(), sellerName = meName(); // vendedora escolhida no PDV (selectedSeller* são "let" do pdv.html)
        try { if (selectedSellerId) sellerId = selectedSellerId; if (selectedSellerNameVal) sellerName = selectedSellerNameVal; } catch (e) { }
        const total = r2(lines.reduce((a, i) => a + num(i.quantity) * num(i.unitPrice), 0)), pcs = lines.reduce((a, i) => a + num(i.quantity) * (num(i._factor) || 1), 0);
        $('dpcdModal') && $('dpcdModal').remove();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpcd-m'; ov.id = 'dpcdModal';
        ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dpcdTitle"><div class="modal-header"><h3 id="dpcdTitle">${ic('shopping-bag', 'bag-shopping')} Condicional</h3><button class="modal-close" type="button" data-x aria-label="Fechar"><i class="fas fa-times"></i></button></div>
<div class="modal-body">
  <div class="dpcd-who">${ic('user-round', 'user')}<div><b>${esc(customer.name)}</b><small>${customer.phone ? esc(customer.phone) + ' · ' : ''}leva ${qf(pcs)} ${plural(pcs, 'peça', 'peças')} para provar</small></div></div>
  <table class="dpcd-t"><thead><tr><th>Peça</th><th class="n">Qtd</th><th class="n">Valor</th><th class="n">Total</th></tr></thead><tbody>${lines.map(i => `<tr><td>${esc(i.productName)}</td><td class="n">${qf(i.quantity)}</td><td class="n">${money(i.unitPrice)}</td><td class="n">${money(num(i.quantity) * num(i.unitPrice))}</td></tr>`).join('')}</tbody><tfoot><tr><td colspan="3">Valor das peças</td><td class="n">${money(total)}</td></tr></tfoot></table>
  <div class="dpcd-g"><div class="form-group"><label class="form-label" for="dpcdDue">Devolver até</label><input type="date" class="form-control" id="dpcdDue" value="${ymd(due)}" min="${ymd(day0())}"></div><div class="form-group"><label class="form-label" for="dpcdNotes">Observação (sai no termo)</label><input type="text" class="form-control" id="dpcdNotes" maxlength="300" placeholder="Ex.: vai provar com a filha, busca no sábado"></div></div>
  ${late.length ? `<div class="dpcd-warn">${ic('triangle-alert', 'triangle-exclamation')}<span>${esc(customer.name)} já tem ${late.length} ${plural(late.length, 'condicional vencido', 'condicionais vencidos')} (${late.map(c => conNo(c)).join(', ')}). Confira antes de entregar mais peças.</span></div>` : open.length ? `<div class="dpcd-warn">${ic('info', 'circle-info')}<span>${esc(customer.name)} já está com ${open.length} ${plural(open.length, 'condicional em aberto', 'condicionais em aberto')} (${open.map(c => conNo(c)).join(', ')}).</span></div>` : ''}
  ${skipped ? `<div class="dpcd-warn">${ic('info', 'circle-info')}<span>${skipped} ${plural(skipped, 'serviço fica', 'serviços ficam')} de fora (não vai no condicional) e continua no carrinho.</span></div>` : ''}
  <p style="font-size:12px;color:var(--text-muted);margin-top:10px">As peças saem do estoque agora. Na volta, em <b>${esc(isLoja() ? 'Condicional' : 'Consignado')} › Acertar</b>, o que ela ficou vira venda e o que devolveu volta para o estoque.</p>
</div>
<div class="modal-footer"><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary dpcd-btn-ic" id="dpcdOk">${ic('printer', 'print')} Confirmar e imprimir termo</button></div></div>`;
        document.body.appendChild(ov);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape' && document.body.contains(ov)) { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
        const ok = $('dpcdOk');
        ok.addEventListener('click', async () => {
            const dueV = $('dpcdDue').value; const d = dueV ? toDate(dueV) : due;
            if (!d || day0(d) < day0()) { toast('warning', 'A data de devolução não pode ser antes de hoje.'); return; }
            ok.disabled = true; ok.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando...';
            const win = termWindow();
            try {
                const rec = await createFromCart(lines, customer, d, { sellerId, sellerName, notes: $('dpcdNotes').value.trim(), source: 'pdv', onStep: (n, t) => { ok.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Baixando o estoque ${n} de ${t}...`; } });
                close();
                // Tira do carrinho o que foi no condicional (serviço continua) e solta a cliente
                const keep = pdvCart().filter(i => !lines.includes(i));
                pdvCart().splice(0, pdvCart().length, ...keep);
                if (!keep.length) { try { discount = 0; } catch (e) { } }
                try { renderCart(); } catch (e) { }
                if (!keep.length) { try { if (typeof window.clearCustomer === 'function') window.clearCustomer(); } catch (e) { } }
                try { if (typeof window.loadProducts === 'function') window.loadProducts(); } catch (e) { }
                toast('success', `Condicional ${conNo(rec)} de ${customer.name}: ${qf(rec.totalQty)} ${plural(rec.totalQty, 'peça', 'peças')} até ${fmtD(rec.dueDate)}.`);
                printTerm(rec, null, win);
            } catch (e) { console.error(e); try { if (win) win.close(); } catch (er) { } toast('error', 'Não foi possível gravar o condicional: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); ok.disabled = false; ok.innerHTML = `${ic('printer', 'print')} Confirmar e imprimir termo`; }
        });
        setTimeout(() => ok.focus(), 40);
    }

    /* ---------- Início: condicionais vencidos ---------- */
    async function setupDash() {
        const grid = $('statsGrid'); if (!grid || $('dpcdDash')) return;
        let list = [];
        try { list = (await db.collection(COL).get()).docs.map(d => ({ id: d.id, ...d.data() })).filter(c => !c.deleted && ['open', 'partial'].includes(c.status)); } catch (e) { return; }
        const t0 = day0();
        const late = list.filter(c => { const d = toDate(c.dueDate); return d && day0(d) < t0 && pendOf(c) > 0; }).sort((a, b) => (toDate(a.dueDate) || 0) - (toDate(b.dueDate) || 0));
        if (!late.length || $('dpcdDash')) return;
        await loadCfg(); css();
        const cond = isLoja() || late.some(c => c.kind === 'condicional');
        const word = cond ? ['condicional vencido', 'condicionais vencidos'] : ['consignado atrasado', 'consignados atrasados'];
        const value = r2(late.reduce((a, c) => a + pendValue(c), 0)), pcs = late.reduce((a, c) => a + pendOf(c), 0);
        const wa = c => {
            let ph = String(c.customerPhone || '').replace(/\D/g, ''); if (!ph) return '';
            if (ph.length <= 11) ph = '55' + ph;
            const msg = cond ? `Olá ${c.customerName}! Tudo bem? Aqui é da ${CFG.company.name}. As peças do condicional (${qf(pendOf(c))} ${plural(pendOf(c), 'peça', 'peças')}) eram para voltar em ${fmtD(c.dueDate)}. Vai ficar com alguma? Se preferir, combinamos de buscar.` : `Olá ${c.customerName}! Aqui é da ${CFG.company.name}. Sobre a mercadoria em consignação (${conNo(c)}), o acerto estava previsto para ${fmtD(c.dueDate)}. Podemos combinar? Valor em aberto: ${money(pendValue(c))}.`;
            return `<a class="dpcd-wa" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${encodeURIComponent(msg)}">${ic('whatsapp', 'whatsapp')} WhatsApp</a>`;
        };
        const el = document.createElement('div'); el.id = 'dpcdDash'; el.className = 'dpcd-dash';
        el.innerHTML = `<span class="dpcd-dash-ic">${ic(cond ? 'shopping-bag' : 'clock', 'clock')}</span><div class="dpcd-dash-tx"><b>${late.length} ${plural(late.length, word[0], word[1])}</b><span>${qf(pcs)} ${plural(pcs, 'peça', 'peças')} com clientes · ${money(value)} passou do prazo</span>
<ul>${late.slice(0, 3).map(c => { const dd = Math.max(1, Math.round((t0 - day0(toDate(c.dueDate))) / 864e5)); return `<li><span><b>${esc(c.customerName)}</b> · ${qf(pendOf(c))} ${plural(pendOf(c), 'peça', 'peças')} · ${money(pendValue(c))}</span><small>${dd} ${plural(dd, 'dia', 'dias')}</small>${wa(c)}</li>`; }).join('')}</ul></div>
<a href="consignado.html#atrasadas">${late.length > 3 ? `Ver os ${late.length}` : 'Ver ' + (cond ? 'condicionais' : 'consignados')} ${ic('arrow-right', 'arrow-right')}</a>`;
        const after = $('vldDash') || grid;
        after.insertAdjacentElement('afterend', el);
    }

    /* ---------- Tela Consignado no ramo Loja ---------- */
    const SWAP = [
        ['Nova remessa em consignação', 'Novo condicional'], ['Nova remessa', 'Novo condicional'], ['Salvar remessa', 'Salvar condicional'],
        ['Em poder de clientes', 'Peças com clientes'], ['vendido via consignado', 'vendido no condicional'],
        ['Clientes com consignado', 'Clientes com condicional'], ['Acerto atrasado', 'Passou do prazo'], ['Prev. acerto', 'Devolver até'], ['Previsão do acerto', 'Devolver até'],
        ['Nenhuma mercadoria em consignação. Clique em "Nova remessa" para começar.', 'Nenhum condicional em aberto. No PDV, monte o carrinho com a cliente escolhida e toque em "Condicional".'],
        ['Valor da remessa', 'Valor das peças'], ['Cancelar remessa (devolve tudo ao estoque)', 'Cancelar condicional (todas as peças voltam ao estoque)'], ['Imprimir comprovante', 'Imprimir termo'],
        ['Remessa ', 'Condicional '], ['Nenhuma remessa encontrada.', 'Nenhum condicional encontrado.']
    ];
    function swapTexts(root) {
        if (!root || !isLoja()) return;
        const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
        let n; while ((n = tw.nextNode())) {
            let v = n.nodeValue; const o = v;
            v = v.replace(/(\d+) remessa\(s\) em aberto/g, (m, q) => q + (q === '1' ? ' condicional em aberto' : ' condicionais em aberto'));
            for (const [a, b] of SWAP) if (v.includes(a)) v = v.split(a).join(b);
            if (v !== o) n.nodeValue = v;
        }
        root.querySelectorAll('[title]').forEach(el => { const t = el.getAttribute('title'); const hit = SWAP.find(([a]) => t === a); if (hit) el.setAttribute('title', hit[1]); });
        root.querySelectorAll('a[href*="wa.me/"]').forEach(a => {
            const h = a.getAttribute('href'); if (!/consigna/i.test(decodeURIComponent(h))) return;
            a.setAttribute('href', h.replace(/text=([^&]*)/, (m, t) => 'text=' + encodeURIComponent(decodeURIComponent(t).replace('Sobre a mercadoria em consignação', 'Sobre as peças do condicional').replace('podemos combinar o acerto?', 'vai ficar com alguma? Se preferir, combinamos de buscar.'))));
        });
        const how = [...root.querySelectorAll('div')].find(d => /^Como funciona: na/.test((d.textContent || '').trim()) && d.children.length < 8);
        if (how && !how.dataset.dpcd) { how.dataset.dpcd = '1'; how.innerHTML = `${ic('info', 'circle-info')} Como funciona: no PDV, com a cliente escolhida, toque em <b>Condicional</b>. As peças saem do estoque e o termo é impresso para ela assinar. Na volta, toque em <b>Acertar</b>: o que ela ficou vira venda (caixa, cartão ou fiado) e o que devolveu volta ao estoque.`; }
    }
    function setupConsignado() {
        const root = $('conRoot'); if (!root) return;
        const run = () => { swapTexts(root); document.querySelectorAll('.con-m').forEach(swapTexts); if (isLoja() && /^Consignado/.test(document.title)) document.title = document.title.replace(/^Consignado/, 'Condicional'); };
        new MutationObserver(run).observe(root, { childList: true, subtree: true });
        new MutationObserver(muts => muts.forEach(m => m.addedNodes.forEach(n => { if (n instanceof HTMLElement && n.classList.contains('con-m')) swapTexts(n); }))).observe(document.body, { childList: true });
        document.addEventListener('dp:ramo', run);
        setTimeout(run, 800);
        // Link do Início: abre nos atrasados
        if (location.hash === '#atrasadas') {
            const tryLate = (n) => { const s = $('conSt'); if (s) { s.value = 'late'; s.dispatchEvent(new Event('change')); return; } if (n > 0) setTimeout(() => tryLate(n - 1), 300); };
            tryLate(20);
        }
    }

    window.DPCondicional = { createFromCart, printTerm, usesTerm, loadCfg, openFromPdv, get cfg() { return CFG; } };
    window.DPConsignado = Object.assign(window.DPConsignado || {}, { createFromCart, termo: printTerm }); // o motor é o do Consignado

    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    ready(() => {
        try { if (PAGE === 'pdv') setupPdv(); } catch (e) { console.warn('condicional pdv', e); }
        try { if (PAGE === 'consignado') setupConsignado(); } catch (e) { console.warn('condicional', e); }
    });
    if (PAGE === 'index' || PAGE === '') { try { auth.onAuthStateChanged(u => { if (u) setTimeout(() => setupDash().catch(() => { }), 700); }); } catch (e) { } }
})();
