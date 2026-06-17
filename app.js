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
  checkoutEm:        '',
  clicouVSL:         false,
  clicouGrupo:       false,
  statusCloser:      '',
  observacoes:       '',
  createdAt:         new Date().toISOString(),
  timestamp:         new Date().toISOString(),
};

let quizStep = 0, quizScore = 0;
let q1DifIdx = null, q2ObjIdx = null, q6EstudoIdx = null;
let optSelected = null, currentQuizWrap = null;
let quizStartTime = null;
let nomeSignificado = null;
let nivelCalculado = null;

// ── SIGNIFICADOS DE NOMES ──
const NAME_SIGNIFICADOS = {
  // Masculinos
  joao:      { sig: 'João significa "Deus é misericordioso" — o nome do mensageiro da graça', prop: 'você está aqui para levar graça e cura às pessoas ao seu redor' },
  pedro:     { sig: 'Pedro significa "rocha, fundamento firme"', prop: 'você tem a missão de ser apoio e firmeza para quem está ao seu lado' },
  paulo:     { sig: 'Paulo significa "pequeno e humilde" — mas sua missão é enorme', prop: 'quem chega com humildade transforma muito mais do que quem chega com orgulho' },
  lucas:     { sig: 'Lucas significa "o que ilumina"', prop: 'você está aqui para trazer luz ao que outras pessoas ainda não conseguem ver' },
  marcos:    { sig: 'Marcos significa "o guerreiro dedicado"', prop: 'você tem garra e propósito — e isso se reflete em tudo que vai construir' },
  jose:      { sig: 'José significa "Deus acrescentará"', prop: 'tudo que você tocar vai crescer e abençoar quem está ao seu redor' },
  mateus:    { sig: 'Mateus significa "dom de Deus"', prop: 'você é um presente para as pessoas que te cercam — e para a comunidade surda' },
  gabriel:   { sig: 'Gabriel significa "Deus é minha força" — o nome do mensageiro divino', prop: 'você nasceu para ser uma ponte entre dois mundos' },
  rafael:    { sig: 'Rafael significa "Deus cura"', prop: 'seu caminho com a Libras pode ser um instrumento de cura e inclusão' },
  daniel:    { sig: 'Daniel significa "Deus é meu juiz" — o nome do homem de caráter inabalável', prop: 'você tem convicção e firmeza, e isso vai te levar longe' },
  davi:      { sig: 'Davi significa "o amado de Deus"', prop: 'os amados de Deus têm um propósito que vai além do que imaginam' },
  david:     { sig: 'David significa "o amado de Deus"', prop: 'os amados de Deus têm um propósito que vai além do que imaginam' },
  felipe:    { sig: 'Felipe significa "aquele que ama com liberdade"', prop: 'sua trajetória vai impactar muitas vidas — com amor e generosidade' },
  thiago:    { sig: 'Thiago vem de Tiago — "o que caminha ao lado de Deus"', prop: 'você nunca está sozinho nessa jornada, e sua missão tem propósito' },
  carlos:    { sig: 'Carlos significa "homem livre e forte"', prop: 'sua força vai abrir portas que outros não conseguem nem ver' },
  anderson:  { sig: 'Anderson significa "filho do homem — aquele que carrega herança e propósito"', prop: 'você tem algo para deixar de legado no mundo' },
  gustavo:   { sig: 'Gustavo significa "a vara de Deus — o escolhido"', prop: 'você foi escolhido para fazer diferença em tudo que tocar' },
  leonardo:  { sig: 'Leonardo significa "corajoso como um leão"', prop: 'a coragem é o seu maior dom — e ela vai transformar o que você aprender' },
  rodrigo:   { sig: 'Rodrigo significa "famoso pela glória"', prop: 'seu nome já anuncia que você foi feito para brilhar' },
  victor:    { sig: 'Victor significa "vitorioso"', prop: 'sua natureza é vencer, superar e inspirar quem está ao redor' },
  arthur:    { sig: 'Arthur significa "nobre e forte como um urso"', prop: 'nobreza de caráter é o que te move — e vai mover quem você impactar' },
  miguel:    { sig: 'Miguel significa "Quem é como Deus?" — o nome do anjo guerreiro', prop: 'você tem uma força espiritual que vai além do que imagina' },
  henrique:  { sig: 'Henrique significa "chefe do lar, o líder nato"', prop: 'liderança está no seu nome — e vai se manifestar em cada pessoa que você alcançar' },
  matheus:   { sig: 'Matheus significa "dom de Deus"', prop: 'você é um presente para as pessoas que te cercam — e para a comunidade surda' },
  luan:      { sig: 'Luan significa "guerreiro luminoso"', prop: 'você carrega luz e força — e vai iluminar o caminho de quem estiver ao seu redor' },
  // Femininos
  maria:     { sig: 'Maria significa "a amada de Deus" e "senhora soberana"', prop: 'você carrega um nome que atravessou séculos — e seu propósito é eterno' },
  ana:       { sig: 'Ana significa "cheia de graça de Deus"', prop: 'você irradia graça naturalmente, e isso vai tocar quem você ensinar' },
  julia:     { sig: 'Júlia significa "jovem, cheia de energia e propósito"', prop: 'sua energia é um combustível para transformar a vida de quem está ao redor' },
  juliana:   { sig: 'Juliana significa "jovem de espírito, cheia de propósito"', prop: 'sua energia é um combustível para transformar a vida de quem está ao redor' },
  sofia:     { sig: 'Sofia significa "sabedoria" — o dom mais precioso', prop: 'você foi chamada para usar seu conhecimento para iluminar outros' },
  isabela:   { sig: 'Isabela significa "consagrada a Deus"', prop: 'o que você faz com propósito, Deus multiplica — e sua jornada é prova disso' },
  isabel:    { sig: 'Isabel significa "consagrada a Deus"', prop: 'o que você faz com propósito, Deus multiplica — e sua jornada é prova disso' },
  camila:    { sig: 'Camila significa "a que serve com devoção"', prop: 'servir é o seu maior talento — e a Libras vai ampliar esse serviço' },
  fernanda:  { sig: 'Fernanda significa "guerreira corajosa e ousada"', prop: 'você não desiste — e é exatamente isso que vai te fazer avançar' },
  beatriz:   { sig: 'Beatriz significa "a que traz alegria e bênção"', prop: 'onde você chega, o ambiente muda — e a comunidade surda vai sentir isso' },
  larissa:   { sig: 'Larissa significa "a alegre, a radiante"', prop: 'sua alegria é contagiante e vai abrir o coração de quem você se comunicar' },
  amanda:    { sig: 'Amanda significa "digna de ser amada"', prop: 'você foi feita para conexões verdadeiras — e a Libras vai ampliar isso' },
  priscila:  { sig: 'Priscila significa "a honrada" — nome de uma das primeiras líderes cristãs', prop: 'você tem liderança e propósito — e vai marcar quem te conhecer' },
  leticia:   { sig: 'Letícia significa "alegria, júbilo"', prop: 'você espalha leveza onde vai — isso é um dom raro e poderoso' },
  patricia:  { sig: 'Patrícia significa "a nobre, de família ilustre"', prop: 'sua nobreza de caráter é o que vai distinguir tudo que você fizer' },
  carla:     { sig: 'Carla significa "mulher forte e livre"', prop: 'você tem força de sobra — e a Libras vai ser mais um capítulo da sua história' },
  bruna:     { sig: 'Bruna significa "forte e firme como a terra"', prop: 'você tem raízes profundas e um propósito sólido nessa jornada' },
  viviane:   { sig: 'Viviane significa "cheia de vida"', prop: 'sua vitalidade é o que vai fazer cada sinal, cada conversa ganhar vida' },
  simone:    { sig: 'Simone significa "a que ouve" — um dom precioso', prop: 'quem sabe ouvir sabe se comunicar de verdade — e você já tem isso' },
  lorena:    { sig: 'Lorena significa "glória" e vem de uma região conhecida pela nobreza', prop: 'você carrega glória no nome — e isso se reflete no impacto que você causa' },
  claudia:   { sig: 'Cláudia significa "a que zela, a guardiã"', prop: 'você protege e cuida com o coração — e isso vai transformar quem você tocar' },
  sara:      { sig: 'Sara significa "princesa" — a matriarca que mudou a história', prop: 'você tem autoridade e propósito, e seu caminho vai impactar gerações' },
  laura:     { sig: 'Laura significa "vitoriosa, coroada de louros"', prop: 'você nasceu para vencer — e cada passo na Libras é uma prova disso' },
  raquel:    { sig: 'Raquel significa "a de coração puro"', prop: 'sua pureza de intenção vai tocar fundo em quem você se comunicar' },
  rachel:    { sig: 'Rachel significa "a de coração puro"', prop: 'sua pureza de intenção vai tocar fundo em quem você se comunicar' },
  alice:     { sig: 'Alice significa "a verdadeira, a autêntica"', prop: 'autenticidade é rara — e você vai conectar de verdade com a comunidade surda' },
  rebeca:    { sig: 'Rebeca significa "a que prende o coração"', prop: 'você tem o dom de criar laços verdadeiros — e a Libras vai ampliar isso' },
  valentina: { sig: 'Valentina significa "forte, saudável, plena"', prop: 'você tem força interior que vai mover montanhas nessa jornada' },
  gabriela:  { sig: 'Gabriela significa "Deus é minha força" — versão feminina do arcanjo mensageiro', prop: 'você foi chamada para ser mensageira — e a Libras é o idioma do seu propósito' },
  renata:    { sig: 'Renata significa "a que renasceu" — a renovada', prop: 'você está num momento de renovação, e o que vem aí vai transformar tudo' },
  natalia:   { sig: 'Natália significa "nascida no Natal, abençoada"', prop: 'você carrega uma bênção especial — e seu caminho vai refletir isso' },
  adriana:   { sig: 'Adriana significa "a que vem das águas profundas"', prop: 'você tem profundidade e calma — qualidades raras que vão te destacar' },
  jessica:   { sig: 'Jéssica significa "a que enxerga além — a visionária"', prop: 'você vê o que outros não veem — e isso vai guiar seu caminho na Libras' },
  aline:     { sig: 'Aline significa "a nobre, a preciosa"', prop: 'sua nobreza de espírito vai marcar quem tiver o prazer de te conhecer' },
  bianca:    { sig: 'Bianca significa "a pura, a luminosa"', prop: 'você traz luz e clareza onde chega — isso é um dom valioso' },
  vanessa:   { sig: 'Vanessa significa "a borboleta — a que se transforma"', prop: 'transformação é o seu maior dom — e você está no momento exato de voar' },
  elaine:    { sig: 'Elaine significa "a luminosa, a que brilha"', prop: 'você brilha de forma única — e a Libras vai ampliar essa luz' },
};

