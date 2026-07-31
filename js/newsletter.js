/* ═══════════════════════════════════════════
   NEWSLETTER — e-mails por segmento, com agendamento
   Escreve assunto + corpo, escolhe o grupo (Curso/Mentoria/Ebook/Todos),
   envia na hora ou agenda uma data (ex: 1 por semana).
═══════════════════════════════════════════ */
let _nlSeg = 'curso';
let _nlAgendar = false;

function _nlSegCounts(leads) {
  const c = { curso: 0, mentoria: 0, ebook: 0, todos: leads.length };
  leads.forEach(l => { const g = grupoProduto(l); if (c[g] != null) c[g]++; });
  return c;
}

async function renderNewsletter() {
  const el = document.getElementById('newsletter-content');
  if (!el) return;
  const leads = cachedLeads || [];
  const cnt = _nlSegCounts(leads);
  const segs = [
    { key: 'curso',    label: '📚 Curso' },
    { key: 'mentoria', label: '💎 Mentoria' },
    { key: 'ebook',    label: '📖 Ebook' },
    { key: 'todos',    label: '👥 Todos' },
  ];

  const form = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:18px;margin-bottom:18px">
      <div style="font-weight:800;margin-bottom:12px">✍️ Escrever e-mail</div>

      <div style="font-size:.72rem;color:var(--ts);margin-bottom:6px">Enviar para o grupo:</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px">
        ${segs.map(s => `<button onclick="_nlPick('${s.key}')" style="padding:8px 12px;border-radius:9px;cursor:pointer;font-size:.82rem;color:var(--text);
          border:1px solid ${_nlSeg === s.key ? 'var(--g)' : 'var(--bdr)'};background:${_nlSeg === s.key ? 'var(--gd)' : 'var(--s2)'}">
          ${s.label} <span style="color:var(--td)">(${cnt[s.key] || 0})</span></button>`).join('')}
      </div>

      <input id="nl-assunto" placeholder="Assunto do e-mail (capriche, é o que faz abrir!)" maxlength="160"
        style="width:100%;padding:11px;margin-bottom:10px;border-radius:9px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);font-size:.9rem">
      <textarea id="nl-corpo" rows="9" placeholder="Escreva o e-mail aqui...&#10;&#10;Dica: use {nome} pra chamar cada pessoa pelo primeiro nome."
        style="width:100%;padding:11px;border-radius:9px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);font-size:.9rem;resize:vertical;line-height:1.5"></textarea>
      <div style="font-size:.72rem;color:var(--ts);margin:8px 0 14px">💡 O nome entra sempre — se não usar <strong style="color:var(--g)">{nome}</strong>, começa com "Oi [nome],".</div>

      <div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;margin-bottom:14px">
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:.85rem"><input type="radio" name="nl-quando" ${!_nlAgendar ? 'checked' : ''} onclick="_nlToggle(false)"> 📤 Enviar agora</label>
        <label style="display:flex;gap:6px;align-items:center;cursor:pointer;font-size:.85rem"><input type="radio" name="nl-quando" ${_nlAgendar ? 'checked' : ''} onclick="_nlToggle(true)"> 🗓️ Agendar</label>
        <input id="nl-data" type="datetime-local" ${_nlAgendar ? '' : 'style="display:none"'}
          style="padding:8px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)">
      </div>

      <div id="nl-preview" style="display:none;background:var(--bg);border:1px solid var(--bdr);border-radius:9px;padding:12px;margin-bottom:12px;font-size:.85rem"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <button onclick="_nlPreview()" style="background:var(--s3);border:1px solid var(--bdr);color:var(--text);padding:10px 16px;border-radius:9px;cursor:pointer">👁 Pré-visualizar</button>
        <button onclick="agendarEmail()" style="background:var(--g);color:#0b0b0d;border:none;font-weight:700;padding:10px 18px;border-radius:9px;cursor:pointer">${_nlAgendar ? '🗓️ Agendar e-mail' : '📤 Enviar agora'}</button>
      </div>
    </div>`;

  el.innerHTML = form + '<div id="nl-lista" style="color:var(--td);font-size:.85rem">Carregando agendamentos…</div>';
  _nlCarregarLista();
}

function _nlPick(k) { _nlSeg = k; renderNewsletter(); }
function _nlToggle(on) {
  _nlAgendar = on;
  const d = document.getElementById('nl-data');
  if (d) d.style.display = on ? '' : 'none';
  const btn = document.querySelector('#newsletter-content button[onclick="agendarEmail()"]');
  // re-render leve do botão via texto
  renderNewsletterKeep();
}
// mantém o que já foi digitado ao alternar agora/agendar
function renderNewsletterKeep() {
  const a = document.getElementById('nl-assunto')?.value || '';
  const c = document.getElementById('nl-corpo')?.value || '';
  const data = document.getElementById('nl-data')?.value || '';
  renderNewsletter();
  setTimeout(() => {
    if (document.getElementById('nl-assunto')) document.getElementById('nl-assunto').value = a;
    if (document.getElementById('nl-corpo')) document.getElementById('nl-corpo').value = c;
    if (document.getElementById('nl-data')) document.getElementById('nl-data').value = data;
  }, 0);
}

function _nlBodyTpl(body) { return /\{nome\}/i.test(body) ? body : ('Oi {nome},\n\n' + body); }
function _nlPreview() {
  const nome = 'Maria';
  const a = (document.getElementById('nl-assunto')?.value || '').trim();
  const c = (document.getElementById('nl-corpo')?.value || '').trim();
  if (!a && !c) { showToast('Escreva algo pra pré-visualizar'); return; }
  const box = document.getElementById('nl-preview');
  box.style.display = 'block';
  box.innerHTML = `<div style="color:var(--ts);font-size:.72rem;margin-bottom:6px">Prévia (exemplo "Maria"):</div>
    <div style="font-weight:700;margin-bottom:8px">${a.replace(/\{nome\}/gi, nome) || '(sem assunto)'}</div>
    <div style="line-height:1.55">${_nlBodyTpl(c).replace(/\{nome\}/gi, nome).replace(/\n/g, '<br>')}</div>`;
}

function agendarEmail() {
  const assunto = (document.getElementById('nl-assunto')?.value || '').trim();
  const corpo   = (document.getElementById('nl-corpo')?.value || '').trim();
  if (!assunto) { showToast('Escreva o assunto'); return; }
  if (!corpo)   { showToast('Escreva o e-mail'); return; }
  let quando = '';
  if (_nlAgendar) {
    const v = document.getElementById('nl-data')?.value;
    if (!v) { showToast('Escolha a data do agendamento'); return; }
    quando = new Date(v).toISOString();
  }
  const cnt = _nlSegCounts(cachedLeads || [])[_nlSeg] || 0;
  const quando_txt = _nlAgendar ? `agendar para ${new Date(quando).toLocaleString('pt-BR')}` : 'enviar AGORA';
  if (!confirm(`Confirmar: ${quando_txt} para o grupo "${_nlSeg}" (~${cnt} leads)?`)) return;

  fetch(CONFIG.SHEETS_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'scheduleCampaign', segmento: _nlSeg, assunto, corpo, quando }),
  }).catch(() => {});

  showToast(_nlAgendar ? 'E-mail agendado ✓ 🗓️' : 'Enviando agora… 📤');
  document.getElementById('nl-assunto').value = '';
  document.getElementById('nl-corpo').value = '';
  setTimeout(_nlCarregarLista, 1500);
}

async function _nlCarregarLista() {
  const el = document.getElementById('nl-lista');
  if (!el) return;
  try {
    const r = await fetch(CONFIG.SHEETS_URL + '?action=getAgendamentos', { redirect: 'follow' });
    const rows = await r.json();
    if (!Array.isArray(rows) || !rows.length) { el.innerHTML = '<div style="color:var(--td);padding:8px">Nenhum e-mail agendado ou enviado ainda.</div>'; return; }
    const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    el.innerHTML = `<div style="font-weight:800;margin:6px 0 10px">🗓️ Agendados & enviados</div>` + rows.map(a => {
      const pend = a.status === 'pendente';
      const cor = pend ? 'var(--yellow)' : 'var(--g)';
      return `<div style="background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:11px;margin-bottom:8px;display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap">
        <div style="min-width:0">
          <div style="font-weight:700">${esc(a.assunto) || '(sem assunto)'}</div>
          <div style="font-size:.74rem;color:var(--ts)">🏷 ${esc(a.segmento)} · 🗓️ ${a.quando ? new Date(a.quando).toLocaleString('pt-BR') : '—'} · <span style="color:${cor};font-weight:700">${pend ? '⏳ Pendente' : '✅ Enviado' + (a.enviados ? ' (' + a.enviados + ')' : '')}</span></div>
        </div>
        ${pend ? `<button onclick="excluirAgendamento('${a.id}')" style="background:none;border:1px solid var(--bdr);color:var(--red);border-radius:7px;padding:5px 10px;cursor:pointer;font-size:.75rem">✕ Cancelar</button>` : ''}
      </div>`;
    }).join('');
  } catch (_) {
    el.innerHTML = '<div style="color:var(--red)">Não consegui carregar. Republicou o Apps Script?</div>';
  }
}

function excluirAgendamento(id) {
  if (!confirm('Cancelar este agendamento?')) return;
  fetch(CONFIG.SHEETS_URL, {
    method: 'POST', mode: 'no-cors',
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action: 'deleteAgendamento', id }),
  }).catch(() => {});
  showToast('Agendamento cancelado');
  setTimeout(_nlCarregarLista, 1200);
}
