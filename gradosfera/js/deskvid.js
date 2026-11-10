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
  // пузыри над строителем, который тащит тяжёлое: позиция в долях кадра (x, y) в начале и в конце отрезка времени
  var SAY = {
    d: [[1.5, 4.5, 'Уф, тяжело! 😅', .35, .43, .40, .43], [6.5, 9, 'Ещё чуть-чуть…', .44, .43, .47, .43], [12, 15, 'Тащим обратно! 💪', .47, .43, .41, .43]],
    m: []
  };
  vids.forEach(function (v) {
    var list = SAY[portrait ? 'm' : 'd']; if (!list.length || !v.parentNode.classList.contains('flats__bg')) return;
    var b = document.createElement('span'); b.className = 'dsay'; v.parentNode.appendChild(b);
    var shown = -1;
    v.addEventListener('timeupdate', function () {
      var t = v.currentTime, k = -1;
      for (var i = 0; i < list.length; i++) if (t >= list[i][0] && t <= list[i][1]) k = i;
      if (k < 0) { b.classList.remove('on'); shown = -1; return; }
      var s = list[k], f = (t - s[0]) / (s[1] - s[0]), fx = s[3] + (s[5] - s[3]) * f, fy = s[4] + (s[6] - s[4]) * f;
      var W = v.clientWidth, H = v.clientHeight, vw = v.videoWidth || 16, vh = v.videoHeight || 9, sc = Math.max(W / vw, H / vh);
      b.style.left = ((W - vw * sc) / 2 + fx * vw * sc) + 'px'; b.style.top = ((H - vh * sc) / 2 + fy * vh * sc) + 'px';
      if (shown !== k) { b.textContent = s[2]; shown = k; }
      b.classList.add('on');
    });
  });
})();
