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

    `Oi, ${nome}! 💜\n\nSextou — e hoje é dia de condição especial. 🎉\n\nEm algum momento você se interessou pelo Zero a Libras, mas ainda não começou. Cada dia sem se comunicar com quem você ama é um dia que não volta. Então decidi facilitar pra você dar o primeiro passo HOJE:\n\nUse o cupom DESCONTO30 e ganhe 30% de desconto. 🤟\n\n👉 QUERO MEUS 30% DE DESCONTO:\n${link}\n\nE tem mais — bônus exclusivo de quem garante a vaga agora:\n🎁 Aula extra "Suas primeiras 20 frases em Libras" — as que você mais vai usar no dia a dia, prontas pra usar já na primeira semana.\n\n⚠️ IMPORTANTE: o cupom DESCONTO30 (30% OFF) e o bônus ficam disponíveis só até sábado, dia ${sabado}, às 23h59.\n\nNão deixa essa conversa pra depois. 💜\n\nCom carinho,\nLorena`,
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

