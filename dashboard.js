/* ── STATE ── */
let filtroAtivo   = 'todos';
let currentLead   = null;
let currentTab    = 'dados';
let currentPage   = 'leads';
let cachedLeads   = null;
let lastFetch     = 0;
let autoRefreshTimer = null;
let selectedLeads = new Set();
let sortOrder     = 'date_desc';
let tagFilter     = null;
let isDarkTheme   = true;

/* ═══════════════════════════════════════════
   TEMPLATES
═══════════════════════════════════════════ */
const DEFAULT_TEMPLATES = [
  { id: 't1', nome: 'Boas-vindas', stages: ['novo'],
    texto: 'Oi, {{primeiro_nome}}! 🤟 Vi que você fez o diagnóstico com a Lorena. Seu nível é {{nivel}} — incrível! Posso te contar sobre o próximo passo para você?' },
  { id: 't2', nome: 'Abordagem Quente', stages: ['quente'],
    texto: 'Oi, {{primeiro_nome}}! 🤟 Sou a Lorena da Nerds da Libras. Seu nível {{nivel}} chamou minha atenção. Tenho algo especial preparado para o seu perfil. Posso te mostrar?' },
  { id: 't3', nome: 'Muito Quente', stages: ['muito_quente'],
    texto: 'Oi, {{primeiro_nome}}! 🤟 Vi seu resultado — nível {{nivel}}. Você está num ponto-chave da sua jornada. Posso te mostrar o que preparei especialmente para você?' },
  { id: 't4', nome: 'Prioridade Máxima', stages: ['prioridade_maxima'],
    texto: 'Oi, {{primeiro_nome}}! 🤟 Aqui é a Lorena. Seu perfil {{nivel}} me chamou muita atenção. Quero fazer uma proposta personalizada. Posso falar agora?' },
  { id: 't5', nome: 'Recuperar Checkout', stages: ['quente','muito_quente','prioridade_maxima'],
    texto: 'Oi, {{primeiro_nome}}! Vi que você chegou até o checkout mas não finalizou. Tem alguma dúvida que posso esclarecer? 😊' },
  { id: 't6', nome: 'Follow-up 24h', stages: ['aguardando'],
    texto: 'Oi, {{primeiro_nome}}! Passando para ver se você teve tempo de pensar. Ainda estou aqui para ajudar! 🤟' },
  { id: 't7', nome: 'Reativação', stages: ['morno'],
    texto: 'Oi, {{primeiro_nome}}! Faz um tempo que não nos falamos. Você ainda pensa em aprender Libras? Tenho uma novidade perfeita para você! 🤟' },
];

function getTemplates() {
  return JSON.parse(localStorage.getItem('ndl_templates') || 'null') || DEFAULT_TEMPLATES;
}
function saveTemplates(tpls) {
  localStorage.setItem('ndl_templates', JSON.stringify(tpls));
}
function applyTemplateVars(texto, lead) {
  return texto
    .replace(/\{\{nome\}\}/g, lead.nome || '')
    .replace(/\{\{primeiro_nome\}\}/g, (lead.nome || '').split(' ')[0])
    .replace(/\{\{nivel\}\}/g, lead.nivelIdentificado || '—')
    .replace(/\{\{oferta\}\}/g, lead.oferta === 'mentoria' ? 'Mentoria' : 'Curso');
}
function getRelevantTemplates(lead) {
  const status = lead.status || 'novo';
  return getTemplates().filter(t => !t.stages || !t.stages.length || t.stages.includes(status));
}

/* Templates modal */
function openTemplatesModal() {
  renderTemplatesModal();
  document.getElementById('templates-modal').style.display = 'flex';
}
function closeTemplatesModal() {
  document.getElementById('templates-modal').style.display = 'none';
}
function renderTemplatesModal() {
  const tpls = getTemplates();
  const stageOpts = Object.entries(DecisionEngine.STATUS_LABELS)
    .map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
  document.getElementById('templates-body').innerHTML = `
    <div class="tpl-list">
      ${tpls.map((t, i) => `
        <div class="tpl-card">
          <div class="tpl-card-top">
            <span class="tpl-card-name">${t.nome}</span>
            <span class="tpl-card-stages">${(t.stages||[]).map(s => DecisionEngine.STATUS_LABELS[s]||s).join(', ')||'Todos'}</span>
          </div>
          <div class="tpl-card-text">${t.texto.substring(0,120)}${t.texto.length>120?'…':''}</div>
          <div class="tpl-card-actions">
            <button class="tpl-btn" onclick="editTemplate(${i})">✏️ Editar</button>
            <button class="tpl-btn danger" onclick="deleteTemplate(${i})">🗑 Excluir</button>
          </div>
        </div>`).join('')}
    </div>
    <div class="tpl-new-form" id="tpl-form">
      <div class="tpl-form-title">+ Novo template</div>
      <input class="tpl-input" id="tpl-nome" placeholder="Nome do template" />
      <select class="tpl-input" id="tpl-stages" multiple style="height:80px">
        ${stageOpts}
      </select>
      <div style="font-size:.71rem;color:var(--td);margin-bottom:6px">Segure Ctrl para selecionar múltiplos estágios. Deixe vazio para todos.</div>
      <textarea class="tpl-input tpl-textarea" id="tpl-texto" placeholder="Texto da mensagem..."></textarea>
      <div class="tpl-vars">Variáveis: <code>{{nome}}</code> <code>{{primeiro_nome}}</code> <code>{{nivel}}</code> <code>{{oferta}}</code></div>
      <button class="panel-big-btn pbb-green" onclick="saveNewTemplate()" style="margin-top:0">✓ Salvar template</button>
    </div>`;
}
function saveNewTemplate() {
  const nome  = document.getElementById('tpl-nome')?.value.trim();
  const texto = document.getElementById('tpl-texto')?.value.trim();
  const sel   = document.getElementById('tpl-stages');
  if (!nome || !texto) { showToast('Preencha nome e texto'); return; }
  const stages = sel ? [...sel.selectedOptions].map(o => o.value) : [];
  const tpls = getTemplates();
  tpls.push({ id: 't' + Date.now(), nome, stages, texto });
  saveTemplates(tpls);
  showToast('Template salvo!');
  renderTemplatesModal();
}
function deleteTemplate(i) {
  if (!confirm('Excluir este template?')) return;
  const tpls = getTemplates();
  tpls.splice(i, 1);
  saveTemplates(tpls);
  renderTemplatesModal();
}
function editTemplate(i) {
  const tpls = getTemplates();
  const t = tpls[i];
  document.getElementById('tpl-nome').value  = t.nome;
  document.getElementById('tpl-texto').value = t.texto;
  const sel = document.getElementById('tpl-stages');
  if (sel) [...sel.options].forEach(o => { o.selected = (t.stages||[]).includes(o.value); });
  document.getElementById('tpl-form').querySelector('button').onclick = () => {
    const nome  = document.getElementById('tpl-nome')?.value.trim();
    const texto = document.getElementById('tpl-texto')?.value.trim();
    const stages = sel ? [...sel.selectedOptions].map(o => o.value) : [];
    if (!nome || !texto) { showToast('Preencha nome e texto'); return; }
    tpls[i] = { ...tpls[i], nome, stages, texto };
    saveTemplates(tpls);
    showToast('Template atualizado!');
    renderTemplatesModal();
  };
  document.getElementById('tpl-form').querySelector('.tpl-form-title').textContent = '✏️ Editando template';
  document.getElementById('tpl-nome').focus();
}

