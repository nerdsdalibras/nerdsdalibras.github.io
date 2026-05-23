/* ── STATE ── */
let filtroAtivo  = 'todos';
let currentLead  = null;
let currentTab   = 'dados';
let currentPage  = 'leads';

/* ── AUTH ── */
function checkPassword() {
  const input = document.getElementById('pwd-input');
  const err   = document.getElementById('pwd-err');
  if (input.value === CONFIG.DASHBOARD_PASSWORD) {
    sessionStorage.setItem('ndl_auth', '1');
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('app').removeAttribute('hidden');
    renderDashboard();
  } else {
    err.textContent = 'Senha incorreta.';
    input.value = '';
    input.focus();
    setTimeout(() => { err.textContent = ''; }, 2500);
  }
}

function logout() {
  sessionStorage.removeItem('ndl_auth');
  document.getElementById('app').setAttribute('hidden', '');
  document.getElementById('password-screen').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
}

/* ── NAVIGATION ── */
function setPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'pipeline')  renderPipeline();
  else if (page === 'analytics') renderAnalytics();
  else renderLeads();
}

function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── MAIN RENDER ── */
function renderDashboard() {
  const leads = Storage.getAll();
  updateBadges(leads);
  renderStats(leads);
  renderLeads();
  renderAISuggestions(leads);
}

