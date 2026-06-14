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
    const raw  = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    // Webhook da Kiwify (qualquer evento: compra, recusa, boleto, pix, carrinho...)
    if (isKiwifyPayload(data)) {
      handleKiwifyWebhook(data);
      return respond({ ok: true, source: 'kiwify' });
    }

    // Dados do lead vindo do quiz / beacon do VSL
    if (data.sessionId || data.nome) {
      upsertLead(data);
      return respond({ ok: true, source: 'lead' });
    }

    return respond({ ok: true });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── ENTRADA GET (dashboard busca leads) ──────────
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || '';
  if (action === 'getLeads') {
    return respond(getAllLeads());
  }
  return respond({ ok: true, version: '3.2' });
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
