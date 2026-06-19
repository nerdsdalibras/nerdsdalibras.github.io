/* ═══════════════════════════════════════════
   CHECKOUT — quem chegou no checkout (comprou / não comprou / recusado)
═══════════════════════════════════════════ */

// Classifica o desfecho do lead que entrou no checkout
function _checkoutStatus(l) {
  if (l.status === 'comprou' || l.comprouKiwify) return { key: 'comprou',    label: '✅ Comprou',            color: '#4ade80' };
  if (l.chargeback)                              return { key: 'chargeback',  label: '⚠️ Chargeback',         color: '#f87171' };
  if (l.reembolso)                               return { key: 'reembolso',   label: '↩️ Reembolso',          color: '#a1a1aa' };
  if (l.cartaoRecusado)                          return { key: 'recusado',    label: '💳 Cartão recusado',    color: '#fb923c' };
  if (l.boletoGerado)                            return { key: 'boleto',      label: '🧾 Boleto — aguardando', color: '#fbbf24' };
  if (l.pixGerado)                               return { key: 'pix',         label: '⚡ Pix — aguardando',    color: '#fbbf24' };
  return { key: 'naocomprou', label: '🛒 Não comprou', color: '#f87171' };
}

// Filtro ativo da página de checkout
let checkoutFiltro = 'todos';
function setCheckoutFiltro(key) { checkoutFiltro = key; renderCheckout(); }

/* ── Sequência de WhatsApp (semi-automática: agenda 0h/24h/48h, envio em 1 clique) ── */
const WA_SEQ_DELAYS_H = [0, 24, 48];

// Qual mensagem (1/2/3) está na hora de enviar agora; 0 = nenhuma vencida; -1 = não iniciada
function _waDueNum(l) {
  if (!l.waSeqStart) return -1;
  const anchor = new Date(l.waSeqStart).getTime();
  const sentKeys = ['waMsg1SentAt', 'waMsg2SentAt', 'waMsg3SentAt'];
  const now = Date.now();
  for (let n = 0; n < 3; n++) {
    if (l[sentKeys[n]]) continue;
    return (now >= anchor + WA_SEQ_DELAYS_H[n] * 3600000) ? (n + 1) : 0;
  }
  return 0; // todas enviadas
}

function _waSeqCell(l) {
  if (_checkoutStatus(l).key === 'comprou') return '<span class="ck-muted">—</span>';
  if (!l.whatsapp) return '<span class="ck-muted">sem zap</span>';
  const sent = [l.waMsg1SentAt, l.waMsg2SentAt, l.waMsg3SentAt].filter(Boolean).length;
  if (!l.waSeqStart) {
    return `<button class="quick-btn qb-wpp" onclick="iniciarSeqWhats('${l.sessionId}', event)">📲 Iniciar seq</button>`;
  }
  const due = _waDueNum(l);
  if (due) {
    return `<button class="quick-btn qb-wpp" onclick="enviarSeqWhats('${l.sessionId}', ${due}, event)">📲 Enviar msg ${due}</button> <span class="ck-muted">${sent}/3</span>`;
  }
  if (sent >= 3) return `<span class="ck-badge" style="color:var(--g);border-color:var(--g)">✓ Seq completa</span>`;
  return `<span class="ck-muted">⏳ ${sent}/3 · próx. agendada</span>`;
}

function iniciarSeqWhats(sessionId, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead || !lead.whatsapp) return;
  const now = new Date().toISOString();
  _abrirWa(waLink(lead.whatsapp, _waMsgRemarketing(lead, 1)));
  patchLead(sessionId, { waSeqStart: now, waMsg1SentAt: now });
  showToast('Sequência iniciada — msg 1 aberta no WhatsApp 📲');
  if (currentPage === 'checkout') renderCheckout(); else if (currentPage === 'leads') renderLeads();
}

function enviarSeqWhats(sessionId, num, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead || !lead.whatsapp) return;
  _abrirWa(waLink(lead.whatsapp, _waMsgRemarketing(lead, num)));
  patchLead(sessionId, { [`waMsg${num}SentAt`]: new Date().toISOString() });
  showToast(`Msg ${num} aberta no WhatsApp 📲`);
  if (currentPage === 'checkout') renderCheckout(); else if (currentPage === 'leads') renderLeads();
}