/* ═══════════════════════════════════════════
   NORMALIZE
═══════════════════════════════════════════ */
function normalizePhone(raw) {
  if (!raw) return null;
  const d = String(raw).replace(/\D/g, '');
  if (d.length < 8) return null;
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return '+' + d;
  if (d.length === 10 || d.length === 11) return '+55' + d;
  if (d.length === 12 || d.length === 13) return '+' + d;
  return null;
}
function normalizeInstagram(raw) {
  if (!raw) return null;
  let h = String(raw).trim().replace(/^@+/, '');
  h = h.replace(/https?:\/\/(www\.)?instagram\.com\//i, '').replace(/\/$/, '').trim();
  if (h.includes('@') || /\.(com|br|net|org)/i.test(h)) return null;
  return h || null;
}

function openNormalizeModal() {
  document.getElementById('normalize-modal').style.display = 'flex';
  document.getElementById('normalize-body').innerHTML = `
    <p style="font-size:.82rem;color:var(--ts);margin-bottom:16px;line-height:1.6">
      Corrige automaticamente telefones malformados e instagrams com @@ ou e-mails no campo errado.
    </p>
    <div style="font-size:.78rem;color:var(--td);margin-bottom:16px;line-height:1.7">
      Exemplos corrigidos:<br>
      <code style="color:var(--ts)">119731.49887</code> → <code style="color:var(--g)">+5511973149887</code><br>
      <code style="color:var(--ts)">@@usuario</code> → <code style="color:var(--g)">usuario</code>
    </div>
    <button class="panel-big-btn pbb-green" onclick="runNormalize()">▶ Executar normalização</button>`;
}
function closeNormalizeModal() {
  document.getElementById('normalize-modal').style.display = 'none';
}
function runNormalize() {
  const leads = Storage.getAll();
  let phoneFixed = 0, instaFixed = 0, phoneInvalid = 0, instaInvalid = 0;
  leads.forEach(lead => {
    let changed = false;
    if (lead.whatsapp) {
      const np = normalizePhone(lead.whatsapp);
      if (np && np !== lead.whatsapp) { lead.whatsapp = np; phoneFixed++; changed = true; }
      else if (!np) phoneInvalid++;
    }
    if (lead.instagram) {
      const ni = normalizeInstagram(lead.instagram);
      if (ni !== null && ni !== lead.instagram) { lead.instagram = ni; instaFixed++; changed = true; }
      else if (ni === null) { lead.instagram = ''; instaInvalid++; changed = true; }
    }
    if (changed) Storage.upsert(lead);
  });
  document.getElementById('normalize-body').innerHTML = `
    <div style="font-size:.85rem;line-height:2.2;color:var(--text)">
      <div>✅ Telefones corrigidos: <strong style="color:var(--g)">${phoneFixed}</strong></div>
      <div>⚠️ Telefones inválidos (marcados): <strong style="color:var(--yellow)">${phoneInvalid}</strong></div>
      <div>✅ Instagrams corrigidos: <strong style="color:var(--g)">${instaFixed}</strong></div>
      <div>⚠️ Instagrams inválidos (limpos): <strong style="color:var(--yellow)">${instaInvalid}</strong></div>
    </div>
    <button class="panel-big-btn pbb-green" style="margin-top:16px"
      onclick="closeNormalizeModal();renderDashboard(true)">✓ Fechar e atualizar</button>`;
}

/* ═══════════════════════════════════════════
   TAGS
═══════════════════════════════════════════ */
const TAG_COLORS = ['#4ade80','#60a5fa','#a78bfa','#fb923c','#f472b6','#34d399','#facc15','#f87171'];
function tagColor(tag) {
  let h = 0;
  for (let i = 0; i < tag.length; i++) h = tag.charCodeAt(i) + ((h << 5) - h);
  return TAG_COLORS[Math.abs(h) % TAG_COLORS.length];
}
function getLeadTags(lead) {
  return Array.isArray(lead.tags) ? lead.tags : [];
}
function patchLead(sessionId, patch) {
  if (!cachedLeads) return;
  const ci = cachedLeads.findIndex(l => l.sessionId === sessionId);
  if (ci < 0) return;
  Object.assign(cachedLeads[ci], patch, { updatedAt: new Date().toISOString() });
  Storage.upsert(cachedLeads[ci]);
  if (currentLead && currentLead.sessionId === sessionId) Object.assign(currentLead, patch);
}
function addTagToLead(sessionId, tag) {
  tag = tag.trim().toLowerCase().replace(/\s+/g, '-');
  if (!tag) return;
  const lead = cachedLeads && cachedLeads.find(l => l.sessionId === sessionId);
  if (!lead) return;
  const tags = getLeadTags(lead);
  if (tags.includes(tag)) return;
  patchLead(sessionId, { tags: [...tags, tag] });
  if (currentLead && currentLead.sessionId === sessionId) renderTab(currentTab);
  updateTagFilterButtons();
}
function removeTagFromLead(sessionId, tag) {
  const lead = cachedLeads && cachedLeads.find(l => l.sessionId === sessionId);
  if (!lead) return;
  patchLead(sessionId, { tags: getLeadTags(lead).filter(t => t !== tag) });
  if (currentLead && currentLead.sessionId === sessionId) renderTab(currentTab);
}
function getAllTags() {
  if (!cachedLeads) return [];
  const set = new Set();
  cachedLeads.forEach(l => getLeadTags(l).forEach(t => set.add(t)));
  return [...set].sort();
}
function updateTagFilterButtons() {
  const bar = document.getElementById('filters');
  if (!bar) return;
  renderFilters(cachedLeads || []);
}

/* ═══════════════════════════════════════════
   PIPELINE PROJECTION
═══════════════════════════════════════════ */
const STAGE_PROB = {
  novo: 0.05, morno: 0.15, quente: 0.30, muito_quente: 0.50,
  prioridade_maxima: 0.70, aguardando: 0.40, comprou: 1.0, nao_quis: 0
};
const TICKET_DEFAULT = { curso: 397, mentoria: 1997 };

function calcProjectedValue(lead) {
  const ticket = lead.oferta === 'mentoria' ? TICKET_DEFAULT.mentoria : TICKET_DEFAULT.curso;
  return ticket * (STAGE_PROB[lead.status || 'novo'] || 0.05);
}
function calcTotalPipeline(leads) {
  return leads.filter(l => l.status !== 'nao_quis').reduce((s, l) => s + calcProjectedValue(l), 0);
}

/* ═══════════════════════════════════════════
   BULK ACTIONS
═══════════════════════════════════════════ */
function toggleLeadSelect(sessionId, e) {
  e.stopPropagation();
  if (selectedLeads.has(sessionId)) selectedLeads.delete(sessionId);
  else selectedLeads.add(sessionId);
  const card = document.querySelector(`.lead-card[data-session-id="${sessionId}"]`);
  if (card) card.classList.toggle('selected', selectedLeads.has(sessionId));
  renderBulkBar();
  renderListHeader();
}
function toggleSelectAll() {
  const cards = document.querySelectorAll('.lead-card[data-session-id]');
  const allSel = cards.length > 0 && [...cards].every(c => selectedLeads.has(c.dataset.sessionId));
  cards.forEach(c => {
    if (allSel) { selectedLeads.delete(c.dataset.sessionId); c.classList.remove('selected'); }
    else        { selectedLeads.add(c.dataset.sessionId);    c.classList.add('selected'); }
    const cb = c.querySelector('.lead-checkbox');
    if (cb) cb.checked = !allSel;
  });
  renderBulkBar();
  renderListHeader();
}
function clearSelection() {
  selectedLeads.clear();
  document.querySelectorAll('.lead-card.selected').forEach(c => c.classList.remove('selected'));
  document.querySelectorAll('.lead-checkbox').forEach(cb => cb.checked = false);
  renderBulkBar();
  renderListHeader();
}
function renderBulkBar() {
  const bar = document.getElementById('bulk-bar');
  if (!bar) return;
  if (selectedLeads.size === 0) { bar.style.display = 'none'; return; }
  bar.style.display = 'flex';
  const statusOpts = Object.entries(DecisionEngine.STATUS_LABELS)
    .map(([k,v]) => `<option value="${k}">${v}</option>`).join('');
  bar.innerHTML = `
    <span class="bulk-count">${selectedLeads.size} selecionado${selectedLeads.size > 1 ? 's' : ''}</span>
    <button class="bulk-btn" onclick="bulkCopyLinks()">💬 Copiar links WA</button>
    <button class="bulk-btn" onclick="bulkCopyMsgs()">📋 Copiar mensagens</button>
    <select class="sort-select" id="bulk-status-sel" style="font-size:.75rem">
      <option value="">📊 Mudar status...</option>
      ${statusOpts}
    </select>
    <button class="bulk-btn" onclick="applyBulkStatus()">Aplicar</button>
    <button class="bulk-btn danger" onclick="clearSelection()" style="margin-left:auto">✕ Limpar</button>`;
}
function getSelectedLeads() {
  return (cachedLeads || []).filter(l => selectedLeads.has(l.sessionId));
}
function bulkCopyLinks() {
  const text = getSelectedLeads()
    .filter(l => l.whatsapp)
    .map(l => `${l.nome}: https://wa.me/55${String(l.whatsapp).replace(/\D/g,'')}`)
    .join('\n');
  navigator.clipboard.writeText(text).then(() => showToast(`${selectedLeads.size} links copiados!`));
}
function bulkCopyMsgs() {
  const text = getSelectedLeads().map(l => {
    const wpp = l.whatsapp ? `https://wa.me/55${String(l.whatsapp).replace(/\D/g,'')}` : '';
    return `— ${l.nome}\n${wpp}\n${gerarMensagem(l)}`;
  }).join('\n\n---\n\n');
  navigator.clipboard.writeText(text).then(() => showToast(`${selectedLeads.size} mensagens copiadas!`));
}
function applyBulkStatus() {
  const sel = document.getElementById('bulk-status-sel');
  if (!sel || !sel.value) { showToast('Escolha um status primeiro'); return; }
  const newStatus = sel.value;
  [...selectedLeads].forEach(sid => atualizarStatus(sid, newStatus));
  showToast(`${selectedLeads.size} leads → "${DecisionEngine.STATUS_LABELS[newStatus]}"`);
  clearSelection();
  renderLeads();
}

/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.documentElement.classList.toggle('light-theme', !isDarkTheme);
  localStorage.setItem('ndl_theme', isDarkTheme ? 'dark' : 'light');
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isDarkTheme ? '☀' : '🌙';
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ═══════════════════════════════════════════
   SORT
═══════════════════════════════════════════ */
function onSortChange() {
  sortOrder = document.getElementById('sort-select')?.value || 'date_desc';
  renderLeads();
}
function sortLeads(leads) {
  const s = [...leads];
  switch (sortOrder) {
    case 'date_desc':  return s.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    case 'date_asc':   return s.sort((a,b) => new Date(a.createdAt||0) - new Date(b.createdAt||0));
    case 'score_desc': return s.sort((a,b) => (b.pontuacao||0) - (a.pontuacao||0));
    case 'score_asc':  return s.sort((a,b) => (a.pontuacao||0) - (b.pontuacao||0));
    case 'nome_asc':   return s.sort((a,b) => (a.nome||'').localeCompare(b.nome||'','pt-BR'));
    default: return s;
  }
}

/* ═══════════════════════════════════════════
   AUTH
═══════════════════════════════════════════ */
function checkPassword() {
  const input = document.getElementById('pwd-input');
  const err   = document.getElementById('pwd-err');
  if (input.value === CONFIG.DASHBOARD_PASSWORD) {
    sessionStorage.setItem('ndl_auth', '1');
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('app').removeAttribute('hidden');
    renderDashboard(true);
    startAutoRefresh();
  } else {
    err.textContent = 'Senha incorreta.';
    input.value = '';
    input.focus();
    setTimeout(() => { err.textContent = ''; }, 2500);
  }
}
function logout() {
  clearInterval(autoRefreshTimer);
  sessionStorage.removeItem('ndl_auth');
  document.getElementById('app').setAttribute('hidden', '');
  document.getElementById('password-screen').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
}

/* ═══════════════════════════════════════════
   AUTO REFRESH
═══════════════════════════════════════════ */
function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => renderDashboard(false), 60000);
}

