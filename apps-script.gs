// ═══════════════════════════════════════════════════
//  NERDS DA LIBRAS — Google Apps Script v3.2
//  Cole este código e publique como nova versão
// ═══════════════════════════════════════════════════

// Nomes possíveis da aba de leads (tenta cada um)
const SHEET_NAMES = ['LEADS', 'Leads', 'leads', 'Lead'];

// Mapeamento: nome da coluna na planilha → campo JS usado no dashboard
const COL_TO_FIELD = {
  'Data':             'createdAt',
  'Nome':             'nome',
  'WhatsApp':         'whatsapp',
  'Email':            'email',
  'Instagram':        'instagram',
  'Origem':           'origem',
  'Conheceu Lorena':  'conheceuLorena',
  'Iniciou Quiz':     'iniciouQuiz',
  'Concluiu Quiz':    'concluiuQuiz',
  'Dificuldade Q1':   'respostaDificuldade',
  'Objetivo Q2':      'respostaObjetivo',
  'Objetivo':         'objetivo',
  'Pontuação':        'pontuacao',
  'Nível':            'nivelIdentificado',
  'Resultado':        'resultado',
  'Quis Avançar':     'quisAvancar',
  // ── Rastreamento de etapas do quiz (quiz-libras) ──
  'etapaQuiz':        'etapaQuiz',        // etapa mais avançada que o lead alcançou
  'experiencia':      'experiencia',      // resposta aberta sobre a experiência em Libras
  'respostasQuiz':    'respostasQuiz',    // JSON com cada resposta do quiz
  'interesseCAS':     'interesseCAS',     // quer a banca do CAS-MG (sim/nao)
  'clicouOferta':     'clicouOferta',     // clicou no botão da oferta no fim do quiz
  'plataformaOferta': 'plataformaOferta', // kiwify | eduzz | grupo
  'ofertaEm':         'ofertaEm',
  'campanhaAbriuEm':  'campanhaAbriuEm',  // abriu o último e-mail de campanha em
  // ── Aquisição (origem / UTM / first-last touch) ──
  'utmSource':        'utmSource',
  'utmMedium':        'utmMedium',
  'utmCampaign':      'utmCampaign',
  'utmContent':       'utmContent',
  'utmTerm':          'utmTerm',
  'firstTouch':       'firstTouch',
  'firstTouchEm':     'firstTouchEm',
  'lastTouch':        'lastTouch',
  'landingPage':      'landingPage',
  'referrer':         'referrer',
  // Colunas novas (serão criadas automaticamente se não existirem)
  'sessionId':        'sessionId',
  'genero':           'genero',
  'oferta':           'oferta',
  'Grupo Indicado':   'grupoIndicado',
  'classificacaoLead':'classificacaoLead',
  'status':           'status',
  'statusCloser':     'statusCloser',
  'observacoes':      'observacoes',
  'comprouKiwify':    'comprouKiwify',
  'valorPago':        'valorPago',        // total pago pelo cliente (soma das compras)
  'ultimaCompraEm':   'ultimaCompraEm',
  'clicouVSL':        'clicouVSL',
  'clicouGrupo':      'clicouGrupo',
  'clicouCheckout':   'clicouCheckout',
  'checkoutEm':       'checkoutEm',
  // ── Eventos da Kiwify (webhook) ──
  'kiwifyEvento':     'kiwifyEvento',     // último evento recebido (texto)
  'kiwifyEventoEm':   'kiwifyEventoEm',   // quando chegou
  'boletoGerado':     'boletoGerado',
  'pixGerado':        'pixGerado',
  'carrinhoKiwify':   'carrinhoKiwify',   // carrinho abandonado detectado pela Kiwify
  'cartaoRecusado':   'cartaoRecusado',
  'recusadoEm':       'recusadoEm',
  'reembolso':        'reembolso',
  'reembolsoEm':      'reembolsoEm',
  'chargeback':       'chargeback',
  'chargebackEm':     'chargebackEm',
  // ── Rastreamento detalhado do VSL ──
  'vslIniciou':       'vslIniciou',
  'vslPct25':         'vslPct25',
  'vslPct50':         'vslPct50',
  'vslPct75':         'vslPct75',
  'vslAssistiuFim':   'vslAssistiuFim',
  'vslClicouCTA':     'vslClicouCTA',
  // ── E-mail remarketing ──
  'email1SentAt':     'email1SentAt',
  'email2SentAt':     'email2SentAt',
  'email3SentAt':     'email3SentAt',
  // ── WhatsApp remarketing (sequência manual + API oficial) ──
  'waSeqStart':       'waSeqStart',
  'waMsg1SentAt':     'waMsg1SentAt',
  'waMsg2SentAt':     'waMsg2SentAt',
  'waMsg3SentAt':     'waMsg3SentAt',
  'tempoNoQuiz':      'tempoNoQuiz',
  'updatedAt':        'updatedAt',
};

// Mapeamento inverso: campo JS → nome da coluna
const FIELD_TO_COL = {};
for (var k in COL_TO_FIELD) { FIELD_TO_COL[COL_TO_FIELD[k]] = k; }

// Novas colunas que precisam existir para o sistema funcionar
const NEW_COLS = [
  'Email','Objetivo','Quis Avançar',
  'etapaQuiz','experiencia','respostasQuiz','interesseCAS','clicouOferta','plataformaOferta','ofertaEm','campanhaAbriuEm',
  'utmSource','utmMedium','utmCampaign','utmContent','utmTerm','firstTouch','firstTouchEm','lastTouch','landingPage','referrer',
  'sessionId','genero','oferta','Grupo Indicado','classificacaoLead',
  'status','statusCloser','observacoes',
  'comprouKiwify','valorPago','ultimaCompraEm','clicouVSL','clicouGrupo','clicouCheckout','checkoutEm',
  'kiwifyEvento','kiwifyEventoEm',
  'boletoGerado','pixGerado','carrinhoKiwify',
  'cartaoRecusado','recusadoEm','reembolso','reembolsoEm','chargeback','chargebackEm',
  'vslIniciou','vslPct25','vslPct50','vslPct75','vslAssistiuFim','vslClicouCTA',
  'email1SentAt','email2SentAt','email3SentAt',
  'waSeqStart','waMsg1SentAt','waMsg2SentAt','waMsg3SentAt',
  'tempoNoQuiz','updatedAt'
];

