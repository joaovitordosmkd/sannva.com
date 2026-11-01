/* DistribuiPro 38.4 · Entregas completas (todas as versões) — window.DPEntregas.
   Para quem entrega todo dia: distribuidora (rota e caminhão), pizzaria/delivery (motoboy), mercado, pet shop, gás e água.
   - Taxa por bairro: settings/general.deliveryZones [{ name, fee, routeId }], em Configurações › Vendas, logo abaixo da
     taxa padrão. No PDV, o bairro do cliente (sem acento, maiúscula ou minúscula) já escolhe o bairro e põe a taxa.
   - Rotas: coleção routes { name, weekdays:[0-6, 0 = domingo], neighborhoods:[], driverId, driverName }; customers.routeId.
   - Venda de entrega feita no PDV: deliveryNeighborhood, deliveryDate ('AAAA-MM-DD'), routeId, routeName, payOnDelivery,
     expectedMethod, changeFor, changeToTake e settledAt. A via mostra "COBRAR R$ 58,00 · Dinheiro · levar troco R$ 42,00".
     O caixa continua registrando a venda como sempre.
   - Cargas e acertos: coleção delivery_runs { number, date, routeId, routeName, driverId, driverName, saleIds:[],
     status:'carregando'|'em_rota'|'acertado', changeTaken, settlement:{ cash, pix, card, fiado, paid, other, changeTaken,
     driverFee, feePaidFromCash, cashToReturn, notDelivered:[], bottlesBack:{}, notes } }.
   - Entregas: abas "Rotas e carga" (romaneio, Google Maps, saiu para entrega) e "Acerto do entregador" (dinheiro a devolver,
     cartão e Pix, taxa do entregador, sangria opcional; o que não foi entregue volta para a próxima data da rota; os cascos
     que não voltaram vão para o Vasilhames).
   - Pedidos: data agendada, rota e cobrança no cartão do delivery e filtro por data. Motoboys: rotas e acerto pendente.
     Clientes: rota do cliente. Relatórios › Entregas lê o bairro (pages.js).
   - Só do Mensal (bloco no fim; a demo mostra com o selo "Mensal"): melhor ordem das paradas pelo mapa e os bairros do
     Cardápio digital. */
