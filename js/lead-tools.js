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
    <select class="sort-select" id="bulk-email-sel" style="font-size:.75rem">
      <option value="1">📧 E-mail 1 (lembrete)</option>
      <option value="2">📧 E-mail 2 (objeção)</option>
      <option value="3">📧 E-mail 3 (última chamada)</option>
    </select>
    <button class="bulk-btn" onclick="bulkSendEmail()">Enviar e-mail</button>
    <button class="bulk-btn" onclick="abrirCampanha()" style="background:var(--gd);border-color:var(--gg)">📢 Campanha</button>
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
    .map(l => `${l.nome}: ${waLink(l.whatsapp)}`)
    .join('\n');
  navigator.clipboard.writeText(text).then(() => showToast(`${selectedLeads.size} links copiados!`));
}
function bulkCopyMsgs() {
  const text = getSelectedLeads().map(l => {
    const wpp = waLink(l.whatsapp) || '';
    return `— ${l.nome}\n${wpp}\n${gerarMensagem(l)}`;
  }).join('\n\n---\n\n');
  navigator.clipboard.writeText(text).then(() => showToast(`${selectedLeads.size} mensagens copiadas!`));
}
// Envia em massa (pelo Gmail, via Apps Script) o e-mail escolhido,
// personalizado com o nome de cada lead. Ignora quem não tem e-mail.
function bulkSendEmail() {
  const sel = document.getElementById('bulk-email-sel');
  const num = parseInt(sel ? sel.value : '1', 10) || 1;
  const leads = getSelectedLeads().filter(l => l.email);
  const semEmail = selectedLeads.size - leads.length;
  if (!leads.length) { showToast('Nenhum selecionado tem e-mail cadastrado'); return; }
  if (!confirm(`Enviar o E-mail ${num} (personalizado com o nome) para ${leads.length} lead(s)?` +
      (semEmail ? `\n\n${semEmail} sem e-mail serão ignorados.` : ''))) return;

  const sessionIds = leads.map(l => l.sessionId);
  fetch(CONFIG.SHEETS_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'sendEmails', sessionIds, emailNum: num }),
  }).catch(() => {});

  // Marca otimisticamente (o servidor também grava ao enviar)
  const ts = new Date().toISOString();
  leads.forEach(l => { l[`email${num}SentAt`] = ts; });
  showToast(`Enviando E-mail ${num} para ${leads.length} lead(s)... 📨`);
  clearSelection();
  renderLeads();
}
/* ── CAMPANHA: e-mail personalizado (oferta / promo / abertura de grupo) ──
   Envia um e-mail escrito por você para todos os leads selecionados
   (filtre por grupo antes: Curso / Mentoria / Ebook). Usa {nome} pra
   personalizar com o primeiro nome de cada pessoa.                        */
function abrirCampanha() {
  const leads    = getSelectedLeads().filter(l => l.email);
  const semEmail = selectedLeads.size - leads.length;
  if (!leads.length) { showToast('Nenhum selecionado tem e-mail cadastrado'); return; }

  const ov = document.createElement('div');
  ov.id = 'campanha-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdrb);border-radius:14px;max-width:560px;width:100%;padding:22px;max-height:92vh;overflow:auto;color:var(--text)">
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:4px">📢 Campanha por e-mail</div>
      <div style="font-size:.8rem;color:var(--ts);margin-bottom:16px">
        Enviando para <strong style="color:var(--g)">${leads.length}</strong> lead(s) com e-mail${semEmail ? ` · ${semEmail} sem e-mail serão ignorados` : ''}
      </div>
      <input id="camp-assunto" placeholder="Assunto do e-mail" maxlength="160"
        style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid var(--bdrb);background:var(--bg);color:var(--text);font-size:.9rem"/>
      <textarea id="camp-corpo" rows="10" placeholder="Escreva sua mensagem aqui...&#10;&#10;Ex: Oi {nome}! Abrimos as vagas da nova turma com uma condição especial..."
        style="width:100%;padding:11px;border-radius:9px;border:1px solid var(--bdrb);background:var(--bg);color:var(--text);font-size:.9rem;resize:vertical;line-height:1.5"></textarea>
      <div style="font-size:.73rem;color:var(--ts);margin:8px 0 12px">
        💡 Use <strong style="color:var(--g)">{nome}</strong> onde quiser o primeiro nome. E fique tranquila: <strong>o nome entra sempre</strong> — se você não escrever {nome}, o sistema já começa o e-mail com "Oi [nome]," automaticamente.
      </div>
      <div id="camp-preview" style="display:none;background:var(--bg);border:1px solid var(--bdr);border-radius:9px;padding:12px;margin-bottom:12px;font-size:.85rem"></div>
      <div style="display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap">
        <button class="bulk-btn" onclick="previewCampanha()">👁 Pré-visualizar</button>
        <button class="bulk-btn" onclick="fecharCampanha()">Cancelar</button>
        <button class="bulk-btn" style="background:var(--g);color:#0b0b0d;border-color:var(--g);font-weight:700" onclick="enviarCampanha()">📨 Enviar para ${leads.length}</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) fecharCampanha(); });
  document.body.appendChild(ov);
  setTimeout(() => document.getElementById('camp-assunto')?.focus(), 50);
}
function fecharCampanha() { document.getElementById('campanha-modal')?.remove(); }

