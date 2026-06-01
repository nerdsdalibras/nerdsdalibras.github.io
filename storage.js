const Storage = (() => {
  const KEY = 'ndl_leads';

  // Cache em memória: evita re-parsear o localStorage a cada getAll().
  // Invalidado em toda escrita e quando outra aba altera os dados.
  let _cache = null;

  function _read() {
    if (_cache === null) {
      try {
        _cache = JSON.parse(localStorage.getItem(KEY) || '[]');
      } catch {
        _cache = [];
      }
    }
    return _cache;
  }

  function _persist(leads) {
    _cache = leads;
    localStorage.setItem(KEY, JSON.stringify(leads));
  }

  // Retorna uma cópia rasa do array para que ordenações/filtros dos
  // chamadores não mutem o cache compartilhado.
  function getAll() {
    return _read().slice();
  }

  function upsert(lead) {
    const leads = _read();
    const idx = leads.findIndex(l => l.sessionId === lead.sessionId);
    const ts = new Date().toISOString();
    let saved;
    if (idx >= 0) {
      saved = leads[idx] = { ...leads[idx], ...lead, updatedAt: ts };
    } else {
      saved = { ...lead, createdAt: ts, updatedAt: ts };
      leads.push(saved);
    }
    _persist(leads);
    _syncCloud(saved);
  }

  function updateStatus(sessionId, status, obs) {
    const leads = _read();
    const idx = leads.findIndex(l => l.sessionId === sessionId);
    if (idx < 0) return;
    leads[idx].status = status;
    if (obs) leads[idx].observacoes = obs;
    leads[idx].updatedAt = new Date().toISOString();
    _persist(leads);
    _syncCloud(leads[idx]);
  }

  // Persiste um array completo (ex.: edições pontuais como agenda),
  // mantendo cache e nuvem em sincronia.
  function save(leads, syncLead) {
    _persist(leads);
    if (syncLead) _syncCloud(syncLead);
  }

  function _syncCloud(lead) {
    if (!CONFIG?.SHEETS_URL) return;
    fetch(CONFIG.SHEETS_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(lead),
    }).catch(() => {});
  }

  function syncBeacon(lead) {
    if (!CONFIG?.SHEETS_URL || !lead?.nome) return;
    navigator.sendBeacon(CONFIG.SHEETS_URL, JSON.stringify(lead));
  }

  // Mantém o cache fresco quando outra aba/janela altera os leads.
  window.addEventListener('storage', e => {
    if (e.key === KEY) _cache = null;
  });

  return { getAll, upsert, updateStatus, save, syncBeacon };
})();
