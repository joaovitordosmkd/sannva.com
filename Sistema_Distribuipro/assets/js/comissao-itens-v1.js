/* DistribuiPro 37.9 · Comissão por item e por profissional (Agenda de serviços).
   Na mesma conta o cliente corta com o João, faz a sobrancelha com a Ana e leva uma pomada da recepção:
   cada item da venda pode ter o seu profissional (items[].sellerId/sellerName) e o produto ou serviço pode ter
   a sua própria porcentagem (products.commissionPercent), que vence a regra do usuário.
   - DPCommission.byItems(saleData, vendedor, info): usado pelo SalesService.create. Devolve sale.commissionSplits
     [{uid, name, productBase, serviceBase, productAmount, serviceAmount, amount, status}] e acerta o info
     (commissionAmount continua sendo a soma, para o código antigo seguir funcionando). Sem item de outro
     profissional e sem % própria: devolve null e a venda fica igual à de antes.
   - DPCommission.expandSplits(vendas, comZerados): Comissões e relatórios veem uma linha por profissional.
   - DPCommission.paySplit(linha): marca paga só a parte daquele profissional.
   - DPCommission.recalcSplits(itens, vendedor, total, entrega, usuarios): edição da venda.
   Igual nas 5 versões (Mensal, demo, Firebase, MySQL e Offline). */
