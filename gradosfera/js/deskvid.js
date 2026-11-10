/* Живой стол архитектора: зацикленное видео (рука рисует планировку) под карточками квартир и под галереей.
   Грузится, только когда раздел рядом; вне экрана — на паузе. Телефон — вертикальное видео, компьютер — горизонтальное. */
(function () {
  'use strict';
  var vids = Array.prototype.slice.call(document.querySelectorAll('video.dvid')); if (!vids.length) return;
  var portrait = window.matchMedia('(max-width: 760px)').matches;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function load(v) { if (v.dataset.ok) return; v.dataset.ok = '1'; v.src = portrait ? v.dataset.m : v.dataset.d; v.load(); }
  function play(v) { load(v); var p = v.play(); if (p && p.catch) p.catch(function () {}); }
  if (!('IntersectionObserver' in window)) { vids.forEach(play); return; }
  var io = new IntersectionObserver(function (es) {
    es.forEach(function (e) { var v = e.target; if (e.isIntersecting) { if (!reduce) play(v); else load(v); } else if (v.dataset.ok) v.pause(); });
  }, { rootMargin: '300px 0px' });
  vids.forEach(function (v) { v.addEventListener('loadeddata', function () { v.classList.add('on'); }); io.observe(v); });
})();
