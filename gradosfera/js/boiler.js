/* Котельная дома: мышка влево-вправо / палец по фото / ползунок «поднимают» горячую воду по стоякам на все этажи.
   0–12% — загорается котельная; 12–62% — отопление по этажам; 62–95% — горячая вода. */
(function () {
  'use strict';
  var box = document.getElementById('boiler');
  if (!box) return;
  var steps = Array.prototype.slice.call(box.querySelectorAll('.boiler__steps li'));
  var heat = Array.prototype.slice.call(box.querySelectorAll('.hflow'));
  var water = Array.prototype.slice.call(box.querySelectorAll('.wflow'));
  var floors = Array.prototype.slice.call(box.querySelectorAll('.fl, .branch'));
  var floorNum = document.getElementById('boilerFloor');
  function prep(list) { list.forEach(function (p) { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p._L = L; }); }
  prep(heat); prep(water);
  var lastHW = 0;
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  function render(p) {
    var s1 = p > 0.02, hp = clamp((p - 0.12) / 0.5), wp = clamp((p - 0.62) / 0.33);
    var hw = hp + wp, dhw = Math.abs(hw - lastHW); lastHW = hw;
    if (window.gsSfx && dhw > 0.0005 && hw > 0 && hw < 2) window.gsSfx.water(dhw * 40);
    box.classList.toggle('s1', s1); box.classList.toggle('s2', hp > 0); box.classList.toggle('s3', wp > 0);
    heat.forEach(function (el) { var k = el.classList.contains('hflow--main') ? clamp(hp * 4) : clamp(hp * 1.15 - 0.1); el.style.strokeDashoffset = el._L * (1 - k); });
    water.forEach(function (el) { var k = el.classList.contains('wflow--main') ? clamp(wp * 4) : clamp(wp * 1.15 - 0.1); el.style.strokeDashoffset = el._L * (1 - k); });
    var lvl = Math.min(7, Math.floor(hp * 7.6));
    floors.forEach(function (f) { f.classList.toggle('is-on', +f.getAttribute('data-lv') <= lvl); });
    if (floorNum) floorNum.textContent = Math.max(1, lvl + 1);
    var st = !s1 ? 0 : wp > 0 ? 3 : hp > 0 ? 2 : 1;
    steps.forEach(function (li, i) { li.classList.toggle('is-on', i < st); });
  }
  // управление: мышка влево-вправо над фото (компьютер), палец по фото (телефон), ползунок под фото
  var scheme = box.querySelector('.boiler__scheme'), range = document.getElementById('boilerRange');
  var cur = 0, goal = 0, raf = 0, touched = false;
  function setGoal(v, user) {
    goal = clamp(v);
    if (user && !touched) { touched = true; box.classList.add('touched'); }
    if (!raf) raf = requestAnimationFrame(tick);
  }
  function tick() {
    cur += (goal - cur) * 0.18;
    if (Math.abs(goal - cur) < 0.001) cur = goal;
    render(cur);
    if (range) { range.value = Math.round(cur * 1000); range.style.setProperty('--p', (cur * 100) + '%'); }
    raf = cur !== goal ? requestAnimationFrame(tick) : 0;
  }
  var fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  if (fine) {
    scheme.addEventListener('mousemove', function (e) { var r = scheme.getBoundingClientRect(); setGoal((e.clientX - r.left) / r.width, true); });
  }
  var sx = null, sv = 0;
  scheme.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sv = goal; }, { passive: true });
  scheme.addEventListener('touchmove', function (e) {
    if (sx === null) return;
    var dx = e.touches[0].clientX - sx;
    setGoal(sv + dx / (scheme.clientWidth * 0.85), true);
  }, { passive: true });
  scheme.addEventListener('touchend', function () { sx = null; }, { passive: true });
  if (range) range.addEventListener('input', function () { setGoal(range.value / 1000, true); });

  // при первом появлении — короткая подсказка: вода сама чуть поднимается и опускается
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  render(0);
  if (reduce) { setGoal(1); return; }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return; io.disconnect();
      setTimeout(function () { if (!touched) setGoal(0.45); }, 400);
      setTimeout(function () { if (!touched) setGoal(0.12); }, 2600);
    }, { threshold: 0.5 });
    io.observe(scheme);
  }
})();
