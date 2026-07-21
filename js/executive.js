/* ═══════════════════════════════════════════
   DASHBOARD EXECUTIVO — situação da empresa num relance
   Bloco Hoje + Bloco Período + Eficiência (CAC, LTV, ROAS, LTV/CAC, ROI).
   Usa: leads (cachedLeads), livro de vendas (getVendas), produtos
   (getProdutos → custo) e campanhas (getCampMkt → investimento).
═══════════════════════════════════════════ */

let _execPeriodo = '30d';
function setExecPeriodo(k) { _execPeriodo = k; renderExecutive(); }

function _brlE(n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }
function _mesmoDia(a, b) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}
function _rangePeriodo(key) {
  const now = new Date();
  let start;
  if (key === 'hoje')      { start = new Date(now.getFullYear(), now.getMonth(), now.getDate()); }
  else if (key === '7d')   { start = new Date(now); start.setDate(now.getDate() - 6); start.setHours(0, 0, 0, 0); }
  else if (key === 'mes')  { start = new Date(now.getFullYear(), now.getMonth(), 1); }
  else                     { start = new Date(now); start.setDate(now.getDate() - 29); start.setHours(0, 0, 0, 0); } // 30d
  return { start: start.getTime(), end: now.getTime() };
}

async function renderExecutive() {
  const el = document.getElementById('exec-content');
  if (!el) return;
  const leads  = cachedLeads || [];
  const vendas = await _getVendas();                 // livro de vendas (receita real)
  const prods  = getProdutos();
  const camps  = (typeof getCampMkt === 'function') ? getCampMkt() : [];

  // custo por grupo de produto
  const custoDe = {};
  prods.forEach(p => { custoDe[p.grupo] = Number(p.custo) || 0; });

  const investido = camps.reduce((s, c) => s + (Number(c.investimento) || 0), 0);
  const now = new Date();

  // ── TOTAIS (geral) a partir do livro de vendas ──
  let receitaTotal = 0, custoTotal = 0;
  const clientesSet = {};
  vendas.forEach(v => {
    receitaTotal += Number(v.valor) || 0;
    custoTotal   += (custoDe[String(v.produto || '').toLowerCase()] || 0);
    const k = v.sessionId || v.email || v.telefone;
    if (k) clientesSet[k] = true;
  });
  const clientes = Object.keys(clientesSet).length || vendas.length;
  const margem = receitaTotal - custoTotal;
  const lucro  = margem - investido;
  const cac    = clientes > 0 ? investido / clientes : 0;
  const ltv    = clientes > 0 ? margem / clientes : 0;      // LTV realizado = margem por cliente
  const ltvCac = cac > 0 ? ltv / cac : 0;
  const roas   = investido > 0 ? receitaTotal / investido : 0;
  const roi    = investido > 0 ? (lucro / investido) * 100 : 0;

  // ── HOJE ──
  const novosHoje = leads.filter(l => l.createdAt && _mesmoDia(new Date(l.createdAt), now)).length;
  const contatadosHoje = leads.filter(l => l.contatadoEm && _mesmoDia(new Date(l.contatadoEm), now)).length;
  const vendasHoje = vendas.filter(v => v.data && _mesmoDia(new Date(v.data), now));
  const receitaHoje = vendasHoje.reduce((s, v) => s + (Number(v.valor) || 0), 0);

  // ── PERÍODO ──
  const { start, end } = _rangePeriodo(_execPeriodo);
  const noRange = (d) => { if (!d) return false; const t = new Date(d).getTime(); return t >= start && t <= end; };
  const leadsP = leads.filter(l => noRange(l.createdAt)).length;
  const vendasP = vendas.filter(v => noRange(v.data));
  const receitaP = vendasP.reduce((s, v) => s + (Number(v.valor) || 0), 0);
  const clientesPset = {};
  vendasP.forEach(v => { const k = v.sessionId || v.email || v.telefone; if (k) clientesPset[k] = true; });
  const clientesP = Object.keys(clientesPset).length || vendasP.length;
  const ticketP = clientesP > 0 ? receitaP / clientesP : 0;

  // helpers de UI
  const tile = (label, val, cor, sub) => `
    <div style="flex:1;min-width:135px;background:var(--s1);border:1px solid var(--bdr);border-radius:13px;padding:15px">
      <div style="font-size:.66rem;color:var(--ts);text-transform:uppercase;letter-spacing:.04em">${label}</div>
      <div style="font-size:1.5rem;font-weight:900;color:${cor || 'var(--text)'};line-height:1.2;margin-top:4px">${val}</div>
      ${sub ? `<div style="font-size:.68rem;color:var(--td);margin-top:2px">${sub}</div>` : ''}
    </div>`;

  const ltvCacCor = ltvCac >= 3 ? 'var(--g)' : ltvCac >= 1 ? 'var(--yellow)' : (ltvCac > 0 ? 'var(--red)' : 'var(--td)');
  const perBtn = (k, lbl) => `<button onclick="setExecPeriodo('${k}')" class="filter-btn ${_execPeriodo === k ? 'active' : ''}">${lbl}</button>`;

  el.innerHTML = `
    <div style="font-size:.8rem;font-weight:800;color:var(--ts);text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">📌 Hoje</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:26px">
      ${tile('Novos leads', novosHoje, 'var(--blue)')}
      ${tile('Contatados', contatadosHoje)}
      ${tile('Vendas', vendasHoje.length, 'var(--g)')}
      ${tile('Receita', _brlE(receitaHoje), 'var(--g)')}
    </div>

    <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:10px">
      <div style="font-size:.8rem;font-weight:800;color:var(--ts);text-transform:uppercase;letter-spacing:.05em">📆 Período</div>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        ${perBtn('hoje', 'Hoje')} ${perBtn('7d', '7 dias')} ${perBtn('30d', '30 dias')} ${perBtn('mes', 'Este mês')}
      </div>
    </div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:26px">
      ${tile('Leads', leadsP, 'var(--blue)')}
      ${tile('Clientes', clientesP, 'var(--g)')}
      ${tile('Receita', _brlE(receitaP), 'var(--g)')}
      ${tile('Ticket médio', _brlE(ticketP))}
    </div>

    <div style="font-size:.8rem;font-weight:800;color:var(--ts);text-transform:uppercase;letter-spacing:.05em;margin:0 0 10px">💹 Eficiência (geral)</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap">
      ${tile('Investido (mkt)', _brlE(investido))}
      ${tile('Receita total', _brlE(receitaTotal), 'var(--g)')}
      ${tile('Margem contrib.', _brlE(margem), margem >= 0 ? 'var(--g)' : 'var(--red)')}
      ${tile('Lucro', _brlE(lucro), lucro >= 0 ? 'var(--g)' : 'var(--red)', 'receita − custos − mkt')}
      ${tile('CAC', investido > 0 ? _brlE(cac) : '—', 'var(--text)', 'custo por cliente')}
      ${tile('LTV médio', clientes > 0 ? _brlE(ltv) : '—', 'var(--text)', 'margem por cliente')}
      ${tile('LTV / CAC', (investido > 0 && cac > 0) ? ltvCac.toFixed(1) + 'x' : '—', ltvCacCor, '≥3x saudável')}
      ${tile('ROAS', investido > 0 ? roas.toFixed(2) + 'x' : '—', roas >= 1 ? 'var(--g)' : 'var(--orange)', 'receita ÷ mkt')}
      ${tile('ROI', investido > 0 ? roi.toFixed(0) + '%' : '—', roi >= 0 ? 'var(--g)' : 'var(--red)', 'lucro ÷ mkt')}
      ${tile('Clientes', clientes, 'var(--g)')}
    </div>

    <div style="font-size:.74rem;color:var(--td);margin-top:20px;line-height:1.6;background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:12px">
      ℹ️ <strong>Hoje</strong> e <strong>Período</strong> são exatos por data (leads e vendas reais). A <strong>Eficiência</strong> usa totais gerais: a receita vem do valor real pago, o custo vem do que você cadastrou em Produtos, e o investimento é a soma das Campanhas. Quando você quiser CAC/ROAS <em>por período</em>, a gente adiciona datas ao investimento. 💡
    </div>`;
}
