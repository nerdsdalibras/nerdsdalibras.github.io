let filtroAtivo = 'todos';

function checkPassword() {
  const input = document.getElementById('pwd-input');
  if (input.value === CONFIG.DASHBOARD_PASSWORD) {
    sessionStorage.setItem('ndl_auth', '1');
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard();
  } else {
    input.style.borderColor = 'rgba(220,50,50,.6)';
    input.value = '';
    input.placeholder = 'Senha incorreta. Tente novamente.';
    setTimeout(() => { input.style.borderColor = ''; input.placeholder = '••••••••'; }, 2000);
  }
}

function logout() {
  sessionStorage.removeItem('ndl_auth');
  document.getElementById('dashboard').style.display = 'none';
  document.getElementById('password-screen').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
}

function filtrar(status, btn) {
  filtroAtivo = status;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderLeads();
}

function renderDashboard() {
  renderStats();
  renderLeads();
}

function renderStats() {
  const leads = Storage.getAll();
  const total       = leads.length;
  const prioridade  = leads.filter(l => l.status === 'prioridade_maxima').length;
  const muitoQuente = leads.filter(l => l.status === 'muito_quente').length;
  const quente      = leads.filter(l => l.status === 'quente').length;
  const comprou     = leads.filter(l => l.comprouKiwify).length;

  document.getElementById('stats').innerHTML = `
    <div class="stat-card"><div class="stat-val">${total}</div><div class="stat-label">Total de leads</div></div>
    <div class="stat-card"><div class="stat-val stat-roxo">${prioridade}</div><div class="stat-label">⭐ Prioridade</div></div>
    <div class="stat-card"><div class="stat-val stat-red">${muitoQuente}</div><div class="stat-label">🔥🔥 Muito Quente</div></div>
    <div class="stat-card"><div class="stat-val stat-verde">${quente}</div><div class="stat-label">🔥 Quente</div></div>
    <div class="stat-card"><div class="stat-val stat-ouro">${comprou}</div><div class="stat-label">✅ Compraram</div></div>`;
}

function renderLeads() {
  const todos = Storage.getAll().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const leads = filtroAtivo === 'todos'
    ? todos
    : filtroAtivo === 'comprou'
      ? todos.filter(l => l.comprouKiwify)
      : todos.filter(l => l.status === filtroAtivo);

  if (!leads.length) {
    document.getElementById('leads-list').innerHTML = `
      <div class="empty-state">
        <div class="e-icon">📭</div>
        <div>Nenhum lead ${filtroAtivo === 'todos' ? 'ainda' : 'nessa categoria'}</div>
      </div>`;
    return;
  }

  document.getElementById('leads-list').innerHTML = leads.map((l, i) => renderLeadCard(l, i)).join('');
}

function renderLeadCard(l, idx) {
  const statusKey   = l.comprouKiwify ? 'comprou' : (l.status || 'novo');
  const statusLabel = DecisionEngine.STATUS_LABELS[statusKey] || statusKey;
  const badgeClass  = `badge-${statusKey}`;
  const data        = l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' }) : '—';
  const wppLink     = l.whatsapp ? `https://wa.me/55${l.whatsapp.replace(/\D/g,'')}` : '#';

  return `
    <div class="lead-card status-${statusKey}" id="card-${l.sessionId}">
      <div class="lead-main" style="flex:1">
        <div class="lead-top">
          <div>
            <div class="lead-nome">${l.nome || '—'}</div>
            <div class="lead-meta">${data}</div>
          </div>
          <span class="lead-badge ${badgeClass}">${statusLabel}</span>
        </div>

        <div class="lead-info">
          <div class="info-chip">📱 <strong>${l.whatsapp || '—'}</strong></div>
          ${l.instagram ? `<div class="info-chip">📸 <strong>${l.instagram}</strong></div>` : ''}
          <div class="info-chip">Nível: <strong>${l.nivelIdentificado || '—'}</strong></div>
          <div class="info-chip">Oferta: <strong>${l.resultado || '—'}</strong></div>
          ${l.comprouKiwify ? '<div class="info-chip" style="color:#4ADE80">✅ Clicou comprar</div>' : ''}
          ${l.clicouGrupo ? '<div class="info-chip" style="color:#a8efca">💬 Clicou no grupo</div>' : ''}
        </div>

        ${l.statusCloser ? `<div class="lead-closer">Closer: ${l.statusCloser}</div>` : ''}
      </div>

      <div class="lead-actions">
        <button class="action-btn btn-copy" data-copy="${l.sessionId}" onclick="copiarMensagem('${l.sessionId}')">📋 Copiar msg</button>
        ${l.whatsapp ? `<a class="action-btn btn-wpp" href="${wppLink}" target="_blank" rel="noopener">💬 Abrir WhatsApp</a>` : ''}
        <select class="action-btn btn-status" onchange="atualizarStatus('${l.sessionId}', this.value)">
          ${Object.entries(DecisionEngine.STATUS_LABELS).map(([k, v]) =>
            `<option value="${k}" ${l.status === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>
    </div>`;
}

function gerarMensagem(l) {
  const nome  = l.nome || 'você';
  const nivel = l.nivelIdentificado || 'esse nível';
  if (l.oferta === 'mentoria' || l.resultado === 'Mentoria') {
    return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu nível é ${nivel}. Você tinha interesse na Mentoria Ciclo da Fluência. Posso te passar mais detalhes sobre as vagas?`;
  }
  return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu nível é ${nivel}. Você estava interessad${l.genero === 'masculino' ? 'o' : 'a'} no Curso do Zero à Libras. Ainda posso te ajudar a dar o próximo passo?`;
}

function copiarMensagem(sessionId) {
  const lead = Storage.getAll().find(l => l.sessionId === sessionId);
  if (!lead) return;
  const msg = gerarMensagem(lead);
  navigator.clipboard.writeText(msg).then(() => {
    const btn = document.querySelector(`[data-copy="${sessionId}"]`);
    if (btn) {
      btn.textContent = '✅ Copiado!';
      setTimeout(() => { btn.textContent = '📋 Copiar msg'; }, 2000);
    }
  });
}

function atualizarStatus(sessionId, newStatus) {
  Storage.updateStatus(sessionId, newStatus);
  renderStats();
  renderLeads();
}

// Verifica se já está autenticado na sessão
window.addEventListener('DOMContentLoaded', () => {
  if (sessionStorage.getItem('ndl_auth') === '1') {
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('dashboard').style.display = 'block';
    renderDashboard();
  }
});
