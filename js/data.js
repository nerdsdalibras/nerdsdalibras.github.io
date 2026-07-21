/* ═══════════════════════════════════════════
   AUTH
═══════════════════════════════════════════ */
function checkPassword() {
  const input = document.getElementById('pwd-input');
  const err   = document.getElementById('pwd-err');
  if (input.value === CONFIG.DASHBOARD_PASSWORD) {
    sessionStorage.setItem('ndl_auth', '1');
    document.getElementById('password-screen').style.display = 'none';
    document.getElementById('app').removeAttribute('hidden');
    renderDashboard(true);
    startAutoRefresh();
  } else {
    err.textContent = 'Senha incorreta.';
    input.value = '';
    input.focus();
    setTimeout(() => { err.textContent = ''; }, 2500);
  }
}
function logout() {
  clearInterval(autoRefreshTimer);
  sessionStorage.removeItem('ndl_auth');
  document.getElementById('app').setAttribute('hidden', '');
  document.getElementById('password-screen').style.display = 'flex';
  document.getElementById('pwd-input').value = '';
}

/* ═══════════════════════════════════════════
   AUTO REFRESH
═══════════════════════════════════════════ */
function startAutoRefresh() {
  clearInterval(autoRefreshTimer);
  autoRefreshTimer = setInterval(() => renderDashboard(false), 60000);
}

/* ═══════════════════════════════════════════
   FETCH LEADS
═══════════════════════════════════════════ */
async function fetchLeads() {
  try {
    const url = CONFIG.SHEETS_URL + '?action=getLeads';
    const res = await fetch(url, { redirect: 'follow' });
    const data = await res.json();
    if (Array.isArray(data)) return data;
    return Storage.getAll();
  } catch {
    return Storage.getAll();
  }
}
async function getLeads(force = false) {
  const now = Date.now();
  if (!force && cachedLeads && (now - lastFetch) < 30000) return cachedLeads;
  cachedLeads = await fetchLeads();
  lastFetch   = now;
  return cachedLeads;
}

/* ═══════════════════════════════════════════
   NAVIGATION
═══════════════════════════════════════════ */
function setPage(page) {
  currentPage = page;
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('page-' + page).classList.add('active');
  document.querySelector(`[data-page="${page}"]`).classList.add('active');
  if (page === 'dashboard')       renderExecutive();
  else if (page === 'pipeline')   renderPipeline();
  else if (page === 'analytics')  renderAnalytics();
  else if (page === 'checkout')   renderCheckout();
  else if (page === 'products')   renderProducts();
  else if (page === 'campaigns')  renderCampaigns();
  else                            renderLeads();

  // Zera o contador de "novos" da aba visitada (Leads / Checkout)
  if (page === 'leads' || page === 'checkout') {
    marcaVisto(page);
    updateBadges(cachedLeads || []);
  }
}
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('open');
}

/* ── LOADING ── */
function setLoading(on) {
  const btn = document.querySelector('.icon-btn[title="Atualizar"]');
  if (btn) btn.style.opacity = on ? '.4' : '1';
}

