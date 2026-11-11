/* Помощь для телефона:
   1) ползунки (паркинг, котельная) — большая зона для пальца: можно тянуть или нажать в любом месте дорожки;
   2) подсказка «Листайте вниз» с пальцем: в начале сайта, в закреплённых разделах (фасад, лифт) и если листают вбок. */
(function () {
  'use strict';
  var touch = window.matchMedia('(hover: none)').matches || 'ontouchstart' in window;
  if (!touch) return;

  // ---------- 1. ползунки ----------
  Array.prototype.forEach.call(document.querySelectorAll('.boiler__ctl input[type="range"]'), function (inp) {
    var sx = 0, sy = 0, mode = '';
    function setFrom(x) {
      var r = inp.getBoundingClientRect(), pad = 20, k = Math.min(1, Math.max(0, (x - r.left - pad) / (r.width - pad * 2)));
      var min = +inp.min || 0, max = +inp.max || 100;
      inp.value = Math.round(min + (max - min) * k);
      inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true }));
    }
    inp.addEventListener('touchstart', function (e) { var t = e.touches[0]; sx = t.clientX; sy = t.clientY; mode = ''; }, { passive: true });
    inp.addEventListener('touchmove', function (e) {
      var t = e.touches[0], dx = Math.abs(t.clientX - sx), dy = Math.abs(t.clientY - sy);
      if (!mode && (dx > 6 || dy > 6)) mode = dx >= dy ? 'x' : 'y';
      if (mode === 'x') { if (e.cancelable) e.preventDefault(); setFrom(t.clientX); }
    }, { passive: false });
    inp.addEventListener('touchend', function (e) { if (!mode) { var t = e.changedTouches[0]; setFrom(t.clientX); } });   // простое нажатие — ползунок прыгает к пальцу
  });

  // ---------- 2. «Листайте вниз» ----------
  var el = document.createElement('div'); el.className = 'swh'; el.setAttribute('aria-hidden', 'true');
  el.innerHTML = '<span class="swh__track"><i class="swh__trail"></i><i class="swh__finger">👆</i></span><b class="swh__txt"></b>';
  document.body.appendChild(el);
  var txt = el.querySelector('.swh__txt'), hideT = 0, y0 = 0, on = false;
  function show(t, ms) {
    if (document.body.classList.contains('lock')) return;
    txt.textContent = t; el.classList.add('on'); on = true; y0 = window.scrollY;
    clearTimeout(hideT); hideT = setTimeout(hide, ms || 5000);
  }
  function hide() { el.classList.remove('on'); on = false; }
  // в начале сайта
  setTimeout(function () { if (window.scrollY < 40) show('Листайте вниз', 7000); }, 1400);
  // закреплённые разделы: один раз в каждом, если остановились в самом начале
  var PINS = [['#facade', 'Листайте вниз — фасад раскроется'], ['#lift', 'Листайте вниз — лифт поедет']], seen = {}, idleT = 0;
  function pinCheck() {
    PINS.forEach(function (p, i) {
      if (seen[i]) return;
      var s = document.querySelector(p[0]); if (!s) return;
      var r = s.getBoundingClientRect(), vh = window.innerHeight;
      if (r.top <= 70 && r.top > -vh * 0.5 && r.bottom > vh) { seen[i] = true; show(p[1], 5000); }
    });
  }
  window.addEventListener('scroll', function () {
    if (on && Math.abs(window.scrollY - y0) > 60) hide();
    clearTimeout(idleT); idleT = setTimeout(pinCheck, 900);
  }, { passive: true });
  // листают вбок там, где листать нужно вниз
  var tx = 0, ty = 0, lastSide = 0;
  document.addEventListener('touchstart', function (e) { var t = e.touches[0]; tx = t.clientX; ty = t.clientY; }, { passive: true });
  document.addEventListener('touchend', function (e) {
    var t = e.changedTouches[0], dx = Math.abs(t.clientX - tx), dy = Math.abs(t.clientY - ty);
    if (dx < 60 || dx < dy * 2 || Date.now() - lastSide < 8000) return;
    if (e.target.closest && e.target.closest('.ftypes, .desk, input, .fwin, .menu, .cbx, .lb, [data-lenis-prevent]')) return;   // тут вбок — правильно
    lastSide = Date.now(); show('Листайте вниз, не в сторону', 4500);
  }, { passive: true });
})();
