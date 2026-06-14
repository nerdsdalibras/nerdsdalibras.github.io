/* ═══════════════════════════════════════════
   MAIN RENDER
═══════════════════════════════════════════ */
async function renderDashboard(force = false) {
  setLoading(true);
  const leads = await getLeads(force);
  setLoading(false);
  updateBadges(leads);
  renderStats(leads);
  renderAISuggestions(leads);
  if (currentPage === 'leads')         renderLeads();
  else if (currentPage === 'pipeline') renderPipeline();
  else if (currentPage === 'analytics') renderAnalytics();
}

/* ═══════════════════════════════════════════
   AI SUGGESTIONS
═══════════════════════════════════════════ */
function renderAISuggestions(leads) {
  const box = document.getElementById('ai-box');
  const suggestions = [];
  const now = Date.now();

  const hotNoContact = leads.filter(l =>
    (l.status === 'muito_quente' || l.status === 'prioridade_maxima') &&
    (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível')
  );
  if (hotNoContact.length) {
    suggestions.push({ dot: 'red',
      text: `${hotNoContact.length} lead${hotNoContact.length > 1 ? 's muito quentes' : ' muito quente'} sem abordagem`,
      sub: 'Ação urgente — entre em contato agora' });
  }

  const checkoutNoBuy = leads.filter(isCarrinhoAbandonado);
  if (checkoutNoBuy.length) {
    suggestions.push({ dot: 'orange',
      text: `${checkoutNoBuy.length} lead${checkoutNoBuy.length > 1 ? 's' : ''} abandonou${checkoutNoBuy.length > 1 ? 'ram' : ''} o carrinho`,
      sub: 'Clicaram pra comprar e não finalizaram — recuperação tem alta conversão' });
  }

  const newStale = leads.filter(l => {
    if (l.status !== 'novo' && l.status !== 'morno') return false;
    return (now - new Date(l.createdAt).getTime()) > 2 * 3600000;
  });
  if (newStale.length) {
    suggestions.push({ dot: 'orange',
      text: `${newStale.length} lead${newStale.length > 1 ? 's' : ''} sem contato há mais de 2h`,
      sub: 'Leads frescos convertem muito mais — agir rápido' });
  }

  const today = leads.filter(l => {
    if (!l.createdAt) return false;
    const d = new Date(l.createdAt), n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  });
  if (today.length && !suggestions.length) {
    suggestions.push({ dot: 'green',
      text: `${today.length} novo${today.length > 1 ? 's leads chegaram' : ' lead chegou'} hoje`,
      sub: 'Primeiro contato nas primeiras horas aumenta conversão em 400%' });
  }

  if (!suggestions.length) { box.style.display = 'none'; return; }
  box.style.display = 'block';
  box.innerHTML = `
    <div class="ai-box-header">⚡ IA · Alertas</div>
    <div class="ai-suggestions-list">
      ${suggestions.map(s => `
        <div class="ai-suggestion">
          <div class="ai-dot ${s.dot}"></div>
          <div class="ai-suggestion-text">${s.text}<em>${s.sub}</em></div>
        </div>`).join('')}
    </div>`;
}

/* ═══════════════════════════════════════════
   STATS
═══════════════════════════════════════════ */
function renderStats(leads) {
  const now   = new Date();
  const total = leads.length;
  const hoje  = leads.filter(l => {
    if (!l.createdAt) return false;
    const d = new Date(l.createdAt);
    return d.getDate() === now.getDate() && d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  }).length;
  const muitoQuente = leads.filter(l => l.status === 'muito_quente').length;
  const prioridade  = leads.filter(l => l.status === 'prioridade_maxima').length;
  const comprou     = leads.filter(l => l.status === 'comprou').length;
  const carrinho    = leads.filter(isCarrinhoAbandonado).length;
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
    <div class="stat-card animate-up ${carrinho > 0 ? 'stat-alert' : ''}" style="animation-delay:.15s;cursor:pointer" onclick="filtrar('carrinho')">
      <div class="stat-icon">🛒</div>
      <div class="stat-val sv-orange">${carrinho}</div>
      <div class="stat-label">Carrinho Abandonado</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.18s">
      <div class="stat-icon">📈</div>
      <div class="stat-val sv-yellow">${conversao}%</div>
      <div class="stat-label">Taxa de Conversão</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.21s">
      <div class="stat-icon">💰</div>
      <div class="stat-val sv-green" style="font-size:1.1rem">R$${faturamento.toLocaleString('pt-BR')}</div>
      <div class="stat-label">Faturamento Conf.</div>
    </div>
    <div class="stat-card animate-up" style="animation-delay:.24s">
      <div class="stat-icon">⚡</div>
      <div class="stat-val sv-orange">${semContato}</div>
      <div class="stat-label">Aguardando Contato</div>
    </div>`;
}

/* ═══════════════════════════════════════════
   FILTERS
═══════════════════════════════════════════ */
function renderFilters(leads) {
  const counts = {
    todos:             leads.length,
    prioridade_maxima: leads.filter(l => l.status === 'prioridade_maxima').length,
    muito_quente:      leads.filter(l => l.status === 'muito_quente').length,
    quente:            leads.filter(l => l.status === 'quente').length,
    morno:             leads.filter(l => l.status === 'morno').length,
    comprou:           leads.filter(l => l.status === 'comprou').length,
    carrinho:          leads.filter(isCarrinhoAbandonado).length,
    aguardando:        leads.filter(l => l.status === 'aguardando').length,
    nao_quis:          leads.filter(l => l.status === 'nao_quis').length,
  };
  const defs = [
    { key: 'todos',             label: 'Todos' },
    { key: 'prioridade_maxima', label: '⭐ Prioridade' },
    { key: 'muito_quente',      label: '🔥🔥 Muito Quente' },
    { key: 'quente',            label: '🔥 Quente' },
    { key: 'morno',             label: '🌡 Morno' },
    { key: 'carrinho',          label: '🛒 Carrinho Abandonado' },
    { key: 'comprou',           label: '✅ Compraram' },
    { key: 'aguardando',        label: '⏳ Aguardando' },
    { key: 'nao_quis',          label: '❌ Não Quiseram' },
  ];

  const tags = getAllTags();
  const tagBtns = tags.map(t => `
    <button class="filter-btn ${tagFilter === t ? 'tag-active' : ''}"
            onclick="setTagFilter('${t}')" style="font-size:.71rem">
      🏷 ${t}
    </button>`).join('');

  document.getElementById('filters').innerHTML =
    defs.filter(f => counts[f.key] > 0 || f.key === 'todos').map(f => `
      <button class="filter-btn ${filtroAtivo === f.key && !tagFilter ? 'active' : ''}"
              onclick="filtrar('${f.key}')">
        ${f.label} <span class="filter-count">${counts[f.key]}</span>
      </button>`).join('') + tagBtns;
}

function filtrar(status) {
  filtroAtivo = status;
  tagFilter   = null;
  renderLeads();
}
function setTagFilter(tag) {
  tagFilter   = tagFilter === tag ? null : tag;
  filtroAtivo = 'todos';
  renderLeads();
}
let _searchTimer = null;
function onSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(renderLeads, 180);
}

/* ═══════════════════════════════════════════
   LIST HEADER
═══════════════════════════════════════════ */
function renderListHeader(total, filtered) {
  const hdr = document.getElementById('list-header');
  if (!hdr) return;
  if (total === undefined) { hdr.innerHTML = ''; return; }
  hdr.innerHTML = `
    <button class="list-select-all" onclick="toggleSelectAll()">
      <input type="checkbox" style="pointer-events:none;accent-color:var(--g)"
             ${selectedLeads.size > 0 ? 'checked' : ''}> Selecionar todos
    </button>
    <span class="list-header-count">Exibindo <strong>${filtered}</strong> de <strong>${total}</strong> leads${tagFilter ? ` · tag: <strong>${tagFilter}</strong> <button onclick="setTagFilter(null)" style="background:none;border:none;cursor:pointer;color:var(--red);font-size:.8rem">✕</button>` : ''}</span>`;
}

/* ═══════════════════════════════════════════
   LEADS LIST
═══════════════════════════════════════════ */
async function renderLeads() {
  const search = (document.getElementById('search-input')?.value || '').toLowerCase().trim();
  const leads  = await getLeads();

  renderFilters(leads);

  let filtered = [...leads];

  if (tagFilter) {
    filtered = filtered.filter(l => getLeadTags(l).includes(tagFilter));
  } else if (filtroAtivo === 'carrinho') {
    filtered = filtered.filter(isCarrinhoAbandonado);
  } else if (filtroAtivo !== 'todos') {
    filtered = filtered.filter(l => l.status === filtroAtivo);
  }

  if (search) {
    filtered = filtered.filter(l =>
      (l.nome || '').toLowerCase().includes(search) ||
      (l.whatsapp || '').includes(search) ||
      (l.instagram || '').toLowerCase().includes(search) ||
      getLeadTags(l).some(t => t.includes(search))
    );
  }

  filtered = sortLeads(filtered);
  renderListHeader(leads.length, filtered.length);

  const list = document.getElementById('leads-list');
  if (!filtered.length) {
    list.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <div class="empty-text">Nenhum lead encontrado</div>
        <div class="empty-sub">${filtroAtivo !== 'todos' || tagFilter ? 'Tente outro filtro' : 'Os leads aparecem aqui após o quiz'}</div>
      </div>`;
    return;
  }
  list.innerHTML = filtered.map((l, i) => renderLeadCard(l, i)).join('');
}