(function () {
    'use strict';
    const C = window.DPCommission;
    if (!C || C.byItems) return;
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const val = i => Number((i.total ?? i.subtotal ?? ((Number(i.quantity) || 0) * (Number(i.unitPrice || i.salePrice) || 0))) || 0);
    const isServ = i => i.isService === true || i.productType === 'service';
    const hasPct = i => i && i.commissionPercent !== undefined && i.commissionPercent !== null && i.commissionPercent !== '' && isFinite(Number(i.commissionPercent)) && Number(i.commissionPercent) >= 0;
    const uidOf = u => String((u && (u.uid || u.id)) || '');

    // Conta pura: itens + regras dos usuários → uma parte por profissional
    function splitsFor(items, o) {
        const list = Array.isArray(items) ? items : [];
        const base = Math.max(0, Number(o.total || 0) - Number(o.deliveryFee || 0));
        const sum = list.reduce((a, i) => a + val(i), 0);
        const people = new Map();
        const get = id => {
            if (!people.has(id)) people.set(id, { uid: id, name: (o.names && o.names[id]) || '', pBase: 0, sBase: 0, pRule: 0, sRule: 0, pOver: 0, sOver: 0 });
            return people.get(id);
        };
        list.forEach(i => {
            const id = String(i.sellerId || o.sellerId || '');
            const p = get(id);
            if (!p.name && i.sellerName) p.name = String(i.sellerName);
            const share = sum > 0 ? base * val(i) / sum : 0;
            const serv = isServ(i);
            if (serv) p.sBase += share; else p.pBase += share;
            if (hasPct(i)) { const a = share * Number(i.commissionPercent) / 100; if (serv) p.sOver += a; else p.pOver += a; }
            else if (serv) p.sRule += share; else p.pRule += share;
        });
        const splits = [];
        for (const p of people.values()) {
            const cfg = (o.users && o.users[p.uid]) || {};
            const calc = C.calc(cfg, r2(p.pRule), r2(p.sRule));
            const productAmount = r2(calc.commissionProductAmount + p.pOver), serviceAmount = r2(calc.commissionServiceAmount + p.sOver);
            const amount = r2(productAmount + serviceAmount);
            splits.push({ uid: p.uid, name: p.name || cfg.name || cfg.email || (p.uid === o.sellerId ? (o.sellerName || 'Vendedor') : 'Profissional'), productBase: r2(p.pBase), serviceBase: r2(p.sBase), productAmount, serviceAmount, amount, status: amount > 0 ? 'pending' : 'none' });
        }
        // O vendedor da venda primeiro, depois quem ganhou mais
        splits.sort((a, b) => (b.uid === o.sellerId) - (a.uid === o.sellerId) || b.amount - a.amount);
        const tot = k => r2(splits.reduce((a, s) => a + s[k], 0));
        return { splits, productBase: tot('productBase'), serviceBase: tot('serviceBase'), productAmount: tot('productAmount'), serviceAmount: tot('serviceAmount'), amount: tot('amount') };
    }
    const needSplit = (items, sellerId) => (Array.isArray(items) ? items : []).some(i => (i.sellerId && String(i.sellerId) !== String(sellerId || '')) || hasPct(i));

    async function loadUsers(ids, known) {
        const users = { ...(known || {}) };
        for (const id of ids) {
            if (!id || users[id]) continue;
            try { const d = await db.collection('users').doc(id).get(); users[id] = d.exists ? (d.data() || {}) : {}; } catch (e) { users[id] = {}; }
        }
        return users;
    }

    // SalesService.create: seller = { uid, name, cfg }; info = resultado do DPCommission.calc (é ajustado aqui)
    C.byItems = async function (saleData, seller, info) {
        const items = (saleData && saleData.items) || [];
        const sid = String((seller && seller.uid) || '');
        if (!needSplit(items, sid)) return null;
        const ids = [...new Set(items.map(i => String(i.sellerId || sid)))];
        const names = {}; items.forEach(i => { if (i.sellerId && i.sellerName) names[String(i.sellerId)] = String(i.sellerName); });
        if (sid) names[sid] = names[sid] || (seller && seller.name) || '';
        const users = await loadUsers(ids, sid ? { [sid]: (seller && seller.cfg) || {} } : {});
        const r = splitsFor(items, { sellerId: sid, sellerName: seller && seller.name, users, names, total: saleData.total, deliveryFee: saleData.deliveryFee });
        if (info) Object.assign(info, { commissionProductBase: r.productBase, commissionServiceBase: r.serviceBase, commissionProductAmount: r.productAmount, commissionServiceAmount: r.serviceAmount, commissionAmount: r.amount });
        return r.splits;
    };

    // Edição da venda (vendas-editar): recalcula as partes com os usuários já carregados
    C.recalcSplits = async function (items, seller, total, deliveryFee, userList, prev) {
        const sid = String((seller && seller.uid) || '');
        if (!needSplit(items, sid)) return null;
        const known = {}; (userList || []).forEach(u => { known[uidOf(u)] = u; });
        const names = {}; (items || []).forEach(i => { if (i.sellerId && i.sellerName) names[String(i.sellerId)] = String(i.sellerName); });
        if (sid) { known[sid] = known[sid] || (seller && seller.cfg) || {}; names[sid] = (seller && seller.name) || names[sid] || ''; }
        const users = await loadUsers([...new Set((items || []).map(i => String(i.sellerId || sid)))], known);
        const r = splitsFor(items, { sellerId: sid, sellerName: seller && seller.name, users, names, total, deliveryFee });
        // Quem já recebeu continua com a parte marcada como paga
        (Array.isArray(prev) ? prev : []).forEach(o => { if (o && o.status === 'paid') { const n = r.splits.find(x => String(x.uid) === String(o.uid)); if (n) { n.status = 'paid'; n.paidAt = o.paidAt || ''; n.paidBy = o.paidBy || ''; } } });
        return { commissionSplits: r.splits, commissionProductBase: r.productBase, commissionServiceBase: r.serviceBase, commissionProductAmount: r.productAmount, commissionServiceAmount: r.serviceAmount, commissionAmount: r.amount, commissionBase: r2(r.productBase + r.serviceBase) };
    };

    // Uma linha por profissional (só quando a venda tem mais de um ou a parte não é do vendedor da venda)
    C.expandSplits = function (sales, keepZero) {
        if (!Array.isArray(sales)) return sales;
        const out = [];
        for (const s of sales) {
            const sp = Array.isArray(s && s.commissionSplits) ? s.commissionSplits.filter(x => x && x.uid !== undefined) : [];
            const owner = String(s && (s.sellerId || s.operatorId) || '');
            if (!sp.length || (sp.length === 1 && String(sp[0].uid) === owner)) { out.push(s); continue; }
            sp.forEach((p, idx) => {
                const amount = r2(p.amount);
                if (!keepZero && !(amount > 0)) return;
                const uid = String(p.uid || '');
                const paid = p.status === 'paid' || s.commissionStatus === 'paid';
                out.push({
                    ...s,
                    _split: { saleId: s.id, uid, idx },
                    sellerId: uid, operatorId: uid, sellerName: p.name || s.sellerName || '',
                    total: r2(Number(p.productBase || 0) + Number(p.serviceBase || 0)), deliveryFee: 0,
                    items: (s.items || []).filter(i => String(i.sellerId || owner) === uid),
                    commissionAmount: amount, commissionProductAmount: r2(p.productAmount), commissionServiceAmount: r2(p.serviceAmount),
                    commissionProductBase: r2(p.productBase), commissionServiceBase: r2(p.serviceBase),
                    commissionStatus: paid ? 'paid' : (amount > 0 ? 'pending' : 'none')
                });
            });
        }
        return out;
    };

    // Marca paga só a parte de um profissional; a venda fica "paga" quando todas as partes estiverem pagas
    C.paySplit = async function (row) {
        const k = row && row._split; if (!k) return;
        const ref = db.collection('sales').doc(k.saleId);
        const snap = await ref.get(); if (!snap.exists) return;
        const s = snap.data() || {};
        const list = (Array.isArray(s.commissionSplits) ? s.commissionSplits : []).map(x => ({ ...x }));
        const who = (() => { try { return (auth.currentUser && auth.currentUser.uid) || ''; } catch (e) { return ''; } })();
        let hit = false;
        list.forEach(x => { if (String(x.uid || '') === k.uid && x.status !== 'paid') { x.status = 'paid'; x.paidAt = new Date().toISOString(); x.paidBy = who; hit = true; } });
        if (!hit) return;
        const upd = { commissionSplits: list };
        if (list.every(x => x.status === 'paid' || !(Number(x.amount) > 0))) { upd.commissionStatus = 'paid'; upd.commissionPaidAt = (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp(); upd.commissionPaidBy = who; }
        await ref.update(upd);
    };

    C.splitsFor = splitsFor;
})();
