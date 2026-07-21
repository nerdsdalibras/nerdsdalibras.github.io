/* ═══════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════ */

// Normaliza um nome de canal/origem para uma chave única
function _canalKey(s) {
  s = String(s || '').toLowerCase();
  if (!s || s === 'direto') return 'direto';
  if (s.indexOf('meta') >= 0 || s.indexOf('face') >= 0 || s.indexOf('fb') >= 0) return 'meta';
  if (s.indexOf('insta') >= 0) return 'instagram';
  if (s.indexOf('google') >= 0) return 'google';
  if (s.indexOf('you') >= 0) return 'youtube';
  if (s.indexOf('tiktok') >= 0) return 'tiktok';
  if (s.indexOf('org') >= 0) return 'organico';
  if (s.indexOf('whats') >= 0) return 'whatsapp';
  return s;
}

// Funil completo (medível) com conversão entre etapas + gargalo
function _funilCompletoHTML(leads) {
  const _tv = v => v === true || String(v).toLowerCase() === 'true';
  const iniciou  = leads.filter(l => _tv(l.iniciouQuiz)).length;
  const concluiu = leads.filter(l => _tv(l.concluiuQuiz)).length;
  const checkout = leads.filter(l => l.clicouCheckout || l.checkoutEm || l.clicouOferta).length;
  const vendas   = leads.filter(_comprou).length;
  const steps = [
    { label: 'Leads',            n: leads.length, cor: 'var(--blue)' },
    { label: 'Iniciou o quiz',   n: iniciou,      cor: '#38bdf8' },
    { label: 'Concluiu o quiz',  n: concluiu,     cor: 'var(--purple)' },
    { label: 'Foi ao checkout',  n: checkout,     cor: 'var(--yellow)' },
    { label: 'Comprou',          n: vendas,       cor: 'var(--g)' },
  ];
  let piorDrop = -1, piorIdx = -1;
  for (let i = 1; i < steps.length; i++) {
    const prev = steps[i - 1].n || 0;
    steps[i].conv = prev > 0 ? Math.round(steps[i].n / prev * 100) : 0;
    const drop = 100 - steps[i].conv;
    if (prev > 0 && drop > piorDrop) { piorDrop = drop; piorIdx = i; }
  }
  const maxN = steps[0].n || 1;
  const rows = steps.map((s, i) => `
    <div class="funnel-row">
      <div class="funnel-label">${s.label}${i === piorIdx ? ' <span style="color:var(--red);font-size:.62rem">⬅ gargalo</span>' : ''}</div>
      <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.max(3, Math.round(s.n / maxN * 100))}%;background:${s.cor}"></div></div>
      <div class="funnel-count">${s.n}${i > 0 ? ` <span style="color:var(--td);font-size:.7rem">${s.conv}%</span>` : ''}</div>
    </div>`).join('');
  return `<div class="chart-card animate-up"><div class="chart-title">Funil Completo (onde está o gargalo)</div>
    <div class="funnel-wrap">${rows}</div>
    <div style="font-size:.72rem;color:var(--td);margin-top:8px">% = conversão vinda da etapa anterior. A maior queda (⬅ gargalo) é o ponto a atacar primeiro.</div></div>`;
}