/* ── AI SUGGESTIONS ── */
function renderAISuggestions(leads) {
  const box = document.getElementById('ai-box');
  const suggestions = [];
  const now = Date.now();

  const hotNoContact = leads.filter(l =>
    (l.status === 'muito_quente' || l.status === 'prioridade_maxima') &&
    (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível')
  );
  if (hotNoContact.length) {
    suggestions.push({
      dot: 'red',
      text: `${hotNoContact.length} lead${hotNoContact.length > 1 ? 's muito quentes' : ' muito quente'} ainda sem abordagem`,
      sub: 'Ação urgente — entre em contato agora'
    });
  }

  const checkoutNoBuy = leads.filter(l => l.comprouKiwify && l.status !== 'comprou');
  if (checkoutNoBuy.length) {
    suggestions.push({
      dot: 'orange',
      text: `${checkoutNoBuy.length} lead${checkoutNoBuy.length > 1 ? 's' : ''} clicou no checkout mas não finalizou`,
      sub: 'Carrinho abandonado — recuperação tem alta conversão'
    });
  }

  const newStale = leads.filter(l => {
    if (l.status !== 'novo' && l.status !== 'morno') return false;
    const age = now - new Date(l.createdAt).getTime();
    return age > 2 * 3600000;
  });
  if (newStale.length) {
    suggestions.push({
      dot: 'orange',
      text: `${newStale.length} lead${newStale.length > 1 ? 's' : ''} sem contato há mais de 2h`,
      sub: 'Leads frescos convertem muito mais — agir rápido'
    });
  }

  const today = leads.filter(l => {
    if (!l.createdAt) return false;
    const d = new Date(l.createdAt), n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });
  if (today.length && !suggestions.length) {
    suggestions.push({
      dot: 'green',
      text: `${today.length} novo${today.length > 1 ? 's leads chegaram' : ' lead chegou'} hoje`,
      sub: 'Primeiro contato nas primeiras horas aumenta conversão em 400%'
    });
  }

  if (!suggestions.length) { box.style.display = 'none'; return; }

  box.style.display = 'block';
  box.innerHTML = `
    <div class="ai-box-header">⚡ IA · Alertas</div>
    <div class="ai-suggestions-list">
      ${suggestions.map(s => `
        <div class="ai-suggestion">
          <div class="ai-dot ${s.dot}"></div>
          <div class="ai-suggestion-text">
            ${s.text}
            <em>${s.sub}</em>
          </div>
        </div>
      `).join('')}
    </div>`;
}

/* ── STATS ── */
function renderStats(leads) {
  if (!leads) leads = Storage.getAll();
  const now   = new Date();
  const total = leads.length;

  const hoje = leads.filter(l => {
    if (!l.createdAt) return false;
    const d = new Date(l.createdAt);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;

  const muitoQuente = leads.filter(l => l.status === 'muito_quente').length;
  const prioridade  = leads.filter(l => l.status === 'prioridade_maxima').length;
  const comprou     = leads.filter(l => l.status === 'comprou' || l.comprouKiwify).length;
  const semContato  = leads.filter(l =>
    !l.status || l.status === 'novo' ||
    (l.statusCloser === 'Aguardando resposta sobre próximo nível' && l.status !== 'comprou' && l.status !== 'nao_quis')
  ).length;
  const conversao   = total > 0 ? Math.round((comprou / total) * 100) : 0;
  const faturamento = comprou * 397;

  document.getElementById('stats').innerHTML = `
    <div class="stat-card animate-up">
      <div class="stat-icon">👥</div>
      <div class="stat-val sv-white">${total}</div>
      <div class="stat-label">Total de Leads</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.03s">
      <div class="stat-icon">📅</div>
      <div class="stat-val sv-blue">${hoje}</div>
      <div class="stat-label">Chegaram Hoje</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.06s">
      <div class="stat-icon">🔥</div>
      <div class="stat-val sv-red">${muitoQuente + prioridade}</div>
      <div class="stat-label">Muito Quentes</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.09s">
      <div class="stat-icon">⭐</div>
      <div class="stat-val sv-purple">${prioridade}</div>
      <div class="stat-label">Prioridade Máxima</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.12s">
      <div class="stat-icon">✅</div>
      <div class="stat-val sv-green">${comprou}</div>
      <div class="stat-label">Compraram</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.15s">
      <div class="stat-icon">📈</div>
      <div class="stat-val sv-yellow">${conversao}%</div>
      <div class="stat-label">Taxa de Conversão</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.18s">
      <div class="stat-icon">💰</div>
      <div class="stat-val sv-green" style="font-size:1.1rem">R$${faturamento.toLocaleString('pt-BR')}</div>
      <div class="stat-label">Faturamento Est.</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.21s">
      <div class="stat-icon">⚡</div>
      <div class="stat-val sv-orange">${semContato}</div>
      <div class="stat-label">Aguardando Contato</div>
    </div>
  `;
}

/* ── FILTERS ── */
function renderFilters(leads) {
  const counts = {
    todos:            leads.length,
    prioridade_maxima: leads.filter(l => l.status === 'prioridade_maxima').length,
    muito_quente:     leads.filter(l => l.status === 'muito_quente').length,
    quente:           leads.filter(l => l.status === 'quente').length,
    morno:            leads.filter(l => l.status === 'morno').length,
    comprou:          leads.filter(l => l.status === 'comprou' || l.comprouKiwify).length,
    nao_quis:         leads.filter(l => l.status === 'nao_quis').length,
    aguardando:       leads.filter(l => l.status === 'aguardando').length,
  };
  const defs = [
    { key: 'todos',             label: 'Todos' },
    { key: 'prioridade_maxima', label: '⭐ Prioridade' },
    { key: 'muito_quente',      label: '🔥🔥 Muito Quente' },
    { key: 'quente',            label: '🔥 Quente' },
    { key: 'morno',             label: '🌡 Morno' },
    { key: 'comprou',           label: '✅ Compraram' },
    { key: 'aguardando',        label: '⏳ Aguardando' },
    { key: 'nao_quis',          label: '❌ Não Quiseram' },
  ];
  document.getElementById('filters').innerHTML = defs
    .filter(f => counts[f.key] > 0 || f.key === 'todos')
    .map(f => `
      <button class="filter-btn ${filtroAtivo === f.key ? 'active' : ''}"
              onclick="filtrar('${f.key}', this)">
        ${f.label} <span class="filter-count">${counts[f.key]}</span>
      </button>`).join('');
}

function filtrar(status, btn) {
  filtroAtivo = status;
  renderLeads();
}

function onSearch() {
  renderLeads();
}

/* ── LEADS LIST ── */
function renderLeads() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  let leads = Storage.getAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  renderFilters(leads);

  if (filtroAtivo !== 'todos') {
    leads = leads.filter(l => {
      if (filtroAtivo === 'comprou') return l.status === 'comprou' || l.comprouKiwify;
      return l.status === filtroAtivo;
    });
  }
  if (search) {
    leads = leads.filter(l =>
      (l.nome || '').toLowerCase().includes(search) ||
      (l.whatsapp || '').includes(search) ||
      (l.instagram || '').toLowerCase().includes(search)
    );
  }

  const list = document.getElementById('leads-list');
  if (!leads.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">Nenhum lead encontrado</div>
        <div class="empty-sub">${filtroAtivo !== 'todos' ? 'Tente outro filtro' : 'Os leads aparecem aqui após o quiz'}</div>
      </div>`;
    return;
  }
  list.innerHTML = leads.map((l, i) => renderLeadCard(l, i)).join('');
}

function renderLeadCard(l, idx) {
  const statusKey   = l.comprouKiwify ? 'comprou' : (l.status || 'novo');
  const statusLabel = DecisionEngine.STATUS_LABELS[statusKey] || statusKey;
  const timeAgo     = l.createdAt ? timeElapsed(l.createdAt) : '';
  const wppLink     = l.whatsapp ? `https://wa.me/55${l.whatsapp.replace(/\D/g,'')}` : null;
  const pontuacao   = l.pontuacao || 0;
  const scorePct    = Math.min(100, Math.round((pontuacao / 48) * 100));
  const scoreColor  = scorePct >= 65 ? 'var(--g)' : scorePct >= 40 ? 'var(--yellow)' : 'var(--red)';
  const initials    = (l.nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = getAvatarColor(l.sessionId || l.nome || '');
  const hasAlert    = (statusKey === 'muito_quente' || statusKey === 'prioridade_maxima') &&
                      (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível');

  return `
    <div class="lead-card lc-${statusKey} animate-up" style="animation-delay:${Math.min(idx * 0.025, 0.3)}s"
         onclick="openLead('${l.sessionId}')">
      <div class="lead-row1">
        <div class="lead-info-main">
          <div class="lead-avatar" style="background:${avatarColor}">${initials}</div>
          <div class="lead-name-wrap">
            <div class="lead-name">${l.nome || 'Lead sem nome'}</div>
            <div class="lead-sub">${l.whatsapp || '—'}${l.instagram ? ' · @' + l.instagram : ''}</div>
          </div>
        </div>
        <div class="lead-right">
          <span class="lead-badge lb-${statusKey}">${statusLabel}</span>
          <span class="lead-time">${timeAgo}</span>
        </div>
      </div>

      <div class="lead-row2">
        ${pontuacao > 0 ? `
        <div class="score-bar">
          <span>Score</span>
          <div class="score-track">
            <div class="score-fill" style="width:${scorePct}%;background:${scoreColor}"></div>
          </div>
          <strong>${pontuacao}</strong>
        </div>` : ''}
        ${l.nivelIdentificado ? `<div class="info-chip"><strong>${l.nivelIdentificado}</strong></div>` : ''}
        ${l.oferta ? `<div class="info-chip">${l.oferta === 'curso' ? '📚 Curso' : '🎯 Mentoria'}</div>` : ''}
        ${l.comprouKiwify ? `<div class="info-chip green">✅ Checkout</div>` : ''}
        ${l.clicouGrupo   ? `<div class="info-chip blue">💬 Grupo</div>` : ''}
        ${hasAlert ? `<div class="ai-alert">⚡ Abordar agora</div>` : ''}
      </div>

      <div class="lead-row3">
        <span style="font-size:.71rem;color:var(--td)">${l.createdAt ? formatDate(l.createdAt) : '—'}</span>
        <div class="lead-quick-actions" onclick="event.stopPropagation()">
          <button class="quick-btn qb-copy" onclick="copiarMensagem('${l.sessionId}', this)">📋 Msg</button>
          ${wppLink ? `<a class="quick-btn qb-wpp" href="${wppLink}" target="_blank" rel="noopener">💬 WA</a>` : ''}
          <button class="quick-btn qb-open" onclick="openLead('${l.sessionId}')">Ver →</button>
        </div>
      </div>
    </div>`;
}

/* ── LEAD DETAIL PANEL ── */
function openLead(sessionId) {
  const lead = Storage.getAll().find(l => l.sessionId === sessionId);
  if (!lead) return;
  currentLead = lead;
  currentTab  = 'dados';

  const statusKey   = lead.comprouKiwify ? 'comprou' : (lead.status || 'novo');
  const initials    = (lead.nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = getAvatarColor(lead.sessionId || lead.nome || '');

  document.getElementById('panel-title-wrap').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <div class="lead-avatar" style="background:${avatarColor};width:32px;height:32px;font-size:.75rem;flex-shrink:0">${initials}</div>
      <div>
        <div class="panel-lead-name">${lead.nome || 'Lead sem nome'}</div>
        <div class="panel-lead-sub">${DecisionEngine.STATUS_LABELS[statusKey] || statusKey}</div>
      </div>
    </div>`;

  document.getElementById('panel-hdr-actions').innerHTML = lead.whatsapp
    ? `<a class="quick-btn qb-wpp" href="https://wa.me/55${lead.whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener">💬 WA</a>`
    : '';

  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector('[data-tab="dados"]').classList.add('active');

  renderTab('dados');
  document.getElementById('lead-panel').classList.add('open');
  document.getElementById('panel-overlay').classList.add('active');
}

function closePainel() {
  document.getElementById('lead-panel').classList.remove('open');
  document.getElementById('panel-overlay').classList.remove('active');
  currentLead = null;
}

function setTab(tab) {
  currentTab = tab;
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');
  renderTab(tab);
}

function renderTab(tab) {
  const body = document.getElementById('panel-body');
  if (!currentLead) return;
  const l = currentLead;

  if (tab === 'dados') {
    const statusKey = l.comprouKiwify ? 'comprou' : (l.status || 'novo');
    body.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">Contato</div>
        <div class="panel-field"><span class="pf-label">Nome</span><span class="pf-val">${l.nome || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">WhatsApp</span><span class="pf-val">${l.whatsapp || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Instagram</span><span class="pf-val">${l.instagram ? '@' + l.instagram : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Gênero</span><span class="pf-val">${l.genero === 'masculino' ? 'Masculino' : l.genero === 'feminino' ? 'Feminino' : '—'}</span></div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Diagnóstico</div>
        <div class="panel-field"><span class="pf-label">Nível</span><span class="pf-val">${l.nivelIdentificado || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Pontuação</span><span class="pf-val">${l.pontuacao || 0} / 48 pts</span></div>
        <div class="panel-field"><span class="pf-label">Oferta</span><span class="pf-val">${l.oferta === 'curso' ? '📚 Curso' : l.oferta === 'mentoria' ? '🎯 Mentoria' : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Classificação</span><span class="pf-val">${l.classificacaoLead || '—'}</span></div>
        ${l.respostaDificuldade ? `<div class="panel-field"><span class="pf-label">Dificuldade (Q1)</span><span class="pf-val">${l.respostaDificuldade}</span></div>` : ''}
        ${l.respostaObjetivo    ? `<div class="panel-field"><span class="pf-label">Objetivo (Q2)</span><span class="pf-val">${l.respostaObjetivo}</span></div>` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Atividade</div>
        <div class="panel-field"><span class="pf-label">Entrou em</span><span class="pf-val">${l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Tempo no quiz</span><span class="pf-val">${l.tempoNoQuiz ? l.tempoNoQuiz + 's' : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Clicou checkout</span><span class="pf-val">${l.comprouKiwify ? '✅ Sim' : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Entrou no grupo</span><span class="pf-val">${l.clicouGrupo ? '✅ Sim' : '—'}</span></div>
        ${l.statusCloser ? `<div class="panel-field"><span class="pf-label">Nota closer</span><span class="pf-val">${l.statusCloser}</span></div>` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Status do Pipeline</div>
        <select class="panel-status-select" onchange="atualizarStatus('${l.sessionId}', this.value)">
          ${Object.entries(DecisionEngine.STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${(l.status || 'novo') === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Ações</div>
        ${l.whatsapp ? `<a class="panel-big-btn pbb-wpp" href="https://wa.me/55${l.whatsapp.replace(/\D/g,'')}" target="_blank" rel="noopener">💬 Abrir WhatsApp</a>` : ''}
        <button class="panel-big-btn pbb-copy" onclick="copiarMensagemPanel()">📋 Copiar mensagem de abordagem</button>
      </div>`;
  }

  else if (tab === 'timeline') {
    const events = buildTimeline(l);
    body.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">Histórico</div>
        ${events.length
          ? events.map(e => `
            <div class="timeline-item">
              <span class="tl-time">${e.time}</span>
              <span class="tl-text">${e.text}</span>
            </div>`).join('')
          : '<div style="font-size:.81rem;color:var(--td);text-align:center;padding:24px">Sem eventos registrados</div>'}
      </div>`;
  }

  else if (tab === 'objections') {
    body.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">Objeções Comuns & Respostas</div>
        ${getObjecoes(l).map(o => `
          <div class="objection-card">
            <div class="obj-q">${o.q}</div>
            <div class="obj-a">${o.a}</div>
          </div>`).join('')}
      </div>`;
  }

  else if (tab === 'agenda') {
    const ag = l.agenda;
    body.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">Agendar Follow-up</div>
        <input class="agenda-input" type="datetime-local" id="agenda-dt"
               value="${ag ? ag.dt : ''}"/>
        <input class="agenda-input" type="text" id="agenda-nota"
               placeholder="Nota sobre o follow-up..."
               value="${ag ? (ag.nota || '') : ''}"/>
        <button class="panel-big-btn pbb-green" onclick="salvarAgenda()">✓ Salvar</button>
      </div>
      ${ag ? `
      <div class="panel-section">
        <div class="panel-section-title">Follow-up Agendado</div>
        <div class="panel-field"><span class="pf-label">Data</span><span class="pf-val">${new Date(ag.dt).toLocaleString('pt-BR')}</span></div>
        ${ag.nota ? `<div class="panel-field"><span class="pf-label">Nota</span><span class="pf-val">${ag.nota}</span></div>` : ''}
      </div>` : ''}`;
  }

  else if (tab === 'ia') {
    body.innerHTML = getIASuggestions(l);
  }
}

function buildTimeline(l) {
  const events = [];
  if (l.createdAt)    events.push({ time: formatTime(l.createdAt), text: 'Concluiu o diagnóstico com a Lorena' });
  if (l.iniciouQuiz)  events.push({ time: '—', text: 'Iniciou o quiz' });
  if (l.concluiuQuiz) events.push({ time: '—', text: `Pontuação final: ${l.pontuacao || 0} / 48 pts` });
  if (l.clicouGrupo)  events.push({ time: '—', text: '💬 Entrou no grupo de WhatsApp' });
  if (l.comprouKiwify) events.push({ time: '—', text: '🛒 Clicou no checkout (Kiwify)' });
  if (l.status === 'comprou') events.push({ time: l.updatedAt ? formatTime(l.updatedAt) : '—', text: '✅ Registrado como comprado' });
  if (l.status === 'nao_quis') events.push({ time: l.updatedAt ? formatTime(l.updatedAt) : '—', text: '❌ Registrado como não quis' });
  return events;
}

function getObjecoes(l) {
  const base = [
    {
      q: '"Não tenho tempo para estudar agora."',
      a: 'O curso é 100% no seu ritmo, com acesso vitalício. Você estuda quando e como quiser — 15 minutos por dia já fazem enorme diferença.'
    },
    {
      q: '"Está muito caro."',
      a: 'Dividido em 12x de R$41,06, fica menos que um café por dia. Quanto vale se comunicar com uma pessoa surda pela primeira vez na vida?'
    },
    {
      q: '"Já tentei aprender e desisti."',
      a: 'A maioria que desiste é porque o método era errado — não a pessoa. Com a metodologia visual e progressiva certa, é completamente diferente.'
    },
    {
      q: '"Preciso pensar mais."',
      a: 'Entendo! Enquanto isso, posso tirar alguma dúvida específica? Às vezes um detalhe pequeno impede uma decisão que muda tudo.'
    },
  ];
  if (l.oferta === 'mentoria' || l.nivelIdentificado === 'AVANÇADO') {
    base.push({
      q: '"Não preciso de mentoria, consigo estudar sozinha."',
      a: 'Saber estudar é diferente de ter aceleração com acompanhamento. A mentoria encurta em meses um caminho que levaria anos no autoestudo.'
    });
  }
  return base;
}

function getIASuggestions(l) {
  const nome      = l.nome || 'o lead';
  const statusKey = l.comprouKiwify ? 'comprou' : (l.status || 'novo');
  const nivel     = l.nivelIdentificado || '';

  let msg = '';
  if (statusKey === 'prioridade_maxima') {
    msg = `Oi, ${nome}! 🤟 Aqui é a Lorena.\n\nVi seu diagnóstico e seu perfil chamou minha atenção — você está num ponto muito importante da sua jornada em Libras.\n\nQuero te fazer uma proposta personalizada. Posso te contar mais?`;
  } else if (statusKey === 'muito_quente') {
    msg = `Oi, ${nome}! 🤟 Sou a Lorena da Nerds da Libras.\n\nVi que você fez o diagnóstico e seu nível é ${nivel}. Tenho algo especialmente preparado para o seu perfil — posso te explicar?`;
  } else if (l.comprouKiwify && statusKey !== 'comprou') {
    msg = `Oi, ${nome}! Percebi que você chegou a ver o checkout mas não finalizou. Posso te ajudar com alguma dúvida? Às vezes um detalhe pequeno impede uma decisão que muda tudo.`;
  } else if (statusKey === 'quente') {
    msg = `Oi, ${nome}! 🤟 Vi que você fez o diagnóstico com a Lorena. Ainda tem interesse em evoluir em Libras? Posso te contar como funciona ${l.oferta === 'mentoria' ? 'a mentoria' : 'o curso'}?`;
  } else {
    msg = `Oi, ${nome}! 🤟 Vi que você fez o diagnóstico com a Lorena. Posso te mostrar qual é o próximo passo ideal para o seu perfil?`;
  }

  const alerts = [];
  if (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível') {
    alerts.push({ title: 'Primeiro Contato', text: `${nome} ainda não foi abordad${l.genero === 'feminino' ? 'a' : 'o'}. Sugestão: entrar em contato nas próximas ${statusKey === 'prioridade_maxima' ? '30 minutos' : '2 horas'}.` });
  }
  if (l.comprouKiwify && statusKey !== 'comprou') {
    alerts.push({ title: 'Recuperar Carrinho', text: 'Clicou no checkout mas não comprou. Alta probabilidade de conversão com uma mensagem de recuperação.' });
  }
  if (nivel === 'AVANÇADO' && l.oferta !== 'mentoria') {
    alerts.push({ title: 'Upgrade para Mentoria', text: 'Perfil avançado. Considere oferecer a Mentoria Ciclo da Fluência como próximo passo.' });
  }

  return `
    <div class="panel-section">
      <div class="panel-section-title">Análise do Perfil</div>
      ${alerts.length
        ? alerts.map(a => `
          <div class="ia-card">
            <div class="ia-card-title">${a.title}</div>
            <div class="ia-card-text">${a.text}</div>
          </div>`).join('')
        : '<div style="font-size:.81rem;color:var(--td);padding:8px 0">Nenhum alerta ativo para este lead.</div>'}
    </div>
    <div class="panel-section">
      <div class="panel-section-title">Mensagem Sugerida</div>
      <div class="ia-card">
        <div class="ia-card-text">Use esta mensagem personalizada para ${nome}:</div>
        <div class="ia-card-msg">${msg.replace(/\n/g, '<br>')}</div>
        <button class="panel-big-btn pbb-copy" style="margin-top:8px"
                onclick="copiarTexto(${JSON.stringify(msg)}, this)">📋 Copiar mensagem</button>
      </div>
    </div>`;
}

/* ── PIPELINE ── */
const PIPELINE_STAGES = [
  { key: 'novo',              label: 'Novo Lead',       color: '#a1a1aa' },
  { key: 'morno',             label: 'Morno',           color: '#fbbf24' },
  { key: 'quente',            label: 'Quente',          color: '#4ade80' },
  { key: 'muito_quente',      label: 'Muito Quente',    color: '#f87171' },
  { key: 'prioridade_maxima', label: 'Prioridade Máx.', color: '#a78bfa' },
  { key: 'aguardando',        label: 'Follow-up',       color: '#f97316' },
  { key: 'comprou',           label: 'Comprou',         color: '#60a5fa' },
  { key: 'nao_quis',          label: 'Perdido',         color: '#52525b' },
];

function renderPipeline() {
  const leads  = Storage.getAll();
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = PIPELINE_STAGES.map(stage => {
    const sl = leads.filter(l => (l.status || 'novo') === stage.key);
    return `
      <div class="kanban-col">
        <div class="col-header">
          <div class="col-title-wrap">
            <div class="col-dot" style="background:${stage.color}"></div>
            <span class="col-title">${stage.label}</span>
          </div>
          <span class="col-count">${sl.length}</span>
        </div>
        <div class="col-cards">
          ${sl.length
            ? sl.map(l => `
              <div class="mini-card" onclick="openLead('${l.sessionId}')">
                <div class="mini-name">${l.nome || 'Lead'}</div>
                <div class="mini-sub">${l.whatsapp || '—'}</div>
                ${l.pontuacao ? `<div class="mini-score">Score: ${l.pontuacao}</div>` : ''}
              </div>`).join('')
            : '<div class="mini-empty">Vazio</div>'}
        </div>
      </div>`;
  }).join('');
}

/* ── ANALYTICS ── */
function renderAnalytics() {
  const leads = Storage.getAll();
  const total = leads.length || 1;

  // Leads por dia — últimos 7 dias
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

  // Status counts
  const sc = {};
  PIPELINE_STAGES.forEach(s => { sc[s.key] = leads.filter(l => (l.status || 'novo') === s.key).length; });
  const comprou   = leads.filter(l => l.status === 'comprou' || l.comprouKiwify).length;
  const checkout  = leads.filter(l => l.comprouKiwify).length;
  const hot       = (sc.quente || 0) + (sc.muito_quente || 0) + (sc.prioridade_maxima || 0);
  const conversao = Math.round((comprou / total) * 100);

  // Por nível
  const nc = {
    'BÁSICO':         leads.filter(l => l.nivelIdentificado === 'BÁSICO').length,
    'INTERMEDIÁRIO':  leads.filter(l => l.nivelIdentificado === 'INTERMEDIÁRIO').length,
    'AVANÇADO':       leads.filter(l => l.nivelIdentificado === 'AVANÇADO').length,
  };
  const totalNivel = Object.values(nc).reduce((a, b) => a + b, 0) || 1;

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
          <div class="funnel-label">Checkout</div>
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
          { label: 'Básico',         key: 'BÁSICO',        color: '#4ade80' },
          { label: 'Intermediário',  key: 'INTERMEDIÁRIO', color: '#fbbf24' },
          { label: 'Avançado',       key: 'AVANÇADO',      color: '#a78bfa' },
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
      <div class="chart-title">Resumo Geral</div>
      <div style="display:flex;flex-direction:column;gap:0">
        <div class="panel-field"><span class="pf-label">Total de leads</span><span class="pf-val sv-white">${leads.length}</span></div>
        <div class="panel-field"><span class="pf-label">Taxa de conversão</span><span class="pf-val sv-green">${conversao}%</span></div>
        <div class="panel-field"><span class="pf-label">Compraram</span><span class="pf-val sv-green">${comprou}</span></div>
        <div class="panel-field"><span class="pf-label">Faturamento est.</span><span class="pf-val sv-green">R$${(comprou * 397).toLocaleString('pt-BR')}</span></div>
        <div class="panel-field"><span class="pf-label">Leads ativos</span><span class="pf-val sv-orange">${leads.filter(l => l.status !== 'comprou' && l.status !== 'nao_quis').length}</span></div>
      </div>
    </div>
  `;
}

/* ── HELPERS ── */
function formatDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}
function formatTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}
function timeElapsed(iso) {
  const ms = Date.now() - new Date(iso).getTime();
  const m  = Math.floor(ms / 60000);
  const h  = Math.floor(m / 60);
  const d  = Math.floor(h / 24);
  if (d > 0) return `${d}d atrás`;
  if (h > 0) return `${h}h atrás`;
  if (m > 0) return `${m}m atrás`;
  return 'Agora';
}

const AVATAR_COLORS = ['#4ade80','#60a5fa','#a78bfa','#fb923c','#f472b6','#34d399','#facc15'];
function getAvatarColor(seed) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = seed.charCodeAt(i) + ((h << 5) - h);
  return AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length];
}

function updateBadges(leads) {
  if (!leads) leads = Storage.getAll();
  const hot = leads.filter(l => l.status === 'muito_quente' || l.status === 'prioridade_maxima').length;
  const b = document.getElementById('badge-leads');
  if (b) b.textContent = hot > 0 ? hot : '';
}

/* ── ACTIONS ── */
function gerarMensagem(l) {
  const nome  = l.nome || 'você';
  const nivel = l.nivelIdentificado || '—';
  if (l.oferta === 'mentoria') {
    return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu perfil é ${nivel}. Você havia demonstrado interesse na Mentoria Ciclo da Fluência. Posso te passar mais detalhes?`;
  }
  const sfx = l.genero === 'masculino' ? 'o' : 'a';
  return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu perfil é ${nivel}. Você estava interessad${sfx} no Curso do Zero à Libras. Ainda posso ajudar você a dar o próximo passo?`;
}

function copiarMensagem(sessionId, btn) {
  const lead = Storage.getAll().find(l => l.sessionId === sessionId);
  if (!lead) return;
  navigator.clipboard.writeText(gerarMensagem(lead)).then(() => {
    if (btn) { const t = btn.textContent; btn.textContent = '✅'; setTimeout(() => { btn.textContent = t; }, 2000); }
  });
}

function copiarMensagemPanel() {
  if (!currentLead) return;
  copiarTexto(gerarMensagem(currentLead));
}

function copiarTexto(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const t = btn.textContent; btn.textContent = '✅ Copiado!'; setTimeout(() => { btn.textContent = t; }, 2000); }
  });
}

