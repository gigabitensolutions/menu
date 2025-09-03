const LS={API_BASE:'https://0ae798887680.ngrok-free.app',API_TOKEN:'H492ksdfkah9fdjhjqh84jrwehf934b49rdn9234',OVERLAY:'mdl-overlay-v1',DELETED:'mdl-deleted-v1'};

function getAPI(){return{base:localStorage.getItem(LS.API_BASE)||'',token:localStorage.getItem(LS.API_TOKEN)||''}}

async function apiFetch(p,o={}){
  const{base,token}=getAPI();
  if(!base)throw new Error('API_BASE não configurado');
  const h=Object.assign({'Content-Type':'application/json'},o.headers||{});
  if(token)h.Authorization='Bearer '+token;
  const r=await fetch(base+p,{...o,headers:h});
  if(!r.ok)throw new Error(`API ${r.status}: `+await r.text());
  return r.json()
}

async function fetchBase(){
  const{base}=getAPI();
  if(base){
    try{return await apiFetch('/api/products')}
    catch(e){console.warn('API falhou, usando JSON local:',e.message)}
  }
  const r=await fetch('data/produtos.json',{cache:'no-store'});
  if(!r.ok)throw new Error('Falha ao carregar data/produtos.json');
  return await r.json()
}

function loadOverlay(){
  const a=JSON.parse(localStorage.getItem(LS.OVERLAY)||'[]');
  const d=JSON.parse(localStorage.getItem(LS.DELETED)||'[]');
  return{arr:a,del:d}
}
function saveOverlay(a,d){
  localStorage.setItem(LS.OVERLAY,JSON.stringify(a));
  localStorage.setItem(LS.DELETED,JSON.stringify(d))
}

async function addOrUpdate(p){
  const{base}=getAPI();
  if(base){
    try{
      const e=ITEMS.find(x=>x.id===p.id);
      if(e)await apiFetch('/api/products/'+encodeURIComponent(p.id),{method:'PUT',body:JSON.stringify(p)});
      else await apiFetch('/api/products',{method:'POST',body:JSON.stringify(p)});
      return
    }catch(e){alert('API erro: '+e.message)}
  }
  const{arr,del}=loadOverlay();
  const i=arr.findIndex(x=>x.id===p.id);
  if(i>=0)arr[i]=p;else arr.push(p);
  const di=del.indexOf(p.id);if(di>=0)del.splice(di,1);
  saveOverlay(arr,del)
}

async function delItem(id){
  const{base}=getAPI();
  if(base){
    try{await apiFetch('/api/products/'+encodeURIComponent(id),{method:'DELETE'});return}
    catch(e){alert('API erro: '+e.message)}
  }
  const{arr,del}=loadOverlay();
  const i=arr.findIndex(x=>x.id===id);if(i>=0)arr.splice(i,1);
  if(!del.includes(id))del.push(id);saveOverlay(arr,del)
}

async function getMerged(){
  const base=await fetchBase();
  const{arr,del}=loadOverlay();
  const map=new Map(base.map(p=>[p.id,p]));
  del.forEach(id=>map.delete(id));
  arr.forEach(p=>map.set(p.id,p));
  return Array.from(map.values())
}

const tbody=document.getElementById('tbody');
const statusEl=document.getElementById('status');
let ITEMS=[],SEL=null;

function currency(v){return Number(v||0).toLocaleString('pt-BR',{style:'currency',currency:'BRL'})}
function rowHTML(p){
  return `<tr class="row" data-id="${p.id}">
    <td><strong>${p.nome}</strong></td>
    <td>${p.categoria||''}</td>
    <td class="num">${currency(p.preco||0)}</td>
    <td class="num"><input type="number" class="est" value="${Number(p.estoque||0)}" step="1" style="width:90px"></td>
  </tr>`
}
function render(items){tbody.innerHTML=items.map(rowHTML).join('');statusEl.textContent=`${items.length} itens`}

tbody.addEventListener('change',async e=>{
  const tr=e.target.closest('tr.row');if(!tr)return;
  if(e.target.matches('.est')){
    const p=ITEMS.find(x=>x.id===tr.dataset.id);if(!p)return;
    p.estoque=Number(e.target.value||0);await addOrUpdate(p)
  }
});
tbody.addEventListener('click',e=>{
  const tr=e.target.closest('tr.row');if(!tr)return;
  const p=ITEMS.find(x=>x.id===tr.dataset.id);if(!p)return;
  SEL=p;fillEditor(p)
});

