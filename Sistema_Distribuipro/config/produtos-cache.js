/* DistribuiPro 39.1 · Produtos guardados no navegador (versão Firebase)
   ---------------------------------------------------------------------
   Por que: quase toda tela lê a coleção "products" inteira (Produtos, PDV, Estoque, Compras, relatórios,
   etiquetas, importação...). Com milhares de produtos isso estourava a cota gratuita do Firestore
   (50 mil leituras por dia) em poucas aberturas de tela.

   Como funciona: este arquivo entra no lugar de db.collection('products'). A primeira vez em cada
   navegador baixa a lista inteira (ou o retrato pronto da hospedagem, api/produtos-snapshot.php, que
   não gasta leitura nenhuma) e guarda em IndexedDB. Das próximas vezes busca no Firestore só o que
   mudou: where('updatedAt', '>', última sincronização). 20 preços alterados = 20 leituras.
   As telas continuam chamando .where/.orderBy/.limit/.get() como sempre: os filtros rodam aqui, em memória.

   Toda gravação em products/{id} (update, set, batch, transaction) ganha updatedAt = serverTimestamp()
   se a tela não mandou, para a mudança chegar nos outros computadores.

   Carregado pelo config/firebase-config.js. Nada a configurar. No console do navegador:
   DPProdutosCache.stats() mostra o estado, DPProdutosCache.resync() baixa tudo de novo. */
