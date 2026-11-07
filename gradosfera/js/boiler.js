/* Котельная дома: прокрутка «поднимает» горячую воду по стоякам на все этажи.
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
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  function render(p) {
    var s1 = p > 0.02, hp = clamp((p - 0.12) / 0.5), wp = clamp((p - 0.62) / 0.33);
    box.classList.toggle('s1', s1); box.classList.toggle('s2', hp > 0); box.classList.toggle('s3', wp > 0);
    heat.forEach(function (el) { var k = el.classList.contains('hflow--main') ? clamp(hp * 4) : clamp(hp * 1.15 - 0.1); el.style.strokeDashoffset = el._L * (1 - k); });
    water.forEach(function (el) { var k = el.classList.contains('wflow--main') ? clamp(wp * 4) : clamp(wp * 1.15 - 0.1); el.style.strokeDashoffset = el._L * (1 - k); });
    var lvl = Math.min(7, Math.floor(hp * 7.6));
    floors.forEach(function (f) { f.classList.toggle('is-on', +f.getAttribute('data-lv') <= lvl); });
    if (floorNum) floorNum.textContent = Math.max(1, lvl + 1);
    var st = !s1 ? 0 : wp > 0 ? 3 : hp > 0 ? 2 : 1;
    steps.forEach(function (li, i) { li.classList.toggle('is-on', i < st); });
  }
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof window.ScrollTrigger === 'undefined') { render(1); return; }
  window.ScrollTrigger.create({ trigger: box, start: 'top 80%', end: 'bottom 55%', onUpdate: function (st) { render(st.progress); } });
  render(0);
})();
