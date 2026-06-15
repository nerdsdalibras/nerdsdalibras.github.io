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
    ? `<a class="quick-btn qb-wpp" href="${waLink(lead.whatsapp, gerarMensagem(lead))}" target="_blank" rel="noopener">💬 WA</a>`
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
          <span class="pf-val" style="color:${statusKey === 'comprou' ? 'var(--g)' : isCartaoRecusado(l) ? '#DC2626' : viuCheck ? '#EA580C' : 'var(--td)'};font-weight:${(viuCheck || isCartaoRecusado(l)) ? '700' : '400'}">
            ${statusKey === 'comprou' ? '✅ Compra confirmada (Kiwify)'
              : isCartaoRecusado(l) ? '💳 Cartão recusado — tentou pagar e falhou'
              : viuCheck ? '🛒 Carrinho abandonado — clicou, não pagou' : '—'}
          </span>
        </div>
        ${l.checkoutEm ? `<div class="panel-field"><span class="pf-label">Foi ao checkout</span><span class="pf-val">${new Date(l.checkoutEm).toLocaleString('pt-BR')}</span></div>` : ''}
        ${l.recusadoEm ? `<div class="panel-field"><span class="pf-label">Cartão recusado em</span><span class="pf-val" style="color:#DC2626">${new Date(l.recusadoEm).toLocaleString('pt-BR')}</span></div>` : ''}
        ${l.kiwifyEvento ? `<div class="panel-field"><span class="pf-label">Último evento Kiwify</span><span class="pf-val">${l.kiwifyEvento}${l.kiwifyEventoEm ? ' · ' + new Date(l.kiwifyEventoEm).toLocaleString('pt-BR') : ''}</span></div>` : ''}
        ${l.boletoGerado ? `<div class="panel-field"><span class="pf-label">Boleto</span><span class="pf-val" style="color:var(--yellow)">🧾 Gerado — aguardando pagamento</span></div>` : ''}
        ${l.pixGerado ? `<div class="panel-field"><span class="pf-label">Pix</span><span class="pf-val" style="color:var(--yellow)">⚡ Gerado — aguardando pagamento</span></div>` : ''}
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
        ${l.whatsapp ? `<a class="panel-big-btn pbb-wpp" href="${waLink(l.whatsapp, gerarMensagem(l))}" target="_blank" rel="noopener">💬 Abrir WhatsApp com mensagem pronta</a>` : ''}
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
  if (l.cartaoRecusado && l.status !== 'comprou')
    events.push({ time: l.recusadoEm ? formatTime(l.recusadoEm) : '—', text: '💳 Cartão recusado — tentou pagar e o pagamento não passou' });
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
  if (isCartaoRecusado(l)) {
    msg = `Oi, ${nome}! 🤟 Vi que você tentou finalizar a inscrição mas o pagamento não foi aprovado (acontece muito com o cartão!). Quer que eu te mande um link novo ou te ajude com outra forma de pagamento, tipo Pix? É rapidinho! 💚`;
  } else if (viuCheck) {
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
  if (isCartaoRecusado(l)) {
    alerts.push({ title: '💳 Cartão Recusado — URGENTE', text: 'O pagamento foi tentado mas não passou. Lead de máxima intenção! Ofereça Pix ou link novo o quanto antes.' });
  } else if (viuCheck) {
    alerts.push({ title: 'Recuperar Carrinho', text: 'Foi ao checkout mas não comprou. Alta probabilidade de conversão com uma mensagem de recuperação.' });
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

