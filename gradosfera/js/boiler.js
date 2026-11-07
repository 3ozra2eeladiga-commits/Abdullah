/* Схема котельной: по мере прокрутки — 1) загорается котёл, 2) вода идёт к радиаторам, 3) горячая вода на кухню и в ванную. */
(function () {
  'use strict';
  var box = document.getElementById('boiler');
  if (!box) return;
  var steps = Array.prototype.slice.call(box.querySelectorAll('.boiler__steps li'));
  var temp = box.querySelector('.boiler-box__temp');
  function setStage(n) {
    box.classList.toggle('s1', n >= 1); box.classList.toggle('s2', n >= 2); box.classList.toggle('s3', n >= 3);
    steps.forEach(function (li, i) { li.classList.toggle('is-on', i < n); });
    if (temp) temp.textContent = n >= 1 ? 'РАБОТАЕТ' : 'ВЫКЛ';
  }
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce || typeof window.ScrollTrigger === 'undefined') { setStage(3); return; }
  window.ScrollTrigger.create({
    trigger: box, start: 'top 80%', end: 'bottom 60%',
    onUpdate: function (st) { var p = st.progress; setStage(p < 0.02 ? 0 : p < 0.33 ? 1 : p < 0.66 ? 2 : 3); },
    onLeave: function () { setStage(3); }
  });
  setStage(0);
})();