// Analytics por canal (leads, clientes, receita, CAC, LTV, LTV/CAC)
function _porCanalHTML(leads) {
  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const camps = (typeof getCampMkt === 'function') ? getCampMkt() : [];
  const invCanal = {};
  camps.forEach(c => { const k = _canalKey(c.canal); invCanal[k] = (invCanal[k] || 0) + (Number(c.investimento) || 0); });

  const ch = {};
  leads.forEach(l => {
    const k = _canalKey(l.utmSource || String(l.firstTouch || '').split(' ')[0]);
    if (!ch[k]) ch[k] = { leads: 0, clientes: 0, receita: 0 };
    ch[k].leads++;
    if (_comprou(l)) { ch[k].clientes++; ch[k].receita += parseFloat(String(l.valorPago || '').replace(',', '.')) || 0; }
  });
  Object.keys(invCanal).forEach(k => { if (!ch[k]) ch[k] = { leads: 0, clientes: 0, receita: 0 }; });

  const linhas = Object.keys(ch).sort((a, b) => ch[b].receita - ch[a].receita).map(k => {
    const c = ch[k], inv = invCanal[k] || 0;
    const cac = (c.clientes > 0 && inv > 0) ? inv / c.clientes : 0;
    const ltv = c.clientes > 0 ? c.receita / c.clientes : 0;
    const lc  = cac > 0 ? ltv / cac : 0;
    const conv = c.leads > 0 ? (c.clientes / c.leads * 100) : 0;
    const lcCor = lc >= 3 ? 'var(--g)' : lc >= 1 ? 'var(--yellow)' : (lc > 0 ? 'var(--red)' : 'var(--td)');
    return `<tr style="border-bottom:1px solid var(--bdr)">
      <td style="padding:8px;font-weight:700;text-transform:capitalize">${k}</td>
      <td style="padding:8px;text-align:right">${c.leads}</td>
      <td style="padding:8px;text-align:right">${c.clientes}</td>
      <td style="padding:8px;text-align:right">${conv.toFixed(1)}%</td>
      <td style="padding:8px;text-align:right;color:var(--g)">${brl(c.receita)}</td>
      <td style="padding:8px;text-align:right">${inv > 0 ? brl(cac) : '—'}</td>
      <td style="padding:8px;text-align:right">${c.clientes > 0 ? brl(ltv) : '—'}</td>
      <td style="padding:8px;text-align:right;font-weight:800;color:${lcCor}">${(inv > 0 && cac > 0) ? lc.toFixed(1) + 'x' : '—'}</td>
    </tr>`;
  }).join('');

  return `<div class="chart-card animate-up" style="grid-column:1/-1"><div class="chart-title">Analytics por Canal</div>
    <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:.8rem;min-width:640px">
    <thead><tr style="color:var(--ts);font-size:.66rem;text-transform:uppercase;text-align:right">
      <th style="padding:8px;text-align:left">Canal</th><th style="padding:8px">Leads</th><th style="padding:8px">Clientes</th>
      <th style="padding:8px">Conv.</th><th style="padding:8px">Receita</th><th style="padding:8px">CAC</th>
      <th style="padding:8px">LTV</th><th style="padding:8px">LTV/CAC</th></tr></thead>
    <tbody>${linhas || '<tr><td style="padding:12px;color:var(--td)">Sem dados de canal ainda — aparece quando os leads trouxerem UTM.</td></tr>'}</tbody></table></div>
    <div style="font-size:.72rem;color:var(--td);margin-top:8px">O investimento por canal vem das Campanhas (campo Canal). CAC e LTV/CAC aparecem quando há investimento cadastrado.</div></div>`;
}

