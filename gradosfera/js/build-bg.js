/* Фон «дом строится, пока листаешь» — версия 2, «невозможно не заметить».
   Небо: рассвет → день → закат → ночь со звёздами. Огромная цифра этажа. Камера отъезжает по мере роста дома.
   Экскаватор, самосвал, бетономешалка, кран с балкой, вспышки сварки. Финал: подсветка фасада, салют, «ДОМ ГОТОВ».
   Прогресс стройки = прогресс прокрутки. Всё рисуется кодом, без видео. */
(function () {
  'use strict';
  var cv = document.getElementById('buildBg');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var hud = document.getElementById('buildHud');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var LEVELS = 8;                                   // 8 этажей, как у настоящего дома
  var COPPER = '201,138,91', CREAM = '239,231,218', WARM = '255,196,128', HOT = '255,214,150';
  var W = 0, H = 0, DPR = 1, mobile = false, G = {};
  var target = 0, prog = reduce ? 1 : 0, t0 = performance.now();
  var sparks = [], dust = [], flashes = [], stars = [];
  var lastLevel = -1, bump = 0, fired = false, doneFlash = 0;
  var W0 = function () { return window.innerWidth; };
  var GLOW = 1, slow = 0, lastNow = 0;   // свечение; счётчик медленных кадров

  var seed = 11; function rnd() { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; }
  var order = []; for (var i = 0; i < 200; i++) order.push(i);
  for (i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
  var rank = {}; order.forEach(function (v, k) { rank[v] = k; });

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, W0() < 760 ? 1.25 : 1.5);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    mobile = W < 760;
    GLOW = mobile ? 0 : GLOW;
    var gy = H * (mobile ? 0.84 : 0.86);
    var fh = Math.min(H * (mobile ? 0.06 : 0.074), 70);
    var bw = mobile ? W * 0.66 : Math.min(W * 0.31, 520);
    var x0 = mobile ? (W - bw) / 2 : W * 0.6;
    G = { gy: gy, fh: fh, bw: bw, x0: x0, cols: 7, a: mobile ? 0.55 : 0.8 };
    buildGrid();
    if (typeof fg !== 'undefined' && fg) { fg.width = cv.width; fg.height = cv.height; fg.style.width = W + 'px'; fg.style.height = H + 'px'; }
    stars = []; for (var k = 0; k < (mobile ? 50 : 110); k++) stars.push({ x: rnd() * W, y: rnd() * gy * 0.7, r: rnd() * 1.2 + 0.3, ph: rnd() * 6 });
  }
  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  var mix = function (a, b, k) { return a + (b - a) * k; };
  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function st(rgb, a, w, glow) {
    ctx.strokeStyle = 'rgba(' + rgb + ',' + clamp(a * G.a, 0, 1) + ')'; ctx.lineWidth = w || 1;
    if (GLOW) { ctx.shadowColor = 'rgba(' + rgb + ',' + clamp(a, 0, 1) + ')'; ctx.shadowBlur = glow || 0; } else ctx.shadowBlur = 0;
  }
  function noGlow() { ctx.shadowBlur = 0; }

  /* ---------- сетка-чертёж: рисуем один раз ---------- */
  var gridLayer = document.createElement('canvas');
  function buildGrid() {
    gridLayer.width = cv.width; gridLayer.height = cv.height;
    var g = gridLayer.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0);
    g.strokeStyle = 'rgba(' + CREAM + ',0.035)'; g.lineWidth = 1; g.beginPath();
    var s = 64;
    for (var x = (W % s) / 2; x < W; x += s) { g.moveTo(x, 0); g.lineTo(x, H); }
    for (var y = (H % s) / 2; y < H; y += s) { g.moveTo(0, y); g.lineTo(W, y); }
    g.stroke();
  }

  /* ---------- небо ---------- */
  function sky(p, t) {
    // цвет горизонта: рассвет (медь) → день (холодный) → закат (тёплый) → ночь (синий)
    var stops = [[0, [201, 120, 70, 0.22]], [0.35, [120, 140, 160, 0.10]], [0.7, [220, 110, 60, 0.22]], [0.9, [40, 60, 120, 0.22]], [1, [30, 45, 100, 0.2]]];
    var c = stops[0][1];
    for (var k = 0; k < stops.length - 1; k++) {
      if (p >= stops[k][0] && p <= stops[k + 1][0]) {
        var q = (p - stops[k][0]) / (stops[k + 1][0] - stops[k][0]);
        c = stops[k][1].map(function (v, n) { return mix(v, stops[k + 1][1][n], q); });
      }
    }
    var g = ctx.createRadialGradient(G.x0 + G.bw / 2, G.gy, 0, G.x0 + G.bw / 2, G.gy, Math.max(W, H) * 0.9);
    g.addColorStop(0, 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + c[3] + ')');
    g.addColorStop(1, 'rgba(18,18,20,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // звёзды ночью
    var night = seg(p, 0.82, 0.97);
    if (night > 0) {
      stars.forEach(function (s) {
        var tw = 0.5 + 0.5 * Math.sin(t * 2 + s.ph);
        ctx.fillStyle = 'rgba(' + CREAM + ',' + (night * tw * 0.8) + ')';
        ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.3); ctx.fill();
      });
    }
  }

  /* ---------- огромная цифра этажа ---------- */
  function bigNumber(level, p) {
    if (p < 0.04) return;
    var txt = level <= 0 ? '00' : (level < 10 ? '0' + level : '' + level);
    var s = (mobile ? H * 0.34 : H * 0.62) * (1 + bump * 0.06);
    ctx.save();
    ctx.font = s + 'px Forum, "Times New Roman", serif';
    ctx.textBaseline = 'alphabetic';
    var x = W * 0.05, y = mobile ? H * 0.5 : H * 0.72;
    ctx.lineWidth = 1.2;
    ctx.strokeStyle = 'rgba(' + COPPER + ',' + ((mobile ? 0.12 : 0.16) + bump * 0.4) + ')';
    ctx.shadowColor = 'rgba(' + COPPER + ',0.6)'; ctx.shadowBlur = GLOW ? bump * 30 : 0;
    ctx.strokeText(txt, x, y);
    ctx.font = (s * 0.075) + 'px Onest, system-ui, sans-serif';
    ctx.fillStyle = 'rgba(' + COPPER + ',' + (mobile ? 0.2 : 0.24) + ')'; ctx.shadowBlur = 0;
    ctx.fillText(level >= LEVELS && p > 0.86 ? 'ДОМ ГОТОВ' : 'ЭТАЖ', x + 8, y + s * 0.11);
    ctx.restore();
  }

  /* ---------- земля, котлован ---------- */
  function ground(p) {
    st(COPPER, 0.6, 1, 6); line(-50, G.gy, W + 50, G.gy); noGlow();
    st(COPPER, 0.13, 1); for (var x = -60; x < W + 60; x += 14) line(x, G.gy + 4, x + 10, G.gy + 14);
    var dig = seg(p, 0, 0.1), depth = G.fh * 1.2 * dig;
    if (depth > 1) {
      var a = G.x0 - 20, b = G.x0 + G.bw + 20;
      ctx.fillStyle = 'rgb(18,18,20)'; ctx.fillRect(a - 10, G.gy + 1, b - a + 20, depth + 16);
      st(COPPER, 0.7, 1.2, 8);
      ctx.beginPath(); ctx.moveTo(a - 12, G.gy); ctx.lineTo(a, G.gy + depth); ctx.lineTo(b, G.gy + depth); ctx.lineTo(b + 12, G.gy); ctx.stroke(); noGlow();
      if (p > 0.09) { st(COPPER, 0.4, 1); for (var k = a + 6; k < b - 6; k += 10) line(k, G.gy + depth - 6, k + 6, G.gy + depth - 1); }
    }
  }

  /* ---------- машины ---------- */
  function tracks(w) {
    ctx.beginPath(); ctx.moveTo(-w + 8, -2); ctx.arcTo(-w, -2, -w, -10, 6); ctx.arcTo(-w, -16, -w + 8, -16, 6);
    ctx.lineTo(w - 8, -16); ctx.arcTo(w, -16, w, -10, 6); ctx.arcTo(w, -2, w - 8, -2, 6); ctx.closePath(); ctx.stroke();
  }
  function wheel(x, y, r, t) { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.stroke(); line(x, y, x + Math.cos(t * 6) * r, y + Math.sin(t * 6) * r); }

  function excavator(p, t) {
    var leave = seg(p, 0.86, 1);
    var x = G.x0 - (mobile ? 64 : 140) - leave * (G.x0 + 300), y = G.gy;
    if (x < -220) return;
    var s = mobile ? 0.75 : 1.25;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    st(COPPER, 0.95, 1.3, 6); tracks(42);
    for (var w = -30; w <= 30; w += 15) wheel(w, -9, 4, t * (leave > 0 ? 3 : 0));
    ctx.strokeRect(-30, -40, 50, 22); ctx.strokeRect(-26, -62, 22, 22);
    st(WARM, 0.5, 1, 8); ctx.strokeRect(-22, -58, 14, 12);
    var work = p < 0.86 ? 1 : 0;
    var a1 = -0.8 + Math.sin(t * 1.8) * 0.3 * work, a2 = 1.25 + Math.sin(t * 1.8 + 1.2) * 0.45 * work;
    var bx = 20, by = -36, ex = bx + Math.cos(a1) * 60, ey = by + Math.sin(a1) * 60;
    var fx = ex + Math.cos(a1 + a2) * 46, fy = ey + Math.sin(a1 + a2) * 46;
    st(COPPER, 1, 2.2, 8); line(bx, by, ex, ey); line(ex, ey, fx, fy);
    st(COPPER, 1, 1.3, 6); ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 13, fy + 4); ctx.lineTo(fx + 9, fy + 15); ctx.lineTo(fx - 2, fy + 11); ctx.closePath(); ctx.stroke();
    noGlow(); ctx.restore();
    if (work && Math.random() < 0.45) dust.push({ x: x + (fx + 6) * s, y: y + (fy + 12) * s, vx: (Math.random() - 0.3) * 0.8, vy: -Math.random() * 0.7, life: 1 });
  }

  // самосвал во время котлована, бетономешалка во время этажей — ездят туда-обратно
  function trucks(p, t) {
    var mixerOn = p > 0.1 && p < 0.8, dumpOn = p < 0.14;
    if (!mixerOn && !dumpOn) return;
    var span = W + 240, speed = mobile ? 38 : 70;
    var x = ((t * speed) % span) - 120, y = G.gy, s = mobile ? 0.7 : 1.1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    st(COPPER, 0.85, 1.2, 6);
    ctx.strokeRect(-52, -30, 22, 22);              // кабина
    st(WARM, 0.45, 1, 6); ctx.strokeRect(-48, -26, 12, 9);
    st(COPPER, 0.85, 1.2, 6); line(-56, -8, 52, -8);
    wheel(-40, -2, 7, t); wheel(20, -2, 7, t); wheel(38, -2, 7, t);
    if (mixerOn) {
      // барабан бетономешалки вращается
      ctx.save(); ctx.translate(14, -26); ctx.rotate(-0.15);
      ctx.beginPath(); ctx.ellipse(0, 0, 34, 16, 0, 0, 6.3); ctx.stroke();
      ctx.beginPath(); ctx.rect(-34, -16, 68, 32); ctx.clip();
      st(CREAM, 0.35, 1);
      for (var k = -3; k <= 3; k++) { var off = ((t * 30 + k * 18) % 108) - 54; line(off - 10, -16, off + 10, 16); }
      ctx.restore();
    } else {
      st(COPPER, 0.85, 1.2, 6); ctx.beginPath(); ctx.moveTo(-26, -10); ctx.lineTo(-22, -34); ctx.lineTo(50, -34); ctx.lineTo(50, -10); ctx.stroke();
      st(COPPER, 0.4, 1); for (var d = -16; d < 46; d += 10) { ctx.beginPath(); ctx.arc(d, -36, 5, Math.PI, 0); ctx.stroke(); }
    }
    noGlow(); ctx.restore();
  }

  /* ---------- дом ---------- */
  function floorY(i) { return G.gy - (i + 1) * G.fh; }
  function building(p, t) {
    var build = seg(p, 0.1, 0.72) * LEVELS, face = seg(p, 0.7, 0.86), light = seg(p, 0.86, 0.98);
    var x0 = G.x0, bw = G.bw, fh = G.fh, cols = G.cols, cw = bw / cols, topDone = Math.floor(build);
    var cur = { x: x0 + bw / 2, y: G.gy, active: false };
    for (var i = 0; i < LEVELS; i++) {
      var f = clamp(build - i, 0, 1); if (f <= 0) break;
      var yb = G.gy - i * fh, colH = fh * clamp(f / 0.6, 0, 1);
      st(COPPER, 0.85, 1.1, 5);
      for (var c = 0; c <= cols; c++) line(x0 + c * cw, yb, x0 + c * cw, yb - colH);
      if (f > 0.6) {
        var sw = bw * clamp((f - 0.6) / 0.4, 0, 1);
        st(COPPER, 1, 1.8, 10); line(x0 - 6, yb - fh, x0 - 6 + sw + 12 * (sw / bw), yb - fh);
        if (f < 1) { // яркая «головка» рисующейся плиты
          ctx.fillStyle = 'rgba(' + HOT + ',0.95)'; ctx.shadowColor = 'rgba(' + HOT + ',1)'; ctx.shadowBlur = GLOW ? 18 : 0;
          ctx.beginPath(); ctx.arc(x0 - 6 + sw, yb - fh, 2.6, 0, 6.3); ctx.fill();
        }
      }
      if (f < 1) cur = { x: x0 + bw * clamp((f - 0.6) / 0.4, 0, 1), y: f > 0.6 ? yb - fh : yb - colH, active: true };
      if (i === topDone && f < 1) {
        st(CREAM, 0.25, 1); var sx = x0 + bw + 6;
        for (var q = 0; q < 2; q++) { var xx = sx + q * 12; line(xx, yb, xx, yb - fh); }
        line(sx, yb, sx + 12, yb - fh); line(sx + 12, yb, sx, yb - fh);
      }
    }
    noGlow();
    var top = floorY(LEVELS - 1);
    if (face > 0) {
      var tw = cw * 1.1, tx = x0 + cw * 0.5;
      st(CREAM, 0.7 * face, 1.3, 8);
      ctx.beginPath(); ctx.moveTo(tx, G.gy - fh); ctx.lineTo(tx, top + 10);
      ctx.quadraticCurveTo(tx + tw / 2, top - 16, tx + tw, top + 10); ctx.lineTo(tx + tw, G.gy - fh); ctx.stroke();
      st(COPPER, 1 * face, 2.2, 10); line(x0 - 10, top, x0 - 10 + (bw + 20) * face, top);
      st(CREAM, 0.4 * face, 1); for (c = 0; c < cols; c++) ctx.strokeRect(x0 + c * cw + 4, G.gy - fh + 8, cw - 8, fh - 12);
    }
    // вертикальная подсветка фасада — включается в финале, как на настоящем доме
    [3, 4.5, 6].forEach(function (k) {
      var vx = x0 + cw * k, hgt = (LEVELS - 1) * fh * face;
      if (hgt <= 0) return;
      st(CREAM, 0.45, 1); line(vx, G.gy - fh, vx, G.gy - fh - hgt); line(vx + 5, G.gy - fh, vx + 5, G.gy - fh - hgt);
      if (light > 0) {
        var pulse = 0.85 + Math.sin(t * 1.5 + k) * 0.15;
        st(HOT, light * pulse, 3, 26); line(vx + 2.5, G.gy - fh, vx + 2.5, G.gy - fh - hgt * clamp(light * 1.6, 0, 1));
      }
    });
    noGlow();
    var total = (LEVELS - 1) * (cols - 1), shown = Math.floor(total * face), n = 0;
    for (i = 1; i < LEVELS; i++) for (c = 1; c < cols; c++, n++) {
      if (n >= shown) continue;
      var wx = x0 + c * cw - cw * 0.28, wy = floorY(i) + fh * 0.2, ww = cw * 0.56, wh = fh * 0.58;
      var lit = rank[n] < light * total * 0.9;
      if (lit) {
        ctx.fillStyle = 'rgba(' + WARM + ',' + ((0.6 + Math.sin(t * 2 + n) * 0.06) * G.a) + ')';
        ctx.shadowColor = 'rgba(' + WARM + ',0.8)'; ctx.shadowBlur = GLOW ? 12 : 0; ctx.fillRect(wx, wy, ww, wh); noGlow();
      }
      st(CREAM, lit ? 0.6 : 0.3, 1); ctx.strokeRect(wx, wy, ww, wh);
    }
    return { cur: cur, build: build, top: top };
  }

  /* ---------- кран ---------- */
  function crane(p, t, cur) {
    var a = seg(p, 0.08, 0.14) * (1 - seg(p, 0.88, 0.96)); if (a <= 0) return;
    var mx = G.x0 + G.bw + (mobile ? 26 : 56), yTop = G.gy - (LEVELS + 2.4) * G.fh;
    var jibL = G.bw + (mobile ? 34 : 90), cj = mobile ? 36 : 80, mw = 13;
    st(COPPER, 0.8 * a, 1, 5);
    line(mx, G.gy, mx, yTop); line(mx + mw, G.gy, mx + mw, yTop);
    for (var y = G.gy; y > yTop + 12; y -= 18) { line(mx, y, mx + mw, y - 18); line(mx + mw, y, mx, y - 18); }
    ctx.strokeRect(mx - 4, yTop - 15, mw + 8, 13);
    st(COPPER, 0.95 * a, 1.5, 8);
    line(mx + mw + cj, yTop - 8, mx - jibL, yTop - 8);
    line(mx + mw / 2, yTop - 34, mx - jibL, yTop - 8); line(mx + mw / 2, yTop - 34, mx + mw + cj, yTop - 8);
    // мигающий огонёк на верхушке
    var blink = (Math.sin(t * 4) > 0.6) ? 1 : 0.15;
    ctx.fillStyle = 'rgba(255,90,60,' + blink * a + ')'; ctx.shadowColor = 'rgba(255,90,60,1)'; ctx.shadowBlur = GLOW ? 16 * blink : 0;
    ctx.beginPath(); ctx.arc(mx + mw / 2, yTop - 36, 2.5, 0, 6.3); ctx.fill(); noGlow();
    ctx.fillStyle = 'rgba(' + COPPER + ',' + (0.4 * a * G.a) + ')'; ctx.fillRect(mx + mw + cj - 24, yTop - 6, 22, 13);
    var tr = 0.5 + Math.sin(t * 0.5) * 0.4, tx = mx - 10 - (jibL - 20) * tr;
    var hookY = Math.min(cur.y - 30, yTop + 30 + (cur.y - yTop - 60) * (0.5 + Math.sin(t * 0.8) * 0.5));
    st(CREAM, 0.5 * a, 1); line(tx, yTop - 8, tx, hookY);
    st(COPPER, a, 1.3, 6); ctx.strokeRect(tx - 5, yTop - 11, 10, 6);
    ctx.save(); ctx.translate(tx, hookY + 8); ctx.rotate(Math.sin(t * 1.3) * 0.1);
    st(CREAM, 0.45 * a, 1); line(0, -8, -20, 0); line(0, -8, 20, 0);
    st(COPPER, a, 2.4, 10); line(-30, 0, 30, 0); ctx.restore(); noGlow();
  }

  /* ---------- частицы ---------- */
  function particles(cur, b, t) {
    if (cur.active && !reduce) {
      for (var k = 0; k < (mobile ? 2 : 4); k++) sparks.push({ x: cur.x, y: cur.y, vx: (Math.random() - 0.5) * 4.5, vy: -Math.random() * 3.8 - 0.5, life: 1, w: 1.4 });
      if (Math.random() < 0.06) flashes.push({ x: cur.x, y: cur.y, life: 1 });
    }
    // салют, когда дом готов
    if (prog > 0.96 && !fired) {
      fired = true; doneFlash = 1;
      for (var n = 0; n < 4; n++) {
        var cx = G.x0 + G.bw * (0.15 + n * 0.25), cy = b.top - G.fh * (1.5 + (n % 2));
        for (var m = 0; m < 50; m++) { var ang = m / 50 * 6.283, sp = 2 + Math.random() * 3; sparks.push({ x: cx, y: cy, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp, life: 1.4, w: 1.6 }); }
      }
    }
    if (prog < 0.9) fired = false;
    ctx.lineCap = 'round';
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i]; s.vy += 0.1; s.vx *= 0.99; s.x += s.vx; s.y += s.vy; s.life -= 0.022;
      if (s.life <= 0 || s.y > G.gy + 4) { sparks.splice(i, 1); continue; }
      var L = Math.min(1, s.life);
      ctx.strokeStyle = 'rgba(255,' + Math.round(160 + 80 * L) + ',110,' + L + ')'; ctx.lineWidth = s.w;
      ctx.shadowBlur = 0;
      line(s.x, s.y, s.x - s.vx * 2.4, s.y - s.vy * 2.4);
    }
    noGlow(); ctx.lineCap = 'butt';
    for (i = flashes.length - 1; i >= 0; i--) {
      var f = flashes[i]; f.life -= 0.08; if (f.life <= 0) { flashes.splice(i, 1); continue; }
      var g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, 70 * f.life + 10);
      g.addColorStop(0, 'rgba(255,230,190,' + 0.55 * f.life + ')'); g.addColorStop(1, 'rgba(255,200,120,0)');
      ctx.fillStyle = g; ctx.fillRect(f.x - 90, f.y - 90, 180, 180);
    }
    for (i = dust.length - 1; i >= 0; i--) {
      var d = dust[i]; d.x += d.vx; d.y += d.vy; d.life -= 0.012; if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + COPPER + ',' + 0.28 * d.life + ')'; ctx.beginPath(); ctx.arc(d.x, d.y, 1.8 + (1 - d.life) * 4, 0, 6.3); ctx.fill();
    }
    if (doneFlash > 0) { ctx.fillStyle = 'rgba(255,220,170,' + doneFlash * 0.12 + ')'; ctx.fillRect(0, 0, W, H); doneFlash -= 0.03; }
  }

  /* ---------- фасадная люлька с тремя рабочими справа ----------
     Под первым экраном рабочие заходят в люльку, подпрыгивают — и она падает вниз, как лифт.
     Пока листаешь — люлька едет вниз вдоль стены (окна стены проплывают мимо), рабочие держатся за поручни.
     Остановился — работают: сварщик (искры), молоток, мойщик окна. */
  var aboutEl = document.getElementById('about');
  var fg = document.createElement('canvas'); fg.className = 'build-fg'; fg.setAttribute('aria-hidden', 'true');
  document.body.appendChild(fg);
  var fctx = fg.getContext('2d');
  var gond = { start: 0, v: 0, lastY: window.scrollY }, gsparks = [];

  function worker(x, foot, s, pose, k, t, phase) {
    // pose: walk | hop | hold | weld | hammer | wipe
    ctx.save(); ctx.translate(x, foot); ctx.scale(s, s);
    var lw = 1.6;
    var legA = pose === 'walk' ? Math.sin(t * 10 + k) * 0.5 : 0;
    // ноги
    st(CREAM, 0.9, lw); line(0, -14, Math.sin(legA) * 8, 0); line(0, -14, -Math.sin(legA) * 8, 0);
    // корпус + жилет
    line(0, -14, 0, -30);
    ctx.fillStyle = 'rgba(240,120,50,' + 0.85 * G.a + ')'; ctx.fillRect(-4, -29, 8, 12);
    // голова и каска
    st(CREAM, 0.9, lw); ctx.beginPath(); ctx.arc(0, -35, 4.2, 0, 6.3); ctx.stroke();
    ctx.fillStyle = 'rgba(' + COPPER + ',' + G.a + ')'; ctx.beginPath(); ctx.arc(0, -36.5, 5, Math.PI, 0); ctx.fill(); ctx.fillRect(-6.5, -37, 13, 1.8);
    // руки
    st(CREAM, 0.9, lw);
    var sh = { x: 0, y: -27 }, hand;
    if (pose === 'walk') { line(sh.x, sh.y, -Math.sin(legA) * 7, -17); line(sh.x, sh.y, Math.sin(legA) * 7, -17); }
    else if (pose === 'hop') { line(sh.x, sh.y, -8, -40); line(sh.x, sh.y, 8, -40); }
    else if (pose === 'hold') { line(sh.x, sh.y, -7, -22); line(sh.x, sh.y, 7, -22); }
    else if (pose === 'weld') {
      hand = { x: 12, y: -26 }; line(sh.x, sh.y, hand.x, hand.y); line(sh.x, sh.y, 6, -18);
      st(COPPER, 1, 1.6); line(hand.x, hand.y, hand.x + 6, hand.y - 2);
    } else if (pose === 'hammer') {
      var a = -1.9 + Math.abs(Math.sin(t * 7 + k)) * 1.6;
      hand = { x: Math.cos(a) * 11, y: sh.y + Math.sin(a) * 11 }; line(sh.x, sh.y, hand.x, hand.y); line(sh.x, sh.y, -6, -18);
      st(COPPER, 1, 2); var hx = hand.x + Math.cos(a) * 6, hy = hand.y + Math.sin(a) * 6; line(hand.x, hand.y, hx, hy); line(hx - 3 * Math.sin(a), hy + 3 * Math.cos(a), hx + 3 * Math.sin(a), hy - 3 * Math.cos(a));
    } else if (pose === 'wipe') {
      var wx = 11 + Math.sin(t * 4 + k) * 5, wy = -32 + Math.cos(t * 4 + k) * 4;
      line(sh.x, sh.y, wx, wy); line(sh.x, sh.y, -6, -18);
      st(CREAM, 0.9, 2); line(wx, wy - 4, wx, wy + 4);
    }
    noGlow(); ctx.restore();
    if (hand) return { x: x + (hand.x + 7) * s, y: foot + (hand.y - 2) * s };
  }

  function gondola(t) {
    if (!aboutEl) return;
    var r = aboutEl.getBoundingClientRect();
    if (!gond.start) { if (r.top < H * 0.18) gond.start = t; else return; }
    if (r.top > H * 0.6) { gond.start = 0; gsparks.length = 0; return; }   // вернулись на первый экран — сценка начнётся заново
    var s = mobile ? 0.45 : 1;
    var pw = 140 * s, x1 = W - (mobile ? 4 : 18), x0 = x1 - pw;
    var el = t - gond.start;
    var topY = H * (mobile ? 0.2 : 0.2), cruise = H * (mobile ? 0.46 : 0.42);

    // скорость прокрутки (пиксели за кадр, сглаженная)
    var dy = Math.abs(window.scrollY - gond.lastY); gond.lastY = window.scrollY;
    gond.v += (dy - gond.v) * 0.15;
    var moving = gond.v > 1.2 && el > 3.2;

    var py, walk = 1, hop = 0;
    if (el < 1.8) { py = topY; walk = el / 1.8; }
    else if (el < 2.3) { py = topY; hop = (el - 1.8) / 0.5; }
    else if (el < 3.2) { var q = (el - 2.3) / 0.9; py = topY + (cruise - topY) * (1 - Math.pow(1 - q, 3)) + Math.sin(q * 9) * 10 * (1 - q); }
    else py = cruise;
    if (moving) py += Math.min(gond.v * 0.5, 16) + Math.sin(t * 22) * 1.2;   // инерция «лифта» и вибрация

    // «линейка этажей» у правого края — проплывает вверх, когда люлька едет вниз
    var cell = 70 * s, off = (window.scrollY * 0.85) % cell;
    for (var y = -off; y < H + cell; y += cell) {
      st(COPPER, 0.55, 1); line(W - (mobile ? 5 : 10), y, W, y);
      st(COPPER, 0.25, 1); line(W - (mobile ? 3 : 5), y + cell / 2, W, y + cell / 2);
    }

    // тросы
    var sway = Math.sin(t * 1.4) * (moving ? 2.5 : 1);
    st(CREAM, 0.6, 1); line(x0 + 8 * s, 0, x0 + 8 * s + sway, py - 34 * s); line(x1 - 8 * s, 0, x1 - 8 * s + sway, py - 34 * s);
    // люлька
    ctx.save(); ctx.translate(sway, 0);
    st(COPPER, 0.95, 1.6, 6);
    line(x0, py, x1, py);                                   // пол
    line(x0, py - 26 * s, x1, py - 26 * s);                 // поручень
    for (var k = 0; k <= 4; k++) { var xx = x0 + pw * k / 4; line(xx, py, xx, py - 26 * s); }
    st(COPPER, 0.5, 1); for (k = 0; k < 8; k++) line(x0 + pw * k / 8, py - 13 * s, x0 + pw * (k + 1) / 8, py - 13 * s);
    // лебёдки на концах (крутятся, когда едем)
    [x0 + 8 * s, x1 - 8 * s].forEach(function (mx) {
      st(COPPER, 0.95, 1.2, 4); ctx.strokeRect(mx - 6 * s, py - 40 * s, 12 * s, 10 * s);
      var a = moving ? t * 12 : 0; line(mx, py - 35 * s, mx + Math.cos(a) * 4 * s, py - 35 * s + Math.sin(a) * 4 * s);
      line(mx, py - 30 * s, mx, py - 26 * s);
    });
    noGlow(); ctx.restore();

    // рабочие
    var spots = [0.2, 0.5, 0.8], jobs = ['weld', 'hammer', 'wipe'];
    for (k = 0; k < 3; k++) {
      var tx = x0 + pw * spots[k] + sway;
      var startX = W + 30 + k * 34;
      var wxk = walk < 1 ? mix(startX, tx, clamp(walk * 1.3 - k * 0.15, 0, 1)) : tx;
      var foot = py - 2 * s - (hop > 0 ? Math.sin(Math.PI * hop) * 20 * s : 0);
      var pose = walk < 1 ? (wxk === tx ? 'hold' : 'walk') : hop > 0 && hop < 1 ? 'hop' : (el < 3.2 || moving ? 'hold' : jobs[k]);
      var tool = worker(wxk, foot, s, pose, k, t);
      if (pose === 'weld' && tool && Math.random() < 0.8) {
        for (var n = 0; n < 2; n++) gsparks.push({ x: tool.x, y: tool.y, vx: (Math.random() - 0.7) * 3, vy: -Math.random() * 2.5, life: 1 });
      }
      if (pose === 'hammer' && tool && Math.abs(Math.sin(t * 7 + k)) < 0.12) gsparks.push({ x: tool.x, y: tool.y, vx: Math.random() * 1.5, vy: -Math.random() * 1.5, life: 0.6 });
    }
    ctx.lineCap = 'round';
    for (var i = gsparks.length - 1; i >= 0; i--) {
      var p = gsparks[i]; p.vy += 0.12; p.x += p.vx; p.y += p.vy; p.life -= 0.035;
      if (p.life <= 0 || p.y > H) { gsparks.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,' + Math.round(170 + 70 * p.life) + ',110,' + p.life + ')'; ctx.lineWidth = 1.3;
      line(p.x, p.y, p.x - p.vx * 2.2, p.y - p.vy * 2.2);
    }
    ctx.lineCap = 'butt';
  }

  var lastHud = '';
  function frame(now) {
    var t = (now - t0) / 1000;
    if (lastNow && GLOW) { if (now - lastNow > 28) slow++; else slow = Math.max(0, slow - 1); if (slow > 20) GLOW = 0; }
    lastNow = now;
    prog += (target - prog) * (reduce ? 1 : 0.2);
    var level = prog < 0.1 ? 0 : Math.min(LEVELS, Math.ceil(seg(prog, 0.1, 0.72) * LEVELS));
    if (level !== lastLevel) { if (lastLevel >= 0) bump = 1; lastLevel = level; }
    bump *= 0.92;

    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(gridLayer, 0, 0, W, H);
    sky(prog, t);
    bigNumber(level, prog);
    // камера: в начале ближе к котловану, потом плавно отъезжает
    var zoom = mix(mobile ? 1.25 : 1.45, 1, seg(prog, 0, 0.7));
    var cx = G.x0 + G.bw / 2, cy = G.gy;
    ctx.translate(cx, cy); ctx.scale(zoom, zoom); ctx.translate(-cx, -cy - (zoom - 1) * G.fh * 2.2);
    ground(prog);
    var b = building(prog, t);
    crane(prog, t, b.cur);
    trucks(prog, t);
    excavator(prog, t);
    particles(b.cur, b, t);
    // люлька — на отдельном слое поверх страницы
    var mainCtx = ctx; ctx = fctx;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0); ctx.clearRect(0, 0, W, H);
    gondola(t);
    ctx = mainCtx;

    if (hud) {
      var txt = prog < 0.1 ? 'Котлован' : (b.build < LEVELS ? 'Этаж ' + Math.max(1, level) + ' из ' + LEVELS : (prog < 0.86 ? 'Фасад' : 'Дом готов'));
      if (txt !== lastHud) { hud.textContent = txt; lastHud = txt; }
    }
    if (!reduce && !document.hidden) requestAnimationFrame(frame);
  }
  document.addEventListener('visibilitychange', function () { if (!document.hidden && !reduce) requestAnimationFrame(frame); });

  size(); onScroll();
  window.addEventListener('resize', size);
  window.addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(frame);
})();
