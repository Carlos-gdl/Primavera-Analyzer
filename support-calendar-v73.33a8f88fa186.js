/* V-72: calendario exclusivo de Soportes; mecánica de Planta Externa sin modificar su fuente. */
(()=>{'use strict';
const $=id=>document.getElementById('sc71-'+id);
const isoLocal=d=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
function dayFor(event){const d=new Date(event.date);return Number.isNaN(d.getTime())?'':isoLocal(d)}
function weekParts(date){if(!date)return null;const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.getTime()))return null;const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear();const jan1=new Date(Date.UTC(year,0,1));const week=Math.ceil((((d-jan1)/86400000)+1)/7);const monday=new Date(date+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(day-1));const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);return {year,week,key:`${year}-S${String(week).padStart(2,'0')}`,monday:monday.toISOString().slice(0,10),sunday:sunday.toISOString().slice(0,10)}}
let activeDates=null,draftDates=null,calendarYear=new Date().getFullYear(),calendarMonth=new Date().getMonth(),calendarLevel='days',rangeStart=null,rangeEnd=null,monthClickTimer=null,preservedMonthDates=new Set();
let availableDates=new Set(),activeIntent='auto',draftIntent='auto';
function refreshData(){availableDates=allRecordDates();if(activeDates!==null){activeDates=new Set([...activeDates].filter(d=>availableDates.has(d)));if(!activeDates.size)activeDates=null}if(draftDates!==null)draftDates=new Set([...draftDates].filter(d=>availableDates.has(d)));updateDateCaption();if(!$('dateDropdown').classList.contains('hidden'))drawCalendar()}
function monthAvailable(y,m){const prefix=isoDay(y,m,1).slice(0,7);return [...availableDates].some(d=>d.startsWith(prefix))}
const isoDay=(y,m,d)=>new Date(Date.UTC(y,m,d,12)).toISOString().slice(0,10);
const isoFromTime=t=>new Date(t).toISOString().slice(0,10);
function allRecordDates(){return new Set(allEvents.map(dayFor).filter(Boolean))}
function availableYears(){return [...new Set([...allRecordDates()].map(d=>Number(d.slice(0,4))))].filter(Number.isFinite).sort((a,b)=>a-b)}
function datesBetween(start,end){const out=new Set();if(!start||!end)return out;let a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');if(a>b)[a,b]=[b,a];for(let t=a;t<=b;t+=86400000)out.add(isoFromTime(t));return out}
function refreshWeeks(){if(activeDates===null){const dates=[...allRecordDates()].sort();if(dates.length){const [y,m]=dates[dates.length-1].split('-').map(Number);calendarYear=y;calendarMonth=m-1}}updateDateCaption();if(!$('dateDropdown').classList.contains('hidden'))drawCalendar()}
function updateDateCaption(){$('dateToggle').textContent='Calendario'+(activeDates===null?'':` · ${activeDates.size} días`)}
function dateInMonth(y,m){const a=isoDay(y,m,1),b=isoDay(y,m+1,0);return draftDates!==null&&[...draftDates].some(d=>d>=a&&d<=b)}
function drawCalendar(){const names=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];$('calendarTitle').textContent=calendarLevel==='days'?`${names[calendarMonth]} ${calendarYear} ⌃`:calendarLevel==='months'?`${calendarYear} ⌃`:'Año ⌃';$('calendarWeekdays').classList.toggle('hidden',calendarLevel!=='days');$('fullWeek').disabled=calendarLevel!=='days';$('fullMonth').disabled=calendarLevel!=='days'||!monthAvailable(calendarYear,calendarMonth);$('fullWeek').disabled=calendarLevel!=='days'||![...datesBetween(weekParts(isoDay(calendarYear,calendarMonth,1)).monday,weekParts(isoDay(calendarYear,calendarMonth,1)).sunday)].some(d=>availableDates.has(d));$('calendarDays').classList.toggle('calendar-tiles',calendarLevel!=='days');let out='';if(calendarLevel==='years'){const years=availableYears();out=years.length?years.map(y=>`<button type="button" data-year="${y}" class="${draftDates!==null&&[...draftDates].some(d=>d.startsWith(y+'-'))?'chosen':''}">${y}</button>`).join(''):'<span class="calendar-empty">Sin años en el histórico</span>'}else if(calendarLevel==='months'){out=names.map((name,m)=>`<button type="button" data-month="${m}" ${monthAvailable(calendarYear,m)?'':'disabled'} class="${dateInMonth(calendarYear,m)?'chosen':''}">${name.slice(0,3)}</button>`).join('')}else{const first=weekParts(isoDay(calendarYear,calendarMonth,1)).monday,last=isoDay(calendarYear,calendarMonth+1,0);for(let t=Date.parse(first+'T12:00:00Z');t<=Date.parse(last+'T12:00:00Z');t+=7*86400000){const monday=isoFromTime(t),w=weekParts(monday),days=calendarWeekDays(w.key),checked=days.length>0&&days.every(d=>draftDates?.has(d)),partial=!checked&&days.some(d=>draftDates?.has(d));out+=`<label class="sc88-week-check" title="Semana ${w.week}: ${w.monday} a ${w.sunday}"><input type="checkbox" data-sc88-week="${w.key}" data-partial="${partial}" aria-label="Seleccionar semana ${w.week} de ${w.year}" ${checked?'checked':''} ${days.length?'':'disabled'}></label>`;for(let i=0;i<7;i++){const iso=isoFromTime(t+i*86400000);out+=iso.slice(0,7)===isoDay(calendarYear,calendarMonth,1).slice(0,7)?`<button type="button" data-date="${iso}" ${availableDates.has(iso)?'':'disabled'} class="${draftDates?.has(iso)?'chosen':''}">${+iso.slice(8)}</button>`:'<span aria-hidden="true"></span>'}}}$('calendarDays').innerHTML=out;$('calendarDays').querySelectorAll('input[data-sc88-week]').forEach(input=>{input.indeterminate=input.dataset.partial==='true';input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked))});$('draftDatesLabel').textContent=draftDates===null?'Todas las fechas (sin filtro)':draftDates.size?`${draftDates.size} días seleccionados. Pulsa OK para aplicar.`:'Sin fechas seleccionadas. Pulsa OK para mostrar todo.'}
function toggleCalendarMonth(y,m){
 draftIntent='month';
 if(!monthAvailable(y,m))return;
 const first=Date.UTC(y,m,1),last=Date.UTC(y,m+1,0);
 if(draftDates===null)draftDates=new Set();
 const days=[];for(let t=first;t<=last;t+=86400000)availableDates.has(isoFromTime(t))&&days.push(isoFromTime(t));
 const allSelected=days.every(d=>draftDates.has(d));
 for(const d of days){if(allSelected){draftDates.delete(d);preservedMonthDates.delete(d)}else{draftDates.add(d);preservedMonthDates.add(d)}}
 rangeStart=null;rangeEnd=null;drawCalendar();
}
function calendarWeekDays(key){return [...availableDates].filter(d=>weekParts(d)?.key===key)}
function toggleCalendarWeek(key,on){const days=calendarWeekDays(key);if(!days.length)return;if(draftDates===null)draftDates=new Set();if(on===undefined)on=!days.every(d=>draftDates.has(d));for(const day of days){if(on)draftDates.add(day);else{draftDates.delete(day);preservedMonthDates.delete(day)}}draftIntent='week';rangeStart=null;rangeEnd=null;drawCalendar()}
$('calendarDays').addEventListener('change',e=>{if(e.target.matches('input[data-sc88-week]')&&!e.target.disabled)toggleCalendarWeek(e.target.dataset.sc88Week,e.target.checked)});
function toggleDay(iso){if(!availableDates.has(iso))return;if(draftDates===null)draftDates=new Set();draftDates.has(iso)?draftDates.delete(iso):draftDates.add(iso);draftIntent='days';drawCalendar()}
function chooseSpan(start,end){if(draftDates===null)draftDates=new Set();for(let t=start;t<=end;t+=86400000)availableDates.has(isoFromTime(t))&&draftDates.add(isoFromTime(t));rangeStart=null;rangeEnd=null;drawCalendar()}
function monthShift(offset){if(calendarLevel==='years')return;const d=new Date(Date.UTC(calendarYear,calendarMonth+(calendarLevel==='days'?offset:offset*12),1));calendarYear=d.getUTCFullYear();calendarMonth=d.getUTCMonth();drawCalendar()}
const V57_COLORS=['#F12B38','#087FE8','#F4C300','#00A84F','#A64DFF','#FF7A00','#00C7D4','#F02FA6','#6848DF','#8BB800'];
let periodColors=new Map(),periodMode='week';
const MONTH_NAMES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
// V-73: una selección de hasta cuatro semanas se colorea por semana,
// aunque cruce el fin de mes. Las selecciones más largas en varios meses van por mes.
function periodModeFor(dates){
 if(!dates?.size)return 'week';
 const ordered=[...dates].sort(),first=ordered[0],last=ordered.at(-1);
 const spanDays=Math.round((Date.parse(last+'T12:00:00Z')-Date.parse(first+'T12:00:00Z'))/86400000)+1;
 if(activeIntent==='days'&&spanDays<=7)return 'day';
 return spanDays>28&&first.slice(0,7)!==last.slice(0,7)?'month':'week';
}
function periodKey(date){if(periodMode==='day')return date;if(periodMode==='month')return date.slice(0,7);const w=weekParts(date);return w?w.key:date.slice(0,7)}
function periodLabel(key){if(periodMode==='day'){const [y,m,d]=key.split('-');return `${d}/${m}/${y}`}if(periodMode==='month'){const [y,m]=key.split('-');return `${MONTH_NAMES[Number(m)-1]}/${y}`}const m=key.match(/^(\d{4})-S(\d{2})$/);return m?`${Number(m[2])}/${m[1]}`:key}