function getSignificadoNome(nome) {
  const key = nome.trim().split(/\s+/)[0]
    .toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');
  return NAME_SIGNIFICADOS[key] || null;
}

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
  await sleep(4000);
  await addBubble('Sou a Lorena', 1000);
  await sleep(4000);
  await addBubble('Vou te ajudar a descobrir seu nível em Libras 🤟', 1200);
  await sleep(4000);
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
  nomeSignificado = getSignificadoNome(nome);

  await sleep(2000);
  await addBubble(`<strong>${nome.toUpperCase()}</strong>... ✨`, 700);
  await sleep(3000);
  await addBubble('Espera um segundo... 🤔', 900);
  await sleep(3500);
  await addBubble('Seu nome tem algo muito importante...', 1200);
  await sleep(3500);

  if (nomeSignificado) {
    await addBubble(`${nomeSignificado.sig}.\n\nIsso significa que <strong>${nomeSignificado.prop}</strong>. 🙏`, 2500);
  } else {
    await addBubble(`<strong>${nome}</strong> é um nome único — e quem chega até aqui tem um propósito que vai além do que imagina. 🙏`, 2000);
  }

  await sleep(4000);

  if (genero === 'feminino') {
    await addBubble('Espera um pouquinho... vou deixar esse espaço do jeitinho certo pra você ✨', 1200);
  } else {
    await addBubble('Espera aí... vou mudar o visual aqui pra você 🎨', 1000);
  }

  aplicarTema(genero);
  await sleep(5000);

  await addBubble('Bora para a avaliação! Quero muito saber seu nível em Libras 🤟', 1000);
  await sleep(4000);
  await addBubble(`Mas primeiro: qual é o seu <strong>WhatsApp</strong>? (com DDD)`, 1000);

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

  await sleep(2000);
  await addBubble('Perfeito! 🤟', 600);
  await sleep(4000);
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
    await sleep(2000);
    await addBubble(`Ótimo, <strong>${lead.nome}</strong>! São 12 perguntas rápidas — responde com honestidade e identifico exatamente onde você está em Libras hoje 🎯`, 1500);
    await sleep(4000);
    iniciarQuiz();
  } else {
    addUserBubble('Quero entender melhor 🤔');
    await sleep(2000);
    await addBubble('Claro! 😊', 600);
    await sleep(4000);
    await addBubble('Vou te fazer <strong>12 perguntas rápidas</strong> sobre sua experiência com Libras.\n\nCom base nas suas respostas, identifico seu nível atual e te mostro o melhor caminho para evoluir de verdade.', 1800);
    await sleep(4000);
    await addBubble('Não tem resposta certa ou errada — só responda o que é verdadeiro pra você. 🤟', 1200);
    await sleep(4000);

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
  await sleep(2000);
  iniciarQuiz();
}

