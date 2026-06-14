/**
 * Cloudflare Worker — Proxy seguro para a API da Anthropic
 * Nerds da Libras · nerdsdalibras.github.io
 *
 * COMO FAZER O DEPLOY:
 * 1. Acesse dash.cloudflare.com → Workers & Pages → Create Worker
 * 2. Clique em "Edit Code" e cole TODO este arquivo
 * 3. Clique em "Save and Deploy"
 * 4. Vá em Settings → Variables → Add variable (clicar em "Encrypt"):
 *       Nome:  ANTHROPIC_API_KEY
 *       Valor: sk-ant-... (sua chave)
 * 5. Copie a URL do worker (ex: lorena-proxy.SEU_USUARIO.workers.dev)
 * 6. Cole essa URL na variável WORKER_URL do arquivo avaliacao-clube.html
 */

const ALLOWED_ORIGIN = 'https://nerdsdalibras.github.io';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  ALLOWED_ORIGIN,
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {

    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Só aceita POST
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    // Valida origem (bloqueia chamadas de outros domínios)
    const origin = request.headers.get('Origin') || '';
    if (origin !== ALLOWED_ORIGIN) {
      return new Response('Forbidden', { status: 403 });
    }

    try {
      const body = await request.json();

      // Chama a Anthropic com a chave armazenada no servidor
      const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type':      'application/json',
          'x-api-key':         env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
        body: JSON.stringify(body),
      });

      const data = await anthropicRes.json();

      return new Response(JSON.stringify(data), {
        status: anthropicRes.status,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });

    } catch (err) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }
  },
};
