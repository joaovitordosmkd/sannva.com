/* DistribuiPro 39.10 · NOTA DE PRODUTO PELO BASE BY ASAAS (versões vitalícias e demo vitalícia) — window.DPNotasBase
   O Base é o sistema de gestão (ERP) do Asaas. A API dele emite a NFC-e (modelo 65) e a NF-e (modelo 55) a partir de um
   PEDIDO DE VENDA, e o produto e o cliente precisam estar cadastrados lá. A cada nota:
     1) cada produto da venda é procurado no Base pela referência "dp-<id do produto>" (criado na 1ª vez; nome, NCM e
        unidade atualizados quando mudam aqui). O código que já existe no Base é aproveitado;
     2) o cliente é procurado pelo CPF/CNPJ (criado se não existir; na NF-e o endereço e a IE são atualizados). NFC-e sem
        CPF usa o cliente "CONSUMIDOR FINAL" do Base (criado se não existir);
     3) o pedido é criado com a referência da nota (dp-nfce-<venda>-<n> / dp-nfe-...), os itens, o desconto e o pagamento
        (no banco do Base escolhido em Configurações › Fiscal). A mesma referência nunca cria dois pedidos;
     4) a nota é pedida (POST /salesOrders/{id}/invoice, type 65 ou 55) e o pedido é consultado até a SEFAZ responder.
   No Base a nota sai assíncrona. O link do PDF (DANFE) e do XML, a série e o motivo de uma recusa só vêm no AVISO do Base
   (webhook): nas versões web o "Testar conexão" liga o aviso "DistribuiPro" apontando para o api/nfce-proxy.php (que só
   responde 200) e o sistema lê os avisos pela lista de envios do webhook (API do Base). No Windows Offline não há endereço
   para o Base chamar: o número e a situação vêm do pedido; o PDF e o XML ficam no painel do Base.
   Gravação: sales/<id>.fiscal = { provedor: 'base', tipo, ref, seq, pedidoId, invoiceId, numero, serie, status, ... }.
   Feito pela documentação da API (docs.baseerp.com.br); o teste com conta real (sandbox do Base) está no LEIA-ME 39.10. */
