/**
 * capabilities/screen-record/assets/cursor-overlay.js — the visible-cursor injection (plan P1G.2, GAP-64).
 *
 * Playwright renders NO cursor in screen captures, so a recording looks like a possessed page clicking
 * itself. This init-script paints a `pointer-events:none` DOM cursor that tracks `mousemove`/`mousedown`/
 * `mouseup`, so the deterministic record (which drives the mouse with interpolated `mouse.move(steps)`)
 * shows a cursor that GLIDES and pulses on click.
 *
 * ROBUSTNESS (learned the hard way): the script runs at document_start, BEFORE <body> exists and before the
 * HTML parser builds the real document — anything appended to <html> then gets WIPED when the parser
 * replaces documentElement. So we do NOT create the node upfront; we LAZILY `ensure()` it (recreate if
 * missing) on every mouse event AND via a keep-alive interval. `pointer-events:none` is non-negotiable.
 */
(() => {
  if (window.__vibeCursorInstalled) return;
  window.__vibeCursorInstalled = true;

  var ID = '__vibe-cursor';
  var SIZE = 26;
  var x = -100, y = -100, down = false; // start off-screen until the first move

  function baseCss() {
    return [
      'position:fixed', 'top:0', 'left:0',
      'width:' + SIZE + 'px', 'height:' + SIZE + 'px', 'margin:0', 'padding:0',
      'border-radius:50%',
      'background:rgba(255,230,0,0.92)',
      'border:2.5px solid rgba(14,14,17,0.95)',
      'box-shadow:0 0 0 3px rgba(255,255,255,0.85), 0 0 14px 3px rgba(255,230,0,0.55), 0 2px 10px rgba(0,0,0,0.45)',
      'pointer-events:none', 'z-index:2147483647',
      'transition:transform 90ms ease-out, background 90ms ease-out',
      'will-change:transform,left,top',
    ].join(';');
  }

  function ensure() {
    if (!document.body) return null;
    var el = document.getElementById(ID);
    if (!el) {
      el = document.createElement('div');
      el.id = ID;
      el.style.cssText = baseCss();
      document.body.appendChild(el);
    }
    return el;
  }

  function paint() {
    var el = ensure();
    if (!el) return;
    el.style.left = x + 'px';
    el.style.top = y + 'px';
    el.style.transform = down ? 'translate(-50%,-50%) scale(0.68)' : 'translate(-50%,-50%) scale(1)';
    el.style.background = down ? 'rgba(255,230,0,1)' : 'rgba(255,230,0,0.92)';
  }

  window.addEventListener('mousemove', function (e) { x = e.clientX; y = e.clientY; paint(); }, { passive: true, capture: true });
  window.addEventListener('mousedown', function () { down = true; paint(); }, { passive: true, capture: true });
  window.addEventListener('mouseup', function () { down = false; paint(); }, { passive: true, capture: true });

  // keep the node alive across SPA re-renders / parser document swaps, and keep it positioned during dwells
  function boot() { paint(); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  setInterval(function () { paint(); }, 250);
})();
