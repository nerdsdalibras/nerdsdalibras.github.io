// Uso: node navegador.js <etapa> <base_url> <arquivo_estado.json>
const { chromium } = require('playwright');
const fs = require('fs');
const [etapa, B, arqEstado] = process.argv.slice(2);
const SENHA = process.env.SENHA_DEMONSTRACAO;
const estado = fs.existsSync(arqEstado) ? JSON.parse(fs.readFileSync(arqEstado)) : {};
const salvar = () => fs.writeFileSync(arqEstado, JSON.stringify(estado, null, 2));
const pad = n => String(n).padStart(2, '0');
const local = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const msg = async p => (await p.locator('.mensagens').count()) ? (await p.locator('.mensagens').innerText()).replace(/\s+/g, ' ').trim() : '';

(async () => {
  const browser = await chromium.launch();
  async function entrar(email) {
    const ctx = await browser.newContext({ timezoneId: 'America/Sao_Paulo' });
    const p = await ctx.newPage();
    await p.goto(B + '/contas/entrar/');
    await p.fill('#id_username', email); await p.fill('#id_password', SENHA);
    await p.click('button[type=submit]');
    if (p.url().includes('/contas/entrar/')) throw new Error('login falhou: ' + email);
    return p;
  }
  const out = (...a) => console.log(`[${etapa}]`, ...a);

  if (etapa === 'fluxo') {
    // Operador cria (contratada) evento hoje +3h, 60 min, 1 intérprete; escala e confirma
    const o = await entrar('operador@exemplo.invalid');
    await o.goto(B + '/agendamentos/novo/');
    const ini = new Date(Date.now() + 3 * 3600e3); ini.setMinutes(0);
    await o.fill('#id_titulo', 'Auditoria E2E (fictício)'); await o.fill('#id_unidade_solicitante', 'EMEB Auditoria');
    await o.selectOption('#id_modalidade', 'PRESENCIAL'); await o.fill('#id_local', 'Sala E2E');
    await o.fill('#id_inicio_previsto', local(ini)); await o.fill('#id_duracao_prevista_min', '60'); await o.fill('#id_qtd_profissionais', '1');
    await o.click('button[type=submit]');
    estado.url = o.url(); estado.codigo = (await o.locator('h1').innerText()).split(' — ')[0];
    out('criado', estado.codigo, '|', await msg(o));
    await o.selectOption('#id_interprete', { label: 'Intérprete Fictícia Carla' });
    await o.click('form[action$="/escalar/"] button');
    await o.click('form[action$="/confirmar/"] button');
    out('confirmação:', await msg(o));
    salvar();
  }

  if (etapa === 'ver-falha') {
    const f = await entrar('fiscal@exemplo.invalid');
    await f.goto(B + '/avisos/');
    const linha = f.locator('table tbody tr', { hasText: estado.codigo }).first();
    out('linha de envio:', (await linha.innerText()).replace(/\s+/g, ' ').slice(0, 220));
    await f.screenshot({ path: arqEstado.replace('.json', '-avisos-falha.png'), fullPage: true });
  }

  if (etapa === 'reenviar') {
    const f = await entrar('fiscal@exemplo.invalid');
    await f.goto(B + '/avisos/');
    const linha = f.locator('table tbody tr', { hasText: estado.codigo }).first();
    await linha.locator('button', { hasText: 'Tentar reenviar' }).click();
    out('reenvio manual:', await msg(f));
    const linha2 = f.locator('table tbody tr', { hasText: estado.codigo }).first();
    out('linha após reenvio:', (await linha2.innerText()).replace(/\s+/g, ' ').slice(0, 220));
    out('botão de reenvio ainda visível?', await linha2.locator('button', { hasText: 'Tentar reenviar' }).count());
  }

  if (etapa === 'reenvio-forjado') {
    const f = await entrar('fiscal@exemplo.invalid');
    await f.goto(B + '/avisos/');
    const csrf = await f.evaluate(() => document.querySelector('input[name=csrfmiddlewaretoken]').value);
    const r = await f.request.post(`${B}/notificacoes/${process.env.NOTIF_ID}/reenviar/`, { form: { csrfmiddlewaretoken: csrf }, headers: { Referer: B + '/avisos/' }, maxRedirects: 0 });
    await f.goto(B + '/avisos/');
    out('POST direto em notificação ENVIADA → HTTP', r.status(), '| mensagem:', await msg(f));
  }

  if (etapa === 'alterar') {
    const s = await entrar('fiscal@exemplo.invalid');
    await s.goto(estado.url);
    await s.click('summary:has-text("Alterar horário")');
    const novo = new Date(Date.now() + 4 * 3600e3); novo.setMinutes(0);
    await s.fill('form[action$="/alterar-horario/"] #id_inicio_previsto', local(novo));
    await s.fill('form[action$="/alterar-horario/"] #id_justificativa', 'Remanejamento E2E');
    await s.click('form[action$="/alterar-horario/"] button');
    out('alteração:', await msg(s));
  }

  if (etapa === 'cancelar-e-indenizar') {
    const f = await entrar('fiscal@exemplo.invalid');
    await f.goto(estado.url);
    await f.click('summary:has-text("Cancelar agendamento")');
    await f.fill('form[action$="/cancelar/"] #id_justificativa', 'Cancelamento tardio E2E');
    await f.click('form[action$="/cancelar/"] button');
    out('cancelamento:', await msg(f), '|', await f.locator('dd strong').first().innerText());
    const o = await entrar('operador@exemplo.invalid');
    await o.goto(estado.url);
    await o.fill('#id_comprovacao', 'Declaração fictícia de reserva de agenda da intérprete');
    await o.setInputFiles('#id_anexo', process.env.ANEXO);
    await o.click('form[action$="/indenizacao/"] button');
    out('indenização:', await msg(o));
    estado.anexo_href = await o.locator('a', { hasText: 'anexo' }).first().getAttribute('href');
    salvar();
  }

  if (etapa === 'conferir') {
    const f = await entrar('fiscal@exemplo.invalid');
    await f.goto(B + new URL(estado.url).pathname);  // mesmo registro, no servidor indicado
    out('servidor:', B, '| registro:', estado.codigo);
    const txt = (await f.locator('main').innerText());
    out('situação exibida:', txt.match(/(Solicitado|Confirmado|Cancelado|Realizado[^\n]*|Homologado[^\n]*)/)[0]);
    out('eventos no histórico:', await f.locator('ol.historico > li').count());
    out('pedido de indenização exibido:', txt.includes('Solicitada (em análise)'));
    if (estado.anexo_href) {
      const r = await f.request.get(B + estado.anexo_href);
      const buf = await r.body();
      fs.writeFileSync(arqEstado.replace('.json', `-anexo-${process.env.ROTULO || 'x'}.pdf`), buf);
      out('download do anexo → HTTP', r.status(), buf.length, 'bytes');
    }
    await f.goto(B + '/auditoria/?verificar=1');
    out('integridade:', (await f.locator('.msg-success, .msg-error').first().innerText()));
  }
  await browser.close();
})().catch(e => { console.error('ERRO', e.message); process.exit(1); });
