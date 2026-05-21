// ── ESTADO ──
const lead = {
  sessionId: Date.now() + '-' + Math.random().toString(36).substr(2, 9),
  nome: '', whatsapp: '', instagram: '',
  origem: window.location.href,
  conheceuLorena: false,
  iniciouQuiz: false, concluiuQuiz: false,
  respostaDificuldade: '', respostaObjetivo: '',
  pontuacao: 0, nivelIdentificado: '', resultado: '', grupoIndicado: '',
  status: 'novo', quisAvancar: '', comprouKiwify: false, clicouGrupo: false,
  statusCloser: '', observacoes: '',
};

let quizStep = 0, quizScore = 0;
let q1DifIdx = null, q2ObjIdx = null;
let optSelected = null, currentQuizWrap = null;

// ── CHAT ENGINE ──
const chatBody   = document.getElementById('chat-body');
const typingWrap = document.getElementById('typing-wrap');
const anchor     = document.getElementById('scroll-anchor');

function hora() {
  const d = new Date();
  return d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0');
}
function scrollDown() { anchor.scrollIntoView({ behavior: 'smooth', block: 'end' }); }
function showTyping() { typingWrap.classList.add('show'); scrollDown(); }
function hideTyping() { typingWrap.classList.remove('show'); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function addBubble(html, delay) {
  showTyping();
  const d = delay ?? Math.min(900 + html.replace(/<[^>]+>/g, '').length * 22, 3500);
  await sleep(d);
  hideTyping();
  const wrap = document.createElement('div');
  wrap.className = 'bubble-wrap';
  wrap.innerHTML = `
    <div class="bubble-avatar"><img src="fotos/IMG_4952.jpg" alt="Lorena"/></div>
    <div class="bubble">${html.replace(/\n/g,'<br/>')}<div class="bubble-time">${hora()}</div></div>`;
  chatBody.insertBefore(wrap, typingWrap);
  scrollDown();
  await sleep(150);
}

function addUserBubble(text) {
  const wrap = document.createElement('div');
  wrap.className = 'user-bubble-wrap';
  wrap.innerHTML = `
    <div class="user-bubble">${text}
      <div class="user-bubble-time">${hora()} <span style="color:var(--verde)">✓✓</span></div>
    </div>`;
  chatBody.insertBefore(wrap, typingWrap);
  scrollDown();
}

function addElement(el) {
  chatBody.insertBefore(el, typingWrap);
  scrollDown();
}

// ── FLUXO INICIAL ──
async function startFlow() {
  await sleep(800);
  await addBubble('Oi! Que bom ter você aqui 😊', 1200);
  await addBubble('Antes de começar, posso te apresentar rapidinho quem é a Lorena e como ela vai identificar o seu <strong>nível atual em Libras</strong>?');

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-boas-vindas';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="escolherApresentacao(true)">
      <div class="choice-icon">🌟</div>
      <div><div class="choice-label">Sim, quero conhecer a Lorena</div></div>
    </button>
    <button class="choice-btn" onclick="escolherApresentacao(false)">
      <div class="choice-icon">⚡</div>
      <div><div class="choice-label">Não, quero ir direto para a avaliação</div></div>
    </button>`;
  addElement(wrap);
}

async function escolherApresentacao(sim) {
  document.querySelectorAll('#choices-boas-vindas .choice-btn').forEach(b => b.disabled = true);
  lead.conheceuLorena = sim;

  if (sim) {
    addUserBubble('Sim, quero conhecer a Lorena 🌟');
    await sleep(400);
    await addBubble('A Lorena atua há <strong>15 anos</strong> como tradutora e intérprete de Libras, com experiência na educação em Minas Gerais, universidades estaduais e particulares, órgãos públicos, prefeituras e eventos.');
    await addBubble('Ela é <strong>professora de Libras</strong>, formada em Letras Português/Literatura e em Letras Libras, sócia da Nerds da Libras LTDA e trabalha há 15 anos junto à comunidade surda.');
    await addBubble('Hoje, ela ensina Libras com um método visual inspirado no <em>Método Krashen aplicado à Libras</em>, ajudando o aluno a sair dos sinais soltos e desenvolver comunicação real. 🤟');
    await addBubble('Agora vamos para sua avaliação. Com base nas suas respostas, a Lorena vai identificar o seu <strong>nível atual em Libras</strong> e te mostrar o melhor caminho para evoluir. 🤟');
  } else {
    addUserBubble('Não, quero ir direto para a avaliação ⚡');
    await sleep(400);
    await addBubble('Perfeito! Então vamos direto ao seu diagnóstico.\n\nCom base nas suas respostas, a Lorena vai identificar o seu <strong>nível atual em Libras</strong> e te mostrar o melhor caminho para evoluir. 🤟');
  }

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="iniciarCapturaDados()">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Começar avaliação →</div></div>
    </button>`;
  addElement(wrap);
}

// ── CAPTURA DE DADOS ──
async function iniciarCapturaDados() {
  document.querySelectorAll('.choices-wrap .choice-btn').forEach(b => b.disabled = true);
  await sleep(300);
  await addBubble('Ótimo! Antes de começar, me conta: <strong>qual é o seu nome?</strong>', 1000);

  const formWrap = document.createElement('div');
  formWrap.className = 'data-form-wrap show';
  formWrap.id = 'form-nome';
  formWrap.innerHTML = `
    <input class="data-input" id="input-nome" type="text" placeholder="Seu nome aqui..." maxlength="50" autocomplete="name"
      onkeydown="if(event.key==='Enter')confirmarNome()"/>
    <button class="btn-confirmar" onclick="confirmarNome()">Continuar →</button>`;
  addElement(formWrap);
  setTimeout(() => document.getElementById('input-nome')?.focus(), 200);
}

async function confirmarNome() {
  const inp = document.getElementById('input-nome');
  const nome = (inp?.value || '').trim();
  if (!nome) { inp.style.borderColor = 'rgba(220,50,50,.6)'; inp.placeholder = 'Preciso do seu nome 😊'; return; }
  lead.nome = nome;
  document.getElementById('form-nome').style.display = 'none';
  addUserBubble(nome);
  await sleep(400);
  await addBubble(`Que nome lindo, <strong>${nome}</strong>! 😊 E qual é o seu <strong>WhatsApp</strong>? (com DDD)`, 1200);

  const formWrap = document.createElement('div');
  formWrap.className = 'data-form-wrap show';
  formWrap.id = 'form-wpp';
  formWrap.innerHTML = `
    <input class="data-input" id="input-wpp" type="tel" placeholder="(11) 99999-9999" maxlength="20"
      onkeydown="if(event.key==='Enter')confirmarWpp()"/>
    <button class="btn-confirmar" onclick="confirmarWpp()">Continuar →</button>`;
  addElement(formWrap);
  setTimeout(() => document.getElementById('input-wpp')?.focus(), 200);
}

async function confirmarWpp() {
  const inp = document.getElementById('input-wpp');
  const wpp = (inp?.value || '').trim();
  if (!wpp || wpp.replace(/\D/g,'').length < 8) { inp.style.borderColor = 'rgba(220,50,50,.6)'; inp.placeholder = 'Coloca seu WhatsApp 😊'; return; }
  lead.whatsapp = wpp;
  document.getElementById('form-wpp').style.display = 'none';
  addUserBubble(wpp);
  Storage.upsert({ ...lead });
  await sleep(400);
  await addBubble(`Ótimo! Última coisa: <strong>você tem Instagram?</strong> Se tiver, me passa o @ — a Lorena pode te marcar no resultado 😉`, 1200);

  const formWrap = document.createElement('div');
  formWrap.className = 'data-form-wrap show';
  formWrap.id = 'form-ig';
  formWrap.innerHTML = `
    <input class="data-input" id="input-ig" type="text" placeholder="@seuinstagram (opcional)" maxlength="50" autocomplete="off"
      onkeydown="if(event.key==='Enter')confirmarIg()"/>
    <button class="btn-confirmar" onclick="confirmarIg()">Continuar →</button>
    <button class="btn-confirmar" style="background:transparent;border:1px solid rgba(255,255,255,.15);color:var(--text-sub);font-weight:500" onclick="pularIg()">Não tenho / prefiro pular</button>`;
  addElement(formWrap);
  setTimeout(() => document.getElementById('input-ig')?.focus(), 200);
}

async function confirmarIg() {
  const inp = document.getElementById('input-ig');
  const ig = (inp?.value || '').trim();
  lead.instagram = ig || '';
  document.getElementById('form-ig').style.display = 'none';
  if (ig) addUserBubble(ig);
  await sleep(300);
  await iniciarAposContato();
}

async function pularIg() {
  document.getElementById('form-ig').style.display = 'none';
  lead.instagram = '';
  await sleep(200);
  await iniciarAposContato();
}

async function iniciarAposContato() {
  await addBubble(`Perfeito, <strong>${lead.nome}</strong>! Agora vamos ao diagnóstico. São 12 perguntas rápidas — responde com honestidade e a Lorena vai identificar exatamente em qual nível você está hoje 🎯`, 1500);
  await sleep(400);
  iniciarQuiz();
}

// ── QUIZ ──
function iniciarQuiz() {
  lead.iniciouQuiz = true;
  quizStep = 0; quizScore = 0; q1DifIdx = null; q2ObjIdx = null;
  renderPergunta();
}

function renderPergunta() {
  optSelected = null;
  const q = QUESTIONS[quizStep];
  const n = quizStep + 1;
  const pct = Math.round((n / 12) * 100);

  const wrap = document.createElement('div');
  wrap.className = 'quiz-wrap show';
  wrap.innerHTML = `
    <div class="quiz-progress">
      <span>${n} / 12</span>
      <div class="quiz-bar-track"><div class="quiz-bar-fill" style="width:${pct}%"></div></div>
    </div>
    <div class="quiz-question">${q.text}</div>
    <div id="quiz-opts">
      ${q.opts.map((op, i) => `
        <button class="quiz-opt" onclick="selecionarOpt(${i})" id="opt-${i}">
          <span class="opt-letter">${op.l}</span>
          <span>${op.t}</span>
        </button>`).join('')}
    </div>
    <button class="btn-proximo" id="btn-prox" onclick="proximaPergunta()" disabled>
      ${quizStep < 11 ? 'Próxima →' : 'Ver meu resultado →'}
    </button>`;
  currentQuizWrap = wrap;
  addElement(wrap);
}

function selecionarOpt(idx) {
  optSelected = idx;
  currentQuizWrap.querySelectorAll('.quiz-opt').forEach((b, i) => b.classList.toggle('selected', i === idx));
  const btn = currentQuizWrap.querySelector('.btn-proximo');
  if (btn) btn.disabled = false;
}

async function proximaPergunta() {
  if (optSelected === null) return;
  const q = QUESTIONS[quizStep];
  if (quizStep === 0) { q1DifIdx = optSelected; lead.respostaDificuldade = q.opts[optSelected].t; }
  if (quizStep === 1) { q2ObjIdx = optSelected; lead.respostaObjetivo    = q.opts[optSelected].t; }
  quizScore += q.opts[optSelected].p;

  currentQuizWrap.style.opacity = '.3';
  currentQuizWrap.style.pointerEvents = 'none';
  addUserBubble(q.opts[optSelected].t.replace(/"/g, ''));
  await sleep(400);

  if (quizStep < 11) { quizStep++; renderPergunta(); }
  else await finalizarQuiz();
}

// ── RESULTADO ──
async function finalizarQuiz() {
  lead.concluiuQuiz = true;
  lead.pontuacao = quizScore;
  await sleep(500);
  await addBubble('Recebi suas respostas! 📋', 800);
  await addBubble('Aqui está o seu diagnóstico 🎯', 1000);
  await sleep(400);
  await mostrarResultado();
}

async function mostrarResultado() {
  const nivel  = DecisionEngine.calcularNivel(quizScore, q1DifIdx, q2ObjIdx);
  const status = DecisionEngine.calcularStatus(nivel, q2ObjIdx);
  const oferta = DecisionEngine.getOferta(nivel);

  lead.nivelIdentificado = DecisionEngine.LABELS[nivel];
  lead.resultado         = oferta === 'curso' ? 'Curso' : 'Mentoria';
  lead.grupoIndicado     = oferta === 'curso' ? 'Grupo do Curso' : 'Grupo da Mentoria';
  lead.status            = status;
  lead.statusCloser      = 'Aguardando resposta sobre próximo nível';
  Storage.upsert({ ...lead });

  mostrarCertificado(nivel);
  await sleep(900);

  const explicacoes = {
    basico:        `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>BÁSICO</strong> em Libras. 🌱\n\nIsso significa que você ainda está construindo sua base — aprender sinais em contexto, formar frases simples e ganhar segurança são os seus próximos passos.`,
    intermediario: `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>INTERMEDIÁRIO</strong> em Libras. ✨\n\nVocê já tem contato com a língua — e isso é muito! Mas para consolidar esse conhecimento do jeito certo e avançar de verdade, você precisa de uma base estruturada.`,
    avancado:      `<strong>${lead.nome}</strong>, com base nas suas respostas você já está no nível <strong>AVANÇADO</strong> em Libras. 💜\n\nVocê já tem uma boa base e consegue se comunicar. O próximo passo é desenvolver fluência visual, naturalidade e segurança profissional.`,
  };

  await addBubble(explicacoes[nivel], 2000);
  await sleep(600);

  if (nivel === 'avancado') await mostrarFluxoMentoria();
  else await mostrarFluxoCurso(nivel);
}

function mostrarCertificado(nivel) {
  const conf = {
    basico:        { bg: 'rgba(34,197,94,.07)',  borda: 'rgba(34,197,94,.35)',  cor: '#4ADE80', emoji: '🌱', label: 'BÁSICO'        },
    intermediario: { bg: 'rgba(201,150,58,.07)', borda: 'rgba(201,150,58,.35)', cor: '#E8B96A', emoji: '✨', label: 'INTERMEDIÁRIO' },
    avancado:      { bg: 'rgba(124,58,237,.10)', borda: 'rgba(124,58,237,.35)', cor: '#C4B5FD', emoji: '💜', label: 'AVANÇADO'      },
  };
  const c = conf[nivel];
  const el = document.createElement('div');
  el.className = 'cert-wrap show';
  el.innerHTML = `
    <div class="cert-card" style="background:${c.bg};border:1px solid ${c.borda}">
      <div class="cert-logo">🤟 Nerds da Libras</div>
      <div class="cert-title">Diagnóstico de Nível em Libras</div>
      <div class="cert-nome">${lead.nome}</div>
      <div class="cert-nivel" style="color:${c.cor};background:${c.bg};border:1.5px solid ${c.borda}">${c.emoji} ${c.label}</div>
      <div class="cert-sub">Avaliado pela Prof. Lorena · Nerds da Libras</div>
    </div>`;
  addElement(el);
}

// ── FUNIL CURSO (BÁSICO / INTERMEDIÁRIO) ──
async function mostrarFluxoCurso(nivel) {
  await addBubble('Posso te mostrar como outras alunas que estavam exatamente no seu lugar conseguiram avançar? 👇', 900);
  await sleep(300);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-funil-curso';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="avancarFunilCurso('${nivel}')">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Sim, quero ver</div></div>
    </button>
    <button class="choice-btn" style="opacity:.65" onclick="recusarFunilCurso()">
      <div class="choice-icon">👋</div>
      <div><div class="choice-label">Não, obrigado</div></div>
    </button>`;
  addElement(wrap);
}

async function avancarFunilCurso(nivel) {
  document.querySelectorAll('#choices-funil-curso .choice-btn').forEach(b => b.disabled = true);
  lead.quisAvancar = 'Sim';
  addUserBubble('Sim, quero ver ✅');
  await sleep(400);

  await addBubble('Olha o que a <strong>Carla</strong> me mandou depois de algumas semanas no curso... 🥹', 1000);
  await sleep(300);

  _mostrarDepoimento({
    texto: '"Eu não acreditava que conseguia me comunicar em Libras. Depois do curso da Lorena, consigo ter conversas reais com surdos. Foi transformador."',
    nome: 'Carla M.',
    nivel: 'Era Básico → hoje Intermediário',
    foto: null, // ← substituir por URL de foto real
  });

  await sleep(1000);
  await addBubble('Ela estava exatamente onde você está hoje. 💚', 700);
  await sleep(500);
  await addBubble('Por isso a Lorena preparou uma condição especial para você começar agora 👇', 900);
  await sleep(400);

  _mostrarOfertaCurso(nivel);
  lead.statusCloser = 'Viu a oferta do curso';
  Storage.upsert({ ...lead });
}

async function recusarFunilCurso() {
  document.querySelectorAll('#choices-funil-curso .choice-btn').forEach(b => b.disabled = true);
  addUserBubble('Não, obrigado 👋');
  lead.quisAvancar  = 'Não';
  lead.statusCloser = 'Não quis avançar';
  Storage.upsert({ ...lead });
  await sleep(400);
  await addBubble(`Foi um prazer te conhecer, <strong>${lead.nome}</strong>! 😊\n\nObrigada por participar da avaliação. Quando quiser evoluir na Libras, a Lorena estará aqui. 🤟`);
}

function _mostrarDepoimento({ texto, nome, nivel, foto }) {
  const el = document.createElement('div');
  el.className = 'testimonial-wrap show';
  el.innerHTML = `
    <div class="testimonial-card">
      <div class="testimonial-text">${texto}</div>
      <div class="testimonial-author">
        ${foto
          ? `<img class="testimonial-photo" src="${foto}" alt="${nome}" style="object-fit:cover"/>`
          : `<div class="testimonial-photo" style="display:flex;align-items:center;justify-content:center;font-size:1.3rem">🙋</div>`}
        <div>
          <div class="testimonial-name">${nome}</div>
          <div class="testimonial-nivel">${nivel}</div>
        </div>
      </div>
    </div>`;
  addElement(el);
}

function _mostrarOfertaCurso(nivel) {
  const subtitulo = nivel === 'basico'
    ? 'Do absoluto zero à comunicação com surdos em 30 dias. Sem decorar sinais.'
    : 'Consolide o que você já sabe, preencha as lacunas e avance com estrutura real.';

  const modulos = CONFIG.CURSO_MODULOS.map(m => `<div class="offer-item"><span class="offer-item-icon">✅</span> ${m}</div>`).join('');
  const bonus   = CONFIG.CURSO_BONUS.map(b => `<div class="offer-item"><span class="offer-item-icon">🎁</span> ${b}</div>`).join('');

  const el = document.createElement('div');
  el.className = 'offer-wrap show';
  el.innerHTML = `
    <div class="offer-card">
      <div class="offer-header">
        <div class="offer-badge">🔥 MAIS VENDIDO · Condição especial de hoje</div>
        <div class="offer-title">${CONFIG.CURSO_NOME}</div>
        <div class="offer-subtitle">${subtitulo}</div>
      </div>
      <div class="offer-body">
        <div class="offer-includes">
          <div class="offer-includes-title">O que você recebe</div>
          ${modulos}${bonus}
        </div>
        <div class="offer-price-row">
          <div class="offer-price-from">De <span class="offer-price-strike">${CONFIG.PRECO_CHEIO}</span></div>
          <div class="offer-price-current">${CONFIG.PRECO_OFERTA}</div>
          <div class="offer-price-installment">ou ${CONFIG.PARCELAS} no cartão</div>
        </div>
        <div class="offer-guarantee">
          <div class="offer-guarantee-icon">🛡</div>
          <div>Garantia de <strong>${CONFIG.GARANTIA_DIAS} dias</strong> — se não gostar por qualquer motivo, devolvemos 100% do valor. Sem perguntas.</div>
        </div>
        <a class="btn-kiwify" href="${CONFIG.KIWIFY_URL}" target="_blank" rel="noopener" onclick="registrarCompra('kiwify')">
          🔓 Quero começar agora →
        </a>
        <div class="offer-fallback">
          Ainda com dúvidas? <a href="${CONFIG.WA_CURSO}" target="_blank" rel="noopener" onclick="registrarClique()">Fale com a Lorena antes de decidir</a>
        </div>
      </div>
    </div>`;
  addElement(el);
  scrollDown();
}

// ── FUNIL MENTORIA (AVANÇADO) ──
async function mostrarFluxoMentoria() {
  await addBubble('Quer ir para o próximo nível? 🚀', 700);
  await sleep(300);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-mentoria';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="querMentoria(true)">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Sim, quero saber como a Lorena pode me ajudar</div></div>
    </button>
    <button class="choice-btn" style="opacity:.65" onclick="querMentoria(false)">
      <div class="choice-icon">👋</div>
      <div><div class="choice-label">Não, obrigado</div></div>
    </button>`;
  addElement(wrap);
}

async function querMentoria(sim) {
  document.querySelectorAll('#choices-mentoria .choice-btn').forEach(b => b.disabled = true);

  if (!sim) {
    addUserBubble('Não, obrigado 👋');
    lead.quisAvancar  = 'Não';
    lead.statusCloser = 'Não quis avançar';
    Storage.upsert({ ...lead });
    await sleep(400);
    await addBubble(`Foi um prazer te conhecer, <strong>${lead.nome}</strong>! 😊\n\nObrigada por participar da avaliação. Quando quiser evoluir na Libras, a Lorena estará aqui. 🤟`);
    return;
  }

  lead.quisAvancar = 'Sim';
  addUserBubble('Sim, quero saber como a Lorena pode me ajudar ✅');
  await sleep(500);
  await addBubble(`Ótimo! Para intérpretes que querem avançar de verdade, a Lorena criou a <strong>${CONFIG.MENTORIA_NOME}</strong> — mentoria direta, personalizada, com vagas limitadas. 💜🚀`, 1200);
  await sleep(400);

  _mostrarCardMentoria();
  lead.statusCloser = 'Viu o card da mentoria';
  Storage.upsert({ ...lead });

  await sleep(30000);
  if (!lead.clicouGrupo) {
    lead.statusCloser = 'Chamar no WhatsApp';
    Storage.upsert({ ...lead });
  }
}

function _mostrarCardMentoria() {
  const el = document.createElement('div');
  el.className = 'offer-wrap show';
  el.innerHTML = `
    <div class="offer-card" style="border-color:rgba(124,58,237,.35)">
      <div class="offer-header" style="background:linear-gradient(135deg,#3b0764,#6d28d9)">
        <div class="offer-badge">💜 MENTORIA PROFISSIONAL · O mais desejado pelos intérpretes</div>
        <div class="offer-title">${CONFIG.MENTORIA_NOME}</div>
        <div class="offer-subtitle">Para intérpretes que querem avançar de verdade. Mentoria direta com a Profa. Lorena.</div>
      </div>
      <div class="offer-body">
        <div class="offer-includes">
          <div class="offer-includes-title">O que você recebe</div>
          <div class="offer-item"><span class="offer-item-icon">🎯</span> Mentoria direta com a Profa. Lorena</div>
          <div class="offer-item"><span class="offer-item-icon">📈</span> Evolução acelerada na prática</div>
          <div class="offer-item"><span class="offer-item-icon">🔒</span> Conteúdo exclusivo e estratégico</div>
          <div class="offer-item"><span class="offer-item-icon">⭐</span> Suporte personalizado para intérpretes</div>
        </div>
        <div class="offer-includes" style="margin-top:4px">
          <div class="offer-includes-title">Bônus exclusivo</div>
          ${CONFIG.MENTORIA_BONUS.map(b => `<div class="offer-item"><span class="offer-item-icon">🎁</span> ${b}</div>`).join('')}
        </div>
        <div class="offer-price-row">
          <div class="offer-price-from">De <span class="offer-price-strike">${CONFIG.MENTORIA_PRECO_CHEIO}</span></div>
          <div class="offer-price-current" style="color:#C4B5FD">${CONFIG.MENTORIA_PRECO_OFERTA}</div>
          <div class="offer-price-installment">${CONFIG.MENTORIA_PARCELAS}</div>
        </div>
        <div class="vagas-row"><div class="vagas-dot"></div><span>Apenas <strong>15 vagas</strong> por turma — vagas limitadas</span></div>
        <a class="btn-kiwify" href="${CONFIG.EDUZZ_URL}" target="_blank" rel="noopener"
          style="background:linear-gradient(135deg,#7C3AED,#9B27AF);box-shadow:0 4px 20px rgba(124,58,237,.4)"
          onclick="registrarCompra('eduzz')">
          💜 Quero entrar na Destrava Libras →
        </a>
        <div class="offer-fallback">
          Tem dúvidas? <a href="${CONFIG.WA_MENTORIA}" target="_blank" rel="noopener" onclick="registrarClique()">Fale com a Lorena antes de decidir</a>
        </div>
      </div>
    </div>`;
  addElement(el);
  scrollDown();
}

// ── TRACKING ──
function registrarClique() {
  lead.clicouGrupo  = true;
  lead.statusCloser = 'Entrou no grupo';
  Storage.upsert({ ...lead });
}

function registrarCompra(plataforma) {
  lead.comprouKiwify = true;
  lead.status        = 'comprou';
  lead.statusCloser  = `Clicou comprar (${plataforma === 'eduzz' ? 'Eduzz — Destrava Libras' : 'Kiwify — Do Zero a Libras'})`;
  Storage.upsert({ ...lead });
}

window.addEventListener('beforeunload', () => { if (lead.nome) Storage.syncBeacon({ ...lead }); });
window.addEventListener('DOMContentLoaded', startFlow);
