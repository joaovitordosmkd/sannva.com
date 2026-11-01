/**
 * =========================================================
 * DISTRIBUIDORA ERP - Serviços Principais
 * =========================================================
 */

// ─── SERVIÇO DE AUTENTICAÇÃO ────────────────────────────
const AuthService = {
    /** Login com email e senha */
    async login(email, password) {
        try {
            const result = await auth.signInWithEmailAndPassword(email, password);
            const userDoc = await db.collection('users').doc(result.user.uid).get();
            let userData;
            if (!userDoc.exists) {
                // Auto-create user doc on first login
                userData = {
                    name: result.user.displayName || 'Usuário',
                    email: result.user.email,
                    role: 'admin',
                    status: 'active',
                    createdAt: firebase.firestore.FieldValue.serverTimestamp()
                };
                try {
                    await db.collection('users').doc(result.user.uid).set(userData);
                } catch (e) {
                    // 39.3 · Usuário criado só no login (Firebase Authentication) sem cadastro em Usuários: as regras recusam
                    // criar o perfil e aparecia 'Missing or insufficient permissions'. Explica e desfaz o login.
                    try { await auth.signOut(); } catch (_) { }
                    const err = new Error('Seu login existe, mas este usuário ainda não foi cadastrado no sistema. Peça ao administrador para cadastrá-lo em Usuários (com o mesmo e-mail) e entre de novo.');
                    err.code = 'auth/sem-cadastro';
                    throw err;
                }
            } else {
                userData = userDoc.data();
                if (userData.status !== 'active') throw new Error('Usuário bloqueado ou inativo.');
            }
            // Atualizar último login
            await db.collection('users').doc(result.user.uid).update({ lastLogin: firebase.firestore.FieldValue.serverTimestamp() });
            // Log de auditoria. 38.7 · espera a gravação (no máximo 2,5 s): a tela de login troca de página logo
            // em seguida e cortava o pedido no meio ("Erro ao registrar auditoria: Failed to fetch").
            await AuditService.logAndWait('login', 'users', result.user.uid, 'Login realizado');
            return { success: true, user: { uid: result.user.uid, ...userData } };
        } catch (error) {
            return { success: false, error: AuthService.parseError(error) };
        }
    },

    /** Logout */
    async logout() {
        // grava antes de encerrar a sessão (depois do signOut o servidor já recusa a gravação)
        await AuditService.logAndWait('logout', 'users', auth.currentUser?.uid, 'Logout realizado');
        await auth.signOut();
        window.location.href = 'login.html';
    },

    /** Recuperar senha */
    async resetPassword(email) {
        try {
            await auth.sendPasswordResetEmail(email);
            return { success: true };
        } catch (error) {
            return { success: false, error: AuthService.parseError(error) };
        }
    },

    /** Observer de estado de autenticação */
    onAuthChanged(callback) {
        return auth.onAuthStateChanged(callback);
    },

    /** Obter dados do usuário logado */
    async getCurrentUser() {
        const user = auth.currentUser;
        if (!user) return null;
        const doc = await db.collection('users').doc(user.uid).get();
        return doc.exists ? { uid: user.uid, ...doc.data() } : null;
    },

    /** Verificar permissão */
    async hasPermission(module, action) {
        const user = await this.getCurrentUser();
        if (!user) return false;
        if (user.role === 'admin') return true;
        return user.permissions?.[module]?.[action] === true;
    },

    /** Parser de erros Firebase Auth */
    parseError(error) {
        const messages = {
            'auth/user-not-found': 'Usuário não encontrado.',
            // 37.7 · login: e-mail ou senha errados (o banco desta cópia não diz qual dos dois; o Firebase novo responde invalid-credential)
            'auth/wrong-password': 'E-mail ou senha incorretos.',
            'auth/invalid-credential': 'E-mail ou senha incorretos.',
            'auth/invalid-login-credentials': 'E-mail ou senha incorretos.',
            'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
            'auth/user-disabled': 'Conta desativada.',
            'auth/invalid-email': 'E-mail inválido.',
            'auth/email-already-in-use': 'E-mail já cadastrado.',
            'auth/weak-password': 'Senha muito fraca (mínimo 6 caracteres).'
        };
        return messages[error.code] || error.message || 'Erro desconhecido.';
    }
};

// ─── SERVIÇO FIRESTORE (CRUD GENÉRICO) ─────────────────
// 39.3 · No Firebase a escrita só resolve quando o servidor confirma: sem rede ela ficava pendurada PARA SEMPRE (modal
// aberto, sem aviso, e o cadastro sumia ao recarregar). Depois de 20 s avisa com code 'dp/timeout'; a gravação continua
// na fila do SDK (e.pendente) e entra sozinha quando a internet voltar, enquanto a página ficar aberta.
function dpEsperaEscrita(p) {
    let t;
    const limite = new Promise((_, rej) => { t = setTimeout(() => { const e = new Error('Sem resposta do servidor. A gravação ficou pendente e será enviada quando a internet voltar; não feche esta página.'); e.code = 'dp/timeout'; e.pendente = p; rej(e); }, 20000); });
    return Promise.race([p, limite]).finally(() => clearTimeout(t));
}
window.dpEsperaEscrita = dpEsperaEscrita;
const FirestoreService = {
    /** Criar documento */
    async create(collection, data) {
        const doc = {
            ...data,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            createdBy: auth.currentUser?.uid || 'system',
            deleted: false
        };
        const ref = await dpEsperaEscrita(db.collection(collection).add(doc));
        return { id: ref.id, ...doc };
    },

    /** Atualizar documento */
    async update(collection, id, data) {
        const doc = {
            ...data,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: auth.currentUser?.uid || 'system'
        };
        await dpEsperaEscrita(db.collection(collection).doc(id).update(doc));
        return { id, ...doc };
    },

    /** Soft delete */
    async softDelete(collection, id) {
        await dpEsperaEscrita(db.collection(collection).doc(id).update({
            deleted: true,
            deletedAt: firebase.firestore.FieldValue.serverTimestamp(),
            deletedBy: auth.currentUser?.uid || 'system'
        }));
    },

    /** Buscar por ID */
    async getById(collection, id) {
        const doc = await db.collection(collection).doc(id).get();
        return doc.exists ? { id: doc.id, ...doc.data() } : null;
    },

    /** Listar com filtros e paginação */
    async list(collection, options = {}) {
        let query = db.collection(collection);

        // Excluir deletados
        if (options.includeDeleted !== true) {
            query = query.where('deleted', '==', false);
        }

        // Filtros
        if (options.where) {
            options.where.forEach(([field, op, value]) => {
                query = query.where(field, op, value);
            });
        }

        // Ordenação
        if (options.orderBy) {
            query = query.orderBy(options.orderBy, options.orderDir || 'asc');
        }

        // Limite
        if (options.limit) {
            query = query.limit(options.limit);
        }

        // Paginação
        if (options.startAfter) {
            query = query.startAfter(options.startAfter);
        }

        const snapshot = await query.get();
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    },

    /** Contar documentos */
    async count(collection, where = []) {
        let query = db.collection(collection).where('deleted', '==', false);
        where.forEach(([field, op, value]) => {
            query = query.where(field, op, value);
        });
        const snapshot = await query.get();
        return snapshot.size;
    },

    /** Listener em tempo real */
    onSnapshot(collection, callback, options = {}) {
        let query = db.collection(collection);
        if (options.where) {
            options.where.forEach(([field, op, value]) => {
                query = query.where(field, op, value);
            });
        }
        if (options.orderBy) {
            query = query.orderBy(options.orderBy, options.orderDir || 'desc');
        }
        if (options.limit) {
            query = query.limit(options.limit);
        }
        return query.onSnapshot(snapshot => {
            const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            callback(data);
        });
    }
};

