/* Видео из кадров, которое «крутится» прокруткой (как на хороших сайтах застройщиков).
   Надёжнее, чем перемотка <video>: на iPhone не тормозит и не прыгает.
   Использование: <canvas data-frames="frames/hero" data-count="121" data-section="#hero"> */
(function () {
  'use strict';
  var mobile = window.matchMedia('(max-width: 760px)').matches;

  function FrameScroller(cv) {
    var base = cv.getAttribute('data-frames') + (mobile ? '/m/' : '/d/');
    var count = +((mobile && cv.getAttribute('data-count-m')) || cv.getAttribute('data-count'));
    var section = document.querySelector(cv.getAttribute('data-section'));
    var start = +(cv.getAttribute('data-start') || 0), span = +(cv.getAttribute('data-span') || 1);
    var ctx = cv.getContext('2d');
    var imgs = new Array(count), loaded = new Array(count);
    var cur = 0, want = 0, drawn = -1, raf = 0;

    function src(i) { return base + 'f_' + String(i + 1).padStart(3, '0') + '.webp'; }
    var inflight = 0, MAXQ = 8;
    function load(i) {
      if (imgs[i]) return;
      var im = new Image(); im.decoding = 'async'; imgs[i] = im; inflight++;
      var done = function () {
        inflight--; loaded[i] = true;
        if (drawn < 0 || Math.abs(i - want) < Math.abs(drawn - want)) kick();
        pump();
      };
      im.onload = function () { if (im.decode) im.decode().then(done, done); else done(); };
      im.onerror = function () { inflight--; pump(); };
      im.src = src(i);
    }
    // приоритет: кадры рядом с текущим местом, сначала вперёд по ходу прокрутки, потом назад
    function next() {
      var c = Math.round(want);
      for (var d = 0; d < count; d++) {
        var a = c + d, b = c - d;
        if (a < count && !imgs[a]) return a;
        if (d <= 6 && b >= 0 && !imgs[b]) return b;
      }
      for (var k = 0; k < count; k++) if (!imgs[k]) return k;
      return -1;
    }
    function pump() { while (inflight < MAXQ) { var i = next(); if (i < 0) return; load(i); } }
    // кадры начинают грузиться, когда раздел близко (первый экран — сразу), чтобы не мешать друг другу
    var begun = false;
    function begin() { if (begun) return; begun = true; load(0); pump(); }
    function near() { return section.getBoundingClientRect().top < window.innerHeight * 2.5; }
    if (near()) begin();

    function size() {
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      cv.width = Math.round(cv.clientWidth * dpr); cv.height = Math.round(cv.clientHeight * dpr);
      drawn = -1; kick();
    }
    function nearestLoaded(i) {
      if (loaded[i]) return i;
      for (var d = 1; d < count; d++) { if (loaded[i - d]) return i - d; if (loaded[i + d]) return i + d; }
      return -1;
    }
    function draw(i) {
      var im = imgs[i]; if (!im) return;
      var cw = cv.width, ch = cv.height, iw = im.naturalWidth, ih = im.naturalHeight;
      var s = Math.max(cw / iw, ch / ih), w = iw * s, h = ih * s;
      ctx.drawImage(im, (cw - w) / 2, (ch - h) / 2, w, h); drawn = i; cv.dataset.frame = i;
    }
    function tick() {
      raf = 0;
      cur += (want - cur) * 0.25;                 // мягкое «догоняние» — без рывков при резкой прокрутке
      if (Math.abs(want - cur) < 0.05) cur = want;
      var i = nearestLoaded(Math.round(cur));
      if (i >= 0 && i !== drawn) draw(i);
      if (cur !== want || i !== Math.round(want)) raf = requestAnimationFrame(tick);
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
