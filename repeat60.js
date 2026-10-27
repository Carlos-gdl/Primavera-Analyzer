'use strict';
// V1.25: Repeat 60 100% independiente; sin lectura de la base de soportes.
const $=id=>document.getElementById(id), REPEAT_DB='primavera_repeat60_v120', RSTORE='repeat_os', CELL=300;
let repeatDb, records=[], chosenYears=new Set(),chosenWeeks=new Set(),chosenClusters=new Set(), activeTab='cells',repeatTopLimit=10,map,canvas,markers,quadrants,street,satellite,lastFile='',quadMode='all',focusedQuadrant=null,repeat2RActive=false,repeat2RAccounts=new Set(),repeat2ROnly=false,repeat2RMapMarkers=new Map();
const visibility={cells:{mode:'all',hidden:new Set()},accounts:{mode:'all',hidden:new Set()}};
const clean=x=>String(x??'').trim(), acct=x=>{const v=clean(x).replace(/\s+/g,'');return /^\d{1,10}$/.test(v)?v.padStart(10,'0'):v}, esc=x=>clean(x).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const fmt=n=>n.toLocaleString('es-MX');
function message(s,kind=''){const e=$('notice');e.textContent=s;e.className=kind}
function openDB(name,version,upgrade){return new Promise((resolve,reject)=>{const r=indexedDB.open(name,version);r.onupgradeneeded=()=>upgrade(r.result);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.onblocked=()=>reject(new Error('La base está bloqueada por otra pestaña'))})}
function getAll(db,store){return new Promise((resolve,reject)=>{const r=db.transaction(store).objectStore(store).getAll();r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}
function putAll(db,store,rows){return new Promise((resolve,reject)=>{const tx=db.transaction(store,'readwrite'),s=tx.objectStore(store);rows.forEach(x=>s.put(x));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
// V-52: borrado exclusivo y comprobado del almacén persistente de Repeat 60.
function clearRepeat(){return new Promise((resolve,reject)=>{
 const tx=repeatDb.transaction(RSTORE,'readwrite');
 tx.objectStore(RSTORE).clear();
 tx.oncomplete=()=>resolve();
 tx.onerror=()=>reject(tx.error||new Error('Error al borrar el histórico Repeat'));
 tx.onabort=()=>reject(tx.error||new Error('Se canceló el borrado Repeat'));
})}
function countRepeat(){return new Promise((resolve,reject)=>{
 const tx=repeatDb.transaction(RSTORE,'readonly');
 const request=tx.objectStore(RSTORE).count();
 let count;
 request.onsuccess=()=>{count=request.result};
 tx.oncomplete=()=>resolve(count);
 tx.onerror=()=>reject(tx.error||new Error('No se pudo verificar el histórico Repeat'));
 tx.onabort=()=>reject(tx.error||new Error('Se canceló la verificación Repeat'));
})}
let repeatHistoryBusy=false;
async function eraseRepeatHistory(){
 if(repeatHistoryBusy)return;
 if(!confirm('¿Borrar permanentemente TODO el histórico de Repeat 60 guardado en este navegador? Tendrás que importar una base nueva desde cero. Las otras herramientas NO se modificarán.'))return;
 repeatHistoryBusy=true;
 const removeButton=$('deleteRepeat'),fileInput=$('repeatFile');
 removeButton.disabled=true;fileInput.disabled=true;
 try{
  await clearRepeat();
  const remaining=await countRepeat();
  if(remaining!==0)throw new Error(`No se pudo confirmar el borrado completo: permanecen ${remaining} registros.`);
  records=[];lastFile='';
  chosenYears.clear();chosenWeeks.clear();chosenClusters.clear();
  repeat2RActive=false;repeat2ROnly=false;repeat2RAccounts.clear();repeat2RMapMarkers.clear();
  activeTab='cells';repeatTopLimit=10;focusedQuadrant=null;
  for(const type of ['cells','accounts']){visibility[type].mode='all';visibility[type].hidden.clear()}
  document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b.dataset.tab==='cells'));
  document.querySelector('[data-tab="cells"]').textContent='Top 10 Cuadrantes';
  $('repeatTopMenu').hidden=true;
  $('accountQuery').value='';$('clusterSearch').value='';
  $('missingOnly').checked=false;
  buildFilters(true);render();
  map.closePopup();
  message('Histórico Repeat eliminado y verificado (0 registros). Importa una base nueva para comenzar.','ok');
 }catch(error){
  message('No se pudo completar o verificar el borrado de Repeat 60: '+(error.message||String(error)),'error');
  try{await load()}catch(_){}
 }finally{
  repeatHistoryBusy=false;removeButton.disabled=false;fileInput.disabled=false;
 }
}
function parseDate(v){if(v instanceof Date&&!isNaN(v))return v;if(typeof v==='number'){const p=XLSX.SSF.parse_date_code(v);if(!p)return null;return new Date(p.y,p.m-1,p.d,p.H||0,p.M||0,Math.floor(p.S||0))}const s=clean(v);let m;if(m=s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))return new Date(+m[1],+m[2]-1,+m[3],+(m[4]||0),+(m[5]||0),+(m[6]||0));if(m=s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))return new Date(+m[3],+m[2]-1,+m[1],+(m[4]||0),+(m[5]||0),+(m[6]||0));return null}
function week(d){const x=new Date(Date.UTC(d.getFullYear(),d.getMonth(),d.getDate()));x.setUTCDate(x.getUTCDate()+4-(x.getUTCDay()||7));const y=new Date(Date.UTC(x.getUTCFullYear(),0,1));return `${x.getUTCFullYear()}-S${String(Math.ceil((((x-y)/86400000)+1)/7)).padStart(2,'0')}`}
function weekRange(w){const [y,n]=w.split('-S').map(Number);const jan4=new Date(Date.UTC(y,0,4));jan4.setUTCDate(jan4.getUTCDate()-(jan4.getUTCDay()||7)+1+(n-1)*7);const end=new Date(jan4);end.setUTCDate(end.getUTCDate()+6);const short=d=>`${String(d.getUTCDate()).padStart(2,'0')}/${String(d.getUTCMonth()+1).padStart(2,'0')}`;return `${short(jan4)} – ${short(end)}`}
function cellFor(lat,lon){const R=6378137,x=R*lon*Math.PI/180,y=R*Math.log(Math.tan(Math.PI/4+lat*Math.PI/360)),ix=Math.floor(x/CELL),iy=Math.floor(y/CELL);return {id:`Q-${ix}-${iy}`,ix,iy}}
function cellBounds(c){const R=6378137,point=(x,y)=>[(2*Math.atan(Math.exp(y/R))-Math.PI/2)*180/Math.PI,x/R*180/Math.PI];return [point(c.ix*CELL,c.iy*CELL),point((c.ix+1)*CELL,(c.iy+1)*CELL)]}
function validCoords(lat,lon){return Number.isFinite(lat)&&Number.isFinite(lon)&&Math.abs(lat)<=90&&Math.abs(lon)<=180&&!(lat===0&&lon===0)}
// Repeat no consulta ni abre la base de datos de Soportes.
async function load(){records=await getAll(repeatDb,RSTORE);records.forEach(r=>{r.cuenta=acct(r.cuenta)});buildFilters(true);render();const ts=records.map(r=>r.loadedAt).filter(Boolean).sort().at(-1)}
function parseCoordinates(value,latValue,lonValue){
 const normalized=clean(value).replace(/[;|]/g,',').replace(/\s+/g,'');
 const m=normalized.match(/^(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)$/);
 if(m){const lat=Number(m[1]),lon=Number(m[2]);if(validCoords(lat,lon))return {lat,lon}}
 const lat=Number(clean(latValue).replace(',','.')),lon=Number(clean(lonValue).replace(',','.'));
 return clean(latValue)&&clean(lonValue)&&validCoords(lat,lon)?{lat,lon}:null;
}
function normalizeHeader(s){return clean(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/\s+/g,' ')}
function fieldIndex(headers,part,fallback){const i=headers.findIndex(h=>normalizeHeader(h).includes(normalizeHeader(part)));return i>=0?i:fallback}
// V1.36: progreso vinculado a operaciones completadas; no simula transferencias.
const repeatUpload={onProgress:null};
function repeatUploadUpdate(percent,stage,detail){if(typeof repeatUpload.onProgress==='function')repeatUpload.onProgress(percent,stage,detail)}
function repeatUploadShow(file){const overlay=$('repeatUploadOverlay');overlay.hidden=false;overlay.classList.remove('is-finished');$('repeatUploadHeading').textContent='Procesando archivo Excel…';$('repeatUploadAccept').disabled=true;$('repeatUploadDetail').classList.remove('is-error');repeatUploadUpdate(0,'Preparando lectura…',`Archivo: ${file.name}`)}
function repeatUploadProgress(percent,stage,detail){if(percent!==null){const value=Math.max(0,Math.min(100,Math.floor(percent)));$('repeatUploadFill').style.width=value+'%';$('repeatUploadPercent').textContent=value+' %';$('repeatUploadTrack').setAttribute('aria-valuenow',String(value))}else{$('repeatUploadPercent').textContent='Procesando…';$('repeatUploadTrack').removeAttribute('aria-valuenow')}$('repeatUploadStage').textContent=stage;if(detail!==undefined)$('repeatUploadDetail').textContent=detail}
function repeatUploadFinish(error){$('repeatUploadOverlay').classList.add('is-finished');$('repeatUploadAccept').disabled=false;if(error){$('repeatUploadHeading').textContent='No se pudo cargar el archivo';$('repeatUploadStage').textContent='Revisa el archivo e inténtalo de nuevo.';$('repeatUploadDetail').classList.add('is-error');$('repeatUploadDetail').textContent=error.message||String(error)}else{$('repeatUploadHeading').textContent='Carga completada';repeatUploadProgress(100,'Archivo procesado correctamente.',$('notice').textContent)}}
async function repeatReadFile(file){if(!file.stream||!file.size){repeatUploadUpdate(null,'Leyendo archivo…','El navegador no informa avance de lectura.');return await file.arrayBuffer()}const reader=file.stream().getReader(),chunks=[];let loaded=0;while(true){const {done,value}=await reader.read();if(done)break;chunks.push(value);loaded+=value.byteLength;repeatUploadUpdate(Math.min(25,Math.floor(25*loaded/file.size)),'Leyendo archivo Excel…',`${fmt(loaded)} de ${fmt(file.size)} bytes leídos`)}const buffer=new Uint8Array(loaded);let pos=0;for(const chunk of chunks){buffer.set(chunk,pos);pos+=chunk.byteLength}return buffer.buffer}
async function ingest(file){
 if(typeof XLSX==='undefined')throw new Error('No se cargó la biblioteca Excel. Revisa tu conexión.');
 const wb=XLSX.read(await repeatReadFile(file),{type:'array',cellDates:true});
 repeatUploadUpdate(null,'Interpretando hojas del Excel…','Analizando estructura del libro.');
 const sheet=wb.Sheets[wb.SheetNames[0]],data=XLSX.utils.sheet_to_json(sheet,{header:1,defval:'',raw:true});
 if(!data.length)throw new Error('El Excel está vacío');
 repeatUploadUpdate(35,'Validando estructura…',`${fmt(data.length)} filas leídas del Excel.`);
 const hi=data.findIndex(row=>row.some(c=>normalizeHeader(c).includes('folio'))&&row.some(c=>normalizeHeader(c).includes('cuenta')));
 if(hi<0)throw new Error('No se encontraron encabezados Cuenta y Folio');
 const h=data[hi].map(clean),accountCol=fieldIndex(h,'cuenta',0),folioCol=fieldIndex(h,'folio',2),openCol=fieldIndex(h,'fecha/hora de apertura',9),closeCol=fieldIndex(h,'fecha/hora de cierre',10),clusterCol=fieldIndex(h,'clusterinstalacion',12),districtCol=fieldIndex(h,'distritoinstalacion',13),coordsCol=fieldIndex(h,'coordenadas',19),latCol=fieldIndex(h,'lat',17),lonCol=fieldIndex(h,'long',18);
 if(!normalizeHeader(h[closeCol]).includes('cierre')||!normalizeHeader(h[openCol]).includes('apertura')||!normalizeHeader(h[coordsCol]).includes('coordenadas'))throw new Error('Faltan columnas requeridas J (apertura), K (cierre) o T (coordenadas).');
 repeatUploadUpdate(40,'Comparando contra histórico…',`${fmt(records.length)} OS existentes en el histórico.`);
 const existing=new Map(records.map(r=>[r.os,r]));const changes=[],now=new Date().toISOString();
 let added=0,skipped=0,completed=0,invalid=0,usedOpening=0,withoutDate=0,updated=0;
 for(let i=hi+1;i<data.length;i++){
  if((i-hi)%350===0){repeatUploadUpdate(40+Math.floor(45*(i-hi)/Math.max(1,data.length-hi-1)),'Procesando registros…',`${fmt(i-hi)} de ${fmt(data.length-hi-1)} filas revisadas`);await new Promise(resolve=>setTimeout(resolve,0))}
  const row=data[i];if(!row||row.every(v=>clean(v)===''))continue;
  const os=clean(row[folioCol]),cuenta=acct(row[accountCol]);if(!os||!cuenta){invalid++;continue}
  const point=parseCoordinates(row[coordsCol],row[latCol],row[lonCol]);
  let d=parseDate(row[closeCol]),dateSource='cierre';
  if(!d||isNaN(d.getTime())){d=parseDate(row[openCol]);dateSource='apertura';if(d&&!isNaN(d.getTime()))usedOpening++}
  if(!d||isNaN(d.getTime())){d=null;dateSource='sin fecha';withoutDate++}
  const raw=Object.fromEntries(h.map((k,j)=>[k,row[j] instanceof Date?row[j].toISOString():row[j]]));
  const old=existing.get(os);
  if(old){
   // Se preserva la OS original. Solo se completan datos antes faltantes;
   // el archivo V1.21 permite reparar importaciones antiguas que dependían de Soportes.
   let changed=false;
   if(old.cuenta===cuenta&&point&&!(old.lat!==null&&old.lon!==null&&validCoords(Number(old.lat),Number(old.lon)))){old.lat=point.lat;old.lon=point.lon;old.coordSource='repeat_excel';changed=true;completed++}
   if(old.cuenta===cuenta&&d&&(!old.date||old.dateSource==='sin fecha')){old.date=d.toISOString();old.week=week(d);old.dateSource=dateSource;changed=true}
   if(old.cuenta===cuenta&&!old.raw?.[h[coordsCol]]){old.raw={...old.raw,...raw};changed=true}
   if(changed){changes.push(old);updated++}else skipped++;
   continue;
  }
  const r={os,cuenta,date:d?d.toISOString():null,dateSource,week:d?week(d):'SIN_FECHA',cluster:clean(row[clusterCol])||'SIN CLÚSTER',district:clean(row[districtCol]),lat:point?.lat??null,lon:point?.lon??null,coordSource:point?'repeat_excel':'none',loadedAt:now,raw};
  existing.set(os,r);changes.push(r);added++;
 }
 repeatUploadUpdate(null,'Guardando información…',`${fmt(changes.length)} registros nuevos o complementados por guardar.`);
 if(changes.length)await putAll(repeatDb,RSTORE,changes);
 repeatUploadUpdate(95,'Actualizando tablero…','Los cambios fueron guardados; actualizando indicadores y mapa.');
 records=[...existing.values()];buildFilters(true);render();
 message(`${file.name}: ${fmt(added)} OS nuevas · ${fmt(skipped)} existentes omitidas · ${fmt(updated)} registros completados (${fmt(completed)} coordenadas) · ${fmt(usedOpening)} fechas tomadas de apertura · ${fmt(withoutDate)} sin fecha · ${fmt(invalid)} filas sin OS/cuenta.`, 'ok');
}
function buildFilters(reset=false){const years=[...new Set(records.map(r=>r.week==='SIN_FECHA'?'SIN_FECHA':r.week.slice(0,4)))].sort(),weeks=[...new Set(records.map(r=>r.week))].sort(),clusters=[...new Set(records.map(r=>r.cluster))].sort((a,b)=>a.localeCompare(b,'es'));if(reset){chosenYears=new Set(years);chosenWeeks=new Set(weeks);chosenClusters=new Set(clusters)}$('years').innerHTML=years.map(y=>`<label><input type="checkbox" data-year="${esc(y)}" ${chosenYears.has(y)?'checked':''}> ${esc(y)}</label>`).join('');$('weeks').innerHTML=weeks.map(w=>`<label><input type="checkbox" data-week="${esc(w)}" ${chosenWeeks.has(w)?'checked':''}> ${w==='SIN_FECHA'?'Sin fecha':`Semana ${esc(w.split('-S')[1])} · ${weekRange(w)}`}</label>`).join('');$('clusters').innerHTML=clusters.map(c=>`<label><input type="checkbox" data-cluster="${esc(c)}" ${chosenClusters.has(c)?'checked':''}> ${esc(c)}</label>`).join('');$('years').querySelectorAll('input').forEach(e=>e.onchange=()=>{e.checked?chosenYears.add(e.dataset.year):chosenYears.delete(e.dataset.year);render()});$('weeks').querySelectorAll('input').forEach(e=>e.onchange=()=>{e.checked?chosenWeeks.add(e.dataset.week):chosenWeeks.delete(e.dataset.week);render()});$('clusters').querySelectorAll('input').forEach(e=>e.onchange=()=>{e.checked?chosenClusters.add(e.dataset.cluster):chosenClusters.delete(e.dataset.cluster);render()});$('clusterSearch').dispatchEvent(new Event('input'))}
function filtered(){return records.filter(r=>chosenYears.has(r.week==='SIN_FECHA'?'SIN_FECHA':r.week.slice(0,4))&&chosenWeeks.has(r.week)&&chosenClusters.has(r.cluster))}
function grouped(rows,key){const m=new Map();for(const r of rows){const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)}return [...m].map(([name,events])=>({name,events,os:events.length,accounts:new Set(events.map(r=>r.cuenta)).size})).sort((a,b)=>b.os-a.os||a.name.localeCompare(b.name))}
function analytics(rows){const located=rows.filter(r=>(r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)))),missing=rows.filter(r=>!(r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)))),cells=new Map();for(const r of located){const c=cellFor(+r.lat,+r.lon);if(!cells.has(c.id))cells.set(c.id,{...c,events:[]});cells.get(c.id).events.push(r)}const ranked=[...cells.values()].map(c=>({...c,os:c.events.length,accounts:new Set(c.events.map(r=>r.cuenta)).size,cluster:grouped(c.events,r=>r.cluster)[0]?.name||''})).sort((a,b)=>b.os-a.os||a.id.localeCompare(b.id));return {located,missing,ranked,clusters:grouped(rows,r=>r.cluster),accounts:grouped(rows,r=>r.cuenta),weeks:grouped(rows,r=>r.week)}}
function render(){const rows=filtered(),a=analytics(rows);$('kOS').textContent=fmt(rows.length);$('kAccounts').textContent=fmt(new Set(rows.map(r=>r.cuenta)).size);const osByAccount=new Map();for(const r of rows){if(!r.cuenta)continue;if(!osByAccount.has(r.cuenta))osByAccount.set(r.cuenta,new Set());osByAccount.get(r.cuenta).add(r.os)}repeat2RAccounts=new Set([...osByAccount].filter(([,os])=>os.size>=2).map(([account])=>account));$('k2PlusR').textContent=fmt(repeat2RAccounts.size);$('repeat2RToggle').classList.toggle('is-active',repeat2RActive);$('repeat2RToggle').setAttribute('aria-pressed',String(repeat2RActive));const repeatTab=document.querySelector('[data-tab="repeat2r"]');repeatTab.disabled=!repeat2RActive;repeatTab.setAttribute('aria-disabled',String(!repeat2RActive));$('kLocated').textContent=fmt(new Set(a.located.map(r=>r.cuenta)).size);$('kMissing').textContent=fmt(new Set(a.missing.map(r=>r.cuenta)).size);$('kClusters').textContent=fmt(a.clusters.length);$('kCells').textContent=fmt(a.ranked.length);$('downloadMissing').disabled=!a.missing.length;drawMap(a);$('quadMode').value=visibility.cells.mode;renderRankings(a);$('missingOnly').checked&&message(`Hay ${fmt(new Set(a.missing.map(r=>r.cuenta)).size)} cuentas sin coordenadas en la selección.`)}
function isVisible(type,id,topIds){const state=visibility[type];return (state.mode!=='none')&&(state.mode!=='top'||topIds.has(id))&&!state.hidden.has(id)}
function dateInfo(r){const source=r.dateSource==='apertura'?'Fecha de apertura':'Fecha de cierre';const date=r.date?new Date(r.date):null;const shown=date&&!isNaN(date)?date.toLocaleString('es-MX',{dateStyle:'short',timeStyle:'short'}):'Sin fecha';return {source,shown}}
function eventTable(events){return `<div class="repeat-popup-scroll"><table class="repeat-popup-table"><thead><tr><th>OS</th><th>Cuenta</th><th>Fecha / origen</th></tr></thead><tbody>${events.map(r=>{const d=dateInfo(r);return `<tr><td>${esc(r.os)}</td><td>${esc(r.cuenta)}</td><td><b>${esc(d.shown)}</b><small>${esc(d.source)}</small></td></tr>`}).join('')}</tbody></table></div>`}
const MALVA='#AD8BC6', ORANGE='#FF8500';
const repeatPin=L.divIcon({className:'repeat-pin-wrapper',html:'<span class="repeat-pin"><span class="repeat-pin-center"></span></span>',iconSize:[19,27],iconAnchor:[9,26],popupAnchor:[0,-23]});
const repeatPin2R=L.divIcon({className:'repeat-pin-wrapper repeat-pin-2r',html:'<span class="repeat-pin"><span class="repeat-pin-center"></span></span>',iconSize:[19,27],iconAnchor:[9,26],popupAnchor:[0,-23]});
function drawMap(a){
 markers.clearLayers();quadrants.clearLayers();repeat2RMapMarkers.clear();
 const byAccount=new Map();
 for(const r of a.located){if(!byAccount.has(r.cuenta))byAccount.set(r.cuenta,[]);byAccount.get(r.cuenta).push(r)}
 const bounds=[],topAccounts=new Set(a.accounts.slice(0,10).map(x=>x.name)),topCells=new Set(a.ranked.slice(0,10).map(x=>x.id));
 // Polígonos primero, marcadores encima, para mantener el clic en los pins.
 for(const c of a.ranked){
  if(!isVisible('cells',c.id,topCells))continue;
  const p=L.rectangle(cellBounds(c),{renderer:canvas,color:MALVA,weight:2.4,fillColor:MALVA,fillOpacity:Math.min(.25,.065+c.os/Math.max(1,a.ranked[0].os)*.13)});
  p.bindTooltip(`${esc(c.id)} · ${c.os} OS · ${c.accounts} cuentas`);
  p.on('click',()=>showCell(c));p.addTo(quadrants);
 }
 for(const [account,events] of byAccount){
  const r=events[0];bounds.push([+r.lat,+r.lon]);if(!isVisible('accounts',account,topAccounts))continue;if(repeat2RActive&&repeat2ROnly&&!repeat2RAccounts.has(account))continue;
  const marker=L.marker([+r.lat,+r.lon],{icon:repeat2RActive&&repeat2RAccounts.has(account)?repeatPin2R:repeatPin});
  marker.bindPopup(`<h3>Cuenta ${esc(account)} · ${esc(r.cluster)}</h3><p>${events.length} OS Repeat</p>${eventTable(events)}`,{maxWidth:510,maxHeight:380});marker.addTo(markers);repeat2RMapMarkers.set(account,marker);
 }
 if(bounds.length&&!map._repeatFitted){map.fitBounds(bounds,{padding:[35,35],maxZoom:14});map._repeatFitted=true}
}
// V1.24: búsqueda en la base Repeat, independiente de filtros y Soportes.
function locateAccount(query){
 const id=acct(query);
 if(!id){message('Escribe una cuenta para buscar.','error');return}
 const matches=records.filter(r=>acct(r.cuenta)===id);
 if(!matches.length){message(`La cuenta ${id} no existe en la base Repeat 60.`, 'error');return}
 const positioned=matches.filter(r=>r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)));
 if(!positioned.length){message(`La cuenta ${id} tiene ${matches.length} OS, pero no cuenta con coordenadas válidas.`, 'error');return}
 // La búsqueda no cambia los filtros; para localizar la cuenta, se revela su marcador y cuadrante temporalmente.
 const r=positioned[0], cell=cellFor(Number(r.lat),Number(r.lon));
 const visibleMatches=filtered().filter(x=>acct(x.cuenta)===id);
 const a=analytics(filtered());
 const targetCell=a.ranked.find(c=>c.id===cell.id);
 const cellLayer=L.rectangle(cellBounds(cell),{color:'#7A4DA3',weight:4,fillColor:MALVA,fillOpacity:.20,interactive:false}).addTo(map);
 const foundMarker=L.marker([Number(r.lat),Number(r.lon)],{icon:repeatPin,zIndexOffset:1500}).addTo(map);
 const html=`<h3>Cuenta ${esc(id)} · ${esc(r.cluster)}</h3><p>${matches.length} OS Repeat · Cuadrante ${esc(cell.id)}</p>${eventTable(matches)}`;
 foundMarker.bindPopup(html,{maxWidth:510,maxHeight:380});
 map.flyToBounds(L.latLngBounds(cellBounds(cell)).pad(.55),{duration:.7,maxZoom:17});
 map.once('moveend',()=>foundMarker.openPopup());
 function cleanup(){map.off('popupclose',cleanup);if(map.hasLayer(foundMarker))map.removeLayer(foundMarker);if(map.hasLayer(cellLayer))map.removeLayer(cellLayer)}
 foundMarker.on('popupclose',cleanup);
 message(`Cuenta ${id}: ${matches.length} OS · Cuadrante ${cell.id}${visibleMatches.length?'':' · fuera de los filtros activos'}.`,'ok');
}
function focusQuadrant(c){
 // Hacer visible el cuadrante solicitado sin alterar filtros ni rankings.
 const state=visibility.cells;
 if(state.mode==='none'||(state.mode==='top'&&!analytics(filtered()).ranked.slice(0,10).some(x=>x.id===c.id)))state.mode='all';
 state.hidden.delete(c.id);
 const a=analytics(filtered());drawMap(a);$('quadMode').value=state.mode;renderRankings(a);
 const bounds=L.latLngBounds(cellBounds(c));
 map.flyToBounds(bounds.pad(1.8),{duration:.65,maxZoom:17});
 map.once('moveend',()=>{
  const highlight=L.rectangle(cellBounds(c),{color:'#8050AA',weight:5,fillColor:MALVA,fillOpacity:.28,interactive:false}).addTo(map);
  setTimeout(()=>map.removeLayer(highlight),2200);
  showCell(c);
 });
}

