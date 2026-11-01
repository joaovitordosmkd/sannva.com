/* DistribuiPro 39.1 · Foto do produto na hospedagem (versão Firebase)
   A foto comprimida pelo cadastro vai para api/upload-imagem.php (PHP na hospedagem do cliente), que
   grava em img/produtos/ e devolve o link. O produto guarda só o link (imageType 'url'): o documento
   fica pequeno e a foto não entra em nenhuma leitura do Firestore.
   Sem PHP na hospedagem (ou se o envio falhar) enviar() devolve '' e o cadastro guarda a foto
   dentro do produto, como antes. Carregado pelo config/firebase-config.js. */
(function () {
    'use strict';
    if (window.DPFotoHospedagem) return;
    var ENDPOINT = 'api/upload-imagem.php';
    function slug(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60); }
    window.DPFotoHospedagem = {
        /** dataUrl (image/webp ou jpeg já comprimida) -> 'img/produtos/arquivo.webp' ou '' se não deu. */
        enviar: async function (dataUrl, nome, apagar) {
            try {
                if (!/^data:image\//i.test(String(dataUrl || ''))) return '';
                if (!/^https?:$/.test(location.protocol) || typeof fetch !== 'function' || typeof FormData === 'undefined') return '';
                var user = firebase.auth && firebase.auth().currentUser;
                if (!user) return '';
                var token = await user.getIdToken();
                var blob = await (await fetch(dataUrl)).blob();
                var fd = new FormData();
                fd.append('foto', blob, (slug(nome) || 'foto') + (blob.type === 'image/png' ? '.png' : blob.type === 'image/jpeg' ? '.jpg' : '.webp'));
                fd.append('nome', String(nome || ''));
                if (apagar && /^img\/produtos\/[A-Za-z0-9._-]+$/.test(String(apagar))) fd.append('apagar', String(apagar).slice('img/produtos/'.length));
                var r = await fetch(ENDPOINT, { method: 'POST', headers: { Authorization: 'Bearer ' + token }, body: fd, credentials: 'omit' });
                var ct = String(r.headers.get('content-type') || '');
                // 39.3 · Sem PHP na hospedagem (404 / resposta que não é JSON) continua silencioso: a foto fica dentro do
                // produto. Mas quando o PHP existe e RECUSA (pasta sem permissão, foto grande, login inválido), avisa na tela:
                // antes a recusa sumia no console e a foto ia inteira para o Firestore, onde estourava o limite do registro.
                if (ct.indexOf('json') < 0) { console.warn('[foto-hospedagem] sem PHP na hospedagem (' + r.status + '): a foto fica dentro do produto'); return ''; }
                var j = null; try { j = await r.json(); } catch (_) { j = null; }
                if (!r.ok || !j || !j.ok) {
                    var motivo = (j && (j.erro || j.error)) || ('HTTP ' + r.status);
                    console.warn('[foto-hospedagem] recusado: ' + motivo);
                    if (window.Toast) Toast.warning('A hospedagem não aceitou a foto (' + motivo + '). Ela ficou guardada dentro do produto, em tamanho reduzido.');
                    return '';
                }
                return /^img\/produtos\/[A-Za-z0-9._-]+$/.test(String(j.url || '')) ? j.url : '';
            } catch (e) {
                console.warn('[foto-hospedagem]', e && e.message);
                if (window.Toast) Toast.warning('Não deu para enviar a foto para a hospedagem (' + (e && e.message) + '). Ela ficou guardada dentro do produto, em tamanho reduzido.');
                return '';
            }
        }
    };
})();
