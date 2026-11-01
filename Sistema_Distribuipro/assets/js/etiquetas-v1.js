/* DistribuiPro 38.6 · Etiquetas com código de barras e preço (todas as versões).
   - window.DPBarcode: EAN-13, EAN-8 e Code 128 desenhados em SVG aqui mesmo, sem internet (funciona no Windows Offline).
     DPBarcode.svg(código) · DPBarcode.eanCheck(corpo) · DPBarcode.isEan(código) · DPBarcode.novos(n, usados):
     códigos internos EAN-13 = "2" + settings/general.barcodeSequence (11 dígitos) + dígito verificador. O leitor do PDV
     acha o produto pelo código de barras normal (pdv-pro-v1.js), sem nada a mais.
   - window.DPEtiquetas.open({ items:[{product, qty}], title }): modelo (térmica 40×25 ou 50×30 mm em 1 ou 2 colunas,
     Pimaco 6180, 6181 e A4356), o que vai na etiqueta (loja, nome, tamanho/cor, preço ou "de/por" na promoção, código de
     barras, números, referência), "começar na etiqueta nº" da folha e ajuste fino. O modelo fica em settings/general.etiquetaModelo.
     Produto sem código de barras: "Gerar código" cria o EAN-13 interno e grava no cadastro.
   - Botões: Produtos (Etiquetas na barra = produtos marcados; ícone de etiqueta em cada linha), Compras (ícone na lista e
     "Etiquetas desta entrada" nos detalhes, com a quantidade recebida). A grade (grade-v1.js) chama DPEtiquetas.open. */
