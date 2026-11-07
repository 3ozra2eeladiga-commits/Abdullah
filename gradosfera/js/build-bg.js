/* Фон «дом строится, пока листаешь».
   Тонкая медная графика на канвасе за контентом: котлован → экскаватор → кран и 8 этажей → фасад → свет в окнах.
   Прогресс стройки = прогресс прокрутки страницы. Кран, искры и ковш двигаются всегда — фон живой. */
(function () {
  'use strict';
  var cv = document.getElementById('buildBg');
  if (!cv) return;
  var ctx = cv.getContext('2d');
  var hud = document.getElementById('buildHud');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var FLOORS = 7, LEVELS = FLOORS + 1;           // 8 этажей: первый (коммерция) + 7 жилых
  var COPPER = '201,138,91', CREAM = '239,231,218', WARM = '255,196,128';
  var W = 0, H = 0, DPR = 1, mobile = false, G = {};
  var target = 0, prog = reduce ? 1 : 0, t0 = performance.now();
  var sparks = [], dust = [];

  // случайный, но стабильный порядок окон для включения света
  var order = []; for (var i = 0; i < 400; i++) order.push(i);
  var seed = 7; var rnd = function () { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
  for (i = order.length - 1; i > 0; i--) { var j = Math.floor(rnd() * (i + 1)); var tmp = order[i]; order[i] = order[j]; order[j] = tmp; }
  var lightRank = {}; order.forEach(function (v, k) { lightRank[v] = k; });

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth; H = window.innerHeight;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    cv.style.width = W + 'px'; cv.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    mobile = W < 760;
    var gy = H * (mobile ? 0.86 : 0.88);
    var fh = Math.min(H * (mobile ? 0.058 : 0.062), 58);
    var bw = mobile ? W * 0.62 : Math.min(W * 0.27, 440);
    var x0 = mobile ? (W - bw) / 2 + W * 0.05 : W * 0.63;
    G = { gy: gy, fh: fh, bw: bw, x0: x0, cols: 7, alpha: mobile ? 0.45 : 0.62 };
  }

  function onScroll() {
    var max = document.documentElement.scrollHeight - window.innerHeight;
    target = max > 0 ? Math.min(1, Math.max(0, window.scrollY / max)) : 0;
  }

  var clamp = function (v, a, b) { return v < a ? a : v > b ? b : v; };
  var seg = function (p, a, b) { return clamp((p - a) / (b - a), 0, 1); };
  function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
  function stroke(rgb, a, w) { ctx.strokeStyle = 'rgba(' + rgb + ',' + (a * G.alpha) + ')'; ctx.lineWidth = w || 1; }

  function drawGrid() {
    stroke(CREAM, 0.035, 1);
    var s = 64;
    for (var x = (W % s) / 2; x < W; x += s) line(x, 0, x, H);
    for (var y = (H % s) / 2; y < H; y += s) line(0, y, W, y);
  }

  function drawGround(p) {
    stroke(COPPER, 0.5, 1);
    line(0, G.gy, W, G.gy);
    // штриховка земли
    stroke(COPPER, 0.12, 1);
    for (var x = -20; x < W; x += 14) line(x, G.gy + 4, x + 10, G.gy + 14);
    // котлован / фундамент
    var dig = seg(p, 0, 0.1), depth = G.fh * 1.1 * dig;
    if (depth > 1) {
      var a = G.x0 - 18, b = G.x0 + G.bw + 18;
      ctx.fillStyle = 'rgba(18,18,20,1)'; ctx.fillRect(a, G.gy + 1, b - a, depth + 14);
      stroke(COPPER, 0.55, 1);
      ctx.beginPath(); ctx.moveTo(a - 10, G.gy); ctx.lineTo(a, G.gy + depth); ctx.lineTo(b, G.gy + depth); ctx.lineTo(b + 10, G.gy); ctx.stroke();
      if (p > 0.09) { // плита фундамента
        stroke(COPPER, 0.4, 1);
        for (var k = a + 6; k < b - 6; k += 10) line(k, G.gy + depth - 6, k + 6, G.gy + depth - 1);
      }
    }
  }

  function drawExcavator(p, t) {
    var leave = seg(p, 0.86, 1);
    var x = G.x0 - (mobile ? 70 : 150) - leave * (G.x0 + 220), y = G.gy;
    if (x < -200) return;
    var s = mobile ? 0.7 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
    stroke(COPPER, 0.8, 1.2);
    // гусеницы
    ctx.beginPath(); ctx.moveTo(-34, -2); ctx.arcTo(-42, -2, -42, -10, 6); ctx.arcTo(-42, -16, -34, -16, 6);
    ctx.lineTo(34, -16); ctx.arcTo(42, -16, 42, -10, 6); ctx.arcTo(42, -2, 34, -2, 6); ctx.closePath(); ctx.stroke();
    for (var w = -30; w <= 30; w += 15) { ctx.beginPath(); ctx.arc(w, -9, 4, 0, 6.3); ctx.stroke(); }
    // корпус и кабина
    ctx.strokeRect(-30, -40, 50, 22); ctx.strokeRect(-26, -62, 22, 22);
    stroke(CREAM, 0.25, 1); ctx.strokeRect(-22, -58, 14, 12);
    // стрела: работает, пока идёт стройка
    var work = p < 0.86 ? 1 : 0;
    var a1 = -0.75 + Math.sin(t * 1.6) * 0.28 * work, a2 = 1.25 + Math.sin(t * 1.6 + 1.2) * 0.4 * work;
    var bx = 20, by = -36, l1 = 58, l2 = 44;
    var ex = bx + Math.cos(a1) * l1, ey = by + Math.sin(a1) * l1;
    var fx = ex + Math.cos(a1 + a2) * l2, fy = ey + Math.sin(a1 + a2) * l2;
    stroke(COPPER, 0.85, 2); line(bx, by, ex, ey); line(ex, ey, fx, fy);
    stroke(COPPER, 0.85, 1.2);
    ctx.beginPath(); ctx.moveTo(fx, fy); ctx.lineTo(fx + 12, fy + 4); ctx.lineTo(fx + 8, fy + 14); ctx.lineTo(fx - 2, fy + 10); ctx.closePath(); ctx.stroke();
    ctx.restore();
    // пыль из-под ковша
    if (work && Math.random() < 0.3) dust.push({ x: x + (fx + 6) * s, y: y + (fy + 12) * s, vx: (Math.random() - 0.3) * 0.6, vy: -Math.random() * 0.5, life: 1 });
  }

  function floorY(i) { return G.gy - (i + 1) * G.fh; }

  function drawBuilding(p, t) {
    var build = seg(p, 0.1, 0.72) * LEVELS;            // сколько этажей «поднялось»
    var face = seg(p, 0.7, 0.86), light = seg(p, 0.86, 0.98);
    var x0 = G.x0, bw = G.bw, fh = G.fh, cols = G.cols, cw = bw / cols;
    var topDone = Math.floor(build);
    var cur = { x: x0 + bw / 2, y: G.gy, active: false };

    for (var i = 0; i < LEVELS; i++) {
      var f = clamp(build - i, 0, 1);
      if (f <= 0) break;
      var yb = G.gy - i * fh;                      // низ этажа
      var colH = fh * clamp(f / 0.6, 0, 1);
      stroke(COPPER, 0.75, 1);
      for (var c = 0; c <= cols; c++) line(x0 + c * cw, yb, x0 + c * cw, yb - colH);
      if (f > 0.6) { // плита перекрытия ползёт слева направо
        var sw = bw * clamp((f - 0.6) / 0.4, 0, 1);
        stroke(COPPER, 0.9, 1.6); line(x0 - 4, yb - fh, x0 - 4 + sw + 8 * (sw / bw), yb - fh);
      }
      if (f < 1) { cur = { x: x0 + bw * clamp((f - 0.6) / 0.4, 0, 1), y: yb - colH, active: true }; }
      // леса на текущем этаже
      if (i === topDone && f < 1) {
        stroke(CREAM, 0.18, 1);
        var sx = x0 + bw + 6;
        line(sx, yb, sx, yb - fh); line(sx + 10, yb, sx + 10, yb - fh); line(sx, yb, sx + 10, yb - fh); line(sx + 10, yb, sx, yb - fh);
      }
    }

    // фасад: стеклянная башня, светлые вертикали, окна
    if (face > 0) {
      var top = floorY(LEVELS - 1);
      // стеклянная башня на углу
      var tw = cw * 1.1, tx = x0 + cw * 0.5;
      stroke(CREAM, 0.55 * face, 1.2);
      ctx.beginPath(); ctx.moveTo(tx, G.gy - fh); ctx.lineTo(tx, top + 8);
      ctx.quadraticCurveTo(tx + tw / 2, top - 14, tx + tw, top + 8); ctx.lineTo(tx + tw, G.gy - fh); ctx.stroke();
      // светлые вертикали (как у настоящего фасада)
      [3, 4.5, 6].forEach(function (k) {
        var vx = x0 + cw * k;
        stroke(CREAM, 0.4 * face, 1); line(vx, G.gy - fh, vx, G.gy - fh - (LEVELS - 1) * fh * face);
        line(vx + 4, G.gy - fh, vx + 4, G.gy - fh - (LEVELS - 1) * fh * face);
      });
      // карниз
      stroke(COPPER, 0.9 * face, 2); line(x0 - 8, top, x0 + (bw + 16) * face - 8, top);
      // витрины первого этажа
      stroke(CREAM, 0.35 * face, 1);
      for (c = 0; c < cols; c++) ctx.strokeRect(x0 + c * cw + 4, G.gy - fh + 8, cw - 8, fh - 12);
    }
    var total = FLOORS * (cols - 1), shown = Math.floor(total * face), n = 0;
    for (i = 1; i < LEVELS; i++) {
      for (c = 1; c < cols; c++, n++) {
        if (n >= shown) continue;
        var wx = x0 + c * cw - cw * 0.28, wy = floorY(i) + fh * 0.2, ww = cw * 0.56, wh = fh * 0.58;
        var lit = lightRank[n] < light * total * 0.85;
        if (lit) {
          var flick = 0.85 + Math.sin(t * 2 + n) * 0.06;
          ctx.fillStyle = 'rgba(' + WARM + ',' + (0.55 * flick * G.alpha) + ')'; ctx.fillRect(wx, wy, ww, wh);
        }
        stroke(CREAM, lit ? 0.5 : 0.28, 1); ctx.strokeRect(wx, wy, ww, wh);
      }
    }
    return { cur: cur, build: build };
  }

  function drawCrane(p, t, cur) {
    var fade = 1 - seg(p, 0.88, 0.97);
    var appear = seg(p, 0.08, 0.14);
    var a = fade * appear;
    if (a <= 0) return;
    var mx = G.x0 + G.bw + (mobile ? 24 : 44);
    var topY = G.gy - (LEVELS + 2.2) * G.fh;
    var jibL = G.bw + (mobile ? 30 : 70), cj = mobile ? 34 : 70;
    stroke(COPPER, 0.7 * a, 1);
    // мачта-решётка
    var mw = 12, yTop = topY;
    line(mx, G.gy, mx, yTop); line(mx + mw, G.gy, mx + mw, yTop);
    for (var y = G.gy; y > yTop + 12; y -= 18) { line(mx, y, mx + mw, y - 18); line(mx + mw, y, mx, y - 18); }
    // кабина, стрела, противовес
    ctx.strokeRect(mx - 4, yTop - 14, mw + 8, 12);
    stroke(COPPER, 0.85 * a, 1.4);
    line(mx + mw + cj, yTop - 8, mx - jibL, yTop - 8);
    line(mx + mw / 2, yTop - 30, mx - jibL, yTop - 8); line(mx + mw / 2, yTop - 30, mx + mw + cj, yTop - 8);
    ctx.fillStyle = 'rgba(' + COPPER + ',' + (0.35 * a * G.alpha) + ')'; ctx.fillRect(mx + mw + cj - 22, yTop - 6, 20, 12);
    // тележка ездит по стреле, крюк опускается к текущему этажу
    var tr = 0.5 + Math.sin(t * 0.45) * 0.38;
    var tx = mx - 10 - (jibL - 20) * tr;
    var hookY = Math.min(cur.y - 30, yTop + 30 + (cur.y - yTop - 60) * (0.5 + Math.sin(t * 0.7) * 0.5));
    stroke(CREAM, 0.45 * a, 1); line(tx, yTop - 8, tx, hookY);
    stroke(COPPER, 0.9 * a, 1.2); ctx.strokeRect(tx - 5, yTop - 11, 10, 6);
    // балка на крюке
    var sway = Math.sin(t * 1.3) * 0.08;
    ctx.save(); ctx.translate(tx, hookY + 8); ctx.rotate(sway);
    stroke(CREAM, 0.4 * a, 1); line(0, -8, -18, 0); line(0, -8, 18, 0);
    stroke(COPPER, 0.9 * a, 2); line(-26, 0, 26, 0);
    ctx.restore();
  }

  function particles(cur) {
    // искры сварки на текущем этаже
    if (cur.active && !reduce) {
      for (var k = 0; k < (mobile ? 2 : 4); k++) sparks.push({ x: cur.x, y: cur.y, vx: (Math.random() - 0.5) * 3.4, vy: -Math.random() * 3 - 0.5, life: 1 });
    }
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i]; s.vy += 0.12; s.x += s.vx; s.y += s.vy; s.life -= 0.03;
      if (s.life <= 0 || s.y > G.gy) { sparks.splice(i, 1); continue; }
      ctx.strokeStyle = 'rgba(255,' + Math.round(170 + 60 * s.life) + ',110,' + (s.life * G.alpha) + ')';
      ctx.lineWidth = 1.2; line(s.x, s.y, s.x - s.vx * 2, s.y - s.vy * 2);
    }
    for (i = dust.length - 1; i >= 0; i--) {
      var d = dust[i]; d.x += d.vx; d.y += d.vy; d.life -= 0.012;
      if (d.life <= 0) { dust.splice(i, 1); continue; }
      ctx.fillStyle = 'rgba(' + COPPER + ',' + (0.25 * d.life * G.alpha) + ')';
      ctx.beginPath(); ctx.arc(d.x, d.y, 1.6 + (1 - d.life) * 3, 0, 6.3); ctx.fill();
    }
  }

  var lastHud = '';
  function frame(now) {
    var t = (now - t0) / 1000;
    prog += (target - prog) * (reduce ? 1 : 0.08);
    ctx.clearRect(0, 0, W, H);
    drawGrid();
    drawGround(prog);
    var b = drawBuilding(prog, t);
    drawCrane(prog, t, b.cur);
    drawExcavator(prog, t);
    particles(b.cur);
    if (hud) {
      var txt;
      if (prog < 0.1) txt = 'Котлован';
      else if (b.build < LEVELS) txt = 'Этаж ' + Math.max(1, Math.ceil(b.build)) + ' из ' + LEVELS;
      else if (prog < 0.86) txt = 'Фасад';
      else txt = 'Дом готов';
      if (txt !== lastHud) { hud.textContent = txt; lastHud = txt; }
    }
    if (!reduce) requestAnimationFrame(frame);
  }

  size(); onScroll();
  window.addEventListener('resize', size);
  window.addEventListener('scroll', onScroll, { passive: true });
  requestAnimationFrame(frame);
})();
