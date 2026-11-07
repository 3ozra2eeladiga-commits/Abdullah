/* Гид-строитель: спрыгивает с качелей и ведёт по сайту — у каждого раздела коротко объясняет,
   переходит между разделами прыжком или спуском по тросу. В конце — контакты. */
(function () {
  'use strict';
  var g = document.getElementById('guide'), body = document.getElementById('guideBody'), bub = document.getElementById('guideBubble');
  var rope = document.getElementById('guideRope'), line = rope && rope.querySelector('line'), mate = document.getElementById('mate');
  if (!g || !body) return;
  var mobile = window.matchMedia('(max-width: 760px)').matches;
  var STOPS = [
    ['#about',    0.70, 'Привет! Я покажу дом. «Новый Квартал» — 8 этажей бизнес-класса в центре Моздока.'],
    ['#facade',   0.62, 'Смотрите на стеклянную башню — ночью фасад светится!'],
    ['#lift',     0.58, 'Садитесь в лифт — листайте вниз, прокатимся от паркинга до крыши!'],
    ['#flats',    0.66, 'Планировки от 45 до 105 м². Жмите на вкладки — смотрите варианты.'],
    ['#life',     0.62, 'Двор без машин, крыша и коммерция — всё для жителей.'],
    ['#parking',  0.70, 'Проведите пальцем по картинке — машина сама заедет в паркинг!'],
    ['#boiler',   0.70, 'Своя котельная на весь дом. Проведите по фото — увидите, как идёт тепло.'],
    ['#gallery',  0.60, 'Листайте галерею — здесь все ракурсы дома.'],
    ['#terms',    0.66, 'Сдача — I квартал 2028. Разрешение на строительство — по кнопке ниже.'],
    ['#contacts', 0.74, 'Остались вопросы? Звоните: <a href="tel:+79388153333">+7 (938) 815-33-33</a> или приезжайте в офис продаж — покажем всё лично!']
  ];
  var nodes = STOPS.map(function (s) { return document.querySelector(s[0]); });
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
      bub.innerHTML = STOPS[i][2]; bub.classList.add('is-on');
      timer = setTimeout(function () { if (i !== STOPS.length - 1) bub.classList.remove('is-on'); }, mobile ? 5500 : 8000);
    }, 560);
  }
  var raf = 0;
  var settle = 0;
  function check() { raf = 0; var i = sectionNow(); clearTimeout(settle); settle = setTimeout(function () { go(i); }, 220); }
  window.addEventListener('scroll', function () { if (!raf) raf = requestAnimationFrame(check); }, { passive: true });
  window.addEventListener('resize', function () { if (cur >= 0) { body.style.top = targetY(cur) + 'px'; y = targetY(cur); } });
  body.style.top = (mobile ? window.innerHeight - 96 : window.innerHeight * 0.3) + 'px';
  check();
})();
