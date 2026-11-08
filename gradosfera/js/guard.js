/* Защита фото от «Инструментов разработчика».
   Если кто-то открывает панель разработчика (F12, «Исследовать элемент»), экран «взрывается»:
   вспышка, осколки, затем тёмный экран с предупреждением, а все фото и кадры видео на странице
   подменяются пустышками — в панели вместо фото видно пустое место. Закрыл панель — всё вернулось.
   Честно: это отпугивает обычных людей; полностью запретить копирование в браузере невозможно. */
(function () {
  'use strict';
  if (window.matchMedia('(hover: none)').matches) return;          // телефоны и планшеты — панели разработчика нет
  var BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  var open = false, lastDpr = window.devicePixelRatio, base = { w: 0, h: 0 };
  function diff() { return { w: window.outerWidth - window.innerWidth, h: window.outerHeight - window.innerHeight }; }
  base = diff();

  // экран «взрыва»
  var ov = document.createElement('div'); ov.className = 'gd'; ov.setAttribute('aria-hidden', 'true');
  var shards = '';
  for (var i = 0; i < 18; i++) {
    var a = i / 18 * 360, d = 40 + (i * 37) % 50;
    shards += '<i style="--a:' + a + 'deg;--d:' + d + 'vmax;--r:' + ((i * 53) % 360) + 'deg"></i>';
  }
  ov.innerHTML = '<div class="gd__flash"></div><div class="gd__shards">' + shards + '</div>' +
    '<div class="gd__msg"><b>💥 Бум!</b><span>Фото ЖК «Новый Квартал» защищены.<br>Все изображения принадлежат «Градосфера».</span>' +
    '<small>Закройте инструменты разработчика, чтобы продолжить просмотр сайта.</small></div>';
  document.body.appendChild(ov);

  function hide(on) {
    // фото: подменяем адрес на пустышку (в панели разработчика — пусто), при закрытии возвращаем
    document.querySelectorAll('img').forEach(function (im) {
      if (on) { if (!im.dataset.gsrc && im.getAttribute('src') !== BLANK) { im.dataset.gsrc = im.getAttribute('src'); im.setAttribute('src', BLANK); } }
      else if (im.dataset.gsrc) { im.setAttribute('src', im.dataset.gsrc); delete im.dataset.gsrc; }
    });
    // фоновые картинки (style="background-image")
    document.querySelectorAll('[style*="background-image"]').forEach(function (el) {
      if (on) { el.dataset.gbg = el.style.backgroundImage; el.style.backgroundImage = 'none'; }
      else if (el.dataset.gbg !== undefined) { el.style.backgroundImage = el.dataset.gbg; delete el.dataset.gbg; }
    });
    document.documentElement.classList.toggle('gd-on', on);
  }
  function setOpen(v) {
    if (v === open) return; open = v;
    if (v) { ov.classList.remove('boom'); void ov.offsetWidth; ov.classList.add('boom', 'on'); hide(true); }
    else { ov.classList.remove('on', 'boom'); hide(false); }
  }
  var tripped = 0;
  function check() {
    var dpr = window.devicePixelRatio, d = diff();
    if (dpr !== lastDpr) { lastDpr = dpr; base = d; return; }      // это масштаб страницы (Ctrl +/−), а не панель
    setOpen(d.w - base.w > 160 || d.h - base.h > 160 || Date.now() - tripped < 3000);
  }
  // ловушка: пока панель разработчика открыта (в любом виде, даже отдельным окном), браузер останавливается на «debugger» —
  // замечаем паузу и включаем «взрыв». Обычным посетителям это никак не мешает: без панели строка ничего не делает.
  setInterval(function () {
    var t0 = Date.now();
    (function () {}).constructor('debugger')();
    if (Date.now() - t0 > 120) { tripped = Date.now(); check(); }
  }, 800);
  // правая кнопка мыши (меню «Исследовать», «Исходный код», «Сохранить как») — отключена на всём сайте
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, true);
  window.addEventListener('resize', check);
  setInterval(check, 1000);

  // горячие клавиши панели разработчика и «просмотр кода»
  document.addEventListener('keydown', function (e) {
    var k = (e.key || '').toLowerCase(), mod = e.ctrlKey || e.metaKey;
    var devKeys = 'ijckem';   // I J C — Chrome/Яндекс/Edge; K E M — Firefox (консоль, сеть, адаптив)
    if (e.key === 'F12' || (mod && e.shiftKey && devKeys.indexOf(k) >= 0) || (mod && e.altKey && devKeys.indexOf(k) >= 0) || (mod && (k === 'u' || k === 's' || k === 'p'))) {
      e.preventDefault(); e.stopPropagation();
      ov.classList.remove('boom'); void ov.offsetWidth; ov.classList.add('boom', 'on');
      setTimeout(function () { if (!open) ov.classList.remove('on', 'boom'); }, 1900);
    }
  }, true);
})();
