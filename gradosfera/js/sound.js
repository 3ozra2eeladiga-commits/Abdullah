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
    if (window.gsMate) window.gsMate(on);
    if (!on && eng) eng.g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
    if (on) {
      if (!ctx) init(); else if (ctx.state !== 'running') rebuild();
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
  // Ушли на другую вкладку (карта, звонок) и вернулись: телефон «глушит» звук, и простое resume() часто не срабатывает.
  // Поэтому пробуем возобновить сразу, а при первом касании страницы — пересоздаём звук заново (это разрешено только по касанию).
  function rebuild() {
    try { ctx.close(); } catch (e) {}
    ctx = null; eng = null; noiseBuf = null; rope = null;
    init(); ctx.resume();
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
    clearTimeout(timer); timer = null; step = 0; loop();
  }
  function wake() {
    if (!ctx || !on || document.hidden) return;
    try { ctx.resume(); } catch (e) {}
    var t = ctx.currentTime; master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(0, t); master.gain.linearRampToValueAtTime(0.9, t + 1.2);
    if (!timer) loop();
  }
  window.addEventListener('pagehide', function () { if (ctx) { try { master.gain.setValueAtTime(0, ctx.currentTime); ctx.suspend(); } catch (e) {} } });
  function onGesture(e) {
    if (!ctx || !on || ctx.state === 'running') return;
    if (e && btn.contains(e.target)) return;      // нажатие на колонку обработает сама кнопка
    rebuild();
  }
  ['pointerdown', 'touchend', 'keydown'].forEach(function (t) { document.addEventListener(t, onGesture, true); });
  document.addEventListener('visibilitychange', function () {
    if (!ctx || !on) return;
    if (document.hidden) {
      // уходим со страницы: сразу глушим и останавливаем мотор, потом «усыпляем» звук — иначе телефон может зациклить последний кусок звука
      var t = ctx.currentTime;
      master.gain.cancelScheduledValues(t); master.gain.setValueAtTime(master.gain.value, t); master.gain.linearRampToValueAtTime(0, t + 0.05);
      if (eng) { try { eng.o.stop(); eng.o2.stop(); eng.n.stop(); } catch (e) {} eng = null; }
      stopRope();
      clearTimeout(timer); timer = null;
      setTimeout(function () { if (document.hidden && ctx) ctx.suspend(); }, 120);
    } else wake();
  });
  window.addEventListener('focus', wake);
  window.addEventListener('pageshow', wake);


  // ---------- эффекты: мотор машины, «лежачий полицейский», парковка, вода в трубах ----------
  var noiseBuf = null, eng = null, lastWater = 0;
  function noise() {
    if (noiseBuf) return noiseBuf;
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var d = noiseBuf.getChannelData(0); for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return noiseBuf;
  }
  function thump(t, f0, f1, vol, dur) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
    var n = ctx.createBufferSource(), ng = ctx.createGain(), lp = ctx.createBiquadFilter();
    n.buffer = noise(); lp.type = 'lowpass'; lp.frequency.value = 500;
    ng.gain.setValueAtTime(vol * 0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t + dur * 0.6);
    n.connect(lp); lp.connect(ng); ng.connect(master); n.start(t); n.stop(t + dur);
  }
  function engine(level) {
    if (!on || !ctx) return;
    if (!eng) {
      var o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
      var n = ctx.createBufferSource(), nl = ctx.createBiquadFilter(), ng = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = 38; o2.frequency.value = 76;
      lp.type = 'lowpass'; lp.frequency.value = 260; g.gain.value = 0;
      n.buffer = noise(); n.loop = true; nl.type = 'bandpass'; nl.frequency.value = 180; nl.Q.value = 0.6; ng.gain.value = 0.35;
      o.connect(lp); o2.connect(lp); lp.connect(g); n.connect(nl); nl.connect(ng); ng.connect(g); g.connect(master);
      o.start(); o2.start(); n.start();
      eng = { o: o, o2: o2, n: n, g: g, lp: lp };
    }
    var t = ctx.currentTime, v = Math.max(0, Math.min(1, level));
    eng.g.gain.setTargetAtTime(v * 0.16, t, 0.12);
    eng.o.frequency.setTargetAtTime(34 + v * 22, t, 0.2); eng.o2.frequency.setTargetAtTime(68 + v * 44, t, 0.2);
    eng.lp.frequency.setTargetAtTime(200 + v * 260, t, 0.2);
  }
  // трос: «шшш» верёвки по блоку + скрип + шаги рабочих, громкость — от скорости
  var rope = null, lastStep = 0, lastCreak = 0;
  function pull(level) {
    if (!on || !ctx) return;
    var v = Math.max(0, Math.min(1, level || 0)), t = ctx.currentTime;
    if (!rope) {
      if (v <= 0) return;
      var n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain(), lfo = ctx.createOscillator(), lg = ctx.createGain();
      n.buffer = noise(); n.loop = true; bp.type = 'bandpass'; bp.frequency.value = 1100; bp.Q.value = 1.4; g.gain.value = 0;
      lfo.frequency.value = 7; lg.gain.value = 350; lfo.connect(lg); lg.connect(bp.frequency);   // «волокна» верёвки
      n.connect(bp); bp.connect(g); g.connect(master); n.start(); lfo.start();
      rope = { n: n, g: g, lfo: lfo };
    }
    rope.g.gain.setTargetAtTime(v * 0.09, t, v > 0 ? 0.05 : 0.15);
    if (v > 0.05 && t - lastStep > 0.42 - v * 0.15) { lastStep = t; thump(t + 0.01, 160, 70, 0.10 + v * 0.08, 0.09); }          // шаги
    if (v > 0.25 && t - lastCreak > 1.1 + Math.random()) {                                                                      // скрип блока
      lastCreak = t; var o = ctx.createOscillator(), cg = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(240 + Math.random() * 80, t); o.frequency.linearRampToValueAtTime(330 + Math.random() * 120, t + 0.28);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.03, t + 0.04); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(f); f.connect(cg); cg.connect(master); o.start(t); o.stop(t + 0.35);
    }
  }
  function stopRope() { if (rope) { try { rope.n.stop(); rope.lfo.stop(); } catch (e) {} rope = null; } }
  window.gsSfx = {
    engine: engine, pull: pull,
    bump: function () { if (!on || !ctx) return; var t = ctx.currentTime + 0.01; thump(t, 90, 40, 0.5, 0.22); thump(t + 0.2, 80, 38, 0.42, 0.22); },
    park: function () {
      if (!on || !ctx) return; engine(0); var t = ctx.currentTime + 0.15;
      // короткий «пик-пик» сигнализации
      [0, 0.16].forEach(function (dt) { var o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'square'; o.frequency.value = 1760;
        g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.05, t + dt + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.09);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2500; o.connect(lp); lp.connect(g); g.connect(master); o.start(t + dt); o.stop(t + dt + 0.12); });
    },
    water: function (level) {
      if (!on || !ctx || level <= 0) return;
      var now = ctx.currentTime, gap = 0.34 - 0.2 * Math.min(1, level);
      if (now - lastWater < gap) return; lastWater = now;
      thump(now + 0.01, 120, 55, 0.22 + 0.15 * Math.min(1, level), 0.2);       // «тух»
      var o = ctx.createOscillator(), g = ctx.createGain();                        // пузырёк
      o.type = 'sine'; o.frequency.setValueAtTime(380 + Math.random() * 200, now + 0.05); o.frequency.exponentialRampToValueAtTime(900, now + 0.12);
      g.gain.setValueAtTime(0.0001, now + 0.05); g.gain.exponentialRampToValueAtTime(0.03, now + 0.06); g.gain.exponentialRampToValueAtTime(0.0001, now + 0.13);
      o.connect(g); g.connect(master); o.start(now + 0.05); o.stop(now + 0.15);
    }
  };

  // «дзинь» лифта — вызывается из js/lift.js
  window.gsDing = function () {
    if (!on || !ctx) return;
    var t = ctx.currentTime + 0.02;
    bell(hz(88), t, 0.12); bell(hz(84), t + 0.32, 0.1);
  };
})();
