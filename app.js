// ── ESTADO ──
const lead = {
  sessionId:         Date.now() + '-' + Math.random().toString(36).substr(2, 9),
  nome: '', whatsapp: '',
  origem:            window.location.href,
  genero:            '',
  iniciouQuiz:       false,
  concluiuQuiz:      false,
  respostaDificuldade: '',
  respostaObjetivo:    '',
  objetivo:          '',
  pontuacao:         0,
  nivelIdentificado: '',
  resultado:         '',
  oferta:            '',
  grupoIndicado:     '',
  status:            'novo',
  classificacaoLead: '',
  tempoNoQuiz:       0,
  quisAvancar:       '',
  comprouKiwify:     false,
  clicouCheckout:    false,
  clicouGrupo:       false,
  statusCloser:      '',
  observacoes:       '',
  createdAt:         new Date().toISOString(),
  timestamp:         new Date().toISOString(),
};

let quizStep = 0, quizScore = 0;
let q1DifIdx = null, q2ObjIdx = null;
let optSelected = null, currentQuizWrap = null;
let quizStartTime = null;

// ── DETECÇÃO DE GÊNERO ──
const MASCULINOS_EXCECAO = ['luca', 'nicola', 'joshua', 'elijah', 'ezra'];

function detectarGenero(nome) {
  const primeiro = nome.trim().split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  if (MASCULINOS_EXCECAO.includes(primeiro)) return 'masculino';
  if (primeiro.endsWith('a')) return 'feminino';
  const femininosComuns = [
    'isabel', 'rachel', 'raquel', 'alice', 'diane', 'anne', 'grace',
    'joyce', 'ruth', 'miriam', 'ester', 'debora', 'edith', 'helen',
    'ines', 'simone', 'viviane', 'vivian', 'adriane', 'elaine',
    'eveline', 'irene', 'marlene', 'regiane', 'sueli', 'suely',
    'roseli', 'rosely', 'gisele', 'giseli', 'daniele', 'danieli',
  ];
  if (femininosComuns.includes(primeiro)) return 'feminino';
  return 'masculino';
}

function aplicarTema(genero) {
  lead.genero = genero;
  document.body.classList.remove('tema-feminino', 'tema-masculino');
  document.body.classList.add('tema-' + genero);
}

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
function sleep(ms)    { return new Promise(r => setTimeout(r, ms)); }

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
      <div class="user-bubble-time">${hora()} <span style="color:var(--th-read-clr)">✓✓</span></div>
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
  await addBubble('Oi 👋', 1200);
  await addBubble('Sou a Lorena', 1000);
  await addBubble('Vou te ajudar a descobrir seu nível em Libras 🤟', 1200);
  await sleep(400);
  await addBubble('Antes de começar, me conta: <strong>qual é o seu nome?</strong>', 1000);

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

