/* Звук сайта: спокойная фоновая музыка (синтезируется в браузере, без файлов и без авторских прав)
   и «дзинь» лифта на каждом этаже. Браузеры запрещают звук без нажатия — поэтому есть кнопка «Звук». */
(function () {
  'use strict';
  var btn = document.getElementById('soundBtn');
  if (!btn || !(window.AudioContext || window.webkitAudioContext)) { if (btn) btn.hidden = true; return; }
  var ctx = null, master = null, musicGain = null, on = false, timer = null, step = 0;

  // мягкие аккорды: Dmaj9 – Bm9 – Gmaj7 – A6sus (медленно, тепло)
  var CHORDS = [[50, 57, 62, 66, 69, 76], [47, 54, 61, 62, 66, 73], [43, 50, 55, 59, 62, 69], [45, 52, 57, 59, 64, 71]];
  var hz = function (m) { return 440 * Math.pow(2, (m - 69) / 12); };

  function init() {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0; master.connect(ctx.destination);
    // простая «реверберация» из задержек
    var verb = ctx.createGain(); verb.gain.value = 0.35;
    [0.13, 0.21, 0.34, 0.55].forEach(function (t, i) {
      var d = ctx.createDelay(1); d.delayTime.value = t;
      var fb = ctx.createGain(); fb.gain.value = 0.35 - i * 0.05;
      var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2200;
      verb.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(master);
    });
    musicGain = ctx.createGain(); musicGain.gain.value = 0.5;
    musicGain.connect(master); musicGain.connect(verb);
  }
  function pad(notes, t, dur) {
    notes.forEach(function (m, i) {
      [-4, 4].forEach(function (det) {
        var o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = hz(m); o.detune.value = det;
        var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(i < 2 ? 0.05 : 0.025, t + 2.5);
        g.gain.setValueAtTime(i < 2 ? 0.05 : 0.025, t + dur - 2.5);
        g.gain.linearRampToValueAtTime(0, t + dur + 1.5);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        o.connect(lp); lp.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + 2);
      });
    });
    // редкие «капли» пианино сверху
    for (var k = 0; k < 3; k++) {
      var m = notes[2 + Math.floor(Math.random() * (notes.length - 2))] + 12;
      bell(hz(m), t + 0.8 + k * 2.4 + Math.random() * 0.6, 0.035, musicGain);
    }
  }
  function bell(f, t, vol, out) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o2.type = 'sine'; o.frequency.value = f; o2.frequency.value = f * 2.01;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + 2.6);
    var g2 = ctx.createGain(); g2.gain.value = 0.3;
    o.connect(g); o2.connect(g2); g2.connect(g); g.connect(out || master);
    o.start(t); o2.start(t); o.stop(t + 2.7); o2.stop(t + 2.7);
  }
  function loop() {
    var dur = 8;
    pad(CHORDS[step % CHORDS.length], ctx.currentTime + 0.05, dur);
    step++;
    timer = setTimeout(loop, dur * 1000);
  }
  function setOn(v) {
    on = v;
    btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.querySelector('span').textContent = on ? 'Звук вкл' : 'Звук';
    try { localStorage.setItem('gs-sound', on ? '1' : '0'); } catch (e) {}
    if (on) {
      if (!ctx) init();
      ctx.resume();
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 2);
      if (!timer) loop();
    } else if (ctx) {
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.8);
      clearTimeout(timer); timer = null;
    }
  }
  btn.addEventListener('click', function () { setOn(!on); });
  document.addEventListener('visibilitychange', function () { if (ctx && on) { if (document.hidden) ctx.suspend(); else ctx.resume(); } });

  // «дзинь» лифта — вызывается из js/lift.js
  window.gsDing = function () {
    if (!on || !ctx) return;
    var t = ctx.currentTime + 0.02;
    bell(hz(88), t, 0.12); bell(hz(84), t + 0.32, 0.1);
  };
})();
