/**
 * =========================================================
 * DISTRIBUIDORA ERP — Mobile Fix Script
 * =========================================================
 * Corrige grids inline (style="display:grid...") em mobile
 * Executa antes do render para evitar flash de layout
 * =========================================================
 */
(function () {
    'use strict';

    var BREAKPOINT_MD = 768;
    var BREAKPOINT_SM = 480;
    var BREAKPOINT_LG = 1024;

    /**
     * Adiciona classes utilitárias nos grids inline
     * para que o CSS mobile possa sobrescrever
     */
    function patchInlineGrids() {
        var elements = document.querySelectorAll('[style*="display:grid"], [style*="display: grid"]');

        elements.forEach(function (el) {
            // Nunca toca em elementos dentro do pdv-right (carrinho do PDV)
            if (el.closest('#pdvCart, .pdv-right, .pdv-content, .pdv-wrapper')) return;

            var style = el.getAttribute('style') || '';

            // Detecta grids de 2 colunas assimétricas (2fr 1fr, 1fr 2fr)
            if (/grid-template-columns\s*:\s*[0-9]+fr\s+[0-9]+fr/i.test(style)) {
                var cols = style.match(/grid-template-columns\s*:\s*([^;]+)/i);
                if (cols) {
                    var colValue = cols[1].trim();
                    // 3 colunas
                    if (/[0-9]+fr\s+[0-9]+fr\s+[0-9]+fr/.test(colValue)) {
                        el.classList.add('ig-three-to-stack');
                    }
                    // 2 colunas (qualquer proporção)
                    else if (/[0-9]+fr\s+[0-9]+fr/.test(colValue) || /2fr\s+1fr|1fr\s+2fr/.test(colValue)) {
                        if (/2fr|1fr\s+2fr/.test(colValue)) {
                            el.classList.add('ig-main-to-stack');
                        } else {
                            el.classList.add('ig-equal-to-stack');
                        }
                    }
                }
            }

            // Grids dentro de form-group (formulários) — mas não no PDV
            if (el.closest('.modal-body, .card, .form-section')) {
                el.classList.add('ig-form-to-stack');
            }
        });
    }

    /**
     * Ajusta a altura do layout principal para mobile
     */
    function adjustMainContentHeight() {
        if (window.innerWidth <= BREAKPOINT_MD) {
            // Garante que main-content não seja afetado pelo margin-left da sidebar
            var mainContent = document.querySelector('.main-content');
            if (mainContent) {
                mainContent.style.setProperty('margin-left', '0', 'important');
                mainContent.style.setProperty('width', '100%', 'important');
            }
        }
    }

    /**
     * Melhora a sidebar para mobile — adiciona overlay se não existir
     */
    function setupMobileSidebar() {
        if (window.innerWidth > BREAKPOINT_LG) return;

        var sidebar = document.querySelector('.sidebar');
        if (!sidebar) return;

        // Garante overlay
        var overlay = document.querySelector('.mobile-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.className = 'mobile-overlay';
            overlay.id = 'mobileOverlay';
            overlay.onclick = function () {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                document.body.style.overflow = '';
            };
            document.body.insertBefore(overlay, document.body.firstChild);
        }

        // Fecha sidebar ao clicar num link do menu
        var menuLinks = sidebar.querySelectorAll('.menu-item');
        menuLinks.forEach(function (link) {
            link.addEventListener('click', function () {
                if (window.innerWidth <= BREAKPOINT_LG) {
                    sidebar.classList.remove('mobile-open');
                    overlay.classList.remove('active');
                    document.body.style.overflow = '';
                }
            });
        });
    }

    /**
     * Melhora a acessibilidade de toque nos modais
     */
    function setupModalSwipe() {
        var modals = document.querySelectorAll('.modal');

        // 30.0 · Antes qualquer arrasto de 80px para baixo DENTRO do formulário fechava o modal
        // (no Android isso acontecia ao rolar o formulário e o modal "saía sozinho").
        // Agora só fecha arrastando pela barrinha do topo (cabeçalho), com gesto claro.
        modals.forEach(function (modal) {
            var startY = 0, startX = 0, fromHeader = false;

            modal.addEventListener('touchstart', function (e) {
                startY = e.touches[0].clientY;
                startX = e.touches[0].clientX;
                fromHeader = !!(e.target.closest && e.target.closest('.modal-header')) &&
                    !(e.target.closest && e.target.closest('input,select,textarea,button,a'));
            }, { passive: true });

            modal.addEventListener('touchend', function (e) {
                if (!fromHeader) return;
                var t = e.changedTouches && e.changedTouches[0]; if (!t) return;
                var deltaY = t.clientY - startY, deltaX = Math.abs(t.clientX - startX);
                if (deltaY > 120 && deltaX < 60) {
                    var overlay = modal.closest('.modal-overlay');
                    if (overlay) overlay.classList.remove('active');
                }
                fromHeader = false;
            }, { passive: true });
        });
    }

    /**
     * Adiciona indicador de scroll horizontal nas tabelas
     */
    function addTableScrollHints() {
        if (window.innerWidth > BREAKPOINT_MD) return;

        var tableContainers = document.querySelectorAll('.table-container');

        tableContainers.forEach(function (container) {
            // Wrapper para hint visual
            if (!container.parentElement.classList.contains('table-scroll-wrap')) {
                var wrap = document.createElement('div');
                wrap.className = 'table-scroll-wrap';
                wrap.style.cssText = 'position:relative;';
                container.parentNode.insertBefore(wrap, container);
                wrap.appendChild(container);
            }

            // Adiciona fade nas bordas se tiver scroll
            function checkScroll() {
                var hasScroll = container.scrollWidth > container.clientWidth;
                var atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 4;
                var atStart = container.scrollLeft <= 4;

                container.style.setProperty('--fade-left', atStart ? '0' : '1');
                container.style.setProperty('--fade-right', atEnd ? '0' : (hasScroll ? '1' : '0'));
            }

            container.addEventListener('scroll', checkScroll, { passive: true });
            checkScroll();
        });
    }

    /**
     * Ajusta viewport para prevenir zoom em iOS ao focar inputs
     */
    function preventIOSZoom() {
        // iOS faz zoom quando font-size < 16px em inputs
        // Já corrigido no CSS com font-size: 16px !important
        // Aqui apenas garantimos via meta se necessário
        var viewport = document.querySelector('meta[name="viewport"]');
        if (viewport && !viewport.content.includes('maximum-scale')) {
            // Não modifica — o HTML já tem maximum-scale=1
        }
    }

    /**
     * Ajusta tabelas para mobile de forma mais inteligente
     * Tabelas com poucas colunas ficam full-width
     */
    function optimizeTables() {
        if (window.innerWidth > BREAKPOINT_MD) return;

        var tables = document.querySelectorAll('.data-table');

        tables.forEach(function (table) {
            var cols = table.querySelectorAll('thead th').length;

            // Tabelas com até 4 colunas: sem min-width forçado
            if (cols <= 4) {
                table.style.minWidth = '0';
                table.style.width = '100%';
            } else if (cols <= 6) {
                table.style.minWidth = '480px';
            }
        });
    }

    /**
     * Executa ao carregar o DOM
     */
    function init() {
        patchInlineGrids();
        adjustMainContentHeight();
        setupMobileSidebar();
        preventIOSZoom();

        // Aguarda DOM completo para tabelas e modais
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', function () {
                optimizeTables();
                addTableScrollHints();
                setupModalSwipe();
            });
        } else {
            optimizeTables();
            addTableScrollHints();
            setupModalSwipe();
        }
    }

    /**
     * Reexecuta em resize (debounced)
     */
    var resizeTimer;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function () {
            adjustMainContentHeight();
            optimizeTables();
        }, 150);
    });

    // Inicia
    init();

})();

