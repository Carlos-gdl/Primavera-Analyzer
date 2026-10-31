/* Solo presenta la X existente; conserva su manejador de limpieza. */
(()=>{function init(){
 const input=document.getElementById('pe84Search'),clear=document.getElementById('pe84SearchClear');
 if(!input||!clear)return;const field=input.parentElement;
 const sync=()=>{const hasText=input.value.length>0;field.classList.toggle('has-text',hasText);clear.disabled=!hasText;clear.setAttribute('aria-hidden',String(!hasText))};
 input.addEventListener('input',sync);input.addEventListener('change',sync);
 clear.addEventListener('click',()=>{queueMicrotask(sync);input.focus()});
 window.addEventListener('pageshow',sync);sync();
 }if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init()})();