function showCell(c){const html=`<h3>${esc(c.id)} · ${esc(c.cluster)}</h3><p>${c.os} OS Repeat · ${c.accounts} cuentas únicas</p>${eventTable(c.events)}`;L.popup({maxWidth:510,maxHeight:380}).setLatLng(L.latLngBounds(cellBounds(c)).getCenter()).setContent(html).openOn(map)}
function exportXlsx(rows,name){if(typeof XLSX==='undefined')return alert('Biblioteca Excel no disponible');if(!rows.length)return alert('No hay registros para exportar');const wb=XLSX.utils.book_new(),data=rows.map(r=>({...r.raw,Cuenta:r.cuenta,Folio:r.os,'Fecha de análisis':r.date||'','Origen de fecha':r.dateSource||'',Cluster:r.cluster,Latitud:(r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)))?r.lat:'',Longitud:(r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)))?r.lon:''}));XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(data),'Repeat 60');XLSX.writeFile(wb,name)}
function exportMissing(){const a=analytics(filtered());exportXlsx(a.missing,'Repeat60_Cuentas_sin_coordenadas.xlsx')}
function tableRows(arr,type){const selectable=type==='cells'||type==='accounts',ids=selectable?new Set(arr.map(x=>x.id||x.name)):null;return `<table><thead><tr>${selectable?'<th>Ver</th>':''}<th>#</th><th>${type==='cells'?'Cuadrante':type==='accounts'?'Cuenta':type==='weeks'?'Semana':'Clúster'}</th>${type==='cells'?'<th>Clúster</th>':''}<th>OS Repeat</th><th>Cuentas únicas</th><th>Excel</th></tr></thead><tbody>${arr.map((c,i)=>{const id=c.id||c.name;return `<tr>${selectable?`<td><input type="checkbox" data-visibility-id="${esc(id)}" ${isVisible(type,id,ids)?'checked':''} aria-label="Mostrar ${esc(id)}"></td>`:''}<td><b>${i+1}</b></td><td>${type==='cells'?`<button type="button" class="quadrant-locate" data-locate-cell="${esc(id)}" title="Ubicar cuadrante en el mapa">${esc(id)} ⌖</button>`:esc(id)}</td>${type==='cells'?`<td>${esc(c.cluster)}</td>`:''}<td>${fmt(c.os)}</td><td>${fmt(c.accounts)}</td><td><button data-export-row="${i}">Exportar</button></td></tr>`}).join('')}</tbody></table>`}
function visibilityControls(type){if(type!=='cells'&&type!=='accounts')return '';return `<div class="visibility-controls"><button data-visibility-action="all">Prender todo</button><button data-visibility-action="top">Apagar fuera del Top 10</button><button data-visibility-action="none">Apagar todo</button><span>Control de visibilidad de ${type==='cells'?'cuadrantes':'cuentas'}</span></div>`}
// V-51: pestaña de consulta 2+R. No altera el cálculo original ni los filtros.
function renderRepeat2R(a){
 const holder=$('rankContent'),byAccount=new Map();
 for(const r of filtered()){if(!r.cuenta||!repeat2RAccounts.has(r.cuenta))continue;if(!byAccount.has(r.cuenta))byAccount.set(r.cuenta,[]);byAccount.get(r.cuenta).push(r)}
 const list=[...byAccount].map(([account,events])=>{
  const position=events.find(r=>r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon)));
  return {account,events,position,os:new Set(events.map(r=>r.os)).size};
 }).sort((a,b)=>b.os-a.os||a.account.localeCompare(b.account,'es'));
 holder.innerHTML=`<div class="repeat-2r-panel"><div class="rankhead"><h3>Cuentas reincidentes 2+R (${fmt(list.length)})</h3></div><button type="button" id="repeat2RFilter" class="repeat-2r-filter ${repeat2ROnly?'is-active':''}" aria-pressed="${repeat2ROnly}" title="Ocultar o mostrar los marcadores que no son 2+R">Filtrar 2+R</button><p class="repeat-2r-help">Selecciona una cuenta para centrar el mapa. Sus datos se abren únicamente al hacer clic en su marcador.</p><div class="repeat-2r-list" role="list" aria-label="Todas las cuentas 2+R">${list.length?list.map(x=>`<button type="button" role="listitem" class="repeat-2r-account" data-repeat-account="${esc(x.account)}" ${x.position?'':'disabled title="Sin coordenadas"'}><span class="repeat-2r-account-id">${esc(x.account)}</span><span class="repeat-2r-account-meta">${x.os} OS · ${x.position?'Ubicar en mapa':'Sin coordenadas'}</span></button>`).join(''):'<p class="repeat-2r-empty">No hay cuentas 2+R para los filtros seleccionados.</p>'}</div></div>`;
 $('repeat2RFilter').onclick=()=>{repeat2ROnly=!repeat2ROnly;drawMap(a);renderRepeat2R(a)};
 holder.querySelectorAll('[data-repeat-account]').forEach(button=>button.onclick=()=>{
  const item=list.find(x=>x.account===button.dataset.repeatAccount);
  if(!item||!item.position)return;
  // No modificar filtros, no abrir popup y no encender marcadores ocultos por otros controles.
  map.closePopup();
  map.flyTo([Number(item.position.lat),Number(item.position.lon)],Math.max(map.getZoom(),17),{duration:.65});
  holder.querySelectorAll('[data-repeat-account]').forEach(el=>el.classList.toggle('is-selected',el===button));
  const marker=repeat2RMapMarkers.get(item.account);
  if(marker&&markers.hasLayer(marker))marker.setZIndexOffset(1200);
 });
}
function renderRankings(a){if(activeTab==='repeat2r'&&repeat2RActive){renderRepeat2R(a);return}const rows=filtered();let list;switch(activeTab){case 'cells':list=a.ranked.slice(0,repeatTopLimit);break;case 'accounts':list=a.accounts.slice(0,10);break;case 'clusters':list=a.clusters;break;case 'weeks':list=a.weeks;break;default:activeTab='cells';list=a.ranked.slice(0,10)}const holder=$('rankContent');holder.innerHTML=`<div class="rankhead"><h3>${activeTab==='cells'?`Top ${repeatTopLimit} cuadrantes con más Repeat`:activeTab==='accounts'?'Top 10 cuentas con más OS':activeTab==='clusters'?'Clústeres':'Semanas'}</h3><button id="exportTop">Descargar Excel</button></div>${visibilityControls(activeTab)}${tableRows(list,activeTab)}`;holder.querySelectorAll('[data-locate-cell]').forEach(btn=>btn.onclick=()=>{const c=a.ranked.find(x=>x.id===btn.dataset.locateCell);if(c)focusQuadrant(c)});holder.querySelectorAll('[data-export-row]').forEach(btn=>btn.onclick=()=>exportXlsx(list[+btn.dataset.exportRow].events,'Repeat60_'+(list[+btn.dataset.exportRow].id||list[+btn.dataset.exportRow].name)+'.xlsx'));$('exportTop').onclick=()=>exportXlsx(list.flatMap(c=>c.events),'Repeat60_'+activeTab+'.xlsx');holder.querySelectorAll('[data-visibility-action]').forEach(b=>b.onclick=()=>{const state=visibility[activeTab];state.mode=b.dataset.visibilityAction;state.hidden.clear();drawMap(a);renderRankings(a)});holder.querySelectorAll('[data-visibility-id]').forEach(b=>b.onchange=()=>{const state=visibility[activeTab],id=b.dataset.visibilityId;if(b.checked){if(state.mode==='none')state.mode='top';state.hidden.delete(id)}else state.hidden.add(id);drawMap(a);renderRankings(a)});const max=a.clusters[0]?.os||1;$('clusterRanking').innerHTML=`<table><thead><tr><th>#</th><th>Clúster</th><th>OS Repeat</th><th>Cuentas únicas</th><th>% del total</th></tr></thead><tbody>${a.clusters.slice(0,10).map((c,i)=>`<tr><td>${i+1}</td><td>${esc(c.name)}</td><td>${fmt(c.os)}</td><td>${fmt(c.accounts)}</td><td><span class="bar" style="width:${Math.max(2,c.os/max*85)}px"></span> ${(c.os/Math.max(1,rows.length)*100).toFixed(1)}%</td></tr>`).join('')}</tbody></table>`}
function initMap(){canvas=L.canvas({padding:.35});map=L.map('repeatMap',{preferCanvas:true,zoomControl:false}).setView([20.67,-103.44],12);L.control.zoom({position:'topleft'}).addTo(map);street=L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'© OpenStreetMap',maxZoom:19});satellite=L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery © Esri',maxZoom:19}).addTo(map);quadrants=L.layerGroup().addTo(map);markers=L.layerGroup().addTo(map)}
async function init(){initMap();$('repeat2RToggle').onclick=()=>{repeat2RActive=!repeat2RActive;if(!repeat2RActive){repeat2ROnly=false;if(activeTab==='repeat2r'){activeTab='accounts';document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab==='accounts'))}}render()};repeatDb=await openDB(REPEAT_DB,1,d=>{if(!d.objectStoreNames.contains(RSTORE))d.createObjectStore(RSTORE,{keyPath:'os'})});await load();$('accountLookup').onsubmit=e=>{e.preventDefault();locateAccount($('accountQuery').value)};$('repeatFile').onchange=async e=>{const f=e.target.files[0];if(!f)return;repeatUpload.onProgress=repeatUploadProgress;repeatUploadShow(f);message('Procesando archivo '+f.name+'...');try{await ingest(f);repeatUploadFinish(null)}catch(err){message(err.message||String(err),'error');repeatUploadFinish(err)}finally{repeatUpload.onProgress=null;e.target.value=''}};$('repeatUploadAccept').onclick=()=>{if($('repeatUploadAccept').disabled)return;$('repeatUploadOverlay').hidden=true};$('exportAll').onclick=()=>exportXlsx(filtered(),'Repeat60_Registros.xlsx');$('downloadMissing').onclick=exportMissing;$('deleteRepeat').onclick=eraseRepeatHistory;$('allWeeks').onclick=()=>{document.querySelectorAll('[data-week]').forEach(e=>{e.checked=true;chosenWeeks.add(e.dataset.week)});render()};$('noWeeks').onclick=()=>{chosenWeeks.clear();document.querySelectorAll('[data-week]').forEach(e=>e.checked=false);render()};$('allClusters').onclick=()=>{document.querySelectorAll('[data-cluster]').forEach(e=>{e.checked=true;chosenClusters.add(e.dataset.cluster)});render()};$('noClusters').onclick=()=>{chosenClusters.clear();document.querySelectorAll('[data-cluster]').forEach(e=>e.checked=false);render()};$('clusterSearch').oninput=e=>{const q=e.target.value.toLowerCase();document.querySelectorAll('#clusters label').forEach(l=>l.style.display=l.textContent.toLowerCase().includes(q)?'':'none')};$('quadMode').onchange=e=>{visibility.cells.mode=e.target.value;visibility.cells.hidden.clear();render()};$('street').onclick=()=>{map.removeLayer(satellite);street.addTo(map);$('street').classList.add('selected');$('satellite').classList.remove('selected')};$('satellite').onclick=()=>{map.removeLayer(street);satellite.addTo(map);$('satellite').classList.add('selected');$('street').classList.remove('selected')};$('fullMap').onclick=()=>{const el=document.querySelector('.mapcard');if(document.fullscreenElement)document.exitFullscreen();else el.requestFullscreen()};document.addEventListener('fullscreenchange',()=>setTimeout(()=>map.invalidateSize(),180));document.querySelectorAll('[data-top-cells]').forEach(b=>b.onclick=e=>{e.stopPropagation();repeatTopLimit=Number(b.dataset.topCells);$('repeatTopMenu').hidden=true;document.querySelector('[data-tab="cells"]').textContent=`Top ${repeatTopLimit} Cuadrantes`;activeTab='cells';document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab==='cells'));renderRankings(analytics(filtered()))});document.addEventListener('click',e=>{if(!e.target.closest('.repeat-top-selector'))$('repeatTopMenu').hidden=true});document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{if(b.dataset.tab==='cells'){const menu=$('repeatTopMenu');menu.hidden=!menu.hidden;b.setAttribute('aria-expanded',String(!menu.hidden))}else $('repeatTopMenu').hidden=true;activeTab=b.dataset.tab;document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));renderRankings(analytics(filtered()))});// Sin sincronización ni consulta a Soportes.
}
init().catch(err=>message('No se pudo iniciar Repeat 60: '+err.message,'error'));