(function () {
    'use strict';
    if (window.DPNotasBase) return;
    const U = () => (window.NFCeService && window.NFCeService.util) || null;
    const dig = v => String(v ?? '').replace(/\D/g, '');
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    const hojeISO = d => { d = d || new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const amb = g => (g && g.ambienteSefaz) === 'producao' ? 'producao' : 'homologacao';
    const NOME = { nfe: 'NF-e', nfce: 'NFC-e' };
    const lista = d => !d ? [] : Array.isArray(d.content) ? d.content : Array.isArray(d.data) ? d.data : Array.isArray(d) ? d : [];
    const vivo = x => !!x && !x.deleted;
    let linkOk = u => /^https:\/\/([a-z0-9-]+\.)*baseerp\.com\.br\//i.test(String(u || '')); // PDF/XML só do próprio Base
    const hash = s => { let h = 5381; for (const ch of String(s)) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0; return h.toString(36); };
    /** GTIN (código de barras) só com o dígito certo; senão nada (o Base/SEFAZ recusa GTIN errado). */
    const gtin = v => {
        const d = dig(v); if (![8, 12, 13, 14].includes(d.length)) return '';
        let s = 0; for (let i = 0; i < d.length - 1; i++) s += Number(d[d.length - 2 - i]) * (i % 2 === 0 ? 3 : 1);
        return (10 - s % 10) % 10 === Number(d[d.length - 1]) ? d : '';
    };

    /* ===================== SITUAÇÃO DA NOTA NO BASE ===================== */
    const AUTORIZADA = ['ENVIADA', 'EMITIDA', 'NOTA_AUTORIZADA_DFE', 'CONTIGENCIA', 'ENVIO_CARTA_CORRECAO', 'CANCELAMENTO_NEGADO'];
    const RECUSADA = ['NEGADA', 'REJEITADA', 'ERRO_ENVIO', 'AJUSTES_NECESSARIOS', 'INUTILIZADA'];
    /** invoiceStatus do Base -> situação do sistema (autorizado, processando, cancelando, cancelado, erro, denegado). */
    function situacao(s) {
        s = String(s || '').toUpperCase();
        if (!s) return 'processando';
        if (AUTORIZADA.includes(s)) return 'autorizado';
        if (s === 'CANCELADA') return 'cancelado';
        if (s === 'DENEGADA') return 'denegado';
        if (s === 'EM_PROCESSO_CANCELAMENTO') return 'cancelando';
        if (RECUSADA.includes(s)) return 'erro';
        return 'processando'; // GRAVADA, PENDENTE..., EM_PROCESSO_AUTORIZACAO, INICIADA, PROCESSANDO
    }
    const TEXTO_ST = {
        REJEITADA: 'a SEFAZ recusou a nota', NEGADA: 'a SEFAZ negou a nota', ERRO_ENVIO: 'a nota não chegou à SEFAZ',
        AJUSTES_NECESSARIOS: 'o Base pede ajustes na nota (grupo de impostos, cadastro do produto ou do cliente)',
        INUTILIZADA: 'o número da nota foi inutilizado', DENEGADA: 'a SEFAZ denegou a nota (situação fiscal do cliente ou da empresa)'
    };

    /* ===================== CONFIGURAÇÃO E CHAMADAS ===================== */
    async function config() {
        const u = U(); if (!u) throw new Error('Recarregue a página (o arquivo nfce-service.js não carregou).');
        const g = await u.lerGeral();
        if (!g) throw new Error('Configurações não encontradas. Vá em Configurações primeiro.');
        if (!g.emitirNFe) throw new Error('A emissão de nota fiscal está desligada em Configurações › Fiscal.');
        if (!u.ponte() && !u.proxyUrl(g)) throw new Error('Falta o endereço do proxy da nota (nfce-proxy.php) em Configurações › Fiscal.');
        const k = u.chaveBase(g);
        if (!k) throw new Error(`Falta a chave de API do Base by Asaas (${amb(g) === 'producao' ? 'produção' : 'sandbox'}) em Configurações › Fiscal.`);
        return { ...g, _baseChave: k };
    }
    const chamar = (c, q, op) => U().chamar(c, { provedor: 'base', ...q }, op);
    const gravarPost = (c, q, body) => chamar(c, q, { method: 'POST', body: body || {} });

    /** Motivo em português a partir da resposta do Base (ou do proxy). */
    function erroBase(r) {
        const d = (r && r.data) || {};
        const st = r ? r.status : 0;
        const itens = [];
        [].concat(Array.isArray(d.errors) ? d.errors : [], Array.isArray(d.fieldErrors) ? d.fieldErrors : []).forEach(e => {
            const t = e && (e.description || e.defaultMessage || e.message || e.code);
            if (t) itens.push((e.field ? e.field + ': ' : '') + t);
        });
        const msg = itens.join('; ') || (typeof d.message === 'string' ? d.message : '') || (typeof d.detail === 'string' ? d.detail : '');
        if (st === 0) return d.erro || 'Sem conexão com a internet ou o servidor da nota não respondeu.';
        if (d.codigo === 'chave_ausente' || d.codigo === 'chave_invalida') return d.mensagem;
        if (st === 401) return 'O Base by Asaas recusou a chave de API. Crie a chave dentro do Base (Menu do usuário › Configurações › Chaves de API), no ambiente certo (a do Sandbox para teste), e salve em Configurações › Fiscal.';
        // O Base responde 403 sem texto para chave errada (testado em 15/10/2026)
        if (st === 403) return msg ? 'O Base by Asaas bloqueou o acesso: ' + msg
            : 'O Base by Asaas não aceitou a chave de API. Confira se ela foi criada dentro do Base (Menu do usuário › Configurações › Chaves de API), se é do ambiente certo (a do Sandbox para teste, a de produção para valer) e se a conta do Asaas é PJ com o Base ativado.';
        if (st === 404 && d._raw !== undefined && !msg && !(U() && U().ponte())) return 'O arquivo nfce-proxy.php não foi encontrado no servidor. Confira o endereço do proxy em Configurações › Fiscal.';
        if (st === 429) return 'Muitas chamadas ao Base by Asaas em pouco tempo. Espere 1 minuto e tente de novo.';
        if (st >= 500 && !msg) return `O Base by Asaas não respondeu agora (${d.erro || 'erro ' + st}). Tente de novo em instantes.`;
        if (msg) return 'O Base by Asaas recusou: ' + msg;
        return d.mensagem || d.erro || `Falha ao falar com o Base by Asaas (${st}).`;
    }

    /* ===================== MONTAGEM: ITENS, DESCONTO E PAGAMENTO ===================== */
    const BILLING = { '03': 'CREDIT_CARD', '04': 'DEBIT_CARD', '15': 'BOLETO', '16': 'DEPOSIT', '17': 'PIX', '18': 'TRANSFER' };
    const dataTexto = v => { const s = typeof v === 'string' ? v : ''; return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null; };
    /** Pagamentos do pedido (proporcionais ao total da nota quando parte da venda fica fora: serviço, pacote). */
    function pagamentos(sale, totalC, c) {
        const u = U();
        let pags = Array.isArray(sale.payments) && sale.payments.length ? sale.payments : [{ method: sale.paymentMethod || 'dinheiro', amount: sale.total, installments: sale.installments }];
        pags = pags.filter(p => p && u.cent(p.amount) > 0 && p.method !== 'sinal');
        if (!pags.length) pags = [{ method: 'dinheiro', amount: u.reais(totalC) }];
        const valores = pags.map(p => u.cent(p.amount));
        const soma = valores.reduce((s, v) => s + v, 0);
        const naNota = soma === totalC ? valores : u.ratear(totalC, valores);
        const hoje = hojeISO();
        const out = [];
        pags.forEach((p, i) => {
            if (naNota[i] <= 0) return;
            const f = u.formaDaNota(p.method, c.formasPagamentoExtras);
            // Dinheiro e as formas que o Base não tem na lista vão como UNDEFINED (o Base não tem "dinheiro" no pedido)
            const x = { billingType: BILLING[f.codigo] || 'UNDEFINED', value: u.reais(naNota[i]), dueDate: hoje };
            if (f.aPrazo) x.dueDate = dataTexto(p.dueDate) || dataTexto(sale.dueDate) || hojeISO(new Date(Date.now() + 30 * 864e5));
            else x.receiptDate = hoje;
            const parc = parseInt(p.installments || sale.installments || 0, 10);
            if (x.billingType === 'CREDIT_CARD' && parc > 1) x.numberInstallments = parc;
            out.push(x);
        });
        return out;
    }

    /**
     * Venda gravada -> o que vai para o Base. op = { tipo: 'nfce'|'nfe', prods, cliente (cadastro, para a NF-e), doc }.
     * Lança Error com o que falta, em português. A tributação (CFOP, CST/CSOSN, alíquotas) é a do grupo de impostos do Base.
     */
    function montar(sale, c, op) {
        op = op || {};
        const u = U();
        const tipo = op.tipo === 'nfe' ? 'nfe' : 'nfce', nome = NOME[tipo];
        const prods = op.prods || {};
        const itens = Array.isArray(sale.items) ? sale.items : [];
        const linhas = [];
        let somaTodos = 0;
        itens.forEach(it => {
            if (!it) return;
            const q = Math.round(u.toNumber(it.quantity) * 10000) / 10000;
            let pu = u.toNumber(it.unitPrice);
            if (!(q > 0) || !isFinite(pu) || pu < 0) return;
            let bruto = u.cent(q * pu);
            let liq = it.total !== undefined && it.total !== null && it.total !== '' ? Math.max(0, u.cent(it.total)) : bruto;
            if (liq > bruto + 1) { bruto = liq; pu = liq / 100 / q; }
            if (liq > bruto) liq = bruto;
            somaTodos += liq;
            const p = it.productId ? prods[String(it.productId)] : null;
            if (u.itemPacote(it, p) || u.itemServico(it, p) || liq <= 0) return;
            // Caixa/fardo (fator > 1): no Base vai na unidade do produto (quantidade x fator)
            const fator = Number(it._factor || 1) > 1 ? Number(it._factor) : 1;
            linhas.push({ it, p, q: Math.round(q * fator * 10000) / 10000, pu: pu / fator, bruto, liq });
        });
        if (!linhas.length) throw new Error(itens.length
            ? `Esta venda só tem serviço (ou itens sem valor): ela não gera ${nome}. O serviço sai na nota de serviço (NFS-e).`
            : 'A venda não tem itens.');
        const somaMerc = linhas.reduce((s, l) => s + l.liq, 0);
        // NCM (o do produto ou o padrão da loja): o Base não cadastra produto sem NCM
        const ncmPadrao = dig(c.ncmPadrao);
        const nomeItem = l => u.txt(l.it.productName || (l.p && l.p.name) || 'Produto', 120);
        const semNcm = [], ncmErrado = [];
        linhas.forEach(l => { const n = dig(l.it.ncm || (l.p && l.p.ncm)) || ncmPadrao; if (!n) semNcm.push(nomeItem(l)); else if (n.length !== 8) ncmErrado.push(nomeItem(l)); });
        if (semNcm.length) throw new Error(semNcm.length === 1
            ? `Produto ${semNcm[0]} sem NCM: preencha em Produtos › Fiscal`
            : `Produtos ${[...new Set(semNcm)].join(', ')} sem NCM: preencha em Produtos › Fiscal`);
        if (ncmErrado.length) throw new Error(`NCM incompleto em ${[...new Set(ncmErrado)].join(', ')}: o NCM tem 8 números. Corrija em Produtos › Fiscal`);
        // Desconto geral, acréscimo do cartão e taxa de entrega: a parte das mercadorias, dividida entre os itens
        let desc = Math.max(0, u.cent(sale.discount || 0));
        const acres = Math.max(0, u.cent(sale.cardSurcharge || sale.surcharge || 0));
        const entrega = Math.max(0, u.cent(sale.deliveryFee || 0));
        if (desc > somaTodos) desc = somaTodos;
        const parte = v => somaTodos > 0 ? Math.round(v * somaMerc / somaTodos) : 0;
        const descMerc = somaMerc === somaTodos ? desc : Math.min(parte(desc), somaMerc);
        const outrasMerc = (somaMerc === somaTodos ? acres : parte(acres)) + entrega;
        const pesos = linhas.map(l => l.liq);
        const rDesc = u.ratear(descMerc, pesos, pesos);
        const rOutras = u.ratear(outrasMerc, pesos);
        let total = 0;
        linhas.forEach((l, i) => {
            l.alvo = l.liq - rDesc[i] + rOutras[i]; // o que o item vale na nota (centavos)
            total += l.alvo;
            const p = l.p || {};
            const pid = l.it.productId ? String(l.it.productId) : '';
            l.nome = nomeItem(l);
            l.ncm = dig(l.it.ncm || p.ncm) || ncmPadrao;
            l.unidade = u.unidadeNota({ unit: p.unit || l.it.unit || 'un' });
            l.ext = pid ? ('dp-' + pid).replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 120) : 'dp-avulso-' + hash(l.nome);
            l.code = u.txt(l.it.productCode || p.code || p.sku || pid || l.ext, 60);
            l.barcode = gtin(p.barcode || p.ean || l.it.barcode);
            l.preco = u.toNumber(p.price);
        });
        if (total <= 0) throw new Error(`A parte de mercadorias desta venda ficou sem valor: a ${nome} não sai com total zero.`);
        // Preço de cada item e desconto do pedido: o Base soma preço x quantidade e tira o desconto do pedido
        let soma = 0;
        linhas.forEach(l => { l.unit = Math.round(l.pu * 1e6) / 1e6; l.valor = Math.round(l.unit * l.q * 100 + 1e-7); soma += l.valor; });
        let desconto = soma - total;
        if (desconto < 0) { // acréscimo maior que o desconto: sobe o preço dos itens (o pedido do Base não tem "outras despesas")
            soma = 0;
            linhas.forEach(l => { l.unit = Math.ceil(l.alvo / 100 / l.q * 1e6 - 1e-6) / 1e6; l.valor = Math.round(l.unit * l.q * 100 + 1e-7); soma += l.valor; });
            desconto = Math.max(0, soma - total);
        }
        // Consumidor / destinatário
        const doc = u.docLimpo(op.doc !== undefined ? op.doc : sale.customerCpfCnpj);
        if (doc && !u.docOk(doc)) throw new Error(`${doc.length === 11 ? 'O CPF' : doc.length === 14 ? 'O CNPJ' : 'O CPF/CNPJ'} informado está com número errado.`);
        const cliente = op.cliente || null;
        const nomeCliente = u.txt((cliente && (cliente.razaoSocial || cliente.name)) || sale.customerName || '', 60);
        const out = { tipo, nome, linhas, totalC: total, total: u.reais(total), desconto, doc, cliente, nomeCliente, avisos: [], saleNumber: Number(sale.saleNumber || 0) };
        if (tipo === 'nfe') {
            const cl = cliente || {};
            if (!doc) throw new Error('A NF-e precisa do CPF ou CNPJ do cliente.');
            const ie = dig(cl.ie || cl.inscricaoEstadual);
            const ind = String(cl.indIE || '') || (doc.length === 11 ? '9' : ie ? '1' : '');
            if (!['1', '2', '9'].includes(ind)) throw new Error('Diga se o cliente é contribuinte do ICMS (tem inscrição estadual), isento ou não contribuinte.');
            if (ind === '1' && !ie) throw new Error('Cliente contribuinte do ICMS: falta a inscrição estadual (IE).');
            const end = {
                address: u.txt(cl.street || cl.rua || cl.logradouro || cl.address, 250), addressNumber: u.txt(cl.number || cl.numero || 'S/N', 10),
                complement: u.txt(cl.complement || cl.complemento, 60), province: u.txt(cl.neighborhood || cl.bairro, 60),
                cityName: u.txt(cl.city || cl.cidade, 60), stateAbbrev: String(cl.state || cl.uf || '').toUpperCase().slice(0, 2), postalCode: dig(cl.zip || cl.cep).slice(0, 8)
            };
            const falta = Object.entries({ address: 'rua', province: 'bairro', cityName: 'cidade' }).filter(([k]) => !end[k]).map(([, v]) => v);
            if (!/^[A-Z]{2}$/.test(end.stateAbbrev)) falta.push('UF');
            if (falta.length) throw new Error('Falta no endereço do cliente: ' + falta.join(', ') + '. Complete o cadastro em Clientes.');
            Object.keys(end).forEach(k => { if (!end[k]) delete end[k]; });
            Object.assign(out, { ind, ie, endereco: { ...end, country: 'Brasil' } });
            const ufEmit = String(c.uf || '').toUpperCase();
            if (ufEmit && end.stateAbbrev !== ufEmit && ind === '9') out.avisos.push('Venda para consumidor de outro estado: confira com o contador o DIFAL (ICMS da UF de destino).');
        }
        out.pagamentos = pagamentos(sale, total, c);
        return out;
    }

    /* ===================== CADASTROS NO BASE: PRODUTO, CLIENTE, BANCO ===================== */
    const cacheProd = {}, cacheCli = {}, cacheMisc = {};
    function limparCache() { [cacheProd, cacheCli, cacheMisc].forEach(o => Object.keys(o).forEach(k => delete o[k])); }

    async function produtoNoBase(c, l) {
        const k = amb(c) + '|' + l.ext;
        const sig = [l.nome, l.ncm, l.unidade, l.code].join('|'); // mudou aqui (ex.: NCM corrigido depois de uma recusa): confere de novo
        if (cacheProd[k] && cacheProd[k].sig === sig) return cacheProd[k].id;
        const corpo = { name: l.nome, code: l.code, ncm: l.ncm, unit: l.unidade, externalReference: l.ext };
        if (l.barcode) corpo.barcode = l.barcode;
        if (l.preco > 0) corpo.salePrice = Math.round(l.preco * 100) / 100;
        const r = await chamar(c, { acao: 'produto_buscar', ref: l.ext });
        if (!r.ok) throw new Error(`Produto ${l.nome}: ${erroBase(r)}`);
        let p = lista(r.data).find(vivo);
        if (p) {
            if (dig(p.ncm) !== l.ncm || String(p.unit || '').toUpperCase() !== l.unidade || String(p.name || '') !== l.nome) {
                const up = await gravarPost(c, { acao: 'produto_atualizar', id: p.id }, { ...corpo, code: p.code || l.code });
                if (!up.ok) throw new Error(`Produto ${l.nome}: ${erroBase(up)}`);
            }
        } else {
            const cr = await gravarPost(c, { acao: 'produto_criar' }, corpo);
            if (cr.ok && cr.data && cr.data.id) p = cr.data;
            else {
                // O código já existe no Base (produto cadastrado lá antes): usa esse produto, com a referência e o NCM daqui
                const b2 = cr.status === 0 ? null : await chamar(c, { acao: 'produto_buscar', codigo: l.code });
                const q = b2 && b2.ok ? lista(b2.data).find(x => vivo(x) && String(x.code) === l.code) : null;
                if (!q) throw new Error(`Produto ${l.nome}: ${erroBase(cr)}`);
                const up = await gravarPost(c, { acao: 'produto_atualizar', id: q.id }, { ...corpo, code: q.code || l.code });
                if (!up.ok) throw new Error(`Produto ${l.nome}: ${erroBase(up)}`);
                p = q;
            }
        }
        cacheProd[k] = { id: String(p.id), sig };
        return String(p.id);
    }
    /** Ids no Base de todos os produtos da nota ({ ext: id }), de 3 em 3. */
    async function produtosNoBase(c, linhas) {
        const unicas = [...new Map(linhas.map(l => [l.ext, l])).values()];
        const ids = {};
        for (let i = 0; i < unicas.length; i += 3) {
            const lote = unicas.slice(i, i + 3);
            const r = await Promise.all(lote.map(l => produtoNoBase(c, l)));
            lote.forEach((l, j) => { ids[l.ext] = r[j]; });
        }
        return ids;
    }

    function corpoCliente(m) {
        const u = U(), cl = m.cliente || {};
        const corpo = { name: u.txt(m.nomeCliente || 'CONSUMIDOR', 60) || 'CONSUMIDOR', cpfCnpj: m.doc };
        const mail = String(cl.emailNf || cl.email || '').trim();
        if (mail && mail.length <= 60 && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) corpo.email = mail;
        const fone = dig(cl.whatsapp || cl.phone || cl.telefone);
        if (fone.length >= 10 && fone.length <= 14) corpo.mobilePhone = fone;
        if (cl.id) corpo.externalReference = ('dp-cli-' + cl.id).slice(0, 250);
        if (m.tipo === 'nfe') {
            corpo.billingAddress = m.endereco;
            corpo.taxInformation = { typeOfTaxPayer: m.ind === '1' ? 'CONTRIBUINTE_ICMS' : m.ind === '2' ? 'CONTRIBUINTE_ISENTO' : 'NAO_CONTRIBUINTE', finalConsumer: m.ind !== '1' };
            if (m.ind === '1') corpo.taxInformation.stateInscription = m.ie;
        } else corpo.taxInformation = { typeOfTaxPayer: 'NAO_CONTRIBUINTE', finalConsumer: true };
        return corpo;
    }
    async function clienteNoBase(c, m) {
        if (!m.doc) return consumidorFinal(c);
        const k = amb(c) + '|' + m.doc + '|' + m.tipo;
        const corpo = corpoCliente(m);
        const sig = JSON.stringify(corpo); // cadastro mudou aqui (endereço, IE): confere e atualiza no Base de novo
        if (cacheCli[k] && cacheCli[k].sig === sig) return cacheCli[k].id;
        const r = await chamar(c, { acao: 'cliente_buscar', cpfCnpj: m.doc });
        if (!r.ok) throw new Error('Cliente: ' + erroBase(r));
        const achado = lista(r.data).find(vivo);
        let id;
        if (achado) {
            id = achado.id;
            // NF-e: o endereço e a inscrição estadual do Base ficam iguais aos daqui (saem na nota)
            if (m.tipo === 'nfe') { const up = await gravarPost(c, { acao: 'cliente_atualizar', id }, { ...corpo, externalReference: achado.externalReference || corpo.externalReference }); if (!up.ok) throw new Error('Cliente: ' + erroBase(up)); }
        } else {
            const cr = await gravarPost(c, { acao: 'cliente_criar' }, corpo);
            if (!(cr.ok && cr.data && cr.data.id)) throw new Error('Cliente: ' + erroBase(cr));
            id = cr.data.id;
        }
        cacheCli[k] = { id: String(id), sig };
        return String(id);
    }
    /** NFC-e sem CPF: o Base pede um cliente em todo pedido. Usa o "CONSUMIDOR FINAL" de lá (ou cria). */
    async function consumidorFinal(c) {
        const k = amb(c) + '|consumidor';
        if (cacheCli[k]) return cacheCli[k];
        let r = await chamar(c, { acao: 'cliente_buscar', ref: 'dp-consumidor-final' });
        let x = r.ok ? lista(r.data).find(vivo) : null;
        if (!x) { r = await chamar(c, { acao: 'cliente_buscar', nome: 'CONSUMIDOR' }); x = r.ok ? lista(r.data).find(y => vivo(y) && /^consumidor(\s+final)?$/i.test(String(y.name || '').trim())) : null; }
        if (!x) {
            const cr = await gravarPost(c, { acao: 'cliente_criar' }, { name: 'CONSUMIDOR FINAL', externalReference: 'dp-consumidor-final', taxInformation: { typeOfTaxPayer: 'NAO_CONTRIBUINTE', finalConsumer: true } });
            if (cr.ok && cr.data && cr.data.id) x = cr.data;
            else throw new Error(`O Base by Asaas pede um cliente em toda nota e não aceitou criar o "CONSUMIDOR FINAL" sem CPF (${erroBase(cr).replace(/^O Base by Asaas recusou: /, '')}). Informe o CPF do consumidor ou cadastre no Base um cliente chamado CONSUMIDOR FINAL.`);
        }
        return (cacheCli[k] = String(x.id));
    }
    /** Banco do Base onde o pagamento da venda fica registrado (o escolhido em Configurações; senão o 1º do Asaas). */
    async function banco(c) {
        if (c.baseBancoId && (c.baseBancoAmbiente || 'homologacao') === amb(c)) return String(c.baseBancoId);
        const k = amb(c) + '|banco';
        if (cacheMisc[k]) return cacheMisc[k];
        let r = await chamar(c, { acao: 'bancos', asaas: '1' });
        let b = r.ok ? lista(r.data)[0] : null;
        if (!b) { r = await chamar(c, { acao: 'bancos' }); b = r.ok ? lista(r.data)[0] : null; }
        if (!b) throw new Error(r.ok ? 'Nenhum banco no Base by Asaas para registrar o pagamento. Cadastre em Financeiro › Bancos (no Base) e escolha em Configurações › Fiscal.' : erroBase(r));
        return (cacheMisc[k] = String(b.id));
    }
    function corpoPedido(m, ids, clienteId, bancoId, ref) {
        const corpo = {
            issueDate: hojeISO(), customerId: Number(clienteId), externalReference: ref, typeOfShipping: 'SEM_FRETE',
            observations: U().txt(m.saleNumber > 0 ? `Venda V-${String(m.saleNumber).padStart(4, '0')} (DistribuiPro)` : 'Venda (DistribuiPro)', 255),
            orderItems: m.linhas.map(l => ({ productId: Number(ids[l.ext]), quantity: l.q, unitPrice: l.unit })),
            orderPayments: m.pagamentos.map(p => ({ ...p, bankId: Number(bancoId) }))
        };
        if (m.desconto > 0) corpo.discountValue = U().reais(m.desconto);
        return corpo;
    }
    async function acharPedido(c, ref) {
        const r = await chamar(c, { acao: 'pedido_buscar', ref });
        if (!r.ok) return null;
        return lista(r.data).find(x => x && String(x.externalReference || '') === ref) || null;
    }

    /* ===================== AVISOS DO BASE (webhook): PDF, XML, série e motivo da recusa ===================== */
    const NOME_AVISO = 'DistribuiPro';
    const EVENTOS = ['INVOICE_NFE_AUTHORIZED', 'INVOICE_NFE_ERROR', 'INVOICE_NFE_CANCELED', 'INVOICE_NFE_CANCELLATION_ERROR'];
    const TIPO_EV = { INVOICE_NFE_AUTHORIZED: 'autorizada', INVOICE_NFE_ERROR: 'erro', INVOICE_NFE_CANCELED: 'cancelada', INVOICE_NFE_CANCELLATION_ERROR: 'erroCancel' };
    const enderecoLocal = h => !/\./.test(h) || /^(localhost|127\.|10\.|192\.168\.|169\.254\.|0\.)/i.test(h) || /^172\.(1[6-9]|2\d|3[01])\./.test(h) || /^\[/.test(h) || /\.(local|localhost|test|lan|internal|home)$/i.test(h);
    /** Endereço que o Base chama quando a nota sai: o api/nfce-proxy.php deste site (só HTTPS e endereço público). */
    function urlAviso(c) {
        const u = U(); if (u.ponte()) return null;
        try {
            const x = new URL(u.proxyUrl(c), location.href);
            if (x.protocol !== 'https:' || enderecoLocal(x.hostname)) return null;
            x.search = ''; x.hash = '';
            x.searchParams.set('provedor', 'base'); x.searchParams.set('acao', 'aviso');
            return x.href;
        } catch (e) { return null; }
    }
    const novoToken = () => { try { return crypto.randomUUID(); } catch (e) { return 'dp' + Date.now().toString(36) + Math.random().toString(36).slice(2); } };
    /** Liga (ou conserta) o aviso "DistribuiPro" no Base. Volta { estado: 'ok'|'offline'|'sem_url'|'erro', id, url, msg }. */
    async function prepararAviso(c) {
        if (U().ponte()) return { estado: 'offline' };
        const url = urlAviso(c);
        const r = await chamar(c, { acao: 'avisos' });
        if (!r.ok) return { estado: 'erro', msg: erroBase(r) };
        const w = lista(r.data).find(x => x && x.name === NOME_AVISO);
        if (!url) { if (w) { cacheMisc[amb(c) + '|aviso'] = String(w.id); return { estado: 'ok', id: String(w.id), url: w.url, deOutroLugar: true }; } return { estado: 'sem_url' }; }
        const corpo = { name: NOME_AVISO, url, enabled: true, interrupted: false, events: EVENTOS, sendType: 'NON_SEQUENTIALLY' };
        const mail = String(c.email || '').trim();
        if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) corpo.email = mail;
        let id;
        if (w) {
            const faltaEv = EVENTOS.some(e => !(Array.isArray(w.events) ? w.events : []).includes(e));
            if (w.url !== url || w.enabled === false || w.interrupted || faltaEv) {
                const up = await gravarPost(c, { acao: 'aviso_atualizar', wid: w.id }, corpo);
                if (!up.ok) return { estado: 'erro', msg: erroBase(up) };
            }
            id = String(w.id);
        } else {
            const cr = await gravarPost(c, { acao: 'aviso_criar' }, { ...corpo, authToken: novoToken() });
            if (!(cr.ok && cr.data && cr.data.id)) return { estado: 'erro', msg: erroBase(cr) };
            id = String(cr.data.id);
        }
        cacheMisc[amb(c) + '|aviso'] = id;
        return { estado: 'ok', id, url };
    }
    async function acharAviso(c) {
        if (U().ponte()) return null;
        if (c.baseAvisoId && (c.baseAvisoAmbiente || 'homologacao') === amb(c)) return String(c.baseAvisoId);
        const k = amb(c) + '|aviso';
        if (cacheMisc[k] !== undefined) return cacheMisc[k];
        const r = await chamar(c, { acao: 'avisos' });
        if (!r.ok) return null; // tenta de novo na próxima
        const w = lista(r.data).find(x => x && x.name === NOME_AVISO);
        return (cacheMisc[k] = w ? String(w.id) : null);
    }
    /** Avisos desta nota (o mais novo de cada tipo): { autorizada, erro, cancelada, erroCancel }. null = sem aviso ligado. */
    async function eventos(c, pedidoId, invoiceId) {
        const wid = await acharAviso(c);
        if (!wid) return null;
        const achou = {};
        for (let pag = 0; pag < 3; pag++) {
            const r = await chamar(c, { acao: 'aviso_eventos', wid, offset: pag * 100, limit: 100 });
            if (!r.ok) break;
            const d = r.data || {};
            lista(d).forEach(req => {
                let ev = null;
                try { ev = typeof req.requestData === 'string' ? JSON.parse(req.requestData) : (req.requestData || null); } catch (e) { }
                if (!ev || typeof ev !== 'object') return;
                const n = ev.invoiceNfe || {};
                const meu = (pedidoId && String(n.salesOrderId || '') === String(pedidoId)) || (invoiceId && String(n.invoiceId || '') === String(invoiceId));
                const tipo = TIPO_EV[ev.event || req.event];
                if (!meu || !tipo) return;
                const quando = String(ev.dateCreated || req.dateCreated || '');
                if (!achou[tipo] || quando > achou[tipo].quando) achou[tipo] = { ...n, quando };
            });
            if (!d.hasMore || achou.autorizada) break;
        }
        return achou;
    }

    /* ===================== RESULTADO GRAVADO NA VENDA ===================== */
    /** Pedido do Base (+ avisos) -> sales/<id>.fiscal. */
    async function montarFiscal(c, d, f0, op) {
        op = op || {};
        const u = U();
        const st0 = String(d.invoiceStatus || '').toUpperCase();
        let st = situacao(st0);
        const f = {
            ...f0, provedor: 'base', ambiente: amb(c), baseStatus: st0 || f0.baseStatus || null,
            invoiceId: d.invoiceId != null && d.invoiceId !== '' ? String(d.invoiceId) : (f0.invoiceId || null),
            numero: d.invoiceNumber != null && d.invoiceNumber !== '' ? String(d.invoiceNumber) : (f0.numero || null),
            atualizadaEm: new Date().toISOString()
        };
        const ev = op.semAvisos ? null : await eventos(c, f.pedidoId, f.invoiceId).catch(() => null);
        const a = ev && ev.autorizada;
        if (a) {
            if (linkOk(a.pdfUrl)) f.danfeUrl = f.pdfUrl = a.pdfUrl;
            if (linkOk(a.xmlUrl)) f.xmlUrl = a.xmlUrl;
            if (a.serie != null && a.serie !== '') f.serie = String(a.serie);
            if (!f.numero && a.number) f.numero = String(a.number);
            if (st === 'processando') st = 'autorizado'; // o aviso chegou antes da consulta
        }
        let motivo = '';
        // Aviso de erro desta tentativa (o da tentativa anterior, já mostrado, não vale depois de "emitir de novo")
        const erroNovo = ev && ev.erro && (!f0.ignorarErroAte || ev.erro.quando > f0.ignorarErroAte);
        if (erroNovo && !['autorizado', 'cancelado', 'cancelando'].includes(st) && (!a || ev.erro.quando > a.quando)) {
            if (st === 'processando') st = 'erro'; // GRAVADA com aviso de erro: a SEFAZ recusou
            motivo = u.txt(ev.erro.errorDetail || '', 400);
            f.erroQuando = ev.erro.quando;
        }
        const cancelNegado = st0 === 'CANCELAMENTO_NEGADO' || !!(ev && ev.erroCancel && f0.status === 'cancelando' && (!ev.cancelada || ev.erroCancel.quando > ev.cancelada.quando));
        // Cancelamento pedido há pouco e o Base ainda não mexeu na nota: continua "cancelando"
        const pedidoCancelEm = Date.parse(f0.cancelPedidoEm || '') || 0;
        if (f0.status === 'cancelando' && st === 'autorizado' && !cancelNegado && Date.now() - pedidoCancelEm < 15 * 60000) st = 'cancelando';
        if (st === 'autorizado') {
            Object.assign(f, { status: 'autorizado', autorizadaEm: f0.autorizadaEm || new Date().toISOString(), error: null });
            if (cancelNegado) f.error = 'O cancelamento não foi aceito: ' + (ev && ev.erroCancel && ev.erroCancel.errorDetail ? u.txt(ev.erroCancel.errorDetail, 400) : 'veja o motivo no Base by Asaas (Faturamento › Notas fiscais).');
            f.aviso = st0 === 'CONTIGENCIA' ? 'Nota emitida em contingência: o Base manda para a SEFAZ quando ela voltar.' : null;
        } else if (st === 'cancelado') {
            Object.assign(f, { status: 'cancelado', canceladaEm: f0.canceladaEm || new Date().toISOString(), error: null, aviso: null });
        } else if (st === 'cancelando') {
            f.status = 'cancelando';
        } else if (st === 'erro' || st === 'denegado') {
            f.status = st;
            f.error = motivo ? 'A SEFAZ recusou: ' + motivo
                : `${TEXTO_ST[st0] ? 'No Base: ' + TEXTO_ST[st0] : 'A nota não saiu'}. Veja o motivo no Base by Asaas (Faturamento › Notas fiscais), corrija e emita de novo.`;
            f.aviso = null;
        } else {
            f.status = 'processando'; f.error = null;
            const desde = Date.parse(f.enviadaEm || '') || 0;
            f.aviso = desde && Date.now() - desde > 3 * 60000
                ? 'O Base ainda não confirmou a nota. Se continuar assim, veja no painel do Base (Faturamento › Notas fiscais): ela pode ter sido recusada.' : null;
        }
        return f;
    }
    async function gravar(saleId, f) {
        const limpo = {};
        Object.keys(f).forEach(k => { if (f[k] !== undefined) limpo[k] = f[k]; });
        await U().salvarStatusFiscal(saleId, limpo);
    }
    const gerarRef = (saleId, seq, tipo) => `dp-${tipo === 'nfe' ? 'nfe' : 'nfce'}-${String(saleId || 'sem').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 80)}-${Math.max(1, Number(seq) || 1)}`;

    /* ===================== API PÚBLICA ===================== */
    /**
     * NFC-e ou NF-e da venda pelo Base. op = { tipo, cliente, doc }. Mesma resposta do NFCeService.emitirNota:
     * { ok, status, numero, serie, danfeUrl, error, ... }. Nunca cria uma 2ª nota para a mesma venda.
     */
    async function emitir(sale, saleId, op) {
        op = op || {};
        const tipo = op.tipo === 'nfe' ? 'nfe' : 'nfce', nome = NOME[tipo];
        let ref = null;
        try {
            const u = U();
            const c = await config();
            const gravada = await u.lerVenda(saleId);
            const ant = (gravada && gravada.fiscal) || (sale && sale.fiscal) || null;
            const antTipo = ant ? (ant.tipo === 'nfe' ? 'nfe' : 'nfce') : null;
            const umaSo = n => `Esta venda já tem ${NOME[antTipo]} autorizada${ant.provedor !== 'base' ? ' pela Focus NFe' : ''} (nº ${n || '?'}). Uma venda leva uma nota de mercadoria só: cancele a outra antes.`;
            // Nota que já saiu pela Focus (antes de trocar para o Base)
            if (ant && ant.provedor !== 'base' && ant.status === 'autorizado') return { ok: false, error: umaSo(ant.numero) };
            if (ant && ant.provedor !== 'base' && ant.status === 'processando') return window.NFCeService.atualizarVenda(saleId, { fiscal: ant });
            // Nota do Base autorizada ou a caminho: consulta a mesma (clique duplo, outra aba, resposta perdida)
            if (ant && ant.provedor === 'base' && ['autorizado', 'processando', 'cancelando'].includes(ant.status)) {
                const r = await atualizar(saleId, ant, c);
                if (r.semResposta) return r;
                if (r.status === 'autorizado') return antTipo === tipo ? { ...r, ok: true, jaExistia: true } : { ...r, ok: false, error: umaSo(r.numero) };
                if (r.status === 'processando' || r.status === 'cancelando') return { ...r, ok: true, message: `${NOME[antTipo]} em andamento no Base. Confira em instantes (Atualizar).` };
            }
            if (window.DPFiscal && DPFiscal.fill) await DPFiscal.fill(sale.items || []);
            const prods = await window.NFCeService.carregarProdutos(sale.items || [], { fresco: true });
            const m = montar(sale, c, { tipo, prods, cliente: op.cliente, doc: op.doc });
            // Nota recusada: o mesmo pedido é reaproveitado (reemitir) quando nada mudou; senão, pedido novo (n + 1)
            const antBase = ant && ant.provedor === 'base' ? ant : null;
            const mesmo = !!(antBase && antBase.pedidoId && antTipo === tipo && (antBase.doc || '') === m.doc && antBase.status === 'erro' && Math.abs((Number(antBase.valor) || 0) - m.total) < 0.005);
            let seq = antBase ? (Number(antBase.seq) || 1) + (mesmo ? 0 : 1) : 1;
            ref = gerarRef(saleId, seq, tipo);
            // Os produtos sempre conferidos (o erro pode ter sido o NCM, corrigido aqui no cadastro)
            const ids = await produtosNoBase(c, m.linhas);
            let pedidoId = mesmo ? String(antBase.pedidoId) : null, r = null;
            const pedirNota = id => gravarPost(c, { acao: 'nota_emitir', id }, { type: tipo === 'nfe' ? '55' : '65' });
            if (mesmo) {
                const ped = await chamar(c, { acao: 'pedido_consultar', id: pedidoId });
                if (ped.ok && ped.data && ped.data.id) {
                    if (situacao(ped.data.invoiceStatus) === 'autorizado') r = { ok: true, status: 200, data: ped.data };
                    else r = ped.data.invoiceId ? await gravarPost(c, { acao: 'nota_reemitir', id: pedidoId }, {}) : await pedirNota(pedidoId);
                } else if (ped.status === 404) { pedidoId = null; seq += 1; ref = gerarRef(saleId, seq, tipo); }
                else throw new Error(erroBase(ped));
            }
            if (!pedidoId) {
                // Pedido anterior sem nota nenhuma: sai do Base (não deixa pedido solto lá)
                if (antBase && antBase.pedidoId && !antBase.invoiceId) { try { await gravarPost(c, { acao: 'pedido_remover', id: antBase.pedidoId }, {}); } catch (e) { } }
                const [clienteId, bancoId] = await Promise.all([clienteNoBase(c, m), banco(c)]);
                let ped = await acharPedido(c, ref);
                if (!ped) {
                    const cr = await chamar(c, { acao: 'pedido_criar', idem: ref }, { method: 'POST', body: corpoPedido(m, ids, clienteId, bancoId, ref) });
                    if (cr.ok && cr.data && cr.data.id) ped = cr.data;
                    else {
                        ped = await acharPedido(c, ref).catch(() => null); // resposta perdida ou o mesmo pedido em andamento
                        if (!ped) throw new Error(cr.status === 0 ? 'Sem resposta do Base by Asaas ao criar o pedido. Confira a internet e tente de novo.' : erroBase(cr));
                    }
                }
                pedidoId = String(ped.id);
                await gravar(saleId, { tipo, provedor: 'base', ref, seq, valor: m.total, doc: m.doc, ambiente: amb(c), pedidoId, status: 'processando', enviadaEm: new Date().toISOString(), dataEmissao: u.agoraServidor() });
                if (ped.invoiceId && situacao(ped.invoiceStatus) !== 'erro') r = { ok: true, status: 200, data: ped };
                else r = ped.invoiceId ? await gravarPost(c, { acao: 'nota_reemitir', id: pedidoId }, {}) : await pedirNota(pedidoId);
            }
            const base = { tipo, provedor: 'base', ref, seq, valor: m.total, doc: m.doc, ambiente: amb(c), pedidoId, enviadaEm: new Date().toISOString(), dataEmissao: u.agoraServidor() };
            if (mesmo && pedidoId) base.ignorarErroAte = antBase.erroQuando || antBase.ignorarErroAte || null; // o erro antigo do mesmo pedido
            if (r.status === 0) {
                // Sem resposta: a nota pode ter sido pedida. Fica "processando" (Atualizar consulta o mesmo pedido)
                const f = { ...base, status: 'processando', error: null };
                await gravar(saleId, f);
                return { ok: false, ...f, error: erroBase(r) + ' Confira em instantes se a nota saiu (Atualizar).' };
            }
            if (!r.ok) {
                const f = { ...base, status: 'erro', error: erroBase(r), dataTentativa: u.agoraServidor() };
                await gravar(saleId, f);
                return { ok: false, ...f };
            }
            let d = { id: pedidoId, ...(r.data || {}) };
            // A nota sai assíncrona no Base: consulta o pedido por até ~25 segundos
            for (let i = 0; i < 12 && situacao(d.invoiceStatus) === 'processando'; i++) {
                await dormir(i < 4 ? 1500 : 2500);
                const p = await chamar(c, { acao: 'pedido_consultar', id: pedidoId });
                if (p.ok && p.data) d = p.data;
            }
            let f = await montarFiscal(c, d, base);
            // O aviso com o PDF chega alguns segundos depois da autorização (versões web com o aviso ligado)
            if (f.status === 'autorizado' && !f.danfeUrl && await acharAviso(c).catch(() => null)) {
                for (let i = 0; i < 3 && !f.danfeUrl; i++) { await dormir(2000); f = await montarFiscal(c, d, f); }
            }
            await gravar(saleId, f);
            if (f.status === 'autorizado') return { ok: true, ...f, avisos: m.avisos };
            if (f.status === 'processando') return { ok: true, ...f, message: `${nome} enviada ao Base: a SEFAZ ainda não respondeu. Confira em instantes (Atualizar).` };
            return { ok: false, ...f };
        } catch (e) {
            console.error('[Base] erro:', e);
            return { ok: false, ref, provedor: 'base', error: e.message || String(e) };
        }
    }

    /** Consulta o pedido da nota no Base (e os avisos) e grava (Atualizar). */
    async function atualizar(saleId, f0, c0) {
        try {
            const c = c0 || await config();
            if (!f0 || !f0.pedidoId) return { ok: false, ...(f0 || {}), error: (f0 && f0.error) || 'A nota não chegou a ser pedida ao Base by Asaas. Emita de novo.' };
            const p = await chamar(c, { acao: 'pedido_consultar', id: f0.pedidoId });
            if (!p.ok || !p.data) {
                if (p.status === 404) {
                    const f = { ...f0, status: 'erro', error: 'O pedido desta nota não existe mais no Base by Asaas (foi removido lá). Pode emitir de novo.' };
                    await gravar(saleId, f);
                    return { ok: false, ...f };
                }
                return { ok: false, ...f0, semResposta: true, error: erroBase(p) };
            }
            const f = await montarFiscal(c, p.data, f0);
            await gravar(saleId, f);
            return { ok: ['autorizado', 'processando', 'cancelado', 'cancelando'].includes(f.status), ...f };
        } catch (e) { return { ok: false, ...(f0 || {}), semResposta: true, error: e.message || String(e) }; }
    }

    /** Cancela a nota da venda no Base (a SEFAZ aceita a NFC-e em geral até 30 minutos e a NF-e até 24 horas). */
    async function cancelar(saleId, f0, motivo) {
        try {
            const c = await config();
            const j = U().txt(motivo, 255);
            if (j.length < 15) return { ok: false, error: 'Justificativa precisa ter pelo menos 15 caracteres.' };
            if (!f0 || !f0.pedidoId) return { ok: false, error: 'Esta nota não tem o pedido do Base gravado: cancele pelo painel do Base.' };
            const r = await gravarPost(c, { acao: 'nota_cancelar', id: f0.pedidoId }, { reason: j });
            if (!r.ok) return { ok: false, error: erroBase(r) };
            const fc = { ...f0, status: 'cancelando', motivoCancelamento: j, cancelPedidoEm: new Date().toISOString(), error: null };
            let f = fc;
            for (let i = 0; i < 6; i++) {
                await dormir(i < 2 ? 1500 : 2500);
                const p = await chamar(c, { acao: 'pedido_consultar', id: f0.pedidoId });
                if (!(p.ok && p.data)) continue;
                const s0 = String(p.data.invoiceStatus || '').toUpperCase();
                if (s0 === 'CANCELADA' || s0 === 'CANCELAMENTO_NEGADO') { f = await montarFiscal(c, p.data, fc); break; }
            }
            await gravar(saleId, f);
            if (f.status === 'cancelado' || f.status === 'cancelando') return { ok: true, ...f };
            return { ok: false, ...f, error: f.error || 'A SEFAZ não aceitou o cancelamento.' };
        } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }

    /** Link do PDF (DANFE) da nota: o gravado ou o do aviso do Base. null = ainda não veio (ou Windows Offline). */
    async function linkPdf(f) {
        if (f && linkOk(f.danfeUrl || f.pdfUrl)) return f.danfeUrl || f.pdfUrl;
        const c = await config();
        const ev = await eventos(c, f && f.pedidoId, f && f.invoiceId).catch(() => null);
        return ev && ev.autorizada && linkOk(ev.autorizada.pdfUrl) ? ev.autorizada.pdfUrl : null;
    }
    /** XML da nota (para o contador). null = não veio (sem o aviso ligado: fica no painel do Base). */
    async function xml(f) {
        const c = await config();
        let url = f && linkOk(f.xmlUrl) ? f.xmlUrl : null;
        if (!url) { const ev = await eventos(c, f && f.pedidoId, f && f.invoiceId).catch(() => null); url = ev && ev.autorizada && linkOk(ev.autorizada.xmlUrl) ? ev.autorizada.xmlUrl : null; }
        if (!url) return null;
        const r = await chamar(c, { acao: 'arquivo', url });
        const t = r && r.ok ? String(r.text || '') : '';
        return /^\s*(<\?xml|<)/.test(t) ? t : null;
    }

    /** "Testar conexão" de Configurações › Fiscal (dados da tela, ainda não salvos): bancos do Base e o aviso. */
    async function testar(g) {
        const u = U();
        const c = { ...g, _baseChave: u.chaveBase(g) };
        if (!c._baseChave) return { ok: false, error: `Informe a chave de API do Base by Asaas (${amb(g) === 'producao' ? 'produção' : 'sandbox'}).` };
        limparCache();
        const r = await chamar(c, { acao: 'bancos' });
        if (!r.ok) return { ok: false, error: erroBase(r) };
        const bancos = lista(r.data).filter(Boolean).map(b => ({ id: String(b.id), nome: [b.name, b.code ? '(' + b.code + ')' : '', b.agency ? 'ag. ' + b.agency : '', b.account ? 'conta ' + b.account : ''].filter(Boolean).join(' ') }));
        const aviso = await prepararAviso(c).catch(e => ({ estado: 'erro', msg: e.message || String(e) }));
        return { ok: true, bancos, aviso, ambiente: amb(c) };
    }

    window.DPNotasBase = {
        emitir, atualizar, cancelar, linkPdf, xml, testar, prepararAviso, eventos, situacao, montar, erroBase, limparCache,
        _interno: { corpoPedido, corpoCliente, pagamentos, urlAviso, montarFiscal, gerarRef, gtin }
    };
})();
