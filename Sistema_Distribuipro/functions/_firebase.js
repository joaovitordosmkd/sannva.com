// DistribuiPro 39.1 · Confere o login do Firebase dentro do Cloudflare Pages (mesma regra do api/firebase-token.php):
// token do usuário (Authorization: Bearer) assinado pelo Google, do projeto certo, e cadastro ativo em users/{uid}.
// Arquivo de apoio: não vira rota (começa com "_").

const JWKS = 'https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com';

export function json(status, obj) {
    return new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' } });
}
function b64u(s) { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
const txt = b => new TextDecoder().decode(b);

// projectId: lido do config/firebase-config.js publicado junto (ou da variável PROJECT_ID do Pages, se existir)
async function projectId(request, env) {
    if (env && env.PROJECT_ID) return String(env.PROJECT_ID);
    const r = await env.ASSETS.fetch(new URL('/config/firebase-config.js', request.url).toString());
    if (!r.ok) return '';
    const m = (await r.text()).match(/["']?projectId["']?\s*:\s*["']([A-Za-z0-9._-]+)["']/);
    return m ? m[1] : '';
}

export async function verificar(token, pid) {
    const p = String(token || '').split('.');
    if (p.length !== 3) return { erro: 'token mal formado' };
    let h, b;
    try { h = JSON.parse(txt(b64u(p[0]))); b = JSON.parse(txt(b64u(p[1]))); } catch (e) { return { erro: 'token ilegível' }; }
    const now = Math.floor(Date.now() / 1000);
    if (!h.kid || (h.alg && h.alg !== 'RS256')) return { erro: 'cabeçalho inválido' };
    if (!b.exp || b.exp < now - 60) return { erro: 'token vencido' };
    if (b.aud !== pid) return { erro: 'token de outro projeto' };
    if (b.iss !== 'https://securetoken.google.com/' + pid) return { erro: 'emissor inválido' };
    if (!b.sub || typeof b.sub !== 'string' || b.sub.length > 128) return { erro: 'usuário inválido' };
    const jwks = await fetch(JWKS, { cf: { cacheTtl: 3600, cacheEverything: true } }).then(r => r.json()).catch(() => null);
    const jwk = jwks && jwks.keys && jwks.keys.find(k => k.kid === h.kid);
    if (!jwk) return { erro: 'chave do Google não encontrada' };
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(p[2]), new TextEncoder().encode(p[0] + '.' + p[1]));
    return ok ? { payload: b } : { erro: 'assinatura inválida' };
}

export async function usuarioAtivo(token, pid, uid) {
    const url = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(pid)}/databases/(default)/documents/users/${encodeURIComponent(uid)}`;
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
    if (!r.ok) return false;
    const j = await r.json().catch(() => null);
    const f = j && j.fields; if (!f) return false;
    if (f.deleted && f.deleted.booleanValue === true) return false;
    const s = k => (f[k] && f[k].stringValue) || '';
    return s('status') === 'active' || s('role') === 'admin';
}

/** { uid } ou { erro: Response } */
export async function exigirLogin(request, env) {
    const m = /^Bearer\s+([A-Za-z0-9._-]+)$/.exec(request.headers.get('Authorization') || '');
    if (!m) return { erro: json(401, { ok: false, erro: 'Faça login no sistema.', codigo: 'sem_token' }) };
    const pid = await projectId(request, env);
    if (!pid) return { erro: json(500, { ok: false, erro: 'projectId não encontrado em config/firebase-config.js' }) };
    const v = await verificar(m[1], pid);
    if (!v.payload) return { erro: json(401, { ok: false, erro: 'Login não reconhecido: ' + v.erro, codigo: 'token_invalido' }) };
    if (!(await usuarioAtivo(m[1], pid, v.payload.sub))) return { erro: json(403, { ok: false, erro: 'Usuário sem cadastro ativo no sistema.', codigo: 'usuario_inativo' }) };
    return { uid: v.payload.sub };
}
