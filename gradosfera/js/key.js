/* Квартира под ключ: линия идёт слева направо, за ней проявляется отделка, загораются слои; в конце — ключ. */
(function () {
  'use strict';
  var box = document.getElementById('key'); if (!box) return;
  var stage = document.getElementById('keyStage'), done = document.getElementById('keyDone'), line = document.getElementById('keyLine');
  var wires = document.getElementById('keyWires'), range = document.getElementById('keyRange');
  var labels = Array.prototype.slice.call(box.querySelectorAll('.kl'));
  var svg = box.querySelector('.key__svg');
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  function render(p) {
    done.style.clipPath = 'inset(0 ' + ((1 - p) * 100) + '% 0 0)';
    // линия в координатах SVG (учитываем обрезку slice): переводим долю ширины экрана в x viewBox
    var r = stage.getBoundingClientRect(), vb = 1600 / 900, sr = r.width / r.height;
    var x = sr > vb ? p * 1600 : (1600 - 900 * sr) / 2 + p * 900 * sr;
    line.setAttribute('x1', x); line.setAttribute('x2', x);
    line.style.opacity = p > 0.003 && p < 0.997 ? 1 : 0;
    wires.style.opacity = p < 0.95 ? 1 : 0;
    document.getElementById('kwRect').setAttribute('x', x);
    labels.forEach(function (l) { l.classList.toggle('is-on', p >= +l.getAttribute('data-at')); });
    var stepEl = document.getElementById('keyStep'), name = 'Бетон';
    labels.forEach(function (l) { if (p >= +l.getAttribute('data-at')) name = l.querySelector('text').textContent; });
    if (stepEl && stepEl.textContent !== name) stepEl.textContent = name;
    box.classList.toggle('done', p > 0.97);
  }
  var cur = 0, goal = 0, raf = 0, touched = false;
  function setGoal(v, user) { goal = clamp(v); if (user && !touched) { touched = true; box.classList.add('touched'); } if (!raf) raf = requestAnimationFrame(tick); }
  function tick() {
    cur += (goal - cur) * 0.16; if (Math.abs(goal - cur) < 0.001) cur = goal;
    render(cur); if (range) { range.value = Math.round(cur * 1000); range.style.setProperty('--p', (cur * 100) + '%'); }
    raf = cur !== goal ? requestAnimationFrame(tick) : 0;
  }
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    stage.addEventListener('mousemove', function (e) { var r = stage.getBoundingClientRect(); setGoal((e.clientX - r.left) / r.width, true); });
  }
  var sx = null, sv = 0;
  stage.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; sv = goal; }, { passive: true });
  stage.addEventListener('touchmove', function (e) { if (sx === null) return; setGoal(sv + (e.touches[0].clientX - sx) / (stage.clientWidth * 0.85), true); }, { passive: true });
  stage.addEventListener('touchend', function () { sx = null; }, { passive: true });
  if (range) range.addEventListener('input', function () { setGoal(range.value / 1000, true); });
  window.addEventListener('resize', function () { render(cur); });
  render(0);
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { setGoal(1); return; }
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (en) {
      if (!en[0].isIntersecting) return; io.disconnect();
      setTimeout(function () { if (!touched) setGoal(0.42); }, 500);
      setTimeout(function () { if (!touched) setGoal(0.15); }, 2800);
    }, { threshold: 0.5 });
    io.observe(stage);
  }
})();
