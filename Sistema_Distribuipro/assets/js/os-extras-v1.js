/* DistribuiPro 27.0 (35.22: aprovação, checklist e garantia na página do cliente) · Ordens de Serviço: fotos de entrada/saída, fotos pelo celular (QR Code),
   link de acompanhamento para o cliente e QR Code na impressão da OS.
   O mesmo arquivo funciona nas versões Firebase, MySQL, demonstração e Windows offline:
   - fotos ficam em service_order_photos/{id} (uma foto por documento) e a OS guarda só a lista;
   - o celular manda as fotos para uma "caixa de entrada" protegida por um código secreto com validade;
   - o acompanhamento é uma cópia resumida da OS em os_tracking/{código}, sem telefone nem e-mail do cliente. */
(() => {
  'use strict';
  if (window.OSX) return;
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const backend = window.DISTRIBUIPRO_OFFLINE ? 'lan' : window.__DP_MYSQL__ ? 'mysql' : (window.db && window.db.__isLocalDemo) ? 'demo' : 'firebase';
  const DEMO = backend === 'demo', LAN = backend === 'lan';
  const IMG = DEMO ? { max: 1024, q: 0.62, prev: 360, pq: 0.6 } : { max: 1400, q: 0.72, prev: 480, pq: 0.62 };
  const KINDS = { entrada: ['Fotos de entrada', 'Como o aparelho chegou', 'fa-right-to-bracket'], saida: ['Fotos de saída', 'Como o aparelho foi entregue', 'fa-right-from-bracket'] };
  const MAX_PER_KIND = 12;
  const RELAY = 'api/os-relay.php';
  const rnd = (n = 32) => Array.from(crypto.getRandomValues(new Uint8Array(n / 2)), x => x.toString(16).padStart(2, '0')).join('');
  const FV = () => (window.firebase && firebase.firestore && firebase.firestore.FieldValue) || window.DPFieldValue || null;
  const stamp = () => { const f = FV(); return f && f.serverTimestamp ? f.serverTimestamp() : new Date(); };
  const who = () => { try { return auth.currentUser?.displayName || auth.currentUser?.email || 'Operador'; } catch { return 'Operador'; } };
  const toast = (m, t = 'success') => { try { (window.Toast?.[t] || window.Toast?.info || alert).call(window.Toast, m); } catch { alert(m); } };
  const toMs = v => { if (!v) return null; try { if (typeof v === 'number') return v; if (v.toDate) return v.toDate().getTime(); if (v.__ts) return Number(v.__ts); if (v.seconds) return v.seconds * 1000; const n = Date.parse(v); return isNaN(n) ? null : n; } catch { return null; } };
  const orders = () => (typeof serviceOrders !== 'undefined' && Array.isArray(serviceOrders)) ? serviceOrders : [];
  const findOs = id => orders().find(o => o.id === id) || null;
  const osNum = o => '#OS-' + String(o?.orderNumber || 0).padStart(4, '0');
  const firstName = n => String(n || '').trim().split(/\s+/)[0] || 'Cliente';
  const device = o => [o?.deviceType, o?.brand, o?.model].filter(Boolean).join(' · ');
  const baseDir = () => location.href.replace(/[#?].*$/, '').replace(/[^/]*$/, '');
  const trackUrl = t => baseDir() + 'acompanhar-os.html?t=' + encodeURIComponent(t);

  /* ---------- Imagens ---------- */
  function shrink(file, max, q) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Não foi possível ler a imagem.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de imagem não suportado. Use JPG, PNG ou WebP.'));
        img.onload = () => {
          const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
          const w = Math.max(1, Math.round(img.naturalWidth * s)), h = Math.max(1, Math.round(img.naturalHeight * s));
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(img, 0, 0, w, h);
          resolve(c.toDataURL('image/jpeg', q));
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  async function prepare(file) {
    if (!/^image\//.test(file.type || 'image/')) throw new Error('Envie apenas imagens.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Imagem muito grande (máximo 25 MB).');
    return { image: await shrink(file, IMG.max, IMG.q), preview: await shrink(file, IMG.prev, IMG.pq) };
  }

  /* ---------- QR Code (biblioteca qrcode-generator, MIT) ---------- */
  let qrLoading = null;
  function loadQR() {
    if (window.qrcode) return Promise.resolve(window.qrcode);
    if (qrLoading) return qrLoading;
    const srcs = (LAN ? ['node_modules/qrcode-generator/qrcode.js'] : []).concat(['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js', 'https://cdn.jsdelivr.net/npm/qrcode-generator@1.4.4/qrcode.min.js']);
    qrLoading = new Promise((resolve, reject) => {
      const next = i => {
        if (window.qrcode) return resolve(window.qrcode);
        if (i >= srcs.length) { qrLoading = null; return reject(new Error('Não foi possível gerar o QR Code (sem internet).')); }
        const s = document.createElement('script'); s.src = srcs[i]; s.async = true;
        s.onload = () => window.qrcode ? resolve(window.qrcode) : next(i + 1);
        s.onerror = () => next(i + 1);
        document.head.appendChild(s);
      };
      next(0);
    });
    return qrLoading;
  }
  async function qrSvg(text, cell = 4) {
    const qrcode = await loadQR(); const qr = qrcode(0, 'M'); qr.addData(text); qr.make();
    return qr.createSvgTag({ cellSize: cell, margin: 2, scalable: true });
  }

  /* ---------- Armazenamento (mesmo código em todas as versões) ---------- */
  const photoCache = new Map();
  async function getPhoto(id) {
    if (photoCache.has(id)) return photoCache.get(id);
    const snap = await db.collection('service_order_photos').doc(id).get();
    const d = snap.exists ? snap.data() : null; if (d) photoCache.set(id, d); return d;
  }
  async function osDoc(id) { const s = await db.collection('service_orders').doc(id).get(); return s.exists ? { id, ...s.data() } : null; }
  async function addPhotos(osId, kind, items, source = 'upload') {
    const o = await osDoc(osId); if (!o) throw new Error('OS não encontrada.');
    const list = Array.isArray(o.photos) ? o.photos.slice() : [];
    const room = MAX_PER_KIND - list.filter(p => p.kind === kind).length;
    if (room <= 0) throw new Error(`Limite de ${MAX_PER_KIND} fotos de ${kind} por OS.`);
    const added = [];
    for (const it of items.slice(0, room)) {
      const id = 'ph_' + rnd(20);
      const doc = { osId, kind, image: it.image, preview: it.preview || it.image, source, createdAt: stamp(), by: who() };
      await db.collection('service_order_photos').doc(id).set(doc);
      photoCache.set(id, doc); added.push({ id, kind, at: Date.now(), source }); list.push(added[added.length - 1]);
    }
    await db.collection('service_orders').doc(osId).update({ photos: list, updatedAt: stamp() });
    const local = findOs(osId); if (local) local.photos = list;
    if (items.length > room) toast(`Só ${room} foto(s) foram adicionadas: o limite é ${MAX_PER_KIND} por tipo.`, 'warning');
    return added;
  }
  async function removePhoto(osId, photoId) {
    const o = await osDoc(osId); if (!o) return;
    const list = (o.photos || []).filter(p => p.id !== photoId);
    await db.collection('service_orders').doc(osId).update({ photos: list, updatedAt: stamp() });
    try { await db.collection('service_order_photos').doc(photoId).delete(); } catch (e) { console.warn('Foto:', e); }
    photoCache.delete(photoId); const local = findOs(osId); if (local) local.photos = list;
  }

  /* ---------- Relay (demonstração) ---------- */
  async function relay(action, body = {}) {
    const r = await fetch(RELAY, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
    let d = null; try { d = await r.json(); } catch { }
    if (!r.ok || !d || d.ok === false) throw new Error(d?.error || 'Serviço de fotos indisponível no momento.');
    return d;
  }

  /* ---------- Sessão de captura pelo celular ---------- */
  async function captureStart(info, minutes) {
    const token = rnd(32), expiresAt = Date.now() + minutes * 60000, data = { ...info, token, expiresAt, createdAt: Date.now() };
    if (backend === 'demo') { await relay('capture.create', { token, info: data }); return { token, url: baseDir() + 'foto-os.html?t=' + token, expiresAt }; }
    if (backend === 'lan') {
      const api = window.DistribuiProDesktop;
      if (!api?.captureStart) throw new Error('Atualize o DistribuiPro para usar fotos pelo celular.');
      const r = await api.captureStart({ token, info: data, expiresAt });
      if (!r || !r.ok) throw new Error(r?.error || 'Não foi possível abrir a captura pelo celular.');
      return { token, url: r.url, expiresAt, lan: true };
    }
    await db.collection('os_capture').doc(token).set(data);
    return { token, url: baseDir() + 'foto-os.html?t=' + token, expiresAt };
  }
  async function capturePoll(token) {
    if (backend === 'demo') return (await relay('capture.poll', { token })).photos || [];
    if (backend === 'lan') return (await window.DistribuiProDesktop.capturePoll(token))?.photos || [];
    const snap = await db.collection('os_photo_inbox').where('token', '==', token).get();
    const out = [];
    for (const d of snap.docs) { const x = d.data() || {}; out.push({ image: x.image, preview: x.preview || x.image }); try { await db.collection('os_photo_inbox').doc(d.id).delete(); } catch { } }
    return out;
  }
  async function captureStop(token) {
    try {
      if (backend === 'demo') await relay('capture.close', { token });
      else if (backend === 'lan') await window.DistribuiProDesktop.captureStop?.(token);
      else await db.collection('os_capture').doc(token).set({ expiresAt: 0, closedAt: Date.now() }, { merge: true });
    } catch { }
  }

  /* ---------- Acompanhamento online ---------- */
  const STATUS_TXT = { received: 'Recebido', analyzing: 'Em análise', awaiting_approval: 'Aguardando aprovação', approved: 'Orçamento aprovado', in_progress: 'Em manutenção', awaiting_parts: 'Aguardando peça', ready: 'Pronto para retirada', delivered: 'Entregue', returned: 'Devolvido sem reparo', cancelled: 'Cancelada' };
  let companyCache = null;
  async function company() {
    if (companyCache) return companyCache;
    let d = {};
    try { const s = await db.collection('settings').doc(DEMO ? 'demo_general' : 'general').get(); d = s.exists ? (s.data() || {}) : {}; } catch { }
    if (DEMO) { try { d = { ...d, ...(JSON.parse(sessionStorage.getItem('erp_demo_settings_v139') || '{}') || {}) }; } catch { } }
    const brand = (window.BrandingManager && typeof BrandingManager.getBrand === 'function') ? (BrandingManager.getBrand() || {}) : {};
    const rua = [d.logradouro, d.numero].filter(Boolean).join(', '), cid = [d.cidade, d.uf].filter(Boolean).join(' - ');
    let logo = DEMO ? (brand.logoUrl || '') : (d.logoUrl || brand.logoUrl || '');
    if (logo && logo.length > 150000) logo = ''; // logo enorme não vai para a página pública
    if (logo && !/^(https?:|data:)/.test(logo)) { try { logo = new URL(logo, location.href).href; } catch { logo = ''; } }
    companyCache = { name: (DEMO ? (brand.companyName || d.nomeFantasia) : (d.nomeFantasia || brand.companyName)) || d.razaoSocial || 'Assistência técnica', phone: d.telefone || '', whatsapp: d.whatsapp || d.telefone || '', email: d.email || '', address: [rua, [d.bairro, cid].filter(Boolean).join(' · ')].filter(Boolean).join(' · '), logoUrl: logo };
    return companyCache;
  }
  // 35.22 · Aprovação do cliente, checklist assinado e garantia também vão para a página do cliente.
  const ckSig = c => c ? [toMs(c.signedAt) || 0, Object.values(c.items || {}).join(''), c.battery || '', c.powersOn === undefined ? '' : String(c.powersOn)].join('|') : '';
  function publicSig(o) {
    return JSON.stringify([o.status, (o.statusHistory || []).length, o.total, o.paymentStatus, toMs(o.estimatedDate), o.diagnosis, o.serviceDescription, o.problemReported, device(o), o.customerName, (o.photos || []).map(p => p.id).join(','), o.warrantyDays, o.cancelReason || '', o.clientApproval ? o.clientApproval.decision + (toMs(o.clientApproval.at) || '') : '', ckSig(o.checklistIn), ckSig(o.checklistOut), toMs(o.deliveredAt) || 0, o.isWarranty ? 1 : 0, window.OSB ? OSB.publicSig(o) : '']);
  }
  async function snapshot(o) {
    const photos = [];
    for (const kind of ['entrada', 'saida']) {
      for (const p of (o.photos || []).filter(x => x.kind === kind).slice(0, 6)) { try { const d = await getPhoto(p.id); if (d?.preview) photos.push({ kind, preview: d.preview }); } catch { } }
    }
    return {
      v: 1, osNumber: o.orderNumber || 0, status: o.status || 'received', statusLabel: STATUS_TXT[o.status] || o.status || '',
      history: (o.statusHistory || []).slice(-20).map(h => ({ label: h.label || STATUS_TXT[h.status] || h.status || 'Atualização', status: h.status || '', at: toMs(h.at) })),
      customer: firstName(o.customerName), device: device(o), problem: o.problemReported || '', diagnosis: o.diagnosis || '', service: o.serviceDescription || '',
      laborValue: Number(o.laborValue || 0), partsValue: Number(o.partsValue || 0), discount: Number(o.discount || 0), total: Number(o.total || 0), paymentStatus: o.paymentStatus || 'pending',
      estimatedDate: toMs(o.estimatedDate), warrantyDays: Number(o.warrantyDays || 0), createdAt: toMs(o.createdAt), readyAt: toMs(o.readyAt), deliveredAt: toMs(o.deliveredAt),
      cancelReason: o.status === 'cancelled' ? (o.cancelReason || '') : '', company: await company(), photos, publishedAt: Date.now(),
      approval: o.clientApproval ? { decision: o.clientApproval.decision || '', at: toMs(o.clientApproval.at), name: o.clientApproval.name || '' } : null,
      checkIn: window.OSPRO && OSPRO.checkSummary ? OSPRO.checkSummary(o.checklistIn) : null, checkOut: window.OSPRO && OSPRO.checkSummary ? OSPRO.checkSummary(o.checklistOut) : null,
      warrantyUntil: toMs(o.deliveredAt) && Number(o.warrantyDays || 0) > 0 ? toMs(o.deliveredAt) + Number(o.warrantyDays) * 864e5 : null, isWarranty: !!o.isWarranty, warrantyOf: Number(o.warrantyOfNumber || 0),
      // 38.4 · Previsão da peça, sinal pago e termo de entrada (os-bancada-v1.js). A senha do aparelho nunca vai para cá.
      ...(window.OSB ? OSB.publicExtra(o) : {})
    };
  }
  async function publish(o) {
    if (LAN || !o?.trackingToken) return;
    const data = await snapshot(o);
    if (backend === 'demo') await relay('track.publish', { token: o.trackingToken, data });
    else await db.collection('os_tracking').doc(o.trackingToken).set(data);
  }
  async function ensureTracking(osId) {
    if (LAN) return null;
    const o = findOs(osId) || await osDoc(osId); if (!o) return null;
    if (!o.trackingToken) {
      o.trackingToken = rnd(24);
      await db.collection('service_orders').doc(osId).update({ trackingToken: o.trackingToken });
      const local = findOs(osId); if (local) local.trackingToken = o.trackingToken;
    }
    const sig = publicSig(o);
    if (o.trackingSig !== sig) { await publish(o); o.trackingSig = sig; try { await db.collection('service_orders').doc(osId).update({ trackingSig: sig }); } catch { } }
    return trackUrl(o.trackingToken);
  }
  let syncing = false;
  async function syncTracking() {
    if (LAN || syncing) return; syncing = true;
    try {
      for (const o of orders()) {
        if (!o.trackingToken || o.deleted) continue;
        const sig = publicSig(o); if (o.trackingSig === sig) continue;
        try { await publish(o); o.trackingSig = sig; await db.collection('service_orders').doc(o.id).update({ trackingSig: sig }); } catch (e) { console.warn('Acompanhamento da OS:', e); }
      }
    } finally { syncing = false; }
  }

  /* ---------- Interface: seção de fotos no modal da OS ---------- */
  let current = { osId: null, pending: { entrada: [], saida: [] } };
  const pendingFor = kind => current.pending[kind];
  function sectionHtml() {
    const blocks = Object.entries(KINDS).map(([k, [title, sub, ico]]) => `
      <div class="osx-block" data-kind="${k}">
        <div class="osx-block-head"><div><strong><i class="fas ${ico}"></i> ${title} <span class="osx-count" data-count="${k}">(0)</span></strong><small>${sub}</small></div>
          <div class="osx-block-actions"><label class="btn btn-outline btn-sm osx-add"><i class="fas fa-plus"></i> Adicionar<input type="file" accept="image/*" multiple hidden data-osx-file="${k}"></label><button type="button" class="btn btn-outline btn-sm" data-osx-qr="${k}"><i class="fas fa-qrcode"></i> QR Code</button></div></div>
        <div class="osx-grid" data-grid="${k}"><div class="osx-empty">Nenhuma foto ainda.</div></div>
      </div>`).join('');
    const track = LAN ? '' : `<div class="osx-track" id="osxTrack" hidden><div><strong><i class="fas fa-link"></i> Acompanhamento do cliente</strong><small>O cliente vê o andamento, o orçamento e as fotos desta OS pelo celular.</small></div><div class="osx-track-actions"><button type="button" class="btn btn-outline btn-sm" data-osx-track="copy"><i class="fas fa-copy"></i> Copiar link</button><button type="button" class="btn btn-outline btn-sm" data-osx-track="whats"><i class="fab fa-whatsapp"></i> Enviar no WhatsApp</button><button type="button" class="btn btn-outline btn-sm" data-osx-track="open"><i class="fas fa-up-right-from-square"></i> Abrir</button></div></div>`;
    return `<section class="os-section osx-section" id="osxSection"><div class="os-section-title"><span class="os-section-icon"><i class="fas fa-camera"></i></span><div><strong>Fotos do aparelho</strong><small>Registre como o aparelho chegou e como foi entregue. Pelo QR Code, as fotos vêm direto do celular.</small></div></div><div class="osx-blocks">${blocks}</div>${track}</section>`;
  }
  function ensureSection() {
    let sec = $('#osxSection'); if (sec) return sec;
    const body = $('#osModal .os-modal-body'); if (!body) return null;
    const sections = body.querySelectorAll('.os-section');
    const after = sections[1] || sections[0];
    const wrap = document.createElement('div'); wrap.innerHTML = sectionHtml(); sec = wrap.firstElementChild;
    after ? after.after(sec) : body.appendChild(sec);
    sec.addEventListener('change', onFile);
    sec.addEventListener('click', onSectionClick);
    return sec;
  }
  async function renderGrid(kind) {
    const grid = $(`#osxSection [data-grid="${kind}"]`); if (!grid) return;
    const o = current.osId ? findOs(current.osId) : null;
    const saved = (o?.photos || []).filter(p => p.kind === kind), pend = current.osId ? [] : pendingFor(kind);
    const n = saved.length + pend.length; const cnt = $(`#osxSection [data-count="${kind}"]`); if (cnt) cnt.textContent = `(${n})`;
    if (!n) { grid.innerHTML = '<div class="osx-empty">Nenhuma foto ainda.</div>'; return; }
    grid.innerHTML = saved.map(p => `<div class="osx-thumb is-loading" data-photo="${esc(p.id)}"><button type="button" class="osx-del" data-osx-del="${esc(p.id)}" title="Excluir foto"><i class="fas fa-trash"></i></button><span class="osx-tag">${kind === 'entrada' ? 'Entrada' : 'Saída'}</span></div>`).join('')
      + pend.map((p, i) => `<div class="osx-thumb" data-pending="${i}" style="background-image:url('${p.preview}')"><button type="button" class="osx-del" data-osx-delp="${i}" title="Remover foto"><i class="fas fa-trash"></i></button><span class="osx-tag">${kind === 'entrada' ? 'Entrada' : 'Saída'} · a salvar</span></div>`).join('');
    for (const p of saved) {
      getPhoto(p.id).then(d => { const el = grid.querySelector(`[data-photo="${CSS.escape(p.id)}"]`); if (el && d) { el.style.backgroundImage = `url('${d.preview || d.image}')`; el.classList.remove('is-loading'); } }).catch(() => { });
    }
  }
  function renderAll() { renderGrid('entrada'); renderGrid('saida'); const t = $('#osxTrack'); if (t) t.hidden = !current.osId; }
  async function onFile(e) {
    const inp = e.target.closest('[data-osx-file]'); if (!inp) return;
    const kind = inp.dataset.osxFile, files = [...(inp.files || [])]; inp.value = ''; if (!files.length) return;
    const label = inp.closest('.osx-add'); label?.classList.add('is-busy');
    try {
      const items = []; for (const f of files) items.push(await prepare(f));
      await receive(kind, items, 'upload');
    } catch (err) { toast(err.message || 'Não foi possível adicionar a foto.', 'error'); }
    finally { label?.classList.remove('is-busy'); }
  }
  async function receive(kind, items, source) {
    if (!items.length) return;
    if (current.osId) { await addPhotos(current.osId, kind, items, source); toast(items.length === 1 ? 'Foto adicionada à OS.' : `${items.length} fotos adicionadas à OS.`); }
    else { const room = MAX_PER_KIND - pendingFor(kind).length; pendingFor(kind).push(...items.slice(0, room)); toast('Foto pronta. Ela será salva junto com a OS.', 'info'); }
    renderGrid(kind);
  }
  async function onSectionClick(e) {
    const qr = e.target.closest('[data-osx-qr]'); if (qr) { openCapture(qr.dataset.osxQr); return; }
    const del = e.target.closest('[data-osx-del]');
    if (del) { e.stopPropagation(); if (!confirm('Excluir esta foto da OS?')) return; try { await removePhoto(current.osId, del.dataset.osxDel); renderAll(); toast('Foto excluída.'); } catch (err) { toast(err.message, 'error'); } return; }
    const delp = e.target.closest('[data-osx-delp]');
    if (delp) { e.stopPropagation(); const kind = delp.closest('[data-kind]').dataset.kind; pendingFor(kind).splice(Number(delp.dataset.osxDelp), 1); renderGrid(kind); return; }
    const th = e.target.closest('.osx-thumb');
    if (th) { if (th.dataset.photo) { const d = await getPhoto(th.dataset.photo).catch(() => null); if (d) viewer(d.image || d.preview); } else { const kind = th.closest('[data-kind]').dataset.kind; viewer(pendingFor(kind)[Number(th.dataset.pending)]?.image); } return; }
    const tr = e.target.closest('[data-osx-track]');
    if (tr) { trackAction(tr.dataset.osxTrack, current.osId, tr); }
  }
  function viewer(src) {
    if (!src) return; const ov = document.createElement('div'); ov.className = 'osx-viewer';
    ov.innerHTML = `<img src="${src}" alt="Foto da OS"><div class="osx-viewer-bar"><a class="btn btn-sm btn-outline" download="foto-os.jpg" href="${src}"><i class="fas fa-download"></i> Baixar</a><button type="button" class="btn btn-sm btn-primary"><i class="fas fa-times"></i> Fechar</button></div>`;
    ov.addEventListener('click', e => { if (e.target === ov || e.target.closest('button')) ov.remove(); });
    document.body.appendChild(ov);
  }

  /* ---------- Modal: fotos pelo celular ---------- */
  let cap = null;
  function closeCapture() { if (!cap) return; clearInterval(cap.timer); clearInterval(cap.clock); if (cap.token) captureStop(cap.token); cap.el.remove(); cap = null; }
  function openCapture(kind) {
    closeCapture();
    const o = current.osId ? findOs(current.osId) : null;
    const el = document.createElement('div'); el.className = 'osx-modal-bg';
    el.innerHTML = `<div class="osx-modal" role="dialog" aria-label="Fotos pelo celular"><button type="button" class="osx-x" aria-label="Fechar">×</button>
      <h3><i class="fas fa-qrcode"></i> Fotos pelo celular</h3><p class="osx-sub">${o ? esc(osNum(o)) + ' · ' : 'Nova OS · '}Gere um QR Code e tire as fotos com a câmera do celular.</p>
      <div class="osx-cap-form"><label>Tipo das fotos<select data-cap="kind"><option value="entrada">Fotos de entrada (como chegou)</option><option value="saida">Fotos de saída (como foi entregue)</option></select></label>
      <label>Validade do QR Code<select data-cap="min"><option value="15">15 minutos</option><option value="30">30 minutos</option><option value="60">1 hora</option></select></label>
      <button type="button" class="btn btn-primary osx-wide" data-cap="go"><i class="fas fa-qrcode"></i> Gerar QR Code</button>
      ${LAN ? '<p class="osx-hint"><i class="fas fa-wifi"></i> O celular precisa estar no <b>mesmo Wi-Fi</b> deste computador. Se o Windows perguntar, permita o acesso à rede.</p>' : ''}</div>
      <div class="osx-cap-live" hidden><div class="osx-qr" data-cap="qr"></div><p class="osx-cap-info">Aponte a câmera do celular para o QR Code.<br><b data-cap="kindlbl"></b> · válido até <b data-cap="until"></b></p>
      <div class="osx-cap-status" data-cap="status"><span class="osx-spin"></span> Aguardando fotos do celular…</div>
      <div class="osx-cap-actions"><button type="button" class="btn btn-outline" data-cap="copy"><i class="fas fa-copy"></i> Copiar link</button><button type="button" class="btn btn-secondary" data-cap="new"><i class="fas fa-rotate"></i> Novo QR Code</button></div></div></div>`;
    document.body.appendChild(el);
    $('[data-cap="kind"]', el).value = kind || 'entrada';
    cap = { el, token: null, url: '', received: 0 };
    el.addEventListener('click', async e => {
      if (e.target === el || e.target.closest('.osx-x')) { closeCapture(); return; }
      const b = e.target.closest('[data-cap]'); if (!b || b.tagName === 'SELECT') return;
      if (b.dataset.cap === 'go' || b.dataset.cap === 'new') startCapture();
      if (b.dataset.cap === 'copy') { try { await navigator.clipboard.writeText(cap.url); toast('Link copiado.'); } catch { prompt('Copie o link:', cap.url); } }
    });
  }
  async function startCapture() {
    if (!cap) return; const el = cap.el, kind = $('[data-cap="kind"]', el).value, min = Number($('[data-cap="min"]', el).value) || 15;
    if (cap.token) { clearInterval(cap.timer); clearInterval(cap.clock); captureStop(cap.token); cap.token = null; }
    const go = $('[data-cap="go"]', el); go.disabled = true; go.innerHTML = '<span class="osx-spin"></span> Gerando…';
    try {
      const o = current.osId ? findOs(current.osId) : null;
      const comp = await company().catch(() => ({}));
      const s = await captureStart({ osNumber: o?.orderNumber || 0, kind, kindLabel: KINDS[kind][0], customer: firstName(o?.customerName || $('#osCustomer')?.selectedOptions?.[0]?.textContent || ''), device: o ? device(o) : [$('#osDeviceType')?.value, $('#osBrand')?.value, $('#osModel')?.value].filter(Boolean).join(' · '), company: comp.name || '' }, min);
      cap.token = s.token; cap.url = s.url; cap.kind = kind; cap.expiresAt = s.expiresAt;
      $('[data-cap="qr"]', el).innerHTML = await qrSvg(s.url, 5).catch(() => `<div class="osx-qr-fallback">Abra no celular:<br><b>${esc(s.url)}</b></div>`);
      $('[data-cap="kindlbl"]', el).textContent = KINDS[kind][0];
      $('[data-cap="until"]', el).textContent = new Date(s.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      $('.osx-cap-form', el).hidden = true; $('.osx-cap-live', el).hidden = false;
      setStatus('<span class="osx-spin"></span> Aguardando fotos do celular…');
      cap.timer = setInterval(pollOnce, 2500);
      cap.clock = setInterval(() => { if (cap && Date.now() > cap.expiresAt) { clearInterval(cap.timer); clearInterval(cap.clock); setStatus('<i class="fas fa-clock"></i> QR Code expirado. Gere um novo para continuar.'); } }, 5000);
    } catch (err) { toast(err.message || 'Não foi possível gerar o QR Code.', 'error'); }
    finally { go.disabled = false; go.innerHTML = '<i class="fas fa-qrcode"></i> Gerar QR Code'; }
  }
  function setStatus(html) { if (cap) $('[data-cap="status"]', cap.el).innerHTML = html; }
  let polling = false;
  async function pollOnce() {
    if (!cap?.token || polling) return; polling = true;
    try {
      const got = await capturePoll(cap.token);
      if (got.length) {
        await receive(cap.kind, got.filter(x => x && x.image), 'celular');
        cap.received += got.length;
        setStatus(`<i class="fas fa-circle-check"></i> ${cap.received} foto(s) recebida(s) do celular. Pode continuar enviando.`);
      }
    } catch (e) { console.warn('Captura pelo celular:', e); }
    finally { polling = false; }
  }

  /* ---------- Link de acompanhamento ---------- */
  async function trackAction(act, osId, btn) {
    if (!osId) { toast('Salve a OS primeiro.', 'warning'); return; }
    let url; try { if (btn) btn.disabled = true; url = await ensureTracking(osId); } catch (e) { toast('Não foi possível gerar o link: ' + e.message, 'error'); return; } finally { if (btn) btn.disabled = false; }
    if (!url) return;
    const o = findOs(osId) || {};
    if (act === 'copy') { try { await navigator.clipboard.writeText(url); toast('Link de acompanhamento copiado.'); } catch { prompt('Copie o link:', url); } }
    else if (act === 'open') window.open(url, '_blank', 'noopener');
    else if (act === 'whats') {
      const c = (typeof osCustomers !== 'undefined' && Array.isArray(osCustomers) ? osCustomers : []).find(x => x.id === o.customerId) || {};
      let ph = String(c.whatsapp || c.phone || c.telefone || c.celular || '').replace(/\D/g, ''); if (ph.length === 10 || ph.length === 11) ph = '55' + ph;
      const comp = await company().catch(() => ({ name: '' }));
      const msg = `Olá, ${firstName(o.customerName)}! Acompanhe a sua ordem de serviço ${osNum(o)}${comp.name ? ' na ' + comp.name : ''} por este link:\n${url}`;
      window.open('https://wa.me/' + (ph.length >= 12 ? ph : '') + '?text=' + encodeURIComponent(msg), '_blank', 'noopener');
    } else dialogTrack(o, url);
  }
  async function dialogTrack(o, url) {
    const el = document.createElement('div'); el.className = 'osx-modal-bg';
    el.innerHTML = `<div class="osx-modal"><button type="button" class="osx-x" aria-label="Fechar">×</button><h3><i class="fas fa-link"></i> Acompanhamento online</h3><p class="osx-sub">${esc(osNum(o))} · ${esc(o.customerName || '')}</p><div class="osx-qr">${await qrSvg(url, 5).catch(() => '')}</div><input class="form-control osx-url" readonly value="${esc(url)}"><div class="osx-cap-actions"><button type="button" class="btn btn-outline" data-t="copy"><i class="fas fa-copy"></i> Copiar</button><button type="button" class="btn btn-outline" data-t="whats"><i class="fab fa-whatsapp"></i> WhatsApp</button><button type="button" class="btn btn-primary" data-t="open"><i class="fas fa-up-right-from-square"></i> Abrir</button></div></div>`;
    el.addEventListener('click', e => { if (e.target === el || e.target.closest('.osx-x')) { el.remove(); return; } const b = e.target.closest('[data-t]'); if (b) trackAction(b.dataset.t, o.id, b); });
    document.body.appendChild(el);
  }

  /* ---------- Impressão: QR Code de acompanhamento ---------- */
  async function injectPrintQr(win, url) {
    try {
      const svg = await qrSvg(url, 3);
      const doc = win.document; if (!doc || doc.getElementById('osxPrintQr')) return;
      const st = doc.createElement('style'); st.textContent = '.osx-pqr{text-align:center;margin:3mm 0 1mm;padding-top:2mm;border-top:1px dashed #000}.osx-pqr svg{width:30mm;height:30mm;display:block;margin:1.5mm auto}.osx-pqr .t{font-size:10px}.osx-pqr .u{font-size:7.6px;overflow-wrap:anywhere;word-break:break-all;line-height:1.15}';
      doc.head.appendChild(st);
      const box = doc.createElement('div'); box.className = 'osx-pqr'; box.id = 'osxPrintQr';
      box.innerHTML = `<div class="t">ACOMPANHE SUA OS ONLINE</div>${svg}<div class="u">${esc(url)}</div>`;
      const anchor = doc.querySelector('.signature') || doc.querySelector('.footer');
      anchor ? anchor.parentNode.insertBefore(box, anchor) : doc.body.appendChild(box);
    } catch (e) { console.warn('QR na impressão:', e); }
  }

  /* ---------- Integração com a tela de OS ---------- */
  function wrap(name, fn) { const orig = window[name]; if (typeof orig !== 'function' || orig.__osx) return; const w = fn(orig); w.__osx = true; window[name] = w; }
  function hook() {
    wrap('openServiceOrder', orig => function (id = null) {
      const r = orig.apply(this, arguments);
      current = { osId: id || null, pending: { entrada: [], saida: [] } };
      if (ensureSection()) renderAll();
      return r;
    });
    wrap('saveServiceOrder', orig => async function () {
      const wasNew = !(typeof editingOsId !== 'undefined' && editingOsId);
      const before = new Set(orders().map(o => o.id));
      const pend = { entrada: current.pending.entrada.slice(), saida: current.pending.saida.slice() };
      const r = await orig.apply(this, arguments);
      if (wasNew) {
        const created = orders().filter(o => !before.has(o.id)).sort((a, b) => Number(b.orderNumber || 0) - Number(a.orderNumber || 0))[0];
        if (created) {
          try {
            for (const k of ['entrada', 'saida']) if (pend[k].length) await addPhotos(created.id, k, pend[k], 'upload');
            current.pending = { entrada: [], saida: [] };
            if (!LAN) await ensureTracking(created.id);
            decorateRows();
          } catch (e) { toast('A OS foi criada, mas houve um problema com as fotos: ' + e.message, 'error'); }
        }
      }
      return r;
    });
    wrap('loadServiceOrders', orig => async function () { const r = await orig.apply(this, arguments); decorateRows(); setTimeout(syncTracking, 400); return r; });
    wrap('renderServiceOrders', orig => function () { const r = orig.apply(this, arguments); decorateRows(); return r; });
    wrap('printServiceOrder', orig => async function (id) {
      let url = null; if (!LAN) { try { url = await ensureTracking(id); } catch (e) { console.warn('Link de acompanhamento:', e); } }
      const realOpen = window.open; let win = null;
      window.open = function () { win = realOpen.apply(window, arguments); return win; };
      try { await orig.apply(this, arguments); } finally { window.open = realOpen; }
      if (win && url) await injectPrintQr(win, url);
    });
    const modal = $('#osModal');
    if (modal) new MutationObserver(() => { if (!modal.classList.contains('active') && !modal.classList.contains('show') && cap) closeCapture(); }).observe(modal, { attributes: true, attributeFilter: ['class'] });
  }
  // Botões extras na lista: fotos (quantidade) e link de acompanhamento.
  function decorateRows() {
    const tb = $('#osTbody'); if (!tb) return;
    tb.querySelectorAll('tr').forEach(tr => {
      const act = tr.querySelector('.os-actions'); if (!act) return;
      act.querySelectorAll('.osx-row').forEach(x => x.remove());
      const m = (act.innerHTML.match(/printServiceOrder\('([^']+)'\)/) || [])[1]; if (!m) return;
      const o = findOs(m); const n = (o?.photos || []).length;
      const btns = (n ? `<button class="btn-icon osx-row osx-row-ph" title="${n} foto(s) do aparelho" onclick="OSX.photos('${esc(m)}')"><i class="fas fa-camera"></i><span>${n}</span></button>` : '')
        + (LAN || o?.status === 'cancelled' ? '' : `<button class="btn-icon osx-row" title="Link de acompanhamento do cliente" onclick="OSX.track('${esc(m)}')"><i class="fas fa-link"></i></button>`);
      if (btns) act.insertAdjacentHTML('afterbegin', btns);
    });
  }
  window.OSX = {
    backend, ensureTracking, syncTracking, qrSvg, prepare, company, trackUrl, osDoc,
    track: id => { if (findOs(id)) trackAction('dialog', id); },
    photos: id => { const o = findOs(id); if (!o) return; if (o.status === 'cancelled') { const p = (o.photos || [])[0]; if (p) getPhoto(p.id).then(d => d && viewer(d.image)); return; } openServiceOrder(id); setTimeout(() => document.getElementById('osxSection')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 250); }
  };
  const start = () => { hook(); decorateRows(); };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
