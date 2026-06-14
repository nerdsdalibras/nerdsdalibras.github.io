/* ── STATE ── */
let filtroAtivo   = 'todos';
let currentLead   = null;
let currentTab    = 'dados';
let currentPage   = 'leads';
let cachedLeads   = null;
let lastFetch     = 0;
let autoRefreshTimer = null;
let selectedLeads = new Set();
let sortOrder     = 'date_desc';
let tagFilter     = null;
let isDarkTheme   = true;

