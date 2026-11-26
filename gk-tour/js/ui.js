/* Интерфейс программы-тура ЖК «Новый Квартал»:
   начальный экран → тур по дому (остановки 01–06, автотур) → каталог квартир → квартира (этаж, цена, рассрочка, избранное).
   Модули (паркинг, интерьер, эффекты) подключаются в момент нажатия: если модуля нет или он сломан — программа работает дальше. */
(function () {
  'use strict';
  var GK = window.GK, SC = window.GKScene, D = document;
  var $ = function (id) { return D.getElementById(id); };
  var app = $('app'), boot = $('boot'), startEl = $('start');
  if (!SC || !SC.ctx || !GK) { if (boot) boot.hidden = true; if (startEl) startEl.hidden = true; return; }
  var ctx = SC.ctx, T = ctx.T;
  var panel = $('panel'), body = $('pBody'), back = $('pBack'), pFav = $('pFav'), rail = $('rail'), hint = $('hint'), tip = $('tip'), zoom = $('zoom'),
    card = $('scard'), dock = $('dock'), stopsEl = $('stops'), menu = $('menu'), menuBtn = $('menuBtn'), favBtn = $('favBtn'), cmp = $('cmp'),
    caption = $('caption'), tourCatch = $('tourCatch'), toastEl = $('toast'), modesEl = $('modes');

  /* ---------- служебное ---------- */
  var qp = function (k) { var m = location.search.match(new RegExp('[?&]' + k + '=([^&]*)')); return m ? m[1] : null; };
  var ROBOT = !!navigator.webdriver;                                    // автоматический снимок страницы: без заставки и без «витрины»
  var WITH_START = qp('start') === '1' || (qp('start') !== '0' && !ROBOT);
  var KIOSK = qp('kiosk') === '1' || (qp('kiosk') !== '0' && !ROBOT);
  var esc = function (s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var area = function (a) { return a.toFixed(2).replace('.', ','); };
  var rub = function (x) { return Math.round(x).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' ₽'; };
  var mln = function (x) { return (Math.round(x / 10000) / 100).toFixed(2).replace('.', ',') + ' млн ₽'; };
  var num2 = function (i) { return (i < 9 ? '0' : '') + (i + 1); };
  var safe = function (fn) { try { return fn(); } catch (e) { if (window.console) console.warn('[ui] модуль:', e); return undefined; } };
  var mod = function (name, method) { var m = window[name]; return m && typeof m[method] === 'function' ? m : null; };
  var plural = function (n, a, b, c) { return n % 10 === 1 && n % 100 !== 11 ? a : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 12 || n % 100 > 14)) ? b : c; };

  /* ---------- цены и рассрочка (как на сайте, формулы не менять) ---------- */
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
  var ALL_A = GK.flats.map(function (f) { return f.area; }), A_LO = Math.floor(Math.min.apply(0, ALL_A)), A_HI = Math.ceil(Math.max.apply(0, ALL_A));
  var FLOOR_MIN = 2, FLOOR_MAX = SC.floors, FLOOR_DEF = Math.min(FLOOR_MAX, 5);

  /* ---------- значки: тонкая линия 1,5 px, один стиль ---------- */
  var IC = {
    overview: '<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9z"/><path d="M12 12l8-4.5M12 12v9M12 12L4 7.5"/>',
    facade: '<path d="M4.5 21V5.5L13 3v18M13 9h6.5v12M2.5 21h19M7.8 9h2M7.8 12.5h2M7.8 16h2M15.8 13h1.4M15.8 16.5h1.4"/>',
    yard: '<path d="M12 21v-7.5M5 21h14"/><path d="M12 13.5c-3.2 0-5.5-2.1-5.5-5S8.8 3.5 12 3.5s5.5 2.1 5.5 5-2.3 5-5.5 5z"/><path d="M12 10.5l2-2"/>',
    roof: '<path d="M3 20.5h18M12 20.5V9.5"/><path d="M4.5 9.5C5.7 6 8.5 4 12 4s6.3 2 7.5 5.5z"/><path d="M7 20.5v-3.5h3"/>',
    parking: '<rect x="4" y="4" width="16" height="16" rx="3.5"/><path d="M10 16.5v-9h2.8a2.7 2.7 0 0 1 0 5.4H10"/>',
    apts: '<path d="M4 5h16v14H4z"/><path d="M4 12.5h6M10 5v4M10 16v3M14 12.5h6M14 12.5V10"/>',
    play: '<path d="M8 5.5v13l11-6.5z"/>',
    heart: '<path d="M12 20s-7.2-4.5-7.2-9.7A3.9 3.9 0 0 1 12 8.2a3.9 3.9 0 0 1 7.2 2.1C19.2 15.5 12 20 12 20z"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    back: '<path d="M14.5 5.5L8 12l6.5 6.5"/>',
    arrow: '<path d="M4 12h15M13.5 6.5L19 12l-5.5 5.5"/>',
    sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6"/>',
    sunset: '<path d="M3 17.5h18M7 21h10"/><path d="M7.5 17.5a4.5 4.5 0 0 1 9 0"/><path d="M12 7.5V10M5.3 10.8L7 12.5M18.7 10.8L17 12.5"/>',
    moon: '<path d="M19.5 14.2A8 8 0 0 1 9.8 4.5a8 8 0 1 0 9.7 9.7z"/>',
    cloud: '<path d="M7.5 18.5h9.2a4 4 0 0 0 .6-7.95A5.6 5.6 0 0 0 6.6 11.4a3.6 3.6 0 0 0 .9 7.1z"/>',
    menu: '<path d="M4 8h8M18 8h2M4 16h2M12 16h8"/><circle cx="15" cy="8" r="2.4"/><circle cx="9" cy="16" r="2.4"/>',
    full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
    home: '<path d="M4 11l8-6.5 8 6.5M6.5 9.5V20h11V9.5"/>',
    door: '<path d="M6.5 21V4h8.5v17M4 21h16M15 6l3 1.2V21"/><path d="M11.8 12.2v1"/>',
    pin: '<path d="M12 21s6.5-5.6 6.5-11a6.5 6.5 0 0 0-13 0c0 5.4 6.5 11 6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
    zoom: '<circle cx="11" cy="11" r="6"/><path d="M15.5 15.5L20 20M11 8.5v5M8.5 11h5"/>',
    spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9L12 17.5l-1.9-5.1L5 10.5l5.1-1.9z"/><path d="M18.5 16.5v4M16.5 18.5h4"/>',
    plan: '<path d="M4 5h16v14H4zM4 11h7v8M15 5v6h5"/>'
  };
  function ic(n) { return '<svg class="i" viewBox="0 0 24 24" aria-hidden="true">' + (IC[n] || '') + '</svg>'; }

  /* ---------- состояние ---------- */
  var STOPS = (GK.tour && GK.tour.stops) || [], stopIdx = {}; STOPS.forEach(function (s, i) { stopIdx[s.key] = i; });
  var S = { view: null, special: null, catFloor: null, floor: FLOOR_DEF, flat: null, rooms: 0, aMin: A_LO, aMax: A_HI, sort: 'asc', down: 30, months: 36, stop: null, sub: null };
  var startOn = false, resume = null, curLim = false, relaxT = 0;
  var tour = { on: false, i: 0, timer: 0, attract: false };

  /* ---------- подписи из данных ---------- */
  $('tName').textContent = GK.name; $('tSub').textContent = GK.address + ' · ' + GK.deadline;
  (function () {
    var set = function (id, v) { var e = $(id); if (e && v) e.textContent = v; };
    set('stBrand', GK.brand); set('stLead', GK.promise); set('stAddr', GK.address); set('stDead', String(GK.deadline).replace(/^Сдача\s*[—-]\s*/, '')); set('stHouse', GK.houseLine); set('stPhone', GK.phone);
    $('stGo').innerHTML = 'Начать тур' + ic('arrow'); $('pClose').innerHTML = ic('x'); back.innerHTML = ic('back') + 'Каталог'; menuBtn.innerHTML = ic('menu');
    zoom.querySelector('.zoom__x').innerHTML = ic('x');
    $('btnAuto').innerHTML = '<i>' + ic('play') + '</i><span><small>Тур по дому</small>Автотур</span>';
  })();

  /* ---------- камера: плавный облёт по дуге вокруг дома ---------- */
  var cam = null, FREE = { minDistance: 4, maxDistance: 900, minPolarAngle: 0.04, maxPolarAngle: 1.95 };
  var ease = function (u) { return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
  function poseOf(s) {
    if (!s || !s.cam) return { t: new T.Vector3(0, ctx.dims.H * 0.46, 0), r: ctx.homeDist(), th: -0.66, ph: 1.36, lim: null };
    var c = s.cam, k = Math.max(1, ctx.homeDist() / 172), r = c.r * (1 + (k - 1) * 0.8), n, lim = {};
    var ph = c.cy != null ? Math.acos(Math.max(-1, Math.min(1, (c.cy - c.t[1]) / r))) : c.ph;
    for (n in s.lim || {}) lim[n] = s.lim[n];
    if (lim.maxPolarAngle == null) lim.maxPolarAngle = ph + 0.006;
    if (lim.maxDistance) lim.maxDistance = Math.max(lim.maxDistance * k, r * 1.1);
    return { t: new T.Vector3(c.t[0], c.t[1], c.t[2]), r: r, th: c.th, ph: ph, lim: lim };
  }
  function flyCam(p, slow, done) {
    ctx.stopFly(); SC.autoRotate(false); clearTimeout(relaxT);
    var k = ctx.controls, s0 = new T.Spherical().setFromVector3(ctx.camera.position.clone().sub(k.target)), d = p.th - s0.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
    var far = Math.abs(d) * 0.55 + Math.abs(Math.log(p.r / s0.radius)) * 0.5 + k.target.distanceTo(p.t) / 90, dur = Math.min(4.2, 1.5 + far) * (slow ? 1.35 : 1);
    if (far < 0.02) { ctx.limits(); if (p.lim) ctx.limits(p.lim); curLim = !!p.lim; if (done) done(); return; }
    ctx.limits(FREE); ctx.limits({ enableRotate: false, enableZoom: false }); curLim = true;
    cam = { t0: k.target.clone(), t1: p.t, r0: s0.radius, r1: p.r, th0: s0.theta, dth: d, ph0: s0.phi, ph1: p.ph, a: performance.now(), dur: dur * 1000, lim: p.lim, done: done };
    ctx.dirty();
  }
  var _sp = new T.Spherical(), _v = new T.Vector3();
  ctx.onFrame(function () {
    if (!cam) return false;
    if (S.sub) { cam = null; return false; }
    var u = Math.min(1, (performance.now() - cam.a) / cam.dur), e = ease(u), k = ctx.controls;
    k.target.lerpVectors(cam.t0, cam.t1, e);
    _sp.set(cam.r0 * Math.pow(cam.r1 / cam.r0, e), cam.ph0 + (cam.ph1 - cam.ph0) * e, cam.th0 + cam.dth * e);
    ctx.camera.position.copy(k.target).add(_v.setFromSpherical(_sp));
    if (u >= 1) { var c = cam; cam = null; ctx.limits(); if (c.lim) ctx.limits(c.lim); curLim = !!c.lim; if (c.done) c.done(); }
    return true;
  });
  /* перед штатными перелётами сцены (выбор этажа, общий вид) снимаем ограничения остановки */
  function homeLimits() {
    cam = null; clearTimeout(relaxT);
    if (!curLim) { ctx.limits(); return; }
    curLim = false; ctx.limits(FREE); ctx.limits({ enableRotate: true, enableZoom: true });
    relaxT = setTimeout(function () { if (!cam && !S.sub && !curLim) ctx.limits(); }, 2000);
  }

  /* ---------- размещение: сцена сдвигается, чтобы дом не прятался под панелью ---------- */
  function layout() {
    var w = app.clientWidth, h = app.clientHeight, ir = 0, ib = 0, pr = 0, tall = w < 861 || w / h < 1;
    if (startOn) { if (tall) ib = h * 0.4; else ir = w * 0.46; }
    else if (panel.classList.contains('is-open') && !S.sub) { var r = panel.getBoundingClientRect(); if (!tall) { ir = r.width + 14; pr = ir; } else ib = r.height; }
    else if (card.classList.contains('is-on') && !tour.on && !S.sub) { var c = card.getBoundingClientRect(); if (!tall) ir = c.width * 0.9; else ib = c.height * 0.9; }
    app.style.setProperty('--ir', pr + 'px'); app.style.setProperty('--cr', (!pr && !tall && !startOn ? Math.round(ir) : 0) + 'px'); SC.setInset(ir, ib);
  }

  /* ---------- всплывающая строка ---------- */
  var toastT = 0;
  function toast(t) { toastEl.textContent = t; toastEl.classList.add('is-on'); clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove('is-on'); }, 2400); }

  /* ---------- время суток: кнопки по тем режимам, что есть в сцене ---------- */
  var MODE_T = { day: 'День', sunset: 'Закат', night: 'Ночь', clouds: 'Облака' }, MODE_I = { day: 'sun', sunset: 'sunset', night: 'moon', clouds: 'cloud' };
  function buildModes() {
    var h = '', now = SC.mode();
    ['day', 'sunset', 'night', 'clouds'].forEach(function (m) { if (ctx.MODES && ctx.MODES[m]) h += '<button type="button" data-mode="' + m + '" aria-label="' + MODE_T[m] + '"' + (m === now ? ' class="is-on"' : '') + '>' + ic(MODE_I[m]) + '<span>' + MODE_T[m] + '</span></button>'; });
    modesEl.innerHTML = h;
  }
  function setMode(m) {
    if (!ctx.MODES || !ctx.MODES[m]) return false;
    SC.setMode(m);
    Array.prototype.forEach.call(modesEl.children, function (b) { b.classList.toggle('is-on', b.getAttribute('data-mode') === m); });
    if (S.stop != null && card.classList.contains('is-on')) renderCard(stopIdx[S.stop]);
    return true;
  }
  modesEl.addEventListener('click', function (e) { var b = e.target.closest('[data-mode]'); if (b) setMode(b.getAttribute('data-mode')); });
  buildModes();

  /* ---------- меню: графика, полный экран, начальный экран, контакты ---------- */
  var de = D.documentElement, canFs = de.requestFullscreen || de.webkitRequestFullscreen;
  var Q_T = { high: 'Высокая', low: 'Экономная', off: 'Без эффектов' }, Q_ORDER = ['high', 'low', 'off'];
  function qLabel() { var F = window.GKFx; if (!F) return ''; var l = typeof F.label === 'function' ? safe(function () { return F.label(); }) : null; if (l) { l = String(l).replace(/^[^:]{0,14}:\s*/, ''); return l.charAt(0).toUpperCase() + l.slice(1); } var q = typeof F.quality === 'function' ? safe(function () { return F.quality(); }) : null; return Q_T[q] || ''; }
  function buildMenu() {
    var fs = D.fullscreenElement || D.webkitFullscreenElement, h = '';
    if (mod('GKFx', 'setQuality')) h += '<button type="button" data-m="q">' + ic('spark') + 'Графика<em>' + esc(qLabel()) + '</em></button>';
    if (canFs) h += '<button type="button" data-m="fs">' + ic('full') + (fs ? 'Выйти из полного экрана' : 'На весь экран') + '</button>';
    h += '<button type="button" data-m="start">' + ic('home') + 'Начальный экран</button>';
    h += '<div class="menu__c">Отдел продаж<b>' + esc(GK.phone) + '</b>' + esc(GK.office || '') + (GK.hours ? '<br>' + esc(GK.hours) : '') + '</div>';
    menu.innerHTML = h;
  }
  function menuShow(on) { if (on) buildMenu(); menu.classList.toggle('is-on', on); menuBtn.classList.toggle('is-on', on); menuBtn.setAttribute('aria-expanded', on ? 'true' : 'false'); menu.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  menuBtn.addEventListener('click', function () { menuShow(!menu.classList.contains('is-on')); });
  menu.addEventListener('click', function (e) {
    var b = e.target.closest('[data-m]'); if (!b) return; var m = b.getAttribute('data-m');
    if (m === 'q') {
      var F = mod('GKFx', 'setQuality'); if (!F) return;
      var q = typeof F.quality === 'function' ? safe(function () { return F.quality(); }) : 'high', nx = Q_ORDER[(Q_ORDER.indexOf(q) + 1) % Q_ORDER.length];
      safe(function () { F.setQuality(nx); }); ctx.dirty(); buildMenu(); return;
    }
    menuShow(false);
    if (m === 'fs') { var el = D.fullscreenElement || D.webkitFullscreenElement; safe(function () { if (el) (D.exitFullscreen || D.webkitExitFullscreen).call(D); else canFs.call(de); }); }
    else if (m === 'start') showStart();
  });
  D.addEventListener('pointerdown', function (e) { if (menu.classList.contains('is-on') && !e.target.closest('#menu,#menuBtn')) menuShow(false); }, true);

  /* ---------- этажи слева ---------- */
  var railBtns = {};
  (function () {
    var add = function (key, label, txt) { var b = D.createElement('button'); b.type = 'button'; b.textContent = label; if (txt) b.className = 'is-txt'; b.setAttribute('data-key', key);
      b.addEventListener('click', function () { open(key); }); rail.appendChild(b); railBtns[key] = b; };
    var cap = D.createElement('div'); cap.className = 'rail__cap'; cap.textContent = 'Этаж'; rail.appendChild(cap);
    add('roof', 'Крыша', true);
    for (var f = SC.floors; f >= 1; f--) add(f, String(f));
    add('parking', 'Паркинг', true);
  })();
  function mark(key) { Object.keys(railBtns).forEach(function (k) { railBtns[k].classList.toggle('is-on', key != null && String(k) === String(key)); }); }

  /* ---------- тур по дому: остановки ---------- */
  STOPS.forEach(function (s, i) {
    var b = D.createElement('button'); b.type = 'button'; b.className = 'stop'; b.setAttribute('data-stop', s.key); b.setAttribute('aria-label', s.title);
    b.innerHTML = ic(s.key) + '<span class="stop__tx"><small>' + num2(i) + '</small><b>' + esc(s.title) + '</b></span>';
    b.addEventListener('click', function () { goStop(s.key); }); stopsEl.appendChild(b);
  });
  function markStop(key) { Array.prototype.forEach.call(stopsEl.children, function (b) { b.classList.toggle('is-on', b.getAttribute('data-stop') === key); }); }
  function renderCard(i) {
    var s = STOPS[i]; if (!s) return;
    var h = '<div class="scard__top"><b>' + num2(i) + '</b><i></i><span>' + esc(s.eyebrow || s.title) + '</span><button type="button" class="scard__x" data-c="x" aria-label="Скрыть">' + ic('x') + '</button></div><div class="scard__sc"><h2>' + esc(s.head) + '</h2><p>' + esc(s.text) + '</p>';
    if (s.facts) { h += '<div class="facts">'; s.facts.forEach(function (f) { h += '<div><b>' + esc(f[0]) + '</b><span>' + esc(f[1]) + '</span></div>'; }); h += '</div>'; }
    if (s.points) { h += '<ul class="points">'; s.points.forEach(function (p) { h += '<li>' + esc(p) + '</li>'; }); h += '</ul>'; }
    var act = '';
    if (s.action && s.action.mode && ctx.MODES && ctx.MODES[s.action.mode] && SC.mode() !== s.action.mode) act += '<button type="button" class="btn btn--line btn--sm" data-c="mode" data-v="' + s.action.mode + '">' + ic(MODE_I[s.action.mode]) + esc(s.action.label) + '</button>';
    else if (s.action && s.action.mode && SC.mode() === s.action.mode && ctx.MODES.day) act += '<button type="button" class="btn btn--line btn--sm" data-c="mode" data-v="day">' + ic('sun') + 'Вернуть день</button>';
    if (s.key === 'parking') {
      if (mod('GKParking', 'enter')) act += '<button type="button" class="btn btn--gold btn--sm" data-c="park">' + ic('parking') + 'Спуститься в паркинг</button>';
      if (GK.special.parking && GK.special.parking.plan) act += '<button type="button" class="btn btn--line btn--sm" data-c="zoom" data-v="' + GK.special.parking.plan + '">' + ic('plan') + 'План паркинга</button>';
    }
    if (s.key === 'roof' && GK.special.roof && GK.special.roof.img) act += '<button type="button" class="btn btn--line btn--sm" data-c="zoom" data-v="' + GK.special.roof.img + '">' + ic('zoom') + 'Визуализация</button>';
    if (act) h += '<div class="scard__act">' + act + '</div>';
    h += '</div>';
    var nx = STOPS[i + 1], last = !nx;
    h += '<div class="scard__nav">' + (i > 0 ? '<button type="button" class="scard__prev" data-c="go" data-v="' + STOPS[i - 1].key + '" aria-label="Назад: ' + esc(STOPS[i - 1].title) + '">' + ic('back') + '</button>' : '') +
      '<button type="button" class="scard__next" data-c="go" data-v="' + (last ? 'apts' : nx.key) + '"><span><small>' + (last ? 'Далее' : 'Далее · ' + num2(i + 1)) + '</small>' + esc(last ? 'Квартиры' : nx.title) + '</span>' + ic('arrow') + '</button></div>';
    card.innerHTML = h;
  }
  function showCard(i) { renderCard(i); card.classList.add('is-on'); card.setAttribute('aria-hidden', 'false'); layout(); }
  function hideCard() { card.classList.remove('is-on'); card.setAttribute('aria-hidden', 'true'); }
  card.addEventListener('click', function (e) {
    var b = e.target.closest('[data-c]'); if (!b) return; var c = b.getAttribute('data-c'), v = b.getAttribute('data-v');
    if (c === 'x') { hideCard(); layout(); }
    else if (c === 'go') goStop(v);
    else if (c === 'mode') setMode(v);
    else if (c === 'park') { if (!enterParking()) toast('Паркинг сейчас недоступен'); }
    else if (c === 'zoom') zoomShow(v);
  });

  function enterParking() {
    var P = mod('GKParking', 'enter'); if (!P) return false;
    closePanel(); hideCard(); cam = null; clearTimeout(relaxT); ctx.limits(); curLim = false; SC.autoRotate(false);
    var ok = safe(function () { P.enter(); return true; });
    if (!ok) { layout(); return false; }
    S.stop = 'parking'; markStop('parking'); mark('parking'); syncSub(); setTimeout(syncSub, 80);
    return true;
  }
  function goStop(key, o) {
    o = o || {}; var i = stopIdx[key], s = STOPS[i]; if (!s) return;
    hint.classList.add('is-off'); menuShow(false);
    if (key === 'apts') { openCatalog(null); return; }
    if (key === 'parking') {
      if (!o.card && enterParking()) return;
      if (!mod('GKParking', 'enter') && !o.card) { S.stop = key; markStop(key); hideCard(); flyCam(poseOf(null), o.slow); openSpecial('parking'); return; }
    }
    closePanel(); S.stop = key; markStop(key); mark(key === 'roof' || key === 'parking' ? key : null);
    if (o.quiet) hideCard(); else showCard(i);
    flyCam(poseOf(s), o.slow, o.done);
  }

  /* ---------- панель ---------- */
  function show(html, canBack) {
    body.innerHTML = html; body.scrollTop = 0; back.hidden = !canBack; hideCard(); favSync();
    panel.classList.add('is-open'); panel.setAttribute('aria-hidden', 'false'); app.classList.add('has-panel'); layout();
  }
  function closePanel(keepSel) {
    if (!panel.classList.contains('is-open') && S.view == null) return;
    panel.classList.remove('is-open'); panel.setAttribute('aria-hidden', 'true'); app.classList.remove('has-panel');
    S.view = null; S.flat = null; S.special = null;
    if (!keepSel) { mark(null); SC.select(null); }
    layout();
  }
  function close() { closePanel(); if (S.stop === 'apts' || S.stop == null) { S.stop = 'overview'; markStop('overview'); } }

  /* нажатие на этаж (на доме или слева) */
  function open(key) {
    hint.classList.add('is-off');
    if (key === 'roof') return goStop('roof');
    if (key === 'parking') return goStop('parking');
    if (GK.special[key]) { S.stop = null; markStop(null); homeLimits(); return openSpecial(key); }
    openCatalog(+key);
  }
  function openSpecial(key) {
    var s = GK.special[key]; if (!s) return;
    S.view = 'special'; S.special = key; S.flat = null; mark(key);
    if (key !== 'parking') SC.select(key);
    show('<p class="eyebrow">' + esc(s.sub) + '</p><h2>' + esc(s.title) + '</h2>' +
      (s.img ? '<img class="photo" src="' + s.img + '" alt="">' : '') +
      '<p class="text">' + esc(s.text) + '</p>' +
      (s.plan ? '<button type="button" class="plan" data-zoom="' + s.plan + '"><img src="' + s.plan + '" alt="План"><span class="plan__z">' + ic('zoom') + 'Увеличить</span></button>' : '') +
      callHtml('Подробности — в отделе продаж'), false);
  }
  function callHtml(t) { return '<div class="call">' + esc(t) + '<b>' + esc(GK.phone) + '</b>' + (GK.office ? '<small>' + esc(GK.office) + '</small>' : '') + '</div>'; }

  /* каталог квартир: комнаты, площадь, сортировка; floor — если пришли с этажа */
  function catList() {
    var list = flatsOn(S.catFloor).filter(function (x) { return (!S.rooms || x.f.rooms === S.rooms) && x.f.area >= S.aMin && x.f.area <= S.aMax + 0.999; });
    list.sort(function (a, b) { return S.sort === 'asc' ? a.f.area - b.f.area : b.f.area - a.f.area; });
    return list;
  }
  function gridHtml() {
    var list = catList(), n = list.length, h = '<div class="count">' + (n ? n + ' ' + plural(n, 'планировка', 'планировки', 'планировок') : 'Ничего не найдено') + '</div><div class="grid">';
    if (!n) h += '<p class="empty">Под эти параметры планировок нет. Измените площадь или число комнат.</p>';
    list.forEach(function (x) { var f = x.f, fv = favHas(f.id);
      h += '<button type="button" class="card' + (x.sold ? ' is-sold' : '') + '" data-flat="' + f.id + '"><span class="card__img"><img src="' + f.img + '" alt="" loading="lazy"></span>' + (fv ? '<span class="card__f">' + ic('heart') + '</span>' : '') +
        '<span class="card__b"><span class="card__n">' + esc(f.name) + '</span><span class="card__a">' + area(f.area) + '<small>м²</small></span>' +
        '<span class="card__p">' + (x.sold ? 'Продана' : mln(f.area * FULL) + '<small>при полной оплате</small>') + '</span></span></button>'; });
    return h + '</div>';
  }
  function openCatalog(floor) {
    hint.classList.add('is-off'); menuShow(false); cmpShow(false);
    S.stop = 'apts'; markStop('apts'); S.catFloor = floor == null ? null : +floor; if (S.catFloor != null) S.floor = S.catFloor;
    homeLimits();
    if (S.catFloor != null) { mark(S.catFloor); SC.select(S.catFloor); }
    else { mark(null); SC.select(null); if (!o_near()) flyCam(poseOf(null)); }
    showCatalog();
  }
  function o_near() { var p = poseOf(null); return ctx.controls.target.distanceTo(p.t) < 3 && Math.abs(ctx.camera.position.distanceTo(ctx.controls.target) - p.r) < p.r * 0.35; }
  function showCatalog() {
    S.view = 'catalog'; S.flat = null; S.special = null;
    var all = flatsOn(S.catFloor), rooms = [], n = all.length;
    all.forEach(function (x) { if (rooms.indexOf(x.f.rooms) < 0) rooms.push(x.f.rooms); }); rooms.sort();
    var as = all.map(function (x) { return x.f.area; }), mn = Math.min.apply(0, as), mx = Math.max.apply(0, as);
    var h = '<p class="eyebrow">' + (S.catFloor != null ? S.catFloor + ' этаж<button type="button" data-act="allfloors">Все этажи</button>' : 'Каталог') + '</p><h2>Квартиры</h2>' +
      '<p class="sub">' + n + ' ' + plural(n, 'планировка', 'планировки', 'планировок') + ' · от ' + area(mn) + ' до ' + area(mx) + ' м²</p>';
    h += '<div class="lbl"><span>Комнат</span></div><div class="chips"><button type="button" data-f="0"' + (S.rooms ? '' : ' class="is-on"') + '>Все</button>';
    rooms.forEach(function (r) { h += '<button type="button" data-f="' + r + '"' + (S.rooms === r ? ' class="is-on"' : '') + '>' + r + '-комн.</button>'; });
    h += '</div><div class="lbl"><span>Площадь</span><output id="oArea"></output></div>' +
      '<div class="dual" id="dual"><i class="dual__t"></i><input type="range" id="aLo" min="' + A_LO + '" max="' + A_HI + '" step="1" value="' + S.aMin + '" aria-label="Площадь от"><input type="range" id="aHi" min="' + A_LO + '" max="' + A_HI + '" step="1" value="' + S.aMax + '" aria-label="Площадь до"></div>' +
      '<div class="lbl"><span>Сортировка · площадь и цена</span></div><div class="seg"><button type="button" data-sort="asc"' + (S.sort === 'asc' ? ' class="is-on"' : '') + '>Сначала компактные</button><button type="button" data-sort="desc"' + (S.sort === 'desc' ? ' class="is-on"' : '') + '>Сначала просторные</button></div>' +
      '<div id="catGrid">' + gridHtml() + '</div>';
    if (GK.floorPlan) h += '<h3>План этажа</h3><button type="button" class="plan" data-zoom="' + GK.floorPlan + '"><img src="' + GK.floorPlan + '" alt="План типового этажа" loading="lazy"><span class="plan__z">' + ic('zoom') + 'Увеличить</span></button><p class="cap">План типового этажа</p>';
    h += '<p class="fine">Цены указаны при полной оплате. Квартиры сдаются без отделки. Наличие квартиры на выбранном этаже подтвердит менеджер.</p>';
    show(h, false); rangeSync();
  }
  function rangeSync(src) {
    var lo = $('aLo'), hi = $('aHi'); if (!lo || !hi) return;
    var a = +lo.value, b = +hi.value, gap = 4;
    if (b - a < gap) { if (src === hi) { a = Math.max(A_LO, b - gap); b = a + gap; } else { b = Math.min(A_HI, a + gap); a = b - gap; } lo.value = a; hi.value = b; }
    S.aMin = a; S.aMax = b;
    var d = $('dual'), sp = A_HI - A_LO; d.style.setProperty('--a', ((a - A_LO) / sp * 100) + '%'); d.style.setProperty('--b', ((b - A_LO) / sp * 100) + '%');
    $('oArea').textContent = a + ' – ' + b + ' м²';
    if (src) $('catGrid').innerHTML = gridHtml();
  }

  /* квартира: планировка, этаж, цена, действия, рассрочка */
  function floorOk(fl, id) { var c = GK.floorFlats[fl]; if (!c) return true; if (c.flats && c.flats.indexOf(id) < 0) return false; return !(c.sold && c.sold.indexOf(id) >= 0); }
  function showFlat(id) {
    var f = flatById[id]; if (!f) return; S.view = 'flat'; S.flat = id; S.special = null;
    if (!(S.floor >= FLOOR_MIN && S.floor <= FLOOR_MAX)) S.floor = FLOOR_DEF;
    var fl = '', n, canIn = !!mod('GKInterior', 'enter');
    for (n = FLOOR_MIN; n <= FLOOR_MAX; n++) fl += '<button type="button" data-fl="' + n + '"' + (n === S.floor ? ' class="is-on"' : '') + (floorOk(n, id) ? '' : ' disabled') + '>' + n + '</button>';
    var h = '<p class="eyebrow" id="fEye">Планировка · ' + S.floor + ' этаж</p><div class="fhead"><h2>' + esc(f.name) + '<small>' + area(f.area) + '<i>м²</i></small></h2>' +
      '<div class="fprice"><span>При полной оплате</span><b>' + rub(f.area * FULL) + '</b><small>' + rub(FULL) + ' за м²</small></div></div>' +
      '<button type="button" class="plan" data-zoom="' + f.img + '"><img src="' + f.img + '" alt="Планировка"><span class="plan__z">' + ic('zoom') + 'Увеличить</span></button>' +
      (f.note ? '<p class="note">' + esc(f.note) + '</p>' : '') +
      '<div class="lbl"><span>Этаж</span><em id="fFloor">' + S.floor + ' из ' + FLOOR_MAX + '</em></div><div class="chips chips--fl">' + fl + '</div>' +
      '<div class="acts">' + (canIn ? '<button type="button" class="btn btn--gold" data-act="enter">' + ic('door') + 'Зайти в квартиру</button>' : '') +
      '<button type="button" class="btn btn--line" data-act="show">' + ic('pin') + 'Показать на доме</button><button type="button" class="btn btn--line" data-act="fav" id="bFav"></button></div>' +
      '<section class="calc"><h3>Рассрочка от застройщика</h3><p class="sub">Без банков и ипотеки. Взнос от 10%, срок до 5 лет.</p>' +
      '<label>Первый взнос <output id="oDown"></output><input type="range" id="cDown" min="10" max="100" step="5" value="' + S.down + '"></label>' +
      '<label id="fMonths">Срок <output id="oMonths"></output><input type="range" id="cMonths" min="6" max="' + GK.maxMonths + '" step="6" value="' + S.months + '"></label>' +
      '<div class="rows"><div class="big" id="rMonth"><span>Платёж в месяц</span><b id="oMonth"></b></div><div><span>Первый взнос</span><b id="oFirst"></b></div>' +
      '<div><span>Цена за м²</span><b id="oM2"></b></div><div><span>Стоимость квартиры</span><b id="oTotal"></b></div></div></section>' +
      '<p class="fine">Рассрочка без банка, платежи ежемесячные и равные. Чем больше первый взнос, тем ниже цена метра. Квартира сдаётся без отделки. ' + esc(GK.deadline) + '.</p>' +
      callHtml('Отдел продаж');
    show(h, true); calc(); favSync();
  }
  function calc() {
    var f = flatById[S.flat], d = $('cDown'), m = $('cMonths'); if (!f || !d) return;
    var p = +d.value, n = +m.value, m2 = m2For(p), total = f.area * m2, first = total * p / 100, full = p === 100;
    S.down = p; S.months = n;
    [d, m].forEach(function (i) { i.style.setProperty('--p', ((i.value - i.min) / (i.max - i.min) * 100) + '%'); });
    $('oDown').textContent = full ? '100% · полная оплата' : p + '%';
    $('oMonths').textContent = n + ' мес.' + (n % 12 === 0 ? ' · ' + n / 12 + ' ' + (n === 12 ? 'год' : n < 60 ? 'года' : 'лет') : '');
    $('fMonths').hidden = full; $('rMonth').hidden = full;
    $('oMonth').textContent = rub(Math.round((total - first) / n / 100) * 100);
    $('oFirst').textContent = rub(first); $('oM2').textContent = rub(m2); $('oTotal').textContent = rub(total);
  }
  function pickFloor(n, fly) {
    S.floor = n; var e = $('fEye'), ff = $('fFloor'); if (e) e.textContent = 'Планировка · ' + n + ' этаж'; if (ff) ff.textContent = n + ' из ' + FLOOR_MAX;
    Array.prototype.forEach.call(body.querySelectorAll('[data-fl]'), function (b) { b.classList.toggle('is-on', +b.getAttribute('data-fl') === n); });
    favSync(); if (fly) { homeLimits(); mark(n); SC.select(n); }
  }
  function enterFlat() {
    var f = flatById[S.flat], fl = S.floor, I = mod('GKInterior', 'enter');
    if (!f || !I) { toast('Прогулка по квартире скоро будет доступна'); return; }
    resume = { flat: f.id, floor: fl };
    closePanel(); hideCard(); cam = null; clearTimeout(relaxT); ctx.limits(); curLim = false; SC.autoRotate(false);
    var ok = safe(function () { I.enter(fl, f); return true; });
    syncSub();
    setTimeout(function () { syncSub(); if (!S.sub && resume && !(typeof I.active === 'function' && safe(function () { return I.active(); }))) { backToFlat(); if (!ok) toast('Не удалось открыть квартиру'); } }, ok ? 1500 : 0);
  }
  function backToFlat() { var r = resume; resume = null; if (!r || !flatById[r.flat]) return; S.stop = 'apts'; markStop('apts'); S.floor = r.floor; mark(r.floor); showFlat(r.flat); }

  body.addEventListener('click', function (e) {
    var t = e.target.closest('[data-flat],[data-f],[data-zoom],[data-fl],[data-act],[data-sort]'); if (!t) return;
    if (t.hasAttribute('data-flat')) showFlat(t.getAttribute('data-flat'));
    else if (t.hasAttribute('data-f')) { S.rooms = +t.getAttribute('data-f'); Array.prototype.forEach.call(body.querySelectorAll('[data-f]'), function (b) { b.classList.toggle('is-on', +b.getAttribute('data-f') === S.rooms); }); $('catGrid').innerHTML = gridHtml(); }
    else if (t.hasAttribute('data-sort')) { S.sort = t.getAttribute('data-sort'); Array.prototype.forEach.call(body.querySelectorAll('[data-sort]'), function (b) { b.classList.toggle('is-on', b.getAttribute('data-sort') === S.sort); }); $('catGrid').innerHTML = gridHtml(); }
    else if (t.hasAttribute('data-fl')) pickFloor(+t.getAttribute('data-fl'), true);
    else if (t.hasAttribute('data-zoom')) zoomShow(t.getAttribute('data-zoom'));
    else { var a = t.getAttribute('data-act');
      if (a === 'enter') enterFlat();
      else if (a === 'show') { pickFloor(S.floor, true); toast(S.floor + ' этаж подсвечен на доме'); }
      else if (a === 'fav') favToggle(S.flat, S.floor);
      else if (a === 'allfloors') openCatalog(null); }
  });
  body.addEventListener('input', function (e) { var id = e.target.id; if (id === 'aLo' || id === 'aHi') rangeSync(e.target); else calc(); });
  back.addEventListener('click', function () { showCatalog(); });
  $('pClose').addEventListener('click', close);
  function zoomShow(src) { $('zoomImg').src = src; zoom.hidden = false; }
  zoom.addEventListener('click', function () { zoom.hidden = true; });

  /* ---------- избранное и сравнение (хранится только на этом устройстве) ---------- */
  var FKEY = 'gk-tour-fav', favs = safe(function () { return JSON.parse(localStorage.getItem(FKEY) || '[]'); }) || [];
  favs = favs.filter(function (k) { return typeof k === 'string' && flatById[k.split('@')[0]]; });
  function favSave() { safe(function () { localStorage.setItem(FKEY, JSON.stringify(favs)); }); }
  function favHas(id, fl) { return favs.some(function (k) { var p = k.split('@'); return p[0] === id && (fl == null || +p[1] === +fl); }); }
  function favToggle(id, fl) {
    if (!id) return; var k = id + '@' + fl, i = favs.indexOf(k);
    if (i >= 0) { favs.splice(i, 1); toast('Убрано из избранного'); } else { favs.push(k); toast('Добавлено в избранное · ' + favs.length); }
    favSave(); favSync();
  }
  function favSync() {
    var n = favs.length, lab = ic('heart') + '<span>Избранное</span><b>' + n + '</b>';
    favBtn.hidden = !n; favBtn.innerHTML = lab; pFav.hidden = !n; pFav.innerHTML = ic('heart') + 'Избранное <b>' + n + '</b>';
    var b = $('bFav'); if (b) { var on = favHas(S.flat, S.floor); b.classList.toggle('is-on', on); b.innerHTML = ic('heart') + (on ? 'В избранном' : 'В избранное'); }
    if (cmp.classList.contains('is-on')) { if (n) renderCmp(); else cmpShow(false); }
  }
  function renderCmp() {
    var p = S.down, n = S.months, m2 = m2For(p), full = p === 100;
    var h = '<div class="cmp__head"><div><p class="eyebrow">Избранное · ' + favs.length + '</p><h2>Сравнение квартир</h2><p>' + (full ? 'Расчёт при полной оплате.' : 'Расчёт рассрочки: первый взнос ' + p + '%, срок ' + n + ' мес. Изменить условия можно в карточке квартиры.') + '</p></div>' +
      '<button type="button" class="cmp__x" data-k="x" aria-label="Закрыть">' + ic('x') + '</button></div><div class="cmp__list">';
    favs.forEach(function (k, i) {
      var q = k.split('@'), f = flatById[q[0]], fl = +q[1], total = f.area * m2, first = total * p / 100;
      h += '<article class="cmp__col" style="animation-delay:' + (i * 60) + 'ms"><span class="cmp__plan"><img src="' + f.img + '" alt=""></span><div class="cmp__b"><small>' + fl + ' этаж</small><h3>' + esc(f.name) + '</h3></div><div class="cmp__rows">' +
        '<div><span>Площадь</span><b>' + area(f.area) + ' м²</b></div><div><span>При полной оплате</span><b>' + rub(f.area * FULL) + '</b></div>' +
        (full ? '' : '<div><span>В рассрочку</span><b>' + rub(total) + '</b></div><div><span>Первый взнос</span><b>' + rub(first) + '</b></div><div class="big"><span>Платёж в месяц</span><b>' + rub(Math.round((total - first) / n / 100) * 100) + '</b></div>') +
        '</div><div class="cmp__act"><button type="button" class="btn btn--line" data-k="open" data-v="' + k + '">Открыть</button><button type="button" class="btn btn--line btn--del" data-k="del" data-v="' + k + '" aria-label="Убрать из избранного">' + ic('x') + '</button></div></article>';
    });
    cmp.innerHTML = h + '</div><p class="cmp__foot">Предварительный расчёт, не является публичной офертой. Наличие квартиры на выбранном этаже и график платежей подтвердит менеджер.</p>';
  }
  function cmpShow(on) { if (on && !favs.length) return; if (on) renderCmp(); cmp.classList.toggle('is-on', !!on); cmp.setAttribute('aria-hidden', on ? 'false' : 'true'); }
  favBtn.addEventListener('click', function () { cmpShow(true); }); pFav.addEventListener('click', function () { cmpShow(true); });
  cmp.addEventListener('click', function (e) {
    var b = e.target.closest('[data-k]'); if (!b) return; var k = b.getAttribute('data-k'), v = b.getAttribute('data-v');
    if (k === 'x') cmpShow(false);
    else if (k === 'del') { var i = favs.indexOf(v); if (i >= 0) favs.splice(i, 1); favSave(); favSync(); }
    else if (k === 'open') { var q = v.split('@'); cmpShow(false); S.catFloor = null; S.floor = +q[1]; S.stop = 'apts'; markStop('apts'); homeLimits(); mark(S.floor); SC.select(S.floor); showFlat(q[0]); }
  });

  /* ---------- подвиды: паркинг и квартира (модули сами рисуют свой интерфейс) ---------- */
  function syncSub() {
    var v = app.classList.contains('view-parking') ? 'parking' : app.classList.contains('view-interior') ? 'interior' : null;
    if (v === S.sub) return; var was = S.sub; S.sub = v;
    if (v) { cam = null; clearTimeout(relaxT); curLim = false; menuShow(false); cmpShow(false); zoom.hidden = true; tip.hidden = true; hideCard(); if (panel.classList.contains('is-open')) closePanel(true); hint.classList.add('is-off'); layout(); return; }
    buildModes();
    if (tour.on || startOn) { layout(); return; }
    if (was === 'interior' && resume) backToFlat();
    else if (was === 'parking') { S.stop = 'parking'; markStop('parking'); mark(null); if (stopIdx.parking != null) showCard(stopIdx.parking); }
    else { S.stop = 'overview'; markStop('overview'); }
    layout();
  }
  if (window.MutationObserver) new MutationObserver(syncSub).observe(app, { attributes: true, attributeFilter: ['class'] });
  D.addEventListener('gk:view', function () { setTimeout(syncSub, 0); });
  function leaveSub() {
    var P = mod('GKParking', 'exit'), I = mod('GKInterior', 'exit');
    if (P && (app.classList.contains('view-parking') || (typeof P.active === 'function' && safe(function () { return P.active(); })))) safe(function () { P.exit(); });
    if (I && (app.classList.contains('view-interior') || (typeof I.active === 'function' && safe(function () { return I.active(); })))) safe(function () { I.exit(); });
    syncSub();
  }

  /* ---------- автотур ---------- */
  var SEC = (GK.tour && GK.tour.stopSec) || 9;
  function tourPlay(attract) {
    if (tour.on || !STOPS.length) return;
    hideStart(true); menuShow(false); cmpShow(false); zoom.hidden = true; closePanel(); hideCard(); hint.classList.add('is-off'); leaveSub();
    tour.on = true; tour.attract = !!attract; app.classList.add('is-touring'); tourCatch.hidden = false; layout(); tourStep(0);
  }
  function tourStep(i) {
    if (!tour.on) return;
    if (S.sub) leaveSub();
    if (i >= STOPS.length) return tourStop(true);
    tour.i = i; var s = STOPS[i], sec = SEC;
    $('capN').innerHTML = num2(i) + '<small>/ ' + num2(STOPS.length - 1) + '</small>'; $('capT').textContent = s.title; $('capS').textContent = s.caption || s.text || '';
    caption.style.setProperty('--d', sec + 's'); caption.classList.remove('is-run'); void caption.offsetWidth; caption.classList.add('is-on', 'is-run');
    var drift = function () { if (tour.on && !S.sub) SC.autoRotate(true); };
    if (s.key === 'parking') { if (!enterParking()) { closePanel(); S.stop = s.key; markStop(s.key); flyCam({ t: new T.Vector3(0, 6, 0), r: ctx.homeDist() * 0.8, th: -1.25, ph: 1.44, lim: null }, true, drift); } }
    else if (s.key === 'apts') { S.stop = s.key; markStop(s.key); flyCam(poseOf(null), true, function () { if (!tour.on) return; var f = Math.min(FLOOR_MAX, 6); mark(f); SC.select(f); }); }
    else goStop(s.key, { quiet: true, slow: true, done: drift });
    clearTimeout(tour.timer); tour.timer = setTimeout(function () { tourStep(i + 1); }, sec * 1000);
  }
  function tourStop(finished) {
    if (!tour.on) return;
    tour.on = false; clearTimeout(tour.timer); app.classList.remove('is-touring'); caption.classList.remove('is-on', 'is-run'); SC.autoRotate(false);
    setTimeout(function () { tourCatch.hidden = true; }, 60);
    last = Date.now();
    if (finished) { leaveSub(); mark(null); SC.select(null); if (tour.attract) showStart(); else goStop('overview'); return; }
    if (S.sub) { layout(); return; }
    var s = STOPS[tour.i];
    if (s && s.key === 'apts') { openCatalog(null); return; }
    if (s && s.key === 'parking') { goStop('parking', { card: true }); return; }
    if (s) { S.stop = s.key; markStop(s.key); showCard(tour.i); }
    layout();
  }
  $('btnAuto').addEventListener('click', function () { tourPlay(false); });
  tourCatch.addEventListener('pointerup', function () { tourStop(false); });

  /* ---------- начальный экран ---------- */
  function showStart() {
    if (tour.on) tourStop(false);
    leaveSub(); menuShow(false); cmpShow(false); zoom.hidden = true; closePanel(); hideCard(); mark(null); SC.select(null); S.stop = null; markStop(null);
    startOn = true; startEl.hidden = false; void startEl.offsetWidth; startEl.classList.add('is-on'); app.classList.add('is-start');
    ctx.picking(false); homeLimits(); flyCam(poseOf(null), true, function () { if (startOn) SC.autoRotate(true); }); if (!cam) SC.autoRotate(true);
    layout(); last = Date.now();
  }
  function hideStart(quiet) {
    if (!startOn) return; startOn = false;
    startEl.classList.remove('is-on'); app.classList.remove('is-start'); setTimeout(function () { if (!startOn) startEl.hidden = true; }, 850);
    ctx.picking(true); SC.autoRotate(false); buildModes(); layout();
    if (!quiet) { hint.classList.remove('is-off'); setTimeout(function () { hint.classList.add('is-off'); }, 9000); }
  }
  $('stGo').addEventListener('click', function () { hideStart(); goStop('overview'); });
  $('stFlats').addEventListener('click', function () { hideStart(true); openCatalog(null); });

  /* ---------- события сцены и клавиатура ---------- */
  SC.on('pick', function (key) { if (!tour.on && !startOn && !S.sub) open(key); });
  SC.on('hover', function (h) {
    if (h.key == null || startOn || tour.on) { tip.hidden = true; return; }
    tip.textContent = h.key === 'roof' ? 'Крыша · лаунж-зона' : h.key === 1 ? '1 этаж · коммерция' : h.key + ' этаж · квартиры';
    tip.style.left = h.x + 'px'; tip.style.top = h.y + 'px'; tip.hidden = false;
  });
  SC.on('act', function () { hint.classList.add('is-off'); });
  window.addEventListener('resize', layout);
  D.addEventListener('fullscreenchange', function () { if (menu.classList.contains('is-on')) buildMenu(); });
  D.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (tour.on) tourStop(false); else if (!zoom.hidden) zoom.hidden = true; else if (menu.classList.contains('is-on')) menuShow(false); else if (cmp.classList.contains('is-on')) cmpShow(false); else if (panel.classList.contains('is-open')) close();
  });
  D.addEventListener('contextmenu', function (e) { e.preventDefault(); });

  /* ---------- режим витрины: никто не трогает экран → медленное вращение → начальный экран → автотур по кругу ---------- */
  var last = Date.now();
  function act() { last = Date.now(); if (!tour.on && !startOn) SC.autoRotate(false); }
  ['pointerdown', 'wheel', 'keydown', 'input'].forEach(function (n) { D.addEventListener(n, act, { passive: true, capture: true }); });
  function kioskReset() {
    favs = []; favSave(); favSync();
    S.rooms = 0; S.aMin = A_LO; S.aMax = A_HI; S.sort = 'asc'; S.down = 30; S.months = 36; S.floor = FLOOR_DEF; S.catFloor = null; resume = null;
    if (ctx.MODES && ctx.MODES.day && SC.mode() !== 'day') setMode('day');
    showStart();
  }
  if (KIOSK) setInterval(function () {
    if (tour.on || D.hidden) return;
    var idle = (Date.now() - last) / 1000;
    if (startOn) { if (idle > 45) tourPlay(true); return; }
    if (idle > 150) { kioskReset(); return; }
    if (idle > 20 && !S.sub && !panel.classList.contains('is-open') && !cmp.classList.contains('is-on') && !cam && (S.stop == null || S.stop === 'overview')) SC.autoRotate(true);
  }, 1000);

  /* ---------- запуск ---------- */
  favSync(); layout();
  if (WITH_START) { startOn = true; startEl.hidden = false; startEl.classList.add('is-on'); app.classList.add('is-start'); ctx.picking(false); SC.autoRotate(true); layout(); }
  else { S.stop = 'overview'; markStop('overview'); hint.classList.remove('is-off'); }
  syncSub();
  (function () {
    var t0 = performance.now(), done = function () { if (window.__gkBoot) window.__gkBoot(100, 'Добро пожаловать'); setTimeout(function () { boot.classList.add('is-off'); setTimeout(function () { boot.hidden = true; }, 950); }, ROBOT ? 0 : Math.max(250, 900 - (performance.now() - t0))); };
    if (ROBOT) return done();
    var fr = 0, tick = function () { if (++fr >= 3) done(); else requestAnimationFrame(tick); }; requestAnimationFrame(tick);
    setTimeout(function () { if (!boot.classList.contains('is-off')) done(); }, 4000);
  })();

  /* для проверки и для других модулей */
  window.GKUI = { goStop: goStop, openCatalog: openCatalog, openFlat: function (id, floor) { if (floor) S.floor = +floor; S.stop = 'apts'; markStop('apts'); showFlat(id); }, open: open, close: close,
    tourPlay: tourPlay, tourStop: tourStop, showStart: showStart, hideStart: hideStart, compare: cmpShow, favToggle: favToggle, setMode: setMode, state: S, layout: layout };
})();
