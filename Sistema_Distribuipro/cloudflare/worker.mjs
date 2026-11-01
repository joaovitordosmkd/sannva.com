// DistribuiPro 39.14.16 · Worker do Cloudflare (Worker com arquivos estáticos, endereço *.workers.dev).
// Faz o papel da pasta functions/, que só o Cloudflare Pages roda: entrega o retrato dos produtos só para usuário
// logado e ativo (/api/produtos-snapshot) e fecha a pasta data/ (o retrato tem preço de custo). Usa as mesmas
// funções da pasta functions/ (inclusive o nome secreto do retrato, functions/_retrato.js). Quem publica é o
// PUBLICAR-NO-CLOUDFLARE.cmd, com o wrangler.jsonc desta pasta, que manda o Worker rodar ANTES dos arquivos em /api/*
// e /data/* (run_worker_first). O resto sai direto como arquivo.
import { onRequestGet as retrato } from '../functions/api/produtos-snapshot.js';
import { onRequest as pastaFechada } from '../functions/data/[[caminho]].js';

// Caminho como o servidor de arquivos enxerga: sem %xx, sem barras repetidas, sem "..", em minúsculas.
function normalizar(pathname) {
    let p = pathname;
    try { p = decodeURIComponent(p); } catch (e) { /* fica como veio */ }
    p = p.replace(/\\/g, '/').replace(/\/{2,}/g, '/');
    try { p = new URL(p, 'http://x').pathname; } catch (e) { /* fica como veio */ }
    return p.toLowerCase();
}

export default {
    async fetch(request, env) {
        const caminho = normalizar(new URL(request.url).pathname);
        if (caminho === '/data' || caminho.startsWith('/data/')) return pastaFechada();
        if (caminho === '/api/produtos-snapshot' || caminho === '/api/produtos-snapshot/') {
            if (request.method !== 'GET' && request.method !== 'HEAD') {
                return new Response('Método não permitido.', { status: 405, headers: { Allow: 'GET', 'Cache-Control': 'no-store' } });
            }
            return retrato({ request, env });
        }
        return env.ASSETS.fetch(request);
    }
};