function applyCalendar(){
 // El calendario es el selector de fechas; sincroniza los controles semanales sin cambiar clúster/estatus.
 selectedYears.clear();selectedWeekNums.clear();
 const relevant=allEvents.filter(e=>activeDates===null||activeDates.has(dayFor(e)));
 for(const e of relevant){const p=String(e.week).match(/^(\d{4})-S(\d{2})$/);if(p){selectedYears.add(p[1]);selectedWeekNums.add(p[2])}}
 renderYears([...new Set(allEvents.map(e=>e.week.slice(0,4)))].sort().reverse());renderWeeks();render();
}
function clearApplied(){activeIntent='auto';draftIntent='auto';activeDates=null;draftDates=null;updateDateCaption();$('dateDropdown').classList.add('hidden');$('dateToggle').setAttribute('aria-expanded','false')}
function prepare(events){
 periodMode=periodModeFor(activeDates);
 const keys=[...new Set(events.map(e=>periodKey(dayFor(e))))].sort();
 periodColors=new Map(keys.map((key,i)=>[key,V57_COLORS[i%V57_COLORS.length]]));
 const legend=document.getElementById('sc71-periodLegend');legend.hidden=activeDates===null||!pointsEnabled||!events.length;
 legend.innerHTML=keys.map(key=>`<span><i style="background:${periodColors.get(key)}"></i>${periodMode==='week'?'Semana ':''}${esc(periodLabel(key))}</span>`).join('');
}
function iconHtml(events,label,hue){
 if(activeDates===null)return null;
 const keys=[...new Set(events.map(e=>periodKey(dayFor(e))))].sort(),colors=keys.map(k=>periodColors.get(k)||'#e02020');
 const background=colors.length===1?colors[0]:'conic-gradient('+colors.map((c,i)=>`${c} ${100*i/colors.length}% ${100*(i+1)/colors.length}%`).join(',')+')';
 return `<span class="account-pin ${hue}" style="background:${background}" aria-hidden="true"><span class="pin-center"></span></span><span class="account-count">${label}</span>`;
}
function eventBadge(e){if(activeDates===null)return '';const key=periodKey(dayFor(e));return `<span class="sc71-event-dot" style="background:${periodColors.get(key)||'#e02020'}" aria-hidden="true"></span>`}
window.supportCalendarV71={refreshData,includes:e=>activeDates===null||activeDates.has(dayFor(e)),clearApplied,prepare,iconHtml,eventBadge};
$('dateToggle').addEventListener('click',()=>{const opening=$('dateDropdown').classList.contains('hidden');$('dateDropdown').classList.toggle('hidden',!opening);$('dateToggle').setAttribute('aria-expanded',String(opening));if(opening){refreshData();draftDates=activeDates===null?null:new Set(activeDates);draftIntent=activeIntent;rangeStart=null;rangeEnd=null;preservedMonthDates=new Set();calendarLevel='days';calendarYear=new Date().getFullYear();calendarMonth=new Date().getMonth();if(!monthAvailable(calendarYear,calendarMonth)&&availableDates.size){const latest=[...availableDates].sort().at(-1);calendarYear=+latest.slice(0,4);calendarMonth=+latest.slice(5,7)-1}drawCalendar()}});
$('prevMonth').addEventListener('click',()=>monthShift(-1));$('nextMonth').addEventListener('click',()=>monthShift(1));
$('calendarTitle').addEventListener('click',()=>{calendarLevel=calendarLevel==='days'?'months':'years';drawCalendar()});$('calendarDays').addEventListener('click',e=>{const year=e.target.closest('[data-year]'),month=e.target.closest('[data-month]'),day=e.target.closest('[data-date]');if(e.target.closest('button')?.disabled)return;if(year){calendarYear=Number(year.dataset.year);calendarLevel='months';drawCalendar()}else if(month){const y=calendarYear,m=Number(month.dataset.month);if(monthClickTimer)clearTimeout(monthClickTimer);monthClickTimer=setTimeout(()=>{monthClickTimer=null;toggleCalendarMonth(y,m)},260)}else if(day)toggleDay(day.dataset.date)});
$('calendarDays').addEventListener('dblclick',e=>{const month=e.target.closest('[data-month]');if(!month||month.disabled)return;if(monthClickTimer){clearTimeout(monthClickTimer);monthClickTimer=null}calendarMonth=Number(month.dataset.month);calendarLevel='days';drawCalendar()});
$('fullWeek').addEventListener('click',()=>{draftIntent='week';const d=new Date(Date.UTC(calendarYear,calendarMonth,1));d.setUTCDate(d.getUTCDate()-(d.getUTCDay()+6)%7);chooseSpan(d.getTime(),d.getTime()+6*86400000)});
$('fullMonth').addEventListener('click',()=>{draftIntent='month';chooseSpan(Date.UTC(calendarYear,calendarMonth,1),Date.UTC(calendarYear,calendarMonth+1,0))});
$('clearDates').addEventListener('click',()=>{draftIntent='auto';draftDates=new Set();preservedMonthDates=new Set();rangeStart=null;rangeEnd=null;drawCalendar()});
$('applyDates').addEventListener('click',()=>{activeIntent=draftIntent;activeDates=draftDates===null||draftDates.size===0?null:new Set(draftDates);$('dateDropdown').classList.add('hidden');$('dateToggle').setAttribute('aria-expanded','false');updateDateCaption();applyCalendar()});

