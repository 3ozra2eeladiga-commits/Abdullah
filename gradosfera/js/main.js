/* Градосфера — ЖК «Новый Квартал» */
(function () {
  'use strict';

  // Куда отправлять заявки (PHP-обработчик на хостинге Timeweb)
  var FORM_ENDPOINT = 'send.php';

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };

  /* ---------- данные: планировки ---------- */
  var PLANS = [
    { rooms: '1', type: '1-комнатная', img: 'img/plans/1k-a.webp', areas: [45.45, 45.58, 45.64, 46.5, 46.51, 46.86, 46.89, 48.3] },
    { rooms: '1', type: '1-комнатная', img: 'img/plans/1k-b.webp', areas: [47.69] },
    { rooms: 'e2', type: 'Евро-2', img: '', areas: [52.06] },
    { rooms: '2', type: '2-комнатная', img: 'img/plans/2k-a.webp', areas: [64.78, 68.5, 69.49] },
    { rooms: '2', type: '2-комнатная', img: 'img/plans/2k-b.webp', areas: [76.19, 76.25, 77.56, 81.37] },
    { rooms: '2', type: '2-комнатная', img: 'img/plans/2k-c.webp', areas: [86.68] },
    { rooms: '3', type: '3-комнатная', img: 'img/plans/3k-a.webp', areas: [105.63] }
  ];

  var GALLERY = ['img/hero.webp', 'img/night-1.webp', 'img/night-2.webp', 'img/architecture.webp', 'img/landscaping.webp', 'img/yard.webp', 'img/commerce.webp', 'img/parking.webp', 'img/roof.webp'];
  for (var i = 2; i <= 16; i++) GALLERY.push('img/gallery/slide-' + (i < 10 ? '0' + i : i) + '.webp');

  var fmtArea = function (a) { return a.toFixed(2).replace('.', ',').replace(/,?0+$/, '').replace(/,$/, ''); };
  var fmtRub = function (n) { return Math.round(n).toLocaleString('ru-RU') + ' ₽'; };

  /* ---------- шапка ---------- */
  var header = $('#header');
  var onScroll = function () { header.classList.toggle('is-scrolled', window.scrollY > 40); };
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  var burger = $('#burger'), nav = $('#nav');
  var setMenu = function (open) {
    nav.classList.toggle('is-open', open);
    header.classList.toggle('menu-open', open);
    burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    document.body.classList.toggle('lock', open);
  };
  burger.addEventListener('click', function () { setMenu(!nav.classList.contains('is-open')); });
  $$('a', nav).forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });

  /* ---------- появление блоков ---------- */
  if ('IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('is-visible'); io.unobserve(e.target); } });
    }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
    $$('.reveal').forEach(function (el) { io.observe(el); });
    // запасной вариант: если наблюдатель не сработал, через 2,5 с показываем всё
    setTimeout(function () { $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); }); }, 2500);
  } else {
    $$('.reveal').forEach(function (el) { el.classList.add('is-visible'); });
  }

  /* ---------- модальные окна ---------- */
  var openModal = function (m) { m.classList.add('is-open'); m.setAttribute('aria-hidden', 'false'); document.body.classList.add('lock'); };
  var closeModal = function (m) {
    m.classList.remove('is-open'); m.setAttribute('aria-hidden', 'true');
    if (!$('.modal.is-open, .lightbox.is-open') && !nav.classList.contains('is-open')) document.body.classList.remove('lock');
  };
  $$('.modal, .lightbox').forEach(function (m) {
    m.addEventListener('click', function (e) { if (e.target === m || e.target.closest('[data-close]')) closeModal(m); });
  });
  document.addEventListener('keydown', function (e) {
    var lb = $('#lightbox');
    if (e.key === 'Escape') $$('.modal.is-open, .lightbox.is-open').forEach(closeModal);
    if (lb.classList.contains('is-open')) {
      if (e.key === 'ArrowLeft') lbStep(-1);
      if (e.key === 'ArrowRight') lbStep(1);
    }
  });

  var formModal = $('#formModal');
  var openForm = function (topic, title, sub) {
    $('#formTitle').textContent = title || 'Обратный звонок';
    $('#formSub').textContent = sub || 'Оставьте номер — перезвоним в рабочее время.';
    $('input[name="topic"]', formModal).value = topic || 'Обратный звонок';
    resetMsg($('form', formModal));
    openModal(formModal);
    setTimeout(function () { var n = $('input[name="name"]', formModal); if (n && window.innerWidth > 640) n.focus(); }, 250);
  };
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-open-form]');
    if (!b) return;
    e.preventDefault();
    var t = b.getAttribute('data-topic');
    openForm(t || 'Обратный звонок', t ? t : 'Обратный звонок', t ? 'Оставьте номер — менеджер перезвонит и всё расскажет.' : null);
  });

  /* ---------- планировки ---------- */
  var grid = $('#planGrid');
  var renderPlans = function (filter) {
    grid.innerHTML = '';
    PLANS.forEach(function (p, idx) {
      if (filter !== 'all' && p.rooms !== filter) return;
      var min = Math.min.apply(null, p.areas), max = Math.max.apply(null, p.areas);
      var area = min === max ? fmtArea(min) + ' м²' : fmtArea(min) + '–' + fmtArea(max) + ' м²';
      var card = document.createElement('button');
      card.type = 'button';
      card.className = 'plan-card';
      card.innerHTML =
        '<div class="plan-card__img' + (p.img ? '' : ' plan-card__img--empty') + '">' +
          (p.img ? '<img src="' + p.img + '" alt="Планировка: ' + p.type + ', ' + area + '" loading="lazy">' : 'Планировка по запросу') +
        '</div>' +
        '<span class="plan-card__type">' + p.type + '</span>' +
        '<span class="plan-card__title">' + area + '</span>' +
        '<span class="plan-card__foot"><span class="plan-card__areas">' +
          (p.areas.length > 1 ? p.areas.length + ' вариантов площади' : '1 вариант') +
        '</span><span class="plan-card__go">→</span></span>';
      card.addEventListener('click', function () { openPlan(idx); });
      grid.appendChild(card);
    });
  };
  var openPlan = function (idx) {
    var p = PLANS[idx];
    var img = $('#pmImg');
    if (p.img) { img.src = p.img; img.alt = p.type; img.style.display = ''; } else { img.removeAttribute('src'); img.style.display = 'none'; }
    $('#pmType').textContent = 'ЖК «Новый Квартал»';
    $('#pmTitle').textContent = p.type + ' квартира';
    $('#pmAreas').innerHTML = p.areas.map(function (a) { return '<span>' + fmtArea(a) + '</span>'; }).join('');
    $('#pmBtn').onclick = function () {
      closeModal($('#planModal'));
      openForm('Квартира: ' + p.type + ', ' + p.areas.map(fmtArea).join(' / ') + ' м²', 'Узнать цену', p.type + ' квартира — пришлём цену и наличие.');
    };
    openModal($('#planModal'));
  };
  $$('#roomFilter .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      $$('#roomFilter .chip').forEach(function (x) { x.classList.remove('is-active'); });
      c.classList.add('is-active');
      renderPlans(c.getAttribute('data-rooms'));
    });
  });
  renderPlans('all');

  $$('.tab').forEach(function (t) {
    t.addEventListener('click', function () {
      var name = t.getAttribute('data-tab');
      $$('.tab').forEach(function (x) { x.classList.toggle('is-active', x === t); });
      $$('.tab-panel').forEach(function (p) { p.classList.toggle('is-active', p.getAttribute('data-panel') === name); });
    });
  });

  /* ---------- галерея + lightbox ---------- */
  var track = $('#galleryTrack');
  var lbList = GALLERY.slice(), lbIdx = 0;
  GALLERY.forEach(function (src, i) {
    var d = document.createElement('div');
    d.className = 'gallery__item';
    d.innerHTML = '<img src="' + src + '" alt="ЖК «Новый Квартал» — фото ' + (i + 1) + '" loading="lazy">';
    d.addEventListener('click', function () { openLb(lbList = GALLERY, i); });
    track.appendChild(d);
  });
  $$('[data-gal]').forEach(function (b) {
    b.addEventListener('click', function () {
      track.scrollBy({ left: (+b.getAttribute('data-gal')) * Math.min(track.clientWidth * 0.8, 700), behavior: 'smooth' });
    });
  });
  var lb = $('#lightbox');
  var showLb = function () {
    $('#lbImg').src = lbList[lbIdx];
    $('#lbCount').textContent = lbList.length > 1 ? (lbIdx + 1) + ' / ' + lbList.length : '';
    $$('.lightbox__arrow', lb).forEach(function (a) { a.style.display = lbList.length > 1 ? '' : 'none'; });
  };
  var openLb = function (list, i) { lbList = list; lbIdx = i; showLb(); openModal(lb); };
  var lbStep = function (d) { lbIdx = (lbIdx + d + lbList.length) % lbList.length; showLb(); };
  $$('[data-lb]').forEach(function (b) { b.addEventListener('click', function (e) { e.stopPropagation(); lbStep(+b.getAttribute('data-lb')); }); });
  $$('img[data-zoom]').forEach(function (im) { im.addEventListener('click', function () { openLb([im.src], 0); }); });

  // свайп в lightbox
  var sx = null;
  lb.addEventListener('touchstart', function (e) { sx = e.touches[0].clientX; }, { passive: true });
  lb.addEventListener('touchend', function (e) {
    if (sx === null) return;
    var dx = e.changedTouches[0].clientX - sx;
    if (Math.abs(dx) > 50 && lbList.length > 1) lbStep(dx < 0 ? 1 : -1);
    sx = null;
  });

  /* ---------- карта (грузим по клику, чтобы не тормозить страницу) ---------- */
  var map = $('#map');
  $('.map__placeholder', map).addEventListener('click', function () {
    var f = document.createElement('iframe');
    f.src = map.getAttribute('data-src').replace(/&amp;/g, '&');
    f.title = 'Карта: г. Моздок, ул. Шевченко, 20';
    f.loading = 'lazy';
    f.allowFullscreen = true;
    map.innerHTML = '';
    map.appendChild(f);
  });

  /* ---------- ипотечный калькулятор ---------- */
  var cPrice = $('#cPrice'), cDown = $('#cDown'), cYears = $('#cYears'), cRate = $('#cRate');
  var paint = function (r) { r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100) + '%'); };
  var yearsWord = function (n) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return 'год';
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'года';
    return 'лет';
  };
  var calc = function () {
    var price = +cPrice.value, downPct = +cDown.value, years = +cYears.value, rate = Math.max(0, +cRate.value || 0);
    var down = price * downPct / 100, loan = price - down, n = years * 12, r = rate / 1200;
    var pay = r === 0 ? loan / n : loan * r / (1 - Math.pow(1 + r, -n));
    $('#oPrice').textContent = fmtRub(price);
    $('#oDown').textContent = downPct + '% · ' + fmtRub(down);
    $('#oYears').textContent = years + ' ' + yearsWord(years);
    $('#oPay').textContent = fmtRub(pay);
    [cPrice, cDown, cYears].forEach(paint);
  };
  [cPrice, cDown, cYears, cRate].forEach(function (el) { el.addEventListener('input', calc); });
  calc();

  /* ---------- маска телефона ---------- */
  var maskPhone = function (v) {
    var d = v.replace(/\D/g, '');
    if (d[0] === '8') d = '7' + d.slice(1);
    if (d[0] !== '7') d = '7' + d;
    d = d.slice(0, 11);
    var s = '+7';
    if (d.length > 1) s += ' (' + d.slice(1, 4);
    if (d.length >= 4) s += ')';
    if (d.length > 4) s += ' ' + d.slice(4, 7);
    if (d.length > 7) s += '-' + d.slice(7, 9);
    if (d.length > 9) s += '-' + d.slice(9, 11);
    return s;
  };
  $$('[data-phone]').forEach(function (inp) {
    inp.addEventListener('focus', function () { if (!inp.value) inp.value = '+7 '; });
    inp.addEventListener('blur', function () { if (inp.value.replace(/\D/g, '').length <= 1) inp.value = ''; });
    inp.addEventListener('input', function () { inp.value = maskPhone(inp.value); });
  });

  /* ---------- отправка заявок ---------- */
  var resetMsg = function (form) { var m = $('.form__msg', form); m.textContent = ''; m.className = 'form__msg'; };
  var setMsg = function (form, text, ok) { var m = $('.form__msg', form); m.textContent = text; m.className = 'form__msg ' + (ok ? 'is-ok' : 'is-err'); };

  $$('[data-form]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      resetMsg(form);
      var name = form.name.value.trim();
      var phone = form.phone.value.replace(/\D/g, '');
      if (!name) return setMsg(form, 'Укажите, как к вам обращаться');
      if (phone.length !== 11) return setMsg(form, 'Проверьте номер телефона');
      if (!form.agree.checked) return setMsg(form, 'Нужно согласие на обработку данных');

      var btn = $('button[type="submit"]', form), label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Отправляем…';

      var payload = {
        name: name, phone: '+' + phone, topic: form.topic.value,
        website: form.website.value, page: location.href
      };
      fetch(FORM_ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
        .then(function (r) { return r.json().catch(function () { return { ok: false }; }).then(function (j) { return { ok: r.ok && j.ok, j: j }; }); })
        .then(function (res) {
          if (res.ok) {
            setMsg(form, 'Спасибо! Мы перезвоним вам в ближайшее время.', true);
            form.reset();
            if (typeof window.ym === 'function' && window.YM_ID) window.ym(window.YM_ID, 'reachGoal', 'lead');
            var m = form.closest('.modal');
            if (m) setTimeout(function () { closeModal(m); }, 2200);
          } else {
            setMsg(form, (res.j && res.j.error) || 'Не удалось отправить. Позвоните нам: +7 (938) 815-33-33');
          }
        })
        .catch(function () { setMsg(form, 'Ошибка сети. Позвоните нам: +7 (938) 815-33-33'); })
        .then(function () { btn.disabled = false; btn.textContent = label; });
    });
  });

  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();
})();
