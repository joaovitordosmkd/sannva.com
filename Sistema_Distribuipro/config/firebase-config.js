// DistribuiPro · Conexão com o SEU projeto Firebase.
// Cada empresa precisa do próprio projeto: nunca use o Firebase de outra pessoa.
// Jeito fácil: abra configurar-firebase.html no navegador, cole a configuração do seu projeto
// e ela gera este arquivo pronto. Depois substitua este arquivo (pasta config) na hospedagem.
const firebaseConfig = {
    "apiKey": "",
    "authDomain": "",
    "projectId": "",
    "storageBucket": "",
    "messagingSenderId": "",
    "appId": ""
};

if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
    // Sem o Firebase da empresa o sistema não abre (assim nunca grava no banco de outra empresa).
    if (!/configurar-firebase\.html$/i.test(location.pathname)) {
        document.documentElement.style.visibility = 'hidden';
        location.replace('configurar-firebase.html');
    }
    throw new Error('DistribuiPro: o Firebase da empresa ainda não foi configurado. Abra configurar-firebase.html.');
}

firebase.initializeApp(firebaseConfig);
const db      = firebase.firestore();
const auth    = firebase.auth();
const storage = firebase.storage ? firebase.storage() : null;
console.log('🔥 Firebase inicializado: ' + firebaseConfig.projectId);

// 39.1 · Produtos guardados no navegador (só baixa o que mudou: poupa as leituras do Firestore)
// e foto do produto gravada na hospedagem (api/upload-imagem.php). Os dois arquivos ficam em config/.
document.write('<script src="config/produtos-cache.js?v=39.1"><\/script><script src="config/foto-hospedagem.js?v=39.1"><\/script>');

// ── PERSISTÊNCIA: mantém sessão mesmo após fechar o browser ──
auth.setPersistence(firebase.auth.Auth.Persistence.LOCAL).catch(() => {});

// ── CADASTRO DE FUNCIONÁRIO SEM TROCAR A SESSÃO ──────────────
// O createUserWithEmailAndPassword do Firebase entra com o usuário que acabou de criar. Em Usuários, isso
// tirava o administrador da sessão e o app.js, sem achar o cadastro do novo, gravava o perfil dele como admin.
// Com alguém logado, o login novo é criado numa segunda conexão ("cadastro"), que sai logo em seguida.
(function () {
    var criar = auth.createUserWithEmailAndPassword.bind(auth);
    auth.createUserWithEmailAndPassword = async function (email, password) {
        if (!auth.currentUser) return criar(email, password); // primeiro acesso (login.html): entra com ele
        var app2 = firebase.apps.find(function (a) { return a.name === 'cadastro'; }) || firebase.initializeApp(firebaseConfig, 'cadastro');
        var auth2 = app2.auth();
        await auth2.setPersistence(firebase.auth.Auth.Persistence.NONE);
        var res = await auth2.createUserWithEmailAndPassword(email, password);
        try { await auth2.signOut(); } catch (_) { }
        return res;
    };
})();

// ── AUTO-REFRESH DO TOKEN ─────────────────────────────────────
// O token JWT do Firebase expira a cada 1h.
// Se o usuário ficar inativo, o Firestore começa a falhar silenciosamente.
// Este código renova o token automaticamente a cada 50 minutos.
(function startTokenAutoRefresh() {
    var REFRESH_INTERVAL = 50 * 60 * 1000; // 50 minutos
    var refreshTimer = null;

    function scheduleRefresh() {
        if (refreshTimer) clearInterval(refreshTimer);
        refreshTimer = setInterval(function() {
            var user = auth.currentUser;
            if (user) {
                user.getIdToken(true)
                    .then(function() { console.log('🔄 Token Firebase renovado'); })
                    .catch(function(e) { console.warn('Token refresh falhou:', e); });
            }
        }, REFRESH_INTERVAL);
    }

    // Inicia quando o usuário fizer login
    auth.onAuthStateChanged(function(user) {
        if (user) {
            scheduleRefresh();
        } else {
            if (refreshTimer) clearInterval(refreshTimer);
        }
    });

    // Renova imediatamente quando a aba volta ao foco após longo período
    document.addEventListener('visibilitychange', function() {
        if (document.visibilityState === 'visible') {
            var user = auth.currentUser;
            if (user) {
                user.getIdToken(true)
                    .then(function() { console.log('🔄 Token renovado ao retornar à aba'); })
                    .catch(function() {});
                scheduleRefresh(); // reinicia o timer
            }
        }
    });

    // Renova quando voltar a ter conexão (após ficar offline)
    window.addEventListener('online', function() {
        var user = auth.currentUser;
        if (user) {
            user.getIdToken(true).catch(function() {});
        }
    });
})();
