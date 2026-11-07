/* Подземный паркинг: палец/мышка/ползунок ведут сценку
   0–40% — машина едет с улицы по рампе к месту; 40–55% — паркуется, человек идёт к лифту; 55–100% — лифт поднимает на 8 этаж. */
(function () {
  'use strict';
  var box = document.getElementById('parking'); if (!box) return;
  var car = document.getElementById('pkCar'), path = document.getElementById('pkPath'), cab = document.getElementById('pkCab');
  var man = document.getElementById('pkMan'), floor = document.getElementById('pkFloor'), range = document.getElementById('pkRange');
  var stops = Array.prototype.slice.call(box.querySelectorAll('.pk-stop'));
  var steps = Array.prototype.slice.call(box.querySelectorAll('.boiler__steps li'));
  var L = path.getTotalLength();
  var FLOORS = [795, 697, 599, 501, 403, 305, 207, 118], PARK_Y = 1150, SX = 1240;
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  var ease = function (t) { return t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };
  function render(p) {
    var drive = ease(clamp(p / 0.4)), walk = clamp((p - 0.42) / 0.13), lift = ease(clamp((p - 0.55) / 0.45));
    var d = drive * L, pt = path.getPointAtLength(d), pt2 = path.getPointAtLength(Math.min(L, d + 2));
    var ang = Math.atan2(pt2.y - pt.y, pt2.x - pt.x) * 180 / Math.PI;
    car.setAttribute('transform', 'translate(' + pt.x + ' ' + pt.y + ') rotate(' + (drive >= 1 ? 0 : ang) + ')');
    // человек: от машины к лифту
    man.style.opacity = walk > 0 && lift === 0 ? 1 : 0;
    man.setAttribute('transform', 'translate(' + (960 + (SX - 960) * walk) + ' ' + PARK_Y + ')');
    // лифт: от паркинга (PARK_Y) до 8 этажа
    var targetY = FLOORS[FLOORS.length - 1];
    var dy = (targetY - (PARK_Y - 34)) * lift;
    cab.setAttribute('transform', 'translate(0 ' + dy + ')');
    var cabY = PARK_Y - 34 + dy, lvl = 0;
    FLOORS.forEach(function (y, i) { if (cabY <= y + 4) lvl = i + 1; });
    stops.forEach(function (s) { s.classList.toggle('is-on', +s.getAttribute('data-lv') <= lvl); });
    if (floor) floor.textContent = lift > 0.02 && lvl > 0 ? lvl : '−1';
    var st = p < 0.02 ? 0 : lift > 0 ? 3 : walk > 0 || drive >= 1 ? 2 : 1;
    box.classList.toggle('s1', st >= 1); box.classList.toggle('s2', st >= 2); box.classList.toggle('s3', st >= 3);
    steps.forEach(function (li, i) { li.classList.toggle('is-on', i < st); });
    Array.prototype.forEach.call(box.querySelectorAll('.xlbl'), function (g) { g.style.opacity = +g.getAttribute('data-s') === st ? 1 : 0; });
  }
  var scheme = box.querySelector('.boiler__scheme');
  var cur = 0, goal = 0, raf = 0, touched = false;
  function setGoal(v, user) { goal = clamp(v); if (user && !touched) { touched = true; box.classList.add('touched'); } if (!raf) raf = requestAnimationFrame(tick); }
  function tick() {
    cur += (goal - cur) * 0.14; if (Math.abs(goal - cur) < 0.001) cur = goal;
    render(cur); if (range) { range.value = Math.round(cur * 1000); range.style.setProperty('--p', (cur * 100) + '%'); }
    raf = cur !== goal ? requestAnimationFrame(tick) : 0;
  }
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    scheme.addEventListener('mousemove', function (e) { var r = scheme.getBoundingClientRect(); setGoal((e.clientX - r.left) / r.width, true); });
  }
  var sx = null, sv = 0;
  scheme.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sv = goal; }, { passive: true });
  scheme.addEventListener('touchmove', function (e) { if (sx === null) return; setGoal(sv + (e.touches[0].clientX - sx) / (scheme.clientWidth * 0.85), true); }, { passive: true });
  scheme.addEventListener('touchend', function () { sx = null; }, { passive: true });
  if (range) range.addEventListener('input', function () { setGoal(range.value / 1000, true); });
  render(0);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setGoal(1); return; }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return; io.disconnect();
      setTimeout(function () { if (!touched) setGoal(0.38); }, 400);
      setTimeout(function () { if (!touched) setGoal(0.1); }, 3200);
    }, { threshold: 0.5 });
    io.observe(scheme);
  }
})();