// ── ENTRADA POST ──────────────────────────────────
function doPost(e) {
  try {
    var raw = e && e.postData ? e.postData.contents : '{}';
    var data;
    try { data = JSON.parse(raw); }
    catch (_) { data = _parseForm(e); }   // Eduzz pode enviar form-urlencoded

    // Envio manual de e-mail em massa, disparado pelo CRM
    if (data && data.action === 'sendEmails' && data.sessionIds) {
      var nEnv = enviarEmailParaLeads(data.sessionIds, data.emailNum || 1);
      return respond({ ok: true, sent: nEnv });
    }

    // Campanha: e-mail PERSONALIZADO (assunto + corpo escritos no CRM) para uma lista
    if (data && data.action === 'broadcast' && data.sessionIds && data.subject) {
      var nBc = enviarBroadcast(data.sessionIds, data.subject, data.body || '', data.label || '');
      return respond({ ok: true, sent: nBc });
    }

    // Config na nuvem (produtos, campanhas de marketing, etc.)
    if (data && data.action === 'saveConfig' && data.key) {
      _saveConfig(data.key, data.value);
      return respond({ ok: true });
    }

    // Webhook da Eduzz (Mentoria) — checa antes da Kiwify pois tem campos próprios
    if (isEduzzPayload(data)) {
      _logWebhook('eduzz', raw);
      handleEduzzWebhook(data);
      return respond({ ok: true, source: 'eduzz' });
    }

    // Webhook da Kiwify (qualquer evento: compra, recusa, boleto, pix, carrinho...)
    if (isKiwifyPayload(data)) {
      _logWebhook('kiwify', raw);
      handleKiwifyWebhook(data);
      return respond({ ok: true, source: 'kiwify' });
    }

    // Dados do lead vindo do quiz / beacon do VSL
    if (data.sessionId || data.nome) {
      upsertLead(data);
      return respond({ ok: true, source: 'lead' });
    }

    _logWebhook('desconhecido', raw);
    return respond({ ok: true });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// Lê payload enviado como application/x-www-form-urlencoded (parâmetros do form)
function _parseForm(e) {
  if (e && e.parameter && Object.keys(e.parameter).length) return e.parameter;
  return {};
}

// Registra o webhook bruto numa aba "WebhookLog" (ajuda a depurar formatos novos)
function _logWebhook(source, raw) {
  try {
    var ss  = SpreadsheetApp.getActiveSpreadsheet();
    var log = ss.getSheetByName('WebhookLog') || ss.insertSheet('WebhookLog');
    log.appendRow([new Date(), source, String(raw).slice(0, 4000)]);
  } catch (e) {}
}

// ── ENTRADA GET (dashboard busca leads) ──────────
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || '';
  if (action === 'getLeads') {
    return respond(getAllLeads());
  }
  if (action === 'getCampanhas') {
    return respond(getCampanhas());
  }
  if (action === 'getVendas') {
    return respond(getVendas());
  }
  if (action === 'getConfig') {
    return respond(getConfig());
  }
  // Pixel de abertura de e-mail: registra a abertura e devolve algo mínimo
  if (action === 'open') {
    _registrarAbertura(e.parameter.c, e.parameter.s);
    return ContentService.createTextOutput('').setMimeType(ContentService.MimeType.TEXT);
  }
  return respond({ ok: true, version: '3.3' });
}

function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── LOCALIZAR ABA ─────────────────────────────────
function getSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  for (var i = 0; i < SHEET_NAMES.length; i++) {
    var s = ss.getSheetByName(SHEET_NAMES[i]);
    if (s) return s;
  }
  // Cria nova aba se não encontrar nenhuma
  return ss.insertSheet('Leads');
}

// ── LER CABEÇALHOS ────────────────────────────────
function getHeaders(sheet) {
  var lastCol = sheet.getLastColumn();
  if (lastCol === 0) return [];
  return sheet.getRange(1, 1, 1, lastCol).getValues()[0];
}

// ── GARANTIR NOVAS COLUNAS ───────────────────────
function ensureNewColumns(sheet) {
  var headers = getHeaders(sheet);
  var added   = false;
  for (var i = 0; i < NEW_COLS.length; i++) {
    if (headers.indexOf(NEW_COLS[i]) === -1) {
      headers.push(NEW_COLS[i]);
      sheet.getRange(1, headers.length).setValue(NEW_COLS[i]);
      added = true;
    }
  }
  return getHeaders(sheet);
}

// ── UPSERT LEAD ───────────────────────────────────
function upsertLead(data) {
  var sheet   = getSheet();
  var headers = ensureNewColumns(sheet);
  var lastRow = sheet.getLastRow();

  // Índices das colunas-chave
  var sidCol = headers.indexOf('sessionId');
  var wppCol = headers.indexOf('WhatsApp') >= 0 ? headers.indexOf('WhatsApp') : headers.indexOf('whatsapp');
  var nomCol = headers.indexOf('Nome')     >= 0 ? headers.indexOf('Nome')     : headers.indexOf('nome');

  var existingRow = -1;

  // 1) Tenta encontrar pelo sessionId
  if (sidCol >= 0 && data.sessionId && lastRow > 1) {
    var ids = sheet.getRange(2, sidCol + 1, lastRow - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === data.sessionId) { existingRow = i + 2; break; }
    }
  }

  // 2) Fallback: encontra pelo WhatsApp
  if (existingRow < 0 && wppCol >= 0 && data.whatsapp && lastRow > 1) {
    var phones = sheet.getRange(2, wppCol + 1, lastRow - 1, 1).getValues();
    var clean  = String(data.whatsapp).replace(/\D/g, '');
    for (var j = 0; j < phones.length; j++) {
      var rowPhone = String(phones[j][0] || '').replace(/\D/g, '');
      if (rowPhone && rowPhone.slice(-9) === clean.slice(-9)) {
        existingRow = j + 2; break;
      }
    }
  }

  var now = new Date().toISOString();
  if (!data.createdAt) data.createdAt = now;
  data.updatedAt = now;

  if (existingRow > 0) {
    // Atualiza somente as células que têm valor no data recebido
    for (var h = 0; h < headers.length; h++) {
      var colName  = headers[h];
      var field    = COL_TO_FIELD[colName] || colName;
      var val      = data[field];
      if (val !== undefined && val !== null && val !== '') {
        sheet.getRange(existingRow, h + 1).setValue(val);
      }
    }
  } else {
    // Nova linha
    var row = headers.map(function(colName) {
      var field = COL_TO_FIELD[colName] || colName;
      var val   = data[field];
      if (val === undefined || val === null) return '';
      return val;
    });
    sheet.appendRow(row);
  }
}

// ── DETECTA SE O PAYLOAD É DA KIWIFY ──────────────
function isKiwifyPayload(d) {
  return !!(
    d.webhook_event_type || d.order_id || d.order_status ||
    (d.data && (d.data.order_status || d.data.order_id || d.data.status)) ||
    (d.event && d.data)
  );
}

// ── WEBHOOK KIWIFY (todos os eventos) ─────────────
// Trata: Compra aprovada, Compra recusada, Carrinho abandonado, Boleto gerado,
// Pix gerado, Reembolso e Chargeback. Acha o lead pelo telefone (ou e-mail);
// se não existir, cria um novo (caso a pessoa tenha ido direto pra Kiwify).
// ── VALOR PAGO (receita real) ─────────────────────
// Kiwify manda em CENTAVOS (ex: "39700" = R$ 397,00)
function _valorKiwify(d, data) {
  var c = (d && d.Commissions) || (data && data.Commissions) || {};
  var cands = [
    c.charge_amount, c.product_base_price,
    d.charge_amount, (d.charge && d.charge.amount),
    (d.order && d.order.charge_amount), d.order_value, d.product_value,
    (data && data.charge_amount)
  ];
  for (var i = 0; i < cands.length; i++) {
    var raw = cands[i];
    if (raw === undefined || raw === null || raw === '') continue;
    var n = parseInt(String(raw).replace(/\D/g, ''), 10);   // só dígitos → centavos
    if (n > 0) return n / 100;
  }
  return 0;
}
// Eduzz manda em REAIS (ex: "397.00" ou "1.997,00")
function _valorEduzz(d, data) {
  var cands = [
    d.paid_amount, d.paid_value, d.product_value, d.content_total,
    d.total, d.value, d.trans_value, d.amount,
    (d.sale && d.sale.amount), (data && data.value)
  ];
  for (var i = 0; i < cands.length; i++) {
    var raw = cands[i];
    if (raw === undefined || raw === null || raw === '') continue;
    var s = String(raw).trim();
    if (s.indexOf(',') >= 0 && s.indexOf('.') >= 0) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(',', '.');
    var v = parseFloat(s.replace(/[^0-9.]/g, ''));
    if (v > 0) return v;
  }
  return 0;
}

