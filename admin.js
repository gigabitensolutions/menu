// ====== Keys & PIN ======
const DEMO_KEY = 'mdl-overlay-v1';
const DELETED_KEY = 'mdl-deleted-v1';
const HISTORY_KEY = 'mdl-history-v1';
const PIN_KEY = 'mdl-admin-pin-hash';

const lockEl = document.getElementById('lock');
const appEl = document.getElementById('app');
const pinInput = document.getElementById('pinInput');
const pinConfirm = document.getElementById('pinConfirm');
const lockFirst = document.getElementById('lockFirst');

async function sha256(s){ const enc = new TextEncoder().encode(s); const hash = await crypto.subtle.digest('SHA-256', enc); return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,'0')).join(''); }

async function checkPin(){
  const saved = localStorage.getItem(PIN_KEY);
  if (!saved){
    lockFirst.style.display = 'block'; lockEl.style.display = 'flex';
    pinConfirm.onclick = async ()=>{
      if (!pinInput.value) return;
      const h = await sha256(pinInput.value);
      localStorage.setItem(PIN_KEY, h);
      pinInput.value = ''; lockEl.style.display = 'none'; appEl.style.display = 'block';
    };
  }else{
    lockFirst.style.display = 'none'; lockEl.style.display = 'flex';
    pinConfirm.onclick = async ()=>{
      const h = await sha256(pinInput.value);
      if (h === localStorage.getItem(PIN_KEY)){ pinInput.value = ''; lockEl.style.display = 'none'; appEl.style.display = 'block'; }
      else alert('PIN incorreto');
    };
  }
}
checkPin();

document.getElementById('btnChangePin').addEventListener('click', async ()=>{
  const current = prompt('PIN atual:'); if (current === null) return;
  const h = await sha256(current); if (h !== localStorage.getItem(PIN_KEY)) return alert('PIN atual incorreto');
  const next = prompt('Novo PIN:'); if (!next) return; const h2 = await sha256(next); localStorage.setItem(PIN_KEY, h2); alert('PIN atualizado.');
});
document.getElementById('btnLock').addEventListener('click', ()=>{ appEl.style.display = 'none'; lockEl.style.display = 'flex'; });

// ====== Overlay helpers ======
function loadOverlay(){ const arr = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]'); const del = JSON.parse(localStorage.getItem(DELETED_KEY) || '[]'); return { arr, del }; }
function saveOverlay(arr, del){ localStorage.setItem(DEMO_KEY, JSON.stringify(arr)); localStorage.setItem(DELETED_KEY, JSON.stringify(del)); }
function addOrUpdateOverlay(p){ const { arr, del } = loadOverlay(); const i = arr.findIndex(x => x.id === p.id); if (i >= 0) arr[i] = p; else arr.push(p); const di = del.indexOf(p.id); if (di >= 0) del.splice(di,1); saveOverlay(arr, del); }
function markDeleted(id){ const { arr, del } = loadOverlay(); const i = arr.findIndex(x => x.id === id); if (i >= 0) arr.splice(i,1); if (!del.includes(id)) del.push(id); saveOverlay(arr, del); }
function resetOverlay(){ localStorage.removeItem(DEMO_KEY); localStorage.removeItem(DELETED_KEY); }

// ====== History ======
function loadHist(){ return JSON.parse(localStorage.getItem(HISTORY_KEY) || '{}'); }
function saveHist(h){ localStorage.setItem(HISTORY_KEY, JSON.stringify(h)); }
function logMove(id, action, delta, before, after, note=''){ const h = loadHist(); if (!h[id]) h[id] = []; h[id].push({ ts: new Date().toISOString(), action, delta, before, after, note }); saveHist(h); }

// ====== Data ======
async function fetchBase(){ const res = await fetch('data/produtos.json', { cache: 'no-store' }); if (!res.ok) throw new Error('Falha ao carregar data/produtos.json'); return await res.json(); }
async function getMerged(){ const base = await fetchBase(); const { arr, del } = loadOverlay(); const map = new Map(base.map(p => [p.id, p])); del.forEach(id => map.delete(id)); arr.forEach(p => map.set(p.id, p)); return Array.from(map.values()); }

// ====== UI refs ======
const tbody = document.getElementById('tbody');
const statusEl = document.getElementById('status');
const q = document.getElementById('q');
const cat = document.getElementById('cat');
const sortSel = document.getElementById('sort');

