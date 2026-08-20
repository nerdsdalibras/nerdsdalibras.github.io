/* ═══════════════════════════════════════════
   AFILIADOS — leads trazidos por cada afiliado
   Visão geral (cards por afiliado) → clique → leads daquele afiliado
   com o funil: captado → abriu o carrinho → comprou / não comprou.
═══════════════════════════════════════════ */

// Afiliado aberto no momento (slug) ou null para a visão geral
let afiliadoAtivo = null;
// Filtro do funil dentro do afiliado
let afiliadoFiltro = 'todos';

/* ── Identidade do afiliado a partir do lead ──
   Usa o campo `afiliado`; se faltar, tenta ler de "Origem: Afiliado · Nome". */
function _afiliadoSlug(l) {
  if (l.afiliado) return String(l.afiliado).toLowerCase().replace(/[^a-z0-9]+/g, '');
  const m = String(l.origem || '').match(/afiliad[oa]\s*[·:\-]\s*(.+)$/i);
  if (m) return m[1].toLowerCase().replace(/[^a-z0-9]+/g, '');
  return '';
}
function _afiliadoNome(l) {
  if (l.afiliadoNome) return String(l.afiliadoNome).trim();
  const m = String(l.origem || '').match(/afiliad[oa]\s*[·:\-]\s*(.+)$/i);
  if (m) return m[1].trim();
  const s = _afiliadoSlug(l);
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : '';
}

/* ── Etapa do lead no funil do afiliado ── */
function _afEtapa(l) {
  const ck = (typeof _checkoutStatus === 'function') ? _checkoutStatus(l) : { key: '' };
  if (ck.key === 'comprou')                    return { key: 'comprou',    label: '✅ Comprou',                  color: '#4ade80' };
  if (l.cartaoRecusado)                        return { key: 'naocomprou', label: '💳 Cartão recusado',          color: '#fb923c' };
  if (l.clicouCheckout || l.checkoutEm)        return { key: 'naocomprou', label: '🛒 Abriu o carrinho — não comprou', color: '#f87171' };
  return { key: 'captado', label: '📝 Lead captado', color: '#60a5fa' };
}

