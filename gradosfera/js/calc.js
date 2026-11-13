/* Калькулятор рассрочки от застройщика (данные заказчика 13.11):
   полная оплата — 88 000 ₽/м²; взнос от 50% — 90 000; от 30% — 93 000; от 10% — 95 000. Срок до 60 месяцев.
   Платёж показываем ПРИМЕРНО (вилкой), точную сумму называет менеджер. Заявка — в send.php. */
(function () {
  'use strict';
  var sel = document.getElementById('cFlat'), down = document.getElementById('cDown'), months = document.getElementById('cMonths');
  if (!sel || !down || !months) return;
  var $ = function (id) { return document.getElementById(id); };
  var TIERS = [[100, 88000], [50, 90000], [30, 93000], [10, 95000]];
  function m2For(p) { for (var i = 0; i < TIERS.length; i++) if (p >= TIERS[i][0]) return TIERS[i][1]; return TIERS[TIERS.length - 1][1]; }
  var rub = function (x) { return Math.round(x).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'; };
  var mln = function (x) { return (Math.round(x / 10000) / 100).toFixed(2).replace('.', ',') + ' млн ₽'; };
  var area2 = function (a) { return a.toFixed(2).replace('.', ','); };

  var list = window.gsFlatList || [];
  list.forEach(function (f, i) {
    var o = document.createElement('option'); o.value = f.area; o.textContent = f.name + ' — ' + area2(f.area) + ' м²';
    if (i === 0) o.selected = true; sel.appendChild(o);
  });

  function setP(inp) { var p = (inp.value - inp.min) / (inp.max - inp.min) * 100; inp.style.setProperty('--p', p + '%'); }
  function calc() {
    var area = +sel.value || 0, p = +down.value, n = +months.value, m2 = m2For(p), total = area * m2;
    var first = total * p / 100, rest = total - first;
    $('oDown').textContent = p === 100 ? '100% · полная оплата' : p + '% · ' + rub(first);
    $('oMonths').textContent = n + ' мес.' + (n % 12 === 0 ? ' (' + n / 12 + ' ' + (n === 12 ? 'год' : n < 60 ? 'года' : 'лет') + ')' : '');
    $('oM2').textContent = rub(m2);
    $('oTotal').textContent = '≈ ' + mln(total);
    $('fMonths').hidden = p === 100; $('rMonth').hidden = p === 100;
    if (p < 100) {   // примерно: вилка по 5 тыс. ₽
      var k = rest / n / 1000, lo = Math.floor(k / 5) * 5, hi = lo + 5;
      $('oMonth').textContent = '≈ ' + lo + '–' + hi + ' тыс. ₽';
    }
    // подсказка: следующий порог взноса — метр дешевле
    var next = null; for (var i = TIERS.length - 1; i >= 0; i--) if (TIERS[i][0] > p) { next = TIERS[i]; break; }
    $('oNudge').textContent = next ? (next[0] === 100 ? 'При полной оплате' : 'При взносе от ' + next[0] + '%') + ' метр дешевле на ' + rub(m2 - next[1]) + ' — квартира выйдет дешевле на ' + rub(area * (m2 - next[1])) : 'Самая выгодная цена — при полной оплате 👍';
    Array.prototype.forEach.call(document.querySelectorAll('#payTiers [data-t]'), function (el) { el.classList.toggle('on', m2For(p) === m2For(+el.getAttribute('data-t'))); });
    setP(down); setP(months);
  }
  [sel, down, months].forEach(function (el) { el.addEventListener('input', calc); el.addEventListener('change', calc); });
  calc();

  // «Рассчитать рассрочку» из окна планировки — выбираем эту квартиру
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#fwCalc'); if (!b) return;
    var a = b.getAttribute('data-area'); if (a) { sel.value = a; calc(); }
    e.preventDefault();
    setTimeout(function () {   // окно уже закрыто — плавно едем к калькулятору
      var el = document.getElementById('pay'); if (!el) return;
      if (window.gsLenis) { window.gsLenis.start(); window.gsLenis.scrollTo(el, { offset: -60 }); }
      else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
    }, 80);
  }, true);

  // ---------- заявка «Перезвоните мне» ----------
  var form = $('payForm'), msg = $('payMsg'); if (!form) return;
  var ph = form.elements.phone;
  ph.addEventListener('input', function () {   // маска +7 (___) ___-__-__
    var d = ph.value.replace(/\D/g, ''); if (d[0] === '8') d = '7' + d.slice(1); if (d && d[0] !== '7') d = '7' + d; d = d.slice(0, 11);
    var s = '+7'; if (d.length > 1) s += ' (' + d.slice(1, 4); if (d.length >= 4) s += ') ' + d.slice(4, 7); if (d.length >= 7) s += '-' + d.slice(7, 9); if (d.length >= 9) s += '-' + d.slice(9, 11);
    ph.value = d ? s : '';
  });
  var busy = false;
  form.addEventListener('submit', function (e) {
    e.preventDefault(); if (busy) return;
    var name = form.elements.name.value.trim(), digits = ph.value.replace(/\D/g, '');
    if (!name) { msg.textContent = 'Напишите, пожалуйста, имя'; msg.className = 'pay__msg err'; return; }
    if (digits.length !== 11) { msg.textContent = 'Проверьте номер телефона'; msg.className = 'pay__msg err'; return; }
    var p = +down.value, area = +sel.value, opt = sel.options[sel.selectedIndex];
    var details = (opt ? opt.textContent : '') + '; взнос ' + p + '%' + (p < 100 ? '; срок ' + months.value + ' мес.; платёж ' + $('oMonth').textContent : '; полная оплата') + '; цена м² ' + $('oM2').textContent + '; итого ' + $('oTotal').textContent;
    busy = true; msg.textContent = 'Отправляем…'; msg.className = 'pay__msg';
    fetch('send.php', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name, phone: digits, topic: 'Рассрочка (калькулятор)', details: details, area: area, website: form.elements.website.value, page: location.href }) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (r) {
        if (r && r.ok) { msg.textContent = 'Спасибо! Перезвоним в рабочее время (пн–сб 10:00–17:00) 🙌'; msg.className = 'pay__msg ok'; form.reset(); }
        else { msg.textContent = (r && r.error) || 'Не получилось отправить. Позвоните нам: +7 (938) 815-33-33'; msg.className = 'pay__msg err'; }
      })
      .catch(function () { msg.textContent = 'Нет связи. Позвоните нам: +7 (938) 815-33-33'; msg.className = 'pay__msg err'; })
      .then(function () { busy = false; });
  });
})();
