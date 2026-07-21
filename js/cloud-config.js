/* ═══════════════════════════════════════════
   CONFIG NA NUVEM (produtos, campanhas de marketing)
   Fonte da verdade = aba "Config" da planilha. localStorage é só cache
   offline, pra funcionar mesmo antes da nuvem responder.
═══════════════════════════════════════════ */
let _cfgCloud  = {};
let _cfgLoaded = false;

async function loadCloudConfig() {
  try {
    const r = await fetch(CONFIG.SHEETS_URL + '?action=getConfig', { redirect: 'follow' });
    const c = await r.json();
    if (c && typeof c === 'object' && !Array.isArray(c)) _cfgCloud = c;
  } catch (_) { /* segue com cache local */ }
  _cfgLoaded = true;
  // Re-renderiza a página atual já com os dados da nuvem
  try { if (typeof renderDashboard === 'function') renderDashboard(false); } catch (_) {}
  return _cfgCloud;
}

// Lê uma config: nuvem (se carregada) → cache local → fallback
function cfgGet(key, fallback) {
  if (_cfgLoaded && _cfgCloud && _cfgCloud[key] != null) return _cfgCloud[key];
  try { const s = JSON.parse(localStorage.getItem('ndl_' + key) || 'null'); if (s != null) return s; } catch (_) {}
  return fallback;
}

// Salva uma config: cache local (imediato) + nuvem (planilha)
function cfgSet(key, value) {
  _cfgCloud[key] = value;
  _cfgLoaded = true;
  try { localStorage.setItem('ndl_' + key, JSON.stringify(value)); } catch (_) {}
  try {
    fetch(CONFIG.SHEETS_URL, {
      method: 'POST', mode: 'no-cors', headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ action: 'saveConfig', key, value }),
    }).catch(() => {});
  } catch (_) {}
}
