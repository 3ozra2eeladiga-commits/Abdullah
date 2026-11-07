/* «Прогулка по квартире»: маленький строитель ходит по планировке из комнаты в комнату.
   Текст — под планом (не закрывает чертёж). Нажмите на точку комнаты — он пойдёт туда. */
(function () {
  'use strict';
  var plan = document.getElementById('fwPlan'), img = document.getElementById('fwImg'), cap = document.getElementById('fwCap');
  if (!plan || !img || !cap) return;
  var T = {
    hall: function (a) { return 'Прихожая ' + a + ' м² — есть место для большого шкафа, и гостям не тесно у дверей.'; },
    bath: function (a) { return 'Санузел ' + a + ' м² — места хватит и для ванны, и для стиральной машины. Утро без очередей.'; },
    wc: function (a) { return 'Второй санузел ' + a + ' м² — гостевой. Удобно, когда в доме гости или большая семья.'; },
    kitchen: function (a) { return 'Кухня ' + a + ' м² — простор, чтобы готовить вкусное и собирать всех за одним столом 🍳'; },
    living: function (a) { return 'Комната с мини-кухней ' + a + ' м² — готовите и тут же общаетесь с гостями.'; },
    zal: function (a) { return 'Зал ' + a + ' м² — большие окна, много света и вечера всей семьёй.'; },
    bay: function (a) { return 'Зал ' + a + ' м² с полукруглым эркером — свет весь день и вид на город из окон.'; },
    bed: function (a) { return 'Спальня ' + a + ' м² — тихая, уютная, здесь по-настоящему высыпаешься 😴'; },
    bed2: function (a) { return 'Вторая спальня ' + a + ' м² — детская или кабинет: у каждого своё пространство.'; },
    balc: function (a) { return 'Балкон ' + a + ' м² — утренний кофе с видом на Моздок ☕'; }
  };
  var NAMES = { hall: 'Прихожая', bath: 'Санузел', wc: 'Гостевой санузел', kitchen: 'Кухня', living: 'Кухня-гостиная', zal: 'Зал', bay: 'Зал с эркером', bed: 'Спальня', bed2: 'Спальня', balc: 'Балкон' };
  // [тип, площадь, x, y] — координаты в долях картинки
  var R = {
    '1k-a': [['hall', '4,24', .56, .76], ['bath', '4,84', .76, .84], ['kitchen', '13,68', .60, .22], ['zal', '19,86', .24, .54], ['balc', '3,88', .14, .12]],
    '1k-b': [['hall', '6,04', .24, .62], ['bath', '5,14', .17, .86], ['kitchen', '11,78', .66, .56], ['zal', '20,53', .54, .38], ['balc', '4,20', .80, .38]],
    'e2-a': [['hall', '10,88', .30, .30], ['bath', '5,58', .78, .14], ['living', '18,38', .78, .70], ['bed', '14,62', .38, .78], ['balc', '2,60', .44, .93]],
    '2k-a': [['hall', '9,29', .74, .54], ['bath', '4,30', .72, .22], ['kitchen', '14,56', .52, .18], ['bed', '17,36', .26, .45], ['zal', '19,94', .30, .84], ['balc', '3,05', .14, .63]],
    '2k-b': [['hall', '14,54', .52, .78], ['bath', '5,58', .52, .26], ['kitchen', '15,60', .74, .30], ['bed', '16,80', .30, .45], ['zal', '20,84', .20, .64], ['balc', '4,20', .05, .52]],
    '2k-c': [['hall', '15,57', .80, .26], ['bath', '5,10', .70, .17], ['kitchen', '18,28', .20, .22], ['zal', '31,51', .20, .66], ['bed', '16,22', .76, .62]],
    '3k-a': [['hall', '22,41', .45, .44], ['wc', '3,21', .60, .22], ['kitchen', '16,33', .74, .20], ['zal', '20,53', .72, .58], ['balc', '3,88', .93, .40], ['bed', '17,36', .14, .78], ['bath', '5,27', .43, .84], ['bed2', '16,64', .66, .78]]
  };
  R['2k-c'][3][0] = 'bay';
  var FINAL = 'А вечером — на крышу: отдохнуть с друзьями с видом на весь город 🌇';

  var lay = document.createElement('div'); lay.className = 'fwalk'; lay.setAttribute('aria-hidden', 'true');
  lay.innerHTML = '<i class="fwalk__spot"></i><svg class="fwalk__man" viewBox="0 0 40 52"><g class="fwalk__legs"><path class="fl1" d="M17 34 L14 49"/><path class="fl2" d="M23 34 L26 49"/></g>' +
    '<rect x="12" y="18" width="16" height="17" rx="4" fill="#ff7a2f" stroke="#1b1410" stroke-width="2"/><path d="M12 22 L6 31 M28 22 L34 31" stroke="#1b1410" stroke-width="2.4" stroke-linecap="round"/>' +
    '<circle cx="20" cy="11" r="6.5" fill="#f3d9bd" stroke="#1b1410" stroke-width="2"/><path d="M12.5 9 a7.5 7 0 0 1 15 0 z M11 9 h18" fill="#ffb000" stroke="#1b1410" stroke-width="2" stroke-linejoin="round"/></svg>';
  plan.appendChild(lay);
  lay.insertAdjacentHTML('beforeend', '<span class="fwalk__tag"></span>');
  var man = lay.querySelector('.fwalk__man'), spot = lay.querySelector('.fwalk__spot'), tag = lay.querySelector('.fwalk__tag');
  var AV = '<svg class="fcap__av" viewBox="0 0 40 52" aria-hidden="true"><rect x="12" y="18" width="16" height="17" rx="4" fill="#ff7a2f" stroke="#1b1410" stroke-width="2"/><circle cx="20" cy="11" r="6.5" fill="#f3d9bd" stroke="#1b1410" stroke-width="2"/><path d="M12.5 9 a7.5 7 0 0 1 15 0 z M11 9 h18" fill="#ffb000" stroke="#1b1410" stroke-width="2"/><path d="M17 35 L15 48 M23 35 L25 48" stroke="#efe7da" stroke-width="2.6" stroke-linecap="round"/></svg>';
  var rooms = [], dots = [], step = -1, timer = 0, playing = false, key = '';

  function geo() {
    var pr = plan.getBoundingClientRect(), ir = img.getBoundingClientRect();
    var nw = img.naturalWidth || 1, nh = img.naturalHeight || 1, s = Math.min(ir.width / nw, ir.height / nh);
    return { x: ir.left - pr.left + (ir.width - nw * s) / 2, y: ir.top - pr.top + (ir.height - nh * s) / 2, w: nw * s, h: nh * s };
  }
  function place(el, r, g) { el.style.left = (g.x + r[2] * g.w) + 'px'; el.style.top = (g.y + r[3] * g.h) + 'px'; }
  function tail() { var x = parseFloat(man.style.left) || 0; cap.style.setProperty('--tx', Math.max(18, Math.min(cap.clientWidth - 18, x)) + 'px'); }
  function say(html, btns) { tail(); cap.innerHTML = AV + '<span class="fcap__txt">' + html + '</span>' + (btns || ''); cap.classList.remove('is-new'); void cap.offsetWidth; cap.classList.add('is-new'); }
  function go(i, auto) {
    clearTimeout(timer);
    if (i >= rooms.length) { finish(); return; }
    step = i; var r = rooms[i], g = geo();
    var cx = parseFloat(man.style.left) || 0;
    man.classList.toggle('flip', g.x + r[2] * g.w < cx);
    lay.classList.add('walking'); lay.classList.remove('done'); tag.classList.remove('is-on');
    place(man, r, g); place(spot, r, g);
    dots.forEach(function (d, k) { d.classList.toggle('is-on', k === i); d.classList.toggle('seen', k < i || d.classList.contains('seen')); });
    timer = setTimeout(function () {
      lay.classList.remove('walking');
      tag.textContent = NAMES[r[0]]; place(tag, r, geo()); tag.classList.add('is-on'); clearTimeout(tag._t); tag._t = setTimeout(function () { tag.classList.remove('is-on'); }, 2600);
      say('<b>' + NAMES[r[0]] + ' · ' + r[1] + ' м²</b>' + cap1(T[r[0]](r[1]).replace(/^[^—]*— /, '')), ctrl());
      if (auto && playing) timer = setTimeout(function () { go(i + 1, true); }, 3600);
    }, 1100);
  }
  function cap1(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function ctrl() { return '<button class="fcap__btn" type="button" data-walk="' + (playing ? 'pause' : 'play') + '">' + (playing ? '❚❚' : '▶') + '</button>'; }
  function finish() {
    playing = false; lay.classList.add('done'); tag.classList.remove('is-on'); dots.forEach(function (d) { d.classList.remove('is-on'); });
    say(FINAL, '<a class="fcap__go" href="#life" data-walk="roof">На крышу →</a><button class="fcap__btn" type="button" data-walk="again" aria-label="Ещё раз">↻</button>');
  }
  function start() {
    clearTimeout(timer);
    var m = (img.getAttribute('src') || '').match(/plans\/([\w-]+)\.webp/), k = m && m[1];
    rooms = (k && R[k]) || [];
    lay.hidden = !rooms.length; cap.hidden = !rooms.length;
    if (!rooms.length || !img.naturalWidth) return;
    if (k !== key) {
      key = k; dots.forEach(function (d) { d.remove(); }); dots = [];
      rooms.forEach(function (r, i) {
        var d = document.createElement('button'); d.type = 'button'; d.className = 'fwalk__dot'; d.title = NAMES[r[0]];
        d.addEventListener('click', function (e) { e.stopPropagation(); playing = false; go(i, false); });
        lay.appendChild(d); dots.push(d);
      });
    }
    var g = geo(); dots.forEach(function (d, i) { place(d, rooms[i], g); d.classList.remove('seen', 'is-on'); });
    // заходит со стороны входной двери (из прихожей), чуть «издалека»
    man.style.transition = 'none'; place(man, [0, 0, rooms[0][2], Math.min(1.02, rooms[0][3] + .12)], g); void man.offsetWidth; man.style.transition = '';
    playing = true;
    say('<b>Прогулка по квартире</b>Пойдёмте, покажу, как здесь живётся 👋', ctrl());
    timer = setTimeout(function () { go(0, true); }, 900);
  }
  cap.addEventListener('click', function (e) {
    var b = e.target.closest('[data-walk]'); if (!b) return;
    var a = b.getAttribute('data-walk');
    if (a === 'pause') { playing = false; clearTimeout(timer); b.outerHTML = ctrl(); }
    else if (a === 'play') { playing = true; go(step + 1, true); }
    else if (a === 'again') start();
    else if (a === 'roof') { var x = document.querySelector('[data-fclose]'); if (x) x.click(); }
  });
  img.addEventListener('load', function () { if (document.getElementById('fwin').classList.contains('is-open')) start(); });
  window.addEventListener('resize', function () {
    if (!rooms.length) return; var g = geo();
    dots.forEach(function (d, i) { place(d, rooms[i], g); });
    if (step >= 0 && step < rooms.length) { place(man, rooms[step], g); place(spot, rooms[step], g); place(tag, rooms[step], g); tail(); }
  });
  // при открытии окна с той же картинкой (load не сработает) — перезапуск
  new MutationObserver(function () { if (document.getElementById('fwin').classList.contains('is-open')) { if (img.complete) start(); } else { clearTimeout(timer); playing = false; } })
    .observe(document.getElementById('fwin'), { attributes: true, attributeFilter: ['class'] });
})();
