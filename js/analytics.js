/* ═══════════════════════════════════════════
   ANALYTICS
═══════════════════════════════════════════ */
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
  const nome  = l.nome  || 'você';
  const nivel = l.nivelIdentificado || '—';
  const sfx   = l.genero === 'feminino' ? 'a' : 'o';
  const link  = l.oferta === 'mentoria' ? CONFIG.MENTORIA_EDUZZ_URL : CONFIG.KIWIFY_URL;
  const prod  = l.oferta === 'mentoria' ? CONFIG.MENTORIA_NOME       : CONFIG.CURSO_NOME;

  const subjects = [
    `${nome}, seu diagnóstico em Libras está aqui 🤟`,
    `${nome}, o erro que trava 97% dos que aprendem Libras`,
    `Última mensagem da Lorena pra você, ${nome} 🙏`,
  ];

  const bodies = [
    `Oi ${nome}!\n\nAqui é a Lorena, da Nerds da Libras.\n\nVocê acabou de fazer o diagnóstico comigo e descobriu que está no nível ${nivel} em Libras.\n\n${l.oferta === 'mentoria'
      ? `A ${CONFIG.MENTORIA_NOME} é para quem já tem base como você — e precisa destravar a fluência, a interpretação profissional e a confiança para ir mais longe.`
      : `O ${CONFIG.CURSO_NOME} foi desenvolvido para pessoas exatamente no seu perfil. Com certificação de 300 horas e metodologia visual exclusiva — você aprende como a mente surda processa, não como tradução.`
    }\n\nReservei uma condição especial para você por tempo limitado.\n\nResponde esse e-mail ou me chama no WhatsApp para saber mais. 🙏\n\nCom carinho,\nLorena\nNerds da Libras`,

    `Oi ${nome}!\n\nOntem você fez o diagnóstico e ficou no nível ${nivel}.\n\nPreciso te contar algo que a maioria dos cursos nunca explica:\n\nA Libras não é português sinalizado. É uma língua completa, com gramática visual própria.\n\nEnquanto você tenta traduzir o português para sinais, seu cérebro fica em conflito. É por isso que pessoas que estudam por anos travam na hora de usar.\n\nO método certo inverte isso: você aprende a pensar visualmente. E aí as coisas fluem.\n\nA ${prod} vai te dar exatamente isso — com acompanhamento, estrutura e o caminho mais curto.\n\nA condição especial que reservei para você ainda está disponível.\n\nPosso te mostrar os detalhes?\n\nLorena 🤟\nNerds da Libras`,

    `Oi ${nome}.\n\nEssa é minha última mensagem.\n\nFizemos o diagnóstico juntos há 2 dias. Você está no nível ${nivel} — e eu sei exatamente o que você precisa para evoluir.\n\nNão vou insistir. Sei que a vida é corrida e as decisões têm tempo.\n\nMas quero deixar uma coisa registrada:\n\nA barreira que existe hoje entre você e uma pessoa surda é real. E ela não vai desaparecer sozinha.\n\nQuando você estiver pronto${sfx}, o link está aqui:\n${link}\n\nVai ser um prazer te ver do outro lado.\n\nCom carinho,\nLorena 🤟\nNerds da Libras`,
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