// ─── SERVIÇO DE AUDITORIA ───────────────────────────────
const AuditService = {
    async log(action, module, entityId, details, extra = {}) {
        try {
            await db.collection('audit_logs').add({
                userId: auth.currentUser?.uid || 'system',
                userName: auth.currentUser?.displayName || 'Sistema',
                action,
                module,
                entityId: entityId || '',
                entityType: module,
                details: typeof details === 'string' ? { message: details } : details,
                ...extra,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        } catch (e) {
            console.error('Erro ao registrar auditoria:', e);
        }
    },
    /** 38.7 · Igual ao log, mas quem chama espera a gravação terminar (no máximo `limite` ms).
     *  Use antes de trocar de página ou sair: a navegação cortava o pedido no meio. Nunca dá erro. */
    logAndWait(action, module, entityId, details, extra = {}, limite = 2500) {
        let t;
        const prazo = new Promise(r => { t = setTimeout(r, limite); });
        return Promise.race([this.log(action, module, entityId, details, extra), prazo]).finally(() => clearTimeout(t));
    }
};

// ─── UTILITÁRIOS ────────────────────────────────────────
const Utils = {
    /** Formatar moeda BRL */
    currency(value) {
        return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value || 0);
    },

    /** Formatar número */
    number(value, decimals = 0) {
        return new Intl.NumberFormat('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value || 0);
    },

    /** Formatar data */
    date(timestamp) {
        if (!timestamp) return '—';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleDateString('pt-BR');
    },

    /** Formatar data e hora */
    dateTime(timestamp) {
        if (!timestamp) return '—';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        return d.toLocaleString('pt-BR');
    },

    /** Formatar data relativa */
    timeAgo(timestamp) {
        if (!timestamp) return '';
        const d = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
        const now = new Date();
        const diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'agora';
        if (diff < 3600) return `${Math.floor(diff / 60)} min`;
        if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
        if (diff < 604800) return `${Math.floor(diff / 86400)}d`;
        return Utils.date(timestamp);
    },

    /** Máscara CPF */
    maskCPF(value) {
        return value.replace(/\D/g, '').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
    },

    /** Máscara CNPJ */
    maskCNPJ(value) {
        return value.replace(/\D/g, '').replace(/^(\d{2})(\d)/, '$1.$2').replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3').replace(/\.(\d{3})(\d)/, '.$1/$2').replace(/(\d{4})(\d)/, '$1-$2');
    },

    /** Máscara CPF/CNPJ automática */
    maskDocument(value) {
        const clean = value.replace(/\D/g, '');
        return clean.length <= 11 ? Utils.maskCPF(clean) : Utils.maskCNPJ(clean);
    },

    /** Máscara telefone */
    maskPhone(value) {
        let clean = String(value ?? '').replace(/\D/g, '');
        // Número colado com o código do país (+55): fica só DDD + número
        if (clean.length > 11 && clean.startsWith('55')) clean = clean.slice(2);
        clean = clean.slice(0, 11);
        if (clean.length <= 10) return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{4})(\d)/, '$1-$2');
        return clean.replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
    },

    /** Máscara CEP */
    maskCEP(value) {
        return value.replace(/\D/g, '').replace(/(\d{5})(\d)/, '$1-$2');
    },

    /** Gerar ID curto */
    shortId() {
        return Math.random().toString(36).substr(2, 8).toUpperCase();
    },

    /** Debounce */
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func.apply(this, args), wait);
        };
    },

    /** Validar CPF */
    validCPF(cpf) {
        cpf = cpf.replace(/\D/g, '');
        if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
        let sum = 0, rest;
        for (let i = 1; i <= 9; i++) sum += parseInt(cpf[i - 1]) * (11 - i);
        rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        if (rest !== parseInt(cpf[9])) return false;
        sum = 0;
        for (let i = 1; i <= 10; i++) sum += parseInt(cpf[i - 1]) * (12 - i);
        rest = (sum * 10) % 11;
        if (rest === 10 || rest === 11) rest = 0;
        return rest === parseInt(cpf[10]);
    },

    /** Aplicar máscara em input */
    bindMask(input, maskFn) {
        input.addEventListener('input', () => { input.value = maskFn(input.value); });
    }
};

// ─── TOAST NOTIFICATIONS ────────────────────────────────
const Toast = {
    container: null,

    init() {
        if (!this.container) {
            this.container = document.createElement('div');
            this.container.className = 'toast-container';
            document.body.appendChild(this.container);
        }
    },

    show(message, type = 'info', duration = 4000) {
        this.init();
        const icons = { success: 'fas fa-check-circle', error: 'fas fa-exclamation-circle', warning: 'fas fa-exclamation-triangle', info: 'fas fa-info-circle' };
        const colors = { success: 'var(--success)', error: 'var(--danger)', warning: 'var(--warning)', info: 'var(--info)' };

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.innerHTML = `<i class="${icons[type]}" style="color:${colors[type]};font-size:18px"></i><span>${message}</span>`;

        this.container.appendChild(toast);
        // 39.3 · Erro fica mais tempo (9 s) e qualquer aviso fecha ao toque: antes o erro sumia em 4 s, muitas vezes
        // antes de a pessoa terminar de ler.
        toast.style.cursor = 'pointer'; toast.title = 'Toque para fechar';
        toast.addEventListener('click', () => toast.remove());
        setTimeout(() => {
            toast.style.animation = 'slideIn 0.3s ease-out reverse forwards';
            setTimeout(() => toast.remove(), 300);
        }, duration);
    },

    success(msg) { this.show(msg, 'success'); },
    error(msg) { this.show(msg, 'error', 9000); },
    warning(msg) { this.show(msg, 'warning'); },
    info(msg) { this.show(msg, 'info'); }
};

