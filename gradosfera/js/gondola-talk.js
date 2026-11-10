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

/* Тряска: рабочие в люльке иногда просят «Не трясите телефон — упадём!». Тряхнули телефон — правда падают,
   повисают на страховке и забираются обратно. На компьютере «тряска» — быстро подёргать мышкой над люлькой.
   На iPhone Apple требует разрешение на датчик движения — спрашиваем один раз, при касании экрана после предупреждения. */
(function () {
  'use strict';
  var touch = window.matchMedia('(hover: none)').matches;
  var say = document.createElement('div'); say.className = 'gsay'; document.body.appendChild(say);
  var hideT = 0, seen = 0, warned = false, lastWarn = 0;
  function talk(txt, ms) {
    var g = window.gsGond; if (!g) return;
    say.textContent = txt;
    say.style.left = Math.max(10, Math.min(window.innerWidth - 310, (g.x0 + g.x1) / 2 - 150)) + 'px';
    say.style.top = Math.max(70, g.top - 56) + 'px';
    say.classList.remove('on'); void say.offsetWidth; say.classList.add('on');
    clearTimeout(hideT); hideT = setTimeout(function () { say.classList.remove('on'); }, ms || 2600);
  }
  var WARN = touch ? ['Не трясите телефон — упадём! 😨', 'Только не трясите! Мы на высоте 😬'] : ['Не дёргайте мышкой — упадём! 😨', 'Только не трясите! Мы на высоте 😬'];
  var wi = 0;
  setInterval(function () {
    if (!window.gsGond) { seen = 0; return; }
    seen++; var now = Date.now();
    if ((seen === 6 && !warned) || (warned && now - lastWarn > 40000 && seen > 6)) { warned = true; lastWarn = now; talk(WARN[wi++ % WARN.length]); }
  }, 1000);
  function fall() {
    if (!window.gsGondFall || !window.gsGondFall()) return;
    if (navigator.vibrate) try { navigator.vibrate(120); } catch (e) {}
    talk('Аааа! 😱', 1800);
    setTimeout(function () { talk('Фух! Говорили же — не трясите! 😅', 2800); }, 3300);
  }
  // датчик движения (телефон)
  var last = null, hits = [];
  function onMotion(e) {
    var a = e.accelerationIncludingGravity; if (!a || a.x == null) return;
    if (last) {
      var d = Math.abs(a.x - last.x) + Math.abs(a.y - last.y) + Math.abs(a.z - last.z), now = Date.now();
      if (d > 22) { hits.push(now); hits = hits.filter(function (h) { return now - h < 700; }); if (hits.length >= 3) { hits = []; fall(); } }
    }
    last = { x: a.x, y: a.y, z: a.z };
  }
  if (touch && window.DeviceMotionEvent) {
    if (typeof DeviceMotionEvent.requestPermission === 'function') {   // iPhone: разрешение — один раз, после предупреждения
      var asked = false;
      document.addEventListener('touchend', function () {
        if (asked || !warned) return; asked = true;
        DeviceMotionEvent.requestPermission().then(function (r) { if (r === 'granted') window.addEventListener('devicemotion', onMotion); }).catch(function () {});
      }, true);
    } else window.addEventListener('devicemotion', onMotion);
  }
  // компьютер: быстро подёргать мышкой над люлькой
  var px = 0, dir = 0, flips = [];
  document.addEventListener('mousemove', function (e) {
    var g = window.gsGond; if (!g) return;
    if (e.clientX < g.x0 - 60 || e.clientX > g.x1 + 60 || e.clientY < g.top - 80 || e.clientY > g.bottom + 60) { flips = []; return; }
    var nd = e.clientX > px ? 1 : e.clientX < px ? -1 : dir; px = e.clientX;
    if (nd !== dir && dir !== 0) { var now = Date.now(); flips.push(now); flips = flips.filter(function (f) { return now - f < 900; }); if (flips.length >= 6) { flips = []; fall(); } }
    dir = nd;
  }, { passive: true });
})();
