/* DistribuiPro 37.9 · Custo médio do produto.
   Antes o custo virava o da última compra (lucro, margem e DRE saíam errados).
   Agora: novo custo = (estoque × custo atual + quantidade que entrou × custo pago) ÷ (estoque + quantidade),
   sempre contando em unidades (a caixa de 12 entra como 12 unidades).
   O preço de venda só muda se o usuário marcar "Mudar o preço de venda".
   Usado em Compras (receber compra) e em Produtos (entrada rápida de estoque). */
(function () {
    'use strict';
    if (window.DPCustoMedio) return;
    const n = v => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
    const r4 = v => Math.round(n(v) * 10000) / 10000;
    const money = v => (typeof Utils !== 'undefined' && Utils.currency) ? Utils.currency(v) : n(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const qtyFmt = v => n(v).toLocaleString('pt-BR', { maximumFractionDigits: 3 });
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    /** Custo médio depois da entrada. Entrada sem custo informado mantém o custo atual. */
    function calc(estoque, custoAtual, qtd, custoPago) {
        estoque = n(estoque); custoAtual = n(custoAtual); qtd = n(qtd); custoPago = n(custoPago);
        if (!(qtd > 0) || !(custoPago > 0)) return r4(custoAtual);
        // Sem estoque (ou estoque negativo) ou sem custo anterior: vale o custo desta compra
        if (!(estoque > 0) || !(custoAtual > 0)) return r4(custoPago);
        return r4((estoque * custoAtual + qtd * custoPago) / (estoque + qtd));
    }

    /** Produto lido agora do banco (estoque e custo de antes da entrada). */
    async function produto(id) {
        if (!id) return null;
        try { const d = await db.collection('products').doc(id).get(); return d.exists ? { id, ...d.data() } : null; } catch (e) { return null; }
    }

    function css() {
        if (document.getElementById('dpcmCss')) return;
        const st = document.createElement('style'); st.id = 'dpcmCss';
        st.textContent = `
#dpcmOverlay .modal{max-width:640px}
.dpcm-h{font-size:12.5px;color:var(--text-muted);margin:0 0 12px;line-height:1.5}
.dpcm-tw{border:1px solid var(--border-color);border-radius:10px;overflow:auto;max-height:46vh}
.dpcm-t{width:100%;border-collapse:collapse;font-size:12.5px}
.dpcm-t th{position:sticky;top:0;background:var(--bg-secondary);color:var(--text-muted);font-size:10.5px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;text-align:left;padding:8px 10px;white-space:nowrap}
.dpcm-t td{padding:8px 10px;border-top:1px solid var(--border-color);color:var(--text-primary);vertical-align:top}
.dpcm-t .r{text-align:right;white-space:nowrap}
.dpcm-t small{display:block;font-size:10.5px;color:var(--text-muted)}
.dpcm-up{color:#d97706;font-weight:700}.dpcm-dn{color:#10b981;font-weight:700}
.dpcm-chk{display:flex;align-items:flex-start;gap:10px;margin-top:12px;padding:12px 14px;border-radius:10px;background:var(--bg-secondary);cursor:pointer;font-size:13px;color:var(--text-primary)}
.dpcm-chk input{margin-top:2px;accent-color:var(--accent);width:16px;height:16px;flex:none}
.dpcm-chk small{display:block;color:var(--text-muted);font-size:11.5px;margin-top:2px}
@media(max-width:640px){.dpcm-t .dpcm-hide{display:none}}`;
        document.head.appendChild(st);
    }

    /** Janela "Receber compra": mostra o custo médio que cada produto vai ficar.
        Devolve { atualizarVenda } ou null (cancelou). */
    function confirmarRecebimento(compra, produtos) {
        css();
        const byId = id => (Array.isArray(produtos) ? produtos : []).find(p => p.id === id) || null;
        const itens = (compra && compra.items) || [];
        const temVenda = itens.some(i => n(i.salePrice) > 0);
        const linhas = itens.map(i => {
            const p = byId(i.productId) || {};
            const un = n(i.unitsTotal || i.quantity);
            const novo = n(i.costPrice) > 0 ? calc(p.currentStock, p.costPrice, un, i.costPrice) : n(p.costPrice);
            const atual = n(p.costPrice);
            const cls = atual > 0 && novo > atual + 0.0049 ? 'dpcm-up' : (atual > 0 && novo < atual - 0.0049 ? 'dpcm-dn' : '');
            const venda = n(i.salePrice) > 0 ? `${money(p.salePrice || 0)} → <b>${money(i.salePrice)}</b>` : '—';
            return `<tr><td><b>${esc(i.productName || p.name || 'Produto')}</b><small>${esc(i.packaging || 'Unidade')}</small></td>
<td class="r">+${qtyFmt(un)} un<small>tem ${qtyFmt(p.currentStock || 0)}</small></td>
<td class="r dpcm-hide">${money(i.costPrice || 0)}</td>
<td class="r">${atual > 0 ? money(atual) + ' → ' : ''}<span class="${cls}">${money(novo)}</span></td>
<td class="r dpcm-hide">${venda}</td></tr>`;
        }).join('');
        return new Promise(resolve => {
            document.getElementById('dpcmOverlay')?.remove();
            const ov = document.createElement('div');
            ov.id = 'dpcmOverlay'; ov.className = 'modal-overlay active';
            ov.innerHTML = `<div class="modal">
<div class="modal-header"><h3><i class="fas fa-truck-ramp-box" style="color:var(--accent);margin-right:8px"></i>Receber compra #${esc(compra.purchaseNumber || '')}</h3><button class="modal-close" data-x><i class="fas fa-times"></i></button></div>
<div class="modal-body">
<p class="dpcm-h">O estoque recebe os itens abaixo. O custo de cada produto passa a ser a <b>média</b> entre o que já estava no estoque e o que está chegando, para o lucro e a margem ficarem certos.</p>
<div class="dpcm-tw"><table class="dpcm-t"><thead><tr><th>Produto</th><th class="r">Entra</th><th class="r dpcm-hide">Custo pago</th><th class="r">Custo médio</th><th class="r dpcm-hide">Venda</th></tr></thead><tbody>${linhas || '<tr><td colspan="5">Sem itens.</td></tr>'}</tbody></table></div>
${temVenda ? `<label class="dpcm-chk"><input type="checkbox" id="dpcmVenda"><span>Mudar o preço de venda para o da compra<small>Deixe desmarcado para manter os preços de venda que já estão no cadastro.</small></span></label>` : ''}
</div>
<div class="modal-footer"><button class="btn btn-secondary" data-x>Cancelar</button><button class="btn btn-primary" id="dpcmOk"><i class="fas fa-check"></i> Receber e atualizar estoque</button></div></div>`;
            document.body.appendChild(ov);
            const close = v => { ov.remove(); resolve(v); };
            ov.querySelectorAll('[data-x]').forEach(b => b.onclick = () => close(null));
            ov.addEventListener('click', e => { if (e.target === ov) close(null); });
            ov.querySelector('#dpcmOk').onclick = () => close({ atualizarVenda: !!ov.querySelector('#dpcmVenda')?.checked });
        });
    }

    window.DPCustoMedio = { calc, produto, confirmarRecebimento };
})();
