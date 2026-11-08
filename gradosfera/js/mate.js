/* Строитель на качелях у кнопки звука — БЕЗ текста, только жестами:
   звук выключен — сидит, скрестив руки, хмурится; время от времени возмущённо тычет пальцем в колонку,
   мотает головой, над головой мигает перечёркнутый динамик, а колонка подсвечивается.
   Звук включён — надевает наушники и качается под музыку. */
(function () {
  'use strict';
  var m = document.getElementById('mate'), btn = document.getElementById('soundBtn');
  if (!m || !btn) return;
  var t = 0, first = 0;
  function hint() { btn.classList.remove('is-hint'); void btn.offsetWidth; btn.classList.add('is-hint'); }
  function demand() {
    if (m.classList.contains('on')) return;
    m.classList.remove('demand'); void m.offsetWidth; m.classList.add('demand'); hint();
    setTimeout(function () { m.classList.remove('demand'); }, 2600);
  }
  function loop() { clearInterval(t); t = setInterval(demand, 11000); }
  var sw = m.querySelector('.swings'); if (sw) { sw.style.pointerEvents = 'auto'; sw.style.cursor = 'pointer'; sw.addEventListener('click', function () { btn.click(); }); }
  window.gsMate = function (on) {
    m.classList.toggle('on', on); m.classList.toggle('grumpy', !on);
    if (on) { clearInterval(t); m.classList.remove('demand'); }
    else { setTimeout(demand, 600); loop(); }
  };
  m.classList.add('grumpy');
  first = setTimeout(demand, 2200);
  loop();
})();
