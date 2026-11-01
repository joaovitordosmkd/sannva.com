/* DistribuiPro 27.0 (35.22: aprovar/recusar orçamento, assinar checklist e garantia) · Páginas públicas da OS (sem login):
   - foto-os.html: o celular abre pelo QR Code e envia fotos para a OS;
   - acompanhar-os.html: o cliente acompanha a OS.
   Cada versão define window.OSX_BACKEND = 'firebase' | 'mysql' | 'demo' | 'lan'. */
(() => {
  'use strict';
  const B = window.OSX_BACKEND || 'firebase';
  const $ = (s, r = document) => r.querySelector(s);
  const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const token = (new URLSearchParams(location.search).get('t') || '').replace(/[^a-zA-Z0-9]/g, '').slice(0, 80);
  const money = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const dt = (ms, time = false) => !ms ? '—' : new Date(ms).toLocaleString('pt-BR', time ? { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' } : { day: '2-digit', month: '2-digit', year: 'numeric' });
  const osNum = n => '#OS-' + String(n || 0).padStart(4, '0');
  // 38.1 · OS de oficina (tipo "Carro", "Moto"... ou checklist de veículo): a página fala de veículo
  const VEH_RE = /^(ve[ií]culo|carro|moto|motocicleta|caminh|utilit|picape|pick-?up|van\b|suv\b|autom[oó]vel)/i;
  const isVeh = d => !!d && (d.itemTerm === 'veiculo' || VEH_RE.test(String(d.device || '').trim()) || /ve[ií]culo/i.test(String((d.checkIn || {}).model || '')));
  const word = d => isVeh(d) ? 'veículo' : 'aparelho', Word = d => isVeh(d) ? 'Veículo' : 'Aparelho';

  async function post(url, body) {
    const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), credentials: 'same-origin' });
    let d = null; try { d = await r.json(); } catch { }
    if (!r.ok || !d || d.ok === false) { const e = new Error(d?.error || 'Não foi possível conectar. Tente novamente.'); e.code = d?.code; throw e; }
    return d;
  }
  const fs = () => window.firebase.firestore();
  const api = {
    async capture(t) {
      if (B === 'firebase') { const s = await fs().collection('os_capture').doc(t).get(); return s.exists ? s.data() : null; }
      if (B === 'mysql') return (await post('api/mysql/index.php', { action: 'public.capture.get', token: t })).capture;
      if (B === 'demo') return (await post('api/os-relay.php', { action: 'capture.get', token: t })).capture;
      return (await post('api/capture', { action: 'get', token: t })).capture;
    },
    async upload(t, item) {
      if (B === 'firebase') { await fs().collection('os_photo_inbox').add({ token: t, image: item.image, preview: item.preview, createdAt: Date.now() }); return; }
      if (B === 'mysql') { await post('api/mysql/index.php', { action: 'public.capture.upload', token: t, image: item.image, preview: item.preview }); return; }
      if (B === 'demo') { await post('api/os-relay.php', { action: 'capture.upload', token: t, image: item.image, preview: item.preview }); return; }
      await post('api/capture', { action: 'upload', token: t, image: item.image, preview: item.preview });
    },
    // 35.22 · Resposta do cliente: aprovar/recusar o orçamento ou assinar o checklist
    async respond(t, body) {
      const data = { token: t, type: body.type, name: body.name || '', note: body.note || '', signature: body.signature || '' };
      if (B === 'firebase') { await fs().collection('os_client_inbox').add({ ...data, processed: false, createdAt: Date.now() }); return; }
      if (B === 'mysql') { await post('api/mysql/index.php', { action: 'public.track.respond', ...data }); return; }
      if (B === 'demo') { await post('api/os-relay.php', { action: 'track.respond', ...data }); return; }
      throw new Error('Esta loja não recebe respostas pelo link. Fale com a loja.');
    },
    async track(t) {
      if (B === 'firebase') { const s = await fs().collection('os_tracking').doc(t).get(); return s.exists ? s.data() : null; }
      if (B === 'mysql') return (await post('api/mysql/index.php', { action: 'public.track.get', token: t })).tracking;
      if (B === 'demo') return (await post('api/os-relay.php', { action: 'track.get', token: t })).tracking;
      return null;
    }
  };
  // 39.3 · Foto grande demais para a regra do Firestore (900 mil caracteres) ou para o servidor vinha como "link não liberado".
  const friendly = e => { const m = String(e?.message || e); if (/grande demais|too large|size\(\)|900000|413/i.test(m)) return 'A foto ficou grande demais. Tire de novo com menos zoom ou escolha outra da galeria.'; return /permission|insufficient/i.test(m) ? 'Este link não está liberado. Peça um novo QR Code na loja.' : (m || 'Erro inesperado.'); };

  /* ---------- Imagens ---------- */
  // 39.3 · Com teto em caracteres: a foto principal precisa ficar abaixo dos 900 mil da regra do Firestore (os_photo_inbox)
  // e do limite do servidor; a qualidade e o lado caem até caber (celulares de 50 MP geravam 1,5 MB e o envio falhava).
  function shrink(file, max, q, teto) {
    teto = teto || (max >= 800 ? 850000 : 250000);
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onerror = () => reject(new Error('Não foi possível ler a foto.'));
      fr.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Formato de foto não suportado.'));
        img.onload = () => {
          let lado = max, qual = q, out = '';
          for (let t = 0; t < 8; t++) {
            const s = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
            const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
            const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
            out = c.toDataURL('image/jpeg', qual);
            if (out.length <= teto) break;
            if (qual > 0.5) qual = Math.max(0.45, qual - 0.12); else lado = Math.max(480, Math.round(lado * 0.8));
          }
          if (out.length > teto) return reject(new Error('A foto ficou grande demais mesmo reduzida. Tire de novo com menos zoom.'));
          resolve(out);
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  }
  const IMG = B === 'demo' ? [1024, 0.62, 360, 0.6] : [1400, 0.72, 480, 0.62];

  /* ---------- Página: fotos pelo celular ---------- */
  async function capturePage(root) {
    if (!token) { root.innerHTML = box('Link incompleto', 'Escaneie novamente o QR Code mostrado na tela do computador.', 'error'); return; }
    let info;
    try { info = await api.capture(token); } catch (e) { root.innerHTML = box('Não foi possível abrir', esc(friendly(e)), 'error'); return; }
    if (!info || !info.expiresAt || Date.now() > Number(info.expiresAt)) { root.innerHTML = box('QR Code expirado', 'Peça para gerar um novo QR Code na tela da ordem de serviço.', 'warn'); return; }
    const queue = []; let sent = 0;
    root.innerHTML = `
      <header class="pub-head"><div><h1>Fotos da OS</h1><p>${esc(info.company || '')}${info.osNumber ? ' · ' + osNum(info.osNumber) : ''}</p></div></header>
      <section class="pub-card"><h2><i class="fas ${isVeh(info) ? 'fa-car' : 'fa-mobile-screen-button'}"></i> Informações do ${word(info)}</h2>
        <dl class="pub-dl">${info.customer ? `<div><dt>Cliente</dt><dd>${esc(info.customer)}</dd></div>` : ''}${info.device ? `<div><dt>${Word(info)}</dt><dd>${esc(info.device)}</dd></div>` : ''}<div><dt>Tipo das fotos</dt><dd class="pub-accent">${esc(info.kindLabel || 'Fotos')}</dd></div></dl></section>
      <section class="pub-card"><h2>Adicionar fotos</h2><p class="pub-muted">Tire fotos com a câmera ou escolha da galeria.</p>
        <div class="pub-pick"><label class="pub-btn-o"><i class="fas fa-camera"></i><span>Câmera</span><input type="file" accept="image/*" capture="environment" hidden data-pick></label><label class="pub-btn-o"><i class="fas fa-images"></i><span>Galeria</span><input type="file" accept="image/*" multiple hidden data-pick></label></div>
        <div class="pub-thumbs" data-thumbs></div>
        <button type="button" class="pub-btn" data-send disabled><i class="fas fa-cloud-arrow-up"></i> Enviar fotos</button>
        <div class="pub-status" data-status></div></section>
      <p class="pub-foot" data-exp></p>`;
    const thumbs = $('[data-thumbs]', root), send = $('[data-send]', root), status = $('[data-status]', root), exp = $('[data-exp]', root);
    const draw = () => { thumbs.innerHTML = queue.map((q, i) => `<div class="pub-th" style="background-image:url('${q.preview}')"><button type="button" data-rm="${i}" aria-label="Remover">×</button></div>`).join(''); send.disabled = !queue.length; send.innerHTML = `<i class="fas fa-cloud-arrow-up"></i> Enviar ${queue.length ? queue.length + ' foto(s)' : 'fotos'}`; };
    const tick = () => { const left = Number(info.expiresAt) - Date.now(); if (left <= 0) { exp.textContent = 'Este link expirou. Peça um novo QR Code.'; send.disabled = true; return; } exp.textContent = 'Este link expira às ' + new Date(Number(info.expiresAt)).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
    tick(); setInterval(tick, 15000);
    root.addEventListener('change', async e => {
      const inp = e.target.closest('[data-pick]'); if (!inp) return; const files = [...inp.files]; inp.value = '';
      status.innerHTML = '<span class="pub-spin"></span> Preparando…';
      try { for (const f of files) { if (queue.length >= 12) break; queue.push({ image: await shrink(f, IMG[0], IMG[1]), preview: await shrink(f, IMG[2], IMG[3]) }); } status.innerHTML = ''; }
      catch (err) { status.innerHTML = `<span class="pub-err">${esc(err.message)}</span>`; }
      draw();
    });
    root.addEventListener('click', async e => {
      const rm = e.target.closest('[data-rm]'); if (rm) { queue.splice(Number(rm.dataset.rm), 1); draw(); return; }
      if (!e.target.closest('[data-send]') || !queue.length) return;
      send.disabled = true;
      try {
        while (queue.length) { status.innerHTML = `<span class="pub-spin"></span> Enviando… faltam ${queue.length}`; await api.upload(token, queue[0]); queue.shift(); sent++; draw(); }
        status.innerHTML = `<span class="pub-ok"><i class="fas fa-circle-check"></i> ${sent} foto(s) enviada(s)! Elas já aparecem no computador. Pode enviar mais se quiser.</span>`;
      } catch (err) { status.innerHTML = `<span class="pub-err">${esc(friendly(err))}</span>`; }
      finally { draw(); }
    });
  }

  /* ---------- Página: acompanhamento ---------- */
  const STEPS = [['received', 'Recebido', 'fa-inbox'], ['analyzing', 'Em análise', 'fa-magnifying-glass'], ['approved', 'Orçamento', 'fa-file-invoice-dollar'], ['in_progress', 'Em manutenção', 'fa-screwdriver-wrench'], ['ready', 'Pronto', 'fa-circle-check'], ['delivered', 'Entregue', 'fa-handshake']];
  const stepIndex = s => ({ received: 0, analyzing: 1, awaiting_approval: 2, approved: 2, in_progress: 3, awaiting_parts: 3, ready: 4, delivered: 5 }[s] ?? 0);
  async function trackPage(root) {
    if (!token) { root.innerHTML = box('Link incompleto', 'Confira o link recebido da loja.', 'error'); return; }
    let d;
    try { d = await api.track(token); } catch (e) { root.innerHTML = box('Não foi possível abrir', esc(friendly(e)), 'error'); return; }
    if (!d) { root.innerHTML = box('Ordem de serviço não encontrada', 'Este link pode ter expirado. Fale com a loja.', 'warn'); return; }
    // 39.14.5 · Devolvido sem reparo: como o cancelado, sem a linha de etapas (não houve conserto)
    const c = d.company || {}, returned = d.status === 'returned', cancelled = d.status === 'cancelled' || returned, idx = stepIndex(d.status);
    document.title = `${osNum(d.osNumber)} · ${c.name || 'Acompanhamento'}`;
    let wa = String(c.whatsapp || '').replace(/\D/g, ''); if (wa.length === 10 || wa.length === 11) wa = '55' + wa;
    const A = word(d), Ac = Word(d);
    const statusMsg = { received: `Recebemos o seu ${A}.`, analyzing: `Nossa equipe está analisando o ${A}.`, awaiting_approval: 'O orçamento está pronto e aguarda a sua aprovação.', approved: isVeh(d) ? 'Orçamento aprovado. O serviço vai começar.' : 'Orçamento aprovado. O reparo vai começar.', in_progress: `O seu ${A} está em manutenção.`, awaiting_parts: `Estamos aguardando a chegada da peça${d.partsName ? ' (' + d.partsName + ')' : ''} para continuar o serviço.`, ready: `Tudo pronto! O ${A} já pode ser retirado.`, delivered: `${Ac} entregue. Obrigado pela preferência!`, returned: `O ${A} foi devolvido sem reparo. Nada foi cobrado pelo conserto.`, cancelled: 'Esta ordem de serviço foi cancelada.' }[d.status] || '';
    const photos = k => (d.photos || []).filter(p => p.kind === k);
    const gallery = (k, t) => photos(k).length ? `<div class="pub-gal-h">${t}</div><div class="pub-gal">${photos(k).map(p => `<button type="button" class="pub-ph" style="background-image:url('${p.preview}')" data-full="${esc(p.preview)}" aria-label="Ver foto"></button>`).join('')}</div>` : '';
    // 39.14 · Com a lista de serviços e peças da OS, o cliente vê o que vai ser feito (não só o valor) antes de aprovar
    const its = Array.isArray(d.items) ? d.items : [];
    const itemList = its.length ? `<ul class="pub-itens">${its.map(i => `<li><div><b>${esc(i.name)}</b><small>${i.kind === 'service' ? 'Serviço' : 'Peça / produto'}${Number(i.qty) !== 1 ? ` · ${String(i.qty).replace('.', ',')} x ${money(i.price)}` : ''}</small></div><span>${money(Number(i.qty || 1) * Number(i.price || 0))}</span></li>`).join('')}</ul>` : '';
    const partsTxt = !its.length && d.parts ? `<div class="pub-txt" style="margin-top:0;padding-top:0;border:0"><b>Peças</b><p>${esc(d.parts)}</p></div>` : '';
    const values = d.total > 0 ? `<section class="pub-card"><h2><i class="fas fa-receipt"></i> Orçamento</h2>${itemList}${partsTxt}<div class="pub-money">${its.length ? '' : `${d.partsValue > 0 ? `<div><span>Peças</span><b>${money(d.partsValue)}</b></div>` : ''}${d.laborValue > 0 ? `<div><span>Mão de obra</span><b>${money(d.laborValue)}</b></div>` : ''}`}${d.discount > 0 ? `<div><span>Desconto</span><b>− ${money(d.discount)}</b></div>` : ''}<div class="pub-total"><span>Total</span><b>${money(d.total)}</b></div>${d.depositTotal > 0 && d.paymentStatus !== 'paid' ? `<div><span>Sinal pago</span><b>− ${money(d.depositTotal)}</b></div><div class="pub-total"><span>Saldo a pagar</span><b>${money(Math.max(0, d.total - d.depositTotal))}</b></div>` : ''}</div><p class="pub-pay">${d.paymentStatus === 'no_charge' ? 'Sem cobrança (devolvido sem reparo)' : d.paymentStatus === 'paid' ?'<i class="fas fa-circle-check"></i> Pago' : ['receivable', 'partial_receivable'].includes(d.paymentStatus) ? 'A receber' : d.depositTotal > 0 ? 'Sinal pago · saldo na retirada' : 'Pagamento na retirada'}</p></section>` : '';
    root.innerHTML = `
      <header class="pub-head pub-head-brand">${c.logoUrl ? `<img src="${esc(c.logoUrl)}" alt="" class="pub-logo" onerror="this.remove()">` : ''}<div><h1>${esc(c.name || 'Assistência técnica')}</h1><p>Acompanhamento da ordem de serviço</p></div></header>
      <section class="pub-card pub-hero ${cancelled ? 'is-cancel' : ''}"><div class="pub-os">${osNum(d.osNumber)}</div><div class="pub-status-big">${esc(d.statusLabel || '')}</div><p>${esc(statusMsg)}</p>
        ${cancelled ? (d.cancelReason ? `<p class="pub-muted">Motivo: ${esc(d.cancelReason)}</p>` : '') : `<ol class="pub-steps">${STEPS.map((s, i) => `<li class="${i < idx ? 'done' : i === idx ? 'now' : ''}"><span><i class="fas ${s[2]}"></i></span><small>${s[1]}</small></li>`).join('')}</ol>`}
        ${d.status === 'awaiting_parts' && d.partsEta ? `<p class="pub-eta"><i class="fas fa-box-open"></i> Previsão de chegada da peça: <b>${dt(d.partsEta)}</b></p>` : ''}
        ${d.estimatedDate && !['delivered', 'cancelled', 'returned'].includes(d.status) ?`<p class="pub-eta"><i class="fas fa-calendar-day"></i> Previsão: <b>${dt(d.estimatedDate)}</b></p>` : ''}
        ${askable(d) ? `<button type="button" class="pub-btn pub-go pub-cta" data-pro="goto"><i class="fas fa-file-signature"></i> Ver orçamento e responder</button>` : ''}</section>
      <section class="pub-card"><h2><i class="fas ${isVeh(d) ? 'fa-car' : 'fa-mobile-screen-button'}"></i> ${Ac}</h2><dl class="pub-dl"><div><dt>Cliente</dt><dd>${esc(d.customer || '—')}</dd></div><div><dt>${Ac}</dt><dd>${esc(d.device || '—')}</dd></div><div><dt>Entrada</dt><dd>${dt(d.createdAt)}</dd></div>${d.warrantyDays ? `<div><dt>Garantia</dt><dd>${d.warrantyDays} dias</dd></div>` : ''}</dl>
        ${d.problem ? `<div class="pub-txt"><b>Problema relatado</b><p>${esc(d.problem)}</p></div>` : ''}${d.diagnosis ? `<div class="pub-txt"><b>Diagnóstico</b><p>${esc(d.diagnosis)}</p></div>` : ''}${d.service ? `<div class="pub-txt"><b>Serviço</b><p>${esc(d.service)}</p></div>` : ''}</section>
      ${values}
      ${proCards(d)}
      ${(d.photos || []).length ? `<section class="pub-card"><h2><i class="fas fa-camera"></i> Fotos do ${A}</h2>${gallery('entrada', 'Na entrada')}${gallery('saida', 'Na entrega')}</section>` : ''}
      ${(d.history || []).length ? `<section class="pub-card"><h2><i class="fas fa-clock-rotate-left"></i> Histórico</h2><ul class="pub-hist">${d.history.slice().reverse().map(h => `<li><b>${esc(h.label)}</b><small>${dt(h.at, true)}</small></li>`).join('')}</ul></section>` : ''}
      ${(wa.length >= 12 || c.phone) ? `<div class="pub-contact">${wa.length >= 12 ? `<a class="pub-btn pub-wa" href="https://wa.me/${wa}?text=${encodeURIComponent('Olá! Gostaria de falar sobre a ordem de serviço ' + osNum(d.osNumber) + '.')}" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> Falar no WhatsApp</a>` : ''}${c.phone ? `<a class="pub-btn-o" href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}"><i class="fas fa-phone"></i> Ligar</a>` : ''}</div>` : ''}
      <p class="pub-foot">${c.address ? esc(c.address) + '<br>' : ''}Atualizado em ${dt(d.publishedAt, true)}</p>`;
    root.onclick = e => { if (proClick(e, d)) return; const p = e.target.closest('[data-full]'); if (!p) return; const v = document.createElement('div'); v.className = 'pub-viewer'; v.innerHTML = `<img src="${p.dataset.full}" alt="">`; v.onclick = () => v.remove(); document.body.appendChild(v); };
    const want = new URLSearchParams(location.search).get('assinar'); if (want && !proAsked) { proAsked = true; const k = want === 'saida' ? 'out' : 'in'; const c = k === 'in' ? d.checkIn : d.checkOut; if (c && !c.signed) setTimeout(() => signModal(d, k), 300); }
  }
  /* ---------- 35.22 · Aprovação do orçamento, checklist assinado e garantia ---------- */
  let proAsked = false;
  const LKEY = 'dp_os_resp_' + token;
  const localResp = () => { try { return JSON.parse(localStorage.getItem(LKEY) || '{}'); } catch { return {}; } };
  const saveResp = (k, v) => { try { const x = localResp(); x[k] = v; localStorage.setItem(LKEY, JSON.stringify(x)); } catch { } };
  const askable = d => d.status === 'awaiting_approval' && Number(d.total) > 0 && !(d.approval && d.approval.decision) && !localResp().approval;
  // 39.14 · O que o cliente está aprovando, em uma linha (serviços e peças da OS, ou o "serviço a realizar")
  const oQue = d => { const n = (Array.isArray(d.items) ? d.items : []).map(i => String(i.name || '').trim()).filter(Boolean); return n.length ? n.join('; ') : String(d.service || '').trim(); };
  function proCards(d) {
    const lr = localResp(); let h = '';
    if (d.isWarranty) h += `<section class="pub-card pub-warr-ret"><h2><i class="fas fa-shield-halved"></i> Atendimento em garantia</h2><p class="pub-muted" style="margin:0">Esta OS é um retorno em garantia${d.warrantyOf ? ' da ' + osNum(d.warrantyOf) : ''}. Não há cobrança pelo serviço coberto.</p></section>`;
    // Orçamento aguardando o cliente
    if (d.approval && d.approval.decision) {
      const ok = d.approval.decision === 'approved';
      h += `<section class="pub-card pub-appr ${ok ? 'ok' : 'no'}"><h2><i class="fas ${ok ? 'fa-circle-check' : 'fa-circle-xmark'}"></i> Orçamento ${ok ? 'aprovado' : 'recusado'}</h2><p class="pub-muted" style="margin:0">${ok ? 'Você aprovou' : 'Você recusou'} este orçamento${d.approval.at ? ' em ' + dt(d.approval.at, true) : ''}${d.approval.name ? ' · ' + esc(d.approval.name) : ''}.${ok ? ' O reparo já pode começar.' : ' A loja vai entrar em contato.'}</p></section>`;
    } else if (lr.approval) {
      h += `<section class="pub-card pub-appr wait"><h2><i class="fas fa-paper-plane"></i> Resposta enviada</h2><p class="pub-muted" style="margin:0">Você ${lr.approval === 'approve' ? 'aprovou' : 'recusou'} o orçamento. A loja já foi avisada e esta página atualiza sozinha.</p></section>`;
    } else if (askable(d)) {
      h += `<section class="pub-card pub-appr ask"><h2><i class="fas fa-file-signature"></i> Seu orçamento: ${money(d.total)}</h2>${oQue(d) ? `<p class="pub-oque"><b>O que vai ser feito:</b> ${esc(oQue(d))}</p>` : ''}<p class="pub-muted">Confira o serviço e os valores acima. Ao aprovar, a loja começa o reparo.</p><div class="pub-appr-btns"><button type="button" class="pub-btn pub-go" data-pro="approve"><i class="fas fa-thumbs-up"></i> Aprovar orçamento</button><button type="button" class="pub-btn-o pub-no" data-pro="reject"><i class="fas fa-thumbs-down"></i> Recusar</button></div></section>`;
    }
    // Checklist técnico de entrada e saída
    for (const [k, c, t] of [['in', d.checkIn, 'Checklist de entrada'], ['out', d.checkOut, 'Checklist de saída']]) {
      if (!c || !(c.items || []).length) continue;
      const signedLocal = lr['sign_' + k];
      h += `<section class="pub-card"><h2><i class="fas fa-list-check"></i> ${t}${c.model ? ' · ' + esc(c.model) : ''}</h2><ul class="pub-check">${c.items.map(i => `<li class="${i.state}"><i class="fas ${i.state === 'ok' ? 'fa-circle-check' : i.state === 'fail' ? 'fa-circle-xmark' : 'fa-circle-minus'}"></i><span>${esc(i.label)}</span><b>${i.state === 'ok' ? 'OK' : i.state === 'fail' ? 'Com defeito' : 'Não testado'}</b></li>`).join('')}</ul>
        ${c.battery ? `<p class="pub-muted" style="margin:10px 0 0">${esc(c.gauge || 'Saúde da bateria')}: <b>${esc(c.battery)}%</b></p>` : ''}${c.powersOn === false ? `<p class="pub-muted" style="margin:6px 0 0;color:var(--pr)"><b>${isVeh(d) ? 'O veículo não dá partida' : 'O aparelho não liga'}</b></p>` : ''}${c.notes ? `<p class="pub-muted" style="margin:6px 0 0">${esc(c.notes)}</p>` : ''}
        ${c.signed ? `<p class="pub-signed"><i class="fas fa-signature"></i> Assinado${c.signedName ? ' por ' + esc(c.signedName) : ''}${c.signedAt ? ' em ' + dt(c.signedAt, true) : ''}</p>` : signedLocal ? '<p class="pub-signed"><i class="fas fa-paper-plane"></i> Assinatura enviada. A loja já recebeu.</p>' : `<button type="button" class="pub-btn" data-pro="sign" data-k="${k}"><i class="fas fa-signature"></i> Conferir e assinar</button>`}</section>`;
    }
    // Garantia
    if (d.warrantyUntil) {
      const valid = Date.now() <= Number(d.warrantyUntil);
      h += `<section class="pub-card pub-warr ${valid ? 'ok' : 'exp'}"><h2><i class="fas fa-shield-halved"></i> Garantia ${valid ? 'válida' : 'encerrada'}</h2><p class="pub-muted" style="margin:0">${d.warrantyDays ? d.warrantyDays + ' dias · ' : ''}${valid ? 'válida até' : 'terminou em'} <b>${dt(d.warrantyUntil)}</b>. ${valid ? 'Se o mesmo defeito voltar, fale com a loja.' : ''}</p></section>`;
    }
    return h;
  }
  function proClick(e, d) {
    const b = e.target.closest('[data-pro]'); if (!b) return false;
    if (b.dataset.pro === 'goto') { const a = document.querySelector('.pub-appr.ask'); if (a) a.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    else if (b.dataset.pro === 'approve') signModal(d, 'approve');
    else if (b.dataset.pro === 'reject') rejectModal(d);
    else if (b.dataset.pro === 'sign') signModal(d, b.dataset.k);
    return true;
  }
  function modal(html) { const m = document.createElement('div'); m.className = 'pub-modal'; m.innerHTML = `<div class="pub-modal-box">${html}</div>`; m.addEventListener('click', e => { if (e.target === m || e.target.closest('[data-x]')) m.remove(); }); document.body.appendChild(m); return m; }
  function pad(canvas) {
    const g = canvas.getContext('2d'); let drawing = false, dirty = false, last = null;
    const fit = () => { const r = canvas.getBoundingClientRect(), s = window.devicePixelRatio || 1; canvas.width = Math.round(r.width * s); canvas.height = Math.round(r.height * s); g.setTransform(s, 0, 0, s, 0, 0); g.lineWidth = 2.4; g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#0f172a'; };
    fit();
    const pt = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
    canvas.addEventListener('pointerdown', e => { e.preventDefault(); try { canvas.setPointerCapture(e.pointerId); } catch (er) { } drawing = true; last = pt(e); g.beginPath(); g.arc(last.x, last.y, 1.1, 0, 7); g.fillStyle = '#0f172a'; g.fill(); dirty = true; });
    canvas.addEventListener('pointermove', e => { if (!drawing) return; e.preventDefault(); const p = pt(e); g.beginPath(); g.moveTo(last.x, last.y); g.lineTo(p.x, p.y); g.stroke(); last = p; dirty = true; });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(ev => canvas.addEventListener(ev, () => { drawing = false; }));
    return { clear() { g.clearRect(0, 0, canvas.width, canvas.height); dirty = false; }, empty: () => !dirty, data() { const c = document.createElement('canvas'), w = 600, h = Math.round(600 * canvas.height / canvas.width); c.width = w; c.height = h; const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.drawImage(canvas, 0, 0, w, h); return c.toDataURL('image/png'); } };
  }
  function signModal(d, kind) {
    const isAppr = kind === 'approve', c = kind === 'in' ? d.checkIn : kind === 'out' ? d.checkOut : null;
    const terms = kind === 'in' ? String(d.entryTerms || '').trim() : ''; // 38.4 · termo de entrada antes de assinar
    const m = modal(`<h2>${isAppr ? '<i class="fas fa-thumbs-up"></i> Aprovar orçamento' : '<i class="fas fa-signature"></i> ' + (kind === 'in' ? 'Checklist de entrada' : 'Checklist de saída')}</h2>
      <p class="pub-muted">${isAppr ? `${oQue(d) ? `Você autoriza: <b>${esc(oQue(d))}</b>.<br>` : ''}Valor: <b>${money(d.total)}</b>. Assine abaixo para autorizar o serviço.` : `Confirmo que conferi o estado do ${word(d)} ${kind === 'in' ? 'na entrega para o conserto' : 'na retirada'}${c && c.items ? ', conforme o checklist acima' : ''}${terms ? ', e concordo com o termo de entrada abaixo' : ''}.`}</p>
      ${terms ? `<div class="pub-txt" style="max-height:190px;overflow:auto;margin:0 0 12px"><b>Termo de entrada</b><p style="white-space:pre-wrap">${esc(terms)}</p></div>` : ''}
      <label class="pub-lbl">Seu nome<input type="text" maxlength="80" data-nm value="${esc(d.customer || '')}"></label>
      <label class="pub-lbl">Assinatura <small>(use o dedo)</small></label><canvas class="pub-pad"></canvas>
      <div class="pub-modal-acts"><button type="button" class="pub-btn-o" data-clear><i class="fas fa-eraser"></i> Limpar</button><button type="button" class="pub-btn" data-go><i class="fas fa-check"></i> ${isAppr ? 'Aprovar' : 'Assinar'}</button></div>
      <button type="button" class="pub-link" data-x>Cancelar</button><div class="pub-status" data-st></div>`);
    const p = pad(m.querySelector('canvas'));
    m.querySelector('[data-clear]').onclick = () => p.clear();
    m.querySelector('[data-go]').onclick = async ev => {
      const name = m.querySelector('[data-nm]').value.trim(), st = m.querySelector('[data-st]');
      if (!name) { st.innerHTML = '<span class="pub-err">Informe o seu nome.</span>'; return; }
      if (p.empty()) { st.innerHTML = '<span class="pub-err">Faça a sua assinatura no quadro.</span>'; return; }
      ev.currentTarget.disabled = true; st.innerHTML = '<span class="pub-spin"></span> Enviando…';
      try {
        await api.respond(token, { type: isAppr ? 'approve' : kind === 'in' ? 'sign_in' : 'sign_out', name, signature: p.data() });
        saveResp(isAppr ? 'approval' : 'sign_' + kind, isAppr ? 'approve' : 1); m.remove(); trackPage(document.getElementById('app'));
      } catch (err) { ev.currentTarget.disabled = false; st.innerHTML = `<span class="pub-err">${esc(friendly(err))}</span>`; }
    };
  }
  function rejectModal(d) {
    const m = modal(`<h2><i class="fas fa-thumbs-down"></i> Recusar orçamento</h2><p class="pub-muted">Conte o motivo (opcional). A loja vai entrar em contato para combinar a devolução do ${word(d)}.</p>
      <label class="pub-lbl">Motivo<textarea rows="3" maxlength="300" data-nt placeholder="Ex.: achei caro, vou pensar"></textarea></label>
      <div class="pub-modal-acts"><button type="button" class="pub-btn-o" data-x>Voltar</button><button type="button" class="pub-btn pub-red" data-go><i class="fas fa-paper-plane"></i> Recusar</button></div><div class="pub-status" data-st></div>`);
    m.querySelector('[data-go]').onclick = async ev => {
      const st = m.querySelector('[data-st]'); ev.currentTarget.disabled = true; st.innerHTML = '<span class="pub-spin"></span> Enviando…';
      try { await api.respond(token, { type: 'reject', note: m.querySelector('[data-nt]').value.trim(), name: d.customer || '' }); saveResp('approval', 'reject'); m.remove(); trackPage(document.getElementById('app')); }
      catch (err) { ev.currentTarget.disabled = false; st.innerHTML = `<span class="pub-err">${esc(friendly(err))}</span>`; }
    };
  }
  function box(title, text, kind = '') { return `<div class="pub-card pub-msg ${kind}"><i class="fas ${kind === 'error' ? 'fa-circle-exclamation' : kind === 'warn' ? 'fa-clock' : 'fa-circle-info'}"></i><h1>${esc(title)}</h1><p>${text}</p></div>`; }
  const start = () => {
    const root = document.getElementById('app'); if (!root) return;
    if (B === 'demo') { const n = document.createElement('div'); n.className = 'pub-demo'; n.innerHTML = '<i class="fas fa-flask"></i> Página de <b>demonstração</b> do DistribuiPro · dados fictícios'; document.body.insertBefore(n, root); }
    if (document.body.dataset.page === 'capture') capturePage(root);
    else { trackPage(root); setInterval(() => { if (!document.hidden && !document.querySelector('.pub-viewer') && !document.querySelector('.pub-modal')) trackPage(root); }, 60000); }
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
