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

  // анимация — через JS (надёжно во всех браузерах телефона, включая встроенные): пар, Z, дыхание, печать
  var zz = box.querySelectorAll('.tr__zz text'), steam = box.querySelectorAll('.tr__steam'), rh = box.querySelectorAll('.tr__hd'),
      type = box.querySelectorAll('.tw__type'), click = box.querySelectorAll('.tw__click'), scr = box.querySelectorAll('.tw__screen'),
      wh = box.querySelectorAll('.tw__hd'), vis = false, raf = 0;
  function anim(now) {
    raf = 0; if (!vis) return; var t = now / 1000, i, ph, a;
    if (box.classList.contains('is-closed')) {
      for (i = 0; i < zz.length; i++) {                      // Z летят вверх-вправо и тают
        var man = Math.floor(i / 3), k = i % 3; ph = (t / (2.8 + man * 0.35) + k / 3 + man * 0.21) % 1;
        a = ph < 0.15 ? ph / 0.15 : ph > 0.7 ? (1 - ph) / 0.3 : 1;
        zz[i].setAttribute('transform', 'translate(' + (24 * ph).toFixed(1) + ' ' + (-44 * ph).toFixed(1) + ') rotate(' + (-12 + 24 * ph).toFixed(1) + ' ' + zz[i].getAttribute('x') + ' 60)');
        zz[i].style.opacity = a.toFixed(2);
      }
      for (i = 0; i < steam.length; i++) {                   // пар над кружками
        ph = (t / 2.2 + i * 0.37) % 1; a = Math.sin(ph * Math.PI);
        steam[i].setAttribute('transform', 'translate(' + (Math.sin(t * 2 + i) * 1.2).toFixed(1) + ' ' + (3 - 12 * ph).toFixed(1) + ')');
        steam[i].style.opacity = (a * 0.9).toFixed(2);
      }
      for (i = 0; i < rh.length; i++) rh[i].setAttribute('transform', 'translate(0 ' + (Math.sin(t * 1.9 + i * 1.3) * 1.6).toFixed(1) + ')');  // дышат, посапывают
    } else {
      for (i = 0; i < type.length; i++) type[i].setAttribute('transform', 'translate(' + (Math.sin(t * 31 + i) > 0 ? 1 : 0) + ' ' + (-2.5 * Math.abs(Math.sin(t * 15 + i * 2))).toFixed(1) + ')');
      for (i = 0; i < click.length; i++) click[i].style.opacity = Math.sin(t * 14 + i * 2) > 0.3 ? 1 : 0;
      for (i = 0; i < scr.length; i++) scr[i].style.opacity = (0.8 + 0.2 * Math.sin(t * 6 + i)).toFixed(2);
      for (i = 0; i < wh.length; i++) wh[i].setAttribute('transform', 'translate(0 ' + (Math.sin(t * 2.4 + i) * 1).toFixed(1) + ')');
    }
    raf = requestAnimationFrame(anim);
  }
  if ('IntersectionObserver' in window) new IntersectionObserver(function (e) { vis = e[0].isIntersecting; if (vis && !raf) raf = requestAnimationFrame(anim); }).observe(box);
  else { vis = true; raf = requestAnimationFrame(anim); }
})();
