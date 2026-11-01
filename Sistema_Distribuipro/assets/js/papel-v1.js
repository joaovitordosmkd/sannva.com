/* DistribuiPro 40.49 · AJUSTE DA IMPRESSORA DE CUPOM, POR EMPRESA (todas as versões) — window.DPPapel
   Pedido do dono: "eu arrumo a impressora de um cliente e atrapalha a de outro". As medidas do cupom eram fixas no código:
   a 39.14.13 pôs a área de 72 mm no meio da bobina de 80 mm (a TM-T20 da FGF cortava à esquerda) e a do Quintal passou a
   cortar os centavos na direita. Agora cada empresa ajusta a sua em Configurações › Impressão (settings/general):
     papelLargura  mm da área impressa (vazio = 72 na bobina de 80, 48 na de 58)
     papelDesloc   mm para o lado (− esquerda, + direita; vazio = no meio)
     papelLetra    % do tamanho da letra (vazio = 100)
     papelFim      mm de papel em branco no fim, para a impressora que corta antes (vazio = 0)
   Sem ajuste, o cupom sai igual ao de antes. Cópia no aparelho em localStorage dp_papel_v1 (o cupom é montado na hora,
   sem esperar o banco); relida a cada 2 min e sempre em Configurações.
   Usam: comprovante do PDV e 2ª via em Pedidos, via da cozinha/bar e conta das Mesas (cozinha-print-v1.js), pedidos do app
   do garçom (fila de impressão do Mensal), fechamento do caixa, OS e cupom da NFC-e.
   API: get(), area(kind, o), css(kind, o) (@page + html + body), box(sel, kind) (só a largura/posição de um bloco),
        page(kind), sync(force), testHtml(o) */