(function () {
    'use strict';
    if (window.DPEtiquetas) return;
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const num = v => Number(v) || 0;
    const money = v => num(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const FV = () => window.DPFieldValue || firebase.firestore.FieldValue;
    const ts = () => FV().serverTimestamp();
    const ic = (n, fa) => window.dpIcon ? dpIcon(n) : (fa ? `<i class="fas fa-${fa}"></i>` : '');
    const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    const DEMO = () => { try { return !!db.__isLocalDemo; } catch (e) { return false; } };
    const SDOC = () => DEMO() ? 'demo_general' : 'general';
    const PAGE = (location.pathname.split('/').pop() || 'index.html').replace(/\.html$/, '') || 'index';
    const docsOf = s => s.docs.map(d => ({ id: d.id, ...d.data() }));

    /* =================== Códigos de barras =================== */
    const EAN_L = ['0001101', '0011001', '0010011', '0111101', '0100011', '0110001', '0101111', '0111011', '0110111', '0001011'];
    const EAN_R = EAN_L.map(s => s.replace(/./g, c => (c === '0' ? '1' : '0')));
    const EAN_G = EAN_R.map(s => s.split('').reverse().join(''));
    const PAR = ['LLLLLL', 'LLGLGG', 'LLGGLG', 'LLGGGL', 'LGLLGG', 'LGGLLG', 'LGGGLL', 'LGLGLG', 'LGLGGL', 'LGGLGL'];
    const C128 = '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 114131 311141 411131 211412 211214 211232 2331112'.split(' ');
    // Dígito verificador EAN/UPC: pesos 3,1,3... a partir do último dígito do corpo
    function eanCheck(body) {
        const d = String(body || ''); let s = 0;
        for (let i = 0; i < d.length; i++) s += Number(d[d.length - 1 - i]) * (i % 2 === 0 ? 3 : 1);
        return String((10 - (s % 10)) % 10);
    }
    const isEan = c => /^(\d{8}|\d{12}|\d{13})$/.test(String(c || '')) && eanCheck(String(c).slice(0, -1)) === String(c).slice(-1);
    function eanBits(code) {
        if (code.length === 12) code = '0' + code; // UPC-A = EAN-13 com zero na frente
        let b = '101';
        if (code.length === 13) {
            const par = PAR[+code[0]];
            for (let i = 1; i <= 6; i++) b += (par[i - 1] === 'L' ? EAN_L : EAN_G)[+code[i]];
            b += '01010';
            for (let i = 7; i <= 12; i++) b += EAN_R[+code[i]];
        } else {
            for (let i = 0; i < 4; i++) b += EAN_L[+code[i]];
            b += '01010';
            for (let i = 4; i < 8; i++) b += EAN_R[+code[i]];
        }
        return b + '101';
    }
    // Code 128: só dígitos (4+) usa o conjunto C (mais curto); o resto, conjunto B
    function c128Bits(text) {
        const t = String(text || '').replace(/[^\x20-\x7e]/g, '');
        let v;
        if (/^\d{4,}$/.test(t)) {
            v = [105];
            const even = t.length - (t.length % 2);
            for (let i = 0; i < even; i += 2) v.push(+t.slice(i, i + 2));
            if (t.length % 2) v.push(100, t.charCodeAt(t.length - 1) - 32);
        } else v = [104, ...[...t].map(ch => ch.charCodeAt(0) - 32)];
        let sum = v[0]; for (let i = 1; i < v.length; i++) sum += v[i] * i;
        v.push(sum % 103, 106);
        let bits = '';
        v.forEach(x => { const p = C128[x]; for (let i = 0; i < p.length; i++) bits += (i % 2 === 0 ? '1' : '0').repeat(+p[i]); });
        return bits;
    }
    // Desenha em SVG. mm: largura máxima em milímetros (o módulo fica em até 0,33 mm, o tamanho padrão do EAN)
    function svg(code, o) {
        o = o || {};
        code = String(code || '').trim(); if (!code) return '';
        const ean = isEan(code), bits = ean ? eanBits(code) : c128Bits(code);
        const q = ean ? 9 : 10, W = bits.length + q * 2;
        let rects = '';
        for (let i = 0; i < bits.length;) {
            if (bits[i] !== '1') { i++; continue; }
            let j = i; while (bits[j] === '1') j++;
            rects += `<rect x="${q + i}" y="0" width="${j - i}" height="100"/>`; i = j;
        }
        const style = o.mm ? ` style="width:${(W * Math.min(0.33, o.mm / W)).toFixed(2)}mm"` : '';
        return `<svg class="dpb" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} 100" preserveAspectRatio="none" shape-rendering="crispEdges"${style}><g fill="#000">${rects}</g></svg>`;
    }
    const codesIn = v => String(v || '').split(/[\s,;|]+/).map(s => s.trim()).filter(Boolean);
    // Códigos internos novos (EAN-13 com prefixo 2), sem repetir nenhum código que já está em produto
    async function novos(n, usados) {
        n = Math.max(0, Math.floor(num(n))); if (!n) return [];
        const taken = new Set();
        if (usados) [...usados].forEach(c => codesIn(c).forEach(x => taken.add(x)));
        else { try { docsOf(await db.collection('products').get()).forEach(p => codesIn(p.barcode).forEach(x => taken.add(x))); } catch (e) { } }
        const ref = db.collection('settings').doc(SDOC());
        let seq = 0;
        try { const d = await ref.get(); seq = num(d.exists && (d.data() || {}).barcodeSequence); } catch (e) { }
        const out = [];
        while (out.length < n) {
            seq++;
            const body = '2' + String(seq).padStart(11, '0'), c = body + eanCheck(body);
            if (!taken.has(c)) { out.push(c); taken.add(c); }
        }
        await ref.set({ barcodeSequence: seq, updatedAt: ts() }, { merge: true });
        return out;
    }
    window.DPBarcode = { svg, eanCheck, isEan, novos, codesIn };

    /* =================== Modelos e configuração =================== */
    const MODELS = {
        t40x25: { name: 'Térmica 40 × 25 mm', short: '40 × 25', kind: 'roll', w: 40, h: 25 },
        t50x30: { name: 'Térmica 50 × 30 mm', short: '50 × 30', kind: 'roll', w: 50, h: 30 },
        p6180: { name: 'Pimaco 6180 · Carta, 30 por folha (66,7 × 25,4 mm)', short: 'Pimaco 6180', kind: 'sheet', pw: 215.9, ph: 279.4, w: 66.7, h: 25.4, cols: 3, rows: 10, ml: 4.8, mt: 12.7, px: 69.85, py: 25.4 },
        p6181: { name: 'Pimaco 6181 · Carta, 20 por folha (101,6 × 25,4 mm)', short: 'Pimaco 6181', kind: 'sheet', pw: 215.9, ph: 279.4, w: 101.6, h: 25.4, cols: 2, rows: 10, ml: 4, mt: 12.7, px: 106.36, py: 25.4 },
        a4356: { name: 'Pimaco A4356 · A4, 33 por folha (63,5 × 25,4 mm)', short: 'Pimaco A4356', kind: 'sheet', pw: 210, ph: 297, w: 63.5, h: 25.4, cols: 3, rows: 11, ml: 7.25, mt: 8.8, px: 66, py: 25.4 }
    };
    const SHOW = [['loja', 'Nome da loja'], ['nome', 'Nome do produto'], ['grade', 'Tamanho e cor'], ['preco', 'Preço'], ['depor', '"De / por" na promoção'], ['codigo', 'Código de barras'], ['numero', 'Números do código'], ['ref', 'Referência']];
    const DEF = { model: 't40x25', cols: 1, gap: 2, dx: 0, dy: 0, show: { loja: false, nome: true, grade: true, preco: true, depor: true, codigo: true, numero: true, ref: false } };
    let CFG = null, COMPANY = '';
    async function loadCfg() {
        let g = {};
        try { const d = await db.collection('settings').doc('general').get(); if (d.exists) g = d.data() || {}; } catch (e) { }
        if (DEMO()) { try { const d = await db.collection('settings').doc('demo_general').get(); if (d.exists) g = { ...g, ...(d.data() || {}) }; } catch (e) { } }
        const m = g.etiquetaModelo && typeof g.etiquetaModelo === 'object' ? g.etiquetaModelo : {};
        CFG = { ...DEF, ...m, show: { ...DEF.show, ...(m.show || {}) } };
        if (!MODELS[CFG.model]) CFG.model = DEF.model;
        let brand = {}; try { brand = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {}; } catch (e) { }
        COMPANY = g.nomeFantasia || brand.companyName || g.razaoSocial || '';
        return CFG;
    }
    async function saveCfg(c) {
        CFG = c;
        try { await db.collection('settings').doc(SDOC()).set({ etiquetaModelo: { model: c.model, cols: c.cols, gap: c.gap, dx: c.dx, dy: c.dy, show: { ...c.show } }, updatedAt: ts() }, { merge: true }); } catch (e) { console.warn('etiquetas: modelo não salvo', e); }
    }

    /* =================== O que vai na etiqueta =================== */
    const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    function priceOf(p) {
        const sale = num(p.salePrice || p.price);
        let now = sale;
        if (typeof window.dpPrecoVigente === 'function') { try { now = num(window.dpPrecoVigente(p)) || sale; } catch (e) { } }
        else { const pr = num(p.promoPrice); if (pr > 0 && (sale <= 0 || pr < sale) && (!p.promoUntil || !/^\d{4}-\d{2}-\d{2}$/.test(p.promoUntil) || p.promoUntil >= today())) now = pr; }
        return { sale, now };
    }
    const codeOf = p => codesIn(p && p.barcode)[0] || '';
    const gradeTxt = p => [p.gradeSize, p.gradeColor].filter(Boolean).join(' · ');
    function baseName(p) {
        if (p.gradeBaseName) return p.gradeBaseName;
        const g = gradeTxt(p); let n = String(p.name || '');
        if (g && n.endsWith(' · ' + g)) n = n.slice(0, -(g.length + 3));
        return n;
    }
    function labelHtml(it, m, show) {
        const p = it.product, pr = priceOf(p), code = codeOf(p), g = gradeTxt(p);
        const showCode = show.codigo && code;
        const ref = show.ref ? String(p.code || p.reference || '').trim() : '';
        const inner = m.w - 3;
        return `<div class="lb${showCode ? '' : ' nobc'}">`
            + (show.loja && COMPANY ? `<div class="lj">${esc(COMPANY)}</div>` : '')
            + (show.nome ? `<div class="nm">${esc(baseName(p))}</div>` : '')
            + ((show.grade && g) || ref ? `<div class="gr">${show.grade && g ? `<b>${esc(g)}</b>` : ''}${ref ? `<span>Ref. ${esc(ref)}</span>` : ''}</div>` : '')
            + (show.preco ? `<div class="pr">${show.depor && pr.now < pr.sale - 0.004 ? `<s>${money(pr.sale)}</s>` : ''}<b>${money(pr.now)}</b></div>` : '')
            + (showCode ? `<div class="bc">${svg(code, { mm: inner })}</div>${show.numero ? `<div class="cd">${esc(code)}</div>` : ''}` : '')
            + '</div>';
    }
    // CSS da etiqueta: fontes proporcionais à altura (25 mm = base)
    function labelCss(m) {
        const k = m.h / 25;
        const mm = v => (v * k).toFixed(2) + 'mm';
        return `.lb{width:${m.w}mm;height:${m.h}mm;box-sizing:border-box;padding:${mm(1.1)} 1.5mm;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:space-between;text-align:center;font-family:Arial,Helvetica,sans-serif;color:#000;background:#fff;line-height:1.1}
.lb>div{max-width:100%}
.lj{font-size:${mm(2)};font-weight:700;text-transform:uppercase;letter-spacing:.2mm;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nm{font-size:${mm(2.6)};font-weight:700;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;word-break:break-word}
.gr{display:flex;gap:1.5mm;align-items:baseline;justify-content:center;white-space:nowrap;overflow:hidden}
.gr b{font-size:${mm(3.1)};font-weight:800}.gr span{font-size:${mm(2.1)}}
.pr{display:flex;gap:1.5mm;align-items:baseline;justify-content:center;white-space:nowrap}
.pr b{font-size:${mm(3.7)};font-weight:800}.pr s{font-size:${mm(2.3)}}
.nobc .pr b{font-size:${mm(5.2)}}.nobc .nm{font-size:${mm(3)}}
.bc{flex:1 1 auto;min-height:${mm(4.5)};max-height:${mm(8.5)};display:flex;justify-content:center;width:100%}
.bc svg{height:100%;display:block;max-width:100%}
.cd{font-size:${mm(2.1)};letter-spacing:.35mm;font-family:"Courier New",monospace;font-weight:700;white-space:nowrap}`;
    }
    // Documento para imprimir (rolo térmico: uma página por linha de etiquetas; folha: posição de cada etiqueta)
    function printHtml(items, c, auto) {
        const m = MODELS[c.model], show = c.show, list = [];
        items.forEach(it => { for (let i = 0; i < Math.max(0, Math.round(num(it.qty))); i++) list.push(it); });
        let body = '', page = '';
        if (m.kind === 'roll') {
            const cols = c.cols === 2 ? 2 : 1, gap = num(c.gap) || 0, pw = cols * m.w + (cols - 1) * gap;
            page = `@page{size:${pw}mm ${m.h}mm;margin:0}.row{width:${pw}mm;height:${m.h}mm;display:flex;gap:${gap}mm;overflow:hidden;break-after:page;page-break-after:always;position:relative;left:${num(c.dx)}mm;top:${num(c.dy)}mm}.row:last-child{break-after:auto;page-break-after:auto}`;
            for (let i = 0; i < list.length; i += cols) body += `<div class="row">${list.slice(i, i + cols).map(it => labelHtml(it, m, show)).join('')}</div>`;
        } else {
            const per = m.cols * m.rows, skip = Math.max(0, Math.min(per - 1, Math.round(num(c.start) || 1) - 1));
            page = `@page{size:${m.pw}mm ${m.ph}mm;margin:0}.sheet{position:relative;width:${m.pw}mm;height:${m.ph}mm;overflow:hidden;break-after:page;page-break-after:always}.sheet:last-child{break-after:auto;page-break-after:auto}.sheet .lb{position:absolute}`;
            const slots = []; for (let i = 0; i < skip; i++) slots.push(null); list.forEach(it => slots.push(it));
            for (let s = 0; s < slots.length; s += per) {
                body += '<div class="sheet">' + slots.slice(s, s + per).map((it, i) => {
                    if (!it) return '';
                    const col = i % m.cols, row = Math.floor(i / m.cols);
                    return labelHtml(it, m, show).replace('<div class="lb', `<div style="left:${(m.ml + col * m.px + num(c.dx)).toFixed(2)}mm;top:${(m.mt + row * m.py + num(c.dy)).toFixed(2)}mm" class="lb`);
                }).join('') + '</div>';
            }
        }
        const hint = m.kind === 'roll' ? `Na janela de impressão, escolha a impressora de etiquetas, o papel ${m.short} mm${c.cols === 2 ? ' (2 colunas)' : ''} e margens "Nenhuma".` : 'Na janela de impressão, deixe a escala em 100% (tamanho real) e as margens em "Nenhuma".';
        return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Etiquetas · ${list.length}</title><style>
*{box-sizing:border-box;margin:0;padding:0}html,body{background:#fff}
${labelCss(m)}
${page}
.bar{position:sticky;top:0;z-index:9;background:#fff;border-bottom:1px solid #e2e8f0;padding:10px 14px;display:flex;gap:10px;align-items:center;font:600 13px Arial,sans-serif;color:#334155}.bar button{border:1px solid #cbd5e1;background:#fff;padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:700;color:#334155}.bar button.p{background:#4f46e5;border-color:#4f46e5;color:#fff}.bar span{flex:1;font-weight:500;color:#64748b}
@media screen{body{background:#f1f5f9}.wrap{padding:16px;display:flex;flex-direction:column;gap:10px;align-items:center}.sheet,.row{background:#fff;box-shadow:0 1px 4px rgba(0,0,0,.15)}.lb{outline:1px dashed #cbd5e1}}
@media print{.bar{display:none}.wrap{padding:0}}
</style></head><body><div class="bar"><button class="p" onclick="window.print()">Imprimir</button><button onclick="window.close()">Fechar</button><span>${esc(list.length + (list.length === 1 ? ' etiqueta' : ' etiquetas'))} · ${esc(m.name)}. ${esc(hint)}</span></div><div class="wrap">${body}</div>${auto ? '<script>window.addEventListener("load",function(){setTimeout(function(){window.print()},350)});<\/script>' : ''}</body></html>`;
    }
    function printDoc(items, c) {
        const w = window.open('', '_blank', 'width=920,height=760');
        if (w) { w.document.open(); w.document.write(printHtml(items, c, true)); w.document.close(); return; }
        // Janela bloqueada pelo navegador: imprime por um quadro escondido
        const f = document.createElement('iframe'); f.setAttribute('aria-hidden', 'true'); f.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0';
        document.body.appendChild(f);
        const d = f.contentDocument; d.open(); d.write(printHtml(items, c, false)); d.close();
        setTimeout(() => { try { f.contentWindow.focus(); f.contentWindow.print(); } catch (e) { toast('warning', 'Libere as janelas pop-up para imprimir as etiquetas.'); } setTimeout(() => f.remove(), 60000); }, 450);
    }

    /* =================== Tela de etiquetas =================== */
    function css() {
        if ($('dpetCss')) return;
        const st = document.createElement('style'); st.id = 'dpetCss';
        st.textContent = `
.dpet-m [hidden]{display:none!important}
.dpet-m .modal{max-width:980px;width:min(980px,calc(100vw - 24px));max-height:94vh;display:flex;flex-direction:column}
.dpet-m .modal-body{overflow:auto;padding:16px 18px}
.dpet-m .modal-header h3{display:flex;align-items:center;gap:8px}.dpet-m .modal-header h3 svg{width:20px;height:20px;color:var(--accent)}
.dpet-g{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:16px}
.dpet-sec{border:1px solid var(--border-color);border-radius:14px;padding:12px 14px;background:var(--bg-card)}
.dpet-sec+.dpet-sec{margin-top:12px}
.dpet-sec h4{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);display:flex;align-items:center;gap:6px}
.dpet-sec h4 svg{width:15px;height:15px}
.dpet-add{position:relative;margin-bottom:8px}.dpet-add input{width:100%}
.dpet-dd{position:absolute;left:0;right:0;top:calc(100% + 4px);background:var(--bg-card);border:1px solid var(--border-color);border-radius:10px;z-index:40;max-height:240px;overflow:auto;box-shadow:var(--shadow-lg)}
.dpet-dd button{display:flex;justify-content:space-between;gap:8px;width:100%;text-align:left;padding:8px 12px;border:0;border-bottom:1px solid var(--border-color);background:none;color:var(--text-primary);font:inherit;font-size:13px;cursor:pointer}
.dpet-dd button:hover{background:var(--bg-secondary)}.dpet-dd small{color:var(--text-muted)}
.dpet-list{max-height:340px;overflow:auto;border:1px solid var(--border-color);border-radius:10px}
.dpet-it{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;padding:8px 10px;border-bottom:1px solid var(--border-color)}
.dpet-it:last-child{border-bottom:0}
.dpet-it b{display:block;font-size:13px;color:var(--text-heading);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dpet-it small{display:block;font-size:11px;color:var(--text-muted);font-family:var(--font-mono,monospace)}
.dpet-it small.no{color:var(--warning,#d97706);font-family:inherit;font-weight:700}
.dpet-q{display:flex;align-items:center;border:1px solid var(--border-color);border-radius:9px;overflow:hidden}
.dpet-q button{width:30px;height:32px;border:0;background:var(--bg-secondary);color:var(--text-primary);font-size:16px;cursor:pointer}
.dpet-m .dpet-q input{flex:none;width:50px!important;min-width:0;height:32px;padding:0 4px;border:0;border-radius:0;text-align:center;background:var(--bg-input);color:var(--text-primary);font:inherit;font-weight:700}
.dpet-it em{font-style:normal;font-weight:800;color:var(--accent);font-family:var(--font-body,inherit)}
.dpet-x{border:0;background:none;color:var(--text-muted);cursor:pointer;padding:6px;border-radius:8px;display:inline-flex}.dpet-x:hover{color:var(--danger);background:rgba(239,68,68,.08)}.dpet-x svg{width:16px;height:16px}
.dpet-empty{padding:22px 12px;text-align:center;color:var(--text-muted);font-size:13px}
.dpet-tools{display:flex;gap:8px;flex-wrap:wrap;margin-top:8px}
.dpet-models{display:grid;gap:6px}
.dpet-models label{display:flex;gap:8px;align-items:center;padding:8px 10px;border:1px solid var(--border-color);border-radius:10px;cursor:pointer;font-size:12.5px;color:var(--text-primary)}
.dpet-models label.on{border-color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.1))}
.dpet-models input{accent-color:var(--accent)}
.dpet-opts{display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:10px;font-size:12.5px;color:var(--text-secondary)}
.dpet-seg{display:inline-flex;border:1px solid var(--border-color);border-radius:9px;overflow:hidden}
.dpet-seg button{border:0;background:none;padding:6px 12px;font:inherit;font-size:12.5px;font-weight:700;color:var(--text-secondary);cursor:pointer}
.dpet-seg button.on{background:var(--accent);color:#fff}
.dpet-opts input[type=number]{width:70px;padding:6px 8px;border:1px solid var(--border-color);border-radius:8px;background:var(--bg-input);color:var(--text-primary);font:inherit}
.dpet-chk{display:flex;flex-wrap:wrap;gap:6px}
.dpet-chk label{display:inline-flex;gap:6px;align-items:center;padding:6px 10px;border:1px solid var(--border-color);border-radius:99px;font-size:12px;cursor:pointer;color:var(--text-primary)}
.dpet-chk label.on{border-color:var(--accent);color:var(--accent);background:var(--accent-muted,rgba(99,102,241,.1))}
.dpet-chk input{display:none}
.dpet-prev{display:flex;justify-content:center;align-items:center;padding:14px;background:repeating-conic-gradient(var(--bg-secondary) 0 25%,transparent 0 50%) 0 0/14px 14px;border-radius:10px;min-height:120px;overflow:hidden}
.dpet-prev .zoom{transform-origin:center;box-shadow:0 2px 10px rgba(0,0,0,.18)}
.dpet-fine{margin-top:10px;font-size:12px}.dpet-fine summary{cursor:pointer;color:var(--text-muted);font-weight:700}
.dpet-foot{display:flex;gap:8px;align-items:center;flex-wrap:wrap}.dpet-foot .sp{flex:1}.dpet-foot .tot{font-size:13px;color:var(--text-secondary)}.dpet-foot .tot b{color:var(--text-heading)}
.dpet-btn-ic{display:inline-flex;align-items:center;gap:6px}.dpet-btn-ic svg{width:16px;height:16px}
@media(max-width:820px){.dpet-g{grid-template-columns:1fr}.dpet-m .modal{width:100vw;max-width:none;height:100dvh;max-height:100dvh;border-radius:0}}
.dpet-rowbtn svg{width:16px;height:16px}`;
        document.head.appendChild(st);
    }
    let PRODS = null;
    async function products() {
        if (PRODS) return PRODS;
        try { PRODS = docsOf(await db.collection('products').get()).filter(p => !p.deleted); } catch (e) { PRODS = []; }
        return PRODS;
    }
    const kidsOf = (list, p) => list.filter(k => k.gradeParentId === p.id && !k.deleted).sort((a, b) => num(a.gradeOrder) - num(b.gradeOrder));
    const isSvc = p => !!p && (p.productType === 'service' || (p.controlStock === false && !p.isGradeParent));

    async function open(opts) {
        opts = opts || {};
        css();
        $('dpetModal') && $('dpetModal').remove();
        const c = { ...(await loadCfg()) }; c.show = { ...c.show }; c.start = 1;
        const items = [];
        const push = (p, q) => { if (!p || p.isGradeParent) return; const ex = items.find(i => i.product.id === p.id); if (ex) ex.qty += q; else items.push({ product: p, qty: q }); };
        (opts.items || []).forEach(x => x && x.product && push(x.product, Math.max(0, Math.round(num(x.qty)))));
        const ov = document.createElement('div'); ov.className = 'modal-overlay active dpet-m'; ov.id = 'dpetModal';
        ov.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="dpetTitle"><div class="modal-header"><h3 id="dpetTitle">${ic('tags', 'tags')} ${esc(opts.title || 'Imprimir etiquetas')}</h3><button class="modal-close" type="button" data-x aria-label="Fechar"><i class="fas fa-times"></i></button></div>
<div class="modal-body"><div class="dpet-g">
  <div>
    <div class="dpet-sec"><h4>${ic('package', 'box')} Produtos e quantidade de etiquetas</h4>
      <div class="dpet-add"><input type="text" class="form-control" id="dpetQ" placeholder="Adicionar produto: nome, código ou código de barras..." autocomplete="off"><div class="dpet-dd" id="dpetDD" hidden></div></div>
      <div class="dpet-list" id="dpetList"></div>
      <div class="dpet-tools"><button type="button" class="btn btn-outline btn-sm" id="dpetStock" title="Uma etiqueta para cada peça que está no estoque">${ic('boxes', 'boxes-stacked')} Quantidade = estoque</button><button type="button" class="btn btn-outline btn-sm" id="dpetOne">Uma de cada</button><button type="button" class="btn btn-outline btn-sm" id="dpetGen" hidden>${ic('barcode', 'barcode')} <span></span></button></div>
    </div>
  </div>
  <div>
    <div class="dpet-sec"><h4>${ic('printer', 'print')} Modelo da etiqueta</h4>
      <div class="dpet-models" id="dpetModels">${Object.entries(MODELS).map(([k, m]) => `<label data-k="${k}"><input type="radio" name="dpetModel" value="${k}"> ${esc(m.name)}</label>`).join('')}</div>
      <div class="dpet-opts" id="dpetRoll"><span>Colunas no rolo</span><div class="dpet-seg" id="dpetCols"><button type="button" data-c="1">1</button><button type="button" data-c="2">2</button></div></div>
      <div class="dpet-opts" id="dpetSheet"><label for="dpetStart">Começar na etiqueta nº</label><input type="number" id="dpetStart" min="1" step="1" value="1"><small id="dpetStartHint" style="color:var(--text-muted)">para usar uma folha já começada</small></div>
    </div>
    <div class="dpet-sec"><h4>${ic('tag', 'tag')} O que aparece na etiqueta</h4>
      <div class="dpet-prev" id="dpetPrev" style="margin-bottom:12px"></div>
      <div class="dpet-chk" id="dpetShow">${SHOW.map(([k, l]) => `<label data-k="${k}"><input type="checkbox" value="${k}">${esc(l)}</label>`).join('')}</div>
      <details class="dpet-fine"><summary>Ajuste da impressora (deslocar a impressão)</summary><div class="dpet-opts"><label>Para a direita (mm) <input type="number" id="dpetDx" step="0.5" value="0"></label><label>Para baixo (mm) <input type="number" id="dpetDy" step="0.5" value="0"></label></div></details>
    </div>
  </div>
</div></div>
<div class="modal-footer dpet-foot"><span class="tot" id="dpetTot"></span><span class="sp"></span><button type="button" class="btn btn-secondary" data-x>Cancelar</button><button type="button" class="btn btn-primary dpet-btn-ic" id="dpetPrint">${ic('printer', 'print')} Imprimir</button></div></div>`;
        document.body.appendChild(ov);
        const close = () => { ov.remove(); document.removeEventListener('keydown', onKey); };
        const onKey = e => { if (e.key === 'Escape' && document.body.contains(ov)) close(); };
        document.addEventListener('keydown', onKey);
        ov.querySelectorAll('[data-x]').forEach(b => b.addEventListener('click', close));
        ov.addEventListener('click', e => { if (e.target === ov) close(); });

        const total = () => items.reduce((s, i) => s + Math.max(0, Math.round(num(i.qty))), 0);
        function paintList() {
            const L = $('dpetList');
            L.innerHTML = items.length ? items.map((it, k) => {
                const p = it.product, code = codeOf(p);
                const g = gradeTxt(p);
                return `<div class="dpet-it"><div style="min-width:0"><b title="${esc(p.name)}">${esc(baseName(p))}</b><small${code ? '' : ' class="no"'}>${g ? `<em>${esc(g)}</em> · ` : ''}${code ? esc(code) : 'Sem código de barras'}</small></div><div class="dpet-q"><button type="button" data-d="-1" data-k="${k}" aria-label="Menos">−</button><input type="text" inputmode="numeric" value="${Math.round(num(it.qty))}" data-k="${k}" aria-label="Quantidade de etiquetas"><button type="button" data-d="1" data-k="${k}" aria-label="Mais">+</button></div><button type="button" class="dpet-x" data-rm="${k}" title="Tirar da lista" aria-label="Tirar da lista">${ic('trash-2', 'trash')}</button></div>`;
            }).join('') : `<div class="dpet-empty">Nenhum produto ainda. Busque acima para adicionar.</div>`;
            const miss = items.filter(i => !codeOf(i.product) && !isSvc(i.product)).length, g = $('dpetGen');
            g.hidden = !miss; g.querySelector('span').textContent = `Gerar código para ${miss} produto${miss === 1 ? '' : 's'}`;
            paintTotal(); paintPrev();
        }
        function paintTotal() {
            const n = total(), m = MODELS[c.model];
            let extra = '';
            if (m.kind === 'sheet' && n) { const per = m.cols * m.rows, used = n + Math.max(0, Math.round(num(c.start) || 1) - 1); const f = Math.ceil(used / per); extra = ` · ${f} folha${f === 1 ? '' : 's'}`; }
            $('dpetTot').innerHTML = `<b>${n}</b> etiqueta${n === 1 ? '' : 's'}${extra}`;
            const pb = $('dpetPrint'); pb.disabled = !n;
        }
        function paintModel() {
            const m = MODELS[c.model];
            ov.querySelectorAll('#dpetModels label').forEach(l => { const on = l.dataset.k === c.model; l.classList.toggle('on', on); l.querySelector('input').checked = on; });
            $('dpetRoll').hidden = m.kind !== 'roll'; $('dpetSheet').hidden = m.kind !== 'sheet';
            ov.querySelectorAll('#dpetCols button').forEach(b => b.classList.toggle('on', Number(b.dataset.c) === (c.cols === 2 ? 2 : 1)));
            if (m.kind === 'sheet') { const per = m.cols * m.rows, s = $('dpetStart'); s.max = per; if (num(s.value) > per) s.value = per; $('dpetStartHint').textContent = `de 1 a ${per} · para usar uma folha já começada`; }
            ov.querySelectorAll('#dpetShow label').forEach(l => { const on = !!c.show[l.dataset.k]; l.classList.toggle('on', on); l.querySelector('input').checked = on; });
            $('dpetDx').value = num(c.dx); $('dpetDy').value = num(c.dy);
            paintTotal(); paintPrev();
        }
        function paintPrev() {
            const m = MODELS[c.model], box = $('dpetPrev');
            const sample = items[0] ? items[0] : { product: { name: 'Calça Jeans Skinny', gradeBaseName: 'Calça Jeans Skinny', gradeSize: '38', gradeColor: 'Azul', salePrice: 129.9, barcode: '2000000000015', code: 'CJS-38' }, qty: 1 };
            box.innerHTML = `<style>.dpet-prev ${labelCss(m).replace(/}\n?/g, '}\n.dpet-prev ').replace(/\.dpet-prev $/, '')}</style><div class="zoom">${labelHtml(sample, m, c.show)}</div>`;
            const z = box.querySelector('.zoom'), lb = z.firstElementChild;
            const avail = Math.max(120, box.clientWidth - 30), wpx = lb.offsetWidth || 1;
            const k = Math.max(0.6, Math.min(1.9, avail / wpx));
            z.style.transform = `scale(${k.toFixed(2)})`; box.style.height = Math.round((lb.offsetHeight || 90) * k + 30) + 'px';
        }
        // eventos
        $('dpetList').addEventListener('click', e => {
            const d = e.target.closest('[data-d]'); if (d) { const it = items[+d.dataset.k]; if (it) { it.qty = Math.max(0, Math.round(num(it.qty)) + Number(d.dataset.d)); paintList(); } return; }
            const r = e.target.closest('[data-rm]'); if (r) { items.splice(+r.dataset.rm, 1); paintList(); }
        });
        $('dpetList').addEventListener('change', e => { const k = e.target.dataset.k; if (k === undefined) return; const it = items[+k]; if (it) { it.qty = Math.max(0, Math.min(9999, Math.round(num(String(e.target.value).replace(/\D/g, ''))))); paintList(); } });
        $('dpetStock').addEventListener('click', () => { items.forEach(i => { i.qty = Math.max(0, Math.floor(num(i.product.currentStock))); }); paintList(); });
        $('dpetOne').addEventListener('click', () => { items.forEach(i => { i.qty = 1; }); paintList(); });
        $('dpetGen').addEventListener('click', async e => {
            const b = e.currentTarget, miss = items.filter(i => !codeOf(i.product) && !isSvc(i.product));
            if (!miss.length) return;
            b.disabled = true;
            try {
                const all = await products();
                const codes = await novos(miss.length, all.map(p => p.barcode));
                for (let i = 0; i < miss.length; i++) {
                    const p = miss[i].product; p.barcode = codes[i];
                    await db.collection('products').doc(p.id).update({ barcode: codes[i], updatedAt: ts() });
                    const cached = all.find(x => x.id === p.id); if (cached) cached.barcode = codes[i];
                }
                toast('success', `${miss.length} código${miss.length === 1 ? '' : 's'} de barras gerado${miss.length === 1 ? '' : 's'} e gravado${miss.length === 1 ? '' : 's'} no cadastro.`);
                try { if (typeof window.loadProductsList === 'function') window.loadProductsList(); } catch (er) { }
            } catch (er) { toast('error', 'Não foi possível gerar os códigos: ' + (window.dpErroHumano ? dpErroHumano(er) : (er && er.message))); }
            b.disabled = false; paintList();
        });
        ov.querySelector('#dpetModels').addEventListener('change', e => { if (e.target.name === 'dpetModel') { c.model = e.target.value; paintModel(); } });
        $('dpetCols').addEventListener('click', e => { const b = e.target.closest('[data-c]'); if (b) { c.cols = Number(b.dataset.c); paintModel(); } });
        $('dpetShow').addEventListener('change', e => { c.show[e.target.value] = e.target.checked; paintModel(); });
        $('dpetStart').addEventListener('input', e => { c.start = Math.max(1, Math.round(num(e.target.value)) || 1); paintTotal(); });
        $('dpetDx').addEventListener('input', e => { c.dx = Math.max(-20, Math.min(20, num(e.target.value))); });
        $('dpetDy').addEventListener('input', e => { c.dy = Math.max(-20, Math.min(20, num(e.target.value))); });
        // busca de produto
        const q = $('dpetQ'), dd = $('dpetDD');
        q.addEventListener('input', async () => {
            const t = norm(q.value); if (t.length < 2) { dd.hidden = true; return; }
            const all = await products();
            const hits = all.filter(p => !isSvc(p) && !(p.gradeParentId && all.some(x => x.id === p.gradeParentId) && !codesIn(p.barcode).some(cd => norm(cd) === t)) && (norm(p.name).includes(t) || norm(p.code).includes(t) || codesIn(p.barcode).some(cd => norm(cd).includes(t)))).slice(0, 10);
            dd.innerHTML = hits.length ? hits.map(p => `<button type="button" data-id="${esc(p.id)}"><span>${esc(p.name)}${p.isGradeParent ? ` <small>· grade (${kidsOf(all, p).length})</small>` : ''}</span><small>${p.isGradeParent ? 'todos os tamanhos' : (codeOf(p) || 'sem código')}</small></button>`).join('') : '<div class="dpet-empty">Nenhum produto encontrado</div>';
            dd.hidden = false;
        });
        dd.addEventListener('click', async e => {
            const b = e.target.closest('[data-id]'); if (!b) return;
            const all = await products(), p = all.find(x => x.id === b.dataset.id); if (!p) return;
            if (p.isGradeParent) kidsOf(all, p).forEach(k => push(k, 1)); else push(p, 1);
            q.value = ''; dd.hidden = true; paintList(); q.focus();
        });
        q.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); const f = dd.querySelector('[data-id]'); if (f && !dd.hidden) f.click(); } });
        ov.addEventListener('click', e => { if (!e.target.closest('.dpet-add')) dd.hidden = true; });
        $('dpetPrint').addEventListener('click', () => {
            if (!total()) { toast('warning', 'Informe a quantidade de etiquetas.'); return; }
            const noCode = c.show.codigo ? items.filter(i => i.qty > 0 && !codeOf(i.product)).length : 0;
            if (noCode && !window.confirm(`${noCode} produto(s) estão sem código de barras e a etiqueta sai sem o código. Imprimir assim mesmo?\n\nPara o leitor do caixa reconhecer, use "Gerar código".`)) return;
            printDoc(items.filter(i => i.qty > 0), c); // abre a janela no toque (senão o navegador bloqueia)
            saveCfg(c);
        });
        paintModel(); paintList();
        setTimeout(() => { if (!items.length) q.focus(); }, 60);
        return ov;
    }

    // Compra: uma etiqueta por unidade recebida
    async function fromPurchase(id) {
        let pu = null;
        try { const d = await db.collection('purchases').doc(id).get(); pu = d.exists ? { id: d.id, ...d.data() } : null; } catch (e) { }
        if (!pu) { toast('error', 'Compra não encontrada.'); return; }
        PRODS = null; const all = await products(), items = [];
        (pu.items || []).forEach(i => {
            const p = all.find(x => x.id === i.productId); if (!p || isSvc(p)) return;
            const units = num(i.unitsTotal) || num(i.quantity) * (num(i.factor) || 1);
            items.push({ product: p, qty: Math.max(1, Math.round(units)) });
        });
        if (!items.length) { toast('info', 'Os itens desta compra não estão mais no cadastro de produtos.'); return; }
        return open({ items, title: `Etiquetas da compra #${pu.purchaseNumber || ''}` });
    }

    window.DPEtiquetas = { open, fromPurchase, MODELS, labelHtml, printHtml, priceOf, reset: () => { PRODS = null; } };

    /* =================== Produtos: barra, seleção e linha =================== */
    function setupProdutos() {
        const tb = $('productsTable'); if (!tb || $('dpetBarBtn')) return;
        css();
        const pdf = document.querySelector('.toolbar-right button[onclick^="exportProductsPDF"]');
        const b = document.createElement('button'); b.className = 'btn btn-outline dpet-btn-ic'; b.id = 'dpetBarBtn'; b.type = 'button';
        b.title = 'Imprimir etiquetas com código de barras e preço (marque os produtos na lista)';
        b.innerHTML = `${ic('tags', 'tags')} Etiquetas`;
        if (pdf) pdf.insertAdjacentElement('beforebegin', b); else document.querySelector('.toolbar-right')?.prepend(b);
        const idOfRow = tr => { const m = (tr.innerHTML.match(/openProductModal\('([^']+)'\)/) || [])[1]; return m || ''; };
        const all = () => { try { return Array.isArray(allProducts) ? allProducts : []; } catch (e) { return []; } };
        const itemsOf = ids => {
            const list = all(), out = [];
            ids.forEach(id => { const p = list.find(x => x.id === id); if (!p) return; if (p.isGradeParent) kidsOf(list, p).forEach(k => out.push({ product: k, qty: 1 })); else if (!isSvc(p)) out.push({ product: p, qty: 1 }); });
            return out;
        };
        b.addEventListener('click', () => {
            const ids = [...tb.querySelectorAll('tr')].filter(tr => tr.querySelector('td:first-child input[type=checkbox]:checked')).map(idOfRow).filter(Boolean);
            PRODS = null; open({ items: itemsOf(ids), title: ids.length ? `Etiquetas de ${ids.length} produto${ids.length === 1 ? '' : 's'}` : 'Imprimir etiquetas' });
        });
        // Marcar todos (cabeçalho)
        const head = tb.closest('table') && tb.closest('table').querySelector('thead input[type=checkbox]');
        if (head && !head.dataset.dpet) { head.dataset.dpet = '1'; head.title = 'Marcar todos desta página'; head.addEventListener('change', () => tb.querySelectorAll('td:first-child input[type=checkbox]').forEach(x => { x.checked = head.checked; })); }
        // Ícone de etiqueta em cada linha
        const decorate = () => {
            tb.querySelectorAll('tr').forEach(tr => {
                const cell = tr.querySelector('.actions-cell'); if (!cell || cell.querySelector('.dpet-rowbtn')) return;
                const id = idOfRow(tr); if (!id) return;
                const p = all().find(x => x.id === id); if (!p || isSvc(p)) return;
                const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-icon dpet-rowbtn'; btn.title = 'Etiquetas deste produto'; btn.setAttribute('aria-label', 'Etiquetas deste produto');
                btn.innerHTML = ic('tag', 'tag');
                btn.addEventListener('click', () => { PRODS = null; open({ items: itemsOf([id]), title: `Etiquetas · ${p.name}` }); });
                const ed = cell.querySelector('button[onclick^="openProductModal"]'); if (ed) ed.insertAdjacentElement('beforebegin', btn); else cell.prepend(btn);
            });
            if (head) head.checked = false;
        };
        new MutationObserver(decorate).observe(tb, { childList: true });
        decorate();
    }

    /* =================== Compras: lista e detalhes =================== */
    function setupCompras() {
        if (PAGE !== 'compras' || !$('modalCompra')) return;
        css();
        const tbody = document.querySelector('.page-content table tbody') || document.querySelector('tbody');
        let lastView = '';
        document.addEventListener('click', e => { const v = e.target.closest('[onclick^="viewPurchase("]'); if (v) lastView = ((v.getAttribute('onclick') || '').match(/viewPurchase\('([^']+)'\)/) || [])[1] || ''; }, true);
        const decorate = () => {
            if (!tbody) return;
            tbody.querySelectorAll('tr').forEach(tr => {
                const v = tr.querySelector('[onclick^="viewPurchase("]'); if (!v || tr.querySelector('.dpet-rowbtn')) return;
                if (/Cancelad/i.test(tr.textContent)) return;
                const id = ((v.getAttribute('onclick') || '').match(/viewPurchase\('([^']+)'\)/) || [])[1]; if (!id) return;
                const btn = document.createElement('button'); btn.type = 'button'; btn.className = 'btn-icon dpet-rowbtn'; btn.title = 'Etiquetas desta entrada (uma por peça)'; btn.setAttribute('aria-label', 'Etiquetas desta entrada');
                btn.innerHTML = ic('tag', 'tag');
                btn.addEventListener('click', () => fromPurchase(id));
                v.insertAdjacentElement('afterend', btn);
            });
        };
        if (tbody) new MutationObserver(decorate).observe(tbody, { childList: true });
        decorate();
        // "Etiquetas desta entrada" na janela de detalhes da compra
        new MutationObserver(muts => {
            muts.forEach(m => m.addedNodes.forEach(n => {
                if (!(n instanceof HTMLElement) || !n.classList.contains('modal-overlay')) return;
                const h = n.querySelector('.modal-header h3'); if (!h || !/^Compra #/.test(h.textContent.trim()) || !lastView) return;
                const foot = n.querySelector('.modal-footer'); if (!foot || foot.querySelector('.dpet-pbtn')) return;
                const id = lastView;
                const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline dpet-btn-ic dpet-pbtn'; b.innerHTML = `${ic('tags', 'tags')} Etiquetas desta entrada`;
                b.addEventListener('click', () => { n.remove(); fromPurchase(id); });
                foot.prepend(b);
            }));
        }).observe(document.body, { childList: true });
    }

    const ready = fn => { if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn); else fn(); };
    ready(() => { try { if (PAGE === 'produtos') setupProdutos(); setupCompras(); } catch (e) { console.warn('etiquetas', e); } });
})();
