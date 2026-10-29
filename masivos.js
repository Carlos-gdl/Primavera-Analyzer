(()=>{'use strict';
const QUADRANT_METERS=500;const KEY='primavera_masivos_v1', $=id=>document.getElementById(id),fmt=n=>Math.round(n||0).toLocaleString('es-MX'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let pe84SearchMarker=null;
let records=[],filtered=[],map,points=L.layerGroup(),cells=L.layerGroup(),selectedTab='map',selectedYears=new Set(),selectedWeeks=new Set(),weekSelectionInitialized=false,selectedCauseCluster=null,selectedExploreCause=null;const color=['#e6468b','#9655c5','#ff901d','#35a9b4','#d16865','#ffb732','#6b65d8','#e66d30','#bc4071','#3da5df'];
function dateValue(v){if(v instanceof Date&&!isNaN(v))return v.toISOString().slice(0,10);if(typeof v==='number'){const d=XLSX.SSF.parse_date_code(v);return d?`${d.y}-${String(d.m).padStart(2,'0')}-${String(d.d).padStart(2,'0')}`:''}const s=String(v??'').trim();if(/^\d{4}-\d{2}-\d{2}/.test(s))return s.slice(0,10);const m=s.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);return m?`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`:''}
function duration(v){if(typeof v==='number')return v*24;if(v instanceof Date)return v.getHours()+v.getMinutes()/60+v.getSeconds()/3600;const m=String(v??'').match(/^(?:(\d+)\s+days?[, ]+)?(\d+):(\d+)(?::(\d+))?/i);return m?(+(m[1]||0)*24)+(+m[2])+(+m[3])/60+(+m[4]||0)/3600:null}
function clean(r){const get=k=>r[k]??'';let lat=Number(get('LATITUD')),lon=Number(get('LONGITUD'));if(!Number.isFinite(lat)||!Number.isFinite(lon)){const m=String(get('COORDENADAS')).match(/(-?\d+\.\d+)\s*[,; ]\s*(-?\d+\.\d+)/);if(m){lat=+m[1];lon=+m[2]}}const folio=String(get('FOLIO')).trim();return {folio,qr:String(get('QR')).trim(),date:dateValue(get('FECHA INICIO')),lat,lon,cluster:String(get('CLUSTER')).trim()||'Sin clúster',olt:String(get('OLT/SEGMENTO')).trim()||'Sin OLT',cause:String(get('CAUSA')).trim()||'No determinada',clients:Number(get('CLIENTES AFECTADOS'))||0,ttr:duration(get('TTR')),tta:duration(get('TTA')),ttp:duration(get('TTP')),status:String(get('STATUS')),provider:String(get('PROVEEDOR')),ports:String(get('PUERTOS AFECTADOS')??'')}}
function validPos(r){return r.lat>=-90&&r.lat<=90&&r.lon>=-180&&r.lon<=180&&Number.isFinite(r.lat)&&Number.isFinite(r.lon)}
function quadrant(r){const meters=111320,lat0=20.65;const x=Math.floor(r.lon*meters*Math.cos(lat0*Math.PI/180)/QUADRANT_METERS),y=Math.floor(r.lat*meters/QUADRANT_METERS);return `Q-${x}-${y}`}
function group(items,key){const m=new Map();items.forEach(r=>{const k=key(r);if(!m.has(k))m.set(k,[]);m.get(k).push(r)});return [...m].map(([name,rs])=>({name,rows:rs,n:rs.length,clients:rs.reduce((a,r)=>a+r.clients,0),ttr:avg(rs.map(r=>r.ttr))})).sort((a,b)=>b.n-a.n)}
function avg(a){const x=a.filter(n=>n!==null&&Number.isFinite(n));return x.length?x.reduce((s,n)=>s+n,0)/x.length:null}
function table(head,rows){return `<table><thead><tr>${head.map(h=>`<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('')}</tbody></table>`}
function tr(cols){return `<tr>${cols.map(c=>`<td>${c}</td>`).join('')}</tr>`}
function durationText(n){return n==null?'—':`${n.toFixed(1)} h`}
function weekParts(date){if(!date)return null;const d=new Date(date+'T12:00:00Z');if(Number.isNaN(d.getTime()))return null;const day=d.getUTCDay()||7;d.setUTCDate(d.getUTCDate()+4-day);const year=d.getUTCFullYear();const jan1=new Date(Date.UTC(year,0,1));const week=Math.ceil((((d-jan1)/86400000)+1)/7);const monday=new Date(date+'T12:00:00Z');monday.setUTCDate(monday.getUTCDate()-(day-1));const sunday=new Date(monday);sunday.setUTCDate(sunday.getUTCDate()+6);return {year,week,key:`${year}-S${String(week).padStart(2,'0')}`,monday:monday.toISOString().slice(0,10),sunday:sunday.toISOString().slice(0,10)}}
function weekLabel(w){const f=d=>{const [y,m,day]=d.split('-');return `${day}/${m}`};return `Semana ${w.week} · ${f(w.monday)} – ${f(w.sunday)}`}
const isoDay=(y,m,d)=>new Date(Date.UTC(y,m,d,12)).toISOString().slice(0,10);
let activeDates=null,draftDates=null,activeWeeks=new Set(),draftWeeks=new Set(),activeMonths=new Set(),draftMonths=new Set();
let availableDates=new Set(),availableWeeks=new Map(),availableMonths=new Map(),periodColors=new Map();
let calendarYear=new Date().getFullYear(),calendarMonth=new Date().getMonth(),calendarLevel='days',monthClickTimer=null;
function allRecordDates(){return new Set(records.map(r=>r.date).filter(d=>/^\d{4}-\d{2}-\d{2}$/.test(d||'')))}
function datesBetween(start,end){const out=new Set();let a=Date.parse(start+'T12:00:00Z'),b=Date.parse(end+'T12:00:00Z');if(!Number.isFinite(a)||!Number.isFinite(b))return out;if(a>b)[a,b]=[b,a];for(let t=a;t<=b;t+=86400000)out.add(new Date(t).toISOString().slice(0,10));return out}
function validGroups(groups,dates,available){for(const key of groups){const days=available.get(key)||[];if(!dates||!days.length||!days.every(d=>dates.has(d)))groups.delete(key)}}
function refreshData(){
 availableDates=allRecordDates();availableWeeks=new Map();availableMonths=new Map();
 for(const d of [...availableDates].sort()){const key=weekParts(d).key,month=d.slice(0,7);if(!availableWeeks.has(key))availableWeeks.set(key,[]);availableWeeks.get(key).push(d);if(!availableMonths.has(month))availableMonths.set(month,[]);availableMonths.get(month).push(d)}
 if(activeDates!==null){activeDates=new Set([...activeDates].filter(d=>availableDates.has(d)));if(!activeDates.size){activeDates=null;/* Conservar la visualización inicial de Planta Externa. */}}
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
   html+=`<label class="pe86-week-check" title="Semana ${w.week}: ${w.monday} a ${w.sunday}"><input type="checkbox" data-week-key="${w.key}" data-partial="${partial?'true':'false'}" aria-label="Seleccionar semana ${w.week} de ${w.year}" ${checked?'checked':''} ${days.length?'':'disabled'}></label>`;
   for(let i=0;i<7;i++){const date=new Date(t+i*86400000).toISOString().slice(0,10),within=date.slice(0,7)===isoDay(calendarYear,calendarMonth,1).slice(0,7);html+=within?`<button type="button" data-date="${date}" class="${draftDates?.has(date)?'chosen':''}" ${availableDates.has(date)?'':'disabled'}>${+date.slice(8)}</button>`:'<span class="pe86-outside" aria-hidden="true"></span>'}
  }
 }
 $('calendarDays').innerHTML=html;
 $('calendarDays').querySelectorAll('input[data-week-key]').forEach(input=>{input.indeterminate=input.dataset.partial==='true';input.setAttribute('aria-checked',input.indeterminate?'mixed':String(input.checked))});
 $('draftDatesLabel').textContent=draftDates?.size?`${draftDates.size} días seleccionados. Días y semanas se acumulan; pulsa OK para aplicar.`:'Selecciona días o semanas. Clear + OK muestra todo el histórico.';
}
function monthShift(n){if(calendarLevel==='years')return;const d=new Date(Date.UTC(calendarYear,calendarMonth+(calendarLevel==='days'?n:n*12),1));calendarYear=d.getUTCFullYear();calendarMonth=d.getUTCMonth();drawCalendar()}
function refreshWeeks(){refreshData()}
function clearCalendarGroups(){activeWeeks.clear();draftWeeks.clear();activeMonths.clear();draftMonths.clear()}
function getFilters(){return {cluster:$('cluster').value,olt:$('olt').value,cause:$('cause').value,impact:$('impact').value,ttr:$('ttr').value}}
function selectOptions(id,values){const el=$(id),old=el.value;el.innerHTML='<option value="">Todos</option>'+[...new Set(values)].sort((a,b)=>a.localeCompare(b,'es')).map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');if([...el.options].some(o=>o.value===old))el.value=old}
function refreshSelects(){selectOptions('cluster',records.map(r=>r.cluster));selectOptions('olt',records.map(r=>r.olt));selectOptions('cause',records.map(r=>r.cause))}
function filter(){const f=getFilters();filtered=records.filter(r=>{if(!r.date||(activeDates!==null&&!activeDates.has(r.date)))return false;if(f.cluster&&r.cluster!==f.cluster)return false;if(f.olt&&r.olt!==f.olt)return false;if(f.cause&&r.cause!==f.cause)return false;if(f.impact!=='all'){const c=r.clients;if(f.impact==='1'&&!(c>=1&&c<=20))return false;if(f.impact==='21'&&!(c>=21&&c<=100))return false;if(f.impact==='101'&&!(c>=101&&c<=500))return false;if(f.impact==='501'&&c<=500)return false}if(f.ttr!=='all'){if(r.ttr===null)return false;if(f.ttr==='0'&&r.ttr>=3)return false;if(f.ttr==='3'&&!(r.ttr>=3&&r.ttr<6))return false;if(f.ttr==='6'&&!(r.ttr>=6&&r.ttr<12))return false;if(f.ttr==='12'&&r.ttr<12)return false}return true});render()}
function render(){preparePeriods();const a=filtered,total=a.reduce((s,r)=>s+r.clients,0),q=group(a.filter(validPos),quadrant),c=group(a,r=>r.cause);$('kFolios').textContent=fmt(a.length);$('kClients').textContent=fmt(total);$('kCauses').textContent=fmt(c.length);top68Compute();renderMap(q);renderCause(c);renderCluster();renderClients();renderOther(q,c);top68Refresh()}
function mapExplorationRows(){return filtered} // V-61: una sola selección compartida para KPI, gráficas y mapa
// V-57: coloración temporal y agrupación visual, siempre sobre registros ya filtrados.
const V57_COLORS=['#F12B38','#087FE8','#F4C300','#00A84F','#A64DFF','#FF7A00','#00C7D4','#F02FA6','#6848DF','#8BB800'];

const MONTH_NAMES=['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
function periodKey(date){const w=weekParts(date);if(w&&activeWeeks.has(w.key))return 'W|'+w.key;const month=date.slice(0,7);if(activeMonths.has(month))return 'M|'+month;return 'D|'+date}
function periodLabel(key){const [kind,value]=key.split('|');if(kind==='W'){const m=value.match(/^(\d{4})-S(\d{2})$/);return `Semana ${+m[2]}/${m[1]}`}if(kind==='M'){const [y,m]=value.split('-');return `${MONTH_NAMES[+m-1]}/${y}`}const [y,m,d]=value.split('-');return `${d}/${m}/${y}`}
function updatePeriodLegend(rows){const el=$('v57Legend');if(!el)return;const show=activeDates!==null&&rows.length>0;el.classList.toggle('hidden',!show);if(!show)return;const keys=[...new Set(rows.map(r=>periodKey(r.date)))].sort();el.innerHTML=keys.map(k=>`<span class="v57-legend-item" style="color:${periodColors.get(k)}"><i style="background:${periodColors.get(k)}"></i>${esc(periodLabel(k))}</span>`).join('')}
function pe86Color(i){if(V57_COLORS[i])return V57_COLORS[i];const h=i*137.508%360,l=.43,a=.7*Math.min(l,1-l);return '#'+[0,8,4].map(n=>{const k=(n+h/30)%12;return Math.round(255*(l-a*Math.max(-1,Math.min(k-3,9-k,1)))).toString(16).padStart(2,'0')}).join('')}
function preparePeriods(){const keys=[...new Set(filtered.filter(r=>r.date).map(r=>periodKey(r.date)))].sort();periodColors=new Map(keys.map((k,i)=>[k,activeDates===null?'#e02020':pe86Color(i)]))}
// V-65: SOLO cuadrantes. UTM 13N (WGS84), cuadrícula por cada mancha KMZ.
// Las celdas de borde permanecen completas; los filtros nunca intervienen.
const GRID_A=6378137,GRID_F=1/298.257223563,GRID_E2=GRID_F*(2-GRID_F),GRID_EP2=GRID_E2/(1-GRID_E2),GRID_K0=.9996,GRID_LON0=-105*Math.PI/180;
function gridUtm(lat,lon){const phi=lat*Math.PI/180,lambda=lon*Math.PI/180,s=Math.sin(phi),c=Math.cos(phi),t=Math.tan(phi),N=GRID_A/Math.sqrt(1-GRID_E2*s*s),T=t*t,C=GRID_EP2*c*c,A=c*(lambda-GRID_LON0),e4=GRID_E2*GRID_E2,e6=e4*GRID_E2,M=GRID_A*((1-GRID_E2/4-3*e4/64-5*e6/256)*phi-(3*GRID_E2/8+3*e4/32+45*e6/1024)*Math.sin(2*phi)+(15*e4/256+45*e6/1024)*Math.sin(4*phi)-(35*e6/3072)*Math.sin(6*phi));return [500000+GRID_K0*N*(A+(1-T+C)*A**3/6+(5-18*T+T*T+72*C-58*GRID_EP2)*A**5/120),GRID_K0*(M+N*t*(A*A/2+(5-T+9*C+4*C*C)*A**4/24+(61-58*T+T*T+600*C-330*GRID_EP2)*A**6/720))]}
function gridLatLon(x,y){const xx=x-500000,yy=y/GRID_K0,e1=(1-Math.sqrt(1-GRID_E2))/(1+Math.sqrt(1-GRID_E2)),mu=yy/(GRID_A*(1-GRID_E2/4-3*GRID_E2**2/64-5*GRID_E2**3/256)),phi1=mu+(3*e1/2-27*e1**3/32)*Math.sin(2*mu)+(21*e1**2/16-55*e1**4/32)*Math.sin(4*mu)+(151*e1**3/96)*Math.sin(6*mu)+(1097*e1**4/512)*Math.sin(8*mu),s=Math.sin(phi1),c=Math.cos(phi1),t=Math.tan(phi1),N=GRID_A/Math.sqrt(1-GRID_E2*s*s),R=GRID_A*(1-GRID_E2)/(1-GRID_E2*s*s)**1.5,T=t*t,C=GRID_EP2*c*c,D=xx/(N*GRID_K0),lat=phi1-(N*t/R)*(D*D/2-(5+3*T+10*C-4*C*C-9*GRID_EP2)*D**4/24+(61+90*T+298*C+45*T*T-252*GRID_EP2-3*C*C)*D**6/720),lon=GRID_LON0+(D-(1+2*T+C)*D**3/6+(5-2*C+28*T-3*C*C+8*GRID_EP2+24*T*T)*D**5/120)/c;return [lat*180/Math.PI,lon*180/Math.PI]}
function gridInside(p,ring){let inside=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])inside=!inside}return inside}
function gridInShape(p,rings){return gridInside(p,rings[0])&&!rings.slice(1).some(h=>gridInside(p,h))}
function gridCross(a,b,c,d){const orient=(p,q,r)=>(q[0]-p[0])*(r[1]-p[1])-(q[1]-p[1])*(r[0]-p[0]);const ab1=orient(a,b,c),ab2=orient(a,b,d),cd1=orient(c,d,a),cd2=orient(c,d,b);return ab1*ab2<=0&&cd1*cd2<=0&&Math.max(a[0],b[0])>=Math.min(c[0],d[0])&&Math.max(c[0],d[0])>=Math.min(a[0],b[0])&&Math.max(a[1],b[1])>=Math.min(c[1],d[1])&&Math.max(c[1],d[1])>=Math.min(a[1],b[1])}
function gridTouches(x,y,rings){const size=QUADRANT_METERS,corners=[[x,y],[x+size,y],[x+size,y+size],[x,y+size]];if(corners.some(p=>gridInShape(p,rings)))return true;for(const ring of rings){if(ring.some(p=>p[0]>=x&&p[0]<=x+size&&p[1]>=y&&p[1]<=y+size))return true;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length];for(let j=0;j<4;j++)if(gridCross(a,b,corners[j],corners[(j+1)%4]))return true}}return false}
function gridCenter(ring){let area=0,cx=0,cy=0;for(let i=0;i<ring.length;i++){const a=ring[i],b=ring[(i+1)%ring.length],cross=a[0]*b[1]-b[0]*a[1];area+=cross;cx+=(a[0]+b[0])*cross;cy+=(a[1]+b[1])*cross}if(Math.abs(area)>1e-9)return [cx/(3*area),cy/(3*area)];return ring[0]}
function gridOrigin(rings){const outer=rings[0],c=gridCenter(outer);if(gridInShape(c,rings))return c;const xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);for(let step=0;step<7;step++){const n=4*2**step;for(let iy=0;iy<n;iy++)for(let ix=0;ix<n;ix++){const p=[minX+(ix+.5)*(maxX-minX)/n,minY+(iy+.5)*(maxY-minY)/n];if(gridInShape(p,rings))return p}}return outer[0]}
// V-66: una sola malla UTM 13N para todas las manchas, origen global (0,0) y deduplicacion por indice.
function drawCoverageQuadrants(newShapes){const shapes=newShapes||window.primaveraCoverageShapes?.()||[],size=QUADRANT_METERS,seen=new Set();cells.eachLayer(layer=>{if(layer._coverageGridKey)seen.add(layer._coverageGridKey)});for(let si=0;si<shapes.length;si++){const rings=shapes[si].map(r=>r.map(([lat,lon])=>gridUtm(lat,lon))).filter(r=>r.length>=3);if(!rings.length)continue;const outer=rings[0],xs=outer.map(p=>p[0]),ys=outer.map(p=>p[1]),minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);const ix0=Math.floor(minX/size),ix1=Math.floor(maxX/size),iy0=Math.floor(minY/size),iy1=Math.floor(maxY/size);if((ix1-ix0+1)*(iy1-iy0+1)>30000){console.warn('Cuadrícula omitida: cobertura excesivamente extensa',si);continue}for(let ix=ix0;ix<=ix1;ix++)for(let iy=iy0;iy<=iy1;iy++){const key=ix+':'+iy;if(seen.has(key))continue;const x=ix*size,y=iy*size;if(!gridTouches(x,y,rings))continue;seen.add(key);const coords=[[x,y],[x+size,y],[x+size,y+size],[x,y+size]].map(p=>gridLatLon(...p));Object.assign(L.polygon(coords,{color:'#AD8BC6',weight:3.6,opacity:1,fillOpacity:.13,interactive:false}),{_coverageGridKey:key}).addTo(cells)}}}
window.addEventListener('primavera:coverage-updated',event=>{if(!map)return;if($('showCells').checked)drawCoverageQuadrants(event.detail?.shapes);top68CoverageChanged()});
function renderMap(q){pe84ClearMarker();$('pe84Results').replaceChildren();points.clearLayers();cells.clearLayers();const mapRows=top68MapRows(mapExplorationRows());const mapGroup=[];if($('showCells').checked||top68State?.only)drawCoverageQuadrants();top68StyleCells();if($('showPins').checked||top68State?.only){const groups=new Map();mapRows.filter(validPos).forEach(r=>{const key=`${Math.round(r.lat*50000)}:${Math.round(r.lon*50000)}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r)});for(const rs of groups.values()){const lat=rs.reduce((n,r)=>n+r.lat,0)/rs.length,lon=rs.reduce((n,r)=>n+r.lon,0)/rs.length;const periods=[...new Set(rs.map(r=>periodKey(r.date)))];const shades=periods.map(k=>periodColors.get(k)||'#e02020');let marker;if(rs.length===1){marker=L.circleMarker([lat,lon],{radius:5,color:'#fff',weight:1.5,fillColor:shades[0],fillOpacity:1})}else{const segments=shades.length===1?`<circle cx="15" cy="15" r="11" fill="${shades[0]}"/>`:shades.map((c,i)=>{const a=2*Math.PI*i/shades.length-Math.PI/2,b=2*Math.PI*(i+1)/shades.length-Math.PI/2;const x1=15+11*Math.cos(a),y1=15+11*Math.sin(a),x2=15+11*Math.cos(b),y2=15+11*Math.sin(b);return `<path d="M15 15 L${x1} ${y1} A11 11 0 ${b-a>Math.PI?1:0} 1 ${x2} ${y2} Z" fill="${c}"/>`}).join('');const html=`<div class="v57-pin"><svg viewBox="0 0 30 30" width="30" height="30">${segments}<circle cx="15" cy="15" r="11" fill="none" stroke="white" stroke-width="2"/></svg><span class="v57-count">${rs.length}</span></div>`;marker=L.marker([lat,lon],{icon:L.divIcon({html,className:'v57-marker-icon',iconSize:[44,30],iconAnchor:[15,15]})})}const popup=rs.map(pe84Popup).join('');marker._pe84Rows=rs;pe85BindPopup(marker,`<div class="v57-popup"><strong>${rs.length} ${rs.length===1?'folio':'folios'} en esta ubicación</strong>${popup}</div>`).addTo(points)}}cells.addTo(map);points.addTo(map);updatePeriodLegend(mapRows)}
function drawDonut(target,legendId,groups,mode,clickable=false,causeClickable=false){const total=groups.reduce((sum,g)=>sum+(mode==='clients'?g.clients:g.n),0);const radius=62,circ=2*Math.PI*radius;let used=0;const svg=groups.filter(g=>(mode==='clients'?g.clients:g.n)>0).map((g,i)=>{const v=mode==='clients'?g.clients:g.n;const fraction=v/Math.max(1,total);const dash=fraction*circ;const pct=(100*fraction).toFixed(1);const tip=`${g.name} | ${g.n} folios | ${fmt(g.clients)} clientes afectados | ${pct}% ${mode==='clients'?'de clientes afectados':'de folios'}`;const seg=`<circle class="donut-segment" ${clickable?`data-cluster="${esc(g.name)}"`:``} ${causeClickable?`data-cause="${esc(g.name)}"`:``} cx="90" cy="90" r="${radius}" fill="none" stroke="${color[i%color.length]}" stroke-width="32" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-used*circ}" transform="rotate(-90 90 90)" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`;used+=fraction;return seg}).join('');$(target).innerHTML=`<svg class="donut-svg" viewBox="0 0 180 180" role="img" aria-label="Distribución ${mode==='clients'?'de clientes afectados por clúster':'de folios por causa'}"><circle cx="90" cy="90" r="${radius}" fill="none" stroke="#f3e4d9" stroke-width="32"/>${svg}<circle cx="90" cy="90" r="43" fill="#fffaf6"/><text x="90" y="86" text-anchor="middle" font-size="17" font-weight="800">${fmt(total)}</text><text x="90" y="103" text-anchor="middle" font-size="10">${mode==='clients'?'clientes afectados':'folios'}</text></svg>`;
$(legendId).innerHTML=groups.map((g,i)=>{const val=mode==='clients'?g.clients:g.n;const pct=(100*val/Math.max(1,total)).toFixed(1);return `<div class="legend-row" title="${esc(g.name)} · ${g.n} folios · ${fmt(g.clients)} clientes afectados"><i style="background:${color[i%color.length]}"></i>${clickable?`<button type="button" class="cluster-legend-btn" data-cluster="${esc(g.name)}">${esc(g.name)}</button>`:esc(g.name)} · ${pct}%</div>`}).join('')||'<small>Sin registros para los filtros actuales</small>'}
function renderCause(c){const cluster=$('cluster').value;drawDonut('donut','causeLegend',c,'folios',false,true);$('causeScope').textContent=cluster?`Causas de ${cluster} · ${filtered.length} folios`:'Todos los clústeres';$('causeBack').classList.toggle('hidden',!(!cluster&&!$('cause').value))}
function renderCluster(){const groups=group(filtered,r=>r.cluster).sort((a,b)=>b.clients-a.clients);drawDonut('clusterDonut','clusterLegend',groups,'clients',true)}
function renderClients(){const rows=mapExplorationRows(),total=rows.reduce((n,r)=>n+r.clients,0);const selected=$('cluster').value||$('cause').value;const scope=[$('cluster').value&&`Clúster: ${$('cluster').value}`,$('cause').value&&`Causa: ${$('cause').value}`].filter(Boolean);$('exploreScope').textContent=scope.length?scope.join(' · '):'Todos los clústeres y causas según los filtros generales';$('exploreBack').classList.toggle('hidden',!selected);$('clientsTotal').textContent=`Total: ${fmt(total)} clientes afectados · ${fmt(rows.length)} folios`;const positive=rows.filter(r=>r.clients>0);const sum=positive.reduce((a,r)=>a+r.clients,0),radius=62,circ=2*Math.PI*radius;let used=0;const segments=positive.map((r,i)=>{const fraction=r.clients/Math.max(1,sum),dash=fraction*circ,pct=(fraction*100).toFixed(1),tip=`Folio ${r.folio} | ${fmt(r.clients)} clientes afectados | ${pct}% del total`;const out=`<circle class="donut-segment" cx="90" cy="90" r="${radius}" fill="none" stroke="${color[i%color.length]}" stroke-width="32" stroke-dasharray="${dash} ${circ-dash}" stroke-dashoffset="${-used*circ}" transform="rotate(-90 90 90)" data-tip="${esc(tip)}"><title>${esc(tip)}</title></circle>`;used+=fraction;return out}).join('');$('clientsDonut').innerHTML=`<svg class="donut-svg" viewBox="0 0 180 180" role="img" aria-label="Clientes afectados por folio"><circle cx="90" cy="90" r="${radius}" fill="none" stroke="#f3e4d9" stroke-width="32"/>${segments}<circle cx="90" cy="90" r="43" fill="#fffaf6"/><text x="90" y="84" text-anchor="middle" font-size="17" font-weight="800">${fmt(total)}</text><text x="90" y="100" text-anchor="middle" font-size="9">clientes afectados</text><text x="90" y="113" text-anchor="middle" font-size="8">${rows.length} folios</text></svg>`;$('clientsLegend').innerHTML=positive.map((r,i)=>`<div class="legend-row"><i style="background:${color[i%color.length]}"></i>Folio ${esc(r.folio)} · ${fmt(r.clients)} clientes · ${(100*r.clients/Math.max(1,sum)).toFixed(1)}%</div>`).join('')||(rows.length?'<small>Sin clientes afectados positivos en la selección</small>':'<small>Sin folios para esta selección</small>')}
function refreshExploration(){filter()} // V-61: toda interacción recalcula también KPI y las tres gráficas
function folioRows(rows){return rows.map(r=>tr([esc(r.folio),esc(r.date),esc(r.cluster),esc(r.olt),esc(r.cause),fmt(r.clients),durationText(r.ttr)]))}
function parsePorts(raw){const text=String(raw??'').trim();if(!text)return [];const found=[];const re=/(\d+)\s*[\/\-\t]\s*(\d+)\s*[\/\-\t]\s*(\d+)/g;let m;while((m=re.exec(text))!==null){found.push([m[1],m[2],m[3]])}return found}