const f_nome=document.getElementById('f_nome');
const f_categoria=document.getElementById('f_categoria');
const f_preco=document.getElementById('f_preco');
const f_estoque=document.getElementById('f_estoque');
document.getElementById('btnSave').addEventListener('click',async()=>{
  const p=SEL||{id:crypto.randomUUID().slice(0,8)};
  p.nome=f_nome.value.trim();p.categoria=f_categoria.value.trim();
  p.preco=Number(f_preco.value||0);p.estoque=Number(f_estoque.value||0);
  if(!p.nome)return alert('Informe o nome');
  await addOrUpdate(p);await boot();SEL=null;clearEditor()
});
function fillEditor(p){f_nome.value=p?.nome||'';f_categoria.value=p?.categoria||'';f_preco.value=p?.preco||'';f_estoque.value=p?.estoque||0}
function clearEditor(){fillEditor(null)}

document.getElementById('btnReset').addEventListener('click',()=>{
  if(confirm('Limpar overlay local?')){
    localStorage.removeItem(LS.OVERLAY);
    localStorage.removeItem(LS.DELETED);
    boot()
  }
});

// ===== Relatório simples =====
const repModal=document.getElementById('repModal'),repTable=document.getElementById('repTable'),repClose=document.getElementById('repClose');
document.getElementById('btnReport').addEventListener('click',()=>openReport(ITEMS));
repClose.addEventListener('click',()=>repModal.style.display='none');
function openReport(items){
  const byCat=new Map();
  for(const p of items){
    const c=p.categoria||'—';
    const row=byCat.get(c)||{itens:0,estoque:0,receita:0};
    row.itens+=1; row.estoque+=Number(p.estoque||0); row.receita+=Number(p.estoque||0)*Number(p.preco||0);
    byCat.set(c,row)
  }
  let html='<thead><tr><th>Categoria</th><th>Itens</th><th>Estoque</th><th>Receita (estoque×preço)</th></tr></thead><tbody>';
  for(const [cat,row] of byCat){
    html+=`<tr><td>${cat}</td><td class="num">${row.itens}</td><td class="num">${row.estoque}</td><td class="num">${currency(row.receita)}</td></tr>`
  }
  html+='</tbody>'; repTable.innerHTML=html; repModal.style.display='flex'
}

// ===== Modal de Configurações =====
const cfgModal=document.getElementById('cfgModal');
const btnConfig=document.getElementById('btnConfig');
const cfg_base=document.getElementById('cfg_base');
const cfg_token=document.getElementById('cfg_token');
const cfg_state=document.getElementById('cfg_state');
const cfgTest=document.getElementById('cfgTest');
const cfgSave=document.getElementById('cfgSave');
const cfgClear=document.getElementById('cfgClear');
const cfgClose=document.getElementById('cfgClose');

btnConfig.addEventListener('click',()=>{
  const{base,token}=getAPI();
  cfg_base.value=base; cfg_token.value=token;
  cfg_state.textContent=base?`Usando ${base}`:'Offline (LocalStorage/JSON)';
  cfgModal.style.display='flex'
});
cfgClose.addEventListener('click',()=>cfgModal.style.display='none');
cfgClear.addEventListener('click',()=>{cfg_base.value='';cfg_token.value=''});
cfgSave.addEventListener('click',()=>{
  localStorage.setItem(LS.API_BASE,cfg_base.value.trim());
  localStorage.setItem(LS.API_TOKEN,cfg_token.value.trim());
  cfg_state.textContent=cfg_base.value?`Usando ${cfg_base.value}`:'Offline';
  alert('Configurações salvas. Recarregando...'); location.reload()
});
cfgTest.addEventListener('click',async()=>{
  try{
    const base=cfg_base.value.trim(); if(!base) throw new Error('Informe API_BASE');
    const r1=await fetch(base+'/api/ping'); const pong=await r1.json();
    let adminOK=false;
    try{
      const r2=await fetch(base+'/api/products',{headers:{Authorization:'Bearer '+cfg_token.value.trim()}});
      adminOK=r2.ok
    }catch(e){}
    cfg_state.textContent=`Ping OK (${pong.ts}). Admin ${adminOK?'OK':'NÃO OK (token ou CORS)'}`
  }catch(e){
    cfg_state.textContent='Falha: '+e.message
  }
});

async function boot(){ITEMS=await getMerged();render(ITEMS)}
boot();
