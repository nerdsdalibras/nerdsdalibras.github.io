/**
 * Cloudflare Worker — Proxy de Webhook (Eduzz → Apps Script)
 * Nerds da Libras
 *
 * POR QUE ISSO EXISTE:
 * O Google Apps Script responde com um redirecionamento (302), e a validação
 * "Verificar URL" da Eduzz exige um HTTP 200 direto (por isso dava "Status HTTP 0").
 * Este worker responde 200 na hora e repassa o evento pro Apps Script
 * (o worker segue o redirecionamento, que a Eduzz não segue).
 *
 * COMO FAZER O DEPLOY:
 * 1. dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Dê um nome (ex: eduzz-webhook) → Deploy
 * 3. Clique em "Edit Code", apague tudo e cole ESTE arquivo → Save and Deploy
 * 4. Copie a URL do worker (ex: https://eduzz-webhook.SEU_USUARIO.workers.dev)
 * 5. Cole essa URL no campo "URL para envio dos dados" da Eduzz e clique em
 *    "Verificar URL" → agora passa (200). Depois selecione os eventos e salve.
 */

// URL do seu Apps Script (a mesma do CRM/Kiwify) — não é segredo, já é pública.
const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbyBnO0BBl1FCAU6lVeOVRu_4u_5DN0cOWp3ErskE_dLRZ-54x_51yK82icCn8tfx71F/exec';

export default {
  async fetch(request) {
    // Validação da Eduzz (GET/HEAD) ou preflight (OPTIONS): responde 200 imediatamente.
    if (request.method !== 'POST') {
      return new Response('OK', { status: 200 });
    }

    // Evento real (POST): lê o corpo cru e repassa pro Apps Script.
    let body = '';
    try { body = await request.text(); } catch (_) {}
    const contentType = request.headers.get('Content-Type') || 'application/json';

    try {
      // O fetch do worker SEGUE o redirecionamento do Apps Script (a Eduzz não seguia).
      await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body,
        redirect: 'follow',
      });
    } catch (_) { /* mesmo se o Apps Script demorar/falhar, devolvemos 200 pra Eduzz */ }

    // Sempre 200 pra Eduzz não marcar a configuração como "com erro".
    return new Response('OK', { status: 200 });
  },
};