const histModal = document.getElementById('histModal');
const histTitle = document.getElementById('histTitle');
const histSub = document.getElementById('histSub');
const histTable = document.getElementById('histTable').querySelector('tbody');
const btnHistClose = document.getElementById('btnHistClose');
const btnHistClear = document.getElementById('btnHistClear');
const btnHistExport = document.getElementById('btnHistExport');

// Editor
const f_nome = document.getElementById('f_nome');
const f_categoria = document.getElementById('f_categoria');
const f_volume = document.getElementById('f_volume');
const f_imagem = document.getElementById('f_imagem');
const f_estoque = document.getElementById('f_estoque');
const f_promo = document.getElementById('f_promo');
const f_destaque = document.getElementById('f_destaque');

const f_usar_tamanhos = document.getElementById('f_usar_tamanhos');
const f_p_t1 = document.getElementById('f_p_t1');
const f_p_t2 = document.getElementById('f_p_t2');
const f_p_t3 = document.getElementById('f_p_t3');
const f_c_t1 = document.getElementById('f_c_t1');
const f_c_t2 = document.getElementById('f_c_t2');
const f_c_t3 = document.getElementById('f_c_t3');
const f_l_t1 = document.getElementById('f_l_t1');
const f_l_t2 = document.getElementById('f_l_t2');
const f_l_t3 = document.getElementById('f_l_t3');

const f_preco = document.getElementById('f_preco');
const f_custo = document.getElementById('f_custo');

const sizesWrap = document.getElementById('sizesWrap');
const priceWrap = document.getElementById('priceWrap');

// Drag & drop image
const drop = document.getElementById('drop');
const preview = document.getElementById('preview');
drop.addEventListener('click', ()=>{ const inp = document.createElement('input'); inp.type='file'; inp.accept='image/*'; inp.addEventListener('change', ()=> readImage(inp.files?.[0])); inp.click(); });
drop.addEventListener('dragover', (e)=>{ e.preventDefault(); drop.classList.add('drag'); });
drop.addEventListener('dragleave', ()=> drop.classList.remove('drag'));
drop.addEventListener('drop', (e)=>{ e.preventDefault(); drop.classList.remove('drag'); const file = e.dataTransfer.files?.[0]; if (file) readImage(file); });
function readImage(file){ const fr = new FileReader(); fr.onload = ()=>{ const dataurl = fr.result; f_imagem.value = dataurl; preview.src = dataurl; preview.style.display='block'; }; fr.readAsDataURL(file); }

// ====== Logic ======
let ITEMS = [];
let selId = null;