function renderOther(q,c){$('causeFull').innerHTML=table(['Causa','Folios','Clientes afectados','TTR promedio'],c.map(g=>tr([esc(g.name),g.n,fmt(g.clients),durationText(g.ttr)])));$('quadFull').innerHTML=table(['Cuadrante','Folios','Clientes afectados','TTR promedio'],q.map(g=>tr([`<a href="#" data-quad="${esc(g.name)}">${esc(g.name)}</a>`,g.n,fmt(g.clients),durationText(g.ttr)])));const olts=group(filtered,r=>r.olt),clusters=group(filtered,r=>r.cluster);$('oltFull').innerHTML=`<div class="two"><article><h3>OLT</h3>${table(['OLT','Folios','Clientes'],olts.map(g=>tr([esc(g.name),g.n,fmt(g.clients)])))}</article><article><h3>Clústeres</h3>${table(['Clúster','Folios','Clientes'],clusters.map(g=>tr([esc(g.name),g.n,fmt(g.clients)])))}</article></div>`;const weeks=group(filtered,r=>{if(!r.date)return 'Sin fecha';const d=new Date(r.date+'T12:00:00');d.setDate(d.getDate()-(d.getDay()+6)%7);return d.toISOString().slice(0,10)}).sort((a,b)=>a.name.localeCompare(b.name));$('trendFull').innerHTML=table(['Semana que inicia lunes','Folios','Clientes afectados','TTR promedio'],weeks.map(g=>tr([esc(g.name),g.n,fmt(g.clients),durationText(g.ttr)])));$('folioFull').innerHTML=table(['Folio','Fecha','Clúster','OLT','Causa','Clientes','TTR'],folioRows(filtered))}
function focusQuadrant(name){const r=filtered.find(r=>validPos(r)&&quadrant(r)===name);if(!r)return;selectTab('map');map.setView([r.lat,r.lon],16);setTimeout(()=>map.invalidateSize(),80)}
function selectTab(tab){selectedTab=tab;document.querySelectorAll('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));document.querySelectorAll('.content>.panel').forEach(p=>p.classList.toggle('hidden',p.id!=='panel-'+tab));if(tab==='map')setTimeout(()=>map.invalidateSize(),100)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(records))}catch(e){$('notice').textContent='No fue posible guardar todo el histórico localmente; exporta tu información y evita cerrar la ventana.'}}
function masivosUploadOpen(file){const overlay=$('masivosUploadOverlay');overlay.hidden=false;overlay.className='masivos-upload-overlay';$('masivosUploadTitle').textContent='Planta Externa · Carga de Excel';$('masivosUploadAccept').disabled=true;$('masivosUploadStatus').textContent='Preparando archivo Excel';$('masivosUploadDetail').textContent=file.name;masivosUploadProgress(null,'Leyendo archivo...')}
function masivosUploadProgress(value,detail){const bar=document.querySelector('#masivosUploadOverlay .masivos-upload-progress');bar.classList.toggle('indeterminate',value===null);bar.classList.remove('failed');if(value!==null){const pct=Math.max(0,Math.min(100,Math.round(value)));$('masivosUploadFill').style.width=pct+'%';bar.setAttribute('aria-valuenow',String(pct));$('masivosUploadPercent').textContent=pct+' %'}else{$('masivosUploadFill').style.width='';bar.removeAttribute('aria-valuenow');$('masivosUploadPercent').textContent='Procesando…'}$('masivosUploadDetail').textContent=detail}
function masivosUploadFinish(ok,message){const overlay=$('masivosUploadOverlay');overlay.classList.add(ok?'done':'failed');$('masivosUploadStatus').textContent=ok?'Carga completada correctamente':'Error al cargar el archivo';$('masivosUploadDetail').textContent=message;if(!ok){document.querySelector('#masivosUploadOverlay .masivos-upload-progress').classList.add('failed');document.querySelector('#masivosUploadOverlay .masivos-upload-progress').classList.remove('indeterminate');$('masivosUploadPercent').textContent='Error'}else masivosUploadProgress(100,message);$('masivosUploadAccept').disabled=false}
const masivosNextPaint=()=>new Promise(resolve=>requestAnimationFrame(()=>setTimeout(resolve,0)));
async function importFile(file){if(!file)return;masivosUploadOpen(file);$('notice').textContent='Procesando '+file.name+'…';try{await masivosNextPaint();const buf=await file.arrayBuffer();masivosUploadProgress(null,'Interpretando hojas del Excel...');await masivosNextPaint();const wb=XLSX.read(buf,{type:'array',cellDates:true});const sheet=wb.Sheets[wb.SheetNames[0]];if(!sheet)throw Error('El archivo no contiene una hoja de datos.');masivosUploadProgress(null,'Validando estructura y columnas obligatorias...');await masivosNextPaint();const raw=XLSX.utils.sheet_to_json(sheet,{defval:''});if(!raw.length||!('FOLIO' in raw[0])||!('LATITUD' in raw[0]))throw Error('El archivo debe contener FOLIO y LATITUD.');const old=new Map(records.map(r=>[r.folio,r]));let added=0,duplicates=0,invalid=0;masivosUploadProgress(0,'Validación completada. Revisando 0 de '+raw.length+' filas...');await masivosNextPaint();const batch=250;for(let i=0;i<raw.length;i+=batch){raw.slice(i,i+batch).forEach(row=>{const r=clean(row);if(!r.folio){invalid++;return}if(old.has(r.folio)){duplicates++;const previous=old.get(r.folio);if(!previous.ports&&r.ports)old.set(r.folio,{...previous,ports:r.ports});return}old.set(r.folio,r);added++});masivosUploadProgress(85*Math.min(raw.length,i+batch)/raw.length,`Procesando registros: ${Math.min(raw.length,i+batch)} de ${raw.length}...`);await masivosNextPaint()}records=[...old.values()];masivosUploadProgress(90,'Guardando histórico en este navegador...');await masivosNextPaint();save();masivosUploadProgress(95,'Actualizando filtros, indicadores y mapa...');await masivosNextPaint();refreshSelects();refreshWeeks();filter();const msg=`${esc(file.name)} · ${added} folios nuevos · ${duplicates} folios duplicados omitidos · ${invalid} filas sin folio. Total: ${fmt(records.length)}.`;$('notice').textContent=msg;masivosUploadFinish(true,`${added} folios nuevos · ${duplicates} existentes omitidos · ${invalid} filas sin folio. Total: ${fmt(records.length)}.`)}catch(e){$('notice').textContent='Error de importación: '+e.message;masivosUploadFinish(false,e.message||'No fue posible procesar el archivo.')}finally{$('file').value=''}}

function download(){if(!filtered.length){alert('No hay folios para exportar');return}const out=filtered.map(r=>({'FOLIO':r.folio,'FECHA INICIO':r.date,'LATITUD':r.lat,'LONGITUD':r.lon,'CLUSTER':r.cluster,'OLT/SEGMENTO':r.olt,'CAUSA':r.cause,'CLIENTES AFECTADOS':r.clients,'TTR HORAS':r.ttr,'PROVEEDOR':r.provider,'PUERTOS AFECTADOS':r.ports}));const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(out),'Masivos');XLSX.writeFile(wb,'Cortes_Masivos_Filtrados.xlsx')}
var top68State={open:false,only:false,rows:[],selected:null,names:{},features:null};
map=L.map('map',{preferCanvas:true}).setView([20.65,-103.43],12);window.initCoverageV53?.(map);L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',{attribution:'Imagery © Esri',maxZoom:19}).addTo(map);try{records=JSON.parse(localStorage.getItem(KEY)||'[]');if(!Array.isArray(records))records=[]}catch(e){records=[]}refreshSelects();refreshWeeks();filter();if(records.length)$('notice').textContent=`Histórico recuperado: ${fmt(records.length)} folios. Datos almacenados localmente.`;
$('dateToggle').addEventListener('click',()=>{const opening=$('dateDropdown').classList.contains('hidden');$('dateDropdown').classList.toggle('hidden',!opening);$('dateToggle').setAttribute('aria-expanded',String(opening));$('dateToggle').setAttribute('aria-pressed',String(opening));if(opening){refreshData();draftDates=activeDates===null?new Set():new Set(activeDates);draftWeeks=new Set(activeWeeks);draftMonths=new Set(activeMonths);calendarLevel='days';calendarYear=new Date().getFullYear();calendarMonth=new Date().getMonth();if(!monthAvailable(calendarYear,calendarMonth)&&availableDates.size){const latest=[...availableDates].sort().at(-1);calendarYear=+latest.slice(0,4);calendarMonth=+latest.slice(5,7)-1}drawCalendar()}});
$('prevMonth').addEventListener('click',()=>monthShift(-1));$('nextMonth').addEventListener('click',()=>monthShift(1));$('calendarTitle').addEventListener('click',()=>{calendarLevel=calendarLevel==='days'?'months':'years';drawCalendar()});
$('calendarDays').addEventListener('click',e=>{const year=e.target.closest('[data-year]'),month=e.target.closest('[data-month]'),day=e.target.closest('[data-date]');if(e.target.closest('button')?.disabled)return;if(year){calendarYear=+year.dataset.year;calendarLevel='months';drawCalendar()}else if(month){if(monthClickTimer)clearTimeout(monthClickTimer);const y=calendarYear,m=+month.dataset.month;monthClickTimer=setTimeout(()=>{monthClickTimer=null;toggleCalendarMonth(y,m)},260)}else if(day)toggleDay(day.dataset.date)});
$('calendarDays').addEventListener('change',e=>{if(e.target.matches('input[data-week-key]'))selectWeek(e.target.dataset.weekKey,e.target.checked)});
$('calendarDays').addEventListener('dblclick',e=>{const month=e.target.closest('[data-month]');if(!month||month.disabled)return;if(monthClickTimer){clearTimeout(monthClickTimer);monthClickTimer=null}calendarMonth=+month.dataset.month;calendarLevel='days';drawCalendar()});
$('fullWeek').addEventListener('click',()=>selectWeek(weekParts(isoDay(calendarYear,calendarMonth,1)).key,true));
$('fullMonth').addEventListener('click',()=>toggleCalendarMonth(calendarYear,calendarMonth,true));
$('clearDates').addEventListener('click',()=>{draftDates=new Set();draftWeeks.clear();draftMonths.clear();drawCalendar()});
$('applyDates').addEventListener('click',()=>{activeDates=draftDates?.size?new Set(draftDates):null;activeWeeks=new Set(draftWeeks);activeMonths=new Set(draftMonths);validGroups(activeWeeks,activeDates,availableWeeks);validGroups(activeMonths,activeDates,availableMonths);$('dateDropdown').classList.add('hidden');$('dateToggle').setAttribute('aria-expanded','false');$('dateToggle').setAttribute('aria-pressed','false');updateDateCaption();filter()});
const tooltip=document.createElement('div');tooltip.className='chart-tooltip';document.body.appendChild(tooltip);document.addEventListener('click',e=>{const cluster=e.target.closest?.('[data-cluster]'),cause=e.target.closest?.('[data-cause]');if(cluster){$('cluster').value=cluster.dataset.cluster;refreshExploration()}else if(cause){$('cause').value=cause.dataset.cause;refreshExploration()}});$('causeBack').addEventListener('click',()=>{$('cluster').value='';$('cause').value='';refreshExploration()});$('exploreBack').addEventListener('click',()=>{$('cluster').value='';$('cause').value='';refreshExploration()});document.addEventListener('pointermove',e=>{const seg=e.target.closest?.('.donut-segment');if(seg){tooltip.textContent=seg.dataset.tip;tooltip.style.left=Math.min(e.clientX+15,window.innerWidth-330)+'px';tooltip.style.top=Math.max(8,e.clientY-55)+'px';tooltip.style.display='block'}else tooltip.style.display='none'});
$('masivosUploadAccept').addEventListener('click',()=>{$('masivosUploadOverlay').hidden=true});$('file').addEventListener('change',e=>importFile(e.target.files[0]));$('export').addEventListener('click',download);$('clear').addEventListener('click',()=>{if(confirm('¿Borrar solamente el histórico de Cortes Masivos? No se afectarán Soportes ni Repeat 60.')){records=[];selectedCauseCluster=null;selectedExploreCause=null;localStorage.removeItem(KEY);refreshSelects();refreshWeeks();filter();$('notice').textContent='Histórico de Cortes Masivos eliminado.'}});// V1.39: restablecer únicamente el estado de la vista, sin escrituras de almacenamiento.
$('history').addEventListener('click',()=>{
 activeDates=null;draftDates=null;clearCalendarGroups();
 selectedCauseCluster=null;selectedExploreCause=null;
 updateDateCaption();
 $('dateDropdown').classList.add('hidden');
 $('dateToggle').setAttribute('aria-expanded','false');
 ['cluster','olt','cause'].forEach(id=>$(id).value='');
 $('impact').value='all';$('ttr').value='all';
 filter();
});
$('reset').addEventListener('click',()=>{selectedCauseCluster=null;selectedExploreCause=null;activeDates=null;draftDates=null;clearCalendarGroups();updateDateCaption();$('dateDropdown').classList.add('hidden');['cluster','olt','cause'].forEach(id=>$(id).value='');$('impact').value='all';$('ttr').value='all';filter()});['cluster','olt','cause','impact','ttr','showPins','showCells'].forEach(id=>$(id).addEventListener('change',filter));document.querySelectorAll('#tabs button').forEach(b=>b.addEventListener('click',()=>selectTab(b.dataset.tab)));document.addEventListener('click',e=>{const a=e.target.closest('[data-quad]');if(a){e.preventDefault();focusQuadrant(a.dataset.quad)}});
// V-68: ranking independiente. Lee filtered; no modifica fórmulas previas ni históricos.
function top68Cell(r){const [x,y]=gridUtm(r.lat,r.lon);return {ix:Math.floor(x/500),iy:Math.floor(y/500)}}
function top68Key(c){return c.ix+':'+c.iy}
function top68Geometry(){if(!top68State.features)top68State.features=(window.primaveraCoverageFeatures?.()||[]).flatMap(f=>f.shapes.map(shape=>({group:f.group,rings:shape.map(r=>r.map(([lat,lon])=>gridUtm(lat,lon)))})));return top68State.features}
function top68Clip(ring,x0,y0){let out=ring;for(const [axis,bound,sign] of [[0,x0,1],[0,x0+500,-1],[1,y0,1],[1,y0+500,-1]]){const input=out;out=[];if(!input.length)break;for(let i=0;i<input.length;i++){const a=input[i],b=input[(i+1)%input.length],ina=sign*(a[axis]-bound)>=0,inb=sign*(b[axis]-bound)>=0;if(ina)out.push(a);if(ina!==inb){const t=(bound-a[axis])/(b[axis]-a[axis]);out.push([a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])])}}}return out}
// Área de unión por barrido vertical: evita contar dos veces coberturas superpuestas.
function top68UnionArea(shapes,x0,y0){
 const polys=shapes.map(rings=>rings.map(r=>top68Clip(r,x0,y0)).filter(r=>r.length>=3)).filter(r=>r.length),edges=[],xs=new Set([x0,x0+500]);
 for(const rings of polys)for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];xs.add(a[0]);if(a[0]!==b[0])edges.push([a,b])}
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){const [a,b]=edges[i],[c,d]=edges[j],u=[b[0]-a[0],b[1]-a[1]],v=[d[0]-c[0],d[1]-c[1]],cross=u[0]*v[1]-u[1]*v[0];if(Math.abs(cross)<1e-12)continue;const w=[c[0]-a[0],c[1]-a[1]],t=(w[0]*v[1]-w[1]*v[0])/cross,q=(w[0]*u[1]-w[1]*u[0])/cross;if(t>0&&t<1&&q>0&&q<1)xs.add(a[0]+t*u[0])}
 const breaks=[...xs].sort((a,b)=>a-b);let area=0;
 for(let k=1;k<breaks.length;k++){const width=breaks[k]-breaks[k-1];if(width<=1e-9)continue;const x=(breaks[k]+breaks[k-1])/2,intervals=[];
  for(const rings of polys){const hits=[];for(const r of rings)for(let i=0;i<r.length;i++){const a=r[i],b=r[(i+1)%r.length];if((a[0]>x)!==(b[0]>x))hits.push(a[1]+(x-a[0])*(b[1]-a[1])/(b[0]-a[0]))}hits.sort((a,b)=>a-b);for(let i=0;i+1<hits.length;i+=2)intervals.push([hits[i],hits[i+1]])}
  intervals.sort((a,b)=>a[0]-b[0]);let length=0,lo=null,hi=null;for(const [a,b] of intervals){if(lo===null){lo=a;hi=b}else if(a<=hi)hi=Math.max(hi,b);else{length+=hi-lo;lo=a;hi=b}}if(lo!==null)length+=hi-lo;area+=width*length;
 }return area;
}
function top68Name(c,candidates){
 const key=top68Key(c);if(top68State.names[key])return top68State.names[key];
 const grouped=new Map();for(const f of candidates){if(!grouped.has(f.group))grouped.set(f.group,[]);grouped.get(f.group).push(f.rings)}
 let best='',max=-1;for(const [g,shapes] of [...grouped].sort((a,b)=>a[0].localeCompare(b[0]))){const area=top68UnionArea(shapes,c.ix*500,c.iy*500);if(area>max+1e-6){max=area;best=g}}
 const prefixes={'SANTA ANA':'San','SANTA ANA II':'SNT','PATRIA':'Pat','VALLARTA':'Vall','AMPLIACION SOLARES 2':'Sol','SOLARES':'Sol'};
 // Pareja de índices UTM: identidad inequívoca, independiente del ranking.
 const name=(prefixes[best]||'Q')+'-'+c.ix+'-'+c.iy;top68State.names[key]=name;return name;
}
function top68Compute(){
 if(!top68State?.open)return;
 const geometry=top68Geometry(),groups=new Map();let outside=0;
 for(const r of filtered){if(!validPos(r))continue;const c=top68Cell(r),key=top68Key(c);let entry=groups.get(key);if(!entry){const candidates=geometry.filter(f=>gridTouches(c.ix*500,c.iy*500,f.rings));if(!candidates.length){outside++;continue}entry={...c,key,name:top68Name(c,candidates),n:0,clients:0};groups.set(key,entry)}entry.n++;entry.clients+=r.clients}
 top68State.rows=[...groups.values()].sort((a,b)=>b.n-a.n||a.key.localeCompare(b.key)).slice(0,10);
 top68State.outside=outside;top68State.invalid=filtered.filter(r=>!validPos(r)).length;
 try{localStorage.setItem('primavera_top10_names_v68',JSON.stringify(top68State.names))}catch(e){console.warn('No se pudieron persistir los nombres de Top 10',e)}
}
function top68MapRows(rows){if(!top68State?.open||!top68State.only)return rows;const keys=new Set(top68State.rows.map(r=>r.key));return rows.filter(r=>validPos(r)&&keys.has(top68Key(top68Cell(r))))}
function top68StyleCells(){if(!top68State?.open)return;const keys=new Set(top68State.rows.map(r=>r.key)),remove=[];cells.eachLayer(layer=>{const key=layer._coverageGridKey;if(keys.has(key)){layer.setStyle({color:'#9463BB',weight:key===top68State.selected?7:5.5,fillOpacity:key===top68State.selected ? .18 : .13});layer.bringToFront()}else if(top68State.only)remove.push(layer)});remove.forEach(l=>cells.removeLayer(l))}
function top68Refresh(){if(!top68State?.open)return;const rows=top68State.rows;
 $('top68Summary').textContent=`Filtros activos · ${rows.length} cuadrantes · Clientes: suma por evento. ${top68State.invalid||0} folios sin coordenadas válidas; ${top68State.outside||0} fuera de la cuadrícula de cobertura.`;
 $('top68Table').innerHTML=rows.length?`<table><thead><tr><th>Cuadrante</th><th>Masivos</th><th>Clientes afectados</th><th>Descargar</th></tr></thead><tbody>${rows.map((r,i)=>`<tr data-top68-key="${esc(r.key)}" aria-selected="${r.key===top68State.selected}"><td><button type="button" class="top68Select" data-top68-key="${esc(r.key)}">${i+1}. ${esc(r.name)}</button></td><td>${fmt(r.n)}</td><td>${fmt(r.clients)}</td><td data-top70-download><label class="top70CheckLabel" data-top70-download><input type="checkbox" data-top70-check="${esc(r.key)}" aria-label="Descargar ${esc(r.name)}" ${top70Selection().has(r.key)?'checked':''}></label></td></tr>`).join('')}</tbody></table>`:'<p>No hay masivos en cuadrantes de cobertura con los filtros actuales.</p>';
 $('top68Only').setAttribute('aria-pressed',String(top68State.only));
 top70Sync();
}
function top68CoverageChanged(){if(!top68State)return;top68State.features=null;if(top68State.open)render()}
function top68Close(){top68State.open=false;top68State.only=false;top68State.selected=null;$('top68Window').hidden=true;$('v59Top10').setAttribute('aria-expanded','false');$('v59Top10').setAttribute('aria-pressed','false');window.primaveraCoverageTop10Hidden?.(false);render()}
try{const saved=JSON.parse(localStorage.getItem('primavera_top10_names_v68')||'{}');if(saved&&typeof saved==='object'&&!Array.isArray(saved))top68State.names=saved}catch(e){}
$('v59Top10').addEventListener('click',()=>{if(top68State.open){top68Close();return}top68State.open=true;$('top68Window').hidden=false;$('v59Top10').setAttribute('aria-expanded','true');$('v59Top10').setAttribute('aria-pressed','true');render();requestAnimationFrame(pe84ClampWindow);$('top68Close').focus()});
$('top68Close').addEventListener('click',top68Close);
$('top68Only').addEventListener('click',()=>{top68State.only=!top68State.only;window.primaveraCoverageTop10Hidden?.(top68State.only);render()});
$('top68Table').addEventListener('click',e=>{if(e.target.closest('[data-top70-download]'))return;const b=e.target.closest('[data-top68-key]');if(!b)return;const r=top68State.rows.find(r=>r.key===b.dataset.top68Key);if(!r)return;top68State.selected=r.key;const x=r.ix*500,y=r.iy*500;map.fitBounds(L.latLngBounds([[x,y],[x+500,y],[x+500,y+500],[x,y+500]].map(p=>gridLatLon(...p))),{padding:[25,25],maxZoom:17});render()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&top68State.open)top68Close()});