async function renderAnalytics() {
  const leads = await getLeads();
  const total = leads.length || 1;

  const days7 = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(); d.setDate(d.getDate() - i);
    const key   = d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    const count = leads.filter(l => {
      if (!l.createdAt) return false;
      const ld = new Date(l.createdAt);
      return ld.getDate() === d.getDate() && ld.getMonth() === d.getMonth() && ld.getFullYear() === d.getFullYear();
    }).length;
    days7.push({ key, count });
  }
  const maxDay = Math.max(...days7.map(d => d.count), 1);

  const sc = {};
  PIPELINE_STAGES.forEach(s => { sc[s.key] = leads.filter(l => (l.status || 'novo') === s.key).length; });
  const comprou   = sc.comprou || 0;
  const checkout  = leads.filter(l => l.clicouCheckout).length;
  const hot       = (sc.quente || 0) + (sc.muito_quente || 0) + (sc.prioridade_maxima || 0);
  const conversao = Math.round((comprou / total) * 100);

  const nc = {
    'BÁSICO':        leads.filter(l => l.nivelIdentificado === 'BÁSICO').length,
    'INTERMEDIÁRIO': leads.filter(l => l.nivelIdentificado === 'INTERMEDIÁRIO').length,
    'AVANÇADO':      leads.filter(l => l.nivelIdentificado === 'AVANÇADO').length,
  };
  const totalNivel = Object.values(nc).reduce((a, b) => a + b, 0) || 1;

  const curso    = leads.filter(l => l.oferta === 'curso').length;
  const mentoria = leads.filter(l => l.oferta === 'mentoria').length;

  const pipeline = calcTotalPipeline(leads);

  document.getElementById('analytics-grid').innerHTML = `
    ${_funilCompletoHTML(leads)}
    ${_porCanalHTML(leads)}
    <div class="chart-card animate-up">
      <div class="chart-title">Leads por Dia (7 dias)</div>
      <div class="bar-chart">
        ${days7.map(d => `
          <div class="bar-item">
            <div class="bar-val">${d.count || ''}</div>
            <div class="bar-fill" style="height:${Math.max(3, (d.count / maxDay) * 88)}px"></div>
            <div class="bar-label">${d.key}</div>
          </div>`).join('')}
      </div>
    </div>

    <div class="chart-card animate-up" style="animation-delay:.06s">
      <div class="chart-title">Funil de Conversão</div>
      <div class="funnel-wrap">
        <div class="funnel-row">
          <div class="funnel-label">Total leads</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:100%;background:var(--blue)"></div></div>
          <div class="funnel-count">${leads.length}</div>
        </div>
        <div class="funnel-row">
          <div class="funnel-label">Quentes+</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.round((hot/total)*100)}%;background:var(--orange)"></div></div>
          <div class="funnel-count">${hot}</div>
        </div>
        <div class="funnel-row">
          <div class="funnel-label">Viu Checkout</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.round((checkout/total)*100)}%;background:var(--yellow)"></div></div>
          <div class="funnel-count">${checkout}</div>
        </div>
        <div class="funnel-row">
          <div class="funnel-label">Compraram</div>
          <div class="funnel-bar-wrap"><div class="funnel-bar" style="width:${Math.round((comprou/total)*100)}%;background:var(--g)"></div></div>
          <div class="funnel-count">${comprou}</div>
        </div>
      </div>
    </div>

    <div class="chart-card animate-up" style="animation-delay:.12s">
      <div class="chart-title">Distribuição por Nível</div>
      <div class="distrib-list">
        ${[
          { label: 'Básico',        key: 'BÁSICO',        color: '#4ade80' },
          { label: 'Intermediário', key: 'INTERMEDIÁRIO', color: '#fbbf24' },
          { label: 'Avançado',      key: 'AVANÇADO',      color: '#a78bfa' },
        ].map(n => `
          <div class="distrib-row">
            <div class="distrib-dot" style="background:${n.color}"></div>
            <div class="distrib-name">${n.label}</div>
            <div class="distrib-val">${nc[n.key]}</div>
            <span class="distrib-pct">(${Math.round((nc[n.key]/totalNivel)*100)}%)</span>
          </div>`).join('')}
      </div>
    </div>

    <div class="chart-card animate-up" style="animation-delay:.18s">
      <div class="chart-title">Oferta</div>
      <div class="distrib-list">
        <div class="distrib-row">
          <div class="distrib-dot" style="background:var(--g)"></div>
          <div class="distrib-name">📚 Curso</div>
          <div class="distrib-val">${curso}</div>
          <span class="distrib-pct">(${Math.round((curso/total)*100)}%)</span>
        </div>
        <div class="distrib-row">
          <div class="distrib-dot" style="background:var(--purple)"></div>
          <div class="distrib-name">🎯 Mentoria</div>
          <div class="distrib-val">${mentoria}</div>
          <span class="distrib-pct">(${Math.round((mentoria/total)*100)}%)</span>
        </div>
      </div>
    </div>

    <div class="chart-card animate-up" style="animation-delay:.21s">
      <div class="chart-title">Resumo Geral</div>
      <div style="display:flex;flex-direction:column;gap:0">
        <div class="panel-field"><span class="pf-label">Total de leads</span><span class="pf-val sv-white">${leads.length}</span></div>
        <div class="panel-field"><span class="pf-label">Viram o checkout</span><span class="pf-val sv-yellow">${checkout}</span></div>
        <div class="panel-field"><span class="pf-label">Compraram (conf.)</span><span class="pf-val sv-green">${comprou}</span></div>
        <div class="panel-field"><span class="pf-label">Taxa de conversão</span><span class="pf-val sv-green">${conversao}%</span></div>
        <div class="panel-field"><span class="pf-label">Faturamento conf.</span><span class="pf-val sv-green">R$${(comprou * 397).toLocaleString('pt-BR')}</span></div>
        <div class="panel-field"><span class="pf-label">Pipeline projetado</span><span class="pf-val sv-purple">R$${Math.round(pipeline).toLocaleString('pt-BR')}</span></div>
        <div class="panel-field"><span class="pf-label">Leads ativos</span><span class="pf-val sv-orange">${leads.filter(l => l.status !== 'comprou' && l.status !== 'nao_quis').length}</span></div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════
   EMAIL REMARKETING (2h / 24h / 48h)
═══════════════════════════════════════════ */
const EMAIL_DELAYS = [2, 24, 48];

function _emailTemplate(l, num) {
  const nome  = (l.nome || 'você').split(' ')[0];
  const link  = l.oferta === 'mentoria' ? CONFIG.MENTORIA_EDUZZ_URL : CONFIG.KIWIFY_URL;
  // Próximo sábado (DD/MM) para o prazo do e-mail 3
  const _s = new Date(); _s.setDate(_s.getDate() + ((6 - _s.getDay() + 7) % 7));
  const sabado = `${String(_s.getDate()).padStart(2,'0')}/${String(_s.getMonth()+1).padStart(2,'0')}`;

  const subjects = [
    `A primeira conversa de verdade com quem você ama`,
    `Por que você não vai aprender Libras sozinho(a) (nem precisa)`,
    `Desconto no PIX (e um bônus que vai te destravar) 💸`,
  ];

  const bodies = [
    `Oi, ${nome} 💜\n\nAqui é a Lorena, e eu quero te fazer uma pergunta sincera:\n\nQuantas vezes você já ficou ali, perto de uma pessoa surda que você ama, querendo dizer algo simples — e as palavras não saíram?\n\nUm "eu te amo". Um "como foi seu dia?". Uma piada boba na mesa do almoço.\n\nEu sei exatamente como isso dói. E é justamente por isso que eu criei o Zero a Libras.\n\nDaqui a algumas semanas, você senta ao lado dessa pessoa e tem uma conversa de verdade. Olho no olho, na língua dela.\n\nFoi pensando em quem está começando do absoluto zero que eu montei esse curso. Sem teoria chata, sem decoreba — você aprende os sinais que importam, na ordem certa, mesmo que só tenha 20 minutinhos por dia.\n\n👉 QUERO CONHECER O ZERO A LIBRAS:\n${link}\n\nVocê ainda pode experimentar o curso por 7 dias.\n\nCom carinho,\nLorena 💜`,

    `Oi, ${nome}! 💜\n\nTem uma coisa que separa quem aprende Libras de verdade de quem desiste no meio do caminho: acompanhamento.\n\nVídeo solto no YouTube ensina sinal. Mas não te corrige, não tira sua dúvida, não te segura na mão quando você trava. E é aí que a maioria desiste.\n\nNo Zero a Libras é diferente. Você aprende organizado por níveis e pratica com pessoas no mesmo ponto da jornada que você. 🌱\n\n✅ Tira dúvidas e recebe correção (sinal errado vira vício)\n✅ Pratica sem vergonha de errar\n✅ Não está sozinho(a) nessa\n\nE o mais importante: eu estou junto, acompanhando de perto pra te ajudar a chegar lá. 🤟\n\n👉 QUERO APRENDER COM ACOMPANHAMENTO DE VERDADE:\n${link}\n\nSeu único arrependimento vai ser não ter começado antes.\n\nCom carinho,\nLorena 💜`,

    `Oi, ${nome}! 💜\n\nSextou — e hoje é dia de condição especial. 🎉\n\nEm algum momento você se interessou pelo Zero a Libras, mas ainda não começou. Cada dia sem se comunicar com quem você ama é um dia que não volta. Então decidi facilitar pra você dar o primeiro passo HOJE:\n\nUse o cupom DESCONTO30 e ganhe 30% de desconto. 🤟\n\n👉 QUERO MEUS 30% DE DESCONTO:\n${link}\n\nE tem mais — comprando nesta oferta você libera 2 cursos bônus direto na plataforma:\n🎁 Curso de Datilologia\n🎁 Curso de Interpretação de Música\n\nÉ só garantir sua vaga pelo link que os dois são liberados automaticamente. 🚀\n\n⚠️ IMPORTANTE: o cupom DESCONTO30 (30% OFF) e os cursos bônus ficam disponíveis só até sábado, dia ${sabado}, às 23h59.\n\nNão deixa essa conversa pra depois. 💜\n\nCom carinho,\nLorena`,
  ];

  return { subject: subjects[num - 1], body: bodies[num - 1] };
}

function renderEmailTab(l) {
  const now       = Date.now();
  const createdMs = l.createdAt ? new Date(l.createdAt).getTime() : null;

  const emailRow = `
    <div class="panel-section">
      <div class="panel-section-title">E-mail do Lead</div>
      <div style="display:flex;gap:8px;align-items:center">
        <input class="agenda-input" type="email" id="lead-email-input"
               placeholder="email@exemplo.com" value="${l.email || ''}"
               style="margin:0;flex:1"
               onkeydown="if(event.key==='Enter')salvarEmailLead('${l.sessionId}')"/>
        <button class="panel-big-btn pbb-green" id="btn-salvar-email"
                onclick="salvarEmailLead('${l.sessionId}')"
                style="margin:0;width:auto;padding:10px 18px;font-size:.78rem;flex-shrink:0">
          Salvar
        </button>
      </div>
    </div>`;

  const cards = EMAIL_DELAYS.map((delay, i) => {
    const num       = i + 1;
    const tpl       = _emailTemplate(l, num);
    const sentKey   = `email${num}SentAt`;
    const schedMs   = createdMs ? createdMs + delay * 3600000 : null;
    const isSent    = !!l[sentKey];
    const isOverdue = !isSent && !!schedMs && now > schedMs;

    const statusCls = isSent ? 'sent' : isOverdue ? 'overdue' : 'pending';
    const schedDate = schedMs ? new Date(schedMs) : null;
    const statusTxt = isSent
      ? `✅ Enviado em ${formatTime(l[sentKey])}`
      : isOverdue
        ? `⚠️ Atrasado — devia ter sido enviado ${schedDate ? formatTime(schedDate.toISOString()) : '—'}`
        : schedDate
          ? `⏳ Enviar em ${formatTime(schedDate.toISOString())}`
          : '—';

    const mailto = l.email
      ? `mailto:${l.email}?subject=${encodeURIComponent(tpl.subject)}&body=${encodeURIComponent(tpl.body)}`
      : null;

    const preview = tpl.body.replace(/\n/g, ' ').substring(0, 115) + '…';

    return `
      <div class="email-card ec-${statusCls}">
        <div class="email-card-hdr">
          <span class="email-num-badge">Email ${num}</span>
          <span class="email-delay-chip">${delay}h após avaliação</span>
        </div>
        <div class="email-status-row ${statusCls}">${statusTxt}</div>
        <div class="email-subject">📧 ${tpl.subject}</div>
        <div class="email-body-preview">${preview}</div>
        <div class="email-actions">
          <button class="quick-btn qb-copy"
                  onclick="copiarTexto(${JSON.stringify(tpl.subject + '\n\n' + tpl.body)}, this)">📋 Copiar</button>
          ${mailto
            ? `<a class="quick-btn qb-open" href="${mailto}" target="_blank" rel="noopener">📬 Abrir e-mail</a>`
            : `<span class="quick-btn" style="opacity:.35;cursor:default" title="Adicione o e-mail do lead acima">📬 Abrir e-mail</span>`}
          ${!isSent
            ? `<button class="quick-btn qb-sent" onclick="markEmailSent('${l.sessionId}', ${num})">✓ Marcar enviado</button>`
            : ''}
        </div>
      </div>`;
  }).join('');

  return `
    ${emailRow}
    <div class="panel-section">
      <div class="panel-section-title">Sequência de Remarketing — 3 e-mails</div>
      <div style="display:flex;flex-direction:column;gap:10px">${cards}</div>
    </div>`;
}

function markEmailSent(sessionId, num) {
  patchLead(sessionId, { [`email${num}SentAt`]: new Date().toISOString() });
  if (currentLead?.sessionId === sessionId) renderTab('email');
  showToast(`Email ${num} marcado como enviado`);
}

function salvarEmailLead(sessionId) {
  const val = document.getElementById('lead-email-input')?.value?.trim();
  const btn = document.getElementById('btn-salvar-email');
  if (!val) return;
  patchLead(sessionId, { email: val });
  if (btn) { btn.textContent = '✅ Salvo'; setTimeout(() => { btn.textContent = 'Salvar'; }, 2000); }
  showToast('E-mail salvo!');
}