// ── CAPTURA DE NOME ──
async function confirmarNome() {
  const inp  = document.getElementById('input-nome');
  const nome = (inp?.value || '').trim();
  if (!nome) {
    inp.style.borderColor = 'var(--th-input-foc)';
    inp.placeholder = 'Preciso do seu nome 😊';
    return;
  }
  lead.nome = nome;
  document.getElementById('form-nome').style.display = 'none';
  addUserBubble(nome);

  const genero = detectarGenero(nome);

  await sleep(400);
  await addBubble(`Que nome lindo, <strong>${nome}</strong>! 😍`, 900);

  if (genero === 'feminino') {
    await addBubble('Espera um pouquinho... vou deixar esse espaço do jeitinho certo pra você ✨', 1200);
  } else {
    await addBubble('Espera aí... vou mudar o visual aqui pra você 🎨', 1000);
  }

  aplicarTema(genero);
  await sleep(5000);

  await addBubble('Agora podemos conversar! 😊', 700);
  await sleep(300);
  await addBubble(`E qual é o seu <strong>WhatsApp</strong>? (com DDD)`, 1000);

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

// ── CAPTURA DE WHATSAPP ──
async function confirmarWpp() {
  const inp = document.getElementById('input-wpp');
  const wpp = (inp?.value || '').trim();
  if (!wpp || wpp.replace(/\D/g,'').length < 8) {
    inp.style.borderColor = 'var(--th-input-foc)';
    inp.placeholder = 'Coloca seu WhatsApp 😊';
    return;
  }
  lead.whatsapp  = wpp;
  lead.timestamp = new Date().toISOString();
  document.getElementById('form-wpp').style.display = 'none';
  addUserBubble(wpp);
  Storage.upsert({ ...lead });

  await sleep(400);
  await addBubble('Perfeito! 🤟', 600);
  await sleep(200);
  await addBubble('Posso começar seu diagnóstico agora?', 800);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-micro';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="microCompromisso(true)">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Sim, pode começar!</div></div>
    </button>
    <button class="choice-btn" onclick="microCompromisso(false)">
      <div class="choice-icon">🤔</div>
      <div><div class="choice-label">Quero entender melhor</div></div>
    </button>`;
  addElement(wrap);
}

// ── MICRO COMPROMISSO ──
async function microCompromisso(sim) {
  document.querySelectorAll('#choices-micro .choice-btn').forEach(b => b.disabled = true);

  if (sim) {
    addUserBubble('Sim, pode começar! ✅');
    await sleep(400);
    await addBubble(`Ótimo, <strong>${lead.nome}</strong>! São 7 perguntas rápidas — responde com honestidade e identifico exatamente onde você está em Libras hoje 🎯`, 1500);
    await sleep(400);
    iniciarQuiz();
  } else {
    addUserBubble('Quero entender melhor 🤔');
    await sleep(400);
    await addBubble('Claro! 😊', 600);
    await addBubble('Vou te fazer <strong>7 perguntas rápidas</strong> sobre sua experiência com Libras.\n\nCom base nas suas respostas, identifico seu nível atual e te mostro o melhor caminho para evoluir de verdade.', 1800);
    await sleep(400);
    await addBubble('Não tem resposta certa ou errada — só responda o que é verdadeiro pra você. 🤟', 1200);
    await sleep(400);

    const wrap = document.createElement('div');
    wrap.className = 'choices-wrap show';
    wrap.id = 'choices-micro2';
    wrap.innerHTML = `
      <button class="choice-btn" onclick="iniciarQuizDireto()">
        <div class="choice-icon">✅</div>
        <div><div class="choice-label">Entendi! Pode começar →</div></div>
      </button>`;
    addElement(wrap);
  }
}

async function iniciarQuizDireto() {
  document.querySelectorAll('#choices-micro2 .choice-btn').forEach(b => b.disabled = true);
  addUserBubble('Entendi! Pode começar →');
  await sleep(400);
  iniciarQuiz();
}

// ── QUIZ ──
function iniciarQuiz() {
  lead.iniciouQuiz = true;
  quizStep = 0; quizScore = 0; q1DifIdx = null; q2ObjIdx = null;
  quizStartTime = Date.now();
  renderPergunta();
}

function renderPergunta() {
  optSelected = null;
  const q   = QUESTIONS[quizStep];
  const n   = quizStep + 1;
  const tot = QUESTIONS.length;
  const pct = Math.round((n / tot) * 100);

  const wrap = document.createElement('div');
  wrap.className = 'quiz-wrap show';
  wrap.innerHTML = `
    <div class="quiz-progress">
      <span>${n} / ${tot}</span>
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
      ${quizStep < tot - 1 ? 'Próxima →' : 'Ver meu resultado →'}
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
  if (quizStep === 1) { q2ObjIdx = optSelected; lead.respostaObjetivo = q.opts[optSelected].t; lead.objetivo = q.opts[optSelected].t; }
  quizScore += q.opts[optSelected].p;

  currentQuizWrap.style.opacity = '.3';
  currentQuizWrap.style.pointerEvents = 'none';
  addUserBubble(q.opts[optSelected].t.replace(/"/g, ''));

  await sleep(400);
  await addBubble(q.micro[optSelected], 900);

  if (q.depositoEmocional) {
    await sleep(400);
    const sfx = lead.genero === 'feminino' ? 'a' : 'o';
    await addBubble(`${lead.nome}, isso que você está sentindo é muito mais comum do que imagina...\n\nA maioria das pessoas que estudam Libras chega nesse ponto. A diferença entre quem evolui e quem fica parad${sfx} é o <strong>método certo</strong>. 🔑`, 2200);
    await sleep(300);
  }

  await sleep(300);

  if (quizStep < QUESTIONS.length - 1) {
    quizStep++;
    renderPergunta();
  } else {
    await finalizarQuiz();
  }
}

// ── LOADING / TENSÃO ──
async function finalizarQuiz() {
  lead.concluiuQuiz = true;
  lead.pontuacao    = quizScore;
  if (quizStartTime) lead.tempoNoQuiz = Math.round((Date.now() - quizStartTime) / 1000);

  await sleep(600);
  await addBubble('Recebi tudo! 📋', 700);
  await sleep(400);
  await addBubble('Deixa eu analisar suas respostas...', 2200);
  await sleep(500);
  await addBubble('Cruzando com o perfil de mais de 3.000 alunos...', 2500);
  await sleep(600);
  await addBubble('Identificando o seu nível exato...', 2000);
  await sleep(600);
  await insightSequence();
  await mostrarResultado();
}

// ── INSIGHT SEQUENCE ──
async function insightSequence() {
  const travad = lead.genero === 'feminino' ? 'travada' : 'travado';

  await addBubble('Existe um padrão muito claro aqui...', 1800);
  await sleep(400);
  await addBubble(`Você não está ${travad} por falta de sinais. Não é isso.`, 1800);
  await sleep(400);
  await addBubble('O problema real é que a maioria dos cursos ensina Libras como se fosse português com as mãos. E isso trava tudo.', 2200);
  await sleep(500);
  await addBubble('💡 <strong>Libras tem uma estrutura visual própria.</strong> Quando você aprende pelo caminho certo — o pensamento muda, e a fluência vem naturalmente.', 2400);
  await sleep(600);
}

// ── RESULTADO ──
async function mostrarResultado() {
  const nivel   = DecisionEngine.calcularNivel(quizScore, q1DifIdx, q2ObjIdx);
  const status  = DecisionEngine.calcularStatus(nivel, q2ObjIdx);
  const oferta  = DecisionEngine.getOferta(nivel, q2ObjIdx);
  const classif = DecisionEngine.classificarLead(nivel, q2ObjIdx, quizScore);

  lead.nivelIdentificado = DecisionEngine.LABELS[nivel];
  lead.resultado         = oferta === 'curso' ? CONFIG.CURSO_NOME : CONFIG.MENTORIA_NOME;
  lead.oferta            = oferta;
  lead.grupoIndicado     = oferta === 'curso' ? 'Grupo do Curso' : 'Grupo da Mentoria';
  lead.status            = status;
  lead.classificacaoLead = classif;
  lead.statusCloser      = 'Aguardando resposta sobre próximo nível';
  Storage.upsert({ ...lead });

  await addBubble('Aqui está o seu diagnóstico 🎯', 1000);
  await sleep(400);

  mostrarCertificado(nivel);
  await sleep(900);

  const explicacoes = {
    basico:        `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>BÁSICO</strong> em Libras. 🌱\n\nVocê ainda está construindo sua base — aprender sinais em contexto, formar frases simples e ganhar segurança são os seus próximos passos.`,
    intermediario: `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>INTERMEDIÁRIO</strong> em Libras. ✨\n\nVocê já tem contato com a língua — e isso é muito! Mas para consolidar esse conhecimento do jeito certo e avançar de verdade, você precisa de uma estrutura real.`,
    avancado:      `<strong>${lead.nome}</strong>, com base nas suas respostas você já está no nível <strong>AVANÇADO</strong> em Libras. 💜\n\nVocê já tem base e consegue se comunicar. O próximo passo é destravar fluência visual, naturalidade e segurança profissional.`,
  };

  await addBubble(explicacoes[nivel], 2000);
  await sleep(600);

  if (oferta === 'mentoria') await mostrarFluxoMentoria();
  else await mostrarFluxoCurso(nivel);
}

function mostrarCertificado(nivel) {
  const conf = {
    basico:        { bg: 'rgba(34,197,94,.07)',  borda: 'rgba(34,197,94,.35)',  cor: '#4ADE80', emoji: '🌱', label: 'BÁSICO'        },
    intermediario: { bg: 'rgba(201,150,58,.07)', borda: 'rgba(201,150,58,.35)', cor: '#E8B96A', emoji: '✨', label: 'INTERMEDIÁRIO' },
    avancado:      { bg: 'rgba(124,58,237,.10)', borda: 'rgba(124,58,237,.35)', cor: '#C4B5FD', emoji: '💜', label: 'AVANÇADO'      },
  };
  const c  = conf[nivel];
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

// ── FUNIL CURSO ──
async function mostrarFluxoCurso(nivel) {
  const ref = nivel === 'basico'
    ? 'construir uma base sólida do jeito certo'
    : 'consolidar seu conhecimento e avançar de verdade';

  await addBubble(`Você precisa de <strong>${ref}</strong>. E tenho pessoas que estavam exatamente onde você está hoje... 👇`, 1200);
  await sleep(300);
  await addBubble('Quer ver o que acontece com quem usa o método certo? 👇', 900);
  await sleep(300);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-funil-curso';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="avancarFunilCurso('${nivel}')">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Quero ver pessoas nesse nível</div></div>
    </button>`;
  addElement(wrap);
}

async function avancarFunilCurso(nivel) {
  document.querySelectorAll('#choices-funil-curso .choice-btn').forEach(b => b.disabled = true);
  lead.quisAvancar = 'Sim';
  addUserBubble('Quero ver pessoas nesse nível ✅');
  await sleep(400);

  await addBubble('Olha o que a <strong>Carla</strong> me mandou depois de algumas semanas no curso... 🥹', 1000);
  await sleep(300);

  _mostrarDepoimento({
    texto: '"Eu não acreditava que conseguia me comunicar em Libras. Depois do curso da Lorena, consigo ter conversas reais com surdos. Foi transformador."',
    nome: 'Carla M.',
    nivel: 'Era Básico → hoje Intermediário',
  });

  await sleep(1000);
  await addBubble('Ela estava exatamente onde você está hoje. 💚', 700);
  await sleep(500);
  await addBubble('Agora que você viu isso...', 800);
  await sleep(400);
  await addBubble('Por isso preparei uma condição especial para você começar agora 👇', 900);
  await sleep(400);

  _mostrarOfertaCurso(nivel);
  lead.statusCloser = 'Viu a oferta do curso';
  Storage.upsert({ ...lead });
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
    ? 'Do absoluto zero à comunicação com surdos. Pensamento visual, não tradução.'
    : 'Consolide sua base, preencha as lacunas e avance com estrutura real.';

  const modulos = CONFIG.CURSO_MODULOS.map(m => `<div class="offer-item"><span class="offer-item-icon">✅</span> ${m}</div>`).join('');
  const bonus   = CONFIG.CURSO_BONUS.map(b   => `<div class="offer-item"><span class="offer-item-icon">🎁</span> ${b}</div>`).join('');

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
        <a class="btn-secundario" href="${CONFIG.WA_CURSO}" target="_blank" rel="noopener" onclick="registrarClique()">
          💬 Falar com a Lorena antes
        </a>
      </div>
    </div>`;
  addElement(el);
  scrollDown();
}

// ── FUNIL MENTORIA ──
async function mostrarFluxoMentoria() {
  await addBubble('Você já tem base, mas precisa <strong>destravar fluência e interpretação</strong>. 💜', 1000);
  await sleep(400);
  await addBubble('Posso te mostrar como outras pessoas nesse nível avançaram de verdade? 👇', 900);
  await sleep(300);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-mentoria';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="querMentoria()">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Quero ver pessoas nesse nível</div></div>
    </button>`;
  addElement(wrap);
}

async function querMentoria() {
  document.querySelectorAll('#choices-mentoria .choice-btn').forEach(b => b.disabled = true);
  lead.quisAvancar = 'Sim';
  addUserBubble('Quero ver pessoas nesse nível ✅');
  await sleep(500);

  await addBubble('Olha o que a <strong>Juliana</strong> me mandou depois de entrar na mentoria... 🥹', 1000);
  await sleep(300);

  _mostrarDepoimento({
    texto: '"Eu achava que já sabia tudo de Libras. Mas com a Lorena descobri lacunas que nem sabia que tinha. Em 3 meses minha interpretação mudou completamente."',
    nome: 'Juliana R.',
    nivel: 'Intermediário → Fluência profissional',
  });

  await sleep(1000);
  await addBubble('Ela estava exatamente no seu nível. 💜', 700);
  await sleep(500);
  await addBubble('Agora que você viu isso...', 800);
  await sleep(400);
  await addBubble(`Para quem já tem base e quer avançar de verdade, criei a <strong>${CONFIG.MENTORIA_NOME}</strong> — mentoria direta, personalizada, com vagas limitadas. 💜🚀`, 1400);
  await sleep(400);

  _mostrarCardMentoria();
  lead.statusCloser = 'Viu o card da mentoria';
  Storage.upsert({ ...lead });
}

function _mostrarCardMentoria() {
  const el = document.createElement('div');
  el.className = 'offer-wrap show';
  el.innerHTML = `
    <div class="offer-card" style="border-color:rgba(124,58,237,.35)">
      <div class="offer-header" style="background:linear-gradient(135deg,#3b0764,#6d28d9)">
        <div class="offer-badge">💜 MENTORIA PROFISSIONAL · Vagas limitadas</div>
        <div class="offer-title">${CONFIG.MENTORIA_NOME}</div>
        <div class="offer-subtitle">Para quem quer destravar fluência e interpretação de verdade.</div>
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
        <div class="vagas-row"><div class="vagas-dot"></div><span>Apenas <strong>15 vagas</strong> por turma — vagas limitadas</span></div>
        <a class="btn-kiwify btn-mentoria-grupo" href="${CONFIG.MENTORIA_EDUZZ_URL}" target="_blank" rel="noopener" onclick="registrarCompraMentoria()">
          🔓 Comprar agora — ${CONFIG.MENTORIA_PRECO_OFERTA} →
        </a>
        <a class="btn-secundario" href="${CONFIG.WA_MENTORIA}" target="_blank" rel="noopener" onclick="registrarClique()">
          💬 Quero a oferta com desconto → Entrar no grupo
        </a>
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
  lead.comprouKiwify  = true;
  lead.clicouCheckout = true;
  lead.status         = 'comprou';
  lead.statusCloser   = `Clicou comprar — ${lead.resultado}`;
  Storage.upsert({ ...lead });
}

function registrarCompraMentoria() {
  lead.comprouKiwify  = true;
  lead.clicouCheckout = true;
  lead.status         = 'comprou';
  lead.statusCloser   = 'Clicou comprar — Mentoria Eduzz (preço cheio)';
  Storage.upsert({ ...lead });
}

window.addEventListener('beforeunload', () => { if (lead.nome) Storage.syncBeacon({ ...lead }); });
window.addEventListener('DOMContentLoaded', startFlow);
