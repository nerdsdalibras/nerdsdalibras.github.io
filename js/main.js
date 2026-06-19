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

  // Checkout: quantos entraram no checkout mas ainda não compraram
  const ck = leads.filter(l => (l.clicouCheckout || l.checkoutEm) && l.status !== 'comprou' && !l.comprouKiwify).length;
  const bc = document.getElementById('badge-checkout');
  if (bc) bc.textContent = ck > 0 ? ck : '';
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
    return `Oi, ${nome}! 💚 Vi que você tentou garantir sua vaga no ${oferta} e o pagamento não passou — fica tranquila, isso é super comum com o cartão e a gente resolve rapidinho juntas. Eu não quero de jeito nenhum que você perca essa chance de evoluir em Libras. Me chama aqui que eu te mando um link novo ou faço por Pix, do jeitinho que for melhor pra você. 💚`;
  }

  // Remarketing de carrinho abandonado — alta intenção de compra
  if (isCarrinhoAbandonado(l)) {
    return `Oi, ${nome}! 💚 Vi que você chegou pertinho de garantir sua vaga no ${oferta}, mas não conseguiu finalizar. Imagino que possa ter surgido alguma dúvida no caminho — e tá tudo bem, eu estou aqui pra te ajudar a dar esse passo tão importante na sua jornada em Libras. Me chama que a gente resolve juntas, e eu ainda garanto uma condição especial pra você. 💚`;
  }

  if (l.oferta === 'mentoria') {
    return `Oi, ${nome}! 💚 Que alegria ter você por aqui! Vi sua avaliação com a Lorena e seu nível ${nivel} me deixou muito animada — dá pra sentir o quanto você quer evoluir em Libras. Você tinha demonstrado interesse na Mentoria Ciclo da Fluência, e eu adoraria te mostrar como ela pode transformar de verdade a sua jornada. Me chama aqui que eu te conto tudo com muito carinho. 💚`;
  }
  const sfx = l.genero === 'masculino' ? 'o' : 'a';
  return `Oi, ${nome}! 💚 Que bom te ver por aqui! Vi sua avaliação com a Lorena e seu nível ${nivel} mostra que você tem tudo pra ir muito longe em Libras. Você estava interessad${sfx} no Curso do Zero à Libras, e eu adoraria caminhar essa jornada ao seu lado. Me chama aqui que eu te mostro o próximo passo com todo carinho. ✨💚`;
}

// Abre a conversa do lead no WhatsApp WEB (onde o WhatsApp Business está logado),
// em vez do app de desktop pessoal. Retorna null se o lead não tem número.
function waLink(phoneRaw, msg) {
  const phone = String(phoneRaw || '').replace(/\D/g, '');
  if (!phone) return null;
  let url = `https://web.whatsapp.com/send?phone=55${phone}`;
  if (msg) url += `&text=${encodeURIComponent(msg)}`;
  return url;
}

// Mantém UMA única aba do WhatsApp Web e a reaproveita a cada clique.
let _waWin = null;

// Abre/reaproveita a aba única do WhatsApp Web numa URL pronta
function _abrirWa(url) {
  if (!url) return;
  try {
    if (_waWin && !_waWin.closed) { _waWin.location.href = url; _waWin.focus(); return; }
  } catch (_) {}
  _waWin = window.open(url, 'whatsapp_web');
  try { _waWin && _waWin.focus(); } catch (_) {}
}

// Texto da sequência de remarketing por WhatsApp (1, 2 ou 3), personalizado pelo nome
function _waMsgRemarketing(l, num) {
  const nome = String(l.nome || 'você').split(' ')[0];
  const link = l.oferta === 'mentoria' ? CONFIG.MENTORIA_EDUZZ_URL : CONFIG.KIWIFY_URL;
  if (num === 1) {
    return `Oi, ${nome}! 💜 Aqui é a Lorena, da Nerds da Libras. Vi que você chegou pertinho de garantir sua vaga no Curso do Zero à Libras, mas não finalizou. Ficou alguma dúvida ou deu algum problema no pagamento? Me chama que eu te ajudo! Sua vaga ainda está reservada aqui: ${link}`;
  }
  if (num === 2) {
    return `Oi, ${nome}! 💜 Uma coisa que quase ninguém explica: Libras não é português com as mãos — é uma língua visual, e é por isso que tanta gente trava. No Zero a Libras você aprende do jeito certo, por níveis e com acompanhamento. Quer começar? ${link}`;
  }
  return `Oi, ${nome}! 💜 Última chamada: garantindo hoje você ganha *30% de desconto* com o cupom *DESCONTO30*, além dos cursos bônus de Datilologia e Interpretação de Música, liberados na plataforma. Só até sábado! Garanta aqui: ${link}`;
}

// Clique em "Abrir WhatsApp": reaproveita a aba e marca o lead como contatado.
function contatarLead(sessionId, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  const lead = (cachedLeads || []).find(l => l.sessionId === sessionId);
  if (!lead) return;

  const url = waLink(lead.whatsapp, gerarMensagem(lead));
  if (url) {
    let reaproveitou = false;
    try {
      if (_waWin && !_waWin.closed) { _waWin.location.href = url; _waWin.focus(); reaproveitou = true; }
    } catch (_) { reaproveitou = false; }   // COOP do WhatsApp pode bloquear o acesso
    if (!reaproveitou) {
      _waWin = window.open(url, 'whatsapp_web');
      try { _waWin && _waWin.focus(); } catch (_) {}
    }
  }

  // Marca como "mensagem enviada" (persiste no localStorage + sincroniza)
  if (!lead.contatadoEm) {
    patchLead(sessionId, { contatadoEm: new Date().toISOString() });
    if (currentPage === 'pipeline')      renderPipeline();
    else if (currentPage === 'leads')    renderLeads();
    else if (currentPage === 'checkout') renderCheckout();
    if (currentLead && currentLead.sessionId === sessionId) renderTab(currentTab);
  }
}

// Desmarca o lead (caso tenha clicado por engano)
function desmarcarContato(sessionId, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  patchLead(sessionId, { contatadoEm: null });
  if (currentPage === 'pipeline')      renderPipeline();
  else if (currentPage === 'leads')    renderLeads();
  else if (currentPage === 'checkout') renderCheckout();
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
