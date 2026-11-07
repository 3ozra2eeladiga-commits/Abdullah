/* Офис продаж «живьём»: в рабочее время (пн–сб 10:00–17:00 по Москве) команда сидит и печатает —
   «Сейчас работаем, звоните»; в нерабочее время и в воскресенье — отдыхают: ноги на столе, кофе, Zzz. */
(function () {
  'use strict';
  var box = document.getElementById('team'), t = document.getElementById('teamTitle'), s = document.getElementById('teamSub');
  if (!box) return;
  var DAYS = { 'пн': 1, 'вт': 2, 'ср': 3, 'чт': 4, 'пт': 5, 'сб': 6, 'вс': 0 };
  function now() {
    try {
      var p = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', weekday: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(new Date());
      var o = {}; p.forEach(function (x) { o[x.type] = x.value; });
      return { d: DAYS[(o.weekday || '').toLowerCase().replace('.', '')], m: (+o.hour % 24) * 60 + (+o.minute) };
    } catch (e) { var n = new Date(Date.now() + (new Date().getTimezoneOffset() + 180) * 60000); return { d: n.getDay(), m: n.getHours() * 60 + n.getMinutes() }; }
  }
  function upd() {
    var n = now(), open = n.d >= 1 && n.d <= 6 && n.m >= 600 && n.m < 1020;
    box.classList.toggle('is-open', open); box.classList.toggle('is-closed', !open);
    if (open) { t.textContent = 'Сейчас работаем'; s.textContent = 'Звоните — ответим прямо сейчас, до 17:00'; return; }
    var when = (n.d >= 1 && n.d <= 6 && n.m < 600) ? 'сегодня в 10:00' : (n.d >= 1 && n.d <= 5) ? 'завтра в 10:00' : 'в понедельник в 10:00';
    t.textContent = n.d === 0 ? 'Сегодня выходной — команда отдыхает' : 'Офис закрыт — команда отдыхает';
    s.textContent = 'Позвоните ' + when + ' — всё расскажем';
  }
  upd(); setInterval(upd, 60000);
})();
