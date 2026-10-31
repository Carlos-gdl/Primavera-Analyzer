/* V-98: presentación y conexión a los controles de puntos ya existentes en Soportes. */
(()=>{'use strict';
 const get=id=>document.getElementById(id),menu=get('sc98-punteo');if(!menu)return;
 const support=get('sc98-support'),repeat=get('sc98-repeat'),enabled=get('pointsEnabled'),mode=get('pointsMode'),summary=menu.querySelector('summary'),full=get('mapFullscreen');
 function reflect(){support.checked=enabled.checked&&mode.value!=='repeat';repeat.checked=enabled.checked&&mode.value!=='supports'}
 function apply(){
  const on=support.checked||repeat.checked;
  const value=support.checked&&repeat.checked?'both':repeat.checked?'repeat':'supports';
  enabled.checked=on;mode.value=value;
  // Un único render: usa el evento original de Tipo de puntos y su estado de activación.
  pointsEnabled=on;mode.dispatchEvent(new Event('change',{bubbles:true}));
 }
 support.addEventListener('change',apply);repeat.addEventListener('change',apply);
 enabled.addEventListener('change',reflect);mode.addEventListener('change',reflect);
 menu.addEventListener('toggle',()=>{summary.setAttribute('aria-expanded',String(menu.open));if(menu.open)reflect()});
 summary.setAttribute('aria-expanded','false');
 function size(){const r=full.getBoundingClientRect();summary.style.width=r.width+'px';summary.style.height=r.height+'px';menu.style.top=(full.offsetTop+full.offsetHeight+8)+'px'}
 if(window.ResizeObserver)new ResizeObserver(size).observe(full);window.addEventListener('resize',size);document.addEventListener('fullscreenchange',size);
 // Las casillas, selectores y el panel no deben activar arrastres o clics del mapa.
 L.DomEvent.disableClickPropagation(menu);L.DomEvent.disableScrollPropagation(menu);
 get('pointsScope').value='visible';pointsScope='visible';
 reflect();size();
})();