/* ═══════════════════════════════════════════
   FETCH LEADS
═══════════════════════════════════════════ */
async function fetchLeads() {
  try {
    const url = CONFIG.SHEETS_URL + '?action=getLeads';
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return Storage.getAll();
  } catch {
    return Storage.getAll();
  }
}
async function getLeads(force = false) {
  const now = Date.now();
  if (!force && cachedLeads && (now - lastFetch) < 30000) return cachedLeads;
  cachedLeads = await fetchLeads();
  lastFetch   = now;
  return cachedLeads;
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function setPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'pipeline')        renderPipeline();
  else if (page === 'analytics')  renderAnalytics();
  else                            renderLeads();
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── LOADING ── */
function setLoading(on) {
  const btn = document.querySelector('.icon-btn[title="Atualizar"]');
  if (btn) btn.style.opacity = on ? '.4' : '1';
}

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
        ${carrinhoAbandonado       ? `<div class="info-chip" style="color:#fff;background:#EA580C;border-color:#EA580C">🛒 Carrinho abandonado</div>` : ''}
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

/* ═══════════════════════════════════════════
   LEAD DETAIL PANEL
═══════════════════════════════════════════ */
function openLead(sessionId) {
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead) return;
  currentLead = lead;
  currentTab  = 'dados';

  const statusKey   = lead.status || 'novo';
  const initials    = (lead.nome || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const avatarColor = getAvatarColor(String(lead.sessionId || lead.nome || ''));

  document.getElementById('panel-title-wrap').innerHTML = `
    <div style="display:flex;align-items:center;gap:8px">
      <div class="lead-avatar" style="background:${avatarColor};width:32px;height:32px;font-size:.75rem;flex-shrink:0">${initials}</div>
      <div>
        <div class="panel-lead-name">${lead.nome || 'Lead sem nome'}</div>
        <div class="panel-lead-sub">${DecisionEngine.STATUS_LABELS[statusKey] || statusKey}</div>
      </div>
    </div>`;

  document.getElementById('panel-hdr-actions').innerHTML = lead.whatsapp
    ? `<a class="quick-btn qb-wpp" href="https://wa.me/55${String(lead.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(gerarMensagem(lead))}" target="_blank" rel="noopener">💬 WA</a>`
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
    const statusKey = l.status || 'novo';
    const viuCheck  = isCarrinhoAbandonado(l);
    const tags      = getLeadTags(l);
    const tpls      = getRelevantTemplates(l);
    body.innerHTML = `
      <div class="panel-section">
        <div class="panel-section-title">Contato</div>
        <div class="panel-field"><span class="pf-label">Nome</span><span class="pf-val">${l.nome || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">WhatsApp</span><span class="pf-val">${l.whatsapp || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Instagram</span><span class="pf-val">${l.instagram ? '@' + l.instagram : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Gênero</span><span class="pf-val">${l.genero === 'masculino' ? 'Masculino' : l.genero === 'feminino' ? 'Feminino' : '—'}</span></div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Tags</div>
        <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:6px">
          ${tags.length ? tags.map(t => `
            <span class="tag-chip" style="background:${tagColor(t)}">
              ${t}
              <button class="tag-remove" onclick="removeTagFromLead('${l.sessionId}','${t}')">✕</button>
            </span>`).join('') : '<span style="font-size:.75rem;color:var(--td)">Nenhuma tag</span>'}
        </div>
        <div class="tag-input-wrap">
          <input class="tag-input" id="tag-input-panel" placeholder="Nova tag..."
                 onkeydown="if(event.key==='Enter'){addTagFromPanel();event.preventDefault()}"/>
          <button class="tag-add-btn" onclick="addTagFromPanel()">+ Adicionar</button>
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Diagnóstico</div>
        <div class="panel-field"><span class="pf-label">Nível</span><span class="pf-val">${l.nivelIdentificado || '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Pontuação</span><span class="pf-val">${l.pontuacao || 0} / 48 pts</span></div>
        <div class="panel-field"><span class="pf-label">Oferta</span><span class="pf-val">${l.oferta === 'curso' ? '📚 Curso' : l.oferta === 'mentoria' ? '🎯 Mentoria' : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Classificação</span><span class="pf-val">${l.classificacaoLead || '—'}</span></div>
        ${l.respostaDificuldade ? `<div class="panel-field"><span class="pf-label">Dificuldade</span><span class="pf-val">${l.respostaDificuldade}</span></div>` : ''}
        ${l.respostaObjetivo    ? `<div class="panel-field"><span class="pf-label">Objetivo</span><span class="pf-val">${l.respostaObjetivo}</span></div>` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Atividade</div>
        <div class="panel-field"><span class="pf-label">Entrou em</span><span class="pf-val">${l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : '—'}</span></div>
        <div class="panel-field"><span class="pf-label">Tempo no quiz</span><span class="pf-val">${l.tempoNoQuiz ? l.tempoNoQuiz + 's' : '—'}</span></div>
        <div class="panel-field">
          <span class="pf-label">Checkout</span>
          <span class="pf-val" style="color:${statusKey === 'comprou' ? 'var(--g)' : viuCheck ? '#EA580C' : 'var(--td)'};font-weight:${viuCheck ? '700' : '400'}">
            ${statusKey === 'comprou' ? '✅ Compra confirmada (Kiwify)' : viuCheck ? '🛒 Carrinho abandonado — clicou, não pagou' : '—'}
          </span>
        </div>
        ${l.checkoutEm ? `<div class="panel-field"><span class="pf-label">Foi ao checkout</span><span class="pf-val">${new Date(l.checkoutEm).toLocaleString('pt-BR')}</span></div>` : ''}
        <div class="panel-field"><span class="pf-label">VSL</span><span class="pf-val" style="color:${(l.vslIniciou||l.clicouVSL) ? '#FB923C' : 'inherit'}">${
          l.vslClicouCTA    ? '🛒 Clicou no CTA — foi ao checkout' :
          l.vslAssistiuFim  ? '✔ Assistiu até o fim' :
          l.vslPct75        ? '⏱ Parou em 75%' :
          l.vslPct50        ? '⏱ Parou em 50%' :
          l.vslPct25        ? '⏱ Parou em 25%' :
          l.vslIniciou      ? '▶ Abriu o vídeo' :
          l.clicouVSL       ? '▶ Clicou no link' : '—'
        }</span></div>
        <div class="panel-field"><span class="pf-label">Entrou no grupo</span><span class="pf-val">${l.clicouGrupo ? '💬 Sim' : '—'}</span></div>
        ${l.statusCloser ? `<div class="panel-field"><span class="pf-label">Nota closer</span><span class="pf-val">${l.statusCloser}</span></div>` : ''}
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Jornada no Funil</div>
        <div class="funil-steps">
          ${buildFunilSteps(l).map(s => `
            <div class="funil-step ${s.done ? 'done' : ''}">
              <div class="funil-icon">${s.icon}</div>
              <div class="funil-step-info">
                <div class="funil-step-label">${s.label}</div>
                <div class="funil-step-note">${s.note}</div>
              </div>
              <div class="funil-check">${s.done ? '✓' : '○'}</div>
            </div>`).join('')}
        </div>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Status do Pipeline</div>
        <select class="panel-status-select" onchange="atualizarStatus('${l.sessionId}', this.value)">
          ${Object.entries(DecisionEngine.STATUS_LABELS).map(([k,v]) =>
            `<option value="${k}" ${(l.status || 'novo') === k ? 'selected' : ''}>${v}</option>`
          ).join('')}
        </select>
      </div>

      <div class="panel-section">
        <div class="panel-section-title">Ações</div>
        ${l.whatsapp ? `<a class="panel-big-btn pbb-wpp" href="https://wa.me/55${String(l.whatsapp).replace(/\D/g,'')}?text=${encodeURIComponent(gerarMensagem(l))}" target="_blank" rel="noopener">💬 Abrir WhatsApp com mensagem pronta</a>` : ''}
        ${tpls.map(t => `
          <button class="panel-big-btn pbb-copy" onclick="copyTemplatePanel('${t.id}')">📋 ${t.nome}</button>
        `).join('')}
        <button class="panel-big-btn pbb-copy" onclick="copiarMensagemPanel()">📋 Mensagem padrão</button>
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
        <input class="agenda-input" type="datetime-local" id="agenda-dt" value="${ag ? ag.dt : ''}"/>
        <input class="agenda-input" type="text" id="agenda-nota"
               placeholder="Nota sobre o follow-up..." value="${ag ? (ag.nota || '') : ''}"/>
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

  else if (tab === 'email') {
    body.innerHTML = renderEmailTab(l);
  }
}

/* ── FUNNEL JOURNEY ── */
function buildFunilSteps(l) {
  const statusKey = l.status || 'novo';

  // VSL progress note: highest milestone reached
  const vslMaxPct = l.vslPct75 ? 75 : l.vslPct50 ? 50 : l.vslPct25 ? 25 : 0;
  const vslAbriuNote = l.vslIniciou
    ? (vslMaxPct > 0 ? `Assistiu ${vslMaxPct}%` : 'Iniciou o vídeo')
    : (l.clicouVSL ? 'Clicou (sem rastreio detalhado)' : '—');
  const vslFimNote = l.vslAssistiuFim
    ? 'Assistiu até o fim'
    : (vslMaxPct > 0 ? `Parou em ${vslMaxPct}%` : '—');

  return [
    { icon: '📋', label: 'Fez a avaliação',       note: l.createdAt ? formatDate(l.createdAt) : '—',   done: !!l.createdAt },
    { icon: l.oferta === 'mentoria' ? '🎯' : '📚', label: 'Oferta definida',
      note: l.oferta === 'mentoria' ? 'Mentoria' : l.oferta === 'curso' ? 'Curso' : '—',                done: !!l.oferta },
    { icon: '▶',  label: 'Abriu o VSL',            note: vslAbriuNote,                                   done: !!(l.vslIniciou || l.clicouVSL) },
    { icon: '⏱',  label: 'Assistiu até o fim',     note: vslFimNote,                                     done: !!l.vslAssistiuFim },
    { icon: '🖱',  label: 'Clicou no CTA do VSL',  note: l.vslClicouCTA ? 'Sim' : '—',                   done: !!l.vslClicouCTA },
    { icon: '💬', label: 'Entrou no grupo',         note: l.clicouGrupo ? 'Sim' : '—',                   done: !!l.clicouGrupo },
    { icon: '🛒', label: 'Foi ao checkout',          note: l.clicouCheckout ? (statusKey === 'comprou' ? 'Sim' : 'Abandonou') : '—', done: !!l.clicouCheckout },
    { icon: '✅', label: 'Comprou',                 note: statusKey === 'comprou' ? (l.updatedAt ? formatDate(l.updatedAt) : 'Sim') : '—', done: statusKey === 'comprou' },
  ];
}

function addTagFromPanel() {
  if (!currentLead) return;
  const input = document.getElementById('tag-input-panel');
  if (!input) return;
  addTagToLead(currentLead.sessionId, input.value);
  input.value = '';
}

function copyTemplatePanel(templateId) {
  if (!currentLead) return;
  const tpl = getTemplates().find(t => t.id === templateId);
  if (!tpl) return;
  copiarTexto(applyTemplateVars(tpl.texto, currentLead));
}

function buildTimeline(l) {
  const events = [];
  if (l.createdAt)       events.push({ time: formatTime(l.createdAt), text: 'Concluiu o diagnóstico' });
  if (l.concluiuQuiz)   events.push({ time: '—', text: `Pontuação final: ${l.pontuacao || 0} / 48 pts` });
  if (l.clicouVSL && !l.vslIniciou) events.push({ time: '—', text: '▶ Clicou no link do VSL' });
  if (l.vslIniciou)     events.push({ time: '—', text: '▶ Abriu o vídeo VSL' });
  if (l.vslPct25)       events.push({ time: '—', text: '⏱ Assistiu 25% do VSL' });
  if (l.vslPct50)       events.push({ time: '—', text: '⏱ Assistiu 50% do VSL' });
  if (l.vslPct75)       events.push({ time: '—', text: '⏱ Assistiu 75% do VSL' });
  if (l.vslAssistiuFim) events.push({ time: '—', text: '✔ Assistiu o VSL até o fim' });
  if (l.vslClicouCTA)   events.push({ time: '—', text: '🛒 Clicou no CTA do VSL (checkout)' });
  if (l.clicouGrupo)    events.push({ time: '—', text: '💬 Clicou para entrar no grupo de WhatsApp' });
  if (l.clicouCheckout)
    events.push({ time: l.checkoutEm ? formatTime(l.checkoutEm) : '—', text: l.status === 'comprou' ? '🛒 Foi para o checkout' : '🛒 Carrinho abandonado — foi ao checkout e não finalizou' });
  if (l.status === 'comprou')
    events.push({ time: l.updatedAt ? formatTime(l.updatedAt) : '—', text: '✅ Compra confirmada pela Kiwify' });
  if (l.status === 'nao_quis')
    events.push({ time: l.updatedAt ? formatTime(l.updatedAt) : '—', text: '❌ Registrado como não quis' });
  const tags = getLeadTags(l);
  if (tags.length)
    events.push({ time: '—', text: `🏷 Tags: ${tags.join(', ')}` });
  return events;
}

function getObjecoes(l) {
  const base = [
    { q: '"Não tenho tempo para estudar agora."', a: 'O curso é 100% no seu ritmo, com acesso vitalício. 15 minutos por dia já fazem enorme diferença.' },
    { q: '"Está muito caro."', a: 'Dividido em 12x de R$41,06, fica menos que um café por dia. Quanto vale se comunicar com uma pessoa surda pela primeira vez?' },
    { q: '"Já tentei aprender e desisti."', a: 'A maioria que desiste é porque o método era errado — não a pessoa. Com a metodologia certa, é completamente diferente.' },
    { q: '"Preciso pensar mais."', a: 'Entendo! Posso tirar alguma dúvida específica enquanto isso? Às vezes um detalhe resolve a decisão.' },
  ];
  if (l.oferta === 'mentoria' || l.nivelIdentificado === 'AVANÇADO') {
    base.push({ q: '"Consigo estudar sozinha."', a: 'Saber estudar é diferente de ter aceleração com acompanhamento. A mentoria encurta meses de autoestudo.' });
  }
  return base;
}

function getIASuggestions(l) {
  const nome      = l.nome || 'o lead';
  const statusKey = l.status || 'novo';
  const nivel     = l.nivelIdentificado || '';
  const viuCheck  = isCarrinhoAbandonado(l);

  let msg = '';
  if (viuCheck) {
    const oferta = l.oferta === 'mentoria' ? 'a Mentoria' : 'o Curso do Zero à Libras';
    msg = `Oi, ${nome}! 🤟 Vi que você chegou a iniciar a inscrição n${l.oferta === 'mentoria' ? 'a Mentoria' : 'o Curso'} mas a compra não foi concluída. Aconteceu algum problema no pagamento? Posso te ajudar a finalizar agora — e garanto uma condição especial pra você. 💚`;
  } else if (statusKey === 'prioridade_maxima') {
    msg = `Oi, ${nome}! 🤟 Aqui é a Lorena.\n\nVi seu diagnóstico e seu perfil chamou minha atenção — você está num ponto muito importante da sua jornada em Libras.\n\nQuero te fazer uma proposta personalizada. Posso te contar mais?`;
  } else if (statusKey === 'muito_quente') {
    msg = `Oi, ${nome}! 🤟 Sou a Lorena da Nerds da Libras.\n\nVi que você fez o diagnóstico e seu nível é ${nivel}. Tenho algo preparado especialmente para o seu perfil — posso te explicar?`;
  } else if (statusKey === 'quente') {
    msg = `Oi, ${nome}! 🤟 Vi que você fez o diagnóstico com a Lorena. Ainda tem interesse em evoluir em Libras? Posso te contar como funciona ${l.oferta === 'mentoria' ? 'a mentoria' : 'o curso'}?`;
  } else {
    msg = `Oi, ${nome}! 🤟 Vi que você fez o diagnóstico com a Lorena. Posso te mostrar qual é o próximo passo ideal para o seu perfil?`;
  }

  const alerts = [];
  if (!l.statusCloser || l.statusCloser === 'Aguardando resposta sobre próximo nível') {
    alerts.push({ title: 'Primeiro Contato', text: `${nome} ainda não foi abordad${l.genero === 'feminino' ? 'a' : 'o'}. Sugestão: entrar em contato nas próximas ${statusKey === 'prioridade_maxima' ? '30 minutos' : '2 horas'}.` });
  }
  if (viuCheck) {
    alerts.push({ title: 'Recuperar Carrinho', text: 'Visitou o checkout mas não comprou. Alta probabilidade de conversão com uma mensagem de recuperação.' });
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

/* ═══════════════════════════════════════════
   PIPELINE — DRAG & DROP + R$ PROJETADO
═══════════════════════════════════════════ */
const PIPELINE_STAGES = [
  { key: 'novo',              label: 'Novo Lead',       color: '#a1a1aa' },
  { key: 'morno',             label: 'Morno',           color: '#fbbf24' },
  { key: 'quente',            label: 'Quente',          color: '#4ade80' },
  { key: 'muito_quente',      label: 'Muito Quente',    color: '#f87171' },
  { key: 'prioridade_maxima', label: 'Prioridade Máx.', color: '#a78bfa' },
  { key: 'aguardando',        label: 'Follow-up',       color: '#f97316' },
  { key: 'comprou',           label: '✅ Comprou',      color: '#60a5fa' },
  { key: 'nao_quis',          label: 'Perdido',         color: '#52525b' },
];

async function renderPipeline() {
  const leads  = await getLeads();
  const kanban = document.getElementById('kanban');
  const total  = calcTotalPipeline(leads);

  const proj = document.getElementById('pipeline-projection');
  if (proj) {
    proj.textContent = `💰 Pipeline projetado: R$ ${Math.round(total).toLocaleString('pt-BR')}`;
  }

  kanban.innerHTML = PIPELINE_STAGES.map(stage => {
    const sl  = leads.filter(l => (l.status || 'novo') === stage.key);
    const val = sl.filter(l => stage.key !== 'nao_quis')
      .reduce((s, l) => s + calcProjectedValue(l), 0);
    return `
      <div class="kanban-col">
        <div class="col-header">
          <div class="col-header-top">
            <div class="col-title-wrap">
              <div class="col-dot" style="background:${stage.color}"></div>
              <span class="col-title">${stage.label}</span>
            </div>
            <span class="col-count">${sl.length}</span>
          </div>
          ${stage.key !== 'nao_quis' && val > 0
            ? `<div class="col-value">R$ ${Math.round(val).toLocaleString('pt-BR')}</div>` : ''}
        </div>
        <div class="col-cards" data-stage="${stage.key}">
          ${sl.length
            ? sl.map(l => {
                const wpp     = l.whatsapp ? String(l.whatsapp).replace(/\D/g,'') : null;
                const wppHref = wpp ? `https://wa.me/55${wpp}?text=${encodeURIComponent(gerarMensagem(l))}` : null;
                const dt      = l.createdAt ? new Date(l.createdAt) : null;
                const dtTxt   = dt ? dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
                const ofIcon  = l.oferta === 'mentoria' ? '🎯' : l.oferta === 'curso' ? '📚' : '';
                return `
                  <div class="mini-card" data-session-id="${l.sessionId}" onclick="openLead('${l.sessionId}')">
                    <div class="mini-card-top">
                      <div class="mini-name">${l.nome || 'Lead'}</div>
                      ${dtTxt ? `<div class="mini-date">${dtTxt}</div>` : ''}
                    </div>
                    <div class="mini-sub">${l.whatsapp || '—'}${ofIcon ? ' · ' + ofIcon : ''}</div>
                    <div class="mini-funnel">
                      <span class="mf done" title="Fez a avaliação">📋</span><span class="mf-arr">›</span>
                      <span class="mf ${l.oferta ? 'done' : ''}" title="Oferta">${ofIcon || '·'}</span><span class="mf-arr">›</span>
                      <span class="mf ${l.vslAssistiuFim ? 'done' : (l.vslIniciou||l.clicouVSL) ? 'partial' : ''}" title="${l.vslClicouCTA ? 'VSL: clicou no CTA' : l.vslAssistiuFim ? 'VSL: assistiu até o fim' : l.vslPct75 ? 'VSL: assistiu 75%' : l.vslPct50 ? 'VSL: assistiu 50%' : l.vslPct25 ? 'VSL: assistiu 25%' : l.vslIniciou ? 'VSL: abriu o vídeo' : l.clicouVSL ? 'VSL: clicou no link' : 'VSL: não abriu'}">▶</span><span class="mf-arr">›</span>
                      <span class="mf ${l.clicouGrupo ? 'done' : ''}" title="Entrou no grupo">💬</span><span class="mf-arr">›</span>
                      <span class="mf ${l.clicouCheckout ? 'done' : ''}" title="Viu o checkout">🛒</span><span class="mf-arr">›</span>
                      <span class="mf ${(l.status||'') === 'comprou' ? 'done' : ''}" title="Comprou">✅</span>
                    </div>
                    ${l.pontuacao ? `<div class="mini-score">Score: ${l.pontuacao}</div>` : ''}
                    ${getLeadTags(l).slice(0,2).map(t => `<span class="tag-chip" style="background:${tagColor(t)};font-size:.6rem;padding:1px 5px;margin-top:3px">${t}</span>`).join('')}
                    ${wppHref ? `<a class="mini-wpp-btn" href="${wppHref}" target="_blank" rel="noopener" onclick="event.stopPropagation()">💬 Abrir WhatsApp</a>` : ''}
                  </div>`;
              }).join('')
            : '<div class="mini-empty">Vazio</div>'}
        </div>
      </div>`;
  }).join('');

  initSortable();
}

function initSortable() {
  if (typeof Sortable === 'undefined') return;
  document.querySelectorAll('.col-cards').forEach(col => {
    if (col._sortable) col._sortable.destroy();
    col._sortable = new Sortable(col, {
      group: 'pipeline',
      animation: 150,
      ghostClass: 'sortable-ghost',
      chosenClass: 'sortable-chosen',
      onEnd(evt) {
        const sessionId = evt.item.dataset.sessionId;
        const newStage  = evt.to.dataset.stage;
        if (sessionId && newStage) {
          atualizarStatus(sessionId, newStage);
          const proj = document.getElementById('pipeline-projection');
          if (proj && cachedLeads) {
            const total = calcTotalPipeline(cachedLeads);
            proj.textContent = `💰 Pipeline projetado: R$ ${Math.round(total).toLocaleString('pt-BR')}`;
          }
          const colHeader = evt.to.closest('.kanban-col')?.querySelector('.col-value');
          // Recalculate column value
          setTimeout(() => renderPipeline(), 300);
        }
      }
    });
  });
}

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

/* ═══════════════════════════════════════════
   HELPERS
═══════════════════════════════════════════ */
function formatDate(iso) {
  return new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
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
  const hot = leads.filter(l => l.status === 'muito_quente' || l.status === 'prioridade_maxima').length;
  const b = document.getElementById('badge-leads');
  if (b) b.textContent = hot > 0 ? hot : '';
}

/* ═══════════════════════════════════════════
   ACTIONS
═══════════════════════════════════════════ */
// Carrinho abandonado = clicou para comprar (checkout ou CTA do VSL) mas a
// compra nunca foi confirmada (webhook da Kiwify não marcou 'comprou').
function isCarrinhoAbandonado(l) {
  return (l.clicouCheckout || l.vslClicouCTA) && l.status !== 'comprou';
}

function gerarMensagem(l) {
  const nome  = l.nome || 'você';
  const nivel = l.nivelIdentificado || '—';

  // Remarketing de carrinho abandonado — maior intenção de compra
  if (isCarrinhoAbandonado(l)) {
    const oferta = l.oferta === 'mentoria' ? 'Mentoria Ciclo da Fluência' : 'Curso do Zero à Libras';
    return `Oi, ${nome}! 🤟 Vi que você chegou a iniciar a inscrição no ${oferta}, mas a compra não foi concluída. Aconteceu algum problema no pagamento? Posso te ajudar a finalizar agora — e ainda garanto uma condição especial pra você. 💚`;
  }

  if (l.oferta === 'mentoria') {
    return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu perfil é ${nivel}. Você havia demonstrado interesse na Mentoria Ciclo da Fluência. Posso te passar mais detalhes?`;
  }
  const sfx = l.genero === 'masculino' ? 'o' : 'a';
  return `Oi, ${nome}! 🤟 Vi sua avaliação com a Lorena — seu perfil é ${nivel}. Você estava interessad${sfx} no Curso do Zero à Libras. Ainda posso ajudar você a dar o próximo passo?`;
}

