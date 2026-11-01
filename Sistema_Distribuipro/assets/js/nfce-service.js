/* =====================================================================
 * NFCeService — Integração com Focus NFe via proxy PHP
 * --------------------------------------------------------------------
 * Como funciona:
 *   1) Lê config de settings/general (URL do proxy, ambiente, dados fiscais)
 *   2) Monta o JSON da nota no padrão da Focus NFe (os dados da empresa vêm do cadastro dela na Focus)
 *   3) Chama o proxy PHP (api/nfce-proxy.php) que faz a requisição autenticada à Focus;
 *      no Windows Offline quem chama é o próprio programa (desktop/main.js), sem proxy
 *   4) Salva o resultado na venda (sales/<id>.fiscal = { ... })
 *
 * Uso:
 *   const r = await NFCeService.emitir(saleData, saleId);
 *   if (r.ok) { NFCeService.mostrarResultado(r); }
 *   else      { Toast.error(r.error); }
 *
 * O serviço NÃO bloqueia a venda — se a emissão falhar, a venda
 * permanece como "sem nota" e o usuário pode tentar reemitir depois.
 *
 * 39.7 · Revisão da Focus (todas as versões):
 *   - Mesma referência por venda (venda-<id>-<n>): clique duplo, resposta perdida ou reenvio consultam a MESMA nota em vez
 *     de criar outra. Só a nota recusada pela SEFAZ ganha número novo (n + 1).
 *   - A NFC-e da Focus é síncrona: vale a resposta do envio (antes só olhava a consulta e o motivo da recusa da SEFAZ,
 *     mensagem_sefaz, nunca aparecia: "Falha ao emitir NFC-e (verifique os logs do proxy)").
 *   - Itens: serviço e uso de pacote ficam fora (NFC-e é só mercadoria; o serviço vai na nota de serviço);
 *     desconto geral, taxa de entrega e acréscimo do cartão divididos entre os itens (antes o desconto ia só no total e a
 *     SEFAZ recusava a nota que tinha desconto); preço unitário com todas as casas (kg, atacado).
 *   - Pagamento: fiado/crediário = 05 a prazo, cartão com o grupo do cartão (tipo_integracao 2) e a bandeira,
 *     "outros" com a descrição; parte da venda fora da nota = pagamentos proporcionais.
 *   - tipo_documento = 1 (saída; antes ia 65, que é o modelo), sem o forma_pagamento antigo e com local_destino.
 *   - Dados da empresa: vão só o CNPJ (o resto sai do cadastro da empresa na Focus; antes iam campos vazios e nomes que
 *     a Focus não usa). Regime normal com CST 00: base, alíquota (Configurações › Fiscal) e valor do ICMS.
 *   - CPF/CNPJ do consumidor conferido (dígito). Homologação: textos que a SEFAZ exige no 1º item e no destinatário.
 *   - Erros em português (token recusado, empresa sem cadastro na Focus, proxy não encontrado, sem internet...).
 *   - atualizarVenda / cancelarVenda gravam o resultado na venda (antes consultar/cancelar não atualizavam nada).
 *
 * 39.10 · Nota de produto pelo Base by Asaas (versões vitalícias): com "Base by Asaas" escolhido em Configurações › Fiscal,
 *   emitir/emitirNota passam a venda para o DPNotasBase (notas-base-v1.js); atualizarVenda e cancelarVenda também, quando a
 *   nota gravada é do Base (fiscal.provedor = 'base'). As notas que já saíram pela Focus continuam pela Focus.
 * ===================================================================== */

