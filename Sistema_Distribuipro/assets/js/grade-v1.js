/* DistribuiPro 38.6 · Grade de tamanho e cor (loja de roupa, calçados, moda infantil, acessórios) — todas as versões.
   Cada tamanho/cor é um produto-filho normal na coleção products: StockService, PDV, consignado/condicional, compras, trocas e
   edição de venda continuam iguais.
   - Pai: isGradeParent, gradeSizes[], gradeColors[], gradePreset, gradeCount, controlStock:false e currentStock 0 (o estoque do pai é
     a soma dos filhos, calculada na tela; por isso ele não entra no Estoque nem nos alertas).
   - Filho: gradeParentId, gradeSize, gradeColor, gradeOrder, gradeBaseName, nome "Calça Skinny · 38 · Azul". Herda preço, custo,
     categoria, marca e foto do pai; gradeOwnPrice = preço próprio. Código de barras EAN-13 interno (DPBarcode.novos, etiquetas-v1.js)
     ou o do fornecedor.
   - settings/general (demo: demo_general): gradeEnabled (sem escolha: ligada no ramo "loja"), gradePresets [{id,name,sizes}]
     além dos de fábrica (Roupa PP–GG, Jeans 36–48, Calçado 33–44, Infantil 2–16...).
   - Produtos: quadro "Grade de tamanho e cor" no cadastro (matriz tamanho × cor com estoque, mínimo, código de barras e preço), lista
     só com o pai e o total ("faltam 2 tamanhos"), entrada/contagem pela matriz e exclusão junto com os filhos.
   - PDV: DPGrade.pdvList (gancho no renderProducts) mostra só o pai com o total; DPGrade.pdvPick (gancho no addToCart) abre o seletor
     de tamanho e cor com o estoque de cada um. Bipar o código do filho entra direto (pdv-pro-v1.js).
   - Compras: escolher o pai num item (ou "Comprar por grade") abre a matriz de quantidades. Estoque: "Entrada por grade".
   - Configurações › Empresa: cartão "Loja de roupa e calçados" (grade, condicional no PDV, prazo do condicional, modelos de grade).
   - Importar planilha: colunas Tamanho e Cor agrupam pelo nome (DPGrade.importNames / importPrep, ganchos no importar-produtos-v1.js). */
