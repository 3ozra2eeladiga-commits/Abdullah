/* Маленький строитель у кнопки звука: зовёт включить звук; со звуком — сидит в наушниках и качает головой;
   после выключения — недоволен и снова зовёт. */
(function () {
  'use strict';
  var m = document.getElementById('mate'), bub = document.getElementById('mateBubble'), btn = document.getElementById('soundBtn');
  if (!m || !bub || !btn) return;
  var CALL = ['Включите звук — услышите, как оживает дом 🎧', 'Нажмите «Звук» — со звуком стройка интереснее!'];
  var GRUMPY = ['Эй! Верните звук 😤', 'Без звука скучно… Включите обратно!', 'Ну я же слушал! Нажмите «Звук» 🙏'];
  var hideT = 0, nagT = 0, k = 0;
  function say(text, ms) {
    bub.textContent = text; m.classList.remove('quiet');
    clearTimeout(hideT); hideT = setTimeout(function () { m.classList.add('quiet'); }, ms || 7000);
  }
  function nag(list) {
    clearInterval(nagT);
    nagT = setInterval(function () { if (!m.classList.contains('on')) say(list[k++ % list.length], 5000); }, 22000);
  }
  bub.addEventListener('click', function () { btn.click(); });
  window.gsMate = function (on) {
    m.classList.toggle('on', on);
    if (on) { m.classList.remove('grumpy'); clearInterval(nagT); clearTimeout(hideT); m.classList.add('quiet'); }
    else { m.classList.add('grumpy'); say(GRUMPY[k++ % GRUMPY.length], 6000); nag(GRUMPY); }
  };
  setTimeout(function () { say(CALL[0], 8000); }, 1800);
  nag(CALL);
})();
