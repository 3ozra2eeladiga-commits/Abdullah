/* Рабочие в люльке справа: нажми на них — подпрыгивают и отвечают:
   «Не отвлекайте — сдаём дом в I кв. 2028!» и т.п. (только компьютер: на телефоне люльки нет) */
(function () {
  'use strict';
  var say = document.createElement('div'); say.className = 'gsay'; document.body.appendChild(say);
  var L = ['Не отвлекайте — сдаём дом в I кв. 2028! 💪', 'Дайте работать — у нас сроки ⏱', 'Каждый этаж — на совесть! 🏗', 'Работаем — скоро ваш дом будет готов к сдаче 😉', 'Вопросы — в офис продаж, мы строим! 📞'];
  var k = 0, hideT = 0;
  var cool = 0;
  function poke(e) {
    var g = window.gsGond; if (!g) return;
    if (Date.now() < cool) return;
    if (e.clientX < g.x0 - 12 || e.clientX > g.x1 + 12 || e.clientY < g.top - 12 || e.clientY > g.bottom + 12) return;
    if (e.target.closest('a, button')) return;
    cool = Date.now() + 3000;   // одна реакция на 3 секунды, без повторов
    if (window.gsGondPoke) window.gsGondPoke();
    say.textContent = L[k++ % L.length];
    say.style.left = Math.max(10, Math.min(window.innerWidth - 300, (g.x0 + g.x1) / 2 - 150)) + 'px';
    say.style.top = Math.max(70, g.top - 56) + 'px';
    say.classList.remove('on'); void say.offsetWidth; say.classList.add('on');
    clearTimeout(hideT); hideT = setTimeout(function () { say.classList.remove('on'); }, 2500);
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

/* Быстрая прокрутка: рабочие в люльке иногда просят «Не листайте так быстро — упадём!».
   Пролистали резко — правда падают, повисают на страховке и забираются обратно.
   Говорят и падают ТОЛЬКО когда люльку видно (в конце сайта, где она спрятана, — молчат). */
(function () {
  'use strict';
  var say = document.createElement('div'); say.className = 'gsay'; document.body.appendChild(say);
  say.style.width = 'auto'; say.style.maxWidth = '300px';
  var hideT = 0, seen = 0, warned = false, lastWarn = 0;
  function visible() { return !!window.gsGond && !document.body.classList.contains('at-end') && !document.body.classList.contains('lock'); }
  function talk(txt, ms) {
    var g = window.gsGond; if (!g || !visible()) return;
    say.textContent = txt;
    say.style.top = Math.max(70, g.top - 56) + 'px';
    say.classList.remove('on'); void say.offsetWidth; say.classList.add('on');
    say.style.left = Math.max(10, Math.min(window.innerWidth - say.offsetWidth - 10, (g.x0 + g.x1) / 2 - say.offsetWidth / 2)) + 'px';
    clearTimeout(hideT); hideT = setTimeout(function () { say.classList.remove('on'); }, ms || 2600);
  }
  // если люлька спряталась — облачко сразу убираем
  setInterval(function () { if (!visible()) say.classList.remove('on'); }, 300);
  var WARN = ['Не листайте так быстро — упадём! 😨', 'Потише, пожалуйста! Мы на высоте 😬'], wi = 0;
  setInterval(function () {
    if (!visible()) { seen = 0; return; }
    seen++; var now = Date.now();
    if ((seen === 5 && !warned) || (warned && now - lastWarn > 40000 && seen > 5)) { warned = true; lastWarn = now; talk(WARN[wi++ % WARN.length]); }
  }, 1000);
  function fall() {
    if (!visible() || !window.gsGondFall || !window.gsGondFall()) return;
    if (navigator.vibrate) try { navigator.vibrate(100); } catch (e) {}
    talk('Аааа! 😱', 1800);
    setTimeout(function () { talk('Фух! Говорили же — не так быстро! 😅', 2800); }, 3300);
  }
  // скорость прокрутки: резкий рывок (пальцем или колёсиком) — падают; переходы по меню не считаются
  var smp = [], navT = 0;
  document.addEventListener('click', function (e) { if (e.target.closest('a[href^="#"]')) navT = Date.now(); }, true);
  var LIM = window.matchMedia('(hover: none)').matches ? 3.5 : 2.8;   // пикселей в миллисекунду (средняя скорость за ~0,1–0,3 с)
  window.addEventListener('scroll', function () {
    var y = window.scrollY, t = performance.now();
    if (!visible() || Date.now() - navT < 2500 || y <= 0 || y + window.innerHeight >= document.documentElement.scrollHeight - 2) { smp = []; return; }
    smp.push([t, y]); while (smp.length && t - smp[0][0] > 300) smp.shift();
    var span = t - smp[0][0], dist = Math.abs(y - smp[0][1]);
    if (span >= 60 && dist < window.innerHeight * 2.5 && dist / span > LIM) { smp = []; fall(); }
  }, { passive: true });
})();
