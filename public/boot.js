/*
 * ToDoMe. boot: runs before the first paint (classic script, same origin, CSP-safe).
 * Always dark; sets the saved light colour, its strength and the corner
 * rounding on <html>, so the very first frame already looks right. No app logic here.
 */
(function () {
  var root = document.documentElement;
  try {
    if (location.hash === '#overlay') return root.classList.add('is-overlay');
    if (location.hash === '#companion') return root.classList.add('is-companion');
    root.setAttribute('data-theme', 'dark');
    var boot = JSON.parse(window.localStorage.getItem('todome:boot') || 'null');
    if (!boot) return;
    if (typeof boot.palette === 'string' && /^[a-z]{2,12}$/.test(boot.palette)) root.setAttribute('data-palette', boot.palette);
    if (boot.corners === 'sharp' || boot.corners === 'precise' || boot.corners === 'soft') root.setAttribute('data-corners', boot.corners);
    if (typeof boot.ambient === 'number' && boot.ambient >= 0 && boot.ambient <= 1) root.style.setProperty('--ambient', String(boot.ambient));
  } catch (e) {
    /* storage blocked: the defaults in the tokens apply */
  }
})();