// V-70: selección de descarga independiente de la selección/navegación del mapa.
function top70Selection(){if(!top68State.downloadKeys)top68State.downloadKeys=new Set();return top68State.downloadKeys}
function top70Sync(){
 const keys=top70Selection(),valid=new Set(top68State.rows.map(r=>r.key));for(const key of keys)if(!valid.has(key))keys.delete(key);
 const count=top68State.rows.filter(r=>keys.has(r.key)).length,all=$('top70All');all.checked=count>0&&count===top68State.rows.length;all.indeterminate=count>0&&count<top68State.rows.length;all.disabled=!top68State.rows.length;
 document.querySelectorAll('#top68Table input[data-top70-check]').forEach(input=>{input.checked=keys.has(input.dataset.top70Check)});
 $('top70Download').disabled=!count||!!top68State.exportBusy;$('top70Count').textContent=`${count} de ${top68State.rows.length} seleccionados`;
}
function top70Xml(value){return String(value??'').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]))}
function top70Color(hex,alpha=1){const color=String(hex).replace('#','');if(!/^[a-f\d]{6}$/i.test(color))throw Error('Color de exportación inválido');return Math.round(alpha*255).toString(16).padStart(2,'0')+color.slice(4,6)+color.slice(2,4)+color.slice(0,2)}
function top70Fields(r){return [['Folio',r.folio],['Fecha',r.date],['Periodo',periodLabel(periodKey(r.date))],['Clúster',r.cluster],['OLT',r.olt],['Causa',r.cause],['Clientes afectados',r.clients],['TTR',durationText(r.ttr)],['TTA',durationText(r.tta??null)],['TTP',durationText(r.ttp??null)],['Estatus',r.status],['Proveedor',r.provider],['Puertos afectados',r.ports],['Latitud',r.lat],['Longitud',r.lon]]}
function top70Description(fields){return top70Xml('<table>'+fields.map(([label,value])=>'<tr><th>'+top70Xml(label)+'</th><td>'+top70Xml(value)+'</td></tr>').join('')+'</table>')}
function top70Data(fields){return '<ExtendedData>'+fields.map(([label,value])=>`<Data name="${top70Xml(label)}"><value>${top70Xml(value)}</value></Data>`).join('')+'</ExtendedData>'}
function top70Snapshot(){
 const wanted=top70Selection(),chosen=top68State.rows.filter(r=>wanted.has(r.key)),byCell=new Map(chosen.map(c=>[c.key,{...c,records:[],style:{color:'#9463BB',weight:5.5,fillOpacity:.13}}]));
 cells.eachLayer(layer=>{const c=byCell.get(layer._coverageGridKey);if(c&&layer.options)c.style={color:layer.options.color||'#9463BB',weight:layer.options.weight??5.5,fillOpacity:layer.options.fillOpacity??.13}});
 for(const r of filtered){if(!validPos(r))continue;const c=byCell.get(top68Key(top68Cell(r)));if(c)c.records.push({...r,exportColor:periodColors.get(periodKey(r.date))||'#e02020',exportFields:top70Fields(r)})}
 return [...byCell.values()];
}
function top70Kml(snapshot,iconHref){
 const styles=new Map();for(const c of snapshot)for(const r of c.records)if(!styles.has(r.exportColor))styles.set(r.exportColor,'marker'+styles.size);
 const markerStyles=[...styles].map(([color,id])=>`<Style id="${id}"><IconStyle><color>${top70Color(color)}</color><scale>0.8</scale><Icon><href>${top70Xml(iconHref)}</href></Icon><hotSpot x="0.5" y="0.5" xunits="fraction" yunits="fraction"/></IconStyle><LabelStyle><scale>0</scale></LabelStyle></Style>`).join('');
 const folders=snapshot.map(c=>{
  const x=c.ix*500,y=c.iy*500,coords=[[x,y],[x+500,y],[x+500,y+500],[x,y+500],[x,y]].map(p=>{const [lat,lon]=gridLatLon(...p);return `${lon},${lat},0`}).join(' ');
  const fields=[['Cuadrante',c.name],['Masivos',c.records.length],['Clientes afectados',c.records.reduce((n,r)=>n+r.clients,0)]];
  const polygon=`<Placemark><name>${top70Xml(c.name)}</name><description>${top70Description(fields)}</description><Style><LineStyle><color>${top70Color(c.style.color)}</color><width>${c.style.weight}</width></LineStyle><PolyStyle><color>${top70Color(c.style.color,c.style.fillOpacity)}</color><fill>1</fill><outline>1</outline></PolyStyle></Style>${top70Data(fields)}<Polygon><tessellate>1</tessellate><altitudeMode>clampToGround</altitudeMode><outerBoundaryIs><LinearRing><coordinates>${coords}</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>`;
  const markers=c.records.map(r=>`<Placemark><name>${top70Xml('Folio '+r.folio)}</name><description>${top70Description(r.exportFields)}</description><styleUrl>#${styles.get(r.exportColor)}</styleUrl>${top70Data(r.exportFields)}<Point><altitudeMode>clampToGround</altitudeMode><coordinates>${r.lon},${r.lat},0</coordinates></Point></Placemark>`).join('');
  return `<Folder><name>${top70Xml(c.name)}</name>${polygon}<Folder><name>Masivos (${c.records.length})</name>${markers}</Folder></Folder>`;
 }).join('');
 return `<?xml version="1.0" encoding="UTF-8"?><kml xmlns="http://www.opengis.net/kml/2.2"><Document><name>Planta Externa · Top 10</name><description>Cuadrantes seleccionados y folios que cumplen los filtros al exportar. Clientes: suma por evento.</description>${markerStyles}${folders}</Document></kml>`;
}
function top70WhiteIcon(){const canvas=document.createElement('canvas');canvas.width=32;canvas.height=32;const context=canvas.getContext('2d');if(!context)throw Error('No se pudo generar el icono KMZ');context.fillStyle='#ffffff';context.beginPath();context.arc(16,16,11,0,Math.PI*2);context.fill();return canvas.toDataURL('image/png').split(',')[1]}
async function top70Download(){
 if(top68State.exportBusy)return;const snapshot=top70Snapshot();if(!snapshot.length){alert('Selecciona al menos un cuadrante para descargar.');return}
 const format=$('top70Format').value;top68State.exportBusy=true;top70Sync();$('top70Status').textContent='Preparando descarga…';
 try{
  let blob;
  if(format==='kmz'){
   if(!window.JSZip)throw Error('No se cargó el generador KMZ. Revisa la conexión o utiliza KML.');
   const zip=new JSZip();zip.file('doc.kml',top70Kml(snapshot,'icons/masivo.png'));zip.file('icons/masivo.png',top70WhiteIcon(),{base64:true});blob=await zip.generateAsync({type:'blob',mimeType:'application/vnd.google-earth.kmz',compression:'DEFLATE'});
  }else blob=new Blob([top70Kml(snapshot,'https://maps.google.com/mapfiles/kml/shapes/placemark_circle.png')],{type:'application/vnd.google-earth.kml+xml;charset=utf-8'});
  const name=snapshot.length===1?snapshot[0].name:'Top10_'+snapshot.length+'_cuadrantes',url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download='Planta_Externa_'+name+'.'+format;document.body.appendChild(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);
  $('top70Status').textContent=`Archivo generado: ${snapshot.length} cuadrantes · ${snapshot.reduce((n,c)=>n+c.records.length,0)} masivos.`;
 }catch(error){$('top70Status').textContent='No se pudo exportar: '+error.message}
 finally{top68State.exportBusy=false;top70Sync()}
}
$('top70All').addEventListener('change',()=>{const keys=top70Selection();keys.clear();if($('top70All').checked)top68State.rows.forEach(r=>keys.add(r.key));top70Sync()});
$('top68Table').addEventListener('change',e=>{const input=e.target.closest('input[data-top70-check]');if(!input)return;const keys=top70Selection();if(input.checked)keys.add(input.dataset.top70Check);else keys.delete(input.dataset.top70Check);top70Sync()});
$('top70Download').addEventListener('click',top70Download);


