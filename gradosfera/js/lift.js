/* Лифт сквозь дом: листаешь вниз — кабина едет вверх. 0–8% двери открываются; 8–90% подъём с остановками; 90–100% крыша. */
(function () {
  'use strict';
  var box = document.getElementById('lift'); if (!box) return;
  var strip = document.getElementById('liftStrip'), doors = document.querySelectorAll('#liftDoors i');
  var floor = document.getElementById('liftFloor'), btns = Array.prototype.slice.call(document.querySelectorAll('#liftBtns li'));
  var N = 4, LABELS = ['−1', '1', '2–7', '8'];
  var cur = 0, want = 0, raf = 0, lastY = 0, lastStop = -1;
  var infos = Array.prototype.slice.call(document.querySelectorAll('.lift__info'));
  var clamp = function (v) { return v < 0 ? 0 : v > 1 ? 1 : v; };
  // плавные остановки: на каждом этаже лифт чуть «задерживается»
  function travel(t) { var x = t * (N - 1), k = Math.floor(x), f = x - k; if (k >= N - 1) return N - 1; f = f < .3 ? 0 : (f - .3) / .7; var e = f < .5 ? 4 * f * f * f : 1 - Math.pow(-2 * f + 2, 3) / 2; return k + e; }
  function render(p) {
    var d = clamp(p / 0.08);
    doors[0].style.transform = 'translateX(' + (-d * 100) + '%)';
    doors[1].style.transform = 'translateX(' + (d * 100) + '%)';
    var pos = travel(clamp((p - 0.06) / 0.86));           // 0 … N-1
    strip.style.transform = 'translateY(' + (pos / N * 100) + '%)';
    var idx = Math.round(pos);
    if (floor.textContent !== LABELS[idx]) floor.textContent = LABELS[idx];
    btns.forEach(function (b) { b.classList.toggle('is-on', +b.getAttribute('data-i') === idx); });
    box.classList.toggle('moving', p > 0.08 && p < 0.9 && Math.abs(pos - idx) > 0.04);
    box.classList.toggle('arrived', p >= 0.9);
    var stopped = Math.abs(pos - idx) < 0.04 && p > 0.07;   // лифт стоит на этаже
    infos.forEach(function (el) { el.classList.toggle('is-on', stopped && +el.getAttribute('data-i') === idx); });
    if (stopped && idx !== lastStop) { lastStop = idx; if (window.gsDing) window.gsDing(); }
    if (!stopped && Math.abs(pos - idx) > 0.3) lastStop = -1;
    box.classList.toggle('started', p > 0.1);
  }
  function tick() { raf = 0; cur += (want - cur) * 0.22; if (Math.abs(want - cur) < 0.0005) cur = want; render(cur); if (cur !== want) raf = requestAnimationFrame(tick); }
  function onScroll() {
    var r = box.getBoundingClientRect(), len = box.offsetHeight - window.innerHeight;
    want = len > 0 ? clamp(-r.top / len) : 0; if (!raf) raf = requestAnimationFrame(tick);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll);
  render(0); onScroll();
})();
