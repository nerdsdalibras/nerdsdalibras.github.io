/* ═══════════════════════════════════════════
   CLIENTES — quem comprou: histórico, LTV realizado, próxima melhor oferta
   Base: livro de vendas (getVendas) + leads (contato). Inclui também
   compradores antigos (status=comprou) que não estão no livro.
═══════════════════════════════════════════ */

const _LADDER = ['ebook', 'curso', 'mentoria'];
const _PROD_LABEL = { ebook: '📖 Ebook', curso: '📚 Curso', mentoria: '💎 Mentoria' };

// Próxima melhor oferta com base na escada de produtos já comprados
function proximaOferta(produtosSet) {
  let highest = -1;
  Object.keys(produtosSet || {}).forEach(g => { const i = _LADDER.indexOf(String(g).toLowerCase()); if (i > highest) highest = i; });
  if (highest < 0) return { key: 'curso', label: '📚 Curso Do Zero a Libras' };
  if (highest >= _LADDER.length - 1) return { key: 'topo', label: '⭐ Cliente topo — fidelizar' };
  const next = _LADDER[highest + 1];
  return { key: next, label: next === 'curso' ? '📚 Curso Do Zero a Libras' : '💎 Mentoria Ciclo da Fluência' };
}

// Agrupa as vendas (+ compradores antigos) por cliente. Retorna array.
async function _agruparClientes() {
  const leads  = cachedLeads || [];
  const vendas = await _getVendas();

  function achaLead(email, telefone, sessionId) {
    return leads.find(l =>
      (sessionId && l.sessionId === sessionId) ||
      (email && String(l.email || '').toLowerCase() === String(email).toLowerCase()) ||
      (telefone && String(l.whatsapp || '').replace(/\D/g, '').slice(-9) === String(telefone).replace(/\D/g, '').slice(-9))
    );
  }

  const map = {};
  vendas.forEach(v => {
    const key = v.sessionId || String(v.email || '').toLowerCase() || String(v.telefone || '');
    if (!key) return;
    if (!map[key]) {
      const lead = achaLead(v.email, v.telefone, v.sessionId);
      map[key] = { key, lead, nome: (lead && lead.nome) || v.email || 'Cliente', email: (lead && lead.email) || v.email, telefone: (lead && lead.whatsapp) || v.telefone, compras: [], total: 0, produtos: {}, ultima: '' };
    }
    map[key].compras.push(v);
    map[key].total += Number(v.valor) || 0;
    map[key].produtos[String(v.produto || '').toLowerCase()] = true;
    if (!map[key].ultima || new Date(v.data) > new Date(map[key].ultima)) map[key].ultima = v.data;
  });

  // Compradores antigos (status=comprou) que não estão no livro de vendas
  leads.filter(_comprou).forEach(l => {
    const key = l.sessionId || String(l.email || '').toLowerCase() || String(l.whatsapp || '');
    if (!key || map[key]) return;
    const g = grupoProduto(l);
    const val = parseFloat(String(l.valorPago || '').replace(',', '.')) || 0;
    map[key] = {
      key, lead: l, nome: l.nome || l.email || 'Cliente', email: l.email, telefone: l.whatsapp,
      compras: val > 0 ? [{ produto: g, valor: val, data: l.ultimaCompraEm || l.updatedAt }] : [],
      total: val, produtos: g ? { [g]: true } : {}, ultima: l.ultimaCompraEm || l.updatedAt || '',
      estimado: val === 0,
    };
  });

  return Object.values(map).sort((a, b) => b.total - a.total);
}

async function renderCustomers() {
  const el = document.getElementById('customers-content');
  if (!el) return;
  const brl = n => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const clientes = await _agruparClientes();

  const totalReceita = clientes.reduce((s, c) => s + c.total, 0);
  const ltvMedio = clientes.length ? totalReceita / clientes.length : 0;
  const recompra = clientes.filter(c => c.compras.length > 1).length;

  const topo = `
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:18px">
      <div style="flex:1;min-width:140px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">Clientes</div><div style="font-size:1.5rem;font-weight:900;color:var(--g)">${clientes.length}</div></div>
      <div style="flex:1;min-width:140px;background:var(--gd);border:1px solid var(--gg);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">Receita total</div><div style="font-size:1.5rem;font-weight:900;color:var(--g)">${brl(totalReceita)}</div></div>
      <div style="flex:1;min-width:140px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">LTV médio</div><div style="font-size:1.5rem;font-weight:900">${brl(ltvMedio)}</div></div>
      <div style="flex:1;min-width:140px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">Recompraram</div><div style="font-size:1.5rem;font-weight:900">${recompra}</div></div>
    </div>`;

  if (!clientes.length) {
    el.innerHTML = topo + '<div style="color:var(--td);padding:20px;text-align:center;background:var(--s1);border:1px solid var(--bdr);border-radius:14px">Ainda não há clientes registrados. Eles aparecem aqui quando uma compra é confirmada. 🛒</div>';
    return;
  }

  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = clientes.map(c => {
    const nbo = proximaOferta(c.produtos);
    const prods = Object.keys(c.produtos).filter(Boolean).map(g => _PROD_LABEL[g] || g).join(' ');
    const verBtn = c.lead ? `<button onclick="openLead('${c.lead.sessionId}')" style="background:var(--s3);border:1px solid var(--bdr);color:var(--text);border-radius:7px;padding:5px 10px;cursor:pointer;font-size:.75rem">Ver →</button>` : '';
    return `
      <tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:10px 8px"><div style="font-weight:700">${esc(c.nome)}</div><div style="font-size:.7rem;color:var(--td)">${esc(c.telefone || c.email || '')}</div></td>
        <td style="padding:10px 8px">${prods || '—'}</td>
        <td style="padding:10px 8px;text-align:center">${c.compras.length || 1}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:800;color:var(--g)">${brl(c.total)}${c.estimado ? '<span style="color:var(--td);font-weight:400"> (est.)</span>' : ''}</td>
        <td style="padding:10px 8px;font-size:.75rem;color:var(--ts)">${c.ultima ? new Date(c.ultima).toLocaleDateString('pt-BR') : '—'}</td>
        <td style="padding:10px 8px"><span style="font-size:.78rem;font-weight:700;color:${nbo.key === 'topo' ? 'var(--yellow)' : 'var(--blue)'}">${nbo.label}</span></td>
        <td style="padding:10px 8px;text-align:right">${verBtn}</td>
      </tr>`;
  }).join('');

  el.innerHTML = topo + `
    <div style="overflow-x:auto;background:var(--s1);border:1px solid var(--bdr);border-radius:14px">
      <table style="width:100%;border-collapse:collapse;font-size:.85rem;min-width:760px">
        <thead>
          <tr style="color:var(--ts);font-size:.68rem;text-transform:uppercase;text-align:left">
            <th style="padding:10px 8px">Cliente</th><th style="padding:10px 8px">Produtos</th>
            <th style="padding:10px 8px;text-align:center">Compras</th><th style="padding:10px 8px;text-align:right">Total gasto</th>
            <th style="padding:10px 8px">Última</th><th style="padding:10px 8px">Próxima melhor oferta</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
    <div style="font-size:.74rem;color:var(--td);margin-top:14px;line-height:1.6;background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:12px">
      ℹ️ A <strong>próxima melhor oferta</strong> segue a escada <strong>Ebook → Curso → Mentoria</strong>: sugere o próximo degrau que o cliente ainda não tem. <strong>(est.)</strong> = valor estimado (compra anterior à captura do valor real). Aumentar o LTV assim custa muito menos que adquirir um cliente novo. 🚀
    </div>`;
}
