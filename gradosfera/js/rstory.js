/* «Вечер на крыше»: маленькая история вместо одной фотографии. Три кадра с одной точки (день → закат → вечер)
   и переписка двух соседей поверх. Листается прокруткой: карточка поднимается по экрану — меняются кадр и сообщения; нажатие — следующий шаг. */
(function () {
  'use strict';
  var box = document.getElementById('rstory'); if (!box) return;
  var imgs = box.querySelectorAll('img'), chat = document.getElementById('rstoryChat'), time = document.getElementById('rstoryTime');
  var dots = document.getElementById('rstoryDots').children;
  var STEPS = [
    { t: '16:40', msg: [['a', 'Скучно… Может, поднимемся на крышу? 🙂']] },
    { t: '18:25', msg: [['b', 'Давай! Встретим закат 🌇'], ['a', 'Чай уже несу ☕']] },
    { t: '19:50', msg: [['b', 'О, и соседи наши тут! 👋'], ['a', 'Лучший вечер — у нас на крыше ✨']] }
  ];
  var cur = -1, T = [], raf = 0;
  function clear() { T.forEach(clearTimeout); T = []; }
  function show(i) {
    i = Math.max(0, Math.min(STEPS.length - 1, i)); if (i === cur) return;
    clear(); cur = i;
    var s = STEPS[cur];
    for (var k = 0; k < imgs.length; k++) { imgs[k].classList.toggle('on', k === cur); dots[k].classList.toggle('on', k === cur); }
    time.textContent = s.t; chat.innerHTML = '';
    s.msg.forEach(function (m, n) {
      var b = document.createElement('span'); b.className = 'rstory__msg rstory__msg--' + m[0]; b.textContent = m[1]; chat.appendChild(b);
      T.push(setTimeout(function () { b.classList.add('on'); }, 250 + n * 900));
    });
  }
  // история идёт от прокрутки: карточка поднимается по экрану — день → закат → вечер (и обратно, если листать вверх)
  function onScroll() {
    raf = 0;
    var r = box.getBoundingClientRect(), vh = window.innerHeight;
    if (r.bottom < 0 || r.top > vh) return;
    var p = 1 - (r.top + r.height / 2) / vh;   // 0 — карточка внизу экрана, 1 — вверху
    show(p < 0.4 ? 0 : p < 0.58 ? 1 : 2);
  }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(onScroll); }, { passive: true });
  window.addEventListener('resize', onScroll);
  // нажатие тоже листает (по кругу)
  box.addEventListener('click', function () { var n = (cur + 1) % STEPS.length; show(n); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show((cur + 1) % STEPS.length); } });
  show(0); onScroll();
})();
