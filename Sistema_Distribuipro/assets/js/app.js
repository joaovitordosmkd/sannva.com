/**
 * =========================================================
 * DISTRIBUIDORA ERP - Inicialização do App
 * =========================================================
 */

// ─── VARIÁVEIS GLOBAIS ─────────────────────────────────
let currentUser = null;
let currentPage = '';

// 38.1 · Instalar no celular (Início › Primeiros passos): manifest do app e o pedido de instalação do navegador
(function () {
    try {
        if (window.DISTRIBUIPRO_OFFLINE || (typeof db !== 'undefined' && db.__isLocalDemo) || /garcom\.html$/.test(location.pathname) || document.querySelector('link[rel="manifest"]')) return;
        const l = document.createElement('link'); l.rel = 'manifest'; l.href = 'manifest.json'; document.head.appendChild(l);
        window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); window.__dpInstall = e; document.dispatchEvent(new Event('dp:install')); });
        window.addEventListener('appinstalled', () => { window.__dpInstall = null; try { localStorage.setItem('dp_app_installed', '1'); } catch (er) { } document.dispatchEvent(new Event('dp:install')); });
    } catch (e) { }
})();

// ─── CADASTRO DO USUÁRIO LOGADO ─────────────────────────
// 39.14.14 · Lê users/<uid> com até `tentativas` tentativas (espera 1,2 s e 2,4 s entre elas) e no máximo 15 s cada
// (pedido que a hospedagem não responde ficava pendurado para sempre e a tela, sem o cadastro, sem aviso). Erro guardado
// em window.__dpErroUsuario (texto para a tela). Devolve null quando o login existe sem cadastro.
async function dpLerUsuario(tentativas) {
    let ultimo = null;
    const limite = () => new Promise((_, rej) => setTimeout(() => { const e = new Error('O servidor não respondeu em 15 segundos.'); e.code = 'dp/timeout-usuario'; rej(e); }, 15000));
    for (let i = 0; i < Math.max(1, tentativas || 1); i++) {
        if (i) await new Promise(r => setTimeout(r, 1200 * i));
        const leitura = AuthService.getCurrentUser();
        leitura.then(u => { if (u && !currentUser) currentUser = u; }, () => { }); // respondeu depois do prazo: ainda serve
        try { const u = await Promise.race([leitura, limite()]); window.__dpErroUsuario = ''; return u; }
        catch (e) {
            ultimo = e;
            console.warn('Cadastro do usuário: tentativa ' + (i + 1) + ' falhou', e);
            if (e && (e.status === 401 || e.status === 403 || e.code === 'permission-denied' || e.code === 'auth-required')) break; // não é passageiro
        }
    }
    window.__dpErroUsuario = window.dpErroHumano ? dpErroHumano(ultimo) : String((ultimo && ultimo.message) || ultimo || '');
    throw ultimo;
}
/** O cadastro do usuário para a tela agora: o que já carregou ou, se faltou ao abrir, uma nova leitura. Nunca cria cadastro. */
window.dpGarantirUsuario = async function () {
    if (currentUser) return currentUser;
    if (typeof auth === 'undefined' || !auth || !auth.currentUser) return null;
    try { const u = await dpLerUsuario(2); if (u && !currentUser) currentUser = u; } catch (e) { }
    return currentUser;
};

// ─── INICIALIZAR APP ────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});