(function(){
    'use strict';

    // ── helpers ─────────────────────────────────────────────
    const onlyDigits = s => String(s||'').replace(/\D/g,'');
    const toNumber   = v => {
        if (typeof v === 'number') return v;
        if (!v) return 0;
        const s = String(v).trim();
        return (s.includes(',') ? parseFloat(s.replace(/\./g,'').replace(',','.')) : parseFloat(s)) || 0;
    };
    /** Centavos de um valor (meio para cima, sem o erro do ponto flutuante). */
    const cent  = v => { const n = toNumber(v); return isFinite(n) ? Math.round(n * 100 + (n >= 0 ? 1e-6 : -1e-6)) : 0; };
    const reais = c => Math.round(c) / 100;
    const txt   = (v, n) => String(v ?? '').replace(/[\u0000-\u001F\u007F]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
    const docLimpo = v => String(v || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
    const HOMOLOG_ITEM = 'NOTA FISCAL EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
    const HOMOLOG_DEST = 'NF-E EMITIDA EM AMBIENTE DE HOMOLOGACAO - SEM VALOR FISCAL';
    const dormir = ms => new Promise(r => setTimeout(r, ms));

    /** CPF (11 números) ou CNPJ (14, o novo CNPJ com letras também) com o dígito certo. */
    function docOk(v) {
        const d = docLimpo(v);
        if (/^\d{11}$/.test(d)) {
            if (/^(\d)\1{10}$/.test(d)) return false;
            for (const n of [9, 10]) {
                let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i);
                const r = (s * 10) % 11 % 10; if (r !== Number(d[n])) return false;
            }
            return true;
        }
        if (/^[0-9A-Z]{12}\d{2}$/.test(d)) {
            if (/^(\d)\1{13}$/.test(d)) return false;
            for (const n of [12, 13]) {
                let s = 0, p = n - 7;
                for (let i = 0; i < n; i++) { s += (d.charCodeAt(i) - 48) * p; p = p === 2 ? 9 : p - 1; }
                if (Number(d[n]) !== (s % 11 < 2 ? 0 : 11 - s % 11)) return false;
            }
            return true;
        }
        return false;
    }

    /** Divide $total centavos entre as posições pelo peso; resto de centavo no maior (sem passar do teto, se houver). */
    function ratear(total, pesos, teto) {
        const out = pesos.map(() => 0);
        const soma = pesos.reduce((s, p) => s + Math.max(0, p), 0);
        if (total <= 0 || soma <= 0) return out;
        let usado = 0;
        pesos.forEach((p, i) => { let v = Math.floor(total * Math.max(0, p) / soma + 1e-7); if (teto) v = Math.min(v, Math.max(0, teto[i])); out[i] = v; usado += v; });
        let resto = total - usado;
        const ordem = pesos.map((p, i) => i).sort((a, b) => (pesos[b] - pesos[a]) || (a - b));
        for (const i of ordem) { if (resto <= 0) break; const cabe = teto ? Math.max(0, teto[i] - out[i]) : resto; const v = Math.min(resto, cabe); out[i] += v; resto -= v; }
        return out;
    }

    /** Data e hora de agora com o fuso do computador (a SEFAZ aceita até 5 minutos de diferença do relógio). */
    function dataEmissao(d) {
        d = d || new Date();
        const p = n => String(Math.abs(n)).padStart(2, '0');
        const off = -d.getTimezoneOffset();
        return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}${off >= 0 ? '+' : '-'}${p(Math.floor(Math.abs(off) / 60))}:${p(Math.abs(off) % 60)}`;
    }

    const agoraServidor = () => firebase.firestore.FieldValue.serverTimestamp();

    // ── configuração ────────────────────────────────────────
    async function lerGeral() {
        const doc = await db.collection('settings').doc('general').get();
        const g = doc.exists ? (doc.data() || {}) : null;
        return g;
    }
    /** Windows Offline: o próprio programa fala com a Focus (preload.js › nota). Nas versões web: null. */
    function ponte() {
        return null;
    }
    function proxyUrl(c) {
        let u = String((c && c.focusProxyUrl) || '').trim();
        // 39.7 · O padrão antigo "/api/nfce-proxy.php" só funcionava com o sistema na raiz do site (em /erp/ dava "não encontrado")
        if (!u || u === '/api/nfce-proxy.php') u = 'api/nfce-proxy.php';
        return u;
    }
    const producao = c => (c && c.ambienteSefaz) === 'producao';
    const tokenFocus = c => String((producao(c) ? c.focusTokenProducao : c.focusTokenHomolog) || '').trim();
    /** 39.10 · Quem emite a nota de produto (NFC-e/NF-e) em Configurações › Fiscal: 'focus', 'base' (Base by Asaas) ou
        'nenhum'. Sem a escolha gravada: como na 39.9 (nota de serviço pelo Asaas sem "Focus também" = nenhum; senão Focus). */
    const produtoProv = c => {
        if (!c) return 'focus';
        if (['focus', 'base', 'nenhum', 'dp'].includes(c.notaProdutoProvedor)) return c.notaProdutoProvedor; // 41.1 · 'dp' = Nota fiscal DistribuiPro
        return c.focusProduto === false && !!c.notaServicoProvedor && c.notaServicoProvedor !== 'focus' ? 'nenhum' : 'focus';
    };
    /** 39.9 · A Focus não emite NFC-e/NF-e nova (consultar e cancelar as que já saíram continua). */
    const focusDesligada = c => !!c && produtoProv(c) !== 'focus';
    const chaveBase = c => String((producao(c) ? c.baseChaveProducao : c.baseChaveSandbox) || '').trim();
    /** Motor do Base by Asaas (notas-base-v1.js, só nas versões vitalícias). */
    const pelaBase = () => (window.DPNotasBase && typeof window.DPNotasBase.emitir === 'function') ? window.DPNotasBase : null;
    const semBase = { ok: false, error: 'A nota de produto está no Base by Asaas, mas o arquivo dele não carregou nesta tela. Recarregue a página (F5).' };
    /** 41.1 · Nota fiscal DistribuiPro (nota-propria-dp-v1.js, só nas versões vitalícias): a API de nota fiscal da DistribuiPro. */
    const peloDP = () => (window.DPNotasDP && typeof window.DPNotasDP.emitir === 'function') ? window.DPNotasDP : null;
    const semDP = { ok: false, error: 'A nota de produto está na Nota fiscal DistribuiPro, mas o arquivo dela não carregou nesta tela. Recarregue a página (F5).' };

    /** Carrega configurações do Firestore */
    async function loadConfig() {
        const c = await lerGeral();
        if (!c) throw new Error('Configurações não encontradas. Vá em Configurações primeiro.');
        if (!c.emitirNFe) throw new Error('A emissão de nota fiscal está desligada em Configurações › Fiscal.');
        if (!ponte() && !proxyUrl(c)) throw new Error('Falta o endereço do proxy da nota (nfce-proxy.php) em Configurações › Fiscal.');
        const token = tokenFocus(c);
        if (!token) throw new Error(`Falta o token de ${producao(c) ? 'produção' : 'homologação'} da Focus NFe em Configurações › Fiscal.`);
        return { ...c, _token: token };
    }

    // ── conversa com a Focus / Asaas ────────────────────────
    /**
     * Uma chamada ao provedor. q = { acao, ref, tipo ('nfce' padrão, 'nfe', 'nfse', 'nfsen'), provedor ('focus' padrão,
     * 'asaas' ou 'base'), id, ... }. Volta { status, ok, data, text, base64, tipo }. Nunca lança erro de rede: status 0 + data.erro.
     */
    async function chamar(cfg, q, options = {}) {
        const provedor = q.provedor === 'asaas' || q.provedor === 'base' ? q.provedor : 'focus';
        const ambiente = producao(cfg) ? 'producao' : 'homologacao';
        const chave = provedor === 'asaas' ? String(cfg._asaasChave || '') : provedor === 'base' ? String(cfg._baseChave || chaveBase(cfg)) : String(cfg._token || tokenFocus(cfg));
        const corpo = options.body ? JSON.stringify(options.body) : '';
        const p = ponte();
        if (p) {
            try {
                const r = await p.nota({ ...q, provedor, ambiente, chave, metodo: options.method || 'GET', corpo });
                let data; try { data = JSON.parse(r.body); } catch (e) { data = { _raw: r.body }; }
                return { status: r.status, ok: r.status >= 200 && r.status < 300, data, text: r.body, base64: r.base64, tipo: r.tipo };
            } catch (e) {
                return { status: 0, ok: false, data: { erro: 'O programa não conseguiu chamar o provedor da nota: ' + (e && e.message || e) } };
            }
        }
        const params = { ambiente };
        Object.keys(q).forEach(k => { if (q[k] !== undefined && q[k] !== null && q[k] !== '' && !(k === 'provedor' && provedor === 'focus') && !(k === 'tipo' && q[k] === 'nfce')) params[k] = String(q[k]); });
        const base = proxyUrl(cfg);
        const url = `${base}${base.includes('?') ? '&' : '?'}${new URLSearchParams(params).toString()}`;
        const headers = { 'Content-Type': 'application/json' };
        // A chave vai para o proxy repassar ao provedor (nunca volta na resposta)
        if (provedor === 'asaas') headers['X-Asaas-Key'] = chave; else if (provedor === 'base') headers['X-Base-Key'] = chave; else headers['X-Focus-Token'] = chave;
        const fetchOpts = { method: options.method || 'GET', headers };
        if (corpo) fetchOpts.body = corpo;
        let resp;
        try { resp = await fetch(url, fetchOpts); }
        catch (e) { return { status: 0, ok: false, data: { erro: 'Sem conexão com o servidor da nota (internet ou proxy fora do ar).' } }; }
        const tipo = resp.headers.get('content-type') || '';
        const text = await resp.text();
        let data; try { data = JSON.parse(text); } catch(e) { data = { _raw: text }; }
        return { status: resp.status, data, ok: resp.ok, text, tipo };
    }
    /** Mantido para quem chamava o nome antigo. */
    const callProxy = (cfg, params, options) => chamar(cfg, params, options);

    /** Motivo em português a partir da resposta da Focus / da SEFAZ / do proxy. */
    function erroTexto(r, ctx) {
        const d = (r && r.data) || {};
        const quem = (ctx && ctx.quem) || 'a Focus NFe';
        if (d.mensagem_sefaz) return `A SEFAZ recusou${d.status_sefaz ? ' (código ' + d.status_sefaz + ')' : ''}: ${d.mensagem_sefaz}`;
        const lista = Array.isArray(d.erros) ? d.erros.map(e => [e.campo ? e.campo + ':' : '', e.mensagem || e.description || '', e.correcao ? '(' + e.correcao + ')' : ''].filter(Boolean).join(' ')).filter(Boolean) : [];
        const st = r ? r.status : 0;
        const cod = String(d.codigo || '');
        if (st === 0) return d.erro || 'Sem conexão com a internet ou o servidor da nota não respondeu.';
        if (st === 401 && d.codigo === 'token_ausente') return 'O token da Focus NFe não chegou ao proxy. Salve o token em Configurações › Fiscal.';
        if (st === 401 && d._raw !== undefined && /access denied|acesso negado/i.test(String(d._raw))) return 'A Focus NFe recusou o token. Confira se copiou o token certo (homologação ou produção, conforme o ambiente escolhido).';
        if (st === 401 && d.codigo === 'token_invalido') return d.mensagem || 'O token da Focus NFe parece errado. Copie de novo em Configurações › Fiscal.';
        if (st === 401) return `A Focus NFe recusou o token${d.mensagem ? ': ' + String(d.mensagem).replace(/\.\s*$/, '') : ''}. Confira se copiou o token certo: o de homologação para testes e o de produção para valer.`;
        if (cod === 'permissao_negada' || st === 403) return 'Este token não tem permissão para o CNPJ da empresa na Focus NFe. Confira se o CNPJ de Configurações › Empresa é o mesmo cadastrado na Focus.';
        if (cod === 'empresa_nao_configurada' || cod === 'ambiente_nao_configurado') return `A empresa ainda não está pronta para emitir na Focus NFe (${d.mensagem || 'cadastro, certificado digital ou CSC'}). Termine o cadastro no painel da Focus.`;
        if (st === 404 && d._raw !== undefined && !d.codigo) return 'O arquivo nfce-proxy.php não foi encontrado no servidor. Confira o endereço do proxy em Configurações › Fiscal.';
        if (st === 429 && /autentica/i.test(String(d.mensagem || ''))) return 'A Focus NFe bloqueou por 1 minuto depois de várias tentativas com token errado. Confira o token em Configurações › Fiscal e tente de novo daqui a 1 minuto.';
        if (st === 429) return 'Muitas notas em pouco tempo: a Focus NFe pediu para esperar. Tente de novo em 1 minuto.';
        if (st >= 500 && !d.mensagem && !lista.length) return `${quem.charAt(0).toUpperCase() + quem.slice(1)} não respondeu agora (${d.erro || 'erro ' + st}). Tente de novo em instantes.`;
        if (lista.length) return (d.mensagem ? d.mensagem + ' ' : '') + lista.join('; ');
        return d.mensagem || d.erro || (d._raw ? `Resposta inesperada do servidor da nota (${st}).` : `Falha ao falar com ${quem} (${st}).`);
    }

    // ── produtos e itens ────────────────────────────────────
    const prodCache = {};
    /** Cadastro dos produtos da venda (o do PDV já carregado ou o banco). op.fresco: lê o banco de novo (na hora de emitir:
        o NCM pode ter sido corrigido em outra aba depois de uma recusa). */
    async function carregarProdutos(items, op) {
        const out = {};
        const ids = [...new Set((items || []).map(it => it && it.productId).filter(Boolean).map(String))];
        let doPdv = [];
        try { if (typeof products !== 'undefined' && Array.isArray(products)) doPdv = products; } catch (e) { }
        await Promise.all(ids.map(async id => {
            const p = doPdv.find(x => x && String(x.id) === id);
            if (p) { out[id] = p; return; }
            if (prodCache[id] && !(op && op.fresco)) { out[id] = prodCache[id]; return; }
            try { const d = await db.collection('products').doc(id).get(); if (d.exists) out[id] = prodCache[id] = { id, ...d.data() }; } catch (e) { }
        }));
        return out;
    }
    /** O item é serviço? Com produto cadastrado vale o cadastro (o "isService" da venda também marca produto sem estoque). */
    function itemServico(it, p) {
        if (it && it.productId && p) return p.productType === 'service' || String(p.unit || '').toLowerCase() === 'serv';
        if (it && it.productId && !p && !it.isService) return false;
        return !!(it && (it.isService || String(it.unit || '').toLowerCase() === 'serv' || it.productType === 'service'));
    }
    const itemPacote = (it, p) => !!(it && (it.packageId || it.packageUse || it.isPackage)) || !!(p && p.isPackage);
    /** A venda tem mercadoria com valor (vai na NFC-e/NF-e)? */
    function temMercadoria(sale, prods) {
        const its = Array.isArray(sale && sale.items) ? sale.items : [];
        if (!its.length) return false;
        return its.some(it => { const p = prods ? prods[String(it.productId || '')] : null; return it && !itemPacote(it, p) && !itemServico(it, p) && cent(it.total ?? (toNumber(it.unitPrice) * toNumber(it.quantity))) > 0; });
    }
    /** Unidade da nota (UN, KG, L, M...): a do produto; embalagem (caixa, fardo) sai como CX */
    const unidadeNota = it => {
        if (Number(it._factor || 1) > 1) return 'CX';
        const u = window.DPCatalog && DPCatalog.unit ? DPCatalog.unit(it.unit || 'un').abbr : String(it.unit || 'UN');
        const s = String(u || 'UN').normalize('NFD').replace(/[̀-ͯ]/g, '').replace('²', '2').replace('³', '3').toUpperCase().replace(/[^A-Z0-9]/g, '');
        return !s || s === 'SERV' ? 'UN' : s.slice(0, 6);
    };

    // ── pagamentos ──────────────────────────────────────────
    const BANDEIRA = { visa: '01', mastercard: '02', master: '02', amex: '03', sorocred: '04', diners: '05', elo: '06', hipercard: '07', aura: '08', cabal: '09' };
    const FORMAS = { dinheiro: '01', cheque: '02', credito: '03', debito: '04', credito_loja: '05', vale: '05', fiado: '05', crediario: '05',
        vale_alimentacao: '10', vale_refeicao: '11', vale_presente: '12', vale_combustivel: '13', boleto: '15', deposito: '16', pix: '17', transferencia: '18' };
    /** Forma de pagamento da nota (tabela da SEFAZ) a partir do jeito que a venda gravou. */
    function formaDaNota(metodo, extras) {
        const m = String(metodo || '').toLowerCase();
        const ex = (extras || []).find(x => x && x.id === metodo);
        let codigo = FORMAS[m], nome = ex ? String(ex.name || '') : '';
        if (!codigo && ex) {
            const k = String(ex.kind || '');
            const n = nome.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
            codigo = k === 'dinheiro' ? '01' : k === 'credito' ? '03' : k === 'debito' ? '04' : k === 'pix' ? (/transf|ted|doc/.test(n) ? '18' : '17')
                : /boleto/.test(n) ? '15' : /cheque/.test(n) ? '02' : /alimenta/.test(n) ? '10' : /refei/.test(n) ? '11' : /presente/.test(n) ? '12' : /combust/.test(n) ? '13'
                : /deposito/.test(n) ? '16' : /transf|ted/.test(n) ? '18' : /credi|fiado|a prazo|carne/.test(n) ? '05' : '99';
        }
        if (!codigo) { codigo = '99'; nome = nome || m.replace(/^pg_/, '').replace(/_/g, ' '); }
        return { codigo, nome: nome || 'Outros', aPrazo: ['fiado', 'crediario'].includes(m) || (codigo === '05' && m !== 'vale' && m !== 'credito_loja') };
    }
    function pagamentosDaNota(sale, totalNota, extras) {
        let pags = Array.isArray(sale.payments) && sale.payments.length ? sale.payments : [{ method: sale.paymentMethod || 'dinheiro', amount: sale.total, cardBrand: sale.cardBrand || '' }];
        pags = pags.filter(p => p && cent(p.amount) > 0 && p.method !== 'sinal');
        if (!pags.length) pags = [{ method: 'dinheiro', amount: reais(totalNota) }];
        const valores = pags.map(p => cent(p.amount));
        const soma = valores.reduce((s, v) => s + v, 0);
        const naNota = soma === totalNota ? valores : ratear(totalNota, valores);
        const out = [];
        pags.forEach((p, i) => {
            if (naNota[i] <= 0) return;
            const f = formaDaNota(p.method, extras);
            const x = { forma_pagamento: f.codigo, valor_pagamento: reais(naNota[i]) };
            if (f.aPrazo) x.indicador_pagamento = 1;
            if (f.codigo === '99') x.descricao_pagamento = txt(f.nome, 60).padEnd(2, '.');
            if (['03', '04', '17'].includes(f.codigo)) {
                x.tipo_integracao = 2; // pagamento não integrado ao sistema (maquininha separada)
                const b = BANDEIRA[String(p.cardBrand || '').toLowerCase()];
                if (b && f.codigo !== '17') x.bandeira_operadora = b;
                else if (f.codigo !== '17' && p.cardBrand) x.bandeira_operadora = '99';
            }
            out.push(x);
        });
        return out;
    }

    // ── montagem da nota (NFC-e e NF-e) ─────────────────────
    /**
     * Venda gravada -> JSON da Focus. op = { tipo: 'nfce'|'nfe', prods, cliente (cadastro, para a NF-e), doc (CPF/CNPJ do
     * consumidor) }. Lança Error com o que falta, em português. Volta { payload, total, foraDaNota, avisos }.
     */
    function montarNota(sale, cfg, op) {
        op = op || {};
        const tipo = op.tipo === 'nfe' ? 'nfe' : 'nfce';
        const nome = tipo === 'nfe' ? 'NF-e' : 'NFC-e';
        const prods = op.prods || {};
        const avisos = [];
        const cnpjEmitente = docLimpo(cfg.cnpj);
        if (cnpjEmitente.length !== 14) throw new Error('CNPJ da empresa inválido. Confira em Configurações › Empresa.');
        const homolog = !producao(cfg);
        const crt = parseInt(cfg.regimeTributario || 1, 10) || 1;
        const simples = crt !== 3;

        // 1) Itens que entram (só mercadoria com valor)
        const itens = Array.isArray(sale.items) ? sale.items : [];
        const linhas = [];
        let somaTodos = 0;
        itens.forEach(it => {
            if (!it) return;
            const q = Math.round(toNumber(it.quantity) * 10000) / 10000;
            let pu = toNumber(it.unitPrice);
            if (!(q > 0) || !isFinite(pu) || pu < 0) return;
            let bruto = cent(q * pu);
            let liq = it.total !== undefined && it.total !== null && it.total !== '' ? Math.max(0, cent(it.total)) : bruto;
            if (liq > bruto + 1) { bruto = liq; pu = liq / 100 / q; }
            if (liq > bruto) liq = bruto;
            somaTodos += liq;
            const p = it.productId ? prods[String(it.productId)] : null;
            if (itemPacote(it, p) || itemServico(it, p) || liq <= 0) return;
            linhas.push({ it, p, q, pu, bruto, liq });
        });
        if (!linhas.length) throw new Error(itens.length
            ? `Esta venda só tem serviço (ou itens sem valor): ela não gera ${nome}. O serviço sai na nota de serviço (NFS-e).`
            : 'A venda não tem itens.');
        const somaMerc = linhas.reduce((s, l) => s + l.liq, 0);

        // 2) NCM (o do produto ou o padrão da loja). Sem nenhum dos dois a nota NÃO sai.
        const ncmPadrao = onlyDigits(cfg.ncmPadrao);
        const nomeItem = l => txt(l.it.productName || (l.p && l.p.name) || 'Produto', 120);
        const semNcm = [], ncmErrado = [];
        linhas.forEach(l => { const n = onlyDigits(l.it.ncm || (l.p && l.p.ncm)) || ncmPadrao; if (!n) semNcm.push(nomeItem(l)); else if (n.length !== 8) ncmErrado.push(nomeItem(l)); });
        if (semNcm.length) throw new Error(semNcm.length === 1
            ? `Produto ${semNcm[0]} sem NCM: preencha em Produtos › Fiscal`
            : `Produtos ${[...new Set(semNcm)].join(', ')} sem NCM: preencha em Produtos › Fiscal`);
        if (ncmErrado.length) throw new Error(`NCM incompleto em ${[...new Set(ncmErrado)].join(', ')}: o NCM tem 8 números. Corrija em Produtos › Fiscal`);

        // 3) Desconto geral, acréscimo do cartão e taxa de entrega: a parte das mercadorias, dividida entre os itens
        let desc = Math.max(0, cent(sale.discount || 0));
        const acres = Math.max(0, cent(sale.cardSurcharge || sale.surcharge || 0));
        const entrega = Math.max(0, cent(sale.deliveryFee || 0));
        if (desc > somaTodos) desc = somaTodos;
        const parte = v => somaTodos > 0 ? Math.round(v * somaMerc / somaTodos) : 0;
        const descMerc = somaMerc === somaTodos ? desc : Math.min(parte(desc), somaMerc);
        const outrasMerc = (somaMerc === somaTodos ? acres : parte(acres)) + entrega;
        const pesos = linhas.map(l => l.liq);
        const rDesc = ratear(descMerc, pesos, pesos);
        const rOutras = ratear(outrasMerc, pesos);

        // 4) Itens no formato da Focus
        const ufEmit = String(cfg.uf || '').toUpperCase();
        const cliente = op.cliente || null;
        const ufDest = String((cliente && (cliente.state || cliente.uf)) || ufEmit).toUpperCase();
        const foraDoEstado = tipo === 'nfe' && ufEmit && ufDest && ufDest !== ufEmit;
        const aliqIcms = toNumber(cfg.aliquotaICMS);
        const cstPisCofins = onlyDigits(cfg.cstPisCofins).slice(0, 2) || '07';
        let totalNota = 0;
        const items = linhas.map((l, i) => {
            const it = l.it, p = l.p || {};
            let cfop = onlyDigits(it.cfop || p.cfop) || onlyDigits(cfg.cfopPadrao) || '5102';
            if (cfop.length !== 4) throw new Error(`CFOP inválido em ${nomeItem(l)} (precisa de 4 números, ex.: 5102). Corrija em Produtos › Fiscal`);
            if (tipo === 'nfce' && cfop[0] === '6') cfop = '5' + cfop.slice(1); // NFC-e é sempre dentro do estado
            if (foraDoEstado && cfop[0] === '5') cfop = '6' + cfop.slice(1);
            const sit = onlyDigits(it.csosn || p.csosn) || onlyDigits(cfg.csosnPadrao) || (simples ? '102' : '00');
            if (simples && sit.length !== 3) throw new Error(`${nomeItem(l)}: no Simples Nacional o ICMS usa o CSOSN (3 números, ex.: 102), não o CST "${sit}". Corrija em Produtos › Fiscal ou em Configurações › Fiscal`);
            if (!simples && sit.length !== 2) throw new Error(`${nomeItem(l)}: no Regime Normal o ICMS usa o CST (2 números, ex.: 00), não o CSOSN "${sit}". Corrija em Produtos › Fiscal ou em Configurações › Fiscal`);
            const un = it.unidade || unidadeNota(it);
            const dItem = rDesc[i], oItem = rOutras[i];
            const valorItem = l.bruto - dItem + oItem;
            totalNota += valorItem;
            const item = {
                numero_item: i + 1,
                codigo_produto: txt(it.productCode || p.code || it.productId || ('PROD' + (i + 1)), 60),
                descricao: homolog && i === 0 ? HOMOLOG_ITEM : nomeItem(l),
                codigo_ncm: onlyDigits(it.ncm || p.ncm) || ncmPadrao,
                cfop,
                unidade_comercial: un,
                quantidade_comercial: l.q,
                valor_unitario_comercial: Math.round(l.pu * 1e10) / 1e10,
                unidade_tributavel: un,
                quantidade_tributavel: l.q,
                valor_unitario_tributavel: Math.round(l.pu * 1e10) / 1e10,
                valor_bruto: reais(l.bruto),
                icms_origem: parseInt(onlyDigits(it.origem ?? p.origem).charAt(0) || onlyDigits(cfg.origemPadrao ?? '0').charAt(0) || '0', 10),
                icms_situacao_tributaria: sit,
                pis_situacao_tributaria: cstPisCofins,
                cofins_situacao_tributaria: cstPisCofins,
            };
            if (dItem > 0) item.valor_desconto = reais(dItem);
            if (oItem > 0) item.valor_outras_despesas = reais(oItem);
            const cest = onlyDigits(it.cest || p.cest);
            if (cest.length === 7) item.cest = cest;
            if (sit === '00') {
                if (!(aliqIcms > 0)) throw new Error('Com o CST 00 o ICMS é calculado na nota: informe a alíquota do ICMS (%) em Configurações › Fiscal.');
                item.icms_modalidade_base_calculo = 3;
                item.icms_base_calculo = reais(valorItem);
                item.icms_aliquota = aliqIcms;
                item.icms_valor = reais(Math.round(valorItem * aliqIcms / 100));
            }
            return item;
        });
        if (items.length > 990) throw new Error(`A ${nome} aceita até 990 itens. Divida a venda.`);
        if (totalNota <= 0) throw new Error(`A parte de mercadorias desta venda ficou sem valor: a ${nome} não sai com total zero.`);

        // 5) Pagamentos (proporcionais ao total da nota quando parte da venda fica fora)
        const formas_pagamento = pagamentosDaNota(sale, totalNota, cfg.formasPagamentoExtras);

        // 6) Consumidor / destinatário
        const doc = docLimpo(op.doc !== undefined ? op.doc : sale.customerCpfCnpj);
        if (doc && !docOk(doc)) throw new Error(`${doc.length === 11 ? 'O CPF' : doc.length === 14 ? 'O CNPJ' : 'O CPF/CNPJ'} informado está com número errado.`);
        const num = Number(sale.saleNumber || 0);
        const payload = {
            natureza_operacao: txt(cfg.naturezaOperacao, 60) || 'VENDA DE MERCADORIA',
            data_emissao: dataEmissao(),
            tipo_documento: 1,             // 1 = saída
            finalidade_emissao: 1,         // 1 = Normal
            consumidor_final: 1,           // 1 = Consumidor final
            presenca_comprador: 1,         // 1 = Operação presencial
            modalidade_frete: 9,           // 9 = sem frete
            local_destino: foraDoEstado ? 2 : 1,
            cnpj_emitente: cnpjEmitente,   // o resto da empresa sai do cadastro dela na Focus NFe
            items,
            formas_pagamento,
        };
        if (tipo === 'nfce') payload.tipo_impressao_danfe = 4; // 4 = DANFE NFC-e
        if (num > 0) payload.informacoes_adicionais_contribuinte = 'Venda V-' + String(num).padStart(4, '0') + '.';
        const nomeDest = homolog ? HOMOLOG_DEST : txt((cliente && (cliente.razaoSocial || cliente.name)) || sale.customerName || '', 60);
        if (tipo === 'nfce') {
            if (doc) {
                if (doc.length === 11) payload.cpf_destinatario = doc; else payload.cnpj_destinatario = doc;
                if (nomeDest && (homolog || !/^consumidor( final)?$/i.test(nomeDest))) payload.nome_destinatario = nomeDest;
            }
        } else {
            const c = cliente || {};
            if (!doc) throw new Error('A NF-e precisa do CPF ou CNPJ do cliente.');
            if (doc.length === 11) payload.cpf_destinatario = doc; else payload.cnpj_destinatario = doc;
            payload.nome_destinatario = nomeDest || 'Cliente';
            const ie = onlyDigits(c.ie || c.inscricaoEstadual);
            const ind = String(c.indIE || '') || (doc.length === 11 ? '9' : ie ? '1' : '');
            if (!['1', '2', '9'].includes(ind)) throw new Error('Diga se o cliente é contribuinte do ICMS (tem inscrição estadual), isento ou não contribuinte.');
            if (ind === '1' && !ie) throw new Error('Cliente contribuinte do ICMS: falta a inscrição estadual (IE).');
            payload.indicador_inscricao_estadual_destinatario = Number(ind);
            if (ind === '1') payload.inscricao_estadual_destinatario = ie;
            if (ind === '1') payload.consumidor_final = 0; // revenda / industrialização
            const end = {
                logradouro_destinatario: txt(c.street || c.rua || c.logradouro || c.address, 60),
                numero_destinatario: txt(c.number || c.numero || 'S/N', 60),
                bairro_destinatario: txt(c.neighborhood || c.bairro, 60),
                municipio_destinatario: txt(c.city || c.cidade, 60),
                uf_destinatario: ufDest,
            };
            const falta = Object.entries({ logradouro_destinatario: 'rua', bairro_destinatario: 'bairro', municipio_destinatario: 'cidade' }).filter(([k]) => !end[k]).map(([, v]) => v);
            if (!/^[A-Z]{2}$/.test(ufDest)) falta.push('UF');
            if (falta.length) throw new Error('Falta no endereço do cliente: ' + falta.join(', ') + '. Complete o cadastro em Clientes.');
            Object.assign(payload, end);
            const cpl = txt(c.complement || c.complemento, 60); if (cpl) payload.complemento_destinatario = cpl;
            const cep = onlyDigits(c.zip || c.cep); if (cep.length === 8) payload.cep_destinatario = cep;
            const fone = onlyDigits(c.phone || c.telefone || c.whatsapp); if (fone.length >= 10 && fone.length <= 14) payload.telefone_destinatario = fone;
            const mail = String(c.emailNf || c.email || '').trim(); if (mail && mail.length <= 60 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) payload.email_destinatario = mail;
            payload.presenca_comprador = String(sale.type || 'balcao') === 'delivery' ? 9 : 1;
            if (foraDoEstado && ind === '9') avisos.push('Venda para consumidor de outro estado: confira com o contador o DIFAL (ICMS da UF de destino).');
        }
        return { payload, total: reais(totalNota), foraDaNota: reais(Math.max(0, somaTodos - somaMerc)), avisos };
    }

    /** Monta payload Focus NFe a partir da venda (nome antigo; NFC-e) */
    function buildPayload(saleData, cfg) { return montarNota(saleData, cfg, { tipo: 'nfce' }).payload; }

    /** Referência da nota na Focus: a MESMA para a mesma venda (só muda quando a anterior foi recusada). */
    function gerarRef(saleId, seq, tipo) {
        const id = String(saleId || 'sem').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80);
        return `${tipo === 'nfe' ? 'nfe' : 'venda'}-${id}-${Math.max(1, Number(seq) || 1)}`;
    }

    // ── gravação na venda ───────────────────────────────────
    /** Salva status fiscal no documento da venda */
    async function salvarStatusFiscal(saleId, fiscal) {
        if (!saleId) return;
        try {
            await db.collection('sales').doc(saleId).update({ fiscal });
        } catch(e) { console.warn('[NFCe] não foi possível atualizar venda:', e.message); }
    }
    async function lerVenda(saleId) {
        if (!saleId) return null;
        try { const d = await db.collection('sales').doc(saleId).get(); return d.exists ? { id: saleId, ...d.data() } : null; } catch (e) { return null; }
    }
    const baseFocus = c => producao(c) ? 'https://api.focusnfe.com.br' : 'https://homologacao.focusnfe.com.br';
    // A Focus retorna caminhos relativos — precisamos prefixar com a URL base
    const absoluta = (c, path) => !path ? null : /^https?:/i.test(path) ? path : baseFocus(c) + (path.startsWith('/') ? path : '/' + path);
    const FINAIS_ERRO = ['erro_autorizacao', 'denegado', 'negado'];

    /** Resposta da Focus (envio ou consulta) -> o que fica gravado em sales/<id>.fiscal. */
    function fiscalDe(d, cfg, base) {
        const st = String(d.status || '');
        const f = { ...base, ambiente: cfg.ambienteSefaz || 'homologacao' };
        if (st === 'autorizado') {
            Object.assign(f, {
                status: 'autorizado', error: null,
                chave: d.chave_nfe || d.chave || f.chave || null,
                numero: d.numero ?? f.numero ?? null,
                serie: d.serie ?? f.serie ?? null,
                protocolo: d.protocolo || d.numero_protocolo || f.protocolo || null,
                danfeUrl: absoluta(cfg, d.caminho_danfe || d.url_danfe) || f.danfeUrl || null,
                danfeUrlImpressao: absoluta(cfg, d.caminho_danfe || d.url_danfe) || f.danfeUrlImpressao || null,
                xmlUrl: absoluta(cfg, d.caminho_xml_nota_fiscal || d.url_xml) || f.xmlUrl || null,
                consultaUrl: d.url_consulta_nf || f.consultaUrl || null,
                autorizadaEm: f.autorizadaEm || new Date().toISOString(),
            });
        } else if (st === 'cancelado') {
            Object.assign(f, { status: 'cancelado', canceladaEm: f.canceladaEm || new Date().toISOString(), xmlCancelamentoUrl: absoluta(cfg, d.caminho_xml_cancelamento) || f.xmlCancelamentoUrl || null });
        } else if (FINAIS_ERRO.includes(st)) {
            Object.assign(f, { status: st === 'erro_autorizacao' ? 'erro' : 'denegado', error: erroTexto({ status: 200, data: d }), statusSefaz: d.status_sefaz || null });
        } else {
            Object.assign(f, { status: 'processando' });
        }
        return f;
    }

    // ── API PÚBLICA ─────────────────────────────────────────

    /**
     * Emite uma NFC-e para uma venda já gravada no Firestore.
     * @param {Object} saleData  Dados da venda (mesmo objeto salvo em /sales)
     * @param {String} saleId    ID do documento da venda no Firestore
     * @returns {Promise<{ok, error?, ref?, status?, danfeUrl?, danfeUrlImpressao?, chave?}>}
     */
    async function emitir(saleData, saleId, op) {
        return emitirNota(saleData, saleId, Object.assign({ tipo: 'nfce' }, op || {}));
    }

    /**
     * NFC-e (síncrona na Focus) ou NF-e (a Focus processa e a gente consulta) de uma venda. op = { tipo, cliente, doc }.
     * Nunca cria uma 2ª nota para a mesma venda: se já houver uma autorizada ou em processamento, consulta a mesma.
     */
    async function emitirNota(saleData, saleId, op) {
        op = op || {};
        const tipo = op.tipo === 'nfe' ? 'nfe' : 'nfce';
        const nome = tipo === 'nfe' ? 'NF-e' : 'NFC-e';
        let ref = null;
        try {
            // 39.10 · Nota de produto pelo Base by Asaas (ou desligada) em Configurações › Fiscal
            const g0 = await lerGeral();
            if (g0 && produtoProv(g0) === 'base') { const B = pelaBase(); return B ? B.emitir(saleData, saleId, { ...op, tipo }) : semBase; }
            if (g0 && produtoProv(g0) === 'dp') { const D = peloDP(); return D ? D.emitir(saleData, saleId, { ...op, tipo }) : semDP; } // 41.1
            if (g0 && produtoProv(g0) === 'nenhum') return { ok: false, error: `A nota de produto (${nome}) está desligada em Configurações › Fiscal: escolha a Focus NFe ou o Base by Asaas para emitir.` };
            const cfg = await loadConfig();
            // O que já está gravado na venda manda (outra aba, clique duplo, venda reaberta)
            const gravada = await lerVenda(saleId);
            const ant = (gravada && gravada.fiscal) || (saleData && saleData.fiscal) || null;
            const antTipo = ant ? (ant.tipo || 'nfce') : null;
            if (ant && ant.ref && ['autorizado', 'processando'].includes(ant.status)) {
                if (antTipo !== tipo && ant.status === 'autorizado') return { ok: false, error: `Esta venda já tem ${antTipo === 'nfe' ? 'NF-e' : 'NFC-e'} autorizada (nº ${ant.numero || '?'}). Uma venda leva uma nota de mercadoria só: cancele a outra antes.` };
                if (antTipo === tipo || ant.status === 'processando') {
                    const r = await atualizarVenda(saleId, { cfg, fiscal: ant });
                    if (r.ok && r.status === 'autorizado') return { ...r, jaExistia: true };
                    if (r.ok && r.status === 'processando') return r;
                    if (!r.ok && !['erro', 'denegado', 'cancelado'].includes(r.status)) return r; // sem resposta: não arrisca uma 2ª nota
                }
            }
            // 37.9 · Venda antiga (sem os dados fiscais no item): busca NCM/CFOP/CSOSN/origem no cadastro do produto
            if (window.DPFiscal && DPFiscal.fill) await DPFiscal.fill(saleData.items || []);
            const prods = await carregarProdutos(saleData.items || [], { fresco: true });
            const m = montarNota(saleData, cfg, { tipo, prods, cliente: op.cliente, doc: op.doc });
            const mesmoTipo = ant && antTipo === tipo;
            const seq = mesmoTipo ? (Number(ant.seq) || 1) + (['erro', 'denegado', 'cancelado'].includes(ant.status) ? 1 : 0) : 1;
            ref = gerarRef(saleId, seq, tipo);
            const base = { tipo, provedor: 'focus', ref, seq, valor: m.total };

            // 1) Envia para emissão
            const emit = await chamar(cfg, { acao: 'emitir', ref, tipo }, { method: 'POST', body: m.payload });
            if (emit.status === 0) {
                // Sem resposta: a nota pode ter saído. Fica "processando" com a MESMA referência (Atualizar consulta)
                const f = { ...base, status: 'processando', ambiente: cfg.ambienteSefaz, error: erroTexto(emit), dataEmissao: agoraServidor() };
                await salvarStatusFiscal(saleId, f);
                return { ok: false, ...f, error: erroTexto(emit) + ' Confira em instantes se a nota saiu (Atualizar).' };
            }
            if (emit.status >= 200 && emit.status < 300 && emit.data && emit.data.status) {
                let d = emit.data;
                // NF-e (ou NFC-e que a Focus deixou processando): consulta até ~20 segundos
                for (let i = 0; i < 10 && d.status === 'processando_autorizacao'; i++) {
                    await dormir(i < 4 ? 1500 : 2500);
                    const c = await chamar(cfg, { acao: 'consultar', ref, tipo });
                    if (c.ok && c.data && c.data.status) d = c.data;
                }
                const f = fiscalDe(d, cfg, { ...base, dataEmissao: agoraServidor() });
                await salvarStatusFiscal(saleId, f);
                if (f.status === 'autorizado') return { ok: true, ...f, avisos: m.avisos };
                if (f.status === 'processando') return { ok: true, ...f, message: `${nome} em processamento na SEFAZ. Confira em instantes (Atualizar).` };
                return { ok: false, ...f, raw: d };
            }

            // Erro ao emitir (validação da Focus, token, proxy...)
            return registrarFalha(saleId, ref, emit, { ...base, ambiente: cfg.ambienteSefaz });
        } catch(e) {
            console.error('[NFCe] erro:', e);
            return { ok:false, ref, error: e.message || String(e) };
        }
    }

    /** Consulta a nota da venda na Focus e grava o resultado (Atualizar). */
    async function atualizarVenda(saleId, op) {
        op = op || {};
        try {
            const f0 = op.fiscal || ((await lerVenda(saleId)) || {}).fiscal;
            if (!f0 || !f0.ref) return { ok: false, error: 'Esta venda não tem nota fiscal enviada.' };
            if (f0.provedor === 'base') { const B = pelaBase(); return B ? B.atualizar(saleId, f0) : semBase; } // 39.10
            if (f0.provedor === 'dp') { const D = peloDP(); return D ? D.atualizar(saleId, f0) : semDP; } // 41.1
            const cfg = op.cfg || await loadConfig();
            const tipo = f0.tipo === 'nfe' ? 'nfe' : 'nfce';
            const r = await chamar(cfg, { acao: 'consultar', ref: f0.ref, tipo });
            if (r.ok && r.data && r.data.status) {
                const f = fiscalDe(r.data, cfg, f0);
                await salvarStatusFiscal(saleId, f);
                return { ok: f.status === 'autorizado' || f.status === 'processando' || f.status === 'cancelado', ...f };
            }
            if (r.status === 404 && /nao_encontrad/.test(String((r.data || {}).codigo || ''))) {
                // A Focus não recebeu esta nota: pode enviar de novo com a mesma referência
                const f = { ...f0, status: 'erro', error: 'A nota não chegou à Focus NFe (nada foi emitido). Pode emitir de novo.' };
                await salvarStatusFiscal(saleId, f);
                return { ok: false, ...f };
            }
            return { ok: false, ...f0, error: erroTexto(r) };
        } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }

    /** Consulta o status atual de uma NFC-e por ref (para reaver o resultado) */
    async function consultar(ref, tipo) {
        try {
            const cfg = await loadConfig();
            const r = await chamar(cfg, { acao: 'consultar', ref, tipo: tipo || 'nfce' });
            return r.ok ? { ok: true, ...r.data } : { ok: false, ...r.data, error: erroTexto(r) };
        } catch(e) {
            return { ok:false, error: e.message };
        }
    }

    /** Cancela uma NFC-e autorizada (até 30 minutos após emissão) */
    async function cancelar(ref, justificativa, tipo) {
        try {
            const cfg = await loadConfig();
            const j = txt(justificativa, 255);
            if (j.length < 15) {
                return { ok:false, error:'Justificativa precisa ter pelo menos 15 caracteres.' };
            }
            const r = await chamar(cfg, { acao: 'cancelar', ref, tipo: tipo || 'nfce' }, { method: 'POST', body: { justificativa: j } });
            // Cancelar de novo uma nota já cancelada: a Focus responde already_processed ("A nota fiscal foi cancelada")
            const okCancel = r.data && ((r.ok && r.data.status === 'cancelado') || (r.data.codigo === 'already_processed' && /cancelad/i.test(String(r.data.mensagem || ''))));
            return okCancel ? { ok: true, ...r.data, status: 'cancelado' } : { ok: false, ...r.data, error: (r.data && r.data.status === 'erro_cancelamento') ? 'A SEFAZ não cancelou: ' + (r.data.mensagem_sefaz || r.data.mensagem || 'motivo não informado') : erroTexto(r) };
        } catch(e) {
            return { ok:false, error: e.message };
        }
    }
    /** Cancela a nota da venda e grava (NFC-e: em geral até 30 minutos; NF-e: até 24 horas). */
    async function cancelarVenda(saleId, justificativa) {
        const v = await lerVenda(saleId);
        const f0 = v && v.fiscal;
        if (!f0 || !f0.ref || f0.status !== 'autorizado') return { ok: false, error: 'Esta venda não tem nota autorizada para cancelar.' };
        if (f0.provedor === 'base') { const B = pelaBase(); return B ? B.cancelar(saleId, f0, justificativa) : semBase; } // 39.10
        if (f0.provedor === 'dp') { const D = peloDP(); return D ? D.cancelar(saleId, f0, justificativa) : semDP; } // 41.1
        const r = await cancelar(f0.ref, justificativa, f0.tipo === 'nfe' ? 'nfe' : 'nfce');
        if (!r.ok) return r;
        const cfg = await lerGeral() || {};
        const f = { ...f0, status: 'cancelado', canceladaEm: new Date().toISOString(), motivoCancelamento: txt(justificativa, 255), xmlCancelamentoUrl: absoluta(cfg, r.caminho_xml_cancelamento) || null };
        await salvarStatusFiscal(saleId, f);
        return { ok: true, ...f };
    }

    async function registrarFalha(saleId, ref, resp, base) {
        const errMsg = erroTexto(resp);
        await salvarStatusFiscal(saleId, {
            ...(base || {}),
            ref, status:'erro',
            error: errMsg,
            dataTentativa: agoraServidor(),
        });
        return { ok:false, ref, status: 'erro', error: errMsg, raw: resp && resp.data };
    }

    /** Verifica se a emissão fiscal está habilitada (sem lançar erro) */
    async function isEnabled() {
        try {
            const c = await lerGeral() || {};
            if (produtoProv(c) === 'base') return !!(c.emitirNFe && (ponte() || proxyUrl(c)) && chaveBase(c) && pelaBase()); // 39.10
            if (produtoProv(c) === 'dp') return !!(c.emitirNFe && String(c.dpNotaChave || '').trim() && peloDP()); // 41.1 (sem proxy: fala direto com a DistribuiPro)
            return !!(c.emitirNFe && (ponte() || proxyUrl(c)) && tokenFocus(c)) && !focusDesligada(c);
        } catch(e) { return false; }
    }

    /** Retorna o modo de emissão configurado: manual | perguntar | automatico */
    async function getModoEmissao() {
        try {
            const c = await lerGeral();
            return (c && c.modoEmissaoNfce) || 'perguntar';
        } catch(e) { return 'perguntar'; }
    }

    // ── DANFE e janela do resultado ─────────────────────────
    /** Abre o DANFE/DANFCE (ou o XML) da nota. Precisa ser chamado no clique (o navegador bloqueia janela aberta sozinha). */
    function abrirDocumento(fiscal, qual) {
        const url = qual === 'xml' ? (fiscal && fiscal.xmlUrl) : (fiscal && (fiscal.danfeUrl || fiscal.pdfUrl || fiscal.consultaUrl));
        if (!url) {
            const peloBase = fiscal && fiscal.provedor === 'base';
            if (window.Toast) Toast.warning(peloBase && ponte() ? `O ${qual === 'xml' ? 'XML' : 'PDF (DANFE)'} das notas do Base fica no painel do Base by Asaas (Faturamento › Notas fiscais).`
                : `O ${qual === 'xml' ? 'XML' : 'DANFE'} desta nota ainda não está disponível.${peloBase ? ' O Base manda em instantes: clique em Atualizar.' : ''}`);
            return false;
        }
        const w = window.open(url, '_blank');
        if (w) { try { w.opener = null; } catch (e) { } }
        else if (window.Toast && !ponte()) Toast.warning('O navegador bloqueou a janela da nota. Libere as janelas (pop-ups) deste site e clique de novo.');
        return true;
    }
    const escH = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    /** Janela com o resultado da emissão (o DANFE abre no clique, o navegador não bloqueia). Resolve ao fechar. */
    function mostrarResultado(r, op) {
        op = op || {};
        return new Promise(resolve => {
            document.querySelectorAll('#nfceResultOverlay').forEach(e => e.remove());
            const nome = r && r.tipo === 'nfe' ? 'NF-e' : 'NFC-e';
            const ok = r && r.ok && r.status === 'autorizado';
            const proc = r && r.status === 'processando';
            const cor = ok ? '#10b981' : proc ? '#f59e0b' : '#ef4444';
            const icone = ok ? 'fa-circle-check' : proc ? 'fa-hourglass-half' : 'fa-triangle-exclamation';
            const titulo = ok ? `${nome} nº ${escH(r.numero || '')} autorizada${r.serie ? ' (série ' + escH(r.serie) + ')' : ''}` : proc ? `${nome} em processamento` : `A ${nome} não saiu`;
            const ondeVer = 'Pedidos › abra a venda › Nota fiscal';
            const semPdfBase = ok && !r.danfeUrl && r.provedor === 'base'
                ? (ponte() ? ' O PDF (DANFE) e o XML ficam no painel do Base by Asaas (Faturamento › Notas fiscais).' : ' O PDF (DANFE) chega do Base em instantes: abra em Pedidos › Nota fiscal.') : '';
            const texto = ok ? (r.ambiente === 'producao' ? 'Nota com validade fiscal.' : 'Ambiente de homologação (teste): esta nota não tem validade fiscal.') + semPdfBase
                : proc ? `A SEFAZ ainda não respondeu. Confira em instantes em ${ondeVer}.`
                : `${escH(r && r.error || 'Motivo não informado.')}<br><span style="color:var(--text-muted)">A venda está salva. Corrija e emita de novo em ${ondeVer}.</span>`;
            const ov = document.createElement('div');
            ov.id = 'nfceResultOverlay';
            ov.className = 'modal-overlay active';
            ov.innerHTML = `<div class="modal" style="max-width:440px">
                <div class="modal-header"><h3><i class="fas ${icone}" style="margin-right:8px;color:${cor}"></i>${titulo}</h3></div>
                <div class="modal-body"><p style="font-size:13px;line-height:1.5;margin:0">${texto}</p>${ok && r.avisos && r.avisos.length ? `<p style="font-size:12px;color:#d97706;margin:10px 0 0">${r.avisos.map(escH).join('<br>')}</p>` : ''}</div>
                <div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end">
                    <button class="btn btn-outline" data-a="fechar">Fechar</button>
                    ${ok && r.danfeUrl ? `<button class="btn btn-primary" data-a="danfe"><i class="fas fa-print"></i> ${r.tipo === 'nfe' ? 'Abrir DANFE' : 'Imprimir DANFE'}</button>` : ''}
                </div></div>`;
            const fechar = () => { ov.remove(); resolve(); };
            ov.addEventListener('click', e => {
                const a = e.target.closest('[data-a]'); if (!a) return;
                if (a.dataset.a === 'danfe') abrirDocumento(r, 'danfe');
                if (a.dataset.a === 'fechar' || (a.dataset.a === 'danfe' && op.fecharAoAbrir !== false)) fechar();
            });
            document.body.appendChild(ov);
            setTimeout(() => { try { (ov.querySelector('[data-a="danfe"]') || ov.querySelector('[data-a="fechar"]')).focus(); } catch (e) { } }, 50);
        });
    }

    // Exporta no window
    window.NFCeService = {
        emitir, emitirNota, consultar, cancelar, isEnabled, getModoEmissao,
        atualizarVenda, cancelarVenda, abrirDocumento, mostrarResultado, temMercadoria, carregarProdutos, buildPayload,
        util: { chamar, callProxy, lerGeral, loadConfig, erroTexto, montarNota, itemServico, itemPacote, docOk, docLimpo, cent, reais, ratear, txt,
            ponte, proxyUrl, producao, tokenFocus, focusDesligada, produtoProv, chaveBase, formaDaNota, unidadeNota, toNumber, salvarStatusFiscal,
            dataEmissao, gerarRef, absoluta, lerVenda, agoraServidor, HOMOLOG_ITEM, HOMOLOG_DEST }
    };
})();
