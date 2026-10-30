/* Bytes Simplified — particle scene (WebGL2, falls back to WebGL1)
   One fixed canvas behind the page. Particles morph between shapes as the
   visitor scrolls, over a rippling, reflective floor:
     0 sphere · 1 tree · 2 cube · 3 tangle · 4 pipeline · 5 phone · 6 logo
   Exposes window.BytesScene.create(canvas, options) → controller | null. */
(function () {
  'use strict';

  var TAU = Math.PI * 2;
  var FLOOR_Y = -2.05;
  var FOV = 38 * Math.PI / 180;

  // Bytes Simplified pixel mark, 2px cells, one hex string per row.
  var MARK_BITS = { w: 74, h: 68, rows: [
    "0000000000000000000",
    "00000001ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000007ff000000000",
    "000003fffc000000000",
    "000007ff003fe000000",
    "00000ffe007ff000000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00001ffc007ff800000",
    "00003ff800fffc00000",
    "000ffe00fffffff8000",
    "001ff801ffe03ffc000",
    "001ff801ffc01ffc000",
    "001ff801ffc00ffc000",
    "001ff001ffc00ffc000",
    "001ff001ffc00ffc000",
    "001ff001ffc00ffc000",
    "001ff001ffc00ffc000",
    "003ff001ffc007f8000",
    "003ff801ffe003f0000",
    "00fffc00fff80000000",
    "7ffffff000ffc000000",
    "fffffff8007fe000fe0",
    "fffffff8007fe000ff0",
    "fffffffc003fe001ff0",
    "fffffffc003fe001ff0",
    "fffffffc003fe001ff0",
    "fffffffc003fe001ff0",
    "fffffffc003ff000ff0",
    "fffffff8003ff800fe0",
    "fffffff8000ffff0180",
    "7ffffff000003ffc000",
    "007ff800ff001ffc000",
    "003ff801ff801ffc000",
    "001ff001ff801ffc000",
    "001ff001ff801ffc000",
    "001ff001ff801ffc000",
    "001ff001ff801ffc000",
    "001ff801ff801ffc000",
    "001ff801ffc03ffc000",
    "001ffc00fffffff8000",
    "0007fff003fffc00000",
    "00001ffc00fff800000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00000ffc007ff000000",
    "00000ffe007ff000000",
    "00000ffe003fe000000",
    "000007ff00078000000",
    "0000001ffe000000000",
    "00000007ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000003ff000000000",
    "00000001fe000000000",
    "0000000000000000000"
  ] };

  /* ------------------------------------------------------------ random */

  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function gauss(rnd) {
    return Math.sqrt(-2 * Math.log(1 - rnd())) * Math.cos(TAU * rnd());
  }
  function cumulative(weights) {
    var c = new Float64Array(weights.length), s = 0;
    for (var i = 0; i < weights.length; i++) { s += weights[i]; c[i] = s; }
    return { c: c, total: s };
  }
  function pick(cum, r) {
    var x = r * cum.total, lo = 0, hi = cum.c.length - 1;
    while (lo < hi) { var mid = (lo + hi) >> 1; if (cum.c[mid] < x) lo = mid + 1; else hi = mid; }
    return lo;
  }

  // Shuffle so any prefix of the buffer is an even sample of every shape —
  // lets slower devices draw fewer particles without regenerating anything.
  function shuffle(pos, tint, rnd) {
    for (var i = tint.length - 1; i > 0; i--) {
      var j = Math.floor(rnd() * (i + 1)), t = tint[i];
      tint[i] = tint[j]; tint[j] = t;
      for (var k = 0; k < 3; k++) {
        t = pos[i * 3 + k]; pos[i * 3 + k] = pos[j * 3 + k]; pos[j * 3 + k] = t;
      }
    }
  }

  /* ------------------------------------------------------------ shapes */

  // A fountain-like tree: a narrow trunk rising out of the water that flares
  // into streams, feeding a broad, cloud-like crown of particle clumps.
  function makeTree(N, rnd) {
    var pos = new Float32Array(N * 3), tint = new Float32Array(N);
    var top = FLOOR_Y + 1.1;                         // where the trunk flares out
    var cy = top + 1.2, CX = 2.7, CY = 1.38, CZ = 2.0;   // crown ellipsoid
    var blobs = [];
    for (var b = 0; b < 78; b++) {
      var az = rnd() * TAU, el = -.55 + Math.pow(rnd(), .9) * 2.1, s = .55 + .45 * Math.sqrt(rnd());
      blobs.push({
        c: [Math.cos(el) * Math.cos(az) * CX * s, cy + Math.sin(el) * CY * s, Math.cos(el) * Math.sin(az) * CZ * s],
        r: .3 + rnd() * .34, s: s
      });
    }
    var blobW = cumulative(blobs.map(function (b) { return b.r * b.r; }));

    for (var i = 0; i < N; i++) {
      var u = rnd(), x, y, z, t, q, a, rad;
      if (u < .08) {                        // trunk: narrow, swirling, flaring at the top
        q = rnd();
        rad = (.03 + .26 * Math.pow(q, 3)) * Math.sqrt(rnd());
        a = rnd() * TAU + q * 12;
        x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = FLOOR_Y + q * (top - FLOOR_Y + .1);
        t = .82 + .18 * rnd();
      } else if (u < .27) {                 // streams fanning out from the trunk to the crown
        var bl = blobs[pick(blobW, rnd())];
        q = Math.pow(rnd(), .8);
        var iq = 1 - q, sx = gauss(rnd) * .05, sz = gauss(rnd) * .05, sy = top - .15;
        var mx = bl.c[0] * .45, my = top + (bl.c[1] - top) * .5 + .3, mz = bl.c[2] * .45;
        x = iq * iq * sx + 2 * iq * q * mx + q * q * bl.c[0];
        y = iq * iq * sy + 2 * iq * q * my + q * q * bl.c[1];
        z = iq * iq * sz + 2 * iq * q * mz + q * q * bl.c[2];
        rad = (.025 + .09 * q) * Math.sqrt(rnd()); a = rnd() * TAU;
        x += Math.cos(a) * rad; z += Math.sin(a) * rad; y += gauss(rnd) * .03;
        t = .85 - .35 * q;
      } else if (u < .955) {                // crown clumps — brighter cores, violet edges
        var c = blobs[pick(blobW, rnd())];
        var gx = gauss(rnd) * c.r * .42, gy = gauss(rnd) * c.r * .36, gz = gauss(rnd) * c.r * .42;
        x = c.c[0] + gx; y = c.c[1] + gy; z = c.c[2] + gz;
        var nd = Math.sqrt(gx * gx + gy * gy + gz * gz) / c.r;
        t = (.24 + .6 * Math.exp(-nd * nd * 2.6)) * (1.25 - .45 * c.s);
      } else if (u < .975) {                // splash where the trunk meets the water
        a = rnd() * TAU; rad = .05 + Math.pow(rnd(), 2) * .45;
        x = Math.cos(a) * rad; z = Math.sin(a) * rad; y = FLOOR_Y + rnd() * .28 * (1 - rad);
        t = .6;
      } else {                              // loose sparkles drifting around the crown
        x = gauss(rnd) * CX * .75; y = cy + gauss(rnd) * .9; z = gauss(rnd) * CZ * .75;
        t = .15 + rnd() * .35;
      }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; tint[i] = t;
    }
    shuffle(pos, tint, rnd);
    return { pos: pos, tint: tint };
  }

  // Rasterise lines of text and return `count` points, x in [-1,1], y scaled by aspect.
  function textPoints(lines, count, rnd) {
    var W = 640, H = 320, cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    var g = cv.getContext('2d', { willReadFrequently: true });
    var widest = lines.reduce(function (a, b) { return b.length > a.length ? b : a; });
    g.font = '700 100px Geist, "Helvetica Neue", Arial, sans-serif';
    var size = Math.min(124, 100 * (W * .9) / g.measureText(widest).width);
    g.font = '700 ' + size + 'px Geist, "Helvetica Neue", Arial, sans-serif';
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.setTransform(1, 0, -.2, 1, H * .1, 0);            // italic shear
    var lh = size * 1.02;
    lines.forEach(function (l, i) { g.fillText(l, W / 2, H / 2 + (i - (lines.length - 1) / 2) * lh); });
    var d = g.getImageData(0, 0, W, H).data, px = [];
    for (var y = 0; y < H; y++) for (var x = 0; x < W; x++) if (d[(y * W + x) * 4 + 3] > 140) px.push(x, y);
    var out = new Float32Array(count * 2), n = px.length / 2;
    for (var k = 0; k < count && n; k++) {
      var j = Math.floor(rnd() * n) * 2;
      out[k * 2] = (px[j] + rnd()) / W * 2 - 1;
      out[k * 2 + 1] = (1 - (px[j + 1] + rnd()) / H * 2) * (H / W);
    }
    return out;
  }

  function markCells() {
    var b = MARK_BITS, cells = [], edge = [];
    function on(x, y) {
      if (x < 0 || y < 0 || x >= b.w || y >= b.h) return 0;
      return (parseInt(b.rows[y][x >> 2], 16) >> (3 - (x & 3))) & 1;
    }
    for (var y = 0; y < b.h; y++) for (var x = 0; x < b.w; x++) {
      if (!on(x, y)) continue;
      cells.push(x, y);
      if (!on(x - 1, y) || !on(x + 1, y) || !on(x, y - 1) || !on(x, y + 1)) edge.push(x, y);
    }
    return { w: b.w, h: b.h, cells: cells, edge: edge };
  }

  function makeCube(N, rnd, mark) {
    var S = 1.2, pos = new Float32Array(N * 3), tint = new Float32Array(N);
    var nEdge = Math.floor(N * .2), nText = Math.floor(N * .09), nMark = Math.floor(N * .045);
    var text = textPoints(['Bytes', 'Simplified'], nText, rnd);
    var edges = [];
    for (var ax = 0; ax < 3; ax++) for (var sa = -1; sa <= 1; sa += 2) for (var sb = -1; sb <= 1; sb += 2) edges.push([ax, sa, sb]);
    for (var i = 0; i < N; i++) {
      var p = [0, 0, 0], t;
      if (i < nEdge) {
        var e = edges[Math.floor(rnd() * 12)], a = e[0];
        p[a] = (rnd() * 2 - 1) * S; p[(a + 1) % 3] = e[1] * S; p[(a + 2) % 3] = e[2] * S;
        for (var k = 0; k < 3; k++) p[k] += gauss(rnd) * .006;
        t = 1;
      } else if (i < nEdge + nText) {      // "Bytes Simplified" on the +z face
        var j = i - nEdge;
        p = [text[j * 2] * S * .88, text[j * 2 + 1] * S * .88, S + .015];
        t = 1.3;
      } else if (i < nEdge + nText + nMark) { // pixel mark on the -x face
        var c = Math.floor(rnd() * mark.cells.length / 2) * 2;
        var mx = (mark.cells[c] + rnd()) / mark.w * 2 - 1, my = 1 - (mark.cells[c + 1] + rnd()) / mark.h * 2;
        p = [-S - .015, my * S * .56 * (mark.h / mark.w), mx * S * .56];
        t = 1.15;
      } else {                               // glittering faces
        var f = Math.floor(rnd() * 6), fa = f >> 1, fs = f & 1 ? 1 : -1;
        p[fa] = fs * S * (1 - rnd() * .03);
        p[(fa + 1) % 3] = (rnd() * 2 - 1) * S; p[(fa + 2) % 3] = (rnd() * 2 - 1) * S;
        t = .16 + .22 * Math.pow(rnd(), 3) + (rnd() < .025 ? .6 : 0);
      }
      pos[i * 3] = p[0]; pos[i * 3 + 1] = p[1]; pos[i * 3 + 2] = p[2]; tint[i] = t;
    }
    shuffle(pos, tint, rnd);
    return { pos: pos, tint: tint };
  }

  // Walk the outline of a rounded rectangle centred on the origin, t in [0,1).
  function roundedRect(w, h, r) {
    var sw = w - 2 * r, sh = h - 2 * r, q = Math.PI * r / 2;
    var lens = [sw, q, sh, q, sw, q, sh, q], total = 2 * sw + 2 * sh + 4 * q, hw = w / 2, hh = h / 2;
    return function (t) {
      var d = t * total, i = 0, a;
      while (i < 7 && d > lens[i]) { d -= lens[i]; i++; }
      switch (i) {
        case 0: return [-hw + r + d, hh];
        case 1: a = Math.PI / 2 - d / r; return [hw - r + Math.cos(a) * r, hh - r + Math.sin(a) * r];
        case 2: return [hw, hh - r - d];
        case 3: a = -d / r; return [hw - r + Math.cos(a) * r, -hh + r + Math.sin(a) * r];
        case 4: return [hw - r - d, -hh];
        case 5: a = -Math.PI / 2 - d / r; return [-hw + r + Math.cos(a) * r, -hh + r + Math.sin(a) * r];
        case 6: return [-hw, -hh + r + d];
        default: a = Math.PI - d / r; return [-hw + r + Math.cos(a) * r, hh - r + Math.sin(a) * r];
      }
    };
  }
  function inRoundedRect(x, y, w, h, r) {
    var ax = Math.abs(x) - (w / 2 - r), ay = Math.abs(y) - (h / 2 - r);
    if (ax <= 0 || ay <= 0) return Math.abs(x) <= w / 2 && Math.abs(y) <= h / 2;
    return ax * ax + ay * ay <= r * r;
  }
  function fillRoundedRect(w, h, r, rnd) {
    for (;;) {
      var x = (rnd() - .5) * w, y = (rnd() - .5) * h;
      if (inRoundedRect(x, y, w, h, r)) return [x, y];
    }
  }

  function makePhone(N, rnd) {
    var W = 1.5, H = 3.05, R = .24, D = .13;
    var pos = new Float32Array(N * 3), tint = new Float32Array(N);
    var body = roundedRect(W, H, R);
    var icons = [];
    for (var r = 0; r < 5; r++) for (var c = 0; c < 4; c++) icons.push([-.495 + c * .33, H / 2 - .62 - r * .36, .45 + .5 * rnd()]);
    for (var c2 = 0; c2 < 4; c2++) icons.push([-.495 + c2 * .33, -H / 2 + .4, .6 + .35 * rnd()]);
    var icon = roundedRect(.23, .23, .065), card = roundedRect(1.3, .38, .1);
    var bounds = [.17, .26, .31, .44, .80, .84, .86, .94, 1];
    for (var i = 0; i < N; i++) {
      var u = i / N, x, y, z = D / 2 + .004, t, p;
      if (u < bounds[0]) { p = body(rnd()); x = p[0]; y = p[1]; t = .95; }
      else if (u < bounds[1]) { p = body(rnd()); x = p[0]; y = p[1]; z = -D / 2; t = .6; }
      else if (u < bounds[2]) { p = body(rnd()); x = p[0]; y = p[1]; z = (rnd() - .5) * D; t = .45; }
      else if (u < bounds[3]) { p = fillRoundedRect(W - .12, H - .12, R - .05, rnd); x = p[0]; y = p[1]; t = .13 + (rnd() < .03 ? .5 : 0); }
      else if (u < bounds[4]) {
        var ic = icons[Math.floor(rnd() * icons.length)];
        var rim = rnd() < .32;
        p = rim ? icon(rnd()) : fillRoundedRect(.23, .23, .065, rnd);
        x = ic[0] + p[0]; y = ic[1] + p[1]; z += .006; t = ic[2] * (rim ? 1.15 : .8);
      }
      else if (u < bounds[5]) { p = fillRoundedRect(.42, .11, .055, rnd); x = p[0]; y = H / 2 - .17 + p[1]; t = 1; }
      else if (u < bounds[6]) { x = (rnd() - .5) * .5; y = -H / 2 + .11; t = .9; }
      else if (u < bounds[7]) {             // floating "published" notification
        var k = rnd();
        if (k < .45) { p = card(rnd()); t = .9; }
        else if (k < .7) { p = fillRoundedRect(1.3, .38, .1, rnd); t = .22; }
        else if (k < .85) { p = [-.36 + rnd() * .7, .06]; t = .75; }
        else if (k < .93) { p = [-.36 + rnd() * .45, -.07]; t = .6; }
        else { p = fillRoundedRect(.2, .2, .05, rnd); p[0] -= .5; t = 1.1; }
        x = .38 + p[0]; y = .62 + p[1]; z = D / 2 + .36;
      }
      else { x = gauss(rnd) * 1.3; y = gauss(rnd) * 1.8; z = gauss(rnd) * .8; t = .18; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; tint[i] = t;
    }
    shuffle(pos, tint, rnd);
    return { pos: pos, tint: tint };
  }

  function makeLogo(N, rnd, mark) {
    var pos = new Float32Array(N * 3), tint = new Float32Array(N);
    var size = 3.3, cell = size / mark.w, D = .34;
    for (var i = 0; i < N; i++) {
      var u = i / N, x, y, z, t, list, c;
      if (u < .88) {
        list = u < .55 ? mark.cells : mark.edge;
        c = Math.floor(rnd() * list.length / 2) * 2;
        x = (list[c] + rnd() - mark.w / 2) * cell;
        y = (mark.h / 2 - list[c + 1] - rnd()) * cell;
        if (u < .55) {
          z = rnd() < .7 ? (rnd() < .5 ? -D / 2 : D / 2) : (rnd() - .5) * D;
          t = .42 + .1 * rnd();
        } else {
          z = rnd() < .65 ? D / 2 : -D / 2;
          t = .95;
        }
      } else { x = gauss(rnd) * 1.5; y = gauss(rnd) * 1.25; z = gauss(rnd) * .8; t = .16; }
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z; tint[i] = t;
    }
    shuffle(pos, tint, rnd);
    return { pos: pos, tint: tint };
  }

  function makeStars(n, rnd) {
    var a = new Float32Array(n * 4);
    for (var i = 0; i < n; i++) {
      var th = rnd() * TAU, ph = Math.acos(2 * rnd() - 1), r = 38 + rnd() * 40;
      a[i * 4] = r * Math.sin(ph) * Math.cos(th);
      a[i * 4 + 1] = Math.abs(r * Math.cos(ph)) * .9 - 6;   // keep stars above the water line
      a[i * 4 + 2] = r * Math.sin(ph) * Math.sin(th) - 12;
      a[i * 4 + 3] = rnd();
    }
    return a;
  }

  /* ------------------------------------------------------------ shaders */

  var COMMON = [
    'const float TAU = 6.2831853;',
    'const float FLOOR_Y = ' + FLOOR_Y.toFixed(3) + ';',
    'mat3 rotY(float a) { float c = cos(a), s = sin(a); return mat3(c, 0., -s, 0., 1., 0., s, 0., c); }',
    'mat3 rotX(float a) { float c = cos(a), s = sin(a); return mat3(1., 0., 0., 0., c, s, 0., -s, c); }',
    'mat3 rotZ(float a) { float c = cos(a), s = sin(a); return mat3(c, s, 0., -s, c, 0., 0., 0., 1.); }'
  ].join('\n');

  var PARTICLE_VS = 'precision highp float;\n' + COMMON + '\n' + [
    'attribute vec4 aSeed;',
    'attribute vec3 aTree;',
    'attribute vec3 aCube;',
    'attribute vec3 aPhone;',
    'attribute vec3 aLogo;',
    'attribute vec4 aTint;',
    'uniform mat4 uProj, uView;',
    'uniform float uTime, uMorph, uPR, uViewH, uSize, uAlpha, uReflect, uShock, uScale, uAspect;',
    'uniform vec3 uOffset, uPointer;',
    'uniform vec4 uNodes;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'float gFade = 1., gHue = -1.;',   // per-shape extras: lettering fade, edge hue

    'vec3 sphereShape(out float t) {',
    '  float th = aSeed.x * TAU + uTime * .06, ph = acos(2. * aSeed.y - 1.);',
    '  float r = 1.5 * (.84 + .16 * pow(aSeed.z, .3));',
    '  vec3 p = r * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));',
    '  p += .035 * vec3(sin(uTime * 1.3 + aSeed.w * 23.), sin(uTime * 1.1 + aSeed.x * 17.), sin(uTime * .9 + aSeed.y * 19.));',
    '  t = .3 + .45 * smoothstep(.9, 1., aSeed.z) + .5 * step(.985, aSeed.w);',
    '  return p + vec3(0., .25, 0.);',
    '}',

    'vec3 treeShape(out float t) {',
    '  vec3 p = aTree;',
    '  float h = p.y - FLOOR_Y;',
    '  p.x += sin(uTime * .55 + p.y * 1.3) * .035 * h;',
    '  p.z += cos(uTime * .45 + p.y * 1.1) * .03 * h;',
    '  t = aTint.x;',
    '  return rotY(uTime * .045) * p;',
    '}',

    'vec3 cubeShape(out float t) {',
    '  mat3 R = rotX(.42) * rotY(.2 + sin(uTime * .21) * .5);',
    '  t = aTint.y;',
    '  if (t > 1.05) {',            // lettering only shows on faces turned towards the camera
    '    vec3 n = step(1.21, abs(aCube)) * sign(aCube);',
    '    gFade = smoothstep(-.05, .4, (R * n).z);',
    '    t = mix(.25, t, gFade);',
    '  } else if (t > .99) {',
    '    gHue = clamp(aCube.y / 2.4 + .5, 0., 1.);',
    '  }',
    '  return R * aCube + vec3(0., .3, 0.);',
    '}',

    'vec3 knot(float u, float P, float Q, float R, float r) {',
    '  float c = cos(Q * u);',
    '  return vec3((R + r * c) * cos(P * u), (R + r * c) * sin(P * u), r * sin(Q * u) * 1.3);',
    '}',
    'vec3 tangleShape(out float t) {',      // a ball of yarn: five knotted loops, each in its own plane
    '  float k = floor(fract(aSeed.w * 7.31) * 5.);',
    '  float R = 1.02 + .07 * k, r = .42 + .05 * mod(k, 2.), sp = mod(k, 2.) < .5 ? .028 : -.024;',
    '  float u = (aSeed.x + uTime * sp) * TAU;',
    '  vec3 c = knot(u, 2., 3., R, r);',
    '  vec3 T = knot(u + .01, 2., 3., R, r) - c;',
    '  T /= max(length(T), 1e-5);',
    '  vec3 N = cross(T, vec3(.31, .52, .8));',
    '  N /= max(length(N), 1e-5);',
    '  vec3 B = cross(T, N);',
    '  float a = aSeed.y * TAU, rad = .03 + .2 * aSeed.z * aSeed.z * aSeed.z;',
    '  vec3 p = rotX(k * 1.27) * rotY(k * 2.1) * rotZ(k * .7) * (c + (N * cos(a) + B * sin(a)) * rad);',
    '  t = .25 + .65 * (1. - aSeed.z);',
    '  return rotY(uTime * .1) * rotX(.3) * p + vec3(0., .25, 0.);',
    '}',

    'float nodeX(float i) { return i < .5 ? uNodes.x : i < 1.5 ? uNodes.y : i < 2.5 ? uNodes.z : uNodes.w; }',
    'vec3 pipeShape(out float t) {',
    '  if (aSeed.w < .4) {',          // four glowing stage nodes
    '    float i = floor(fract(aSeed.x * 13.7) * 4.);',
    '    float th = aSeed.y * TAU + uTime * .5, ph = acos(2. * fract(aSeed.z * 7.3) - 1.);',
    '    float r = .36 * pow(aSeed.z, .55);',
    '    float pulse = .5 + .5 * sin(uTime * 1.8 - i * 1.5);',
    '    t = .35 + .6 * (1. - aSeed.z) * (.55 + .45 * pulse);',
    '    return vec3(nodeX(i), 0., 0.) + r * vec3(sin(ph) * cos(th), cos(ph), sin(ph) * sin(th));',
    '  }',
    '  float u = fract(aSeed.x + uTime * .05);',     // a braided stream flowing through them
    '  float x = mix(uNodes.x - .9, uNodes.w + .9, u);',
    '  float pinch = min(min(abs(x - uNodes.x), abs(x - uNodes.y)), min(abs(x - uNodes.z), abs(x - uNodes.w)));',
    '  float a = aSeed.y * TAU + u * 22. + uTime * .5;',
    '  float rad = (.04 + .2 * aSeed.z * aSeed.z) * (.3 + .7 * smoothstep(0., .6, pinch));',
    '  t = .3 + .45 * (1. - aSeed.z);',
    '  return vec3(x, sin(u * 9.42 + uTime * .4) * .1 + cos(a) * rad, sin(a) * rad);',
    '}',

    'vec3 phoneShape(out float t) {',
    '  t = aTint.z;',
    '  return rotY(sin(uTime * .3) * .35 - .3) * rotX(.08) * aPhone + vec3(0., .2, 0.);',
    '}',
    'vec3 logoShape(out float t) {',
    '  t = aTint.w;',
    '  return rotY(sin(uTime * .35) * .45) * aLogo + vec3(0., .25, 0.);',
    '}',

    'vec3 shape(float i, out float t) {',
    '  if (i < .5) return sphereShape(t);',
    '  if (i < 1.5) return treeShape(t);',
    '  if (i < 2.5) return cubeShape(t);',
    '  if (i < 3.5) return tangleShape(t);',
    '  if (i < 4.5) return pipeShape(t);',
    '  if (i < 5.5) return phoneShape(t);',
    '  return logoShape(t);',
    '}',

    'void main() {',
    '  float M = clamp(uMorph, 0., 6.);',
    '  float k = min(floor(M), 5.);',
    '  float S = .45;',
    '  float fl = clamp((M - k - aSeed.w * S) / (1. - S), 0., 1.);',
    '  fl = fl * fl * (3. - 2. * fl);',
    '  float t, tB;',
    '  vec3 p = shape(k, t);',
    '  float fade = gFade, hue = gHue;',
    '  if (fl > 0.) {',
    '    gFade = 1.; gHue = -1.;',
    '    vec3 B = shape(k + 1., tB);',
    '    p = mix(p, B, fl); t = mix(t, tB, fl);',
    '    fade = mix(fade, gFade, fl); hue = fl < .5 ? hue : gHue;',
    '  }',
    '  float tr = sin(3.14159 * fl);',
    '  if (tr > 0.) {',                 // particles swirl while they travel between shapes
    '    p += vec3(sin(p.y * 1.6 + uTime * .8 + aSeed.x * 6.), sin(p.z * 1.8 + uTime * .7 + aSeed.y * 6.),',
    '              sin(p.x * 1.4 + uTime * .9 + aSeed.z * 6.)) * tr * (.3 + .5 * aSeed.z);',
    '    t += tr * .15;',
    '  }',
    '  if (uShock >= 0.) {',            // shockwave rippling outwards through the shape
    '    vec3 d = p - vec3(0., .3, 0.);',
    '    float r = length(d);',
    '    float q = (r - uShock * 3.2) * 2.2;',
    '    float amp = exp(-q * q) * exp(-uShock * 1.1) * .22;',
    '    p += d / max(r, .001) * amp;',
    '    t += amp * 1.5;',
    '  }',
    '  vec3 w = p * uScale + uOffset;',
    '  float alpha = uAlpha * mix(.1, 1., fade);',
    '  if (uReflect > .5) {',
    '    alpha *= .16 * exp(-max(w.y - FLOOR_Y, 0.) * .45);',
    '    w.y = 2. * FLOOR_Y - w.y;',
    '    w.x += sin(w.z * 3. + uTime * 1.2) * .03;',
    '  }',
    '  vec4 mv = uView * vec4(w, 1.);',
    '  vec4 clip = uProj * mv;',
    '  if (uPointer.z > 0.) {',         // gently part the particles around the cursor
    '    vec2 dv = (clip.xy / clip.w - uPointer.xy) * vec2(uAspect, 1.);',
    '    float dl = length(dv);',
    '    float push = uPointer.z * (1. - smoothstep(0., .25, dl)) * .07;',
    '    clip.xy += dv / max(dl, 1e-4) / vec2(uAspect, 1.) * push * clip.w;',
    '  }',
    '  gl_Position = clip;',
    '  float depth = max(-mv.z, .1);',
    '  float sz = uSize * (.55 + .95 * aSeed.y * aSeed.y) * (.85 + t * .55);',
    '  float ps = sz * uPR * (uViewH / 900.) * (8.6 / depth);',
    '  gl_PointSize = ps > 1. ? min(ps, 48.) : 1.;',
    '  vec3 deep = vec3(.16, .4, 1.), violet = vec3(.5, .36, 1.), cyan = vec3(.4, .82, 1.), pink = vec3(.84, .42, 1.);',
    '  vec3 c = mix(deep, violet, smoothstep(.45, 1., aSeed.x));',
    '  c = mix(c, pink, smoothstep(.93, 1., aSeed.z) * .6);',
    '  c = mix(c, cyan, smoothstep(.45, 1., t) * .75);',
    '  c = mix(c, vec3(1.), smoothstep(.95, 1.35, t) * .8);',
    '  if (hue >= 0.) c = mix(vec3(.36, .86, 1.), vec3(.74, .48, 1.), hue);',
    '  float tw = .7 + .3 * sin(uTime * (1. + aSeed.z * 3.) + aSeed.x * 40.);',
    '  vColor = c;',
    '  vAlpha = (.26 + .85 * clamp(t, 0., 1.4)) * tw * alpha;',
    '}'
  ].join('\n');

  var POINT_FS = [
    'precision mediump float;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  vec2 q = gl_PointCoord * 2. - 1.;',
    '  float r2 = dot(q, q);',
    '  if (r2 > 1.) discard;',
    '  float a = vAlpha * max(exp(-r2 * 3.2) - .04, 0.);',
    '  gl_FragColor = vec4(vColor * a, a);',
    '}'
  ].join('\n');

  var STAR_VS = [
    'precision highp float;',
    'attribute vec4 aStar;',
    'uniform mat4 uProj, uView;',
    'uniform float uTime, uPR;',
    'varying vec3 vColor;',
    'varying float vAlpha;',
    'void main() {',
    '  float a = uTime * .004, s = aStar.w;',
    '  vec3 p = vec3(aStar.x * cos(a) - aStar.z * sin(a), aStar.y, aStar.x * sin(a) + aStar.z * cos(a));',
    '  gl_Position = uProj * uView * vec4(p, 1.);',
    '  gl_PointSize = (1. + 1.8 * s * s) * uPR;',
    '  float tw = .55 + .45 * sin(uTime * (.6 + s * 2.2) + s * 50.);',
    '  vAlpha = (.25 + .6 * s) * tw;',
    '  vColor = s > .86 ? vec3(1., .45, .62) : s > .7 ? vec3(.6, .7, 1.) : vec3(.86, .9, 1.);',
    '}'
  ].join('\n');

  var FLOOR_VS = [
    'precision highp float;',
    'attribute vec2 aXZ;',
    'uniform mat4 uProj, uView;',
    'varying vec3 vW;',
    'void main() {',
    '  vW = vec3(aXZ.x, ' + FLOOR_Y.toFixed(3) + ', aXZ.y);',
    '  gl_Position = uProj * uView * vec4(vW, 1.);',
    '}'
  ].join('\n');

  var FLOOR_FS = [
    '#ifdef GL_FRAGMENT_PRECISION_HIGH', 'precision highp float;', '#else', 'precision mediump float;', '#endif',
    'varying vec3 vW;',
    'uniform float uTime, uShock, uAmount;',
    'uniform vec3 uCenter, uCam;',
    'uniform vec4 uRip0, uRip1, uRip2, uRip3;',   // pointer ripples: x, z, start time, strength
    'float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p) {',
    '  vec2 i = floor(p), f = fract(p); f = f * f * (3. - 2. * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1., 0.)), f.x), mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), f.x), f.y);',
    '}',
    'float ripple(vec4 r) {',              // branch-free: no loops, uniform arrays or early-outs
    '  float age = uTime - r.z;',
    '  float live = step(.001, r.w) * step(0., age) * step(age, 6.);',
    '  float rd = length(vW.xz - r.xy);',
    '  float q = (rd - age * 1.6) * 3.;',
    '  return live * exp(-q * q) * max(1. - age / 6., 0.) * r.w * exp(-rd * .12);',
    '}',
    'void main() {',
    '  vec2 p = vW.xz - uCenter.xz;',
    '  float d = length(p);',
    '  vec2 dir = p / max(d, 1e-3);',            // angle-periodic noise: no seam where atan wraps
    '  float warp = (noise(p * .42 + uTime * .05) - .5) * .8 + (noise(dir * 2.4 + d * .1) - .5) * .5;',
    '  float dd = d + warp;',
    '  float w1 = clamp(.5 + .5 * sin(dd * 3.3 - uTime * 1.15), 0., 1.);',
    '  float w2 = clamp(.5 + .5 * sin(dd * 6.9 - uTime * 1.8 + 1.3), 0., 1.);',
    '  float ring = pow(w1, 42.) + .1 * pow(w1, 5.) + .32 * pow(w2, 70.);',
    '  float streak = noise(dir * 7. + vec2(dd * 1.1 - uTime * .25, dd * .8));',
    '  ring *= .3 + 1.25 * streak;',
    '  vec3 col = mix(vec3(.13, .32, 1.), vec3(.45, .28, 1.), smoothstep(1.5, 8., d) * .7 + .3 * streak) * ring * exp(-d * .19) * .95;',
    '  col += vec3(.08, .2, .8) * exp(-d * d * .6) * .14;',
    '  col += vec3(.02, .04, .13) * noise(p * 1.7 + uTime * .1) * exp(-d * .08);',
    '  col += vec3(.35, .55, 1.) * .8 * (ripple(uRip0) + ripple(uRip1) + ripple(uRip2) + ripple(uRip3));',
    '  float sq = (d - max(uShock, 0.) * 3.) * 2.;',
    '  col += vec3(.4, .5, 1.) * step(0., uShock) * exp(-sq * sq) * exp(-max(uShock, 0.) * .7);',
    '  col *= (1. - smoothstep(10., 38., length(vW - uCam))) * uAmount;',
    '  gl_FragColor = vec4(col, 1.);',
    '}'
  ].join('\n');

  /* ------------------------------------------------------------ GL helpers */

  function compile(gl, type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  }
  function program(gl, vs, fs, attribs) {
    var p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs));
    attribs.forEach(function (name, i) { gl.bindAttribLocation(p, i, name); });
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) {
      var name = gl.getActiveUniform(p, i).name;
      u[name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, name);
    }
    return { p: p, u: u };
  }
  function buffer(gl, data) {
    var b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    return b;
  }
  // Point attribute locations 0..n at [buffer, size] pairs and switch the rest off.
  function useAttribs(gl, list) {
    for (var i = 0; i < 6; i++) {
      if (i < list.length) {
        gl.bindBuffer(gl.ARRAY_BUFFER, list[i][0]);
        gl.enableVertexAttribArray(i);
        gl.vertexAttribPointer(i, list[i][1], gl.FLOAT, false, 0, 0);
      } else {
        gl.disableVertexAttribArray(i);
      }
    }
  }

  function perspective(fovy, aspect, near, far) {
    var f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    return new Float32Array([f / aspect, 0, 0, 0, 0, f, 0, 0, 0, 0, (far + near) * nf, -1, 0, 0, 2 * far * near * nf, 0]);
  }
  function lookAt(e, c) {
    var zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz);
    zx /= l; zy /= l; zz /= l;
    var xx = zz, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;   // right = up × z, with up = +y
    var yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx;
    return new Float32Array([xx, yx, zx, 0, 0, yy, zy, 0, xz, yz, zz, 0,
      -(xx * e[0] + xz * e[2]), -(yx * e[0] + yy * e[1] + yz * e[2]), -(zx * e[0] + zy * e[1] + zz * e[2]), 1]);
  }

  // Critically damped spring (implicit Euler, stable for any dt).
  function spring(s, key, target, omega, dt) {
    var v = s[key + 'V'] || 0, x = s[key];
    var f = 1 + 2 * dt * omega, oo = omega * omega, hoo = dt * oo, hhoo = dt * hoo, inv = 1 / (f + hhoo);
    s[key] = (f * x + dt * v + hhoo * target) * inv;
    s[key + 'V'] = (v + hoo * (target - x)) * inv;
  }

  /* ------------------------------------------------------------ engine */

  function create(canvas, opts) {
    opts = opts || {};
    var attrs = { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' };
    var gl = canvas.getContext('webgl2', attrs) || canvas.getContext('webgl', attrs);
    if (!gl || !MARK_BITS) return null;

    var N = opts.count || 52000;
    var rnd = mulberry32(20260330);
    var mark = markCells();

    var progMain, progStar, progFloor;
    try {
      progMain = program(gl, PARTICLE_VS, POINT_FS, ['aSeed', 'aTree', 'aCube', 'aPhone', 'aLogo', 'aTint']);
      progStar = program(gl, STAR_VS, POINT_FS, ['aStar']);
      progFloor = program(gl, FLOOR_VS, FLOOR_FS, ['aXZ']);
    } catch (err) {
      if (window.console) console.warn('[scene] shader error', err);
      return null;
    }

    var seeds = new Float32Array(N * 4);
    for (var i = 0; i < seeds.length; i++) seeds[i] = rnd();
    var tree = makeTree(N, rnd), cube = makeCube(N, rnd, mark), phone = makePhone(N, rnd), logo = makeLogo(N, rnd, mark);
    var tints = new Float32Array(N * 4);
    for (i = 0; i < N; i++) {
      tints[i * 4] = tree.tint[i]; tints[i * 4 + 1] = cube.tint[i];
      tints[i * 4 + 2] = phone.tint[i]; tints[i * 4 + 3] = logo.tint[i];
    }

    var cubeBuf = buffer(gl, cube.pos), tintBuf = buffer(gl, tints);
    var meshMain = [[buffer(gl, seeds), 4], [buffer(gl, tree.pos), 3], [cubeBuf, 3], [buffer(gl, phone.pos), 3], [buffer(gl, logo.pos), 3], [tintBuf, 4]];
    var STARS = 1500;
    var meshStar = [[buffer(gl, makeStars(STARS, rnd)), 4]];
    var meshFloor = [[buffer(gl, new Float32Array([-60, -60, 60, -60, -60, 60, 60, 60])), 2]];

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.clearColor(3 / 255, 4 / 255, 10 / 255, 1);

    /* state ---------------------------------------------------------- */
    var cur = { morph: 0, cx: 0, cy: 1, cz: 9, lx: 0, ly: 0, lz: 0, ox: 0, oy: 0, oz: 0, sc: 1, fl: 1, al: 1, px: 0, py: 0 };
    var tgt = { morph: 0, cam: [0, 1, 9], look: [0, 0, 0], off: [0, 0, 0], scale: 1, floor: 1, alpha: 1 };
    var nodes = [-3.3, -1.1, 1.1, 3.3];
    var pointer = { x: 0, y: 0, on: 0, k: 0 };
    var ripples = new Float32Array(16), rippleNext = 0;
    var time = 0, shockAt = -1, last = 0, raf = 0;
    var running = !opts.still, still = !!opts.still;
    var dprCap = opts.dprCap || 1.5, dpr = 1, W = 1, H = 1, aspect = 1;
    var drawCount = N, reflections = true, quality = 0;
    var bootAt = 0, winAt = 0, winFrames = 0, winSlow = 0;
    var eye = [0, 1, 9], look = [0, 0, 0];

    function resize() {
      dpr = Math.min(window.devicePixelRatio || 1, dprCap);
      W = Math.max(1, Math.round(canvas.clientWidth * dpr));
      H = Math.max(1, Math.round(canvas.clientHeight * dpr));
      if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
      aspect = W / H;
      gl.viewport(0, 0, W, H);
      requestFrame();
    }

    // Narrow / portrait screens pull the camera back so shapes still fit.
    function fit() { return Math.pow(Math.max(1, 1.5 / aspect), .5); }

    function step(dt) {
      var om = still ? 0 : 2.6;
      if (still) {
        cur.morph = tgt.morph; cur.morphV = 0;
        cur.cx = tgt.cam[0]; cur.cy = tgt.cam[1]; cur.cz = tgt.cam[2];
        cur.lx = tgt.look[0]; cur.ly = tgt.look[1]; cur.lz = tgt.look[2];
        cur.ox = tgt.off[0]; cur.oy = tgt.off[1]; cur.oz = tgt.off[2];
        cur.sc = tgt.scale; cur.fl = tgt.floor; cur.al = tgt.alpha;
      } else {
        spring(cur, 'morph', tgt.morph, om * .9, dt);
        spring(cur, 'cx', tgt.cam[0], om, dt); spring(cur, 'cy', tgt.cam[1], om, dt); spring(cur, 'cz', tgt.cam[2], om, dt);
        spring(cur, 'lx', tgt.look[0], om, dt); spring(cur, 'ly', tgt.look[1], om, dt); spring(cur, 'lz', tgt.look[2], om, dt);
        spring(cur, 'ox', tgt.off[0], om, dt); spring(cur, 'oy', tgt.off[1], om, dt); spring(cur, 'oz', tgt.off[2], om, dt);
        spring(cur, 'sc', tgt.scale, om, dt); spring(cur, 'fl', tgt.floor, om, dt); spring(cur, 'al', tgt.alpha, om, dt);
        spring(cur, 'px', pointer.x * pointer.on, 1.8, dt); spring(cur, 'py', pointer.y * pointer.on, 1.8, dt);
        pointer.k += ((pointer.on && !still ? 1 : 0) - pointer.k) * Math.min(1, dt * 4);
      }
      var k = fit();
      look = [cur.lx, cur.ly, cur.lz];
      eye = [cur.lx + (cur.cx - cur.lx) * k + cur.px * .35, cur.ly + (cur.cy - cur.ly) * k + cur.py * .2, cur.lz + (cur.cz - cur.lz) * k];
    }

    function draw() {
      var proj = perspective(FOV, aspect, .1, 140), view = lookAt(eye, look);
      var shock = shockAt < 0 ? -1 : time - shockAt;
      if (shock > 5) { shockAt = -1; shock = -1; }
      gl.clear(gl.COLOR_BUFFER_BIT);

      // Additive blending is order-independent, so the particles go first: on
      // Radeon 890M (Mesa 26) the big point draw right after the floor quad hung the GPU.
      var u = progMain.u;
      gl.useProgram(progMain.p);
      gl.uniformMatrix4fv(u.uProj, false, proj);
      gl.uniformMatrix4fv(u.uView, false, view);
      gl.uniform1f(u.uTime, time);
      gl.uniform1f(u.uMorph, cur.morph);
      gl.uniform1f(u.uPR, dpr);
      gl.uniform1f(u.uViewH, H / dpr);
      gl.uniform1f(u.uSize, opts.size || 2.9);
      gl.uniform1f(u.uAlpha, cur.al * Math.pow(N / drawCount, .35));
      gl.uniform1f(u.uShock, shock);
      gl.uniform1f(u.uScale, cur.sc);
      gl.uniform1f(u.uAspect, aspect);
      gl.uniform3f(u.uOffset, cur.ox, cur.oy, cur.oz);
      gl.uniform3f(u.uPointer, pointer.x, pointer.y, pointer.k);
      gl.uniform4f(u.uNodes, nodes[0], nodes[1], nodes[2], nodes[3]);
      useAttribs(gl, meshMain);
      if (reflections) {
        gl.uniform1f(u.uReflect, 1);
        gl.drawArrays(gl.POINTS, 0, drawCount);
      }
      gl.uniform1f(u.uReflect, 0);
      gl.drawArrays(gl.POINTS, 0, drawCount);

      gl.useProgram(progStar.p);
      gl.uniformMatrix4fv(progStar.u.uProj, false, proj);
      gl.uniformMatrix4fv(progStar.u.uView, false, view);
      gl.uniform1f(progStar.u.uTime, time);
      gl.uniform1f(progStar.u.uPR, dpr);
      useAttribs(gl, meshStar);
      gl.drawArrays(gl.POINTS, 0, STARS);

      gl.useProgram(progFloor.p);
      gl.uniformMatrix4fv(progFloor.u.uProj, false, proj);
      gl.uniformMatrix4fv(progFloor.u.uView, false, view);
      gl.uniform1f(progFloor.u.uTime, time);
      gl.uniform1f(progFloor.u.uShock, shock);
      gl.uniform1f(progFloor.u.uAmount, cur.fl);
      gl.uniform3f(progFloor.u.uCenter, cur.ox, 0, cur.oz);
      gl.uniform3f(progFloor.u.uCam, eye[0], eye[1], eye[2]);
      gl.uniform4fv(progFloor.u.uRip0, ripples.subarray(0, 4));
      gl.uniform4fv(progFloor.u.uRip1, ripples.subarray(4, 8));
      gl.uniform4fv(progFloor.u.uRip2, ripples.subarray(8, 12));
      gl.uniform4fv(progFloor.u.uRip3, ripples.subarray(12, 16));
      useAttribs(gl, meshFloor);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    // Step quality down when most frames in a 1.5s window run long, after a
    // 1.5s settling period — time-based, so slow devices adapt within seconds.
    function govern(now, ms) {
      if (opts.adaptive === false || quality >= 3) return;
      if (!bootAt) bootAt = now;
      if (now - bootAt < 1500) return;
      if (!winAt) winAt = now;
      winFrames++;
      if (ms > 26) winSlow++;
      if (now - winAt < 1500) return;
      if (winSlow > winFrames / 2) {
        quality++;
        if (quality === 1) { dprCap = 1; resize(); }
        else if (quality === 2) { drawCount = Math.floor(N * .6); }
        else { drawCount = Math.floor(N * .4); reflections = false; }
      }
      winAt = now; winFrames = 0; winSlow = 0;
    }

    function frame(now) {
      raf = 0;
      if (gl.isContextLost()) return;
      var ms = last ? now - last : 16;
      var dt = Math.min(.1, ms / 1000);   // real-time motion down to 10fps
      last = now;
      if (!still) time += dt;
      step(dt);
      draw();
      if (running && !still) { govern(now, ms); raf = requestAnimationFrame(frame); }
      else last = 0;
    }
    function requestFrame() { if (!raf) raf = requestAnimationFrame(frame); }

    function onVisibility() {
      if (document.hidden) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; }
      else requestFrame();
    }
    function onLost(e) {
      e.preventDefault();
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      if (opts.onLost) opts.onLost();
    }
    function onRestored() { if (opts.onRestored) opts.onRestored(); }
    document.addEventListener('visibilitychange', onVisibility);
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    resize();

    return {
      count: N,
      resize: resize,
      setTarget: function (s) {
        tgt.morph = s.morph; tgt.cam = s.cam; tgt.look = s.look; tgt.off = s.off;
        tgt.scale = s.scale; tgt.floor = s.floor; tgt.alpha = s.alpha;
        if (still) requestFrame();
      },
      // Jump straight to the current target (no tween) — used when the page loads mid-scroll.
      snap: function () {
        var was = still; still = true; step(0); still = was;
        cur.morphV = 0; requestFrame();
      },
      setMorph: function (m) { cur.morph = m; cur.morphV = 0; },
      setNodes: function (xs) { nodes = xs; if (still) requestFrame(); },
      setPointer: function (x, y, on) { pointer.x = x; pointer.y = y; pointer.on = on ? 1 : 0; },
      shock: function () { if (!still) shockAt = time; },
      // Drop a ripple on the water where the pointer ray meets the floor.
      ripple: function (nx, ny, amp) {
        if (still) return;
        var fx = look[0] - eye[0], fy = look[1] - eye[1], fz = look[2] - eye[2], l = Math.hypot(fx, fy, fz);
        fx /= l; fy /= l; fz /= l;
        var rx = -fz, rz = fx; l = Math.hypot(rx, rz); rx /= l; rz /= l;            // right = forward × up
        var ux = -rz * fy, uy = rz * fx - rx * fz, uz = rx * fy;                     // up = right × forward
        var th = Math.tan(FOV / 2);
        var dx = fx + nx * th * aspect * rx + ny * th * ux, dy = fy + ny * th * uy, dz = fz + nx * th * aspect * rz + ny * th * uz;
        if (dy >= -1e-3) return;
        var t = (FLOOR_Y - eye[1]) / dy, hx = eye[0] + dx * t, hz = eye[2] + dz * t;
        if (Math.hypot(hx - cur.ox, hz - cur.oz) > 22) return;
        ripples.set([hx, hz, time, amp], rippleNext * 4);
        rippleNext = (rippleNext + 1) % 4;
      },
      setStill: function (v) {
        still = !!v;
        if (still) { if (raf) cancelAnimationFrame(raf); raf = 0; last = 0; requestFrame(); }
        else { running = true; requestFrame(); }
      },
      // Rebuild the cube once the brand font has loaded so the face lettering uses it.
      refreshCube: function () {
        var c = makeCube(N, mulberry32(77), mark);
        gl.bindBuffer(gl.ARRAY_BUFFER, cubeBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, c.pos);
        for (var j = 0; j < N; j++) tints[j * 4 + 1] = c.tint[j];
        gl.bindBuffer(gl.ARRAY_BUFFER, tintBuf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, tints);
        requestFrame();
      },
      destroy: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = 0;
        document.removeEventListener('visibilitychange', onVisibility);
        canvas.removeEventListener('webglcontextlost', onLost);
        canvas.removeEventListener('webglcontextrestored', onRestored);
      },
      fov: FOV,
      fit: fit,
      aspect: function () { return aspect; },
      start: function () { running = true; requestFrame(); }
    };
  }

  window.BytesScene = { create: create };
})();
