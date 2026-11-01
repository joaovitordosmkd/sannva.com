// DistribuiPro 39.1 · Cloudflare Pages Function: entrega o retrato da lista de produtos (data/produtos-snapshot.json)
// só para usuário logado e ativo. Faz o mesmo que api/produtos-snapshot.php, para hospedagem sem PHP (Cloudflare Pages).
// Caminho: /api/produtos-snapshot  (o config/produtos-cache.js tenta o .php e depois este).
// Na hospedagem com Apache/PHP este arquivo é só um texto na pasta functions/: não faz nada.
// 39.14.16 · O arquivo tem nome secreto (functions/_retrato.js, gravado pelo PUBLICAR-NO-CLOUDFLARE.cmd): no Pages o
// caminho disfarçado (/d%61ta/...) passa pela trava da pasta data, então só um nome que ninguém sabe protege.
import { exigirLogin, json } from '../_firebase.js';
import { RETRATO } from '../_retrato.js';

export async function onRequestGet({ request, env }) {
    const login = await exigirLogin(request, env);
    if (login.erro) return login.erro;
    if (!RETRATO) return json(404, { ok: false, erro: 'Sem retrato de produtos nesta hospedagem.' });
    const url = new URL(RETRATO, request.url);
    const r = await env.ASSETS.fetch(new Request(url.toString(), { headers: { 'Accept-Encoding': 'identity' } }));
    if (!r.ok) return json(404, { ok: false, erro: 'Sem retrato de produtos nesta hospedagem.' });
    return new Response(r.body, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
}
