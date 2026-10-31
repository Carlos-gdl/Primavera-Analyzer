/* V-2.10: arrastre exclusivo de la ventana de coberturas Planta Externa. */
(()=>{function init(){const panel=document.getElementById('coverageMenu'),handle=document.getElementById('pe210-coverageHandle');if(!panel||!handle)return;let drag=null,moved=false;
function place(left,top){const r=panel.getBoundingClientRect();panel.style.right='auto';panel.style.left=Math.max(0,Math.min(left,Math.max(0,window.innerWidth-r.width)))+'px';panel.style.top=Math.max(0,Math.min(top,Math.max(0,window.innerHeight-handle.offsetHeight)))+'px';}
handle.addEventListener('pointerdown',e=>{if(e.button!==0||!e.isPrimary)return;const r=panel.getBoundingClientRect();drag={id:e.pointerId,x:e.clientX,y:e.clientY,left:r.left,top:r.top};panel.classList.add('pe210-dragging');handle.setPointerCapture(e.pointerId);e.preventDefault();});
handle.addEventListener('pointermove',e=>{if(!drag||e.pointerId!==drag.id)return;place(drag.left+e.clientX-drag.x,drag.top+e.clientY-drag.y);moved=true;});
function end(e){if(!drag||e.pointerId!==drag.id)return;drag=null;panel.classList.remove('pe210-dragging');if(handle.hasPointerCapture(e.pointerId))handle.releasePointerCapture(e.pointerId);panel.dispatchEvent(new Event('pointermove'));}
handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);window.addEventListener('resize',()=>{if(moved){const r=panel.getBoundingClientRect();place(r.left,r.top)}});}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();})();