function currency(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }
function norm(s){ return (s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(); }
function basePrice(p){ return p.tamanhos?.length ? Math.min(...p.tamanhos.map(t=>t.preco)) : (p.preco ?? 0); }
function baseCost(p){ if (p.tamanhos?.length){ const arr=(p.custos||[]).map(c=>c.custo).filter(x=>typeof x==='number'); return arr.length? Math.min(...arr) : 0; } return Number(p.custo||0); }
function marginPct(p){ const price = basePrice(p), cost = baseCost(p)||0; if (!price) return 0; return ((price - cost)/price)*100; }

function applyFilters(items){
  let arr = items.slice();
  const nq = norm(q.value);
  const wantCat = cat.value.trim();
  if (wantCat) arr = arr.filter(p => norm(p.categoria||'').includes(norm(wantCat)));
  if (nq) arr = arr.filter(p => norm(p.nome).includes(nq));
  switch (sortSel.value){
    case 'name-asc': arr.sort((a,b)=> norm(a.nome).localeCompare(norm(b.nome))); break;
    case 'name-desc': arr.sort((a,b)=> norm(b.nome).localeCompare(norm(a.nome))); break;
    case 'stock-asc': arr.sort((a,b)=> (a.estoque??0)-(b.estoque??0)); break;
    case 'stock-desc': arr.sort((a,b)=> (b.estoque??0)-(a.estoque??0)); break;
    case 'margin-desc': arr.sort((a,b)=> marginPct(b) - marginPct(a)); break;
    case 'margin-asc': arr.sort((a,b)=> marginPct(a) - marginPct(b)); break;
  }
  return arr;
}

function rowHTML(p){
  const preco = basePrice(p);
  const custo = baseCost(p) || 0;
  const mAbs = Math.max(0, preco - custo);
  const mPct = marginPct(p);
  const out = Number(p.estoque) === 0;
  const promo = p.promo ? `<span class="badge" style="margin-left:6px">Promo</span>` : '';
  const badge = p.destaque ? `<span class="badge" style="margin-left:6px">${p.destaque}</span>` : '';
  return `<tr class="row" data-id="${p.id}">
    <td><strong>${p.nome}</strong>${promo}${badge}</td>
    <td>${p.categoria||''} ${out?'<span class="badge out" style="margin-left:6px">Sem estoque</span>':''}</td>
    <td>${p.volume||''}</td>
    <td class="num">${currency(preco)}</td>
    <td class="num">${currency(custo)}</td>
    <td class="num">${currency(mAbs)} <span class="small">(${mPct.toFixed(1)}%)</span></td>
    <td class="num">
      <div style="display:flex;gap:6px;align-items:center;justify-content:flex-end">
        <button class="btnMinus" title="-1">–</button>
        <input class="inline est" type="number" step="1" min="0" value="${Number(p.estoque??0)}"/>
        <button class="btnPlus" title="+1">+</button>
      </div>
    </td>
    <td>
      <div style="display:flex;gap:6px;flex-wrap:wrap">
        <button class="btnSetZero">Zerar</button>
        <button class="btnAdj">Movimentar (±)</button>
        <button class="btnHist">Histórico</button>
        <button class="btnEdit">Editar</button>
        <button class="btnDel">Excluir</button>
      </div>
    </td>
  </tr>`;
}

function render(items){
  tbody.innerHTML = items.map(rowHTML).join('');
  const edits = JSON.parse(localStorage.getItem(DEMO_KEY)||'[]').length;
  statusEl.textContent = `${items.length} itens • overlay: ${edits} edit(s)`;
}

// Actions
tbody.addEventListener('click', (e)=>{
  const tr = e.target.closest('tr.row'); if (!tr) return;
  const id = tr.dataset.id; const p = ITEMS.find(x => x.id === id); if (!p) return;
  if (e.target.matches('.btnMinus')){
    const input = tr.querySelector('input.est'); const before = Number(input.value||0); input.value = Math.max(0, before - 1);
    p.estoque = Number(input.value); addOrUpdateOverlay(p); logMove(p.id, '-1', -1, before, p.estoque, ''); render(applyFilters(ITEMS));
  }
  if (e.target.matches('.btnPlus')){
    const input = tr.querySelector('input.est'); const before = Number(input.value||0); input.value = before + 1;
    p.estoque = Number(input.value); addOrUpdateOverlay(p); logMove(p.id, '+1', +1, before, p.estoque, ''); render(applyFilters(ITEMS));
  }
  if (e.target.matches('.btnSetZero')){
    const input = tr.querySelector('input.est'); const before = Number(input.value||0); input.value = 0;
    p.estoque = 0; addOrUpdateOverlay(p); logMove(p.id, 'zerar', -before, before, 0, 'Zerar estoque'); render(applyFilters(ITEMS));
  }
  if (e.target.matches('.btnAdj')){
    const val = prompt('Quantidade (positivo ou negativo):', '1'); if (val === null) return;
    const delta = Number(val); if (Number.isNaN(delta)) return alert('Valor inválido');
    const note = prompt('Nota (opcional):', '') || ''; const input = tr.querySelector('input.est');
    const before = Number(input.value||0); const after = Math.max(0, before + delta); input.value = after; p.estoque = after;
    addOrUpdateOverlay(p); logMove(p.id, 'ajuste', after-before, before, after, note); render(applyFilters(ITEMS));
  }
  if (e.target.matches('.btnDel')){ if (confirm('Excluir este item do overlay?')){ markDeleted(id); logMove(p.id, 'excluir', 0, p.estoque, p.estoque, 'Removido (overlay)'); boot(); } }
  if (e.target.matches('.btnEdit')){ openEditor(p); }
  if (e.target.matches('.btnHist')){ openHistory(p); }
});
tbody.addEventListener('change', (e)=>{
  const tr = e.target.closest('tr.row'); if (!tr) return; const id = tr.dataset.id; const p = ITEMS.find(x => x.id === id); if (!p) return;
  if (e.target.matches('input.est')){ const before = Number(p.estoque||0); const after = Number(e.target.value||0); p.estoque = after; addOrUpdateOverlay(p); if (after !== before) logMove(p.id, 'editar', after-before, before, after, 'Edição direta'); render(applyFilters(ITEMS)); }
});

q.addEventListener('input', ()=> render(applyFilters(ITEMS)));
cat.addEventListener('input', ()=> render(applyFilters(ITEMS)));
sortSel.addEventListener('change', ()=> render(applyFilters(ITEMS)));

// Editor
const f_im_controls = { sizesWrap, priceWrap, f_usar_tamanhos };
f_usar_tamanhos.addEventListener('change', ()=>{
  if (f_usar_tamanhos.checked){ sizesWrap.style.display='block'; priceWrap.style.display='none'; }
  else { sizesWrap.style.display='none'; priceWrap.style.display='block'; }
});

function fillEditor(p){
  selId = p?.id || null;
  f_nome.value = p?.nome || '';
  f_categoria.value = p?.categoria || '';
  f_volume.value = p?.volume || '';
  f_imagem.value = p?.imagem || 'img/placeholder.jpg';
  if (p?.imagem && p.imagem.startsWith('data:')){ preview.src = p.imagem; preview.style.display='block'; } else { preview.style.display='none'; }
  f_estoque.value = Number(p?.estoque ?? 0);
  f_promo.checked = !!p?.promo;
  f_destaque.value = p?.destaque || '';

  const useSizes = Array.isArray(p?.tamanhos) && p.tamanhos.length > 0;
  f_usar_tamanhos.checked = useSizes;
  if (useSizes){
    sizesWrap.style.display='block'; priceWrap.style.display='none';
    f_p_t1.value = p?.tamanhos?.[0]?.preco ?? ''; f_c_t1.value = p?.custos?.[0]?.custo ?? ''; f_l_t1.value = p?.tamanhos?.[0]?.rotulo || '';
    f_p_t2.value = p?.tamanhos?.[1]?.preco ?? ''; f_c_t2.value = p?.custos?.[1]?.custo ?? ''; f_l_t2.value = p?.tamanhos?.[1]?.rotulo || '';
    f_p_t3.value = p?.tamanhos?.[2]?.preco ?? ''; f_c_t3.value = p?.custos?.[2]?.custo ?? ''; f_l_t3.value = p?.tamanhos?.[2]?.rotulo || '';
  } else {
    sizesWrap.style.display='none'; priceWrap.style.display='block';
    f_preco.value = p?.preco ?? 0; f_custo.value = p?.custo ?? 0;
    f_p_t1.value = f_p_t2.value = f_p_t3.value = ''; f_c_t1.value = f_c_t2.value = f_c_t3.value = ''; f_l_t1.value = f_l_t2.value = f_l_t3.value = '';
  }
}
function openEditor(p){ fillEditor(p); }
document.getElementById('btnClear').addEventListener('click', ()=> fillEditor(null));

document.getElementById('btnSave').addEventListener('click', ()=>{
  const nome = f_nome.value.trim(); if (!nome) return alert('Informe o nome');
  const categoria = f_categoria.value.trim(); const volume = f_volume.value.trim();
  const estoque = Number(f_estoque.value||0); const imagem = f_imagem.value.trim() || 'img/placeholder.jpg';
  const promo = !!f_promo.checked; const destaque = f_destaque.value.trim();

  let p = { id: selId || crypto.randomUUID().slice(0,8), nome, categoria, volume, estoque, imagem, promo, destaque };

  if (f_usar_tamanhos.checked){
    const ts = [], cs = [];
    const t1 = f_p_t1.value!=='' ? Number(f_p_t1.value) : null; const c1 = f_c_t1.value!=='' ? Number(f_c_t1.value) : null; const l1 = f_l_t1.value.trim();
    const t2 = f_p_t2.value!=='' ? Number(f_p_t2.value) : null; const c2 = f_c_t2.value!=='' ? Number(f_c_t2.value) : null; const l2 = f_l_t2.value.trim();
    const t3 = f_p_t3.value!=='' ? Number(f_p_t3.value) : null; const c3 = f_c_t3.value!=='' ? Number(f_c_t3.value) : null; const l3 = f_l_t3.value.trim();
    if (t1!==null){ ts.push({ rotulo: l1 || 'T1', preco: t1 }); cs.push({ rotulo: l1 || 'T1', custo: c1??0 }); }
    if (t2!==null){ ts.push({ rotulo: l2 || 'T2', preco: t2 }); cs.push({ rotulo: l2 || 'T2', custo: c2??0 }); }
    if (t3!==null){ ts.push({ rotulo: l3 || 'T3', preco: t3 }); cs.push({ rotulo: l3 || 'T3', custo: c3??0 }); }
    p.tamanhos = ts; p.custos = cs;
  } else {
    p.preco = Number(f_preco.value||0); p.custo = Number(f_custo.value||0);
  }

  const existing = ITEMS.find(x => x.id === p.id);
  if (existing && existing.estoque !== p.estoque){ logMove(p.id, 'salvar', p.estoque - (existing.estoque||0), existing.estoque||0, p.estoque, 'Salvar no editor'); }
  else if (!existing){ logMove(p.id, 'criar', 0, 0, p.estoque, 'Novo item'); }

  addOrUpdateOverlay(p); selId = p.id; boot();
});

document.getElementById('btnAdd').addEventListener('click', ()=> openEditor(null));

// History modal
let histProduct = null;
function openHistory(p){
  histProduct = p; histTitle.textContent = `Histórico — ${p.nome}`;
  const hist = loadHist()[p.id] || []; histSub.textContent = `${hist.length} movimentação(ões)`;
  histTable.innerHTML = hist.map(h=>{
    const d = new Date(h.ts); const ts = d.toLocaleString(); const delta = (h.delta>0?'+':'') + h.delta;
    return `<tr><td>${ts}</td><td>${h.action}</td><td>${delta}</td><td>${h.before}→${h.after}</td><td>${(h.note||'')}</td></tr>`;
  }).join('');
  histModal.style.display = 'flex';
}
document.getElementById('btnHistClose').addEventListener('click', ()=> histModal.style.display='none');
document.getElementById('btnHistClear').addEventListener('click', ()=>{ if (!histProduct) return; if (!confirm('Limpar histórico deste item?')) return; const h = loadHist(); h[histProduct.id] = []; saveHist(h); openHistory(histProduct); });
document.getElementById('btnHistExport').addEventListener('click', ()=>{
  const h = loadHist(); const rows = [['id','nome','timestamp','acao','delta','antes','depois','nota']];
  ITEMS.forEach(p => { const arr = h[p.id] || []; arr.forEach(m => rows.push([p.id, p.nome, m.ts, m.action, m.delta, m.before, m.after, (m.note||'')])); });
  const csv = rows.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type:'text/csv' }); const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download='historico-estoque.csv'; a.click(); URL.revokeObjectURL(url);
});