async function renderCheckout() {
  const leads = await getLeads();
  const all = leads
    .filter(l => l.clicouCheckout || l.checkoutEm)
    .sort((a, b) => new Date(b.checkoutEm || b.updatedAt || 0) - new Date(a.checkoutEm || a.updatedAt || 0));

  const total      = all.length;
  const comprou    = all.filter(l => _checkoutStatus(l).key === 'comprou').length;
  const recusado   = all.filter(l => _checkoutStatus(l).key === 'recusado').length;
  const naocomprou = total - comprou;
  const semEmail   = all.filter(l => !l.email).length;

  const stats = `
    <div class="ck-stats">
      <div class="ck-stat">      <div class="ck-stat-val">${total}</div>      <div class="ck-stat-lbl">Entraram no checkout</div></div>
      <div class="ck-stat green"><div class="ck-stat-val">${comprou}</div>    <div class="ck-stat-lbl">Compraram</div></div>
      <div class="ck-stat red">  <div class="ck-stat-val">${naocomprou}</div> <div class="ck-stat-lbl">Não compraram</div></div>
      <div class="ck-stat orange"><div class="ck-stat-val">${recusado}</div>  <div class="ck-stat-lbl">Cartão recusado</div></div>
    </div>`;

  const filtros = [
    { key: 'todos',      label: 'Todos',           n: total },
    { key: 'comprou',    label: '✅ Compraram',     n: comprou },
    { key: 'naocomprou', label: '🛒 Não compraram', n: naocomprou },
    { key: 'recusado',   label: '💳 Cartão recusado', n: recusado },
  ];
  const filterBar = `
    <div class="ck-filter">
      ${filtros.map(f => `
        <button class="filter-btn ${checkoutFiltro === f.key ? 'active' : ''}" onclick="setCheckoutFiltro('${f.key}')">
          ${f.label} <span class="filter-count">${f.n}</span>
        </button>`).join('')}
      ${semEmail ? `<span class="ck-warn" title="Leads sem e-mail não recebem o remarketing automático">⚠️ ${semEmail} sem e-mail</span>` : ''}
    </div>`;

  const filtered = all.filter(l => {
    if (checkoutFiltro === 'todos') return true;
    if (checkoutFiltro === 'naocomprou') return _checkoutStatus(l).key !== 'comprou';
    return _checkoutStatus(l).key === checkoutFiltro;
  });

  const rows = filtered.map(l => {
    const st    = _checkoutStatus(l);
    const wpp   = String(l.whatsapp || '').replace(/\D/g, '');
    const wHtml = wpp
      ? `<a href="#" onclick="contatarLead('${l.sessionId}', event)" title="Abrir no WhatsApp">${l.whatsapp}</a>`
      : '<span class="ck-muted">—</span>';
    const eHtml = l.email
      ? `<a href="mailto:${l.email}">${l.email}</a>`
      : '<span class="ck-muted">sem e-mail</span>';
    const of    = l.oferta === 'mentoria' ? '🎯 Mentoria' : l.oferta === 'curso' ? '📚 Curso' : '—';
    const dt    = l.checkoutEm ? formatDate(l.checkoutEm) : (l.createdAt ? formatDate(l.createdAt) : '—');
    const emails = [l.email1SentAt, l.email2SentAt, l.email3SentAt].filter(Boolean).length;

    return `
      <tr onclick="openLead('${l.sessionId}')">
        <td><div class="ck-name">${l.nome || 'Lead'}</div></td>
        <td class="ck-contact" onclick="event.stopPropagation()">📧 ${eHtml}<br>💬 ${wHtml}</td>
        <td>${of}</td>
        <td class="ck-muted">${dt}</td>
        <td><span class="ck-badge" style="color:${st.color};border-color:${st.color}">${st.label}</span></td>
        <td class="ck-muted">${emails}/3</td>
        <td onclick="event.stopPropagation()">${_waSeqCell(l)}</td>
        <td class="ck-actions" onclick="event.stopPropagation()">
          ${wpp ? `<a class="quick-btn qb-wpp" href="#" onclick="contatarLead('${l.sessionId}', event)">💬</a>` : ''}
          <button class="quick-btn qb-open" onclick="openLead('${l.sessionId}')">Ver →</button>
        </td>
      </tr>`;
  }).join('');

  const table = filtered.length ? `
    <div class="ck-table-wrap">
      <table class="ck-table">
        <thead>
          <tr>
            <th>Nome</th><th>Contato</th><th>Oferta</th><th>Checkout em</th>
            <th>Status</th><th title="E-mails de remarketing enviados">E-mails</th><th title="Sequência de WhatsApp (0h / 24h / 48h)">Follow-up WA</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : '<div class="ck-empty">Nenhum lead nesse filtro ainda.</div>';

  document.getElementById('checkout-content').innerHTML = stats + filterBar + table;
}
