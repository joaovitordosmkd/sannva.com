/* DistribuiPro 39.7 · NOTA FISCAL NAS VERSÕES VITALÍCIAS (Firebase, MySQL e Windows Offline) — window.DPNotas
   A nota sai pela conta do próprio cliente, no provedor que ele escolhe em Configurações › Fiscal:
   - Focus NFe: NFC-e (cupom do PDV), NF-e (pedido para empresa) e NFS-e (serviço/OS; padrão Nacional ou da prefeitura).
   - Asaas: a NFS-e pela API da conta Asaas.
   - 39.10 · Base by Asaas (o ERP do Asaas): NFC-e e NF-e (notas-base-v1.js). Configurações › Fiscal tem duas escolhas:
     "a nota de produto sai pelo" (Focus NFe, Base by Asaas ou nenhuma: settings/general.notaProdutoProvedor) e "a nota de
     serviço sai pelo" (Focus NFe, Asaas ou nenhuma). Sem a escolha da nota de produto gravada: como na 39.9.
   As chamadas passam pelo NFCeService.util.chamar (api/nfce-proxy.php nas versões web; desktop/main.js no Offline).
   Telas: Configurações › Fiscal (provedor, chave do Asaas, dados da NFS-e, "Testar conexão"), PDV (nota de serviço depois
   da venda que tem serviço), Pedidos (quadro "Nota fiscal" da venda: emitir, atualizar, DANFE/PDF, XML, cancelar; NF-e
   para empresa; aviso ao cancelar/excluir venda com nota), Ordens de serviço (botão da NFS-e na OS faturada e oferta logo
   depois de faturar) e Contas a receber (nota da venda ou NFS-e da própria conta).
   Gravação: sales/<id>.fiscal (NFC-e/NF-e, pelo nfce-service.js) e <origem>.fiscalNfse (sales, service_orders, financial_entries).
   A chave do Asaas e o token da Focus só aparecem em Configurações (tela do administrador); nunca vão para a tela de quem vende. */