// Livro de vendas (histórico + LTV). Deduplica pela transId (id do pedido).
function _vendaJaRegistrada(sh, transId) {
  if (!transId || !sh || sh.getLastRow() < 2) return false;
  var ids = sh.getRange(2, 6, sh.getLastRow() - 1, 1).getValues();  // col 6 = TransId
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(transId)) return true;
  return false;
}
// Registra a venda no livro e ACUMULA o valorPago no lead. Retorna o valor (0 se duplicada).
function _registrarVenda(sessionId, email, phone, produto, valor, transId, rowLead, sheetLead, headersLead) {
  if (!valor || valor <= 0) return 0;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Vendas');
    if (!sh) { sh = ss.insertSheet('Vendas'); sh.appendRow(['Data', 'sessionId', 'Email', 'Telefone', 'Produto', 'TransId', 'Valor']); }
    if (transId && _vendaJaRegistrada(sh, transId)) return 0;   // já contabilizada (retry)
    sh.appendRow([new Date(), sessionId || '', email || '', phone || '', produto || '', transId || '', valor]);
  } catch (e) {}
  // Acumula valorPago no lead (soma das compras) + data da última compra
  try {
    if (rowLead > 0 && sheetLead && headersLead) {
      var vpCol = headersLead.indexOf('valorPago');
      if (vpCol >= 0) {
        var atual = parseFloat(String(sheetLead.getRange(rowLead, vpCol + 1).getValue() || 0).toString().replace(',', '.')) || 0;
        sheetLead.getRange(rowLead, vpCol + 1).setValue(atual + valor);
      }
      var ucCol = headersLead.indexOf('ultimaCompraEm');
      if (ucCol >= 0) sheetLead.getRange(rowLead, ucCol + 1).setValue(new Date().toISOString());
    }
  } catch (e) {}
  return valor;
}

// ── CONFIG NA NUVEM (chave→valor JSON) ────────────
// Guarda config do dashboard (produtos, campanhas de marketing) na aba "Config".
function _saveConfig(key, value) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Config');
    if (!sh) { sh = ss.insertSheet('Config'); sh.appendRow(['Chave', 'Valor']); }
    var val  = (typeof value === 'string') ? value : JSON.stringify(value);
    var last = sh.getLastRow();
    var keys = last > 1 ? sh.getRange(2, 1, last - 1, 1).getValues() : [];
    for (var i = 0; i < keys.length; i++) {
      if (String(keys[i][0]) === key) { sh.getRange(i + 2, 2).setValue(val); return; }
    }
    sh.appendRow([key, val]);
  } catch (e) {}
}
function getConfig() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Config');
  if (!sh || sh.getLastRow() < 2) return {};
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 2).getValues();
  var out = {};
  for (var i = 0; i < vals.length; i++) {
    var k = vals[i][0]; if (!k) continue;
    try { out[k] = JSON.parse(vals[i][1]); } catch (e) { out[k] = vals[i][1]; }
  }
  return out;
}

// Lê o livro de vendas (mais recente primeiro) para o dashboard
function getVendas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Vendas');
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getRange(2, 1, sh.getLastRow() - 1, 7).getValues();
  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    out.push({
      data:      vals[i][0] ? new Date(vals[i][0]).toISOString() : '',
      sessionId: vals[i][1], email: vals[i][2], telefone: vals[i][3],
      produto:   vals[i][4], transId: vals[i][5], valor: Number(vals[i][6]) || 0,
    });
  }
  return out;
}

function handleKiwifyWebhook(data) {
  var sheet   = getSheet();
  var headers = ensureNewColumns(sheet);
  var lastRow = sheet.getLastRow();
  var now     = new Date().toISOString();

  // ── Extrai cliente em vários formatos possíveis ──
  var d        = data.data || data;
  var customer = d.customer || data.customer || d.Customer || {};
  var phone = String(customer.mobile || customer.phone || customer.phone_number || d.phone || '').replace(/\D/g, '');
  var email = String(customer.email || d.email || '').toLowerCase().trim();
  var nome  = customer.full_name || customer.name || customer.nome || d.name || '';

  // ── Descobre o evento/status ──
  var ev = String(
    data.webhook_event_type || data.event ||
    d.webhook_event_type || d.event ||
    d.order_status || data.order_status || ''
  ).toLowerCase();

  // ── Classifica o evento e monta o patch ──
  var patch = { kiwifyEvento: ev || 'kiwify', kiwifyEventoEm: now, updatedAt: now };

  if (/approv|aprovad|paid|pago|complet/.test(ev)) {
    patch.status = 'comprou'; patch.comprouKiwify = true; patch.cartaoRecusado = false;
    patch.statusCloser = '✅ Compra confirmada pela Kiwify';
  } else if (/refund|reembols/.test(ev)) {
    patch.reembolso = true; patch.reembolsoEm = now; patch.status = 'reembolso';
    patch.statusCloser = '↩️ Compra reembolsada';
  } else if (/chargeback|estorno/.test(ev)) {
    patch.chargeback = true; patch.chargebackEm = now; patch.status = 'chargeback';
    patch.statusCloser = '⚠️ Chargeback (contestação de pagamento)';
  } else if (/refus|recusad|declin|denied|reprovad|fail/.test(ev)) {
    patch.cartaoRecusado = true; patch.recusadoEm = now; patch.clicouCheckout = true;
    patch.statusCloser = '💳 Cartão recusado — tentou pagar e falhou';
  } else if (/cart|carrinho|abandon/.test(ev)) {
    patch.carrinhoKiwify = true; patch.clicouCheckout = true;
    if (phone) patch.checkoutEm = now;
    patch.statusCloser = '🛒 Carrinho abandonado (detectado pela Kiwify)';
  } else if (/boleto|billet/.test(ev)) {
    patch.boletoGerado = true; patch.clicouCheckout = true; patch.checkoutEm = now;
    patch.statusCloser = '🧾 Boleto gerado — aguardando pagamento';
  } else if (/pix/.test(ev)) {
    patch.pixGerado = true; patch.clicouCheckout = true; patch.checkoutEm = now;
    patch.statusCloser = '⚡ Pix gerado — aguardando pagamento';
  } else {
    patch.statusCloser = 'ℹ️ Evento Kiwify: ' + ev;
  }

  // ── Acha a linha pelo telefone, senão pelo e-mail ──
  var wppCol   = headers.indexOf('WhatsApp') >= 0 ? headers.indexOf('WhatsApp') : headers.indexOf('whatsapp');
  var emailCol = headers.indexOf('Email')    >= 0 ? headers.indexOf('Email')    : headers.indexOf('email');
  var row = -1;

  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var rp = wppCol   >= 0 ? String(vals[i][wppCol]   || '').replace(/\D/g, '')        : '';
      var re = emailCol >= 0 ? String(vals[i][emailCol] || '').toLowerCase().trim()       : '';
      if ((phone && rp && rp.slice(-9) === phone.slice(-9)) || (email && re && re === email)) {
        row = i + 2; break;
      }
    }
  }

  var finalRow = row;
  if (row > 0) {
    // Atualiza só as colunas presentes no patch
    for (var h = 0; h < headers.length; h++) {
      var field = COL_TO_FIELD[headers[h]] || headers[h];
      if (patch.hasOwnProperty(field)) {
        sheet.getRange(row, h + 1).setValue(patch[field]);
      }
    }
  } else {
    // Lead não existe → cria (foi direto pra Kiwify sem passar pelo quiz)
    patch.sessionId = 'kiwify-' + (phone || email || Date.now());
    patch.nome      = nome;
    patch.whatsapp  = phone;
    patch.email     = email;
    patch.origem    = 'Kiwify (webhook)';
    patch.createdAt = now;
    var newRow = headers.map(function (col) {
      var f = COL_TO_FIELD[col] || col;
      return patch.hasOwnProperty(f) ? patch[f] : '';
    });
    sheet.appendRow(newRow);
    finalRow = sheet.getLastRow();
  }

  // ── Compra aprovada → registra a venda real (receita/LTV) ──
  if (patch.comprouKiwify === true) {
    var valor   = _valorKiwify(d, data);
    var pn      = String((d.Product && (d.Product.name || d.Product.product_name)) || (d.product && d.product.name) || d.product_name || '').toLowerCase();
    var produto = (pn.indexOf('ebook') >= 0 || pn.indexOf('e-book') >= 0) ? 'ebook'
                : (pn.indexOf('mentoria') >= 0 || pn.indexOf('ciclo') >= 0) ? 'mentoria' : 'curso';
    var transId = data.order_id || d.order_id || (d.order && d.order.id) || data.id || d.id || '';
    var sidCol  = headers.indexOf('sessionId');
    var sid     = (finalRow > 0 && sidCol >= 0) ? sheet.getRange(finalRow, sidCol + 1).getValue() : '';
    _registrarVenda(sid, email, phone, produto, valor, transId, finalRow, sheet, headers);
  }
}

