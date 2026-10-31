/* V-53: módulo independiente de visualización de coberturas KMZ/KML. */
(()=>{'use strict';
const $=id=>document.getElementById(id);
const groups=['PATRIA','SANTA ANA','SANTA ANA II','VALLARTA','AMPLIACION SOLARES 2','SOLARES'];
const colors=['#DB7138','#D15C81','#20B8A5','#E2A032','#B76B4B','#A97D48'];
let map,features=[],active=new Set(),shown=false,layer,hideTimer=null,coverageReady=Promise.resolve(),uploadBusy=false;
function hideMenu(){shown=false;clearTimeout(hideTimer);$('rp24-coverageMenu').classList.add('hidden');$('rp24-coverageToggle').setAttribute('aria-expanded','false');$('rp24-coverageToggle').setAttribute('aria-pressed','false')}
function scheduleHide(){clearTimeout(hideTimer);if(shown&&!$('rp24-coverageMenu').classList.contains('rp25-dragging'))hideTimer=setTimeout(hideMenu,3000)}
// Nombre fijo exclusivo de Repeat. No depende de la carpeta ni de la versión.
const DB_NAME='primavera_repeat_coverage', DB_STORE='coverage', DB_KEY='current';
const LEGACY_PREFIX='primavera_repeat_coverage_v24:';
function openCoverageDb(name=DB_NAME,create=true){return new Promise((resolve,reject)=>{
 const req=indexedDB.open(name,1);let absent=false;
 req.onupgradeneeded=()=>{if(!create){absent=true;req.transaction.abort();return}if(!req.result.objectStoreNames.contains(DB_STORE))req.result.createObjectStore(DB_STORE)};
 req.onsuccess=()=>resolve(req.result);req.onerror=()=>absent?resolve(null):reject(req.error);
 req.onblocked=()=>reject(Error('Cierra las otras pestañas de Repeat y vuelve a abrir el módulo.'));
})}
async function readCoverageDbV210(name,create=false){const db=await openCoverageDb(name,create);if(!db)return null;try{if(!db.objectStoreNames.contains(DB_STORE))return null;return await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readonly'),r=tx.objectStore(DB_STORE).get(DB_KEY);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);tx.onabort=()=>reject(tx.error||Error('Lectura interrumpida'))})}finally{db.close()}}
const hasCoverageV210=s=>!!(s&&Array.isArray(s.features)&&s.features.length);
async function coverageRead(){
 const saved=await readCoverageDbV210(DB_NAME,true);if(hasCoverageV210(saved))return saved;
 // Primero la copia de esta ruta; después otras rutas antiguas del mismo origen.
 const current=LEGACY_PREFIX+location.pathname.replace(/[^/]*$/,'');
 let legacy=await readCoverageDbV210(current);
 if(!hasCoverageV210(legacy)&&typeof indexedDB.databases==='function'){
  let names=[];try{names=(await indexedDB.databases()).map(d=>d.name).filter(n=>n&&n.startsWith(LEGACY_PREFIX)&&n!==current)}catch(e){console.warn('No se pudieron enumerar las copias anteriores de Repeat:',e)}
  const copies=[];for(const name of names){const value=await readCoverageDbV210(name);if(hasCoverageV210(value))copies.push(value)}
  if(copies.length){const signature=JSON.stringify(copies[0].features);if(copies.every(c=>JSON.stringify(c.features)===signature))legacy=copies[0];else alert('Se encontraron varias coberturas anteriores de Repeat diferentes. Carga el KMZ que deseas utilizar una vez para guardarlo sin depender de la carpeta. Las copias anteriores no se borraron.')}
 }
 if(!hasCoverageV210(legacy))return null;
 const migrated={...legacy,migratedFromLegacy:true};delete migrated.active;
 await coverageSave(migrated);return migrated;
}
async function coverageSave(value){const db=await openCoverageDb();try{await new Promise((resolve,reject)=>{const tx=db.transaction(DB_STORE,'readwrite');tx.objectStore(DB_STORE).put(value,DB_KEY);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Almacenamiento interrumpido'))})}finally{db.close()}}

function boundsFor(indices){if(!map||!indices.length)return;const bounds=L.latLngBounds([]);for(const i of indices){const f=features[i];if(!f)continue;for(const shape of f.shapes)for(const ring of shape)for(const pair of ring){if(Array.isArray(pair)&&pair.length>=2&&Number.isFinite(pair[0])&&Number.isFinite(pair[1]))bounds.extend(pair)}}if(bounds.isValid())map.fitBounds(bounds,{padding:[28,28],maxZoom:16,animate:true})}

const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
const norm=s=>String(s||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toUpperCase().replace(/_/g,' ').replace(/\s+/g,' ').trim();
function identify(name,folder){const f=norm(folder),n=norm(name);if(f==='COBERTURA'&&n==='SOLARES')return 'SOLARES';if(groups.includes(f))return f;if(n.includes('SANTA ANA II'))return 'SANTA ANA II';if(n.includes('SANTA ANA'))return 'SANTA ANA';if(n.includes('PATRIA'))return 'PATRIA';if(n.includes('VALLARTA'))return 'VALLARTA';if(n.includes('SOLARES 2'))return 'AMPLIACION SOLARES 2';if(n==='SOLARES')return 'SOLARES';return null}
function parseCoords(t){return (t||'').trim().split(/\s+/).map(x=>x.split(',').map(Number)).filter(x=>x.length>=2&&Number.isFinite(x[0])&&Number.isFinite(x[1])&&Math.abs(x[0])<=180&&Math.abs(x[1])<=90).map(x=>[x[1],x[0]])}
function parseKml(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('El KML contiene XML inválido');const result=[];const folders=[...doc.getElementsByTagName('Folder')];function directName(node){return [...node.children].find(x=>x.localName==='name')?.textContent?.trim()||''}const marks=[...doc.getElementsByTagName('Placemark')];for(const mark of marks){let folder='',p=mark.parentElement;while(p&&p!==doc.documentElement){if(p.localName==='Folder'){folder=directName(p);break}p=p.parentElement}const name=directName(mark)||'Sin nombre';if(norm(name).startsWith('RT'))continue;const group=identify(name,folder);if(!group)continue;const polygons=[...mark.getElementsByTagName('Polygon')];const shapes=[];for(const poly of polygons){const outer=poly.getElementsByTagName('outerBoundaryIs')[0];const c=outer?.getElementsByTagName('coordinates')[0];const ring=parseCoords(c?.textContent);if(ring.length<3)continue;const holes=[...poly.getElementsByTagName('innerBoundaryIs')].map(h=>parseCoords(h.getElementsByTagName('coordinates')[0]?.textContent)).filter(h=>h.length>=3);shapes.push([ring,...holes])}if(shapes.length)result.push({name,group,shapes})}if(!result.length)throw Error('No se encontraron polígonos de cobertura válidos');return result}
function draw(){if(!layer)return;layer.clearLayers();for(let i=0;i<features.length;i++){if(!active.has(i))continue;const f=features[i],color=colors[groups.indexOf(f.group)];for(const shape of f.shapes)L.polygon(shape,{pane:'repeatCoverageV24',color,weight:2.4,opacity:.95,fillColor:color,fillOpacity:.28,interactive:false}).addTo(layer)}}
function updateButtons(){const all=$('rp24-all');all.checked=features.length>0&&active.size===features.length;all.indeterminate=active.size>0&&active.size<features.length;document.querySelectorAll('.rp24-coverage-master').forEach(b=>{const indices=features.map((f,i)=>f.group===b.dataset.group?i:-1).filter(i=>i>=0);const count=indices.filter(i=>active.has(i)).length;b.classList.toggle('all',count>0&&count===indices.length);b.classList.toggle('partial',count>0&&count<indices.length);b.setAttribute('aria-pressed',String(count===indices.length&&count>0))});document.querySelectorAll('.rp24-coverage-option').forEach(b=>{const indices=b.dataset.indices.split(',').map(Number);const on=indices.every(i=>active.has(i));b.classList.toggle('active',on);b.setAttribute('aria-pressed',String(on));b.textContent=(on?'● ':'○ ')+b.dataset.name})}
function toggle(indices){const on=indices.every(i=>active.has(i));indices.forEach(i=>on?active.delete(i):active.add(i));updateButtons();draw();if(!on)boundsFor(indices)}
function menu(){const root=$('rp24-coverageGroups');root.replaceChildren();for(let k=0;k<groups.length;k++){const g=groups[k],indices=features.map((f,i)=>f.group===g?i:-1).filter(i=>i>=0);if(!indices.length)continue;const wrapper=document.createElement('div');wrapper.className='rp24-coverage-group';const master=document.createElement('button');master.className='rp24-coverage-master';master.type='button';master.dataset.group=g;master.style.background=`linear-gradient(#ffffff20,transparent),${colors[k]}`;master.textContent=g;master.title='Clic: encender o apagar todo el clúster; pasar el cursor: elegir polígono';master.addEventListener('click',()=>toggle(indices));const sub=document.createElement('div');sub.className='rp24-coverage-submenu';const byName=new Map();indices.forEach(i=>{const name=features[i].name;if(!byName.has(name))byName.set(name,[]);byName.get(name).push(i)});for(const [name,ids] of byName){const b=document.createElement('button');b.type='button';b.className='rp24-coverage-option';b.dataset.name=name;b.dataset.indices=ids.join(',');b.addEventListener('click',()=>toggle(ids));sub.append(b)}wrapper.append(master,sub);root.append(wrapper)}updateButtons()}
function status(t,n){$('rp24-coverageProgress').classList.remove('hidden');$('rp24-coverageProgressText').textContent=t;$('rp24-coverageProgressBar').value=n}
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
   menu();draw();$('rp24-coverageToggle').disabled=false;
  }
  const message=`${result.newCount} manchas nuevas · ${result.duplicates} repetidas omitidas · ${features.reduce((n,f)=>n+f.shapes.length,0)} polígonos en total`;
  status(message,100);alert(message);
 }catch(e){status(`Error: ${e.message}`,0);alert(`No se pudo cargar la cobertura: ${e.message}`)}
 finally{uploadBusy=false;$('rp24-coverageProgress').classList.add('hidden')}
}

window.initRepeatCoverageV24=function(leafletMap){map=leafletMap;map.createPane('repeatCoverageV24');map.getPane('repeatCoverageV24').style.zIndex='350';map.getPane('repeatCoverageV24').style.pointerEvents='none';layer=L.layerGroup().addTo(map);$('rp24-coverageFile').addEventListener('change',e=>{upload(e.target.files?.[0]);e.target.value=''});$('rp24-coverageToggle').addEventListener('click',e=>{e.stopPropagation();if(!features.length)return;if(shown){hideMenu()}else{shown=true;$('rp24-coverageToggle').setAttribute('aria-expanded','true');$('rp24-coverageToggle').setAttribute('aria-pressed','true');$('rp24-coverageMenu').classList.remove('hidden');scheduleHide()}});const menuElement=$('rp24-coverageMenu');['pointermove','pointerdown','click','keydown','focusin','touchstart'].forEach(event=>menuElement.addEventListener(event,scheduleHide));document.addEventListener('pointerdown',e=>{if(shown&&!menuElement.contains(e.target)&&!$('rp24-coverageToggle').contains(e.target))hideMenu()});$('rp24-all').addEventListener('change',e=>{active=e.target.checked?new Set(features.map((_,i)=>i)):new Set();updateButtons();draw()});$('rp24-coverageClear').addEventListener('click',()=>{active.clear();updateButtons();draw()});
coverageReady=coverageRead().then(saved=>{if(!saved||!Array.isArray(saved.features)||!saved.features.length)return;if(features.length)return;features=saved.features;active=new Set();$('rp24-coverageToggle').disabled=false;hideMenu();menu();draw();$('rp24-coverageToggle').setAttribute('aria-expanded','false');$('rp24-coverageMenu').classList.add('hidden')}).catch(err=>{console.error('No se pudieron recuperar las coberturas guardadas:',err);alert('No se pudieron recuperar las coberturas guardadas de Repeat. No es necesario borrarlas. Detalle: '+(err.message||String(err)));throw err});coverageReady.catch(()=>{})};
})();
