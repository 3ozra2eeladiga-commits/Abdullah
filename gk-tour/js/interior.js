/* Интерьер квартиры: «зайти внутрь» с настоящим 3D-городом за окнами.
   window.GKInterior = { enter(этаж, квартира), exit(), active(), go(комната), spots() }
   Квартира собирается параметрически (1-комнатная, евро-двушка, 2- и 3-комнатная) и ставится в южное крыло
   на реальную высоту выбранного этажа, окнами на юг — на улицу и город. Дом на время просмотра скрывается. */
(function () {
  'use strict';
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('interior')) return;
  var ctx = GKScene.ctx, T = ctx.T, GK = window.GK || {};
  var HC = 2.85, TW = 0.1, EYE = 1.55, FOV = 62, LG = 1.4;
  var ZS = 26.75 - 0.36;                                  // внутренняя грань южной стены дома
  var lin = function (h) { return new T.Color(h).convertSRGBToLinear(); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var C = {
    white: lin(0xffffff), wall: lin(0xe9e2d5), wallWarm: lin(0xe1d9ca), accent: lin(0x77726a), accent2: lin(0x8f9a8c), ceil: lin(0xfbf9f5),
    plaster: lin(0xf3efe7), skirt: lin(0xf6f3ec), graph: lin(0x34363a), graph2: lin(0x45474c), black: lin(0x141516), blackGl: lin(0x08090b),
    cream: lin(0xe9e1d2), creamL: lin(0xf2ecdf), boucle: lin(0xd8ccb8), boucleL: lin(0xe6dccb), taupe: lin(0x9c8f7d), linen: lin(0xf4f0e8),
    terra: lin(0xb9774f), olive: lin(0x7c8468), stone: lin(0xe7e2d8), stoneD: lin(0x2c2b2a), oak: lin(0xfbf3e8), oakD: lin(0xd2c2ae), walnut: lin(0x8a6a50),
    brass: lin(0xc9a063), steel: lin(0x9a9c9e), mirror: lin(0xd9dde0), pot: lin(0x3b3c3e), potL: lin(0xd9d2c4), trunk: lin(0x4a3a2c),
    leaf: lin(0x44623d), leaf2: lin(0x5a7a48), warm: lin(0xffd9a0), shade: lin(0xfff1d8), sheer: lin(0xf7f3ea), frame: lin(0x26282b), tile: lin(0xd8d3c8)
  };
  var seed = 1234;
  function rnd() { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 100000) / 100000; }
  var ctex = ctx.ctex || function (w, h, draw, rep) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t; };

  /* ================= текстуры ================= */
  var TEX = null;
  function textures() {
    if (TEX) return TEX;
    var joints = [], rows = 8, i;
    for (i = 0; i < rows; i++) joints.push([rnd(), 0.35 + rnd() * 0.3]);
    function wrapRect(g, w, x0, x1, y, h) { g.fillRect(x0, y, x1 - x0, h); if (x1 > w) g.fillRect(x0 - w, y, x1 - x0, h); }
    var parquet = ctex(1024, 1024, function (g, w, h) {
      var ph = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var p = 0; p < 2; p++) {
          var t = 0.94 + rnd() * 0.12, wr = rnd() * 6 - 3;
          g.fillStyle = 'rgb(' + Math.round((178 + wr) * t) + ',' + Math.round(145 * t) + ',' + Math.round((108 - wr) * t) + ')';
          var xa = joints[r][0] * w, xb = xa + joints[r][1] * w;
          if (p === 0) g.fillRect(0, r * ph, w, ph); else wrapRect(g, w, xa, xb, r * ph, ph);
        }
        for (var k = 0; k < 34; k++) {                     // волокна
          var y0 = r * ph + rnd() * ph, amp = rnd() * 3, f = 0.004 + rnd() * 0.01, pp = rnd() * 6;
          g.strokeStyle = rnd() > 0.35 ? 'rgba(92,60,30,' + (0.05 + rnd() * 0.1) + ')' : 'rgba(255,236,205,' + (0.05 + rnd() * 0.08) + ')';
          g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath();
          for (var x = 0; x <= w; x += 32) { var yy = clamp(y0 + Math.sin(x * f + pp) * amp, r * ph + 2, (r + 1) * ph - 2); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
          g.stroke();
        }
        g.fillStyle = 'rgba(46,28,14,.62)'; g.fillRect(0, r * ph, w, 1.6);
        g.fillRect(joints[r][0] * w, r * ph, 1.6, ph); g.fillRect((joints[r][0] + joints[r][1]) * w % w, r * ph, 1.6, ph);
      }
    }, 1);
    var parquetB = ctex(512, 512, function (g, w, h) {
      var ph = h / rows; g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 500; k++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; g.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 90, 1); }
      g.fillStyle = '#2a2a2a';
      for (var r = 0; r < rows; r++) { g.fillRect(0, r * ph - 1, w, 2.4); g.fillRect(joints[r][0] * w - 1, r * ph, 2.2, ph); g.fillRect((joints[r][0] + joints[r][1]) * w % w - 1, r * ph, 2.2, ph); }
    }, 1);
    var wood = ctex(512, 512, function (g, w, h) {
      g.fillStyle = '#b38f68'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 150; k++) {
        var x0 = rnd() * w, amp = rnd() * 5, f = 0.005 + rnd() * 0.012, pp = rnd() * 6;
        g.strokeStyle = rnd() > 0.4 ? 'rgba(84,54,28,' + (0.05 + rnd() * 0.13) + ')' : 'rgba(250,226,190,' + (0.05 + rnd() * 0.1) + ')';
        g.lineWidth = 0.6 + rnd() * 2.2; g.beginPath();
        for (var y = 0; y <= h; y += 32) { var xx = x0 + Math.sin(y * f + pp) * amp; if (y) g.lineTo(xx, y); else g.moveTo(xx, y); }
        g.stroke();
      }
    });
    var rug = ctex(512, 512, function (g, w, h) {
      g.fillStyle = '#e2d9c9'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 5000; k++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(90,76,58,.06)'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 1.5); }
      g.strokeStyle = 'rgba(128,112,92,.55)'; g.lineWidth = 3; g.strokeRect(22, 22, w - 44, h - 44);
      g.lineWidth = 1; g.strokeRect(32, 32, w - 64, h - 64);
      g.lineWidth = 14; g.strokeStyle = 'rgba(150,134,112,.34)'; g.beginPath(); g.arc(w * 0.2, h * 1.05, w * 0.62, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(70,68,66,.3)'; g.lineWidth = 5; g.beginPath(); g.arc(w * 0.95, h * 0.1, w * 0.5, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(185,119,79,.4)'; g.lineWidth = 4; g.beginPath(); g.arc(w * 0.62, h * 0.55, w * 0.2, 0, 7); g.stroke();
    });
    var art = ctex(1024, 512, function (g, w, h) {
      var tw = w / 4, bg = ['#efe8db', '#e9e2d4', '#f1ebe0', '#2f3134'];
      for (var t = 0; t < 4; t++) {
        g.save(); g.translate(t * tw, 0); g.beginPath(); g.rect(0, 0, tw, h); g.clip();
        g.fillStyle = '#faf8f3'; g.fillRect(0, 0, tw, h); g.fillStyle = bg[t]; g.fillRect(26, 34, tw - 52, h - 68);
        if (t === 0) { g.fillStyle = '#34363a'; g.beginPath(); g.arc(tw * 0.5, h * 0.62, 78, Math.PI, 0); g.fill(); g.fillStyle = '#c98a5b'; g.beginPath(); g.arc(tw * 0.6, h * 0.3, 42, 0, 7); g.fill(); g.strokeStyle = '#34363a'; g.lineWidth = 2; g.beginPath(); g.moveTo(50, h * 0.74); g.lineTo(tw - 50, h * 0.74); g.stroke(); }
        if (t === 1) { g.strokeStyle = '#3a3c40'; g.lineWidth = 3; for (var k = 0; k < 7; k++) { g.beginPath(); g.arc(tw * 0.5, h * 0.9, 50 + k * 26, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); } g.fillStyle = '#b9774f'; g.fillRect(tw * 0.44, h * 0.16, tw * 0.12, h * 0.1); }
        if (t === 2) { g.fillStyle = '#8f9a8c'; g.fillRect(60, 110, 70, 250); g.fillStyle = '#c9a063'; g.fillRect(118, 190, 78, 210); g.fillStyle = '#34363a'; g.beginPath(); g.arc(150, 150, 34, 0, 7); g.fill(); }
        if (t === 3) { g.strokeStyle = '#c9a063'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(54, h * 0.7); g.bezierCurveTo(100, h * 0.2, 150, h * 0.9, tw - 54, h * 0.3); g.stroke(); g.fillStyle = '#efe7da'; g.beginPath(); g.arc(tw * 0.36, h * 0.36, 30, 0, 7); g.fill(); }
        g.restore();
      }
    });
    var lace = ctex(256, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#0c0c0d'; g.fillStyle = '#0c0c0d'; g.lineCap = 'round';
      g.lineWidth = 9; g.beginPath(); g.moveTo(5, 0); g.lineTo(5, h); g.moveTo(w - 5, 0); g.lineTo(w - 5, h); g.stroke();
      g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.lineWidth = 7;
      g.beginPath(); g.arc(w / 2, h / 2, 52, 0, 7); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 22, 0, 7); g.stroke();
      [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 78, 0, 7); g.stroke(); });
      g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h / 2 - 52); g.moveTo(w / 2, h / 2 + 52); g.lineTo(w / 2, h - 10); g.moveTo(8, h / 2); g.lineTo(w / 2 - 52, h / 2); g.moveTo(w / 2 + 52, h / 2); g.lineTo(w - 8, h / 2); g.stroke();
    }, 1);
    var blob = ctex(128, 128, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var glow = ctex(8, 64, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var ring = ctex(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(255,236,205,.5)'); gr.addColorStop(0.5, 'rgba(226,168,120,.16)'); gr.addColorStop(1, 'rgba(226,168,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,244,226,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(226,168,120,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,244,226,.95)'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
    });
    TEX = { parquet: parquet, parquetB: parquetB, wood: wood, rug: rug, art: art, lace: lace, blob: blob, glow: glow, ring: ring };
    return TEX;
  }

  /* ================= материалы ================= */
  var ambU = { value: new T.Color(0.5, 0.5, 0.5) }, MAT = null;
  function amb(m) {                                        // «свет комнаты»: мягкая заливка только для материалов интерьера
    m.onBeforeCompile = function (sh) {
      sh.uniforms.gkAmb = ambU;
      sh.fragmentShader = 'uniform vec3 gkAmb;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * gkAmb;');
    };
    m.customProgramCacheKey = function () { return 'gki-amb'; };
    return m;
  }
  function std(o, env) {
    var m = ctx.M ? ctx.M(o) : new T.MeshStandardMaterial(o);
    if (env != null) { m.userData.env = env; m.envMapIntensity = env * (ctx.cur && ctx.cur.env != null ? ctx.cur.env : 1); }
    return amb(m);
  }
  function materials() {
    if (MAT) return MAT;
    var X = textures();
    MAT = {
      shell: std({ vertexColors: true, roughness: 0.94, metalness: 0 }, 0.05),
      floor: std({ map: X.parquet, bumpMap: X.parquetB, bumpScale: 0.006, vertexColors: true, roughness: 0.4, metalness: 0 }, 0.42),
      matte: std({ vertexColors: true, roughness: 0.86, metalness: 0 }, 0.06),
      satin: std({ vertexColors: true, roughness: 0.26, metalness: 0 }, 0.2),
      metal: std({ vertexColors: true, roughness: 0.3, metalness: 1 }, 0.95),
      wood: std({ map: X.wood, vertexColors: true, roughness: 0.52, metalness: 0 }, 0.16),
      rug: std({ map: X.rug, vertexColors: true, roughness: 1, metalness: 0 }, 0.02),
      art: std({ map: X.art, vertexColors: true, roughness: 0.7, metalness: 0 }, 0.05),
      curtain: std({ vertexColors: true, roughness: 1, metalness: 0, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }, 0.02),
      glass: std({ color: 0xdfe9ee, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false }, 0.7),
      emis: new T.MeshBasicMaterial({ vertexColors: true }),
      lace: new T.MeshBasicMaterial({ map: X.lace, alphaTest: 0.45, side: T.DoubleSide, color: 0x1a1a1b }),
      blob: new T.MeshBasicMaterial({ map: X.blob, transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000 }),
      glow: new T.MeshBasicMaterial({ map: X.glow, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffc98a, opacity: 0, side: T.DoubleSide }),
      ring: new T.MeshBasicMaterial({ map: X.ring, transparent: true, depthWrite: false, opacity: 0.95 })
    };
    MAT.glass.vertexColors = false;
    return MAT;
  }

  /* ================= сборка геометрии ================= */
  var bins = {}, XF = null, openings = [];
  function at(x, y, z, ry, fn) { var prev = XF, m = new T.Matrix4().makeRotationY(ry || 0); m.setPosition(x, y, z); XF = prev ? prev.clone().multiply(m) : m; fn(); XF = prev; }
  function put(bin, g, col) {
    if (g.index) g = g.toNonIndexed();
    if (XF) g.applyMatrix4(XF);
    col = col || C.white;
    var n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    (bins[bin] || (bins[bin] = [])).push(g);
  }
  function box(bin, x0, x1, y0, y1, z0, z1, col) { var g = new T.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(bin, g, col); }
  function rb(bin, cx, cy, cz, w, h, d, r, col, ry, rz) {
    var rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
    var g = T.RoundedBoxGeometry && rr > 0.004 ? new T.RoundedBoxGeometry(w, h, d, 2, rr) : new T.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(cx, cy, cz); put(bin, g, col);
  }
  function cyl(bin, cx, y0, cz, rBot, rTop, h, col, seg) { var g = new T.CylinderGeometry(rTop, rBot, h, seg || 14); g.translate(cx, y0 + h / 2, cz); put(bin, g, col); }
  function ball(bin, cx, cy, cz, rx, ry, rz, col, rotY, rotZ) { var g = new T.SphereGeometry(1, 9, 6); g.scale(rx, ry, rz); if (rotZ) g.rotateZ(rotZ); if (rotY) g.rotateY(rotY); g.translate(cx, cy, cz); put(bin, g, col); }
  function flat(bin, cx, y, cz, w, d, col, ry) { var g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); if (ry) g.rotateY(ry); g.translate(cx, y, cz); put(bin, g, col); }
  function blob(cx, cz, w, d, ry) { flat('blob', cx, 0.013, cz, w, d, null, ry); }

  var tC = [0, 0, 0], tU = [0, 0];
  function grid(bin, O, du, dv, n, u0, u1, v0, v1, cf, uvf) {
    var step = 0.22, nu = Math.max(1, Math.ceil((u1 - u0) / step)), nv = Math.max(1, Math.ceil((v1 - v0) / step));
    var P = new Float32Array(nu * nv * 18), N = new Float32Array(nu * nv * 18), Cc = new Float32Array(nu * nv * 18), U = new Float32Array(nu * nv * 12), k = 0, q = 0;
    function vtx(u, v) {
      var x = O[0] + du[0] * u + dv[0] * v, y = O[1] + du[1] * u + dv[1] * v, z = O[2] + du[2] * u + dv[2] * v;
      P[k] = x; P[k + 1] = y; P[k + 2] = z; N[k] = n[0]; N[k + 1] = n[1]; N[k + 2] = n[2];
      var c = cf(u, v, x, y, z); Cc[k] = c[0]; Cc[k + 1] = c[1]; Cc[k + 2] = c[2]; k += 3;
      if (uvf) { var t = uvf(x, y, z); U[q++] = t[0]; U[q++] = t[1]; } else { U[q++] = u; U[q++] = v; }
    }
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var ua = u0 + (u1 - u0) * i / nu, ub = u0 + (u1 - u0) * (i + 1) / nu, va = v0 + (v1 - v0) * j / nv, vb = v0 + (v1 - v0) * (j + 1) / nv;
      vtx(ua, va); vtx(ub, va); vtx(ub, vb); vtx(ua, va); vtx(ub, vb); vtx(ua, vb);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3));
    g.setAttribute('uv', new T.BufferAttribute(U, 2)); g.setAttribute('color', new T.BufferAttribute(Cc, 3));
    (bins[bin] || (bins[bin] = [])).push(g);
  }
  function dayl(z) { return 0.7 + 0.3 * Math.exp(Math.min(0, z) / 2.8); }                 // ближе к окну — светлее
  function shade(base, L, Hh, k) {                                                          // запечённое затенение в углах
    var s = 0.3;
    return function (u, v, x, y, z) {
      var a = (1 - k[0] * Math.exp(-u / s)) * (1 - k[1] * Math.exp(-(L - u) / s)) * (1 - k[2] * Math.exp(-v / s)) * (1 - k[3] * Math.exp(-(Hh - v) / s)) * dayl(z);
      tC[0] = base.r * a; tC[1] = base.g * a; tC[2] = base.b * a; return tC;
    };
  }
  function floorUV(x, y, z) { tU[0] = z / 2.0; tU[1] = x / 1.2; return tU; }

  function wallFace(r, side) {
    var L, O, du, n, toU, plane, ax, ops = [], base = (r.acc && r.acc[side]) || r.wall || C.wall;
    if (side === 'N') { L = r.x1 - r.x0; O = [r.x0, 0, r.z0]; du = [1, 0, 0]; n = [0, 0, 1]; toU = function (a) { return a - r.x0; }; plane = r.z0; ax = 'z'; }
    else if (side === 'S') { L = r.x1 - r.x0; O = [r.x1, 0, r.z1]; du = [-1, 0, 0]; n = [0, 0, -1]; toU = function (a) { return r.x1 - a; }; plane = r.z1; ax = 'z'; }
    else if (side === 'W') { L = r.z1 - r.z0; O = [r.x0, 0, r.z1]; du = [0, 0, -1]; n = [1, 0, 0]; toU = function (a) { return r.z1 - a; }; plane = r.x0; ax = 'x'; }
    else { L = r.z1 - r.z0; O = [r.x1, 0, r.z0]; du = [0, 0, 1]; n = [-1, 0, 0]; toU = function (a) { return a - r.z0; }; plane = r.x1; ax = 'x'; }
    openings.forEach(function (o) {
      if (o.ax !== ax || Math.abs(o.at - plane) > 0.2) return;
      var a = toU(o.a0), b = toU(o.a1), u0 = Math.min(a, b), u1 = Math.max(a, b);
      if (u1 > 0.02 && u0 < L - 0.02) ops.push({ u0: Math.max(0, u0), u1: Math.min(L, u1), v0: o.v0, v1: o.v1 });
    });
    ops.sort(function (a, b) { return a.u0 - b.u0; });
    var cf = shade(base, L, HC, [0.3, 0.3, 0.34, 0.22]), dv = [0, 1, 0], u = 0, segs = [];
    function rect(a, b, c, d) { if (b - a > 0.005 && d - c > 0.005) grid('shell', O, du, dv, n, a, b, c, d, cf); }
    ops.forEach(function (o) {
      rect(u, o.u0, 0, HC); if (o.u0 > u) segs.push([u, o.u0]);
      rect(o.u0, o.u1, 0, o.v0); if (o.v0 > 0.2) segs.push([o.u0, o.u1]);
      rect(o.u0, o.u1, o.v1, HC); u = o.u1;
    });
    rect(u, L, 0, HC); if (L > u) segs.push([u, L]);
    if (r.key !== 'loggia') segs.forEach(function (s) {            // плинтус
      var a = [O[0] + du[0] * s[0], O[2] + du[2] * s[0]], b = [O[0] + du[0] * s[1], O[2] + du[2] * s[1]], t = 0.014;
      box('matte', Math.min(a[0], b[0], a[0] + n[0] * t), Math.max(a[0], b[0], a[0] + n[0] * t), 0, 0.09, Math.min(a[1], b[1], a[1] + n[2] * t), Math.max(a[1], b[1], a[1] + n[2] * t), C.skirt);
    });
  }
  function roomShell(r) {
    var w = r.x1 - r.x0, d = r.z1 - r.z0;
    grid('floor', [r.x0, 0, r.z1], [1, 0, 0], [0, 0, -1], [0, 1, 0], 0, w, 0, d, shade(r.floorC || C.white, w, d, [0.34, 0.34, 0.34, 0.34]), floorUV);
    grid('shell', [r.x0, HC, r.z0], [1, 0, 0], [0, 0, 1], [0, -1, 0], 0, w, 0, d, shade(C.ceil, w, d, [0.2, 0.2, 0.2, 0.2]));
    ['N', 'S', 'W', 'E'].forEach(function (s) { wallFace(r, s); });
  }
  function facadeWall(W) {                                   // толстая наружная стена с проёмами (откосы видны изнутри)
    var ops = openings.filter(function (o) { return o.ax === 'z' && o.at > 0; }).sort(function (a, b) { return a.a0 - b.a0; }), x = -0.3;
    function b(x0, x1, y0, y1) { if (x1 - x0 > 0.005 && y1 - y0 > 0.005) box('matte', x0, x1, y0, y1, 0.004, 0.36, C.plaster); }
    ops.forEach(function (o) { b(x, o.a0, -0.2, HC + 0.2); b(o.a0, o.a1, -0.2, o.v0); b(o.a0, o.a1, o.v1, HC + 0.2); x = o.a1; });
    b(x, W + 0.3, -0.2, HC + 0.2);
  }
  function winFrame(o, zc, nDiv) {
    var f = 0.055, d = 0.034, c = C.frame, i;
    box('satin', o.a0, o.a0 + f, o.v0, o.v1, zc - d, zc + d, c); box('satin', o.a1 - f, o.a1, o.v0, o.v1, zc - d, zc + d, c);
    box('satin', o.a0, o.a1, o.v1 - f, o.v1, zc - d, zc + d, c); box('satin', o.a0, o.a1, o.v0, o.v0 + f, zc - d, zc + d, c);
    for (i = 1; i < nDiv; i++) { var x = o.a0 + (o.a1 - o.a0) * i / nDiv; box('satin', x - 0.028, x + 0.028, o.v0, o.v1, zc - d, zc + d, c); }
    var g = new T.PlaneGeometry(o.a1 - o.a0, o.v1 - o.v0); g.translate((o.a0 + o.a1) / 2, (o.v0 + o.v1) / 2, zc); put('glass', g);
  }
  function curtain(x0, x1, z, y0, y1) {
    var w = x1 - x0, g = new T.PlaneGeometry(w, y1 - y0, Math.max(8, Math.round(w / 0.03)), 1), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) { var px = p.getX(i); p.setZ(i, Math.sin(px * 54) * 0.03 + Math.sin(px * 19 + 1) * 0.012); }
    g.computeVertexNormals(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, z); put('curtain', g, C.sheer);
  }
  function casing(o) {                                       // обрамление проёма в перегородке + порожек
    var d = TW / 2 + 0.03, j = 0.045, c = C.oakD;
    if (o.ax === 'x') {
      box('wood', o.at - d, o.at + d, 0, o.v1, o.a0, o.a0 + j, c); box('wood', o.at - d, o.at + d, 0, o.v1, o.a1 - j, o.a1, c);
      box('wood', o.at - d, o.at + d, o.v1 - j, o.v1, o.a0, o.a1, c); box('wood', o.at - TW / 2 - 0.02, o.at + TW / 2 + 0.02, -0.01, 0.005, o.a0, o.a1, c);
    } else {
      box('wood', o.a0, o.a0 + j, 0, o.v1, o.at - d, o.at + d, c); box('wood', o.a1 - j, o.a1, 0, o.v1, o.at - d, o.at + d, c);
      box('wood', o.a0, o.a1, o.v1 - j, o.v1, o.at - d, o.at + d, c); box('wood', o.a0, o.a1, -0.01, 0.005, o.at - TW / 2 - 0.02, o.at + TW / 2 + 0.02, c);
    }
  }

  /* ================= мебель ================= */
  function doorSlab(x, z, ry, w, col) {                      // закрытая дверь на стене (входная, санузел)
    at(x, 0, z, ry, function () {
      box('satin', -w / 2, w / 2, 0, 2.12, 0.004, 0.035, col || C.graph);
      box('wood', -w / 2 - 0.06, -w / 2, 0, 2.18, 0, 0.045, C.oakD); box('wood', w / 2, w / 2 + 0.06, 0, 2.18, 0, 0.045, C.oakD); box('wood', -w / 2 - 0.06, w / 2 + 0.06, 2.12, 2.18, 0, 0.045, C.oakD);
      box('metal', w / 2 - 0.11, w / 2 - 0.09, 0.95, 1.12, 0.035, 0.075, C.brass); box('metal', w / 2 - 0.22, w / 2 - 0.09, 1.04, 1.06, 0.06, 0.075, C.brass);
    });
  }
  function doorLeaf(x, z, ry) {                              // открытое полотно межкомнатной двери
    at(x, 0, z, ry, function () { box('satin', 0, 0.86, 0.01, 2.08, -0.02, 0.02, C.creamL); box('metal', 0.72, 0.84, 1.03, 1.05, -0.06, 0.06, C.brass); });
  }
  function picture(x, y, z, ry, w, h, tile) {
    at(x, y, z, ry, function () {
      box('matte', -w / 2 - 0.018, w / 2 + 0.018, -h / 2 - 0.018, h / 2 + 0.018, 0.002, 0.028, C.black);
      var g = new T.PlaneGeometry(w, h), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, (tile + uv.getX(i)) / 4);
      g.translate(0, 0, 0.03); put('art', g);
    });
  }
  function plant(x, z, h, big) {
    at(x, 0, z, 0, function () {
      cyl('matte', 0, 0, 0, 0.13, 0.17, 0.36, big ? C.pot : C.potL, 16); cyl('matte', 0, 0.3, 0, 0.014, 0.008, h * 0.62, C.trunk, 6);
      var n = big ? 16 : 10;
      for (var i = 0; i < n; i++) {
        var a = i * 2.4, t = i / n, yy = 0.5 + t * (h - 0.55), rr = 0.1 + (1 - Math.abs(t - 0.45)) * 0.2 * (big ? 1 : 0.7);
        ball('matte', Math.sin(a) * rr, yy, Math.cos(a) * rr, 0.06, 0.012, 0.19 * (big ? 1 : 0.75), i % 3 ? C.leaf : C.leaf2, a, 0.25 + rnd() * 0.5);
      }
    });
    blob(x, z, 0.7, 0.7);
  }
  function pendant(x, z, yb, col) {
    cyl('metal', x, yb + 0.16, z, 0.004, 0.004, HC - yb - 0.16, C.black, 5);
    cyl('metal', x, yb, z, 0.15, 0.03, 0.17, col || C.brass, 20); cyl('emis', x, yb - 0.004, z, 0.13, 0.13, 0.006, C.warm, 18);
  }
  function spotsRow(x0, x1, z, n) { for (var i = 0; i < n; i++) { var x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)); cyl('emis', x, HC - 0.006, z, 0.05, 0.05, 0.005, C.warm, 12); cyl('matte', x, HC - 0.01, z, 0.065, 0.065, 0.009, C.white, 14); } }
  function chair(x, z, ry, col) {
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.46, 0, 0.46, 0.07, 0.46, 0.03, col); rb('matte', 0, 0.72, -0.21, 0.44, 0.36, 0.055, 0.025, col);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.19, 0, k[1] * 0.19, 0.011, 0.015, 0.43, C.black, 6); });
    });
  }
  function sofa(x, z, ry, len, col, colL) {                  // спинка к +x
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.21, 0, 0.94, 0.2, len, 0.05, col); rb('matte', 0.36, 0.5, 0, 0.2, 0.62, len, 0.08, col);
      rb('matte', 0, 0.42, -len / 2 + 0.1, 0.94, 0.5, 0.2, 0.08, col); rb('matte', 0, 0.42, len / 2 - 0.1, 0.94, 0.5, 0.2, 0.08, col);
      var n = len > 2.2 ? 3 : 2, wz = (len - 0.42) / n, i;
      for (i = 0; i < n; i++) { var zz = -len / 2 + 0.21 + wz * (i + 0.5); rb('matte', -0.09, 0.39, zz, 0.72, 0.17, wz - 0.02, 0.06, colL); rb('matte', 0.2, 0.64, zz, 0.17, 0.38, wz - 0.04, 0.07, colL, 0, 0.16); }
      rb('matte', 0.08, 0.6, -len / 2 + 0.42, 0.14, 0.36, 0.4, 0.06, C.graph2, 0.25, 0.3); rb('matte', 0.06, 0.58, len / 2 - 0.44, 0.13, 0.32, 0.36, 0.06, C.terra, -0.2, 0.32);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.38, 0, k[1] * (len / 2 - 0.12), 0.012, 0.018, 0.11, C.black, 6); });
    });
  }
  function armchair(x, z, ry, col) {
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.3, 0, 0.74, 0.2, 0.74, 0.07, col); rb('matte', 0, 0.58, -0.3, 0.74, 0.52, 0.16, 0.07, col); rb('matte', -0.31, 0.44, 0, 0.13, 0.34, 0.7, 0.05, col); rb('matte', 0.31, 0.44, 0, 0.13, 0.34, 0.7, 0.05, col);
      rb('matte', 0, 0.44, 0.03, 0.5, 0.12, 0.56, 0.05, C.creamL);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.3, 0, k[1] * 0.3, 0.012, 0.016, 0.2, C.brass, 6); });
    });
    blob(x, z, 1.1, 1.1);
  }
  function floorLamp(x, z) {
    cyl('metal', x, 0, z, 0.15, 0.15, 0.02, C.black, 18); cyl('metal', x, 0.02, z, 0.011, 0.011, 1.38, C.brass, 8);
    cyl('emis', x, 1.36, z, 0.2, 0.15, 0.3, C.shade, 20); blob(x, z, 0.5, 0.5);
  }
  function tableLamp(x, y, z) { cyl('metal', x, y, z, 0.06, 0.045, 0.02, C.brass, 12); cyl('metal', x, y + 0.02, z, 0.01, 0.01, 0.2, C.brass, 6); cyl('emis', x, y + 0.2, z, 0.12, 0.09, 0.17, C.shade, 16); }
  function vase(x, y, z, col) { cyl('satin', x, y, z, 0.045, 0.07, 0.12, col, 14); cyl('satin', x, y + 0.12, z, 0.07, 0.03, 0.1, col, 14); for (var i = 0; i < 4; i++) cyl('matte', x + (i - 1.5) * 0.02, y + 0.2, z + (i % 2) * 0.02, 0.003, 0.003, 0.26 + i * 0.03, C.olive, 4); }
  function books(x, y, z, n, alongZ) {
    var cols = [C.cream, C.graph2, C.terra, C.taupe, C.olive, C.creamL], p = 0;
    for (var i = 0; i < n; i++) { var w = 0.025 + rnd() * 0.02, h = 0.2 + rnd() * 0.07; if (alongZ) box('matte', x - 0.08, x + 0.08, y, y + h, z + p, z + p + w, cols[i % 6]); else box('matte', x + p, x + p + w, y, y + h, z - 0.08, z + 0.08, cols[i % 6]); p += w + 0.003; }
  }
  function coffee(x, z) {
    cyl('satin', x, 0.33, z, 0.44, 0.44, 0.035, C.stoneD, 30); cyl('metal', x, 0, z, 0.17, 0.14, 0.33, C.brass, 20);
    cyl('wood', x + 0.34, 0.43, z - 0.42, 0.27, 0.27, 0.03, C.oak, 24); cyl('metal', x + 0.34, 0, z - 0.42, 0.1, 0.085, 0.43, C.black, 16);
    rb('matte', x - 0.08, 0.385, z + 0.1, 0.3, 0.035, 0.22, 0.008, C.cream, 0.3); rb('matte', x - 0.08, 0.418, z + 0.1, 0.26, 0.03, 0.19, 0.008, C.graph2, 0.1);
    cyl('metal', x + 0.14, 0.365, z - 0.14, 0.05, 0.085, 0.05, C.brass, 16); vase(x + 0.34, 0.46, z - 0.42, C.creamL);
    blob(x + 0.1, z - 0.15, 1.5, 1.6);
  }
  function tvWall(r, zc) {                                   // рейки из дуба, консоль, экран — на западной стене
    var x = r.x0, z0 = zc - 1.25, z1 = zc + 1.25, z;
    box('matte', x, x + 0.012, 0, 2.5, z0, z1, C.graph);
    for (z = z0 + 0.01; z < z1 - 0.03; z += 0.062) box('wood', x + 0.012, x + 0.034, 0, 2.5, z, z + 0.036, C.oakD);
    rb('satin', x + 0.24, 0.4, zc, 0.4, 0.3, 2.1, 0.012, C.graph); box('satin', x + 0.045, x + 0.07, 0.86, 1.68, zc - 0.72, zc + 0.72, C.blackGl);
    box('emis', x + 0.036, x + 0.04, 0.02, 0.03, z0, z1, C.warm);
    vase(x + 0.24, 0.55, zc + 0.82, C.brass); books(x + 0.24, 0.55, zc - 0.95, 5, true);
    blob(x + 0.2, zc, 0.8, 2.4);
  }
  function lounge(r, zc, len, tv) {
    var xs = r.x1 - 0.5, cx = (r.x0 + r.x1) / 2 + (tv ? 0.1 : 0.45);
    sofa(xs, zc, 0, len, C.boucle, C.boucleL); blob(xs, zc, 1.35, len + 0.45);
    var g = new T.PlaneGeometry(2.3, len + 0.7); g.rotateX(-Math.PI / 2); g.translate(cx + 0.15, 0.008, zc); put('rug', g);
    coffee(cx - 0.05, zc + 0.12);
    floorLamp(r.x1 - 0.32, Math.min(-0.42, zc + len / 2 + 0.42));
    picture(r.x1 - 0.004, 1.62, zc - 0.42, -Math.PI / 2, 0.56, 0.8, 0); picture(r.x1 - 0.004, 1.62, zc + 0.42, -Math.PI / 2, 0.56, 0.8, 1);
    if (tv) tvWall(r, Math.min(-1.5, zc + 0.15));
  }
  function kitchenRun(len, island) {                         // вдоль стены: x — глубина от стены, z — длина
    var tall = 1.2, dp = 0.6, i, n = Math.max(2, Math.round((len - tall) / 0.6)), w = (len - tall) / n;
    box('matte', 0.04, dp - 0.06, 0, 0.09, 0, len, C.black);
    box('matte', 0, dp - 0.02, 0.09, 2.34, 0, tall, C.graph);
    for (i = 0; i < 2; i++) box('satin', dp - 0.02, dp, 0.1, 2.33, i * 0.6 + 0.004, (i + 1) * 0.6 - 0.004, C.graph2);
    box('satin', dp, dp + 0.005, 0.98, 1.44, 0.66, 1.14, C.blackGl); box('satin', dp, dp + 0.005, 1.5, 1.84, 0.66, 1.14, C.blackGl);
    box('metal', dp, dp + 0.035, 0.85, 1.75, 0.54, 0.556, C.brass); box('metal', dp, dp + 0.03, 0.94, 0.955, 0.7, 1.1, C.brass);
    box('matte', 0, dp - 0.02, 0.09, 0.86, tall, len, C.graph);
    for (i = 0; i < n; i++) { box('wood', dp - 0.02, dp, 0.1, 0.855, tall + i * w + 0.004, tall + (i + 1) * w - 0.004, C.oak); box('metal', dp, dp + 0.022, 0.79, 0.802, tall + i * w + 0.1, tall + (i + 1) * w - 0.1, C.brass); }
    box('satin', 0, dp + 0.025, 0.86, 0.9, tall, len + 0.02, C.stone); box('satin', 0, 0.012, 0.9, 1.5, tall, len, C.stone);
    box('matte', 0, 0.34, 1.5, 2.34, tall, len, C.creamL);
    for (i = 0; i < n; i++) box('satin', 0.34, 0.352, 1.508, 2.332, tall + i * w + 0.004, tall + (i + 1) * w - 0.004, C.cream);
    box('emis', 0.04, 0.3, 1.492, 1.5, tall + 0.05, len - 0.05, C.warm);
    var zh = tall + (len - tall) * 0.3, zs = tall + (len - tall) * 0.74;
    box('satin', 0.07, 0.55, 0.9, 0.906, zh - 0.29, zh + 0.29, C.blackGl);
    box('metal', 0.1, 0.52, 0.9, 0.903, zs - 0.27, zs + 0.27, C.steel); cyl('metal', 0.07, 0.9, zs, 0.013, 0.013, 0.3, C.brass, 8); box('metal', 0.06, 0.26, 1.19, 1.212, zs - 0.011, zs + 0.011, C.brass);
    cyl('wood', 0.3, 0.9, len - 0.18, 0.11, 0.13, 0.07, C.oakD, 16); rb('wood', 0.03, 1.06, tall + 0.2, 0.02, 0.32, 0.22, 0.006, C.oakD, 0, 0.12); vase(0.16, 0.9, tall + 0.5, C.creamL);
    blob(0.4, len / 2, 1.0, len + 0.3);
    if (island) {
      var ix = 1.95, iz0 = tall + 0.1, iz1 = Math.min(len - 0.1, iz0 + 1.75);
      box('wood', ix - 0.36, ix + 0.36, 0.09, 0.86, iz0, iz1, C.oak); box('matte', ix - 0.32, ix + 0.32, 0, 0.09, iz0 + 0.04, iz1 - 0.04, C.black);
      box('satin', ix - 0.42, ix + 0.46, 0.86, 0.9, iz0 - 0.05, iz1 + 0.05, C.stone);
      for (i = 0; i < 2; i++) { var sz = iz0 + 0.45 + i * 0.8; cyl('matte', ix + 0.72, 0.6, sz, 0.17, 0.18, 0.06, C.boucle, 18); cyl('metal', ix + 0.72, 0.02, sz, 0.02, 0.02, 0.58, C.black, 8); cyl('metal', ix + 0.72, 0, sz, 0.17, 0.17, 0.02, C.black, 18); pendant(ix, sz, 1.72); }
      cyl('satin', ix - 0.05, 0.9, (iz0 + iz1) / 2, 0.12, 0.16, 0.07, C.creamL, 18);
      blob(ix + 0.1, (iz0 + iz1) / 2, 1.5, iz1 - iz0 + 0.5);
    }
  }
  function dining(x, z, n) {
    cyl('wood', x, 0.72, z, 0.52, 0.52, 0.035, C.oak, 32); cyl('matte', x, 0, z, 0.24, 0.07, 0.72, C.graph, 18); cyl('matte', x, 0, z, 0.3, 0.3, 0.02, C.graph, 20);
    for (var i = 0; i < n; i++) { var a = i * Math.PI * 2 / n + 0.5; chair(x + Math.sin(a) * 0.72, z + Math.cos(a) * 0.72, a + Math.PI, i % 2 ? C.cream : C.boucle); }
    cyl('satin', x, 0.755, z, 0.07, 0.13, 0.06, C.creamL, 16); pendant(x, z, 1.8); blob(x, z, 2.2, 2.2);
  }
  function bedroom(r) {
    var zc = (r.z0 + r.z1) / 2 + 0.25, x1 = r.x1, i;
    rb('matte', x1 - 0.05, 0.72, zc, 0.09, 1.2, 2.9, 0.03, C.taupe);                       // широкое мягкое изголовье
    for (i = -2; i <= 2; i++) box('matte', x1 - 0.1, x1 - 0.094, 0.14, 1.3, zc + i * 0.58 - 0.003, zc + i * 0.58 + 0.003, C.accent);
    rb('matte', x1 - 1.14, 0.2, zc, 2.1, 0.3, 1.74, 0.05, C.graph2); rb('matte', x1 - 1.12, 0.45, zc, 2.0, 0.22, 1.62, 0.07, C.linen);
    rb('matte', x1 - 1.42, 0.55, zc, 1.42, 0.11, 1.7, 0.05, C.creamL); rb('matte', x1 - 1.85, 0.6, zc, 0.5, 0.035, 1.76, 0.015, C.terra);
    rb('matte', x1 - 0.4, 0.62, zc - 0.4, 0.4, 0.15, 0.66, 0.06, C.linen, 0, 0.25); rb('matte', x1 - 0.4, 0.62, zc + 0.4, 0.4, 0.15, 0.66, 0.06, C.linen, 0, 0.25);
    rb('matte', x1 - 0.62, 0.64, zc - 0.36, 0.3, 0.12, 0.42, 0.05, C.taupe, 0, 0.35); rb('matte', x1 - 0.62, 0.64, zc + 0.36, 0.3, 0.12, 0.42, 0.05, C.graph2, 0, 0.35);
    [-1, 1].forEach(function (s) { var zz = zc + s * 1.16; rb('wood', x1 - 0.3, 0.26, zz, 0.42, 0.36, 0.46, 0.012, C.oak); cyl('metal', x1 - 0.3, 0, zz, 0.012, 0.012, 0.08, C.black, 6); tableLamp(x1 - 0.3, 0.44, zz); });
    var g = new T.PlaneGeometry(2.5, 2.9); g.rotateX(-Math.PI / 2); g.translate(x1 - 1.55, 0.008, zc); put('rug', g);
    blob(x1 - 1.15, zc, 2.5, 2.3);
    picture(x1 - 0.004, 1.9, zc, -Math.PI / 2, 1.0, 0.6, 3);
    var wz0 = r.z0 + 1.35, wz1 = Math.min(r.z1 - 0.9, wz0 + 2.4), n = Math.max(2, Math.round((wz1 - wz0) / 0.6)), w = (wz1 - wz0) / n;   // шкаф у западной стены
    box('matte', r.x0, r.x0 + 0.58, 0, 2.6, wz0, wz1, C.cream);
    for (i = 0; i < n; i++) { box('satin', r.x0 + 0.58, r.x0 + 0.6, 0.06, 2.59, wz0 + i * w + 0.004, wz0 + (i + 1) * w - 0.004, C.creamL); box('metal', r.x0 + 0.6, r.x0 + 0.625, 0.95, 1.35, wz0 + (i + (i % 2 ? 0.1 : 0.9)) * w - 0.006, wz0 + (i + (i % 2 ? 0.1 : 0.9)) * w + 0.006, C.brass); }
    blob(r.x0 + 0.4, (wz0 + wz1) / 2, 1.0, wz1 - wz0 + 0.3);
    if (r.z1 > -0.5) { armchair(r.x0 + 0.85, -0.95, 0.75, C.boucle); plant(r.x1 - 0.4, -0.45, 1.5, true); }
    spotsRow(r.x0 + 0.9, r.x1 - 0.9, r.z0 + 1.0, 2); spotsRow(r.x0 + 0.9, r.x1 - 0.9, r.z1 - 1.0, 2);
  }
  function study(r) {
    var x0 = r.x0, x1 = r.x1, i, j;
    box('wood', x0 + 0.04, x0 + 0.7, 0.72, 0.755, -2.5, -0.85, C.oak);                      // стол у западной стены
    [[0.08, -2.46], [0.66, -2.46], [0.08, -0.89], [0.66, -0.89]].forEach(function (p) { box('metal', x0 + p[0] - 0.012, x0 + p[0] + 0.012, 0, 0.72, p[1] - 0.012, p[1] + 0.012, C.black); });
    box('satin', x0 + 0.1, x0 + 0.13, 0.86, 1.2, -2.0, -1.4, C.blackGl); box('metal', x0 + 0.1, x0 + 0.2, 0.755, 0.87, -1.72, -1.68, C.black);
    tableLamp(x0 + 0.3, 0.755, -1.05); books(x0 + 0.25, 0.755, -2.42, 4, true);
    chair(x0 + 1.05, -1.7, -Math.PI / 2, C.taupe); blob(x0 + 0.6, -1.7, 1.7, 2.0);
    var sz0 = r.z0 + 1.3, sz1 = sz0 + 1.9;                                                  // открытый стеллаж у восточной стены
    box('wood', x1 - 0.3, x1, 0, 2.2, sz0, sz0 + 0.025, C.oak); box('wood', x1 - 0.3, x1, 0, 2.2, sz1 - 0.025, sz1, C.oak); box('wood', x1 - 0.3, x1, 0, 2.2, (sz0 + sz1) / 2 - 0.012, (sz0 + sz1) / 2 + 0.012, C.oak);
    for (i = 0; i < 6; i++) { box('wood', x1 - 0.3, x1, i * 0.435, i * 0.435 + 0.025, sz0, sz1, C.oak); if (i < 5) for (j = 0; j < 2; j++) { if ((i + j) % 3 === 0) vase(x1 - 0.15, i * 0.435 + 0.025, sz0 + 0.5 + j * 0.95, j ? C.brass : C.creamL); else books(x1 - 0.15, i * 0.435 + 0.025, sz0 + 0.08 + j * 0.95, 7 + ((i * 3 + j) % 5), true); } }
    blob(x1 - 0.2, (sz0 + sz1) / 2, 0.8, 2.2);
    sofa(x1 - 0.5, -1.25, 0, 1.9, C.taupe, C.boucle); blob(x1 - 0.5, -1.25, 1.3, 2.3);
    var g = new T.PlaneGeometry(1.9, 2.6); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2 + 0.1, 0.008, -1.6); put('rug', g);
    picture(x0 + 0.004, 1.75, -1.7, Math.PI / 2, 0.6, 0.86, 2);
    plant(x0 + 0.4, -0.42, 1.25, false); spotsRow(x0 + 0.9, x1 - 0.9, (r.z0 + r.z1) / 2, 2);
  }
  function hallFurn(r, ex) {
    var zN = r.z0, i;
    doorSlab(ex, zN, 0, 0.98, C.graph);
    doorSlab(r.x0, (r.z0 + r.z1) / 2, Math.PI / 2, 0.8, C.creamL);
    var wx0 = ex + 0.85, wx1 = Math.min(r.x1 - 0.3, wx0 + 2.4);
    if (wx1 - wx0 > 1.1) {
      var n = Math.round((wx1 - wx0) / 0.6), w = (wx1 - wx0) / n;
      box('matte', wx0, wx1, 0, 2.6, zN, zN + 0.56, C.cream);
      for (i = 0; i < n; i++) box(i === 1 ? 'metal' : 'satin', wx0 + i * w + 0.004, wx0 + (i + 1) * w - 0.004, 0.06, 2.59, zN + 0.56, zN + 0.578, i === 1 ? C.mirror : C.creamL);
      blob((wx0 + wx1) / 2, zN + 0.4, wx1 - wx0 + 0.3, 1.0);
    }
    var cx = (r.x0 + ex - 0.6) / 2;
    if (ex - 0.6 - r.x0 > 1.0) {
      rb('wood', cx, 0.78, zN + 0.17, 0.9, 0.04, 0.3, 0.008, C.oak); box('metal', cx - 0.4, cx - 0.385, 0, 0.76, zN + 0.05, zN + 0.3, C.black); box('metal', cx + 0.385, cx + 0.4, 0, 0.76, zN + 0.05, zN + 0.3, C.black);
      at(cx, 1.5, zN + 0.01, 0, function () { var g = new T.CylinderGeometry(0.36, 0.36, 0.02, 36); g.rotateX(Math.PI / 2); put('metal', g, C.brass); g = new T.CylinderGeometry(0.335, 0.335, 0.024, 36); g.rotateX(Math.PI / 2); put('metal', g, C.mirror); });
      vase(cx + 0.25, 0.8, zN + 0.17, C.creamL); tableLamp(cx - 0.25, 0.8, zN + 0.17);
    }
    var g2 = new T.PlaneGeometry(Math.min(3.2, r.x1 - r.x0 - 0.8), 0.9); g2.rotateX(-Math.PI / 2); g2.translate(clamp(ex, r.x0 + 2, r.x1 - 2), 0.008, (r.z0 + r.z1) / 2 + 0.25); put('rug', g2);
    spotsRow(r.x0 + 0.8, r.x1 - 0.8, (r.z0 + r.z1) / 2, Math.max(3, Math.round((r.x1 - r.x0) / 1.5)));
    if (r.x1 - r.x0 > 7) { picture(r.x1 - 0.004, 1.6, (r.z0 + r.z1) / 2, -Math.PI / 2, 0.7, 1.0, 2); rb('matte', r.x1 - 0.3, 0.24, (r.z0 + r.z1) / 2, 0.42, 0.42, 1.2, 0.06, C.boucle); }
  }
  function loggiaFurn(r) {
    var cx = (r.x0 + r.x1) / 2;
    armchair(r.x0 + 0.62, -0.72, 0.5, C.cream); armchair(r.x1 - 0.62, -0.72, -0.5, C.cream);
    cyl('wood', cx, 0.44, -0.78, 0.25, 0.25, 0.03, C.oak, 22); cyl('metal', cx, 0, -0.78, 0.03, 0.03, 0.44, C.black, 8); cyl('metal', cx, 0, -0.78, 0.16, 0.16, 0.015, C.black, 18);
    cyl('satin', cx, 0.47, -0.78, 0.04, 0.05, 0.09, C.creamL, 12); cyl('emis', cx + 0.1, 0.47, -0.72, 0.03, 0.03, 0.07, C.warm, 10);
    plant(r.x0 + 0.22, -0.3, 1.1, false);
  }
  function cove(r) {                                         // подсветка по периметру потолка
    var y = HC - 0.014, w = 0.8, lx = r.x1 - r.x0, lz = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    function q(len, x, z, ry) { var g = new T.PlaneGeometry(len, w); g.rotateX(Math.PI / 2); if (ry) g.rotateY(ry); g.translate(x, y, z); put('glow', g); }
    q(lx, cx, r.z0 + w / 2, Math.PI); q(lx, cx, r.z1 - w / 2, 0); q(lz, r.x0 + w / 2, cz, -Math.PI / 2); q(lz, r.x1 - w / 2, cz, Math.PI / 2);
    var a = 0.2, b = 0.07, y0 = HC - 0.17;
    box('matte', r.x0, r.x1, y0, y0 + b, r.z0, r.z0 + a, C.ceil); box('matte', r.x0, r.x1, y0, y0 + b, r.z1 - a, r.z1, C.ceil);
    box('matte', r.x0, r.x0 + a, y0, y0 + b, r.z0 + a, r.z1 - a, C.ceil); box('matte', r.x1 - a, r.x1, y0, y0 + b, r.z0 + a, r.z1 - a, C.ceil);
  }

  /* ================= планировка и сборка квартиры ================= */
  var LABEL = { living: 'Гостиная', studio: 'Кухня-гостиная', kitchen: 'Кухня', bed: 'Спальня', study: 'Кабинет', loggia: 'Лоджия — вид на город', hall: 'Прихожая' };
  function build(fl) {
    bins = {}; openings = []; XF = null; seed = 4321;
    var M = materials(), n = fl.rooms || 1, area = fl.area || 50, euro = fl.id === '2e' || /евро/i.test(fl.name || ''), s, fr;
    if (n <= 1) { s = clamp(Math.sqrt(area / 46.5), 0.97, 1.05); fr = [['kitchen', 3.25], ['living', 4.35]]; }
    else if (euro) { s = 1; fr = [['studio', 4.75], ['bed', 3.35]]; }
    else if (n === 2) { s = clamp(Math.sqrt(area / 68), 0.97, 1.13); fr = [['kitchen', 3.4], ['living', 4.5], ['bed', 3.6]]; }
    else { s = 1.02; fr = [['kitchen', 3.7], ['living', 5.0], ['bed', 3.9], ['study', 3.35]]; }
    var Df = (n >= 3 ? 5.3 : euro ? 4.75 : 4.9) * (0.5 + 0.5 * s), Dh = n >= 3 ? 2.7 : 2.4, x = 0, R = {}, rooms = [], spots = [];
    fr.forEach(function (f) {
      var w = f[1] * s, lg = f[0] === 'kitchen' || (euro && f[0] === 'bed');
      var r = { key: f[0], x0: x, x1: x + w, z0: -Df, z1: lg ? -LG - TW : 0, wall: C.wall };
      rooms.push(r); R[f[0]] = r;
      if (lg) { R.loggia = { key: 'loggia', x0: x, x1: x + w, z0: -LG, z1: 0, wall: C.plaster, floorC: lin(0xd9d2c6), of: r }; rooms.push(R.loggia); }
      x += w + TW;
    });
    var W = x - TW, main = R.living || R.studio;
    R.hall = { key: 'hall', x0: 2.3 + TW, x1: W, z0: -Df - TW - Dh, z1: -Df - TW, wall: C.wallWarm }; rooms.push(R.hall);
    if (R.bed) { R.bed.wall = C.wallWarm; R.bed.acc = { E: C.accent }; }
    if (R.study) R.study.acc = { W: C.accent2 };
    if (R.kitchen) R.kitchen.wall = lin(0xf0ebe1);

    /* проёмы */
    var px = clamp((main.x0 + main.x1) / 2, Math.max(main.x0, R.hall.x0) + 1.0, main.x1 - 1.0);
    openings.push({ ax: 'z', at: -Df - TW / 2, a0: px - 0.75, a1: px + 0.75, v0: 0, v1: 2.4, type: 'portal' });
    if (R.kitchen) openings.push({ ax: 'x', at: R.kitchen.x1 + TW / 2, a0: -Df + 0.6, a1: -Df + 2.3, v0: 0, v1: 2.4, type: 'portal' });
    ['bed', 'study'].forEach(function (k) { if (R[k]) openings.push({ ax: 'z', at: -Df - TW / 2, a0: R[k].x0 + 0.3, a1: R[k].x0 + 1.2, v0: 0, v1: 2.12, type: 'door', room: R[k] }); });
    var lgR = R.loggia, lgOf = lgR.of;
    openings.push({ ax: 'z', at: -LG - TW / 2, a0: lgOf.x0 + 0.4, a1: lgOf.x1 - 0.4, v0: 0, v1: 2.4, type: 'ldoor' });
    openings.push({ ax: 'z', at: 0.18, a0: lgR.x0 + 0.2, a1: lgR.x1 - 0.2, v0: 0.62, v1: 2.62, type: 'pano' });
    rooms.forEach(function (r) {
      if (r.z1 !== 0 || r.key === 'loggia') return;
      var c = (r.x0 + r.x1) / 2, w = r.key === 'living' || r.key === 'studio' ? Math.min(2.7, r.x1 - r.x0 - 1.5) : r.key === 'bed' ? 2.0 : 1.7;
      openings.push({ ax: 'z', at: 0.18, a0: c - w / 2, a1: c + w / 2, v0: r.key === 'study' ? 0.8 : r.key === 'bed' ? 0.45 : 0.07, v1: 2.5, type: r.key === 'study' || r.key === 'bed' ? 'win' : 'french', room: r });
    });

    /* стены, пол, потолок */
    rooms.forEach(roomShell); facadeWall(W);
    box('matte', -0.4, W + 0.4, HC + 0.02, HC + 0.3, -Df - Dh - 0.6, 0.36, C.plaster);                 // плита перекрытия — не пускает солнце сверху
    box('matte', -0.4, -0.12, -0.2, HC + 0.02, -Df - Dh - 0.6, 0.36, C.plaster); box('matte', W + 0.12, W + 0.4, -0.2, HC + 0.02, -Df - Dh - 0.6, 0.36, C.plaster);
    box('matte', -0.4, W + 0.4, -0.2, HC + 0.02, -Df - Dh - 0.6, -Df - Dh - 0.32, C.plaster);

    /* окна, двери */
    openings.forEach(function (o) {
      if (o.type === 'portal') casing(o);
      else if (o.type === 'door') { casing(o); doorLeaf(o.a0 + 0.02, -Df + 0.02, -Math.PI / 2 + 0.12); }
      else if (o.type === 'ldoor') { winFrame(o, o.at, Math.max(2, Math.round((o.a1 - o.a0) / 0.85))); box('metal', o.a0 + 0.78, o.a0 + 0.8, 1.0, 1.18, o.at - 0.07, o.at - 0.034, C.brass); }
      else if (o.type === 'pano') {
        winFrame(o, 0.2, Math.max(2, Math.round((o.a1 - o.a0) / 0.9))); box('satin', o.a0 - 0.03, o.a1 + 0.03, o.v0 - 0.035, o.v0, -0.08, 0.14, C.stone);
      } else {
        winFrame(o, 0.2, o.a1 - o.a0 > 2.2 ? 3 : 2);
        if (o.v0 > 0.3) box('satin', o.a0 - 0.04, o.a1 + 0.04, o.v0 - 0.035, o.v0, -0.09, 0.14, C.stone);
        if (o.type === 'french') {                           // чёрное «кружево» французского балкона
          var w = o.a1 - o.a0 + 0.1, g = new T.PlaneGeometry(w, 1.0), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round(w / 0.5));
          g.translate((o.a0 + o.a1) / 2, 0.6, 0.43); put('lace', g);
          box('metal', o.a0 - 0.06, o.a1 + 0.06, 1.1, 1.14, 0.4, 0.46, C.black); box('metal', o.a0 - 0.06, o.a1 + 0.06, 0.08, 0.11, 0.41, 0.45, C.black);
        }
        var cw = Math.min(0.75, (o.a1 - o.a0) * 0.3);
        box('metal', o.a0 - 0.5, o.a1 + 0.5, 2.68, 2.695, -0.17, -0.155, C.brass);
        curtain(o.a0 - 0.42, o.a0 - 0.42 + cw + 0.42, -0.16, 0.03, 2.68); curtain(o.a1 - cw, o.a1 + 0.42, -0.16, 0.03, 2.68);
      }
    });

    /* мебель */
    var zl = clamp(-Df / 2 + 0.55, -3.2, -1.7);
    if (R.living) { lounge(R.living, zl, clamp(R.living.z1 - R.living.z0 - 2.6, 2.0, 2.6), true); plant(R.living.x0 + 0.42, -0.45, 1.75, true); cove(R.living); spotsRow(R.living.x0 + 1.2, R.living.x1 - 1.2, -Df / 2, 2); }
    if (R.studio) {
      at(R.studio.x0, 0, -Df + 0.02, 0, function () { kitchenRun(3.25, true); });
      lounge(R.studio, -1.55, 2.1, false); cove(R.studio);
      picture(R.studio.x0 + 0.004, 1.6, -0.75, Math.PI / 2, 0.62, 0.9, 2); plant(R.studio.x0 + 0.42, -0.42, 1.6, true);
    }
    if (R.kitchen) {
      var k = R.kitchen;
      at(k.x0, 0, k.z0 + 0.02, 0, function () { kitchenRun(k.z1 - k.z0 - 0.2, false); });
      dining(k.x1 - 1.12, k.z1 - 1.2, n >= 3 ? 4 : 3); spotsRow(k.x0 + 1.0, k.x0 + 1.0, k.z0 + 0.9, 1); spotsRow(k.x0 + 1.0, k.x0 + 1.0, k.z1 - 0.8, 1);
      picture(k.x1 - 0.004, 1.6, k.z1 - 0.62, -Math.PI / 2, 0.5, 0.7, 2);
    }
    if (R.bed) bedroom(R.bed);
    if (R.study) study(R.study);
    hallFurn(R.hall, px); loggiaFurn(R.loggia);

    /* точки обзора */
    function spot(key, ex, ez, lx, ly, lz) { spots.push({ key: key, label: LABEL[key], eye: new T.Vector3(ex, EYE, ez), look: new T.Vector3(lx, ly, lz) }); }
    spot(main.key, px, -Df + 0.75, (main.x0 + main.x1) / 2 + 0.35, 1.2, 0.4);
    if (R.kitchen) spot('kitchen', R.kitchen.x1 - 0.55, R.kitchen.z0 + 0.7, R.kitchen.x0 + 0.9, 1.1, R.kitchen.z1 + 0.3);
    if (R.bed) spot('bed', R.bed.x0 + 0.78, -Df + 0.8, R.bed.x1 - 0.7, 1.05, (R.bed.z0 + R.bed.z1) / 2 + 1.3);
    if (R.study) spot('study', R.study.x0 + 0.78, -Df + 0.8, R.study.x1 - 0.9, 1.1, -0.8);
    spot('loggia', (lgR.x0 + lgR.x1) / 2, -0.82, (lgR.x0 + lgR.x1) / 2 - 2.5, -1.2, 9);
    spot('hall', Math.min(R.hall.x1 - 0.9, px + 2.6), (R.hall.z0 + R.hall.z1) / 2 + 0.2, R.hall.x0, 1.2, R.hall.z0 + 0.9);

    /* меши */
    var grp = new T.Group(), geos = [];
    function mesh(bin, mat, cast, recv, order) {
      var a = bins[bin]; if (!a || !a.length) return null;
      var g = T.BufferGeometryUtils.mergeBufferGeometries(a, false); a.forEach(function (q) { q.dispose(); });
      if (!g) { console.warn('GKInterior: не собралась геометрия', bin); return null; }
      var m = new T.Mesh(g, mat); m.castShadow = !!cast; m.receiveShadow = !!recv; if (order) m.renderOrder = order; grp.add(m); geos.push(g); return m;
    }
    mesh('shell', M.shell, true, true); mesh('floor', M.floor, false, true); mesh('matte', M.matte, true, true); mesh('satin', M.satin, true, true);
    mesh('metal', M.metal, true, true); mesh('wood', M.wood, true, true); mesh('rug', M.rug, false, true); mesh('art', M.art, false, true);
    mesh('emis', M.emis, false, false); mesh('lace', M.lace, false, false); mesh('blob', M.blob, false, false, 1); mesh('glow', M.glow, false, false, 2);
    mesh('glass', M.glass, false, false, 3); mesh('curtain', M.curtain, false, true, 4);
    bins = {};

    /* свет: три точечных источника — днём мягкий свет от окон, вечером тёплые лампы */
    var lights = [], mc = (main.x0 + main.x1) / 2, sec = R.kitchen || R.studio, third = R.bed || R.hall;
    function light(dx, dy, dz, nx, ny, nz) { var l = new T.PointLight(0xffffff, 0, 10, 1.6); l.userData = { d: new T.Vector3(dx, dy, dz), n: new T.Vector3(nx, ny, nz) }; grp.add(l); lights.push(l); }
    light(mc, 2.0, -1.0, mc + 0.3, 2.1, zl);
    if (R.kitchen) light((sec.x0 + sec.x1) / 2, 2.0, sec.z1 - 0.7, sec.x1 - 1.12, 1.75, sec.z1 - 1.2); else light(sec.x0 + 1.9, 2.0, -3.2, sec.x0 + 1.9, 1.8, -2.6);
    if (R.bed) light((third.x0 + third.x1) / 2, 2.0, third.z1 - 1.0, third.x1 - 1.3, 1.9, (third.z0 + third.z1) / 2 + 0.25); else light(px, 2.2, (third.z0 + third.z1) / 2, px, 2.2, (third.z0 + third.z1) / 2);

    /* метки на полу */
    var hs = new T.Group(), hg = new T.PlaneGeometry(0.86, 0.86); hg.rotateX(-Math.PI / 2); geos.push(hg);
    spots.forEach(function (sp, i) { var m = new T.Mesh(hg, M.ring); m.position.set(sp.eye.x, 0.02, sp.eye.z); m.renderOrder = 5; m.userData.spot = i; hs.add(m); sp.mesh = m; });
    grp.add(hs);
    return { group: grp, spots: spots, lights: lights, hot: hs, geos: geos, W: W, id: fl.id };
  }

  /* ================= интерфейс ================= */
  var css = '.gki{position:absolute;inset:0;z-index:40;pointer-events:none;font-family:"Onest",system-ui,sans-serif;color:#efe7da;opacity:0;transition:opacity .5s ease}' +
    '.gki.is-on{opacity:1}.gki[hidden]{display:none}.gki>*{pointer-events:auto}' +
    '.gki-fade{position:absolute;inset:0;z-index:70;background:#07090d;opacity:0;pointer-events:none;transition:opacity .42s ease}.gki-fade.is-on{opacity:1;pointer-events:auto}' +
    '.gki-glass{background:rgba(15,18,27,.74);border:1px solid rgba(239,231,218,.16);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 18px 50px rgba(0,0,0,.35)}' +
    '.gki-back{position:absolute;left:24px;top:22px;min-height:48px;padding:0 22px 0 18px;border-radius:24px;color:#efe7da;font:500 15px/1 "Onest",sans-serif;letter-spacing:.01em;cursor:pointer;transition:border-color .25s,color .25s,transform .25s}' +
    '.gki-back:hover,.gki-back:active{border-color:rgba(226,168,120,.7);color:#fff}.gki-back:active{transform:scale(.98)}.gki-back i{font-style:normal;color:#e2a878;margin-right:10px}' +
    '.gki-title{position:absolute;left:50%;top:20px;transform:translateX(-50%);text-align:center;padding:12px 30px 13px;border-radius:20px;white-space:nowrap}' +
    '.gki-title small{display:block;font:500 10.5px/1 "Onest",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#e2a878;margin-bottom:7px}' +
    '.gki-title b{font:400 25px/1.05 "Forum",Georgia,serif;letter-spacing:.02em;color:#f6efe3}.gki-title span{display:inline-block;margin-left:14px;padding-left:14px;border-left:1px solid rgba(226,168,120,.55);font:400 15px/1 "Onest",sans-serif;color:rgba(239,231,218,.86)}' +
    '.gki-modes{position:absolute;right:24px;top:22px;display:flex;padding:4px;border-radius:24px}.gki-modes button{min-width:74px;min-height:40px;border:0;border-radius:20px;background:none;color:rgba(239,231,218,.72);font:500 14px/1 "Onest",sans-serif;cursor:pointer;transition:background .3s,color .3s}' +
    '.gki-modes button.is-on{background:linear-gradient(180deg,#e2a878,#c98a5b);color:#1a1410}' +
    '.gki>.gki-bar{position:absolute;left:214px;right:22px;bottom:16px;display:flex;flex-direction:column;align-items:center;gap:11px;pointer-events:none}' +
    '.gki-chips{display:flex;gap:4px;padding:6px;border-radius:30px;max-width:100%;overflow-x:auto;scrollbar-width:none;pointer-events:auto}.gki-chips::-webkit-scrollbar{display:none}' +
    '.gki-chips button{flex:none;min-height:46px;padding:0 17px;border:1px solid transparent;border-radius:23px;background:none;color:rgba(239,231,218,.82);font:500 14.5px/1 "Onest",sans-serif;white-space:nowrap;cursor:pointer;transition:background .3s,color .3s,border-color .3s}' +
    '.gki-chips button:hover{border-color:rgba(239,231,218,.22)}.gki-chips button.is-on{background:linear-gradient(180deg,#e2a878,#c98a5b);color:#1a1410}' +
    '.gki-note{font:400 12.5px/1.2 "Onest",sans-serif;letter-spacing:.03em;color:rgba(239,231,218,.86);text-shadow:0 1px 8px rgba(0,0,0,.75);white-space:nowrap;pointer-events:none}' +
    '.gki-note:before{content:"";display:inline-block;width:22px;height:1px;background:#c98a5b;vertical-align:middle;margin-right:10px}' +
    '.gki-plan{position:absolute;left:24px;bottom:22px;width:168px;padding:8px 8px 0;border-radius:18px;cursor:pointer;color:#efe7da;transition:border-color .25s,transform .25s}.gki-plan:hover{border-color:rgba(226,168,120,.6)}' +
    '.gki-plan img{display:block;width:100%;height:132px;object-fit:contain;background:#fbf8f2;border-radius:11px}.gki-plan span{display:block;padding:9px 0 10px;font:500 11px/1 "Onest",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(239,231,218,.8)}' +
    '.gki-hint{padding:10px 20px;border-radius:20px;font:400 12.5px/1.3 "Onest",sans-serif;color:rgba(239,231,218,.86);white-space:nowrap;pointer-events:none;transition:opacity .8s ease}.gki-hint.is-off{opacity:0}.gki-hint b{font:400 16px/1 "Forum",Georgia,serif;color:#e2a878;margin-right:10px;letter-spacing:.03em}' +
    '.gki-zoom{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(7,9,13,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;pointer-events:none;transition:opacity .35s ease}' +
    '.gki-zoom.is-on{opacity:1;pointer-events:auto}.gki-zoom img{max-width:min(86%,820px);max-height:82%;background:#fbf8f2;border-radius:18px;padding:18px;box-shadow:0 30px 90px rgba(0,0,0,.5);transform:scale(.96);transition:transform .35s ease}.gki-zoom.is-on img{transform:none}' +
    '.gki-zoom button{position:absolute;right:26px;top:24px;width:48px;height:48px;border-radius:24px;color:#efe7da;font-size:24px;line-height:1;cursor:pointer}' +
    '@media (max-width:820px){.gki-title{top:82px}.gki-title b{font-size:21px}.gki>.gki-bar{left:12px;right:12px;bottom:12px}.gki-plan{bottom:112px;width:118px;left:12px}.gki-plan img{height:92px}.gki-hint{display:none}.gki-back{left:12px;top:14px}.gki-modes{right:12px;top:14px}.gki-note{font-size:11px;white-space:normal;text-align:center}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var hud = document.createElement('div'); hud.className = 'gki'; hud.hidden = true;
  hud.innerHTML = '<button type="button" class="gki-back gki-glass"><i>←</i>Вернуться к дому</button>' +
    '<div class="gki-title gki-glass"><small></small><b></b><span></span></div>' +
    '<div class="gki-modes gki-glass" role="group" aria-label="Время суток"><button type="button" data-m="day">День</button><button type="button" data-m="night">Вечер</button></div>' +
    '<button type="button" class="gki-plan gki-glass" aria-label="Открыть планировку"><img alt="Планировка квартиры"><span>Планировка</span></button>' +
    '<div class="gki-bar"><div class="gki-hint gki-glass"><b>Осмотритесь</b>ведите пальцем по экрану · метки на полу переносят в другую комнату</div>' +
    '<div class="gki-chips gki-glass" role="group" aria-label="Комнаты"></div>' +
    '<div class="gki-note">Пример оформления. Квартира сдаётся без отделки.</div></div>' +
    '<div class="gki-zoom"><img alt="Планировка квартиры крупно"><button type="button" class="gki-glass" aria-label="Закрыть">×</button></div>';
  ctx.app.appendChild(hud);
  var fade = document.createElement('div'); fade.className = 'gki-fade'; ctx.app.appendChild(fade);
  var $ = function (q) { return hud.querySelector(q); };
  var elChips = $('.gki-chips'), elZoom = $('.gki-zoom'), elHint = $('.gki-hint'), elModes = $('.gki-modes');
  $('.gki-back').addEventListener('click', function () { exit(); });
  $('.gki-plan').addEventListener('click', function () { elZoom.classList.add('is-on'); });
  elZoom.addEventListener('click', function () { elZoom.classList.remove('is-on'); });
  elModes.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && GKScene.setMode) GKScene.setMode(b.dataset.m); });
  elChips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(+b.dataset.i); });

  /* ================= состояние, камера ================= */
  var S = { active: false, busy: false, apt: null, fly: null, spot: 0, saved: null, sun: null, floor: 0, flat: null };
  var vE = new T.Vector3(), vD = new T.Vector3();
  function setView(eye, yaw, pit) {
    var c = Math.cos(pit); vD.set(Math.sin(yaw) * c, Math.sin(pit), Math.cos(yaw) * c);
    ctx.camera.position.copy(eye); ctx.controls.target.copy(eye).addScaledVector(vD, 0.1); ctx.camera.lookAt(ctx.controls.target);
  }
  function angles(from, to) { var d = new T.Vector3().subVectors(to, from).normalize(); return [Math.atan2(d.x, d.z), Math.asin(clamp(d.y, -1, 1))]; }
  function world(v) { return v.clone().add(S.apt.group.position); }
  function mark(i) {
    S.spot = i;
    S.apt.spots.forEach(function (sp, k) { sp.mesh.visible = k !== i; });
    Array.prototype.forEach.call(elChips.children, function (b, k) { b.classList.toggle('is-on', k === i); });
  }
  function go(i, instant, fromBack) {
    if (!S.active || !S.apt) return;
    if (typeof i === 'string') { var k = -1; S.apt.spots.forEach(function (sp, q) { if (sp.key === i) k = q; }); i = k; }
    var sp = S.apt.spots[i]; if (!sp) return;
    var p1 = world(sp.eye), a1 = angles(p1, world(sp.look));
    mark(i); if (ctx.stopFly) ctx.stopFly();
    if (instant) {
      if (fromBack) { var p0 = p1.clone().add(new T.Vector3(-Math.sin(a1[0]) * fromBack, 0, -Math.cos(a1[0]) * fromBack)); setView(p0, a1[0], a1[1] - 0.05); S.fly = { p0: p0, p1: p1, y0: a1[0], dy: 0, q0: a1[1] - 0.05, q1: a1[1], t: 0, dur: 2.6 }; }
      else { setView(p1, a1[0], a1[1]); S.fly = null; }
    } else {
      var cur = ctx.camera.position.clone(), a0 = angles(cur, ctx.controls.target), dy = a1[0] - a0[0]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      S.fly = { p0: cur, p1: p1, y0: a0[0], dy: dy, q0: a0[1], q1: a1[1], t: 0, dur: clamp(1.0 + cur.distanceTo(p1) * 0.14, 1.2, 2.3) };
    }
    ctx.dirty();
  }
  ctx.onFrame(function (dt) {
    if (!S.active || !S.fly) return false;
    var f = S.fly, now = performance.now(); f.t = Math.min(1, f.t + Math.min(0.25, f.last ? (now - f.last) / 1000 : dt) / f.dur); f.last = now;
    var k = f.t * f.t * f.t * (f.t * (6 * f.t - 15) + 10);
    vE.lerpVectors(f.p0, f.p1, k); setView(vE, f.y0 + f.dy * k, f.q0 + (f.q1 - f.q0) * k);
    if (f.t >= 1) S.fly = null;
    return true;
  });
  ctx.controls.addEventListener('start', function () { if (S.active) { S.fly = null; elHint.classList.add('is-off'); } });

  /* нажатие на метку на полу */
  var ray = new T.Raycaster(), ndc = new T.Vector2(), dn = null;
  ctx.canvas.addEventListener('pointerdown', function (e) { if (S.active) dn = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  ctx.canvas.addEventListener('pointerup', function (e) {
    if (!S.active || !dn || !S.apt) return;
    var d = Math.hypot(e.clientX - dn.x, e.clientY - dn.y), t = performance.now() - dn.t; dn = null;
    if (d > 9 || t > 600) return;
    var r = ctx.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    var hit = ray.intersectObjects(S.apt.hot.children, false);
    for (var i = 0; i < hit.length; i++) if (hit[i].object.visible) { go(hit[i].object.userData.spot); break; }
  });
  ctx.canvas.addEventListener('wheel', function (e) {
    if (!S.active) return;
    ctx.camera.fov = clamp(ctx.camera.fov + (e.deltaY > 0 ? 3 : -3), 38, 76); ctx.camera.updateProjectionMatrix(); ctx.dirty();
  }, { passive: true });

  /* свет по времени суток */
  var cDay = new T.Color(0.31, 0.31, 0.3), cNight = new T.Color(0.25, 0.185, 0.115), cLD = new T.Color(0xf1f5ff), cLN = new T.Color(0xffc98f);
  function applyLight() {
    var cur = ctx.cur || {}, lamp = clamp(cur.lamp || 0, 0, 1), M = MAT;
    ambU.value.copy(cDay).lerp(cNight, lamp);
    if (M) { M.emis.color.setScalar(0.62 + lamp * 0.95); M.glow.opacity = Math.max(0, lamp - 0.15) * 0.62; M.blob.opacity = 0.6 - lamp * 0.2; }
    if (S.apt) S.apt.lights.forEach(function (l, i) {
      l.position.copy(l.userData.d).lerp(l.userData.n, lamp); l.color.copy(cLD).lerp(cLN, lamp);
      l.intensity = (i === 2 && !S.apt.spots.some(function (s) { return s.key === 'bed'; }) ? 0.0 : 0.5) * (1 - lamp) + lamp * (i === 0 ? 1.15 : 0.95);
    });
    var m = ctx.mode ? ctx.mode() : 'day';
    Array.prototype.forEach.call(elModes.children, function (b) { b.classList.toggle('is-on', (b.dataset.m === 'night') === (m === 'night')); });
    if (S.active) { sunFocus(true); ctx.shadows(); ctx.dirty(); }
  }
  ctx.onMode(applyLight);

  /* солнце: пока мы внутри, карта теней наводится на квартиру — чёткое пятно света на полу */
  var vS = new T.Vector3();
  function sunFocus(on) {
    var sun = ctx.sun; if (!sun || !sun.shadow || !sun.shadow.camera) return;
    var sc = sun.shadow.camera, sv = S.sun;
    if (on && S.apt) {
      if (!sv) sv = S.sun = { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, n: sc.near, f: sc.far, nb: sun.shadow.normalBias, tg: sun.target.position.clone(), off: sun.position.clone().sub(sun.target.position) };
      if (ctx.cur && ctx.cur.sunP) sv.off.copy(ctx.cur.sunP).sub(sv.tg);
      var g = S.apt.group.position, d = sv.off.length(), R = 13.5;
      vS.set(g.x + S.apt.W / 2, g.y + 1.2, g.z - 3.6);
      sun.target.position.copy(vS); sun.position.copy(vS).add(sv.off); sun.target.updateMatrixWorld();
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = Math.max(1, d - 45); sc.far = d + 45; sc.updateProjectionMatrix();
      sun.shadow.normalBias = 0.02;
    } else if (!on && sv) {
      sun.target.position.copy(sv.tg); sun.position.copy(sv.tg).add(sv.off); sun.target.updateMatrixWorld();
      sc.left = sv.l; sc.right = sv.r; sc.top = sv.t; sc.bottom = sv.b; sc.near = sv.n; sc.far = sv.f; sc.updateProjectionMatrix();
      sun.shadow.normalBias = sv.nb; S.sun = null;
    }
  }
  function zonesVisible(on) { (ctx.zones || []).forEach(function (z) { [z.mat, z.lmat].forEach(function (m) { if (m) m.visible = on; }); }); }
  function emit(v) { document.dispatchEvent(new CustomEvent('gk:view', { detail: { view: v } })); }
  function disposeApt() {
    if (!S.apt) return;
    ctx.scene.remove(S.apt.group); S.apt.geos.forEach(function (g) { g.dispose(); }); S.apt = null;
  }

  function doEnter(floorN, fl) {
    if (!S.apt || S.apt.id !== fl.id) { disposeApt(); S.apt = build(fl); }
    var a = S.apt, cam = ctx.camera;
    a.group.position.set(clamp(9 - a.W / 2, -11, 26 - a.W), ctx.dims.GH + (floorN - 2) * ctx.dims.FH + 0.12, ZS);
    a.group.visible = true; ctx.scene.add(a.group); a.group.updateMatrixWorld(true);
    if (!S.saved) S.saved = { fov: cam.fov, near: cam.near, house: ctx.houseRoot.visible };
    ctx.houseRoot.visible = false; zonesVisible(false);
    cam.fov = FOV; cam.near = 0.06; cam.updateProjectionMatrix();
    ctx.app.classList.add('view-interior'); ctx.picking(false);
    if (GKScene.autoRotate) GKScene.autoRotate(false);
    ctx.limits({ minDistance: 0.1, maxDistance: 0.1, minPolarAngle: Math.PI / 2 - 1.0, maxPolarAngle: Math.PI / 2 + 0.85, enableZoom: false, enableRotate: true, rotateSpeed: -0.22 });
    S.active = true; S.floor = floorN; S.flat = fl;
    $('.gki-title small').textContent = floorN + ' этаж · вид на город';
    $('.gki-title b').textContent = fl.name || 'Квартира';
    $('.gki-title span').textContent = fl.area ? String(fl.area.toFixed(2)).replace('.', ',') + ' м²' : '';
    var im = $('.gki-plan img'), zi = elZoom.querySelector('img'); $('.gki-plan').style.display = fl.img ? '' : 'none'; if (fl.img) { im.src = fl.img; zi.src = fl.img; }
    elChips.innerHTML = a.spots.map(function (sp, i) { return '<button type="button" data-i="' + i + '">' + sp.label + '</button>'; }).join('');
    var um = document.querySelector('#app .modes'), vis = false;
    if (um) { var cs = getComputedStyle(um); vis = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; }
    elModes.style.display = vis ? 'none' : '';
    elHint.classList.remove('is-off'); elZoom.classList.remove('is-on');
    applyLight(); sunFocus(true); go(0, true, 1.5); ctx.shadows(); ctx.dirty(); emit('interior');
  }
  function doExit() {
    var cam = ctx.camera, sv = S.saved || { fov: 30, near: 1, house: true };
    S.active = false; S.fly = null; S.saved = null; sunFocus(false);
    if (S.apt) { S.apt.group.visible = false; ctx.scene.remove(S.apt.group); }
    ctx.houseRoot.visible = sv.house; zonesVisible(true);
    cam.fov = sv.fov; cam.near = sv.near; cam.updateProjectionMatrix();
    ctx.limits(); ctx.picking(true); ctx.app.classList.remove('view-interior');
    if (ctx.stopFly) ctx.stopFly();
    ctx.home(true); ctx.shadows(); ctx.dirty(); emit('home');
  }
  function enter(floorN, fl) {
    if (S.busy) return;
    if (typeof fl === 'string') fl = (GK.flats || []).filter(function (f) { return f.id === fl; })[0];
    fl = fl || (S.active && S.flat) || (GK.flats || [])[5] || { id: 'x', rooms: 2, name: 'Квартира', area: 64 };
    floorN = clamp(Math.round(+floorN || 5), 2, (ctx.dims && ctx.dims.floors) || 8);
    S.busy = true; S.phase = 'in'; S.wantExit = false;
    ctx.app.classList.add('view-interior'); fade.classList.add('is-on');           // класс сразу: интерфейс дома уходит вместе с затемнением
    setTimeout(function () {
      try { doEnter(floorN, fl); }
      catch (e) {
        console.error('GKInterior', e);
        if (S.active) doExit(); else { ctx.app.classList.remove('view-interior'); emit('home'); }
        S.busy = false; S.phase = null; fade.classList.remove('is-on'); hud.hidden = true; return;
      }
      hud.hidden = false;
      setTimeout(function () {
        hud.classList.add('is-on'); fade.classList.remove('is-on'); S.busy = false; S.phase = null; ctx.dirty();
        if (S.wantExit) { S.wantExit = false; exit(); }
      }, 260);
    }, 440);
  }
  function exit() {
    if (S.busy) { if (S.phase === 'in') S.wantExit = true; return; }
    if (!S.active) return;
    S.busy = true; S.phase = 'out'; fade.classList.add('is-on'); hud.classList.remove('is-on');
    setTimeout(function () {
      doExit(); hud.hidden = true;
      setTimeout(function () { fade.classList.remove('is-on'); S.busy = false; S.phase = null; ctx.dirty(); }, 200);
    }, 440);
  }

  window.GKInterior = { enter(этаж, квартира), exit(), active(), go(комната), spots() }
   Квартира собирается параметрически (1-комнатная, евро-двушка, 2- и 3-комнатная) и ставится в южное крыло
   на реальную высоту выбранного этажа, окнами на юг — на улицу и город. Дом на время просмотра скрывается. */
(function () {
  'use strict';
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('interior')) return;
  var ctx = GKScene.ctx, T = ctx.T, GK = window.GK || {};
  var HC = 2.85, TW = 0.1, EYE = 1.55, FOV = 62, LG = 1.4;
  var ZS = 26.75 - 0.36;                                  // внутренняя грань южной стены дома
  var lin = function (h) { return new T.Color(h).convertSRGBToLinear(); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var C = {
    white: lin(0xffffff), wall: lin(0xe9e2d5), wallWarm: lin(0xe1d9ca), accent: lin(0x77726a), accent2: lin(0x8f9a8c), ceil: lin(0xfbf9f5),
    plaster: lin(0xf3efe7), skirt: lin(0xf6f3ec), graph: lin(0x34363a), graph2: lin(0x45474c), black: lin(0x141516), blackGl: lin(0x08090b),
    cream: lin(0xe9e1d2), creamL: lin(0xf2ecdf), boucle: lin(0xd8ccb8), boucleL: lin(0xe6dccb), taupe: lin(0x9c8f7d), linen: lin(0xf4f0e8),
    terra: lin(0xb9774f), olive: lin(0x7c8468), stone: lin(0xe7e2d8), stoneD: lin(0x2c2b2a), oak: lin(0xfbf3e8), oakD: lin(0xd2c2ae), walnut: lin(0x8a6a50),
    brass: lin(0xc9a063), steel: lin(0x9a9c9e), mirror: lin(0xd9dde0), pot: lin(0x3b3c3e), potL: lin(0xd9d2c4), trunk: lin(0x4a3a2c),
    leaf: lin(0x44623d), leaf2: lin(0x5a7a48), warm: lin(0xffd9a0), shade: lin(0xfff1d8), sheer: lin(0xf7f3ea), frame: lin(0x26282b), tile: lin(0xd8d3c8)
  };
  var seed = 1234;
  function rnd() { seed = (seed * 1664525 + 1013904223) | 0; return ((seed >>> 0) % 100000) / 100000; }
  var ctex = ctx.ctex || function (w, h, draw, rep) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; } return t; };

  /* ================= текстуры ================= */
  var TEX = null;
  function textures() {
    if (TEX) return TEX;
    var joints = [], rows = 8, i;
    for (i = 0; i < rows; i++) joints.push([rnd(), 0.35 + rnd() * 0.3]);
    function wrapRect(g, w, x0, x1, y, h) { g.fillRect(x0, y, x1 - x0, h); if (x1 > w) g.fillRect(x0 - w, y, x1 - x0, h); }
    var parquet = ctex(1024, 1024, function (g, w, h) {
      var ph = h / rows;
      for (var r = 0; r < rows; r++) {
        for (var p = 0; p < 2; p++) {
          var t = 0.94 + rnd() * 0.12, wr = rnd() * 6 - 3;
          g.fillStyle = 'rgb(' + Math.round((178 + wr) * t) + ',' + Math.round(145 * t) + ',' + Math.round((108 - wr) * t) + ')';
          var xa = joints[r][0] * w, xb = xa + joints[r][1] * w;
          if (p === 0) g.fillRect(0, r * ph, w, ph); else wrapRect(g, w, xa, xb, r * ph, ph);
        }
        for (var k = 0; k < 34; k++) {                     // волокна
          var y0 = r * ph + rnd() * ph, amp = rnd() * 3, f = 0.004 + rnd() * 0.01, pp = rnd() * 6;
          g.strokeStyle = rnd() > 0.35 ? 'rgba(92,60,30,' + (0.05 + rnd() * 0.1) + ')' : 'rgba(255,236,205,' + (0.05 + rnd() * 0.08) + ')';
          g.lineWidth = 0.6 + rnd() * 1.6; g.beginPath();
          for (var x = 0; x <= w; x += 32) { var yy = clamp(y0 + Math.sin(x * f + pp) * amp, r * ph + 2, (r + 1) * ph - 2); if (x) g.lineTo(x, yy); else g.moveTo(x, yy); }
          g.stroke();
        }
        g.fillStyle = 'rgba(46,28,14,.62)'; g.fillRect(0, r * ph, w, 1.6);
        g.fillRect(joints[r][0] * w, r * ph, 1.6, ph); g.fillRect((joints[r][0] + joints[r][1]) * w % w, r * ph, 1.6, ph);
      }
    }, 1);
    var parquetB = ctex(512, 512, function (g, w, h) {
      var ph = h / rows; g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 500; k++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.06)'; g.fillRect(rnd() * w, rnd() * h, 30 + rnd() * 90, 1); }
      g.fillStyle = '#2a2a2a';
      for (var r = 0; r < rows; r++) { g.fillRect(0, r * ph - 1, w, 2.4); g.fillRect(joints[r][0] * w - 1, r * ph, 2.2, ph); g.fillRect((joints[r][0] + joints[r][1]) * w % w - 1, r * ph, 2.2, ph); }
    }, 1);
    var wood = ctex(512, 512, function (g, w, h) {
      g.fillStyle = '#b38f68'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 150; k++) {
        var x0 = rnd() * w, amp = rnd() * 5, f = 0.005 + rnd() * 0.012, pp = rnd() * 6;
        g.strokeStyle = rnd() > 0.4 ? 'rgba(84,54,28,' + (0.05 + rnd() * 0.13) + ')' : 'rgba(250,226,190,' + (0.05 + rnd() * 0.1) + ')';
        g.lineWidth = 0.6 + rnd() * 2.2; g.beginPath();
        for (var y = 0; y <= h; y += 32) { var xx = x0 + Math.sin(y * f + pp) * amp; if (y) g.lineTo(xx, y); else g.moveTo(xx, y); }
        g.stroke();
      }
    });
    var rug = ctex(512, 512, function (g, w, h) {
      g.fillStyle = '#e2d9c9'; g.fillRect(0, 0, w, h);
      for (var k = 0; k < 5000; k++) { g.fillStyle = rnd() > 0.5 ? 'rgba(255,255,255,.07)' : 'rgba(90,76,58,.06)'; g.fillRect(rnd() * w, rnd() * h, 2 + rnd() * 5, 1.5); }
      g.strokeStyle = 'rgba(128,112,92,.55)'; g.lineWidth = 3; g.strokeRect(22, 22, w - 44, h - 44);
      g.lineWidth = 1; g.strokeRect(32, 32, w - 64, h - 64);
      g.lineWidth = 14; g.strokeStyle = 'rgba(150,134,112,.34)'; g.beginPath(); g.arc(w * 0.2, h * 1.05, w * 0.62, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(70,68,66,.3)'; g.lineWidth = 5; g.beginPath(); g.arc(w * 0.95, h * 0.1, w * 0.5, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(185,119,79,.4)'; g.lineWidth = 4; g.beginPath(); g.arc(w * 0.62, h * 0.55, w * 0.2, 0, 7); g.stroke();
    });
    var art = ctex(1024, 512, function (g, w, h) {
      var tw = w / 4, bg = ['#efe8db', '#e9e2d4', '#f1ebe0', '#2f3134'];
      for (var t = 0; t < 4; t++) {
        g.save(); g.translate(t * tw, 0); g.beginPath(); g.rect(0, 0, tw, h); g.clip();
        g.fillStyle = '#faf8f3'; g.fillRect(0, 0, tw, h); g.fillStyle = bg[t]; g.fillRect(26, 34, tw - 52, h - 68);
        if (t === 0) { g.fillStyle = '#34363a'; g.beginPath(); g.arc(tw * 0.5, h * 0.62, 78, Math.PI, 0); g.fill(); g.fillStyle = '#c98a5b'; g.beginPath(); g.arc(tw * 0.6, h * 0.3, 42, 0, 7); g.fill(); g.strokeStyle = '#34363a'; g.lineWidth = 2; g.beginPath(); g.moveTo(50, h * 0.74); g.lineTo(tw - 50, h * 0.74); g.stroke(); }
        if (t === 1) { g.strokeStyle = '#3a3c40'; g.lineWidth = 3; for (var k = 0; k < 7; k++) { g.beginPath(); g.arc(tw * 0.5, h * 0.9, 50 + k * 26, Math.PI * 1.08, Math.PI * 1.92); g.stroke(); } g.fillStyle = '#b9774f'; g.fillRect(tw * 0.44, h * 0.16, tw * 0.12, h * 0.1); }
        if (t === 2) { g.fillStyle = '#8f9a8c'; g.fillRect(60, 110, 70, 250); g.fillStyle = '#c9a063'; g.fillRect(118, 190, 78, 210); g.fillStyle = '#34363a'; g.beginPath(); g.arc(150, 150, 34, 0, 7); g.fill(); }
        if (t === 3) { g.strokeStyle = '#c9a063'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(54, h * 0.7); g.bezierCurveTo(100, h * 0.2, 150, h * 0.9, tw - 54, h * 0.3); g.stroke(); g.fillStyle = '#efe7da'; g.beginPath(); g.arc(tw * 0.36, h * 0.36, 30, 0, 7); g.fill(); }
        g.restore();
      }
    });
    var lace = ctex(256, 256, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#0c0c0d'; g.fillStyle = '#0c0c0d'; g.lineCap = 'round';
      g.lineWidth = 9; g.beginPath(); g.moveTo(5, 0); g.lineTo(5, h); g.moveTo(w - 5, 0); g.lineTo(w - 5, h); g.stroke();
      g.fillRect(0, 0, w, 10); g.fillRect(0, h - 10, w, 10);
      g.lineWidth = 7;
      g.beginPath(); g.arc(w / 2, h / 2, 52, 0, 7); g.stroke();
      g.beginPath(); g.arc(w / 2, h / 2, 22, 0, 7); g.stroke();
      [[0, 0], [w, 0], [0, h], [w, h]].forEach(function (p) { g.beginPath(); g.arc(p[0], p[1], 78, 0, 7); g.stroke(); });
      g.beginPath(); g.moveTo(w / 2, 10); g.lineTo(w / 2, h / 2 - 52); g.moveTo(w / 2, h / 2 + 52); g.lineTo(w / 2, h - 10); g.moveTo(8, h / 2); g.lineTo(w / 2 - 52, h / 2); g.moveTo(w / 2 + 52, h / 2); g.lineTo(w - 8, h / 2); g.stroke();
    }, 1);
    var blob = ctex(128, 128, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, w / 2); gr.addColorStop(0, 'rgba(0,0,0,.62)'); gr.addColorStop(0.55, 'rgba(0,0,0,.3)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var glow = ctex(8, 64, function (g, w, h) { var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });
    var ring = ctex(128, 128, function (g, w, h) {
      var gr = g.createRadialGradient(64, 64, 6, 64, 64, 62); gr.addColorStop(0, 'rgba(255,236,205,.5)'); gr.addColorStop(0.5, 'rgba(226,168,120,.16)'); gr.addColorStop(1, 'rgba(226,168,120,0)');
      g.fillStyle = gr; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,244,226,.95)'; g.lineWidth = 4; g.beginPath(); g.arc(64, 64, 46, 0, 7); g.stroke();
      g.strokeStyle = 'rgba(226,168,120,.9)'; g.lineWidth = 1.5; g.beginPath(); g.arc(64, 64, 56, 0, 7); g.stroke(); g.fillStyle = 'rgba(255,244,226,.95)'; g.beginPath(); g.arc(64, 64, 7, 0, 7); g.fill();
    });
    TEX = { parquet: parquet, parquetB: parquetB, wood: wood, rug: rug, art: art, lace: lace, blob: blob, glow: glow, ring: ring };
    return TEX;
  }

  /* ================= материалы ================= */
  var ambU = { value: new T.Color(0.5, 0.5, 0.5) }, MAT = null;
  function amb(m) {                                        // «свет комнаты»: мягкая заливка только для материалов интерьера
    m.onBeforeCompile = function (sh) {
      sh.uniforms.gkAmb = ambU;
      sh.fragmentShader = 'uniform vec3 gkAmb;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n totalEmissiveRadiance += diffuseColor.rgb * gkAmb;');
    };
    m.customProgramCacheKey = function () { return 'gki-amb'; };
    return m;
  }
  function std(o, env) {
    var m = ctx.M ? ctx.M(o) : new T.MeshStandardMaterial(o);
    if (env != null) { m.userData.env = env; m.envMapIntensity = env * (ctx.cur && ctx.cur.env != null ? ctx.cur.env : 1); }
    return amb(m);
  }
  function materials() {
    if (MAT) return MAT;
    var X = textures();
    MAT = {
      shell: std({ vertexColors: true, roughness: 0.94, metalness: 0 }, 0.05),
      floor: std({ map: X.parquet, bumpMap: X.parquetB, bumpScale: 0.006, vertexColors: true, roughness: 0.4, metalness: 0 }, 0.42),
      matte: std({ vertexColors: true, roughness: 0.86, metalness: 0 }, 0.06),
      satin: std({ vertexColors: true, roughness: 0.26, metalness: 0 }, 0.2),
      metal: std({ vertexColors: true, roughness: 0.3, metalness: 1 }, 0.95),
      wood: std({ map: X.wood, vertexColors: true, roughness: 0.52, metalness: 0 }, 0.16),
      rug: std({ map: X.rug, vertexColors: true, roughness: 1, metalness: 0 }, 0.02),
      art: std({ map: X.art, vertexColors: true, roughness: 0.7, metalness: 0 }, 0.05),
      curtain: std({ vertexColors: true, roughness: 1, metalness: 0, transparent: true, opacity: 0.6, side: T.DoubleSide, depthWrite: false }, 0.02),
      glass: std({ color: 0xdfe9ee, roughness: 0.03, metalness: 0, transparent: true, opacity: 0.1, side: T.DoubleSide, depthWrite: false }, 0.7),
      emis: new T.MeshBasicMaterial({ vertexColors: true }),
      lace: new T.MeshBasicMaterial({ map: X.lace, alphaTest: 0.45, side: T.DoubleSide, color: 0x1a1a1b }),
      blob: new T.MeshBasicMaterial({ map: X.blob, transparent: true, depthWrite: false, opacity: 0.6, color: 0x000000 }),
      glow: new T.MeshBasicMaterial({ map: X.glow, transparent: true, depthWrite: false, blending: T.AdditiveBlending, color: 0xffc98a, opacity: 0, side: T.DoubleSide }),
      ring: new T.MeshBasicMaterial({ map: X.ring, transparent: true, depthWrite: false, opacity: 0.95 })
    };
    MAT.glass.vertexColors = false;
    return MAT;
  }

  /* ================= сборка геометрии ================= */
  var bins = {}, XF = null, openings = [];
  function at(x, y, z, ry, fn) { var prev = XF, m = new T.Matrix4().makeRotationY(ry || 0); m.setPosition(x, y, z); XF = prev ? prev.clone().multiply(m) : m; fn(); XF = prev; }
  function put(bin, g, col) {
    if (g.index) g = g.toNonIndexed();
    if (XF) g.applyMatrix4(XF);
    col = col || C.white;
    var n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new T.BufferAttribute(c, 3));
    (bins[bin] || (bins[bin] = [])).push(g);
  }
  function box(bin, x0, x1, y0, y1, z0, z1, col) { var g = new T.BoxGeometry(Math.abs(x1 - x0), Math.abs(y1 - y0), Math.abs(z1 - z0)); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); put(bin, g, col); }
  function rb(bin, cx, cy, cz, w, h, d, r, col, ry, rz) {
    var rr = Math.min(r, w / 2 - 0.002, h / 2 - 0.002, d / 2 - 0.002);
    var g = T.RoundedBoxGeometry && rr > 0.004 ? new T.RoundedBoxGeometry(w, h, d, 2, rr) : new T.BoxGeometry(w, h, d);
    if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(cx, cy, cz); put(bin, g, col);
  }
  function cyl(bin, cx, y0, cz, rBot, rTop, h, col, seg) { var g = new T.CylinderGeometry(rTop, rBot, h, seg || 14); g.translate(cx, y0 + h / 2, cz); put(bin, g, col); }
  function ball(bin, cx, cy, cz, rx, ry, rz, col, rotY, rotZ) { var g = new T.SphereGeometry(1, 9, 6); g.scale(rx, ry, rz); if (rotZ) g.rotateZ(rotZ); if (rotY) g.rotateY(rotY); g.translate(cx, cy, cz); put(bin, g, col); }
  function flat(bin, cx, y, cz, w, d, col, ry) { var g = new T.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2); if (ry) g.rotateY(ry); g.translate(cx, y, cz); put(bin, g, col); }
  function blob(cx, cz, w, d, ry) { flat('blob', cx, 0.013, cz, w, d, null, ry); }

  var tC = [0, 0, 0], tU = [0, 0];
  function grid(bin, O, du, dv, n, u0, u1, v0, v1, cf, uvf) {
    var step = 0.22, nu = Math.max(1, Math.ceil((u1 - u0) / step)), nv = Math.max(1, Math.ceil((v1 - v0) / step));
    var P = new Float32Array(nu * nv * 18), N = new Float32Array(nu * nv * 18), Cc = new Float32Array(nu * nv * 18), U = new Float32Array(nu * nv * 12), k = 0, q = 0;
    function vtx(u, v) {
      var x = O[0] + du[0] * u + dv[0] * v, y = O[1] + du[1] * u + dv[1] * v, z = O[2] + du[2] * u + dv[2] * v;
      P[k] = x; P[k + 1] = y; P[k + 2] = z; N[k] = n[0]; N[k + 1] = n[1]; N[k + 2] = n[2];
      var c = cf(u, v, x, y, z); Cc[k] = c[0]; Cc[k + 1] = c[1]; Cc[k + 2] = c[2]; k += 3;
      if (uvf) { var t = uvf(x, y, z); U[q++] = t[0]; U[q++] = t[1]; } else { U[q++] = u; U[q++] = v; }
    }
    for (var i = 0; i < nu; i++) for (var j = 0; j < nv; j++) {
      var ua = u0 + (u1 - u0) * i / nu, ub = u0 + (u1 - u0) * (i + 1) / nu, va = v0 + (v1 - v0) * j / nv, vb = v0 + (v1 - v0) * (j + 1) / nv;
      vtx(ua, va); vtx(ub, va); vtx(ub, vb); vtx(ua, va); vtx(ub, vb); vtx(ua, vb);
    }
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.BufferAttribute(P, 3)); g.setAttribute('normal', new T.BufferAttribute(N, 3));
    g.setAttribute('uv', new T.BufferAttribute(U, 2)); g.setAttribute('color', new T.BufferAttribute(Cc, 3));
    (bins[bin] || (bins[bin] = [])).push(g);
  }
  function dayl(z) { return 0.7 + 0.3 * Math.exp(Math.min(0, z) / 2.8); }                 // ближе к окну — светлее
  function shade(base, L, Hh, k) {                                                          // запечённое затенение в углах
    var s = 0.3;
    return function (u, v, x, y, z) {
      var a = (1 - k[0] * Math.exp(-u / s)) * (1 - k[1] * Math.exp(-(L - u) / s)) * (1 - k[2] * Math.exp(-v / s)) * (1 - k[3] * Math.exp(-(Hh - v) / s)) * dayl(z);
      tC[0] = base.r * a; tC[1] = base.g * a; tC[2] = base.b * a; return tC;
    };
  }
  function floorUV(x, y, z) { tU[0] = z / 2.0; tU[1] = x / 1.2; return tU; }

  function wallFace(r, side) {
    var L, O, du, n, toU, plane, ax, ops = [], base = (r.acc && r.acc[side]) || r.wall || C.wall;
    if (side === 'N') { L = r.x1 - r.x0; O = [r.x0, 0, r.z0]; du = [1, 0, 0]; n = [0, 0, 1]; toU = function (a) { return a - r.x0; }; plane = r.z0; ax = 'z'; }
    else if (side === 'S') { L = r.x1 - r.x0; O = [r.x1, 0, r.z1]; du = [-1, 0, 0]; n = [0, 0, -1]; toU = function (a) { return r.x1 - a; }; plane = r.z1; ax = 'z'; }
    else if (side === 'W') { L = r.z1 - r.z0; O = [r.x0, 0, r.z1]; du = [0, 0, -1]; n = [1, 0, 0]; toU = function (a) { return r.z1 - a; }; plane = r.x0; ax = 'x'; }
    else { L = r.z1 - r.z0; O = [r.x1, 0, r.z0]; du = [0, 0, 1]; n = [-1, 0, 0]; toU = function (a) { return a - r.z0; }; plane = r.x1; ax = 'x'; }
    openings.forEach(function (o) {
      if (o.ax !== ax || Math.abs(o.at - plane) > 0.2) return;
      var a = toU(o.a0), b = toU(o.a1), u0 = Math.min(a, b), u1 = Math.max(a, b);
      if (u1 > 0.02 && u0 < L - 0.02) ops.push({ u0: Math.max(0, u0), u1: Math.min(L, u1), v0: o.v0, v1: o.v1 });
    });
    ops.sort(function (a, b) { return a.u0 - b.u0; });
    var cf = shade(base, L, HC, [0.3, 0.3, 0.34, 0.22]), dv = [0, 1, 0], u = 0, segs = [];
    function rect(a, b, c, d) { if (b - a > 0.005 && d - c > 0.005) grid('shell', O, du, dv, n, a, b, c, d, cf); }
    ops.forEach(function (o) {
      rect(u, o.u0, 0, HC); if (o.u0 > u) segs.push([u, o.u0]);
      rect(o.u0, o.u1, 0, o.v0); if (o.v0 > 0.2) segs.push([o.u0, o.u1]);
      rect(o.u0, o.u1, o.v1, HC); u = o.u1;
    });
    rect(u, L, 0, HC); if (L > u) segs.push([u, L]);
    if (r.key !== 'loggia') segs.forEach(function (s) {            // плинтус
      var a = [O[0] + du[0] * s[0], O[2] + du[2] * s[0]], b = [O[0] + du[0] * s[1], O[2] + du[2] * s[1]], t = 0.014;
      box('matte', Math.min(a[0], b[0], a[0] + n[0] * t), Math.max(a[0], b[0], a[0] + n[0] * t), 0, 0.09, Math.min(a[1], b[1], a[1] + n[2] * t), Math.max(a[1], b[1], a[1] + n[2] * t), C.skirt);
    });
  }
  function roomShell(r) {
    var w = r.x1 - r.x0, d = r.z1 - r.z0;
    grid('floor', [r.x0, 0, r.z1], [1, 0, 0], [0, 0, -1], [0, 1, 0], 0, w, 0, d, shade(r.floorC || C.white, w, d, [0.34, 0.34, 0.34, 0.34]), floorUV);
    grid('shell', [r.x0, HC, r.z0], [1, 0, 0], [0, 0, 1], [0, -1, 0], 0, w, 0, d, shade(C.ceil, w, d, [0.2, 0.2, 0.2, 0.2]));
    ['N', 'S', 'W', 'E'].forEach(function (s) { wallFace(r, s); });
  }
  function facadeWall(W) {                                   // толстая наружная стена с проёмами (откосы видны изнутри)
    var ops = openings.filter(function (o) { return o.ax === 'z' && o.at > 0; }).sort(function (a, b) { return a.a0 - b.a0; }), x = -0.3;
    function b(x0, x1, y0, y1) { if (x1 - x0 > 0.005 && y1 - y0 > 0.005) box('matte', x0, x1, y0, y1, 0.004, 0.36, C.plaster); }
    ops.forEach(function (o) { b(x, o.a0, -0.2, HC + 0.2); b(o.a0, o.a1, -0.2, o.v0); b(o.a0, o.a1, o.v1, HC + 0.2); x = o.a1; });
    b(x, W + 0.3, -0.2, HC + 0.2);
  }
  function winFrame(o, zc, nDiv) {
    var f = 0.055, d = 0.034, c = C.frame, i;
    box('satin', o.a0, o.a0 + f, o.v0, o.v1, zc - d, zc + d, c); box('satin', o.a1 - f, o.a1, o.v0, o.v1, zc - d, zc + d, c);
    box('satin', o.a0, o.a1, o.v1 - f, o.v1, zc - d, zc + d, c); box('satin', o.a0, o.a1, o.v0, o.v0 + f, zc - d, zc + d, c);
    for (i = 1; i < nDiv; i++) { var x = o.a0 + (o.a1 - o.a0) * i / nDiv; box('satin', x - 0.028, x + 0.028, o.v0, o.v1, zc - d, zc + d, c); }
    var g = new T.PlaneGeometry(o.a1 - o.a0, o.v1 - o.v0); g.translate((o.a0 + o.a1) / 2, (o.v0 + o.v1) / 2, zc); put('glass', g);
  }
  function curtain(x0, x1, z, y0, y1) {
    var w = x1 - x0, g = new T.PlaneGeometry(w, y1 - y0, Math.max(8, Math.round(w / 0.03)), 1), p = g.attributes.position;
    for (var i = 0; i < p.count; i++) { var px = p.getX(i); p.setZ(i, Math.sin(px * 54) * 0.03 + Math.sin(px * 19 + 1) * 0.012); }
    g.computeVertexNormals(); g.translate((x0 + x1) / 2, (y0 + y1) / 2, z); put('curtain', g, C.sheer);
  }
  function casing(o) {                                       // обрамление проёма в перегородке + порожек
    var d = TW / 2 + 0.03, j = 0.045, c = C.oakD;
    if (o.ax === 'x') {
      box('wood', o.at - d, o.at + d, 0, o.v1, o.a0, o.a0 + j, c); box('wood', o.at - d, o.at + d, 0, o.v1, o.a1 - j, o.a1, c);
      box('wood', o.at - d, o.at + d, o.v1 - j, o.v1, o.a0, o.a1, c); box('wood', o.at - TW / 2 - 0.02, o.at + TW / 2 + 0.02, -0.01, 0.005, o.a0, o.a1, c);
    } else {
      box('wood', o.a0, o.a0 + j, 0, o.v1, o.at - d, o.at + d, c); box('wood', o.a1 - j, o.a1, 0, o.v1, o.at - d, o.at + d, c);
      box('wood', o.a0, o.a1, o.v1 - j, o.v1, o.at - d, o.at + d, c); box('wood', o.a0, o.a1, -0.01, 0.005, o.at - TW / 2 - 0.02, o.at + TW / 2 + 0.02, c);
    }
  }

  /* ================= мебель ================= */
  function doorSlab(x, z, ry, w, col) {                      // закрытая дверь на стене (входная, санузел)
    at(x, 0, z, ry, function () {
      box('satin', -w / 2, w / 2, 0, 2.12, 0.004, 0.035, col || C.graph);
      box('wood', -w / 2 - 0.06, -w / 2, 0, 2.18, 0, 0.045, C.oakD); box('wood', w / 2, w / 2 + 0.06, 0, 2.18, 0, 0.045, C.oakD); box('wood', -w / 2 - 0.06, w / 2 + 0.06, 2.12, 2.18, 0, 0.045, C.oakD);
      box('metal', w / 2 - 0.11, w / 2 - 0.09, 0.95, 1.12, 0.035, 0.075, C.brass); box('metal', w / 2 - 0.22, w / 2 - 0.09, 1.04, 1.06, 0.06, 0.075, C.brass);
    });
  }
  function doorLeaf(x, z, ry) {                              // открытое полотно межкомнатной двери
    at(x, 0, z, ry, function () { box('satin', 0, 0.86, 0.01, 2.08, -0.02, 0.02, C.creamL); box('metal', 0.72, 0.84, 1.03, 1.05, -0.06, 0.06, C.brass); });
  }
  function picture(x, y, z, ry, w, h, tile) {
    at(x, y, z, ry, function () {
      box('matte', -w / 2 - 0.018, w / 2 + 0.018, -h / 2 - 0.018, h / 2 + 0.018, 0.002, 0.028, C.black);
      var g = new T.PlaneGeometry(w, h), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, (tile + uv.getX(i)) / 4);
      g.translate(0, 0, 0.03); put('art', g);
    });
  }
  function plant(x, z, h, big) {
    at(x, 0, z, 0, function () {
      cyl('matte', 0, 0, 0, 0.13, 0.17, 0.36, big ? C.pot : C.potL, 16); cyl('matte', 0, 0.3, 0, 0.014, 0.008, h * 0.62, C.trunk, 6);
      var n = big ? 16 : 10;
      for (var i = 0; i < n; i++) {
        var a = i * 2.4, t = i / n, yy = 0.5 + t * (h - 0.55), rr = 0.1 + (1 - Math.abs(t - 0.45)) * 0.2 * (big ? 1 : 0.7);
        ball('matte', Math.sin(a) * rr, yy, Math.cos(a) * rr, 0.06, 0.012, 0.19 * (big ? 1 : 0.75), i % 3 ? C.leaf : C.leaf2, a, 0.25 + rnd() * 0.5);
      }
    });
    blob(x, z, 0.7, 0.7);
  }
  function pendant(x, z, yb, col) {
    cyl('metal', x, yb + 0.16, z, 0.004, 0.004, HC - yb - 0.16, C.black, 5);
    cyl('metal', x, yb, z, 0.15, 0.03, 0.17, col || C.brass, 20); cyl('emis', x, yb - 0.004, z, 0.13, 0.13, 0.006, C.warm, 18);
  }
  function spotsRow(x0, x1, z, n) { for (var i = 0; i < n; i++) { var x = x0 + (x1 - x0) * (n === 1 ? 0.5 : i / (n - 1)); cyl('emis', x, HC - 0.006, z, 0.05, 0.05, 0.005, C.warm, 12); cyl('matte', x, HC - 0.01, z, 0.065, 0.065, 0.009, C.white, 14); } }
  function chair(x, z, ry, col) {
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.46, 0, 0.46, 0.07, 0.46, 0.03, col); rb('matte', 0, 0.72, -0.21, 0.44, 0.36, 0.055, 0.025, col);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.19, 0, k[1] * 0.19, 0.011, 0.015, 0.43, C.black, 6); });
    });
  }
  function sofa(x, z, ry, len, col, colL) {                  // спинка к +x
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.21, 0, 0.94, 0.2, len, 0.05, col); rb('matte', 0.36, 0.5, 0, 0.2, 0.62, len, 0.08, col);
      rb('matte', 0, 0.42, -len / 2 + 0.1, 0.94, 0.5, 0.2, 0.08, col); rb('matte', 0, 0.42, len / 2 - 0.1, 0.94, 0.5, 0.2, 0.08, col);
      var n = len > 2.2 ? 3 : 2, wz = (len - 0.42) / n, i;
      for (i = 0; i < n; i++) { var zz = -len / 2 + 0.21 + wz * (i + 0.5); rb('matte', -0.09, 0.39, zz, 0.72, 0.17, wz - 0.02, 0.06, colL); rb('matte', 0.2, 0.64, zz, 0.17, 0.38, wz - 0.04, 0.07, colL, 0, 0.16); }
      rb('matte', 0.08, 0.6, -len / 2 + 0.42, 0.14, 0.36, 0.4, 0.06, C.graph2, 0.25, 0.3); rb('matte', 0.06, 0.58, len / 2 - 0.44, 0.13, 0.32, 0.36, 0.06, C.terra, -0.2, 0.32);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.38, 0, k[1] * (len / 2 - 0.12), 0.012, 0.018, 0.11, C.black, 6); });
    });
  }
  function armchair(x, z, ry, col) {
    at(x, 0, z, ry, function () {
      rb('matte', 0, 0.3, 0, 0.74, 0.2, 0.74, 0.07, col); rb('matte', 0, 0.58, -0.3, 0.74, 0.52, 0.16, 0.07, col); rb('matte', -0.31, 0.44, 0, 0.13, 0.34, 0.7, 0.05, col); rb('matte', 0.31, 0.44, 0, 0.13, 0.34, 0.7, 0.05, col);
      rb('matte', 0, 0.44, 0.03, 0.5, 0.12, 0.56, 0.05, C.creamL);
      [[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(function (k) { cyl('metal', k[0] * 0.3, 0, k[1] * 0.3, 0.012, 0.016, 0.2, C.brass, 6); });
    });
    blob(x, z, 1.1, 1.1);
  }
  function floorLamp(x, z) {
    cyl('metal', x, 0, z, 0.15, 0.15, 0.02, C.black, 18); cyl('metal', x, 0.02, z, 0.011, 0.011, 1.38, C.brass, 8);
    cyl('emis', x, 1.36, z, 0.2, 0.15, 0.3, C.shade, 20); blob(x, z, 0.5, 0.5);
  }
  function tableLamp(x, y, z) { cyl('metal', x, y, z, 0.06, 0.045, 0.02, C.brass, 12); cyl('metal', x, y + 0.02, z, 0.01, 0.01, 0.2, C.brass, 6); cyl('emis', x, y + 0.2, z, 0.12, 0.09, 0.17, C.shade, 16); }
  function vase(x, y, z, col) { cyl('satin', x, y, z, 0.045, 0.07, 0.12, col, 14); cyl('satin', x, y + 0.12, z, 0.07, 0.03, 0.1, col, 14); for (var i = 0; i < 4; i++) cyl('matte', x + (i - 1.5) * 0.02, y + 0.2, z + (i % 2) * 0.02, 0.003, 0.003, 0.26 + i * 0.03, C.olive, 4); }
  function books(x, y, z, n, alongZ) {
    var cols = [C.cream, C.graph2, C.terra, C.taupe, C.olive, C.creamL], p = 0;
    for (var i = 0; i < n; i++) { var w = 0.025 + rnd() * 0.02, h = 0.2 + rnd() * 0.07; if (alongZ) box('matte', x - 0.08, x + 0.08, y, y + h, z + p, z + p + w, cols[i % 6]); else box('matte', x + p, x + p + w, y, y + h, z - 0.08, z + 0.08, cols[i % 6]); p += w + 0.003; }
  }
  function coffee(x, z) {
    cyl('satin', x, 0.33, z, 0.44, 0.44, 0.035, C.stoneD, 30); cyl('metal', x, 0, z, 0.17, 0.14, 0.33, C.brass, 20);
    cyl('wood', x + 0.34, 0.43, z - 0.42, 0.27, 0.27, 0.03, C.oak, 24); cyl('metal', x + 0.34, 0, z - 0.42, 0.1, 0.085, 0.43, C.black, 16);
    rb('matte', x - 0.08, 0.385, z + 0.1, 0.3, 0.035, 0.22, 0.008, C.cream, 0.3); rb('matte', x - 0.08, 0.418, z + 0.1, 0.26, 0.03, 0.19, 0.008, C.graph2, 0.1);
    cyl('metal', x + 0.14, 0.365, z - 0.14, 0.05, 0.085, 0.05, C.brass, 16); vase(x + 0.34, 0.46, z - 0.42, C.creamL);
    blob(x + 0.1, z - 0.15, 1.5, 1.6);
  }
  function tvWall(r, zc) {                                   // рейки из дуба, консоль, экран — на западной стене
    var x = r.x0, z0 = zc - 1.25, z1 = zc + 1.25, z;
    box('matte', x, x + 0.012, 0, 2.5, z0, z1, C.graph);
    for (z = z0 + 0.01; z < z1 - 0.03; z += 0.062) box('wood', x + 0.012, x + 0.034, 0, 2.5, z, z + 0.036, C.oakD);
    rb('satin', x + 0.24, 0.4, zc, 0.4, 0.3, 2.1, 0.012, C.graph); box('satin', x + 0.045, x + 0.07, 0.86, 1.68, zc - 0.72, zc + 0.72, C.blackGl);
    box('emis', x + 0.036, x + 0.04, 0.02, 0.03, z0, z1, C.warm);
    vase(x + 0.24, 0.55, zc + 0.82, C.brass); books(x + 0.24, 0.55, zc - 0.95, 5, true);
    blob(x + 0.2, zc, 0.8, 2.4);
  }
  function lounge(r, zc, len, tv) {
    var xs = r.x1 - 0.5, cx = (r.x0 + r.x1) / 2 + (tv ? 0.1 : 0.45);
    sofa(xs, zc, 0, len, C.boucle, C.boucleL); blob(xs, zc, 1.35, len + 0.45);
    var g = new T.PlaneGeometry(2.3, len + 0.7); g.rotateX(-Math.PI / 2); g.translate(cx + 0.15, 0.008, zc); put('rug', g);
    coffee(cx - 0.05, zc + 0.12);
    floorLamp(r.x1 - 0.32, Math.min(-0.42, zc + len / 2 + 0.42));
    picture(r.x1 - 0.004, 1.62, zc - 0.42, -Math.PI / 2, 0.56, 0.8, 0); picture(r.x1 - 0.004, 1.62, zc + 0.42, -Math.PI / 2, 0.56, 0.8, 1);
    if (tv) tvWall(r, Math.min(-1.5, zc + 0.15));
  }
  function kitchenRun(len, island) {                         // вдоль стены: x — глубина от стены, z — длина
    var tall = 1.2, dp = 0.6, i, n = Math.max(2, Math.round((len - tall) / 0.6)), w = (len - tall) / n;
    box('matte', 0.04, dp - 0.06, 0, 0.09, 0, len, C.black);
    box('matte', 0, dp - 0.02, 0.09, 2.34, 0, tall, C.graph);
    for (i = 0; i < 2; i++) box('satin', dp - 0.02, dp, 0.1, 2.33, i * 0.6 + 0.004, (i + 1) * 0.6 - 0.004, C.graph2);
    box('satin', dp, dp + 0.005, 0.98, 1.44, 0.66, 1.14, C.blackGl); box('satin', dp, dp + 0.005, 1.5, 1.84, 0.66, 1.14, C.blackGl);
    box('metal', dp, dp + 0.035, 0.85, 1.75, 0.54, 0.556, C.brass); box('metal', dp, dp + 0.03, 0.94, 0.955, 0.7, 1.1, C.brass);
    box('matte', 0, dp - 0.02, 0.09, 0.86, tall, len, C.graph);
    for (i = 0; i < n; i++) { box('wood', dp - 0.02, dp, 0.1, 0.855, tall + i * w + 0.004, tall + (i + 1) * w - 0.004, C.oak); box('metal', dp, dp + 0.022, 0.79, 0.802, tall + i * w + 0.1, tall + (i + 1) * w - 0.1, C.brass); }
    box('satin', 0, dp + 0.025, 0.86, 0.9, tall, len + 0.02, C.stone); box('satin', 0, 0.012, 0.9, 1.5, tall, len, C.stone);
    box('matte', 0, 0.34, 1.5, 2.34, tall, len, C.creamL);
    for (i = 0; i < n; i++) box('satin', 0.34, 0.352, 1.508, 2.332, tall + i * w + 0.004, tall + (i + 1) * w - 0.004, C.cream);
    box('emis', 0.04, 0.3, 1.492, 1.5, tall + 0.05, len - 0.05, C.warm);
    var zh = tall + (len - tall) * 0.3, zs = tall + (len - tall) * 0.74;
    box('satin', 0.07, 0.55, 0.9, 0.906, zh - 0.29, zh + 0.29, C.blackGl);
    box('metal', 0.1, 0.52, 0.9, 0.903, zs - 0.27, zs + 0.27, C.steel); cyl('metal', 0.07, 0.9, zs, 0.013, 0.013, 0.3, C.brass, 8); box('metal', 0.06, 0.26, 1.19, 1.212, zs - 0.011, zs + 0.011, C.brass);
    cyl('wood', 0.3, 0.9, len - 0.18, 0.11, 0.13, 0.07, C.oakD, 16); rb('wood', 0.03, 1.06, tall + 0.2, 0.02, 0.32, 0.22, 0.006, C.oakD, 0, 0.12); vase(0.16, 0.9, tall + 0.5, C.creamL);
    blob(0.4, len / 2, 1.0, len + 0.3);
    if (island) {
      var ix = 1.95, iz0 = tall + 0.1, iz1 = Math.min(len - 0.1, iz0 + 1.75);
      box('wood', ix - 0.36, ix + 0.36, 0.09, 0.86, iz0, iz1, C.oak); box('matte', ix - 0.32, ix + 0.32, 0, 0.09, iz0 + 0.04, iz1 - 0.04, C.black);
      box('satin', ix - 0.42, ix + 0.46, 0.86, 0.9, iz0 - 0.05, iz1 + 0.05, C.stone);
      for (i = 0; i < 2; i++) { var sz = iz0 + 0.45 + i * 0.8; cyl('matte', ix + 0.72, 0.6, sz, 0.17, 0.18, 0.06, C.boucle, 18); cyl('metal', ix + 0.72, 0.02, sz, 0.02, 0.02, 0.58, C.black, 8); cyl('metal', ix + 0.72, 0, sz, 0.17, 0.17, 0.02, C.black, 18); pendant(ix, sz, 1.72); }
      cyl('satin', ix - 0.05, 0.9, (iz0 + iz1) / 2, 0.12, 0.16, 0.07, C.creamL, 18);
      blob(ix + 0.1, (iz0 + iz1) / 2, 1.5, iz1 - iz0 + 0.5);
    }
  }
  function dining(x, z, n) {
    cyl('wood', x, 0.72, z, 0.52, 0.52, 0.035, C.oak, 32); cyl('matte', x, 0, z, 0.24, 0.07, 0.72, C.graph, 18); cyl('matte', x, 0, z, 0.3, 0.3, 0.02, C.graph, 20);
    for (var i = 0; i < n; i++) { var a = i * Math.PI * 2 / n + 0.5; chair(x + Math.sin(a) * 0.72, z + Math.cos(a) * 0.72, a + Math.PI, i % 2 ? C.cream : C.boucle); }
    cyl('satin', x, 0.755, z, 0.07, 0.13, 0.06, C.creamL, 16); pendant(x, z, 1.8); blob(x, z, 2.2, 2.2);
  }
  function bedroom(r) {
    var zc = (r.z0 + r.z1) / 2 + 0.25, x1 = r.x1, i;
    rb('matte', x1 - 0.05, 0.72, zc, 0.09, 1.2, 2.9, 0.03, C.taupe);                       // широкое мягкое изголовье
    for (i = -2; i <= 2; i++) box('matte', x1 - 0.1, x1 - 0.094, 0.14, 1.3, zc + i * 0.58 - 0.003, zc + i * 0.58 + 0.003, C.accent);
    rb('matte', x1 - 1.14, 0.2, zc, 2.1, 0.3, 1.74, 0.05, C.graph2); rb('matte', x1 - 1.12, 0.45, zc, 2.0, 0.22, 1.62, 0.07, C.linen);
    rb('matte', x1 - 1.42, 0.55, zc, 1.42, 0.11, 1.7, 0.05, C.creamL); rb('matte', x1 - 1.85, 0.6, zc, 0.5, 0.035, 1.76, 0.015, C.terra);
    rb('matte', x1 - 0.4, 0.62, zc - 0.4, 0.4, 0.15, 0.66, 0.06, C.linen, 0, 0.25); rb('matte', x1 - 0.4, 0.62, zc + 0.4, 0.4, 0.15, 0.66, 0.06, C.linen, 0, 0.25);
    rb('matte', x1 - 0.62, 0.64, zc - 0.36, 0.3, 0.12, 0.42, 0.05, C.taupe, 0, 0.35); rb('matte', x1 - 0.62, 0.64, zc + 0.36, 0.3, 0.12, 0.42, 0.05, C.graph2, 0, 0.35);
    [-1, 1].forEach(function (s) { var zz = zc + s * 1.16; rb('wood', x1 - 0.3, 0.26, zz, 0.42, 0.36, 0.46, 0.012, C.oak); cyl('metal', x1 - 0.3, 0, zz, 0.012, 0.012, 0.08, C.black, 6); tableLamp(x1 - 0.3, 0.44, zz); });
    var g = new T.PlaneGeometry(2.5, 2.9); g.rotateX(-Math.PI / 2); g.translate(x1 - 1.55, 0.008, zc); put('rug', g);
    blob(x1 - 1.15, zc, 2.5, 2.3);
    picture(x1 - 0.004, 1.9, zc, -Math.PI / 2, 1.0, 0.6, 3);
    var wz0 = r.z0 + 1.35, wz1 = Math.min(r.z1 - 0.9, wz0 + 2.4), n = Math.max(2, Math.round((wz1 - wz0) / 0.6)), w = (wz1 - wz0) / n;   // шкаф у западной стены
    box('matte', r.x0, r.x0 + 0.58, 0, 2.6, wz0, wz1, C.cream);
    for (i = 0; i < n; i++) { box('satin', r.x0 + 0.58, r.x0 + 0.6, 0.06, 2.59, wz0 + i * w + 0.004, wz0 + (i + 1) * w - 0.004, C.creamL); box('metal', r.x0 + 0.6, r.x0 + 0.625, 0.95, 1.35, wz0 + (i + (i % 2 ? 0.1 : 0.9)) * w - 0.006, wz0 + (i + (i % 2 ? 0.1 : 0.9)) * w + 0.006, C.brass); }
    blob(r.x0 + 0.4, (wz0 + wz1) / 2, 1.0, wz1 - wz0 + 0.3);
    if (r.z1 > -0.5) { armchair(r.x0 + 0.85, -0.95, 0.75, C.boucle); plant(r.x1 - 0.4, -0.45, 1.5, true); }
    spotsRow(r.x0 + 0.9, r.x1 - 0.9, r.z0 + 1.0, 2); spotsRow(r.x0 + 0.9, r.x1 - 0.9, r.z1 - 1.0, 2);
  }
  function study(r) {
    var x0 = r.x0, x1 = r.x1, i, j;
    box('wood', x0 + 0.04, x0 + 0.7, 0.72, 0.755, -2.5, -0.85, C.oak);                      // стол у западной стены
    [[0.08, -2.46], [0.66, -2.46], [0.08, -0.89], [0.66, -0.89]].forEach(function (p) { box('metal', x0 + p[0] - 0.012, x0 + p[0] + 0.012, 0, 0.72, p[1] - 0.012, p[1] + 0.012, C.black); });
    box('satin', x0 + 0.1, x0 + 0.13, 0.86, 1.2, -2.0, -1.4, C.blackGl); box('metal', x0 + 0.1, x0 + 0.2, 0.755, 0.87, -1.72, -1.68, C.black);
    tableLamp(x0 + 0.3, 0.755, -1.05); books(x0 + 0.25, 0.755, -2.42, 4, true);
    chair(x0 + 1.05, -1.7, -Math.PI / 2, C.taupe); blob(x0 + 0.6, -1.7, 1.7, 2.0);
    var sz0 = r.z0 + 1.3, sz1 = sz0 + 1.9;                                                  // открытый стеллаж у восточной стены
    box('wood', x1 - 0.3, x1, 0, 2.2, sz0, sz0 + 0.025, C.oak); box('wood', x1 - 0.3, x1, 0, 2.2, sz1 - 0.025, sz1, C.oak); box('wood', x1 - 0.3, x1, 0, 2.2, (sz0 + sz1) / 2 - 0.012, (sz0 + sz1) / 2 + 0.012, C.oak);
    for (i = 0; i < 6; i++) { box('wood', x1 - 0.3, x1, i * 0.435, i * 0.435 + 0.025, sz0, sz1, C.oak); if (i < 5) for (j = 0; j < 2; j++) { if ((i + j) % 3 === 0) vase(x1 - 0.15, i * 0.435 + 0.025, sz0 + 0.5 + j * 0.95, j ? C.brass : C.creamL); else books(x1 - 0.15, i * 0.435 + 0.025, sz0 + 0.08 + j * 0.95, 7 + ((i * 3 + j) % 5), true); } }
    blob(x1 - 0.2, (sz0 + sz1) / 2, 0.8, 2.2);
    sofa(x1 - 0.5, -1.25, 0, 1.9, C.taupe, C.boucle); blob(x1 - 0.5, -1.25, 1.3, 2.3);
    var g = new T.PlaneGeometry(1.9, 2.6); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2 + 0.1, 0.008, -1.6); put('rug', g);
    picture(x0 + 0.004, 1.75, -1.7, Math.PI / 2, 0.6, 0.86, 2);
    plant(x0 + 0.4, -0.42, 1.25, false); spotsRow(x0 + 0.9, x1 - 0.9, (r.z0 + r.z1) / 2, 2);
  }
  function hallFurn(r, ex) {
    var zN = r.z0, i;
    doorSlab(ex, zN, 0, 0.98, C.graph);
    doorSlab(r.x0, (r.z0 + r.z1) / 2, Math.PI / 2, 0.8, C.creamL);
    var wx0 = ex + 0.85, wx1 = Math.min(r.x1 - 0.3, wx0 + 2.4);
    if (wx1 - wx0 > 1.1) {
      var n = Math.round((wx1 - wx0) / 0.6), w = (wx1 - wx0) / n;
      box('matte', wx0, wx1, 0, 2.6, zN, zN + 0.56, C.cream);
      for (i = 0; i < n; i++) box(i === 1 ? 'metal' : 'satin', wx0 + i * w + 0.004, wx0 + (i + 1) * w - 0.004, 0.06, 2.59, zN + 0.56, zN + 0.578, i === 1 ? C.mirror : C.creamL);
      blob((wx0 + wx1) / 2, zN + 0.4, wx1 - wx0 + 0.3, 1.0);
    }
    var cx = (r.x0 + ex - 0.6) / 2;
    if (ex - 0.6 - r.x0 > 1.0) {
      rb('wood', cx, 0.78, zN + 0.17, 0.9, 0.04, 0.3, 0.008, C.oak); box('metal', cx - 0.4, cx - 0.385, 0, 0.76, zN + 0.05, zN + 0.3, C.black); box('metal', cx + 0.385, cx + 0.4, 0, 0.76, zN + 0.05, zN + 0.3, C.black);
      at(cx, 1.5, zN + 0.01, 0, function () { var g = new T.CylinderGeometry(0.36, 0.36, 0.02, 36); g.rotateX(Math.PI / 2); put('metal', g, C.brass); g = new T.CylinderGeometry(0.335, 0.335, 0.024, 36); g.rotateX(Math.PI / 2); put('metal', g, C.mirror); });
      vase(cx + 0.25, 0.8, zN + 0.17, C.creamL); tableLamp(cx - 0.25, 0.8, zN + 0.17);
    }
    var g2 = new T.PlaneGeometry(Math.min(3.2, r.x1 - r.x0 - 0.8), 0.9); g2.rotateX(-Math.PI / 2); g2.translate(clamp(ex, r.x0 + 2, r.x1 - 2), 0.008, (r.z0 + r.z1) / 2 + 0.25); put('rug', g2);
    spotsRow(r.x0 + 0.8, r.x1 - 0.8, (r.z0 + r.z1) / 2, Math.max(3, Math.round((r.x1 - r.x0) / 1.5)));
    if (r.x1 - r.x0 > 7) { picture(r.x1 - 0.004, 1.6, (r.z0 + r.z1) / 2, -Math.PI / 2, 0.7, 1.0, 2); rb('matte', r.x1 - 0.3, 0.24, (r.z0 + r.z1) / 2, 0.42, 0.42, 1.2, 0.06, C.boucle); }
  }
  function loggiaFurn(r) {
    var cx = (r.x0 + r.x1) / 2;
    armchair(r.x0 + 0.62, -0.72, 0.5, C.cream); armchair(r.x1 - 0.62, -0.72, -0.5, C.cream);
    cyl('wood', cx, 0.44, -0.78, 0.25, 0.25, 0.03, C.oak, 22); cyl('metal', cx, 0, -0.78, 0.03, 0.03, 0.44, C.black, 8); cyl('metal', cx, 0, -0.78, 0.16, 0.16, 0.015, C.black, 18);
    cyl('satin', cx, 0.47, -0.78, 0.04, 0.05, 0.09, C.creamL, 12); cyl('emis', cx + 0.1, 0.47, -0.72, 0.03, 0.03, 0.07, C.warm, 10);
    plant(r.x0 + 0.22, -0.3, 1.1, false);
  }
  function cove(r) {                                         // подсветка по периметру потолка
    var y = HC - 0.014, w = 0.8, lx = r.x1 - r.x0, lz = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    function q(len, x, z, ry) { var g = new T.PlaneGeometry(len, w); g.rotateX(Math.PI / 2); if (ry) g.rotateY(ry); g.translate(x, y, z); put('glow', g); }
    q(lx, cx, r.z0 + w / 2, Math.PI); q(lx, cx, r.z1 - w / 2, 0); q(lz, r.x0 + w / 2, cz, -Math.PI / 2); q(lz, r.x1 - w / 2, cz, Math.PI / 2);
    var a = 0.2, b = 0.07, y0 = HC - 0.17;
    box('matte', r.x0, r.x1, y0, y0 + b, r.z0, r.z0 + a, C.ceil); box('matte', r.x0, r.x1, y0, y0 + b, r.z1 - a, r.z1, C.ceil);
    box('matte', r.x0, r.x0 + a, y0, y0 + b, r.z0 + a, r.z1 - a, C.ceil); box('matte', r.x1 - a, r.x1, y0, y0 + b, r.z0 + a, r.z1 - a, C.ceil);
  }

  /* ================= планировка и сборка квартиры ================= */
  var LABEL = { living: 'Гостиная', studio: 'Кухня-гостиная', kitchen: 'Кухня', bed: 'Спальня', study: 'Кабинет', loggia: 'Лоджия — вид на город', hall: 'Прихожая' };
  function build(fl) {
    bins = {}; openings = []; XF = null; seed = 4321;
    var M = materials(), n = fl.rooms || 1, area = fl.area || 50, euro = fl.id === '2e' || /евро/i.test(fl.name || ''), s, fr;
    if (n <= 1) { s = clamp(Math.sqrt(area / 46.5), 0.97, 1.05); fr = [['kitchen', 3.25], ['living', 4.35]]; }
    else if (euro) { s = 1; fr = [['studio', 4.75], ['bed', 3.35]]; }
    else if (n === 2) { s = clamp(Math.sqrt(area / 68), 0.97, 1.13); fr = [['kitchen', 3.4], ['living', 4.5], ['bed', 3.6]]; }
    else { s = 1.02; fr = [['kitchen', 3.7], ['living', 5.0], ['bed', 3.9], ['study', 3.35]]; }
    var Df = (n >= 3 ? 5.3 : euro ? 4.75 : 4.9) * (0.5 + 0.5 * s), Dh = n >= 3 ? 2.7 : 2.4, x = 0, R = {}, rooms = [], spots = [];
    fr.forEach(function (f) {
      var w = f[1] * s, lg = f[0] === 'kitchen' || (euro && f[0] === 'bed');
      var r = { key: f[0], x0: x, x1: x + w, z0: -Df, z1: lg ? -LG - TW : 0, wall: C.wall };
      rooms.push(r); R[f[0]] = r;
      if (lg) { R.loggia = { key: 'loggia', x0: x, x1: x + w, z0: -LG, z1: 0, wall: C.plaster, floorC: lin(0xd9d2c6), of: r }; rooms.push(R.loggia); }
      x += w + TW;
    });
    var W = x - TW, main = R.living || R.studio;
    R.hall = { key: 'hall', x0: 2.3 + TW, x1: W, z0: -Df - TW - Dh, z1: -Df - TW, wall: C.wallWarm }; rooms.push(R.hall);
    if (R.bed) { R.bed.wall = C.wallWarm; R.bed.acc = { E: C.accent }; }
    if (R.study) R.study.acc = { W: C.accent2 };
    if (R.kitchen) R.kitchen.wall = lin(0xf0ebe1);

    /* проёмы */
    var px = clamp((main.x0 + main.x1) / 2, Math.max(main.x0, R.hall.x0) + 1.0, main.x1 - 1.0);
    openings.push({ ax: 'z', at: -Df - TW / 2, a0: px - 0.75, a1: px + 0.75, v0: 0, v1: 2.4, type: 'portal' });
    if (R.kitchen) openings.push({ ax: 'x', at: R.kitchen.x1 + TW / 2, a0: -Df + 0.6, a1: -Df + 2.3, v0: 0, v1: 2.4, type: 'portal' });
    ['bed', 'study'].forEach(function (k) { if (R[k]) openings.push({ ax: 'z', at: -Df - TW / 2, a0: R[k].x0 + 0.3, a1: R[k].x0 + 1.2, v0: 0, v1: 2.12, type: 'door', room: R[k] }); });
    var lgR = R.loggia, lgOf = lgR.of;
    openings.push({ ax: 'z', at: -LG - TW / 2, a0: lgOf.x0 + 0.4, a1: lgOf.x1 - 0.4, v0: 0, v1: 2.4, type: 'ldoor' });
    openings.push({ ax: 'z', at: 0.18, a0: lgR.x0 + 0.2, a1: lgR.x1 - 0.2, v0: 0.62, v1: 2.62, type: 'pano' });
    rooms.forEach(function (r) {
      if (r.z1 !== 0 || r.key === 'loggia') return;
      var c = (r.x0 + r.x1) / 2, w = r.key === 'living' || r.key === 'studio' ? Math.min(2.7, r.x1 - r.x0 - 1.5) : r.key === 'bed' ? 2.0 : 1.7;
      openings.push({ ax: 'z', at: 0.18, a0: c - w / 2, a1: c + w / 2, v0: r.key === 'study' ? 0.8 : r.key === 'bed' ? 0.45 : 0.07, v1: 2.5, type: r.key === 'study' || r.key === 'bed' ? 'win' : 'french', room: r });
    });

    /* стены, пол, потолок */
    rooms.forEach(roomShell); facadeWall(W);
    box('matte', -0.4, W + 0.4, HC + 0.02, HC + 0.3, -Df - Dh - 0.6, 0.36, C.plaster);                 // плита перекрытия — не пускает солнце сверху
    box('matte', -0.4, -0.12, -0.2, HC + 0.02, -Df - Dh - 0.6, 0.36, C.plaster); box('matte', W + 0.12, W + 0.4, -0.2, HC + 0.02, -Df - Dh - 0.6, 0.36, C.plaster);
    box('matte', -0.4, W + 0.4, -0.2, HC + 0.02, -Df - Dh - 0.6, -Df - Dh - 0.32, C.plaster);

    /* окна, двери */
    openings.forEach(function (o) {
      if (o.type === 'portal') casing(o);
      else if (o.type === 'door') { casing(o); doorLeaf(o.a0 + 0.02, -Df + 0.02, -Math.PI / 2 + 0.12); }
      else if (o.type === 'ldoor') { winFrame(o, o.at, Math.max(2, Math.round((o.a1 - o.a0) / 0.85))); box('metal', o.a0 + 0.78, o.a0 + 0.8, 1.0, 1.18, o.at - 0.07, o.at - 0.034, C.brass); }
      else if (o.type === 'pano') {
        winFrame(o, 0.2, Math.max(2, Math.round((o.a1 - o.a0) / 0.9))); box('satin', o.a0 - 0.03, o.a1 + 0.03, o.v0 - 0.035, o.v0, -0.08, 0.14, C.stone);
      } else {
        winFrame(o, 0.2, o.a1 - o.a0 > 2.2 ? 3 : 2);
        if (o.v0 > 0.3) box('satin', o.a0 - 0.04, o.a1 + 0.04, o.v0 - 0.035, o.v0, -0.09, 0.14, C.stone);
        if (o.type === 'french') {                           // чёрное «кружево» французского балкона
          var w = o.a1 - o.a0 + 0.1, g = new T.PlaneGeometry(w, 1.0), uv = g.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setX(i, uv.getX(i) * Math.round(w / 0.5));
          g.translate((o.a0 + o.a1) / 2, 0.6, 0.43); put('lace', g);
          box('metal', o.a0 - 0.06, o.a1 + 0.06, 1.1, 1.14, 0.4, 0.46, C.black); box('metal', o.a0 - 0.06, o.a1 + 0.06, 0.08, 0.11, 0.41, 0.45, C.black);
        }
        var cw = Math.min(0.75, (o.a1 - o.a0) * 0.3);
        box('metal', o.a0 - 0.5, o.a1 + 0.5, 2.68, 2.695, -0.17, -0.155, C.brass);
        curtain(o.a0 - 0.42, o.a0 - 0.42 + cw + 0.42, -0.16, 0.03, 2.68); curtain(o.a1 - cw, o.a1 + 0.42, -0.16, 0.03, 2.68);
      }
    });

    /* мебель */
    var zl = clamp(-Df / 2 + 0.55, -3.2, -1.7);
    if (R.living) { lounge(R.living, zl, clamp(R.living.z1 - R.living.z0 - 2.6, 2.0, 2.6), true); plant(R.living.x0 + 0.42, -0.45, 1.75, true); cove(R.living); spotsRow(R.living.x0 + 1.2, R.living.x1 - 1.2, -Df / 2, 2); }
    if (R.studio) {
      at(R.studio.x0, 0, -Df + 0.02, 0, function () { kitchenRun(3.25, true); });
      lounge(R.studio, -1.55, 2.1, false); cove(R.studio);
      picture(R.studio.x0 + 0.004, 1.6, -0.75, Math.PI / 2, 0.62, 0.9, 2); plant(R.studio.x0 + 0.42, -0.42, 1.6, true);
    }
    if (R.kitchen) {
      var k = R.kitchen;
      at(k.x0, 0, k.z0 + 0.02, 0, function () { kitchenRun(k.z1 - k.z0 - 0.2, false); });
      dining(k.x1 - 1.12, k.z1 - 1.2, n >= 3 ? 4 : 3); spotsRow(k.x0 + 1.0, k.x0 + 1.0, k.z0 + 0.9, 1); spotsRow(k.x0 + 1.0, k.x0 + 1.0, k.z1 - 0.8, 1);
      picture(k.x1 - 0.004, 1.6, k.z1 - 0.62, -Math.PI / 2, 0.5, 0.7, 2);
    }
    if (R.bed) bedroom(R.bed);
    if (R.study) study(R.study);
    hallFurn(R.hall, px); loggiaFurn(R.loggia);

    /* точки обзора */
    function spot(key, ex, ez, lx, ly, lz) { spots.push({ key: key, label: LABEL[key], eye: new T.Vector3(ex, EYE, ez), look: new T.Vector3(lx, ly, lz) }); }
    spot(main.key, px, -Df + 0.75, (main.x0 + main.x1) / 2 + 0.35, 1.2, 0.4);
    if (R.kitchen) spot('kitchen', R.kitchen.x1 - 0.55, R.kitchen.z0 + 0.7, R.kitchen.x0 + 0.9, 1.1, R.kitchen.z1 + 0.3);
    if (R.bed) spot('bed', R.bed.x0 + 0.78, -Df + 0.8, R.bed.x1 - 0.7, 1.05, (R.bed.z0 + R.bed.z1) / 2 + 1.3);
    if (R.study) spot('study', R.study.x0 + 0.78, -Df + 0.8, R.study.x1 - 0.9, 1.1, -0.8);
    spot('loggia', (lgR.x0 + lgR.x1) / 2, -0.82, (lgR.x0 + lgR.x1) / 2 - 2.5, -1.2, 9);
    spot('hall', Math.min(R.hall.x1 - 0.9, px + 2.6), (R.hall.z0 + R.hall.z1) / 2 + 0.2, R.hall.x0, 1.2, R.hall.z0 + 0.9);

    /* меши */
    var grp = new T.Group(), geos = [];
    function mesh(bin, mat, cast, recv, order) {
      var a = bins[bin]; if (!a || !a.length) return null;
      var g = T.BufferGeometryUtils.mergeBufferGeometries(a, false); a.forEach(function (q) { q.dispose(); });
      if (!g) { console.warn('GKInterior: не собралась геометрия', bin); return null; }
      var m = new T.Mesh(g, mat); m.castShadow = !!cast; m.receiveShadow = !!recv; if (order) m.renderOrder = order; grp.add(m); geos.push(g); return m;
    }
    mesh('shell', M.shell, true, true); mesh('floor', M.floor, false, true); mesh('matte', M.matte, true, true); mesh('satin', M.satin, true, true);
    mesh('metal', M.metal, true, true); mesh('wood', M.wood, true, true); mesh('rug', M.rug, false, true); mesh('art', M.art, false, true);
    mesh('emis', M.emis, false, false); mesh('lace', M.lace, false, false); mesh('blob', M.blob, false, false, 1); mesh('glow', M.glow, false, false, 2);
    mesh('glass', M.glass, false, false, 3); mesh('curtain', M.curtain, false, true, 4);
    bins = {};

    /* свет: три точечных источника — днём мягкий свет от окон, вечером тёплые лампы */
    var lights = [], mc = (main.x0 + main.x1) / 2, sec = R.kitchen || R.studio, third = R.bed || R.hall;
    function light(dx, dy, dz, nx, ny, nz) { var l = new T.PointLight(0xffffff, 0, 10, 1.6); l.userData = { d: new T.Vector3(dx, dy, dz), n: new T.Vector3(nx, ny, nz) }; grp.add(l); lights.push(l); }
    light(mc, 2.0, -1.0, mc + 0.3, 2.1, zl);
    if (R.kitchen) light((sec.x0 + sec.x1) / 2, 2.0, sec.z1 - 0.7, sec.x1 - 1.12, 1.75, sec.z1 - 1.2); else light(sec.x0 + 1.9, 2.0, -3.2, sec.x0 + 1.9, 1.8, -2.6);
    if (R.bed) light((third.x0 + third.x1) / 2, 2.0, third.z1 - 1.0, third.x1 - 1.3, 1.9, (third.z0 + third.z1) / 2 + 0.25); else light(px, 2.2, (third.z0 + third.z1) / 2, px, 2.2, (third.z0 + third.z1) / 2);

    /* метки на полу */
    var hs = new T.Group(), hg = new T.PlaneGeometry(0.86, 0.86); hg.rotateX(-Math.PI / 2); geos.push(hg);
    spots.forEach(function (sp, i) { var m = new T.Mesh(hg, M.ring); m.position.set(sp.eye.x, 0.02, sp.eye.z); m.renderOrder = 5; m.userData.spot = i; hs.add(m); sp.mesh = m; });
    grp.add(hs);
    return { group: grp, spots: spots, lights: lights, hot: hs, geos: geos, W: W, id: fl.id };
  }

  /* ================= интерфейс ================= */
  var css = '.gki{position:absolute;inset:0;z-index:40;pointer-events:none;font-family:"Onest",system-ui,sans-serif;color:#efe7da;opacity:0;transition:opacity .5s ease}' +
    '.gki.is-on{opacity:1}.gki[hidden]{display:none}.gki>*{pointer-events:auto}' +
    '.gki-fade{position:absolute;inset:0;z-index:70;background:#07090d;opacity:0;pointer-events:none;transition:opacity .42s ease}.gki-fade.is-on{opacity:1;pointer-events:auto}' +
    '.gki-glass{background:rgba(15,18,27,.74);border:1px solid rgba(239,231,218,.16);-webkit-backdrop-filter:blur(18px) saturate(1.2);backdrop-filter:blur(18px) saturate(1.2);box-shadow:0 18px 50px rgba(0,0,0,.35)}' +
    '.gki-back{position:absolute;left:24px;top:22px;min-height:48px;padding:0 22px 0 18px;border-radius:24px;color:#efe7da;font:500 15px/1 "Onest",sans-serif;letter-spacing:.01em;cursor:pointer;transition:border-color .25s,color .25s,transform .25s}' +
    '.gki-back:hover,.gki-back:active{border-color:rgba(226,168,120,.7);color:#fff}.gki-back:active{transform:scale(.98)}.gki-back i{font-style:normal;color:#e2a878;margin-right:10px}' +
    '.gki-title{position:absolute;left:50%;top:20px;transform:translateX(-50%);text-align:center;padding:12px 30px 13px;border-radius:20px;white-space:nowrap}' +
    '.gki-title small{display:block;font:500 10.5px/1 "Onest",sans-serif;letter-spacing:.24em;text-transform:uppercase;color:#e2a878;margin-bottom:7px}' +
    '.gki-title b{font:400 25px/1.05 "Forum",Georgia,serif;letter-spacing:.02em;color:#f6efe3}.gki-title span{display:inline-block;margin-left:14px;padding-left:14px;border-left:1px solid rgba(226,168,120,.55);font:400 15px/1 "Onest",sans-serif;color:rgba(239,231,218,.86)}' +
    '.gki-modes{position:absolute;right:24px;top:22px;display:flex;padding:4px;border-radius:24px}.gki-modes button{min-width:74px;min-height:40px;border:0;border-radius:20px;background:none;color:rgba(239,231,218,.72);font:500 14px/1 "Onest",sans-serif;cursor:pointer;transition:background .3s,color .3s}' +
    '.gki-modes button.is-on{background:linear-gradient(180deg,#e2a878,#c98a5b);color:#1a1410}' +
    '.gki>.gki-bar{position:absolute;left:214px;right:22px;bottom:16px;display:flex;flex-direction:column;align-items:center;gap:11px;pointer-events:none}' +
    '.gki-chips{display:flex;gap:4px;padding:6px;border-radius:30px;max-width:100%;overflow-x:auto;scrollbar-width:none;pointer-events:auto}.gki-chips::-webkit-scrollbar{display:none}' +
    '.gki-chips button{flex:none;min-height:46px;padding:0 17px;border:1px solid transparent;border-radius:23px;background:none;color:rgba(239,231,218,.82);font:500 14.5px/1 "Onest",sans-serif;white-space:nowrap;cursor:pointer;transition:background .3s,color .3s,border-color .3s}' +
    '.gki-chips button:hover{border-color:rgba(239,231,218,.22)}.gki-chips button.is-on{background:linear-gradient(180deg,#e2a878,#c98a5b);color:#1a1410}' +
    '.gki-note{font:400 12.5px/1.2 "Onest",sans-serif;letter-spacing:.03em;color:rgba(239,231,218,.86);text-shadow:0 1px 8px rgba(0,0,0,.75);white-space:nowrap;pointer-events:none}' +
    '.gki-note:before{content:"";display:inline-block;width:22px;height:1px;background:#c98a5b;vertical-align:middle;margin-right:10px}' +
    '.gki-plan{position:absolute;left:24px;bottom:22px;width:168px;padding:8px 8px 0;border-radius:18px;cursor:pointer;color:#efe7da;transition:border-color .25s,transform .25s}.gki-plan:hover{border-color:rgba(226,168,120,.6)}' +
    '.gki-plan img{display:block;width:100%;height:132px;object-fit:contain;background:#fbf8f2;border-radius:11px}.gki-plan span{display:block;padding:9px 0 10px;font:500 11px/1 "Onest",sans-serif;letter-spacing:.16em;text-transform:uppercase;color:rgba(239,231,218,.8)}' +
    '.gki-hint{padding:10px 20px;border-radius:20px;font:400 12.5px/1.3 "Onest",sans-serif;color:rgba(239,231,218,.86);white-space:nowrap;pointer-events:none;transition:opacity .8s ease}.gki-hint.is-off{opacity:0}.gki-hint b{font:400 16px/1 "Forum",Georgia,serif;color:#e2a878;margin-right:10px;letter-spacing:.03em}' +
    '.gki-zoom{position:absolute;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;background:rgba(7,9,13,.72);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);opacity:0;pointer-events:none;transition:opacity .35s ease}' +
    '.gki-zoom.is-on{opacity:1;pointer-events:auto}.gki-zoom img{max-width:min(86%,820px);max-height:82%;background:#fbf8f2;border-radius:18px;padding:18px;box-shadow:0 30px 90px rgba(0,0,0,.5);transform:scale(.96);transition:transform .35s ease}.gki-zoom.is-on img{transform:none}' +
    '.gki-zoom button{position:absolute;right:26px;top:24px;width:48px;height:48px;border-radius:24px;color:#efe7da;font-size:24px;line-height:1;cursor:pointer}' +
    '@media (max-width:820px){.gki-title{top:82px}.gki-title b{font-size:21px}.gki>.gki-bar{left:12px;right:12px;bottom:12px}.gki-plan{bottom:112px;width:118px;left:12px}.gki-plan img{height:92px}.gki-hint{display:none}.gki-back{left:12px;top:14px}.gki-modes{right:12px;top:14px}.gki-note{font-size:11px;white-space:normal;text-align:center}}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var hud = document.createElement('div'); hud.className = 'gki'; hud.hidden = true;
  hud.innerHTML = '<button type="button" class="gki-back gki-glass"><i>←</i>Вернуться к дому</button>' +
    '<div class="gki-title gki-glass"><small></small><b></b><span></span></div>' +
    '<div class="gki-modes gki-glass" role="group" aria-label="Время суток"><button type="button" data-m="day">День</button><button type="button" data-m="night">Вечер</button></div>' +
    '<button type="button" class="gki-plan gki-glass" aria-label="Открыть планировку"><img alt="Планировка квартиры"><span>Планировка</span></button>' +
    '<div class="gki-bar"><div class="gki-hint gki-glass"><b>Осмотритесь</b>ведите пальцем по экрану · метки на полу переносят в другую комнату</div>' +
    '<div class="gki-chips gki-glass" role="group" aria-label="Комнаты"></div>' +
    '<div class="gki-note">Пример оформления. Квартира сдаётся без отделки.</div></div>' +
    '<div class="gki-zoom"><img alt="Планировка квартиры крупно"><button type="button" class="gki-glass" aria-label="Закрыть">×</button></div>';
  ctx.app.appendChild(hud);
  var fade = document.createElement('div'); fade.className = 'gki-fade'; ctx.app.appendChild(fade);
  var $ = function (q) { return hud.querySelector(q); };
  var elChips = $('.gki-chips'), elZoom = $('.gki-zoom'), elHint = $('.gki-hint'), elModes = $('.gki-modes');
  $('.gki-back').addEventListener('click', function () { exit(); });
  $('.gki-plan').addEventListener('click', function () { elZoom.classList.add('is-on'); });
  elZoom.addEventListener('click', function () { elZoom.classList.remove('is-on'); });
  elModes.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b && GKScene.setMode) GKScene.setMode(b.dataset.m); });
  elChips.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) go(+b.dataset.i); });

  /* ================= состояние, камера ================= */
  var S = { active: false, busy: false, apt: null, fly: null, spot: 0, saved: null, sun: null, floor: 0, flat: null };
  var vE = new T.Vector3(), vD = new T.Vector3();
  function setView(eye, yaw, pit) {
    var c = Math.cos(pit); vD.set(Math.sin(yaw) * c, Math.sin(pit), Math.cos(yaw) * c);
    ctx.camera.position.copy(eye); ctx.controls.target.copy(eye).addScaledVector(vD, 0.1); ctx.camera.lookAt(ctx.controls.target);
  }
  function angles(from, to) { var d = new T.Vector3().subVectors(to, from).normalize(); return [Math.atan2(d.x, d.z), Math.asin(clamp(d.y, -1, 1))]; }
  function world(v) { return v.clone().add(S.apt.group.position); }
  function mark(i) {
    S.spot = i;
    S.apt.spots.forEach(function (sp, k) { sp.mesh.visible = k !== i; });
    Array.prototype.forEach.call(elChips.children, function (b, k) { b.classList.toggle('is-on', k === i); });
  }
  function go(i, instant, fromBack) {
    if (!S.active || !S.apt) return;
    if (typeof i === 'string') { var k = -1; S.apt.spots.forEach(function (sp, q) { if (sp.key === i) k = q; }); i = k; }
    var sp = S.apt.spots[i]; if (!sp) return;
    var p1 = world(sp.eye), a1 = angles(p1, world(sp.look));
    mark(i); if (ctx.stopFly) ctx.stopFly();
    if (instant) {
      if (fromBack) { var p0 = p1.clone().add(new T.Vector3(-Math.sin(a1[0]) * fromBack, 0, -Math.cos(a1[0]) * fromBack)); setView(p0, a1[0], a1[1] - 0.05); S.fly = { p0: p0, p1: p1, y0: a1[0], dy: 0, q0: a1[1] - 0.05, q1: a1[1], t: 0, dur: 2.6 }; }
      else { setView(p1, a1[0], a1[1]); S.fly = null; }
    } else {
      var cur = ctx.camera.position.clone(), a0 = angles(cur, ctx.controls.target), dy = a1[0] - a0[0]; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      S.fly = { p0: cur, p1: p1, y0: a0[0], dy: dy, q0: a0[1], q1: a1[1], t: 0, dur: clamp(1.0 + cur.distanceTo(p1) * 0.14, 1.2, 2.3) };
    }
    ctx.dirty();
  }
  ctx.onFrame(function (dt) {
    if (!S.active || !S.fly) return false;
    var f = S.fly, now = performance.now(); f.t = Math.min(1, f.t + Math.min(0.25, f.last ? (now - f.last) / 1000 : dt) / f.dur); f.last = now;
    var k = f.t * f.t * f.t * (f.t * (6 * f.t - 15) + 10);
    vE.lerpVectors(f.p0, f.p1, k); setView(vE, f.y0 + f.dy * k, f.q0 + (f.q1 - f.q0) * k);
    if (f.t >= 1) S.fly = null;
    return true;
  });
  ctx.controls.addEventListener('start', function () { if (S.active) { S.fly = null; elHint.classList.add('is-off'); } });

  /* нажатие на метку на полу */
  var ray = new T.Raycaster(), ndc = new T.Vector2(), dn = null;
  ctx.canvas.addEventListener('pointerdown', function (e) { if (S.active) dn = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  ctx.canvas.addEventListener('pointerup', function (e) {
    if (!S.active || !dn || !S.apt) return;
    var d = Math.hypot(e.clientX - dn.x, e.clientY - dn.y), t = performance.now() - dn.t; dn = null;
    if (d > 9 || t > 600) return;
    var r = ctx.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera);
    var hit = ray.intersectObjects(S.apt.hot.children, false);
    for (var i = 0; i < hit.length; i++) if (hit[i].object.visible) { go(hit[i].object.userData.spot); break; }
  });
  ctx.canvas.addEventListener('wheel', function (e) {
    if (!S.active) return;
    ctx.camera.fov = clamp(ctx.camera.fov + (e.deltaY > 0 ? 3 : -3), 38, 76); ctx.camera.updateProjectionMatrix(); ctx.dirty();
  }, { passive: true });

  /* свет по времени суток */
  var cDay = new T.Color(0.31, 0.31, 0.3), cNight = new T.Color(0.25, 0.185, 0.115), cLD = new T.Color(0xf1f5ff), cLN = new T.Color(0xffc98f);
  function applyLight() {
    var cur = ctx.cur || {}, lamp = clamp(cur.lamp || 0, 0, 1), M = MAT;
    ambU.value.copy(cDay).lerp(cNight, lamp);
    if (M) { M.emis.color.setScalar(0.62 + lamp * 0.95); M.glow.opacity = Math.max(0, lamp - 0.15) * 0.62; M.blob.opacity = 0.6 - lamp * 0.2; }
    if (S.apt) S.apt.lights.forEach(function (l, i) {
      l.position.copy(l.userData.d).lerp(l.userData.n, lamp); l.color.copy(cLD).lerp(cLN, lamp);
      l.intensity = (i === 2 && !S.apt.spots.some(function (s) { return s.key === 'bed'; }) ? 0.0 : 0.5) * (1 - lamp) + lamp * (i === 0 ? 1.15 : 0.95);
    });
    var m = ctx.mode ? ctx.mode() : 'day';
    Array.prototype.forEach.call(elModes.children, function (b) { b.classList.toggle('is-on', (b.dataset.m === 'night') === (m === 'night')); });
    if (S.active) { sunFocus(true); ctx.shadows(); ctx.dirty(); }
  }
  ctx.onMode(applyLight);

  /* солнце: пока мы внутри, карта теней наводится на квартиру — чёткое пятно света на полу */
  var vS = new T.Vector3();
  function sunFocus(on) {
    var sun = ctx.sun; if (!sun || !sun.shadow || !sun.shadow.camera) return;
    var sc = sun.shadow.camera, sv = S.sun;
    if (on && S.apt) {
      if (!sv) sv = S.sun = { l: sc.left, r: sc.right, t: sc.top, b: sc.bottom, n: sc.near, f: sc.far, nb: sun.shadow.normalBias, tg: sun.target.position.clone(), off: sun.position.clone().sub(sun.target.position) };
      if (ctx.cur && ctx.cur.sunP) sv.off.copy(ctx.cur.sunP).sub(sv.tg);
      var g = S.apt.group.position, d = sv.off.length(), R = 13.5;
      vS.set(g.x + S.apt.W / 2, g.y + 1.2, g.z - 3.6);
      sun.target.position.copy(vS); sun.position.copy(vS).add(sv.off); sun.target.updateMatrixWorld();
      sc.left = -R; sc.right = R; sc.top = R; sc.bottom = -R; sc.near = Math.max(1, d - 45); sc.far = d + 45; sc.updateProjectionMatrix();
      sun.shadow.normalBias = 0.02;
    } else if (!on && sv) {
      sun.target.position.copy(sv.tg); sun.position.copy(sv.tg).add(sv.off); sun.target.updateMatrixWorld();
      sc.left = sv.l; sc.right = sv.r; sc.top = sv.t; sc.bottom = sv.b; sc.near = sv.n; sc.far = sv.f; sc.updateProjectionMatrix();
      sun.shadow.normalBias = sv.nb; S.sun = null;
    }
  }
  function zonesVisible(on) { (ctx.zones || []).forEach(function (z) { [z.mat, z.lmat].forEach(function (m) { if (m) m.visible = on; }); }); }
  function emit(v) { document.dispatchEvent(new CustomEvent('gk:view', { detail: { view: v } })); }
  function disposeApt() {
    if (!S.apt) return;
    ctx.scene.remove(S.apt.group); S.apt.geos.forEach(function (g) { g.dispose(); }); S.apt = null;
  }

  function doEnter(floorN, fl) {
    if (!S.apt || S.apt.id !== fl.id) { disposeApt(); S.apt = build(fl); }
    var a = S.apt, cam = ctx.camera;
    a.group.position.set(clamp(9 - a.W / 2, -11, 26 - a.W), ctx.dims.GH + (floorN - 2) * ctx.dims.FH + 0.12, ZS);
    a.group.visible = true; ctx.scene.add(a.group); a.group.updateMatrixWorld(true);
    if (!S.saved) S.saved = { fov: cam.fov, near: cam.near, house: ctx.houseRoot.visible };
    ctx.houseRoot.visible = false; zonesVisible(false);
    cam.fov = FOV; cam.near = 0.06; cam.updateProjectionMatrix();
    ctx.app.classList.add('view-interior'); ctx.picking(false);
    if (GKScene.autoRotate) GKScene.autoRotate(false);
    ctx.limits({ minDistance: 0.1, maxDistance: 0.1, minPolarAngle: Math.PI / 2 - 1.0, maxPolarAngle: Math.PI / 2 + 0.85, enableZoom: false, enableRotate: true, rotateSpeed: -0.22 });
    S.active = true; S.floor = floorN; S.flat = fl;
    $('.gki-title small').textContent = floorN + ' этаж · вид на город';
    $('.gki-title b').textContent = fl.name || 'Квартира';
    $('.gki-title span').textContent = fl.area ? String(fl.area.toFixed(2)).replace('.', ',') + ' м²' : '';
    var im = $('.gki-plan img'), zi = elZoom.querySelector('img'); $('.gki-plan').style.display = fl.img ? '' : 'none'; if (fl.img) { im.src = fl.img; zi.src = fl.img; }
    elChips.innerHTML = a.spots.map(function (sp, i) { return '<button type="button" data-i="' + i + '">' + sp.label + '</button>'; }).join('');
    var um = document.querySelector('#app .modes'), vis = false;
    if (um) { var cs = getComputedStyle(um); vis = cs.display !== 'none' && cs.visibility !== 'hidden' && +cs.opacity > 0.05; }
    elModes.style.display = vis ? 'none' : '';
    elHint.classList.remove('is-off'); elZoom.classList.remove('is-on');
    applyLight(); sunFocus(true); go(0, true, 1.5); ctx.shadows(); ctx.dirty(); emit('interior');
  }
  function doExit() {
    var cam = ctx.camera, sv = S.saved || { fov: 30, near: 1, house: true };
    S.active = false; S.fly = null; S.saved = null; sunFocus(false);
    if (S.apt) { S.apt.group.visible = false; ctx.scene.remove(S.apt.group); }
    ctx.houseRoot.visible = sv.house; zonesVisible(true);
    cam.fov = sv.fov; cam.near = sv.near; cam.updateProjectionMatrix();
    ctx.limits(); ctx.picking(true); ctx.app.classList.remove('view-interior');
    if (ctx.stopFly) ctx.stopFly();
    ctx.home(true); ctx.shadows(); ctx.dirty(); emit('home');
  }
  function enter(floorN, fl) {
    if (S.busy) return;
    if (typeof fl === 'string') fl = (GK.flats || []).filter(function (f) { return f.id === fl; })[0];
    fl = fl || (S.active && S.flat) || (GK.flats || [])[5] || { id: 'x', rooms: 2, name: 'Квартира', area: 64 };
    floorN = clamp(Math.round(+floorN || 5), 2, (ctx.dims && ctx.dims.floors) || 8);
    S.busy = true; fade.classList.add('is-on');
    setTimeout(function () {
      try { doEnter(floorN, fl); } catch (e) { console.error('GKInterior', e); if (S.active) doExit(); S.busy = false; fade.classList.remove('is-on'); hud.hidden = true; return; }
      hud.hidden = false;
      setTimeout(function () { hud.classList.add('is-on'); fade.classList.remove('is-on'); S.busy = false; ctx.dirty(); }, 260);
    }, 440);
  }
  function exit() {
    if (!S.active || S.busy) return;
    S.busy = true; fade.classList.add('is-on'); hud.classList.remove('is-on');
    setTimeout(function () {
      doExit(); hud.hidden = true;
      setTimeout(function () { fade.classList.remove('is-on'); S.busy = false; ctx.dirty(); }, 200);
    }, 440);
  }

  window.GKInterior = {
    enter: enter, exit: exit, active: function () { return S.active || S.phase === 'in'; },
    go: function (k, instant) { go(k, !!instant); }, spots: function () { return S.apt ? S.apt.spots.map(function (s) { return s.key; }) : []; }
  };
})();
