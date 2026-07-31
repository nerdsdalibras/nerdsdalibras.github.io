/* ═══════════════════════════════════════════
   PIPELINE — DRAG & DROP + R$ PROJETADO
═══════════════════════════════════════════ */
// ── ETAPAS comerciais (colunas do pipeline) ──
const ETAPAS = [
  { key: 'novo',        label: 'Novo Lead',        color: '#a1a1aa' },
  { key: 'contato',     label: 'Contato iniciado', color: '#60a5fa' },
  { key: 'conversa',    label: 'Em conversa',      color: '#38bdf8' },
  { key: 'qualificado', label: 'Qualificado',      color: '#fbbf24' },
  { key: 'oferta',      label: 'Oferta realizada', color: '#f59e0b' },
  { key: 'negociacao',  label: 'Negociação/Objeção', color: '#f97316' },
  { key: 'checkout',    label: 'Checkout enviado', color: '#a78bfa' },
  { key: 'ganha',       label: '✅ Venda ganha',   color: '#22c55e' },
  { key: 'perdida',     label: '❌ Venda perdida', color: '#71717a' },
];
const ETAPA_PROB = {
  novo: 0.03, contato: 0.08, conversa: 0.15, qualificado: 0.25, oferta: 0.35,
  negociacao: 0.55, checkout: 0.65, ganha: 1, perdida: 0,
};
// Mantém compatibilidade com quem ainda referencia PIPELINE_STAGES
const PIPELINE_STAGES = ETAPAS;

// ── TEMPERATURA (separada do estágio) ──
const TEMPERATURAS = [
  { key: 'frio',         label: 'Frio',         emoji: '🔵' },
  { key: 'morno',        label: 'Morno',        emoji: '🟡' },
  { key: 'quente',       label: 'Quente',       emoji: '🟢' },
  { key: 'muito_quente', label: 'Muito quente', emoji: '🔥' },
];
function _tempInfo(key) { return TEMPERATURAS.find(t => t.key === key) || TEMPERATURAS[0]; }

// Etapa do lead: usa o campo 'etapa'; se não tiver, deriva dos sinais do funil
function getEtapa(l) {
  if (l.etapa && ETAPA_PROB[l.etapa] !== undefined) return l.etapa;
  var _tv = v => v === true || String(v).toLowerCase() === 'true';
  if (l.status === 'comprou' || _tv(l.comprouKiwify)) return 'ganha';
  if (l.status === 'nao_quis') return 'perdida';
  if (l.clicouCheckout || l.checkoutEm || l.cartaoRecusado || l.boletoGerado || l.pixGerado || l.carrinhoKiwify) return 'checkout';
  if (_tv(l.concluiuQuiz) || l.clicouOferta) return 'oferta';
  if (l.contatadoEm) return 'contato';
  return 'novo';
}
// Temperatura do lead: usa o campo 'temperatura'; senão deriva do status/classificação antigos
function getTemperatura(l) {
  if (l.temperatura) return l.temperatura;
  var st = l.status || '';
  var cl = String(l.classificacaoLead || '').toUpperCase();
  if (st === 'prioridade_maxima' || st === 'muito_quente' || l.cartaoRecusado) return 'muito_quente';
  if (st === 'quente' || cl === 'QUENTE') return 'quente';
  if (st === 'morno' || cl === 'MORNO') return 'morno';
  return 'frio';
}

// Muda a etapa (drag ou seletor). Sincroniza o status p/ ganha/perdida.
function setEtapa(sessionId, etapa) {
  var patch = { etapa: etapa };
  if (etapa === 'ganha') patch.status = 'comprou';
  else if (etapa === 'perdida') patch.status = 'nao_quis';
  patchLead(sessionId, patch);
  if (currentPage === 'pipeline')      renderPipeline();
  else if (currentPage === 'leads')    renderLeads();
  if (currentLead && currentLead.sessionId === sessionId) renderTab(currentTab);
}
// Muda a temperatura
function setTemperatura(sessionId, temp, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  patchLead(sessionId, { temperatura: temp });
  if (currentPage === 'pipeline')      renderPipeline();
  else if (currentPage === 'leads')    renderLeads();
  if (currentLead && currentLead.sessionId === sessionId) renderTab(currentTab);
}
// Clique no emoji do card → cicla a temperatura
function ciclarTemperatura(sessionId, e) {
  if (e) { e.preventDefault(); e.stopPropagation(); }
  var l = (cachedLeads || []).find(x => x.sessionId === sessionId);
  if (!l) return;
  var i = TEMPERATURAS.findIndex(t => t.key === getTemperatura(l));
  setTemperatura(sessionId, TEMPERATURAS[(i + 1) % TEMPERATURAS.length].key, e);
}

