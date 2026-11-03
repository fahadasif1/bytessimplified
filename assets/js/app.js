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

  /* ---------------------------------------------------------- in-page links
     A section's top edge isn't the useful place to land: its cards sit at the
     bottom, under the shape. Scroll so the cards (marked data-land) are fully on
     screen, and land "Start a project" right on the brief. */
  // Layout position, ignoring the transform of a reveal that may still be running.
  function pageTop(el) { var y = 0; for (; el; el = el.offsetParent) y += el.offsetTop; return y; }
  function headerSpace() { return parseFloat(getComputedStyle(root).getPropertyValue('--header-h')) || 0; }
  function landingFor(el) {
    if (el.classList.contains('brief')) return pageTop(el) - headerSpace() - 28;
    var y = pageTop(el), cards = $('[data-land]', el);
    if (cards) {
      var h = cards.offsetHeight;
      // Only when the cards fit on screen at all; on phones they stack, so start at the heading.
      if (h + headerSpace() + 40 < window.innerHeight) y = Math.max(y, pageTop(cards) + h + 28 - window.innerHeight);
    }
    return y;
  }
  function goTo(id, how) {
    var el = id === 'top' ? null : document.getElementById(id);
    if (id !== 'top' && !el) return null;
    var y = el ? clamp(landingFor(el), 0, document.documentElement.scrollHeight - window.innerHeight) : 0;
    try { window.scrollTo({ top: y, behavior: how }); } catch (err) { window.scrollTo(0, y); }
    return el || document.body;
  }
  // Run fn once a smooth scroll has come to rest.
  function afterScroll(fn) {
    var last = -1, still = 0, tries = 0;
    (function check() {
      var y = window.scrollY;
      still = y === last ? still + 1 : 0; last = y;
      if (still >= 3 || ++tries > 60) fn(); else setTimeout(check, 80);
    })();
  }
  function callBrief(el) {
    el.classList.remove('is-called'); void el.offsetWidth; el.classList.add('is-called');
  }
  $$('a[href^="#"]').forEach(function (a) {
    var id = a.getAttribute('href').slice(1);
    if (!id || id === 'main') return;   // the skip link keeps its native behaviour
    a.addEventListener('click', function (e) {
      if (menu && !menu.hidden) setMenu(false);
      var el = goTo(id, reduce ? 'auto' : 'smooth');
      if (!el) return;
      e.preventDefault();
      if (id === 'top') return;
      if (history.pushState) history.pushState(null, '', '#' + id);
      // Keyboard and screen-reader users continue from the section they jumped to.
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      if (el.classList.contains('brief')) afterScroll(function () { callBrief(el); });
    });
  });
  // Arriving with a hash (e.g. from the legal pages): once the browser has made its own jump,
  // move to the same spot a click would — unless the visitor has already started scrolling.
  var moved = false;
  ['wheel', 'touchstart', 'keydown'].forEach(function (t) {
    window.addEventListener(t, function () { moved = true; }, { once: true, passive: true });
  });
  window.addEventListener('load', function () {
    var id = location.hash.slice(1), el = id && id !== 'main' ? document.getElementById(id) : null;
    if (!el) return;
    // Measure with the web fonts applied, or the landing is off by the fallback font's line heights.
    (document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve()).then(function () {
      requestAnimationFrame(function () {
        if (moved) return;
        goTo(id, 'instant');
        if (el.classList.contains('brief')) callBrief(el);
      });
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
    motionBtn.textContent = p ? 'Play animation' : 'Pause animation';
    root.classList.toggle('motion-paused', p);
    if (engine) engine.setStill(p);
    if (!p) orbitKick();
  }
  // Lives in the footer's small print (WCAG 2.2.2: moving content must be pausable).
  if (engine && motionBtn) {
    motionBtn.hidden = false;
    setPaused(paused);
    motionBtn.addEventListener('click', function () { setPaused(!paused); });
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

  /* ---------------------------------------------------------- project brief → inbox
     Sent with FormSubmit (formsubmit.co) to the address in the form's action. If it
     can't be delivered, the visitor gets the brief as a ready-made email instead. */
  var form = $('#contact-form');
  if (form) {
    var f = { name: $('#cf-name'), email: $('#cf-email'), company: $('#cf-company'), message: $('#cf-message') };
    var steps = { topics: $('[data-step="topics"]', form), you: $('[data-step="you"]', form),
                  project: $('[data-step="project"]', form), send: $('.bstep-send', form) };
    var states = { sent: $('[data-state="sent"]', form), failed: $('[data-state="failed"]', form) };
    var tried = false, mail = { subject: '', body: '' };

    var val = function (el) { return el.value.trim(); };
    var topics = function () { return $$('input[name="topic"]:checked', form).map(function (c) { return c.value; }); };
    function problems() {
      var email = val(f.email);
      return {
        name: val(f.name) ? '' : 'Please tell us your name.',
        email: !email ? 'We need an email address to reply to.'
             : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? '' : 'That email address doesn’t look quite right.',
        message: val(f.message) ? '' : 'A line or two about the project is plenty.'
      };
    }
    function showProblems(p) {
      Object.keys(p).forEach(function (k) {
        var field = f[k].closest('.field');
        field.classList.toggle('is-invalid', !!p[k]);
        if (p[k]) f[k].setAttribute('aria-invalid', 'true'); else f[k].removeAttribute('aria-invalid');
        $('.field-err', field).textContent = p[k];
      });
    }
    // Light each step on the rail as it's completed; errors only appear after a first attempt.
    function progress() {
      var p = problems(), ready = !p.name && !p.email && !p.message;
      steps.topics.classList.toggle('is-done', topics().length > 0);
      steps.you.classList.toggle('is-done', !p.name && !p.email);
      steps.project.classList.toggle('is-done', !p.message);
      steps.send.classList.toggle('is-done', ready);
      form.classList.toggle('is-ready', ready);
      if (tried) showProblems(p);
      return p;
    }
    form.addEventListener('input', progress);
    form.addEventListener('change', progress);
    f.message.addEventListener('input', function () {
      f.message.style.height = 'auto';
      f.message.style.height = f.message.scrollHeight + 'px';
    });
    // The message box's label strip sits above the textarea; clicking it still puts the caret inside.
    $$('.field-box', form).forEach(function (box) {
      box.addEventListener('mousedown', function (e) {
        if (e.target === box) { e.preventDefault(); $('input, textarea', box).focus(); }
      });
    });

    function finish(state) {
      form.style.minHeight = form.offsetHeight + 'px';   // keep the panel steady while the content swaps
      form.classList.remove('is-sending');
      form.classList.add('is-finished');
      Object.keys(states).forEach(function (k) { states[k].hidden = k !== state; });
      $('.done-title', states[state]).focus({ preventScroll: true });
    }
    function reopen(clear) {
      if (clear) { form.reset(); f.message.style.height = ''; tried = false; showProblems({ name: '', email: '', message: '' }); }
      form.classList.remove('is-finished');
      form.style.minHeight = '';
      states.sent.hidden = states.failed.hidden = true;
      progress();
      (clear ? f.name : f.message).focus();
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      if (form.classList.contains('is-sending')) return;
      tried = true;
      var p = progress(), bad = ['name', 'email', 'message'].filter(function (k) { return p[k]; });
      if (bad.length) { f[bad[0]].focus(); return; }

      var t = topics(), name = val(f.name), email = val(f.email), company = val(f.company), message = val(f.message);
      mail.subject = 'New enquiry' + (t.length ? ': ' + t.join(', ') : '') + ' — ' + name;
      mail.body = ['Name: ' + name, 'Email: ' + email].concat(company ? ['Company: ' + company] : [], t.length ? ['Interested in: ' + t.join(', ')] : [])
        .join('\n') + '\n\n' + message + '\n\n— Sent from bytessimplified.com';
      $('[data-first]', states.sent).textContent = ', ' + name.split(/\s+/)[0];
      $('[data-email]', states.sent).textContent = email;
      $('[data-mailto]', states.failed).href = 'mailto:info@bytessimplified.com?subject=' +
        encodeURIComponent(mail.subject) + '&body=' + encodeURIComponent(mail.body);

      if (val($('#cf-hp'))) { finish('sent'); return; }   // a bot filled the hidden field: pretend, send nothing

      form.classList.add('is-sending');
      var ctrl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 15000);
      fetch(form.action.replace('formsubmit.co/', 'formsubmit.co/ajax/'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          _subject: mail.subject, _template: 'table', _captcha: 'false', _replyto: email,
          name: name, email: email, company: company || '—', interested_in: t.join(', ') || '—', message: message
        }),
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.ok ? res.json() : Promise.reject(new Error('HTTP ' + res.status));
      }).then(function (data) {
        clearTimeout(timer);
        if (!data || String(data.success) !== 'true') throw new Error((data && data.message) || 'not sent');
        finish('sent');
      }).catch(function (err) {
        clearTimeout(timer);
        if (window.console) console.warn('[brief] not sent:', err.message);
        finish('failed');
      });
    });

    $('[data-copy]', form).addEventListener('click', function () {
      var btn = this, text = 'To: info@bytessimplified.com\nSubject: ' + mail.subject + '\n\n' + mail.body;
      var copied = function () { btn.textContent = 'Copied'; setTimeout(function () { btn.textContent = 'Copy brief'; }, 2200); };
      function legacy() {
        var ta = document.createElement('textarea');
        ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
        document.body.appendChild(ta); ta.select();
        try { if (document.execCommand('copy')) copied(); } catch (err) { /* nothing more to try */ }
        document.body.removeChild(ta);
      }
      if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(text).then(copied, legacy);
      else legacy();
    });
    $('[data-edit]', form).addEventListener('click', function () { reopen(false); });
    $('[data-reset]', form).addEventListener('click', function () { reopen(true); });
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
