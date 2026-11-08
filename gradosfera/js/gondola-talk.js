/* Рабочие в люльке справа: нажми на них — подпрыгивают и отвечают:
   «Не отвлекайте — сдаём дом в I кв. 2028!» и т.п. (только компьютер: на телефоне люльки нет) */
(function () {
  'use strict';
  var say = document.createElement('div'); say.className = 'gsay'; document.body.appendChild(say);
  var L = ['Не отвлекайте — сдаём дом в I кв. 2028! 💪', 'Дайте работать — у нас сроки ⏱', 'Каждый этаж — на совесть! 🏗', 'Работаем — скоро ваш дом будет готов к сдаче 😉', 'Вопросы — в офис продаж, мы строим! 📞'];
  var k = 0, hideT = 0;
  function poke(e) {
    var g = window.gsGond; if (!g) return;
    if (e.clientX < g.x0 - 12 || e.clientX > g.x1 + 12 || e.clientY < g.top - 12 || e.clientY > g.bottom + 12) return;
    if (e.target.closest('a, button')) return;
    if (window.gsGondPoke) window.gsGondPoke();
    say.textContent = L[k++ % L.length];
    say.style.left = Math.max(10, Math.min(window.innerWidth - 300, (g.x0 + g.x1) / 2 - 150)) + 'px';
    say.style.top = Math.max(70, g.top - 56) + 'px';
    say.classList.remove('on'); void say.offsetWidth; say.classList.add('on');
    clearTimeout(hideT); hideT = setTimeout(function () { say.classList.remove('on'); }, 2600);
  }
  // и мышь, и палец; ловим заранее (capture), чтобы другие обработчики не помешали
  var lastT = 0;
  document.addEventListener('pointerup', function (e) { if (Date.now() - lastT < 400) return; lastT = Date.now(); poke(e); }, true);
  // курсор-«рука» над люлькой
  document.addEventListener('mousemove', function (e) {
    var g = window.gsGond, over = g && e.clientX >= g.x0 && e.clientX <= g.x1 && e.clientY >= g.top && e.clientY <= g.bottom;
    document.documentElement.classList.toggle('over-gond', !!over);
  }, { passive: true });
})();