(function () {
    'use strict';
    if (typeof firebase === 'undefined' || !firebase.firestore || window.DPProdutosCache) return;

    var COL = 'products', VER = 1, DEBOUNCE_MS = 1500, PAGE = 400;
    var FS = firebase.firestore, Timestamp = FS.Timestamp;
    var S = { db: null, real: null, mem: null, ready: null, inflight: null, last: { s: 0, n: 0 }, lastDelta: 0, loadedAt: 0, pid: '', idb: null, snapGen: '', snapTried: false, metaChecked: false, stats: { reads: 0, deltas: 0, source: '' } };

    /* ---------- utilidades ---------- */
    function log() { try { console.log.apply(console, ['[produtos-cache]'].concat([].slice.call(arguments))); } catch (e) { } }
    function warn() { try { console.warn.apply(console, ['[produtos-cache]'].concat([].slice.call(arguments))); } catch (e) { } }
    function isTs(v) { return v && typeof v === 'object' && typeof v.toMillis === 'function' && typeof v.seconds === 'number'; }
    function tsCmp(a, b) { return a.s !== b.s ? a.s - b.s : a.n - b.n; }

    // Para guardar no IndexedDB: Timestamp vira {__dpts: [segundos, nanos]}; Date vira Timestamp.
    function freeze(v) {
        if (v === null || v === undefined) return v;
        if (isTs(v)) return { __dpts: [v.seconds, v.nanoseconds] };
        if (v instanceof Date) return { __dpts: [Math.floor(v.getTime() / 1000), (v.getTime() % 1000) * 1e6] };
        if (Array.isArray(v)) return v.map(freeze);
        if (typeof v === 'object') {
            if (typeof v.path === 'string' && typeof v.firestore === 'object' && typeof v.get === 'function') return { __dpref: v.path };
            var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = freeze(v[k]); return o;
        }
        return v;
    }
    function thaw(v) {
        if (v === null || v === undefined) return v;
        if (Array.isArray(v)) return v.map(thaw);
        if (typeof v === 'object') {
            if (Array.isArray(v.__dpts)) return new Timestamp(v.__dpts[0], v.__dpts[1] || 0);
            if (typeof v.__dpref === 'string') { try { return S.db.doc(v.__dpref); } catch (e) { return v.__dpref; } }
            var o = {}; for (var k in v) if (Object.prototype.hasOwnProperty.call(v, k)) o[k] = thaw(v[k]); return o;
        }
        return v;
    }
    function clone(v) { return thaw(freeze(v)); }

    /* ---------- IndexedDB ---------- */
    function openIdb() {
        if (S.idb) return Promise.resolve(S.idb);
        return new Promise(function (res, rej) {
            if (!window.indexedDB) return rej(new Error('IndexedDB indisponível'));
            var rq = indexedDB.open('dp_produtos_' + S.pid, 1);
            rq.onupgradeneeded = function () { var d = rq.result; if (!d.objectStoreNames.contains('docs')) d.createObjectStore('docs', { keyPath: 'id' }); if (!d.objectStoreNames.contains('meta')) d.createObjectStore('meta', { keyPath: 'k' }); };
            rq.onsuccess = function () { S.idb = rq.result; S.idb.onversionchange = function () { try { S.idb.close(); } catch (e) { } S.idb = null; }; res(S.idb); };
            rq.onerror = function () { rej(rq.error || new Error('IndexedDB falhou')); };
            rq.onblocked = function () { rej(new Error('IndexedDB bloqueado')); };
        });
    }
    function tx(stores, mode, fn) {
        return openIdb().then(function (d) {
            return new Promise(function (res, rej) {
                var t = d.transaction(stores, mode), out;
                t.oncomplete = function () { res(out); };
                t.onerror = function () { rej(t.error || new Error('IndexedDB: erro')); };
                t.onabort = function () { rej(t.error || new Error('IndexedDB: abortado')); };
                out = fn(t);
            });
        });
    }
    function idbReadAll() {
        var meta = null, docs = [];
        return tx(['docs', 'meta'], 'readonly', function (t) {
            t.objectStore('meta').get('sync').onsuccess = function (e) { meta = e.target.result || null; };
            t.objectStore('docs').getAll().onsuccess = function (e) { docs = e.target.result || []; };
        }).then(function () { return { meta: meta, docs: docs }; });
    }
    function idbWriteAll(mem, meta) {
        return tx(['docs', 'meta'], 'readwrite', function (t) {
            var st = t.objectStore('docs'); st.clear();
            mem.forEach(function (data, id) { st.put({ id: id, d: freeze(data) }); });
            t.objectStore('meta').put({ k: 'sync', v: meta });
        });
    }
    function idbPut(list, meta) {
        return tx(['docs', 'meta'], 'readwrite', function (t) {
            var st = t.objectStore('docs');
            list.forEach(function (x) { if (x.del) st.delete(x.id); else st.put({ id: x.id, d: freeze(x.data) }); });
            if (meta) t.objectStore('meta').put({ k: 'sync', v: meta });
        });
    }
    function metaNow() { return { ver: VER, pid: S.pid, last: { s: S.last.s, n: S.last.n }, loadedAt: S.loadedAt, source: S.stats.source, snapGen: S.snapGen }; }

    /* ---------- carga ---------- */
    function bump(data) { var u = data && data.updatedAt; if (isTs(u)) { var c = { s: u.seconds, n: u.nanoseconds }; if (tsCmp(c, S.last) > 0) S.last = c; } }
    function absorb(qs) { var list = []; qs.forEach(function (d) { var data = d.data() || {}; S.mem.set(d.id, data); bump(data); list.push({ id: d.id, data: data }); }); S.stats.reads += qs.size; return list; }

    // Retrato pronto na hospedagem (gerado junto com a importação inicial): não gasta leitura nenhuma.
    // Hospedagem com PHP responde em api/produtos-snapshot.php; Cloudflare Pages (functions/) em api/produtos-snapshot.
    var SNAPSHOT_URLS = ['api/produtos-snapshot.php', 'api/produtos-snapshot'];
    function fetchSnapshot() {
        var u = firebase.auth && firebase.auth().currentUser;
        if (!u || typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return Promise.resolve(null);
        return u.getIdToken().then(function (tok) {
            var tenta = function (i) {
                if (i >= SNAPSHOT_URLS.length) return Promise.resolve(null);
                return fetch(SNAPSHOT_URLS[i], { headers: { Authorization: 'Bearer ' + tok }, cache: 'no-store', credentials: 'omit' }).then(function (r) {
                    var ct = String(r.headers.get('content-type') || '');
                    if (r.status === 200 && ct.indexOf('json') >= 0) return r.json();
                    if (r.status === 401 || r.status === 403 || (r.status === 404 && ct.indexOf('json') >= 0)) return null; // respondeu de verdade: sem retrato
                    return tenta(i + 1);
                }, function () { return tenta(i + 1); });
            };
            return tenta(0);
        }).then(function (j) {
            if (!j || !Array.isArray(j.docs) || !j.last || j.pid !== S.pid) return null;
            return j;
        }).catch(function (e) { warn('retrato da hospedagem indisponível:', e && e.message); return null; });
    }
    // produtos-snapshot.meta.json (público, 2 linhas) diz quando o retrato foi gerado. Retrato mais novo que o que
    // está no navegador (ex.: reimportação, códigos de barras corrigidos) = recarrega do retrato, sem gastar leitura.
    function checkMeta() {
        if (S.metaChecked || typeof fetch !== 'function' || !/^https?:$/.test(location.protocol)) return Promise.resolve(false);
        S.metaChecked = true;
        return fetch('produtos-snapshot.meta.json', { cache: 'no-store', credentials: 'omit' }).then(function (r) {
            if (r.status !== 200 || String(r.headers.get('content-type') || '').indexOf('json') < 0) return null;
            return r.json();
        }).then(function (m) {
            if (!m || !m.generatedAt || m.generatedAt === S.snapGen) return false;
            log('retrato novo na hospedagem (' + m.generatedAt + ')');
            return fullLoad('retrato novo').then(function () { return true; });
        }).catch(function () { return false; });
    }
    function fullLoad(why) {
        S.snapTried = true;
        return fetchSnapshot().then(function (snap) {
            S.mem = new Map(); S.last = { s: 0, n: 0 }; S.snapGen = '';
            if (snap) {
                snap.docs.forEach(function (x) { if (x && x.id) S.mem.set(x.id, thaw(x.d || {})); });
                S.last = { s: Number(snap.last.s) || 0, n: Number(snap.last.n) || 0 };
                S.snapGen = String(snap.generatedAt || '');
                S.stats.source = 'hospedagem';
                log('retrato da hospedagem:', S.mem.size, 'produtos (' + why + ')');
                return;
            }
            return S.real.get().then(function (qs) {
                absorb(qs);
                // 39.3 · Banco novo (sem produto ainda): a "última sincronização" era o relógio do PC. Com o relógio adiantado
                // alguns minutos, o primeiro produto cadastrado (updatedAt do servidor, "no passado") nunca entrava na lista
                // deste navegador e o cliente cadastrava de novo. Zero = a próxima busca traz tudo o que tiver updatedAt
                // (num banco vazio custa 0 leituras).
                if (!S.last.s) S.last = { s: 0, n: 0 };
                S.stats.source = 'firestore';
                log('lista completa do Firestore:', qs.size, 'produtos (' + why + ')');
            });
        }).then(function () {
            S.loadedAt = Date.now(); S.lastDelta = 0;
            return idbWriteAll(S.mem, metaNow()).catch(function (e) { warn('não guardou no IndexedDB:', e && e.message); });
        });
    }
    function ready() {
        if (S.ready) return S.ready;
        S.ready = idbReadAll().catch(function (e) { warn('IndexedDB:', e && e.message); return { meta: null, docs: [] }; }).then(function (r) {
            var m = r.meta && r.meta.v;
            if (m && m.ver === VER && m.pid === S.pid && m.last && (m.last.s || r.docs.length)) {
                S.mem = new Map(); r.docs.forEach(function (x) { S.mem.set(x.id, thaw(x.d || {})); });
                S.last = { s: Number(m.last.s) || 0, n: Number(m.last.n) || 0 }; S.loadedAt = m.loadedAt || Date.now(); S.stats.source = m.source || 'cache'; S.snapGen = m.snapGen || '';
                log('do navegador:', S.mem.size, 'produtos');
                return checkMeta();
            }
            return fullLoad('primeira vez neste navegador');
        });
        S.ready.catch(function () { S.ready = null; });
        return S.ready;
    }
    // Só o que mudou desde a última vez. force = ignora o intervalo mínimo (get({source:'server'})).
    // Em páginas de PAGE documentos, ordenadas por updatedAt. Se a primeira página vem cheia (muita coisa mudou, ex.:
    // reimportação) e ainda não tentou o retrato nesta tela, recarrega do retrato (zero leituras) e continua de lá.
    function delta(force) {
        var now = Date.now();
        // 39.3 · force (get({source:'server'}) logo depois de salvar): se já havia uma sincronização no meio do caminho,
        // ela não enxerga o produto recém-gravado; espera terminar e roda outra. Antes devolvia a antiga e a lista voltava sem o item.
        if (S.inflight) return force ? S.inflight.then(function () { return delta(true); }, function () { return delta(true); }) : S.inflight;
        if (!force && now - S.lastDelta < DEBOUNCE_MS) return Promise.resolve(0);
        var total = 0;
        var page = function () {
            return S.real.where('updatedAt', '>', new Timestamp(S.last.s, S.last.n)).orderBy('updatedAt').limit(PAGE).get().then(function (qs) {
                S.stats.deltas++;
                if (qs.size >= PAGE && total === 0 && !S.snapTried) { log('muitas mudanças: tentando o retrato da hospedagem'); return fullLoad('muitas mudanças').then(page); }
                if (!qs.size) return total;
                var list = absorb(qs); total += list.length;
                return idbPut(list, metaNow()).catch(function (e) { warn('IndexedDB:', e && e.message); }).then(function () { return qs.size >= PAGE ? page() : total; });
            });
        };
        S.inflight = page().then(function (n) { S.lastDelta = Date.now(); if (n) log('mudanças:', n); return n; });
        S.inflight.then(function () { S.inflight = null; }, function () { S.inflight = null; });
        return S.inflight;
    }

    /* ---------- consultas em memória ---------- */
    function fieldName(f) {
        if (typeof f === 'string') return f;
        if (f && typeof f === 'object') {
            try { var d = f._delegate || f; var p = d._internalPath || d; if (p && Array.isArray(p.segments)) return p.segments.join('.'); } catch (e) { }
            if (typeof f.isEqual === 'function' && FS.FieldPath && f.isEqual(FS.FieldPath.documentId())) return '__name__';
        }
        return String(f);
    }
    function fieldVal(id, data, f) {
        if (f === '__name__') return id;
        var parts = f.split('.'), v = data;
        for (var i = 0; i < parts.length; i++) { if (v === null || typeof v !== 'object') return undefined; v = v[parts[i]]; }
        return v;
    }
    function rank(v) {
        if (v === null) return 1; if (typeof v === 'boolean') return 2; if (typeof v === 'number') return 3; if (isTs(v) || v instanceof Date) return 4;
        if (typeof v === 'string') return 5; if (v && typeof v.path === 'string') return 7; if (Array.isArray(v)) return 9; if (typeof v === 'object') return 10; return 0;
    }
    function prim(v) { if (isTs(v)) return v.toMillis(); if (v instanceof Date) return v.getTime(); if (v && typeof v.path === 'string') return v.path; return v; }
    function eq(a, b) {
        if (a === b) return true;
        var ra = rank(a), rb = rank(b); if (ra !== rb) return false;
        if (ra === 4) return isTs(a) && isTs(b) ? (a.seconds === b.seconds && a.nanoseconds === b.nanoseconds) : prim(a) === prim(b);
        if (ra === 7) return a.path === b.path;
        if (ra === 9) { if (a.length !== b.length) return false; for (var i = 0; i < a.length; i++) if (!eq(a[i], b[i])) return false; return true; }
        if (ra === 10) { var ka = Object.keys(a), kb = Object.keys(b); if (ka.length !== kb.length) return false; for (var j = 0; j < ka.length; j++) if (!Object.prototype.hasOwnProperty.call(b, ka[j]) || !eq(a[ka[j]], b[ka[j]])) return false; return true; }
        return false;
    }
    // Ordem do Firestore: tipos diferentes nunca se igualam num filtro de faixa; na ordenação valem os "ranks".
    function cmp(a, b) {
        var ra = rank(a), rb = rank(b); if (ra !== rb) return ra - rb;
        if (ra === 4) { if (isTs(a) && isTs(b)) return a.seconds !== b.seconds ? a.seconds - b.seconds : a.nanoseconds - b.nanoseconds; var x = prim(a), y = prim(b); return x < y ? -1 : x > y ? 1 : 0; }
        if (ra === 9) { for (var i = 0; i < Math.min(a.length, b.length); i++) { var c = cmp(a[i], b[i]); if (c) return c; } return a.length - b.length; }
        if (ra === 10) { var ka = Object.keys(a).sort(), kb = Object.keys(b).sort(); for (var j = 0; j < Math.min(ka.length, kb.length); j++) { if (ka[j] !== kb[j]) return ka[j] < kb[j] ? -1 : 1; var c2 = cmp(a[ka[j]], b[kb[j]]); if (c2) return c2; } return ka.length - kb.length; }
        var p = prim(a), q = prim(b); return p < q ? -1 : p > q ? 1 : 0;
    }
    function matches(id, data, w) {
        var f = w[0], op = w[1], val = w[2], v = fieldVal(id, data, f), has = v !== undefined;
        switch (op) {
            case '==': return has && eq(v, val);
            case '!=': return has && !eq(v, val);
            case '<': return has && rank(v) === rank(val) && cmp(v, val) < 0;
            case '<=': return has && rank(v) === rank(val) && cmp(v, val) <= 0;
            case '>': return has && rank(v) === rank(val) && cmp(v, val) > 0;
            case '>=': return has && rank(v) === rank(val) && cmp(v, val) >= 0;
            case 'in': return has && Array.isArray(val) && val.some(function (x) { return eq(v, x); });
            case 'not-in': return has && Array.isArray(val) && !val.some(function (x) { return eq(v, x); });
            case 'array-contains': return Array.isArray(v) && v.some(function (x) { return eq(x, val); });
            case 'array-contains-any': return Array.isArray(v) && Array.isArray(val) && v.some(function (x) { return val.some(function (y) { return eq(x, y); }); });
        }
        return false;
    }
    function cursorKey(c, order, id, data) {
        // valores soltos (startAfter('Nome')) ou um DocumentSnapshot (startAfter(ultimoDoc))
        var a = c.args;
        if (a.length === 1 && a[0] && typeof a[0] === 'object' && typeof a[0].data === 'function' && typeof a[0].id === 'string') {
            var d = a[0].data() || {}; return order.map(function (o) { return o[0] === '__name__' ? a[0].id : fieldVal(a[0].id, d, o[0]); });
        }
        return a.slice(0, order.length);
    }
    function run(c) {
        var order = c.orderBy.map(function (o) { return [fieldName(o[0]), o[1] === 'desc' ? -1 : 1]; });
        var where = c.where.map(function (w) { return [fieldName(w[0]), w[1], w[2]]; });
        var needOrder = order.slice();
        // Firestore ordena pelo campo do filtro de faixa quando não há orderBy; o id entra sempre por último
        where.forEach(function (w) { if (/^(<|<=|>|>=|!=|not-in)$/.test(w[1]) && !needOrder.some(function (o) { return o[0] === w[0]; })) needOrder.push([w[0], 1]); });
        if (!needOrder.some(function (o) { return o[0] === '__name__'; })) needOrder.push(['__name__', needOrder.length ? needOrder[needOrder.length - 1][1] : 1]);
        var out = [];
        S.mem.forEach(function (data, id) {
            for (var i = 0; i < where.length; i++) if (!matches(id, data, where[i])) return;
            for (var j = 0; j < order.length; j++) if (fieldVal(id, data, order[j][0]) === undefined) return; // sem o campo do orderBy não entra (igual ao Firestore)
            out.push([id, data]);
        });
        out.sort(function (x, y) { for (var i = 0; i < needOrder.length; i++) { var c2 = cmp(fieldVal(x[0], x[1], needOrder[i][0]), fieldVal(y[0], y[1], needOrder[i][0])); if (c2) return c2 * needOrder[i][1]; } return 0; });
        var keyOf = function (row) { return needOrder.map(function (o) { return fieldVal(row[0], row[1], o[0]); }); };
        var cmpKey = function (k1, k2) { for (var i = 0; i < Math.min(k1.length, k2.length); i++) { var c3 = cmp(k1[i], k2[i]); if (c3) return c3 * needOrder[i][1]; } return 0; };
        c.cursors.forEach(function (cur) {
            var key = cursorKey(cur, needOrder, null, null); if (!key.length) return;
            out = out.filter(function (row) {
                var c4 = cmpKey(keyOf(row), key);
                if (cur.kind === 'startAt') return c4 >= 0; if (cur.kind === 'startAfter') return c4 > 0;
                if (cur.kind === 'endAt') return c4 <= 0; return c4 < 0; // endBefore
            });
        });
        if (c.limitLast > 0) out = out.slice(Math.max(0, out.length - c.limitLast));
        else if (c.limit > 0) out = out.slice(0, c.limit);
        return out;
    }
    function makeDoc(id, data) {
        var copy = null, meta = { fromCache: true, hasPendingWrites: false };
        return { id: id, exists: true, metadata: meta, ref: S.real.doc(id), __dpDoc: true,
            data: function () { if (!copy) copy = clone(data); return copy; },
            get: function (f) { return clone(fieldVal(id, data, fieldName(f))); },
            isEqual: function (o) { return !!o && o.id === id; } };
    }
    function makeSnap(rows, q) {
        var docs = rows.map(function (r) { return makeDoc(r[0], r[1]); });
        return { docs: docs, empty: !docs.length, size: docs.length, query: q, metadata: { fromCache: true, hasPendingWrites: false },
            forEach: function (cb, ctx) { docs.forEach(function (d) { cb.call(ctx, d); }); },
            docChanges: function () { return docs.map(function (d, i) { return { type: 'added', doc: d, oldIndex: -1, newIndex: i }; }); },
            isEqual: function () { return false; } };
    }

    /* ---------- o "db.collection('products')" que as telas recebem ---------- */
    function cachedGet(c, q, opts) {
        var src = opts && opts.source;
        return ready().then(function () {
            if (src === 'cache') return;
            return delta(src === 'server').catch(function (e) { if (src === 'server') throw e; warn('sem rede: usando a lista guardada', e && e.message); });
        }).then(function () { return makeSnap(run(c), q); });
    }
    function wrapQuery(realQ, c) {
        var w = {
            __dpProdutos: true, __real: realQ, firestore: realQ.firestore,
            where: function (f, op, v) { return wrapQuery(realQ.where(f, op, v), { where: c.where.concat([[f, op, v]]), orderBy: c.orderBy, limit: c.limit, limitLast: c.limitLast, cursors: c.cursors }); },
            orderBy: function (f, d) { return wrapQuery(realQ.orderBy(f, d), { where: c.where, orderBy: c.orderBy.concat([[f, d || 'asc']]), limit: c.limit, limitLast: c.limitLast, cursors: c.cursors }); },
            limit: function (n) { return wrapQuery(realQ.limit(n), { where: c.where, orderBy: c.orderBy, limit: n, limitLast: 0, cursors: c.cursors }); },
            limitToLast: function (n) { return wrapQuery(realQ.limitToLast(n), { where: c.where, orderBy: c.orderBy, limit: 0, limitLast: n, cursors: c.cursors }); },
            get: function (opts) { return cachedGet(c, w, opts); },
            onSnapshot: function () { return realQ.onSnapshot.apply(realQ, arguments); },
            isEqual: function (o) { return realQ.isEqual(o && o.__real ? o.__real : o); },
            withConverter: function () { return realQ.withConverter.apply(realQ, arguments); }
        };
        ['startAt', 'startAfter', 'endAt', 'endBefore'].forEach(function (k) {
            w[k] = function () {
                var args = [].slice.call(arguments), rq = realQ;
                // um documento vindo daqui (não é DocumentSnapshot de verdade) o SDK não aceita: a consulta real fica sem o cursor
                if (!args.some(function (a) { return a && a.__dpDoc; })) { try { rq = realQ[k].apply(realQ, args); } catch (e) { rq = realQ; } }
                return wrapQuery(rq, { where: c.where, orderBy: c.orderBy, limit: c.limit, limitLast: c.limitLast, cursors: c.cursors.concat([{ kind: k, args: args }]) });
            };
        });
        return w;
    }
    function wrapCollection(real) {
        var w = wrapQuery(real, { where: [], orderBy: [], limit: 0, limitLast: 0, cursors: [] });
        w.id = real.id; w.path = real.path; w.parent = real.parent;
        w.doc = function () { return real.doc.apply(real, arguments); };
        w.add = function (data) {
            var p = real.add(stamp(data));
            // 39.3 · O produto novo entra na lista deste navegador na hora (1 leitura), sem depender da próxima sincronização
            // (com relógio adiantado ou sincronização em andamento, a lista voltava sem ele e o cliente cadastrava de novo).
            p.then(function (ref) {
                if (!S.mem || !ref || typeof ref.get !== 'function') return;
                ref.get().then(function (d) { if (d && d.exists) S.mem.set(d.id, d.data()); }).catch(function () { });
            }, function () { });
            return p;
        };
        return w;
    }

    /* ---------- toda gravação em products/{id} leva updatedAt ---------- */
    function isProdRef(ref) { return !!(ref && typeof ref.path === 'string' && /^products\/[^/]+$/.test(ref.path)); }
    function stamp(data) {
        if (!data || typeof data !== 'object' || Array.isArray(data)) return data;
        if (data.updatedAt !== undefined) return data;
        var o = {}; for (var k in data) if (Object.prototype.hasOwnProperty.call(data, k)) o[k] = data[k];
        o.updatedAt = FS.FieldValue.serverTimestamp(); return o;
    }
    function patchWrites() {
        var DR = FS.DocumentReference && FS.DocumentReference.prototype;
        if (DR && !DR.__dpProdutos) {
            DR.__dpProdutos = true;
            var u = DR.update, s = DR.set, d = DR.delete;
            DR.update = function (data) { if (isProdRef(this) && arguments.length === 1) return u.call(this, stamp(data)); return u.apply(this, arguments); };
            DR.set = function (data, opts) { if (isProdRef(this)) return s.call(this, stamp(data), opts); return s.apply(this, arguments); };
            DR.delete = function () { var self = this; var p = d.apply(this, arguments); if (isProdRef(this) && S.mem) { p.then(function () { S.mem.delete(self.id); idbPut([{ id: self.id, del: true }]).catch(function () { }); }, function () { }); } return p; };
        }
        [FS.WriteBatch, FS.Transaction].forEach(function (C) {
            var P = C && C.prototype; if (!P || P.__dpProdutos) return;
            P.__dpProdutos = true;
            var u = P.update, s = P.set;
            P.update = function (ref, data) { if (isProdRef(ref) && arguments.length === 2) return u.call(this, ref, stamp(data)); return u.apply(this, arguments); };
            P.set = function (ref, data, opts) { if (isProdRef(ref)) return s.call(this, ref, stamp(data), opts); return s.apply(this, arguments); };
        });
    }

    /* ---------- instalação ---------- */
    function install() {
        var P = null;
        try { P = FS.Firestore && FS.Firestore.prototype; } catch (e) { }
        if (!P || typeof P.collection !== 'function') { try { P = Object.getPrototypeOf(firebase.firestore()); } catch (e) { } }
        if (!P || typeof P.collection !== 'function' || P.__dpProdutos) return false;
        P.__dpProdutos = true;
        var orig = P.collection;
        P.collection = function (path) {
            var real = orig.apply(this, arguments);
            if (String(path || '').replace(/^\/+|\/+$/g, '') !== COL) return real;
            if (!S.db) { S.db = this; S.real = real; try { S.pid = (firebase.app().options.projectId || '') ; } catch (e) { S.pid = ''; } }
            return wrapCollection(S.real || real);
        };
        patchWrites();
        return true;
    }
    if (!install()) { warn('não instalou (SDK diferente?): as telas leem direto do Firestore'); return; }

    window.DPProdutosCache = {
        ready: function () { return ready(); },
        /** Lista de produtos ativos (sem os excluídos), já sincronizada. */
        list: function () { return ready().then(function () { return delta(false).catch(function () { }); }).then(function () { var out = []; S.mem.forEach(function (d, id) { if (d.deleted !== true) out.push(Object.assign({ id: id }, clone(d))); }); return out; }); },
        /** Baixa a lista inteira de novo (depois de restaurar um backup, por exemplo). */
        resync: function () { if (!S.real) return Promise.resolve(); S.ready = fullLoad('ressincronizar'); S.ready.catch(function () { S.ready = null; }); return S.ready; },
        /** Apaga o que está guardado neste navegador. */
        clear: function () { S.ready = null; S.mem = null; return tx(['docs', 'meta'], 'readwrite', function (t) { t.objectStore('docs').clear(); t.objectStore('meta').clear(); }); },
        stats: function () { return { projeto: S.pid, produtosGuardados: S.mem ? S.mem.size : 0, origem: S.stats.source, ultimaSync: S.last.s ? new Date(S.last.s * 1000) : null, carregadoEm: S.loadedAt ? new Date(S.loadedAt) : null, leiturasNestaTela: S.stats.reads, sincronizacoes: S.stats.deltas }; },
        /** Só para testes (sem Firestore): enche a lista em memória e marca como pronta; use get({source:'cache'}). */
        _seed: function (docs) { S.mem = new Map(); (docs || []).forEach(function (x) { S.mem.set(x.id, x.d || x.data || {}); bump(S.mem.get(x.id)); }); S.loadedAt = Date.now(); S.lastDelta = Date.now(); S.ready = Promise.resolve(); S.stats.source = 'teste'; }
    };
})();
