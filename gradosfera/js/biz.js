/* Коммерция: вывеска над входом меняется, пока листаете страницу — «здесь может быть ваше дело». Без чужих брендов. */
(function () {
  'use strict';
  var box = document.getElementById('biz'), sign = document.getElementById('bizSign'), word = document.getElementById('bizWord');
  if (!box || !sign) return;
  var L = [['КОФЕЙНЯ', 'ваша кофейня'], ['РЕСТОРАН', 'ваш ресторан'], ['ПРОДУКТЫ', 'ваш продуктовый магазин'], ['ПУНКТ ВЫДАЧИ', 'ваш пункт выдачи заказов'],
           ['ЦВЕТЫ', 'ваш цветочный магазин'], ['САЛОН КРАСОТЫ', 'ваш салон красоты'], ['ВАШЕ ДЕЛО', 'ваше дело']];
  var cur = 0, raf = 0, tap = 0;
  function set(i) {
    i = Math.max(0, Math.min(L.length - 1, i)); if (i === cur) return; cur = i;
    sign.classList.remove('flick'); void sign.offsetWidth; sign.classList.add('flick');
    setTimeout(function () { sign.textContent = L[i][0]; box.classList.toggle('final', i === L.length - 1); }, 180);
    if (word) { word.classList.remove('flick'); void word.offsetWidth; word.classList.add('flick'); setTimeout(function () { word.textContent = L[i][1]; }, 180); }
  }
  function fit() { box.style.setProperty('--w', box.clientWidth + 'px'); }
  function onScroll() {
    raf = 0; if (Date.now() - tap < 2500) return;
    var r = box.getBoundingClientRect(), vh = window.innerHeight;
    // от появления фото снизу до его ухода за верх экрана — проходим все вывески
    var p = (vh - r.top) / (vh + r.height * 0.35);
    if (p < 0 || p > 1.2) return;
    set(Math.floor(Math.min(0.999, p / 0.92) * L.length));
  }
  box.addEventListener('click', function () { tap = Date.now(); set((cur + 1) % L.length); });
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
  window.addEventListener('resize', fit); fit();
})();
