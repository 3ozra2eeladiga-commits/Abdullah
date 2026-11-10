/* Прораб в параде техники внизу: стоит и подгоняет — короткие фразы в маленьком облачке, редко и ненадолго. */
(function () {
  'use strict';
  var say = document.getElementById('paradeSay'), boss = document.getElementById('paradeBoss'); if (!say || !boss) return;
  var P = ['Давайте, ребята, быстрее! 💪', 'Люди на нас полагаются!', 'Каждый день — по графику!', 'Сдаём в срок — I кв. 2028!', 'Молодцы! Не сбавляем темп!', 'Кирпич к кирпичу — красота! 🧱'];
  var i = 0, vis = false, t = 0;
  function loop() {
    clearTimeout(t); if (!vis) return;
    say.textContent = P[i++ % P.length]; boss.classList.add('talk');
    t = setTimeout(function () { boss.classList.remove('talk'); t = setTimeout(loop, 5200); }, 3400);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) { vis = es[0].isIntersecting; if (vis) { clearTimeout(t); t = setTimeout(loop, 900); } else { clearTimeout(t); boss.classList.remove('talk'); } }).observe(boss);
  else { vis = true; loop(); }
})();
