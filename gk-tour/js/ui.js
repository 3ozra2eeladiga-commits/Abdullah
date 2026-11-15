/* Интерфейс: этажи, День/Ночь/Облака, панель «этаж → квартиры → планировка, цена, рассрочка». */
(function () {
  'use strict';
  var GK = window.GK, SC = window.GKScene; if (!SC) return;
  var $ = function (id) { return document.getElementById(id); };
  var app = $('app'), panel = $('panel'), body = $('pBody'), back = $('pBack'), rail = $('rail'), hint = $('hint'), tip = $('tip'), zoom = $('zoom');
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var area = function (a) { return a.toFixed(2).replace('.', ','); };
  var rub = function (x) { return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; };
  var mln = function (x) { return (Math.round(x / 10000) / 100).toFixed(2).replace('.', ',') + ' млн ₽'; };
  var PTS = GK.pricePts, FULL = PTS[PTS.length - 1][1];
  function m2For(p) {
    if (p <= PTS[0][0]) return PTS[0][1];
    for (var i = 1; i < PTS.length; i++) if (p <= PTS[i][0]) { var a = PTS[i - 1], b = PTS[i]; return Math.round((a[1] + (b[1] - a[1]) * (p - a[0]) / (b[0] - a[0])) / 100) * 100; }
    return FULL;
  }
  var flatById = {}; GK.flats.forEach(function (f) { flatById[f.id] = f; });
  function flatsOn(floor) {
    var c = GK.floorFlats[floor], ids = c && c.flats ? c.flats : GK.flats.map(function (f) { return f.id; }), sold = (c && c.sold) || [];
    return ids.map(function (id) { return flatById[id]; }).filter(Boolean).map(function (f) { return { f: f, sold: sold.indexOf(f.id) >= 0 }; });
  }

  $('tName').textContent = GK.name; $('tSub').textContent = GK.address + ' · ' + GK.deadline;

  /* ---------- этажи слева ---------- */
  var railBtns = {};
  (function () {
    var add = function (key, label, txt) { var b = document.createElement('button'); b.type = 'button'; b.textContent = label; if (txt) b.className = 'is-txt'; b.setAttribute('data-key', key);
      b.addEventListener('click', function () { open(key); }); rail.appendChild(b); railBtns[key] = b; };
    var cap = document.createElement('div'); cap.className = 'rail__cap'; cap.textContent = 'Этаж'; rail.appendChild(cap);
    add('roof', 'Крыша', true);
    for (var f = SC.floors; f >= 1; f--) add(f, String(f));
    add('parking', 'Паркинг', true);
  })();

  /* ---------- панель ---------- */
  var state = { key: null, flat: null, filter: 0, down: 30, months: 36 };
  function layout() {
    var openNow = panel.classList.contains('is-open'), r = panel.getBoundingClientRect(), wide = r.width < app.clientWidth * 0.7;
    var ir = openNow && wide ? r.width + 14 : 0, ib = openNow && !wide ? r.height : 0;
    app.style.setProperty('--ir', ir + 'px'); SC.setInset(ir, ib);
  }
  function show(html, canBack) {
    body.innerHTML = html; body.scrollTop = 0; back.hidden = !canBack;
    panel.classList.add('is-open'); panel.setAttribute('aria-hidden', 'false'); app.classList.add('has-panel'); layout();
  }
  function close() {
    panel.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); app.classList.remove('has-panel');
    state.key = null; state.flat = null; mark(null); SC.select(null); layout();
  }
  function mark(key) { Object.keys(railBtns).forEach(function (k) { railBtns[k].classList.toggle('is-on', String(k) === String(key)); }); }

  function open(key) {
    hint.classList.add('is-off');
    state.key = key; state.flat = null; state.filter = 0; mark(key);
    SC.select(key === 'parking' ? 1 : key);
    if (GK.special[key]) return showSpecial(key);
    showFloor();
  }
  function showSpecial(key) {
    var s = GK.special[key];
    show('<p class="eyebrow">' + esc(s.sub) + '</p><h2>' + esc(s.title) + '</h2>' +
      (s.img ? '<img class="photo" src="' + s.img + '" alt="">' : '') +
      '<p class="text">' + esc(s.text) + '</p>' +
      (s.plan ? '<button type="button" class="plan" data-zoom="' + s.plan + '"><img src="' + s.plan + '" alt="План"></button><p class="cap">Нажмите на план, чтобы увеличить</p>' : '') +
      '<div class="call">Подробности — в отделе продаж<b>' + esc(GK.phone) + '</b></div>', false);
  }
  function showFloor() {
    var list = flatsOn(state.key), rooms = [];
    list.forEach(function (x) { if (rooms.indexOf(x.f.rooms) < 0) rooms.push(x.f.rooms); }); rooms.sort();
    var vis = list.filter(function (x) { return !state.filter || x.f.rooms === state.filter; });
    var as = list.map(function (x) { return x.f.area; }), mn = Math.min.apply(0, as), mx = Math.max.apply(0, as), n = list.length;
    var word = n % 10 === 1 && n % 100 !== 11 ? 'планировка' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? 'планировки' : 'планировок';
    var h = '<p class="eyebrow">Жилой этаж</p><h2>' + state.key + ' этаж</h2><p class="sub">' + n + ' ' + word + ' · от ' + area(mn) + ' до ' + area(mx) + ' м²</p>';
    h += '<div class="chips"><button type="button" data-f="0"' + (state.filter ? '' : ' class="is-on"') + '>Все</button>';
    rooms.forEach(function (r) { h += '<button type="button" data-f="' + r + '"' + (state.filter === r ? ' class="is-on"' : '') + '>' + r + '-комнатные</button>'; });
    h += '</div><div class="grid">';
    vis.forEach(function (x) { var f = x.f;
      h += '<button type="button" class="card' + (x.sold ? ' is-sold' : '') + '" data-flat="' + f.id + '"><span class="card__img"><img src="' + f.img + '" alt="" loading="lazy"></span>' +
        '<span class="card__b"><span class="card__n">' + esc(f.name) + '</span><span class="card__a">' + area(f.area) + '<small>м²</small></span>' +
        '<span class="card__p">' + (x.sold ? 'Продана' : mln(f.area * FULL)) + '</span></span></button>'; });
    h += '</div>';
    if (GK.floorPlan) h += '<h3>План этажа</h3><button type="button" class="plan" data-zoom="' + GK.floorPlan + '"><img src="' + GK.floorPlan + '" alt="План типового этажа" loading="lazy"></button><p class="cap">План типового этажа · нажмите, чтобы увеличить</p>';
    h += '<p class="fine">Цены указаны при полной оплате. Квартиры сдаются без отделки. Наличие квартиры на выбранном этаже подтвердит менеджер.</p>';
    show(h, false);
  }
  function showFlat(id) {
    var f = flatById[id]; if (!f) return; state.flat = id;
    var h = '<p class="eyebrow">' + state.key + ' этаж</p><h2>' + esc(f.name) + '<br>' + area(f.area) + ' м²</h2>' +
      '<button type="button" class="plan" data-zoom="' + f.img + '"><img src="' + f.img + '" alt="Планировка"></button><p class="cap">Нажмите на планировку, чтобы увеличить</p>' +
      (f.note ? '<p class="note">' + esc(f.note) + '</p>' : '') +
      '<div class="price"><span>Цена при полной оплате</span><b>' + rub(f.area * FULL) + '</b><small>' + rub(FULL) + ' за м²</small></div>' +
      '<section class="calc"><h3>Рассрочка от застройщика</h3>' +
      '<label>Первый взнос <output id="oDown"></output><input type="range" id="cDown" min="10" max="100" step="5" value="' + state.down + '"></label>' +
      '<label id="fMonths">Срок <output id="oMonths"></output><input type="range" id="cMonths" min="6" max="' + GK.maxMonths + '" step="6" value="' + state.months + '"></label>' +
      '<div class="rows"><div class="big" id="rMonth"><span>Платёж в месяц</span><b id="oMonth"></b></div><div><span>Первый взнос</span><b id="oFirst"></b></div>' +
      '<div><span>Цена за м²</span><b id="oM2"></b></div><div><span>Стоимость квартиры</span><b id="oTotal"></b></div></div></section>' +
      '<p class="fine">Рассрочка без банка, платежи ежемесячные и равные. Чем больше первый взнос, тем ниже цена метра. Квартира сдаётся без отделки. ' + esc(GK.deadline) + '.</p>' +
      '<div class="call">Отдел продаж<b>' + esc(GK.phone) + '</b></div>';
    show(h, true); calc();
  }
  function calc() {
    var f = flatById[state.flat], d = $('cDown'), m = $('cMonths'); if (!f || !d) return;
    var p = +d.value, n = +m.value, m2 = m2For(p), total = f.area * m2, first = total * p / 100, full = p === 100;
    state.down = p; state.months = n;
    [d, m].forEach(function (i) { i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%'); });
    $('oDown').textContent = full ? '100% · полная оплата' : p + '%';
    $('oMonths').textContent = n + ' мес.' + (n % 12 === 0 ? ' · ' + n / 12 + ' ' + (n === 12 ? 'год' : n < 60 ? 'года' : 'лет') : '');
    $('fMonths').hidden = full; $('rMonth').hidden = full;
    $('oMonth').textContent = rub(Math.round((total - first) / n / 100) * 100);
    $('oFirst').textContent = rub(first); $('oM2').textContent = rub(m2); $('oTotal').textContent = rub(total);
  }

  body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-flat],[data-f],[data-zoom]'); if (!t) return;
    if (t.hasAttribute('data-flat')) showFlat(t.getAttribute('data-flat'));
    else if (t.hasAttribute('data-f')) { state.filter = +t.getAttribute('data-f'); showFloor(); }
    else { $('zoomImg').src = t.getAttribute('data-zoom'); zoom.hidden = false; }
  });
  body.addEventListener('input', calc);
  back.addEventListener('click', function () { state.flat = null; showFloor(); });
  $('pClose').addEventListener('click', close);
  zoom.addEventListener('click', function () { zoom.hidden = true; });

  /* ---------- режимы и кнопки ---------- */
  var modeBtns = document.querySelectorAll('.modes button');
  function setMode(m) { SC.setMode(m); Array.prototype.forEach.call(modeBtns, function (b) { b.classList.toggle('is-on', b.getAttribute('data-mode') === m); }); }
  Array.prototype.forEach.call(modeBtns, function (b) { b.addEventListener('click', function () { setMode(b.getAttribute('data-mode')); }); });
  $('btnHome').addEventListener('click', function () { close(); SC.home(); });
  var fs = $('btnFull'), de = document.documentElement, canFs = de.requestFullscreen || de.webkitRequestFullscreen;
  if (!canFs) fs.hidden = true;
  fs.addEventListener('click', function () {
    var el = document.fullscreenElement || document.webkitFullscreenElement;
    if (el) (document.exitFullscreen || document.webkitExitFullscreen).call(document); else canFs.call(de);
  });

  SC.on('pick', function (key) { open(key); });
  SC.on('hover', function (h) {
    if (h.key == null) { tip.hidden = true; return; }
    tip.textContent = h.key === 'roof' ? 'Крыша · лаунж-зона' : h.key === 1 ? '1 этаж · коммерция' : h.key + ' этаж · квартиры';
    tip.style.left = h.x + 'px'; tip.style.top = h.y + 'px'; tip.hidden = false;
  });
  window.addEventListener('resize', layout);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (!zoom.hidden) zoom.hidden = true; else close(); } });
  document.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- режим витрины: если никто не трогает экран, дом сам медленно вращается ---------- */
  var last = Date.now(), away = false;
  function act() { last = Date.now(); away = false; SC.autoRotate(false); }
  ['pointerdown', 'wheel', 'keydown', 'input'].forEach(function (n) { document.addEventListener(n, act, { passive: true, capture: true }); });
  SC.on('act', function () { hint.classList.add('is-off'); });
  setInterval(function () {
    var idle = (Date.now() - last) / 1000, isOpen = panel.classList.contains('is-open');
    if (idle > 150 && !away) { away = true; zoom.hidden = true; if (isOpen) close(); SC.home(); hint.classList.remove('is-off'); isOpen = false; }
    if (idle > 20 && !isOpen) SC.autoRotate(true);
  }, 1000);
})();
