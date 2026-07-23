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
    <div style="display:flex;justify-content:flex-end;margin-bottom:12px">
      <button onclick="analisarComIA()" style="background:var(--purple);color:#0b0b0d;border:none;font-weight:700;padding:9px 16px;border-radius:9px;cursor:pointer">🧠 Analisar com IA</button>
    </div>
    <div id="ai-analysis" style="display:none;background:var(--s1);border:1px solid var(--bdrb);border-radius:14px;padding:16px;margin-bottom:22px;line-height:1.65;font-size:.9rem"></div>

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

/* ── Análise com IA (Claude, via Apps Script) ── */
function _mdToHtml(t) {
  return String(t || '')
    .replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^### (.+)$/gm, '<div style="font-weight:800;margin:10px 0 4px">$1</div>')
    .replace(/\n/g, '<br>');
}

// Monta um resumo compacto das métricas para a IA analisar
async function _resumoParaIA() {
  const leads  = cachedLeads || [];
  const vendas = await _getVendas();
  const camps  = (typeof getCampMkt === 'function') ? getCampMkt() : [];
  const prods  = (typeof getProdutos === 'function') ? getProdutos() : [];
  const custoDe = {}; prods.forEach(p => custoDe[p.grupo] = Number(p.custo) || 0);
  const investido = camps.reduce((s, c) => s + (Number(c.investimento) || 0), 0);

  let receita = 0, custo = 0; const cli = {};
  vendas.forEach(v => { receita += Number(v.valor) || 0; custo += (custoDe[String(v.produto || '').toLowerCase()] || 0); const k = v.sessionId || v.email; if (k) cli[k] = true; });
  const clientes = Object.keys(cli).length || vendas.length;
  const margem = receita - custo;

  const _tv = v => v === true || String(v).toLowerCase() === 'true';
  const funil = {
    leads: leads.length,
    iniciouQuiz: leads.filter(l => _tv(l.iniciouQuiz)).length,
    concluiuQuiz: leads.filter(l => _tv(l.concluiuQuiz)).length,
    checkout: leads.filter(l => l.clicouCheckout || l.checkoutEm || l.clicouOferta).length,
    comprou: leads.filter(_comprou).length,
  };

  const ck = s => (typeof _canalKey === 'function') ? _canalKey(s) : String(s || 'direto');
  const invC = {}; camps.forEach(c => { const k = ck(c.canal); invC[k] = (invC[k] || 0) + (Number(c.investimento) || 0); });
  const chan = {};
  leads.forEach(l => {
    const k = ck(l.utmSource || String(l.firstTouch || '').split(' ')[0]);
    if (!chan[k]) chan[k] = { leads: 0, clientes: 0, receita: 0 };
    chan[k].leads++;
    if (_comprou(l)) { chan[k].clientes++; chan[k].receita += parseFloat(String(l.valorPago || '').replace(',', '.')) || 0; }
  });
  const canais = Object.keys(chan).slice(0, 6).map(k => {
    const c = chan[k], inv = invC[k] || 0;
    return { canal: k, leads: c.leads, clientes: c.clientes, receita: Math.round(c.receita), cac: (inv && c.clientes) ? Math.round(inv / c.clientes) : null, roas: inv ? +(c.receita / inv).toFixed(2) : null };
  });
  const campanhas = camps.slice(0, 6).map(c => {
    const m = _metricasCampanha(c, leads);
    return { nome: c.nome, canal: c.canal, investido: m.inv, leads: m.leads, vendas: m.vendas, receita: Math.round(m.receita), cac: Math.round(m.cac), roas: +m.roas.toFixed(2) };
  });

  return {
    totais: {
      leads: leads.length, clientes, receita: Math.round(receita), investido: Math.round(investido),
      margem: Math.round(margem), lucro: Math.round(margem - investido),
      cac: clientes ? Math.round(investido / clientes) : null,
      ltv: clientes ? Math.round(margem / clientes) : null,
      roas: investido ? +(receita / investido).toFixed(2) : null,
    },
    funil, canais, campanhas,
  };
}

async function analisarComIA() {
  const box = document.getElementById('ai-analysis');
  if (!box) return;
  box.style.display = 'block';
  box.innerHTML = '🧠 Analisando seus números com IA…';
  try {
    const resumo = await _resumoParaIA();
    const r = await fetch(CONFIG.SHEETS_URL + '?action=aiAnalyze&data=' + encodeURIComponent(JSON.stringify(resumo)), { redirect: 'follow' });
    const j = await r.json();
    if (j.error) {
      box.innerHTML = `<div style="color:var(--red)">⚠️ ${_mdToHtml(j.error)}</div>`;
    } else if (j.text) {
      box.innerHTML = `<div style="font-weight:800;margin-bottom:8px">🧠 Diagnóstico da IA</div>${_mdToHtml(j.text)}`;
    } else if (Object.prototype.hasOwnProperty.call(j, 'text')) {
      // A função rodou, mas a IA voltou vazia (sobrecarga momentânea) → é só tentar de novo
      box.innerHTML = `<div style="color:var(--orange);line-height:1.6">⚠️ A IA respondeu vazio (sobrecarga momentânea). É só clicar em <strong>"🧠 Analisar com IA"</strong> de novo em alguns segundos. 🔄</div>`;
    } else {
      box.innerHTML = `<div style="color:var(--orange);line-height:1.6">⚠️ <strong>A IA não retornou análise.</strong><br>
        Provável causa: o <strong>Apps Script ainda não foi republicado</strong> com a função <code>aiAnalyze</code>.<br>
        Vá em <strong>Implantar → Gerenciar implantações → ✏️ → Nova versão → Implantar</strong> e tente de novo.<br>
        <span style="color:var(--td);font-size:.75rem">Resposta recebida: ${_mdToHtml(JSON.stringify(j).slice(0, 200))}</span></div>`;
    }
  } catch (e) {
    box.innerHTML = `<div style="color:var(--red)">Não consegui chamar a IA. Republicou o Apps Script e cadastrou a chave? (${e})</div>`;
  }
}