function _afValor(l) {
  return parseFloat(String(l.valorPago || '').replace(',', '.')) || 0;
}
function _afMoney(v) {
  return 'R$ ' + (v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/* ── Agrupa todos os leads por afiliado ── */
function _agruparAfiliados(leads) {
  const map = {};
  leads.forEach(l => {
    const slug = _afiliadoSlug(l);
    if (!slug) return;
    if (!map[slug]) {
      map[slug] = { slug, nome: _afiliadoNome(l) || slug, leads: [] };
    }
    if (!map[slug].nome || map[slug].nome === slug) {
      const n = _afiliadoNome(l);
      if (n) map[slug].nome = n;
    }
    map[slug].leads.push(l);
  });
  // Calcula métricas + ordena por faturamento desc
  const arr = Object.values(map).map(a => {
    const total    = a.leads.length;
    const checkout = a.leads.filter(l => l.clicouCheckout || l.checkoutEm).length;
    const comprou  = a.leads.filter(l => _afEtapa(l).key === 'comprou').length;
    const receita  = a.leads.reduce((s, l) => s + (_afEtapa(l).key === 'comprou' ? _afValor(l) : 0), 0);
    const naoComprou = total - comprou;
    const conv     = total ? Math.round((comprou / total) * 100) : 0;
    return { ...a, total, checkout, comprou, naoComprou, receita, conv };
  });
  arr.sort((x, y) => y.receita - x.receita || y.total - x.total);
  return arr;
}

function setAfiliadoFiltro(key) { afiliadoFiltro = key; renderAfiliados(); }

function abrirAfiliado(slug) {
  afiliadoAtivo = slug;
  afiliadoFiltro = 'todos';
  renderAfiliados();
}
function voltarAfiliados() {
  afiliadoAtivo = null;
  renderAfiliados();
}

/* ═══════════════════════════════════════════ */
async function renderAfiliados() {
  const leads = await getLeads();
  const afiliados = _agruparAfiliados(leads);
  const box = document.getElementById('afiliados-content');
  if (!box) return;

  if (!afiliados.length) {
    box.innerHTML = `
      <div class="af-empty">
        <div class="af-empty-icon">🤝</div>
        <h3>Nenhum lead de afiliado ainda</h3>
        <p>Assim que alguém preencher o formulário numa página de afiliado
        (ex.: <code>nerdsdalibras.com/afiliados.cris</code>), o lead aparece aqui
        já vinculado ao afiliado.</p>
      </div>`;
    return;
  }

  box.innerHTML = afiliadoAtivo
    ? _renderAfiliadoDetalhe(afiliados.find(a => a.slug === afiliadoAtivo), leads)
    : _renderAfiliadosOverview(afiliados);
}

/* ── VISÃO GERAL: ranking de afiliados ── */
function _renderAfiliadosOverview(afiliados) {
  const totLeads    = afiliados.reduce((s, a) => s + a.total, 0);
  const totVendas   = afiliados.reduce((s, a) => s + a.comprou, 0);
  const totReceita  = afiliados.reduce((s, a) => s + a.receita, 0);

  const stats = `
    <div class="ck-stats">
      <div class="ck-stat">       <div class="ck-stat-val">${afiliados.length}</div> <div class="ck-stat-lbl">Afiliados ativos</div></div>
      <div class="ck-stat">       <div class="ck-stat-val">${totLeads}</div>         <div class="ck-stat-lbl">Leads via afiliados</div></div>
      <div class="ck-stat green"> <div class="ck-stat-val">${totVendas}</div>        <div class="ck-stat-lbl">Vendas</div></div>
      <div class="ck-stat green"> <div class="ck-stat-val" style="font-size:1.15rem">${_afMoney(totReceita)}</div><div class="ck-stat-lbl">Faturamento</div></div>
    </div>`;

  const cards = afiliados.map(a => {
    const cor = getAvatarColor(a.slug);
    const inicial = (a.nome || a.slug).charAt(0).toUpperCase();
    const pctComprou = a.total ? (a.comprou / a.total) * 100 : 0;
    const pctCheckout = a.total ? (Math.max(a.checkout, a.comprou) / a.total) * 100 : 0;
    return `
      <button class="af-card" onclick="abrirAfiliado('${a.slug}')">
        <div class="af-card-head">
          <div class="af-avatar" style="background:${cor}22;color:${cor};border-color:${cor}55">${inicial}</div>
          <div class="af-card-id">
            <div class="af-card-name">${a.nome}</div>
            <div class="af-card-link">/afiliados.${a.slug}</div>
          </div>
          <div class="af-card-rev">
            <div class="af-card-rev-val">${_afMoney(a.receita)}</div>
            <div class="af-card-rev-lbl">faturado</div>
          </div>
        </div>
        <div class="af-bar" title="${a.comprou} compraram · ${a.checkout} abriram o carrinho · ${a.total} leads">
          <div class="af-bar-fill af-bar-checkout" style="width:${pctCheckout}%"></div>
          <div class="af-bar-fill af-bar-comprou"  style="width:${pctComprou}%"></div>
        </div>
        <div class="af-card-metrics">
          <div class="af-metric"><b>${a.total}</b><span>leads</span></div>
          <div class="af-metric"><b>${a.checkout}</b><span>carrinho</span></div>
          <div class="af-metric af-m-green"><b>${a.comprou}</b><span>vendas</span></div>
          <div class="af-metric"><b>${a.conv}%</b><span>conversão</span></div>
        </div>
        <div class="af-card-cta">Ver leads da ${a.nome} →</div>
      </button>`;
  }).join('');

  return stats + `<div class="af-grid">${cards}</div>`;
}

/* ── DETALHE: leads de um afiliado ── */
function _renderAfiliadoDetalhe(a, leads) {
  if (!a) { afiliadoAtivo = null; return _renderAfiliadosOverview(_agruparAfiliados(leads)); }
  const cor = getAvatarColor(a.slug);
  const inicial = (a.nome || a.slug).charAt(0).toUpperCase();

  const captados   = a.total;
  const carrinho   = Math.max(a.checkout, a.comprou);
  const comprou    = a.comprou;
  const naoComprou = a.naoComprou;

  const header = `
    <div class="af-detail-head">
      <button class="af-back" onclick="voltarAfiliados()">← Afiliados</button>
      <div class="af-avatar af-avatar-lg" style="background:${cor}22;color:${cor};border-color:${cor}55">${inicial}</div>
      <div class="af-detail-id">
        <div class="af-detail-name">${a.nome}</div>
        <a class="af-detail-link" href="https://nerdsdalibras.com/afiliados.${a.slug}" target="_blank" rel="noopener">nerdsdalibras.com/afiliados.${a.slug} ↗</a>
      </div>
      <div class="af-detail-rev">
        <div class="af-detail-rev-val">${_afMoney(a.receita)}</div>
        <div class="af-detail-rev-lbl">faturamento gerado</div>
      </div>
    </div>`;

  // Funil visual: captado → carrinho → comprou
  const funil = `
    <div class="af-funnel">
      ${_funilStep('📝', 'Leads captados', captados, captados, '#60a5fa')}
      ${_funilStep('🛒', 'Abriram o carrinho', carrinho, captados, '#fb923c')}
      ${_funilStep('✅', 'Compraram', comprou, captados, '#4ade80')}
      ${_funilStep('🚫', 'Não compraram', naoComprou, captados, '#f87171')}
    </div>`;

  const filtros = [
    { key: 'todos',      label: 'Todos',            n: a.total },
    { key: 'comprou',    label: '✅ Compraram',      n: comprou },
    { key: 'naocomprou', label: '🛒 Não compraram',  n: naoComprou },
    { key: 'captado',    label: '📝 Só captados',    n: a.leads.filter(l => _afEtapa(l).key === 'captado').length },
  ];
  const filterBar = `
    <div class="ck-filter">
      ${filtros.map(f => `
        <button class="filter-btn ${afiliadoFiltro === f.key ? 'active' : ''}" onclick="setAfiliadoFiltro('${f.key}')">
          ${f.label} <span class="filter-count">${f.n}</span>
        </button>`).join('')}
    </div>`;

  const ordenados = a.leads.slice().sort((x, y) =>
    new Date(y.checkoutEm || y.createdAt || 0) - new Date(x.checkoutEm || x.createdAt || 0));
  const filtrados = ordenados.filter(l => {
    if (afiliadoFiltro === 'todos') return true;
    return _afEtapa(l).key === afiliadoFiltro;
  });

  const rows = filtrados.map(l => {
    const et  = _afEtapa(l);
    const wpp = String(l.whatsapp || '').replace(/\D/g, '');
    const wHtml = wpp
      ? `<a href="#" onclick="contatarLead('${l.sessionId}', event)" title="Abrir no WhatsApp">${l.whatsapp}</a>`
      : '<span class="ck-muted">—</span>';
    const eHtml = l.email ? `<a href="mailto:${l.email}">${l.email}</a>` : '<span class="ck-muted">sem e-mail</span>';
    const dt  = l.checkoutEm ? formatDate(l.checkoutEm) : (l.createdAt ? formatDate(l.createdAt) : '—');
    const val = et.key === 'comprou' && _afValor(l) ? `<div class="af-val">${_afMoney(_afValor(l))}</div>` : '';
    return `
      <tr onclick="openLead('${l.sessionId}')">
        <td><div class="ck-name">${l.nome || 'Lead'}</div></td>
        <td class="ck-contact" onclick="event.stopPropagation()">📧 ${eHtml}<br>💬 ${wHtml}</td>
        <td class="ck-muted">${dt}</td>
        <td><span class="ck-badge" style="color:${et.color};border-color:${et.color}">${et.label}</span>${val}</td>
        <td class="ck-actions" onclick="event.stopPropagation()">
          ${wpp ? `<a class="quick-btn qb-wpp" href="#" onclick="contatarLead('${l.sessionId}', event)">💬</a>` : ''}
          <button class="quick-btn qb-open" onclick="openLead('${l.sessionId}')">Ver →</button>
        </td>
      </tr>`;
  }).join('');

  const table = filtrados.length ? `
    <div class="ck-table-wrap">
      <table class="ck-table">
        <thead><tr><th>Nome</th><th>Contato</th><th>Entrou em</th><th>Etapa</th><th></th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`
    : '<div class="ck-empty">Nenhum lead nesse filtro.</div>';

  return header + funil + filterBar + table;
}

function _funilStep(icon, label, n, base, color) {
  const pct = base ? Math.round((n / base) * 100) : 0;
  return `
    <div class="af-funnel-step">
      <div class="af-funnel-top"><span class="af-funnel-icon">${icon}</span><span class="af-funnel-num" style="color:${color}">${n}</span></div>
      <div class="af-funnel-lbl">${label}</div>
      <div class="af-funnel-bar"><div class="af-funnel-bar-fill" style="width:${pct}%;background:${color}"></div></div>
      <div class="af-funnel-pct">${pct}%</div>
    </div>`;
}
