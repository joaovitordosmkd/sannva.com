/* DistribuiPro 37.4 · PDV leve (Mensal / MySQL).
   O PDV baixava todos os produtos com as fotos dentro (vários MB) a cada abertura: no celular, com 4G, dava
   "Erro ao carregar produtos". Agora vem só o cadastro (sem a foto) e cada foto é uma imagem normal
   (api/mysql/product-img.php), que o celular guarda em cache. Se o servidor não tiver essa opção, volta ao jeito antigo. */
(function () {
    'use strict';
    const M = window.__DP_MYSQL__;
    if (!M || typeof M.api !== 'function' || typeof window.loadProducts !== 'function') return;
    const original = window.loadProducts;
    let usedLight = null;
    async function fetchLight(tries) {
        for (let i = 0; i < tries; i++) {
            try { return await M.api('query.get', { collection: 'products', omit: ['imageFile'] }); }
            catch (e) { if (e && (e.status === 401 || e.status === 403)) throw e; if (i === tries - 1) throw e; await new Promise(r => setTimeout(r, 1200 * (i + 1))); }
        }
    }
    window.loadProducts = async function () {
        if (usedLight === false) return original.apply(this, arguments);
        try {
            const r = await fetchLight(3);
            const docs = (r && r.documents) || [];
            const list = docs.map(d => {
                const data = typeof M.decode === 'function' ? M.decode(d.data || {}) : (d.data || {});
                const p = { id: d.id, ...data };
                if (p._imageFileV && !p.imageFile) p.imageFile = 'api/mysql/product-img.php?p=' + encodeURIComponent(d.id) + '&v=' + encodeURIComponent(p._imageFileV);
                return p;
            }).filter(p => !p.deleted).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            // 'products' é a lista da própria página do PDV
            products = list; // eslint-disable-line no-undef
            usedLight = true;
            if (typeof window.renderProducts === 'function') window.renderProducts();
        } catch (e) {
            console.warn('PDV leve indisponível, usando a carga completa:', e && e.message);
            usedLight = false;
            return original.apply(this, arguments);
        }
    };
})();
