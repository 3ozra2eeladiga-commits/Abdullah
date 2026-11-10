/* «Вечер на крыше»: маленькая история вместо одной фотографии. Три кадра с одной точки (день → закат → вечер)
   и переписка двух соседей поверх. Идёт сама, когда карточка на экране; нажатие — следующий шаг. */
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
  var cur = -1, visible = false, T = [];
  function clear() { T.forEach(clearTimeout); T = []; }
  function show(i) {
    clear(); cur = (i + STEPS.length) % STEPS.length;
    var s = STEPS[cur];
    for (var k = 0; k < imgs.length; k++) { imgs[k].classList.toggle('on', k === cur); dots[k].classList.toggle('on', k === cur); }
    time.textContent = s.t; chat.innerHTML = '';
    s.msg.forEach(function (m, n) {
      var b = document.createElement('span'); b.className = 'rstory__msg rstory__msg--' + m[0]; b.textContent = m[1]; chat.appendChild(b);
      T.push(setTimeout(function () { b.classList.add('on'); }, 700 + n * 1500));
    });
    if (visible) T.push(setTimeout(function () { show(cur + 1); }, 2400 + s.msg.length * 1900));
  }
  box.addEventListener('click', function () { show(cur + 1); });
  box.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(cur + 1); } });
  if ('IntersectionObserver' in window) new IntersectionObserver(function (es) {
    visible = es[0].isIntersecting;
    if (visible) show(cur < 0 ? 0 : cur); else clear();
  }, { threshold: 0.5 }).observe(box);
  else { visible = true; show(0); }
})();
