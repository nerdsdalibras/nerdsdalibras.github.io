/* ═══════════════════════════════════════════
   CAMPANHAS DE MARKETING (aquisição)
   Você registra o investimento; o CRM calcula CAC, CPL, ROAS, conversão
   e ticket, casando as vendas pela utm_campaign do lead.
   Registro salvo no navegador (localStorage: ndl_camp_mkt).
═══════════════════════════════════════════ */

function getCampMkt() {
  const a = (typeof cfgGet === 'function') ? cfgGet('camp_mkt', null) : null;
  if (Array.isArray(a)) return a;
  return [];
}
function saveCampMkt(a) {
  if (typeof cfgSet === 'function') cfgSet('camp_mkt', a);
  else try { localStorage.setItem('ndl_camp_mkt', JSON.stringify(a)); } catch (_) {}
}

// Métricas de uma campanha a partir dos leads (casadas por utm_campaign)
function _metricasCampanha(camp, leads) {
  const nome = String(camp.nome || '').toLowerCase().trim();
  const doC = nome ? (leads || []).filter(l => String(l.utmCampaign || '').toLowerCase().trim() === nome) : [];
  const compradores = doC.filter(_comprou);
  let receita = 0;
  compradores.forEach(l => { receita += parseFloat(String(l.valorPago || '').replace(',', '.')) || 0; });
  const inv = Number(camp.investimento) || 0;
  const leadsN = doC.length, vendas = compradores.length;
  return {
    leads: leadsN, vendas, receita, inv,
    cac:    vendas > 0 ? inv / vendas : 0,
    cpl:    leadsN > 0 ? inv / leadsN : 0,
    conv:   leadsN > 0 ? vendas / leadsN * 100 : 0,
    ticket: vendas > 0 ? receita / vendas : 0,
    roas:   inv > 0 ? receita / inv : 0,
  };
}

// Nomes de campanha já presentes nos leads (pra sugerir no campo)
function _campanhasNosLeads(leads) {
  const set = {};
  (leads || []).forEach(l => { const c = String(l.utmCampaign || '').trim(); if (c) set[c] = true; });
  return Object.keys(set).sort();
}

