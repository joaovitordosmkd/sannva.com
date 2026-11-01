/* ==========================================================================
   DistribuiPro Demo · STUDIO v1 (pasta /teste2) — efeitos e funções novas
   - Números que contam, cartões que aparecem em cascata, brilho que segue o mouse,
     efeito de toque nos botões, troca de tema animada, barra de progresso entre páginas.
   - Paleta de comandos (Ctrl/⌘ + K ou "/"), atalhos (tecla "?"), tour guiado.
   - Celular: barra de navegação inferior e tabelas em cartões.
   - Compra: botão no cabeçalho, cartão no menu, sugestões no momento certo e confete após uma venda.
   ========================================================================== */
(() => {
  'use strict';
  if (window.__dpStudio) return; window.__dpStudio = true;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isLogin = file === 'login.html', isPdv = file === 'pdv.html', isDash = file === 'index.html' || file === '';
  const base = String(window.dpBasePath || '').replace(/\/$/, '');
  const checkoutUrl = base + '/checkout?plano=business';
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const ss = { get(k, d) { try { const v = sessionStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } }, set(k, v) { try { sessionStorage.setItem(k, JSON.stringify(v)); } catch {} } };
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  // Sistema do cliente (não é demo): sem botões e sugestões de compra.
  const SALES = !window.__stProduct && !document.documentElement.hasAttribute('data-st-product');
  const trackBuy = (label, where) => { try { window.dpAnalytics?.track?.('buy_click', 'business', { label, meta: { tracker: 'demo-studio', module: file, action: 'buy_from_demo', destination: '/checkout', target: where, result: 'attempt' } }); } catch {} };

  /* ---------- Fonte ---------- */
  // 37.8 · A Plus Jakarta Sans vem de assets/fonts (@font-face no studio-v1.css): nada é baixado do Google.

  /* ---------- Preço (Admin > Preços) ---------- */
  let price = ss.get('st_price', '');
  const paintPrice = () => { $$('[data-st-price]').forEach(el => { el.textContent = price || el.dataset.stFallback || ''; el.hidden = !el.textContent; }); $$('.st-buy-chip').forEach(c => c.classList.toggle('st-noprice', !price)); };
  function loadPrice() {
    if (!SALES) return; if (price) return paintPrice();
    fetch(base + '/api/public/config', { credentials: 'same-origin', cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      const c = Number(d?.plans?.business?.price); if (c > 0) { price = (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); ss.set('st_price', price); paintPrice(); }
    }).catch(() => {});
  }

  /* ---------- Menu lateral: começa aberto no computador (a escolha fica salva) ---------- */
  function sidebarPref() {
    const sb = $('#sidebar'); if (!sb || isPdv || !matchMedia('(min-width:1025px)').matches) return;
    const pref = ls.get('st_sidebar', 'open');
    sb.classList.toggle('collapsed', pref === 'collapsed');
    const icon = $('#sidebarToggleIcon'); if (icon) icon.className = pref === 'collapsed' ? 'fas fa-angles-right' : 'fas fa-angles-left';
  }
  function wrapToggleSidebar() {
    if (typeof window.toggleSidebar !== 'function' || window.toggleSidebar.__st) return;
    const orig = window.toggleSidebar; const w = function () { orig.apply(this, arguments); ls.set('st_sidebar', $('#sidebar')?.classList.contains('collapsed') ? 'collapsed' : 'open'); };
    w.__st = true; window.toggleSidebar = w;
  }

  /* ---------- Troca de tema animada (círculo a partir do clique) ---------- */
  let lastClick = { x: innerWidth - 80, y: 40 };
  document.addEventListener('pointerdown', e => { lastClick = { x: e.clientX, y: e.clientY }; }, true);
  function wrapToggleTheme() {
    if (typeof window.toggleTheme !== 'function' || window.toggleTheme.__st) return;
    const orig = window.toggleTheme;
    const w = function () {
      if (!document.startViewTransition || reduce) return orig.apply(this, arguments);
      const { x, y } = lastClick; const r = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
      const t = document.startViewTransition(() => orig.apply(this, arguments));
      t.ready.then(() => document.documentElement.animate({ clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] }, { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)', pseudoElement: '::view-transition-new(root)' })).catch(() => {});
    };
    w.__st = true; window.toggleTheme = w;
    if (!$('#st-vt')) { const s = document.createElement('style'); s.id = 'st-vt'; s.textContent = '::view-transition-old(root),::view-transition-new(root){animation:none;mix-blend-mode:normal}'; document.head.appendChild(s); }
  }

  /* ---------- Efeito de toque (ripple) ---------- */
  document.addEventListener('pointerdown', e => {
    if (reduce) return;
    const el = e.target.closest?.('.btn,.menu-item,.header-action,.st-tabbar a,.cat-btn,.st-buy-chip,.st-hero-actions a'); if (!el) return;
    const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2.2;
    const s = document.createElement('span'); s.className = 'st-ripple';
    s.style.cssText = `width:${d}px;height:${d}px;left:${e.clientX - r.left - d / 2}px;top:${e.clientY - r.top - d / 2}px`;
    // 35.48 · Só fica "relative + overflow:hidden" enquanto a onda aparece. Antes ficava assim para sempre e,
    // numa fileira que não cabe na tela (abas de categoria do PDV), o navegador espremia só os botões já clicados.
    if (!el.__stRipple) el.__stRipple = { position: el.style.position, overflow: el.style.overflow, n: 0 };
    el.__stRipple.n++;
    if (getComputedStyle(el).position === 'static') el.style.position = 'relative';
    el.style.overflow = 'hidden'; el.appendChild(s);
    setTimeout(() => { s.remove(); const st = el.__stRipple; if (st && --st.n <= 0) { el.style.position = st.position; el.style.overflow = st.overflow; delete el.__stRipple; } }, 650);
  }, { passive: true });

  /* ---------- Brilho que segue o mouse nos cartões ---------- */
  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('.stat-card'); if (!c) return;
    const r = c.getBoundingClientRect(); c.style.setProperty('--mx', (e.clientX - r.left) + 'px'); c.style.setProperty('--my', (e.clientY - r.top) + 'px');
  }, { passive: true });

  /* ---------- Aparecer em cascata ---------- */
  function reveal() {
    if (reduce) return;
    const items = $$('.page-content .stat-card, .page-content .card, .page-content .table-container, .page-content .st-hero, .page-content .chart-card');
    const io = 'IntersectionObserver' in window ? new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('st-in'); io.unobserve(en.target); } }), { threshold: .08 }) : null;
    items.forEach((el, i) => { if (el.dataset.stRev) return; el.dataset.stRev = '1'; el.classList.add('st-reveal'); el.style.transitionDelay = Math.min(i, 10) * 45 + 'ms'; io ? io.observe(el) : el.classList.add('st-in'); });
    setTimeout(() => items.forEach(el => el.classList.add('st-in')), 1600); // segurança: nunca deixa nada escondido
  }

  /* ---------- Números que contam ---------- */
  const parseNum = txt => { const m = String(txt).match(/-?[\d.]+(?:,\d+)?|-?\d+(?:\.\d+)?/); if (!m) return null; const raw = m[0]; const hasComma = raw.includes(','); const n = hasComma ? Number(raw.replace(/\./g, '').replace(',', '.')) : Number(raw.replace(/\.(?=\d{3}\b)/g, '')); return isFinite(n) ? { n, raw, dec: hasComma ? raw.split(',')[1].length : 0 } : null; };
  function countUp(el) {
    if (reduce || el.dataset.stCounting) return;
    const txt = el.textContent; const p = parseNum(txt); if (!p || Math.abs(p.n) < 2) return;
    const fmt = v => txt.replace(p.raw, v.toLocaleString('pt-BR', { minimumFractionDigits: p.dec, maximumFractionDigits: p.dec }));
    el.dataset.stCounting = '1'; const t0 = performance.now(), dur = 900;
    const step = now => { const k = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - k, 3); el.textContent = fmt(p.n * e); if (k < 1) requestAnimationFrame(step); else { el.textContent = txt; setTimeout(() => delete el.dataset.stCounting, 50); } };
    requestAnimationFrame(step);
  }
  function watchStats() {
    $$('.stat-value').forEach(el => {
      if (el.dataset.stWatch) return; el.dataset.stWatch = '1';
      let last = el.textContent;
      new MutationObserver(() => { if (el.dataset.stCounting) return; const t = el.textContent; if (t !== last) { last = t; countUp(el); } }).observe(el, { childList: true, characterData: true, subtree: true });
      if (/\d/.test(last) && !/^0([,.]0+)?$/.test(last.replace(/[^\d,.]/g, ''))) countUp(el);
    });
  }

  /* ---------- Barra de progresso entre páginas ---------- */
  function progressNav() {
    const bar = document.createElement('div'); bar.id = 'st-progress'; document.body.appendChild(bar);
    document.addEventListener('click', e => {
      const a = e.target.closest?.('a[href]'); if (!a || e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || a.target === '_blank') return;
      const href = a.getAttribute('href'); if (!href || href.startsWith('#') || href.startsWith('javascript')) return;
      let u; try { u = new URL(href, location.href); } catch { return; } if (u.origin !== location.origin || u.pathname === location.pathname) return;
      bar.style.opacity = '1'; bar.style.width = '35%'; setTimeout(() => bar.style.width = '75%', 180); document.body.classList.add('st-leaving');
    });
    window.addEventListener('pageshow', () => { bar.style.width = '0'; document.body.classList.remove('st-leaving'); });
  }

  /* ---------- Saudação no Dashboard ---------- */
  // 39.16 · Banner com fundo em imagem e atalhos que o cliente escolhe (menu "Atalhos" no canto superior direito).
  // A escolha fica salva neste aparelho (st_hero_links). Só entram páginas que o usuário vê no menu lateral
  // (o menu já esconde o que o perfil/módulo não libera), então um atalho nunca leva a "acesso não autorizado".
  const HERO_KEY = 'st_hero_links', HERO_MAX = 6, HERO_DEF = ['pdv.html', 'produtos.html', 'pedidos.html', 'relatorios.html'];
  const heroEsc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const heroSaved = () => { try { const v = JSON.parse(ls.get(HERO_KEY, 'null')); return Array.isArray(v) ? v.filter(h => typeof h === 'string') : null; } catch { return null; } };
  function heroPages() {
    const out = []; let group = '';
    $$('#sidebar .menu-section, #sidebar a.menu-item[href]').forEach(el => {
      if (el.classList.contains('menu-section')) { group = el.textContent.trim(); return; }
      const href = (el.getAttribute('href') || '').split(/[?#]/)[0];
      if (!/^[a-z0-9-]+\.html$/i.test(href) || href === 'index.html' || out.some(p => p.href === href)) return;
      if (getComputedStyle(el).display === 'none') return;
      const t = el.querySelector('.menu-text'); const own = t ? [...t.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent).join('').trim() : '';
      const ic = ((el.querySelector('i[class*="fa-"]')?.className || '').match(/fa-[a-z0-9-]+/g) || []).find(c => !['fa-fw', 'fa-solid', 'fa-regular'].includes(c)) || 'fa-circle';
      out.push(href === 'pdv.html' ? { href, label: 'Nova venda', icon: 'fa-plus', group, main: true } : { href, label: own || t?.textContent.trim() || href.replace('.html', ''), icon: ic, group });
    });
    return out;
  }
  function heroPaint(force) {
    const el = $('.st-hero-v2'); if (!el) return;
    const pages = heroPages(), pick = heroSaved() || HERO_DEF;
    const list = pick.map(h => pages.find(p => p.href === h)).filter(Boolean).slice(0, HERO_MAX);
    const brand = (() => { try { return window.BrandingManager?.getBrand?.()?.companyName || ''; } catch { return ''; } })() || 'DistribuiPro';
    const k = $('.st-hero-kicker', el); if (k && k.textContent !== brand) k.textContent = brand;
    const box = $('.st-hero-actions', el), sig = list.map(p => p.href + p.label).join('|');
    if (box && (force || box.dataset.sig !== sig)) {
      box.dataset.sig = sig; box.hidden = !list.length;
      box.innerHTML = list.map(p => `<a href="${p.href}" class="${p.main ? 'st-hl-main' : ''}"><span class="st-hl-ic"><i class="fas ${p.icon}"></i></span><span class="st-hl-t">${heroEsc(p.label)}</span><span class="st-hl-go"><i class="fas ${p.main ? 'fa-angles-right' : 'fa-chevron-right'}"></i></span></a>`).join('');
    }
    const pop = $('.st-hero-pop', el); if (pop && !pop.hidden) heroPopPaint(pop, pages);
  }
  function heroPopPaint(pop, pages) {
    const pick = (heroSaved() || HERO_DEF).filter(h => pages.some(p => p.href === h)), full = pick.length >= HERO_MAX;
    const groups = []; pages.forEach(p => { let g = groups.find(x => x.name === p.group); if (!g) groups.push(g = { name: p.group, items: [] }); g.items.push(p); });
    $('.st-hm-count', pop).textContent = `${pick.length} de ${HERO_MAX}`;
    $('.st-hm-list', pop).innerHTML = groups.map(g => (g.name ? `<div class="st-hm-group">${heroEsc(g.name)}</div>` : '') + g.items.map(p => {
      const on = pick.includes(p.href);
      return `<label class="st-hm-item${on ? ' st-on' : ''}${!on && full ? ' st-off' : ''}"><input type="checkbox" value="${p.href}"${on ? ' checked' : ''}${!on && full ? ' disabled' : ''}><span class="st-hm-ic${p.main ? ' st-main' : ''}"><i class="fas ${p.icon}"></i></span><span class="st-hm-t">${heroEsc(p.label)}</span><span class="st-hm-ck"><i class="fas fa-check"></i></span></label>`;
    }).join('')).join('');
  }
  function heroMenu(el) {
    const btn = $('.st-hero-menu-btn', el), pop = $('.st-hero-pop', el);
    const close = () => { if (pop.hidden) return; pop.hidden = true; btn.setAttribute('aria-expanded', 'false'); el.classList.remove('st-pop-open'); };
    const open = () => { heroPopPaint(pop, heroPages()); pop.hidden = false; btn.setAttribute('aria-expanded', 'true'); el.classList.add('st-pop-open'); };
    btn.addEventListener('click', e => { e.stopPropagation(); pop.hidden ? open() : close(); });
    pop.addEventListener('change', e => {
      const cb = e.target.closest('input[type=checkbox]'); if (!cb) return;
      const pages = heroPages(); let pick = (heroSaved() || HERO_DEF).filter(h => pages.some(p => p.href === h));
      pick = cb.checked ? [...pick.filter(h => h !== cb.value), cb.value].slice(0, HERO_MAX) : pick.filter(h => h !== cb.value);
      ls.set(HERO_KEY, JSON.stringify(pick)); heroPopPaint(pop, pages); heroPaint();
    });
    $('[data-hm-reset]', pop).addEventListener('click', () => { ls.set(HERO_KEY, JSON.stringify(HERO_DEF)); heroPopPaint(pop, heroPages()); heroPaint(); });
    $('[data-hm-close]', pop).addEventListener('click', close);
    document.addEventListener('click', e => { if (!pop.hidden && !e.target.closest('.st-hero-menu')) close(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape' && !pop.hidden) { close(); btn.focus(); } });
  }
  function hero() {
    if (!isDash || $('.st-hero')) return; const pc = $('.page-content'); if (!pc) return;
    const h = new Date().getHours(); const hi = h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
    const d = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });
    const sun = window.dpIcon ? window.dpIcon(h < 12 ? 'sunrise' : h < 18 ? 'sun' : 'moon-star') : '';
    const el = document.createElement('section'); el.className = 'st-hero st-hero-v2';
    el.innerHTML = `<div class="st-hero-main"><span class="st-hero-kicker"></span><h1>${hi}! <span class="st-hero-sun${h >= 18 ? ' st-night' : ''}">${sun || `<i class="fas fa-${h < 18 ? 'sun' : 'moon'}"></i>`}</span></h1><p>Hoje é ${d}. Aqui está o resumo do seu negócio.</p><div class="st-hero-actions"></div></div>
      <div class="st-hero-menu"><button type="button" class="st-hero-menu-btn" aria-haspopup="true" aria-expanded="false" title="Escolher os atalhos do banner"><i class="fas fa-sliders"></i><span>Atalhos</span></button>
        <div class="st-hero-pop" role="dialog" aria-label="Atalhos do banner" hidden><div class="st-hm-head"><div><b>Atalhos do banner <span class="st-hm-count"></span></b><small>Escolha até ${HERO_MAX} telas para abrir com um toque.</small></div><button type="button" class="st-hm-x" data-hm-close aria-label="Fechar"><i class="fas fa-xmark"></i></button></div>
          <div class="st-hm-list"></div>
          <div class="st-hm-foot"><button type="button" data-hm-reset><i class="fas fa-rotate-left"></i> Restaurar padrão</button><button type="button" class="st-hm-ok" data-hm-close>Pronto</button></div></div></div>`;
    pc.insertBefore(el, pc.firstChild);
    heroMenu(el); heroPaint(true);
    // O menu lateral pode esconder páginas depois (permissões/módulos carregam em seguida): os atalhos acompanham.
    let t = 0; const later = () => { clearTimeout(t); t = setTimeout(() => heroPaint(), 150); };
    const sb = $('#sidebar'); if (sb) new MutationObserver(later).observe(sb, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'class', 'hidden'] });
    new MutationObserver(later).observe(document.head, { childList: true });
    window.addEventListener('load', later); setTimeout(later, 1500); setTimeout(later, 4000);
  }

  /* ---------- Cabeçalho: paleta + botão de compra ---------- */
  function headerExtras() {
    const right = $('.header .header-right'), pdvH = $('.pdv-header');
    if (right && !$('.st-cmd-btn', right)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'st-cmd-btn'; b.setAttribute('aria-label', 'Buscar telas e ações (Ctrl+K)');
      b.innerHTML = '<i class="fas fa-magnifying-glass"></i><span>Buscar telas e ações…</span><span class="st-kbd">' + (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl') + ' K</span>';
      b.onclick = openPalette; right.insertBefore(b, right.firstChild);
    }
    const host = right || pdvH;
    if (SALES && host && !$('.st-buy-chip', host)) {
      const a = document.createElement('a'); a.className = 'st-buy-chip'; a.href = checkoutUrl;
      a.innerHTML = '<i class="fas fa-bag-shopping"></i><span class="st-l">Quero o meu</span><small data-st-price data-st-fallback=""></small>';
      a.addEventListener('click', () => trackBuy('Quero o meu · cabeçalho', 'header'));
      if (right) right.insertBefore(a, $('.st-cmd-btn', right)?.nextSibling || right.firstChild); else host.appendChild(a);
      paintPrice();
    }
  }
  function sideCta() {
    const menu = $('#sidebar .sidebar-menu'); if (!SALES || !menu || $('#sidebar .st-side-cta')) return;
    const box = document.createElement('div'); box.className = 'st-side-cta';
    box.innerHTML = '<b>Gostou do que viu?</b><p>Tenha este sistema na sua empresa. Pagamento único <span data-st-price data-st-fallback=""></span>, sem mensalidade.</p><a href="' + checkoutUrl + '">Quero o meu</a>';
    box.querySelector('a').addEventListener('click', () => trackBuy('Quero o meu · menu lateral', 'sidebar'));
    menu.appendChild(box); paintPrice();
  }

  /* ---------- Barra inferior (celular) ---------- */
  function tabbar() {
    if (isLogin || $('.st-tabbar')) return;
    const nav = document.createElement('nav'); nav.className = 'st-tabbar'; nav.setAttribute('aria-label', 'Navegação rápida');
    // 30.3 · Início e Vender ficam fixos; as duas vagas do meio são as páginas que o cliente mais abre
    // neste aparelho (padrão: Pedidos e Produtos). Uma página só toma a vaga depois de 3 aberturas.
    const FIXED = ['index.html', 'pdv.html'], SKIP = ['login.html', 'foto-os.html', 'acompanhar-os.html'];
    const SHORT = { 'ordens-servico.html': 'OS', 'orcamentos.html': 'Orçam.', 'contas-pagar.html': 'A pagar', 'contas-receber.html': 'A receber', 'fluxo-caixa.html': 'Fluxo', 'movimentacoes.html': 'Movim.', 'configuracoes.html': 'Ajustes', 'fornecedores.html': 'Fornec.', 'relatorios.html': 'Relatórios', 'comissoes.html': 'Comissões', 'categorias.html': 'Categorias' };
    let visits = {}; try { visits = JSON.parse(localStorage.getItem('st_page_visits') || '{}') || {}; } catch { visits = {}; }
    if (file && !FIXED.includes(file) && !SKIP.includes(file) && $(`#sidebar .menu-item[href="${file}"]`)) { visits[file] = (visits[file] || 0) + 1; try { localStorage.setItem('st_page_visits', JSON.stringify(visits)); } catch { } }
    const defaults = ['pedidos.html', 'produtos.html'];
    const ranked = Object.entries(visits).filter(([h, n]) => n >= 3 && !FIXED.includes(h) && $(`#sidebar .menu-item[href="${h}"]`)).sort((a, b) => b[1] - a[1] || defaults.indexOf(b[0]) - defaults.indexOf(a[0])).map(([h]) => h);
    const picks = [...ranked, ...defaults].filter((h, i, a) => a.indexOf(h) === i).slice(0, 2);
    const info = h => { const a = $(`#sidebar .menu-item[href="${h}"]`); const ic = (a?.querySelector('i')?.className.match(/fa-[a-z0-9-]+/g) || []).find(c => !['fa-fw', 'fa-solid', 'fa-regular'].includes(c)) || 'fa-circle'; return [h, ic, SHORT[h] || a?.querySelector('.menu-text')?.textContent.trim() || h.replace('.html', '')]; };
    const items = [['index.html', 'fa-chart-pie', 'Início'], info(picks[0]), ['pdv.html', 'fa-cash-register', 'Vender', 'st-tab-pdv'], info(picks[1])];
    nav.innerHTML = items.map(([h, i, t, c]) => `<a href="${h}" class="${c || ''} ${file === h ? 'st-on' : ''}"><i class="fas ${i}"></i><span>${t}</span></a>`).join('') + '<a href="#" data-st-menu><i class="fas fa-bars"></i><span>Menu</span></a>';
    nav.querySelector('[data-st-menu]').addEventListener('click', e => { e.preventDefault(); if (typeof window.toggleMobileSidebar === 'function') window.toggleMobileSidebar(); });
    document.body.appendChild(nav);
  }

  /* ---------- Tabelas → cartões (celular) ---------- */
  const onlyControls = td => { const c = td.cloneNode(true); c.querySelectorAll('button,a,i,svg,.btn-icon,input[type=checkbox]').forEach(x => x.remove()); return c.textContent.trim() === '' && td.querySelector('button,a,.btn-icon'); };
  function cardify(table) {
    if (!table.tBodies.length) return; const ths = [...(table.tHead ? table.tHead.querySelectorAll('th') : [])].map(th => th.textContent.replace(/\s+/g, ' ').trim()); if (!ths.length) return;
    table.classList.add('st-cards'); table.closest('.table-container')?.classList.add('st-wrap');
    for (const tr of table.tBodies[0].rows) {
      if (tr.dataset.st === String(tr.cells.length)) continue; let titled = false;
      [...tr.cells].forEach((td, i) => {
        td.classList.remove('st-title', 'st-check', 'st-actions', 'st-full', 'st-empty');
        if (tr.cells.length === 1 || td.colSpan > 2) { td.classList.add('st-full'); return; }
        const label = ths[i] || ''; td.setAttribute('data-label', label);
        if (td.querySelector('input[type=checkbox]') && td.textContent.trim() === '' && td.querySelectorAll('*').length <= 2) { td.classList.add('st-check'); return; }
        if (td.classList.contains('actions-cell') || td.querySelector('.actions-cell') || /^a[çc][õo]es$/i.test(label) || onlyControls(td)) { td.classList.add('st-actions'); return; }
        if (!td.textContent.trim() && !td.querySelector('img,svg,i,span,input,select')) { td.classList.add('st-empty'); return; }
        if (!titled) { td.classList.add('st-title'); titled = true; }
      });
      tr.dataset.st = String(tr.cells.length);
    }
    // 37.8 · linha de TOTAL (tfoot) também vira cartão, com o nome de cada coluna
    if (table.tFoot) for (const tr of table.tFoot.rows) {
      if (tr.dataset.st === String(tr.cells.length)) continue; let col = 0;
      [...tr.cells].forEach((td, i) => { const span = td.colSpan || 1; td.classList.toggle('st-title', i === 0); if (i > 0) td.setAttribute('data-label', ths[col] || ''); col += span; });
      tr.dataset.st = String(tr.cells.length);
    }
  }
  let cardT = 0; const cardAll = () => { clearTimeout(cardT); cardT = setTimeout(() => $$('table.data-table, .table-container table').forEach(cardify), 60); };

  /* ---------- Paleta de comandos ---------- */
  let palette = null;
  function commands() {
    const pages = $$('#sidebar .menu-item[href]').map(a => ({ group: 'Telas', icon: (a.querySelector('i')?.className || 'fas fa-circle').replace(/\s*fa-fw/, ''), label: a.querySelector('.menu-text')?.textContent.trim() || a.textContent.trim(), href: a.getAttribute('href'), hint: '' }));
    const acts = [
      { group: 'Ações', icon: 'fas fa-cash-register', label: 'Nova venda no PDV', href: 'pdv.html', hint: 'G V' },
      { group: 'Ações', icon: 'fas fa-box', label: 'Cadastrar produto', href: 'produtos.html', hint: 'G P' },
      { group: 'Ações', icon: 'fas fa-user-plus', label: 'Cadastrar cliente', href: 'clientes.html', hint: 'G C' },
      { group: 'Ações', icon: 'fas fa-circle-half-stroke', label: 'Alternar tema claro/escuro', run: () => window.toggleTheme?.(), hint: 'T' },
      { group: 'Ações', icon: 'fas fa-route', label: 'Fazer o tour guiado', run: () => startTour(true) },
      { group: 'Ações', icon: 'fas fa-keyboard', label: 'Ver atalhos do teclado', run: showHelp, hint: '?' },
      { group: 'DistribuiPro', icon: 'fas fa-bag-shopping', label: 'Quero o meu DistribuiPro', href: checkoutUrl, buy: true, hint: price || '' }
    ].filter(c => SALES || !c.buy);
    return [...acts.slice(0, 3), ...pages, ...acts.slice(3, 4), ...(window.__stExtraCmds || []), ...acts.slice(4)];
  }
  function openPalette() {
    if (palette) return; const cmds = commands(); let sel = 0, shown = cmds;
    const bg = document.createElement('div'); bg.className = 'st-palette-bg'; bg.setAttribute('role', 'dialog'); bg.setAttribute('aria-label', 'Buscar telas e ações');
    bg.innerHTML = '<div class="st-palette"><div class="st-palette-in"><i class="fas fa-magnifying-glass"></i><input type="text" placeholder="Buscar telas e ações… (ex.: estoque, nova venda, tema)" aria-label="Buscar"><span class="st-kbd">Esc</span></div><div class="st-palette-list" role="listbox"></div><div class="st-palette-foot"><span><span class="st-kbd">↑</span> <span class="st-kbd">↓</span> navegar</span><span><span class="st-kbd">Enter</span> abrir</span><span><span class="st-kbd">?</span> atalhos</span></div></div>';
    const input = $('input', bg), list = $('.st-palette-list', bg);
    const render = () => {
      if (!shown.length) { list.innerHTML = '<div class="st-palette-empty">Nada encontrado. Tente “produtos”, “caixa” ou “relatórios”.</div>'; return; }
      let g = ''; list.innerHTML = shown.map((c, i) => { const head = c.group !== g ? `<div class="st-palette-group">${(g = c.group)}</div>` : ''; return head + `<div class="st-palette-item ${i === sel ? 'st-sel' : ''} ${c.buy ? 'st-buy' : ''}" role="option" data-i="${i}"><i class="${c.icon}"></i><span>${c.label}</span><small>${c.hint || ''}</small></div>`; }).join('');
      list.querySelector('.st-sel')?.scrollIntoView({ block: 'nearest' });
    };
    const run = c => { if (!c) return; close(); if (c.buy) trackBuy('Quero o meu · paleta de comandos', 'palette'); if (c.run) c.run(); else if (c.href) location.href = c.href; };
    const close = () => { bg.classList.remove('st-open'); setTimeout(() => bg.remove(), 200); palette = null; };
    input.addEventListener('input', () => { const q = norm(input.value); shown = q ? cmds.filter(c => norm(c.label + ' ' + c.group).includes(q) || q.split(' ').every(w => norm(c.label).includes(w))) : cmds; sel = 0; render(); });
    input.addEventListener('keydown', e => { if (e.key === 'ArrowDown') { sel = Math.min(shown.length - 1, sel + 1); render(); e.preventDefault(); } else if (e.key === 'ArrowUp') { sel = Math.max(0, sel - 1); render(); e.preventDefault(); } else if (e.key === 'Enter') { run(shown[sel]); } else if (e.key === 'Escape') close(); });
    list.addEventListener('click', e => { const it = e.target.closest('.st-palette-item'); if (it) run(shown[+it.dataset.i]); });
    list.addEventListener('mousemove', e => { const it = e.target.closest('.st-palette-item'); if (it && +it.dataset.i !== sel) { sel = +it.dataset.i; $$('.st-palette-item', list).forEach(x => x.classList.toggle('st-sel', x === it)); } });
    bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.body.appendChild(bg); palette = bg; render(); requestAnimationFrame(() => bg.classList.add('st-open')); setTimeout(() => input.focus(), 30);
  }

  /* ---------- Atalhos ---------- */
  function showHelp() {
    if ($('.st-help')) return; const k = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl';
    const rows = [[k + ' + K ou /', 'Buscar telas e ações'], ['G depois D', 'Dashboard'], ['G depois V', 'PDV / nova venda'], ['G depois P', 'Produtos'], ['G depois C', 'Clientes'], ['G depois O', 'Pedidos'], ['G depois R', 'Relatórios'], ['T', 'Alternar tema'], ['?', 'Esta ajuda']];
    const el = document.createElement('div'); el.className = 'st-help';
    el.innerHTML = '<div class="st-help-box" role="dialog" aria-label="Atalhos do teclado"><h3>Atalhos do teclado</h3>' + rows.map(([a, b]) => `<div class="st-help-row"><span>${b}</span><span class="st-kbd">${a}</span></div>`).join('') + '</div>';
    el.addEventListener('click', e => { if (e.target === el) el.remove(); }); document.body.appendChild(el);
  }
  let gMode = 0;
  document.addEventListener('keydown', e => {
    // 39.13 · o preenchimento automático do navegador manda keydown sem tecla (e.key vazio): sem isso dava erro aqui
    const k = typeof e.key === 'string' ? e.key.toLowerCase() : ''; if (!k) return;
    const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName) || document.activeElement?.isContentEditable;
    if ((e.ctrlKey || e.metaKey) && k === 'k') { e.preventDefault(); palette ? null : openPalette(); return; }
    if (e.key === 'Escape') { $('.st-help')?.remove(); return; }
    if (typing || e.ctrlKey || e.metaKey || e.altKey || isLogin) return;
    if (e.key === '/') { e.preventDefault(); openPalette(); return; }
    if (e.key === '?') { showHelp(); return; }
    if (k === 't') { window.toggleTheme?.(); return; }
    if (k === 'g') { gMode = Date.now(); return; }
    if (Date.now() - gMode < 1200) { const map = { d: 'index.html', v: 'pdv.html', p: 'produtos.html', c: 'clientes.html', o: 'pedidos.html', r: 'relatorios.html' }; const to = map[k]; if (to) { gMode = 0; location.href = to; } }
  });

  /* ---------- Sugestões de compra no momento certo + confete após venda ---------- */
  const NUDGE = { sale: ['fa-circle-check', 'Venda registrada! É assim no dia a dia.', 'Agora imagine isso na sua loja: PDV, estoque e financeiro funcionando juntos, sem mensalidade.'],
    explore: ['fa-compass', 'Você já conheceu boa parte do sistema.', 'Tudo o que você está testando vem no pacote: código-fonte, instalador e manuais.'],
    time: ['fa-clock', 'Está gostando do teste?', 'O DistribuiPro completo é seu com um pagamento único. Sem mensalidade de licença.'] };
  const canNudge = () => { const s = ss.get('st_nudge', { n: 0, at: 0 }); return s.n < 2 && Date.now() - s.at > 6 * 60000; };
  function nudge(kind) {
    if (isLogin || $('.st-nudge') || !canNudge()) return;
    if (isPdv && $('#pdvCart')?.classList.contains('open')) { setTimeout(() => nudge(kind), 4000); return; }
    const s = ss.get('st_nudge', { n: 0, at: 0 }); ss.set('st_nudge', { n: s.n + 1, at: Date.now() });
    const [ico, title, text] = NUDGE[kind] || NUDGE.time;
    const el = document.createElement('div'); el.className = 'st-nudge'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Sugestão');
    el.innerHTML = `<button class="st-x" type="button" aria-label="Fechar">×</button><div class="st-ico"><i class="fas ${ico}"></i></div><h4>${title}</h4><p>${text}</p><a class="st-go" href="${checkoutUrl}">Quero o meu <span data-st-price data-st-fallback=""></span></a><button class="st-later" type="button">Continuar testando</button>`;
    const close = () => { el.classList.remove('st-open'); setTimeout(() => el.remove(), 320); };
    $('.st-x', el).onclick = close; $('.st-later', el).onclick = close;
    $('.st-go', el).addEventListener('click', () => trackBuy('Quero o meu · sugestão (' + kind + ')', 'nudge_' + kind));
    document.body.appendChild(el); paintPrice(); requestAnimationFrame(() => el.classList.add('st-open'));
  }
  function confetti() {
    if (reduce) return; const c = document.createElement('canvas'); c.className = 'st-confetti'; c.width = innerWidth; c.height = innerHeight; document.body.appendChild(c);
    const g = c.getContext('2d'), cols = ['#6366f1', '#a855f7', '#22d3ee', '#10b981', '#f59e0b', '#ec4899'];
    const ps = Array.from({ length: 140 }, () => ({ x: innerWidth / 2 + (Math.random() - .5) * 120, y: innerHeight * .45, vx: (Math.random() - .5) * 14, vy: -Math.random() * 14 - 4, s: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - .5) * .3, c: cols[(Math.random() * cols.length) | 0] }));
    const t0 = performance.now();
    const tick = now => { g.clearRect(0, 0, c.width, c.height); ps.forEach(p => { p.vy += .38; p.x += p.vx; p.y += p.vy; p.r += p.vr; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillStyle = p.c; g.fillRect(-p.s / 2, -p.s / 2, p.s, p.s * .6); g.restore(); }); if (now - t0 < 2200) requestAnimationFrame(tick); else c.remove(); };
    requestAnimationFrame(tick);
  }
  function moments() {
    const seen = ss.get('st_pages', []); if (!seen.includes(file)) { seen.push(file); ss.set('st_pages', seen); }
    if (seen.length >= 5) setTimeout(() => nudge('explore'), 2500);
    setInterval(() => { if (document.hidden) return; const t = ss.get('st_time', 0) + 15; ss.set('st_time', t); if (t >= 240 && t < 255) nudge('time'); }, 15000);
    let tries = 0; const hook = setInterval(() => {
      try { if (typeof AuditService !== 'undefined' && AuditService?.log && !AuditService.__stHooked) { const orig = AuditService.log.bind(AuditService); AuditService.log = async (action, module, ...rest) => { const out = await orig(action, module, ...rest); if (!window.__dpDemoSeeding && String(module) === 'sales' && String(action) === 'create') { confetti(); setTimeout(() => nudge('sale'), 1600); } return out; }; AuditService.__stHooked = true; clearInterval(hook); } } catch {}
      if (++tries > 40) clearInterval(hook);
    }, 500);
  }

  /* ---------- Tour guiado (primeira visita ao Dashboard) ---------- */
  function startTour(force) {
    if (!force && (ls.get('st_tour_done', '') || !isDash)) return;
    const desk = matchMedia('(min-width:1025px)').matches;
    const steps = [
      [desk ? '#sidebar' : '.st-tabbar', 'Tudo à mão', desk ? 'Aqui ficam todas as áreas do sistema: vendas, estoque, financeiro e cadastros.' : 'Use a barra de baixo para ir às telas principais. Em “Menu” estão todas as outras.'],
      ['.stat-grid', 'Seus números em tempo real', 'Faturamento, pedidos e estoque baixo atualizam sozinhos conforme você vende.'],
      ['.st-cmd-btn', 'Encontre qualquer coisa', 'Toque aqui (ou aperte Ctrl+K) e digite o que quer fazer: “nova venda”, “estoque”, “tema”…'],
      ['.st-buy-chip', 'Gostou? Ele pode ser seu', 'O sistema completo, com código-fonte, por um pagamento único. Continue testando à vontade!']
    ].filter(([s]) => { const el = $(s); return el && el.getBoundingClientRect().width > 0; });
    if (!steps.length) return;
    let i = 0; const hole = document.createElement('div'); hole.className = 'st-tour-hole'; const tip = document.createElement('div'); tip.className = 'st-tour-tip'; tip.setAttribute('role', 'dialog');
    document.body.append(hole, tip);
    // 39.2 · O item do passo pode estar abaixo da tela (ex.: o quadro "Primeiros passos" empurrou os números para baixo no
    // celular): rola até ele, acompanha a rolagem e o balão nunca sai da tela. Antes ficava só o fundo escuro e o cliente travava.
    const onScroll = () => place(false), onResize = () => place(false);
    // capture: a rolagem pode ser do <html> ou de outra caixa (não só da janela); o evento de rolagem não sobe sozinho
    const end = () => { hole.remove(); tip.remove(); ls.set('st_tour_done', '1'); window.removeEventListener('resize', onResize); window.removeEventListener('scroll', onScroll, true); };
    const place = (novo = true) => {
      const [sel, title, text] = steps[i]; const el = $(sel); if (!el) return end(); const pad = 8;
      let r = el.getBoundingClientRect();
      if (novo && (r.top < 0 || r.bottom > innerHeight)) {
        try { el.scrollIntoView({ block: r.height > innerHeight * 0.6 ? 'start' : 'center' }); } catch { el.scrollIntoView(); }
        r = el.getBoundingClientRect();
        [350, 800].forEach(ms => setTimeout(() => { if (hole.isConnected) place(false); }, ms)); // rolagem suave: acerta quando terminar
      }
      Object.assign(hole.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' });
      if (novo) {
        tip.innerHTML = `<h4>${title}</h4><p>${text}</p><div class="st-tour-nav"><span>${i + 1} de ${steps.length}</span><button type="button" data-skip>Pular</button><button type="button" class="st-next" data-next>${i === steps.length - 1 ? 'Começar' : 'Próximo'}</button></div>`;
        $('[data-skip]', tip).onclick = end; $('[data-next]', tip).onclick = () => { i++; i >= steps.length ? end() : place(); };
      }
      const tw = Math.min(320, innerWidth - 24), th = tip.offsetHeight || 170; let left = r.right + 14, top = r.top;
      if (left + tw > innerWidth - 12) { left = Math.max(12, Math.min(innerWidth - tw - 12, r.left)); top = r.bottom + 14; }
      if (top + th > innerHeight - 12) top = r.top - th - 14;
      top = Math.max(12, Math.min(innerHeight - th - 12, top)); // sempre dentro da tela
      Object.assign(tip.style, { left: left + 'px', top: top + 'px' });
    };
    window.addEventListener('resize', onResize); window.addEventListener('scroll', onScroll, { passive: true, capture: true }); place();
  }

  function loginCta() {
    const panel = $('.login-panel'); if (!panel || $('.st-loginbar')) return;
    const bar = document.createElement('div'); bar.className = 'st-loginbar';
    bar.innerHTML = '<span>Teste à vontade. Se gostar, o sistema completo é seu por <b data-st-price data-st-fallback="um pagamento único"></b>.</span><a href="' + checkoutUrl + '">Comprar agora →</a>';
    bar.querySelector('a').addEventListener('click', () => trackBuy('Comprar agora · escolha do segmento', 'login_bar'));
    panel.insertBefore(bar, panel.firstChild); paintPrice();
  }

  /* ---------- Início ---------- */  function boot() {
    document.body.classList.add('st-ready'); if (isLogin) document.body.classList.add('st-login');
    // A busca antiga do topo só filtra a tabela do Estoque; nas outras telas a paleta (Ctrl+K) assume.
    if (file !== 'estoque.html') document.body.classList.add('st-no-hsearch');
    wrapToggleTheme(); wrapToggleSidebar(); sidebarPref();
    if (!isLogin) { headerExtras(); sideCta(); tabbar(); hero(); if (SALES) moments(); } else if (SALES) loginCta();
    progressNav(); loadPrice(); cardAll(); watchStats();
    requestAnimationFrame(reveal);
    if (isDash) setTimeout(() => startTour(false), 1400);
    new MutationObserver(muts => {
      let rows = false; for (const m of muts) for (const n of m.addedNodes) if (n.nodeType === 1 && (n.tagName === 'TR' || n.tagName === 'TABLE' || n.querySelector?.('table,tr'))) { rows = true; break; }
      if (rows) cardAll();
      if (!isLogin) { headerExtras(); sideCta(); } watchStats(); wrapToggleTheme(); wrapToggleSidebar();
    }).observe(document.body, { childList: true, subtree: true });
    // O mobile-fix.js antigo prende "margin-left:0" no conteúdo quando a tela fica estreita
    // e não desfaz ao voltar para tela larga (ex.: girar o tablet). O Studio limpa isso.
    const unstick = () => { if (!matchMedia('(min-width:1025px)').matches) return; $$('.main-content,.pdv-content').forEach(el => { el.style.removeProperty('margin-left'); el.style.removeProperty('width'); }); };
    unstick(); window.addEventListener('resize', () => { clearTimeout(window.__stRz); window.__stRz = setTimeout(unstick, 150); });
    // O app restaura o menu depois de carregar: reaplica a preferência do Studio.
    setTimeout(sidebarPref, 400); setTimeout(sidebarPref, 1500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();

/* ==========================================================================
   STUDIO v1.2 — ícones Phosphor, tema automático + escolha com pré-visualização, abas
   ========================================================================== */
(() => {
  'use strict';
  if (window.__dpStudio12) return; window.__dpStudio12 = true;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  const isLogin = file === 'login.html';
  const ls = { get(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch { return d; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

  /* ---------- Ícones Phosphor (duotone) no lugar dos genéricos ---------- */
  const MAP = {
    'chart-pie': 'chart-pie-slice', 'cash-register': 'cash-register', 'clipboard-list': 'clipboard-text', 'truck-fast': 'truck', 'truck': 'truck', 'vault': 'vault',
    'screwdriver-wrench': 'wrench', 'box': 'package', 'box-open': 'package', 'tags': 'tag', 'tag': 'tag', 'users': 'users-three', 'user': 'user', 'industry': 'factory',
    'boxes-stacked': 'stack', 'arrow-right-arrow-left': 'arrows-left-right', 'cart-shopping': 'shopping-cart', 'file-invoice-dollar': 'receipt', 'hand-holding-dollar': 'hand-coins',
    'chart-line': 'chart-line-up', 'motorcycle': 'moped', 'chart-bar': 'chart-bar', 'percent': 'percent', 'user-shield': 'user-gear', 'clock-rotate-left': 'clock-counter-clockwise',
    'gear': 'gear-six', 'dollar-sign': 'currency-dollar', 'bag-shopping': 'shopping-bag', 'receipt': 'receipt', 'clock': 'clock', 'circle-check': 'check-circle', 'check-circle': 'check-circle',
    'triangle-exclamation': 'warning', 'exclamation-triangle': 'warning', 'bell': 'bell', 'bars': 'list', 'magnifying-glass': 'magnifying-glass', 'search': 'magnifying-glass',
    'user-check': 'user-check', 'star': 'star', 'circle-exclamation': 'warning-circle', 'exclamation-circle': 'warning-circle', 'building': 'buildings', 'database': 'database',
    'print': 'printer', 'wallet': 'wallet', 'money-bill-wave': 'money', 'money-bill': 'money', 'credit-card': 'credit-card', 'route': 'path', 'keyboard': 'keyboard',
    'compass': 'compass', 'circle-half-stroke': 'circle-half', 'user-plus': 'user-plus', 'shield-halved': 'shield-check', 'ban': 'prohibit', 'chart-simple': 'chart-bar',
    'arrow-trend-up': 'trend-up', 'arrow-trend-down': 'trend-down', 'hourglass-half': 'hourglass-medium', 'calendar': 'calendar-blank', 'calendar-day': 'calendar-blank',
    'coins': 'coins', 'piggy-bank': 'piggy-bank', 'store': 'storefront', 'shop': 'storefront', 'list-check': 'list-checks', 'file-lines': 'file-text', 'user-tie': 'user-circle',
    'mobile-screen': 'device-mobile', 'mobile': 'device-mobile', 'paw': 'paw-print', 'utensils': 'fork-knife', 'scissors': 'scissors', 'hammer': 'hammer', 'shirt': 't-shirt',
    'arrow-up': 'arrow-up', 'arrow-down': 'arrow-down', 'circle-xmark': 'x-circle', 'times-circle': 'x-circle', 'handshake': 'handshake', 'layer-group': 'stack', 'fire': 'fire'
  };
  const SCOPES = '#sidebar .menu-item > i, .stat-icon i, .st-tabbar a > i, .st-hero-actions a > i, .header .header-action > i:not(#themeIcon), .brand-feature > i, .st-palette-item > i, .st-cmd-btn > i, .st-buy-chip > i, .st-nudge .st-ico i, .card-header h3 > i, .card h3 > i, .card h4 > i, .st-tabs > button > i, .kpi-icon i, .st-theme-opt > i';
  function loadPhosphor() {
    if ($('link[data-st-ph]')) return;
    const l = document.createElement('link'); l.rel = 'stylesheet'; l.dataset.stPh = '1';
    l.href = 'https://cdn.jsdelivr.net/npm/@phosphor-icons/web@2.1.1/src/duotone/style.css';
    l.onload = () => { document.documentElement.classList.add('st-phok'); segIcons(); };
    document.head.appendChild(l);
  }
  // Login: ícones de segmento no mesmo estilo (o emoji continua se o pacote de ícones não carregar).
  const SEG = { distribuidora: 'beer-bottle', roupas: 't-shirt', assistencia_celular: 'wrench', loja_celular: 'device-mobile', mercado: 'shopping-cart', barbearia: 'scissors', restaurante: 'fork-knife', petshop: 'paw-print', material_construcao: 'hammer', outro_comercio: 'storefront' };
  function segIcons() {
    $$('.segment-card[data-segment] .segment-icon').forEach(s => { if (s.dataset.stSeg) return; const ic = SEG[s.closest('.segment-card').dataset.segment] || 'storefront'; s.dataset.stSeg = '1'; s.innerHTML = '<i class="ph-duotone ph-' + ic + '" aria-hidden="true"></i>'; });
  }  function phify() {
    $$(SCOPES).forEach(i => {
      if (i.classList.contains('st-has-ph') || i.classList.contains('st-ph')) return;
      const fa = [...i.classList].find(c => c.startsWith('fa-') && MAP[c.slice(3)]); if (!fa) return;
      const ph = document.createElement('i'); ph.className = 'ph-duotone ph-' + MAP[fa.slice(3)] + ' st-ph'; ph.setAttribute('aria-hidden', 'true');
      const color = i.style.color; if (color) ph.style.color = color;
      i.classList.add('st-has-ph'); i.parentNode.insertBefore(ph, i);
    });
  }

  /* ---------- Tema: claro, escuro ou automático ---------- */
  const mq = window.matchMedia ? matchMedia('(prefers-color-scheme: dark)') : null;
  const resolve = pref => pref === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : pref;
  let applying = false, manual = false;
  function setTheme(theme) {
    applying = true;
    try { if (window.BrandingManager?.setTheme) BrandingManager.setTheme(theme); else { sessionStorage.setItem('erp_theme_session', theme); document.documentElement.setAttribute('data-theme', theme); } }
    finally { setTimeout(() => { applying = false; }, 0); }
  }
  function applyPref(pref, save) {
    if (!['light', 'dark', 'auto'].includes(pref)) return;
    if (save) ls.set('st_theme_pref', pref);
    const theme = resolve(pref);
    if (document.documentElement.getAttribute('data-theme') !== theme) setTheme(theme);
    $$('.st-theme-opt').forEach(o => o.classList.toggle('st-sel', o.dataset.pref === pref));
  }
  mq?.addEventListener?.('change', () => { if (ls.get('st_theme_pref', '') === 'auto') applyPref('auto', false); });
  // O botão sol/lua do cabeçalho passa a ser uma escolha explícita (sai do automático).
  function wrapToggle() {
    if (typeof window.toggleTheme !== 'function' || window.toggleTheme.__st12) return;
    const prev = window.toggleTheme; const w = function () { manual = true; return prev.apply(this, arguments); }; w.__st12 = true; w.__st = true; window.toggleTheme = w;
  }
  window.addEventListener('dp-theme-change', e => { if (manual && !applying) { manual = false; ls.set('st_theme_pref', e.detail?.theme === 'dark' ? 'dark' : 'light'); } });

  function mini(kind) {
    const one = k => `<div class="st-mini ${k}"><div class="s"><b></b><b class="on"></b><b></b><b></b><b></b></div><div class="m"><div class="h"></div><div class="k"><span></span><span></span><span></span></div><div class="c"></div></div></div>`;
    return kind === 'auto' ? `<div class="st-mini auto">${one('light')}${one('dark')}</div>` : one(kind);
  }
  function options() {
    const cur = ls.get('st_theme_pref', '') || document.documentElement.getAttribute('data-theme') || 'light';
    const o = [['light', 'fa-sun', 'Claro', 'Fundo claro e limpo'], ['dark', 'fa-moon', 'Escuro', 'Confortável à noite'], ['auto', 'fa-circle-half-stroke', 'Automático', 'Segue o seu aparelho']];
    return `<div class="st-theme-opts" role="radiogroup" aria-label="Aparência">${o.map(([k, ic, t, sm]) => `<button type="button" class="st-theme-opt ${cur === k ? 'st-sel' : ''}" data-pref="${k}" role="radio" aria-checked="${cur === k}">${mini(k)}<i class="fas ${ic}"></i>${t}<small>${sm}</small></button>`).join('')}</div>`;
  }
  function bindOptions(root) { root.addEventListener('click', e => { const b = e.target.closest('.st-theme-opt'); if (!b) return; applyPref(b.dataset.pref, true); $$('.st-theme-opt', root).forEach(x => x.setAttribute('aria-checked', String(x === b))); }); }
  function openThemePicker(first) {
    if ($('.st-theme-bg')) return;
    const bg = document.createElement('div'); bg.className = 'st-theme-bg';
    bg.innerHTML = `<div class="st-theme-box" role="dialog" aria-label="Escolha a aparência"><h3>${first ? 'Como você prefere navegar?' : 'Aparência'}</h3><p>${first ? (document.documentElement.hasAttribute('data-st-product') ? 'Escolha o visual do sistema.' : 'Escolha o visual da demonstração.') + ' Você vê a mudança na hora e pode trocar quando quiser.' : 'Escolha o tema deste aparelho.'}</p>${options()}<button type="button" class="st-theme-go">${first ? 'Continuar' : 'Pronto'}</button><p class="st-theme-note">Você também troca depois pelo botão ☀️/🌙 no topo ou em Configurações.</p></div>`;
    bindOptions(bg);
    const close = () => { ls.set('st_theme_asked', '1'); if (!ls.get('st_theme_pref', '')) ls.set('st_theme_pref', document.documentElement.getAttribute('data-theme') || 'light'); bg.classList.remove('st-open'); setTimeout(() => bg.remove(), 250); };
    $('.st-theme-go', bg).onclick = close; bg.addEventListener('click', e => { if (e.target === bg) close(); });
    document.body.appendChild(bg); phify(); requestAnimationFrame(() => bg.classList.add('st-open'));
  }
  window.__stExtraCmds = [{ group: 'Ações', icon: 'fas fa-circle-half-stroke', label: 'Aparência: claro, escuro ou automático', run: () => openThemePicker(false) }];
  function appearanceCard() {
    if (file !== 'configuracoes.html' || $('.st-appearance')) return;
    const sel = $('#cfg_default_theme'); const group = sel?.closest('.form-group'); if (!group) return;
    const box = document.createElement('div'); box.className = 'form-group st-appearance'; box.style.gridColumn = '1/-1';
    box.innerHTML = '<label class="form-label">Aparência neste aparelho</label>' + options() + '<span style="font-size:11px;color:var(--text-muted);margin-top:8px;display:block">“Automático” segue o modo claro/escuro do celular ou computador e muda sozinho quando ele muda.</span>';
    bindOptions(box); group.parentNode.insertBefore(box, group); phify();
  }

  /* ---------- Abas (ex.: Configurações) ---------- */
  function tabs() {
    $$('.page-content div').forEach(d => {
      if (d.classList.contains('st-tabs') || d.dataset.stTabChecked) return;
      const kids = [...d.children]; if (kids.length < 3 || !kids.every(k => k.tagName === 'BUTTON')) return;
      if (!kids.some(k => /showTab|switchTab|setTab/.test(k.getAttribute('onclick') || ''))) { d.dataset.stTabChecked = '1'; return; }
      d.classList.add('st-tabs');
      const mark = () => kids.forEach(k => k.classList.toggle('st-tab-on', /solid var\(--accent\)|color:\s*var\(--accent\)/.test(k.getAttribute('style') || '') || k.classList.contains('active')));
      mark(); new MutationObserver(mark).observe(d, { attributes: true, subtree: true, attributeFilter: ['style', 'class'] });
      d.addEventListener('click', e => { const b = e.target.closest('button'); if (b) setTimeout(() => { mark(); b.scrollIntoView({ inline: 'center', block: 'nearest', behavior: 'smooth' }); }, 30); });
    });
  }

  function boot() {
    loadPhosphor(); wrapToggle();
    const pref = ls.get('st_theme_pref', ''); if (pref) applyPref(pref, false);
    phify(); tabs(); appearanceCard();
    if (isLogin && !ls.get('st_theme_asked', '') && !ls.get('st_theme_pref', '')) setTimeout(() => openThemePicker(true), 700);
    let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { phify(); tabs(); appearanceCard(); wrapToggle(); }, 80); }).observe(document.body, { childList: true, subtree: true });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
/* ==========================================================================
   STUDIO v1.4 — PDV no celular: fechar o carrinho e categorias legíveis
   ========================================================================== */
(() => {
  'use strict';
  if (window.__dpStudio14) return; window.__dpStudio14 = true;
  const file = (location.pathname.split('/').pop() || '').toLowerCase();
  if (file !== 'pdv.html') return;
  const $ = (s, r = document) => r.querySelector(s);
  const mobile = () => matchMedia('(max-width:1024px)').matches;
  const isOpen = () => $('#pdvCart')?.classList.contains('open');
  const close = () => { if (isOpen() && typeof window.toggleCart === 'function') window.toggleCart(); };

  function cartControls() {
    const cart = $('#pdvCart'), head = $('#pdvCart .cart-header'); if (!cart || !head) return;
    if (!$('.st-cart-close', head)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'st-cart-close'; b.setAttribute('aria-label', 'Fechar o carrinho e voltar aos produtos');
      b.innerHTML = '<i class="fas fa-chevron-down"></i><span>Voltar aos produtos</span>';
      b.addEventListener('click', e => { e.stopPropagation(); close(); });
      head.appendChild(b);
    }
    if (!$('.st-cart-backdrop')) {
      const bd = document.createElement('div'); bd.className = 'st-cart-backdrop'; bd.addEventListener('click', close);
      cart.parentNode.insertBefore(bd, cart);
    }
    // Arrastar para baixo (pela alça ou pelo topo do carrinho) fecha.
    if (!cart.dataset.stSwipe) {
      cart.dataset.stSwipe = '1'; let y0 = null, dy = 0;
      const start = e => { if (!mobile() || !isOpen()) return; const t = e.target; if (!t.closest('.cart-handle,.cart-header')) return; y0 = e.touches[0].clientY; dy = 0; cart.style.transition = 'none'; };
      const move = e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); cart.style.transform = `translateY(${dy}px)`; };
      const end = () => { if (y0 === null) return; cart.style.transition = ''; cart.style.transform = ''; if (dy > 80) close(); y0 = null; };
      cart.addEventListener('touchstart', start, { passive: true }); cart.addEventListener('touchmove', move, { passive: true }); cart.addEventListener('touchend', end); cart.addEventListener('touchcancel', end);
    }
    document.body.classList.toggle('st-cart-open', !!isOpen());
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && mobile()) close(); });

  // Categorias: nomes inteiros, em linhas; botão de expandir numa coluna própria (não cobre nenhum nome).
  function cats() {
    const bar = $('#pdvCategories'); if (!bar) return;
    bar.classList.add('st-cats');
    let list = $('.st-cats-list', bar);
    if (!list) { list = document.createElement('div'); list.className = 'st-cats-list'; bar.insertBefore(list, bar.firstChild); }
    [...bar.children].forEach(ch => { if (ch !== list && ch.classList.contains('cat-btn') && !ch.classList.contains('st-cats-more')) list.appendChild(ch); });
    let more = $('.st-cats-more', bar);
    if (!more) { more = document.createElement('button'); more.type = 'button'; more.className = 'st-cats-more'; more.setAttribute('aria-label', 'Ver todas as categorias'); more.addEventListener('click', () => { bar.classList.toggle('st-cats-open'); paint(); }); }
    if (more.parentNode !== bar || bar.lastElementChild !== more) bar.appendChild(more);
    const btns = [...list.querySelectorAll('.cat-btn')];
    btns.forEach(b => { if (b.dataset.stIco || !window.__stCatIcon) return; b.dataset.stIco = '1'; const txt = b.textContent.trim(); if (/^todos$/i.test(txt)) return; const m = txt.match(/^(\p{Extended_Pictographic}️?)\s*(.*)$/u); if (!m) return; b.innerHTML = '<i class="ph-duotone ph-' + window.__stCatIcon(m[2]) + ' st-cat-chip-ico" aria-hidden="true"></i><span class="st-cat-chip-emoji">' + m[1] + '</span> ' + m[2]; });
    function paint() { const open = bar.classList.contains('st-cats-open'); more.innerHTML = open ? '<i class="fas fa-chevron-up"></i>' : '<i class="fas fa-chevron-down"></i><b>' + btns.length + '</b>'; more.setAttribute('aria-expanded', String(open)); }
    paint();
    requestAnimationFrame(() => { const open = bar.classList.contains('st-cats-open'); bar.classList.remove('st-cats-open'); const overflow = list.scrollHeight > list.clientHeight + 4; if (open) bar.classList.add('st-cats-open'); more.hidden = !overflow; });
    btns.forEach(b => { if (!b.dataset.stCat) { b.dataset.stCat = '1'; b.addEventListener('click', () => { if (bar.classList.contains('st-cats-open')) { bar.classList.remove('st-cats-open'); paint(); } setTimeout(() => { const lr = list.getBoundingClientRect(), br = b.getBoundingClientRect(); if (br.bottom > lr.bottom + 1 && list.children[0] !== b) { list.insertBefore(b, list.children[1] || null); } }, 360); }); } });
  }
  window.__stCatsRefresh = cats;
  function boot() {
    cartControls(); cats();
    const cart = $('#pdvCart'); if (cart) new MutationObserver(() => document.body.classList.toggle('st-cart-open', !!isOpen())).observe(cart, { attributes: true, attributeFilter: ['class'] });
    const bar = $('#pdvCategories'); if (bar) { let t = 0; new MutationObserver(m => { if (m.some(x => [...x.addedNodes].some(n => n.nodeType === 1 && n.classList.contains('cat-btn')))) { clearTimeout(t); t = setTimeout(cats, 40); } }).observe(bar, { childList: true }); }
    window.addEventListener('resize', () => { clearTimeout(window.__stCatRz); window.__stCatRz = setTimeout(cats, 150); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
/* ==========================================================================
   STUDIO v1.5 — Categorias: cartões compactos com ícone pelo nome
   ========================================================================== */
(() => {
  'use strict';
  if (window.__dpStudio15) return; window.__dpStudio15 = true;
  const RULES = [[/agua|água|suco/, 'drop'], [/cerveja|chopp/, 'beer-stein'], [/destil|vinho|whisk|vodka|gin|licor/, 'wine'], [/refri|bebida/, 'beer-bottle'], [/gelo/, 'snowflake'], [/carv/, 'fire'],
    [/conveni|mercearia|mercado/, 'storefront'], [/roupa|camis|vest|blus|moda|feminin|masculin/, 't-shirt'], [/calç|sapat|tênis|tenis/, 'sneaker'], [/acess/, 'watch'], [/celular|smart|telefone/, 'device-mobile'],
    [/capa|pelic/, 'shield-check'], [/peça|tela|bateria|conserto|reparo/, 'wrench'], [/raç|pet|cão|gato/, 'paw-print'], [/serviç/, 'wrench'], [/cabelo|barba|corte/, 'scissors'], [/lanche|comida|prato|refeiç|porç/, 'hamburger'],
    [/doce|sobremesa/, 'cake'], [/limpeza/, 'broom'], [/higien|beleza|cosmet/, 'sparkle'], [/hortifr|fruta|verdura/, 'carrot'], [/constru|cimento|tijolo/, 'hammer'], [/elétric|eletric/, 'lightning'], [/hidráu|hidrau/, 'drop-half'],
    [/ferrament/, 'wrench'], [/tinta|pintura/, 'paint-brush'], [/café|cafe/, 'coffee'], [/padaria|pão|pao/, 'bread']];
  const pick = name => { const n = String(name || '').toLowerCase(); for (const [re, ic] of RULES) if (re.test(n)) return ic; return 'tag'; };
  window.__stCatIcon = pick;
  try { window.__stCatsRefresh?.(); } catch {}
  function run() {
    document.querySelectorAll('.categorias-products-grid > .card').forEach(card => {
      if (card.dataset.stCat) return; card.dataset.stCat = '1'; card.classList.add('st-catcard');
      const kids = [...card.children].filter(k => k.tagName !== 'BUTTON');
      const emoji = kids[0], name = kids[1]?.textContent || '';
      if (emoji) { emoji.classList.add('st-cat-ico'); emoji.dataset.emoji = emoji.textContent.trim(); emoji.innerHTML = '<i class="ph-duotone ph-' + pick(name) + '" aria-hidden="true"></i><span class="st-cat-emoji">' + emoji.dataset.emoji + '</span>'; }
      kids[1]?.classList.add('st-cat-name'); kids.slice(2).forEach(k => k.classList.add('st-cat-sub'));
    });
  }
  const boot = () => { run(); new MutationObserver(() => run()).observe(document.body, { childList: true, subtree: true }); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
/* ==========================================================================
   STUDIO v1.6 — acabamento premium: fonte Plus Jakarta Sans, cabeçalho de página,
   gráficos com tema próprio, estados vazios e cartão do usuário no menu
   ========================================================================== */
(() => {
  'use strict';
  if (window.__dpStudio16) return; window.__dpStudio16 = true;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const file = (location.pathname.split('/').pop() || 'index.html').toLowerCase();
  if (file === 'login.html') return;

  // Fonte: Plus Jakarta Sans local (assets/fonts, @font-face no studio-v1.css) — sem Inter do Google

  // Cabeçalho da página
  const DESC = {
    'pedidos.html': 'Acompanhe pedidos de balcão e delivery em tempo real.', 'entregas.html': 'Rotas, status e tempo médio das entregas.',
    'caixa.html': 'Abertura, movimentações e fechamento do caixa.', 'ordens-servico.html': 'Ordens de serviço, prazos, aparelhos e pagamentos.', 'orcamentos.html': 'Orçamentos para clientes: imprimir, enviar no WhatsApp e vender no PDV.',
    'produtos.html': 'Catálogo, preços, custos e margens dos seus produtos.', 'categorias.html': 'Organize os produtos por categoria.',
    'clientes.html': 'Cadastro, histórico de compras e vendas a prazo.', 'fornecedores.html': 'Fornecedores, contatos e compras realizadas.',
    'estoque.html': 'Níveis de estoque, alertas e ajustes.', 'movimentacoes.html': 'Entradas, saídas e ajustes de estoque.',
    'compras.html': 'Pedidos de compra e recebimento de mercadorias.', 'contas-pagar.html': 'Contas, vencimentos e pagamentos.',
    'contas-receber.html': 'Recebimentos, prazos e inadimplência.', 'fluxo-caixa.html': 'Entradas e saídas do período, dia a dia.',
    'motoboys.html': 'Equipe de entrega, desempenho e comissões.', 'relatorios.html': 'Relatórios de vendas, estoque e financeiro.',
    'comissoes.html': 'Comissões dos vendedores por período.', 'usuarios.html': 'Usuários, perfis e permissões de acesso.',
    'auditoria.html': 'Histórico de tudo o que foi feito no sistema.', 'configuracoes.html': 'Dados da empresa, vendas, impressão, backup e aparência.'
  };
  function pageHead() {
    if (!DESC[file] || $('.st-page-head')) return; const pc = $('.page-content'); if (!pc) return;
    const active = $('#sidebar .menu-item.active'); const title = $('.header-left h2')?.textContent.trim() || active?.querySelector('.menu-text')?.textContent.trim() || document.title.split(/\s[—·]\s/)[0].trim();
    let section = ''; for (let el = active?.previousElementSibling; el; el = el.previousElementSibling) if (el.classList.contains('menu-section')) { section = el.textContent.trim(); break; }
    const ico = active?.querySelector('.st-ph')?.className.replace('st-ph', '').trim() || 'ph-duotone ph-squares-four';
    const head = document.createElement('div'); head.className = 'st-page-head';
    head.innerHTML = `<div><div class="st-crumb"><i class="${ico} st-ph" aria-hidden="true"></i>${section ? section.charAt(0) + section.slice(1).toLowerCase() + ' / ' : ''}${title}</div><h1>${title}</h1><p>${DESC[file]}</p></div>`;
    pc.insertBefore(head, pc.firstChild);
  }

  // Estados vazios ("Nenhum ... encontrado")
  function empties() {
    $$('.page-content *').forEach(el => {
      if (el.dataset.stEmpty || el.children.length > 1 || el.closest('.st-page-head,.modal-overlay,select,option,button,[id$=Pagination],.pagination')) return;
      const t = el.textContent.trim(); if (!/^Nenhum(a)?\b/i.test(t) || t.length > 90) return;
      if (el.children.length === 1 && el.children[0].tagName !== 'I') return;
      el.dataset.stEmpty = '1'; el.classList.add('st-empty');
      const ico = document.createElement('span'); ico.className = 'st-empty-ico'; ico.innerHTML = '<i class="ph-duotone ph-tray" aria-hidden="true"></i>';
      el.querySelector('i')?.remove(); el.insertBefore(ico, el.firstChild);
    });
  }

  // Cartão do usuário no rodapé do menu
  function userCard() {
    const sb = $('#sidebar'); if (!sb) return;
    const product = document.documentElement.hasAttribute('data-st-product');
    let u = null; try { u = (typeof currentUser !== 'undefined' && currentUser) || window.currentUser || null; } catch { u = window.currentUser || null; }
    const name = (u && u.name) || $('#userName')?.textContent.trim() || (product ? 'Usuário' : 'Administrador Demo');
    const ROLES = { admin: 'Administrador', administrador: 'Administrador', gerente: 'Gerente', vendedor: 'Vendedor', caixa: 'Caixa', estoquista: 'Estoquista', tecnico: 'Técnico', motoboy: 'Entregador' };
    const sub = product ? (ROLES[String(u?.role || '').toLowerCase()] || (u?.email || 'Conectado')) : 'Demonstração · todos os módulos';
    const clean = s => String(s).replace(/[<>&"]/g, '');
    let box = $('.st-user', sb);
    if (box) { if (box.dataset.n !== name + '|' + sub) { box.dataset.n = name + '|' + sub; $('.st-av', box).textContent = name.charAt(0).toUpperCase(); $('b', box).textContent = name; $('small', box).textContent = sub; } return; }
    box = document.createElement('div'); box.className = 'st-user'; box.dataset.n = name + '|' + sub;
    box.innerHTML = `<span class="st-av">${clean(name.charAt(0).toUpperCase())}</span><div><b>${clean(name)}</b><small>${clean(sub)}</small></div>`;
    const toggle = $('.sidebar-toggle', sb); toggle ? sb.insertBefore(box, toggle) : sb.appendChild(box);
  }

  // Gráficos com tema próprio
  function css(v) { return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  function themeCharts() {
    if (typeof Chart === 'undefined') return;
    const dark = document.documentElement.getAttribute('data-theme') !== 'light';
    const text = dark ? '#a0a3ad' : '#5b6170', grid = dark ? 'rgba(255,255,255,.06)' : 'rgba(15,23,42,.06)', accent = css('--accent') || '#6366f1';
    const D = Chart.defaults; D.font.family = "'Plus Jakarta Sans', 'Segoe UI', sans-serif"; D.font.size = 11.5; D.color = text; D.borderColor = grid;
    D.plugins.legend.labels.usePointStyle = true; D.plugins.legend.labels.pointStyle = 'circle'; D.plugins.legend.labels.boxWidth = 8; D.plugins.legend.labels.boxHeight = 8; D.plugins.legend.labels.padding = 16;
    Object.assign(D.plugins.tooltip, { backgroundColor: dark ? '#1c1c21' : '#111827', titleColor: '#fff', bodyColor: '#e5e7eb', borderColor: 'rgba(255,255,255,.08)', borderWidth: 1, padding: 10, cornerRadius: 10, titleFont: { weight: '600', family: D.font.family }, bodyFont: { family: D.font.family }, displayColors: true, boxPadding: 4, usePointStyle: true });
    D.elements.line.tension = .38; D.elements.line.borderWidth = 2.4; D.elements.point.radius = 0; D.elements.point.hoverRadius = 5; D.elements.point.hitRadius = 14;
    D.elements.bar.borderRadius = 8; D.elements.bar.borderSkipped = false; D.elements.arc.borderWidth = 0;
    Object.values(Chart.instances || {}).forEach(ch => {
      try {
        const o = ch.options; o.font = Object.assign({}, o.font, { family: D.font.family });
        Object.values(o.scales || {}).forEach(sc => { sc.grid = Object.assign({}, sc.grid, { color: grid, drawBorder: false, tickLength: 0 }); sc.border = Object.assign({}, sc.border, { display: false }); sc.ticks = Object.assign({}, sc.ticks, { color: text, padding: 8, font: { family: D.font.family, size: 11.5 } }); });
        if (o.plugins) { o.plugins.tooltip = Object.assign({}, o.plugins.tooltip, D.plugins.tooltip); if (o.plugins.legend) { /* 37.8 · só valores: o generateLabels do padrão escrevia 'undefined' na legenda da rosca/pizza */ const src = Object.assign({}, o.plugins.legend.labels, D.plugins.legend.labels), L = {}; for (const k in src) if (typeof src[k] !== 'function') L[k] = src[k]; o.plugins.legend.labels = Object.assign(L, { color: text }); } }
        ch.data.datasets.forEach(ds => {
          if (ch.config.type === 'line') {
            ds.tension = .38; ds.borderWidth = 2.4; ds.pointRadius = 0; ds.pointHoverRadius = 5; ds.borderColor = ds.borderColor || accent;
            const ctx = ch.ctx, h = ch.height || 300; const gr = ctx.createLinearGradient(0, 0, 0, h); const col = typeof ds.borderColor === 'string' ? ds.borderColor : accent;
            gr.addColorStop(0, col.startsWith('#') ? col + '40' : 'rgba(99,102,241,.25)'); gr.addColorStop(1, col.startsWith('#') ? col + '00' : 'rgba(99,102,241,0)'); ds.backgroundColor = gr; ds.fill = true;
          }
          if (ch.config.type === 'bar') { ds.borderRadius = 8; ds.borderSkipped = false; ds.maxBarThickness = 28; }
          if (ch.config.type === 'doughnut' || ch.config.type === 'pie') { ds.borderWidth = 0; ds.spacing = 3; ds.hoverOffset = 6; if (ch.config.type === 'doughnut') ch.options.cutout = '72%'; }
        });
        ch.update('none');
      } catch {}
    });
  }

  function boot() {
    pageHead(); userCard(); empties(); themeCharts(); [1500, 4000].forEach(ms => setTimeout(userCard, ms));
    let t = 0; new MutationObserver(() => { clearTimeout(t); t = setTimeout(() => { pageHead(); userCard(); empties(); }, 120); }).observe(document.body, { childList: true, subtree: true });
    // Gráficos são criados depois que os dados carregam: aplica o tema algumas vezes e a cada troca de tema.
    [600, 1500, 3000].forEach(ms => setTimeout(themeCharts, ms));
    window.addEventListener('dp-theme-change', () => setTimeout(themeCharts, 60));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true }); else boot();
})();
/* v1.7 — tabelas largas: compacta e indica rolagem */
(function(){
  if(window.__stV17)return;window.__stV17=1;
  var mq=window.matchMedia('(min-width:761px)'),t=0;
  function fit(){
    if(!mq.matches)return;
    document.querySelectorAll('.table-container').forEach(function(box){
      var tb=box.querySelector('.data-table,table');if(!tb||!box.offsetParent)return;
      tb.classList.remove('st-tight','st-wrap');
      if(box.scrollWidth-box.clientWidth>2)tb.classList.add('st-tight');
      if(box.scrollWidth-box.clientWidth>2){tb.classList.add('st-wrap');tb.querySelectorAll('tbody td').forEach(function(td){var x=(td.textContent||'').replace(/\s+/g,' ').trim();td.classList.toggle('st-nw',x.length<=20||/^[\d()R$\s.\-\/,%:+]+$/.test(x))})}
      box.classList.toggle('st-scrollx',box.scrollWidth-box.clientWidth>2);
    });
  }
  function later(){clearTimeout(t);t=setTimeout(fit,120)}
  window.addEventListener('resize',later);
  document.addEventListener('DOMContentLoaded',later);
  try{new MutationObserver(later).observe(document.body||document.documentElement,{childList:true,subtree:true})}catch(e){}
  [300,1200,2500].forEach(function(ms){setTimeout(fit,ms)});
})();