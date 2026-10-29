'use strict';
const REQUIRED=['Cuenta','Ticket','OS','OT','Tipo','Subtipo','Distrito','Cluster','Latitud','Longitud','Fecha creacion FFM','Estatus','Estado','Motivo'];
const DB='primavera_soportes_v12', STORE='events', IMPORTS='imports', NETWORK='network', META='network_meta', CELL=300;
const NETWORK_REQUIRED=['Cuenta','OLT','Frame','Slot','Port'];
let searchMarker=null, searchOutline=null, searchAccount='', searchLocations=[];
let initialMapFitDone=true; // V1.13.1: conservar zoom del usuario
let pointsEnabled=false, pointsMode='both', pointsScope='visible', pointLayers=null;
let db, allEvents=[], imports=[], networkIndex=new Map(), networkMeta=null, selectedYears=new Set(), selectedWeekNums=new Set(), selectedClusters=new Set(), viewMode='supports', layers=[], selectedCell=null, quadrantVisibility='all', manualVisibleIds=new Set();
const $=id=>document.getElementById(id);
// V-42: initialization readiness is independent of whether the database contains records.
let storageReady=false;
let resolveStorageReady,rejectStorageReady;
const storageReadyPromise=new Promise((resolve,reject)=>{resolveStorageReady=resolve;rejectStorageReady=reject});
// Avoid an unhandled rejection if the browser denies IndexedDB access.
storageReadyPromise.catch(()=>{});
function setStorageReady(ready){
 storageReady=ready;
 for(const [input,label] of [['excelFile','supportUploadLabel'],['networkFile','networkUploadLabel']]){
  $(input).disabled=!ready;$(label).classList.toggle('upload-locked',!ready);$(label).setAttribute('aria-disabled',String(!ready));
 }
}
async function requireStorage(){
 await storageReadyPromise;
 if(!storageReady||!db)throw new Error('El almacenamiento local todavía no está disponible. Actualiza la página e inténtalo de nuevo.');
}

const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const norm=s=>String(s??'').trim();
function status(msg,type='info'){const e=$('status');e.textContent=msg;e.className='status '+type}
function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB,2);r.onupgradeneeded=()=>{const d=r.result;if(!d.objectStoreNames.contains(STORE))d.createObjectStore(STORE,{keyPath:'key'});if(!d.objectStoreNames.contains(IMPORTS))d.createObjectStore(IMPORTS,{keyPath:'id'});if(!d.objectStoreNames.contains(NETWORK))d.createObjectStore(NETWORK,{keyPath:'cuenta'});if(!d.objectStoreNames.contains(META))d.createObjectStore(META,{keyPath:'id'})};r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function txGetAll(store){return new Promise((res,rej)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
function putMany(store,rows){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);rows.forEach(x=>s.put(x));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
function replaceStore(store,rows){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite'),st=tx.objectStore(store);st.clear();rows.forEach(x=>st.put(x));tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error);tx.onabort=()=>rej(tx.error||new Error('Transacción cancelada'))})}
function clearStore(store){return new Promise((res,rej)=>{const tx=db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error)})}
function makeDate(y,m,d,H=0,M=0,S=0){const x=new Date(y,m-1,d,H,M,S);return x.getFullYear()===y&&x.getMonth()===m-1&&x.getDate()===d?x:null}
function excelDate(v){
 if(v instanceof Date&&!isNaN(v))return new Date(v.getFullYear(),v.getMonth(),v.getDate(),v.getHours(),v.getMinutes(),v.getSeconds());
 if(typeof v==='number'){const p=XLSX.SSF.parse_date_code(v);return p?makeDate(p.y,p.m,p.d,p.H||0,p.M||0,Math.floor(p.S||0)):null}
 if(!v)return null;const s=String(v).trim();let m;
 // El reporte usa día/mes/año. Se procesa ANTES de Date() para evitar que 10/12 sea leído como mes/día.
 if((m=s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[ T](\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/)))return makeDate(+m[3],+m[2],+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));
 if((m=s.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})(?:[ T](\d{1,2}):?(\d{2})?(?::?(\d{2}))?)?/)))return makeDate(+m[1],+m[2],+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));
 return null;
}
function isoWeek(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));const day=x.getUTCDay()||7;x.setUTCDate(x.getUTCDate()+4-day);const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));const w=Math.ceil((((x-y)/86400000)+1)/7);return `${x.getUTCFullYear()}-S${String(w).padStart(2,'0')}`}
function eventKey(r,i){const t=norm(r.Ticket),os=norm(r.OS),ot=norm(r.OT);if(t)return 'T:'+t;if(os)return 'OS:'+os;if(ot)return 'OT:'+ot;return 'F:'+norm(r.Cuenta)+'|'+norm(r['Fecha creacion FFM'])+'|'+norm(r.Latitud)+'|'+norm(r.Longitud)+'|'+i}
function llToMerc(lat,lon){const R=6378137;return {x:R*lon*Math.PI/180,y:R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360))}}
function mercToLL(x,y){const R=6378137;return {lat:(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI,lon:x/R*180/Math.PI}}
function cellFor(lat,lon){const p=llToMerc(lat,lon),ix=Math.floor(p.x/CELL),iy=Math.floor(p.y/CELL);return {id:`Q-${ix}-${iy}`,ix,iy}}
function boundsFor(c){const a=mercToLL(c.ix*CELL,c.iy*CELL),b=mercToLL((c.ix+1)*CELL,(c.iy+1)*CELL);return [[a.lat,a.lon],[b.lat,b.lon]]}
function centerFor(c){return mercToLL((c.ix+.5)*CELL,(c.iy+.5)*CELL)}
function validLL(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(lat===0&&lon===0)}
// V1.13: ventana compacta con avance por etapas reales, sin porcentajes simulados.
const importDialog={open:false};
function importProgress(title,file,percent,detail){
 const box=$('importModal');if(!box)return;
 box.hidden=false;importDialog.open=true;
 $('importModalTitle').textContent=title;
 $('importModalFile').textContent=file||'';
 $('importModalDetail').textContent=detail||'';
 $('importModalBar').value=percent;
 $('importModalPercent').textContent=percent+'%';
 $('importModalAccept').hidden=true;
 $('importModalIcon').textContent='↻';
}
function importComplete(title,file,detail){
 importProgress(title,file,100,detail);
 $('importModalIcon').textContent='✓';$('importModalAccept').hidden=false;
}
function importFailed(file,message){
 importProgress('No se pudo completar la carga',file,0,message);
 $('importModalIcon').textContent='!';$('importModalAccept').hidden=false;
}
function importYield(){return new Promise(resolve=>setTimeout(resolve,0))}
$('importModalAccept').onclick=()=>{$('importModal').hidden=true;importDialog.open=false};
async function ingest(file){status('Validando y procesando el Excel…','info');const buf=await file.arrayBuffer();importProgress('Cargando soportes',file.name,15,'Archivo leído; interpretando Excel…');await importYield();let wb;try{wb=XLSX.read(buf,{type:'array',cellDates:true})}catch(e){throw new Error('No fue posible leer el archivo como Excel.')}
 const ws=wb.Sheets[wb.SheetNames[0]];const matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:true});let hi=-1;for(let i=0;i<Math.min(matrix.length,15);i++){const set=new Set(matrix[i].map(norm));if(REQUIRED.filter(h=>set.has(h)).length>=10){hi=i;break}}if(hi<0)throw new Error('No se encontró la fila de encabezados esperada.');const headers=matrix[hi].map(norm);const missing=REQUIRED.filter(h=>!headers.includes(h));if(missing.length)throw new Error('Estructura diferente. Faltan columnas: '+missing.join(', '));
 importProgress('Cargando soportes',file.name,35,'Encabezados validados; procesando registros…');await importYield();const rows=[];let invalid=0;for(let i=hi+1;i<matrix.length;i++){const a=matrix[i];if(!a||a.every(v=>norm(v)===''))continue;const r={};headers.forEach((h,j)=>{if(h)r[h]=a[j]});if(norm(r.Tipo).toLowerCase()!=='soporte')continue;const lat=Number(String(r.Latitud).replace(',','.')),lon=Number(String(r.Longitud).replace(',','.'));const d=excelDate(r['Fecha creacion FFM']);if(!validLL(lat,lon)||!d){invalid++;continue}const c=cellFor(lat,lon);rows.push({key:eventKey(r,i),cuenta:norm(r.Cuenta),nombre:norm(r['Nombre cliente']),ticket:norm(r.Ticket),os:norm(r.OS),ot:norm(r.OT),subtipo:norm(r.Subtipo),distrito:norm(r.Distrito),cluster:norm(r.Cluster)||'SIN CLUSTER',lat,lon,date:d.toISOString(),week:isoWeek(d),estatus:norm(r.Estatus)||'SIN ESTATUS',estado:norm(r.Estado),motivo:norm(r.Motivo),raw:r,cell:c.id,ix:c.ix,iy:c.iy});if(i%1200===0){importProgress('Cargando soportes',file.name,35+Math.floor(40*(i-hi)/Math.max(1,matrix.length-hi)),'Procesando '+(i-hi).toLocaleString('es-MX')+' registros…');await importYield()}}
 if(!rows.length)throw new Error('El archivo no contiene registros de Soporte con fecha y coordenadas válidas.');importProgress('Cargando soportes',file.name,80,'Guardando registros en el navegador…');await importYield();const existing=await txGetAll(STORE),byOs=new Map(),byKey=new Map(existing.map(e=>[e.key,e]));
 for(const e of existing)if(e.os&&!byOs.has(e.os))byOs.set(e.os,e);
 const pending=new Map();let added=0,updated=0,unchanged=0,duplicatesInFile=0;
 for(const incoming of rows){
  const prior=(incoming.os&&byOs.get(incoming.os))||byKey.get(incoming.key)||pending.get(incoming.key);
  if(prior){
   // No overwrite of valid existing values: fill missing fields only, preserving original event key.
   const merged={...prior};let changed=false;
   for(const [field,value] of Object.entries(incoming)){
    if(field==='key')continue;
    if((merged[field]===undefined||merged[field]===null||merged[field]==='')&&value!==undefined&&value!==null&&value!==''){merged[field]=value;changed=true}
   }
   if(changed){pending.set(prior.key,merged);updated++}else unchanged++;
   if(pending.has(prior.key))duplicatesInFile++;
   byKey.set(prior.key,merged);if(merged.os)byOs.set(merged.os,merged);
  }else{pending.set(incoming.key,incoming);byKey.set(incoming.key,incoming);if(incoming.os)byOs.set(incoming.os,incoming);added++}
 }
 if(pending.size)await putMany(STORE,[...pending.values()]);const dates=rows.map(x=>new Date(x.date)).sort((a,b)=>a-b);const imp={id:Date.now()+':'+file.name,name:file.name,loadedAt:new Date().toISOString(),rows:rows.length,added,updated,unchanged,invalid,from:dates[0].toISOString(),to:dates[dates.length-1].toISOString()};if(added||updated||!imports.some(x=>x.name===file.name))await putMany(IMPORTS,[imp]);await reload();importComplete('Soportes cargados correctamente',file.name,`${added.toLocaleString('es-MX')} nuevos · ${updated.toLocaleString('es-MX')} completados · ${unchanged.toLocaleString('es-MX')} existentes sin cambios · ${invalid.toLocaleString('es-MX')} omitidos`);status(`Archivo procesado: ${added.toLocaleString('es-MX')} nuevos; ${updated.toLocaleString('es-MX')} completados; ${unchanged.toLocaleString('es-MX')} existentes sin cambios; ${invalid.toLocaleString('es-MX')} inválidos. No se duplicaron OS.`,'ok')}