(function () {
    'use strict';
    if (window.DPEntregas) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const num = v => { if (typeof v === 'number') return Number.isFinite(v) ? v : 0; const s = String(v ?? '').trim().replace(/\s|R\$/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const int = v => Math.max(0, Math.round(num(v)));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const num2 = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const fq = q => (Number(q) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const words = s => ' ' + norm(s).replace(/[^a-z0-9]+/g, ' ').trim() + ' ';
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const me = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } };
    const meName = () => { try { return me().name || (auth.currentUser && (auth.currentUser.displayName || auth.currentUser.email)) || 'Operador'; } catch (e) { return 'Operador'; } };
    const toDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || v.value || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const okNum = v => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v));
    const pill = () => (window.DPEdition && typeof DPEdition.pill === 'function' ? DPEdition.pill() : '');
    const saleNo = s => '#V-' + String((s && (s.saleNumber || s.orderNumber)) || 0).padStart(4, '0');
    const custName = s => (s && s.customerName && !/^consumidor final$/i.test(String(s.customerName).trim())) ? s.customerName : 'Cliente sem cadastro';
    const plural = (n, a, b) => `${fq(n)} ${Number(n) === 1 ? a : b}`;
    const MENSAL = {}; // preenchido no bloco do fim (só Mensal e demo)

    /* =================== Datas =================== */
    const pad = n => String(n).padStart(2, '0');
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const parseYmd = s => { const p = String(s || '').split('-').map(Number); return new Date(p[0], (p[1] || 1) - 1, p[2] || 1); };
    const today = () => ymd(new Date());
    const addDays = (s, n) => { const d = parseYmd(s); d.setDate(d.getDate() + n); return ymd(d); };
    const dow = s => parseYmd(s).getDay();
    const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
    const WDL = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
    const fmtDay = s => { const d = parseYmd(s); return `${WD[d.getDay()]} ${pad(d.getDate())}/${pad(d.getMonth() + 1)}`; };
    const dayLabel = s => s === today() ? 'hoje' : s === addDays(today(), 1) ? 'amanhã' : s === addDays(today(), -1) ? 'ontem' : fmtDay(s);
    const wdText = list => { const l = [...new Set((list || []).map(Number))].filter(n => n >= 0 && n <= 6).sort(); if (!l.length) return ''; if (l.length === 7) return 'todo dia'; const t = l.map(n => WD[n]); return t.length > 1 ? t.slice(0, -1).join(', ') + ' e ' + t[t.length - 1] : t[0]; };
    /** Dia da entrega: a data agendada ou o dia em que a venda foi feita */
    const saleDay = s => (s && /^\d{4}-\d{2}-\d{2}$/.test(String(s.deliveryDate || ''))) ? s.deliveryDate : (toDate(s && s.createdAt) ? ymd(toDate(s.createdAt)) : today());

    /* =================== Configuração (bairros, rotas, entregadores) =================== */
    const D = { general: {}, zones: [], routes: [], motoboys: [], at: 0, loading: null };
    const byName = (a, b) => String(a.name || a.nome || '').localeCompare(String(b.name || b.nome || ''), 'pt-BR');
    const cleanZones = l => (Array.isArray(l) ? l : []).filter(z => z && String(z.name || '').trim()).map(z => ({ name: String(z.name).trim(), fee: r2(num(z.fee)), routeId: String(z.routeId || '') })).sort(byName);
    function loadCfg(force) {
        if (!force && D.at && Date.now() - D.at < 20000) return Promise.resolve(D);
        if (D.loading && !force) return D.loading;
        D.loading = (async () => {
            try {
                const [g, r, m] = await Promise.all([
                    db.collection('settings').doc('general').get().then(s => s.exists ? (s.data() || {}) : {}).catch(() => ({})),
                    db.collection('routes').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted)).catch(() => []),
                    db.collection('motoboys').get().then(s => s.docs.map(d => ({ id: d.id, ...d.data(), name: (d.data() || {}).name || (d.data() || {}).nome || 'Entregador' })).filter(x => !x.deleted)).catch(() => [])
                ]);
                D.general = g; D.zones = cleanZones(g.deliveryZones); D.routes = r.sort(byName); D.motoboys = m.sort(byName); D.at = Date.now();
            } catch (e) { console.warn('entregas: configuração', e); }
            D.loading = null;
            return D;
        })();
        return D.loading;
    }
    const routeOf = id => (id && D.routes.find(r => r.id === id)) || null;
    const driverOf = id => (id && D.motoboys.find(m => m.id === id)) || null;
    const activeDrivers = () => D.motoboys.filter(m => m.status !== 'inactive');
    const zoneFor = nb => { const k = norm(nb); return k ? (D.zones.find(z => norm(z.name) === k) || null) : null; };
    /** Bairro escrito no meio do endereço ("Rua X, 100, Setor Sul") — o nome mais comprido que aparecer */
    function zoneInText(text) {
        const t = words(text); let best = null;
        D.zones.forEach(z => { const k = words(z.name); if (k.trim() && t.includes(k) && (!best || k.length > best.k)) best = { z, k: k.length }; });
        return best ? best.z : null;
    }
    function routeForNb(nb) {
        const z = zoneFor(nb); if (z && routeOf(z.routeId)) return routeOf(z.routeId);
        const k = norm(nb); return k ? (D.routes.find(r => (r.neighborhoods || []).some(n => norm(n) === k)) || null) : null;
    }
    const routeForCustomer = c => (c && routeOf(c.routeId)) || routeForNb(c && (c.neighborhood || c.bairro));
    /** Próximo dia em que a rota passa (from incluso ou não). Sem dias marcados: o dia seguinte. */
    function nextRouteDay(route, from, include) {
        const wd = ((route && route.weekdays) || []).map(Number);
        if (!wd.length) return include ? from : addDays(from, 1);
        for (let i = include ? 0 : 1; i <= 14; i++) { const d = addDays(from, i); if (wd.includes(dow(d))) return d; }
        return addDays(from, 1);
    }
    async function saveZones(zones) {
        const list = cleanZones(zones);
        await db.collection('settings').doc('general').set({ deliveryZones: list, updatedAt: ts() }, { merge: true });
        D.zones = list; D.general.deliveryZones = list;
        // A rota de cada bairro fica também na rota (neighborhoods), para quem lê só a rota
        const zoneNames = new Set(list.map(z => norm(z.name)));
        for (const r of D.routes) {
            const keep = (r.neighborhoods || []).filter(n => !zoneNames.has(norm(n)));
            const mine = list.filter(z => z.routeId === r.id).map(z => z.name);
            const next = [...new Set([...mine, ...keep])];
            if (JSON.stringify(next) !== JSON.stringify(r.neighborhoods || [])) { try { await db.collection('routes').doc(r.id).update({ neighborhoods: next, updatedAt: ts() }); r.neighborhoods = next; } catch (e) { } }
        }
        return list;
    }

    /* =================== Pagamento: o que cobrar na porta =================== */
    const METHOD = { dinheiro: 'Dinheiro', pix: 'Pix', credito: 'Cartão de crédito', debito: 'Cartão de débito', fiado: 'Fiado', multi: 'Vários', vale: 'Vale-troca' };
    const mLabel = m => METHOD[m] || (window.DPPayMethods && DPPayMethods.label && DPPayMethods.label(m)) || m || '—';
    function bucket(m) {
        if (m === 'dinheiro') return 'cash'; if (m === 'pix') return 'pix'; if (m === 'credito' || m === 'debito') return 'card'; if (m === 'fiado') return 'fiado'; if (m === 'vale') return 'paid';
        const k = window.DPPayMethods && DPPayMethods.kindOf ? DPPayMethods.kindOf(m) : 'outro';
        return k === 'dinheiro' ? 'cash' : k === 'pix' ? 'pix' : (k === 'credito' || k === 'debito') ? 'card' : 'other';
    }
    function partsOf(s) {
        const p = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod || 'dinheiro', amount: s.total }];
        return p.filter(x => x && num(x.amount) > 0).map(x => ({ method: x.method || 'dinheiro', amount: r2(x.amount), bucket: bucket(x.method || 'dinheiro'), cashReceived: num(x.cashReceived) }));
    }
    /** Quanto o entregador cobra na porta, em que forma e o troco que ele leva. Venda antiga (sem a marcação) = cobra na entrega. */
    function collectInfo(s) {
        const parts = partsOf(s || {});
        const pod = !s || s.payOnDelivery !== false;
        const toCollect = pod ? parts.filter(p => p.bucket !== 'fiado' && p.bucket !== 'paid') : [];
        const amount = r2(toCollect.reduce((a, p) => a + p.amount, 0));
        const cash = r2(toCollect.filter(p => p.bucket === 'cash').reduce((a, p) => a + p.amount, 0));
        const fiado = r2(parts.filter(p => p.bucket === 'fiado').reduce((a, p) => a + p.amount, 0));
        const paid = r2(parts.reduce((a, p) => a + p.amount, 0) - amount - fiado);
        let changeFor = num(s && s.changeFor);
        if (!changeFor) { const c = toCollect.find(p => p.bucket === 'cash' && p.cashReceived > p.amount + 0.004); if (c) changeFor = c.cashReceived; }
        const changeToTake = pod && cash > 0 && changeFor > cash + 0.004 ? r2(changeFor - cash) : 0;
        return { pod, parts, toCollect, amount, cash, fiado, paid, changeFor: changeToTake ? r2(changeFor) : 0, changeToTake, method: toCollect.length === 1 ? toCollect[0].method : toCollect.length ? 'multi' : '' };
    }
    /** "COBRAR R$ 58,00 · Dinheiro · levar troco R$ 42,00" (via do entregador) */
    function payLine(s) {
        if (!s || s.type !== 'delivery') return '';
        const c = collectInfo(s);
        if (!c.amount) return c.fiado ? 'FIADO · nada a cobrar na entrega' : 'JÁ PAGO · não cobrar na entrega';
        let t = 'COBRAR ' + money(c.amount) + ' · ' + (c.toCollect.length > 1 ? c.toCollect.map(p => mLabel(p.method) + ' ' + money(p.amount)).join(' + ') : mLabel(c.method));
        if (c.changeToTake) t += ' · levar troco ' + money(c.changeToTake);
        else if (c.toCollect.some(p => p.bucket === 'card')) t += ' · levar a maquininha';
        if (c.fiado) t += ' · ' + money(c.fiado) + ' no fiado';
        return t;
    }
    /** Bloco da via impressa (PDV e 2ª via em Pedidos) */
    function receiptHtml(s) {
        if (!s || s.type !== 'delivery') return '';
        const line = payLine(s), out = [];
        out.push(`<div style="font-size:13px;font-weight:bold;border:1.5px solid #000;border-radius:3px;padding:4px 6px;margin:5px 0 3px;text-align:center;line-height:1.3">${esc(line)}</div>`);
        const made = toDate(s.createdAt), day = s.deliveryDate && /^\d{4}-/.test(s.deliveryDate) ? s.deliveryDate : '';
        if (day && (!made || ymd(made) !== day)) out.push(`<div style="font-size:12px;font-weight:bold">Entregar em: ${esc(fmtDay(day))}</div>`);
        const info = [s.deliveryNeighborhood ? 'Bairro: ' + s.deliveryNeighborhood : '', s.routeName ? 'Rota: ' + s.routeName : ''].filter(Boolean).join(' · ');
        if (info) out.push(`<div style="font-size:11px">${esc(info)}</div>`);
        return out.join('');
    }

    /* =================== Estilo =================== */
    const CSS = `.dpe-pdv{display:flex;flex-direction:column;gap:6px;margin-top:6px}
.dpe-g2{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.dpe-f{display:flex;flex-direction:column;gap:3px;min-width:0}
.dpe-f>span{font-size:10.5px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px}
.dpe-f select,.dpe-f input,.dpe-troco input{width:100%;min-width:0;padding:7px 9px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:var(--radius-md,8px);color:var(--text-primary);font-size:12px;font-family:var(--font-body,inherit)}
.dpe-f select:focus,.dpe-f input:focus,.dpe-troco input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-muted,rgba(99,102,241,.15))}
.dpe-pay{display:flex;align-items:center;gap:8px;flex-wrap:wrap;min-height:30px}
.dpe-chk{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--text-primary);cursor:pointer;user-select:none}
.dpe-chk input{width:16px;height:16px;accent-color:var(--accent);margin:0}
.dpe-troco{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:var(--text-muted);margin-left:auto}.dpe-troco input{width:96px;text-align:right;font-weight:700}
.dpe-hint{font-size:11.5px;color:var(--text-muted);line-height:1.4}.dpe-hint b{color:var(--text-primary)}.dpe-hint .warn{color:#b45309;font-weight:600}
.dpe-sum-l{margin-top:8px;font-size:12.5px;font-weight:700;color:var(--accent)}
.dpe-pdv [hidden],.dpe-m [hidden],.dpe-zbox [hidden],#dpeCliRotaG[hidden]{display:none!important}
.dpe-tabs{display:flex;gap:4px;margin:0 0 18px;border-bottom:1px solid var(--border-color);overflow-x:auto;scrollbar-width:none}
.dpe-tabs button{display:inline-flex;align-items:center;gap:8px;border:none;background:none;padding:10px 14px;font:inherit;font-size:13.5px;font-weight:600;color:var(--text-muted);cursor:pointer;border-bottom:2px solid transparent;margin-bottom:-1px;white-space:nowrap}
.dpe-tabs button:hover{color:var(--text-primary)}.dpe-tabs button.on{color:var(--accent);border-bottom-color:var(--accent)}
.dpe-tabs .ct{font-size:11px;font-weight:700;border-radius:999px;padding:0 7px;line-height:18px;background:var(--accent-muted,rgba(99,102,241,.12));color:var(--accent)}
.dpe-bar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:16px}.dpe-bar .sp{flex:1}
.dpe-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;background:var(--bg-card)}
.dpe-seg button{border:none;background:none;padding:8px 13px;font:inherit;font-size:12.5px;font-weight:600;color:var(--text-secondary);cursor:pointer}
.dpe-seg button+button{border-left:1px solid var(--border-color)}.dpe-seg button.on{background:var(--accent);color:#fff}
.dpe-in{height:36px;padding:6px 10px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input,var(--bg-card));color:var(--text-primary);font:inherit;font-size:13px;min-width:0}
.dpe-btn{display:inline-flex;align-items:center;justify-content:center;gap:7px;border:1px solid var(--border-color);background:var(--bg-card);color:var(--text-primary);border-radius:10px;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;text-decoration:none;line-height:1.2}
.dpe-btn:hover{border-color:var(--accent);color:var(--accent)}.dpe-btn.pri{background:var(--accent);border-color:var(--accent);color:#fff}.dpe-btn.pri:hover{filter:brightness(1.08);color:#fff}
.dpe-btn.ok{background:#059669;border-color:#059669;color:#fff}.dpe-btn.ok:hover{filter:brightness(1.08);color:#fff}.dpe-btn.dg{color:#dc2626}.dpe-btn:disabled{opacity:.55;cursor:default}
.dpe-btn.sm{padding:5px 9px;font-size:12px;border-radius:8px}.dpe-btn .dp-ed-pill{margin-left:4px}
.dpe-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:16px;align-items:start}
.dpe-card{background:var(--bg-card);border:1px solid var(--border-color);border-radius:16px;overflow:hidden;display:flex;flex-direction:column}
.dpe-card>header{display:flex;align-items:center;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-color)}
.dpe-ic{flex:none;width:40px;height:40px;border-radius:12px;display:grid;place-items:center;background:rgba(99,102,241,.12);color:var(--accent);font-size:18px}
.dpe-ic.run{background:rgba(245,158,11,.14);color:#d97706}.dpe-ic.done{background:rgba(16,185,129,.13);color:#059669}.dpe-ic.go{background:rgba(59,130,246,.13);color:#2563eb}
.dpe-card>header>div:not(.dpe-kp){flex:1 1 auto;min-width:0}
.dpe-card h4{margin:0;font-size:15px;color:var(--text-heading);display:flex;align-items:center;gap:8px;flex-wrap:wrap}.dpe-card header small{display:block;font-size:12px;color:var(--text-muted);margin-top:2px}
.dpe-kp{margin-left:auto;text-align:right;flex:none}.dpe-kp b{display:block;font-size:15px;color:var(--text-heading)}.dpe-kp small{font-size:11.5px;color:var(--text-muted)}
.dpe-stops{list-style:none;margin:0;padding:4px 0}
.dpe-stops li{display:grid;grid-template-columns:26px minmax(0,1fr) auto;gap:10px;align-items:start;padding:9px 16px;border-bottom:1px dashed var(--border-color)}.dpe-stops li:last-child{border-bottom:none}
.dpe-n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;background:var(--bg-secondary);font-size:11.5px;font-weight:800;color:var(--text-secondary)}
.dpe-stops b{font-size:13px;color:var(--text-primary)}.dpe-stops small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.4;overflow-wrap:anywhere}
.dpe-r{text-align:right;white-space:nowrap}.dpe-r b{font-size:13px}.dpe-r small{white-space:normal;max-width:170px;margin-left:auto}
.dpe-card>footer{display:flex;gap:8px;flex-wrap:wrap;padding:12px 16px;border-top:1px solid var(--border-color);background:var(--bg-secondary)}
.dpe-tag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;border-radius:999px;padding:2px 9px;background:var(--bg-secondary);color:var(--text-secondary);white-space:nowrap;line-height:17px}
.dpe-tag.t-new{background:rgba(99,102,241,.12);color:var(--accent)}.dpe-tag.t-load{background:rgba(245,158,11,.15);color:#b45309}.dpe-tag.t-go{background:rgba(59,130,246,.13);color:#2563eb}
.dpe-tag.t-ok{background:rgba(16,185,129,.13);color:#047857}.dpe-tag.t-late{background:rgba(239,68,68,.12);color:#dc2626}.dpe-tag.t-pay{background:rgba(16,185,129,.1);color:#047857}
[data-theme="dark"] .dpe-tag.t-load{color:#fbbf24}[data-theme="dark"] .dpe-tag.t-ok,[data-theme="dark"] .dpe-tag.t-pay{color:#34d399}[data-theme="dark"] .dpe-tag.t-go{color:#60a5fa}[data-theme="dark"] .dpe-tag.t-late{color:#f87171}
.dpe-chips{display:flex;gap:5px;flex-wrap:wrap;margin-top:8px}.kanban-card .dpe-chips{margin-top:6px}
.dpe-empty{text-align:center;padding:40px 16px;color:var(--text-muted);font-size:13px;line-height:1.5}.dpe-empty>i,.dpe-empty>svg{display:block;font-size:30px;width:30px;height:30px;opacity:.35;margin:0 auto 10px}
.dpe-note{display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:10px 14px;border-radius:12px;margin-bottom:14px;font-size:13px;background:rgba(245,158,11,.1);border:1px solid rgba(217,119,6,.3);color:var(--text-primary)}.dpe-note>i,.dpe-note>svg{color:#d97706}
.dpe-note.info{background:rgba(99,102,241,.07);border-color:rgba(99,102,241,.25)}.dpe-note.info>i,.dpe-note.info>svg{color:var(--accent)}
.dpe-m .modal{max-width:780px;width:min(96vw,780px)}.dpe-m.sm .modal{max-width:520px}.dpe-m .modal-body{max-height:calc(92vh - 140px);overflow:auto}
.dpe-m .modal-footer{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.dpe-fl{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin:0 0 4px}.dpe-fg{margin-bottom:12px}.dpe-fg small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:4px}
.dpe-g{display:grid;grid-template-columns:1fr 1fr;gap:12px}
.dpe-days{display:flex;gap:6px;flex-wrap:wrap}.dpe-days label{cursor:pointer}.dpe-days input{display:none}
.dpe-days span{display:inline-block;min-width:44px;text-align:center;padding:7px 9px;border:1px solid var(--border-color);border-radius:10px;font-size:12.5px;font-weight:600;color:var(--text-secondary);background:var(--bg-card)}
.dpe-days input:checked+span{background:var(--accent);border-color:var(--accent);color:#fff}
.dpe-nbs{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:6px;max-height:220px;overflow:auto;padding:2px}
.dpe-nbs label{display:flex;align-items:center;gap:7px;font-size:12.5px;padding:6px 9px;border:1px solid var(--border-color);border-radius:9px;cursor:pointer;background:var(--bg-card)}.dpe-nbs label small{margin-left:auto;color:var(--text-muted);font-size:11px}
.dpe-nbs input{accent-color:var(--accent)}
.dpe-rl{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}
.dpe-ri{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-card)}.dpe-ri div{flex:1;min-width:0}.dpe-ri b{display:block;font-size:13.5px;color:var(--text-heading)}.dpe-ri small{display:block;font-size:12px;color:var(--text-muted);overflow-wrap:anywhere}
.dpe-ol{display:flex;flex-direction:column;gap:6px}
.dpe-oi{display:grid;grid-template-columns:22px 24px minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--border-color);border-radius:11px;background:var(--bg-card)}
.dpe-oi.off{opacity:.5}.dpe-oi b{font-size:13px}.dpe-oi small{display:block;font-size:11.5px;color:var(--text-muted);overflow-wrap:anywhere}.dpe-oi input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent)}
.dpe-mv{display:flex;flex-direction:column;gap:2px}.dpe-mv button{border:1px solid var(--border-color);background:var(--bg-secondary);color:var(--text-secondary);border-radius:6px;width:28px;height:20px;display:grid;place-items:center;cursor:pointer;font-size:10px;padding:0}.dpe-mv button:hover{color:var(--accent);border-color:var(--accent)}
.dpe-prog{font-size:12px;color:var(--accent);font-weight:600;margin-top:8px}
.dpe-ar{display:grid;grid-template-columns:24px minmax(0,1fr) minmax(170px,auto);gap:10px;align-items:start;padding:10px 0;border-bottom:1px dashed var(--border-color)}.dpe-ar:last-child{border-bottom:none}
.dpe-ar.off .dpe-ai b{text-decoration:line-through;opacity:.7}.dpe-ar input[type=checkbox]{width:18px;height:18px;accent-color:#059669;margin-top:1px}
.dpe-ai b{font-size:13px;color:var(--text-primary)}.dpe-ai small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.4;overflow-wrap:anywhere}.dpe-ai .exp{color:var(--text-secondary);font-weight:600}
.dpe-ax{display:flex;flex-direction:column;gap:5px;align-items:stretch}.dpe-ax select,.dpe-ax input{height:32px;padding:4px 8px;font-size:12.5px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input,var(--bg-card));color:var(--text-primary)}
.dpe-ax label{font-size:11px;color:var(--text-muted);font-weight:600;display:flex;align-items:center;gap:6px;justify-content:space-between}.dpe-ax label input{width:64px;text-align:center}
.dpe-ax .warn{font-size:11px;color:#b45309;line-height:1.35}
.dpe-sum{border:1px solid var(--border-color);border-radius:14px;padding:12px 14px;background:var(--bg-secondary);margin-top:12px}
.dpe-sum .ln{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:5px 0;font-size:13px;color:var(--text-secondary)}.dpe-sum .ln b{color:var(--text-primary)}
.dpe-sum .ln input{width:110px;height:32px;text-align:right;font-weight:700;border:1px solid var(--border-color);border-radius:8px;padding:4px 8px;background:var(--bg-input,var(--bg-card));color:var(--text-primary)}
.dpe-sum .tot{border-top:1px solid var(--border-color);margin-top:6px;padding-top:9px;font-size:14px;color:var(--text-heading);font-weight:700}.dpe-sum .tot b{font-size:21px;color:#059669}
.dpe-sum .mini{display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;margin-top:10px}.dpe-sum .mini div{background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;padding:7px 9px}.dpe-sum .mini small{display:block;font-size:11px;color:var(--text-muted)}.dpe-sum .mini b{font-size:14px}
.dpe-lnk{border:none;background:none;color:var(--accent);font-weight:700;font-size:11.5px;cursor:pointer;padding:0;margin:0;font-family:inherit}
.dpe-zbox{border:1px solid var(--border-color);border-radius:12px;padding:14px 16px;background:var(--bg-secondary)}
.dpe-zh{display:flex;align-items:flex-start;gap:12px;margin-bottom:10px}.dpe-zh b{display:block;font-size:14px;color:var(--text-primary)}.dpe-zh small{display:block;font-size:12px;color:var(--text-muted);margin-top:2px;line-height:1.4}.dpe-zh .ct{margin-left:auto;flex:none}
.dpe-zl{display:flex;flex-direction:column;gap:6px;max-height:340px;overflow:auto;padding:2px}
.dpe-zr{display:grid;grid-template-columns:minmax(0,1.5fr) 110px minmax(0,1fr) 34px;gap:6px;align-items:center}
.dpe-zr input,.dpe-zr select{height:34px;padding:4px 9px;font-size:13px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input,var(--bg-card));color:var(--text-primary);min-width:0;width:100%}
.dpe-zr .fee{display:flex;align-items:center;gap:4px;font-size:12px;color:var(--text-muted)}.dpe-zr .fee input{text-align:right}
.dpe-zr button{height:34px;border:1px solid var(--border-color);background:var(--bg-card);border-radius:8px;color:var(--text-muted);cursor:pointer}.dpe-zr button:hover{color:#dc2626;border-color:#dc2626}
.dpe-za{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.dpe-za .sp{flex:1}
.dpe-mb{margin:0 0 12px;padding:9px 11px;border-radius:10px;background:var(--bg-secondary);font-size:12px;color:var(--text-secondary);display:flex;flex-direction:column;gap:5px}
.dpe-mb i,.dpe-mb svg{color:var(--accent);margin-right:4px}.dpe-mb-p{color:#b45309}.dpe-mb-p a{font-weight:700;color:var(--accent);margin-left:6px;text-decoration:none}
@media(max-width:700px){.dpe-cards{grid-template-columns:1fr}.dpe-g{grid-template-columns:1fr}.dpe-ar{grid-template-columns:22px minmax(0,1fr)}.dpe-ax{grid-column:2}
.dpe-zr{grid-template-columns:minmax(0,1fr) 92px 34px}.dpe-zr select{grid-column:1/3}.dpe-oi{grid-template-columns:20px 22px minmax(0,1fr) auto}.dpe-oi .dpe-r{grid-column:3}
.dpe-card>header{padding:12px 14px;gap:10px}.dpe-ic{width:34px;height:34px;font-size:15px}.dpe-tabs button{flex:1 1 0;justify-content:center;padding:10px 4px;font-size:13px;gap:5px}.dpe-tabs button>i,.dpe-tabs button>svg{display:none}.dpe-tx{display:none}.dpe-stops li{padding:9px 14px}}`;
    function addCss() { if ($('dpeCss')) return; const st = document.createElement('style'); st.id = 'dpeCss'; st.textContent = CSS; document.head.appendChild(st); }
    /** Janela no estilo das outras do sistema (.modal-overlay.active pausa a atualização automática das telas) */
    function modal(title, icon, body, foot, cls) {
        addCss();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpe-m ' + (cls || '');
        ov.innerHTML = `<div class="modal" role="dialog"><div class="modal-header"><h3><i class="fas ${icon}" style="color:var(--accent);margin-right:8px"></i>${title}</h3><button class="modal-close" type="button" data-x aria-label="Fechar"><i class="fas fa-xmark"></i></button></div><div class="modal-body">${body}</div><div class="modal-footer">${foot}</div></div>`;
        document.body.appendChild(ov);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape' && document.body.lastElementChild === ov) { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
        return { ov, close, q: s => ov.querySelector(s), qa: s => [...ov.querySelectorAll(s)] };
    }
    async function openCash() {
        try { const s = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!s.empty) return { id: s.docs[0].id, ...s.docs[0].data() }; } catch (e) { }
        try { const s = await db.collection('cash_registers').get(); return s.docs.map(d => ({ id: d.id, ...d.data() })).find(r => r.status === 'open') || null; } catch (e) { return null; }
    }
    const company = () => { const g = D.general || {}; let b = {}; try { b = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {}; } catch (e) { } return g.nomeFantasia || b.companyName || g.razaoSocial || 'Minha empresa'; };
    const storeAddress = () => { const g = D.general || {}; return [[g.logradouro, g.numero].filter(Boolean).join(', '), g.bairro, [g.cidade, g.uf].filter(Boolean).join(' - ')].filter(Boolean).join(', '); };

    /* =================== Taxa do entregador =================== */
    function driverFee(m, sales) {
        const list = sales || [];
        const ct = (m && m.commissionType) || 'fixed', cv = num(m && (m.commissionValue || m.comissao));
        if (ct === 'percent') return r2(list.reduce((a, s) => a + num(s.total), 0) * cv / 100);
        if (ct === 'deliveryfee') return r2(list.reduce((a, s) => a + num(s.deliveryFee), 0));
        if (ct === 'none') return 0;
        return r2(cv * list.length);
    }
    const feeRule = m => { const ct = (m && m.commissionType) || 'fixed', cv = num(m && (m.commissionValue || m.comissao)); return ct === 'percent' ? `${fq(cv)}% sobre a venda` : ct === 'deliveryfee' ? 'a taxa de entrega da venda' : ct === 'none' || !cv ? 'sem taxa no cadastro' : `${money(cv)} por entrega`; };

    /* =================== PDV › Entrega =================== */
    const P = { manualRoute: false, manualDate: false, nbNote: '' };
    const pdvGet = fn => { try { return fn(); } catch (e) { return undefined; } };
    function pdvState() {
        const total = pdvGet(() => { const sub = cart.reduce((s, i) => s + Number(i.total || 0), 0); const base = sub - Number(discount || 0) + Number(deliveryFee || 0); return r2(base + (window.dpCardSurcharge ? window.dpCardSurcharge(base) : 0)); }) || 0;
        const method = pdvGet(() => selectedPayment) || 'dinheiro';
        const fiado = method === 'fiado';
        return { total, method, payOnDelivery: !fiado && !!($('dpeCobrar') && $('dpeCobrar').checked), changeFor: num($('dpeTroco') && $('dpeTroco').value), date: ($('dpeDate') && $('dpeDate').value) || today(), zone: zoneFor($('dpeBairro') && $('dpeBairro').value), route: routeOf($('dpeRoute') && $('dpeRoute').value) };
    }
    const isDelivery = () => pdvGet(() => saleType) === 'delivery';
    function pdvFill() {
        const zs = $('dpeBairro'), rs = $('dpeRoute'); if (!zs || !rs) return;
        const zv = zs.value, rv = rs.value;
        zs.innerHTML = '<option value="">Escolha o bairro</option>' + D.zones.map(z => `<option value="${esc(z.name)}">${esc(z.name)} · ${money(z.fee)}</option>`).join('');
        $('dpeBairroF').hidden = !D.zones.length; if (zv) zs.value = zv;
        rs.innerHTML = '<option value="">Sem rota</option>' + D.routes.map(r => `<option value="${esc(r.id)}">${esc(r.name)}${r.weekdays && r.weekdays.length ? ' · ' + wdText(r.weekdays) : ''}</option>`).join('');
        $('dpeRouteF').hidden = !D.routes.length; if (rv) rs.value = rv;
    }
    function pdvSetZone(z, fromCustomer) {
        const zs = $('dpeBairro'); if (!zs) return;
        zs.value = z ? z.name : '';
        if (z) {
            const fee = $('deliveryFeeInput');
            if (fee) { fee.value = r2(z.fee).toFixed(2); try { updateDeliveryFee(fee.value); } catch (e) { } fee.style.borderColor = 'var(--success)'; setTimeout(() => { fee.style.borderColor = ''; }, 1800); }
            if (!P.manualRoute) { const r = routeForNb(z.name); if (r || !fromCustomer) pdvSetRoute(r); }
        }
        pdvRefresh();
    }
    function pdvSetRoute(r) {
        const rs = $('dpeRoute'); if (!rs) return;
        rs.value = r ? r.id : '';
        if (!P.manualDate) { const d = $('dpeDate'); if (d) d.value = r && r.weekdays && r.weekdays.length ? nextRouteDay(r, today(), false) : today(); }
        pdvRefresh();
    }
    function pdvApplyCustomer(id) {
        const c = pdvGet(() => (allPdvCustomers || []).find(x => String(x.id) === String(id)));
        P.nbNote = '';
        if (!c) return pdvRefresh();
        const nb = c.neighborhood || c.bairro || '';
        const z = zoneFor(nb);
        if (z) pdvSetZone(z, true);
        else if (nb && D.zones.length) { $('dpeBairro').value = ''; P.nbNote = `<span class="warn">O bairro "${esc(nb)}" não está na tabela de taxas.</span>`; }
        const r = routeForCustomer(c);
        if (r && !P.manualRoute) pdvSetRoute(r);
        pdvRefresh();
    }
    function pdvRefresh() {
        if (!$('dpeBox')) return;
        const st = pdvState();
        const fiado = st.method === 'fiado';
        $('dpeCobrarW').hidden = fiado;
        $('dpeTrocoW').hidden = !(st.payOnDelivery && st.method === 'dinheiro');
        const h = [];
        if (fiado) h.push('Fiado: o entregador não cobra nada na porta.');
        else if (st.payOnDelivery) {
            let t = `O entregador cobra <b>${money(st.total)}</b> em ${esc(mLabel(st.method).toLowerCase())}`;
            if (st.method === 'dinheiro' && st.changeFor > st.total + 0.004) t += ` e leva <b>${money(st.changeFor - st.total)}</b> de troco`;
            else if (st.method === 'dinheiro' && st.changeFor > 0) t += ` · <span class="warn">o "troco para" é menor que o total</span>`;
            else if (st.method === 'credito' || st.method === 'debito') t += ' (levar a maquininha)';
            h.push(t + '.');
        } else h.push('Já pago: o entregador não cobra nada.');
        if (P.nbNote) h.push(P.nbNote);
        const r = st.route; if (r && r.weekdays && r.weekdays.length) h.push(`${esc(r.name)} passa ${wdText(r.weekdays)}.`);
        if (st.date > today()) h.push(`Entrega agendada para <b>${esc(fmtDay(st.date))}</b>.`);
        $('dpeHint').innerHTML = h.join(' ');
    }
    function pdvReset() {
        if (!$('dpeBox')) return;
        P.manualRoute = false; P.manualDate = false; P.nbNote = '';
        $('dpeBairro').value = ''; $('dpeRoute').value = ''; $('dpeDate').value = today(); $('dpeTroco').value = '';
        let pref = '1'; try { pref = localStorage.getItem('dpe_cobrar') || '1'; } catch (e) { }
        $('dpeCobrar').checked = pref === '1';
        pdvRefresh();
    }
    /** Campos que vão para a venda (o SalesService.create grava junto) */
    function pdvFields(data) {
        const st = pdvState();
        const parts = partsOf(data);
        const allFiado = parts.length && parts.every(p => p.bucket === 'fiado');
        const c = pdvGet(() => (allPdvCustomers || []).find(x => String(x.id) === String(data.customerId)));
        const zone = st.zone || zoneInText(data.address);
        const route = st.route;
        const out = {
            deliveryDate: st.date >= today() ? st.date : today(),
            deliveryNeighborhood: zone ? zone.name : ((c && (c.neighborhood || c.bairro)) || ''),
            routeId: route ? route.id : '', routeName: route ? route.name : '',
            payOnDelivery: !allFiado && st.payOnDelivery, expectedMethod: data.paymentMethod || st.method, changeFor: 0, changeToTake: 0, settledAt: null
        };
        if (out.payOnDelivery && parts.length === 1 && parts[0].bucket === 'cash') {
            const cf = st.changeFor || num(data.payments && data.payments[0] && data.payments[0].cashReceived);
            if (cf > num(data.total) + 0.004) { out.changeFor = r2(cf); out.changeToTake = r2(cf - num(data.total)); }
        }
        // Agendada para outro dia: ainda não saiu (o PDV marcaria "em rota" por ter motoboy escolhido)
        if (out.deliveryDate > today() && data.status === 'delivering') out.status = 'new';
        if (!out.deliveryNeighborhood) delete out.deliveryNeighborhood;
        return out;
    }
    /** Pedido do Cardápio digital (Mensal): paga na entrega; o troco vem escrito nas observações */
    function cardapioFields(data) {
        const out = { deliveryDate: today(), payOnDelivery: true, expectedMethod: data.paymentMethod || 'dinheiro', settledAt: null };
        const m = /troco para\s*R\$\s*([\d.,]+)/i.exec(String(data.notes || ''));
        if (m && data.paymentMethod === 'dinheiro') { const cf = num(m[1]); if (cf > num(data.total) + 0.004) { out.changeFor = r2(cf); out.changeToTake = r2(cf - num(data.total)); } }
        const z = zoneInText(data.address); if (z) { out.deliveryNeighborhood = z.name; const r = routeForNb(z.name); if (r) { out.routeId = r.id; out.routeName = r.name; } }
        return out;
    }
    function wrapCreate() {
        if (typeof SalesService === 'undefined' || !SalesService || typeof SalesService.create !== 'function' || SalesService.__dpEnt) return;
        SalesService.__dpEnt = true;
        const oc = SalesService.create;
        SalesService.create = async function (data) {
            let fromPdv = false;
            try {
                if (data && data.type === 'delivery') {
                    if ($('dpeBox') && !data.channel && !data.onlineOrderId && !data.tabId) { fromPdv = true; Object.assign(data, pdvFields(data)); }
                    else if (data.channel === 'cardapio' && !('payOnDelivery' in data)) { await loadCfg(); Object.assign(data, cardapioFields(data)); }
                }
            } catch (e) { console.warn('entregas: campos da venda', e); }
            const r = await oc.apply(this, arguments);
            if (fromPdv) setTimeout(pdvReset, 0);
            return r;
        };
    }
    function setupPDV() {
        const box = $('deliveryAddressBox'); if (!box || $('dpeBox')) return;
        addCss();
        const w = document.createElement('div'); w.id = 'dpeBox'; w.className = 'dpe-pdv';
        w.innerHTML = `<div class="dpe-g2">
  <label class="dpe-f" id="dpeBairroF" hidden><span>Bairro</span><select id="dpeBairro"></select></label>
  <label class="dpe-f"><span>Entregar em</span><input type="date" id="dpeDate"></label></div>
<label class="dpe-f" id="dpeRouteF" hidden><span>Rota</span><select id="dpeRoute"></select></label>
<div class="dpe-pay"><label class="dpe-chk" id="dpeCobrarW"><input type="checkbox" id="dpeCobrar"><span>Cobrar na entrega</span></label>
  <span class="dpe-troco" id="dpeTrocoW" hidden><span>Troco para</span><input type="text" id="dpeTroco" inputmode="decimal" placeholder="R$ 0,00" autocomplete="off"></span></div>
<div class="dpe-hint" id="dpeHint"></div>`;
        box.insertBefore(w, $('motoboySelector') || null);
        $('dpeDate').min = today();
        $('dpeBairro').addEventListener('change', () => { P.nbNote = ''; pdvSetZone(zoneFor($('dpeBairro').value), false); });
        $('dpeRoute').addEventListener('change', () => { P.manualRoute = true; P.manualDate = false; pdvSetRoute(routeOf($('dpeRoute').value)); });
        $('dpeDate').addEventListener('change', () => { P.manualDate = true; pdvRefresh(); });
        $('dpeCobrar').addEventListener('change', () => { try { localStorage.setItem('dpe_cobrar', $('dpeCobrar').checked ? '1' : '0'); } catch (e) { } pdvRefresh(); if ($('dpeCobrar').checked && !$('dpeTrocoW').hidden) $('dpeTroco').focus(); });
        $('dpeTroco').addEventListener('input', pdvRefresh);
        $('dpeTroco').addEventListener('blur', () => { const v = num($('dpeTroco').value); $('dpeTroco').value = v ? num2(v) : ''; });
        const addr = $('deliveryAddress');
        if (addr) addr.addEventListener('blur', () => { if ($('dpeBairro').value || !D.zones.length) return; const z = zoneInText(addr.value); if (z) pdvSetZone(z, false); });
        pdvReset();
        // Ganchos nas funções do PDV (todas globais)
        const wrap = (name, after) => { const o = window[name]; if (typeof o !== 'function' || o.__dpe) return; window[name] = function () { const r = o.apply(this, arguments); try { after.apply(this, arguments); } catch (e) { console.warn('entregas', name, e); } return r; }; window[name].__dpe = true; };
        wrap('fillAddressFromCustomer', id => { loadCfg().then(() => { pdvFill(); pdvApplyCustomer(id); }); });
        wrap('setSaleType', type => { if (type === 'delivery') loadCfg().then(() => { pdvFill(); pdvRefresh(); }); });
        wrap('selectPayment', () => pdvRefresh());
        wrap('updateCartSummary', () => { if (isDelivery()) pdvRefresh(); });
        wrap('clearCustomer', () => { P.nbNote = ''; pdvRefresh(); });
        // "Troco para" mal preenchido para a venda; agendamento no passado também
        const oFin = window.finalizeSale;
        if (typeof oFin === 'function' && !oFin.__dpe) {
            window.finalizeSale = function () {
                try {
                    if (isDelivery()) {
                        const st = pdvState();
                        if (st.payOnDelivery && st.method === 'dinheiro' && st.changeFor > 0 && st.changeFor < st.total - 0.004) { toast('warning', `O "troco para" (${money(st.changeFor)}) é menor que o total da venda (${money(st.total)}). Corrija ou apague.`); $('dpeTroco').focus(); return; }
                        if (st.date < today()) { toast('warning', 'A data de entrega já passou. Escolha hoje ou outro dia.'); $('dpeDate').focus(); return; }
                    }
                } catch (e) { }
                return oFin.apply(this, arguments);
            };
            window.finalizeSale.__dpe = true;
        }
        // Dinheiro cobrado na porta: a janela do troco já vem com o "troco para"
        const oCash = window.showCashFinalizeModal;
        if (typeof oCash === 'function' && !oCash.__dpe) {
            window.showCashFinalizeModal = function (total, summaryHtml, onConfirm) {
                let st = null; try { if (isDelivery()) st = pdvState(); } catch (e) { }
                if (st && st.payOnDelivery) summaryHtml = String(summaryHtml || '') + `<div class="dpe-sum-l">Cobrar na entrega${st.changeFor > num(total) + 0.004 ? ` · troco para ${money(st.changeFor)} (levar ${money(st.changeFor - num(total))})` : ''}</div>`;
                const r = oCash.call(this, total, summaryHtml, onConfirm);
                try {
                    const inp = $('cashReceivedFinalize');
                    if (st && st.payOnDelivery && inp) {
                        const lb = document.querySelector('label[for="cashReceivedFinalize"]'); if (lb) lb.textContent = 'O cliente vai pagar com (troco para)';
                        if (st.changeFor > num(total) + 0.004) { inp.value = r2(st.changeFor).toFixed(2); inp.dispatchEvent(new Event('input', { bubbles: true })); }
                    }
                } catch (e) { }
                return r;
            };
            window.showCashFinalizeModal.__dpe = true;
        }
        loadCfg().then(() => { pdvFill(); pdvRefresh(); });
    }

    /* =================== Dados das telas de entrega =================== */
    const E = { sales: [], runs: [], byId: new Map(), at: 0 };
    async function loadData() {
        await loadCfg(true);
        let snap;
        try { snap = await db.collection('sales').where('type', '==', 'delivery').get(); } catch (e) { snap = await db.collection('sales').get(); }
        E.sales = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.type === 'delivery' && !s.deleted);
        try { const r = await db.collection('delivery_runs').get(); E.runs = r.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => !x.deleted); } catch (e) { E.runs = []; }
        E.byId = new Map(E.sales.map(s => [s.id, s]));
        E.at = Date.now();
        return E;
    }
    const runOf = id => (id && E.runs.find(r => r.id === id)) || null;
    const openRunOf = s => { const r = runOf(s && s.runId); return r && r.status !== 'acertado' && r.status !== 'cancelada' ? r : null; };
    const isOut = s => ['delivering', 'delivered', 'completed'].includes(s.status);
    const STATUS = { new: ['Novo', 't-new'], preparing: ['Separando', 't-load'], waiting: ['Pronto', 't-load'], delivering: ['Em rota', 't-go'], delivered: ['Entregue', 't-ok'], completed: ['Entregue', 't-ok'], cancelled: ['Cancelado', 't-late'] };
    const stTag = s => { const x = STATUS[s.status || 'new'] || [s.status, '']; return `<span class="dpe-tag ${x[1]}">${esc(x[0])}</span>`; };
    const RUNST = { carregando: ['Carregando', 't-load', 'run'], em_rota: ['Em rota', 't-go', 'go'], acertado: ['Acerto feito', 't-ok', 'done'] };
    function sortStops(list) {
        return list.slice().sort((a, b) => (num(a.deliveryOrder) || 999) - (num(b.deliveryOrder) || 999) || norm(a.deliveryNeighborhood).localeCompare(norm(b.deliveryNeighborhood)) || norm(a.address).localeCompare(norm(b.address)));
    }
    const addrOf = s => [s.address, s.deliveryNeighborhood && !words(s.address).includes(words(s.deliveryNeighborhood)) ? s.deliveryNeighborhood : ''].filter(Boolean).join(' · ') || 'Sem endereço';
    function stopLi(s, i, extra) {
        const c = collectInfo(s);
        const pay = c.amount ? `<b>${money(c.amount)}</b><small>${esc(c.toCollect.length > 1 ? 'vários' : mLabel(c.method))}${c.changeToTake ? ' · troco ' + money(c.changeToTake) : ''}</small>` : `<b style="color:#059669">${money(s.total)}</b><small>${c.fiado && !c.paid ? 'fiado' : 'já pago'}</small>`;
        return `<li><span class="dpe-n">${i + 1}</span><div><b>${esc(custName(s))}</b> <small style="display:inline">${saleNo(s)}</small><small>${esc(addrOf(s))}</small>${s.addressRef ? `<small>Ref.: ${esc(s.addressRef)}</small>` : ''}${extra || ''}</div><div class="dpe-r">${pay}</div></li>`;
    }

    /* =================== Rotas e bairros (janela) =================== */
    async function openRoutes(onDone) {
        await loadCfg(true);
        const m = modal('Rotas de entrega', 'fa-route', '<div id="dpeRBody"></div>', '<button class="btn btn-secondary" type="button" data-x>Fechar</button>', 'sm');
        const body = m.q('#dpeRBody');
        const list = () => {
            body.innerHTML = `<p style="font-size:12.5px;color:var(--text-muted);margin:0 0 12px;line-height:1.45">Uma rota junta os bairros que o caminhão ou a moto faz no mesmo dia (ex.: "terça e quinta: Setor Sul"). No PDV, o cliente do bairro já vem com a rota e a data da próxima passada.</p>
<div class="dpe-rl">${D.routes.length ? D.routes.map(r => { const dr = driverOf(r.driverId); const nbs = D.zones.filter(z => z.routeId === r.id).map(z => z.name).concat((r.neighborhoods || []).filter(n => !zoneFor(n))); return `<div class="dpe-ri"><span class="dpe-ic" style="width:34px;height:34px;font-size:15px"><i class="fas fa-route"></i></span><div><b>${esc(r.name)}</b><small>${esc(wdText(r.weekdays) || 'sem dia fixo')}${dr ? ' · ' + esc(dr.name) : ''}</small><small>${nbs.length ? esc(nbs.join(', ')) : 'Nenhum bairro ainda'}</small></div><button class="dpe-btn sm" type="button" data-ed="${esc(r.id)}"><i class="fas fa-pen"></i> Editar</button></div>`; }).join('') : '<div class="dpe-empty" style="padding:18px"><i class="fas fa-route"></i>Nenhuma rota ainda.</div>'}</div>
<button class="dpe-btn pri" type="button" data-new><i class="fas fa-plus"></i> Nova rota</button>`;
            body.querySelector('[data-new]').onclick = () => form(null);
            body.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(routeOf(b.dataset.ed)));
        };
        const form = r => {
            const mine = new Set(D.zones.filter(z => r && z.routeId === r.id).map(z => norm(z.name)));
            (r && r.neighborhoods || []).forEach(n => mine.add(norm(n)));
            const others = (r && r.neighborhoods || []).filter(n => !zoneFor(n));
            body.innerHTML = `<div class="dpe-fg"><label class="dpe-fl">Nome da rota</label><input class="form-control" id="dpeRName" maxlength="40" placeholder="Ex.: Rota Sul" value="${esc(r ? r.name : '')}"></div>
<div class="dpe-fg"><label class="dpe-fl">Dias em que passa</label><div class="dpe-days">${WDL.map((n, i) => `<label><input type="checkbox" value="${i}" ${r && (r.weekdays || []).map(Number).includes(i) ? 'checked' : ''}><span>${WD[i]}</span></label>`).join('')}</div><small>Sem dia marcado, a entrega fica para o mesmo dia ou o dia seguinte.</small></div>
<div class="dpe-fg"><label class="dpe-fl">Entregador de sempre</label><select class="form-control" id="dpeRDrv"><option value="">Escolher na hora</option>${activeDrivers().map(d => `<option value="${esc(d.id)}" ${r && r.driverId === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>
<div class="dpe-fg"><label class="dpe-fl">Bairros da rota</label>${D.zones.length ? `<div class="dpe-nbs">${D.zones.map(z => { const other = z.routeId && (!r || z.routeId !== r.id) ? routeOf(z.routeId) : null; return `<label><input type="checkbox" value="${esc(z.name)}" ${mine.has(norm(z.name)) ? 'checked' : ''}><span>${esc(z.name)}</span>${other ? `<small>${esc(other.name)}</small>` : ''}</label>`; }).join('')}</div>` : '<small>Cadastre os bairros em Configurações › Vendas › Taxa de entrega por bairro.</small>'}
<input class="form-control" id="dpeROther" style="margin-top:8px" placeholder="Outros bairros, separados por vírgula" value="${esc(others.join(', '))}"></div>
<div style="display:flex;gap:8px;flex-wrap:wrap">${r ? '<button class="dpe-btn dg" type="button" data-del><i class="fas fa-trash"></i> Excluir rota</button>' : ''}<span style="flex:1"></span><button class="dpe-btn" type="button" data-back>Voltar</button><button class="dpe-btn pri" type="button" data-save><i class="fas fa-check"></i> Salvar rota</button></div>`;
            body.querySelector('[data-back]').onclick = list;
            setTimeout(() => body.querySelector('#dpeRName').focus(), 40);
            body.querySelector('[data-save]').onclick = async e => {
                const name = body.querySelector('#dpeRName').value.trim(); if (name.length < 2) { toast('warning', 'Dê um nome para a rota.'); return; }
                if (D.routes.some(x => x !== r && norm(x.name) === norm(name))) { toast('warning', 'Já existe uma rota com esse nome.'); return; }
                const btn = e.currentTarget; btn.disabled = true;
                try {
                    const weekdays = [...body.querySelectorAll('.dpe-days input:checked')].map(i => Number(i.value));
                    const drv = driverOf(body.querySelector('#dpeRDrv').value);
                    const picked = [...body.querySelectorAll('.dpe-nbs input:checked')].map(i => i.value);
                    const extra = body.querySelector('#dpeROther').value.split(',').map(s => s.trim()).filter(Boolean);
                    const data = { name, weekdays, driverId: drv ? drv.id : '', driverName: drv ? drv.name : '', neighborhoods: [...new Set([...picked, ...extra])], active: true, deleted: false, updatedAt: ts() };
                    let id = r && r.id;
                    if (id) await db.collection('routes').doc(id).update(data);
                    else { const ref = await db.collection('routes').add({ ...data, createdAt: ts(), createdBy: uid() }); id = ref.id; }
                    const pk = new Set(picked.map(norm));
                    const zones = D.zones.map(z => pk.has(norm(z.name)) ? { ...z, routeId: id } : (z.routeId === id ? { ...z, routeId: '' } : z));
                    await loadCfg(true);
                    await saveZones(zones);
                    toast('success', 'Rota salva.'); list(); onDone && onDone();
                } catch (err) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); btn.disabled = false; }
            };
            const del = body.querySelector('[data-del]');
            if (del) del.onclick = () => {
                if (!confirm(`Excluir a rota "${r.name}"? Os bairros e clientes dela ficam sem rota. As vendas já feitas não mudam.`)) return;
                (async () => {
                    try { await db.collection('routes').doc(r.id).update({ deleted: true, deletedAt: ts(), updatedAt: ts() }); await saveZones(D.zones.map(z => z.routeId === r.id ? { ...z, routeId: '' } : z)); await loadCfg(true); toast('success', 'Rota excluída.'); list(); onDone && onDone(); }
                    catch (err) { toast('error', 'Não foi possível excluir: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
                })();
            };
        };
        list();
        return m;
    }

    /* =================== Configurações › Vendas: taxa por bairro =================== */
    function setupSettings() {
        const inp = $('cfg_taxa_entrega'); if (!inp || !$('tabVendas') || $('dpeZones')) return;
        addCss();
        const row = inp.closest('div[style*="space-between"]') || inp.parentElement;
        const box = document.createElement('div'); box.id = 'dpeZones'; box.className = 'dpe-zbox';
        row.insertAdjacentElement('afterend', box);
        let rows = [];
        const routeOpts = sel => '<option value="">Sem rota</option>' + D.routes.map(r => `<option value="${esc(r.id)}" ${r.id === sel ? 'selected' : ''}>${esc(r.name)}</option>`).join('');
        const rowHtml = (z, i) => `<div class="dpe-zr" data-i="${i}"><input type="text" data-k="name" maxlength="60" placeholder="Bairro" value="${esc(z.name)}"><span class="fee">R$ <input type="text" data-k="fee" inputmode="decimal" value="${z.fee || z.fee === 0 ? num2(z.fee) : ''}" placeholder="0,00"></span><select data-k="routeId" title="Rota">${routeOpts(z.routeId)}</select><button type="button" data-del title="Tirar o bairro"><i class="fas fa-trash"></i></button></div>`;
        const read = () => { rows = [...box.querySelectorAll('.dpe-zr')].map(r => ({ name: r.querySelector('[data-k=name]').value, fee: num(r.querySelector('[data-k=fee]').value), routeId: r.querySelector('[data-k=routeId]').value })); return rows; };
        const defFee = () => r2(num(inp.value));
        function paint() {
            box.innerHTML = `<div class="dpe-zh"><div><b><i class="fas fa-map-location-dot" style="color:var(--accent);margin-right:6px"></i>Taxa de entrega por bairro</b><small>No PDV, ao escolher o cliente (ou o bairro), a taxa já vem certa e a rota também. Bairro fora da lista usa a taxa padrão acima.</small></div><span class="dpe-tag t-new ct">${plural(rows.filter(r => String(r.name).trim()).length, 'bairro', 'bairros')}</span></div>
<div class="dpe-zl">${rows.length ? rows.map(rowHtml).join('') : '<div class="dpe-hint" style="padding:6px 2px">Nenhum bairro ainda. Puxe os bairros dos seus clientes ou adicione um por um.</div>'}</div>
<div class="dpe-za"><button type="button" class="dpe-btn sm" data-add><i class="fas fa-plus"></i> Bairro</button><button type="button" class="dpe-btn sm" data-cli><i class="fas fa-users"></i> Puxar bairros dos clientes</button>${MENSAL.cardapioDistricts ? `<button type="button" class="dpe-btn sm" data-card><i class="fas fa-file-import"></i> Usar os bairros do Cardápio${pill()}</button>` : ''}<button type="button" class="dpe-btn sm" data-routes><i class="fas fa-route"></i> Rotas de entrega${D.routes.length ? ` (${D.routes.length})` : ''}</button><span class="sp"></span><button type="button" class="dpe-btn pri sm" data-save><i class="fas fa-check"></i> Salvar bairros</button></div>`;
            box.querySelector('[data-add]').onclick = () => { read(); rows.push({ name: '', fee: defFee(), routeId: '' }); paint(); const l = box.querySelectorAll('.dpe-zr [data-k=name]'); l[l.length - 1]?.focus(); };
            box.querySelectorAll('[data-del]').forEach(b => b.onclick = () => { read(); rows.splice(Number(b.closest('.dpe-zr').dataset.i), 1); paint(); });
            box.querySelector('[data-cli]').onclick = async e => {
                const btn = e.currentTarget; btn.disabled = true; read();
                try {
                    const s = await db.collection('customers').get(); const have = new Set(rows.map(r => norm(r.name))), found = new Map();
                    s.docs.forEach(d => { const c = d.data() || {}; if (c.deleted) return; const nb = String(c.neighborhood || c.bairro || '').trim(); if (nb && !have.has(norm(nb)) && !found.has(norm(nb))) found.set(norm(nb), nb); });
                    const add = [...found.values()].sort((a, b) => a.localeCompare(b, 'pt-BR'));
                    add.forEach(n => { const r = routeForNb(n); rows.push({ name: n, fee: defFee(), routeId: r ? r.id : '' }); });
                    paint(); toast(add.length ? 'success' : 'info', add.length ? `${plural(add.length, 'bairro novo', 'bairros novos')} com a taxa padrão. Ajuste os valores e salve.` : 'Todos os bairros dos clientes já estão na lista.');
                } catch (err) { toast('error', 'Não foi possível ler os clientes: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); btn.disabled = false; }
            };
            const card = box.querySelector('[data-card]');
            if (card) card.onclick = async () => {
                read();
                try {
                    const list = await MENSAL.cardapioDistricts();
                    if (!list.length) { toast('info', 'O Cardápio digital ainda não tem bairros (Cardápio › Configuração › Delivery › Por bairro).'); return; }
                    let n = 0; list.forEach(d => { const ex = rows.find(r => norm(r.name) === norm(d.name)); if (ex) { if (r2(ex.fee) !== r2(d.fee)) { ex.fee = d.fee; n++; } } else { rows.push({ name: d.name, fee: d.fee, routeId: '' }); n++; } });
                    paint(); toast('success', n ? `${plural(n, 'bairro veio', 'bairros vieram')} do Cardápio. Confira e salve.` : 'Os bairros do Cardápio já estão iguais aqui.');
                } catch (err) { toast('error', 'Não foi possível ler o Cardápio: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
            };
            box.querySelector('[data-routes]').onclick = () => { read(); openRoutes(async () => { await loadCfg(true); const keep = rows; rows = keep.map(r => { const z = zoneFor(r.name); return z ? { ...r, routeId: z.routeId } : r; }); paint(); }); };
            box.querySelector('[data-save]').onclick = async e => {
                read();
                const seen = new Set(), list = [];
                for (const r of rows) { const k = norm(r.name); if (!k) continue; if (seen.has(k)) { toast('warning', `O bairro "${r.name.trim()}" está repetido.`); return; } seen.add(k); list.push(r); }
                const btn = e.currentTarget; btn.disabled = true;
                try { await loadCfg(true); rows = await saveZones(list); paint(); toast('success', `Taxa por bairro salva (${plural(rows.length, 'bairro', 'bairros')}).`); }
                catch (err) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); btn.disabled = false; }
            };
        }
        loadCfg(true).then(() => { rows = D.zones.map(z => ({ ...z })); paint(); });
        box.innerHTML = '<div class="dpe-hint"><i class="fas fa-spinner fa-spin"></i> Carregando bairros…</div>';
    }

    /* =================== Clientes: rota do cliente =================== */
    function customerForm(c) {
        const ref = $('clientReferencia'); if (!ref) return;
        let g = $('dpeCliRotaG');
        if (!g) {
            addCss();
            g = document.createElement('div'); g.className = 'form-group cli-s2'; g.id = 'dpeCliRotaG'; g.hidden = true;
            g.innerHTML = '<label class="form-label" for="clientRota">Rota de entrega</label><select id="clientRota" class="form-control"></select><small class="cli-hint" id="dpeCliRotaH" style="display:block;font-size:11.5px;color:var(--text-muted);margin-top:4px"></small>';
            (ref.closest('.form-group') || ref).insertAdjacentElement('afterend', g);
            const nb = $('clientBairro'); if (nb) nb.addEventListener('input', hint);
            $('clientRota').addEventListener('change', hint);
        }
        g.dataset.cid = c && c.id ? c.id : '';
        g.dataset.cur = (c && c.routeId) || '';
        function hint() { const h = $('dpeCliRotaH'); if (!h) return; const r = routeForNb($('clientBairro') && $('clientBairro').value); h.textContent = $('clientRota').value ? 'Esta rota vale mesmo se o bairro for de outra.' : (r ? `Sem escolher, vale a rota do bairro: ${r.name}.` : 'Sem escolher, vale a rota do bairro (se tiver).'); }
        const fill = () => { const sel = $('clientRota'); const cur = g.dataset.cur; sel.innerHTML = '<option value="">Pelo bairro</option>' + D.routes.map(r => `<option value="${esc(r.id)}">${esc(r.name)}${r.weekdays && r.weekdays.length ? ' · ' + wdText(r.weekdays) : ''}</option>`).join(''); sel.value = routeOf(cur) ? cur : ''; g.hidden = !D.routes.length; hint(); };
        fill(); loadCfg().then(fill);
    }
    /** Campo que vai junto no salvar do cliente (só quando a empresa usa rotas) */
    function customerData() { const g = $('dpeCliRotaG'), sel = $('clientRota'); if (!g || g.hidden || !sel) return {}; return { routeId: sel.value || '' }; }

    /* =================== Pedidos: data agendada, rota e filtro =================== */
    function setupPedidos() {
        if (typeof window.renderKanban !== 'function' || !$('kanbanBoard') || window.renderKanban.__dpe) return;
        addCss();
        let filt = 'all'; try { filt = localStorage.getItem('dpe_ped_f') || 'all'; } catch (e) { }
        const o = window.renderKanban;
        window.renderKanban = function () { const r = o.apply(this, arguments); try { deco(); } catch (e) { console.warn('entregas: pedidos', e); } return r; };
        window.renderKanban.__dpe = true;
        function deco() {
            const bar = $('pdkBar');
            if (bar && !$('dpePedF')) {
                const s = document.createElement('select'); s.id = 'dpePedF'; s.className = 'dpe-in'; s.title = 'Entregas por data';
                s.innerHTML = '<option value="all">Entregas: todas</option><option value="today">Entregas para hoje</option><option value="late">Entregas atrasadas</option><option value="later">Agendadas (depois)</option>';
                s.value = filt; s.onchange = () => { filt = s.value; try { localStorage.setItem('dpe_ped_f', filt); } catch (e) { } window.renderKanban(); };
                const seg = bar.querySelector('.pdk-seg'); if (seg) seg.insertAdjacentElement('afterend', s); else bar.appendChild(s);
            }
            const all = pdvGet(() => allSales) || [];
            const col = document.querySelector('#kanbanBoard [data-col="delivery"]'); if (!col) return;
            const t = today(); let shown = 0;
            col.querySelectorAll('.kanban-card').forEach(card => {
                const id = ((card.getAttribute('onclick') || '').match(/openDetail\('([^']+)'\)/) || [])[1]; const s = all.find(x => x.id === id); if (!s) return;
                const d = saleDay(s);
                if (!card.querySelector('.dpe-chips')) {
                    const c = collectInfo(s), chips = [];
                    if (d !== t) chips.push(`<span class="dpe-tag ${d < t ? 't-late' : 't-new'}"><i class="fas fa-calendar-days"></i> ${d < t ? 'era para ' : 'entregar '}${esc(dayLabel(d))}</span>`);
                    if (s.routeName) chips.push(`<span class="dpe-tag"><i class="fas fa-route"></i> ${esc(s.routeName)}</span>`);
                    if (s.deliveryNeighborhood) chips.push(`<span class="dpe-tag"><i class="fas fa-location-dot"></i> ${esc(s.deliveryNeighborhood)}</span>`);
                    chips.push(c.amount ? `<span class="dpe-tag t-load"><i class="fas fa-hand-holding-dollar"></i> cobrar ${money(c.amount)}${c.changeToTake ? ' · troco ' + money(c.changeToTake) : ''}</span>` : `<span class="dpe-tag t-pay"><i class="fas fa-circle-check"></i> ${c.fiado ? 'fiado' : 'pago'}</span>`);
                    const el = document.createElement('div'); el.className = 'dpe-chips'; el.innerHTML = chips.join('');
                    const act = card.querySelector('.pdk-act'); if (act) act.insertAdjacentElement('beforebegin', el); else card.appendChild(el);
                    if (d > t) { const w = card.querySelector('.pdk-wait'); if (w) { w.className = 'pdk-wait'; w.innerHTML = `<i class="fas fa-calendar-days"></i> agendada${s.motoboyName ? ' · ' + esc(s.motoboyName) : ''}`; } }
                }
                const ok = filt === 'all' || (filt === 'today' && d === t) || (filt === 'late' && d < t) || (filt === 'later' && d > t);
                card.style.display = ok ? '' : 'none'; if (ok) shown++;
            });
            if (filt !== 'all') { const ct = col.querySelector('.kanban-count'); if (ct) ct.textContent = shown; const tb = document.querySelector('#pdkTabs [data-tab="delivery"] b'); if (tb) tb.textContent = shown; }
        }
        try { if (document.querySelector('#kanbanBoard .kanban-col')) deco(); } catch (e) { }
    }

    /* =================== Motoboys: rotas e acerto pendente =================== */
    function setupMotoboys() {
        if (typeof window.renderMotoboys !== 'function' || !$('motoboyGrid') || window.renderMotoboys.__dpe) return;
        addCss();
        const o = window.renderMotoboys;
        window.renderMotoboys = function () { const r = o.apply(this, arguments); try { deco(); } catch (e) { } return r; };
        window.renderMotoboys.__dpe = true;
        function deco() {
            const deliveries = pdvGet(() => allDeliveries) || [];
            const t = today(), from = addDays(t, -1);
            $('motoboyGrid').querySelectorAll('.card').forEach(card => {
                const b = card.querySelector('[onclick^="editMotoboy("]'); if (!b) return;
                const id = (b.getAttribute('onclick').match(/editMotoboy\('([^']+)'\)/) || [])[1]; if (!id) return;
                card.querySelector('.dpe-mb')?.remove();
                const routes = D.routes.filter(r => r.driverId === id);
                const pend = deliveries.filter(s => s.motoboyId === id && s.type === 'delivery' && !s.settledAt && isOut(s) && saleDay(s) >= from && saleDay(s) <= t);
                if (!routes.length && !pend.length) return;
                const cash = r2(pend.reduce((a, s) => a + collectInfo(s).cash, 0));
                const el = document.createElement('div'); el.className = 'dpe-mb';
                el.innerHTML = (routes.length ? `<div><i class="fas fa-route"></i>${routes.map(r => `<b>${esc(r.name)}</b>${r.weekdays && r.weekdays.length ? ' (' + esc(wdText(r.weekdays)) + ')' : ''}`).join(', ')}</div>` : '')
                    + (pend.length ? `<div class="dpe-mb-p"><i class="fas fa-hand-holding-dollar"></i>Acerto pendente: ${plural(pend.length, 'entrega', 'entregas')}${cash ? ' · ' + money(cash) + ' em dinheiro' : ''}<a href="entregas.html#acerto">Fazer acerto</a></div>` : '');
                const grid = card.children[1]; if (grid) grid.insertAdjacentElement('afterend', el); else card.appendChild(el);
            });
        }
        loadCfg().then(() => { try { deco(); } catch (e) { } });
    }

    /* =================== Entregas: abas =================== */
    const ST = { tab: 'and', date: today(), route: '', adate: today() };
    function setupEntregas() {
        const pc = document.querySelector('.page-content'); if (!pc || !$('activeDeliveries') || $('dpeTabs')) return;
        addCss();
        // Cartões "Em andamento": data agendada, rota e o que cobrar
        if (typeof window.buildDeliveryCard === 'function' && !window.buildDeliveryCard.__dpe) {
            const ob = window.buildDeliveryCard;
            window.buildDeliveryCard = function (d) {
                const h = ob.apply(this, arguments);
                try {
                    const c = collectInfo(d), t = today(), day = saleDay(d), chips = [];
                    if (day !== t) chips.push(`<span class="dpe-tag ${day < t ? 't-late' : 't-new'}"><i class="fas fa-calendar-days"></i> ${day < t ? 'era para ' : 'entregar '}${esc(dayLabel(day))}</span>`);
                    if (d.routeName) chips.push(`<span class="dpe-tag"><i class="fas fa-route"></i> ${esc(d.routeName)}</span>`);
                    chips.push(c.amount ? `<span class="dpe-tag t-load"><i class="fas fa-hand-holding-dollar"></i> cobrar ${money(c.amount)} · ${esc(c.toCollect.length > 1 ? 'vários' : mLabel(c.method))}${c.changeToTake ? ' · troco ' + money(c.changeToTake) : ''}</span>` : `<span class="dpe-tag t-pay"><i class="fas fa-circle-check"></i> ${c.fiado ? 'fiado' : 'já pago'}</span>`);
                    return h.replace(/<\/div>\s*$/, `<div class="dpe-chips">${chips.join('')}</div></div>`);
                } catch (e) { return h; }
            };
            window.buildDeliveryCard.__dpe = true;
            try { if (typeof deliveries !== 'undefined' && deliveries.length && typeof applyFilters === 'function') applyFilters(); } catch (e) { }
        }
        const stat = pc.querySelector(':scope > .stat-grid');
        const pAnd = document.createElement('div'); pAnd.id = 'dpePAnd';
        [...pc.children].filter(n => n !== stat).forEach(n => pAnd.appendChild(n));
        const tabs = document.createElement('div'); tabs.id = 'dpeTabs'; tabs.className = 'dpe-tabs'; tabs.setAttribute('role', 'tablist');
        tabs.innerHTML = `<button type="button" data-t="and"><i class="fas fa-truck-fast"></i> <span>Em andamento</span></button><button type="button" data-t="rotas"><i class="fas fa-route"></i> <span>Rotas<span class="dpe-tx"> e carga</span></span> <span class="ct" id="dpeCtR" hidden></span></button><button type="button" data-t="acerto"><i class="fas fa-hand-holding-dollar"></i> <span>Acerto<span class="dpe-tx"> do entregador</span></span> <span class="ct" id="dpeCtA" hidden></span></button>`;
        const pRot = document.createElement('div'); pRot.id = 'dpePRot'; pRot.hidden = true;
        const pAc = document.createElement('div'); pAc.id = 'dpePAc'; pAc.hidden = true;
        pc.append(tabs, pAnd, pRot, pAc);
        tabs.addEventListener('click', e => { const b = e.target.closest('[data-t]'); if (b) show(b.dataset.t, true); });
        window.addEventListener('hashchange', () => { const h = location.hash.replace('#', ''); if (['rotas', 'acerto', 'and'].includes(h)) show(h); });
        const h0 = location.hash.replace('#', '');
        show(['rotas', 'acerto'].includes(h0) ? h0 : 'and');
        const go = () => refresh().catch(e => console.warn('entregas', e));
        let started = false; try { auth.onAuthStateChanged(u => { if (u && !started) { started = true; go(); } }); } catch (e) { go(); }
        document.addEventListener('visibilitychange', () => { if (!document.hidden && ST.tab !== 'and' && !document.querySelector('.modal-overlay.active')) go(); });
    }
    function show(t, push) {
        ST.tab = t;
        document.querySelectorAll('#dpeTabs [data-t]').forEach(b => { b.classList.toggle('on', b.dataset.t === t); b.setAttribute('aria-selected', b.dataset.t === t ? 'true' : 'false'); });
        $('dpePAnd').hidden = t !== 'and'; $('dpePRot').hidden = t !== 'rotas'; $('dpePAc').hidden = t !== 'acerto';
        if (push) { try { history.replaceState(null, '', t === 'and' ? location.pathname + location.search : '#' + t); } catch (e) { } }
        if (t !== 'and' && E.at) { if (Date.now() - E.at > 15000) refresh(); else paint(); }
        else if (t !== 'and') { const p = t === 'rotas' ? $('dpePRot') : $('dpePAc'); if (p && !p.innerHTML) p.innerHTML = '<div class="dpe-empty"><i class="fas fa-spinner fa-spin"></i>Carregando…</div>'; }
    }
    async function refresh() {
        if (ST.tab === 'rotas' && !E.at) $('dpePRot').innerHTML = '<div class="dpe-empty"><i class="fas fa-spinner fa-spin"></i>Carregando…</div>';
        if (ST.tab === 'acerto' && !E.at) $('dpePAc').innerHTML = '<div class="dpe-empty"><i class="fas fa-spinner fa-spin"></i>Carregando…</div>';
        await loadData();
        paint();
    }
    function paint() {
        const free = freeOfDay(today()), pend = pendingDrivers(today());
        const cr = $('dpeCtR'), ca = $('dpeCtA');
        if (cr) { cr.hidden = !free.length; cr.textContent = free.length; }
        if (ca) { ca.hidden = !pend.length; ca.textContent = pend.length; }
        if (ST.tab === 'rotas') paintRotas();
        if (ST.tab === 'acerto') paintAcerto();
    }
    /** Vendas do dia que ainda não estão numa carga e não saíram */
    function freeOfDay(date) { return E.sales.filter(s => s.status !== 'cancelled' && !s.settledAt && !openRunOf(s) && !isOut(s) && saleDay(s) === date); }

    /* ---------- Aba: Rotas e carga ---------- */
    function paintRotas() {
        const root = $('dpePRot'); if (!root) return;
        const date = ST.date, t = today();
        const runs = E.runs.filter(r => r.kind !== 'acerto' && r.date === date && r.status !== 'cancelada');
        const free = freeOfDay(date);
        const groups = [];
        runs.sort((a, b) => num(a.number) - num(b.number)).forEach(r => groups.push({ run: r, route: routeOf(r.routeId), routeId: r.routeId || '', sales: (r.saleIds || []).map(id => E.byId.get(id)).filter(Boolean) }));
        const byR = new Map();
        free.forEach(s => { const rid = routeOf(s.routeId) ? s.routeId : ''; if (!byR.has(rid)) byR.set(rid, []); byR.get(rid).push(s); });
        [...byR.entries()].sort((a, b) => (a[0] ? 0 : 1) - (b[0] ? 0 : 1) || String((routeOf(a[0]) || {}).name || '').localeCompare(String((routeOf(b[0]) || {}).name || ''), 'pt-BR')).forEach(([rid, list]) => groups.push({ route: routeOf(rid), routeId: rid, sales: sortStops(list) }));
        const shown = groups.filter(g => !ST.route || (ST.route === '_none' ? !g.routeId : g.routeId === ST.route));
        const late = date === t ? E.sales.filter(s => s.status !== 'cancelled' && !s.settledAt && !openRunOf(s) && !isOut(s) && saleDay(s) < t) : [];
        const dayRoutes = D.routes.filter(r => (r.weekdays || []).map(Number).includes(dow(date)));
        root.innerHTML = `<div class="dpe-bar"><div class="dpe-seg">${[[t, 'Hoje'], [addDays(t, 1), 'Amanhã']].map(([d, l]) => `<button type="button" data-d="${d}" class="${date === d ? 'on' : ''}">${l}</button>`).join('')}</div>
<input type="date" class="dpe-in" id="dpeRDate" value="${date}" title="Dia da entrega"><select class="dpe-in" id="dpeRRoute"><option value="">Todas as rotas</option>${D.routes.map(r => `<option value="${esc(r.id)}" ${ST.route === r.id ? 'selected' : ''}>${esc(r.name)}</option>`).join('')}<option value="_none" ${ST.route === '_none' ? 'selected' : ''}>Sem rota</option></select>
<span class="sp"></span><button type="button" class="dpe-btn" data-routes><i class="fas fa-route"></i> Rotas e bairros</button><button type="button" class="dpe-btn" data-reload title="Atualizar"><i class="fas fa-rotate-right"></i></button></div>
${late.length ? `<div class="dpe-note"><i class="fas fa-triangle-exclamation"></i><span><b>${plural(late.length, 'entrega', 'entregas')} de dias anteriores</b> ainda não ${late.length === 1 ? 'saiu' : 'saíram'} (${esc(late.slice(0, 3).map(custName).join(', '))}${late.length > 3 ? '…' : ''}).</span><button type="button" class="dpe-btn sm" data-late><i class="fas fa-calendar-days"></i> Trazer para hoje</button></div>` : ''}
${!D.routes.length && !D.zones.length ? `<div class="dpe-note info"><i class="fas fa-circle-info"></i><span>Entrega por rota (ex.: terça Setor Sul, quinta Centro)? Cadastre os bairros com a taxa em Configurações › Vendas e as rotas aqui em <b>Rotas e bairros</b>. Sem rota, tudo funciona do mesmo jeito: as entregas do dia aparecem juntas.</span></div>` : ''}
${dayRoutes.length ? `<div class="dpe-hint" style="margin:-6px 0 12px">${esc(dayLabel(date).replace(/^./, x => x.toUpperCase()))} passa: ${dayRoutes.map(r => `<b>${esc(r.name)}</b>`).join(', ')}.</div>` : ''}
${shown.length ? `<div class="dpe-cards">${shown.map(groupCard).join('')}</div>` : `<div class="card dpe-empty"><i class="fas fa-truck"></i>Nenhuma entrega para ${esc(dayLabel(date))}${ST.route ? ' nesta rota' : ''}.<br><small>As vendas com <b>Entrega</b> no PDV aparecem aqui no dia marcado em "Entregar em".</small></div>`}`;
        root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { ST.date = b.dataset.d; paintRotas(); });
        root.querySelector('#dpeRDate').onchange = e => { if (e.target.value) { ST.date = e.target.value; paintRotas(); } };
        root.querySelector('#dpeRRoute').onchange = e => { ST.route = e.target.value; paintRotas(); };
        root.querySelector('[data-routes]').onclick = () => openRoutes(() => refresh());
        root.querySelector('[data-reload]').onclick = () => refresh();
        const lb = root.querySelector('[data-late]');
        if (lb) lb.onclick = async () => { lb.disabled = true; try { for (const s of late) await db.collection('sales').doc(s.id).update({ deliveryDate: t, updatedAt: ts() }); toast('success', 'As entregas atrasadas vieram para hoje.'); await refresh(); } catch (e) { toast('error', e.message); lb.disabled = false; } };
        root.querySelectorAll('[data-g]').forEach(card => {
            const g = shown[Number(card.dataset.g)];
            card.querySelectorAll('[data-a]').forEach(b => b.onclick = () => groupAction(g, b.dataset.a, b));
        });
    }
    function groupCard(g, i) {
        const r = g.route, run = g.run, list = g.sales;
        const sum = r2(list.reduce((a, s) => a + collectInfo(s).amount, 0));
        const drv = run ? (driverOf(run.driverId) || { name: run.driverName }) : (r && driverOf(r.driverId));
        const rs = run ? (RUNST[run.status] || [run.status, '', 'run']) : null;
        const title = run ? `Carga nº ${esc(run.number || '—')}${r || run.routeName ? ' · ' + esc((r && r.name) || run.routeName) : ''}` : (r ? esc(r.name) : 'Sem rota');
        const sub = [r && r.weekdays && r.weekdays.length ? wdText(r.weekdays) : '', drv && drv.name ? 'Entregador: ' + drv.name : ''].filter(Boolean).join(' · ');
        const sameRun = !run && E.runs.find(x => x.kind !== 'acerto' && x.status === 'carregando' && x.date === ST.date && (x.routeId || '') === (g.routeId || ''));
        const st = s => run ? (s.settledAt ? '<span class="dpe-tag t-ok">Acertada</span>' : stTag(s)) : '';
        let foot = '';
        if (!run) foot = `<button type="button" class="dpe-btn pri" data-a="load"><i class="fas fa-truck-ramp-box"></i> Montar carga</button>${sameRun ? `<button type="button" class="dpe-btn" data-a="add"><i class="fas fa-plus"></i> Pôr na carga nº ${esc(sameRun.number)}</button>` : ''}<button type="button" class="dpe-btn" data-a="maps"><i class="fas fa-map-location-dot"></i> Google Maps</button>`;
        else {
            foot = `<button type="button" class="dpe-btn" data-a="print"><i class="fas fa-print"></i> Romaneio</button><button type="button" class="dpe-btn" data-a="maps"><i class="fas fa-map-location-dot"></i> Google Maps</button>`;
            if (run.status === 'carregando') foot += `<button type="button" class="dpe-btn pri" data-a="go"><i class="fas fa-truck-fast"></i> Saiu para entrega</button><button type="button" class="dpe-btn dg" data-a="undo" title="Desfazer a carga"><i class="fas fa-xmark"></i> Desfazer</button>`;
            if (run.status === 'em_rota' || run.status === 'carregando') foot += `<button type="button" class="dpe-btn ok" data-a="settle"><i class="fas fa-hand-holding-dollar"></i> Fazer acerto</button>`;
            if (run.status === 'acertado') foot += `<button type="button" class="dpe-btn" data-a="sprint"><i class="fas fa-receipt"></i> Imprimir acerto</button>`;
        }
        return `<section class="dpe-card" data-g="${i}"><header><span class="dpe-ic ${rs ? rs[2] : ''}"><i class="fas ${run ? 'fa-truck' : 'fa-route'}"></i></span><div style="min-width:0"><h4>${title}${rs ? ` <span class="dpe-tag ${rs[1]}">${rs[0]}</span>` : ''}</h4>${sub ? `<small>${esc(sub)}</small>` : ''}</div><div class="dpe-kp"><b>${plural(list.length, 'entrega', 'entregas')}</b><small>${sum ? 'cobrar ' + money(sum) : 'nada a cobrar'}</small></div></header>
<ol class="dpe-stops">${list.map((s, k) => stopLi(s, k, run ? `<div style="margin-top:4px">${st(s)}</div>` : '')).join('')}</ol><footer>${foot}</footer></section>`;
    }
    async function groupAction(g, a, btn) {
        try {
            if (a === 'load') return openLoad(g);
            if (a === 'maps') return openMaps(g.sales);
            if (a === 'print') return printRomaneio(g.run);
            if (a === 'sprint') return printSettle(g.run.mergedInto ? runOf(g.run.mergedInto) : g.run);
            if (a === 'settle') return openSettle({ runId: g.run.id, driverId: g.run.driverId, date: g.run.date });
            if (a === 'add') {
                const run = E.runs.find(x => x.kind !== 'acerto' && x.status === 'carregando' && x.date === ST.date && (x.routeId || '') === (g.routeId || '')); if (!run) return;
                btn.disabled = true;
                const ids = [...(run.saleIds || []), ...g.sales.map(s => s.id)];
                await db.collection('delivery_runs').doc(run.id).update({ saleIds: ids, updatedAt: ts() });
                const drv = driverOf(run.driverId);
                for (const [k, s] of g.sales.entries()) await db.collection('sales').doc(s.id).update({ runId: run.id, deliveryOrder: (run.saleIds || []).length + k + 1, ...(drv ? { motoboyId: drv.id, motoboyName: drv.name } : {}), updatedAt: ts() });
                toast('success', `Foram para a carga nº ${run.number}. Imprima o romaneio de novo.`); return refresh();
            }
            if (a === 'go') {
                const run = g.run, drv = driverOf(run.driverId) || { id: run.driverId, name: run.driverName };
                btn.disabled = true;
                for (const s of g.sales) if (!isOut(s) && !s.settledAt) await db.collection('sales').doc(s.id).update({ status: 'delivering', motoboyId: drv.id || '', motoboyName: drv.name || '', dispatchedAt: ts(), updatedAt: ts() });
                await db.collection('delivery_runs').doc(run.id).update({ status: 'em_rota', departedAt: ts(), updatedAt: ts() });
                if (drv.id) { try { await db.collection('motoboys').doc(drv.id).update({ currentStatus: 'delivering' }); } catch (e) { } }
                toast('success', `Carga nº ${run.number} saiu para entrega.`); return refresh();
            }
            if (a === 'undo') {
                if (!confirm(`Desfazer a carga nº ${g.run.number}? As entregas voltam para a lista do dia.`)) return;
                btn.disabled = true;
                for (const s of g.sales) await db.collection('sales').doc(s.id).update({ runId: '', deliveryOrder: null, updatedAt: ts() });
                await db.collection('delivery_runs').doc(g.run.id).update({ status: 'cancelada', deleted: true, updatedAt: ts() });
                toast('success', 'Carga desfeita.'); return refresh();
            }
        } catch (e) { console.error(e); toast('error', 'Não deu certo: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); if (btn) btn.disabled = false; }
    }
    function mapsLinks(sales) {
        const g = D.general || {}, city = [g.cidade, g.uf].filter(Boolean).join(' - ');
        const stopOf = s => okNum(s.deliveryLat) && okNum(s.deliveryLng) ? `${Number(s.deliveryLat)},${Number(s.deliveryLng)}` : (city && !words(s.address).includes(words(g.cidade || '§§')) ? `${s.address}, ${city}` : String(s.address || ''));
        const stops = sales.filter(s => String(s.address || '').trim() || okNum(s.deliveryLat)).map(stopOf);
        const parts = []; let origin = storeAddress();
        for (let i = 0; i < stops.length; i += 9) { const chunk = stops.slice(i, i + 9); parts.push('https://www.google.com/maps/dir/' + [origin, ...chunk].map(x => encodeURIComponent(x || '')).join('/')); origin = chunk[chunk.length - 1]; }
        return parts;
    }
    function openMaps(sales) {
        const links = mapsLinks(sales);
        if (!links.length) { toast('warning', 'Essas entregas não têm endereço.'); return; }
        if (links.length === 1) { window.open(links[0], '_blank', 'noopener'); return; }
        modal('Abrir no Google Maps', 'fa-map-location-dot', `<p style="font-size:13px;color:var(--text-muted);margin:0 0 12px">O Google Maps abre até 10 paradas por vez. A rota foi dividida em ${links.length} partes, na ordem da carga.</p><div style="display:flex;flex-direction:column;gap:8px">${links.map((l, i) => `<a class="dpe-btn" href="${esc(l)}" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Parte ${i + 1}</a>`).join('')}</div>`, '<button class="btn btn-secondary" type="button" data-x>Fechar</button>', 'sm');
    }

    /* ---------- Montar carga ---------- */
    async function openLoad(g) {
        const r = g.route;
        let order = g.sales.map(s => s.id);
        const on = new Set(order);
        const byId = id => E.byId.get(id);
        const def = (r && driverOf(r.driverId)) || (activeDrivers().length === 1 ? activeDrivers()[0] : null);
        const m = modal(`Montar carga · ${esc(r ? r.name : 'Sem rota')} · ${esc(fmtDay(ST.date))}`, 'fa-truck-ramp-box',
            `<div class="dpe-g"><div class="dpe-fg"><label class="dpe-fl">Entregador</label><select class="form-control" id="dpeLDrv"><option value="">Escolha quem leva</option>${activeDrivers().map(d => `<option value="${esc(d.id)}" ${def && def.id === d.id ? 'selected' : ''}>${esc(d.name)}${d.vehicle || d.plate ? ' · ' + esc([d.vehicle, d.plate].filter(Boolean).join(' ')) : ''}</option>`).join('')}</select>${activeDrivers().length ? '' : '<small>Cadastre o entregador em Motoboys.</small>'}</div>
<div class="dpe-fg"><label class="dpe-fl">Troco que ele leva do caixa (R$)</label><input class="form-control" id="dpeLChg" inputmode="decimal" placeholder="0,00"><small id="dpeLChgH"></small></div></div>
<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:2px 0 8px"><b style="font-size:13px;color:var(--text-heading)">Ordem das entregas</b><small style="color:var(--text-muted)">Use as setas ou desmarque o que não vai nesta carga.</small><span style="flex:1"></span>${MENSAL.optimize ? `<button type="button" class="dpe-btn sm" id="dpeLOpt"><i class="fas fa-wand-magic-sparkles"></i> Melhor ordem pelo mapa${pill()}</button>` : ''}</div>
<div class="dpe-ol" id="dpeLList"></div><div class="dpe-prog" id="dpeLProg" hidden></div>`,
            `<button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-primary" type="button" id="dpeLGo"><i class="fas fa-print"></i> Criar carga e imprimir romaneio</button>`);
        const paintList = () => {
            m.q('#dpeLList').innerHTML = order.map((id, k) => { const s = byId(id); const c = collectInfo(s); return `<div class="dpe-oi ${on.has(id) ? '' : 'off'}" data-id="${esc(id)}"><input type="checkbox" ${on.has(id) ? 'checked' : ''} title="Vai nesta carga"><span class="dpe-n">${k + 1}</span><div style="min-width:0"><b>${esc(custName(s))}</b><small>${esc(addrOf(s))}</small></div><div class="dpe-r"><b>${c.amount ? money(c.amount) : 'pago'}</b><small>${c.amount ? esc(c.toCollect.length > 1 ? 'vários' : mLabel(c.method)) : ''}</small></div><div class="dpe-mv"><button type="button" data-up title="Subir"><i class="fas fa-arrow-up"></i></button><button type="button" data-dn title="Descer"><i class="fas fa-arrow-down"></i></button></div></div>`; }).join('');
            m.qa('.dpe-oi').forEach(el => {
                const id = el.dataset.id, k = order.indexOf(id);
                el.querySelector('input').onchange = e => { if (e.target.checked) on.add(id); else on.delete(id); paintList(); };
                el.querySelector('[data-up]').onclick = () => { if (k > 0) { order.splice(k, 1); order.splice(k - 1, 0, id); paintList(); } };
                el.querySelector('[data-dn]').onclick = () => { if (k < order.length - 1) { order.splice(k, 1); order.splice(k + 1, 0, id); paintList(); } };
            });
            const chg = r2(order.filter(id => on.has(id)).reduce((a, id) => a + collectInfo(byId(id)).changeToTake, 0));
            m.q('#dpeLChgH').innerHTML = chg ? `As vias pedem <b>${money(chg)}</b> de troco. <button type="button" class="dpe-lnk" id="dpeLChgU">Usar esse valor</button>` : 'Se ele sai com troco do caixa, anote aqui (entra na conta do acerto).';
            const u = m.q('#dpeLChgU'); if (u) u.onclick = () => { m.q('#dpeLChg').value = num2(chg); };
        };
        paintList();
        const opt = m.q('#dpeLOpt');
        if (opt) opt.onclick = async () => {
            const prog = m.q('#dpeLProg'); prog.hidden = false; opt.disabled = true;
            try {
                const res = await MENSAL.optimize(order.filter(id => on.has(id)).map(byId), t => { prog.textContent = t; });
                const rest = order.filter(id => !on.has(id));
                order = res.order.concat(rest); paintList();
                prog.textContent = `Pronto: ordem pelo caminho mais curto${res.km ? ` (cerca de ${String(res.km).replace('.', ',')} km${res.min ? ', ' + res.min + ' min' : ''}, ida e volta)` : ''}.${res.lost ? ` ${plural(res.lost, 'endereço não foi achado', 'endereços não foram achados')} no mapa e ${res.lost === 1 ? 'ficou' : 'ficaram'} no fim.` : ''}${res.noStart ? ' Dica: preencha o endereço da empresa em Configurações para a rota sair da loja.' : ''}`;
            } catch (e) { prog.textContent = 'Não deu para calcular agora: ' + e.message; }
            opt.disabled = false;
        };
        m.q('#dpeLGo').onclick = async e => {
            const ids = order.filter(id => on.has(id)); if (!ids.length) { toast('warning', 'Marque pelo menos uma entrega.'); return; }
            const drv = driverOf(m.q('#dpeLDrv').value); if (!drv) { toast('warning', 'Escolha o entregador.'); m.q('#dpeLDrv').focus(); return; }
            const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Criando…';
            let w = null;
            try {
                const number = E.runs.reduce((a, x) => Math.max(a, num(x.number)), 0) + 1;
                const run = { number, kind: 'carga', date: ST.date, routeId: r ? r.id : '', routeName: r ? r.name : '', driverId: drv.id, driverName: drv.name, vehicle: [drv.vehicle || drv.veiculo, drv.plate || drv.placa].filter(Boolean).join(' · '), saleIds: ids, status: 'carregando', changeTaken: r2(num(m.q('#dpeLChg').value)), createdAt: ts(), createdBy: uid(), createdByName: meName(), deleted: false, updatedAt: ts() };
                w = window.open('', '_blank', 'width=900,height=900');
                const ref = await db.collection('delivery_runs').add(run);
                for (const [k, id] of ids.entries()) await db.collection('sales').doc(id).update({ runId: ref.id, deliveryOrder: k + 1, motoboyId: drv.id, motoboyName: drv.name, ...(r && !byId(id).routeId ? { routeId: r.id, routeName: r.name } : {}), updatedAt: ts() });
                m.close();
                toast('success', `Carga nº ${number} criada.`);
                await refresh();
                printRomaneio(E.runs.find(x => x.id === ref.id) || { ...run, id: ref.id }, w);
            } catch (err) { console.error(err); try { if (w) w.close(); } catch (e2) { } toast('error', 'Não foi possível criar a carga: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); btn.disabled = false; btn.innerHTML = '<i class="fas fa-print"></i> Criar carga e imprimir romaneio'; }
        };
    }

    /* ---------- Romaneio ---------- */
    function printWin(w, title, html) {
        w = w || window.open('', '_blank', 'width=900,height=900');
        if (!w) { toast('warning', 'O navegador bloqueou a janela de impressão. Permita pop-ups.'); return; }
        w.document.open(); w.document.write(html); w.document.close();
        try { w.document.title = title; } catch (e) { }
    }
    const PRINT_CSS = `*{box-sizing:border-box;margin:0;padding:0}body{background:#f1f5f9;color:#111;padding:62px 10px 30px;font-family:"Segoe UI",Arial,sans-serif;font-size:13px}
.bar{position:fixed;top:0;left:0;right:0;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;gap:8px;align-items:center;z-index:9}.bar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-size:13px;font-weight:600;color:#334155}.bar button.on{background:#e0e7ff;border-color:#6366f1;color:#4338ca}.bar button.p{background:#6366f1;color:#fff;border-color:#6366f1}.bar .sp{flex:1}
.doc{background:#fff;margin:0 auto;padding:16px;max-width:210mm}.doc.c80{max-width:80mm;padding:8px;font-size:11.5px}
h1{font-size:18px;margin-bottom:2px}.sub{color:#475569;font-size:12px}.hd{display:flex;justify-content:space-between;gap:12px;border-bottom:2px solid #111;padding-bottom:8px;margin-bottom:10px;flex-wrap:wrap}
.sec{font-weight:800;font-size:12px;letter-spacing:.5px;margin:14px 0 6px;text-transform:uppercase}
table{width:100%;border-collapse:collapse}th{text-align:left;border-bottom:1px solid #64748b;padding:4px 3px;font-size:11.5px}td{padding:5px 3px;border-bottom:1px dotted #cbd5e1;vertical-align:top}.n{text-align:right;white-space:nowrap}
.big{font-size:14px;font-weight:800}.muted{color:#64748b;font-size:11px}.box{border:1.5px solid #111;border-radius:4px;padding:2px 6px;display:inline-block;font-weight:800}
.tot{display:flex;gap:16px;flex-wrap:wrap;margin-top:8px;font-size:12.5px}.tot b{font-size:14px}.sig{display:flex;gap:20px;margin-top:34px}.sig div{flex:1;text-align:center;font-size:11px;color:#334155}.sig span{display:block;border-top:1px solid #334155;margin-bottom:4px}
.c80 .hd{display:block}.c80 table th:nth-child(3),.c80 table td:nth-child(3){display:none}.c80 .sig{display:block}.c80 .sig div{margin-top:26px}
@media print{body{background:#fff;padding:0}.bar{display:none}.doc{max-width:none;padding:0}.doc.c80{width:72mm}@page{margin:8mm}}`;
    const printShell = (title, inner) => `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body><div class="bar"><button class="on" onclick="document.querySelector('.doc').classList.remove('c80');this.classList.add('on');this.nextElementSibling.classList.remove('on')">A4</button><button onclick="document.querySelector('.doc').classList.add('c80');this.classList.add('on');this.previousElementSibling.classList.remove('on')">80 mm</button><span class="sp"></span><button class="p" onclick="window.print()">Imprimir</button></div><div class="doc">${inner}</div></body></html>`;
    function romaneioHtml(run, sales) {
        const prod = new Map();
        sales.forEach(s => (s.items || []).forEach(it => {
            if (!it || it.isService || it._dpBottleFee || /\(casco\)$/i.test(it.productName || '')) return;
            const f = num(it._factor) || 1, key = (it.productId || it.productName) + '|' + f;
            const p = prod.get(key) || { name: it.productName || 'Item', qty: 0, factor: f, unit: it.unit || 'un' };
            p.qty += num(it.quantity); prod.set(key, p);
        }));
        const items = [...prod.values()].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
        const bottles = new Map();
        sales.forEach(s => (s.bottles || []).forEach(b => { if (int(b.troca) > 0) bottles.set(b.name || b.typeId, (bottles.get(b.name || b.typeId) || 0) + int(b.troca)); }));
        const tot = { cash: 0, other: 0, change: 0, paid: 0 };
        sales.forEach(s => { const c = collectInfo(s); tot.cash += c.cash; tot.other += c.amount - c.cash; tot.change += c.changeToTake; if (!c.amount) tot.paid++; });
        const rows = sales.map((s, i) => { const c = collectInfo(s); const phone = s.customerPhone || ''; return `<tr><td class="big">${i + 1}</td><td><b>${esc(custName(s))}</b> <span class="muted">${saleNo(s)}</span><div>${esc(addrOf(s))}</div>${s.addressRef ? `<div class="muted">Ref.: ${esc(s.addressRef)}</div>` : ''}${phone ? `<div class="muted">Tel.: ${esc(phone)}</div>` : ''}${s.notes ? `<div class="muted">Obs.: ${esc(s.notes)}</div>` : ''}</td><td>${(s.items || []).filter(it => !it.isService).map(it => `${fq(it.quantity)} × ${esc(it.productName)}`).join('<br>')}</td><td class="n">${c.amount ? `<span class="box">${money(c.amount)}</span><div class="muted">${esc(c.toCollect.length > 1 ? c.toCollect.map(p => mLabel(p.method) + ' ' + money(p.amount)).join(' + ') : mLabel(c.method))}</div>${c.changeToTake ? `<div><b>troco ${money(c.changeToTake)}</b></div>` : ''}` : `<b>${c.fiado ? 'FIADO' : 'PAGO'}</b>`}</td></tr>`; }).join('');
        const g = D.general || {};
        return `<div class="hd"><div><h1>Romaneio de carga nº ${esc(run.number || '—')}</h1><div class="sub">${esc(company())}${g.telefone ? ' · ' + esc(g.telefone) : ''}</div></div><div style="text-align:right"><div class="big">${esc(fmtDay(run.date || today()))}${run.routeName ? ' · ' + esc(run.routeName) : ''}</div><div class="sub">Entregador: <b>${esc(run.driverName || '—')}</b>${run.vehicle ? ' · ' + esc(run.vehicle) : ''}</div><div class="muted">Impresso em ${new Date().toLocaleString('pt-BR')}</div></div></div>
<div class="sec">Carregar (${plural(items.length, 'produto', 'produtos')})</div><table><thead><tr><th>Produto</th><th class="n">Quantidade</th><th class="n">Em unidades</th></tr></thead><tbody>${items.map(p => `<tr><td>${esc(p.name)}</td><td class="n big">${fq(p.qty)}${p.factor > 1 ? '' : ' ' + esc(p.unit)}</td><td class="n">${p.factor > 1 ? fq(p.qty * p.factor) + ' un' : ''}</td></tr>`).join('') || '<tr><td colspan="3" class="muted">Sem produtos.</td></tr>'}</tbody></table>
${bottles.size ? `<div class="sec">Recolher cascos vazios</div><div>${[...bottles.entries()].map(([n, q]) => `<span class="box" style="margin:0 6px 6px 0">${fq(q)} × ${esc(n)}</span>`).join('')}</div>` : ''}
<div class="sec">Entregas na ordem (${sales.length})</div><table><thead><tr><th>#</th><th>Cliente e endereço</th><th>Itens</th><th class="n">Cobrar</th></tr></thead><tbody>${rows}</tbody></table>
<div class="tot"><span>Cobrar em dinheiro: <b>${money(tot.cash)}</b></span><span>Cartão / Pix / outros: <b>${money(tot.other)}</b></span>${tot.change ? `<span>Troco pedido nas vias: <b>${money(tot.change)}</b></span>` : ''}${num(run.changeTaken) ? `<span>Troco levado do caixa: <b>${money(run.changeTaken)}</b></span>` : ''}${tot.paid ? `<span>Já pagas: <b>${tot.paid}</b></span>` : ''}</div>
<div class="sig"><div><span></span>Conferido por</div><div><span></span>${esc(run.driverName || 'Entregador')}</div></div>`;
    }
    function printRomaneio(run, w) {
        if (!run) return;
        const sales = (run.saleIds || []).map(id => E.byId.get(id)).filter(Boolean);
        printWin(w, 'Romaneio nº ' + (run.number || ''), printShell('Romaneio nº ' + (run.number || ''), romaneioHtml(run, sales)));
    }

    /* =================== Acerto do entregador =================== */
    /** Entregas com o entregador que ainda não foram acertadas (as da carga aberta e as de ontem e hoje que já saíram) */
    function pendingFor(driverId, date) {
        const from = addDays(date, -1);
        return E.sales.filter(s => {
            if (s.status === 'cancelled' || s.settledAt) return false;
            const run = openRunOf(s);
            if (run) return run.driverId === driverId && run.status === 'em_rota';
            return s.motoboyId === driverId && isOut(s) && saleDay(s) >= from && saleDay(s) <= date;
        });
    }
    function pendingDrivers(date) {
        const ids = new Set();
        E.sales.forEach(s => { if (s.status === 'cancelled' || s.settledAt) return; const run = openRunOf(s); if (run && run.status === 'em_rota') ids.add(run.driverId); else if (!run && s.motoboyId && isOut(s) && saleDay(s) >= addDays(date, -1) && saleDay(s) <= date) ids.add(s.motoboyId); });
        return [...ids].filter(Boolean).map(id => ({ id, name: (driverOf(id) || {}).name || (E.sales.find(s => s.motoboyId === id) || {}).motoboyName || 'Entregador', list: pendingFor(id, date) })).filter(x => x.list.length).sort(byName);
    }
    function paintAcerto() {
        const root = $('dpePAc'); if (!root) return;
        const date = ST.adate, t = today();
        const pend = pendingDrivers(date);
        const done = E.runs.filter(r => r.status === 'acertado' && !r.mergedInto && (r.settledDate || r.date) === date).sort((a, b) => num(b.number) - num(a.number));
        const loading = E.runs.filter(r => r.kind !== 'acerto' && r.status === 'carregando' && r.date <= date);
        root.innerHTML = `<div class="dpe-bar"><div class="dpe-seg">${[[t, 'Hoje'], [addDays(t, -1), 'Ontem']].map(([d, l]) => `<button type="button" data-d="${d}" class="${date === d ? 'on' : ''}">${l}</button>`).join('')}</div><input type="date" class="dpe-in" id="dpeADate" value="${date}" max="${t}"><span class="sp"></span><button type="button" class="dpe-btn" data-reload title="Atualizar"><i class="fas fa-rotate-right"></i></button></div>
<p class="dpe-hint" style="margin:-6px 0 14px">No fim do turno ou na volta da rota: marque o que foi entregue e veja quanto o entregador devolve em dinheiro, o que entrou no cartão e no Pix e a taxa dele.</p>
${loading.length ? `<div class="dpe-note info"><i class="fas fa-circle-info"></i><span>${loading.map(r => `Carga nº ${esc(r.number)} (${esc(r.driverName || '')})`).join(', ')} ainda ${loading.length === 1 ? 'está' : 'estão'} carregando. Marque "Saiu para entrega" em Rotas e carga para ela${loading.length === 1 ? '' : 's'} aparecer${loading.length === 1 ? '' : 'em'} aqui.</span></div>` : ''}
${pend.length ? `<div class="dpe-cards">${pend.map((p, i) => { const cash = r2(p.list.reduce((a, s) => a + collectInfo(s).cash, 0)), other = r2(p.list.reduce((a, s) => { const c = collectInfo(s); return a + c.amount - c.cash; }, 0)); const m = driverOf(p.id); const fee = m ? driverFee(m, p.list) : 0; return `<section class="dpe-card"><header><span class="dpe-ic go"><i class="fas fa-motorcycle"></i></span><div style="min-width:0"><h4>${esc(p.name)}</h4><small>${plural(p.list.length, 'entrega', 'entregas')} para acertar${m ? ' · taxa: ' + esc(feeRule(m)) : ''}</small></div><div class="dpe-kp"><b>${money(cash)}</b><small>em dinheiro</small></div></header>
<ol class="dpe-stops">${p.list.slice(0, 6).map((s, k) => stopLi(s, k, `<div style="margin-top:4px">${stTag(s)}</div>`)).join('')}${p.list.length > 6 ? `<li style="display:block;text-align:center"><small>+ ${p.list.length - 6}</small></li>` : ''}</ol>
<footer><span class="dpe-hint" style="flex:1;align-self:center">Cartão/Pix: <b>${money(other)}</b>${fee ? ` · taxa dele: <b>${money(fee)}</b>` : ''}</span><button type="button" class="dpe-btn ok" data-ac="${i}"><i class="fas fa-hand-holding-dollar"></i> Fazer acerto</button></footer></section>`; }).join('')}</div>` : `<div class="card dpe-empty"><i class="fas fa-circle-check"></i>Nenhum acerto pendente para ${esc(dayLabel(date))}.<br><small>As entregas que saem com um entregador (no PDV ou em Rotas e carga) aparecem aqui até o acerto.</small></div>`}
${done.length ? `<h4 style="margin:22px 0 10px;font-size:14px;color:var(--text-heading)"><i class="fas fa-clipboard-check" style="color:#059669;margin-right:6px"></i>Acertos feitos ${esc(dayLabel(date))}</h4><div class="dpe-rl">${done.map(r => { const st = r.settlement || {}; return `<div class="dpe-ri"><span class="dpe-ic done" style="width:34px;height:34px;font-size:15px"><i class="fas fa-clipboard-check"></i></span><div><b>${esc(r.driverName || 'Entregador')}${r.kind !== 'acerto' ? ' · carga nº ' + esc(r.number) : ''}</b><small>${plural(num(st.delivered), 'entrega', 'entregas')} · devolveu ${money(st.cashToReturn)} em dinheiro${num(st.driverFee) ? ' · taxa ' + money(st.driverFee) : ''}${(st.notDelivered || []).length ? ' · ' + plural(st.notDelivered.length, 'não entregue', 'não entregues') : ''}${st.byName ? ' · por ' + esc(st.byName) : ''}</small></div><button class="dpe-btn sm" type="button" data-pr="${esc(r.id)}"><i class="fas fa-print"></i> Imprimir</button></div>`; }).join('')}</div>` : ''}`;
        root.querySelectorAll('[data-d]').forEach(b => b.onclick = () => { ST.adate = b.dataset.d; paintAcerto(); });
        root.querySelector('#dpeADate').onchange = e => { if (e.target.value) { ST.adate = e.target.value; paintAcerto(); } };
        root.querySelector('[data-reload]').onclick = () => refresh();
        root.querySelectorAll('[data-ac]').forEach(b => b.onclick = () => { const p = pend[Number(b.dataset.ac)]; const run = p.list.map(openRunOf).find(Boolean); openSettle({ driverId: p.id, driverName: p.name, date, runId: run && p.list.every(s => openRunOf(s) === run) ? run.id : '' }); });
        root.querySelectorAll('[data-pr]').forEach(b => b.onclick = () => printSettle(E.runs.find(r => r.id === b.dataset.pr)));
    }
    const REC = { cash: 'Dinheiro', pix: 'Pix', card: 'Cartão', other: 'Outra forma', fiado: 'Ficou fiado', paid: 'Já estava pago', multi: 'Como lançado' };
    function defaultRec(s) { const c = collectInfo(s); if (!c.amount) return c.fiado && !c.paid ? 'fiado' : 'paid'; if (c.toCollect.length > 1) return 'multi'; return c.toCollect[0].bucket; }
    async function openSettle(opt) {
        await loadData();
        const date = opt.date || today();
        const m0 = driverOf(opt.driverId);
        const driver = m0 || { id: opt.driverId || '', name: opt.driverName || 'Entregador', commissionType: 'none' };
        const run = opt.runId ? runOf(opt.runId) : null;
        const list = run ? (run.saleIds || []).map(id => E.byId.get(id)).filter(s => s && !s.settledAt && s.status !== 'cancelled') : pendingFor(driver.id, date);
        if (!list.length) { toast('info', 'Nada para acertar com este entregador.'); return; }
        const rows = list.map(s => ({ s, c: collectInfo(s), ok: true, rec: defaultRec(s), next: nextRouteDay(routeOf(s.routeId), date, false), bottles: (s.bottles || []).filter(b => int(b.troca) > 0).map(b => ({ typeId: b.typeId, name: b.name || 'Casco', troca: int(b.troca), back: int(b.troca) })) }));
        const st = { change: num(run && run.changeTaken), fee: 0, feeEdited: false, payNow: false, notes: '' };
        const hasBottles = rows.some(r => r.bottles.length) && !!window.DPVasilhames;
        const m = modal(`Acerto · ${esc(driver.name)} · ${esc(fmtDay(date))}`, 'fa-hand-holding-dollar', `<div id="dpeSRows"></div><div class="dpe-sum" id="dpeSSum"></div>`,
            `<button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-outline" type="button" id="dpeSPrint"><i class="fas fa-print"></i> Imprimir conferência</button><button class="btn btn-success" type="button" id="dpeSOk"><i class="fas fa-check"></i> Confirmar acerto</button>`);
        const recOpts = r => { const c = r.c; const l = r.rec === 'multi' || c.toCollect.length > 1 ? ['multi', 'cash', 'pix', 'card', 'fiado'] : !c.amount ? ['paid', 'fiado'] : ['cash', 'pix', 'card', 'other', 'fiado']; return l.map(k => `<option value="${k}" ${r.rec === k ? 'selected' : ''}>${REC[k]}</option>`).join(''); };
        function paintRows() {
            m.q('#dpeSRows').innerHTML = rows.map((r, i) => {
                const s = r.s, c = r.c, exp = c.amount ? `Cobrar ${money(c.amount)} · ${esc(c.toCollect.length > 1 ? c.toCollect.map(p => mLabel(p.method) + ' ' + money(p.amount)).join(' + ') : mLabel(c.method))}${c.changeToTake ? ' · troco p/ ' + money(c.changeFor) : ''}` : (c.fiado && !c.paid ? `Fiado ${money(c.fiado)} · nada a cobrar` : `Já pago (${money(s.total)})`);
                const changed = r.ok && r.rec !== defaultRec(s) && c.amount;
                return `<div class="dpe-ar ${r.ok ? '' : 'off'}" data-i="${i}"><input type="checkbox" ${r.ok ? 'checked' : ''} title="Entregue" data-ok><div class="dpe-ai"><b>${esc(custName(s))}</b> <small style="display:inline">${saleNo(s)}</small><small>${esc(addrOf(s))}</small><small class="exp">${exp}</small></div>
<div class="dpe-ax">${r.ok ? `<select data-rec title="Como o cliente pagou">${recOpts(r)}</select>${changed ? `<span class="warn">A venda foi lançada como ${esc(c.toCollect.length > 1 ? 'vários' : mLabel(c.method))}. Para o caixa bater, ajuste a forma na venda (Pedidos › detalhes › Editar).</span>` : ''}${hasBottles ? r.bottles.map((b, k) => `<label>Cascos de ${esc(b.name)} que voltaram <input type="number" min="0" step="1" value="${b.back}" data-b="${k}"></label><span class="dpe-hint">de ${b.troca}</span>`).join('') : ''}` : `<label>Volta para <input type="date" value="${r.next}" min="${addDays(date, 1)}" data-next style="width:140px"></label><span class="dpe-hint">Não entregue: volta para a rota${routeOf(s.routeId) ? ' ' + esc(routeOf(s.routeId).name) : ''} em ${esc(fmtDay(r.next))}.</span>`}</div></div>`;
            }).join('');
            m.qa('.dpe-ar').forEach(el => {
                const r = rows[Number(el.dataset.i)];
                el.querySelector('[data-ok]').onchange = e => { r.ok = e.target.checked; paintRows(); };
                const rec = el.querySelector('[data-rec]'); if (rec) rec.onchange = e => { r.rec = e.target.value; paintRows(); };
                const nx = el.querySelector('[data-next]'); if (nx) nx.onchange = e => { if (e.target.value > date) { r.next = e.target.value; paintRows(); } };
                el.querySelectorAll('[data-b]').forEach(b => b.onchange = e => { r.bottles[Number(b.dataset.b)].back = int(e.target.value); paintSum(); });
            });
            paintSum();
        }
        function totals() {
            const t = { cash: 0, pix: 0, card: 0, other: 0, fiado: 0, paid: 0, ok: [], no: [], change: 0 };
            rows.forEach(r => {
                if (!r.ok) { t.no.push(r); return; }
                t.ok.push(r);
                const c = r.c;
                if (r.rec === 'multi') c.toCollect.forEach(p => { t[p.bucket in t ? p.bucket : 'other'] += p.amount; });
                else if (r.rec === 'paid') t.paid += c.paid || r2(num(r.s.total) - c.fiado);
                else if (c.amount) t[r.rec] += c.amount;
                t.fiado += c.fiado;
                if (r.rec === 'cash' || (r.rec === 'multi' && c.cash)) t.change += c.changeToTake;
            });
            ['cash', 'pix', 'card', 'other', 'fiado', 'paid', 'change'].forEach(k => { t[k] = r2(t[k]); });
            return t;
        }
        function paintSum() {
            const t = totals();
            if (!st.feeEdited) st.fee = driverFee(driver, t.ok.map(r => r.s));
            const back = r2(t.cash + st.change - (st.payNow ? st.fee : 0));
            const noVal = r2(t.no.reduce((a, r) => a + r.c.cash, 0));
            m.q('#dpeSSum').innerHTML = `<div class="ln"><span>Entregues</span><b>${t.ok.length} de ${rows.length}</b></div>
<div class="ln"><span>Recebido em dinheiro</span><b>${money(t.cash)}</b></div>
<div class="ln"><span>+ Troco que levou do caixa${t.change && !st.change ? ` <button type="button" class="dpe-lnk" id="dpeSChgU">usar ${money(t.change)} das vias</button>` : ''}</span><input type="text" inputmode="decimal" id="dpeSChg" value="${st.change ? num2(st.change) : ''}" placeholder="0,00"></div>
<div class="ln"><span>Taxa do entregador <small style="color:var(--text-muted)">(${esc(feeRule(driver))})</small></span><input type="text" inputmode="decimal" id="dpeSFee" value="${num2(st.fee)}"></div>
<label class="ln" style="justify-content:flex-start;gap:8px;cursor:pointer"><input type="checkbox" id="dpeSPay" ${st.payNow ? 'checked' : ''} style="width:16px;height:16px;accent-color:var(--accent)"><span>Pagar a taxa agora com o dinheiro dele (lança sangria no caixa)</span></label>
<div class="ln tot"><span>Ele devolve em dinheiro</span><b>${money(back)}</b></div>
<div class="mini"><div><small>Pix</small><b>${money(t.pix)}</b></div><div><small>Cartão</small><b>${money(t.card)}</b></div>${t.other ? `<div><small>Outras formas</small><b>${money(t.other)}</b></div>` : ''}<div><small>Fiado</small><b>${money(t.fiado)}</b></div><div><small>Já pago</small><b>${money(t.paid)}</b></div></div>
${t.no.length ? `<div class="dpe-note" style="margin:10px 0 0"><i class="fas fa-calendar-days"></i><span><b>${plural(t.no.length, 'não entregue', 'não entregues')}</b>: ${plural(t.no.length, 'volta', 'voltam')} para a próxima data da rota.${noVal ? ` O caixa já contou ${money(noVal)} em dinheiro dessas vendas.` : ''}</span></div>` : ''}
<div class="dpe-fg" style="margin:10px 0 0"><label class="dpe-fl">Observações</label><input class="form-control" id="dpeSNotes" maxlength="300" value="${esc(st.notes)}" placeholder="Ex.: cliente pediu para entregar amanhã cedo"></div>`;
            const chg = m.q('#dpeSChg'); chg.onchange = () => { st.change = r2(num(chg.value)); paintSum(); };
            const u = m.q('#dpeSChgU'); if (u) u.onclick = () => { st.change = t.change; paintSum(); };
            const fee = m.q('#dpeSFee'); fee.onchange = () => { st.fee = r2(num(fee.value)); st.feeEdited = true; paintSum(); };
            m.q('#dpeSPay').onchange = e => { st.payNow = e.target.checked; paintSum(); };
            m.q('#dpeSNotes').oninput = e => { st.notes = e.target.value; };
        }
        paintRows();
        const build = () => {
            const t = totals();
            return { cash: t.cash, pix: t.pix, card: t.card, other: t.other, fiado: t.fiado, paid: t.paid, changeTaken: st.change, driverFee: st.fee, feePaidFromCash: st.payNow && st.fee > 0,
                cashToReturn: r2(t.cash + st.change - (st.payNow ? st.fee : 0)), delivered: t.ok.length, total: rows.length,
                deliveredIds: t.ok.map(r => r.s.id), notDelivered: t.no.map(r => ({ saleId: r.s.id, saleNumber: r.s.saleNumber || null, customerName: custName(r.s), next: r.next })),
                lines: rows.map(r => ({ saleId: r.s.id, saleNumber: r.s.saleNumber || null, customerName: custName(r.s), ok: r.ok, amount: r.c.amount, rec: r.ok ? r.rec : '', expected: r.c.method || '' })),
                bottlesBack: rows.filter(r => r.ok).reduce((o, r) => { r.bottles.forEach(b => { o[b.typeId] = (o[b.typeId] || 0) + b.back; }); return o; }, {}), notes: st.notes.trim(), byName: meName() };
        };
        m.q('#dpeSPrint').onclick = () => printSettle({ number: run ? run.number : '', kind: run ? run.kind : 'acerto', date, driverName: driver.name, routeName: run ? run.routeName : '', settlement: build(), status: 'conferencia' });
        m.q('#dpeSOk').onclick = async e => {
            const btn = e.currentTarget; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gravando…';
            try {
                const set = build();
                let runId = run && run.id, number = run && run.number;
                if (!runId) {
                    number = E.runs.reduce((a, x) => Math.max(a, num(x.number)), 0) + 1;
                    const ref = await db.collection('delivery_runs').add({ number, kind: 'acerto', date, routeId: '', routeName: '', driverId: driver.id, driverName: driver.name, saleIds: rows.map(r => r.s.id), status: 'em_rota', createdAt: ts(), createdBy: uid(), createdByName: meName(), deleted: false, updatedAt: ts() });
                    runId = ref.id;
                }
                for (const r of rows) {
                    const s = r.s;
                    if (r.ok) {
                        const up = { settledAt: ts(), settledBy: uid(), settledRunId: runId, updatedAt: ts() };
                        if (!['delivered', 'completed'].includes(s.status)) { up.status = 'delivered'; up.deliveredAt = ts(); const d0 = toDate(s.dispatchedAt); if (d0) up.deliveryTime = Math.max(0, Math.round((Date.now() - d0.getTime()) / 6e4)); }
                        if (r.rec !== defaultRec(s)) up.settledMethod = r.rec;
                        if (!s.motoboyId && driver.id) { up.motoboyId = driver.id; up.motoboyName = driver.name; }
                        await db.collection('sales').doc(s.id).update(up);
                        if (hasBottles) for (const b of r.bottles) { try { await bottleBack(s, b); } catch (err) { console.warn('cascos', err); toast('warning', 'Acerto gravado, mas os cascos de ' + custName(s) + ' não foram anotados: ' + err.message); } }
                    } else {
                        await db.collection('sales').doc(s.id).update({ status: 'new', motoboyId: '', motoboyName: '', runId: '', deliveryOrder: null, deliveryDate: r.next, deliveryAttempts: FV().increment(1), lastAttempt: { date, driverName: driver.name }, updatedAt: ts() });
                    }
                }
                let feeOk = true;
                if (set.feePaidFromCash) {
                    const cash = await openCash();
                    if (cash && typeof CashService !== 'undefined' && CashService && CashService.withdraw) await CashService.withdraw(cash.id, set.driverFee, `Taxa do entregador ${driver.name} · acerto ${fmtDay(date)}`);
                    else { feeOk = false; set.feePaidFromCash = false; set.cashToReturn = r2(set.cashToReturn + set.driverFee); }
                }
                await db.collection('delivery_runs').doc(runId).update({ status: 'acertado', settlement: set, settledAt: ts(), settledDate: date, settledBy: uid(), updatedAt: ts() });
                // Carga aberta cujas entregas entraram neste acerto (o entregador tinha carga e entregas avulsas): fecha junto
                for (const rid of new Set(rows.map(r => r.s.runId).filter(x => x && x !== runId))) { const o = runOf(rid); if (o && o.status !== 'acertado') { try { await db.collection('delivery_runs').doc(rid).update({ status: 'acertado', mergedInto: runId, settledAt: ts(), settledDate: date, updatedAt: ts() }); } catch (err) { } } }
                if (driver.id) { try { await db.collection('motoboys').doc(driver.id).update({ currentStatus: 'available' }); } catch (err) { } }
                m.close();
                toast(feeOk ? 'success' : 'warning', feeOk ? `Acerto de ${driver.name} feito: ele devolve ${money(set.cashToReturn)} em dinheiro.` : 'Acerto feito, mas o caixa está fechado: a taxa não virou sangria (ele devolve o dinheiro todo).');
                await refresh();
                const done = E.runs.find(x => x.id === runId);
                if (done && confirm('Imprimir o comprovante do acerto?')) printSettle(done);
            } catch (err) { console.error(err); toast('error', 'Não foi possível gravar o acerto: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar acerto'; }
        };
    }
    /** Casco que não voltou vira empréstimo para o cliente (e sai dos vazios); casco a mais é devolução do que ele devia */
    async function bottleBack(s, b) {
        const V = window.DPVasilhames; if (!V) return;
        const diff = int(b.troca) - int(b.back); if (!diff || !b.typeId) return;
        if (diff > 0) {
            if (s.customerId) await V.registerLoan({ customerId: s.customerId, customerName: s.customerName || '', typeId: b.typeId, qty: diff, notes: `Entrega ${saleNo(s)}: casco não voltou` });
            await db.collection('bottle_types').doc(b.typeId).update({ emptyStock: FV().increment(-diff), updatedAt: ts() });
            await db.collection('bottle_moves').add({ bottleTypeId: b.typeId, bottleTypeName: b.name || '', customerId: s.customerId || '', customerName: s.customerName || '', saleId: s.id, saleNumber: s.saleNumber || null, type: 'ajuste', qty: -diff, amount: 0, notes: `Acerto da entrega: ${plural(diff, 'casco não voltou', 'cascos não voltaram')}${s.customerId ? ' (virou empréstimo)' : ''}`, supplierName: '', userId: uid(), userName: meName(), reverted: false, deleted: false, createdAt: ts() });
        } else if (s.customerId) {
            await V.registerReturn({ customerId: s.customerId, customerName: s.customerName || '', typeId: b.typeId, qty: -diff, refund: 0, notes: `Devolvido na entrega ${saleNo(s)}` });
        }
    }
    function printSettle(run) {
        if (!run) return;
        const st = run.settlement || {}, lines = st.lines || [];
        const inner = `<div class="hd"><div><h1>${run.status === 'conferencia' ? 'Conferência do acerto' : 'Acerto do entregador'}${run.number ? ' nº ' + esc(run.number) : ''}</h1><div class="sub">${esc(company())}</div></div><div style="text-align:right"><div class="big">${esc(run.driverName || 'Entregador')}</div><div class="sub">${esc(fmtDay(run.settledDate || run.date || today()))}${run.routeName ? ' · ' + esc(run.routeName) : ''}</div><div class="muted">${new Date().toLocaleString('pt-BR')}${st.byName ? ' · ' + esc(st.byName) : ''}</div></div></div>
<table><thead><tr><th>Venda</th><th>Cliente</th><th>Situação</th><th class="n">Valor</th></tr></thead><tbody>${lines.map(l => `<tr><td>${esc('#V-' + String(l.saleNumber || 0).padStart(4, '0'))}</td><td>${esc(l.customerName)}</td><td>${l.ok ? esc(REC[l.rec] || 'Entregue') : '<b>Não entregue</b>'}</td><td class="n">${l.amount ? money(l.amount) : '—'}</td></tr>`).join('')}</tbody></table>
<div class="tot"><span>Entregues: <b>${num(st.delivered)} de ${num(st.total) || lines.length}</b></span><span>Dinheiro recebido: <b>${money(st.cash)}</b></span>${num(st.changeTaken) ? `<span>Troco levado: <b>${money(st.changeTaken)}</b></span>` : ''}<span>Pix: <b>${money(st.pix)}</b></span><span>Cartão: <b>${money(st.card)}</b></span>${num(st.other) ? `<span>Outras: <b>${money(st.other)}</b></span>` : ''}${num(st.fiado) ? `<span>Fiado: <b>${money(st.fiado)}</b></span>` : ''}</div>
<div class="tot"><span>Taxa do entregador: <b>${money(st.driverFee)}</b>${st.feePaidFromCash ? ' (paga com sangria)' : ''}</span></div>
<div class="sec">Devolve em dinheiro</div><div style="font-size:24px;font-weight:800">${money(st.cashToReturn)}</div>
${(st.notDelivered || []).length ? `<div class="sec">Não entregues</div><div>${st.notDelivered.map(n => `${esc('#V-' + String(n.saleNumber || 0).padStart(4, '0'))} ${esc(n.customerName)} → ${esc(fmtDay(n.next))}`).join('<br>')}</div>` : ''}
${st.notes ? `<div class="sec">Observações</div><div>${esc(st.notes)}</div>` : ''}
<div class="sig"><div><span></span>Conferido por</div><div><span></span>${esc(run.driverName || 'Entregador')}</div></div>`;
        printWin(null, 'Acerto ' + (run.driverName || ''), printShell('Acerto ' + (run.driverName || ''), inner));
    }

    /* =================== Só do Mensal (a demo mostra com o selo) =================== */

    /* =================== Início =================== */
    window.DPEntregas = { load: loadCfg, cfg: () => D, data: () => E, zoneFor, zoneInText, routeOf, routeForNb, routeForCustomer, nextRouteDay, saleDay, collectInfo, payLine, payText: payLine, receiptHtml, driverFee, customerForm, customerData, openRoutes, openSettle, romaneioHtml, today, fmtDay };
    function boot() {
        wrapCreate();
        try { setupPDV(); } catch (e) { console.warn('entregas pdv', e); }
        try { setupSettings(); } catch (e) { console.warn('entregas configurações', e); }
        try { setupPedidos(); } catch (e) { console.warn('entregas pedidos', e); }
        try { setupMotoboys(); } catch (e) { console.warn('entregas motoboys', e); }
        try { setupEntregas(); } catch (e) { console.warn('entregas tela', e); }
    }
    wrapCreate();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
