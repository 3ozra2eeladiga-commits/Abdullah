/* ЖК «Новый Квартал» — анимации и интерактив */
(function () {
  'use strict';
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var hasGsap = typeof window.gsap !== 'undefined' && typeof window.ScrollTrigger !== 'undefined';

  /* ---------- данные ---------- */
  var FLATS = [
    { key: '1a', tab: '1-комнатная', type: '1-комнатная', img: 'img/plans/1k-a.webp', areas: [45.45, 45.58, 45.64, 46.5, 46.51, 46.86, 46.89, 48.3], note: 'Отдельная кухня, лоджия. Восемь вариантов площади.' },
    { key: '1b', tab: '1-комнатная · 47,69', type: '1-комнатная', img: 'img/plans/1k-b.webp', areas: [47.69], note: 'Вариант планировки с кухней-гостиной у окна.' },
    { key: 'e2', tab: 'Евро-2', type: 'Евро-двушка', img: '', areas: [52.06], note: 'Спальня и кухня-гостиная. Планировку пришлём по запросу.' },
    { key: '2a', tab: '2-комнатная', type: '2-комнатная', img: 'img/plans/2k-a.webp', areas: [64.78, 68.5, 69.49], note: 'Две изолированные комнаты, просторная кухня.' },
    { key: '2b', tab: '2-комнатная · 76–81', type: '2-комнатная', img: 'img/plans/2k-b.webp', areas: [76.19, 76.25, 77.56, 81.37], note: 'Вытянутая планировка вдоль фасада, много окон.' },
    { key: '2c', tab: '2-комнатная · 86,68', type: '2-комнатная', img: 'img/plans/2k-c.webp', areas: [86.68], note: 'Самая большая двушка в доме.' },
    { key: '3a', tab: '3-комнатная', type: '3-комнатная', img: 'img/plans/3k-a.webp', areas: [105.63], note: 'Три комнаты, кухня-гостиная и две ванные зоны.' }
  ];
  var GALLERY = ['img/photo/corner-morning.webp', 'img/photo/closeup.webp', 'img/photo/yard.webp', 'img/photo/front.webp', 'img/photo/corner-sunset.webp',
    'img/night-1.webp', 'img/night-2.webp', 'img/landscaping.webp', 'img/yard.webp', 'img/photo/commerce.webp', 'img/photo/parking.webp', 'img/photo/roof.webp'];
  for (var g = 2; g <= 16; g++) GALLERY.push('img/gallery/slide-' + (g < 10 ? '0' + g : g) + '.webp');

  var fmt = function (a) { return a.toFixed(2).replace('.', ',').replace(/0+$/, '').replace(/,$/, ''); };

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

  /* ---------- квартиры ---------- */
  var tabs = $('#flatTabs'), cur = 0;
  var showFlat = function (i, areaIdx) {
    cur = i; var f = FLATS[i];
    $$('.ftab', tabs).forEach(function (t, k) { t.classList.toggle('is-active', k === i); t.setAttribute('aria-selected', k === i); });
    var img = $('#flatImg');
    if (f.img) { img.hidden = false; img.src = f.img; img.alt = 'Планировка: ' + f.type; $('#flatNoImg').hidden = true; }
    else { img.hidden = true; img.removeAttribute('src'); $('#flatNoImg').hidden = false; }
    $('#flatType').textContent = f.type;
    var a = areaIdx || 0;
    $('#flatArea').textContent = fmt(f.areas[a]);
    $('#flatNote').textContent = f.note;
    var v = $('#flatVariants'); v.innerHTML = '';
    if (f.areas.length > 1) f.areas.forEach(function (ar, k) {
      var b = document.createElement('button'); b.type = 'button'; b.textContent = fmt(ar) + ' м²';
      if (k === a) b.classList.add('is-active');
      b.addEventListener('click', function () { showFlat(i, k); });
      v.appendChild(b);
    });
  };
  FLATS.forEach(function (f, i) {
    var t = document.createElement('button'); t.className = 'ftab'; t.type = 'button'; t.setAttribute('role', 'tab'); t.textContent = f.tab;
    t.addEventListener('click', function () { showFlat(i); });
    tabs.appendChild(t);
  });
  showFlat(0);

  /* ---------- галерея + lightbox ---------- */
  var track = $('#galTrack'), lb = $('#lb'), lbImg = $('#lbImg'), list = [], idx = 0;
  GALLERY.forEach(function (src, i) {
    var d = document.createElement('div'); d.className = 'gallery__item';
    d.innerHTML = '<img src="' + src + '" alt="ЖК «Новый Квартал» — фото ' + (i + 1) + '" loading="lazy" draggable="false">';
    d.addEventListener('click', function () { if (!dragged) openLb(GALLERY, i); });
    track.appendChild(d);
  });
  $$('[data-gal]').forEach(function (b) { b.addEventListener('click', function () { track.scrollBy({ left: +b.dataset.gal * track.clientWidth * 0.7, behavior: 'smooth' }); }); });
  // перетаскивание мышью
  var down = false, sx = 0, sl = 0, dragged = false;
  track.addEventListener('mousedown', function (e) { down = true; dragged = false; sx = e.pageX; sl = track.scrollLeft; track.style.scrollSnapType = 'none'; });
  window.addEventListener('mouseup', function () { if (down) { down = false; track.style.scrollSnapType = ''; } });
  track.addEventListener('mousemove', function (e) { if (!down) return; var dx = e.pageX - sx; if (Math.abs(dx) > 5) dragged = true; track.scrollLeft = sl - dx; });

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
  $('.flat__plan').addEventListener('click', function () { var f = FLATS[cur]; if (f.img) openLb([f.img.replace('/plans/', '/plans/')], 0); });
  $('#lbImg').addEventListener('load', function () { /* план на светлом фоне */ });

  var y = $('#year'); if (y) y.textContent = new Date().getFullYear();

  /* ---------- анимации ---------- */
  if (!hasGsap || reduce) return;
  var gsap = window.gsap, ST = window.ScrollTrigger;
  gsap.registerPlugin(ST);
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

  // фасад: кадры день → ночь рисует js/frames.js; здесь — полоска «день — ночь»
  (function () {
    var bar = document.getElementById('dnBar');
    window.ScrollTrigger.create({ trigger: '#facade', start: 'top top', end: 'bottom bottom',
      onUpdate: function (st) { if (bar) bar.style.transform = 'scaleX(' + Math.min(1, Math.max(0, (st.progress - 0.28) / 0.62)) + ')'; } });
  })();

  // бегущая строка
  var row = $('#marq');
  gsap.to(row, { xPercent: -50, ease: 'none', duration: 40, repeat: -1 });
  gsap.fromTo(row, { x: 0 }, { x: -200, ease: 'none', scrollTrigger: { trigger: '.marq', start: 'top bottom', end: 'bottom top', scrub: true } });

  window.addEventListener('load', function () { ST.refresh(); });
})();
