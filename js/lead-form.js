/* ═══════════════════════════════════════════════════
   WIDGET DE CAPTURA DE LEAD (embutível em qualquer página)
   Uso na página, antes de </body>:
     <script>window.NDL_FORM={grupo:'curso',origem:'Página X',
       redirect:'https://pay.kiwify.com.br/...',botao:'Quero garantir'};</script>
     <script src="js/lead-form.js"></script>
   Captura nome + e-mail + WhatsApp, cria o lead no CRM no grupo certo e
   (se redirect for um checkout) marca clicouCheckout p/ o remarketing.
═══════════════════════════════════════════════════ */
(function () {
  var SHEETS_URL = 'https://script.google.com/macros/s/AKfycbyBnO0BBl1FCAU6lVeOVRu_4u_5DN0cOWp3ErskE_dLRZ-54x_51yK82icCn8tfx71F/exec';
  var cfg = window.NDL_FORM || {};
  var grupo    = (cfg.grupo || '').toLowerCase();
  var origem   = cfg.origem || (document.title || 'Site');
  var redirect = cfg.redirect || '';
  var titulo   = cfg.titulo || 'Garanta seu acesso 💜';
  var sub      = cfg.sub || 'Deixa seus dados que a gente continua com você.';
  var botao    = cfg.botao || 'Quero garantir 💜';
  var pedeWpp  = cfg.pedeWpp !== false; // padrão: pede WhatsApp
  var ehCheckout = /kiwify|eduzz|pay\.|chk\./i.test(redirect) ? '1' : '0';

  var css = ''
    + '#ndlfab{position:fixed;right:16px;bottom:16px;z-index:99998;background:linear-gradient(135deg,#C97FD8,#A855C0);color:#1A0E2E;font-weight:800;border:none;border-radius:30px;padding:14px 20px;font-size:15px;cursor:pointer;box-shadow:0 8px 26px rgba(0,0,0,.4);font-family:Inter,system-ui,sans-serif}'
    + '#ndlov{position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.7);display:none;align-items:center;justify-content:center;padding:18px;font-family:Inter,system-ui,sans-serif}'
    + '#ndlbox{background:#2D1B3D;border:1px solid rgba(201,127,216,.25);border-radius:20px;padding:26px 22px;max-width:420px;width:100%;color:#F3E8FF;box-shadow:0 16px 50px rgba(0,0,0,.6)}'
    + '#ndlbox h3{font-size:20px;font-weight:900;margin:0 0 8px}'
    + '#ndlbox p.s{font-size:14px;color:#A888C0;margin:0 0 18px;line-height:1.5}'
    + '#ndlbox input{width:100%;padding:13px 14px;margin-bottom:12px;border-radius:11px;border:1px solid rgba(201,127,216,.25);background:#1A0E2E;color:#F3E8FF;font-size:15px;font-family:inherit}'
    + '#ndlbox input:focus{outline:none;border-color:#C97FD8}'
    + '#ndlbox .b{width:100%;padding:15px;border:none;border-radius:26px;font-size:15px;font-weight:800;color:#1A0E2E;cursor:pointer;background:linear-gradient(135deg,#C97FD8,#A855C0);margin-top:4px}'
    + '#ndlbox .b:disabled{opacity:.6}'
    + '#ndlbox .x{float:right;background:none;border:none;color:#A888C0;font-size:22px;cursor:pointer;line-height:1;margin:-6px -4px 0 0}'
    + '#ndlbox .e{color:#F87171;font-size:13px;margin-bottom:8px;display:none}';

  function el(html) { var d = document.createElement('div'); d.innerHTML = html; return d.firstElementChild; }

  function open() { document.getElementById('ndlov').style.display = 'flex'; setTimeout(function(){ var n=document.getElementById('ndl-n'); if(n)n.focus(); }, 50); }
  function close() { document.getElementById('ndlov').style.display = 'none'; }

  function enviar() {
    var nome = (document.getElementById('ndl-n').value || '').trim();
    var email = (document.getElementById('ndl-e').value || '').trim();
    var wpp = (document.getElementById('ndl-w') ? document.getElementById('ndl-w').value : '').trim();
    var err = document.getElementById('ndl-err');
    if (nome.length < 2) { err.textContent = 'Escreve seu nome 😊'; err.style.display = 'block'; return; }
    if (!/^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/.test(email)) { err.textContent = 'E-mail inválido, confere aí 😊'; err.style.display = 'block'; return; }
    if (pedeWpp && wpp.replace(/\D/g, '').length < 10) { err.textContent = 'Coloca um WhatsApp válido com DDD'; err.style.display = 'block'; return; }
    err.style.display = 'none';
    var b = document.getElementById('ndl-b'); b.disabled = true; b.textContent = 'Enviando…';

    var url = SHEETS_URL + '?action=captureLead&grupo=' + encodeURIComponent(grupo)
      + '&nome=' + encodeURIComponent(nome) + '&email=' + encodeURIComponent(email)
      + '&whatsapp=' + encodeURIComponent(wpp) + '&origem=' + encodeURIComponent(origem)
      + '&checkout=' + ehCheckout;
    fetch(url, { redirect: 'follow' }).then(function (r) { return r.json(); })
      .then(concluir).catch(concluir);
  }

  function concluir() {
    if (redirect) { window.location.href = redirect; return; }
    document.getElementById('ndlbox').innerHTML = '<div style="text-align:center"><div style="font-size:46px">✅</div>'
      + '<h3 style="margin-top:8px">Recebido! 💜</h3><p class="s">Seus dados chegaram. Em breve a gente fala com você. 🤟</p>'
      + '<button class="b" onclick="document.getElementById(\'ndlov\').style.display=\'none\'">Fechar</button></div>';
  }

  function montar() {
    var style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

    var fab = el('<button id="ndlfab">' + botao + '</button>');
    fab.onclick = open;
    document.body.appendChild(fab);

    var wppField = pedeWpp ? '<input id="ndl-w" type="tel" placeholder="Seu WhatsApp (com DDD)" inputmode="tel">' : '';
    var ov = el('<div id="ndlov"><div id="ndlbox">'
      + '<button class="x" id="ndl-x">×</button>'
      + '<h3>' + titulo + '</h3><p class="s">' + sub + '</p>'
      + '<div class="e" id="ndl-err"></div>'
      + '<input id="ndl-n" type="text" placeholder="Seu nome">'
      + '<input id="ndl-e" type="email" placeholder="Seu melhor e-mail" inputmode="email">'
      + wppField
      + '<button class="b" id="ndl-b">' + botao + '</button>'
      + '</div></div>');
    document.body.appendChild(ov);
    document.getElementById('ndl-x').onclick = close;
    ov.addEventListener('click', function (ev) { if (ev.target === ov) close(); });
    document.getElementById('ndl-b').onclick = enviar;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', montar);
  else montar();
})();
