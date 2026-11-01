/* DistribuiPro 35.41 · Crediário (venda parcelada no carnê) + controle de contas a receber e a pagar.
   Complemento compartilhado: o MESMO arquivo em todas as versões (demo, Mensal, Firebase, MySQL e Offline).
   - PDV: botão "Crediário" (entrada, nº de parcelas, vencimentos e juros). A parte a prazo não entra no caixa (igual
     ao fiado) e cada parcela vira uma conta a receber. Cupom com as parcelas, carnê (A4 ou 80 mm) e o botão
     "Receber crediário" para o caixa receber parcelas no balcão.
   - Contas a receber: painel do crediário (carteira, vencidas, próximos 7 dias, recebido no mês), carnês, clientes e
     vencidas; recebimento com multa/juros/desconto, pagamento parcial, entrada no caixa aberto, comprovante e
     cobrança pelo WhatsApp. As parcelas de uma venda cancelada são canceladas sozinhas.
   - Contas a pagar: pagamento com juros/multa/desconto, saída do caixa (sangria), parcelamento e repetição
     automática (mensal, quinzenal, semanal).
   - Previsão dos próximos 30 dias (a receber × a pagar) nas duas telas de contas.
   - Clientes: saldo do crediário no detalhe do cliente; o limite de crédito não some mais ao editar o cadastro.
   - Listas de contas (receber, pagar, fluxo de caixa, relatórios) sem o limite de 500 registros.
   Só grava em coleções que já existem (sales, financial_entries, cash_movements, settings): não muda regras do banco. */
