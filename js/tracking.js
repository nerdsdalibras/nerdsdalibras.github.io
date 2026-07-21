/* ═══════════════════════════════════════════════════
   RASTREAMENTO DE ORIGEM (UTM + First/Last Touch)
   Inclua em TODA página de entrada:  <script src="js/tracking.js"></script>
   Guarda no localStorage (mesmo domínio) para o quiz enviar ao CRM:
     ndl_first_touch  → como a pessoa conheceu a Nerds pela 1ª vez
     ndl_last_touch   → último canal antes de converter
═══════════════════════════════════════════════════ */
(function () {
  try {
    var LS  = window.localStorage;
    var qs  = new URLSearchParams(location.search);
    var now = new Date().toISOString();

    function p(n) { return (qs.get(n) || '').trim(); }
    var utm = {
      source:   p('utm_source'),
      medium:   p('utm_medium'),
      campaign: p('utm_campaign'),
      content:  p('utm_content'),
      term:     p('utm_term'),
    };
    var temUtm = !!(utm.source || utm.medium || utm.campaign || utm.content || utm.term);

    // Também captura ids de anúncio comuns (Meta/Google) como conteúdo, se vierem
    var adId = p('fbclid') ? 'fbclid' : (p('gclid') ? 'gclid' : (p('ttclid') ? 'ttclid' : ''));

    // Deriva uma origem "amigável" a partir do referrer quando não há UTM
    var ref = document.referrer || '';
    function origemDeRef(r) {
      if (!r) return 'direto';
      try {
        var h = new URL(r).hostname.replace(/^www\./, '').toLowerCase();
        if (h.indexOf('nerdsdalibras') >= 0) return '';          // navegação interna
        if (h.indexOf('instagram') >= 0 || h === 'l.instagram.com') return 'instagram';
        if (h.indexOf('facebook') >= 0 || h.indexOf('fb.') >= 0) return 'facebook';
        if (h.indexOf('google') >= 0) return 'google';
        if (h.indexOf('youtube') >= 0 || h.indexOf('youtu.be') >= 0) return 'youtube';
        if (h.indexOf('tiktok') >= 0) return 'tiktok';
        if (h.indexOf('t.co') >= 0 || h.indexOf('twitter') >= 0 || h.indexOf('x.com') >= 0) return 'twitter';
        if (h.indexOf('bio') >= 0 || h.indexOf('linktr') >= 0) return 'linknabio';
        if (h.indexOf('whatsapp') >= 0 || h.indexOf('wa.me') >= 0) return 'whatsapp';
        return h;
      } catch (e) { return 'outro'; }
    }

    var refOrigem = origemDeRef(ref);
    // "Toque externo" = veio de UTM, de um clique de anúncio, ou de um referrer externo
    var ehExterno = temUtm || !!adId || (refOrigem && refOrigem !== 'direto' && refOrigem !== '');

    var toque = {
      source:   utm.source   || (ehExterno ? refOrigem : 'direto'),
      medium:   utm.medium   || (temUtm ? 'paid' : (ehExterno ? 'referral' : 'direto')),
      campaign: utm.campaign || '',
      content:  utm.content  || adId,
      term:     utm.term     || '',
      referrer: ref,
      landing:  location.pathname + location.search,
      date:     now,
    };

    // Navegação interna sem UTM: não sobrescreve nada (mantém os toques reais)
    if (!ehExterno && refOrigem === '') return;

    // FIRST TOUCH — grava uma única vez (inclusive se for 'direto' na 1ª visita)
    if (!LS.getItem('ndl_first_touch')) LS.setItem('ndl_first_touch', JSON.stringify(toque));

    // LAST TOUCH — atualiza sempre que houver um toque externo real
    if (ehExterno || !LS.getItem('ndl_last_touch')) LS.setItem('ndl_last_touch', JSON.stringify(toque));
  } catch (e) { /* nunca quebra a página */ }
})();