function renderLeadCard(l, idx) {
  const statusKey   = l.status || 'novo';
  const statusLabel = DecisionEngine.STATUS_LABELS[statusKey] || statusKey;
  const timeAgo     = l.createdAt ? timeElapsed(l.createdAt) : '';
  const wppLink     = l.whatsapp ? `https://wa.me/55${String(l.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(gerarMensagem(l))}` : null;
  const pontuacao   = l.pontuacao || 0;
  const scorePct    = Math.min(100, Math.round((pontuacao / 48) * 100));
  const scoreColor  = scorePct >= 65 ? 'var(--g)' : scorePct >= 40 ? 'var(--yellow)' : 'var(--red)';
  const initials    = (l.nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = getAvatarColor(String(l.sessionId || l.nome || ''));
  const hasAlert    = (statusKey === 'muito_quente' || statusKey === 'prioridade_maxima') &&
                      (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível');
  const carrinhoAbandonado = isCarrinhoAbandonado(l);
  const tags        = getLeadTags(l);
  const isSel       = selectedLeads.has(l.sessionId);

  return `
    <div class="lead-card lc-${statusKey} ${isSel ? 'selected' : ''} animate-up"
         style="animation-delay:${Math.min(idx * 0.025, 0.3)}s"
         data-session-id="${l.sessionId}"
         onclick="openLead('${l.sessionId}')">
      <div class="lead-row1">
        <div class="lead-info-main">
          <div class="lead-checkbox-wrap" onclick="toggleLeadSelect('${l.sessionId}', event)">
            <input type="checkbox" class="lead-checkbox" ${isSel ? 'checked' : ''} onclick="event.stopPropagation()"/>
          </div>
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
        ${statusKey === 'comprou'  ? `<div class="info-chip green">✅ Compra confirmada</div>` : ''}
        ${statusKey === 'reembolso'  ? `<div class="info-chip" style="color:#fff;background:#6B7280;border-color:#6B7280">↩️ Reembolsado</div>` : ''}
        ${statusKey === 'chargeback' ? `<div class="info-chip" style="color:#fff;background:#7F1D1D;border-color:#7F1D1D">⚠️ Chargeback</div>` : ''}
        ${isCartaoRecusado(l)      ? `<div class="info-chip" style="color:#fff;background:#DC2626;border-color:#DC2626">💳 Cartão recusado</div>`
          : carrinhoAbandonado     ? `<div class="info-chip" style="color:#fff;background:#EA580C;border-color:#EA580C">🛒 Carrinho abandonado</div>` : ''}
        ${l.vslClicouCTA    ? `<div class="info-chip" style="color:#FB923C;border-color:#FB923C">🛒 VSL→CTA</div>` :
          l.vslAssistiuFim  ? `<div class="info-chip" style="color:#FB923C;border-color:#FB923C">✔ VSL completo</div>` :
          l.vslPct50        ? `<div class="info-chip" style="color:#FB923C;border-color:#FB923C">⏱ VSL 50%</div>` :
          l.vslPct25        ? `<div class="info-chip" style="color:#FB923C;border-color:#FB923C">⏱ VSL 25%</div>` :
          (l.vslIniciou||l.clicouVSL) ? `<div class="info-chip" style="color:#FB923C;border-color:#FB923C">▶ Abriu VSL</div>` : ''}
        ${l.clicouGrupo            ? `<div class="info-chip blue">💬 Grupo</div>` : ''}
        ${hasAlert                 ? `<div class="ai-alert">⚡ Abordar agora</div>` : ''}
        ${tags.map(t => `<span class="tag-chip" style="background:${tagColor(t)}">${t}</span>`).join('')}
      </div>

      <div class="lead-row3">
        <span style="font-size:.71rem;color:var(--td)">${l.createdAt ? formatDate(l.createdAt) : '—'}</span>
        <div class="lead-quick-actions" onclick="event.stopPropagation()">
          <div class="template-dropdown" id="tdd-${l.sessionId}">
            <button class="quick-btn qb-copy"
              onclick="toggleTemplateMenu('${l.sessionId}', event)">📋 Msg ▾</button>
            <div class="template-menu" id="tmenu-${l.sessionId}">
              ${getRelevantTemplates(l).map(t => `
                <div class="tmpl-item" onclick="copyTemplate('${l.sessionId}','${t.id}',event)">
                  <div class="tmpl-item-name">${t.nome}</div>
                  <div class="tmpl-item-preview">${t.texto.substring(0,60)}…</div>
                </div>`).join('')}
              <div class="tmpl-item" onclick="copyDefaultMsg('${l.sessionId}',event)" style="border-top:1px solid var(--bdr);margin-top:4px;padding-top:8px">
                <div class="tmpl-item-name">Mensagem padrão</div>
              </div>
            </div>
          </div>
          ${wppLink ? `<a class="quick-btn qb-wpp" href="${wppLink}" target="_blank" rel="noopener">💬 WA</a>` : ''}
          <button class="quick-btn qb-open" onclick="openLead('${l.sessionId}')">Ver →</button>
        </div>
      </div>
    </div>`;
}

function toggleTemplateMenu(sessionId, e) {
  e.stopPropagation();
  const menu = document.getElementById(`tmenu-${sessionId}`);
  if (!menu) return;
  const wasOpen = menu.classList.contains('open');
  document.querySelectorAll('.template-menu.open').forEach(m => m.classList.remove('open'));
  if (!wasOpen) menu.classList.add('open');
}
function copyTemplate(sessionId, templateId, e) {
  e && e.stopPropagation();
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  const tpl  = getTemplates().find(t => t.id === templateId);
  if (!lead || !tpl) return;
  navigator.clipboard.writeText(applyTemplateVars(tpl.texto, lead)).then(() => showToast('Mensagem copiada!'));
  document.querySelectorAll('.template-menu.open').forEach(m => m.classList.remove('open'));
}
function copyDefaultMsg(sessionId, e) {
  e && e.stopPropagation();
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead) return;
  navigator.clipboard.writeText(gerarMensagem(lead)).then(() => showToast('Mensagem copiada!'));
  document.querySelectorAll('.template-menu.open').forEach(m => m.classList.remove('open'));
}

/* Close template menus on outside click */
document.addEventListener('click', () => {
  document.querySelectorAll('.template-menu.open').forEach(m => m.classList.remove('open'));
});

