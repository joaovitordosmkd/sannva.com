/* DistribuiPro 36.6 · Cadastro rápido dentro do cadastro de produto (produtos.html)
   Botão "+" ao lado de Categoria e de Fornecedor principal: cria na hora, recarrega a lista e já deixa selecionado.
   Salva os mesmos campos das telas Categorias e Fornecedores. Funciona nas 5 versões (DataService ou FirestoreService). */
(function () {
    'use strict';
    const catSel = document.getElementById('prodCategory');
    const supSel = document.getElementById('prodSupplier');
    if (!catSel && !supSel) return;

    const svc = () => (typeof DataService !== 'undefined' ? DataService : (typeof FirestoreService !== 'undefined' ? FirestoreService : null));
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };

    const st = document.createElement('style');
    st.textContent = '.dpq-row{display:flex;gap:6px;align-items:stretch}.dpq-row>select{flex:1;min-width:0}.dpq-add{flex:0 0 38px;border:1px dashed var(--accent);background:var(--accent-muted,rgba(99,102,241,.12));color:var(--accent);border-radius:var(--radius-md,8px);cursor:pointer;font-size:14px;transition:.15s}.dpq-add:hover{background:var(--accent);color:#fff}.dpq-modal .form-group{margin-bottom:12px}.dpq-colors{display:flex;gap:6px;flex-wrap:wrap;margin-top:6px}.dpq-colors span{width:22px;height:22px;border-radius:50%;cursor:pointer;border:2px solid transparent}.dpq-colors span.on{border-color:var(--text-primary)}';
    document.head.appendChild(st);

    function addBtn(select, title, onClick) {
        if (!select || (select.parentElement && select.parentElement.classList.contains('dpq-row'))) return;
        const row = document.createElement('div'); row.className = 'dpq-row';
        select.parentNode.insertBefore(row, select); row.appendChild(select);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'dpq-add'; b.title = title; b.innerHTML = '<i class="fas fa-plus"></i>';
        b.addEventListener('click', onClick); row.appendChild(b);
    }

    function modal(title, bodyHtml, onSave) {
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpq-modal';
        ov.innerHTML = `<div class="modal" style="max-width:460px"><div class="modal-header"><h3>${title}</h3><button class="modal-close" type="button"><i class="fas fa-times"></i></button></div><div class="modal-body">${bodyHtml}</div><div class="modal-footer"><button class="btn btn-secondary" type="button" data-cancel>Cancelar</button><button class="btn btn-primary" type="button" data-save><i class="fas fa-check"></i> Salvar e usar</button></div></div>`;
        document.body.appendChild(ov);
        const close = () => ov.remove();
        ov.querySelector('.modal-close').onclick = close; ov.querySelector('[data-cancel]').onclick = close;
        const btn = ov.querySelector('[data-save]');
        btn.onclick = async () => {
            btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Salvando...';
            try { if (await onSave(ov)) close(); else { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar e usar'; } }
            catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); btn.disabled = false; btn.innerHTML = '<i class="fas fa-check"></i> Salvar e usar'; }
        };
        ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') { e.preventDefault(); btn.click(); } });
        setTimeout(() => { const f = ov.querySelector('input'); if (f) f.focus(); }, 50);
        return ov;
    }

    /* ---------- Categoria ---------- */
    const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316', '#64748b'];
    function newCategory() {
        const typed = '';
        modal('<i class="fas fa-tags" style="color:var(--accent);margin-right:8px"></i>Nova categoria',
            `<div class="form-group"><label class="form-label">Nome da categoria *</label><input type="text" class="form-control" id="dpqCatName" placeholder="Ex: Bebidas, Limpeza, Serviços..." value="${esc(typed)}"></div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
               <div class="form-group"><label class="form-label">Ícone (emoji)</label><input type="text" class="form-control" id="dpqCatIcon" value="📦" maxlength="4"></div>
               <div class="form-group"><label class="form-label">Cor</label><input type="color" class="form-control" id="dpqCatColor" value="#6366f1" style="height:40px;padding:4px"><div class="dpq-colors">${COLORS.map(c => `<span style="background:${c}" data-c="${c}" title="${c}"></span>`).join('')}</div></div>
             </div>
             <div style="font-size:11px;color:var(--text-muted)">A categoria aparece na tela Categorias, no PDV e nos filtros.</div>`,
            async ov => {
                const name = ov.querySelector('#dpqCatName').value.trim();
                if (!name) { toast('warning', 'Informe o nome da categoria.'); return false; }
                const exists = [...catSel.options].some(o => (o.value || '').toLowerCase() === name.toLowerCase());
                if (exists) { catSel.value = [...catSel.options].find(o => (o.value || '').toLowerCase() === name.toLowerCase()).value; toast('info', 'Essa categoria já existe — selecionada.'); return true; }
                const s = svc(); if (!s) throw new Error('Serviço de dados indisponível');
                const data = { name, icon: ov.querySelector('#dpqCatIcon').value.trim() || '📦', color: ov.querySelector('#dpqCatColor').value || '#6366f1', active: true, status: 'active' };
                await s.create('categories', data);
                if (typeof window.loadCategoriesForSelect === 'function') { try { await window.loadCategoriesForSelect(); } catch (e) { console.warn(e); } }
                if (![...catSel.options].some(o => o.value === name)) { const o = document.createElement('option'); o.value = name; o.textContent = `${data.icon} ${name}`; catSel.appendChild(o); }
                catSel.value = name; catSel.dispatchEvent(new Event('change', { bubbles: true }));
                toast('success', `Categoria "${name}" criada e selecionada!`);
                return true;
            });
        document.querySelectorAll('.dpq-modal .dpq-colors span').forEach(sp => sp.addEventListener('click', () => { const inp = document.getElementById('dpqCatColor'); if (inp) inp.value = sp.dataset.c; document.querySelectorAll('.dpq-modal .dpq-colors span').forEach(x => x.classList.toggle('on', x === sp)); }));
    }

    /* ---------- Fornecedor ---------- */
    function newSupplier() {
        modal('<i class="fas fa-industry" style="color:var(--accent);margin-right:8px"></i>Novo fornecedor',
            `<div class="form-group"><label class="form-label">Razão social / Nome *</label><input type="text" class="form-control" id="dpqSupName" placeholder="Nome do fornecedor"></div>
             <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
               <div class="form-group"><label class="form-label">Nome fantasia</label><input type="text" class="form-control" id="dpqSupFant"></div>
               <div class="form-group"><label class="form-label">CNPJ</label><input type="text" class="form-control" id="dpqSupCnpj" placeholder="00.000.000/0000-00"></div>
               <div class="form-group"><label class="form-label">Telefone / WhatsApp</label><input type="text" class="form-control" id="dpqSupPhone" placeholder="(00) 00000-0000"></div>
               <div class="form-group"><label class="form-label">E-mail</label><input type="email" class="form-control" id="dpqSupEmail" placeholder="contato@fornecedor.com"></div>
             </div>
             <div style="font-size:11px;color:var(--text-muted)">Endereço, representante e condições você completa depois na tela Fornecedores.</div>`,
            async ov => {
                const name = ov.querySelector('#dpqSupName').value.trim();
                if (!name) { toast('warning', 'Informe o nome do fornecedor.'); return false; }
                const s = svc(); if (!s) throw new Error('Serviço de dados indisponível');
                const phone = ov.querySelector('#dpqSupPhone').value.trim();
                const data = { name, fantasyName: ov.querySelector('#dpqSupFant').value.trim(), cnpj: ov.querySelector('#dpqSupCnpj').value.trim(), phone, whatsapp: phone, email: ov.querySelector('#dpqSupEmail').value.trim(), representative: '', address: '', city: '', state: '', paymentTerms: '', categories: '', notes: '', status: 'active' };
                const r = await s.create('suppliers', data);
                if (typeof window.loadSuppliersForSelect === 'function') { try { await window.loadSuppliersForSelect(); } catch (e) { console.warn(e); } }
                if (![...supSel.options].some(o => o.value === r.id)) { const o = document.createElement('option'); o.value = r.id; o.dataset.name = name; o.textContent = name; supSel.appendChild(o); }
                supSel.value = r.id; supSel.dispatchEvent(new Event('change', { bubbles: true }));
                toast('success', `Fornecedor "${name}" cadastrado e selecionado!`);
                return true;
            });
        const cnpj = document.getElementById('dpqSupCnpj'), ph = document.getElementById('dpqSupPhone');
        const U = typeof Utils !== 'undefined' ? Utils : null; // Utils é "const" do core-services (fora do window)
        if (cnpj && U && U.maskCNPJ) cnpj.addEventListener('input', function () { this.value = U.maskCNPJ(this.value); });
        if (ph && U && U.maskPhone) ph.addEventListener('input', function () { this.value = U.maskPhone(this.value); });
    }

    addBtn(catSel, 'Cadastrar nova categoria', newCategory);
    addBtn(supSel, 'Cadastrar novo fornecedor', newSupplier);
})();