// Mesma regra do envio: se não houver {nome}, começa com "Oi {nome},"
function _campBodyTemplate(body) {
  return /\{nome\}/i.test(body) ? body : ('Oi {nome},\n\n' + body);
}
function previewCampanha() {
  const leads   = getSelectedLeads().filter(l => l.email);
  const exemplo = (leads[0] && String(leads[0].nome || '').split(' ')[0]) || 'Maria';
  const subject = (document.getElementById('camp-assunto')?.value || '').trim();
  const body    = (document.getElementById('camp-corpo')?.value || '').trim();
  if (!subject && !body) { showToast('Escreva algo pra pré-visualizar'); return; }
  const subj  = subject.replace(/\{nome\}/gi, exemplo);
  const corpo = _campBodyTemplate(body).replace(/\{nome\}/gi, exemplo).replace(/\n/g, '<br>');
  const box = document.getElementById('camp-preview');
  box.style.display = 'block';
  box.innerHTML = `<div style="color:var(--ts);font-size:.72rem;margin-bottom:6px">Prévia — exemplo com o nome "<strong>${exemplo}</strong>":</div>
    <div style="font-weight:700;margin-bottom:8px">${subj || '(sem assunto)'}</div>
    <div style="line-height:1.55">${corpo || '(sem mensagem)'}</div>`;
}

/* ── Histórico de campanhas enviadas (lido da aba "Campanhas" da planilha) ── */
function _escCamp(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c])); }
async function abrirHistoricoCampanhas() {
  const ov = document.createElement('div');
  ov.id = 'hist-modal';
  ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px';
  ov.innerHTML = `
    <div style="background:var(--s1);border:1px solid var(--bdrb);border-radius:14px;max-width:560px;width:100%;padding:22px;max-height:88vh;overflow:auto;color:var(--text)">
      <div style="font-size:1.05rem;font-weight:700;margin-bottom:14px">📢 Campanhas enviadas</div>
      <div id="hist-body" style="font-size:.9rem">Carregando…</div>
      <div style="display:flex;justify-content:flex-end;margin-top:16px">
        <button class="bulk-btn" onclick="fecharHistorico()">Fechar</button>
      </div>
    </div>`;
  ov.addEventListener('click', e => { if (e.target === ov) fecharHistorico(); });
  document.body.appendChild(ov);
  try {
    const res  = await fetch(CONFIG.SHEETS_URL + '?action=getCampanhas', { redirect: 'follow' });
    const rows = await res.json();
    const body = document.getElementById('hist-body');
    if (!body) return;
    if (!Array.isArray(rows) || !rows.length) {
      body.innerHTML = '<div style="color:var(--ts)">Nenhuma campanha enviada ainda.</div>';
      return;
    }
    body.innerHTML = rows.map(c => `
      <div style="border-bottom:1px solid var(--bdr);padding:11px 0">
        <div style="font-weight:700">${_escCamp(c.assunto) || '(sem assunto)'}</div>
        <div style="font-size:.75rem;color:var(--ts);margin-top:4px">
          🗓 ${c.data ? new Date(c.data).toLocaleString('pt-BR') : '—'}
          &nbsp;·&nbsp; 👥 ${c.enviados || 0} enviados${c.grupo ? ' &nbsp;·&nbsp; 🏷 ' + _escCamp(c.grupo) : ''}
        </div>
      </div>`).join('');
  } catch (_) {
    const body = document.getElementById('hist-body');
    if (body) body.innerHTML = '<div style="color:var(--red)">Não consegui carregar. Republicou o Apps Script com a versão nova?</div>';
  }
}
function fecharHistorico() { document.getElementById('hist-modal')?.remove(); }
function enviarCampanha() {
  const subject = (document.getElementById('camp-assunto')?.value || '').trim();
  const body    = (document.getElementById('camp-corpo')?.value || '').trim();
  if (!subject) { showToast('Escreva o assunto do e-mail'); return; }
  if (!body)    { showToast('Escreva a mensagem'); return; }
  const leads = getSelectedLeads().filter(l => l.email);
  if (!leads.length) { showToast('Nenhum e-mail'); return; }
  if (!confirm(`Enviar esta campanha para ${leads.length} lead(s)?`)) return;

  const label = filtroAtivo === 'g_curso' ? 'Curso' : filtroAtivo === 'g_mentoria' ? 'Mentoria'
              : filtroAtivo === 'g_ebook' ? 'Ebook' : 'Seleção';
  const sessionIds = leads.map(l => l.sessionId);
  fetch(CONFIG.SHEETS_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'broadcast', sessionIds, subject, body, label, total: leads.length }),
  }).catch(() => {});

  showToast(`Disparando campanha para ${leads.length} lead(s)... 📨`);
  fecharCampanha();
  clearSelection();
  renderLeads();
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