// V-88: movimiento exclusivo de la ventana del calendario de Soportes.
const sc88Panel=$('dateDropdown'),sc88Handle=document.getElementById('sc88-calendarDrag');let sc88Gesture=null;
function sc88Position(rect,dx,dy,vw,vh){return {left:Math.max(8,Math.min(rect.left+dx,vw-rect.width-8)),top:Math.max(8,Math.min(rect.top+dy,vh-rect.height-8))}}
function sc88Clamp(){if(sc88Panel.classList.contains('hidden'))return;const p=sc88Position(sc88Panel.getBoundingClientRect(),0,0,window.innerWidth,window.innerHeight);Object.assign(sc88Panel.style,{right:'auto',left:p.left+'px',top:p.top+'px'})}
sc88Handle.addEventListener('pointerdown',e=>{if(e.button!==0||e.isPrimary===false)return;sc88Clamp();sc88Gesture={id:e.pointerId,x:e.clientX,y:e.clientY,rect:sc88Panel.getBoundingClientRect()};sc88Handle.setPointerCapture(e.pointerId);sc88Handle.classList.add('dragging');e.preventDefault()});
sc88Handle.addEventListener('pointermove',e=>{const g=sc88Gesture;if(!g||g.id!==e.pointerId)return;const p=sc88Position(g.rect,e.clientX-g.x,e.clientY-g.y,window.innerWidth,window.innerHeight);sc88Panel.style.left=p.left+'px';sc88Panel.style.top=p.top+'px'});
function sc88End(e){if(!sc88Gesture||sc88Gesture.id!==e.pointerId)return;sc88Gesture=null;sc88Handle.classList.remove('dragging');if(sc88Handle.hasPointerCapture(e.pointerId))sc88Handle.releasePointerCapture(e.pointerId)}
sc88Handle.addEventListener('pointerup',sc88End);sc88Handle.addEventListener('pointercancel',sc88End);sc88Handle.addEventListener('lostpointercapture',()=>{sc88Gesture=null;sc88Handle.classList.remove('dragging')});window.addEventListener('resize',sc88Clamp);$('dateToggle').addEventListener('click',()=>requestAnimationFrame(sc88Clamp));

