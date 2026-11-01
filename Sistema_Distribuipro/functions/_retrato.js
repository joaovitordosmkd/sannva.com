// DistribuiPro 39.14.16 · onde está o retrato dos produtos. O PUBLICAR-NO-CLOUDFLARE.cmd troca este arquivo a cada
// publicação pelo nome secreto (data/retrato-<32 hex>.json; ver cloudflare/preparar-retrato.mjs). Este é o valor do
// pacote, para quem publica a pasta functions sem o .cmd: o nome antigo, que no Cloudflare Pages pode ser lido sem login
// por um endereço disfarçado (/d%61ta/...). Arquivo de apoio: não vira rota (não exporta onRequest).
export const RETRATO = '/data/produtos-snapshot.json';
