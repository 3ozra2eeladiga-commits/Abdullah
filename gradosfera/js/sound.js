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
  function pad(notes, t, dur, calm) {
    var A = calm ? 2.5 : 0.8, v1 = calm ? 0.05 : 0.03, v2 = calm ? 0.025 : 0.016, R = calm ? 1.5 : 0.8;
    notes.forEach(function (m, i) {
      [-4, 4].forEach(function (det) {
        var o = ctx.createOscillator(); o.type = i < 2 ? 'sine' : 'triangle';
        o.frequency.value = hz(m); o.detune.value = det;
        var g = ctx.createGain(); g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(i < 2 ? v1 : v2, t + A);
        g.gain.setValueAtTime(i < 2 ? v1 : v2, t + Math.max(A + 0.1, dur - A));
        g.gain.linearRampToValueAtTime(0, t + dur + R);
        var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
        o.connect(lp); lp.connect(g); g.connect(musicGain); o.start(t); o.stop(t + dur + R + 0.5);
      });
    });
    if (calm) for (var k = 0; k < 3; k++) {          // редкие «капли» пианино сверху
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
  // ---------- новая музыка: тёплый «deep house / chill» грув, 100 BPM ----------
  // Bm – G – D – A (цепляющая последовательность), бас, мягкая бочка, хлопок, хэт, «плак»-арпеджио с эхом.
  // Первые 2 такта — вступление (пэды + арпеджио), потом вступает ритм.
  // Dmaj7 – Bm7 – Gmaj7 – A: тепло и светло
  var SONG = [[50, 57, 61, 62, 66], [47, 54, 57, 59, 62], [43, 50, 54, 55, 59], [45, 52, 55, 57, 61]];
  var BPM = 96, S16 = 60 / BPM / 4, nextT = 0, st16 = 0, bar = 0, echo = null;
  function initEcho() {
    var d = ctx.createDelay(1); d.delayTime.value = S16 * 3;
    var fb = ctx.createGain(); fb.gain.value = 0.32;
    var lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 2600;
    d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(musicGain);
    echo = d;
  }
  function kick(t) {
    var o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(60, t + 0.1);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.28, t + 0.006); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    o.connect(g); g.connect(musicGain); o.start(t); o.stop(t + 0.35);
  }
  function clap(t) {
    var n = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 0.9;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.08, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    n.connect(bp); bp.connect(g); g.connect(musicGain); n.start(t, Math.random()); n.stop(t + 0.2);
  }
  function hat(t, open) {
    var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise(); hp.type = 'highpass'; hp.frequency.value = 7500;
    var len = open ? 0.16 : 0.04;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(open ? 0.05 : 0.04, t + 0.002); g.gain.exponentialRampToValueAtTime(0.0001, t + len);
    n.connect(hp); hp.connect(g); g.connect(musicGain); n.start(t, Math.random()); n.stop(t + len + 0.02);
  }
  function bass(m, t, dur) {
    var o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth'; o2.type = 'sine'; o.frequency.value = hz(m - 12); o2.frequency.value = hz(m - 24);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(180, t + dur); lp.Q.value = 4;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.16, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(lp); o2.connect(lp); lp.connect(g); g.connect(musicGain); o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function pluck(m, t, vol) {
    var o = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'triangle'; o.frequency.value = hz(m);
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(4200, t); lp.frequency.exponentialRampToValueAtTime(700, t + 0.25);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.4);
    o.connect(lp); lp.connect(g); g.connect(musicGain); if (echo) g.connect(echo); o.start(t); o.stop(t + 0.45);
  }
  var ARP = [0, 3, 2, 4, 1, 3, 2, 4, 0, 3, 2, 4, 3, 2, 1, 2];          // рисунок арпеджио по нотам аккорда
  var BASSP = [1, 0, 0, 1, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0];        // ритм баса
  function tick16(t) {
    var ch = SONG[bar % SONG.length], groove = bar >= 2, k = st16;
    if (k === 0) pad(ch.map(function (m) { return m + 12; }), t, 60 / BPM * 4 + 0.5);
    if (k % 2 === 0 || k === 7 || k === 15) pluck(ch[ARP[k]] + 24, t, k % 4 === 0 ? 0.065 : 0.04);
    if (groove) {                                   // ритм лёгкий, без баса
      if (k === 0 || k === 8 || k === 10) kick(t);
      if (k === 4 || k === 12) clap(t);
      if (k % 2 === 1) hat(t, k === 15);
    }
    st16 = (st16 + 1) % 16; if (st16 === 0) bar++;
  }
  var TRACK = '1';   // на сайте — спокойная музыка; варианты выбираются отдельно (переключатель скрыт)
  var qs = /[?&]music=(\d)/.exec(location.search); if (qs) TRACK = qs[1] === '2' ? '2' : '1';
  function loop() {
    if (TRACK === '1') {                          // спокойная: длинные аккорды раз в 8 с
      pad(CHORDS[step % CHORDS.length], ctx.currentTime + 0.05, 8, true); step++;
      timer = setTimeout(loop, 8000); return;
    }
    if (!echo) initEcho();
    if (nextT < ctx.currentTime) nextT = ctx.currentTime + 0.06;
    while (nextT < ctx.currentTime + 0.15) { tick16(nextT); nextT += S16; }
    timer = setTimeout(loop, 30);
  }
  function setTrack(n) {
    TRACK = n; try { localStorage.setItem('gs-track', n); } catch (e) {}
    sw.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.t === n); });
    if (on && ctx) { clearTimeout(timer); timer = null; st16 = 0; bar = 0; step = 0; nextT = 0;
      master.gain.cancelScheduledValues(ctx.currentTime); master.gain.setValueAtTime(0, ctx.currentTime); master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.2); loop(); }
  }
  // переключатель «1 · 2» рядом с колонкой — появляется, когда звук включён
  var sw = document.createElement('div'); sw.className = 'snd-sw'; sw.setAttribute('role', 'group'); sw.setAttribute('aria-label', 'Выбор музыки');
  sw.innerHTML = '<button type="button" data-t="1" aria-label="Спокойная музыка">1</button><button type="button" data-t="2" aria-label="Ритмичная музыка">2</button>';
  btn.insertAdjacentElement('afterend', sw);
  sw.addEventListener('click', function (e) { var b = e.target.closest('button'); if (b) setTrack(b.dataset.t); });
  sw.querySelectorAll('button').forEach(function (b) { b.classList.toggle('is-on', b.dataset.t === TRACK); });
  function setOn(v) {
    on = v;
    btn.classList.toggle('is-on', on); btn.setAttribute('aria-pressed', on ? 'true' : 'false'); document.body.classList.toggle('snd-on', on);
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
    ctx = null; eng = null; noiseBuf = null; rope = null; echo = null; nextT = 0;
    init(); ctx.resume();
    master.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 1.5);
    clearTimeout(timer); timer = null; st16 = 0; bar = 0; loop();
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
      n.buffer = noise(); n.loop = true; bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.7; g.gain.value = 0;
      lfo.frequency.value = 3; lg.gain.value = 120; lfo.connect(lg); lg.connect(bp.frequency);   // «волокна» верёвки
      n.connect(bp); bp.connect(g); g.connect(master); n.start(); lfo.start();
      rope = { n: n, g: g, lfo: lfo };
    }
    rope.g.gain.setTargetAtTime(v * 0.045, t, v > 0 ? 0.08 : 0.2);
    if (false && t - lastStep > 0.42 - v * 0.15) { lastStep = t; knock(t + 0.01, 420, 0.10 + v * 0.08); }          // шаги
    if (false && t - lastCreak > 1.1 + Math.random()) {                                                                      // скрип блока
      lastCreak = t; var o = ctx.createOscillator(), cg = ctx.createGain(), f = ctx.createBiquadFilter();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(240 + Math.random() * 80, t); o.frequency.linearRampToValueAtTime(330 + Math.random() * 120, t + 0.28);
      f.type = 'bandpass'; f.frequency.value = 900; f.Q.value = 6;
      cg.gain.setValueAtTime(0.0001, t); cg.gain.exponentialRampToValueAtTime(0.07, t + 0.04); cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      o.connect(f); f.connect(cg); cg.connect(master); o.start(t); o.stop(t + 0.35);
    }
  }
  // короткий «деревянный» стук (слышно и в динамике телефона)
  function knock(t, f, vol, out) {
    var o = ctx.createOscillator(), g = ctx.createGain(), bp = ctx.createBiquadFilter();
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.6, t); o.frequency.exponentialRampToValueAtTime(f, t + 0.03);
    bp.type = 'bandpass'; bp.frequency.value = f * 1.2; bp.Q.value = 3;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.004); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    o.connect(bp); bp.connect(g); g.connect(out || master); o.start(t); o.stop(t + 0.14);
  }
  // тихий сухой «тик» — как кольцо фокуса у объектива камеры
  function tick(t) {
    var n = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), bp = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = noise(); hp.type = 'highpass'; hp.frequency.value = 3000; bp.type = 'bandpass'; bp.frequency.value = 4800 + Math.random() * 600; bp.Q.value = 2.5;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.022, t + 0.001); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.018);
    n.connect(hp); hp.connect(bp); bp.connect(g); g.connect(master); n.start(t, Math.random()); n.stop(t + 0.03);
  }
  // звук стройки при прокрутке: «трещотка» гаечного ключа — щелчки настроены в тон музыке
  var scrollAcc = 0, lastY = window.scrollY, lastTick = 0;
  window.addEventListener('scroll', function () {
    var y = window.scrollY, dy = Math.abs(y - lastY); lastY = y;
    if (!on || !ctx || ctx.state !== 'running' || dy > 2000) return;
    scrollAcc += dy;
    var t = ctx.currentTime;
    // звук при прокрутке отключён по просьбе — при листании только музыка
  }, { passive: true });
  // «молоточки вдалеке» — два лёгких звонких удара в такт музыке, иногда
  function taps(t) {
    [0, 0.32].forEach(function (dt, i) {
      var f = hz(84 - i * 5), o = ctx.createOscillator(), o2 = ctx.createOscillator(), g = ctx.createGain();
      o.frequency.value = f; o2.frequency.value = f * 2.76; o.type = o2.type = 'sine';
      g.gain.setValueAtTime(0.0001, t + dt); g.gain.exponentialRampToValueAtTime(0.03, t + dt + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.6);
      o.connect(g); o2.connect(g); g.connect(musicGain); o.start(t + dt); o2.start(t + dt); o.stop(t + dt + 0.65); o2.stop(t + dt + 0.65);
    });
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
