/* V-45: únicamente navegación de bienvenida en pestañas independientes. */
(function () {
  const screen = document.getElementById('welcomeScreen');
  if (!screen) return;
  const support = document.getElementById('welcomeSupport');
  const repeat = document.getElementById('welcomeRepeat');
  const plant = document.getElementById('welcomePlant');
  if (!support || !repeat || !plant) return;

  // La nueva pestaña de Soporte utiliza el mismo index.html, sin la bienvenida.
  // No modifica el almacenamiento, las herramientas ni la pestaña de origen.
  if (new URLSearchParams(window.location.search).get('tool') === 'soporte') {
    screen.hidden = true;
    document.body.classList.remove('welcome-locked');
    window.dispatchEvent(new Event('resize'));
    return;
  }

  support.addEventListener('click', function () {
    window.open('index.html?tool=soporte', '_blank', 'noopener');
  });
  repeat.addEventListener('click', function () {
    window.open('repeat60.html', '_blank', 'noopener');
  });
  plant.addEventListener('click', function () {
    window.open('masivos.html', '_blank', 'noopener');
  });
  // V-48: sin foco inicial fijo; el resaltado responde a hover y focus-visible.
})();
