/* ═══════════════════════════════════════════
   ISCAS DIGITAIS (lead magnets)
   Você cria uma isca (material grátis) → ganha um link de formulário pra
   divulgar → o lead preenche → recebe o material no e-mail automaticamente
   e entra no CRM. Config salva na nuvem (cfg 'iscas').
═══════════════════════════════════════════ */
function getIscas() { return (typeof cfgGet === 'function' ? (cfgGet('iscas', []) || []) : []); }
function saveIscas(arr) { if (typeof cfgSet === 'function') cfgSet('iscas', arr); }

function renderIscas() {
  const el = document.getElementById('iscas-content');
  if (!el) return;
  const iscas = getIscas();
  const base = location.origin + '/isca.html?id=';
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  const form = `
    <div style="background:var(--s1);border:1px solid var(--bdr);border-radius:14px;padding:18px;margin-bottom:18px">
      <div style="font-weight:800;margin-bottom:12px">🎁 Nova isca (material grátis)</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <label style="flex:1;min-width:200px;font-size:.72rem;color:var(--ts)">Nome interno (só você vê)
          <input id="isca-nome" placeholder="Aula grátis de Datilologia" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
        <label style="flex:1;min-width:200px;font-size:.72rem;color:var(--ts)">Link do material (aula, PDF, vídeo…)
          <input id="isca-link" placeholder="https://..." style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
      </div>
      <label style="font-size:.72rem;color:var(--ts);display:block;margin-top:10px">Título público (aparece no formulário)
        <input id="isca-titulo" placeholder="Assista à aula gratuita de Libras" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
      <label style="font-size:.72rem;color:var(--ts);display:block;margin-top:10px">Descrição pública
        <textarea id="isca-desc" rows="2" placeholder="Preencha abaixo pra receber o acesso no seu e-mail." style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);resize:vertical"></textarea></label>
      <label style="font-size:.72rem;color:var(--ts);display:block;margin-top:10px">Assunto do e-mail de entrega
        <input id="isca-assunto" placeholder="🎁 Seu acesso à aula chegou, {nome}!" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text)"></label>
      <label style="font-size:.72rem;color:var(--ts);display:block;margin-top:10px">Corpo do e-mail de entrega (use {nome} e {link})
        <textarea id="isca-corpo" rows="4" placeholder="Oi {nome}! 💜&#10;&#10;Aqui está o seu acesso:&#10;{link}&#10;&#10;Bons estudos!" style="width:100%;padding:9px;border-radius:8px;border:1px solid var(--bdr);background:var(--bg);color:var(--text);resize:vertical"></textarea></label>
      <label style="display:flex;gap:6px;align-items:center;font-size:.8rem;margin:10px 0 14px;cursor:pointer"><input type="checkbox" id="isca-wpp"> Pedir também o WhatsApp no formulário</label>
      <button onclick="salvarIsca()" style="background:var(--g);color:#0b0b0d;border:none;font-weight:700;padding:10px 18px;border-radius:9px;cursor:pointer">➕ Criar isca</button>
    </div>`;

  const lista = iscas.length ? iscas.map(m => {
    const url = base + encodeURIComponent(m.id);
    return `<div style="background:var(--s1);border:1px solid var(--bdr);border-radius:12px;padding:14px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;gap:10px;align-items:start">
        <div style="min-width:0">
          <div style="font-weight:700">🎁 ${esc(m.nome || m.titulo)}</div>
          <div style="font-size:.74rem;color:var(--ts);margin-top:2px">${esc(m.titulo || '')}</div>
        </div>
        <button onclick="excluirIsca('${m.id}')" style="background:none;border:1px solid var(--bdr);color:var(--red);border-radius:7px;padding:4px 9px;cursor:pointer;font-size:.72rem">✕</button>
      </div>
      <div style="margin-top:10px;background:var(--bg);border:1px solid var(--bdr);border-radius:8px;padding:8px;font-size:.75rem;word-break:break-all;color:var(--blue)">${esc(url)}</div>
      <button onclick="copiarLinkIsca('${esc(url)}')" style="margin-top:8px;background:var(--s3);border:1px solid var(--bdr);color:var(--text);border-radius:7px;padding:6px 12px;cursor:pointer;font-size:.78rem">📋 Copiar link do formulário</button>
    </div>`;
  }).join('') : '<div style="color:var(--td);padding:16px;text-align:center;background:var(--s1);border:1px solid var(--bdr);border-radius:12px">Nenhuma isca criada ainda. Crie a primeira acima. 👆</div>';

  el.innerHTML = form + `<div style="font-weight:800;margin:6px 0 10px">📎 Minhas iscas</div>` + lista + `
    <div style="font-size:.74rem;color:var(--td);margin-top:14px;line-height:1.6;background:var(--s1);border:1px solid var(--bdr);border-radius:10px;padding:12px">
      ℹ️ <strong>Como funciona:</strong> divulgue o <strong>link do formulário</strong> (nos stories, bio, anúncio). Quem preencher recebe o material <strong>no e-mail na hora</strong> e entra no CRM como lead (origem "Isca"). Tudo automático. 🚀
    </div>`;
}

function salvarIsca() {
  const nome = (document.getElementById('isca-nome')?.value || '').trim();
  const link = (document.getElementById('isca-link')?.value || '').trim();
  if (!nome) { showToast('Dê um nome pra isca'); return; }
  if (!link) { showToast('Cole o link do material'); return; }
  const isca = {
    id: 'isca-' + Date.now().toString(36),
    nome,
    titulo: (document.getElementById('isca-titulo')?.value || nome).trim(),
    descricao: (document.getElementById('isca-desc')?.value || '').trim(),
    assuntoEmail: (document.getElementById('isca-assunto')?.value || '').trim(),
    corpoEmail: (document.getElementById('isca-corpo')?.value || '').trim(),
    linkMaterial: link,
    pedeWhatsapp: !!document.getElementById('isca-wpp')?.checked,
  };
  const arr = getIscas();
  arr.push(isca);
  saveIscas(arr);
  showToast('Isca criada ✓ 🎁');
  renderIscas();
}
function excluirIsca(id) {
  if (!confirm('Excluir esta isca? (o link do formulário para de funcionar)')) return;
  saveIscas(getIscas().filter(m => m.id !== id));
  renderIscas();
}
function copiarLinkIsca(url) {
  navigator.clipboard.writeText(url).then(() => showToast('Link copiado! 📋'));
}