// ── QUIZ ──
function iniciarQuiz() {
  lead.iniciouQuiz = true;
  quizStep = 0; quizScore = 0;
  q1DifIdx = null; q2ObjIdx = null; q6EstudoIdx = null;
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
  if (quizStep === 5) { q6EstudoIdx = optSelected; }
  quizScore += q.opts[optSelected].p;

  currentQuizWrap.style.opacity = '.3';
  currentQuizWrap.style.pointerEvents = 'none';
  addUserBubble(q.opts[optSelected].t.replace(/"/g, ''));

  await sleep(2000);
  await addBubble(q.micro[optSelected], 900);

  if (q.depositoEmocional) {
    await sleep(3000);
    const sfx = lead.genero === 'feminino' ? 'a' : 'o';
    await addBubble(`${lead.nome}, isso que você está sentindo é muito mais comum do que imagina...\n\nA maioria das pessoas que estudam Libras chega nesse ponto. A diferença entre quem evolui e quem fica parad${sfx} é o <strong>método certo</strong>. 🔑`, 2200);
  }

  await sleep(2000);

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

  await sleep(3000);
  await addBubble('Recebi tudo! 📋', 700);
  await sleep(4000);
  await addBubble('Deixa eu analisar suas respostas...', 2200);
  await sleep(4000);
  await addBubble('Cruzando com o perfil de mais de 3.000 alunos...', 2500);
  await sleep(4000);
  await addBubble('Identificando o seu nível exato...', 2000);
  await sleep(4000);
  await insightSequence();
  await mostrarResultado();
}

// ── INSIGHT SEQUENCE ──
async function insightSequence() {
  const travad = lead.genero === 'feminino' ? 'travada' : 'travado';

  await addBubble('Existe um padrão muito claro aqui...', 1800);
  await sleep(4000);
  await addBubble(`Você não está ${travad} por falta de sinais. Não é isso.`, 1800);
  await sleep(4000);
  await addBubble('O problema real é que a maioria dos cursos ensina Libras como se fosse português com as mãos. E isso trava tudo.', 2200);
  await sleep(4000);
  await addBubble('💡 <strong>Libras tem uma estrutura visual própria.</strong> Quando você aprende pelo caminho certo — o pensamento muda, e a fluência vem naturalmente.', 2400);
  await sleep(4000);
}

// ── RESULTADO ──
async function mostrarResultado() {
  const nivel   = DecisionEngine.calcularNivel(quizScore, q1DifIdx, q2ObjIdx);
  const status  = DecisionEngine.calcularStatus(nivel, q2ObjIdx);
  const oferta  = DecisionEngine.getOferta(nivel, q2ObjIdx);
  const classif = DecisionEngine.classificarLead(nivel, q2ObjIdx, quizScore);

  nivelCalculado = nivel;
  lead.nivelIdentificado = DecisionEngine.LABELS[nivel];
  lead.resultado         = oferta === 'curso' ? CONFIG.CURSO_NOME : CONFIG.MENTORIA_NOME;
  lead.oferta            = oferta;
  lead.grupoIndicado     = oferta === 'curso' ? 'Grupo do Curso' : 'Grupo da Mentoria';
  lead.status            = status;
  lead.classificacaoLead = classif;
  lead.statusCloser      = 'Viu o resultado do diagnóstico';
  Storage.upsert({ ...lead });

  await addBubble('Aqui está o seu diagnóstico 🎯', 1000);
  await sleep(3000);

  mostrarCertificado(nivel);
  await sleep(4000);

  const explicacoes = {
    basico:        `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>BÁSICO</strong> em Libras. 🌱\n\nVocê ainda está construindo sua base — aprender sinais em contexto, formar frases simples e ganhar segurança são os seus próximos passos.`,
    intermediario: `<strong>${lead.nome}</strong>, com base nas suas respostas você está no nível <strong>INTERMEDIÁRIO</strong> em Libras. ✨\n\nVocê já tem contato com a língua — e isso é muito! Mas para consolidar esse conhecimento do jeito certo e avançar de verdade, você precisa de uma estrutura real.`,
    avancado:      `<strong>${lead.nome}</strong>, com base nas suas respostas você já está no nível <strong>AVANÇADO</strong> em Libras. 💜\n\nVocê já tem base e consegue se comunicar. O próximo passo é destravar fluência visual, naturalidade e segurança profissional.`,
  };

  await addBubble(explicacoes[nivel], 2000);
  await sleep(5000);
  await iniciarFluxoOferta();
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

// ── FLUXO DE OFERTA UNIFICADO ──
async function iniciarFluxoOferta() {
  if (nivelCalculado !== 'avancado') {
    await fluxoCursoVSL();
  } else {
    await fluxoMentoriaDireto();
  }
}

// ── FLUXO BÁSICO / INTERMEDIÁRIO → VSL DIRETO ──
async function fluxoCursoVSL() {
  await sleep(4000);

  // Explicação detalhada do porquê do diagnóstico
  if (nivelCalculado === 'basico') {
    await addBubble(`Vou te explicar <strong>por que</strong> seu diagnóstico apontou para o nível Básico, <strong>${lead.nome}</strong>...`, 1800);
    await sleep(4000);
    await addBubble('Suas respostas mostram que você ainda está na fase de <strong>reconhecimento de sinais isolados</strong> — sem conseguir formar frases, sem estrutura visual e sem segurança para se comunicar.', 2400);
    await sleep(4000);
    await addBubble('Isso não é falta de esforço. É falta de <strong>caminho certo</strong>.\n\nQuem aprende sinais sem estrutura sempre trava — porque Libras não é uma lista de palavras. É uma língua visual com gramática própria.', 2600);
    await sleep(4000);
    await addBubble('A boa notícia? Quem está no nível Básico e começa pelo caminho certo <strong>avança muito mais rápido</strong> do que imagina. 🌱', 1800);
  } else {
    await addBubble(`Vou te explicar <strong>por que</strong> seu diagnóstico apontou para o nível Intermediário, <strong>${lead.nome}</strong>...`, 1800);
    await sleep(4000);
    await addBubble('Você já tem contato com a Libras — mas suas respostas mostram que você ainda <strong>traduz do português em vez de pensar visualmente.</strong>', 2200);
    await sleep(4000);
    await addBubble('Esse é o bloqueio mais comum nesse nível. Você até sabe alguns sinais, mas na hora de se comunicar de verdade... <strong>troca, gagueja, fica insegura.</strong>\n\nE isso tem causa: a estrutura nunca foi trabalhada do jeito certo.', 2600);
    await sleep(4000);
    await addBubble('A boa notícia? Esse nó tem solução — e quando você desamarra, a fluência vem rápido. ✨', 1600);
  }

  await sleep(4000);
  await addBubble('Agora olha o que a <strong>Carla</strong> me mandou depois de passar por isso... 🥹', 1200);
  await sleep(4000);
  _mostrarDepoimento({
    texto: '"Eu não acreditava que conseguia me comunicar em Libras. Depois do curso da Lorena, consigo ter conversas reais com surdos. Foi transformador."',
    nome: 'Carla M.',
    nivel: 'Era Básico → hoje Intermediário',
  });

  await sleep(5000);
  await addBubble(`E sabe o que mais me emocionou na história da Carla?\n\nEla chegou aqui exatamente como você chegou hoje. Com dúvida. Com insegurança. Sem saber por onde começar. 🙏`, 2400);
  await sleep(4000);

  lead.statusCloser = 'Viu diagnóstico detalhado e depoimento';
  Storage.upsert({ ...lead });

  await addBubble(`<strong>${lead.nome}</strong>, tenho uma oferta especial para você. 🎁`, 1000);
  await sleep(3000);
  await addBubble('Essa oferta <strong>só aparece para quem faz essa avaliação</strong> — é um acesso que não está disponível em nenhum outro lugar.', 1800);
  await sleep(3000);
  await addBubble('Preparei um vídeo curto explicando tudo. Assiste agora 👇', 900);
  await sleep(2000);

  lead.statusCloser = 'Viu card VSL';
  Storage.upsert({ ...lead });

  _mostrarCardVSL();
}

// ── FLUXO AVANÇADO → MENTORIA ──
async function fluxoMentoriaDireto() {
  const prop = nomeSignificado
    ? nomeSignificado.prop
    : 'seu propósito aqui vai além de você';

  await addBubble(`Quer dar o próximo passo, <strong>${lead.nome}</strong>? 🌟\n\nLembra: <em>${prop}</em>...\n\nEssa atitude pode transformar não só a sua vida, mas a de quem você vai alcançar. 💜`, 2800);
  await sleep(4000);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-proximo-passo';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="escolherProximoPasso(true)">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Sim, quero dar o próximo passo!</div></div>
    </button>
    <button class="choice-btn" style="opacity:.65" onclick="escolherProximoPasso(false)">
      <div class="choice-icon">👋</div>
      <div><div class="choice-label">Não, obrigado</div></div>
    </button>`;
  addElement(wrap);
}

async function escolherProximoPasso(sim) {
  document.querySelectorAll('#choices-proximo-passo .choice-btn').forEach(b => b.disabled = true);

  if (!sim) {
    addUserBubble('Não, obrigado 👋');
    lead.quisAvancar  = 'Não';
    lead.statusCloser = 'Não quis avançar';
    Storage.upsert({ ...lead });
    await sleep(3000);
    await addBubble(`Foi um prazer te conhecer, <strong>${lead.nome}</strong>! 😊\n\nObrigada por participar da avaliação. Quando quiser evoluir na Libras, estarei aqui. 🤟`);
    return;
  }

  lead.quisAvancar = 'Sim';
  addUserBubble('Sim, quero dar o próximo passo! ✅');
  await sleep(3000);

  const temFormacao = q6EstudoIdx !== null && q6EstudoIdx >= 3;
  await mostrarSelecaoOferta(temFormacao);
}

async function mostrarSelecaoOferta(temFormacao) {
  if (temFormacao) {
    await addBubble(`Como você já tem formação em Libras, o próximo passo natural é a <strong>${CONFIG.MENTORIA_NOME}</strong> — para se profissionalizar ainda mais e ter clareza total sobre seu caminho. 💜`, 2500);
    await sleep(4000);
    await addBubble(`Mas também tenho o <strong>${CONFIG.CURSO_NOME}</strong> — com certificado de <strong>350 horas válido em todo o Brasil</strong> — para quem quer consolidar a base com uma formação reconhecida. 📜`, 2000);
  } else {
    await addBubble(`Como você ainda está construindo sua base, o <strong>${CONFIG.CURSO_NOME}</strong> é o caminho ideal — com certificado de <strong>350 horas válido em todo o Brasil</strong> e metodologia visual de verdade. 📜`, 2500);
    await sleep(4000);
    await addBubble(`Mas se você sente que já tem base e quer acelerar sua profissionalização, também tenho a <strong>${CONFIG.MENTORIA_NOME}</strong>. 💜`, 2000);
  }

  await sleep(4000);
  await addBubble('Qual faz mais sentido para você agora? 👇', 900);
  await sleep(3000);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-selecao-oferta';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="escolherOferta('curso')">
      <div class="choice-icon">📜</div>
      <div>
        <div class="choice-label">${CONFIG.CURSO_NOME}</div>
        <div class="choice-desc">Certificado 350h nacional · Básico, Intermediário e Avançado</div>
      </div>
    </button>
    <button class="choice-btn" onclick="escolherOferta('mentoria')">
      <div class="choice-icon">💜</div>
      <div>
        <div class="choice-label">${CONFIG.MENTORIA_NOME}</div>
        <div class="choice-desc">Profissionalização · Para o próximo nível</div>
      </div>
    </button>`;
  addElement(wrap);
}

async function escolherOferta(tipo) {
  document.querySelectorAll('#choices-selecao-oferta .choice-btn').forEach(b => b.disabled = true);

  const label = tipo === 'curso' ? `${CONFIG.CURSO_NOME} 📜` : `${CONFIG.MENTORIA_NOME} 💜`;
  addUserBubble(label);

  lead.oferta    = tipo;
  lead.resultado = tipo === 'curso' ? CONFIG.CURSO_NOME : CONFIG.MENTORIA_NOME;
  Storage.upsert({ ...lead });

  await sleep(3000);
  await addBubble(`Ótima escolha! 🎯\n\nVou fazer uma oferta especial para você, <strong>${lead.nome}</strong>. Quer ver? 👇`, 1500);
  await sleep(4000);

  const wrap = document.createElement('div');
  wrap.className = 'choices-wrap show';
  wrap.id = 'choices-ver-oferta';
  wrap.innerHTML = `
    <button class="choice-btn" onclick="verOferta('${tipo}')">
      <div class="choice-icon">✅</div>
      <div><div class="choice-label">Sim, quero ver!</div></div>
    </button>
    <button class="choice-btn" style="opacity:.65" onclick="recusarOferta()">
      <div class="choice-icon">👋</div>
      <div><div class="choice-label">Não, obrigado</div></div>
    </button>`;
  addElement(wrap);
}

async function verOferta(tipo) {
  document.querySelectorAll('#choices-ver-oferta .choice-btn').forEach(b => b.disabled = true);
  addUserBubble('Sim, quero ver! ✅');

  const depoimento = tipo === 'curso'
    ? { texto: '"Eu não acreditava que conseguia me comunicar em Libras. Depois do curso da Lorena, consigo ter conversas reais com surdos. Foi transformador."', nome: 'Carla M.', nivel: 'Era Básico → hoje Intermediário' }
    : { texto: '"Eu achava que já sabia tudo de Libras. Mas com a Lorena descobri lacunas que nem sabia que tinha. Em 3 meses minha interpretação mudou completamente."', nome: 'Juliana R.', nivel: 'Intermediário → Fluência profissional' };

  await sleep(3000);
  await addBubble(`Olha o que ${tipo === 'curso' ? 'a <strong>Carla</strong>' : 'a <strong>Juliana</strong>'} me mandou... 🥹`, 1000);
  await sleep(4000);
  _mostrarDepoimento(depoimento);

  await sleep(5000);

  const prop = nomeSignificado
    ? nomeSignificado.prop
    : 'seu propósito vai além de você';
  await addBubble(`Lembra, <strong>${lead.nome}</strong>: <em>${prop}</em>.\n\nCada passo que você der vai impactar quem está ao seu redor. 🌟`, 2200);
  await sleep(4000);
  await addBubble('Agora que você viu isso...', 800);
  await sleep(3000);
  await addBubble('Preparei uma condição especial para você começar agora 👇', 900);
  await sleep(3000);

  lead.statusCloser = `Viu a oferta — ${tipo}`;
  Storage.upsert({ ...lead });

  if (tipo === 'curso') {
    _mostrarOfertaCurso(nivelCalculado || 'basico');
    await sleep(2500);
    _mostrarCardVSL();
  } else {
    _mostrarCardMentoria();
  }
}

async function recusarOferta() {
  document.querySelectorAll('#choices-ver-oferta .choice-btn').forEach(b => b.disabled = true);
  addUserBubble('Não, obrigado 👋');
  lead.statusCloser = 'Não quis ver a oferta';
  Storage.upsert({ ...lead });
  await sleep(3000);
  await addBubble(`Tudo bem, <strong>${lead.nome}</strong>! 😊\n\nQuando estiver pronto(a), pode voltar aqui a qualquer momento. Estarei te esperando. 🤟`);
}

// ── HELPERS DE OFERTA ──
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
        <div class="offer-email-capture" style="margin:4px 0 12px;text-align:left">
          <label style="display:block;font-size:.84rem;font-weight:700;margin-bottom:6px;color:#1f2937">
            📧 Seu melhor e-mail para receber o acesso
          </label>
          <input id="offer-email-input" type="email" inputmode="email" autocomplete="email"
            placeholder="seuemail@exemplo.com" value="${lead.email || ''}"
            oninput="document.getElementById('offer-email-err').style.display='none';this.style.borderColor='#d1d5db'"
            style="width:100%;padding:13px 14px;border:1.5px solid #d1d5db;border-radius:12px;font-size:1rem;box-sizing:border-box;outline:none"/>
          <div id="offer-email-err" style="display:none;color:#dc2626;font-size:.78rem;margin-top:6px;font-weight:600">
            ⚠️ Por favor, informe um e-mail válido para continuar.
          </div>
        </div>
        <a class="btn-kiwify" href="${CONFIG.KIWIFY_URL}" target="_blank" rel="noopener" onclick="return irParaCheckout('kiwify', event)">
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
        <div class="offer-price-row">
          <div class="offer-price-from">Investimento a partir de</div>
          <div class="offer-price-current">${CONFIG.MENTORIA_PRECO_OFERTA}</div>
          <div class="offer-price-installment">Mas quem entrar no grupo recebe uma oferta que vai valer muito a pena 👇</div>
        </div>
        <div class="vagas-row"><div class="vagas-dot"></div><span>Apenas <strong>15 vagas</strong> por turma — vagas limitadas</span></div>
        <a class="btn-kiwify btn-mentoria-grupo" href="${CONFIG.WA_MENTORIA}" target="_blank" rel="noopener" onclick="registrarClique()">
          💬 Entrar no grupo agora →
        </a>
      </div>
    </div>`;
  addElement(el);
  scrollDown();
}

function _mostrarCardVSL() {
  const vslUrl = 'https://www.clubedalibras.com/vsl?s=' + encodeURIComponent(lead.sessionId);
  const el = document.createElement('div');
  el.className = 'vsl-wrap show';
  el.innerHTML = `
    <div class="vsl-card">
      <div class="vsl-header">
        <div class="vsl-badge">🔥 Exclusivo</div>
        <div class="vsl-tag">Só para quem fez a avaliação</div>
      </div>
      <div class="vsl-thumb" onclick="registrarCliqueVSL();window.location.href='${vslUrl}'" style="cursor:pointer">
        <div class="vsl-thumb-bg"></div>
        <div class="vsl-play">
          <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
        </div>
        <div class="vsl-thumb-label">▶ Assistir agora</div>
      </div>
      <div class="vsl-body">
        <div class="vsl-title">Você vai se arrepender se não ver <span class="orange">esse vídeo</span> — confia em mim</div>
        <div class="vsl-sub">A Lorena gravou um vídeo especial para quem está <strong>exatamente no seu nível</strong>. É curto, direto e pode mudar completamente o seu caminho em Libras.</div>
        <a class="btn-vsl" href="${vslUrl}" onclick="registrarCliqueVSL()">
          ▶ Quero ver o vídeo agora
        </a>
        <div class="vsl-disclaimer">Gratuito · Sem cadastro · Menos de 10 minutos</div>
      </div>
    </div>`;
  addElement(el);
  scrollDown();
}

// ── TRACKING ──
function registrarCliqueVSL() {
  lead.clicouVSL    = true;
  lead.statusCloser = 'Clicou no vídeo VSL';
  Storage.upsert({ ...lead });
}

function registrarClique() {
  lead.clicouGrupo  = true;
  lead.statusCloser = 'Entrou no grupo';
  Storage.upsert({ ...lead });
}

// Clicar no botão de comprar NÃO confirma a compra — só registra que o lead
// foi para o checkout. A confirmação real vem do webhook da Kiwify.
// Assim conseguimos detectar carrinho abandonado (clicou mas não pagou).
function registrarCompra(plataforma) {
  lead.clicouCheckout = true;
  lead.checkoutEm     = new Date().toISOString();
  lead.statusCloser   = `Foi para o checkout (${lead.resultado}) — aguardando pagamento`;
  Storage.upsert({ ...lead });
}

// Exige um e-mail válido antes de mandar o lead para o checkout.
// Salva o e-mail no lead, registra o checkout e abre a página de pagamento.
function irParaCheckout(plataforma, e) {
  const input = document.getElementById('offer-email-input');
  const email = (input ? input.value : '').trim();
  const valido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  if (!valido) {
    if (e) e.preventDefault();
    const err = document.getElementById('offer-email-err');
    if (err) err.style.display = 'block';
    if (input) { input.style.borderColor = '#dc2626'; input.focus(); }
    return false;
  }
  lead.email = email;
  registrarCompra(plataforma);                 // grava clicouCheckout/checkoutEm + e-mail
  window.open(CONFIG.KIWIFY_URL, '_blank', 'noopener');
  if (e) e.preventDefault();                    // já abrimos a aba manualmente
  return false;
}

function registrarCompraMentoria() {
  lead.clicouCheckout = true;
  lead.checkoutEm     = new Date().toISOString();
  lead.statusCloser   = 'Foi para o checkout (Mentoria) — aguardando pagamento';
  Storage.upsert({ ...lead });
}

window.addEventListener('beforeunload', () => { if (lead.nome) Storage.syncBeacon({ ...lead }); });
window.addEventListener('DOMContentLoaded', startFlow);