// ── GET ALL LEADS para o dashboard ───────────────
function getAllLeads() {
  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  var data    = sheet.getDataRange().getValues();
  var headers = data[0];
  var leads   = [];
  var seen    = {}; // para deduplicar por sessionId ou whatsapp

  for (var i = data.length - 1; i >= 1; i--) {  // de baixo para cima (pega versão mais recente)
    var row  = data[i];
    var lead = {};

    for (var j = 0; j < headers.length; j++) {
      var colName = headers[j];
      var field   = COL_TO_FIELD[colName] || colName;
      var val     = row[j];

      if      (val === 'true'  || val === true)  lead[field] = true;
      else if (val === 'false' || val === false) lead[field] = false;
      else if (val instanceof Date)              lead[field] = val.toISOString();
      else                                       lead[field] = val;
    }

    if (!lead.nome && !lead.whatsapp) continue;

    // Deduplicação: usa sessionId como chave, ou whatsapp como fallback
    var key = lead.sessionId || (String(lead.whatsapp || '').replace(/\D/g,'').slice(-9));
    if (key && seen[key]) continue;
    if (key) seen[key] = true;

    // Garante createdAt a partir da coluna Data se não tiver
    if (!lead.createdAt && lead['Data']) lead.createdAt = lead['Data'];

    // Status padrão
    if (!lead.status) lead.status = 'novo';

    leads.push(lead);
  }

  // Ordena por data, mais recentes primeiro
  leads.sort(function(a, b) {
    return new Date(b.createdAt || 0) - new Date(a.createdAt || 0);
  });

  return leads;
}

// ═══════════════════════════════════════════════════
//  WEBHOOK EDUZZ (Mentoria)
// ═══════════════════════════════════════════════════
function isEduzzPayload(d) {
  if (!d) return false;
  var dd = d.data || d;
  var ev = String(d.event || '').toLowerCase();
  return !!(
    d.trans_cod || d.trans_status || d.cus_email || d.product_cod || d.api_key ||
    (dd && (dd.trans_cod || dd.trans_status || dd.cus_email || dd.product_cod || dd.buyer)) ||
    ev.indexOf('eduzz') >= 0 || ev.indexOf('invoice') >= 0
  );
}

function handleEduzzWebhook(data) {
  var now = new Date().toISOString();
  var d   = data.data || data;
  var buyer = d.buyer || data.buyer || {};

  var email = String(d.cus_email || buyer.email || d.email || '').toLowerCase().trim();
  var phone = String(
    d.cus_tel || d.cus_cel || buyer.cellphone || buyer.telephone || buyer.phone || buyer.tel || ''
  ).replace(/\D/g, '');
  var nome  = d.cus_name || buyer.name || d.name || '';

  // Evento/status: formato novo (event: "myeduzz.invoice_paid") ou antigo (trans_status)
  var st = String(
    data.event || d.event || d.trans_status || (d.sale && d.sale.status) || d.status || ''
  ).toLowerCase();

  // Detecta o produto e o valor (Eduzz vende ebook E mentoria)
  var valor   = _valorEduzz(d, data);
  var pn      = String(d.product_name || d.content_title || (d.product && d.product.name) || d.cont_name || '').toLowerCase();
  var produto = (pn.indexOf('mentoria') >= 0 || pn.indexOf('ciclo') >= 0 || pn.indexOf('cdf') >= 0) ? 'mentoria'
              : (pn.indexOf('ebook') >= 0 || pn.indexOf('e-book') >= 0 || pn.indexOf('caminho') >= 0) ? 'ebook'
              : (valor > 0 && valor < 100 ? 'ebook' : 'mentoria');

  var patch = { kiwifyEvento: 'eduzz:' + st, kiwifyEventoEm: now, updatedAt: now };

  if (/_paid|paid|aprovad|complet|venda|(^|[^0-9])3([^0-9]|$)/.test(st)) {
    patch.status = 'comprou'; patch.comprouKiwify = true; patch.cartaoRecusado = false;
    patch.oferta = produto;   // grava o produto correto (ebook ou mentoria)
    patch.statusCloser = produto === 'ebook' ? '✅ Compra confirmada (Eduzz — Ebook)' : '✅ Compra confirmada (Eduzz/Mentoria)';
  } else if (/chargeback|estorno/.test(st)) {
    patch.chargeback = true; patch.chargebackEm = now; patch.status = 'chargeback';
    patch.statusCloser = '⚠️ Chargeback (Eduzz)';
  } else if (/waiting_refund/.test(st)) {
    patch.clicouCheckout = true;
    patch.statusCloser = '↩️ Reembolso solicitado (Eduzz) — em análise';
  } else if (/_refunded|refunded|reembols|(^|[^0-9])7([^0-9]|$)/.test(st)) {
    patch.reembolso = true; patch.reembolsoEm = now; patch.status = 'reembolso';
    patch.statusCloser = '↩️ Reembolso (Eduzz)';
  } else if (/recus|declin|reprov|fail/.test(st)) {
    patch.cartaoRecusado = true; patch.recusadoEm = now; patch.clicouCheckout = true;
    patch.statusCloser = '💳 Pagamento recusado (Eduzz)';
  } else if (/cancel|expir/.test(st)) {
    patch.clicouCheckout = true;
    patch.statusCloser = '🚫 Fatura cancelada/expirada (Eduzz) — não comprou';
  } else if (/boleto/.test(st)) {
    patch.boletoGerado = true; patch.clicouCheckout = true; patch.checkoutEm = now;
    patch.statusCloser = '🧾 Boleto gerado (Eduzz)';
  } else if (/pix/.test(st)) {
    patch.pixGerado = true; patch.clicouCheckout = true; patch.checkoutEm = now;
    patch.statusCloser = '⚡ Pix gerado (Eduzz)';
  } else if (/waiting_payment|opened|open|abert|wait|pending|scheduled|schedul|recovering|recover|negotiated/.test(st)) {
    patch.clicouCheckout = true; patch.checkoutEm = now;
    patch.statusCloser = '🛒 Checkout iniciado (Eduzz)';
  } else {
    patch.statusCloser = 'ℹ️ Evento Eduzz: ' + st;
  }

  var finalRow = _upsertByContact(patch, phone, email, nome, 'Eduzz (webhook)');

  // ── Compra aprovada → registra a venda real (receita/LTV) ──
  if (patch.comprouKiwify === true) {
    var transId = d.trans_cod || data.trans_cod || d.invoice_id || (d.sale && d.sale.id) || d.id || '';
    var sheetE  = getSheet();
    var headE   = getHeaders(sheetE);
    var sidCol  = headE.indexOf('sessionId');
    var sid     = (finalRow > 0 && sidCol >= 0) ? sheetE.getRange(finalRow, sidCol + 1).getValue() : '';
    _registrarVenda(sid, email, phone, produto, valor, transId, finalRow, sheetE, headE);
  }
}

