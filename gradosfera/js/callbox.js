/* На компьютере ссылки «Позвонить» (tel:) открывают непонятное системное окно.
   Поэтому на компьютере вместо звонка показываем аккуратное окно с контактами: номер, «скопировать», адрес и часы. На телефоне — обычный звонок. */
(function () {
  'use strict';
  if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  var box = document.createElement('div'); box.className = 'cbx'; box.setAttribute('role', 'dialog'); box.setAttribute('aria-modal', 'true'); box.setAttribute('aria-label', 'Контакты');
  box.innerHTML = '<div class="cbx__card">' +
    '<button class="cbx__x" type="button" aria-label="Закрыть">×</button>' +
    '<span class="cbx__tag">Отдел продаж ЖК «Новый Квартал»</span>' +
    '<a class="cbx__phone" href="tel:+79388153333">+7 (938) 815-33-33</a>' +
    '<button class="cbx__copy" type="button">Скопировать номер</button>' +
    '<div class="cbx__rows">' +
      '<div><span>Офис продаж</span><b>Моздок, ул. Кирова, 41<br>деловой центр, кабинет 117</b></div>' +
      '<div><span>Режим работы</span><b>пн–сб 10:00–17:00<br>вс — выходной</b></div>' +
    '</div>' +
    '<a class="cbx__map" target="_blank" rel="noopener" href="https://yandex.ru/maps/?text=%D0%9C%D0%BE%D0%B7%D0%B4%D0%BE%D0%BA%2C%20%D1%83%D0%BB.%20%D0%9A%D0%B8%D1%80%D0%BE%D0%B2%D0%B0%2C%2041">Офис продаж на карте →</a>' +
    '</div>';
  document.body.appendChild(box);
  var copyBtn = box.querySelector('.cbx__copy');
  function open() { box.classList.add('on'); document.body.classList.add('lock'); copyBtn.textContent = 'Скопировать номер'; }
  function close() { box.classList.remove('on'); document.body.classList.remove('lock'); }
  document.addEventListener('click', function (e) {
    var a = e.target.closest('a[href^="tel:"]');
    if (a && !box.contains(a)) { e.preventDefault(); open(); return; }
    if (e.target === box || e.target.closest('.cbx__x')) close();
  }, true);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && box.classList.contains('on')) close(); });
  copyBtn.addEventListener('click', function () {
    var t = '+7 (938) 815-33-33';
    var done = function () { copyBtn.textContent = 'Номер скопирован ✓'; };
    if (navigator.clipboard) navigator.clipboard.writeText(t).then(done, done); else done();
  });
})();