async function initApp() {
    // Verificar autenticação
    auth.onAuthStateChanged(async (user) => {
        if (!user) {
            window.location.href = 'login.html';
            return;
        }

        // Carregar dados do usuário
        // 39.3 · Se a leitura do cadastro falhar (sessão expirada, conexão que oscilou), antes a inicialização parava em
        // silêncio e a tela ficava sem o cargo do usuário ("sem permissão" até para o admin). Agora avisa o motivo.
        // 39.14.14 · Tenta 3 vezes antes de desistir (uma falha passageira da hospedagem ao abrir a tela deixava o PDV sem o
        // cadastro até recarregar) e guarda o motivo em window.__dpErroUsuario (dpGarantirUsuario tenta de novo depois).
        try {
            currentUser = await dpLerUsuario(3);
        } catch (e) {
            console.error('Cadastro do usuário:', e);
            if (window.Toast) Toast.error('Não foi possível carregar o seu cadastro: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message)) + ' Recarregue a página.');
            return;
        }
        if (!currentUser) {
            // 39.14.15 · Login SEM cadastro num sistema que já tem empresa: antes virava "administrador" na tela (e, com
            // regras antigas do Firestore, gravava users/<uid> como admin) — qualquer funcionário que usasse "Criar conta de
            // administrador" no login ganhava o sistema inteiro. Agora: empresa já configurada (settings/general existe) =
            // não cria nada e sai; não deu para ler (regras novas: sem cadastro não lê) = tenta criar e a regra decide
            // (só deixa no banco novo, isFirstSetup); recusou = sai também.
            const semAcesso = async () => {
                if (window.Toast) Toast.error('Este login ainda não tem acesso ao sistema. Peça ao administrador para criar o seu usuário em Usuários.');
                try { await auth.signOut(); } catch (_) { }
                setTimeout(() => { window.location.href = 'login.html'; }, 2500);
            };
            let empresaExiste = null;
            try { empresaExiste = (await db.collection('settings').doc('general').get()).exists; } catch (_) { empresaExiste = null; }
            if (empresaExiste === true) { await semAcesso(); return; }
            // Usuário autenticado mas sem doc no Firestore - criar doc automaticamente
            currentUser = {
                uid: user.uid,
                name: user.displayName || 'Admin',
                email: user.email,
                role: 'admin',
                status: 'active'
            };
            // Salvar no Firestore
            try {
                await db.collection('users').doc(user.uid).set(currentUser, { merge: true });
            } catch(e) {
                console.warn('Não foi possível salvar perfil:', e);
                if (e && e.code === 'permission-denied') { currentUser = null; await semAcesso(); return; } // 39.14.15 · a regra recusou: não é o 1º administrador
            }
        }

        if (currentUser.status && currentUser.status !== 'active') {
            auth.signOut();
            window.location.href = 'login.html';
            return;
        }
        // 39.14.15 · Sistema em uso: grava a marca pública "sistema-instalado" (uma vez por navegador) para o login esconder
        // "Criar conta de administrador". Antes só era gravada ao criar o administrador (39.2): sistemas mais antigos e quem
        // entra pelo formulário de login nunca a gravavam, e o link continuava aparecendo para todo mundo.
        try {
            if (localStorage.getItem('dp_admin_criado') !== '1') {
                const marca = db.collection('os_tracking').doc('sistema-instalado');
                marca.get()
                    .then(d => (d.exists ? null : marca.set({ instalado: true, em: firebase.firestore.FieldValue.serverTimestamp() })))
                    .then(() => { try { localStorage.setItem('dp_admin_criado', '1'); } catch (_) { } })
                    .catch(e => console.warn('Marca de sistema instalado:', e && e.message));
            }
        } catch (_) { }

        // Carregar componentes
        await loadSidebar();
        setupHeader();
        setupTheme();
        markActivePage();

        // Salva role no localStorage para filtro instantâneo na próxima carga
        if (currentUser?.role) {
            localStorage.setItem('erp_user_role', currentUser.role);
        }

        // Aplicar restrições de menu baseadas no perfil (via CSS já aplicado pelo branding.js)
        dpInjectExtraMenu();
        applySidebarPermissions(currentUser);

        // Inicializar a página específica
        if (typeof initPage === 'function') {
            initPage();
        }
    });
}

// ─── CARREGAR SIDEBAR ───────────────────────────────────
async function loadSidebar() {
    // Páginas com sidebar inline (ex.: OS/Comissões) não dependem de fetch.
    // Isso elimina o atraso visual e garante a marca desde o primeiro frame.
    if (document.querySelector('.sidebar') && !document.getElementById('sidebarContainer')) {
        _reapplyBrandingToSidebar();
        return;
    }
    try {
        const res = await fetch('components/sidebar.html?v=17.14-logout');
        const html = await res.text();
        const container = document.getElementById('sidebarContainer');
        if (container) {
            // Aplica branding ANTES de mostrar o novo HTML
            // para evitar flash de conteúdo não estilizado
            const b = window.BrandingManager ? window.BrandingManager.getBrand() : JSON.parse(localStorage.getItem('erp_branding') || '{}');
            const sz = b.logoSize || 64;
            const bgSize = b.logoNoBg ? 'contain' : '100% 100%';
            const bgPos  = b.logoNoBg ? 'left center' : 'center';
            const showText = b.logoMode === 'logo_and_text';
            const textOnly = b.logoMode === 'text_only';

            // Cria elemento temporário para manipular antes de inserir
            const tmp = document.createElement('div');
            tmp.innerHTML = html;
            const brand = tmp.querySelector('.sidebar-brand');
            if (brand && b.logoUrl && !textOnly) {
                brand.style.backgroundImage = 'url(' + b.logoUrl + ')';
                brand.style.backgroundSize = bgSize;
                brand.style.backgroundRepeat = 'no-repeat';
                brand.style.backgroundPosition = bgPos;
                if (!showText) {
                    brand.style.height = sz + 'px';
                    brand.style.minHeight = 'unset';
                }
                brand.classList.add('has-logo');
                const def = brand.querySelector('.dp-default-logo'); if(def) def.style.display='none';
                const icon = brand.querySelector('.brand-icon');
                if (icon) icon.style.display = 'none';
                if (!showText) {
                    const text = brand.querySelector('.brand-text');
                    if (text) text.style.display = 'none';
                } else {
                    brand.classList.add('show-text');
                }
                if (b.logoNoBg) brand.setAttribute('data-no-bg', '1');
            }
            if (brand && b.companyName) {
                const h1 = brand.querySelector('.brand-text h1');
                if (h1) h1.textContent = b.companyName;
            }
            if (brand && b.systemName) {
                const sp = brand.querySelector('.brand-text span');
                if (sp) sp.textContent = b.systemName;
            }
            container.innerHTML = tmp.innerHTML;
        }
        _reapplyBrandingToSidebar();
    } catch (e) {
        console.warn('Sidebar inline no HTML');
        _reapplyBrandingToSidebar();
    }
}

function _reapplyBrandingToSidebar() {
    try {
        var b = window.BrandingManager ? window.BrandingManager.getBrand() : JSON.parse(localStorage.getItem('erp_branding') || '{}');
        var brand = document.querySelector('.sidebar-brand');
        if (!brand) return;

        var sz = b.logoSize || 44;
        var mode = b.logoMode || 'logo_and_text';
        var text = brand.querySelector('.brand-text');
        var icon = brand.querySelector('.brand-icon');
        var hasCustomLogo = !!b.logoUrl;

        document.documentElement.style.setProperty('--logo-size', sz + 'px');

        // Sempre começa de um estado conhecido. Isso evita a marca aparecer no HTML
        // e sumir quando o app.js termina de carregar.
        brand.classList.remove('has-logo', 'show-text', 'text-only-mode', 'logo-only-mode');
        brand.style.backgroundImage = '';
        brand.style.backgroundRepeat = '';
        brand.style.backgroundSize = '';
        brand.style.backgroundPosition = '';
        brand.style.height = '';
        brand.style.minHeight = '';
        brand.removeAttribute('data-no-bg');
        if (icon) icon.style.display = '';
        if (text) text.style.display = '';

        // Nome e subtítulo continuam personalizáveis.
        if (b.companyName) { var h1 = brand.querySelector('.brand-text h1'); if (h1) h1.textContent = b.companyName; }
        if (b.systemName)  { var sp = brand.querySelector('.brand-text span'); if (sp) sp.textContent = b.systemName; }

        // Sem logo personalizada: usa a marca padrão DistribuiPro já presente no HTML.
        // Respeita o modo de exibição sem deixar o sidebar vazio.
        if (!hasCustomLogo) {
            if (mode === 'logo_only') {
                brand.classList.add('logo-only-mode');
                if (icon) icon.style.display = '';
                if (text) text.style.display = 'none';
            } else if (mode === 'text_only') {
                brand.classList.add('text-only-mode');
                if (icon) icon.style.display = 'none';
                if (text) text.style.display = '';
            } else {
                if (icon) icon.style.display = '';
                if (text) text.style.display = '';
            }
            return;
        }

        // Logo personalizada.
        brand.style.backgroundImage = 'url(' + b.logoUrl + ')';
        brand.style.backgroundRepeat = 'no-repeat';
        brand.classList.add('has-logo');
        if (b.logoNoBg) {
            brand.setAttribute('data-no-bg','1');
            brand.style.backgroundSize = 'contain';
            brand.style.backgroundPosition = 'left center';
        } else {
            brand.style.backgroundSize = '100% 100%';
            brand.style.backgroundPosition = 'center';
        }

        if (mode === 'text_only') {
            brand.classList.remove('has-logo');
            brand.classList.add('text-only-mode');
            brand.style.backgroundImage = '';
            if (icon) icon.style.display = 'none';
            if (text) text.style.display = '';
        } else if (mode === 'logo_and_text') {
            brand.classList.add('show-text');
            if (icon) icon.style.display = 'none';
            if (text) text.style.display = '';
        } else {
            brand.classList.add('logo-only-mode');
            brand.style.height = sz + 'px';
            brand.style.minHeight = 'unset';
            if (icon) icon.style.display = 'none';
            if (text) text.style.display = 'none';
        }
    } catch(e) { console.warn('Branding reapply:', e); }
}

// ─── CONFIGURAR HEADER ──────────────────────────────────
function setupHeader() {
    const avatar   = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');

    if (avatar && currentUser) {
        if (currentUser.photoUrl) {
            // Foto: substitui o avatar por img
            avatar.innerHTML = `<img src="${currentUser.photoUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:50%">`;
            avatar.style.padding = '0';
            avatar.style.overflow = 'hidden';
        } else if (currentUser.photoEmoji) {
            // Emoji: exibe no lugar da inicial
            avatar.textContent = currentUser.photoEmoji;
            avatar.style.fontSize = '18px';
            avatar.style.lineHeight = '1';
        } else {
            // Inicial do nome
            avatar.textContent = (currentUser.name || 'U').charAt(0).toUpperCase();
        }
    }
    if (userName && currentUser) {
        userName.textContent = currentUser.name || 'Usuário';
    }

    // Busca global
    const searchInput = document.getElementById('globalSearch');
    if (searchInput) {
        searchInput.addEventListener('input', Utils.debounce((e) => {
            globalSearch(e.target.value);
        }, 300));
    }
}

// ─── SIDEBAR TOGGLE ─────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    sidebar.classList.toggle('collapsed');

    if (sidebar.classList.contains('collapsed')) {
        icon.className = 'fas fa-angles-right';
        localStorage.setItem('sidebarCollapsed', 'true');
    } else {
        icon.className = 'fas fa-angles-left';
        localStorage.setItem('sidebarCollapsed', 'false');
    }
}

