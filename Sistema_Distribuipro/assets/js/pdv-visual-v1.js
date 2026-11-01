/* DistribuiPro 37.1 · Tela do PDV: como os produtos aparecem.
   - "grade"  : cartões com foto (como sempre foi)
   - "lista"  : lista compacta, sem fotos
   - "logo"   : no lugar dos produtos fica a logomarca da loja; os produtos aparecem só ao buscar / passar o código
   Configuração em Configurações › Vendas › "Tela do PDV" (settings/general.pdvModoProdutos e pdvLogo). */
(function () {
    'use strict';
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const settingsRef = () => db.collection('settings').doc('general');
    async function readCfg() { try { const s = await settingsRef().get(); return s.exists ? (s.data() || {}) : {}; } catch (e) { return {}; } }
    const brand = () => { try { return (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || JSON.parse(localStorage.getItem('erp_branding') || '{}') || {}; } catch (e) { return {}; } };
    const isPdv = /pdv\.html$/i.test(location.pathname) || !!document.getElementById('productsGrid');
    const isCfg = /configuracoes\.html$/i.test(location.pathname);

    const css = document.createElement('style');
    css.textContent = `
#productsGrid.pdvx-list{display:flex!important;flex-direction:column;gap:6px;grid-template-columns:none!important}
#productsGrid.pdvx-list .product-card{display:flex!important;flex-direction:row;align-items:center;gap:12px;min-height:0;height:auto;padding:10px 14px!important}
#productsGrid.pdvx-list .product-card .p-thumb{display:none!important}
#productsGrid.pdvx-list .product-card .p-info{display:flex;align-items:center;gap:12px;width:100%;padding:0!important}
#productsGrid.pdvx-list .p-name{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:14px!important;-webkit-line-clamp:unset}
#productsGrid.pdvx-list .p-code{min-width:70px;opacity:.7}
#productsGrid.pdvx-list .p-meta-row{display:flex;align-items:center;gap:16px;margin:0!important}
#productsGrid.pdvx-list .p-price{min-width:90px;text-align:right}
#productsGrid.pdvx-logo.is-idle>*:not(.pdvx-logo-box){display:none!important}
#productsGrid.pdvx-logo.is-idle{display:flex!important;align-items:center;justify-content:center}
.pdvx-logo-box{display:none}
#productsGrid.pdvx-logo.is-idle .pdvx-logo-box{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;width:100%;min-height:100%;padding:30px;text-align:center;color:var(--text-muted)}
.pdvx-logo-box img{max-width:min(420px,70%);max-height:46vh;object-fit:contain;filter:drop-shadow(0 10px 30px rgba(0,0,0,.12))}
.pdvx-logo-box .pdvx-name{font-size:clamp(22px,3vw,34px);font-weight:800;color:var(--text-heading)}
.pdvx-logo-box p{margin:0;font-size:13px}.pdvx-logo-box kbd{padding:2px 6px;border-radius:6px;border:1px solid var(--border-color);font-size:11px}
body.pdvx-hide-cats #pdvCategories{display:none!important}
.pdvx-cfg{margin-top:18px;padding:16px;border:1px solid var(--border-color);border-radius:14px;background:var(--bg-card)}
.pdvx-cfg h4{margin:0 0 4px;font-size:15px;color:var(--text-heading)}.pdvx-cfg>p{margin:0 0 12px;font-size:12px;color:var(--text-muted)}
.pdvx-opts{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}
.pdvx-opt{position:relative;display:flex;flex-direction:column;gap:6px;padding:12px;border:2px solid var(--border-color);border-radius:12px;cursor:pointer;background:var(--bg-secondary)}
.pdvx-opt input{position:absolute;opacity:0}.pdvx-opt b{font-size:13.5px;color:var(--text-primary)}.pdvx-opt small{font-size:11.5px;color:var(--text-muted);line-height:1.4}
.pdvx-opt i.fa-solid,.pdvx-opt i.fas{font-size:20px;color:var(--accent)}
.pdvx-opt.on{border-color:var(--accent);background:rgba(99,102,241,.08)}
.pdvx-logo-row{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:12px}
.pdvx-logo-prev{width:150px;height:70px;border:1px dashed var(--border-color);border-radius:10px;display:flex;align-items:center;justify-content:center;overflow:hidden;background:var(--bg-secondary);font-size:11px;color:var(--text-muted)}
.pdvx-logo-prev img{max-width:100%;max-height:100%;object-fit:contain}`;
    document.head.appendChild(css);

    /* ---------------- PDV ---------------- */
    if (isPdv) {
        let mode = 'grade', logo = '', storeName = '';
        try { const c = JSON.parse(localStorage.getItem('dp_pdvx') || 'null'); if (c) { mode = c.mode || mode; logo = c.logo || ''; storeName = c.name || ''; } } catch (e) { }
        const apply = () => {
            const g = document.getElementById('productsGrid'); if (!g) return;
            g.classList.toggle('pdvx-list', mode === 'lista');
            g.classList.toggle('pdvx-logo', mode === 'logo');
            document.body.classList.toggle('pdvx-hide-cats', mode === 'logo');
            if (mode === 'logo') {
                const s = document.getElementById('pdvSearch'), idle = !(s && s.value.trim());
                g.classList.toggle('is-idle', idle);
                if (!g.querySelector('.pdvx-logo-box')) {
                    const b = brand(), src = logo || b.logoUrl || '', nm = storeName || b.companyName || b.name || '';
                    const box = document.createElement('div'); box.className = 'pdvx-logo-box';
                    box.innerHTML = `${src ? `<img src="${esc(src)}" alt="${esc(nm || 'Logo da loja')}" onerror="this.remove()">` : ''}${!src && nm ? `<div class="pdvx-name">${esc(nm)}</div>` : ''}<p><i class="fas fa-barcode"></i> Passe o código de barras ou digite o nome do produto na busca <kbd>F2</kbd></p>`;
                    g.prepend(box);
                }
            } else g.classList.remove('is-idle');
        };
        const start = () => {
            const g = document.getElementById('productsGrid'); if (!g) return;
            new MutationObserver(() => { if (mode === 'logo' && !g.querySelector('.pdvx-logo-box')) apply(); }).observe(g, { childList: true });
            const s = document.getElementById('pdvSearch');
            if (s) ['input', 'change', 'keyup'].forEach(ev => s.addEventListener(ev, () => setTimeout(apply, 0)));
            apply();
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
        readCfg().then(g => {
            const b = brand();
            mode = ['grade', 'lista', 'logo'].includes(g.pdvModoProdutos) ? g.pdvModoProdutos : 'grade';
            logo = g.pdvLogo || g.logoUrl || b.logoUrl || ''; storeName = g.companyName || g.nomeEmpresa || g.razaoSocial || b.companyName || '';
            try { localStorage.setItem('dp_pdvx', JSON.stringify({ mode, logo: logo.length < 400000 ? logo : '', name: storeName })); } catch (e) { }
            const g2 = document.getElementById('productsGrid'); g2 && g2.querySelector('.pdvx-logo-box')?.remove();
            apply();
        });
    }

    /* ---------------- Configurações ---------------- */
    if (isCfg) {
        const MODES = [
            ['grade', 'fa-table-cells-large', 'Produtos com foto', 'Cartões com a foto, o preço e o estoque (padrão).'],
            ['lista', 'fa-list', 'Lista sem fotos', 'Lista compacta: nome, código, estoque e preço. Mais rápida.'],
            ['logo', 'fa-store', 'Logomarca da loja', 'Mostra só a sua logo. Os produtos aparecem ao buscar ou passar o código de barras.']
        ];
        // 39.3 · Era PNG de até 900 px sem limite de tamanho (uma logo de 1 MB entrava inteira em settings/general e derrubava
        // todas as abas de Configurações no Firebase). Agora passa pela DPImagem: ~320 KB, transparência preservada.
        const shrink = file => DPImagem.reduzir(file, { maxLado: 900, maxBytes: DPImagem.LIMITES.logo * 2, transparencia: 'auto' });
        async function mount(tries) {
            const tab = document.getElementById('tabVendas');
            if (!tab) { if (tries < 40) setTimeout(() => mount(tries + 1), 250); return; }
            if (document.getElementById('pdvxCfg')) return;
            const g = await readCfg();
            let mode = ['grade', 'lista', 'logo'].includes(g.pdvModoProdutos) ? g.pdvModoProdutos : 'grade', pdvLogo = g.pdvLogo || '';
            const box = document.createElement('div'); box.className = 'pdvx-cfg'; box.id = 'pdvxCfg';
            const paint = () => {
                box.innerHTML = `<h4><i class="fas fa-cash-register" style="color:var(--accent);margin-right:6px"></i>Tela do PDV · área dos produtos</h4><p>Escolha o que aparece no espaço dos produtos do PDV. Salva na hora.</p>
<div class="pdvx-opts">${MODES.map(([v, ic, t, d]) => `<label class="pdvx-opt${mode === v ? ' on' : ''}"><input type="radio" name="pdvxMode" value="${v}" ${mode === v ? 'checked' : ''}><i class="fas ${ic}"></i><b>${t}</b><small>${d}</small></label>`).join('')}</div>
<div class="pdvx-logo-row" ${mode === 'logo' ? '' : 'hidden'}><div class="pdvx-logo-prev">${pdvLogo || g.logoUrl ? `<img src="${esc(pdvLogo || g.logoUrl)}" alt="">` : 'Sem logo'}</div><div><label class="btn btn-secondary btn-sm" style="cursor:pointer"><i class="fas fa-upload"></i> ${pdvLogo ? 'Trocar a logo do PDV' : 'Enviar uma logo para o PDV'}<input type="file" accept="image/*" hidden id="pdvxLogoIn"></label>${pdvLogo ? ' <button type="button" class="btn btn-sm" id="pdvxLogoDel">Usar a logo da empresa</button>' : ''}<div style="font-size:11.5px;color:var(--text-muted);margin-top:6px">Sem enviar, usamos a logo cadastrada na aba Empresa.</div></div></div>`;
                box.querySelectorAll('[name=pdvxMode]').forEach(r => r.addEventListener('change', async () => { mode = r.value; paint(); await save({ pdvModoProdutos: mode }); }));
                const fi = box.querySelector('#pdvxLogoIn'); if (fi) fi.addEventListener('change', async () => { const f = fi.files[0]; if (!f) return; try { pdvLogo = await shrink(f); paint(); await save({ pdvLogo }); } catch (e) { toast('error', 'Não foi possível ler a imagem: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } });
                const del = box.querySelector('#pdvxLogoDel'); if (del) del.addEventListener('click', async () => { pdvLogo = ''; paint(); await save({ pdvLogo: '' }); });
            };
            async function save(data) {
                try { await settingsRef().set({ ...data, updatedAt: (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp() }, { merge: true }); try { localStorage.removeItem('dp_pdvx'); } catch (e) { } toast('success', 'Tela do PDV salva'); }
                catch (e) { toast('error', 'Erro ao salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
            }
            paint();
            tab.appendChild(box);
        }
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mount(0)); else mount(0);
    }
})();
