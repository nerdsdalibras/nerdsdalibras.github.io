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
  'tempoNoQuiz':      'tempoNoQuiz',
  'updatedAt':        'updatedAt',
};

// Mapeamento inverso: campo JS → nome da coluna
const FIELD_TO_COL = {};
for (var k in COL_TO_FIELD) { FIELD_TO_COL[COL_TO_FIELD[k]] = k; }

// Novas colunas que precisam existir para o sistema funcionar
const NEW_COLS = [
  'Email','Objetivo','Quis Avançar',
  'sessionId','genero','oferta','Grupo Indicado','classificacaoLead',
  'status','statusCloser','observacoes',
  'comprouKiwify','clicouVSL','clicouGrupo','clicouCheckout','checkoutEm',
  'kiwifyEvento','kiwifyEventoEm',
  'boletoGerado','pixGerado','carrinhoKiwify',
  'cartaoRecusado','recusadoEm','reembolso','reembolsoEm','chargeback','chargebackEm',
  'vslIniciou','vslPct25','vslPct50','vslPct75','vslAssistiuFim','vslClicouCTA',
  'email1SentAt','email2SentAt','email3SentAt',
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

  // Eduzz = sempre Mentoria
  var patch = { kiwifyEvento: 'eduzz:' + st, kiwifyEventoEm: now, updatedAt: now, oferta: 'mentoria' };

  if (/_paid|paid|aprovad|complet|venda|(^|[^0-9])3([^0-9]|$)/.test(st)) {
    patch.status = 'comprou'; patch.comprouKiwify = true; patch.cartaoRecusado = false;
    patch.statusCloser = '✅ Compra confirmada (Eduzz/Mentoria)';
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

  _upsertByContact(patch, phone, email, nome, 'Eduzz (webhook)');
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
  }
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

function _emailRemarketing(lead, num) {
  var nome = String(lead.nome || 'você').split(' ')[0];
  var ehMentoria = lead.oferta === 'mentoria';
  var prod = ehMentoria ? EMAIL_CFG.mentoriaNome : EMAIL_CFG.cursoNome;
  var link = ehMentoria ? EMAIL_CFG.mentoriaUrl  : EMAIL_CFG.cursoUrl;

  var subjects = [
    nome + ', você quase começou sua jornada em Libras 💚',
    nome + ', deixa eu te tirar uma dúvida sobre o ' + prod + '?',
    '🎁 ' + nome + ', um presente final pra você: 30% OFF (só até 30/06)',
  ];

  var bodies = [
    'Oi, ' + nome + '! 💚\n\n' +
    'Aqui é a Lorena, da Nerds da Libras.\n\n' +
    'Vi que você chegou pertinho de garantir sua vaga no ' + prod + ', mas não finalizou. Fica tranquila, isso acontece bastante!\n\n' +
    'Se surgiu alguma dúvida ou apareceu algum imprevisto no pagamento, me responde esse e-mail que eu te ajudo pessoalmente — de coração. 💚\n\n' +
    'Sua vaga (com a condição especial) ainda está reservada aqui:\n' + link + '\n\n' +
    'Com carinho,\nLorena · Nerds da Libras',

    'Oi, ' + nome + '! 💚\n\n' +
    'Ontem você esteve quase começando no ' + prod + '. Quero te contar uma coisa que quase ninguém explica:\n\n' +
    'Libras não é português com as mãos. É uma língua visual, com gramática própria. Quando a gente tenta "traduzir" o português, o cérebro trava — é por isso que tanta gente estuda anos e não destrava.\n\n' +
    'A metodologia que eu uso inverte isso: você aprende a pensar visualmente, e aí flui de verdade.\n\n' +
    'Se ficou alguma insegurança, me responde aqui que eu te explico tudo. A condição especial ainda está de pé:\n' + link + '\n\n' +
    'Lorena 💚\nNerds da Libras',

    'Oi, ' + nome + '. 💚\n\n' +
    'Essa é minha última mensagem — e quero que ela valha muito a pena.\n\n' +
    'Eu sei que a vida é corrida e que toda decisão tem seu tempo. Mas a barreira entre você e uma comunicação de verdade com pessoas surdas existe, e ela não some sozinha.\n\n' +
    'Então preparei um último empurrãozinho, com muito carinho, só pra você:\n\n' +
    '🎁 30% DE DESCONTO no ' + prod + '\n' +
    '🏷️ Cupom: CUPOM30\n' +
    '⏳ Válido só até 30/06/2026\n\n' +
    'É só aplicar o cupom CUPOM30 no checkout:\n' + link + '\n\n' +
    'Depois dessa data o valor volta ao normal. Vai ser uma alegria te ver do outro lado. 🤟\n\n' +
    'Com todo carinho,\nLorena · Nerds da Libras',
  ];

  return { subject: subjects[num - 1], body: bodies[num - 1] };
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
      MailApp.sendEmail({ to: email, subject: tpl.subject, body: tpl.body, name: EMAIL_CFG.fromName });
      if (iSent >= 0) sheet.getRange(r + 2, iSent + 1).setValue(new Date().toISOString());
      enviados++;
    } catch (err) { /* segue para o próximo */ }
  }
  return enviados;
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
      iE = [idx('email1SentAt'), idx('email2SentAt'), idx('email3SentAt')];

  var enviados = 0;
  for (var r = 0; r < data.length; r++) {
    var row   = data[r];
    var email = String(iEmail >= 0 ? row[iEmail] : '').trim();
    if (!email || email.indexOf('@') < 0) continue;

    var status  = String(iStatus  >= 0 ? row[iStatus]  : '').toLowerCase();
    var comprou = (iComprou >= 0 && (row[iComprou] === true || row[iComprou] === 'true')) || status === 'comprou';
    if (comprou) continue;                                    // já comprou → não envia

    var entrou = iCheckout >= 0 && (row[iCheckout] === true || row[iCheckout] === 'true');
    if (!entrou) continue;                                    // só quem entrou no checkout

    var ancoraRaw = (iCheckoutEm >= 0 && row[iCheckoutEm]) ? row[iCheckoutEm] : (iCreated >= 0 ? row[iCreated] : '');
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
        MailApp.sendEmail({ to: email, subject: tpl.subject, body: tpl.body, name: EMAIL_CFG.fromName });
        var ts = new Date().toISOString();
        sheet.getRange(r + 2, iE[n] + 1).setValue(ts);
        enviados++;
      } catch (err) { /* sem cota ou erro de envio: tenta na próxima execução */ }
      break;                                                  // no máximo 1 e-mail por lead por execução
    }
  }
  return enviados;
}