function renderCampaigns() {
  const el = document.getElementById('campaigns-content');
  if (!el) return;
  const leads = cachedLeads || [];
  const camps = getCampMkt();
  const brl = (n) => (Number(n) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

  const sugestoes = _campanhasNosLeads(leads);
  const dataList = `<datalist id="camp-nomes">${sugestoes.map(s => `<option value="${s.replace(/"/g, '&quot;')}">`).join('')}</datalist>`;

  const canalOpts = ['Meta Ads', 'Google Ads', 'Instagram', 'YouTube', 'TikTok', 'Orgânico', 'Outro']
    .map(c => `<option value="${c}">${c}</option>`).join('');

  // ── Formulário de nova campanha ──
  const form = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:16px;margin-bottom:18px">
      <div style="font-weight:800;margin-bottom:12px">➕ Nova campanha</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">
        <label style="flex:2;min-width:180px;font-size:.72rem;color:var(--ts)">Nome (= utm_campaign)
          <input id="camp-nome" list="camp-nomes" placeholder="interprete_ebook_julho26"
            style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
        <label style="flex:1;min-width:120px;font-size:.72rem;color:var(--ts)">Canal
          <select id="camp-canal" style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)">${canalOpts}</select></label>
        <label style="flex:1;min-width:110px;font-size:.72rem;color:var(--ts)">Investimento (R$)
          <input id="camp-inv" type="number" step="0.01" min="0" placeholder="5000"
            style="width:100%;padding:9px 10px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
        <button onclick="addCampanha()" style="background:var(--g);color:#0b0b0d;border:none;font-weight:700;padding:10px 16px;border-radius:9px;cursor:pointer">Adicionar</button>
      </div>
      ${dataList}
      <div style="font-size:.72rem;color:var(--td);margin-top:8px">💡 O <strong>nome</strong> tem que ser igual ao <strong>utm_campaign</strong> do anúncio, pra casar as vendas. O campo sugere as campanhas que já apareceram nos leads.</div>
    </div>`;

  // ── Totais ──
  let tInv = 0, tRec = 0, tLeads = 0, tVendas = 0;
  const rows = camps.map((c, i) => {
    const m = _metricasCampanha(c, leads);
    tInv += m.inv; tRec += m.receita; tLeads += m.leads; tVendas += m.vendas;
    const roasCor = m.roas >= 1 ? 'var(--g)' : (m.roas > 0 ? 'var(--orange)' : 'var(--td)');
    return `
      <tr style="border-bottom:1px solid var(--bdr)">
        <td style="padding:10px 8px"><div style="font-weight:700">${(c.nome || '—')}</div><div style="font-size:.7rem;color:var(--td)">${c.canal || ''}</div></td>
        <td style="padding:10px 8px;text-align:right">${brl(m.inv)}</td>
        <td style="padding:10px 8px;text-align:right">${m.leads}</td>
        <td style="padding:10px 8px;text-align:right">${m.vendas}</td>
        <td style="padding:10px 8px;text-align:right;color:var(--g)">${brl(m.receita)}</td>
        <td style="padding:10px 8px;text-align:right">${brl(m.cpl)}</td>
        <td style="padding:10px 8px;text-align:right">${brl(m.cac)}</td>
        <td style="padding:10px 8px;text-align:right">${m.conv.toFixed(1)}%</td>
        <td style="padding:10px 8px;text-align:right">${brl(m.ticket)}</td>
        <td style="padding:10px 8px;text-align:right;font-weight:800;color:${roasCor}">${m.roas.toFixed(2)}x</td>
        <td style="padding:10px 8px;text-align:right"><button onclick="excluirCampanha(${i})" style="background:none;border:none;color:var(--red);cursor:pointer;font-size:.9rem">✕</button></td>
      </tr>`;
  }).join('');

  const roasTotal = tInv > 0 ? (tRec / tInv) : 0;
  const cacTotal  = tVendas > 0 ? (tInv / tVendas) : 0;

  const tabela = camps.length ? `
    <div style="overflow-x:auto;background:var(--s1);border:1px solid var(--bdr);border-radius:14px">
      <table style="width:100%;border-collapse:collapse;font-size:.83rem;min-width:820px">
        <thead>
          <tr style="text-align:right;color:var(--ts);font-size:.68rem;text-transform:uppercase">
            <th style="padding:10px 8px;text-align:left">Campanha</th>
            <th style="padding:10px 8px">Investido</th><th style="padding:10px 8px">Leads</th>
            <th style="padding:10px 8px">Vendas</th><th style="padding:10px 8px">Receita</th>
            <th style="padding:10px 8px">CPL</th><th style="padding:10px 8px">CAC</th>
            <th style="padding:10px 8px">Conv.</th><th style="padding:10px 8px">Ticket</th>
            <th style="padding:10px 8px">ROAS</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>` : '<div style="color:var(--td);padding:20px;text-align:center;background:var(--s1);border:1px solid var(--bdr);border-radius:14px">Nenhuma campanha cadastrada ainda. Adicione a primeira acima. 👆</div>';

  const totais = camps.length ? `
    <div style="display:flex;gap:14px;flex-wrap:wrap;margin:16px 0">
      <div style="flex:1;min-width:130px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">Investido</div><div style="font-size:1.4rem;font-weight:900">${brl(tInv)}</div></div>
      <div style="flex:1;min-width:130px;background:var(--gd);border:1px solid var(--gg);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">Receita</div><div style="font-size:1.4rem;font-weight:900;color:var(--g)">${brl(tRec)}</div></div>
      <div style="flex:1;min-width:100px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">CAC médio</div><div style="font-size:1.4rem;font-weight:900">${brl(cacTotal)}</div></div>
      <div style="flex:1;min-width:100px;background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px"><div style="font-size:.66rem;color:var(--ts);text-transform:uppercase">ROAS geral</div><div style="font-size:1.4rem;font-weight:900;color:${roasTotal>=1?'var(--g)':'var(--orange)'}">${roasTotal.toFixed(2)}x</div></div>
    </div>` : '';

  el.innerHTML = form + totais + tabela + `
    <div style="font-size:.74rem;color:var(--td);margin-top:16px;line-height:1.6;background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:12px">
      ℹ️ <strong>CAC</strong> = investido ÷ vendas · <strong>CPL</strong> = investido ÷ leads · <strong>ROAS</strong> = receita ÷ investido.
      A receita usa o <strong>valor real pago</strong> (dos webhooks) dos clientes daquela campanha. Campanhas/vendas anteriores à captura de UTM podem aparecer com receita menor. Os dados ficam salvos neste navegador.
    </div>`;
}

function addCampanha() {
  const nome = (document.getElementById('camp-nome')?.value || '').trim();
  const canal = document.getElementById('camp-canal')?.value || '';
  const inv = parseFloat(String(document.getElementById('camp-inv')?.value || '').replace(',', '.')) || 0;
  if (!nome) { showToast('Dê o nome da campanha (= utm_campaign)'); return; }
  const camps = getCampMkt();
  camps.push({ nome, canal, investimento: inv });
  saveCampMkt(camps);
  showToast('Campanha adicionada ✓');
  renderCampaigns();
}
function excluirCampanha(i) {
  const camps = getCampMkt();
  if (i < 0 || i >= camps.length) return;
  if (!confirm(`Excluir a campanha "${camps[i].nome}"?`)) return;
  camps.splice(i, 1);
  saveCampMkt(camps);
  renderCampaigns();
}
