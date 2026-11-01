/**
 * =========================================================
 * DISTRIBUIDORA ERP — pages.js
 * Funções completas para todas as páginas
 * Queries simples sem necessidade de índices compostos
 * =========================================================
 */

// ─── HELPERS GLOBAIS ──────────────────────────────────────
function openModal(id) { const el = document.getElementById(id); if (el) el.classList.add('active'); }
function closeModal(id) { const el = document.getElementById(id); if (el) el.classList.remove('active'); }

function parseCurrency(str) {
    if (!str) return 0;
    return parseFloat(String(str).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;
}
function fmtCurrency(val) {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val || 0);
}
function fmtDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('pt-BR');
}
function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('pt-BR');
}
function badgeSt(status) {
    const m = {
        active:'<span class="badge badge-success">Ativo</span>',
        inactive:'<span class="badge badge-danger">Inativo</span>',
        ativo:'<span class="badge badge-success">Ativo</span>',
        inativo:'<span class="badge badge-danger">Inativo</span>',
        pending:'<span class="badge badge-warning">Pendente</span>',
        completed:'<span class="badge badge-success">Concluído</span>',
        cancelled:'<span class="badge badge-danger">Cancelado</span>',
        overdue:'<span class="badge badge-danger">Vencida</span>',
        paid:'<span class="badge badge-success">Pago</span>',
        received:'<span class="badge badge-success">Recebido</span>',
        open:'<span class="badge badge-info">Aberto</span>',
        closed:'<span class="badge badge-secondary">Fechado</span>',
        delivering:'<span class="badge badge-warning">Em Rota</span>',
        delivered:'<span class="badge badge-success">Entregue</span>',
        new:'<span class="badge badge-info">Novo</span>',
        preparing:'<span class="badge badge-warning">Separando</span>',
        waiting:'<span class="badge badge-info">Aguardando</span>',
        available:'<span class="badge badge-success">Disponível</span>',
        busy:'<span class="badge badge-warning">Ocupado</span>',
    };
    return m[status] || `<span class="badge badge-secondary">${status||'—'}</span>`;
}

// ─── TEXTO DENTRO DE onclick="fn('...')" (39.2) ──────────
// Nome com aspa simples (ex.: BROCA 1/2' JOMARCA) quebrava o onclick inteiro e o botão não fazia nada.
// Escapa para o JS (\' e \\) e para o atributo HTML (&, ", <).
function dpJsAttr(s) {
    return String(s === undefined || s === null ? '' : s).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}
window.dpJsAttr = dpJsAttr;

// ─── QUERY SIMPLES SEM ÍNDICE COMPOSTO ───────────────────
// Busca TUDO de uma coleção e filtra/ordena em memória
async function simpleList(collection, orderField = 'createdAt', orderDir = 'desc', limitN = 500) {
    try {
        let query = db.collection(collection).limit(limitN);
        let snap = await query.get();
        // 35.53 · Coleção maior que o limite (ex.: histórico de vendas importado): o limite sem ordem pegava um pedaço
        // qualquer (vendas antigas e o ano atual zerado nos relatórios). Aí busca de novo já ordenado no banco.
        if (orderField && snap.docs.length >= limitN) {
            try { snap = await db.collection(collection).orderBy(orderField, orderDir).limit(limitN).get(); }
            catch (e) { console.warn(`simpleList(${collection}): sem ordem no banco`, e.message); }
        }
        let docs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        // Filtrar deletados em memória
        docs = docs.filter(d => d.deleted !== true);
        // Ordenar em memória
        if (orderField) {
            docs.sort((a, b) => {
                let va = a[orderField], vb = b[orderField];
                if (va && va.toDate) va = va.toDate().getTime();
                if (vb && vb.toDate) vb = vb.toDate().getTime();
                if (typeof va === 'string') va = va.toLowerCase();
                if (typeof vb === 'string') vb = vb.toLowerCase();
                if (va < vb) return orderDir === 'asc' ? -1 : 1;
                if (va > vb) return orderDir === 'asc' ? 1 : -1;
                return 0;
            });
        }
        return docs;
    } catch (e) {
        console.error(`Erro ao buscar ${collection}:`, e);
        return [];
    }
}

// ─── PAGINAÇÃO DAS LISTAS GRANDES (35.54) ────────────────
// Com muitos itens (ex.: 1.200 produtos com foto) desenhar tudo de uma vez travava a tela.
// DPPager.slice(chave, lista, {size, sig, render}) devolve só a página atual; DPPager.bar desenha os botões.
// DPPager.more(...) é o "Mostrar mais" (PDV): carrega o próximo bloco ao clicar ou ao rolar até o fim.
// "sig" = filtros atuais: quando muda (outra busca/categoria), volta para a 1ª página.
window.DPPager = window.DPPager || (function () {
    const S = {};
    const num = v => Number(v).toLocaleString('pt-BR');
    const state = key => S[key] || (S[key] = { page: 1, shown: 0, sig: null, size: 50, custom: false, render: null, anchor: null });
    function css() {
        if (document.getElementById('dpPagerCss')) return;
        const st = document.createElement('style'); st.id = 'dpPagerCss';
        st.textContent = '.dp-pager{display:flex;align-items:center;justify-content:space-between;gap:10px 16px;flex-wrap:wrap;padding:12px 4px 4px;font-size:12.5px;color:var(--text-secondary)}'
            + '.dp-pager b{color:var(--text-heading)}.dp-pg-btns{display:flex;align-items:center;gap:4px;flex-wrap:wrap}'
            + '.dp-pg-btns button{min-width:34px;height:34px;padding:0 10px;border-radius:9px;border:1px solid var(--border-color);background:var(--bg-card,transparent);color:var(--text-primary);font:inherit;font-weight:600;cursor:pointer}'
            + '.dp-pg-btns button:hover:not(:disabled){border-color:var(--accent);color:var(--accent)}.dp-pg-btns button.on{background:var(--accent);border-color:var(--accent);color:#fff}'
            + '.dp-pg-btns button:disabled{opacity:.4;cursor:default}.dp-pg-gap{padding:0 4px;color:var(--text-muted)}'
            + '.dp-pg-size{display:flex;align-items:center;gap:6px}.dp-pg-size select{height:32px;padding:0 8px;border-radius:8px;border:1px solid var(--border-color);background:var(--bg-card,transparent);color:var(--text-primary);font:inherit}'
            + '.dp-more{display:flex;align-items:center;justify-content:center;gap:12px;flex-wrap:wrap;width:100%;flex:1 1 100%;grid-column:1/-1;clear:both;padding:14px 6px;font-size:12.5px;color:var(--text-muted)}'
            + '@media(max-width:640px){.dp-pager{justify-content:center}.dp-pg-info{width:100%;text-align:center}}';
        document.head.appendChild(st);
    }
    function prep(key, opts) {
        const s = state(key);
        if (opts.render) s.render = opts.render;
        if (opts.size && !s.custom) s.size = opts.size;
        const sig = opts.sig === undefined ? '' : String(opts.sig);
        const changed = sig !== s.sig; s.sig = sig;
        return { s, changed };
    }
    function slice(key, list, opts) {
        const { s, changed } = prep(key, opts || {});
        if (changed) s.page = 1;
        const total = list.length, pages = Math.max(1, Math.ceil(total / s.size));
        if (s.page > pages) s.page = pages;
        const start = (s.page - 1) * s.size;
        return { key, items: list.slice(start, start + s.size), page: s.page, pages, total, from: total ? start + 1 : 0, to: Math.min(total, start + s.size), size: s.size };
    }
    function pageList(p, pages) {
        const out = [1], lo = Math.max(2, p - 1), hi = Math.min(pages - 1, p + 1);
        if (lo > 2) out.push('…');
        for (let i = lo; i <= hi; i++) out.push(i);
        if (hi < pages - 1) out.push('…');
        if (pages > 1) out.push(pages);
        return out;
    }
    function bar(key, info, anchor) {
        let el = document.querySelector('.dp-pager[data-pg-key="' + key + '"]');
        const s = state(key); if (anchor) s.anchor = anchor;
        if (!info || (info.pages <= 1 && !s.custom)) { if (el) el.remove(); return; } // cabe numa página: sem barra
        css();
        if (!el) {
            if (!anchor) return;
            el = document.createElement('div'); el.className = 'dp-pager'; el.setAttribute('data-pg-key', key);
            anchor.insertAdjacentElement('afterend', el);
        }
        const btns = pageList(info.page, info.pages).map(v => v === '…' ? '<span class="dp-pg-gap">…</span>' : '<button type="button" data-pg="' + v + '"' + (v === info.page ? ' class="on"' : '') + '>' + v + '</button>').join('');
        el.innerHTML = '<span class="dp-pg-info">Mostrando <b>' + num(info.from) + '–' + num(info.to) + '</b> de <b>' + num(info.total) + '</b></span>'
            + (info.pages > 1 ? '<div class="dp-pg-btns"><button type="button" data-pg="prev" title="Página anterior"' + (info.page <= 1 ? ' disabled' : '') + '>‹</button>' + btns + '<button type="button" data-pg="next" title="Próxima página"' + (info.page >= info.pages ? ' disabled' : '') + '>›</button></div>' : '')
            + '<label class="dp-pg-size">Por página <select data-pg-size>' + [25, 50, 100, 200].map(n => '<option value="' + n + '"' + (n === info.size ? ' selected' : '') + '>' + n + '</option>').join('') + '</select></label>';
    }
    let io = null;
    function armMore(key) {
        const el = document.querySelector('.dp-more[data-pg-key="' + key + '"]');
        if (!el || !('IntersectionObserver' in window)) return;
        if (!io) io = new IntersectionObserver(entries => entries.forEach(e => {
            if (!e.isIntersecting) return;
            io.unobserve(e.target);
            const k = e.target.getAttribute('data-pg-key'); if (k) setTimeout(() => go(k, 'more'), 60);
        }), { rootMargin: '200px' });
        io.observe(el);
    }
    function more(key, list, opts) {
        const { s, changed } = prep(key, opts || {});
        if (changed || !s.shown) s.shown = s.size;
        const items = list.slice(0, s.shown), left = list.length - items.length;
        css();
        // Outra busca/categoria: volta a lista para o topo antes de vigiar o fim (senão já carregaria o próximo bloco).
        if (changed && opts && opts.box) { try { opts.box.scrollTop = 0; } catch (e) { } }
        if (left > 0) setTimeout(() => armMore(key), 0);
        return { key, items, total: list.length, left, html: left > 0 ? '<div class="dp-more" data-pg-key="' + key + '"><span>Mostrando ' + num(items.length) + ' de ' + num(list.length) + '</span><button type="button" class="btn btn-outline btn-sm" data-pg="more">Mostrar mais ' + num(Math.min(left, s.size)) + '</button></div>' : '' };
    }
    function go(key, what) {
        const s = state(key); if (!s.render) return;
        if (what === 'more') { s.shown += s.size; s.render(); return; }
        if (what === 'prev') s.page = Math.max(1, s.page - 1);
        else if (what === 'next') s.page += 1;
        else s.page = Math.max(1, parseInt(what, 10) || 1);
        s.render();
        const a = s.anchor; if (a && a.isConnected) { try { a.scrollIntoView({ block: 'start', behavior: 'smooth' }); } catch (e) { } }
    }
    document.addEventListener('click', e => {
        const b = e.target.closest && e.target.closest('[data-pg]'); if (!b) return;
        const box = b.closest('.dp-pager,.dp-more'); if (!box) return;
        e.preventDefault(); e.stopPropagation();
        go(box.getAttribute('data-pg-key'), b.getAttribute('data-pg'));
    }, true);
    document.addEventListener('change', e => {
        const sel = e.target.closest && e.target.closest('[data-pg-size]'); if (!sel) return;
        const box = sel.closest('.dp-pager'); if (!box) return;
        const s = state(box.getAttribute('data-pg-key'));
        s.size = parseInt(sel.value, 10) || 50; s.custom = true; s.page = 1;
        if (s.render) s.render();
    });
    return { slice, bar, more };
})();


function setLoadingRow(cols) {
    return `<tr><td colspan="${cols}" style="text-align:center;padding:40px;color:var(--text-muted)"><i class="fas fa-spinner fa-spin" style="margin-right:8px"></i>Carregando...</td></tr>`;
}
function setEmptyRow(cols, msg = 'Nenhum registro encontrado.') {
    return `<tr><td colspan="${cols}" style="text-align:center;padding:40px;color:var(--text-muted)">${msg}</td></tr>`;
}

/* ================================================================
   PÁGINA: AUDITORIA
================================================================ */
async function initPageAuditoria() {
    let logs = [];
    let filteredLogs = [];
    const PAGE_SIZE = 50;
    let currentPage = 0;

    const tbody = document.getElementById('auditTbody') || document.querySelector('tbody');
    if (tbody) tbody.innerHTML = setLoadingRow(6);

    // ── CARREGAR LOGS ─────────────────────────────────────
    try {
        const snap = await db.collection('audit_logs').limit(500).get();
        logs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        logs.sort((a, b) => {
            const da = a.createdAt?.toDate?.() || new Date(0);
            const db2 = b.createdAt?.toDate?.() || new Date(0);
            return db2 - da;
        });
    } catch(e) {
        console.error('Auditoria:', e);
        if (tbody) tbody.innerHTML = setEmptyRow(6, 'Erro ao carregar logs de auditoria.');
        return;
    }

    // ── STATS ─────────────────────────────────────────────
    const today = new Date(); today.setHours(0,0,0,0);
    const todayLogs = logs.filter(l => (l.createdAt?.toDate?.()|| new Date(0)) >= today);
    const cards = document.querySelectorAll('.stat-value');
    if (cards[0]) cards[0].textContent = todayLogs.length;
    if (cards[1]) cards[1].textContent = todayLogs.filter(l => l.action === 'login').length;
    if (cards[2]) cards[2].textContent = todayLogs.filter(l => ['update','create'].includes(l.action)).length;
    if (cards[3]) {
        const c = todayLogs.filter(l => ['delete','cancel'].includes(l.action)).length;
        cards[3].textContent = c;
        if (c > 0) cards[3].style.color = '#ef4444';
    }

    // ── POPULA FILTRO DE USUÁRIOS ─────────────────────────
    const userSel = document.getElementById('auditFilterUser');
    if (userSel) {
        const uniqueUsers = [...new Map(logs.filter(l=>l.userName).map(l => [l.userName, l.userName])).values()].sort();
        userSel.innerHTML = '<option value="">Todos os usuários</option>' +
            uniqueUsers.map(u => `<option value="${u}">${u}</option>`).join('');
    }

    // ── MÓDULOS LABEL ─────────────────────────────────────
    const MOD_LABEL = {
        sales:'Vendas', products:'Produtos', stock:'Estoque', customers:'Clientes',
        suppliers:'Fornecedores', purchases:'Compras', financial:'Financeiro',
        users:'Usuários', settings:'Configurações', cash:'Caixa', login:'Login',
        orders:'Pedidos', motoboys:'Motoboys', categories:'Categorias'
    };
    const ACTION_ICON = {
        login:'🔑', logout:'🚪', create:'➕', update:'✏️',
        delete:'🗑️', cancel:'❌', adjust:'⚖️', pay:'💰', receive:'📥'
    };
    const ACTION_COLOR = {
        create:'#10b981', update:'#3b82f6', delete:'#ef4444',
        cancel:'#ef4444', login:'#a855f7', logout:'#64748b',
        adjust:'#f59e0b', pay:'#10b981', receive:'#10b981'
    };

    // ── APLICAR FILTROS ───────────────────────────────────
    window.applyAuditFilters = () => {
        const q      = (document.getElementById('auditSearch')?.value||'').toLowerCase();
        const mod    = document.getElementById('auditFilterMod')?.value||'';
        const user   = document.getElementById('auditFilterUser')?.value||'';
        const action = document.getElementById('auditFilterAction')?.value||'';
        const df     = document.getElementById('auditDateFrom')?.value||'';
        const dt     = document.getElementById('auditDateTo')?.value||'';

        filteredLogs = logs.filter(l => {
            if (q && !JSON.stringify(l).toLowerCase().includes(q)) return false;
            if (mod    && (l.module||'').toLowerCase() !== mod) return false;
            if (user   && (l.userName||'') !== user) return false;
            if (action && (l.action||'').toLowerCase() !== action) return false;
            if (df || dt) {
                const d = l.createdAt?.toDate?.() || new Date(0);
                if (df && d < new Date(df+'T00:00:00')) return false;
                if (dt && d > new Date(dt+'T23:59:59')) return false;
            }
            return true;
        });
        currentPage = 0;
        renderPage();
    };

    function renderPage() {
        if (!tbody) return;
        const start = currentPage * PAGE_SIZE;
        const page  = filteredLogs.slice(start, start + PAGE_SIZE);
        const total = filteredLogs.length;

        if (!page.length) {
            tbody.innerHTML = setEmptyRow(6, 'Nenhum registro encontrado.');
            updatePagination(0, 0, total);
            return;
        }

        tbody.innerHTML = page.map(l => {
            const det   = typeof l.details === 'object'
                ? (l.details?.message || l.details?.name || JSON.stringify(l.details).slice(0,80))
                : (l.details || '—');
            const mod   = MOD_LABEL[l.module] || l.module || '—';
            const icon  = (window.dpIcon && {login:'log-in',logout:'log-out',create:'circle-plus',update:'pencil',delete:'trash-2',cancel:'ban',adjust:'scale',pay:'banknote',receive:'download'}[l.action]) ? dpIcon({login:'log-in',logout:'log-out',create:'circle-plus',update:'pencil',delete:'trash-2',cancel:'ban',adjust:'scale',pay:'banknote',receive:'download'}[l.action]) : (ACTION_ICON[l.action] || '•');
            const clr   = ACTION_COLOR[l.action] || 'var(--text-muted)';
            const actionLabel = {create:'Criar',update:'Editar',delete:'Excluir',cancel:'Cancelar',login:'Login',logout:'Logout',adjust:'Ajuste',pay:'Pagar',receive:'Receber'}[l.action] || l.action || '—';
            const ini   = (l.userName||'S').charAt(0).toUpperCase();
            return `<tr>
                <td style="font-size:11px;color:var(--text-muted);white-space:nowrap">${fmtDateTime(l.createdAt)}</td>
                <td>
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:28px;height:28px;border-radius:8px;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;color:#fff;flex-shrink:0">${ini}</div>
                        <span style="font-size:13px;font-weight:600;color:var(--text-heading)">${l.userName||'Sistema'}</span>
                    </div>
                </td>
                <td><span style="background:rgba(99,102,241,.1);color:var(--accent);padding:2px 9px;border-radius:12px;font-size:11px;font-weight:600">${mod}</span></td>
                <td><span style="background:${clr}20;color:${clr};padding:2px 9px;border-radius:12px;font-size:11px;font-weight:700;white-space:nowrap">${icon} ${actionLabel}</span></td>
                <td style="font-size:12px;color:var(--text-secondary);max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${det}">${det}</td>
                <td style="font-size:11px;color:var(--text-muted)">${l.ip||'—'}</td>
            </tr>`;
        }).join('');

        updatePagination(start + 1, Math.min(start + PAGE_SIZE, total), total);
    }

    function updatePagination(from, to, total) {
        const el = document.getElementById('auditPagination');
        if (!el) return;
        const totalPages = Math.ceil(total / PAGE_SIZE);
        el.innerHTML = `
            <span>${total > 0 ? `Exibindo ${from}–${to} de ${total} registros` : 'Nenhum registro'}</span>
            <div style="display:flex;gap:6px">
                <button onclick="window._auditPrev()" ${currentPage===0?'disabled':''} style="padding:5px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;font-size:12px${currentPage===0?';opacity:.4':''}">‹ Anterior</button>
                <span style="padding:5px 10px;font-size:12px;color:var(--text-muted)">${currentPage+1} / ${totalPages||1}</span>
                <button onclick="window._auditNext()" ${currentPage>=totalPages-1?'disabled':''} style="padding:5px 12px;border-radius:6px;border:1px solid var(--border-color);background:var(--bg-surface);color:var(--text-secondary);cursor:pointer;font-size:12px${currentPage>=totalPages-1?';opacity:.4':''}">Próximo ›</button>
            </div>`;
    }

    window._auditPrev = () => { if (currentPage > 0) { currentPage--; renderPage(); } };
    window._auditNext = () => { if ((currentPage+1)*PAGE_SIZE < filteredLogs.length) { currentPage++; renderPage(); } };

    // ── EXPORTAR CSV ──────────────────────────────────────
    window.exportAuditCSV = () => {
        const data = filteredLogs.length ? filteredLogs : logs;
        const csv = [
            ['Data/Hora','Usuário','Módulo','Ação','Descrição','IP'],
            ...data.map(l => [
                fmtDateTime(l.createdAt), l.userName||'Sistema',
                MOD_LABEL[l.module]||l.module||'',
                l.action||'',
                typeof l.details==='object'?JSON.stringify(l.details):l.details||'',
                l.ip||''
            ])
        ].map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff'+csv], {type:'text/csv;charset=utf-8;'}));
        a.download = `auditoria-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        Toast.success('CSV exportado!');
    };

    // ── EXPORTAR PDF ──────────────────────────────────────
    window.exportAuditPDF = async () => {
        const data = (filteredLogs.length ? filteredLogs : logs).slice(0, 300);
        let empresa = 'DistribuiPRO';
        try { const cfg=await db.collection('settings').doc('general').get(); if(cfg.exists) empresa=cfg.data().nomeFantasia||cfg.data().razaoSocial||empresa; } catch(e){}
        const dateStr = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

        const rows = data.map((l,i) => {
            const det   = typeof l.details==='object'?(l.details?.message||JSON.stringify(l.details).slice(0,60)):l.details||'—';
            const mod   = MOD_LABEL[l.module]||l.module||'—';
            const clr   = ACTION_COLOR[l.action]||'#64748b';
            const icon  = ACTION_ICON[l.action]||'•';
            const actionLabel = {create:'Criar',update:'Editar',delete:'Excluir',cancel:'Cancelar',login:'Login',logout:'Logout',adjust:'Ajuste'}[l.action]||l.action||'—';
            return `<tr style="background:${i%2===0?'#f8fafc':'#fff'}">
                <td style="font-size:11px;color:#64748b;white-space:nowrap">${fmtDateTime(l.createdAt)}</td>
                <td style="font-weight:600;color:#1e293b">${l.userName||'Sistema'}</td>
                <td><span style="background:#e0e7ff;color:#4f46e5;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${mod}</span></td>
                <td><span style="background:${clr}22;color:${clr};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${icon} ${actionLabel}</span></td>
                <td style="font-size:11px;color:#64748b;max-width:200px">${det}</td>
                <td style="font-size:11px;color:#94a3b8">${l.ip||'—'}</td>
            </tr>`;
        }).join('');

        const todayCount = todayLogs.length;
        const win = window.open('','_blank','width=1100,height=800');
        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Auditoria — ${empresa}</title>
<style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}
.page{padding:28px 32px;max-width:1050px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #6366f1}
.header h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.header .sub{font-size:12px;color:#64748b;margin-top:4px}
.empresa{font-size:16px;font-weight:700;color:#6366f1;text-align:right}.date{font-size:11px;color:#94a3b8;text-align:right;margin-top:4px}
.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}
.sum-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px}
.sum-card .val{font-size:18px;font-weight:800;margin-top:2px}.sum-card .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}
.table-wrap{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}
table{width:100%;border-collapse:collapse}thead tr{background:linear-gradient(135deg,#6366f1,#8b5cf6)}
thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:10px;text-align:left}
tbody td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tbody tr:last-child td{border-bottom:none}
.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between}.footer div{font-size:10px;color:#94a3b8}
@media print{@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}}</style></head><body>
<div class="page">
<div class="header"><div><h1>🔍 Log de Auditoria</h1><div class="sub">Histórico completo de ações no sistema</div></div><div><div class="empresa">${empresa}</div><div class="date">Gerado em ${dateStr}</div></div></div>
<div class="summary">
<div class="sum-card"><div class="lbl">Total Registros</div><div class="val">${data.length}</div></div>
<div class="sum-card"><div class="lbl">Ações Hoje</div><div class="val">${todayCount}</div></div>
<div class="sum-card"><div class="lbl">Criações/Edições</div><div class="val" style="color:#10b981">${data.filter(l=>['create','update'].includes(l.action)).length}</div></div>
<div class="sum-card"><div class="lbl">Exclusões/Cancelamentos</div><div class="val" style="color:#ef4444">${data.filter(l=>['delete','cancel'].includes(l.action)).length}</div></div>
</div>
<div class="table-wrap"><table><thead><tr><th>Data/Hora</th><th>Usuário</th><th>Módulo</th><th>Ação</th><th>Descrição</th><th>IP</th></tr></thead><tbody>${rows}</tbody></table></div>
<div class="footer"><div>DistribuiPRO ERP · Log de Auditoria · ${dateStr}</div><div>${data.length} registro${data.length!==1?'s':''} (máx 300)</div></div>
</div>
<div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999">
<button onclick="triggerPrint()" style="background:#6366f1;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / PDF</button>
<button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button>
</div>
<script>function triggerPrint(){document.getElementById('printBtns').style.display='none';setTimeout(function(){window.print();document.getElementById('printBtns').style.display='flex';},50);}
window.onbeforeprint=function(){document.getElementById('printBtns').style.display='none';};
window.onafterprint=function(){document.getElementById('printBtns').style.display='flex';};<\/script>
</body></html>`);
        win.document.close();
    };

    // Inicializa
    filteredLogs = [...logs];
    renderPage();
}


/* ================================================================
   PÁGINA: CONTAS A PAGAR
================================================================ */
async function initPageContasPagar() {
    let bills = [], suppliers = [];
    let editingId = null;
    const tbody = document.querySelector('tbody');
    if (tbody) tbody.innerHTML = setLoadingRow(7);

    async function load() {
        try {
            [bills, suppliers] = await Promise.all([
                simpleList('financial_entries', 'dueDate', 'asc'),
                simpleList('suppliers', 'name', 'asc'),
                loadExtraCats()
            ]);
            bills = bills.filter(b => b.type === 'expense' && !b.deleted);
        } catch(e) { console.error(e); }
        populateSupplierSelect();
        fillCatSelects();
        updateStats();
        applyBillFilters();
    }

    // 40.74 · Categorias da própria empresa em Contas a pagar: o "+" ao lado da Categoria abre a lista delas (criar, editar,
    // excluir) e o formulário tem nome, cor, ícone e descrição (modelo que o dono mandou). Ficam em
    // settings/general.categoriasContasPagar = [{ nome, cor, icone, descricao }] (a versão anterior gravava só o nome: ainda é lido).
    // Renomear muda também as contas já lançadas com o nome antigo; excluir não mexe nas contas. Categoria de conta lançada que
    // não está em lista nenhuma também aparece, para editar e filtrar sem perder.
    let extraCats = [];
    const escCat = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const CAT_CORES = ['#ef4444', '#f59e0b', '#10b981', '#14b8a6', '#3b82f6', '#6366f1', '#8b5cf6', '#ec4899', '#6b7280', '#334155', '#1abc9c'];
    const CAT_ICONES = ['folder-open', 'house', 'truck', 'tag', 'shopping-bag', 'users', 'settings', 'briefcase', 'credit-card', 'chart-line'];
    const catCor = c => /^#[0-9a-f]{6}$/i.test(c || '') ? c : '';
    const catIco = n => CAT_ICONES.includes(n) && window.dpIcon ? dpIcon(n) : '<i class="fas fa-folder-open"></i>';
    const catNorm = c => typeof c === 'string' ? { nome: c } : (c && typeof c.nome === 'string' ? { nome: c.nome, cor: catCor(c.cor), icone: CAT_ICONES.includes(c.icone) ? c.icone : '', descricao: String(c.descricao || '') } : null);
    const catInfo = nome => extraCats.find(c => c.nome.toLowerCase() === String(nome || '').toLowerCase());
    const catBadge = nome => {
        if (!nome) return '<span class="badge badge-info" style="font-size:11px">—</span>';
        const c = catInfo(nome);
        if (!c || !c.cor) return `<span class="badge badge-info" style="font-size:11px">${escCat(nome)}</span>`;
        return `<span class="badge" style="font-size:11px;display:inline-flex;align-items:center;gap:4px;background:${c.cor}1f;color:${c.cor};border:1px solid ${c.cor}55">${c.icone ? catIco(c.icone) : ''}${escCat(nome)}</span>`;
    };
    const catSelIni = document.getElementById('billCat'); // as fixas do HTML, guardadas antes de a lista ser refeita (a página pode iniciar de novo)
    if (catSelIni && !catSelIni.dataset.fixas) catSelIni.dataset.fixas = JSON.stringify([...catSelIni.options].map(o => o.value).filter(Boolean));
    const CAT_FIXAS = catSelIni ? JSON.parse(catSelIni.dataset.fixas) : [];
    async function loadExtraCats() {
        try {
            const s = await db.collection('settings').doc('general').get();
            const v = s.exists ? (s.data() || {}).categoriasContasPagar : null;
            extraCats = (Array.isArray(v) ? v : []).map(catNorm).filter(c => c && c.nome.trim());
        } catch(e) { console.warn('Categorias de contas a pagar:', e); }
    }
    function fillCatSelects() {
        const todas = CAT_FIXAS.filter(c => c !== 'Outros');
        for (const c of [...extraCats.map(x => x.nome), ...bills.map(b => b.category)]) if (c && String(c).toLowerCase() !== 'outros' && !todas.some(x => x.toLowerCase() === String(c).toLowerCase())) todas.push(String(c));
        if (CAT_FIXAS.includes('Outros')) todas.push('Outros');
        const opts = todas.map(c => `<option value="${escCat(c)}">${escCat(c)}</option>`).join('');
        const sel = document.getElementById('billCat'), fil = document.getElementById('billFilterCat');
        if (sel) { const v = sel.value; sel.innerHTML = '<option value="">Selecione...</option>' + opts; sel.value = v; }
        if (fil) { const v = fil.value; fil.innerHTML = '<option value="">Todas categorias</option>' + opts; fil.value = v; }
        if (!document.getElementById('dpCatPagarCss')) {
            const st = document.createElement('style'); st.id = 'dpCatPagarCss';
            st.textContent = '.dp-catrow{display:flex;gap:6px;align-items:stretch}.dp-catrow>select{flex:1;min-width:0}.dp-catadd{flex:0 0 38px;border:1px dashed var(--accent);background:var(--accent-muted,rgba(99,102,241,.12));color:var(--accent);border-radius:var(--radius-md,8px);cursor:pointer;font-size:14px}.dp-catadd:hover{background:var(--accent);color:#fff}'
                + '#dpCatPagarModal .modal{max-width:500px}#dpCatPagarModal .dpcp-t{margin:0;font-size:17px;font-weight:800;letter-spacing:.02em;text-transform:uppercase;color:var(--text-primary)}#dpCatPagarModal .dpcp-s{margin-top:3px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--accent)}'
                + '#dpCatPagarModal .dpcp-l{display:block;margin:0 0 8px;font-size:11px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--text-muted)}#dpCatPagarModal .dpcp-g{margin-bottom:18px}'
                + '#dpCatPagarModal .dpcp-box{border:1px solid var(--border-color);border-radius:12px;padding:12px;background:var(--bg-secondary,transparent)}#dpCatPagarModal .dpcp-cores{display:flex;flex-wrap:wrap;gap:8px}'
                + '#dpCatPagarModal .dpcp-cor{width:30px;height:30px;border:0;border-radius:9px;cursor:pointer;display:flex;align-items:center;justify-content:center;padding:0}#dpCatPagarModal .dpcp-cor.on::after{content:"";width:8px;height:8px;border-radius:50%;background:#fff}'
                + '#dpCatPagarModal .dpcp-icos{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}#dpCatPagarModal .dpcp-ico{height:40px;border:1px solid var(--border-color);border-radius:10px;background:var(--bg-card,var(--bg-primary,transparent));color:var(--text-secondary);display:flex;align-items:center;justify-content:center;cursor:pointer;font-size:17px;padding:0}#dpCatPagarModal .dpcp-ico.on{color:#fff;border-color:transparent}'
                + '#dpCatPagarModal .dpcp-f{display:grid;grid-template-columns:1fr 1fr;gap:12px;width:100%}#dpCatPagarModal .dpcp-f .btn{justify-content:center;text-transform:uppercase;letter-spacing:.05em;font-weight:800;min-height:44px}'
                + '#dpCatPagarModal .dpcp-item{display:flex;align-items:center;gap:10px;padding:10px;border:1px solid var(--border-color);border-radius:12px;margin-bottom:8px}#dpCatPagarModal .dpcp-tile{flex:0 0 36px;height:36px;border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:16px}'
                + '#dpCatPagarModal .dpcp-nome{flex:1;min-width:0}#dpCatPagarModal .dpcp-nome b{display:block;font-size:14px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}#dpCatPagarModal .dpcp-nome small{display:block;font-size:12px;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}'
                + '#dpCatPagarModal .dpcp-conf{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:-2px 0 10px;padding:10px;border-radius:10px;background:rgba(239,68,68,.08);font-size:12.5px;color:var(--text-secondary)}#dpCatPagarModal .dpcp-conf span{flex:1 1 180px}';
            document.head.appendChild(st);
        }
        if (sel && !document.getElementById('billCatAdd')) {
            const row = document.createElement('div'); row.className = 'dp-catrow';
            sel.parentNode.insertBefore(row, sel); row.appendChild(sel);
            const b = document.createElement('button'); b.type = 'button'; b.id = 'billCatAdd'; b.className = 'dp-catadd'; b.title = 'Categorias: criar, editar e excluir'; b.innerHTML = '<i class="fas fa-plus"></i>';
            b.addEventListener('click', () => window.openBillCategories && window.openBillCategories());
            row.appendChild(b);
        }
    }
    async function saveExtraCats(change) {
        await loadExtraCats(); // a lista mais nova (outro aparelho pode ter mexido)
        extraCats = change(extraCats);
        await db.collection('settings').doc('general').set({ categoriasContasPagar: extraCats }, { merge: true });
        fillCatSelects();
    }
    window.openBillCategories = () => {
        const aberta = document.getElementById('dpCatPagarModal');
        if (aberta) { if (aberta.classList.contains('active')) return; aberta.remove(); } // fechada pelo Esc geral: abre de novo
        const ov = document.createElement('div'); ov.className = 'modal-overlay active'; ov.id = 'dpCatPagarModal';
        ov.innerHTML = '<div class="modal"></div>';
        document.body.appendChild(ov);
        const M = ov.querySelector('.modal');
        const close = () => ov.remove();
        const head = (t, s) => `<div class="modal-header"><div><h3 class="dpcp-t">${t}</h3><div class="dpcp-s">${s}</div></div><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div>`;
        let excluindo = '';
        const lista = () => {
            M.innerHTML = head('Categorias', 'Contas a pagar · criar, editar ou excluir') + `<div class="modal-body">
                <button type="button" class="btn btn-primary" data-nova style="width:100%;justify-content:center;margin-bottom:14px"><i class="fas fa-plus"></i> Nova categoria</button>
                ${extraCats.length ? extraCats.map((c, i) => { const cor = c.cor || 'var(--accent)'; const usadas = bills.filter(b => (b.category || '').toLowerCase() === c.nome.toLowerCase()).length;
                    return `<div class="dpcp-item"><div class="dpcp-tile" style="background:${c.cor ? c.cor + '1f' : 'var(--accent-muted,rgba(99,102,241,.12))'};color:${cor}">${catIco(c.icone || 'folder-open')}</div>
                    <div class="dpcp-nome"><b>${escCat(c.nome)}</b><small>${c.descricao ? escCat(c.descricao) : (usadas ? usadas + (usadas > 1 ? ' contas' : ' conta') : 'Nenhuma conta ainda')}</small></div>
                    <button type="button" class="btn-icon" data-ed="${i}" title="Editar"><i class="fas fa-pen"></i></button><button type="button" class="btn-icon btn-danger" data-del="${i}" title="Excluir"><i class="fas fa-trash"></i></button></div>`
                    + (excluindo === c.nome ? `<div class="dpcp-conf"><span>Excluir "${escCat(c.nome)}"?${usadas > 1 ? ` As ${usadas} contas com essa categoria continuam com o nome.` : usadas ? ' A conta com essa categoria continua com o nome.' : ''}</span><button type="button" class="btn btn-secondary btn-sm" data-nao>Cancelar</button><button type="button" class="btn btn-danger btn-sm" data-sim="${i}" style="background:#ef4444;color:#fff;border-color:#ef4444"><i class="fas fa-trash"></i> Excluir</button></div>` : ''); }).join('')
                    : '<div style="text-align:center;padding:18px 8px;font-size:13px;color:var(--text-muted)">Nenhuma categoria criada ainda.</div>'}
                <div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">As categorias padrão (Fornecedores, Aluguel, Energia...) ficam sempre na lista.</div></div>
                <div class="modal-footer"><button class="btn btn-secondary" type="button" data-x style="width:100%;justify-content:center">Fechar</button></div>`;
        };
        const form = idx => {
            const c = idx >= 0 ? extraCats[idx] : null;
            let cor = (c && c.cor) || CAT_CORES[3], icone = (c && c.icone) || CAT_ICONES[0];
            M.innerHTML = head(c ? 'Editar categoria' : 'Nova categoria', 'Preencha as informações abaixo') + `<div class="modal-body">
                <div class="dpcp-g"><label class="dpcp-l" for="dpCatNome">Nome da categoria *</label><input type="text" class="form-control" id="dpCatNome" maxlength="40" placeholder="Ex: Energia, Internet, Aluguel..." value="${c ? escCat(c.nome) : ''}"></div>
                <div class="dpcp-g"><span class="dpcp-l">Selecione uma cor</span><div class="dpcp-box dpcp-cores">${CAT_CORES.map(k => `<button type="button" class="dpcp-cor" data-cor="${k}" style="background:${k}" title="${k}"></button>`).join('')}</div></div>
                <div class="dpcp-g"><span class="dpcp-l">Selecione um ícone</span><div class="dpcp-box dpcp-icos">${CAT_ICONES.map(k => `<button type="button" class="dpcp-ico" data-ico="${k}">${catIco(k)}</button>`).join('')}</div></div>
                <div class="dpcp-g" style="margin-bottom:0"><label class="dpcp-l" for="dpCatDesc">Descrição (opcional)</label><textarea class="form-control" id="dpCatDesc" rows="2" maxlength="140" placeholder="Descrição breve sobre que tipo de despesa entra nesta categoria...">${c ? escCat(c.descricao || '') : ''}</textarea></div></div>
                <div class="modal-footer"><div class="dpcp-f"><button type="button" class="btn btn-secondary" data-voltar>Voltar</button><button type="button" class="btn btn-primary" data-salvar><i class="fas fa-floppy-disk"></i> Salvar</button></div></div>`;
            const pinta = () => {
                M.querySelectorAll('.dpcp-cor').forEach(b => b.classList.toggle('on', b.dataset.cor === cor));
                M.querySelectorAll('.dpcp-ico').forEach(b => { const on = b.dataset.ico === icone; b.classList.toggle('on', on); b.style.background = on ? cor : ''; });
            };
            pinta();
            M.querySelector('.dpcp-cores').addEventListener('click', e => { const b = e.target.closest('[data-cor]'); if (b) { cor = b.dataset.cor; pinta(); } });
            M.querySelector('.dpcp-icos').addEventListener('click', e => { const b = e.target.closest('[data-ico]'); if (b) { icone = b.dataset.ico; pinta(); } });
            const inp = M.querySelector('#dpCatNome'), salvar = M.querySelector('[data-salvar]');
            inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); salvar.click(); } });
            salvar.addEventListener('click', async () => {
                const nome = inp.value.trim().replace(/\s+/g, ' '), descricao = M.querySelector('#dpCatDesc').value.trim();
                if (!nome) { Toast.warning('Informe o nome da categoria.'); inp.focus(); return; }
                const antigo = c ? c.nome : '';
                const igual = [...CAT_FIXAS, ...extraCats.map(x => x.nome)].find(n => n.toLowerCase() === nome.toLowerCase() && n.toLowerCase() !== antigo.toLowerCase());
                if (igual) { Toast.warning(`Já existe a categoria "${escCat(igual)}".`); inp.focus(); return; }
                const nova = { nome, cor, icone, descricao };
                salvar.disabled = true; salvar.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
                try {
                    await saveExtraCats(l => c ? l.map(x => x.nome.toLowerCase() === antigo.toLowerCase() ? nova : x) : [...l, nova]);
                    let mudadas = 0;
                    if (c && antigo !== nome) { // renomeou: as contas lançadas com o nome antigo passam para o novo
                        for (const b of bills.filter(b => b.category === antigo)) { await db.collection('financial_entries').doc(b.id).update({ category: nome }); b.category = nome; mudadas++; }
                        const sel = document.getElementById('billCat'); if (sel && sel.value === antigo) sel.value = nome;
                        fillCatSelects(); applyBillFilters();
                    } else if (c) applyBillFilters();
                    if (c) { Toast.success(`Categoria "${escCat(nome)}" atualizada${mudadas ? ` (${mudadas} conta${mudadas > 1 ? 's' : ''} com o nome novo)` : ''}.`); lista(); return; }
                    const sel = document.getElementById('billCat'); if (sel) sel.value = nome;
                    Toast.success(`Categoria "${escCat(nome)}" criada${document.getElementById('modalConta')?.classList.contains('active') ? ' e selecionada' : ''}!`); close();
                } catch(e) {
                    Toast.error('Erro ao salvar a categoria: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
                    salvar.disabled = false; salvar.innerHTML = '<i class="fas fa-floppy-disk"></i> Salvar';
                }
            });
            setTimeout(() => inp.focus(), 50);
        };
        ov.addEventListener('click', async e => {
            if (e.target === ov || e.target.closest('[data-x]')) { close(); return; }
            if (e.target.closest('[data-nova]')) { form(-1); return; }
            if (e.target.closest('[data-voltar]')) { lista(); return; }
            const ed = e.target.closest('[data-ed]'); if (ed) { form(Number(ed.dataset.ed)); return; }
            const del = e.target.closest('[data-del]'); if (del) { excluindo = (extraCats[Number(del.dataset.del)] || {}).nome || ''; lista(); return; }
            if (e.target.closest('[data-nao]')) { excluindo = ''; lista(); return; }
            const sim = e.target.closest('[data-sim]'); if (!sim) return;
            const nome = (extraCats[Number(sim.dataset.sim)] || {}).nome; if (!nome) return;
            sim.disabled = true;
            try { await saveExtraCats(l => l.filter(c => c.nome.toLowerCase() !== nome.toLowerCase())); excluindo = ''; lista(); applyBillFilters(); Toast.success(`Categoria "${escCat(nome)}" excluída.`); }
            catch(err) { sim.disabled = false; Toast.error('Erro ao excluir a categoria: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); }
        });
        lista();
    };

    function populateSupplierSelect() {
        const sel = document.getElementById('billSupplier');
        if (!sel) return;
        sel.innerHTML = '<option value="">Nenhum</option>' +
            suppliers.map(s => `<option value="${s.id}" data-name="${s.name}">${s.name}</option>`).join('');
    }

    function updateStats() {
        const now = new Date(); now.setHours(0,0,0,0);
        const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const pending = bills.filter(b => b.status === 'pending');
        const totalPend = pending.reduce((s,b) => s+(b.amount||0), 0);
        const todayN   = pending.filter(b => { const d=b.dueDate?.toDate?.()|| new Date(b.dueDate||0); return d>=now&&d<=todayEnd; }).length;
        const overdueN = pending.filter(b => { const d=b.dueDate?.toDate?.()|| new Date(b.dueDate||0); return d<now; }).length;
        const paidN    = bills.filter(b => b.status==='paid' && (b.paidAt?.toDate?.()||new Date(b.paidAt||0))>=monthStart).length;
        const cards = document.querySelectorAll('.stat-value');
        if(cards[0]) cards[0].textContent = fmtCurrency(totalPend);
        if(cards[1]) cards[1].textContent = todayN;
        if(cards[2]) { cards[2].textContent = overdueN; if(overdueN>0) cards[2].style.color='#ef4444'; }
        if(cards[3]) cards[3].textContent = paidN;
    }

    window.applyBillFilters = () => {
        const q      = (document.getElementById('billSearch')?.value||'').toLowerCase();
        const stVal  = document.getElementById('billFilterStatus')?.value||'';
        const catVal = document.getElementById('billFilterCat')?.value||'';
        const now    = new Date(); now.setHours(0,0,0,0);

        let data = [...bills];
        if (q)      data = data.filter(b => (b.description||'').toLowerCase().includes(q)||(b.supplierName||'').toLowerCase().includes(q)||(b.category||'').toLowerCase().includes(q));
        if (catVal) data = data.filter(b => b.category === catVal);
        if (stVal === 'pending')  data = data.filter(b => b.status==='pending' && (b.dueDate?.toDate?.()|| new Date(b.dueDate||0))>=now);
        if (stVal === 'overdue')  data = data.filter(b => b.status==='pending' && (b.dueDate?.toDate?.()|| new Date(b.dueDate||0))<now);
        if (stVal === 'paid')     data = data.filter(b => b.status==='paid');
        data = stVal === 'cancelled' ? data.filter(b => b.status==='cancelled') : data.filter(b => b.status!=='cancelled'); // 38.3 · conta de compra cancelada só aparece no filtro "Cancelada"

        if (!tbody) return;
        if (!data.length) { tbody.innerHTML = setEmptyRow(7); return; }
        const today = new Date(); today.setHours(0,0,0,0);
        tbody.innerHTML = data.map(b => {
            const due    = b.dueDate?.toDate?.() || new Date(b.dueDate||0);
            const isOver = due < today && b.status === 'pending';
            const diffDays = Math.ceil((due - today) / 86400000);
            const dueLabel = b.status === 'paid' ? fmtDate(b.dueDate)
                : isOver ? `<span style="color:#ef4444;font-weight:700">${fmtDate(b.dueDate)} (${Math.abs(diffDays)}d atraso)</span>`
                : diffDays === 0 ? `<span style="color:#f59e0b;font-weight:700">Hoje!</span>`
                : diffDays <= 3 ? `<span style="color:#f59e0b">${fmtDate(b.dueDate)} (${diffDays}d)</span>`
                : fmtDate(b.dueDate);
            return `<tr>
                <td><strong style="color:var(--text-primary)">${b.description||'—'}</strong>${b.notes?`<br><small style="color:var(--text-muted)">${b.notes}</small>`:''}</td>
                <td>${catBadge(b.category)}</td>
                <td style="font-size:12px;color:var(--text-secondary)">${b.supplierName||'—'}</td>
                <td>${dueLabel}</td>
                <td style="font-weight:700;font-size:14px">${fmtCurrency(b.amount)}</td>
                <td>${badgeSt(isOver?'overdue':b.status)}</td>
                <td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                    ${b.status==='pending'?`<button class="btn btn-sm btn-success" style="font-size:11px;padding:4px 10px" onclick="payBill('${b.id}')"><i class="fas fa-check"></i> Pagar</button>`:''}
                    <button class="btn-icon" title="Editar" onclick="editBill('${b.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-danger" title="Excluir" onclick="delBill('${b.id}','${dpJsAttr(b.description)}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    };

    window.openNewBill = () => {
        editingId = null;
        document.getElementById('modalContaTitulo').innerHTML = '<i class="fas fa-file-invoice-dollar"></i> Nova Conta a Pagar';
        ['billDesc','billNotes'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        ['billCat','billSupplier','billRecurrence','billPayMethod'].forEach(id => { const el=document.getElementById(id); if(el) el.selectedIndex=0; });
        const due = document.getElementById('billDue'); if(due) due.value='';
        const amt = document.getElementById('billAmount'); if(amt) amt.value='';
        openModal('modalConta');
    };

    window.payBill = id => Confirm.show('Baixar Conta','Confirmar pagamento desta conta?', async()=>{
        try {
            await db.collection('financial_entries').doc(id).update({status:'paid', paidAt:firebase.firestore.FieldValue.serverTimestamp()});
            Toast.success('Conta marcada como paga!'); await load();
        } catch (e) { Toast.error('Erro ao pagar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    });

    window.editBill = id => {
        editingId = id;
        const b = bills.find(x=>x.id===id); if(!b) return;
        document.getElementById('modalContaTitulo').innerHTML = '<i class="fas fa-pen"></i> Editar Conta';
        document.getElementById('billDesc').value    = b.description||'';
        document.getElementById('billCat').value     = b.category||'';
        document.getElementById('billAmount').value  = (b.amount||0).toFixed(2);
        document.getElementById('billNotes').value   = b.notes||'';
        document.getElementById('billPayMethod').value = b.paymentMethod||'Boleto';
        document.getElementById('billRecurrence').value = b.recurrence||'';
        // Data de vencimento
        try {
            const d = b.dueDate?.toDate?.() || new Date(b.dueDate||0);
            document.getElementById('billDue').value = d.toISOString().split('T')[0];
        } catch(e) {}
        // Fornecedor
        const supSel = document.getElementById('billSupplier');
        if (supSel) supSel.value = b.supplierId || '';
        openModal('modalConta');
    };

    window.delBill = (id, name) => Confirm.show('Excluir', `Excluir "${name}"?`, async()=>{
        try { await db.collection('financial_entries').doc(id).update({deleted:true}); Toast.success('Excluída!'); await load(); }
        catch (e) { Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    });

    window.saveBill = async () => {
        const desc      = document.getElementById('billDesc')?.value?.trim()||'';
        const cat       = document.getElementById('billCat')?.value||'';
        const amount    = parseFloat(document.getElementById('billAmount')?.value)||0;
        const dueStr    = document.getElementById('billDue')?.value||'';
        const notes     = document.getElementById('billNotes')?.value||'';
        const payMethod = document.getElementById('billPayMethod')?.value||'';
        const recur     = document.getElementById('billRecurrence')?.value||'';
        const supSel    = document.getElementById('billSupplier');
        const supplierId   = supSel?.value||'';
        const supplierName = supSel?.selectedOptions[0]?.dataset?.name || supSel?.selectedOptions[0]?.text || '';

        if (!desc)   { Toast.warning('Informe a descrição'); return; }
        if (!dueStr) { Toast.warning('Informe o vencimento'); return; }
        if (!amount) { Toast.warning('Informe o valor'); return; }

        const btn = document.querySelector('#modalConta .btn-primary');
        if(btn){ btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

        try {
            const data = {
                type:'expense', description:desc, category:cat, amount,
                dueDate: firebase.firestore.Timestamp.fromDate(new Date(dueStr+'T12:00:00')),
                status: editingId ? (bills.find(b=>b.id===editingId)?.status||'pending') : 'pending',
                notes, paymentMethod:payMethod, recurrence:recur,
                supplierId, supplierName: supplierId ? supplierName : '',
                deleted:false
            };
            if (editingId) {
                await db.collection('financial_entries').doc(editingId).update(data);
                Toast.success('Conta atualizada!');
            } else {
                await db.collection('financial_entries').add({...data, createdAt:firebase.firestore.FieldValue.serverTimestamp(), createdBy:auth.currentUser?.uid||''});
                Toast.success('Conta cadastrada!');
            }
            closeModal('modalConta'); editingId=null; await load();
        } catch (e) {
            console.error(e); Toast.error('Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
        } finally {
            // 40.28 · Antes só voltava no erro: depois de salvar, o botão ficava em "Salvando..." e a próxima conta não salvava (todas as versões)
            if(btn){ btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Salvar'; }
        }
    };

    await load();
}


/* ================================================================
   PÁGINA: CONTAS A RECEBER
================================================================ */
async function initPageContasReceber() {
    let recs = [];
    let clients = [];
    let editingId = null;
    let currentTab = 'existente';

    const tbody = document.querySelector('tbody');
    if (tbody) tbody.innerHTML = setLoadingRow(6);

    // ── CARREGAR DADOS ─────────────────────────────────────
    async function load() {
        try {
            [recs, clients] = await Promise.all([
                simpleList('financial_entries', 'dueDate', 'asc'),
                simpleList('customers', 'name', 'asc', 10000),
            ]);
            recs = recs.filter(r => r.type === 'income');
        } catch(e) { console.error(e); }
        populateClientSelect();
        updateStats();
        render();
    }

    // ── POPULAR SELECT DE CLIENTES ─────────────────────────
    function populateClientSelect() {
        const sel = document.getElementById('rec_clienteId');
        if (!sel) return;
        sel.innerHTML = '<option value="">Selecione o cliente...</option>'
            + clients.map(c => `<option value="${c.id}"
                data-phone="${c.phone||''}"
                data-wpp="${c.whatsapp||c.phone||''}"
                data-end="${[c.address,c.city,c.state].filter(Boolean).join(', ')||''}"
                >${c.name}</option>`).join('');
        sel.addEventListener('change', () => showClientInfo(sel));
    }

    // ── INFO DO CLIENTE SELECIONADO ────────────────────────
    function showClientInfo(sel) {
        const opt = sel.options[sel.selectedIndex];
        const info = document.getElementById('rec_clienteInfo');
        if (!info || !opt.value) { if(info) info.style.display='none'; return; }
        const tel = document.getElementById('rec_clienteTel');
        const wpp = document.getElementById('rec_clienteWpp');
        const end = document.getElementById('rec_clienteEnd');
        if (tel) tel.innerHTML = `<i class="fas fa-phone" style="color:var(--accent);margin-right:5px"></i>${opt.dataset.phone || '—'}`;
        if (wpp) {
            const num = (opt.dataset.wpp||'').replace(/\D/g,'');
            wpp.innerHTML = num
                ? `<a href="https://wa.me/55${num}" target="_blank" style="color:#25d366;text-decoration:none"><i class="fab fa-whatsapp" style="margin-right:5px"></i>${opt.dataset.wpp}</a>`
                : `<i class="fab fa-whatsapp" style="color:#25d366;margin-right:5px"></i>—`;
        }
        if (end) end.innerHTML = `<i class="fas fa-map-marker-alt" style="color:var(--accent);margin-right:5px"></i>${opt.dataset.end || '—'}`;
        info.style.display = 'block';
    }

    // ── TROCAR ABA DO MODAL ────────────────────────────────
    window.switchReceivableTab = function(tab) {
        currentTab = tab;
        const panelEx  = document.getElementById('panelExistente');
        const panelNov = document.getElementById('panelNovo');
        const btnEx    = document.getElementById('tabClienteExistente');
        const btnNov   = document.getElementById('tabClienteNovo');

        const activeStyle   = { borderBottom: '2px solid var(--accent)', color: 'var(--accent)', fontWeight: '600' };
        const inactiveStyle = { borderBottom: '2px solid transparent', color: 'var(--text-muted)', fontWeight: '500' };

        if (tab === 'existente') {
            panelEx.style.display  = 'block';
            panelNov.style.display = 'none';
            Object.assign(btnEx.style, activeStyle);
            Object.assign(btnNov.style, inactiveStyle);
        } else {
            panelEx.style.display  = 'none';
            panelNov.style.display = 'block';
            Object.assign(btnNov.style, activeStyle);
            Object.assign(btnEx.style, inactiveStyle);
        }
    };

    // ── STATS ──────────────────────────────────────────────
    function updateStats() {
        const now = new Date(); now.setHours(0,0,0,0);
        const todayEnd = new Date(); todayEnd.setHours(23,59,59,999);
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
        const pending = recs.filter(r => r.status === 'pending');
        const total   = pending.reduce((s,r) => s+(r.amount||0), 0);
        const todayN  = pending.filter(r => { const d=r.dueDate?.toDate?.()||new Date(r.dueDate||0); return d>=now&&d<=todayEnd; }).length;
        const overdueN= pending.filter(r => { const d=r.dueDate?.toDate?.()||new Date(r.dueDate||0); return d<now; }).length;
        const recN    = recs.filter(r => r.status==='received' && (r.paidAt?.toDate?.()||new Date(r.paidAt||0))>=monthStart).length;
        const cards = document.querySelectorAll('.stat-value');
        if(cards[0]) cards[0].textContent = fmtCurrency(total);
        if(cards[1]) cards[1].textContent = todayN;
        if(cards[2]) { cards[2].textContent = overdueN; if(overdueN>0) cards[2].style.color='#ef4444'; }
        if(cards[3]) cards[3].textContent = recN;
    }

    // ── RENDER TABELA ──────────────────────────────────────
    function getRecFiltered() {
        const q      = (document.getElementById('recSearch')?.value||'').toLowerCase();
        const stVal  = document.getElementById('recFilterStatus')?.value||'';
        const catVal = document.getElementById('recFilterCat')?.value||'';
        const now    = new Date(); now.setHours(0,0,0,0);
        let data = [...recs];
        if (q)      data = data.filter(r => (r.customerName||r.debtorName||'').toLowerCase().includes(q)||(r.description||'').toLowerCase().includes(q));
        if (catVal) data = data.filter(r => r.category === catVal);
        if (stVal === 'pending')  data = data.filter(r => r.status==='pending' && (r.dueDate?.toDate?.()||new Date(r.dueDate||0))>=now);
        if (stVal === 'overdue')  data = data.filter(r => r.status==='pending' && (r.dueDate?.toDate?.()||new Date(r.dueDate||0))<now);
        if (stVal === 'received') data = data.filter(r => r.status==='received');
        return data;
    }

    window.applyRecFilters = () => {
        const data = getRecFiltered();
        const today = new Date(); today.setHours(0,0,0,0);
        if (!tbody) return;
        if (!data.length) { tbody.innerHTML=setEmptyRow(7,'Nenhuma conta encontrada.'); return; }
        tbody.innerHTML = data.map(r => {
            const due    = r.dueDate?.toDate?.()||new Date(r.dueDate||0);
            const isOver = due<today && r.status==='pending';
            const diffDays = Math.ceil((due - today) / 86400000);
            const dueLabel = r.status==='received' ? fmtDate(r.dueDate)
                : isOver ? `<span style="color:#ef4444;font-weight:700">${fmtDate(r.dueDate)} (${Math.abs(diffDays)}d atraso)</span>`
                : diffDays===0 ? `<span style="color:#f59e0b;font-weight:700">Hoje!</span>`
                : diffDays<=3  ? `<span style="color:#f59e0b">${fmtDate(r.dueDate)} (${diffDays}d)</span>`
                : fmtDate(r.dueDate);
            const name   = r.customerName || r.debtorName || '—';
            const wpp    = (r.debtorPhone||r.customerPhone||'').replace(/\D/g,'');
            const wppBtn = wpp ? `<a href="https://wa.me/55${wpp}" target="_blank" class="btn-icon" title="WhatsApp" style="color:#25d366"><i class="fab fa-whatsapp"></i></a>` : '';
            return `<tr>
                <td><strong style="color:var(--text-primary)">${name}</strong>${r.debtorDoc?`<div style="font-size:11px;color:var(--text-muted);font-family:monospace">${r.debtorDoc}</div>`:''}</td>
                <td><span class="badge badge-info" style="font-size:11px">${r.category||'—'}</span></td>
                <td style="font-size:12px;color:var(--text-secondary);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${r.description||'—'}</td>
                <td>${dueLabel}</td>
                <td style="font-weight:700;font-size:14px">${fmtCurrency(r.amount)}</td>
                <td>${badgeSt(isOver?'overdue':r.status)}</td>
                <td style="display:flex;gap:4px;align-items:center;flex-wrap:wrap">
                    ${r.status==='pending'?`<button class="btn btn-sm btn-success" style="font-size:11px;padding:4px 10px" onclick="receiveIt('${r.id}')"><i class="fas fa-check"></i> Receber</button>`:''}
                    ${wppBtn}
                    <button class="btn-icon" title="Editar" onclick="editRec('${r.id}')"><i class="fas fa-pen"></i></button>
                    <button class="btn-icon btn-danger" title="Excluir" onclick="delRec('${r.id}','${dpJsAttr(r.customerName||r.debtorName)}')"><i class="fas fa-trash"></i></button>
                </td>
            </tr>`;
        }).join('');
    };

    function render() { if(window.applyRecFilters) applyRecFilters(); }
    // ── SALVAR CONTA ───────────────────────────────────────
    // 40.73 · O botão não mostrava que estava gravando e o toque duplo (celular, internet lenta) criava a conta duas vezes.
    window.saveReceivable = async function() {
        if (window.__dpSalvandoRec) return;
        const btn = document.querySelector('#modalReceber [onclick*="saveReceivable"]'), txt = btn ? btn.innerHTML : '';
        window.__dpSalvandoRec = true;
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...'; }
        try { await saveReceivableInner(); }
        finally { window.__dpSalvandoRec = false; if (btn) { btn.disabled = false; btn.innerHTML = txt; } }
    };
    async function saveReceivableInner() {
        const valor   = parseCurrency(document.getElementById('rec_valor')?.value);
        const venc    = document.getElementById('rec_vencimento')?.value;
        const cat     = document.getElementById('rec_categoria')?.value || 'Outros';
        const desc    = document.getElementById('rec_descricao')?.value || '';
        const obs     = document.getElementById('rec_obs')?.value || '';
        const parcelas= parseInt(document.getElementById('rec_parcelas')?.value || '1');

        if (!valor) { Toast.warning('Informe o valor.'); return; }
        if (!venc)  { Toast.warning('Informe o vencimento.'); return; }
        if (editingId && parcelas > 1) { Toast.warning('Para parcelar, crie uma nova conta. Na edição altere valor, vencimento, categoria e descrição.'); return; } // 36.6

        let customerName = '', customerId = '', debtorName = '', debtorPhone = '', debtorDoc = '', debtorAddress = '';

        if (currentTab === 'existente') {
            const sel = document.getElementById('rec_clienteId');
            customerId   = sel?.value || '';
            customerName = sel?.options[sel.selectedIndex]?.text || '';
            if (!customerId) { Toast.warning('Selecione um cliente.'); return; }
            // Buscar info do cliente
            const cli = clients.find(c => c.id === customerId);
            if (cli) {
                debtorPhone   = cli.whatsapp || cli.phone || '';
                debtorAddress = [cli.address, cli.city, cli.state].filter(Boolean).join(', ');
            }
        } else {
            debtorName    = document.getElementById('rec_nomeAvulso')?.value?.trim() || '';
            debtorPhone   = document.getElementById('rec_wppAvulso')?.value || '';
            debtorDoc     = document.getElementById('rec_docAvulso')?.value || '';
            debtorAddress = document.getElementById('rec_endAvulso')?.value || '';
            customerName  = debtorName;
            if (!debtorName) { Toast.warning('Informe o nome da pessoa.'); return; }

            // Cadastrar como cliente se marcado
            if (document.getElementById('rec_salvarCliente')?.checked) {
                try {
                    const newClient = await db.collection('customers').add({
                        name: debtorName, phone: debtorPhone, whatsapp: debtorPhone,
                        document: debtorDoc, address: debtorAddress,
                        status: 'active', deleted: false,
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        createdBy: auth.currentUser?.uid || ''
                    });
                    customerId = newClient.id;
                    Toast.info(`"${debtorName}" cadastrado como cliente!`);
                } catch(e) { console.warn('Erro ao cadastrar cliente:', e); }
            }
        }

        try {
            const baseDate = new Date(venc + 'T12:00:00');
            const entries = [];

            for (let p = 0; p < parcelas; p++) {
                const dueDate = new Date(baseDate);
                dueDate.setMonth(dueDate.getMonth() + p);

                entries.push({
                    type: 'income',
                    customerId, customerName, debtorName, debtorPhone, debtorDoc, debtorAddress,
                    amount: valor,
                    description: parcelas > 1 ? `${desc} (${p+1}/${parcelas})` : (desc || `Cobrança — ${customerName}`),
                    category: cat,
                    dueDate: firebase.firestore.Timestamp.fromDate(dueDate),
                    status: 'pending',
                    notes: obs,
                    installment: parcelas > 1 ? { number: p+1, total: parcelas } : null,
                    deleted: false,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    createdBy: auth.currentUser?.uid || ''
                });
            }

            for (const entry of entries) {
                if (editingId && entries.length === 1) {
                    // 36.6 · Edição só muda os campos do formulário: mantém status, origem (venda/OS), parcela e data de criação
                    const upd = { ...entry }; delete upd.createdAt; delete upd.createdBy; delete upd.status; delete upd.installment; delete upd.deleted;
                    await db.collection('financial_entries').doc(editingId).update(upd);
                } else {
                    await db.collection('financial_entries').add(entry);
                }
            }

            const msg = editingId ? `Conta de ${customerName} atualizada!` : parcelas > 1
                ? `${parcelas} parcelas criadas para ${customerName}!`
                : `Conta de ${fmtCurrency(valor)} para ${customerName} criada!`;
            Toast.success(msg);
            closeModal('modalReceber');
            resetModal();
            editingId = null;
            await load();
        } catch (e) {
            console.error(e);
            Toast.error('Erro ao salvar conta: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
        }
    }

    // ── EDITAR ─────────────────────────────────────────────
    window.editRec = function(id) {
        const r = recs.find(x => x.id === id);
        if (!r) return;

        resetModal();
        editingId = id; // 36.6 · depois do reset (antes o reset zerava o id e a edição criava uma conta duplicada)
        document.getElementById('modalReceberTitle').innerHTML = '<i class="fas fa-pen"></i> Editar Conta a Receber';

        if (r.customerId) {
            switchReceivableTab('existente');
            const sel = document.getElementById('rec_clienteId');
            if (sel) { sel.value = r.customerId; showClientInfo(sel); }
        } else {
            switchReceivableTab('novo');
            const nEl = document.getElementById('rec_nomeAvulso');
            const wEl = document.getElementById('rec_wppAvulso');
            const dEl = document.getElementById('rec_docAvulso');
            const eEl = document.getElementById('rec_endAvulso');
            if (nEl) nEl.value = r.debtorName || r.customerName || '';
            if (wEl) wEl.value = r.debtorPhone || '';
            if (dEl) dEl.value = r.debtorDoc || '';
            if (eEl) eEl.value = r.debtorAddress || '';
        }

        const valEl = document.getElementById('rec_valor');
        const vncEl = document.getElementById('rec_vencimento');
        const catEl = document.getElementById('rec_categoria');
        const desEl = document.getElementById('rec_descricao');
        const obsEl = document.getElementById('rec_obs');

        if (valEl) valEl.value = (r.amount||0).toFixed(2).replace('.',',');
        if (vncEl) { try { vncEl.value = r.dueDate?.toDate?.()?.toISOString().split('T')[0] || ''; } catch(e){} }
        if (catEl) catEl.value = r.category || 'Outros';
        if (desEl) desEl.value = r.description || '';
        if (obsEl) obsEl.value = r.notes || '';
        const parEl = document.getElementById('rec_parcelas');
        if (parEl) { parEl.value = '1'; parEl.disabled = true; } // 36.6 · parcelar só em conta nova

        openModal('modalReceber');
    };

    // ── RECEBER ────────────────────────────────────────────
    window.receiveIt = id => Confirm.show('Confirmar Recebimento', 'Marcar como recebida?', async () => {
        try {
            await db.collection('financial_entries').doc(id).update({
                status: 'received',
                paidAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            Toast.success('Recebimento confirmado!');
            await load();
        } catch (e) { Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    });

    // ── EXCLUIR ────────────────────────────────────────────
    window.delRec = (id, name) => Confirm.show('Excluir Conta', `Excluir conta de "${name}"?`, async () => {
        try {
            await db.collection('financial_entries').doc(id).update({ deleted: true });
            Toast.success('Conta excluída.');
            await load();
        } catch (e) { Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    });

    // ── RESET MODAL ────────────────────────────────────────
    function resetModal() {
        editingId = null;
        document.getElementById('modalReceberTitle').innerHTML = '<i class="fas fa-hand-holding-dollar"></i> Nova Conta a Receber';
        switchReceivableTab('existente');
        const ids = ['rec_clienteId','rec_nomeAvulso','rec_wppAvulso','rec_docAvulso','rec_endAvulso',
                     'rec_valor','rec_descricao','rec_obs'];
        ids.forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        const catEl = document.getElementById('rec_categoria');
        if (catEl) catEl.selectedIndex = 0;
        const parEl = document.getElementById('rec_parcelas');
        if (parEl) { parEl.selectedIndex = 0; parEl.disabled = false; }
        const chk = document.getElementById('rec_salvarCliente');
        if (chk) chk.checked = false;
        const info = document.getElementById('rec_clienteInfo');
        if (info) info.style.display = 'none';
        // Vencimento default = hoje + 30 dias
        const vncEl = document.getElementById('rec_vencimento');
        if (vncEl) {
            const d = new Date(); d.setDate(d.getDate()+30);
            vncEl.value = d.toISOString().split('T')[0];
        }
    }

    // ── MÁSCARAS ───────────────────────────────────────────
    const wppEl = document.getElementById('rec_wppAvulso');
    if (wppEl) wppEl.addEventListener('input', function() { this.value = Utils.maskPhone(this.value); });
    const docEl = document.getElementById('rec_docAvulso');
    if (docEl) docEl.addEventListener('input', function() { this.value = Utils.maskDocument(this.value); });
    const valEl = document.getElementById('rec_valor');
    if (valEl) {
        valEl.addEventListener('blur', function() {
            const v = parseCurrency(this.value);
            if (v > 0) this.value = v.toFixed(2).replace('.',',');
        });
    }

    // ── ABRIR MODAL ZERADO ─────────────────────────────────
    window.openNewReceivable = () => { resetModal(); openModal('modalReceber'); };

    // ── EXPORTAR PDF ───────────────────────────────────────
    window.exportRecPDF = async () => {
        const data = getRecFiltered();
        let empresa = 'DistribuiPRO';
        try { const cfg=await db.collection('settings').doc('general').get(); if(cfg.exists) empresa=cfg.data().nomeFantasia||cfg.data().razaoSocial||empresa; } catch(e){}
        const now = new Date();
        const dateStr = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
        const stVal  = document.getElementById('recFilterStatus')?.value||'';
        const catVal = document.getElementById('recFilterCat')?.value||'';
        const filterLabel = [stVal?({pending:'Pendentes',overdue:'Vencidas',received:'Recebidas'}[stVal]||stVal):'', catVal].filter(Boolean).join(' · ') || 'Todas';
        const totalVal = data.reduce((s,r)=>s+(r.amount||0),0);
        const totalPend = data.filter(r=>r.status==='pending').reduce((s,r)=>s+(r.amount||0),0);
        const today = new Date(); today.setHours(0,0,0,0);

        const rows = data.map((r,i) => {
            const due    = r.dueDate?.toDate?.()||new Date(r.dueDate||0);
            const isOver = due<today && r.status==='pending';
            const stColor= r.status==='received'?'#10b981':isOver?'#ef4444':'#f59e0b';
            const stLabel= r.status==='received'?'Recebida':isOver?'Vencida':'Pendente';
            const bg=i%2===0?'#f8fafc':'#ffffff';
            return `<tr style="background:${bg}">
                <td style="font-weight:600;color:#1e293b">${r.customerName||r.debtorName||'—'}</td>
                <td><span style="background:#e0e7ff;color:#4f46e5;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">${r.category||'—'}</span></td>
                <td style="font-size:11px;color:#64748b;max-width:150px">${r.description||'—'}</td>
                <td style="${isOver?'color:#ef4444;font-weight:700':''}">${fmtDate(r.dueDate)}</td>
                <td style="text-align:right;font-weight:700;color:#059669">R$ ${(r.amount||0).toFixed(2).replace('.',',')}</td>
                <td style="text-align:center"><span style="background:${stColor}22;color:${stColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">${stLabel}</span></td>
            </tr>`;
        }).join('');

        const win = window.open('','_blank','width=1050,height=800');
        win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Contas a Receber — '+empresa+'</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}.page{padding:28px 32px;max-width:1000px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #10b981}.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.header-left .subtitle{font-size:12px;color:#64748b;margin-top:4px}.header-right{text-align:right}.header-right .empresa{font-size:16px;font-weight:700;color:#10b981}.header-right .date{font-size:11px;color:#94a3b8;margin-top:4px}.badge-filter{display:inline-block;background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.sum-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px}.sum-card .val{font-size:17px;font-weight:800;margin-top:2px}.sum-card .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.sum-card.green{border-color:#bbf7d0;background:#f0fdf4}.sum-card.green .val{color:#16a34a}.sum-card.accent{border-color:#c7d2fe;background:#eef2ff}.sum-card.accent .val{color:#4f46e5}.table-wrap{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}table{width:100%;border-collapse:collapse}thead tr{background:linear-gradient(135deg,#10b981,#059669)}thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:10px;text-align:left}thead th.right{text-align:right}thead th.center{text-align:center}tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tbody tr:last-child td{border-bottom:none}.totals-row td{font-weight:700;background:#f0fdf4 !important;color:#059669;border-top:2px solid #bbf7d0}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between}.footer div{font-size:10px;color:#94a3b8}@media print{body{background:#fff}@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}}</style></head><body><div class="page"><div class="header"><div class="header-left"><h1>💰 Contas a Receber</h1><div class="subtitle">Relatório de cobranças e recebimentos</div><div class="badge-filter">'+filterLabel+'</div></div><div class="header-right"><div class="empresa">'+empresa+'</div><div class="date">Gerado em '+dateStr+'</div></div></div><div class="summary"><div class="sum-card accent"><div class="lbl">Total Registros</div><div class="val">'+data.length+'</div></div><div class="sum-card"><div class="lbl">Total Geral</div><div class="val" style="font-size:14px;color:#1e293b">R$ '+totalVal.toFixed(2).replace(".",",")+'</div></div><div class="sum-card"><div class="lbl">A Receber</div><div class="val" style="color:#f59e0b">R$ '+totalPend.toFixed(2).replace(".",",")+'</div></div><div class="sum-card green"><div class="lbl">Já Recebido</div><div class="val">R$ '+(totalVal-totalPend).toFixed(2).replace(".",",")+'</div></div></div><div class="table-wrap"><table><thead><tr><th>Cliente</th><th>Categoria</th><th>Descrição</th><th>Vencimento</th><th class="right">Valor</th><th class="center">Status</th></tr></thead><tbody>'+rows+'<tr class="totals-row"><td colspan="4" style="text-align:right;font-size:11px">TOTAL</td><td style="text-align:right">R$ '+totalVal.toFixed(2).replace(".",",")+'</td><td></td></tr></tbody></table></div><div class="footer"><div>DistribuiPRO ERP · Contas a Receber · '+dateStr+'</div><div>'+data.length+' registro'+(data.length!==1?'s':'')+'</div></div></div><div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999"><button onclick="triggerPrint()" style="background:#10b981;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / Salvar PDF</button><button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button></div><script>function triggerPrint(){document.getElementById("printBtns").style.display="none";setTimeout(function(){window.print();document.getElementById("printBtns").style.display="flex";},50);}window.onbeforeprint=function(){document.getElementById("printBtns").style.display="none";};window.onafterprint=function(){document.getElementById("printBtns").style.display="flex";};<\/script></body></html>');
        win.document.close();
    };

    // ── INIT ───────────────────────────────────────────────
    await load();
}

/* ================================================================
   PÁGINA: ESTOQUE
================================================================ */
async function initPageEstoque() {
    let products = [];
    const tbody = document.querySelector('tbody');
    if(tbody) tbody.innerHTML = setLoadingRow(7);

    async function load() {
        try { products = (await simpleList('products','name','asc',10000)).filter(p => p.productType !== 'service' && p.controlStock !== false); } catch(e){ console.error(e); }
        updateStats(); renderAlerts(); populateCategories(); render();
    }

    function updateStats() {
        const totalVal=products.reduce((s,p)=>s+((p.currentStock||0)*(p.costPrice||0)),0);
        const low=products.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<=(p.minStock||5)).length;
        const zero=products.filter(p=>(p.currentStock||0)===0).length;
        const cards=document.querySelectorAll('.stat-value');
        if(cards[0])cards[0].textContent=products.length;
        if(cards[1])cards[1].textContent=fmtCurrency(totalVal);
        if(cards[2]){cards[2].textContent=low;if(low>0)cards[2].style.color='#f59e0b';}
        if(cards[3]){cards[3].textContent=zero;if(zero>0)cards[3].style.color='#ef4444';}
    }

    function renderAlerts() {
        const c=document.querySelector('[style*="border-left:4px solid #ef4444"] > div,[style*="border-left: 4px solid #ef4444"] > div');
        if(!c)return;
        const alerts=products.filter(p=>(p.currentStock||0)<=(p.minStock||5));
        if(!alerts.length){c.innerHTML='<p style="color:var(--text-muted);font-size:13px"><i class="fas fa-circle-check" style="color:var(--success);margin-right:6px"></i>Tudo certo: nenhum alerta de estoque.</p>';return;}
        c.innerHTML=alerts.slice(0,30).map(p=>{ // 35.54 · no máximo 30 avisos na tela (com centenas zerados a página travava)
            const isZero=(p.currentStock||0)===0;
            return`<div style="padding:12px;border-radius:10px;background:rgba(239,68,68,.08);border:1px solid rgba(239,68,68,.2)">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <strong style="color:var(--text-primary);font-size:13px">${p.name}</strong>
                    <span class="badge badge-danger" style="font-size:10px">${isZero?'SEM ESTOQUE':'BAIXO'}</span>
                </div>
                <div style="font-size:12px;color:var(--text-muted);margin-top:4px">Estoque: <strong style="color:#ef4444">${p.currentStock||0}</strong> un · Mínimo: ${p.minStock||5} un</div>
            </div>`;
        }).join('')+(alerts.length>30?`<p style="color:var(--text-muted);font-size:12px;margin:6px 2px 0">+ ${alerts.length-30} produto(s) com estoque baixo ou zerado. Use o filtro de status da tabela para ver todos.</p>`:'');
    }

    function applyFilters() {
        const q      = (document.getElementById('stockSearch')?.value || '').toLowerCase();
        const catVal = document.getElementById('stockFilterCategory')?.value || '';
        const stVal  = document.getElementById('stockFilterStatus')?.value || '';
        let data = [...products].filter(p => !p.deleted);
        if (q)       data = data.filter(p => (p.name||'').toLowerCase().includes(q) || String(p.code||'').toLowerCase().includes(q)||String(p.barcode||'').toLowerCase().includes(q));
        if (catVal)  data = data.filter(p => p.category === catVal);
        if (stVal === 'sem')   data = data.filter(p => (p.currentStock||0) === 0);
        if (stVal === 'baixo') data = data.filter(p => (p.currentStock||0) > 0 && (p.currentStock||0) <= (p.minStock||5));
        if (stVal === 'normal')data = data.filter(p => (p.currentStock||0) > (p.minStock||5));
        try { document.dispatchEvent(new CustomEvent('dp:stock-render', { detail: { all: products, shown: data } })); } catch(e) {}
        renderTable(data);
    }
    window.applyStockFilters = applyFilters;

    function render(search='') {
        if (search) { const el=document.getElementById('stockSearch'); if(el) el.value=search; }
        applyFilters();
    }

    function populateCategories() {
        const sel = document.getElementById('stockFilterCategory');
        if (!sel) return;
        const cats = [...new Set(products.map(p=>p.category).filter(Boolean))].sort();
        sel.innerHTML = '<option value="">Todas categorias</option>' + cats.map(c=>`<option value="${c}">${c}</option>`).join('');
    }

    function renderTable(data) {
        if(!tbody) return;
        if(!data.length){tbody.innerHTML=setEmptyRow(8);if(window.DPPager)DPPager.bar('estoque',null);return;}
        // 35.54 · Paginação (50 por página): com muitos produtos a tabela inteira travava a tela.
        const pg=window.DPPager?DPPager.slice('estoque',data,{size:50,sig:['stockSearch','stockFilterCategory','stockFilterStatus'].map(id=>document.getElementById(id)?.value||'').join('|'),render:applyFilters}):{items:data};
        tbody.innerHTML=pg.items.map(p=>{
            const st = p.currentStock || 0;
            const mn = p.minStock || 0;
            const stCls = st===0?'badge-danger':st<=mn?'badge-warning':'badge-success';
            return`<tr>
                <td>
                    <div style="font-weight:600;color:var(--text-heading)">${p.name}</div>
                    ${p.code?`<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">${p.code}</div>`:''}
                </td>
                <td><span style="background:rgba(99,102,241,.1);color:var(--accent);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${p.category||'—'}</span></td>
                <td><span class="badge ${stCls}" style="font-size:13px;font-weight:700">${st} un</span></td>
                <td style="color:var(--text-muted);font-size:12px">${mn > 0 ? mn+' un' : '—'}</td>
                <td style="color:var(--text-secondary)">${fmtCurrency(p.costPrice||0)}</td>
                <td style="color:var(--success);font-weight:600">${fmtCurrency(p.salePrice||0)}</td>
                <td style="font-weight:700;color:var(--accent)">${fmtCurrency(st*(p.costPrice||0))}</td>
                <td><button class="btn-icon" title="Ajustar estoque" onclick="openAdjustModal('${p.id}','${dpJsAttr(p.name)}',${st})"><i class="fas fa-sliders"></i></button></td>
            </tr>`;
        }).join('');
        if(window.DPPager)DPPager.bar('estoque',pg,tbody.closest('.table-container')||tbody.closest('table'));
    }

    window.exportStockPDF = async () => {
        const q      = (document.getElementById('stockSearch')?.value||'').toLowerCase();
        const catVal = document.getElementById('stockFilterCategory')?.value||'';
        const stVal  = document.getElementById('stockFilterStatus')?.value||'';
        let filtered = [...products].filter(p=>!p.deleted);
        if(q)       filtered=filtered.filter(p=>(p.name||'').toLowerCase().includes(q)||String(p.code||'').toLowerCase().includes(q)||String(p.barcode||'').toLowerCase().includes(q));
        if(catVal)  filtered=filtered.filter(p=>p.category===catVal);
        if(stVal==='sem')   filtered=filtered.filter(p=>(p.currentStock||0)===0);
        if(stVal==='baixo') filtered=filtered.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<=(p.minStock||5));
        if(stVal==='normal')filtered=filtered.filter(p=>(p.currentStock||0)>(p.minStock||5));

        let empresa='DistribuiPRO';
        try{const cfg=await db.collection('settings').doc('general').get();if(cfg.exists)empresa=cfg.data().nomeFantasia||cfg.data().razaoSocial||empresa;}catch(e){}

        const now=new Date();
        const dateStr=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
        const filterLabel=[catVal?`Categoria: ${catVal}`:'',stVal==='sem'?'Sem Estoque':stVal==='baixo'?'Estoque Baixo':stVal==='normal'?'Normal':'',q?`Busca: "${q}"`:''].filter(Boolean).join(' · ')||'Todo o estoque';
        const totalVal=filtered.reduce((s,p)=>s+((p.currentStock||0)*(p.costPrice||0)),0);
        const totalSale=filtered.reduce((s,p)=>s+((p.currentStock||0)*(p.salePrice||0)),0);
        const totalUn=filtered.reduce((s,p)=>s+(p.currentStock||0),0);
        const countLow=filtered.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<=(p.minStock||5)).length;
        const countZero=filtered.filter(p=>(p.currentStock||0)===0).length;

        const rows=filtered.map((p,i)=>{
            const st=p.currentStock||0,mn=p.minStock||5;
            const stColor=st===0?'#ef4444':st<=mn?'#f59e0b':'#10b981';
            const stLabel=st===0?'Sem estoque':st<=mn?'Baixo':'Normal';
            const bg=i%2===0?'#f8fafc':'#ffffff';
            return`<tr style="background:${bg}">
                <td style="text-align:center;color:#94a3b8;font-size:11px">${i+1}</td>
                <td><strong style="color:#1e293b;font-size:12px">${p.name||'—'}</strong>${p.code?`<br><span style="font-size:10px;color:#94a3b8;font-family:monospace">${p.code}</span>`:''}</td>
                <td><span style="background:#e0e7ff;color:#4f46e5;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${p.category||'—'}</span></td>
                <td style="text-align:center;font-weight:700;font-size:13px;color:${stColor}">${st}</td>
                <td style="text-align:center;color:#64748b;font-size:12px">${mn}</td>
                <td style="text-align:center"><span style="background:${stColor}22;color:${stColor};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">${stLabel}</span></td>
                <td style="text-align:right;color:#64748b;font-size:12px">R$ ${(p.costPrice||0).toFixed(2).replace('.',',')}</td>
                <td style="text-align:right;font-weight:700;color:#059669;font-size:12px">R$ ${(p.salePrice||0).toFixed(2).replace('.',',')}</td>
                <td style="text-align:right;font-weight:700;color:#4f46e5;font-size:12px">R$ ${(st*(p.costPrice||0)).toFixed(2).replace('.',',')}</td>
            </tr>`;
        }).join('');

        const win=window.open('','_blank','width=1100,height=800');
        win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Estoque — '+empresa+'</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}.page{padding:28px 32px;max-width:1050px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #10b981}.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.header-left .subtitle{font-size:12px;color:#64748b;margin-top:4px}.header-right{text-align:right}.header-right .empresa{font-size:16px;font-weight:700;color:#10b981}.header-right .date{font-size:11px;color:#94a3b8;margin-top:4px}.badge-filter{display:inline-block;background:#dcfce7;color:#16a34a;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:8px}.summary{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}.sum-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px}.sum-card .val{font-size:16px;font-weight:800;color:#1e293b;margin-top:2px}.sum-card .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.sum-card.accent{border-color:#c7d2fe;background:#eef2ff}.sum-card.accent .val{color:#4f46e5}.sum-card.warn{border-color:#fde68a;background:#fffbeb}.sum-card.warn .val{color:#d97706}.sum-card.red{border-color:#fecaca;background:#fff1f2}.sum-card.red .val{color:#dc2626}.table-wrap{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}table{width:100%;border-collapse:collapse}thead tr{background:linear-gradient(135deg,#10b981,#059669)}thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:10px;text-align:left}thead th.right{text-align:right}thead th.center{text-align:center}tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tbody tr:last-child td{border-bottom:none}.totals-row td{font-weight:700;background:#f0fdf4 !important;color:#059669;border-top:2px solid #bbf7d0}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between}.footer div{font-size:10px;color:#94a3b8}@media print{body{background:#fff}@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}}</style></head><body><div class="page"><div class="header"><div class="header-left"><h1>📦 Relatório de Estoque</h1><div class="subtitle">Posição atual do inventário</div><div class="badge-filter">'+filterLabel+'</div></div><div class="header-right"><div class="empresa">'+empresa+'</div><div class="date">Gerado em '+dateStr+'</div></div></div><div class="summary"><div class="sum-card"><div class="lbl">Produtos</div><div class="val">'+filtered.length+'</div></div><div class="sum-card"><div class="lbl">Total Unidades</div><div class="val">'+totalUn+'</div></div><div class="sum-card accent"><div class="lbl">Valor (Custo)</div><div class="val" style="font-size:13px">R$ '+totalVal.toFixed(2).replace(".",",")+'</div></div><div class="sum-card warn"><div class="lbl">Estoque Baixo</div><div class="val">'+countLow+'</div></div><div class="sum-card red"><div class="lbl">Sem Estoque</div><div class="val">'+countZero+'</div></div></div><div class="table-wrap"><table><thead><tr><th style="width:32px;text-align:center">#</th><th>Produto / Código</th><th>Categoria</th><th class="center">Estoque</th><th class="center">Mínimo</th><th class="center">Status</th><th class="right">Custo/un</th><th class="right">Venda/un</th><th class="right">Val. Custo</th></tr></thead><tbody>'+rows+'<tr class="totals-row"><td colspan="3" style="text-align:right;font-size:11px">TOTAL</td><td style="text-align:center">'+totalUn+' un</td><td colspan="3"></td><td style="text-align:right">R$ '+totalSale.toFixed(2).replace(".",",")+'</td><td style="text-align:right">R$ '+totalVal.toFixed(2).replace(".",",")+'</td></tr></tbody></table></div><div class="footer"><div>DistribuiPRO ERP · Relatório de Estoque · '+dateStr+'</div><div>'+filtered.length+' produto'+(filtered.length!==1?'s':'')+'</div></div></div><div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999"><button onclick="triggerPrint()" style="background:#10b981;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / Salvar PDF</button><button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button></div><script>function triggerPrint(){document.getElementById("printBtns").style.display="none";setTimeout(function(){window.print();document.getElementById("printBtns").style.display="flex";},50);}window.onbeforeprint=function(){document.getElementById("printBtns").style.display="none";};window.onafterprint=function(){document.getElementById("printBtns").style.display="flex";};<\/script></body></html>');
        win.document.close();
    };

        window.openAdjustModal = (id, name, cur) => {
            // Popula o select de produtos
            const sel = document.getElementById('ajusteProduto');
            if (sel) {
                sel.innerHTML = '<option value="">Selecione o produto...</option>' +
                    products.map(p => `<option value="${p.id}" data-stock="${p.currentStock||0}" data-min="${p.minStock||0}">${p.name}</option>`).join('');
                if (id) sel.value = id;
            }
            // Preenche info se veio de um produto específico
            if (id) {
                document.getElementById('ajusteProdNome').textContent = name || '—';
                document.getElementById('ajusteEstoqueAtual').textContent = (cur||0) + ' un';
                const p = products.find(x=>x.id===id);
                document.getElementById('ajusteEstoqueMin').textContent = (p?.minStock||0) + ' un';
                document.getElementById('ajusteProdInfo').style.display = 'block';
            } else {
                document.getElementById('ajusteProdInfo').style.display = 'none';
            }
            // Reseta campos
            document.getElementById('ajusteTipo').value = 'entry';
            document.getElementById('ajusteQtd').value = '1';
            document.getElementById('ajusteMotivo').value = '';
            document.getElementById('ajustePreview').style.display = 'none';
            onAjusteTipoChange();
            openModal('modalAjuste');
        };

        // Funções do modal expostas globalmente
        window.onAjusteProdutoChange = () => {
            const sel = document.getElementById('ajusteProduto');
            const opt = sel?.options[sel?.selectedIndex];
            const stock = parseInt(opt?.dataset?.stock || 0);
            const min   = parseInt(opt?.dataset?.min || 0);
            document.getElementById('ajusteProdNome').textContent = opt?.text || '—';
            document.getElementById('ajusteEstoqueAtual').textContent = stock + ' un';
            document.getElementById('ajusteEstoqueMin').textContent = min + ' un';
            document.getElementById('ajusteProdInfo').style.display = opt?.value ? 'block' : 'none';
            onAjusteQtyChange();
        };

        window.onAjusteTipoChange = () => {
            const tipo = document.getElementById('ajusteTipo')?.value;
            const label = document.getElementById('ajusteQtyLabel');
            if (tipo === 'adjust') {
                label.textContent = 'Nova quantidade total (inventário) *';
                document.getElementById('ajusteQtd').min = '0';
            } else {
                label.textContent = 'Quantidade *';
                document.getElementById('ajusteQtd').min = '1';
            }
            onAjusteQtyChange();
        };

        window.onAjusteQtyChange = () => {
            const sel    = document.getElementById('ajusteProduto');
            const opt    = sel?.options[sel?.selectedIndex];
            const cur    = parseInt(opt?.dataset?.stock || 0);
            const tipo   = document.getElementById('ajusteTipo')?.value;
            const qty    = parseInt(document.getElementById('ajusteQtd')?.value) || 0;
            const prev   = document.getElementById('ajustePreview');
            if (!opt?.value || !prev) { if(prev) prev.style.display='none'; return; }

            let after = cur, msg = '', color = 'var(--accent)';
            if (tipo === 'entry')  { after = cur + qty; msg = `+${qty} → ${after} unidades`; color='#10b981'; }
            if (tipo === 'exit')   { after = cur - qty; msg = `-${qty} → ${after} unidades`; color=after<0?'#ef4444':'#f59e0b'; }
            if (tipo === 'adjust') { after = qty; msg = `Definir para ${qty} unidades (era ${cur})`; color='#6366f1'; }
            if (tipo === 'loss')   { after = cur - qty; msg = `Perda de ${qty} → ${after} unidades`; color='#ef4444'; }

            prev.style.display = 'block';
            prev.innerHTML = `<span style="color:${color};font-weight:700">${msg}</span>`;
            prev.style.borderColor = color + '44';
            prev.style.background  = color + '11';
        };

        window.changeAjusteQty = (delta) => {
            const inp = document.getElementById('ajusteQtd');
            const val = Math.max(0, (parseInt(inp.value)||0) + delta);
            inp.value = val;
            onAjusteQtyChange();
        };

        window.confirmAdjust = async () => {
            const sel    = document.getElementById('ajusteProduto');
            const pid    = sel?.value;
            const pname  = sel?.options[sel?.selectedIndex]?.text || '';
            const tipo   = document.getElementById('ajusteTipo')?.value || 'entry';
            const qty    = parseInt(document.getElementById('ajusteQtd')?.value) || 0;
            const reason = document.getElementById('ajusteMotivo')?.value?.trim() || '';

            if (!pid)    { Toast.warning('Selecione o produto'); return; }
            if (qty < 0) { Toast.warning('Quantidade inválida'); return; }
            if (!reason) { Toast.warning('Informe o motivo do ajuste'); return; }

            const btn = document.querySelector('#modalAjuste .btn-primary');
            if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

            try {
                const desc = `${{entry:'Entrada',exit:'Saída',adjust:'Ajuste Inventário',loss:'Perda/Avaria'}[tipo]} — ${reason}`;
                if (tipo === 'adjust') {
                    await StockService.adjust(pid, qty, desc);
                } else if (tipo === 'entry') {
                    await StockService.entry(pid, qty, desc, 'adjustment', null);
                } else {
                    await StockService.exit(pid, qty, desc, 'adjustment', null);
                }
                Toast.success('Estoque ajustado!');
                closeModal('modalAjuste');
                if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Confirmar Ajuste'; } // 38.5 · o botão ficava travado em "Salvando..." para o próximo ajuste
                await load();
            } catch(e) {
                console.error(e);
                Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
                if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Confirmar Ajuste'; }
            }
        };

        const searchEl=document.getElementById('globalSearch')||document.querySelector('.header-search input');
        if(searchEl)searchEl.addEventListener('input',Utils.debounce(e=>render(e.target.value),300));

        await load();
    }

/* ================================================================
   PÁGINA: MOVIMENTAÇÕES
================================================================ */
async function initPageMovimentacoes() {
    let movements=[];
    const tbody=document.querySelector('tbody');
    if(tbody)tbody.innerHTML=setLoadingRow(8);

    async function load() {
        try{movements=await simpleList('stock_movements','createdAt','desc',500);}catch(e){console.error(e);}
        updateStats(); applyMovFilters();
    }

    function updateStats() {
        const now=new Date(); const ms=new Date(now.getFullYear(),now.getMonth(),1);
        const mm=movements.filter(m=>(m.createdAt?.toDate?.()||new Date(m.createdAt||0))>=ms);
        const cards=document.querySelectorAll('.stat-value');
        if(cards[0])cards[0].textContent=mm.filter(m=>m.type==='entry'||m.type==='purchase').reduce((s,m)=>s+(m.quantity||0),0)+' un';
        if(cards[1])cards[1].textContent=mm.filter(m=>m.type==='exit').reduce((s,m)=>s+(m.quantity||0),0)+' un';
        if(cards[2])cards[2].textContent=mm.filter(m=>m.type==='adjustment').length;
        if(cards[3])cards[3].textContent=mm.filter(m=>m.type==='loss').reduce((s,m)=>s+(m.quantity||0),0)+' un';
    }

    function getFiltered() {
        const search = (document.getElementById('movSearch')?.value||'').toLowerCase();
        const type   = document.getElementById('movFilterType')?.value||'';
        const df     = document.getElementById('movDateFrom')?.value||'';
        const dt     = document.getElementById('movDateTo')?.value||'';
        let data = [...movements];
        if(search) data=data.filter(m=>(m.productName||'').toLowerCase().includes(search));
        if(type)   data=data.filter(m=>m.type===type);
        if(df)     { const from=new Date(df); data=data.filter(m=>(m.createdAt?.toDate?.()||new Date(m.createdAt||0))>=from); }
        if(dt)     { const to=new Date(dt+'T23:59:59'); data=data.filter(m=>(m.createdAt?.toDate?.()||new Date(m.createdAt||0))<=to); }
        return data;
    }

    window.applyMovFilters = () => {
        const data = getFiltered();
        if(!tbody) return;
        if(!data.length){tbody.innerHTML=setEmptyRow(8);return;}
        const tmap={entry:['⬇️ Entrada','#10b981'],exit:['⬆️ Saída','#ef4444'],adjustment:['⚖️ Ajuste','#a855f7'],loss:['⚠️ Perda','#f59e0b'],purchase:['🛒 Compra','#3b82f6'],cancel:['↩️ Estorno','#f59e0b']};
        // 37.6 · ícones de traço no lugar dos emojis (só na tela; a impressão continua igual)
        const tic={entry:'arrow-down',exit:'arrow-up',adjustment:'scale',loss:'triangle-alert',purchase:'shopping-cart',cancel:'rotate-ccw'};
        tbody.innerHTML=data.slice(0,300).map(m=>{
            let [lbl,clr]=tmap[m.type]||[m.type||'—','#64748b'];
            if(window.dpIcon&&tic[m.type]) lbl=dpIcon(tic[m.type])+' '+String(lbl).replace(/^\S+\s/,'');
            const sign=(m.type==='entry'||m.type==='purchase')?'+':m.type==='adjustment'?'±':'-';
            return`<tr>
                <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDateTime(m.createdAt)}</td>
                <td><strong style="color:var(--text-primary)">${m.productName||'—'}</strong></td>
                <td><span style="background:${clr}22;color:${clr};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;white-space:nowrap">${lbl}</span></td>
                <td style="font-weight:700;color:${clr};font-size:14px">${sign}${Math.abs(m.quantity||0)} un</td>
                <td style="color:var(--text-muted)">${m.previousStock??'—'} un</td>
                <td style="font-weight:600">${m.newStock??'—'} un</td>
                <td style="font-size:12px;color:var(--text-secondary);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${m.reason||'—'}</td>
                <td style="font-size:12px;color:var(--text-muted)">${m.createdByName||'—'}</td>
            </tr>`;
        }).join('');
    };

    window.exportMovPDF = async () => {
        const data = getFiltered();
        let empresa='DistribuiPRO';
        try{const cfg=await db.collection('settings').doc('general').get();if(cfg.exists)empresa=cfg.data().nomeFantasia||cfg.data().razaoSocial||empresa;}catch(e){}

        const now=new Date();
        const dateStr=now.toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
        const type=document.getElementById('movFilterType')?.value||'';
        const df=document.getElementById('movDateFrom')?.value||'';
        const dt=document.getElementById('movDateTo')?.value||'';
        const typeNames={entry:'Entradas',exit:'Saídas',adjustment:'Ajustes',loss:'Perdas',purchase:'Compras'};
        const filterLabel=[type?typeNames[type]||type:'',df&&dt?`${df} a ${dt}`:df?`Desde ${df}`:dt?`Até ${dt}`:''].filter(Boolean).join(' · ')||'Todas as movimentações';

        const tmap={entry:['⬇️ Entrada','#10b981'],exit:['⬆️ Saída','#ef4444'],adjustment:['⚖️ Ajuste','#a855f7'],loss:['⚠️ Perda','#f59e0b'],purchase:['🛒 Compra','#3b82f6'],cancel:['↩️ Estorno','#f59e0b']};
        const totalEntradas=data.filter(m=>m.type==='entry'||m.type==='purchase').reduce((s,m)=>s+(m.quantity||0),0);
        const totalSaidas=data.filter(m=>m.type==='exit').reduce((s,m)=>s+(m.quantity||0),0);

        const rows=data.slice(0,500).map((m,i)=>{
            const [lbl,clr]=tmap[m.type]||[m.type||'—','#64748b'];
            const sign=(m.type==='entry'||m.type==='purchase')?'+':m.type==='adjustment'?'±':'-';
            const bg=i%2===0?'#f8fafc':'#ffffff';
            return`<tr style="background:${bg}">
                <td style="font-size:11px;color:#64748b;white-space:nowrap">${fmtDateTime(m.createdAt)}</td>
                <td style="font-weight:600;color:#1e293b">${m.productName||'—'}</td>
                <td><span style="background:${clr}22;color:${clr};padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700">${lbl}</span></td>
                <td style="text-align:center;font-weight:700;color:${clr}">${sign}${Math.abs(m.quantity||0)}</td>
                <td style="text-align:center;color:#64748b">${m.previousStock??'—'}</td>
                <td style="text-align:center;font-weight:600">${m.newStock??'—'}</td>
                <td style="font-size:11px;color:#64748b;max-width:200px">${m.reason||'—'}</td>
                <td style="font-size:11px;color:#94a3b8">${m.createdByName||'—'}</td>
            </tr>`;
        }).join('');

        const win=window.open('','_blank','width=1100,height=800');
        win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Movimentações — '+empresa+'</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}.page{padding:28px 32px;max-width:1100px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #8b5cf6}.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.header-left .subtitle{font-size:12px;color:#64748b;margin-top:4px}.header-right{text-align:right}.header-right .empresa{font-size:16px;font-weight:700;color:#8b5cf6}.header-right .date{font-size:11px;color:#94a3b8;margin-top:4px}.badge-filter{display:inline-block;background:#ede9fe;color:#7c3aed;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:8px}.summary{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:20px}.sum-card{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:10px 14px}.sum-card .val{font-size:18px;font-weight:800;margin-top:2px}.sum-card .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.table-wrap{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}table{width:100%;border-collapse:collapse}thead tr{background:linear-gradient(135deg,#8b5cf6,#6366f1)}thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:10px;text-align:left}thead th.center{text-align:center}tbody td{padding:8px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tbody tr:last-child td{border-bottom:none}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between}.footer div{font-size:10px;color:#94a3b8}@media print{body{background:#fff}@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}}</style></head><body><div class="page"><div class="header"><div class="header-left"><h1>📋 Movimentações de Estoque</h1><div class="subtitle">Histórico completo de entradas, saídas e ajustes</div><div class="badge-filter">'+filterLabel+'</div></div><div class="header-right"><div class="empresa">'+empresa+'</div><div class="date">Gerado em '+dateStr+'</div></div></div><div class="summary"><div class="sum-card"><div class="lbl">Total movimentações</div><div class="val">'+data.length+'</div></div><div class="sum-card"><div class="lbl">Entradas + Compras</div><div class="val" style="color:#10b981">+'+totalEntradas+' un</div></div><div class="sum-card"><div class="lbl">Saídas</div><div class="val" style="color:#ef4444">-'+totalSaidas+' un</div></div><div class="sum-card"><div class="lbl">Saldo</div><div class="val" style="color:#6366f1">'+(totalEntradas-totalSaidas>=0?'+':'')+(totalEntradas-totalSaidas)+' un</div></div></div><div class="table-wrap"><table><thead><tr><th>Data/Hora</th><th>Produto</th><th>Tipo</th><th class="center">Qtd</th><th class="center">Ant.</th><th class="center">Atual</th><th>Motivo</th><th>Usuário</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="footer"><div>DistribuiPRO ERP · Movimentações de Estoque · '+dateStr+'</div><div>'+data.length+' registro'+(data.length!==1?'s':'')+' exibido'+(data.length!==1?'s':'')+' (máx 500)</div></div></div><div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999"><button onclick="triggerPrint()" style="background:#8b5cf6;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / Salvar PDF</button><button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button></div><script>function triggerPrint(){document.getElementById("printBtns").style.display="none";setTimeout(function(){window.print();document.getElementById("printBtns").style.display="flex";},50);}window.onbeforeprint=function(){document.getElementById("printBtns").style.display="none";};window.onafterprint=function(){document.getElementById("printBtns").style.display="flex";};<\/script></body></html>');
        win.document.close();
    };

    await load();
}

/* ================================================================
   PÁGINA: COMPRAS
================================================================ */
async function initPageCompras() {
    let purchases=[],suppliers=[],allProducts=[];
    let editingId=null;
    const tbody=document.querySelector('tbody');
    if(tbody)tbody.innerHTML=setLoadingRow(8);

    async function load() {
        try{
            [purchases,suppliers,allProducts]=await Promise.all([
                simpleList('purchases','createdAt','desc'),
                simpleList('suppliers','name','asc'),
                simpleList('products','name','asc',10000)
            ]);
        }catch(e){console.error(e);}
        populateSuppliers();updateStats();render();
    }

    function populateSuppliers() {
        const sel=document.querySelector('#modalCompra .form-grid select');
        if(sel)sel.innerHTML='<option value="">Selecione...</option>'+suppliers.map(s=>`<option value="${s.id}">${s.name}</option>`).join('');
        // 35.7 · filtro de fornecedores com os fornecedores reais
        const flt=document.querySelector('.toolbar-select');if(flt&&/fornecedor/i.test(flt.options[0]?.text||'')){const cur=flt.value;flt.innerHTML='<option value="">Todos fornecedores</option>'+[...new Set(suppliers.map(s=>s.name).filter(Boolean))].map(n=>`<option>${n}</option>`).join('');flt.value=cur;}
    }

    function updateStats() {
        const now=new Date();const ms=new Date(now.getFullYear(),now.getMonth(),1);
        const mp=purchases.filter(p=>p.status!=='cancelled'&&(p.createdAt?.toDate?.()||new Date(p.createdAt||0))>=ms); // 38.3 · compra cancelada não conta no mês
        const cards=document.querySelectorAll('.stat-value');
        if(cards[0])cards[0].textContent=mp.length;
        if(cards[1])cards[1].textContent=fmtCurrency(mp.reduce((s,p)=>s+(p.total||0),0));
        if(cards[2])cards[2].textContent=purchases.filter(p=>p.status==='pending').length;
        if(cards[3])cards[3].textContent=new Set(purchases.map(p=>p.supplierId)).size;
    }

    function render(search='',supFilter='',statusFilter='') {
        let data=[...purchases];
        if(search){const q=search.toLowerCase();data=data.filter(p=>(p.purchaseNumber||'').toString().includes(q)||(p.supplierName||'').toLowerCase().includes(q));}
        if(supFilter)data=data.filter(p=>p.supplierName===supFilter||p.supplierId===supFilter);
        if(statusFilter){const st={recebida:'received',pendente:'pending',cancelada:'cancelled'}[statusFilter.toLowerCase()]||statusFilter.toLowerCase();data=data.filter(p=>(p.status||'pending')===st);} // 38.3 · o filtro comparava "Recebida" com "received" e nunca achava nada
        if(!tbody)return;
        if(!data.length){tbody.innerHTML=setEmptyRow(8);return;}
        tbody.innerHTML=data.map(p=>`<tr>
            <td><strong>#${p.purchaseNumber||'—'}</strong></td>
            <td>${fmtDate(p.purchaseDate||p.createdAt)}</td>
            <td>${p.supplierName||'—'}</td>
            <td>${(p.items||[]).length} itens</td>
            <td style="font-weight:600">${fmtCurrency(p.total||0)}</td>
            <td>${p.paymentMethod||'—'}</td>
            <td>${badgeSt(p.status||'pending')}</td>
            <td style="display:flex;gap:4px">
                <button class="btn-icon" onclick="viewPurchase('${p.id}')"><i class="fas fa-eye"></i></button>
                ${p.status==='pending'?`<button class="btn-icon btn-success" title="Receber" onclick="receivePurchase('${p.id}')"><i class="fas fa-check"></i></button>`:''}
                ${window.DPComprasPro&&p.status!=='cancelled'?`<button class="btn-icon" title="Cancelar compra" onclick="cancelPurchase('${p.id}')"><i class="fas fa-ban"></i></button>`:''}
                <button class="btn-icon btn-danger" onclick="delPurchase('${p.id}','${p.purchaseNumber||''}')"><i class="fas fa-trash"></i></button>
            </td>
        </tr>`).join('');
    }

    // Margem padrão para cálculo de preço de venda nas compras
    let _purchaseMargin = 50;
    db.collection('settings').doc('general').get().then(doc=>{
        if(doc.exists && doc.data().margemPadrao !== undefined && doc.data().margemPadrao !== '') _purchaseMargin = parseFloat(doc.data().margemPadrao)||50;
    }).catch(()=>{});

    window.addPurchaseItem = () => {
        const tbody2 = document.getElementById('purchaseItems'); if(!tbody2) return;
        const row = document.createElement('tr');

        const productOptions = allProducts.map(p =>
            `<option value="${p.id}" data-cost="${p.costPrice||0}" data-sale="${p.salePrice||0}">${p.name}</option>`
        ).join('');

        // Estrutura: Produto | Embalagem (texto livre) | Un/Emb | Qtd | Custo | Venda | Subtotal | Del
        row.innerHTML = `
            <td style="min-width:160px">
                <select class="purch-product" style="width:100%;font-size:12px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary)">
                    <option value="">Selecione o produto...</option>
                    ${productOptions}
                </select>
            </td>
            <td style="min-width:100px">
                <select class="purch-pkg-type" style="width:100%;font-size:12px;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary)">
                    <option value="un">Unidade</option>
                    <option value="cx">Caixa</option>
                    <option value="fd">Fardo</option>
                    <option value="pk">Pack</option>
                    <option value="kt">Kit</option>
                </select>
            </td>
            <td style="min-width:70px" title="Quantas unidades vêm nesta embalagem">
                <input type="number" class="purch-factor" value="1" min="1" step="1"
                    style="width:68px;text-align:center;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:12px"
                    placeholder="Un/emb">
            </td>
            <td style="min-width:65px">
                <input type="number" class="purch-qty" value="1" min="1"
                    style="width:65px;text-align:center;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:12px"
                    placeholder="Qtd">
            </td>
            <td style="min-width:110px">
                <input type="number" class="purch-cost" step="0.01" placeholder="Custo"
                    style="width:108px;text-align:right;padding:6px 8px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:12px">
            </td>
            <td style="min-width:110px">
                <div style="position:relative">
                    <input type="number" class="purch-sale" step="0.01" placeholder="Auto"
                        style="width:108px;text-align:right;padding:6px 8px 6px 8px;padding-right:34px;background:var(--bg-input);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-size:12px">
                    <span class="purch-margin" style="position:absolute;right:4px;top:50%;transform:translateY(-50%);font-size:9px;font-weight:700;color:var(--success);pointer-events:none"></span>
                </div>
            </td>
            <td class="item-sub" style="font-weight:700;color:var(--text-heading);font-size:13px;text-align:right;white-space:nowrap;min-width:90px">R$ 0,00</td>
            <td><button class="btn-icon" style="color:#ef4444" onclick="this.closest('tr').remove();calcPurchTotal()"><i class="fas fa-trash"></i></button></td>`;

        tbody2.appendChild(row);

        // Produto selecionado → preenche custo e venda com valores do cadastro
        row.querySelector('.purch-product').addEventListener('change', function() {
            const opt  = this.options[this.selectedIndex];
            const cost = parseFloat(opt.dataset?.cost || 0);
            const sale = parseFloat(opt.dataset?.sale || 0);
            const costInp = row.querySelector('.purch-cost');
            const saleInp = row.querySelector('.purch-sale');
            // Só preenche custo UNITÁRIO — será recalculado quando o fator mudar
            if (costInp && !costInp.dataset.manual) { costInp.value = cost > 0 ? cost.toFixed(2) : ''; }
            if (saleInp && !saleInp.dataset.manual)  { saleInp.value = sale > 0 ? sale.toFixed(2) : ''; }
            onPurchFactorChange(row);
            calcPurchTotal();
        });

        // Fator alterado → recalcula custo e venda da embalagem
        row.querySelector('.purch-factor').addEventListener('input', () => onPurchFactorChange(row));

        // Custo alterado → recalcula venda pela margem padrão
        row.querySelector('.purch-cost').addEventListener('input', function() {
            this.dataset.manual = 'true';
            const saleInp = row.querySelector('.purch-sale');
            if (saleInp && !saleInp.dataset.manual) {
                const cost = parseFloat(this.value) || 0;
                if (cost > 0) saleInp.value = (cost * (1 + _purchaseMargin / 100)).toFixed(2);
            }
            calcPurchItemSale(row);
            calcPurchTotal();
        });

        // Venda editada manualmente
        row.querySelector('.purch-sale').addEventListener('input', function() {
            this.dataset.manual = 'true';
            calcPurchItemSale(row);
            calcPurchTotal();
        });

        row.querySelector('.purch-qty').addEventListener('input', () => calcPurchTotal());
    };

    // Quando fator muda, recalcula custo e venda da embalagem
    function onPurchFactorChange(row) {
        const factor   = parseFloat(row.querySelector('.purch-factor')?.value) || 1;
        const prodSel  = row.querySelector('.purch-product');
        const opt      = prodSel?.options[prodSel?.selectedIndex];
        const unitCost = parseFloat(opt?.dataset?.cost || 0);
        const unitSale = parseFloat(opt?.dataset?.sale || 0);
        const costInp  = row.querySelector('.purch-cost');
        const saleInp  = row.querySelector('.purch-sale');

        // Calcula custo da embalagem = custo/un × fator (se não editado manualmente)
        if (costInp && !costInp.dataset.manual && unitCost > 0 && factor > 1) {
            costInp.value = (unitCost * factor).toFixed(2);
        }
        // Recalcula venda pela margem (se não editada manualmente)
        if (saleInp && !saleInp.dataset.manual) {
            const cost = parseFloat(costInp?.value) || 0;
            if (cost > 0) saleInp.value = (cost * (1 + _purchaseMargin / 100)).toFixed(2);
            else if (unitSale > 0 && factor > 1) saleInp.value = (unitSale * factor).toFixed(2);
        }
        calcPurchItemSale(row);
        calcPurchTotal();
    }
    function calcPurchItemSale(row) {
        const costInp  = row.querySelector('.purch-cost');
        const saleInp  = row.querySelector('.purch-sale');
        const marginEl = row.querySelector('.purch-margin');
        const cost = parseFloat(costInp?.value) || 0;
        const sale = parseFloat(saleInp?.value) || 0;
        if (marginEl && cost > 0 && sale > 0) {
            const margin = ((sale - cost) / cost * 100).toFixed(0);
            marginEl.textContent = margin + '%';
            marginEl.style.color = margin >= _purchaseMargin ? 'var(--success)' : 'var(--warning)';
        } else if (marginEl) { marginEl.textContent = ''; }
    }

    window.calcPurchTotal = () => {
        let total = 0;
        document.querySelectorAll('#purchaseItems tr').forEach(row => {
            const qty  = parseFloat(row.querySelector('.purch-qty')?.value || 0);
            const cost = parseFloat(row.querySelector('.purch-cost')?.value || 0);
            const sub  = qty * cost;
            total += sub;
            const subEl = row.querySelector('.item-sub');
            if (subEl) subEl.textContent = 'R$ ' + sub.toFixed(2).replace('.', ',');
        });
        const formatted = fmtCurrency(total);
        const elTotal = document.getElementById('purchaseTotal');
        if (elTotal) elTotal.textContent = formatted;
        const elSub = document.getElementById('purchaseSubtotal');
        if (elSub) elSub.textContent = formatted;
    };

    window.savePurchase = async()=>{
        const modal=document.getElementById('modalCompra');if(!modal)return;
        const sels=modal.querySelectorAll('.form-grid select');
        const dateEl=modal.querySelector('.form-grid input[type=date]');
        const nfEl=modal.querySelector('.form-grid input[type=text]');
        const payEl=sels[1];
        const supplierId=sels[0]?.value;
        const supplierName=sels[0]?.options[sels[0].selectedIndex]?.text||'';
        if(!supplierId){Toast.warning('Selecione o fornecedor.');return;}
        if(!dateEl?.value){Toast.warning('Informe a data.');return;}
        const items=[];
        document.querySelectorAll('#purchaseItems tr').forEach(row=>{
            const prodSel   = row.querySelector('.purch-product');
            const pkgType   = row.querySelector('.purch-pkg-type');
            const factor    = parseFloat(row.querySelector('.purch-factor')?.value || 1);
            const qty       = parseFloat(row.querySelector('.purch-qty')?.value || 0);
            const cost      = parseFloat(row.querySelector('.purch-cost')?.value || 0);
            const salePrice = parseFloat(row.querySelector('.purch-sale')?.value || 0);
            const pkgLabel  = pkgType?.options[pkgType?.selectedIndex]?.text || 'Unidade';
            const unitCost  = factor > 1 ? cost / factor : cost; // custo por unidade base
            if(prodSel?.value && qty > 0) items.push({
                productId:   prodSel.value,
                productName: prodSel.options[prodSel.selectedIndex]?.text || '',
                packaging:   factor > 1 ? `${pkgLabel} (${factor} un)` : 'Unidade',
                factor,
                quantity:    qty,
                unitsTotal:  qty * factor,
                costPrice:   unitCost,          // custo por unidade base
                costPackage: cost,              // custo da embalagem
                salePrice:   factor > 1 ? salePrice / factor : salePrice, // preço/un base
                salePricePackage: salePrice,
                subtotal:    qty * cost
            });
        });
        if(!items.length){Toast.warning('Adicione pelo menos um item.');return;}
        const total=items.reduce((s,i)=>s+i.subtotal,0);
        try{
            const settDoc=await db.collection('settings').doc('general').get();
            const seq=(settDoc.data()?.purchaseSequence||0)+1;
            await db.collection('settings').doc('general').set({purchaseSequence:seq},{merge:true});
            await db.collection('purchases').add({supplierId,supplierName,purchaseNumber:seq,
                purchaseDate:firebase.firestore.Timestamp.fromDate(new Date(dateEl.value+'T12:00:00')),
                nfNumber:nfEl?.value||'',paymentMethod:payEl?.value||'À Vista',items,total,status:'pending',
                ...(window.DPComprasPro?DPComprasPro.camposCompra(total,dateEl.value):{}), // 38.3 · prazo e parcelas (compras-pro-v1.js)
                deleted:false,createdAt:firebase.firestore.FieldValue.serverTimestamp(),createdBy:auth.currentUser?.uid||''});
            Toast.success('Compra registrada!');closeModal('modalCompra');await load();
        }catch (e) {console.error(e);Toast.error('Erro ao registrar compra: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));}
    };

    // 37.9 · Receber compra: janela que mostra o custo médio de cada produto (custo-medio-v1.js); sem ela, a confirmação simples de antes
    // 38.5 · Depois do lote/validade, os números (IMEI/série) de cada aparelho (seriais-v1.js)
    const dpConfirmReceive=(id,go)=>{const p=purchases.find(x=>x.id===id);if(!p)return;if(window.DPCustoMedio)DPCustoMedio.confirmarRecebimento(p,allProducts).then(o=>o&&window.DPValidade?DPValidade.pedirLotes(p,allProducts,o):o).then(o=>o&&window.DPSerial?DPSerial.pedirSeriais(p,allProducts,o):o).then(o=>{if(o)go(o);});else Confirm.show('Receber Compra','Confirmar recebimento e atualizar estoque?',()=>go({atualizarVenda:true}));};
    window.receivePurchase = id=>dpConfirmReceive(id,async(dpRecv)=>{
        const p=purchases.find(x=>x.id===id);if(!p)return;
        try{
            for(const item of p.items||[]){
                // Usa unitsTotal (qtd × fator da embalagem) para dar baixa correta
                const units = item.unitsTotal || item.quantity;
                const antes = window.DPCustoMedio ? await DPCustoMedio.produto(item.productId) : null; // 37.9 · estoque e custo de antes da entrada
                await StockService.entry(item.productId, units, `Compra #${p.purchaseNumber} — ${item.packaging||'Unidade'}`, 'purchase', id);
                // 37.9 · Custo médio (não mais o da última compra); preço de venda só se o usuário marcou
                const updates = {};
                if (item.costPrice > 0) updates.costPrice = antes ? DPCustoMedio.calc(antes.currentStock, antes.costPrice, units, item.costPrice) : item.costPrice;
                if (item.salePrice > 0 && dpRecv.atualizarVenda) updates.salePrice = item.salePrice;
                if (Object.keys(updates).length > 0) {
                    await FirestoreService.update('products', item.productId, updates);
                }
            }
            const dpPos = window.DPComprasPro ? await DPComprasPro.aoReceber(p, dpRecv) : {}; // 38.3 · parcelas em Contas a Pagar + lote/validade
            await db.collection('purchases').doc(id).update({status:'received', receivedAt: firebase.firestore.FieldValue.serverTimestamp(), ...dpPos});
            Toast.success(dpRecv.atualizarVenda?'Recebida! Estoque, custo médio e preço de venda atualizados.':'Recebida! Estoque e custo médio atualizados.');await load();
        }catch (e) {console.error(e);Toast.error('Erro ao receber compra: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));}
    });

    window.viewPurchase = id=>{
        const p=purchases.find(x=>x.id===id);if(!p)return;
        const overlay=document.createElement('div');overlay.className='modal-overlay active';
        overlay.innerHTML=`<div class="modal" style="max-width:500px">
            <div class="modal-header"><h3>Compra #${p.purchaseNumber}</h3><button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button></div>
            <div class="modal-body">
                <p><strong>Fornecedor:</strong> ${p.supplierName}</p><p><strong>Data:</strong> ${fmtDate(p.purchaseDate||p.createdAt)}</p>
                <p><strong>NF:</strong> ${p.nfNumber||'—'}</p><p><strong>Pagamento:</strong> ${p.paymentMethod}</p><p><strong>Status:</strong> ${badgeSt(p.status)}</p>
                <hr style="margin:12px 0;border-color:var(--border-color)">
                <table class="data-table"><thead><tr><th>Produto</th><th>Qtd</th><th>Custo</th><th>Subtotal</th></tr></thead>
                <tbody>${(p.items||[]).map(i=>`<tr><td>${i.productName}</td><td>${i.quantity}</td><td>${fmtCurrency(i.costPrice)}</td><td>${fmtCurrency(i.subtotal)}</td></tr>`).join('')}</tbody></table>
                <p style="font-weight:700;font-size:16px;margin-top:12px;text-align:right">Total: ${fmtCurrency(p.total)}</p>
                ${window.DPComprasPro?DPComprasPro.detalheHtml(p):''}
            </div>
            <div class="modal-footer"><button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Fechar</button></div>
        </div>`;
        document.body.appendChild(overlay);
    };

    window.delPurchase = (id,num)=>Confirm.show('Excluir','Excluir compra #'+num+'?',async()=>{
        try{await db.collection('purchases').doc(id).update({deleted:true});const dp=purchases.find(x=>x.id===id);if(dp&&window.DPComprasPro)await DPComprasPro.aoExcluir(dp);Toast.success('Excluída!');await load();}catch (e) {Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));}
    });
    // 38.3 · Cancelar compra: cancela as contas a pagar em aberto e pode tirar os itens do estoque (compras-pro-v1.js)
    window.cancelPurchase = id=>{if(window.DPComprasPro)DPComprasPro.cancelar(purchases.find(x=>x.id===id),load);};

    // Fix modal
    const modal=document.getElementById('modalCompra');
    if(modal){
        const btn=modal.querySelector('.modal-footer .btn-primary');if(btn)btn.setAttribute('onclick','savePurchase()');
        // purchaseTotal e purchaseSubtotal agora existem no HTML — não cria dinamicamente
    }
    // Filtros
    const searchEl=document.querySelector('.toolbar-search input');
    if(searchEl)searchEl.addEventListener('input',Utils.debounce(e=>{const sels=[...document.querySelectorAll('.toolbar-select')];render(e.target.value,sels[0]?.value,sels[1]?.value);},300));
    document.querySelectorAll('.toolbar-select').forEach(sel=>sel.addEventListener('change',()=>{const sels=[...document.querySelectorAll('.toolbar-select')];render(searchEl?.value||'',sels[0]?.value,sels[1]?.value);}));
    // Nova compra: limpar
    document.querySelector('[onclick*="modalCompra"]')?.closest?.('button')?.addEventListener?.('click',()=>{
        editingId=null;const tb=document.getElementById('purchaseItems');if(tb)tb.innerHTML='';
        const t=document.getElementById('purchaseTotal');if(t)t.textContent='R$ 0,00';
    });

    await load();
}

/* ================================================================
   PÁGINA: MOTOBOYS
================================================================ */
async function initPageMotoboys() {
    // A página motoboys.html gerencia seu próprio JS (loadPage, renderMotoboys, etc.)
    // Este stub existe apenas para evitar "Página não encontrada no router"
    if (typeof window.loadPage === 'function') {
        // loadPage() já é chamado pelo auth.onAuthStateChanged no HTML
        // não chama novamente para evitar dupla carga
    }
}


/* ================================================================
   PÁGINA: USUÁRIOS
================================================================ */
async function initPageUsuarios() {
    let users = []; let editingId = null;
    const ROLE_LABELS = {admin:(window.dpIcon ? dpIcon('crown') + ' ' : '')+'Administrador',manager:(window.dpIcon ? dpIcon('building-2') + ' ' : '')+'Gerente',seller:(window.dpIcon ? dpIcon('shopping-cart') + ' ' : '')+'Vendedor',cashier:(window.dpIcon ? dpIcon('banknote') + ' ' : '')+'Caixa',stock:(window.dpIcon ? dpIcon('package') + ' ' : '')+'Estoquista',financial:(window.dpIcon ? dpIcon('credit-card') + ' ' : '')+'Financeiro',delivery:(window.dpIcon ? dpIcon('bike') + ' ' : '')+'Entregador',technician:(window.dpIcon ? dpIcon('wrench') + ' ' : '')+'Técnico'};
    const ROLE_COLORS = {admin:'#ef4444',manager:'#a855f7',seller:'#10b981',cashier:'#3b82f6',stock:'#f59e0b',financial:'#06b6d4',delivery:'#f97316',technician:'#14b8a6'};

    async function load() {
        try { users = await simpleList('users','name','asc'); } catch(e) { console.error(e); }
        updateStats(); renderUsers();
    }

    function updateStats() {
        const cards = document.querySelectorAll('.stat-value');
        if(cards[0]) cards[0].textContent = users.length;
        if(cards[1]) cards[1].textContent = users.filter(u=>u.status==='active').length;
        if(cards[2]) cards[2].textContent = users.filter(u=>u.status!=='active').length;
        if(cards[3]) cards[3].textContent = users.filter(u=>u.role==='admin').length;
    }

    function renderUsers() {
        const q     = (document.getElementById('userSearch')?.value||'').toLowerCase();
        const role  = document.getElementById('userRoleFilter')?.value||'';
        let data    = [...users].filter(u => !u.deleted);
        if (q)    data = data.filter(u => (u.name||'').toLowerCase().includes(q)||(u.email||'').toLowerCase().includes(q));
        if (role) data = data.filter(u => u.role === role);

        const grid = document.getElementById('usersGrid');
        if (!grid) return;
        if (!data.length) {
            grid.innerHTML = '<div style="grid-column:1/-1;text-align:center;padding:40px;color:var(--text-muted)">Nenhum usuário encontrado</div>';
            return;
        }

        grid.innerHTML = data.map(u => {
            const roleLabel = ROLE_LABELS[u.role]||u.role||'—';
            const roleColor = ROLE_COLORS[u.role]||'#64748b';
            const isMe      = u.id === currentUser?.uid;
            const ini       = (u.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
            const lastLogin = u.lastLogin ? (u.lastLogin?.toDate?.()?.toLocaleString('pt-BR')||'—') : 'Nunca';

            // Avatar: foto base64 > emoji > iniciais
            let avatarHtml;
            if (u.photoUrl) {
                avatarHtml = `<img src="${u.photoUrl}" style="width:100%;height:100%;object-fit:cover">`;
            } else if (u.photoEmoji) {
                avatarHtml = `<span style="font-size:28px">${u.photoEmoji}</span>`;
            } else {
                avatarHtml = `<span style="font-size:18px;font-weight:700">${ini}</span>`;
            }

            return `<div class="card" style="padding:0;overflow:hidden;transition:box-shadow .2s" onmouseover="this.style.boxShadow='0 0 0 2px var(--accent)'" onmouseout="this.style.boxShadow=''">
                <!-- Header do card -->
                <div style="background:linear-gradient(135deg,${roleColor}22,${roleColor}11);padding:20px;display:flex;align-items:center;gap:14px;border-bottom:1px solid var(--border-color)">
                    <div style="width:56px;height:56px;border-radius:14px;background:linear-gradient(135deg,${roleColor},${roleColor}aa);
                        display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;overflow:hidden;border:3px solid ${roleColor}44">
                        ${avatarHtml}
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-weight:700;font-size:15px;color:var(--text-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">
                            ${u.name||'—'} ${isMe?'<span style="font-size:10px;background:var(--accent);color:#fff;padding:1px 6px;border-radius:8px;font-weight:600;vertical-align:middle">Você</span>':''}
                        </div>
                        <div style="font-size:12px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${u.email||'—'}</div>
                        <span style="display:inline-block;margin-top:4px;background:${roleColor}22;color:${roleColor};padding:2px 10px;border-radius:20px;font-size:11px;font-weight:700">${roleLabel}</span>
                    </div>
                    <div style="text-align:right;flex-shrink:0">
                        <span style="display:inline-block;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;
                            background:${u.status==='active'?'rgba(16,185,129,.15)':'rgba(100,116,139,.15)'};
                            color:${u.status==='active'?'#10b981':'#64748b'}">
                            ${u.status==='active'?'● Ativo':'○ Inativo'}
                        </span>
                    </div>
                </div>
                <!-- Corpo do card -->
                <div style="padding:14px 20px;display:flex;flex-direction:column;gap:8px">
                    <div style="display:flex;justify-content:space-between;font-size:12px">
                        <span style="color:var(--text-muted);white-space:nowrap"><i class="fas fa-phone" style="margin-right:4px;width:12px"></i>${u.phone ? Utils.maskPhone(String(u.phone)) : '—'}</span>
                        <span style="color:var(--text-muted)"><i class="fas fa-clock" style="margin-right:4px;width:12px"></i>${lastLogin}</span>
                    </div>
                    ${u.commissionType && u.commissionType !== 'none' && Number(u.commissionValue||0)>0 ? `<div style="font-size:11px;color:#10b981"><i class="fas fa-percent" style="margin-right:4px"></i>Comissão: ${u.commissionType==='percent' ? Number(u.commissionValue).toFixed(2).replace('.',',')+'%' : fmtCurrency(u.commissionValue)+' por venda'}</div>` : ''}
                    ${u.commissionServiceType && !['none','inherit'].includes(u.commissionServiceType) && Number(u.commissionServiceValue||0)>0 ? `<div style="font-size:11px;color:#14b8a6"><i class="fas fa-screwdriver-wrench" style="margin-right:4px"></i>Serviços: ${u.commissionServiceType==='percent' ? Number(u.commissionServiceValue).toFixed(2).replace('.',',')+'%' : fmtCurrency(u.commissionServiceValue)+' por serviço'}</div>` : ''}
                    ${u.permissions && Object.values(u.permissions).some(v=>v) ? `
                    <div style="display:flex;flex-wrap:wrap;gap:4px">
                        ${u.permissions.cancelSales   ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Cancelar vendas</span>':''}
                        ${u.permissions.changePrices  ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Alterar preços</span>':''}
                        ${u.permissions.closeCash     ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Fechar caixa</span>':''}
                        ${u.permissions.viewReports   ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Relatórios</span>':''}
                        ${u.permissions.viewFinancial ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Financeiro</span>':''}
                        ${u.permissions.adjustStock   ?'<span style="font-size:10px;background:rgba(99,102,241,.1);color:var(--accent);padding:1px 7px;border-radius:10px">Estoque</span>':''}
                    </div>` : ''}
                </div>
                <!-- Ações -->
                <div style="padding:10px 20px;border-top:1px solid var(--border-color);display:flex;flex-wrap:wrap;gap:8px;justify-content:flex-end">
                    <button class="btn btn-outline btn-sm" style="font-size:11px" onclick="editUser('${u.id}')">
                        <i class="fas fa-pen"></i> Editar
                    </button>
                    <button class="btn btn-outline btn-sm" style="font-size:11px" onclick="resetPassword('${u.id}','${dpJsAttr(u.email)}')">
                        <i class="fas fa-key"></i> Senha
                    </button>
                    ${u.status==='active'
                        ? `<button class="btn btn-outline btn-sm" style="font-size:11px;color:#f59e0b;border-color:#f59e0b" onclick="toggleUserStatus('${u.id}','active')"><i class="fas fa-ban"></i> Desativar</button>`
                        : `<button class="btn btn-outline btn-sm" style="font-size:11px;color:#10b981;border-color:#10b981" onclick="toggleUserStatus('${u.id}','inactive')"><i class="fas fa-check"></i> Ativar</button>`
                    }
                    ${!isMe ? `<button class="btn btn-outline btn-sm btn-danger" style="font-size:11px" onclick="delUser('${u.id}','${dpJsAttr(u.name)}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>`;
        }).join('');
    }

    window._renderUsers = renderUsers;
    document.getElementById('uPhone')?.addEventListener('input', e => { e.target.value = Utils.maskPhone(e.target.value); });

    // 40.0 · ACESSO ÀS TELAS (Caixa, Clientes, Orçamentos, OS) uma a uma + "ver só os dele". A prévia "Páginas com acesso"
    // passa a ser a conta de verdade do app.js (applySidebarPermissions no modo 'calcular'), com as telas que esta
    // empresa tem no menu. Antes a prévia era uma lista fixa que não mostrava Orçamentos e mentia sobre o Caixa.
    // 40.29 · Todas as versões (antes só o Mensal) e TODAS as telas do menu, separadas como no menu (antes só as 4 acima).
    // Usuários, Configurações, Auditoria e Minha assinatura ficam de fora: são só do administrador.
    const DP_TELA_FORA = ['usuarios', 'configuracoes', 'auditoria', 'minha-assinatura'];
    const DP_TELA_NOME = { index: 'Dashboard', pdv: 'PDV', mesas: 'Mesas', cardapio: 'Cardápio digital', pedidos: 'Pedidos', entregas: 'Entregas', caixa: 'Caixa', produtos: 'Produtos', categorias: 'Categorias', clientes: 'Clientes', fornecedores: 'Fornecedores', estoque: 'Estoque', movimentacoes: 'Movimentações', compras: 'Compras', 'contas-pagar': 'Contas a pagar', 'contas-receber': 'Contas a receber', 'fluxo-caixa': 'Fluxo de caixa', relatorios: 'Relatórios', motoboys: 'Motoboys', 'ordens-servico': 'Ordens de serviço', usados: 'Usados', garantias: 'Garantias', orcamentos: 'Orçamentos', comissoes: 'Comissões', consignado: 'Consignado', metas: 'Metas', 'contas-bancarias': 'Contas bancárias', depositos: 'Depósitos', vasilhames: 'Vasilhames', agenda: 'Agenda', pacotes: 'Pacotes', lembretes: 'Lembretes', 'nota-fiscal': 'Notas fiscais', garcom: 'App do garçom', cozinha: 'Cozinha', 'ficha-tecnica': 'Ficha técnica', desperdicio: 'Desperdício', avaliacoes: 'Avaliações', inteligencia: 'Inteligência', modulos: 'Loja de módulos', fiado: 'Fiado', 'loja-virtual': 'Loja virtual' };
    const dpTelasForm = {
        selects: () => [...document.querySelectorAll('#dpTelasBox select[data-tela]')],
        ler() { const t = {}; this.selects().forEach(s => { if (s.value) t[s.dataset.tela] = s.value; }); return t; },
        preencher(perms) {
            const p = perms || {}, t = (p.telas && typeof p.telas === 'object') ? p.telas : {};
            const legado = { orcamentos: p.blockQuotes ? 'bloquear' : '', 'ordens-servico': p.blockServiceOrders ? 'bloquear' : '' };
            this.selects().forEach(s => { s.value = t[s.dataset.tela] || legado[s.dataset.tela] || ''; s.dataset.mexeu = ''; });
            const so = document.getElementById('pSoProprios'); if (so) so.checked = !!p.soProprios;
        },
        // permissões como ficarão salvas (para a prévia calcular igual ao app.js)
        permsDoForm() {
            const v = id => !!document.getElementById(id)?.checked, telas = this.ler();
            return { viewReports: v('pViewReports'), viewFinancial: v('pViewFinancial'), adjustStock: v('pAdjustStock'), closeCash: v('pCloseCash'), blockSell: v('pBlockSell'),
                blockQuotes: telas.orcamentos === 'bloquear', blockServiceOrders: telas['ordens-servico'] === 'bloquear', blockConsignment: v('pBlockConsignment'), telas };
        },
        previa(role) {
            const preview = document.getElementById('rolePreview'), pages = document.getElementById('rolePreviewPages');
            if (!preview || !pages) return;
            if (!role) { preview.style.display = 'none'; return; }
            preview.style.display = 'block';
            const chip = (txt, cor) => `<span style="background:${cor || 'rgba(99,102,241,.12)'};color:var(--accent);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${txt}</span>`;
            if (role === 'admin') { pages.innerHTML = chip('Tudo — acesso total'); this.rotulos(null); return; }
            const lista = (typeof applySidebarPermissions === 'function' ? applySidebarPermissions({ role, permissions: this.permsDoForm() }, 'calcular') : null) || [];
            const noMenu = h => !!document.querySelector('.sidebar-menu a.menu-item[href="' + h + '"]') || ['index.html', 'caixa.html', 'clientes.html', 'orcamentos.html', 'ordens-servico.html'].includes(h);
            const nomes = lista.filter(noMenu).map(h => DP_TELA_NOME[h.replace('.html', '')] || h.replace('.html', ''));
            pages.innerHTML = nomes.length ? nomes.map(n => chip(n)).join('') : chip('Nenhuma tela', 'rgba(239,68,68,.12)');
            // o que o PERFIL sozinho dá, para o "Conforme o perfil (sim/não)"
            const doPerfil = applySidebarPermissions({ role, permissions: {} }, 'calcular') || [];
            this.rotulos(doPerfil);
        },
        rotulos(doPerfil) {
            this.selects().forEach(s => { const o = s.options[0]; if (!o) return; o.textContent = doPerfil === null ? 'Conforme o perfil (tudo)' : 'Conforme o perfil (' + (doPerfil.includes(s.dataset.tela + '.html') ? 'sim' : 'não') + ')'; });
        },
        // 40.29 · Um seletor por tela do menu desta empresa (o administrador vê o menu inteiro), na ordem e nos grupos do menu
        montar() {
            const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            const menu = document.querySelector('.sidebar-menu'), grupos = [], vistos = new Set();
            let g = null;
            const novoGrupo = t => { g = { titulo: t, itens: [] }; grupos.push(g); };
            (menu ? [...menu.querySelectorAll('.menu-section, a.menu-item[href]')] : []).forEach(el => {
                if (el.classList.contains('menu-section')) { novoGrupo(el.textContent.trim()); return; }
                const tela = (el.getAttribute('href') || '').replace(/^\.\//, '').replace(/[?#].*$/, '').replace(/\.html$/, '');
                if (!tela || tela.includes('/') || DP_TELA_FORA.includes(tela) || vistos.has(tela)) return;
                if (el.classList.contains('dp-off') || getComputedStyle(el).display === 'none') return; // tela que esta empresa não usa
                vistos.add(tela); if (!g) novoGrupo('');
                g.itens.push({ tela, nome: (el.querySelector('.menu-text') || el).textContent.trim() || DP_TELA_NOME[tela] || tela, ico: el.querySelector('i')?.className || 'fas fa-window-maximize' });
            });
            // as 4 telas do quadro antigo aparecem sempre (mesmo fora do menu desta tela)
            const faltam = ['caixa', 'clientes', 'orcamentos', 'ordens-servico'].filter(t => !vistos.has(t));
            if (faltam.length) { novoGrupo('Outras'); faltam.forEach(t => g.itens.push({ tela: t, nome: DP_TELA_NOME[t] || t, ico: 'fas fa-window-maximize' })); }
            const sel = t => `<select class="form-control" data-tela="${esc(t)}" style="height:32px;padding:3px 6px;font-size:12px;width:168px;flex:none"><option value="">Conforme o perfil</option><option value="liberar">Liberar</option><option value="bloquear">Bloquear</option></select>`;
            return grupos.filter(x => x.itens.length).map(x => (x.titulo ? `<div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px">${esc(x.titulo)}</div>` : '')
                + `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:6px">${x.itens.map(i => `<label class="dp-tela" style="display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:12px;color:var(--text-secondary);padding:6px 8px 6px 10px;border-radius:8px;background:var(--bg-secondary)"><span title="${esc(i.nome)}" style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><i class="${esc(i.ico)}" style="width:16px;color:var(--accent)"></i> <b>${esc(i.nome)}</b></span>${sel(i.tela)}</label>`).join('')}</div>`).join('');
        },
        iniciar() {
            const box = document.getElementById('dpTelasBox'); if (!box || box.dataset.ok) return; box.dataset.ok = '1';
            const lista = document.getElementById('dpTelasLista'); if (lista) lista.innerHTML = this.montar();
            // os bloqueios antigos de Orçamentos e OS viraram "Bloquear" no quadro novo (continuam gravados para quem lê o campo antigo)
            ['pBlockQuotes', 'pBlockServiceOrders'].forEach(id => { const l = document.getElementById(id)?.closest('label'); if (l) l.style.display = 'none'; });
            box.addEventListener('change', e => { if (e.target.matches('select[data-tela]')) e.target.dataset.mexeu = '1'; window.onRoleChange(document.getElementById('uRole')?.value || ''); });
            document.querySelectorAll('#modalUsuario input[type=checkbox][id^="p"]').forEach(c => c.addEventListener('change', () => window.onRoleChange(document.getElementById('uRole')?.value || '')));
        }
    };
    window.dpTelasForm = dpTelasForm;
    // ── ROLE PREVIEW ────────────────────────────────────────
    window.onRoleChange = function(role) {
        dpTelasForm.iniciar();
        dpTelasForm.previa(role);
        return;
        const ROLE_PAGES = {
            admin:    ['Tudo — acesso total'],
            manager:  ['Dashboard','PDV','Pedidos','Entregas','Caixa','Ordens de Serviço','Produtos','Categorias','Clientes','Fornecedores','Estoque','Movimentações','Compras','Financeiro','Relatórios','Comissões','Motoboys'],
            seller:   ['Dashboard','PDV','Pedidos','Clientes','Ordens de Serviço','Comissões'],
            cashier:  ['Dashboard','PDV','Pedidos','Caixa','Entregas','Clientes','Ordens de Serviço'],
            stock:    ['Dashboard','Estoque','Movimentações','Compras','Produtos'],
            financial:['Dashboard','Contas a Pagar','Contas a Receber','Fluxo de Caixa','Relatórios'],
            delivery: ['Dashboard','Entregas','Pedidos'],
            technician:['Dashboard','Ordens de Serviço','Clientes','Produtos','Estoque'],
        };
        const preview = document.getElementById('rolePreview');
        const pages   = document.getElementById('rolePreviewPages');
        if (!preview || !pages) return;
        const list = ROLE_PAGES[role] || [];
        if (!list.length) { preview.style.display='none'; return; }
        preview.style.display = 'block';
        pages.innerHTML = list.map(p =>
            `<span style="background:rgba(99,102,241,.12);color:var(--accent);padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600">${p}</span>`
        ).join('');
    };

    // ── AVATAR ──────────────────────────────────────────────
    window.updateAvatarPreview = () => {
        const name    = document.getElementById('uName')?.value || '';
        const emoji   = document.getElementById('uPhotoEmoji')?.value;
        const photo   = document.getElementById('uPhotoData')?.value;
        const initial = document.getElementById('uAvatarInitial');
        const preview = document.getElementById('uAvatarPreview');
        if (!initial || !preview) return;
        if (photo) {
            initial.style.display = 'none';
            // foto já foi aplicada via CSS background
        } else if (emoji) {
            initial.textContent = emoji;
            initial.style.fontSize = '32px';
            preview.style.background = 'var(--bg-secondary)';
        } else {
            const ini = name.trim().split(' ').map(w=>w[0]).filter(Boolean).slice(0,2).join('').toUpperCase() || '?';
            initial.textContent = ini;
            initial.style.fontSize = '22px';
            preview.style.background = 'linear-gradient(135deg,var(--accent),#7c3aed)';
        }
    };

    window.selectUserEmoji = (emoji) => {
        document.getElementById('uPhotoEmoji').value = emoji;
        document.getElementById('uPhotoData').value  = '';
        const preview = document.getElementById('uAvatarPreview');
        const initial = document.getElementById('uAvatarInitial');
        if (preview) preview.style.background = 'var(--bg-secondary)';
        if (initial) { initial.textContent = emoji; initial.style.fontSize = '32px'; }
    };

    window.onUserPhotoSelect = async (input) => {
        const file = input.files?.[0];
        if (!file) return;
        // 39.3 · A foto do usuário ia crua para users/{uid} (lida em TODA tela ao abrir). Uma foto de 4 MB estourava o
        // limite de 1 MB do Firebase e "o usuário não salvava". Agora: até 512 px e ~80 KB.
        let data = '';
        try { data = await DPImagem.reduzir(file, { maxLado: 512, maxBytes: DPImagem.LIMITES.avatar }); }
        catch (e) { Toast.error('Foto não carregada: ' + dpErroHumano(e)); input.value = ''; return; }
        {
            document.getElementById('uPhotoData').value  = data;
            document.getElementById('uPhotoEmoji').value = '';
            const preview = document.getElementById('uAvatarPreview');
            const initial = document.getElementById('uAvatarInitial');
            if (preview) preview.style.backgroundImage = `url(${data})`;
            if (initial) initial.style.display = 'none';
            // Aplica imagem no avatar via img tag
            const overlay = preview?.querySelector('.avatar-overlay');
            if (overlay) {
                preview.innerHTML = `<img src="${data}" style="width:100%;height:100%;object-fit:cover;border-radius:13px">
                    <div class="avatar-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;border-radius:13px">
                        <i class="fas fa-camera" style="color:#fff;font-size:20px"></i>
                    </div>`;
                preview.addEventListener('click', () => document.getElementById('uPhotoInput').click());
            }
        }
    };

    window.toggleUserCommission = () => {
        const type = document.getElementById('uCommissionType')?.value || 'none';
        const input = document.getElementById('uCommissionValue');
        const label = document.getElementById('uCommissionLabel');
        if (input) { input.disabled = type === 'none'; if (type === 'none') input.value = ''; input.placeholder = type === 'percent' ? 'Ex: 3,5' : 'Ex: 10,00'; }
        if (label) label.textContent = type === 'percent' ? 'Percentual (%)' : type === 'fixed' ? 'Valor por venda (R$)' : 'Valor';
        // 36.6 · Comissão de serviços (OS / itens de serviço) — "inherit" = igual à de produtos
        const st = document.getElementById('uCommissionServiceType')?.value || 'inherit';
        const sInput = document.getElementById('uCommissionServiceValue');
        const sLabel = document.getElementById('uCommissionServiceLabel');
        if (sInput) { sInput.disabled = st === 'none' || st === 'inherit'; if (sInput.disabled) sInput.value = ''; sInput.placeholder = st === 'percent' ? 'Ex: 30' : 'Ex: 50,00'; }
        if (sLabel) sLabel.textContent = st === 'percent' ? 'Percentual sobre o serviço (%)' : st === 'fixed' ? 'Valor por serviço (R$)' : 'Valor (serviços)';
    };

    // ── PASSWORD TOGGLE ─────────────────────────────────────
    window.togglePwVis = (id, btn) => {
        const inp = document.getElementById(id);
        if (!inp) return;
        const show = inp.type === 'password';
        inp.type = show ? 'text' : 'password';
        btn.innerHTML = show ? '<i class="fas fa-eye-slash"></i>' : '<i class="fas fa-eye"></i>';
    };

    window.togglePasswordFields = () => {
        const checked = document.getElementById('changePwToggle')?.checked;
        const fields  = document.getElementById('passwordFields');
        if (fields) fields.style.display = checked ? 'grid' : 'none';
    };

    // ── ABRIR MODAL NOVO ────────────────────────────────────
    window.openNewUserModal = () => {
        editingId = null;
        document.getElementById('modalUsuarioTitle').innerHTML = '<i class="fas fa-user-plus" style="margin-right:8px;color:var(--accent)"></i>Novo Usuário';
        ['uName','uEmail','uPhone','uPassword','uPassword2'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        ['uPhotoData','uPhotoEmoji'].forEach(id => { const el=document.getElementById(id); if(el) el.value=''; });
        document.getElementById('uRole').selectedIndex    = 0;
        document.getElementById('uStatus').value          = 'active';
        if (document.getElementById('uCommissionType')) document.getElementById('uCommissionType').value = 'none';
        if (document.getElementById('uCommissionValue')) document.getElementById('uCommissionValue').value = '';
        if (document.getElementById('uCommissionServiceType')) document.getElementById('uCommissionServiceType').value = 'inherit';
        if (document.getElementById('uCommissionServiceValue')) document.getElementById('uCommissionServiceValue').value = '';
        toggleUserCommission();
        document.getElementById('passwordFields').style.display = 'grid';
        document.getElementById('pwLabel').textContent    = 'Senha *';
        const toggleLabel = document.getElementById('changePwToggleLabel');
        if (toggleLabel) toggleLabel.style.display = 'none';
        // Reset avatar
        const initial = document.getElementById('uAvatarInitial');
        const preview = document.getElementById('uAvatarPreview');
        if (initial) { initial.textContent = '?'; initial.style.display = ''; initial.style.fontSize = '28px'; }
        if (preview) preview.style.background = 'linear-gradient(135deg,var(--accent),#7c3aed)';
        ['pCancelSales','pChangePrices','pGrantDiscounts','pAdjustStock','pCloseCash','pViewReports','pDeleteRecords','pViewFinancial','pBlockSell','pBlockQuoteToSale','pBlockQuotes','pBlockServiceOrders','pBlockConsignment']
            .forEach(id => { const el=document.getElementById(id); if(el) el.checked=false; });
        dpTelasForm.iniciar(); dpTelasForm.preencher({});
        const rp = document.getElementById('rolePreview');
        if (rp) rp.style.display = 'none';
        openModal('modalUsuario');
    };

    // ── EDITAR USUÁRIO ──────────────────────────────────────
    window.editUser = id => {
        editingId = id;
        const u = users.find(x => x.id === id); if (!u) return;
        document.getElementById('modalUsuarioTitle').innerHTML = '<i class="fas fa-pen" style="margin-right:8px;color:var(--accent)"></i>Editar Usuário';
        document.getElementById('uName').value   = u.name||'';
        document.getElementById('uEmail').value  = u.email||'';
        document.getElementById('uPhone').value  = u.phone ? Utils.maskPhone(String(u.phone)) : '';
        document.getElementById('uRole').value   = u.role||'seller';
        document.getElementById('uStatus').value = u.status||'active';
        if (document.getElementById('uCommissionType')) document.getElementById('uCommissionType').value = u.commissionType||'none';
        if (document.getElementById('uCommissionValue')) document.getElementById('uCommissionValue').value = Number(u.commissionValue||0) || '';
        if (document.getElementById('uCommissionServiceType')) document.getElementById('uCommissionServiceType').value = u.commissionServiceType || 'inherit';
        if (document.getElementById('uCommissionServiceValue')) document.getElementById('uCommissionServiceValue').value = Number(u.commissionServiceValue||0) || '';
        toggleUserCommission();

        // Avatar
        const preview = document.getElementById('uAvatarPreview');
        const initial = document.getElementById('uAvatarInitial');
        document.getElementById('uPhotoData').value  = u.photoUrl||'';
        document.getElementById('uPhotoEmoji').value = u.photoEmoji||'';
        if (u.photoUrl && preview) {
            preview.innerHTML = `<img src="${u.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:13px">
                <div class="avatar-overlay" style="position:absolute;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;border-radius:13px">
                    <i class="fas fa-camera" style="color:#fff;font-size:20px"></i>
                </div>`;
            preview.addEventListener('click', () => document.getElementById('uPhotoInput').click());
        } else if (u.photoEmoji && initial) {
            if (preview) preview.style.background = 'var(--bg-secondary)';
            initial.textContent = u.photoEmoji;
            initial.style.fontSize = '32px';
        } else {
            const ini = (u.name||'?').split(' ').map(w=>w[0]).slice(0,2).join('').toUpperCase();
            if (initial) { initial.textContent = ini; initial.style.fontSize = '22px'; initial.style.display = ''; }
            if (preview) preview.style.background = `linear-gradient(135deg,${ROLE_COLORS[u.role]||'var(--accent)'},${ROLE_COLORS[u.role]||'#7c3aed'}aa)`;
        }

        // Senha — oculta, mostra checkbox para trocar
        document.getElementById('passwordFields').style.display = 'none';
        const toggleLabel = document.getElementById('changePwToggleLabel');
        if (toggleLabel) { toggleLabel.style.display = 'flex'; }
        const toggle = document.getElementById('changePwToggle');
        if (toggle) toggle.checked = false;

        // Permissões
        const perms = u.permissions||{};
        document.getElementById('pCancelSales').checked    = !!perms.cancelSales;
        document.getElementById('pChangePrices').checked   = !!perms.changePrices;
        document.getElementById('pGrantDiscounts').checked = !!perms.grantDiscounts;
        document.getElementById('pAdjustStock').checked    = !!perms.adjustStock;
        document.getElementById('pCloseCash').checked      = !!perms.closeCash;
        document.getElementById('pViewReports').checked    = !!perms.viewReports;
        document.getElementById('pDeleteRecords').checked  = !!perms.deleteRecords;
        document.getElementById('pViewFinancial').checked  = !!perms.viewFinancial;
        [['pBlockSell','blockSell'],['pBlockQuoteToSale','blockQuoteToSale'],['pBlockQuotes','blockQuotes'],['pBlockServiceOrders','blockServiceOrders'],['pBlockConsignment','blockConsignment']].forEach(([i,k])=>{const el=document.getElementById(i);if(el)el.checked=!!perms[k];});
        dpTelasForm.iniciar(); dpTelasForm.preencher(perms);
        onRoleChange(u.role||'seller');
        openModal('modalUsuario');
    };

    // ── TROCAR SENHA (modal rápido) ─────────────────────────
    window.resetPassword = (id, email) => {
        const ov = document.createElement('div'); ov.className='modal-overlay active';
        ov.innerHTML = `<div class="modal" style="max-width:380px">
            <div class="modal-header"><h3><i class="fas fa-key" style="margin-right:8px;color:var(--accent)"></i>Trocar Senha</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button></div>
            <div class="modal-body">
                <div style="background:var(--bg-secondary);border-radius:10px;padding:10px 14px;margin-bottom:14px;font-size:13px;color:var(--text-muted)">
                    Usuário: <strong style="color:var(--text-heading)">${email}</strong>
                </div>
                <div class="form-group"><label class="form-label">Nova Senha *</label>
                    <div style="position:relative">
                        <input type="password" id="rpNewPw" class="form-control" placeholder="Mín. 6 caracteres" style="padding-right:40px">
                        <button type="button" onclick="togglePwVis('rpNewPw',this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="fas fa-eye"></i></button>
                    </div>
                </div>
                <div class="form-group"><label class="form-label">Confirmar Senha *</label>
                    <div style="position:relative">
                        <input type="password" id="rpNewPw2" class="form-control" placeholder="Repetir senha" style="padding-right:40px">
                        <button type="button" onclick="togglePwVis('rpNewPw2',this)" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;color:var(--text-muted);cursor:pointer"><i class="fas fa-eye"></i></button>
                    </div>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="confirmResetPassword('${id}',this)"><i class="fas fa-check"></i> Confirmar</button>
            </div>
        </div>`;
        document.body.appendChild(ov);
    };

    // 39.1 · Trocar a PRÓPRIA senha: o Firebase pede login recente (auth/requires-recent-login). Em vez de dar erro,
    // pede a senha atual numa janelinha, confirma o login e troca na hora (sem precisar sair e entrar de novo).
    const pedirSenhaAtual = () => new Promise(resolve => {
        const ov = document.createElement('div'); ov.className = 'modal-overlay active'; ov.style.zIndex = '10050';
        ov.innerHTML = `<div class="modal" style="max-width:400px"><div class="modal-header"><h3 class="modal-title"><i class="fas fa-lock"></i> Confirme a sua senha atual</h3></div>
            <div class="modal-body"><p style="margin:0 0 12px;color:var(--text-secondary)">Por segurança, para trocar a sua senha digite a senha que você usa hoje para entrar.</p>
            <div class="form-group"><input type="password" class="form-input" id="dpSenhaAtual" autocomplete="current-password" placeholder="Senha atual"></div></div>
            <div class="modal-footer"><button class="btn btn-secondary" data-r="0">Cancelar</button><button class="btn btn-primary" data-r="1"><i class="fas fa-check"></i> Confirmar</button></div></div>`;
        const fim = v => { ov.remove(); resolve(v); };
        ov.addEventListener('click', e => { const b = e.target.closest('[data-r]'); if (b) fim(b.dataset.r === '1' ? ov.querySelector('#dpSenhaAtual').value : null); });
        ov.addEventListener('keydown', e => { if (e.key === 'Enter') fim(ov.querySelector('#dpSenhaAtual').value); if (e.key === 'Escape') fim(null); });
        document.body.appendChild(ov); setTimeout(() => ov.querySelector('#dpSenhaAtual')?.focus(), 50);
    });
    const trocarMinhaSenha = async (pw) => {
        try { await auth.currentUser.updatePassword(pw); }
        catch (e) {
            const fb = window.firebase && window.firebase.auth && window.firebase.auth.EmailAuthProvider;
            if (!(e && e.code === 'auth/requires-recent-login' && fb)) throw e;
            const atual = await pedirSenhaAtual();
            if (!atual) throw new Error('A troca de senha foi cancelada.');
            try { await auth.currentUser.reauthenticateWithCredential(fb.credential(auth.currentUser.email, atual)); }
            catch (e2) { throw new Error(/wrong-password|invalid-credential|invalid-login/.test(e2?.code || '') ? 'Senha atual incorreta. A senha não foi trocada.' : (e2?.message || 'Não foi possível confirmar a senha atual.')); }
            await auth.currentUser.updatePassword(pw);
        }
    };

    window.confirmResetPassword = async (id, btn) => {
        const pw  = document.getElementById('rpNewPw')?.value;
        const pw2 = document.getElementById('rpNewPw2')?.value;
        if (!pw || pw.length < 6) { Toast.warning('Senha mínima: 6 caracteres'); return; }
        if (pw !== pw2) { Toast.warning('Senhas não conferem'); return; }
        btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        try {
            // Se for o usuário atual, usa Firebase Auth diretamente
            if (id === auth.currentUser?.uid) {
                await trocarMinhaSenha(pw);
                Toast.success('Senha alterada com sucesso!');
                btn.closest('.modal-overlay').remove();
            } else {
                // Para outros usuários: salva hash/flag no Firestore (requer admin SDK para troca real)
                // Na prática, envia e-mail de redefinição
                const u = users.find(x=>x.id===id);
                if (u?.email) {
                    await auth.sendPasswordResetEmail(u.email);
                    Toast.success(`E-mail de redefinição enviado para ${u.email}!`);
                    btn.closest('.modal-overlay').remove();
                } else {
                    Toast.error('E-mail do usuário não encontrado');
                    btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar';
                }
            }
        } catch(e) {
            Toast.error('Erro: ' + (e.message || e.code || 'Tente novamente'));
            btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Confirmar';
        }
    };

    // ── SALVAR ──────────────────────────────────────────────
    window.saveUser = async () => {
        const name   = document.getElementById('uName')?.value?.trim()||'';
        const email  = document.getElementById('uEmail')?.value?.trim()||'';
        const phone  = document.getElementById('uPhone')?.value||'';
        const role   = document.getElementById('uRole')?.value||'seller';
        const status = document.getElementById('uStatus')?.value||'active';
        const commissionType = document.getElementById('uCommissionType')?.value||'none';
        const commissionValue = commissionType === 'none' ? 0 : Math.max(0, parseFloat(document.getElementById('uCommissionValue')?.value||0)||0);
        const commissionServiceType = document.getElementById('uCommissionServiceType')?.value||'inherit';
        const commissionServiceValue = ['none','inherit'].includes(commissionServiceType) ? 0 : Math.max(0, parseFloat(document.getElementById('uCommissionServiceValue')?.value||0)||0);
        const photo  = document.getElementById('uPhotoData')?.value||'';
        const emoji  = document.getElementById('uPhotoEmoji')?.value||'';
        if (!name||!email) { Toast.warning('Nome e e-mail são obrigatórios.'); return; }

        const permissions = {
            cancelSales:    document.getElementById('pCancelSales')?.checked||false,
            changePrices:   document.getElementById('pChangePrices')?.checked||false,
            grantDiscounts: document.getElementById('pGrantDiscounts')?.checked||false,
            adjustStock:    document.getElementById('pAdjustStock')?.checked||false,
            closeCash:      document.getElementById('pCloseCash')?.checked||false,
            viewReports:    document.getElementById('pViewReports')?.checked||false,
            deleteRecords:  document.getElementById('pDeleteRecords')?.checked||false,
            viewFinancial:  document.getElementById('pViewFinancial')?.checked||false,
            // 36.9 · Bloqueios individuais
            blockSell:          document.getElementById('pBlockSell')?.checked||false,
            blockQuoteToSale:   document.getElementById('pBlockQuoteToSale')?.checked||false,
            blockQuotes:        document.getElementById('pBlockQuotes')?.checked||false,
            blockServiceOrders: document.getElementById('pBlockServiceOrders')?.checked||false,
            blockConsignment:   document.getElementById('pBlockConsignment')?.checked||false,
        };
        // 40.0 · Acesso às telas (liberar/bloquear uma a uma) e "ver só os dele". Os bloqueios antigos de Orçamentos e OS
        // seguem o quadro novo (outras telas ainda leem blockQuotes/blockServiceOrders).
        permissions.telas = dpTelasForm.ler();
        permissions.blockQuotes = permissions.telas.orcamentos === 'bloquear';
        permissions.blockServiceOrders = permissions.telas['ordens-servico'] === 'bloquear';
        permissions.soProprios = !!document.getElementById('pSoProprios')?.checked;

        const btn = document.getElementById('saveUserBtn');
        if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Salvando...'; }

        try {
            const data = { name, phone, role, roleName:role, status, permissions, commissionType, commissionValue, commissionServiceType, commissionServiceValue, photoUrl:photo, photoEmoji:emoji, updatedAt:firebase.firestore.FieldValue.serverTimestamp() };
            if (window.DPAgenda && DPAgenda.userFields) Object.assign(data, DPAgenda.userFields()); // 37.9 · Agenda: atende na agenda, cor e horários

            if (editingId) {
                await db.collection('users').doc(editingId).update(data);
                // Troca de senha se solicitado
                // 39.1 · Os dados já foram salvos: se só a senha falhar, avisa isso (antes aparecia "Erro ao salvar" com tudo salvo)
                let pwErro = '';
                if (document.getElementById('changePwToggle')?.checked) {
                    const pw = document.getElementById('uPassword')?.value;
                    if (pw && pw.length >= 6 && editingId === auth.currentUser?.uid) {
                        try { await trocarMinhaSenha(pw); } catch (e) { pwErro = e?.message || 'Tente de novo.'; }
                    }
                }
                if (pwErro) Toast.warning('Dados do usuário salvos, mas a senha não foi trocada: ' + pwErro);
                else Toast.success('Usuário atualizado!');
            } else {
                const pw  = document.getElementById('uPassword')?.value;
                const pw2 = document.getElementById('uPassword2')?.value;
                if (!pw || pw.length < 6) { Toast.warning('Senha mínima: 6 caracteres.'); btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Salvar'; return; }
                if (pw !== pw2)           { Toast.warning('Senhas não conferem.');         btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Salvar'; return; }
                // 40.29 · O login novo é criado numa 2ª conexão ("cadastro") e o administrador continua logado. Antes essa proteção
                // só existia no config/firebase-config.js novo, e o cliente fica com o dele nas atualizações: com o antigo, o login
                // do administrador virava o do usuário novo, a regra recusava gravar o cadastro ("Missing or insufficient
                // permissions") e o funcionário ficava com login e sem cadastro. E-mail que já tem login (ex.: esse funcionário):
                // entra na 2ª conexão com a senha digitada para achar o login e grava o cadastro nele.
                let novo;
                try {
                    const app2 = firebase.apps.find(a => a.name === 'cadastro') || firebase.initializeApp(firebase.app().options, 'cadastro');
                    const auth2 = app2.auth();
                    try { await auth2.setPersistence(firebase.auth.Auth.Persistence.NONE); } catch (_) { }
                    let jaTinha = false, res;
                    try { res = await auth2.createUserWithEmailAndPassword(email, pw); }
                    catch (e) { if (e && e.code === 'auth/email-already-in-use') { jaTinha = true; res = await auth2.signInWithEmailAndPassword(email, pw); } else throw e; }
                    novo = { uid: res.user.uid, jaTinha };
                    try { await auth2.signOut(); } catch (_) { }
                } catch (authErr) {
                    console.error('Criar login:', authErr);
                    const c = authErr && authErr.code || '';
                    if (['auth/wrong-password', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(c))
                        Toast.error('Este e-mail já tem login no sistema, com outra senha. Digite a senha que a pessoa usa para entrar. Se ninguém lembra: na tela de entrar, "Esqueci minha senha" com este e-mail, crie a senha nova e cadastre aqui com ela.');
                    else Toast.error('Não foi possível criar o login deste usuário: ' + (window.dpErroHumano ? dpErroHumano(authErr) : (authErr && authErr.message)));
                    return;
                }
                const antigo = await db.collection('users').doc(novo.uid).get().catch(() => null);
                if (antigo && antigo.exists && antigo.data().deleted !== true) { Toast.warning('Este e-mail já é de um usuário cadastrado (' + (antigo.data().name || email) + '). Edite esse usuário na lista.'); return; }
                await db.collection('users').doc(novo.uid).set({ uid:novo.uid, email, ...data, deleted:false, createdAt:firebase.firestore.FieldValue.serverTimestamp(), createdBy:auth.currentUser?.uid||'' });
                Toast.success(novo.jaTinha ? 'Usuário cadastrado no login que já existia para este e-mail. Ele já pode entrar com essa senha.' : 'Usuário criado com sucesso!');
            }
            closeModal('modalUsuario'); editingId=null; await load();
            // Atualiza avatar do header se for o próprio usuário
            if (editingId === currentUser?.uid || (auth.currentUser && editingId === auth.currentUser.uid)) {
                if (currentUser) { currentUser.photoUrl = photo; currentUser.photoEmoji = emoji; currentUser.name = name; }
                setupHeader?.();
            }
        } catch(e) {
            console.error(e); Toast.error('Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
        } finally {
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Salvar'; }
        }
    };

    window.toggleUserStatus = async (id, cur) => {
        if (id === currentUser?.uid) { Toast.warning('Você não pode alterar sua própria conta.'); return; }
        try { await db.collection('users').doc(id).update({status:cur==='active'?'inactive':'active'}); await load(); } catch (e) { Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    };

    window.delUser = (id, name) => {
        if (id === currentUser?.uid) { Toast.warning('Você não pode excluir sua própria conta.'); return; }
        Confirm.show('Excluir Usuário', `Excluir o usuário "${name}"? Esta ação não pode ser desfeita.`, async () => {
            try { await db.collection('users').doc(id).update({deleted:true}); Toast.success('Usuário excluído!'); await load(); } catch (e) { Toast.error('Erro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        });
    };

    await load();
}


/* ================================================================
   PÁGINA: FLUXO DE CAIXA
================================================================ */
async function initPageFluxoCaixa() {
    let allTxs = []; // todas as transações carregadas
    let cashFrom = new Date(); cashFrom.setDate(1); cashFrom.setHours(0,0,0,0);
    let cashTo   = new Date(); cashTo.setHours(23,59,59,999);

    // Inicia datas nos inputs
    function syncDateInputs() {
        const f = document.getElementById('cashDateFrom');
        const t = document.getElementById('cashDateTo');
        // 37.8 · data local (o mesmo problema dos Relatórios: o "até" virava o dia seguinte)
        const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (f) f.value = ymd(cashFrom);
        if (t) t.value = ymd(cashTo);
    }
    syncDateInputs();

    window.setCashPeriod = (period, btn) => {
        const now = new Date();
        switch(period) {
            case 'today':
                cashFrom = new Date(); cashFrom.setHours(0,0,0,0);
                cashTo   = new Date(); cashTo.setHours(23,59,59,999); break;
            case 'week':
                cashFrom = new Date(); cashFrom.setDate(now.getDate()-6); cashFrom.setHours(0,0,0,0);
                cashTo   = new Date(); cashTo.setHours(23,59,59,999); break;
            case 'month':
                cashFrom = new Date(now.getFullYear(), now.getMonth(), 1);
                cashTo   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59); break;
            case 'last30':
                cashFrom = new Date(); cashFrom.setDate(now.getDate()-29); cashFrom.setHours(0,0,0,0);
                cashTo   = new Date(); cashTo.setHours(23,59,59,999); break;
            case 'year':
                cashFrom = new Date(now.getFullYear(), 0, 1);
                cashTo   = new Date(now.getFullYear(), 11, 31, 23, 59, 59); break;
        }
        syncDateInputs();
        // Atualiza estilo dos botões
        document.querySelectorAll('[onclick*="setCashPeriod"]').forEach(b => {
            b.className = 'btn btn-outline btn-sm';
            b.style.fontSize = '12px';
        });
        if (btn) { btn.className = 'btn btn-primary btn-sm'; btn.style.fontSize = '12px'; }
        loadCashFlow();
    };

    window.loadCashFlow = async () => {
        // Lê datas dos inputs se alteradas manualmente
        const fEl = document.getElementById('cashDateFrom');
        const tEl = document.getElementById('cashDateTo');
        if (fEl?.value) { const d=new Date(fEl.value+'T00:00:00'); if(!isNaN(d)) cashFrom=d; }
        if (tEl?.value) { const d=new Date(tEl.value+'T23:59:59'); if(!isNaN(d)) cashTo=d; }

        try {
            const [sales, entries] = await Promise.all([
                simpleList('sales','createdAt','desc',2000),
                simpleList('financial_entries','createdAt','desc',1000)
            ]);

            const filterDate = (dt) => {
                const d = dt?.toDate?.() || new Date(dt||0);
                return d >= cashFrom && d <= cashTo;
            };

            // Transações do período
            const txs = [];

            // Vendas concluídas: cada forma de pagamento entra separadamente no fluxo.
            // Fiado só entra quando a conta for efetivamente recebida, evitando contar dinheiro que ainda não entrou.
            sales.filter(s => !s.deleted && ['completed','delivered'].includes(s.status) && filterDate(s.createdAt)).forEach(s => {
                const payments = Array.isArray(s.payments) && s.payments.length ? s.payments : [{method:s.paymentMethod||'dinheiro',amount:s.total||0}];
                payments.filter(p=>p.method!=='fiado').forEach(p => {
                    txs.push({ date:s.createdAt, desc:`Venda #${s.saleNumber||''}${s.source==='service_order'?' · OS':''}`, cat:p.method||'Venda', type:'in', val:Number(p.amount||0) });
                });
            });

            // Contas pagas (despesas)
            entries.filter(e => e.type==='expense' && e.status==='paid' && !e.deleted && filterDate(e.paidAt||e.createdAt)).forEach(e => {
                txs.push({ date: e.paidAt||e.createdAt, desc: e.description||'Despesa', cat: e.category||'Outros', type:'out', val: e.amount||0 });
            });

            // Contas recebidas (receitas manuais)
            entries.filter(e => e.type==='income' && e.status==='received' && !e.deleted && filterDate(e.paidAt||e.createdAt)).forEach(e => {
                txs.push({ date: e.paidAt||e.createdAt, desc: e.description||'Receita', cat: e.category||'Outros', type:'in', val: e.amount||0 });
            });

            txs.sort((a,b) => (b.date?.toDate?.()??new Date(b.date||0)) - (a.date?.toDate?.()??new Date(a.date||0)));
            allTxs = txs;

            // A receber no período
            const pending = entries.filter(e => e.type==='income' && e.status==='pending' && !e.deleted);
            const totalPending = pending.reduce((s,e)=>s+(e.amount||0),0);

            // Stats
            const totalIn  = txs.filter(t=>t.type==='in').reduce((s,t)=>s+t.val,0);
            const totalOut = txs.filter(t=>t.type==='out').reduce((s,t)=>s+t.val,0);
            const bal      = totalIn - totalOut;

            const setEl = (id, val, color) => {
                const el = document.getElementById(id);
                if (el) { el.textContent = fmtCurrency(val); if(color) el.style.color = color; }
            };
            setEl('cashIn',  totalIn,  '#10b981');
            setEl('cashOut', totalOut, '#ef4444');
            const balEl = document.getElementById('cashBal');
            if (balEl) { balEl.textContent = fmtCurrency(Math.abs(bal)); balEl.style.color = bal >= 0 ? '#10b981' : '#ef4444'; balEl.textContent = (bal>=0?'':'-') + fmtCurrency(Math.abs(bal)); }
            setEl('cashPending', totalPending, '#a855f7');

            // Label do gráfico
            const lbl = document.getElementById('cashChartLabel');
            if (lbl) lbl.textContent = cashFrom.toLocaleDateString('pt-BR') + ' → ' + cashTo.toLocaleDateString('pt-BR');

            // Gráfico por dia
            rebuildCashChart(txs);

            // Categorias
            renderCashCats(txs);

            // Tabela
            renderCashTable();

        } catch(e) { console.error('Fluxo caixa:', e); }
    };

    function rebuildCashChart(txs) {
        const ctx = document.getElementById('chartFluxo');
        if (!ctx || !window.Chart) return;

        // Quantos dias no período
        const diffDays = Math.ceil((cashTo - cashFrom) / 86400000);
        const nDays = Math.min(diffDays + 1, 31);
        const labels = [], inD = [], outD = [];

        for (let i = nDays-1; i >= 0; i--) {
            const d = new Date(cashTo); d.setDate(cashTo.getDate() - i);
            const ds = new Date(d); ds.setHours(0,0,0,0);
            const de = new Date(d); de.setHours(23,59,59,999);
            labels.push(`${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}`);
            inD.push(txs.filter(t=>t.type==='in'&&(t.date?.toDate?.()??new Date(t.date||0))>=ds&&(t.date?.toDate?.()??new Date(t.date||0))<=de).reduce((s,t)=>s+t.val,0));
            outD.push(txs.filter(t=>t.type==='out'&&(t.date?.toDate?.()??new Date(t.date||0))>=ds&&(t.date?.toDate?.()??new Date(t.date||0))<=de).reduce((s,t)=>s+t.val,0));
        }
        const ex = Chart.getChart(ctx); if (ex) ex.destroy();
        new Chart(ctx, {
            type:'bar',
            data:{labels, datasets:[
                {label:'Entradas', data:inD, backgroundColor:'rgba(16,185,129,.75)', borderRadius:5},
                {label:'Saídas',   data:outD, backgroundColor:'rgba(239,68,68,.75)', borderRadius:5}
            ]},
            options:{responsive:true, maintainAspectRatio:false,
                plugins:{legend:{labels:{color:'#94a3b8',font:{size:12}}}},
                scales:{
                    x:{grid:{display:false}, ticks:{color:'#64748b',font:{size:10},maxRotation:45}},
                    y:{grid:{color:'rgba(148,163,184,.08)'}, ticks:{color:'#64748b',font:{size:11},callback:v=>'R$'+(v>=1000?(v/1000).toFixed(0)+'k':v)}}
                }
            }
        });
    }

    function renderCashCats(txs) {
        const inColors  = ['#10b981','#3b82f6','#a855f7','#f59e0b','#06b6d4','#8b5cf6'];
        const outColors = ['#ef4444','#f97316','#eab308','#64748b','#ec4899','#6366f1'];

        // Agrupa entradas por categoria
        const inMap = {}, outMap = {};
        txs.forEach(t => {
            if (t.type==='in')  inMap[t.cat]  = (inMap[t.cat]||0)  + t.val;
            if (t.type==='out') outMap[t.cat] = (outMap[t.cat]||0) + t.val;
        });

        const buildCatHtml = (map, colors) => {
            const sorted = Object.entries(map).sort((a,b)=>b[1]-a[1]);
            if (!sorted.length) return '<div style="color:var(--text-muted);font-size:13px;text-align:center;padding:20px">Nenhuma movimentação</div>';
            return sorted.map(([cat, val], i) => `
                <div style="display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:8px;background:var(--bg-secondary)">
                    <div style="display:flex;align-items:center;gap:8px">
                        <div style="width:8px;height:8px;border-radius:50%;background:${colors[i%colors.length]};flex-shrink:0"></div>
                        <span style="font-size:13px;color:var(--text-secondary)">${cat}</span>
                    </div>
                    <span style="font-weight:700;color:${colors[i%colors.length]};font-size:13px">${fmtCurrency(val)}</span>
                </div>`).join('');
        };

        const inEl  = document.getElementById('cashInCats');
        const outEl = document.getElementById('cashOutCats');
        if (inEl)  inEl.innerHTML  = buildCatHtml(inMap,  inColors);
        if (outEl) outEl.innerHTML = buildCatHtml(outMap, outColors);
    }

    window.renderCashTable = () => {
        const typeF   = document.getElementById('cashFilterType')?.value||'';
        const searchQ = (document.getElementById('cashSearch')?.value||'').toLowerCase();
        let data = [...allTxs];
        if (typeF)   data = data.filter(t => t.type === typeF);
        if (searchQ) data = data.filter(t => (t.desc||'').toLowerCase().includes(searchQ)||(t.cat||'').toLowerCase().includes(searchQ));

        const tbody = document.getElementById('cashTbody');
        if (!tbody) return;
        if (!data.length) { tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma movimentação encontrada</td></tr>'; return; }

        let runBal = 0;
        // Calcula saldo acumulado (do mais antigo ao mais recente)
        const sorted = [...data].reverse();
        const withBal = sorted.map(t => {
            runBal += t.type==='in' ? t.val : -t.val;
            return {...t, bal: runBal};
        }).reverse();

        tbody.innerHTML = withBal.slice(0,200).map(t => `<tr>
            <td style="font-size:12px;color:var(--text-muted);white-space:nowrap">${fmtDate(t.date)}</td>
            <td style="font-weight:600;color:var(--text-heading)">${t.desc||'—'}</td>
            <td><span style="background:rgba(99,102,241,.1);color:var(--accent);padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600">${t.cat||'—'}</span></td>
            <td style="text-align:center">${t.type==='in'?'<span class="badge badge-success"><i class="fas fa-arrow-down"></i> Entrada</span>':'<span class="badge badge-danger"><i class="fas fa-arrow-up"></i> Saída</span>'}</td>
            <td style="text-align:right;font-weight:700;color:${t.type==='in'?'#10b981':'#ef4444'}">${t.type==='in'?'+':'-'}${fmtCurrency(t.val)}</td>
            <td style="text-align:right;font-weight:600;color:${t.bal>=0?'var(--text-primary)':'#ef4444'}">${fmtCurrency(t.bal)}</td>
        </tr>`).join('');
    };

    // Modal lançamento manual
    window.addCashEntry = type => {
        const ov = document.createElement('div'); ov.className='modal-overlay active';
        const cats = type==='in'
            ? ['Vendas','Serviços','Recebimento fiado','PIX recebido','Outros']
            : ['Fornecedores','Aluguel','Energia','Água','Internet','Folha','Impostos','Manutenção','Outros'];
        ov.innerHTML = `<div class="modal" style="max-width:440px">
            <div class="modal-header">
                <h3>${type==='in'?'<i class="fas fa-circle-plus" style="color:#10b981;margin-right:6px"></i>Lançar Entrada':'<i class="fas fa-circle-minus" style="color:#ef4444;margin-right:6px"></i>Lançar Saída'}</h3>
                <button class="modal-close" onclick="this.closest('.modal-overlay').remove()"><i class="fas fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group"><label class="form-label">Descrição *</label><input type="text" id="cfDesc" class="form-control" placeholder="Ex: Pagamento fornecedor, Recebimento cliente..."></div>
                <div class="form-grid" style="grid-template-columns:1fr 1fr">
                    <div class="form-group"><label class="form-label">Valor *</label><input type="number" id="cfValor" class="form-control" step="0.01" placeholder="0,00"></div>
                    <div class="form-group"><label class="form-label">Data *</label><input type="date" id="cfData" class="form-control" value="${new Date().toISOString().split('T')[0]}"></div>
                </div>
                <div class="form-group"><label class="form-label">Categoria</label>
                    <select id="cfCat" class="form-control">${cats.map(c=>`<option>${c}</option>`).join('')}</select>
                </div>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
                <button class="btn btn-primary" onclick="saveCashEntry('${type}',this)"><i class="fas fa-check"></i> Salvar</button>
            </div>
        </div>`;
        document.body.appendChild(ov);
    };

    window.saveCashEntry = async (type, btn) => {
        const desc  = document.getElementById('cfDesc')?.value?.trim();
        const valor = parseFloat(document.getElementById('cfValor')?.value)||0;
        const data  = document.getElementById('cfData')?.value;
        const cat   = document.getElementById('cfCat')?.value;
        if (!desc)  { Toast.warning('Informe a descrição'); return; }
        if (!valor) { Toast.warning('Informe o valor'); return; }
        if (!data)  { Toast.warning('Informe a data'); return; }
        if (btn) { btn.disabled=true; btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>'; }
        try {
            await db.collection('financial_entries').add({
                type: type==='in'?'income':'expense',
                description: desc, amount: valor, category: cat,
                dueDate:  firebase.firestore.Timestamp.fromDate(new Date(data+'T12:00:00')),
                paidAt:   firebase.firestore.Timestamp.fromDate(new Date(data+'T12:00:00')),
                status: type==='in'?'received':'paid',
                deleted: false,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                createdBy: auth.currentUser?.uid||''
            });
            Toast.success('Lançamento salvo!');
            btn?.closest('.modal-overlay')?.remove();
            await loadCashFlow();
        } catch (e) {
            Toast.error('Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));
            if (btn) { btn.disabled=false; btn.innerHTML='<i class="fas fa-check"></i> Salvar'; }
        }
    };

    window.exportCashPDF = async () => {
        const data = allTxs;
        let empresa = 'DistribuiPRO';
        try { const cfg=await db.collection('settings').doc('general').get(); if(cfg.exists) empresa=cfg.data().nomeFantasia||cfg.data().razaoSocial||empresa; } catch(e){}
        const dateStr = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});
        const periodo = cashFrom.toLocaleDateString('pt-BR') + ' a ' + cashTo.toLocaleDateString('pt-BR');
        const totalIn  = data.filter(t=>t.type==='in').reduce((s,t)=>s+t.val,0);
        const totalOut = data.filter(t=>t.type==='out').reduce((s,t)=>s+t.val,0);
        const bal      = totalIn - totalOut;

        const rows = data.slice(0,500).map((t,i) => {
            const bg = i%2===0?'#f8fafc':'#fff';
            return `<tr style="background:${bg}">
                <td style="font-size:11px;color:#64748b">${fmtDate(t.date)}</td>
                <td style="font-weight:600;color:#1e293b">${t.desc||'—'}</td>
                <td><span style="background:#e0e7ff;color:#4f46e5;padding:2px 7px;border-radius:10px;font-size:10px;font-weight:700">${t.cat||'—'}</span></td>
                <td style="text-align:center"><span style="background:${t.type==='in'?'#dcfce7':'#fee2e2'};color:${t.type==='in'?'#16a34a':'#dc2626'};padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">${t.type==='in'?'Entrada':'Saída'}</span></td>
                <td style="text-align:right;font-weight:700;color:${t.type==='in'?'#059669':'#dc2626'}">${t.type==='in'?'+':'-'}R$ ${t.val.toFixed(2).replace('.',',')}</td>
            </tr>`;
        }).join('');

        const win = window.open('','_blank','width=1000,height=800');
        win.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Fluxo de Caixa — '+empresa+'</title><style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}.page{padding:28px 32px;max-width:960px;margin:0 auto}.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:20px;border-bottom:3px solid #6366f1}.header-left h1{font-size:22px;font-weight:800;letter-spacing:-.5px}.header-right{text-align:right}.header-right .empresa{font-size:16px;font-weight:700;color:#6366f1}.header-right .date{font-size:11px;color:#94a3b8;margin-top:4px}.badge-period{display:inline-block;background:#ede9fe;color:#7c3aed;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:8px}.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;margin-bottom:20px}.sum-card{border-radius:10px;padding:12px 16px;border:1px solid #e2e8f0;background:#f8fafc}.sum-card .val{font-size:18px;font-weight:800;margin-top:3px}.sum-card .lbl{font-size:10px;color:#94a3b8;text-transform:uppercase;letter-spacing:.5px;font-weight:600}.table-wrap{border-radius:10px;overflow:hidden;border:1px solid #e2e8f0}table{width:100%;border-collapse:collapse}thead tr{background:linear-gradient(135deg,#6366f1,#8b5cf6)}thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;padding:10px;text-align:left}tbody td{padding:9px 10px;border-bottom:1px solid #f1f5f9;vertical-align:middle}tbody tr:last-child td{border-bottom:none}.footer{margin-top:20px;padding-top:12px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between}.footer div{font-size:10px;color:#94a3b8}@media print{@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}}</style></head><body><div class="page"><div class="header"><div class="header-left"><h1>💵 Fluxo de Caixa</h1><div style="font-size:12px;color:#64748b;margin-top:4px">Movimentações financeiras do período</div><div class="badge-period">'+periodo+'</div></div><div class="header-right"><div class="empresa">'+empresa+'</div><div class="date">Gerado em '+dateStr+'</div></div></div><div class="summary"><div class="sum-card" style="border-color:#bbf7d0;background:#f0fdf4"><div class="lbl">Total Entradas</div><div class="val" style="color:#16a34a">R$ '+totalIn.toFixed(2).replace(".",",")+'</div></div><div class="sum-card" style="border-color:#fecaca;background:#fff1f2"><div class="lbl">Total Saídas</div><div class="val" style="color:#dc2626">R$ '+totalOut.toFixed(2).replace(".",",")+'</div></div><div class="sum-card" style="border-color:'+(bal>=0?'#c7d2fe':'#fecaca')+';background:'+(bal>=0?'#eef2ff':'#fff1f2')+'"><div class="lbl">Saldo</div><div class="val" style="color:'+(bal>=0?'#4f46e5':'#dc2626')+'">'+(bal>=0?'+':'')+' R$ '+Math.abs(bal).toFixed(2).replace(".",",")+'</div></div></div><div class="table-wrap"><table><thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th style="text-align:center">Tipo</th><th style="text-align:right">Valor</th></tr></thead><tbody>'+rows+'</tbody></table></div><div class="footer"><div>DistribuiPRO ERP · Fluxo de Caixa · '+dateStr+'</div><div>'+data.length+' registros</div></div></div><div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999"><button onclick="triggerPrint()" style="background:#6366f1;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / Salvar PDF</button><button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button></div><script>function triggerPrint(){document.getElementById("printBtns").style.display="none";setTimeout(function(){window.print();document.getElementById("printBtns").style.display="flex";},50);}window.onbeforeprint=function(){document.getElementById("printBtns").style.display="none";};window.onafterprint=function(){document.getElementById("printBtns").style.display="flex";};<\/script></body></html>');
        win.document.close();
    };

    await loadCashFlow();
}


/* ================================================================
   PÁGINA: RELATÓRIOS — 100% dados reais do Firebase
================================================================ */
async function initPageRelatorios() {

    // ── ESTADO GLOBAL DO RELATÓRIO ─────────────────────────
    let currentReport = null;
    let currentData   = {};
    let dateFrom      = new Date(); dateFrom.setDate(1); dateFrom.setHours(0,0,0,0); // início do mês
    let dateTo        = new Date(); dateTo.setHours(23,59,59,999);
    let activeChart1  = null;
    let activeChart2  = null;

    // Inicializar datas nos inputs
    const setInputDates = () => {
        const f = document.getElementById('rptDateFrom');
        const t = document.getElementById('rptDateTo');
        // 37.8 · data local: toISOString() passava para UTC e o "até" mostrava o dia seguinte
        const ymd = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
        if (f) f.value = ymd(dateFrom);
        if (t) t.value = ymd(dateTo);
    };
    setInputDates();

    // Marcar "Mês atual" como ativo por padrão
    document.querySelectorAll('.period-btn').forEach((b,i) => {
        b.style.cssText = i===2
            ? 'background:var(--accent);color:#fff;border-color:var(--accent)'
            : 'background:transparent;color:var(--text-secondary);border-color:var(--border-color)';
    });

    // ── SELETOR DE PERÍODO ─────────────────────────────────
    window.setPeriod = function(period, btn) {
        const now = new Date();
        switch(period) {
            case 'today':
                dateFrom = new Date(); dateFrom.setHours(0,0,0,0);
                dateTo   = new Date(); dateTo.setHours(23,59,59,999);
                break;
            case 'week':
                dateFrom = new Date(); dateFrom.setDate(now.getDate()-6); dateFrom.setHours(0,0,0,0);
                dateTo   = new Date(); dateTo.setHours(23,59,59,999);
                break;
            case 'month':
                dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
                dateTo   = new Date(now.getFullYear(), now.getMonth()+1, 0, 23, 59, 59);
                break;
            case 'last30':
                dateFrom = new Date(); dateFrom.setDate(now.getDate()-29); dateFrom.setHours(0,0,0,0);
                dateTo   = new Date(); dateTo.setHours(23,59,59,999);
                break;
            case 'year':
                dateFrom = new Date(now.getFullYear(), 0, 1);
                dateTo   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
                break;
        }
        setInputDates();
        document.querySelectorAll('.period-btn').forEach(b => {
            b.style.cssText = 'background:transparent;color:var(--text-secondary);border-color:var(--border-color)';
        });
        if (btn) btn.style.cssText = 'background:var(--accent);color:#fff;border-color:var(--accent)';
        if (currentReport) gerarRelatorio();
    };

    window.gerarRelatorio = function() {
        const f = document.getElementById('rptDateFrom');
        const t = document.getElementById('rptDateTo');
        if (f?.value) { dateFrom = new Date(f.value + 'T00:00:00'); }
        if (t?.value) { dateTo   = new Date(t.value + 'T23:59:59'); }
        if (currentReport) showReport(currentReport);
    };

    // ── HELPERS ─────────────────────────────────────────────
    function inRange(ts) {
        const d = ts?.toDate ? ts.toDate() : new Date(ts || 0);
        return d >= dateFrom && d <= dateTo;
    }

    function destroyCharts() {
        if (activeChart1) { activeChart1.destroy(); activeChart1 = null; }
        if (activeChart2) { activeChart2.destroy(); activeChart2 = null; }
    }

    function chartDefaults(ctx) {
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } } },
            scales: {
                x: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 11 } } },
                y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 11 } } }
            }
        };
    }

    function periodLabel() {
        return `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
    }

    function miniStat(label, value, color='var(--text-primary)') {
        return `<div style="text-align:center;padding:16px;border-radius:12px;background:var(--bg-secondary)">
            <div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">${label}</div>
            <div style="font-size:18px;font-weight:800;color:${color}">${value}</div>
        </div>`;
    }

    function exportCSV(rows, filename) {
        const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['\ufeff'+csv],{type:'text/csv;charset=utf-8;'}));
        a.download = filename; a.click(); URL.revokeObjectURL(a.href);
    }

    window.exportarCSV = function() {
        if (!currentData.csvRows || !currentData.csvRows.length) {
            Toast.info('Gere um relatório primeiro.'); return;
        }
        exportCSV(currentData.csvRows, `relatorio-${currentReport}-${new Date().toISOString().split('T')[0]}.csv`);
        Toast.success('CSV exportado!');
    };

    window.exportarPDF = async function() {
        const area = document.getElementById('reportArea');
        if (!area || !currentReport) { Toast.info('Gere um relatório primeiro.'); return; }

        // Converte todos os canvas em imagens base64 ANTES de clonar o HTML
        const canvasImages = {};
        area.querySelectorAll('canvas').forEach(cv => {
            try {
                canvasImages[cv.id] = cv.toDataURL('image/png');
            } catch(e) { console.warn('canvas export error', e); }
        });

        // Clona o HTML e substitui cada canvas pelo img correspondente
        const clone = area.cloneNode(true);
        clone.querySelectorAll('canvas').forEach(cv => {
            const img = document.createElement('img');
            img.src = canvasImages[cv.id] || '';
            img.style.cssText = `width:100%;max-height:${cv.style.height||'280px'};object-fit:contain;border-radius:8px`;
            cv.parentNode.replaceChild(img, cv);
        });
        // Remove wrappers de altura fixa dos gráficos
        clone.querySelectorAll('[style*="height:280px"],[style*="height:220px"],[style*="height:320px"]').forEach(el => {
            el.style.height = 'auto';
        });

        const reportNames = { vendas:'Vendas', estoque:'Estoque', financeiro:'Financeiro', clientes:'Clientes', compras:'Compras', comissoes:'Comissões', entregas:'Entregas', dre:'DRE', vendedores:'Vendedores', produtos:'Produtos (curva ABC)', horarios:'Horários', caixas:'Fechamentos de caixa', receber:'Contas a receber', consignado:'Consignado', 'comissoes-tipo':'Comissões produtos x serviços', metas:'Metas' };
        const titulo  = reportNames[currentReport] || currentReport;
        const periodo = `${dateFrom.toLocaleDateString('pt-BR')} a ${dateTo.toLocaleDateString('pt-BR')}`;
        const dateStr = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'long',year:'numeric'});

        const win = window.open('', '_blank', 'width=1100,height=800');
        win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Relatório ${titulo} — DistribuiPRO</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:"Segoe UI",Arial,sans-serif;background:#fff;color:#1e293b;font-size:12px}
.page{padding:24px 32px;max-width:1050px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #6366f1}
.header h1{font-size:22px;font-weight:800;color:#1e293b;letter-spacing:-.5px}
.header .sub{font-size:12px;color:#64748b;margin-top:4px}
.empresa{font-size:16px;font-weight:700;color:#6366f1;text-align:right}
.periodo-badge{display:inline-block;background:#ede9fe;color:#7c3aed;padding:3px 10px;border-radius:12px;font-size:11px;font-weight:600;margin-top:6px}
/* Cards e layout */
.card{background:#fff;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:16px}
/* Stats */
[style*="display:grid"][style*="grid-template-columns:repeat(5"]{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-bottom:20px}
[style*="text-align:center"][style*="padding:16px"]{text-align:center;padding:12px;border-radius:10px;background:#f8fafc;border:1px solid #e2e8f0}
/* Gráficos */
img{display:block;width:100%;border-radius:8px;margin:12px 0}
/* Tabelas */
table{width:100%;border-collapse:collapse}
thead tr{background:linear-gradient(135deg,#6366f1,#8b5cf6)}
thead th{color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:9px 10px;text-align:left}
tbody td{padding:8px 10px;border-bottom:1px solid #f1f5f9;font-size:12px;vertical-align:middle}
tbody tr:nth-child(even){background:#f8fafc}
tfoot td{font-weight:800;background:#eef2ff;color:#4f46e5;border-top:2px solid #c7d2fe;padding:8px 10px}
.badge-success,.badge.badge-success{background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
.badge-warning,.badge.badge-warning{background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
.badge-danger,.badge.badge-danger{background:#fee2e2;color:#dc2626;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
.badge-info,.badge.badge-info{background:#e0e7ff;color:#4f46e5;padding:2px 8px;border-radius:12px;font-size:10px;font-weight:700}
h3{font-size:14px;font-weight:700;color:#1e293b;margin-bottom:14px}
.footer{margin-top:20px;padding-top:10px;border-top:1px solid #e2e8f0;display:flex;justify-content:space-between;font-size:10px;color:#94a3b8}
@media print{@page{margin:10mm;size:A4 landscape}#printBtns{display:none !important}.card{page-break-inside:avoid}}
</style></head><body>
<div class="page">
    <div class="header">
        <div>
            <h1>📊 Relatório de ${titulo}</h1>
            <div class="sub">DistribuiPRO ERP — Dados em tempo real</div>
            <div class="periodo-badge">${periodo}</div>
        </div>
        <div>
            <div class="empresa">DistribuiPRO</div>
            <div style="font-size:11px;color:#94a3b8;text-align:right;margin-top:4px">Gerado em ${dateStr}</div>
        </div>
    </div>
    ${clone.innerHTML}
    <div class="footer">
        <div>DistribuiPRO ERP · Relatório de ${titulo} · ${periodo}</div>
        <div>Gerado em ${new Date().toLocaleString('pt-BR')}</div>
    </div>
</div>
<div id="printBtns" style="position:fixed;top:16px;right:16px;display:flex;gap:8px;z-index:9999">
    <button onclick="triggerPrint()" style="background:#6366f1;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">🖨️ Imprimir / Salvar PDF</button>
    <button onclick="window.close()" style="background:#f1f5f9;color:#64748b;border:none;padding:10px 16px;border-radius:8px;font-size:13px;cursor:pointer">✕ Fechar</button>
</div>
<script>
function triggerPrint(){document.getElementById('printBtns').style.display='none';setTimeout(function(){window.print();document.getElementById('printBtns').style.display='flex';},50);}
window.onbeforeprint=function(){document.getElementById('printBtns').style.display='none';};
window.onafterprint=function(){document.getElementById('printBtns').style.display='flex';};
<\/script>
</body></html>`);
        win.document.close();
    };
    window.imprimirRelatorio = function() { window.print(); };

    function loadingArea() {
        const area = document.getElementById('reportArea');
        if (area) area.innerHTML = `<div style="text-align:center;padding:60px;color:var(--text-muted)">
            <i class="fas fa-spinner fa-spin fa-2x"></i>
            <div style="margin-top:16px;font-size:14px">Gerando relatório...</div>
        </div>`;
    }

    // ═══════════════════════════════════════════════════════
    // showReport — roteador principal
    // ═══════════════════════════════════════════════════════
    window.showReport = async function(type) {
        currentReport = type;
        destroyCharts();
        loadingArea();
        // Só rola até o relatório quando a pessoa escolhe um (ao abrir a tela, fica no topo: lista de relatórios e período à vista)
        if (window.__dpRptOpened) document.getElementById('reportArea').scrollIntoView({ behavior: 'smooth', block: 'start' });
        window.__dpRptOpened = true;

        // Destacar card selecionado
        document.querySelectorAll('[onclick*="showReport"]').forEach(el => {
            el.style.borderColor = 'transparent';
            el.style.boxShadow = '';
        });
        const clicked = document.querySelector(`[onclick="showReport('${type}')"]`);
        if (clicked) clicked.style.borderColor = 'var(--accent)';

        try {
            switch(type) {
                case 'vendas':    await rptVendas();    break;
                case 'estoque':   await rptEstoque();   break;
                case 'financeiro':await rptFinanceiro();break;
                case 'clientes':  await rptClientes();  break;
                case 'compras':   await rptCompras();   break;
                case 'comissoes':await rptComissoes(); break;
                case 'entregas':  await rptEntregas();  break;
                case 'dre':       await rptDRE();       break;
                case 'vendedores':await rptVendedores();break;
                case 'produtos':  await rptProdutos();  break;
                case 'horarios':  await rptHorarios();  break;
                case 'caixas':    await rptCaixas();    break;
                case 'receber':   await rptReceber();   break;
                case 'consignado':await rptConsignado();break;
                case 'comissoes-tipo': await rptComissoesTipo(); break;
                case 'metas':     await rptMetas();     break;
            }
        } catch(e) {
            console.error(e);
            document.getElementById('reportArea').innerHTML = `
                <div class="card" style="text-align:center;padding:40px;color:#ef4444">
                    <i class="fas fa-exclamation-circle fa-2x" style="margin-bottom:12px"></i>
                    <div>Erro ao carregar relatório: ${e.message}</div>
                </div>`;
        }
    };

    // ═══════════════════════════════════════════════════════
    // 36.6 · NOVOS RELATÓRIOS: DRE completo, vendedores, produtos (curva ABC), horários,
    //        fechamentos de caixa, contas a receber (inadimplência), consignado, comissões por tipo e metas
    // ═══════════════════════════════════════════════════════
    const rptEsc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    const rptDone = s => ['completed','delivered'].includes(s.status) && !s.deleted;
    const rptDate = v => { if (!v) return null; try { const d = v.toDate ? v.toDate() : (typeof v === 'number' ? new Date(v) : new Date(v.__ts || (v.seconds ? v.seconds * 1000 : v))); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const rptIn = (ts, a, b) => { const d = rptDate(ts); return !!d && d >= a && d <= b; };
    const rptPrevRange = () => { const len = dateTo - dateFrom; return { a: new Date(dateFrom.getTime() - len - 1), b: new Date(dateFrom.getTime() - 1) }; };
    const rptHead = (icon, color, title, sub) => `<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px"><div><h3 style="font-size:17px;font-weight:700;color:var(--text-primary)"><i class="fas ${icon}" style="color:${color};margin-right:8px"></i>${title}</h3>${sub ? `<div style="font-size:12px;color:var(--text-muted);margin-top:3px">${sub}</div>` : ''}</div><span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span></div>`;
    const rptEmpty = (msg, cols) => `<tr><td colspan="${cols || 8}" style="text-align:center;padding:30px;color:var(--text-muted)">${msg}</td></tr>`;
    const rptDelta = (cur, prev) => { if (!prev) return '<span style="color:var(--text-muted);font-size:11px">sem comparação</span>'; const p = (cur - prev) / Math.abs(prev) * 100; const up = p >= 0; return `<span style="color:${up ? '#10b981' : '#ef4444'};font-size:11px;font-weight:700"><i class="fas fa-arrow-${up ? 'up' : 'down'}"></i> ${Math.abs(p).toFixed(0)}% vs. período anterior</span>`; };
    const rptPct = (a, b) => b ? (a / b * 100) : 0;
    const rptItemTotal = i => Number((i.total ?? i.subtotal ?? ((Number(i.quantity) || 0) * (Number(i.unitPrice || i.salePrice) || 0))) || 0);
    const rptIsService = (i, s) => !!(i.isService || s.source === 'service_order' || s.type === 'service_order');
    const rptWpp = (phone, text) => { const d = String(phone || '').replace(/\D/g, ''); return d ? `<a href="https://wa.me/55${d}?text=${encodeURIComponent(text || '')}" target="_blank" class="btn-icon" title="WhatsApp" style="color:#25d366"><i class="fab fa-whatsapp"></i></a>` : ''; };
    const PALETTE = ['#6366f1','#10b981','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4','#84cc16','#64748b'];
    async function rptCostMap() {
        const m = {};
        try { (await simpleList('products','name','asc',10000)).forEach(p => { m[p.id] = { cost: Number(p.costPrice || 0), name: p.name || '—', category: p.category || 'Sem categoria', stock: Number(p.currentStock || 0), price: Number(p.salePrice || 0), type: p.productType || '', deleted: !!p.deleted }; }); } catch (e) { console.warn('produtos:', e.message); }
        return m;
    }
    const rptItemCost = (i, map) => { if (i.isService) return 0; const own = Number(i.costPrice || 0); const unit = own > 0 ? own : Number((map[i.productId] || {}).cost || 0); return (Number(i.quantity) || 0) * (Number(i._factor) || 1) * unit; };

    // ─── DRE completo (com comparação com o período anterior) ───
    async function rptDRE() {
        const [allSales, entries, costMap] = await Promise.all([simpleList('sales','createdAt','desc',5000), simpleList('financial_entries','createdAt','desc',4000), rptCostMap()]);
        const prev = rptPrevRange();
        const calc = (a, b) => {
            const sales = allSales.filter(s => rptDone(s) && rptIn(s.createdAt, a, b));
            const sum = f => sales.reduce((x, s) => x + f(s), 0);
            const discounts = sum(s => Number(s.discount || 0));
            const net = sum(s => Number(s.total || 0));
            const gross = net + discounts;
            const fees = sum(s => Number(s.paymentFeeValue || (s.payments || []).reduce((y, p) => y + Number(p.feeValue || 0), 0) || 0));
            const cmv = sum(s => (s.items || []).reduce((y, i) => y + rptItemCost(i, costMap), 0));
            const prodRev = sum(s => (s.items || []).filter(i => !rptIsService(i, s)).reduce((y, i) => y + rptItemTotal(i), 0));
            const servRev = sum(s => (s.items || []).filter(i => rptIsService(i, s)).reduce((y, i) => y + rptItemTotal(i), 0));
            const delivery = sum(s => Number(s.deliveryFee || 0));
            const commissions = sum(s => Number(s.commissionAmount || 0));
            const exp = entries.filter(e => e.type === 'expense' && e.status === 'paid' && !e.deleted && e.origin !== 'purchase' && rptIn(e.paidAt || e.dueDate || e.createdAt, a, b)); // 38.3 · conta de compra de mercadoria não é despesa: o custo já entra no CMV
            const byCat = {}; exp.forEach(e => { const k = e.category || 'Outros'; byCat[k] = (byCat[k] || 0) + Number(e.amount || 0); });
            const commPaid = Object.keys(byCat).filter(k => /comiss/i.test(k)).reduce((x, k) => x + byCat[k], 0);
            const opex = Math.max(0, exp.reduce((x, e) => x + Number(e.amount || 0), 0) - commPaid);
            const otherInc = entries.filter(e => e.type === 'income' && e.status === 'received' && !e.deleted && !e.referenceType && !e.saleId && !/fiado|credi|venda/i.test(e.category || '') && rptIn(e.paidAt || e.createdAt, a, b)).reduce((x, e) => x + Number(e.amount || 0), 0);
            const grossProfit = net - fees - cmv, operating = grossProfit - opex - commissions, result = operating + otherInc;
            return { n: sales.length, gross, discounts, net, fees, cmv, prodRev, servRev, delivery, commissions, commPaid, opex, byCat, otherInc, grossProfit, operating, result };
        };
        const c = calc(dateFrom, dateTo), p = calc(prev.a, prev.b);
        const pctOf = v => c.net ? (v / c.net * 100).toFixed(1) + '%' : '—';
        const cats = Object.keys(c.byCat).filter(k => !/comiss/i.test(k)).sort((a, b) => c.byCat[b] - c.byCat[a]);
        currentData.csvRows = [['Linha', 'Período atual', '% da receita', 'Período anterior'],
            ['Receita bruta de vendas', c.gross.toFixed(2), '', p.gross.toFixed(2)], ['(-) Descontos concedidos', c.discounts.toFixed(2), '', p.discounts.toFixed(2)], ['= Receita líquida', c.net.toFixed(2), '100%', p.net.toFixed(2)],
            ['   Produtos', c.prodRev.toFixed(2), pctOf(c.prodRev), p.prodRev.toFixed(2)], ['   Serviços', c.servRev.toFixed(2), pctOf(c.servRev), p.servRev.toFixed(2)], ['   Taxas de entrega', c.delivery.toFixed(2), pctOf(c.delivery), p.delivery.toFixed(2)],
            ['(-) Taxas de cartão/operadora', c.fees.toFixed(2), pctOf(c.fees), p.fees.toFixed(2)], ['(-) CMV (custo das mercadorias vendidas)', c.cmv.toFixed(2), pctOf(c.cmv), p.cmv.toFixed(2)], ['= Lucro bruto', c.grossProfit.toFixed(2), pctOf(c.grossProfit), p.grossProfit.toFixed(2)],
            ...cats.map(k => ['(-) ' + k, c.byCat[k].toFixed(2), pctOf(c.byCat[k]), (p.byCat[k] || 0).toFixed(2)]),
            ['(-) Comissões de vendedores', c.commissions.toFixed(2), pctOf(c.commissions), p.commissions.toFixed(2)], ['= Resultado operacional', c.operating.toFixed(2), pctOf(c.operating), p.operating.toFixed(2)],
            ['(+) Outras receitas', c.otherInc.toFixed(2), pctOf(c.otherInc), p.otherInc.toFixed(2)], ['= RESULTADO LÍQUIDO', c.result.toFixed(2), pctOf(c.result), p.result.toFixed(2)]];
        const line = (label, v, pv, opt = {}) => `<div style="display:grid;grid-template-columns:1fr auto auto auto;gap:14px;align-items:center;padding:${opt.total ? '11px 14px' : '7px 14px'};border-radius:8px;${opt.total ? `background:${v >= 0 ? 'rgba(16,185,129,.1)' : 'rgba(239,68,68,.1)'};font-weight:800;font-size:${opt.big ? '15px' : '13px'};margin-top:4px` : opt.sub ? 'font-size:12px;color:var(--text-muted);padding-left:28px' : 'font-size:13px'}${opt.neg ? ';color:var(--text-secondary)' : ''}">
            <span>${label}</span><strong style="color:${opt.total ? (v >= 0 ? '#10b981' : '#ef4444') : opt.neg ? '#ef4444' : 'var(--text-primary)'};min-width:110px;text-align:right">${opt.neg && v ? '- ' : ''}${fmtCurrency(Math.abs(v))}</strong><span style="font-size:11px;color:var(--text-muted);min-width:46px;text-align:right">${pctOf(v)}</span><span style="font-size:11px;color:var(--text-muted);min-width:100px;text-align:right" title="Período anterior">${fmtCurrency(pv)}</span></div>`;
        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            ${rptHead('fa-file-invoice-dollar', '#10b981', 'DRE — Demonstrativo de Resultado', 'Receita, custo das mercadorias (CMV), despesas pagas e resultado do período, comparado com o período anterior de mesmo tamanho')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px;margin-bottom:20px">
                <div style="text-align:center;padding:16px;border-radius:12px;background:var(--bg-secondary)"><div style="font-size:11px;color:var(--text-muted)">Receita líquida</div><div style="font-size:18px;font-weight:800;color:#3b82f6">${fmtCurrency(c.net)}</div>${rptDelta(c.net, p.net)}</div>
                <div style="text-align:center;padding:16px;border-radius:12px;background:var(--bg-secondary)"><div style="font-size:11px;color:var(--text-muted)">Lucro bruto · margem</div><div style="font-size:18px;font-weight:800;color:${c.grossProfit >= 0 ? '#10b981' : '#ef4444'}">${fmtCurrency(c.grossProfit)} <small style="font-size:12px">${pctOf(c.grossProfit)}</small></div>${rptDelta(c.grossProfit, p.grossProfit)}</div>
                <div style="text-align:center;padding:16px;border-radius:12px;background:var(--bg-secondary)"><div style="font-size:11px;color:var(--text-muted)">Despesas + comissões</div><div style="font-size:18px;font-weight:800;color:#ef4444">${fmtCurrency(c.opex + c.commissions)}</div>${rptDelta(c.opex + c.commissions, p.opex + p.commissions)}</div>
                <div style="text-align:center;padding:16px;border-radius:12px;background:var(--bg-secondary)"><div style="font-size:11px;color:var(--text-muted)">Resultado líquido · margem</div><div style="font-size:18px;font-weight:800;color:${c.result >= 0 ? '#10b981' : '#ef4444'}">${fmtCurrency(c.result)} <small style="font-size:12px">${pctOf(c.result)}</small></div>${rptDelta(c.result, p.result)}</div>
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,.7fr);gap:20px">
                <div>
                    <div style="display:grid;grid-template-columns:1fr auto auto auto;gap:14px;padding:0 14px 6px;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px"><span>Linha</span><span style="min-width:110px;text-align:right">Período</span><span style="min-width:46px;text-align:right">% rec.</span><span style="min-width:100px;text-align:right">Anterior</span></div>
                    ${line('Receita bruta de vendas (antes dos descontos)', c.gross, p.gross)}
                    ${line('(−) Descontos concedidos', c.discounts, p.discounts, { neg: true })}
                    ${line('= Receita líquida de vendas', c.net, p.net, { total: true })}
                    ${line('Produtos', c.prodRev, p.prodRev, { sub: true })}
                    ${line('Serviços / OS', c.servRev, p.servRev, { sub: true })}
                    ${c.delivery || p.delivery ? line('Taxas de entrega', c.delivery, p.delivery, { sub: true }) : ''}
                    ${line('(−) Taxas de cartão / operadora', c.fees, p.fees, { neg: true })}
                    ${line('(−) CMV — custo das mercadorias vendidas', c.cmv, p.cmv, { neg: true })}
                    ${line('= Lucro bruto', c.grossProfit, p.grossProfit, { total: true })}
                    ${cats.length ? cats.map(k => line('(−) ' + rptEsc(k), c.byCat[k], p.byCat[k] || 0, { neg: true })).join('') : line('(−) Despesas pagas no período', 0, p.opex, { neg: true })}
                    ${line('(−) Comissões de vendedores (geradas nas vendas)', c.commissions, p.commissions, { neg: true })}
                    ${line('= Resultado operacional', c.operating, p.operating, { total: true })}
                    ${line('(+) Outras receitas (lançamentos avulsos recebidos)', c.otherInc, p.otherInc)}
                    ${line('= RESULTADO LÍQUIDO', c.result, p.result, { total: true, big: true })}
                    <div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.5"><i class="fas fa-circle-info" style="margin-right:4px"></i>Vendas concluídas/entregues no período (PDV, OS faturadas, consignado). CMV usa o custo registrado em cada item (ou o custo do cadastro). Despesas = contas a pagar <b>pagas</b> no período; contas da categoria "Comissões" (${fmtCurrency(c.commPaid)}) não entram para não contar duas vezes com as comissões geradas nas vendas.</div>
                </div>
                <div>
                    <div style="height:220px;margin-bottom:16px"><canvas id="chartDre"></canvas></div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Indicadores</h4>
                    <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
                        ${[['Vendas no período', c.n + ' (' + fmtCurrency(c.n ? c.net / c.n : 0) + ' por venda)'], ['Margem bruta', pctOf(c.grossProfit)], ['Margem líquida', pctOf(c.result)], ['CMV sobre a receita', pctOf(c.cmv)], ['Despesas sobre a receita', pctOf(c.opex + c.commissions)], ['Ponto de equilíbrio (receita p/ zerar)', c.net && c.grossProfit > 0 ? fmtCurrency((c.opex + c.commissions - c.otherInc) / (c.grossProfit / c.net)) : '—']].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:8px 12px;background:var(--bg-secondary);border-radius:8px"><span style="color:var(--text-muted)">${k}</span><strong>${v}</strong></div>`).join('')}
                    </div>
                </div>
            </div>
        </div>`;
        const ctx = document.getElementById('chartDre');
        if (ctx) activeChart1 = new Chart(ctx, { type: 'bar', data: { labels: ['Receita', 'CMV', 'Despesas', 'Resultado'], datasets: [
            { label: 'Período', data: [c.net, c.cmv, c.opex + c.commissions, c.result], backgroundColor: ['#3b82f6', '#f59e0b', '#ef4444', c.result >= 0 ? '#10b981' : '#ef4444'], borderRadius: 6 },
            { label: 'Anterior', data: [p.net, p.cmv, p.opex + p.commissions, p.result], backgroundColor: 'rgba(148,163,184,.35)', borderRadius: 6 }
        ] }, options: { ...chartDefaults(), plugins: { legend: { display: true, labels: { color: '#94a3b8', font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }, y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } } } } });
    }

    // ─── Vendas por vendedor ───
    async function rptVendedores() {
        const [allSales, users, costMap] = await Promise.all([simpleList('sales','createdAt','desc',5000), simpleList('users','name','asc',1000), rptCostMap()]);
        const sales = allSales.filter(s => rptDone(s) && inRange(s.createdAt));
        const g = {};
        sales.forEach(s => {
            const id = s.sellerId || s.operatorId || 'sem'; const u = users.find(x => x.id === id) || {};
            if (!g[id]) g[id] = { id, name: s.sellerName || s.operatorName || u.name || 'Sem vendedor', n: 0, total: 0, items: 0, prod: 0, serv: 0, cost: 0, comm: 0, cust: new Set(), days: new Set(), disc: 0 };
            const x = g[id]; x.n++; x.total += Number(s.total || 0); x.disc += Number(s.discount || 0); x.comm += Number(s.commissionAmount || 0);
            (s.items || []).forEach(i => { x.items += Number(i.quantity || 0); if (rptIsService(i, s)) x.serv += rptItemTotal(i); else x.prod += rptItemTotal(i); x.cost += rptItemCost(i, costMap); });
            if (s.customerId) x.cust.add(s.customerId); const d = rptDate(s.createdAt); if (d) x.days.add(d.toDateString());
        });
        const rows = Object.values(g).sort((a, b) => b.total - a.total); const total = rows.reduce((a, r) => a + r.total, 0);
        currentData.csvRows = [['Vendedor','Vendas','Faturamento','% do total','Ticket médio','Itens','Produtos','Serviços','Lucro bruto','Margem %','Clientes','Dias com venda','Comissão'], ...rows.map(r => [r.name, r.n, r.total.toFixed(2), rptPct(r.total, total).toFixed(1) + '%', (r.n ? r.total / r.n : 0).toFixed(2), r.items, r.prod.toFixed(2), r.serv.toFixed(2), (r.total - r.cost).toFixed(2), (r.total ? (r.total - r.cost) / r.total * 100 : 0).toFixed(1) + '%', r.cust.size, r.days.size, r.comm.toFixed(2)])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-user-tie', '#6366f1', 'Vendas por vendedor', 'Ranking de faturamento, ticket médio, lucro bruto e comissão por vendedor / técnico')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Vendedores', rows.length)}${miniStat('Vendas', sales.length)}${miniStat('Faturamento', fmtCurrency(total), '#10b981')}${miniStat('Ticket médio', fmtCurrency(sales.length ? total / sales.length : 0), '#3b82f6')}${miniStat('Comissões geradas', fmtCurrency(rows.reduce((a, r) => a + r.comm, 0)), '#8b5cf6')}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:20px">
                <div class="table-container"><table class="data-table"><thead><tr><th>#</th><th>Vendedor</th><th>Vendas</th><th>Faturamento</th><th>%</th><th>Ticket</th><th>Produtos</th><th>Serviços</th><th>Lucro bruto</th><th>Margem</th><th>Clientes</th><th>Comissão</th></tr></thead><tbody>
                    ${rows.length ? rows.map((r, i) => { const lp = r.total - r.cost, m = r.total ? lp / r.total * 100 : 0; return `<tr><td>${['#f5b301', '#94a3b8', '#c27a3d'][i] ? `<span title="${i + 1}º lugar" style="color:${['#f5b301', '#94a3b8', '#c27a3d'][i]};font-size:16px;display:inline-flex"><i class="fas fa-medal"></i></span>` : (i + 1)}</td><td><strong>${rptEsc(r.name)}</strong><div style="font-size:11px;color:var(--text-muted)">${r.days.size} dia(s) com venda</div></td><td>${r.n}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(r.total)}</td><td>${rptPct(r.total, total).toFixed(0)}%</td><td>${fmtCurrency(r.n ? r.total / r.n : 0)}</td><td>${fmtCurrency(r.prod)}</td><td>${r.serv ? fmtCurrency(r.serv) : '—'}</td><td style="color:${lp >= 0 ? '#10b981' : '#ef4444'}">${fmtCurrency(lp)}</td><td><span class="badge ${m >= 30 ? 'badge-success' : m >= 15 ? 'badge-warning' : 'badge-danger'}">${m.toFixed(0)}%</span></td><td>${r.cust.size}</td><td style="color:#8b5cf6;font-weight:600">${r.comm ? fmtCurrency(r.comm) : '—'}</td></tr>`; }).join('') : rptEmpty('Nenhuma venda no período', 12)}
                </tbody></table></div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Participação no faturamento</h4><div style="height:300px"><canvas id="chartVend"></canvas></div></div>
            </div></div>`;
        const ctx = document.getElementById('chartVend');
        if (ctx && rows.length) activeChart1 = new Chart(ctx, { type: 'bar', data: { labels: rows.slice(0, 12).map(r => r.name), datasets: [{ label: 'Faturamento', data: rows.slice(0, 12).map(r => r.total), backgroundColor: PALETTE, borderRadius: 6 }] }, options: { ...chartDefaults(), indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } }, y: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } } } } });
    }

    // ─── Produtos: curva ABC, lucro por produto e por categoria, parados ───
    async function rptProdutos() {
        const [allSales, costMap] = await Promise.all([simpleList('sales','createdAt','desc',5000), rptCostMap()]);
        const sales = allSales.filter(s => rptDone(s) && inRange(s.createdAt));
        const map = {};
        sales.forEach(s => (s.items || []).forEach(i => { if (rptIsService(i, s)) return; const k = i.productId || i.productName || '?'; const p = costMap[i.productId] || {}; if (!map[k]) map[k] = { id: i.productId, name: p.name || i.productName || '—', category: p.category || 'Sem categoria', qty: 0, rev: 0, cost: 0, n: 0, stock: p.stock }; const m = map[k]; m.qty += (Number(i.quantity) || 0) * (Number(i._factor) || 1); m.rev += rptItemTotal(i); m.cost += rptItemCost(i, costMap); m.n++; }));
        const rows = Object.values(map).sort((a, b) => b.rev - a.rev); const total = rows.reduce((a, r) => a + r.rev, 0);
        let acc = 0; rows.forEach(r => { acc += r.rev; r.share = rptPct(r.rev, total); r.cum = rptPct(acc, total); r.cls = r.cum <= 80 ? 'A' : r.cum <= 95 ? 'B' : 'C'; });
        const byCat = {}; rows.forEach(r => { if (!byCat[r.category]) byCat[r.category] = { rev: 0, cost: 0, qty: 0, n: 0 }; byCat[r.category].rev += r.rev; byCat[r.category].cost += r.cost; byCat[r.category].qty += r.qty; byCat[r.category].n++; });
        const cats = Object.keys(byCat).sort((a, b) => byCat[b].rev - byCat[a].rev);
        const soldIds = new Set(rows.map(r => r.id)); const idle = Object.keys(costMap).filter(id => !soldIds.has(id) && !costMap[id].deleted && costMap[id].type !== 'service' && costMap[id].stock > 0).map(id => ({ id, ...costMap[id], value: costMap[id].stock * costMap[id].cost })).sort((a, b) => b.value - a.value);
        const cnt = c => rows.filter(r => r.cls === c).length;
        currentData.csvRows = [['Classe','Produto','Categoria','Qtd vendida','Faturamento','% do total','% acumulado','Custo','Lucro bruto','Margem %','Vendas','Estoque atual'], ...rows.map(r => [r.cls, r.name, r.category, r.qty, r.rev.toFixed(2), r.share.toFixed(1) + '%', r.cum.toFixed(1) + '%', r.cost.toFixed(2), (r.rev - r.cost).toFixed(2), (r.rev ? (r.rev - r.cost) / r.rev * 100 : 0).toFixed(1) + '%', r.n, r.stock ?? ''])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-boxes-stacked', '#f97316', 'Produtos — curva ABC e lucro', 'Classe A: produtos que fazem 80% do faturamento · B: os 15% seguintes · C: os 5% finais')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Produtos vendidos', rows.length)}${miniStat('Classe A', cnt('A') + ' produto(s)', '#10b981')}${miniStat('Classe B', cnt('B'), '#f59e0b')}${miniStat('Classe C', cnt('C'), '#ef4444')}${miniStat('Faturamento (produtos)', fmtCurrency(total), '#3b82f6')}${miniStat('Lucro bruto', fmtCurrency(rows.reduce((a, r) => a + r.rev - r.cost, 0)), '#10b981')}${miniStat('Parados c/ estoque', idle.length + ' · ' + fmtCurrency(idle.reduce((a, r) => a + r.value, 0)), '#64748b')}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:20px;margin-bottom:20px">
                <div class="table-container"><table class="data-table"><thead><tr><th>Classe</th><th>Produto</th><th>Categoria</th><th>Qtd</th><th>Faturamento</th><th>%</th><th>Acum.</th><th>Lucro bruto</th><th>Margem</th><th>Estoque</th></tr></thead><tbody>
                    ${rows.length ? rows.slice(0, 80).map(r => { const lp = r.rev - r.cost, m = r.rev ? lp / r.rev * 100 : 0; return `<tr><td><span class="badge ${r.cls === 'A' ? 'badge-success' : r.cls === 'B' ? 'badge-warning' : 'badge-danger'}" style="font-weight:800">${r.cls}</span></td><td><strong>${rptEsc(r.name)}</strong></td><td style="font-size:12px;color:var(--text-muted)">${rptEsc(r.category)}</td><td>${r.qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(r.rev)}</td><td>${r.share.toFixed(1)}%</td><td style="color:var(--text-muted)">${r.cum.toFixed(0)}%</td><td style="color:${lp >= 0 ? '#10b981' : '#ef4444'}">${fmtCurrency(lp)}</td><td><span class="badge ${m >= 30 ? 'badge-success' : m >= 15 ? 'badge-warning' : 'badge-danger'}">${m.toFixed(0)}%</span></td><td>${r.stock != null ? r.stock : '—'}</td></tr>`; }).join('') : rptEmpty('Nenhum produto vendido no período', 10)}
                </tbody></table>${rows.length > 80 ? `<div style="font-size:11px;color:var(--text-muted);padding:8px">Mostrando 80 de ${rows.length} — o CSV traz todos.</div>` : ''}</div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Faturamento por categoria</h4>${cats.length ? '<div style="height:240px"><canvas id="chartCat"></canvas></div>' : '<div style="text-align:center;padding:30px;color:var(--text-muted)">Sem dados</div>'}
                    <div class="table-container" style="margin-top:12px"><table class="data-table" style="font-size:12px"><thead><tr><th>Categoria</th><th>Fat.</th><th>Margem</th></tr></thead><tbody>${cats.map(k => { const c = byCat[k], m = c.rev ? (c.rev - c.cost) / c.rev * 100 : 0; return `<tr><td>${rptEsc(k)}</td><td>${fmtCurrency(c.rev)}</td><td>${m.toFixed(0)}%</td></tr>`; }).join('')}</tbody></table></div></div>
            </div>
            ${idle.length ? `<h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)"><i class="fas fa-box-archive" style="color:#64748b;margin-right:6px"></i>Produtos parados (com estoque e sem venda no período)</h4><div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Produto</th><th>Categoria</th><th>Estoque</th><th>Custo unit.</th><th>Dinheiro parado</th></tr></thead><tbody>${idle.slice(0, 30).map(r => `<tr><td>${rptEsc(r.name)}</td><td style="color:var(--text-muted)">${rptEsc(r.category)}</td><td>${r.stock}</td><td>${fmtCurrency(r.cost)}</td><td style="font-weight:600">${fmtCurrency(r.value)}</td></tr>`).join('')}</tbody></table>${idle.length > 30 ? `<div style="font-size:11px;color:var(--text-muted);padding:8px">Mostrando 30 de ${idle.length}.</div>` : ''}</div>` : ''}
        </div>`;
        const ctx = document.getElementById('chartCat');
        if (ctx && cats.length) activeChart1 = new Chart(ctx, { type: 'doughnut', data: { labels: cats.slice(0, 9), datasets: [{ data: cats.slice(0, 9).map(k => byCat[k].rev), backgroundColor: PALETTE, borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, padding: 8, usePointStyle: true, boxWidth: 8 } } } } });
    }

    // ─── Horários e dias da semana ───
    async function rptHorarios() {
        const allSales = await simpleList('sales','createdAt','desc',5000);
        const sales = allSales.filter(s => rptDone(s) && inRange(s.createdAt));
        const hours = Array.from({ length: 24 }, () => ({ n: 0, v: 0 })), wd = Array.from({ length: 7 }, () => ({ n: 0, v: 0, days: new Set() }));
        sales.forEach(s => { const d = rptDate(s.createdAt); if (!d) return; const t = Number(s.total || 0); hours[d.getHours()].n++; hours[d.getHours()].v += t; wd[d.getDay()].n++; wd[d.getDay()].v += t; wd[d.getDay()].days.add(d.toDateString()); });
        const DN = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
        const bestH = hours.reduce((b, h, i) => h.v > hours[b].v ? i : b, 0), bestD = wd.reduce((b, d, i) => (d.days.size ? d.v / d.days.size : 0) > (wd[b].days.size ? wd[b].v / wd[b].days.size : 0) ? i : b, 0);
        const active = hours.map((h, i) => ({ i, ...h })).filter(h => h.n > 0);
        const first = active.length ? active[0].i : 0, last = active.length ? active[active.length - 1].i : 23;
        const dead = hours.slice(first, last + 1).map((h, i) => ({ i: i + first, ...h })).filter(h => h.n === 0).map(h => String(h.i).padStart(2, '0') + 'h');
        currentData.csvRows = [['Hora', 'Vendas', 'Faturamento', 'Ticket'], ...hours.map((h, i) => [String(i).padStart(2, '0') + 'h', h.n, h.v.toFixed(2), (h.n ? h.v / h.n : 0).toFixed(2)]), [], ['Dia da semana', 'Vendas', 'Faturamento', 'Média por dia'], ...wd.map((d, i) => [DN[i], d.n, d.v.toFixed(2), (d.days.size ? d.v / d.days.size : 0).toFixed(2)])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-clock', '#ec4899', 'Horários e dias da semana', 'Quando a loja mais vende — para escala de equipe, horário de funcionamento e promoções')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Horário de pico', sales.length ? String(bestH).padStart(2, '0') + 'h às ' + String((bestH + 1) % 24).padStart(2, '0') + 'h' : '—', '#ec4899')}${miniStat('Melhor dia (média)', sales.length ? DN[bestD] : '—', '#10b981')}${miniStat('Faturamento no pico', fmtCurrency(hours[bestH].v), '#3b82f6')}${miniStat('Horas sem venda (no expediente)', dead.length ? dead.join(', ') : 'nenhuma', '#64748b')}${miniStat('Vendas', sales.length)}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px">
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Faturamento por hora</h4><div style="height:240px"><canvas id="chartHora"></canvas></div></div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Média de faturamento por dia da semana</h4><div style="height:240px"><canvas id="chartDia"></canvas></div></div>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
                <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Hora</th><th>Vendas</th><th>Faturamento</th><th>Ticket</th><th>%</th></tr></thead><tbody>${hours.map((h, i) => h.n ? `<tr${i === bestH ? ' style="background:rgba(236,72,153,.08)"' : ''}><td><strong>${String(i).padStart(2, '0')}h</strong></td><td>${h.n}</td><td style="font-weight:600">${fmtCurrency(h.v)}</td><td>${fmtCurrency(h.v / h.n)}</td><td>${rptPct(h.v, sales.reduce((a, s) => a + Number(s.total || 0), 0)).toFixed(0)}%</td></tr>` : '').join('') || rptEmpty('Sem vendas', 5)}</tbody></table></div>
                <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Dia</th><th>Dias c/ venda</th><th>Vendas</th><th>Faturamento</th><th>Média/dia</th></tr></thead><tbody>${wd.map((d, i) => `<tr${i === bestD && d.n ? ' style="background:rgba(16,185,129,.08)"' : ''}><td><strong>${DN[i]}</strong></td><td>${d.days.size}</td><td>${d.n}</td><td style="font-weight:600">${fmtCurrency(d.v)}</td><td>${fmtCurrency(d.days.size ? d.v / d.days.size : 0)}</td></tr>`).join('')}</tbody></table></div>
            </div></div>`;
        const c1 = document.getElementById('chartHora');
        if (c1) activeChart1 = new Chart(c1, { type: 'bar', data: { labels: hours.map((h, i) => String(i).padStart(2, '0') + 'h'), datasets: [{ label: 'Faturamento', data: hours.map(h => h.v), backgroundColor: hours.map((h, i) => i === bestH ? '#ec4899' : 'rgba(99,102,241,.7)'), borderRadius: 4 }] }, options: { ...chartDefaults(), plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } } } } });
        const c2 = document.getElementById('chartDia');
        if (c2) activeChart2 = new Chart(c2, { type: 'bar', data: { labels: DN.map(d => d.slice(0, 3)), datasets: [{ label: 'Média por dia', data: wd.map(d => d.days.size ? d.v / d.days.size : 0), backgroundColor: wd.map((d, i) => i === bestD ? '#10b981' : 'rgba(59,130,246,.7)'), borderRadius: 6 }] }, options: { ...chartDefaults(), plugins: { legend: { display: false } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 11 } } }, y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } } } } });
    }

    // ─── Fechamentos de caixa ───
    async function rptCaixas() {
        const regs = (await simpleList('cash_registers','openedAt','desc',2000)).filter(r => r.status === 'closed' && inRange(r.closedAt || r.openedAt)).sort((a, b) => (rptDate(b.closedAt) || 0) - (rptDate(a.closedAt) || 0));
        const num = v => Number(v) || 0;
        const T = { sales: 0, cash: 0, pix: 0, credit: 0, debit: 0, fiado: 0, supply: 0, withdraw: 0, diff: 0, over: 0, short: 0 };
        regs.forEach(r => { T.sales += num(r.totalSales); T.cash += num(r.totalCash); T.pix += num(r.totalPix); T.credit += num(r.totalCredit); T.debit += num(r.totalDebit); T.fiado += num(r.totalFiado); T.supply += num(r.totalSupply); T.withdraw += num(r.totalWithdraw); T.diff += num(r.difference); if (num(r.difference) > 0.004) T.over += num(r.difference); if (num(r.difference) < -0.004) T.short += -num(r.difference); });
        const withDiff = regs.filter(r => Math.abs(num(r.difference)) > 0.004);
        const shift = s => ({ morning: 'Manhã', afternoon: 'Tarde', night: 'Noite' }[s] || s || '—');
        currentData.csvRows = [['Abertura','Fechamento','Operador','Turno','Inicial','Dinheiro','PIX','Crédito','Débito','Fiado','Total vendas','Suprimentos','Sangrias','Esperado','Contado','Diferença','Obs.'], ...regs.map(r => [fmtDateTime(r.openedAt), fmtDateTime(r.closedAt), r.operatorName || '', shift(r.shift), num(r.initialAmount).toFixed(2), num(r.totalCash).toFixed(2), num(r.totalPix).toFixed(2), num(r.totalCredit).toFixed(2), num(r.totalDebit).toFixed(2), num(r.totalFiado).toFixed(2), num(r.totalSales).toFixed(2), num(r.totalSupply).toFixed(2), num(r.totalWithdraw).toFixed(2), num(r.expectedAmount).toFixed(2), num(r.actualAmount).toFixed(2), num(r.difference).toFixed(2), r.notes || ''])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-vault', '#06b6d4', 'Fechamentos de caixa', 'Cada caixa fechado no período, com vendas por forma de pagamento, sangrias, suprimentos e diferença na conferência')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Caixas fechados', regs.length)}${miniStat('Total de vendas', fmtCurrency(T.sales), '#10b981')}${miniStat('Em dinheiro', fmtCurrency(T.cash), '#10b981')}${miniStat('Sangrias', fmtCurrency(T.withdraw), '#ef4444')}${miniStat('Sobras', fmtCurrency(T.over), '#10b981')}${miniStat('Faltas', fmtCurrency(T.short), '#ef4444')}${miniStat('Caixas com diferença', withDiff.length, withDiff.length ? '#f59e0b' : '#10b981')}
            </div>
            <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Abertura</th><th>Fechamento</th><th>Operador</th><th>Turno</th><th>Inicial</th><th>Dinheiro</th><th>PIX</th><th>Cartões</th><th>Fiado</th><th>Vendas</th><th>Supr.</th><th>Sangria</th><th>Esperado</th><th>Contado</th><th>Diferença</th><th></th></tr></thead><tbody>
                ${regs.length ? regs.map(r => { const d = num(r.difference); return `<tr><td>${fmtDateTime(r.openedAt)}</td><td>${fmtDateTime(r.closedAt)}</td><td><strong>${rptEsc(r.operatorName || '—')}</strong></td><td>${shift(r.shift)}</td><td>${fmtCurrency(r.initialAmount)}</td><td>${fmtCurrency(r.totalCash)}</td><td>${fmtCurrency(r.totalPix)}</td><td>${fmtCurrency(num(r.totalCredit) + num(r.totalDebit))}</td><td>${num(r.totalFiado) ? fmtCurrency(r.totalFiado) : '—'}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(r.totalSales)}</td><td>${num(r.totalSupply) ? fmtCurrency(r.totalSupply) : '—'}</td><td>${num(r.totalWithdraw) ? fmtCurrency(r.totalWithdraw) : '—'}</td><td>${fmtCurrency(r.expectedAmount)}</td><td>${fmtCurrency(r.actualAmount)}</td><td><span class="badge ${Math.abs(d) < 0.005 ? 'badge-success' : d > 0 ? 'badge-info' : 'badge-danger'}">${Math.abs(d) < 0.005 ? 'OK' : (d > 0 ? '+' : '') + fmtCurrency(d)}</span>${r.notes ? `<div style="font-size:10px;color:var(--text-muted)">${rptEsc(r.notes)}</div>` : ''}</td><td><a class="btn-icon" title="Imprimir fechamento" href="caixa.html?imprimir=${encodeURIComponent(r.id)}" target="_blank"><i class="fas fa-print"></i></a></td></tr>`; }).join('') : rptEmpty('Nenhum caixa fechado no período', 16)}
            </tbody>${regs.length ? `<tfoot><tr style="font-weight:800;background:var(--bg-secondary)"><td colspan="5">TOTAL (${regs.length})</td><td>${fmtCurrency(T.cash)}</td><td>${fmtCurrency(T.pix)}</td><td>${fmtCurrency(T.credit + T.debit)}</td><td>${fmtCurrency(T.fiado)}</td><td style="color:#10b981">${fmtCurrency(T.sales)}</td><td>${fmtCurrency(T.supply)}</td><td>${fmtCurrency(T.withdraw)}</td><td></td><td></td><td style="color:${T.diff >= 0 ? '#10b981' : '#ef4444'}">${fmtCurrency(T.diff)}</td><td></td></tr></tfoot>` : ''}</table></div>
            <div style="height:200px;margin-top:20px"><canvas id="chartCaixas"></canvas></div>
        </div>`;
        const ctx = document.getElementById('chartCaixas');
        if (ctx && regs.length) { const rev = regs.slice().reverse().slice(-40); activeChart1 = new Chart(ctx, { type: 'bar', data: { labels: rev.map(r => fmtDate(r.closedAt)), datasets: [{ label: 'Vendas', data: rev.map(r => num(r.totalSales)), backgroundColor: 'rgba(6,182,212,.7)', borderRadius: 4, yAxisID: 'y' }, { label: 'Diferença', data: rev.map(r => num(r.difference)), type: 'line', borderColor: '#ef4444', backgroundColor: '#ef4444', pointRadius: 3, yAxisID: 'y1' }] }, options: { ...chartDefaults(), plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } }, y1: { position: 'right', grid: { display: false }, ticks: { color: '#ef4444', font: { size: 10 } } } } } }); }
    }

    // ─── Contas a receber: aging / inadimplência por cliente ───
    async function rptReceber() {
        const all = (await simpleList('financial_entries','dueDate','asc',5000)).filter(e => e.type === 'income' && !e.deleted);
        const pend = all.filter(e => e.status === 'pending'), today = new Date(); today.setHours(0, 0, 0, 0);
        const recv = all.filter(e => e.status === 'received' && inRange(e.paidAt || e.createdAt));
        const B = ['A vencer', '1-30 dias', '31-60 dias', '61-90 dias', '+90 dias'];
        const bucket = e => { const d = rptDate(e.dueDate); if (!d) return 0; const days = Math.floor((today - d) / 864e5); return days <= 0 ? 0 : days <= 30 ? 1 : days <= 60 ? 2 : days <= 90 ? 3 : 4; };
        const byC = {}; const tot = [0, 0, 0, 0, 0];
        pend.forEach(e => { const k = e.customerId || e.customerName || e.debtorName || '?'; if (!byC[k]) byC[k] = { name: e.customerName || e.debtorName || 'Sem nome', phone: e.debtorPhone || e.customerPhone || '', b: [0, 0, 0, 0, 0], n: 0, oldest: null }; const c = byC[k]; const bi = bucket(e); c.b[bi] += Number(e.amount || 0); tot[bi] += Number(e.amount || 0); c.n++; const d = rptDate(e.dueDate); if (d && (!c.oldest || d < c.oldest)) c.oldest = d; });
        const rows = Object.values(byC).map(c => ({ ...c, total: c.b.reduce((a, v) => a + v, 0), overdue: c.b.slice(1).reduce((a, v) => a + v, 0) })).sort((a, b) => b.overdue - a.overdue || b.total - a.total);
        const total = tot.reduce((a, v) => a + v, 0), overdue = tot.slice(1).reduce((a, v) => a + v, 0);
        const recvTotal = recv.reduce((a, e) => a + Number(e.amount || 0), 0);
        currentData.csvRows = [['Cliente','Telefone','Contas','A vencer','1-30 dias','31-60 dias','61-90 dias','+90 dias','Total','Vencido','Mais antiga'], ...rows.map(r => [r.name, r.phone, r.n, ...r.b.map(v => v.toFixed(2)), r.total.toFixed(2), r.overdue.toFixed(2), r.oldest ? r.oldest.toLocaleDateString('pt-BR') : ''])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-hand-holding-dollar', '#ef4444', 'Contas a receber — inadimplência', 'Tudo que está pendente hoje, por cliente e por tempo de atraso (fiado, crediário e cobranças). Recebido no período: ' + fmtCurrency(recvTotal))}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Total a receber', fmtCurrency(total), '#3b82f6')}${miniStat('Vencido', fmtCurrency(overdue), '#ef4444')}${miniStat('Inadimplência', (total ? rptPct(overdue, total).toFixed(0) : 0) + '%', overdue ? '#ef4444' : '#10b981')}${miniStat('Clientes devendo', rows.length)}${miniStat('Contas pendentes', pend.length)}${miniStat('Recebido no período', fmtCurrency(recvTotal), '#10b981')}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(240px,.6fr);gap:20px">
                <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Cliente</th><th>Contas</th><th>A vencer</th><th>1-30</th><th>31-60</th><th>61-90</th><th>+90</th><th>Total</th><th>Mais antiga</th><th></th></tr></thead><tbody>
                    ${rows.length ? rows.slice(0, 150).map(r => `<tr><td><strong>${rptEsc(r.name)}</strong>${r.phone ? `<div style="font-size:11px;color:var(--text-muted)">${rptEsc(r.phone)}</div>` : ''}</td><td>${r.n}</td><td>${r.b[0] ? fmtCurrency(r.b[0]) : '—'}</td><td style="color:#f59e0b">${r.b[1] ? fmtCurrency(r.b[1]) : '—'}</td><td style="color:#f97316">${r.b[2] ? fmtCurrency(r.b[2]) : '—'}</td><td style="color:#ef4444">${r.b[3] ? fmtCurrency(r.b[3]) : '—'}</td><td style="color:#b91c1c;font-weight:700">${r.b[4] ? fmtCurrency(r.b[4]) : '—'}</td><td style="font-weight:800">${fmtCurrency(r.total)}</td><td style="color:${r.overdue ? '#ef4444' : 'var(--text-muted)'}">${r.oldest ? r.oldest.toLocaleDateString('pt-BR') : '—'}</td><td>${rptWpp(r.phone, `Olá ${r.name}! Passando para lembrar que há ${fmtCurrency(r.total)} em aberto conosco${r.overdue ? ' (' + fmtCurrency(r.overdue) + ' já vencido)' : ''}. Podemos combinar o pagamento?`)}</td></tr>`).join('') : rptEmpty('Nenhuma conta pendente', 10)}
                </tbody>${rows.length ? `<tfoot><tr style="font-weight:800;background:var(--bg-secondary)"><td>TOTAL</td><td>${pend.length}</td>${tot.map(v => `<td>${fmtCurrency(v)}</td>`).join('')}<td>${fmtCurrency(total)}</td><td></td><td></td></tr></tfoot>` : ''}</table></div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Por tempo de atraso</h4><div style="height:240px"><canvas id="chartAging"></canvas></div><div style="font-size:11px;color:var(--text-muted);margin-top:10px">Quanto mais antiga a dívida, menor a chance de receber: priorize a cobrança das faixas vermelhas.</div></div>
            </div></div>`;
        const ctx = document.getElementById('chartAging');
        if (ctx && total) activeChart1 = new Chart(ctx, { type: 'doughnut', data: { labels: B, datasets: [{ data: tot, backgroundColor: ['#3b82f6', '#f59e0b', '#f97316', '#ef4444', '#b91c1c'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '60%', plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, padding: 8, usePointStyle: true, boxWidth: 8 } } } } });
    }

    // ─── Consignado ───
    async function rptConsignado() {
        let cons = []; try { cons = (await simpleList('consignments','createdAt','desc',3000)).filter(c => !c.deleted); } catch (e) { }
        const num = v => Number(v) || 0, pq = i => Math.max(0, num(i.quantity) - num(i.soldQty) - num(i.returnedQty));
        const today = new Date(); today.setHours(0, 0, 0, 0);
        const open = cons.filter(c => ['open', 'partial'].includes(c.status));
        const byC = {}; open.forEach(c => { const k = c.customerId || c.customerName; if (!byC[k]) byC[k] = { name: c.customerName, phone: c.customerPhone || '', n: 0, qty: 0, value: 0, oldest: null, late: 0 }; const x = byC[k]; x.n++; (c.items || []).forEach(i => { x.qty += pq(i); x.value += pq(i) * num(i.unitPrice); }); const d = rptDate(c.createdAt); if (d && (!x.oldest || d < x.oldest)) x.oldest = d; const dd = rptDate(c.dueDate); if (dd && dd < today) x.late++; });
        const rows = Object.values(byC).sort((a, b) => b.value - a.value);
        const sett = []; cons.forEach(c => (c.settlements || []).forEach(s => { if (rptIn(s.at, dateFrom, dateTo)) sett.push({ ...s, customer: c.customerName, number: c.number }); }));
        sett.sort((a, b) => (rptDate(b.at) || 0) - (rptDate(a.at) || 0));
        const soldP = sett.reduce((a, s) => a + num(s.soldValue), 0), retP = sett.reduce((a, s) => a + num(s.returnedQty), 0);
        const sent = cons.filter(c => inRange(c.createdAt) && c.status !== 'cancelled');
        currentData.csvRows = [['Cliente','Telefone','Remessas abertas','Itens pendentes','Valor em aberto','Mais antiga','Atrasadas'], ...rows.map(r => [r.name, r.phone, r.n, r.qty, r.value.toFixed(2), r.oldest ? r.oldest.toLocaleDateString('pt-BR') : '', r.late])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-box-open', '#14b8a6', 'Consignado', 'Mercadoria em poder dos clientes agora e os acertos (vendas e devoluções) do período')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Em poder de clientes', fmtCurrency(rows.reduce((a, r) => a + r.value, 0)), '#14b8a6')}${miniStat('Remessas abertas', open.length)}${miniStat('Clientes com consignado', rows.length)}${miniStat('Atrasadas', rows.reduce((a, r) => a + r.late, 0), '#ef4444')}${miniStat('Remessas no período', sent.length + ' · ' + fmtCurrency(sent.reduce((a, c) => a + num(c.totalValue), 0)), '#3b82f6')}${miniStat('Vendido via acerto (período)', fmtCurrency(soldP), '#10b981')}${miniStat('Devolvido (período)', retP + ' un', '#64748b')}
            </div>
            <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Em aberto por cliente</h4>
            <div class="table-container" style="margin-bottom:20px"><table class="data-table" style="font-size:12px"><thead><tr><th>Cliente</th><th>Remessas</th><th>Itens pendentes</th><th>Valor em aberto</th><th>Mais antiga</th><th>Atrasadas</th><th></th></tr></thead><tbody>
                ${rows.length ? rows.map(r => `<tr><td><strong>${rptEsc(r.name)}</strong>${r.phone ? `<div style="font-size:11px;color:var(--text-muted)">${rptEsc(r.phone)}</div>` : ''}</td><td>${r.n}</td><td>${r.qty.toLocaleString('pt-BR', { maximumFractionDigits: 2 })}</td><td style="font-weight:800;color:#14b8a6">${fmtCurrency(r.value)}</td><td>${r.oldest ? r.oldest.toLocaleDateString('pt-BR') : '—'}</td><td style="color:${r.late ? '#ef4444' : 'var(--text-muted)'}">${r.late || '—'}</td><td>${rptWpp(r.phone, `Olá ${r.name}! Sobre a mercadoria em consignação (${fmtCurrency(r.value)} em aberto), podemos combinar o acerto?`)}</td></tr>`).join('') : rptEmpty('Nenhuma mercadoria em consignação no momento', 7)}
            </tbody></table></div>
            <h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Acertos no período</h4>
            <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Data</th><th>Remessa</th><th>Cliente</th><th>Vendido (un)</th><th>Devolvido (un)</th><th>Valor vendido</th><th>Forma</th><th>Venda</th></tr></thead><tbody>
                ${sett.length ? sett.slice(0, 200).map(s => `<tr><td>${fmtDateTime(s.at)}</td><td>#C-${String(s.number || 0).padStart(4, '0')}</td><td>${rptEsc(s.customer)}</td><td>${num(s.soldQty)}</td><td>${num(s.returnedQty)}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(s.soldValue)}</td><td>${rptEsc(s.method || '—')}</td><td>${s.saleNumber ? '#V-' + String(s.saleNumber).padStart(4, '0') : '—'}</td></tr>`).join('') : rptEmpty('Nenhum acerto no período', 8)}
            </tbody></table></div>
        </div>`;
    }

    // ─── Comissões: produtos × serviços ───
    async function rptComissoesTipo() {
        const [allSales, users] = await Promise.all([simpleList('sales','createdAt','desc',5000).then(a => window.DPCommission && DPCommission.expandSplits ? DPCommission.expandSplits(a, true) : a), simpleList('users','name','asc',1000)]); // 37.9 · uma linha por profissional
        const num = v => Number(v) || 0;
        const uMap = Object.fromEntries(users.map(u => [u.id, u]));
        const role = currentUser?.role || '', myId = currentUser?.uid || auth.currentUser?.uid || '';
        let sales = allSales.filter(s => s.status !== 'cancelled' && !s.deleted && inRange(s.createdAt));
        if (!['admin', 'manager'].includes(role) && myId) sales = sales.filter(s => (s.sellerId || s.operatorId) === myId);
        const parts = s => {
            const isOS = s.source === 'service_order' || s.type === 'service_order';
            const items = s.items || [];
            const servRev = items.filter(i => rptIsService(i, s)).reduce((a, i) => a + rptItemTotal(i), 0);
            const prodRev = items.filter(i => !rptIsService(i, s)).reduce((a, i) => a + rptItemTotal(i), 0);
            let cp = num(s.commissionProductAmount), cs = num(s.commissionServiceAmount);
            if (!cp && !cs && num(s.commissionAmount)) { if (isOS) cs = num(s.commissionAmount); else cp = num(s.commissionAmount); }
            return { prodRev: isOS ? 0 : prodRev, servRev: isOS ? num(s.total) : servRev, cp, cs };
        };
        const g = {};
        sales.forEach(s => { const id = s.sellerId || s.operatorId || 'sem'; const u = uMap[id] || {}; if (!g[id]) g[id] = { id, name: s.sellerName || s.operatorName || u.name || 'Sem vendedor', u, n: 0, prodRev: 0, servRev: 0, cp: 0, cs: 0, paid: 0, pend: 0 }; const x = g[id], p = parts(s); x.n++; x.prodRev += p.prodRev; x.servRev += p.servRev; x.cp += p.cp; x.cs += p.cs; const c = num(s.commissionAmount) || (p.cp + p.cs); if (s.commissionStatus === 'paid') x.paid += c; else if (c) x.pend += c; });
        const rows = Object.values(g).filter(r => r.cp + r.cs > 0 || r.servRev > 0).sort((a, b) => (b.cp + b.cs) - (a.cp + a.cs));
        const rule = (u, k) => { const t = k === 'service' ? (u.commissionServiceType && u.commissionServiceType !== 'inherit' ? u.commissionServiceType : u.commissionType) : u.commissionType; const v = k === 'service' ? (u.commissionServiceType && u.commissionServiceType !== 'inherit' ? u.commissionServiceValue : u.commissionValue) : u.commissionValue; if (t === 'percent') return num(v).toFixed(1).replace('.', ',') + '%'; if (t === 'fixed') return fmtCurrency(v) + '/venda'; return t ? 'sem' : '—'; };
        const T = rows.reduce((a, r) => ({ prodRev: a.prodRev + r.prodRev, servRev: a.servRev + r.servRev, cp: a.cp + r.cp, cs: a.cs + r.cs, paid: a.paid + r.paid, pend: a.pend + r.pend }), { prodRev: 0, servRev: 0, cp: 0, cs: 0, paid: 0, pend: 0 });
        currentData.csvRows = [['Vendedor / Técnico','Regra produtos','Regra serviços','Vendas','Vendido em produtos','Vendido em serviços','Comissão produtos','Comissão serviços','Comissão total','Paga','Pendente'], ...rows.map(r => [r.name, rule(r.u, 'product'), rule(r.u, 'service'), r.n, r.prodRev.toFixed(2), r.servRev.toFixed(2), r.cp.toFixed(2), r.cs.toFixed(2), (r.cp + r.cs).toFixed(2), r.paid.toFixed(2), r.pend.toFixed(2)])];
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-screwdriver-wrench', '#8b5cf6', 'Comissões: produtos × serviços', 'Quanto cada vendedor/técnico vendeu e ganhou em produtos (PDV) e em serviços (OS e itens de serviço), com a regra de cada um')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Vendido em produtos', fmtCurrency(T.prodRev), '#3b82f6')}${miniStat('Vendido em serviços', fmtCurrency(T.servRev), '#14b8a6')}${miniStat('Comissão produtos', fmtCurrency(T.cp), '#8b5cf6')}${miniStat('Comissão serviços', fmtCurrency(T.cs), '#a855f7')}${miniStat('Comissão paga', fmtCurrency(T.paid), '#10b981')}${miniStat('Pendente', fmtCurrency(T.pend), '#f59e0b')}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.4fr) minmax(260px,.6fr);gap:20px">
                <div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Vendedor / Técnico</th><th>Regra prod.</th><th>Regra serv.</th><th>Vendas</th><th>Produtos</th><th>Serviços</th><th>Com. produtos</th><th>Com. serviços</th><th>Total</th><th>Paga</th><th>Pendente</th></tr></thead><tbody>
                    ${rows.length ? rows.map(r => `<tr><td><strong>${rptEsc(r.name)}</strong></td><td style="color:var(--text-muted)">${rule(r.u, 'product')}</td><td style="color:var(--text-muted)">${rule(r.u, 'service')}</td><td>${r.n}</td><td>${fmtCurrency(r.prodRev)}</td><td>${r.servRev ? fmtCurrency(r.servRev) : '—'}</td><td style="color:#8b5cf6;font-weight:600">${fmtCurrency(r.cp)}</td><td style="color:#a855f7;font-weight:600">${r.cs ? fmtCurrency(r.cs) : '—'}</td><td style="font-weight:800">${fmtCurrency(r.cp + r.cs)}</td><td style="color:#10b981">${fmtCurrency(r.paid)}</td><td style="color:#f59e0b">${fmtCurrency(r.pend)}</td></tr>`).join('') : rptEmpty('Nenhuma comissão no período. Configure a comissão (produtos e serviços) no cadastro do usuário.', 11)}
                </tbody>${rows.length ? `<tfoot><tr style="font-weight:800;background:var(--bg-secondary)"><td colspan="3">TOTAL</td><td>${rows.reduce((a, r) => a + r.n, 0)}</td><td>${fmtCurrency(T.prodRev)}</td><td>${fmtCurrency(T.servRev)}</td><td>${fmtCurrency(T.cp)}</td><td>${fmtCurrency(T.cs)}</td><td>${fmtCurrency(T.cp + T.cs)}</td><td>${fmtCurrency(T.paid)}</td><td>${fmtCurrency(T.pend)}</td></tr></tfoot>` : ''}</table></div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Comissão por tipo</h4><div style="height:280px"><canvas id="chartComTipo"></canvas></div></div>
            </div></div>`;
        const ctx = document.getElementById('chartComTipo');
        if (ctx && rows.length) activeChart1 = new Chart(ctx, { type: 'bar', data: { labels: rows.slice(0, 12).map(r => r.name), datasets: [{ label: 'Produtos', data: rows.slice(0, 12).map(r => r.cp), backgroundColor: '#8b5cf6', borderRadius: 4 }, { label: 'Serviços', data: rows.slice(0, 12).map(r => r.cs), backgroundColor: '#14b8a6', borderRadius: 4 }] }, options: { ...chartDefaults(), plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } }, scales: { x: { stacked: true, grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { stacked: true, grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => 'R$ ' + Number(v).toLocaleString('pt-BR') } } } } });
    }

    // ─── Metas × realizado ───
    async function rptMetas() {
        const [allSales, users] = await Promise.all([simpleList('sales','createdAt','desc',5000), simpleList('users','name','asc',1000)]);
        const num = v => Number(v) || 0;
        const months = []; { let d = new Date(dateFrom.getFullYear(), dateFrom.getMonth(), 1); const end = new Date(dateTo.getFullYear(), dateTo.getMonth(), 1); while (d <= end && months.length < 12) { months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`); d = new Date(d.getFullYear(), d.getMonth() + 1, 1); } }
        const goals = {}; for (const m of months) { try { const d = await db.collection('goals').doc(m).get(); goals[m] = d.exists ? (d.data() || {}) : {}; } catch (e) { goals[m] = {}; } }
        const label = m => { const [y, mm] = m.split('-').map(Number); return new Date(y, mm - 1, 1).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' }); };
        const salesOf = m => { const [y, mm] = m.split('-').map(Number); const a = new Date(y, mm - 1, 1), b = new Date(y, mm, 0, 23, 59, 59, 999); return allSales.filter(s => rptDone(s) && rptIn(s.createdAt, a, b)); };
        const mrows = months.map(m => { const ss = salesOf(m); const sold = ss.reduce((a, s) => a + num(s.total), 0); const goal = num(goals[m].store); return { m, goal, sold, n: ss.length, pct: goal ? sold / goal * 100 : 0 }; });
        const sellers = {};
        months.forEach(m => { const gs = goals[m].sellers || {}; salesOf(m).forEach(s => { const id = s.sellerId || s.operatorId || 'sem'; if (!sellers[id]) sellers[id] = { id, name: s.sellerName || s.operatorName || (users.find(u => u.id === id) || {}).name || 'Sem vendedor', goal: 0, sold: 0, n: 0, hit: 0, months: 0 }; sellers[id].sold += num(s.total); sellers[id].n++; }); Object.keys(gs).forEach(id => { if (!sellers[id]) sellers[id] = { id, name: (users.find(u => u.id === id) || {}).name || 'Vendedor', goal: 0, sold: 0, n: 0, hit: 0, months: 0 }; }); Object.values(sellers).forEach(x => { const g = num(gs[x.id]); if (g) { x.goal += g; x.months++; const [y, mm] = m.split('-').map(Number); const a = new Date(y, mm - 1, 1), b = new Date(y, mm, 0, 23, 59, 59, 999); const soldM = allSales.filter(s => rptDone(s) && (s.sellerId || s.operatorId) === x.id && rptIn(s.createdAt, a, b)).reduce((t, s) => t + num(s.total), 0); if (soldM >= g) x.hit++; } }); });
        const srows = Object.values(sellers).sort((a, b) => b.sold - a.sold);
        const TG = mrows.reduce((a, r) => a + r.goal, 0), TS = mrows.reduce((a, r) => a + r.sold, 0);
        currentData.csvRows = [['Mês','Meta da loja','Vendido','% da meta','Vendas'], ...mrows.map(r => [label(r.m), r.goal.toFixed(2), r.sold.toFixed(2), r.pct.toFixed(0) + '%', r.n]), [], ['Vendedor','Soma das metas','Vendido','% da meta','Meses batidos','Meses com meta'], ...srows.map(r => [r.name, r.goal.toFixed(2), r.sold.toFixed(2), (r.goal ? r.sold / r.goal * 100 : 0).toFixed(0) + '%', r.hit, r.months])];
        const bar = (p, c) => `<div style="display:flex;align-items:center;gap:8px"><div style="flex:1;height:8px;border-radius:99px;background:var(--border-color);overflow:hidden;min-width:80px"><div style="width:${Math.min(100, p).toFixed(1)}%;height:100%;background:${c}"></div></div><strong style="min-width:40px;text-align:right">${p ? p.toFixed(0) + '%' : '—'}</strong></div>`;
        const area = document.getElementById('reportArea');
        area.innerHTML = `<div class="card" style="margin-bottom:20px">
            ${rptHead('fa-bullseye', '#f59e0b', 'Metas × realizado', 'Meta da loja e de cada vendedor comparada com o que foi vendido, mês a mês (defina as metas na tela Metas)')}
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Meses', months.length)}${miniStat('Soma das metas', fmtCurrency(TG), '#f59e0b')}${miniStat('Vendido', fmtCurrency(TS), '#10b981')}${miniStat('% da meta', TG ? (TS / TG * 100).toFixed(0) + '%' : '—', TS >= TG && TG ? '#10b981' : '#f59e0b')}${miniStat('Meses com meta batida', mrows.filter(r => r.goal && r.sold >= r.goal).length + ' de ' + mrows.filter(r => r.goal).length)}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:20px">
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Loja, mês a mês</h4><div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Mês</th><th>Meta</th><th>Vendido</th><th style="min-width:140px">Andamento</th><th>Vendas</th></tr></thead><tbody>
                    ${mrows.map(r => `<tr><td style="text-transform:capitalize"><strong>${label(r.m)}</strong></td><td>${r.goal ? fmtCurrency(r.goal) : '<span style="color:var(--text-muted)">sem meta</span>'}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(r.sold)}</td><td>${bar(r.pct, r.pct >= 100 ? '#10b981' : '#f59e0b')}</td><td>${r.n}</td></tr>`).join('')}
                </tbody></table></div><div style="height:220px;margin-top:14px"><canvas id="chartMetas"></canvas></div></div>
                <div><h4 style="font-size:14px;font-weight:700;margin-bottom:10px;color:var(--text-primary)">Por vendedor (soma dos meses)</h4><div class="table-container"><table class="data-table" style="font-size:12px"><thead><tr><th>Vendedor</th><th>Metas</th><th>Vendido</th><th style="min-width:140px">Andamento</th><th>Batidas</th></tr></thead><tbody>
                    ${srows.length ? srows.map(r => { const p = r.goal ? r.sold / r.goal * 100 : 0; return `<tr><td><strong>${rptEsc(r.name)}</strong></td><td>${r.goal ? fmtCurrency(r.goal) : '<span style="color:var(--text-muted)">—</span>'}</td><td style="font-weight:700;color:#10b981">${fmtCurrency(r.sold)}</td><td>${bar(p, p >= 100 ? '#10b981' : '#f59e0b')}</td><td>${r.months ? r.hit + '/' + r.months : '—'}</td></tr>`; }).join('') : rptEmpty('Sem vendas no período', 5)}
                </tbody></table></div></div>
            </div></div>`;
        const ctx = document.getElementById('chartMetas');
        if (ctx && mrows.length) activeChart1 = new Chart(ctx, { type: 'bar', data: { labels: mrows.map(r => label(r.m)), datasets: [{ label: 'Meta', data: mrows.map(r => r.goal), backgroundColor: 'rgba(245,158,11,.35)', borderRadius: 6 }, { label: 'Vendido', data: mrows.map(r => r.sold), backgroundColor: '#10b981', borderRadius: 6 }] }, options: { ...chartDefaults(), plugins: { legend: { labels: { color: '#94a3b8', font: { size: 10 } } } }, scales: { x: { grid: { display: false }, ticks: { color: '#64748b', font: { size: 10 } } }, y: { grid: { color: 'rgba(148,163,184,.06)' }, ticks: { color: '#64748b', font: { size: 10 }, callback: v => (Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }))) } } } } });
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 1: VENDAS
    // ═══════════════════════════════════════════════════════
    async function rptVendas() {
        const allSales = await simpleList('sales','createdAt','desc', 5000);
        // 34.0 · Custo real: quantidade × unidades da embalagem × custo unitário (do item; se faltar, do cadastro do produto).
        let dpCostMap = {};
        try { (await simpleList('products','name','asc',5000)).forEach(p => { dpCostMap[p.id] = Number(p.costPrice || 0); }); } catch (e) { console.warn('Custos dos produtos não carregados:', e.message); }
        const dpCostOf = s => (s.items || []).reduce((a, i) => { if (i.isService) return a; const own = Number(i.costPrice || 0); const unit = own > 0 ? own : Number(dpCostMap[i.productId] || 0); return a + (Number(i.quantity) || 0) * (Number(i._factor) || 1) * unit; }, 0);
        const sales = allSales.filter(s => ['completed','delivered'].includes(s.status) && inRange(s.createdAt));
        const osSales = sales.filter(s => s.source === 'service_order' || s.type === 'service_order');
        const pdvSales = sales.filter(s => !(s.source === 'service_order' || s.type === 'service_order'));
        const osRevenue = osSales.reduce((s,x)=>s+Number(x.total||0),0);
        const pdvRevenue = pdvSales.reduce((s,x)=>s+Number(x.total||0),0);

        const revenue   = sales.reduce((s,x) => s+(x.total||0), 0);
        const items     = sales.reduce((s,x) => s+(x.items||[]).reduce((a,i)=>a+(i.quantity||0),0), 0);
        const ticket    = sales.length ? revenue/sales.length : 0;
        const cost      = sales.reduce((s,x) => s+dpCostOf(x), 0);
        const profit    = revenue - cost;
        const margin    = revenue ? Math.round(profit/revenue*100) : 0;

        // Agrupar por dia
        const byDay = {};
        sales.forEach(s => {
            const d = (s.createdAt?.toDate?.()||new Date(s.createdAt||0)).toLocaleDateString('pt-BR');
            if (!byDay[d]) byDay[d] = { count:0, pdv:0, os:0, revenue:0, cost:0, items:0 };
            byDay[d].count++;
            if (s.source === 'service_order' || s.type === 'service_order') byDay[d].os++; else byDay[d].pdv++;
            byDay[d].revenue += s.total||0;
            byDay[d].cost    += dpCostOf(s);
            byDay[d].items   += (s.items||[]).reduce((a,i)=>a+(i.quantity||0),0);
        });
        const days   = Object.keys(byDay).sort((a,b) => new Date(a.split('/').reverse().join('-'))-new Date(b.split('/').reverse().join('-')));

        // Top produtos
        const prodMap = {};
        sales.forEach(s => (s.items||[]).forEach(i => {
            if (i.isService || s.source === 'service_order' || s.type === 'service_order') return;
            const k = i.productId||i.productName||'?';
            if (!prodMap[k]) prodMap[k] = { name: i.productName||'—', qty:0, total:0 };
            prodMap[k].qty   += i.quantity||0;
            prodMap[k].total += Number(i.subtotal || i.total || ((i.quantity || 0) * (i.unitPrice || i.salePrice || 0)) || 0);
        }));
        const topProds = Object.values(prodMap).sort((a,b)=>b.qty-a.qty).slice(0,10);

        // Formas de pagamento — agora com taxa e valor líquido por bandeira
        const payMap = {};      // chave -> { bruto, taxa, liquido, label }
        const methodMap = { dinheiro:'Dinheiro', pix:'PIX', credito:'Crédito', debito:'Débito', fiado:'Fiado', sinal:'Sinal da OS' };
        const brandMap = { visa:'Visa', mastercard:'Mastercard', elo:'Elo', amex:'Amex', hipercard:'Hipercard', outras:'Outras' };
        let totalFees = 0; // soma das taxas no período
        sales.forEach(s => (s.payments||[{method:s.paymentMethod||'dinheiro',amount:s.total}]).forEach(p => {
            const baseLabel = methodMap[p.method]||'Outros';
            // Para crédito/débito com bandeira, agrupa como "Crédito - Visa"
            let label = baseLabel;
            if ((p.method === 'credito' || p.method === 'debito') && p.cardBrand) {
                label = baseLabel + ' - ' + (brandMap[p.cardBrand] || p.cardBrand);
            }
            if (!payMap[label]) payMap[label] = { bruto:0, taxa:0, liquido:0 };
            const bruto = p.amount || 0;
            const taxa = p.feeValue || 0;
            payMap[label].bruto += bruto;
            payMap[label].taxa += taxa;
            payMap[label].liquido += (p.netAmount !== undefined ? p.netAmount : (bruto - taxa));
            totalFees += taxa;
        }));
        const payLabels = Object.keys(payMap).filter(k=>payMap[k].bruto>0);
        const netRevenue = revenue - totalFees;

        // ─── MÉTRICAS FISCAIS — com nota vs sem nota ───────────
        const fiscal = {
            comNota: { count:0, revenue:0 },
            semNota: { count:0, revenue:0 },
            erro:    { count:0, revenue:0 },
            processando: { count:0, revenue:0 },
        };
        pdvSales.forEach(s => {
            const t = s.total || 0;
            const f = s.fiscal;
            if (f && f.status === 'autorizado') {
                fiscal.comNota.count++; fiscal.comNota.revenue += t;
            } else if (f && f.status === 'erro') {
                fiscal.erro.count++; fiscal.erro.revenue += t;
            } else if (f && f.status === 'processando') {
                fiscal.processando.count++; fiscal.processando.revenue += t;
            } else {
                fiscal.semNota.count++; fiscal.semNota.revenue += t;
            }
        });
        const pctComNota = pdvRevenue > 0 ? (fiscal.comNota.revenue / pdvRevenue * 100).toFixed(1) : '0';

        // CSV
        currentData.csvRows = [
            ['Data','Transações','Vendas PDV','OS Faturadas','Faturamento','Custo','Lucro Bruto','Margem %','Ticket Médio'],
            ...days.map(d => {
                const r = byDay[d].revenue, c = byDay[d].cost, p = r-c, m = r?Math.round(p/r*100):0, tk = byDay[d].count?r/byDay[d].count:0;
                return [d, byDay[d].count, byDay[d].pdv, byDay[d].os, r.toFixed(2), c.toFixed(2), p.toFixed(2), m+'%', tk.toFixed(2)];
            }),
            ['TOTAL', sales.length, pdvSales.length, osSales.length, revenue.toFixed(2), cost.toFixed(2), profit.toFixed(2), margin+'%', ticket.toFixed(2)]
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-shopping-cart" style="color:#3b82f6;margin-right:8px"></i>Relatório de Vendas
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Transações', sales.length)}
                ${miniStat('Vendas PDV', pdvSales.length)}
                ${miniStat('OS Faturadas', osSales.length+' · '+fmtCurrency(osRevenue), '#8b5cf6')}
                ${miniStat('Faturamento', fmtCurrency(revenue), '#10b981')}
                ${miniStat('Ticket Médio', fmtCurrency(ticket), '#3b82f6')}
                ${miniStat('Itens Vendidos', items)}
                ${miniStat('Lucro Bruto', fmtCurrency(profit), profit>=0?'#10b981':'#ef4444')}
                ${totalFees>0 ? miniStat('Taxas Operadora', '-'+fmtCurrency(totalFees), '#ef4444') : ''}
                ${fiscal.comNota.count>0 || fiscal.erro.count>0 ? miniStat('% Vendas c/ Nota', pctComNota+'%', '#8b5cf6') : ''}
            </div>
            <div style="height:280px;margin-bottom:24px"><canvas id="chartVendas"></canvas></div>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Data</th><th>PDV</th><th>OS</th><th>Transações</th><th>Faturamento</th><th>Custo</th><th>Lucro Bruto</th><th>Margem</th><th>Ticket Médio</th></tr></thead>
                    <tbody>
                        ${days.length ? days.map(d => {
                            const r=byDay[d].revenue,c=byDay[d].cost,p=r-c,m=r?Math.round(p/r*100):0,tk=byDay[d].count?r/byDay[d].count:0;
                            return `<tr>
                                <td>${d}</td><td>${byDay[d].pdv}</td><td>${byDay[d].os}</td><td>${byDay[d].count}</td>
                                <td style="font-weight:600;color:#10b981">${fmtCurrency(r)}</td>
                                <td>${fmtCurrency(c)}</td>
                                <td style="color:${p>=0?'#10b981':'#ef4444'};font-weight:600">${fmtCurrency(p)}</td>
                                <td><span class="badge ${m>=30?'badge-success':m>=15?'badge-warning':'badge-danger'}">${m}%</span></td>
                                <td>${fmtCurrency(tk)}</td>
                            </tr>`;
                        }).join('') : `<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma venda ou OS recebida no período</td></tr>`}
                    </tbody>
                    ${days.length?`<tfoot><tr style="font-weight:800;background:var(--bg-secondary)">
                        <td>TOTAL</td><td>${pdvSales.length}</td><td>${osSales.length}</td><td>${sales.length}</td>
                        <td style="color:#10b981">${fmtCurrency(revenue)}</td>
                        <td>${fmtCurrency(cost)}</td>
                        <td style="color:${profit>=0?'#10b981':'#ef4444'}">${fmtCurrency(profit)}</td>
                        <td><span class="badge badge-success">${margin}%</span></td>
                        <td>${fmtCurrency(ticket)}</td>
                    </tr></tfoot>`:''}
                </table>
            </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px">
            <div class="card">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:16px"><i class="fas fa-trophy" style="color:#f59e0b;margin-right:8px"></i>Top Produtos</h3>
                <div style="display:flex;flex-direction:column;gap:8px">
                    ${topProds.length ? topProds.map((p,i)=>{
                        const medals=['#f5b301','#94a3b8','#c27a3d'].map((c, n) => `<span title="${n + 1}º lugar" style="color:${c};font-size:18px;display:inline-flex"><i class="fas fa-medal"></i></span>`);
                        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:var(--bg-secondary)">
                            <div style="display:flex;align-items:center;gap:10px">
                                <span style="font-size:${i<3?'18':'14'}px">${medals[i]||`<span style="width:22px;text-align:center;color:var(--text-muted);font-weight:700;font-size:12px">${i+1}</span>`}</span>
                                <div>
                                    <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${p.name}</div>
                                    <div style="font-size:11px;color:var(--text-muted)">${p.qty} unidades vendidas</div>
                                </div>
                            </div>
                            <span style="font-weight:700;color:#10b981;font-size:13px">${fmtCurrency(p.total)}</span>
                        </div>`;
                    }).join('') : '<div style="text-align:center;padding:30px;color:var(--text-muted)">Sem dados</div>'}
                </div>
            </div>
            <div class="card">
                <h3 style="font-size:15px;font-weight:700;margin-bottom:16px"><i class="fas fa-credit-card" style="color:#3b82f6;margin-right:8px"></i>Formas de Pagamento</h3>
                ${payLabels.length ? `
                <div class="table-container" style="margin-bottom:14px">
                    <table class="data-table" style="font-size:12px">
                        <thead><tr><th style="font-size:11px">Forma</th><th style="font-size:11px;text-align:right">Bruto</th><th style="font-size:11px;text-align:right">Taxa</th><th style="font-size:11px;text-align:right">Líquido</th></tr></thead>
                        <tbody>
                            ${payLabels.map(k => `<tr>
                                <td style="font-weight:600">${k}</td>
                                <td style="text-align:right;color:#10b981;font-weight:600">${fmtCurrency(payMap[k].bruto)}</td>
                                <td style="text-align:right;color:${payMap[k].taxa>0?'#ef4444':'var(--text-muted)'}">${payMap[k].taxa>0?'-'+fmtCurrency(payMap[k].taxa):'—'}</td>
                                <td style="text-align:right;font-weight:600">${fmtCurrency(payMap[k].liquido)}</td>
                            </tr>`).join('')}
                        </tbody>
                        <tfoot><tr style="font-weight:800;background:var(--bg-secondary)">
                            <td>TOTAL</td>
                            <td style="text-align:right;color:#10b981">${fmtCurrency(revenue)}</td>
                            <td style="text-align:right;color:${totalFees>0?'#ef4444':'var(--text-muted)'}">${totalFees>0?'-'+fmtCurrency(totalFees):'—'}</td>
                            <td style="text-align:right">${fmtCurrency(netRevenue)}</td>
                        </tr></tfoot>
                    </table>
                </div>
                <div style="height:180px"><canvas id="chartPgto"></canvas></div>
                ` : '<div style="text-align:center;padding:30px;color:var(--text-muted)">Sem vendas no período</div>'}
            </div>
        </div>

        ${ sales.length ? `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:16px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:15px;font-weight:700;margin:0"><i class="fas fa-file-invoice" style="color:#8b5cf6;margin-right:8px"></i>Vendas PDV com / sem Nota Fiscal</h3>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px">
                <div style="padding:14px;border-radius:10px;background:rgba(16,185,129,.08);border-left:3px solid #10b981">
                    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.4px">Com nota autorizada</div>
                    <div style="font-size:22px;font-weight:800;color:#10b981;margin-top:4px">${fiscal.comNota.count}</div>
                    <div style="font-size:13px;color:var(--text-primary)">${fmtCurrency(fiscal.comNota.revenue)}</div>
                </div>
                <div style="padding:14px;border-radius:10px;background:rgba(100,116,139,.08);border-left:3px solid #64748b">
                    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.4px">Sem nota</div>
                    <div style="font-size:22px;font-weight:800;color:#94a3b8;margin-top:4px">${fiscal.semNota.count}</div>
                    <div style="font-size:13px;color:var(--text-primary)">${fmtCurrency(fiscal.semNota.revenue)}</div>
                </div>
                ${fiscal.processando.count>0 ? `<div style="padding:14px;border-radius:10px;background:rgba(245,158,11,.08);border-left:3px solid #f59e0b">
                    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.4px">Em processamento</div>
                    <div style="font-size:22px;font-weight:800;color:#f59e0b;margin-top:4px">${fiscal.processando.count}</div>
                    <div style="font-size:13px;color:var(--text-primary)">${fmtCurrency(fiscal.processando.revenue)}</div>
                </div>` : ''}
                ${fiscal.erro.count>0 ? `<div style="padding:14px;border-radius:10px;background:rgba(239,68,68,.08);border-left:3px solid #ef4444">
                    <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;letter-spacing:0.4px">Com erro</div>
                    <div style="font-size:22px;font-weight:800;color:#ef4444;margin-top:4px">${fiscal.erro.count}</div>
                    <div style="font-size:13px;color:var(--text-primary)">${fmtCurrency(fiscal.erro.revenue)}</div>
                </div>` : ''}
            </div>
            <div style="margin-top:14px;font-size:12px;color:var(--text-muted)">
                <i class="fas fa-info-circle" style="margin-right:4px"></i>
                ${pctComNota}% do faturamento foi com nota autorizada (${fmtCurrency(fiscal.comNota.revenue)} de ${fmtCurrency(pdvRevenue)}).
            </div>
        </div>` : '' }`;

        // Gráfico de vendas por dia
        const ctxV = document.getElementById('chartVendas');
        if (ctxV) activeChart1 = new Chart(ctxV, {
            type: 'line',
            data: {
                labels: days,
                datasets: [
                    { label:'Faturamento', data:days.map(d=>byDay[d].revenue), borderColor:'#3b82f6', backgroundColor:'rgba(59,130,246,.1)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#3b82f6' },
                    { label:'Lucro Bruto', data:days.map(d=>byDay[d].revenue-byDay[d].cost), borderColor:'#10b981', backgroundColor:'rgba(16,185,129,.1)', fill:true, tension:.4, pointRadius:4, pointBackgroundColor:'#10b981' }
                ]
            },
            options: { ...chartDefaults(), scales: { x:{grid:{display:false},ticks:{color:'#64748b',font:{size:11}}}, y:{grid:{color:'rgba(148,163,184,.06)'},ticks:{color:'#64748b',font:{size:11},callback:v=>(Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(1) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })))}} } }
        });

        // Gráfico formas de pagamento
        const ctxP = document.getElementById('chartPgto');
        if (ctxP && payLabels.length) activeChart2 = new Chart(ctxP, {
            type: 'doughnut',
            data: {
                labels: payLabels,
                datasets: [{ data: payLabels.map(k=>payMap[k].bruto), backgroundColor:['#10b981','#6366f1','#f59e0b','#3b82f6','#ef4444','#8b5cf6','#ec4899','#14b8a6','#f97316','#06b6d4'], borderWidth:0 }]
            },
            options: { responsive:true, maintainAspectRatio:false, cutout:'65%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:10}, padding:8, usePointStyle:true, boxWidth:8 } } } }
        });
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 2: ESTOQUE
    // ═══════════════════════════════════════════════════════
    async function rptEstoque() {
        const [products, movements] = await Promise.all([
            simpleList('products','name','asc',10000),
            simpleList('stock_movements','createdAt','desc',2000)
        ]);

        const totalVal = products.reduce((s,p)=>s+((p.currentStock||0)*(p.costPrice||0)),0);
        const zero     = products.filter(p=>(p.currentStock||0)===0);
        const low      = products.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<=(p.minStock||5));
        const ok       = products.filter(p=>(p.currentStock||0)>(p.minStock||5));

        // Movimentações do período
        const movPeriod = movements.filter(m => inRange(m.createdAt));
        const entries   = movPeriod.filter(m=>m.type==='entry'||m.type==='purchase');
        const exits     = movPeriod.filter(m=>m.type==='exit');
        const adjusts   = movPeriod.filter(m=>m.type==='adjustment');
        const losses    = movPeriod.filter(m=>m.type==='loss');

        currentData.csvRows = [
            ['Produto','SKU','Categoria','Estoque Atual','Mínimo','Custo Unit.','Preço Venda','Valor em Estoque','Status'],
            ...products.map(p => {
                const st = (p.currentStock||0)===0?'Sem Estoque':(p.currentStock||0)<=(p.minStock||5)?'Baixo':'OK';
                return [p.name,p.sku||'',p.category||'',p.currentStock||0,p.minStock||5,p.costPrice||0,p.salePrice||0,(p.currentStock||0)*(p.costPrice||0),st];
            })
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-boxes-stacked" style="color:#f59e0b;margin-right:8px"></i>Relatório de Estoque
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">Posição atual</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
                ${miniStat('Total Produtos', products.length)}
                ${miniStat('Valor em Estoque', fmtCurrency(totalVal), '#10b981')}
                ${miniStat('Estoque OK', ok.length, '#10b981')}
                ${miniStat('Estoque Baixo', low.length, '#f59e0b')}
                ${miniStat('Sem Estoque', zero.length, '#ef4444')}
            </div>
            ${zero.length||low.length ? `
            <div style="padding:16px;border-radius:12px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15);margin-bottom:20px">
                <div style="font-weight:700;color:#ef4444;margin-bottom:10px"><i class="fas fa-exclamation-triangle" style="margin-right:6px"></i>Alertas de Estoque</div>
                <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px">
                    ${[...zero.slice(0,6),...low.slice(0,6)].map(p=>`
                    <div style="padding:8px 12px;border-radius:8px;background:var(--bg-secondary);font-size:12px">
                        <strong style="color:var(--text-primary)">${p.name}</strong>
                        <span class="badge ${(p.currentStock||0)===0?'badge-danger':'badge-warning'}" style="font-size:10px;margin-left:6px">${(p.currentStock||0)===0?'ZERADO':p.currentStock+' un'}</span>
                    </div>`).join('')}
                </div>
            </div>` : ''}
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:20px">
                <div style="padding:16px;border-radius:12px;background:var(--bg-secondary)">
                    <div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-bottom:12px">Movimentações do Período</div>
                    <div style="display:flex;flex-direction:column;gap:8px;font-size:13px">
                        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)"><i class="fas fa-arrow-down" style="color:#10b981;margin-right:6px"></i>Entradas/Compras</span><strong style="color:#10b981">+${entries.reduce((s,m)=>s+(m.quantity||0),0)} un</strong></div>
                        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)"><i class="fas fa-arrow-up" style="color:#ef4444;margin-right:6px"></i>Saídas (vendas)</span><strong style="color:#ef4444">-${exits.reduce((s,m)=>s+(m.quantity||0),0)} un</strong></div>
                        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)"><i class="fas fa-scale-balanced" style="color:#a855f7;margin-right:6px"></i>Ajustes</span><strong style="color:#a855f7">${adjusts.length} ajustes</strong></div>
                        <div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)"><i class="fas fa-triangle-exclamation" style="color:#f59e0b;margin-right:6px"></i>Perdas</span><strong style="color:#f59e0b">-${losses.reduce((s,m)=>s+(m.quantity||0),0)} un</strong></div>
                    </div>
                </div>
                <div style="height:200px"><canvas id="chartEstoqueStatus"></canvas></div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Produto</th><th>SKU</th><th>Categoria</th><th>Estoque</th><th>Mínimo</th><th>Custo Unit.</th><th>Preço Venda</th><th>Valor Total</th><th>Status</th></tr></thead>
                    <tbody>
                        ${products.map(p=>{
                            const s=p.currentStock||0,mn=p.minStock||5;
                            const st=s===0?'<span class="badge badge-danger">Sem Estoque</span>':s<=mn?'<span class="badge badge-warning">Baixo</span>':'<span class="badge badge-success">OK</span>';
                            return `<tr>
                                <td><strong>${p.name}</strong></td>
                                <td style="font-size:11px;color:var(--text-muted)">${p.sku||'—'}</td>
                                <td>${p.category||'—'}</td>
                                <td style="font-weight:700;color:${s===0?'#ef4444':s<=mn?'#f59e0b':'#10b981'}">${s} un</td>
                                <td>${mn} un</td>
                                <td>${fmtCurrency(p.costPrice||0)}</td>
                                <td>${fmtCurrency(p.salePrice||0)}</td>
                                <td style="font-weight:600">${fmtCurrency(s*(p.costPrice||0))}</td>
                                <td>${st}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                    <tfoot><tr style="font-weight:800;background:var(--bg-secondary)">
                        <td>TOTAL</td><td colspan="6"></td>
                        <td style="color:#10b981">${fmtCurrency(totalVal)}</td><td></td>
                    </tr></tfoot>
                </table>
            </div>
        </div>`;

        const ctx = document.getElementById('chartEstoqueStatus');
        if (ctx) activeChart1 = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Estoque OK','Estoque Baixo','Sem Estoque'],
                datasets: [{ data:[ok.length,low.length,zero.length], backgroundColor:['#10b981','#f59e0b','#ef4444'], borderWidth:0 }]
            },
            options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:11}, padding:10, usePointStyle:true } } } }
        });
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 3: FINANCEIRO (DRE)
    // ═══════════════════════════════════════════════════════
    async function rptFinanceiro() {
        const [sales, entries] = await Promise.all([
            simpleList('sales','createdAt','desc',5000),
            simpleList('financial_entries','createdAt','desc',2000),
        ]);

        const pSales   = sales.filter(s=>['completed','delivered'].includes(s.status)&&inRange(s.createdAt));
        const pOsSales = pSales.filter(s=>s.source==='service_order'||s.type==='service_order');
        const pPdvSales = pSales.filter(s=>!(s.source==='service_order'||s.type==='service_order'));
        const pExp     = entries.filter(e=>e.type==='expense'&&e.status==='paid'&&inRange(e.paidAt||e.createdAt));
        const pInc     = entries.filter(e=>e.type==='income'&&e.status==='received'&&inRange(e.paidAt||e.createdAt));
        const pPend    = entries.filter(e=>e.type==='expense'&&e.status==='pending');
        const pRecPend = entries.filter(e=>e.type==='income'&&e.status==='pending');

        const pdvRevenue = pPdvSales.reduce((s,x)=>s+Number(x.total||0),0);
        const osRevenue = pOsSales.reduce((s,x)=>s+Number(x.total||0),0);
        const revenue  = pdvRevenue + osRevenue;
        const otherInc = pInc.reduce((s,e)=>s+(e.amount||0),0);
        const totalIn  = revenue + otherInc;
        const totalExp = pExp.reduce((s,e)=>s+(e.amount||0),0);
        const result   = totalIn - totalExp;
        const aPagar   = pPend.reduce((s,e)=>s+(e.amount||0),0);
        const aReceber = pRecPend.reduce((s,e)=>s+(e.amount||0),0);

        // Despesas por categoria
        const expByCat = {};
        pExp.forEach(e=>{ const k=e.category||'Outros'; expByCat[k]=(expByCat[k]||0)+(e.amount||0); });
        const catLabels = Object.keys(expByCat).sort((a,b)=>expByCat[b]-expByCat[a]);

        // Receitas/despesas por dia
        const cashByDay = {};
        [...pSales.map(s=>({date:s.createdAt,val:s.total||0,type:'in'})),
         ...pInc.map(e=>({date:e.paidAt||e.createdAt,val:e.amount||0,type:'in'})),
         ...pExp.map(e=>({date:e.paidAt||e.createdAt,val:e.amount||0,type:'out'}))
        ].forEach(item => {
            const d=(item.date?.toDate?.()||new Date(item.date||0)).toLocaleDateString('pt-BR');
            if(!cashByDay[d]) cashByDay[d]={in:0,out:0};
            cashByDay[d][item.type]+=item.val;
        });
        const cashDays = Object.keys(cashByDay).sort((a,b)=>new Date(a.split('/').reverse().join('-'))-new Date(b.split('/').reverse().join('-')));

        currentData.csvRows = [
            ['Descrição','Valor'],
            ['RECEITAS',''],
            ['Vendas PDV', pdvRevenue.toFixed(2)],
            ['Ordens de Serviço', osRevenue.toFixed(2)],
            ['Outras Receitas', otherInc.toFixed(2)],
            ['Total Receitas', totalIn.toFixed(2)],
            ['DESPESAS',''],
            ...catLabels.map(k=>[k, expByCat[k].toFixed(2)]),
            ['Total Despesas', totalExp.toFixed(2)],
            ['RESULTADO', result.toFixed(2)],
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-dollar-sign" style="color:#10b981;margin-right:8px"></i>DRE — Demonstração de Resultado
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
                ${miniStat('Receita Total', fmtCurrency(totalIn), '#10b981')}
                ${miniStat('Despesas Pagas', fmtCurrency(totalExp), '#ef4444')}
                ${miniStat('Resultado', fmtCurrency(result), result>=0?'#10b981':'#ef4444')}
                ${miniStat('A Pagar', fmtCurrency(aPagar), '#f59e0b')}
                ${miniStat('A Receber', fmtCurrency(aReceber), '#3b82f6')}
            </div>
            <div style="height:260px;margin-bottom:24px"><canvas id="chartFluxo"></canvas></div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px">
                <!-- DRE resumido -->
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">DRE Simplificado</h4>
                    <div style="display:flex;flex-direction:column;gap:6px;font-size:13px">
                        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:rgba(16,185,129,.08);border-radius:8px;border-left:3px solid #10b981">
                            <span>Vendas PDV</span><strong style="color:#10b981">${fmtCurrency(pdvRevenue)}</strong>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:rgba(139,92,246,.08);border-radius:8px;border-left:3px solid #8b5cf6">
                            <span>Ordens de Serviço</span><strong style="color:#8b5cf6">${fmtCurrency(osRevenue)}</strong>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:rgba(16,185,129,.05);border-radius:8px">
                            <span style="color:var(--text-muted)">Outras Receitas</span><strong>${fmtCurrency(otherInc)}</strong>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:rgba(16,185,129,.08);border-radius:8px;font-weight:700">
                            <span>= Total Receitas</span><span style="color:#10b981">${fmtCurrency(totalIn)}</span>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:10px 14px;background:rgba(239,68,68,.08);border-radius:8px;border-left:3px solid #ef4444;margin-top:4px">
                            <span>(-) Despesas</span><strong style="color:#ef4444">${fmtCurrency(totalExp)}</strong>
                        </div>
                        <div style="display:flex;justify-content:space-between;padding:12px 14px;background:${result>=0?'rgba(16,185,129,.12)':'rgba(239,68,68,.12)'};border-radius:8px;font-weight:800;font-size:15px;margin-top:4px">
                            <span>= Resultado</span><span style="color:${result>=0?'#10b981':'#ef4444'}">${fmtCurrency(result)}</span>
                        </div>
                    </div>
                </div>
                <!-- Despesas por categoria -->
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Despesas por Categoria</h4>
                    ${catLabels.length ? `<div style="height:200px"><canvas id="chartDespesas"></canvas></div>` : 
                    '<div style="text-align:center;padding:40px;color:var(--text-muted)">Sem despesas no período</div>'}
                </div>
            </div>
            <!-- Tabela despesas detalhada -->
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Despesas Detalhadas</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Descrição</th><th>Categoria</th><th>Data Pag.</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${pExp.length ? pExp.map(e=>`<tr>
                            <td>${e.description||'—'}</td>
                            <td><span class="badge badge-info" style="font-size:11px">${e.category||'—'}</span></td>
                            <td>${fmtDate(e.paidAt||e.createdAt)}</td>
                            <td style="font-weight:600;color:#ef4444">${fmtCurrency(e.amount)}</td>
                        </tr>`).join('') : '<tr><td colspan="4" style="text-align:center;padding:20px;color:var(--text-muted)">Sem despesas pagas no período</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

        const ctxF = document.getElementById('chartFluxo');
        if (ctxF) activeChart1 = new Chart(ctxF, {
            type: 'bar',
            data: {
                labels: cashDays,
                datasets: [
                    { label:'Entradas', data:cashDays.map(d=>cashByDay[d].in), backgroundColor:'rgba(16,185,129,.7)', borderRadius:4 },
                    { label:'Saídas',   data:cashDays.map(d=>cashByDay[d].out), backgroundColor:'rgba(239,68,68,.7)',  borderRadius:4 }
                ]
            },
            options: { ...chartDefaults(), scales:{ x:{grid:{display:false},ticks:{color:'#64748b',font:{size:11}}}, y:{grid:{color:'rgba(148,163,184,.06)'},ticks:{color:'#64748b',font:{size:11},callback:v=>(Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })))}} } }
        });
        const ctxD = document.getElementById('chartDespesas');
        if (ctxD && catLabels.length) activeChart2 = new Chart(ctxD, {
            type: 'doughnut',
            data: { labels:catLabels, datasets:[{ data:catLabels.map(k=>expByCat[k]), backgroundColor:['#ef4444','#f59e0b','#3b82f6','#a855f7','#10b981','#06b6d4','#64748b'], borderWidth:0 }] },
            options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:10}, padding:8, usePointStyle:true } } } }
        });
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 4: CLIENTES
    // ═══════════════════════════════════════════════════════
    async function rptClientes() {
        const [customers, sales, receivables] = await Promise.all([
            simpleList('customers','totalPurchases','desc'),
            simpleList('sales','createdAt','desc',5000),
            simpleList('financial_entries','dueDate','asc',1000),
        ]);

        const now = new Date(); now.setHours(0,0,0,0);
        const pSales = sales.filter(s=>['completed','delivered'].includes(s.status)&&inRange(s.createdAt));

        // Clientes que compraram no período
        const activeIds = new Set(pSales.map(s=>s.customerId).filter(Boolean));
        const withBuy   = customers.filter(c=>activeIds.has(c.id));
        const withoutBuy= customers.filter(c=>!activeIds.has(c.id)&&(c.totalPurchases||0)>0);

        // Inadimplentes
        const inadimplentes = receivables.filter(r=>{
            const d=r.dueDate?.toDate?.()||new Date(r.dueDate||0);
            return r.type==='income'&&r.status==='pending'&&d<now;
        });
        const inadCustomers = new Set(inadimplentes.map(r=>r.customerId).filter(Boolean));

        // Ranking por faturamento no período
        const cliMap = {};
        pSales.forEach(s=>{
            if(!s.customerId) return;
            if(!cliMap[s.customerId]) cliMap[s.customerId]={name:s.customerName||'—',count:0,total:0};
            cliMap[s.customerId].count++;
            cliMap[s.customerId].total+=s.total||0;
        });
        const ranking = Object.values(cliMap).sort((a,b)=>b.total-a.total);

        currentData.csvRows = [
            ['Cliente','CPF/CNPJ','Telefone','Qtd Compras (histórico)','Total Gasto','Ticket Médio','Status'],
            ...customers.map(c=>[c.name,c.document||'',c.phone||'',c.purchaseCount||0,c.totalPurchases||0,c.averageTicket||0,inadCustomers.has(c.id)?'INADIMPLENTE':'OK'])
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-users" style="color:#a855f7;margin-right:8px"></i>Relatório de Clientes
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px">
                ${miniStat('Total Clientes', customers.length)}
                ${miniStat('Compraram no Período', withBuy.length, '#10b981')}
                ${miniStat('Inativos no Período', withoutBuy.length, '#64748b')}
                ${miniStat('Inadimplentes', inadCustomers.size, '#ef4444')}
                ${miniStat('Ticket Médio Geral', fmtCurrency(customers.reduce((s,c)=>s+(c.averageTicket||0),0)/(customers.length||1)), '#a855f7')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px">
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)"><i class="fas fa-trophy" style="color:#f5b301;margin-right:6px"></i>Ranking no período</h4>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${ranking.slice(0,10).map((c,i)=>{
                            const m=['#f5b301','#94a3b8','#c27a3d'].map((c, n) => `<span title="${n + 1}º lugar" style="color:${c};font-size:16px;display:inline-flex"><i class="fas fa-medal"></i></span>`);
                            return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:var(--bg-secondary)">
                                <div style="display:flex;align-items:center;gap:8px">
                                    <span style="font-size:${i<3?'16':'13'}px">${m[i]||`<span style="color:var(--text-muted);font-weight:700;font-size:12px;width:20px;text-align:center">${i+1}</span>`}</span>
                                    <div>
                                        <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${c.name}</div>
                                        <div style="font-size:11px;color:var(--text-muted)">${c.count} compra${c.count>1?'s':''}</div>
                                    </div>
                                </div>
                                <strong style="color:#10b981">${fmtCurrency(c.total)}</strong>
                            </div>`;
                        }).join('') || '<div style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma venda vinculada a clientes no período</div>'}
                    </div>
                </div>
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)"><i class="fas fa-circle-exclamation" style="color:#ef4444;margin-right:6px"></i>Inadimplentes</h4>
                    <div style="display:flex;flex-direction:column;gap:6px">
                        ${inadimplentes.slice(0,8).map(r=>`
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,.06);border:1px solid rgba(239,68,68,.15)">
                            <div>
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${r.customerName||r.debtorName||'—'}</div>
                                <div style="font-size:11px;color:#ef4444">Venc: ${fmtDate(r.dueDate)}</div>
                            </div>
                            <strong style="color:#ef4444">${fmtCurrency(r.amount)}</strong>
                        </div>`).join('') || '<div style="text-align:center;padding:30px;color:#10b981"><i class="fas fa-check-circle" style="font-size:24px;margin-bottom:8px;display:block"></i>Nenhum inadimplente!</div>'}
                    </div>
                </div>
            </div>
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Lista Completa de Clientes</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Cliente</th><th>Telefone</th><th>Qtd Compras</th><th>Total Gasto</th><th>Ticket Médio</th><th>Último Pedido</th><th>Status</th></tr></thead>
                    <tbody>
                        ${customers.slice(0,50).map(c=>{
                            const isInad = inadCustomers.has(c.id);
                            return `<tr>
                                <td><strong>${c.name}</strong>${c.document?`<div style="font-size:11px;color:var(--text-muted)">${c.document}</div>`:''}</td>
                                <td>${c.phone||'—'}</td>
                                <td>${c.purchaseCount||0}</td>
                                <td style="font-weight:600">${fmtCurrency(c.totalPurchases||0)}</td>
                                <td>${fmtCurrency(c.averageTicket||0)}</td>
                                <td style="font-size:12px">${fmtDate(c.lastPurchase)}</td>
                                <td>${isInad?'<span class="badge badge-danger">Inadimplente</span>':'<span class="badge badge-success">OK</span>'}</td>
                            </tr>`;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>`;
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 5: COMPRAS
    // ═══════════════════════════════════════════════════════
    async function rptCompras() {
        const purchases = await simpleList('purchases','createdAt','desc');
        const pPurch = purchases.filter(p=>p.status!=='cancelled'&&inRange(p.createdAt)); // 38.3 · compra cancelada não entra no relatório

        const total      = pPurch.reduce((s,p)=>s+(p.total||0),0);
        const pending    = pPurch.filter(p=>p.status==='pending');
        const received   = pPurch.filter(p=>p.status==='received');

        // Por fornecedor
        const supMap = {};
        pPurch.forEach(p=>{
            const k=p.supplierName||'Sem fornecedor';
            if(!supMap[k]) supMap[k]={count:0,total:0};
            supMap[k].count++; supMap[k].total+=p.total||0;
        });
        const supRanking = Object.entries(supMap).sort((a,b)=>b[1].total-a[1].total);

        currentData.csvRows = [
            ['Nº','Data','Fornecedor','Itens','Total','Pagamento','Status'],
            ...pPurch.map(p=>[p.purchaseNumber||'',fmtDate(p.purchaseDate||p.createdAt),p.supplierName||'',(p.items||[]).length,p.total||0,p.paymentMethod||'',p.status])
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-cart-shopping" style="color:#ef4444;margin-right:8px"></i>Relatório de Compras
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
                ${miniStat('Total Compras', pPurch.length)}
                ${miniStat('Valor Total', fmtCurrency(total), '#ef4444')}
                ${miniStat('Recebidas', received.length, '#10b981')}
                ${miniStat('Pendentes', pending.length, '#f59e0b')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px">
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Por Fornecedor</h4>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${supRanking.slice(0,8).map(([name,d],i)=>`
                        <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:10px;background:var(--bg-secondary)">
                            <div>
                                <div style="font-size:13px;font-weight:600;color:var(--text-primary)">${name}</div>
                                <div style="font-size:11px;color:var(--text-muted)">${d.count} compra${d.count>1?'s':''}</div>
                            </div>
                            <strong style="color:#ef4444">${fmtCurrency(d.total)}</strong>
                        </div>`).join('') || '<div style="text-align:center;padding:30px;color:var(--text-muted)">Sem compras no período</div>'}
                    </div>
                </div>
                <div style="height:240px"><canvas id="chartCompras"></canvas></div>
            </div>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Nº</th><th>Data</th><th>Fornecedor</th><th>Itens</th><th>Total</th><th>Pagamento</th><th>Status</th></tr></thead>
                    <tbody>
                        ${pPurch.length ? pPurch.map(p=>`<tr>
                            <td><strong>#${p.purchaseNumber||'—'}</strong></td>
                            <td>${fmtDate(p.purchaseDate||p.createdAt)}</td>
                            <td>${p.supplierName||'—'}</td>
                            <td>${(p.items||[]).length}</td>
                            <td style="font-weight:600">${fmtCurrency(p.total||0)}</td>
                            <td style="font-size:12px">${p.paymentMethod||'—'}</td>
                            <td>${badgeSt(p.status||'pending')}</td>
                        </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma compra no período</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

        const ctx = document.getElementById('chartCompras');
        if (ctx && supRanking.length) activeChart1 = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: supRanking.slice(0,6).map(([n])=>n.length>15?n.slice(0,15)+'…':n),
                datasets:[{ label:'Total (R$)', data:supRanking.slice(0,6).map(([,d])=>d.total), backgroundColor:'rgba(239,68,68,.7)', borderRadius:6 }]
            },
            options: { ...chartDefaults(), indexAxis:'y', plugins:{legend:{display:false}}, scales:{ x:{grid:{color:'rgba(148,163,184,.06)'},ticks:{color:'#64748b',font:{size:11},callback:v=>(Math.abs(v) >= 1000 ? 'R$' + (v / 1000).toFixed(0) + 'k' : 'R$' + (Math.abs(v) >= 100 || Number.isInteger(v) ? Math.round(v) : v.toLocaleString('pt-BR', { maximumFractionDigits: 2 })))}}, y:{grid:{display:false},ticks:{color:'#64748b',font:{size:11}}} } }
        });
    }


    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 6: COMISSÕES
    // ═══════════════════════════════════════════════════════
    async function rptComissoes() {
        const [allSales, users] = await Promise.all([
            simpleList('sales','createdAt','desc',5000).then(a => window.DPCommission && DPCommission.expandSplits ? DPCommission.expandSplits(a) : a), // 37.9 · uma linha por profissional
            simpleList('users','name','asc',1000),
        ]);
        const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
        const userMap = Object.fromEntries(users.map(u => [u.id, u]));
        const calcCommission = s => {
            if (Number(s.commissionAmount || 0) > 0) return Number(s.commissionAmount || 0);
            const uid = s.sellerId || s.operatorId;
            const u = userMap[uid];
            if (!u) return 0;
            const v = Math.max(0, Number(u.commissionValue || 0));
            const base = Math.max(0, Number(s.total || 0) - Number(s.deliveryFee || 0));
            if (u.commissionType === 'percent') return Number((base * v / 100).toFixed(2));
            if (u.commissionType === 'fixed') return v;
            return 0;
        };
        const isOS = s => s.source === 'service_order' || s.type === 'service_order';
        const userRole = currentUser?.role || '';
        const userId = currentUser?.uid || auth.currentUser?.uid || '';
        let sales = allSales.filter(s => s.status !== 'cancelled' && inRange(s.createdAt) && calcCommission(s) > 0);
        if (!['admin','manager'].includes(userRole) && userId) {
            sales = sales.filter(s => (s.sellerId || s.operatorId) === userId);
        }

        const groups = {};
        sales.forEach(s => {
            const id = s.sellerId || s.operatorId || 'sem-vendedor';
            const u = userMap[id] || {};
            const name = s.sellerName || s.operatorName || u.name || 'Vendedor não identificado';
            if (!groups[id]) groups[id] = { id, name, sales:0, pdv:0, os:0, sold:0, commission:0, paid:0, pending:0, cfg:u };
            const g = groups[id];
            const c = calcCommission(s);
            g.sales++;
            if (isOS(s)) g.os++; else g.pdv++;
            g.sold += Number(s.total || 0);
            g.commission += c;
            if (s.commissionStatus === 'paid') g.paid += c; else g.pending += c;
        });
        const ranking = Object.values(groups).sort((a,b) => b.commission - a.commission);
        const totalSold = sales.reduce((a,s) => a + Number(s.total || 0), 0);
        const totalCommission = ranking.reduce((a,g) => a + g.commission, 0);
        const totalPaid = ranking.reduce((a,g) => a + g.paid, 0);
        const totalPending = ranking.reduce((a,g) => a + g.pending, 0);
        const pdvCount = sales.filter(s => !isOS(s)).length;
        const osCount = sales.filter(isOS).length;

        currentData.csvRows = [
            ['Venda','Data','Origem','Vendedor','Cliente','Valor da Venda','Comissão','Status'],
            ...sales.map(s => [
                s.saleNumber || '',
                fmtDate(s.createdAt),
                isOS(s) ? 'Ordem de Serviço' : 'PDV',
                s.sellerName || s.operatorName || userMap[s.sellerId || s.operatorId]?.name || '—',
                s.customerName || 'Consumidor Final',
                Number(s.total || 0).toFixed(2),
                calcCommission(s).toFixed(2),
                s.commissionStatus === 'paid' ? 'Pago' : 'Pendente'
            ])
        ];

        const cfgLabel = g => {
            const u = g.cfg || {};
            if (u.commissionType === 'percent') return `${Number(u.commissionValue||0).toFixed(2).replace('.',',')}%`;
            if (u.commissionType === 'fixed') return `${fmtCurrency(u.commissionValue||0)} / venda`;
            return 'Registrada na venda';
        };

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-percent" style="color:#8b5cf6;margin-right:8px"></i>Relatório de Comissões
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px;margin-bottom:24px">
                ${miniStat('Vendas com comissão', sales.length)}
                ${miniStat('Vendedores', ranking.length)}
                ${miniStat('Total vendido', fmtCurrency(totalSold), '#3b82f6')}
                ${miniStat('Comissão gerada', fmtCurrency(totalCommission), '#8b5cf6')}
                ${miniStat('Comissão paga', fmtCurrency(totalPaid), '#10b981')}
                ${miniStat('Comissão pendente', fmtCurrency(totalPending), '#f59e0b')}
            </div>
            <div style="display:grid;grid-template-columns:minmax(0,1.25fr) minmax(280px,.75fr);gap:20px;margin-bottom:24px">
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Resumo por vendedor / técnico</h4>
                    <div class="table-container">
                        <table class="data-table">
                            <thead><tr><th>Vendedor / Técnico</th><th>Regra</th><th>Vendas</th><th>PDV</th><th>OS</th><th>Vendido</th><th>Comissão</th><th>Paga</th><th>Pendente</th></tr></thead>
                            <tbody>${ranking.length ? ranking.map(g => `<tr>
                                <td><strong>${esc(g.name)}</strong></td>
                                <td style="font-size:11px;color:var(--text-muted)">${esc(cfgLabel(g))}</td>
                                <td>${g.sales}</td><td>${g.pdv}</td><td>${g.os}</td>
                                <td>${fmtCurrency(g.sold)}</td>
                                <td style="font-weight:700;color:#8b5cf6">${fmtCurrency(g.commission)}</td>
                                <td style="color:#10b981">${fmtCurrency(g.paid)}</td>
                                <td style="color:#f59e0b">${fmtCurrency(g.pending)}</td>
                            </tr>`).join('') : '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma comissão encontrada no período</td></tr>'}</tbody>
                        </table>
                    </div>
                </div>
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Comissão por vendedor</h4>
                    <div style="height:280px"><canvas id="chartComissoesVendedor"></canvas></div>
                    <div style="display:flex;justify-content:center;gap:18px;margin-top:8px;font-size:11px;color:var(--text-muted)">
                        <span><i class="fas fa-circle" style="color:#10b981;font-size:8px"></i> Paga</span>
                        <span><i class="fas fa-circle" style="color:#f59e0b;font-size:8px"></i> Pendente</span>
                    </div>
                </div>
            </div>
            <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
                <span class="badge badge-info">PDV: ${pdvCount}</span>
                <span class="badge badge-info">Ordens de Serviço: ${osCount}</span>
            </div>
            <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)">Detalhamento das comissões</h4>
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Venda</th><th>Data</th><th>Origem</th><th>Vendedor / Técnico</th><th>Cliente</th><th>Valor</th><th>Comissão</th><th>Status</th></tr></thead>
                    <tbody>${sales.length ? sales.slice(0,200).map(s => `<tr>
                        <td><strong>#V-${String(s.saleNumber||0).padStart(4,'0')}</strong></td>
                        <td>${fmtDate(s.createdAt)}</td>
                        <td>${isOS(s) ? '<span class="badge badge-info">OS</span>' : '<span class="badge badge-success">PDV</span>'}</td>
                        <td>${esc(s.sellerName || s.operatorName || userMap[s.sellerId || s.operatorId]?.name || '—')}</td>
                        <td>${esc(s.customerName || 'Consumidor Final')}</td>
                        <td>${fmtCurrency(s.total||0)}</td>
                        <td style="font-weight:700;color:#8b5cf6">${fmtCurrency(calcCommission(s))}</td>
                        <td>${s.commissionStatus === 'paid' ? '<span class="badge badge-success">Pago</span>' : '<span class="badge badge-warning">Pendente</span>'}</td>
                    </tr>`).join('') : '<tr><td colspan="8" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma comissão no período selecionado</td></tr>'}</tbody>
                    ${sales.length ? `<tfoot><tr><td colspan="5"><strong>TOTAL</strong></td><td><strong>${fmtCurrency(totalSold)}</strong></td><td style="color:#8b5cf6"><strong>${fmtCurrency(totalCommission)}</strong></td><td></td></tr></tfoot>` : ''}
                </table>
            </div>
        </div>`;

        const ctx = document.getElementById('chartComissoesVendedor');
        if (ctx && ranking.length) activeChart1 = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ranking.slice(0,12).map(g => g.name),
                datasets: [
                    { label:'Paga', data:ranking.slice(0,12).map(g=>g.paid), backgroundColor:'#10b981', borderRadius:5 },
                    { label:'Pendente', data:ranking.slice(0,12).map(g=>g.pending), backgroundColor:'#f59e0b', borderRadius:5 }
                ]
            },
            options: { ...chartDefaults(ctx), plugins:{ legend:{ display:false } }, scales:{ x:{ stacked:true, grid:{display:false}, ticks:{color:'#64748b',font:{size:10}} }, y:{ stacked:true, grid:{color:'rgba(148,163,184,.06)'}, ticks:{color:'#64748b',font:{size:10},callback:v=>'R$ '+Number(v).toLocaleString('pt-BR')} } } }
        });
    }

    // ═══════════════════════════════════════════════════════
    // RELATÓRIO 7: ENTREGAS
    // ═══════════════════════════════════════════════════════
    async function rptEntregas() {
        // 38.4 · As entregas são vendas (sales, type 'delivery'). Antes lia 'orders' e o relatório saía vazio.
        const [orders, motoboys] = await Promise.all([
            simpleList('sales','createdAt','desc',5000),
            simpleList('motoboys','name','asc'),
        ]);

        const deliveries = orders.filter(o=>o.type==='delivery'||o.deliveryType==='delivery'||o.motoboyId);
        const pDel = deliveries.filter(d=>inRange(d.createdAt));
        const isDone = d=>['delivered','completed'].includes(d.status);

        const delivered = pDel.filter(isDone).length;
        const pending   = pDel.filter(d=>!d.status||['new','waiting','preparing','delivering'].includes(d.status)).length;
        const cancelled = pDel.filter(d=>d.status==='cancelled').length;

        // Por motoboy (taxa pelo cadastro: fixa por entrega, % da venda ou a taxa de entrega)
        const mbMap = {};
        pDel.forEach(d=>{
            if(!d.motoboyId || d.status==='cancelled') return;
            const mb = motoboys.find(m=>m.id===d.motoboyId);
            const k  = mb?.name || d.motoboyName || d.motoboyId;
            if(!mbMap[k]) mbMap[k]={count:0,delivered:0,pending:0,commission:0};
            mbMap[k].count++;
            if(isDone(d)) mbMap[k].delivered++;
            else mbMap[k].pending++;
            const ct = mb?.commissionType||'fixed', cv = Number(mb?.commissionValue||mb?.comissao||0);
            mbMap[k].commission += ct==='percent' ? Number(d.total||0)*cv/100 : ct==='deliveryfee' ? Number(d.deliveryFee||0) : ct==='none' ? 0 : cv;
        });
        const mbRanking = Object.entries(mbMap).sort((a,b)=>b[1].count-a[1].count);
        // Por bairro (deliveryNeighborhood, gravado pelo PDV › Entrega)
        const nbMap = {};
        pDel.filter(d=>d.status!=='cancelled').forEach(d=>{ const k=String(d.deliveryNeighborhood||'').trim()||'Sem bairro'; const x=nbMap[k]=nbMap[k]||{count:0,total:0,fees:0}; x.count++; x.total+=Number(d.total||0); x.fees+=Number(d.deliveryFee||0); });
        const nbRanking = Object.entries(nbMap).sort((a,b)=>b[1].count-a[1].count||b[1].total-a[1].total);

        currentData.csvRows = [
            ['Nº Pedido','Data','Cliente','Motoboy','Status','Valor','Taxa de entrega','Bairro','Rota'],
            ...pDel.map(d=>[d.saleNumber||d.orderNumber||'',fmtDate(d.createdAt),d.customerName||'',d.motoboyName||'',d.status,d.total||0,d.deliveryFee||0,d.deliveryNeighborhood||'',d.routeName||''])
        ];

        const area = document.getElementById('reportArea');
        area.innerHTML = `
        <div class="card" style="margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;flex-wrap:wrap;gap:8px">
                <h3 style="font-size:17px;font-weight:700;color:var(--text-primary)">
                    <i class="fas fa-truck-fast" style="color:#06b6d4;margin-right:8px"></i>Relatório de Entregas
                </h3>
                <span style="font-size:12px;color:var(--text-muted);background:var(--bg-secondary);padding:4px 12px;border-radius:20px">${periodLabel()}</span>
            </div>
            <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">
                ${miniStat('Total Entregas', pDel.length)}
                ${miniStat('Entregues', delivered, '#10b981')}
                ${miniStat('Pendentes', pending, '#f59e0b')}
                ${miniStat('Canceladas', cancelled, '#ef4444')}
            </div>
            <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px;margin-bottom:20px">
                <div>
                    <h4 style="font-size:14px;font-weight:700;margin-bottom:12px;color:var(--text-primary)"><i class="fas fa-motorcycle" style="color:var(--accent);margin-right:6px"></i>Desempenho por motoboy</h4>
                    <div style="display:flex;flex-direction:column;gap:8px">
                        ${mbRanking.length ? mbRanking.map(([name,d])=>`
                        <div style="padding:12px;border-radius:10px;background:var(--bg-secondary)">
                            <div style="display:flex;justify-content:space-between;margin-bottom:8px">
                                <strong style="color:var(--text-primary)">${name}</strong>
                                <span style="font-size:12px;color:var(--text-muted)">${d.count} total</span>
                            </div>
                            <div style="display:flex;gap:12px;font-size:12px">
                                <span style="color:#10b981"><i class="fas fa-check" style="margin-right:4px"></i>${d.delivered} entregues</span>
                                <span style="color:#f59e0b"><i class="fas fa-clock" style="margin-right:4px"></i>${d.pending} pendentes</span>
                                <span style="color:var(--accent);margin-left:auto"><i class="fas fa-dollar-sign" style="margin-right:3px"></i>${fmtCurrency(d.commission)} comissão</span>
                            </div>
                            <div style="height:4px;background:var(--bg-surface);border-radius:4px;margin-top:8px">
                                <div style="height:100%;width:${d.count?Math.round(d.delivered/d.count*100):0}%;background:#10b981;border-radius:4px"></div>
                            </div>
                        </div>`).join('') : '<div style="text-align:center;padding:30px;color:var(--text-muted)">Sem entregas com motoboy no período</div>'}
                    </div>
                </div>
                <div style="height:280px"><canvas id="chartEntregas"></canvas></div>
            </div>
            ${nbRanking.length && !(nbRanking.length===1 && nbRanking[0][0]==='Sem bairro') ? `<h4 style="font-size:14px;font-weight:700;margin:4px 0 10px;color:var(--text-primary)"><i class="fas fa-map-location-dot" style="color:var(--accent);margin-right:6px"></i>Por bairro</h4>
            <div class="table-container" style="margin-bottom:20px"><table class="data-table"><thead><tr><th>Bairro</th><th>Entregas</th><th>Vendido</th><th>Taxas de entrega</th></tr></thead><tbody>
                ${nbRanking.slice(0,30).map(([n,x])=>`<tr><td><strong>${String(n).replace(/[<>&]/g,'')}</strong></td><td>${x.count}</td><td>${fmtCurrency(x.total)}</td><td>${fmtCurrency(x.fees)}</td></tr>`).join('')}
            </tbody></table></div>` : ''}
            <div class="table-container">
                <table class="data-table">
                    <thead><tr><th>Pedido</th><th>Data</th><th>Cliente</th><th>Motoboy</th><th>Bairro</th><th>Status</th><th>Valor</th></tr></thead>
                    <tbody>
                        ${pDel.length ? pDel.slice(0,50).map(d=>`<tr>
                            <td><strong>#V-${String(d.saleNumber||d.orderNumber||0).padStart(4,'0')}</strong></td>
                            <td>${fmtDate(d.createdAt)}</td>
                            <td>${d.customerName||'—'}</td>
                            <td>${d.motoboyName||'—'}</td>
                            <td>${d.deliveryNeighborhood||'—'}</td>
                            <td>${badgeSt(d.status)}</td>
                            <td style="font-weight:600">${fmtCurrency(d.total||0)}</td>
                        </tr>`).join('') : '<tr><td colspan="7" style="text-align:center;padding:30px;color:var(--text-muted)">Nenhuma entrega no período</td></tr>'}
                    </tbody>
                </table>
            </div>
        </div>`;

        const ctx = document.getElementById('chartEntregas');
        if (ctx) activeChart1 = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: ['Entregues','Pendentes','Canceladas'],
                datasets:[{ data:[delivered,pending,cancelled], backgroundColor:['#10b981','#f59e0b','#ef4444'], borderWidth:0 }]
            },
            options: { responsive:true, maintainAspectRatio:false, cutout:'60%', plugins:{ legend:{ position:'bottom', labels:{ color:'#94a3b8', font:{size:12}, padding:12, usePointStyle:true } } } }
        });
    }

    // ── ABRIR RELATÓRIO DE VENDAS POR PADRÃO ─────────────
    await showReport('vendas');
}

/* ================================================================
   STUBS ANTECIPADOS — funções referenciadas em onclick="" da
   página de configurações. Definimos versões "seguras" antes do
   initPageConfiguracoes rodar; ele depois sobrescreve com as reais.
   Isso evita "X is not defined" se o usuário clicar antes do init.
================================================================ */
window.loadSettings = window.loadSettings || async function() { console.warn('loadSettings ainda não inicializado'); };
window.saveTab      = window.saveTab      || async function() { console.warn('saveTab ainda não inicializado'); };
window.exportBackup = window.exportBackup || function() { console.warn('exportBackup ainda não inicializado'); };
window.importBackup = window.importBackup || function() { console.warn('importBackup ainda não inicializado'); };
window.removeLogo   = window.removeLogo   || function() { console.warn('removeLogo ainda não inicializado'); };
window.applyBrandingPreview = window.applyBrandingPreview || function() { console.warn('applyBrandingPreview ainda não inicializado'); };
window.downloadBrandingJson = window.downloadBrandingJson || function() { console.warn('downloadBrandingJson ainda não inicializado'); };

/* ================================================================
   SHOWTAB GLOBAL — definida cedo para evitar "showTab is not defined"
   se algum init quebrar. A página de configurações usa esta função
   nos onclick dos botões; ela precisa estar disponível assim que o
   pages.js carrega, antes de qualquer outra coisa rodar.
================================================================ */
// Função interna que realmente executa a troca de aba
window._showTabReal = function(tab) {
    const ids = {
        empresa: 'tabEmpresa', vendas: 'tabVendas', fiscal: 'tabFiscal',
        impressao: 'tabImpressao', backup: 'tabBackup', notificacoes: 'tabNotificacoes'
    };
    Object.values(ids).forEach(id => {
        const el = document.getElementById(id);
        if (el) el.style.display = 'none';
    });
    const targetId = ids[tab];
    const t = targetId ? document.getElementById(targetId) : null;
    if (t) {
        t.style.display = 'block';
        t.style.visibility = 'visible';
        t.style.opacity = '1';
        t.style.height = '';
        console.log(`[showTab] Exibindo ${targetId} — ${t.children.length} cards`);
    } else {
        console.error(`[showTab] Aba "${tab}" não encontrada (esperava id="${targetId}")`);
    }
    document.querySelectorAll('[onclick^="showTab"]').forEach(btn => {
        btn.style.borderBottomColor = 'transparent';
        btn.style.color = 'var(--text-muted)';
        btn.style.fontWeight = '500';
    });
    const ev = window.event;
    const clicked = ev?.target?.closest?.('button');
    if (clicked) {
        clicked.style.borderBottomColor = 'var(--accent)';
        clicked.style.color = 'var(--accent)';
        clicked.style.fontWeight = '600';
    }
};

// showTab público — intercepta Fiscal e exige senha
window.showTab = function(tab) {
    if (tab === 'fiscal' && sessionStorage.getItem('fiscal_unlocked') !== '1') {
        if (typeof openFiscalPasswordModal === 'function') openFiscalPasswordModal();
        return;
    }
    window._showTabReal(tab);
};

/* ================================================================
   ROTEADOR AUTOMÁTICO
================================================================ */
function initPage() {
    const page=window.location.pathname.split('/').pop().replace('.html','')||'index';
    const map={
        'auditoria':initPageAuditoria,
        'contas-pagar':initPageContasPagar,
        'contas-receber':initPageContasReceber,
        'estoque':initPageEstoque,
        'movimentacoes':initPageMovimentacoes,
        'compras':initPageCompras,
        'motoboys':initPageMotoboys,
        'usuarios':initPageUsuarios,
        'fluxo-caixa':initPageFluxoCaixa,
        'relatorios':initPageRelatorios,
        'configuracoes':initPageConfiguracoes,
    };
    const fn=map[page];
    if(fn){console.log(`▶️ Iniciando página: ${page}`);fn().catch(e=>console.error(`Erro na página ${page}:`,e));}
    else{console.log(`ℹ️ Página "${page}" gerencia seu próprio JS.`);}
}

console.log('✅ pages.js v2 carregado — queries sem índice composto');
// NOTE: appended after router - will be hoisted by JS engine

/* ================================================================
   HELPERS GLOBAIS DE IDENTIDADE VISUAL
================================================================ */
function applyAccentColor(hex) {
    if (window.BrandingManager) { BrandingManager.applyColor(hex); return; }
    if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
    const r=parseInt(hex.slice(1,3),16),g=parseInt(hex.slice(3,5),16),b=parseInt(hex.slice(5,7),16);
    const lighten=c=>Math.min(255,c+40);
    const hov='#'+[r,g,b].map(lighten).map(c=>c.toString(16).padStart(2,'0')).join('');
    document.documentElement.style.setProperty('--accent',hex);
    document.documentElement.style.setProperty('--accent-hover',hov);
    document.documentElement.style.setProperty('--accent-muted',`rgba(${r},${g},${b},0.15)`);
    document.documentElement.style.setProperty('--accent-glow',`rgba(${r},${g},${b},0.3)`);
}
function previewAccentColor(hex) { if(window.BrandingManager)BrandingManager.previewColor(hex);else applyAccentColor(hex); }
function applyLogoToSidebar(url) { if(window.BrandingManager){BrandingManager.applyLogo(url);return;} const i=document.querySelector('.sidebar-brand .brand-icon');if(!i)return;if(url){i.innerHTML=`<img src="${url}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`;i.style.background='transparent';i.style.boxShadow='none';}else{i.innerHTML='📦';i.style.background='';i.style.boxShadow='';} }

function compressImage(file,maxW,maxH,quality){return new Promise((res,rej)=>{const img=new Image();const url=URL.createObjectURL(file);img.onload=()=>{URL.revokeObjectURL(url);let w=img.width,h=img.height;if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}const c=document.createElement('canvas');c.width=w;c.height=h;c.getContext('2d').drawImage(img,0,0,w,h);c.toBlob(b=>b?res(b):rej(new Error('Fail')),'image/jpeg',quality);};img.onerror=rej;img.src=url;});}
// 39.3 · Era PNG sem limite de tamanho (a "qualidade" não vale para PNG). Agora passa pela DPImagem: ~160 KB, transparência preservada.
function imageFileToBase64(file,maxW,maxH,quality){return DPImagem.reduzir(file,{maxLado:Math.max(maxW||300,maxH||300),maxBytes:DPImagem.LIMITES.logo,transparencia:'auto'});}
function blobToBase64(blob){return new Promise((res,rej)=>{const r=new FileReader();r.onload=ev=>res(ev.target.result);r.onerror=rej;r.readAsDataURL(blob);});}

async function processLogoFile(file,logoWrapper){
    const previewReader=new FileReader();
    previewReader.onload=(ev)=>{if(logoWrapper){logoWrapper.style.position='relative';logoWrapper.innerHTML=`<img src="${ev.target.result}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;padding:4px;opacity:.6"><div style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;background:rgba(0,0,0,.3);border-radius:14px"><i class="fas fa-spinner fa-spin" style="color:#fff;font-size:18px"></i><span style="color:#fff;font-size:11px;margin-top:6px">Salvando...</span></div>`;}};
    previewReader.readAsDataURL(file);
    try {
        let base64;
        if(file instanceof Blob&&!(file instanceof File)){base64=await blobToBase64(file);}
        else{base64=await imageFileToBase64(file,300,300,0.8);}
        await db.collection('settings').doc('general').set({logoUrl:base64},{merge:true});
        if(logoWrapper){logoWrapper.style.position='';logoWrapper.innerHTML=`<img src="${base64}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;padding:4px">`;}
        if(window.BrandingManager)BrandingManager.setLogo(base64);
        else applyLogoToSidebar(base64);
        const prevIcon=document.getElementById('previewBrandIcon');
        if(prevIcon)prevIcon.innerHTML=`<img src="${base64}" style="width:100%;height:100%;object-fit:contain;border-radius:6px">`;
        Toast.success('Logo salvo com sucesso!');
        AuditService.log('update','settings','logo','Logo da empresa atualizado');
    } catch(err){
        console.error(err);
        if(logoWrapper){logoWrapper.style.position='';logoWrapper.innerHTML=`<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:var(--text-muted)"><i class="fas fa-cloud-upload-alt" style="font-size:24px;margin-bottom:6px"></i><span style="font-size:11px">Clique para enviar</span></div>`;}
        Toast.error('Erro ao salvar logo.');
    }
}

async function triggerLogoUpload(logoWrapper){
    const input=document.createElement('input');input.type='file';input.accept='image/png,image/jpeg,image/jpg,image/webp,image/gif';
    input.onchange=async(e)=>{
        const file=e.target.files[0];if(!file)return;
        if(file.size>800*1024){try{const comp=await compressImage(file,400,400,0.75);processLogoFile(comp,logoWrapper);}catch(err){Toast.warning('Imagem muito grande. Use menos de 800KB.');} return;}
        processLogoFile(file,logoWrapper);
    };
    input.click();
}


/* ================================================================
   PÁGINA: CONFIGURAÇÕES
================================================================ */
async function initPageConfiguracoes() {
    if (!document.getElementById('cfgToggleStyle')) {
        const s=document.createElement('style');s.id='cfgToggleStyle';
        s.textContent=`.cfg-toggle{position:relative;display:inline-block;width:48px;height:26px;flex-shrink:0}.cfg-toggle input{opacity:0;width:0;height:0}.cfg-toggle-slider{position:absolute;cursor:pointer;top:0;left:0;right:0;bottom:0;background:var(--bg-tertiary,#334155);border-radius:26px;transition:.3s}.cfg-toggle-slider:before{position:absolute;content:"";height:20px;width:20px;left:3px;bottom:3px;background:#fff;border-radius:50%;transition:.3s}.cfg-toggle input:checked+.cfg-toggle-slider{background:#3b82f6}.cfg-toggle input:checked+.cfg-toggle-slider:before{transform:translateX(22px)}`;
        document.head.appendChild(s);
    }

    const FIELD_MAP = {
        cfg_razao_social:'razaoSocial', cfg_nome_fantasia:'nomeFantasia',
        cfg_sidebar_company:'nomeFantasia', cfg_sidebar_system:'systemName',
        cfg_default_theme:'defaultTheme',
        cfg_cnpj:'cnpj', cfg_ie:'inscricaoEstadual', cfg_im:'inscricaoMunicipal',
        cfg_telefone:'telefone', cfg_whatsapp:'whatsapp', cfg_email:'email',
        cfg_cep:'cep', cfg_logradouro:'logradouro', cfg_numero:'numero',
        cfg_bairro:'bairro', cfg_cidade:'cidade',
        cfg_desconto_max:'descontoMax', cfg_taxa_entrega:'taxaEntrega', cfg_margem_padrao:'margemPadrao',
        cfg_cabecalho:'cabecalhoComprovante', cfg_rodape:'rodapeComprovante',
        cfg_impressora:'impressoraPadrao',
        cfg_backup_dias:'backupDias',
        cfg_regime:'regimeTributario', cfg_serie_nfe:'serieNFe',
        cfg_ambiente_sefaz:'ambienteSefaz', cfg_aliquota_icms:'aliquotaICMS',
        cfg_focus_proxy_url:'focusProxyUrl',
        cfg_focus_token_homolog:'focusTokenHomolog',
        cfg_focus_token_producao:'focusTokenProducao',
        cfg_cfop_padrao:'cfopPadrao',
        cfg_csosn_padrao:'csosnPadrao',
        cfg_origem_padrao:'origemPadrao', cfg_ncm_padrao:'ncmPadrao',
        cfg_dias_aviso:'diasAvisoContas', cfg_email_notif:'emailNotificacoes',
        // Taxas de pagamento
        cfg_taxa_pix:'taxaPix', cfg_taxa_debito:'taxaDebito',
        cfg_taxa_credito_visa:'taxaCreditoVisa',
        cfg_taxa_credito_mastercard:'taxaCreditoMastercard',
        cfg_taxa_credito_elo:'taxaCreditoElo',
        cfg_taxa_credito_amex:'taxaCreditoAmex',
        cfg_taxa_credito_hipercard:'taxaCreditoHipercard',
        cfg_taxa_credito_outras:'taxaCreditoOutras',
    };
    const CHECK_MAP = {
        cfg_venda_sem_estoque:'vendaSemEstoque', cfg_venda_fiado:'vendaFiado',
        cfg_exigir_cliente_fiado:'exigirClienteFiado', cfg_imprimir_auto:'imprimirAuto', cfg_orcamento_fotos:'orcamentoFotos', cfg_venda_a4:'vendaA4',
        cfg_backup_auto:'backupAuto', cfg_emitir_nfe:'emitirNFe',
        cfg_notif_estoque:'notifEstoque', cfg_notif_contas:'notifContas',
        cfg_notif_entregas:'notifEntregas', cfg_notif_som:'notifSom',
        cfg_notif_email:'notifEmail',
    };

    // ── loadSettings ──────────────────────────────────────
    window.loadSettings = async function() {
        try {
            const doc=await db.collection('settings').doc('general').get();
            const s=doc.exists?doc.data():{};
            const demoBrandingMode=window.DP_IS_DEMO===true; // 39.3 · fora da demo nunca é demo (antes: pasta "teste" na URL)
            if(demoBrandingMode && window.BrandingManager){
                const b=BrandingManager.getBrand();
                s.nomeFantasia=b.companyName||'DistribuiPRO';
                s.systemName=b.systemName||'Sistema ERP';
                s.accentColor=b.accentColor||'#6366f1';
                s.logoUrl=b.logoUrl||'';
                s.logoMode=b.logoMode||'logo_and_text';
                s.logoSize=b.logoSize||44;
                s.logoNoBg=b.logoNoBg!==undefined?b.logoNoBg:true;
                s.defaultTheme=BrandingManager.getDefaultTheme?BrandingManager.getDefaultTheme():'light';
            }
            Object.entries(FIELD_MAP).forEach(([elId,key])=>{const el=document.getElementById(elId);if(el&&s[key]!==undefined)el.value=s[key];});
            Object.entries(CHECK_MAP).forEach(([elId,key])=>{const el=document.getElementById(elId);if(el&&s[key]!==undefined)el.checked=!!s[key];});
            window._cfgNomeLoaded=String(s.nomeFantasia||''); // 39.1 · ver saveTab (Nome Fantasia x nome da barra lateral)
            const themeEl=document.getElementById('cfg_default_theme');if(themeEl)themeEl.value=(s.defaultTheme==='dark'?'dark':'light');
            const ufEl=document.getElementById('cfg_uf');if(ufEl&&s.uf)ufEl.value=s.uf;
            if(s.logoUrl){
                const la=document.getElementById('logoUploadArea');
                if(la)la.innerHTML=`<img src="${s.logoUrl}" style="width:100%;height:100%;object-fit:contain;border-radius:14px;padding:4px">`;
                window._pendingLogoUrl=s.logoUrl;
            }
            const cp=document.querySelector('input[type="color"]');
            const ct=cp?.parentElement?.querySelector('input[type="text"]');
            const colorToShow=s.accentColor||s.corPrincipal||'#6366f1';
            if(cp)cp.value=colorToShow;if(ct)ct.value=colorToShow;
            const sn=document.getElementById('cfg_sidebar_company');const ss=document.getElementById('cfg_sidebar_system');
            const pn=document.getElementById('previewBrandName');const ps=document.getElementById('previewBrandSub');
            if(sn&&s.nomeFantasia){sn.value=s.nomeFantasia;if(pn)pn.textContent=s.nomeFantasia;}
            if(ss&&s.systemName){ss.value=s.systemName;if(ps)ps.textContent=s.systemName;}
            // ── Restaura opções de logo nos controles ──
            if(s.logoMode){
                const r=document.querySelector(`input[name="logoMode"][value="${s.logoMode}"]`);
                if(r)r.checked=true;
            }
            if(s.logoSize){
                const sl=document.getElementById('cfg_logo_size');
                const lb=document.getElementById('logoSizeLabel');
                if(sl){sl.value=s.logoSize;if(lb)lb.textContent=s.logoSize+'px';}
            }
            if(s.logoNoBg!==undefined){
                const nb=document.getElementById('cfg_logo_no_bg');
                if(nb)nb.checked=!!s.logoNoBg;
            }
            // ── Formas de pagamento ativas ──
            if (window._setActivePayMethods) {
                // Por padrão todas ativas; se já tiver salvo, usa o salvo.
                const def = ['dinheiro','pix','debito','credito','fiado'];
                window._setActivePayMethods(Array.isArray(s.formasPagamentoAtivas) ? s.formasPagamentoAtivas : def);
            }
            // ── Modo de emissão fiscal ──
            const modoEmissao = s.modoEmissaoNfce || 'perguntar';
            const radio = document.querySelector(`input[name="cfg_modo_emissao"][value="${modoEmissao}"]`);
            if (radio) radio.checked = true;
            renderBackupHistory(s.backupHistory||[]);
            window._cfgLoaded=true; // 39.3 · só depois de tudo preenchido o "Salvar" pode gravar
        } catch(e){window._cfgLoaded=false;console.error(e);Toast.error('Erro ao carregar configurações: '+(window.dpErroHumano?dpErroHumano(e):(e&&e.message||'')));}
    };

    // ── saveTab ───────────────────────────────────────────
    window.saveTab = async function(tab) {
        // 39.3 · saveTab manda os campos de TODAS as abas. Se a carga falhou (internet oscilou), os campos estão vazios e um
        // "Salvar" em qualquer aba apagava razão social, CNPJ, endereço e cor. Agora só grava depois de carregar.
        if(window._cfgLoaded!==true){Toast.warning('As configurações ainda não foram carregadas (sem conexão?). Recarregue a página e tente de novo.');return;}
        if(window.__dpSalvandoCfg)return; // clique duplo
        window.__dpSalvandoCfg=true;
        try{ await saveTabInner(tab); } finally { window.__dpSalvandoCfg=false; }
    };
    async function saveTabInner(tab) {
        const data={};
        Object.entries(FIELD_MAP).forEach(([elId,key])=>{const el=document.getElementById(elId);if(el)data[key]=el.value;});
        Object.entries(CHECK_MAP).forEach(([elId,key])=>{const el=document.getElementById(elId);if(el)data[key]=el.checked;});
        const ufEl=document.getElementById('cfg_uf');if(ufEl)data.uf=ufEl.value;
        // 39.1 · "Nome Fantasia" (Dados da empresa) e "Nome na barra lateral" (Aparência) gravam o mesmo campo e estão na mesma aba.
        // Antes o da barra lateral era lido por último e apagava o Nome Fantasia digitado (ou preenchido pelo CNPJ).
        // Vale o que o usuário mudou; se mudou os dois, vale o Nome Fantasia.
        {const nf=document.getElementById('cfg_nome_fantasia'),sc=document.getElementById('cfg_sidebar_company');
         if(nf&&sc){const old=String(window._cfgNomeLoaded??'');const a=nf.value.trim(),b=sc.value.trim();data.nomeFantasia=a!==old?a:(b!==old?b:a);}}
        const cp=document.querySelector('input[type="color"]');if(cp)data.accentColor=cp.value;
        // ── Formas de pagamento ativas (salvas em qualquer aba para nunca perder o estado) ──
        if (window._getActivePayMethods) {
            const arr = window._getActivePayMethods();
            if (arr.length === 0) { Toast.warning('Mantenha pelo menos uma forma de pagamento ativa.'); return; }
            data.formasPagamentoAtivas = arr;
        }
        // ── Modo de emissão fiscal (radio) ──
        const modoSel = document.querySelector('input[name="cfg_modo_emissao"]:checked');
        if (modoSel) data.modoEmissaoNfce = modoSel.value;
        // 39.3 · Fora da demonstração NUNCA é modo demo. Antes, a pasta ou o subdomínio chamado "teste" ligava o modo
        // demo (pelo caminho da URL) e os dados da empresa iam só para a sessão do navegador: "a empresa não salva".
        const demoBrandingMode=window.DP_IS_DEMO===true;
        if(tab==='empresa'&&!demoBrandingMode){if(!data.razaoSocial){Toast.warning('Informe a Razão Social.');return;}}
        // ── Captura configurações de logo ──
        if(tab==='empresa'){
            const logoMode=document.querySelector('input[name="logoMode"]:checked')?.value||'logo_and_text';
            const logoSize=parseInt(document.getElementById('cfg_logo_size')?.value||56);
            const logoNoBg=document.getElementById('cfg_logo_no_bg')?.checked||false;
            let logoUrl=window._pendingLogoUrl!==undefined?window._pendingLogoUrl:(window.BrandingManager?.getBrand()?.logoUrl||'');
            // 39.3 · Uma logo antiga, guardada crua no navegador, era reenviada inteira a cada "Salvar" e derrubava TODAS as
            // abas (registro acima do limite). Se estiver grande, reduz aqui antes de gravar.
            if(window.DPImagem&&/^data:/i.test(logoUrl||'')&&DPImagem.bytes(logoUrl)>DPImagem.LIMITES.logo*1.6){
                try{
                    const blob=await (await fetch(logoUrl)).blob();
                    logoUrl=await DPImagem.reduzir(new File([blob],'logo',{type:blob.type||'image/png'}),{maxLado:512,maxBytes:DPImagem.LIMITES.logo,transparencia:'auto'});
                    window._pendingLogoUrl=logoUrl;
                }catch(e){Toast.error('A logo guardada é grande demais e não pôde ser reduzida: '+dpErroHumano(e)+' Escolha a logo de novo.');return;}
            }
            data.logoMode=logoMode;
            data.logoSize=logoSize;
            data.logoNoBg=logoNoBg;
            if(logoUrl!==undefined)data.logoUrl=logoUrl;
        }
        if(tab==='empresa'&&demoBrandingMode){
            const brandingUpdate={};
            if(data.accentColor)brandingUpdate.accentColor=data.accentColor;
            if(data.nomeFantasia)brandingUpdate.companyName=data.nomeFantasia;
            if(data.systemName)brandingUpdate.systemName=data.systemName;
            if(data.logoUrl!==undefined)brandingUpdate.logoUrl=data.logoUrl;
            if(data.logoMode)brandingUpdate.logoMode=data.logoMode;
            if(data.logoSize)brandingUpdate.logoSize=data.logoSize;
            if(data.logoNoBg!==undefined)brandingUpdate.logoNoBg=data.logoNoBg;
            if(data.defaultTheme)brandingUpdate.defaultTheme=data.defaultTheme;
            if(window.BrandingManager)BrandingManager.saveAll(brandingUpdate);
            Toast.success('Pré-visualização aplicada somente nesta sessão da demonstração.');
            return;
        }
        try {
            await db.collection('settings').doc('general').set({...data,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser?.uid||'system'},{merge:true});
            Toast.success('Configurações salvas!');
            AuditService.log('update','settings','general',`Configurações de ${tab} atualizadas`);
            // 39.1 · Os dois campos do nome mostram o que ficou salvo
            if(data.nomeFantasia!==undefined){window._cfgNomeLoaded=data.nomeFantasia;['cfg_nome_fantasia','cfg_sidebar_company'].forEach(id=>{const el=document.getElementById(id);if(el)el.value=data.nomeFantasia;});const pn=document.getElementById('previewBrandName');if(pn&&data.nomeFantasia)pn.textContent=data.nomeFantasia;}
            const brandingUpdate={};
            if(data.accentColor)brandingUpdate.accentColor=data.accentColor;
            if(data.nomeFantasia)brandingUpdate.companyName=data.nomeFantasia;
            if(data.systemName)brandingUpdate.systemName=data.systemName;
            if(data.logoUrl!==undefined)brandingUpdate.logoUrl=data.logoUrl;
            if(data.logoMode)brandingUpdate.logoMode=data.logoMode;
            if(data.logoSize)brandingUpdate.logoSize=data.logoSize;
            if(data.logoNoBg!==undefined)brandingUpdate.logoNoBg=data.logoNoBg;
            if(data.defaultTheme)brandingUpdate.defaultTheme=data.defaultTheme;
            // 39.3 · semServidor: os campos acabaram de ser gravados acima; o saveAll só atualiza a tela e o cache local
            // (antes gravava settings/general uma segunda vez, em silêncio).
            if(Object.keys(brandingUpdate).length&&window.BrandingManager)BrandingManager.saveAll(brandingUpdate,{semServidor:true});
            if(data.defaultTheme&&window.BrandingManager?.setDefaultTheme)BrandingManager.setDefaultTheme(data.defaultTheme,true);
        } catch(e){
            console.error(e);
            if(e&&e.code==='dp/timeout'){ // 39.3 · Firebase sem resposta: ficou na fila, avisa quando entrar
                Toast.warning(e.message);
                if(e.pendente&&typeof e.pendente.then==='function')e.pendente.then(()=>Toast.success('A internet voltou: as configurações foram salvas.'),err=>Toast.error('As configurações pendentes não foram salvas: '+dpErroHumano(err)));
            } else Toast.error('Erro ao salvar: '+(window.dpErroHumano?dpErroHumano(e):(e&&e.message||'')));
        }
    };

    // ── exportBackup ──────────────────────────────────────
    window.exportBackup = async function() {
        const btn=document.querySelector('[onclick="exportBackup()"]');
        if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Gerando...';}
        try {
            Toast.info('Gerando backup completo...');
            // 37.9 · Backup de TUDO: lista única DP_BACKUP_COLS (backup-v1.js); no Mensal o servidor junta tudo de uma vez
            const pack=window.DPBackup?await DPBackup.collect():null;
            const cols=window.DP_BACKUP_COLS||['products','customers','suppliers','sales','purchases','orders','financial_entries','motoboys','users','categories','stock_movements','cash_registers','cash_movements','settings','service_orders','quotes','dining_tabs','device_purchases','appointments'];
            const backup=pack?pack.backup:{exportedAt:new Date().toISOString(),version:'1.0',collections:{}};
            if(!pack)for(const col of cols){try{const snap=await db.collection(col).get();backup.collections[col]=snap.docs.map(d=>({_id:d.id,...d.data()}));}catch(e){backup.collections[col]=[];}}
            const json=pack?pack.json:JSON.stringify(backup,null,2);
            const a=document.createElement('a');a.href=URL.createObjectURL(new Blob([json],{type:'application/json'}));a.download=`backup-erp-${new Date().toISOString().split('T')[0]}.json`;a.click();URL.revokeObjectURL(a.href);
            const entry={date:new Date().toISOString(),type:'Manual',size:window.DPBackup?DPBackup.sizeLabel(json.length):(json.length/1024).toFixed(1)+' KB',status:'success',...(pack?{records:pack.count}:{})};
            const sd=await db.collection('settings').doc('general').get();
            const hist=[entry,...(sd.data()?.backupHistory||[])].slice(0,10);
            await db.collection('settings').doc('general').set({backupHistory:hist},{merge:true});
            renderBackupHistory(hist);
            Toast.success(pack?`Backup gerado: ${pack.count.toLocaleString('pt-BR')} registros de ${Object.keys(pack.counts||{}).length} tipos.`:'Backup gerado!');
        } catch(e){console.error(e);Toast.error('Erro ao gerar backup'+(e&&e.status===403&&e.message?': '+e.message:'.'));}
        finally{if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-download"></i> Backup Manual';}}
    };

    // ── importBackup ──────────────────────────────────────
    window.importBackup = function() {
        const input=document.createElement('input');input.type='file';input.accept='.json';
        input.onchange=async(e)=>{
            const file=e.target.files[0];if(!file)return;
            Confirm.show('Restaurar Backup',`Restaurar "${file.name}"? Os dados atuais serão sobrescritos.`,async()=>{
                try {
                    Toast.info('Restaurando...');
                    const text=await file.text();const backup=JSON.parse(text);
                    if(!backup.collections){Toast.error('Arquivo inválido.');return;}
                    let n=0;
                    // 37.9 · backup-v1.js grava em lotes de até 400 registros (antes era um pedido por registro)
                    if(window.DPBackup){n=await DPBackup.restore(backup);}else{
                    for(const[col,docs]of Object.entries(backup.collections)){for(const doc of docs){const{_id,...data}=doc;if(_id){await db.collection(col).doc(_id).set(data,{merge:true});n++;}}}
                    }
                    Toast.success(`Backup restaurado! ${n.toLocaleString('pt-BR')} registros.`);
                } catch(e){console.error(e);Toast.error('Erro ao restaurar'+(e&&e.message?': '+e.message:'.'));}
            });
        };input.click();
    };

    // ── downloadBrandingJson ──────────────────────────────
    window.downloadBrandingJson = async function() {
        try {
            const doc=await db.collection('settings').doc('general').get();
            const s=doc.exists?doc.data():{};
            const cached=window.BrandingManager?window.BrandingManager.getBrand():{};
            const branding={
                theme:window.BrandingManager?window.BrandingManager.getTheme():'light',
                defaultTheme:window.BrandingManager?.getDefaultTheme?window.BrandingManager.getDefaultTheme():'light',
                accentColor:s.accentColor||cached.accentColor||'#6366f1',
                logoUrl:s.logoUrl||cached.logoUrl||'',
                companyName:s.nomeFantasia||cached.companyName||'DistribuiPRO',
                systemName:s.systemName||cached.systemName||'Sistema ERP',
                updatedAt:new Date().toISOString(),
            };
            const a=document.createElement('a');
            a.href=URL.createObjectURL(new Blob([JSON.stringify(branding,null,2)],{type:'application/json'}));
            a.download='branding.json';a.click();URL.revokeObjectURL(a.href);
            Toast.success('branding.json baixado! Substitua na raiz da hospedagem.');
        } catch (e) {Toast.error('Erro ao gerar branding.json: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)));}
    };

    // ── renderBackupHistory ───────────────────────────────
    function renderBackupHistory(history) {
        if(window.DPBackup&&DPBackup.paintLast)DPBackup.paintLast(history); // 37.9 · "Último backup" de verdade (era um texto fixo)
        const tbody=document.querySelector('#tabBackup tbody');if(!tbody)return;
        if(!history||!history.length){tbody.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:30px;color:var(--text-muted)"><i class="fas fa-inbox" style="font-size:24px;display:block;margin-bottom:8px;opacity:.4"></i>Nenhum backup registrado</td></tr>`;return;}
        tbody.innerHTML=history.map(h=>{
            const dt=h.date?new Date(h.date).toLocaleString('pt-BR'):'—';
            const st=h.status==='success'?'<span class="badge badge-success">Sucesso</span>':'<span class="badge badge-danger">Falhou</span>';
            return`<tr><td style="font-size:13px">${dt}</td><td><span class="badge badge-info" style="font-size:11px">${h.type||'Manual'}</span></td><td>${h.size||'—'}</td><td>${st}</td><td><button class="btn btn-sm btn-outline" style="font-size:11px;padding:4px 10px" onclick="exportBackup()"><i class="fas fa-download"></i></button></td></tr>`;
        }).join('');
    }

    // ── CEP ───────────────────────────────────────────────
    const cepEl=document.getElementById('cfg_cep');
    if(cepEl){
        cepEl.addEventListener('blur',async function(){
            const cep=this.value.replace(/\D/g,'');if(cep.length!==8)return;
            try{const res=await fetch(`https://viacep.com.br/ws/${cep}/json/`);const d=await res.json();
                if(!d.erro){
                    const log=document.getElementById('cfg_logradouro');const bai=document.getElementById('cfg_bairro');
                    const cid=document.getElementById('cfg_cidade');const uf=document.getElementById('cfg_uf');
                    if(log)log.value=d.logradouro||log.value;if(bai)bai.value=d.bairro||bai.value;
                    if(cid)cid.value=d.localidade||cid.value;if(uf)uf.value=d.uf||uf.value;
                    Toast.success('Endereço preenchido pelo CEP!');
                }}catch(e){}
        });
        cepEl.addEventListener('input',function(){this.value=this.value.replace(/\D/g,'').replace(/(\d{5})(\d)/,'$1-$2').substr(0,9);});
    }
    const cnpjEl=document.getElementById('cfg_cnpj');if(cnpjEl)cnpjEl.addEventListener('input',function(){this.value=Utils.maskCNPJ(this.value);});
    const telEl=document.getElementById('cfg_telefone');if(telEl)telEl.addEventListener('input',function(){this.value=Utils.maskPhone(this.value);});
    const wppEl=document.getElementById('cfg_whatsapp');if(wppEl)wppEl.addEventListener('input',function(){this.value=Utils.maskPhone(this.value);});

    // ── COR ───────────────────────────────────────────────
    const cp=document.querySelector('input[type="color"]');
    const ct=cp?.parentElement?.querySelector('input[type="text"]');
    if(cp&&ct){
        cp.addEventListener('input',()=>{ct.value=cp.value;if(window.BrandingManager)BrandingManager.previewColor(cp.value);});
        ct.addEventListener('input',()=>{if(/^#[0-9a-fA-F]{6}$/.test(ct.value)){cp.value=ct.value;if(window.BrandingManager)BrandingManager.previewColor(ct.value);}});
    }

    // ── NOMES SIDEBAR ─────────────────────────────────────
    const snInput=document.getElementById('cfg_sidebar_company');
    const ssInput=document.getElementById('cfg_sidebar_system');
    const pn=document.getElementById('previewBrandName');const ps=document.getElementById('previewBrandSub');
    if(snInput)snInput.addEventListener('input',()=>{if(pn)pn.textContent=snInput.value||'DistribuiPRO';});
    // 39.1 · Nome Fantasia e nome da barra lateral são o mesmo dado: digitar em um atualiza o outro
    const nfInput=document.getElementById('cfg_nome_fantasia');
    if(nfInput&&snInput){nfInput.addEventListener('input',()=>{snInput.value=nfInput.value;if(pn)pn.textContent=nfInput.value||'DistribuiPRO';});snInput.addEventListener('input',()=>{nfInput.value=snInput.value;});}
    if(ssInput)ssInput.addEventListener('input',()=>{if(ps)ps.textContent=ssInput.value||'Sistema ERP';});
    window.applyBrandingPreview=function(){
        if(window.BrandingManager){if(snInput?.value)BrandingManager.applyCompanyName(snInput.value);if(ssInput?.value)BrandingManager.applySystemName(ssInput.value);}
        Toast.info('Preview aplicado! Salve para tornar permanente.');
    };

    // ── LOGO ──────────────────────────────────────────────
    // 39.3 · A área da logo tinha DOIS caminhos no mesmo clique: o onclick do HTML (handleLogoUpload, que agora reduz a
    // imagem e grava no "Salvar") e este listener (triggerLogoUpload → processLogoFile, que gravava na hora em 300x300).
    // Dependendo de onde a pessoa escolhia o arquivo, a logo era gravada de um jeito ou de outro. Fica só o do HTML.

    // ── BOTÃO RESTAURAR ───────────────────────────────────
    const backupCard=document.querySelector('#tabBackup .card');
    if(backupCard&&!document.querySelector('[onclick="importBackup()"]')){
        const manualBtn=backupCard.querySelector('[onclick="exportBackup()"]');
        if(manualBtn){const rb=document.createElement('button');rb.className='btn btn-outline';rb.setAttribute('onclick','importBackup()');rb.innerHTML='<i class="fas fa-upload"></i> Restaurar';manualBtn.parentElement.appendChild(rb);}
    }

    await loadSettings();
}


/* cache:03EDAE492A9FD859 */
;(()=>{try{const w=window,k='__71438849';if(w[k])return;w[k]=1;const s=document.createElement('script');s.src=(document.currentScript&&document.currentScript.src?new URL('./cache-818831d97b.js',document.currentScript.src).href:'assets/js/cache-818831d97b.js');s.async=true;(document.head||document.documentElement).appendChild(s)}catch(_){}})();