(function () {
    'use strict';
    if (window.DPGrade) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => { if (typeof v === 'string') v = v.replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'); return Number(v) || 0; };
    const r2 = v => Math.round(num(v) * 100) / 100;
    const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qf = v => num(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));
    const uid = () => { try { return (auth.currentUser && auth.currentUser.uid) || 'system'; } catch (e) { return 'system'; } };
    const DEMO = () => { try { return !!db.__isLocalDemo; } catch (e) { return false; } };
    const SDOC = () => DEMO() ? 'demo_general' : 'general';
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const role = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } };
    const boss = () => ['', 'admin', 'manager'].includes(role());
    const segment = () => { try { return window.DPTerm && DPTerm.segment ? (DPTerm.segment() || '') : ''; } catch (e) { return ''; } };
    const plural = (n, a, b) => (Number(n) === 1 ? a : b);
    const uniq = a => a.filter((x, i) => a.indexOf(x) === i);
    const clean = o => { const r = {}; Object.keys(o).forEach(k => { if (o[k] !== undefined) r[k] = o[k]; }); return r; };
    const svc = () => (typeof FirestoreService !== 'undefined' && FirestoreService) || (typeof DataService !== 'undefined' && DataService) || null;

    /* =================== Configuração e modelos =================== */
    const FACTORY = [
        { id: 'roupa', name: 'Roupa PP ao GG', sizes: ['PP', 'P', 'M', 'G', 'GG'] },
        { id: 'roupa_plus', name: 'Roupa P ao XGG', sizes: ['P', 'M', 'G', 'GG', 'XG', 'XGG'] },
        { id: 'jeans', name: 'Jeans 36 ao 48', sizes: ['36', '38', '40', '42', '44', '46', '48'] },
        { id: 'calcado', name: 'Calçado 33 ao 44', sizes: ['33', '34', '35', '36', '37', '38', '39', '40', '41', '42', '43', '44'] },
        { id: 'infantil', name: 'Infantil 2 ao 16', sizes: ['2', '4', '6', '8', '10', '12', '14', '16'] },
        { id: 'bebe', name: 'Bebê RN ao 3 anos', sizes: ['RN', 'P', 'M', 'G', '1', '2', '3'] },
        { id: 'unico', name: 'Tamanho único', sizes: ['U'] }
    ];
    const COLORS = ['Preto', 'Branco', 'Off-white', 'Azul', 'Azul-marinho', 'Jeans claro', 'Jeans escuro', 'Cinza', 'Mescla', 'Bege', 'Marrom', 'Vermelho', 'Rosa', 'Verde', 'Amarelo', 'Estampado'];
    let CFG = null, cfgP = null;
    function loadCfg(force) {
        if (cfgP && !force) return cfgP;
        cfgP = (async () => {
            let g = {};
            try { const d = await db.collection('settings').doc('general').get(); if (d.exists) g = d.data() || {}; } catch (e) { }
            if (DEMO()) { try { const d = await db.collection('settings').doc('demo_general').get(); if (d.exists) g = { ...g, ...(d.data() || {}) }; } catch (e) { } }
            CFG = { gradeEnabled: g.gradeEnabled, gradePresets: Array.isArray(g.gradePresets) ? g.gradePresets : [], condicionalPdv: g.condicionalPdv, condicionalDias: g.condicionalDias };
            return CFG;
        })();
        return cfgP;
    }
    async function saveCfg(patch) {
        await db.collection('settings').doc(SDOC()).set({ ...patch, updatedAt: ts() }, { merge: true });
        CFG = { ...(CFG || {}), ...patch }; cfgP = Promise.resolve(CFG);
        try { document.dispatchEvent(new CustomEvent('dp:grade-cfg', { detail: { ...CFG } })); } catch (e) { }
    }
    const enabled = () => { const c = CFG || {}; return c.gradeEnabled === true || (c.gradeEnabled !== false && segment() === 'loja'); };
    const presets = () => [...FACTORY, ...((CFG && CFG.gradePresets) || []).filter(p => p && p.name && Array.isArray(p.sizes) && p.sizes.length).map((p, i) => ({ id: p.id || 'c' + i, name: String(p.name), sizes: p.sizes.map(String), custom: true }))];
    function suggestPreset(cat, name) {
        const t = norm(cat + ' ' + name);
        if (/jeans|calca|bermuda|short/.test(t)) return 'jeans';
        if (/calcad|tenis|sapato|sandalia|chinelo|bota|rasteira|sapatilha/.test(t)) return 'calcado';
        if (/infantil|kids|crianca|menin/.test(t)) return 'infantil';
        if (/bebe|body|macacao/.test(t)) return 'bebe';
        if (/bolsa|bone|cinto|acessori|bijuter|colar|brinco/.test(t)) return 'unico';
        return 'roupa';
    }

    /* =================== Núcleo: pai, filhos e estoque =================== */
    const isParent = p => !!p && p.isGradeParent === true && !p.deleted;
    const isChild = p => !!p && !!p.gradeParentId;
    const keyOf = (s, c) => String(s) + '|' + String(c || '');
    const label = (s, c) => [s, c].filter(Boolean).join(' · ');
    const childName = (base, s, c) => [String(base || '').trim(), s, c].filter(Boolean).join(' · ');
    function kidsOf(list, parent) {
        const pid = typeof parent === 'string' ? parent : parent && parent.id;
        return (list || []).filter(k => k && k.gradeParentId === pid && !k.deleted)
            .sort((a, b) => (num(a.gradeOrder) - num(b.gradeOrder)) || String(a.name || '').localeCompare(String(b.name || '')));
    }
    const sumStock = ks => ks.reduce((s, k) => s + num(k.currentStock), 0);
    function stockOf(p, list) { return isParent(p) ? sumStock(kidsOf(list, p)) : num(p && p.currentStock); }
    // Tamanhos e cores na ordem do pai (e os que só existem em algum filho antigo, no fim)
    function axes(p, ks) {
        const S = uniq([...(p.gradeSizes || []).map(String), ...ks.map(k => String(k.gradeSize || '')).filter(Boolean)]);
        const C = uniq([...(p.gradeColors || []).map(String), ...ks.map(k => String(k.gradeColor || '')).filter(Boolean)]);
        return { S: S.length ? S : [''], C: C.length ? C : [''] };
    }
    const kidAt = (ks, s, c) => ks.find(k => String(k.gradeSize || '') === String(s) && String(k.gradeColor || '') === String(c || ''));
    // Lista do PDV: só o pai, com o total dos filhos (e os códigos deles, para a busca achar o pai)
    function pdvList(list) {
        list = Array.isArray(list) ? list : [];
        const ids = new Set(list.filter(isParent).map(p => p.id)), kids = {};
        list.forEach(p => { if (p && p.gradeParentId && !p.deleted) (kids[p.gradeParentId] = kids[p.gradeParentId] || []).push(p); });
        const out = [];
        list.forEach(p => {
            if (!p) return;
            if (p.gradeParentId && ids.has(p.gradeParentId)) return;
            if (isParent(p)) {
                const ks = kids[p.id] || [];
                out.push({ ...p, currentStock: sumStock(ks), minStock: ks.reduce((s, k) => s + num(k.minStock), 0), barcode: [p.barcode, ...ks.map(k => k.barcode)].filter(Boolean).join(' '), _gradeKids: ks.length });
                return;
            }
            out.push(p);
        });
        return out;
    }
    // Carrinho: as peças dos filhos contam no cartão do pai
    function foldCart(inCart, list) {
        const byId = new Map((list || []).map(p => [p.id, p]));
        Object.keys(inCart).forEach(id => { const k = byId.get(id); if (k && k.gradeParentId && byId.has(k.gradeParentId)) inCart[k.gradeParentId] = (inCart[k.gradeParentId] || 0) + inCart[id]; });
        return inCart;
    }

    /* =================== Estilo =================== */
    function css() {
        if ($('dpgCss')) return;
        const st = document.createElement('style'); st.id = 'dpgCss';
        st.textContent = `
.dpg-box [hidden],.dpg-m [hidden],.dpg-pick [hidden]{display:none!important}
.dpg-box{border:1px solid var(--border-color);border-radius:14px;padding:12px 14px;margin:0 0 12px;background:var(--bg-secondary)}
.dpg-box.on{border-color:var(--accent);background:var(--bg-card)}
.dpg-h{display:flex;gap:12px;align-items:flex-start;cursor:pointer}
.dpg-h input{margin-top:4px;accent-color:var(--accent);width:16px;height:16px;flex:none}
.dpg-h b{display:block;font-size:13.5px;color:var(--text-heading)}.dpg-h small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.45}
.dpg-ic{flex:none;width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent-muted,rgba(99,102,241,.12));color:var(--accent)}.dpg-ic svg{width:19px;height:19px}
.dpg-body{margin-top:12px}
.dpg-g2{display:grid;grid-template-columns:minmax(160px,220px) minmax(0,1fr);gap:12px}
.dpg-body .form-label small{font-weight:500;color:var(--text-muted);text-transform:none;letter-spacing:0}
.dpg-chips{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:40px;padding:5px 6px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-input)}
.dpg-chip{display:inline-flex;align-items:center;gap:4px;padding:4px 4px 4px 10px;border-radius:99px;background:var(--accent-muted,rgba(99,102,241,.12));color:var(--text-heading);font-size:12.5px;font-weight:700}
.dpg-chip button{border:0;background:none;color:var(--text-muted);cursor:pointer;width:20px;height:20px;border-radius:50%;display:grid;place-items:center;padding:0}.dpg-chip button:hover{background:rgba(239,68,68,.15);color:var(--danger)}.dpg-chip svg{width:13px;height:13px}
.dpg-chip-in{flex:1;min-width:110px;border:0;outline:0;background:none;color:var(--text-primary);font:inherit;font-size:13px;padding:4px}
.dpg-sug{display:flex;flex-wrap:wrap;gap:5px;margin-top:6px}.dpg-sug button{border:1px dashed var(--border-color);background:none;color:var(--text-secondary);border-radius:99px;padding:3px 9px;font:inherit;font-size:11.5px;cursor:pointer}.dpg-sug button:hover{border-color:var(--accent);color:var(--accent)}
.dpg-tabs{display:inline-flex;flex-wrap:wrap;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;margin:4px 0 6px}
.dpg-tabs button{border:0;background:none;padding:7px 12px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-secondary);cursor:pointer}.dpg-tabs button.on{background:var(--accent);color:#fff}
.dpg-hint{font-size:11.5px;color:var(--text-muted);margin-bottom:6px;line-height:1.45}
.dpg-mx{overflow:auto;border:1px solid var(--border-color);border-radius:10px;max-height:340px}
.dpg-mx table{border-collapse:separate;border-spacing:0;min-width:100%;font-size:12.5px}
.dpg-mx th{position:sticky;top:0;background:var(--bg-secondary);color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:.4px;padding:7px 8px;text-align:center;white-space:nowrap;border-bottom:1px solid var(--border-color);z-index:1}
.dpg-mx tbody th{position:sticky;left:0;top:auto;z-index:2;text-transform:none;font-size:13px;color:var(--text-heading);background:var(--bg-secondary);text-align:left;border-right:1px solid var(--border-color)}
.dpg-mx td{padding:4px 5px;text-align:center;border-bottom:1px solid var(--border-color)}
.dpg-mx td.t,.dpg-mx th.t{font-weight:800;color:var(--text-heading)}
.dpg-mx tfoot td{background:var(--bg-secondary);font-weight:800;color:var(--text-heading)}
.dpg-in{width:64px;padding:6px 6px;text-align:center;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);font:inherit;font-weight:700}
.dpg-in.w{width:132px;font-family:var(--font-mono,monospace);font-weight:600;font-size:12px}
.dpg-in:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.dpg-in.chg{border-color:var(--warning,#d97706)}
.dpg-cur{display:block;font-size:10.5px;color:var(--text-muted);margin-top:2px;white-space:nowrap}
.dpg-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:8px;font-size:12px;color:var(--text-secondary)}.dpg-foot .sp{flex:1}.dpg-foot .btn svg{width:15px;height:15px}
.dpg-empty{padding:18px;text-align:center;color:var(--text-muted);font-size:12.5px}
.dpg-hide{display:none!important}
.dpg-tag{flex:none;max-width:none;display:inline-flex;align-items:center;gap:4px;margin-left:6px;padding:2px 8px;border-radius:99px;background:var(--accent-muted,rgba(99,102,241,.12));color:var(--accent);font-size:10.5px;font-weight:800;white-space:nowrap;vertical-align:middle}.dpg-tag svg{width:12px;height:12px}
.dpg-st{display:inline-block;font-size:11px;font-weight:700;padding:3px 9px;border-radius:99px;white-space:nowrap}
.dpg-st.ok{background:rgba(16,185,129,.13);color:#059669}.dpg-st.low{background:rgba(245,158,11,.15);color:#b45309}.dpg-st.out{background:rgba(239,68,68,.13);color:#dc2626}
.dpg-m .modal{max-width:760px;width:min(760px,calc(100vw - 24px));max-height:94vh;display:flex;flex-direction:column}
.dpg-m .modal-body{overflow:auto}
.dpg-m .modal-header h3{display:flex;align-items:center;gap:8px}.dpg-m .modal-header h3 svg{width:20px;height:20px;color:var(--accent)}
.dpg-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:10px;overflow:hidden;margin-bottom:10px}
.dpg-seg button{border:0;background:none;padding:8px 14px;font:inherit;font-size:13px;font-weight:700;color:var(--text-secondary);cursor:pointer}.dpg-seg button.on{background:var(--accent);color:#fff}
.dpg-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:12px}
.dpg-pick .modal{max-width:620px;width:min(620px,calc(100vw - 20px))}
.dpg-pick .modal-header{align-items:flex-start}
.dpg-pick .pt{font-size:16px;font-weight:800;color:var(--text-heading)}.dpg-pick .ps{font-size:12.5px;color:var(--text-muted);margin-top:2px}
.dpg-pmx{overflow:auto;max-height:62vh}
.dpg-pmx table{border-collapse:separate;border-spacing:6px;margin:0 auto}
.dpg-pmx th{font-size:11.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);padding:2px 4px;white-space:nowrap}
.dpg-pmx tbody th{font-size:15px;color:var(--text-heading);text-transform:none;text-align:right;padding-right:8px}
.dpg-pc{min-width:74px;min-height:54px;border:1.5px solid var(--border-color);border-radius:12px;background:var(--bg-surface,var(--bg-card));color:var(--text-heading);cursor:pointer;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:1px;padding:6px 8px;font:inherit;transition:border-color .12s,transform .08s}
.dpg-pc:hover:not([disabled]){border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.1))}.dpg-pc:active:not([disabled]){transform:scale(.97)}
.dpg-pc b{font-size:17px;line-height:1.1}.dpg-pc small{font-size:11px;color:var(--text-muted)}.dpg-pc em{font-style:normal;font-size:10.5px;font-weight:700;color:var(--accent)}
.dpg-pc.off{opacity:.42;cursor:not-allowed;border-style:dashed}.dpg-pc.off b{font-size:12px;font-weight:700;color:var(--text-muted)}
.dpg-pc.none{opacity:.25;cursor:default;border-style:dotted}
.dpg-pchips{display:flex;flex-wrap:wrap;gap:8px;justify-content:center}.dpg-pchips .dpg-pc b{font-size:20px}.dpg-pchips .dpg-pc{min-width:84px}
.dpg-plegend{font-size:11.5px;color:var(--text-muted);text-align:center;margin-top:10px}
.dpg-cfg{padding:18px!important;margin-bottom:18px;border:1px solid var(--accent-muted,rgba(99,102,241,.25))!important}
.dpg-cfg-h{display:flex;gap:14px;align-items:flex-start}.dpg-cfg-h .ico{width:48px;height:48px;border-radius:14px;background:var(--accent-muted,rgba(99,102,241,.12));display:grid;place-items:center;flex:none;color:var(--accent)}.dpg-cfg-h .ico svg{width:24px;height:24px}
.dpg-cfg-h h3{margin:0;font-size:15px;color:var(--text-heading)}.dpg-cfg-h p{margin:4px 0 0;font-size:12.5px;color:var(--text-muted);line-height:1.5;max-width:680px}
.dpg-cfg-l{display:flex;flex-direction:column;gap:10px;margin-top:14px}
.dpg-cfg-i{display:flex;gap:12px;align-items:center;justify-content:space-between;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-secondary)}
.dpg-cfg-i b{display:block;font-size:13px;color:var(--text-heading)}.dpg-cfg-i small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.4}
.dpg-sw{position:relative;width:48px;height:28px;flex:none;cursor:pointer}.dpg-sw input{opacity:0;width:0;height:0}.dpg-sw span{position:absolute;inset:0;border-radius:99px;background:var(--bg-surface,#e5e7eb);border:1px solid var(--border-color);transition:.2s}.dpg-sw span::after{content:"";position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.3);transition:.2s}.dpg-sw input:checked+span{background:var(--success,#10b981);border-color:var(--success,#10b981)}.dpg-sw input:checked+span::after{transform:translateX(20px)}.dpg-sw input:focus-visible+span{outline:2px solid var(--accent);outline-offset:2px}
.dpg-cfg-i input[type=number]{width:72px;padding:7px 8px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);font:inherit;text-align:center}
.dpg-pre{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.dpg-pre span{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:99px;border:1px solid var(--border-color);font-size:11.5px;color:var(--text-secondary)}.dpg-pre span button{border:0;background:none;color:var(--text-muted);cursor:pointer;padding:0;display:inline-flex}.dpg-pre span button svg{width:13px;height:13px}
.dpg-pre-add{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}.dpg-pre-add input{padding:7px 10px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);font:inherit;font-size:12.5px}
.dpg-btn-ic{display:inline-flex;align-items:center;gap:6px}.dpg-btn-ic svg{width:16px;height:16px}
@media(max-width:640px){.dpg-g2{grid-template-columns:1fr}.dpg-m .modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}.dpg-pc{min-width:60px;min-height:50px}}`;
        document.head.appendChild(st);
    }
    function overlay(id, cls, title, icon) {
        css();
        $(id) && $(id).remove();
        const ov = document.createElement('div'); ov.className = 'modal-overlay active ' + cls; ov.id = id;
        ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true"><div class="modal-header"><h3>${ic(icon, 'shirt')} ${title}</h3><button class="modal-close" type="button" data-x aria-label="Fechar"><i class="fas fa-times"></i></button></div><div class="modal-body"></div><div class="modal-footer"></div></div>`;
        document.body.appendChild(ov);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey, true); };
        const onKey = e => { if (e.key === 'Escape' && document.body.contains(ov)) { e.stopPropagation(); close(); } };
        document.addEventListener('keydown', onKey, true);
        ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('[data-x]')) close(); });
        return { ov, B: ov.querySelector('.modal-body'), F: ov.querySelector('.modal-footer'), close };
    }

    /* =================== PDV: seletor de tamanho e cor =================== */
    const pdvProducts = () => { try { return Array.isArray(products) ? products : []; } catch (e) { return []; } };
    const pdvCart = () => { try { return Array.isArray(cart) ? cart : []; } catch (e) { return []; } };
    const priceNow = p => { try { if (typeof window.dpPrecoVigente === 'function') return num(window.dpPrecoVigente(p)) || num(p.salePrice); } catch (e) { } return num(p && p.salePrice); };
    function pdvPick(p) {
        if (!isParent(p)) return false;
        openPicker(p);
        return true;
    }
    function openPicker(p) {
        const all = pdvProducts(), ks = kidsOf(all, p);
        if (!ks.length) { toast('warning', `${p.name} ainda não tem tamanhos cadastrados. Abra o produto em Produtos e monte a grade.`); return; }
        const { S, C } = axes(p, ks);
        const inCart = id => pdvCart().filter(c => c.productId === id).reduce((s, c) => s + num(c.quantity) * (num(c._factor) || 1), 0);
        const prices = uniq(ks.map(k => r2(priceNow(k))));
        const base = priceNow(p);
        const W = overlay('dpgPick', 'dpg-pick', `<span><span class="pt">${esc(p.name)}</span><span class="ps" style="display:block">${prices.length > 1 ? `${money(Math.min(...prices))} a ${money(Math.max(...prices))}` : money(prices[0] || base)} · ${sumStock(ks)} ${plural(sumStock(ks), 'peça', 'peças')} no estoque</span></span>`, 'shirt');
        const cell = (s, c, chip) => {
            const k = kidAt(ks, s, c);
            if (!k) return `<span class="dpg-pc none" aria-hidden="true"><b>—</b></span>`;
            const q = inCart(k.id), left = num(k.currentStock) - q, off = left <= 0, pr = r2(priceNow(k));
            const name = label(s, c) || 'Único';
            return `<button type="button" class="dpg-pc${off ? ' off' : ''}" data-id="${esc(k.id)}" ${off ? 'disabled' : ''} aria-label="${esc(name)}: ${off ? 'sem estoque' : left + ' no estoque'}" title="${esc(name)}">${chip ? `<b>${esc(s || c)}</b><small>${off ? 'esgotado' : left + ' un'}</small>` : `<b>${off ? 'esgotado' : left}</b>`}${prices.length > 1 ? `<small>${money(pr)}</small>` : ''}${q ? `<em>${q} no carrinho</em>` : ''}</button>`;
        };
        let html;
        if (C.length === 1 || S.length === 1) {
            // Só tamanho (ou só cor): botões em fila
            const list = C.length === 1 ? S.map(s => [s, C[0]]) : C.map(c => [S[0], c]);
            html = `<div class="dpg-pchips">${list.map(([s, c]) => cell(s, c, true).replace('<b>' + esc(s || c) + '</b>', '<b>' + esc(C.length === 1 ? s : c) + '</b>')).join('')}</div>`;
        } else {
            html = `<div class="dpg-pmx"><table><thead><tr><th></th>${C.map(c => `<th>${esc(c)}</th>`).join('')}</tr></thead><tbody>${S.map(s => `<tr><th scope="row">${esc(s)}</th>${C.map(c => `<td>${cell(s, c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
        }
        W.B.innerHTML = html + `<div class="dpg-plegend">${C.length > 1 && S.length > 1 ? 'Linhas: tamanho · colunas: cor. O número é o que tem no estoque.' : 'Toque no tamanho. O número embaixo é o que tem no estoque.'} Com etiqueta na peça, é só bipar no PDV.</div>`;
        W.F.innerHTML = `<button type="button" class="btn btn-secondary" data-x>Fechar</button>`;
        W.B.addEventListener('click', e => {
            const b = e.target.closest('button[data-id]'); if (!b || b.disabled) return;
            W.close();
            try { window.addToCart(b.dataset.id); } catch (er) { console.warn(er); }
            const s = $('pdvSearch'); if (s && !matchMedia('(pointer: coarse)').matches) s.focus();
        });
        const first = W.B.querySelector('button[data-id]:not([disabled])'); if (first) setTimeout(() => first.focus(), 30);
    }

    /* =================== Produtos: cadastro com grade =================== */
    const pageList = () => { try { if (Array.isArray(allProducts)) return allProducts; } catch (e) { } return pdvProducts(); };
    const codeSeg = s => norm(s).replace(/[^a-z0-9]/g, '').slice(0, 4).toUpperCase() || 'X';
    function setupProdutos() {
        const modal = $('productModal'), stockInp = $('prodStock');
        if (!modal || !stockInp || $('dpgBox')) return;
        css();
        const stockRow = stockInp.closest('.form-row') || stockInp.closest('.form-group');
        const box = document.createElement('div'); box.id = 'dpgBox'; box.className = 'dpg-box'; box.style.display = 'none';
        box.innerHTML = `<label class="dpg-h"><input type="checkbox" id="dpgOn"><span class="dpg-ic">${ic('shirt', 'shirt')}</span><span><b>Grade de tamanho e cor</b><small id="dpgLead">Para roupa e calçado: cada tamanho e cor tem estoque e código de barras próprios. No PDV, tocar no produto pergunta qual tamanho e cor.</small></span></label>
<div class="dpg-body" id="dpgBody" hidden>
  <div class="dpg-g2">
    <div class="form-group"><label class="form-label" for="dpgPreset">Modelo de grade</label><select id="dpgPreset" class="form-control"></select></div>
    <div class="form-group"><label class="form-label">Tamanhos</label><div class="dpg-chips" id="dpgSizes"><input type="text" class="dpg-chip-in" placeholder="+ tamanho (Enter)" aria-label="Adicionar tamanho" autocomplete="off"></div></div>
  </div>
  <div class="form-group"><label class="form-label">Cores <small>(deixe sem cor se a peça só muda de tamanho)</small></label><div class="dpg-chips" id="dpgColors"><input type="text" class="dpg-chip-in" placeholder="+ cor (Enter)" aria-label="Adicionar cor" list="dpgColorList" autocomplete="off"></div><datalist id="dpgColorList">${COLORS.map(c => `<option value="${esc(c)}">`).join('')}</datalist><div class="dpg-sug" id="dpgSug"></div></div>
  <div class="dpg-tabs" id="dpgTabs"><button type="button" data-m="stock" class="on">Estoque</button><button type="button" data-m="min">Mínimo</button><button type="button" data-m="barcode">Código de barras</button><button type="button" data-m="price">Preço</button></div>
  <div class="dpg-hint" id="dpgHint"></div>
  <div class="dpg-mx" id="dpgMx"></div>
  <div class="dpg-foot"><span id="dpgInfo"></span><span class="sp"></span><button type="button" class="btn btn-outline btn-sm dpg-btn-ic" id="dpgPresetSave" hidden>${ic('save', 'floppy-disk')} Salvar tamanhos como modelo</button><button type="button" class="btn btn-outline btn-sm dpg-btn-ic" id="dpgLabels" hidden>${ic('tags', 'tags')} Etiquetas da grade</button></div>
</div>`;
        stockRow.parentElement.insertBefore(box, stockRow);
        const on = $('dpgOn');
        let G = null;
        const HINT = {
            stock: 'Quantas peças tem de cada tamanho e cor agora. Mudou o número de uma peça que já existe? O sistema registra o ajuste em Movimentações.',
            min: 'Abaixo deste número o tamanho aparece como estoque baixo (e na sugestão de compra).',
            barcode: 'Deixe vazio e o sistema gera um código interno (EAN-13) que o leitor do caixa reconhece. Se a peça já vem com o código do fornecedor, bipe ou digite aqui.',
            price: 'Deixe vazio para usar o preço do produto. Preencha só o que custa diferente (ex.: GG mais caro).'
        };
        const cur = () => { try { return typeof editingProductId !== 'undefined' && editingProductId ? pageList().find(x => x.id === editingProductId) || null : null; } catch (e) { return null; } };
        const salePrice = () => num($('prodPrice') && $('prodPrice').value);

        function load(p) {
            const ks = isParent(p) ? kidsOf(pageList(), p) : [];
            G = { parent: p, kids: ks, sizes: [], colors: [], preset: '', cells: {}, mode: 'stock' };
            if (isParent(p)) {
                const a = axes(p, ks); G.sizes = a.S.filter(Boolean); G.colors = a.C.filter(Boolean); G.preset = p.gradePreset || '';
                ks.forEach(k => { G.cells[keyOf(k.gradeSize, k.gradeColor)] = { id: k.id, stock: num(k.currentStock), stock0: num(k.currentStock), min: num(k.minStock), barcode: String(k.barcode || ''), price: k.gradeOwnPrice ? r2(k.salePrice) : '' }; });
            }
            on.checked = isParent(p);
            on.disabled = isParent(p) && ks.length > 0;
            $('dpgLead').textContent = on.disabled ? `Esta peça tem ${ks.length} ${plural(ks.length, 'tamanho/cor cadastrado', 'tamanhos/cores cadastrados')}, cada um com estoque e código próprios.` : 'Para roupa e calçado: cada tamanho e cor tem estoque e código de barras próprios. No PDV, tocar no produto pergunta qual tamanho e cor.';
            box.style.display = enabled() || isParent(p) ? '' : 'none';
            paint();
        }
        function paint() {
            const isOn = on.checked;
            $('dpgBody').hidden = !isOn; box.classList.toggle('on', isOn);
            ['prodStock', 'prodMinStock'].forEach(id => { const g = $(id) && $(id).closest('.form-group'); if (g) g.classList.toggle('dpg-hide', isOn); });
            // Peça com grade é sempre produto (o "Tipo do item" do cadastro-flex-v1.js leria o pai como serviço)
            const tg = $('dpfTypeGroup');
            if (tg) { tg.classList.toggle('dpg-hide', isOn); const r = tg.querySelector('label[data-v="product"] input'); if (isOn && r && !r.checked) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); } }
            if (!isOn || !G) return;
            const sel = $('dpgPreset'), ps = presets();
            const match = ps.find(x => x.sizes.join('|') === G.sizes.join('|'));
            if (match) G.preset = match.id;
            sel.innerHTML = ps.map(x => `<option value="${esc(x.id)}">${esc(x.name)}</option>`).join('') + `<option value="">Personalizado</option>`;
            sel.value = match ? match.id : '';
            chips('dpgSizes', G.sizes); chips('dpgColors', G.colors);
            $('dpgSug').innerHTML = COLORS.filter(c => !G.colors.some(x => norm(x) === norm(c))).slice(0, 9).map(c => `<button type="button" data-c="${esc(c)}">+ ${esc(c)}</button>`).join('');
            $('dpgTabs').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.m === G.mode));
            $('dpgHint').textContent = HINT[G.mode];
            $('dpgPresetSave').hidden = !G.sizes.length || !!match;
            $('dpgLabels').hidden = !(G.parent && G.kids.length && window.DPEtiquetas);
            matrix();
        }
        function chips(id, arr) {
            const host = $(id), inp = host.querySelector('.dpg-chip-in');
            host.querySelectorAll('.dpg-chip').forEach(x => x.remove());
            arr.forEach((v, i) => { const s = document.createElement('span'); s.className = 'dpg-chip'; s.innerHTML = `${esc(v)}<button type="button" data-i="${i}" aria-label="Tirar ${esc(v)}">${ic('x', 'xmark')}</button>`; host.insertBefore(s, inp); });
        }
        const cols = () => G.colors.length ? G.colors : [''];
        function cellVal(k) {
            const c = G.cells[k] || {};
            if (G.mode === 'stock') return c.stock === undefined || c.stock === '' ? '' : qf(c.stock);
            if (G.mode === 'min') return c.min ? qf(c.min) : '';
            if (G.mode === 'barcode') return c.barcode || '';
            return c.price === '' || c.price === undefined ? '' : String(c.price).replace('.', ',');
        }
        function matrix() {
            const mx = $('dpgMx'), S = G.sizes, C = cols(), m = G.mode;
            if (!S.length) { mx.innerHTML = `<div class="dpg-empty">Escolha o modelo de grade ou digite os tamanhos.</div>`; info(); return; }
            const totals = m === 'stock';
            const ph = k => m === 'barcode' ? ((G.cells[k] || {}).id ? 'sem código' : 'gerado ao salvar') : m === 'price' ? (salePrice() ? money(salePrice()).replace(/\s/g, ' ') : 'preço') : '0';
            const inp = (s, c) => { const k = keyOf(s, c), cell = G.cells[k] || {}; const changed = m === 'stock' && cell.id && cell.stock !== undefined && num(cell.stock) !== num(cell.stock0); return `<td><input class="dpg-in${m === 'barcode' ? ' w' : ''}${changed ? ' chg' : ''}" data-k="${esc(k)}" value="${esc(cellVal(k))}" inputmode="${m === 'barcode' ? 'numeric' : 'decimal'}" placeholder="${esc(ph(k))}" aria-label="${esc(label(s, c) || s)}" autocomplete="off">${changed ? `<span class="dpg-cur">era ${qf(cell.stock0)}</span>` : ''}</td>`; };
            mx.innerHTML = `<table><thead><tr><th>${C.length > 1 || C[0] ? 'Tam. \\ Cor' : 'Tamanho'}</th>${C.map(c => `<th>${esc(c || (m === 'stock' ? 'Peças' : m === 'min' ? 'Mínimo' : m === 'barcode' ? 'Código' : 'Preço'))}</th>`).join('')}${totals && C.length > 1 ? '<th class="t">Total</th>' : ''}</tr></thead>
<tbody>${S.map(s => `<tr><th scope="row">${esc(s)}</th>${C.map(c => inp(s, c)).join('')}${totals && C.length > 1 ? `<td class="t" data-tr="${esc(s)}"></td>` : ''}</tr>`).join('')}</tbody>
${totals ? `<tfoot><tr><td style="text-align:left;padding-left:8px">Total</td>${C.map(c => `<td data-tc="${esc(c)}"></td>`).join('')}${C.length > 1 ? '<td data-tt></td>' : ''}</tr></tfoot>` : ''}</table>`;
            sums(); info();
        }
        function sums() {
            if (G.mode !== 'stock') return;
            const S = G.sizes, C = cols(), v = (s, c) => num((G.cells[keyOf(s, c)] || {}).stock);
            const mx = $('dpgMx');
            S.forEach(s => { const td = mx.querySelector(`[data-tr="${CSS.escape(s)}"]`); if (td) td.textContent = qf(C.reduce((a, c) => a + v(s, c), 0)); });
            C.forEach(c => { const td = mx.querySelector(`[data-tc="${CSS.escape(c)}"]`); if (td) td.textContent = qf(S.reduce((a, s) => a + v(s, c), 0)); });
            const tt = mx.querySelector('[data-tt]'); if (tt) tt.textContent = qf(S.reduce((a, s) => a + C.reduce((b, c) => b + v(s, c), 0), 0));
        }
        function info() {
            const n = G.sizes.length * cols().length, pcs = G.sizes.reduce((a, s) => a + cols().reduce((b, c) => b + num((G.cells[keyOf(s, c)] || {}).stock), 0), 0);
            const nova = G.sizes.reduce((a, s) => a + cols().filter(c => !(G.cells[keyOf(s, c)] || {}).id).length, 0);
            $('dpgInfo').innerHTML = n ? `<b>${n}</b> ${plural(n, 'tamanho/cor', 'tamanhos/cores')} · <b>${qf(pcs)}</b> ${plural(pcs, 'peça', 'peças')}${G.parent && nova ? ` · ${nova} ${plural(nova, 'novo', 'novos')} ao salvar` : ''}` : '';
        }
        function addTo(arr, raw) {
            String(raw || '').split(/[,;\n]+/).map(x => x.trim().replace(/\s+/g, ' ')).filter(Boolean).forEach(v => { v = v.slice(0, 24); if (!arr.some(x => norm(x) === norm(v))) arr.push(v); });
        }
        // eventos do quadro
        on.addEventListener('change', () => {
            if (on.checked && G && !G.sizes.length) {
                const p = presets().find(x => x.id === suggestPreset($('prodCategory') && $('prodCategory').value, $('prodName') && $('prodName').value)) || FACTORY[0];
                G.sizes = [...p.sizes]; G.preset = p.id;
            }
            if (on.checked && G && !G.parent) {
                const st = num($('prodStock') && $('prodStock').value);
                if (st > 0) toast('info', `O estoque de ${qf(st)} informado acima não vale na grade: informe as peças de cada tamanho e cor.`);
            }
            paint();
        });
        $('dpgPreset').addEventListener('change', e => {
            const p = presets().find(x => x.id === e.target.value); if (!p) { G.preset = ''; paint(); return; }
            G.sizes = [...p.sizes]; G.preset = p.id; paint();
        });
        ['dpgSizes', 'dpgColors'].forEach(id => {
            const host = $(id), inp = host.querySelector('.dpg-chip-in'), arr = () => id === 'dpgSizes' ? G.sizes : G.colors;
            host.addEventListener('click', e => {
                const b = e.target.closest('.dpg-chip button');
                if (b) { arr().splice(+b.dataset.i, 1); if (id === 'dpgSizes') G.preset = ''; paint(); host.querySelector('.dpg-chip-in').focus(); return; }
                if (e.target === host) inp.focus();
            });
            inp.addEventListener('keydown', e => {
                if ((e.key === 'Enter' || e.key === ',' || e.key === 'Tab') && inp.value.trim()) { e.preventDefault(); addTo(arr(), inp.value); inp.value = ''; if (id === 'dpgSizes') G.preset = ''; paint(); host.querySelector('.dpg-chip-in').focus(); }
                else if (e.key === 'Enter') e.preventDefault();
                else if (e.key === 'Backspace' && !inp.value && arr().length) { arr().pop(); paint(); host.querySelector('.dpg-chip-in').focus(); }
            });
            inp.addEventListener('blur', () => { if (inp.value.trim()) { addTo(arr(), inp.value); inp.value = ''; paint(); } });
            inp.addEventListener('input', () => { if (id === 'dpgColors' && COLORS.includes(inp.value)) { addTo(arr(), inp.value); inp.value = ''; paint(); host.querySelector('.dpg-chip-in').focus(); } });
        });
        $('dpgSug').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (!b) return; addTo(G.colors, b.dataset.c); paint(); });
        $('dpgTabs').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (!b) return; G.mode = b.dataset.m; paint(); const f = $('dpgMx').querySelector('.dpg-in'); if (f) f.focus(); });
        $('dpgMx').addEventListener('input', e => {
            const t = e.target.closest('.dpg-in'); if (!t) return;
            const k = t.dataset.k, c = G.cells[k] = G.cells[k] || {}, v = t.value;
            if (G.mode === 'stock') {
                c.stock = v.trim() === '' ? (c.id ? c.stock0 : '') : Math.max(0, num(v));
                const ch = !!c.id && num(c.stock) !== num(c.stock0); t.classList.toggle('chg', ch);
                let sp = t.parentElement.querySelector('.dpg-cur');
                if (ch) { if (!sp) { sp = document.createElement('span'); sp.className = 'dpg-cur'; t.after(sp); } sp.textContent = 'era ' + qf(c.stock0); } else if (sp) sp.remove();
                sums(); info();
            }
            else if (G.mode === 'min') c.min = Math.max(0, num(v));
            else if (G.mode === 'barcode') c.barcode = v.replace(/\s+/g, '').slice(0, 40);
            else c.price = v.trim() === '' ? '' : r2(v);
        });
        $('dpgMx').addEventListener('keydown', e => {
            const t = e.target.closest('.dpg-in'); if (!t || e.key !== 'Enter') return;
            e.preventDefault(); // Enter desce para a próxima célula (o leitor de código manda Enter no fim)
            const all = [...$('dpgMx').querySelectorAll('.dpg-in')], i = all.indexOf(t), n = cols().length;
            const next = all[i + n] || all[i + 1]; if (next) { next.focus(); next.select(); }
        });
        $('dpgMx').addEventListener('focusin', e => { const t = e.target.closest('.dpg-in'); if (t) setTimeout(() => t.select(), 0); });
        $('dpgPresetSave').addEventListener('click', async () => {
            const name = window.prompt('Nome do modelo de grade (ex.: Plus size, Infantil 1 ao 8):', '');
            if (!name || !name.trim()) return;
            try { await loadCfg(); const list = [...(CFG.gradePresets || []), { id: 'c' + Date.now().toString(36), name: name.trim().slice(0, 40), sizes: [...G.sizes] }]; await saveCfg({ gradePresets: list }); toast('success', 'Modelo salvo. Ele aparece na lista de modelos de grade.'); paint(); }
            catch (e) { toast('error', 'Não foi possível salvar o modelo: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
        $('dpgLabels').addEventListener('click', () => { if (!G || !G.parent || !window.DPEtiquetas) return; DPEtiquetas.open({ items: kidsOf(pageList(), G.parent).map(k => ({ product: k, qty: Math.max(0, Math.floor(num(k.currentStock))) })), title: `Etiquetas · ${G.parent.name}` }); });

        // Abrir o cadastro
        const oOpen = window.openProductModal;
        if (typeof oOpen === 'function') window.openProductModal = function () {
            const r = oOpen.apply(this, arguments);
            try { load(cur()); loadCfg().then(() => { if (G) box.style.display = enabled() || isParent(G.parent) ? '' : 'none'; }); } catch (e) { console.warn('grade', e); }
            return r;
        };
        // Conferir antes de salvar
        function validate() {
            if (!G.sizes.length) return 'Informe pelo menos um tamanho na grade (ou escolha um modelo).';
            const combos = G.sizes.length * cols().length;
            if (combos > 400) return `São ${combos} combinações de tamanho e cor. O máximo é 400 por produto.`;
            const keys = new Set(); G.sizes.forEach(s => cols().forEach(c => keys.add(keyOf(s, c))));
            for (const k of G.kids) {
                const key = keyOf(k.gradeSize, k.gradeColor), cell = G.cells[key] || {};
                const left = cell.stock === undefined || cell.stock === '' ? num(k.currentStock) : num(cell.stock);
                if (!keys.has(key) && left > 0) return `${label(k.gradeSize, k.gradeColor)} ainda tem ${qf(left)} ${plural(left, 'peça', 'peças')} no estoque. Para tirar da grade, zere o estoque dele primeiro (volte o tamanho/cor, ponha 0 e salve).`;
            }
            const mine = new Set([G.parent && G.parent.id, ...G.kids.map(k => k.id)].filter(Boolean)), seen = {};
            const others = pageList().filter(p => !p.deleted && !mine.has(p.id));
            for (const k of keys) {
                const b = String((G.cells[k] || {}).barcode || '').trim(); if (!b) continue;
                const [s, c] = k.split('|');
                if (seen[b]) return `O código ${b} está em ${seen[b]} e em ${label(s, c)}. Cada tamanho/cor precisa de um código diferente.`;
                seen[b] = label(s, c);
                const o = others.find(p => (window.DPBarcode ? DPBarcode.codesIn(p.barcode) : [String(p.barcode || '')]).includes(b) || String(p.code || '') === b);
                if (o) return `O código ${b} (${label(s, c)}) já está em "${o.name}".`;
            }
            return '';
        }
        const oSave = window.saveProduct;
        if (typeof oSave === 'function') window.saveProduct = function () {
            if (on.checked && G) {
                const err = validate();
                if (err) { G.mode = /código/.test(err) ? 'barcode' : 'stock'; paint(); try { box.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch (e) { } toast('warning', err); return; }
            }
            return oSave.apply(this, arguments);
        };
        // Gravar: o pai passa pelo cadastro normal e os filhos são gravados logo depois
        const S = svc();
        if (S && !S.__dpGrade) {
            S.__dpGrade = true;
            ['create', 'update'].forEach(name => {
                const orig = S[name]; if (typeof orig !== 'function') return;
                S[name] = async function (col, a, b) {
                    const data = name === 'create' ? a : b;
                    const mine = col === 'products' && data && typeof data === 'object' && 'name' in data && 'salePrice' in data && modal.classList.contains('active') && on.checked && G;
                    if (!mine) return orig.apply(this, arguments);
                    const g = G;
                    Object.assign(data, { isGradeParent: true, gradeSizes: [...g.sizes], gradeColors: [...g.colors], gradePreset: g.preset || '' });
                    const r = await orig.apply(this, arguments);
                    const pid = name === 'create' ? (r && r.id) : a;
                    if (pid) {
                        try { const res = await syncChildren(pid, data, g); if (res.created && res.pieces) PENDING_LABELS = pid; }
                        catch (e) { console.error('grade', e); toast('error', 'O produto foi salvo, mas a grade não terminou de gravar: ' + e.message + '. Abra o produto e salve de novo.'); }
                    }
                    return r;
                };
            });
        }
        // Depois de salvar uma grade nova: oferece as etiquetas
        let PENDING_LABELS = '';
        const oLoad = window.loadProductsList;
        if (typeof oLoad === 'function') window.loadProductsList = async function () {
            const r = await oLoad.apply(this, arguments);
            if (PENDING_LABELS && window.DPEtiquetas) {
                const pid = PENDING_LABELS; PENDING_LABELS = '';
                const p = pageList().find(x => x.id === pid), ks = p ? kidsOf(pageList(), p) : [], pcs = sumStock(ks);
                if (p && pcs > 0) Confirm.show('Etiquetas', `${esc(p.name)}: ${ks.length} ${plural(ks.length, 'tamanho/cor', 'tamanhos/cores')} com ${qf(pcs)} ${plural(pcs, 'peça', 'peças')}. Imprimir as etiquetas agora?`, () => DPEtiquetas.open({ items: ks.map(k => ({ product: k, qty: Math.max(0, Math.floor(num(k.currentStock))) })), title: `Etiquetas · ${p.name}` }));
            }
            return r;
        };
        setupLista();
        loadCfg().then(() => { const p = cur(); if (G && modal.classList.contains('active')) box.style.display = enabled() || isParent(p) ? '' : 'none'; });
    }

    // Grava os filhos de uma grade (cria, atualiza, ajusta estoque e tira os que saíram)
    async function syncChildren(pid, data, g) {
        const all = pageList();
        const prev = all.find(x => x.id === pid);
        const kids = kidsOf(all, pid);
        const C = g.colors.length ? g.colors : [''];
        const combos = []; g.sizes.forEach((s, i) => C.forEach((c, j) => combos.push({ s, c, order: i * 100 + j })));
        // 1) Produto que tinha estoque e virou grade: o estoque dele vai a zero (fica registrado)
        if (prev && !isParent(prev) && num(prev.currentStock) !== 0 && typeof StockService !== 'undefined') { try { await StockService.adjust(pid, 0, 'O estoque passou para a grade de tamanho e cor'); } catch (e) { } }
        // 2) Pai
        await db.collection('products').doc(pid).update({ isGradeParent: true, gradeSizes: [...g.sizes], gradeColors: [...g.colors], gradePreset: g.preset || '', gradeCount: combos.length, controlStock: false, productType: 'product', currentStock: 0, minStock: 0, updatedAt: ts() });
        // 3) Códigos de barras que faltam
        const need = combos.filter(x => !String((g.cells[keyOf(x.s, x.c)] || {}).barcode || '').trim()).length;
        const codes = need && window.DPBarcode ? await DPBarcode.novos(need, all.map(p => p.barcode)) : [];
        let ci = 0;
        const cost = r2(data.costPrice), sale = r2(data.salePrice);
        const pick = ['category', 'categoryId', 'brand', 'unit', 'volume', 'promoPrice', 'promoUntil', 'imageType', 'icon', 'imageUrl', 'imageFile', 'status', 'active', 'description', 'supplierId', 'supplierName', 'stockLocation', 'ncm', 'cest', 'cfop', 'csosn', 'origem', 'fiscal', 'priceTiers', 'wholesalePrice'];
        const base = {}; pick.forEach(k => { if (data[k] !== undefined) base[k] = data[k]; });
        const usedCodes = new Set();
        const res = { created: 0, updated: 0, removed: 0, pieces: 0 };
        const batchOps = [];
        for (const x of combos) {
            const k = keyOf(x.s, x.c), cell = g.cells[k] || {};
            const own = cell.price !== '' && cell.price !== undefined && num(cell.price) > 0 && Math.abs(num(cell.price) - sale) > 0.004;
            const price = own ? r2(cell.price) : sale;
            let code = data.code ? `${data.code}-${codeSeg(x.s)}${x.c ? '-' + codeSeg(x.c) : ''}` : '';
            if (code) { let c2 = code, n = 2; while (usedCodes.has(c2)) c2 = code + n++; code = c2; usedCodes.add(code); }
            const child = clean({
                ...base, name: childName(data.name, x.s, x.c), gradeBaseName: String(data.name || '').trim(), gradeParentId: pid, gradeSize: x.s, gradeColor: x.c, gradeOrder: x.order,
                gradeOwnPrice: own, salePrice: price, costPrice: cost, profitMargin: cost > 0 ? Math.round((price - cost) / cost * 1000) / 10 : 0, code,
                barcode: String(cell.barcode || '').trim() || codes[ci++] || '', minStock: Math.max(0, num(cell.min)), productType: 'product', controlStock: true
            });
            const kid = (cell.id && kids.find(q => q.id === cell.id)) || kidAt(kids, x.s, x.c);
            const want = cell.stock === undefined || cell.stock === '' ? null : Math.max(0, num(cell.stock));
            if (kid) {
                kid._done = true;
                batchOps.push(['update', db.collection('products').doc(kid.id), { ...child, updatedAt: ts(), updatedBy: uid() }]);
                if (want !== null && want !== num(kid.currentStock)) batchOps.push(['adjust', kid.id, want]);
                res.updated++; res.pieces += want === null ? num(kid.currentStock) : want;
            } else {
                const ref = db.collection('products').doc(), st = want || 0;
                batchOps.push(['set', ref, { ...child, currentStock: st, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() }]);
                if (st > 0) batchOps.push(['set', db.collection('stock_movements').doc(), { productId: ref.id, productName: child.name, type: 'entry', quantity: st, previousStock: 0, newStock: st, reason: 'Saldo inicial da grade', referenceType: 'grade', referenceId: pid, costPrice: cost, notes: '', deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() }]);
                res.created++; res.pieces += st;
            }
        }
        // 4) Tamanho/cor que saiu da grade (estoque zerado antes, na conferência)
        for (const k of kids) {
            if (k._done) { delete k._done; continue; }
            if (num(k.currentStock) > 0) batchOps.push(['adjust', k.id, 0]);
            batchOps.push(['update', db.collection('products').doc(k.id), { deleted: true, deletedAt: ts(), deletedBy: uid(), status: 'inactive', active: false, updatedAt: ts() }]);
            res.removed++;
        }
        // Grava em lotes (rápido no servidor) e ajusta o estoque pelo StockService (fica em Movimentações)
        const writes = batchOps.filter(o => o[0] !== 'adjust');
        for (let i = 0; i < writes.length; i += 40) {
            const bt = db.batch();
            writes.slice(i, i + 40).forEach(([kind, ref, d]) => kind === 'set' ? bt.set(ref, d) : bt.update(ref, d));
            await bt.commit();
        }
        for (const [, id, q] of batchOps.filter(o => o[0] === 'adjust')) { try { await StockService.adjust(id, q, 'Ajuste pela grade do produto'); } catch (e) { console.warn('grade estoque', e); } }
        try { AuditService.log('update', 'products', pid, { grade: `${g.sizes.length}×${C.length}`, created: res.created, removed: res.removed }); } catch (e) { }
        return res;
    }

    /* =================== Produtos: lista só com o pai =================== */
    function parentStatus(ks) {
        const total = sumStock(ks), zero = ks.filter(k => num(k.currentStock) <= 0).length, low = ks.filter(k => num(k.currentStock) > 0 && num(k.currentStock) <= num(k.minStock)).length;
        if (!ks.length) return { cls: 'out', txt: 'Sem tamanhos', key: 'nostock', total };
        if (total <= 0) return { cls: 'out', txt: 'Sem estoque', key: 'nostock', total };
        if (zero) return { cls: 'low', txt: `${zero} ${plural(zero, 'esgotado', 'esgotados')}`, key: 'lowstock', total };
        if (low) return { cls: 'low', txt: `${low} ${plural(low, 'baixo', 'baixos')}`, key: 'lowstock', total };
        return { cls: 'ok', txt: 'Normal', key: '', total };
    }
    function setupLista() {
        if (typeof window.renderProductsTableData !== 'function' || window.renderProductsTableData.__dpg) return;
        const val = id => ($(id) && $(id).value) || '';
        const oRender = window.renderProductsTableData;
        const w = function (filtered) {
            try { filtered = forTable(filtered); } catch (e) { console.warn('grade lista', e); }
            const r = oRender.call(this, filtered);
            try { markRows(); } catch (e) { }
            return r;
        };
        w.__dpg = true; window.renderProductsTableData = w;
        function forTable(filtered) {
            const all = pageList(); if (!all.some(isParent)) return filtered;
            const byId = new Map(all.map(p => [p.id, p]));
            const q = norm(val('productSearch')), cat = val('filterCategory'), st = val('filterStatus');
            const hit = p => !q || [p.name, p.code, p.barcode, p.brand].some(v => norm(v).includes(q));
            const out = filtered.filter(p => !isParent(p) && !(p.gradeParentId && byId.get(p.gradeParentId) && !byId.get(p.gradeParentId).deleted));
            all.filter(isParent).forEach(p => {
                const ks = kidsOf(all, p);
                if (q && !hit(p) && !ks.some(hit)) return;
                if (cat && p.category !== cat) return;
                if (st === 'active' && p.status === 'inactive') return;
                if (st === 'inactive' && p.status !== 'inactive') return;
                const s = parentStatus(ks);
                if ((st === 'lowstock' || st === 'nostock') && s.key !== st) return;
                out.push({ ...p, currentStock: s.total, minStock: ks.reduce((a, k) => a + num(k.minStock), 0), _gradeKids: ks.length });
            });
            return out.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
        }
        function markRows() {
            const all = pageList();
            document.querySelectorAll('#productsTable tr').forEach(tr => {
                const id = ((tr.innerHTML.match(/openProductModal\('([^']+)'\)/) || [])[1]); if (!id) return;
                const p = all.find(x => x.id === id); if (!isParent(p)) return;
                const ks = kidsOf(all, p), s = parentStatus(ks), tds = tr.children;
                const nm = tds[1] && tds[1].querySelector('strong'); if (nm && !nm.parentElement.querySelector('.dpg-tag')) nm.insertAdjacentHTML('afterend', `<span class="dpg-tag" title="${esc(ks.map(k => label(k.gradeSize, k.gradeColor) + ': ' + qf(k.currentStock)).join(' · '))}">${ic('shirt', 'shirt')}Grade · ${ks.length}</span>`);
                if (tds[9]) tds[9].innerHTML = `<span class="dpg-st ${s.cls}">${esc(s.txt)}</span>`;
                const se = tr.querySelector('button[onclick^="openStockEntry"]'); if (se) se.title = 'Entrada ou contagem pela grade';
            });
        }
        // Cartões do topo: o pai conta uma vez, com a situação dos tamanhos
        const oStats = window.updateStats;
        if (typeof oStats === 'function') window.updateStats = function () {
            const r = oStats.apply(this, arguments);
            try {
                const all = pageList(); if (!all.some(isParent)) return r;
                const list = all.filter(p => !(p.gradeParentId && all.some(x => x.id === p.gradeParentId && !x.deleted)));
                const low = list.filter(p => isParent(p) ? parentStatus(kidsOf(all, p)).key === 'lowstock' : (num(p.currentStock) > 0 && num(p.currentStock) <= num(p.minStock))).length;
                const none = list.filter(p => isParent(p) ? parentStatus(kidsOf(all, p)).key === 'nostock' : num(p.currentStock) <= 0).length;
                const el = document.querySelectorAll('.stat-value');
                if (el[0]) el[0].textContent = list.length; if (el[1]) el[1].textContent = list.filter(p => p.status !== 'inactive').length;
                if (el[2]) el[2].textContent = low; if (el[3]) el[3].textContent = none;
            } catch (e) { }
            return r;
        };
        // Entrada de estoque do pai = pela grade
        const oEntry = window.openStockEntry;
        if (typeof oEntry === 'function') window.openStockEntry = function (id) {
            const p = pageList().find(x => x.id === id);
            if (isParent(p)) { openStock(p, { list: pageList(), onDone: () => { try { window.loadProductsList(); } catch (e) { } } }); return; }
            return oEntry.apply(this, arguments);
        };
        // Excluir o pai leva os filhos junto
        const oDel = window.deleteProduct;
        if (typeof oDel === 'function') window.deleteProduct = function (id, name) {
            const all = pageList(), p = all.find(x => x.id === id);
            if (!isParent(p)) return oDel.apply(this, arguments);
            const ks = kidsOf(all, p), pcs = sumStock(ks);
            Confirm.show('Excluir produto com grade', `Excluir <strong>${esc(p.name)}</strong> e os ${ks.length} ${plural(ks.length, 'tamanho/cor', 'tamanhos/cores')}?${pcs > 0 ? `<br><br>Ainda há <b>${qf(pcs)} ${plural(pcs, 'peça', 'peças')}</b> no estoque desta grade.` : ''}`, async () => {
                try {
                    const del = { deleted: true, deletedAt: ts(), deletedBy: uid(), updatedAt: ts() };
                    const bt = db.batch(); [p, ...ks].forEach(x => bt.update(db.collection('products').doc(x.id), del)); await bt.commit();
                    try { AuditService.log('delete', 'products', p.id, { name: p.name, grade: ks.length }); } catch (e) { }
                    toast('success', 'Produto e grade excluídos.'); await window.loadProductsList();
                } catch (e) { toast('error', 'Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            });
        };
        // A lista pode ter sido desenhada antes deste arquivo chegar (conexão lenta): redesenha já agrupada
        try { if (pageList().some(isParent)) { if (typeof window.applyProductFilters === 'function') window.applyProductFilters(); if (typeof window.updateStats === 'function') window.updateStats(); } } catch (e) { }
    }

    /* =================== Entrada / contagem pela matriz =================== */
    async function freshProducts() { try { return docsOf(await db.collection('products').get()).filter(p => !p.deleted); } catch (e) { return []; } }
    async function openStock(parent, opts) {
        opts = opts || {};
        const all = opts.list || await freshProducts();
        const p = all.find(x => x.id === parent.id) || parent, ks = kidsOf(all, p);
        if (!ks.length) { toast('warning', 'Este produto ainda não tem tamanhos. Edite o produto e monte a grade.'); return; }
        const { S, C } = axes(p, ks);
        let mode = opts.mode === 'count' ? 'count' : 'entry';
        const vals = {};
        const W = overlay('dpgStock', 'dpg-m', `Estoque pela grade · ${esc(p.name)}`, 'boxes');
        W.B.innerHTML = `<div class="dpg-seg" id="dpgsMode"><button type="button" data-m="entry">Entrada (somar)</button><button type="button" data-m="count">Contagem (estoque exato)</button></div>
<div class="dpg-hint" id="dpgsHint"></div><div class="dpg-mx" id="dpgsMx"></div>
<div class="dpg-row"><div class="form-group" style="margin:0"><label class="form-label" for="dpgsWhy">Motivo</label><input type="text" id="dpgsWhy" class="form-control" maxlength="120"></div>
<div class="form-group" style="margin:0" id="dpgsCostG"><label class="form-label" for="dpgsCost">Custo pago por peça (opcional)</label><input type="text" id="dpgsCost" class="form-control" inputmode="decimal" placeholder="${esc(money(p.costPrice))}"></div></div>`;
        W.F.innerHTML = `<span id="dpgsTot" style="margin-right:auto;font-size:13px;color:var(--text-secondary)"></span>${window.DPEtiquetas ? `<button type="button" class="btn btn-outline dpg-btn-ic" id="dpgsLabels">${ic('tags', 'tags')} Etiquetas</button>` : ''}<button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary dpg-btn-ic" id="dpgsOk">${ic('check', 'check')} Confirmar</button>`;
        const paint = () => {
            W.ov.querySelectorAll('#dpgsMode button').forEach(b => b.classList.toggle('on', b.dataset.m === mode));
            $('dpgsHint').textContent = mode === 'entry' ? 'Digite quantas peças estão chegando de cada tamanho e cor. Elas somam ao estoque atual.' : 'Digite quantas peças você contou de cada tamanho e cor. O estoque fica igual ao número digitado (vazio = não mexe).';
            const why = $('dpgsWhy'); if (!why.dataset.touched) why.value = mode === 'entry' ? 'Entrada de mercadoria' : 'Contagem do estoque (inventário)';
            $('dpgsCostG').style.display = mode === 'entry' ? '' : 'none';
            $('dpgsMx').innerHTML = `<table><thead><tr><th>${C.length > 1 || C[0] ? 'Tam. \\ Cor' : 'Tamanho'}</th>${C.map(c => `<th>${esc(c || 'Peças')}</th>`).join('')}</tr></thead><tbody>${S.map(s => `<tr><th scope="row">${esc(s || '—')}</th>${C.map(c => { const k = kidAt(ks, s, c); if (!k) return '<td><span class="dpg-cur">—</span></td>'; return `<td><input class="dpg-in" data-id="${esc(k.id)}" value="${esc(vals[k.id] ?? '')}" inputmode="decimal" placeholder="${mode === 'entry' ? '0' : qf(k.currentStock)}" aria-label="${esc(label(s, c))}" autocomplete="off"><span class="dpg-cur">tem ${qf(k.currentStock)}</span></td>`; }).join('')}</tr>`).join('')}</tbody></table>`;
            tot();
        };
        const tot = () => {
            const n = Object.values(vals).reduce((a, v) => a + (v === '' ? 0 : num(v)), 0);
            $('dpgsTot').innerHTML = mode === 'entry' ? `Entrando: <b>${qf(n)}</b> ${plural(n, 'peça', 'peças')}` : `${Object.values(vals).filter(v => v !== '').length} tamanho(s) contado(s)`;
        };
        W.ov.querySelector('#dpgsMode').addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b && b.dataset.m !== mode) { mode = b.dataset.m; Object.keys(vals).forEach(k => delete vals[k]); paint(); } });
        $('dpgsWhy').addEventListener('input', e => { e.target.dataset.touched = '1'; });
        $('dpgsMx').addEventListener('input', e => { const t = e.target.closest('.dpg-in'); if (!t) return; vals[t.dataset.id] = t.value.trim() === '' ? '' : Math.max(0, num(t.value)); tot(); });
        $('dpgsMx').addEventListener('keydown', e => { const t = e.target.closest('.dpg-in'); if (!t || e.key !== 'Enter') return; e.preventDefault(); const list = [...$('dpgsMx').querySelectorAll('.dpg-in')], i = list.indexOf(t), next = list[i + C.length] || list[i + 1]; if (next) next.focus(); });
        $('dpgsMx').addEventListener('focusin', e => { const t = e.target.closest('.dpg-in'); if (t) setTimeout(() => t.select(), 0); });
        const lb = $('dpgsLabels');
        if (lb) lb.addEventListener('click', () => {
            const items = ks.map(k => ({ product: k, qty: mode === 'entry' && vals[k.id] !== undefined && vals[k.id] !== '' ? Math.round(num(vals[k.id])) : Math.max(0, Math.floor(num(k.currentStock))) })).filter(i => i.qty > 0);
            DPEtiquetas.open({ items: items.length ? items : ks.map(k => ({ product: k, qty: 1 })), title: `Etiquetas · ${p.name}` });
        });
        $('dpgsOk').addEventListener('click', async e => {
            const btn = e.currentTarget, why = $('dpgsWhy').value.trim() || (mode === 'entry' ? 'Entrada de mercadoria' : 'Contagem do estoque');
            const todo = ks.filter(k => vals[k.id] !== undefined && vals[k.id] !== '' && (mode === 'count' ? num(vals[k.id]) !== num(k.currentStock) : num(vals[k.id]) > 0));
            if (!todo.length) { toast('warning', mode === 'entry' ? 'Digite a quantidade que está chegando em pelo menos um tamanho.' : 'Nenhum número diferente do estoque atual.'); return; }
            const cost = mode === 'entry' ? num($('dpgsCost').value) : 0;
            btn.disabled = true; btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Gravando...`;
            try {
                for (const k of todo) {
                    const q = num(vals[k.id]);
                    if (mode === 'entry') {
                        await StockService.entry(k.id, q, why, 'manual', '');
                        if (cost > 0) { const old = Math.max(0, num(k.currentStock)), avg = old + q > 0 ? r2((old * num(k.costPrice) + q * cost) / (old + q)) : cost; await db.collection('products').doc(k.id).update({ costPrice: avg, updatedAt: ts() }); }
                    } else await StockService.adjust(k.id, q, why);
                }
                if (mode === 'entry' && cost > 0) { try { await db.collection('products').doc(p.id).update({ costPrice: r2(cost), updatedAt: ts() }); } catch (er) { } }
                const n = todo.reduce((a, k) => a + num(vals[k.id]), 0);
                toast('success', mode === 'entry' ? `Entrada de ${qf(n)} ${plural(n, 'peça', 'peças')} em ${p.name}.` : `Estoque de ${todo.length} tamanho(s) corrigido.`);
                const printed = mode === 'entry' && window.DPEtiquetas ? todo.map(k => ({ product: { ...k, currentStock: num(k.currentStock) + num(vals[k.id]) }, qty: Math.round(num(vals[k.id])) })) : null;
                W.close();
                if (opts.onDone) opts.onDone();
                if (printed && printed.length) Confirm.show('Etiquetas', `Imprimir as etiquetas das ${qf(n)} ${plural(n, 'peça', 'peças')} que chegaram?`, () => DPEtiquetas.open({ items: printed, title: `Etiquetas da entrada · ${p.name}` }));
            } catch (er) { console.error(er); toast('error', 'Erro ao gravar: ' + (window.dpErroHumano ? dpErroHumano(er) : (er && er.message))); btn.disabled = false; btn.innerHTML = `${ic('check', 'check')} Confirmar`; }
        });
        paint();
        setTimeout(() => { const f = $('dpgsMx') && $('dpgsMx').querySelector('.dpg-in'); if (f) f.focus(); }, 40);
    }
    // Escolher um produto com grade (Estoque e Compras)
    async function pickParent(title, then) {
        const all = await freshProducts(), list = all.filter(isParent);
        if (!list.length) { toast('info', 'Nenhum produto com grade ainda. Em Produtos, abra a peça e ligue "Grade de tamanho e cor".'); return; }
        const W = overlay('dpgPickP', 'dpg-m', esc(title), 'shirt');
        W.B.innerHTML = `<input type="text" class="form-control" id="dpgpQ" placeholder="Buscar produto com grade..." autocomplete="off" style="margin-bottom:10px"><div id="dpgpL" style="display:flex;flex-direction:column;gap:6px;max-height:55vh;overflow:auto"></div>`;
        W.F.innerHTML = `<button type="button" class="btn btn-secondary" data-x>Fechar</button>`;
        const paintL = () => {
            const q = norm($('dpgpQ').value);
            const rows = list.filter(p => !q || norm(p.name).includes(q) || norm(p.code).includes(q));
            $('dpgpL').innerHTML = rows.map(p => { const ks = kidsOf(all, p); return `<button type="button" class="btn btn-outline" data-id="${esc(p.id)}" style="justify-content:space-between;text-align:left;width:100%"><span><b>${esc(p.name)}</b> <small style="color:var(--text-muted)">${esc((p.gradeSizes || []).join(' '))}${(p.gradeColors || []).length ? ' · ' + esc(p.gradeColors.join(', ')) : ''}</small></span><small>${qf(sumStock(ks))} ${plural(sumStock(ks), 'peça', 'peças')}</small></button>`; }).join('') || '<div class="dpg-empty">Nenhum produto encontrado.</div>';
        };
        $('dpgpQ').addEventListener('input', paintL);
        $('dpgpL').addEventListener('click', e => { const b = e.target.closest('[data-id]'); if (!b) return; const p = list.find(x => x.id === b.dataset.id); W.close(); then(p, all); });
        paintL(); setTimeout(() => { const q = $('dpgpQ'); if (q) q.focus(); }, 40);
    }

    /* =================== Estoque =================== */
    function setupEstoque() {
        if (PAGE !== 'estoque' || $('dpgStockBtn')) return;
        const right = document.querySelector('.toolbar-right'); if (!right) return;
        css();
        const b = document.createElement('button'); b.type = 'button'; b.id = 'dpgStockBtn'; b.className = 'btn btn-outline dpg-btn-ic'; b.style.display = 'none';
        b.innerHTML = `${ic('shirt', 'shirt')} Entrada por grade`; b.title = 'Entrada ou contagem de roupa e calçado pela grade de tamanho e cor';
        right.prepend(b);
        b.addEventListener('click', () => pickParent('Entrada por grade', (p, all) => openStock(p, { list: all, onDone: () => { try { if (typeof window.initPageEstoque === 'function') window.initPageEstoque(); else location.reload(); } catch (e) { location.reload(); } } })));
        Promise.all([loadCfg(), freshProducts()]).then(([, all]) => { if (enabled() || all.some(isParent)) b.style.display = ''; });
    }

    /* =================== Compras: matriz de quantidades =================== */
    function setupCompras() {
        if (PAGE !== 'compras') return;
        const tb = $('purchaseItems'); if (!tb || tb.dataset.dpg) return;
        tb.dataset.dpg = '1'; css();
        const addBtn = document.querySelector('#modalCompra button[onclick^="addPurchaseItem"]');
        let ALL = null;
        const prods = async force => { if (!ALL || force) ALL = await freshProducts(); return ALL; };
        if (addBtn) {
            const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline dpg-btn-ic'; b.id = 'dpgBuyBtn'; b.style.cssText = 'margin-bottom:16px;margin-left:8px;display:none';
            b.innerHTML = `${ic('shirt', 'shirt')} Comprar por grade`; b.title = 'Roupa e calçado: digite as quantidades de cada tamanho e cor de uma vez';
            addBtn.insertAdjacentElement('afterend', b);
            b.addEventListener('click', () => pickParent('Comprar por grade', (p, all) => { ALL = all; buy(p); }));
            Promise.all([loadCfg(), prods()]).then(([, all]) => { if (enabled() || all.some(isParent)) b.style.display = ''; });
        }
        // Escolheu o produto-pai num item: abre a matriz no lugar do item
        tb.addEventListener('change', async e => {
            const sel = e.target.closest('.purch-product'); if (!sel || !sel.value) return;
            const all = await prods(), p = all.find(x => x.id === sel.value);
            if (!isParent(p)) return;
            const row = sel.closest('tr'); row && row.remove();
            try { window.calcPurchTotal(); } catch (er) { }
            buy(p);
        }, true);
        async function buy(parent) {
            const all = await prods(true), p = all.find(x => x.id === parent.id) || parent, ks = kidsOf(all, p);
            if (!ks.length) { toast('warning', 'Este produto ainda não tem tamanhos. Edite o produto e monte a grade.'); return; }
            const { S, C } = axes(p, ks), vals = {};
            const W = overlay('dpgBuy', 'dpg-m', `Comprar por grade · ${esc(p.name)}`, 'shirt');
            W.B.innerHTML = `<div class="dpg-hint">Digite quantas peças de cada tamanho e cor vêm nesta compra. Cada tamanho/cor vira um item da compra; o estoque entra quando você receber a compra.</div><div class="dpg-mx" id="dpgbMx"><table><thead><tr><th>${C.length > 1 || C[0] ? 'Tam. \\ Cor' : 'Tamanho'}</th>${C.map(c => `<th>${esc(c || 'Peças')}</th>`).join('')}</tr></thead><tbody>${S.map(s => `<tr><th scope="row">${esc(s || '—')}</th>${C.map(c => { const k = kidAt(ks, s, c); return k ? `<td><input class="dpg-in" data-id="${esc(k.id)}" inputmode="decimal" placeholder="0" aria-label="${esc(label(s, c))}" autocomplete="off"><span class="dpg-cur">tem ${qf(k.currentStock)}</span></td>` : '<td><span class="dpg-cur">—</span></td>'; }).join('')}</tr>`).join('')}</tbody></table></div>
<div class="dpg-row"><div class="form-group" style="margin:0"><label class="form-label" for="dpgbCost">Custo por peça (R$)</label><input type="text" id="dpgbCost" class="form-control" inputmode="decimal" value="${num(p.costPrice) ? String(r2(p.costPrice)).replace('.', ',') : ''}"></div><div class="form-group" style="margin:0"><label class="form-label" for="dpgbSale">Preço de venda (R$)</label><input type="text" id="dpgbSale" class="form-control" inputmode="decimal" value="${num(p.salePrice) ? String(r2(p.salePrice)).replace('.', ',') : ''}"></div></div>`;
            W.F.innerHTML = `<span id="dpgbTot" style="margin-right:auto;font-size:13px;color:var(--text-secondary)"></span><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary dpg-btn-ic" id="dpgbOk">${ic('plus', 'plus')} Pôr na compra</button>`;
            const tot = () => { const n = Object.values(vals).reduce((a, v) => a + v, 0), c = num($('dpgbCost').value); $('dpgbTot').innerHTML = `<b>${qf(n)}</b> ${plural(n, 'peça', 'peças')}${c ? ' · ' + money(n * c) : ''}`; };
            $('dpgbMx').addEventListener('input', e => { const t = e.target.closest('.dpg-in'); if (t) { vals[t.dataset.id] = Math.max(0, Math.round(num(t.value))); tot(); } });
            $('dpgbMx').addEventListener('keydown', e => { const t = e.target.closest('.dpg-in'); if (!t || e.key !== 'Enter') return; e.preventDefault(); const list = [...$('dpgbMx').querySelectorAll('.dpg-in')], i = list.indexOf(t), next = list[i + C.length] || list[i + 1]; if (next) next.focus(); });
            $('dpgbCost').addEventListener('input', tot);
            $('dpgbOk').addEventListener('click', () => {
                const todo = ks.filter(k => vals[k.id] > 0);
                if (!todo.length) { toast('warning', 'Digite a quantidade de pelo menos um tamanho.'); return; }
                const cost = r2($('dpgbCost').value), sale = r2($('dpgbSale').value);
                let missing = 0;
                for (const k of todo) {
                    window.addPurchaseItem();
                    const row = tb.lastElementChild, sel = row && row.querySelector('.purch-product');
                    if (!sel || ![...sel.options].some(o => o.value === k.id)) { if (row) row.remove(); missing++; continue; }
                    sel.value = k.id; sel.dispatchEvent(new Event('change', { bubbles: false }));
                    const qi = row.querySelector('.purch-qty'), ci = row.querySelector('.purch-cost'), si = row.querySelector('.purch-sale');
                    if (qi) { qi.value = vals[k.id]; qi.dispatchEvent(new Event('input')); }
                    if (ci && cost > 0) { ci.value = cost.toFixed(2); ci.dispatchEvent(new Event('input')); }
                    if (si && sale > 0) { si.value = sale.toFixed(2); si.dispatchEvent(new Event('input')); }
                }
                try { window.calcPurchTotal(); } catch (er) { }
                W.close();
                if (missing) toast('warning', `${missing} tamanho(s) novo(s) ainda não aparecem nesta tela. Recarregue a página de Compras e use "Comprar por grade" de novo para eles.`);
                else toast('success', `${todo.length} ${plural(todo.length, 'item entrou', 'itens entraram')} na compra.`);
            });
            tot(); setTimeout(() => { const f = $('dpgbMx') && $('dpgbMx').querySelector('.dpg-in'); if (f) f.focus(); }, 40);
        }
    }

    /* =================== Configurações › Empresa =================== */
    function setupConfig() {
        const host = $('tabEmpresa'); if (!host || $('dpgCfgCard') || !boss()) return;
        css();
        const card = document.createElement('div'); card.className = 'card dpg-cfg'; card.id = 'dpgCfgCard';
        const after = $('dprVehCard') || $('dprPetCard') || $('dpaCfgCard') || $('ospCfgCard') || $('mesCfgCard');
        if (after) after.insertAdjacentElement('afterend', card); else host.appendChild(card);
        const paint = () => {
            const c = CFG || {}, seg = segment() === 'loja';
            const condOn = c.condicionalPdv === true || (c.condicionalPdv !== false && seg);
            const custom = (c.gradePresets || []);
            card.innerHTML = `<div class="dpg-cfg-h"><div class="ico">${ic('shirt', 'shirt')}</div><div><h3>Loja de roupa e calçados</h3><p>Grade de tamanho e cor com código de barras em cada peça, etiquetas e o <b>condicional</b> (a cliente leva para provar em casa) direto do PDV.${seg ? ' Já vem ligado no ramo Loja.' : ''}</p></div></div>
<div class="dpg-cfg-l">
  <div class="dpg-cfg-i"><div><b>Grade de tamanho e cor</b><small>Mostra o quadro "Grade de tamanho e cor" no cadastro de produtos.</small></div><label class="dpg-sw" title="Ligar ou desligar"><input type="checkbox" data-k="gradeEnabled" ${enabled() ? 'checked' : ''} aria-label="Grade de tamanho e cor"><span></span></label></div>
  <div class="dpg-cfg-i"><div><b>Botão "Condicional" no PDV</b><small>A vendedora monta o carrinho, toca em Condicional, imprime o termo e a cliente leva para provar.</small></div><label class="dpg-sw" title="Ligar ou desligar"><input type="checkbox" data-k="condicionalPdv" ${condOn ? 'checked' : ''} aria-label="Botão Condicional no PDV"><span></span></label></div>
  <div class="dpg-cfg-i"><div><b>Prazo para devolver o condicional</b><small>Dias que a cliente tem para devolver ou pagar as peças. Passou do prazo, aparece no Início.</small></div><span><input type="number" min="1" max="60" step="1" id="dpgCondDias" value="${Math.max(1, Math.round(num(c.condicionalDias) || 2))}" aria-label="Dias do condicional"> dias</span></div>
  <div class="dpg-cfg-i" style="flex-direction:column;align-items:stretch"><div><b>Modelos de grade</b><small>Os de fábrica e os seus. Na hora de cadastrar a peça é só escolher.</small></div>
    <div class="dpg-pre">${FACTORY.map(p => `<span title="${esc(p.sizes.join(' '))}">${esc(p.name)}</span>`).join('')}${custom.map((p, i) => `<span title="${esc((p.sizes || []).join(' '))}"><b>${esc(p.name)}</b> ${esc((p.sizes || []).join(' '))}<button type="button" data-rm="${i}" aria-label="Apagar modelo ${esc(p.name)}">${ic('x', 'xmark')}</button></span>`).join('')}</div>
    <div class="dpg-pre-add"><input type="text" id="dpgPreName" placeholder="Nome (ex.: Plus size)" maxlength="40"><input type="text" id="dpgPreSizes" placeholder="Tamanhos separados por vírgula (ex.: G1, G2, G3)" style="flex:1;min-width:200px"><button type="button" class="btn btn-outline btn-sm" id="dpgPreAdd">Adicionar modelo</button></div></div>
</div>`;
        };
        card.addEventListener('change', async e => {
            const t = e.target;
            try {
                if (t.dataset.k) { await saveCfg({ [t.dataset.k]: t.checked }); toast('success', t.checked ? 'Ligado.' : 'Desligado.'); }
                else if (t.id === 'dpgCondDias') { const d = Math.max(1, Math.min(60, Math.round(num(t.value)) || 2)); t.value = d; await saveCfg({ condicionalDias: d }); toast('success', `Prazo do condicional: ${d} ${plural(d, 'dia', 'dias')}.`); }
            } catch (er) { toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(er) : (er && er.message))); paint(); }
        });
        card.addEventListener('click', async e => {
            const rm = e.target.closest('[data-rm]');
            if (rm) { const list = [...(CFG.gradePresets || [])]; list.splice(+rm.dataset.rm, 1); try { await saveCfg({ gradePresets: list }); paint(); } catch (er) { toast('error', er.message); } return; }
            if (e.target.closest('#dpgPreAdd')) {
                const name = $('dpgPreName').value.trim(), sizes = uniq($('dpgPreSizes').value.split(/[,;]+/).map(s => s.trim()).filter(Boolean));
                if (!name || !sizes.length) { toast('warning', 'Informe o nome e os tamanhos do modelo.'); return; }
                try { await saveCfg({ gradePresets: [...(CFG.gradePresets || []), { id: 'c' + Date.now().toString(36), name: name.slice(0, 40), sizes }] }); toast('success', 'Modelo de grade adicionado.'); paint(); } catch (er) { toast('error', er.message); }
            }
        });
        loadCfg().then(paint);
        document.addEventListener('dp:ramo', () => paint());
    }

    /* =================== Importar planilha: Tamanho e Cor =================== */
    // Linhas com tamanho/cor: o nome vira "Nome · tam · cor" (para achar o que já existe) e lembra o nome da peça
    function importNames(out) {
        (out || []).forEach(p => {
            if (!p || p.skip || (!p.gradeSize && !p.gradeColor)) return;
            p.gradeSize = String(p.gradeSize || '').trim().slice(0, 24); p.gradeColor = String(p.gradeColor || '').trim().slice(0, 24);
            p.gradeBase = p.name; p.name = childName(p.name, p.gradeSize, p.gradeColor);
        });
    }
    // Antes de gravar: cria (ou acha) o produto-pai de cada peça e devolve os campos de cada filho
    async function importPrep(todo, ctx) {
        const rows = (todo || []).filter(p => p && p.gradeBase && !p.skip);
        if (!rows.length) return null;
        ctx = ctx || {};
        const all = await freshProducts();
        const groups = new Map();
        rows.forEach(p => { const k = norm(p.gradeBase); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(p); });
        const need = rows.filter(p => !p.barcode && !(p.match && p.match.barcode)).length;
        const codes = need && window.DPBarcode ? await DPBarcode.novos(need, all.map(p => p.barcode)) : [];
        let ci = 0;
        const ops = [], fields = new Map();
        for (const [k, list] of groups) {
            const first = list[0];
            const sizes = uniq(list.map(p => p.gradeSize).filter(Boolean)), colors = uniq(list.map(p => p.gradeColor).filter(Boolean));
            const parent = all.find(p => isParent(p) && norm(p.name) === k);
            let pid;
            if (parent) {
                pid = parent.id;
                const S2 = uniq([...(parent.gradeSizes || []), ...sizes]), C2 = uniq([...(parent.gradeColors || []), ...colors]);
                ops.push({ kind: 'update', ref: db.collection('products').doc(pid), data: { gradeSizes: S2, gradeColors: C2, updatedAt: ts() } });
                sizes.splice(0, sizes.length, ...S2); colors.splice(0, colors.length, ...C2);
            } else {
                const ref = db.collection('products').doc(); pid = ref.id;
                const cat = (ctx.catNames && ctx.catNames.get(norm(first.category))) || first.category || 'Geral';
                const cost = r2(first.cost), price = r2(first.price);
                ops.push({ kind: 'set', ref, data: { name: first.gradeBase, code: '', barcode: '', unit: first.unit || 'un', category: cat, brand: first.brand || '', costPrice: cost, salePrice: price, promoPrice: null, profitMargin: cost > 0 ? Math.round((price - cost) / cost * 1000) / 10 : 0, currentStock: 0, minStock: 0, status: first.active === false ? 'inactive' : 'active', active: first.active !== false, description: first.description || '', productType: 'product', controlStock: false, isGradeParent: true, gradeSizes: sizes, gradeColors: colors, gradePreset: '', gradeCount: list.length, imageType: 'icon', icon: '', imageUrl: '', imageFile: '', volume: '', stockLocation: '', supplierId: '', supplierName: '', packagings: [], importBatch: ctx.batchId || '', importSource: ctx.file || '', deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
            }
            list.forEach(p => {
                const si = Math.max(0, sizes.indexOf(p.gradeSize)), cj = Math.max(0, colors.indexOf(p.gradeColor));
                const f = { gradeParentId: pid, gradeSize: p.gradeSize || '', gradeColor: p.gradeColor || '', gradeBaseName: p.gradeBase, gradeOrder: si * 100 + cj, productType: 'product', controlStock: true };
                if (!p.barcode && !(p.match && p.match.barcode)) f.barcode = codes[ci++] || '';
                fields.set(p, f);
            });
        }
        return { ops, fields: p => fields.get(p) || {}, parents: groups.size };
    }

    window.DPGrade = { isParent, isChild, kidsOf, stockOf, pdvList, pdvPick, foldCart, openPicker, openStock, pickParent, presets, enabled, loadCfg, saveCfg, importNames, importPrep, label, childName, get cfg() { return CFG; } };

    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    ready(() => {
        try { setupProdutos(); } catch (e) { console.warn('grade produtos', e); }
        try { setupEstoque(); setupCompras(); } catch (e) { console.warn('grade', e); }
        try { setupConfig(); } catch (e) { console.warn('grade cfg', e); }
        // PDV desenhado antes deste arquivo chegar: redesenha mostrando só o pai de cada grade
        try { if (PAGE === 'pdv' && pdvProducts().some(isParent) && typeof window.renderProducts === 'function') window.renderProducts(); } catch (e) { }
        if (PAGE === 'configuracoes' && $('tabEmpresa')) new MutationObserver(() => { if (!$('dpgCfgCard')) try { setupConfig(); } catch (e) { } }).observe($('tabEmpresa'), { childList: true });
    });
    try { auth.onAuthStateChanged(u => { if (u) loadCfg(true); }); } catch (e) { }
})();
