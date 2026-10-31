/* Solo interacción de los desplegables de presentación de Soportes. */
(()=>{
 const menus=[...document.querySelectorAll('.sc74-menu')];
 for(const menu of menus){menu.addEventListener('toggle',()=>{if(menu.open)for(const other of menus)if(other!==menu)other.open=false})}
 document.addEventListener('click',e=>{for(const menu of menus)if(menu.open&&!menu.contains(e.target))menu.open=false});
 document.addEventListener('keydown',e=>{if(e.key!=='Escape')return;for(const menu of menus)if(menu.open){menu.open=false;menu.querySelector('summary').focus()}});
})();
