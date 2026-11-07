/* Гид-строитель: спрыгивает с качелей и ведёт по сайту — у каждого раздела коротко объясняет,
   переходит между разделами прыжком или спуском по тросу. В конце — контакты. */
(function () {
  'use strict';
  var g = document.getElementById('guide'), body = document.getElementById('guideBody'), bub = document.getElementById('guideBubble');
  var rope = document.getElementById('guideRope'), line = rope && rope.querySelector('line'), mate = document.getElementById('mate');
  if (!g || !body) return;
  var mobile = window.matchMedia('(max-width: 760px)').matches;
  var STOPS = [
    ['#about',    0.70, 'Привет! Я покажу дом. «Новый Квартал» — 8 этажей бизнес-класса в центре Моздока. Нужна помощь — нажмите на меня!'],
    ['#facade',   0.62, 'Смотрите на стеклянную башню — ночью фасад светится!'],
    ['#lift',     0.58, 'Садитесь в лифт — листайте вниз, прокатимся от паркинга до крыши!'],
    ['#flats',    0.66, 'Планировки от 45 до 105 м². Нажмите на карточку — откроются все площади и планы.'],
    ['#life',     0.62, 'Двор без машин, крыша и коммерция — всё для жителей.'],
    ['#parking',  0.70, 'Проведите пальцем по картинке — машина сама заедет в паркинг!'],
    ['#boiler',   0.70, 'Своя котельная на весь дом. Проведите по фото — увидите, как идёт тепло.'],
    ['#gallery',  0.60, 'Листайте галерею — здесь все ракурсы дома.'],
    ['#terms',    0.66, 'Сдача — I квартал 2028. Разрешение на строительство — по кнопке ниже.'],
    ['#contacts', 0.74, 'Остались вопросы? Звоните: <a href="tel:+79388153333">+7 (938) 815-33-33</a> или приезжайте в офис продаж — покажем всё лично!']
  ];
  var nodes = STOPS.map(function (s) { return document.querySelector(s[0]); });
  // куда показывает рука у каждой остановки: главный элемент раздела
  var AIM = {'#about': '#about h2', '#facade': '#facadeVideo', '#lift': '#lift', '#flats': '#ftypes', '#life': '#life',
             '#parking': '#parking', '#boiler': '#boiler', '#gallery': '#gallery', '#terms': '#terms', '#contacts': '#contacts'};
  var all = document.getElementById('gmAll'), aim = document.getElementById('gmAim'), man0 = g.querySelector('.guide__man');
  function point() {
    if (cur < 0 || !aim || !man0) return;
    var t = document.querySelector(AIM[STOPS[cur][0]]) || nodes[cur]; if (!t) return;
    var r = t.getBoundingClientRect(), vh = window.innerHeight, vw = window.innerWidth;
    // центр видимой части цели
    var tx = (Math.max(r.left, 0) + Math.min(r.right, vw)) / 2, ty = (Math.max(r.top, 0) + Math.min(r.bottom, vh)) / 2;
    var m = man0.getBoundingClientRect(), k = m.width / 60;
    var cx = m.left + 30 * k, cy = m.top + 30 * k;
    var flip = tx > cx + 4;                       // цель справа — разворачиваем человечка
    all.setAttribute('transform', flip ? 'translate(60 0) scale(-1 1)' : '');
    var sx = flip ? m.left + 38 * k : m.left + 22 * k;
    var dx = Math.abs(tx - sx), dy = ty - cy;
    var ang = -Math.atan2(dy, Math.max(dx, 1)) * 180 / Math.PI;
    ang = Math.max(-75, Math.min(75, ang));
    aim.setAttribute('transform', 'rotate(' + ang.toFixed(1) + ' 22 30)');
  }
  var cur = -1, y = 0, timer = 0, moveN = 0;
  function sectionNow() {
    var mark = window.innerHeight * 0.55, idx = -1;
    nodes.forEach(function (n, i) { if (n && n.getBoundingClientRect().top < mark && n.getBoundingClientRect().bottom > window.innerHeight * 0.2) idx = i; });
    return idx;
  }
  function targetY(i) { return mobile ? window.innerHeight - 96 : window.innerHeight * STOPS[i][1]; }
  function go(i) {
    if (i === cur) return;
    var from = cur; cur = i;
    clearTimeout(timer);
    bub.classList.remove('is-on');
    if (i < 0) { g.classList.remove('is-on'); if (mate) mate.classList.remove('guide-out'); return; }
    if (mate) mate.classList.add('guide-out');
    var ny = targetY(i), down = from < 0 ? true : ny > y || i > from;
    g.classList.add('is-on');
    // по очереди: трос (сверху вниз) и прыжок
    var useRope = !mobile && (moveN++ % 2 === 0) && down;
    g.classList.toggle('roping', useRope);
    g.classList.remove('jumping'); void body.offsetWidth;
    if (!useRope) g.classList.add('jumping');
    if (useRope && line) { line.setAttribute('x1', 20); line.setAttribute('x2', 20); line.setAttribute('y1', -window.innerHeight); }
    body.style.top = ny + 'px'; y = ny;
    if (useRope && line) { rope.style.height = ny + 'px'; line.setAttribute('y2', ny - 52); }
    timer = setTimeout(function () {
      g.classList.remove('roping', 'jumping');
      if (line) line.setAttribute('y2', -window.innerHeight);
      bub.innerHTML = STOPS[i][2]; bub.classList.add('is-on'); point();
      timer = setTimeout(function () { if (i !== STOPS.length - 1) bub.classList.remove('is-on'); }, mobile ? 5500 : 8000);
    }, 560);
  }
  // «Нужна помощь? Нажмите на меня» — по клику открывается меню помощи
  var man = g.querySelector('.guide__man'), menu = document.getElementById('guideMenu'), helpT = 0;
  function openMenu(v) { g.classList.toggle('menu-open', v); }
  if (man) man.addEventListener('click', function (e) { e.stopPropagation(); openMenu(!g.classList.contains('menu-open')); });
  if (bub) bub.addEventListener('click', function () { openMenu(true); });
  if (menu) menu.addEventListener('click', function (e) { if (e.target.closest('[data-close]')) openMenu(false); });
  document.addEventListener('click', function (e) { if (!g.contains(e.target)) openMenu(false); });
  // подсказка «нажмите на меня» — редко: один раз за визит, через 1,5 минуты, если меню ещё не открывали
  var helped = false;
  if (man) man.addEventListener('click', function () { helped = true; });
  helpT = setTimeout(function tryHint() {
    if (helped) return;
    if (cur < 0 || g.classList.contains('menu-open') || bub.classList.contains('is-on') || cur === STOPS.length - 1) { helpT = setTimeout(tryHint, 10000); return; }
    helped = true;
    bub.innerHTML = 'Если нужна помощь — нажмите на меня 👋'; bub.classList.add('is-on');
    setTimeout(function () { if (bub.textContent.indexOf('Если нужна') === 0) bub.classList.remove('is-on'); }, 4500);
  }, 90000);

  var raf = 0;
  var settle = 0;
  function check() { raf = 0; point(); var i = sectionNow(); clearTimeout(settle); settle = setTimeout(function () { go(i); }, 220); }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(check); }, { passive: true });
  window.addEventListener('resize', function () { if (cur >= 0) { body.style.top = targetY(cur) + 'px'; y = targetY(cur); } });
  body.style.top = (mobile ? window.innerHeight - 96 : window.innerHeight * 0.3) + 'px';
  check();
})();
