/* DistribuiPro 35.8 · Taxa do crédito por número de parcelas (até 24x).
   - Configurações › Taxas de pagamento: "Parcelar em até" e a taxa de 2x a 24x (0 = usa a taxa da bandeira).
   - PDV: depois da bandeira do crédito, escolhe as parcelas (mostra valor da parcela, taxa e quanto recebe).
   - Pagamento dividido e Ordem de Serviço: parcelas até o limite configurado, com a taxa da parcela.
   Guardado em settings (general; no demo, demo_general): parcelamentoMax e taxasParcela {1..24}.
   35.32: 1x com taxa própria (vazio = taxa da bandeira), débito no mesmo quadro e REPASSE da taxa para o
   cliente (débito, crédito à vista e/ou parcelado a partir de Nx): a taxa entra no total da venda no PDV e a
   loja recebe o valor cheio. settings.repasseTaxa {ativo, debito, avista, parceladoDe}. O pdv.html soma
   window.dpCardSurcharge(base) no total (35.32). Pagamento dividido e OS não repassam. */
(function () {
    'use strict';
    if (typeof db === 'undefined') return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const MAXCAP = 24;
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const pctTxt = v => (Number(v) || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '%';
    const num = v => { const s = String(v ?? '').trim().replace(/\s/g, ''); if (!s) return 0; const n = s.includes(',') ? Number(s.replace(/\./g, '').replace(',', '.')) : Number(s); return Number.isFinite(n) ? n : 0; };
    const commaTxt = v => { const n = num(v); return n > 0 ? String(r2(n)).replace('.', ',') : ''; };
    const toast = (t, m) => { try { (window.Toast || Toast)[t](m); } catch (e) { } };
    let cache = null;

    async function loadFees(force) {
        if (cache && !force) return cache;
        try { const d = await db.collection('settings').doc(DOC).get(); cache = d.exists ? (d.data() || {}) : {}; } catch (e) { cache = {}; }
        return cache;
    }
    const maxOf = f => Math.min(MAXCAP, Math.max(1, Math.round(Number(f && f.parcelamentoMax) || 12)));
    function feeFor(f, method, amount, brand, inst) {
        f = f || {};
        let pct = 0;
        if (method === 'pix') pct = num(f.taxaPix);
        else if (method === 'debito') pct = num(f.taxaDebito);
        else if (method === 'credito') {
            const n = Math.max(1, Math.round(Number(inst) || 1));
            const tab = f.taxasParcela || {};
            // 35.32 · 1x também pode ter taxa própria; vazio/0 usa a taxa da bandeira
            if (num(tab[n]) > 0) pct = num(tab[n]);
            else { const b = brand || 'outras'; pct = num(f['taxaCredito' + b.charAt(0).toUpperCase() + b.slice(1)]); }
        }
        return { pct, value: r2(Number(amount || 0) * pct / 100) };
    }
    /* ---------- repasse da taxa para o cliente (35.32) ---------- */
    const repasseOf = f => { const r = (f && f.repasseTaxa) || {}; return { ativo: !!r.ativo, debito: !!r.debito, avista: !!r.avista, parceladoDe: Math.max(0, Math.min(MAXCAP, Math.round(Number(r.parceladoDe) || 0))) }; };
    function repassa(f, method, inst) {
        const r = repasseOf(f); if (!r.ativo) return false;
        if (method === 'debito') return r.debito;
        if (method !== 'credito') return false;
        const n = Math.max(1, Math.round(Number(inst) || 1));
        return n === 1 ? r.avista : (r.parceladoDe >= 2 && n >= r.parceladoDe);
    }
    // O cliente paga base ÷ (1 − taxa): depois que a maquininha desconta a taxa, a loja recebe a base inteira.
    function surchargeFor(f, method, base, brand, inst) {
        if (!repassa(f, method, inst)) return { pct: 0, value: 0 };
        const pct = feeFor(f, method, 100, brand, inst).pct;
        if (!(pct > 0) || pct >= 100) return { pct: 0, value: 0 };
        return { pct, value: r2(r2(Number(base || 0) / (1 - pct / 100)) - Number(base || 0)) };
    }
    window.DPInstallmentFees = { loadFees, feeFor, maxOf, surchargeFor, repasseOf };

    const css = document.createElement('style');
    css.textContent = `.tpx-box{margin-top:18px;padding:16px;border-radius:12px;background:var(--bg-secondary);border:1px solid var(--border-color)}
.tpx-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px}
.tpx-head h4{margin:0;font-size:13px;font-weight:700;color:var(--text-primary);text-transform:uppercase;letter-spacing:.5px}
.tpx-head p{margin:4px 0 0;font-size:12px;color:var(--text-muted);max-width:620px}
.tpx-max{display:flex;align-items:center;gap:8px;font-size:13px;font-weight:600;color:var(--text-primary)}
.tpx-max select{width:auto}
.tpx-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px}
.tpx-cell{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:8px 10px;border-radius:10px;background:var(--bg-card);border:1px solid var(--border-color)}
.tpx-cell b{font-size:13px;color:var(--text-primary);min-width:30px}
.tpx-cell input{width:64px;text-align:center;padding:6px 6px;font-size:13px}
.tpx-cell span{font-size:12px;color:var(--text-muted)}
.tpx-cell.tpx-deb{border-color:rgba(59,130,246,.45);grid-column:span 2}
.tpx-fill{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-top:12px;font-size:12px;color:var(--text-muted)}
.tpx-fill input{width:70px;text-align:center;padding:6px;font-size:12px}
.tpx-saved{font-size:12px;color:var(--success);margin-left:6px}
.tpx-rep{margin-top:16px;padding:14px;border-radius:12px;background:var(--bg-card);border:1px solid var(--border-color)}
.tpx-rep-on{display:flex;align-items:flex-start;gap:10px;cursor:pointer}
.tpx-rep-on input{margin-top:3px;width:18px;height:18px;accent-color:var(--accent);flex:none}
.tpx-rep-on b{display:block;font-size:14px;color:var(--text-primary)}
.tpx-rep-on small{display:block;font-size:12px;color:var(--text-muted);margin-top:2px}
.tpx-rep-opts{display:flex;flex-wrap:wrap;gap:8px 18px;align-items:center;margin:12px 0 0 28px;font-size:13px;color:var(--text-primary)}
.tpx-rep-opts[hidden]{display:none}
.tpx-rep-opts label{display:inline-flex;align-items:center;gap:7px;cursor:pointer;font-weight:600}
.tpx-rep-opts input[type=checkbox]{width:16px;height:16px;accent-color:var(--accent)}
.tpx-rep-opts select{width:auto;padding:6px 8px;font-size:13px}
.tpx-rep-ex{margin:10px 0 0 28px;font-size:12px;color:var(--text-muted);line-height:1.5}
.tpx-rep-ex b{color:var(--text-primary)}
#tpxOverlay{position:fixed;inset:0;z-index:10040;background:rgba(15,23,42,.6);display:flex;align-items:center;justify-content:center;padding:16px}
#tpxOverlay .tpx-dlg{background:var(--bg-card);border-radius:16px;width:100%;max-width:440px;max-height:88vh;display:flex;flex-direction:column;box-shadow:0 24px 60px rgba(0,0,0,.35)}
#tpxOverlay .tpx-dlg h3{margin:0;font-size:16px;color:var(--text-heading)}
#tpxOverlay .tpx-dh{padding:16px 18px 8px}#tpxOverlay .tpx-dh p{margin:4px 0 0;font-size:12px;color:var(--text-muted)}
#tpxOverlay .tpx-list{overflow-y:auto;padding:6px 12px 14px;display:grid;gap:6px}
#tpxOverlay .tpx-opt{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:10px 12px;border-radius:10px;border:1px solid var(--border-color);background:var(--bg-secondary);cursor:pointer;text-align:left;color:var(--text-primary)}
#tpxOverlay .tpx-opt:hover,#tpxOverlay .tpx-opt.on{border-color:var(--accent)}
#tpxOverlay .tpx-opt b{font-size:14px}#tpxOverlay .tpx-opt small{display:block;font-size:11px;color:var(--text-muted)}
#tpxOverlay .tpx-opt .r{text-align:right}#tpxOverlay .tpx-opt .r b{color:var(--success);font-size:13px}
#tpxOverlay .tpx-opt small.tpx-plus{color:var(--accent)}
#tpxSurRow span:last-child{color:var(--accent)}
.tpx-debnote{margin:-4px 0 12px;font-size:12.5px;color:var(--text-secondary)}`;
    document.head.appendChild(css);

    /* =================== CONFIGURAÇÕES =================== */
    function setupConfig() {
        const anchor = document.getElementById('cfg_taxa_credito_outras');
        if (!anchor || document.getElementById('tpxBox')) return;
        const grid = anchor.closest('div[style*="grid-template-columns"]');
        if (!grid) return;
        const debIn = document.getElementById('cfg_taxa_debito');
        const box = document.createElement('div'); box.className = 'tpx-box'; box.id = 'tpxBox';
        let cells = `<div class="tpx-cell tpx-deb" title="Mesma taxa do campo Débito acima"><b>Débito</b><input type="text" inputmode="decimal" id="tpxDeb" placeholder="0"><span>%</span></div>`;
        for (let n = 1; n <= MAXCAP; n++) cells += `<div class="tpx-cell" data-n="${n}"${n === 1 ? ' title="Vazio = usa a taxa da bandeira acima"' : ''}><b>${n}x</b><input type="text" inputmode="decimal" data-n="${n}" placeholder="${n === 1 ? 'bandeira' : '0'}"><span>%</span></div>`;
        const deOpts = `<option value="0">não repassar</option>` + Array.from({ length: MAXCAP - 1 }, (_, i) => `<option value="${i + 2}">a partir de ${i + 2}x</option>`).join('');
        box.innerHTML = `<div class="tpx-head"><div><h4><i class="fas fa-layer-group" style="color:#8b5cf6;margin-right:6px"></i>Taxa da maquininha · débito e crédito por parcela</h4>
<p>Informe a taxa total que a maquininha cobra em cada caso. <b>1x</b> vazio e parcelas vazias usam a taxa da bandeira acima. O <b>Débito</b> é o mesmo campo lá de cima.</p></div>
<label class="tpx-max">Parcelar em até <select class="form-input" id="tpxMax">${Array.from({ length: MAXCAP }, (_, i) => `<option value="${i + 1}">${i + 1}x</option>`).join('')}</select></label></div>
<div class="tpx-grid" id="tpxGrid">${cells}</div>
<div class="tpx-fill"><i class="fas fa-wand-magic-sparkles" style="color:var(--accent)"></i> Preencher rápido: 2x com <input type="text" inputmode="decimal" id="tpxBase" placeholder="4,50">% e somar <input type="text" inputmode="decimal" id="tpxStep" placeholder="1,20">% a cada parcela <button type="button" class="btn btn-outline btn-sm" id="tpxCalc">Calcular</button><span class="tpx-saved" id="tpxSaved"></span></div>
<div class="tpx-rep"><label class="tpx-rep-on"><input type="checkbox" id="tpxRepOn"><span><b>Repassar a taxa para o cliente</b><small>No PDV a taxa entra no total da venda e você recebe o valor cheio (o cliente paga a taxa).</small></span></label>
<div class="tpx-rep-opts" id="tpxRepOpts" hidden><label><input type="checkbox" id="tpxRepDeb"> No débito</label><label><input type="checkbox" id="tpxRepAv"> No crédito à vista (1x)</label><label>No parcelado <select class="form-input" id="tpxRepDe">${deOpts}</select></label></div>
<div class="tpx-rep-ex" id="tpxRepEx"></div></div>`;
        grid.insertAdjacentElement('afterend', box);
        const $b = s => box.querySelector(s);
        const maxSel = $b('#tpxMax'), deb = $b('#tpxDeb');
        const paint = () => { const m = Number(maxSel.value); box.querySelectorAll('.tpx-cell[data-n]').forEach(c => { c.style.display = Number(c.dataset.n) <= m ? '' : 'none'; }); };
        maxSel.addEventListener('change', () => { paint(); example(); });
        // Débito: o mesmo valor do campo "Débito (%)" lá de cima (é ele que o botão Salvar grava)
        deb.addEventListener('input', () => { if (debIn) debIn.value = num(deb.value) > 0 ? String(r2(num(deb.value))) : '0'; example(); });
        if (debIn) ['input', 'change'].forEach(ev => debIn.addEventListener(ev, () => { deb.value = commaTxt(debIn.value); example(); }));
        $b('#tpxCalc').addEventListener('click', () => {
            const base = num($b('#tpxBase').value), step = num($b('#tpxStep').value), m = Number(maxSel.value);
            if (!(base > 0)) { toast('warning', 'Informe a taxa de 2x'); return; }
            box.querySelectorAll('input[data-n]').forEach(i => { const n = Number(i.dataset.n); if (n >= 2 && n <= m) i.value = (base + step * (n - 2)).toFixed(2).replace('.', ','); });
            example();
        });
        // Exemplo com R$ 100,00, usando o que está na tela (antes de salvar)
        const current = () => {
            const tab = {}; box.querySelectorAll('input[data-n]').forEach(i => { const v = num(i.value); if (v > 0) tab[i.dataset.n] = v; });
            const f = Object.assign({}, cache || {}, { taxaDebito: num(deb.value), taxasParcela: tab, parcelamentoMax: Number(maxSel.value), repasseTaxa: { ativo: $b('#tpxRepOn').checked, debito: $b('#tpxRepDeb').checked, avista: $b('#tpxRepAv').checked, parceladoDe: Number($b('#tpxRepDe').value) } });
            document.querySelectorAll('[id^="cfg_taxa_credito_"]').forEach(i => { const k = 'taxaCredito' + i.id.replace('cfg_taxa_credito_', '').replace(/^./, c => c.toUpperCase()); f[k] = num(i.value); });
            return f;
        };
        function example() {
            const on = $b('#tpxRepOn').checked; $b('#tpxRepOpts').hidden = !on;
            const ex = $b('#tpxRepEx'); if (!on) { ex.innerHTML = ''; return; }
            const f = current(), r = repasseOf(f), parts = [];
            if (r.debito) { const s = surchargeFor(f, 'debito', 100, '', 1); parts.push(s.value > 0 ? `débito <b>${money(100 + s.value)}</b>` : 'débito <b>sem taxa cadastrada</b>'); }
            if (r.avista) { const s = surchargeFor(f, 'credito', 100, 'outras', 1); parts.push(s.value > 0 ? `crédito 1x <b>${money(100 + s.value)}</b>` : 'crédito 1x <b>sem taxa cadastrada</b>'); }
            if (r.parceladoDe >= 2) { const n = Math.min(Number(maxSel.value), Math.max(r.parceladoDe, 3)), s = surchargeFor(f, 'credito', 100, 'outras', n); if (n >= r.parceladoDe) parts.push(s.value > 0 ? `${n}x <b>${money(100 + s.value)}</b> (${n}x de ${money((100 + s.value) / n)})` : `${n}x <b>sem taxa cadastrada</b>`); if (r.parceladoDe > 2) parts.push(`até ${r.parceladoDe - 1}x sem juros para o cliente`); }
            ex.innerHTML = parts.length ? `<i class="fas fa-circle-info"></i> Ex.: venda de <b>${money(100)}</b> → o cliente paga ${parts.join(' · ')}. Você recebe <b>${money(100)}</b>.` : '<i class="fas fa-circle-info"></i> Marque onde a taxa é repassada.';
        }
        box.addEventListener('input', e => { if (e.target.matches('input[data-n]')) example(); });
        box.addEventListener('change', e => { if (e.target.closest('.tpx-rep')) example(); });
        document.querySelectorAll('[id^="cfg_taxa_credito_"]').forEach(i => i.addEventListener('input', example));
        // Valores salvos
        (async () => {
            const f = await loadFees(true);
            maxSel.value = String(maxOf(f));
            const tab = f.taxasParcela || {};
            box.querySelectorAll('input[data-n]').forEach(i => { i.value = commaTxt(tab[i.dataset.n]); });
            deb.value = commaTxt(f.taxaDebito !== undefined ? f.taxaDebito : (debIn ? debIn.value : ''));
            const r = repasseOf(f);
            $b('#tpxRepOn').checked = r.ativo; $b('#tpxRepDeb').checked = r.debito; $b('#tpxRepAv').checked = r.avista; $b('#tpxRepDe').value = String(r.parceladoDe);
            paint(); example();
        })();
        async function save() {
            const tab = {};
            box.querySelectorAll('input[data-n]').forEach(i => { const v = num(i.value); if (v > 0) tab[i.dataset.n] = Math.min(100, r2(v)); });
            const rep = { ativo: $b('#tpxRepOn').checked, debito: $b('#tpxRepDeb').checked, avista: $b('#tpxRepAv').checked, parceladoDe: Number($b('#tpxRepDe').value) || 0 };
            try {
                // set com merge troca o objeto taxasParcela inteiro por causa do update abaixo
                await db.collection('settings').doc(DOC).set({ parcelamentoMax: Number(maxSel.value), repasseTaxa: rep }, { merge: true });
                await db.collection('settings').doc(DOC).update({ taxasParcela: tab });
                cache = null;
                const s = $b('#tpxSaved'); s.textContent = '✓ Taxas e repasse salvos'; setTimeout(() => { s.textContent = ''; }, 3000);
            } catch (e) { toast('error', 'Não foi possível salvar o parcelamento: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        }
        // Salva junto com o botão "Salvar" da aba de vendas. 39.3 · DEPOIS do saveTab terminar, não ao mesmo tempo: o PHP faz
        // ler-mesclar-gravar em settings/general e duas gravações simultâneas perdiam campos (ora o desconto máximo voltava,
        // ora as taxas). Encadeia no próprio saveTab em vez de ouvir o clique.
        // window.saveTab só nasce quando a tela de Configurações inicializa (depois do login, em pages.js): se ainda não
        // existe, um "setter" embrulha a função no instante em que ela for definida.
        const encadear = fn => { if (typeof fn !== 'function' || fn.__dpTaxas) return fn; const w = async function (tab) { const r = await fn.apply(this, arguments); if (tab === 'vendas') await save(); return r; }; w.__dpTaxas = true; return w; };
        // Sempre pelo "setter": o pages.js redefine window.saveTab ao inicializar a tela (depois do login) e um embrulho
        // simples era sobrescrito.
        let atual = typeof window.saveTab === 'function' ? encadear(window.saveTab) : undefined;
        try { Object.defineProperty(window, 'saveTab', { configurable: true, enumerable: true, get() { return atual; }, set(fn) { atual = encadear(fn); } }); }
        catch (e) { if (typeof window.saveTab === 'function') window.saveTab = encadear(window.saveTab); }
    }

    /* =================== PDV =================== */
    function setupPdv() {
        if (typeof window.buildSalePayments !== 'function' || typeof window.confirmBrand !== 'function') return;
        let inst = 1;
        // No demo (/teste) o "Salvar" das Configurações guarda as taxas só na sessão do visitante
        const demoSess = () => { try { return window.DP_IS_DEMO === true ? (JSON.parse(sessionStorage.getItem('erp_demo_settings_v139') || '{}') || {}) : {}; } catch (e) { return {}; } }; // 39.3 · fonte única (branding.js)
        const fees = () => { try { return Object.assign({}, cache || {}, (typeof paymentFees !== 'undefined' && paymentFees) || {}, demoSess()); } catch (e) { return cache || {}; } };
        const sel = () => { try { return selectedPayment; } catch (e) { return ''; } };
        const brand = () => { try { return selectedCardBrand; } catch (e) { return ''; } };
        // Valor da venda sem a taxa repassada (itens − desconto + entrega)
        const baseTotal = () => { try { const sub = (Array.isArray(cart) ? cart : []).reduce((s, i) => s + Number(i.total || 0), 0); return Math.max(0, sub - Number(discount || 0) + Number(deliveryFee || 0)); } catch (e) { return 0; } };
        const surNow = base => { const m = sel(); return (m === 'credito' || m === 'debito') ? surchargeFor(fees(), m, base, brand(), m === 'credito' ? inst : 1) : { pct: 0, value: 0 }; };
        // 35.32 · O pdv.html soma esta taxa no total (carrinho, finalizar, venda gravada e recibo)
        window.dpCardSurcharge = base => surNow(Number(base) || 0).value;
        window.dpCardSurchargeNote = () => { const s = surNow(baseTotal()); return s.value > 0 ? `<div style="font-size:12px;color:var(--accent);margin-top:4px">Inclui ${money(s.value)} de taxa do cartão (${pctTxt(s.pct)}), paga pelo cliente</div>` : ''; };
        const refresh = () => { try { updateCartSummary(); } catch (e) { } try { updateBrandIndicator(); } catch (e) { } };

        function chooser() {
            const f = fees(), m = maxOf(f), base = baseTotal();
            if (m <= 1) { inst = 1; refresh(); return; }
            document.getElementById('tpxOverlay')?.remove();
            const ov = document.createElement('div'); ov.id = 'tpxOverlay';
            const rows = Array.from({ length: m }, (_, i) => {
                const n = i + 1, sur = surchargeFor(f, 'credito', base, brand(), n), t = r2(base + sur.value), fee = feeFor(f, 'credito', t, brand(), n);
                const sub = sur.value > 0 ? `<small class="tpx-plus">Total ${money(t)} · +${money(sur.value)} de taxa (cliente paga)</small>` : `<small>${n === 1 ? 'À vista no crédito' : 'Total ' + money(t) + (repasseOf(f).ativo ? ' · sem juros' : '')}</small>`;
                return `<button type="button" class="tpx-opt${n === inst ? ' on' : ''}" data-n="${n}"><span><b>${n}x de ${money(t / n)}</b>${sub}</span><span class="r"><small>taxa ${pctTxt(fee.pct)}</small><b>recebe ${money(t - fee.value)}</b></span></button>`;
            }).join('');
            ov.innerHTML = `<div class="tpx-dlg" role="dialog"><div class="tpx-dh"><h3><i class="fas fa-layer-group" style="color:var(--accent);margin-right:6px"></i>Parcelas no crédito</h3><p>Escolha em quantas vezes o cliente vai pagar.</p></div><div class="tpx-list">${rows}</div></div>`;
            ov.addEventListener('click', e => { if (e.target === ov) { ov.remove(); return; } const b = e.target.closest('[data-n]'); if (!b) return; inst = Number(b.dataset.n); ov.remove(); refresh(); });
            document.body.appendChild(ov);
        }
        window.dpChooseInstallments = chooser;

        const oConfirm = window.confirmBrand;
        window.confirmBrand = function () { const r = oConfirm.apply(this, arguments); if (sel() === 'credito') chooser(); else refresh(); return r; };
        const oSelect = window.selectPayment;
        if (typeof oSelect === 'function') window.selectPayment = function () { inst = 1; const r = oSelect.apply(this, arguments); refresh(); return r; };
        // Débito: mostra a taxa (e o repasse) na janela da bandeira, como já acontece no crédito
        const oBrandSel = window.openBrandSelector;
        if (typeof oBrandSel === 'function') window.openBrandSelector = function (method) {
            const r = oBrandSel.apply(this, arguments);
            if (method === 'debito') {
                const f = fees(), pct = num(f.taxaDebito), sur = surchargeFor(f, 'debito', baseTotal(), '', 1);
                const p = document.querySelector('#brandSelectorOverlay .modal-body > p');
                if (p && pct > 0) p.insertAdjacentHTML('afterend', `<p class="tpx-debnote"><i class="fas fa-percent" style="color:var(--accent);margin-right:5px"></i>Taxa do débito: <b>${pctTxt(pct)}</b>${sur.value > 0 ? ` · repassada ao cliente: <b>+${money(sur.value)}</b>` : ''}</p>`);
            }
            return r;
        };
        // Linha embaixo das formas de pagamento: forma, parcelas, taxa e quanto o cliente paga a mais
        const oInd = window.updateBrandIndicator;
        if (typeof oInd === 'function') window.updateBrandIndicator = function () {
            const r = oInd.apply(this, arguments);
            const el = document.getElementById('brandIndicator'), m = sel();
            if (!el || (m !== 'credito' && m !== 'debito')) return r;
            if (el.style.display === 'none') { el.style.display = 'block'; el.innerHTML = `<i class="fas fa-credit-card" style="margin-right:4px;color:var(--accent)"></i>${m === 'credito' ? 'Crédito' : 'Débito'} <a href="#" onclick="event.preventDefault();openBrandSelector(selectedPayment)" style="margin-left:6px;color:var(--accent);text-decoration:none">bandeira</a>`; }
            el.querySelectorAll('.tpx-ind').forEach(x => x.remove());
            const f = fees(), n = m === 'credito' ? inst : 1, base = baseTotal(), sur = surchargeFor(f, m, base, brand(), n), fee = feeFor(f, m, base + sur.value, brand(), n);
            const bits = [];
            if (m === 'credito' && maxOf(f) > 1) bits.push(`<strong style="color:var(--text-primary)">${n}x</strong>`);
            if (fee.pct) bits.push(`taxa ${pctTxt(fee.pct)}`);
            if (sur.value > 0) bits.push(`<strong style="color:var(--accent)">+${money(sur.value)} no total (cliente paga)</strong>`);
            if (m === 'credito' && maxOf(f) > 1) bits.push(`<a href="#" onclick="event.preventDefault();dpChooseInstallments()" style="color:var(--accent)">parcelas</a>`);
            if (bits.length) el.insertAdjacentHTML('beforeend', ` <span class="tpx-ind">· ${bits.join(' · ')}</span>`);
            return r;
        };
        // Carrinho: linha "Taxa do cartão (cliente)" quando a taxa é repassada
        const oSum = window.updateCartSummary;
        if (typeof oSum === 'function') window.updateCartSummary = function () {
            const r = oSum.apply(this, arguments);
            try {
                const s = surNow(baseTotal()), totalRow = document.getElementById('cartTotal')?.closest('.cs-row');
                let row = document.getElementById('tpxSurRow');
                if (s.value > 0 && totalRow) {
                    if (!row) { row = document.createElement('div'); row.id = 'tpxSurRow'; row.className = 'cs-row'; row.innerHTML = '<span>Taxa do cartão (cliente)</span><span class="mono" id="tpxSur"></span>'; }
                    if (row.nextElementSibling !== totalRow) totalRow.before(row);
                    document.getElementById('tpxSur').textContent = '+ ' + money(s.value);
                } else if (row) row.remove();
            } catch (e) { }
            return r;
        };
        const oBuild = window.buildSalePayments;
        window.buildSalePayments = function (t) {
            const list = oBuild.apply(this, arguments);
            if (!Array.isArray(list)) return list;
            const f = fees(), single = sel() !== 'multi';
            list.forEach(p => {
                if (p.method !== 'credito' && p.method !== 'debito') return;
                if (single && p.method === 'credito') p.installments = inst;
                const fee = feeFor(f, p.method, p.amount, p.cardBrand, p.installments);
                p.feePercent = fee.pct; p.feeValue = fee.value; p.netAmount = r2(Number(p.amount || 0) - fee.value);
            });
            return list;
        };
        // Pagamento dividido: parcelas até o limite configurado
        const oRows = window.renderMultiPaymentRows;
        if (typeof oRows === 'function') window.renderMultiPaymentRows = function () {
            const r = oRows.apply(this, arguments);
            try { widenSelects(document, maxOf(fees())); } catch (e) { }
            return r;
        };
        if (typeof SalesService !== 'undefined' && SalesService && typeof SalesService.create === 'function') {
            const oCreate = SalesService.create;
            SalesService.create = async function () { const r = await oCreate.apply(this, arguments); inst = 1; setTimeout(refresh, 0); return r; };
        }
        loadFees().then(refresh);
    }
    function widenSelects(root, m) {
        root.querySelectorAll('select[onchange*="installments"]').forEach(s => {
            if (s.options.length === m) return;
            const cur = Number(s.value) || 1;
            s.innerHTML = Array.from({ length: m }, (_, i) => `<option value="${i + 1}"${i + 1 === cur ? ' selected' : ''}>${i + 1}x</option>`).join('');
        });
    }

    /* =================== ORDEM DE SERVIÇO =================== */
    function setupOs() {
        if (!document.getElementById('osInstallments') && typeof window.renderOsMultiPayments !== 'function') return;
        loadFees().then(f => {
            const m = maxOf(f), s = document.getElementById('osInstallments');
            if (s) { const cur = Number(s.value) || 1; s.innerHTML = Array.from({ length: m }, (_, i) => `<option value="${i + 1}"${i + 1 === cur ? ' selected' : ''}>${i + 1}x</option>`).join(''); }
        });
        const oRows = window.renderOsMultiPayments;
        if (typeof oRows === 'function') window.renderOsMultiPayments = function () { const r = oRows.apply(this, arguments); loadFees().then(f => widenSelects(document.getElementById('osMultiRows') || document, maxOf(f))); return r; };
        // A OS passa a registrar a taxa da maquininha (antes ficava zerada)
        if (typeof ServiceOrderService !== 'undefined' && ServiceOrderService && typeof ServiceOrderService.receivePayment === 'function' && !ServiceOrderService.__tpx) {
            ServiceOrderService.__tpx = true;
            const oRecv = ServiceOrderService.receivePayment;
            ServiceOrderService.receivePayment = async function (id, opts) {
                try {
                    const f = await loadFees();
                    (opts && Array.isArray(opts.payments) ? opts.payments : []).forEach(p => {
                        if (!['credito', 'debito', 'pix'].includes(p.method) || Number(p.feeValue || 0) > 0) return;
                        const fee = feeFor(f, p.method, p.amount, p.cardBrand, p.installments);
                        p.feePercent = fee.pct; p.feeValue = fee.value; p.netAmount = r2(Number(p.amount || 0) - fee.value);
                    });
                } catch (e) { console.warn('taxa da OS', e); }
                return oRecv.apply(this, arguments);
            };
        }
    }

    function boot() {
        try { setupConfig(); } catch (e) { console.warn('parcelas config', e); }
        try { setupPdv(); } catch (e) { console.warn('parcelas pdv', e); }
        try { setupOs(); } catch (e) { console.warn('parcelas os', e); }
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
