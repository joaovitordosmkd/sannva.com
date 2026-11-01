/* DistribuiPro Studio Pro 2.0 · correções gerais (todas as páginas)
   - Com um modal aberto, a página de trás não rola (evitava "pulos" e travadas no Android).
   - Botão "voltar" do Android fecha o modal em vez de sair da página (antes o formulário sumia).
   - Ao focar um campo no celular, ele fica visível acima do teclado. */
(() => {
  'use strict';
  const root = document.documentElement;
  let pushed = false, ignorePop = false, raf = 0;
  // 39.3 · Só conta janela que está mesmo na tela: uma .modal-overlay com a classe "active" mas escondida (display:none,
  // visibility:hidden ou sem tamanho) deixava html.dp-modal-open ligado e a página parava de rolar no celular.
  const shown = o => { const cs = getComputedStyle(o); if (cs.display === 'none' || cs.visibility === 'hidden') return false; const r = o.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
  const openOverlays = () => [...document.querySelectorAll('.modal-overlay.active, .modal-overlay.show, .modal-overlay.open')].filter(shown);

  function sync() {
    raf = 0;
    const open = openOverlays().length > 0;
    root.classList.toggle('dp-modal-open', open);
    if (open && !pushed) {
      try { history.pushState(Object.assign({}, history.state, { dpModal: 1 }), ''); pushed = true; } catch { }
    } else if (!open && pushed) {
      pushed = false;
      if (history.state && history.state.dpModal) { ignorePop = true; try { history.back(); } catch { ignorePop = false; } }
    }
  }
  const schedule = () => { if (!raf) raf = setTimeout(sync, 30); };

  addEventListener('popstate', () => {
    if (ignorePop) { ignorePop = false; return; }
    const list = openOverlays(); if (!list.length) { pushed = false; return; }
    pushed = false;
    const top = list[list.length - 1];
    const close = top.querySelector('.modal-close') || [...top.querySelectorAll('button')].find(b => /^(fechar|cancelar|não|nao|voltar)$/i.test((b.textContent || '').trim()));
    if (close) close.click(); else top.classList.remove('active', 'show', 'open');
    setTimeout(schedule, 60);
  });

// Cartões do celular: esconde campos vazios ("—"), que só ocupavam espaço
  let dashT = 0;
  const markDash = () => { dashT = 0; document.querySelectorAll('table.st-cards tbody td:not(.st-title):not(.st-actions):not(.st-check):not(.st-full)').forEach(td => { const v = td.textContent.trim(); td.classList.toggle('st-dash', (v === '—' || v === '-' || v === '') && !td.querySelector('img,svg,input,select,button')); }); };
  new MutationObserver(() => { if (!dashT) dashT = setTimeout(markDash, 120); }).observe(document.documentElement, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });

  // Campo focado no celular: aparece acima do teclado
  document.addEventListener('focusin', e => {
    const el = e.target; if (!el.matches || !el.matches('input,select,textarea')) return;
    if (!matchMedia('(max-width: 768px), (pointer: coarse)').matches) return;
    if (!el.closest('.modal')) return;
    setTimeout(() => { if (document.activeElement === el) try { el.scrollIntoView({ block: 'center', behavior: 'smooth' }); } catch { } }, 420);
  });

  const start = () => {
    new MutationObserver(schedule).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
    schedule();
  };
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start, { once: true });
})();
