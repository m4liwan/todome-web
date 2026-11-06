/*
 * ToDoMe. boot: runs before the first paint (classic script, same origin, CSP-safe).
 * Sets the saved theme and colour world on <html> so the very first frame
 * already has the right background. No app logic here.
 */
(function () {
  var root = document.documentElement;
  try {
    if (location.hash === '#overlay') return root.classList.add('is-overlay');
    if (location.hash === '#companion') return root.classList.add('is-companion');
    var boot = JSON.parse(window.localStorage.getItem('todome:boot') || 'null');
    if (!boot) return;
    if (boot.theme === 'light' || boot.theme === 'dark') root.setAttribute('data-theme', boot.theme);
    if (typeof boot.palette === 'string' && /^[a-z]{2,12}$/.test(boot.palette)) root.setAttribute('data-palette', boot.palette);
  } catch (e) {
    /* storage blocked: the system colour scheme decides */
  }
})();
