/* DistribuiPro 35.1 · Impressão da OS em térmica (cupom 80 mm) ou folha A4.
   - Ao imprimir, pergunta o formato (ou usa o formato fixo escolhido na barra da tela de OS).
   - A térmica continua sendo a impressão original da página; a A4 é montada aqui.
   - Carregado antes do os-extras: o QR Code de acompanhamento entra nos dois formatos. */
(function () {
    'use strict';
    if (typeof window.printServiceOrder !== 'function') return;
    const KEY = 'dp_os_print_format';
    const getFmt = () => { try { return localStorage.getItem(KEY) || 'ask'; } catch (e) { return 'ask'; } };
    const setFmt = v => { try { localStorage.setItem(KEY, v); } catch (e) { } const s = document.getElementById('osPrintFormat'); if (s) s.value = v; };
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (typeof osMoney === 'function') ? osMoney(v) : (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const fdate = (v, t) => (typeof osDate === 'function') ? osDate(v, t) : '—';

    const css = document.createElement('style');
    css.textContent = `.osp-bg{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
.osp-box{background:var(--bg-card);color:var(--text-primary);border-radius:16px;width:100%;max-width:440px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.35)}
.osp-box h3{margin:0 0 4px;font-size:16px;color:var(--text-heading)}.osp-box p{margin:0 0 14px;font-size:12px;color:var(--text-muted)}
.osp-opts{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.osp-opt{border:2px solid var(--border-color);background:var(--bg-secondary);border-radius:14px;padding:16px 10px;cursor:pointer;text-align:center;color:var(--text-primary);transition:border-color .15s,transform .15s}
.osp-opt:hover,.osp-opt:focus{border-color:var(--accent);transform:translateY(-2px);outline:none}
.osp-opt.last{border-color:var(--accent)}
.osp-opt .ic{font-size:30px;display:block;margin-bottom:6px}.osp-opt b{display:block;font-size:13px}.osp-opt small{display:block;font-size:10.5px;color:var(--text-muted);margin-top:3px}
.osp-opt-bench{grid-column:1/-1;display:flex;align-items:center;gap:12px;text-align:left;padding:12px 14px}.osp-opt-bench .ic{font-size:22px;margin:0}
.osp-keep{display:flex;align-items:center;gap:8px;margin-top:14px;font-size:12px;color:var(--text-secondary);cursor:pointer}
.osp-keep input{accent-color:var(--accent)}
.osp-foot{display:flex;justify-content:flex-end;margin-top:12px}
#osPrintFormat{width:auto;min-width:170px}
@media(max-width:420px){.osp-opts{grid-template-columns:1fr}}`;
    document.head.appendChild(css);

    function choose() {
        return new Promise(resolve => {
            let last = 'thermal'; try { last = localStorage.getItem(KEY + '_last') || 'thermal'; } catch (e) { }
            const bg = document.createElement('div'); bg.className = 'osp-bg';
            bg.innerHTML = `<div class="osp-box" role="dialog" aria-label="Formato de impressão"><h3><i class="fas fa-print" style="color:var(--accent);margin-right:6px"></i>Imprimir ordem de serviço</h3><p>Escolha onde vai imprimir.</p>
<div class="osp-opts"><button type="button" class="osp-opt${last === 'thermal' ? ' last' : ''}" data-f="thermal"><span class="ic"><i class="fas fa-receipt"></i></span><b>Impressora térmica</b><small>Cupom 80 mm</small></button>
<button type="button" class="osp-opt${last === 'a4' ? ' last' : ''}" data-f="a4"><span class="ic"><i class="fas fa-file-lines"></i></span><b>Folha A4</b><small>Impressora comum ou PDF</small></button>${window.OSB && OSB.printBench ? '<button type="button" class="osp-opt osp-opt-bench" data-f="bench"><span class="ic"><i class="fas fa-key"></i></span><span><b>Via da bancada</b><small>Térmica, com a senha do aparelho, para o técnico (não vai para o cliente)</small></span></button>' : ''}</div>
<label class="osp-keep"><input type="checkbox" id="ospKeep"> Usar sempre esta opção neste computador</label>
<div class="osp-foot"><button type="button" class="btn btn-secondary" data-f="">Cancelar</button></div></div>`;
            const done = f => {
                bg.remove(); document.removeEventListener('keydown', onKey);
                if (f && f !== 'bench') { try { localStorage.setItem(KEY + '_last', f); } catch (e) { } if (bg.querySelector('#ospKeep').checked) setFmt(f); }
                resolve(f || null);
            };
            const onKey = e => { if (e.key === 'Escape') done(null); };
            bg.addEventListener('click', e => { if (e.target === bg) return done(null); const b = e.target.closest('[data-f]'); if (b) done(b.dataset.f); });
            document.addEventListener('keydown', onKey);
            document.body.appendChild(bg);
            setTimeout(() => bg.querySelector(`.osp-opt[data-f="${last}"]`)?.focus(), 30);
        });
    }

    async function company() {
        const c = { name: 'DistribuiPRO', legalName: '', cnpj: '', phone: '', whatsapp: '', email: '', address: '', logoUrl: '' };
        try {
            const snap = await db.collection('settings').doc('general').get(); const d = snap.exists ? (snap.data() || {}) : {};
            const isDemo = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
            const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
            c.name = isDemo ? (brand.companyName || d.nomeFantasia || d.razaoSocial || 'DistribuiPRO') : (d.nomeFantasia || brand.companyName || d.razaoSocial || 'DistribuiPRO');
            c.legalName = d.razaoSocial || ''; c.cnpj = d.cnpj || ''; c.phone = d.telefone || ''; c.whatsapp = d.whatsapp || ''; c.email = d.email || '';
            const rua = [d.logradouro, d.numero].filter(Boolean).join(', '); const cidadeUf = [d.cidade, d.uf].filter(Boolean).join(' - ');
            c.address = [rua, [d.bairro, cidadeUf, d.cep ? 'CEP ' + d.cep : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' · ');
            const custom = isDemo ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || '');
            try { c.logoUrl = custom || new URL('assets/brand/distribuipro-mark.svg?v=41.5-logo', location.href).href; } catch (e) { c.logoUrl = custom; }
        } catch (e) { }
        return c;
    }

    async function printA4(id) {
        const o = (typeof serviceOrders !== 'undefined' ? serviceOrders : []).find(x => x.id === id); if (!o) return;
        const cu = (typeof osCustomers !== 'undefined' ? osCustomers : []).find(c => c.id === o.customerId) || {};
        const phone = cu.phone || cu.telefone || cu.whatsapp || cu.celular || '';
        const addr = ((x) => { const st = x.street ? [x.street, x.number, x.complement].filter(Boolean).join(', ') : (x.address || ''); const low = String(st).toLowerCase(); const nb = x.neighborhood || x.bairro || '', cy = x.city || x.cidade || '', uf = x.state || x.uf || ''; return [st, nb && !low.includes(String(nb).toLowerCase()) ? nb : '', cy && !low.includes(String(cy).toLowerCase()) ? cy + (uf ? '/' + uf : '') : ''].filter(Boolean).join(', '); })(cu); /* 39.0 · com bairro e cidade */
        const st = (typeof OS_STATUS !== 'undefined' && OS_STATUS[o.status]?.[0]) || o.status || '—';
        const parts = typeof osPaymentPartsText === 'function' ? osPaymentPartsText(o, true) : '';
        const pay = o.paymentStatus === 'paid' ? parts : o.paymentStatus === 'partial_receivable' ? 'Parcial / a receber · ' + parts : o.paymentStatus === 'receivable' ? 'A receber · ' + parts : o.paymentStatus === 'reversed' ? 'Estornado' : o.paymentStatus === 'no_charge' ? 'Sem cobrança (devolvido sem reparo)' : 'Pendente';
        const ret = o.status === 'returned'; // 39.14.5 · devolvido sem reparo: serviço só orçado, sem garantia e sem cobrança
        const co = await company();
        const w = window.open('', '_blank', 'width=900,height=1000');
        if (!w) { window.Toast?.warning?.('Libere as janelas pop-up para imprimir'); return; }
        const num = String(o.orderNumber || 0).padStart(4, '0');
        const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp, co.email].filter(Boolean).map(esc).join(' · ');
        const field = (l, v) => v ? `<div><div class="l">${esc(l)}</div><div class="v">${esc(v)}</div></div>` : '';
        const block = (l, v) => v && String(v).trim() ? `<div class="blk"><div class="bt">${esc(l)}</div><div class="bv">${esc(v)}</div></div>` : '';
        const device = [o.deviceType, o.brand, o.model].filter(Boolean).join(' · ');
        const T = k => (window.DPTerm ? DPTerm(k, o) : k); // 38.1 · OS de veículo: Veículo, Chassi, Placa
        const ident = [o.imei && T('IMEI') + ': ' + o.imei, o.serial && T('Série') + ': ' + o.serial].filter(Boolean).join(' · ');
        // 36.7 · Mesmo visual do orçamento em A4 (fonte Inter, barra roxa, caixa do cliente, tabela zebrada, totais e assinaturas)
        const cond = (l, v) => v && String(v).trim() ? `<div><b>${esc(l)}</b>${esc(v)}</div>` : '';
        const warrantyTxt = Number(o.warrantyDays || 0) > 0 && !ret ?`${Number(o.warrantyDays)} dias${o.deliveredAt ? ' a partir de ' + esc(fdate(o.deliveredAt)) : ' a partir da entrega'}` : '';
        const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OS #${num} - ${esc(o.customerName || '')}</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:12px;background:#f1f5f9}
.page{max-width:210mm;margin:0 auto;background:#fff;padding:14mm 13mm;min-height:297mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:12px}
.co{display:flex;gap:12px;align-items:center}.co img{max-height:58px;max-width:150px;object-fit:contain}.co h1{margin:0;font-size:19px}.co p{margin:2px 0 0;color:#475569;font-size:10.5px;line-height:1.45}
.doc{text-align:right;white-space:nowrap}.doc .t{font-size:11px;letter-spacing:2px;color:#4f46e5;font-weight:800}.doc .n{font-size:24px;font-weight:900}.doc p{margin:2px 0;color:#475569;font-size:10.5px}
.st{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:#eef2ff;color:#4338ca;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.box{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px 18px;break-inside:avoid}.box h3{grid-column:1/-1;margin:0 0 1px;font-size:9.5px;letter-spacing:1.2px;color:#4f46e5;text-transform:uppercase}
.box .l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}.box .v{font-size:12.5px;font-weight:600;overflow-wrap:anywhere}.box .full{grid-column:1/-1}
.cond{margin-top:14px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cond div{border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;white-space:pre-wrap;line-height:1.45;break-inside:avoid}.cond b{display:block;font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px;white-space:normal}.cond .full{grid-column:1/-1}
table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#f8fafc;color:#475569;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:8px;border-bottom:2px solid #e2e8f0}
td{padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top}td.r,th.r{text-align:right;white-space:nowrap}td small{color:#64748b;display:block;font-size:10px}tr:nth-child(even) td{background:#fcfdff}tr{break-inside:avoid}
.sum{display:flex;justify-content:flex-end;margin-top:12px}.sum table{width:280px;margin:0}.sum td{border:0;padding:4px 8px}.sum .g td{font-size:17px;font-weight:900;border-top:2px solid #0f172a;padding-top:8px;color:#4f46e5}
.cancel{margin-top:12px;border:2px dashed #ef4444;color:#b91c1c;border-radius:10px;padding:10px 12px;font-weight:700}
.sign{display:flex;gap:40px;margin-top:46px}.sign div{flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:5px;font-size:10.5px;color:#475569}
.osx-pqr{border:0!important;margin-top:16px!important}.osx-pqr svg{width:28mm!important;height:28mm!important}
.ft{margin-top:16px;text-align:center;color:#94a3b8;font-size:9.5px}.end{break-inside:avoid;page-break-inside:avoid}.bar{position:sticky;top:0;background:#0f172a;padding:10px;text-align:center}.bar button{font:700 13px Arial;padding:9px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{padding:0;min-height:0}.bar{display:none}}
</style></head><body><div class="bar"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div><div class="page">
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${co.legalName && co.legalName !== co.name ? esc(co.legalName) + '<br>' : ''}${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">ORDEM DE SERVIÇO</div><div class="n">Nº ${num}</div><p>Abertura: ${esc(fdate(o.createdAt, true))}</p>${o.estimatedDate ? `<p>Previsão: <b>${esc(fdate(o.estimatedDate))}</b></p>` : ''}<span class="st">${esc(st)}</span></div></div>
<div class="box"><h3>Cliente</h3>${field('Cliente', o.customerName || 'Cliente')}${field('Telefone', phone)}${field('CPF / CNPJ', cu.document || cu.cpf || cu.cnpj)}${field('E-mail', cu.email)}${addr ? `<div class="full"><div class="l">Endereço</div><div class="v">${esc(addr)}</div></div>` : ''}${field('Técnico responsável', o.technicianName)}</div>
<div class="box"><h3>${esc(T('Equipamento'))}</h3>${field(T('Equipamento'), device || '—')}${field(T('IMEI / Série'), ident)}${field('KM na entrada', Number(o.kmIn) > 0 ? Number(o.kmIn).toLocaleString('pt-BR') + ' km' : '')}${field('Combustível na entrada', o.fuelIn)}${field('Acessórios recebidos', o.accessories)}${o.entryCondition ? `<div class="full"><div class="l">Condição na entrada</div><div class="v">${esc(o.entryCondition)}</div></div>` : ''}</div>
${[o.problemReported, o.diagnosis, o.serviceDescription, o.partsDescription].some(x => x && String(x).trim()) ? `<div class="cond">${cond('Problema relatado', o.problemReported)}${cond('Diagnóstico técnico', o.diagnosis)}${cond(ret ? 'Serviço orçado (não executado)' : 'Serviço a realizar / realizado', o.serviceDescription)}${cond('Peças / itens utilizados', o.partsDescription)}</div>` : ''}
${Array.isArray(o.items) && o.items.length ? `<table><thead><tr><th style="width:34px">#</th><th>Descrição</th><th>Tipo</th><th class="r">Qtd</th><th class="r">Valor unit.</th><th class="r">Total</th></tr></thead><tbody>${o.items.map((i, k) => `<tr><td>${k + 1}</td><td><b>${esc(i.name)}</b></td><td>${i.kind === 'service' ? 'Serviço' : 'Peça'}</td><td class="r">${(Number(i.qty) || 1).toLocaleString('pt-BR', { maximumFractionDigits: 3 })}</td><td class="r">${money(i.price)}</td><td class="r"><b>${money((Number(i.qty) || 1) * (Number(i.price) || 0))}</b></td></tr>`).join('')}</tbody></table>` : ''}
<div class="sum"><table>${Number(o.partsValue || 0) > 0 ? `<tr><td>Peças</td><td class="r">${money(o.partsValue)}</td></tr>` : ''}${Number(o.laborValue || 0) > 0 ? `<tr><td>Mão de obra</td><td class="r">${money(o.laborValue)}</td></tr>` : ''}${Number(o.discount || 0) > 0 ? `<tr><td>Desconto</td><td class="r">- ${money(o.discount)}</td></tr>` : ''}<tr class="g"><td>${ret ? 'ORÇADO (não cobrado)' : 'TOTAL'}</td><td class="r">${money(o.total)}</td></tr></table></div>
<div class="cond"><div><b>Pagamento</b>${esc(pay && String(pay).trim() ? pay : (o.paymentStatus === 'paid' ? 'Pago' : 'Pendente'))}</div>${warrantyTxt ? `<div><b>Garantia do serviço</b>${esc(warrantyTxt)}</div>` : ''}${o.notes ? `<div class="full"><b>Observações</b>${esc(o.notes)}</div>` : ''}</div>
${o.status === 'cancelled' ? `<div class="cancel">OS CANCELADA — ${esc(o.cancelReason || 'Sem motivo informado')}</div>` : ''}
${ret ? `<div class="cancel" style="border-color:#64748b;color:#334155">DEVOLVIDO AO CLIENTE SEM REPARO${o.returnReasonText ? ' — ' + esc(o.returnReasonText) : ''}${o.returnedAt ? ' · ' + esc(fdate(o.returnedAt, true)) : ''}${o.returnNotes ? '<br><span style="font-weight:500">' + esc(o.returnNotes) + '</span>' : ''}</div>` : ''}
<div class="end"><div class="sign"><div>Assinatura do cliente — ${esc(o.customerName || 'Cliente')}</div><div>Responsável técnico — ${esc(co.name)}</div></div>
<div class="ft">${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}${co.address ? ' · ' + esc(co.address) : ''} · Agradecemos a preferência.</div></div>
</div></body></html>`;
        w.document.write(html); w.document.close(); w.focus();
    }

    const orig = window.printServiceOrder;
    window.printServiceOrder = async function (id) {
        let fmt = getFmt();
        if (fmt !== 'thermal' && fmt !== 'a4') fmt = await choose(); // 39.5 · a senha do aparelho sai sempre (os-bancada-v1.js › injectPrint)
        if (!fmt) return;
        if (fmt === 'bench') return window.OSB && OSB.printBench(id); // 38.4 · via da bancada (os-bancada-v1.js)
        if (fmt === 'a4') return printA4(id);
        return orig.apply(this, arguments);
    };
    window.printServiceOrderA4 = printA4;

    // Barra da tela de OS: formato fixo ou perguntar sempre
    function toolbar() {
        const filter = document.getElementById('osStatusFilter');
        if (!filter || document.getElementById('osPrintFormat')) return;
        const sel = document.createElement('select');
        sel.id = 'osPrintFormat'; sel.className = 'form-control'; sel.title = 'Formato da impressão da OS';
        sel.innerHTML = '<option value="ask">Imprimir: perguntar</option><option value="thermal">Imprimir: térmica 80 mm</option><option value="a4">Imprimir: folha A4</option>';
        sel.value = getFmt();
        sel.addEventListener('change', () => setFmt(sel.value));
        filter.insertAdjacentElement('afterend', sel);
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', toolbar); else toolbar();
})();