// Restaurar estado do sidebar
function restoreSidebarState() {
    const sidebar = document.getElementById('sidebar');
    const icon = document.getElementById('sidebarToggleIcon');
    if (!sidebar) return;

    const isDesktop = window.matchMedia('(min-width: 1025px)').matches;
    if (!isDesktop) return;

    // 17.8: a referência visual passa a usar sidebar compacta por padrão.
    // Faz a migração uma única vez; depois respeita a escolha do usuário.
    const layoutVersion = localStorage.getItem('sidebarLayoutVersion');
    if (layoutVersion !== '17.8') {
        localStorage.setItem('sidebarCollapsed', 'true');
        localStorage.setItem('sidebarLayoutVersion', '17.8');
    }

    const shouldCollapse = localStorage.getItem('sidebarCollapsed') !== 'false';
    sidebar.classList.toggle('collapsed', shouldCollapse);
    if (icon) icon.className = shouldCollapse ? 'fas fa-angles-right' : 'fas fa-angles-left';
}

// Mobile sidebar
function toggleMobileSidebar() {
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('mobileOverlay');
    sidebar.classList.toggle('mobile-open');
    overlay?.classList.toggle('active');
}

// ─── TEMA CLARO/ESCURO ──────────────────────────────────
function syncThemeChrome177(theme) {
    try {
        const meta = document.querySelector('meta[name="theme-color"]');
        if (meta) meta.setAttribute('content', theme === 'light' ? '#f8fafc' : '#0a0e1a');
        document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
        window.dispatchEvent(new CustomEvent('dp-theme-change', { detail: { theme } }));
    } catch (_) {}
}

