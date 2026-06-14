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
// Estados finais que tiram o lead da fila de recuperação
function _statusEncerrado(l) {
  return l.status === 'comprou' || l.status === 'reembolso' || l.status === 'chargeback';
}

// Cartão recusado = tentou pagar na Kiwify e o pagamento não passou.
// É o lead de MAIOR intenção (chegou a digitar o cartão).
function isCartaoRecusado(l) {
  return !!l.cartaoRecusado && !_statusEncerrado(l);
}

// Carrinho abandonado = clicou para comprar (checkout, CTA do VSL, cartão
// recusado, boleto/pix gerado ou carrinho da Kiwify) e não finalizou.
function isCarrinhoAbandonado(l) {
  return (l.clicouCheckout || l.vslClicouCTA || l.cartaoRecusado ||
          l.carrinhoKiwify || l.boletoGerado || l.pixGerado) && !_statusEncerrado(l);
}

function gerarMensagem(l) {
  const nome  = l.nome || 'você';
  const nivel = l.nivelIdentificado || '—';
  const oferta = l.oferta === 'mentoria' ? 'Mentoria Ciclo da Fluência' : 'Curso do Zero à Libras';

  // Cartão recusado — prioridade máxima, pagamento falhou
  if (isCartaoRecusado(l)) {
    return `Oi, ${nome}! 🤟 Vi que você tentou finalizar a inscrição no ${oferta}, mas o pagamento não foi aprovado (isso acontece muito com o cartão, viu?). Quer que eu te mande um link novo ou te ajude com outra forma de pagamento, tipo Pix? É rapidinho! 💚`;
  }

  // Remarketing de carrinho abandonado — alta intenção de compra
  if (isCarrinhoAbandonado(l)) {
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
