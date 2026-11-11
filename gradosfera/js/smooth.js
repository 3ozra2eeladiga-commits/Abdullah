/* Плавность: на компьютере — мягкая инерционная прокрутка (Lenis), на телефоне — родная прокрутка iOS/Android.
   «Останавливаться там, где нужно»: лифт мягко доводится до ближайшего этажа, когда вы перестали листать. */
(function () {
  'use strict';
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var ST = window.ScrollTrigger, lenis = null;
  if (fine && !reduce && window.Lenis) {
    document.documentElement.style.scrollBehavior = 'auto';
    lenis = new window.Lenis({ duration: 1.15, easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, smoothWheel: true });
    if (window.gsap && ST) { lenis.on('scroll', ST.update); window.gsap.ticker.add(function (time) { lenis.raf(time * 1000); }); window.gsap.ticker.lagSmoothing(0); }
    else { (function raf(t) { lenis.raf(t); requestAnimationFrame(raf); })(); }
    // якорные ссылки меню
    document.addEventListener('click', function (e) {
      var a = e.target.closest('a[href^="#"]'); if (!a) return;
      var id = a.getAttribute('href'); if (id.length < 2) return;
      var el = document.querySelector(id); if (!el) return;
      e.preventDefault(); lenis.scrollTo(el, { offset: -60 });
    });
    // окна (планировки, фото, меню) — прокрутку страницы останавливаем
    new MutationObserver(function () { document.body.classList.contains('lock') ? lenis.stop() : lenis.start(); })
      .observe(document.body, { attributes: true, attributeFilter: ['class'] });
    window.gsLenis = lenis;
  }
  // «блоки»: после остановки прокрутки, если начало раздела рядом (до 28% экрана) — мягко доводим к нему.
  // Внутри разделов-анимаций (видео, фасад, лифт) не вмешиваемся.
  var SNAP = ['#about', '.stats', '#facade', '.arch', '#lift', '#flats', '#life', '#parking', '#boiler', '#safe', '#gallery', '#news', '#terms', '#contacts', '#finale'];
  var snapT = 0, snapping = false, lastY = window.scrollY, touching = false;
  window.addEventListener('touchstart', function () { touching = true; }, { passive: true });
  window.addEventListener('touchend', function () { touching = false; }, { passive: true });
  function inside(sel) {          // мы внутри «закреплённого» раздела (после его начала и до конца)?
    var el = document.querySelector(sel); if (!el) return false;
    var r = el.getBoundingClientRect(); return r.top < -40 && r.bottom > window.innerHeight + 40;
  }
  function trySnap() {
    if (snapping || touching || document.body.classList.contains('lock')) return;
    if (inside('#hero') || inside('#facade') || inside('#lift')) return;
    var vh = window.innerHeight, best = null, bd = 1e9, hdr = 64;
    SNAP.forEach(function (sel) {
      var el = document.querySelector(sel); if (!el) return;
      var d = el.getBoundingClientRect().top - hdr; if (Math.abs(d) < vh * 0.28 && Math.abs(d) > 6 && Math.abs(d) < Math.abs(bd)) { bd = d; best = el; }
    });
    if (!best) return;
    snapping = true;
    var to = window.scrollY + bd;
    if (lenis) lenis.scrollTo(to, { duration: 0.7, onComplete: function () { snapping = false; } });
    else { window.scrollTo({ top: to, behavior: 'smooth' }); setTimeout(function () { snapping = false; }, 800); }
  }
  // на телефоне «блоки» делает сам браузер (CSS scroll-snap) — это плавнее и надёжнее; JS-доводка только на компьютере
  if (!reduce && fine) window.addEventListener('scroll', function () {
    if (snapping) return; clearTimeout(snapT); snapT = setTimeout(trySnap, fine ? 160 : 260);
  }, { passive: true });

  // «блоки» на телефоне: когда при прокрутке начало раздела доходит до шапки — прокрутка останавливается
  // ровно на нём (инерция гасится на полсекунды), дальше листаете к следующему разделу.
  if (!fine && !reduce) {
    var py = window.scrollY, cool = {}, stopping = false, html = document.documentElement, lastStopT = 0;
    // останавливаем только прокрутку пальцем (и её инерцию), а не переходы по меню/ссылкам
    var lastTouch = 0, navT = 0;
    ['touchstart', 'touchmove', 'touchend'].forEach(function (ev) { window.addEventListener(ev, function () { lastTouch = Date.now(); }, { passive: true }); });
    document.addEventListener('click', function (e) { if (e.target.closest('a[href^="#"], [data-close], .gmn')) navT = Date.now(); }, true);
    window.addEventListener('scroll', function () {
      var y = window.scrollY;
      if (stopping || document.body.classList.contains('lock') || Date.now() - lastTouch > 2500 || Date.now() - navT < 2000) { py = y; return; }
      var hdr = 64, now = Date.now();
      if (Math.abs(y - py) > window.innerHeight * 0.7) { py = y; return; }   // прыжок (меню, ссылка) — не останавливаем
      for (var i = 0; i < SNAP.length; i++) {
        var el = document.querySelector(SNAP[i]); if (!el) continue;
        var line = el.getBoundingClientRect().top + y - hdr;
        var crossed = (py < line - 2 && y >= line - 2) || (py > line + 2 && y <= line + 2);
        if (crossed && !(cool[i] > now) && now - lastStopT > 900) {
          cool[i] = now + 2500; stopping = true;
          html.classList.add('gs-stop'); window.scrollTo(0, line);
          lastStopT = now;
          setTimeout(function () { html.classList.remove('gs-stop'); stopping = false; py = window.scrollY; }, 280);   // только гасим инерцию: остановились — и сразу можно листать дальше, сайт не «залипает»
          break;
        }
      }
      py = y;
    }, { passive: true });
  }

  // лифт: мягкая доводка до этажа
  if (ST && document.getElementById('lift') && !reduce) {
    window.addEventListener('load', function () {
      ST.create({ trigger: '#lift', start: 'top top', end: 'bottom bottom',
        snap: { snapTo: [0, 0.06, 0.347, 0.633, 0.92, 1], duration: { min: 0.3, max: 0.8 }, delay: 0.25, ease: 'power2.inOut', inertia: false } });
    });
  }
})();
