/* 37.5 · Hospedagem que tira o ".html" do endereço (Cloudflare Pages/Workers, Netlify, Vercel…): /login vira /login.html
   antes de o sistema ler o endereço. Sem isso o login mostrava a barra de baixo do PDV e várias telas não se reconheciam. */
(function () { try { var p = location.pathname, last = p.split('/').pop(); if (last && last.indexOf('.') < 0 && window.history && history.replaceState) history.replaceState(history.state, '', p + '.html' + location.search + location.hash); } catch (e) { } })();
/**
 * =========================================================
 * BRANDING.JS — Carregamento INSTANTÂNEO sem flash
 *
 * REGRAS SIMPLES:
 * - TEMA: padrão global definido em Configurações + troca temporária por sessão.
 *         O padrão é sincronizado de settings/general.defaultTheme.
 * - COR/LOGO/NOME: configurações da empresa. Sincronizam com Firestore
 *                  apenas na primeira vez ou quando mudam no servidor.
 * =========================================================
 */
(function () {
    var LS_THEME          = 'erp_theme';          // compatibilidade com versões anteriores
    var LS_THEME_DEFAULT  = 'erp_theme_default';  // tema global definido pelo administrador
    var LS_THEME_SESSION  = 'erp_theme_session';  // troca temporária do usuário nesta aba
    var LS_BRAND          = 'erp_branding';       // chave para cor, logo, nomes

    // Demonstração pública: branding é apenas uma pré-visualização desta aba/sessão.
    // Nunca lê/grava o branding persistente do cliente nem sincroniza com Firestore.
    // 39.3 · Fora da demonstração NUNCA é demo, mesmo que o sistema esteja numa pasta ou subdomínio chamado "teste".
    // Antes o modo demo era ligado pelo caminho da URL: um cliente instalado em /teste/ não gravava nome, logo nem
    // cor no banco (só nesta aba) e via "a empresa não salva". window.DP_IS_DEMO é a única fonte para as outras telas.
    var DP_DEMO_MODE = false;
    window.DP_IS_DEMO = DP_DEMO_MODE;
    var DEMO_BRAND_KEY = 'erp_demo_branding';
    var DEMO_DEFAULT_BRAND = {
        accentColor: '#6366f1',
        logoUrl: '',
        logoMode: 'logo_and_text',
        logoSize: 44,
        logoNoBg: true,
        companyName: 'DistribuiPro',
        systemName: 'Sistema ERP'
    };

    function _readBrand() {
        try {
            if (DP_DEMO_MODE) {
                var saved = JSON.parse(sessionStorage.getItem(DEMO_BRAND_KEY) || '{}');
                return Object.assign({}, DEMO_DEFAULT_BRAND, saved || {});
            }
            return JSON.parse(localStorage.getItem(LS_BRAND) || '{}');
        } catch(e) {
            return DP_DEMO_MODE ? Object.assign({}, DEMO_DEFAULT_BRAND) : {};
        }
    }

    // ════════════════════════════════════════════════════════
    // 1. APLICAR TEMA IMEDIATAMENTE (0ms) — antes de qualquer CSS
    // ════════════════════════════════════════════════════════
    var theme = sessionStorage.getItem(LS_THEME_SESSION)
        || localStorage.getItem(LS_THEME_DEFAULT)
        || localStorage.getItem(LS_THEME)
        || 'light';
    _applyTheme(theme);

    // ════════════════════════════════════════════════════════
    // 2. OCULTAR MENU INSTANTÂNEO por role (0ms, sem flash)
    // ════════════════════════════════════════════════════════
    var LS_ROLE = 'erp_user_role';
    var savedRole = localStorage.getItem(LS_ROLE) || '';

    // Mapeamento role → páginas permitidas (sem .html)
    var ROLE_PAGES = {
        admin:    null, // null = tudo liberado
        manager:  ['index','pdv','pedidos','entregas','caixa','ordens-servico','orcamentos','produtos','categorias','clientes','fornecedores','estoque','movimentacoes','compras','contas-pagar','contas-receber','fluxo-caixa','relatorios','comissoes','motoboys'],
        seller:   ['index','pdv','pedidos','clientes','ordens-servico','orcamentos','comissoes'],
        cashier:  ['index','pdv','pedidos','caixa','entregas','clientes','ordens-servico','orcamentos'],
        stock:    ['index','estoque','movimentacoes','compras','produtos'],
        financial:['index','contas-pagar','contas-receber','fluxo-caixa','relatorios'],
        delivery: ['index','entregas','pedidos'],
        technician:['index','ordens-servico','orcamentos','clientes','produtos','estoque'],
    };

    // 40.0 · A lista de telas que o app.js calculou para este usuário (perfil + telas liberadas/bloqueadas uma a uma).
    // Só o perfil escondia o Caixa de quem tinha o Caixa liberado.
    try {
        var dpPg = JSON.parse(localStorage.getItem('erp_user_pages') || 'null');
        if (dpPg && dpPg.role === savedRole && Array.isArray(dpPg.pages) && ROLE_PAGES[savedRole]) ROLE_PAGES[savedRole] = dpPg.pages;
    } catch (e) { }
    if (savedRole && savedRole !== 'admin' && ROLE_PAGES[savedRole]) {
        var allowed = ROLE_PAGES[savedRole];
        // Injeta CSS imediato para ocultar links não permitidos ANTES do DOM renderizar
        var css = '';
        var allPages = ['pdv','pedidos','entregas','caixa','produtos','categorias','clientes','fornecedores','estoque','movimentacoes','compras','contas-pagar','contas-receber','fluxo-caixa','relatorios','motoboys','usuarios','auditoria','configuracoes','relatorios','ordens-servico','orcamentos','comissoes'];
        allPages.forEach(function(p) {
            if (allowed.indexOf(p) === -1) {
                css += '.menu-item[href="' + p + '.html"]{display:none!important}';
            }
        });
        if (css) {
            var style = document.createElement('style');
            style.id = 'erp-role-css';
            style.textContent = css;
            document.head.appendChild(style);
        }
    }

    // ════════════════════════════════════════════════════════
    // 3. APLICAR COR/LOGO/NOME do localStorage (0ms)
    // ════════════════════════════════════════════════════════
    var brand = _readBrand();

    if (brand.accentColor) _applyColor(brand.accentColor);

    // ── LOGO: injeta CSS imediato no <head> (0ms, sem flash) ──────
    var sz = brand.logoSize || 64;
    var bgSize = brand.logoNoBg ? 'contain' : '100% 100%';
    var bgPos  = brand.logoNoBg ? 'left center' : 'center';
    var showText = brand.logoMode === 'logo_and_text';
    var textOnly = brand.logoMode === 'text_only';

    var instantCSS = ':root{--logo-size:' + sz + 'px;}';
    if (brand.logoUrl && !textOnly) {
        instantCSS += '.sidebar-brand{'
            + 'background-image:url(' + JSON.stringify(brand.logoUrl) + ') !important;'
            + 'background-size:' + bgSize + ' !important;'
            + 'background-repeat:no-repeat !important;'
            + 'background-position:' + bgPos + ' !important;'
            + 'padding-top:8px !important;'
            + 'padding-bottom:8px !important;'
            + 'box-sizing:content-box !important;'
            + (showText ? '' : 'height:' + sz + 'px !important;min-height:unset !important;')
            + '}';
        instantCSS += '.sidebar-brand .brand-icon,.sidebar-brand .dp-default-logo{display:none !important;}';
        // 35.36 · Com logo própria, o tema não põe a marca do DistribuiPro por cima (menu recolhido, menu aberto
        // pelo mouse, PDV) e, na faixa estreita do menu recolhido, a logo aparece inteira em vez de espremida.
        var dpBrandSel = 'html:root body .sidebar.sidebar .sidebar-brand.sidebar-brand';
        instantCSS += dpBrandSel + ' .brand-icon,' + dpBrandSel + ' .dp-default-logo{display:none !important;}';
        instantCSS += 'html:root body .sidebar.sidebar.collapsed:not(:hover) .sidebar-brand.sidebar-brand,'
            + 'html:root body .pdv-wrapper .sidebar.sidebar:not(:hover) .sidebar-brand.sidebar-brand'
            + '{background-size:contain !important;background-position:center !important;}';
        if (!showText) {
            instantCSS += '.sidebar-brand .brand-text{display:none !important;}';
        }
    }
    var styleTag = document.createElement('style');
    styleTag.id = 'erp-logo-instant';
    styleTag.textContent = instantCSS;
    document.head.appendChild(styleTag);

    // Nomes: aplica assim que o DOM existir
    _onDOM(function() {
        if (brand.companyName) _applyName(brand.companyName, '.brand-text h1');
        if (brand.systemName)  _applyName(brand.systemName,  '.brand-text span');
    });

    // ════════════════════════════════════════════════════════
    // FUNÇÕES INTERNAS
    // ════════════════════════════════════════════════════════

    // Sincroniza a logo padrão com o tema atual.
    // Tema claro = lettering escuro; tema escuro = lettering claro.
    function _syncDefaultBrandLogos(theme) {
        var file = theme === 'dark' ? 'distribuipro-logo-dark.png?v=41.5-logo' : 'distribuipro-logo-light.png?v=41.5-logo';
        var selector = '.dp-default-logo img, .dp-new-login-logo img, .login-brand .brand-logo img';
        document.querySelectorAll(selector).forEach(function(img) {
            var src = img.getAttribute('src') || '';
            if (!/distribuipro-logo-(?:dark|light)\.png/i.test(src)) return;
            var next = src.replace(/distribuipro-logo-(?:dark|light)\.png(?:\?v=[\w.-]+)?/i, file); // 39.5 · leva junto o ?v= antigo
            if (next !== src) img.setAttribute('src', next);
        });
    }

    function _validTheme(theme) {
        return theme === 'light' || theme === 'dark';
    }

    function _applyTheme(theme) {
        theme = _validTheme(theme) ? theme : 'light';
        document.documentElement.setAttribute('data-theme', theme);
        try {
            document.documentElement.style.colorScheme = theme;
            var meta = document.querySelector('meta[name="theme-color"]');
            if (meta) meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0a0e1a');
            var icon = document.getElementById('themeIcon');
            if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
            window.dispatchEvent(new CustomEvent('dp-theme-change', { detail: { theme: theme } }));
        } catch(e) {}
        _onDOM(function(){ _syncDefaultBrandLogos(theme); });
        return theme;
    }

    function _applyColor(hex) {
        if (!hex || !/^#[0-9a-fA-F]{6}$/.test(hex)) return;
        var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
        var light = function(c){ return Math.min(255,c+40).toString(16).padStart(2,'0'); };
        var hov = '#'+light(r)+light(g)+light(b);
        var d = document.documentElement;
        d.style.setProperty('--accent',       hex);
        d.style.setProperty('--accent-hover', hov);
        d.style.setProperty('--accent-muted', 'rgba('+r+','+g+','+b+',0.15)');
        d.style.setProperty('--accent-glow',  'rgba('+r+','+g+','+b+',0.3)');
    }


    // ── LOGO: usa background-image no sidebar-brand ──────────────
    function _applyLogo(url) {
        var brand = document.querySelector('.sidebar-brand');
        if (!brand) return;
        if (url) {
            brand.style.backgroundImage = 'url(' + url + ')';
            brand.classList.add('has-logo');
            var def=brand.querySelector('.dp-default-logo'); if(def) def.style.display='none';
        } else {
            brand.style.backgroundImage = '';
            brand.classList.remove('has-logo', 'show-text');
            var def=brand.querySelector('.dp-default-logo'); if(def) def.style.display='';
            // restaura ícone padrão
            var icon = brand.querySelector('.brand-icon');
            if (icon) icon.style.display = '';
        }
    }

    function _applyLogoMode(mode) {
        var brand = document.querySelector('.sidebar-brand');
        if (!brand) return;
        brand.classList.remove('logo-only-mode', 'text-only-mode', 'show-text');
        var text = brand.querySelector('.brand-text');
        var icon = brand.querySelector('.brand-icon');
        var hasLogo = brand.classList.contains('has-logo');

        if (mode === 'logo_only' || (hasLogo && mode !== 'text_only')) {
            // logo preenche tudo, sem texto
            if (text) text.style.display = 'none';
        } else if (mode === 'logo_and_text' && hasLogo) {
            brand.classList.add('show-text');
            if (text) text.style.display = '';
        } else if (mode === 'text_only') {
            brand.classList.add('text-only-mode');
            brand.style.backgroundImage = '';
            brand.classList.remove('has-logo');
            if (icon) icon.style.display = '';
            if (text) text.style.display = '';
        }
    }

    function _applyLogoSize(px) {
        document.documentElement.style.setProperty('--logo-size', px + 'px');
        var brand = document.querySelector('.sidebar-brand');
        if (brand && brand.classList.contains('has-logo')) {
            brand.style.height = px + 'px';
        }
    }

    function _applyLogoBg(noBg) {
        var brand = document.querySelector('.sidebar-brand');
        if (!brand) return;
        if (noBg) {
            brand.setAttribute('data-no-bg', '1');
            brand.style.backgroundSize = 'contain';
            brand.style.backgroundPosition = 'left center';
        } else {
            brand.removeAttribute('data-no-bg');
            brand.style.backgroundSize = '100% 100%';
            brand.style.backgroundPosition = 'center';
        }
    }

    function _applyName(name, selector) {
        if (!name) return;
        var el = document.querySelector('.sidebar-brand ' + selector);
        if (el) el.textContent = name;
    }

    function _onDOM(fn) {
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', fn);
        } else { fn(); }
    }

    function _saveBrand(data) {
        try {
            if (DP_DEMO_MODE) sessionStorage.setItem(DEMO_BRAND_KEY, JSON.stringify(data));
            else localStorage.setItem(LS_BRAND, JSON.stringify(data));
        } catch(e) {}
    }

    // ════════════════════════════════════════════════════════
    // API PÚBLICA — window.BrandingManager
    // ════════════════════════════════════════════════════════
    window.BrandingManager = {

        // ── TEMA ─────────────────────────────────────────────
        // defaultTheme = padrão global do sistema; troca do cabeçalho = sessão atual.
        getTheme: function() {
            return document.documentElement.getAttribute('data-theme')
                || sessionStorage.getItem(LS_THEME_SESSION)
                || localStorage.getItem(LS_THEME_DEFAULT)
                || localStorage.getItem(LS_THEME)
                || 'light';
        },
        getDefaultTheme: function() {
            var t = localStorage.getItem(LS_THEME_DEFAULT) || localStorage.getItem(LS_THEME) || 'light';
            return _validTheme(t) ? t : 'light';
        },
        setTheme: function(theme) {
            if (!_validTheme(theme)) return;
            // A troca manual vale somente durante a sessão/aba atual.
            sessionStorage.setItem(LS_THEME_SESSION, theme);
            localStorage.setItem(LS_THEME, theme); // compatibilidade com versões anteriores
            _applyTheme(theme);
        },
        setDefaultTheme: function(theme, applyNow) {
            if (!_validTheme(theme)) return;
            localStorage.setItem(LS_THEME_DEFAULT, theme);
            localStorage.setItem(LS_THEME, theme);
            if (applyNow !== false) {
                sessionStorage.removeItem(LS_THEME_SESSION);
                _applyTheme(theme);
            } else if (!sessionStorage.getItem(LS_THEME_SESSION)) {
                _applyTheme(theme);
            }
        },
        clearThemeSession: function() {
            sessionStorage.removeItem(LS_THEME_SESSION);
            _applyTheme(this.getDefaultTheme());
        },

        // ── COR ──────────────────────────────────────────────
        previewColor: function(hex) { _applyColor(hex); },  // preview sem salvar
        setColor: function(hex) {
            _applyColor(hex);
            var b = this.getBrand(); b.accentColor = hex; _saveBrand(b);
            _firestoreSet({ accentColor: hex });
        },

        // ── LOGO ─────────────────────────────────────────────
        setLogo: function(url) {
            _onDOM(function(){ _applyLogo(url); });
            var b = this.getBrand(); b.logoUrl = url; _saveBrand(b);
            _firestoreSet({ logoUrl: url });
        },

        // ── NOMES ────────────────────────────────────────────
        setCompanyName: function(name) {
            _onDOM(function(){ _applyName(name, '.brand-text h1'); });
            var b = this.getBrand(); b.companyName = name; _saveBrand(b);
            _firestoreSet({ nomeFantasia: name });
        },
        setSystemName: function(name) {
            _onDOM(function(){ _applyName(name, '.brand-text span'); });
            var b = this.getBrand(); b.systemName = name; _saveBrand(b);
            _firestoreSet({ systemName: name });
        },

        // ── SALVAR TUDO ──────────────────────────────────────
        // 39.3 · opts.semServidor = true: só tela e cache local (quem chamou já gravou settings/general).
        saveAll: function(data, opts) {
            var b = this.getBrand();
            var toFS = {};
            if (data.accentColor) { b.accentColor = data.accentColor; _applyColor(data.accentColor); toFS.accentColor = data.accentColor; }
            if (data.companyName) { b.companyName = data.companyName; _onDOM(function(){ _applyName(data.companyName, '.brand-text h1'); }); toFS.nomeFantasia = data.companyName; }
            if (data.systemName)  { b.systemName  = data.systemName;  _onDOM(function(){ _applyName(data.systemName,  '.brand-text span'); }); toFS.systemName = data.systemName; }
            if (data.logoUrl !== undefined) { b.logoUrl = data.logoUrl; _onDOM(function(){ _applyLogo(data.logoUrl); }); toFS.logoUrl = data.logoUrl; }
            if (data.logoMode !== undefined) { b.logoMode = data.logoMode; _onDOM(function(){ _applyLogoMode(data.logoMode); }); toFS.logoMode = data.logoMode; }
            if (data.logoSize !== undefined) { b.logoSize = data.logoSize; _onDOM(function(){ _applyLogoSize(data.logoSize); }); toFS.logoSize = data.logoSize; }
            if (data.logoNoBg !== undefined) { b.logoNoBg = data.logoNoBg; _onDOM(function(){ _applyLogoBg(data.logoNoBg); }); toFS.logoNoBg = data.logoNoBg; }
            if (data.defaultTheme !== undefined && _validTheme(data.defaultTheme)) { this.setDefaultTheme(data.defaultTheme, true); }
            _saveBrand(b);
            if (opts && opts.semServidor) return;
            if (Object.keys(toFS).length) _firestoreSet(toFS);
        },

        // ── GETTERS ──────────────────────────────────────────
        getBrand: function() { return _readBrand(); },

        // ── DOWNLOAD BRANDING.JSON ───────────────────────────
        downloadJson: function() {
            var b = this.getBrand();
            var json = JSON.stringify({
                theme:       this.getTheme(),
                defaultTheme:this.getDefaultTheme(),
                accentColor: b.accentColor  || '#6366f1',
                logoUrl:     b.logoUrl       || '',
                logoMode:    b.logoMode      || 'logo_only',
                logoSize:    b.logoSize      || 64,
                logoNoBg:    b.logoNoBg      || false,
                companyName: b.companyName  || 'DistribuiPRO',
                systemName:  b.systemName   || 'Sistema ERP',
                updatedAt:   new Date().toISOString()
            }, null, 2);
            var a = document.createElement('a');
            a.href = URL.createObjectURL(new Blob([json],{type:'application/json'}));
            a.download = 'branding.json'; a.click();
            URL.revokeObjectURL(a.href);
        },

        // ── EXPOR INTERNOS ───────────────────────────────────
        applyColor:       _applyColor,
        applyLogo:        function(url){ _onDOM(function(){ _applyLogo(url); }); },
        applyCompanyName: function(n){ _onDOM(function(){ _applyName(n,'.brand-text h1'); }); },
        applySystemName:  function(n){ _onDOM(function(){ _applyName(n,'.brand-text span'); }); },
        applyTheme:       function(t){ this.setTheme(t); },
        applyLogoMode:    function(m){ _onDOM(function(){ _applyLogoMode(m); }); },
        applyLogoSize:    function(px){ _onDOM(function(){ _applyLogoSize(px); }); },
        applyLogoBg:      function(noBg){ _onDOM(function(){ _applyLogoBg(noBg); }); },
    };

    // ── FIRESTORE HELPER ──────────────────────────────────────
    function _firestoreSet(data) {
        if (DP_DEMO_MODE) return;
        if (typeof db === 'undefined') {
            // Firebase ainda não carregou — tentar depois
            _onDOM(function() {
                var t = 0;
                var iv = setInterval(function() {
                    t++;
                    if (typeof db !== 'undefined') { clearInterval(iv); _firestoreSet(data); }
                    if (t > 30) clearInterval(iv);
                }, 200);
            });
            return;
        }
        data.updatedAt = firebase.firestore ? firebase.firestore.FieldValue.serverTimestamp() : new Date().toISOString();
        db.collection('settings').doc('general')
          .set(data, { merge: true })
          // 39.3 · Antes a falha ficava só no console: o nome/logo apareciam neste aparelho (cache local) e em nenhum outro.
          .catch(function(e){ console.warn('Branding save:', e); if (window.Toast && window.dpErroHumano) Toast.error('A identidade visual não foi gravada no servidor: ' + dpErroHumano(e)); });
    }

    // ════════════════════════════════════════════════════════
    // 3. SYNC DO FIRESTORE — tema padrão global + identidade visual.
    //    Roda uma vez após login e mantém o cache local atualizado.
    // ════════════════════════════════════════════════════════
    _onDOM(function() {
        if (DP_DEMO_MODE) return;
        var tries = 0;
        var iv = setInterval(function() {
            tries++;
            if (typeof db !== 'undefined' && typeof auth !== 'undefined') {
                clearInterval(iv);
                auth.onAuthStateChanged(function(user) {
                    if (!user) return;
                    // Salva role do usuário no localStorage para filtro instantâneo
                    db.collection('users').doc(user.uid).get().then(function(userDoc) {
                        if (userDoc.exists) {
                            var role = userDoc.data().role || 'seller';
                            var currentSaved = localStorage.getItem('erp_user_role');
                            if (currentSaved !== role) {
                                localStorage.setItem('erp_user_role', role);
                            }
                        }
                    }).catch(function(){});

                    db.collection('settings').doc('general').get().then(function(doc) {
                        if (!doc.exists) return;
                        var s   = doc.data();
                        // Tema padrão global. Troca manual da sessão continua respeitada.
                        if (_validTheme(s.defaultTheme)) {
                            localStorage.setItem(LS_THEME_DEFAULT, s.defaultTheme);
                            localStorage.setItem(LS_THEME, s.defaultTheme);
                            if (!sessionStorage.getItem(LS_THEME_SESSION)) _applyTheme(s.defaultTheme);
                        }
                        var b   = window.BrandingManager.getBrand();
                        var changed = false;

                        // Cor: atualiza se diferente
                        if (s.accentColor && s.accentColor !== b.accentColor) {
                            _applyColor(s.accentColor);
                            b.accentColor = s.accentColor;
                            changed = true;
                        }
                        // Logo: atualiza se diferente. 39.3 · inclusive quando foi REMOVIDA em outro aparelho (logoUrl vazio):
                        // antes o vazio era ignorado e a logo antiga continuava neste computador.
                        if (s.logoUrl !== undefined && (s.logoUrl || '') !== (b.logoUrl || '')) {
                            _applyLogo(s.logoUrl || '');
                            b.logoUrl = s.logoUrl || '';
                            changed = true;
                        }
                        if (s.logoMode && s.logoMode !== b.logoMode) {
                            _applyLogoMode(s.logoMode);
                            b.logoMode = s.logoMode;
                            changed = true;
                        }
                        if (s.logoSize && s.logoSize !== b.logoSize) {
                            _applyLogoSize(s.logoSize);
                            b.logoSize = s.logoSize;
                            changed = true;
                        }
                        if (s.logoNoBg !== undefined && s.logoNoBg !== b.logoNoBg) {
                            _applyLogoBg(s.logoNoBg);
                            b.logoNoBg = s.logoNoBg;
                            changed = true;
                        }
                        // Nomes: atualiza se diferentes
                        if (s.nomeFantasia && s.nomeFantasia !== b.companyName) {
                            _applyName(s.nomeFantasia, '.brand-text h1');
                            b.companyName = s.nomeFantasia;
                            changed = true;
                        }
                        if (s.systemName && s.systemName !== b.systemName) {
                            _applyName(s.systemName, '.brand-text span');
                            b.systemName = s.systemName;
                            changed = true;
                        }
                        // Tema já sincronizado acima; identidade visual segue normalmente
                        if (changed) _saveBrand(b);
                    }).catch(function(){});
                });
            }
            if (tries > 25) clearInterval(iv);
        }, 100);
    });

})();

/* cache:C5E7A5BEE2443C6D */
