// DistribuiPro 39.1 · Cloudflare Pages Function: fecha a pasta data/ (o retrato de produtos tem preço de custo).
// Faz o papel do data/.htaccess, que o Cloudflare ignora. O retrato sai só por /api/produtos-snapshot, logado.
// 39.14.16 · No Pages esta trava NÃO pega o caminho disfarçado (/d%61ta/..., /data%2f..., //data/...): por isso o
// retrato ganha nome secreto (cloudflare/preparar-retrato.mjs). No Worker o cloudflare/worker.mjs pega todos.
export function onRequest() {
    return new Response('Pasta fechada.', { status: 403, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
}
