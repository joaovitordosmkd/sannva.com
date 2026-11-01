/* DistribuiPro 37.9 · Backup completo e planilhas (Configurações › Backup).
   - DP_BACKUP_COLS: a lista única de TODAS as coleções do sistema, inclusive as dos módulos.
     Coleção nova (módulo novo) entra só aqui e já vai para o backup.
   - No Mensal o servidor monta o backup de uma vez, sem lista nenhuma (nada fica de fora).
   - Restaurar grava em lotes (até 400 registros por vez), em vez de um pedido por registro.
   - Planilhas "Produtos (CSV)" e "Clientes (CSV)" que abrem no Excel e voltam pelo importador.
   - 40.85 · Restaurar também lê o backup do Windows Offline (coleções { id: registro } e datas { __ts }). */
(function () {
    'use strict';
    if (window.DPBackup) return;

    const DP_BACKUP_COLS = [
        // cadastro e vendas
        'settings', 'users', 'categories', 'products', 'customers', 'suppliers', 'motoboys',
        'sales', 'orders', 'quotes', 'purchases', 'consignments', 'device_purchases', 'returns',
        // estoque
        'stock_movements', 'stock_transfers', 'stock_lots', 'stock_lot_moves','product_serials', 'bottle_types', 'bottle_moves',
        // caixa e financeiro
        'cash_registers', 'cash_movements', 'financial_entries', 'bank_accounts', 'bank_moves', 'goals', 'store_credits',
        // ordens de serviço
        'service_orders', 'service_order_photos', 'os_tracking', 'os_capture', 'os_photo_inbox', 'os_client_inbox',
        // agenda e itens dos clientes (pets, veículos)
        'appointments', 'customer_items', 'customer_item_events',
        // entregas
        'routes', 'delivery_runs',
        // restaurante
        'dining_tabs', 'addon_groups',
        // histórico
        'audit_logs'
    ];
    window.DP_BACKUP_COLS = DP_BACKUP_COLS;

    const $ = id => document.getElementById(id);
    const lower = s => String(s || '').trim().toLowerCase();
    const sizeLabel = len => len >= 1048576 ? (len / 1048576).toFixed(1).replace('.', ',') + ' MB' : (len / 1024).toFixed(1).replace('.', ',') + ' KB';
    const isDemo = () => window.DP_IS_DEMO === true; // 39.3 · fonte única (branding.js); antes: pasta "teste" na URL

    /* ---------- Gerar ---------- */

    async function fromCollections(onProgress) {
        const backup = { exportedAt: new Date().toISOString(), version: '2.0', collections: {} };
        for (let i = 0; i < DP_BACKUP_COLS.length; i++) {
            const col = DP_BACKUP_COLS[i];
            if (onProgress) try { onProgress(i + 1, DP_BACKUP_COLS.length, col); } catch (e) { }
            try {
                const snap = await db.collection(col).get();
                if (snap && snap.size) backup.collections[col] = snap.docs.map(d => ({ _id: d.id, ...d.data() }));
            } catch (e) { console.warn('Backup: coleção ' + col + ' não lida', e && e.message); }
        }
        return { backup, json: null };
    }

    /** Monta o backup completo. Devolve { backup, json, count, size }. */
    async function collect(onProgress) {
        let pack = null;
        if (!pack) pack = await fromCollections(onProgress);
        const b = pack.backup;
        const counts = {};
        let count = 0;
        Object.keys(b.collections || {}).forEach(c => { const k = Array.isArray(b.collections[c]) ? b.collections[c].length : 0; counts[c] = k; count += k; });
        if (!pack.json) { b.counts = counts; pack.json = JSON.stringify(b, null, 1); }
        pack.count = count; pack.counts = counts; pack.size = pack.json.length;
        return pack;
    }

    /* ---------- Restaurar ---------- */
    function makeTs(d) {
        if (window.DPTimestamp && DPTimestamp.fromDate) return DPTimestamp.fromDate(d);
        const T = window.firebase && firebase.firestore && firebase.firestore.Timestamp;
        return T && T.fromDate ? T.fromDate(d) : d;
    }
    // Datas que viraram texto no arquivo voltam a ser datas (vale para backup do Firebase, do MySQL e da demo)
    function revive(v) {
        if (Array.isArray(v)) return v.map(revive);
        if (!v || typeof v !== 'object') return v;
        const keys = Object.keys(v);
        let d = null;
        if (typeof v.seconds === 'number' && typeof v.nanoseconds === 'number' && keys.every(k => k === 'seconds' || k === 'nanoseconds' || k === '_date')) d = new Date(v.seconds * 1000 + Math.round(v.nanoseconds / 1e6));
        else if (typeof v._seconds === 'number' && typeof v._nanoseconds === 'number' && keys.length === 2) d = new Date(v._seconds * 1000 + Math.round(v._nanoseconds / 1e6));
        else if (v.__dp_type === 'timestamp' && v.value && keys.length <= 2) d = new Date(v.value);
        else if (typeof v.__dpTimestamp === 'string' && keys.length === 1) d = new Date(v.__dpTimestamp);
        // 40.85 · data do backup do Windows Offline: { "__ts": milissegundos }
        else if (typeof v.__ts === 'number' && keys.every(k => k === '__ts' || k === 'seconds' || k === 'nanoseconds')) d = new Date(v.__ts);
        if (d && !isNaN(d.getTime())) return makeTs(d);
        const o = {};
        keys.forEach(k => { o[k] = revive(v[k]); });
        return o;
    }

    /** Grava o backup por cima (merge), em lotes de até 400 registros. Devolve quantos registros gravou. */
    async function restore(backup, onProgress) {
        const cols = backup && backup.collections;
        if (!cols || typeof cols !== 'object') throw new Error('Arquivo inválido: não é um backup do DistribuiPro.');
        // 40.85 · O backup do Windows Offline é a cópia do banco dele: cada coleção vem como { id: registro } em vez de lista
        const listOf = docs => Array.isArray(docs) ? docs
            : (docs && typeof docs === 'object' ? Object.keys(docs).map(k => (docs[k] && typeof docs[k] === 'object' ? { ...docs[k], _id: k } : null)) : null);
        // O administrador de agora é mantido: o administrador do backup com o mesmo e-mail é gravado no usuário de agora.
        // 40.85 · No Offline os perfis (entregador, atendente...) têm o mesmo e-mail do dono: vale só o administrador,
        // e o cargo, a situação e as permissões de quem está restaurando não mudam.
        const uid = (auth.currentUser && auth.currentUser.uid) || '';
        const email = lower(auth.currentUser && auth.currentUser.email);
        const sameEmail = (listOf(cols.users) || []).filter(u => u && u._id && uid && email && lower(u.email) === email);
        const me = sameEmail.find(u => u.role === 'admin') || (sameEmail.length === 1 ? sameEmail[0] : null);
        const myOldId = me ? String(me._id) : '';
        const oldId = myOldId && myOldId !== uid ? myOldId : '';
        // Vendas, caixas e histórico que apontam para o administrador antigo passam a apontar para o de agora
        const swapId = v => v === oldId ? uid : (Array.isArray(v) ? v.map(swapId)
            : (v && typeof v === 'object' ? Object.keys(v).reduce((o, k) => { o[k] = swapId(v[k]); return o; }, {}) : v));
        const ops = [];
        Object.keys(cols).forEach(col => {
            const docs = listOf(cols[col]);
            if (!docs || !/^[A-Za-z0-9_-]{1,80}$/.test(col)) return;
            docs.forEach(doc => {
                if (!doc || typeof doc !== 'object' || !doc._id) return;
                let { _id, ...data } = doc;
                let id = String(_id);
                if (col === 'users' && myOldId && id === myOldId) {
                    id = uid; data.uid = uid;
                    ['role', 'roleName', 'status', 'permissions', 'deleted'].forEach(k => { delete data[k]; });
                }
                if (oldId) data = swapId(data);
                ops.push([col, id, revive(data)]);
            });
        });
        if (!ops.length) throw new Error('Nenhum registro encontrado neste arquivo.');
        let done = 0, skipped = 0, batch = db.batch(), pend = [], bytes = 0;
        const flush = async () => {
            if (!pend.length) return;
            try { await batch.commit(); done += pend.length; }
            catch (e) {
                // Um registro recusado derruba o lote inteiro (ex.: regra do Firebase que não deixa mudar o histórico).
                // Grava um a um para salvar todo o resto.
                console.warn('Backup: lote recusado, gravando um a um', e && e.message);
                for (const [col, id, data] of pend) {
                    try { await db.collection(col).doc(id).set(data, { merge: true }); done++; } catch (e2) { skipped++; }
                }
            }
            batch = db.batch(); pend = []; bytes = 0;
            if (onProgress) try { onProgress(done + skipped, ops.length); } catch (e) { }
        };
        for (const op of ops) {
            const [col, id, data] = op;
            let sz = 0; try { sz = JSON.stringify(data).length; } catch (e) { }
            // Lote cheio (400) ou pesado (fotos): manda antes de juntar mais
            if (pend.length && (pend.length >= 400 || bytes + sz > 3000000)) await flush();
            batch.set(db.collection(col).doc(id), data, { merge: true });
            pend.push(op); bytes += sz;
        }
        await flush();
        // 39.1 · Firebase: os produtos ficam guardados no navegador; depois do backup, baixa a lista de novo
        if (cols.products && window.DPProdutosCache) { try { await DPProdutosCache.resync(); } catch (e) { console.warn('produtos-cache:', e && e.message); } }
        restore.skipped = skipped;
        if (skipped && typeof Toast !== 'undefined') Toast.warning(`${skipped} registro${skipped > 1 ? 's' : ''} do arquivo não ${skipped > 1 ? 'puderam' : 'pôde'} ser gravado${skipped > 1 ? 's' : ''} (sem permissão). O resto foi restaurado.`);
        return done;
    }

    /* ---------- Planilhas (CSV) ---------- */
    const num = (v, dec) => { const x = Number(v); return Number.isFinite(x) ? x.toLocaleString('pt-BR', { minimumFractionDigits: dec === 3 ? 0 : dec, maximumFractionDigits: dec, useGrouping: false }) : ''; };
    // Código de barras, NCM, telefone e CPF ficam como texto no Excel (sem perder o zero da frente nem virar 7,89E+12)
    const asText = v => { const s = String(v ?? '').trim(); return /^\d+$/.test(s) && (s.length >= 8 || s[0] === '0') ? '="' + s + '"' : s; };
    const safe = v => { const s = String(v ?? '').replace(/\r?\n/g, ' ').trim(); return /^[=+\-@]/.test(s) && !/^=".*"$/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s) ? "'" + s : s; };
    const cell = v => { const s = safe(v); return /[";\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const ts = v => { try { const d = v && v.toDate ? v.toDate() : (v ? new Date(v.value || v.__dpTimestamp || (v.seconds ? v.seconds * 1000 : v)) : null); return d && !isNaN(d) ? d.toLocaleDateString('pt-BR') : ''; } catch (e) { return ''; } };
    const yes = b => b ? 'Sim' : 'Não';

    async function readAll(col, fields) {
        let q = db.collection(col);
        if (fields && typeof q.select === 'function') q = q.select(...fields);
        const snap = await q.get();
        return snap.docs.map(d => ({ id: d.id, ...(d.data() || {}) })).filter(x => !x.deleted);
    }

    async function productsRows() {
        const list = await readAll('products', ['name', 'category', 'code', 'internalCode', 'barcode', 'costPrice', 'salePrice', 'promoPrice', 'currentStock', 'minStock', 'unit', 'brand', 'volume', 'status', 'active', 'productType', 'controlStock', 'stockLocation', 'supplierName', 'ncm', 'cest', 'cfop', 'csosn', 'origem', 'description']);
        list.sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'pt-BR'));
        const head = ['Nome', 'Categoria', 'Código', 'Código de barras', 'Preço de custo', 'Preço de venda', 'Preço promocional', 'Estoque', 'Estoque mínimo', 'Unidade', 'Marca', 'Medida', 'Ativo', 'Controlar estoque', 'Local no estoque', 'Fornecedor', 'NCM', 'CEST', 'CFOP', 'CSOSN', 'Origem', 'Descrição'];
        const rows = list.map(p => {
            const svc = p.productType === 'service' || p.controlStock === false;
            return [p.name || '', p.category || '', asText(p.code || p.internalCode || ''), asText(p.barcode || ''), num(p.costPrice, 2), num(p.salePrice, 2), p.promoPrice ? num(p.promoPrice, 2) : '',
                num(p.currentStock || 0, 3), num(p.minStock || 0, 3), String(p.unit || 'un').toUpperCase(), p.brand || '', p.volume || '',
                yes(p.status !== 'inactive' && p.active !== false), yes(!svc), p.stockLocation || '', p.supplierName && p.supplierName !== 'Selecione...' ? p.supplierName : '',
                asText(p.ncm || ''), asText(p.cest || ''), p.cfop || '', p.csosn || '', p.origem ?? '', p.description || ''];
        });
        return { head, rows, name: 'produtos' };
    }

    async function customersRows() {
        const list = await readAll('customers');
        list.sort((a, b) => String(a.name || a.nome || '').localeCompare(String(b.name || b.nome || ''), 'pt-BR'));
        const head = ['Nome', 'Telefone', 'WhatsApp', 'CPF/CNPJ', 'E-mail', 'Endereço', 'Número', 'Complemento', 'Bairro', 'Cidade', 'UF', 'CEP', 'Nascimento', 'Limite de crédito', 'Saldo devedor', 'Total comprado', 'Compras', 'Última compra', 'Situação', 'Observações'];
        const rows = list.map(c => [
            c.name || c.nome || '', asText(c.phone || c.telefone || ''), asText(c.whatsapp || ''), asText(c.document || c.cpf || c.cnpj || c.cpfCnpj || ''), c.email || '',
            c.street || c.rua || (c.address && !c.street ? c.address : '') || '', c.number || c.numero || '', c.complement || c.complemento || '', c.neighborhood || c.bairro || '',
            c.city || c.cidade || '', c.state || c.uf || '', c.zip || c.cep || '', c.birthDate ? String(c.birthDate).split('-').reverse().join('/') : '',
            c.creditLimit ? num(c.creditLimit, 2) : '', c.currentDebt ? num(c.currentDebt, 2) : '', c.totalPurchases ? num(c.totalPurchases, 2) : '', c.purchaseCount || '',
            ts(c.lastPurchase), c.status === 'inactive' ? 'Inativo' : (c.status === 'defaulter' ? 'Inadimplente' : 'Ativo'), c.notes || c.observacoes || ''
        ]);
        return { head, rows, name: 'clientes' };
    }

    async function csv(kind) {
        const btn = document.querySelector(`[data-dp-csv="${kind}"]`);
        const old = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Gerando...'; }
        try {
            const t = kind === 'customers' ? await customersRows() : await productsRows();
            if (!t.rows.length) { if (typeof Toast !== 'undefined') Toast.info(kind === 'customers' ? 'Nenhum cliente cadastrado.' : 'Nenhum produto cadastrado.'); return; }
            const text = [t.head, ...t.rows].map(r => r.map(cell).join(';')).join('\r\n');
            const a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' }));
            a.download = `${t.name}-${new Date().toISOString().slice(0, 10)}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 4000);
            if (typeof Toast !== 'undefined') Toast.success(`Planilha gerada: ${t.rows.length} ${kind === 'customers' ? 'clientes' : 'produtos'}.`);
        } catch (e) {
            console.error(e);
            if (typeof Toast !== 'undefined') Toast.error('Não foi possível gerar a planilha: ' + (e.message || e));
        } finally {
            if (btn) { btn.disabled = false; btn.innerHTML = old; }
        }
    }

    /* ---------- "Último backup" de verdade (antes era um texto fixo) ---------- */
    function paintLast(history) {
        const el = $('dpBackupLast'); if (!el) return;
        const ok = $('dpBackupLastOk');
        const h = Array.isArray(history) ? history[0] : null;
        if (!h || !h.date) {
            el.textContent = 'Nenhum backup feito ainda. Use o Backup Manual para baixar uma cópia de tudo.';
            if (ok) ok.style.display = 'none';
            return;
        }
        const d = new Date(h.date);
        el.textContent = (isNaN(d) ? '' : `${d.toLocaleDateString('pt-BR')} às ${d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`) + ` · ${h.type || 'Manual'}` + (h.records ? ` · ${Number(h.records).toLocaleString('pt-BR')} registros` : '') + (h.size ? ` · ${h.size}` : '');
        if (ok) ok.style.display = h.status === 'success' ? '' : 'none';
    }

    window.DPBackup = { cols: DP_BACKUP_COLS, collect, restore, csv, paintLast, sizeLabel, revive, isDemo };
    window.exportCsvBackup = kind => csv(kind === 'customers' ? 'customers' : 'products');
})();