(function () {
    'use strict';
    if (window.DPPapel) return;
    const KEY = 'dp_papel_v1';
    const num = v => { if (v === null || v === undefined || v === '') return null; const n = parseFloat(String(v).replace(',', '.')); return Number.isFinite(n) ? n : null; };
    const r1 = n => Math.round(n * 100) / 100;
    function norm(d) {
        d = d || {};
        return { papel: d.impressoraPadrao === 'termica_58' ? 'termica_58' : d.impressoraPadrao === 'a4' ? 'a4' : 'termica_80', largura: num(d.papelLargura), desloc: num(d.papelDesloc), letra: num(d.papelLetra), fim: num(d.papelFim) };
    }
    let c = norm({});
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') c = { ...c, ...s }; } catch (e) { }
    function guardar(d) { c = { ...norm(d), at: Date.now() }; try { localStorage.setItem(KEY, JSON.stringify(c)); } catch (e) { } }
    const get = () => ({ ...c });

    // Papel (P), área impressa (W), margem da esquerda (L), escala da letra (z) e papel no fim, em mm
    function area(kind, o) {
        const v = { ...c, ...(o || {}) }, p58 = /58/.test(String(kind || v.papel || ''));
        const P = p58 ? 58 : 80, W0 = p58 ? 48 : 72;
        const W = Math.max(30, Math.min(P, v.largura || W0));
        const L = Math.max(0, Math.min(P - W, (P - W) / 2 + (v.desloc || 0)));
        const z = Math.max(0.7, Math.min(1.4, (v.letra || 100) / 100));
        return { P, W, L, z, fim: Math.max(0, Math.min(40, v.fim || 0)), p58 };
    }
    const page = (kind, o) => `@page{size:${area(kind, o).P}mm auto;margin:0}`;
    // A largura e a margem são divididas pela escala: com zoom 1,1 o corpo de 65,45 mm ocupa os 72 mm de verdade
    function box(sel, kind, o) {
        const a = area(kind, o), mm = n => r1(n / a.z) + 'mm';
        return `${sel}{width:${mm(a.W)}!important;max-width:${mm(a.W)}!important;margin:0 0 0 ${mm(a.L)}!important;box-sizing:border-box!important${a.z !== 1 ? ';zoom:' + a.z : ''}}` + (a.fim ? `${sel}::after{content:"";display:block;height:${mm(a.fim)}}` : '');
    }
    function css(kind, o) {
        const a = area(kind, o), b = box('body', kind, o);
        return `${page(kind, o)}html{width:${a.P}mm!important;max-width:${a.P}mm!important;margin:0!important;padding:0!important}${b}@media print{html{width:${a.P}mm!important;margin:0!important;padding:0!important}${b}}`;
    }

    /* ---------- relê o ajuste da empresa ---------- */
    const DEMO = () => window.DP_IS_DEMO === true;
    function sync(force) {
        if (DEMO() || typeof db === 'undefined' || !db.collection) return Promise.resolve(get());
        if (!force && Date.now() - (c.at || 0) < 120000) return Promise.resolve(get());
        return db.collection('settings').doc('general').get().then(d => { guardar(d && d.exists ? (d.data() || {}) : {}); return get(); }).catch(() => get());
    }
    let tries = 0;
    const iv = setInterval(() => {
        if (typeof auth !== 'undefined' && auth && auth.onAuthStateChanged && typeof db !== 'undefined') { clearInterval(iv); auth.onAuthStateChanged(u => { if (u) sync(/configuracoes(\.html)?$/.test(location.pathname)).then(paintCard); }); }
        else if (++tries > 100) clearInterval(iv);
    }, 100);

    /* ---------- cupom de teste ---------- */
    const esc = s => String(s ?? '').replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    function testHtml(o, kind) {
        const a = area(kind, o), fmt = n => String(r1(n)).replace('.', ',');
        const row = (l, r) => `<div class="r"><span>${l}</span><span>${r}</span></div>`;
        return `<!doctype html><html><head><meta charset="utf-8"><title>Teste da impressora</title><style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;font-weight:700;color:#000;font-size:13px;line-height:1.3;padding:1.5mm 0 3mm}
.c{text-align:center}.t{font-size:16px;letter-spacing:1px}.s{font-size:11px}.ed{display:flex;justify-content:space-between;border-left:3px solid #000;border-right:3px solid #000;padding:1mm 1.2mm;margin:2mm 0;font-size:11px}
.rg{display:flex;border:1px solid #000;margin:2mm 0}.rg span{flex:1;text-align:center;font-size:10px;border-right:1px solid #000;padding:.6mm 0}.rg span:last-child{border-right:0}
.r{display:flex;justify-content:space-between;gap:2mm;margin:1mm 0}.l{border-top:1.5px dashed #000;margin:2mm 0}.tot{font-size:16px}${css(kind, o)}</style></head><body>
<div class="c t">TESTE DA IMPRESSORA</div><div class="c s">Papel ${a.P} mm · área ${fmt(a.W)} mm · ${a.L === (a.P - a.W) / 2 ? 'no meio' : 'margem esquerda ' + fmt(a.L) + ' mm'} · letra ${Math.round(a.z * 100)}%</div>
<div class="ed"><span>&lt; ESQUERDA</span><span>DIREITA &gt;</span></div>
<div class="rg">${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => `<span>${n}</span>`).join('')}</div>
<div class="l"></div>${row('X-TUDO ESPECIAL', '2x R$ 1.234,56')}${row('', 'R$ 2.469,12')}${row('Coca-Cola Lata', '1x R$ 7,00')}<div class="l"></div>${row('<span class="tot">TOTAL</span>', '<span class="tot">R$ 2.476,12</span>')}
<div class="l"></div><div class="s">Certo: as duas barras pretas, os números de 1 a 10 e todos os centavos aparecem.<br>Cortou na direita: diminua a largura (ex.: 68) ou mova para a esquerda (ex.: -3).<br>Cortou na esquerda: mova para a direita (ex.: 3).</div>
<div class="c s" style="margin-top:3mm">- - - fim do teste - - -</div></body></html>`;
    }
    function printHtml(html) {
        if (/Electron\//.test(navigator.userAgent || '')) { try { const w = window.open('', '_blank', 'width=420,height=760'); if (w) { w.document.open(); w.document.write(html.replace('</body>', '<script>setTimeout(function(){try{window.print()}catch(e){}},300)<\/script></body>')); w.document.close(); return; } } catch (e) { } }
        const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true');
        f.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
        document.body.appendChild(f);
        const d = f.contentDocument; d.open(); d.write(html); d.close();
        setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { } setTimeout(() => f.remove(), 4000); }, 300);
    }

    /* ---------- Configurações › Impressão ---------- */
    const $ = id => document.getElementById(id);
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const kindNow = () => ($('cfg_impressora') && $('cfg_impressora').value) || c.papel;
    function form() { return { largura: num($('dppaLarg').value), desloc: num($('dppaDesl').value), letra: num($('dppaLetra').value), fim: num($('dppaFim').value) }; }
    function paintCard() {
        const tab = $('tabImpressao'); if (!tab) return;
        let card = $('dppaCard');
        if (!card) {
            const first = tab.querySelector('.card'); if (!first) return;
            if (!$('dppaCss')) { const s = document.createElement('style'); s.id = 'dppaCss'; s.textContent = '.dppa-p{margin:0 0 14px;font-size:12.5px;line-height:1.5;color:var(--text-muted)}.dppa-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.dppa-grid label{display:flex;flex-direction:column;gap:4px;font-size:13px;font-weight:600;color:var(--text-primary)}.dppa-grid small{font-weight:400;font-size:11.5px;color:var(--text-muted)}.dppa-dica{margin:12px 0 0;padding:10px 12px;border-radius:10px;background:var(--bg-secondary);font-size:12px;line-height:1.5;color:var(--text-secondary)}.dppa-bt{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:14px}@media(max-width:640px){.dppa-grid{grid-template-columns:1fr}}'; document.head.appendChild(s); }
            card = document.createElement('div'); card.className = 'card'; card.id = 'dppaCard'; card.style.marginBottom = '20px';
            card.innerHTML = `<h3 style="font-size:16px;font-weight:700;color:var(--text-primary);margin-bottom:8px"><i class="fas fa-ruler-horizontal" style="color:var(--accent);margin-right:8px"></i>Ajuste da impressora de cupom</h3>
<p class="dppa-p">Se o cupom sai cortado na direita ou na esquerda, com a letra pequena ou cortado antes do fim, ajuste aqui e use <b>Imprimir teste</b>. Vale só para esta empresa, em todos os computadores dela: o cupom dos outros clientes não muda. Em branco = padrão.</p>
<div class="dppa-grid">
<label>Largura da impressão<small id="dppaLargTip"></small><input class="form-input" type="number" id="dppaLarg" step="0.5" min="30" max="80" inputmode="decimal"></label>
<label>Mover para o lado<small>mm · negativo = esquerda, positivo = direita</small><input class="form-input" type="number" id="dppaDesl" step="0.5" min="-10" max="10" placeholder="0" inputmode="decimal"></label>
<label>Tamanho da letra<small>em relação ao normal</small><select class="form-input" id="dppaLetra"><option value="">Normal (100%)</option>${[80, 90, 110, 120, 130].map(p => `<option value="${p}">${p}%</option>`).join('')}</select></label>
<label>Papel em branco no fim<small>mm · para a impressora que corta antes do fim</small><input class="form-input" type="number" id="dppaFim" step="1" min="0" max="40" placeholder="0" inputmode="numeric"></label>
</div>
<div class="dppa-dica"><b>Cortou na direita</b> (os centavos somem)? Diminua a largura (ex.: 68) ou mova para a esquerda (ex.: -3). <b>Cortou na esquerda?</b> Mova para a direita (ex.: 3). Vale para o comprovante, a via da cozinha e do bar, a conta das mesas, o pedido do garçom, o fechamento do caixa, a OS e o cupom da NFC-e.</div>
<div class="dppa-bt"><button type="button" class="btn btn-outline" id="dppaTeste"><i class="fas fa-print"></i> Imprimir teste</button><button type="button" class="btn btn-outline" id="dppaPadrao">Voltar ao padrão</button><button type="button" class="btn btn-primary" id="dppaSalvar"><i class="fas fa-check"></i> Salvar ajuste</button></div>`;
            first.insertAdjacentElement('afterend', card);
            $('dppaTeste').onclick = () => { printHtml(testHtml(form(), kindNow())); toast('info', 'Teste enviado para a impressora (ainda não salvo).'); };
            $('dppaPadrao').onclick = () => { ['dppaLarg', 'dppaDesl', 'dppaLetra', 'dppaFim'].forEach(id => { $(id).value = ''; }); toast('info', 'Voltou ao padrão. Toque em Salvar ajuste para gravar.'); };
            $('dppaSalvar').onclick = salvar;
            const sel = $('cfg_impressora'); if (sel) sel.addEventListener('change', tip);
        }
        const v = get();
        $('dppaLarg').value = v.largura ?? ''; $('dppaDesl').value = v.desloc ?? ''; $('dppaLetra').value = v.letra ? String(v.letra) : ''; $('dppaFim').value = v.fim ?? '';
        tip();
    }
    function tip() { const p58 = /58/.test(kindNow()); const t = $('dppaLargTip'); if (t) t.textContent = `mm · padrão ${p58 ? 48 : 72} na bobina de ${p58 ? 58 : 80} mm`; const l = $('dppaLarg'); if (l) l.placeholder = p58 ? '48' : '72'; }
    async function salvar() {
        const f = form(), b = $('dppaSalvar');
        if (f.largura !== null && (f.largura < 30 || f.largura > 80)) return toast('warning', 'A largura vai de 30 a 80 mm.');
        if (f.desloc !== null && Math.abs(f.desloc) > 10) return toast('warning', 'Mova no máximo 10 mm para cada lado.');
        if (f.fim !== null && (f.fim < 0 || f.fim > 40)) return toast('warning', 'O papel no fim vai de 0 a 40 mm.');
        const data = { papelLargura: f.largura, papelDesloc: f.desloc, papelLetra: f.letra, papelFim: f.fim };
        b.disabled = true;
        try {
            if (!DEMO()) await db.collection('settings').doc('general').set({ ...data, updatedAt: (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp() }, { merge: true });
            guardar({ impressoraPadrao: c.papel, ...data });
            toast('success', DEMO() ? 'Ajuste guardado só neste navegador (demonstração).' : 'Ajuste da impressora salvo. Vale para todos os computadores desta empresa.');
        } catch (e) { toast('error', 'Não salvou: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
        finally { b.disabled = false; }
    }
    if (/configuracoes(\.html)?$/.test(location.pathname)) {
        const go = () => { paintCard(); if (!$('dppaCard')) setTimeout(go, 400); };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', go); else go();
    }

    window.DPPapel = { get, area, css, box, page, sync, testHtml, printHtml };
})();
