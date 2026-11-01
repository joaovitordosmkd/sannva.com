/* DistribuiPRO — Foto pela câmera em todos os campos de foto (v1)
   Ao tocar em qualquer campo de foto (input type=file que aceita imagens), aparece a escolha:
   "Tirar foto" (câmera do celular; no computador, a webcam) ou "Escolher dos arquivos".
   A foto tirada entra no próprio campo, como se tivesse sido escolhida nos arquivos,
   então cada tela continua salvando do mesmo jeito (OS, produto, usuário, logo...).
   Opções no campo: data-no-camera (não oferece a câmera), data-camera="user" (câmera da frente),
   data-camera-max="800" (lado maior da foto tirada, em pixels; padrão 1600).
   Funciona nas 5 versões: não depende do banco de dados nem de bibliotecas. */
(function () {
  'use strict';
  if (window.DPCamera) return;

  const MAX = 1600, QUALITY = 0.85;
  const ua = navigator.userAgent || '';
  const MOBILE = !!(navigator.userAgentData && navigator.userAgentData.mobile) || /Android|iPhone|iPad|iPod|Mobile/i.test(ua)
    || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1); // iPad se apresenta como Mac
  const CAN_PASS = (() => { try { const dt = new DataTransfer(); dt.items.add(new File(['x'], 'x.txt')); return dt.files.length === 1; } catch (e) { return false; } })();
  const CAN_WEBCAM = !!(window.isSecureContext && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  let hasWebcam = false;
  function findWebcam() {
    if (MOBILE || !CAN_WEBCAM || !navigator.mediaDevices.enumerateDevices) return;
    navigator.mediaDevices.enumerateDevices().then(l => { hasWebcam = l.some(d => d.kind === 'videoinput'); }).catch(() => { });
  }
  findWebcam();
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) navigator.mediaDevices.addEventListener('devicechange', findWebcam);

  const nativeClick = HTMLInputElement.prototype.click;
  const nativePicker = HTMLInputElement.prototype.showPicker;
  const facingOf = inp => (inp.getAttribute('data-camera') === 'user' ? 'user' : 'environment');
  const maxOf = inp => Math.max(200, parseInt(inp.getAttribute('data-camera-max'), 10) || MAX);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function acceptsImages(inp) {
    const acc = String(inp.accept || '').toLowerCase();
    return acc.split(',').some(a => { a = a.trim(); return a.startsWith('image/') || /^\.(jpe?g|png|webp|gif|heic|heif|bmp)$/.test(a); });
  }
  function eligible(inp) {
    if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'file' || inp.disabled || inp.__dpCamPass) return false;
    if (inp.hasAttribute('capture') || inp.hasAttribute('data-no-camera') || !acceptsImages(inp)) return false;
    return MOBILE || hasWebcam;
  }
  // Abre a janela normal de arquivos do campo (sem passar de novo pela escolha)
  function pickFiles(inp) {
    inp.__dpCamPass = true;
    try { nativeClick.call(inp); } finally { inp.__dpCamPass = false; }
  }
  // Coloca a foto no campo e avisa a tela, como se o usuário tivesse escolhido o arquivo
  function deliver(inp, file) {
    const dt = new DataTransfer(); dt.items.add(file);
    inp.files = dt.files;
    inp.dispatchEvent(new Event('input', { bubbles: true }));
    inp.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function photoName() {
    const d = new Date(), p = n => String(n).padStart(2, '0');
    return `foto-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}.jpg`;
  }
  function toFile(canvas) {
    return new Promise(resolve => canvas.toBlob(b => resolve(b ? new File([b], photoName(), { type: 'image/jpeg', lastModified: Date.now() }) : null), 'image/jpeg', QUALITY));
  }
  // Foto do celular costuma ter 3–6 MB: reduz para o tamanho certo antes de entregar à tela
  function shrink(file, max) {
    return new Promise(resolve => {
      const url = URL.createObjectURL(file), img = new Image();
      const done = f => { URL.revokeObjectURL(url); resolve(f); };
      img.onerror = () => done(file);
      img.onload = async () => {
        const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s));
        const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
        done((await toFile(c)) || file);
      };
      img.src = url;
    });
  }

  /* ---------- Aparência ---------- */
  const ICON = {
    cam: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.6"/></svg>',
    pics: '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
    x: '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>'
  };
  function css() {
    if (document.getElementById('dpcamCss')) return;
    const st = document.createElement('style'); st.id = 'dpcamCss';
    st.textContent = `
.dpcam-back{position:fixed;inset:0;z-index:2147483000;background:rgba(2,6,23,.6);display:flex;align-items:center;justify-content:center;padding:16px;animation:dpcamFade .15s ease}
.dpcam-sheet,.dpcam-box{background:var(--bg-modal,#161b2e);color:var(--text-primary,#f1f5f9);border:1px solid var(--border-hover,rgba(255,255,255,.12));border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.45);font-family:inherit}
.dpcam-sheet{width:100%;max-width:380px;padding:18px;display:flex;flex-direction:column;gap:10px;animation:dpcamUp .18s ease}
.dpcam-title{font-weight:700;font-size:16px;color:var(--text-heading,inherit);margin:0 2px 4px;display:flex;align-items:center;justify-content:space-between}
.dpcam-opt{display:flex;align-items:center;gap:14px;width:100%;text-align:left;padding:14px;border-radius:14px;border:1px solid var(--border-color,rgba(255,255,255,.08));background:var(--bg-surface,#242b45);color:inherit;font:inherit;cursor:pointer;transition:border-color .15s,background .15s}
.dpcam-opt:hover,.dpcam-opt:focus-visible{border-color:var(--accent,#6366f1);outline:none}
.dpcam-opt b{display:block;font-size:15px}.dpcam-opt small{display:block;font-size:12.5px;color:var(--text-secondary,#94a3b8);margin-top:2px}
.dpcam-ico{flex:0 0 44px;height:44px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:var(--accent-muted,rgba(99,102,241,.15));color:var(--accent,#6366f1)}
.dpcam-cancel{margin-top:2px;padding:12px;border:0;border-radius:12px;background:transparent;color:var(--text-secondary,#94a3b8);font:inherit;font-weight:600;cursor:pointer}
.dpcam-cancel:hover{color:var(--text-primary,#f1f5f9)}
.dpcam-x{width:34px;height:34px;border-radius:10px;border:0;background:transparent;color:var(--text-secondary,#94a3b8);display:flex;align-items:center;justify-content:center;cursor:pointer}
.dpcam-x:hover{background:var(--bg-surface,#242b45);color:var(--text-primary,#f1f5f9)}
.dpcam-box{width:100%;max-width:760px;max-height:calc(100dvh - 32px);display:flex;flex-direction:column;overflow:hidden}
.dpcam-head{display:flex;align-items:center;justify-content:space-between;padding:12px 12px 12px 18px;font-weight:700}
.dpcam-head b{display:flex;align-items:center;gap:8px}
.dpcam-view{position:relative;background:#000;flex:1;min-height:220px;display:flex;align-items:center;justify-content:center}
.dpcam-view video,.dpcam-view img{display:block;max-width:100%;max-height:calc(100dvh - 190px);object-fit:contain}
.dpcam-view [hidden]{display:none!important}
.dpcam-msg{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px;color:#e2e8f0;font-size:14px;line-height:1.5}
.dpcam-msg:empty{display:none}.dpcam-msg.is-err{color:#fecaca}
.dpcam-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:12px}
.dpcam-bar .dpcam-sp{flex:1}
.dpcam-bar [hidden]{display:none!important}
.dpcam-dev{max-width:220px;padding:9px 10px;border-radius:10px;border:1px solid var(--border-color,rgba(255,255,255,.08));background:var(--bg-input,#1a1f35);color:inherit;font:inherit;font-size:13px}
.dpcam-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;padding:10px 16px;border-radius:12px;border:1px solid var(--border-hover,rgba(255,255,255,.12));background:transparent;color:inherit;font:inherit;font-weight:600;font-size:14px;cursor:pointer}
.dpcam-btn:hover{border-color:var(--accent,#6366f1)}
.dpcam-btn.dpcam-main{background:var(--accent,#6366f1);border-color:var(--accent,#6366f1);color:#fff}
.dpcam-btn:disabled{opacity:.5;cursor:default}
.dpcam-busy{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:2147483001;background:var(--bg-modal,#161b2e);color:var(--text-primary,#f1f5f9);border:1px solid var(--border-hover,rgba(255,255,255,.12));border-radius:999px;padding:10px 18px;font-size:14px;box-shadow:0 10px 30px rgba(0,0,0,.35)}
@media (max-width:600px){
  .dpcam-back.is-sheet{align-items:flex-end;padding:0}
  .dpcam-back.is-sheet .dpcam-sheet{max-width:none;border-radius:20px 20px 0 0;border-bottom:0;padding:10px 16px calc(16px + env(safe-area-inset-bottom))}
  .dpcam-back.is-sheet .dpcam-sheet::before{content:"";align-self:center;width:40px;height:4px;border-radius:4px;background:var(--border-hover,rgba(255,255,255,.2));margin-bottom:6px}
  .dpcam-back.is-cam{padding:0}
  .dpcam-box{max-width:none;max-height:none;height:100%;border-radius:0;border:0}
  .dpcam-bar .dpcam-btn{flex:1;justify-content:center}
  .dpcam-bar .dpcam-sp{display:none}.dpcam-dev{max-width:none;flex:1 1 100%}
}
@keyframes dpcamFade{from{opacity:0}}@keyframes dpcamUp{from{transform:translateY(16px);opacity:.6}}`;
    document.head.appendChild(st);
  }
  let openBack = null;
  function mount(html, cls) {
    css(); closeAll();
    const back = document.createElement('div'); back.className = 'dpcam-back ' + cls; back.innerHTML = html;
    document.body.appendChild(back);
    return (openBack = back);
  }
  let closeCurrent = null;
  function closeAll() { if (closeCurrent) { const f = closeCurrent; closeCurrent = null; f(); } }
  // Esc fecha só a janela da câmera, não a OS/cadastro aberto por baixo
  function onEsc(e) { if (e.key === 'Escape' && closeCurrent && openBack && openBack.isConnected) { e.preventDefault(); e.stopImmediatePropagation(); closeAll(); } }
  document.addEventListener('keydown', onEsc, true);
  function busy(on) {
    let b = document.getElementById('dpcamBusy');
    if (!on) { if (b) b.remove(); return; }
    css(); if (!b) { b = document.createElement('div'); b.id = 'dpcamBusy'; b.className = 'dpcam-busy'; b.setAttribute('role', 'status'); document.body.appendChild(b); }
    b.textContent = 'Preparando a foto…';
  }

  /* ---------- Escolha: tirar foto ou escolher dos arquivos ---------- */
  function choose(inp) {
    // Igual ao navegador, que só abre uma janela de arquivos por vez: se um mesmo toque chamar
    // dois campos (ex.: a área da logo nas Configurações), vale o primeiro
    if (openBack && openBack.isConnected) return;
    const sub = MOBILE ? ['Abre a câmera do celular', 'Galeria ou fotos salvas'] : ['Usa a webcam do computador', 'Fotos salvas no computador'];
    const back = mount(`<div class="dpcam-sheet" role="dialog" aria-modal="true" aria-labelledby="dpcamTitle">
      <div class="dpcam-title"><span id="dpcamTitle">Adicionar foto</span><button type="button" class="dpcam-x" data-act="cancel" aria-label="Fechar">${ICON.x}</button></div>
      <button type="button" class="dpcam-opt" data-act="camera"><span class="dpcam-ico">${ICON.cam}</span><span><b>Tirar foto</b><small>${sub[0]}</small></span></button>
      <button type="button" class="dpcam-opt" data-act="files"><span class="dpcam-ico">${ICON.pics}</span><span><b>Escolher dos arquivos</b><small>${sub[1]}</small></span></button>
      <button type="button" class="dpcam-cancel" data-act="cancel">Cancelar</button></div>`, 'is-sheet');
    closeCurrent = () => back.remove();
    back.addEventListener('click', e => {
      e.stopPropagation(); // a tela por baixo não "vê" o clique (não fecha a OS/cadastro aberto)
      if (e.target === back) { closeAll(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      closeAll();
      if (act === 'files') pickFiles(inp);
      else if (act === 'camera') (MOBILE ? phoneCamera : webcam)(inp);
    });
    back.querySelector('[data-act="camera"]').focus();
  }

  /* ---------- Celular: abre o app de câmera ---------- */
  function phoneCamera(inp) {
    document.querySelectorAll('input[data-dpcam-shot]').forEach(n => n.remove());
    if (!CAN_PASS) {
      // Navegador antigo: abre a câmera no próprio campo (a foto vai sem reduzir)
      inp.setAttribute('capture', facingOf(inp));
      try { nativeClick.call(inp); } finally { setTimeout(() => inp.removeAttribute('capture'), 1500); }
      return;
    }
    const cam = document.createElement('input');
    cam.type = 'file'; cam.accept = 'image/*'; cam.setAttribute('capture', facingOf(inp)); cam.setAttribute('data-dpcam-shot', '');
    cam.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0';
    cam.addEventListener('change', async () => {
      const f = cam.files && cam.files[0]; cam.remove(); if (!f) return;
      busy(true);
      try { deliver(inp, await shrink(f, maxOf(inp))); } finally { busy(false); }
    });
    document.body.appendChild(cam);
    nativeClick.call(cam);
  }

  /* ---------- Computador: webcam dentro da própria tela ---------- */
  function errText(err) {
    const n = err && err.name;
    if (n === 'NotAllowedError' || n === 'SecurityError') return 'A câmera foi bloqueada. Libere o acesso à câmera (ícone na barra de endereço do navegador ou em Configurações do Windows › Privacidade › Câmera) e tente de novo.';
    if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'Nenhuma câmera foi encontrada neste computador.';
    if (n === 'NotReadableError' || n === 'AbortError') return 'A câmera está sendo usada por outro programa. Feche o outro programa e tente de novo.';
    return 'Não foi possível ligar a câmera.';
  }
  function webcam(inp) {
    const back = mount(`<div class="dpcam-box" role="dialog" aria-modal="true" aria-label="Tirar foto">
      <div class="dpcam-head"><b>${ICON.cam} Tirar foto</b><button type="button" class="dpcam-x" data-act="close" aria-label="Fechar">${ICON.x}</button></div>
      <div class="dpcam-view"><video playsinline muted autoplay></video><img alt="Foto tirada" hidden><div class="dpcam-msg">Ligando a câmera…</div></div>
      <div class="dpcam-bar">
        <select class="dpcam-dev" aria-label="Escolher câmera" hidden></select><span class="dpcam-sp"></span>
        <button type="button" class="dpcam-btn" data-act="files">${ICON.pics} Escolher arquivo</button>
        <button type="button" class="dpcam-btn dpcam-main" data-act="shoot" disabled>${ICON.cam} Capturar</button>
        <button type="button" class="dpcam-btn" data-act="retake" hidden>Tirar de novo</button>
        <button type="button" class="dpcam-btn dpcam-main" data-act="use" hidden>Usar esta foto</button>
      </div></div>`, 'is-cam');
    const $ = s => back.querySelector(s);
    const video = $('video'), img = $('img'), msgEl = $('.dpcam-msg'), sel = $('.dpcam-dev');
    const btn = a => $(`[data-act="${a}"]`);
    let stream = null, shot = null, shotUrl = '', closed = false;
    const msg = (t, err) => { msgEl.textContent = t || ''; msgEl.classList.toggle('is-err', !!err); };
    const stop = () => { if (stream) stream.getTracks().forEach(t => t.stop()); stream = null; };
    const showShot = on => { img.hidden = !on; video.hidden = on; btn('shoot').hidden = on; btn('retake').hidden = !on; btn('use').hidden = !on; sel.disabled = on; };
    closeCurrent = () => { closed = true; stop(); if (shotUrl) URL.revokeObjectURL(shotUrl); back.remove(); };

    async function start(deviceId) {
      stop(); showShot(false); btn('shoot').disabled = true; msg('Ligando a câmera…');
      const size = { width: { ideal: 1920 }, height: { ideal: 1080 } };
      try {
        const s = await navigator.mediaDevices.getUserMedia({ audio: false, video: deviceId ? { deviceId: { exact: deviceId }, ...size } : { facingMode: facingOf(inp), ...size } });
        if (closed) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s; video.srcObject = s; await video.play().catch(() => { });
        msg(''); btn('shoot').disabled = false; btn('shoot').focus();
        const cams = (await navigator.mediaDevices.enumerateDevices()).filter(d => d.kind === 'videoinput');
        if (cams.length > 1) {
          sel.innerHTML = cams.map((c, i) => `<option value="${esc(c.deviceId)}">${esc(c.label || 'Câmera ' + (i + 1))}</option>`).join('');
          const cur = s.getVideoTracks()[0]?.getSettings?.().deviceId; if (cams.some(c => c.deviceId === cur)) sel.value = cur;
          sel.hidden = false;
        }
      } catch (err) { if (!closed) { msg(errText(err), true); btn('files').focus(); } }
    }
    async function capture() {
      const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return;
      const s = Math.min(1, maxOf(inp) / Math.max(w, h));
      const c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
      c.getContext('2d').drawImage(video, 0, 0, c.width, c.height);
      shot = await toFile(c); if (!shot || closed) return;
      if (shotUrl) URL.revokeObjectURL(shotUrl);
      shotUrl = URL.createObjectURL(shot); img.src = shotUrl; showShot(true); btn('use').focus();
    }
    back.addEventListener('click', e => {
      e.stopPropagation();
      if (e.target === back) { closeAll(); return; }
      const act = e.target.closest('[data-act]')?.dataset.act; if (!act) return;
      if (act === 'close') closeAll();
      else if (act === 'files') { closeAll(); pickFiles(inp); }
      else if (act === 'shoot') capture();
      else if (act === 'retake') { showShot(false); btn('shoot').focus(); }
      else if (act === 'use' && shot) { const f = shot; closeAll(); deliver(inp, f); }
    });
    sel.addEventListener('change', () => start(sel.value));
    start();
  }

  /* ---------- Liga em todos os campos de foto da tela ---------- */
  // Clique no campo (ou no botão/label que abre o campo)
  document.addEventListener('click', e => {
    const inp = e.target;
    if (!eligible(inp)) return;
    e.preventDefault();
    choose(inp);
  }, true);
  // Campos criados pelo código e abertos sem estar na tela (ex.: logo nas Configurações)
  HTMLInputElement.prototype.click = function () {
    if (!this.isConnected && eligible(this)) { choose(this); return; }
    return nativeClick.apply(this, arguments);
  };
  if (nativePicker) HTMLInputElement.prototype.showPicker = function () {
    if (eligible(this)) { choose(this); return; }
    return nativePicker.apply(this, arguments);
  };

  // choose(campo): mostra a escolha · camera(campo): abre direto a câmera · pickFiles(campo): abre direto os arquivos
  window.DPCamera = { choose, camera: inp => (MOBILE ? phoneCamera : webcam)(inp), pickFiles, isMobile: MOBILE, get hasWebcam() { return hasWebcam; } };
})();