function copiarMensagem(sessionId, btn) {
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead) return;
  navigator.clipboard.writeText(gerarMensagem(lead)).then(() => {
    if (btn) { const t = btn.textContent; btn.textContent = '✅'; setTimeout(() => { btn.textContent = t; }, 2000); }
    showToast('Mensagem copiada!');
  });
}

function copiarMensagemPanel() {
  if (!currentLead) return;
  copiarTexto(gerarMensagem(currentLead));
}

function copiarTexto(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    if (btn) { const t = btn.textContent; btn.textContent = '✅ Copiado!'; setTimeout(() => { btn.textContent = t; }, 2000); }
    showToast('Copiado!');
  });
}

function atualizarStatus(sessionId, newStatus) {
  if (cachedLeads) {
    const idx = cachedLeads.findIndex(l => l.sessionId === sessionId);
    if (idx >= 0) {
      cachedLeads[idx].status = newStatus;
      cachedLeads[idx].updatedAt = new Date().toISOString();
    }
    if (currentLead && currentLead.sessionId === sessionId) currentLead.status = newStatus;
  }
  Storage.updateStatus(sessionId, newStatus);
  updateBadges(cachedLeads || []);
  renderStats(cachedLeads || []);
  renderFilters(cachedLeads || []);
  if (currentPage === 'pipeline') renderPipeline();
}

