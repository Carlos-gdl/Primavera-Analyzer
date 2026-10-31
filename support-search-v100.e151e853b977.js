/* Reutiliza el botón Limpiar y su acción existente, sin cambiar búsquedas. */
(()=>{function init(){const input=document.getElementById('mapSearch'),x=document.getElementById('sc100-searchX'),clear=document.getElementById('searchClear');if(!input||!x||!clear)return;
const sync=()=>{x.hidden=input.value.length===0};input.addEventListener('input',sync);input.addEventListener('change',sync);clear.addEventListener('click',sync);x.addEventListener('click',()=>{clear.click();sync();input.focus()});sync();}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();})();
