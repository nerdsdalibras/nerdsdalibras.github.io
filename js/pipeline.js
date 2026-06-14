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