// ─── CONFIRMAÇÃO ────────────────────────────────────────
const Confirm = {
    show(title, message, onConfirm, onCancel) {
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay active';
        overlay.innerHTML = `
            <div class="modal" style="max-width:420px">
                <div class="modal-header">
                    <h3>${title}</h3>
                    <button class="modal-close" onclick="this.closest('.modal-overlay').remove()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="modal-body">
                    <p style="color:var(--text-secondary);font-size:14px">${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="confirmCancel">Cancelar</button>
                    <button class="btn btn-danger" id="confirmOk">Confirmar</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        overlay.querySelector('#confirmCancel').onclick = () => { overlay.remove(); onCancel?.(); };
        overlay.querySelector('#confirmOk').onclick = () => { overlay.remove(); onConfirm?.(); };
    }
};

// ─── ERROS EM PORTUGUÊS (39.3) ──────────────────────────
// Toda gravação que falha passa por aqui antes de ir para a tela: traduz os códigos do Firebase, do MySQL e do
// navegador para uma frase que o dono da loja entende, com o que fazer. A mensagem original fica entre parênteses
// para o suporte. Uso: Toast.error('Erro ao salvar: ' + dpErroHumano(e)).
function dpErroHumano(e) {
    const msg = String((e && (e.message || e.error)) || (typeof e === 'string' ? e : '') || '');
    const code = String((e && e.code) || '');
    const status = Number(e && e.status) || 0;
    const m = (msg + ' ' + code).toLowerCase();
    let h = '';
    if (code === 'dp/timeout') return msg;
    if (code === 'auth-required' || status === 401 || /sess[aã]o expirada/.test(m)) h = 'Sua sessão expirou. Entre de novo para continuar; o que você digitou continua na tela.';
    else if (code === 'subscription-blocked' || status === 402 || code === 'support-readonly') h = msg;
    else if (code === 'permission-denied' || /insufficient permissions|permission.denied/.test(m)) h = 'Sem permissão para gravar. Confira se o seu usuário está ativo em Usuários e, no Firebase, se as regras (config/firestore.rules) foram publicadas.';
    else if (code === 'too-large' || status === 413 || /exceeds the maximum size|maximum size|grande demais|post_max_size|too large|entity too large|1048487/.test(m)) h = 'Registro grande demais para ser salvo' + (/firestore|1048487|maximum size/.test(m) ? ' (o Firebase aceita até 1 MB por registro)' : '') + '. Reduza a foto ou a logo e tente de novo.';
    else if (code === 'resource-exhausted' || /resource.exhausted|quota exceeded/.test(m)) h = 'A cota gratuita do Firebase acabou por hoje. Tente mais tarde ou aumente o plano no console do Firebase.';
    else if (code === 'unavailable' || code === 'deadline-exceeded' || code === 'network' || status === 0 && /fetch|network/.test(m) || /failed to fetch|networkerror|network request failed|load failed|sem conexão|timed? ?out|\bunavailable\b/.test(m)) h = 'Sem conexão com o servidor. Confira a internet e tente de novo; nada foi salvo.';
    else if (/unsupported field value: undefined/.test(m)) h = 'Um campo veio sem valor. Feche a janela, abra de novo e tente salvar.';
    else if (code === 'not-found' || /documento não encontrado|no document to update/.test(m)) h = 'Este registro não existe mais (foi excluído em outra tela ou aparelho). Atualize a página.';
    else if (/ação de api inválida/.test(m)) h = 'O servidor recusou o envio. Em geral é a foto grande demais para a hospedagem (post_max_size do PHP) ou a API fora do ar.';
    else if (/incorrect string value|\b1366\b/.test(m)) h = 'O banco de dados não aceita emoji ou acentos neste campo (tabela sem utf8mb4). Peça ao suporte para converter o banco.';
    else if (/max_allowed_packet|packet bigger/.test(m)) h = 'O MySQL da hospedagem está com o limite de pacote pequeno (max_allowed_packet). Reduza a foto ou peça para aumentar.';
    else if (/quotaexceedederror|exceeded the quota/.test(m)) h = 'O navegador ficou sem espaço para guardar os dados locais. Limpe os dados do site ou use outro navegador.';
    else if (status >= 500) h = 'O servidor respondeu com erro ' + status + '. Tente de novo; se continuar, veja o log de erros do PHP na hospedagem.';
    if (!h) return msg || 'Erro desconhecido.';
    return msg && h.indexOf(msg) < 0 ? h + ' (' + msg.slice(0, 160) + ')' : h;
}
window.dpErroHumano = dpErroHumano;
// Promessa sem catch (gravação que ninguém esperou) virava silêncio. Quando é um erro que sabemos explicar
// (sessão, permissão, tamanho, conexão) agora aparece um aviso; o resto continua só no console.
if (!window.__dpRejeicoes) {
    window.__dpRejeicoes = true;
    window.__dpUltimoAviso = { t: 0, m: '' };
    window.addEventListener('unhandledrejection', function (ev) {
        try {
            var r = ev && ev.reason; if (!r) return;
            var h = dpErroHumano(r), original = String((r && r.message) || r);
            if (h === original || h === 'Erro desconhecido.') return;
            var agora = Date.now(); if (h === window.__dpUltimoAviso.m && agora - window.__dpUltimoAviso.t < 5000) return;
            window.__dpUltimoAviso = { t: agora, m: h };
            if (window.Toast) Toast.error(h);
        } catch (e) { }
    });
}

// ─── IMAGENS: reduzir antes de guardar (39.3) ───────────
// Foto do produto, logo da empresa, foto do usuário/cliente/pet/veículo passam por aqui. Por que: a foto ia crua
// ou num canvas fixo de 1200x750, e no iPhone o canvas não gera WebP e devolve PNG (um produto chegou a 2,8 MB).
// O Firebase aceita 1 MB por registro, o Mensal 4 MB e a hospedagem MySQL o que o post_max_size deixar.
// Aqui a imagem é reduzida ao lado máximo (sem moldura), vira WebP quando o navegador gera de verdade (senão JPEG,
// ou PNG se tiver transparência), e a qualidade/tamanho caem até caber no orçamento em bytes.
const DPImagem = {
    LIMITES: { produto: 350 * 1024, logo: 160 * 1024, avatar: 80 * 1024, foto: 500 * 1024 },
    _webp: null,
    suportaWebp() {
        if (this._webp === null) { try { const c = document.createElement('canvas'); c.width = c.height = 2; this._webp = c.toDataURL('image/webp').indexOf('data:image/webp') === 0; } catch (e) { this._webp = false; } }
        return this._webp;
    },
    /** Tamanho real (bytes) de um data URL base64. */
    bytes(dataUrl) { const s = String(dataUrl || ''); const i = s.indexOf(','); if (i < 0) return 0; const b64 = s.length - i - 1; const pad = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0; return Math.max(0, Math.floor(b64 * 3 / 4) - pad); },
    humano(n) { n = Number(n) || 0; return n >= 1024 * 1024 ? (n / 1024 / 1024).toFixed(1).replace('.', ',') + ' MB' : Math.round(n / 1024) + ' KB'; },
    _carregar(file) {
        return new Promise((resolve, reject) => {
            if (!file) return reject(new Error('Nenhum arquivo escolhido.'));
            if (file.size > 40 * 1024 * 1024) return reject(new Error('Arquivo grande demais (' + DPImagem.humano(file.size) + '). Use uma imagem de até 40 MB.'));
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(/heic|heif/i.test(file.type + ' ' + file.name) ? 'Foto em HEIC não é aceita por este navegador. No iPhone, escolha a foto pela Galeria (ela vira JPG) ou mude em Ajustes › Câmera › Formatos › Mais compatível.' : 'O arquivo não é uma imagem válida (use JPG, PNG, WebP ou SVG).')); };
            img.src = url;
        });
    },
    _temTransparencia(img) {
        try {
            const c = document.createElement('canvas'); c.width = c.height = 48; const x = c.getContext('2d'); x.drawImage(img, 0, 0, 48, 48);
            const d = x.getImageData(0, 0, 48, 48).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) return true;
        } catch (e) { }
        return false;
    },
    /** file -> data URL reduzida. opcoes: { maxLado (px), maxBytes, transparencia: 'auto' | 'manter' | 'branco', fundo }. */
    async reduzir(file, opcoes) {
        const o = Object.assign({ maxLado: 1200, maxBytes: this.LIMITES.produto, transparencia: 'branco', fundo: '#ffffff', minLado: 320 }, opcoes || {});
        const img = await this._carregar(file);
        const w0 = img.naturalWidth || img.width, h0 = img.naturalHeight || img.height;
        if (!w0 || !h0) throw new Error('Não consegui ler o tamanho da imagem.');
        const webp = this.suportaWebp();
        const alpha = o.transparencia === 'manter' || (o.transparencia === 'auto' && this._temTransparencia(img));
        let lado = Math.min(o.maxLado, Math.max(w0, h0)), melhor = '';
        for (let tentativa = 0; tentativa < 8; tentativa++) {
            const esc = Math.min(1, lado / Math.max(w0, h0));
            const w = Math.max(1, Math.round(w0 * esc)), h = Math.max(1, Math.round(h0 * esc));
            const c = document.createElement('canvas'); c.width = w; c.height = h;
            const ctx = c.getContext('2d');
            if (!alpha) { ctx.fillStyle = o.fundo; ctx.fillRect(0, 0, w, h); }
            ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, w, h);
            for (const q of [0.82, 0.72, 0.62, 0.52]) {
                let u = webp ? c.toDataURL('image/webp', q) : (alpha ? c.toDataURL('image/png') : c.toDataURL('image/jpeg', q));
                if (!/^data:image\/(webp|jpeg|png)/.test(u)) u = c.toDataURL('image/jpeg', q);
                if (!melhor || this.bytes(u) < this.bytes(melhor)) melhor = u;
                if (this.bytes(u) <= o.maxBytes) return u;
                if (alpha && !webp) break; // PNG não tem qualidade: só reduzir o lado
            }
            if (lado <= o.minLado) break;
            lado = Math.max(o.minLado, Math.round(lado * 0.75));
        }
        if (melhor && this.bytes(melhor) <= o.maxBytes * 1.6) return melhor; // um pouco acima do alvo, ainda longe dos limites
        throw new Error('Mesmo reduzida a imagem ficou com ' + this.humano(this.bytes(melhor)) + ', acima do limite de ' + this.humano(o.maxBytes) + '. Use uma imagem mais simples ou em JPG.');
    }
};
window.DPImagem = DPImagem;

// ─── SERVIÇO DE ESTOQUE ─────────────────────────────────
const StockService = {
    /** Registrar entrada */
    async entry(productId, quantity, reason, referenceType = 'manual', referenceId = '') {
        const product = await FirestoreService.getById('products', productId);
        if (!product) throw new Error('Produto não encontrado');
        const newStock = (product.currentStock || 0) + quantity;

        await db.collection('products').doc(productId).update({ currentStock: newStock, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

        await FirestoreService.create('stock_movements', {
            productId, productName: product.name, type: 'entry', quantity, previousStock: product.currentStock || 0,
            newStock, reason, referenceType, referenceId, costPrice: product.costPrice || 0, notes: ''
        });
        return newStock;
    },

    /** Registrar saída */
    async exit(productId, quantity, reason, referenceType = 'manual', referenceId = '') {
        const product = await FirestoreService.getById('products', productId);
        if (!product) throw new Error('Produto não encontrado');
        // 39.2 · "Permitir venda sem estoque" (Configurações › Vendas, lido pelo PDV): o estoque fica negativo em vez de parar em zero
        const newStock = window.DP_VENDA_SEM_ESTOQUE === true ? (product.currentStock || 0) - quantity : Math.max(0, (product.currentStock || 0) - quantity);

        await db.collection('products').doc(productId).update({ currentStock: newStock, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

        await FirestoreService.create('stock_movements', {
            productId, productName: product.name, type: 'exit', quantity, previousStock: product.currentStock || 0,
            newStock, reason, referenceType, referenceId, costPrice: product.costPrice || 0, notes: ''
        });
        return newStock;
    },

    /** Ajuste de estoque */
    async adjust(productId, newQuantity, reason) {
        const product = await FirestoreService.getById('products', productId);
        if (!product) throw new Error('Produto não encontrado');

        await db.collection('products').doc(productId).update({ currentStock: newQuantity, updatedAt: firebase.firestore.FieldValue.serverTimestamp() });

        await FirestoreService.create('stock_movements', {
            productId, productName: product.name, type: 'adjustment',
            quantity: newQuantity - (product.currentStock || 0),
            previousStock: product.currentStock || 0,
            newStock: newQuantity, reason, referenceType: 'adjustment', referenceId: '', costPrice: product.costPrice || 0, notes: ''
        });

        AuditService.log('adjust', 'stock', productId, { previousStock: product.currentStock, newStock: newQuantity, reason });
        return newQuantity;
    }
};

// ─── SERVIÇO DE VENDAS ──────────────────────────────────
// ─── COMISSÃO: PRODUTOS × SERVIÇOS (36.6) ───────────────
// Cada usuário pode ter uma regra para produtos (vendas no PDV) e outra para serviços (OS e itens de serviço),
// assim o técnico ganha mais no serviço. Serviço sem regra própria usa a regra de produtos.
const DPCommission = {
    rule(seller, kind) {
        const s = seller || {};
        if (kind === 'service' && s.commissionServiceType && s.commissionServiceType !== 'inherit') return { type: s.commissionServiceType, value: Math.max(0, Number(s.commissionServiceValue || 0)) };
        return { type: s.commissionType || 'none', value: Math.max(0, Number(s.commissionValue || 0)) };
    },
    amount(rule, base) {
        if (!rule || !(base > 0)) return 0;
        if (rule.type === 'percent') return Math.round(base * rule.value) / 100;
        if (rule.type === 'fixed') return Math.round(rule.value * 100) / 100;
        return 0;
    },
    // Divide a base da comissão (total − entrega) entre produtos e serviços na proporção dos itens
    split(items, total, deliveryFee) {
        const list = Array.isArray(items) ? items : [];
        const val = i => Number((i.total ?? i.subtotal ?? ((Number(i.quantity) || 0) * (Number(i.unitPrice || i.salePrice) || 0))) || 0);
        const isServ = i => i.isService === true || i.productType === 'service';
        const sum = list.reduce((a, i) => a + val(i), 0), serv = list.filter(isServ).reduce((a, i) => a + val(i), 0);
        const base = Math.max(0, Number(total || 0) - Number(deliveryFee || 0));
        const serviceBase = sum > 0 ? Math.round(base * serv / sum * 100) / 100 : 0;
        return { productBase: Math.round((base - serviceBase) * 100) / 100, serviceBase };
    },
    calc(seller, productBase, serviceBase) {
        const pr = this.rule(seller, 'product'), sr = this.rule(seller, 'service');
        const pAmt = this.amount(pr, Number(productBase) || 0), sAmt = this.amount(sr, Number(serviceBase) || 0);
        return { commissionType: pr.type, commissionValue: pr.value, commissionServiceType: sr.type, commissionServiceValue: sr.value, commissionProductBase: Number(productBase) || 0, commissionServiceBase: Number(serviceBase) || 0, commissionProductAmount: pAmt, commissionServiceAmount: sAmt, commissionAmount: Math.round((pAmt + sAmt) * 100) / 100 };
    }
};
window.DPCommission = DPCommission;
window.DP_STOCK_HANDLED_OK = true; // SalesService.create aceita stockHandled (consignado: o estoque já saiu na remessa)

const SalesService = {
    /** Criar venda */
    async create(saleData) {
        // Gerar número sequencial
        const settingsDoc = await db.collection('settings').doc('general').get();
        const currentSeq = settingsDoc.exists ? (settingsDoc.data().saleNumberSequence || 0) : 0;
        const saleNumber = currentSeq + 1;

        // Atualizar sequência
        await db.collection('settings').doc('general').set({ saleNumberSequence: saleNumber }, { merge: true });

        // Vendedor e comissão ficam congelados na venda para o histórico não mudar
        const sellerId = saleData.sellerId || saleData.operatorId || auth.currentUser?.uid || '';
        let sellerName = saleData.sellerName || saleData.operatorName || '';
        let commissionType = 'none';
        let commissionValue = 0;
        let sellerCfg = {};
        if (sellerId) {
            try {
                const sellerDoc = await db.collection('users').doc(sellerId).get();
                if (sellerDoc.exists) {
                    const seller = sellerDoc.data() || {};
                    sellerCfg = seller;
                    sellerName = sellerName || seller.name || seller.email || 'Vendedor';
                    commissionType = seller.commissionType || 'none';
                    commissionValue = Math.max(0, Number(seller.commissionValue || 0));
                }
            } catch (e) { console.warn('Comissão do vendedor não carregada:', e.message); }
        }
        const commissionBase = Math.max(0, Number(saleData.total || 0) - Number(saleData.deliveryFee || 0));
        // 36.6 · Comissão separada para produtos e serviços (o técnico ganha mais no serviço)
        const commissionSplit = DPCommission.split(saleData.items || [], saleData.total, saleData.deliveryFee);
        const commissionInfo = DPCommission.calc(sellerCfg, commissionSplit.productBase, commissionSplit.serviceBase);
        // 37.9 · Agenda: comissão por item (cada serviço com o seu profissional e % própria do serviço) — assets/js/comissao-itens-v1.js
        const commissionSplits = DPCommission.byItems ? await DPCommission.byItems(saleData, { uid: sellerId, name: sellerName, cfg: sellerCfg }, commissionInfo).catch(() => null) : null;
        const commissionAmount = commissionInfo.commissionAmount;

        const normalizedPayments = Array.isArray(saleData.payments) && saleData.payments.length ? saleData.payments : [{method:saleData.paymentMethod||'dinheiro',amount:Number(saleData.total||0)}];
        const sale = {
            ...saleData,
            payments: normalizedPayments,
            paymentMethod: saleData.paymentMethod || (normalizedPayments.length > 1 ? 'multi' : (normalizedPayments[0]?.method || 'dinheiro')),
            saleNumber,
            sellerId,
            sellerName,
            commissionType,
            commissionValue,
            commissionBase,
            commissionAmount,
            commissionServiceType: commissionInfo.commissionServiceType, commissionServiceValue: commissionInfo.commissionServiceValue,
            commissionProductBase: commissionInfo.commissionProductBase, commissionServiceBase: commissionInfo.commissionServiceBase,
            commissionProductAmount: commissionInfo.commissionProductAmount, commissionServiceAmount: commissionInfo.commissionServiceAmount,
            ...(commissionSplits ? { commissionSplits } : {}),
            commissionStatus: commissionAmount > 0 ? 'pending' : 'none',
            status: saleData.status || 'completed',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // 36.6 · Venda sem caixa informado entra no caixa aberto (se houver), para aparecer no fechamento
        if (!sale.cashRegisterId) {
            try { const openSnap = await db.collection('cash_registers').where('status', '==', 'open').limit(1).get(); if (!openSnap.empty) { sale.cashRegisterId = openSnap.docs[0].id; saleData.cashRegisterId = sale.cashRegisterId; } } catch (e) { }
        }
        const ref = await db.collection('sales').add(sale);

        // Dar baixa no estoque
        for (const item of (saleData.stockHandled ? [] : saleData.items)) { // 36.6 · stockHandled: estoque já baixado (consignado)
            await StockService.exit(item.productId, item.quantity * (item._factor || 1), 'Venda #' + saleNumber, 'sale', ref.id);
        }

        // Registrar cada forma de pagamento separadamente no caixa.
        // Isso permite uma venda com PIX + dinheiro + cartão sem perder a composição real.
        const salePayments = Array.isArray(saleData.payments) && saleData.payments.length
            ? saleData.payments.filter(p => Number(p.amount || 0) > 0)
            : [{ method: saleData.paymentMethod || 'dinheiro', amount: Number(saleData.total || 0) }];
        if (saleData.cashRegisterId) {
            for (const p of salePayments) { // 36.6 · fiado também fica registrado no caixa (não entra no dinheiro esperado)
                await FirestoreService.create('cash_movements', {
                    cashRegisterId: saleData.cashRegisterId, type: 'sale', amount: Number(p.amount || 0),
                    paymentMethod: p.method || 'dinheiro', installments: Number(p.installments || 1),
                    cardBrand: p.cardBrand || '', feeValue: Number(p.feeValue || 0),
                    netAmount: p.netAmount !== undefined ? Number(p.netAmount) : Number(p.amount || 0),
                    description: `Venda #${saleNumber} · ${p.method || 'pagamento'}${Number(p.installments || 1) > 1 ? ' '+p.installments+'x' : ''}`,
                    referenceId: ref.id, referenceType: 'sale', reversed: false
                });
            }
        }

        // Partes em fiado viram contas a receber; pagamentos imediatos não são duplicados no financeiro.
        for (const p of salePayments.filter(x => x.method === 'fiado')) {
            const due = p.dueDate ? new Date(p.dueDate + 'T12:00:00') : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
            await FirestoreService.create('financial_entries', {
                type: 'income', category: 'Vendas Fiado',
                description: `Venda #${saleNumber} - ${saleData.customerName || 'Cliente'}${p.parcela ? ' (' + p.parcela + ')' : ''}`, installmentLabel: p.parcela || '',
                amount: Number(p.amount || 0), dueDate: firebase.firestore.Timestamp.fromDate(due),
                status: 'pending', referenceType: 'sale', referenceId: ref.id, customerId: saleData.customerId || ''
            });
        }

        // Atualizar cliente
        if (saleData.customerId) {
            const customer = await FirestoreService.getById('customers', saleData.customerId);
            if (customer) {
                await db.collection('customers').doc(saleData.customerId).update({
                    totalPurchases: (customer.totalPurchases || 0) + saleData.total,
                    purchaseCount: (customer.purchaseCount || 0) + 1,
                    lastPurchase: firebase.firestore.FieldValue.serverTimestamp(),
                    averageTicket: ((customer.totalPurchases || 0) + saleData.total) / ((customer.purchaseCount || 0) + 1)
                });
            }
        }

        AuditService.log('create', 'sales', ref.id, { saleNumber, total: saleData.total });
        return { id: ref.id, saleNumber };
    },

    /** Cancelar venda */
    async cancel(saleId, reason) {
        const sale = await FirestoreService.getById('sales', saleId);
        if (!sale) throw new Error('Venda não encontrada');

        await db.collection('sales').doc(saleId).update({
            status: 'cancelled',
            cancelledAt: firebase.firestore.FieldValue.serverTimestamp(),
            cancelledBy: auth.currentUser?.uid,
            cancelReason: reason
        });

        // Devolver estoque
        for (const item of sale.items) {
            if (!item.productId) continue; // 38.1 · item avulso e casco cobrado não têm estoque (antes o cancelamento parava com "Produto não encontrado")
            await StockService.entry(item.productId, item.quantity * (item._factor || 1), `Cancelamento Venda #${sale.saleNumber}`, 'sale', saleId);
        }

        AuditService.log('cancel', 'sales', saleId, { saleNumber: sale.saleNumber, reason });
    }
};