// Acha a linha pelo telefone (ou e-mail) e aplica o patch; se não existir, cria.
function _upsertByContact(patch, phone, email, nome, origem) {
  var sheet    = getSheet();
  var headers  = ensureNewColumns(sheet);
  var lastRow  = sheet.getLastRow();
  var now      = new Date().toISOString();
  var wppCol   = headers.indexOf('WhatsApp') >= 0 ? headers.indexOf('WhatsApp') : headers.indexOf('whatsapp');
  var emailCol = headers.indexOf('Email')    >= 0 ? headers.indexOf('Email')    : headers.indexOf('email');
  var row = -1;

  if (lastRow > 1) {
    var vals = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
    for (var i = 0; i < vals.length; i++) {
      var rp = wppCol   >= 0 ? String(vals[i][wppCol]   || '').replace(/\D/g, '')  : '';
      var re = emailCol >= 0 ? String(vals[i][emailCol] || '').toLowerCase().trim() : '';
      if ((phone && rp && rp.slice(-9) === phone.slice(-9)) || (email && re && re === email)) {
        row = i + 2; break;
      }
    }
  }

  var finalRow = row;
  if (row > 0) {
    for (var h = 0; h < headers.length; h++) {
      var field = COL_TO_FIELD[headers[h]] || headers[h];
      if (patch.hasOwnProperty(field)) sheet.getRange(row, h + 1).setValue(patch[field]);
    }
  } else {
    patch.sessionId = patch.sessionId || (origem.replace(/\W+/g, '') + '-' + (phone || email || Date.now()));
    if (!patch.nome)     patch.nome     = nome;
    if (!patch.whatsapp) patch.whatsapp = phone;
    if (!patch.email)    patch.email    = email;
    patch.origem    = origem;
    patch.createdAt = now;
    var newRow = headers.map(function (col) {
      var f = COL_TO_FIELD[col] || col;
      return patch.hasOwnProperty(f) ? patch[f] : '';
    });
    sheet.appendRow(newRow);
    finalRow = sheet.getLastRow();
  }
  return finalRow;
}

// ═══════════════════════════════════════════════════
//  E-MAIL DE REMARKETING AUTOMÁTICO (Gmail)
//  → Crie um gatilho por TEMPO na função enviarEmailsRemarketing
//    (Acionadores → Adicionar acionador → a cada 1 hora).
//  Envia para quem ENTROU no checkout e NÃO comprou (inclui cartão recusado).
// ═══════════════════════════════════════════════════
var EMAIL_CFG = {
  fromName:     'Lorena · Nerds da Libras',
  cursoNome:    'Curso do Zero à Libras',
  mentoriaNome: 'Mentoria Ciclo da Fluência',
  cursoUrl:     'https://pay.kiwify.com.br/1sIyvVL',
  mentoriaUrl:  'https://chk.eduzz.com/G96RXVVEW1',
};
var EMAIL_DELAYS_H = [2, 24, 48];  // horas após o checkout para e-mail 1, 2 e 3

