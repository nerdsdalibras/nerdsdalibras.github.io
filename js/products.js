/* ═══════════════════════════════════════════
   PRODUTOS — preços, custos, margem, vendas
   Base financeira da Fase 2 (receita, margem, ticket, conversão por produto).
   Preços/custos ficam salvos no navegador (localStorage: ndl_produtos).
═══════════════════════════════════════════ */

// Produtos padrão, já pré-carregados com os preços que conhecemos.
const PRODUTOS_DEFAULT = [
  { id: 'ebook',    nome: '📖 Ebook — Caminho p/ Intérprete', grupo: 'ebook',    precoAtual: 19.90,   precoCheio: 97.90,   custo: 0 },
  { id: 'curso',    nome: '📚 Curso Do Zero a Libras',        grupo: 'curso',    precoAtual: 281.87,  precoCheio: 697.00,  custo: 0 },
  { id: 'mentoria', nome: '💎 Mentoria Ciclo da Fluência',    grupo: 'mentoria', precoAtual: 1997.00, precoCheio: 2997.00, custo: 0 },
];

function getProdutos() {
  try {
    const saved = JSON.parse(localStorage.getItem('ndl_produtos') || 'null');
    if (Array.isArray(saved) && saved.length) {
      // Mescla com o default (caso surjam campos novos)
      return PRODUTOS_DEFAULT.map(d => {
        const s = saved.find(x => x.id === d.id);
        return s ? { ...d, ...s } : { ...d };
      });
    }
  } catch (_) {}
  return PRODUTOS_DEFAULT.map(p => ({ ...p }));
}
function saveProdutos(arr) { try { localStorage.setItem('ndl_produtos', JSON.stringify(arr)); } catch (_) {} }

function _brl(n) { return (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

// Um lead "comprou" quando o status é comprou ou o webhook confirmou
function _comprou(l) {
  return l.status === 'comprou' || l.comprouKiwify === true || String(l.comprouKiwify).toLowerCase() === 'true';
}

// Métricas de um produto a partir dos leads
function _metricasProduto(grupo, leads) {
  const doGrupo   = (leads || []).filter(l => grupoProduto(l) === grupo);
  const vendas    = doGrupo.filter(_comprou).length;
  const checkouts = doGrupo.filter(l => l.clicouCheckout || l.checkoutEm || l.clicouOferta).length;
  return {
    leads: doGrupo.length,
    checkouts,
    vendas,
    convLead:     doGrupo.length ? (vendas / doGrupo.length * 100) : 0,
    convCheckout: checkouts ? (vendas / checkouts * 100) : 0,
  };
}

function renderProducts() {
  const el = document.getElementById('products-content');
  if (!el) return;
  const leads = cachedLeads || [];
  const prods = getProdutos();

  let totReceita = 0, totMargem = 0, totVendas = 0;

  const cards = prods.map((p, i) => {
    const m = _metricasProduto(p.grupo, leads);
    const preco  = Number(p.precoAtual) || 0;
    const custo  = Number(p.custo) || 0;
    const receita = m.vendas * preco;
    const margemU = preco - custo;
    const margem  = m.vendas * margemU;
    const margemPct = preco > 0 ? Math.round(margemU / preco * 100) : 0;
    totReceita += receita; totMargem += margem; totVendas += m.vendas;

    const inp = (f, val) => `<input type="number" step="0.01" min="0" data-i="${i}" data-f="${f}" value="${val}"
      style="width:100%;padding:8px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);font-size:.9rem">`;
    const stat = (label, val, cor) => `<div style="flex:1;min-width:110px"><div style="font-size:.66rem;color:var(--td);text-transform:uppercase;letter-spacing:.04em">${label}</div><div style="font-size:1.05rem;font-weight:800;color:${cor || 'var(--text)'}">${val}</div></div>`;

    return `
      <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:18px;margin-bottom:14px">
        <div style="font-size:1.05rem;font-weight:800;margin-bottom:14px">${p.nome}</div>

        <div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">
          <label style="flex:1;min-width:120px;font-size:.72rem;color:var(--ts)">Preço atual (R$)${inp('precoAtual', p.precoAtual)}</label>
          <label style="flex:1;min-width:120px;font-size:.72rem;color:var(--ts)">Preço cheio (R$)${inp('precoCheio', p.precoCheio)}</label>
          <label style="flex:1;min-width:120px;font-size:.72rem;color:var(--ts)">Custo por venda (R$)${inp('custo', p.custo)}</label>
        </div>

        <div style="display:flex;gap:14px;flex-wrap:wrap;padding-top:14px;border-top:1px solid var(--bdr)">
          ${stat('Vendas', m.vendas, 'var(--g)')}
          ${stat('Receita (estim.)', _brl(receita), 'var(--g)')}
          ${stat('Margem', _brl(margem), margem >= 0 ? 'var(--g)' : 'var(--red)')}
          ${stat('Margem %', margemPct + '%')}
          ${stat('Ticket médio', _brl(preco))}
          ${stat('Leads no grupo', m.leads)}
          ${stat('Foram ao checkout', m.checkouts)}
          ${stat('Conv. lead→venda', m.convLead.toFixed(1) + '%')}
        </div>
      </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin-bottom:16px">
      <div style="flex:1;min-width:160px;background:var(--gd);border:1px solid var(--gg);border-radius:14px;padding:16px">
        <div style="font-size:.7rem;color:var(--ts);text-transform:uppercase">Receita total (estimada)</div>
        <div style="font-size:1.8rem;font-weight:900;color:var(--g)">${_brl(totReceita)}</div>
      </div>
      <div style="flex:1;min-width:160px;background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:16px">
        <div style="font-size:.7rem;color:var(--ts);text-transform:uppercase">Margem total</div>
        <div style="font-size:1.8rem;font-weight:900">${_brl(totMargem)}</div>
      </div>
      <div style="flex:1;min-width:120px;background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:16px">
        <div style="font-size:.7rem;color:var(--ts);text-transform:uppercase">Vendas totais</div>
        <div style="font-size:1.8rem;font-weight:900">${totVendas}</div>
      </div>
    </div>

    ${cards}

    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-top:4px">
      <button onclick="salvarProdutosUI()" style="background:var(--g);color:#0b0b0d;border:none;font-weight:700;padding:10px 18px;border-radius:9px;cursor:pointer">💾 Salvar preços</button>
      <span style="font-size:.74rem;color:var(--td)">Preencha o <strong>custo por venda</strong> (taxas da plataforma, comissões, etc.) para a margem ficar real.</span>
    </div>

    <div style="font-size:.74rem;color:var(--td);margin-top:16px;line-height:1.6;background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:12px">
      ℹ️ <strong>Sobre a receita:</strong> por enquanto é <em>estimada</em> (nº de vendas × preço atual). O próximo passo da Fase 2 é capturar o <strong>valor real pago</strong> direto dos webhooks da Kiwify/Eduzz, aí a receita e o LTV ficam exatos. Os preços que você define aqui ficam salvos neste navegador.
    </div>`;
}

function salvarProdutosUI() {
  const prods = getProdutos();
  document.querySelectorAll('#products-content input[data-i]').forEach(inp => {
    const i = +inp.dataset.i, f = inp.dataset.f;
    if (prods[i]) prods[i][f] = parseFloat(String(inp.value).replace(',', '.')) || 0;
  });
  saveProdutos(prods);
  if (typeof showToast === 'function') showToast('Preços salvos ✓');
  renderProducts();
}