/* =========================================================
   PATCH EXTRA — Correções específicas por página
   ========================================================= */
(function () {
    'use strict';

    var isMobile = window.innerWidth <= 768;
    var isTablet = window.innerWidth <= 1024;

    /**
     * Fecha sidebar quando usuário navega (link clicado)
     */
    function setupSidebarAutoClose() {
        if (!isTablet) return;
        document.addEventListener('click', function (e) {
            var link = e.target.closest('a.menu-item, .menu-item[href]');
            if (!link) return;
            var sidebar = document.querySelector('.sidebar');
            var overlay = document.querySelector('.mobile-overlay');
            if (sidebar) sidebar.classList.remove('mobile-open');
            if (overlay) overlay.classList.remove('active');
            document.body.classList.remove('sidebar-open');
        });
    }

    /**
     * Corrige o botão de hamburger para controlar body.overflow
     */
    function patchSidebarToggle() {
        if (!isTablet) return;

        var btn = document.querySelector('.mobile-menu-btn');
        var sidebar = document.querySelector('.sidebar');
        var overlay = document.querySelector('.mobile-overlay');

        if (!btn || !sidebar) return;

        // Reescreve o onclick para gerenciar body-overflow também
        btn.onclick = function () {
            var isOpen = sidebar.classList.toggle('mobile-open');
            if (overlay) overlay.classList.toggle('active', isOpen);
            document.body.classList.toggle('sidebar-open', isOpen);
        };

        // Overlay fecha sidebar
        if (overlay) {
            overlay.onclick = function () {
                sidebar.classList.remove('mobile-open');
                overlay.classList.remove('active');
                document.body.classList.remove('sidebar-open');
            };
        }
    }

    /**
     * Corrige o botão toggleMobileSidebar global (chamado via onclick no HTML)
     */
    if (typeof window.toggleMobileSidebar !== 'undefined') {
        var originalToggle = window.toggleMobileSidebar;
        window.toggleMobileSidebar = function () {
            originalToggle();
            var sidebar = document.querySelector('.sidebar');
            var isOpen = sidebar && sidebar.classList.contains('mobile-open');
            document.body.classList.toggle('sidebar-open', isOpen);
        };
    }

    /**
     * Adiciona scroll-hint visual nas tabelas (indicador de seta)
     */
    function addScrollHint() {
        if (!isMobile) return;

        var containers = document.querySelectorAll('.table-container');
        containers.forEach(function (container) {
            // Só adiciona hint se houver scroll horizontal
            setTimeout(function () {
                if (container.scrollWidth > container.clientWidth + 10) {
                    if (!container.querySelector('.scroll-hint')) {
                        var hint = document.createElement('div');
                        hint.className = 'scroll-hint';
                        hint.innerHTML = '<i class="fas fa-angles-right"></i>';
                        hint.style.cssText = [
                            'position:absolute',
                            'right:8px',
                            'top:50%',
                            'transform:translateY(-50%)',
                            'background:var(--accent)',
                            'color:#fff',
                            'width:28px',
                            'height:28px',
                            'border-radius:50%',
                            'display:flex',
                            'align-items:center',
                            'justify-content:center',
                            'font-size:11px',
                            'z-index:10',
                            'pointer-events:none',
                            'opacity:0.9',
                            'box-shadow:0 2px 8px rgba(0,0,0,0.3)'
                        ].join(';');

                        container.style.position = 'relative';
                        container.appendChild(hint);

                        // Esconde ao scrollar até o fim
                        container.addEventListener('scroll', function () {
                            var atEnd = container.scrollLeft + container.clientWidth >= container.scrollWidth - 10;
                            hint.style.opacity = atEnd ? '0' : '0.9';
                        }, { passive: true });
                    }
                }
            }, 500);
        });
    }

    /**
     * Melhora formulários: label + input sempre em coluna no mobile
     */
    function fixFormLayouts() {
        if (!isMobile) return;

        // Grids de formulário dentro de modais e cards
        var formGrids = document.querySelectorAll(
            '.modal-body [style*="display:grid"], .card [style*="display:grid"]'
        );

        formGrids.forEach(function (grid) {
            var style = grid.getAttribute('style') || '';
            // Grids com 2+ colunas fixas dentro de modal/card
            if (/grid-template-columns.*1fr.*1fr/.test(style)) {
                grid.style.gridTemplateColumns = '1fr';
                grid.style.gap = '10px';
            }
        });
    }

    /**
     * Ajusta modal quando teclado virtual do iOS abre/fecha.
     * 
     * Problema: iOS reduz o viewport quando o teclado abre.
     * O modal (bottom sheet) some porque o overlay fica com
     * height: 100vh mas o viewport real encolheu.
     *
     * Solução: escutar visualViewport.resize e reposicionar
     * o overlay + garantir que o campo focado fique visível.
     */
    function adjustModalForKeyboard() {
        if (!isMobile) return;

        // ── Estratégia: NÃO redimensionar o overlay via JS ──
        // O problema era: JS ajustava height/top do overlay quando o
        // teclado abria → modal encolhia → footer subia com o teclado.
        //
        // Solução correta:
        //  1. CSS mantém o modal colado na base com position:fixed
        //  2. O modal-body rola internamente (flex:1 + overflow:auto)
        //  3. JS só faz scroll até o campo focado dentro do modal-body
        //  4. Nada no overlay ou modal é redimensionado pelo JS

        var scrollTimer = null;
        var resetTimer = null;

        // Scroll até o campo focado dentro do modal-body
        document.addEventListener('focusin', function(e) {
            var input = e.target;
            if (!input.matches('input, select, textarea')) return;
            var modal = input.closest('.modal');
            if (!modal) return;

            // Cancela reset pendente (evita pisca ao trocar campo)
            if (resetTimer) { clearTimeout(resetTimer); resetTimer = null; }
            if (scrollTimer) { clearTimeout(scrollTimer); }

            // Aguarda teclado terminar de abrir (~350ms no iOS)
            scrollTimer = setTimeout(function() {
                if (document.activeElement !== input) return;

                var modalBody = modal.querySelector('.modal-body');
                if (!modalBody) return;

                var inputRect = input.getBoundingClientRect();
                var bodyRect  = modalBody.getBoundingClientRect();

                // Campo abaixo da área visível: scroll para baixo
                if (inputRect.bottom > bodyRect.bottom - 16) {
                    modalBody.scrollTop += (inputRect.bottom - bodyRect.bottom + 32);
                }
                // Campo acima: scroll para cima
                else if (inputRect.top < bodyRect.top + 8) {
                    modalBody.scrollTop -= (bodyRect.top - inputRect.top + 16);
                }

                scrollTimer = null;
            }, 380);
        });

        // Quando sai do modal (teclado fecha de verdade)
        document.addEventListener('focusout', function(e) {
            if (!e.target.matches('input, select, textarea')) return;
            if (!e.target.closest('.modal')) return;

            // Só age se nenhum campo do modal ficar focado após 500ms
            resetTimer = setTimeout(function() {
                var active = document.activeElement;
                var stillInModal = active && active.closest('.modal-overlay.active');
                if (!stillInModal) {
                    // Nada a resetar — CSS cuida de tudo
                }
                resetTimer = null;
            }, 500);
        });
    }

    /**
     * Corrige o PDV especificamente — garante toggle do carrinho no mobile
     */
    function fixPDVMobile() {
        if (!isMobile) return;
        var pdvCart = document.getElementById('pdvCart');
        if (!pdvCart) return;

        // O PDV já tem seu próprio toggleCart — só garantimos o handle
        var handle = document.querySelector('.cart-handle');
        if (handle) {
            handle.addEventListener('touchstart', function (e) {
                e.stopPropagation();
            }, { passive: true });
        }

        // Fechar cart ao clicar fora
        document.addEventListener('click', function (e) {
            if (pdvCart.classList.contains('open') &&
                !pdvCart.contains(e.target) &&
                !e.target.closest('.pdv-mobile-toggle')) {
                pdvCart.classList.remove('open');
            }
        });
    }

    /**
     * Executa quando DOM estiver pronto
     */
    function initExtra() {
        setupSidebarAutoClose();
        patchSidebarToggle();
        addScrollHint();
        fixFormLayouts();
        adjustModalForKeyboard();
        fixPDVMobile();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initExtra);
    } else {
        initExtra();
    }

    // Re-executa em resize
    var resizeTimer2;
    window.addEventListener('resize', function () {
        clearTimeout(resizeTimer2);
        resizeTimer2 = setTimeout(function () {
            isMobile = window.innerWidth <= 768;
            isTablet = window.innerWidth <= 1024;
        }, 150);
    });

})();
