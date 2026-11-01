/* DistribuiPro 38.5 · IMEI / nº de série por unidade (todas as versões).
   Para quem vende aparelho (loja de celular, informática, autopeças com série): cada unidade tem o seu número.
   - Produto: "Controlar IMEI / nº de série por unidade" (products.serialControl), tipo do número (serialKind 'imei'|'serial')
     e a garantia da loja na venda (saleWarrantyDays, padrão 90 dias).
   - Unidades em product_serials {productId, productName, kind, code, imei, imei2, serial, status:'in_stock'|'sold'|'returned'|'removed',
     costPrice, entryType, entryRef, purchaseId, supplierName, depositId, saleId, saleNumber, customerId, customerName, sellerName,
     soldAtMs, soldPrice, warrantyDays, warrantyUntilMs, history[], createdAtMs}. O estoque total continua em products.currentStock.
   - Entrada: Compras › Receber (pedirSeriais + seriaisDaCompra), entrada rápida em Produtos e ajuste de entrada no Estoque pedem os
     números, um por linha (IMEI conferido pelo dígito verificador, o mesmo do usados-v1.js; quantidade e repetidos conferidos).
     Saída/perda no Estoque pede quais unidades saíram. Produtos › editar › "Ver aparelhos": lista, corrige e informa o estoque antigo.
   - PDV: bipar o IMEI acha a unidade (window.dpSerialScan, chamado pelo pdv-pro-v1.js); tocar no produto abre a escolha do aparelho.
     Cada aparelho é uma linha do carrinho. O item da venda leva serials/serialIds (DPSerial.saleFields, gancho no pdv.html) e o número
     sai no cupom e na A4 junto com a garantia (nas observações do item). Ao concluir, a unidade vira 'sold'.
   - Cancelar ou editar a venda (vendas-editar-v1.js) e a troca/devolução (trocas-v1.js) devolvem a unidade ao estoque
     (devolução com defeito, sem voltar ao estoque: 'returned'). Cancelar a compra com devolução ao fornecedor: 'removed'.
   - Garantias: a busca por IMEI, CPF, telefone ou nome também acha o aparelho vendido ("vendido em dd/mm, garantia até X"),
     com certificado e "Abrir OS de garantia" já preenchida (ganchos no garantias-v1.js). */
