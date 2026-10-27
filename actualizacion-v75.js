/* Primavera Analyzer: comprobación de publicación, siempre relativa al repositorio abierto. */
(()=>{'use strict';
 const config=JSON.parse(document.getElementById('pa-release-config').textContent);
 const root=new URL('./',location.href);
 const online=/^https?:$/.test(location.protocol);
 let panel;
 function message(text,retry=false){
  if(!panel){panel=document.createElement('div');panel.id='pa-release-status';panel.setAttribute('role','status');panel.style.cssText='position:fixed;inset:0;z-index:2147483647;display:grid;place-content:center;gap:14px;padding:24px;background:#0b2539;color:#eef7ff;font:15px Arial,sans-serif;text-align:center';document.body.appendChild(panel)}
  panel.replaceChildren();const p=document.createElement('p');p.textContent=text;panel.appendChild(p);
  if(retry){const b=document.createElement('button');b.textContent='Reintentar';b.style.cssText='padding:10px;border:1px solid #6d99b5;border-radius:7px;background:#17577f;color:white;cursor:pointer';b.onclick=()=>location.reload();panel.appendChild(b)}
 }
 async function manifest(){
  const url=new URL('version.json',root);url.searchParams.set('_pa_check',Date.now()+'-'+Math.random().toString(36).slice(2));
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  try{const response=await fetch(url.href,{cache:'no-store',credentials:'same-origin',redirect:'error',signal:controller.signal});if(!response.ok)throw new Error('No se pudo consultar la versión publicada.');return await response.json()}finally{clearTimeout(timer)}
 }
 function validate(data){
  if(!data||data.schema!==1||typeof data.release!=='string'||!/^V-\d+-[a-f0-9]{12}$/.test(data.release))throw new Error('El archivo de versión no es válido.');
  const name=data.pages?.[config.page];
  if(typeof name!=='string'||!new RegExp('^'+config.page+'\\.pa[0-9]+\\.[a-f0-9]{12}\\.html$').test(name))throw new Error('La página publicada no es válida.');
  const url=new URL(name,root);if(url.origin!==root.origin||new URL('./',url).href!==root.href)throw new Error('La actualización debe permanecer en este repositorio.');return url;
 }
 async function scripts(){
  for(const node of [...document.querySelectorAll('script[data-pa-pending]')]){
   const s=document.createElement('script');for(const a of node.attributes){if(a.name!=='type'&&!a.name.startsWith('data-pa-'))s.setAttribute(a.name,a.value)}
   s.async=false;
   if(node.dataset.paSrc){await new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('Se agotó el tiempo al cargar un archivo.')),30000);s.onload=()=>{clearTimeout(timer);resolve()};s.onerror=()=>{clearTimeout(timer);reject(new Error('No se pudo cargar un archivo de la herramienta.'))};s.src=node.dataset.paSrc;node.replaceWith(s)})}
   else{s.textContent=node.textContent;node.replaceWith(s)}
  }
 }
 async function start(){
  message('Comprobando la versión de Primavera Analyzer…');
  try{
   if(online){const data=await manifest(),target=validate(data);if(data.release!==config.release){if(target.pathname===location.pathname)throw new Error('La publicación está incompleta.');target.search=location.search;target.hash=location.hash;const ready=await fetch(target.href,{method:'HEAD',cache:'no-store',credentials:'same-origin',redirect:'error'});if(!ready.ok)throw new Error('La nueva publicación todavía no está disponible.');location.replace(target.href);return}}
   if(online){const canonical=new URL(config.page+'.html',root);canonical.search=location.search;canonical.hash=location.hash;if(canonical.pathname!==location.pathname)history.replaceState(history.state,'',canonical.href)}
   await scripts();document.title=document.title+' · '+config.version;panel.remove();window.dispatchEvent(new Event('resize'));
  }catch(error){message('No se pudo verificar o cargar la versión actual. Comprueba la conexión y que la publicación haya terminado. '+error.message,true)}
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
