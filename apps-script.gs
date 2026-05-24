// ═══════════════════════════════════════════════════
//  NERDS DA LIBRAS — Google Apps Script
//  Cole este código no seu Apps Script e publique
//  como Web App (Executar como: Eu, Acesso: Qualquer)
// ═══════════════════════════════════════════════════

const SHEET_NAME = 'Leads';

// ── ENTRADA POST (quiz + webhook Kiwify) ──────────
function doPost(e) {
  try {
    const raw  = e.postData ? e.postData.contents : '{}';
    const data = JSON.parse(raw);

    // Webhook da Kiwify: tem campo "event" e "data.customer"
    if (data.event && data.data && data.data.customer) {
      handleKiwifyWebhook(data);
      return respond({ ok: true, source: 'kiwify' });
    }

    // Dados do lead vindo do quiz
    if (data.sessionId) {
      upsertLead(data);
      return respond({ ok: true, source: 'quiz' });
    }

    return respond({ ok: true, msg: 'sem acao' });
  } catch (err) {
    return respond({ error: err.message });
  }
}

// ── ENTRADA GET (dashboard lê os leads) ──────────
function doGet(e) {
  const action = (e.parameter && e.parameter.action) || '';

  if (action === 'getLeads') {
    return respond(getAllLeads());
  }

  return respond({ ok: true, version: '2.0' });
}

// ── HELPER: retorna JSON com CORS ─────────────────
function respond(data) {
  return ContentService
    .createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

// ── SHEET ─────────────────────────────────────────
function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  return ss.getSheetByName(SHEET_NAME) || ss.insertSheet(SHEET_NAME);
}

const HEADERS = [
  'sessionId', 'nome', 'whatsapp', 'instagram', 'genero',
  'nivelIdentificado', 'pontuacao', 'oferta', 'resultado',
  'classificacaoLead', 'status', 'statusCloser',
  'comprouKiwify', 'clicouGrupo', 'clicouCheckout',
  'respostaDificuldade', 'respostaObjetivo',
  'iniciouQuiz', 'concluiuQuiz', 'tempoNoQuiz',
  'createdAt', 'updatedAt'
];

function ensureHeaders(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#1a1a2e')
      .setFontColor('#ffffff');
  }
  return sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
}

// ── UPSERT: cria ou atualiza lead por sessionId ───
function upsertLead(data) {
  const sheet   = getSheet();
  const headers = ensureHeaders(sheet);
  const sidCol  = headers.indexOf('sessionId');
  const lastRow = sheet.getLastRow();

  let existingRow = -1;
  if (lastRow > 1 && sidCol >= 0) {
    const ids = sheet.getRange(2, sidCol + 1, lastRow - 1, 1).getValues();
    for (let i = 0; i < ids.length; i++) {
      if (ids[i][0] === data.sessionId) { existingRow = i + 2; break; }
    }
  }

  const now = new Date().toISOString();
  if (!data.createdAt) data.createdAt = now;
  data.updatedAt = now;

  const row = HEADERS.map(h => {
    const v = data[h];
    if (v === undefined || v === null) return '';
    return v;
  });

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, row.length).setValues([row]);
  } else {
    sheet.appendRow(row);
  }
}

// ── WEBHOOK KIWIFY: marca compra confirmada ───────
function handleKiwifyWebhook(data) {
  const sheet   = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return;

  const headers  = ensureHeaders(sheet);
  const customer = data.data.customer;

  // Pega telefone limpo (só dígitos), compara pelos últimos 9
  const phone = String(customer.mobile || customer.phone || '').replace(/\D/g, '');

  const wppCol    = headers.indexOf('whatsapp');
  const statusCol = headers.indexOf('status');
  const comprouCol= headers.indexOf('comprouKiwify');
  const updatedCol= headers.indexOf('updatedAt');
  const closerCol = headers.indexOf('statusCloser');

  if (wppCol < 0) return;

  const phones = sheet.getRange(2, wppCol + 1, lastRow - 1, 1).getValues();

  for (let i = 0; i < phones.length; i++) {
    const rowPhone = String(phones[i][0] || '').replace(/\D/g, '');
    if (phone && rowPhone && rowPhone.slice(-9) === phone.slice(-9)) {
      const r = i + 2;
      if (statusCol   >= 0) sheet.getRange(r, statusCol    + 1).setValue('comprou');
      if (comprouCol  >= 0) sheet.getRange(r, comprouCol   + 1).setValue(true);
      if (closerCol   >= 0) sheet.getRange(r, closerCol    + 1).setValue('✅ Compra confirmada pela Kiwify');
      if (updatedCol  >= 0) sheet.getRange(r, updatedCol   + 1).setValue(new Date().toISOString());
      break;
    }
  }
}

// ── GET ALL LEADS para o dashboard ───────────────
function getAllLeads() {
  const sheet   = getSheet();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return [];

  const data    = sheet.getDataRange().getValues();
  const headers = data[0];
  const leads   = [];

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue;
    const lead = {};
    for (let j = 0; j < headers.length; j++) {
      const v = data[i][j];
      // Converte strings booleanas de volta para boolean
      if      (v === 'true'  || v === true)  lead[headers[j]] = true;
      else if (v === 'false' || v === false) lead[headers[j]] = false;
      else lead[headers[j]] = v;
    }
    leads.push(lead);
  }

  leads.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  return leads;
}
