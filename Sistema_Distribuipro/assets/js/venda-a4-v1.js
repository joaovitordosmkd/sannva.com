/* DistribuiPro 37.0 · Comprovante da venda em folha A4 (mesmo modelo visual do orçamento)
   Só aparece quando Configurações › Impressão › "Comprovante da venda também em folha A4" está ligado
   (settings/general.vendaA4). A impressão térmica (cupom 80 mm) continua igual.
   Usado no PDV (depois da venda) e em Pedidos (Reimprimir). Funciona nas 5 versões. */
(function () {
    'use strict';
    if (window.DPSaleA4) return;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qty = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || v.value || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const PAY = { dinheiro: 'Dinheiro', pix: 'PIX', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado / a receber', multi: 'Múltiplo', sinal: 'Sinal da OS (pago antes)' };
    const BRAND = { visa: 'Visa', mastercard: 'Mastercard', elo: 'Elo', amex: 'Amex', hipercard: 'Hipercard', outras: 'Outras' };
    const TYPE = { balcao: 'Balcão', pickup: 'Retirada', delivery: 'Entrega' };

    let settingsCache = null, settingsAt = 0;
    async function settings() {
        if (settingsCache && Date.now() - settingsAt < 15000) return settingsCache;
        try { const s = await db.collection('settings').doc('general').get(); settingsCache = s.exists ? (s.data() || {}) : {}; } catch (e) { settingsCache = settingsCache || {}; }
        settingsAt = Date.now(); return settingsCache;
    }
    async function enabled() { const s = await settings(); return s.vendaA4 === true || s.vendaA4 === 'true'; }
    async function company() {
        const d = await settings();
        const isDemo = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
        const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
        const rua = [d.logradouro, d.numero].filter(Boolean).join(', '), cidadeUf = [d.cidade, d.uf].filter(Boolean).join(' - ');
        return {
            name: isDemo ? (brand.companyName || d.nomeFantasia || d.razaoSocial || 'DistribuiPRO') : (d.nomeFantasia || brand.companyName || d.razaoSocial || 'Minha Empresa'),
            legalName: d.razaoSocial || '', cnpj: d.cnpj || '', phone: d.telefone || '', whatsapp: d.whatsapp || '', email: d.email || '',
            address: [rua, [d.bairro, cidadeUf, d.cep ? 'CEP ' + d.cep : ''].filter(Boolean).join(' · ')].filter(Boolean).join(' · '),
            logoUrl: isDemo ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || ''),
            footer: d.rodapeComprovante || 'Obrigado pela preferência!'
        };
    }
    async function customerOf(sale) {
        const c = { phone: sale.customerPhone || '', doc: sale.customerCpfCnpj || sale.customerDoc || '', address: '' };
        if (sale.customerId) {
            try { const d = await db.collection('customers').doc(sale.customerId).get(); if (d.exists) { const x = d.data() || {}; c.phone = c.phone || x.whatsapp || x.phone || x.telefone || ''; c.doc = c.doc || x.document || x.cpf || x.cnpj || ''; c.address = ((x) => { const st = x.street ? [x.street, x.number, x.complement].filter(Boolean).join(', ') : (x.address || ''); const low = String(st).toLowerCase(); const nb = x.neighborhood || x.bairro || '', cy = x.city || x.cidade || '', uf = x.state || x.uf || ''; return [st, nb && !low.includes(String(nb).toLowerCase()) ? nb : '', cy && !low.includes(String(cy).toLowerCase()) ? cy + (uf ? '/' + uf : '') : ''].filter(Boolean).join(', '); })(x); /* 39.0 · com bairro e cidade */ } } catch (e) { }
        }
        return c;
    }
    function payLines(sale) {
        const pays = Array.isArray(sale.payments) && sale.payments.length ? sale.payments : [{ method: sale.paymentMethod || 'dinheiro', amount: sale.total }];
        return pays.map(p => {
            let t = PAY[p.method] || p.method || '—';
            if ((p.method === 'credito' || p.method === 'debito') && p.cardBrand) t += ' ' + (BRAND[p.cardBrand] || p.cardBrand);
            if (p.method === 'credito' && Number(p.installments) > 1) t += ` em ${p.installments}x`;
            if (p.method === 'fiado' && p.dueDate) t += ` · vence ${String(p.dueDate).slice(0, 10).split('-').reverse().join('/')}`;
            return { label: t, amount: Number(p.amount) || 0, change: p.method === 'dinheiro' && Number(p.changeValue) > 0 ? Number(p.changeValue) : 0, received: p.method === 'dinheiro' ? Number(p.cashReceived) || 0 : 0 };
        });
    }

    async function print(sale) {
        if (!sale) return;
        const w = window.open('', '_blank', 'width=900,height=1000');
        if (!w) { try { Toast.warning('Libere as janelas pop-up para imprimir'); } catch (e) { } return; }
        try { w.document.write('<p style="font-family:sans-serif;padding:20px">Preparando o comprovante...</p>'); } catch (e) { }
        const [co, cu] = await Promise.all([company(), customerOf(sale)]);
        const num = String(sale.saleNumber || 0).padStart(6, '0');
        const when = toDate(sale.createdAt) || new Date();
        const items = Array.isArray(sale.items) ? sale.items : [];
        const subtotal = Number(sale.subtotal) || items.reduce((a, i) => a + (Number(i.total) || 0), 0);
        const pays = payLines(sale);
        const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp, co.email].filter(Boolean).map(esc).join(' · ');
        const cancelled = sale.status === 'cancelled';
        const stLabel = cancelled ? 'CANCELADA' : ({ delivered: 'ENTREGUE', completed: 'CONCLUÍDA', delivering: 'EM ROTA', new: 'NOVA' }[sale.status] || 'CONCLUÍDA');
        const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Venda ${num} - ${esc(sale.customerName || 'Consumidor Final')}</title><style>
@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:12px;background:#f1f5f9}
.page{max-width:210mm;margin:0 auto;background:#fff;padding:14mm 13mm;min-height:297mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:12px}
.co{display:flex;gap:12px;align-items:center}.co img{max-height:58px;max-width:150px;object-fit:contain}.co h1{margin:0;font-size:19px}.co p{margin:2px 0 0;color:#475569;font-size:10.5px;line-height:1.45}
.doc{text-align:right;white-space:nowrap}.doc .t{font-size:11px;letter-spacing:2px;color:#4f46e5;font-weight:800}.doc .n{font-size:24px;font-weight:900}.doc p{margin:2px 0;color:#475569;font-size:10.5px}
.st{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:#eef2ff;color:#4338ca;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px}.st.x{background:#fee2e2;color:#b91c1c}
.box{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:4px 18px}
.box .l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}.box .v{font-size:12.5px;font-weight:600}.box .full{grid-column:1/-1}
table{width:100%;border-collapse:collapse;margin-top:14px}th{background:#f8fafc;color:#475569;font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;padding:8px;border-bottom:2px solid #e2e8f0}
td{padding:8px;border-bottom:1px solid #eef2f7;vertical-align:top}td.r,th.r{text-align:right;white-space:nowrap}td small{color:#64748b;display:block;font-size:10px}tr:nth-child(even) td{background:#fcfdff}tr{break-inside:avoid}
.sum{display:flex;justify-content:flex-end;margin-top:12px}.sum table{width:280px;margin:0}.sum td{border:0;padding:4px 8px}.sum .g td{font-size:17px;font-weight:900;border-top:2px solid #0f172a;padding-top:8px;color:#4f46e5}
.cond{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:10px}.cond div{border:1px solid #e2e8f0;border-radius:10px;padding:9px 11px;line-height:1.5}.cond b{display:block;font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:3px}.cond .full{grid-column:1/-1;white-space:pre-wrap}
.cancel{margin-top:12px;border:2px dashed #ef4444;color:#b91c1c;border-radius:10px;padding:10px 12px;font-weight:700}
.sign{display:flex;gap:40px;margin-top:46px}.sign div{flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:5px;font-size:10.5px;color:#475569}
.ft{margin-top:16px;text-align:center;color:#94a3b8;font-size:9.5px}.end{break-inside:avoid;page-break-inside:avoid}.bar{position:sticky;top:0;background:#0f172a;padding:10px;text-align:center}.bar button{font:700 13px Arial;padding:9px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;cursor:pointer;margin:0 4px}
@media print{body{background:#fff}.page{padding:0;min-height:0}.bar{display:none}}
</style></head><body><div class="bar"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div><div class="page">
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${co.legalName && co.legalName !== co.name ? esc(co.legalName) + '<br>' : ''}${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">COMPROVANTE DE VENDA</div><div class="n">Nº ${num}</div><p>Emitido em ${when.toLocaleDateString('pt-BR')} às ${when.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</p><p>${esc(TYPE[sale.type] || 'Balcão')}</p><span class="st${cancelled ? ' x' : ''}">${stLabel}</span></div></div>
<div class="box"><div><div class="l">Cliente</div><div class="v">${esc(sale.customerName || 'Consumidor Final')}</div></div><div><div class="l">Telefone</div><div class="v">${esc(cu.phone || '—')}</div></div>
${cu.doc ? `<div><div class="l">CPF / CNPJ</div><div class="v">${esc(cu.doc)}</div></div>` : ''}${sale.sellerName || sale.operatorName ? `<div><div class="l">Vendedor</div><div class="v">${esc(sale.sellerName || sale.operatorName)}</div></div>` : ''}
${sale.address ? `<div class="full"><div class="l">Endereço de entrega</div><div class="v">${esc(sale.address)}${sale.addressRef ? ' · ' + esc(sale.addressRef) : ''}</div></div>` : (cu.address ? `<div class="full"><div class="l">Endereço</div><div class="v">${esc(cu.address)}</div></div>` : '')}</div>
<table><thead><tr><th style="width:34px">#</th><th>Descrição</th><th class="r">Qtd</th><th>Un</th><th class="r">Valor unit.</th><th class="r">Desconto</th><th class="r">Total</th></tr></thead><tbody>
${items.map((i, k) => `<tr><td>${k + 1}</td><td><b>${esc(i.productName)}</b>${i.productCode ? `<small>Cód.: ${esc(i.productCode)}</small>` : ''}${i.notes ? `<small>IMEI / Série / Obs.: ${esc(i.notes)}</small>` : ''}</td><td class="r">${qty(i.quantity)}</td><td>${esc(String(i.unit || (i.isService ? 'SERV' : 'UN')).toUpperCase())}</td><td class="r">${money(i.unitPrice)}</td><td class="r">${Number(i.discount) ? money(i.discount) : '—'}</td><td class="r"><b>${money(i.total)}</b></td></tr>`).join('')}
</tbody></table>
<div class="sum"><table><tr><td>Subtotal</td><td class="r">${money(subtotal)}</td></tr>${Number(sale.discount) ? `<tr><td>Desconto</td><td class="r">- ${money(sale.discount)}</td></tr>` : ''}${Number(sale.deliveryFee) ? `<tr><td>Taxa de entrega</td><td class="r">${money(sale.deliveryFee)}</td></tr>` : ''}${Number(sale.cardSurcharge) ? `<tr><td>Acréscimo cartão</td><td class="r">${money(sale.cardSurcharge)}</td></tr>` : ''}<tr class="g"><td>TOTAL</td><td class="r">${money(sale.total)}</td></tr></table></div>
<div class="cond"><div><b>Forma de pagamento</b>${pays.map(p => `${esc(p.label)}${pays.length > 1 ? ' — ' + money(p.amount) : ''}${p.received ? `<br><span style="color:#64748b">Recebido ${money(p.received)}${p.change ? ' · troco ' + money(p.change) : ''}</span>` : ''}`).join('<br>')}</div><div><b>Itens</b>${items.length} item(ns) · ${qty(items.reduce((a, i) => a + (Number(i.quantity) || 0), 0))} unidade(s)</div>${sale.notes ? `<div class="full"><b>Observações</b>${esc(sale.notes)}</div>` : ''}</div>
${cancelled ? `<div class="cancel">VENDA CANCELADA${sale.cancelReason ? ' — ' + esc(sale.cancelReason) : ''}</div>` : ''}
<div class="end"><div class="sign"><div>${esc(co.name)}</div><div>Recebido por — ${esc(sale.customerName || 'Cliente')}</div></div>
<div class="ft">${esc(co.footer)} · Documento sem valor fiscal. ${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}</div></div>
</div></body></html>`;
        w.document.open(); w.document.write(html); w.document.close(); try { w.focus(); } catch (e) { }
    }
    window.DPSaleA4 = { enabled, print, refresh() { settingsCache = null; } };
})();
