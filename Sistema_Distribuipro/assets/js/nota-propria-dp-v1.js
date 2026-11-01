/* DistribuiPro 41.1 · NOTA FISCAL DISTRIBUIPRO nas versões vitalícias (Windows Offline, MySQL e Firebase) — window.DPNotasDP
   A "API de nota fiscal" que a DistribuiPro vende: o cliente contrata, cadastra a empresa e o certificado no painel
   (distribuipro.com/api-nota-fiscal) e cola aqui a CHAVE DE LIGAÇÃO (Configurações › Empresa › Nota fiscal DistribuiPro).
   - O sistema manda a venda (ou o serviço) para distribuipro.com/api/nfapi/v1; o site monta a nota (os mesmos montadores
     do Mensal), confere se a API está PAGA e emite pelo emissor com o token da empresa (que nunca vem para cá).
   - Só emite com a API paga: aguardando pagamento, bloqueada ou cancelada, a resposta traz o motivo e o link de pagar.
   - NFC-e no caixa e NF-e no pedido (NFCeService manda para cá quando o provedor da nota de produto é 'dp'); NFS-e na OS e
     no PDV (notas-provedor-v1.js, provedor da nota de serviço 'dp').
   - A mesma referência nunca vira duas notas; nota rejeitada é corrigida e enviada de novo com o MESMO número.
   - PDF e XML: links assinados (abrem sem a chave, só aquela nota).
   Windows Offline: a chamada passa pelo programa (main.js, provedor 'dp', endereço fixo); web: fetch direto (CORS liberado).
   Gravação: sales/<id>.fiscal = { provedor:'dp', tipo, ref, seq, notaId, status, numero, serie, chave, danfeUrl, xmlUrl, ... }
   e fiscalNfse (venda, OS ou conta a receber) = { provedor:'dp', tipo:'nfse', ref, seq, notaId, status, numero, pdfUrl, ... }. */
