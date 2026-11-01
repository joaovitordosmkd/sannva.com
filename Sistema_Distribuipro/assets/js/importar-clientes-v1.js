/* DistribuiPro 38.1 · Importar clientes (e fornecedores) de planilha, em todas as versões.
   Clientes › "Importar planilha": traz a lista do caderno ou do sistema antigo sem digitar.
   - Lê o CSV com o mesmo leitor dos Produtos (DPPlanilha, em importar-produtos-v1.js): separador, aspas, acentos.
   - Reconhece as colunas pelo nome (nome, cpf/cnpj, telefone, whatsapp, e-mail, nascimento, endereço, cidade,
     limite, saldo devedor...) e deixa trocar na tela antes de importar. Tem planilha modelo para baixar.
   - Cliente que já existe é reconhecido pelo CPF/CNPJ ou pelo telefone (atualiza ou pula); repetido na própria
     planilha é avisado.
   - "Saldo devedor anterior" (o fiado do caderno) vira conta a receber em aberto (financial_entries, origem
     'importacao'), e já aparece no fiado do cliente e em Contas a receber.
   - Fornecedores › "Importar planilha": os mesmos passos com os campos do fornecedor; o saldo vira conta a pagar.
   - Tudo marcado com importBatch: "Desfazer" tira os novos, devolve os dados antigos dos atualizados e apaga as
     contas lançadas. */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.DPImportClientes) return;
    const PAGE = (location.pathname.split('/').pop() || '').replace(/\.html$/, '');
    if (!['clientes', 'fornecedores'].includes(PAGE)) return;
    const SUP = PAGE === 'fornecedores';
    const COL = SUP ? 'suppliers' : 'customers';
    const VER = (/[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || '') || [])[1] || '1';
    const $ = id => document.getElementById(id);
    const I = n => (window.dpIcon ? window.dpIcon(n) : '');
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const TS = () => window.DPTimestamp || firebase.firestore.Timestamp;
    const ts = () => FV().serverTimestamp();
    const uid = () => (window.auth && auth.currentUser && auth.currentUser.uid) || 'system';
    const role = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.role) || localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } };
    const HIST = SUP ? 'dp_import_sup_hist' : 'dp_import_cli_hist';
    const W = SUP ? { one: 'fornecedor', many: 'fornecedores', One: 'Fornecedor', Many: 'Fornecedores' } : { one: 'cliente', many: 'clientes', One: 'Cliente', Many: 'Clientes' };

    /* ---------- Campos e nomes de coluna aceitos ---------- */
    const FIELDS = SUP ? [
        ['name', 'Razão social / nome', true, ['razao_social', 'nome', 'fornecedor', 'nome_fornecedor', 'name', 'empresa', 'nome_razao_social']],
        ['fantasyName', 'Nome fantasia', false, ['nome_fantasia', 'fantasia', 'apelido']],
        ['document', 'CNPJ / CPF', false, ['cnpj', 'cpf', 'cnpj_cpf', 'cpf_cnpj', 'documento', 'doc']],
        ['phone', 'Telefone', false, ['telefone', 'fone', 'phone', 'tel', 'celular', 'telefone_1']],
        ['whatsapp', 'WhatsApp', false, ['whatsapp', 'whats', 'zap', 'celular_whatsapp']],
        ['email', 'E-mail', false, ['email', 'e_mail', 'mail', 'e_mail_todos', 'e_mail_login', 'emails', 'e_mail_principal', 'email_principal']],
        ['representative', 'Representante / contato', false, ['representante', 'contato', 'vendedor', 'responsavel']],
        ['address', 'Endereço', false, ['endereco', 'rua', 'logradouro', 'address', 'endereco_completo']],
        ['city', 'Cidade', false, ['cidade', 'municipio', 'city']],
        ['state', 'UF', false, ['uf', 'estado', 'state']],
        ['paymentTerms', 'Condição de pagamento', false, ['condicao_pagamento', 'condicoes_pagamento', 'prazo', 'condicao', 'prazo_pagamento']],
        ['categories', 'O que fornece', false, ['categorias', 'categoria', 'produtos', 'segmento', 'ramo']],
        ['debt', 'Saldo a pagar (em aberto)', false, ['saldo', 'saldo_a_pagar', 'a_pagar', 'divida', 'em_aberto', 'valor_em_aberto', 'saldo_devedor', 'debito']],
        ['notes', 'Observações', false, ['observacao', 'observacoes', 'obs', 'notas', 'anotacoes']],
        ['active', 'Ativo', false, ['ativo', 'status', 'situacao']]
    ] : [
        ['name', 'Nome do cliente', true, ['nome', 'cliente', 'nome_cliente', 'name', 'nome_completo', 'razao_social', 'nome_razao_social', 'nome_fantasia']],
        ['document', 'CPF / CNPJ', false, ['cpf', 'cnpj', 'cpf_cnpj', 'cpf_ou_cnpj', 'cnpj_cpf', 'documento', 'doc', 'cpfcnpj']],
        ['phone', 'Telefone / celular', false, ['telefone', 'celular', 'fone', 'phone', 'tel', 'telefone_1', 'celular_1', 'telefone_celular', 'contato']],
        ['whatsapp', 'WhatsApp', false, ['whatsapp', 'whats', 'zap', 'celular_whatsapp']],
        ['email', 'E-mail', false, ['email', 'e_mail', 'mail', 'e_mail_todos', 'e_mail_login', 'emails', 'e_mail_principal', 'email_principal']],
        ['birthDate', 'Nascimento', false, ['nascimento', 'data_nascimento', 'data_de_nascimento', 'aniversario', 'nasc', 'dt_nascimento']],
        // 39.14 · exportação de outros sistemas: tipo PF/PJ, inscrições (nota fiscal), responsável, nome fantasia e data de cadastro
        ['personType', 'Tipo (PF / PJ)', false, ['tipo', 'tipo_pessoa', 'pessoa', 'pf_pj', 'tipo_de_pessoa', 'fisica_juridica']],
        ['ie', 'Inscrição estadual', false, ['i_e', 'ie', 'inscricao_estadual', 'insc_estadual', 'inscr_estadual', 'insc_est']],
        ['im', 'Inscrição municipal', false, ['i_m', 'im', 'inscricao_municipal', 'insc_municipal', 'inscr_municipal']],
        ['contact', 'Responsável / contato', false, ['responsavel', 'contato_responsavel', 'pessoa_de_contato', 'pessoa_contato']],
        ['fantasyName', 'Nome fantasia', false, ['nome_fantasia', 'fantasia', 'apelido']],
        ['since', 'Data de cadastro (sistema antigo)', false, ['data_cadastro', 'data_de_cadastro', 'cliente_desde', 'dt_cadastro', 'cadastrado_em']],
        ['zip', 'CEP', false, ['cep', 'zip']],
        ['street', 'Endereço / rua', false, ['endereco', 'rua', 'logradouro', 'address', 'end']],
        ['number', 'Número', false, ['numero', 'num', 'nro', 'n']],
        ['complement', 'Complemento', false, ['complemento', 'compl']],
        ['neighborhood', 'Bairro', false, ['bairro', 'neighborhood']],
        ['city', 'Cidade', false, ['cidade', 'municipio', 'city']],
        ['state', 'UF', false, ['uf', 'estado', 'state']],
        ['creditLimit', 'Limite de crédito', false, ['limite', 'limite_credito', 'limite_de_credito', 'credito']],
        ['debt', 'Saldo devedor anterior (fiado)', false, ['saldo_devedor', 'saldo', 'fiado', 'saldo_fiado', 'debito', 'divida', 'em_aberto', 'valor_em_aberto', 'deve', 'saldo_anterior', 'conta']],
        ['notes', 'Observações', false, ['observacao', 'observacoes', 'obs', 'notas', 'anotacoes']],
        ['active', 'Ativo', false, ['ativo', 'status', 'situacao']]
    ];
    const MODEL = SUP
        ? ['razao_social;nome_fantasia;cnpj;telefone;whatsapp;email;representante;endereco;cidade;uf;condicao_pagamento;categorias;saldo_a_pagar;observacoes',
            'Atacado Exemplo Ltda;Atacado Exemplo;12.345.678/0001-90;(11) 3333-4444;(11) 98888-7777;vendas@atacado.com;Carlos;Av. Brasil, 1000;São Paulo;SP;28 dias;Bebidas e mercearia;1.250,00;Entrega às terças']
        : ['nome;cpf_cnpj;telefone;whatsapp;email;nascimento;cep;endereco;numero;bairro;cidade;uf;limite_credito;saldo_devedor;observacoes',
            'Maria da Silva;123.456.789-09;(11) 98765-4321;;maria@email.com;15/03/1985;01001-000;Rua das Flores;120;Centro;São Paulo;SP;500,00;150,00;Cliente antiga do caderno',
            'Mercadinho Bom Preço;12.345.678/0001-90;(11) 3333-2222;(11) 97777-6666;;;;Av. Central;45;Vila Nova;São Paulo;SP;2.000,00;0;Paga todo dia 10'];

    /* ---------- Ajudantes ---------- */
    let P = null; // DPPlanilha (leitor do importar-produtos-v1.js)
    async function planilha() {
        if (window.DPPlanilha) return (P = window.DPPlanilha);
        await new Promise(r => { const s = document.createElement('script'); s.src = 'assets/js/importar-produtos-v1.js?v=' + VER; s.onload = r; s.onerror = r; document.head.appendChild(s); });
        if (!window.DPPlanilha) throw new Error('Não foi possível abrir o leitor de planilha.');
        return (P = window.DPPlanilha);
    }
    const dg = s => String(s || '').replace(/\D/g, '');
    const nrm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
    // Telefone: tira o 55 do Brasil e o 0 do DDD; compara pelos 8 últimos números (igual ao cadastro de clientes)
    function phoneD(v) { let d = dg(v); if (d.length >= 12 && d.startsWith('55')) d = d.slice(2); if (d.length === 11 && d.startsWith('0')) d = d.slice(1); return d; }
    const ph8 = v => { const d = phoneD(v); return d.length >= 8 ? d.slice(-8) : ''; };
    function fmtPhone(v) { const d = phoneD(v); if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`; if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`; return String(v || '').trim(); }
    function fmtDoc(v) { const d = dg(v); if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5'); return String(v || '').trim(); }
    // 39.14 · Célula com mais de um telefone ou e-mail (um por linha, ou separados por / ; |)
    const partes = (v, re = /\s*[\n;\/|]\s*/) => String(v || '').split(re).map(s => s.trim()).filter(Boolean);
    function fmtCep(v) { const d = dg(v); return d.length === 8 ? d.replace(/(\d{5})(\d{3})/, '$1-$2') : String(v || '').trim(); }
    function date(v) {
        const s = String(v || '').trim(); if (!s) return '';
        let m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(s);
        if (m) { let y = Number(m[3]); if (y < 100) y += y > 30 ? 1900 : 2000; const d = Number(m[1]), mo = Number(m[2]); if (d >= 1 && d <= 31 && mo >= 1 && mo <= 12) return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`; }
        m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
        return '';
    }
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

    let S = null; // importação aberta

    /* ---------- Existentes ---------- */
    async function loadExisting() {
        const snap = await db.collection(COL).get();
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.deleted !== true);
        const byDoc = new Map(), byPhone = new Map(), byName = new Map();
        list.forEach(x => {
            const d = dg(x.document || x.cnpj || x.cpfCnpj || x.cpf); if (d.length === 11 || d.length === 14) byDoc.set(d, x);
            [x.phone, x.whatsapp, x.telefone, x.celular].forEach(p => { const k = ph8(p); if (k && !byPhone.has(k)) byPhone.set(k, x); });
            if (x.name) byName.set(nrm(x.name), x);
        });
        return { byDoc, byPhone, byName, count: list.length };
    }

    /* ---------- Monta a lista ---------- */
    function build() {
        const { rows, map, style } = S, get = (r, f) => map[f] > -1 ? P.clean(r[map[f]]) : '';
        const out = [], seen = new Map();
        let ultimo = null; S.merged = 0; S.joined = 0;
        // O segundo telefone vira o WhatsApp (se o primeiro for fixo e o outro celular); o resto vai para as observações
        const maisTel = (x, lista) => lista.forEach(p => { const f = fmtPhone(p); if ([x.phone, x.whatsapp].includes(f) || x.extra.includes('Outro telefone: ' + f)) return; if (!x.phone) x.phone = f; else if (!x.whatsapp && phoneD(x.phone).length !== 11 && phoneD(p).length === 11) x.whatsapp = f; else x.extra.push('Outro telefone: ' + f); });
        const maisMail = (x, lista) => lista.forEach(em => { if (em === x.email || x.extra.includes('Outro e-mail: ' + em)) return; if (!x.email) x.email = em; else x.extra.push('Outro e-mail: ' + em); });
        // 39.14 · Mesmo cliente cadastrado mais de uma vez no sistema antigo: completa a primeira ficha com o que faltar nela
        // (telefone, endereço, IE...) em vez de perder os dados da repetida
        const NAO = ['line', 'warn', 'extra', 'match', 'skip', 'why', 'docD', 'name', 'debt', 'active', 'phone', 'whatsapp', 'email'];
        const juntar = (a, b) => {
            Object.keys(b).forEach(k => { if (!NAO.includes(k) && (a[k] === '' || a[k] === undefined || a[k] === 0) && b[k]) a[k] = b[k]; });
            maisTel(a, [b.phone, b.whatsapp].filter(Boolean)); maisMail(a, [b.email].filter(Boolean));
            b.extra.forEach(e => { if (!a.extra.includes(e)) a.extra.push(e); });
            const outro = 'Também cadastrado como: ' + b.name;
            if (nrm(b.name) !== nrm(a.name) && !a.extra.includes(outro)) a.extra.push(outro);
            a.debt = r2(a.debt + b.debt);
        };
        rows.forEach((r, idx) => {
            const line = idx + 2, warn = [];
            const name = get(r, 'name').replace(/\s+/g, ' ');
            const telsP = partes(get(r, 'phone')), telsW = partes(get(r, 'whatsapp')), mails = partes(get(r, 'email').toLowerCase(), /[\s,;\/|]+/);
            const phone = telsP[0] || '', wa = telsW[0] || '';
            // 39.14 · Linha só com outro telefone/e-mail logo abaixo de um cliente (exportação com um telefone por linha):
            // junta no cliente de cima em vez de ignorar
            if (!name && ultimo && (phone || wa || mails.length) && !(S.docCols || []).some(i => dg(P.clean(r[i])))) {
                maisTel(ultimo, [...telsP, ...telsW]); maisMail(ultimo, mails);
                S.merged++; return;
            }
            if (!name) { out.push({ line, skip: true, why: 'sem nome' }); return; }
            // CPF e CNPJ podem vir em colunas separadas; o Excel tira o zero da frente (3988794198 = 039.887.941-98)
            const tipo = nrm(get(r, 'personType')), pj = /^(pj|j|juridica|pessoa juridica|empresa)$/.test(tipo), pf = /^(pf|f|fisica|pessoa fisica)$/.test(tipo);
            let docRaw = get(r, 'document'); if (!dg(docRaw)) for (const i of (S.docCols || [])) { const v = P.clean(r[i]); if (dg(v)) { docRaw = v; break; } }
            let docD = dg(docRaw);
            if (docD && !pj && docD.length >= 9 && docD.length < 11) docD = docD.padStart(11, '0');
            else if (docD && !pf && docD.length >= 12 && docD.length < 14) docD = docD.padStart(14, '0');
            if (docD && docD.length !== 11 && docD.length !== 14) warn.push('CPF/CNPJ incompleto');
            const pd = phoneD(phone); if (phone && pd.length !== 10 && pd.length !== 11) warn.push('telefone sem DDD');
            const debtRaw = get(r, 'debt'), debt = r2(P.num(debtRaw, style) || 0);
            if (debt < 0) warn.push('saldo negativo ignorado');
            const it = { line, warn, name, docD, document: fmtDoc(docD || docRaw), phone: phone ? fmtPhone(phone) : '', whatsapp: wa ? fmtPhone(wa) : '', email: mails[0] || '',
                debt: debt > 0 ? debt : 0, notes: get(r, 'notes'), active: P.bool(get(r, 'active'), true), city: get(r, 'city'), state: get(r, 'state').toUpperCase().slice(0, 2), extra: [] };
            maisTel(it, [...telsP.slice(1), ...telsW.slice(1)]); maisMail(it, mails.slice(1));
            if (SUP) Object.assign(it, { fantasyName: get(r, 'fantasyName'), representative: get(r, 'representative'), address: get(r, 'address'), paymentTerms: get(r, 'paymentTerms'), categories: get(r, 'categories') });
            else {
                Object.assign(it, { birthDate: date(get(r, 'birthDate')), zip: fmtCep(get(r, 'zip')), street: get(r, 'street'), number: get(r, 'number'), complement: get(r, 'complement'), neighborhood: get(r, 'neighborhood'), creditLimit: r2(P.num(get(r, 'creditLimit'), style) || 0) });
                // 39.14 · inscrições (vão para os dados da nota fiscal do cliente), responsável, nome fantasia e data de cadastro
                const ie = get(r, 'ie'), contato = get(r, 'contact'), fant = get(r, 'fantasyName');
                it.ie = /isent/i.test(ie) ? 'ISENTO' : dg(ie); it.im = dg(get(r, 'im')); it.fantasyName = fant; it.since = get(r, 'since');
                if (contato && nrm(contato) !== nrm(name)) it.extra.push('Responsável: ' + contato);
                if (fant && nrm(fant) !== nrm(name)) it.extra.push('Nome fantasia: ' + fant);
            }
            ultimo = it;
            if (!SUP && get(r, 'birthDate') && !it.birthDate) warn.push('data de nascimento não entendida');
            // Repetido na própria planilha (mesmo documento ou telefone)
            // 39.14 · Com CPF/CNPJ vale só o documento: duas pessoas com o mesmo telefone (casal, empresa e dono) não são repetidas
            const hasDoc = docD.length === 11 || docD.length === 14;
            const keys = hasDoc ? ['d' + docD] : [ph8(phone) ? 'p' + ph8(phone) : '', ph8(wa) ? 'p' + ph8(wa) : ''].filter(Boolean);
            const dup = keys.map(k => seen.get(k)).find(Boolean);
            if (dup) { juntar(dup, it); S.joined++; ultimo = dup; out.push({ ...it, skip: true, joined: true, why: 'repetido na planilha: dados juntados na linha ' + dup.line }); return; }
            keys.forEach(k => seen.set(k, it));
            // Já cadastrado? (CPF/CNPJ → telefone de quem não tem documento → nome, no fornecedor)
            const ex = S.existing;
            const byPh = (ph8(phone) && ex.byPhone.get(ph8(phone))) || (ph8(wa) && ex.byPhone.get(ph8(wa))) || null;
            const phOk = byPh && (!hasDoc || !dg(byPh.document || byPh.cnpj || byPh.cpfCnpj || byPh.cpf));
            // cliente sem documento e sem telefone só dá para reconhecer pelo nome (importar a mesma planilha de novo não duplica)
            const porNome = SUP || (!hasDoc && !ph8(phone) && !ph8(wa));
            it.match = (hasDoc && ex.byDoc.get(docD)) || (phOk ? byPh : null) || (porNome && ex.byName.get(nrm(name))) || null;
            if (it.match) it.why = hasDoc && ex.byDoc.get(docD) ? 'mesmo CPF/CNPJ' : phOk ? 'mesmo telefone' : 'mesmo nome';
            out.push(it);
        });
        S.items = out;
    }
    function counts() {
        const items = S.items.filter(x => !x.skip), upd = items.filter(x => x.match), news = items.filter(x => !x.match);
        const act = S.mode === 'skip' ? news : items;
        return { items, news, upd, ignored: S.items.filter(x => x.skip && !x.joined).length, debtN: act.filter(x => x.debt > 0).length, debtSum: r2(act.reduce((s, x) => s + x.debt, 0)) };
    }

    /* ---------- Tela ---------- */
    function css() {
        if ($('iclCss')) return;
        const st = document.createElement('style'); st.id = 'iclCss';
        st.textContent = `.icl-modal{width:min(1080px,calc(100vw - 24px));max-width:1080px;max-height:94vh;display:flex;flex-direction:column;overflow:hidden}
.icl-modal .modal-body{overflow-y:auto;padding:18px 20px}.icl-modal .modal-header h3 svg.dpi{color:var(--accent);margin-right:6px}
.icl-drop{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;text-align:center;padding:34px 18px;border:2px dashed var(--border-color);border-radius:16px;cursor:pointer;background:var(--bg-secondary);transition:border-color .15s,background .15s}
.icl-drop:hover,.icl-drop.over{border-color:var(--accent);background:color-mix(in srgb,var(--accent,#6366f1) 8%,transparent)}.icl-drop .big svg{width:36px;height:36px;color:var(--accent)}
.icl-drop b{font-size:15px;color:var(--text-heading)}.icl-drop small{color:var(--text-muted);font-size:12px;max-width:600px;line-height:1.5}
.icl-help{margin-top:14px;font-size:12.5px;color:var(--text-secondary);line-height:1.6}.icl-help b{color:var(--text-heading)}
.icl-row{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:12px}.icl-row .btn svg{width:15px;height:15px;margin-right:4px;vertical-align:-2px}
.icl-sum{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:14px}
.icl-card{border:1px solid var(--border-color);border-radius:12px;padding:11px 13px;background:var(--bg-secondary)}.icl-card span{display:block;font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted)}
.icl-card b{display:block;font-size:20px;color:var(--text-heading);margin-top:3px}.icl-card small{display:block;font-size:11px;color:var(--text-muted)}
.icl-sec{border:1px solid var(--border-color);border-radius:14px;padding:14px;margin-bottom:12px;background:var(--bg-card)}.icl-sec h4{margin:0 0 10px;font-size:13.5px;color:var(--text-heading);display:flex;align-items:center;gap:8px}.icl-sec h4 svg{color:var(--accent);width:16px;height:16px}
.icl-sec>p{margin:-4px 0 10px;font-size:12px;color:var(--text-muted)}
.icl-cols summary{cursor:pointer;list-style:none}.icl-cols summary::-webkit-details-marker{display:none}.icl-cols summary h4{margin:0}.icl-cols[open] summary h4{margin-bottom:10px}
.icl-cols summary h4 small{font-weight:500;color:var(--text-muted);font-size:12px}.icl-cols summary h4 svg.dpi-chevron-down{margin-left:auto;color:var(--text-muted);transition:transform .15s}.icl-cols[open] summary h4 svg.dpi-chevron-down{transform:rotate(180deg)}
.icl-map{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px 14px}.icl-map label{display:flex;flex-direction:column;gap:4px;font-size:11.5px;font-weight:700;color:var(--text-secondary)}.icl-map label em{font-style:normal;color:#ef4444}.icl-map select{font-size:12.5px;padding:7px 9px}.icl-map label.miss select{border-color:#ef4444}
.icl-opts{display:flex;flex-direction:column;gap:8px;font-size:13px;color:var(--text-primary)}.icl-opts label{display:flex;gap:8px;align-items:flex-start;cursor:pointer}.icl-opts input[type=radio],.icl-opts input[type=checkbox]{margin-top:3px;accent-color:var(--accent)}.icl-opts small{display:block;color:var(--text-muted);font-size:11.5px}
.icl-opts .icl-due{display:flex;align-items:center;gap:8px;margin-left:24px;font-size:12.5px}.icl-opts .icl-due input{width:170px;padding:6px 8px}
.icl-wrap{overflow-x:auto;border:1px solid var(--border-color);border-radius:12px}.icl-table{width:100%;border-collapse:collapse;font-size:12px;min-width:780px}
.icl-table th{position:sticky;top:0;background:var(--bg-secondary);text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:var(--text-muted);padding:8px 10px;border-bottom:1px solid var(--border-color);white-space:nowrap}
.icl-table td{padding:7px 10px;border-bottom:1px solid var(--border-color);color:var(--text-primary);vertical-align:top}.icl-table td:nth-child(3),.icl-table td:nth-child(4){white-space:nowrap}.icl-table tr:last-child td{border-bottom:0}.icl-table .r{text-align:right;white-space:nowrap}.icl-table td small{display:block;color:var(--text-muted);font-size:10.5px}
.icl-tag{display:inline-block;font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:99px;white-space:nowrap}.icl-tag.new{background:rgba(16,185,129,.14);color:#10b981}.icl-tag.upd{background:rgba(59,130,246,.14);color:#3b82f6}.icl-tag.skip{background:rgba(100,116,139,.15);color:var(--text-muted)}
.icl-warns{font-size:12px;color:#d97706;margin-top:8px;line-height:1.55}
.icl-bar{height:10px;border-radius:99px;background:var(--bg-secondary);overflow:hidden;margin:14px 0 8px}.icl-bar i{display:block;height:100%;width:0;background:var(--accent);transition:width .2s}
.icl-done{text-align:center;padding:16px 8px}.icl-done .big svg{width:46px;height:46px;color:#10b981}.icl-done .big.err svg{color:#ef4444}.icl-done .big.load svg{color:var(--accent);animation:iclspin 1s linear infinite}
.icl-done h3{margin:10px 0 6px;color:var(--text-heading)}.icl-done p{color:var(--text-secondary);font-size:13px;line-height:1.6;margin:0 auto;max-width:640px}
@keyframes iclspin{to{transform:rotate(360deg)}}
.icl-hist{margin-top:14px;font-size:12px;color:var(--text-muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap}.icl-hist svg{width:14px;height:14px}
.icl-modal .modal-footer{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap}.icl-modal .modal-footer .sp{flex:1}.icl-modal .modal-footer .btn svg{width:15px;height:15px;margin-right:4px;vertical-align:-2px}
.icl-btn svg{width:15px;height:15px;margin-right:5px;vertical-align:-2px}
@media(max-width:900px){.icl-sum{grid-template-columns:repeat(2,minmax(0,1fr))}.icl-map{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media(max-width:640px){.icl-modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}.icl-map{grid-template-columns:1fr}.icl-modal .modal-footer .btn{flex:1;justify-content:center}.icl-modal .modal-footer .sp{display:none}}`;
        document.head.appendChild(st);
    }
    function shell() {
        if ($('iclModal')) return;
        css();
        const ov = document.createElement('div'); ov.className = 'modal-overlay'; ov.id = 'iclModal';
        ov.innerHTML = `<div class="modal icl-modal"><div class="modal-header"><h3>${I('file-spreadsheet')}Importar ${W.many} de planilha</h3><button class="modal-close" type="button" data-icl="close" aria-label="Fechar">${I('x')}</button></div><div class="modal-body" id="iclBody"></div><div class="modal-footer" id="iclFoot"></div></div>`;
        document.body.appendChild(ov);
        ov.addEventListener('click', onClick); ov.addEventListener('change', onChange);
    }
    function open() { shell(); S = null; stepFile(); $('iclModal').classList.add('active'); }
    function close() { if (S && S.busy) { toast('warning', 'Aguarde a importação terminar.'); return; } $('iclModal')?.classList.remove('active'); }
    const hist = () => { try { return JSON.parse(localStorage.getItem(HIST) || '[]'); } catch (e) { return []; } };
    const saveHist = h => { try { localStorage.setItem(HIST, JSON.stringify(h.slice(0, 10))); } catch (e) { } };

    function stepFile() {
        const last = hist().find(h => !h.undone && (h.created || h.updated || h.debts));
        $('iclBody').innerHTML = `<label class="icl-drop" id="iclDrop"><input type="file" id="iclFile" accept=".xlsx,.xls,.xlsm,.csv,.txt,text/csv" hidden data-no-camera><span class="big">${I('upload')}</span><b>Escolha a planilha de ${W.many} (Excel ou CSV)</b><small>Arraste o arquivo para cá ou toque para escolher. Serve a planilha do Excel (.xlsx), a exportação .xls do sistema antigo ou um CSV (no Google Planilhas: Arquivo › Fazer download › .xlsx ou CSV).</small></label>
<div class="icl-row"><button type="button" class="btn btn-outline btn-sm" data-icl="model">${I('download')}Baixar a planilha modelo</button><small style="color:var(--text-muted);font-size:12px">Preencha uma linha por ${W.one}. Só o nome é obrigatório.</small></div>
<div class="icl-help"><b>Como funciona:</b> o sistema reconhece as colunas pelo nome (${SUP ? 'razão social, CNPJ, telefone, e-mail, representante, cidade, saldo a pagar' : 'nome, CPF/CNPJ, telefone, WhatsApp, e-mail, nascimento, endereço, cidade, limite, saldo devedor'}...). Antes de gravar você confere tudo numa prévia.
${SUP ? 'Fornecedor que já está cadastrado (mesmo CNPJ, telefone ou nome) pode ser atualizado ou pulado. O <b>saldo a pagar</b> vira conta a pagar em aberto.' : 'Cliente que já está cadastrado (mesmo CPF/CNPJ ou telefone) pode ser atualizado ou pulado. O <b>saldo devedor</b> (o fiado do caderno) vira conta a receber em aberto e já aparece na ficha do cliente.'}</div>
${last ? `<div class="icl-hist">${I('history')}<span>Última importação neste aparelho: <b>${esc(last.file)}</b> em ${new Date(last.at).toLocaleString('pt-BR')} (${last.created} novo(s), ${last.updated || 0} atualizado(s)).</span><button type="button" class="btn btn-outline btn-sm" data-icl="undo" data-id="${esc(last.id)}">${I('rotate-ccw')} Desfazer</button></div>` : ''}`;
        $('iclFoot').innerHTML = `<span class="sp"></span><button class="btn btn-outline" type="button" data-icl="close">Fechar</button>`;
        const drop = $('iclDrop');
        ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
        ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
        drop.addEventListener('drop', e => { const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0]; if (f) loadFile(f); });
    }
    function model() {
        const blob = new Blob(['﻿' + MODEL.join('\r\n') + '\r\n'], { type: 'text/csv;charset=utf-8' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = SUP ? 'modelo-fornecedores.csv' : 'modelo-clientes.csv';
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
    }
    async function loadFile(file) {
        if (!/\.(csv|txt|xlsx|xlsm|xls)$/i.test(file.name)) { toast('warning', 'Escolha a planilha: arquivo do Excel (.xlsx ou .xls) ou CSV.'); return; }
        $('iclBody').innerHTML = `<div class="icl-done"><span class="big load">${I('loader-circle')}</span><h3>Lendo a planilha…</h3><p>${esc(file.name)}</p></div>`;
        try {
            await planilha();
            // 39.14 · Excel (.xlsx), a ".xls" de outros sistemas (tabela HTML/XML) ou CSV, pelo leitor do importar-produtos
            const [{ rows }, existing] = await Promise.all([P.readTable ? P.readTable(file) : P.readText(file).then(t => P.parseCSV(t)), loadExisting()]);
            if (rows.length < 2) throw new Error('A planilha está vazia ou só tem o cabeçalho.');
            const headers = rows[0].map(h => P.clean(h)), data = rows.slice(1).map(r => headers.map((_, i) => r[i] ?? ''));
            const map = P.mapCols(headers, FIELDS);
            if (map.name < 0 && map.fantasyName > -1) { map.name = map.fantasyName; map.fantasyName = -1; }
            const DOCS = ['cpf', 'cnpj', 'cpf_cnpj', 'cpf_ou_cnpj', 'cnpj_cpf', 'documento', 'doc', 'cpfcnpj'];
            S = { file: file.name, headers, rows: data, map, existing, style: 'dot', mode: 'update', debts: true, due: today(), busy: false,
                docCols: headers.map((h, i) => [P.key(h), i]).filter(([k, i]) => DOCS.includes(k) && i !== map.document).map(([, i]) => i) };
            S.style = P.numStyle(data, ['debt', 'creditLimit'].map(f => map[f]).filter(i => i > -1));
            build(); stepPreview();
        } catch (e) {
            console.error(e);
            $('iclBody').innerHTML = `<div class="icl-done"><span class="big err">${I('triangle-alert')}</span><h3>Não foi possível ler a planilha</h3><p>${esc(e.message)}</p></div>`;
            $('iclFoot').innerHTML = `<button class="btn btn-outline" type="button" data-icl="again">${I('arrow-left')} Escolher outro arquivo</button>`;
        }
    }
    function stepPreview() {
        const c = counts(), H = S.headers;
        const opt = sel => `<option value="-1">— não usar —</option>` + H.map((h, i) => `<option value="${i}" ${sel === i ? 'selected' : ''}>${esc(h || 'coluna ' + (i + 1))}</option>`).join('');
        const tag = x => x.skip ? `<span class="icl-tag skip" title="${esc(x.why || '')}">${x.joined ? 'Juntado' : 'Ignorada'}</span>` : x.match ? (S.mode === 'skip' ? '<span class="icl-tag skip">Já existe · pular</span>' : `<span class="icl-tag upd" title="${esc(x.why || '')}">Atualizar</span>`) : '<span class="icl-tag new">Novo</span>';
        const rows = S.items.slice(0, 30).map(x => `<tr><td>${x.line}</td><td><b>${esc(x.name || '—')}</b>${x.match ? `<small>já cadastrado: ${esc(x.match.name || '')} (${esc(x.why || '')})</small>` : x.skip ? `<small>${esc(x.why || '')}</small>` : ''}</td><td>${esc(x.document || '')}</td><td>${esc(x.phone || x.whatsapp || '')}</td><td>${esc([x.city, x.state].filter(Boolean).join(' - '))}</td><td class="r">${x.debt ? money(x.debt) : '—'}</td><td>${tag(x)}</td></tr>`).join('');
        const warns = S.items.filter(x => !x.skip && x.warn && x.warn.length).slice(0, 8).map(x => `Linha ${x.line} · ${esc(x.name)}: ${esc(x.warn.join(', '))}`);
        const missing = FIELDS.filter(([f, , req]) => req && S.map[f] < 0);
        const total = c.news.length + (S.mode === 'skip' ? 0 : c.upd.length);
        $('iclBody').innerHTML = `<div class="icl-sum">
  <div class="icl-card"><span>Na planilha</span><b>${c.items.length}</b><small>${[c.ignored ? c.ignored + ' linha(s) ignorada(s)' : '', S.joined ? S.joined + ' cadastro(s) repetido(s) juntado(s) no primeiro' : '', S.merged ? S.merged + ' telefone(s) a mais juntado(s) ao cliente de cima' : ''].filter(Boolean).join(' · ') || esc(S.file)}</small></div>
  <div class="icl-card"><span>Novos</span><b>${c.news.length}</b><small>serão cadastrados</small></div>
  <div class="icl-card"><span>Já cadastrados</span><b>${c.upd.length}</b><small>${S.mode === 'skip' ? 'serão pulados' : 'serão atualizados'}</small></div>
  <div class="icl-card"><span>${SUP ? 'Saldo a pagar' : 'Saldo devedor'}</span><b>${money(S.debts ? c.debtSum : 0)}</b><small>${S.debts ? c.debtN + ' conta(s) ' + (SUP ? 'a pagar' : 'a receber') : 'não será lançado'}</small></div>
</div>
<div class="icl-sec"><h4>${I('eye')}Prévia ${S.items.length > 30 ? '<small style="font-weight:500;color:var(--text-muted)">(primeiras 30 linhas)</small>' : ''}</h4>
  <div class="icl-wrap"><table class="icl-table"><thead><tr><th>Linha</th><th>${W.One}</th><th>${SUP ? 'CNPJ / CPF' : 'CPF / CNPJ'}</th><th>Telefone</th><th>Cidade</th><th class="r">Saldo</th><th>Ação</th></tr></thead><tbody>${rows}</tbody></table></div>
  ${warns.length ? `<div class="icl-warns">${I('triangle-alert')} ${warns.join('<br>')}</div>` : ''}
</div>
<details class="icl-sec icl-cols" ${missing.length || S.colsOpen ? 'open' : ''}><summary><h4>${I('columns-3')}Colunas da planilha → campos do sistema <small>${FIELDS.filter(([f]) => S.map[f] > -1).length} reconhecida(s) · toque para conferir</small>${I('chevron-down')}</h4></summary><p>Já reconhecidas pelo nome. Confira e troque se alguma estiver errada. Valores lidos no formato ${S.style === 'br' ? '<b>1.234,56</b>' : '<b>1234.56</b>'}.</p>
  <div class="icl-map">${FIELDS.map(([f, label, req]) => `<label class="${req && S.map[f] < 0 ? 'miss' : ''}"><span>${esc(label)}${req ? ' <em>*</em>' : ''}</span><select class="form-control" data-map="${f}">${opt(S.map[f])}</select></label>`).join('')}</div></details>
<div class="icl-sec"><h4>${I('sliders-horizontal')}Opções</h4><div class="icl-opts">
  <div><b style="font-size:12.5px">${W.Many} que já estão cadastrados</b> <small>(${SUP ? 'mesmo CNPJ/CPF, telefone ou nome' : 'mesmo CPF/CNPJ ou telefone'})</small></div>
  <label><input type="radio" name="iclMode" value="update" ${S.mode === 'update' ? 'checked' : ''}><span>Atualizar com os dados da planilha<small>Só os campos preenchidos na planilha mudam; o resto do cadastro continua como está.</small></span></label>
  <label><input type="radio" name="iclMode" value="skip" ${S.mode === 'skip' ? 'checked' : ''}><span>Pular (não mexer nos que já existem)</span></label>
  ${S.map.debt > -1 ? `<label><input type="checkbox" id="iclDebts" ${S.debts ? 'checked' : ''}><span>Lançar o ${SUP ? 'saldo a pagar como conta a pagar' : 'saldo devedor como conta a receber (fiado)'} em aberto<small>Uma conta para cada ${W.one} com saldo, com a origem "importação".</small></span></label>
  <div class="icl-due">Vencimento <input type="date" class="form-control" id="iclDue" value="${esc(S.due)}" ${S.debts ? '' : 'disabled'}></div>` : ''}
</div></div>`;
        $('iclFoot').innerHTML = `<button class="btn btn-outline" type="button" data-icl="again">${I('arrow-left')} Outro arquivo</button><span class="sp"></span><button class="btn btn-primary" type="button" data-icl="run" ${missing.length || !total ? 'disabled' : ''}>${I('upload')} Importar ${total} ${total === 1 ? W.one : W.many}</button>`;
    }
    function onChange(e) {
        const t = e.target;
        if (t.id === 'iclFile' && t.files && t.files[0]) return loadFile(t.files[0]);
        if (!S) return;
        if (t.dataset.map) { S.colsOpen = true; S.map[t.dataset.map] = Number(t.value); S.style = P.numStyle(S.rows, ['debt', 'creditLimit'].map(f => S.map[f]).filter(i => i > -1)); build(); return stepPreview(); }
        if (t.name === 'iclMode') { S.mode = t.value; return stepPreview(); }
        if (t.id === 'iclDebts') { S.debts = t.checked; return stepPreview(); }
        if (t.id === 'iclDue') { S.due = t.value || today(); }
    }
    function onClick(e) {
        const b = e.target.closest('[data-icl]'); if (!b) return;
        const a = b.dataset.icl;
        if (a === 'close') return close();
        if (a === 'model') return model();
        if (a === 'again') { if (S && S.busy) return; S = null; return stepFile(); }
        if (a === 'run') return run();
        if (a === 'undo') return undo(b.dataset.id, b);
    }

    /* ---------- Gravação ---------- */
    async function commit(ops, onStep) {
        for (let i = 0; i < ops.length; i += 40) {
            const part = ops.slice(i, i + 40), batch = db.batch();
            part.forEach(o => o.kind === 'set' ? batch.set(o.ref, o.data) : batch.update(o.ref, o.data));
            await batch.commit();
            if (onStep) onStep(Math.min(ops.length, i + 40), ops.length);
        }
    }
    // Os dados que a planilha traz para este cadastro (sem apagar o que a planilha deixou em branco)
    function dataOf(x, isNew) {
        const d = {};
        const put = (k, v) => { if (isNew || (v !== '' && v !== null && v !== undefined && !(typeof v === 'number' && !v))) d[k] = v; };
        put('name', x.name);
        if (SUP) {
            put('companyName', x.name); put('fantasyName', x.fantasyName); put('cnpj', x.document); put('document', x.document); put('phone', x.phone); put('whatsapp', x.whatsapp); put('email', x.email);
            put('representative', x.representative); put('address', x.address); put('city', x.city); put('state', x.state); put('paymentTerms', x.paymentTerms); put('categories', x.categories); put('notes', [x.notes, ...(x.extra || [])].filter(Boolean).join('\n'));
        } else {
            const mobile = phoneD(x.phone).length === 11, m = x.match || {};
            if (isNew || x.docD.length === 11 || x.docD.length === 14) put('type', x.docD.length === 14 ? 'pj' : 'pf');
            put('document', x.document); put('phone', x.phone); put('whatsapp', x.whatsapp || (mobile && (isNew || !m.whatsapp) ? x.phone : '')); put('email', x.email);
            put('birthDate', x.birthDate); put('zip', x.zip); put('street', x.street); put('number', x.number); put('complement', x.complement);
            put('address', [x.street, x.number, x.complement].filter(Boolean).join(', ')); put('neighborhood', x.neighborhood); put('city', x.city); put('state', x.state);
            put('creditLimit', x.creditLimit); put('notes', [x.notes, ...(x.extra || [])].filter(Boolean).join('\n'));
            // 39.14 · nota fiscal do cliente: IE (indIE 1 = contribuinte, 2 = isento) e inscrição municipal
            if (x.ie) { put('indIE', x.ie === 'ISENTO' ? 2 : 1); put('ie', x.ie === 'ISENTO' ? '' : x.ie); }
            put('im', x.im); put('fantasyName', x.fantasyName); put('legacySince', x.since);
            if (isNew) { d.addressRef = ''; d.classification = 'normal'; d.photo = ''; }
        }
        if (isNew || x.active === false) d.status = x.active === false ? 'inactive' : 'active';
        return d;
    }
    async function run() {
        if (!S || S.busy) return;
        const c = counts(), todo = S.mode === 'skip' ? c.news : c.items, debtsOn = S.debts && S.map.debt > -1;
        if (!todo.length) return;
        const due = S.due || today(), dueTxt = due.split('-').reverse().join('/');
        if (!confirm(`Importar ${todo.length} ${todo.length === 1 ? W.one : W.many} de "${S.file}"?\n\n• ${c.news.length} novo(s)${S.mode === 'update' && c.upd.length ? `\n• ${c.upd.length} atualizado(s)` : ''}${debtsOn && c.debtN ? `\n• ${c.debtN} conta(s) ${SUP ? 'a pagar' : 'a receber'} somando ${money(c.debtSum)}, vencendo em ${dueTxt}` : ''}\n\nDá para desfazer depois.`)) return;
        S.busy = true;
        const batchId = 'impc_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        $('iclFoot').innerHTML = '';
        $('iclBody').innerHTML = `<div class="icl-done"><span class="big load">${I('loader-circle')}</span><h3>Importando ${W.many}…</h3><p id="iclStatus">Preparando…</p><div class="icl-bar"><i id="iclBar"></i></div><p style="font-size:12px;color:var(--text-muted)">Não feche esta janela até terminar.</p></div>`;
        const status = t => { const el = $('iclStatus'); if (el) el.textContent = t; };
        const bar = p => { const el = $('iclBar'); if (el) el.style.width = Math.round(p * 100) + '%'; };
        const res = { created: 0, updated: 0, debts: 0, debtSum: 0 };
        try {
            const ops = [], dueDate = TS().fromDate(new Date(due + 'T12:00:00'));
            for (const x of todo) {
                let id, name = x.name;
                if (x.match) {
                    id = x.match.id; name = x.match.name || x.name;
                    const d = dataOf(x, false), prev = {};
                    Object.keys(d).forEach(k => { prev[k] = x.match[k] === undefined ? '' : x.match[k]; });
                    ops.push({ kind: 'update', ref: db.collection(COL).doc(id), data: { ...d, importUpdBatch: batchId, importPrev: prev, updatedAt: ts(), updatedBy: uid() } });
                    res.updated++;
                } else {
                    const ref = db.collection(COL).doc(); id = ref.id;
                    ops.push({ kind: 'set', ref, data: { ...dataOf(x, true), importBatch: batchId, importSource: S.file, deleted: false, createdAt: ts(), updatedAt: ts(), createdBy: uid() } });
                    res.created++;
                }
                if (debtsOn && x.debt > 0) {
                    const fin = SUP
                        ? { type: 'expense', supplierId: id, supplierName: name, category: 'Fornecedores', description: `Saldo a pagar anterior — ${name} (importação da planilha)` }
                        : { type: 'income', customerId: id, customerName: name, debtorName: name, debtorPhone: x.phone || x.whatsapp || '', debtorDoc: x.document || '', category: 'Fiado', description: `Saldo anterior — ${name} (importação da planilha)` };
                    ops.push({ kind: 'set', ref: db.collection('financial_entries').doc(), data: { ...fin, amount: x.debt, dueDate, status: 'pending', origin: 'importacao', referenceType: 'import', referenceId: batchId, importBatch: batchId, notes: 'Saldo trazido da planilha ' + S.file, installment: null, deleted: false, createdAt: ts(), createdBy: uid() } });
                    res.debts++; res.debtSum = r2(res.debtSum + x.debt);
                }
            }
            status(`Gravando ${ops.length} registro(s)…`);
            await commit(ops, (n, t) => { bar(n / t); status(`Gravando… ${n} de ${t}`); });
            const h = hist(); h.unshift({ id: batchId, file: S.file, at: Date.now(), created: res.created, updated: res.updated, debts: res.debts }); saveHist(h);
            try { if (window.AuditService && AuditService.log) AuditService.log('import', COL, batchId, { file: S.file, created: res.created, updated: res.updated, debts: res.debts, debtSum: res.debtSum }); } catch (e) { }
            S.busy = false;
            $('iclBody').innerHTML = `<div class="icl-done"><span class="big">${I('circle-check')}</span><h3>Importação concluída!</h3><p><b>${res.created}</b> ${W.one}(s) cadastrado(s)${res.updated ? `, <b>${res.updated}</b> atualizado(s)` : ''}.${res.debts ? ` <b>${money(res.debtSum)}</b> em ${res.debts} conta(s) ${SUP ? 'a pagar' : 'a receber'} com vencimento em ${dueTxt}.` : ''}</p>
<p style="margin-top:10px;font-size:12px;color:var(--text-muted)">Se algo saiu errado, "Desfazer importação" tira os ${W.many} novos, devolve os dados antigos dos que foram atualizados e apaga as contas lançadas agora.</p></div>`;
            $('iclFoot').innerHTML = `<button class="btn btn-outline" type="button" data-icl="undo" data-id="${esc(batchId)}">${I('rotate-ccw')} Desfazer importação</button><span class="sp"></span><button class="btn btn-primary" type="button" data-icl="close">${I('check')} Ver os ${W.many}</button>`;
            toast('success', `${res.created + res.updated} ${W.one}(s) importado(s)!`);
        } catch (e) {
            console.error(e); S.busy = false;
            const h = hist(); h.unshift({ id: batchId, file: S.file, at: Date.now(), created: res.created, updated: res.updated, debts: res.debts, partial: true }); saveHist(h);
            $('iclBody').innerHTML = `<div class="icl-done"><span class="big err">${I('triangle-alert')}</span><h3>A importação parou no meio</h3><p>${esc(e.message || 'Erro ao gravar')}.<br>Parte pode já ter sido gravada. Use <b>Desfazer</b> para tirar o que entrou e tente de novo.</p></div>`;
            $('iclFoot').innerHTML = `<button class="btn btn-outline" type="button" data-icl="undo" data-id="${esc(batchId)}">${I('rotate-ccw')} Desfazer o que entrou</button><span class="sp"></span><button class="btn btn-primary" type="button" data-icl="close">Fechar</button>`;
        }
        reload();
    }
    function reload() {
        try { if (!SUP && window.dpClientes && dpClientes.reload) dpClientes.reload(); } catch (e) { }
        try { if (SUP && typeof window.loadSuppliers === 'function') window.loadSuppliers(); } catch (e) { }
    }
    async function undo(batchId, btn) {
        if (!batchId || (S && S.busy)) return;
        if (!confirm(`Desfazer esta importação?\n\nOs ${W.many} novos saem da lista, os que foram atualizados voltam aos dados de antes e as contas lançadas por ela são apagadas.`)) return;
        if (btn) { btn.disabled = true; btn.innerHTML = I('loader-circle') + ' Desfazendo…'; }
        try {
            const del = { deleted: true, deletedAt: ts(), deletedBy: uid() };
            const [nw, up, fin] = await Promise.all([
                db.collection(COL).where('importBatch', '==', batchId).get(),
                db.collection(COL).where('importUpdBatch', '==', batchId).get(),
                db.collection('financial_entries').where('importBatch', '==', batchId).get()
            ]);
            const ops = [];
            nw.docs.filter(d => (d.data() || {}).deleted !== true).forEach(d => ops.push({ kind: 'update', ref: db.collection(COL).doc(d.id), data: { ...del, status: 'inactive' } }));
            up.docs.forEach(d => { const x = d.data() || {}; ops.push({ kind: 'update', ref: db.collection(COL).doc(d.id), data: { ...(x.importPrev || {}), importPrev: null, importUpdBatch: '', updatedAt: ts(), updatedBy: uid() } }); });
            fin.docs.filter(d => (d.data() || {}).deleted !== true).forEach(d => ops.push({ kind: 'update', ref: db.collection('financial_entries').doc(d.id), data: del }));
            await commit(ops);
            saveHist(hist().map(x => x.id === batchId ? { ...x, undone: true } : x));
            toast('success', `Importação desfeita: ${nw.size} ${W.one}(s) novo(s) removido(s)${up.size ? `, ${up.size} voltaram ao que eram` : ''}${fin.size ? `, ${fin.size} conta(s) apagada(s)` : ''}.`);
            reload(); S = null; stepFile();
        } catch (e) { console.error(e); toast('error', 'Não foi possível desfazer: ' + (e.message || e)); if (btn) { btn.disabled = false; btn.innerHTML = I('rotate-ccw') + ' Desfazer'; } }
    }

    /* ---------- Botão na tela ---------- */
    function mount() {
        // Só administrador e gerente (espera o app carregar quem entrou; o papel guardado no navegador pode ser de outro)
        let r = ''; try { r = typeof currentUser !== 'undefined' && currentUser ? currentUser.role : ''; } catch (e) { }
        if (!['admin', 'manager'].includes(r) || $('iclBtn')) return;
        const anchor = SUP ? document.querySelector('.page-content [onclick="openSupplierModal()"], .page-content [onclick="openModal(\'modalFornecedor\')"]') : $('cliPdf');
        if (!anchor) return;
        const b = document.createElement('button'); b.type = 'button'; b.id = 'iclBtn'; b.className = 'btn btn-outline icl-btn';
        b.innerHTML = `${I('file-spreadsheet')}Importar planilha`; b.title = `Trazer ${W.many} de uma planilha (Excel ou CSV) com o saldo ${SUP ? 'a pagar' : 'do fiado'}`;
        b.addEventListener('click', open);
        anchor.insertAdjacentElement('beforebegin', b);
        if (!$('iclBtnCss')) { const s = document.createElement('style'); s.id = 'iclBtnCss'; s.textContent = '.icl-btn svg.dpi{width:15px;height:15px;margin-right:5px;vertical-align:-2px}' + (SUP ? '.icl-btn{margin-right:8px}' : ''); document.head.appendChild(s); }
    }
    window.DPImportClientes = { open, close, undo };
    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    ready(() => {
        mount();
        const root = SUP ? document.querySelector('.page-content') : $('cliRoot');
        if (root) new MutationObserver(() => { if (!$('iclBtn')) mount(); }).observe(root, { childList: true, subtree: true });
        let n = 0; const t = setInterval(() => { mount(); if ($('iclBtn') || ++n > 40) clearInterval(t); }, 250);
    });
})();