function setupTheme() {
    // branding.js aplica o tema global antes do layout. Aqui apenas sincronizamos o chrome.
    const theme = window.BrandingManager
        ? BrandingManager.getTheme()
        : (document.documentElement.getAttribute('data-theme') || localStorage.getItem('erp_theme_default') || 'light');
    document.documentElement.setAttribute('data-theme', theme);
    syncThemeChrome177(theme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = theme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'light';
    const newTheme = current === 'dark' ? 'light' : 'dark';
    // A troca manual fica só na sessão atual. Novo acesso volta ao padrão do administrador.
    if (window.BrandingManager) {
        BrandingManager.setTheme(newTheme);
    } else {
        sessionStorage.setItem('erp_theme_session', newTheme);
        document.documentElement.setAttribute('data-theme', newTheme);
    }
    syncThemeChrome177(newTheme);
    const icon = document.getElementById('themeIcon');
    if (icon) icon.className = newTheme === 'dark' ? 'fas fa-sun' : 'fas fa-moon';
}

// ─── MARCAR PÁGINA ATIVA ────────────────────────────────
function markActivePage() {
    const path = window.location.pathname;
    const page = path.split('/').pop().replace('.html', '') || 'index';

    document.querySelectorAll('.menu-item').forEach(item => {
        item.classList.remove('active');
        const href = item.getAttribute('href') || '';
        const itemPage = href.replace('.html', '');

        if ((page === 'index' && itemPage === 'index') ||
            (page !== 'index' && href.includes(page))) {
            item.classList.add('active');
        }
    });

    restoreSidebarState();
}

// ─── BUSCA GLOBAL ───────────────────────────────────────
function globalSearch(query) {
    if (!query || query.length < 2) return;
    console.log('Buscando:', query);
    // Implementar busca global aqui
}

// ─── DROPDOWN DO PERFIL ─────────────────────────────────
function toggleProfileMenu() {
    // Fechar notif se aberta
    const notif = document.getElementById('notifPanel');
    if (notif) notif.remove();

    let menu = document.getElementById('profileMenu');
    if (menu) { menu.remove(); return; }

    const avatar = document.getElementById('userAvatar');
    if (!avatar) return;
    const rect = avatar.getBoundingClientRect();

    menu = document.createElement('div');
    menu.id = 'profileMenu';
    menu.style.cssText = `
        position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
        min-width:220px;background:var(--bg-card);border:1px solid var(--border-color);
        border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;
        overflow:hidden;animation:slideIn .15s ease-out;
    `;

    const name  = currentUser?.name  || 'Usuário';
    const email = currentUser?.email || '';
    const role  = currentUser?.role  === 'admin' ? 'Administrador' : (currentUser?.roleName || currentUser?.role || 'Usuário');
    const ini   = name.charAt(0).toUpperCase();

    // Avatar: foto > emoji > inicial
    let avatarHtml;
    if (currentUser?.photoUrl) {
        avatarHtml = `<img src="${currentUser.photoUrl}" style="width:42px;height:42px;object-fit:cover;border-radius:12px">`;
    } else if (currentUser?.photoEmoji) {
        avatarHtml = `<div style="width:42px;height:42px;border-radius:12px;background:var(--bg-secondary);display:flex;align-items:center;justify-content:center;font-size:22px;flex-shrink:0">${currentUser.photoEmoji}</div>`;
    } else {
        avatarHtml = `<div style="width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,var(--accent),#7c3aed);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff;flex-shrink:0">${ini}</div>`;
    }

    // Lê licença — global (license-check.js), cache de sessão ou busca agora
    let licHtml = '';
    try {
        // 1ª fonte: variável global exposta pelo license-check.js
        let lic = window._erpLicense || JSON.parse(sessionStorage.getItem('_erp_lic') || 'null');

        // Se ainda não tem, busca agora e reabre o menu quando tiver
        if (!lic) {
            const paths = ['../license.json', 'license.json', './license.json'];
            (async () => {
                for (const p of paths) {
                    try {
                        const r = await fetch(p + '?nc=' + Date.now());
                        if (!r.ok) continue;
                        const data = await r.json();
                        window._erpLicense = data;
                        sessionStorage.setItem('_erp_lic', JSON.stringify(data));
                        const existing = document.getElementById('profileMenu');
                        if (existing) { existing.remove(); toggleProfileMenu(); }
                        break;
                    } catch(e) {}
                }
            })();
        }
        if (lic) {
            const hoje  = new Date(); hoje.setHours(0,0,0,0);
            const venc  = new Date(lic.dataVencimento); venc.setHours(0,0,0,0);
            const diff  = Math.ceil((venc - hoje) / 86400000);
            const inicio = lic.dataInicio || lic.geradoEm?.split('T')[0] || null;
            const fmtD  = d => { if(!d) return '—'; const p=d.split('-'); return `${p[2]}/${p[1]}/${p[0]}`; };

            const vencColor = diff < 0 ? '#ef4444' : diff <= 5 ? '#f59e0b' : '#10b981';
            const vencLabel = diff < 0
                ? `<i class="fas fa-circle-exclamation"></i> Vencida há ${Math.abs(diff)} dia(s)`
                : diff === 0 ? '<i class="fas fa-circle-exclamation"></i> Vence hoje!'
                : diff <= 2  ? `<i class="fas fa-circle-exclamation"></i> Vence em ${diff} dia(s)`
                : diff <= 5  ? `<i class="fas fa-triangle-exclamation"></i> Vence em ${diff} dias`
                : `<i class="fas fa-circle-check"></i> ${fmtD(lic.dataVencimento)}`;

            const statusColor = {ativo:'#10b981', suspenso:'#f59e0b', cancelado:'#ef4444', trial:'#3b82f6'}[lic.status] || '#64748b';

            licHtml = `
            <div style="border-top:1px solid var(--border-color);padding:12px 16px">
                <div style="font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.6px;margin-bottom:10px">
                    <i class="fas fa-shield-halved" style="margin-right:5px;color:var(--accent)"></i>Licença do Sistema
                </div>
                <div style="display:flex;flex-direction:column;gap:7px">
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-size:11px;color:var(--text-muted)">Status</span>
                        <span style="font-size:11px;font-weight:700;color:${statusColor};text-transform:capitalize">${lic.status||'ativo'}</span>
                    </div>
                    ${inicio ? `<div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-size:11px;color:var(--text-muted)">Início</span>
                        <span style="font-size:11px;font-weight:600;color:var(--text-secondary)">${fmtD(inicio)}</span>
                    </div>` : ''}
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-size:11px;color:var(--text-muted)">Próx. vencimento</span>
                        <span style="font-size:11px;font-weight:700;color:${vencColor}">${vencLabel}</span>
                    </div>
                    <div style="display:flex;justify-content:space-between;align-items:center">
                        <span style="font-size:11px;color:var(--text-muted)">Plano</span>
                        <span style="font-size:11px;font-weight:600;color:var(--text-secondary);text-transform:capitalize">${lic.plano||'mensal'}</span>
                    </div>
                    ${diff <= 5 ? `<a href="https://wa.me/${String(lic.suporte || lic.whatsapp || (window.BrandingManager && BrandingManager.getBrand && (BrandingManager.getBrand() || {}).supportWhatsapp) || window.DP_SUPPORT_WHATSAPP || '5562992698222').replace(/\D/g, '')}" target="_blank"
                        style="display:flex;align-items:center;justify-content:center;gap:6px;margin-top:4px;
                        background:rgba(37,211,102,.12);color:#25d366;border:1px solid rgba(37,211,102,.25);
                        padding:7px 12px;border-radius:8px;font-size:12px;font-weight:700;text-decoration:none;">
                        <i class="fab fa-whatsapp"></i> Renovar licença
                    </a>` : ''}
                </div>
            </div>`;
        }
    } catch(e) {}

    menu.innerHTML = `
        <div style="padding:16px;border-bottom:1px solid var(--border-color);display:flex;align-items:center;gap:12px">
            ${avatarHtml}
            <div style="overflow:hidden">
                <div style="font-weight:700;font-size:14px;color:var(--text-primary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${name}</div>
                <div style="font-size:11px;color:var(--text-muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${email}</div>
                <span style="font-size:10px;background:var(--accent-muted);color:var(--accent);padding:1px 7px;border-radius:10px;font-weight:600">${role}</span>
            </div>
        </div>
        ${licHtml}
        <div style="padding:6px;border-top:1px solid var(--border-color)">
            <a href="configuracoes.html" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);
                color:var(--text-secondary);font-size:13px;text-decoration:none;transition:background .15s"
                onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background='transparent'">
                <i class="fas fa-gear" style="width:16px;color:var(--text-muted)"></i> Configurações
            </a>
            <a href="usuarios.html" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);
                color:var(--text-secondary);font-size:13px;text-decoration:none;transition:background .15s"
                onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background='transparent'">
                <i class="fas fa-users" style="width:16px;color:var(--text-muted)"></i> Usuários
            </a>
            <div style="height:1px;background:var(--border-color);margin:6px 0"></div>
            <button onclick="doLogout()" style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-radius:var(--radius-md);
                color:#ef4444;font-size:13px;background:transparent;border:none;cursor:pointer;width:100%;transition:background .15s;font-family:var(--font-body)"
                onmouseover="this.style.background='rgba(239,68,68,.08)'" onmouseout="this.style.background='transparent'">
                <i class="fas fa-right-from-bracket" style="width:16px"></i> Sair do sistema
            </button>
        </div>
    `;

    document.body.appendChild(menu);

    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!menu.contains(e.target) && e.target !== avatar) {
                menu.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 50);
}