function atualizarStatus(sessionId, newStatus) {
  Storage.updateStatus(sessionId, newStatus);
  const leads = Storage.getAll();
  if (currentLead && currentLead.sessionId === sessionId) {
    currentLead = leads.find(l => l.sessionId === sessionId);
  }
  updateBadges(leads);
  renderStats(leads);
  renderFilters(leads);
  if (currentPage === 'pipeline') renderPipeline();
}

function salvarAgenda() {
  if (!currentLead) return;
  const dt   = document.getElementById('agenda-dt')?.value;
  const nota = document.getElementById('agenda-nota')?.value;
  if (!dt) { alert('Selecione uma data'); return; }
  const leads = Storage.getAll();
  const idx   = leads.findIndex(l => l.sessionId === currentLead.sessionId);
  if (idx >= 0) {
    leads[idx].agenda = { dt, nota };
    localStorage.setItem('ndl_leads', JSON.stringify(leads));
    currentLead = leads[idx];
  }
  renderTab('agenda');
}

function exportCSV() {
  const leads  = Storage.getAll();
  const header = ['Nome','WhatsApp','Instagram','Gênero','Nível','Pontuação','Oferta','Classificação','Status','Checkout','Grupo','Data'];
  const rows   = leads.map(l => [
    l.nome || '', l.whatsapp || '', l.instagram || '', l.genero || '',
    l.nivelIdentificado || '', l.pontuacao || '', l.oferta || '', l.classificacaoLead || '',
    l.status || '', l.comprouKiwify ? 'Sim' : 'Não', l.clicouGrupo ? 'Sim' : 'Não',
    l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ── INIT ── */
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ndl_auth') === '1') {
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('app').removeAttribute('hidden');
    renderDashboard();
  }
});
