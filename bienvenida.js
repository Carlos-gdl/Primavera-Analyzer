/* Solo presentación. No accede ni modifica la base de datos o filtros. */
(function () {
  const screen = document.getElementById('welcomeScreen');
  const button = document.getElementById('welcomeEnter');
  if (!screen || !button) return;
  button.addEventListener('click', function () {
    screen.hidden = true;
    document.body.classList.remove('welcome-locked');
    // Leaflet puede necesitar recalcular dimensiones al descubrirse el tablero.
    window.dispatchEvent(new Event('resize'));
  });
  button.focus();
})();
