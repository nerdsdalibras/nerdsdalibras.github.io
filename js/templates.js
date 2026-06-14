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