(function () {
    'use strict';
    if (window.DPSerial) return;
    const COL = 'product_serials';
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => Number(v) || 0;
    const r2 = v => Math.round(num(v) * 100) / 100;
    const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const digits = s => String(s ?? '').replace(/\D/g, '');
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const codeKey = s => String(s || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const plural = (n, a, b) => (Number(n) === 1 ? a : b);
    const saleNo = n => '#V-' + String(n || 0).padStart(4, '0');
    const osNo = n => '#OS-' + String(n || 0).padStart(4, '0');
    const brD = ms => ms ? new Date(ms).toLocaleDateString('pt-BR') : '—';
    const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador'; } catch (e) { return 'Operador'; } };
    const DOC = () => { try { return db.__isLocalDemo ? 'demo_general' : 'general'; } catch (e) { return 'general'; } };
    const getCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
    const getProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
    const depHere = () => { try { return window.DPDepositos && DPDepositos.list().length > 1 ? DPDepositos.here() : 'principal'; } catch (e) { return 'principal'; } };

    // Dígito verificador do IMEI (Luhn) — o mesmo do usados-v1.js
    function imeiOk(v) { const d = digits(v); if (d.length !== 15) return false; let s = 0; for (let i = 0; i < 15; i++) { let n = +d[i]; if (i % 2 === 1) { n *= 2; if (n > 9) n -= 9; } s += n; } return s % 10 === 0; }

    /* =================== Produto: tipo do número e garantia =================== */
    const segment = () => { try { return window.DPTerm && DPTerm.segment ? (DPTerm.segment() || '') : ''; } catch (e) { return ''; } };
    const isSerial = p => !!(p && p.serialControl === true);
    function kindOf(p) {
        if (p && (p.serialKind === 'imei' || p.serialKind === 'serial')) return p.serialKind;
        if (/celular|smartphone|iphone|tablet|ipad|seminovo/.test(norm([p && p.category, p && p.name].join(' ')))) return 'imei';
        return segment() === 'celular' ? 'imei' : 'serial';
    }
    const KL = {
        imei: { one: 'IMEI', many: 'IMEIs', title: 'IMEI', ph: 'Cole ou bipe um IMEI por linha.\nAparelho de 2 chips: os 2 IMEIs na mesma linha.\nEx.: 356938035643809' },
        serial: { one: 'nº de série', many: 'números de série', title: 'Nº de série', ph: 'Cole ou bipe um número de série por linha.\nEx.: SN4F7K29Q' }
    };
    const kl = k => KL[k] || KL.imei;
    const warrantyOf = p => { const d = p && p.saleWarrantyDays; return d === undefined || d === null || d === '' ? 90 : Math.max(0, Math.min(3650, Math.round(num(d)))); };
    const untilOf = (from, days) => { const d = new Date(from); d.setHours(23, 59, 59, 0); return d.getTime() + days * 864e5; };
    const ST = { in_stock: ['No estoque', 'ok'], sold: ['Vendido', 'sold'], returned: ['Devolvido com defeito', 'warn'], removed: ['Fora do estoque', 'off'] };
    const stTxt = s => (ST[s] || [s || '—'])[0];
    const codeOf = u => u.imei || u.serial || u.code || '';
    const numTxt = u => (u.kind === 'serial' ? 'Série ' : 'IMEI ') + codeOf(u) + (u.imei2 ? ' / ' + u.imei2 : '');
    function wState(u) {
        if (!u || u.status !== 'sold') return { state: 'none', label: stTxt(u && u.status) };
        const until = num(u.warrantyUntilMs);
        if (!num(u.warrantyDays) || !until) return { state: 'none', label: 'Sem garantia da loja' };
        const day0 = ms => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };
        return Date.now() <= until ? { state: 'valid', label: 'Na garantia', until, left: Math.max(0, Math.round((day0(until) - day0(Date.now())) / 864e5)) } : { state: 'expired', label: 'Garantia vencida', until };
    }

    /* =================== Lista colada: um número por linha =================== */
    function parseList(text, kind) {
        const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
        const units = [], errors = [], seen = {};
        lines.forEach((raw, i) => {
            const n = i + 1;
            if (kind === 'imei') {
                const d = digits(raw.replace(/imei\s*[12]?\s*[:=#-]?/gi, ' '));
                let list = d.length === 15 ? [d] : d.length === 30 ? [d.slice(0, 15), d.slice(15)] : null;
                if (!list) { errors.push({ n, msg: d.length ? `tem ${d.length} dígitos (o IMEI tem 15)` : 'não tem número' }); return; }
                const bad = list.find(x => !imeiOk(x));
                if (bad) { errors.push({ n, msg: `o IMEI ${bad} não confere (dígito final errado: confira com *#06# no aparelho)` }); return; }
                if (list[1] === list[0]) list = [list[0]];
                const dup = list.find(x => seen[x]);
                if (dup) { errors.push({ n, msg: `${dup} repetido (já está na linha ${seen[dup]})` }); return; }
                list.forEach(x => { seen[x] = n; });
                units.push({ kind, code: list[0], imei: list[0], imei2: list[1] || '', serial: '', line: n });
            } else {
                const s = raw.toUpperCase().replace(/\s+/g, '').slice(0, 40), key = codeKey(s);
                if (key.length < 3) { errors.push({ n, msg: 'número muito curto' }); return; }
                if (seen[key]) { errors.push({ n, msg: `${s} repetido (já está na linha ${seen[key]})` }); return; }
                seen[key] = n;
                units.push({ kind, code: key, imei: '', imei2: '', serial: s, line: n });
            }
        });
        return { units, errors, lines: lines.length };
    }

    /* =================== Cadastro das unidades =================== */
    async function lookup(code) {
        const out = [], seen = new Set();
        for (const f of ['code', 'imei2']) {
            try { docsOf(await db.collection(COL).where(f, '==', code).get()).forEach(u => { if (!u.deleted && !seen.has(u.id)) { seen.add(u.id); out.push(u); } }); } catch (e) { }
        }
        return out;
    }
    // No estoque = erro (número repetido); já vendido ou fora do estoque = só um aviso (o aparelho pode voltar para a loja)
    async function conferir(units, ignoreId) {
        const errors = [], warns = [];
        await Promise.all(units.map(async u => {
            for (const k of [u.code, u.imei2].filter(Boolean)) {
                const found = (await lookup(k)).filter(x => x.id !== ignoreId);
                const live = found.find(x => x.status === 'in_stock');
                if (live) { errors.push({ n: u.line, msg: `${k} já está no estoque (${live.productName || 'outro produto'})` }); return; }
                const old = found.sort((a, b) => num(b.soldAtMs || b.createdAtMs) - num(a.soldAtMs || a.createdAtMs))[0];
                if (old) warns.push({ n: u.line, msg: `${k} já passou pela loja: ${stTxt(old.status).toLowerCase()}${old.saleNumber ? ' na venda ' + saleNo(old.saleNumber) : ''}${old.soldAtMs ? ' em ' + brD(old.soldAtMs) : ''}` });
            }
        }));
        return { errors: errors.sort((a, b) => a.n - b.n), warns: warns.sort((a, b) => a.n - b.n) };
    }
    async function register(product, units, info) {
        info = info || {};
        const now = Date.now(), who = uname(), ids = [];
        for (const u of units) {
            const ref = await db.collection(COL).add({
                productId: product.id, productName: product.name || '', kind: u.kind || kindOf(product),
                code: u.code, imei: u.imei || '', imei2: u.imei2 || '', serial: u.serial || '', status: 'in_stock',
                costPrice: r2(info.costPrice !== undefined && info.costPrice !== null && info.costPrice !== '' ? info.costPrice : product.costPrice),
                entryType: info.type || 'entrada', entryRef: info.ref || '', purchaseId: info.purchaseId || '', supplierName: info.supplierName || '', depositId: depHere(),
                saleId: '', saleNumber: null, customerId: '', customerName: '', sellerName: '', soldAtMs: null, soldPrice: null, warrantyDays: null, warrantyUntilMs: null,
                history: [{ at: now, what: info.what || 'Entrada no estoque', by: who }],
                createdAtMs: now, createdAt: ts(), createdBy: uid(), createdByName: who, updatedAt: ts(), deleted: false
            });
            ids.push(ref.id);
        }
        return ids;
    }
    // Atualiza a unidade e guarda o que aconteceu no histórico dela (as 30 últimas)
    async function setUnit(id, patch, what) {
        const ref = db.collection(COL).doc(id); const d = await ref.get(); if (!d.exists) return null;
        const cur = d.data() || {}, h = Array.isArray(cur.history) ? cur.history.slice(-29) : [];
        if (what) h.push({ at: Date.now(), what, by: uname() });
        await ref.update({ ...patch, history: h, updatedAt: ts() });
        return { id, ...cur, ...patch, history: h };
    }
    const BACK = { status: 'in_stock', saleId: '', saleNumber: null, customerId: '', customerName: '', sellerName: '', soldAtMs: null, soldPrice: null, warrantyDays: null, warrantyUntilMs: null };

    // Entrada pelo StockService (Produtos › entrada rápida, Estoque › ajuste): os números ficam esperando a entrada daquele produto
    const pending = { in: {}, out: {} };
    function setPending(kind, pid, data) { pending[kind][pid] = { ...data, at: Date.now() }; }
    function takePending(kind, pid) { const p = pending[kind][pid]; if (!p) return null; delete pending[kind][pid]; return Date.now() - p.at < 120000 ? p : null; }
    function wrapStock() {
        if (typeof StockService === 'undefined' || !StockService || StockService.__dpSerial) return;
        const oe = StockService.entry, ox = StockService.exit;
        StockService.entry = async function (pid) {
            const r = await oe.apply(this, arguments);
            const pd = takePending('in', pid);
            if (pd) { try { await register(pd.product, pd.units, pd.info); toast('success', `${pd.units.length} ${plural(pd.units.length, kl(kindOf(pd.product)).one + ' registrado', kl(kindOf(pd.product)).many + ' registrados')}.`); } catch (e) { toast('warning', 'O estoque entrou, mas os números não foram gravados: ' + e.message); } }
            return r;
        };
        StockService.exit = async function (pid) {
            const r = await ox.apply(this, arguments);
            const pd = takePending('out', pid);
            if (pd) { for (const u of pd.units) { try { await setUnit(u.id, { status: 'removed', removedReason: pd.reason || '', removedAtMs: Date.now() }, pd.what || 'Saiu do estoque'); } catch (e) { console.warn('seriais (saída):', e); } } }
            return r;
        };
        StockService.__dpSerial = true;
    }
    try { wrapStock(); } catch (e) { }

    /* =================== Visual =================== */
    function css() {
        if ($('snCss')) return;
        const st = document.createElement('style'); st.id = 'snCss';
        st.textContent = `
.sn-ov .modal.sn-modal{max-width:620px;width:96%}.sn-ov .modal.sn-wide{max-width:860px}
.sn-h3{display:flex;align-items:center;gap:8px;min-width:0}.sn-h3 .t{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.sn-hic{display:inline-flex;color:var(--accent);flex:none}
.sn-note{margin:0 0 12px;font-size:13px;color:var(--text-secondary);line-height:1.5}
.sn-mono{font-family:var(--font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);letter-spacing:.02em}
.sn-item{border:1px solid var(--border-color);border-radius:12px;padding:12px;margin-bottom:10px;background:var(--bg-card)}
.sn-item-h{display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:8px;font-size:13px;color:var(--text-heading,var(--text-primary))}.sn-item-h span{color:var(--text-muted);font-size:12px}
textarea.sn-ta{display:block;width:100%;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Consolas,monospace);font-size:13px;line-height:1.55;resize:vertical;min-height:84px}
.sn-st{margin-top:6px;font-size:12px;color:var(--text-muted);display:flex;flex-direction:column;gap:2px;line-height:1.45}
.sn-st .ok{color:var(--success);font-weight:700}.sn-st .bad{color:var(--danger)}.sn-st .warn{color:var(--warning)}.sn-st b{font-weight:700}
.sn-st .row{display:inline-flex;align-items:center;gap:5px}.sn-st svg{width:13px;height:13px;flex:none}
.sn-db{margin-top:8px;padding:10px 12px;border-radius:10px;font-size:12.5px;line-height:1.5}.sn-db:empty{display:none}
.sn-db.bad{background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.3);color:var(--danger)}.sn-db.warn{background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);color:var(--text-primary)}
.sn-db ul{margin:4px 0 0;padding-left:18px}
.sn-chip{display:inline-flex;align-items:center;gap:5px;margin-top:3px;padding:1px 8px;border-radius:999px;background:rgba(99,102,241,.1);color:var(--accent);font-size:10.5px;font-weight:700;max-width:100%;overflow:hidden;white-space:nowrap}
.sn-chip span{overflow:hidden;text-overflow:ellipsis;font-family:var(--font-mono,ui-monospace,SFMono-Regular,Consolas,monospace)}.sn-chip svg{width:11px;height:11px;flex:none}
.sn-find{display:flex;align-items:center;gap:8px;padding:0 12px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input,var(--bg-card));margin-bottom:10px}
.sn-find svg{color:var(--text-muted);flex:none}.sn-find:focus-within{border-color:var(--accent)}
.sn-find input{flex:1;min-width:0;border:0!important;background:transparent!important;box-shadow:none!important;color:var(--text-primary);padding:11px 0!important;font-size:14px;outline:none;height:auto!important;border-radius:0!important}
.sn-list{display:flex;flex-direction:column;gap:6px;max-height:min(50vh,420px);overflow:auto;padding:1px}
.sn-row{display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid var(--border-color);border-radius:10px;cursor:pointer;background:var(--bg-card);transition:border-color .15s,background .15s}
.sn-row:hover{border-color:var(--accent)}.sn-row.on{border-color:var(--accent);background:rgba(99,102,241,.08)}
.sn-row input{width:18px;height:18px;accent-color:var(--accent);flex:none;margin:0}.sn-row div{min-width:0}
.sn-row b{display:block;font-size:14px;color:var(--text-heading,var(--text-primary));overflow-wrap:anywhere}.sn-row small{display:block;color:var(--text-muted);font-size:11.5px;margin-top:1px}
.sn-empty{padding:18px;text-align:center;color:var(--text-muted);font-size:13px;border:1px dashed var(--border-color);border-radius:10px;line-height:1.5}
.sn-loose{margin-top:10px;font-size:12px;color:var(--text-muted);line-height:1.5}
.sn-track{display:block;margin:12px 0;padding:12px 14px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-secondary)}
.sn-track-h{display:flex;gap:10px;align-items:flex-start;cursor:pointer;margin:0;font-weight:400}
.sn-track-h input{margin-top:3px;width:16px;height:16px;accent-color:var(--accent);flex:none}
.sn-track-ic{display:inline-grid;place-items:center;width:32px;height:32px;border-radius:9px;background:rgba(99,102,241,.12);color:var(--accent);flex:none;font-size:17px}
.sn-track-h b{display:block;font-size:13.5px;color:var(--text-heading,var(--text-primary))}.sn-track-h small{display:block;font-size:12px;color:var(--text-muted);line-height:1.45;margin-top:2px}
.sn-g2{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px}.sn-g2 .form-group{margin:0}
.sn-unit{display:flex;align-items:center;gap:6px}.sn-unit input{flex:1;min-width:0}.sn-unit span{color:var(--text-muted);font-size:12px}
.sn-info{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:10px;font-size:12.5px;color:var(--text-secondary)}.sn-info:empty{display:none}
.sn-entry{margin-top:12px;padding:12px;border-radius:10px;border:1px solid rgba(99,102,241,.25);background:rgba(99,102,241,.05)}
.sn-entry-h{display:flex;align-items:center;gap:6px;font-weight:700;font-size:12.5px;color:var(--text-heading,var(--text-primary));margin-bottom:8px}.sn-entry-h svg{color:var(--accent)}
.sn-entry .sn-list{max-height:220px}
.sn-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;font-size:11px;font-weight:700;white-space:nowrap}
.sn-pill.ok{background:rgba(16,185,129,.12);color:#059669}.sn-pill.sold{background:rgba(99,102,241,.12);color:var(--accent)}.sn-pill.warn{background:rgba(245,158,11,.14);color:#b45309}.sn-pill.off{background:var(--bg-secondary);color:var(--text-muted)}.sn-pill.bad{background:rgba(239,68,68,.12);color:#dc2626}
.sn-tabs{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}.sn-tabs button{border:1px solid var(--border-color);background:var(--bg-card);border-radius:999px;padding:5px 12px;font-size:12px;font-weight:600;cursor:pointer;color:var(--text-secondary)}.sn-tabs button.on{background:var(--accent);border-color:var(--accent);color:#fff}
.sn-tw{overflow-x:auto;border:1px solid var(--border-color);border-radius:10px}
.sn-t{width:100%;border-collapse:collapse;font-size:12.5px}.sn-t th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);text-align:left;padding:8px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap;background:var(--bg-secondary)}
.sn-t td{padding:8px 10px;border-bottom:1px solid var(--border-color);vertical-align:top}.sn-t tr:last-child td{border-bottom:0}.sn-t small{display:block;color:var(--text-muted);font-size:11px;margin-top:1px}
.sn-miss{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;padding:10px 12px;border-radius:10px;background:rgba(245,158,11,.1);border:1px solid rgba(245,158,11,.35);font-size:12.5px;margin-bottom:10px;color:var(--text-primary)}
.sn-sum{font-size:12.5px;color:var(--text-secondary);margin-bottom:10px}
.btn .dpi,.sn-btn svg{width:15px;height:15px}
.sn-tag{display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:700;color:var(--accent);background:rgba(99,102,241,.1);border-radius:999px;padding:1px 8px;margin-bottom:4px}.sn-tag svg{width:11px;height:11px}
.dpu-st.sn-stock{background:rgba(16,185,129,.12);color:#059669}
@media(max-width:640px){.sn-g2{grid-template-columns:1fr}.sn-hide-sm{display:none}.sn-ov .modal-footer{flex-wrap:wrap}.sn-ov .modal-footer .btn{flex:1 1 auto;justify-content:center}}`;
        (document.head || document.documentElement).appendChild(st);
    }
    function overlay(o) {
        css();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active sn-ov'; if (o.id) ov.id = o.id;
        ov.innerHTML = `<div class="modal sn-modal${o.wide ? ' sn-wide' : ''}" role="dialog" aria-modal="true"><div class="modal-header"><h3 class="sn-h3"><span class="sn-hic">${o.icon || ''}</span><span class="t">${esc(o.title)}</span></h3><button class="modal-close" type="button" data-x aria-label="Fechar">${ic('x', 'times')}</button></div><div class="modal-body">${o.body || ''}</div><div class="modal-footer">${o.foot || ''}</div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener('keydown', e => { if (e.key === 'Escape') { const x = ov.querySelector('[data-x]'); if (x) { e.stopPropagation(); x.click(); } } });
        return ov;
    }
    // Situação da lista colada (embaixo da caixa de texto)
    function statusHtml(r, need, L, max) {
        const n = r.units.length, out = [];
        if (!r.lines) out.push(`<span>${max ? `Até ${need} ${plural(need, L.one, L.many)}` : `${need === 1 ? 'Falta' : 'Faltam'} ${need} ${plural(need, L.one, L.many)}`}: um por linha.</span>`);
        else if (!r.errors.length && (max ? n >= 1 && n <= need : n === need)) out.push(`<span class="ok row">${ic('circle-check', 'check')} ${n} de ${need} ${plural(need, L.one, L.many)} · tudo certo</span>`);
        else out.push(`<span><b>${n}</b> de ${need} ${plural(need, L.one, L.many)} válido${n === 1 ? '' : 's'}${!max && n < need ? ` · falta${need - n === 1 ? '' : 'm'} ${need - n}` : ''}${n > need ? ` · sobra${n - need === 1 ? '' : 'm'} ${n - need}` : ''}</span>`);
        r.errors.slice(0, 6).forEach(e => out.push(`<span class="bad row">${ic('circle-x', 'xmark')} Linha ${e.n}: ${esc(e.msg)}</span>`));
        if (r.errors.length > 6) out.push(`<span class="bad">… e mais ${r.errors.length - 6} linha(s) com problema.</span>`);
        return out.join('');
    }

    /** Janela para informar os números. o.items: [{ key, product, qty, sub }]; o.max: aceita de 1 até qty.
        Devolve { units: { key: [...] } }, { skip: true } ou null (voltou). */
    function entryDialog(o) {
        return new Promise(resolve => {
            const ov = overlay({
                title: o.title, icon: ic('scan-barcode', 'barcode'),
                body: `${o.intro ? `<p class="sn-note">${o.intro}</p>` : ''}${o.items.map((it, i) => { const L = kl(kindOf(it.product)); return `<div class="sn-item" data-i="${i}"><div class="sn-item-h"><b>${esc(it.product.name || 'Produto')}</b><span>${esc(it.sub || '')}</span></div><textarea class="form-control sn-ta" rows="${Math.min(8, Math.max(3, it.qty))}" spellcheck="false" autocomplete="off" aria-label="${esc(L.many)} de ${esc(it.product.name || 'produto')}" placeholder="${esc(L.ph)}">${esc(it.value || '')}</textarea><div class="sn-st" aria-live="polite"></div></div>`; }).join('')}<div class="sn-db" aria-live="polite"></div>`,
                foot: `${o.skip ? `<button type="button" class="btn btn-outline" data-skip>${esc(o.skip)}</button>` : ''}<button type="button" class="btn btn-secondary" data-x>${esc(o.cancel || 'Voltar')}</button><button type="button" class="btn btn-primary" data-ok>${ic('check', 'check')} <span>${esc(o.ok || 'Confirmar')}</span></button>`
            });
            const close = v => { ov.remove(); resolve(v); };
            ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => close(null)));
            const sk = ov.querySelector('[data-skip]'); if (sk) sk.addEventListener('click', () => close({ skip: true }));
            const db_ = ov.querySelector('.sn-db'), ok = ov.querySelector('[data-ok]');
            let warned = '';
            const parseAll = () => o.items.map((it, i) => { const box = ov.querySelector(`.sn-item[data-i="${i}"]`); return { it, box, r: parseList(box.querySelector('textarea').value, kindOf(it.product)) }; });
            const paint = () => { parseAll().forEach(x => { x.box.querySelector('.sn-st').innerHTML = statusHtml(x.r, x.it.qty, kl(kindOf(x.it.product)), o.max); }); db_.className = 'sn-db'; db_.innerHTML = ''; warned = ''; ok.querySelector('span').textContent = o.ok || 'Confirmar'; };
            ov.querySelectorAll('textarea').forEach(t => t.addEventListener('input', paint));
            paint();
            setTimeout(() => { const t = ov.querySelector('textarea'); if (t) t.focus(); }, 60);
            ok.addEventListener('click', async () => {
                const all = parseAll();
                for (const x of all) {
                    const L = kl(kindOf(x.it.product)), n = x.r.units.length, ta = x.box.querySelector('textarea');
                    if (x.r.errors.length) { toast('warning', `${x.it.product.name}: corrija a linha ${x.r.errors[0].n}.`); ta.focus(); return; }
                    if (o.max ? (n < 1 || n > x.it.qty) : n !== x.it.qty) { toast('warning', o.max ? `${x.it.product.name}: informe de 1 a ${x.it.qty} ${L.many}.` : `${x.it.product.name}: ${n > x.it.qty ? 'sobra' : 'falta'}${Math.abs(x.it.qty - n) === 1 ? '' : 'm'} ${Math.abs(x.it.qty - n)} ${plural(Math.abs(x.it.qty - n), L.one, L.many)} (precisa de ${x.it.qty}).`); ta.focus(); return; }
                }
                // O mesmo número em dois produtos da mesma compra
                const seen = {};
                for (const x of all) for (const u of x.r.units) for (const k of [u.code, u.imei2].filter(Boolean)) { if (seen[k]) { toast('warning', `${k} está em ${seen[k]} e em ${x.it.product.name}.`); return; } seen[k] = x.it.product.name; }
                ok.disabled = true; const lbl = ok.querySelector('span').textContent; ok.querySelector('span').textContent = 'Conferindo...';
                let res;
                try { res = await conferir(all.flatMap(x => x.r.units), o.ignoreId); }
                catch (e) { res = { errors: [], warns: [] }; }
                ok.disabled = false; ok.querySelector('span').textContent = lbl;
                if (res.errors.length) { db_.className = 'sn-db bad'; db_.innerHTML = `<b>Não dá para dar entrada:</b><ul>${res.errors.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>`; return; }
                const sig = res.warns.map(w => w.msg).join('|');
                if (res.warns.length && warned !== sig) { warned = sig; db_.className = 'sn-db warn'; db_.innerHTML = `<b>Confira antes de continuar:</b><ul>${res.warns.map(e => `<li>${esc(e.msg)}</li>`).join('')}</ul>Se está certo (o aparelho voltou para a loja), toque em confirmar de novo.`; ok.querySelector('span').textContent = 'Confirmar mesmo assim'; return; }
                const units = {}; all.forEach(x => { units[x.it.key] = x.r.units; });
                close({ units });
            });
        });
    }

    /* =================== Compras › Receber =================== */
    function pedirSeriais(compra, produtos, opts) {
        const byId = id => (Array.isArray(produtos) ? produtos : []).find(p => p && p.id === id);
        const list = ((compra && compra.items) || []).map((it, i) => ({ it, i, p: byId(it.productId) })).filter(x => isSerial(x.p) && num(x.it.unitsTotal || x.it.quantity) >= 1);
        if (!list.length) return Promise.resolve(opts);
        const items = list.map(x => { const q = Math.round(num(x.it.unitsTotal || x.it.quantity)); return { key: String(x.i), product: x.p, qty: q, sub: `entram ${q} un · ${kl(kindOf(x.p)).many}` }; });
        return entryDialog({
            title: 'Números dos aparelhos', ok: 'Receber compra', cancel: 'Voltar', skip: 'Informar depois', items,
            intro: `${items.length === 1 ? 'Este produto controla' : 'Estes produtos controlam'} cada aparelho pelo número. Cole ou bipe um por linha: o IMEI é conferido pelo dígito final e a quantidade tem que bater com a compra. Depois, no PDV, é só bipar o número.`
        }).then(r => {
            if (!r) return null;
            if (r.skip) { toast('info', 'Os números ficam para depois: em Produtos, abra o produto e toque em "Ver aparelhos".'); return { ...(opts || {}), seriaisDepois: true }; }
            return { ...(opts || {}), seriais: r.units };
        });
    }
    async function seriaisDaCompra(compra, seriais) {
        let n = 0;
        for (const [i, it] of ((compra && compra.items) || []).entries()) {
            const units = seriais && seriais[String(i)]; if (!units || !units.length || !it.productId) continue;
            let p = { id: it.productId, name: it.productName || '', costPrice: it.costPrice };
            try { const d = await db.collection('products').doc(it.productId).get(); if (d.exists) p = { id: d.id, ...d.data() }; } catch (e) { }
            await register(p, units, { type: 'compra', ref: `Compra #${compra.purchaseNumber || ''}`, purchaseId: compra.id || '', supplierName: compra.supplierName || '', costPrice: it.costPrice, what: `Entrada · compra #${compra.purchaseNumber || ''}${compra.supplierName ? ' (' + compra.supplierName + ')' : ''}` });
            n += units.length;
        }
        if (n) toast('success', `${n} ${plural(n, 'aparelho registrado', 'aparelhos registrados')} com o número.`);
        return n;
    }
    // Compra cancelada com a mercadoria voltando ao fornecedor: as unidades dela que ainda estão na loja saem da lista
    async function onPurchaseCancelled(compra, motivo) {
        if (!compra || !compra.id) return 0;
        let n = 0;
        try {
            const list = docsOf(await db.collection(COL).where('purchaseId', '==', compra.id).get()).filter(u => !u.deleted && u.status === 'in_stock');
            for (const u of list) { await setUnit(u.id, { status: 'removed', removedReason: 'Compra cancelada', removedAtMs: Date.now() }, `Compra #${compra.purchaseNumber || ''} cancelada: voltou ao fornecedor${motivo ? ' (' + motivo + ')' : ''}`); n++; }
        } catch (e) { console.warn('seriais (compra cancelada):', e); }
        return n;
    }

    /* =================== Venda: grava, confere e baixa as unidades =================== */
    // Campos do item da venda (gancho no pdv.html). O número e a garantia vão nas observações do item: saem no cupom, na A4,
    // na reimpressão, no WhatsApp e na ficha do cliente sem mexer em cada impressão.
    function saleFields(item) {
        const sn = item && Array.isArray(item.serials) ? item.serials.filter(Boolean) : [];
        if (!sn.length) return {};
        const days = Math.max(0, Math.round(num(item.warrantyDays))), until = days ? untilOf(Date.now(), days) : null;
        const s2 = Array.isArray(item.serials2) ? item.serials2.filter(Boolean) : [];
        const parts = [(item.serialKind === 'serial' ? 'Série ' : 'IMEI ') + sn.join(', ') + (s2.length ? ' / ' + s2.join(', ') : '')];
        if (days) parts.push(`Garantia ${days} dias (até ${brD(until)})`);
        if (item.notes) parts.push(String(item.notes));
        return { serials: sn, serialIds: Array.isArray(item.serialIds) ? item.serialIds : [], serialKind: item.serialKind || 'imei', warrantyDays: days, warrantyUntilMs: until, notes: parts.join(' · ') };
    }
    const idsOf = items => (Array.isArray(items) ? items : []).flatMap(i => Array.isArray(i.serialIds) ? i.serialIds : []);
    async function conferirVenda(data) {
        for (const it of data.items || []) {
            (it.serialIds || []).forEach((id, k) => { if ((it.serialIds || []).indexOf(id) !== k) throw new Error('O mesmo aparelho está duas vezes no carrinho.'); });
            for (const [k, id] of (it.serialIds || []).entries()) {
                const d = await db.collection(COL).doc(id).get(), u = d.exists ? d.data() : null, code = (it.serials || [])[k] || '';
                if (!u || u.deleted) throw new Error(`O aparelho ${code} não está mais cadastrado. Tire do carrinho e bipe de novo.`);
                if (u.status !== 'in_stock') throw new Error(`O aparelho ${numTxt(u)} já saiu do estoque${u.saleNumber ? ' (venda ' + saleNo(u.saleNumber) + ')' : ''}. Tire do carrinho e escolha outro.`);
            }
        }
    }
    async function marcarVendidos(data, r) {
        const now = Date.now();
        for (const it of data.items || []) {
            const ids = Array.isArray(it.serialIds) ? it.serialIds : []; if (!ids.length) continue;
            const days = Math.max(0, Math.round(num(it.warrantyDays)));
            for (const id of ids) {
                await setUnit(id, { status: 'sold', saleId: r.id, saleNumber: r.saleNumber || 0, customerId: data.customerId || '', customerName: data.customerName || 'Consumidor Final', sellerName: data.sellerName || '', soldAtMs: now, soldPrice: r2(it.unitPrice), warrantyDays: days, warrantyUntilMs: days ? (num(it.warrantyUntilMs) || untilOf(now, days)) : null },
                    `Vendido · venda ${saleNo(r.saleNumber)} · ${data.customerName || 'Consumidor Final'}`);
                if (scan) for (const [k, u] of scan) if (u.id === id) scan.delete(k);
            }
        }
    }
    async function voltarUnidade(id, s, what) {
        const d = await db.collection(COL).doc(id).get(); if (!d.exists) return false;
        const u = d.data() || {};
        if (u.status !== 'sold' || (s && u.saleId && u.saleId !== s.id)) return false; // já voltou ou foi vendido de novo
        await setUnit(id, { ...BACK }, what);
        return true;
    }
    async function onSaleCancelled(s) {
        let n = 0;
        for (const id of idsOf(s && s.items)) { try { if (await voltarUnidade(id, s, `Voltou ao estoque · venda ${saleNo(s.saleNumber)} cancelada`)) n++; } catch (e) { console.warn('seriais (cancelar):', e); } }
        if (n) toast('info', `${n} ${plural(n, 'aparelho voltou', 'aparelhos voltaram')} para o estoque com o número.`);
        return n;
    }
    // Edição da venda: cada aparelho é uma linha (quantidade 1). Tirar a linha devolve a unidade.
    function checkEdit(s, items) {
        for (const it of items || []) {
            const n = Array.isArray(it.serialIds) ? it.serialIds.length : 0;
            if (n && Math.abs(num(it.quantity) - n) > 1e-9) throw new Error(`"${it.productName}" tem número (IMEI/série): é um aparelho por linha. Para vender outro, faça uma venda nova; para tirar, remova a linha.`);
        }
    }
    async function onSaleEdited(s, items) {
        const keep = new Set(idsOf(items)); let n = 0;
        for (const id of idsOf(s && s.items)) if (!keep.has(id)) { try { if (await voltarUnidade(id, s, `Voltou ao estoque · tirado da venda ${saleNo(s.saleNumber)} na edição`)) n++; } catch (e) { } }
        return n;
    }
    // Troca/devolução (trocas-v1.js): a unidade devolvida volta ao estoque (ou fica como "devolvido com defeito")
    async function onReturn(s, lines, restock, label) {
        if (!s || !s.id) return 0;
        const d = await db.collection('sales').doc(s.id).get(); if (!d.exists) return 0;
        const items = ((d.data() || {}).items || []).map(i => ({ ...i }));
        let n = 0, changed = false;
        for (const l of lines || []) {
            const it = items[l.idx]; if (!it || !Array.isArray(it.serialIds) || !it.serialIds.length) continue;
            const done = Array.isArray(it.returnedSerialIds) ? it.returnedSerialIds.slice() : [];
            const pick = it.serialIds.filter(id => !done.includes(id)).slice(0, Math.max(0, Math.round(num(l.qty))));
            for (const id of pick) {
                const ud = await db.collection(COL).doc(id).get(); if (!ud.exists) continue;
                if (restock) await setUnit(id, { ...BACK, lastReturnAtMs: Date.now() }, `${label} · voltou ao estoque`);
                else await setUnit(id, { status: 'returned', returnedAtMs: Date.now(), returnLabel: label }, `${label} · devolvido com defeito (fora do estoque)`);
                done.push(id); n++; changed = true;
            }
            it.returnedSerialIds = done;
        }
        if (changed) await db.collection('sales').doc(s.id).update({ items, updatedAt: ts() });
        return n;
    }
    function wrapSales() {
        if (typeof SalesService === 'undefined' || !SalesService || typeof SalesService.create !== 'function' || SalesService.__dpSerial) return;
        SalesService.__dpSerial = true;
        const oc = SalesService.create;
        SalesService.create = async function (data) {
            const has = !!(data && Array.isArray(data.items) && data.items.some(i => Array.isArray(i.serialIds) && i.serialIds.length));
            if (has) await conferirVenda(data);
            const r = await oc.apply(this, arguments);
            if (has && data.status !== 'cancelled' && r && r.id) { try { await marcarVendidos(data, r); } catch (e) { console.error(e); toast('warning', 'A venda foi feita, mas os números dos aparelhos não baixaram: ' + e.message); } }
            return r;
        };
        if (typeof SalesService.cancel === 'function') {
            const ox = SalesService.cancel;
            SalesService.cancel = async function (saleId) {
                let s = null; try { const d = await db.collection('sales').doc(saleId).get(); if (d.exists) s = { id: d.id, ...d.data() }; } catch (e) { }
                const r = await ox.apply(this, arguments);
                if (s) { try { await onSaleCancelled(s); } catch (e) { } }
                return r;
            };
        }
    }
    try { wrapSales(); } catch (e) { }

    /* =================== PDV: bipar o número e escolher o aparelho =================== */
    let scan = null, scanAt = 0, pdvAdd = null;
    async function loadScan() {
        try {
            const list = docsOf(await db.collection(COL).where('status', '==', 'in_stock').get()).filter(u => !u.deleted);
            const m = new Map(); list.forEach(u => { [u.code, codeKey(u.imei2)].filter(Boolean).forEach(k => m.set(k, u)); });
            scan = m; scanAt = Date.now();
        } catch (e) { }
    }
    const cartIds = () => idsOf(getCart());
    function addUnits(p, units) {
        const c = getCart(), have = new Set(cartIds()); let n = 0;
        const price = r2((window.dpPrecoVigente ? dpPrecoVigente(p) : 0) || p.salePrice || 0);
        for (const u of units) {
            if (have.has(u.id)) { toast('info', `${numTxt(u)} já está no carrinho.`); continue; }
            c.push({
                _cartKey: `${p.id}_sn_${u.id}`, _factor: 1, _pkgLabel: '', productId: p.id, productName: p.name, productCode: p.code || '',
                unitPrice: price, originalUnitPrice: price, notes: '', costPrice: num(u.costPrice) || num(p.costPrice), quantity: 1, discount: 0, total: price,
                serials: [codeOf(u)], serials2: u.imei2 ? [u.imei2] : [], serialIds: [u.id], serialKind: u.kind || kindOf(p), warrantyDays: warrantyOf(p)
            });
            have.add(u.id); n++;
        }
        if (n) { try { window.renderCart(); } catch (e) { } }
        return n;
    }
    // Leitor no PDV (chamado pelo pdv-pro-v1.js quando o código não é de nenhum produto)
    window.dpSerialScan = function (raw) {
        if (!scan) return false;
        const k = codeKey(raw); if (k.length < 4) return false;
        const u = scan.get(k);
        if (!u) {
            if (/^\d{15}$/.test(k) && imeiOk(k) && getProducts().some(isSerial)) { toast('warning', `O IMEI ${k} não está no estoque (já foi vendido ou ainda não deu entrada). Consulte em Garantias.`); return true; }
            return false;
        }
        const p = getProducts().find(x => x.id === u.productId);
        if (!p) { toast('warning', `${numTxt(u)} é do produto "${u.productName}", que não está à venda no PDV.`); return true; }
        if (cartIds().includes(u.id)) { toast('info', `${numTxt(u)} já está no carrinho.`); return true; }
        if (addUnits(p, [u])) toast('success', `${p.name} · ${numTxt(u)}`);
        return true;
    };
    async function picker(p) {
        if ($('snPick')) return;
        const k = kindOf(p), L = kl(k);
        let all = [];
        try { all = docsOf(await db.collection(COL).where('productId', '==', p.id).get()).filter(u => !u.deleted && u.status === 'in_stock'); }
        catch (e) { toast('error', `Não deu para ler os ${L.many}: ${e.message}`); return; }
        const inCart = new Set(cartIds());
        const free = all.filter(u => !inCart.has(u.id)).sort((a, b) => num(a.createdAtMs) - num(b.createdAtMs));
        const looseInCart = getCart().filter(c => c.productId === p.id && !(Array.isArray(c.serialIds) && c.serialIds.length)).reduce((s, c) => s + num(c.quantity) * (num(c._factor) || 1), 0);
        const loose = Math.max(0, Math.floor(num(p.currentStock) - all.length - looseInCart));
        const price = (window.dpPrecoVigente ? dpPrecoVigente(p) : 0) || p.salePrice || 0;
        const ov = overlay({
            id: 'snPick', title: p.name || 'Aparelho', icon: ic('smartphone', 'mobile-screen'),
            body: `<p class="sn-note" style="margin-bottom:10px">${money(price)} · escolha ${free.length > 1 ? 'os aparelhos que o cliente vai levar' : 'o aparelho'} pelo ${esc(L.one)}${free.length ? ` (${free.length} no estoque)` : ''}.</p>
${free.length ? `<label class="sn-find">${ic('search', 'magnifying-glass')}<input type="text" id="snPickQ" inputmode="${k === 'imei' ? 'numeric' : 'text'}" autocomplete="off" placeholder="Bipe ou digite o ${esc(L.one)}" aria-label="Buscar ${esc(L.one)}"></label><div class="sn-list" id="snPickList"></div>` : `<div class="sn-empty">Nenhum aparelho deste produto com ${esc(L.one)} no estoque.<br>Dê entrada em Compras (receber) ou em Produtos › Entrada.</div>`}
${loose ? `<div class="sn-loose">${loose} ${plural(loose, 'unidade entrou', 'unidades entraram')} antes do controle e ${plural(loose, 'está', 'estão')} sem ${esc(L.one)}. <button type="button" class="btn btn-outline btn-sm" data-loose style="margin-left:4px">Vender sem escolher o ${esc(L.one)}</button></div>` : ''}`,
            foot: `<button type="button" class="btn btn-secondary" data-x>Cancelar</button>${free.length ? `<button type="button" class="btn btn-primary" data-ok disabled>${ic('plus', 'plus')} <span>Adicionar</span></button>` : ''}`
        });
        const close = () => ov.remove();
        ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
        ov.addEventListener('click', e => { if (e.target === ov) close(); });
        const lb = ov.querySelector('[data-loose]');
        if (lb) lb.addEventListener('click', () => { close(); if (pdvAdd) pdvAdd.call(window, p.id); });
        if (!free.length) return;
        const sel = new Set(), q = $('snPickQ'), list = $('snPickList'), ok = ov.querySelector('[data-ok]');
        const match = (u, s) => { const kq = codeKey(s); return !kq || codeKey(u.code).includes(kq) || codeKey(u.imei2).includes(kq); };
        const btn = () => { ok.disabled = !sel.size; ok.querySelector('span').textContent = sel.size > 1 ? `Adicionar ${sel.size} aparelhos` : 'Adicionar'; };
        const paint = () => {
            const rows = free.filter(u => match(u, q.value));
            list.innerHTML = rows.length ? rows.map(u => `<label class="sn-row${sel.has(u.id) ? ' on' : ''}"><input type="checkbox" value="${esc(u.id)}" ${sel.has(u.id) ? 'checked' : ''}><div><b class="sn-mono">${esc(codeOf(u))}</b><small>${u.imei2 ? 'IMEI 2: ' + esc(u.imei2) + ' · ' : ''}entrou em ${brD(u.createdAtMs)}${u.entryRef ? ' · ' + esc(u.entryRef) : ''}</small></div></label>`).join('') : `<div class="sn-empty">Nenhum ${esc(L.one)} deste produto começa com "${esc(q.value)}".</div>`;
            btn();
        };
        // Marcar não redesenha a lista (não perde a rolagem)
        list.addEventListener('change', e => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; if (c.checked) sel.add(c.value); else sel.delete(c.value); const row = c.closest('.sn-row'); if (row) row.classList.toggle('on', c.checked); btn(); });
        const add = ids => { const us = free.filter(u => ids.includes(u.id)); close(); if (addUnits(p, us)) toast('success', us.length > 1 ? `${us.length} aparelhos no carrinho.` : `${p.name} · ${numTxt(us[0])}`); };
        ok.addEventListener('click', () => add([...sel]));
        q.addEventListener('input', paint);
        q.addEventListener('keydown', e => {
            if (e.key !== 'Enter') return; e.preventDefault();
            const kq = codeKey(q.value); if (!kq) { if (sel.size) add([...sel]); return; }
            const exact = free.find(u => u.code === kq || codeKey(u.imei2) === kq);
            if (exact) { add([exact.id]); return; }
            const rows = free.filter(u => match(u, q.value));
            if (rows.length === 1) { sel.add(rows[0].id); q.value = ''; paint(); return; }
            toast('warning', rows.length ? 'Mais de um aparelho com esse começo: digite o número inteiro ou marque na lista.' : `Esse ${L.one} não está no estoque deste produto.`);
        });
        paint();
        setTimeout(() => q.focus(), 60);
    }
    function decorateCart() {
        const rows = document.querySelectorAll('#cartItems .cart-item'), c = getCart();
        rows.forEach((row, i) => {
            const it = c[i]; if (!it || !Array.isArray(it.serials) || !it.serials.length) return;
            const info = row.querySelector('.ci-info');
            if (info && !info.querySelector('.sn-chip')) {
                const chip = document.createElement('div'); chip.className = 'sn-chip';
                chip.title = 'Número deste aparelho (sai no cupom com a garantia)';
                chip.innerHTML = `${ic('smartphone', 'mobile-screen')}<span>${esc((it.serialKind === 'serial' ? 'Série ' : 'IMEI ') + it.serials.join(', '))}</span>`;
                const name = info.querySelector('.ci-name'); (name || info).insertAdjacentElement('afterend', chip);
            }
            const span = row.querySelector('.ci-qty span'); if (span) { span.onclick = null; span.style.cursor = 'default'; span.title = 'Um aparelho por linha: toque em + para escolher outro'; }
        });
    }
    function setupPdv() {
        if (!$('productsGrid') || typeof window.addToCart !== 'function' || window.addToCart.__sn) return;
        css();
        pdvAdd = window.addToCart;
        const wAdd = function (productId, pkgIndex) { // dois parâmetros: o preco-atacado-v1.js confere addToCart.length
            const p = getProducts().find(x => x.id === productId);
            if (isSerial(p)) { picker(p); return; }
            return pdvAdd.apply(this, arguments);
        };
        wAdd.__sn = true; window.addToCart = wAdd;
        const oUpd = window.updateQuantity;
        if (typeof oUpd === 'function') window.updateQuantity = function (index, delta) {
            const it = getCart()[index];
            if (it && Array.isArray(it.serialIds) && it.serialIds.length) {
                if (delta < 0) { getCart().splice(index, 1); window.renderCart(); return; }
                const p = getProducts().find(x => x.id === it.productId); if (p) picker(p);
                return;
            }
            return oUpd.apply(this, arguments);
        };
        const oRC = window.renderCart;
        if (typeof oRC === 'function') window.renderCart = function () { const r = oRC.apply(this, arguments); try { decorateCart(); } catch (e) { } return r; };
        // Índice dos números no estoque (para o leitor): só quando há produto com controle
        let n = 0; const t = setInterval(() => { n++; const ps = getProducts(); if (ps.length || n > 60) { clearInterval(t); if (ps.some(isSerial)) loadScan(); } }, 500);
        setInterval(() => { if (!document.hidden && getProducts().some(isSerial) && Date.now() - scanAt > 90000) loadScan(); }, 30000);
        try { decorateCart(); } catch (e) { }
    }

    /* =================== Produtos: liga o controle, entrada rápida e "Ver aparelhos" =================== */
    let prodCache = {};
    const pageProduct = id => { try { if (Array.isArray(allProducts)) return allProducts.find(x => x && x.id === id) || null; } catch (e) { } return getProducts().find(x => x && x.id === id) || null; };
    async function productById(id) {
        const pg = pageProduct(id); if (pg && pg.serialControl !== undefined) return pg;
        if (prodCache[id] && Date.now() - prodCache[id].at < 30000) return prodCache[id].p;
        try { const d = await db.collection('products').doc(id).get(); const p = d.exists ? { id: d.id, ...d.data() } : pg; prodCache[id] = { p, at: Date.now() }; return p; } catch (e) { return pg; }
    }
    function setupProdutos() {
        const modal = $('productModal'), promo = $('prodPromoPrice');
        if (modal && promo && !$('snTrackBox')) {
            css();
            const box = document.createElement('div'); box.id = 'snTrackBox'; box.className = 'sn-track';
            box.innerHTML = `<label class="sn-track-h"><input type="checkbox" id="prodSerialControl"><span class="sn-track-ic">${ic('smartphone', 'mobile-screen')}</span><span><b>Controlar IMEI / nº de série por unidade</b><small>Cada aparelho que entra tem o seu número. No PDV você bipa o número, o cupom sai com ele e a garantia, e a tela Garantias acha o aparelho vendido.</small></span></label>
<div class="sn-g2" id="snTrackOpts" hidden><div class="form-group"><label class="form-label" for="prodSerialKind">Tipo de número</label><select id="prodSerialKind" class="form-control"><option value="imei">IMEI (celular e tablet)</option><option value="serial">Nº de série (outros aparelhos e peças)</option></select></div><div class="form-group"><label class="form-label" for="prodSaleWarranty">Garantia da loja na venda</label><div class="sn-unit"><input type="number" id="prodSaleWarranty" class="form-control" min="0" max="3650" step="1" inputmode="numeric"><span>dias</span></div></div></div>
<div class="sn-info" id="snTrackInfo"></div>`;
            const anchor = $('vldTrackBox') || promo.closest('.form-row') || promo.closest('.form-group');
            anchor.parentElement.insertBefore(box, anchor.nextSibling);
            const chk = $('prodSerialControl'), kind = $('prodSerialKind'), wd = $('prodSaleWarranty'), opts = $('snTrackOpts'), info = $('snTrackInfo');
            const cur = () => { try { return typeof editingProductId !== 'undefined' && editingProductId ? pageProduct(editingProductId) : null; } catch (e) { return null; } };
            const sync = () => { opts.hidden = !chk.checked; };
            chk.addEventListener('change', () => { sync(); paintInfo(); });
            const paintInfo = async () => {
                const p = cur(); info.innerHTML = '';
                if (!chk.checked) return;
                if (!p) { info.innerHTML = `<span>Depois de salvar, dê entrada com os números (Compras ou Entrada). Se já tem aparelhos na loja, abra o produto de novo e use "Ver aparelhos".</span>`; return; }
                info.innerHTML = `<span>Carregando os aparelhos...</span>`;
                let list = []; try { list = docsOf(await db.collection(COL).where('productId', '==', p.id).get()).filter(u => !u.deleted); } catch (e) { }
                if (cur() !== p) return;
                const inS = list.filter(u => u.status === 'in_stock').length, sold = list.filter(u => u.status === 'sold').length, miss = Math.max(0, Math.floor(num(p.currentStock)) - inS);
                info.innerHTML = `<span>${inS} no estoque com número · ${sold} ${plural(sold, 'vendido', 'vendidos')}${miss ? ` · <b style="color:var(--warning)">${miss} sem número</b>` : ''}</span><button type="button" class="btn btn-outline btn-sm" id="snTrackOpen">${ic('list', 'list')} Ver aparelhos</button>`;
                $('snTrackOpen').addEventListener('click', () => openPanel(p));
            };
            const oOpen = window.openProductModal;
            if (typeof oOpen === 'function') window.openProductModal = function () {
                const r = oOpen.apply(this, arguments);
                try { const p = cur(); chk.checked = isSerial(p); kind.value = p ? kindOf(p) : (segment() === 'celular' ? 'imei' : 'serial'); wd.value = String(p ? warrantyOf(p) : 90); sync(); paintInfo(); } catch (e) { }
                return r;
            };
            // Grava junto com o cadastro (mesmo jeito do validade-v1.js e do preco-atacado-v1.js)
            const svc = (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;
            if (svc && !svc.__dpSerial) {
                svc.__dpSerial = true;
                ['create', 'update'].forEach(name => {
                    const orig = svc[name]; if (typeof orig !== 'function') return;
                    svc[name] = function (col, a, b) {
                        const data = name === 'create' ? a : b;
                        if (col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modal.classList.contains('active')) {
                            data.serialControl = !!chk.checked;
                            if (chk.checked || cur()) { data.serialKind = kind.value === 'serial' ? 'serial' : 'imei'; data.saleWarrantyDays = Math.max(0, Math.min(3650, Math.round(num(wd.value)))); }
                        }
                        return orig.apply(this, arguments);
                    };
                });
            }
        }
        // Entrada rápida (Produtos › +): os números de cada aparelho que está entrando
        const sum = $('stockEntrySummary');
        if ($('stockEntryModal') && sum && !$('snEntryBox')) {
            css();
            const b = document.createElement('div'); b.id = 'snEntryBox'; b.className = 'sn-entry'; b.hidden = true;
            b.innerHTML = `<div class="sn-entry-h">${ic('scan-barcode', 'barcode')} <span id="snEntryTitle">IMEIs desta entrada</span></div><textarea id="snEntryTa" class="form-control sn-ta" rows="4" spellcheck="false" autocomplete="off"></textarea><div class="sn-st" id="snEntrySt" aria-live="polite"></div>`;
            sum.insertAdjacentElement('afterend', b);
            let curP = null;
            const factor = () => { try { return num(_stockEntryFactor) || 1; } catch (e) { return 1; } };
            const need = () => Math.max(1, Math.round(num($('stockEntryQty') && $('stockEntryQty').value) || 1)) * factor();
            const paint = () => { if (b.hidden || !curP) return; const r = parseList($('snEntryTa').value, kindOf(curP)); $('snEntrySt').innerHTML = statusHtml(r, need(), kl(kindOf(curP))); return r; };
            $('snEntryTa').addEventListener('input', () => {
                if (!curP) return;
                const r = parseList($('snEntryTa').value, kindOf(curP)), qi = $('stockEntryQty');
                if (factor() === 1 && r.units.length && qi && Number(qi.value) !== r.units.length) { qi.value = r.units.length; qi.dispatchEvent(new Event('input', { bubbles: true })); }
                paint();
            });
            $('stockEntryQty') && $('stockEntryQty').addEventListener('input', paint);
            const oOpenSE = window.openStockEntry;
            if (typeof oOpenSE === 'function') window.openStockEntry = function (pid) {
                const r = oOpenSE.apply(this, arguments);
                try { const p = pageProduct(pid); curP = isSerial(p) ? p : null; b.hidden = !curP; $('snEntryTa').value = ''; if (curP) { const L = kl(kindOf(curP)); $('snEntryTitle').textContent = `${L.title === 'IMEI' ? 'IMEIs' : 'Números de série'} dos aparelhos que estão entrando *`; $('snEntryTa').placeholder = L.ph; paint(); } } catch (e) { }
                return r;
            };
            const oConf = window.confirmStockEntry;
            if (typeof oConf === 'function') window.confirmStockEntry = async function () {
                if (!b.hidden && curP) {
                    const p = curP, L = kl(kindOf(p)), r = parseList($('snEntryTa').value, kindOf(p)), n = need();
                    if (r.errors.length) { toast('warning', `Corrija a linha ${r.errors[0].n} dos ${L.many}.`); $('snEntryTa').focus(); return; }
                    if (r.units.length !== n) { toast('warning', `Informe ${n} ${plural(n, L.one, L.many)}, um por aparelho (tem ${r.units.length}).`); $('snEntryTa').focus(); return; }
                    const res = await conferir(r.units).catch(() => ({ errors: [], warns: [] }));
                    if (res.errors.length) { toast('warning', res.errors[0].msg + '.'); return; }
                    if (res.warns.length && !confirm(res.warns.map(w => w.msg).join('\n') + '\n\nDar entrada mesmo assim?')) return;
                    setPending('in', p.id, { product: p, units: r.units, info: { type: 'entrada', ref: 'Entrada rápida', costPrice: num($('stockEntryCostPrice') && $('stockEntryCostPrice').value) || p.costPrice, what: 'Entrada (Produtos)' } });
                }
                return oConf.apply(this, arguments);
            };
        }
    }

    /* =================== "Ver aparelhos" de um produto =================== */
    async function openPanel(p0) {
        if ($('snPanel')) return;
        const p = (await productById(p0.id)) || p0, k = kindOf(p), L = kl(k);
        const ov = overlay({ id: 'snPanel', wide: true, title: `Aparelhos · ${p.name || ''}`, icon: ic('smartphone', 'mobile-screen'), body: '<div class="sn-note">Carregando...</div>', foot: '<button type="button" class="btn btn-secondary" data-x>Fechar</button>' });
        ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov.remove()));
        const body = ov.querySelector('.modal-body');
        let all = [], f = 'in_stock', q = '', stock = num(p.currentStock);
        const load = async () => {
            all = docsOf(await db.collection(COL).where('productId', '==', p.id).get()).filter(u => !u.deleted).sort((a, b) => num(b.soldAtMs || b.createdAtMs) - num(a.soldAtMs || a.createdAtMs));
            try { const d = await db.collection('products').doc(p.id).get(); if (d.exists) stock = num((d.data() || {}).currentStock); } catch (e) { }
        };
        const paint = () => {
            const cnt = s => all.filter(u => s === 'all' || u.status === s || (s === 'out' && (u.status === 'returned' || u.status === 'removed'))).length;
            const inS = cnt('in_stock'), miss = Math.max(0, Math.floor(stock) - inS);
            const nq = norm(q), dq = digits(q);
            const rows = all.filter(u => (f === 'all' || u.status === f || (f === 'out' && (u.status === 'returned' || u.status === 'removed'))) && (!q || norm([u.code, u.imei2, u.serial, u.customerName, u.entryRef, u.saleNumber ? saleNo(u.saleNumber) : ''].join(' ')).includes(nq) || (dq.length >= 3 && digits(u.code + ' ' + u.imei2).includes(dq))));
            const tabs = [['in_stock', 'No estoque'], ['sold', 'Vendidos'], ['out', 'Devolvidos / fora'], ['all', 'Todos']];
            body.innerHTML = `${miss ? `<div class="sn-miss"><span>O estoque deste produto é <b>${Math.floor(stock)}</b>, mas só <b>${inS}</b> ${plural(inS, 'tem', 'têm')} ${esc(L.one)}. Informe os que já estavam na loja.</span><button type="button" class="btn btn-primary btn-sm" data-miss>${ic('package-plus', 'plus')} Informar ${miss} ${plural(miss, L.one, L.many)}</button></div>` : ''}
<div class="sn-tabs" role="tablist">${tabs.map(([key, lab]) => `<button type="button" role="tab" data-f="${key}" class="${f === key ? 'on' : ''}" aria-selected="${f === key}">${lab} (${cnt(key)})</button>`).join('')}</div>
<label class="sn-find">${ic('search', 'magnifying-glass')}<input type="text" data-q value="${esc(q)}" placeholder="Buscar por ${esc(L.one)}, cliente ou venda" autocomplete="off" aria-label="Buscar"></label>
${rows.length ? `<div class="sn-tw"><table class="sn-t"><thead><tr><th>${esc(L.title)}</th><th>Situação</th><th class="sn-hide-sm">Entrada</th><th>Venda / garantia</th><th></th></tr></thead><tbody>${rows.slice(0, 300).map(u => {
                const w = wState(u), st = ST[u.status] || ['—', 'off'];
                const sale = u.status === 'sold' ? `${u.saleNumber ? saleNo(u.saleNumber) + ' · ' : ''}${esc(u.customerName || 'Consumidor Final')}<small>${brD(u.soldAtMs)}${w.until ? ` · garantia até ${brD(w.until)}` : ''}${w.state === 'valid' ? '' : w.state === 'expired' ? ' (vencida)' : ''}</small>` : u.status === 'returned' ? `${esc(u.returnLabel || 'Devolução')}<small>${brD(u.returnedAtMs)}</small>` : u.status === 'removed' ? `${esc(u.removedReason || 'Saiu do estoque')}<small>${brD(u.removedAtMs)}</small>` : '—';
                return `<tr><td><b class="sn-mono">${esc(codeOf(u))}</b>${u.imei2 ? `<small class="sn-mono">IMEI 2: ${esc(u.imei2)}</small>` : ''}</td><td><span class="sn-pill ${st[1]}">${st[0]}</span></td><td class="sn-hide-sm">${brD(u.createdAtMs)}<small>${esc(u.entryRef || '')}</small></td><td>${sale}</td><td style="text-align:right">${u.status === 'in_stock' ? `<button type="button" class="btn-icon" title="Corrigir o número" aria-label="Corrigir o número" data-fix="${esc(u.id)}">${ic('pencil', 'pen')}</button>` : ''}</td></tr>`;
            }).join('')}</tbody></table></div>` : `<div class="sn-empty">${q ? 'Nada encontrado com essa busca.' : f === 'in_stock' ? `Nenhum aparelho com ${esc(L.one)} no estoque.` : 'Nada por aqui.'}</div>`}`;
            body.querySelectorAll('[data-f]').forEach(b => b.addEventListener('click', () => { f = b.dataset.f; paint(); }));
            const qi = body.querySelector('[data-q]'); qi.addEventListener('input', () => { q = qi.value; const pos = qi.selectionStart; paint(); const n2 = body.querySelector('[data-q]'); n2.focus(); try { n2.setSelectionRange(pos, pos); } catch (e) { } });
            const mb = body.querySelector('[data-miss]');
            if (mb) mb.addEventListener('click', async () => {
                const r = await entryDialog({ title: `Informar ${L.many} do estoque`, ok: 'Salvar', max: true, items: [{ key: '1', product: p, qty: miss, sub: `até ${miss} sem número` }], intro: 'Para os aparelhos que já estavam na loja antes de ligar o controle. O estoque não muda: só passa a ter o número de cada um.' });
                if (!r || !r.units) return;
                try { await register(p, r.units['1'], { type: 'estoque', ref: 'Já estava no estoque', what: 'Número informado (já estava no estoque)' }); toast('success', `${r.units['1'].length} ${plural(r.units['1'].length, L.one + ' informado', L.many + ' informados')}.`); await load(); paint(); }
                catch (e) { toast('error', 'Não deu para salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            });
            body.querySelectorAll('[data-fix]').forEach(b => b.addEventListener('click', async () => {
                const u = all.find(x => x.id === b.dataset.fix); if (!u) return;
                const r = await entryDialog({ title: `Corrigir ${L.one}`, ok: 'Salvar', ignoreId: u.id, items: [{ key: '1', product: p, qty: 1, sub: `hoje: ${codeOf(u)}`, value: codeOf(u) + (u.imei2 ? ' ' + u.imei2 : '') }], intro: 'Use quando o número foi digitado errado. O estoque não muda.' });
                if (!r || !r.units) return;
                const n = r.units['1'][0];
                try { await setUnit(u.id, { code: n.code, imei: n.imei, imei2: n.imei2, serial: n.serial }, `Número corrigido (era ${codeOf(u)})`); toast('success', 'Número corrigido.'); await load(); paint(); }
                catch (e) { toast('error', 'Não deu para salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            }));
        };
        try { await load(); paint(); } catch (e) { body.innerHTML = `<div class="sn-empty">Não deu para carregar: ${esc(e.message)}</div>`; }
    }

    /* =================== Estoque › Ajuste: entrada com os números, saída escolhendo o aparelho =================== */
    function setupEstoque() {
        const m = $('modalAjuste'), prev = $('ajustePreview');
        if (!m || !prev || $('snAdjBox')) return;
        css();
        const b = document.createElement('div'); b.id = 'snAdjBox'; b.className = 'sn-entry'; b.hidden = true;
        b.innerHTML = `<div class="sn-entry-h">${ic('scan-barcode', 'barcode')} <span id="snAdjTitle"></span></div><textarea id="snAdjTa" class="form-input form-control sn-ta" rows="4" spellcheck="false" autocomplete="off"></textarea><div class="sn-list" id="snAdjList"></div><div class="sn-st" id="snAdjSt" aria-live="polite"></div>`;
        prev.insertAdjacentElement('afterend', b);
        const S = { p: null, mode: '', units: [], sel: new Set(), pass: false, seq: 0 };
        const ta = $('snAdjTa'), list = $('snAdjList'), stEl = $('snAdjSt'), title = $('snAdjTitle');
        const qty = () => Math.max(0, Math.round(num($('ajusteQtd') && $('ajusteQtd').value)));
        const setQty = n => { const qi = $('ajusteQtd'); if (!qi || Number(qi.value) === n) return; qi.value = n; try { window.onAjusteQtyChange && window.onAjusteQtyChange(); } catch (e) { } };
        const paintIn = () => { if (S.mode === 'in') stEl.innerHTML = statusHtml(parseList(ta.value, kindOf(S.p)), Math.max(1, qty()), kl(kindOf(S.p))); };
        const outStatus = () => { stEl.innerHTML = S.units.length ? `<span>${S.sel.size ? `<b>${S.sel.size}</b> ${plural(S.sel.size, 'aparelho marcado', 'aparelhos marcados')}` : `Marque ${plural(qty(), 'o aparelho que está saindo', 'os aparelhos que estão saindo')}.`}</span>` : ''; };
        const paintOut = () => {
            const L = kl(kindOf(S.p));
            list.innerHTML = S.units.length ? S.units.map(u => `<label class="sn-row${S.sel.has(u.id) ? ' on' : ''}"><input type="checkbox" value="${esc(u.id)}" ${S.sel.has(u.id) ? 'checked' : ''}><div><b class="sn-mono">${esc(codeOf(u))}</b><small>entrou em ${brD(u.createdAtMs)}${u.entryRef ? ' · ' + esc(u.entryRef) : ''}</small></div></label>`).join('') : `<div class="sn-empty">Nenhum aparelho com ${esc(L.one)} no estoque deste produto.</div>`;
            outStatus();
        };
        list.addEventListener('change', e => { const c = e.target.closest('input[type=checkbox]'); if (!c) return; if (c.checked) S.sel.add(c.value); else S.sel.delete(c.value); const row = c.closest('.sn-row'); if (row) row.classList.toggle('on', c.checked); setQty(S.sel.size); outStatus(); });
        ta.addEventListener('input', () => { if (S.mode !== 'in') return; const r = parseList(ta.value, kindOf(S.p)); if (r.units.length) setQty(r.units.length); paintIn(); });
        const sync = async () => {
            const my = ++S.seq;
            const pid = $('ajusteProduto') && $('ajusteProduto').value, t = $('ajusteTipo') && $('ajusteTipo').value;
            const p = pid ? await productById(pid) : null;
            if (my !== S.seq) return;
            if (!isSerial(p)) { S.p = null; S.mode = ''; b.hidden = true; return; }
            const L = kl(kindOf(p)), changed = !S.p || S.p.id !== p.id; S.p = p; b.hidden = false;
            S.mode = t === 'entry' ? 'in' : (t === 'exit' || t === 'loss') ? 'out' : 'inv';
            ta.hidden = S.mode !== 'in'; list.hidden = S.mode !== 'out';
            if (S.mode === 'in') { title.textContent = `${L.title === 'IMEI' ? 'IMEIs' : 'Números de série'} dos aparelhos que estão entrando *`; ta.placeholder = L.ph; if (changed) ta.value = ''; paintIn(); }
            else if (S.mode === 'out') {
                title.textContent = t === 'loss' ? 'Qual aparelho teve perda ou avaria? *' : 'Quais aparelhos estão saindo? *';
                if (changed) S.sel.clear();
                list.innerHTML = '<div class="sn-empty">Carregando...</div>';
                try { S.units = docsOf(await db.collection(COL).where('productId', '==', p.id).get()).filter(u => !u.deleted && u.status === 'in_stock').sort((a, b2) => num(a.createdAtMs) - num(b2.createdAtMs)); } catch (e) { S.units = []; }
                if (my !== S.seq) return;
                paintOut();
            } else { title.textContent = `Inventário de produto com ${L.one}`; stEl.innerHTML = `<span>O inventário muda só a quantidade. Para dizer qual aparelho entrou ou saiu, use Entrada ou Saída (assim o ${esc(L.one)} fica certo no PDV e na garantia).</span>`; }
        };
        m.addEventListener('change', e => { if (e.target && (e.target.id === 'ajusteProduto' || e.target.id === 'ajusteTipo')) sync(); });
        $('ajusteQtd') && $('ajusteQtd').addEventListener('input', () => { if (S.mode === 'in') paintIn(); else if (S.mode === 'out') outStatus(); });
        new MutationObserver(() => { if (m.classList.contains('active')) { ta.value = ''; S.sel.clear(); S.p = null; sync(); } }).observe(m, { attributes: true, attributeFilter: ['class'] });
        // Antes do "Confirmar ajuste" da página (fase de captura): confere os números e deixa tudo pronto para a entrada/saída
        m.addEventListener('click', e => {
            const btn = e.target.closest && e.target.closest('.modal-footer .btn-primary');
            if (!btn || b.hidden || !S.p || S.mode === 'inv') return;
            if (S.pass) { S.pass = false; return; }
            e.preventDefault(); e.stopPropagation();
            // Clica de novo depois deste clique terminar (um click() dentro do outro é ignorado pelo navegador)
            const again = () => setTimeout(() => { S.pass = true; btn.click(); setTimeout(() => { S.pass = false; }, 0); }, 0);
            const p = S.p, L = kl(kindOf(p)), n = qty(), motivo = (($('ajusteMotivo') && $('ajusteMotivo').value) || '').trim();
            if (!motivo) { toast('warning', 'Informe o motivo do ajuste'); return; }
            if (S.mode === 'in') {
                const r = parseList(ta.value, kindOf(p));
                if (r.errors.length) { toast('warning', `Corrija a linha ${r.errors[0].n} dos ${L.many}.`); ta.focus(); return; }
                if (!n || r.units.length !== n) { toast('warning', `Informe ${n || 1} ${plural(n || 1, L.one, L.many)}, um por aparelho (tem ${r.units.length}).`); ta.focus(); return; }
                btn.disabled = true;
                conferir(r.units).catch(() => ({ errors: [], warns: [] })).then(res => {
                    btn.disabled = false;
                    if (res.errors.length) { toast('warning', res.errors[0].msg + '.'); return; }
                    if (res.warns.length && !confirm(res.warns.map(w => w.msg).join('\n') + '\n\nDar entrada mesmo assim?')) return;
                    setPending('in', p.id, { product: p, units: r.units, info: { type: 'ajuste', ref: 'Ajuste de estoque', what: 'Entrada (Estoque › ajuste): ' + motivo } });
                    again();
                });
                return;
            }
            const units = S.units.filter(u => S.sel.has(u.id));
            if (!units.length || units.length !== n) { toast('warning', `Marque ${n || 1} ${plural(n || 1, 'aparelho', 'aparelhos')} na lista (marcados: ${units.length}).`); return; }
            const tipo = $('ajusteTipo') && $('ajusteTipo').value;
            setPending('out', p.id, { units, reason: tipo === 'loss' ? 'Perda / avaria' : 'Saída', what: `${tipo === 'loss' ? 'Perda / avaria' : 'Saída'} (Estoque › ajuste): ${motivo}` });
            again();
        }, true);
    }

    /* =================== Garantias: aparelho vendido =================== */
    let gar = null, garLoading = null, garZero = false, garSettings = {};
    const DEFAULT_DEVICE_TERMS = 'A garantia da loja cobre defeitos de funcionamento do aparelho identificado acima, pelo prazo indicado, contado a partir da data da compra.\nNão estão cobertos: quedas, batidas, tela trincada, contato com líquidos ou umidade, oxidação, mau uso, aparelho aberto ou consertado por terceiros, e desgaste natural de acessórios.\nPara usar a garantia, traga o aparelho com este certificado (ou informe o IMEI/CPF) na loja. Se o defeito for coberto, o conserto ou a troca é feito sem cobrança.';
    async function garLoad() {
        const [l, st] = await Promise.all([db.collection(COL).get(), db.collection('settings').doc(DOC()).get().catch(() => null)]);
        gar = docsOf(l).filter(u => !u.deleted);
        garSettings = st && st.exists ? (st.data() || {}) : {};
        return gar;
    }
    function inWarrantyCount() {
        if (!gar) { garZero = true; return 0; }
        return gar.filter(u => u.status === 'sold' && wState(u).state === 'valid').length;
    }
    function garCard(u, customers) {
        const c = (customers && customers[u.customerId]) || {}, w = wState(u), doc = c.document || c.cpf || c.cpfCnpj || '';
        if (u.status !== 'sold') {
            const st = ST[u.status] || ['—', 'off'];
            return `<article class="dpu-card"><div class="top"><div><span class="sn-tag">${ic('smartphone', 'mobile-screen')} Aparelho da loja</span><br><b>${esc(u.productName || 'Aparelho')}</b><br><small class="sn-mono">${esc(numTxt(u))}</small></div><span class="dpu-st ${u.status === 'in_stock' ? 'sn-stock' : 'expired'}">${st[0]}</span></div>
<small>${u.status === 'in_stock' ? `No estoque desde ${brD(u.createdAtMs)}${u.entryRef ? ' · ' + esc(u.entryRef) : ''}` : u.status === 'returned' ? `${esc(u.returnLabel || 'Devolvido')} em ${brD(u.returnedAtMs)}` : `${esc(u.removedReason || 'Saiu do estoque')} em ${brD(u.removedAtMs)}`}</small></article>`;
        }
        return `<article class="dpu-card"><div class="top"><div><span class="sn-tag">${ic('smartphone', 'mobile-screen')} Aparelho vendido</span><br><b>${esc(u.productName || 'Aparelho')} · ${esc(u.customerName || c.name || 'Consumidor Final')}</b><br><small class="sn-mono">${esc(numTxt(u))}</small></div><span class="dpu-st ${w.state === 'valid' ? 'valid' : 'expired'}">${esc(w.label)}</span></div>
<small>Vendido em <b>${brD(u.soldAtMs)}</b>${u.saleNumber ? ` · venda ${saleNo(u.saleNumber)}` : ''}${u.soldPrice ? ` · ${money(u.soldPrice)}` : ''}${w.until ? ` · garantia de ${num(u.warrantyDays)} dias até <b>${brD(w.until)}</b>${w.state === 'valid' ? (w.left ? ` (falta${w.left > 1 ? 'm' : ''} ${w.left} dia${w.left > 1 ? 's' : ''})` : ' (último dia)') : ''}` : ''}</small>
${doc ? `<small>CPF/CNPJ: ${esc(doc)}</small>` : ''}${u.lastOsNumber ? `<small style="color:var(--warning)">${ic('rotate-ccw', 'rotate-left')} OS de garantia: ${osNo(u.lastOsNumber)}</small>` : ''}
<div class="acts">${num(u.warrantyDays) > 0 ? `<button type="button" class="btn btn-outline btn-sm" data-sn-cert="${esc(u.id)}">${ic('shield-check', 'shield-halved')} Certificado</button>` : ''}<button type="button" class="btn btn-primary btn-sm" data-sn-os="${esc(u.id)}">${ic('wrench', 'wrench')} Abrir OS de garantia</button></div></article>`;
    }
    /** Gancho do garantias-v1.js (results): põe os aparelhos na lista. Devolve quantos achou. */
    function garantiaCards(qs, res, customers) {
        if (!res) return 0;
        if (!gar) {
            if (!garLoading) garLoading = garLoad().then(() => { const q = $('garQ'); if (q) q.dispatchEvent(new Event('input')); if (garZero) { garZero = false; const el = $('garStValid'); if (el) el.textContent = num(el.textContent) + inWarrantyCount(); } }).catch(e => console.warn('seriais (garantias):', e));
            return 0;
        }
        const q = norm(qs).trim(), d = digits(qs);
        let list;
        if (!q) list = gar.filter(u => u.status === 'sold' && wState(u).state === 'valid');
        else list = gar.filter(u => {
            const c = (customers && customers[u.customerId]) || {};
            const codeHit = d.length >= 4 && (digits(u.code).includes(d) || digits(u.imei2).includes(d)) || (q.length >= 4 && codeKey(qs).length >= 4 && codeKey(u.code).includes(codeKey(qs)));
            if (u.status === 'in_stock' || u.status === 'removed') return codeHit; // no estoque: só pelo número
            if (codeHit) return true;
            const cdoc = digits(c.document || c.cpf || c.cpfCnpj), tel = digits(c.phone || c.whatsapp || c.telefone);
            if (d.length >= 4 && ((cdoc && cdoc === d) || (tel && tel.includes(d)) || (u.saleNumber && String(u.saleNumber) === d.replace(/^0+/, '')))) return true;
            return norm([u.customerName, c.name, u.productName].join(' ')).includes(q);
        });
        list.sort((a, b) => num(b.soldAtMs || b.createdAtMs) - num(a.soldAtMs || a.createdAtMs));
        if (!list.length) return 0;
        css();
        res.querySelectorAll('.dpu-empty').forEach(x => x.remove());
        const intro = res.querySelector(':scope > p');
        res.insertAdjacentHTML('afterbegin', list.slice(0, 60).map(u => garCard(u, customers)).join(''));
        if (intro) res.insertAdjacentElement('afterbegin', intro);
        return list.length;
    }
    async function printCert(id) {
        const u = (gar || []).find(x => x.id === id); if (!u) return;
        const P = window.OSPRO;
        const win = window.open('', '_blank', 'width=900,height=1000');
        if (!win) { toast('warning', 'Libere as janelas pop-up para imprimir.'); return; }
        try {
            const co = P && P.company ? await P.company() : { name: 'Minha empresa' };
            let c = {}; try { if (u.customerId) { const x = await db.collection('customers').doc(u.customerId).get(); c = x.exists ? (x.data() || {}) : {}; } } catch (e) { }
            const w = wState(u), days = num(u.warrantyDays), terms = garSettings.deviceWarrantyTerms || DEFAULT_DEVICE_TERMS;
            const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp].filter(Boolean).map(esc).join(' · ');
            const inner = `<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${co.legal && co.legal !== co.name ? esc(co.legal) + '<br>' : ''}${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">CERTIFICADO DE GARANTIA</div><div class="n">${u.saleNumber ? 'Venda ' + esc(saleNo(u.saleNumber).replace('#', '')) : 'Aparelho'}</div><p>Emitido em ${brD(Date.now())}</p><p>Válido até <b>${brD(w.until)}</b></p><span class="st">${days} dias de garantia</span></div></div>
<div class="box"><h3>Cliente</h3><div><div class="l">Cliente</div><div class="v">${esc(u.customerName || c.name || '—')}</div></div><div><div class="l">Telefone</div><div class="v">${esc(c.phone || c.whatsapp || c.telefone || '—')}</div></div><div><div class="l">CPF / CNPJ</div><div class="v">${esc(c.document || c.cpf || c.cpfCnpj || '—')}</div></div>${u.sellerName ? `<div><div class="l">Vendedor</div><div class="v">${esc(u.sellerName)}</div></div>` : ''}</div>
<div class="box"><h3>Aparelho</h3><div><div class="l">Aparelho</div><div class="v">${esc(u.productName || '—')}</div></div><div><div class="l">${u.kind === 'serial' ? 'Nº de série' : 'IMEI'}</div><div class="v">${esc(codeOf(u))}${u.imei2 ? ' / ' + esc(u.imei2) : ''}</div></div><div><div class="l">Data da compra</div><div class="v">${brD(u.soldAtMs)}</div></div><div><div class="l">Venda</div><div class="v">${u.saleNumber ? esc(saleNo(u.saleNumber)) : '—'}</div></div></div>
<div class="big"><div><div class="l">Prazo da garantia</div><b>${days} dias</b><div style="font-size:12px;margin-top:4px">de <b>${brD(u.soldAtMs)}</b> até <b>${brD(w.until)}</b></div></div></div>
<div class="terms"><b>Condições da garantia</b>${esc(terms)}</div>
<div class="sign"><div>${esc(co.name)}</div><div>De acordo — ${esc(u.customerName || 'Cliente')}</div></div>
<div class="ft">Apresente este certificado (ou informe o IMEI/CPF) para atendimento em garantia. ${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}</div>`;
            if (P && P.writeA4) P.writeA4(win, 'Garantia ' + codeOf(u), inner);
            else { win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Garantia</title></head><body style="font-family:Arial,sans-serif;padding:20px">${inner}</body></html>`); win.document.close(); }
        } catch (e) { try { win.close(); } catch (x) { } toast('error', e.message); }
    }
    async function openWarrantyOS(id) {
        const u = (gar || []).find(x => x.id === id); if (!u) return;
        const w = wState(u);
        if (w.state !== 'valid' && !confirm(`A garantia deste aparelho ${w.state === 'expired' ? 'venceu em ' + brD(w.until) : 'não está ativa'}. Abrir a OS mesmo assim?`)) return;
        const P = window.OSPRO;
        const html = `<h3>${ic('wrench', 'wrench')} Garantia do aparelho vendido</h3><p class="osp-sub">${esc(u.productName || '')} · ${esc(numTxt(u))} · ${esc(u.customerName || '')}${u.saleNumber ? ' · venda ' + saleNo(u.saleNumber) : ''}. A OS é aberta <b>sem cobrança</b>, já com o aparelho e o cliente.</p><label class="osp-lbl">O que aconteceu? *<textarea class="form-control" rows="3" data-why maxlength="400" placeholder="Ex.: o aparelho não carrega mais"></textarea></label><div class="osp-acts"><button type="button" class="btn btn-primary" data-ok>${ic('check', 'check')} Abrir OS de garantia</button></div>`;
        let ov;
        if (P && P.dlg) ov = P.dlg(html);
        else { ov = overlay({ title: 'Garantia do aparelho vendido', icon: ic('wrench', 'wrench'), body: html }); ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', () => ov.remove())); }
        setTimeout(() => { const t = ov.querySelector('[data-why]'); if (t) t.focus(); }, 60);
        ov.querySelector('[data-ok]').addEventListener('click', async ev => {
            const why = ov.querySelector('[data-why]').value.trim(); if (!why) { toast('warning', 'Descreva o problema.'); return; }
            const btn = ev.currentTarget; btn.disabled = true;
            try {
                let p = {}; try { const d = await db.collection('products').doc(u.productId).get(); p = d.exists ? (d.data() || {}) : {}; } catch (e) { }
                const s = await db.collection('settings').doc(DOC()).get(); const seq = (s.exists ? Number((s.data() || {}).serviceOrderSequence || 0) : 0) + 1;
                await db.collection('settings').doc(DOC()).set({ serviceOrderSequence: seq }, { merge: true });
                const sale = u.saleNumber ? ` (venda ${saleNo(u.saleNumber)} de ${brD(u.soldAtMs)})` : ` (vendido em ${brD(u.soldAtMs)})`;
                const ref = await db.collection('service_orders').add({
                    customerId: u.customerId || '', customerName: u.customerName || '', deviceType: u.kind === 'serial' ? (p.category || 'Aparelho') : 'Celular', brand: p.brand || '', model: u.productName || '',
                    imei: u.kind === 'serial' ? '' : (u.imei || ''), serial: u.kind === 'serial' ? (u.serial || u.code || '') : (u.imei2 ? 'IMEI 2: ' + u.imei2 : ''), accessories: '', entryCondition: '',
                    problemReported: `Garantia do aparelho vendido${sale}: ${why}`, diagnosis: '', serviceDescription: '', partsDescription: '', technicianId: null, technicianName: '',
                    laborValue: 0, partsValue: 0, discount: 0, total: 0, status: 'received',
                    statusHistory: [{ status: 'received', label: `OS de garantia aberta (aparelho vendido${sale})`, at: new Date().toISOString(), by: uname(), uid: uid() }],
                    warrantyDays: 0, estimatedDate: null, notes: '', isWarranty: true, warrantyOfSale: u.saleId || '', warrantyOfSaleNumber: Number(u.saleNumber || 0), serialId: u.id,
                    orderNumber: seq, deleted: false, paymentStatus: 'pending', createdAt: ts(), createdBy: uid(), updatedAt: ts()
                });
                try { await setUnit(u.id, { lastOsId: ref.id, lastOsNumber: seq }, `OS de garantia ${osNo(seq)} aberta: ${why}`); } catch (e) { }
                ov.remove(); toast('success', `${osNo(seq)} de garantia aberta.`);
                location.href = 'ordens-servico.html?os=' + encodeURIComponent(ref.id);
            } catch (e) { btn.disabled = false; toast('error', 'Não foi possível abrir: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
    }
    // Texto do certificado do aparelho (aba "Texto da garantia")
    function mountTermsEditor(body) {
        if (!body || body.querySelector('#snTerms')) return;
        const card = document.createElement('div'); card.className = 'card'; card.style.cssText = 'padding:18px;margin-top:16px';
        card.innerHTML = `<h3 style="margin:0 0 6px;color:var(--text-heading);display:flex;align-items:center;gap:8px">${ic('smartphone', 'mobile-screen')} Garantia do aparelho vendido</h3><p style="margin:0 0 12px;color:var(--text-muted);font-size:13px">Sai no certificado dos aparelhos vendidos com IMEI ou nº de série. O prazo de cada produto fica no cadastro (Produtos › Controlar IMEI).</p><textarea id="snTerms" class="form-control" rows="7"></textarea><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px;flex-wrap:wrap"><button type="button" class="btn btn-outline" id="snTermsReset">Usar o texto padrão</button><button type="button" class="btn btn-primary" id="snTermsSave">${ic('check', 'check')} Salvar texto</button></div>`;
        body.appendChild(card);
        const t = $('snTerms'); t.value = garSettings.deviceWarrantyTerms || DEFAULT_DEVICE_TERMS;
        if (!gar && !garLoading) garLoading = garLoad().then(() => { if (document.activeElement !== t && !t.dataset.touched) t.value = garSettings.deviceWarrantyTerms || DEFAULT_DEVICE_TERMS; }).catch(() => { });
        t.addEventListener('input', () => { t.dataset.touched = '1'; });
        $('snTermsReset').addEventListener('click', () => { t.value = DEFAULT_DEVICE_TERMS; t.dataset.touched = '1'; });
        $('snTermsSave').addEventListener('click', async () => { try { const v = t.value.trim(); await db.collection('settings').doc(DOC()).set({ deviceWarrantyTerms: v }, { merge: true }); garSettings.deviceWarrantyTerms = v; toast('success', 'Texto da garantia do aparelho salvo.'); } catch (e) { toast('error', e.message); } });
    }
    function setupGarantias() {
        if (!$('garRoot')) return;
        css();
        if (!gar && !garLoading) garLoading = garLoad().then(() => { if (garZero) { garZero = false; const el = $('garStValid'); if (el) el.textContent = num(el.textContent) + inWarrantyCount(); } const q = $('garQ'); if (q) q.dispatchEvent(new Event('input')); }).catch(e => console.warn('seriais (garantias):', e));
        document.addEventListener('click', e => {
            const c = e.target.closest && e.target.closest('[data-sn-cert]'); if (c) { printCert(c.dataset.snCert); return; }
            const o = e.target.closest && e.target.closest('[data-sn-os]'); if (o) openWarrantyOS(o.dataset.snOs);
        });
    }

    window.DPSerial = { imeiOk, parseList, kindOf, isSerial, warrantyOf, saleFields, pedirSeriais, seriaisDaCompra, onPurchaseCancelled, onSaleCancelled, checkEdit, onSaleEdited, onReturn, garantiaCards, inWarrantyCount, mountTermsEditor, openPanel, picker, register, conferir, loadScan };


    /* =================== Início =================== */
    function start() {
        wrapStock(); wrapSales();
        try { setupProdutos(); } catch (e) { console.warn('seriais (produtos):', e); }
        try { setupEstoque(); } catch (e) { console.warn('seriais (estoque):', e); }
        try { setupPdv(); } catch (e) { console.warn('seriais (PDV):', e); }
        try { setupGarantias(); } catch (e) { console.warn('seriais (garantias):', e); }
    }
    const boot = () => {
        wrapStock(); wrapSales();
        let done = false;
        const go = () => { if (done) return; done = true; start(); };
        try { if (typeof auth !== 'undefined' && auth && typeof auth.onAuthStateChanged === 'function') { auth.onAuthStateChanged(u => { if (u) go(); }); return; } } catch (e) { }
        go();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else setTimeout(boot, 0);
})();
