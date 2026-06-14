/* ═══════════════════════════════════════════
   THEME
═══════════════════════════════════════════ */
function toggleTheme() {
  isDarkTheme = !isDarkTheme;
  document.documentElement.classList.toggle('light-theme', !isDarkTheme);
  localStorage.setItem('ndl_theme', isDarkTheme ? 'dark' : 'light');
  const btn = document.getElementById('theme-btn');
  if (btn) btn.textContent = isDarkTheme ? '☀' : '🌙';
}

/* ═══════════════════════════════════════════
   TOAST
═══════════════════════════════════════════ */
function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2500);
}

/* ═══════════════════════════════════════════
   SORT
═══════════════════════════════════════════ */
function onSortChange() {
  sortOrder = document.getElementById('sort-select')?.value || 'date_desc';
  renderLeads();
}
function sortLeads(leads) {
  const s = [...leads];
  switch (sortOrder) {
    case 'date_desc':  return s.sort((a,b) => new Date(b.createdAt||0) - new Date(a.createdAt||0));
    case 'date_asc':   return s.sort((a,b) => new Date(a.createdAt||0) - new Date(b.createdAt||0));
    case 'score_desc': return s.sort((a,b) => (b.pontuacao||0) - (a.pontuacao||0));
    case 'score_asc':  return s.sort((a,b) => (a.pontuacao||0) - (b.pontuacao||0));
    case 'nome_asc':   return s.sort((a,b) => (a.nome||'').localeCompare(b.nome||'','pt-BR'));
    default: return s;
  }
}

