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