// Próximo sábado no formato DD/MM (hoje, se já for sábado)
function _proximoSabado() {
  var d = new Date();
  var diff = (6 - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  return ('0' + d.getDate()).slice(-2) + '/' + ('0' + (d.getMonth() + 1)).slice(-2);
}
function _btn(link, label) {
  return '<p style="margin:24px 0"><a href="' + link + '" style="display:inline-block;' +
    'background:#7c3aed;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:12px;' +
    'font-weight:700;font-size:16px">' + label + '</a></p>';
}
function _emailWrap(preheader, inner) {
  return '<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent">' + preheader + '</div>' +
    '<div style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2d2d33;max-width:600px;margin:0 auto;padding:14px">' +
    inner +
    '<p style="color:#9ca3af;font-size:12px;margin-top:30px;border-top:1px solid #eee;padding-top:14px">Nerds da Libras · Você recebe este e-mail porque fez a avaliação de Libras com a Lorena.</p></div>';
}
function _p(t) { return '<p style="margin:0 0 15px">' + t + '</p>'; }

function _emailRemarketing(lead, num) {
  var nome = String(lead.nome || 'você').split(' ')[0];
  var ehMentoria = lead.oferta === 'mentoria';
  var link = ehMentoria ? EMAIL_CFG.mentoriaUrl : EMAIL_CFG.cursoUrl;

  if (num === 1) {
    return {
      subject: 'A primeira conversa de verdade com quem você ama',
      htmlBody: _emailWrap('Do zero à sua primeira conversa em Libras (mais perto do que você imagina)',
        _p('Oi, ' + nome + ' 💜') +
        _p('Aqui é a Lorena, e eu quero te fazer uma pergunta sincera:') +
        _p('Quantas vezes você já ficou ali, perto de uma pessoa surda que você ama, querendo dizer algo simples — e as palavras não saíram?') +
        _p('Um "eu te amo". Um "como foi seu dia?". Uma piada boba na mesa do almoço.') +
        _p('Eu sei exatamente como isso dói. E é justamente por isso que eu criei o Zero a Libras.') +
        _p('Imagina comigo… 🌱') +
        _p('Daqui a algumas semanas, você senta ao lado dessa pessoa e tem uma conversa de verdade. Não gestos soltos, não apontar, não o celular no meio. Uma conversa, olho no olho, na língua dela.') +
        _p('"Ah, Lorena… mas eu nunca estudei Libras, vou demorar anos…"') +
        _p('Calma. Foi exatamente pensando em quem está começando do absoluto zero que eu montei esse curso.') +
        _p('Sem teoria chata, sem decoreba. Você aprende os sinais que realmente importam pro seu dia a dia, na ordem certa, com um método que respeita o seu tempo — mesmo que você só tenha 20 minutinhos por dia.') +
        _p('Eu sou tradutora e intérprete há anos, e já ensinei centenas de pessoas que chegaram travadas e hoje conversam com naturalidade. Posso fazer isso com você também. 🤟') +
        _btn(link, '👉 QUERO CONHECER O ZERO A LIBRAS') +
        _p('Você ainda pode experimentar o curso por 7 dias e sentir na prática como é mais simples do que parece.') +
        _p('Te espero do outro lado.') +
        _p('Com carinho,<br>Lorena 💜')),
      body: 'Oi, ' + nome + ' 💜\n\nAqui é a Lorena, e quero te fazer uma pergunta sincera:\n\n' +
        'Quantas vezes você ficou perto de uma pessoa surda que ama, querendo dizer algo simples — e as palavras não saíram?\n\n' +
        'Eu sei como isso dói. Por isso criei o Zero a Libras.\n\nDaqui a algumas semanas você pode ter uma conversa de verdade, olho no olho, na língua dela. Foi pensando em quem começa do zero que montei esse curso — sem teoria chata, na ordem certa, mesmo com 20 minutinhos por dia.\n\n' +
        '👉 QUERO CONHECER O ZERO A LIBRAS:\n' + link + '\n\nVocê ainda pode experimentar por 7 dias.\n\nCom carinho,\nLorena 💜',
    };
  }

  if (num === 2) {
    return {
      subject: 'Por que você não vai aprender Libras sozinho(a) (nem precisa)',
      htmlBody: _emailWrap('Tem uma coisa que separa quem aprende de quem desiste: acompanhamento.',
        _p('Oi, ' + nome + '! 💜') +
        _p('Tem uma coisa que separa quem aprende Libras de verdade de quem desiste no meio do caminho: <strong>acompanhamento</strong>.') +
        _p('Vídeo solto no YouTube ensina sinal. Mas não te corrige, não tira sua dúvida, não te segura na mão quando você trava. E é aí que a maioria desiste.') +
        _p('No Zero a Libras é diferente.') +
        _p('Você aprende organizado por níveis — começa do básico e vai subindo de etapa conforme evolui. A cada avanço, você entra em contato com outras pessoas que estão exatamente no mesmo ponto da jornada que você. 🌱') +
        _p('Isso muda tudo, porque você:') +
        _p('✅ Tira suas dúvidas e recebe correção (sinal errado vira vício difícil de tirar depois)<br>' +
           '✅ Pratica com gente que também está aprendendo, sem vergonha de errar<br>' +
           '✅ Sente que não está sozinho(a) nessa') +
        _p('E o mais importante: eu estou junto. Não é um curso gravado e abandonado — eu acompanho de perto e estou presente pra te ajudar a chegar lá. 🤟') +
        _p('Aprender uma língua é repetir, errar, corrigir e repetir de novo. Sozinho isso é solitário. Comigo e com a comunidade, vira leve.') +
        _btn(link, '👉 QUERO APRENDER COM ACOMPANHAMENTO DE VERDADE') +
        _p('Te garanto: seu único arrependimento vai ser não ter começado antes.') +
        _p('Com carinho,<br>Lorena 💜')),
      body: 'Oi, ' + nome + '! 💜\n\nTem uma coisa que separa quem aprende Libras de quem desiste: acompanhamento.\n\n' +
        'Vídeo solto no YouTube ensina sinal, mas não te corrige nem te segura quando você trava. No Zero a Libras você aprende por níveis, com correção, praticando com gente no mesmo ponto que você — e comigo presente pra te ajudar a chegar lá. 🤟\n\n' +
        '✅ Correção (sinal errado vira vício)\n✅ Prática sem vergonha de errar\n✅ Você não está sozinho(a)\n\n' +
        '👉 QUERO APRENDER COM ACOMPANHAMENTO DE VERDADE:\n' + link + '\n\nCom carinho,\nLorena 💜',
    };
  }

  // num === 3 — última chamada: 30% OFF com cupom DESCONTO30 + bônus
  var sabado = _proximoSabado();
  return {
    subject: '30% OFF + um bônus que vai te destravar 💸',
    htmlBody: _emailWrap('Use o cupom DESCONTO30 e ganhe 30% (+ bônus exclusivo)',
      _p('Oi, ' + nome + '! 💜') +
      _p('Sextou — e hoje é dia de condição especial. 🎉') +
      _p('Em algum momento você se interessou pelo Zero a Libras (por isso está recebendo este email). Mas, por algum motivo, ainda não começou.') +
      _p('O motivo eu não sei. Mas o que eu sei é que cada dia sem se comunicar com quem você ama é um dia que não volta. Então decidi facilitar pra você dar o primeiro passo HOJE:') +
      _p('<strong>Use o cupom DESCONTO30 e ganhe 30% de desconto.</strong> 🤟') +
      _btn(link, '👉 QUERO MEUS 30% DE DESCONTO') +
      _p('E tem mais — comprando nesta oferta você ainda libera 2 cursos bônus direto na sua plataforma:') +
      _p('🎁 <strong>Curso de Datilologia</strong><br>🎁 <strong>Curso de Interpretação de Música</strong>') +
      _p('É só garantir sua vaga pelo link abaixo que os dois cursos são liberados automaticamente na sua plataforma. 🚀') +
      _p('Tudo isso — mas só com o cupom <strong>DESCONTO30</strong>, e por tempo limitado, viu? 😉') +
      _btn(link, '👉 GARANTIR COM O CUPOM DESCONTO30') +
      _p('⚠️ <strong>IMPORTANTE:</strong> O cupom <strong>DESCONTO30</strong> (30% OFF) e os cursos bônus (Datilologia e Interpretação de Música) ficam disponíveis só até sábado, dia <strong>' + sabado + '</strong>, às 23h59.') +
      _p('Não deixa essa conversa pra depois. 💜') +
      _p('Com carinho,<br>Lorena')),
    body: 'Oi, ' + nome + '! 💜\n\nSextou — e hoje é dia de condição especial. 🎉\n\n' +
      'Você se interessou pelo Zero a Libras mas ainda não começou. Cada dia sem se comunicar com quem você ama é um dia que não volta. Então:\n\n' +
      'Use o cupom DESCONTO30 e ganhe 30% de desconto. 🤟\n\n' +
      '👉 QUERO MEUS 30% DE DESCONTO:\n' + link + '\n\n' +
      'E comprando nesta oferta você ainda libera 2 cursos bônus na plataforma:\n🎁 Curso de Datilologia\n🎁 Curso de Interpretação de Música\n\nÉ só garantir sua vaga pelo link que os dois são liberados automaticamente. 🚀\n\n' +
      '⚠️ O cupom DESCONTO30 (30% OFF) e os cursos bônus ficam disponíveis só até sábado, dia ' + sabado + ', às 23h59.\n\n' +
      'Não deixa essa conversa pra depois. 💜\n\nCom carinho,\nLorena',
  };
}

// Envia o e-mail (1, 2 ou 3) — personalizado com o nome — para uma lista de
// leads escolhidos no CRM. Marca emailNSentAt e retorna quantos foram enviados.
function enviarEmailParaLeads(sessionIds, num) {
  if (!sessionIds || !sessionIds.length) return 0;
  num = parseInt(num, 10) || 1;
  if (num < 1 || num > 3) num = 1;

  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var headers = ensureNewColumns(sheet);
  var data    = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();

  function idx(field) {
    var col = FIELD_TO_COL[field] || field;
    var i = headers.indexOf(col);
    if (i < 0) i = headers.indexOf(field);
    return i;
  }
  var iSid = idx('sessionId'), iEmail = idx('email'), iNome = idx('nome'),
      iNivel = idx('nivelIdentificado'), iOferta = idx('oferta'), iSent = idx('email' + num + 'SentAt');

  var want = {};
  for (var k = 0; k < sessionIds.length; k++) want[String(sessionIds[k])] = true;

  var enviados = 0;
  for (var r = 0; r < data.length; r++) {
    var sid = String(iSid >= 0 ? data[r][iSid] : '');
    if (!want[sid]) continue;
    var email = String(iEmail >= 0 ? data[r][iEmail] : '').trim();
    if (!email || email.indexOf('@') < 0) continue;

    var lead = {
      nome: iNome >= 0 ? data[r][iNome] : '',
      nivelIdentificado: iNivel >= 0 ? data[r][iNivel] : '',
      oferta: iOferta >= 0 ? data[r][iOferta] : '',
    };
    try {
      var tpl = _emailRemarketing(lead, num);
      MailApp.sendEmail({ to: email, subject: tpl.subject, body: tpl.body, htmlBody: tpl.htmlBody, name: EMAIL_CFG.fromName });
      if (iSent >= 0) sheet.getRange(r + 2, iSent + 1).setValue(new Date().toISOString());
      enviados++;
    } catch (err) { /* segue para o próximo */ }
  }
  return enviados;
}

// Envia um e-mail PERSONALIZADO (campanha) para uma lista de sessionIds.
// {nome} no assunto/corpo vira o primeiro nome de cada lead. Respeita a
// cota diária do Gmail (para de enviar se estourar e registra no log).
function enviarBroadcast(sessionIds, subject, body, label) {
  if (!sessionIds || !sessionIds.length) return 0;
  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var headers  = getHeaders(sheet);
  var sidCol   = headers.indexOf('sessionId');
  var emailCol = headers.indexOf('Email') >= 0 ? headers.indexOf('Email') : headers.indexOf('email');
  var nomeCol  = headers.indexOf('Nome')  >= 0 ? headers.indexOf('Nome')  : headers.indexOf('nome');
  if (sidCol < 0 || emailCol < 0) return 0;

  // O nome do lead entra SEMPRE: se o texto não tiver {nome}, começa com "Oi {nome},"
  var bodyTpl = /\{nome\}/i.test(String(body)) ? String(body) : ('Oi {nome},\n\n' + String(body));

  var campId = 'c' + Date.now();           // id único desta campanha (para rastrear aberturas)
  var appUrl = _webAppUrl();               // URL do próprio web app (para o pixel)

  var want = {};
  for (var i = 0; i < sessionIds.length; i++) want[sessionIds[i]] = true;

  var data  = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var quota = MailApp.getRemainingDailyQuota();
  var sent  = 0;

  for (var r = 0; r < data.length; r++) {
    var sid = data[r][sidCol];
    if (want[sid] !== true) continue;      // não está na lista, ou já enviado
    want[sid] = false;                     // evita duplicar se houver linha repetida
    var email = String(data[r][emailCol] || '').trim();
    if (!email || email.indexOf('@') < 0) continue;
    if (sent >= quota) { Logger.log('Broadcast: cota diária do Gmail esgotada — enviados ' + sent); break; }

    var nome  = String(nomeCol >= 0 ? data[r][nomeCol] : '').split(' ')[0] || 'você';
    var subj  = String(subject).replace(/\{nome\}/gi, nome);
    var corpo = bodyTpl.replace(/\{nome\}/gi, nome);
    var html  = corpo.replace(/\n/g, '<br>');
    // Pixel invisível: quando o cliente de e-mail carrega essa imagem, registra a abertura
    if (appUrl) {
      html += '<img src="' + appUrl + '?action=open&c=' + encodeURIComponent(campId) +
              '&s=' + encodeURIComponent(sid) + '" width="1" height="1" alt="" ' +
              'style="width:1px;height:1px;border:0;overflow:hidden">';
    }
    try {
      MailApp.sendEmail({
        to: email, subject: subj,
        body: corpo, htmlBody: html,
        name: EMAIL_CFG.fromName,
      });
      sent++;
    } catch (err) { Logger.log('Erro broadcast p/ ' + email + ': ' + err); }
  }
  _logCampanha(campId, subject, label, sessionIds.length, sent);
  Logger.log('Broadcast enviado: ' + sent + ' de ' + sessionIds.length + ' (cota restante era ' + quota + ')');
  return sent;
}

// URL do próprio web app (para montar o pixel de abertura)
function _webAppUrl() {
  try { return ScriptApp.getService().getUrl() || ''; } catch (e) { return ''; }
}

// Registra a campanha na aba "Campanhas" (histórico: data, assunto, grupo, enviados, id)
function _logCampanha(campId, subject, label, total, sent) {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sh = ss.getSheetByName('Campanhas');
    if (!sh) {
      sh = ss.insertSheet('Campanhas');
      sh.appendRow(['Data', 'Assunto', 'Grupo', 'Destinatários', 'Enviados', 'CampanhaId']);
    }
    sh.appendRow([new Date(), subject, label || '', total, sent, campId]);
  } catch (e) {}
}