// Import/Export
document.getElementById('btnExport').addEventListener('click', async ()=>{
  const merged = await getMerged(); const blob = new Blob([JSON.stringify(merged, null, 2)], { type:'application/json' });
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = 'produtos-merged.json'; a.click(); URL.revokeObjectURL(url);
});
document.getElementById('btnImport').addEventListener('click', ()=>{
  const input = document.createElement('input'); input.type = 'file'; input.accept = 'application/json';
  input.addEventListener('change', async ()=>{
    const f = input.files[0]; if (!f) return;
    try{ const list = JSON.parse(await f.text()); if (!Array.isArray(list)) throw new Error('JSON deve ser um array de produtos'); localStorage.setItem(DEMO_KEY, JSON.stringify(list)); boot(); alert('Importado para overlay com sucesso!'); }
    catch(e){ alert('Erro ao importar: ' + e.message); }
  });
  input.click();
});
document.getElementById('btnReset').addEventListener('click', ()=>{ if (confirm('Limpar overlay (LocalStorage)?')){ resetOverlay(); boot(); } });

// Boot
// (removed duplicate) // let ITEMS = []; // redeclare to ensure visibility (already declared, but keep)
async function boot(){ try{ ITEMS = await getMerged(); render(applyFilters(ITEMS)); if (selId){ const p = ITEMS.find(x => x.id === selId); if (p) fillEditor(p); } } catch (e){ tbody.innerHTML = `<tr><td colspan="8">Erro: ${e.message}</td></tr>`; } }
function render(items){ tbody.innerHTML = items.map(rowHTML).join(''); const edits = JSON.parse(localStorage.getItem(DEMO_KEY)||'[]').length; statusEl.textContent = `${items.length} itens • overlay: ${edits} edit(s)`; }
boot();

