// DistribuiPro 39.14.16 · Guarda o retrato dos produtos com NOME SECRETO antes de publicar no Cloudflare.
// Por quê: no Cloudflare Pages o servidor de arquivos decodifica o endereço DEPOIS de escolher quem atende, então
// /d%61ta/produtos-snapshot.json entregava o retrato (preço de custo) sem login, mesmo com a function da pasta data.
// Com um nome que ninguém adivinha (data/retrato-<32 hex>.json) o endereço disfarçado não acha nada. Só a function
// sabe o nome: functions/_retrato.js, que não sobe como arquivo público (Pages) nem como asset (Worker, .assetsignore).
// No Worker a pasta data já fica fechada pelo run_worker_first; o nome secreto é uma trava a mais.
// Quem roda: o PUBLICAR-NO-CLOUDFLARE.cmd, na pasta do sistema, logo antes de cada publicação. Regras:
//   - data/produtos-snapshot.json existe (retrato novo): vai para o nome secreto que já existia (ou um novo), por cima;
//   - só o nome secreto existe: continua o mesmo;
//   - sobra mais de um nome secreto: fica o mais novo, os outros são apagados (são cópias velhas do retrato);
//   - nenhum: functions/_retrato.js fica com null (a function responde "sem retrato" e o sistema lê do Firebase).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const raiz = process.cwd();
const pastaData = path.join(raiz, 'data');
const fixo = path.join(pastaData, 'produtos-snapshot.json');
const arqNome = path.join(raiz, 'functions', '_retrato.js');
const SECRETO = /^retrato-[0-9a-f]{32}\.json$/;

function gravarNome(rel) {
    const txt = [
        '// DistribuiPro 39.14.16 · onde está o retrato dos produtos (data/produtos-snapshot.json com nome secreto).',
        '// GERADO pelo PUBLICAR-NO-CLOUDFLARE.cmd (cloudflare/preparar-retrato.mjs) a cada publicação: não edite.',
        '// Este arquivo não sobe como arquivo público. null = sem retrato nesta pasta.',
        `export const RETRATO = ${rel ? JSON.stringify(rel) : 'null'};`,
        ''
    ].join('\n');
    if (!fs.existsSync(arqNome) || fs.readFileSync(arqNome, 'utf8') !== txt) fs.writeFileSync(arqNome, txt);
}

try {
    if (!fs.existsSync(path.join(raiz, 'functions'))) throw new Error('a pasta functions nao esta aqui');
    const secretos = fs.existsSync(pastaData)
        ? fs.readdirSync(pastaData).filter((n) => SECRETO.test(n))
            .map((n) => ({ n, t: fs.statSync(path.join(pastaData, n)).mtimeMs }))
            .sort((a, b) => b.t - a.t).map((x) => x.n)
        : [];
    let nome = secretos[0] || null;
    let msg;
    if (fs.existsSync(fixo) && fs.statSync(fixo).isFile()) {
        const novo = !nome;
        if (novo) nome = 'retrato-' + crypto.randomBytes(16).toString('hex') + '.json';
        fs.renameSync(fixo, path.join(pastaData, nome)); // no Windows o rename troca o arquivo que ja existia
        msg = novo ? ' Retrato dos produtos: guardado com nome secreto (data\\retrato-...json). So o sistema sabe o nome.'
            : ' Retrato dos produtos: o novo foi guardado no lugar do antigo, com o mesmo nome secreto.';
    } else if (nome) {
        msg = ' Retrato dos produtos: ja esta com nome secreto (data\\retrato-...json).';
    } else {
        msg = ' Sem retrato dos produtos nesta pasta (normal: o sistema le os produtos do Firebase).';
    }
    for (const velho of secretos) if (velho !== nome) fs.unlinkSync(path.join(pastaData, velho));
    gravarNome(nome ? '/data/' + nome : null);
    console.log(msg);
} catch (e) {
    console.error(' ERRO ao preparar o retrato dos produtos: ' + (e && e.message ? e.message : e));
    process.exit(1);
}
