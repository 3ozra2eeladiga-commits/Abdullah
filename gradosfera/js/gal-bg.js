/* Фон галереи — «живой чертёж» в стиле сайта: тёмная синька с сеткой, по ней медными линиями
   сами дорисовываются фасады домов, краны с качающимся крюком, планировки и размерные линии,
   потом тают и появляются в другом месте. Работает, только когда галерея на экране. */
(function () {
  'use strict';
  var cv = document.getElementById('deskBp'); if (!cv || !cv.getContext) return;
  var ctx = cv.getContext('2d'), box = cv.parentNode;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1, on = false, raf = 0, items = [], last = 0, nextAt = 0;
  var COPPER = '201,138,91', CREAM = '239,231,218', BLUE = '120,150,205';

  function size() {
    DPR = Math.min(window.devicePixelRatio || 1, 2); W = box.clientWidth; H = box.clientHeight;
    cv.width = W * DPR; cv.height = H * DPR; ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  // рисунки — наборы отрезков в своих единицах (0..100)
  function facade() {
    var s = [], fl = 6 + Math.floor(Math.random() * 3), w = 60, h = fl * 11;
    s.push([0, 0, w, 0], [w, 0, w, -h], [w, -h, 0, -h], [0, -h, 0, 0]);
    for (var f = 1; f < fl; f++) s.push([0, -f * 11, w, -f * 11]);
    for (f = 0; f < fl; f++) for (var c = 0; c < 5; c++) { var x = 5 + c * 11, y = -f * 11 - 3; s.push([x, y, x + 6, y], [x + 6, y, x + 6, y - 6], [x + 6, y - 6, x, y - 6], [x, y - 6, x, y]); }
    s.push([-6, -h - 4, w + 6, -h - 4]);
    return { seg: s, w: w, h: h + 6, kind: 'facade' };
  }
  function crane() {
    var s = [], th = 90;
    s.push([0, 0, 0, -th], [6, 0, 6, -th]);
    for (var y = 0; y > -th; y -= 10) s.push([0, y, 6, y - 10], [0, y - 10, 6, y - 10]);
    s.push([-20, -th, 70, -th], [-20, -th + 6, 70, -th], [3, -th - 14, -20, -th], [3, -th - 14, 70, -th], [-20, -th, -20, -th + 10], [-26, -th + 10, -14, -th + 10]);
    return { seg: s, w: 96, h: th + 14, kind: 'crane', ox: 26 };
  }
  function plan() {
    var s = [], w = 70, h = 46;
    s.push([0, 0, w, 0], [w, 0, w, -h], [w, -h, 0, -h], [0, -h, 0, 0], [30, 0, 30, -h], [30, -24, w, -24], [50, -24, 50, -h], [0, -18, 30, -18]);
    s.push([0, 8, w, 8], [0, 5, 0, 11], [w, 5, w, 11]);
    return { seg: s, w: w, h: h + 10, kind: 'plan' };
  }
  function dims() {
    var s = [], L = 80;
    s.push([0, 0, L, 0], [0, -4, 0, 4], [L, -4, L, 4], [0, 0, 5, -3], [0, 0, 5, 3], [L, 0, L - 5, -3], [L, 0, L - 5, 3]);
    return { seg: s, w: L, h: 10, kind: 'dims' };
  }
  var MAKERS = [facade, crane, plan, facade, dims, crane];
  var mi = Math.floor(Math.random() * MAKERS.length);
  function spawn(t) {
    var d = MAKERS[mi++ % MAKERS.length]();
    var sc = (W < 600 ? 1.3 : 2.1) * (0.8 + Math.random() * 0.4);
    var tries = 0, x, y;
    do {
      x = 10 + Math.random() * Math.max(10, W - d.w * sc - 20) + (d.ox || 0) * sc;
      y = d.h * sc + 10 + Math.random() * Math.max(10, H - d.h * sc - 20);
      tries++;
    } while (tries < 12 && items.some(function (o) { return Math.abs(o.x - x) < 160 && Math.abs(o.y - y) < 140; }));
    var len = 0; d.seg.forEach(function (g) { g.l = Math.hypot(g[2] - g[0], g[3] - g[1]); len += g.l; });
    items.push({ d: d, x: x, y: y, s: sc, born: t, len: len, draw: 3.2 + Math.random(), hold: 4 + Math.random() * 2 });
  }
  function frame(now) {
    raf = 0; if (!on) return;
    var t = now / 1000;
    ctx.clearRect(0, 0, W, H);
    // сетка синьки, медленно плывёт
    var off = (t * 6) % 24;
    ctx.lineWidth = 1;
    for (var gx = -off; gx < W; gx += 24) { ctx.strokeStyle = 'rgba(' + BLUE + ',' + (Math.round((gx + off) / 24) % 5 === 0 ? 0.2 : 0.09) + ')'; ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke(); }
    for (var gy = -off; gy < H; gy += 24) { ctx.strokeStyle = 'rgba(' + BLUE + ',' + (Math.round((gy + off) / 24) % 5 === 0 ? 0.2 : 0.09) + ')'; ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke(); }
    if (t > nextAt && items.length < (W < 600 ? 3 : 5)) { spawn(t); nextAt = t + 1.6 + Math.random() * 1.4; }
    for (var i = items.length - 1; i >= 0; i--) {
      var o = items[i], age = t - o.born, p = Math.min(1, age / o.draw), fade = age > o.draw + o.hold ? 1 - (age - o.draw - o.hold) / 1.6 : 1;
      if (fade <= 0) { items.splice(i, 1); continue; }
      ctx.save(); ctx.translate(o.x, o.y); ctx.scale(o.s, o.s);
      ctx.lineWidth = 1.5 / o.s; ctx.lineCap = 'round';
      ctx.strokeStyle = 'rgba(' + (o.d.kind === 'dims' ? CREAM : COPPER) + ',' + 0.9 * fade + ')';
      var left = o.len * p, tip = null;
      ctx.beginPath();
      for (var k = 0; k < o.d.seg.length && left > 0; k++) {
        var g = o.d.seg[k], f = Math.min(1, left / g.l), ex = g[0] + (g[2] - g[0]) * f, ey = g[1] + (g[3] - g[1]) * f;
        ctx.moveTo(g[0], g[1]); ctx.lineTo(ex, ey); left -= g.l; tip = [ex, ey];
      }
      ctx.stroke();
      if (o.d.kind === 'crane' && p >= 1) {   // крюк качается
        var a = Math.sin(t * 1.3 + o.born) * 0.12, hx = 52, hy = -90 + 6;
        var bx = hx + Math.sin(a) * 34, by = hy + Math.cos(a) * 34;
        ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(bx, by); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, by + 3, 3, 0, Math.PI); ctx.stroke();
      }
      ctx.restore();
      if (tip && p < 1) {   // «грифель»: тёплая точка на кончике линии
        var px = o.x + tip[0] * o.s, py = o.y + tip[1] * o.s;
        var rg = ctx.createRadialGradient(px, py, 0, px, py, 10);
        rg.addColorStop(0, 'rgba(255,214,150,' + 0.9 * fade + ')'); rg.addColorStop(1, 'rgba(255,214,150,0)');
        ctx.fillStyle = rg; ctx.beginPath(); ctx.arc(px, py, 10, 0, 6.3); ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (on) return; on = true; if (!raf) raf = requestAnimationFrame(frame); }
  function stop() { on = false; }
  size(); window.addEventListener('resize', size);
  if (reduce) { on = true; for (var n = 0; n < 4; n++) spawn(1e4 - 4.5); frame(1e7); on = false; return; }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { es[0].isIntersecting ? start() : stop(); }, { rootMargin: '100px 0px' }).observe(box);
  else start();
})();