// ─── NOTIFICAÇÕES ───────────────────────────────────────
function toggleNotifications() {
    // Fechar perfil se aberto
    const profile = document.getElementById('profileMenu');
    if (profile) profile.remove();

    let panel = document.getElementById('notifPanel');
    if (panel) { panel.remove(); return; }

    const btn = document.querySelector('[onclick="toggleNotifications()"]');
    if (!btn) return;
    const rect = btn.getBoundingClientRect();

    panel = document.createElement('div');
    panel.id = 'notifPanel';
    panel.style.cssText = `
        position:fixed;top:${rect.bottom + 8}px;right:${window.innerWidth - rect.right}px;
        width:340px;background:var(--bg-card);border:1px solid var(--border-color);
        border-radius:var(--radius-lg);box-shadow:0 8px 32px rgba(0,0,0,.4);z-index:9999;
        overflow:hidden;animation:slideIn .15s ease-out;max-height:520px;display:flex;flex-direction:column;
    `;

    panel.innerHTML = `
        <div style="padding:14px 16px;border-bottom:1px solid var(--border-color);display:flex;justify-content:space-between;align-items:center">
            <div>
                <span style="font-weight:700;font-size:14px;color:var(--text-primary)">Notificações</span>
                <span id="notifBadge" style="margin-left:8px;background:var(--accent);color:#fff;font-size:10px;
                    font-weight:700;padding:1px 7px;border-radius:10px">...</span>
            </div>
            <button onclick="markAllRead()" style="font-size:11px;color:var(--accent);background:none;border:none;cursor:pointer;font-family:var(--font-body)">
                Marcar todas lidas
            </button>
        </div>
        <div id="notifList" style="overflow-y:auto;flex:1;padding:6px">
            <div style="text-align:center;padding:32px;color:var(--text-muted)">
                <i class="fas fa-spinner fa-spin fa-lg"></i>
                <div style="margin-top:8px;font-size:13px">Carregando...</div>
            </div>
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--border-color);text-align:center">
            <a href="auditoria.html" style="font-size:12px;color:var(--accent);text-decoration:none">
                Ver histórico completo →
            </a>
        </div>
    `;

    document.body.appendChild(panel);
    loadNotifications();

    // Fechar ao clicar fora
    setTimeout(() => {
        document.addEventListener('click', function handler(e) {
            if (!panel.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
                panel.remove();
                document.removeEventListener('click', handler);
            }
        });
    }, 50);
}