function salvarAgenda() {
  if (!currentLead) return;
  const dt   = document.getElementById('agenda-dt')?.value;
  const nota = document.getElementById('agenda-nota')?.value;
  if (!dt) { showToast('Selecione uma data'); return; }
  patchLead(currentLead.sessionId, { agenda: { dt, nota } });
  currentLead.agenda = { dt, nota };
  renderTab('agenda');
  showToast('Follow-up salvo!');
}

function exportCSV() {
  const leads  = cachedLeads || Storage.getAll();
  const header = ['Nome','WhatsApp','Instagram','Gênero','Nível','Pontuação','Oferta','Classificação','Status','Viu Checkout','Comprou','Grupo','Tags','Data'];
  const rows   = leads.map(l => [
    l.nome || '', l.whatsapp || '', l.instagram || '', l.genero || '',
    l.nivelIdentificado || '', l.pontuacao || '', l.oferta || '', l.classificacaoLead || '',
    l.status || '', l.clicouCheckout ? 'Sim' : 'Não',
    l.status === 'comprou' ? 'Sim' : 'Não',
    l.clicouGrupo ? 'Sim' : 'Não',
    getLeadTags(l).join(';'),
    l.createdAt ? new Date(l.createdAt).toLocaleString('pt-BR') : '',
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));

  const csv  = [header.join(','), ...rows].join('\n');
  const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href = url; a.download = `leads_${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(url);
}

/* ═══════════════════════════════════════════
   KEYBOARD SHORTCUTS
═══════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
  if (e.key === 'Escape') closePainel();
  if (e.key === '/') {
    e.preventDefault();
    document.getElementById('search-input')?.focus();
  }
});

/* ═══════════════════════════════════════════
   INIT
═══════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('ndl_theme');
  if (savedTheme === 'light') {
    isDarkTheme = false;
    document.documentElement.classList.add('light-theme');
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = '🌙';
  }

  if (sessionStorage.getItem('ndl_auth') === '1') {
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('app').removeAttribute('hidden');
    renderDashboard(true);
    startAutoRefresh();
  }
});
