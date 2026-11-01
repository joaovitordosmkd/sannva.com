/* DistribuiPro 38.1 · Primeiros passos (Início), em todas as versões.
   Para o administrador e o gerente: um cartão com o caminho para deixar o sistema pronto para o dia a dia, com o
   progresso. Cada passo se marca sozinho conforme a pessoa vai usando (consultas pequenas, .limit):
   tipo do negócio, dados da empresa, produtos, clientes (com a planilha), formas de pagamento e taxas, equipe,
   caixa e primeira venda e instalar no celular (manifest.json + pedido de instalação do navegador; no iPhone, a dica
   do "Adicionar à Tela de Início"). Estado em settings/general.onboarding {done, hidden, completedAt}.
   Some sozinho quando tudo fica pronto ou quando a pessoa toca em "Esconder". */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.DPPrimeirosPassos) return;
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    if (PAGE !== 'index') return;
    const DEMO = !!db.__isLocalDemo, OFFLINE = !!window.DISTRIBUIPRO_OFFLINE, DOC = DEMO ? 'demo_general' : 'general';
    const $ = id => document.getElementById(id);
    const I = n => (window.dpIcon ? window.dpIcon(n) : '');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const role = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } };
    const isBoss = () => ['admin', 'manager'].includes(role());
    const hasSegments = () => !!window.DPMenuCfg; // Mensal e demo têm o seletor de ramo
    const IOS = /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const standalone = () => { try { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; } catch (e) { return false; } };
    const COLLAPSE = 'dp_onb_min_v1';

    const STEPS = [
        { id: 'ramo', icon: 'store', t: 'Tipo do negócio', href: 'configuracoes.html', btn: 'Escolher', skip: true,
            d: () => hasSegments() ? 'Escolha o seu ramo: o menu passa a mostrar só o que serve para você.' : 'Ligue o que o seu negócio usa em Configurações › Empresa: Agenda, Pet shop, OS para veículos, Mesas...',
            check: g => !!g.segment || !!(window.DPMenuCfg && DPMenuCfg.cfg && DPMenuCfg.cfg.segment) || (!hasSegments() && ['agendaEnabled', 'petEnabled', 'osVehicleMode', 'osProEnabled', 'mesasEnabled'].some(k => typeof g[k] === 'boolean')) },
        { id: 'empresa', icon: 'building-2', t: 'Dados da empresa', href: 'configuracoes.html', btn: 'Preencher',
            d: () => 'Nome, CNPJ, telefone e endereço. Eles saem no cupom, na OS e no orçamento.',
            check: g => !!((g.nomeFantasia || g.razaoSocial) && (g.cnpj || g.telefone || g.whatsapp)) },
        { id: 'produtos', icon: 'package', t: 'Produtos e serviços', href: 'produtos.html', btn: 'Cadastrar', q: ['products', 1],
            d: () => 'Cadastre um por um ou traga todos de uma vez pela planilha (Produtos › Importar).' },
        { id: 'clientes', icon: 'users', t: 'Clientes', href: 'clientes.html', btn: 'Cadastrar', q: ['customers', 1],
            d: () => 'Traga a lista do caderno ou do sistema antigo pela planilha, já com o saldo do fiado.' },
        { id: 'pagamentos', icon: 'credit-card', t: 'Formas de pagamento e taxas', href: 'configuracoes.html#aba-vendas', btn: 'Conferir', skip: true,
            d: () => 'Confira as formas que você aceita e as taxas da maquininha, para o lucro sair certo.',
            check: g => !!(g.formasPagamentoAtivas || g.formasPagamentoExtras || g.taxasParcela || g.repasseTaxa || ['taxaPix', 'taxaDebito', 'taxaCreditoVisa', 'taxaCreditoMastercard', 'taxaCreditoElo'].some(k => g[k] !== undefined && g[k] !== '' && g[k] !== null)) },
        { id: 'equipe', icon: 'user-plus', t: 'Equipe', href: 'usuarios.html', btn: 'Adicionar', q: ['users', 2], skip: true,
            d: () => 'Crie o acesso de quem vende, atende ou cuida do caixa, cada um com a sua senha. Trabalha sozinho? Toque em "Já fiz".' },
        { id: 'venda', icon: 'scan-barcode', t: 'Abrir o caixa e fazer a primeira venda', href: 'pdv.html', btn: 'Ir para o PDV', q: ['sales', 1],
            d: () => 'No PDV, abra o caixa com o troco do dia e faça a primeira venda.' },
        { id: 'celular', icon: 'smartphone', t: 'Instalar no celular', btn: 'Instalar', install: true, skip: true, off: OFFLINE,
            d: () => IOS ? 'No iPhone: abra no Safari, toque em Compartilhar e depois em "Adicionar à Tela de Início".' : window.__dpInstall ? 'O sistema vira um app na tela do celular ou do computador, sem loja de aplicativos.' : 'No celular, abra este endereço no Chrome e toque em ⋮ › "Instalar app" (ou "Adicionar à tela inicial").',
            check: () => standalone() || (() => { try { return localStorage.getItem('dp_app_installed') === '1'; } catch (e) { return false; } })() }
    ].filter(s => !s.off);

    let general = {}, ob = { done: {} }, state = {};

    async function count(col, n) {
        try { const s = await db.collection(col).limit(n + 3).get(); return s.docs.filter(d => { const x = d.data() || {}; return x.deleted !== true; }).length >= n; } catch (e) { return false; }
    }
    async function evaluate() {
        try { const d = await db.collection('settings').doc(DOC).get(); general = d.exists ? (d.data() || {}) : {}; } catch (e) { general = {}; }
        ob = (general.onboarding && typeof general.onboarding === 'object') ? { done: {}, ...general.onboarding } : { done: {} };
        ob.done = { ...(ob.done || {}) };
        const res = await Promise.all(STEPS.map(async s => !!ob.done[s.id] || (s.check ? s.check(general) : false) || (s.q ? await count(s.q[0], s.q[1]) : false)));
        state = {}; STEPS.forEach((s, i) => { state[s.id] = res[i]; });
        // Guarda o que ficou pronto agora (assim os passos continuam marcados mesmo se o cadastro for apagado depois)
        const fresh = STEPS.filter(s => state[s.id] && !ob.done[s.id] && s.id !== 'celular');
        const all = STEPS.every(s => state[s.id]);
        if (fresh.length || (all && !ob.completedAt)) {
            fresh.forEach(s => { ob.done[s.id] = true; });
            if (all && !ob.completedAt) ob.completedAt = new Date().toISOString();
            saveOb();
        }
    }
    async function saveOb() {
        try { await db.collection('settings').doc(DOC).set({ onboarding: ob }, { merge: true }); } catch (e) { /* o gerente pode não ter permissão: só não guarda */ }
    }

    function render() {
        const host = document.querySelector('.page-content'); if (!host || !isBoss()) return;
        let card = $('dpOnb');
        const doneN = STEPS.filter(s => state[s.id]).length, total = STEPS.length, all = doneN === total;
        if (ob.hidden || (all && ob.completedAt && ob.seenDone)) { if (card) card.remove(); return; }
        if (!card) {
            card = document.createElement('div'); card.className = 'card dpo'; card.id = 'dpOnb';
            card.addEventListener('click', onClick);
            host.insertBefore(card, host.firstChild);
        }
        let min = false; try { min = localStorage.getItem(COLLAPSE) === '1'; } catch (e) { }
        const pct = Math.round(doneN / total * 100), R = 21, C = 2 * Math.PI * R;
        const next = STEPS.find(s => !state[s.id]);
        const steps = STEPS.map(s => {
            const ok = !!state[s.id], isNext = next && next.id === s.id;
            const act = ok ? '<span class="dpo-ok">Feito</span>'
                : s.install ? `${window.__dpInstall ? `<button type="button" class="btn btn-sm ${isNext ? 'btn-primary' : 'btn-outline'}" data-dpo="install">${I('download')} Instalar agora</button>` : ''}<button type="button" class="dpo-skip" data-dpo="skip" data-id="${s.id}">Já fiz</button>`
                    : `<a class="btn btn-sm ${isNext ? 'btn-primary' : 'btn-outline'}" href="${esc(s.href)}">${esc(s.btn)}</a>${s.skip ? `<button type="button" class="dpo-skip" data-dpo="skip" data-id="${s.id}">Já fiz</button>` : ''}`;
            return `<div class="dpo-step ${ok ? 'done' : ''} ${isNext ? 'next' : ''}"><span class="dpo-ic">${ok ? I('check') : I(s.icon)}</span><div class="dpo-tx"><b>${esc(s.t)}</b><small>${esc(s.d())}</small></div><div class="dpo-act">${act}</div></div>`;
        }).join('');
        card.classList.toggle('min', min);
        card.innerHTML = `<div class="dpo-h"><div class="dpo-ring" aria-hidden="true"><svg viewBox="0 0 50 50"><circle cx="25" cy="25" r="${R}" class="bg"/><circle cx="25" cy="25" r="${R}" class="fg" stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - doneN / total)).toFixed(1)}"/></svg><span>${doneN}/${total}</span></div>
<div class="dpo-ht"><b>${all ? 'Tudo pronto!' : 'Primeiros passos'}</b><small>${all ? 'O sistema está pronto para o dia a dia. Bom trabalho!' : `${pct}% feito · ${next ? 'Próximo: ' + esc(next.t.toLowerCase()) : ''}`}</small></div>
<div class="dpo-hb">${all ? `<button type="button" class="btn btn-sm btn-primary" data-dpo="close">${I('check')} Fechar</button>` : `<button type="button" class="dpo-icbtn" data-dpo="min" title="${min ? 'Mostrar os passos' : 'Recolher'}" aria-label="${min ? 'Mostrar os passos' : 'Recolher'}">${I(min ? 'chevron-down' : 'chevron-up')}</button><button type="button" class="dpo-icbtn" data-dpo="hide" title="Esconder" aria-label="Esconder">${I('x')}</button>`}</div></div>
${all ? '' : `<div class="dpo-list">${steps}</div>`}`;
        if (all && !ob.seenDone) { ob.seenDone = true; saveOb(); }
    }
    async function onClick(e) {
        const b = e.target.closest('[data-dpo]'); if (!b) return;
        const a = b.dataset.dpo;
        if (a === 'min') { const card = $('dpOnb'); const m = !card.classList.contains('min'); try { localStorage.setItem(COLLAPSE, m ? '1' : '0'); } catch (er) { } render(); return; }
        if (a === 'hide') { if (!confirm('Esconder os primeiros passos?\n\nO sistema continua igual. Você pode seguir os passos quando quiser pelo menu.')) return; ob.hidden = true; await saveOb(); render(); toast('info', 'Primeiros passos escondidos.'); return; }
        if (a === 'close') { ob.hidden = true; await saveOb(); render(); return; }
        if (a === 'skip') { ob.done[b.dataset.id] = true; if (b.dataset.id === 'celular') { try { localStorage.setItem('dp_app_installed', '1'); } catch (er) { } } state[b.dataset.id] = true; await saveOb(); render(); return; }
        if (a === 'install' && window.__dpInstall) {
            const p = window.__dpInstall;
            try { p.prompt(); const r = await p.userChoice; if (r && r.outcome === 'accepted') { window.__dpInstall = null; try { localStorage.setItem('dp_app_installed', '1'); } catch (er) { } state.celular = true; toast('success', 'Pronto! O sistema está na sua tela inicial.'); render(); } } catch (er) { }
        }
    }
    function css() {
        if ($('dpoCss')) return;
        const s = document.createElement('style'); s.id = 'dpoCss';
        s.textContent = `.dpo{padding:16px 18px!important;margin-bottom:18px;border:1px solid color-mix(in srgb,var(--accent,#6366f1) 30%,var(--border-color))!important}
.dpo-h{display:flex;align-items:center;gap:14px}.dpo-ht{flex:1;min-width:0}.dpo-ht b{display:block;font-size:15px;color:var(--text-heading)}.dpo-ht small{font-size:12.5px;color:var(--text-muted)}
.dpo-ring{position:relative;width:50px;height:50px;flex:none}.dpo-ring svg{width:50px;height:50px;transform:rotate(-90deg)}.dpo-ring circle{fill:none;stroke-width:5}.dpo-ring .bg{stroke:var(--bg-secondary,rgba(148,163,184,.2))}.dpo-ring .fg{stroke:var(--accent,#6366f1);stroke-linecap:round;transition:stroke-dashoffset .4s}
.dpo-ring span{position:absolute;inset:0;display:grid;place-items:center;font-size:12px;font-weight:800;color:var(--text-heading)}
.dpo-hb{display:flex;gap:6px;align-items:center}.dpo-icbtn{width:34px;height:34px;border-radius:10px;border:1px solid var(--border-color);background:transparent;color:var(--text-muted);display:grid;place-items:center;cursor:pointer}.dpo-icbtn:hover{color:var(--text-heading);border-color:var(--accent)}.dpo-icbtn svg{width:16px;height:16px}
.dpo-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:14px}.dpo.min .dpo-list{display:none}
.dpo-step{display:flex;align-items:center;gap:12px;padding:10px 12px;border:1px solid var(--border-color);border-radius:12px;background:var(--bg-card)}
.dpo-step.next{border-color:var(--accent);background:color-mix(in srgb,var(--accent,#6366f1) 6%,var(--bg-card))}
.dpo-ic{width:36px;height:36px;border-radius:10px;flex:none;display:grid;place-items:center;background:color-mix(in srgb,var(--accent,#6366f1) 12%,transparent);color:var(--accent)}.dpo-ic svg{width:18px;height:18px}
.dpo-step.done .dpo-ic{background:rgba(16,185,129,.14);color:#10b981}.dpo-step.done .dpo-tx b{color:var(--text-muted);text-decoration:line-through;text-decoration-color:rgba(148,163,184,.6)}
.dpo-step.done{padding:8px 12px}.dpo-step.done .dpo-tx small{display:none}.dpo-step.done .dpo-ic{width:30px;height:30px}
.dpo-tx{flex:1;min-width:0}.dpo-tx b{display:block;font-size:13.5px;color:var(--text-heading)}.dpo-tx small{display:block;font-size:11.5px;color:var(--text-muted);line-height:1.4}
.dpo-act{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex:none}.dpo-act .btn{white-space:nowrap}.dpo-act .btn svg{width:14px;height:14px;margin-right:4px;vertical-align:-2px}
.dpo-ok{font-size:11.5px;font-weight:700;color:#10b981}.dpo-skip{border:0;background:none;padding:2px 0;font-size:11px;color:var(--text-muted);cursor:pointer;text-decoration:underline}.dpo-skip:hover{color:var(--text-heading)}
@media(max-width:900px){.dpo-list{grid-template-columns:1fr}}
@media(max-width:520px){.dpo-step:not(.done){flex-wrap:wrap}.dpo-step:not(.done) .dpo-act{flex-direction:row;align-items:center;width:100%;justify-content:flex-end}.dpo-ht small{display:block}}`;
        document.head.appendChild(s);
    }

    async function run() {
        // espera o app saber quem entrou (o papel guardado no navegador pode ser de outro usuário)
        const me = () => { try { return typeof currentUser !== 'undefined' && currentUser && currentUser.role; } catch (e) { return ''; } };
        for (let i = 0; i < 32 && !me(); i++) await new Promise(r => setTimeout(r, 250));
        if (!isBoss() || (window.__DP_MYSQL__ && window.__DP_MYSQL__.support)) return; // o suporte só olha
        await evaluate(); css(); render();
    }
    window.DPPrimeirosPassos = { refresh: run, get state() { return { ...state }; } };
    let started = false;
    const go = () => { if (started) return; started = true; setTimeout(run, 400); };
    try { auth.onAuthStateChanged(u => { if (u) go(); }); } catch (e) { go(); }
    // Voltou para a aba depois de cadastrar algo em outra janela: confere de novo
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && started && $('dpOnb')) run(); });
    document.addEventListener('dp:install', () => { if ($('dpOnb')) render(); });
})();
