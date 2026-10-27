/* Primavera Analyzer V-47 — módulo aislado del ranking PON.
   No modifica las funciones de soporte, la base de clientes ni Clean Up. */
'use strict';
let pon47SelectedKey=null;
let pon47Latest=new Map();
const pon47Number=n=>Number(n||0).toLocaleString('es-MX');
function pon47RowsFor(a,ids){
  const pons=new Map();
  for(const [cuenta,acc] of a.accounts){
    // El alcance por cuadrantes se aplica ANTES de calcular las reincidencias.
    const events=ids?acc.events.filter(e=>ids.has(e.cell)):acc.events;
    if(!events.length)continue;
    const n=networkFor(cuenta);
    if(!n||n.status!=='OK')continue;
    const key=ponKey(n);
    let p=pons.get(key);
    if(!p){p={key,olt:n.olt,frame:n.frame,slot:n.slot,port:n.port,supports:0,accountCount:0,repeatCount:0,extraCount:0,accounts:[]};pons.set(key,p)}
    const count=events.length;
    p.supports+=count;
    p.accountCount++;
    if(count>=2)p.repeatCount++;
    p.extraCount+=count-1;
    p.accounts.push({cuenta,count,repeat:count>=2,extra:count-1});
  }
  return pons;
}
function pon47Sort(a,b){
  if(viewMode==='supports')return b.supports-a.supports||b.repeatCount-a.repeatCount||a.key.localeCompare(b.key);
  return b.repeatCount-a.repeatCount||b.supports-a.supports||a.key.localeCompare(b.key);
}
function pon47Open(key){
  if(!pon47Latest.has(key))return;
  pon47SelectedKey=key;
  pon47ShowDetail(pon47Latest.get(key));
}
function pon47ShowDetail(p){
  $('pon47Ranking').hidden=true;
  $('pon47Toolbar').hidden=true;
  $('pon47Detail').hidden=false;
  $('pon47DetailTitle').textContent=`${p.olt} · Frame ${p.frame} · Slot ${p.slot} · Puerto ${p.port}`;
  const rows=[...p.accounts].sort((a,b)=>b.count-a.count||a.cuenta.localeCompare(b.cuenta));
  $('pon47DetailRows').innerHTML=rows.map(x=>`<tr><td>${esc(x.cuenta)}</td><td>${pon47Number(x.count)}</td><td>${x.repeat?'Sí':'No'}</td><td>${pon47Number(x.extra)}</td></tr>`).join('');
  $('pon47DetailTotal').innerHTML=`<tr><th>Total (${pon47Number(p.accountCount)} cuentas)</th><th>${pon47Number(p.supports)}</th><th>${pon47Number(p.repeatCount)} cuentas</th><th>${pon47Number(p.extraCount)}</th></tr>`;
}
function pon47Back(){
  pon47SelectedKey=null;
  $('pon47Detail').hidden=true;
  $('pon47Ranking').hidden=false;
  $('pon47Toolbar').hidden=false;
}
function renderPonV47(a){
  const quality=$('networkQuality');
  const scope=$('ponScope')?.value||'all';
  const rank=rankedCells(a);
  const ids=scope==='topSupports'?new Set(rank.supports.slice(0,10).map(c=>c.id)):
    scope==='topRepeat'?new Set(rank.repeat.slice(0,10).map(c=>c.id)):null;
  const stats=networkStats(a,ids);
  const total=stats.total,pct=total?stats.matched/total*100:0;
  quality.textContent=networkMeta?`${pct.toFixed(1)}% · Encontradas: ${pon47Number(stats.matched)} · No encontradas: ${pon47Number(stats.unmatched)} · Duplicadas/revisar: ${pon47Number(stats.duplicates)}`:'Carga la base de red para habilitar análisis por PON.';
  const modeLabel=viewMode==='supports'?'Soportes':viewMode==='repeat'?'Reincidencias':'Ambos';
  $('pon47Title').textContent=`Ranking PON · ${modeLabel}`;
  $('pon47Subtitle').textContent=viewMode==='supports'?'Ordenado por eventos de soporte':viewMode==='repeat'?'Ordenado por cuentas reincidentes':'Ordenado por cuentas reincidentes, mostrando soportes y cuentas';
  const rows=$('pon47Rows');
  if(!networkMeta){pon47Latest=new Map();pon47Back();rows.innerHTML='<tr><td colspan="10" class="muted">Carga la base de clientes para consultar el ranking.</td></tr>';return}
  pon47Latest=pon47RowsFor(a,ids);
  const limit=Number($('pon47Limit').value)||10;
  let sorted=[...pon47Latest.values()].sort(pon47Sort);
  if(viewMode!=='supports')sorted=sorted.filter(p=>p.repeatCount>0);
  sorted=sorted.slice(0,limit);
  rows.innerHTML=sorted.length?sorted.map((p,i)=>`<tr class="pon47-click" data-pon-index="${i}" title="Ver cuentas del puerto"><td>${i+1}</td><td>${esc(p.olt)}</td><td>${esc(p.frame)}</td><td>${esc(p.slot)}</td><td>${esc(p.port)}</td><td>${pon47Number(p.supports)}</td><td>${pon47Number(p.accountCount)}</td><td>${pon47Number(p.repeatCount)}</td><td>${pon47Number(p.extraCount)}</td><td><button type="button" class="mini pon47-open" data-pon-index="${i}">Ver detalle ›</button></td></tr>`).join(''):'<tr><td colspan="10" class="muted">No hay puertos PON con incidencias para los filtros actuales.</td></tr>';
  rows.querySelectorAll('[data-pon-index]').forEach(el=>el.addEventListener('click',()=>pon47Open(sorted[Number(el.dataset.ponIndex)]?.key)));
  if(pon47SelectedKey&&pon47Latest.has(pon47SelectedKey))pon47ShowDetail(pon47Latest.get(pon47SelectedKey));
  else pon47Back();
}
// La función pública que ya llama render() se sustituye sólo para la pestaña PON.
renderPon=renderPonV47;
$('pon47Limit').addEventListener('change',()=>renderPonV47(analyze(filtered())));
$('pon47Back').addEventListener('click',pon47Back);
renderPonV47(analyze(filtered()));
