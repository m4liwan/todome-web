/*
 * ToDoMe. boot: runs before the first paint (classic script, same origin, CSP-safe).
 * Sets the saved theme (night or Tageslicht), the light colour, its strength, the corner
 * rounding, the dock side, how the light moves and the companion's size on <html>, so the very first frame already looks right. No app logic here.
 */
(function () {
  var root = document.documentElement;
  try {
    if (location.hash === '#overlay') return root.classList.add('is-overlay');
    if (location.hash === '#companion') return root.classList.add('is-companion');
    root.setAttribute('data-theme', 'dark');
    root.setAttribute('data-dock', 'top');
    var boot = JSON.parse(window.localStorage.getItem('todome:boot') || 'null');
    if (!boot) return;
    if (boot.theme === 'light') root.setAttribute('data-theme', 'light');
    if (typeof boot.palette === 'string' && /^[a-z]{2,12}$/.test(boot.palette)) root.setAttribute('data-palette', boot.palette);
    if (boot.corners === 'sharp' || boot.corners === 'precise' || boot.corners === 'soft') root.setAttribute('data-corners', boot.corners);
    if (boot.dock === 'top' || boot.dock === 'bottom') root.setAttribute('data-dock', boot.dock);
    if (/^(drift|breathe|aurora|center|corners)$/.test(boot.light)) root.setAttribute('data-light', boot.light);
    if (/^(compact|standard|large)$/.test(boot.buddy)) root.setAttribute('data-buddy', boot.buddy);
    if (typeof boot.ambient === 'number' && boot.ambient >= 0 && boot.ambient <= 1) root.style.setProperty('--ambient', String(boot.ambient));
  } catch (e) {
    /* storage blocked: the defaults in the tokens apply */
  }
})();
