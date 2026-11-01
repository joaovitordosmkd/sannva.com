/* DistribuiPro 35.22 · OS Pro (assistência técnica e loja de celular). Carregado em todas as páginas.
   - Ordens de Serviço: checklist técnico de entrada e saída com assinatura do cliente (na tela ou pelo celular),
     orçamento enviado para aprovação pelo link (o cliente aprova/recusa e a OS muda sozinha), mensagens
     prontas de WhatsApp em cada etapa, certificado de garantia com QR e OS de garantia entregue sem cobrar.
   - Em qualquer página: recebe as respostas dos clientes (aprovação, recusa, assinatura) e avisa a equipe.
   - Configurações › Empresa: liga "Compra de usados" e "Garantias" no menu (no demo de assistência/loja de
     celular já vem ligado). Coleções: os_client_inbox (respostas), device_purchases (usados).
   - 35.27: botão "Novo cliente" no campo Cliente da OS (cadastro rápido, avisa cliente repetido).
   - 35.30: checklist por tipo de aparelho (celular, computador, impressora, som, TV, outro), escolhido
     sozinho pelo "Tipo de equipamento" e editável na própria OS (itens, novos tipos, bateria). */
(function () {
    'use strict';
    if (typeof db === 'undefined' || window.OSPRO) return;
    const DOC = db.__isLocalDemo ? 'demo_general' : 'general';
    const backend = window.DISTRIBUIPRO_OFFLINE ? 'lan' : window.__DP_MYSQL__ ? 'mysql' : db.__isLocalDemo ? 'demo' : 'firebase';
    const LAN = backend === 'lan';
    const VER = (/[?&]v=([^&#]+)/.exec((document.currentScript && document.currentScript.src) || '') || [])[1] || '1';
    const SEG_KEY = 'dp_demo_segment_v1';
    const ROLES = ['admin', 'manager', 'seller', 'cashier', 'technician'];
    const $ = id => document.getElementById(id);
    const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const money = v => (Number(v) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    const ts = () => (window.DPFieldValue || firebase.firestore.FieldValue).serverTimestamp();
    const toMs = v => { if (!v) return null; try { if (typeof v === 'number') return v; if (v.toDate) return v.toDate().getTime(); if (v.__ts) return Number(v.__ts); if (v.seconds) return v.seconds * 1000; const n = Date.parse(v); return isNaN(n) ? null : n; } catch (e) { return null; } };
    const brDate = (ms, time) => ms ? new Date(ms).toLocaleString('pt-BR', time ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
    const osNum = o => '#OS-' + String((o && (o.orderNumber || o.osNumber)) || 0).padStart(4, '0');
    const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'cliente';
    const device = o => [o && o.deviceType, o && o.brand, o && o.model].filter(Boolean).join(' ');
    // 38.1 · OS de veículo: as mensagens dizem "seu veículo VW Gol (placa ABC1D23)"
    const devTxt = o => { if (!(o && window.DPTerm && DPTerm.isVehicle(o))) return device(o) || 'aparelho'; const bm = [o.brand, o.model].filter(Boolean).join(' '), pl = o.plate || o.serial || ''; return 'veículo' + (bm ? ' ' + bm : '') + (pl ? ` (placa ${String(pl).toUpperCase()})` : ''); };
    const toast = (t, m) => { try { Toast[t](m); } catch (e) { console.log(m); } };
    const uname = () => { try { return (typeof currentUser !== 'undefined' && currentUser && currentUser.name) || auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch (e) { return 'Operador'; } };
    const waPhone = p => { let d = String(p || '').replace(/\D/g, ''); if (d.length === 10 || d.length === 11) d = '55' + d; return d.length >= 12 ? d : ''; };
    const STATUS_TXT = { received: 'Recebido', analyzing: 'Em análise', awaiting_approval: 'Aguardando aprovação', approved: 'Orçamento aprovado', in_progress: 'Em manutenção', awaiting_parts: 'Aguardando peça', ready: 'Pronto para retirada', delivered: 'Entregue', returned: 'Devolvido sem reparo', cancelled: 'Cancelada' };
    const nowIso = () => new Date().toISOString();

    /* =================== CHECKLIST =================== */
    const CHECK_ITEMS = [
        ['liga', 'Liga normalmente'], ['tela', 'Tela / display'], ['touch', 'Touch'], ['cam_frontal', 'Câmera frontal'], ['cam_traseira', 'Câmera traseira'],
        ['biometria', 'Face ID / digital'], ['botoes', 'Botões (power e volume)'], ['altofalante', 'Alto-falante'], ['auricular', 'Auricular (ligação)'],
        ['microfone', 'Microfone'], ['wifi', 'Wi-Fi'], ['bluetooth', 'Bluetooth'], ['sinal', 'Sinal / chip'], ['carregamento', 'Carregamento (conector)'],
        ['vibracall', 'Vibração'], ['carcaca', 'Carcaça / tampa sem danos']
    ];
    // 35.30 · Modelos de checklist por tipo de aparelho, editáveis na própria OS (settings.osChecklistModels).
    // Itens como {k, l}: o Firestore não aceita lista dentro de lista. Cada OS guarda a lista que usou
    // (checklistIn/Out.list), então mudar o modelo depois não mexe nas OS já feitas.
    const ci = (k, l) => ({ k, l });
    const DEFAULT_MODELS = [
        { id: 'celular', name: 'Celular / tablet', battery: true, match: ['celular', 'smartphone', 'iphone', 'android', 'telefone', 'tablet', 'ipad', 'galaxy', 'redmi', 'xiaomi', 'motorola', 'moto g', 'apple watch', 'smartwatch'], items: CHECK_ITEMS.map(([k, l]) => ci(k, l)) },
        { id: 'notebook', name: 'Computador / notebook', battery: true, match: ['notebook', 'computador', 'pc', 'desktop', 'laptop', 'macbook', 'imac', 'all in one', 'cpu', 'gabinete', 'ultrabook', 'chromebook', 'netbook'], items: [ci('liga', 'Liga normalmente'), ci('sistema', 'Sistema inicia (Windows/macOS)'), ci('tela', 'Tela / monitor'), ci('teclado', 'Teclado'), ci('touchpad', 'Touchpad / mouse'), ci('webcam', 'Webcam'), ci('som', 'Som (alto-falantes / fone)'), ci('microfone', 'Microfone'), ci('wifi', 'Wi-Fi / rede'), ci('bluetooth', 'Bluetooth'), ci('usb', 'Portas USB'), ci('video', 'Saída de vídeo (HDMI)'), ci('carregador', 'Carregador / fonte'), ci('bateria', 'Bateria carrega'), ci('armazenamento', 'HD / SSD reconhecido'), ci('cooler', 'Cooler / temperatura'), ci('carcaca', 'Carcaça / dobradiças sem danos')] },
        { id: 'impressora', name: 'Impressora', battery: false, match: ['impressora', 'multifuncional', 'printer', 'ecotank', 'deskjet', 'laserjet', 'officejet', 'plotter'], items: [ci('liga', 'Liga normalmente'), ci('painel', 'Painel / visor'), ci('papel', 'Puxa o papel'), ci('atolamento', 'Sem atolamento de papel'), ci('impressao', 'Imprime com qualidade'), ci('cartucho', 'Cartuchos / toner reconhecidos'), ci('cabeca', 'Cabeça de impressão'), ci('scanner', 'Scanner / cópia'), ci('usb', 'Conexão USB'), ci('rede', 'Wi-Fi / rede'), ci('bandeja', 'Bandejas e tampas'), ci('carcaca', 'Carcaça sem danos')] },
        { id: 'som', name: 'Caixa de som / áudio', battery: false, match: ['caixa de som', 'som','jbl', 'soundbar', 'amplificador', 'subwoofer', 'home theater', 'radio', 'fone', 'headset', 'microsystem'], items: [ci('liga', 'Liga normalmente'), ci('som', 'Som saindo'), ci('grave', 'Grave / subwoofer'), ci('ruido', 'Sem chiado ou ruído'), ci('volume', 'Volume e botões'), ci('bluetooth', 'Bluetooth'), ci('aux', 'Entrada auxiliar (P2)'), ci('usb', 'USB / cartão de memória'), ci('radio', 'Rádio FM'), ci('carregamento', 'Carrega / bateria'), ci('luzes', 'Luzes / LEDs'), ci('carcaca', 'Carcaça sem danos')] },
        { id: 'tv', name: 'TV / monitor', battery: false, match: ['tv', 'televisao', 'televisor', 'smart tv', 'monitor', 'projetor'], items: [ci('liga', 'Liga normalmente'), ci('imagem', 'Imagem sem manchas ou linhas'), ci('som', 'Som'), ci('controle', 'Controle remoto'), ci('hdmi', 'Entradas HDMI'), ci('usb', 'USB'), ci('wifi', 'Wi-Fi / Smart'), ci('botoes', 'Botões'), ci('fonte', 'Fonte / placa'), ci('carcaca', 'Carcaça e tela sem trincas')] },
        { id: 'outro', name: 'Outro aparelho', battery: false, match: [], items: [ci('liga', 'Liga normalmente'), ci('funcao', 'Faz a função principal'), ci('botoes', 'Botões / controles'), ci('visor', 'Visor / display'), ci('conexoes', 'Cabos e conexões'), ci('fonte', 'Fonte / carregador'), ci('carcaca', 'Carcaça sem danos')] },
        // 38.1 · Oficina / auto center (aparece com "OS para veículos" ligada). O medidor vira "Combustível (%)".
        { id: 'veiculo', name: 'Veículo', battery: true, gaugeLabel: 'Combustível', match: ['carro', 'veiculo', 'moto', 'motocicleta', 'caminhonete', 'caminhao', 'utilitario', 'van', 'suv', 'sedan', 'hatch', 'picape', 'pickup', 'automovel', 'onibus', 'trator', 'quadriciclo'], items: [ci('liga', 'Dá partida normalmente'), ci('lataria', 'Lataria sem amassados ou riscos'), ci('vidros', 'Vidros e para-brisa'), ci('farois', 'Faróis e lanternas'), ci('retrovisores', 'Retrovisores'), ci('pneus', 'Pneus'), ci('estepe', 'Estepe'), ci('macaco', 'Macaco, chave de roda e triângulo'), ci('crlv', 'Documento (CRLV)'), ci('painel', 'Painel sem luz de alerta'), ci('som', 'Som / multimídia'), ci('arcond', 'Ar-condicionado'), ci('bancos', 'Bancos e forração'), ci('objetos', 'Objetos de valor no veículo')] }
    ];
    const cloneModel = m => ({ id: String(m.id), name: String(m.name || 'Modelo'), battery: !!m.battery, ...(m.gaugeLabel ? { gaugeLabel: String(m.gaugeLabel) } : {}), match: (Array.isArray(m.match) ? m.match : []).map(String), items: (Array.isArray(m.items) ? m.items : []).filter(x => x && x.k).map(x => ci(String(x.k), String(x.l || x.k))) });
    function checkSummary(c) {
        if (!c || !c.items || !Object.keys(c.items).length) return null;
        // OS antiga (sem lista guardada) = checklist de celular
        const list = Array.isArray(c.list) && c.list.length ? c.list.map(x => [x.k, x.l]) : CHECK_ITEMS;
        return {
            items: list.filter(([k]) => c.items[k]).map(([k, l]) => ({ key: k, label: l, state: c.items[k] })),
            // 40.92 · null (e não undefined) quando o "liga" não foi marcado: o Firebase recusa undefined e o link de autorizar/assinar não era gerado
            battery: c.battery || '', powersOn: c.items.liga ? c.items.liga !== 'fail' : null, notes: c.notes || '',
            signed: !!c.signature, signedAt: toMs(c.signedAt), signedName: c.signedName || '', model: c.modelName || '', gauge: c.gaugeLabel || ''
        };
    }

    /* =================== CONFIGURAÇÃO E MENU =================== */
    function demoSeg() { try { const raw = sessionStorage.getItem(SEG_KEY) || localStorage.getItem(SEG_KEY); const s = raw ? JSON.parse(raw) : null; return s && typeof s === 'object' ? s : null; } catch (e) { return null; } }
    function demoMobile(d) {
        if (!db.__isLocalDemo) return false;
        if (d && d.demoDataset) return d.demoDataset === 'mobile_service';
        const s = demoSeg(); return !!s && (s.dataset === 'mobile_service' || ['assistencia_celular', 'loja_celular'].includes(s.key));
    }
    const cacheKey = () => 'dp_ospro_cfg_v1' + (db.__isLocalDemo ? ':' + ((demoSeg() || {}).key || 'general') : '');
    let cfg = (() => { try { return JSON.parse(localStorage.getItem(cacheKey()) || 'null'); } catch (e) { return null; } })() || { enabled: demoMobile(null) };
    let settings = {};
    async function loadCfg() {
        try { const d = await db.collection('settings').doc(DOC).get(); settings = d.exists ? (d.data() || {}) : {}; cfg = { enabled: settings.osProEnabled === true || (settings.osProEnabled !== false && demoMobile(settings)) }; localStorage.setItem(cacheKey(), JSON.stringify(cfg)); } catch (e) { }
        return cfg;
    }
    async function saveSettings(patch) { await db.collection('settings').doc(DOC).set(patch, { merge: true }); await loadCfg(); syncMenu(); }
    // 35.30 · Modelos de checklist: os salvos pela loja ou os padrão.
    // 38.1 · "OS para veículos" (oficina): o modelo Veículo entra na lista e é o escolhido quando o tipo não diz nada.
    const vehMode = () => window.DPRamo ? DPRamo.vehicle() : (settings.osVehicleMode === true || (settings.osVehicleMode !== false && settings.segment === 'oficina'));
    function ckModels() {
        const s = settings.osChecklistModels, veh = vehMode();
        const list = Array.isArray(s) && s.length ? s.map(cloneModel) : DEFAULT_MODELS.filter(m => m.id !== 'veiculo' || veh).map(cloneModel);
        if (veh && !list.some(m => m.id === 'veiculo')) list.push(cloneModel(DEFAULT_MODELS.find(m => m.id === 'veiculo')));
        return list;
    }
    async function saveCkModels(list) { await saveSettings({ osChecklistModels: list.map(cloneModel) }); }
    const plain = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
    function matchCkModel(text, list) {
        const t = ' ' + plain(text) + ' '; if (!t.trim()) return null;
        for (const m of list) for (const kw of m.match) { const k = plain(kw); if (k && t.includes(' ' + k + ' ')) return m; }
        return null;
    }
    // Escolhe o modelo pelo "Tipo de equipamento" (ex.: "Notebook" → Computador / notebook); marca e modelo
    // só ajudam se o tipo não disser nada ("Notebook" + "Galaxy Book" continua notebook).
    function pickCkModel(type, extra) {
        const list = ckModels(), veh = vehMode() && list.find(m => m.id === 'veiculo');
        return matchCkModel(type, list) || matchCkModel(extra, list) || veh || (plain(type) ? (list.find(m => m.id === 'outro') || list[0]) : list[0]);
    }
    function role() { try { return localStorage.getItem('erp_user_role') || ''; } catch (e) { return ''; } }
    function syncMenu() {
        const menu = document.querySelector('.sidebar-menu'); if (!menu) return;
        const r = role(), allowed = !r || ROLES.includes(r), page = (location.pathname.split('/').pop() || '').replace('.html', '');
        const defs = [['usados', 'fa-recycle', 'Compra de usados'], ['garantias', 'fa-shield-halved', 'Garantias']];
        let anchor = menu.querySelector('a.menu-item[data-page="ordens-servico"]') || menu.querySelector('a.menu-item[href="ordens-servico.html"]');
        for (const [key, ico, label] of defs) {
            let a = menu.querySelector(`a.menu-item[data-page="${key}"]`);
            if (cfg.enabled && allowed) {
                if (!a) { a = document.createElement('a'); a.href = key + '.html'; a.className = 'menu-item'; a.dataset.page = key; a.innerHTML = `<i class="fas ${ico}"></i><span class="menu-text">${label}</span>`; if (anchor) anchor.insertAdjacentElement('afterend', a); else menu.appendChild(a); }
                anchor = a;
                if (page === key) { menu.querySelectorAll('.menu-item.active').forEach(x => { if (x !== a) x.classList.remove('active'); }); a.classList.add('active'); }
            } else if (a) a.remove();
        }
    }
    function ensureCss() { if (document.querySelector('link[href*="os-pro-v1.css"]')) return; const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = 'assets/css/os-pro-v1.css?v=' + VER; document.head.appendChild(l); }
    ensureCss(); syncMenu();
    // 35.32 · CNPJ que se preenche sozinho (Empresa, Clientes, Fornecedores, Contas a receber, PDV e OS)
    (function () { if (window.DPCnpj || document.querySelector('script[src*="cnpj-auto-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/cnpj-auto-v1.js?v=' + VER; s.defer = true; document.head.appendChild(s); })();
    // 37.9 · Agenda de serviços (menu, Configurações, profissional por item no PDV, aba na ficha do cliente)
    (function () { if (window.DPAgendaCore || document.querySelector('script[src*="agenda-core-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/agenda-core-v1.js?v=' + VER; document.head.appendChild(s); })();
    // 38.1 · Ramo do negócio: palavras por ramo (DPTerm), chaves Pet shop e OS para veículos em Configurações
    (function () { if (window.DPRamo || document.querySelector('script[src*="ramo-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/ramo-v1.js?v=' + VER; document.head.appendChild(s); })();
    // 38.2 · Pets e veículos dos clientes (ficha, PDV, produtos e OS de veículo); clientes.html e pdv.html já trazem direto
    (function () { if (window.DPItens || document.querySelector('script[src*="itens-cliente-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/itens-cliente-v1.js?v=39.14.5-os'; document.head.appendChild(s); })();
    // 38.4 · OS da assistência: senha/padrão do aparelho, termo de entrada, "Aguardando peça" e sinal (em todas as páginas: as respostas dos clientes chegam em qualquer tela)
    (function () { if (window.OSB || document.querySelector('script[src*="os-bancada-v1.js"]')) return; const s = document.createElement('script'); s.src = 'assets/js/os-bancada-v1.js?v=39.14.5-os'; document.head.appendChild(s); })();
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', syncMenu);

    function setupConfig() {
        const host = $('tabEmpresa'); if (!host || $('ospCfgCard')) return;
        const card = document.createElement('div'); card.className = 'card osp-cfg'; card.id = 'ospCfgCard';
        card.innerHTML = `<div class="osp-cfg-h"><div class="ico"><i class="fas fa-mobile-screen"></i></div><div><h3>Assistência técnica ou loja de celular?</h3>
<p>Ligue para aparecer no menu <b>Compra de usados</b> (avaliação com checklist, preço sugerido e termo de compra) e <b>Garantias</b> (consulta por IMEI ou CPF, certificado com QR Code e OS de garantia sem cobrança). O checklist com assinatura e a aprovação do orçamento pelo celular já ficam nas Ordens de Serviço.</p></div>
<label class="osp-sw" title="Ligar ou desligar"><input type="checkbox" id="ospCfgOn"><span></span></label></div>`;
        const mes = $('mesCfgCard'); if (mes) mes.insertAdjacentElement('afterend', card); else host.insertBefore(card, host.firstChild);
        const on = $('ospCfgOn'); on.checked = !!cfg.enabled; loadCfg().then(() => { on.checked = !!cfg.enabled; });
        on.addEventListener('change', async () => { try { await saveSettings({ osProEnabled: on.checked }); toast('success', on.checked ? 'Ligado: "Compra de usados" e "Garantias" já estão no menu.' : 'Desligado.'); } catch (e) { on.checked = !on.checked; toast('error', 'Não foi possível salvar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', setupConfig); else setupConfig();

    /* =================== EMPRESA, QR E IMPRESSÃO =================== */
    let coCache = null;
    async function company() {
        if (window.OSX && OSX.company) { try { return await OSX.company(); } catch (e) { } }
        if (coCache) return coCache;
        const d = settings && Object.keys(settings).length ? settings : (((await db.collection('settings').doc(DOC).get().catch(() => null)) || { data: () => ({}) }).data() || {});
        const b = (window.BrandingManager && BrandingManager.getBrand && BrandingManager.getBrand()) || {};
        coCache = { name: (db.__isLocalDemo ? b.companyName : '') || d.nomeFantasia || b.companyName || d.razaoSocial || 'Minha empresa', phone: d.telefone || '', whatsapp: d.whatsapp || d.telefone || '', address: [[d.logradouro, d.numero].filter(Boolean).join(', '), d.bairro, [d.cidade, d.uf].filter(Boolean).join(' - ')].filter(Boolean).join(' · '), logoUrl: db.__isLocalDemo ? (b.logoUrl || '') : (d.logoUrl || b.logoUrl || ''), cnpj: d.cnpj || '', legal: d.razaoSocial || '' };
        return coCache;
    }
    async function companyFull() {
        const c = { ...(await company()) };
        if (!c.cnpj || !c.legal) { try { const d = (await db.collection('settings').doc(DOC).get()).data() || {}; c.cnpj = c.cnpj || d.cnpj || ''; c.legal = c.legal || d.razaoSocial || ''; } catch (e) { } }
        return c;
    }
    async function qr(text, cell) { if (window.OSX && OSX.qrSvg) { try { return await OSX.qrSvg(text, cell || 3); } catch (e) { } } return ''; }
    function openWin(w, h) { const win = window.open('', '_blank', `width=${w || 900},height=${h || 1000}`); if (!win) toast('warning', 'Libere as janelas pop-up para imprimir.'); return win; }
    // 36.7 · Mesmo visual do orçamento em A4 (fonte Inter, barra roxa #4f46e5, caixas e assinaturas iguais)
    const A4CSS = `@page{size:A4;margin:12mm}*{box-sizing:border-box}body{margin:0;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a;font-size:12px;background:#f1f5f9}.page{max-width:210mm;margin:0 auto;background:#fff;padding:14mm 13mm;min-height:297mm}
.hd{display:flex;justify-content:space-between;align-items:flex-start;gap:16px;border-bottom:3px solid #4f46e5;padding-bottom:12px}.co{display:flex;gap:12px;align-items:center}.co img{max-height:58px;max-width:150px;object-fit:contain}.co h1{margin:0;font-size:19px}.co p{margin:2px 0 0;color:#475569;font-size:10.5px;line-height:1.45}
.doc{text-align:right;white-space:nowrap}.doc .t{font-size:11px;letter-spacing:2px;color:#4f46e5;font-weight:800}.doc .n{font-size:24px;font-weight:900}.doc p{margin:2px 0;color:#475569;font-size:10.5px}
.st{display:inline-block;margin-top:4px;padding:3px 9px;border-radius:99px;background:#eef2ff;color:#4338ca;font-weight:800;font-size:10px;text-transform:uppercase;letter-spacing:.5px}
.box{margin-top:14px;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;display:grid;grid-template-columns:1fr 1fr;gap:6px 18px;break-inside:avoid}.box h3{grid-column:1/-1;margin:0 0 1px;font-size:9.5px;letter-spacing:1.2px;color:#4f46e5;text-transform:uppercase}
.l{font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;font-weight:700}.v{font-size:12.5px;font-weight:600;overflow-wrap:anywhere}
.big{margin-top:14px;padding:14px 16px;border-radius:12px;background:#eef2ff;border:1px solid #c7d2fe;display:flex;justify-content:space-between;align-items:center;gap:14px;break-inside:avoid}.big b{font-size:20px;color:#4f46e5}
.terms{margin-top:14px;font-size:10.5px;line-height:1.55;color:#334155;white-space:pre-wrap;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px}.terms b{display:block;font-size:9.5px;color:#64748b;text-transform:uppercase;letter-spacing:.6px;margin-bottom:4px}
.ck{width:100%;border-collapse:collapse;margin-top:6px;font-size:11px}.ck td{padding:4px 6px;border-bottom:1px solid #eef2f7}.ck .ok{color:#16a34a;font-weight:700}.ck .fail{color:#dc2626;font-weight:700}.ck .na{color:#94a3b8}
.sign{display:flex;gap:40px;margin-top:46px;break-inside:avoid}.sign div{flex:1;border-top:1px solid #0f172a;text-align:center;padding-top:5px;font-size:10.5px;color:#475569}.sign img{display:block;max-height:60px;margin:0 auto -6px}
.qr{text-align:center}.qr svg{width:28mm;height:28mm}.qr small{display:block;font-size:8.5px;color:#64748b;word-break:break-all;max-width:60mm}
.ft{margin-top:16px;text-align:center;color:#94a3b8;font-size:9.5px}
.bar{position:sticky;top:0;background:#0f172a;padding:10px;text-align:center}.bar button{font:700 13px Arial;padding:9px 18px;border-radius:8px;border:0;background:#4f46e5;color:#fff;cursor:pointer}
@media print{body{background:#fff}.page{padding:0;min-height:0}.bar{display:none}}`;
    function writeA4(win, title, inner) { if (!win) return; win.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(title)}</title><style>${A4CSS}</style></head><body><div class="bar"><button onclick="window.print()">🖨️ Imprimir / Salvar PDF</button></div><div class="page">${inner}</div></body></html>`); win.document.close(); win.focus(); }
    const DEFAULT_TERMS = 'A garantia cobre exclusivamente o serviço executado e as peças substituídas descritas neste certificado, pelo prazo indicado, contado a partir da data de entrega do aparelho.\nNão estão cobertos: quedas, batidas, contato com líquidos ou umidade, oxidação, tela trincada após a entrega, mau uso, aparelho aberto ou reparado por terceiros, e defeitos diferentes do serviço realizado.\nPara usar a garantia, apresente este certificado (ou informe o IMEI/CPF) na loja. O atendimento em garantia é feito sem cobrança quando o defeito for o mesmo do serviço realizado.';

    async function printCertificate(osId) {
        const win = openWin();
        try {
            const s = await db.collection('service_orders').doc(osId).get(); if (!s.exists) throw new Error('OS não encontrada.');
            const o = { id: osId, ...s.data() };
            const days = Number(o.warrantyDays || 0), from = toMs(o.deliveredAt) || toMs(o.readyAt) || Date.now(), until = from + days * 864e5;
            let cust = {}; try { if (o.customerId) { const c = await db.collection('customers').doc(o.customerId).get(); cust = c.exists ? (c.data() || {}) : {}; } } catch (e) { }
            const co = await companyFull();
            let url = '', svg = '';
            if (!LAN && window.OSX && OSX.ensureTracking) { try { url = await OSX.ensureTracking(osId); svg = await qr(url, 3); } catch (e) { } }
            const terms = (settings.warrantyTerms || DEFAULT_TERMS);
            const contact = [co.cnpj && 'CNPJ: ' + co.cnpj, co.phone && 'Tel: ' + co.phone, co.whatsapp && co.whatsapp !== co.phone && 'WhatsApp: ' + co.whatsapp].filter(Boolean).map(esc).join(' · ');
            const custPhone = cust.phone || cust.telefone || cust.whatsapp || cust.celular || '';
            writeA4(win, 'Certificado de garantia ' + osNum(o), `
<div class="hd"><div class="co">${co.logoUrl ? `<img src="${esc(co.logoUrl)}" alt="">` : ''}<div><h1>${esc(co.name)}</h1><p>${co.legal && co.legal !== co.name ? esc(co.legal) + '<br>' : ''}${contact}${co.address ? '<br>' + esc(co.address) : ''}</p></div></div>
<div class="doc"><div class="t">CERTIFICADO DE GARANTIA</div><div class="n">Nº ${osNum(o).replace(/^#/, '')}</div><p>Emitido em ${brDate(Date.now())}</p><p>Válido até <b>${brDate(until)}</b></p><span class="st">${days} dias de garantia</span></div></div>
<div class="box"><h3>Cliente</h3><div><div class="l">Cliente</div><div class="v">${esc(o.customerName || cust.name || '—')}</div></div><div><div class="l">Telefone</div><div class="v">${esc(custPhone || '—')}</div></div><div><div class="l">CPF / CNPJ</div><div class="v">${esc(cust.document || cust.cpf || cust.cpfCnpj || '—')}</div></div>${o.technicianName ? `<div><div class="l">Técnico responsável</div><div class="v">${esc(o.technicianName)}</div></div>` : ''}</div>
<div class="box"><h3>Aparelho e serviço</h3><div><div class="l">Aparelho</div><div class="v">${esc(device(o) || '—')}</div></div><div><div class="l">IMEI / Série</div><div class="v">${esc([o.imei, o.serial].filter(Boolean).join(' · ') || '—')}</div></div>
<div style="grid-column:1/-1"><div class="l">Serviço executado</div><div class="v">${esc(o.serviceDescription || o.diagnosis || o.problemReported || '—')}</div></div>${o.partsDescription ? `<div style="grid-column:1/-1"><div class="l">Peças substituídas</div><div class="v">${esc(o.partsDescription)}</div></div>` : ''}<div><div class="l">Entrega do aparelho</div><div class="v">${brDate(from)}</div></div><div><div class="l">Ordem de serviço</div><div class="v">${esc(osNum(o))}</div></div></div>
<div class="big"><div><div class="l">Prazo da garantia</div><b>${days} dias</b><div style="font-size:12px;margin-top:4px">de <b>${brDate(from)}</b> até <b>${brDate(until)}</b></div></div>${svg ? `<div class="qr">${svg}<small>Consulte pelo celular</small></div>` : ''}</div>
<div class="terms"><b>Condições da garantia</b>${esc(terms)}</div>
<div class="sign"><div>${esc(co.name)}</div><div>${o.checklistOut && o.checklistOut.signature ? `<img src="${o.checklistOut.signature}" alt="">` : ''}De acordo — ${esc(o.customerName || 'Cliente')}</div></div>
<div class="ft">Apresente este certificado (ou informe o IMEI/CPF) para atendimento em garantia. ${esc(co.name)}${co.phone ? ' · ' + esc(co.phone) : ''}</div>`);
        } catch (e) { win && win.close(); toast('error', e.message); }
    }

    /* =================== RESPOSTAS DOS CLIENTES (todas as páginas) =================== */
    let inboxBusy = false;
    async function relay(action, body) {
        const r = await fetch('api/os-relay.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
        let d = null; try { d = await r.json(); } catch (e) { } if (!r.ok || !d || d.ok === false) throw new Error((d && d.error) || 'Serviço indisponível.'); return d;
    }
    async function pollInbox() {
        if (LAN || inboxBusy || document.hidden) return; inboxBusy = true;
        try {
            let items = [];
            if (backend === 'demo') {
                const tokens = (await db.collection('service_orders').get()).docs.map(d => d.data() || {}).filter(o => o.trackingToken && !o.deleted && !['cancelled'].includes(o.status)).map(o => o.trackingToken).slice(0, 120);
                if (tokens.length) items = (await relay('inbox.poll', { tokens })).items || [];
            } else {
                const s = await db.collection('os_client_inbox').where('processed', '==', false).limit(20).get();
                items = s.docs.map(d => ({ _id: d.id, ...d.data() }));
            }
            for (const it of items) { try { await applyResponse(it); } catch (e) { console.warn('Resposta do cliente:', e); } }
        } catch (e) { if (!/permission|insufficient|não autenticado|401/i.test(String(e && e.message))) console.warn('Respostas dos clientes:', e); }
        finally { inboxBusy = false; }
    }
    async function dropInbox(it) { if (!it._id) return; try { await db.collection('os_client_inbox').doc(it._id).delete(); } catch (e) { try { await db.collection('os_client_inbox').doc(it._id).set({ processed: true }, { merge: true }); } catch (er) { } } }
    async function applyResponse(it) {
        const snap = await db.collection('service_orders').where('trackingToken', '==', String(it.token || '')).limit(1).get();
        if (snap.empty) { await dropInbox(it); return; }
        const d = snap.docs[0], o = { id: d.id, ...d.data() }, now = Date.now(), who = it.name || firstName(o.customerName);
        const hist = Array.isArray(o.statusHistory) ? o.statusHistory.slice() : [];
        const patch = { updatedAt: ts() }; let kind = it.type;
        if (it.type === 'approve' || it.type === 'reject') {
            const decision = it.type === 'approve' ? 'approved' : 'rejected';
            patch.clientApproval = { decision, at: now, name: it.name || '', note: it.note || '', signature: it.signature || '', via: 'link' };
            if (decision === 'approved' && ['received', 'analyzing', 'awaiting_approval'].includes(o.status)) { patch.status = 'approved'; patch.approvedAt = ts(); hist.push({ status: 'approved', label: 'Orçamento aprovado pelo cliente (link)', at: nowIso(), by: who, uid: '' }); }
            else hist.push({ status: o.status, label: decision === 'approved' ? 'Cliente aprovou o orçamento (link)' : 'Cliente recusou o orçamento (link)' + (it.note ? ': ' + it.note : ''), at: nowIso(), by: who, uid: '' });
        } else if (it.type === 'sign_in' || it.type === 'sign_out') {
            const key = it.type === 'sign_in' ? 'checklistIn' : 'checklistOut';
            patch[key] = { ...(o[key] || {}), signature: it.signature || '', signedAt: now, signedName: it.name || '', signedVia: 'link' };
            // 38.4 · Entrada assinada pelo link: guarda o termo que o cliente viu (o da OS ou o padrão da loja)
            if (it.type === 'sign_in' && !patch[key].termsText && window.OSB) { const t = OSB.termsFor(o); if (t) { patch[key].termsText = t; patch[key].termsAt = now; } }
            hist.push({ status: o.status, label: (it.type === 'sign_in' ? 'Checklist de entrada' : 'Checklist de saída') + ' assinado pelo cliente (link)', at: nowIso(), by: who, uid: '' });
        } else { await dropInbox(it); return; }
        patch.statusHistory = hist;
        await db.collection('service_orders').doc(o.id).update(patch);
        await dropInbox(it);
        const next = { ...o, ...patch };
        try { await patchTracking(next); } catch (e) { console.warn('Acompanhamento:', e); }
        notify(kind, next, it);
        if (typeof loadServiceOrders === 'function' && $('osTbody')) { try { await loadServiceOrders(); } catch (e) { } }
    }
    async function patchTracking(o) {
        if (!o.trackingToken || LAN) return;
        const extra = { status: o.status, statusLabel: STATUS_TXT[o.status] || o.status, history: (o.statusHistory || []).slice(-20).map(h => ({ label: h.label || STATUS_TXT[h.status] || 'Atualização', status: h.status || '', at: toMs(h.at) })), approval: o.clientApproval ? { decision: o.clientApproval.decision, at: toMs(o.clientApproval.at), name: o.clientApproval.name || '' } : null, checkIn: checkSummary(o.checklistIn), checkOut: checkSummary(o.checklistOut), publishedAt: Date.now() };
        if (backend === 'demo') { const cur = (await relay('track.get', { token: o.trackingToken })).tracking; if (cur) await relay('track.publish', { token: o.trackingToken, data: { ...cur, ...extra } }); }
        else await db.collection('os_tracking').doc(o.trackingToken).set(extra, { merge: true });
    }

    /* ---------- aviso para a equipe ---------- */
    const AKEY = 'dp_ospro_alerts';
    const alerts = () => { try { return JSON.parse(localStorage.getItem(AKEY) || '[]'); } catch (e) { return []; } };
    const saveAlerts = a => { try { localStorage.setItem(AKEY, JSON.stringify(a.slice(-12))); } catch (e) { } };
    function chime() { try { const A = window.AudioContext || window.webkitAudioContext; if (!A) return; const c = new A(), t = c.currentTime + .02; [[880, 0], [1320, .16]].forEach(([f, d]) => { const o = c.createOscillator(), g = c.createGain(); o.frequency.value = f; g.gain.setValueAtTime(.0001, t + d); g.gain.exponentialRampToValueAtTime(.25, t + d + .02); g.gain.exponentialRampToValueAtTime(.0001, t + d + .5); o.connect(g).connect(c.destination); o.start(t + d); o.stop(t + d + .55); }); } catch (e) { } }
    function notify(kind, o, it) {
        const txt = { approve: '✅ Cliente APROVOU o orçamento', reject: '❌ Cliente RECUSOU o orçamento', sign_in: '✍️ Cliente assinou o checklist de entrada', sign_out: '✍️ Cliente assinou o checklist de saída' }[kind] || 'Resposta do cliente';
        const a = alerts(); a.push({ id: o.id + ':' + Date.now(), osId: o.id, kind, title: txt, os: osNum(o), customer: o.customerName || '', device: device(o), total: Number(o.total || 0), note: it.note || '', techId: o.technicianId || '', tech: o.technicianName || '', at: Date.now() });
        saveAlerts(a); chime(); toast(kind === 'reject' ? 'warning' : 'success', `${txt} · ${osNum(o)} ${o.customerName || ''}`); paintAlerts();
        try { if (window.Notification && Notification.permission === 'granted') new Notification(txt, { body: `${osNum(o)} · ${o.customerName || ''} · ${device(o)}` }); } catch (e) { }
    }
    let techPhones = null;
    async function techPhone(id) {
        if (!id) return '';
        if (!techPhones) { techPhones = {}; try { (await db.collection('users').get()).docs.forEach(d => { const u = d.data() || {}; techPhones[d.id] = u.whatsapp || u.phone || u.telefone || ''; }); } catch (e) { } }
        return waPhone(techPhones[id]);
    }
    async function paintAlerts() {
        document.getElementById('ospAlerts')?.remove();
        const list = alerts(); if (!list.length) return;
        const el = document.createElement('div'); el.id = 'ospAlerts';
        const rows = [];
        for (const a of list.slice().reverse()) {
            const ph = await techPhone(a.techId);
            const msg = `${a.title.replace(/^[^ ]+ /, '')}: ${a.os} · ${a.customer} · ${a.device}${a.total ? ' · ' + money(a.total) : ''}${a.note ? ' · Motivo: ' + a.note : ''}`;
            // 37.7 · ícone de traço conforme a resposta (o título guardado continua com o emoji, usado na mensagem do WhatsApp)
            const aic = window.dpIcon ? dpIcon({ approve: 'circle-check', reject: 'circle-x', sign_in: 'signature', sign_out: 'signature' }[a.kind] || 'bell') + ' ' : '';
            rows.push(`<li class="${a.kind}"><b>${aic}${esc(String(a.title || '').replace(/^[^\p{L}\p{N}]+/u, ''))}</b><small>${esc(a.os)} · ${esc(a.customer)} · ${esc(a.device)}${a.total ? ' · ' + money(a.total) : ''} · ${brDate(a.at, true)}</small>${a.note ? `<small>Motivo: ${esc(a.note)}</small>` : ''}<span><a href="ordens-servico.html?os=${encodeURIComponent(a.osId)}">Abrir OS</a>${ph ? ` · <a href="https://wa.me/${ph}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener">Avisar ${esc(firstName(a.tech))} no WhatsApp</a>` : ''} · <a href="#" data-ok="${esc(a.id)}">OK</a></span></li>`);
        }
        el.innerHTML = `<header><span class="dpi-lbl">${window.dpIcon ? dpIcon('bell') : ''}Respostas dos clientes</span> <button type="button" data-all aria-label="Fechar">×</button></header><ul>${rows.join('')}</ul>`;
        el.addEventListener('click', e => {
            const ok = e.target.closest('[data-ok]'); if (ok) { e.preventDefault(); saveAlerts(alerts().filter(x => x.id !== ok.dataset.ok)); paintAlerts(); return; }
            if (e.target.closest('[data-all]')) { saveAlerts([]); el.remove(); }
        });
        document.body.appendChild(el);
    }
    function startInbox() {
        if (LAN) return;
        // Firebase: escuta em tempo real (só gasta leitura quando chega resposta); demo e MySQL: consulta a cada 30 s
        if (backend === 'firebase') {
            try { db.collection('os_client_inbox').where('processed', '==', false).limit(20).onSnapshot(s => { if (!s.empty) pollInbox(); }, () => { }); return; } catch (e) { }
        }
        pollInbox(); setInterval(pollInbox, 30000);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) pollInbox(); });
    }
    try { auth.onAuthStateChanged(u => { if (u && !window.__ospInbox) { window.__ospInbox = true; loadCfg().then(syncMenu); setTimeout(startInbox, 2500); } }); } catch (e) { }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paintAlerts); else paintAlerts();

    /* =================== WHATSAPP POR ETAPA =================== */
    async function customerPhone(o) {
        let c = (typeof osCustomers !== 'undefined' && Array.isArray(osCustomers) ? osCustomers : []).find(x => x.id === o.customerId);
        if (!c && o.customerId) { try { const s = await db.collection('customers').doc(o.customerId).get(); c = s.exists ? s.data() : null; } catch (e) { } }
        return waPhone(c && (c.whatsapp || c.phone || c.telefone || c.celular));
    }
    async function templates(o) {
        const co = await company(); let url = '';
        if (!LAN && window.OSX && OSX.ensureTracking) { try { url = await OSX.ensureTracking(o.id); } catch (e) { } }
        const n = firstName(o.customerName), dev = devTxt(o), loja = co.name ? ` na ${co.name}` : '', link = url ? `\n\nAcompanhe por aqui: ${url}` : '';
        const until = toMs(o.deliveredAt) && Number(o.warrantyDays) ? brDate(toMs(o.deliveredAt) + Number(o.warrantyDays) * 864e5) : '';
        const veh = !!(window.DPTerm && DPTerm.isVehicle(o)); // 38.1 · oficina: "seu veículo", "serviço iniciado"
        return [
            ['received', veh ? 'Recebemos o veículo' : 'Recebemos o aparelho', `Olá, ${n}! Recebemos o seu ${dev}${loja} (${osNum(o)}). Vamos analisar e te avisamos com o orçamento.${link}`],
            ['awaiting_approval', '💰 Orçamento para aprovar', `Olá, ${n}! O orçamento do seu ${dev} (${osNum(o)}) ficou em *${money(o.total)}*${o.serviceDescription ? ` — ${o.serviceDescription}` : ''}.\n\n${url ? `Para *aprovar ou recusar*, é só tocar no link:\n${url}` : 'Responda esta mensagem para aprovar ou recusar.'}`],
            ['approved', veh ? 'Serviço iniciado' : 'Reparo iniciado', `Olá, ${n}! Orçamento aprovado. Já começamos ${veh ? 'o serviço no' : 'o reparo do'} seu ${dev} (${osNum(o)}).${o.estimatedDate ? ` Previsão: ${brDate(toMs(o.estimatedDate))}.` : ''}${link}`],
            // 38.4 · "Aguardando peça (previsão dd/mm)" (os-bancada-v1.js)
            ...(window.OSB && (o.status === 'awaiting_parts' || (o.partsOrder && !o.partsOrder.receivedAt)) ? [OSB.waTemplate(o, n, dev, link)] : []),
            ['ready', veh ? 'Veículo pronto' : 'Aparelho pronto', `Olá, ${n}! Seu ${dev} está *pronto* para retirada${loja}. 🎉${Number(o.total) ? `\nValor: *${money(o.total)}*` : ''}\n${osNum(o)}${link}`],
            ['remind', '⏰ Lembrete de retirada', `Olá, ${n}! Passando para lembrar que o seu ${dev} (${osNum(o)}) está pronto e aguardando retirada${loja}.`],
            ['delivered', '🙏 Obrigado + garantia', `Olá, ${n}! Obrigado pela confiança. O serviço do seu ${dev} tem garantia de ${Number(o.warrantyDays || 0)} dias${until ? ` (até ${until})` : ''}. Qualquer coisa, é só chamar!${link}`]
        ];
    }
    async function openWhats(osId) {
        const o = await getOs(osId); if (!o) return;
        const [ph, list] = await Promise.all([customerPhone(o), templates(o)]);
        const cur = o.status === 'delivered' ? 'delivered' : o.status === 'ready' ? 'ready' : o.status === 'awaiting_parts' ? 'awaiting_parts' : ['approved', 'in_progress'].includes(o.status) ? 'approved' : o.status === 'awaiting_approval' ? 'awaiting_approval' : 'received';
        const ov = dlg(`<h3><i class="fab fa-whatsapp" style="color:#25d366"></i> Mensagem para ${esc(firstName(o.customerName))}</h3><p class="osp-sub">${esc(osNum(o))} · ${esc(device(o))}${ph ? '' : ' · <b style="color:var(--warning)">cliente sem telefone: escolha o contato no WhatsApp</b>'}</p>
<div class="osp-tpls">${list.map(([k, t, m]) => `<button type="button" class="osp-tpl${k === cur ? ' on' : ''}" data-k="${k}"><b>${window.dpIcon ? dpIcon({ received: 'inbox', awaiting_approval: 'circle-dollar-sign', approved: 'wrench', awaiting_parts: 'package-open', ready: 'circle-check', remind: 'clock', delivered: 'handshake' }[k] || 'message-circle') + ' ' : ''}${esc(t.replace(/^[^\p{L}\p{N}]+/u, ''))}</b><small>${esc(m.slice(0, 120))}${m.length > 120 ? '…' : ''}</small></button>`).join('')}</div>`);
        ov.addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (!b) return; const m = list.find(x => x[0] === b.dataset.k)[2]; window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(m), '_blank', 'noopener'); ov.remove(); });
    }
    async function askApproval(osId) {
        const o = await getOs(osId); if (!o) return;
        if (!(Number(o.total) > 0)) { toast('warning', 'Informe os valores (mão de obra/peças) antes de pedir a aprovação.'); return; }
        if (LAN) { toast('info', 'Na versão offline o link de aprovação não está disponível: use a mensagem de WhatsApp.'); return openWhats(osId); }
        try {
            if (['received', 'analyzing'].includes(o.status)) {
                const hist = Array.isArray(o.statusHistory) ? o.statusHistory.slice() : []; hist.push({ status: 'awaiting_approval', label: 'Orçamento enviado para aprovação', at: nowIso(), by: uname(), uid: auth.currentUser?.uid || '' });
                await db.collection('service_orders').doc(osId).update({ status: 'awaiting_approval', statusHistory: hist, updatedAt: ts() });
                if (typeof loadServiceOrders === 'function') await loadServiceOrders();
            }
            const fresh = await getOs(osId); const ph = await customerPhone(fresh); const list = await templates(fresh);
            window.open('https://wa.me/' + ph + '?text=' + encodeURIComponent(list.find(x => x[0] === 'awaiting_approval')[2]), '_blank', 'noopener');
            toast('success', 'Orçamento enviado. Quando o cliente responder, a OS muda sozinha e você é avisado.');
        } catch (e) { toast('error', 'Não foi possível enviar: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); }
    }
    async function getOs(id) {
        const local = (typeof serviceOrders !== 'undefined' && Array.isArray(serviceOrders)) ? serviceOrders.find(x => x.id === id) : null;
        try { const s = await db.collection('service_orders').doc(id).get(); return s.exists ? { id, ...s.data() } : local; } catch (e) { return local; }
    }
    function dlg(inner, wide) {
        document.getElementById('ospDlg')?.remove();
        const ov = document.createElement('div'); ov.className = 'osp-ov'; ov.id = 'ospDlg';
        ov.innerHTML = `<div class="osp-dlg${wide ? ' wide' : ''}"><button type="button" class="osp-x" aria-label="Fechar">×</button>${inner}</div>`;
        ov.addEventListener('mousedown', e => { if (e.target === ov) ov.remove(); });
        ov.querySelector('.osp-x').onclick = () => ov.remove();
        document.body.appendChild(ov); return ov;
    }

    /* =================== ASSINATURA NA TELA =================== */
    function sigPad(canvas) {
        const g = canvas.getContext('2d'); let drawing = false, dirty = false, last = null;
        const r = canvas.getBoundingClientRect(), s = window.devicePixelRatio || 1; canvas.width = Math.round(r.width * s); canvas.height = Math.round(r.height * s); g.setTransform(s, 0, 0, s, 0, 0); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a';
        const pt = e => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
        canvas.addEventListener('pointerdown', e => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (er) { } drawing = true; last = pt(e); g.beginPath(); g.arc(last.x, last.y, 1.1, 0, 7); g.fillStyle = '#0f172a'; g.fill(); dirty = true; });
        canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pt(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; dirty = true; });
        ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => canvas.addEventListener(ev, () => { drawing = false; }));
        return { clear() { g.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }, empty: () => !dirty, data() { const c = document.createElement('canvas'), w = 600, h = Math.round(600 * canvas.height / canvas.width); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(canvas, 0, 0, w, h); return c.toDataURL('image/png'); } };
    }
    function signOnScreen(title, text, defName, extra) {
        return new Promise(resolve => {
            const ov = dlg(`<h3><i class="fas fa-signature"></i> ${esc(title)}</h3><p class="osp-sub">${text}</p>${extra || ''}<label class="osp-lbl">Nome de quem assina<input class="form-input" data-nm maxlength="80" value="${esc(defName || '')}"></label><label class="osp-lbl">Assinatura (dedo, caneta ou mouse)</label><canvas class="osp-pad"></canvas>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-clear><i class="fas fa-eraser"></i> Limpar</button><button type="button" class="btn btn-primary" data-ok><i class="fas fa-check"></i> Confirmar assinatura</button></div>`, true);
            const pad = sigPad(ov.querySelector('canvas'));
            ov.querySelector('[data-clear]').onclick = () => pad.clear();
            ov.querySelector('[data-ok]').onclick = () => { const nm = ov.querySelector('[data-nm]').value.trim(); if (!nm) { toast('warning', 'Informe o nome de quem assina.'); return; } if (pad.empty()) { toast('warning', 'Faça a assinatura no quadro.'); return; } const out = { signature: pad.data(), signedName: nm }; ov.remove(); resolve(out); };
            ov.querySelector('.osp-x').addEventListener('click', () => resolve(null));
        });
    }

    window.OSPRO = { CHECK_ITEMS, DEFAULT_MODELS, ckModels, pickCkModel, checkSummary,printCertificate, openWhats, askApproval, signOnScreen, sigPad, company: companyFull, dlg, loadCfg, get cfg() { return cfg; }, get settings() { return settings; }, saveSettings, DEFAULT_TERMS, qr, writeA4, osNum, device, toMs, brDate };

    /* =================== TELA DE ORDENS DE SERVIÇO =================== */
    if (!$('osModal')) return;
    // list = itens do checklist desta OS (iguais na entrada e na saída); model = tipo de aparelho.
    // auto = segue o "Tipo de equipamento" enquanto nada foi marcado; edit = modo "Editar itens".
    let ck = { osId: null, in: {}, out: {}, list: [], model: '', modelName: '', battery: true, auto: true, edit: false }, ckTab = 'in';
    const blankCk = () => ({ items: {}, battery: '', notes: '' });
    const hasMarks = c => !!(c && ((c.items && Object.keys(c.items).length) || c.signature));
    const devText = () => [$('osBrand')?.value, $('osModel')?.value].filter(Boolean).join(' ');
    function useModel(m, auto) {
        ck.model = m.id; ck.modelName = m.name; ck.battery = !!m.battery; ck.gauge = m.gaugeLabel || ''; ck.list = m.items.map(x => ci(x.k, x.l)); ck.auto = !!auto;
        const keys = new Set(ck.list.map(x => x.k));
        for (const c of [ck.in, ck.out]) for (const k of Object.keys(c.items || {})) if (!keys.has(k)) delete c.items[k];
    }
    const T = (k, d) => (window.DPTerm ? DPTerm(k) : d); // 38.1 · palavra do ramo (oficina: veículo)
    function ckHtml() {
        return `<section class="os-section osp-ck" id="ospCheck"><div class="os-section-title"><span class="os-section-icon"><i class="fas fa-list-check"></i></span><div><strong>Checklist técnico</strong><small>${T('teste_ck', 'Teste o aparelho na entrada e na saída. O cliente assina e você fica protegido contra "já veio assim".')}</small></div></div>
<div class="osp-model"><label class="osp-model-l" for="ospModel">${T('Tipo de aparelho', 'Tipo de aparelho')}</label><select class="form-control" id="ospModel"></select><button type="button" class="btn btn-outline btn-sm" data-ck-edit><i class="fas fa-pen"></i> <span>Editar itens</span></button></div>
<div class="osp-tabs"><button type="button" data-ck-tab="in" class="on"><i class="fas fa-right-to-bracket"></i> Entrada</button><button type="button" data-ck-tab="out"><i class="fas fa-right-from-bracket"></i> Saída</button><span class="osp-tools"><button type="button" class="btn btn-outline btn-sm" data-ck-all>Tudo OK</button><button type="button" class="btn btn-outline btn-sm" data-ck-copy hidden>Copiar da entrada</button></span></div>
<div class="osp-grid" id="ospGrid"></div>
<div class="osp-edit" id="ospEdit" hidden></div>
<div class="osp-row2"><label class="osp-lbl" id="ospBatteryL"><span id="ospGaugeT">Saúde da bateria (%)</span><input class="form-control" id="ospBattery" inputmode="numeric" maxlength="3" placeholder="Ex.: 87"></label><label class="osp-lbl" style="flex:2">Observações do teste<input class="form-control" id="ospNotes" maxlength="300" placeholder="Ex.: tela com risco no canto superior, sem película"></label></div>
<div class="osp-sig" id="ospSig"></div></section>`;
    }
    function ensureCk() {
        let sec = $('ospCheck'); if (sec) return sec;
        const body = document.querySelector('#osModal .os-modal-body'); if (!body) return null;
        const after = $('osxSection') || body.querySelectorAll('.os-section')[1] || body.querySelector('.os-section');
        const w = document.createElement('div'); w.innerHTML = ckHtml(); sec = w.firstElementChild;
        after ? after.after(sec) : body.appendChild(sec);
        sec.addEventListener('click', onCkClick);
        sec.addEventListener('input', e => { const c = ck[ckTab]; if (e.target.id === 'ospBattery') { c.battery = e.target.value.replace(/\D/g, '').slice(0, 3); c._dirty = true; } if (e.target.id === 'ospNotes') { c.notes = e.target.value; c._dirty = true; } });
        sec.addEventListener('change', e => { if (e.target.id === 'ospModel') changeModel(e.target.value); if (e.target.id === 'ospEdBattery') edBattery(e.target.checked); if (e.target.id === 'ospEdMatch') edMatch(e.target.value); });
        sec.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.id === 'ospNewItem') { e.preventDefault(); edAdd(); } });
        // Escreveu "Notebook" no tipo de equipamento: o checklist troca sozinho (enquanto nada foi marcado).
        ['osDeviceType', 'osBrand', 'osModel'].forEach(id => $(id)?.addEventListener('input', () => {
            if (!ck.auto || hasMarks(ck.in) || hasMarks(ck.out)) return;
            const m = pickCkModel($('osDeviceType')?.value, devText()); if (m && m.id !== ck.model) { useModel(m, true); paintCk(); }
        }));
        return sec;
    }
    const stateBtns = (v) => `<div class="osp-3"><button type="button" data-v="ok" class="${v === 'ok' ? 'on' : ''}" title="Funcionando">✓</button><button type="button" data-v="fail" class="${v === 'fail' ? 'on' : ''}" title="Com defeito">✗</button><button type="button" data-v="na" class="${v === 'na' ? 'on' : ''}" title="Não testado">–</button></div>`;
    function paintEdit() {
        const box = $('ospEdit'); if (!box) return;
        box.hidden = !ck.edit; if (!ck.edit) { box.innerHTML = ''; return; }
        const m = ckModels().find(x => x.id === ck.model), isDef = m && DEFAULT_MODELS.some(d => d.id === m.id);
        box.innerHTML = m ? `<div class="osp-edit-h"><b>Editando: ${esc(m.name)}</b><small>Vale para esta OS e para as próximas deste tipo. As OS já salvas não mudam.</small></div>
<div class="osp-edit-add"><input class="form-control" id="ospNewItem" maxlength="60" placeholder="Novo item, ex.: Gaveta de CD"><button type="button" class="btn btn-primary btn-sm" data-ed="add"><i class="fas fa-plus"></i> Adicionar item</button></div>
<label class="osp-edit-chk"><input type="checkbox" id="ospEdBattery"${m.battery ? ' checked' : ''}> Pedir ${m.gaugeLabel ? 'o nível de ' + esc(m.gaugeLabel.toLowerCase()) : 'a saúde da bateria'} (%)</label>
<label class="osp-lbl">Escolher este tipo sozinho quando o "Tipo de equipamento" tiver (separe por vírgula)<input class="form-control" id="ospEdMatch" maxlength="300" value="${esc(m.match.join(', '))}" placeholder="ex.: impressora, multifuncional"></label>
<div class="osp-edit-acts"><button type="button" class="btn btn-outline btn-sm" data-ed="new"><i class="fas fa-plus"></i> Novo tipo de aparelho</button><button type="button" class="btn btn-outline btn-sm" data-ed="rename">Renomear tipo</button>${isDef ? '<button type="button" class="btn btn-outline btn-sm" data-ed="reset">Restaurar itens padrão</button>' : ''}<button type="button" class="btn btn-outline btn-sm osp-danger" data-ed="delete"><i class="fas fa-trash"></i> Excluir tipo</button><button type="button" class="btn btn-primary btn-sm" data-ed="done"><i class="fas fa-check"></i> Concluir</button></div>`
            : `<div class="osp-edit-h"><b>Este tipo de aparelho foi excluído.</b><small>Escolha outro tipo acima ou crie um novo.</small></div><div class="osp-edit-acts"><button type="button" class="btn btn-outline btn-sm" data-ed="new"><i class="fas fa-plus"></i> Novo tipo de aparelho</button><button type="button" class="btn btn-primary btn-sm" data-ed="done">Concluir</button></div>`;
    }
    function paintCk() {
        const sec = ensureCk(); if (!sec) return;
        const c = ck[ckTab];
        sec.querySelectorAll('[data-ck-tab]').forEach(b => b.classList.toggle('on', b.dataset.ckTab === ckTab));
        sec.querySelector('[data-ck-copy]').hidden = ckTab !== 'out' || ck.edit;
        sec.querySelector('[data-ck-all]').hidden = ck.edit;
        sec.classList.toggle('editing', ck.edit);
        // Tipos de aparelho (+ o desta OS, se ele foi excluído depois)
        const list = ckModels(), sel = $('ospModel');
        sel.innerHTML = list.map(m => `<option value="${esc(m.id)}">${esc(m.name)}</option>`).join('') + (ck.model && !list.some(m => m.id === ck.model) ? `<option value="${esc(ck.model)}">${esc(ck.modelName || 'Tipo desta OS')} (excluído)</option>` : '');
        sel.value = ck.model; sel.disabled = ck.edit;
        const eb = sec.querySelector('[data-ck-edit]'); eb.hidden = ck.edit;
        $('ospGrid').innerHTML = ck.list.map(({ k, l }) => {
            const v = c.items[k] || '';
            return ck.edit ? `<div class="osp-it osp-it-ed" data-k="${esc(k)}"><span>${esc(l)}</span><div class="osp-ed-btns"><button type="button" data-ed="ren-item" title="Renomear item">✎</button><button type="button" data-ed="del-item" title="Tirar este item">✕</button></div></div>`
                : `<div class="osp-it ${v}" data-k="${esc(k)}"><span>${esc(l)}</span>${stateBtns(v)}</div>`;
        }).join('') || '<p class="osp-sub" style="grid-column:1/-1;margin:4px 0">Nenhum item neste tipo. Clique em <b>Editar itens</b> para adicionar.</p>';
        paintEdit();
        $('ospBatteryL').hidden = !(ck.battery || ck.in.battery || ck.out.battery);
        // 38.1 · Veículo: o medidor é o combustível
        if ($('ospGaugeT')) { $('ospGaugeT').textContent = (ck.gauge || 'Saúde da bateria') + ' (%)'; $('ospBattery').placeholder = ck.gauge ? 'Ex.: 25 = 1/4 do tanque' : 'Ex.: 87'; $('ospNotes').placeholder = ck.gauge ? 'Ex.: risco na porta traseira, pneu dianteiro careca' : 'Ex.: tela com risco no canto superior, sem película'; }
        $('ospBattery').value = c.battery || ''; $('ospNotes').value = c.notes || '';
        const o = ck.osId ? (typeof serviceOrders !== 'undefined' ? serviceOrders.find(x => x.id === ck.osId) : null) : null;
        $('ospSig').innerHTML = c.signature
            ? `<div class="osp-signed"><img src="${c.signature}" alt="Assinatura"><div><b>Assinado por ${esc(c.signedName || 'cliente')}</b><small>${brDate(toMs(c.signedAt), true)} · ${c.signedVia === 'link' ? 'pelo celular do cliente' : 'na loja'}</small><button type="button" class="btn btn-outline btn-sm" data-ck-resign>Assinar de novo</button></div></div>`
            : `<div class="osp-sig-ask"><span><i class="fas fa-signature"></i> Assinatura do cliente para o checklist de ${ckTab === 'in' ? 'entrada' : 'saída'}</span><div><button type="button" class="btn btn-primary btn-sm" data-ck-sign><i class="fas fa-pen-nib"></i> Cliente assina na tela</button>${LAN ? '' : `<button type="button" class="btn btn-outline btn-sm" data-ck-link${ck.osId ? '' : ' disabled title="Salve a OS primeiro"'}><i class="fas fa-mobile-screen"></i> Assinar pelo celular dele</button>`}</div></div>`;
        const ap = o && o.clientApproval;
        let apEl = $('ospApproval');
        if (ap && ap.decision) {
            if (!apEl) { apEl = document.createElement('div'); apEl.id = 'ospApproval'; sec.prepend(apEl); }
            apEl.className = 'osp-appr ' + ap.decision;
            apEl.innerHTML = `${ap.signature ? `<img src="${ap.signature}" alt="">` : ''}<div><b>${window.dpIcon ? dpIcon(ap.decision === 'approved' ? 'circle-check' : 'circle-x') + ' ' : ''}${ap.decision === 'approved' ? 'Orçamento aprovado pelo cliente' : 'Orçamento recusado pelo cliente'}</b><small>${esc(ap.name || '')} · ${brDate(toMs(ap.at), true)}${ap.via === 'link' ? ' · pelo link' : ''}${ap.note ? ' · ' + esc(ap.note) : ''}</small></div>`;
        } else if (apEl) apEl.remove();
    }
    /* ---------- tipo de aparelho e edição dos itens (35.30) ---------- */
    const markDirty = () => { ck.in._dirty = true; if (hasMarks(ck.out) || ck.out.battery || ck.out.notes) ck.out._dirty = true; };
    function changeModel(id) {
        const m = ckModels().find(x => x.id === id); if (!m) { paintCk(); return; }
        const keys = new Set(m.items.map(x => x.k));
        const lost = [ck.in, ck.out].reduce((n, c) => n + Object.keys(c.items || {}).filter(k => !keys.has(k)).length, 0);
        if (lost && !window.confirm(`Trocar o checklist para "${m.name}"?\n\n${lost} marcação(ões) de itens que não existem nesse tipo serão apagadas.`)) { paintCk(); return; }
        useModel(m, false); markDirty(); paintCk();
    }
    // Salva os tipos de aparelho (settings) e redesenha. fn mexe na lista; devolve false para cancelar.
    async function editModels(fn, okMsg) {
        const list = ckModels(), m = list.find(x => x.id === ck.model);
        if (fn(list, m) === false) return;
        try { await saveCkModels(list); if (okMsg) toast('success', okMsg); }
        catch (err) { toast('error', 'Não foi possível salvar o tipo de aparelho: ' + (err.message || err)); }
        paintCk();
    }
    function newKey(label, list) {
        const used = new Set([...list.map(x => x.k), ...ck.list.map(x => x.k)]);
        let k = (plain(label).replace(/ /g, '_').slice(0, 24) || 'item'), n = k;
        while (used.has(n)) n = k + '_' + Math.random().toString(36).slice(2, 5);
        return n;
    }
    function edAdd() {
        const inp = $('ospNewItem'), label = (inp?.value || '').trim().slice(0, 60);
        if (!label) { toast('warning', 'Escreva o nome do item.'); inp?.focus(); return; }
        editModels((list, m) => {
            if (!m) return false;
            if (m.items.some(x => plain(x.l) === plain(label))) { toast('warning', 'Esse item já está na lista.'); return false; }
            const k = newKey(label, m.items); m.items.push(ci(k, label));
            if (!ck.list.some(x => x.k === k)) ck.list.push(ci(k, label));
            markDirty();
        }, 'Item adicionado.').then(() => $('ospNewItem')?.focus());
    }
    function edBattery(on) { editModels((list, m) => { if (!m) return false; m.battery = !!on; ck.battery = !!on; }, on ? 'A saúde da bateria aparece neste tipo.' : 'Saúde da bateria escondida neste tipo.'); }
    function edMatch(v) { editModels((list, m) => { if (!m) return false; m.match = String(v || '').split(',').map(s => s.trim()).filter(Boolean).slice(0, 30); }, 'Palavras salvas.'); }
    function onEdit(btn) {
        const act = btn.dataset.ed, k = btn.closest('[data-k]')?.dataset.k;
        if (act === 'done') { ck.edit = false; paintCk(); return; }
        if (act === 'add') return edAdd();
        if (act === 'del-item') {
            const marked = [ck.in, ck.out].some(c => c.items && c.items[k]);
            const lbl = (ck.list.find(x => x.k === k) || {}).l || '';
            if (marked && !window.confirm(`Tirar "${lbl}"? A marcação dele nesta OS também sai.`)) return;
            return editModels((list, m) => {
                if (m) m.items = m.items.filter(x => x.k !== k);
                ck.list = ck.list.filter(x => x.k !== k); for (const c of [ck.in, ck.out]) if (c.items) delete c.items[k];
                markDirty();
            }, 'Item retirado.');
        }
        if (act === 'ren-item') {
            const cur = ck.list.find(x => x.k === k); if (!cur) return;
            const nv = (window.prompt('Novo nome do item:', cur.l) || '').trim().slice(0, 60); if (!nv || nv === cur.l) return;
            return editModels((list, m) => { if (m) { const it = m.items.find(x => x.k === k); if (it) it.l = nv; } cur.l = nv; markDirty(); }, 'Item renomeado.');
        }
        if (act === 'new') {
            const name = (window.prompt('Nome do novo tipo de aparelho (ex.: Videogame, Ar-condicionado):', '') || '').trim().slice(0, 40); if (!name) return;
            if (ckModels().some(x => plain(x.name) === plain(name))) { toast('warning', 'Já existe um tipo com esse nome.'); return; }
            const m = { id: 'm' + Date.now().toString(36), name, battery: false, match: [name.toLowerCase()], items: [ci('liga', 'Liga normalmente'), ci('carcaca', 'Carcaça sem danos')] };
            return editModels(list => { list.push(m); }, `Tipo "${name}" criado. Agora adicione os itens.`).then(() => { const saved = ckModels().find(x => x.id === m.id); if (saved) { useModel(saved, false); markDirty(); ck.edit = true; paintCk(); $('ospNewItem')?.focus(); } });
        }
        if (act === 'rename') {
            const m0 = ckModels().find(x => x.id === ck.model); if (!m0) return;
            const name = (window.prompt('Novo nome do tipo de aparelho:', m0.name) || '').trim().slice(0, 40); if (!name || name === m0.name) return;
            return editModels((list, m) => { m.name = name; ck.modelName = name; markDirty(); }, 'Tipo renomeado.');
        }
        if (act === 'reset') {
            const def = DEFAULT_MODELS.find(x => x.id === ck.model); if (!def) return;
            if (!window.confirm(`Voltar "${def.name}" para os itens padrão? Os itens que você criou neste tipo saem.`)) return;
            return editModels((list, m) => { const d = cloneModel(def); m.items = d.items; m.battery = d.battery; m.match = d.match; useModel(m, false); markDirty(); }, 'Itens padrão restaurados.');
        }
        if (act === 'delete') {
            const all = ckModels(), m0 = all.find(x => x.id === ck.model); if (!m0) return;
            if (all.length <= 1) { toast('warning', 'Precisa ficar pelo menos um tipo de aparelho.'); return; }
            if (!window.confirm(`Excluir o tipo "${m0.name}"?\n\nAs OS já salvas com ele continuam iguais.`)) return;
            return editModels(list => { list.splice(list.findIndex(x => x.id === m0.id), 1); }, `Tipo "${m0.name}" excluído.`).then(() => {
                if (!hasMarks(ck.in) && !hasMarks(ck.out)) { useModel(pickCkModel($('osDeviceType')?.value, devText()), false); markDirty(); }
                ck.edit = false; paintCk();
            });
        }
    }
    async function onCkClick(e) {
        const t = e.target.closest('[data-ck-tab]'); if (t) { ckTab = t.dataset.ckTab; paintCk(); return; }
        if (e.target.closest('[data-ck-edit]')) { ck.edit = true; paintCk(); $('ospNewItem')?.focus(); return; }
        const ed = e.target.closest('[data-ed]'); if (ed) { onEdit(ed); return; }
        const c = ck[ckTab];
        const v = e.target.closest('[data-v]'); if (v) { const k = v.closest('[data-k]').dataset.k; c.items[k] = c.items[k] === v.dataset.v ? '' : v.dataset.v; if (!c.items[k]) delete c.items[k]; c._dirty = true; ck.auto = false; paintCk(); return; }
        if (e.target.closest('[data-ck-all]')) { ck.list.forEach(({ k }) => { if (!c.items[k]) c.items[k] = 'ok'; }); c._dirty = true; ck.auto = false; paintCk(); return; }
        if (e.target.closest('[data-ck-copy]')) { ck.out.items = { ...ck.in.items }; ck.out.battery = ck.in.battery; ck.out._dirty = true; paintCk(); return; }
        if (e.target.closest('[data-ck-sign]') || e.target.closest('[data-ck-resign]')) {
            if (!Object.keys(c.items).length) { toast('warning', 'Marque o checklist antes de pedir a assinatura.'); return; }
            const name = $('osCustomer')?.selectedOptions?.[0]?.textContent || '';
            const terms = ckTab === 'in' && window.OSB ? OSB.entryTerms() : ''; // 38.4 · termo de entrada antes de assinar
            const r = await signOnScreen(`Checklist de ${ckTab === 'in' ? 'entrada' : 'saída'}`, ckTab === 'in' ? 'O cliente confirma o estado do aparelho na entrega para o conserto.' + (terms ? ' Ao assinar, também concorda com o termo de entrada abaixo.' : '') : 'O cliente confirma que recebeu o aparelho funcionando conforme o checklist.', name.trim(), terms ? OSB.termsBox(terms) : '');
            if (!r) return;
            Object.assign(c, r, { signedAt: Date.now(), signedVia: 'loja' }, terms ? { termsText: terms, termsAt: Date.now() } : {}); c._dirty = true; paintCk();
            if (ck.osId) { await saveCk(ck.osId); toast('success', 'Assinatura salva na OS.'); } else toast('info', 'Assinatura pronta. Ela será salva junto com a OS.');
            return;
        }
        if (e.target.closest('[data-ck-link]')) {
            if (!ck.osId) return;
            if (!Object.keys(c.items).length) { toast('warning', 'Marque o checklist antes de pedir a assinatura.'); return; }
            // 38.4 · O termo que o cliente vai ver no link fica guardado na OS
            if (ckTab === 'in' && !c.signature && window.OSB) { const t = OSB.entryTerms(); if (t && c.termsText !== t) { c.termsText = t; c.termsAt = Date.now(); c._dirty = true; } }
            await saveCk(ck.osId);
            const o = await getOs(ck.osId);
            let url = ''; try { url = await OSX.ensureTracking(ck.osId); } catch (err) { toast('error', 'Não foi possível gerar o link: ' + (window.dpErroHumano ? dpErroHumano(err) : (err && err.message))); return; }
            const link = url + '&assinar=' + (ckTab === 'in' ? 'entrada' : 'saida'), ph = await customerPhone(o);
            const svg = await qr(link, 4);
            const ov = dlg(`<h3><i class="fas fa-mobile-screen"></i> Assinar pelo celular do cliente</h3><p class="osp-sub">O cliente aponta a câmera para o QR Code (ou abre o link no WhatsApp), confere o checklist e assina com o dedo. A assinatura chega sozinha nesta OS.</p><div class="osp-qr">${svg}</div><input class="form-control" readonly value="${esc(link)}"><div class="osp-acts"><button type="button" class="btn btn-outline" data-cp><i class="fas fa-copy"></i> Copiar</button><a class="btn btn-success" style="background:#25d366;border-color:#25d366;color:#fff" target="_blank" rel="noopener" href="https://wa.me/${ph}?text=${encodeURIComponent(`Olá, ${firstName(o.customerName)}! Confira o checklist do seu ${devTxt(o)} (${osNum(o)}) e assine pelo link:\n${link}`)}"><i class="fab fa-whatsapp"></i> Enviar no WhatsApp</a></div>`);
            ov.querySelector('[data-cp]').onclick = async () => { try { await navigator.clipboard.writeText(link); toast('success', 'Link copiado.'); } catch (er) { prompt('Copie o link:', link); } };
        }
    }
    // 35.30 · Guarda junto a lista de itens e o tipo de aparelho usados nesta OS.
    const strip = c => { const keys = new Set(ck.list.map(x => x.k)), items = {}; for (const [k, v] of Object.entries(c.items || {})) if (keys.has(k)) items[k] = v; const o = { items, battery: c.battery || '', notes: c.notes || '', list: ck.list.map(x => ci(x.k, x.l)), model: ck.model || '', modelName: ck.modelName || '' }; if (ck.gauge) o.gaugeLabel = ck.gauge; if (c.signature) { o.signature = c.signature; o.signedAt = toMs(c.signedAt) || Date.now(); o.signedName = c.signedName || ''; o.signedVia = c.signedVia || 'loja'; } if (c.termsText) { o.termsText = String(c.termsText); if (c.termsAt) o.termsAt = toMs(c.termsAt); } return o; };
    async function saveCk(osId) {
        const patch = {};
        if (ck.in._dirty) patch.checklistIn = strip(ck.in);
        if (ck.out._dirty) patch.checklistOut = strip(ck.out);
        if (!Object.keys(patch).length) return;
        patch.updatedAt = ts();
        await db.collection('service_orders').doc(osId).update(patch);
        ck.in._dirty = ck.out._dirty = false;
        const local = typeof serviceOrders !== 'undefined' ? serviceOrders.find(x => x.id === osId) : null;
        if (local) { if (patch.checklistIn) local.checklistIn = patch.checklistIn; if (patch.checklistOut) local.checklistOut = patch.checklistOut; }
    }

    /* ---------- lista: WhatsApp, aprovação, certificado, garantia ---------- */
    function decorate() {
        const tb = $('osTbody'); if (!tb || typeof serviceOrders === 'undefined') return;
        tb.querySelectorAll('tr').forEach(tr => {
            const act = tr.querySelector('.os-actions'); if (!act) return;
            act.querySelectorAll('.osp-row').forEach(x => x.remove()); tr.querySelectorAll('.osp-badge').forEach(x => x.remove());
            const id = (act.innerHTML.match(/printServiceOrder\('([^']+)'\)/) || [])[1]; if (!id) return;
            const o = serviceOrders.find(x => x.id === id); if (!o || o.status === 'cancelled') return;
            let b = `<button class="btn-icon osp-row osp-wa" title="Mensagem de WhatsApp para o cliente" onclick="OSPRO.openWhats('${esc(id)}')"><i class="fab fa-whatsapp"></i></button>`;
            if (['received', 'analyzing', 'awaiting_approval'].includes(o.status) && Number(o.total) > 0 && !(o.clientApproval && o.clientApproval.decision === 'approved')) b += `<button class="btn-icon osp-row" title="Enviar orçamento para o cliente aprovar pelo celular" onclick="OSPRO.askApproval('${esc(id)}')"><i class="fas fa-file-signature"></i></button>`;
            if (o.status === 'delivered' && Number(o.warrantyDays) > 0) b += `<button class="btn-icon osp-row" title="Certificado de garantia" onclick="OSPRO.printCertificate('${esc(id)}')"><i class="fas fa-shield-halved"></i></button>`;
            if (o.isWarranty && o.status === 'ready') b += `<button class="btn-icon osp-row osp-deliver" title="Entregar (garantia, sem cobrança)" onclick="OSPRO.deliverWarranty('${esc(id)}')"><i class="fas fa-handshake"></i></button>`;
            act.insertAdjacentHTML('afterbegin', b);
            const cell = tr.querySelector('td');
            if (cell) {
                if (o.isWarranty) cell.insertAdjacentHTML('beforeend', `<span class="osp-badge warr" title="Retorno em garantia${o.warrantyOfNumber ? ' da OS #' + String(o.warrantyOfNumber).padStart(4, '0') : ''}">GARANTIA</span>`);
                if (o.clientApproval && o.clientApproval.decision) cell.insertAdjacentHTML('beforeend', `<span class="osp-badge ${o.clientApproval.decision}">${o.clientApproval.decision === 'approved' ? '✓ aprovado pelo cliente' : '✗ recusado pelo cliente'}</span>`);
            }
        });
    }
    async function deliverWarranty(id) {
        const o = await getOs(id); if (!o || !o.isWarranty) return;
        if (!confirm(`Entregar ${osNum(o)} (garantia, sem cobrança)?`)) return;
        const hist = Array.isArray(o.statusHistory) ? o.statusHistory.slice() : []; hist.push({ status: 'delivered', label: 'Entregue (garantia, sem cobrança)', at: nowIso(), by: uname(), uid: auth.currentUser?.uid || '' });
        await db.collection('service_orders').doc(id).update({ status: 'delivered', statusHistory: hist, deliveredAt: ts(), paymentStatus: 'paid', paymentMethod: 'garantia', updatedAt: ts() });
        toast('success', 'OS de garantia entregue.'); if (typeof loadServiceOrders === 'function') await loadServiceOrders();
    }
    window.OSPRO.deliverWarranty = deliverWarranty;

    /* ---------- impressão da OS: checklist e assinaturas ---------- */
    function ckTable(c, title) {
        const s = checkSummary(c); if (!s) return '';
        return `<div class="osp-pk"><div class="osp-pk-t">${title}${s.model ? ' · ' + esc(s.model.toUpperCase()) : ''}</div><table class="osp-pk-tb">${s.items.map(i => `<tr><td>${esc(i.label)}</td><td class="${i.state}">${i.state === 'ok' ? 'OK' : i.state === 'fail' ? 'DEFEITO' : 'N/T'}</td></tr>`).join('')}</table>${s.battery ? `<div>${esc(s.gauge || 'Bateria')}: ${esc(s.battery)}%</div>` : ''}${s.notes ? `<div>Obs.: ${esc(s.notes)}</div>` : ''}${c.signature ? `<div class="osp-pk-s"><img src="${c.signature}" alt=""><div>${esc(c.signedName || 'Cliente')} · ${brDate(toMs(c.signedAt), true)}</div></div>` : ''}</div>`;
    }
    function injectPrint(win, o) {
        try {
            const doc = win && win.document; if (!doc || doc.getElementById('ospPrint')) return;
            const html = ckTable(o.checklistIn, 'CHECKLIST DE ENTRADA') + ckTable(o.checklistOut, 'CHECKLIST DE SAÍDA') + (o.clientApproval && o.clientApproval.decision ? `<div class="osp-pk"><div class="osp-pk-t">ORÇAMENTO ${o.clientApproval.decision === 'approved' ? 'APROVADO' : 'RECUSADO'} PELO CLIENTE</div><div>${esc(o.clientApproval.name || '')} · ${brDate(toMs(o.clientApproval.at), true)}${o.clientApproval.via === 'link' ? ' · pelo link' : ''}</div>${o.clientApproval.signature ? `<div class="osp-pk-s"><img src="${o.clientApproval.signature}" alt=""></div>` : ''}</div>` : '');
            if (!html) return;
            const st = doc.createElement('style'); st.textContent = '.osp-pk{margin:2.5mm 0;padding-top:2mm;border-top:1px dashed #000;font-size:10.5px;page-break-inside:avoid}.osp-pk-t{font-weight:800;margin-bottom:1mm}.osp-pk-tb{width:100%;border-collapse:collapse}.osp-pk-tb td{padding:.4mm 1mm;border-bottom:1px dotted #bbb}.osp-pk-tb td+td{text-align:right;font-weight:700}.osp-pk-tb .fail{color:#b91c1c}.osp-pk-s{text-align:center;margin-top:1.5mm}.osp-pk-s img{max-height:22mm;max-width:100%}';
            doc.head.appendChild(st);
            const box = doc.createElement('div'); box.id = 'ospPrint'; box.innerHTML = html;
            const anchor = doc.getElementById('osxPrintQr') || doc.querySelector('.signature') || doc.querySelector('.footer');
            anchor ? anchor.parentNode.insertBefore(box, anchor) : doc.body.appendChild(box);
        } catch (e) { console.warn('Checklist na impressão:', e); }
    }

    /* ---------- cliente novo direto na OS (35.27) ---------- */
    const digits = s => String(s || '').replace(/\D/g, '');
    const normName = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const custList = () => (typeof osCustomers !== 'undefined' && Array.isArray(osCustomers) ? osCustomers : []);
    const custPhone = c => c.whatsapp || c.phone || c.telefone || c.celular || '';
    function mountNewCustomer() {
        const sel = $('osCustomer'); if (!sel || $('ospNewCli')) return;
        const btn = document.createElement('button'); btn.type = 'button'; btn.id = 'ospNewCli'; btn.className = 'osp-newcli';
        btn.innerHTML = '<i class="fas fa-user-plus"></i> Novo cliente';
        btn.addEventListener('click', newCustomer);
        const lab = sel.previousElementSibling;
        if (lab && lab.tagName === 'LABEL') { const head = document.createElement('div'); head.className = 'osp-cli-head'; lab.before(head); head.append(lab, btn); }
        else sel.after(btn);
    }
    // OS já faturada: o cliente fica bloqueado, então o botão também
    function syncNewCustomer() { const b = $('ospNewCli'), s = $('osCustomer'); if (b && s) b.disabled = !!s.disabled; }
    /* 39.14.2 · Busca do cliente na OS (pedido do dono): com centenas de clientes (a assistência tem 922) o <select> não
       dava para procurar digitando. O campo procura por nome, telefone ou CPF/CNPJ, como no orçamento, e escolhe no
       #osCustomer, que continua na página escondido (os outros scripts leem e escutam o "change" dele). */
    function mountCustomerSearch() {
        const sel = $('osCustomer'); if (!sel || $('ospCliQ')) return;
        const box = document.createElement('div'); box.className = 'osp-cli-search';
        box.innerHTML = '<input type="text" id="ospCliQ" class="form-control" placeholder="Digite o nome, telefone ou CPF do cliente..." autocomplete="off" spellcheck="false"><div class="osp-cli-res" id="ospCliRes" role="listbox"></div>';
        sel.after(box); sel.classList.add('osp-cli-sel');
        const q = $('ospCliQ'), res = $('ospCliRes');
        let rows = [], hl = 0;
        const close = () => res.classList.remove('open');
        const draw = () => {
            const t = normName(q.value), dg = digits(q.value), typed = q.value.trim();
            const list = custList().filter(c => c.deleted !== true && c.status !== 'inactive');
            rows = (t ? list.filter(c => normName([c.name, c.nome, c.document, c.cpf, c.cnpj].join(' ')).includes(t)
                || (dg.length >= 3 && [c.whatsapp, c.phone, c.telefone, c.celular, c.document, c.cpf, c.cnpj].some(p => digits(p).includes(dg)))) : list).slice(0, 40);
            hl = 0;
            res.innerHTML = rows.map((c, i) => `<div class="osp-cli-opt${i === 0 ? ' hl' : ''}" data-i="${i}" role="option"><i class="fas fa-user"></i><span><b>${esc(c.name || c.nome || 'Cliente')}</b><small>${esc([custPhone(c), c.document || c.cpf || c.cnpj].filter(Boolean).join(' · '))}</small></span></div>`).join('')
                + (!rows.length ? `<div class="osp-cli-empty">${typed ? 'Nenhum cliente com "' + esc(typed) + '".' : 'Nenhum cliente cadastrado ainda.'}</div>` : '')
                + (typed ? `<div class="osp-cli-opt osp-cli-new${rows.length ? '' : ' hl'}" data-new="1"><i class="fas fa-user-plus"></i><span><b>Cadastrar "${esc(typed)}" como cliente novo</b><small>Abre o cadastro rápido já preenchido</small></span></div>` : '');
            res.classList.add('open');
        };
        const pick = el => {
            if (!el) return;
            if (el.dataset.new) { const typed = q.value.trim(); close(); newCustomer(typed); return; }
            const c = rows[Number(el.dataset.i)]; if (!c) return;
            close(); useCustomer(c.id, c.name || c.nome); q.blur();
        };
        q.addEventListener('input', draw);
        q.addEventListener('focus', () => { if (!q.disabled) { q.select(); draw(); } });
        q.addEventListener('keydown', e => {
            const opts = [...res.querySelectorAll('.osp-cli-opt')];
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault(); if (!res.classList.contains('open')) { draw(); return; }
                hl = Math.max(0, Math.min(opts.length - 1, hl + (e.key === 'ArrowDown' ? 1 : -1)));
                opts.forEach((o, i) => o.classList.toggle('hl', i === hl)); if (opts[hl]) opts[hl].scrollIntoView({ block: 'nearest' });
            } else if (e.key === 'Enter') { e.preventDefault(); if (res.classList.contains('open')) pick(res.querySelector('.osp-cli-opt.hl') || opts[0]); }
            else if (e.key === 'Escape' && res.classList.contains('open')) { e.preventDefault(); e.stopPropagation(); close(); syncCustomerSearch(true); }
        });
        res.addEventListener('mousedown', e => { const o = e.target.closest('.osp-cli-opt'); if (o) { e.preventDefault(); pick(o); } });
        // Saiu do campo sem escolher: volta o nome do cliente escolhido (o texto digitado não vale como cliente)
        q.addEventListener('blur', () => setTimeout(() => { close(); syncCustomerSearch(true); }, 150));
        sel.addEventListener('change', () => syncCustomerSearch(true));
        syncCustomerSearch(true);
    }
    function syncCustomerSearch(force) {
        const sel = $('osCustomer'), q = $('ospCliQ'); if (!sel || !q) return;
        const o = sel.value ? [...sel.options].find(x => x.value === sel.value) : null;
        if (force || document.activeElement !== q) q.value = o ? o.textContent : '';
        q.disabled = !!sel.disabled;
    }
    function findDup(d) {
        const ph = digits(d.phone).slice(-8), doc = digits(d.document), nm = normName(d.name), list = custList().filter(c => c.deleted !== true);
        if (doc.length >= 11) { const c = list.find(x => digits(x.document || x.cpf || x.cnpj) === doc); if (c) return { c, why: 'o mesmo CPF/CNPJ' }; }
        if (ph.length === 8) { const c = list.find(x => [x.whatsapp, x.phone, x.telefone, x.celular].some(p => digits(p).length >= 8 && digits(p).slice(-8) === ph)); if (c) return { c, why: 'o mesmo WhatsApp/telefone' }; }
        const c = nm && list.find(x => normName(x.name || x.nome) === nm);
        return c ? { c, why: 'o mesmo nome' } : null;
    }
    function useCustomer(id, name) {
        const sel = $('osCustomer'); if (!sel) return;
        let opt = [...sel.options].find(o => o.value === id);
        if (!opt) {
            opt = new Option(name || 'Cliente', id);
            const next = [...sel.options].find(o => o.value && o.textContent.localeCompare(name || '', 'pt-BR', { sensitivity: 'base' }) > 0);
            sel.insertBefore(opt, next || null);
        }
        sel.value = id; sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    function newCustomer(prefill) { // 39.14.2 · prefill: o que foi digitado na busca (nome, ou telefone se for só número)
        const mask = (fn, v) => { try { return Utils[fn](v); } catch (e) { return v; } };
        const ov = dlg(`<h3><i class="fas fa-user-plus"></i> Novo cliente</h3><p class="osp-sub">Cadastre agora e ele já fica escolhido nesta OS. Os outros dados você completa depois em Clientes.</p>
<div class="osp-cli-form">
<label class="osp-lbl osp-full">Nome completo *<input class="form-control" data-f="name" maxlength="120" autocomplete="off" placeholder="Nome do cliente"></label>
<label class="osp-lbl">WhatsApp / celular<input class="form-control" data-f="phone" inputmode="tel" autocomplete="off" placeholder="(00) 00000-0000"></label>
<label class="osp-lbl">CPF / CNPJ<input class="form-control" data-f="document" inputmode="numeric" autocomplete="off" placeholder="Opcional"></label>
<label class="osp-lbl osp-full">E-mail<input class="form-control" data-f="email" type="email" autocomplete="off" placeholder="Opcional"></label>
<label class="osp-lbl osp-full">Endereço<input class="form-control" data-f="address" autocomplete="off" placeholder="Rua, número, bairro, cidade (opcional)"></label>
</div>
<small class="osp-cli-hint"><i class="fab fa-whatsapp"></i> Com o WhatsApp você manda o orçamento para aprovar e avisa quando o aparelho fica pronto.</small>
<div class="osp-dup" data-dup hidden></div>
<div class="osp-acts"><button type="button" class="btn btn-outline" data-cancel>Cancelar</button><button type="button" class="btn btn-primary" data-save><i class="fas fa-check"></i> Salvar e usar na OS</button></div>`);
        const f = k => ov.querySelector(`[data-f="${k}"]`), saveBtn = ov.querySelector('[data-save]'), dupBox = ov.querySelector('[data-dup]');
        f('phone').addEventListener('input', e => { e.target.value = mask('maskPhone', e.target.value); });
        f('document').addEventListener('input', e => { e.target.value = mask('maskDocument', e.target.value); });
        ov.querySelector('[data-cancel]').onclick = () => ov.remove();
        const read = () => ({ name: f('name').value.trim(), phone: f('phone').value.trim(), document: f('document').value.trim(), email: f('email').value.trim(), address: f('address').value.trim() });
        let warned = '', busy = false;
        function showDup(d) {
            const ph = custPhone(d.c);
            dupBox.hidden = false;
            dupBox.innerHTML = `<i class="fas fa-circle-exclamation"></i><div><b>Já existe um cliente com ${d.why}:</b><span>${esc(d.c.name || d.c.nome || 'Cliente')}${ph ? ' · ' + esc(ph) : ''}</span></div><button type="button" class="btn btn-sm btn-primary" data-use>Usar este</button>`;
            dupBox.querySelector('[data-use]').onclick = () => { useCustomer(d.c.id, d.c.name || d.c.nome); ov.remove(); toast('success', 'Cliente escolhido na OS.'); };
            saveBtn.className = 'btn btn-outline'; saveBtn.innerHTML = '<i class="fas fa-user-plus"></i> Cadastrar novo mesmo assim';
        }
        async function save() {
            if (busy) return;
            const d = read();
            if (!d.name) { toast('warning', 'Informe o nome do cliente.'); f('name').focus(); return; }
            if (d.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email)) { toast('warning', 'Confira o e-mail.'); f('email').focus(); return; }
            const dup = findDup(d), key = dup ? dup.c.id + '|' + dup.why : '';
            if (dup && warned !== key) { warned = key; showDup(dup); return; }
            busy = true; saveBtn.disabled = true;
            try {
                const data = { name: d.name, phone: d.phone, whatsapp: d.phone, document: d.document, email: d.email, address: d.address, type: digits(d.document).length === 14 ? 'pj' : 'pf', status: 'active', source: 'os' };
                // Firebase/offline: FirestoreService · MySQL (app e zip MySQL): DataService
                const svc = typeof FirestoreService !== 'undefined' ? FirestoreService : (typeof DataService !== 'undefined' ? DataService : null);
                const id = svc && typeof svc.create === 'function'
                    ? (await svc.create('customers', data)).id
                    : (await db.collection('customers').add({ ...data, createdAt: ts(), updatedAt: ts(), deleted: false })).id;
                if (typeof osCustomers !== 'undefined' && Array.isArray(osCustomers)) osCustomers.push({ id, ...data });
                useCustomer(id, d.name);
                ov.remove(); toast('success', 'Cliente cadastrado e escolhido na OS.');
            } catch (e) { toast('error', 'Não foi possível cadastrar o cliente: ' + (e.message || e)); saveBtn.disabled = false; busy = false; }
        }
        saveBtn.onclick = save;
        ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target.matches('input')) { e.preventDefault(); save(); } });
        if (typeof prefill === 'string' && prefill.trim()) {
            const v = prefill.trim();
            if (/[a-zà-ú]/i.test(v)) f('name').value = v; else if (digits(v).length >= 8) f('phone').value = mask('maskPhone', v);
        }
        setTimeout(() => f('name').focus(), 30);
    }
    window.OSPRO.newCustomer = newCustomer;

    /* ---------- integração com a página ---------- */
    function wrap(name, fn) { const orig = window[name]; if (typeof orig !== 'function' || orig.__osp) return; const w = fn(orig); w.__osp = true; window[name] = w; }
    function hook() {
        mountNewCustomer(); mountCustomerSearch();
        wrap('openServiceOrder', orig => function (id = null) {
            const r = orig.apply(this, arguments);
            syncNewCustomer(); syncCustomerSearch(true);
            // OS nova: o cursor já fica na busca do cliente (no computador; no celular não abre o teclado sozinho)
            if (!id && matchMedia('(min-width: 900px)').matches) setTimeout(() => { const q = $('ospCliQ'); if (q && !q.disabled && !$('osCustomer')?.value && $('osModal')?.classList.contains('active')) q.focus(); }, 80);
            const o = id && typeof serviceOrders !== 'undefined' ? serviceOrders.find(x => x.id === id) : null;
            ck = { osId: id || null, in: { ...blankCk(), ...(o && o.checklistIn ? JSON.parse(JSON.stringify(o.checklistIn)) : {}) }, out: { ...blankCk(), ...(o && o.checklistOut ? JSON.parse(JSON.stringify(o.checklistOut)) : {}) }, list: [], model: '', modelName: '', battery: true, auto: true, edit: false };
            ck.in.items = ck.in.items || {}; ck.out.items = ck.out.items || {};
            // 35.30 · Itens: os guardados nesta OS; OS antiga com marcações = celular; OS nova = pelo tipo de equipamento.
            const src = [ck.in, ck.out].find(c => Array.isArray(c.list) && c.list.length);
            if (src) {
                ck.list = src.list.map(x => ci(String(x.k), String(x.l))); ck.model = src.model || ''; ck.modelName = src.modelName || '';
                const m = ckModels().find(x => x.id === ck.model); ck.battery = m ? m.battery : !!(ck.in.battery || ck.out.battery); ck.auto = false;
                ck.gauge = src.gaugeLabel || (m && m.gaugeLabel) || '';
            } else if (hasMarks(ck.in) || hasMarks(ck.out)) {
                const m = ckModels().find(x => x.id === 'celular');
                ck.list = CHECK_ITEMS.map(([k, l]) => ci(k, l)); ck.model = 'celular'; ck.modelName = m ? m.name : 'Celular / tablet'; ck.battery = true; ck.auto = false;
            } else useModel(pickCkModel($('osDeviceType')?.value, devText()), true);
            for (const c of [ck.in, ck.out]) { delete c.list; delete c.model; delete c.modelName; delete c.gaugeLabel; }
            ckTab = o && ['ready', 'delivered'].includes(o.status) ? 'out' : 'in';
            paintCk();
            return r;
        });
        wrap('saveServiceOrder', orig => async function () {
            const editing = typeof editingOsId !== 'undefined' ? editingOsId : null;
            const before = new Set((typeof serviceOrders !== 'undefined' ? serviceOrders : []).map(o => o.id));
            const r = await orig.apply(this, arguments);
            let id = editing;
            if (!id) { const created = (typeof serviceOrders !== 'undefined' ? serviceOrders : []).filter(o => !before.has(o.id)).sort((a, b) => Number(b.orderNumber || 0) - Number(a.orderNumber || 0))[0]; id = created && created.id; }
            if (id && (ck.in._dirty || ck.out._dirty)) { try { await saveCk(id); decorate(); } catch (e) { toast('error', 'A OS foi salva, mas o checklist não: ' + (window.dpErroHumano ? dpErroHumano(e) : (e && e.message))); } }
            return r;
        });
        wrap('renderServiceOrders', orig => function () { const r = orig.apply(this, arguments); decorate(); return r; });
        wrap('advanceServiceOrder', orig => async function (id, next) {
            const r = await orig.apply(this, arguments);
            if (['awaiting_approval', 'ready'].includes(next)) {
                const o = await getOs(id); if (!o) return r;
                const n = document.createElement('div'); n.className = 'osp-nudge';
                n.innerHTML = `<i class="fab fa-whatsapp"></i><div><b>${next === 'ready' ? (window.DPTerm && DPTerm.isVehicle(o) ? 'Veículo pronto!' : 'Aparelho pronto!') : 'Orçamento pronto!'}</b><small>${esc(osNum(o))} · ${esc(o.customerName || '')}</small></div><button type="button" class="btn btn-sm btn-success" style="background:#25d366;border-color:#25d366;color:#fff">${next === 'ready' ? 'Avisar o cliente' : 'Enviar para aprovar'}</button><button type="button" class="osp-nx" aria-label="Fechar">×</button>`;
                n.querySelector('.btn').onclick = () => { n.remove(); next === 'ready' ? openWhats(id) : askApproval(id); };
                n.querySelector('.osp-nx').onclick = () => n.remove();
                document.body.appendChild(n); setTimeout(() => n.remove(), 20000);
            }
            return r;
        });
        wrap('printServiceOrder', orig => async function (id) {
            const realOpen = window.open; let win = null;
            window.open = function () { win = realOpen.apply(window, arguments); return win; };
            try { await orig.apply(this, arguments); } finally { window.open = realOpen; }
            const o = await getOs(id); if (win && o) injectPrint(win, o);
        });
        decorate();
        const p = new URLSearchParams(location.search).get('os');
        if (p) { let n = 0; const t = setInterval(() => { n++; if (typeof serviceOrders !== 'undefined' && serviceOrders.some(x => x.id === p)) { clearInterval(t); openServiceOrder(p); } else if (n > 40) clearInterval(t); }, 300); }
        // 35.37 · "Nova OS" na ficha do cliente: ordens-servico.html?cliente=<id> abre a OS com o cliente escolhido
        const pc = new URLSearchParams(location.search).get('cliente');
        if (pc && !p) {
            let n = 0;
            const t = setInterval(() => {
                n++; const sel = $('osCustomer');
                if (sel && sel.options.length > 1 && typeof openServiceOrder === 'function') {
                    clearInterval(t);
                    const c = (typeof osCustomers !== 'undefined' ? osCustomers : []).find(x => x.id === pc);
                    openServiceOrder(); useCustomer(pc, c ? (c.name || c.nome) : 'Cliente');
                    try { history.replaceState(null, '', location.pathname); } catch (e) { }
                } else if (n > 40) clearInterval(t);
            }, 300);
        }
    }
    // Depois do os-print e do os-extras (que também embrulham estas funções)
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(hook, 0)); else setTimeout(hook, 0);
})();