// V-84: presentación de cortes, búsqueda y ventana flotante; solo Planta Externa.
// V-85: los marcadores de cortes abren/cierran su ficha con el mismo clic.
function pe85BindPopup(marker,html){
 marker.bindPopup(html,{className:'pe85-cut-popup',maxWidth:340,minWidth:230,closeButton:true});
 // En este punto el único listener click del marcador es el añadido por bindPopup.
 marker.off('click');marker.on('click',()=>{if(marker.isPopupOpen())marker.closePopup();else marker.openPopup()});
 return marker;
}
function pe84Popup(r){
 const value=v=>v===null||v===undefined||String(v).trim()===''?'Sin información':String(v);
 const pos=validPos(r),pair=pos?`${r.lat},${r.lon}`:'',encoded=encodeURIComponent(pair);
 const coord=pos?`<a class="pe85-coordinate-link" href="https://www.google.com/maps/search/?api=1&amp;query=${encoded}" target="_blank" rel="noopener noreferrer" aria-label="Abrir coordenadas en Google Maps">${esc(pair)}</a>`:'Sin información';
 const fields=[['FOLIO',esc(value(r.folio))],['QR',esc(value(r.qr))],['COORDENADAS',coord],['CLÚSTER',esc(value(r.cluster))],['CAUSA',esc(value(r.cause))],['CLIENTES AFECTADOS',esc(value(r.clients))],['OLT/SEGMENTO',esc(value(r.olt))]];
 return `<div class="v57-folio"><span class="v57-dot" style="background:${periodColors.get(periodKey(r.date))||'#e02020'}"></span><div><dl class="pe84-cut-fields">${fields.map(([k,v],i)=>`<div class="pe85-field ${i>=2&&i<=4?'pe85-wide':''}"><dt>${k}:</dt><dd>${v}</dd></div>`).join('')}</dl><small>Fecha: ${esc(value(r.date))} · TTR: ${durationText(r.ttr)}</small></div></div>`;
}
function pe84Coords(q){const m=q.trim().match(/^([+-]?\d+(?:\.\d+)?)\s*(?:,|;|\s)\s*([+-]?\d+(?:\.\d+)?)$/);if(!m)return null;const r={lat:Number(m[1]),lon:Number(m[2])};return validPos(r)?r:null}
function pe84ClearMarker(){if(pe84SearchMarker&&map)map.removeLayer(pe84SearchMarker);pe84SearchMarker=null}
function pe84Focus(r){
 pe84ClearMarker();selectTab('map');map.setView([r.lat,r.lon],17);let found=null;
 points.eachLayer(marker=>{if(marker._pe84Rows?.includes(r))found=marker});
 if(found)found.openPopup();else pe84SearchMarker=pe85BindPopup(L.marker([r.lat,r.lon]).addTo(map),`<div class="v57-popup">${pe84Popup(r)}</div>`).openPopup();
}
function pe84Search(){
 const q=$('pe84Search').value.trim(),output=$('pe84Results');output.replaceChildren();pe84ClearMarker();
 if(!q){output.textContent='Escribe un folio o coordenadas.';return}
 const coord=pe84Coords(q);if(coord){selectTab('map');map.setView([coord.lat,coord.lon],17);pe84SearchMarker=L.marker([coord.lat,coord.lon]).addTo(map).bindPopup(`Coordenadas: ${coord.lat}, ${coord.lon}`).openPopup();output.textContent='Coordenadas localizadas.';return}
 const match=r=>String(r.folio).trim().toLowerCase()===q.toLowerCase(),all=records.filter(match),rows=top68MapRows(filtered).filter(match),located=rows.filter(validPos);
 if(!rows.length){output.textContent=all.length?'Folio encontrado en el histórico, pero fuera de los filtros o de la vista exclusiva Top 10.':'Folio no encontrado en la base.';return}
 if(!located.length){output.textContent='Folio encontrado, sin coordenadas válidas.';return}
 pe84Focus(located[0]);output.textContent=located.length===1?'Folio localizado.':`${located.length} coincidencias. Elige una ubicación: `;
 if(located.length>1){const list=document.createElement('select');list.setAttribute('aria-label','Resultados por folio');located.forEach((r,i)=>{const option=document.createElement('option');option.value=String(i);option.textContent=`${r.folio} · ${r.cluster} · ${r.date} · ${r.lat}, ${r.lon}`;list.appendChild(option)});list.addEventListener('change',()=>pe84Focus(located[Number(list.value)]));output.appendChild(list)}
}
$('pe84SearchGo').addEventListener('click',pe84Search);
$('pe84Search').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();pe84Search()}});
$('pe84SearchClear').addEventListener('click',()=>{pe84ClearMarker();map.closePopup();$('pe84Search').value='';$('pe84Results').replaceChildren()});
const pe84Window=$('top68Window');
const pe84Body=document.createElement('div');pe84Body.className='pe84-window-body';while(pe84Window.firstChild)pe84Body.appendChild(pe84Window.firstChild);pe84Window.appendChild(pe84Body);
function pe84ClampWindow(){
 if(pe84Window.hidden)return;const r=pe84Window.getBoundingClientRect(),margin=8;
 const w=Math.min(r.width,Math.max(1,innerWidth-margin*2)),h=Math.min(r.height,Math.max(1,innerHeight-margin*2));
 Object.assign(pe84Window.style,{right:'auto',bottom:'auto',width:w+'px',height:h+'px',left:Math.max(margin,Math.min(r.left,innerWidth-w-margin))+'px',top:Math.max(margin,Math.min(r.top,innerHeight-h-margin))+'px'});
}
function pe84WindowBox(r,dx,dy,edge,vw,vh){
 const minW=Math.min(290,vw-16),minH=Math.min(240,vh-16);let left=r.left,top=r.top,width=r.width,height=r.height;
 if(!edge){left=Math.max(8,Math.min(r.left+dx,vw-width-8));top=Math.max(8,Math.min(r.top+dy,vh-height-8))}
 else{if(edge.includes('e'))width=Math.max(minW,Math.min(r.width+dx,vw-left-8));if(edge.includes('s'))height=Math.max(minH,Math.min(r.height+dy,vh-top-8));if(edge.includes('w')){left=Math.max(8,Math.min(r.left+dx,r.left+r.width-minW));width=r.width+r.left-left}if(edge.includes('n')){top=Math.max(8,Math.min(r.top+dy,r.top+r.height-minH));height=r.height+r.top-top}}
 return {left,top,width,height};
}
let pe84Gesture=null;
for(const edge of ['n','s','e','w','ne','nw','se','sw']){const grip=document.createElement('span');grip.className='pe84-grip pe84-'+edge;grip.dataset.pe84Edge=edge;grip.setAttribute('aria-hidden','true');pe84Window.appendChild(grip)}
pe84Window.addEventListener('pointerdown',e=>{
 if(e.button!==0||e.isPrimary===false)return;const edge=e.target.closest('[data-pe84-edge]')?.dataset.pe84Edge;
 if(!edge&&e.target.closest('button,a,input,select,textarea,label,table,[role=button]'))return;
 pe84ClampWindow();pe84Gesture={id:e.pointerId,x:e.clientX,y:e.clientY,rect:pe84Window.getBoundingClientRect(),edge};pe84Window.setPointerCapture(e.pointerId);pe84Window.classList.add('pe84-moving');e.preventDefault();
});
pe84Window.addEventListener('pointermove',e=>{if(!pe84Gesture||e.pointerId!==pe84Gesture.id)return;const g=pe84Gesture,b=pe84WindowBox(g.rect,e.clientX-g.x,e.clientY-g.y,g.edge,innerWidth,innerHeight);for(const key of ['left','top','width','height'])pe84Window.style[key]=b[key]+'px'});
function pe84EndGesture(e){if(!pe84Gesture||e.pointerId!==pe84Gesture.id)return;pe84Gesture=null;pe84Window.classList.remove('pe84-moving');if(pe84Window.hasPointerCapture(e.pointerId))pe84Window.releasePointerCapture(e.pointerId)}
pe84Window.addEventListener('pointerup',pe84EndGesture);pe84Window.addEventListener('pointercancel',pe84EndGesture);pe84Window.addEventListener('lostpointercapture',()=>{pe84Gesture=null;pe84Window.classList.remove('pe84-moving')});window.addEventListener('resize',pe84ClampWindow);

})();

/* V-59: refrescar tamaño de Leaflet al redimensionar contenedor, sin cambiar geometrías. */
if(typeof ResizeObserver!=="undefined" && typeof map!=="undefined" && map){const v59Resize=new ResizeObserver(()=>{if(map && map.getContainer().offsetWidth && map.getContainer().offsetHeight)map.invalidateSize({pan:false});});v59Resize.observe(document.getElementById("map"));}