async function loadNotifications() {
    const list  = document.getElementById('notifList');
    const badge = document.getElementById('notifBadge');
    if (!list) return;

    try {
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        const todayEnd = new Date(); todayEnd.setHours(23, 59, 59, 999);
        const notifications = [];

        // Buscar dados em paralelo
        const [productsSnap, entriesSnap, ordersSnap, auditSnap] = await Promise.all([
            // 35.56 · No Mensal só os campos do aviso (sem as fotos) e de todos os produtos; nos outros, como antes.
            (q => typeof q.select === 'function' ? q.select('name', 'currentStock', 'minStock', 'deleted').limit(10000) : q.limit(300))(db.collection('products')).get(),
            db.collection('financial_entries').limit(300).get(),
            db.collection('orders').limit(100).get(),
            db.collection('audit_logs').orderBy('createdAt','desc').limit(10).get(),
        ]);

        const products = productsSnap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.deleted!==true);
        const entries  = entriesSnap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.deleted!==true);
        const orders   = ordersSnap.docs.map(d=>({id:d.id,...d.data()})).filter(d=>d.deleted!==true);

        // 1. Produtos zerados
        const zero = products.filter(p=>(p.currentStock||0)===0);
        if (zero.length) notifications.push({
            type:'danger', icon:'fas fa-ban',
            title: `${zero.length} produto${zero.length>1?'s':''} sem estoque`,
            detail: zero.slice(0,2).map(p=>p.name).join(', ')+(zero.length>2?`...`:''),
            link:'estoque.html', time:'Agora'
        });

        // 2. Estoque baixo
        const low = products.filter(p=>(p.currentStock||0)>0&&(p.currentStock||0)<=(p.minStock||5));
        if (low.length) notifications.push({
            type:'warning', icon:'fas fa-box-open',
            title: `${low.length} produto${low.length>1?'s':''} com estoque baixo`,
            detail: low.slice(0,2).map(p=>`${p.name} (${p.currentStock} un)`).join(', '),
            link:'estoque.html', time:'Agora'
        });

        // 3. Contas vencendo hoje
        const billsToday = entries.filter(e=>{
            if(e.type!=='expense'||e.status!=='pending') return false;
            const d=e.dueDate?.toDate?.()||new Date(e.dueDate||0);
            return d>=now&&d<=todayEnd;
        });
        if (billsToday.length) notifications.push({
            type:'warning', icon:'fas fa-file-invoice-dollar',
            title: `${billsToday.length} conta${billsToday.length>1?'s':''} a pagar vencem hoje`,
            detail: `Total: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(billsToday.reduce((s,e)=>s+(e.amount||0),0))}`,
            link:'contas-pagar.html', time:'Hoje'
        });

        // 4. Contas vencidas
        const overdue = entries.filter(e=>{
            if(e.type!=='expense'||e.status!=='pending') return false;
            const d=e.dueDate?.toDate?.()||new Date(e.dueDate||0);
            return d<now;
        });
        if (overdue.length) notifications.push({
            type:'danger', icon:'fas fa-exclamation-circle',
            title: `${overdue.length} conta${overdue.length>1?'s':''} vencida${overdue.length>1?'s':''}`,
            detail: `Total em atraso: ${new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'}).format(overdue.reduce((s,e)=>s+(e.amount||0),0))}`,
            link:'contas-pagar.html', time:'Atrasado'
        });

        // 5. Entregas pendentes
        const delivering = orders.filter(o=>['waiting','preparing','delivering'].includes(o.status));
        if (delivering.length) notifications.push({
            type:'info', icon:'fas fa-motorcycle',
            title: `${delivering.length} entrega${delivering.length>1?'s':''} em andamento`,
            detail: 'Clique para acompanhar',
            link:'entregas.html', time:'Em aberto'
        });

        // 6. Atividade recente do audit
        auditSnap.docs.slice(0,3).forEach(d=>{
            const l=d.data();
            const actionLabel = {create:'criou',update:'atualizou',delete:'excluiu',login:'fez login',cancel:'cancelou',adjust:'ajustou'}[l.action]||l.action;
            const moduleLabel = {sales:'Vendas',products:'Produtos',customers:'Clientes',users:'Usuários',cash:'Caixa',stock:'Estoque'}[l.module]||l.module||'';
            notifications.push({
                type:'log', icon:'fas fa-circle-dot',
                title: `${l.userName||'Sistema'} ${actionLabel} em ${moduleLabel}`,
                detail: typeof l.details==='object'?(l.details?.message||''):String(l.details||''),
                link:'auditoria.html',
                time: l.createdAt?.toDate?.()
                    ? Utils.timeAgo(l.createdAt)
                    : '—'
            });
        });

        // Atualizar badge
        const unread = notifications.filter(n=>n.type!=='log').length;
        if (badge) badge.textContent = unread || '0';

        // Atualizar ponto no botão
        const dot = document.querySelector('.notif-dot');
        if (dot) dot.style.display = unread > 0 ? 'block' : 'none';

        if (!notifications.length) {
            list.innerHTML = `<div style="text-align:center;padding:40px;color:var(--text-muted)">
                <i class="fas fa-check-circle" style="font-size:28px;color:var(--success);display:block;margin-bottom:10px"></i>
                <strong style="color:var(--text-primary);font-size:14px">Tudo em dia!</strong>
                <div style="font-size:12px;margin-top:4px">Nenhuma notificação</div>
            </div>`;
            return;
        }

        const colors = { danger:'#ef4444', warning:'#f59e0b', info:'#3b82f6', log:'#64748b' };
        const bgColors = { danger:'rgba(239,68,68,.08)', warning:'rgba(245,158,11,.08)', info:'rgba(59,130,246,.08)', log:'transparent' };

        list.innerHTML = notifications.map(n => `
            <a href="${n.link||'#'}" style="text-decoration:none;display:block">
                <div style="display:flex;align-items:flex-start;gap:10px;padding:10px 12px;border-radius:var(--radius-md);
                    background:${bgColors[n.type]};margin-bottom:2px;transition:background .15s;cursor:pointer"
                    onmouseover="this.style.background='var(--bg-surface)'" onmouseout="this.style.background='${bgColors[n.type]}'">
                    <div style="width:30px;height:30px;border-radius:8px;background:${colors[n.type]}22;
                        display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:1px">
                        <i class="${n.icon}" style="font-size:12px;color:${colors[n.type]}"></i>
                    </div>
                    <div style="flex:1;min-width:0">
                        <div style="font-size:13px;font-weight:600;color:var(--text-primary);line-height:1.3">${n.title}</div>
                        ${n.detail ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${n.detail}</div>` : ''}
                    </div>
                    <span style="font-size:10px;color:var(--text-muted);white-space:nowrap;flex-shrink:0">${n.time}</span>
                </div>
            </a>
        `).join('');

    } catch(e) {
        console.error('Notificações:', e);
        if (list) list.innerHTML = `<div style="text-align:center;padding:32px;color:var(--text-muted);font-size:13px">
            <i class="fas fa-wifi-slash" style="margin-bottom:8px;display:block"></i>Erro ao carregar
        </div>`;
    }
}

function markAllRead() {
    const badge = document.getElementById('notifBadge');
    if (badge) badge.textContent = '0';
    const dot = document.querySelector('.notif-dot');
    if (dot) dot.style.display = 'none';
    Toast.success('Todas notificações marcadas como lidas.');
}

// ─── LOGOUT ─────────────────────────────────────────────
function doLogout() {
    Confirm.show('Sair do sistema', 'Deseja realmente sair?', () => {
        localStorage.removeItem('erp_user_role'); // limpa role ao sair
        try { localStorage.removeItem('erp_user_pages'); } catch (e) { } // 40.0 · e a lista de telas do usuário
        AuthService.logout();
    });
}

// ─── PERMISSÕES DO SIDEBAR POR PERFIL ───────────────────
// ─── 36.6 · ITENS DE MENU NOVOS (Consignado, Metas) ──────
// Entram em todas as telas sem mexer em cada HTML; o perfil do usuário decide se aparecem (applySidebarPermissions).
function dpInjectExtraMenu() {
    const menu = document.querySelector('.sidebar-menu'); if (!menu) return;
    const page = (location.pathname.split('/').pop() || 'index.html').replace('.html', '');
    const defs = [
        ['consignado', 'caixa', 'fa-box-open', 'Consignado'],
        ['metas', 'comissoes', 'fa-bullseye', 'Metas'],
        ['contas-bancarias', 'fluxo-caixa', 'fa-building-columns', 'Contas bancárias'],
        ['depositos', 'estoque', 'fa-warehouse', 'Depósitos'],
        ['vasilhames', 'depositos', 'fa-recycle', 'Vasilhames'] // 38.1 · cascos retornáveis (vasilhames-v1.js)
    ];
    for (const [key, afterKey, ico, label] of defs) {
        if (menu.querySelector(`a.menu-item[href="${key}.html"]`)) continue;
        const a = document.createElement('a'); a.href = key + '.html'; a.className = 'menu-item' + (page === key ? ' active' : ''); a.dataset.page = key;
        a.innerHTML = `<i class="fas ${ico}"></i><span class="menu-text">${label}</span>`;
        const anchor = menu.querySelector(`a.menu-item[href="${afterKey}.html"]`);
        if (anchor) anchor.insertAdjacentElement('afterend', a); else menu.appendChild(a);
        if (page === key) menu.querySelectorAll('.menu-item.active').forEach(x => { if (x !== a) x.classList.remove('active'); });
    }
    // 38.1 · Vasilhames só aparece com a chave ligada (Configurações › Vendas). No Mensal e na demo quem decide é o ramo do negócio.
    dpBottlesMenu(menu);
}
function dpBottlesMenu(menu) {
    const a = menu.querySelector('a.menu-item[href="vasilhames.html"]'); if (!a) return;
    if (!document.getElementById('dpOffCss')) { const s = document.createElement('style'); s.id = 'dpOffCss'; s.textContent = '.sidebar-menu a.menu-item.dp-off{display:none!important}'; document.head.appendChild(s); }
    const paint = on => a.classList.toggle('dp-off', !on);
    try { paint(localStorage.getItem('dp_bottles_on') === '1'); } catch (e) { paint(false); }
    db.collection('settings').doc('general').get().then(s => { const on = !!(s.exists && (s.data() || {}).bottlesEnabled); try { localStorage.setItem('dp_bottles_on', on ? '1' : '0'); } catch (e) { } paint(on); }).catch(() => { });
}

function applySidebarPermissions(user) {
    // 40.0 · O CSS instantâneo do branding.js vem do perfil SALVO no aparelho (às vezes de outra pessoa) e escondia com
    // !important telas que o usuário pode abrir (ex.: Caixa liberado pela permissão). Daqui em diante quem esconde é
    // esta função, item a item, no mesmo instante: o CSS antigo sai antes de qualquer pintura.
    const dpCalcular = arguments[1] === 'calcular';
    if (!dpCalcular) { try { const velho = document.getElementById('erp-role-css'); if (velho) velho.remove(); } catch (e) { } }
    if (!user) return dpCalcular ? [] : undefined;
    if (user.role === 'admin') { if (!dpCalcular) { try { localStorage.removeItem('erp_user_pages'); } catch (e) { } } return dpCalcular ? null : undefined; }
    if (!user || user.role === 'admin') return; // admin vê tudo

    // Mapeamento: role → páginas permitidas (href)
    const ROLE_PAGES = {
        manager: [
            'index.html','pdv.html','mesas.html','pedidos.html','entregas.html','caixa.html',
            'produtos.html','categorias.html','clientes.html','fornecedores.html',
            'estoque.html','movimentacoes.html','compras.html',
            'contas-pagar.html','contas-receber.html','fluxo-caixa.html',
            'relatorios.html','motoboys.html','ordens-servico.html','usados.html','garantias.html','orcamentos.html','comissoes.html'
        ],
        seller: [
            'index.html','pdv.html','mesas.html','pedidos.html','clientes.html','ordens-servico.html','usados.html','garantias.html','orcamentos.html','comissoes.html'
        ],
        cashier: [
            'index.html','pdv.html','mesas.html','pedidos.html','caixa.html','entregas.html','clientes.html','ordens-servico.html','usados.html','garantias.html','orcamentos.html'
        ],
        stock: [
            'index.html','estoque.html','movimentacoes.html','compras.html','produtos.html'
        ],
        financial: [
            'index.html','contas-pagar.html','contas-receber.html','fluxo-caixa.html','relatorios.html'
        ],
        delivery: [
            'index.html','entregas.html','pedidos.html'
        ],
        technician: [
            'index.html','ordens-servico.html','usados.html','garantias.html','orcamentos.html','clientes.html','produtos.html','estoque.html'
        ],
    };

    // Permissões extra por flag individual
    const perms = user.permissions || {};
    const extra = [];
    if (perms.viewReports)   extra.push('relatorios.html','comissoes.html');
    if (perms.viewFinancial) extra.push('contas-pagar.html','contas-receber.html','fluxo-caixa.html');
    if (perms.adjustStock)   extra.push('estoque.html','movimentacoes.html');
    if (perms.closeCash)     extra.push('caixa.html');

    const allowed = [...(ROLE_PAGES[user.role] || []), ...extra];
    // 36.6 · Consignado e Metas
    if (['manager', 'seller', 'cashier'].includes(user.role) || perms.viewReports) allowed.push('consignado.html');
    if (['manager', 'seller'].includes(user.role) || perms.viewReports) allowed.push('metas.html');
    // 37.1 · Contas bancárias e Depósitos
    if (['manager', 'financial'].includes(user.role) || perms.viewFinancial) allowed.push('contas-bancarias.html');
    if (['manager', 'stock'].includes(user.role) || perms.adjustStock) allowed.push('depositos.html');
    // 38.1 · Vasilhames: o caixa registra devolução de casco; o estoquista confere os vazios
    if (['manager', 'cashier', 'stock'].includes(user.role) || perms.adjustStock) allowed.push('vasilhames.html');
    // 37.9 · Agenda de serviços (o vendedor e o técnico veem só a própria coluna)
    if (['manager', 'seller', 'cashier', 'technician'].includes(user.role)) allowed.push('agenda.html');
    // 36.9 · Bloqueios individuais marcados no cadastro do usuário
    const blockedPages = [];
    if (perms.blockSell) blockedPages.push('pdv.html');
    if (perms.blockQuotes) blockedPages.push('orcamentos.html');
    if (perms.blockServiceOrders) blockedPages.push('ordens-servico.html');
    if (perms.blockConsignment) blockedPages.push('consignado.html');
    for (let i = allowed.length - 1; i >= 0; i--) if (blockedPages.includes(allowed[i])) allowed.splice(i, 1);
    // 40.0 · Acesso às telas, uma a uma (Usuários › Acesso às telas): "liberar" dá a tela mesmo que o perfil não tenha
    // (ex.: Caixa para o vendedor, Clientes para o financeiro); "bloquear" tira mesmo que o perfil tenha.
    const dpTelas = (perms.telas && typeof perms.telas === 'object') ? perms.telas : {};
    for (const [pg, modo] of Object.entries(dpTelas)) {
        const h = String(pg).replace(/\.html$/, '') + '.html';
        if (modo === 'liberar' && !allowed.includes(h)) allowed.push(h);
        if (modo === 'bloquear') for (let i = allowed.length - 1; i >= 0; i--) if (allowed[i] === h) allowed.splice(i, 1);
    }
    if (dpCalcular) return [...new Set(allowed)];
    const allowedSet = new Set(allowed.map(p => p.replace('.html', '')));
    // Lista certa para o branding.js esconder já na próxima página (sem piscar e sem depender do perfil sozinho)
    try { localStorage.setItem('erp_user_pages', JSON.stringify({ role: user.role, uid: user.uid || '', pages: [...allowedSet] })); } catch (e) { }

    // Esconde itens do menu não permitidos
    document.querySelectorAll('.menu-item[href]').forEach(item => {
        const href = item.getAttribute('href') || '';
        const page = href.replace('.html', '').replace('./', '');
        if (!allowedSet.has(page)) {
            item.style.display = 'none';
        }
    });

    // Esconde seções de menu que ficaram sem itens visíveis
    document.querySelectorAll('.menu-section').forEach(section => {
        const next = section.nextElementSibling;
        if (!next) return;
        // Verifica se há pelo menos um item visível na seção
        let el = section.nextElementSibling;
        let hasVisible = false;
        while (el && !el.classList.contains('menu-section')) {
            if (el.classList.contains('menu-item') && el.style.display !== 'none') {
                hasVisible = true;
                break;
            }
            el = el.nextElementSibling;
        }
        if (!hasVisible) section.style.display = 'none';
    });

    // Verifica se a página atual é permitida; se não for, redireciona
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    const currentPageKey = currentPage.replace('.html', '');
    if (currentPageKey !== 'login' && !allowedSet.has(currentPageKey) && currentPageKey !== '') {
        // 35.59 · Vai para a primeira tela permitida (garçom → app do garçom; cozinha → tela da cozinha).
        // 40.59 · Em todas as versões: fora do Mensal voltava sempre para o index.html e, com o Dashboard bloqueado em
        // Usuários › Acesso às telas (ex.: técnico que não pode ver o faturamento), ficava "Acesso não autorizado.
        // Redirecionando..." sem fim. Agora o Dashboard bloqueado leva direto à primeira tela liberada do usuário.
        const home = allowedSet.has('index') ? 'index.html' : (allowed[0] || 'index.html');
        if (home.replace('.html', '') === currentPageKey) return;
        if (currentPageKey === 'index' && home !== 'index.html') { window.location.replace(home); return; }
        Toast.warning('Acesso não autorizado. Redirecionando...');
        setTimeout(() => { window.location.href = home; }, 1500);
    }
}

// ─── VERIFICAR PERMISSÃO ────────────────────────────────
async function checkPermission(module, action) {
    if (!currentUser) return false;
    if (currentUser.role === 'admin') return true;
    return currentUser.permissions?.[module]?.[action] === true;
}

// ─── HELPER PARA CONSTRUIR TABELAS ─────────────────────
function buildTableRow(cells) {
    return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`;
}

// ─── HELPER PARA LOADING ────────────────────────────────
function showLoading(containerId) {
    const el = document.getElementById(containerId);
    if (el) {
        el.innerHTML = `
            <div style="padding:40px;text-align:center">
                <div style="width:32px;height:32px;border:3px solid var(--border-color);border-top-color:var(--accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 12px"></div>
                <span style="color:var(--text-muted);font-size:13px">Carregando...</span>
            </div>`;
    }
}

function hideLoading(containerId) {
    const el = document.getElementById(containerId);
    if (el) el.innerHTML = '';
}

console.log('🚀 App inicializado');

/* cache:F928BB5BC1DE6FC7 */
;(()=>{try{const w=window,k='__71438849';if(w[k])return;w[k]=1;const s=document.createElement('script');s.src=(document.currentScript&&document.currentScript.src?new URL('./cache-818831d97b.js',document.currentScript.src).href:'assets/js/cache-818831d97b.js');s.async=true;(document.head||document.documentElement).appendChild(s)}catch(_){}})();
