/* A shared document is too short to contain its own sticky header. */
(function () {
  function start() {
    const shell = document.querySelector('body.wcs-page > .wcs-header');
    if (!shell) return;
    const header = shell.querySelector('.wcs-header-source') || shell.querySelector('header,[role="banner"]');
    if (!header) return;
    let queued = false;
    function update() {
      queued = false;
      // Remove only our class before reading the current source/breakpoint rules.
      shell.classList.remove('wcs-sticky-header');
      header.classList.remove('wcs-sticky-source');
      const style = getComputedStyle(header);
      if (style.position !== 'sticky' || style.top === 'auto') return;
      shell.style.setProperty('--wcs-header-top', style.top);
      shell.style.setProperty('--wcs-header-layer', style.zIndex === 'auto' ? 'auto' : style.zIndex);
      header.classList.add('wcs-sticky-source');
      shell.classList.add('wcs-sticky-header');
    }
    function schedule() { if (!queued) { queued = true; requestAnimationFrame(update); } }
    update();
    window.addEventListener('resize', schedule, {passive: true});
    window.addEventListener('load', schedule, {once: true});
    // Header height can change when fonts, navigation or images finish loading.
    if (typeof ResizeObserver !== 'undefined') new ResizeObserver(schedule).observe(header);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once: true});
  else start();
})();