// Registra a abertura de um e-mail (pixel): guarda na aba "Aberturas" e marca o lead
function _registrarAbertura(campId, sid) {
  if (!campId || !sid) return;
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var ab = ss.getSheetByName('Aberturas');
    if (!ab) { ab = ss.insertSheet('Aberturas'); ab.appendRow(['Data', 'CampanhaId', 'sessionId']); }
    ab.appendRow([new Date(), campId, sid]);
  } catch (e) {}
  try {
    var sheet   = getSheet();
    var headers = getHeaders(sheet);
    var sidCol  = headers.indexOf('sessionId');
    var abCol   = headers.indexOf('campanhaAbriuEm');
    if (sidCol < 0 || abCol < 0) return;
    var last = sheet.getLastRow();
    if (last < 2) return;
    var ids = sheet.getRange(2, sidCol + 1, last - 1, 1).getValues();
    for (var i = 0; i < ids.length; i++) {
      if (ids[i][0] === sid) { sheet.getRange(i + 2, abCol + 1).setValue(new Date().toISOString()); break; }
    }
  } catch (e) {}
}

// Lê o histórico de campanhas (mais recente primeiro) com aberturas ÚNICAS por campanha
function getCampanhas() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sh = ss.getSheetByName('Campanhas');
  if (!sh) return [];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var vals = sh.getRange(2, 1, last - 1, 6).getValues();

  // Conta aberturas únicas (por sessionId) de cada campanha
  var opens = {};
  var ab = ss.getSheetByName('Aberturas');
  if (ab && ab.getLastRow() > 1) {
    var av = ab.getRange(2, 1, ab.getLastRow() - 1, 3).getValues();
    for (var j = 0; j < av.length; j++) {
      var cid = av[j][1], s = av[j][2];
      if (!cid) continue;
      if (!opens[cid]) opens[cid] = {};
      opens[cid][s] = true;
    }
  }

  var out = [];
  for (var i = vals.length - 1; i >= 0; i--) {
    var id = vals[i][5];
    out.push({
      data:      vals[i][0] ? new Date(vals[i][0]).toISOString() : '',
      assunto:   vals[i][1],
      grupo:     vals[i][2],
      total:     vals[i][3],
      enviados:  vals[i][4],
      aberturas: (id && opens[id]) ? Object.keys(opens[id]).length : 0,
    });
  }
  return out;
}

// Decide se o lead deve receber o remarketing automático (e-mail/WhatsApp).
// Regra: SÓ leads da KIWIFY (Curso). Ebook e Mentoria são da Eduzz e têm a
// recuperação própria da Eduzz, então não disparamos nada para eles.
function _ehKiwifyParaRemarketing(o) {
  var plat = String(o.plataformaOferta || '').toLowerCase();
  var ev   = String(o.kiwifyEvento     || '').toLowerCase();
  var of   = String(o.oferta           || '').toLowerCase();
  // Sinais de Eduzz / grupo / mentoria → NÃO enviar
  if (plat === 'eduzz' || plat === 'grupo') return false;
  if (of === 'mentoria') return false;
  if (ev.indexOf('eduzz') === 0) return false;
  // Sinais claros de Kiwify → enviar
  if (plat === 'kiwify') return true;
  if (o.carrinhoKiwify === true || String(o.carrinhoKiwify).toLowerCase() === 'true') return true;
  if (ev && ev.indexOf('eduzz') !== 0) return true;   // evento veio da Kiwify
  if (of === 'curso') return true;                    // curso = Kiwify (Eduzz já foi excluído acima)
  return false;                                       // sem sinal de Kiwify → não envia
}

