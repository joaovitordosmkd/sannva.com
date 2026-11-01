/* DistribuiPRO PDV Pro 1.0
   - Total sempre visível no rodapé do carrinho (antes ficava escondido no fim da rolagem).
   - Cartão do produto mostra quantas unidades já estão no carrinho, estoque colorido e "Esgotado".
   - Leitor de código de barras: Enter na busca adiciona o produto pelo código/EAN (ou o único resultado);
     o leitor funciona com o cursor em qualquer lugar do PDV (35.26).
   - Botão do carrinho no celular mostra o total da venda.
   - "Vendas de hoje" no topo (pode esconder o valor) e confirmação animada ao concluir a venda.
   Só acrescenta: não muda o cálculo, o pagamento nem o registro da venda. */
(() => {
  'use strict';
  if (typeof window.renderCart !== 'function') return;
  const brl = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  const getCart = () => { try { return Array.isArray(cart) ? cart : []; } catch { return []; } };
  const getProducts = () => { try { return Array.isArray(products) ? products : []; } catch { return []; } };
  const $ = s => document.querySelector(s);
  // Toast é "const" global (core-services.js): não fica em window.Toast.
  const warn = m => { try { (window.Toast || Toast).warning(m); } catch { } };
  const coarse = matchMedia('(max-width: 768px), (pointer: coarse)').matches;
  document.body.classList.add('pdx');

  /* ---------- Total fixo no rodapé ---------- */
  function mountFooter() {
    const panel = $('#pdvCart'), summary = panel?.querySelector('.cart-summary'), actions = panel?.querySelector('.cart-actions');
    if (!panel || !summary || !actions || panel.querySelector('.pdx-foot')) return;
    const foot = document.createElement('div'); foot.className = 'pdx-foot';
    foot.innerHTML = '<div class="pdx-items"><span id="pdxItems">0 itens</span><button type="button" class="pdx-more" aria-expanded="false">Detalhes <i class="fas fa-chevron-up"></i></button></div>';
    actions.parentElement.insertBefore(foot, actions);
    foot.appendChild(summary);
    foot.querySelector('.pdx-more').addEventListener('click', e => { const open = foot.classList.toggle('open'); e.currentTarget.setAttribute('aria-expanded', open); });
  }

  /* ---------- Cartões de produto ---------- */
  function decorateProducts() {
    const inCart = {};
    getCart().forEach(c => { inCart[c.productId] = (inCart[c.productId] || 0) + (Number(c.quantity) || 0) * (Number(c._factor) || 1); });
    const prods = getProducts();
    if (window.DPGrade) DPGrade.foldCart(inCart, prods); // 38.6 · as peças da grade contam no cartão do pai
    document.querySelectorAll('#productsGrid .product-card').forEach(card => {
      const m = (card.getAttribute('onclick') || '').match(/addToCart\('([^']+)'\)/); if (!m) return;
      const id = m[1], p = prods.find(x => x.id === id); card.dataset.pid = id;
      const stock = (window.DPGrade && p ? DPGrade.stockOf(p, prods) : Number(p?.currentStock)) || 0, min = Number(p?.minStock) || 10; // 38.6 · pai da grade = soma dos tamanhos
      const st = card.querySelector('.p-stock');
      // 36.9 · Serviço não tem estoque: nunca "Esgotado" (os cartões que entram ao rolar a lista passam só por aqui)
      const svc = p && !p.isGradeParent && (typeof window.dpIsServiceProduct === 'function' ? window.dpIsServiceProduct(p) : (p.productType === 'service' || p.controlStock === false));
      if (svc) {
        card.classList.remove('pdx-out'); card.style.opacity = ''; card.style.pointerEvents = '';
        // 37.2 · Produto vendido sem controle de estoque (ex.: lanche, prato, importado de outro sistema) não é serviço: só não mostra estoque
        const realSvc = p.productType === 'service' || /^servi[cç]os?\b/i.test(String(p.category || '').trim()) || String(p.unit || '').toLowerCase() === 'serv';
        if (st) { st.dataset.pdx = '1'; st.className = 'p-stock'; st.innerHTML = realSvc ? '<i class="fas fa-screwdriver-wrench"></i> Serviço' : '<i class="fas fa-check"></i> Disponível'; }
      } else card.classList.toggle('pdx-out', stock <= 0 && !window.DP_VENDA_SEM_ESTOQUE); // 39.14.9 · com "Permitir venda sem estoque" o cartão não escurece
      if (svc) { let b = card.querySelector('.pdx-qty'); const q = inCart[id] || 0; if (q) { if (!b) { b = document.createElement('span'); b.className = 'pdx-qty'; card.appendChild(b); } b.textContent = q; } else if (b) b.remove(); return; }
      if (st && !st.dataset.pdx) { st.dataset.pdx = '1'; st.classList.add(stock <= 0 ? 'pdx-s-out' : stock <= min ? 'pdx-s-low' : 'pdx-s-ok'); st.textContent = stock <= 0 ? 'Esgotado' : stock + ' un'; }
      let b = card.querySelector('.pdx-qty'); const q = inCart[id] || 0;
      if (q) { if (!b) { b = document.createElement('span'); b.className = 'pdx-qty'; card.appendChild(b); } if (b.textContent !== String(q)) { b.textContent = q; b.classList.remove('pop'); void b.offsetWidth; b.classList.add('pop'); } }
      else if (b) b.remove();
    });
  }

  /* ---------- Carrinho ---------- */
  let lastTotal = null, lastCount = 0;
  function afterCart() {
    const items = getCart(), count = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const totalTxt = $('#cartTotal')?.textContent || brl(0);
    const it = $('#pdxItems'); if (it) it.textContent = count ? `${count} ${count === 1 ? 'item' : 'itens'} · ${items.length} produto${items.length === 1 ? '' : 's'}` : 'Carrinho vazio';
    const btn = $('.pdv-mobile-toggle');
    if (btn) {
      let lab = btn.querySelector('.pdx-ttl'); if (!lab) { lab = document.createElement('span'); lab.className = 'pdx-ttl'; btn.appendChild(lab); }
      lab.textContent = count ? totalTxt.replace(/\s/g, ' ') : ''; btn.classList.toggle('pdx-has', !!count);
      if (count > lastCount) { btn.classList.remove('bump'); void btn.offsetWidth; btn.classList.add('bump'); }
    }
    const tot = $('#cartTotal'); if (tot && lastTotal !== null && tot.textContent !== lastTotal) { tot.classList.remove('pdx-flash'); void tot.offsetWidth; tot.classList.add('pdx-flash'); }
    lastTotal = tot?.textContent ?? null;
    if (count > lastCount) {
      const rows = document.querySelectorAll('#cartItems .cart-item'), row = rows[rows.length - 1];
      row?.classList.add('pdx-new');
      // Mostra o item que acabou de entrar, sem mudar a ordem do carrinho
      const list = $('#cartItems'); if (list && row && list.scrollHeight > list.clientHeight) list.scrollTop = row.offsetTop - list.offsetTop;
      const sc = $('#cartScroll');
      if (sc && row) { const a = sc.getBoundingClientRect(), b = row.getBoundingClientRect(); if (b.top < a.top || b.bottom > a.bottom) sc.scrollTop += b.top - a.top - 8; }
    }
    const fin = $('#btnFinalize'); if (fin) fin.classList.toggle('pdx-ready', !!count);
    lastCount = count;
    decorateProducts();
  }

  const origRenderCart = window.renderCart;
  window.renderCart = function () { const r = origRenderCart.apply(this, arguments); try { afterCart(); } catch (e) { console.warn('pdx', e); } return r; };
  const origRenderProducts = window.renderProducts;
  if (typeof origRenderProducts === 'function') window.renderProducts = function () { const r = origRenderProducts.apply(this, arguments); try { decorateProducts(); } catch { } return r; };
  const origAdd = window.addToCartWithPkg;
  if (typeof origAdd === 'function') window.addToCartWithPkg = function (product) {
    const before = getCart().reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    const r = origAdd.apply(this, arguments);
    const after = getCart().reduce((s, i) => s + (Number(i.quantity) || 0), 0);
    if (after > before) {
      const card = product && document.querySelector(`#productsGrid .product-card[data-pid="${CSS.escape(product.id)}"]`);
      if (card) { card.classList.remove('pdx-added'); void card.offsetWidth; card.classList.add('pdx-added'); }
      if (coarse && navigator.vibrate) try { navigator.vibrate(12); } catch { }
    }
    return r;
  };

  /* ---------- Leitor de código de barras / Enter na busca ---------- */
  // Aceita mais de um código no cadastro (separados por vírgula/espaço) e zeros à esquerda (UPC × EAN-13).
  const noZeros = s => /^\d+$/.test(s) ? s.replace(/^0+/, '') : s;
  const codesOf = p => [p.barcode, p.code].flatMap(v => { const n = norm(v); return n ? [n, ...n.split(/[\s,;|]+/)] : []; });
  function findByCode(raw) {
    const q = norm(raw); if (!q) return null;
    const prods = getProducts(), z = noZeros(q);
    return prods.find(p => codesOf(p).includes(q)) || (z && prods.find(p => codesOf(p).some(c => noZeros(c) === z))) || null;
  }
  // 38.1 · Código do fardo/caixa (DUN-14) e etiqueta de balança: quem resolve é o preco-atacado-v1.js (window.dpScanHook)
  // 38.5 · IMEI/nº de série de um aparelho no estoque: quem resolve é o seriais-v1.js (window.dpSerialScan)
  const extScan = code => { try { if (typeof window.dpSerialScan === 'function' && window.dpSerialScan(String(code || '').trim())) return true; return typeof window.dpScanHook === 'function' && !!window.dpScanHook(String(code || '').trim()); } catch { return false; } };
  const search = $('#pdvSearch');
  search?.addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = norm(search.value); if (!q) return;
    e.preventDefault();
    const prods = getProducts();
    let hit = findByCode(q);
    if (!hit && extScan(search.value)) { search.value = ''; try { renderProducts(); } catch { } search.focus(); return; }
    if (!hit) { let list = prods.filter(p => norm(p.name).includes(q) || norm(p.code).includes(q) || norm(p.barcode).includes(q)); if (window.DPGrade) list = DPGrade.pdvList(list); if (list.length === 1) hit = list[0]; } // 38.6 · grade: os tamanhos não aparecem soltos, o pai abre o seletor
    if (!hit) { warn('Nenhum produto com esse código. Continue digitando ou escolha na lista.'); return; }
    window.addToCart(hit.id);
    search.value = ''; try { renderProducts(); } catch { }
    search.focus();
  });
  if (search && !search.placeholder.includes('código')) search.placeholder = 'Buscar produto ou ler código de barras…';

  /* Leitor em qualquer lugar da tela: o leitor "digita" o código muito rápido e termina com Enter ou Tab
     (alguns não mandam nada no fim). Não precisa estar com o cursor na busca: se o código caiu em outro campo
     (cliente da venda, observação…), o campo volta ao que era e o produto vai para o carrinho. */
  const SCAN = { buf: '', t0: 0, last: 0, gap: 0, el: null, val: null, timer: 0, done: 0 };
  const isField = el => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const modalOpen = () => !!document.querySelector('.modal-overlay.active, #pkgSelectorOverlay');
  const scanReset = () => { SCAN.buf = ''; SCAN.el = null; SCAN.val = null; clearTimeout(SCAN.timer); };
  // 5+ caracteres com média de até 65 ms entre eles: ninguém digita assim à mão (rápido à mão ≈ 100 ms+).
  const scanned = () => SCAN.buf.length >= 5 && (SCAN.last - SCAN.t0) / (SCAN.buf.length - 1) <= 65 && SCAN.gap <= 150;
  const safe = s => String(s).replace(/[^\w.\-\/]/g, '').slice(0, 40);
  function restoreField(el, val) {
    if (!el || val === null || el === search || el.value === val) return;
    el.value = val;
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  }
  function takeScan(code, el, val, terminated) {
    const hit = findByCode(code);
    if (!hit && extScan(code)) {
      if (el === search) { search.value = ''; try { renderProducts(); } catch { } } else restoreField(el, val);
      SCAN.done = performance.now();
      return true;
    }
    if (!hit) {
      // Sem produto: só avisa se o leitor foi usado fora de qualquer campo. Na busca, o Enter normal mostra a
      // lista; nos outros campos (cliente por telefone, observação…) o texto fica como foi digitado.
      if (!terminated || el) return false;
      warn(`Código ${safe(code)} não está cadastrado em nenhum produto (Produtos › Código de barras).`);
      return true;
    }
    if (el === search) { search.value = ''; try { renderProducts(); } catch { } }
    else restoreField(el, val);
    window.addToCart(hit.id);
    SCAN.done = performance.now();
    return true;
  }
  document.addEventListener('keydown', e => {
    if (e.isComposing || e.ctrlKey || e.metaKey || e.altKey) return;
    const k = e.key, now = e.timeStamp || performance.now();
    if (k === 'Enter' || k === 'Tab') {
      const ok = SCAN.buf && now - SCAN.last <= 300 && scanned() && !modalOpen();
      const code = SCAN.buf, el = SCAN.el, val = SCAN.val; scanReset();
      // Enter/Tab que chega logo depois de um código já lançado (leitor lento): não clica em nada.
      if (!ok) { if (!code && performance.now() - SCAN.done < 500) { e.preventDefault(); e.stopImmediatePropagation(); } return; }
      if (takeScan(code, el, val, true)) { e.preventDefault(); e.stopImmediatePropagation(); }
      return;
    }
    if (k === 'Shift' || k === 'CapsLock') return;
    if (k.length !== 1 || e.repeat) { scanReset(); return; }
    if (SCAN.buf && now - SCAN.last > 150) scanReset();
    if (!SCAN.buf) { SCAN.t0 = now; SCAN.gap = 0; SCAN.el = isField(e.target) ? e.target : null; SCAN.val = SCAN.el && 'value' in SCAN.el ? SCAN.el.value : null; }
    else SCAN.gap = Math.max(SCAN.gap, now - SCAN.last);
    SCAN.buf += k; SCAN.last = now;
    clearTimeout(SCAN.timer);
    // Leitor sem Enter no fim: depois de uma pausa, só lança se o código for exatamente de um produto.
    SCAN.timer = setTimeout(() => {
      if (SCAN.buf.length < 6 || !scanned() || modalOpen()) return scanReset();
      const code = SCAN.buf, el = SCAN.el, val = SCAN.val; scanReset();
      takeScan(code, el, val, false);
    }, 250);
  }, true);

  /* ---------- Vendas de hoje ---------- */
  const HIDE_KEY = 'pdx_hide_day';
  let day = { total: 0, n: 0 }, dayLoaded = false;
  const hidden = () => { try { return localStorage.getItem(HIDE_KEY) === '1'; } catch { return false; } };
  function paintDay() {
    let el = $('#pdxDay');
    const head = $('.pdv-header'); if (!head) return;
    if (!el) {
      el = document.createElement('button'); el.id = 'pdxDay'; el.type = 'button'; el.className = 'pdx-day';
      el.title = 'Vendas concluídas hoje · toque para mostrar/esconder o valor';
      el.addEventListener('click', () => { try { localStorage.setItem(HIDE_KEY, hidden() ? '0' : '1'); } catch { } paintDay(); });
      const sb = head.querySelector('.pdv-search-bar'); sb ? sb.insertAdjacentElement('afterend', el) : head.appendChild(el);
    }
    el.innerHTML = `<i class="fas fa-chart-line"></i><span><small>Hoje</small><b>${hidden() ? 'R$ ••••' : brl(day.total)}</b></span><em>${day.n} venda${day.n === 1 ? '' : 's'}</em><i class="fas ${hidden() ? 'fa-eye' : 'fa-eye-slash'} pdx-eye"></i>`;
  }
  async function loadDay() {
    try {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const snap = await db.collection('sales').where('createdAt', '>=', start).get();
      let t = 0, n = 0;
      snap.docs.forEach(d => { const s = d.data(); if (s.deleted === true || !['completed','delivered'].includes(s.status)) return; const dt = s.createdAt?.toDate?.() || new Date(s.createdAt || 0); if (dt < start) return; t += Number(s.total) || 0; n++; });
      day = { total: t, n }; dayLoaded = true; paintDay();
    } catch (e) { /* sem índice ou sem permissão: o resumo simplesmente não aparece */ }
  }

  /* ---------- Venda concluída ---------- */
  function celebrate(total, number, delivery) {
    const box = document.createElement('div'); box.className = 'pdx-done'; box.setAttribute('role', 'status');
    box.innerHTML = `<div class="pdx-check"><svg viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="24"/><path d="M15 27l7 7 15-15"/></svg></div><div><b>${delivery ? 'Pedido de entrega criado' : 'Venda concluída'}</b><span>${number ? '#V-' + String(number).padStart(4, '0') + ' · ' : ''}${brl(total)}</span></div>`;
    document.body.appendChild(box);
    if (coarse && navigator.vibrate) try { navigator.vibrate([18, 40, 18]); } catch { }
    setTimeout(() => box.classList.add('out'), 1900); setTimeout(() => box.remove(), 2400);
  }
  if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function') {
    const origCreate = SalesService.create;
    SalesService.create = async function (data) {
      const r = await origCreate.apply(this, arguments);
      try {
        if (dayLoaded && data && ['completed','delivered'].includes(data.status)) { day.total += Number(data.total) || 0; day.n++; paintDay(); }
        celebrate(data?.total, r?.saleNumber, data?.type === 'delivery');
      } catch { }
      return r;
    };
  }

  /* ---------- Início ---------- */
  mountFooter();
  try { afterCart(); } catch { }
  const grid = $('#productsGrid'); if (grid) new MutationObserver(() => { if (grid.querySelector('.product-card:not([data-pid])')) decorateProducts(); }).observe(grid, { childList: true });
  setTimeout(loadDay, 900);
})();
