/* Калькулятор рассрочки + «Золотой билет» (данные заказчика 13.11).
   Цена за м²: полная оплата 88 000; взнос 50% — 90 000; 30% — 93 000; 20% — 94 000; 10% — 95 000;
   между этими точками цена меняется плавно. Срок — до 60 месяцев, платежи ежемесячные, равные.
   Сцена: кран поднимает поддон с % взноса, табличка — цена за м², дом достраивается по годам срока.
   Золотой билет: кран опускает билет → стираешь пальцем → подарок → имя и телефон → личный код (24 часа). */
(function () {
  'use strict';
  var sel = document.getElementById('cFlat'), down = document.getElementById('cDown'), months = document.getElementById('cMonths');
  if (!sel || !down || !months) return;
  var $ = function (id) { return document.getElementById(id); };
  var PTS = [[10, 95000], [20, 94000], [30, 93000], [50, 90000], [100, 88000]];
  function m2For(p) {
    if (p <= PTS[0][0]) return PTS[0][1];
    for (var i = 1; i < PTS.length; i++) if (p <= PTS[i][0]) { var a = PTS[i - 1], b = PTS[i]; return Math.round((a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0])) / 100) * 100; }
    return PTS[PTS.length - 1][1];
  }
  var rub = function (x) { return Math.round(x).toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽'; };
  var area2 = function (a) { return a.toFixed(2).replace('.', ','); };
  var yrs = function (n) { return n === 1 ? 'год' : n < 5 ? 'года' : 'лет'; };

  (window.gsFlatList || []).forEach(function (f, i) {
    var o = document.createElement('option'); o.value = f.area; o.textContent = f.name + ' — ' + area2(f.area) + ' м²';
    if (i === 0) o.selected = true; sel.appendChild(o);
  });

  // ---------- сцена: дом из этажей (1 этаж = 1 год) ----------
  var house = $('psHouse'), floors = [];
  if (house) {
    var NS = 'http://www.w3.org/2000/svg';
    for (var f = 0; f < 5; f++) {
      var g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'ps-fl'); g.setAttribute('transform', 'translate(0 ' + (-(f + 1) * 40) + ')');
      g.innerHTML = '<rect x="-4" y="0" width="88" height="40" class="ps-fb"/><rect x="8" y="12" width="14" height="18" class="ps-w"/><rect x="34" y="12" width="14" height="18" class="ps-w"/><rect x="60" y="12" width="14" height="18" class="ps-w"/>';
      house.appendChild(g); floors.push(g);
    }
  }
  function scene(p, n, m2) {
    var y = 196 - (p - 10) / 90 * 120;   // чем больше взнос — тем выше кран поднимает поддон
    var load = $('psLoad'), rope = $('psRope');
    if (load) load.setAttribute('transform', 'translate(250 ' + y.toFixed(1) + ')');
    if (rope) rope.setAttribute('d', 'M250 52 V' + y.toFixed(1));
    if ($('psPct')) $('psPct').textContent = p + '%';
    if ($('psM2')) $('psM2').textContent = m2.toLocaleString('ru-RU').replace(/,/g, ' ') + ' ₽';
    var full = p === 100, yrsN = full ? 0 : Math.ceil(n / 12);
    floors.forEach(function (fl, i) { fl.classList.toggle('on', full || i < yrsN); fl.classList.toggle('lit', full); });
    if ($('psCap')) $('psCap').textContent = full ? 'Полная оплата — дом ваш сразу 🔑' : 'Срок ' + (n % 12 ? n + ' мес.' : n / 12 + ' ' + yrs(n / 12)) + ' — ' + yrsN + ' ' + (yrsN === 1 ? 'этаж' : yrsN < 5 ? 'этажа' : 'этажей');
  }

  function setP(inp) { inp.style.setProperty('--p', ((inp.value - inp.min) / (inp.max - inp.min) * 100) + '%'); }
  function calc() {
    var area = +sel.value || 0, p = +down.value, n = +months.value, m2 = m2For(p), total = area * m2;
    var first = total * p / 100, rest = total - first, full = p === 100;
    $('oDown').textContent = full ? '100% · полная оплата' : p + '%';
    $('oMonths').textContent = n + ' мес.' + (n % 12 === 0 ? ' · ' + n / 12 + ' ' + yrs(n / 12) : '');
    $('oM2').textContent = rub(m2);
    $('oFirst').textContent = rub(first);
    $('oTotal').textContent = rub(total);
    $('fMonths').hidden = full; $('rMonth').hidden = full;
    if (!full) $('oMonth').textContent = rub(Math.round(rest / n / 100) * 100);
    var next = null; for (var i = 0; i < PTS.length; i++) if (PTS[i][0] > p) { next = PTS[i]; break; }
    $('oNudge').textContent = next ? (next[0] === 100 ? 'При полной оплате' : 'При взносе ' + next[0] + '%') + ' метр дешевле на ' + rub(m2 - next[1]) + ' — квартира дешевле на ' + rub(area * (m2 - next[1])) : 'Самая выгодная цена — при полной оплате 👍';
    Array.prototype.forEach.call(document.querySelectorAll('#payTiers [data-t]'), function (el) { el.classList.toggle('on', +el.getAttribute('data-t') === p); });
    setP(down); setP(months); scene(p, n, m2);
  }
  var touched = false;
  [sel, down, months].forEach(function (el) {
    el.addEventListener('input', function () { calc(); if (!touched) { touched = true; setTimeout(dropTicket, 1200); } });
    el.addEventListener('change', calc);
  });
  calc();

  // «Рассчитать рассрочку» из окна планировки — выбираем эту квартиру и едем к калькулятору
  document.addEventListener('click', function (e) {
    var b = e.target.closest && e.target.closest('#fwCalc'); if (!b) return;
    var a = b.getAttribute('data-area'); if (a) { sel.value = a; calc(); }
    e.preventDefault();
    setTimeout(function () {
      var el = $('pay'); if (!el) return;
      if (window.gsLenis) { window.gsLenis.start(); window.gsLenis.scrollTo(el, { offset: -60 }); }
      else window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - 60, behavior: 'smooth' });
    }, 80);
  }, true);

  // ---------- телефон: маска ----------
  function mask(inp) {
    inp.addEventListener('input', function () {
      var d = inp.value.replace(/\D/g, ''); if (d[0] === '8') d = '7' + d.slice(1); if (d && d[0] !== '7') d = '7' + d; d = d.slice(0, 11);
      var s = '+7'; if (d.length > 1) s += ' (' + d.slice(1, 4); if (d.length >= 4) s += ') ' + d.slice(4, 7); if (d.length >= 7) s += '-' + d.slice(7, 9); if (d.length >= 9) s += '-' + d.slice(9, 11);
      inp.value = d ? s : '';
    });
  }
  function calcText() {
    var p = +down.value, opt = sel.options[sel.selectedIndex];
    return (opt ? opt.textContent : '') + '; взнос ' + p + '%' + (p < 100 ? '; срок ' + months.value + ' мес.; платёж ' + $('oMonth').textContent : '; полная оплата') + '; цена м² ' + $('oM2').textContent + '; итого ' + $('oTotal').textContent;
  }
  // демо-версия (предпросмотр для заказчика): заявки никуда не уходят, всё остальное — как на сайте
  var DEMO = /\/preview\//.test(location.pathname) || window.GS_DEMO;
  function send(data, msg, ok) {
    if (DEMO) { msg.textContent = 'Отправляем…'; return new Promise(function (r) { setTimeout(function () { ok({ ok: true }); r(); }, 700); }); }
    msg.textContent = 'Отправляем…'; msg.className = msg.className.replace(/ (ok|err)/g, '');
    return fetch('send.php', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
      .then(function (r) { return r.json().catch(function () { return { ok: false }; }); })
      .then(function (r) { if (r && r.ok) ok(r); else { msg.textContent = (r && r.error) || 'Не получилось отправить. Позвоните нам: +7 (938) 815-33-33'; msg.className += ' err'; } })
      .catch(function () { msg.textContent = 'Нет связи. Позвоните нам: +7 (938) 815-33-33'; msg.className += ' err'; });
  }

  // ---------- заявка «Перезвоните мне» ----------
  var form = $('payForm'), msg = $('payMsg');
  if (form) {
    mask(form.elements.phone);
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim(), digits = form.elements.phone.value.replace(/\D/g, '');
      if (!name) { msg.textContent = 'Напишите, пожалуйста, имя'; msg.className = 'pay__msg err'; return; }
      if (digits.length !== 11) { msg.textContent = 'Проверьте номер телефона'; msg.className = 'pay__msg err'; return; }
      send({ name: name, phone: digits, topic: 'Рассрочка (калькулятор)', details: calcText(), website: form.elements.website.value }, msg, function () {
        msg.textContent = 'Спасибо! Перезвоним в рабочее время (пн–сб 10:00–17:00) 🙌'; msg.className = 'pay__msg ok'; form.reset();
      });
    });
  }

  // ---------- ЗОЛОТОЙ БИЛЕТ ----------
  var drop = $('gtDrop'), gt = $('gt'), KEY = 'gsTicket', HOURS = 24;
  if (!drop || !gt) return;
  document.body.appendChild(gt);   // окно — поверх всего сайта (вне слоёв страницы)
  var st = {}; try { st = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch (e) { st = {}; }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) {} }
  var dropped = false;
  function dropTicket() {
    if (dropped) return; dropped = true;
    drop.hidden = false; void drop.offsetWidth; drop.classList.add('on');
    if (st.code) $('gtDropTxt').textContent = 'Ваш билет ' + st.code;
  }
  if (st.opened) setTimeout(function () { dropTicket(); }, 600);   // билет уже открывали — он остаётся
  function left() { return st.opened ? st.opened + HOURS * 3600e3 - Date.now() : HOURS * 3600e3; }
  var tick = 0;
  function timer() {
    var ms = Math.max(0, left()), s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
    $('gtTimer').textContent = (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss;
    if (!ms) $('gtTimer').textContent = 'время вышло';
  }
  function openGt() {
    gt.hidden = false; void gt.offsetWidth; gt.classList.add('on'); document.body.classList.add('lock', 'gt-open');
    if (st.opened) { revealed(true); } else initScratch();
    clearInterval(tick); tick = setInterval(timer, 1000); timer();
  }
  function closeGt() { gt.classList.remove('on'); document.body.classList.remove('lock', 'gt-open'); clearInterval(tick); setTimeout(function () { gt.hidden = true; }, 350); }
  $('gtOpen').addEventListener('click', openGt);
  gt.addEventListener('click', function (e) { if (e.target === gt || e.target.closest('[data-gtclose]')) closeGt(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !gt.hidden) closeGt(); });

  // стирающийся слой (как у лотерейного билета)
  var cv = $('gtScratch'), ctx = cv.getContext('2d'), drawn = false, done = false, moves = 0, firstT = 0;
  function initScratch() {
    if (drawn) return; drawn = true;
    var r = cv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = r.width * dpr; cv.height = r.height * dpr; ctx.scale(dpr, dpr);
    var gr = ctx.createLinearGradient(0, 0, r.width, r.height);
    gr.addColorStop(0, '#d9a066'); gr.addColorStop(.45, '#f3cf93'); gr.addColorStop(.55, '#c98a5b'); gr.addColorStop(1, '#8f5a34');
    ctx.fillStyle = gr; ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = 'rgba(80,45,20,.25)'; ctx.lineWidth = 1;   // чертёжная сетка на слое
    for (var x = 0; x < r.width; x += 18) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, r.height); ctx.stroke(); }
    for (var y = 0; y < r.height; y += 18) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(r.width, y); ctx.stroke(); }
    ctx.fillStyle = 'rgba(60,32,14,.75)'; ctx.font = '600 15px Onest, sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('СОТРИТЕ, ЧТОБЫ УЗНАТЬ ПОДАРОК', r.width / 2, r.height / 2 + 5);
    ctx.globalCompositeOperation = 'destination-out'; ctx.lineCap = ctx.lineJoin = 'round'; ctx.lineWidth = 56;
  }
  var last = null;
  function pt(e) { var r = cv.getBoundingClientRect(), t = e.touches ? e.touches[0] : e; return [t.clientX - r.left, t.clientY - r.top]; }
  function scratch(p) {
    if (done) return;
    ctx.beginPath(); if (last) ctx.moveTo(last[0], last[1]); else ctx.moveTo(p[0] - .1, p[1]); ctx.lineTo(p[0], p[1]); ctx.stroke(); last = p;
    $('gtHint').classList.add('off');
    if (!firstT) firstT = Date.now();
    if (++moves % 6 === 0 && (cleared() > 0.4 || Date.now() - firstT > 3500)) revealed(false);   // стёрли почти половину (или трут уже 3,5 с) — открываем
  }
  function cleared() {
    var d = ctx.getImageData(0, 0, cv.width, cv.height).data, n = 0, c = 0;
    for (var i = 3; i < d.length; i += 4 * 40) { n++; if (d[i] < 40) c++; }
    return c / n;
  }
  cv.addEventListener('pointerdown', function (e) { cv.setPointerCapture && cv.setPointerCapture(e.pointerId); last = null; scratch(pt(e)); });
  cv.addEventListener('pointermove', function (e) { if (e.buttons || e.pointerType === 'touch') scratch(pt(e)); });
  cv.addEventListener('pointerup', function () { last = null; });
  cv.addEventListener('touchmove', function (e) { e.preventDefault(); }, { passive: false });
  function revealed(instant) {
    done = true; cv.classList.add('gone'); $('gtHint').classList.add('off'); $('gtPrize').classList.add('won');
    if (!st.opened) { st.opened = Date.now(); save(); }
    $('gtAfter').hidden = false;
    if (st.code) showCode();
    if (!instant) sparks();
  }
  function sparks() {   // искры, как от сварки
    var box = $('gtPrize');
    for (var i = 0; i < 26; i++) {
      var s = document.createElement('i'); s.className = 'gt__spark';
      var a = Math.random() * Math.PI * 2, d = 60 + Math.random() * 120;
      s.style.setProperty('--x', Math.cos(a) * d + 'px'); s.style.setProperty('--y', Math.sin(a) * d - 30 + 'px');
      s.style.animationDelay = Math.random() * 0.15 + 's'; box.appendChild(s);
      setTimeout(function (n) { n.remove(); }.bind(null, s), 1400);
    }
  }
  // забрать подарок: имя + телефон → личный код
  var gform = $('gtForm'), gmsg = $('gtMsg');
  mask(gform.elements.phone);
  function newCode() {
    var A = 'ABCEHKMPTX23456789', s = '';
    var rnd = new Uint32Array(8); (window.crypto || window.msCrypto).getRandomValues(rnd);
    for (var i = 0; i < 8; i++) s += A[rnd[i] % A.length];
    return 'ЗБ-' + s.slice(0, 4) + '-' + s.slice(4);
  }
  function showCode() { gform.hidden = true; $('gtDone').hidden = false; $('gtCode').textContent = st.code; $('gtDropTxt').textContent = 'Ваш билет ' + st.code; }
  gform.addEventListener('submit', function (e) {
    e.preventDefault();
    var name = gform.elements.name.value.trim(), digits = gform.elements.phone.value.replace(/\D/g, '');
    if (!name) { gmsg.textContent = 'Напишите, пожалуйста, имя'; gmsg.className = 'gt__msg err'; return; }
    if (digits.length !== 11) { gmsg.textContent = 'Проверьте номер телефона'; gmsg.className = 'gt__msg err'; return; }
    var code = newCode(), until = new Date(st.opened + HOURS * 3600e3);
    send({ name: name, phone: digits, topic: 'Золотой билет ' + code, details: 'Подарок: комплект De’Longhi (стиральная + сушильная); действует до ' + until.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) + '; расчёт: ' + calcText(), code: code }, gmsg, function (r) {
      st.code = (r && r.code) || code; st.name = name; save(); gmsg.textContent = ''; showCode();
    });
  });
  $('gtCopy').addEventListener('click', function () {
    var b = this, t = st.code || $('gtCode').textContent;
    function ok() { b.textContent = 'Скопировано ✓'; setTimeout(function () { b.textContent = 'Скопировать код'; }, 1800); }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(t).then(ok, fallback); else fallback();
    function fallback() { var ta = document.createElement('textarea'); ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0'; document.body.appendChild(ta); ta.select(); try { document.execCommand('copy'); ok(); } catch (e) {} ta.remove(); }
  });
})();