(function () {
    'use strict';
    if (window.DPNotasDP) return;
    // Testes no PC (sistema aberto em localhost): o endereço do site de teste pode vir de localStorage 'dpNfapiBase'
    const BASE = (() => { try { const t = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) && localStorage.getItem('dpNfapiBase'); if (t && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(t)) return t + '/api/nfapi/v1/'; } catch (e) { } return 'https://distribuipro.com/api/nfapi/v1/'; })();
    const PAINEL = 'https://distribuipro.com/api-nota-fiscal';
    const U = () => (window.NFCeService && window.NFCeService.util) || null;
    const dig = v => String(v ?? '').replace(/\D/g, '');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const limpaId = v => String(v || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 56);
    const eu = () => { try { return currentUser || window.currentUser || {}; } catch (e) { return window.currentUser || {}; } };
    const ST = { autorizada: 'autorizado', cancelada: 'cancelado', rejeitada: 'erro', denegada: 'denegado' };
    const situacao = s => ST[s] || 'processando';
    const SEGREDO = /token|chave|senha|secret|password|apikey|api_key|proxy/i;

    async function geral() { const u = U(); const g = u ? await u.lerGeral().catch(() => null) : null; return g || {}; }
    const chaveDe = g => String((g && g.dpNotaChave) || '').trim();
    /** Configurações sem chave, token, senha nem imagem (só o que a nota usa). */
    function limpo(g) {
        const o = {};
        Object.keys(g || {}).forEach(k => {
            const v = g[k];
            if (SEGREDO.test(k) || typeof v === 'function') return;
            if (typeof v === 'string' && v.length > 2000) return; // logo e textos grandes
            o[k] = v;
        });
        return o;
    }
    /** Só o que a nota precisa do documento (sem fotos e textos grandes). */
    function enxuto(doc) {
        if (!doc || typeof doc !== 'object') return doc;
        const o = {};
        Object.keys(doc).forEach(k => {
            const v = doc[k];
            if (/^(image|imagem|foto|photo|images|fotos|photos|thumb)/i.test(k) || k === 'fiscalNfse') return;
            if (typeof v === 'string' && v.length > 3000) return;
            o[k] = v;
        });
        return o;
    }

    /* ===================== CONVERSA COM A DISTRIBUIPRO ===================== */
    async function chamar(acao, chave, body) {
        const metodo = acao === 'status' ? 'GET' : 'POST';
        const corpo = body ? JSON.stringify(body) : '';
        const p = U() && U().ponte();
        if (p) {
            try {
                const r = await p.nota({ provedor: 'dp', acao, chave, metodo, corpo });
                let d; try { d = JSON.parse(r.body); } catch (e) { d = {}; }
                return { status: r.status, data: d || {} };
            } catch (e) { return { status: 0, data: { erro: 'O programa não conseguiu falar com a DistribuiPro: ' + (e && e.message || e) } }; }
        }
        try {
            const r = await fetch(BASE + acao, { method: metodo, cache: 'no-store', headers: { 'Content-Type': 'application/json', 'X-DP-Chave': chave }, body: metodo === 'POST' ? (corpo || '{}') : undefined });
            let d; try { d = await r.json(); } catch (e) { d = {}; }
            return { status: r.status, data: d || {} };
        } catch (e) { return { status: 0, data: { erro: 'Sem conexão com a DistribuiPro. Confira a internet e tente de novo.' } }; }
    }
    function erroDe(r) {
        const d = (r && r.data) || {};
        if (!r || r.status === 0) return d.erro || 'Sem conexão com a internet.';
        if (r.status === 401) return d.error || 'A chave de ligação não vale mais. Copie a chave de novo no painel da API de nota fiscal e cole em Configurações › Empresa › Nota fiscal DistribuiPro.';
        if (r.status === 429) return 'Muitas notas em pouco tempo. Espere um minuto e tente de novo.';
        if (d.erro) return d.erro + (d.pagarUrl ? ' Para pagar: ' + d.pagarUrl : '');
        return d.error || ('A DistribuiPro não respondeu agora (erro ' + r.status + '). Tente de novo em instantes.');
    }
    /** A nota que o site devolveu -> o que fica gravado na venda (ou no serviço). */
    function fiscalDe(n, base) {
        const st = situacao(n.status);
        const f = Object.assign({}, base, {
            provedor: 'dp', tipo: n.tipo || base.tipo, notaId: n.id || base.notaId || null, ref: n.referencia || base.ref, status: st,
            numero: n.numero != null ? n.numero : (base.numero != null ? base.numero : null), serie: n.serie != null ? n.serie : (base.serie != null ? base.serie : null),
            chave: n.chave || base.chave || null, protocolo: n.protocolo || base.protocolo || null, ambiente: n.ambiente || base.ambiente || 'homologacao',
            error: null, atualizadaEm: new Date().toISOString()
        });
        if (n.pdfUrl) { f.danfeUrl = n.pdfUrl; f.danfeUrlImpressao = n.pdfUrl; f.pdfUrl = n.pdfUrl; }
        if (n.xmlUrl) f.xmlUrl = n.xmlUrl;
        if (st === 'autorizado') f.autorizadaEm = n.autorizadaEm || base.autorizadaEm || new Date().toISOString();
        if (st === 'cancelado') f.canceladaEm = base.canceladaEm || new Date().toISOString();
        if (st === 'erro' || st === 'denegado') f.error = (n.cstat ? 'Rejeição ' + n.cstat + ': ' : '') + (n.motivo || n.mensagem || 'A SEFAZ recusou a nota.');
        if (st === 'processando') f.error = n.mensagem || 'A SEFAZ ainda não respondeu: clique em Atualizar em instantes.';
        return f;
    }
    const semChave = () => ({ ok: false, error: 'Falta a chave de ligação da nota fiscal DistribuiPro (Configurações › Empresa › Nota fiscal DistribuiPro).' });

    /* ===================== NOTA DE PRODUTO (NFC-e no caixa, NF-e no pedido) ===================== */
    async function financeiroDa(saleId) {
        try {
            const s = await db.collection('financial_entries').where('referenceId', '==', saleId).get();
            const out = []; s.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
            return out;
        } catch (e) { return []; }
    }
    async function emitir(saleData, saleId, op) {
        op = op || {};
        const tipo = op.tipo === 'nfe' ? 'nfe' : 'nfce';
        try {
            const u = U(); if (!u) return { ok: false, error: 'Recarregue a página (o arquivo nfce-service.js não carregou).' };
            const g = await geral(); const chave = chaveDe(g);
            if (!chave) return semChave();
            const gravada = await u.lerVenda(saleId);
            const venda = Object.assign({}, saleData || {}, gravada || {}, { id: saleId });
            const ant = (gravada && gravada.fiscal) || (saleData && saleData.fiscal) || null;
            const antTipo = ant ? (ant.tipo || 'nfce') : null;
            if (ant && ant.ref && ['autorizado', 'processando'].includes(ant.status)) {
                if (antTipo !== tipo && ant.status === 'autorizado') return { ok: false, error: `Esta venda já tem ${antTipo === 'nfe' ? 'NF-e' : 'NFC-e'} autorizada (nº ${ant.numero || '?'}). Uma venda leva uma nota de mercadoria só.` };
                if (ant.provedor === 'dp') {
                    const r = await atualizar(saleId, ant);
                    if (r.ok && r.status === 'autorizado') return Object.assign({}, r, { jaExistia: true });
                    if (r.status === 'processando') return r;
                    if (!r.ok && !['erro', 'denegado', 'cancelado'].includes(r.status)) return r; // sem resposta: não arrisca outra nota
                }
            }
            if (window.DPFiscal && DPFiscal.fill) await DPFiscal.fill(venda.items || []);
            const prods = await window.NFCeService.carregarProdutos(venda.items || [], { fresco: true });
            let cliente = op.cliente || null;
            if (!cliente && venda.customerId) { try { const d = await db.collection('customers').doc(String(venda.customerId)).get(); if (d.exists) cliente = Object.assign({ id: venda.customerId }, d.data()); } catch (e) { } }
            // Rejeitada: corrige e manda com a MESMA referência (o emissor usa o mesmo número). Cancelada/denegada: nota nova.
            const doDP = ant && ant.provedor === 'dp' && antTipo === tipo;
            const seq = doDP ? (Number(ant.seq) || 1) + (['cancelado', 'denegado'].includes(ant.status) ? 1 : 0) : (ant ? (Number(ant.seq) || 1) + 1 : 1);
            const ref = `dpv-${tipo}-${limpaId(saleId)}-${seq}`;
            const produtos = {}; Object.keys(prods || {}).forEach(k => { produtos[k] = enxuto(prods[k]); });
            const body = {
                tipo, referencia: ref, venda: enxuto(Object.assign({}, venda, { fiscal: undefined })), produtos, cliente: cliente ? enxuto(cliente) : null, geral: limpo(g),
                extra: { cpfCnpj: dig(op.doc || ''), nome: String(op.nome || '').slice(0, 60) }
            };
            if (tipo === 'nfe') { body.opcoes = op.opcoes || venda.nfeOpcoes || null; body.financeiro = await financeiroDa(saleId); }
            const base = { provedor: 'dp', tipo, ref, seq, emitidaPor: eu().name || '', emitidaEm: new Date().toISOString() };
            const r = await chamar('emitir', chave, body);
            const d = r.data || {};
            if (d.nota) {
                const f = fiscalDe(d.nota, base);
                await u.salvarStatusFiscal(saleId, f);
                return Object.assign({ ok: f.status === 'autorizado' || f.status === 'processando' }, f, { avisos: d.avisos || [] });
            }
            if (d.codigo === 'sem-resposta' || r.status >= 500) {
                // Pode ter saído: fica "processando" e o Atualizar confere pela mesma referência (nunca duplica)
                const f = Object.assign({}, base, { status: 'processando', error: erroDe(r) });
                await u.salvarStatusFiscal(saleId, f);
                return Object.assign({ ok: false }, f);
            }
            return { ok: false, error: erroDe(r), pendencias: d.pendencias || [], codigo: d.codigo || null, pagarUrl: d.pagarUrl || null };
        } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }
    async function atualizar(saleId, f0) {
        try {
            const g = await geral(); const chave = chaveDe(g);
            if (!chave) return Object.assign({}, semChave(), { status: f0 && f0.status });
            const r = await chamar('consultar', chave, { tipo: f0.tipo || 'nfce', id: f0.notaId || 0, referencia: f0.ref });
            const d = r.data || {};
            if (d.nota) {
                const f = fiscalDe(d.nota, f0); await U().salvarStatusFiscal(saleId, f);
                return Object.assign({ ok: ['autorizado', 'processando', 'cancelado'].includes(f.status) }, f);
            }
            if (d.codigo === 'nao-encontrada') {
                const f = Object.assign({}, f0, { status: 'erro', error: 'A nota não chegou ao emissor (nada foi emitido). Pode emitir de novo.' });
                await U().salvarStatusFiscal(saleId, f); return Object.assign({ ok: false }, f);
            }
            return Object.assign({ ok: false }, f0, { error: erroDe(r) });
        } catch (e) { return Object.assign({ ok: false }, f0 || {}, { error: e.message || String(e) }); }
    }
    async function cancelar(saleId, f0, justificativa) {
        try {
            const g = await geral(); const chave = chaveDe(g);
            if (!chave) return semChave();
            const j = String(justificativa || '').replace(/\s+/g, ' ').trim();
            if (j.length < 15) return { ok: false, error: 'Justificativa precisa ter pelo menos 15 caracteres.' };
            let id = f0.notaId;
            if (!id) { const a = await atualizar(saleId, f0); id = a.notaId; if (!id) return { ok: false, error: a.error || 'Atualize a nota antes de cancelar.' }; }
            const r = await chamar('cancelar', chave, { tipo: f0.tipo || 'nfce', id, justificativa: j });
            const d = r.data || {};
            if (d.nota) {
                const f = fiscalDe(d.nota, Object.assign({}, f0, { notaId: id }));
                if (f.status === 'cancelado') { f.motivoCancelamento = j.slice(0, 255); await U().salvarStatusFiscal(saleId, f); return Object.assign({ ok: true }, f); }
                return { ok: false, error: d.nota.motivo ? 'A SEFAZ não cancelou: ' + d.nota.motivo : 'A SEFAZ não cancelou a nota.' };
            }
            return { ok: false, error: erroDe(r) };
        } catch (e) { return { ok: false, error: e.message || String(e) }; }
    }

    /* ===================== NOTA DE SERVIÇO (NFS-e) ===================== */
    // d = { valor (centavos), descricao, observacao, tomador: { nome, doc, email, fone, end: { cep, rua, numero, compl, bairro, ibge } } }
    async function emitirServico(c, info, d, gravar) {
        const g = (c && c.geral) || await geral(); const chave = chaveDe(g);
        if (!chave) throw new Error(semChave().error);
        const ant = info.ant && info.ant.provedor === 'dp' ? info.ant : null;
        if (ant && ant.ref && ['autorizado', 'processando'].includes(ant.status)) {
            const f = await atualizarServico(c, info.origem, ant, gravar);
            if (f.status !== 'erro') return f;
        }
        const seq = ant ? (Number(ant.seq) || 1) + (['cancelado', 'denegado'].includes(ant.status) ? 1 : 0) : (info.ant ? (Number(info.ant.seq) || 1) + 1 : 1);
        const ref = `dpv-nfse-${info.origem.tipo}-${limpaId(info.origem.id)}-${seq}`;
        const base = { provedor: 'dp', tipo: 'nfse', ref, seq, valor: U().reais(d.valor), emitidaPor: eu().name || '', emitidaEm: new Date().toISOString() };
        const r = await chamar('nfse', chave, { tipo: 'nfse', referencia: ref, geral: limpo(g), servico: { valorCentavos: d.valor, descricao: d.descricao, observacao: d.observacao || '', tomador: d.tomador } });
        const dd = r.data || {};
        if (dd.nota) { const f = fiscalDe(dd.nota, base); await gravar(info.origem, f); return f; }
        if (dd.codigo === 'sem-resposta' || r.status >= 500) { const f = Object.assign({}, base, { status: 'processando', error: erroDe(r) }); await gravar(info.origem, f); return f; }
        throw new Error(erroDe(r));
    }
    async function atualizarServico(c, origem, f0, gravar) {
        const g = (c && c.geral) || await geral(); const chave = chaveDe(g);
        if (!chave) throw new Error(semChave().error);
        const r = await chamar('consultar', chave, { tipo: 'nfse', id: f0.notaId || 0, referencia: f0.ref });
        const d = r.data || {};
        if (d.nota) { const f = fiscalDe(d.nota, f0); await gravar(origem, f); return f; }
        if (d.codigo === 'nao-encontrada') { const f = Object.assign({}, f0, { status: 'erro', error: 'A nota não chegou ao emissor (nada foi emitido). Pode emitir de novo.' }); await gravar(origem, f); return f; }
        throw new Error(erroDe(r));
    }
    async function cancelarServico(c, origem, f0, just, gravar) {
        const g = (c && c.geral) || await geral(); const chave = chaveDe(g);
        if (!chave) throw new Error(semChave().error);
        const j = String(just || '').replace(/\s+/g, ' ').trim();
        if (j.length < 15) throw new Error('A justificativa precisa ter pelo menos 15 letras.');
        let id = f0.notaId;
        if (!id) { const a = await atualizarServico(c, origem, f0, gravar); id = a.notaId; if (!id) throw new Error(a.error || 'Atualize a nota antes de cancelar.'); }
        const r = await chamar('cancelar', chave, { tipo: 'nfse', id, justificativa: j });
        const d = r.data || {};
        if (d.nota) { const f = fiscalDe(d.nota, Object.assign({}, f0, { notaId: id })); if (f.status !== 'cancelado') throw new Error(d.nota.motivo ? 'A prefeitura não cancelou: ' + d.nota.motivo : 'A nota não foi cancelada.'); f.motivoCancelamento = j.slice(0, 255); await gravar(origem, f); return f; }
        throw new Error(erroDe(r));
    }

    /* ===================== CONFIGURAÇÕES › EMPRESA › NOTA FISCAL DISTRIBUIPRO ===================== */
    async function salvarGeral(dados) { await db.collection('settings').doc('general').set(dados, { merge: true }); }
    function css() {
        if (document.getElementById('dpdpCss')) return;
        const s = document.createElement('style'); s.id = 'dpdpCss';
        s.textContent = `.dpdp{border:1px solid var(--border-color);border-radius:14px;padding:16px 18px;margin:0 0 20px;background:var(--bg-surface)}
.dpdp h3{font-size:16px;font-weight:700;margin:0 0 4px;display:flex;align-items:center;gap:8px;color:var(--text-primary)}
.dpdp p{font-size:12.5px;color:var(--text-muted);margin:0 0 12px;line-height:1.5}.dpdp .dpdp-linha{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin:10px 0}
.dpdp .dpdp-linha .form-input{flex:1 1 280px;min-width:0}.dpdp-kv{display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:8px 16px;font-size:12.5px;margin:10px 0}
.dpdp-kv b{display:block;font-size:14px;color:var(--text-primary)}.dpdp-av{padding:10px 12px;border-radius:10px;font-size:13px;margin:10px 0;line-height:1.5}
.dpdp-av.ok{background:rgba(16,185,129,.12);color:#059669}.dpdp-av.alerta{background:rgba(245,158,11,.14);color:#b45309}.dpdp-av.erro{background:rgba(239,68,68,.12);color:#dc2626}
.dpdp label.dpdp-op{display:flex;gap:8px;align-items:center;font-size:13px;margin:6px 0;color:var(--text-primary)}.dpdp .dpdp-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:10px}`;
        document.head.appendChild(s);
    }
    let ultimoStatus = null;
    async function quadro(box) {
        css();
        const g = await geral(); const chave = chaveDe(g);
        if (!chave) {
            box.innerHTML = `<h3><i class="fas fa-file-invoice"></i> Nota fiscal DistribuiPro</h3>
              <p>Emita NFC-e no caixa, NF-e nos pedidos e NFS-e nas ordens de serviço pela DistribuiPro, sem Focus nem Asaas. Contrate a <b>API de nota fiscal</b> com a DistribuiPro; depois, no painel <a href="${PAINEL}" target="_blank" rel="noopener">${PAINEL.replace('https://', '')}</a>, cadastre a empresa e o certificado e copie a <b>chave de ligação</b>.</p>
              <div class="dpdp-linha"><input type="text" class="form-input" data-dpdp-chave placeholder="Cole aqui a chave de ligação (começa com dpnf_)" autocomplete="off" spellcheck="false"><button type="button" class="btn btn-primary" data-dpdp-ligar><i class="fas fa-plug"></i> Ligar</button></div>
              <div data-dpdp-msg></div>`;
            box.querySelector('[data-dpdp-ligar]').onclick = async ev => {
                const b = ev.currentTarget, k = box.querySelector('[data-dpdp-chave]').value.trim(), msg = box.querySelector('[data-dpdp-msg]');
                if (!/^dpnf_[a-f0-9]{48}$/.test(k)) { msg.innerHTML = '<div class="dpdp-av erro">Essa não parece a chave de ligação. Copie de novo no painel da API de nota fiscal (Integração › Mostrar a chave de ligação).</div>'; return; }
                b.disabled = true; b.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Ligando…';
                try {
                    const r = await chamar('status', k);
                    if (!r.data || !r.data.ok) { msg.innerHTML = `<div class="dpdp-av erro">${esc(erroDe(r))}</div>`; return; }
                    const servico = !!g.nfseCodigoNacional;
                    await salvarGeral({ dpNotaChave: k, emitirNFe: true, notaProdutoProvedor: 'dp', notaServicoProvedor: servico ? 'dp' : (g.notaServicoProvedor === 'dp' ? 'nenhum' : (g.notaServicoProvedor || 'nenhum')), modoEmissaoNfce: g.modoEmissaoNfce || 'perguntar' });
                    if (window.Toast) Toast.success('Nota fiscal DistribuiPro ligada.');
                    await quadro(box);
                } finally { b.disabled = false; b.innerHTML = '<i class="fas fa-plug"></i> Ligar'; }
            };
            return;
        }
        box.innerHTML = `<h3><i class="fas fa-file-invoice"></i> Nota fiscal DistribuiPro <span class="badge" style="background:rgba(16,185,129,.15);color:#059669">ligada</span></h3><p>Conferindo com a DistribuiPro…</p>`;
        const r = await chamar('status', chave); const s = r.data || {}; ultimoStatus = s;
        const e = s.empresa || {};
        const aviso = !s.ok ? `<div class="dpdp-av erro">${esc(erroDe(r))}</div>`
            : s.liberado ? `<div class="dpdp-av ok">${e.ambiente === 'producao' ? 'Tudo certo: as notas valem de verdade (produção).' : 'Ligada em <b>homologação</b> (notas de teste, sem valor fiscal). Quando estiver pronto, passe para produção no painel da API.'}</div>`
            : `<div class="dpdp-av alerta">${esc(s.mensagem || '')}${s.pagarUrl ? ` <a href="${esc(s.pagarUrl)}" target="_blank" rel="noopener"><b>Pagar agora</b></a>` : ''}</div>`;
        const modo = g.modoEmissaoNfce || 'perguntar';
        box.innerHTML = `<h3><i class="fas fa-file-invoice"></i> Nota fiscal DistribuiPro <span class="badge" style="background:rgba(16,185,129,.15);color:#059669">ligada</span></h3>
          <p>A empresa, o certificado e o ambiente (teste ou produção) ficam no painel <a href="${esc(s.painelUrl || PAINEL)}" target="_blank" rel="noopener">${PAINEL.replace('https://', '')}</a>.</p>
          ${s.ok ? `<div class="dpdp-kv"><div>Empresa<b>${esc(e.fantasia || e.razao || '—')}</b>${esc(e.cnpj || '')}</div><div>Ambiente<b>${e.ambiente === 'producao' ? 'Produção' : 'Homologação (teste)'}</b></div><div>Certificado<b>${e.possuiCertificado ? (e.certificadoVencido ? 'VENCIDO' : 'válido') : 'falta enviar'}</b></div><div>Situação da API<b>${esc(s.situacao || '—')}</b>${esc(s.plano || '')}</div></div>` : ''}
          ${aviso}
          <div class="dpdp-grid" style="margin-top:6px">
            <div><label class="dpdp-op"><input type="checkbox" data-dpdp-produto ${g.notaProdutoProvedor === 'dp' ? 'checked' : ''}> Notas de produto (NFC-e no caixa e NF-e nos pedidos)</label>
                 <label class="dpdp-op"><input type="checkbox" data-dpdp-servico ${g.notaServicoProvedor === 'dp' ? 'checked' : ''}> Notas de serviço (NFS-e nas ordens de serviço)</label></div>
            <label class="form-group" style="margin:0"><span class="form-label" style="font-size:12px">No caixa (PDV)</span><select class="form-input" data-dpdp-modo>
              <option value="perguntar" ${modo === 'perguntar' ? 'selected' : ''}>Perguntar a cada venda</option><option value="automatico" ${modo === 'automatico' ? 'selected' : ''}>Emitir sempre</option><option value="manual" ${modo === 'manual' ? 'selected' : ''}>Só quando eu pedir</option></select></label>
          </div>
          <div class="dpdp-grid" data-dpdp-nfse style="margin-top:10px${g.notaServicoProvedor === 'dp' ? '' : ';display:none'}">
            <label class="form-group" style="margin:0"><span class="form-label" style="font-size:12px">Código de tributação nacional (6 números)</span><input class="form-input" data-dpdp-cod value="${esc(g.nfseCodigoNacional || '')}" inputmode="numeric" maxlength="8" placeholder="ex.: 140101"></label>
            <label class="form-group" style="margin:0"><span class="form-label" style="font-size:12px">Alíquota do ISS (%)</span><input class="form-input" data-dpdp-aliq value="${esc(g.nfseAliquota || '')}" inputmode="decimal" placeholder="ex.: 2"></label>
            <label class="form-group" style="margin:0"><span class="form-label" style="font-size:12px">Texto padrão da nota de serviço</span><input class="form-input" data-dpdp-texto value="${esc(g.nfseTextoPadrao || '')}" maxlength="500"></label>
          </div>
          <p style="margin:10px 0 0">Os produtos precisam do <b>NCM</b> (Produtos › Fiscal). Sem CFOP e CSOSN no produto, vale o padrão da empresa (5102 e 102 no Simples).</p>
          <div class="dpdp-linha"><button type="button" class="btn btn-primary" data-dpdp-salvar><i class="fas fa-check"></i> Salvar</button><button type="button" class="btn btn-outline" data-dpdp-testar><i class="fas fa-rotate"></i> Conferir de novo</button><button type="button" class="btn btn-outline" data-dpdp-trocar><i class="fas fa-key"></i> Trocar a chave</button><button type="button" class="btn btn-outline" data-dpdp-desligar style="color:#dc2626"><i class="fas fa-power-off"></i> Desligar</button></div>`;
        box.querySelector('[data-dpdp-servico]').onchange = ev => { box.querySelector('[data-dpdp-nfse]').style.display = ev.target.checked ? '' : 'none'; };
        box.querySelector('[data-dpdp-testar]').onclick = () => quadro(box);
        box.querySelector('[data-dpdp-salvar]').onclick = async ev => {
            const b = ev.currentTarget; b.disabled = true;
            try {
                const prod = box.querySelector('[data-dpdp-produto]').checked, serv = box.querySelector('[data-dpdp-servico]').checked;
                const cod = dig(box.querySelector('[data-dpdp-cod]').value);
                if (serv && cod.length !== 6) { if (window.Toast) Toast.warning('Informe o código de tributação nacional do serviço (6 números). O contador sabe qual é.'); return; }
                const dados = { emitirNFe: prod || serv, modoEmissaoNfce: box.querySelector('[data-dpdp-modo]').value };
                dados.notaProdutoProvedor = prod ? 'dp' : (g.notaProdutoProvedor === 'dp' ? 'nenhum' : (g.notaProdutoProvedor || 'nenhum'));
                dados.notaServicoProvedor = serv ? 'dp' : (g.notaServicoProvedor === 'dp' ? 'nenhum' : (g.notaServicoProvedor || 'nenhum'));
                if (serv) { dados.nfseCodigoNacional = cod; dados.nfseAliquota = box.querySelector('[data-dpdp-aliq]').value.trim(); dados.nfseTextoPadrao = box.querySelector('[data-dpdp-texto]').value.trim(); dados.nfsePadrao = 'nacional'; }
                await salvarGeral(dados);
                if (window.Toast) Toast.success('Nota fiscal DistribuiPro salva.');
            } catch (e) { if (window.Toast) Toast.error('Não foi possível salvar: ' + (e.message || e)); }
            finally { b.disabled = false; }
        };
        box.querySelector('[data-dpdp-trocar]').onclick = async () => {
            const k = (prompt('Cole a chave de ligação nova (painel da API de nota fiscal › Integração):') || '').trim();
            if (!k) return;
            if (!/^dpnf_[a-f0-9]{48}$/.test(k)) { if (window.Toast) Toast.warning('Essa não parece a chave de ligação (começa com dpnf_).'); return; }
            const r = await chamar('status', k);
            if (!r.data || !r.data.ok) { if (window.Toast) Toast.error(erroDe(r)); return; }
            await salvarGeral({ dpNotaChave: k }); if (window.Toast) Toast.success('Chave trocada.'); await quadro(box);
        };
        box.querySelector('[data-dpdp-desligar]').onclick = async () => {
            if (!confirm('Desligar a nota fiscal DistribuiPro neste sistema? As notas já emitidas continuam nas vendas.')) return;
            await salvarGeral({ dpNotaChave: '', notaProdutoProvedor: g.notaProdutoProvedor === 'dp' ? 'nenhum' : g.notaProdutoProvedor || 'nenhum', notaServicoProvedor: g.notaServicoProvedor === 'dp' ? 'nenhum' : g.notaServicoProvedor || 'nenhum' });
            if (window.Toast) Toast.success('Nota fiscal DistribuiPro desligada.'); await quadro(box);
        };
    }
    function montarConfiguracoes(n = 0) {
        const aba = document.getElementById('tabEmpresa');
        if (!aba) { if (n < 40 && /configuracoes/.test(location.pathname)) setTimeout(() => montarConfiguracoes(n + 1), 250); return; }
        if (document.getElementById('dpdpQuadro')) return;
        if (typeof db === 'undefined') { if (n < 40) setTimeout(() => montarConfiguracoes(n + 1), 250); return; }
        const box = document.createElement('div'); box.id = 'dpdpQuadro'; box.className = 'dpdp';
        aba.insertBefore(box, aba.firstChild);
        quadro(box).catch(e => { box.innerHTML = `<h3>Nota fiscal DistribuiPro</h3><div class="dpdp-av erro">${esc(e.message || e)}</div>`; });
    }

    window.DPNotasDP = { emitir, atualizar, cancelar, emitirServico, atualizarServico, cancelarServico, chamar, status: k => chamar('status', k), quadro, _util: { fiscalDe, limpo, enxuto, situacao } };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => montarConfiguracoes()); else montarConfiguracoes();
})();
