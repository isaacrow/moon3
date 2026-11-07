/*
 * Page reveal between the OPAC and Moon Studio (see page-reveal.css).
 * A classic script in <head> of both pages, so it listens before the first frame is drawn.
 */
(function () {
  var STUDIO = /^\/(dashboard|moon|records|search|authors|activity|entities)(\/|$)/;
  var OPAC = /^\/opac(\.html)?(\/|$)/;
  var CLASSES = ['vt-plain', 'vt-opac-to-studio', 'vt-studio-to-opac'];
  var root = document.documentElement;

  function kind(url) {
    if (!url) return '';
    try {
      var u = new URL(url, location.href);
      if (u.origin !== location.origin) return '';
      return OPAC.test(u.pathname) ? 'opac' : STUDIO.test(u.pathname) ? 'studio' : '';
    } catch (e) {
      return '';
    }
  }

  /** 'opac-to-studio', 'studio-to-opac' or '' for every other move. */
  function revealType(from, to) {
    var a = kind(from), b = kind(to);
    if (a === 'opac' && b === 'studio') return 'opac-to-studio';
    if (a === 'studio' && b === 'opac') return 'studio-to-opac';
    return '';
  }

  function clear() {
    for (var i = 0; i < CLASSES.length; i++) root.classList.remove(CLASSES[i]);
  }

  function liftDone() {
    root.classList.remove('moon-revealed');
  }

  // Old page: just before the browser takes its picture, keep only the whole page in it.
  window.addEventListener('pageswap', function (e) {
    if (e.viewTransition) root.classList.add('vt-plain');
  });

  // New page: play the reveal only between the OPAC and the Studio; skip every other navigation.
  window.addEventListener('pagereveal', function (e) {
    clear();
    var vt = e.viewTransition;
    if (!vt) return;
    var act = window.navigation && window.navigation.activation;
    var from = (act && act.from && act.from.url) || document.referrer;
    var type = revealType(from, location.href);
    if (!type) { vt.skipTransition(); return; }

    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    root.classList.add('vt-plain');
    if (!reduce) root.classList.add('vt-' + type);   // reduced motion keeps the browser's short fade
    if (vt.finished && vt.finished.then) vt.finished.then(clear, clear);

    if (type === 'opac-to-studio' && !reduce) {
      root.classList.add('moon-revealed');
      // The heading may mount late (sign-in, lazy screen); end the effect after its lift, or in 10 s.
      document.addEventListener('animationend', function onEnd(ev) {
        if (ev.animationName !== 'moon-lift') return;
        document.removeEventListener('animationend', onEnd);
        setTimeout(liftDone, 600);
      });
      setTimeout(liftDone, 10000);
    }
  });

  // Back to a page kept in memory: it must not keep the classes it had when it was left.
  window.addEventListener('pageshow', function (e) {
    if (e.persisted) clear();
  });

  window.__moonPageReveal = { revealType: revealType };
})();
