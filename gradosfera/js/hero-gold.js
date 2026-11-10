/* Главное видео: пока на экране рисунок дома, золотые линии архитектора сами дорисовываются
   (размерные линии, этажи 1–8, заметки), а когда рисунок становится настоящим домом — растворяются. */
(function () {
  'use strict';
  var hero = document.getElementById('hero'), svg = document.getElementById('heroGold'); if (!hero || !svg) return;
  var paths = Array.prototype.slice.call(svg.querySelectorAll('.hg')), texts = Array.prototype.slice.call(svg.querySelectorAll('.hg-t text'));
  paths.forEach(function (p) { var L = p.getTotalLength(); p.style.strokeDasharray = L; p.style.strokeDashoffset = L; p._L = L; });
  var raf = 0;
  function upd() {
    raf = 0;
    var len = hero.offsetHeight - window.innerHeight, p = len > 0 ? Math.min(1, Math.max(0, window.scrollY / len)) : 0;
    var draw = Math.min(1, p / 0.22);                       // 0–22% прокрутки: линии рисуются
    var fade = 1 - Math.min(1, Math.max(0, (p - 0.26) / 0.1));   // 26–36%: растворяются (рисунок стал домом)
    paths.forEach(function (el, i) { var k = Math.min(1, Math.max(0, draw * paths.length - i * 0.6) / 1.4); el.style.strokeDashoffset = el._L * (1 - k); });
    texts.forEach(function (t, i) { t.style.opacity = Math.min(1, Math.max(0, draw * 1.6 - i * 0.07)); });
    svg.style.opacity = fade;
  }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(upd); }, { passive: true });
  upd();
})();
