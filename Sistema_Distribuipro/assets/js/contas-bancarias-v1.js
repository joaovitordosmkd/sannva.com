/* DistribuiPro 37.1 · Contas bancárias (Financeiro › Contas bancárias)
   - Cadastro das contas (banco, carteira digital, maquininha…) com saldo inicial.
   - "Onde cai cada forma de pagamento": Pix, crédito, débito e as formas novas caem na conta escolhida
     (settings/general.contasPorForma). No PDV dá para escolher outra conta na hora da venda.
   - Despesas (Contas a pagar): ao cadastrar e ao dar baixa, escolhe de qual conta saiu.
   - Extrato por conta: vendas (valor líquido das taxas), recebimentos, despesas pagas, transferências e ajustes.
   Coleções: bank_accounts {name, bank, kind, initialBalance, active} · bank_moves {type:'transfer'|'adjust', fromId, toId, accountId, amount, date, description}
   Campos novos: sales.payments[].accountId · financial_entries.accountId */
(function () {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const tsOf = d => (window.DPTimestamp || firebase.firestore.Timestamp).fromDate(d);
    const toD = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const parseMoney = v => { const s = String(v ?? '').trim(); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } };
    const KIND = { corrente: 'Conta corrente', poupanca: 'Poupança', digital: 'Conta digital / carteira', maquininha: 'Maquininha / adquirente', caixa: 'Cofre / dinheiro guardado', outra: 'Outra' };
    const CK = 'dp_bank_accounts';
    let accounts = [], mapping = {};
    try { const c = JSON.parse(localStorage.getItem(CK) || 'null'); if (c) { accounts = c.accounts || []; mapping = c.mapping || {}; } } catch (e) { }

    async function list(col, n, field) {
        if (typeof simpleList === 'function') return simpleList(col, field || 'createdAt', 'desc', n);
        const s = await db.collection(col).limit(n).get(); return s.docs.map(d => ({ id: d.id, ...d.data() }));
    }
    async function load() {
        try {
            const [acc, s] = await Promise.all([list('bank_accounts', 500, 'name'), db.collection('settings').doc('general').get()]);
            accounts = acc.filter(a => !a.deleted).sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
            const g = s.exists ? (s.data() || {}) : {}; mapping = g.contasPorForma && typeof g.contasPorForma === 'object' ? g.contasPorForma : {};
            try { localStorage.setItem(CK, JSON.stringify({ accounts: accounts.map(a => ({ id: a.id, name: a.name, active: a.active })), mapping })); } catch (e) { }
        } catch (e) { console.warn('contas bancárias:', e.message); }
        return accounts;
    }
    const active = () => accounts.filter(a => a.active !== false);
    const accName = id => (accounts.find(a => a.id === id) || {}).name || '';
    // Texto livre das despesas ("PIX", "Cartão", "Boleto"…) → chave da forma de pagamento
    const methodKey = m => { const s = String(m || '').toLowerCase(); if (!s) return ''; if (accounts.length && s.startsWith('pg_')) return s; if (/pix|transfer/.test(s)) return 'pix'; if (/d[ée]bito/.test(s)) return 'debito'; if (/cr[ée]dito|cart/.test(s)) return 'credito'; if (/dinheiro|esp[ée]cie/.test(s)) return 'dinheiro'; if (/boleto/.test(s)) return 'boleto'; return s; };
    const accountFor = method => mapping[methodKey(method)] || mapping[method] || '';
    window.DPAccounts = { load, list: () => accounts, active, accountFor, name: accName };

    /* ---------- modal genérico ---------- */
    function modal(title, body, onOk, okLabel) {
        document.getElementById('cbModal')?.remove();
        const ov = document.createElement('div'); ov.id = 'cbModal'; ov.className = 'modal-overlay active';
        ov.innerHTML = `<div class="modal" style="max-width:520px;width:min(94vw,520px)"><div class="modal-header"><h3>${title}</h3><button class="modal-close" type="button"><i class="fas fa-times"></i></button></div><div class="modal-body">${body}</div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-x>Cancelar</button><button class="btn btn-primary" type="button" data-ok><i class="fas fa-check"></i> ${okLabel || 'Salvar'}</button></div></div>`;
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector('.modal-close').onclick = close; ov.querySelector('[data-x]').onclick = close;
        ov.querySelector('[data-ok]').onclick = async () => { const b = ov.querySelector('[data-ok]'); b.disabled = true; try { if (await onOk(ov) !== false) close(); } finally { if (b.isConnected) b.disabled = false; } };
        setTimeout(() => ov.querySelector('input,select')?.focus(), 60);
        return ov;
    }
    const accOptions = (sel, blank) => (blank ? `<option value="">${blank}</option>` : '') + active().map(a => `<option value="${esc(a.id)}" ${a.id === sel ? 'selected' : ''}>${esc(a.name)}</option>`).join('');

    /* ================= PÁGINA Contas bancárias ================= */
    async function page() {
        const root = document.getElementById('cbRoot'); if (!root) return;
        const st = document.createElement('style');
        st.textContent = `.cb-top{display:flex;flex-wrap:wrap;gap:10px;align-items:center;justify-content:space-between;margin-bottom:16px}.cb-top .cb-acts{display:flex;gap:8px;flex-wrap:wrap}
.cb-total{font-size:13px;color:var(--text-muted)}.cb-total b{display:block;font-size:26px;color:var(--text-heading)}
.cb-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px;margin-bottom:16px}
.cb-card{position:relative;padding:16px;border-radius:14px;border:1px solid var(--border-color);background:var(--bg-card);cursor:pointer;transition:border-color .15s}
.cb-card.on{border-color:var(--accent);box-shadow:0 0 0 2px rgba(99,102,241,.15)}.cb-card.off{opacity:.55}
.cb-card h4{margin:0;font-size:15px;color:var(--text-heading);padding-right:56px}.cb-card small{color:var(--text-muted);font-size:11.5px}
.cb-card .cb-bal{font-size:22px;font-weight:800;margin:10px 0 4px}.cb-card .cb-io{display:flex;gap:12px;font-size:11.5px}
.cb-card .cb-ed{position:absolute;top:12px;right:12px;display:flex;gap:4px}
.cb-map{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}
.cb-map label{display:flex;flex-direction:column;gap:4px;font-size:12px;font-weight:600;color:var(--text-secondary)}
.cb-ext-top{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:10px}.cb-ext-top select,.cb-ext-top input{height:38px}
.cb-in{color:var(--success,#10b981);font-weight:700}.cb-out{color:var(--danger,#ef4444);font-weight:700}
.cb-tag{font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:20px;background:var(--bg-secondary);color:var(--text-secondary)}`;
        document.head.appendChild(st);
        let sel = '', from = '', to = '';
        { const d = new Date(); from = new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10); to = new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10); }
        let moves = [], data = null;

        async function gather() {
            await load();
            const [sales, entries, bm, g] = await Promise.all([list('sales', 8000), list('financial_entries', 8000), list('bank_moves', 4000), db.collection('settings').doc('general').get().then(s => s.exists ? s.data() || {} : {}).catch(() => ({}))]);
            const extras = Array.isArray(g.formasPagamentoExtras) ? g.formasPagamentoExtras : [];
            const lbl = m => ({ pix: 'Pix', credito: 'Crédito', debito: 'Débito', dinheiro: 'Dinheiro', fiado: 'Fiado' }[m] || (extras.find(x => x.id === m) || {}).name || m);
            const out = [];
            sales.filter(s => !s.deleted && ['completed', 'delivered'].includes(s.status)).forEach(s => {
                const d = toD(s.createdAt); if (!d) return;
                const pays = Array.isArray(s.payments) && s.payments.length ? s.payments : [{ method: s.paymentMethod, amount: s.total, feeValue: s.paymentFeeValue, netAmount: s.paymentNetAmount }];
                pays.forEach((p, i) => {
                    if (!p || p.method === 'fiado' || p.method === 'multi') return;
                    const acc = p.accountId || accountFor(p.method); if (!acc) return;
                    const fee = r2(p.feeValue || 0), net = r2(p.netAmount != null ? p.netAmount : Number(p.amount || 0) - fee);
                    out.push({ k: 's:' + s.id + ':' + i, d, acc, v: net, kind: 'Venda', desc: `Venda ${s.saleNumber ? '#V-' + String(s.saleNumber).padStart(4, '0') : ''} · ${lbl(p.method)}${s.customerName ? ' · ' + s.customerName : ''}${fee ? ` (taxa ${money(fee)})` : ''}`, ref: { col: 'sales', id: s.id, idx: i } });
                });
            });
            entries.filter(e => !e.deleted && ((e.type === 'expense' && e.status === 'paid') || (e.type === 'income' && e.status === 'received'))).forEach(e => {
                const d = toD(e.paidAt) || toD(e.receivedAt) || toD(e.dueDate); if (!d) return;
                const acc = e.accountId || accountFor(e.receivedMethod || e.paymentMethod) || '';
                const v = r2(e.type === 'expense' ? -Math.abs(Number(e.amount || 0)) : Number(e.amount || 0));
                out.push({ k: 'e:' + e.id, d, acc, v, kind: e.type === 'expense' ? 'Despesa' : 'Recebimento', desc: `${e.description || e.category || ''}${e.supplierName ? ' · ' + e.supplierName : ''}${e.customerName ? ' · ' + e.customerName : ''}`, ref: { col: 'financial_entries', id: e.id } });
            });
            bm.filter(m => !m.deleted).forEach(m => {
                const d = toD(m.date) || toD(m.createdAt); if (!d) return;
                if (m.type === 'transfer') {
                    out.push({ k: 'm:' + m.id + ':o', d, acc: m.fromId, v: -Math.abs(r2(m.amount)), kind: 'Transferência', desc: `Para ${accName(m.toId) || 'outra conta'}${m.description ? ' · ' + m.description : ''}`, ref: { col: 'bank_moves', id: m.id } });
                    out.push({ k: 'm:' + m.id + ':i', d, acc: m.toId, v: Math.abs(r2(m.amount)), kind: 'Transferência', desc: `De ${accName(m.fromId) || 'outra conta'}${m.description ? ' · ' + m.description : ''}`, ref: { col: 'bank_moves', id: m.id } });
                } else out.push({ k: 'm:' + m.id, d, acc: m.accountId, v: r2(m.amount), kind: 'Ajuste', desc: m.description || 'Lançamento manual', ref: { col: 'bank_moves', id: m.id } });
            });
            moves = out.sort((a, b) => b.d - a.d);
            const bal = {}; accounts.forEach(a => { bal[a.id] = Number(a.initialBalance || 0); });
            moves.forEach(m => { if (m.acc && bal[m.acc] != null) bal[m.acc] += m.v; });
            data = { bal, extras, lbl };
        }
        function inRange(m) { const a = from ? new Date(from + 'T00:00:00') : null, b = to ? new Date(to + 'T23:59:59') : null; return (!a || m.d >= a) && (!b || m.d <= b); }

        function render() {
            const total = active().reduce((s, a) => s + (data.bal[a.id] || 0), 0);
            const pm = moves.filter(inRange);
            const io = id => { const l = pm.filter(m => m.acc === id); return { i: l.filter(m => m.v > 0).reduce((s, m) => s + m.v, 0), o: l.filter(m => m.v < 0).reduce((s, m) => s + m.v, 0) }; };
            const orphan = pm.filter(m => !m.acc || !accounts.some(a => a.id === m.acc));
            const keys = [['pix', 'Pix'], ['credito', 'Cartão de crédito'], ['debito', 'Cartão de débito'], ...data.extras.filter(x => x.kind !== 'dinheiro').map(x => [x.id, x.name]), ['dinheiro', 'Dinheiro (depositado)'], ['boleto', 'Boleto (despesas)']];
            const ext = (sel === '__none' ? orphan : sel ? pm.filter(m => m.acc === sel) : pm);
            root.innerHTML = `<div class="cb-top"><div class="cb-total">Saldo em todas as contas<b>${money(total)}</b></div><div class="cb-acts"><button class="btn btn-primary" data-a="new"><i class="fas fa-plus"></i> Nova conta</button><button class="btn btn-secondary" data-a="transfer" ${active().length < 2 ? 'disabled title="Cadastre pelo menos duas contas"' : ''}><i class="fas fa-right-left"></i> Transferir entre contas</button><button class="btn btn-secondary" data-a="adjust" ${active().length ? '' : 'disabled'}><i class="fas fa-plus-minus"></i> Lançamento / ajuste</button></div></div>
${accounts.length ? `<div class="cb-cards">${accounts.map(a => { const x = io(a.id), b = data.bal[a.id] || 0; return `<div class="cb-card${sel === a.id ? ' on' : ''}${a.active === false ? ' off' : ''}" data-sel="${esc(a.id)}"><div class="cb-ed"><button class="btn-icon" data-a="edit" data-id="${esc(a.id)}" title="Editar"><i class="fas fa-pen"></i></button></div><h4><i class="fas fa-building-columns" style="color:var(--accent);margin-right:6px"></i>${esc(a.name)}</h4><small>${esc([a.bank, KIND[a.kind] || ''].filter(Boolean).join(' · '))}${a.active === false ? ' · desativada' : ''}</small><div class="cb-bal" style="color:${b < 0 ? 'var(--danger)' : 'var(--text-heading)'}">${money(b)}</div><div class="cb-io"><span class="cb-in">+ ${money(x.i)}</span><span class="cb-out">${money(x.o)}</span><small>no período</small></div></div>`; }).join('')}</div>`
                : `<div class="card" style="padding:30px;text-align:center;margin-bottom:16px"><i class="fas fa-building-columns" style="font-size:34px;color:var(--accent);opacity:.6"></i><h3 style="margin:10px 0 4px">Cadastre suas contas</h3><p style="color:var(--text-muted);font-size:13px">Banco, conta digital, maquininha… Depois diga em qual conta cai o Pix e os cartões, e de qual conta saem as despesas.</p><button class="btn btn-primary" data-a="new" style="margin-top:8px"><i class="fas fa-plus"></i> Cadastrar a primeira conta</button></div>`}
${accounts.length ? `<div class="card" style="padding:16px;margin-bottom:16px"><h4 style="margin:0 0 4px;font-size:15px"><i class="fas fa-route" style="color:var(--accent);margin-right:6px"></i>Onde cai cada forma de pagamento</h4><p style="margin:0 0 12px;font-size:12px;color:var(--text-muted)">Vale para as vendas (PDV, mesas, OS), recebimentos e despesas que não tiverem a conta escolhida na hora. Salva na hora.</p><div class="cb-map">${keys.map(([k, l]) => `<label>${esc(l)}<select class="form-input" data-map="${esc(k)}">${accOptions(mapping[k] || '', k === 'dinheiro' ? 'Fica no caixa (não vai para conta)' : '— Sem conta —')}</select></label>`).join('')}</div></div>` : ''}
<div class="card" style="padding:16px"><div class="cb-ext-top"><h4 style="margin:0 auto 0 0;font-size:15px"><i class="fas fa-list" style="color:var(--accent);margin-right:6px"></i>Extrato</h4><select class="form-input" data-f="acc" style="width:auto"><option value="">Todas as contas</option>${accounts.map(a => `<option value="${esc(a.id)}" ${sel === a.id ? 'selected' : ''}>${esc(a.name)}</option>`).join('')}${orphan.length ? `<option value="__none" ${sel === '__none' ? 'selected' : ''}>Sem conta definida (${orphan.length})</option>` : ''}</select><input type="date" class="form-input" data-f="from" value="${from}" style="width:auto"><input type="date" class="form-input" data-f="to" value="${to}" style="width:auto"></div>
<div style="overflow-x:auto"><table class="data-table"><thead><tr><th>Data</th><th>Tipo</th><th>Descrição</th><th>Conta</th><th style="text-align:right">Valor</th><th></th></tr></thead><tbody>${ext.length ? ext.slice(0, 1500).map(m => `<tr><td style="white-space:nowrap">${m.d.toLocaleDateString('pt-BR')}</td><td><span class="cb-tag">${m.kind}</span></td><td>${esc(m.desc)}</td><td>${m.acc && accName(m.acc) ? esc(accName(m.acc)) : '<span style="color:var(--warning)">Sem conta</span>'}</td><td style="text-align:right" class="${m.v >= 0 ? 'cb-in' : 'cb-out'}">${m.v >= 0 ? '+' : ''}${money(m.v)}</td><td style="text-align:right;white-space:nowrap">${m.ref.col !== 'bank_moves' && accounts.length ? `<button class="btn-icon" data-a="move" data-k="${esc(m.k)}" title="Mudar a conta"><i class="fas fa-right-left"></i></button>` : ''}${m.ref.col === 'bank_moves' ? `<button class="btn-icon btn-danger" data-a="delmove" data-id="${esc(m.ref.id)}" title="Excluir lançamento"><i class="fas fa-trash"></i></button>` : ''}</td></tr>`).join('') : `<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma movimentação neste período.</td></tr>`}</tbody>
${ext.length ? `<tfoot><tr><td colspan="4">Entradas ${money(ext.filter(m => m.v > 0).reduce((s, m) => s + m.v, 0))} · Saídas ${money(ext.filter(m => m.v < 0).reduce((s, m) => s + m.v, 0))}</td><td style="text-align:right">${money(ext.reduce((s, m) => s + m.v, 0))}</td><td></td></tr></tfoot>` : ''}</table></div></div>`;
        }
        async function refresh() { try { await gather(); render(); } catch (e) { root.innerHTML = `<div class="card" style="padding:30px;color:var(--danger)">Erro ao carregar: ${esc(e.message)}</div>`; } }
        function editAcc(a) {
            a = a || {};
            modal(a.id ? 'Editar conta' : 'Nova conta', `<div class="form-group"><label>Nome da conta *</label><input class="form-input" id="cbName" value="${esc(a.name || '')}" placeholder="Ex.: Nubank, Itaú PJ, Stone, Mercado Pago" maxlength="60"></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="form-group"><label>Banco / instituição</label><input class="form-input" id="cbBank" value="${esc(a.bank || '')}" maxlength="60"></div><div class="form-group"><label>Tipo</label><select class="form-input" id="cbKind">${Object.entries(KIND).map(([k, v]) => `<option value="${k}" ${a.kind === k ? 'selected' : ''}>${v}</option>`).join('')}</select></div></div>
<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="form-group"><label>Saldo inicial (R$)</label><input class="form-input" id="cbInit" inputmode="decimal" value="${a.initialBalance != null ? String(Number(a.initialBalance).toFixed(2)).replace('.', ',') : ''}" placeholder="0,00"></div><div class="form-group"><label>Agência / conta (opcional)</label><input class="form-input" id="cbNum" value="${esc(a.number || '')}" maxlength="40"></div></div>
${a.id ? `<label style="display:flex;gap:8px;align-items:center;font-size:13px"><input type="checkbox" id="cbActive" ${a.active !== false ? 'checked' : ''}> Conta ativa (aparece no PDV e nas despesas)</label>` : ''}`, async ov => {
                const name = ov.querySelector('#cbName').value.trim(); if (name.length < 2) { toast('warning', 'Dê um nome para a conta.'); return false; }
                const d = { name, bank: ov.querySelector('#cbBank').value.trim(), kind: ov.querySelector('#cbKind').value, initialBalance: r2(parseMoney(ov.querySelector('#cbInit').value)), number: ov.querySelector('#cbNum').value.trim(), active: a.id ? ov.querySelector('#cbActive').checked : true, updatedAt: ts() };
                try { if (a.id) await db.collection('bank_accounts').doc(a.id).set(d, { merge: true }); else await db.collection('bank_accounts').add({ ...d, createdAt: ts(), createdBy: uid() }); toast('success', 'Conta salva'); await refresh(); }
                catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return false; }
            });
        }
        function transfer() {
            const today = new Date().toISOString().slice(0, 10);
            modal('Transferir entre contas', `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="form-group"><label>De</label><select class="form-input" id="cbFrom">${accOptions(active()[0]?.id)}</select></div><div class="form-group"><label>Para</label><select class="form-input" id="cbTo">${accOptions(active()[1]?.id)}</select></div></div><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="form-group"><label>Valor (R$) *</label><input class="form-input" id="cbAmt" inputmode="decimal" placeholder="0,00"></div><div class="form-group"><label>Data</label><input class="form-input" type="date" id="cbDate" value="${today}"></div></div><div class="form-group"><label>Descrição</label><input class="form-input" id="cbDesc" maxlength="120" placeholder="Ex.: Depósito do caixa, resgate da maquininha"></div>`, async ov => {
                const f = ov.querySelector('#cbFrom').value, t = ov.querySelector('#cbTo').value, v = r2(parseMoney(ov.querySelector('#cbAmt').value));
                if (!f || !t || f === t) { toast('warning', 'Escolha duas contas diferentes.'); return false; } if (v <= 0) { toast('warning', 'Informe o valor.'); return false; }
                try { await db.collection('bank_moves').add({ type: 'transfer', fromId: f, toId: t, amount: v, date: tsOf(new Date((ov.querySelector('#cbDate').value || today) + 'T12:00:00')), description: ov.querySelector('#cbDesc').value.trim(), createdAt: ts(), createdBy: uid() }); toast('success', 'Transferência registrada'); await refresh(); }
                catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return false; }
            }, 'Transferir');
        }
        function adjust() {
            const today = new Date().toISOString().slice(0, 10);
            modal('Lançamento / ajuste', `<div class="form-group"><label>Conta</label><select class="form-input" id="cbAcc">${accOptions(sel && sel !== '__none' ? sel : active()[0]?.id)}</select></div><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px"><div class="form-group"><label>Tipo</label><select class="form-input" id="cbType"><option value="in">Entrada</option><option value="out">Saída</option></select></div><div class="form-group"><label>Valor (R$) *</label><input class="form-input" id="cbAmt" inputmode="decimal" placeholder="0,00"></div><div class="form-group"><label>Data</label><input class="form-input" type="date" id="cbDate" value="${today}"></div></div><div class="form-group"><label>Descrição *</label><input class="form-input" id="cbDesc" maxlength="120" placeholder="Ex.: Tarifa bancária, rendimento, depósito do caixa"></div>`, async ov => {
                const v = r2(parseMoney(ov.querySelector('#cbAmt').value)), desc = ov.querySelector('#cbDesc').value.trim();
                if (v <= 0) { toast('warning', 'Informe o valor.'); return false; } if (!desc) { toast('warning', 'Descreva o lançamento.'); return false; }
                try { await db.collection('bank_moves').add({ type: 'adjust', accountId: ov.querySelector('#cbAcc').value, amount: ov.querySelector('#cbType').value === 'out' ? -v : v, date: tsOf(new Date((ov.querySelector('#cbDate').value || today) + 'T12:00:00')), description: desc, createdAt: ts(), createdBy: uid() }); toast('success', 'Lançamento registrado'); await refresh(); }
                catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return false; }
            });
        }
        function moveTo(m) {
            modal('Mudar a conta', `<p style="font-size:13px;margin:0 0 10px">${esc(m.kind)} · ${esc(m.desc)} · <b>${money(m.v)}</b></p><div class="form-group"><label>Esta movimentação foi na conta</label><select class="form-input" id="cbAcc">${accOptions(m.acc)}</select></div>`, async ov => {
                const acc = ov.querySelector('#cbAcc').value;
                try {
                    if (m.ref.col === 'financial_entries') await db.collection('financial_entries').doc(m.ref.id).update({ accountId: acc });
                    else if (m.ref.col === 'sales') { const s = await db.collection('sales').doc(m.ref.id).get(); const d = s.data() || {}; const pays = Array.isArray(d.payments) && d.payments.length ? d.payments.map(p => ({ ...p })) : [{ method: d.paymentMethod, amount: d.total }]; if (pays[m.ref.idx]) pays[m.ref.idx].accountId = acc; await db.collection('sales').doc(m.ref.id).update({ payments: pays }); }
                    toast('success', 'Conta alterada'); await refresh();
                } catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); return false; }
            }, 'Mudar');
        }
        root.addEventListener('click', async e => {
            const b = e.target.closest('[data-a]');
            if (!b) { const c = e.target.closest('[data-sel]'); if (c) { sel = sel === c.dataset.sel ? '' : c.dataset.sel; render(); } return; }
            e.stopPropagation();
            const a = b.dataset.a;
            if (a === 'new') editAcc(null);
            else if (a === 'edit') editAcc(accounts.find(x => x.id === b.dataset.id));
            else if (a === 'transfer') transfer();
            else if (a === 'adjust') adjust();
            else if (a === 'move') { const m = moves.find(x => x.k === b.dataset.k); if (m) moveTo(m); }
            else if (a === 'delmove') { if (!confirm('Excluir este lançamento?')) return; try { await db.collection('bank_moves').doc(b.dataset.id).update({ deleted: true }); toast('success', 'Lançamento excluído'); await refresh(); } catch (err) { toast('error', err.message); } }
        });
        root.addEventListener('change', async e => {
            const m = e.target.closest('[data-map]');
            if (m) { mapping = { ...mapping, [m.dataset.map]: m.value }; if (!m.value) delete mapping[m.dataset.map]; try { await db.collection('settings').doc('general').set({ contasPorForma: mapping }, { merge: true }); toast('success', 'Salvo'); } catch (err) { toast('error', err.message); } await refresh(); return; }
            const f = e.target.dataset.f; if (!f) return;
            if (f === 'acc') sel = e.target.value; if (f === 'from') from = e.target.value; if (f === 'to') to = e.target.value; render();
        });
        root.innerHTML = '<div style="text-align:center;padding:50px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin fa-2x"></i></div>';
        await refresh();
    }

    /* ================= PDV: em qual conta caiu ================= */
    function pdv() {
        const box = document.querySelector('.payment-methods'); if (!box) return;
        const wrap = document.createElement('div'); wrap.id = 'dpAccWrap';
        wrap.style.cssText = 'display:none;align-items:center;gap:8px;margin-top:8px;font-size:12px;color:var(--text-muted)';
        wrap.innerHTML = '<i class="fas fa-building-columns" style="color:var(--accent)"></i><span>Cai na conta</span><select id="dpAccSel" class="form-input" style="flex:1;height:32px;padding:2px 8px;font-size:12px"></select>';
        box.parentElement.appendChild(wrap);
        const sel = wrap.querySelector('select');
        const cur = () => { try { return selectedPayment; } catch (e) { return ''; } };
        let touched = false;
        const sync = () => {
            const m = cur(), acts = active();
            const show = acts.length > 1 && m && !['dinheiro', 'fiado', 'multi'].includes(m) && !(window.DPPayMethods && DPPayMethods.kindOf(m) === 'dinheiro');
            wrap.style.display = show ? 'flex' : 'none';
            if (show) { const def = accountFor(m); sel.innerHTML = accOptions(def, def ? '' : '— Escolha a conta —'); touched = false; }
        };
        sel.addEventListener('change', () => { touched = true; });
        box.addEventListener('click', () => setTimeout(sync, 30));
        load().then(sync);
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function' && !SalesService.create.__dpAcc) {
            const o = SalesService.create;
            SalesService.create = async function (data) {
                try {
                    if (data && Array.isArray(data.payments)) {
                        const chosen = wrap.style.display !== 'none' ? sel.value : '';
                        data.payments.forEach(p => { if (!p || p.accountId || ['fiado'].includes(p.method)) return; const a = (data.payments.length === 1 && chosen) ? chosen : accountFor(p.method); if (a) p.accountId = a; });
                    }
                } catch (e) { }
                return o.apply(this, arguments);
            };
            SalesService.create.__dpAcc = true;
        }
    }

    /* ================= Contas a pagar: de qual conta saiu ================= */
    function bills() {
        const pm = document.getElementById('billPayMethod'); if (!pm) return;
        let pending = null;
        const grp = pm.closest('.form-group') || pm.parentElement;
        const g = document.createElement('div'); g.className = 'form-group'; g.innerHTML = '<label>Conta de saída</label><select id="billAccount" class="form-input"></select><small style="color:var(--text-muted);font-size:11px">De qual conta o dinheiro sai quando for paga.</small>';
        grp.insertAdjacentElement('afterend', g);
        const sel = g.querySelector('select');
        const fill = (v) => { sel.innerHTML = accOptions(v || '', '— Usar a conta padrão da forma de pagamento —'); };
        load().then(() => fill(''));
        // Abre o modal: carrega a conta da despesa que está sendo editada
        // 40.0 · Encadeado: se a função já tinha um embrulho (o do crediário: Pagar com juros, desconto e caixa), a página que
        // recarrega (initPageContasPagar de novo depois de pagar) troca só a função de baixo e os dois embrulhos continuam.
        // Antes a recarga trocava o do crediário pela confirmação simples: o 2º "Pagar" seguido perdia a janela de pagamento.
        // 40.73 · Vale em todas as versões (antes só no Mensal; nas outras a 2ª conta "Parcelar em" virava uma conta só).
        const hookFn = (name, make) => { const prev = Object.getOwnPropertyDescriptor(window, name); let legacy = window[name]; const temPrev = !!(prev && prev.get && prev.set); const ours = make(() => temPrev ? prev.get.call(window) : legacy); try { Object.defineProperty(window, name, { configurable: true, get() { return ours; }, set(v) { if (temPrev) prev.set.call(window, v); else legacy = v; } }); } catch (e) { window[name] = ours; } };
        let editingAcc = '';
        hookFn('editBill', legacy => function (id) { (async () => { try { const s = await db.collection('financial_entries').doc(id).get(); editingAcc = (s.data() || {}).accountId || ''; } catch (e) { editingAcc = ''; } fill(editingAcc); })(); return legacy() && legacy().apply(this, arguments); });
        hookFn('openNewBill', legacy => function () { fill(''); return legacy() && legacy().apply(this, arguments); });
        hookFn('saveBill', legacy => async function () { pending = sel.value || null; try { return await (legacy() && legacy().apply(this, arguments)); } finally { setTimeout(() => { pending = null; }, 1500); } });
        // Grava a conta junto com a despesa (intercepta a gravação em financial_entries só durante o "Salvar")
        if (!db.__dpAccWrap) {
            const orig = db.collection.bind(db);
            db.collection = function (name) {
                const c = orig.apply(null, arguments);
                if (name !== 'financial_entries') return c;
                const add = c.add ? c.add.bind(c) : null, docf = c.doc ? c.doc.bind(c) : null;
                const w = Object.create(c);
                if (add) w.add = data => add(pending && data && data.type === 'expense' ? { ...data, accountId: pending } : data);
                if (docf) w.doc = id => { const d = docf(id); const upd = d.update ? d.update.bind(d) : null; const wd = Object.create(d); if (upd) wd.update = data => upd(pending && data && data.type === 'expense' ? { ...data, accountId: pending } : data); return wd; };
                return w;
            };
            db.__dpAccWrap = true;
        }
        // Dar baixa: pergunta de qual conta saiu
        hookFn('payBill', legacy => function (id) {
            if (!active().length) return legacy() && legacy().apply(this, arguments);
            (async () => {
                let e = {}; try { e = (await db.collection('financial_entries').doc(id).get()).data() || {}; } catch (err) { }
                const def = e.accountId || accountFor(e.paymentMethod);
                const today = new Date().toISOString().slice(0, 10);
                modal('Baixar conta', `<p style="margin:0 0 12px;font-size:13px">${esc(e.description || 'Conta')} · <b>${money(e.amount)}</b></p><div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="form-group"><label>Saiu da conta</label><select class="form-input" id="cbAcc">${accOptions(def, '— Sem conta —')}</select></div><div class="form-group"><label>Data do pagamento</label><input type="date" class="form-input" id="cbDate" value="${today}"></div></div>`, async ov => {
                    try {
                        const acc = ov.querySelector('#cbAcc').value, d = ov.querySelector('#cbDate').value;
                        await db.collection('financial_entries').doc(id).update({ status: 'paid', paidAt: d && d !== today ? tsOf(new Date(d + 'T12:00:00')) : ts(), ...(acc ? { accountId: acc } : {}) });
                        toast('success', 'Conta marcada como paga!');
                        setTimeout(() => location.reload(), 600);
                    } catch (err) { toast('error', 'Erro ao pagar: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); return false; }
                }, 'Confirmar pagamento');
            })();
        });
    }

    const start = () => {
        if (document.getElementById('cbRoot')) page();
        if (document.querySelector('.payment-methods') && document.getElementById('productsGrid')) pdv();
        if (/contas-pagar\.html$/i.test(location.pathname)) { let n = 0; const t = setInterval(() => { if (document.getElementById('billPayMethod') || ++n > 40) { clearInterval(t); bills(); } }, 250); }
        else if (!document.getElementById('cbRoot')) load();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else setTimeout(start, 0);
})();