(function () {
    'use strict';
    if (window.__dpCrediario) return;
    window.__dpCrediario = '35.41';
    if (typeof db === 'undefined' || !db || typeof db.collection !== 'function') return;

    const PAGE = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
    const IS_DEMO = window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL
    const GENERAL = IS_DEMO ? 'demo_general' : 'general';
    const DAY = 86400000;
    const CAT = 'Crediário';

    /* ---------- utilidades ---------- */
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const pad = (n, l = 4) => String(n ?? '').padStart(l, '0');
    const money = v => { try { if (typeof Utils !== 'undefined' && Utils && typeof Utils.currency === 'function') return Utils.currency(Number(v) || 0); } catch (e) { } return (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); };
    const num = s => {
        if (typeof s === 'number') return isFinite(s) ? s : 0;
        let t = String(s ?? '').trim().replace(/[^\d,.-]/g, '');
        if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.');
        else if (/^\d{1,3}(\.\d{3})+$/.test(t)) t = t.replace(/\./g, '');
        const v = parseFloat(t); return isFinite(v) ? v : 0;
    };
    const fmtIn = v => (Number(v) || 0).toFixed(2).replace('.', ',');
    const pctTxt = v => (Number(v) || 0).toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%';
    const say = (k, m) => { try { if (typeof Toast !== 'undefined' && Toast && typeof Toast[k] === 'function') return Toast[k](m); } catch (e) { } if (k === 'error' || k === 'warning') alert(m); else console.log(m); };
    const sum = (a, f) => r2(a.reduce((s, x) => s + (Number(f ? f(x) : x) || 0), 0));

    /* ---------- datas (Firestore, MySQL, demo e offline guardam datas de jeitos diferentes) ---------- */
    const toDate = v => {
        if (!v) return null;
        if (v instanceof Date) return isNaN(v) ? null : v;
        if (typeof v.toDate === 'function') { try { const d = v.toDate(); return d && !isNaN(d) ? d : null; } catch (e) { return null; } }
        if (typeof v === 'object') {
            if (v.seconds != null) return new Date(Number(v.seconds) * 1000);
            if (v._seconds != null) return new Date(Number(v._seconds) * 1000);
            if (v.__ts != null) return new Date(Number(v.__ts));
            if (v.__dpTimestamp) return new Date(v.__dpTimestamp);
            if (v.value) { const d = new Date(v.value); return isNaN(d) ? null : d; }
            return null;
        }
        const d = new Date(v); return isNaN(d) ? null : d;
    };
    const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1, 2)}-${pad(d.getDate(), 2)}`;
    const fromYmd = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || '')); return m ? new Date(+m[1], +m[2] - 1, +m[3], 12, 0, 0) : null; };
    const br = d => d ? d.toLocaleDateString('pt-BR') : '—';
    const brShort = d => d ? d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—';
    const daysLate = (due, ref) => Math.round((sod(ref || new Date()) - sod(due)) / DAY);
    const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0);
    const addMonths = (d, n) => { const y = d.getFullYear(), m = d.getMonth() + n, last = new Date(y, m + 1, 0).getDate(); return new Date(y, m, Math.min(d.getDate(), last), 12, 0, 0); };
    const step = (d, k, iv) => iv === 'semanal' ? addDays(d, 7 * k) : iv === 'quinzenal' ? addDays(d, 15 * k) : addMonths(d, k);
    const dueOf = e => toDate(e && e.dueDate);
    const paidOf = e => toDate(e && (e.paidAt || e.updatedAt));

    /* ---------- banco (mesma API em todas as versões) ---------- */
    const FV = () => window.DPFieldValue || (window.firebase && firebase.firestore && firebase.firestore.FieldValue) || null;
    const now = () => { const f = FV(); return f && typeof f.serverTimestamp === 'function' ? f.serverTimestamp() : new Date(); };
    const TS = d => { const T = window.DPTimestamp || (window.firebase && firebase.firestore && firebase.firestore.Timestamp); return T && typeof T.fromDate === 'function' ? T.fromDate(d) : d; };
    const uid = () => { try { return (auth && auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const me = () => { try { return (typeof currentUser !== 'undefined' && currentUser) || null; } catch (e) { return null; } };
    const userName = () => { const u = me(); try { return (u && (u.name || u.displayName)) || (auth.currentUser && auth.currentUser.displayName) || 'Operador'; } catch (e) { return 'Operador'; } };
    const canManage = () => { const r = (me() || {}).role; return !r || ['admin', 'manager', 'financial'].includes(r); };
    async function list(col, where) {
        let q = db.collection(col);
        (where || []).forEach(w => { q = q.where(w[0], w[1], w[2]); });
        const s = await q.get();
        return s.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    async function getDoc(col, id) { const s = await db.collection(col).doc(id).get(); return s.exists ? { id: s.id, ...s.data() } : null; }
    const stamp = () => ({ deleted: false, createdAt: now(), updatedAt: now(), createdBy: uid() || 'system' });

    /* ---------- configuração do crediário (settings/crediario) ---------- */
    const DEF = { ativo: true, maxParcelas: 12, intervalo: 'mensal', diasPrimeira: 30, jurosParcelamento: 0, multa: 2, jurosMora: 1, carencia: 0, entradaMinima: 0, exigirLimite: false, bloquearAtraso: false, chavePix: '', mensagemCarne: 'Pague em dia e evite multa e juros. Guarde seus comprovantes.' };
    let CFG = { ...DEF }, cfgAt = 0;
    async function cfg(force) {
        if (!force && Date.now() - cfgAt < 60000) return CFG;
        try { const s = await db.collection('settings').doc('crediario').get(); CFG = { ...DEF, ...(s.exists ? (s.data() || {}) : {}) }; }
        catch (e) { CFG = { ...DEF, ...CFG }; }
        cfgAt = Date.now(); return CFG;
    }
    let CO = null;
    async function company() {
        if (CO) return CO;
        let d = {};
        try { const s = await db.collection('settings').doc(GENERAL).get(); if (s.exists) d = s.data() || {}; } catch (e) { }
        if (IS_DEMO) { try { d = { ...d, ...(JSON.parse(sessionStorage.getItem('erp_demo_settings_v139') || '{}') || {}) }; } catch (e) { } }
        let brand = {};
        try { if (typeof BrandingManager !== 'undefined' && BrandingManager && typeof BrandingManager.getBrand === 'function') brand = BrandingManager.getBrand() || {}; } catch (e) { }
        const name = IS_DEMO ? (brand.companyName || d.nomeFantasia || d.razaoSocial) : (d.nomeFantasia || brand.companyName || d.razaoSocial);
        const rua = [d.logradouro, d.numero].filter(Boolean).join(', '), cid = [d.cidade, d.uf].filter(Boolean).join(' - ');
        let logo = IS_DEMO ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || '');
        if (logo && !/^data:/i.test(logo)) { try { logo = new URL(logo, location.href).href; } catch (e) { logo = ''; } } // a janela de impressão não tem endereço base
        CO = { name: name || 'Sua empresa', razao: d.razaoSocial || '', cnpj: d.cnpj || '', tel: d.telefone || d.whatsapp || '', end: [rua, d.bairro, cid].filter(Boolean).join(' · '), logo };
        return CO;
    }

    /* ---------- regras ---------- */
    const isCred = e => !!(e && (e.crediario || e.category === CAT));
    const isOpen = e => e && e.type === 'income' && e.status === 'pending' && !e.deleted;
    const parcelaTxt = e => { const c = e.crediario || {}, i = e.installment || {}; const n = c.parcela || i.number, t = c.parcelas || i.total; return n && t ? `${n}/${t}` : ''; };
    const carneTxt = e => (e.crediario && e.crediario.carne) || '';
    // As contas do fiado do PDV guardam só o código do cliente: nome e telefone vêm do cadastro.
    const CMAP = new Map(); let cmapAt = 0;
    async function ensureCustomers(force) {
        if (!force && cmapAt && Date.now() - cmapAt < 60000) return CMAP;
        try { (await list('customers')).forEach(c => CMAP.set(c.id, c)); } catch (e) { }
        try { if (typeof allPdvCustomers !== 'undefined' && Array.isArray(allPdvCustomers)) allPdvCustomers.forEach(c => { if (!CMAP.has(c.id)) CMAP.set(c.id, c); }); } catch (e) { }
        cmapAt = Date.now(); return CMAP;
    }
    const custOf = e => (e && e.customerId && CMAP.get(e.customerId)) || null;
    const who = e => e.customerName || e.debtorName || (custOf(e) && (custOf(e).name || custOf(e).nome)) || 'Cliente';
    const phoneOf = e => e.debtorPhone || e.customerPhone || (custOf(e) && (custOf(e).whatsapp || custOf(e).phone)) || '';
    const byDue = (a, b) => ((dueOf(a) || 0) - (dueOf(b) || 0)) || ((a.crediario?.parcela || 0) - (b.crediario?.parcela || 0));
    // Parcelas: Tabela Price quando há juros; sem juros, os centavos que sobram vão para a última parcela.
    function makePlan(o) {
        const total = r2(o.total), entrada = r2(Math.min(Math.max(Number(o.entrada) || 0, 0), total));
        const n = Math.max(1, Math.floor(Number(o.n) || 1)), principal = r2(total - entrada), i = Math.max(0, Number(o.juros) || 0) / 100;
        let parcela, totalParcelado;
        if (i > 0) { parcela = r2(principal * i / (1 - Math.pow(1 + i, -n))); totalParcelado = r2(parcela * n); }
        else { parcela = Math.floor(principal / n * 100) / 100; totalParcelado = principal; }
        const iv = o.intervalo || 'mensal', first = o.first;
        const parcelas = Array.from({ length: n }, (_, k) => ({ n: k + 1, due: step(first, k, iv), valor: k < n - 1 ? parcela : r2(totalParcelado - parcela * (n - 1)) }));
        return { total, entrada, entradaMetodo: o.entradaMetodo || 'dinheiro', entradaRecebido: r2(o.entradaRecebido || 0), n, juros: Number(o.juros) || 0, intervalo: iv, first, principal, totalParcelado, jurosValor: r2(totalParcelado - principal), parcelas, customerId: o.customerId || null };
    }
    // Multa (uma vez) e juros de mora pro rata, só no crediário e depois da carência.
    function charges(e, ref) {
        const due = dueOf(e), base = Number(e.amount) || 0, at = ref || new Date();
        const out = { late: 0, multa: 0, juros: 0 };
        if (!due) return out;
        out.late = Math.max(0, daysLate(due, at));
        if (!isCred(e) || out.late <= (Number(CFG.carencia) || 0)) return out;
        out.multa = e.lateFeeApplied ? 0 : r2(base * (Number(CFG.multa) || 0) / 100);
        const from = toDate(e.interestFrom) || due;
        out.juros = r2(base * (Number(CFG.jurosMora) || 0) / 100 / 30 * Math.max(0, daysLate(from, at)));
        return out;
    }
    const methodName = m => ({ dinheiro: 'Dinheiro', pix: 'PIX', debito: 'Cartão de débito', credito: 'Cartão de crédito', boleto: 'Boleto', transferencia: 'Transferência' }[m] || m || '—');
    const phoneDigits = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };
    const openWa = (phone, text) => { const d = phoneDigits(phone); window.open(`https://wa.me/${d}?text=${encodeURIComponent(text)}`, '_blank', 'noopener'); };
    async function openCash() {
        if (PAGE === 'pdv.html') { try { if (typeof activeCashRegister !== 'undefined' && activeCashRegister && activeCashRegister.id) return activeCashRegister; } catch (e) { } }
        try {
            const docs = (await list('cash_registers', [['status', '==', 'open']])).filter(c => !c.deleted);
            return docs.find(c => c.operatorId === uid()) || docs[0] || null;
        } catch (e) { return null; }
    }

    /* ---------- visual ---------- */
    const css = document.createElement('style');
    css.id = 'dpcCss';
    css.textContent = `
.dpc-ov{position:fixed;inset:0;z-index:10050;background:rgba(15,23,42,.62);display:flex;align-items:flex-start;justify-content:center;padding:24px 14px;overflow-y:auto}
.dpc-dlg{background:var(--bg-card,#fff);color:var(--text-primary,#0f172a);border-radius:16px;width:100%;max-width:560px;margin:auto;box-shadow:0 24px 60px rgba(0,0,0,.35);border:1px solid var(--border-color,#e2e8f0)}
.dpc-dlg.wide{max-width:860px}
.dpc-h{display:flex;align-items:flex-start;gap:12px;padding:18px 20px 12px;border-bottom:1px solid var(--border-color,#e2e8f0)}
.dpc-h h3{margin:0;font-size:16px;color:var(--text-heading,var(--text-primary,#0f172a))}.dpc-h h3 i{color:var(--accent,#6366f1);margin-right:6px}
.dpc-h p{margin:3px 0 0;font-size:12px;color:var(--text-muted,#64748b)}
.dpc-xb{margin-left:auto;border:none;background:transparent;color:var(--text-muted,#64748b);font-size:24px;line-height:1;cursor:pointer;padding:0 4px}
.dpc-b{padding:14px 20px}.dpc-f{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap;padding:12px 20px 18px;border-top:1px solid var(--border-color,#e2e8f0)}
.dpc-g{display:grid;grid-template-columns:1fr 1fr;gap:10px}.dpc-g3{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.dpc-l{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--text-secondary,#475569)}
.dpc-l small{font-weight:500;color:var(--text-muted,#64748b)}
.dpc-in{width:100%;box-sizing:border-box;height:38px;border:1px solid var(--border-color,#cbd5e1);background:var(--bg-secondary,#f8fafc);color:var(--text-primary,#0f172a);border-radius:9px;padding:0 10px;font-size:14px;font-family:inherit}
.dpc-in:focus{outline:2px solid var(--accent,#6366f1);outline-offset:0}textarea.dpc-in{height:auto;padding:8px 10px}
.dpc-chk{display:flex;align-items:flex-start;gap:8px;font-size:12.5px;color:var(--text-secondary,#475569);cursor:pointer;margin-top:10px}.dpc-chk input{margin-top:2px}
.dpc-sum{display:flex;flex-wrap:wrap;gap:6px 14px;margin-top:12px;padding:10px 12px;border-radius:10px;background:var(--bg-secondary,#f1f5f9);font-size:12.5px;color:var(--text-secondary,#475569)}
.dpc-sum b{color:var(--text-primary,#0f172a)}.dpc-sum .big{font-size:16px;color:var(--success,#10b981)}
.dpc-t{width:100%;border-collapse:collapse;font-size:12.5px}.dpc-t th{text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted,#64748b);padding:7px 8px;border-bottom:1px solid var(--border-color,#e2e8f0);white-space:nowrap}
.dpc-t td{padding:8px;border-bottom:1px solid var(--border-color,#e2e8f0);vertical-align:middle}.dpc-t td.r,.dpc-t th.r{text-align:right;white-space:nowrap}
.dpc-t tr.late td{background:rgba(239,68,68,.06)}.dpc-t tr.done td{opacity:.65}
.dpc-scroll{max-height:300px;overflow:auto;border:1px solid var(--border-color,#e2e8f0);border-radius:10px;margin-top:12px}
.dpc-warn{margin-top:10px;padding:9px 12px;border-radius:10px;font-size:12.5px;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.35);color:var(--text-primary,#0f172a)}
.dpc-warn.red{background:rgba(239,68,68,.1);border-color:rgba(239,68,68,.35)}.dpc-warn.ok{background:rgba(16,185,129,.1);border-color:rgba(16,185,129,.35)}
.dpc-chips{display:flex;flex-wrap:wrap;gap:6px;margin-top:2px}.dpc-chip{font-size:11.5px;padding:3px 9px;border-radius:20px;background:var(--bg-secondary,#f1f5f9);color:var(--text-secondary,#475569);border:1px solid var(--border-color,#e2e8f0)}
.dpc-chip.red{color:#dc2626;border-color:rgba(239,68,68,.4);background:rgba(239,68,68,.08)}.dpc-chip.green{color:#059669;border-color:rgba(16,185,129,.4);background:rgba(16,185,129,.08)}
.dpc-bt{display:inline-flex;align-items:center;gap:6px;border:1px solid var(--border-color,#cbd5e1);background:var(--bg-secondary,#f8fafc);color:var(--text-primary,#0f172a);border-radius:9px;padding:7px 12px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:inherit;white-space:nowrap}
.dpc-bt:hover{border-color:var(--accent,#6366f1)}.dpc-bt.pri{background:var(--accent,#6366f1);border-color:var(--accent,#6366f1);color:#fff}.dpc-bt.ok{background:var(--success,#10b981);border-color:var(--success,#10b981);color:#fff}
.dpc-bt.sm{padding:4px 9px;font-size:11.5px}.dpc-bt.wa{color:#16a34a}.dpc-bt[disabled]{opacity:.55;cursor:not-allowed}
.dpc-panel{background:var(--bg-card,#fff);border:1px solid var(--border-color,#e2e8f0);border-radius:14px;margin:0 0 18px;overflow:hidden}
.dpc-ph{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid var(--border-color,#e2e8f0)}
.dpc-ph h3{margin:0;font-size:15px;color:var(--text-heading,var(--text-primary,#0f172a))}.dpc-ph h3 i{color:var(--accent,#6366f1);margin-right:6px}.dpc-ph p{margin:2px 0 0;font-size:12px;color:var(--text-muted,#64748b)}
.dpc-pa{margin-left:auto;display:flex;gap:8px;flex-wrap:wrap}
.dpc-cards{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 18px}
.dpc-card{border:1px solid var(--border-color,#e2e8f0);border-radius:12px;padding:10px 12px;background:var(--bg-secondary,#f8fafc)}
.dpc-card b{display:block;font-size:17px;color:var(--text-primary,#0f172a)}.dpc-card span{font-size:11.5px;color:var(--text-muted,#64748b)}.dpc-card.red b{color:#ef4444}.dpc-card.green b{color:#10b981}
.dpc-tabs{display:flex;gap:4px;padding:0 18px;border-bottom:1px solid var(--border-color,#e2e8f0);flex-wrap:wrap;align-items:center}
.dpc-tabs button{border:none;background:transparent;padding:10px 12px;font-size:13px;font-weight:600;color:var(--text-muted,#64748b);cursor:pointer;border-bottom:2px solid transparent;font-family:inherit}
.dpc-tabs button.on{color:var(--accent,#6366f1);border-bottom-color:var(--accent,#6366f1)}
.dpc-tabs input{margin-left:auto;height:32px;max-width:230px}
.dpc-pt{padding:4px 10px 12px;overflow-x:auto}
.dpc-empty{padding:22px;text-align:center;color:var(--text-muted,#64748b);font-size:13px}
.dpc-bar{height:6px;border-radius:6px;background:var(--border-color,#e2e8f0);overflow:hidden;min-width:70px}.dpc-bar i{display:block;height:100%;background:var(--success,#10b981)}
.dpc-st{font-size:11px;font-weight:700;padding:2px 8px;border-radius:20px;white-space:nowrap}.dpc-st.late{color:#dc2626;background:rgba(239,68,68,.1)}.dpc-st.ok{color:#059669;background:rgba(16,185,129,.1)}.dpc-st.wait{color:#b45309;background:rgba(245,158,11,.12)}
.dpc-hbtn{flex:0 0 auto;flex-shrink:0;margin-left:8px;height:36px;border:1px solid var(--accent,#6366f1);background:rgba(99,102,241,.1);color:var(--accent,#6366f1);border-radius:10px;padding:0 12px;font-weight:700;font-size:12.5px;cursor:pointer;display:inline-flex;align-items:center;gap:6px;white-space:nowrap;font-family:inherit}
.dpc-hbtn:hover{background:var(--accent,#6366f1);color:#fff}
.dpc-ok{text-align:center;padding:22px 20px 8px}.dpc-ok i.big{font-size:38px;color:var(--success,#10b981)}.dpc-ok h4{margin:10px 0 4px;font-size:17px}.dpc-ok p{margin:0;color:var(--text-muted,#64748b);font-size:13px}
.dpc-mini{font-size:11.5px;color:var(--text-muted,#64748b)}
.dpc-prev td.n{font-weight:700}.dpc-pos{color:#059669;font-weight:700}.dpc-neg{color:#dc2626;font-weight:700}
#dpcCliBox{margin-top:16px;padding-top:14px;border-top:1px solid var(--border-color,#e2e8f0)}
@media (max-width:1600px){.dpc-hbtn{padding:0 10px}.dpc-hbtn span{display:none}}
@media (max-width:760px){.dpc-g,.dpc-g3{grid-template-columns:1fr}.dpc-cards{grid-template-columns:1fr 1fr}.dpc-tabs input{max-width:none;width:100%;margin:6px 0}}
`;
    document.head.appendChild(css);

    function closeDlg() { const o = document.getElementById('dpcOv'); if (o) { if (o._off) o._off(); o.remove(); } }
    function dialog(html, opts = {}) {
        closeDlg();
        const ov = document.createElement('div'); ov.id = 'dpcOv'; ov.className = 'dpc-ov';
        ov.innerHTML = `<div class="dpc-dlg${opts.wide ? ' wide' : ''}" role="dialog" aria-modal="true">${html}</div>`;
        ov.addEventListener('mousedown', e => { if (e.target === ov && !opts.sticky) closeDlg(); });
        ov.addEventListener('keydown', e => e.stopPropagation()); // atalhos do PDV (F9, código de barras) não disparam aqui dentro
        ov.addEventListener('keyup', e => e.stopPropagation());
        const onKey = e => { if (e.key === 'Escape' && document.getElementById('dpcOv') === ov) { e.preventDefault(); closeDlg(); } };
        document.addEventListener('keydown', onKey, true);
        ov._off = () => document.removeEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target.closest('[data-x]')) closeDlg(); });
        document.body.appendChild(ov);
        return ov;
    }
    const head = (icon, title, sub) => `<div class="dpc-h"><div><h3><i class="fas ${icon}"></i>${esc(title)}</h3>${sub ? `<p>${sub}</p>` : ''}</div><button type="button" class="dpc-xb" data-x aria-label="Fechar">×</button></div>`;
    const statusTag = e => {
        if (e.status === 'received') return `<span class="dpc-st ok">Paga${paidOf(e) ? ' ' + brShort(paidOf(e)) : ''}</span>`;
        if (e.status === 'cancelled') return '<span class="dpc-st wait">Cancelada</span>';
        const d = dueOf(e), late = d ? daysLate(d) : 0;
        if (late > 0) return `<span class="dpc-st late">${late} dia${late > 1 ? 's' : ''} de atraso</span>`;
        if (late === 0) return '<span class="dpc-st wait">Vence hoje</span>';
        return '<span class="dpc-st wait">Em aberto</span>';
    };

    /* ---------- impressão (cupom 80 mm, carnê A4 e extrato) ---------- */
    function printWin(title, body, cssText, a4) {
        const w = window.open('', '_blank', a4 ? 'width=900,height=900' : 'width=420,height=760');
        if (!w) { say('warning', 'Libere os pop-ups deste site no navegador para imprimir.'); return null; }
        w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${esc(title)}</title><style>${cssText}
@media print{.noprint{display:none!important}}</style></head><body>${body}
<div class="noprint" style="position:fixed;top:10px;right:10px;display:flex;gap:6px;font-family:Arial,sans-serif"><button onclick="window.print()" style="background:#10b981;color:#fff;border:none;padding:9px 16px;border-radius:8px;font-weight:700;cursor:pointer">Imprimir</button><button onclick="window.close()" style="background:#e2e8f0;border:none;padding:9px 14px;border-radius:8px;cursor:pointer">Fechar</button></div>
<script>window.onload=function(){setTimeout(function(){window.print()},300)}<\/script></body></html>`);
        w.document.close();
        return w;
    }
    const CSS80 = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:'Courier New',Courier,monospace;font-size:12.5px;width:302px;margin:0 auto;padding:8px 4px;color:#000;background:#fff;font-weight:700}
.c{text-align:center}.r{text-align:right}.sub{font-size:11px}.ln{border-top:1px dashed #000;margin:6px 0}.dl{border-top:2px solid #000;margin:6px 0}
table{width:100%;border-collapse:collapse}td{vertical-align:top;padding:1px 0}.big{font-size:15px}.cut{border-top:1px dashed #000;margin:10px 0 8px;text-align:center;font-size:10px}
img.logo{display:block;max-width:120px;max-height:56px;margin:0 auto 4px}@page{margin:4mm;size:80mm auto}`;
    const coHead = co => `<div class="c">${co.logo ? `<img class="logo" src="${esc(co.logo)}" alt="">` : ''}<div class="big">${esc(co.name)}</div>${co.razao && co.razao !== co.name ? `<div class="sub">${esc(co.razao)}</div>` : ''}${co.cnpj ? `<div class="sub">CNPJ: ${esc(co.cnpj)}</div>` : ''}${co.tel ? `<div class="sub">Tel: ${esc(co.tel)}</div>` : ''}${co.end ? `<div class="sub">${esc(co.end)}</div>` : ''}</div>`;

    async function carneData(saleId) {
        const [sale, entries] = await Promise.all([getDoc('sales', saleId).catch(() => null), list('financial_entries', [['referenceId', '==', saleId]]), ensureCustomers()]);
        const parc = entries.filter(e => isCred(e) && !e.deleted && e.type === 'income').sort(byDue);
        return { sale, parc };
    }
    async function printCarne(saleId, format) {
        await cfg(); const co = await company();
        const { sale, parc } = await carneData(saleId);
        if (!parc.length) { say('warning', 'Este carnê não tem parcelas.'); return; }
        const f = parc[0], c = f.crediario || {}, carne = c.carne || ('V-' + pad(sale && sale.saleNumber));
        const cli = who(f), total = parc[0].crediario?.parcelas || parc.length;
        const multaTxt = (Number(CFG.multa) || 0) > 0 || (Number(CFG.jurosMora) || 0) > 0 ? `Após o vencimento: multa de ${pctTxt(CFG.multa)} e juros de ${pctTxt(CFG.jurosMora)} ao mês.` : '';
        const pix = CFG.chavePix ? `PIX: ${CFG.chavePix}` : '';
        // Uma linha por parcela em aberto (a parte já paga aparece como paga). Saldos de pagamento parcial entram juntos.
        if (format === '80') {
            const rows = parc.map(e => `<div class="cut">✂ - - - - - - - - - - - - - - - - - - -</div>
<table><tr><td>Parcela ${esc(parcelaTxt(e) || '')}</td><td class="r">${esc(carne)}</td></tr>
<tr><td>Vencimento</td><td class="r big">${esc(br(dueOf(e)))}</td></tr>
<tr><td>Valor</td><td class="r big">${esc(money(e.amount))}</td></tr>
${e.status === 'received' ? `<tr><td colspan="2" class="c">*** PAGA EM ${esc(br(paidOf(e)))} ***</td></tr>` : `<tr><td colspan="2" class="sub" style="padding-top:8px">Recebido em ___/___/____</td></tr><tr><td colspan="2" class="sub" style="padding-top:8px">Ass.: ____________________________</td></tr>`}</table>`).join('');
            printWin(`Carnê ${carne}`, `${coHead(co)}<div class="dl"></div><div class="c big">CARNÊ ${esc(carne)}</div><div class="c sub">Cliente: ${esc(cli)}</div>
<div class="c sub">${total} parcela${total > 1 ? 's' : ''}${c.juros ? ' · juros ' + esc(pctTxt(c.juros)) + ' a.m.' : ''}</div>${rows}<div class="ln"></div>
<div class="c sub">${esc(multaTxt)}</div>${pix ? `<div class="c sub">${esc(pix)}</div>` : ''}<div class="c sub" style="margin-top:4px">${esc(CFG.mensagemCarne || '')}</div><div style="height:16px"></div>`, CSS80, false);
            return;
        }
        const coupons = parc.map(e => {
            const paid = e.status === 'received';
            const stub = `<div class="stub"><div class="t">CANHOTO DA LOJA</div><div><span>Carnê</span><b>${esc(carne)}</b></div><div><span>Parcela</span><b>${esc(parcelaTxt(e))}</b></div><div><span>Vencimento</span><b>${esc(br(dueOf(e)))}</b></div><div><span>Valor</span><b>${esc(money(e.amount))}</b></div><div class="cl">${esc(cli)}</div><div class="sig">Recebido em ___/___/____</div></div>`;
            const main = `<div class="main"><div class="top"><div class="co"><b>${esc(co.name)}</b>${co.cnpj ? `<span>CNPJ ${esc(co.cnpj)}</span>` : ''}${co.tel ? `<span>${esc(co.tel)}</span>` : ''}</div><div class="nr">CARNÊ ${esc(carne)}<small>Parcela ${esc(parcelaTxt(e))}</small></div></div>
<div class="row"><div><span>Cliente</span><b>${esc(cli)}</b></div><div><span>Vencimento</span><b class="xl">${esc(br(dueOf(e)))}</b></div><div><span>Valor da parcela</span><b class="xl">${esc(money(e.amount))}</b></div></div>
<div class="obs">${esc(multaTxt)}${pix ? ' · ' + esc(pix) : ''}</div>
${paid ? `<div class="paid">PAGA EM ${esc(br(paidOf(e)))}</div>` : '<div class="sig2"><span>Recebido em ___/___/____</span><span>Assinatura ______________________</span></div>'}</div>`;
            return `<div class="cp${paid ? ' pd' : ''}">${stub}${main}</div>`;
        }).join('');
        const A4 = `*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:8mm}
.hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #111;padding-bottom:6px;margin-bottom:8px}.hd h1{font-size:18px}.hd p{font-size:11px;color:#444}
.cp{display:grid;grid-template-columns:30% 70%;border:1px solid #333;border-radius:6px;margin-bottom:5mm;height:60mm;page-break-inside:avoid;overflow:hidden}
.cp.pd{opacity:.55}.stub{border-right:2px dashed #555;padding:8px;font-size:10.5px;display:flex;flex-direction:column;gap:4px}
.stub .t{font-size:9px;font-weight:700;letter-spacing:.5px;color:#555}.stub div span{display:block;font-size:9px;color:#666}.stub b{font-size:12px}
.stub .cl{margin-top:auto;font-weight:700;font-size:10.5px}.stub .sig{font-size:9.5px;color:#444}
.main{padding:8px 12px;display:flex;flex-direction:column;gap:6px;font-size:11px}.top{display:flex;justify-content:space-between;gap:10px}
.co{display:flex;flex-direction:column}.co b{font-size:13px}.co span{font-size:10px;color:#444}.nr{text-align:right;font-weight:800;font-size:13px}.nr small{display:block;font-size:11px;font-weight:600}
.row{display:grid;grid-template-columns:1.3fr 1fr 1fr;gap:8px;border-top:1px solid #ccc;border-bottom:1px solid #ccc;padding:6px 0}
.row span{display:block;font-size:9.5px;color:#666;text-transform:uppercase}.row b{font-size:12px}.row b.xl{font-size:16px}
.obs{font-size:9.5px;color:#444}.sig2{margin-top:auto;display:flex;justify-content:space-between;font-size:10px;color:#333}.paid{margin-top:auto;font-weight:800;color:#059669;font-size:13px}
@page{size:A4;margin:8mm}@media print{body{padding:0}}`;
        printWin(`Carnê ${carne}`, `<div class="hd"><div><h1>Carnê ${esc(carne)} · ${esc(cli)}</h1><p>${total} parcela${total > 1 ? 's' : ''}${c.juros ? ' · juros de ' + esc(pctTxt(c.juros)) + ' ao mês' : ''} · ${esc(CFG.mensagemCarne || '')}</p></div><p>${esc(co.name)}</p></div>${coupons}`, A4, true);
    }
    async function printStatement(key, label) {
        await Promise.all([cfg(), ensureCustomers()]); const co = await company();
        const all = await list('financial_entries', [['type', '==', 'income']]);
        const open = all.filter(e => isOpen(e) && groupKey(e) === key).sort(byDue);
        const rows = open.map(e => { const c = charges(e); return `<tr><td>${esc(e.description || '')}<div class="sub">venc. ${esc(br(dueOf(e)))}${c.late > 0 ? ` · ${c.late}d atraso` : ''}</div></td><td class="r">${esc(money(r2(Number(e.amount) + c.multa + c.juros)))}</td></tr>`; }).join('');
        const tot = sum(open, e => { const c = charges(e); return Number(e.amount) + c.multa + c.juros; });
        printWin('Extrato', `${coHead(co)}<div class="dl"></div><div class="c big">EXTRATO DO CLIENTE</div><div class="c sub">${esc(label)}</div><div class="c sub">${esc(new Date().toLocaleString('pt-BR'))}</div><div class="ln"></div>
<table>${rows || '<tr><td>Nenhuma conta em aberto.</td></tr>'}</table><div class="dl"></div><table><tr><td class="big">TOTAL EM ABERTO</td><td class="r big">${esc(money(tot))}</td></tr></table>
<div class="sub" style="margin-top:6px">Valores com multa e juros calculados até hoje.</div>${CFG.chavePix ? `<div class="sub">PIX: ${esc(CFG.chavePix)}</div>` : ''}<div style="height:16px"></div>`, CSS80, false);
    }
    function printReceiptPay(r) {
        company().then(co => {
            const rows = r.lines.map(l => `<tr><td>${esc(l.desc)}<div class="sub">venc. ${esc(br(l.due))}${l.multa + l.juros > 0 ? ` · encargos ${esc(money(l.multa + l.juros))}` : ''}${l.desc2 ? ' · ' + esc(l.desc2) : ''}</div></td><td class="r">${esc(money(l.paid))}</td></tr>`).join('');
            printWin('Comprovante', `${coHead(co)}<div class="dl"></div><div class="c big">COMPROVANTE DE RECEBIMENTO</div><div class="c sub">${esc(r.id)} · ${esc(r.at.toLocaleString('pt-BR'))}</div><div class="ln"></div>
<div class="sub">Cliente: ${esc(r.cliente)}</div><div class="ln"></div><table>${rows}</table><div class="dl"></div>
<table><tr><td class="big">TOTAL RECEBIDO</td><td class="r big">${esc(money(r.total))}</td></tr>${r.discount > 0 ? `<tr><td>Desconto</td><td class="r">${esc(money(r.discount))}</td></tr>` : ''}<tr><td>Forma</td><td class="r">${esc(methodName(r.method))}</td></tr>
${r.remaining > 0 ? `<tr><td>Saldo que ficou em aberto</td><td class="r">${esc(money(r.remaining))}</td></tr>` : ''}<tr><td>Total ainda em aberto</td><td class="r">${esc(money(r.openAfter))}</td></tr></table>
<div class="ln"></div><div class="sub">Operador: ${esc(r.operator)}</div><div class="sub" style="margin-top:18px">Assinatura: ______________________</div><div style="height:16px"></div>`, CSS80, false);
        });
    }

    /* ---------- receber parcelas (PDV, Contas a receber e Clientes) ---------- */
    const groupKey = e => e.customerId ? 'c:' + e.customerId : 'n:' + String(who(e)).trim().toLowerCase();
    async function openReceive(o = {}) {
        await cfg();
        const st = { key: o.key || (o.customerId ? 'c:' + o.customerId : null), label: o.label || '', entries: [], sel: new Set(o.entryIds || []), cash: null, all: [], onDone: o.onDone };
        const ov = dialog(head('fa-hand-holding-dollar', 'Receber parcelas', 'Crediário, fiado e outras contas a receber') + '<div id="dpcR"><div class="dpc-empty"><i class="fas fa-spinner fa-spin"></i> Carregando…</div></div>', { wide: true });
        const box = ov.querySelector('#dpcR');
        try {
            const [all, cash] = await Promise.all([list('financial_entries', [['type', '==', 'income']]), openCash(), ensureCustomers()]);
            st.all = all.filter(isOpen); st.cash = cash;
        } catch (e) { box.innerHTML = `<div class="dpc-b"><div class="dpc-warn red">Não foi possível carregar as contas: ${esc(e.message)}</div></div>`; return; }
        // Aberto a partir de uma conta: o cliente é o dono dela.
        if (!st.key && st.sel.size) { const e = st.all.find(x => st.sel.has(x.id)); if (e) { st.key = groupKey(e); st.fixed = true; } }
        if (st.key) pick(st.key); else renderSearch();

        function groups() {
            const m = new Map();
            st.all.forEach(e => { const k = groupKey(e); const g = m.get(k) || { key: k, name: who(e), phone: phoneOf(e), n: 0, total: 0, late: 0, next: null }; g.n++; g.total = r2(g.total + Number(e.amount || 0)); const d = dueOf(e); if (d && daysLate(d) > 0) g.late++; if (d && (!g.next || d < g.next)) g.next = d; m.set(k, g); });
            return [...m.values()].sort((a, b) => (b.late - a.late) || ((a.next || 0) - (b.next || 0)));
        }
        function renderSearch() {
            const gs = groups();
            box.innerHTML = `<div class="dpc-b"><label class="dpc-l">Cliente<input class="dpc-in" id="dpcRQ" placeholder="Nome, telefone ou CPF de quem está pagando" autocomplete="off"></label>
<div class="dpc-scroll" style="max-height:340px"><table class="dpc-t"><thead><tr><th>Cliente</th><th>Em aberto</th><th>Próximo vencimento</th><th class="r">Saldo</th><th></th></tr></thead><tbody id="dpcRL"></tbody></table></div>
<p class="dpc-mini" style="margin-top:8px">Aparecem só clientes com contas em aberto. Para lançar uma conta nova, use Contas a Receber › Nova Conta.</p></div>`;
            const q = box.querySelector('#dpcRQ'), tb = box.querySelector('#dpcRL');
            const draw = () => {
                const t = q.value.trim().toLowerCase(), d = t.replace(/\D/g, '');
                const rows = gs.filter(g => !t || g.name.toLowerCase().includes(t) || (d && String(g.phone).replace(/\D/g, '').includes(d))).slice(0, 60);
                tb.innerHTML = rows.length ? rows.map(g => `<tr><td><b>${esc(g.name)}</b>${g.phone ? `<div class="dpc-mini">${esc(g.phone)}</div>` : ''}</td><td>${g.n} conta${g.n > 1 ? 's' : ''}${g.late ? ` <span class="dpc-st late">${g.late} vencida${g.late > 1 ? 's' : ''}</span>` : ''}</td><td>${esc(br(g.next))}</td><td class="r"><b>${esc(money(g.total))}</b></td><td class="r"><button type="button" class="dpc-bt pri sm" data-k="${esc(g.key)}">Receber</button></td></tr>`).join('')
                    : `<tr><td colspan="5" class="dpc-empty">${gs.length ? 'Nenhum cliente encontrado.' : 'Nenhuma conta a receber em aberto.'}</td></tr>`;
            };
            q.addEventListener('input', draw); draw(); setTimeout(() => q.focus(), 30);
            tb.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) pick(b.dataset.k); });
        }
        function pick(key) {
            st.key = key;
            st.entries = st.all.filter(e => groupKey(e) === key).sort(byDue);
            if (!st.entries.length) { box.innerHTML = `<div class="dpc-b"><div class="dpc-warn ok">Este cliente não tem contas em aberto.</div></div><div class="dpc-f"><button type="button" class="dpc-bt" data-x>Fechar</button></div>`; return; }
            st.label = st.label || who(st.entries[0]);
            if (!st.sel.size || ![...st.sel].some(id => st.entries.some(e => e.id === id))) {
                const late = st.entries.filter(e => dueOf(e) && daysLate(dueOf(e)) > 0);
                (late.length ? late : st.entries.slice(0, 1)).forEach(e => st.sel.add(e.id));
            }
            renderForm();
        }
        function renderForm() {
            const cash = st.cash;
            box.innerHTML = `<div class="dpc-b"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap"><div><b style="font-size:15px">${esc(st.label)}</b><div class="dpc-mini">${st.entries.length} conta${st.entries.length > 1 ? 's' : ''} em aberto · marque o que está sendo pago</div></div>
${o.key || o.customerId || st.fixed ? '' : '<button type="button" class="dpc-bt sm" id="dpcRBack" style="margin-left:auto"><i class="fas fa-arrow-left"></i> Trocar cliente</button>'}</div>
<div class="dpc-scroll"><table class="dpc-t"><thead><tr><th style="width:28px"></th><th>Conta</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Multa + juros</th><th class="r">Total</th></tr></thead><tbody id="dpcRT"></tbody></table></div>
<div class="dpc-g3" style="margin-top:12px"><label class="dpc-l">Data do pagamento<input type="date" class="dpc-in" id="dpcRD" value="${ymd(new Date())}"></label>
<label class="dpc-l">Forma de pagamento<select class="dpc-in" id="dpcRM"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Cartão de débito</option><option value="credito">Cartão de crédito</option></select></label>
<label class="dpc-l">Desconto (R$)<input class="dpc-in" id="dpcRDesc" inputmode="decimal" value="0,00"></label></div>
<div class="dpc-g" style="margin-top:10px"><label class="dpc-l">Valor recebido (R$)<input class="dpc-in" id="dpcRV" inputmode="decimal" style="font-size:17px;font-weight:800"><small>Menor que o total = pagamento parcial (o saldo continua em aberto).</small></label>
<div><label class="dpc-chk"><input type="checkbox" id="dpcRCh" checked> Cobrar multa e juros de atraso${isCred(st.entries[0]) || st.entries.some(isCred) ? '' : ' (só no crediário)'}</label>
<label class="dpc-chk"><input type="checkbox" id="dpcRCx" ${cash ? 'checked' : 'disabled'}> ${cash ? `Lançar no caixa aberto (${esc(cash.operatorName || 'caixa')})` : 'Nenhum caixa aberto: entra só no financeiro'}</label></div></div>
<div class="dpc-sum" id="dpcRS"></div><div id="dpcRW"></div></div>
<div class="dpc-f"><button type="button" class="dpc-bt" data-x>Cancelar</button><button type="button" class="dpc-bt ok" id="dpcRGo"><i class="fas fa-check"></i> Confirmar recebimento</button></div>`;
            box.querySelector('#dpcRBack')?.addEventListener('click', () => { st.sel.clear(); st.label = ''; renderSearch(); });
            const tb = box.querySelector('#dpcRT');
            const v = box.querySelector('#dpcRV'), dEl = box.querySelector('#dpcRD'), desc = box.querySelector('#dpcRDesc'), ch = box.querySelector('#dpcRCh');
            let touched = false;
            const lines = () => {
                const at = fromYmd(dEl.value) || new Date();
                return st.entries.map(e => { const c = ch.checked ? charges(e, at) : { late: Math.max(0, daysLate(dueOf(e) || at, at)), multa: 0, juros: 0 }; return { e, c, due: r2(Number(e.amount || 0) + c.multa + c.juros), on: st.sel.has(e.id) }; });
            };
            const draw = () => {
                const ls = lines();
                tb.innerHTML = ls.map(l => `<tr class="${l.c.late > 0 ? 'late' : ''}"><td><input type="checkbox" data-id="${esc(l.e.id)}"${l.on ? ' checked' : ''}></td><td>${esc(l.e.description || l.e.category || 'Conta')}${carneTxt(l.e) ? '' : `<div class="dpc-mini">${esc(l.e.category || '')}</div>`}</td><td>${esc(br(dueOf(l.e)))}${l.c.late > 0 ? `<div class="dpc-mini" style="color:#dc2626">${l.c.late} dia${l.c.late > 1 ? 's' : ''} de atraso</div>` : ''}</td><td class="r">${esc(money(l.e.amount))}</td><td class="r">${l.c.multa + l.c.juros > 0 ? esc(money(l.c.multa + l.c.juros)) : '—'}</td><td class="r"><b>${esc(money(l.due))}</b></td></tr>`).join('');
                calc();
            };
            const calc = () => {
                const ls = lines().filter(l => l.on), tot = sum(ls, l => l.due), ds = Math.min(num(desc.value), tot);
                if (!touched) v.value = fmtIn(r2(tot - ds));
                const val = num(v.value), enc = sum(ls, l => l.c.multa + l.c.juros);
                const s = box.querySelector('#dpcRS'), w = box.querySelector('#dpcRW');
                s.innerHTML = `<span>${ls.length} selecionada${ls.length !== 1 ? 's' : ''}</span><span>Parcelas: <b>${esc(money(sum(ls, l => l.e.amount)))}</b></span>${enc > 0 ? `<span>Multa + juros: <b>${esc(money(enc))}</b></span>` : ''}${ds > 0 ? `<span>Desconto: <b>- ${esc(money(ds))}</b></span>` : ''}<span style="margin-left:auto">Total: <b class="big">${esc(money(r2(tot - ds)))}</b></span>`;
                const part = val + 0.005 < r2(tot - ds);
                w.innerHTML = !ls.length ? '<div class="dpc-warn">Marque pelo menos uma conta.</div>'
                    : val > r2(tot - ds) + 0.005 ? `<div class="dpc-warn red">O valor recebido é maior que o total (${esc(money(r2(tot - ds)))}). Se houver troco, informe só o valor da dívida.</div>`
                        : part && ds > 0 ? '<div class="dpc-warn red">Desconto só no pagamento total. Zere o desconto para receber uma parte.</div>'
                            : part ? `<div class="dpc-warn">Pagamento parcial: fica em aberto ${esc(money(r2(tot - ds - val)))}, com o mesmo vencimento.</div>` : '';
            };
            tb.addEventListener('change', e => { const c = e.target.closest('[data-id]'); if (!c) return; if (c.checked) st.sel.add(c.dataset.id); else st.sel.delete(c.dataset.id); touched = false; draw(); });
            [dEl, ch].forEach(x => x.addEventListener('change', () => { touched = false; draw(); }));
            desc.addEventListener('input', () => { touched = false; calc(); });
            v.addEventListener('input', () => { touched = true; calc(); });
            [v, desc].forEach(x => x.addEventListener('blur', () => { x.value = fmtIn(num(x.value)); }));
            draw();
            box.querySelector('#dpcRGo').addEventListener('click', async ev => {
                const btn = ev.currentTarget, ls = lines().filter(l => l.on);
                const at = fromYmd(dEl.value); if (!at) { say('warning', 'Informe a data do pagamento.'); return; }
                if (sod(at) > sod(new Date())) { say('warning', 'A data do pagamento não pode ser no futuro.'); return; }
                const tot = sum(ls, l => l.due), ds = r2(Math.min(num(desc.value), tot)), val = r2(num(v.value));
                if (!ls.length) { say('warning', 'Marque pelo menos uma conta.'); return; }
                if (!(val > 0)) { say('warning', 'Informe o valor recebido.'); return; }
                if (val > r2(tot - ds) + 0.005) { say('warning', 'O valor recebido é maior que o total.'); return; }
                if (val + 0.005 < r2(tot - ds) && ds > 0) { say('warning', 'Desconto só no pagamento total.'); return; }
                btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
                try {
                    const res = await receive({ lines: ls, at, method: box.querySelector('#dpcRM').value, discount: ds, value: val, cash: box.querySelector('#dpcRCx').checked ? st.cash : null, label: st.label, key: st.key });
                    done(res);
                } catch (e) { console.error(e); say('error', 'Não foi possível registrar: ' + e.message); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar recebimento'; }
            });
        }
        function done(res) {
            box.innerHTML = `<div class="dpc-ok"><i class="fas fa-circle-check big"></i><h4>Recebido ${esc(money(res.total))}</h4><p>${esc(res.cliente)} · ${esc(methodName(res.method))}${res.cash ? ' · lançado no caixa' : ''}</p>
${res.remaining > 0 ? `<p style="margin-top:6px">Ficou em aberto ${esc(money(res.remaining))} com o mesmo vencimento.</p>` : ''}<p style="margin-top:6px">Total que o cliente ainda deve: <b>${esc(money(res.openAfter))}</b></p></div>
<div class="dpc-f" style="justify-content:center"><button type="button" class="dpc-bt" id="dpcRP"><i class="fas fa-print"></i> Imprimir comprovante</button><button type="button" class="dpc-bt wa" id="dpcRWa"><i class="fab fa-whatsapp"></i> Enviar no WhatsApp</button><button type="button" class="dpc-bt pri" data-x>Concluir</button></div>`;
            box.querySelector('#dpcRP').addEventListener('click', () => printReceiptPay(res));
            box.querySelector('#dpcRWa').addEventListener('click', () => company().then(co => openWa(res.phone, `Olá, ${String(res.cliente).split(' ')[0]}! Recebemos o seu pagamento de ${money(res.total)} em ${res.at.toLocaleDateString('pt-BR')} (${res.lines.map(l => l.desc).join('; ')}).${res.openAfter > 0 ? ` Saldo em aberto: ${money(res.openAfter)}.` : ' Tudo quitado. Obrigado!'}\n${co.name}`)));
            try { if (typeof st.onDone === 'function') st.onDone(res); } catch (e) { }
        }
    }
    // Grava o recebimento: baixa total, ou parcial (a parte paga vira "recebida" e o saldo vira uma conta nova com o mesmo vencimento).
    async function receive(o) {
        const today = ymd(o.at) === ymd(new Date());
        const paidAt = today ? now() : TS(o.at);
        const rid = 'RCB-' + Date.now().toString(36).toUpperCase();
        const col = db.collection('financial_entries'), batch = db.batch();
        const tot = sum(o.lines, l => l.due), full = o.value + 0.005 >= r2(tot - o.discount);
        const out = []; let pool = o.value, remaining = 0, dLeft = o.discount;
        const base = l => ({ status: 'received', paidAt, originalAmount: l.e.originalAmount != null ? l.e.originalAmount : Number(l.e.amount || 0), lateFee: l.c.multa, lateInterest: l.c.juros, receivedMethod: o.method, receivedBy: uid(), receivedByName: userName(), receiptId: rid, cashRegisterId: o.cash ? o.cash.id : '', updatedAt: now() });
        o.lines.forEach((l, i) => {
            if (full) {
                const d = i === o.lines.length - 1 ? r2(dLeft) : r2(tot > 0 ? o.discount * l.due / tot : 0); dLeft = r2(dLeft - d);
                const paid = r2(l.due - d);
                batch.update(col.doc(l.e.id), { ...base(l), amount: paid, discount: d });
                out.push({ desc: l.e.description || l.e.category || 'Conta', due: dueOf(l.e), multa: l.c.multa, juros: l.c.juros, paid, desc2: d > 0 ? 'desconto ' + money(d) : '' });
                return;
            }
            if (pool <= 0.005) return;
            if (pool + 0.005 >= l.due) {
                batch.update(col.doc(l.e.id), { ...base(l), amount: l.due, discount: 0 }); pool = r2(pool - l.due);
                out.push({ desc: l.e.description || 'Conta', due: dueOf(l.e), multa: l.c.multa, juros: l.c.juros, paid: l.due, desc2: '' });
                return;
            }
            const paid = r2(pool), rest = r2(l.due - paid); pool = 0; remaining = rest;
            batch.update(col.doc(l.e.id), { ...base(l), amount: paid, discount: 0, partial: true });
            const e = l.e, desc = String(e.description || 'Conta').replace(/\s*\(saldo\)$/, '') + ' (saldo)';
            const copy = { type: 'income', category: e.category || '', customerId: e.customerId || '', customerName: e.customerName || '', debtorName: e.debtorName || '', debtorPhone: e.debtorPhone || '', debtorDoc: e.debtorDoc || '', debtorAddress: e.debtorAddress || '', referenceType: e.referenceType || '', referenceId: e.referenceId || '', notes: e.notes || '' };
            if (e.installment) copy.installment = e.installment;
            if (e.crediario) copy.crediario = e.crediario;
            batch.set(col.doc(), { ...copy, ...stamp(), amount: rest, status: 'pending', description: desc, dueDate: TS(dueOf(e) || o.at), lateFeeApplied: !!(l.c.multa > 0 || e.lateFeeApplied), interestFrom: l.c.late > 0 ? TS(o.at) : (e.interestFrom || null), parentId: e.id });
            out.push({ desc: e.description || 'Conta', due: dueOf(e), multa: l.c.multa, juros: l.c.juros, paid, desc2: 'pagamento parcial' });
        });
        if (o.cash && o.value > 0) {
            const first = o.lines[0].e;
            batch.set(db.collection('cash_movements').doc(), {
                ...stamp(), cashRegisterId: o.cash.id, type: 'sale', amount: o.value, paymentMethod: o.method, installments: 1, cardBrand: '', feeValue: 0, netAmount: o.value,
                description: `Recebimento ${o.lines.some(l => isCred(l.e)) ? 'crediário' : 'conta'} · ${o.label}${o.lines.length === 1 ? ' · ' + (o.lines[0].e.description || '') : ' · ' + o.lines.length + ' parcelas'}`,
                referenceId: first.id, referenceType: 'receivable', receivableIds: o.lines.map(l => l.e.id), receiptId: rid, reversed: false
            });
        }
        await batch.commit();
        let openAfter = 0;
        try { const all = await list('financial_entries', [['type', '==', 'income']]); openAfter = sum(all.filter(e => isOpen(e) && groupKey(e) === o.key), e => e.amount); } catch (e) { }
        try { if (typeof AuditService !== 'undefined' && AuditService && AuditService.log) AuditService.log('receive', 'financial_entries', o.lines[0].e.id, { receiptId: rid, total: o.value, method: o.method, entries: o.lines.map(l => l.e.id) }); } catch (e) { }
        return { id: rid, at: today ? new Date() : o.at, total: o.value, method: o.method, discount: o.discount, lines: out, remaining, openAfter, cliente: o.label, phone: phoneOf(o.lines[0].e), operator: userName(), cash: !!o.cash };
    }

    /* ---------- cobrança no WhatsApp ---------- */
    // scope: { key } cliente · { saleId } carnê · { id } uma conta (e o saldo dela). Busca na hora: alguém pode ter recebido depois que a tela abriu.
    async function waCharge(scope, label, phone) {
        await Promise.all([cfg(), ensureCustomers()]); const co = await company();
        let all = [];
        try { all = (await list('financial_entries', [['type', '==', 'income']])).filter(e => !e.deleted); } catch (e) { say('error', 'Não foi possível consultar as contas: ' + e.message); return; }
        const inScope = e => scope.key ? groupKey(e) === scope.key : scope.saleId ? ((e.crediario && e.crediario.saleId) || e.referenceId) === scope.saleId : scope.id ? (e.id === scope.id || e.parentId === scope.id) : false;
        const open = all.filter(e => inScope(e) && isOpen(e)).sort(byDue);
        if (!open.length) { say('info', 'Nada em aberto para cobrar.'); return; }
        const late = open.filter(e => dueOf(e) && daysLate(dueOf(e)) > 0), list2 = (late.length ? late : open.slice(0, 1));
        const lines = list2.map(e => { const c = charges(e); return `• ${e.description || 'Parcela'}: venc. ${br(dueOf(e))} · ${money(r2(Number(e.amount) + c.multa + c.juros))}${c.late > 0 ? ` (${c.late} dia${c.late > 1 ? 's' : ''} de atraso)` : ''}`; }).join('\n');
        const first = String(label || '').split(' ')[0] || 'tudo bem';
        const text = `Olá, ${first}! Aqui é da ${co.name}.\n${late.length ? 'Consta em aberto:' : 'Lembrete do próximo vencimento:'}\n${lines}\n${CFG.chavePix ? `Pode pagar pelo PIX: ${CFG.chavePix}\n` : ''}Qualquer dúvida, é só responder esta mensagem.`;
        openWa(phone || phoneOf(open[0]), text);
    }

    /* ---------- previsão (a receber × a pagar) ---------- */
    async function openForecast() {
        const ov = dialog(head('fa-chart-line', 'Previsão dos próximos 30 dias', 'O que entra (contas a receber, inclusive parcelas do crediário) e o que sai (contas a pagar)') + '<div class="dpc-b" id="dpcFB"><div class="dpc-empty"><i class="fas fa-spinner fa-spin"></i> Calculando…</div></div><div class="dpc-f"><button type="button" class="dpc-bt pri" data-x>Fechar</button></div>', { wide: true });
        const all = (await list('financial_entries')).filter(e => !e.deleted && e.status === 'pending');
        const t0 = sod(new Date()), weeks = [0, 1, 2, 3, 4].map(k => ({ a: addDays(t0, k * 7), b: addDays(t0, k * 7 + 6) })).map(w => ({ a: sod(w.a), b: sod(w.b) }));
        weeks[4].b = sod(addDays(t0, 29));
        const bucket = (type, a, b) => sum(all.filter(e => e.type === type && dueOf(e) && sod(dueOf(e)) >= a && sod(dueOf(e)) <= b), e => e.amount);
        const lateIn = sum(all.filter(e => e.type === 'income' && dueOf(e) && sod(dueOf(e)) < t0), e => e.amount), lateOut = sum(all.filter(e => e.type === 'expense' && dueOf(e) && sod(dueOf(e)) < t0), e => e.amount);
        const credIn = sum(all.filter(e => e.type === 'income' && isCred(e) && dueOf(e) && sod(dueOf(e)) >= t0 && sod(dueOf(e)) <= weeks[4].b), e => e.amount);
        let acc = 0;
        const rows = weeks.map(w => { const i = bucket('income', w.a, w.b), o = bucket('expense', w.a, w.b), s = r2(i - o); acc = r2(acc + s); return `<tr><td class="n">${esc(brShort(w.a))} a ${esc(brShort(w.b))}</td><td class="r">${esc(money(i))}</td><td class="r">${esc(money(o))}</td><td class="r ${s >= 0 ? 'dpc-pos' : 'dpc-neg'}">${esc(money(s))}</td><td class="r ${acc >= 0 ? 'dpc-pos' : 'dpc-neg'}">${esc(money(acc))}</td></tr>`; }).join('');
        const tin = sum(weeks, w => bucket('income', w.a, w.b)), tout = sum(weeks, w => bucket('expense', w.a, w.b));
        const fb = ov.querySelector('#dpcFB'); if (!fb) return;
        fb.innerHTML = `<div class="dpc-cards" style="padding:0 0 12px"><div class="dpc-card green"><b>${esc(money(tin))}</b><span>A receber em 30 dias</span></div><div class="dpc-card"><b>${esc(money(credIn))}</b><span>…sendo do crediário</span></div><div class="dpc-card red"><b>${esc(money(tout))}</b><span>A pagar em 30 dias</span></div><div class="dpc-card ${tin - tout >= 0 ? 'green' : 'red'}"><b>${esc(money(r2(tin - tout)))}</b><span>Saldo previsto</span></div></div>
<table class="dpc-t dpc-prev"><thead><tr><th>Semana</th><th class="r">Entra</th><th class="r">Sai</th><th class="r">Saldo da semana</th><th class="r">Acumulado</th></tr></thead><tbody>${rows}</tbody></table>
${lateIn > 0 || lateOut > 0 ? `<div class="dpc-warn" style="margin-top:12px">Já vencido e ainda em aberto: <b>${esc(money(lateIn))}</b> a receber e <b>${esc(money(lateOut))}</b> a pagar (fora da tabela acima).</div>` : ''}`;
    }

    /* ---------- configurações ---------- */
    async function openConfig(after) {
        await cfg(true);
        if (!canManage()) { say('warning', 'Só administrador, gerente ou financeiro altera as regras do crediário.'); return; }
        const c = CFG;
        const ov = dialog(head('fa-gear', 'Regras do crediário', 'Valem para novas vendas e para o cálculo de atraso') + `<div class="dpc-b">
<label class="dpc-chk" style="margin-top:0"><input type="checkbox" id="dpcC_ativo"${c.ativo ? ' checked' : ''}> Mostrar a opção "Crediário" no PDV</label>
<div class="dpc-g3" style="margin-top:12px"><label class="dpc-l">Máximo de parcelas<input class="dpc-in" id="dpcC_max" type="number" min="1" max="48" value="${esc(c.maxParcelas)}"></label>
<label class="dpc-l">Intervalo padrão<select class="dpc-in" id="dpcC_int"><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select></label>
<label class="dpc-l">1ª parcela vence em (dias)<input class="dpc-in" id="dpcC_dias" type="number" min="0" max="120" value="${esc(c.diasPrimeira)}"></label></div>
<div class="dpc-g3" style="margin-top:10px"><label class="dpc-l">Juros do parcelamento (% ao mês)<input class="dpc-in" id="dpcC_jp" inputmode="decimal" value="${esc(String(c.jurosParcelamento).replace('.', ','))}"><small>0 = sem juros</small></label>
<label class="dpc-l">Multa por atraso (%)<input class="dpc-in" id="dpcC_mu" inputmode="decimal" value="${esc(String(c.multa).replace('.', ','))}"><small>O CDC limita a 2%</small></label>
<label class="dpc-l">Juros de atraso (% ao mês)<input class="dpc-in" id="dpcC_jm" inputmode="decimal" value="${esc(String(c.jurosMora).replace('.', ','))}"><small>Cobrado por dia (pro rata)</small></label></div>
<div class="dpc-g3" style="margin-top:10px"><label class="dpc-l">Carência (dias sem multa)<input class="dpc-in" id="dpcC_car" type="number" min="0" max="30" value="${esc(c.carencia)}"></label>
<label class="dpc-l">Entrada mínima (% da venda)<input class="dpc-in" id="dpcC_ent" inputmode="decimal" value="${esc(String(c.entradaMinima).replace('.', ','))}"></label>
<label class="dpc-l">Chave PIX para cobrança<input class="dpc-in" id="dpcC_pix" value="${esc(c.chavePix)}" placeholder="CNPJ, e-mail, telefone…"></label></div>
<label class="dpc-chk"><input type="checkbox" id="dpcC_lim"${c.exigirLimite ? ' checked' : ''}> Bloquear venda acima do limite de crédito do cliente (gerente pode liberar)</label>
<label class="dpc-chk"><input type="checkbox" id="dpcC_atr"${c.bloquearAtraso ? ' checked' : ''}> Bloquear crediário para cliente com parcela vencida (gerente pode liberar)</label>
<label class="dpc-l" style="margin-top:12px">Mensagem impressa no carnê<textarea class="dpc-in" id="dpcC_msg" rows="2">${esc(c.mensagemCarne)}</textarea></label>
<p class="dpc-mini" style="margin-top:10px">O limite de crédito fica no cadastro de cada cliente (Clientes › Editar › Limite de Crédito).</p></div>
<div class="dpc-f"><button type="button" class="dpc-bt" data-x>Cancelar</button><button type="button" class="dpc-bt pri" id="dpcCSave"><i class="fas fa-check"></i> Salvar regras</button></div>`);
        ov.querySelector('#dpcC_int').value = c.intervalo || 'mensal';
        ov.querySelector('#dpcCSave').addEventListener('click', async () => {
            const g = id => ov.querySelector('#' + id);
            const v = {
                ativo: g('dpcC_ativo').checked, maxParcelas: Math.min(48, Math.max(1, parseInt(g('dpcC_max').value, 10) || 12)), intervalo: g('dpcC_int').value,
                diasPrimeira: Math.min(120, Math.max(0, parseInt(g('dpcC_dias').value, 10) || 0)), jurosParcelamento: Math.max(0, num(g('dpcC_jp').value)),
                multa: Math.min(20, Math.max(0, num(g('dpcC_mu').value))), jurosMora: Math.max(0, num(g('dpcC_jm').value)), carencia: Math.min(30, Math.max(0, parseInt(g('dpcC_car').value, 10) || 0)),
                entradaMinima: Math.min(99, Math.max(0, num(g('dpcC_ent').value))), chavePix: g('dpcC_pix').value.trim().slice(0, 120),
                exigirLimite: g('dpcC_lim').checked, bloquearAtraso: g('dpcC_atr').checked, mensagemCarne: g('dpcC_msg').value.trim().slice(0, 300)
            };
            try { await db.collection('settings').doc('crediario').set({ ...v, updatedAt: now(), updatedBy: uid() }, { merge: true }); CFG = { ...DEF, ...v }; cfgAt = Date.now(); say('success', 'Regras do crediário salvas.'); closeDlg(); if (typeof after === 'function') after(); }
            catch (e) { say('error', 'Não foi possível salvar: ' + e.message); }
        });
    }

    /* ---------- limite de listas: as telas de contas carregavam só 500 lançamentos ---------- */
    (function liftLimit() {
        const o = window.simpleList;
        if (typeof o !== 'function' || o.__dpc) return;
        // 40.26 · O Firestore aceita no máximo 10.000 por busca: o 20000 dava "Limit value in the structured query is over
        // the maximum value of 10000", o simpleList devolvia vazio e Contas a pagar, Contas a receber e Fluxo de caixa
        // ficavam zerados (cliente na Cloudflare, 19/10/2026). Aqui busca de 10.000 em 10.000 (pelo id) até acabar, e
        // tira os apagados e ordena como o simpleList. Se der erro, cai no simpleList com 10.000.
        const todos = async (col, field, dir) => {
            const FP = firebase.firestore.FieldPath, out = []; let last = null;
            for (let i = 0; i < 50; i++) {
                let q = db.collection(col).orderBy(FP.documentId()).limit(10000); if (last) q = q.startAfter(last);
                const s = await q.get(); s.docs.forEach(d => out.push({ id: d.id, ...d.data() }));
                if (s.docs.length < 10000) break; last = s.docs[s.docs.length - 1];
            }
            const docs = out.filter(d => d.deleted !== true);
            if (field) {
                const val = v => (v && v.toDate ? v.toDate().getTime() : typeof v === 'string' ? v.toLowerCase() : v);
                docs.sort((a, b) => { const va = val(a[field]), vb = val(b[field]); if (va < vb) return dir === 'asc' ? -1 : 1; if (va > vb) return dir === 'asc' ? 1 : -1; return 0; });
            }
            return docs;
        };
        const w = async function (collection, orderField, orderDir, limitN) {
            if (collection !== 'financial_entries') return o.call(this, collection, orderField, orderDir, limitN);
            const [rows] = await Promise.all([todos(collection, orderField, orderDir).catch(e => { console.warn('financial_entries:', e && e.message); return o.call(this, collection, orderField, orderDir, 10000); }), ensureCustomers()]);
            // Conta do fiado sem nome (o PDV grava só o código do cliente): mostra o nome do cadastro.
            return (rows || []).map(r => {
                const c = r && r.type === 'income' && !r.customerName && !r.debtorName && r.customerId && CMAP.get(r.customerId);
                return c ? { ...r, customerName: c.name || c.nome || '', debtorPhone: r.debtorPhone || c.whatsapp || c.phone || '' } : r;
            });
        };
        w.__dpc = true; window.simpleList = w;
    })();
    // Funções que a página redefine a cada carregamento (window.receiveIt etc.): a nossa versão sempre vence.
    function hook(name, make) {
        // 40.0 · Encadeado (igual ao contas-bancarias-v1.js): quem embrulhou antes continua na corrente quando a página
        // redefine a função (initPageContasPagar roda de novo depois de cada pagamento).
        // 40.73 · Vale em todas as versões (antes só no Mensal): no Firebase, MySQL e Offline a 2ª conta "Parcelar em" sem
        // recarregar virava uma conta só com o valor total, e o 2º "Pagar" seguido perdia a janela de pagamento.
        const prev = Object.getOwnPropertyDescriptor(window, name), temPrev = !!(prev && prev.get && prev.set);
        let legacy = window[name];
        const ours = make(() => temPrev ? prev.get.call(window) : legacy);
        try { Object.defineProperty(window, name, { configurable: true, get() { return ours; }, set(v) { if (temPrev) prev.set.call(window, v); else legacy = v; } }); }
        catch (e) { window[name] = ours; }
    }

    /* =====================================================================
       PDV
       ===================================================================== */
    function initPdv() {
        if (typeof window.buildSalePayments !== 'function' || typeof SalesService === 'undefined' || !document.querySelector('.payment-methods')) return;
        const G = {
            cart() { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } },
            cid() { try { return selectedCustomerId || null; } catch (e) { return null; } },
            cname() { try { return selectedCustomerNameVal || ''; } catch (e) { return ''; } },
            customers() { try { return Array.isArray(allPdvCustomers) ? allPdvCustomers : []; } catch (e) { return []; } },
            method() { try { return selectedPayment; } catch (e) { return ''; } },
            base() { const s = this.cart().reduce((a, i) => a + Number(i.total || 0), 0); let d = 0, f = 0; try { d = Number(discount || 0); } catch (e) { } try { f = Number(deliveryFee || 0); } catch (e) { } return r2(Math.max(0, s - d + f)); }
        };
        let plan = null, internal = false, finalizing = false, btn = null;
        const active = () => !!(plan && btn && G.method() === 'fiado' && btn.classList.contains('selected'));

        function mountButton() {
            if (document.getElementById('dpcPayBtn')) return;
            const box = document.querySelector('.payment-methods'); if (!box) return;
            btn = document.createElement('button'); btn.type = 'button'; btn.className = 'pay-method'; btn.id = 'dpcPayBtn';
            btn.innerHTML = '<i class="fas fa-calendar-check"></i>Crediário';
            btn.addEventListener('click', () => openPlan());
            const fiado = box.querySelector('.pay-method[onclick*="\'fiado\'"]'), multi = box.querySelector('.pay-method[onclick*="\'multi\'"]');
            if (fiado) fiado.after(btn); else if (multi) multi.before(btn); else box.appendChild(btn);
            btn.style.display = CFG.ativo ? '' : 'none';
        }
        function mountReceiveButton() {
            if (document.getElementById('dpcRecvBtn')) return;
            const headEl = document.querySelector('.pdv-header'); if (!headEl) return;
            const b = document.createElement('button'); b.type = 'button'; b.id = 'dpcRecvBtn'; b.className = 'dpc-hbtn'; b.title = 'Receber parcelas do crediário e contas do fiado';
            b.innerHTML = '<i class="fas fa-hand-holding-dollar"></i><span>Receber crediário</span>';
            b.addEventListener('click', () => { const cid = G.cid(); openReceive(cid ? { customerId: cid, label: G.cname() } : {}); });
            headEl.appendChild(b);
        }
        cfg().then(() => { mountButton(); mountReceiveButton(); });

        function select() {
            internal = true;
            try { window.selectPayment('fiado', btn); } finally { internal = false; }
            try { window.updateBrandIndicator(); } catch (e) { }
        }
        function resetPayment() {
            plan = null;
            const box = document.querySelector('.payment-methods'); if (!box) return;
            const vis = [...box.querySelectorAll('.pay-method')].filter(b => b !== btn && b.style.display !== 'none');
            const pick = vis.find(b => /'dinheiro'/.test(b.getAttribute('onclick') || '')) || vis.find(b => /'pix'/.test(b.getAttribute('onclick') || ''));
            if (pick) { const m = (pick.getAttribute('onclick') || '').match(/selectPayment\('([^']+)'/); if (m) window.selectPayment(m[1], pick); }
            else { btn && btn.classList.remove('selected'); try { window.updateBrandIndicator(); } catch (e) { } }
        }

        async function customerInfo(cid) {
            const c = G.customers().find(x => String(x.id) === String(cid)) || (await getDoc('customers', cid).catch(() => null)) || {};
            let open = [];
            try { open = (await list('financial_entries', [['customerId', '==', cid]])).filter(isOpen); } catch (e) { }
            const late = open.filter(e => dueOf(e) && daysLate(dueOf(e)) > 0);
            return { c, open: sum(open, e => e.amount), late: sum(late, e => e.amount), lateN: late.length, limit: Number(c.creditLimit || 0) };
        }

        async function openPlan() {
            await cfg();
            if (!G.cart().length) { say('warning', 'Adicione produtos ao carrinho antes de escolher o crediário.'); return; }
            const cid = G.cid();
            if (!cid) { say('warning', 'Venda no crediário precisa de cliente cadastrado. Selecione o cliente (campo "Cliente" do carrinho).'); const s = document.getElementById('customerSearch'); if (s) { s.focus(); s.scrollIntoView({ block: 'center' }); } return; }
            const total = G.base();
            if (!(total > 0)) { say('warning', 'O total da venda precisa ser maior que zero.'); return; }
            const prev = plan && plan.customerId === cid ? plan : null;
            const max = Math.max(1, Math.min(48, Number(CFG.maxParcelas) || 12));
            const firstDef = prev ? prev.first : addDays(new Date(), CFG.intervalo === 'semanal' ? 7 : CFG.intervalo === 'quinzenal' ? 15 : (Number(CFG.diasPrimeira) || 30));
            const ov = dialog(head('fa-calendar-check', 'Venda no crediário', `Cliente <b>${esc(G.cname())}</b> · total ${esc(money(total))}`) + `<div class="dpc-b">
<div id="dpcPCli" class="dpc-chips"><span class="dpc-chip"><i class="fas fa-spinner fa-spin"></i> consultando o cliente…</span></div>
<div class="dpc-g3" style="margin-top:12px"><label class="dpc-l">Entrada (R$)<input class="dpc-in" id="dpcPE" inputmode="decimal" value="${fmtIn(prev ? prev.entrada : 0)}"></label>
<label class="dpc-l">Entrada paga em<select class="dpc-in" id="dpcPEM"><option value="dinheiro">Dinheiro</option><option value="pix">PIX</option><option value="debito">Débito</option><option value="credito">Crédito</option></select></label>
<label class="dpc-l" id="dpcPRW">Valor entregue (troco)<input class="dpc-in" id="dpcPR" inputmode="decimal" placeholder="opcional"></label></div>
<div class="dpc-g3" style="margin-top:10px"><label class="dpc-l">Parcelas<select class="dpc-in" id="dpcPN">${Array.from({ length: max }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label>
<label class="dpc-l">1º vencimento<input type="date" class="dpc-in" id="dpcPF" value="${ymd(firstDef)}"></label>
<label class="dpc-l">Intervalo<select class="dpc-in" id="dpcPI"><option value="mensal">Mensal</option><option value="quinzenal">Quinzenal</option><option value="semanal">Semanal</option></select></label></div>
<div class="dpc-g3" style="margin-top:10px"><label class="dpc-l">Juros (% ao mês)<input class="dpc-in" id="dpcPJ" inputmode="decimal" value="${esc(String(prev ? prev.juros : CFG.jurosParcelamento).replace('.', ','))}"${canManage() ? '' : ' readonly'}></label>
<div style="grid-column:span 2;display:flex;align-items:flex-end;justify-content:flex-end;gap:6px">${canManage() ? '<button type="button" class="dpc-bt sm" id="dpcPCfg"><i class="fas fa-gear"></i> Regras do crediário</button>' : ''}</div></div>
<div class="dpc-sum" id="dpcPS"></div><div class="dpc-scroll" style="max-height:220px"><table class="dpc-t"><thead><tr><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody id="dpcPT"></tbody></table></div>
<div id="dpcPW"></div></div>
<div class="dpc-f"><button type="button" class="dpc-bt" data-x>Cancelar</button><button type="button" class="dpc-bt pri" id="dpcPGo"><i class="fas fa-check"></i> Usar crediário</button></div>`, { sticky: true });
            const $ = id => ov.querySelector('#' + id);
            $('dpcPN').value = String(prev ? prev.n : Math.min(3, max));
            $('dpcPI').value = prev ? prev.intervalo : (CFG.intervalo || 'mensal');
            $('dpcPEM').value = prev ? prev.entradaMetodo : 'dinheiro';
            if (prev && prev.entradaRecebido) $('dpcPR').value = fmtIn(prev.entradaRecebido);
            $('dpcPCfg')?.addEventListener('click', () => openConfig(() => openPlan()));
            let info = null, override = false;
            const read = () => makePlan({ total, entrada: num($('dpcPE').value), entradaMetodo: $('dpcPEM').value, entradaRecebido: num($('dpcPR').value), n: Number($('dpcPN').value), juros: num($('dpcPJ').value), first: fromYmd($('dpcPF').value) || firstDef, intervalo: $('dpcPI').value, customerId: cid });
            const problems = p => {
                const out = [];
                if (p.entrada >= p.total - 0.005) out.push({ red: 1, t: 'A entrada cobre a venda toda: escolha outra forma de pagamento.' });
                const minE = r2(p.total * (Number(CFG.entradaMinima) || 0) / 100);
                if (minE > 0 && p.entrada + 0.005 < minE) out.push({ red: 1, t: `Entrada mínima: ${money(minE)} (${pctTxt(CFG.entradaMinima)} da venda).` });
                if (p.entrada > 0 && p.entradaMetodo === 'dinheiro' && p.entradaRecebido > 0 && p.entradaRecebido + 0.005 < p.entrada) out.push({ red: 1, t: 'O valor entregue é menor que a entrada.' });
                if (sod(p.first) < sod(new Date())) out.push({ red: 1, t: 'O 1º vencimento não pode ser antes de hoje.' });
                if (info) {
                    if (info.lateN > 0) out.push({ red: CFG.bloquearAtraso ? 2 : 0, t: `O cliente tem ${info.lateN} parcela${info.lateN > 1 ? 's' : ''} vencida${info.lateN > 1 ? 's' : ''} (${money(info.late)}).` });
                    if (info.limit > 0 && info.open + p.principal > info.limit + 0.005) out.push({ red: CFG.exigirLimite ? 2 : 0, t: `Passa do limite de crédito: limite ${money(info.limit)}, já deve ${money(info.open)}, esta venda ${money(p.principal)}.` });
                }
                return out;
            };
            const draw = () => {
                const p = read();
                $('dpcPRW').style.display = p.entrada > 0 && p.entradaMetodo === 'dinheiro' ? '' : 'none';
                const troco = p.entradaMetodo === 'dinheiro' && p.entradaRecebido > p.entrada ? r2(p.entradaRecebido - p.entrada) : 0;
                $('dpcPS').innerHTML = `${p.entrada > 0 ? `<span>Entrada: <b>${esc(money(p.entrada))}</b> (${esc(methodName(p.entradaMetodo))})${troco > 0 ? ` · troco <b>${esc(money(troco))}</b>` : ''}</span>` : ''}<span>Financiado: <b>${esc(money(p.principal))}</b></span>${p.jurosValor > 0 ? `<span>Juros: <b>${esc(money(p.jurosValor))}</b></span>` : ''}<span style="margin-left:auto"><b class="big">${p.n}x de ${esc(money(p.parcelas[0].valor))}</b>${p.parcelas[p.n - 1].valor !== p.parcelas[0].valor ? ` <span class="dpc-mini">(última ${esc(money(p.parcelas[p.n - 1].valor))})</span>` : ''}</span>`;
                $('dpcPT').innerHTML = p.parcelas.map(x => `<tr><td>${x.n}/${p.n}</td><td>${esc(br(x.due))} <span class="dpc-mini">${esc(x.due.toLocaleDateString('pt-BR', { weekday: 'short' }))}</span></td><td class="r">${esc(money(x.valor))}</td></tr>`).join('') + `<tr><td colspan="2"><b>Total a prazo</b></td><td class="r"><b>${esc(money(r2(p.totalParcelado + p.entrada)))}</b></td></tr>`;
                const pr = problems(p), blocked = pr.some(x => x.red === 2);
                $('dpcPW').innerHTML = pr.map(x => `<div class="dpc-warn${x.red ? ' red' : ''}">${esc(x.t)}</div>`).join('') + (blocked ? (canManage() ? `<label class="dpc-chk"><input type="checkbox" id="dpcPOv"${override ? ' checked' : ''}> Autorizo esta venda mesmo assim (${esc(userName())})</label>` : '<div class="dpc-warn red">Peça para um gerente liberar esta venda.</div>') : '');
                $('dpcPOv')?.addEventListener('change', e => { override = e.target.checked; });
            };
            ['dpcPE', 'dpcPR', 'dpcPJ'].forEach(id => { $(id).addEventListener('input', draw); $(id).addEventListener('blur', () => { if ($(id).value.trim() !== '') $(id).value = id === 'dpcPJ' ? String(num($(id).value)).replace('.', ',') : fmtIn(num($(id).value)); draw(); }); });
            ['dpcPN', 'dpcPF', 'dpcPI', 'dpcPEM'].forEach(id => $(id).addEventListener('change', () => {
                if (id === 'dpcPI') { const iv = $('dpcPI').value; $('dpcPF').value = ymd(addDays(new Date(), iv === 'semanal' ? 7 : iv === 'quinzenal' ? 15 : (Number(CFG.diasPrimeira) || 30))); }
                draw();
            }));
            draw();
            customerInfo(cid).then(i => {
                info = i;
                const el = $('dpcPCli'); if (!el) return;
                el.innerHTML = `${i.c.phone || i.c.whatsapp ? `<span class="dpc-chip"><i class="fas fa-phone"></i> ${esc(i.c.whatsapp || i.c.phone)}</span>` : ''}<span class="dpc-chip ${i.open > 0 ? '' : 'green'}">Já deve: ${esc(money(i.open))}</span>${i.lateN ? `<span class="dpc-chip red">${i.lateN} vencida${i.lateN > 1 ? 's' : ''}: ${esc(money(i.late))}</span>` : '<span class="dpc-chip green">Nada vencido</span>'}${i.limit > 0 ? `<span class="dpc-chip">Limite: ${esc(money(i.limit))} · disponível ${esc(money(Math.max(0, i.limit - i.open)))}</span>` : '<span class="dpc-chip">Sem limite de crédito cadastrado</span>'}`;
                draw();
            });
            $('dpcPGo').addEventListener('click', () => {
                const p = read(), pr = problems(p);
                const hard = pr.find(x => x.red === 1); if (hard) { say('warning', hard.t); return; }
                if (pr.some(x => x.red === 2) && !(canManage() && override)) { say('warning', 'Venda bloqueada pelas regras do crediário: ' + pr.filter(x => x.red === 2).map(x => x.t).join(' ')); return; }
                plan = { ...p, authorizedBy: pr.some(x => x.red === 2) ? userName() : '' };
                closeDlg(); select();
                say('success', `Crediário: ${p.entrada > 0 ? 'entrada ' + money(p.entrada) + ' + ' : ''}${p.n}x de ${money(p.parcelas[0].valor)}. Finalize a venda.`);
            });
        }

        // Linha embaixo das formas de pagamento
        const oInd = window.updateBrandIndicator;
        if (typeof oInd === 'function') window.updateBrandIndicator = function () {
            const r = oInd.apply(this, arguments);
            try {
                const el = document.getElementById('brandIndicator');
                if (el && active()) {
                    el.style.display = 'block';
                    el.innerHTML = `<i class="fas fa-calendar-check" style="margin-right:4px;color:var(--accent)"></i><strong style="color:var(--text-primary)">Crediário</strong> · ${plan.entrada > 0 ? 'entrada ' + esc(money(plan.entrada)) + ' + ' : ''}${plan.n}x de ${esc(money(plan.parcelas[0].valor))} · 1ª em ${esc(brShort(plan.first))} <a href="#" id="dpcIndEdit" style="margin-left:6px;color:var(--accent);text-decoration:none">alterar</a>`;
                    el.querySelector('#dpcIndEdit').addEventListener('click', e => { e.preventDefault(); openPlan(); });
                }
            } catch (e) { }
            return r;
        };
        const oSel = window.selectPayment;
        if (typeof oSel === 'function') window.selectPayment = function (method, b) {
            if (!internal && b !== btn) plan = null;
            return oSel.apply(this, arguments);
        };
        // As parcelas: entrada (se houver) + parte a prazo como "fiado" (não entra no caixa) com o plano do crediário.
        const oBuild = window.buildSalePayments;
        window.buildSalePayments = function (total) {
            if (!active()) return oBuild.apply(this, arguments);
            const p = plan, out = [];
            if (p.entrada > 0) {
                let fee = { pct: 0, value: 0 };
                try { if (typeof calcPaymentFeeFor === 'function') fee = calcPaymentFeeFor(p.entradaMetodo, p.entrada, '') || fee; } catch (e) { }
                const rec = p.entradaMetodo === 'dinheiro' ? Math.max(p.entrada, p.entradaRecebido || 0) : 0;
                out.push({ method: p.entradaMetodo, amount: p.entrada, cardBrand: '', installments: 1, feePercent: Number(fee.pct || 0), feeValue: Number(fee.value || 0), netAmount: r2(p.entrada - Number(fee.value || 0)), cashReceived: rec, changeValue: p.entradaMetodo === 'dinheiro' ? r2(rec - p.entrada) : 0, dueDate: '', crediarioEntrada: true });
            }
            const fin = r2(Number(total) - p.entrada);
            out.push({ method: 'fiado', amount: fin, cardBrand: '', installments: p.n, feePercent: 0, feeValue: 0, netAmount: fin, cashReceived: 0, changeValue: 0, dueDate: ymd(p.first), crediario: { parcelas: p.n, juros: p.juros, intervalo: p.intervalo, valorParcela: p.parcelas[0].valor, totalParcelado: p.totalParcelado } });
            return out;
        };
        const oFin = window.finalizeSale;
        if (typeof oFin === 'function') window.finalizeSale = function () {
            if (active()) {
                if (!G.cid()) { say('warning', 'Venda no crediário precisa de cliente. Selecione o cliente.'); return; }
                if (Math.abs(G.base() - plan.total) > 0.009 || String(G.cid()) !== String(plan.customerId)) { say('info', 'A venda mudou: confira as parcelas do crediário.'); openPlan(); return; }
            }
            finalizing = true;
            try { return oFin.apply(this, arguments); } finally { finalizing = false; }
        };
        // Resumo de "Finalizar venda" diz Crediário e mostra as parcelas.
        try {
            if (typeof Confirm !== 'undefined' && Confirm && typeof Confirm.show === 'function' && !Confirm.show.__dpc) {
                const oShow = Confirm.show;
                const w = function (title, html) {
                    const a = Array.from(arguments);
                    if (finalizing && active() && typeof html === 'string') {
                        const p = plan;
                        a[1] = html.replace(/•\s*Fiado</, '• Crediário<').replace(/<\/div>\s*$/, `<div style="margin-top:10px;padding:10px;border-radius:10px;background:var(--bg-secondary);font-size:12.5px;text-align:left"><b>Crediário</b>${p.entrada > 0 ? ` · entrada ${esc(money(p.entrada))} (${esc(methodName(p.entradaMetodo))})` : ''}<br>${p.parcelas.map(x => `${x.n}/${p.n} · ${esc(br(x.due))} · <b>${esc(money(x.valor))}</b>`).join('<br>')}${p.jurosValor > 0 ? `<br>Juros: ${esc(money(p.jurosValor))} (${esc(pctTxt(p.juros))} a.m.)` : ''}</div></div>`);
                    }
                    return oShow.apply(this, a);
                };
                w.__dpc = true; Confirm.show = w;
            }
        } catch (e) { }
        // Grava a venda e transforma a conta do fiado nas parcelas do crediário.
        const oCreate = SalesService.create;
        SalesService.create = async function (data) {
            const p = plan;
            if (!p || !active() || !data || !Array.isArray(data.payments) || !data.payments.some(x => x.method === 'fiado' && x.crediario)) return oCreate.apply(this, arguments);
            if (!data.customerId) throw new Error('Venda no crediário precisa de cliente cadastrado.');
            data.crediario = { entrada: p.entrada, entradaMetodo: p.entrada > 0 ? p.entradaMetodo : '', parcelas: p.n, juros: p.juros, intervalo: p.intervalo, financiado: p.principal, totalParcelado: p.totalParcelado, valorParcela: p.parcelas[0].valor, primeiroVencimento: ymd(p.first), vencimentos: p.parcelas.map(x => ({ n: x.n, vencimento: ymd(x.due), valor: x.valor })), autorizadoPor: p.authorizedBy || '' };
            data.paymentLabel = 'Crediário ' + p.n + 'x';
            const r = await oCreate.apply(this, arguments);
            try { await makeInstallments(r.id, r.saleNumber, data, p); }
            catch (e) { console.error('Crediário:', e); say('error', 'A venda foi registrada, mas as parcelas não foram geradas (' + e.message + '). Confira em Contas a Receber.'); }
            data.crediario.carne = 'V-' + pad(r.saleNumber);
            setTimeout(resetPayment, 0);
            return r;
        };
        async function makeInstallments(saleId, saleNumber, data, p) {
            const carne = 'V-' + pad(saleNumber);
            const c = G.customers().find(x => String(x.id) === String(data.customerId)) || {};
            const found = (await list('financial_entries', [['referenceId', '==', saleId]])).find(e => e.type === 'income' && !e.deleted && e.status === 'pending' && !e.crediario);
            const common = { type: 'income', category: CAT, status: 'pending', referenceType: 'sale', referenceId: saleId, customerId: data.customerId, customerName: data.customerName || c.name || '', debtorPhone: c.whatsapp || c.phone || '', debtorDoc: c.document || '', debtorAddress: [c.address, c.city, c.state].filter(Boolean).join(', '), notes: '' };
            const docs = p.parcelas.map(x => ({ ...common, amount: x.valor, dueDate: TS(x.due), description: `Crediário ${carne} · Parcela ${x.n}/${p.n}`, installment: { number: x.n, total: p.n }, crediario: { saleId, saleNumber, carne, parcela: x.n, parcelas: p.n, juros: p.juros } }));
            const col = db.collection('financial_entries'), batch = db.batch();
            if (found) batch.update(col.doc(found.id), { ...docs[0], deleted: false, updatedAt: now() });
            else batch.set(col.doc(), { ...docs[0], ...stamp() });
            docs.slice(1).forEach(d => batch.set(col.doc(), { ...d, ...stamp() }));
            await batch.commit();
        }
        // Cupom: troca "Fiado" por "Crediário" e imprime as parcelas.
        const oPrint = window.printReceipt;
        if (typeof oPrint === 'function') window.printReceipt = function (sale) {
            if (!sale || !sale.crediario) return oPrint.apply(this, arguments);
            const realOpen = window.open; let w = null;
            window.open = function () { w = realOpen.apply(window, arguments); return w; };
            let r;
            try { r = oPrint.apply(this, arguments); } finally { window.open = realOpen; }
            try { if (w && w.document && w.document.body) receiptBlock(w.document, sale); } catch (e) { console.warn('Crediário no cupom:', e); }
            return r;
        };
        function receiptBlock(doc, sale) {
            const c = sale.crediario || {};
            doc.querySelectorAll('td').forEach(td => { if (td.textContent.trim() === 'Fiado') td.textContent = `Crediário ${c.parcelas || ''}x`; });
            const venc = (c.vencimentos || []).map(v => `<tr><td style="font-size:11px">${v.n}/${c.parcelas} · ${esc(br(fromYmd(v.vencimento)))}</td><td style="font-size:11px;text-align:right">${esc(money(v.valor))}</td></tr>`).join('');
            const html = `<div style="border-top:1px dashed #000;margin:6px 0"></div><div style="text-align:center;font-size:12px">CREDIÁRIO · CARNÊ ${esc(c.carne || ('V-' + pad(sale.saleNumber)))}</div>
${c.entrada > 0 ? `<div style="font-size:11px">Entrada: ${esc(money(c.entrada))} (${esc(methodName(c.entradaMetodo))})</div>` : ''}<table style="width:100%;border-collapse:collapse">${venc}</table>
<div style="font-size:11px">Total a prazo: ${esc(money(r2(Number(c.totalParcelado || 0) + Number(c.entrada || 0))))}${c.juros ? ` · juros ${esc(pctTxt(c.juros))} a.m.` : ''}</div>
<div style="font-size:11px;margin-top:14px">Ass. do cliente: ____________________</div>`;
            const tables = doc.querySelectorAll('table'), last = [...tables].find(t => /TOTAL/.test(t.textContent));
            const div = doc.createElement('div'); div.innerHTML = html;
            if (last && last.parentNode) last.parentNode.insertBefore(div, last.nextSibling); else doc.body.appendChild(div);
        }
        // Depois da venda: oferece o carnê.
        const oHpa = window.handlePrintAfterSale;
        if (typeof oHpa === 'function') window.handlePrintAfterSale = async function (sale) {
            const r = await oHpa.apply(this, arguments);
            try { if (sale && sale.crediario && sale.id) offerCarne(sale); } catch (e) { }
            return r;
        };
        function offerCarne(sale) {
            let printed = false;
            const html = `<div id="dpcCarneOffer" style="margin-top:14px;padding:12px;border-radius:12px;border:1px dashed var(--accent);text-align:center"><div style="font-size:13px;font-weight:700;margin-bottom:8px"><i class="fas fa-calendar-check" style="color:var(--accent)"></i> Carnê do crediário (${sale.crediario.parcelas}x)</div>
<div style="display:flex;gap:8px;justify-content:center;flex-wrap:wrap"><button type="button" class="dpc-bt sm" data-f="a4"><i class="fas fa-file-lines"></i> Carnê A4</button><button type="button" class="dpc-bt sm" data-f="80"><i class="fas fa-receipt"></i> Carnê 80 mm</button></div></div>`;
            const bind = el => el && el.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { printed = true; printCarne(sale.id, b.dataset.f); } });
            const alone = () => {
                const ov = dialog(head('fa-calendar-check', `Venda #V-${pad(sale.saleNumber)} no crediário`, 'Imprima o carnê para entregar ao cliente') + `<div class="dpc-b" style="text-align:center">${html}</div><div class="dpc-f"><button type="button" class="dpc-bt pri" data-x>Fechar</button></div>`);
                bind(ov.querySelector('#dpcCarneOffer'));
            };
            const prompt = document.getElementById('printPromptOverlay');
            if (prompt && prompt.querySelector('.modal-body')) {
                prompt.querySelector('.modal-body').insertAdjacentHTML('beforeend', html); bind(prompt.querySelector('#dpcCarneOffer'));
                // Se fecharem a pergunta do cupom sem imprimir o carnê, o carnê continua oferecido.
                const mo = new MutationObserver(() => { if (!prompt.isConnected) { mo.disconnect(); if (!printed) alone(); } });
                mo.observe(document.body, { childList: true });
                return;
            }
            alone();
        }
    }

    /* =====================================================================
       CONTAS A RECEBER
       ===================================================================== */
    function refreshReceber() { try { if (typeof window.initPageContasReceber === 'function') window.initPageContasReceber(); } catch (e) { } loadPanel(); }
    let PANEL = { tab: 'carnes', q: '', data: [] };
    function initReceber() {
        // A página antiga pega "a primeira tabela" (document.querySelector('tbody')) no início do carregamento.
        // Enquanto ela inicia, o painel do crediário sai da página por um instante para não ser confundido com a lista.
        const oInit = window.initPageContasReceber;
        if (typeof oInit === 'function' && !oInit.__dpc) {
            const w = function () {
                const p = document.getElementById('dpcPanel'), parent = p && p.parentNode, next = p && p.nextSibling;
                if (p) p.remove();
                try { return oInit.apply(this, arguments); }
                finally { if (p && parent) parent.insertBefore(p, next && next.parentNode === parent ? next : null); }
            };
            w.__dpc = true; window.initPageContasReceber = w;
        }
        hook('receiveIt', () => id => openReceive({ entryIds: [id], onDone: refreshReceber, keyFromId: id }).then(() => { }));
        // Categorias que o PDV usa (o filtro tinha "Fiado", mas o fiado do PDV grava "Vendas Fiado").
        const addOpt = (sel, vals) => { const s = document.getElementById(sel); if (!s) return; vals.forEach(v => { if (![...s.options].some(o => o.value === v)) s.add(new Option(v, v), 2); }); };
        addOpt('recFilterCat', ['Vendas Fiado', CAT]); addOpt('rec_categoria', ['Vendas Fiado', CAT]);
        const pc = document.querySelector('.page-content'), grid = pc && pc.querySelector('.stat-grid');
        if (!pc || document.getElementById('dpcPanel')) return;
        const el = document.createElement('div'); el.id = 'dpcPanel'; el.className = 'dpc-panel';
        el.innerHTML = `<div class="dpc-ph"><div><h3><i class="fas fa-calendar-check"></i>Crediário</h3><p>Vendas parceladas no carnê: parcelas, atrasos, recebimentos e cobrança</p></div>
<div class="dpc-pa"><button type="button" class="dpc-bt ok" data-a="receber"><i class="fas fa-hand-holding-dollar"></i> Receber parcelas</button><button type="button" class="dpc-bt" data-a="prev"><i class="fas fa-chart-line"></i> Previsão 30 dias</button><button type="button" class="dpc-bt" data-a="cfg"><i class="fas fa-gear"></i> Regras</button></div></div>
<div class="dpc-cards" id="dpcCards"><div class="dpc-card"><b>—</b><span>Carteira do crediário</span></div><div class="dpc-card red"><b>—</b><span>Vencidas</span></div><div class="dpc-card"><b>—</b><span>Vence nos próximos 7 dias</span></div><div class="dpc-card green"><b>—</b><span>Recebido no mês</span></div></div>
<div class="dpc-tabs"><button type="button" data-t="carnes" class="on">Carnês</button><button type="button" data-t="clientes">Por cliente</button><button type="button" data-t="vencidas">Vencidas</button><input class="dpc-in" id="dpcQ" placeholder="Buscar cliente ou carnê"></div>
<div class="dpc-pt" id="dpcPT"><div class="dpc-empty"><i class="fas fa-spinner fa-spin"></i> Carregando…</div></div>`;
        if (grid) pc.insertBefore(el, grid); else pc.prepend(el);
        el.addEventListener('click', e => {
            const a = e.target.closest('[data-a]'), t = e.target.closest('[data-t]'), r = e.target.closest('[data-r]');
            if (a) { if (a.dataset.a === 'receber') openReceive({ onDone: refreshReceber }); if (a.dataset.a === 'prev') openForecast(); if (a.dataset.a === 'cfg') openConfig(loadPanel); }
            if (t) { PANEL.tab = t.dataset.t; el.querySelectorAll('.dpc-tabs button').forEach(b => b.classList.toggle('on', b === t)); drawPanel(); }
            if (r) rowAction(r.dataset.r, r.dataset.v);
        });
        el.querySelector('#dpcQ').addEventListener('input', e => { PANEL.q = e.target.value.trim().toLowerCase(); drawPanel(); });
        loadPanel();
    }
    async function loadPanel() {
        const host = document.getElementById('dpcPanel'); if (!host) return;
        await Promise.all([cfg(), ensureCustomers(true)]);
        let all = [];
        try { all = (await list('financial_entries', [['type', '==', 'income']])).filter(e => !e.deleted); }
        catch (e) { document.getElementById('dpcPT').innerHTML = `<div class="dpc-empty">Não foi possível carregar: ${esc(e.message)}</div>`; return; }
        if (await cancelOrphans(all)) { refreshReceber(); return; }
        PANEL.data = all;
        const cred = all.filter(isCred), open = cred.filter(isOpen), t0 = sod(new Date()), t7 = addDays(t0, 7), m0 = new Date(t0.getFullYear(), t0.getMonth(), 1);
        const late = open.filter(e => dueOf(e) && sod(dueOf(e)) < t0), soon = open.filter(e => dueOf(e) && sod(dueOf(e)) >= t0 && sod(dueOf(e)) <= t7);
        const got = cred.filter(e => e.status === 'received' && paidOf(e) && paidOf(e) >= m0);
        const cards = document.getElementById('dpcCards');
        if (cards) cards.innerHTML = `<div class="dpc-card"><b>${esc(money(sum(open, e => e.amount)))}</b><span>Carteira do crediário · ${open.length} parcela${open.length !== 1 ? 's' : ''}</span></div><div class="dpc-card red"><b>${esc(money(sum(late, e => e.amount)))}</b><span>Vencidas · ${late.length}</span></div><div class="dpc-card"><b>${esc(money(sum(soon, e => e.amount)))}</b><span>Vence nos próximos 7 dias · ${soon.length}</span></div><div class="dpc-card green"><b>${esc(money(sum(got, e => e.amount)))}</b><span>Recebido no mês · ${got.length}</span></div>`;
        drawPanel();
    }
    // Venda cancelada não deixa parcelas (nem fiado) em aberto.
    async function cancelOrphans(all) {
        const pend = all.filter(e => isOpen(e) && e.referenceType === 'sale' && e.referenceId && (isCred(e) || e.category === 'Vendas Fiado'));
        const ids = [...new Set(pend.map(e => e.referenceId))];
        if (!ids.length) return false;
        const sales = await Promise.all(ids.map(id => getDoc('sales', id).catch(() => null)));
        const dead = new Set(ids.filter((id, i) => sales[i] && sales[i].status === 'cancelled'));
        const kill = pend.filter(e => dead.has(e.referenceId));
        if (!kill.length) return false;
        const batch = db.batch();
        kill.forEach(e => batch.update(db.collection('financial_entries').doc(e.id), { status: 'cancelled', deleted: true, cancelReason: 'Venda cancelada', updatedAt: now() }));
        await batch.commit();
        say('info', `${kill.length} conta${kill.length > 1 ? 's' : ''} de venda${dead.size > 1 ? 's' : ''} cancelada${dead.size > 1 ? 's' : ''} saíram do contas a receber.`);
        return true;
    }
    function carnes(all) {
        const m = new Map();
        all.filter(isCred).forEach(e => {
            const k = (e.crediario && e.crediario.saleId) || e.referenceId || e.id;
            const g = m.get(k) || { saleId: k, carne: carneTxt(e) || '—', name: who(e), phone: phoneOf(e), key: groupKey(e), entries: [] };
            g.entries.push(e); m.set(k, g);
        });
        return [...m.values()].map(g => {
            const open = g.entries.filter(isOpen), total = Math.max(...g.entries.map(e => e.crediario?.parcelas || e.installment?.total || 1));
            const openN = new Set(open.map(e => e.crediario?.parcela || e.id)).size, next = open.map(dueOf).filter(Boolean).sort((a, b) => a - b)[0] || null;
            const lateN = open.filter(e => dueOf(e) && daysLate(dueOf(e)) > 0).length;
            return { ...g, open, total, paid: Math.max(0, total - openN), saldo: sum(open, e => e.amount), next, lateN };
        }).sort((a, b) => (b.lateN - a.lateN) || ((a.next || 9e15) - (b.next || 9e15)));
    }
    function drawPanel() {
        const host = document.getElementById('dpcPT'); if (!host) return;
        const all = PANEL.data, q = PANEL.q;
        const match = s => !q || String(s || '').toLowerCase().includes(q);
        let html = '';
        if (PANEL.tab === 'carnes') {
            const rows = carnes(all).filter(g => match(g.name) || match(g.carne));
            html = rows.length ? `<table class="dpc-t"><thead><tr><th>Cliente</th><th>Carnê</th><th>Parcelas</th><th>Próximo vencimento</th><th class="r">Saldo</th><th>Situação</th><th class="r">Ações</th></tr></thead><tbody>${rows.slice(0, 300).map(g => `<tr class="${g.lateN ? 'late' : g.open.length ? '' : 'done'}"><td><b>${esc(g.name)}</b></td><td>${esc(g.carne)}</td><td><div style="display:flex;align-items:center;gap:8px"><div class="dpc-bar"><i style="width:${Math.round(100 * g.paid / Math.max(1, g.total))}%"></i></div><span class="dpc-mini">${g.paid}/${g.total}</span></div></td><td>${esc(br(g.next))}</td><td class="r"><b>${esc(money(g.saldo))}</b></td><td>${g.lateN ? `<span class="dpc-st late">${g.lateN} vencida${g.lateN > 1 ? 's' : ''}</span>` : g.open.length ? '<span class="dpc-st wait">Em dia</span>' : '<span class="dpc-st ok">Quitado</span>'}</td>
<td class="r"><button type="button" class="dpc-bt sm" data-r="ver" data-v="${esc(g.saleId)}">Ver</button> <button type="button" class="dpc-bt sm" data-r="carne" data-v="${esc(g.saleId)}" title="Imprimir carnê"><i class="fas fa-print"></i></button>${g.open.length ? ` <button type="button" class="dpc-bt sm wa" data-r="wa-carne" data-v="${esc(g.saleId)}" title="Cobrar no WhatsApp"><i class="fab fa-whatsapp"></i></button>` : ''}</td></tr>`).join('')}</tbody></table>`
                : `<div class="dpc-empty">${all.some(isCred) ? 'Nenhum carnê encontrado.' : 'Nenhuma venda no crediário ainda. No PDV, escolha a forma de pagamento <b>Crediário</b>.'}</div>`;
        } else if (PANEL.tab === 'clientes') {
            const m = new Map();
            all.filter(isOpen).forEach(e => { const k = groupKey(e); const g = m.get(k) || { key: k, name: who(e), phone: phoneOf(e), n: 0, saldo: 0, late: 0, lateV: 0, next: null, entries: [] }; g.n++; g.saldo = r2(g.saldo + Number(e.amount || 0)); g.entries.push(e); const d = dueOf(e); if (d && daysLate(d) > 0) { g.late++; g.lateV = r2(g.lateV + Number(e.amount || 0)); } if (d && (!g.next || d < g.next)) g.next = d; m.set(k, g); });
            const rows = [...m.values()].filter(g => match(g.name)).sort((a, b) => (b.lateV - a.lateV) || (b.saldo - a.saldo));
            PANEL.groups = m;
            html = rows.length ? `<table class="dpc-t"><thead><tr><th>Cliente</th><th>Em aberto</th><th>Vencidas</th><th>Próximo vencimento</th><th class="r">Saldo</th><th class="r">Ações</th></tr></thead><tbody>${rows.slice(0, 300).map(g => `<tr class="${g.late ? 'late' : ''}"><td><b>${esc(g.name)}</b>${g.phone ? `<div class="dpc-mini">${esc(g.phone)}</div>` : ''}</td><td>${g.n}</td><td>${g.late ? `<span class="dpc-st late">${g.late} · ${esc(money(g.lateV))}</span>` : '—'}</td><td>${esc(br(g.next))}</td><td class="r"><b>${esc(money(g.saldo))}</b></td>
<td class="r"><button type="button" class="dpc-bt sm ok" data-r="receber" data-v="${esc(g.key)}">Receber</button> <button type="button" class="dpc-bt sm" data-r="extrato" data-v="${esc(g.key)}" title="Extrato"><i class="fas fa-print"></i></button> <button type="button" class="dpc-bt sm wa" data-r="wa-cli" data-v="${esc(g.key)}" title="Cobrar no WhatsApp"><i class="fab fa-whatsapp"></i></button></td></tr>`).join('')}</tbody></table>` : '<div class="dpc-empty">Nenhum cliente com conta em aberto.</div>';
        } else {
            const rows = all.filter(e => isOpen(e) && dueOf(e) && daysLate(dueOf(e)) > 0 && (match(who(e)) || match(e.description))).sort(byDue);
            html = rows.length ? `<table class="dpc-t"><thead><tr><th>Cliente</th><th>Conta</th><th>Vencimento</th><th class="r">Valor</th><th class="r">Hoje (com multa e juros)</th><th class="r">Ações</th></tr></thead><tbody>${rows.slice(0, 400).map(e => { const c = charges(e); return `<tr class="late"><td><b>${esc(who(e))}</b></td><td>${esc(e.description || e.category || '')}</td><td>${esc(br(dueOf(e)))}<div class="dpc-mini" style="color:#dc2626">${c.late} dia${c.late > 1 ? 's' : ''}</div></td><td class="r">${esc(money(e.amount))}</td><td class="r"><b>${esc(money(r2(Number(e.amount) + c.multa + c.juros)))}</b></td><td class="r"><button type="button" class="dpc-bt sm ok" data-r="receber-id" data-v="${esc(e.id)}">Receber</button> <button type="button" class="dpc-bt sm wa" data-r="wa-id" data-v="${esc(e.id)}" title="Cobrar no WhatsApp"><i class="fab fa-whatsapp"></i></button></td></tr>`; }).join('')}</tbody></table>` : '<div class="dpc-empty">Nenhuma conta vencida.</div>';
        }
        host.innerHTML = html;
    }
    function rowAction(kind, v) {
        const all = PANEL.data;
        if (kind === 'carne') return chooseFormat(f => printCarne(v, f));
        if (kind === 'ver') return openCarne(v);
        if (kind === 'wa-carne') { const g = carnes(all).find(x => x.saleId === v); if (g) waCharge({ saleId: v }, g.name, g.phone); return; }
        if (kind === 'receber') return openReceive({ key: v, onDone: refreshReceber });
        if (kind === 'receber-id') return openReceive({ entryIds: [v], keyFromId: v, onDone: refreshReceber });
        if (kind === 'extrato') { const e = all.find(x => groupKey(x) === v); return printStatement(v, e ? who(e) : ''); }
        if (kind === 'wa-cli') { const es = all.filter(x => groupKey(x) === v); if (es.length) waCharge({ key: v }, who(es[0]), phoneOf(es[0])); return; }
        if (kind === 'wa-id') { const e = all.find(x => x.id === v); if (e) waCharge({ id: v }, who(e), phoneOf(e)); }
    }
    function chooseFormat(cb) {
        const ov = dialog(head('fa-print', 'Imprimir carnê', 'Escolha o formato') + `<div class="dpc-b" style="display:flex;gap:10px;justify-content:center;flex-wrap:wrap"><button type="button" class="dpc-bt pri" data-f="a4"><i class="fas fa-file-lines"></i> A4 (folha comum, com canhoto)</button><button type="button" class="dpc-bt" data-f="80"><i class="fas fa-receipt"></i> Impressora térmica 80 mm</button></div>`);
        ov.addEventListener('click', e => { const b = e.target.closest('[data-f]'); if (b) { closeDlg(); cb(b.dataset.f); } });
    }
    async function openCarne(saleId) {
        const ov = dialog(head('fa-calendar-check', 'Carnê', 'Parcelas desta venda') + '<div id="dpcCV"><div class="dpc-empty"><i class="fas fa-spinner fa-spin"></i> Carregando…</div></div>', { wide: true });
        const { sale, parc } = await carneData(saleId);
        const box = ov.querySelector('#dpcCV'); if (!box) return;
        if (!parc.length) { box.innerHTML = '<div class="dpc-empty">Sem parcelas.</div>'; return; }
        const f = parc[0], c = sale && sale.crediario || {}, open = parc.filter(isOpen);
        box.innerHTML = `<div class="dpc-b"><div class="dpc-chips"><span class="dpc-chip"><b>${esc(who(f))}</b></span><span class="dpc-chip">Carnê ${esc(carneTxt(f) || '—')}</span>${sale ? `<span class="dpc-chip">Venda ${esc(money(sale.total))} em ${esc(br(toDate(sale.createdAt)))}</span>` : ''}${c.entrada > 0 ? `<span class="dpc-chip">Entrada ${esc(money(c.entrada))}</span>` : ''}${c.juros ? `<span class="dpc-chip">Juros ${esc(pctTxt(c.juros))} a.m.</span>` : ''}<span class="dpc-chip ${open.length ? '' : 'green'}">Saldo ${esc(money(sum(open, e => e.amount)))}</span></div>
<div class="dpc-scroll" style="max-height:360px"><table class="dpc-t"><thead><tr><th style="width:28px"></th><th>Parcela</th><th>Vencimento</th><th class="r">Valor</th><th>Situação</th></tr></thead><tbody>${parc.map(e => `<tr class="${isOpen(e) && dueOf(e) && daysLate(dueOf(e)) > 0 ? 'late' : e.status === 'received' ? 'done' : ''}"><td>${isOpen(e) ? `<input type="checkbox" data-id="${esc(e.id)}"${dueOf(e) && daysLate(dueOf(e)) >= 0 ? ' checked' : ''}>` : ''}</td><td>${esc(parcelaTxt(e))}${/\(saldo\)$/.test(e.description || '') ? ' <span class="dpc-mini">(saldo)</span>' : ''}${e.partial ? ' <span class="dpc-mini">(parcial)</span>' : ''}</td><td>${esc(br(dueOf(e)))}</td><td class="r">${esc(money(e.amount))}${e.status === 'received' && e.originalAmount != null && Math.abs(e.originalAmount - e.amount) > 0.004 ? `<div class="dpc-mini">parcela ${esc(money(e.originalAmount))}</div>` : ''}</td><td>${statusTag(e)}${e.status === 'received' && e.receivedMethod ? ` <span class="dpc-mini">${esc(methodName(e.receivedMethod))}</span>` : ''}</td></tr>`).join('')}</tbody></table></div></div>
<div class="dpc-f"><button type="button" class="dpc-bt" id="dpcCVa4"><i class="fas fa-print"></i> Carnê A4</button><button type="button" class="dpc-bt" id="dpcCV80"><i class="fas fa-receipt"></i> Carnê 80 mm</button>${open.length ? '<button type="button" class="dpc-bt wa" id="dpcCVwa"><i class="fab fa-whatsapp"></i> Cobrar</button><button type="button" class="dpc-bt ok" id="dpcCVr"><i class="fas fa-hand-holding-dollar"></i> Receber marcadas</button>' : ''}</div>`;
        box.querySelector('#dpcCVa4').addEventListener('click', () => printCarne(saleId, 'a4'));
        box.querySelector('#dpcCV80').addEventListener('click', () => printCarne(saleId, '80'));
        box.querySelector('#dpcCVwa')?.addEventListener('click', () => waCharge({ saleId }, who(f), phoneOf(f)));
        box.querySelector('#dpcCVr')?.addEventListener('click', () => {
            const ids = [...box.querySelectorAll('input[data-id]:checked')].map(i => i.dataset.id);
            if (!ids.length) { say('warning', 'Marque as parcelas que o cliente está pagando.'); return; }
            openReceive({ key: groupKey(f), label: who(f), entryIds: ids, onDone: refreshReceber });
        });
    }

    /* =====================================================================
       CONTAS A PAGAR
       ===================================================================== */
    function refreshPagar() { try { if (typeof initPageContasPagar === 'function') initPageContasPagar(); } catch (e) { } loadPayBar(); }
    function initPagar() {
        let editing = null;
        hook('openNewBill', get => function () { editing = null; const r = get() && get().apply(this, arguments); const s = document.getElementById('dpcBillN'); if (s) s.value = '1'; return r; });
        hook('editBill', get => function (id) { editing = id; const r = get() && get().apply(this, arguments); const s = document.getElementById('dpcBillN'); if (s) s.value = '1'; return r; });
        hook('payBill', () => id => openPay(id));
        hook('saveBill', get => async function () {
            const n = Number(document.getElementById('dpcBillN')?.value || 1);
            if (editing || !(n > 1)) return get() && get().apply(this, arguments);
            return saveBillInstallments(n);
        });
        // Campo "Parcelar em" no cadastro da conta
        const rec = document.getElementById('billRecurrence');
        if (rec && !document.getElementById('dpcBillN')) {
            const wrap = rec.closest('.form-group') || rec.parentElement;
            const g = document.createElement('div'); g.className = wrap ? wrap.className : 'form-group';
            g.innerHTML = `<label class="${(wrap && wrap.querySelector('label') && wrap.querySelector('label').className) || 'form-label'}">Parcelar em</label><select id="dpcBillN" class="${rec.className}">${Array.from({ length: 24 }, (_, i) => `<option value="${i + 1}">${i === 0 ? 'Não parcelar' : (i + 1) + 'x (valor acima é o total)'}</option>`).join('')}</select>`;
            if (wrap && wrap.parentNode) wrap.parentNode.insertBefore(g, wrap.nextSibling);
        }
        const pc = document.querySelector('.page-content'), grid = pc && pc.querySelector('.stat-grid');
        if (pc && !document.getElementById('dpcPayBar')) {
            const el = document.createElement('div'); el.id = 'dpcPayBar'; el.className = 'dpc-panel';
            el.innerHTML = `<div class="dpc-ph"><div><h3><i class="fas fa-chart-line"></i>Próximos 30 dias</h3><p id="dpcPBTxt">Calculando…</p></div><div class="dpc-pa"><button type="button" class="dpc-bt" id="dpcPBPrev"><i class="fas fa-chart-line"></i> Previsão semana a semana</button></div></div>`;
            if (grid) pc.insertBefore(el, grid); else pc.prepend(el);
            el.querySelector('#dpcPBPrev').addEventListener('click', openForecast);
            loadPayBar();
        }
    }
    async function loadPayBar() {
        const t = document.getElementById('dpcPBTxt'); if (!t) return;
        try {
            const all = (await list('financial_entries')).filter(e => !e.deleted && e.status === 'pending');
            const t0 = sod(new Date()), t30 = addDays(t0, 29), inR = e => dueOf(e) && sod(dueOf(e)) >= t0 && sod(dueOf(e)) <= t30;
            const pay = sum(all.filter(e => e.type === 'expense' && inR(e)), e => e.amount), rec = sum(all.filter(e => e.type === 'income' && inR(e)), e => e.amount), cred = sum(all.filter(e => e.type === 'income' && isCred(e) && inR(e)), e => e.amount);
            const lateOut = sum(all.filter(e => e.type === 'expense' && dueOf(e) && sod(dueOf(e)) < t0), e => e.amount), s = r2(rec - pay);
            t.innerHTML = `A pagar <b style="color:#ef4444">${esc(money(pay))}</b> · a receber <b style="color:#10b981">${esc(money(rec))}</b> (crediário ${esc(money(cred))}) · saldo previsto <b class="${s >= 0 ? 'dpc-pos' : 'dpc-neg'}">${esc(money(s))}</b>${lateOut > 0 ? ` · <span style="color:#ef4444">vencido sem pagar: ${esc(money(lateOut))}</span>` : ''}`;
        } catch (e) { t.textContent = 'Não foi possível calcular a previsão.'; }
    }
    async function saveBillInstallments(n) {
        const g = id => document.getElementById(id);
        const desc = (g('billDesc')?.value || '').trim(), amount = num(g('billAmount')?.value), dueStr = g('billDue')?.value || '';
        if (!desc) { say('warning', 'Informe a descrição'); return; }
        if (!dueStr) { say('warning', 'Informe o vencimento'); return; }
        if (!(amount > 0)) { say('warning', 'Informe o valor'); return; }
        const first = fromYmd(dueStr), sup = g('billSupplier'), supplierId = sup?.value || '';
        const supplierName = supplierId ? (sup.selectedOptions[0]?.dataset?.name || sup.selectedOptions[0]?.text || '') : '';
        const each = Math.floor(amount / n * 100) / 100, gid = 'PARC-' + Date.now().toString(36).toUpperCase();
        const batch = db.batch(), col = db.collection('financial_entries');
        for (let k = 0; k < n; k++) {
            const v = k < n - 1 ? each : r2(amount - each * (n - 1));
            batch.set(col.doc(), { ...stamp(), type: 'expense', description: `${desc} (${k + 1}/${n})`, category: g('billCat')?.value || '', amount: v, dueDate: TS(addMonths(first, k)), status: 'pending', notes: g('billNotes')?.value || '', paymentMethod: g('billPayMethod')?.value || '', recurrence: '', supplierId, supplierName, installment: { number: k + 1, total: n }, installmentGroup: gid });
        }
        try { await batch.commit(); say('success', `${n} parcelas cadastradas (${money(each)} por mês).`); if (typeof closeModal === 'function') closeModal('modalConta'); refreshPagar(); }
        catch (e) { say('error', 'Erro ao salvar: ' + e.message); }
    }
    async function openPay(id) {
        const b = await getDoc('financial_entries', id).catch(() => null);
        if (!b) { say('error', 'Conta não encontrada.'); return; }
        const cash = await openCash(), due = dueOf(b), late = due ? Math.max(0, daysLate(due)) : 0;
        const methods = ['Boleto', 'PIX', 'Transferência', 'Dinheiro', 'Cartão'];
        if (b.paymentMethod && !methods.includes(b.paymentMethod)) methods.unshift(b.paymentMethod);
        const ov = dialog(head('fa-file-invoice-dollar', 'Pagar conta', esc(b.description || 'Conta')) + `<div class="dpc-b">
<div class="dpc-chips">${b.supplierName ? `<span class="dpc-chip">${esc(b.supplierName)}</span>` : ''}<span class="dpc-chip">Vencimento ${esc(br(due))}</span>${late > 0 ? `<span class="dpc-chip red">${late} dia${late > 1 ? 's' : ''} de atraso</span>` : ''}<span class="dpc-chip">Valor ${esc(money(b.amount))}</span>${b.recurrence ? `<span class="dpc-chip">Repete: ${esc({ monthly: 'mensal', weekly: 'semanal', biweekly: 'quinzenal' }[b.recurrence] || b.recurrence)}</span>` : ''}</div>
<div class="dpc-g3" style="margin-top:12px"><label class="dpc-l">Data do pagamento<input type="date" class="dpc-in" id="dpcBD" value="${ymd(new Date())}"></label><label class="dpc-l">Juros / multa (R$)<input class="dpc-in" id="dpcBJ" inputmode="decimal" value="0,00"></label><label class="dpc-l">Desconto (R$)<input class="dpc-in" id="dpcBDs" inputmode="decimal" value="0,00"></label></div>
<div class="dpc-g" style="margin-top:10px"><label class="dpc-l">Forma de pagamento<select class="dpc-in" id="dpcBM">${methods.map(m => `<option${m === (b.paymentMethod || 'Boleto') ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
<div><label class="dpc-chk" id="dpcBCxW"><input type="checkbox" id="dpcBCx"${cash ? '' : ' disabled'}> ${cash ? 'Tirar o dinheiro do caixa aberto (sangria)' : 'Nenhum caixa aberto'}</label></div></div>
<div class="dpc-sum" id="dpcBS"></div>${b.recurrence ? '<p class="dpc-mini" style="margin-top:8px">Ao pagar, a próxima conta desta repetição é criada sozinha.</p>' : ''}</div>
<div class="dpc-f"><button type="button" class="dpc-bt" data-x>Cancelar</button><button type="button" class="dpc-bt ok" id="dpcBGo"><i class="fas fa-check"></i> Confirmar pagamento</button></div>`);
        const $ = i => ov.querySelector('#' + i);
        const total = () => r2(Number(b.amount || 0) + num($('dpcBJ').value) - num($('dpcBDs').value));
        const draw = () => { $('dpcBCxW').style.display = $('dpcBM').value === 'Dinheiro' ? '' : 'none'; $('dpcBS').innerHTML = `<span>Valor ${esc(money(b.amount))}</span>${num($('dpcBJ').value) > 0 ? `<span>+ juros/multa ${esc(money(num($('dpcBJ').value)))}</span>` : ''}${num($('dpcBDs').value) > 0 ? `<span>- desconto ${esc(money(num($('dpcBDs').value)))}</span>` : ''}<span style="margin-left:auto">Total pago: <b class="big" style="color:#ef4444">${esc(money(total()))}</b></span>`; };
        ['dpcBJ', 'dpcBDs'].forEach(i => { $(i).addEventListener('input', draw); $(i).addEventListener('blur', () => { $(i).value = fmtIn(num($(i).value)); draw(); }); });
        $('dpcBM').addEventListener('change', draw); draw();
        $('dpcBGo').addEventListener('click', async ev => {
            const at = fromYmd($('dpcBD').value); if (!at) { say('warning', 'Informe a data do pagamento.'); return; }
            if (sod(at) > sod(new Date())) { say('warning', 'A data do pagamento não pode ser no futuro.'); return; }
            const t = total(); if (!(t > 0)) { say('warning', 'O total pago precisa ser maior que zero.'); return; }
            const btn = ev.currentTarget; btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registrando…';
            try {
                const today = ymd(at) === ymd(new Date()), withdraw = cash && $('dpcBM').value === 'Dinheiro' && $('dpcBCx').checked;
                await db.collection('financial_entries').doc(id).update({ status: 'paid', paidAt: today ? now() : TS(at), originalAmount: b.originalAmount != null ? b.originalAmount : Number(b.amount || 0), amount: t, interest: r2(num($('dpcBJ').value)), discount: r2(num($('dpcBDs').value)), paidMethod: $('dpcBM').value, paidBy: uid(), paidByName: userName(), cashRegisterId: withdraw ? cash.id : '', updatedAt: now() });
                if (withdraw) {
                    const descr = 'Pagamento: ' + (b.description || 'conta') + (b.supplierName ? ' · ' + b.supplierName : '');
                    if (typeof CashService !== 'undefined' && CashService && typeof CashService.withdraw === 'function') await CashService.withdraw(cash.id, t, descr);
                    else await db.collection('cash_movements').add({ ...stamp(), cashRegisterId: cash.id, type: 'withdraw', amount: -t, paymentMethod: 'dinheiro', description: descr, referenceId: id, referenceType: 'payable', reversed: false });
                }
                let next = '';
                if (b.recurrence && !b.nextCreated && due) {
                    const nd = b.recurrence === 'weekly' ? addDays(due, 7) : b.recurrence === 'biweekly' ? addDays(due, 14) : addMonths(due, 1);
                    const copy = { type: 'expense', description: b.description || '', category: b.category || '', amount: Number(b.originalAmount != null ? b.originalAmount : b.amount || 0), dueDate: TS(nd), status: 'pending', notes: b.notes || '', paymentMethod: b.paymentMethod || '', recurrence: b.recurrence, supplierId: b.supplierId || '', supplierName: b.supplierName || '', previousId: id };
                    await db.collection('financial_entries').add({ ...copy, ...stamp() });
                    await db.collection('financial_entries').doc(id).update({ nextCreated: true });
                    next = ` A próxima foi criada para ${br(nd)}.`;
                }
                say('success', `Conta paga: ${money(t)}.${withdraw ? ' Saiu do caixa.' : ''}${next}`);
                closeDlg(); refreshPagar();
            } catch (e) { console.error(e); say('error', 'Erro ao pagar: ' + e.message); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar pagamento'; }
        });
    }

    /* =====================================================================
       CLIENTES
       ===================================================================== */
    function initClientes() {
        // O formulário guarda o limite em #clientLimite, mas o "Editar" preenchia um campo que não existe:
        // ao salvar de novo, o limite virava zero.
        const oEdit = window.editClient;
        if (typeof oEdit === 'function' && !oEdit.__dpc) {
            const w = function (id) {
                const r = oEdit.apply(this, arguments);
                try { const c = (typeof allClients !== 'undefined' && Array.isArray(allClients) ? allClients : []).find(x => x.id === id); const el = document.getElementById('clientLimite'); if (c && el) el.value = c.creditLimit || ''; } catch (e) { }
                return r;
            };
            w.__dpc = true; window.editClient = w;
        }
        const oView = window.viewClient;
        if (typeof oView === 'function' && !oView.__dpc) {
            const w = function (id) {
                const r = oView.apply(this, arguments);
                clientBox(id);
                return r;
            };
            w.__dpc = true; window.viewClient = w;
        }
    }
    async function clientBox(id) {
        const body = document.querySelector('#modalDetalhes .modal-body'); if (!body) return;
        body.querySelector('#dpcCliBox')?.remove();
        const box = document.createElement('div'); box.id = 'dpcCliBox'; box.innerHTML = '<div class="dpc-mini"><i class="fas fa-spinner fa-spin"></i> Consultando crediário e contas a receber…</div>';
        body.appendChild(box);
        await cfg();
        let es = [], c = null;
        try { [es, c] = await Promise.all([list('financial_entries', [['customerId', '==', id]]), getDoc('customers', id)]); } catch (e) { box.innerHTML = ''; return; }
        if (!box.isConnected) return;
        const open = es.filter(isOpen).sort(byDue), late = open.filter(e => dueOf(e) && daysLate(dueOf(e)) > 0), lim = Number(c && c.creditLimit || 0), saldo = sum(open, e => e.amount);
        const key = 'c:' + id, name = (c && c.name) || (open[0] && who(open[0])) || 'Cliente';
        box.innerHTML = `<h4 style="margin:0 0 10px;font-size:14px"><i class="fas fa-calendar-check" style="color:var(--accent);margin-right:6px"></i>Crediário e contas a receber</h4>
<div class="dpc-chips"><span class="dpc-chip ${saldo > 0 ? '' : 'green'}">Deve: <b>${esc(money(saldo))}</b></span>${late.length ? `<span class="dpc-chip red">${late.length} vencida${late.length > 1 ? 's' : ''}: ${esc(money(sum(late, e => e.amount)))}</span>` : '<span class="dpc-chip green">Nada vencido</span>'}${lim > 0 ? `<span class="dpc-chip">Limite ${esc(money(lim))} · disponível ${esc(money(Math.max(0, lim - saldo)))}</span>` : '<span class="dpc-chip">Sem limite de crédito</span>'}</div>
${open.length ? `<table class="dpc-t" style="margin-top:10px"><thead><tr><th>Conta</th><th>Vencimento</th><th class="r">Valor</th></tr></thead><tbody>${open.slice(0, 8).map(e => `<tr class="${dueOf(e) && daysLate(dueOf(e)) > 0 ? 'late' : ''}"><td>${esc(e.description || e.category || '')}</td><td>${esc(br(dueOf(e)))}</td><td class="r">${esc(money(e.amount))}</td></tr>`).join('')}</tbody></table>${open.length > 8 ? `<div class="dpc-mini" style="margin-top:6px">+ ${open.length - 8} conta(s)</div>` : ''}
<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px"><button type="button" class="dpc-bt ok sm" id="dpcCliR"><i class="fas fa-hand-holding-dollar"></i> Receber</button><button type="button" class="dpc-bt sm" id="dpcCliE"><i class="fas fa-print"></i> Extrato</button><button type="button" class="dpc-bt sm wa" id="dpcCliW"><i class="fab fa-whatsapp"></i> Cobrar</button></div>` : ''}`;
        box.querySelector('#dpcCliR')?.addEventListener('click', () => { if (typeof closeModal === 'function') closeModal('modalDetalhes'); openReceive({ key, label: name }); });
        box.querySelector('#dpcCliE')?.addEventListener('click', () => printStatement(key, name));
        box.querySelector('#dpcCliW')?.addEventListener('click', () => waCharge({ key }, name, (c && (c.whatsapp || c.phone)) || phoneOf(open[0])));
    }

    /* ---------- início ---------- */
    window.DPCrediario = { openReceive, openForecast, openConfig, printCarne, version: '35.41' };
    const start = () => {
        if (PAGE === 'pdv.html') initPdv();
        else if (PAGE === 'contas-receber.html') initReceber();
        else if (PAGE === 'contas-pagar.html') initPagar();
        else if (PAGE === 'clientes.html') initClientes();
    };
    // O script fica no fim do <body>: a página já está montada e os ganchos entram antes de a página carregar os dados.
    if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
