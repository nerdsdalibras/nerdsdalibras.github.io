const Storage = (() => {
  const KEY = 'ndl_leads';

  function getAll() {
    return JSON.parse(localStorage.getItem(KEY) || '[]');
  }

  function upsert(lead) {
    const leads = getAll();
    const idx = leads.findIndex(l => l.sessionId === lead.sessionId);
    const ts = new Date().toISOString();
    if (idx >= 0) {
      leads[idx] = { ...leads[idx], ...lead, updatedAt: ts };
    } else {
      leads.push({ ...lead, createdAt: ts, updatedAt: ts });
    }
    localStorage.setItem(KEY, JSON.stringify(leads));
    _syncCloud(idx >= 0 ? leads[idx] : leads[leads.length - 1]);
  }

  function updateStatus(sessionId, status, obs) {
    const leads = getAll();
    const idx = leads.findIndex(l => l.sessionId === sessionId);
    if (idx < 0) return;
    leads[idx].status = status;
    if (obs) leads[idx].observacoes = obs;
    leads[idx].updatedAt = new Date().toISOString();
    localStorage.setItem(KEY, JSON.stringify(leads));
    _syncCloud(leads[idx]);
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

  return { getAll, upsert, updateStatus, syncBeacon };
})();
