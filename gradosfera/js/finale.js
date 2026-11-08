/* Финал сайта: ночной силуэт дома, окна загораются одно за другим, пока листаете до самого конца.
   Когда горит весь дом — «Одно из этих окон — ваше» и кнопка «Позвонить». */
(function () {
  'use strict';
  var sec = document.getElementById('finale'); if (!sec) return;
  var wins = Array.prototype.slice.call(sec.querySelectorAll('.fin__w')), n = document.getElementById('finN');
  // случайный, но постоянный порядок загорания
  var order = wins.map(function (w, i) { return i; }), s = 7;
  for (var i = order.length - 1; i > 0; i--) { s = (s * 9301 + 49297) % 233280; var j = Math.floor(s / 233280 * (i + 1)); var t = order[i]; order[i] = order[j]; order[j] = t; }
  var lit = -1, raf = 0;
  function upd() {
    raf = 0;
    var r = sec.getBoundingClientRect(), vh = window.innerHeight;
    document.body.classList.toggle('at-end', r.top < vh * 0.9);
    var ft = document.querySelector('.ftr'); if (ft) ft.classList.toggle('lit', ft.getBoundingClientRect().top < vh);   // внизу сайта плашка «Этаж/Сдача» прячется — не перекрывает подвал
    var y = window.scrollY, max = document.documentElement.scrollHeight - vh;
    var startY = y + r.top - vh * 0.9;                 // начало: раздел показался снизу
    var endY = Math.min(max, y + r.bottom - vh);       // конец: раздел целиком на экране
    var p = endY > startY ? (y - startY) / (endY - startY) : 1;
    p = Math.max(0, Math.min(1, p));
    var k = Math.round(p * wins.length);
    if (k === lit) return; lit = k;
    for (var q = 0; q < wins.length; q++) wins[order[q]].classList.toggle('on', q < k);
    if (n) n.textContent = k;
    sec.classList.toggle('all', k >= wins.length);
  }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  window.addEventListener('resize', upd); upd();
})();
