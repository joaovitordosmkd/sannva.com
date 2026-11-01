/* DistribuiPro 35.32 · CNPJ que se preenche sozinho.
   Digitou um CNPJ válido (14 números) num campo de CNPJ: consulta grátis na BrasilAPI (reserva: CNPJ.ws) e
   preenche razão social, nome fantasia, endereço, telefone e e-mail da tela, com "Desfazer".
   Telas: Configurações › Empresa, Clientes, Fornecedores, Contas a receber (cliente avulso), PDV (cliente rápido)
   e OS (novo cliente). Carregado pelo os-pro-v1.js (que está em todas as páginas com menu). */
(function () {
    'use strict';
    if (window.DPCnpj) return;
    const digits = s => String(s || '').replace(/\D/g, '');
    function validCnpj(c) {
        if (c.length !== 14 || /^(\d)\1{13}$/.test(c)) return false;
        const dv = n => { const w = n === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]; const s = w.reduce((a, x, i) => a + x * Number(c[i]), 0) % 11; return s < 2 ? 0 : 11 - s; };
        return dv(12) === Number(c[12]) && dv(13) === Number(c[13]);
    }
    const SMALL = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos', 'a', 'o', 'à']);
    const KEEP = new Set(['ltda', 'me', 'epp', 'eireli', 's/a', 'sa', 'mei']);
    // "RUA DOUTOR JOAO DA SILVA" → "Rua Doutor Joao da Silva"
    const title = s => String(s || '').toLowerCase().split(/\s+/).filter(Boolean).map((w, i) => KEEP.has(w) || /^[ivx]{1,4}[,.;]?$/.test(w) ? w.toUpperCase() : (i && SMALL.has(w)) ? w : w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
    const fmtCep = c => { const d = digits(c); return d.length === 8 ? d.slice(0, 5) + '-' + d.slice(5) : d; };
    const fmtPhone = p => { const d = digits(p).replace(/^0+/, ''); return d.length === 11 ? `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}` : d.length === 10 ? `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}` : ''; };
    async function getJson(url) {
        const ctl = 'AbortController' in window ? new AbortController() : null, t = ctl ? setTimeout(() => ctl.abort(), 9000) : 0;
        try { const r = await fetch(url, { signal: ctl ? ctl.signal : undefined, headers: { Accept: 'application/json' } }); if (r.status === 404 || r.status === 400) { const e = new Error('nao-encontrado'); e.notFound = true; throw e; } if (!r.ok) throw new Error('http ' + r.status); return await r.json(); }
        finally { if (t) clearTimeout(t); }
    }
    const cache = new Map();
    async function lookup(cnpj) {
        if (cache.has(cnpj)) return cache.get(cnpj);
        let d = null, notFound = false;
        try {
            const j = await getJson('https://brasilapi.com.br/api/cnpj/v1/' + cnpj);
            d = { razao: j.razao_social || '', fantasia: j.nome_fantasia || '', cep: j.cep || '', street: [j.descricao_tipo_de_logradouro, j.logradouro].filter(Boolean).join(' '), number: j.numero || '', complement: j.complemento || '', district: j.bairro || '', city: j.municipio || '', uf: j.uf || '', phone: j.ddd_telefone_1 || j.ddd_telefone_2 || '', email: j.email || '', situacao: j.descricao_situacao_cadastral || '' };
        } catch (e) {
            notFound = !!e.notFound;
            try {
                const j = await getJson('https://publica.cnpj.ws/cnpj/' + cnpj), es = j.estabelecimento || {};
                d = { razao: j.razao_social || '', fantasia: es.nome_fantasia || '', cep: es.cep || '', street: [es.tipo_logradouro, es.logradouro].filter(Boolean).join(' '), number: es.numero || '', complement: es.complemento || '', district: es.bairro || '', city: (es.cidade && es.cidade.nome) || '', uf: (es.estado && es.estado.sigla) || '', phone: es.ddd1 && es.telefone1 ? es.ddd1 + es.telefone1 : '', email: es.email || '', situacao: es.situacao_cadastral || '' };
            } catch (e2) { if (e2.notFound) notFound = true; if (!notFound) throw e2; }
        }
        if (!d) { const e = new Error('nao-encontrado'); e.notFound = true; throw e; }
        d.street = title(d.street); d.district = title(d.district); d.city = title(d.city); d.complement = title(d.complement); d.fantasia = title(d.fantasia);
        d.cep = fmtCep(d.cep); d.phone = fmtPhone(d.phone); d.email = String(d.email || '').toLowerCase(); d.uf = String(d.uf || '').toUpperCase();
        d.address = [[d.street, d.number].filter(Boolean).join(', '), d.complement, d.district, [d.city, d.uf].filter(Boolean).join('/'), d.cep && 'CEP ' + d.cep].filter(Boolean).join(' - ');
        cache.set(cnpj, d); return d;
    }

    // Onde fica o CNPJ e para onde vai cada dado (seletores da tela)
    const F = '#modalFornecedor ';
    const PROFILES = [
        { cnpj: '#cfg_cnpj', map: { razao: '#cfg_razao_social', fantasia: '#cfg_nome_fantasia', phone: '#cfg_telefone', email: '#cfg_email', cep: '#cfg_cep', street: '#cfg_logradouro', number: '#cfg_numero', district: '#cfg_bairro', city: '#cfg_cidade', uf: '#cfg_uf' } },
        { cnpj: '#clientDoc', map: { razao: '#clientNome', phone: '#clientTelefone', email: '#clientEmail', cep: '#clientCEP', street: '#clientRua', number: '#clientNumero', complement: '#clientComplemento', district: '#clientBairro', city: '#clientCidade', uf: '#clientUF' }, set: { '#clientTipo': 'pj' } },
        { cnpj: F + 'input[placeholder="00.000.000/0000-00"]', map: { razao: F + 'input[placeholder="Razão social da empresa"]', fantasia: F + 'input[placeholder="Nome fantasia"]', phone: F + 'input[placeholder="(00) 0000-0000"]', email: F + 'input[type="email"]', address: F + 'input[placeholder="Endereço completo"]', city: F + 'input[placeholder="Cidade"]', uf: F + '.form-grid select' } },
        { cnpj: '#rec_docAvulso', map: { razao: '#rec_nomeAvulso', address: '#rec_endAvulso' } },
        { cnpj: '#qcDoc', map: { razao: '#qcNome', phone: '#qcTelefone', address: '#qcEndereco' } },
        { cnpj: '#ospDlg [data-f="document"]', map: { razao: '#ospDlg [data-f="name"]', phone: '#ospDlg [data-f="phone"]', email: '#ospDlg [data-f="email"]', address: '#ospDlg [data-f="address"]' } }
    ];
    const profileOf = el => PROFILES.find(p => { try { return el.matches(p.cnpj); } catch (e) { return false; } });

    const css = document.createElement('style');
    css.textContent = `.dpcnpj-st{display:block;margin-top:5px;font-size:11.5px;line-height:1.4;color:var(--text-muted)}
.dpcnpj-st.ok{color:var(--success,#16a34a)}.dpcnpj-st.warn{color:var(--warning,#d97706)}.dpcnpj-st.err{color:var(--danger,#dc2626)}
.dpcnpj-st button{border:0;background:none;padding:0;margin-left:6px;color:var(--accent,#2563eb);font:inherit;font-weight:700;cursor:pointer;text-decoration:underline}
.dpcnpj-st .sp{display:inline-block;width:10px;height:10px;margin-right:6px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:dpcnpjspin .7s linear infinite;vertical-align:-1px}
@keyframes dpcnpjspin{to{transform:rotate(360deg)}}
.dpcnpj-fill{animation:dpcnpjfill 1.6s ease-out}
@keyframes dpcnpjfill{0%{box-shadow:0 0 0 3px rgba(16,185,129,.55)}100%{box-shadow:0 0 0 0 rgba(16,185,129,0)}}`;
    document.head.appendChild(css);

    function status(el, cls, html) {
        let s = el.parentElement && el.parentElement.querySelector(':scope > .dpcnpj-st');
        if (!s) { s = document.createElement('small'); s.className = 'dpcnpj-st'; el.insertAdjacentElement('afterend', s); }
        s.className = 'dpcnpj-st ' + (cls || ''); s.innerHTML = html; return s;
    }
    function setVal(t, v) {
        if (t.tagName === 'SELECT' && v && ![...t.options].some(o => o.value === v || o.text === v)) t.add(new Option(v, v));
        if (t.tagName === 'SELECT') { const o = [...t.options].find(o => o.value === v || o.text === v); t.value = o ? o.value : v; } else t.value = v;
        t.dispatchEvent(new Event('input', { bubbles: true })); t.dispatchEvent(new Event('change', { bubbles: true }));
        t.classList.remove('dpcnpj-fill'); void t.offsetWidth; t.classList.add('dpcnpj-fill');
    }
    function fill(el, p, d) {
        const undo = [];
        const put = (sel, v) => { if (!v) return; const t = document.querySelector(sel); if (!t || t === el) return; undo.push([t, t.value]); setVal(t, v); };
        for (const [k, sel] of Object.entries(p.map)) put(sel, d[k]);
        for (const [sel, v] of Object.entries(p.set || {})) put(sel, v);
        return undo;
    }
    let timer = 0;
    async function check(el) {
        const p = profileOf(el); if (!p) return;
        const c = digits(el.value);
        if (c.length !== 14) { if (c.length > 11 || el.dataset.dpCnpj) { const s = el.parentElement && el.parentElement.querySelector(':scope > .dpcnpj-st'); if (s && c.length < 14) s.remove(); } delete el.dataset.dpCnpj; return; }
        if (el.dataset.dpCnpj === c) return;
        el.dataset.dpCnpj = c;
        if (!validCnpj(c)) { status(el, 'err', 'CNPJ inválido. Confira os números.'); return; }
        status(el, '', '<span class="sp"></span>Consultando o CNPJ na Receita Federal…');
        try {
            const d = await lookup(c);
            if (digits(el.value) !== c) return; // digitou outro enquanto buscava
            const undo = fill(el, p, d);
            const sit = String(d.situacao || '').toUpperCase(), bad = sit && sit !== 'ATIVA';
            const s = status(el, bad ? 'warn' : 'ok', (bad ? `⚠ Atenção: este CNPJ está <b>${sit}</b> na Receita. ` : '✓ ') + `Preenchido com os dados da Receita${d.fantasia ? ' (' + d.fantasia.replace(/[<>&]/g, '') + ')' : ''}. Confira antes de salvar.` + (undo.length ? '<button type="button">Desfazer</button>' : ''));
            const b = s.querySelector('button'); if (b) b.onclick = () => { undo.reverse().forEach(([t, v]) => setVal(t, v)); status(el, '', 'Dados de antes restaurados.'); };
        } catch (e) {
            if (digits(el.value) !== c) return;
            delete el.dataset.dpCnpj;
            status(el, e.notFound ? 'warn' : 'err', e.notFound ? 'CNPJ não encontrado na Receita. Preencha os dados à mão.' : 'Não foi possível consultar o CNPJ agora (sem internet?). Preencha à mão ou tente de novo.');
        }
    }
    const onEdit = e => { const el = e.target; if (!el || !el.matches || !profileOf(el)) return; clearTimeout(timer); timer = setTimeout(() => check(el), 350); };
    document.addEventListener('input', onEdit, true);
    document.addEventListener('change', onEdit, true);
    window.DPCnpj = { lookup, validCnpj, check };
})();