function normalizeAccount(v){return norm(v).replace(/\s+/g,'')}
function networkCandidates(v){const x=normalizeAccount(v);return x?[x]:[]}
function networkFor(cuenta){return networkIndex.get(normalizeAccount(cuenta))||null}
function ponKey(n){return n&&n.status==='OK'?`${n.olt}|${n.frame}|${n.slot}|${n.port}`:null}
async function loadNetworkLocal(){const rows=await txGetAll(NETWORK);networkIndex=new Map();for(const r of rows){networkIndex.set(r.cuenta,r);}const metas=await txGetAll(META);networkMeta=metas.find(x=>x.id==='current')||null;renderNetworkInfo()}
function renderNetworkInfo(){const el=$('networkInfo');if(!el)return;if(!networkMeta){el.innerHTML='No hay base de red cargada.';return}el.innerHTML=`<b>${esc(networkMeta.name)}</b><br><b>Cargada:</b> ${new Date(networkMeta.loadedAt).toLocaleString('es-MX')}<br><b>Registros:</b> ${networkMeta.sourceRows.toLocaleString('es-MX')} · <b>Cuentas:</b> ${networkMeta.accounts.toLocaleString('es-MX')}<br><b>Duplicadas/revisar:</b> ${networkMeta.duplicates.toLocaleString('es-MX')}`}
async function ingestNetwork(file){
 status('Leyendo base de clientes…','progress');await new Promise(r=>setTimeout(r,30));
 const buf=await file.arrayBuffer();importProgress('Cargando base de red',file.name,15,'Archivo leído; interpretando Excel…');await importYield();let wb;try{wb=XLSX.read(buf,{type:'array',cellDates:false})}catch(e){throw new Error('No fue posible leer el Excel de clientes.')}
 const ws=wb.Sheets[wb.SheetNames[0]],matrix=XLSX.utils.sheet_to_json(ws,{header:1,defval:'',raw:false});
 let hi=-1,ix;for(let i=0;i<Math.min(matrix.length,15);i++){const h=matrix[i].map(x=>norm(x).toUpperCase());if(['CUENTA','OLT','FRAME','SLOT','PORT'].every(x=>h.includes(x))){hi=i;ix={cuenta:h.indexOf('CUENTA'),olt:h.indexOf('OLT'),frame:h.indexOf('FRAME'),slot:h.indexOf('SLOT'),port:h.indexOf('PORT')};break}}
 if(hi<0)throw new Error('No se encontraron los encabezados Cuenta, OLT, Frame, Slot y Port.');
 importProgress('Cargando base de red',file.name,35,'Encabezados validados; procesando cuentas…');await importYield();const by=new Map();let sourceRows=0,invalid=0;
 for(let i=hi+1;i<matrix.length;i++){const a=matrix[i];if(!a||a.every(v=>norm(v)===''))continue;sourceRows++;
 const cuenta=normalizeAccount(a[ix.cuenta]),olt=norm(a[ix.olt]),frame=norm(a[ix.frame]),slot=norm(a[ix.slot]),port=norm(a[ix.port]);
 if(!/^\d{10}$/.test(cuenta)||!olt||!frame||!slot||!port){invalid++;continue}
 const key=JSON.stringify([olt,frame,slot,port]);let z=by.get(cuenta);
 if(!z)by.set(cuenta,{cuenta,status:'OK',olt,frame,slot,port,pon:key});
 else if(z.pon!==key){z.status='DUPLICADO/REVISAR';z.olt=z.frame=z.slot=z.port='DUPLICADO/REVISAR';}
 if(i%2000===0){importProgress('Cargando base de red',file.name,35+Math.floor(40*(i-hi)/Math.max(1,matrix.length-hi)),`Procesando ${sourceRows.toLocaleString('es-MX')} registros…`);await importYield()}
 }
 const rows=[...by.values()],duplicates=rows.filter(x=>x.status!=='OK').length;
 importProgress('Cargando base de red',file.name,80,'Guardando clientes en este navegador…');await importYield();status('Guardando clientes en este navegador…','progress');
 const meta={id:'current',name:file.name,loadedAt:new Date().toISOString(),sourceRows,accounts:rows.length,duplicates,invalid};
 // Datos y metadatos se sustituyen juntos en una sola transacción.
 await new Promise((resolve,reject)=>{const tx=db.transaction([NETWORK,META],'readwrite'),ns=tx.objectStore(NETWORK),ms=tx.objectStore(META);ns.clear();ms.clear();rows.forEach(r=>ns.put(r));ms.put(meta);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Actualización cancelada'))});
 await loadNetworkLocal();render();importComplete('Base de red cargada correctamente',file.name,`${sourceRows.toLocaleString('es-MX')} registros · ${rows.length.toLocaleString('es-MX')} cuentas · ${duplicates} por revisar`);status(`Base cargada: ${rows.length.toLocaleString('es-MX')} cuentas; ${duplicates} ambiguas; ${invalid} filas no válidas.`,'ok');
}
function networkStats(a,allowedIds=null){const pons=new Map(),matchedAccounts=new Set(),unmatchedAccounts=new Set(),duplicateAccounts=new Set();for(const [cuenta,acc] of a.accounts){const ev=allowedIds?acc.events.filter(e=>allowedIds.has(e.cell)):acc.events;if(!ev.length)continue;const n=networkFor(cuenta);if(!n){unmatchedAccounts.add(cuenta);continue}if(n.status!=='OK'){duplicateAccounts.add(cuenta);continue}matchedAccounts.add(cuenta);const k=ponKey(n);let p=pons.get(k);if(!p)pons.set(k,p={key:k,olt:n.olt,frame:n.frame,slot:n.slot,port:n.port,supports:0,accounts:new Set(),repeat:new Set()});p.supports+=ev.length;p.accounts.add(cuenta);if(acc.events.length>=2)p.repeat.add(cuenta)}return {pons:[...pons.values()].map(p=>({...p,accountCount:p.accounts.size,repeatCount:p.repeat.size})),matched:matchedAccounts.size,unmatched:unmatchedAccounts.size,duplicates:duplicateAccounts.size,total:a.accounts.size}}
function renderPon(a){const qs=$('networkQuality'),sbody=$('topPonSupports'),rbody=$('topPonRepeat');if(!networkMeta){qs.textContent='Carga la base de red para habilitar análisis por PON.';sbody.innerHTML=rbody.innerHTML='<tr><td colspan="8" class="muted">Carga la base de red.</td></tr>';return}const scope=$('ponScope')?.value||'all',rank=rankedCells(a),ids=scope==='topSupports'?new Set(rank.supports.slice(0,10).map(c=>c.id)):scope==='topRepeat'?new Set(rank.repeat.slice(0,10).map(c=>c.id)):null;const ns=networkStats(a,ids),usable=ns.matched,total=ns.total,pct=total?usable/total*100:0;qs.textContent=`${pct.toFixed(1)}% · Encontradas: ${usable.toLocaleString('es-MX')} · No encontradas: ${ns.unmatched.toLocaleString('es-MX')} · Duplicadas/revisar: ${ns.duplicates.toLocaleString('es-MX')}`;const ts=[...ns.pons].sort((x,y)=>y.supports-x.supports||y.repeatCount-x.repeatCount).slice(0,10),tr=[...ns.pons].sort((x,y)=>y.repeatCount-x.repeatCount||y.supports-x.supports).slice(0,10);sbody.innerHTML=ts.length?ts.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.olt)}</td><td>${esc(p.frame)}</td><td>${esc(p.slot)}</td><td>${esc(p.port)}</td><td><b>${p.supports}</b></td><td>${p.accountCount}</td><td>${p.repeatCount}</td></tr>`).join(''):'<tr><td colspan="8" class="muted">Sin PON identificados con los filtros actuales.</td></tr>';rbody.innerHTML=tr.length?tr.map((p,i)=>`<tr><td>${i+1}</td><td>${esc(p.olt)}</td><td>${esc(p.frame)}</td><td>${esc(p.slot)}</td><td>${esc(p.port)}</td><td><b>${p.repeatCount}</b></td><td>${p.supports}</td><td>${p.accountCount}</td></tr>`).join(''):'<tr><td colspan="8" class="muted">Sin PON reincidentes con los filtros actuales.</td></tr>'}
function cellPonTop(c){if(!networkMeta)return '';const acc=new Map();c.events.forEach(e=>{if(!e.cuenta)return;let a=acc.get(e.cuenta);if(!a)acc.set(e.cuenta,a=[]);a.push(e)});const pons=new Map();for(const [cuenta,ev] of acc){const n=networkFor(cuenta);if(!n||n.status!=='OK')continue;const k=ponKey(n);let p=pons.get(k);if(!p)pons.set(k,p={...n,supports:0,repeat:0});p.supports+=ev.length;if(c._recurrentAccounts?.has(cuenta))p.repeat++}const ts=[...pons.values()].sort((a,b)=>b.supports-a.supports||b.repeat-a.repeat).slice(0,5),tr=[...pons.values()].sort((a,b)=>b.repeat-a.repeat||b.supports-a.supports).slice(0,5);const table=(rows,metric)=>rows.length?`<table><thead><tr><th>OLT</th><th>F</th><th>S</th><th>Puerto</th><th>${metric==='supports'?'Soportes':'Reincidentes'}</th></tr></thead><tbody>${rows.map(p=>`<tr><td>${esc(p.olt)}</td><td>${esc(p.frame)}</td><td>${esc(p.slot)}</td><td>${esc(p.port)}</td><td><b>${metric==='supports'?p.supports:p.repeat}</b></td></tr>`).join('')}</tbody></table>`:'<div class="muted">Sin PON identificados.</div>';return `<div class="pon-mini"><h3>Top 5 PON del cuadrante · Soportes</h3>${table(ts,'supports')}<h3>Top 5 PON del cuadrante · Reincidencias</h3>${table(tr,'repeat')}</div>`}
async function reload(){
 allEvents=await txGetAll(STORE);imports=await txGetAll(IMPORTS);await loadNetworkLocal();
 window.supportCalendarV71?.refreshData();
 const years=[...new Set(allEvents.map(x=>x.week.slice(0,4)))].sort().reverse();
 if(selectedYears.size===0)years.forEach(y=>selectedYears.add(y));
 renderYears(years);renderWeeks();renderFilters();renderImportInfo();render();
}
function weekParts(w){const m=String(w).match(/^(\d{4})-S(\d{2})$/);return m?{year:m[1],num:m[2]}:{year:'',num:''}}
function weekRange(y,n){const jan4=new Date(Date.UTC(+y,0,4)),dow=jan4.getUTCDay()||7,monday=new Date(jan4);monday.setUTCDate(jan4.getUTCDate()-(dow-1)+(+n-1)*7);const sunday=new Date(monday);sunday.setUTCDate(monday.getUTCDate()+6);const f=d=>d.toLocaleDateString('es-MX',{day:'2-digit',month:'short',timeZone:'UTC'}).replace('.','');return `${f(monday)} – ${f(sunday)}`}
function renderYears(years){$('years').innerHTML=years.length?years.map(y=>`<label class="week"><input type="checkbox" value="${y}" ${selectedYears.has(y)?'checked':''}> ${y}</label>`).join(''):'<span class="muted">Sin datos</span>';$('years').querySelectorAll('input').forEach(i=>i.onchange=()=>{window.supportCalendarV71?.clearApplied();i.checked?selectedYears.add(i.value):selectedYears.delete(i.value);renderWeeks();render()})}
function availableWeekNums(){return [...new Set(allEvents.filter(e=>selectedYears.has(weekParts(e.week).year)).map(e=>weekParts(e.week).num))].sort((a,b)=>+a-+b)}
function renderWeeks(){const nums=availableWeekNums();if(selectedWeekNums.size===0)nums.forEach(n=>selectedWeekNums.add(n));const oneYear=selectedYears.size===1?[...selectedYears][0]:null;$('weeks').innerHTML=nums.length?nums.map(n=>`<label class="week"><input type="checkbox" value="${n}" ${selectedWeekNums.has(n)?'checked':''}> Semana ${n}${oneYear?' · '+weekRange(oneYear,n):''}</label>`).join(''):'<span class="muted">Sin datos para los años seleccionados</span>';$('weeks').querySelectorAll('input').forEach(i=>i.onchange=()=>{window.supportCalendarV71?.clearApplied();i.checked?selectedWeekNums.add(i.value):selectedWeekNums.delete(i.value);render()})}
function renderFilters(){const vals=[...new Set(allEvents.map(x=>x.cluster))].sort();if(selectedClusters.size===0)vals.forEach(v=>selectedClusters.add(v));$('clusters').innerHTML=vals.length?vals.map(v=>`<label class="week"><input type="checkbox" value="${esc(v)}" ${selectedClusters.has(v)?'checked':''}> ${esc(v)}</label>`).join(''):'<span class="muted">Sin datos</span>';$('clusters').querySelectorAll('input').forEach(i=>i.onchange=()=>{i.checked?selectedClusters.add(i.value):selectedClusters.delete(i.value);render()});fillSelect('statusFilter',[...new Set(allEvents.map(x=>x.estatus))].sort())}
function fillSelect(id,vals){const el=$(id),cur=el.value;el.innerHTML='<option value="">Todos</option>'+vals.map(v=>`<option>${esc(v)}</option>`).join('');if(vals.includes(cur))el.value=cur}
function renderImportInfo(){if(!imports.length){$('importInfo').textContent='Todavía no hay archivos cargados.';return}const latest=[...imports].sort((a,b)=>b.loadedAt.localeCompare(a.loadedAt))[0];$('importInfo').innerHTML=`<b>Último:</b> ${esc(latest.name)}<br><b>Cargado:</b> ${new Date(latest.loadedAt).toLocaleString('es-MX')}<br><b>Registros leídos:</b> ${latest.rows.toLocaleString('es-MX')}<br><b>Histórico:</b> ${imports.length} archivo(s)`}
function filtered(){const st=$('statusFilter').value;return allEvents.filter(x=>{const p=weekParts(x.week);return selectedClusters.has(x.cluster)&&(!st||x.estatus===st)&&(window.supportCalendarV71?.includes(x)??true)})}
function analyze(events){const acc=new Map();events.forEach(e=>{if(!e.cuenta)return;let a=acc.get(e.cuenta);if(!a)acc.set(e.cuenta,a={cuenta:e.cuenta,events:[]});a.events.push(e)});const repeat=[...acc.values()].filter(a=>a.events.length>=2);const repeatLoc=new Map();repeat.forEach(a=>{const by=new Map();a.events.forEach(e=>{let z=by.get(e.cell);if(!z)by.set(e.cell,z={cell:e.cell,ix:e.ix,iy:e.iy,n:0,last:'',cluster:new Map()});z.n++;if(e.date>z.last)z.last=e.date;z.cluster.set(e.cluster,(z.cluster.get(e.cluster)||0)+1)});const best=[...by.values()].sort((p,q)=>q.n-p.n||q.last.localeCompare(p.last))[0];repeatLoc.set(a.cuenta,best)});
 const cells=new Map();events.forEach(e=>{let c=cells.get(e.cell);if(!c)cells.set(e.cell,c={id:e.cell,ix:e.ix,iy:e.iy,supports:0,repeats:0,clusters:new Map(),events:[],accounts:[]});c.supports++;c.events.push(e);c.clusters.set(e.cluster,(c.clusters.get(e.cluster)||0)+1)});repeat.forEach(a=>{const loc=repeatLoc.get(a.cuenta);if(!loc)return;let c=cells.get(loc.cell);if(!c)cells.set(loc.cell,c={id:loc.cell,ix:loc.ix,iy:loc.iy,supports:0,repeats:0,clusters:new Map(),events:[],accounts:[]});c.repeats++;c.accounts.push(a)});for(const c of cells.values())c._recurrentAccounts=new Set(c.accounts.map(x=>x.cuenta));for(const c of cells.values())c.cluster=[...c.clusters.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'SIN CLUSTER';return {accounts:acc,repeat,cells:[...cells.values()]}}
const map=L.map('map',{preferCanvas:false}).setView([20.6736,-103.3440],12);
// Mapas base: calles y satélite. Las capas analíticas permanecen iguales al cambiar el fondo.
const streetBase=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Tiles © Esri'});
const satelliteBase=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,attribution:'Imagery © Esri'}).addTo(map);
L.control.layers({'Mapa / Calles':streetBase,'Satélite':satelliteBase},null,{position:'topleft',collapsed:false}).addTo(map);
const mapWrap=document.querySelector('.mapwrap');
const fsBtn=$('mapFullscreen');
fsBtn.onclick=async()=>{try{if(!document.fullscreenElement){await mapWrap.requestFullscreen();}else{await document.exitFullscreen();}}catch(e){console.warn('Pantalla completa no disponible',e)}};
document.addEventListener('fullscreenchange',()=>{fsBtn.textContent=document.fullscreenElement?'✕ Salir':'⛶ Pantalla completa';setTimeout(()=>map.invalidateSize(),120)});
window.addEventListener('resize',()=>setTimeout(()=>map.invalidateSize(),80));
// V1.13.2: Leaflet debe recalcular su superficie cuando el contenedor cambia de alto/ancho,
// incluso si el tamaño de la ventana del navegador no cambia.
if(typeof ResizeObserver!=='undefined'){
  const mapResizeObserver=new ResizeObserver(()=>{
    requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}));
  });
  mapResizeObserver.observe(document.getElementById('map'));
  mapResizeObserver.observe(mapWrap);
}
window.addEventListener('load',()=>setTimeout(()=>map.invalidateSize({pan:false}),250));
function color(v,max,type){if(!v)return '#ffffff';const r=v/Math.max(max,1);if(type==='repeat')return r>.7?'#8e1b13':r>.4?'#c0392b':r>.2?'#e67e73':'#f5b7b1';return r>.7?'#0b3d66':r>.4?'#1769aa':r>.2?'#4d94c4':'#9ec5df'}
// V1.15: convergencia equilibrada. Media geométrica normalizada:
// puntuación = sqrt((soportes / máximo soportes) * (reincidentes / máximo reincidentes)).
// Se ordenan TODOS los cuadrantes; si hay menos de diez con convergencia,
// se completa el Top 10 con los siguientes de mayor actividad.
function rankedCells(a){
 const supports=[...a.cells].filter(c=>c.supports>0).sort((x,y)=>y.supports-x.supports||y.repeats-x.repeats||x.id.localeCompare(y.id));
 const repeat=[...a.cells].filter(c=>c.repeats>0).sort((x,y)=>y.repeats-x.repeats||y.supports-x.supports||x.id.localeCompare(y.id));
 const maxS=Math.max(1,...a.cells.map(c=>c.supports)),maxR=Math.max(1,...a.cells.map(c=>c.repeats));
 const combined=[...a.cells].filter(c=>c.supports>0).sort((x,y)=>{
  const sx=Math.sqrt((x.supports/maxS)*(x.repeats/maxR));
  const sy=Math.sqrt((y.supports/maxS)*(y.repeats/maxR));
  return sy-sx||y.repeats-x.repeats||y.supports-x.supports||x.id.localeCompare(y.id);
 });
 return {supports,repeat,combined};
}
function rankedForMode(a){const r=rankedCells(a);return viewMode==='supports'?r.supports:viewMode==='repeat'?r.repeat:r.combined}
function autoVisibleIds(a){
 if(quadrantVisibility==='all')return null;
 if(quadrantVisibility==='manual')return new Set(manualVisibleIds);
 const n=Number(quadrantVisibility.replace('top',''))||1;
 return new Set(rankedForMode(a).slice(0,n).map(c=>c.id));
}
function currentTop10Ids(a){return new Set(rankedForMode(a).slice(0,10).map(c=>c.id))}
function ensureManual(a){if(quadrantVisibility!=='manual'){const current=autoVisibleIds(a);manualVisibleIds=current===null?new Set(a.cells.map(c=>c.id)):new Set(current);quadrantVisibility='manual';$('quadrantVisibility').value='manual'}}
function bulkVisibility(kind,on){const a=analyze(filtered());ensureManual(a);const top=currentTop10Ids(a),targets=kind==='top'?top:new Set(a.cells.filter(c=>!top.has(c.id)).map(c=>c.id));targets.forEach(id=>on?manualVisibleIds.add(id):manualVisibleIds.delete(id));selectedCell=null;render()}
function updateBulkInfo(a){const top=currentTop10Ids(a),visible=autoVisibleIds(a),isOn=id=>visible===null||visible.has(id),topOn=[...top].filter(isOn).length,rest=a.cells.filter(c=>!top.has(c.id)),restOn=rest.filter(c=>isOn(c.id)).length;$('bulkVisibilityInfo').textContent=`Top 10 visibles: ${topOn}/${top.size} · Fuera del Top 10: ${restOn}/${rest.length}`;}
// V-74: reutilización exclusiva de capas visuales de Soportes.
const sc74Paths=new Map();let sc74PathUsed=new Set();
function sc74Path(type,key,geometry,options){
 sc74PathUsed.add(key);let layer=sc74Paths.get(key);const signature=JSON.stringify([geometry,options]);
 if(!layer){layer=L[type](geometry,options);sc74Paths.set(key,layer)}
 else{if(layer.sc74Signature!==signature){if(type==='rectangle')layer.setBounds(geometry);else{layer.setLatLng(geometry);layer.setRadius(options.radius)}layer.setStyle(options)}layer.off('click');layer.unbindTooltip()}
 layer.sc74Signature=signature;return layer;
}
const sc74Markers=new Map();
function draw(a){requestAnimationFrame(()=>map.invalidateSize({pan:false,debounceMoveend:true}));sc74PathUsed=new Set();layers=[];const maxS=Math.max(1,...a.cells.map(c=>c.supports)),maxR=Math.max(1,...a.cells.map(c=>c.repeats)),allowed=autoVisibleIds(a),visibleBounds=[];a.cells.forEach(c=>{if(allowed&&!allowed.has(c.id))return;if(viewMode==='supports'&&!c.supports)return;if(viewMode==='repeat'&&!c.repeats)return;const b=boundsFor(c);visibleBounds.push(b[0],b[1]);if(viewMode==='both'){if(c.supports){const p=sc74Path('rectangle',`${viewMode}:rectangle:${c.id}`,b,{color:'#1769aa',weight:1,fillColor:color(c.supports,maxS,'supports'),fillOpacity:.42}).addTo(map);p.bringToFront();p.on('click',()=>selectCell(c,a));layers.push(p)}if(c.repeats){const ctr=centerFor(c),rad=Math.min(120,25+95*c.repeats/maxR),p=sc74Path('circle',`${viewMode}:circle:${c.id}`,[ctr.lat,ctr.lon],{radius:rad,color:'#a52a1d',weight:2,fillColor:color(c.repeats,maxR,'repeat'),fillOpacity:.55}).addTo(map);p.bringToFront();p.on('click',()=>selectCell(c,a));layers.push(p)}}else{const val=viewMode==='repeat'?c.repeats:c.supports,typ=viewMode==='repeat'?'repeat':'supports',p=sc74Path('rectangle',`${viewMode}:rectangle:${c.id}`,b,{color:typ==='repeat'?'#9d2c22':'#1769aa',weight:1,fillColor:color(val,typ==='repeat'?maxR:maxS,typ),fillOpacity:.48}).addTo(map);p.bindTooltip(`${c.id}<br>${typ==='repeat'?'Reincidentes':'Soportes'}: <b>${val}</b>`);p.bringToFront();p.on('click',()=>selectCell(c,a));layers.push(p)}});for(const [key,layer] of sc74Paths){if(!sc74PathUsed.has(key)){map.removeLayer(layer);sc74Paths.delete(key)}}if(!initialMapFitDone&&visibleBounds.length){initialMapFitDone=true;map.fitBounds(L.latLngBounds(visibleBounds),{padding:[28,28],maxZoom:15})}}
// V1.16: puntos independientes de la visualización de polígonos.
// Cada cuenta se representa una sola vez. Los contadores siempre usan los eventos filtrados.
function pointPopup(account, events, isRepeat){
 const sorted=[...events].sort((x,y)=>y.date.localeCompare(x.date));
 const supportCount=events.length;
 // Reincidente según la lógica vigente de V1.15: >=2 soportes filtrados.
 const repeatCount=isRepeat?Math.max(0,supportCount-1):0;
 const cols=[...new Set(sorted.flatMap(e=>Object.keys(e.raw||{})))];
 const rows=sorted.map((e,i)=>{
  const fields=cols.length?cols.map(k=>`<tr><th>${esc(k)}</th><td>${esc(String(e.raw[k]??''))}</td></tr>`).join(''):
   Object.entries(e).filter(([k])=>!['raw','key','ix','iy'].includes(k)).map(([k,v])=>`<tr><th>${esc(k)}</th><td>${esc(String(v??''))}</td></tr>`).join('');
  return `<details ${i===0?'open':''}><summary>${window.supportCalendarV71?.eventBadge(e)||''}Soporte ${i+1} · ${esc(e.date.slice(0,10))} · ${esc(e.ticket||e.os||e.ot||'Sin folio')}</summary><div class="point-popup-table"><table>${fields}</table></div></details>`;
 }).join('');
 return `<div class="point-popup"><b>Cuenta: ${esc(account)}</b><p>Soportes: <b>${supportCount}</b> · Reincidencias adicionales*: <b>${repeatCount}</b> · Cliente reincidente: <b>${isRepeat?'Sí':'No'}</b></p><p class="point-popup-note">*Conteo informativo dentro de los filtros actuales; no aplica aún la futura regla de 8 semanas.</p>${rows}</div>`;
}
function drawPoints(a){
 if(!pointLayers)pointLayers=L.layerGroup().addTo(map);
 const used=new Set();
 const info=$('pointsInfo');
 if(!pointsEnabled){pointLayers.clearLayers();sc74Markers.clear();info.textContent='Marcadores apagados.';return}
 const allowed=pointsScope==='visible'?autoVisibleIds(a):null;
 const repeats=new Set(a.repeat.map(x=>x.cuenta));
 const byAccount=new Map();
 const repeatLocations=new Map();for(const cell of a.cells)for(const account of cell.accounts)if(!repeatLocations.has(account.cuenta))repeatLocations.set(account.cuenta,cell);
 for(const [account,data] of a.accounts){
  const isRepeat=repeats.has(account);
  if(pointsMode==='repeat'&&!isRepeat)continue;
  const events=allowed?data.events.filter(e=>allowed.has(e.cell)):data.events;
  if(!events.length)continue;
  // En modo de reincidencias solo marcar la cuenta en el cuadrante
  // donde analyze() la atribuye; así coincide con el ranking.
  if(pointsMode==='repeat' || (pointsMode==='both'&&isRepeat)){
   const loc=repeatLocations.get(account);
   if(!loc || (allowed&&!allowed.has(loc.id))){
    if(pointsMode==='repeat')continue;
   }else if(pointsMode==='repeat'){
    const own=events.filter(e=>e.cell===loc.id);
    if(!own.length)continue;
   }
  }
  byAccount.set(account,{events,isRepeat});
 }
 let count=0;
 for(const [account,{events,isRepeat}] of byAccount){
  const locCell=(pointsMode==='repeat')?repeatLocations.get(account)?.id:null;
  const locationEvents=locCell?events.filter(e=>e.cell===locCell):events;
  const latest=[...locationEvents].sort((x,y)=>y.date.localeCompare(x.date))[0];
  if(!latest||!Number.isFinite(latest.lat)||!Number.isFinite(latest.lon))continue;
  const supportCount=events.length;
  const extra=isRepeat?Math.max(0,(a.accounts.get(account)?.events.length||0)-1):0;
  const showRepeat=isRepeat&&pointsMode!=='supports';
  const showSupport=pointsMode!=='repeat';
  const hue=showRepeat&&showSupport?'dual':showRepeat?'repeat':'support';
  const label=showRepeat&&showSupport?`${supportCount} / ${extra}`:showRepeat?`${extra}`:`${supportCount}`;
  const icon=L.divIcon({className:'account-pin-wrap',html:window.supportCalendarV71?.iconHtml(events,label,hue)??`<span class="account-pin ${hue}" aria-hidden="true"><span class="pin-center"></span></span><span class="account-count">${label}</span>`,iconSize:[66,36],iconAnchor:[14,31],popupAnchor:[0,-28]});
  used.add(account);
  let cached=sc74Markers.get(account),marker=cached?.marker;
  const iconSignature=icon.options.html;
  if(!marker){marker=L.marker([latest.lat,latest.lon],{icon,keyboard:true,title:`Cuenta ${account}`});cached={marker,iconSignature,lat:latest.lat,lon:latest.lon};sc74Markers.set(account,cached)}
  else{if(cached.lat!==latest.lat||cached.lon!==latest.lon){marker.setLatLng([latest.lat,latest.lon]);cached.lat=latest.lat;cached.lon=latest.lon}if(cached.iconSignature!==iconSignature){marker.setIcon(icon);cached.iconSignature=iconSignature}marker.closePopup()}

  marker.bindTooltip(`<b>Cuenta: ${esc(account)}</b><br>Soportes: ${a.accounts.get(account).events.length}<br>Reincidencias adicionales*: ${extra}<br>Cliente reincidente: ${isRepeat?'Sí':'No'}`,{direction:'top',offset:[0,-26],sticky:false});
  marker.bindPopup(()=>pointPopup(account,a.accounts.get(account).events,isRepeat),{maxWidth:470,maxHeight:360});
  pointLayers.addLayer(marker);count++;
 }
 for(const [account,cached] of sc74Markers){if(!used.has(account)){pointLayers.removeLayer(cached.marker);sc74Markers.delete(account)}}
 info.textContent=`${count.toLocaleString('es-MX')} cuentas ubicadas · ${pointsScope==='visible'?'Cuadrantes visibles':'Todos los cuadrantes'} · ${pointsMode==='both'?'Ambos':pointsMode==='supports'?'Soportes':'Reincidencias'}`;
}
function updateSearchOverlay(a){
 if(searchMarker){map.removeLayer(searchMarker);searchMarker=null}
 if(searchOutline){map.removeLayer(searchOutline);searchOutline=null}
 const c=a.cells.find(z=>z.id===selectedCell);
 if(c){searchOutline=L.rectangle(boundsFor(c),{color:'#ffd84d',weight:4,fillColor:'#ffdc52',fillOpacity:.22,interactive:false}).addTo(map);searchOutline.bringToFront()}
 if(searchAccount&&c){const events=c.events.filter(e=>e.cuenta===searchAccount);if(events.length){const e=events.slice().sort((x,y)=>y.date.localeCompare(x.date))[0];searchMarker=L.marker([e.lat,e.lon],{title:'Cuenta '+searchAccount}).addTo(map);searchMarker.bindTooltip('Cuenta '+esc(searchAccount))}}
}
function supportSearchCoordinates(q){const m=q.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*(?:,|;|\s)\s*([+-]?\d+(?:\.\d+)?)$/);if(!m)return null;const lat=Number(m[1]),lon=Number(m[2]);return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180?{lat,lon}:null}
function doMapSearch(){
 const q=$('mapSearch').value.trim(),info=$('searchResult');if(!q){info.textContent='Escribe una cuenta, OS, cuadrante o coordenadas.';return}
 const coords=supportSearchCoordinates(q);if(coords){searchAccount='';searchLocations=[];selectedCell=null;if(searchMarker)map.removeLayer(searchMarker);if(searchOutline){map.removeLayer(searchOutline);searchOutline=null}searchMarker=L.marker([coords.lat,coords.lon]).addTo(map).bindPopup('Coordenadas: '+coords.lat+', '+coords.lon).openPopup();map.setView([coords.lat,coords.lon],17);info.textContent='Coordenadas localizadas.';$('searchNext').hidden=true;return}
 const a=analyze(filtered()),isCell=/^Q/i.test(q),match=e=>e.cuenta===q||String(e.os||'').toLowerCase()===q.toLowerCase();
 const matches=isCell?a.cells.filter(c=>c.id.toUpperCase()===q.toUpperCase()):a.cells.filter(c=>c.events.some(match));
 if(!matches.length){info.replaceChildren();info.textContent=allEvents.some(e=>isCell?e.cell.toUpperCase()===q.toUpperCase():match(e))?'Encontrado en el histórico, pero fuera de los filtros seleccionados.':'Sin coincidencias en la base de soportes.';$('searchNext').hidden=true;return}
 searchAccount=isCell?'':(matches[0].events.find(match)?.cuenta||'');searchLocations=matches.map(c=>c.id);
 const focus=c=>{selectCell(c,a);if(!isCell){const e=c.events.filter(match).sort((x,y)=>y.date.localeCompare(x.date))[0];if(e){searchAccount=e.cuenta;updateSearchOverlay(a);map.setView([e.lat,e.lon],17)}}};
 focus(matches[0]);info.replaceChildren();const text=document.createElement('span');text.textContent=matches.length===1?'Ubicación encontrada: '+matches[0].id:`${matches.length} cuadrantes encontrados. Elige una ubicación: `;info.appendChild(text);
 if(matches.length>1){const list=document.createElement('select');list.setAttribute('aria-label','Resultados de búsqueda');for(const c of matches){const o=document.createElement('option');o.value=c.id;o.textContent=c.id+' · '+c.cluster;list.appendChild(o)}list.onchange=()=>focus(matches.find(c=>c.id===list.value));info.appendChild(list)}$('searchNext').hidden=matches.length<2;
}

function clearMapSearch(){searchAccount='';searchLocations=[];selectedCell=null;$('mapSearch').value='';$('searchResult').textContent='Búsqueda limpia.';$('searchNext').hidden=true;render()}
function networkExport(cuenta){const n=networkFor(cuenta);if(!n)return {'OLT':'NO ENCONTRADO','FRAME':'NO ENCONTRADO','SLOT':'NO ENCONTRADO','PUERTO':'NO ENCONTRADO'};if(n.status!=='OK')return {'OLT':'DUPLICADO/REVISAR','FRAME':'DUPLICADO/REVISAR','SLOT':'DUPLICADO/REVISAR','PUERTO':'DUPLICADO/REVISAR'};return {'OLT':n.olt,'FRAME':n.frame,'SLOT':n.slot,'PUERTO':n.port}}
function exportCell(cellId,type,a){const c=a.cells.find(z=>z.id===cellId);if(!c)return;let data=[],sheetName='Datos';
 if(type==='supports'){
   data=[...c.events].sort((x,y)=>x.date.localeCompare(y.date)).map(e=>({'Cuadrante':c.id,'Cluster':e.cluster,'Cuenta':e.cuenta,'Nombre cliente':e.nombre||'','Ticket':e.ticket,'OS':e.os,'OT':e.ot,'Fecha creación FFM':new Date(e.date).toLocaleString('es-MX'),'Semana ISO':e.week,'Subtipo':e.subtipo,'Estatus':e.estatus,'Estado':e.estado,'Motivo':e.motivo,'Latitud':e.lat,'Longitud':e.lon,...networkExport(e.cuenta)}));sheetName='Soportes';
 }else{
   data=[...c.accounts].sort((x,y)=>y.events.length-x.events.length).map(acc=>{const ev=[...acc.events].sort((x,y)=>x.date.localeCompare(y.date));return {'Cuadrante':c.id,'Cluster':c.cluster,'Cuenta':acc.cuenta,'Nombre cliente':ev.find(e=>e.nombre)?.nombre||'','Eventos':ev.length,'Primer evento':new Date(ev[0].date).toLocaleString('es-MX'),'Último evento':new Date(ev[ev.length-1].date).toLocaleString('es-MX'),'Tickets':ev.map(e=>e.ticket).filter(Boolean).join(' | '),'OS':ev.map(e=>e.os).filter(Boolean).join(' | '),'OT':ev.map(e=>e.ot).filter(Boolean).join(' | '),'Subtipos':[...new Set(ev.map(e=>e.subtipo).filter(Boolean))].join(' | '),'Estatus':[...new Set(ev.map(e=>e.estatus).filter(Boolean))].join(' | '),'Latitud referencia':centerFor(c).lat,'Longitud referencia':centerFor(c).lon,...networkExport(acc.cuenta)};});sheetName='Reincidencias';
 }
 if(!data.length){alert('Este cuadrante no tiene registros para exportar con los filtros actuales.');return}const ws=XLSX.utils.json_to_sheet(data),wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,ws,sheetName);XLSX.writeFile(wb,`${type==='supports'?'Soportes':'Reincidencias'}_${cellId}.xlsx`);
}
// V1.12: exportación KML/KMZ de polígonos reales de la cuadrícula Web Mercator de 300 m.
function xmlSafe(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function polygonKml(c,kind){const sw=mercToLL(c.ix*CELL,c.iy*CELL),ne=mercToLL((c.ix+1)*CELL,(c.iy+1)*CELL);const coords=[[sw.lon,sw.lat],[ne.lon,sw.lat],[ne.lon,ne.lat],[sw.lon,ne.lat],[sw.lon,sw.lat]].map(x=>x.join(',')+',0').join(' ');return `<Placemark><name>${xmlSafe(c.id)}</name><description>${xmlSafe('Cluster: '+c.cluster+' | Soportes: '+c.supports+' | Reincidentes: '+c.repeats+' | Ranking: '+(kind==='supports'?'Soportes':'Reincidencias'))}</description><styleUrl>#${kind}</styleUrl><Polygon><tessellate>1</tessellate><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`}
async function downloadKmz(kind,cells){if(!cells.length){alert('No hay cuadrantes para exportar con los filtros actuales.');return}if(typeof JSZip==='undefined'){alert('No se pudo cargar el componente ZIP. Verifica tu conexión a internet e intenta de nuevo.');return}const title=kind==='supports'?'Soportes':'Reincidencias';const kml=`<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>${title} · Cuadrantes Primavera</name><Style id="supports"><LineStyle><color>ffb46b17</color><width>2</width></LineStyle><PolyStyle><color>663d6b0b</color></PolyStyle></Style><Style id="repeat"><LineStyle><color>ff2b39c0</color><width>2</width></LineStyle><PolyStyle><color>662b39c0</color></PolyStyle></Style><Folder><name>Top ${cells.length} ${title}</name>${cells.map(c=>polygonKml(c,kind)).join('')}</Folder></Document></kml>`;try{const zip=new JSZip();zip.file('doc.kml',kml);const blob=await zip.generateAsync({type:'blob',compression:'DEFLATE'});const url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`Primavera_${title}_${cells.length===1?cells[0].id:'Top10'}.kmz`;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),30000)}catch(e){console.error(e);alert('No fue posible generar el KMZ: '+e.message)}}
function topRows(a){updateBulkInfo(a);$('supportsRanking').style.display=viewMode==='repeat'?'none':'';$('repeatRanking').style.display=viewMode==='supports'?'none':'';$('comparePanel').style.display=viewMode==='both'?'':'none';$('supportsRanking').parentElement.classList.toggle('single-ranking',viewMode!=='both');const r=rankedCells(a),ts=r.supports.slice(0,10),tr=r.repeat.slice(0,10),allowed=autoVisibleIds(a),checked=c=>allowed===null||allowed.has(c.id);$('topSupports').innerHTML=ts.map((c,i)=>`<tr class="clickrow" data-cell="${c.id}"><td><input class="cell-toggle" type="checkbox" data-cell="${c.id}" ${checked(c)?'checked':''}></td><td>${i+1}</td><td>${c.id}</td><td>${esc(c.cluster)}</td><td><b>${c.supports}</b></td><td>${c.repeats}</td><td><button class="export-cell" data-export="supports" data-cell="${c.id}">Exportar</button></td><td><button class="kmz-cell" data-kind="supports" data-cell="${c.id}">Descargar</button></td></tr>`).join('');$('topRepeat').innerHTML=tr.map((c,i)=>`<tr class="clickrow" data-cell="${c.id}"><td><input class="cell-toggle" type="checkbox" data-cell="${c.id}" ${checked(c)?'checked':''}></td><td>${i+1}</td><td>${c.id}</td><td>${esc(c.cluster)}</td><td><b>${c.repeats}</b></td><td>${c.supports}</td><td><button class="export-cell" data-export="repeat" data-cell="${c.id}">Exportar</button></td><td><button class="kmz-cell" data-kind="repeat" data-cell="${c.id}">Descargar</button></td></tr>`).join('');const ps=new Map(ts.map((c,i)=>[c.id,i+1])),pr=new Map(tr.map((c,i)=>[c.id,i+1])),ids=[...new Set([...ps.keys(),...pr.keys()])],both=ids.filter(id=>ps.has(id)&&pr.has(id));$('compareSummary').textContent=`${both.length} zonas coinciden en los Top 10 individuales. En modo Ambos, el mapa utiliza un Top 10 combinado por convergencia.`;$('compareBody').innerHTML=ids.sort((x,y)=>(ps.get(x)||99)-(ps.get(y)||99)).map(id=>{const c=a.cells.find(z=>z.id===id),yes=ps.has(id)&&pr.has(id);return `<tr class="clickrow" data-cell="${id}"><td>${id}</td><td>${esc(c?.cluster||'')}</td><td>${ps.get(id)||'—'}</td><td>${c?.supports||0}</td><td>${pr.get(id)||'—'}</td><td>${c?.repeats||0}</td><td><span class="badge ${yes?'yes':'no'}">${yes?'Sí':'No'}</span></td></tr>`}).join('');document.querySelectorAll('.clickrow').forEach(row=>row.classList.toggle('selected-quadrant',row.dataset.cell===selectedCell));document.querySelectorAll('.clickrow').forEach(row=>row.onclick=()=>{const c=a.cells.find(z=>z.id===row.dataset.cell);if(c)selectCell(c,a)});document.querySelectorAll('.export-cell').forEach(b=>b.onclick=e=>{e.stopPropagation();exportCell(b.dataset.cell,b.dataset.export,a)});document.querySelectorAll('.kmz-cell').forEach(b=>b.onclick=e=>{e.stopPropagation();downloadKmz(b.dataset.kind,[a.cells.find(c=>c.id===b.dataset.cell)].filter(Boolean))});document.querySelectorAll('.kmz-all').forEach(b=>b.onclick=()=>{const rr=rankedCells(a);downloadKmz(b.dataset.kind,(b.dataset.kind==='supports'?rr.supports:rr.repeat).slice(0,10))});document.querySelectorAll('.cell-toggle').forEach(cb=>cb.onclick=e=>{e.stopPropagation();if(quadrantVisibility!=='manual'){const current=autoVisibleIds(a);manualVisibleIds=current===null?new Set(a.cells.map(c=>c.id)):new Set(current);quadrantVisibility='manual';$('quadrantVisibility').value='manual'}cb.checked?manualVisibleIds.add(cb.dataset.cell):manualVisibleIds.delete(cb.dataset.cell);draw(a);drawPoints(a);topRows(a)})}
function selectCell(c,a){selectedCell=c.id;const b=boundsFor(c);map.fitBounds(b,{maxZoom:17,padding:[40,40]});const reps=[...c.accounts].sort((x,y)=>y.events.length-x.events.length);const term=c.events.filter(e=>e.estatus.toLowerCase().includes('termin')).length,canc=c.events.filter(e=>e.estatus.toLowerCase().includes('cancel')).length;updateSearchOverlay(a);document.querySelectorAll('.clickrow').forEach(row=>row.classList.toggle('selected-quadrant',row.dataset.cell===c.id));$('detailHint').textContent=c.id;$('cellDetail').innerHTML=`<div class="detail-grid"><div><span>Cluster predominante</span><strong>${esc(c.cluster)}</strong></div><div><span>Soportes</span><strong>${c.supports}</strong></div><div><span>Clientes reincidentes</span><strong>${c.repeats}</strong></div><div><span>Terminadas / Canceladas</span><strong>${term} / ${canc}</strong></div></div><h3>Cuentas reincidentes del cuadrante</h3>${reps.length?`<div class="account-list"><table><thead><tr><th>Cuenta</th><th>Eventos</th><th>Último evento</th><th>Subtipos</th></tr></thead><tbody>${reps.map(a=>`<tr><td>${esc(a.cuenta)}</td><td><b>${a.events.length}</b></td><td>${new Date([...a.events].sort((x,y)=>y.date.localeCompare(x.date))[0].date).toLocaleDateString('es-MX')}</td><td>${esc([...new Set(a.events.map(e=>e.subtipo))].join(' · '))}</td></tr>`).join('')}</tbody></table></div>`:'<div class="muted">No hay clientes reincidentes en este cuadrante con los filtros actuales.</div>'}${cellPonTop(c)}`;}
function render(){const ev=filtered(),a=analyze(ev);$('kEvents').textContent=ev.length.toLocaleString('es-MX');$('kAccounts').textContent=a.accounts.size.toLocaleString('es-MX');$('kRepeat').textContent=a.repeat.length.toLocaleString('es-MX');$('kCells').textContent=a.cells.filter(c=>c.supports).length.toLocaleString('es-MX');/* V-46: el indicador kImports pertenece a la capa visual Clean Up. */window.supportCalendarV71?.prepare(ev);draw(a);drawPoints(a);topRows(a);renderPon(a);updateSearchOverlay(a);if(selectedCell){const c=a.cells.find(z=>z.id===selectedCell);if(c){if(searchAccount&&!c.events.some(e=>e.cuenta===searchAccount))searchAccount='';selectCell(c,a)}else{$('cellDetail').textContent='El cuadrante seleccionado no tiene datos con los filtros actuales.'}}}
$('searchGo').onclick=doMapSearch;$('mapSearch').addEventListener('keydown',e=>{if(e.key==='Enter')doMapSearch()});$('searchClear').onclick=clearMapSearch;$('searchNext').onclick=()=>{const i=searchLocations.indexOf(selectedCell),id=searchLocations[(i+1)%searchLocations.length],a=analyze(filtered()),c=a.cells.find(x=>x.id===id);if(c){selectCell(c,a);$('searchResult').textContent=`Ubicación ${((i+1)%searchLocations.length)+1} de ${searchLocations.length}: ${id}`}};
$('ponScope').onchange=()=>renderPon(analyze(filtered()));
$('networkFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;importProgress('Cargando base de red',f.name,5,'Leyendo archivo…');try{await requireStorage();await ingestNetwork(f)}catch(err){importFailed(f.name,err.message||String(err));status(err.message||String(err),'error')}finally{e.target.value=''}};
$('excelFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;importProgress('Cargando soportes',f.name,5,'Leyendo archivo…');try{await requireStorage();await ingest(f)}catch(err){importFailed(f.name,err.message||String(err));status(err.message||String(err),'error')}finally{e.target.value=''}};
$('pointsEnabled').onchange=()=>{pointsEnabled=$('pointsEnabled').checked;render()};
$('pointsMode').onchange=()=>{pointsMode=$('pointsMode').value;render()};
$('pointsScope').onchange=()=>{pointsScope=$('pointsScope').value;render()};
$('quadrantVisibility').onchange=()=>{quadrantVisibility=$('quadrantVisibility').value;if(quadrantVisibility==='manual'&&manualVisibleIds.size===0){const a=analyze(filtered());manualVisibleIds=new Set(a.cells.map(c=>c.id))}selectedCell=null;render()};$('statusFilter').onchange=render;$('viewMode').querySelectorAll('button').forEach(b=>b.onclick=()=>{$('viewMode').querySelectorAll('button').forEach(x=>x.classList.remove('active'));b.classList.add('active');viewMode=b.dataset.mode;render()});
$('yearsAll').onclick=()=>{window.supportCalendarV71?.clearApplied();document.querySelectorAll('#years input').forEach(i=>{i.checked=true;selectedYears.add(i.value)});renderWeeks();render()};$('yearsNone').onclick=()=>{window.supportCalendarV71?.clearApplied();selectedYears.clear();document.querySelectorAll('#years input').forEach(i=>i.checked=false);renderWeeks();render()};
// V-72: gestión de semanas en support-calendar-v72.js.
$('weeksAll').onclick=()=>{window.supportCalendarV71?.clearApplied();document.querySelectorAll('#weeks input').forEach(i=>{i.checked=true;selectedWeekNums.add(i.value)});render()};$('weeksNone').onclick=()=>{window.supportCalendarV71?.clearApplied();selectedWeekNums.clear();document.querySelectorAll('#weeks input').forEach(i=>i.checked=false);render()};
$('clustersAll').onclick=()=>{document.querySelectorAll('#clusters input').forEach(i=>{i.checked=true;selectedClusters.add(i.value)});render()};$('clustersNone').onclick=()=>{selectedClusters.clear();document.querySelectorAll('#clusters input').forEach(i=>i.checked=false);render()};
$('top10On').onclick=()=>bulkVisibility('top',true);$('top10Off').onclick=()=>bulkVisibility('top',false);$('restOn').onclick=()=>bulkVisibility('rest',true);$('restOff').onclick=()=>bulkVisibility('rest',false);$('showAllQuadrants').onclick=()=>{quadrantVisibility='all';manualVisibleIds.clear();$('quadrantVisibility').value='all';selectedCell=null;render()};
// V1.40: only these four stores belong to Soportes. Never delete the entire IndexedDB database or origin storage.
let deleteSelection={supports:false,network:false};
function openDeleteDialog(preselect=''){
 $('deleteSupports').checked=preselect==='supports';$('deleteNetwork').checked=preselect==='network';
 $('deleteChoice').hidden=false;$('deleteFinal').hidden=true;$('deleteConfirm').checked=false;$('deleteModal').hidden=false;$('deleteModal').dataset.stage='select';
 $('deleteExecute').disabled=true;$('deleteExecute').textContent='Continuar';
 $('deleteSummary').textContent=`En este navegador: ${allEvents.length.toLocaleString('es-MX')} eventos de soporte y ${networkIndex.size.toLocaleString('es-MX')} cuentas de red. Selecciona qué deseas eliminar.`;
 $('deleteError').textContent='';
}
function closeDeleteDialog(){$('deleteModal').hidden=true;}
function updateDeleteButton(){const selected=$('deleteSupports').checked||$('deleteNetwork').checked;const stage=$('deleteModal').dataset.stage;$('deleteExecute').disabled=stage==='select'?!selected:!$('deleteConfirm').checked;}
$('deleteSupports').onchange=updateDeleteButton;$('deleteNetwork').onchange=updateDeleteButton;$('deleteConfirm').onchange=updateDeleteButton;
$('deleteCancel').onclick=closeDeleteDialog;
$('deleteModal').addEventListener('click',e=>{if(e.target===$('deleteModal'))closeDeleteDialog()});
$('clearDb').onclick=()=>openDeleteDialog();$('clearNetwork').onclick=()=>openDeleteDialog('network');
$('deleteExecute').onclick=async()=>{
 if($('deleteModal').dataset.stage==='select'){
  deleteSelection={supports:$('deleteSupports').checked,network:$('deleteNetwork').checked};
  if(!deleteSelection.supports&&!deleteSelection.network)return;
  $('deleteModal').dataset.stage='confirm';$('deleteChoice').hidden=true;$('deleteFinal').hidden=false;
  $('deleteConfirm').checked=false;$('deleteExecute').disabled=true;$('deleteExecute').textContent='Eliminar definitivamente';
  const parts=[];if(deleteSelection.supports)parts.push(`${allEvents.length.toLocaleString('es-MX')} soportes y su historial de importaciones`);
  if(deleteSelection.network)parts.push(`${networkIndex.size.toLocaleString('es-MX')} cuentas de la base de red`);
  $('deleteFinalSummary').textContent='Se eliminarán de este navegador: '+parts.join(' y ')+'. No se afectará Repeat 60 ni Planta Externa.';
  return;
 }
 if(!$('deleteConfirm').checked)return;
 $('deleteExecute').disabled=true;$('deleteCancel').disabled=true;
 try{
  const stores=[...(deleteSelection.supports?[STORE,IMPORTS]:[]),...(deleteSelection.network?[NETWORK,META]:[])];
  // One atomic IndexedDB transaction: either all selected stores are cleared, or none are.
  await new Promise((resolve,reject)=>{const tx=db.transaction(stores,'readwrite');for(const name of stores)tx.objectStore(name).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Borrado cancelado'))});
  if(deleteSelection.supports){selectedYears.clear();selectedWeekNums.clear();selectedClusters.clear();selectedCell=null;searchAccount='';searchLocations=[];}
  await reload();closeDeleteDialog();status('Borrado definitivo completado en el almacenamiento local: '+(deleteSelection.supports?'soportes ':'')+(deleteSelection.network?'base de red':'')+'.','ok');
 }catch(err){$('deleteError').textContent='No se pudo completar el borrado: '+(err.message||err);$('deleteExecute').disabled=false;status('Error de borrado: '+(err.message||err),'error')}
 finally{$('deleteCancel').disabled=false}
};
// V-76: el arranque se invoca al final de las dependencias de Soportes.
let supportStartPromiseV76=null;
function startSupportsV76(){
 if(supportStartPromiseV76)return supportStartPromiseV76;
 supportStartPromiseV76=(async()=>{setStorageReady(false);try{db=await openDB();await reload();setStorageReady(true);resolveStorageReady();if(allEvents.length)status(`Histórico local cargado: ${allEvents.length.toLocaleString('es-MX')} eventos únicos.`,'ok')}catch(e){setStorageReady(false);rejectStorageReady(e);status('No se pudo abrir el almacenamiento local del navegador: '+e.message,'error')}})();
 return supportStartPromiseV76;
}