/* Filtro por produto/oferta do pipeline */
const PIPELINE_OFERTAS = [
  { key: 'todos',     label: 'Todos',                 icon: ''   },
  { key: 'curso',     label: 'Curso (Zero à Libras)', icon: '📚' },
  { key: 'mentoria',  label: 'Mentoria',              icon: '🎯' },
  { key: 'sem',       label: 'Sem oferta',            icon: '·'  },
];
let pipelineOferta = 'todos';

function setPipelineOferta(key) {
  pipelineOferta = key;
  renderPipeline();
}

/* Casa um lead com a oferta selecionada no filtro */
function leadMatchOferta(l) {
  if (pipelineOferta === 'todos') return true;
  if (pipelineOferta === 'sem')   return !l.oferta;
  return l.oferta === pipelineOferta;
}

function renderPipelineFilter(allLeads) {
  const el = document.getElementById('pipeline-filter');
  if (!el) return;
  const counts = {
    todos:    allLeads.length,
    curso:    allLeads.filter(l => l.oferta === 'curso').length,
    mentoria: allLeads.filter(l => l.oferta === 'mentoria').length,
    sem:      allLeads.filter(l => !l.oferta).length,
  };
  el.innerHTML = PIPELINE_OFERTAS.map(o => `
    <button class="filter-btn ${pipelineOferta === o.key ? 'active' : ''}"
      onclick="setPipelineOferta('${o.key}')">
      ${o.icon ? o.icon + ' ' : ''}${o.label}
      <span class="filter-count">${counts[o.key]}</span>
    </button>`).join('');
}

async function renderPipeline() {
  const allLeads = await getLeads();
  renderPipelineFilter(allLeads);

  const leads  = allLeads.filter(leadMatchOferta);
  const kanban = document.getElementById('kanban');
  const total  = calcTotalPipeline(leads);

  const proj = document.getElementById('pipeline-projection');
  if (proj) {
    proj.textContent = `💰 Pipeline projetado: R$ ${Math.round(total).toLocaleString('pt-BR')}`;
  }

  kanban.innerHTML = ETAPAS.map(stage => {
    const sl  = leads.filter(l => getEtapa(l) === stage.key);
    const val = sl.filter(l => stage.key !== 'perdida')
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
          ${stage.key !== 'perdida' && val > 0
            ? `<div class="col-value">R$ ${Math.round(val).toLocaleString('pt-BR')}</div>` : ''}
        </div>
        <div class="col-cards" data-stage="${stage.key}">
          ${sl.length
            ? sl.map(l => {
                const wppHref = waLink(l.whatsapp, gerarMensagem(l));
                const dt      = l.createdAt ? new Date(l.createdAt) : null;
                const dtTxt   = dt ? dt.toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit', year:'2-digit' }) + ' ' + dt.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' }) : '';
                const ofIcon  = l.oferta === 'mentoria' ? '🎯' : l.oferta === 'curso' ? '📚' : '';
                return `
                  <div class="mini-card ${l.contatadoEm ? 'contatado' : ''}" data-session-id="${l.sessionId}" onclick="openLead('${l.sessionId}')">
                    <div class="mini-card-top">
                      <div class="mini-name"><span onclick="ciclarTemperatura('${l.sessionId}', event)" title="Temperatura: ${_tempInfo(getTemperatura(l)).label} (clique p/ mudar)" style="cursor:pointer">${_tempInfo(getTemperatura(l)).emoji}</span> ${l.nome || 'Lead'}</div>
                      ${dtTxt ? `<div class="mini-date">${dtTxt}</div>` : ''}
                    </div>
                    <div class="mini-sub">${l.whatsapp || '—'}${ofIcon ? ' · ' + ofIcon : ''}</div>
                    ${l.contatadoEm ? `<div class="mini-sent" title="Clique para desmarcar" onclick="desmarcarContato('${l.sessionId}', event)">✓ Mensagem enviada${l.contatadoEm ? ' · ' + formatDate(l.contatadoEm) : ''}</div>` : ''}
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
                    ${wppHref ? `<a class="mini-wpp-btn ${l.contatadoEm ? 'reenviar' : ''}" href="${wppHref}" onclick="contatarLead('${l.sessionId}', event)">${l.contatadoEm ? '↻ Reenviar' : '💬 Abrir WhatsApp'}</a>` : ''}
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
          setEtapa(sessionId, newStage);   // muda a etapa + re-renderiza
        }
      }
    });
  });
}

