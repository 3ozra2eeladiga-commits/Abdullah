/* ЖК «Новый Квартал» — анимации и интерактив */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  /* ---------- данные ---------- */
  var FLATS = [
    // 1-комнатные: 4 утверждённые планировки (ТЗ заказчика), у каждой площади — своя планировка
    { key: '1a', tab: '1-комнатная', type: '1-комнатная', img: 'img/plans/1k-4564.webp', areas: [45.64] },
    { key: '1b', tab: '1-комнатная', type: '1-комнатная', img: 'img/plans/1k-4650.webp', areas: [46.50] },
    { key: '1c', tab: '1-комнатная', type: '1-комнатная', img: 'img/plans/1k-4689.webp', areas: [46.89] },
    { key: '1d', tab: '1-комнатная', type: '1-комнатная', img: 'img/plans/1k-4826.webp', areas: [48.26] },
    { key: 'e2', tab: 'Евро-2', type: 'Евро-двушка', img: 'img/plans/e2-a.webp', areas: [52.06], note: 'Спальня 14,62 м², комната с мини-кухней 18,38 м², балкон.' },
    { key: '2a', tab: '2-комнатная', type: '2-комнатная', img: 'img/plans/2k-a.webp', areas: [64.78, 68.5, 69.49], note: 'Две изолированные комнаты, просторная кухня.' },
    { key: '2b', tab: '2-комнатная · 76–81', type: '2-комнатная', img: 'img/plans/2k-b.webp', areas: [76.19, 76.25, 77.56, 81.37], note: 'Вытянутая планировка вдоль фасада, много окон.' },
    { key: '2c', tab: '2-комнатная · 86,68', type: '2-комнатная', img: 'img/plans/2k-c.webp', areas: [86.68], note: 'Самая большая двушка в доме.' },
    { key: '3a', tab: '3-комнатная', type: '3-комнатная', img: 'img/plans/3k-a.webp', areas: [105.63], note: 'Три комнаты, кухня-гостиная и две ванные зоны.' }
  ];
  var GALLERY = ['img/photo/corner-morning.webp', 'img/photo/closeup.webp', 'img/photo/front.webp', 'img/photo/corner-sunset.webp',
    'img/photo/yard-clean.webp', 'img/photo/roof.webp', 'img/photo/commerce.webp', 'img/photo/parking.webp'];

  var fmt = function (a) { return a.toFixed(2).replace('.', ','); };

  /* ---------- шапка и меню ---------- */
  var hdr = $('#hdr'), menu = $('#menu'), btn = $('#menuBtn');
  var onScroll = function () {
    var past = window.scrollY > window.innerHeight * 0.9;
    hdr.classList.toggle('is-solid', past);
    document.body.classList.toggle('past-hero', past);
  };
  window.addEventListener('scroll', onScroll, { passive: true }); onScroll();
  var setMenu = function (open) {
    menu.classList.toggle('is-open', open); menu.setAttribute('aria-hidden', open ? 'false' : 'true');
    btn.setAttribute('aria-expanded', open ? 'true' : 'false'); document.body.classList.toggle('lock', open);
  };
  btn.addEventListener('click', function () { setMenu(!menu.classList.contains('is-open')); });
  $$('a', menu).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  /* ---------- квартиры: карточки по типам + отдельное окно с вариантами (как на хороших сайтах ЖК) ---------- */
  var TYPES = [
    { key: '1', short: '1К', name: '1-комнатная', note: 'Для одного или пары. Компактная планировка с отдельной кухней.' },
    { key: 'e2', short: 'Е2', name: 'Евро-двушка', note: 'Спальня и кухня-гостиная — современный формат.' },
    { key: '2', short: '2К', name: '2-комнатная', note: 'Две изолированные комнаты — для семьи или с кабинетом.' },
    { key: '3', short: '3К', name: '3-комнатная', note: 'Самая просторная квартира в доме — для большой семьи.' }
  ];
  var VARIANTS = {};
  FLATS.forEach(function (f) {
    var key = f.key === 'e2' ? 'e2' : f.key.charAt(0);
    (VARIANTS[key] = VARIANTS[key] || []);
    f.areas.forEach(function (ar) { VARIANTS[key].push({ area: ar, img: f.img }); });
  });
  Object.keys(VARIANTS).forEach(function (k) { VARIANTS[k].sort(function (a, b) { return a.area - b.area; }); });

  var ft = $('#ftypes');
  TYPES.forEach(function (t, ti) {
    var v = VARIANTS[t.key] || [], min = v[0].area, max = v[v.length - 1].area, img = (v.find(function (x) { return x.img; }) || {}).img;
    var c = document.createElement('button'); c.type = 'button'; c.className = 'ftype fade';
    c.innerHTML = '<span class="ftype__plan">' + (img ? '<img src="' + img + '" alt="Планировка: ' + t.name + '" loading="lazy">' : '<i>Планировка по запросу</i>') + '</span>' +
      '<span class="ftype__body"><span class="ftype__name">' + t.name + '</span>' +
      '<span class="ftype__area">' + (min === max ? fmt(min) : fmt(min) + '–' + fmt(max)) + '<small>м²</small></span>' +
      '<span class="ftype__note">' + t.note + '</span>' +
      '<span class="ftype__foot"><span>' + (t.key === '1' ? '' : v.length + ' ' + (v.length === 1 ? 'вариант' : v.length < 5 ? 'варианта' : 'вариантов')) + '</span><b>Смотреть →</b></span></span>';
    c.addEventListener('click', function () { openWin(ti, 0); });
    ft.appendChild(c);
  });

  var win = $('#fwin'), wt = 0, wv = 0;
  document.body.appendChild(win);   // окно поверх всего сайта (вне слоя main)
  function show(ti, vi) {
    var t = TYPES[ti], v = VARIANTS[t.key]; wt = ti; wv = (vi + v.length) % v.length;
    var cur = v[wv];
    $('#fwTitle').innerHTML = t.name + '<br>' + fmt(cur.area) + ' м²';
    $('#fwCrumb').textContent = t.name;
    var img = $('#fwImg');
    if (cur.img) { img.hidden = false; img.src = cur.img; img.alt = 'Планировка: ' + t.name + ', ' + fmt(cur.area) + ' м²'; $('#fwNoImg').hidden = true; }
    else { img.hidden = true; img.removeAttribute('src'); $('#fwNoImg').hidden = false; }
    $('#fwCount').textContent = v.length > 1 ? (wv + 1) + ' / ' + v.length : '';
    $$('.fwin__arr').forEach(function (a) { a.style.display = v.length > 1 ? '' : 'none'; });
    $('#fwSpecs').innerHTML = '<div><dt>Тип</dt><dd>' + t.name + '</dd></div><div><dt>Площадь общая</dt><dd>' + fmt(cur.area) + ' м²</dd></div><div><dt>Вариант</dt><dd>' + (wv + 1) + ' из ' + v.length + '</dd></div><div><dt>Сдача</dt><dd>I кв. 2028</dd></div>';
    $('#fwNote').textContent = t.note;
    var ar = $('#fwAreas'); ar.innerHTML = '';
    v.forEach(function (x, k) { var b = document.createElement('button'); b.type = 'button'; b.textContent = fmt(x.area) + ' м²'; if (k === wv) b.classList.add('is-on'); b.addEventListener('click', function () { show(ti, k); }); ar.appendChild(b); });
  }
  function openWin(ti, vi) { show(ti, vi); win.classList.add('is-open'); win.setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); }
  function closeWin() { win.classList.remove('is-open'); win.setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock'); }
  win.addEventListener('click', function (e) {
    if (e.target === win || e.target.closest('[data-fclose]')) closeWin();
    var s = e.target.closest('[data-fstep]'); if (s) show(wt, wv + (+s.getAttribute('data-fstep')));
  });
  document.addEventListener('keydown', function (e) {
    if (!win.classList.contains('is-open')) return;
    if (e.key === 'Escape') closeWin(); if (e.key === 'ArrowRight') show(wt, wv + 1); if (e.key === 'ArrowLeft') show(wt, wv - 1);
  });
  var fsx = null;
  $('#fwPlan').addEventListener('touchstart', function (e) { fsx = e.touches[0].clientX; }, { passive: true });
  $('#fwPlan').addEventListener('touchend', function (e) { if (fsx === null) return; var d = e.changedTouches[0].clientX - fsx; if (Math.abs(d) > 45) show(wt, wv + (d < 0 ? 1 : -1)); fsx = null; });
  $('#fwImg').addEventListener('click', function () { var v = VARIANTS[TYPES[wt].key][wv]; if (v.img) openLb([v.img], 0); });

  /* ---------- галерея + lightbox ---------- */
  var track = $('#galTrack'), lb = $('#lb'), lbImg = $('#lbImg'), list = [], idx = 0;
  // «Стол архитектора»: фото лежат стопкой отпечатков; свайп — верхнее улетает и уходит вниз стопки; нажатие — на весь экран
  (function () {
    var stack = $('#deskStack'); if (!stack) return;
    var CAPS = ['Утро', 'Стеклянная башня', 'Главный фасад', 'Закат', 'Двор без машин', 'Лаунж на крыше', 'Коммерция', 'Паркинг'];
    var cards = [], order = [], N = GALLERY.length, busy = false;
    GALLERY.forEach(function (src, i) {
      var c = document.createElement('figure'); c.className = 'pcard';
      c.innerHTML = '<img src="' + src + '" alt="ЖК «Новый Квартал» — ' + (CAPS[i] || 'фото') + '" loading="lazy" draggable="false"><figcaption>' + (CAPS[i] || '') + '</figcaption>';
      c._r = (Math.random() * 12 - 6); c._x = Math.random() * 24 - 12; c._y = Math.random() * 16 - 8; c._i = i;
      stack.appendChild(c); cards.push(c);
    });
    order = cards.slice().reverse();
    function rest(c, k) { c.style.zIndex = k + 1; c.style.transform = 'translate(-50%,-50%) translate(' + c._x + 'px,' + c._y + 'px) rotate(' + c._r + 'deg)'; }
    function layout() { order.forEach(rest); var top = order[order.length - 1]; $('#deskN').textContent = (top._i + 1) + ' / ' + N; $('#deskCap').textContent = CAPS[top._i] || ''; }
    layout();
    var hinted = false; function hideHint() { if (!hinted) { hinted = true; $('#deskHint').classList.add('is-off'); } }
    function throwTop(dir) {
      if (busy) return; busy = true; hideHint();
      var c = order[order.length - 1];
      c.style.transition = 'transform .5s cubic-bezier(.3,.6,.3,1), opacity .5s';
      c.style.transform = 'translate(-50%,-50%) translate(' + dir * window.innerWidth * 0.9 + 'px,-40px) rotate(' + (dir * 32) + 'deg)';
      c.style.opacity = '0';
      setTimeout(function () {
        order.pop(); order.unshift(c);
        c.style.transition = 'none'; c._r = Math.random() * 12 - 6; layout(); void c.offsetWidth;
        c.style.transition = 'opacity .45s'; c.style.opacity = '1'; busy = false;
      }, 480);
    }
    function back() {
      if (busy) return; busy = true; hideHint();
      var c = order.shift(); order.push(c);
      c.style.transition = 'none'; c.style.opacity = '0';
      c.style.transform = 'translate(-50%,-50%) translate(' + (-window.innerWidth * 0.9) + 'px,-40px) rotate(-32deg)'; c.style.zIndex = N + 1; void c.offsetWidth;
      c.style.transition = 'transform .5s cubic-bezier(.3,.6,.3,1), opacity .4s'; c.style.opacity = '1'; layout();
      setTimeout(function () { busy = false; }, 500);
    }
    var drag = null;
    stack.addEventListener('pointerdown', function (e) {
      var c = e.target.closest('.pcard'); if (!c || c !== order[order.length - 1] || busy) return;
      drag = { c: c, x: e.clientX, y: e.clientY, dx: 0, dy: 0, t: Date.now(), moved: false };
      c.style.transition = 'none'; try { c.setPointerCapture(e.pointerId); } catch (err) {}
    });
    stack.addEventListener('pointermove', function (e) {
      if (!drag) return; drag.dx = e.clientX - drag.x; drag.dy = e.clientY - drag.y;
      if (Math.abs(drag.dx) > 6) drag.moved = true;
      var c = drag.c; c.style.transform = 'translate(-50%,-50%) translate(' + (c._x + drag.dx) + 'px,' + (c._y + drag.dy * 0.3) + 'px) rotate(' + (c._r + drag.dx * 0.06) + 'deg)';
    });
    function end() {
      if (!drag) return; var d = drag; drag = null;
      var v = Math.abs(d.dx) / Math.max(1, Date.now() - d.t);
      if (Math.abs(d.dx) > 80 || (v > 0.6 && Math.abs(d.dx) > 30)) { throwTop(d.dx > 0 ? 1 : -1); return; }
      d.c.style.transition = 'transform .35s cubic-bezier(.3,1.4,.5,1)'; rest(d.c, order.length - 1);
      if (!d.moved && Math.abs(d.dy) < 8) openLb(GALLERY, d.c._i);
    }
    stack.addEventListener('pointerup', end);
    stack.addEventListener('pointercancel', function () { if (drag) drag.moved = true; end(); });
    $$('[data-gal]').forEach(function (b) { b.addEventListener('click', function () { if (+b.dataset.gal > 0) throwTop(1); else back(); }); });
  })();

  var showLb = function () {
    lbImg.src = list[idx]; lbImg.classList.toggle('is-plan', /plan/.test(list[idx]));
    $('#lbN').textContent = list.length > 1 ? (idx + 1) + ' / ' + list.length : '';
    $$('.lb__arr').forEach(function (a) { a.style.display = list.length > 1 ? '' : 'none'; });
  };
  var openLb = function (l, i) { list = l; idx = i; showLb(); lb.classList.add('is-open'); lb.setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); };
  var closeLb = function () { lb.classList.remove('is-open'); lb.setAttribute('aria-hidden', 'true'); document.body.classList.remove('lock'); };
  var step = function (d) { idx = (idx + d + list.length) % list.length; showLb(); };
  lb.addEventListener('click', function (e) { if (e.target === lb || e.target.closest('[data-close]')) closeLb(); });
  $$('[data-lb]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); step(+b.dataset.lb); }); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { closeLb(); setMenu(false); }
    if (lb.classList.contains('is-open')) { if (e.key === 'ArrowLeft') step(-1); if (e.key === 'ArrowRight') step(1); }
  });
  var tx = null;
  lb.addEventListener('touchstart', function (e) { tx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) { if (tx === null) return; var d = e.changedTouches[0].clientX - tx; if (Math.abs(d) > 50 && list.length > 1) step(d < 0 ? 1 : -1); tx = null; });
  $$('[data-zoom]').forEach(function (b) { b.addEventListener('click', function () { openLb([b.dataset.zoom], 0); }); });
  $('#lbImg').addEventListener('load', function () { /* план на светлом фоне */ });

  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* ---------- анимации ---------- */
  if (!hasGsap || reduce) return;
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
  ST.config({ ignoreMobileResize: true });   // телефон: панель браузера прячется — не пересчитываем всё (иначе страница «прыгает»)
  document.documentElement.classList.add('js-anim');

  // заголовки: разбиваем на слова
  $$('.split').forEach(function (el) {
    var html = el.innerHTML.split(/(<br\s*\/?>)/i).map(function (part) {
      if (/^<br/i.test(part)) return part;
      return part.split(/(\s+|&nbsp;)/).map(function (w) {
        if (!w.trim() || w === '&nbsp;') return w === '&nbsp;' ? ' ' : w;
        return '<span class="w"><span>' + w + '</span></span>';
      }).join('');
    }).join('');
    el.innerHTML = html;
    gsap.from($$('.w > span', el), { yPercent: 110, duration: 1.1, ease: 'power4.out', stagger: 0.06, scrollTrigger: { trigger: el, start: 'top 85%' } });
  });

  $$('.fade').forEach(function (el) {
    gsap.to(el, { opacity: 1, y: 0, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 90%' } });
  });

  // hero: появление
  gsap.from('.hero__line > span', { yPercent: 105, duration: 1.4, ease: 'power4.out', stagger: 0.12, delay: 0.15 });
  gsap.from('.hero__lead, .hero__foot, .hero__progress', { opacity: 0, y: 16, duration: 1, delay: 0.7, stagger: 0.1 });

  // hero: утро → закат при прокрутке
  var htl = gsap.timeline({ scrollTrigger: { trigger: '#hero', start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
  htl.to('#heroBar', { scaleY: 1, ease: 'none' }, 0)
     .to('.hero__line:first-child > span', { xPercent: -4, ease: 'none' }, 0)
     .to('.hero__line--r > span', { xPercent: 4, ease: 'none' }, 0)
     ;

  // первый экран: кадры видео рисует js/frames.js; здесь — надписи поверх
  (function () {
    var hero = document.getElementById('hero'), city = document.getElementById('heroCity');
    window.ScrollTrigger.create({
      trigger: '#hero', start: 'top top', end: 'bottom bottom',
      onUpdate: function (st) {
        hero.classList.toggle('is-moving', st.progress > 0.025);
        var c = st.progress, o = c < 0.06 ? 0 : c < 0.11 ? (c - 0.06) / 0.05 : c < 0.44 ? 1 : c < 0.52 ? (0.52 - c) / 0.08 : 0;
        if (city) { city.style.opacity = o; city.style.transform = 'scale(' + (1.06 - 0.06 * o) + ')'; }
      }
    });
  })();

  // цифры
  $$('.num').forEach(function (el) {
    var to = +el.dataset.to, o = { v: 0 };
    el.textContent = '0';
    gsap.to(o, { v: to, duration: 1.8, ease: 'power2.out', scrollTrigger: { trigger: el, start: 'top 88%' }, onUpdate: function () { el.textContent = Math.round(o.v); } });
  });

  // параллакс картинок
  $$('.par').forEach(function (el) {
    var s = +el.dataset.speed || 6;
    gsap.fromTo($('img', el), { yPercent: -s, scale: 1.15 }, { yPercent: s, scale: 1.15, ease: 'none', scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true } });
  });
  $$('.par-bg').forEach(function (el) {
    gsap.fromTo(el, { yPercent: -8 }, { yPercent: 8, ease: 'none', scrollTrigger: { trigger: el.parentNode, start: 'top bottom', end: 'bottom top', scrub: true } });
  });

  // фасад: полоса раскрывается во весь экран
  var mobile = window.matchMedia('(max-width: 760px)').matches;
  var ftl = gsap.timeline({ scrollTrigger: { trigger: '#facade', start: 'top top', end: 'bottom bottom', scrub: 0.6 } });
  ftl.fromTo('#facadeMask', { clipPath: mobile ? 'inset(18% 34% 18% 34%)' : 'inset(14% 44% 14% 44%)' }, { clipPath: 'inset(0% 0% 0% 0%)', ease: 'power2.inOut' }, 0)
     .fromTo('#facadeMask img', { scale: 1.25 }, { scale: 1, ease: 'power2.inOut' }, 0)
     .from('.facade__copy', { opacity: 0, y: 40, ease: 'power2.out', duration: 0.4 }, 0.35);
  ftl.fromTo('#facadeVideo', { scale: 1.25 }, { scale: 1, ease: 'power2.inOut' }, 0);

  // двое рабочих тянут края фото тросами в стороны
  (function () {
    var mask = document.getElementById('facadeMask'), pull = document.getElementById('pull');
    if (!mask || !pull) return;
    var L = document.getElementById('pullL'), R = document.getElementById('pullR');
    var rl = document.getElementById('ropeL'), rr = document.getElementById('ropeR');
    var lastL = null, still = 0, dustT = 0;
    function dust(x, y, dir) {
      var d = document.createElement('i'); d.className = 'pull__dust';
      d.style.left = x + 'px'; d.style.top = (y - 4) + 'px'; d.style.setProperty('--dx', (dir * 18) + 'px');
      pull.appendChild(d); setTimeout(function () { d.remove(); }, 700);
    }
    gsap.ticker.add(function () {
      var raw = /inset\(([^)]*)\)/.exec(mask.style.clipPath || '');
      if (!raw) { pull.style.opacity = 0; return; }
      var v = raw[1].trim().split(/\s+/).map(parseFloat);
      if (v.length === 1) v = [v[0], v[0], v[0], v[0]]; else if (v.length === 2) v = [v[0], v[1], v[0], v[1]]; else if (v.length === 3) v = [v[0], v[1], v[2], v[1]];
      var m = [0, v[0], v[1], v[2], v[3]];
      var W = pull.clientWidth, H = pull.clientHeight;
      var top = +m[1], right = +m[2], left = +m[4];
      var xl = W * left / 100, xr = W * (1 - right / 100);
      var gap = Math.min(W * 0.12, 120);                       // рабочие стоят в стороне от края
      var foot = H * (1 - top / 100) + 6;                     // стоят на уровне низа картинки
      var hand = foot - (L.offsetHeight || 80) * 0.55;
      var manL = xl - gap, manR = xr + gap;
      L.style.left = manL + 'px'; R.style.left = manR + 'px'; L.style.top = R.style.top = foot + 'px';
      rl.setAttribute('x1', xl); rl.setAttribute('y1', H * 0.5); rl.setAttribute('x2', manL + 14); rl.setAttribute('y2', hand);
      rr.setAttribute('x1', xr); rr.setAttribute('y1', H * 0.5); rr.setAttribute('x2', manR - 14); rr.setAttribute('y2', hand);
      var vis = left > 0.6 && left < 49;                       // когда фото раскрылось — рабочие уходят
      pull.style.opacity = vis ? 1 : 0;
      pull.style.transition = 'opacity .35s';
      var moving = lastL !== null && Math.abs(left - lastL) > 0.02;
      if (moving) still = 0; else still++;
      pull.classList.toggle('walking', still < 6);
      if (window.gsSfx && window.gsSfx.pull) window.gsSfx.pull(moving && vis ? Math.min(1, Math.abs(left - lastL) / 0.5) : 0);
      if (moving && vis && Date.now() - dustT > 120) { dustT = Date.now(); dust(manL, foot, 1); dust(manR, foot, -1); }
      lastL = left;
    });
  })();

  // фасад: кадры день → ночь рисует js/frames.js; здесь — полоска «день — ночь»
  (function () {
    var bar = document.getElementById('dnBar');
    window.ScrollTrigger.create({ trigger: '#facade', start: 'top top', end: 'bottom bottom',
      onUpdate: function (st) { if (bar) bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, (st.progress - 0.28) / 0.62)) + ')'; } });
  })();

  // бегущая строка

  window.addEventListener('load', function () { ST.refresh(); });
})();
