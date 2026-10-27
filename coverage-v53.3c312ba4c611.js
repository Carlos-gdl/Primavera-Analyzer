/* V-53: módulo independiente de visualización de coberturas KMZ/KML. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const groups=['PATRIA','SANTA ANA','SANTA ANA II','VALLARTA','AMPLIACION SOLARES 2','SOLARES'];
const colors=['#DB7138','#D15C81','#20B8A5','#E2A032','#B76B4B','#A97D48'];
let map,features=[],active=new Set(),shown=false,layer,hideTimer=null,coverageReady=Promise.resolve(),uploadBusy=false;
window.primaveraCoverageShapes=()=>features.flatMap(f=>f.shapes);
// V-68: consultas y ocultación temporal exclusivas del Top 10; sin alterar active ni persistencia.
let top68Hidden=false;
window.primaveraCoverageFeatures=()=>features.map(f=>({group:f.group,shapes:f.shapes}));
window.primaveraCoverageTop10Hidden=value=>{top68Hidden=!!value;draw()};
function notifyGrid(shapes){window.dispatchEvent(new CustomEvent('primavera:coverage-updated',{detail:{shapes}}))}
function hideMenu(){shown=false;clearTimeout(hideTimer);$('coverageMenu').classList.add('hidden');$('coverageToggle').setAttribute('aria-expanded','false')}
function scheduleHide(){clearTimeout(hideTimer);if(shown)hideTimer=setTimeout(hideMenu,3000)}
const DB_NAME='primavera_coverage_v55', DB_STORE='coverage', DB_KEY='current';
function openCoverageDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function coverageRead(){const db=await openCoverageDb();try{return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly');const r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error)})}finally{db.close()}}
async function coverageSave(value){const db=await openCoverageDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Almacenamiento interrumpido'))})}finally{db.close()}}
function boundsFor(indices){if(!map||!indices.length)return;const bounds=L.latLngBounds([]);for(const i of indices){const f=features[i];if(!f)continue;for(const shape of f.shapes)for(const ring of shape)for(const pair of ring){if(Array.isArray(pair)&&pair.length>=2&&Number.isFinite(pair[0])&&Number.isFinite(pair[1]))bounds.extend(pair)}}if(bounds.isValid())map.fitBounds(bounds,{padding:[28,28],maxZoom:16,animate:true})}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();
function identify(name,folder){const f=norm(folder),n=norm(name);if(f==='COBERTURA'&&n==='SOLARES')return 'SOLARES';if(groups.includes(f))return f;if(n.includes('SANTA ANA II'))return 'SANTA ANA II';if(n.includes('SANTA ANA'))return 'SANTA ANA';if(n.includes('PATRIA'))return 'PATRIA';if(n.includes('VALLARTA'))return 'VALLARTA';if(n.includes('SOLARES 2'))return 'AMPLIACION SOLARES 2';if(n==='SOLARES')return 'SOLARES';return null}
function parseCoords(t){return (t||'').trim().split(/\s+/).map(x=>x.split(',').map(Number)).filter(x=>x.length>=2&&Number.isFinite(x[0])&&Number.isFinite(x[1])).map(x=>[x[1],x[0]])}
function parseKml(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('El KML contiene XML inválido');const result=[];const folders=[...doc.getElementsByTagName('Folder')];function directName(node){return [...node.children].find(x=>x.localName==='name')?.textContent?.trim()||''}const marks=[...doc.getElementsByTagName('Placemark')];for(const mark of marks){let folder='',p=mark.parentElement;while(p&&p!==doc.documentElement){if(p.localName==='Folder'){folder=directName(p);break}p=p.parentElement}const name=directName(mark)||'Sin nombre';if(norm(name).startsWith('RT'))continue;const group=identify(name,folder);if(!group)continue;const polygons=[...mark.getElementsByTagName('Polygon')];const shapes=[];for(const poly of polygons){const outer=poly.getElementsByTagName('outerBoundaryIs')[0];const c=outer?.getElementsByTagName('coordinates')[0];const ring=parseCoords(c?.textContent);if(ring.length<3)continue;const holes=[...poly.getElementsByTagName('innerBoundaryIs')].map(h=>parseCoords(h.getElementsByTagName('coordinates')[0]?.textContent)).filter(h=>h.length>=3);shapes.push([ring,...holes])}if(shapes.length)result.push({name,group,shapes})}if(!result.length)throw Error('No se encontraron polígonos de cobertura válidos');return result}
function draw(){if(!layer)return;layer.clearLayers();if(top68Hidden)return;for(let i=0;i<features.length;i++){if(!active.has(i))continue;const f=features[i],color=colors[groups.indexOf(f.group)];for(const shape of f.shapes)L.polygon(shape,{pane:'coverageV53',color,weight:2.4,opacity:.95,fillColor:color,fillOpacity:.28,interactive:false}).addTo(layer)}}
function updateButtons(){document.querySelectorAll('.coverage-master').forEach(b=>{const indices=features.map((f,i)=>f.group===b.dataset.group?i:-1).filter(i=>i>=0);const count=indices.filter(i=>active.has(i)).length;b.classList.toggle('all',count>0&&count===indices.length);b.classList.toggle('partial',count>0&&count<indices.length);b.setAttribute('aria-pressed',String(count===indices.length&&count>0))});document.querySelectorAll('.coverage-option').forEach(b=>{const indices=b.dataset.indices.split(',').map(Number);const on=indices.every(i=>active.has(i));b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.textContent=(on?'● ':'○ ')+b.dataset.name})}
function toggle(indices){const on=indices.every(i=>active.has(i));indices.forEach(i=>on?active.delete(i):active.add(i));updateButtons();draw();if(!on)boundsFor(indices)}
function menu(){const root=$('coverageGroups');root.replaceChildren();for(let k=0;k<groups.length;k++){const g=groups[k],indices=features.map((f,i)=>f.group===g?i:-1).filter(i=>i>=0);if(!indices.length)continue;const wrapper=document.createElement('div');wrapper.className='coverage-group';const master=document.createElement('button');master.className='coverage-master';master.type='button';master.dataset.group=g;master.style.background=`linear-gradient(#ffffff20,transparent),${colors[k]}`;master.textContent=g;master.title='Clic: encender o apagar todo el clúster; pasar el cursor: elegir polígono';master.addEventListener('click',()=>toggle(indices));const sub=document.createElement('div');sub.className='coverage-submenu';const byName=new Map();indices.forEach(i=>{const name=features[i].name;if(!byName.has(name))byName.set(name,[]);byName.get(name).push(i)});for(const [name,ids] of byName){const b=document.createElement('button');b.type='button';b.className='coverage-option';b.dataset.name=name;b.dataset.indices=ids.join(',');b.addEventListener('click',()=>toggle(ids));sub.append(b)}wrapper.append(master,sub);root.append(wrapper)}updateButtons()}
function status(t,n){$('coverageProgress').classList.remove('hidden');$('coverageProgressText').textContent=t;$('coverageProgressBar').value=n}
// V-67: identidad geométrica exacta, independiente del nombre y orden de anillos.
function ringKey(ring){
 const points=ring.map(p=>JSON.stringify([p[0]===0?0:p[0],p[1]===0?0:p[1]]));
 while(points.length>1&&points[0]===points[points.length-1])points.pop();
 const variants=[];
 for(const sequence of [points,[...points].reverse()]){
  const minimum=[...sequence].sort()[0];
  sequence.forEach((p,i)=>{if(p===minimum)variants.push(sequence.slice(i).concat(sequence.slice(0,i)).join(';'))});
 }
 return variants.sort()[0]||'';
}
function shapeKey(shape){return JSON.stringify([ringKey(shape[0]),shape.slice(1).map(ringKey).sort()])}
function mergeCoverage(existing,incoming){
 const seen=new Set(existing.flatMap(f=>f.shapes.map(shapeKey))),added=[];let duplicates=0;
 for(const f of incoming){const shapes=[];for(const shape of f.shapes){const key=shapeKey(shape);if(seen.has(key)){duplicates++;continue}seen.add(key);shapes.push(shape)}if(shapes.length)added.push({...f,shapes})}
 return {features:existing.concat(added),added,duplicates,newCount:added.reduce((n,f)=>n+f.shapes.length,0)};
}
async function upload(file){
 if(!file||uploadBusy)return;uploadBusy=true;
 try{
  await coverageReady;
  status(`Leyendo ${file.name}...`,10);let xml;
  if(/\.kmz$/i.test(file.name)){if(!window.JSZip)throw Error('No se pudo cargar el lector KMZ (JSZip)');const zip=await JSZip.loadAsync(file);const entry=Object.values(zip.files).find(f=>!f.dir&&/\.kml$/i.test(f.name));if(!entry)throw Error('El KMZ no contiene un archivo KML');status('Extrayendo geometrías...',45);xml=await entry.async('string')}
  else if(/\.kml$/i.test(file.name))xml=await file.text();else throw Error('Formato no admitido: utiliza KMZ o KML');
  status('Comparando polígonos con las coberturas guardadas...',75);
  const result=mergeCoverage(features,parseKml(xml));
  if(result.newCount){
   status('Guardando coberturas acumuladas...',90);
   await coverageSave({features:result.features,filename:file.name,savedAt:new Date().toISOString()});
   const firstNew=features.length;features=result.features;
   for(let i=firstNew;i<features.length;i++)active.add(i);
   menu();draw();notifyGrid(result.added.flatMap(f=>f.shapes));$('coverageToggle').disabled=false;
  }
  const message=`${result.newCount} manchas nuevas · ${result.duplicates} repetidas omitidas · ${features.reduce((n,f)=>n+f.shapes.length,0)} polígonos en total`;
  status(message,100);alert(message);
 }catch(e){status(`Error: ${e.message}`,0);alert(`No se pudo cargar la cobertura: ${e.message}`)}
 finally{uploadBusy=false;$('coverageProgress').classList.add('hidden')}
}

window.initCoverageV53=function(leafletMap){map=leafletMap;map.createPane('coverageV53');map.getPane('coverageV53').style.zIndex='350';map.getPane('coverageV53').style.pointerEvents='none';layer=L.layerGroup().addTo(map);$('coverageFile').addEventListener('change',e=>{upload(e.target.files?.[0]);e.target.value=''});$('coverageToggle').addEventListener('click',e=>{e.stopPropagation();if(!features.length)return;if(shown){hideMenu()}else{shown=true;$('coverageToggle').setAttribute('aria-expanded','true');$('coverageMenu').classList.remove('hidden');scheduleHide()}});const coverageMenu=$('coverageMenu');['pointermove','pointerdown','click','keydown','focusin','touchstart'].forEach(event=>coverageMenu.addEventListener(event,scheduleHide));document.addEventListener('pointerdown',e=>{if(shown&&!coverageMenu.contains(e.target)&&!$('coverageToggle').contains(e.target))hideMenu()});$('coverageClear').addEventListener('click',()=>{active.clear();updateButtons();draw()});
coverageReady=coverageRead().then(saved=>{if(!saved||!Array.isArray(saved.features)||!saved.features.length)return;if(features.length)return;features=saved.features;active=new Set();hideMenu();menu();draw();notifyGrid();$('coverageToggle').disabled=false;$('coverageToggle').setAttribute('aria-expanded','false');$('coverageMenu').classList.add('hidden')}).catch(err=>{console.warn('No se pudieron recuperar las coberturas guardadas:',err);throw err});coverageReady.catch(()=>{})};
})();