const byId=id=>document.getElementById('sc72-'+id),dialog=byId('deleteDialog');
let deleteBusy=false;
function weekInventory(){const groups=new Map();for(const e of allEvents){if(!/^\d{4}-S\d{2}$/.test(e.week))continue;const g=groups.get(e.week)||{key:e.week,count:0};g.count++;groups.set(e.week,g)}return [...groups.values()].sort((a,b)=>b.key.localeCompare(a.key))}
function chosenWeeks(){return new Set([...byId('deleteList').querySelectorAll('input:checked')].map(i=>i.value))}
function deletionSummary(){const keys=chosenWeeks(),count=allEvents.filter(e=>keys.has(e.week)).length;byId('deleteSummary').textContent=`${keys.size} semana(s) · ${count.toLocaleString('es-MX')} registros seleccionados`;byId('deleteConfirm').disabled=deleteBusy||!count}
function showWeekDeletion(){if(deleteBusy)return;const rows=weekInventory();byId('deleteList').innerHTML=rows.length?rows.map(g=>{const [y,n]=g.key.split('-S');return `<label><input type="checkbox" value="${g.key}"><span><b>${y} · Semana ${Number(n)}</b><small>${esc(weekRange(y,n))} · ${g.count.toLocaleString('es-MX')} registros</small></span></label>`}).join(''):'<p>No hay semanas cargadas.</p>';deletionSummary();if(!dialog.open)dialog.showModal()}
document.getElementById('deleteWeeks').onclick=showWeekDeletion;
byId('deleteClose').onclick=()=>{if(!deleteBusy)dialog.close()};
dialog.addEventListener('cancel',e=>{if(deleteBusy)e.preventDefault()});
byId('deleteList').addEventListener('change',deletionSummary);
for(const [id,on] of [['selectAll',true],['selectNone',false]])byId(id).onclick=()=>{if(deleteBusy)return;byId('deleteList').querySelectorAll('input').forEach(i=>i.checked=on);deletionSummary()};
byId('deleteConfirm').onclick=async()=>{
 if(deleteBusy)return;const keys=chosenWeeks(),affected=allEvents.filter(e=>keys.has(e.week));if(!affected.length)return;
 if(!confirm(`¿Eliminar PERMANENTEMENTE ${affected.length.toLocaleString('es-MX')} registros de ${keys.size} semana(s)?\n\n${[...keys].sort().join(', ')}\n\nSe borrarán semanas completas del almacenamiento del navegador. No se eliminará la base de clientes ni Clean Up. Esta acción no se puede deshacer.`))return;
 deleteBusy=true;byId('deleteConfirm').disabled=true;byId('deleteClose').disabled=true;byId('deleteList').querySelectorAll('input').forEach(i=>i.disabled=true);
 try{
  await new Promise((resolve,reject)=>{const tx=db.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);affected.forEach(e=>store.delete(e.key));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('Transacción cancelada'))});
  selectedCell=null;searchAccount='';searchLocations=[];selectedWeekNums.clear();selectedYears.clear();await reload();dialog.close();status(`Se eliminaron ${affected.length.toLocaleString('es-MX')} registros de ${keys.size} semana(s). La base de clientes y Clean Up se conservaron.`,'ok');
 }catch(err){status('No se pudieron eliminar las semanas: '+(err.message||String(err)),'error')}
 finally{deleteBusy=false;byId('deleteClose').disabled=false;if(dialog.open)showWeekDeletion()}
};
refreshData();
})();