// ====== Report (by category) ======
const repModal = document.getElementById('reportModal');
const repTable = document.getElementById('repTable').querySelector('tbody');
const repSub = document.getElementById('repSub');
const btnRepClose = document.getElementById('btnRepClose');
const btnRepExport = document.getElementById('btnRepExport');

function basePrice(p){ return p.tamanhos?.length ? Math.min(...p.tamanhos.map(t=>t.preco)) : (p.preco ?? 0); }
function baseCost(p){ if (p.tamanhos?.length){ const arr=(p.custos||[]).map(c=>c.custo).filter(x=>typeof x==='number'); return arr.length? Math.min(...arr) : 0; } return Number(p.custo||0); }

function buildReport(items){
  const map = new Map();
  for (const p of items){
    const cat = p.categoria || '—';
    const price = Number(basePrice(p)||0);
    const cost = Number(baseCost(p)||0);
    const est = Number(p.estoque||0);
    const rec = est * price;
    const ctt = est * cost;
    const mar = rec - ctt;
    const row = map.get(cat) || { itens:0, estoque:0, receita:0, custo:0, margem:0 };
    row.itens += 1; row.estoque += est; row.receita += rec; row.custo += ctt; row.margem += mar;
    map.set(cat, row);
  }
  return map;
}

function fmtBRL(v){ return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'}) }

function openReport(items){
  const map = buildReport(items);
  let total = {itens:0, estoque:0, receita:0, custo:0, margem:0};
  const rows = [];
  for (const [cat, r] of map.entries()){
    const mpct = r.receita ? (r.margem / r.receita * 100) : 0;
    rows.push(`<tr><td>${cat}</td><td class="num">${r.itens}</td><td class="num">${r.estoque}</td><td class="num">${fmtBRL(r.receita)}</td><td class="num">${fmtBRL(r.custo)}</td><td class="num">${fmtBRL(r.margem)}</td><td class="num">${mpct.toFixed(1)}%</td></tr>`);
    total.itens += r.itens; total.estoque += r.estoque; total.receita += r.receita; total.custo += r.custo; total.margem += r.margem;
  }
  const mpctT = total.receita ? (total.margem/total.receita*100) : 0;
  rows.push(`<tr><td><strong>Total</strong></td><td class="num"><strong>${total.itens}</strong></td><td class="num"><strong>${total.estoque}</strong></td><td class="num"><strong>${fmtBRL(total.receita)}</strong></td><td class="num"><strong>${fmtBRL(total.custo)}</strong></td><td class="num"><strong>${fmtBRL(total.margem)}</strong></td><td class="num"><strong>${mpctT.toFixed(1)}%</strong></td></tr>`);
  repTable.innerHTML = rows.join('');
  repSub.textContent = `Categorias: ${map.size} • Itens: ${total.itens}`;
  repModal.style.display = 'flex';

  // wire export
  btnRepExport.onclick = ()=>{
    const lines = [['categoria','itens','estoque','receita','custo','margem','margem_%']];
    for (const [cat, r] of map.entries()){
      const mpct = r.receita ? (r.margem / r.receita * 100) : 0;
      lines.push([cat, r.itens, r.estoque, r.receita, r.custo, r.margem, mpct.toFixed(2)]);
    }
    lines.push(['TOTAL', total.itens, total.estoque, total.receita, total.custo, total.margem, mpctT.toFixed(2)]);
    const csv = lines.map(r => r.map(x => `"${String(x).replace(/"/g,'""')}"`).join(',')).join('\\n');
    const blob = new Blob([csv], { type:'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download='relatorio-categorias.csv'; a.click(); URL.revokeObjectURL(url);
  };
}
btnRepClose?.addEventListener('click', ()=> repModal.style.display = 'none');
document.getElementById('btnReport')?.addEventListener('click', async ()=>{ try{ const items = await getMerged(); openReport(items); } catch(e){ alert('Erro ao gerar relatório: '+e.message); } });
