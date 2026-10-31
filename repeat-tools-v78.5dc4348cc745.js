/* V-82: Calendario interactivo propio de Repeat 60. Sin dependencias de otros módulos. */
(()=>{'use strict';
const $=id=>document.getElementById('rp78-'+id);
const isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function dayFor(r){if(!r.date)return '';const d=new Date(r.date);return Number.isNaN(d.getTime())?'':isoLocal(d)}
function weekParts(date){if(!date)return null;const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.getTime()))return null;const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear(),jan1=new Date(Date.UTC(year,0,1)),week=Math.ceil((((d-jan1)/86400000)+1)/7);const monday=new Date(date+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(day-1));const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);return {year,week,key:`${year}-S${String(week).padStart(2,'0')}`,monday:monday.toISOString().slice(0,10),sunday:sunday.toISOString().slice(0,10)}}
const isoDay=(y,m,d)=>new Date(Date.UTC(y,m,d,12)).toISOString().slice(0,10);
const MONTH_NAMES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const COLORS=['#F12B38','#087FE8','#F4C300','#00A84F','#A64DFF','#FF7A00','#00C7D4','#F02FA6','#6848DF','#8BB800'];
let activeDates=null,draftDates=null,activeWeeks=new Set(),draftWeeks=new Set(),activeMonths=new Set(),draftMonths=new Set();
let availableDates=new Set(),availableWeeks=new Map(),availableMonths=new Map(),periodColors=new Map();
let calendarYear=new Date().getFullYear(),calendarMonth=new Date().getMonth(),calendarLevel='days',monthClickTimer=null;
function allRecordDates(){return new Set(records.map(dayFor).filter(Boolean))}
function datesBetween(start,end){const out=new Set();let a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');if(!Number.isFinite(a)||!Number.isFinite(b))return out;if(a>b)[a,b]=[b,a];for(let t=a;t<=b;t+=86400000)out.add(new Date(t).toISOString().slice(0,10));return out}
function validGroups(groups,dates,available){for(const key of groups){const days=available.get(key)||[];if(!dates||!days.length||!days.every(d=>dates.has(d)))groups.delete(key)}}
function refreshData(){
 availableDates=allRecordDates();availableWeeks=new Map();availableMonths=new Map();
 for(const d of [...availableDates].sort()){const key=weekParts(d).key,month=d.slice(0,7);if(!availableWeeks.has(key))availableWeeks.set(key,[]);availableWeeks.get(key).push(d);if(!availableMonths.has(month))availableMonths.set(month,[]);availableMonths.get(month).push(d)}
 if(activeDates!==null){activeDates=new Set([...activeDates].filter(d=>availableDates.has(d)));if(!activeDates.size){activeDates=null;repeatMapEnabledV79=false}}
 if(draftDates!==null)draftDates=new Set([...draftDates].filter(d=>availableDates.has(d)));
 validGroups(activeWeeks,activeDates,availableWeeks);validGroups(activeMonths,activeDates,availableMonths);validGroups(draftWeeks,draftDates,availableWeeks);validGroups(draftMonths,draftDates,availableMonths);
 updateDateCaption();if(!$('dateDropdown').classList.contains('hidden'))drawCalendar();
}
function updateDateCaption(){$('dateToggle').textContent='Calendario'+(activeDates===null?'':` · ${activeDates.size} días`)}
function monthAvailable(y,m){return availableMonths.has(isoDay(y,m,1).slice(0,7))}
function availableYears(){return [...new Set([...availableDates].map(d=>+d.slice(0,4)))].sort((a,b)=>a-b)}
function toggleDay(date){
 if(!availableDates.has(date))return;if(draftDates===null)draftDates=new Set();
 if(draftDates.has(date)){draftDates.delete(date);draftWeeks.delete(weekParts(date).key);draftMonths.delete(date.slice(0,7))}else draftDates.add(date);
 drawCalendar();
}
function selectWeek(key,on){
 const days=availableWeeks.get(key)||[];if(!days.length)return;if(draftDates===null)draftDates=new Set();
 if(on===undefined)on=!draftWeeks.has(key);
 if(on){for(const d of days){draftDates.add(d);draftMonths.delete(d.slice(0,7))}draftWeeks.add(key)}
 else{for(const d of days){draftDates.delete(d);draftMonths.delete(d.slice(0,7))}draftWeeks.delete(key)}
 drawCalendar();
}
function toggleCalendarMonth(y,m,on){
 const key=isoDay(y,m,1).slice(0,7),days=availableMonths.get(key)||[];if(!days.length)return;if(draftDates===null)draftDates=new Set();
 if(on===undefined)on=!draftMonths.has(key);
 for(const d of days){on?draftDates.add(d):draftDates.delete(d);draftWeeks.delete(weekParts(d).key)}
 on?draftMonths.add(key):draftMonths.delete(key);drawCalendar();
}
function drawCalendar(){
 $('calendarTitle').textContent=calendarLevel==='days'?`${MONTH_NAMES[calendarMonth]} ${calendarYear} ⌃`:calendarLevel==='months'?`${calendarYear} ⌃`:'Año ⌃';
 $('calendarWeekdays').classList.toggle('hidden',calendarLevel!=='days');$('calendarDays').classList.toggle('calendar-tiles',calendarLevel!=='days');
 $('fullMonth').disabled=calendarLevel!=='days'||!monthAvailable(calendarYear,calendarMonth);
 $('fullWeek').disabled=calendarLevel!=='days'||!availableWeeks.has(weekParts(isoDay(calendarYear,calendarMonth,1)).key);
 let html='';
 if(calendarLevel==='years'){const years=availableYears();html=years.length?years.map(y=>`<button type="button" data-year="${y}" class="${[...(draftDates||[])].some(d=>d.startsWith(y+'-'))?'chosen':''}">${y}</button>`).join(''):'<span class="calendar-empty">Sin años en el histórico</span>'}
 else if(calendarLevel==='months'){html=MONTH_NAMES.map((name,m)=>{const key=isoDay(calendarYear,m,1).slice(0,7);return `<button type="button" data-month="${m}" ${availableMonths.has(key)?'':'disabled'} class="${[...(draftDates||[])].some(d=>d.startsWith(key))?'chosen':''}">${name.slice(0,3)}</button>`}).join('')}
 else{
  const first=weekParts(isoDay(calendarYear,calendarMonth,1)).monday,last=new Date(Date.UTC(calendarYear,calendarMonth+1,0)).getUTCDate(),start=Date.parse(first+'T12:00:00Z'),end=Date.parse(isoDay(calendarYear,calendarMonth,last)+'T12:00:00Z');
  for(let t=start;t<=end;t+=7*86400000){
   const monday=new Date(t).toISOString().slice(0,10),w=weekParts(monday),days=availableWeeks.get(w.key)||[],checked=draftWeeks.has(w.key)&&days.length&&days.every(d=>draftDates?.has(d)),partial=!checked&&days.some(d=>draftDates?.has(d));
   html+=`<label class="rp82-week-check" title="Semana ${w.week}: ${w.monday} a ${w.sunday}"><input type="checkbox" data-week-key="${w.key}" data-partial="${partial?'true':'false'}" aria-label="Seleccionar semana ${w.week} de ${w.year}" ${checked?'checked':''} ${days.length?'':'disabled'}></label>`;
   for(let i=0;i<7;i++){const date=new Date(t+i*86400000).toISOString().slice(0,10),within=date.slice(0,7)===isoDay(calendarYear,calendarMonth,1).slice(0,7);html+=within?`<button type="button" data-date="${date}" class="${draftDates?.has(date)?'chosen':''}" ${availableDates.has(date)?'':'disabled'}>${+date.slice(8)}</button>`:'<span class="rp82-outside" aria-hidden="true"></span>'}
  }
 }
 $('calendarDays').innerHTML=html;
 $('calendarDays').querySelectorAll('input[data-week-key]').forEach(input=>{input.indeterminate=input.dataset.partial==='true';input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked))});
 $('draftDatesLabel').textContent=draftDates?.size?`${draftDates.size} días seleccionados. Días y semanas se acumulan; pulsa OK para aplicar.`:'Selecciona días o casillas de semana. Clear + OK apaga el mapa.';
}
function monthShift(n){if(calendarLevel==='years')return;const d=new Date(Date.UTC(calendarYear,calendarMonth+(calendarLevel==='days'?n:n*12),1));calendarYear=d.getUTCFullYear();calendarMonth=d.getUTCMonth();drawCalendar()}
function periodKey(date){const w=weekParts(date);if(w&&activeWeeks.has(w.key))return 'W|'+w.key;const month=date.slice(0,7);if(activeMonths.has(month))return 'M|'+month;return 'D|'+date}
function periodLabel(key){const [kind,value]=key.split('|');if(kind==='W'){const m=value.match(/^(\d{4})-S(\d{2})$/);return `Semana ${+m[2]}/${m[1]}`}if(kind==='M'){const [y,m]=value.split('-');return `${MONTH_NAMES[+m-1]}/${y}`}const [y,m,d]=value.split('-');return `${d}/${m}/${y}`}
function prepare(events){
 const keys=[...new Set(events.map(e=>periodKey(dayFor(e))))].sort();periodColors=new Map(keys.map((key,i)=>[key,COLORS[i]||`hsl(${i*137.508%360} 70% 43%)`]));
 const legend=document.getElementById('rp78-periodLegend');legend.hidden=!repeatMapEnabledV79||activeDates===null||!events.length;legend.innerHTML=keys.map(key=>`<span><i style="background:${periodColors.get(key)}"></i>${esc(periodLabel(key))}</span>`).join('');
}
function icon(events,is2R){
 if(activeDates===null)return null;const colors=[...new Set(events.map(e=>periodKey(dayFor(e))))].sort().map(k=>periodColors.get(k)||'#FF8500');const background=colors.length===1?colors[0]:'conic-gradient('+colors.map((c,i)=>`${c} ${100*i/colors.length}% ${100*(i+1)/colors.length}%`).join(',')+')';
 return L.divIcon({className:'repeat-pin-wrapper rp78-period-pin'+(is2R?' repeat-pin-2r':''),html:`<span class="repeat-pin" style="background:${background}!important"><span class="repeat-pin-center"></span></span>`,iconSize:[19,27],iconAnchor:[9,26],popupAnchor:[0,-23]});
}
function eventBadge(r){if(activeDates===null)return '';return `<span class="rp78-event-dot" style="background:${periodColors.get(periodKey(dayFor(r)))||'#FF8500'}" aria-hidden="true"></span>`}
function clearApplied(){repeatMapEnabledV79=false;activeDates=null;draftDates=null;activeWeeks.clear();draftWeeks.clear();activeMonths.clear();draftMonths.clear();updateDateCaption();$('dateDropdown').classList.add('hidden');$('dateToggle').setAttribute('aria-expanded','false');$('dateToggle').setAttribute('aria-pressed','false')}
function applyCalendar(){
 activeDates=draftDates?.size?new Set(draftDates):null;activeWeeks=new Set(draftWeeks);activeMonths=new Set(draftMonths);validGroups(activeWeeks,activeDates,availableWeeks);validGroups(activeMonths,activeDates,availableMonths);
 repeatMapEnabledV79=activeDates!==null;$('dateDropdown').classList.add('hidden');$('dateToggle').setAttribute('aria-expanded','false');$('dateToggle').setAttribute('aria-pressed','false');updateDateCaption();window.repeatToolsV78?.clearSearch();render();message(repeatMapEnabledV79?'Selección del Calendario interactivo aplicada a Repeat 60.':'Selecciona fechas en Calendario y pulsa OK para visualizar la información.','');
}
window.repeatCalendarV78={refreshData,includes:r=>activeDates===null||activeDates.has(dayFor(r)),clearApplied,prepare,icon,eventBadge};
$('dateToggle').addEventListener('click',()=>{const opening=$('dateDropdown').classList.contains('hidden');$('dateDropdown').classList.toggle('hidden',!opening);$('dateToggle').setAttribute('aria-expanded',String(opening));$('dateToggle').setAttribute('aria-pressed',String(opening));if(opening){refreshData();draftDates=activeDates===null?new Set():new Set(activeDates);draftWeeks=new Set(activeWeeks);draftMonths=new Set(activeMonths);calendarLevel='days';calendarYear=new Date().getFullYear();calendarMonth=new Date().getMonth();if(!monthAvailable(calendarYear,calendarMonth)&&availableDates.size){const latest=[...availableDates].sort().at(-1);calendarYear=+latest.slice(0,4);calendarMonth=+latest.slice(5,7)-1}drawCalendar()}});
$('prevMonth').addEventListener('click',()=>monthShift(-1));$('nextMonth').addEventListener('click',()=>monthShift(1));$('calendarTitle').addEventListener('click',()=>{calendarLevel=calendarLevel==='days'?'months':'years';drawCalendar()});
$('calendarDays').addEventListener('click',e=>{const year=e.target.closest('[data-year]'),month=e.target.closest('[data-month]'),day=e.target.closest('[data-date]');if(e.target.closest('button')?.disabled)return;if(year){calendarYear=+year.dataset.year;calendarLevel='months';drawCalendar()}else if(month){if(monthClickTimer)clearTimeout(monthClickTimer);const y=calendarYear,m=+month.dataset.month;monthClickTimer=setTimeout(()=>{monthClickTimer=null;toggleCalendarMonth(y,m)},260)}else if(day)toggleDay(day.dataset.date)});
$('calendarDays').addEventListener('change',e=>{if(e.target.matches('input[data-week-key]'))selectWeek(e.target.dataset.weekKey,e.target.checked)});
$('calendarDays').addEventListener('dblclick',e=>{const month=e.target.closest('[data-month]');if(!month||month.disabled)return;if(monthClickTimer){clearTimeout(monthClickTimer);monthClickTimer=null}calendarMonth=+month.dataset.month;calendarLevel='days';drawCalendar()});
$('fullWeek').addEventListener('click',()=>selectWeek(weekParts(isoDay(calendarYear,calendarMonth,1)).key,true));
$('fullMonth').addEventListener('click',()=>toggleCalendarMonth(calendarYear,calendarMonth,true));
$('clearDates').addEventListener('click',()=>{draftDates=new Set();draftWeeks.clear();draftMonths.clear();drawCalendar()});$('applyDates').addEventListener('click',applyCalendar);
refreshData();
})();
/* Controles y búsqueda exclusivos de Repeat 60. */
(()=>{'use strict';
 const get=id=>document.getElementById(id),clusterButton=get('rp78-clusterToggle'),clusterPanel=get('rp78-clusterPanel'),missingButton=get('rp78-missingToggle'),missingPanel=get('rp78-missingPanel');
 function setOpen(button,panel,open){panel.hidden=!open;button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-pressed',String(open))}
 clusterButton.onclick=()=>setOpen(clusterButton,clusterPanel,clusterPanel.hidden);
 missingButton.onclick=()=>setOpen(missingButton,missingPanel,missingPanel.hidden);
 function closeMissing(){setOpen(missingButton,missingPanel,false)}
 let searchLayer=null;
 function clearSearch(){if(searchLayer)searchLayer.clearLayers();get('rp78-searchResults').replaceChildren();get('rp78-searchResults').hidden=true}
 get('rp78-searchClear').onclick=()=>{get('accountQuery').value='';clearSearch()};
 function coordinates(text){const m=String(text).trim().match(/^\(?\s*([+-]?\d+(?:\.\d+)?)\s*(?:[,;|]|\s)\s*([+-]?\d+(?:\.\d+)?)\s*\)?$/);if(!m)return null;const lat=+m[1],lon=+m[2];return validCoords(lat,lon)?{lat,lon}:null}
 function matches(text,type){const q=clean(text);if(!q)return [];let found=[];if(type==='account'||type==='auto')found=records.filter(r=>acct(r.cuenta)===acct(q));if(type==='os'||(type==='auto'&&!found.length))found=records.filter(r=>clean(r.os)===q);return found}
 function located(r){return r.lat!==null&&r.lon!==null&&validCoords(Number(r.lat),Number(r.lon))}
 function results(rows){const out=new Map();for(const r of rows){const key=r.cuenta+'|'+(located(r)?Number(r.lat)+','+Number(r.lon):'sin');if(!out.has(key))out.set(key,{record:r,events:[]});out.get(key).events.push(r)}return [...out.values()]}
 function focus(record,events){
  if(!searchLayer)searchLayer=L.layerGroup().addTo(map);searchLayer.clearLayers();
  const lat=+record.lat,lon=+record.lon,cell=cellFor(lat,lon);const pin=L.marker([lat,lon],{icon:repeatPin,zIndexOffset:1500}).addTo(searchLayer);
  if(events.length)L.rectangle(cellBounds(cell),{color:'#7A4DA3',weight:4,fillColor:MALVA,fillOpacity:.20,interactive:false}).addTo(searchLayer);
  const title=events.length?'Cuenta '+record.cuenta:'Coordenadas';pin.bindPopup(`<h3>${esc(title)}</h3><p class="rp82-marker-coordinates"><b>Coordenadas del marcador:</b> Latitud: ${lat} · Longitud: ${lon}</p>${events.length?eventTable(events):'<p>Punto de consulta; no se añadió a la base.</p>'}`,{maxWidth:510,maxHeight:380});map.setView([lat,lon],17);pin.openPopup();
  message(events.length?`Resultado: cuenta ${record.cuenta} · ${events.length} OS · ${lat}, ${lon}. La búsqueda no modifica los filtros.`:`Coordenadas: ${lat}, ${lon}. Punto de consulta, sin cambios en la base.`,'ok');
 }
 function search(text){
  clearSearch();const q=clean(text),type=get('rp78-searchType').value;if(!q){message('Escribe una cuenta, OS o coordenadas.','error');return}
  const point=coordinates(q);if(type==='coords'||(type==='auto'&&(point||/[,;|]/.test(q)))){if(!point){message('Coordenadas inválidas. Usa latitud, longitud; ejemplo: 20.6736, -103.3440.','error');return}focus(point,[]);return}
  const found=matches(q,type),list=results(found);if(!list.length){message('No se encontró la cuenta u OS en la base Repeat 60. No se buscan direcciones.','error');return}
  const box=get('rp78-searchResults');box.hidden=false;const caption=document.createElement('p');caption.textContent=`${list.length} coincidencia(s). Selecciona la ubicación:`;box.appendChild(caption);
  for(const item of list){const r=item.record,b=document.createElement('button');b.type='button';b.disabled=!located(r);b.textContent=`Cuenta ${r.cuenta} · OS ${item.events.map(e=>e.os).join(', ')} · ${located(r)?r.lat+', '+r.lon:'Sin coordenadas'}`;b.onclick=()=>{focus(r,item.events);box.hidden=true};box.appendChild(b)}
  if(list.length===1&&located(list[0].record)){focus(list[0].record,list[0].events);box.hidden=true}else message(found.every(r=>!located(r))?'Hay coincidencias, pero no tienen coordenadas.':'Selecciona una coincidencia para ubicarla en el mapa.',found.every(r=>!located(r))?'error':'ok');
 }
 document.addEventListener('keydown',e=>{if(e.key==='Escape'){setOpen(clusterButton,clusterPanel,false);closeMissing();const cal=get('rp78-dateDropdown');cal.classList.add('hidden');get('rp78-dateToggle').setAttribute('aria-expanded','false');get('rp78-dateToggle').setAttribute('aria-pressed','false');get('rp78-searchResults').hidden=true}});
 document.addEventListener('click',e=>{if(!clusterPanel.contains(e.target)&&!clusterButton.contains(e.target))setOpen(clusterButton,clusterPanel,false)});
 get('rp79-hideMap').onclick=()=>{repeatMapEnabledV79=false;clearSearch();render();message('Mapa apagado. Se conservan las fechas y los datos; abre Calendario y pulsa OK para volver a mostrarlos.','')};
 window.repeatToolsV78={search,clearSearch,closeMissing,coordinates,matches,results};
 // El cambio de tamaño sólo reajusta el lienzo; no cambia los 300 m de los cuadrantes.
 if(typeof ResizeObserver!=='undefined'){const observer=new ResizeObserver(()=>map?.invalidateSize({pan:false}));observer.observe(get('repeatMap'))}
})();
