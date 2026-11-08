/* Видео из кадров, которое «крутится» прокруткой (как на хороших сайтах застройщиков).
   Надёжнее, чем перемотка <video>: на iPhone не тормозит и не прыгает.
   Два слоя кадров: сначала быстро грузятся маленькие (data-low) — видео сразу плавное без рывков,
   потом поверх догружаются чёткие, начиная с тех, что рядом с текущим местом.
   Использование: <canvas data-frames="frames/hero" data-count="141" data-low data-section="#hero"> */
(function () {
  'use strict';
  var mobile = window.matchMedia('(max-width: 760px)').matches;

  function FrameScroller(cv) {
    var useM = mobile || cv.hasAttribute('data-desk-m'), fit = !mobile && cv.hasAttribute('data-desk-m');
    var root = cv.getAttribute('data-frames');
    var base = root + (useM ? '/m/' : '/d/');
    var lowBase = cv.hasAttribute('data-low') ? root + (useM ? '/lm/' : '/ld/') : null;
    var count = +((useM && cv.getAttribute('data-count-m')) || cv.getAttribute('data-count'));
    var section = document.querySelector(cv.getAttribute('data-section'));
    var start = +(cv.getAttribute('data-start') || 0), span = +(cv.getAttribute('data-span') || 1);
    var ctx = cv.getContext('2d');
    var tiny = document.createElement('canvas'); tiny.width = 48; tiny.height = 27; var tctx = tiny.getContext('2d');
    var hi = new Array(count), hiOk = new Array(count), lo = new Array(count), loOk = new Array(count);
    var cur = 0, want = 0, drawn = -1, drawnHi = false, raf = 0;

    function name(i) { return 'f_' + String(i + 1).padStart(3, '0') + '.webp'; }
    var inflight = 0, MAXQ = 10;
    function load(arr, ok, b, i) {
      if (arr[i]) return;
      var im = new Image(); im.decoding = 'async'; arr[i] = im; inflight++;
      var done = function () {
        inflight--; ok[i] = true;
        if (Math.abs(i - Math.round(want)) <= 2 || drawn < 0) kick();
        pump();
      };
      im.onload = function () { if (im.decode) im.decode().then(done, done); else done(); };
      im.onerror = function () { inflight--; pump(); };
      im.src = b + name(i);
    }
    // очередь: 1) маленькие кадры по порядку от текущего; 2) чёткие — рядом с текущим местом, потом остальные
    function next() {
      var c = Math.round(want), d, a, b;
      if (lowBase) for (d = 0; d < count; d++) { a = c + d; b = c - d; if (a < count && !lo[a]) return [lo, loOk, lowBase, a]; if (b >= 0 && !lo[b]) return [lo, loOk, lowBase, b]; }
      for (d = 0; d < count; d++) { a = c + d; b = c - d; if (a < count && !hi[a]) return [hi, hiOk, base, a]; if (d <= 8 && b >= 0 && !hi[b]) return [hi, hiOk, base, b]; }
      for (var k = 0; k < count; k++) if (!hi[k]) return [hi, hiOk, base, k];
      return null;
    }
    function pump() {
      while (inflight < MAXQ) {
        // как только рядом с текущим местом есть маленькие кадры — чёткие для текущего места грузим в первую очередь
        var c = Math.round(want);
        if (lowBase && loOk[c] && !hi[c]) { load(hi, hiOk, base, c); continue; }
        var n = next(); if (!n) return; load(n[0], n[1], n[2], n[3]);
      }
    }
    var begun = false;
    function begin() { if (begun) return; begun = true; load(hi, hiOk, base, 0); pump(); }
    function near() { return section.getBoundingClientRect().top < window.innerHeight * 2.5; }
    if (near()) begin();

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      drawn = -1; kick();
    }
    function pick(i) {                 // лучший доступный кадр: чёткий точный → маленький точный → ближайший чёткий/маленький
      if (hiOk[i]) return [hi[i], true, i];
      if (loOk[i]) return [lo[i], false, i];
      for (var d = 1; d < count; d++) {
        var a = i - d, b = i + d;
        if (loOk[a] || hiOk[a]) return [hiOk[a] ? hi[a] : lo[a], !!hiOk[a], a];
        if (loOk[b] || hiOk[b]) return [hiOk[b] ? hi[b] : lo[b], !!hiOk[b], b];
      }
      return null;
    }
    function draw(p) {
      var im = p[0], cw = cv.width, ch = cv.height, iw = im.naturalWidth, ih = im.naturalHeight;
      ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
      if (fit) {
        tctx.drawImage(im, 0, (ih - iw * 27 / 48) / 2, iw, iw * 27 / 48, 0, 0, 48, 27);
        ctx.drawImage(tiny, 0, 0, cw, ch); ctx.fillStyle = 'rgba(10,10,14,.45)'; ctx.fillRect(0, 0, cw, ch);
        var s2 = ch / ih; ctx.drawImage(im, (cw - iw * s2) / 2, 0, iw * s2, ch);
      } else {
        var s = Math.max(cw / iw, ch / ih), w = iw * s, h = ih * s;
        ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h);
      }
      drawn = p[2]; drawnHi = p[1]; cv.dataset.frame = p[2];
    }
    function tick() {
      raf = 0;
      cur += (want - cur) * 0.25;
      if (Math.abs(want - cur) < 0.05) cur = want;
      var i = Math.round(cur), p = pick(i);
      if (p && (p[2] !== drawn || (p[1] && !drawnHi))) draw(p);
      if (cur !== want) raf = requestAnimationFrame(tick);   // дозагрузка кадра сама вызовет перерисовку
    }
    function kick() { if (!raf) raf = requestAnimationFrame(tick); }
    function onScroll() {
      if (!begun && near()) begin();
      var r = section.getBoundingClientRect(), len = section.offsetHeight - window.innerHeight;
      var p = len > 0 ? Math.min(1, Math.max(0, -r.top / len)) : 0;
      p = Math.min(1, Math.max(0, (p - start) / span));
      want = p * (count - 1); kick(); if (begun) pump();
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', size);
    size(); onScroll();
  }
  Array.prototype.slice.call(document.querySelectorAll('canvas[data-frames]')).forEach(FrameScroller);
})();
