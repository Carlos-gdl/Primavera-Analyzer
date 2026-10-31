/* Primavera Analyzer V-46: módulo Clean Up independiente de soportes, base de clientes, Repeat 60 y Planta Externa. */
(()=>{'use strict';
 const byId=id=>document.getElementById(id);
 const DBNAME='primavera_cleanup_v46',STORE='polygons';
 const polygons=new Map(),shown=new Map();
 const group=L.layerGroup().addTo(map);
 let cleanDb=null, selectedStatuses=new Set(['TERMINADOS','EN PROCESO']);
 const escapeHtml=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const colors={'TERMINADOS':'#55ff00','EN PROCESO':'#ffaa00'};
 const statusName=s=>s==='TERMINADOS'?'Terminado':'En proceso';
 const visible=p=>selectedStatuses.has(p.status);
 const idFor=p=>p.status+'\u0000'+p.name;
 function dbOpen(){return new Promise((resolve,reject)=>{const req=indexedDB.open(DBNAME,1);req.onupgradeneeded=()=>req.result.createObjectStore(STORE,{keyPath:'id'});req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
 function dbAll(){return new Promise((resolve,reject)=>{const req=cleanDb.transaction(STORE).objectStore(STORE).getAll();req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
 function dbSave(records){return new Promise((resolve,reject)=>{const tx=cleanDb.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);records.forEach(r=>store.put(r));tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)})}
 function elementChildren(node,name){return [...node.children].filter(e=>e.localName===name)}
 function directText(node,name){const child=elementChildren(node,name)[0];return child?child.textContent.trim():''}
 function coordinates(s){const points=s.trim().split(/\s+/).filter(Boolean).map(x=>x.split(',').map(Number)).map(v=>[v[1],v[0]]);if(points.length<4||points.some(v=>!v.every(Number.isFinite)||Math.abs(v[0])>90||Math.abs(v[1])>180))throw Error('Coordenadas inválidas en un polígono.');return points}
 function parseGeometry(poly){const rings=[];for(const outer of elementChildren(poly,'outerBoundaryIs'))for(const ring of elementChildren(outer,'LinearRing')){const c=directText(ring,'coordinates');if(c)rings.push(coordinates(c))}if(!rings.length)throw Error('Polígono sin contorno exterior.');for(const inner of elementChildren(poly,'innerBoundaryIs'))for(const ring of elementChildren(inner,'LinearRing')){const c=directText(ring,'coordinates');if(c)rings.push(coordinates(c))}return rings}
 function extract(xml){const doc=new DOMParser().parseFromString(xml,'application/xml');if(doc.querySelector('parsererror'))throw Error('El archivo KML contiene XML inválido.');const result=[];
  function visit(node,parents){for(const child of node.children){const tag=child.localName;if(tag==='Folder'||tag==='Document'){const n=directText(child,'name');visit(child,tag==='Folder'?[...parents,n]:parents)}else if(tag==='Placemark'){
    const name=directText(child,'name'), status=parents.map(x=>x.trim().toUpperCase()).reverse().find(x=>x==='TERMINADOS'||x==='EN PROCESO');if(!status)continue;
    const geometries=[...child.getElementsByTagNameNS('*','Polygon')];if(!geometries.length)continue;
    if(!name)throw Error('Hay un polígono sin nombre.');const parts=geometries.map(parseGeometry);
    result.push({id:status+'\u0000'+name,name,status,parts,description:directText(child,'description'),enabled:false});
  }}}
  visit(doc.documentElement,[]);if(!result.length)throw Error('No se encontraron polígonos dentro de carpetas TERMINADOS o EN PROCESO.');
  // Si el archivo repite el mismo nombre/estado, no adivinar qué geometría conservar.
  const keys=new Set();for(const p of result){if(keys.has(p.id))throw Error('El archivo contiene nombres duplicados en el mismo estado: '+p.name);keys.add(p.id)}return result;
 }
 async function readFile(file){if(!/\.(kmz|kml)$/i.test(file.name))throw Error('Selecciona un archivo .kmz o .kml.');if(file.name.toLowerCase().endsWith('.kml'))return file.text();if(typeof JSZip==='undefined')throw Error('No se cargó la librería JSZip para leer KMZ.');const zip=await JSZip.loadAsync(file);const candidates=Object.values(zip.files).filter(f=>!f.dir&&/\.kml$/i.test(f.name));if(!candidates.length)throw Error('El KMZ no contiene archivos KML.');const kml=candidates.find(f=>/(^|\/)doc\.kml$/i.test(f.name))||candidates[0];return kml.async('string')}
 function layerFor(p){const shapes=p.parts.map(rings=>L.polygon(rings,{color:'#111d24',weight:2,fillColor:colors[p.status],fillOpacity:.35,interactive:true}));const layer=L.featureGroup(shapes);layer.bindPopup(()=>{const wrap=document.createElement('div');const strong=document.createElement('strong');strong.textContent=p.name;wrap.append(strong,document.createElement('br'),document.createTextNode(statusName(p.status)));return wrap});return layer}
 function refreshLayers(){for(const [id,l] of shown){if(!polygons.has(id)||!polygons.get(id).enabled||!visible(polygons.get(id))){group.removeLayer(l);shown.delete(id)}}for(const p of polygons.values()){if(p.enabled&&visible(p)&&!shown.has(p.id)){const l=layerFor(p);group.addLayer(l);shown.set(p.id,l)}}}
 function locate(id){const p=polygons.get(id);if(!p)return;p.enabled=true;refreshLayers();renderList();const layer=shown.get(id);if(layer){const bounds=layer.getBounds();if(bounds.isValid())map.fitBounds(bounds,{padding:[35,35],maxZoom:17})}}
 function setOne(id,on,focus){const p=polygons.get(id);if(!p)return;p.enabled=on;refreshLayers();renderList();if(on&&focus)locate(id)}
 function setAll(on){for(const p of polygons.values())if(visible(p))p.enabled=on;refreshLayers();renderList()}
 function makeCheck(p){const c=document.createElement('input');c.type='checkbox';c.checked=p.enabled;c.addEventListener('change',()=>setOne(p.id,c.checked,c.checked));return c}
 function makeLocate(p){const b=document.createElement('button');b.type='button';b.className='mini';b.textContent='Ubicar';b.onclick=()=>locate(p.id);return b}
 function renderList(){const items=[...polygons.values()].filter(visible).sort((a,b)=>a.status.localeCompare(b.status)||a.name.localeCompare(b.name,'es'));
  byId('kImports').textContent=String(polygons.size);byId('cleanupInfo').textContent=polygons.size?`${items.length} polígonos en los estados seleccionados · ${items.filter(x=>x.enabled).length} encendidos. Total almacenado: ${polygons.size}.`:'Carga un KMZ o KML para comenzar.';
  const list=byId('cleanupList'),table=byId('cleanupTable');list.replaceChildren();table.replaceChildren();
  if(!items.length){const t=document.createElement('p');t.className='muted';t.textContent='No hay polígonos para los estados seleccionados.';list.append(t);const tr=document.createElement('tr'),td=document.createElement('td');td.colSpan=4;td.textContent=t.textContent;tr.append(td);table.append(tr);return}
  for(const p of items){const row=document.createElement('div');row.className='cleanup-row';const dot=document.createElement('span');dot.className='cleanup-dot '+(p.status==='TERMINADOS'?'finished':'progress');const label=document.createElement('label');label.append(makeCheck(p),document.createTextNode(' '+p.name));row.append(dot,label,makeLocate(p));list.append(row);
   const tr=document.createElement('tr');const td1=document.createElement('td');td1.append(makeCheck(p));const td2=document.createElement('td');td2.textContent=p.name;const td3=document.createElement('td');td3.textContent=statusName(p.status);td3.style.color=colors[p.status];const td4=document.createElement('td');td4.append(makeLocate(p));tr.append(td1,td2,td3,td4);table.append(tr)}
 }
 function setPanel(open){byId('cleanupPanel').hidden=!open;byId('cleanupKpi').setAttribute('aria-expanded',String(open));if(open)renderList()}
 byId('cleanupKpi').onclick=()=>setPanel(byId('cleanupPanel').hidden);byId('cleanupKpi').onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();byId('cleanupKpi').click()}};
 byId('cleanupClose').onclick=()=>setPanel(false);
 for(const [id,s] of [['cleanupFinished','TERMINADOS'],['cleanupProgress','EN PROCESO']])byId(id).onchange=e=>{if(e.target.checked)selectedStatuses.add(s);else selectedStatuses.delete(s);refreshLayers();renderList()};
 byId('cleanupAllOn').onclick=()=>setAll(true);byId('cleanupAllOff').onclick=()=>setAll(false);
 byId('cleanupFile').onchange=async e=>{const file=e.target.files[0];if(!file)return;const progress=(pct,detail)=>{byId('importModalBar').value=pct;byId('importModalPercent').textContent=pct+'%';byId('importModalDetail').textContent=detail};
  try{byId('importModal').hidden=false;byId('importModalTitle').textContent='Importando Clean Up';byId('importModalFile').textContent=file.name;byId('importModalAccept').hidden=true;progress(5,'Leyendo KMZ/KML…');const xml=await readFile(file);progress(35,'Validando polígonos…');const incoming=extract(xml);if(!cleanDb)throw Error('El almacenamiento Clean Up no está disponible.');
   // Clave estable por nombre: permite que un polígono cambie de estado sin duplicarse.
   const currentByName=new Map([...polygons.values()].map(p=>[p.name,p]));const existingByName=new Map();for(const p of incoming){if(existingByName.has(p.name))throw Error('El archivo contiene el mismo nombre en varios estados: '+p.name);existingByName.set(p.name,p)}
   const toDelete=[];const merged=incoming.map(p=>{const old=currentByName.get(p.name);if(old){p.enabled=old.enabled;if(old.id!==p.id)toDelete.push(old.id)}return p});
   progress(65,'Guardando cambios sin duplicar…');await new Promise((resolve,reject)=>{const tx=cleanDb.transaction(STORE,'readwrite'),store=tx.objectStore(STORE);for(const id of toDelete)store.delete(id);for(const p of merged)store.put(p);tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error)});
   for(const id of toDelete)polygons.delete(id);for(const p of merged)polygons.set(p.id,p);refreshLayers();renderList();progress(100,`Importación terminada: ${incoming.length} polígonos procesados; ${polygons.size} almacenados.`);byId('importModalAccept').hidden=false;
  }catch(err){progress(0,'Error: '+(err.message||String(err)));byId('importModalTitle').textContent='No se pudo importar Clean Up';byId('importModalAccept').hidden=false;byId('importModalAccept').onclick=()=>byId('importModal').hidden=true}finally{e.target.value=''}
 };
 (async()=>{try{cleanDb=await dbOpen();for(const p of await dbAll())polygons.set(p.id,p);refreshLayers();renderList()}catch(e){byId('cleanupInfo').textContent='No se pudo abrir el almacenamiento Clean Up: '+e.message}})();
})();