(function () {
    'use strict';
    if (window.DPNotas) return;
    const U = () => (window.NFCeService && window.NFCeService.util) || null;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const dig = v => String(v ?? '').replace(/\D/g, '');
    const num = v => { const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.')); return isFinite(n) ? n : 0; };
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const eu = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } }; // currentUser é "let" do app.js
    const ehAdmin = () => eu().role === 'admin';
    const podeCancelar = () => ['admin', 'manager'].includes(eu().role) || !!(eu().permissions && eu().permissions.cancelSales);
    const dormir = ms => new Promise(r => setTimeout(r, ms));
    const pad4 = n => String(Number(n) || 0).padStart(4, '0');
    const hojeISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    const pagina = () => (location.pathname.split('/').pop() || 'index.html');
    const limpaId = v => String(v || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60);
    const COLECAO = { venda: 'sales', os: 'service_orders', receber: 'financial_entries' };
    const NOME_PROV = { focus: 'Focus NFe', asaas: 'Asaas', base: 'Base by Asaas' };
    const B = () => window.DPNotasBase || null; // 39.10 · motor do Base by Asaas (notas-base-v1.js)
    const ST = {
        autorizado: ['Autorizada', '#10b981'], processando: ['Processando', '#f59e0b'], cancelando: ['Cancelando', '#f59e0b'],
        erro: ['Não saiu', '#ef4444'], denegado: ['Denegada', '#ef4444'], cancelado: ['Cancelada', '#64748b']
    };
    const chip = st => { const x = ST[st] || [st || '—', '#64748b']; return `<span class="dpn-chip" style="background:${x[1]}22;color:${x[1]}">${esc(x[0])}</span>`; };
    /** Aviso da demonstração (nota simulada e o valor das integrações); fora da demo, nada. */
    const avisoDemo = () => {
        return '';
    };

    /* ===================== CONFIGURAÇÃO ===================== */
    let cfgCache = null, cfgEm = 0;
    async function cfg(forcar) {
        if (!forcar && cfgCache && Date.now() - cfgEm < 20000) return cfgCache;
        const u = U();
        const g = (u ? await u.lerGeral().catch(() => null) : null) || {};
        const prod = g.ambienteSefaz === 'producao';
        const c = {
            geral: g, ligado: !!g.emitirNFe, producao: prod, ambiente: prod ? 'producao' : 'homologacao',
            focusToken: u ? u.tokenFocus(g) : '',
            temCaminho: !!(u && (u.ponte() || u.proxyUrl(g))),
            servico: ['focus', 'asaas', 'nenhum', 'dp'].includes(g.notaServicoProvedor) ? g.notaServicoProvedor : 'focus', // 41.1 · 'dp' = Nota fiscal DistribuiPro
            asaasChave: String((prod ? g.asaasChaveProducao : g.asaasChaveSandbox) || '').trim(),
            crt: parseInt(g.regimeTributario || 1, 10) || 1,
            nfse: {
                padrao: g.nfsePadrao === 'municipal' ? 'municipal' : 'nacional',
                ibge: dig(g.codigoMunicipio), aliquota: num(g.nfseAliquota), retido: g.nfseIssRetido === true,
                codNacional: dig(g.nfseCodigoNacional), itemLista: String(g.nfseItemLista || '').trim(),
                codMunicipal: String(g.nfseCodigoMunicipal || '').trim(), cnae: dig(g.nfseCnae), texto: String(g.nfseTextoPadrao || '').trim(),
                // 40.37 · NFS-e Nacional no modelo da reforma tributária (obrigatório desde 10/2026): NBS, IBS/CBS e tributos aproximados
                nbs: dig(g.nfseNbs), indOp: dig(g.nfseIndOp) || '100301', ibsCst: dig(g.nfseIbsCbsCst) || '000', ibsClass: dig(g.nfseIbsCbsClass) || '000001',
                totFed: num(g.nfseTotTribFed), totEst: num(g.nfseTotTribEst), totMun: num(g.nfseTotTribMun),
                asaasId: String(g.asaasServicoId || '').trim(), asaasNome: String(g.asaasServicoNome || '').trim(), asaasCodigo: String(g.asaasServicoCodigo || '').trim()
            }
        };
        // 39.10 · Quem emite a nota de produto (NFC-e/NF-e): Focus NFe, Base by Asaas ou nenhum. Sem a escolha gravada (39.9):
        // a Focus quando ela emite a NFS-e ou com "Também emitir pela Focus"; configuração antiga com o Asaas: vale o token.
        c.produto = ['focus', 'base', 'nenhum', 'dp'].includes(g.notaProdutoProvedor) ? g.notaProdutoProvedor
            : (c.servico === 'focus' || g.focusProduto === true || (g.focusProduto === undefined && !!c.focusToken)) ? 'focus' : 'nenhum';
        c.usaFocus = c.servico === 'focus' || c.produto === 'focus';
        c.baseChave = String((prod ? g.baseChaveProducao : g.baseChaveSandbox) || '').trim();
        c.focusOk = c.ligado && c.temCaminho && !!c.focusToken && c.produto === 'focus';
        c.baseOk = c.ligado && c.temCaminho && !!c.baseChave && c.produto === 'base' && !!B();
        // 41.1 · Nota fiscal DistribuiPro (nota-propria-dp-v1.js): só a chave de ligação; a empresa e o ambiente ficam no painel da API
        c.dpChave = String(g.dpNotaChave || '').trim();
        c.dpOk = c.ligado && !!c.dpChave && c.produto === 'dp' && !!window.DPNotasDP;
        c.produtoOk = c.focusOk || c.baseOk || c.dpOk;
        c.nomeProduto = c.produto === 'dp' ? 'Nota fiscal DistribuiPro' : c.produto === 'base' ? 'Base by Asaas' : 'Focus NFe';
        c.servicoFalta = faltaServico(c);
        c.servicoOk = c.ligado && c.servico !== 'nenhum' && !c.servicoFalta.length;
        cfgCache = c; cfgEm = Date.now();
        return c;
    }
    function faltaServico(c) {
        const f = [], g = c.geral, u = U();
        if (!u) return ['o arquivo nfce-service.js (recarregue a página)'];
        if (!c.ligado) return ['ligar "Habilitar emissão fiscal" em Configurações › Fiscal'];
        if (c.servico === 'nenhum') return ['escolher quem emite a nota de serviço em Configurações › Fiscal'];
        if (c.servico === 'dp') {
            // 41.1 · A DistribuiPro confere o resto (empresa, inscrição municipal, certificado) e devolve o que faltar
            if (!c.dpChave) f.push('a chave de ligação da nota fiscal DistribuiPro (Configurações › Empresa)');
            if (!window.DPNotasDP) f.push('o arquivo da nota fiscal DistribuiPro (recarregue a página)');
            if (c.nfse.codNacional.length !== 6) f.push('o código de tributação nacional do serviço (6 números), em Configurações › Empresa › Nota fiscal DistribuiPro');
            return f;
        }
        if (!c.temCaminho) f.push('o endereço do proxy da nota (Configurações › Fiscal)');
        if (c.servico === 'asaas') {
            if (!c.asaasChave) f.push(`a chave de API do Asaas (${c.producao ? 'produção' : 'sandbox'})`);
            if (!c.nfse.asaasId && !c.nfse.asaasCodigo) f.push('o serviço da prefeitura no Asaas (botão "Buscar serviço")');
            if (!c.nfse.asaasNome) f.push('o nome do serviço da prefeitura');
        } else {
            if (!c.focusToken) f.push(`o token de ${c.producao ? 'produção' : 'homologação'} da Focus NFe`);
            if (u.docLimpo(g.cnpj).length !== 14) f.push('o CNPJ da empresa (Configurações › Empresa)');
            if (c.nfse.ibge.length !== 7) f.push('o código IBGE da cidade da empresa');
            if (c.nfse.padrao === 'nacional') {
                if (c.nfse.codNacional.length !== 6) f.push('o código de tributação nacional do serviço (6 números)');
                // 40.37 · o modelo novo da NFS-e Nacional recusa a nota sem estes (erro de schema "Expected is IM / cTribMun")
                if (!String(g.inscricaoMunicipal || '').trim()) f.push('a inscrição municipal da empresa (Configurações › Empresa)');
                const cm = dig(c.nfse.codMunicipal); if (!cm || cm.length > 3) f.push('o código de tributação municipal do serviço (até 3 números, ex.: 001)');
                if (c.nfse.nbs.length !== 9) f.push('o código NBS do serviço (9 números)');
            }
            else {
                if (!c.nfse.itemLista) f.push('o item da lista de serviços (LC 116)');
                if (!String(g.inscricaoMunicipal || '').trim()) f.push('a inscrição municipal da empresa (Configurações › Empresa)');
            }
        }
        return f;
    }
    const cfgFocus = c => ({ ...c.geral, _token: c.focusToken });
    const cfgAsaas = c => ({ ...c.geral, _asaasChave: c.asaasChave });
    /** Por que a nota de produto (NFC-e/NF-e) não pode sair agora, em português. */
    const porqueSemProduto = c => !c.ligado ? 'A emissão de nota fiscal está desligada (Configurações › Fiscal).'
        : c.produto === 'nenhum' ? 'A nota de produto (NFC-e e NF-e) está desligada: escolha a Focus NFe ou o Base by Asaas em Configurações › Fiscal.'
        : c.produto === 'dp' ? (!window.DPNotasDP ? 'Recarregue a página (o arquivo da nota fiscal DistribuiPro não carregou).' : 'Falta a chave de ligação da nota fiscal DistribuiPro (Configurações › Empresa).')
        : !c.temCaminho ? 'Falta o endereço do proxy da nota (Configurações › Fiscal).'
        : c.produto === 'base' ? (!B() ? 'Recarregue a página (o arquivo do Base by Asaas não carregou).' : `Falta a chave de API do Base by Asaas (${c.producao ? 'produção' : 'sandbox'}) em Configurações › Fiscal.`)
        : `Falta o token de ${c.producao ? 'produção' : 'homologação'} da Focus NFe em Configurações › Fiscal.`;
    /** Abre o PDF (DANFE) da nota de produto. Do Base sem o link ainda: busca no aviso do Base (a janela abre no clique). */
    function abrirDanfe(f, depois) {
        if (f.provedor !== 'base' || f.danfeUrl || f.pdfUrl || !B() || (U() && U().ponte())) return window.NFCeService.abrirDocumento(f, 'danfe');
        let w = null; try { w = window.open('about:blank', '_blank'); } catch (e) { }
        B().linkPdf(f).then(url => {
            if (url && w) { try { w.opener = null; } catch (e) { } w.location.href = url; }
            else if (url) abrirLink(url);
            else { if (w) w.close(); toast('warning', 'O PDF desta nota ainda não chegou do Base. Clique em Atualizar daqui a pouco.'); }
            if (url && typeof depois === 'function') depois();
        }).catch(e => { if (w) w.close(); toast('warning', e.message || String(e)); });
    }

    /* ===================== ERROS EM PORTUGUÊS ===================== */
    function erroAsaas(r) {
        const d = (r && r.data) || {};
        const lista = Array.isArray(d.errors) ? d.errors : [];
        const cods = lista.map(e => String(e.code || ''));
        const txt = lista.map(e => e.description || e.code).filter(Boolean).join('; ');
        const st = r ? r.status : 0;
        if (st === 0) return d.erro || 'Sem conexão com a internet ou o servidor da nota não respondeu.';
        if (cods.includes('invalid_environment')) return 'Esta chave do Asaas é de outro ambiente: a chave de sandbox (teste) começa com $aact_hmlg_ e a de produção com $aact_prod_. Confira o ambiente em Configurações › Fiscal.';
        if (st === 401) return 'O Asaas recusou a chave de API. Copie a chave de novo no painel do Asaas (Integrações › Chaves de API) e salve em Configurações › Fiscal.' + (txt ? ' (' + txt + ')' : '');
        if (st === 403) return 'O Asaas bloqueou o acesso' + (txt ? ': ' + txt : ' (confira se a conta tem restrição de IP para a API).');
        if (st === 404 && !txt) return 'O Asaas não encontrou o que foi pedido (nota, cliente ou configuração fiscal).';
        if (st === 429) return 'Muitas chamadas ao Asaas em pouco tempo. Espere 1 minuto e tente de novo.';
        if (st === 404 && d._raw !== undefined && !lista.length) return 'O arquivo nfce-proxy.php não foi encontrado no servidor. Confira o endereço do proxy em Configurações › Fiscal.';
        if (txt) return 'O Asaas recusou: ' + txt;
        return d.mensagem || d.erro || `Falha ao falar com o Asaas (${st}).`;
    }
    const erroFocus = r => (U() ? U().erroTexto(r) : 'Falha ao falar com a Focus NFe.');

    /* ===================== DADOS DA ORIGEM ===================== */
    async function lerDoc(col, id) {
        if (!id) return null;
        try { const d = await db.collection(col).doc(String(id)).get(); return d.exists ? { id: String(id), ...d.data() } : null; } catch (e) { return null; }
    }
    async function lerCliente(id) { return id ? lerDoc('customers', id) : null; }
    /** Venda que veio de uma OS: a nota de serviço é da OS (espelho na venda). */
    const origemDaVenda = s => s && (s.serviceOrderId && (s.source === 'service_order' || s.type === 'service_order'))
        ? { tipo: 'os', id: String(s.serviceOrderId), saleId: s.id } : { tipo: 'venda', id: s.id };

    async function gravarNfse(origem, f) {
        const limpo = JSON.parse(JSON.stringify(f, (k, v) => v === undefined ? null : v));
        await db.collection(COLECAO[origem.tipo]).doc(origem.id).update({ fiscalNfse: limpo });
        if (origem.tipo === 'os' && origem.saleId) { try { await db.collection('sales').doc(origem.saleId).update({ fiscalNfse: limpo }); } catch (e) { console.warn('NFS-e na venda da OS:', e); } }
        if (origem.tipo === 'venda' && origem.osId) { try { await db.collection('service_orders').doc(origem.osId).update({ fiscalNfse: limpo }); } catch (e) { } }
    }

    /** Valor (centavos) e descrição dos SERVIÇOS de uma venda (o desconto geral e o acréscimo do cartão na proporção). */
    function servicoDaVenda(s, prods) {
        const u = U();
        let somaTodos = 0, somaServ = 0; const nomes = [];
        (s.items || []).forEach(it => {
            if (!it) return;
            const liq = Math.max(0, u.cent(it.total ?? (num(it.unitPrice) * num(it.quantity))));
            somaTodos += liq;
            const p = it.productId ? prods[String(it.productId)] : null;
            if (u.itemPacote(it, p) || !u.itemServico(it, p) || liq <= 0) return;
            somaServ += liq;
            nomes.push(`${num(it.quantity) !== 1 ? num(it.quantity).toLocaleString('pt-BR') + 'x ' : ''}${it.productName || 'Serviço'}`);
        });
        const desc = Math.min(somaTodos, Math.max(0, u.cent(s.discount || 0)));
        const acres = Math.max(0, u.cent(s.cardSurcharge || 0));
        const parte = v => somaTodos > 0 ? Math.round(v * somaServ / somaTodos) : 0;
        const valor = Math.max(0, somaServ - parte(desc) + parte(acres));
        return { valor, pecas: 0, descricao: nomes.length ? `${nomes.join('; ')}. Venda V-${pad4(s.saleNumber)}.` : '' };
    }
    /** Mão de obra (serviço) e peças da OS, já com o desconto dividido entre os dois. */
    function servicoDaOs(o) {
        const u = U();
        const its = Array.isArray(o.items) ? o.items : [];
        let serv = 0, pecas = 0; const nomes = [];
        if (its.length) its.forEach(i => { const v = u.cent((num(i.qty) || 1) * num(i.price)); if (i.kind === 'service') { serv += v; nomes.push(i.name || i.description || 'Serviço'); } else pecas += v; });
        else { serv = u.cent(o.laborValue); pecas = u.cent(o.partsValue); }
        const bruto = serv + pecas, total = Math.max(0, u.cent(o.total));
        const desc = Math.max(0, bruto - total);
        const servLiq = bruto > 0 ? Math.max(0, serv - Math.round(desc * serv / bruto)) : total;
        const aparelho = [o.deviceType, o.brand, o.model].filter(Boolean).join(' ');
        const oQue = o.serviceDescription || (nomes.length ? nomes.join('; ') : '') || o.diagnosis || o.problemReported || 'Serviço';
        return { valor: servLiq, pecas: Math.max(0, total - servLiq), descricao: `${oQue}${aparelho ? '. Equipamento: ' + aparelho : ''}. OS #${pad4(o.orderNumber)}.` };
    }

    /** Tudo que a janela da NFS-e precisa sobre a origem. */
    async function carregarOrigem(origem) {
        const u = U();
        if (origem.tipo === 'venda') {
            const s = await lerDoc('sales', origem.id); if (!s) throw new Error('Venda não encontrada.');
            if (s.serviceOrderId && (s.source === 'service_order' || s.type === 'service_order')) return carregarOrigem({ tipo: 'os', id: String(s.serviceOrderId), saleId: s.id });
            const prods = await window.NFCeService.carregarProdutos(s.items || []);
            const sv = servicoDaVenda(s, prods);
            return { origem, doc: s, titulo: `Venda V-${pad4(s.saleNumber)}`, clienteId: s.customerId || '', nomeCli: s.customerName || '', docCli: s.customerCpfCnpj || '', ...sv, ant: s.fiscalNfse || null, cancelada: s.status === 'cancelled' };
        }
        if (origem.tipo === 'os') {
            const o = await lerDoc('service_orders', origem.id); if (!o) throw new Error('Ordem de serviço não encontrada.');
            const sv = servicoDaOs(o);
            return { origem: { tipo: 'os', id: o.id, saleId: origem.saleId || o.saleId || '' }, doc: o, titulo: `OS #${pad4(o.orderNumber)}`, clienteId: o.customerId || '', nomeCli: o.customerName || '', docCli: '', ...sv, ant: o.fiscalNfse || null, cancelada: o.status === 'cancelled' };
        }
        const r = await lerDoc('financial_entries', origem.id); if (!r) throw new Error('Conta a receber não encontrada.');
        return { origem, doc: r, titulo: r.description || 'Conta a receber', clienteId: r.customerId || '', nomeCli: r.customerName || r.debtorName || '', docCli: r.debtorDoc || '', valor: u.cent(r.amount), pecas: 0, descricao: r.description || r.category || 'Serviço prestado', ant: r.fiscalNfse || null, cancelada: r.status === 'cancelled' || r.deleted === true };
    }

    /* ===================== IBGE PELO CEP ===================== */
    const ibgeCache = {};
    async function ibgeDoCep(cep) {
        cep = dig(cep); if (cep.length !== 8) return '';
        if (ibgeCache[cep] !== undefined) return ibgeCache[cep];
        try { const r = await fetch(`https://viacep.com.br/ws/${cep}/json/`); const d = await r.json(); ibgeCache[cep] = d && !d.erro ? dig(d.ibge) : ''; }
        catch (e) { ibgeCache[cep] = ''; }
        return ibgeCache[cep];
    }

    /* ===================== NFS-e · ASAAS ===================== */
    const ASAAS_ST = { AUTHORIZED: 'autorizado', SCHEDULED: 'processando', PROCESSING_CANCELLATION: 'cancelando', CANCELED: 'cancelado', CANCELLATION_DENIED: 'autorizado', ERROR: 'erro' };
    function fiscalAsaas(inv, base, c) {
        const st = ASAAS_ST[inv.status] || 'processando';
        return {
            ...base, tipo: 'nfse', provedor: 'asaas', asaasId: inv.id || base.asaasId || null, ref: inv.externalReference || base.ref || null,
            status: st, statusProvedor: inv.status || null, numero: inv.number || null, rps: inv.rpsNumber || null,
            codigoVerificacao: inv.validationCode || null, pdfUrl: inv.pdfUrl || null, xmlUrl: inv.xmlUrl || null,
            valor: inv.value != null ? Number(inv.value) : (base.valor ?? null), ambiente: c.ambiente,
            error: st === 'erro' ? (inv.statusDescription || 'O Asaas não emitiu a nota (sem motivo informado). Confira a configuração fiscal no painel do Asaas.') : null,
            aviso: inv.status === 'CANCELLATION_DENIED' ? ('A prefeitura não aceitou o cancelamento' + (inv.statusDescription ? ': ' + inv.statusDescription : '.')) : null,
            atualizadaEm: new Date().toISOString()
        };
    }
    async function asaasEmitir(c, info, d) {
        const cc = cfgAsaas(c);
        const A = (acao, extra, body) => U().chamar(cc, { provedor: 'asaas', acao, ...(extra || {}) }, body ? { method: 'POST', body } : {});
        const ant = info.ant && info.ant.provedor === 'asaas' ? info.ant : null;
        const seq = ant ? (Number(ant.seq) || 1) + (['erro', 'cancelado'].includes(ant.status) ? 1 : 0) : (info.ant ? (Number(info.ant.seq) || 1) + 1 : 1);
        const ext = `dp-${info.origem.tipo}-${limpaId(info.origem.id)}-${seq}`;
        const base = { ref: ext, seq, valor: U().reais(d.valor), emitidaPor: eu().name || '', emitidaEm: new Date().toISOString() };
        let inv = null;
        // A mesma nota de antes (resposta perdida, outra aba): consulta em vez de criar outra
        if (ant && ant.asaasId && !['erro', 'cancelado'].includes(ant.status)) { const r = await A('nota_consultar', { id: ant.asaasId }); if (r.ok && r.data && r.data.id) inv = r.data; }
        if (!inv) { const r = await A('nota_buscar', { ref: ext }); if (!r.ok && r.status !== 404) throw new Error(erroAsaas(r)); if (r.ok && r.data && Array.isArray(r.data.data)) inv = r.data.data.find(x => x && !['ERROR', 'CANCELED'].includes(x.status)) || null; }
        if (!inv) {
            // Cliente no Asaas (procura pelo CPF/CNPJ; se não existir, cadastra)
            const t = d.tomador;
            const rb = await A('cliente_buscar', { cpfCnpj: t.doc });
            if (!rb.ok) throw new Error(erroAsaas(rb));
            let cus = rb.data && Array.isArray(rb.data.data) && rb.data.data[0] ? rb.data.data[0].id : '';
            if (!cus) {
                const corpo = { name: t.nome, cpfCnpj: t.doc, notificationDisabled: true, externalReference: t.clienteId ? 'dp-cli-' + limpaId(t.clienteId) : undefined };
                if (t.email) corpo.email = t.email;
                if (t.fone) corpo.mobilePhone = t.fone;
                if (t.end.rua) { corpo.address = t.end.rua; corpo.addressNumber = t.end.numero || 'S/N'; if (t.end.compl) corpo.complement = t.end.compl; if (t.end.bairro) corpo.province = t.end.bairro; }
                if (t.end.cep) corpo.postalCode = t.end.cep;
                const rc = await A('cliente_criar', {}, corpo);
                if (!rc.ok || !rc.data || !rc.data.id) throw new Error(erroAsaas(rc));
                cus = rc.data.id;
            }
            const n = c.nfse;
            const corpo = {
                customer: cus, serviceDescription: d.descricao, observations: d.observacao || '', value: U().reais(d.valor), deductions: 0,
                effectiveDate: hojeISO(), externalReference: ext, municipalServiceName: n.asaasNome || d.descricao.slice(0, 120),
                taxes: { retainIss: !!n.retido, iss: n.aliquota || 0, pis: 0, cofins: 0, csll: 0, inss: 0, ir: 0 }
            };
            if (n.asaasId) corpo.municipalServiceId = n.asaasId;
            if (n.asaasCodigo) corpo.municipalServiceCode = n.asaasCodigo;
            const rn = await A('nota_criar', {}, corpo);
            if (!rn.ok || !rn.data || !rn.data.id) throw new Error(erroAsaas(rn));
            inv = rn.data;
            await gravarNfse(info.origem, fiscalAsaas(inv, base, c)); // já existe no Asaas: daqui em diante só consulta
        }
        if (inv.status === 'SCHEDULED') {
            const ra = await A('nota_emitir', { id: inv.id }, {});
            if (ra.ok && ra.data && ra.data.id) inv = ra.data;
            else if (!ra.ok) { const f = { ...fiscalAsaas(inv, base, c), status: 'processando', error: erroAsaas(ra) + ' A nota ficou agendada no Asaas: use Atualizar.' }; await gravarNfse(info.origem, f); return f; }
        }
        for (let i = 0; i < 8 && inv.status === 'SCHEDULED'; i++) {
            await dormir(2500);
            const rq = await A('nota_consultar', { id: inv.id });
            if (rq.ok && rq.data && rq.data.id) inv = rq.data;
        }
        const f = fiscalAsaas(inv, base, c);
        await gravarNfse(info.origem, f);
        return f;
    }
    async function asaasAtualizar(c, origem, f0) {
        const r = await U().chamar(cfgAsaas(c), { provedor: 'asaas', acao: 'nota_consultar', id: f0.asaasId });
        if (!r.ok || !r.data || !r.data.id) throw new Error(erroAsaas(r));
        const f = fiscalAsaas(r.data, f0, c); await gravarNfse(origem, f); return f;
    }
    async function asaasCancelar(c, origem, f0) {
        const r = await U().chamar(cfgAsaas(c), { provedor: 'asaas', acao: 'nota_cancelar', id: f0.asaasId }, { method: 'POST', body: {} });
        if (!r.ok) throw new Error(erroAsaas(r));
        let inv = r.data && r.data.id ? r.data : null;
        for (let i = 0; i < 4 && inv && inv.status === 'PROCESSING_CANCELLATION'; i++) {
            await dormir(2500);
            const rq = await U().chamar(cfgAsaas(c), { provedor: 'asaas', acao: 'nota_consultar', id: f0.asaasId });
            if (rq.ok && rq.data && rq.data.id) inv = rq.data;
        }
        const f = inv ? fiscalAsaas(inv, f0, c) : { ...f0, status: 'cancelando' };
        if (f.status === 'cancelado') f.canceladaEm = new Date().toISOString();
        await gravarNfse(origem, f); return f;
    }

    /* ===================== NFS-e · FOCUS (Nacional ou da prefeitura) ===================== */
    function montarFocusServico(c, d) {
        const g = c.geral, u = U(), n = c.nfse, t = d.tomador;
        const cnpj = u.docLimpo(g.cnpj), valor = u.reais(d.valor);
        const simples = c.crt !== 3;
        if (n.padrao === 'nacional') {
            const p = {
                data_emissao: u.dataEmissao(), data_competencia: hojeISO(),
                codigo_municipio_emissora: Number(n.ibge), cnpj_prestador: cnpj,
                codigo_opcao_simples_nacional: c.crt === 3 ? '1' : c.crt === 4 ? '2' : '3',
                regime_especial_tributacao: '0',
                codigo_municipio_prestacao: n.ibge, codigo_tributacao_nacional_iss: n.codNacional,
                descricao_servico: u.txt(d.descricao, 1000), valor_servico: valor,
                tributacao_iss: 1, tipo_retencao_iss: n.retido ? 2 : 1
            };
            const im = String(g.inscricaoMunicipal || '').trim(); if (im) p.inscricao_municipal_prestador = im.slice(0, 15);
            if (c.crt === 1 || c.crt === 2) p.regime_tributario_simples_nacional = '1';
            // 40.37 · Modelo novo da NFS-e Nacional (reforma tributária, obrigatório desde 10/2026). Sem estes campos a Focus
            // devolvia o erro de schema: "fone ... Expected is (CAEPF, IM)", "xDescServ ... Expected is (cTribMun)",
            // "trib: Missing child (tribFed, totTrib)" e "infDPS: Missing child (IBSCBS)".
            const cm = dig(n.codMunicipal); if (cm && cm.length <= 3) p.codigo_tributacao_municipal_iss = cm.padStart(3, '0');
            if (n.nbs.length === 9) p.codigo_nbs = n.nbs;
            if (n.aliquota > 0) p.percentual_aliquota_relativa_municipio = n.aliquota;
            // Tributos aproximados (grupo totTrib): o não optante do Simples manda os percentuais federal/estadual/municipal
            // (o indicador é recusado para ele); Simples e MEI mandam o indicador 0 ("não informar valores estimados").
            if (c.crt === 3) { p.percentual_total_tributos_federais = n.totFed; p.percentual_total_tributos_estaduais = n.totEst; p.percentual_total_tributos_municipais = n.totMun || n.aliquota || 0; }
            else p.indicador_total_tributacao = 0;
            if (t.doc.length === 11) p.cpf_tomador = t.doc; else p.cnpj_tomador = t.doc;
            // IBS/CBS: nota regular, destinatário = o próprio tomador; consumidor final quando o tomador é pessoa física
            p.finalidade_emissao = 0; p.consumidor_final = t.doc.length === 11 ? 1 : 0; p.indicador_destinatario = 0;
            p.codigo_indicador_operacao = n.indOp; p.ibs_cbs_situacao_tributaria = n.ibsCst; p.ibs_cbs_classificacao_tributaria = n.ibsClass;
            p.razao_social_tomador = u.txt(t.nome, 150);
            if (t.email) p.email_tomador = t.email.slice(0, 80);
            if (t.fone) p.telefone_tomador = t.fone;
            if (t.end.rua) { p.logradouro_tomador = u.txt(t.end.rua, 255); p.numero_tomador = u.txt(t.end.numero || 'S/N', 60); if (t.end.compl) p.complemento_tomador = u.txt(t.end.compl, 156); if (t.end.bairro) p.bairro_tomador = u.txt(t.end.bairro, 60); }
            if (t.end.ibge) p.codigo_municipio_tomador = Number(t.end.ibge);
            if (t.end.cep) p.cep_tomador = t.end.cep;
            return { tipo: 'nfsen', payload: p };
        }
        const tom = { razao_social: u.txt(t.nome, 115) };
        if (t.doc.length === 11) tom.cpf = t.doc; else tom.cnpj = t.doc;
        if (t.email) tom.email = t.email.slice(0, 80);
        if (t.fone && t.fone.length >= 10 && t.fone.length <= 11) tom.telefone = t.fone;
        if (t.end.rua) {
            tom.endereco = { logradouro: u.txt(t.end.rua, 125), numero: u.txt(t.end.numero || 'S/N', 10), bairro: u.txt(t.end.bairro, 60) };
            if (t.end.compl) tom.endereco.complemento = u.txt(t.end.compl, 60);
            if (t.end.ibge) tom.endereco.codigo_municipio = t.end.ibge;
            if (t.end.uf) tom.endereco.uf = t.end.uf;
            if (t.end.cep) tom.endereco.cep = t.end.cep;
        }
        const serv = { valor_servicos: valor, iss_retido: !!n.retido, item_lista_servico: n.itemLista, discriminacao: u.txt(d.descricao, 2000), codigo_municipio: n.ibge };
        if (n.aliquota > 0) serv.aliquota = n.aliquota;
        if (n.codMunicipal) serv.codigo_tributario_municipio = n.codMunicipal;
        if (n.cnae.length === 7) serv.codigo_cnae = n.cnae;
        return {
            tipo: 'nfse', payload: {
                data_emissao: u.dataEmissao(), natureza_operacao: String(g.nfseNatureza || '1'), optante_simples_nacional: simples,
                prestador: { cnpj, inscricao_municipal: String(g.inscricaoMunicipal || '').trim(), codigo_municipio: n.ibge },
                tomador: tom, servico: serv
            }
        };
    }
    function fiscalFocusServico(dd, base, c) {
        const st = String(dd.status || '');
        const f = { ...base, tipo: 'nfse', provedor: 'focus', ambiente: c.ambiente, atualizadaEm: new Date().toISOString() };
        const abs = p => U().absoluta(c.geral, p);
        if (st === 'autorizado') Object.assign(f, {
            status: 'autorizado', error: null, numero: dd.numero || dd.numero_nfse || f.numero || null, codigoVerificacao: dd.codigo_verificacao || f.codigoVerificacao || null,
            pdfUrl: dd.url_danfse || dd.url || f.pdfUrl || null, linkPrefeitura: dd.url || f.linkPrefeitura || null, xmlUrl: abs(dd.caminho_xml_nota_fiscal) || f.xmlUrl || null
        });
        else if (st === 'cancelado') Object.assign(f, { status: 'cancelado', canceladaEm: f.canceladaEm || new Date().toISOString() });
        else if (['erro_autorizacao', 'negado'].includes(st)) Object.assign(f, { status: 'erro', error: erroFocus({ status: 200, data: dd }) || 'A prefeitura recusou a nota.' });
        else Object.assign(f, { status: 'processando' });
        return f;
    }
    async function focusEmitirServico(c, info, d) {
        const cc = cfgFocus(c);
        const ant = info.ant && info.ant.provedor === 'focus' ? info.ant : null;
        if (ant && ant.ref && ['autorizado', 'processando'].includes(ant.status)) {
            // A mesma nota de antes: consulta (sem resposta da Focus, não arrisca emitir uma 2ª)
            const f = await focusAtualizarServico(c, info.origem, ant);
            if (f.status !== 'erro') return f;
        }
        const m = montarFocusServico(c, d);
        const seq = info.ant ? (Number(info.ant.seq) || 1) + 1 : 1;
        const ref = `nfse-${info.origem.tipo}-${limpaId(info.origem.id)}-${seq}`;
        const base = { ref, seq, tipoFocus: m.tipo, valor: U().reais(d.valor), emitidaPor: eu().name || '', emitidaEm: new Date().toISOString() };
        const r = await U().chamar(cc, { acao: 'emitir', ref, tipo: m.tipo }, { method: 'POST', body: m.payload });
        if (r.status === 0) { const f = { ...base, tipo: 'nfse', provedor: 'focus', status: 'processando', ambiente: c.ambiente, error: erroFocus(r) + ' Confira em instantes (Atualizar).' }; await gravarNfse(info.origem, f); return f; }
        if (!r.ok || !r.data || !r.data.status) {
            const f = { ...base, tipo: 'nfse', provedor: 'focus', status: 'erro', ambiente: c.ambiente, error: erroFocus(r) };
            await gravarNfse(info.origem, f); return f;
        }
        let dd = r.data;
        for (let i = 0; i < 8 && dd.status === 'processando_autorizacao'; i++) {
            await dormir(i < 3 ? 2000 : 3000);
            const q = await U().chamar(cc, { acao: 'consultar', ref, tipo: m.tipo });
            if (q.ok && q.data && q.data.status) dd = q.data;
        }
        const f = fiscalFocusServico(dd, base, c);
        await gravarNfse(info.origem, f); return f;
    }
    async function focusAtualizarServico(c, origem, f0) {
        const r = await U().chamar(cfgFocus(c), { acao: 'consultar', ref: f0.ref, tipo: f0.tipoFocus || 'nfse' });
        if (!r.ok || !r.data || !r.data.status) {
            if (r.status === 404) { const f = { ...f0, status: 'erro', error: 'A nota não chegou à Focus NFe (nada foi emitido). Pode emitir de novo.' }; await gravarNfse(origem, f); return f; }
            throw new Error(erroFocus(r));
        }
        const f = fiscalFocusServico(r.data, f0, c); await gravarNfse(origem, f); return f;
    }
    async function focusCancelarServico(c, origem, f0, just) {
        const r = await U().chamar(cfgFocus(c), { acao: 'cancelar', ref: f0.ref, tipo: f0.tipoFocus || 'nfse' }, { method: 'POST', body: { justificativa: just } });
        const d = r.data || {};
        if (!(r.ok && d.status === 'cancelado') && !(d.codigo === 'already_processed' && /cancelad/i.test(String(d.mensagem || '')))) {
            throw new Error(d.status === 'erro_cancelamento' ? 'A prefeitura não cancelou: ' + (erroFocus({ status: 200, data: d }) || d.mensagem || 'motivo não informado') : erroFocus(r));
        }
        const f = { ...f0, status: 'cancelado', canceladaEm: new Date().toISOString(), motivoCancelamento: just };
        await gravarNfse(origem, f); return f;
    }

    /* ===================== NFS-e · ENTRADA ÚNICA ===================== */
    /** Confere os dados do tomador e do serviço. Volta a lista do que falta (vazia = pode emitir). */
    function pendenciasServico(c, d) {
        const p = [], u = U();
        c.servicoFalta.forEach(x => p.push('Configurações › Fiscal: falta ' + x + '.'));
        if (!(d.valor > 0)) p.push('O valor do serviço precisa ser maior que zero.');
        if (!String(d.descricao || '').trim()) p.push('Escreva a descrição do serviço.');
        if (!d.tomador.nome) p.push('Falta o nome do cliente (tomador do serviço).');
        if (!d.tomador.doc) p.push(c.servico === 'asaas' ? 'O Asaas precisa do CPF ou CNPJ do cliente.' : 'Falta o CPF ou CNPJ do cliente.');
        else if (!u.docOk(d.tomador.doc)) p.push('O CPF/CNPJ do cliente está com número errado.');
        if (d.tomador.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.tomador.email)) p.push('O e-mail do cliente está errado.');
        return p;
    }
    async function emitirServico(info, d) {
        const c = await cfg(true);
        const pend = pendenciasServico(c, d);
        if (pend.length) throw new Error(pend.join(' '));
        if (d.tomador.end.cep && !d.tomador.end.ibge) d.tomador.end.ibge = await ibgeDoCep(d.tomador.end.cep);
        if (c.servico === 'dp') return window.DPNotasDP.emitirServico(c, info, d, gravarNfse); // 41.1
        return c.servico === 'asaas' ? asaasEmitir(c, info, d) : focusEmitirServico(c, info, d);
    }
    const semDP = () => { throw new Error('Recarregue a página (o arquivo da nota fiscal DistribuiPro não carregou).'); };
    async function atualizarServico(origem, f0) {
        const c = await cfg(true);
        if (f0.provedor === 'dp') return window.DPNotasDP ? window.DPNotasDP.atualizarServico(c, origem, f0, gravarNfse) : semDP();
        return f0.provedor === 'asaas' ? asaasAtualizar(c, origem, f0) : focusAtualizarServico(c, origem, f0);
    }
    async function cancelarServico(origem, f0, just) {
        const c = await cfg(true);
        if (f0.provedor === 'dp') return window.DPNotasDP ? window.DPNotasDP.cancelarServico(c, origem, f0, just, gravarNfse) : semDP();
        return f0.provedor === 'asaas' ? asaasCancelar(c, origem, f0) : focusCancelarServico(c, origem, f0, just);
    }

    /* ===================== TELA: ESTILO E JANELA ===================== */
    function css() {
        if ($('dpnCss')) return;
        const st = document.createElement('style'); st.id = 'dpnCss';
        st.textContent = `
.dpn-box{border:1px solid var(--border-color);border-radius:12px;padding:12px 14px;margin:14px 0 0;background:var(--bg-surface)}
.dpn-t{font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dpn-amb{font-size:10px;padding:2px 8px;border-radius:999px;background:rgba(245,158,11,.14);color:#d97706;text-transform:none;letter-spacing:0}
.dpn-l{display:flex;gap:10px;align-items:flex-start;padding:9px 0;border-top:1px solid var(--border-color);flex-wrap:wrap}
.dpn-l:first-of-type{border-top:0}
.dpn-i{flex:1 1 220px;min-width:0;font-size:13px;color:var(--text-primary)}
.dpn-i small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:3px;line-height:1.45}
.dpn-i .dpn-err{color:var(--danger,#ef4444)}
.dpn-i .dpn-av{color:#d97706}
.dpn-chip{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:6px;vertical-align:1px}
.dpn-a{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dpn-a .btn{padding:5px 10px;font-size:12px}
.dpn-msg{font-size:12px;color:var(--text-muted);line-height:1.5}
.dpn-form label{display:block;font-size:12px;font-weight:600;color:var(--text-secondary);margin:10px 0 4px}
.dpn-form input[type=text],.dpn-form input[type=email],.dpn-form input[type=number],.dpn-form input[type=password],.dpn-form textarea,.dpn-form select{width:100%;box-sizing:border-box}
.dpn-g2{display:grid;grid-template-columns:1fr 1fr;gap:0 12px}
@media(max-width:560px){.dpn-g2{grid-template-columns:1fr}}
.dpn-pend{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(239,68,68,.08);color:var(--danger,#ef4444);font-size:12px;line-height:1.5}
.dpn-info{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:rgba(59,130,246,.08);color:var(--text-secondary);font-size:12px;line-height:1.5}
.dpn-res{margin:12px 0 0;padding:12px;border-radius:10px;font-size:13px;line-height:1.5}
.dpn-osbtn{position:relative}
.dpn-osbtn .dpn-dot{position:absolute;top:2px;right:2px;width:7px;height:7px;border-radius:50%}
.dpn-k{display:inline-flex;align-items:center;gap:4px;font-size:10px;font-weight:700;padding:2px 7px;border-radius:999px;margin-left:4px}
.dpn-tab{width:100%;border-collapse:collapse;font-size:12.5px;margin:4px 0 10px}
.dpn-tab th,.dpn-tab td{padding:8px 10px;border-bottom:1px solid var(--border-color);text-align:left;color:var(--text-primary)}
.dpn-tab th{font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px}
.dpn-tab td.s{color:#10b981;font-weight:700}.dpn-tab td.n{color:var(--text-muted)}
.dpn-prov{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;margin-top:10px}
.dpn-prov label{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:12px;background:var(--bg-secondary);cursor:pointer;border:2px solid transparent;font-size:13px;color:var(--text-primary)}
.dpn-prov label.on{border-color:var(--accent)}
.dpn-prov small{display:block;font-size:11.5px;color:var(--text-muted);margin-top:3px;line-height:1.4}
.dpn-lista{max-height:220px;overflow:auto;border:1px solid var(--border-color);border-radius:10px;margin-top:8px}
.dpn-lista button{display:block;width:100%;text-align:left;padding:8px 10px;border:0;border-bottom:1px solid var(--border-color);background:none;color:var(--text-primary);cursor:pointer;font-size:12.5px}
.dpn-lista button:hover{background:var(--bg-secondary)}`;
        document.head.appendChild(st);
    }
    function janela(titulo, html, largura) {
        css();
        const ov = document.createElement('div');
        ov.className = 'modal-overlay active dpn-ov';
        ov.innerHTML = `<div class="modal" style="max-width:${largura || 540}px"><div class="modal-header"><h3 style="display:flex;align-items:center;gap:8px">${titulo}</h3><button class="modal-close" type="button" data-x><i class="fas fa-times"></i></button></div><div class="modal-body dpn-form">${html}</div><div class="modal-footer" style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap"></div></div>`;
        const fns = [];
        const fechar = () => { ov.remove(); fns.forEach(f => { try { f(); } catch (e) { } }); };
        ov.querySelector('[data-x]').onclick = fechar;
        document.body.appendChild(ov);
        return { ov, corpo: ov.querySelector('.modal-body'), rodape: ov.querySelector('.modal-footer'), fechar, aoFechar: f => fns.push(f) };
    }
    const botao = (rotulo, cls, fn) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn ' + (cls || 'btn-outline'); b.innerHTML = rotulo; b.onclick = fn; return b; };
    async function ocupado(b, txt, fn) {
        if (b.disabled) return;
        const old = b.innerHTML; b.disabled = true; b.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${txt}`;
        try { return await fn(); } finally { if (document.body.contains(b)) { b.disabled = false; b.innerHTML = old; } }
    }
    function abrirLink(url) {
        if (!url) { toast('warning', 'Este arquivo ainda não está disponível. Use Atualizar e tente de novo.'); return; }
        const w = window.open(url, '_blank'); if (w) { try { w.opener = null; } catch (e) { } }
        else if (!(U() && U().ponte())) toast('warning', 'O navegador bloqueou a janela. Libere as janelas (pop-ups) deste site e clique de novo.');
    }

    /* ===================== JANELA DA NFS-e ===================== */
    async function janelaServico(origem, op) {
        op = op || {};
        let info, c;
        try { [info, c] = await Promise.all([carregarOrigem(origem), cfg(true)]); }
        catch (e) { toast('error', e.message || String(e)); return; }
        const cli = await lerCliente(info.clienteId);
        const end = cli ? { rua: cli.street || cli.rua || cli.logradouro || (cli.number ? '' : cli.address) || '', numero: cli.number || cli.numero || '', compl: cli.complement || cli.complemento || '', bairro: cli.neighborhood || cli.bairro || '', cidade: cli.city || cli.cidade || '', uf: String(cli.state || cli.uf || '').toUpperCase(), cep: dig(cli.zip || cli.cep), ibge: dig(cli.ibge || cli.codigoMunicipio) } : { rua: '', numero: '', compl: '', bairro: '', cidade: '', uf: '', cep: '', ibge: '' };
        const ant = info.ant;
        const prov = c.servico === 'dp' ? 'Nota fiscal DistribuiPro' : c.servico === 'asaas' ? 'Asaas' : `Focus NFe${c.servico === 'focus' ? ' · ' + (c.nfse.padrao === 'nacional' ? 'NFS-e Nacional' : 'prefeitura') : ''}`;
        const titulo = `<i class="fas fa-file-invoice" style="color:var(--accent)"></i> Nota de serviço (NFS-e) · ${esc(info.titulo)}`;
        const jaTem = ant && ['autorizado', 'processando', 'cancelando'].includes(ant.status);
        const J = janela(titulo, `${avisoDemo()}
            <div class="dpn-msg">Sai pel${c.servico === 'dp' ? 'a' : 'o'} <b>${esc(c.servico === 'nenhum' ? '—' : prov)}</b> · ${c.servico === 'dp' ? 'no ambiente escolhido no painel da API (teste ou produção)' : c.producao ? 'produção (vale como nota)' : `<b style="color:#d97706">${c.servico === 'asaas' ? 'sandbox' : 'homologação'} (teste, sem valor fiscal)</b>`}</div>
            ${jaTem ? `<div class="dpn-info">Esta origem já tem nota de serviço: ${esc(ST[ant.status] ? ST[ant.status][0] : ant.status)}${ant.numero ? ' nº ' + esc(ant.numero) : ''}. Abra o quadro da nota para ver, atualizar ou cancelar.</div>` : ''}
            ${info.cancelada ? '<div class="dpn-pend">Esta origem está cancelada: não emita nota para ela.</div>' : ''}
            <div class="dpn-g2">
              <div><label>Cliente (tomador do serviço)</label><input type="text" class="form-input" data-f="nome" maxlength="150" value="${esc((cli && (cli.razaoSocial || cli.name)) || info.nomeCli || '')}"></div>
              <div><label>CPF ou CNPJ</label><input type="text" class="form-input" data-f="doc" maxlength="18" value="${esc((cli && (cli.document || cli.cpfCnpj || cli.cpf || cli.cnpj)) || info.docCli || '')}"></div>
            </div>
            <label>E-mail do cliente (a nota pode ir por e-mail)</label><input type="email" class="form-input" data-f="email" maxlength="80" value="${esc((cli && (cli.emailNf || cli.email)) || '')}">
            <div class="dpn-msg" style="margin-top:6px">${end.rua || end.cidade ? `Endereço: ${esc([[end.rua, end.numero].filter(Boolean).join(', '), end.bairro, [end.cidade, end.uf].filter(Boolean).join('/'), end.cep ? 'CEP ' + end.cep : ''].filter(Boolean).join(' · '))}` : 'Cliente sem endereço no cadastro (algumas prefeituras pedem o endereço quando o cliente é empresa).'}</div>
            <label>Descrição do serviço (sai na nota)</label><textarea class="form-input" data-f="desc" rows="3" maxlength="1000">${esc(info.descricao || '')}</textarea>
            <div class="dpn-g2">
              <div><label>Valor do serviço (R$)</label><input type="text" class="form-input" data-f="valor" inputmode="decimal" value="${(U().reais(info.valor)).toFixed(2).replace('.', ',')}"></div>
              <div><label>ISS</label><div class="dpn-msg" style="padding-top:8px">${c.nfse.aliquota > 0 ? c.nfse.aliquota.toLocaleString('pt-BR') + '%' : 'alíquota da prefeitura'}${c.nfse.retido ? ' · retido pelo cliente' : ''}</div></div>
            </div>
            ${info.pecas > 0 ? `<label style="display:flex;gap:8px;align-items:center;font-weight:500"><input type="checkbox" data-f="pecas"> Incluir as peças/materiais (${money(U().reais(info.pecas))}) no valor da nota de serviço</label><div class="dpn-msg">As peças, em geral, saem na nota de mercadoria. Pergunte ao contador se a sua prefeitura aceita na NFS-e.</div>` : ''}
            <div data-f="pend"></div><div data-f="res"></div>`, 560);
        const q = s => J.corpo.querySelector(`[data-f="${s}"]`);
        const valorBase = info.valor;
        if (q('pecas')) q('pecas').addEventListener('change', e => { q('valor').value = U().reais(valorBase + (e.target.checked ? info.pecas : 0)).toFixed(2).replace('.', ','); });
        const ler = () => ({
            valor: U().cent(String(q('valor').value || '').replace(/\./g, '').replace(',', '.')),
            descricao: String(q('desc').value || '').trim(),
            observacao: [c.nfse.texto, info.titulo].filter(Boolean).join(' · '),
            tomador: { nome: String(q('nome').value || '').trim(), doc: U().docLimpo(q('doc').value), email: String(q('email').value || '').trim(), fone: dig(cli && (cli.whatsapp || cli.phone)), clienteId: info.clienteId, end: { ...end } }
        });
        const pintarPend = () => { const p = pendenciasServico(c, ler()); q('pend').innerHTML = p.length ? `<div class="dpn-pend"><b>Antes de emitir:</b><br>${p.map(esc).join('<br>')}</div>` : ''; return p; };
        J.corpo.addEventListener('input', () => { q('res').innerHTML = ''; pintarPend(); });
        pintarPend();
        J.rodape.appendChild(botao('Agora não', 'btn-outline', () => J.fechar()));
        const bEmit = botao('<i class="fas fa-paper-plane"></i> Emitir NFS-e', 'btn-primary', () => ocupado(bEmit, 'Emitindo…', async () => {
            if (pintarPend().length) return;
            const d = ler();
            // Cliente sem CPF/CNPJ ou e-mail no cadastro: guarda o que foi digitado (a próxima nota já vem preenchida)
            if (cli && info.clienteId) {
                const up = {};
                if (!(cli.document || cli.cpfCnpj || cli.cpf || cli.cnpj) && d.tomador.doc) up.document = q('doc').value.trim();
                if (!(cli.email || cli.emailNf) && d.tomador.email) up.email = d.tomador.email;
                if (Object.keys(up).length) { try { await db.collection('customers').doc(info.clienteId).update(up); } catch (e) { } }
            }
            try {
                const f = await emitirServico(info, d);
                info.ant = f;
                mostrarResServico(q('res'), f);
                if (f.status === 'autorizado' || f.status === 'processando') { bEmit.style.display = 'none'; }
                if (typeof op.depois === 'function') try { op.depois(f); } catch (e) { }
            } catch (e) {
                q('res').innerHTML = `<div class="dpn-pend"><b>A nota não saiu.</b> ${esc(e.message || String(e))}</div>`;
            }
        }));
        if (info.cancelada || jaTem) bEmit.style.display = 'none';
        J.rodape.appendChild(bEmit);
        if (typeof op.aoFechar === 'function') J.aoFechar(op.aoFechar);
        return J;
    }
    function mostrarResServico(box, f) {
        const ok = f.status === 'autorizado', proc = f.status === 'processando';
        box.innerHTML = `<div class="dpn-res" style="background:${ok ? 'rgba(16,185,129,.1)' : proc ? 'rgba(245,158,11,.1)' : 'rgba(239,68,68,.08)'}">
            <b>${ok ? 'NFS-e autorizada' + (f.numero ? ' nº ' + esc(f.numero) : '') : proc ? 'NFS-e enviada: aguardando a prefeitura' : 'A NFS-e não saiu'}</b>
            ${ok ? '' : `<div style="margin-top:4px">${esc(proc ? 'A prefeitura ainda não respondeu. Confira em instantes no quadro da nota (Atualizar).' : (f.error || 'Motivo não informado.'))}</div>`}
            ${ok && (f.pdfUrl || f.linkPrefeitura) ? '<div style="margin-top:8px"><button type="button" class="btn btn-primary btn-sm" data-pdf><i class="fas fa-file-pdf"></i> Abrir a nota</button></div>' : ''}
        </div>`;
        const b = box.querySelector('[data-pdf]'); if (b) b.onclick = () => abrirLink(f.pdfUrl || f.linkPrefeitura);
    }

    /* ===================== JANELA DA NF-e (pedido para empresa) ===================== */
    async function janelaNfe(sale, op) {
        op = op || {};
        const c = await cfg(true);
        const cli = await lerCliente(sale.customerId);
        const J = janela('<i class="fas fa-file-invoice" style="color:var(--accent)"></i> NF-e (nota de mercadoria) · Venda V-' + pad4(sale.saleNumber), '', 560);
        if (!c.produtoOk) { J.corpo.innerHTML = `<div class="dpn-pend">${esc(porqueSemProduto(c))}</div>`; J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar)); return; }
        if (!cli) { J.corpo.innerHTML = `<div class="dpn-pend">A NF-e precisa de um cliente cadastrado na venda (com CPF/CNPJ e endereço). Use "Editar venda" para escolher o cliente e tente de novo.</div>`; J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar)); return; }
        const doc = U().docLimpo(cli.document || cli.cpfCnpj || cli.cpf || cli.cnpj);
        const ehEmpresa = doc.length === 14;
        const indAtual = String(cli.indIE || '') || (doc.length === 11 ? '9' : (dig(cli.ie) ? '1' : ''));
        const endTxt = [[cli.street || cli.address, cli.number].filter(Boolean).join(', '), cli.neighborhood, [cli.city, cli.state].filter(Boolean).join('/'), cli.zip ? 'CEP ' + cli.zip : ''].filter(Boolean).join(' · ');
        J.corpo.innerHTML = `${avisoDemo()}
            <div class="dpn-msg">Sai pel${c.produto === 'base' ? 'o' : 'a'} <b>${esc(c.nomeProduto)}</b> · ${c.produto === 'dp' ? 'no ambiente escolhido no painel da API (teste ou produção)' : c.producao ? 'produção (vale como nota)' : '<b style="color:#d97706">homologação (teste, sem valor fiscal)</b>'}</div>
            <div class="dpn-info"><b>${esc(cli.razaoSocial || cli.name || 'Cliente')}</b><br>${doc ? (ehEmpresa ? 'CNPJ ' : 'CPF ') + esc(doc) : '<span style="color:var(--danger)">sem CPF/CNPJ</span>'}<br>${endTxt ? esc(endTxt) : '<span style="color:var(--danger)">sem endereço</span>'}
            <div style="margin-top:6px"><a href="clientes.html" target="_blank" rel="noopener">Abrir Clientes para corrigir</a></div></div>
            <label>O cliente é contribuinte do ICMS?</label>
            <select class="form-input" data-f="ind">
              <option value="9"${indAtual === '9' ? ' selected' : ''}>Não contribuinte (pessoa física ou empresa sem inscrição estadual)</option>
              <option value="1"${indAtual === '1' ? ' selected' : ''}>Contribuinte: tem inscrição estadual (IE)</option>
              <option value="2"${indAtual === '2' ? ' selected' : ''}>Contribuinte isento de inscrição estadual</option>
            </select>
            <div data-f="ieBox"><label>Inscrição estadual do cliente</label><input type="text" class="form-input" data-f="ie" maxlength="20" value="${esc(dig(cli.ie || cli.inscricaoEstadual))}"></div>
            <div class="dpn-msg" style="margin-top:8px">Uma venda leva uma nota de mercadoria só: com NFC-e autorizada, cancele a NFC-e antes.</div>
            <div data-f="res"></div>`;
        const q = s => J.corpo.querySelector(`[data-f="${s}"]`);
        const pintaIe = () => { q('ieBox').style.display = q('ind').value === '1' ? '' : 'none'; };
        q('ind').addEventListener('change', pintaIe); pintaIe();
        J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar));
        const b = botao('<i class="fas fa-paper-plane"></i> Emitir NF-e', 'btn-primary', () => ocupado(b, 'Emitindo…', async () => {
            const ind = q('ind').value, ie = dig(q('ie').value);
            if (ind === '1' && !ie) { q('res').innerHTML = '<div class="dpn-pend">Informe a inscrição estadual do cliente.</div>'; return; }
            const up = { indIE: ind, ie: ind === '1' ? ie : '' };
            try { await db.collection('customers').doc(cli.id).update(up); } catch (e) { }
            const r = await window.NFCeService.emitirNota(sale, sale.id, { tipo: 'nfe', cliente: { ...cli, ...up }, doc });
            if (r.ok && r.status === 'autorizado') { J.fechar(); await window.NFCeService.mostrarResultado({ ...r, tipo: 'nfe' }); }
            else if (r.ok && r.status === 'processando') q('res').innerHTML = '<div class="dpn-info">NF-e enviada: a SEFAZ ainda está processando. Confira em instantes no quadro da nota (Atualizar).</div>';
            else q('res').innerHTML = `<div class="dpn-pend"><b>A NF-e não saiu.</b> ${esc(r.error || 'Motivo não informado.')}</div>`;
            if (typeof op.depois === 'function') try { op.depois(r); } catch (e) { }
        }));
        J.rodape.appendChild(b);
        if (typeof op.aoFechar === 'function') J.aoFechar(op.aoFechar);
    }

    /* ===================== JANELA DE CANCELAMENTO ===================== */
    function janelaCancelar(rotulo, prazo, precisaMotivo, fn) {
        return new Promise(resolve => {
            const J = janela(`<i class="fas fa-ban" style="color:var(--danger)"></i> Cancelar ${esc(rotulo)}`, `
                <div class="dpn-msg">${esc(prazo)}</div>
                ${precisaMotivo ? '<label>Motivo do cancelamento (vai para a SEFAZ/prefeitura; de 15 a 255 letras)</label><textarea class="form-input" data-f="m" rows="3" maxlength="255" placeholder="Ex.: venda lançada errada, cliente desistiu da compra"></textarea>' : ''}
                <div data-f="res"></div>`, 480);
            const q = s => J.corpo.querySelector(`[data-f="${s}"]`);
            let feito = false;
            J.aoFechar(() => resolve(feito));
            J.rodape.appendChild(botao('Voltar', 'btn-outline', J.fechar));
            const b = botao('<i class="fas fa-ban"></i> Cancelar a nota', 'btn-danger', () => ocupado(b, 'Cancelando…', async () => {
                const m = precisaMotivo ? U().txt(q('m').value, 255) : '';
                if (precisaMotivo && m.length < 15) { q('res').innerHTML = '<div class="dpn-pend">Escreva o motivo com pelo menos 15 letras.</div>'; return; }
                try { const r = await fn(m); if (r && r.ok === false) throw new Error(r.error || 'A nota não foi cancelada.'); feito = true; toast('success', r && r.status === 'cancelando' ? (r.provedor === 'base' ? 'Cancelamento enviado ao Base: aguardando a SEFAZ (Atualizar).' : 'Cancelamento enviado: aguardando a prefeitura.') : 'Nota cancelada.'); J.fechar(); }
                catch (e) { q('res').innerHTML = `<div class="dpn-pend">${esc(e.message || String(e))}</div>`; }
            }));
            J.rodape.appendChild(b);
        });
    }

    /* ===================== QUADRO "NOTA FISCAL" DA VENDA ===================== */
    const nomeMerc = f => f && f.tipo === 'nfe' ? 'NF-e' : 'NFC-e';
    async function quadroVenda(box, saleId, op) {
        op = op || {};
        css();
        box.classList.add('dpn-box');
        box.innerHTML = '<div class="dpn-msg"><i class="fas fa-spinner fa-spin"></i> Nota fiscal…</div>';
        const [s, c] = await Promise.all([lerDoc('sales', saleId), cfg()]);
        if (!s) { box.innerHTML = '<div class="dpn-msg">Venda não encontrada.</div>'; return; }
        const prods = await window.NFCeService.carregarProdutos(s.items || []);
        const merc = window.NFCeService.temMercadoria(s, prods);
        const origemS = origemDaVenda(s);
        const sv = origemS.tipo === 'os' ? null : servicoDaVenda(s, prods);
        const temServ = origemS.tipo === 'os' || (sv && sv.valor > 0);
        const f = s.fiscal || null, fs = s.fiscalNfse || null;
        // Quem não usa nota fiscal (emissão desligada e venda sem nota) não vê o quadro no pedido
        if (!c.ligado && !f && !fs && !op.mostrarSempre) { box.remove(); return; }
        const cancelada = s.status === 'cancelled';
        const recarregar = () => quadroVenda(box, saleId, op).then(() => { if (typeof op.mudou === 'function') op.mudou(); });
        const linhas = [];
        // Nota de mercadoria (NFC-e / NF-e): Focus NFe ou Base by Asaas (39.10)
        if (f || merc) {
            const l = document.createElement('div'); l.className = 'dpn-l';
            const a = document.createElement('div'); a.className = 'dpn-a';
            const doBase = f && f.provedor === 'base';
            const offline = !!(U() && U().ponte());
            let info = '';
            if (f) {
                info = `<b>${nomeMerc(f)}${f.numero ? ' nº ' + esc(f.numero) : ''}</b>${chip(f.status)}<small>${esc(NOME_PROV[f.provedor] || 'Focus NFe')}${f.serie != null && f.serie !== '' ? ' · série ' + esc(f.serie) : ''}${f.valor ? ' · ' + money(f.valor) : ''}${f.ambiente && f.ambiente !== 'producao' ? ' · homologação' : ''}</small>`;
                if (f.error && (f.status !== 'autorizado' || doBase)) info += `<small class="dpn-err">${esc(f.error)}</small>`;
                if (f.aviso) info += `<small class="dpn-av">${esc(f.aviso)}</small>`;
                if (f.status === 'cancelado' && f.motivoCancelamento) info += `<small>Cancelada: ${esc(f.motivoCancelamento)}</small>`;
                if (doBase && offline && ['autorizado', 'cancelado'].includes(f.status) && !f.danfeUrl) info += '<small class="dpn-av">O PDF (DANFE) e o XML desta nota ficam no painel do Base by Asaas (Faturamento › Notas fiscais).</small>';
                if (f.status === 'autorizado') {
                    if (!(doBase && offline && !f.danfeUrl)) a.appendChild(botao('<i class="fas fa-print"></i> DANFE', 'btn-outline', () => abrirDanfe(f, recarregar)));
                    if (f.xmlUrl) a.appendChild(botao('<i class="fas fa-code"></i> XML', 'btn-outline', () => window.NFCeService.abrirDocumento(f, 'xml')));
                    if (podeCancelar()) a.appendChild(botao('<i class="fas fa-ban"></i> Cancelar nota', 'btn-outline', async () => {
                        const ok = await janelaCancelar(nomeMerc(f) + (f.numero ? ' nº ' + f.numero : ''), f.tipo === 'nfe' ? 'A SEFAZ aceita cancelar a NF-e em até 24 horas depois da autorização.' : 'A SEFAZ aceita cancelar a NFC-e em geral até 30 minutos depois da autorização (depois disso, fale com o contador).', true, m => window.NFCeService.cancelarVenda(saleId, m));
                        if (ok) recarregar();
                    }));
                }
                if (['processando', 'cancelando'].includes(f.status) || (doBase && f.status === 'autorizado' && !f.danfeUrl && !offline)) a.appendChild(botao('<i class="fas fa-rotate"></i> Atualizar', f.status === 'autorizado' ? 'btn-outline' : 'btn-primary', async ev => {
                    await ocupado(ev.currentTarget, 'Consultando…', async () => { const r = await window.NFCeService.atualizarVenda(saleId); if (r.error && !r.ok) toast('warning', r.error); });
                    recarregar();
                }));
            } else {
                info = `<b>Nota de mercadoria</b>${chip('—').replace('—', 'Sem nota')}<small>${merc ? `NFC-e (consumidor) ou NF-e (empresa), ${c.produto === 'base' ? 'pelo Base by Asaas' : c.produto === 'focus' ? 'pela Focus NFe' : 'pela Focus NFe ou pelo Base by Asaas'}.` : ''}</small>`;
            }
            const podeEmitir = !cancelada && merc && (!f || ['erro', 'denegado', 'cancelado'].includes(f.status));
            if (podeEmitir) {
                if (c.produtoOk) {
                    a.appendChild(botao(`<i class="fas fa-receipt"></i> ${f && f.tipo !== 'nfe' && f.status === 'erro' ? 'Emitir NFC-e de novo' : 'Emitir NFC-e'}`, 'btn-primary', ev => ocupado(ev.currentTarget, 'Emitindo…', async () => {
                        const v = await lerDoc('sales', saleId);
                        const r = await window.NFCeService.emitir(v, saleId);
                        await window.NFCeService.mostrarResultado(r);
                        recarregar();
                    })));
                    a.appendChild(botao('<i class="fas fa-building"></i> NF-e (empresa)', 'btn-outline', async () => { const v = await lerDoc('sales', saleId); janelaNfe(v, { aoFechar: recarregar }); }));
                } else {
                    info += `<small class="dpn-av">${esc(porqueSemProduto(c))}</small>`;
                }
            }
            l.innerHTML = `<div class="dpn-i">${info}</div>`;
            l.appendChild(a); linhas.push(l);
        }
        // Nota de serviço (NFS-e): Focus NFe ou Asaas
        if (fs || temServ) {
            const l = document.createElement('div'); l.className = 'dpn-l';
            const a = document.createElement('div'); a.className = 'dpn-a';
            const origemN = origemS;
            let info = '';
            if (fs) {
                info = `<b>NFS-e${fs.numero ? ' nº ' + esc(fs.numero) : ''}</b>${chip(fs.status)}<small>${esc(NOME_PROV[fs.provedor] || fs.provedor || '')}${fs.valor != null ? ' · ' + money(fs.valor) : ''}${fs.codigoVerificacao ? ' · verificação ' + esc(fs.codigoVerificacao) : ''}${fs.ambiente && fs.ambiente !== 'producao' ? ' · teste' : ''}</small>`;
                if (fs.error && fs.status !== 'autorizado') info += `<small class="dpn-err">${esc(fs.error)}</small>`;
                if (fs.aviso) info += `<small class="dpn-av">${esc(fs.aviso)}</small>`;
                if (fs.status === 'autorizado') {
                    a.appendChild(botao('<i class="fas fa-file-pdf"></i> Nota', 'btn-outline', () => abrirLink(fs.pdfUrl || fs.linkPrefeitura)));
                    if (fs.xmlUrl) a.appendChild(botao('<i class="fas fa-code"></i> XML', 'btn-outline', () => abrirLink(fs.xmlUrl)));
                    if (podeCancelar()) a.appendChild(botao('<i class="fas fa-ban"></i> Cancelar nota', 'btn-outline', async () => {
                        const ok = await janelaCancelar('NFS-e' + (fs.numero ? ' nº ' + fs.numero : ''), fs.provedor === 'asaas' ? 'O Asaas pede o cancelamento à prefeitura. Algumas prefeituras não aceitam cancelar pelo sistema: aí o cancelamento é feito no site da prefeitura.' : 'A Focus NFe pede o cancelamento à prefeitura (prazo e regras dependem da cidade).', fs.provedor !== 'asaas', m => cancelarServico(origemN, fs, m));
                        if (ok) recarregar();
                    }));
                }
                if (['processando', 'cancelando'].includes(fs.status)) a.appendChild(botao('<i class="fas fa-rotate"></i> Atualizar', 'btn-primary', async ev => {
                    await ocupado(ev.currentTarget, 'Consultando…', async () => { try { await atualizarServico(origemN, fs); } catch (e) { toast('warning', e.message); } });
                    recarregar();
                }));
            } else info = `<b>Nota de serviço (NFS-e)</b>${chip('—').replace('—', 'Sem nota')}<small>${origemS.tipo === 'os' ? 'Serviço da OS.' : 'Serviços desta venda: ' + money(U().reais(sv.valor)) + '.'}</small>`;
            if (!cancelada && (!fs || ['erro', 'cancelado'].includes(fs.status))) {
                if (c.ligado && c.servico !== 'nenhum') a.appendChild(botao(`<i class="fas fa-paper-plane"></i> ${fs ? 'Emitir NFS-e de novo' : 'Emitir NFS-e'}`, 'btn-primary', () => janelaServico(origemN, { aoFechar: recarregar })));
                else info += `<small class="dpn-av">${!c.ligado ? 'A emissão de nota fiscal está desligada (Configurações › Fiscal).' : 'A nota de serviço está desligada: escolha Focus NFe ou Asaas em Configurações › Fiscal.'}</small>`;
            }
            l.innerHTML = `<div class="dpn-i">${info}</div>`;
            l.appendChild(a); linhas.push(l);
        }
        box.innerHTML = `<div class="dpn-t"><i class="fas fa-file-invoice"></i> Nota fiscal${!c.producao && c.ligado ? '<span class="dpn-amb">ambiente de teste</span>' : ''}</div>${avisoDemo()}`;
        if (!linhas.length) box.innerHTML += '<div class="dpn-msg">Esta venda não tem itens com valor para nota fiscal.</div>';
        linhas.forEach(l => box.appendChild(l));
    }
    async function janelaVenda(saleId) {
        const s = await lerDoc('sales', saleId); if (!s) { toast('error', 'Venda não encontrada.'); return; }
        const J = janela(`<i class="fas fa-file-invoice" style="color:var(--accent)"></i> Nota fiscal · Venda V-${pad4(s.saleNumber)}`, '<div data-q></div>', 620);
        J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar));
        quadroVenda(J.corpo.querySelector('[data-q]'), saleId, { mostrarSempre: true });
        return J;
    }

    /* ===================== NOTAS DO MÊS: lista, cancelar e XML para o contador (39.9) ===================== */
    const quando = v => { if (!v) return null; try { const d = typeof v === 'string' ? new Date(v) : v.toDate ? v.toDate() : v.__ts ? new Date(v.__ts) : v.seconds ? new Date(v.seconds * 1000) : new Date(v); return isNaN(d) ? null : d; } catch (e) { return null; } };
    const dataNota = (f, doc) => quando(f.autorizadaEm) || quando(f.emitidaEm) || quando(f.dataEmissao) || quando(f.dataTentativa) || quando(f.atualizadaEm) || quando(doc && doc.createdAt);
    const nomeTipo = f => f.tipo === 'nfse' ? 'NFS-e' : f.tipo === 'nfe' ? 'NF-e' : 'NFC-e';
    /** Valor da nota (nota antiga sem o valor gravado: o total da venda, para a NFC-e/NF-e). */
    const valorNota = x => x.f.valor != null && x.f.valor !== '' ? Number(x.f.valor) : (x.f.tipo !== 'nfse' && x.doc && x.doc.total != null ? Number(x.doc.total) : null);
    /** Todas as notas com data no mês (vendas, a NFS-e das OS que fica espelhada na venda, e as contas a receber). */
    async function notasDoMes(ano, mes) {
        const ini = new Date(ano, mes - 1, 1), fim = new Date(ano, mes, 1);
        const desde = new Date(ini.getTime() - 62 * 864e5); // nota do mês de venda feita até 2 meses antes
        let vendas = [];
        try { vendas = (await db.collection('sales').where('createdAt', '>=', desde).get()).docs.map(d => ({ id: d.id, ...d.data() })); }
        catch (e) { try { vendas = (await db.collection('sales').get()).docs.map(d => ({ id: d.id, ...d.data() })); } catch (_) { vendas = []; } }
        const out = [];
        const add = (f, origem, doc, titulo, cliente) => { if (!f || !f.status) return; const dt = dataNota(f, doc); if (!dt || dt < ini || dt >= fim) return; out.push({ f, origem, doc, titulo, cliente: cliente || '', data: dt }); };
        vendas.filter(s => !s.deleted).forEach(s => {
            const t = 'Venda V-' + pad4(s.saleNumber);
            add(s.fiscal, { tipo: 'venda', id: s.id, saleId: s.id }, s, t, s.customerName);
            if (s.fiscalNfse) add(s.fiscalNfse, origemDaVenda(s), s, s.serviceOrderId ? t + ' (OS)' : t, s.customerName);
        });
        try { (await db.collection('financial_entries').get()).docs.forEach(d => { const r = { id: d.id, ...d.data() }; if (r.fiscalNfse && !r.saleId) add(r.fiscalNfse, { tipo: 'receber', id: r.id }, r, r.description || 'Conta a receber', r.customerName || r.debtorName); }); } catch (e) { }
        return out.sort((a, b) => b.data - a.data);
    }
    /** XML da nota no provedor (Focus pela ref; Asaas pelo id da nota; Base pelo link do aviso). null = não veio. */
    async function xmlDaNota(c, f) {
        let r;
        if (f.provedor === 'base') return B() ? B().xml(f) : null;
        if (f.provedor === 'asaas') { if (!f.asaasId) return null; r = await U().chamar(cfgAsaas(c), { provedor: 'asaas', acao: 'nota_xml', id: f.asaasId }); }
        else { if (!f.ref) return null; r = await U().chamar(cfgFocus(c), { acao: 'xml', ref: f.ref, tipo: f.tipo === 'nfse' ? (f.tipoFocus || 'nfse') : f.tipo === 'nfe' ? 'nfe' : 'nfce' }); }
        const t = r && r.ok ? String(r.text || '') : '';
        return /^\s*(<\?xml|<)/.test(t) ? t : null;
    }
    // ZIP sem compressão (o XML já é pequeno), com nomes em UTF-8: abre no Windows e em qualquer programa de contador
    const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
    const crc32 = b => { let c = 0xFFFFFFFF; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
    function zipar(arquivos) {
        const enc = new TextEncoder(), partes = [], central = []; let pos = 0;
        const d = new Date(), dt = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(), tm = (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1);
        for (const a of arquivos) {
            const nome = enc.encode(a.nome), dados = enc.encode(a.texto), crc = crc32(dados);
            const h = new DataView(new ArrayBuffer(30));
            h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true); h.setUint16(10, tm, true); h.setUint16(12, dt, true);
            h.setUint32(14, crc, true); h.setUint32(18, dados.length, true); h.setUint32(22, dados.length, true); h.setUint16(26, nome.length, true); h.setUint16(28, 0, true);
            partes.push(new Uint8Array(h.buffer), nome, dados);
            const cd = new DataView(new ArrayBuffer(46));
            cd.setUint32(0, 0x02014b50, true); cd.setUint16(4, 20, true); cd.setUint16(6, 20, true); cd.setUint16(8, 0x0800, true); cd.setUint16(10, 0, true); cd.setUint16(12, tm, true); cd.setUint16(14, dt, true);
            cd.setUint32(16, crc, true); cd.setUint32(20, dados.length, true); cd.setUint32(24, dados.length, true); cd.setUint16(28, nome.length, true); cd.setUint32(42, pos, true);
            central.push(new Uint8Array(cd.buffer), nome);
            pos += 30 + nome.length + dados.length;
        }
        const tam = central.reduce((s, x) => s + x.length, 0);
        const fimZ = new DataView(new ArrayBuffer(22));
        fimZ.setUint32(0, 0x06054b50, true); fimZ.setUint16(8, arquivos.length, true); fimZ.setUint16(10, arquivos.length, true); fimZ.setUint32(12, tam, true); fimZ.setUint32(16, pos, true);
        return new Blob([...partes, ...central, new Uint8Array(fimZ.buffer)], { type: 'application/zip' });
    }
    function baixarArquivo(blob, nome) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nome; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000); }
    const nomeXml = f => { const t = nomeTipo(f).replace('-', ''); const id = String(f.chave || f.codigoVerificacao || f.ref || '').replace(/^NFe/, '').replace(/[^A-Za-z0-9_-]/g, '').slice(-44); return `${t}-${f.numero || 'sem-numero'}${f.serie != null && f.serie !== '' ? '-serie' + f.serie : ''}${f.status === 'cancelado' ? '-CANCELADA' : ''}${id ? '-' + id : ''}.xml`; };
    async function exportarXml(lista, ano, mes, botao) {
        const c = await cfg(true);
        const validas = lista.filter(x => ['autorizado', 'cancelado'].includes(x.f.status));
        if (!validas.length) { toast('info', 'Nenhuma nota autorizada ou cancelada neste mês.'); return; }
        const arquivos = [], faltou = [];
        const csv = [['Data', 'Nota', 'Numero', 'Serie', 'Chave ou codigo de verificacao', 'Origem', 'Cliente', 'Valor', 'Situacao', 'Emitida por'].join(';')];
        let i = 0;
        for (const x of validas) {
            i++; if (botao) botao.innerHTML = `<i class="fas fa-spinner fa-spin"></i> XML ${i} de ${validas.length}…`;
            const f = x.f;
            let xml = null; try { xml = await xmlDaNota(c, f); } catch (e) { }
            if (xml && !f.chave) { const ch = (/Id="NFe(\d{44})"/.exec(xml) || [])[1]; if (ch) f.chave = ch; } // nota do Base: a chave vem no XML
            if (xml) arquivos.push({ nome: nomeTipo(f).replace('-', '') + '/' + nomeXml(f), texto: xml });
            else faltou.push(`${nomeTipo(f)} nº ${f.numero || '?'} (${x.titulo}): ${f.xmlUrl || (f.provedor === 'base' ? 'baixe no painel do Base by Asaas (Faturamento › Notas fiscais)' : 'sem link do XML')}`);
            csv.push([x.data.toLocaleDateString('pt-BR'), nomeTipo(f), f.numero || '', f.serie ?? '', String(f.chave || f.codigoVerificacao || '').replace(/^NFe/, ''), x.titulo, String(x.cliente).replace(/;/g, ','), valorNota(x) != null ? valorNota(x).toFixed(2).replace('.', ',') : '', (ST[f.status] || [f.status])[0], NOME_PROV[f.provedor] || 'Focus NFe'].join(';'));
        }
        arquivos.push({ nome: 'resumo-das-notas.csv', texto: '﻿' + csv.join('\r\n') });
        if (faltou.length) arquivos.push({ nome: 'LEIA-ME-XML-que-faltaram.txt', texto: 'Estes XML não vieram agora (sem internet ou o provedor não respondeu). Tente de novo ou abra o link de cada um:\r\n\r\n' + faltou.join('\r\n') });
        baixarArquivo(zipar(arquivos), `notas-fiscais-${ano}-${String(mes).padStart(2, '0')}.zip`);
        const n = arquivos.length - 1 - (faltou.length ? 1 : 0);
        toast(faltou.length ? 'warning' : 'success', faltou.length ? `ZIP baixado com ${n} XML; ${faltou.length} não vieram (a lista está dentro do ZIP).` : `ZIP baixado com ${n} XML e o resumo. É só mandar para o contador.`);
    }
    async function janelaNotas() {
        const hoje = new Date();
        const podeXml = ['admin', 'manager', 'financial'].includes(eu().role) || !eu().role;
        const J = janela('<i class="fas fa-file-invoice" style="color:var(--accent)"></i> Notas fiscais emitidas', `${avisoDemo()}
            <div style="display:flex;gap:10px;align-items:center;flex-wrap:wrap"><label style="margin:0">Mês</label><input type="month" class="form-input" data-f="mes" value="${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}" style="width:180px"><span class="dpn-msg" data-f="resumo"></span></div>
            <div data-f="lista" style="margin-top:12px"></div>
            <div class="dpn-msg" style="margin-top:10px">Cancelar: a NFC-e em geral até 30 minutos depois de autorizada e a NF-e até 24 horas (regra da SEFAZ); a NFS-e depende da prefeitura. O ZIP traz os XML do mês e um resumo (planilha) para o contador.</div>`, 980);
        const q = s => J.corpo.querySelector(`[data-f="${s}"]`);
        let lista = [], anoM = hoje.getFullYear(), mesM = hoje.getMonth() + 1;
        const carregar = async () => {
            const [a, m] = String(q('mes').value || '').split('-').map(Number); if (!a || !m) return;
            anoM = a; mesM = m;
            q('lista').innerHTML = '<div class="dpn-msg"><i class="fas fa-spinner fa-spin"></i> Carregando as notas…</div>';
            try { lista = await notasDoMes(a, m); } catch (e) { q('lista').innerHTML = `<div class="dpn-pend">${esc(e.message || e)}</div>`; return; }
            const aut = lista.filter(x => x.f.status === 'autorizado');
            q('resumo').textContent = `${lista.length} nota(s) · ${aut.length} autorizada(s) · ${money(aut.reduce((s, x) => s + (valorNota(x) || 0), 0))}`;
            if (!lista.length) { q('lista').innerHTML = '<div class="dpn-msg" style="padding:16px 0">Nenhuma nota neste mês.</div>'; return; }
            q('lista').innerHTML = `<div style="overflow:auto"><table class="dpn-tab" style="min-width:760px"><thead><tr><th>Data</th><th>Nota</th><th>De onde</th><th>Cliente</th><th>Valor</th><th>Situação</th><th></th></tr></thead><tbody>${lista.map((x, i) => `<tr data-i="${i}">
                <td>${x.data.toLocaleDateString('pt-BR')}</td><td><b>${nomeTipo(x.f)}${x.f.numero ? ' nº ' + esc(x.f.numero) : ''}</b><div class="dpn-msg">${esc(NOME_PROV[x.f.provedor] || 'Focus NFe')}</div></td>
                <td>${esc(x.titulo)}</td><td>${esc(x.cliente || '—')}</td><td>${valorNota(x) != null ? money(valorNota(x)) : '—'}</td><td>${chip(x.f.status)}</td><td><div class="dpn-a"></div></td></tr>`).join('')}</tbody></table></div>`;
            q('lista').querySelectorAll('tr[data-i]').forEach(tr => {
                const x = lista[Number(tr.dataset.i)], f = x.f, a = tr.querySelector('.dpn-a');
                const serv = f.tipo === 'nfse';
                if (f.status === 'autorizado') {
                    a.appendChild(botao('<i class="fas fa-file-pdf"></i>', 'btn-outline', () => serv ? abrirLink(f.pdfUrl || f.linkPrefeitura) : abrirDanfe(f))).title = 'Abrir a nota';
                    if (podeCancelar()) a.appendChild(botao('<i class="fas fa-ban"></i> Cancelar', 'btn-outline', async () => {
                        const ok = serv
                            ? await janelaCancelar('NFS-e' + (f.numero ? ' nº ' + f.numero : ''), f.provedor === 'asaas' ? 'O Asaas pede o cancelamento à prefeitura.' : 'A Focus NFe pede o cancelamento à prefeitura (prazo e regras dependem da cidade).', f.provedor !== 'asaas', m => cancelarServico(x.origem, f, m))
                            : await janelaCancelar(nomeTipo(f) + (f.numero ? ' nº ' + f.numero : ''), f.tipo === 'nfe' ? 'A SEFAZ aceita cancelar a NF-e em até 24 horas depois da autorização.' : 'A SEFAZ aceita cancelar a NFC-e em geral até 30 minutos depois da autorização.', true, m => window.NFCeService.cancelarVenda(x.origem.saleId, m));
                        if (ok) carregar();
                    }));
                }
                if (['autorizado', 'cancelado'].includes(f.status) && podeXml) a.appendChild(botao('XML', 'btn-outline', ev => ocupado(ev.currentTarget, '', async () => {
                    const xml = await xmlDaNota(await cfg(true), f);
                    if (xml) baixarArquivo(new Blob([xml], { type: 'application/xml' }), nomeXml(f));
                    else toast('warning', f.provedor === 'base' && U().ponte() ? 'O XML das notas do Base fica no painel do Base by Asaas (Faturamento › Notas fiscais).' : 'O XML desta nota não veio agora. Confira a internet e tente de novo.');
                }))).title = 'Baixar o XML';
                if (['processando', 'cancelando'].includes(f.status)) a.appendChild(botao('<i class="fas fa-rotate"></i> Atualizar', 'btn-outline', ev => ocupado(ev.currentTarget, '', async () => {
                    try { if (serv) await atualizarServico(x.origem, f); else { const r = await window.NFCeService.atualizarVenda(x.origem.saleId); if (!r.ok && r.error) toast('warning', r.error); } } catch (e) { toast('warning', e.message); }
                    carregar();
                })));
            });
        };
        q('mes').addEventListener('change', carregar);
        J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar));
        if (podeXml) { const bz = botao('<i class="fas fa-file-zipper"></i> Baixar os XML do mês (para o contador)', 'btn-primary', () => ocupado(bz, 'Preparando…', () => exportarXml(lista, anoM, mesM, bz))); J.rodape.appendChild(bz); }
        carregar();
        return J;
    }
    function botaoNotasPedidos() {
        const bar = $('pdkBar'); if (!bar || bar.querySelector('.dpn-notasbtn') || !(cfgCache && cfgCache.ligado)) return;
        const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline dpn-notasbtn'; b.style.cssText = 'padding:8px 12px;font-size:13px;white-space:nowrap';
        b.title = 'Notas fiscais do mês: abrir, cancelar e baixar os XML para o contador';
        b.innerHTML = '<i class="fas fa-file-invoice"></i> Notas fiscais';
        b.addEventListener('click', () => janelaNotas());
        bar.appendChild(b);
    }

    /* ===================== PEDIDOS ===================== */
    function ligarPedidos() {
        if (!$('modalPedido') || typeof window.openDetail !== 'function' || window.openDetail.__dpn) return;
        const orig = window.openDetail;
        const novo = function (id) {
            const r = orig.apply(this, arguments);
            try {
                const body = $('modalPedidoBody');
                if (body && !body.querySelector('.dpn-box')) { const box = document.createElement('div'); body.appendChild(box); quadroVenda(box, String(id), { mudou: () => { try { if (typeof loadOrders === 'function') loadOrders(); } catch (e) { } } }); }
            } catch (e) { console.warn('Nota fiscal no pedido:', e); }
            return r;
        };
        novo.__dpn = true;
        window.openDetail = novo;
        // Selo da nota em cada cartão (a lista já tem os dados da venda)
        const rk = window.renderKanban;
        if (typeof rk === 'function' && !rk.__dpn) {
            const nk = function () { const out = rk.apply(this, arguments); try { selosPedidos(); botaoNotasPedidos(); } catch (e) { } return out; };
            nk.__dpn = true; window.renderKanban = nk;
        }
        selosPedidos();
        cfg().then(botaoNotasPedidos).catch(() => { }); // botão "Notas fiscais" (lista do mês, cancelar e XML) na barra dos pedidos
        // Venda com nota autorizada: avisa antes de cancelar ou excluir (cancele a nota primeiro)
        ['cancelSale', 'deleteSale'].forEach(nome => {
            const fn = window[nome];
            if (typeof fn !== 'function' || fn.__dpn) return;
            const nv = function (id) {
                const args = arguments, self = this;
                let s = null; try { s = (allSales || []).find(x => x.id === id); } catch (e) { }
                const ativas = s ? [s.fiscal && s.fiscal.status === 'autorizado' ? nomeMerc(s.fiscal) + (s.fiscal.numero ? ' nº ' + s.fiscal.numero : '') : '', s.fiscalNfse && s.fiscalNfse.status === 'autorizado' ? 'NFS-e' + (s.fiscalNfse.numero ? ' nº ' + s.fiscalNfse.numero : '') : ''].filter(Boolean) : [];
                if (!ativas.length) return fn.apply(self, args);
                const J = janela('<i class="fas fa-triangle-exclamation" style="color:#d97706"></i> Venda com nota fiscal', `<div class="dpn-msg" style="font-size:13px">Esta venda tem ${esc(ativas.join(' e '))} autorizada. ${nome === 'deleteSale' ? 'Excluir a venda' : 'Cancelar a venda'} <b>não cancela a nota</b>: ela continua valendo na SEFAZ/prefeitura.<br><br>Cancele a nota primeiro (quadro "Nota fiscal" da venda) e depois ${nome === 'deleteSale' ? 'exclua' : 'cancele'} a venda.</div>`, 460);
                J.rodape.appendChild(botao('Voltar', 'btn-outline', J.fechar));
                J.rodape.appendChild(botao('Abrir a nota', 'btn-primary', () => { J.fechar(); janelaVenda(id); }));
                if (podeCancelar()) J.rodape.appendChild(botao(nome === 'deleteSale' ? 'Excluir mesmo assim' : 'Cancelar só a venda', 'btn-danger', () => { J.fechar(); fn.apply(self, args); }));
            };
            nv.__dpn = true; window[nome] = nv;
        });
    }
    function selosPedidos() {
        let lista = []; try { lista = allSales || []; } catch (e) { return; }
        document.querySelectorAll('.kanban-card[onclick*="openDetail("]').forEach(card => {
            if (card.querySelector('.dpn-k')) return;
            const id = ((card.getAttribute('onclick') || '').match(/openDetail\('([^']+)'\)/) || [])[1];
            const s = lista.find(x => x.id === id); if (!s) return;
            const sel = [];
            if (s.fiscal && s.fiscal.status) sel.push([nomeMerc(s.fiscal), s.fiscal.status]);
            if (s.fiscalNfse && s.fiscalNfse.status) sel.push(['NFS-e', s.fiscalNfse.status]);
            if (!sel.length) return;
            const alvo = card.querySelector('.k-id') || card.firstElementChild; if (!alvo) return;
            sel.forEach(([n, st]) => { const x = ST[st] || [st, '#64748b']; const sp = document.createElement('span'); sp.className = 'dpn-k'; sp.style.cssText = `background:${x[1]}22;color:${x[1]}`; sp.title = n + ': ' + x[0]; sp.textContent = n; alvo.after(sp); });
        });
    }

    /* ===================== ORDENS DE SERVIÇO ===================== */
    function ligarOs() {
        if (!$('osTbody')) return;
        const rs = window.renderServiceOrders;
        if (typeof rs === 'function' && !rs.__dpn) {
            const nv = function () { const out = rs.apply(this, arguments); try { botoesOs(); } catch (e) { } return out; };
            nv.__dpn = true; window.renderServiceOrders = nv;
        }
        if (typeof ServiceOrderService !== 'undefined' && ServiceOrderService && typeof ServiceOrderService.receivePayment === 'function' && !ServiceOrderService.receivePayment.__dpn) {
            const orig = ServiceOrderService.receivePayment;
            const nv = async function (orderId) {
                const r = await orig.apply(this, arguments);
                // Logo depois de faturar: oferece a nota de serviço (o técnico ou o caixa pode deixar para depois)
                try { if (r && orderId) setTimeout(async () => { const c = await cfg(true); if (c.servicoOk) janelaServico({ tipo: 'os', id: String(orderId), saleId: r.id || r.saleId || '' }, { aoFechar: recarregarOs }); }, 700); } catch (e) { }
                return r;
            };
            nv.__dpn = true; ServiceOrderService.receivePayment = nv;
        }
        // OS com NFS-e autorizada: cancelar/estornar a OS não cancela a nota (avisa antes)
        const co = window.cancelServiceOrder;
        if (typeof co === 'function' && !co.__dpn) {
            const nv = function (id) {
                const args = arguments, self = this;
                let o = null; try { o = (serviceOrders || []).find(x => x.id === id); } catch (e) { }
                const f = o && o.fiscalNfse;
                if (!f || f.status !== 'autorizado') return co.apply(self, args);
                const J = janela('<i class="fas fa-triangle-exclamation" style="color:#d97706"></i> OS com nota de serviço', `<div class="dpn-msg" style="font-size:13px">Esta OS tem NFS-e${f.numero ? ' nº ' + esc(f.numero) : ''} autorizada. Cancelar a OS <b>não cancela a nota</b>: ela continua valendo na prefeitura.<br><br>Cancele a nota primeiro e depois a OS.</div>`, 460);
                J.rodape.appendChild(botao('Voltar', 'btn-outline', J.fechar));
                if (o.saleId) J.rodape.appendChild(botao('Abrir a nota', 'btn-primary', () => { J.fechar(); janelaVenda(o.saleId).then(x => x && x.aoFechar(recarregarOs)); }));
                if (podeCancelar()) J.rodape.appendChild(botao('Cancelar só a OS', 'btn-danger', () => { J.fechar(); co.apply(self, args); }));
            };
            nv.__dpn = true; window.cancelServiceOrder = nv;
        }
        cfg().then(() => botoesOs()).catch(() => { });
    }
    function recarregarOs() { try { if (typeof loadServiceOrders === 'function') loadServiceOrders(); } catch (e) { } }
    function botoesOs() {
        const tb = $('osTbody'); if (!tb) return;
        let ordens = []; try { ordens = serviceOrders || []; } catch (e) { return; }
        css();
        tb.querySelectorAll('tr').forEach(tr => {
            if (tr.querySelector('.dpn-osbtn')) return;
            const pb = tr.querySelector('[onclick*="printServiceOrder("]'); if (!pb) return;
            const id = (/printServiceOrder\('([^']+)'\)/.exec(pb.getAttribute('onclick') || '') || [])[1];
            const o = ordens.find(x => x.id === id); if (!o) return;
            const f = o.fiscalNfse || null;
            if (!o.saleId && !f) return; // só a OS faturada tem nota de serviço
            if (!f && !(cfgCache && cfgCache.ligado && cfgCache.servico !== 'nenhum')) return; // não usa nota de serviço: sem botão
            const cor = f ? (ST[f.status] || [0, '#64748b'])[1] : '';
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'btn-icon dpn-osbtn';
            b.title = f ? `NFS-e: ${(ST[f.status] || [f.status])[0]}${f.numero ? ' nº ' + f.numero : ''}` : 'Emitir a nota de serviço (NFS-e)';
            b.innerHTML = `<i class="fas fa-file-invoice"></i>${f ? `<i class="dpn-dot" style="background:${cor}"></i>` : ''}`;
            b.addEventListener('click', ev => {
                ev.preventDefault(); ev.stopPropagation();
                if (f && f.status !== 'erro' && o.saleId) janelaVenda(o.saleId).then(J => J && J.aoFechar(recarregarOs));
                else janelaServico({ tipo: 'os', id: o.id, saleId: o.saleId || '' }, { aoFechar: recarregarOs });
            });
            pb.parentNode.insertBefore(b, pb);
        });
    }

    /* ===================== CONTAS A RECEBER ===================== */
    function ligarReceber() {
        if (pagina() !== 'contas-receber.html') return;
        const enfeitar = () => {
            if (!(cfgCache && cfgCache.ligado)) return; // emissão de nota desligada: sem botão
            css();
            document.querySelectorAll('tbody [onclick^="editRec("]').forEach(eb => {
                const td = eb.parentNode; if (!td || td.querySelector('.dpn-recbtn')) return;
                const id = (/editRec\('([^']+)'\)/.exec(eb.getAttribute('onclick') || '') || [])[1]; if (!id) return;
                const b = document.createElement('button');
                b.type = 'button'; b.className = 'btn-icon dpn-recbtn'; b.title = 'Nota fiscal (da venda ou nota de serviço desta conta)';
                b.innerHTML = '<i class="fas fa-file-invoice"></i>';
                b.addEventListener('click', async ev => {
                    ev.preventDefault();
                    const r = await lerDoc('financial_entries', id); if (!r) { toast('error', 'Conta não encontrada.'); return; }
                    if (r.saleId) janelaVenda(String(r.saleId));
                    else if (r.serviceOrderId) janelaServico({ tipo: 'os', id: String(r.serviceOrderId) });
                    else if (r.fiscalNfse && r.fiscalNfse.status !== 'erro') janelaReceber(r);
                    else janelaServico({ tipo: 'receber', id });
                });
                td.insertBefore(b, eb);
            });
        };
        const tb = document.querySelector('tbody');
        if (tb && window.MutationObserver) new MutationObserver(() => enfeitar()).observe(tb, { childList: true });
        cfg().then(enfeitar).catch(() => { });
    }
    /** Conta a receber que já tem NFS-e: mostra a nota (abrir, atualizar, cancelar). */
    function janelaReceber(r) {
        const J = janela(`<i class="fas fa-file-invoice" style="color:var(--accent)"></i> Nota de serviço · ${esc(r.description || 'Conta a receber')}`, '<div data-q class="dpn-box"></div>', 560);
        J.rodape.appendChild(botao('Fechar', 'btn-outline', J.fechar));
        const pintar = async () => {
            const x = await lerDoc('financial_entries', r.id); const fs = x && x.fiscalNfse; const box = J.corpo.querySelector('[data-q]');
            if (!fs) { box.innerHTML = '<div class="dpn-msg">Sem nota.</div>'; return; }
            const origem = { tipo: 'receber', id: r.id };
            box.innerHTML = `<div class="dpn-l"><div class="dpn-i"><b>NFS-e${fs.numero ? ' nº ' + esc(fs.numero) : ''}</b>${chip(fs.status)}<small>${esc(NOME_PROV[fs.provedor] || '')}${fs.valor != null ? ' · ' + money(fs.valor) : ''}</small>${fs.error && fs.status !== 'autorizado' ? `<small class="dpn-err">${esc(fs.error)}</small>` : ''}</div><div class="dpn-a"></div></div>`;
            const a = box.querySelector('.dpn-a');
            if (fs.status === 'autorizado') {
                a.appendChild(botao('<i class="fas fa-file-pdf"></i> Nota', 'btn-outline', () => abrirLink(fs.pdfUrl || fs.linkPrefeitura)));
                if (podeCancelar()) a.appendChild(botao('<i class="fas fa-ban"></i> Cancelar nota', 'btn-outline', async () => { if (await janelaCancelar('NFS-e', 'O cancelamento é pedido à prefeitura.', fs.provedor !== 'asaas', m => cancelarServico(origem, fs, m))) pintar(); }));
            }
            if (['processando', 'cancelando'].includes(fs.status)) a.appendChild(botao('<i class="fas fa-rotate"></i> Atualizar', 'btn-primary', ev => ocupado(ev.currentTarget, 'Consultando…', async () => { try { await atualizarServico(origem, fs); } catch (e) { toast('warning', e.message); } pintar(); })));
            if (fs.status === 'cancelado') a.appendChild(botao('Emitir de novo', 'btn-primary', () => { J.fechar(); janelaServico(origem); }));
        };
        css(); pintar();
    }

    /* ===================== PDV ===================== */
    function ligarPdv() {
        const h = window.handleFiscalEmission;
        if (typeof h !== 'function' || h.__dpn) return;
        const nv = async function (sale, saleId) {
            await h.apply(this, arguments);
            try { await servicoAposVenda(sale, saleId); } catch (e) { console.warn('NFS-e depois da venda:', e); }
        };
        nv.__dpn = true; window.handleFiscalEmission = nv;
    }
    async function servicoAposVenda(sale, saleId) {
        if (!saleId || !sale) return;
        const c = await cfg(true);
        if (!c.servicoOk) return; // só oferece sozinho com a nota de serviço configurada (senão: Pedidos › Nota fiscal)
        if ((c.geral.modoEmissaoNfce || 'perguntar') === 'manual') return; // manual: emite depois, em Pedidos
        const prods = await window.NFCeService.carregarProdutos(sale.items || []);
        const sv = servicoDaVenda(sale, prods);
        if (!(sv.valor > 0)) return;
        // Espera a janela fechar (depois vem a impressão do cupom); erro na janela nunca prende o caixa
        await new Promise(resolve => { janelaServico({ tipo: 'venda', id: String(saleId) }, { aoFechar: resolve }).then(J => { if (!J) resolve(); }, e => { console.warn('NFS-e:', e); resolve(); }); });
    }

    /* ===================== CONFIGURAÇÕES › FISCAL ===================== */
    const CAMPOS = { // id do campo -> settings/general
        dpnAsaasSandbox: 'asaasChaveSandbox', dpnAsaasProducao: 'asaasChaveProducao',
        dpnIbge: 'codigoMunicipio', dpnAliq: 'nfseAliquota', dpnCodNac: 'nfseCodigoNacional', dpnItemLista: 'nfseItemLista',
        dpnCodMun: 'nfseCodigoMunicipal', dpnCnae: 'nfseCnae', dpnTexto: 'nfseTextoPadrao', dpnPadrao: 'nfsePadrao',
        dpnAsaasServId: 'asaasServicoId', dpnAsaasServNome: 'asaasServicoNome', dpnAsaasServCod: 'asaasServicoCodigo', dpnCstPis: 'cstPisCofins',
        dpnBaseSandbox: 'baseChaveSandbox', dpnBaseProducao: 'baseChaveProducao', // 39.10 · Base by Asaas
        // 40.37 · NFS-e Nacional no modelo da reforma tributária
        dpnNbs: 'nfseNbs', dpnIndOp: 'nfseIndOp', dpnIbsCst: 'nfseIbsCbsCst', dpnIbsClass: 'nfseIbsCbsClass',
        dpnTotFed: 'nfseTotTribFed', dpnTotEst: 'nfseTotTribEst', dpnTotMun: 'nfseTotTribMun'
    };
    const CHAVES = ['dpnAsaasSandbox', 'dpnAsaasProducao', 'dpnBaseSandbox', 'dpnBaseProducao'];
    const olho = id => `<button type="button" onclick="togglePassVis('${id}',this)" style="position:absolute;right:8px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:var(--text-muted);padding:0"><i class="fas fa-eye"></i></button>`;
    const campoChave = (id, ph) => `<div style="position:relative"><input type="password" class="form-input" id="${id}" placeholder="${ph}" autocomplete="off" style="width:100%;box-sizing:border-box;padding-right:36px;font-family:monospace;font-size:12px">${olho(id)}</div>`;
    function montarConfig() {
        const tab = $('tabFiscal'); if (!tab || $('dpnProvCard')) return;
        css();
        const ehOffline = !!(U() && U().ponte());
        const focusCard = $('cfg_focus_proxy_url') ? $('cfg_focus_proxy_url').closest('.card') : tab.querySelector('.card');
        // 1) Quem emite cada nota
        const prov = document.createElement('div');
        prov.className = 'card'; prov.id = 'dpnProvCard'; prov.style.marginBottom = '20px';
        prov.innerHTML = `
            <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 6px"><i class="fas fa-route" style="color:var(--accent);margin-right:8px"></i>Nota fiscal: quem emite</h3>
            ${avisoDemo()}
            <div data-dpn="geral" style="display:flex;flex-direction:column;gap:10px;margin:0 0 14px"></div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px">A nota sai pela conta da sua empresa no provedor (Focus NFe ou Asaas). Veja o que cada um emite:</p>
            <table class="dpn-tab"><thead><tr><th>Nota</th><th>Onde aparece</th><th>Focus NFe</th><th>Asaas</th></tr></thead><tbody>
              <tr><td><b>NFC-e</b> (cupom do consumidor)</td><td>PDV e Pedidos</td><td class="s">Emite</td><td class="s">Emite <span style="font-weight:500;color:var(--text-muted)">pelo Base by Asaas</span></td></tr>
              <tr><td><b>NF-e</b> (nota de produto para empresa)</td><td>Pedidos</td><td class="s">Emite</td><td class="s">Emite <span style="font-weight:500;color:var(--text-muted)">pelo Base by Asaas</span></td></tr>
              <tr><td><b>NFS-e</b> (nota de serviço)</td><td>OS, PDV, Pedidos e Contas a receber</td><td class="s">Emite</td><td class="s">Emite</td></tr>
            </tbody></table>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 14px">O <b>Base by Asaas</b> é o sistema de gestão do próprio Asaas: é por ele que o Asaas emite a nota de produto. Precisa de conta <b>PJ</b> no Asaas e de uma chave de API criada dentro do Base.</p>
            <div style="font-weight:600;font-size:14px;color:var(--text-primary)">A nota de produto (NFC-e e NF-e) sai pelo:</div>
            <div class="dpn-prov" id="dpnProdBox">
              <label><input type="radio" name="dpnProd" value="focus"><span><b>Focus NFe</b><small>Usa o token da Focus (abaixo). Os impostos saem de Dados fiscais da empresa e do cadastro do produto.</small></span></label>
              <label><input type="radio" name="dpnProd" value="base"><span><b>Base by Asaas</b><small>Usa a chave de API do Base. Os impostos saem do grupo de impostos configurado no Base.</small></span></label>
              <label><input type="radio" name="dpnProd" value="nenhum"><span><b>Não emitir nota de produto</b><small>O PDV e Pedidos não oferecem NFC-e nem NF-e.</small></span></label>
            </div>
            <div style="font-weight:600;font-size:14px;color:var(--text-primary);margin-top:16px">A nota de serviço (NFS-e) sai pelo:</div>
            <div class="dpn-prov">
              <label><input type="radio" name="dpnServ" value="focus"><span><b>Focus NFe</b><small>Usa o token da Focus (abaixo). Padrão Nacional ou da prefeitura.</small></span></label>
              <label><input type="radio" name="dpnServ" value="asaas"><span><b>Asaas</b><small>Usa a chave de API do Asaas. A configuração fiscal é feita no painel do Asaas.</small></span></label>
              <label><input type="radio" name="dpnServ" value="nenhum"><span><b>Não emitir nota de serviço</b><small>O sistema não oferece a NFS-e.</small></span></label>
            </div>
            <div style="display:flex;justify-content:flex-end;margin-top:12px"><button type="button" class="btn btn-outline" id="dpnVerNotas"><i class="fas fa-list"></i> Notas emitidas: cancelar e XML do mês</button></div>`;
        tab.insertBefore(prov, tab.firstChild);
        // 39.9 · Ligar a nota, o ambiente e o proxy valem para a Focus e para o Asaas: saem do cartão da Focus e vêm para cá
        // (assim o cartão da Focus pode sumir quando só o Asaas é usado)
        const geral = prov.querySelector('[data-dpn="geral"]');
        const linha = id => { const el = $(id); if (!el) return null; const l = el.closest('label.cfg-toggle'); return (l || el).parentElement; };
        const textos = (row, t, s) => { const d = row && row.querySelector('div'); if (!d) return; if (d.children[0]) d.children[0].textContent = t; if (d.children[1]) d.children[1].textContent = s; };
        const emitRow = linha('cfg_emitir_nfe'), ambRow = linha('cfg_ambiente_sefaz'), proxyRow = linha('cfg_focus_proxy_url');
        if (emitRow) { geral.appendChild(emitRow); textos(emitRow, 'Habilitar emissão fiscal', 'Liga a nota fiscal (Focus NFe, Asaas e Base by Asaas)'); }
        if (ambRow) { geral.appendChild(ambRow); textos(ambRow, 'Ambiente', 'Teste (homologação na Focus, sandbox no Asaas e no Base): sem validade fiscal. Produção: nota de verdade.'); }
        if (proxyRow) {
            if (ehOffline) { proxyRow.style.display = 'none'; const n = document.createElement('div'); n.className = 'dpn-info'; n.style.margin = '0'; n.innerHTML = '<i class="fas fa-desktop" style="margin-right:6px"></i>No Windows Offline a nota sai direto deste computador (não precisa de proxy). <b>Precisa de internet na hora de emitir.</b>'; geral.appendChild(n); }
            geral.appendChild(proxyRow); textos(proxyRow, 'URL do proxy PHP', 'O arquivo api/nfce-proxy.php faz a ponte com a Focus NFe, o Asaas e o Base by Asaas');
            if ($('cfg_focus_proxy_url').value === '/api/nfce-proxy.php') $('cfg_focus_proxy_url').placeholder = 'api/nfce-proxy.php';
        }
        if (focusCard) {
            const p = focusCard.querySelector('p'); if (p) p.textContent = 'Token da sua conta na Focus NFe: NFC-e no PDV, NF-e de pedido e, se escolhida acima, a nota de serviço.';
            const t = focusCard.querySelector('h3'); if (t) t.lastChild.textContent = 'Focus NFe (NFC-e, NF-e e NFS-e)';
        }
        const pdvCard = $('modoEmissaoOptions') ? $('modoEmissaoOptions').closest('.card') : null; // "Emissão no PDV" (NFC-e)
        const dadosCard = $('cfg_regime') ? $('cfg_regime').closest('.card') : null;              // regime, série e tributação do produto
        $('dpnVerNotas').addEventListener('click', () => janelaNotas());
        // 2) Asaas
        const asaas = document.createElement('div');
        asaas.className = 'card'; asaas.id = 'dpnAsaasCard'; asaas.style.marginBottom = '20px';
        asaas.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap">
              <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0"><i class="fas fa-building-columns" style="color:var(--accent);margin-right:8px"></i>Asaas (nota de serviço)</h3>
              <span id="dpnAsaasBadge" class="badge" style="display:none"></span>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 12px">Pela chave da conta Asaas sai a <b>NFS-e</b> (a nota de produto do Asaas sai pelo Base by Asaas, escolhido acima). Antes de emitir, configure no painel do Asaas: <b>Notas fiscais › Configurações</b> (prefeitura, inscrição municipal, regime e o certificado digital ou a senha da prefeitura).</p>
            <div class="dpn-form">
              <div class="dpn-g2">
                <div><label><i class="fas fa-flask" style="color:#f59e0b;margin-right:6px"></i>Chave de API do sandbox (teste)</label>${campoChave('dpnAsaasSandbox', '$aact_hmlg_...')}</div>
                <div><label><i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Chave de API de produção</label>${campoChave('dpnAsaasProducao', '$aact_prod_...')}</div>
              </div>
              <div class="dpn-msg" style="margin-top:6px">No Asaas: Integrações › Chaves de API. Vale a chave do ambiente escolhido acima (teste = sandbox).</div>
              <label>Serviço cadastrado na prefeitura</label>
              <div style="display:flex;gap:8px;flex-wrap:wrap"><input type="text" class="form-input" id="dpnAsaasBusca" placeholder="Procurar serviço (ex.: manutenção, consultoria)" style="flex:1;min-width:200px"><button type="button" class="btn btn-outline" id="dpnAsaasBuscar"><i class="fas fa-magnifying-glass"></i> Buscar serviço</button></div>
              <div id="dpnAsaasLista"></div>
              <input type="hidden" id="dpnAsaasServId">
              <div class="dpn-g2">
                <div><label>Nome do serviço (como na prefeitura)</label><input type="text" class="form-input" id="dpnAsaasServNome" maxlength="250"></div>
                <div><label>Código do serviço (contas do Portal Nacional)</label><input type="text" class="form-input" id="dpnAsaasServCod" maxlength="20" placeholder="Só se o Asaas não listar os serviços"></div>
              </div>
              <div class="dpn-msg" id="dpnAsaasServSel" style="margin-top:6px"></div>
              <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">
                <button type="button" class="btn btn-outline" id="dpnAsaasFiscal"><i class="fas fa-list-check"></i> Conferir a configuração fiscal no Asaas</button>
                <button type="button" class="btn btn-outline" id="dpnAsaasTestar"><i class="fas fa-plug"></i> Testar conexão</button>
              </div>
              <div id="dpnAsaasRes"></div>
            </div>`;
        // 2b) 39.10 · Base by Asaas: NFC-e e NF-e
        const baseCard = document.createElement('div');
        baseCard.className = 'card'; baseCard.id = 'dpnBaseCard'; baseCard.style.marginBottom = '20px';
        baseCard.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:8px;flex-wrap:wrap">
              <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0"><i class="fas fa-receipt" style="color:var(--accent);margin-right:8px"></i>Base by Asaas (NFC-e e NF-e)</h3>
              <span id="dpnBaseBadge" class="badge" style="display:none"></span>
            </div>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 10px">O Base é o sistema de gestão do Asaas. A nota de produto sai pela conta da sua empresa lá, com os impostos (CFOP, CST/CSOSN e alíquotas) do <b>grupo de impostos</b> do Base. Os produtos e os clientes da nota são cadastrados no Base sozinhos, na primeira nota de cada um.</p>
            <details style="margin:0 0 12px"><summary style="cursor:pointer;font-weight:600;font-size:13px;color:var(--text-primary)">Como deixar o Base pronto (uma vez só)</summary>
              <ol style="font-size:12.5px;line-height:1.6;color:var(--text-secondary);margin:8px 0 0;padding-left:20px">
                <li>Conta <b>PJ</b> no Asaas, com os documentos aprovados. Ative o Base na <b>Central de Navegação</b> (canto de cima, à direita, na conta do Asaas).</li>
                <li>No Base: <b>Faturamento › Nota Fiscal Eletrônica › Configurar emissão</b>: inscrição estadual, regime, número e série da nota, <b>certificado digital A1</b> e impostos (confira com o contador). Para testar, escolha <b>Homologação</b> no Sandbox.</li>
                <li>NFC-e (cupom do PDV): peça ao suporte do Base para liberar a NFC-e (WhatsApp (47) 99196-7171 ou suportebasebyasaas@asaas.com.br). Depois preencha o <b>CSC e o ID do token</b> (da SEFAZ do seu estado) em Menu do usuário › Perfil › Configurações › Unidade de Negócio › Nota Fiscal Eletrônica, e crie um <b>grupo de impostos com o modelo 65</b>.</li>
                <li>Crie a chave em <b>Menu do usuário › Configurações › Chaves de API</b> e cole abaixo (a do Sandbox para teste). A chave aparece uma vez só: copie antes de sair da tela.</li>
              </ol>
            </details>
            <div class="dpn-form">
              <div class="dpn-g2">
                <div><label><i class="fas fa-flask" style="color:#f59e0b;margin-right:6px"></i>Chave de API do Sandbox (teste)</label>${campoChave('dpnBaseSandbox', '$aeact_...')}</div>
                <div><label><i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Chave de API de produção</label>${campoChave('dpnBaseProducao', '$aeact_...')}</div>
              </div>
              <div class="dpn-msg" style="margin-top:6px">É a chave criada dentro do Base (não é a chave da conta Asaas, que começa com $aact_). Vale a do ambiente escolhido acima.</div>
              <div class="dpn-g2">
                <div><label>Banco do Base onde fica o pagamento da venda</label><select class="form-input" id="dpnBaseBanco"><option value="">O 1º banco do Asaas (padrão)</option></select></div>
                <div><label>NCM padrão (produto sem NCM)</label><input type="text" class="form-input" id="dpnBaseNcm" maxlength="10" inputmode="numeric" placeholder="8 números (opcional)"></div>
              </div>
              <div class="dpn-msg" id="dpnBaseAviso" style="margin-top:10px"></div>
              <div style="display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px">
                <button type="button" class="btn btn-outline" id="dpnBaseTestar"><i class="fas fa-plug"></i> Testar conexão</button>
              </div>
              <div id="dpnBaseRes"></div>
            </div>`;
        if (pdvCard && pdvCard.parentNode === tab) tab.insertBefore(baseCard, pdvCard);
        else if (focusCard && focusCard.parentNode === tab) tab.insertBefore(baseCard, focusCard.nextSibling);
        else tab.appendChild(baseCard);
        // 3) Nota de serviço (dados comuns e os da Focus)
        const nfse = document.createElement('div');
        nfse.className = 'card'; nfse.id = 'dpnNfseCard'; nfse.style.marginBottom = '20px';
        nfse.innerHTML = `
            <h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin:0 0 6px"><i class="fas fa-screwdriver-wrench" style="color:var(--accent);margin-right:8px"></i>Nota de serviço (NFS-e)</h3>
            <p style="font-size:12px;color:var(--text-muted);margin:0 0 4px">Confira os códigos com o contador: eles mudam de cidade para cidade.</p>
            <div class="dpn-form">
              <div class="dpn-g2">
                <div><label>Alíquota do ISS (%)</label><input type="text" class="form-input" id="dpnAliq" inputmode="decimal" placeholder="Ex.: 2 ou 5 (em branco: a da prefeitura)"></div>
                <div><label style="display:flex;gap:8px;align-items:center;margin-top:34px;font-weight:500"><input type="checkbox" id="dpnRetido"> O ISS é retido pelo cliente</label></div>
              </div>
              <label>Texto que vai em toda nota de serviço (opcional)</label><input type="text" class="form-input" id="dpnTexto" maxlength="250" placeholder="Ex.: Garantia de 90 dias">
              <div id="dpnFocusNfse">
                <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-top:16px">Só para a Focus NFe</div>
                <div class="dpn-g2">
                  <div><label>Código IBGE da cidade da empresa</label><div style="display:flex;gap:6px"><input type="text" class="form-input" id="dpnIbge" maxlength="7" inputmode="numeric" placeholder="7 números"><button type="button" class="btn btn-outline" id="dpnIbgeCep" title="Buscar pelo CEP da empresa"><i class="fas fa-location-dot"></i></button></div></div>
                  <div><label>Padrão da NFS-e da sua cidade</label><select class="form-input" id="dpnPadrao"><option value="nacional">NFS-e Nacional (Portal Nacional)</option><option value="municipal">Sistema próprio da prefeitura</option></select></div>
                </div>
                <div id="dpnNacBox">
                <div class="dpn-g2">
                  <div><label>Código de tributação nacional (6 números)</label><input type="text" class="form-input" id="dpnCodNac" maxlength="8" inputmode="numeric" placeholder="Ex.: 140101"></div>
                  <div><label>Código de tributação municipal (3 números)</label><input type="text" class="form-input" id="dpnCodMun" maxlength="5" inputmode="numeric" placeholder="Ex.: 001"></div>
                </div>
                <div class="dpn-g2">
                  <div><label>Código NBS do serviço (9 números)</label><input type="text" class="form-input" id="dpnNbs" maxlength="13" inputmode="numeric" placeholder="Ex.: 1.1403.10.00"></div>
                  <div><label>Indicador da operação IBS/CBS (cIndOp)</label><input type="text" class="form-input" id="dpnIndOp" maxlength="6" inputmode="numeric" placeholder="100301"></div>
                </div>
                <div class="dpn-g2">
                  <div><label>CST do IBS/CBS</label><input type="text" class="form-input" id="dpnIbsCst" maxlength="3" inputmode="numeric" placeholder="000"></div>
                  <div><label>Classificação tributária IBS/CBS (cClassTrib)</label><input type="text" class="form-input" id="dpnIbsClass" maxlength="6" inputmode="numeric" placeholder="000001"></div>
                </div>
                <div style="font-weight:600;font-size:12.5px;color:var(--text-primary);margin-top:10px">Tributos aproximados (%) · só para empresa do regime normal (não optante do Simples)</div>
                <div class="dpn-g2" style="grid-template-columns:repeat(3,minmax(0,1fr))">
                  <div><label>Federais</label><input type="text" class="form-input" id="dpnTotFed" inputmode="decimal" placeholder="Ex.: 13,45"></div>
                  <div><label>Estaduais</label><input type="text" class="form-input" id="dpnTotEst" inputmode="decimal" placeholder="0"></div>
                  <div><label>Municipais</label><input type="text" class="form-input" id="dpnTotMun" inputmode="decimal" placeholder="a alíquota do ISS"></div>
                </div>
                <div class="dpn-msg" style="margin-top:8px">Modelo novo da NFS-e Nacional (reforma tributária). O código municipal e o NBS aparecem no Emissor Nacional ao escolher o serviço; em branco, o indicador da operação, o CST e a classificação usam 100301, 000 e 000001 (confira com o contador). Simples Nacional e MEI não precisam dos tributos aproximados.</div>
                </div>
                <div class="dpn-g2" id="dpnMunBox">
                  <div><label>Item da lista de serviços (LC 116)</label><input type="text" class="form-input" id="dpnItemLista" maxlength="10" placeholder="Ex.: 14.01"></div>
                  <div><label>CNAE (opcional)</label><input type="text" class="form-input" id="dpnCnae" maxlength="9" inputmode="numeric"></div>
                </div>
                <div class="dpn-msg" style="margin-top:8px">A Focus usa também a <b>Inscrição Municipal</b> e o CNPJ da aba Empresa.</div>
              </div>
              <div id="dpnNfseFalta"></div>
            </div>`;
        const depois = pdvCard || focusCard;
        if (depois && depois.parentNode === tab) { tab.insertBefore(asaas, depois.nextSibling); tab.insertBefore(nfse, asaas.nextSibling); }
        else { tab.appendChild(asaas); tab.appendChild(nfse); }
        // CST de PIS/COFINS junto da tributação padrão
        const cs = $('cfg_csosn_padrao'), grid = cs && cs.parentElement && cs.parentElement.parentElement; // grade da "Tributação padrão"
        if (grid && !$('dpnCstPis')) { const d = document.createElement('div'); d.style.cssText = 'display:flex;justify-content:space-between;align-items:center;padding:10px 12px;border-radius:8px;background:var(--bg-secondary)'; d.title = 'Padrão 07. Simples Nacional costuma usar 07, 49 ou 99: confirme com o contador'; d.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">CST PIS/COFINS</div><input type="text" class="form-input" id="dpnCstPis" maxlength="2" inputmode="numeric" placeholder="07" style="width:80px;text-align:center">'; grid.appendChild(d); }
        // Comportamento
        const pinta = () => {
            const v = (document.querySelector('input[name="dpnServ"]:checked') || {}).value || 'focus';
            const pv = (document.querySelector('input[name="dpnProd"]:checked') || {}).value || 'focus';
            document.querySelectorAll('.dpn-prov label').forEach(l => l.classList.toggle('on', !!l.querySelector('input:checked')));
            // 39.9/39.10 · Cada cartão só aparece para quem usa: Focus (produto e/ou serviço), Base (produto), Asaas (serviço)
            const usaFocus = v === 'focus' || pv === 'focus';
            if (focusCard && focusCard !== prov) {
                focusCard.style.display = usaFocus ? '' : 'none';
                const p = focusCard.querySelector('p');
                if (p) p.textContent = 'Token da sua conta na Focus NFe: ' + (pv === 'focus' && v === 'focus' ? 'NFC-e no PDV, NF-e de pedido e a nota de serviço.' : pv === 'focus' ? 'NFC-e no PDV e NF-e de pedido.' : 'a nota de serviço (NFS-e).');
            }
            if (pdvCard) pdvCard.style.display = pv === 'nenhum' ? 'none' : ''; // "Emissão no PDV" vale para a Focus e para o Base
            if (dadosCard) dadosCard.style.display = pv === 'focus' ? '' : 'none'; // tributação do produto: no Base é o grupo de impostos de lá
            baseCard.style.display = pv === 'base' ? '' : 'none';
            asaas.style.display = v === 'asaas' ? '' : 'none';
            nfse.style.display = v === 'nenhum' ? 'none' : '';
            $('dpnFocusNfse').style.display = v === 'focus' ? '' : 'none';
            const pad = $('dpnPadrao').value;
            $('dpnNacBox').style.display = pad === 'nacional' ? '' : 'none';
            $('dpnMunBox').style.display = pad === 'municipal' ? '' : 'none';
        };
        prov.addEventListener('change', pinta); $('dpnPadrao').addEventListener('change', pinta);
        // NCM padrão: o mesmo campo da "Tributação padrão" (que some com o Base); os dois ficam iguais
        const ncmFocus = $('cfg_ncm_padrao');
        $('dpnBaseNcm').addEventListener('input', e => { if (ncmFocus) ncmFocus.value = dig(e.target.value).slice(0, 8); });
        if (ncmFocus) ncmFocus.addEventListener('input', () => { $('dpnBaseNcm').value = ncmFocus.value; });
        $('dpnBaseTestar').addEventListener('click', ev => ocupado(ev.currentTarget, 'Testando…', testarBase));
        $('dpnIbgeCep').addEventListener('click', async () => {
            const cep = dig(($('cfg_cep') || {}).value);
            if (cep.length !== 8) { toast('warning', 'Preencha o CEP da empresa na aba Empresa.'); return; }
            const ib = await ibgeDoCep(cep); if (ib) { $('dpnIbge').value = ib; toast('success', 'Código IBGE preenchido: ' + ib); } else toast('warning', 'Não achei o código pelo CEP. Procure "código IBGE" da sua cidade e digite.');
        });
        $('dpnAsaasBuscar').addEventListener('click', ev => ocupado(ev.currentTarget, 'Buscando…', buscarServicosAsaas));
        $('dpnAsaasBusca').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('dpnAsaasBuscar').click(); } });
        $('dpnAsaasTestar').addEventListener('click', ev => ocupado(ev.currentTarget, 'Testando…', testarAsaas));
        $('dpnAsaasFiscal').addEventListener('click', ev => ocupado(ev.currentTarget, 'Conferindo…', conferirAsaas));
        $('dpnAsaasServNome').addEventListener('input', () => { $('dpnAsaasServId').value = ''; pintaServ(); });
        window.__dpnPintaConfig = pinta;
        // "Testar conexão" da Focus: o novo funciona também no Windows Offline e entende a resposta de hoje da Focus
        window.testFocusConnection = testarFocus;
        // Salvar da aba Fiscal grava também os campos novos; Cancelar recarrega os dois
        interceptar('saveTab', orig => async function (aba) { if (aba === 'fiscal') { const ok = await salvarConfig(); if (!ok) return; } return orig.apply(this, arguments); });
        interceptar('loadSettings', orig => async function () { const r = await orig.apply(this, arguments); try { await preencherConfig(); } catch (e) { } return r; });
        preencherConfig();
    }
    function pintaServ() {
        const id = ($('dpnAsaasServId') || {}).value, nome = ($('dpnAsaasServNome') || {}).value;
        const el = $('dpnAsaasServSel'); if (!el) return;
        el.innerHTML = id ? `<i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Serviço escolhido no Asaas: <b>${esc(nome)}</b> (id ${esc(id)})` : '';
    }
    async function preencherConfig() {
        const c = await cfg(true), g = c.geral;
        Object.entries(CAMPOS).forEach(([id, k]) => {
            const el = $(id); if (!el) return;
            // A chave só aparece para o administrador (cargo ainda não carregado: espera; esta tela já é só do administrador)
            if (CHAVES.includes(id)) {
                const papel = eu().role;
                if (!papel) { el.value = ''; el.disabled = true; esperarPapel(); return; }
                if (papel !== 'admin') { el.value = ''; el.disabled = true; el.placeholder = 'Só o administrador vê e altera a chave'; return; }
                el.disabled = false;
            }
            const v = g[k];
            if (id === 'dpnPadrao') el.value = v === 'municipal' ? 'municipal' : 'nacional';
            else if (['dpnAliq', 'dpnTotFed', 'dpnTotEst', 'dpnTotMun'].includes(id)) el.value = v != null && v !== '' ? String(v).replace('.', ',') : '';
            else el.value = v != null ? String(v) : '';
        });
        if ($('dpnRetido')) $('dpnRetido').checked = g.nfseIssRetido === true;
        const r = document.querySelector(`input[name="dpnServ"][value="${c.servico}"]`); if (r) r.checked = true;
        const rp = document.querySelector(`input[name="dpnProd"][value="${c.produto}"]`); if (rp) rp.checked = true;
        // 39.10 · Base: banco escolhido, NCM padrão e a situação do aviso
        const sel = $('dpnBaseBanco');
        if (sel) {
            [...sel.options].slice(1).forEach(o => { if (o.value !== String(g.baseBancoId || '')) o.remove(); });
            if (g.baseBancoId && ![...sel.options].some(o => o.value === String(g.baseBancoId))) { const o = document.createElement('option'); o.value = String(g.baseBancoId); o.textContent = g.baseBancoNome || ('Banco ' + g.baseBancoId); sel.appendChild(o); }
            sel.value = g.baseBancoId ? String(g.baseBancoId) : '';
            sel.dataset.amb = g.baseBancoAmbiente || c.ambiente;
        }
        if ($('dpnBaseNcm')) $('dpnBaseNcm').value = (($('cfg_ncm_padrao') || {}).value || g.ncmPadrao || '');
        pintarAvisoBase(c);
        pintaServ();
        if (window.__dpnPintaConfig) window.__dpnPintaConfig();
        mostrarFalta(c);
    }
    let esperandoPapel = false;
    function esperarPapel() {
        if (esperandoPapel) return; esperandoPapel = true;
        let n = 0;
        const t = setInterval(() => { if (eu().role || ++n > 120) { clearInterval(t); esperandoPapel = false; if (eu().role) preencherConfig(); } }, 250);
    }
    function mostrarFalta(c) {
        const el = $('dpnNfseFalta'); if (!el) return;
        el.innerHTML = c.servico !== 'nenhum' && c.servicoFalta.length ? `<div class="dpn-pend" style="margin-top:14px"><b>Para emitir a nota de serviço falta:</b><br>${c.servicoFalta.map(esc).join('<br>')}</div>` : (c.servico !== 'nenhum' ? '<div class="dpn-info" style="margin-top:14px;background:rgba(16,185,129,.1)"><i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Nota de serviço pronta para emitir.</div>' : '');
    }
    function lerConfigTela() {
        const d = {};
        Object.entries(CAMPOS).forEach(([id, k]) => {
            const el = $(id); if (!el || el.disabled) return;
            let v = String(el.value || '').trim();
            if (['dpnIbge', 'dpnCodNac', 'dpnCnae', 'dpnCstPis', 'dpnNbs', 'dpnIndOp', 'dpnIbsCst', 'dpnIbsClass'].includes(id)) v = dig(v);
            if (['dpnAliq', 'dpnTotFed', 'dpnTotEst', 'dpnTotMun'].includes(id)) { v = v === '' ? '' : num(v); }
            d[k] = v;
        });
        d.nfseIssRetido = !!($('dpnRetido') && $('dpnRetido').checked);
        d.notaServicoProvedor = (document.querySelector('input[name="dpnServ"]:checked') || {}).value || 'focus';
        // 39.10 · Quem emite a nota de produto (focusProduto continua gravado para as telas antigas)
        d.notaProdutoProvedor = (document.querySelector('input[name="dpnProd"]:checked') || {}).value || 'focus';
        d.focusProduto = d.notaProdutoProvedor === 'focus';
        const sel = $('dpnBaseBanco');
        if (sel) {
            d.baseBancoId = sel.value || '';
            d.baseBancoNome = sel.value ? String(sel.options[sel.selectedIndex].textContent || '') : '';
            d.baseBancoAmbiente = sel.value ? (sel.dataset.amb || ($('cfg_ambiente_sefaz') || {}).value || 'homologacao') : '';
        }
        return d;
    }
    /** Linha do cartão do Base que diz se o aviso (PDF e XML automáticos) está ligado. */
    function pintarAvisoBase(c) {
        const el = $('dpnBaseAviso'); if (!el) return;
        const g = c.geral;
        if (U() && U().ponte()) el.innerHTML = '<i class="fas fa-desktop" style="margin-right:6px"></i>No Windows Offline o número e a situação da nota vêm do Base. O PDF (DANFE) e o XML ficam no painel do Base by Asaas (Faturamento › Notas fiscais).';
        else if (g.baseAvisoId && (g.baseAvisoAmbiente || 'homologacao') === c.ambiente) el.innerHTML = '<i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Avisos do Base ligados: o PDF (DANFE), o XML e o motivo de uma recusa chegam sozinhos.';
        else el.innerHTML = '<i class="fas fa-circle-info" style="margin-right:6px"></i>Clique em <b>Testar conexão</b>: ele também liga o aviso do Base, que traz o PDF (DANFE) e o XML de cada nota.';
    }
    async function salvarConfig() {
        const d = lerConfigTela();
        if (d.nfseAliquota !== '' && (d.nfseAliquota < 0 || d.nfseAliquota > 10)) { toast('warning', 'A alíquota do ISS fica entre 0% e 10% (ex.: 2 ou 5).'); return false; }
        if (d.codigoMunicipio && d.codigoMunicipio.length !== 7) { toast('warning', 'O código IBGE da cidade tem 7 números.'); return false; }
        if (d.nfseCodigoNacional && d.nfseCodigoNacional.length !== 6) { toast('warning', 'O código de tributação nacional tem 6 números (ex.: 140101).'); return false; }
        // 40.37 · campos da NFS-e Nacional (reforma tributária)
        if (d.nfsePadrao !== 'municipal' && d.nfseCodigoMunicipal && dig(d.nfseCodigoMunicipal).length > 3) { toast('warning', 'Na NFS-e Nacional o código de tributação municipal tem até 3 números (ex.: 001).'); return false; }
        if (d.nfseNbs && d.nfseNbs.length !== 9) { toast('warning', 'O código NBS tem 9 números (ex.: 1.1403.10.00 = 114031000).'); return false; }
        if (d.nfseIndOp && d.nfseIndOp.length !== 6) { toast('warning', 'O indicador da operação tem 6 números (ex.: 100301).'); return false; }
        if (d.nfseIbsCbsCst && d.nfseIbsCbsCst.length !== 3) { toast('warning', 'O CST do IBS/CBS tem 3 números (ex.: 000).'); return false; }
        if (d.nfseIbsCbsClass && d.nfseIbsCbsClass.length !== 6) { toast('warning', 'A classificação tributária do IBS/CBS tem 6 números (ex.: 000001).'); return false; }
        if (['nfseTotTribFed', 'nfseTotTribEst', 'nfseTotTribMun'].some(k => d[k] !== '' && d[k] !== undefined && (d[k] < 0 || d[k] > 100))) { toast('warning', 'Os tributos aproximados ficam entre 0% e 100%.'); return false; }
        const avisoChave = (v, pref, nome) => v && !v.startsWith(pref) ? `A chave de ${nome} do Asaas costuma começar com ${pref}. ` : '';
        const av = (d.asaasChaveSandbox !== undefined ? avisoChave(d.asaasChaveSandbox, '$aact_hmlg_', 'sandbox') : '') + (d.asaasChaveProducao !== undefined ? avisoChave(d.asaasChaveProducao, '$aact_prod_', 'produção') : '');
        if (av) toast('warning', av + 'Confira se não trocou as duas.');
        // 39.10 · A chave da conta Asaas ($aact_) colada no lugar da chave do Base
        if ([d.baseChaveSandbox, d.baseChaveProducao].some(v => v && /^\$aact_/.test(v))) toast('warning', 'A chave colada no Base parece a chave da conta Asaas ($aact_...). A chave do Base é criada dentro do Base: Menu do usuário › Configurações › Chaves de API.');
        if (d.notaProdutoProvedor === 'base') { const prodA = (($('cfg_ambiente_sefaz') || {}).value) === 'producao'; if (!(prodA ? d.baseChaveProducao : d.baseChaveSandbox) && ehAdmin()) toast('warning', `Falta a chave de ${prodA ? 'produção' : 'Sandbox'} do Base by Asaas: sem ela a NFC-e e a NF-e não saem.`); }
        if (B()) B().limparCache();
        try {
            await db.collection('settings').doc('general').set(d, { merge: true });
            cfgCache = null;
            const c1 = await cfg(true);
            mostrarFalta(c1); pintarAvisoBase(c1);
            return true;
        } catch (e) { toast('error', 'Não salvou os dados da nota fiscal: ' + (window.dpErroHumano ? dpErroHumano(e) : e.message)); return false; }
    }
    /** Config da tela (ainda não salva) para os botões de teste. */
    async function cfgDaTela() {
        const c = await cfg(true);
        const amb = ($('cfg_ambiente_sefaz') || {}).value || c.geral.ambienteSefaz;
        const g = { ...c.geral, ...lerConfigTela(), ambienteSefaz: amb, focusProxyUrl: ($('cfg_focus_proxy_url') || {}).value || c.geral.focusProxyUrl };
        ['focusTokenHomolog', 'focusTokenProducao'].forEach(k => { const el = $(k === 'focusTokenHomolog' ? 'cfg_focus_token_homolog' : 'cfg_focus_token_producao'); if (el && el.value.trim()) g[k] = el.value.trim(); });
        const prod = amb === 'producao';
        return { g, prod, asaasChave: String((prod ? g.asaasChaveProducao : g.asaasChaveSandbox) || '').trim() };
    }
    function badge(id, txt, cor) { const b = $(id); if (b) { b.textContent = txt; b.style.color = cor; b.style.background = cor + '2e'; b.style.display = ''; } }
    /** 39.10 · "Testar conexão" do Base: confere a chave, lista os bancos do Base e liga o aviso (PDF e XML automáticos). */
    async function testarBase() {
        const t = await cfgDaTela();
        const res = $('dpnBaseRes');
        if (!B()) { toast('error', 'Recarregue a página (o arquivo do Base by Asaas não carregou).'); return; }
        if (!U().ponte() && !U().proxyUrl(t.g)) { toast('warning', 'Informe a URL do proxy PHP.'); return; }
        const r = await B().testar(t.g);
        if (!r.ok) { badge('dpnBaseBadge', '✗ Não conectou', '#ef4444'); res.innerHTML = `<div class="dpn-pend">${esc(r.error)}</div>`; return; }
        badge('dpnBaseBadge', '✓ Conectado', '#10b981');
        const sel = $('dpnBaseBanco'), atual = sel.value;
        sel.innerHTML = '<option value="">O 1º banco do Asaas (padrão)</option>' + r.bancos.map(b => `<option value="${esc(b.id)}">${esc(b.nome)}</option>`).join('');
        if (atual && r.bancos.some(b => b.id === atual)) sel.value = atual;
        sel.dataset.amb = r.ambiente;
        const a = r.aviso || {};
        const el = $('dpnBaseAviso');
        if (a.estado === 'ok') {
            el.innerHTML = '<i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Avisos do Base ligados: o PDF (DANFE), o XML e o motivo de uma recusa chegam sozinhos.';
            await guardarAvisoBase(a.id, r.ambiente);
        } else if (a.estado === 'offline') pintarAvisoBase(await cfg(true));
        else if (a.estado === 'sem_url') el.innerHTML = '<i class="fas fa-triangle-exclamation" style="color:#d97706;margin-right:6px"></i>O Base só manda o aviso para site com HTTPS e endereço público. Aqui (endereço local ou sem HTTPS) a nota sai, mas o PDF e o XML ficam no painel do Base (Faturamento › Notas fiscais).';
        else el.innerHTML = `<i class="fas fa-triangle-exclamation" style="color:#d97706;margin-right:6px"></i>Não deu para ligar o aviso do Base (${esc(a.msg || 'erro')}). A nota sai; o PDF e o XML ficam no painel do Base até o aviso funcionar.`;
        res.innerHTML = r.bancos.length
            ? `<div class="dpn-info" style="background:rgba(16,185,129,.1)">Conectado ao Base by Asaas (${r.ambiente === 'producao' ? 'produção' : 'Sandbox'}). Escolha o banco onde fica o pagamento das vendas e clique em <b>Salvar</b>.</div>`
            : '<div class="dpn-pend">Conectado, mas o Base não tem nenhum banco. Cadastre um no Base (Financeiro › Bancos) e teste de novo.</div>';
    }
    /** Guarda o aviso do Base ligado (só o administrador mexe em Configurações). */
    async function guardarAvisoBase(id, ambiente) {
        if (eu().role && eu().role !== 'admin') return;
        try {
            await db.collection('settings').doc('general').set({ baseAvisoId: id, baseAvisoAmbiente: ambiente }, { merge: true });
            cfgCache = null;
        } catch (e) { console.warn('Aviso do Base:', e); }
    }
    async function testarAsaas() {
        const t = await cfgDaTela();
        const res = $('dpnAsaasRes');
        if (!t.asaasChave) { toast('warning', `Informe a chave de ${t.prod ? 'produção' : 'sandbox'} do Asaas.`); return; }
        const r = await U().chamar({ ...t.g, _asaasChave: t.asaasChave }, { provedor: 'asaas', acao: 'conta' });
        if (r.ok && r.data) {
            badge('dpnAsaasBadge', '✓ Conectado', '#10b981');
            res.innerHTML = `<div class="dpn-info" style="background:rgba(16,185,129,.1)">Conectado à conta <b>${esc(r.data.name || r.data.companyName || '')}</b>${r.data.cpfCnpj ? ' · ' + esc(r.data.cpfCnpj) : ''} (${t.prod ? 'produção' : 'sandbox'}).${U().docLimpo(r.data.cpfCnpj) && U().docLimpo(t.g.cnpj) && U().docLimpo(r.data.cpfCnpj) !== U().docLimpo(t.g.cnpj) ? '<br><b style="color:#d97706">Atenção: o CNPJ da conta do Asaas é diferente do CNPJ de Configurações › Empresa.</b>' : ''}</div>`;
        } else {
            badge('dpnAsaasBadge', '✗ Não conectou', '#ef4444');
            res.innerHTML = `<div class="dpn-pend">${esc(erroAsaas(r))}</div>`;
        }
    }
    async function conferirAsaas() {
        const t = await cfgDaTela();
        const res = $('dpnAsaasRes');
        if (!t.asaasChave) { toast('warning', 'Informe a chave do Asaas.'); return; }
        const cc = { ...t.g, _asaasChave: t.asaasChave };
        const [fi, mo] = await Promise.all([U().chamar(cc, { provedor: 'asaas', acao: 'info_fiscal' }), U().chamar(cc, { provedor: 'asaas', acao: 'opcoes_municipais' })]);
        const linhas = [];
        if (fi.ok && fi.data) {
            const d = fi.data;
            linhas.push('<i class="fas fa-circle-check" style="color:#10b981;margin-right:6px"></i>Configuração fiscal feita no Asaas' + (d.municipalInscription ? ' · inscrição municipal ' + esc(d.municipalInscription) : '') + (d.simplesNacional ? ' · Simples Nacional' : '') + (d.cnae ? ' · CNAE ' + esc(d.cnae) : ''));
            if (d.certificateSent === false) linhas.push('<i class="fas fa-triangle-exclamation" style="color:#d97706;margin-right:6px"></i>O certificado digital ainda não foi enviado ao Asaas (algumas prefeituras exigem).');
        } else if (fi.status === 404) linhas.push('<i class="fas fa-triangle-exclamation" style="color:#ef4444;margin-right:6px"></i>A configuração fiscal ainda não foi feita no Asaas: no painel, Notas fiscais › Configurações.');
        else linhas.push(esc(erroAsaas(fi)));
        if (mo.ok && mo.data) {
            const d = mo.data;
            linhas.push(`Prefeitura: autenticação por ${esc({ CERTIFICATE: 'certificado digital', TOKEN: 'token', USER_AND_PASSWORD: 'usuário e senha' }[d.authenticationType] || d.authenticationType || '—')} · ${d.supportsCancellation === false ? '<b>não aceita cancelar pelo sistema</b> (cancele no site da prefeitura)' : 'aceita cancelar pelo sistema'}.`);
        }
        res.innerHTML = `<div class="dpn-info">${linhas.join('<br>')}</div>`;
    }
    async function buscarServicosAsaas() {
        const t = await cfgDaTela();
        const box = $('dpnAsaasLista');
        if (!t.asaasChave) { toast('warning', 'Informe a chave do Asaas.'); return; }
        const r = await U().chamar({ ...t.g, _asaasChave: t.asaasChave }, { provedor: 'asaas', acao: 'servicos', q: $('dpnAsaasBusca').value.trim() });
        if (!r.ok) { box.innerHTML = `<div class="dpn-pend">${esc(erroAsaas(r))}</div>`; return; }
        const lista = (r.data && Array.isArray(r.data.data)) ? r.data.data : [];
        if (!lista.length) { box.innerHTML = '<div class="dpn-info">Nenhum serviço encontrado. Contas do Portal Nacional não têm lista: digite o código e o nome do serviço abaixo.</div>'; return; }
        box.innerHTML = `<div class="dpn-lista">${lista.map((s, i) => `<button type="button" data-i="${i}"><b>${esc(s.description || '')}</b>${s.issTax != null ? ` · ISS ${esc(String(s.issTax).replace('.', ','))}%` : ''}<br><small style="color:var(--text-muted)">id ${esc(s.id)}</small></button>`).join('')}</div>`;
        box.querySelectorAll('[data-i]').forEach(b => b.addEventListener('click', () => {
            const s = lista[Number(b.dataset.i)];
            $('dpnAsaasServId').value = s.id || ''; $('dpnAsaasServNome').value = s.description || '';
            if (s.issTax != null && !$('dpnAliq').value) $('dpnAliq').value = String(s.issTax).replace('.', ',');
            box.innerHTML = ''; pintaServ();
            toast('info', 'Serviço escolhido. Clique em Salvar para gravar.');
        }));
    }
    async function testarFocus() {
        const t = await cfgDaTela();
        const token = String((t.prod ? t.g.focusTokenProducao : t.g.focusTokenHomolog) || '').trim();
        const badgeEl = 'focusStatusBadge';
        if (!U().ponte() && !String(t.g.focusProxyUrl || '').trim() && !U().proxyUrl(t.g)) { toast('warning', 'Informe a URL do proxy PHP.'); return; }
        if (!token) { toast('warning', `Informe o Token de ${t.prod ? 'Produção' : 'Homologação'}.`); return; }
        const btn = $('btnTestFocus'); const old = btn ? btn.innerHTML : '';
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Testando…'; }
        badge(badgeEl, 'Testando…', '#f59e0b');
        try {
            // Consulta uma nota que não existe: "não encontrada" = token aceito e proxy funcionando
            const r = await U().chamar({ ...t.g, _token: token }, { acao: 'consultar', ref: 'teste_ping_' + Date.now() });
            const cod = String((r.data || {}).codigo || '');
            if (r.status === 404 && /nao_encontrad/.test(cod)) { badge(badgeEl, '✓ Conectado', '#10b981'); toast('success', 'Token aceito pela Focus NFe. Integração funcionando.'); }
            else if (r.status === 404 && !cod) { badge(badgeEl, '✗ Proxy não encontrado', '#ef4444'); toast('error', U().erroTexto(r)); }
            else if (r.status === 0) { badge(badgeEl, '✗ Inacessível', '#ef4444'); toast('error', U().erroTexto(r)); }
            else if (r.status === 401 || r.status === 403) { badge(badgeEl, '✗ Token recusado', '#ef4444'); toast('error', U().erroTexto(r)); }
            else if (r.ok) { badge(badgeEl, '✓ Conectado', '#10b981'); toast('success', 'Proxy e token funcionando.'); }
            else { badge(badgeEl, '⚠ Status ' + r.status, '#f59e0b'); toast('warning', U().erroTexto(r)); }
        } finally { if (btn) { btn.disabled = false; btn.innerHTML = old; } }
    }
    /** Embrulha window[nome] agora e também quando a página trocar a função depois (o pages.js cria saveTab ao iniciar). */
    function interceptar(nome, embrulhar) {
        const marcar = f => { if (typeof f !== 'function' || f.__dpn) return f; const n = embrulhar(f); n.__dpn = true; return n; };
        let atual = marcar(window[nome]);
        try { Object.defineProperty(window, nome, { configurable: true, enumerable: true, get() { return atual; }, set(v) { atual = marcar(v); } }); }
        catch (e) { window[nome] = atual; }
    }

    /* ===================== LIGAR ===================== */
    function boot() {
        if (!window.NFCeService || !U()) return;
        const p = pagina();
        try { if (p === 'configuracoes.html') montarConfig(); } catch (e) { console.warn('Nota fiscal (configurações):', e); }
        try { if (p === 'pedidos.html') ligarPedidos(); } catch (e) { console.warn('Nota fiscal (pedidos):', e); }
        try { if (p === 'ordens-servico.html') ligarOs(); } catch (e) { console.warn('Nota fiscal (OS):', e); }
        try { if (p === 'pdv.html') ligarPdv(); } catch (e) { console.warn('Nota fiscal (PDV):', e); }
        try { ligarReceber(); } catch (e) { console.warn('Nota fiscal (contas a receber):', e); }
    }
    window.DPNotas = { cfg, janelaServico, janelaNfe, janelaVenda, janelaNotas, notasDoMes, zipar, quadroVenda, emitirServico, atualizarServico, cancelarServico, servicoDaVenda, servicoDaOs, montarFocusServico, pendenciasServico, _interno: { fiscalAsaas, fiscalFocusServico, erroAsaas } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
    // A lista das OS e o PDV são montados depois do login: confere de novo
    setTimeout(() => {
        try { if (pagina() === 'ordens-servico.html') ligarOs(); if (pagina() === 'pedidos.html') ligarPedidos(); } catch (e) { }
    }, 2500);
})();