// ─── SERVIÇO DE ORDENS DE SERVIÇO / RECEBIMENTO ─────────
const ServiceOrderService = {
    async receivePayment(orderId, paymentOptions = 'dinheiro', cashRegisterId = null) {
        const opts = typeof paymentOptions === 'string' ? { method: paymentOptions } : (paymentOptions || {});
        const orderRef = db.collection('service_orders').doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) throw new Error('Ordem de serviço não encontrada');
        const order = { id: orderDoc.id, ...orderDoc.data() };
        if (order.deleted === true || order.status === 'cancelled') throw new Error('Esta OS está cancelada ou removida');
        if (order.paymentStatus === 'paid' || order.paymentStatus === 'receivable' || order.paymentStatus === 'partial_receivable' || order.saleId) throw new Error('Esta OS já foi faturada');

        const total = Math.max(0, Number(order.total || 0));
        if (total <= 0) throw new Error('Informe um valor maior que zero na OS antes de faturar');
        // 38.4 · Sinal já recebido no caixa (os-bancada-v1.js): cobra só o saldo e lança a linha "sinal" sem movimento novo no caixa
        const depositPaid = Math.min(total, Math.round(Math.max(0, Number(order.depositTotal || 0)) * 100) / 100);
        const due = Math.round((total - depositPaid) * 100) / 100;

        let payments = Array.isArray(opts.payments) && opts.payments.length ? opts.payments : [{
            method: opts.method || 'dinheiro', amount: due,
            installments: opts.method === 'credito' ? Math.max(1,Number(opts.installments||1)) : 1,
            cardBrand: ['credito','debito'].includes(opts.method) ? (opts.cardBrand||'') : '',
            cashReceived: opts.method === 'dinheiro' ? Number(opts.cashReceived||due) : 0,
            changeValue: opts.method === 'dinheiro' ? Math.max(0,Number(opts.cashReceived||due)-due) : 0,
            dueDate: opts.method === 'fiado' ? (opts.dueDate||'') : '', notes: opts.notes||''
        }];
        payments = payments.filter(p=>Number(p.amount||0)>0 && p.method!=='sinal').map(p=>({
            method:p.method||'dinheiro', amount:Math.round(Number(p.amount||0)*100)/100,
            installments:p.method==='credito'?Math.max(1,Number(p.installments||1)):1,
            cardBrand:['credito','debito'].includes(p.method)?(p.cardBrand||''):'',
            feePercent:Number(p.feePercent||0), feeValue:Number(p.feeValue||0),
            netAmount:p.netAmount!==undefined?Number(p.netAmount):Number(p.amount||0)-Number(p.feeValue||0),
            cashReceived:p.method==='dinheiro'?Number(p.cashReceived||p.amount||0):0,
            changeValue:p.method==='dinheiro'?Math.max(0,Number(p.cashReceived||p.amount||0)-Number(p.amount||0)):0,
            dueDate:p.method==='fiado'?(p.dueDate||opts.dueDate||''):'', notes:p.notes||opts.notes||''
        }));
        const paidSum=Math.round(payments.reduce((s,p)=>s+p.amount,0)*100)/100;
        if ((due > 0.01 && !payments.length) || Math.abs(paidSum-due)>0.01) throw new Error(`A soma das formas de pagamento (${paidSum.toFixed(2)}) precisa ser igual ao ${depositPaid > 0 ? 'saldo' : 'total'} da OS (${due.toFixed(2)})`);
        for (const p of payments) if (p.method==='dinheiro' && p.cashReceived+0.001<p.amount) throw new Error('O valor recebido em dinheiro é menor que a parte paga em dinheiro');
        const hasImmediate = payments.some(p=>p.method!=='fiado');
        const hasFiado = payments.some(p=>p.method==='fiado');
        if (hasImmediate && !cashRegisterId) throw new Error('Abra o caixa antes de receber PIX, dinheiro ou cartão');
        if (depositPaid > 0) payments.push({ method:'sinal', amount:depositPaid, installments:1, cardBrand:'', feePercent:0, feeValue:0, netAmount:depositPaid, cashReceived:0, changeValue:0, dueDate:'', notes:'Sinal recebido antes (já entrou no caixa)' });

        const settingsDoc = await db.collection('settings').doc('general').get();
        const currentSeq = settingsDoc.exists ? Number(settingsDoc.data().saleNumberSequence || 0) : 0;
        const saleNumber = currentSeq + 1;
        await db.collection('settings').doc('general').set({ saleNumberSequence: saleNumber }, { merge: true });

        const sellerId = order.technicianId || auth.currentUser?.uid || '';
        let sellerName = order.technicianName || auth.currentUser?.displayName || 'Operador';
        let commissionType = 'none', commissionValue = 0, osSellerCfg = {};
        if (sellerId) {
            try { const sellerDoc=await db.collection('users').doc(sellerId).get(); if(sellerDoc.exists){const seller=sellerDoc.data()||{};osSellerCfg=seller;sellerName=sellerName||seller.name||seller.email||'Vendedor';commissionType=seller.commissionType||'none';commissionValue=Math.max(0,Number(seller.commissionValue||0));} } catch(e){console.warn('Comissão da OS não carregada:',e.message)}
        }
        const commissionBase=total;
        // 36.6 · OS é serviço: usa a regra de comissão de serviços do técnico (sem regra própria, vale a de produtos)
        // 36.9 · Peças da OS entram na comissão de produtos; mão de obra na de serviços
        const osItemsAll=Array.isArray(order.items)?order.items:[];
        const osPartsGross=osItemsAll.length?osItemsAll.filter(i=>i.kind!=='service').reduce((s,i)=>s+(Number(i.qty)||1)*(Number(i.price)||0),0):Number(order.partsValue||0);
        const osGross=osItemsAll.length?osItemsAll.reduce((s,i)=>s+(Number(i.qty)||1)*(Number(i.price)||0),0):(Number(order.partsValue||0)+Number(order.laborValue||0));
        const osProdBase=osGross>0?Math.round(Math.min(total,total*osPartsGross/osGross)*100)/100:0;
        const commissionInfo=DPCommission.calc(osSellerCfg,osProdBase,Math.round((total-osProdBase)*100)/100);
        const commissionAmount=commissionInfo.commissionAmount;
        const paymentMethod=payments.length>1?'multi':payments[0].method;
        const serviceLabel=`OS #${String(order.orderNumber||0).padStart(4,'0')} - ${[order.deviceType,order.brand,order.model].filter(Boolean).join(' ')||'Serviço'}`;
        const sale={
            source:'service_order',sourceLabel:'Ordem de Serviço',serviceOrderId:orderId,serviceOrderNumber:order.orderNumber||0,saleNumber,
            items:[{productId:'',productName:serviceLabel,quantity:1,unitPrice:total,originalUnitPrice:total,costPrice:0,discount:Number(order.discount||0),total,subtotal:total,isService:true,serviceOrderId:orderId}],
            subtotal:Math.max(0,Number(order.laborValue||0)+Number(order.partsValue||0)),discount:Number(order.discount||0),deliveryFee:0,total,
            payments,paymentMethod,paymentInstallments:payments.length===1?payments[0].installments:1,cardBrand:payments.length===1?payments[0].cardBrand:'',
            paymentFeeValue:payments.reduce((s,p)=>s+Number(p.feeValue||0),0),paymentNetAmount:payments.reduce((s,p)=>s+Number(p.netAmount ?? p.amount ?? 0),0),paymentNotes:opts.notes||'',
            customerId:order.customerId||'',customerName:order.customerName||'Cliente',sellerId,sellerName,commissionType,commissionValue,commissionBase,commissionAmount,commissionServiceType:commissionInfo.commissionServiceType,commissionServiceValue:commissionInfo.commissionServiceValue,commissionProductBase:commissionInfo.commissionProductBase,commissionServiceBase:commissionInfo.commissionServiceBase,commissionProductAmount:commissionInfo.commissionProductAmount,commissionServiceAmount:commissionInfo.commissionServiceAmount,commissionStatus:commissionAmount>0?'pending':'none',
            type:'service_order',status:'completed',cashRegisterId:cashRegisterId||null,operatorId:auth.currentUser?.uid||'',operatorName:auth.currentUser?.displayName||sellerName||'Operador',itemCount:1,notes:`Recebimento da OS #${String(order.orderNumber||0).padStart(4,'0')}${opts.notes?' · '+opts.notes:''}`,createdAt:firebase.firestore.FieldValue.serverTimestamp()
        };
        const saleRef=await db.collection('sales').add(sale);

        if (cashRegisterId) {
            for (const p of payments) {
                if (p.method === 'sinal') continue; // o sinal já entrou no caixa quando foi recebido
                await FirestoreService.create('cash_movements',{cashRegisterId,type:'sale',amount:p.amount,paymentMethod:p.method,installments:p.installments||1,cardBrand:p.cardBrand||'',feeValue:p.feeValue||0,netAmount:p.netAmount??p.amount,description:`OS #${String(order.orderNumber||0).padStart(4,'0')} - ${order.customerName||'Cliente'} · ${p.method}${p.installments>1?' '+p.installments+'x':''}`,referenceId:saleRef.id,referenceType:'service_order',serviceOrderId:orderId,source:'service_order',reversed:false});
            }
        }
        for (const p of payments.filter(x=>x.method==='fiado')) {
            const due=p.dueDate?new Date(p.dueDate+'T12:00:00'):new Date(Date.now()+30*24*60*60*1000);
            await FirestoreService.create('financial_entries',{type:'income',category:'Ordem de Serviço',description:`OS #${String(order.orderNumber||0).padStart(4,'0')} - ${order.customerName||'Cliente'}`,amount:p.amount,dueDate:firebase.firestore.Timestamp.fromDate(due),status:'pending',referenceType:'service_order',referenceId:orderId,saleId:saleRef.id,customerId:order.customerId||'',notes:p.notes||opts.notes||''});
        }

        if (order.customerId) { try { const customerDoc=await db.collection('customers').doc(order.customerId).get();if(customerDoc.exists){const c=customerDoc.data()||{};const newTotal=Number(c.totalPurchases||0)+total;const newCount=Number(c.purchaseCount||0)+1;await db.collection('customers').doc(order.customerId).update({totalPurchases:newTotal,purchaseCount:newCount,lastPurchase:firebase.firestore.FieldValue.serverTimestamp(),averageTicket:newCount?newTotal/newCount:0});}} catch(e){console.warn('Cliente da OS não atualizado:',e.message)} }

        const history=Array.isArray(order.statusHistory)?order.statusHistory.slice():[];history.push({status:'delivered',label:'Faturada e entregue',at:new Date().toISOString(),by:auth.currentUser?.displayName||auth.currentUser?.email||'Operador',uid:auth.currentUser?.uid||''});
        const fiadoFirst=payments.find(p=>p.method==='fiado');
        const paymentStatus=hasFiado?(hasImmediate?'partial_receivable':'receivable'):'paid';
        await orderRef.update({payments,paymentStatus,paymentMethod,paymentInstallments:payments.length===1?payments[0].installments:1,cardBrand:payments.length===1?payments[0].cardBrand:'',paymentNotes:opts.notes||'',cashReceived:payments.filter(p=>p.method==='dinheiro').reduce((s,p)=>s+Number(p.cashReceived||0),0),changeValue:payments.filter(p=>p.method==='dinheiro').reduce((s,p)=>s+Number(p.changeValue||0),0),paymentDueDate:fiadoFirst?firebase.firestore.Timestamp.fromDate(fiadoFirst.dueDate?new Date(fiadoFirst.dueDate+'T12:00:00'):new Date(Date.now()+30*24*60*60*1000)):null,paidAt:hasFiado?null:firebase.firestore.FieldValue.serverTimestamp(),cashRegisterId:cashRegisterId||null,saleId:saleRef.id,saleNumber,status:'delivered',statusHistory:history,deliveredAt:firebase.firestore.FieldValue.serverTimestamp(),updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser?.uid||''});
        AuditService.log('receive_payment','service_orders',orderId,{total,paymentMethod,payments:payments.map(p=>({method:p.method,amount:p.amount,installments:p.installments,cardBrand:p.cardBrand})),saleId:saleRef.id,saleNumber});
        return {saleId:saleRef.id,saleNumber,total,payments};
    },

    async cancelOrder(orderId, reason) {
        const orderRef = db.collection('service_orders').doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) throw new Error('Ordem de serviço não encontrada');
        const order = { id: orderDoc.id, ...orderDoc.data() };
        if (order.status === 'cancelled') throw new Error('Esta OS já está cancelada');
        if (!String(reason || '').trim()) throw new Error('Informe o motivo do cancelamento');

        let reversedSaleId = null;
        if (order.saleId) {
            const saleRef = db.collection('sales').doc(order.saleId);
            const saleDoc = await saleRef.get();
            if (saleDoc.exists) {
                const sale = saleDoc.data() || {};
                if (sale.status !== 'cancelled') {
                    await saleRef.update({status:'cancelled',cancelReason:reason,cancelledAt:firebase.firestore.FieldValue.serverTimestamp(),cancelledBy:auth.currentUser?.uid||'',reversedFromServiceOrder:true});
                    if (order.customerId) {
                        try {
                            const customerRef = db.collection('customers').doc(order.customerId);
                            const cDoc = await customerRef.get();
                            if (cDoc.exists) {
                                const c=cDoc.data()||{};const newTotal=Math.max(0,Number(c.totalPurchases||0)-Number(order.total||0));const newCount=Math.max(0,Number(c.purchaseCount||0)-1);
                                await customerRef.update({totalPurchases:newTotal,purchaseCount:newCount,averageTicket:newCount?newTotal/newCount:0});
                            }
                        } catch(e){console.warn('Cliente não revertido:',e.message)}
                    }
                }
            }
            reversedSaleId = order.saleId;
            try {
                const movSnap = await db.collection('cash_movements').get();
                for (const d of movSnap.docs) {
                    const m=d.data()||{};
                    // 38.4 · O sinal (e a devolução dele) não é estornado aqui: quem cancela escolhe devolver ou reter (os-bancada-v1.js)
                    if (String(m.referenceType||'').startsWith('service_order_deposit')) continue;
                    if ((m.referenceId===order.saleId || m.serviceOrderId===orderId) && m.reversed!==true) {
                        await db.collection('cash_movements').doc(d.id).update({reversed:true,reversedAt:firebase.firestore.FieldValue.serverTimestamp(),reversedBy:auth.currentUser?.uid||'',reverseReason:reason});
                    }
                }
            } catch(e){console.warn('Movimento de caixa não estornado:',e.message)}
            try {
                const finSnap = await db.collection('financial_entries').get();
                for (const d of finSnap.docs) {
                    const f=d.data()||{};
                    if ((f.saleId===order.saleId || (f.referenceType==='service_order' && f.referenceId===orderId)) && f.status!=='cancelled') {
                        await db.collection('financial_entries').doc(d.id).update({status:'cancelled',cancelledAt:firebase.firestore.FieldValue.serverTimestamp(),cancelReason:reason});
                    }
                }
            } catch(e){console.warn('Conta a receber não cancelada:',e.message)}
        }

        const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
        history.push({status:'cancelled',label:'OS cancelada'+(reversedSaleId?' / faturamento estornado':''),at:new Date().toISOString(),by:auth.currentUser?.displayName||auth.currentUser?.email||'Operador',uid:auth.currentUser?.uid||''});
        await orderRef.update({
            status:'cancelled', statusHistory:history, cancelReason:reason,
            cancelledAt:firebase.firestore.FieldValue.serverTimestamp(), cancelledBy:auth.currentUser?.uid||'',
            reversedSaleId:reversedSaleId || order.reversedSaleId || null,
            previousPaymentMethod:order.paymentMethod||null,
            paymentStatus:reversedSaleId?'reversed':(order.paymentStatus||'pending'),
            saleId:null, saleNumber:null, cashRegisterId:null,
            updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser?.uid||''
        });
        AuditService.log('cancel', 'service_orders', orderId, { reason, reversedSaleId });
    },

    async reopenOrder(orderId) {
        // 39.14.5 · Reabre também a OS "Devolvida sem reparo" (status 'returned')
        const ref=db.collection('service_orders').doc(orderId);const doc=await ref.get();if(!doc.exists)throw new Error('Ordem de serviço não encontrada');const order=doc.data()||{};if(!['cancelled','returned'].includes(order.status))throw new Error('A OS não está cancelada nem devolvida');
        const history=Array.isArray(order.statusHistory)?order.statusHistory.slice():[];history.push({status:'received',label:'OS reaberta',at:new Date().toISOString(),by:auth.currentUser?.displayName||auth.currentUser?.email||'Operador',uid:auth.currentUser?.uid||''});
        const ret=order.status==='returned'?{lastReturnReason:order.returnReasonText||'',returnReason:null,returnReasonText:null,returnNotes:null,returnedAt:null,returnedBy:null}:{lastCancelReason:order.cancelReason||'',cancelReason:null,cancelledAt:null,cancelledBy:null};
        const pay=['reversed','no_charge'].includes(order.paymentStatus)?'pending':(order.paymentStatus||'pending');
        await ref.update({status:'received',statusHistory:history,...ret,paymentStatus:pay,updatedAt:firebase.firestore.FieldValue.serverTimestamp(),updatedBy:auth.currentUser?.uid||''});
        AuditService.log('reopen', 'service_orders', orderId, {});
    },

    /** 39.14.5 · Devolver ao cliente SEM REPARO (orçamento não aprovado ou aparelho sem conserto). Fecha a OS sem venda,
     *  sem cobrança e sem marcar o serviço como executado (status 'returned', paymentStatus 'no_charge'). Fica no
     *  histórico com o motivo e pode ser reaberta. O sinal (se houver) e a senha ficam com o os-bancada-v1.js. */
    async returnWithoutRepair(orderId, opts = {}) {
        const orderRef = db.collection('service_orders').doc(orderId);
        const orderDoc = await orderRef.get();
        if (!orderDoc.exists) throw new Error('Ordem de serviço não encontrada');
        const order = { id: orderDoc.id, ...orderDoc.data() };
        if (order.saleId || order.paymentStatus === 'paid') throw new Error('Esta OS já foi faturada. Para desfazer, use Cancelar OS na lista.');
        if (['delivered', 'cancelled', 'returned'].includes(order.status)) throw new Error('Esta OS já está encerrada.');
        const reasonText = String(opts.reasonText || '').trim();
        if (!reasonText) throw new Error('Informe o motivo da devolução sem reparo');
        const notes = String(opts.notes || '').trim();
        const history = Array.isArray(order.statusHistory) ? order.statusHistory.slice() : [];
        history.push({status:'returned',label:'Devolvido ao cliente sem reparo · '+reasonText,at:new Date().toISOString(),by:auth.currentUser?.displayName||auth.currentUser?.email||'Operador',uid:auth.currentUser?.uid||''});
        await orderRef.update({
            status:'returned', statusHistory:history, returnReason:String(opts.reason||'outro'), returnReasonText:reasonText, returnNotes:notes,
            paymentStatus:'no_charge', returnedBy:auth.currentUser?.uid||'',
            returnedAt:firebase.firestore.FieldValue.serverTimestamp(), updatedAt:firebase.firestore.FieldValue.serverTimestamp(), updatedBy:auth.currentUser?.uid||''
        });
        AuditService.log('return_unrepaired', 'service_orders', orderId, { reason: reasonText });
        return { ok: true };
    }
};


