/* Новости квартала: строитель-репортёр с микрофоном «читает» новости — текст печатается, рот двигается.
   Новости листаются сами (когда раздел на экране) или стрелками. Внизу — бегущая строка. */
(function () {
  'use strict';
  var box = document.getElementById('news'), say = document.getElementById('newsSay'), man = document.getElementById('newsMan');
  if (!box || !say) return;
  var NEWS = [
    '🎁 Скоро акция! Оформите квартиру до Нового года — и получите подарок от «Градосферы».',
    '🥧 Живёте у нас — и самые вкусные осетинские пироги совсем рядом. Горячие, с пылу с жару!',
    '🏗 Строим быстро и сдаём в срок: сдача — I квартал 2028. Покупаете сейчас — заезжаете вовремя.'
  ];
  var dots = document.getElementById('newsDots'), run = document.getElementById('newsRun');
  NEWS.forEach(function (n, i) { var d = document.createElement('i'); d.addEventListener('click', function () { show(i); }); dots.appendChild(d); });
  var line = NEWS.map(function (n) { return '<span>' + n + '</span>'; }).join('');
  run.innerHTML = line + line;   // две копии — бесконечная строка
  var cur = -1, typeT = 0, nextT = 0, visible = false;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function show(i) {
    cur = (i + NEWS.length) % NEWS.length;
    Array.prototype.forEach.call(dots.children, function (d, k) { d.classList.toggle('on', k === cur); });
    clearTimeout(typeT); clearTimeout(nextT);
    var txt = NEWS[cur], k = 0;
    if (reduce) { say.textContent = txt; return; }
    box.classList.add('talking'); say.textContent = '';
    (function type() {
      k += 1; say.textContent = Array.from(txt).slice(0, k).join('');
      if (k < Array.from(txt).length) typeT = setTimeout(type, 34);
      else { box.classList.remove('talking'); if (visible) nextT = setTimeout(function () { show(cur + 1); }, 4200); }
    })();
  }
  box.addEventListener('click', function (e) { var b = e.target.closest('[data-nstep]'); if (b) show(cur + +b.getAttribute('data-nstep')); });
  if (man) man.addEventListener('click', function () { show(cur + 1); });
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        visible = e.isIntersecting;
        if (visible && cur < 0) show(0);
        else if (visible && !box.classList.contains('talking')) { clearTimeout(nextT); nextT = setTimeout(function () { show(cur + 1); }, 3000); }
        else if (!visible) clearTimeout(nextT);
      });
    }, { threshold: 0.35 }).observe(box);
  } else show(0);
})();