function enviarEmailsRemarketing() {
  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var headers = ensureNewColumns(sheet);
  var data    = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var now     = Date.now();

  function idx(field) {
    var col = FIELD_TO_COL[field] || field;
    var i = headers.indexOf(col);
    if (i < 0) i = headers.indexOf(field);
    return i;
  }
  var iEmail = idx('email'), iStatus = idx('status'), iCheckout = idx('clicouCheckout'),
      iCheckoutEm = idx('checkoutEm'), iCreated = idx('createdAt'), iComprou = idx('comprouKiwify'),
      iOferta = idx('oferta'), iNome = idx('nome'), iNivel = idx('nivelIdentificado'),
      iPlat = idx('plataformaOferta'), iEvento = idx('kiwifyEvento'), iCarrinho = idx('carrinhoKiwify'),
      iE = [idx('email1SentAt'), idx('email2SentAt'), idx('email3SentAt')];

  function _tv(v) { if (v === true) return true; var s = String(v).trim().toLowerCase(); return s === 'true' || s === 'verdadeiro' || s === 'sim' || s === '1'; }

  var enviados = 0, comEmail = 0, entraram = 0;
  for (var r = 0; r < data.length; r++) {
    var row   = data[r];
    var email = String(iEmail >= 0 ? row[iEmail] : '').trim();
    if (!email || email.indexOf('@') < 0) continue;
    comEmail++;

    var status  = String(iStatus  >= 0 ? row[iStatus]  : '').toLowerCase();
    var comprou = (iComprou >= 0 && _tv(row[iComprou])) || status === 'comprou';
    if (comprou) continue;                                    // já comprou → não envia

    // Só remarketing da KIWIFY (curso). Eduzz (ebook/mentoria) tem recuperação própria.
    if (!_ehKiwifyParaRemarketing({
      plataformaOferta: iPlat    >= 0 ? row[iPlat]    : '',
      kiwifyEvento:     iEvento  >= 0 ? row[iEvento]  : '',
      oferta:           iOferta  >= 0 ? row[iOferta]  : '',
      carrinhoKiwify:   iCarrinho >= 0 ? row[iCarrinho] : '',
    })) continue;

    var temCheckoutEm = iCheckoutEm >= 0 && row[iCheckoutEm];
    var entrou = (iCheckout >= 0 && _tv(row[iCheckout])) || !!temCheckoutEm;
    if (!entrou) continue;                                    // só quem entrou no checkout
    entraram++;

    var ancoraRaw = temCheckoutEm ? row[iCheckoutEm] : (iCreated >= 0 ? row[iCreated] : '');
    var ancora = ancoraRaw ? new Date(ancoraRaw).getTime() : null;
    if (!ancora) continue;

    var lead = {
      nome: iNome >= 0 ? row[iNome] : '',
      nivelIdentificado: iNivel >= 0 ? row[iNivel] : '',
      oferta: iOferta >= 0 ? row[iOferta] : '',
    };

    for (var n = 0; n < 3; n++) {
      if (iE[n] < 0) continue;
      if (row[iE[n]]) continue;                               // e-mail n já enviado
      if (now < ancora + EMAIL_DELAYS_H[n] * 3600000) break;  // ainda não é hora deste e-mail
      try {
        var tpl = _emailRemarketing(lead, n + 1);
        MailApp.sendEmail({ to: email, subject: tpl.subject, body: tpl.body, htmlBody: tpl.htmlBody, name: EMAIL_CFG.fromName });
        sheet.getRange(r + 2, iE[n] + 1).setValue(new Date().toISOString());
        enviados++;
      } catch (err) { Logger.log('Erro ao enviar para ' + email + ': ' + err); }
      break;                                                  // no máximo 1 e-mail por lead por execução
    }
  }
  Logger.log('Remarketing — com e-mail: ' + comEmail + ' | entraram no checkout e não compraram: ' + entraram + ' | enviados agora: ' + enviados);
  return enviados;
}

// ═══════════════════════════════════════════════════
//  WHATSAPP REMARKETING AUTOMÁTICO (WhatsApp Cloud API — Meta)
//  → Preencha WA_CFG com seus dados da Meta e crie um gatilho por TEMPO
//    na função enviarWhatsAppRemarketing (a cada 1 hora).
//  Envia 1 template por lead por execução, na sequência 0h / 24h / 48h,
//  só para quem entrou no checkout e NÃO comprou. Para se o lead comprar.
// ═══════════════════════════════════════════════════
var WA_CFG = {
  token:         'COLE_AQUI_O_TOKEN_PERMANENTE',   // Token de acesso da WhatsApp Cloud API
  phoneNumberId: 'COLE_AQUI_O_PHONE_NUMBER_ID',    // Phone Number ID do número dedicado
  apiVersion:    'v21.0',
  lang:          'pt_BR',
  // Nomes dos 3 templates aprovados na Meta, em ordem (msg 1, 2 e 3):
  templates:     ['remarketing_1', 'remarketing_2', 'remarketing_3'],
};
var WA_DELAYS_H = [0, 24, 48];  // horas após o checkout: msg1 imediata, msg2 +24h, msg3 +48h

// Envia um template (com o primeiro nome em {{1}}) via WhatsApp Cloud API
function _waSendTemplate(phone, templateName, firstName) {
  var url = 'https://graph.facebook.com/' + WA_CFG.apiVersion + '/' + WA_CFG.phoneNumberId + '/messages';
  var payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: templateName,
      language: { code: WA_CFG.lang },
      components: [{ type: 'body', parameters: [{ type: 'text', text: firstName }] }],
    },
  };
  var res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + WA_CFG.token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('WhatsApp API ' + code + ': ' + res.getContentText());
  return true;
}

function enviarWhatsAppRemarketing() {
  if (!WA_CFG.phoneNumberId || WA_CFG.token.indexOf('COLE_AQUI') === 0) {
    Logger.log('WhatsApp não configurado — preencha WA_CFG (token, phoneNumberId, templates).');
    return 0;
  }
  var sheet   = getSheet();
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  var headers = ensureNewColumns(sheet);
  var data    = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  var now     = Date.now();

  function idx(field) { var c = FIELD_TO_COL[field] || field; var i = headers.indexOf(c); if (i < 0) i = headers.indexOf(field); return i; }
  function _tv(v) { if (v === true) return true; var s = String(v).trim().toLowerCase(); return s === 'true' || s === 'verdadeiro' || s === 'sim' || s === '1'; }

  var iWpp = idx('whatsapp'), iStatus = idx('status'), iCheckout = idx('clicouCheckout'),
      iCheckoutEm = idx('checkoutEm'), iCreated = idx('createdAt'), iComprou = idx('comprouKiwify'),
      iOferta = idx('oferta'), iPlat = idx('plataformaOferta'), iEvento = idx('kiwifyEvento'), iCarrinho = idx('carrinhoKiwify'),
      iNome = idx('nome'), iW = [idx('waMsg1SentAt'), idx('waMsg2SentAt'), idx('waMsg3SentAt')];

  var enviados = 0, entraram = 0;
  for (var r = 0; r < data.length; r++) {
    var row = data[r];
    var wpp = String(iWpp >= 0 ? row[iWpp] : '').replace(/\D/g, '');
    if (wpp.length < 10) continue;
    if (wpp.length <= 11) wpp = '55' + wpp;   // garante DDI do Brasil

    var status  = String(iStatus >= 0 ? row[iStatus] : '').toLowerCase();
    var comprou = (iComprou >= 0 && _tv(row[iComprou])) || status === 'comprou';
    if (comprou) continue;

    // Só remarketing da KIWIFY (curso). Eduzz (ebook/mentoria) tem recuperação própria.
    if (!_ehKiwifyParaRemarketing({
      plataformaOferta: iPlat    >= 0 ? row[iPlat]    : '',
      kiwifyEvento:     iEvento  >= 0 ? row[iEvento]  : '',
      oferta:           iOferta  >= 0 ? row[iOferta]  : '',
      carrinhoKiwify:   iCarrinho >= 0 ? row[iCarrinho] : '',
    })) continue;

    var temCk  = iCheckoutEm >= 0 && row[iCheckoutEm];
    var entrou = (iCheckout >= 0 && _tv(row[iCheckout])) || !!temCk;
    if (!entrou) continue;
    entraram++;

    var ancoraRaw = temCk ? row[iCheckoutEm] : (iCreated >= 0 ? row[iCreated] : '');
    var ancora = ancoraRaw ? new Date(ancoraRaw).getTime() : null;
    if (!ancora) continue;

    var nome = String(iNome >= 0 ? row[iNome] : 'você').split(' ')[0];

    for (var n = 0; n < 3; n++) {
      if (iW[n] < 0) continue;
      if (row[iW[n]]) continue;
      if (now < ancora + WA_DELAYS_H[n] * 3600000) break;
      try {
        _waSendTemplate(wpp, WA_CFG.templates[n], nome);
        sheet.getRange(r + 2, iW[n] + 1).setValue(new Date().toISOString());
        enviados++;
      } catch (err) { Logger.log('Erro WhatsApp p/ ' + wpp + ': ' + err); }
      break;   // no máximo 1 mensagem por lead por execução
    }
  }
  Logger.log('WhatsApp remarketing — entraram e não compraram: ' + entraram + ' | enviados agora: ' + enviados);
  return enviados;
}