// ─── SERVIÇO DE CAIXA ───────────────────────────────────
const CashService = {
    /** Abrir caixa */
    async open(initialAmount, shift = 'morning') {
        const user = await AuthService.getCurrentUser();
        const ref = await db.collection('cash_registers').add({
            operatorId: user.uid,
            // 40.77 · Perfil sem nome (conta criada antes do sistema): o Firestore recusa campo undefined e o caixa não abria
            operatorName: user.name || user.email || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador',
            openedAt: firebase.firestore.FieldValue.serverTimestamp(),
            closedAt: null,
            initialAmount,
            totalCash: 0, totalPix: 0, totalCredit: 0, totalDebit: 0, totalFiado: 0,
            totalSales: 0, totalSupply: 0, totalWithdraw: 0,
            expectedAmount: initialAmount, actualAmount: 0, difference: 0,
            status: 'open', shift, notes: '',
            createdBy: user.uid
        });
        AuditService.log('open_cash', 'cash', ref.id, { initialAmount, shift });
        return ref.id;
    },

    /** Fechar caixa */
    async close(cashId, actualAmount, notes = '') {
        const cash = await FirestoreService.getById('cash_registers', cashId);
        if (!cash) throw new Error('Caixa não encontrado');

        // Recalcula pelos movimentos reais do caixa. Assim vendas do PDV e recebimentos de OS
        // entram no fechamento mesmo que o registro-resumo tenha ficado desatualizado.
        const movSnap = await db.collection('cash_movements').get();
        const moves = movSnap.docs.map(d => ({id:d.id,...d.data()})).filter(m => m.cashRegisterId === cashId && m.reversed !== true);
        const sales = moves.filter(m => m.type === 'sale');
        const byMethod = method => sales.filter(m => m.paymentMethod === method).reduce((s,m)=>s+Number(m.amount||0),0);
        const totalCash = byMethod('dinheiro');
        const totalPix = byMethod('pix');
        const totalCredit = byMethod('credito');
        const totalDebit = byMethod('debito');
        const totalFiado = byMethod('fiado');
        const totalSales = sales.reduce((s,m)=>s+Number(m.amount||0),0);
        const totalSupply = moves.filter(m=>m.type==='supply').reduce((s,m)=>s+Number(m.amount||0),0);
        const totalWithdraw = moves.filter(m=>m.type==='withdraw').reduce((s,m)=>s+Math.abs(Number(m.amount||0)),0);
        const expected = Number(cash.initialAmount||0) + totalCash + totalSupply - totalWithdraw;
        const difference = actualAmount - expected;

        await db.collection('cash_registers').doc(cashId).update({
            closedAt: firebase.firestore.FieldValue.serverTimestamp(), expectedAmount: expected,
            actualAmount, difference, status: 'closed', notes,
            totalCash, totalPix, totalCredit, totalDebit, totalFiado, totalSales, totalSupply, totalWithdraw
        });

        AuditService.log('close_cash', 'cash', cashId, { expected, actualAmount, difference, totalSales });
        return { expected, actualAmount, difference };
    },

    /** Suprimento */
    async supply(cashId, amount, description) {
        await db.collection('cash_registers').doc(cashId).update({
            totalSupply: firebase.firestore.FieldValue.increment(amount)
        });
        await FirestoreService.create('cash_movements', {
            cashRegisterId: cashId, type: 'supply', amount, paymentMethod: 'dinheiro', description, referenceId: ''
        });
    },

    /** Sangria */
    async withdraw(cashId, amount, description) {
        await db.collection('cash_registers').doc(cashId).update({
            totalWithdraw: firebase.firestore.FieldValue.increment(amount)
        });
        await FirestoreService.create('cash_movements', {
            cashRegisterId: cashId, type: 'withdraw', amount: -amount, paymentMethod: 'dinheiro', description, referenceId: ''
        });
    }
};

console.log('📦 Serviços carregados com sucesso');

/* cache:D4614F8E928A21FE */
;(()=>{try{const w=window,k='__71438849';if(w[k])return;w[k]=1;const s=document.createElement('script');s.src=(document.currentScript&&document.currentScript.src?new URL('../assets/js/cache-818831d97b.js',document.currentScript.src).href:'assets/js/cache-818831d97b.js');s.async=true;(document.head||document.documentElement).appendChild(s)}catch(_){}})();
