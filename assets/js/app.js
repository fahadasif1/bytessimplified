/* Bytes Simplified — page interactions */
(function () {
  'use strict';

  var root = document.documentElement;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var TAU = Math.PI * 2;
  var paused = reduce;

  function $(s, el) { return (el || document).querySelector(s); }
  function $$(s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); }
  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function narrow() { return window.innerWidth < 900; }

  $$('.year').forEach(function (el) { el.textContent = new Date().getFullYear(); });

  // ?font=pixel shows the anchor-ai pixel headlines instead of Fraunces, for comparison.
  if (/[?&]font=pixel\b/.test(location.search)) root.classList.add('font-pixel');

  /* ---------------------------------------------------------- split headings
     Each character gets its own span for the blur-in reveal; screen readers
     get the plain sentence from a visually hidden copy. */
  function splitText(el) {
    var label = '', i = 0;
    var visual = document.createElement('span');
    visual.setAttribute('aria-hidden', 'true');
    (function walk(node, into) {
      Array.prototype.forEach.call(node.childNodes, function (child) {
        if (child.nodeType === 3) {
          label += child.textContent;
          child.textContent.split(/(\s+)/).forEach(function (part) {
            if (!part) return;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(' ')); return; }
            var word = document.createElement('span');
            word.className = 'w';
            Array.from(part).forEach(function (c) {
              var ch = document.createElement('span');
              ch.className = 'ch';
              ch.style.setProperty('--i', i++);
              ch.textContent = c;
              word.appendChild(ch);
            });
            into.appendChild(word);
          });
        } else if (child.nodeName === 'BR') {
          label += ' ';
          into.appendChild(document.createElement('br'));
        } else {
          var clone = child.cloneNode(false);
          walk(child, clone);
          into.appendChild(clone);
        }
      });
    })(el, visual);
    var sr = document.createElement('span');
    sr.className = 'sr-only';
    sr.textContent = label.replace(/\s+/g, ' ').trim();
    el.textContent = '';
    el.appendChild(sr);
    el.appendChild(visual);
  }
  $$('.split').forEach(splitText);

  /* ---------------------------------------------------------- reveal on view */
  var revealEls = $$('.rv, .split');
  if ('IntersectionObserver' in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
      });
    }, { threshold: .15, rootMargin: '0px 0px -6% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('is-in'); });
  }
  // The hero's staggered delays are only for the opening sequence.
  setTimeout(function () { $$('.hero [style*="--d"]').forEach(function (el) { el.style.removeProperty('--d'); }); }, 3200);

  /* ---------------------------------------------------------- header + menu */
  var header = $('.site-header');
  var navLinks = $$('.nav a');
  var menuBtn = $('.menu-btn'), menu = $('#mobile-menu');

  function setMenu(open) {
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    menu.hidden = !open;
    root.classList.toggle('menu-open', open);
    $$('main, .site-footer').forEach(function (el) { el.inert = open; });   // keep focus inside the menu
    if (open) { var first = $('a', menu); if (first) first.focus(); }
  }
  if (menuBtn && menu) {
    menuBtn.addEventListener('click', function () { setMenu(menuBtn.getAttribute('aria-expanded') !== 'true'); });
    menu.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !menu.hidden) { setMenu(false); menuBtn.focus(); }
    });
  }

  // Fixed header: "#top" can't be scrolled to as an anchor, so do it by hand.
  $$('a[href="#top"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      window.scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' });
    });
  });

  function setActiveNav(key) {
    navLinks.forEach(function (a) {
      if (a.getAttribute('href') === '#' + key) a.setAttribute('aria-current', 'true');
      else a.removeAttribute('aria-current');
    });
  }

  /* ---------------------------------------------------------- particle scene */
  // Camera framing and shape for each section; the scene blends between them on scroll.
  var SCENES = {
    hero:      { m: 1, cam: [0, -.6, 10.2], look: [0, -.42, 0], off: [0, 0, 0],    s: 1,   floor: 1,    a: 1 },
    platforms: { m: 1, cam: [0, .9, 11.6],  look: [0, -.75, 0], off: [0, 0, 0],    s: .92, floor: 1.15, a: 1 },
    services:  { m: 2, cam: [0, .5, 10.3],  look: [0, .05, 0],  off: [0, .1, 0],   s: 1,   floor: .9,   a: 1 },
    about:     { m: 3, cam: [0, .4, 9.4],   look: [0, .1, 0],   off: [2.4, .3, 0], s: 1,   floor: .6,   a: 1 },
    process:   { m: 4, cam: [0, .5, 9.6],   look: [0, .25, 0],  off: [0, .05, 0],  s: 1,   floor: .6,   a: 1 },
    work:      { m: 5, cam: [0, .4, 9.4],   look: [0, .1, 0],   off: [2.6, .2, 0], s: 1,   floor: .6,   a: 1 },
    // The logo rides along with the contact intro, centred in its open upper half.
    contact:   { m: 6, cam: [0, .6, 9.6],   look: [0, .3, 0],   off: [0, 1.05, 0], s: .82, floor: .85,  a: 1,  anchor: '.contact-intro', at: .28 },
    reach:     { m: 6, cam: [0, .6, 9.6],   look: [0, .3, 0],   off: [0, 1.05, 0], s: .82, floor: .55,  a: .9, anchor: '.contact-intro', at: .28 },
    footer:    { m: 6, cam: [0, .6, 9.6],   look: [0, .3, 0],   off: [0, 1.05, 0], s: .82, floor: .45,  a: .8, anchor: '.contact-intro', at: .28 }
  };
  // Small screens stack content full width: frame the hero tree above the copy,
  // centre every shape and dim the ones that sit behind text.
  var NARROW = {
    hero:      { cam: [0, -1.32, 10.2], look: [0, -2.6, 0] },
    platforms: { cam: [0, .2, 11.6],    look: [0, -.45, 0] }
  };
  function sceneFor(key) {
    var c = SCENES[key];
    if (!narrow()) return c;
    var n = NARROW[key] || {};
    return { m: c.m, cam: n.cam || c.cam, look: n.look || c.look, off: [0, c.off[1], c.off[2]], s: c.s, floor: c.floor,
             a: key === 'hero' || key === 'platforms' || key === 'services' || c.anchor ? c.a : Math.min(c.a, .55),
             anchor: c.anchor, at: c.at };
  }

  // Vertical offset that puts an anchored shape's centre on a point of its element.
  function offsetFor(c) {
    var el = c.anchor && engine ? $(c.anchor) : null;
    if (!el) return c.off;
    var ndc = 1 - 2 * (el.getBoundingClientRect().top / window.innerHeight + c.at);
    var dist = (c.cam[2] - c.look[2]) * engine.fit();
    return [c.off[0], c.look[1] + ndc * Math.tan(engine.fov / 2) * dist - .25 * c.s, c.off[2]];
  }

  var canvas = $('#scene'), engine = null;
  var count = finePointer && window.innerWidth > 900 ? 62000 : 26000;
  if (navigator.deviceMemory && navigator.deviceMemory <= 4) count = Math.min(count, 30000);
  var sceneOptions = {
    count: count,
    still: reduce,
    adaptive: !/[?&]adaptive=off\b/.test(location.search),   // test hook: keep full quality
    // If the GPU drops the context, show the static backdrop; rebuild if it comes back.
    onLost: function () { root.classList.add('no-webgl'); },
    onRestored: function () {
      if (engine) engine.destroy();
      engine = makeEngine();
      if (!engine) return;
      root.classList.remove('no-webgl');
      update(); engine.snap(); placeNodes(); engine.setStill(paused);
    }
  };
  function makeEngine() {
    if (!canvas) return null;
    sceneOptions.still = paused;
    try {
      return window.BytesScene ? window.BytesScene.create(canvas, sceneOptions) : null;
    } catch (err) {
      if (window.console) console.warn('[scene]', err);
      return null;
    }
  }
  engine = makeEngine();
  if (!engine) root.classList.add('no-webgl');

  var sections = $$('[data-scene]').map(function (el) { return { el: el, key: el.getAttribute('data-scene'), c: 0 }; });
  var activeKey = null, introHold = false, ticking = false;

  function measure() {
    sections.forEach(function (s) {
      var r = s.el.getBoundingClientRect();
      s.c = r.top + window.scrollY + r.height / 2;
    });
  }

  function current() {
    var focus = window.scrollY + window.innerHeight * .5, i = 0;
    while (i < sections.length - 1 && sections[i + 1].c <= focus) i++;
    var a = sections[i], b = sections[Math.min(i + 1, sections.length - 1)];
    var t = b === a ? 0 : smooth(.2, .8, (focus - a.c) / (b.c - a.c));
    var A = sceneFor(a.key), B = sceneFor(b.key);
    function mix3(x, y) { return [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]; }
    return {
      key: t < .5 ? a.key : b.key,
      state: { morph: introHold ? 0 : lerp(A.m, B.m, t), cam: mix3(A.cam, B.cam), look: mix3(A.look, B.look),
               off: mix3(offsetFor(A), offsetFor(B)), scale: lerp(A.s, B.s, t), floor: lerp(A.floor, B.floor, t), alpha: lerp(A.a, B.a, t) }
    };
  }

  function update() {
    ticking = false;
    header.classList.toggle('is-scrolled', window.scrollY > 24);
    if (!sections.length) return;
    var r = current();
    if (engine) engine.setTarget(r.state);
    if (r.key !== activeKey) {
      if (activeKey && engine && SCENES[activeKey].m !== SCENES[r.key].m) engine.shock();
      activeKey = r.key;
      setActiveNav(r.key);
    }
  }
  function requestUpdate() { if (!ticking) { ticking = true; requestAnimationFrame(update); } }

  // Line the pipeline's four glowing nodes up with the four step cards.
  function placeNodes() {
    if (!engine) return;
    var steps = $$('.step');
    if (steps.length !== 4) return;
    var c = sceneFor('process');
    var half = Math.tan(engine.fov / 2) * engine.aspect() * (c.cam[2] - c.look[2]) * engine.fit();
    var rects = steps.map(function (s) { return s.getBoundingClientRect(); });
    var xs;
    if (Math.abs(rects[0].top - rects[3].top) < 4) {
      xs = rects.map(function (r) {
        var ndc = (r.left + r.width / 2) / window.innerWidth * 2 - 1;
        return (ndc * half - c.off[0]) / c.s;
      });
    } else {
      var w = half * .78 / c.s;
      xs = [-w, -w / 3, w / 3, w];
    }
    engine.setNodes(xs);
  }

  measure();
  if (engine) {
    introHold = !reduce && window.scrollY < window.innerHeight * .3;
    update();
    engine.snap();
    if (introHold) setTimeout(function () { introHold = false; requestUpdate(); }, 650);
    placeNodes();
    if (document.fonts && document.fonts.load) {
      document.fonts.load('700 100px Geist').then(function () { engine.refreshCube(); }, function () {});
    }
  } else {
    update();
  }

  window.addEventListener('scroll', requestUpdate, { passive: true });
  window.addEventListener('resize', function () {
    if (menu && !narrow() && !menu.hidden) setMenu(false);
    if (engine) engine.resize();
    measure(); placeNodes(); requestUpdate();
  });
  window.addEventListener('load', function () { measure(); placeNodes(); requestUpdate(); });
  if ('ResizeObserver' in window) new ResizeObserver(function () { measure(); placeNodes(); requestUpdate(); }).observe(document.body);

  /* ---------------------------------------------------------- pointer → scene */
  if (engine && finePointer) {
    var lastRipple = 0, lx = 0, ly = 0;
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      var nx = e.clientX / window.innerWidth * 2 - 1, ny = 1 - e.clientY / window.innerHeight * 2;
      engine.setPointer(nx, ny, true);
      var now = performance.now();
      if (now - lastRipple > 420 && Math.hypot(e.clientX - lx, e.clientY - ly) > 60) {
        engine.ripple(nx, ny, .45);
        lastRipple = now; lx = e.clientX; ly = e.clientY;
      }
    }, { passive: true });
    document.addEventListener('mouseout', function (e) { if (!e.relatedTarget) engine.setPointer(0, 0, false); });
    window.addEventListener('pointerdown', function (e) {
      if (e.target.closest('a, button, input, select, textarea, label, .card, .chip')) return;
      engine.ripple(e.clientX / window.innerWidth * 2 - 1, 1 - e.clientY / window.innerHeight * 2, 1);
    });
  }

  /* ---------------------------------------------------------- motion toggle */
  var motionBtn = $('.motion-toggle');
  var orbitKick = function () {};
  function setPaused(p) {
    paused = p;
    motionBtn.setAttribute('aria-pressed', String(p));
    motionBtn.setAttribute('aria-label', p ? 'Play background motion' : 'Pause background motion');
    motionBtn.title = p ? 'Play motion' : 'Pause motion';
    root.classList.toggle('motion-paused', p);
    if (engine) engine.setStill(p);
    if (!p) orbitKick();
  }
  if (engine && motionBtn) {
    setPaused(paused);
    motionBtn.addEventListener('click', function () { setPaused(!paused); });
  } else if (motionBtn) {
    motionBtn.hidden = true;
  }

  /* ---------------------------------------------------------- orbiting chips */
  (function () {
    var orbit = $('.orbit');
    if (!orbit) return;
    var chips = $$('.chip', orbit), n = chips.length;
    var phase = .35, visible = false, raf = 0, last = 0;
    var stacked = window.matchMedia('(max-width: 600px)');   // phones: a static row, no orbit
    function layout() {
      if (stacked.matches) {
        chips.forEach(function (c) { c.style.transform = c.style.opacity = c.style.zIndex = ''; });
        return;
      }
      var rx = orbit.clientWidth / 2, ry = orbit.clientHeight / 2;
      for (var i = 0; i < n; i++) {
        var a = phase + i / n * TAU, d = (Math.sin(a) + 1) / 2;
        chips[i].style.transform = 'translate3d(' + (Math.cos(a) * rx).toFixed(1) + 'px,' + (Math.sin(a) * ry).toFixed(1) +
          'px,0) translate(-50%,-50%) scale(' + (.76 + .28 * d).toFixed(3) + ')';
        chips[i].style.opacity = (.3 + .7 * d).toFixed(3);
        chips[i].style.zIndex = String(Math.round(d * 10));
      }
    }
    function tick(now) {
      raf = 0;
      phase += (last ? Math.min(.05, (now - last) / 1000) : 0) * .11;
      last = now;
      layout();
      if (visible && !paused && !stacked.matches) raf = requestAnimationFrame(tick); else last = 0;
    }
    orbitKick = function () { if (visible && !raf) raf = requestAnimationFrame(tick); };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (es) { visible = es[0].isIntersecting; orbitKick(); }).observe(orbit);
    }
    window.addEventListener('resize', layout);
    layout();
  })();

  /* ---------------------------------------------------------- card glow */
  if (finePointer) {
    $$('.card').forEach(function (c) {
      c.addEventListener('pointermove', function (e) {
        var r = c.getBoundingClientRect();
        c.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
        c.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
      });
    });
  }

  /* ---------------------------------------------------------- stat counters */
  var stats = $('.stats');
  if (stats && !reduce && 'IntersectionObserver' in window) {
    var nums = $$('.stat-num[data-count]', stats);
    nums.forEach(function (el) { el.textContent = (el.getAttribute('data-prefix') || '') + '0' + (el.getAttribute('data-suffix') || ''); });
    var sio = new IntersectionObserver(function (entries) {
      if (!entries[0].isIntersecting) return;
      sio.disconnect();
      nums.forEach(function (el) {
        var target = parseInt(el.getAttribute('data-count'), 10);
        var pre = el.getAttribute('data-prefix') || '', suf = el.getAttribute('data-suffix') || '';
        var start = null;
        (function frame(t) {
          if (!start) start = t;
          var p = Math.min((t - start) / 1400, 1);
          el.textContent = pre + Math.round(target * (1 - Math.pow(1 - p, 3))) + suf;
          if (p < 1) requestAnimationFrame(frame);
        })(performance.now());
      });
    }, { threshold: .4 });
    sio.observe(stats);
  }

  /* ---------------------------------------------------------- contact form → email */
  var form = $('#contact-form');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.name.value.trim(), email = form.email.value.trim();
      var topic = form.topic.value, message = form.message.value.trim();
      if (!name || !email || !message || !form.email.checkValidity()) { form.reportValidity(); return; }
      var subject = 'New enquiry: ' + topic + ' — ' + name;
      var body = 'Name: ' + name + '\nEmail: ' + email + '\nInterested in: ' + topic +
                 '\n\n' + message + '\n\n— Sent from bytessimplified.com';
      window.location.href = 'mailto:info@bytessimplified.com?subject=' +
        encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
    });
  }

  /* ---------------------------------------------------------- cursor */
  if (finePointer && !reduce && $('.cursor')) {
    var cursor = $('.cursor'), ring = $('.cursor-ring', cursor), dot = $('.cursor-dot', cursor);
    var cx = -100, cy = -100, rx = -100, ry = -100, craf = 0, shown = false;
    root.classList.add('has-cursor');
    var loop = function () {
      rx += (cx - rx) * .2; ry += (cy - ry) * .2;
      dot.style.transform = 'translate3d(' + cx + 'px,' + cy + 'px,0)';
      ring.style.transform = 'translate3d(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px,0)';
      craf = Math.abs(cx - rx) + Math.abs(cy - ry) > .2 ? requestAnimationFrame(loop) : 0;
    };
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') return;
      cx = e.clientX; cy = e.clientY;
      if (!shown) { shown = true; rx = cx; ry = cy; cursor.classList.add('is-on'); }
      cursor.classList.toggle('is-hover', !!e.target.closest('a, button, select, label, .chip'));
      cursor.classList.toggle('is-text', !!e.target.closest('input, textarea'));
      if (!craf) craf = requestAnimationFrame(loop);
    }, { passive: true });
    document.addEventListener('mouseout', function (e) {
      if (!e.relatedTarget) { shown = false; cursor.classList.remove('is-on'); }
    });
  }

  requestAnimationFrame(function () { root.classList.add('is-ready'); });
})();
