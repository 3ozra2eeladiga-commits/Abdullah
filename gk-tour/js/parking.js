/* Подземный паркинг: настоящее 3D-пространство под домом (по плану застройщика) и режим «Внутри / Схема».
   window.GKParking = { enter(), exit(), active(), setView('inside'|'scheme'), view(), goTo(i|id), spots() }
   Геометрия строится лениво — при первом входе. Всё своё: свет, окружение для отражений, машины-заглушки (если нет GKCars). */
(function () {
  'use strict';
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('parking')) return;
  var ctx = GKScene.ctx, T = ctx.T, scene = ctx.scene, camera = ctx.camera, renderer = ctx.renderer, controls = ctx.controls, app = ctx.app;
  var FY = -4.4, CY = -1.0, HH = CY - FY, EYE = 1.6, RAD = 0.45, PI = Math.PI;
  var seed = 20280; function rnd() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  var FONT = '"Onest", "Segoe UI", Arial, sans-serif';

  /* ---------- помощники ---------- */
  function tex(w, h, draw, rs, rt) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    t.wrapS = rs ? T.RepeatWrapping : T.ClampToEdgeWrapping; t.wrapT = rt ? T.RepeatWrapping : T.ClampToEdgeWrapping; return t;
  }
  function speck(g, w, h, n, a) { for (var i = 0; i < n; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255,' : '0,0,0,') + (rnd() * a).toFixed(3) + ')'; g.fillRect(rnd() * w, rnd() * h, 1 + rnd() * 2, 1 + rnd() * 2); } }
  function mat4(x, y, z, ry, sx, sy, sz) { return new T.Matrix4().compose(new T.Vector3(x, y, z), new T.Quaternion().setFromEuler(new T.Euler(0, ry || 0, 0)), new T.Vector3(sx || 1, sy || 1, sz || 1)); }

  // Сборщик: много коробок/плоскостей -> одна геометрия (один вызов отрисовки)
  function Batch() { this.p = []; this.n = []; this.u = []; this.c = []; }
  Batch.prototype.add = function (geo, m, col) {
    var g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m);
    var P = g.attributes.position.array, N = g.attributes.normal.array, U = g.attributes.uv ? g.attributes.uv.array : null, n = P.length / 3, i;
    col = col || [1, 1, 1];
    for (i = 0; i < n; i++) { this.p.push(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); this.n.push(N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); this.u.push(U ? U[i * 2] : 0, U ? U[i * 2 + 1] : 0); this.c.push(col[0], col[1], col[2]); }
    if (g !== geo) g.dispose(); geo.dispose(); return this;
  };
  Batch.prototype.box = function (x0, x1, y0, y1, z0, z1, col, sx, sy, sz) {
    var g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0, sx || 1, sy || 1, sz || 1); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); return this.add(g, null, col);
  };
  Batch.prototype.plane = function (w, h, m, col, uv) {          // плоскость (лицом к +Z до поворота), uv = [u0,v0,u1,v1]
    var g = new T.PlaneGeometry(w, h), a = g.attributes.uv.array, i;
    if (uv) for (i = 0; i < 4; i++) { a[i * 2] = uv[0] + a[i * 2] * (uv[2] - uv[0]); a[i * 2 + 1] = uv[1] + a[i * 2 + 1] * (uv[3] - uv[1]); }
    return this.add(g, m, col);
  };
  Batch.prototype.geo = function (uvFn, colFn) {
    var g = new T.BufferGeometry(), P = this.p, N = this.n, n = P.length / 3, U = new Float32Array(this.u), C = new Float32Array(this.c), i, r;
    if (uvFn) for (i = 0; i < n; i++) { r = uvFn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); U[i * 2] = r[0]; U[i * 2 + 1] = r[1]; }
    if (colFn) for (i = 0; i < n; i++) { r = colFn(P[i * 3], P[i * 3 + 1], P[i * 3 + 2], N[i * 3], N[i * 3 + 1], N[i * 3 + 2]); C[i * 3] = r[0]; C[i * 3 + 1] = r[1]; C[i * 3 + 2] = r[2]; }
    g.setAttribute('position', new T.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(N, 3));
    g.setAttribute('uv', new T.BufferAttribute(U, 2)); g.setAttribute('color', new T.BufferAttribute(C, 3));
    return g;
  };
  Batch.prototype.mesh = function (material, uvFn, colFn) { return new T.Mesh(this.geo(uvFn, colFn), material); };
  // прямоугольник на полу: w вдоль локальной X, d вдоль локальной Z, поворот вокруг Y; текст читается, если смотреть в сторону -Z (при rot = 0)
  function fq(b, cx, cz, w, d, rot, col, uv, y) {
    var c = Math.cos(rot || 0), s = Math.sin(rot || 0), hx = w / 2, hz = d / 2, yy = y == null ? FY + 0.006 : y;
    var q = [[-hx, -hz], [-hx, hz], [hx, hz], [hx, -hz]], uvs = uv ? [[uv[0], uv[3]], [uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]]] : [[0, 1], [0, 0], [1, 0], [1, 1]];
    [0, 1, 2, 0, 2, 3].forEach(function (i) { b.p.push(cx + q[i][0] * c + q[i][1] * s, yy, cz - q[i][0] * s + q[i][1] * c); b.n.push(0, 1, 0); b.u.push(uvs[i][0], uvs[i][1]); b.c.push(col[0], col[1], col[2]); });
  }
  function ftri(b, cx, cz, pts, rot, col) {
    var c = Math.cos(rot), s = Math.sin(rot); pts.forEach(function (q) { b.p.push(cx + q[0] * c + q[1] * s, FY + 0.006, cz - q[0] * s + q[1] * c); b.n.push(0, 1, 0); b.u.push(0, 0); b.c.push(col[0], col[1], col[2]); });
  }

  /* ---------- состояние ---------- */
  var built = false, root, ceilG, mirrorG, schemeG, wallMesh, colMesh, hot = [], pickList = [], carMats = [], obstacles = [];
  var envTex = null, bgScheme = null, bgInside = new T.Color(0x08090c), skyMat = null, rampGlow = null, rampL = null, followL = null, hemiL = null, shafts = [], floorFlash = null, yourGlow = null;
  var st = { active: false, view: 'inside', taken: false, cur: null, tok: 0, hidden: [], saved: null, fly: null, pose: null, poseDirty: false, uiOn: false };
  var START = { ex: 5.4, ez: 7.6, yaw: -0.105, pit: 0.03 };
  var v1 = new T.Vector3(), v2 = new T.Vector3(), ray = new T.Raycaster(), ndc = new T.Vector2();

  /* ---------- интерфейс (свой, префикс gkp-) ---------- */
  var css = document.createElement('style');
  css.textContent = [
    '.gkp-hud{position:absolute;inset:0;z-index:40;pointer-events:none;opacity:0;visibility:hidden;transition:opacity .6s ease,visibility 0s linear .6s;font-family:"Onest",system-ui,sans-serif;color:#efe7da;-webkit-user-select:none;user-select:none}',
    '.gkp-hud.on{opacity:1;visibility:visible;transition:opacity .6s ease .25s}',
    '.gkp-hud:before{content:"";position:absolute;inset:0;background:linear-gradient(100deg,rgba(7,8,11,.62) 0%,rgba(7,8,11,.28) 26%,rgba(7,8,11,0) 46%),linear-gradient(0deg,rgba(7,8,11,.5) 0%,rgba(7,8,11,0) 24%)}',
    '.gkp-back{position:absolute;left:20px;top:20px;height:48px;padding:0 22px 0 16px;border-radius:24px;border:1px solid rgba(239,231,218,.16);background:rgba(15,18,27,.74);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);color:#efe7da;font:500 15px/1 "Onest",system-ui,sans-serif;letter-spacing:.01em;cursor:pointer;display:flex;align-items:center;gap:10px;pointer-events:auto;transition:border-color .3s,background .3s}',
    '.gkp-back:hover{border-color:rgba(226,168,120,.6);background:rgba(22,26,37,.84)}',
    '.gkp-back i{font-style:normal;color:#e2a878;font-size:18px;line-height:1}',
    '.gkp-head{position:absolute;left:26px;top:96px;max-width:420px}',
    '.gkp-eyebrow{font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:#e2a878;display:flex;align-items:center;gap:12px}',
    '.gkp-eyebrow:before{content:"";width:30px;height:1px;background:#c98a5b}',
    '.gkp-title{font:400 46px/1.04 "Forum",Georgia,"Times New Roman",serif;margin:14px 0 12px;letter-spacing:.01em;text-shadow:0 2px 28px rgba(0,0,0,.6)}',
    '.gkp-lead{font-size:15px;line-height:1.55;color:rgba(239,231,218,.84);margin:0;max-width:330px;text-shadow:0 1px 14px rgba(0,0,0,.8)}',
    '.gkp-chips{position:absolute;left:24px;bottom:24px;display:flex;flex-direction:column;align-items:flex-start;gap:8px}',
    '.gkp-chips span{display:flex;align-items:center;gap:10px;height:38px;padding:0 16px 0 14px;border-radius:19px;border:1px solid rgba(239,231,218,.14);background:rgba(15,18,27,.66);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);font-size:13.5px;letter-spacing:.01em;color:rgba(239,231,218,.92);white-space:nowrap}',
    '.gkp-chips span:before{content:"";width:5px;height:5px;border-radius:50%;background:#e2a878;box-shadow:0 0 10px rgba(226,168,120,.9)}',
    '.gkp-switch{position:absolute;left:50%;bottom:24px;transform:translateX(-50%);display:flex;padding:4px;border-radius:28px;background:rgba(15,18,27,.76);border:1px solid rgba(239,231,218,.16);-webkit-backdrop-filter:blur(14px);backdrop-filter:blur(14px);pointer-events:auto}',
    '.gkp-switch button{min-width:116px;height:46px;border:0;border-radius:23px;background:transparent;color:rgba(239,231,218,.72);font:500 15px/1 "Onest",system-ui,sans-serif;letter-spacing:.02em;cursor:pointer;transition:background .4s ease,color .4s ease}',
    '.gkp-switch button.on{background:linear-gradient(180deg,#e6b088,#c98a5b);color:#1a130d;box-shadow:0 6px 22px rgba(201,138,91,.35)}',
    '.gkp-hint{position:absolute;left:50%;bottom:92px;transform:translateX(-50%);font-size:13px;color:rgba(239,231,218,.74);letter-spacing:.03em;white-space:nowrap;transition:opacity .9s ease;text-shadow:0 1px 10px rgba(0,0,0,.9)}',
    '.gkp-hint.off{opacity:0}',
    '.gkp-fade{position:absolute;inset:0;z-index:60;background:#07080b;opacity:0;pointer-events:none;transition:opacity .32s ease}',
    '.gkp-fade.on{opacity:1;pointer-events:auto}',
    '@media (max-width:760px){.gkp-title{font-size:32px}.gkp-head{top:84px;left:20px}.gkp-lead{font-size:14px;max-width:270px}.gkp-chips{display:none}.gkp-switch button{min-width:96px}}',
    '@media (max-height:560px){.gkp-lead{display:none}.gkp-chips span:nth-child(n+2){display:none}.gkp-hint{display:none}}'
  ].join('\n');
  document.head.appendChild(css);
  var hud = document.createElement('div'); hud.className = 'gkp-hud';
  hud.innerHTML = '<button class="gkp-back" type="button"><i>←</i>Вернуться к дому</button>' +
    '<div class="gkp-head"><div class="gkp-eyebrow">Уровень −1 · под домом</div><h2 class="gkp-title">Подземный паркинг</h2>' +
    '<p class="gkp-lead">Своё машино-место под домом. Лифт поднимает прямо на ваш этаж.</p></div>' +
    '<div class="gkp-chips"><span>45 машино-мест в основном зале</span><span>Лифт на свой этаж без улицы</span><span>Пожаротушение и вентиляция</span></div>' +
    '<div class="gkp-hint"></div>' +
    '<div class="gkp-switch"><button type="button" data-v="inside" class="on">Внутри</button><button type="button" data-v="scheme">Схема</button></div>';
  var fade = document.createElement('div'); fade.className = 'gkp-fade';
  app.appendChild(hud); app.appendChild(fade);
  var hintEl = hud.querySelector('.gkp-hint'), swBtns = hud.querySelectorAll('.gkp-switch button');
  hud.querySelector('.gkp-back').addEventListener('click', function () { exit(); });
  Array.prototype.forEach.call(swBtns, function (b) { b.addEventListener('click', function () { setView(b.getAttribute('data-v')); }); });
  document.addEventListener('keydown', function (e) { if (st.active && e.key === 'Escape') exit(); });
  function hudSync() {
    Array.prototype.forEach.call(swBtns, function (b) { b.classList.toggle('on', b.getAttribute('data-v') === st.view); });
    hintEl.textContent = st.view === 'inside' ? 'Потяните, чтобы осмотреться · нажмите на метку, чтобы перейти' : 'Вращайте схему · нажмите на метку, чтобы оказаться внутри';
    hintEl.classList.remove('off');
  }
  function emit(v) { try { document.dispatchEvent(new CustomEvent('gk:view', { detail: { view: v } })); } catch (e) {} }

  /* ---------- план паркинга (метры, мировые координаты) ---------- */
  var COLX = [-6.8, -0.3, 6.2, 12.7, 19.2], ROWZ = [-30.25, -23.75, -18.15, -12.55, -6.05, -0.45, 5.15];
  var BLOCKS = [                                   // глухие объёмы: [x0,x1,z0,z1]
    [-28.1, -19.6, -26.75, 26.75],                 // техпомещения под западным крылом (АУПТ, резервуары)
    [-19.6, -13.3, 8.0, 26.75],                    // лестнично-лифтовой узел на углу
    [-13.3, 28.1, 18.0, 26.75],                    // кладовые и лифтовой узел под южным крылом
    [25.7, 30.7, -6.0, 11.75],                     // грунт за стеной (уступ зала)
    [-19.6, -14.6, -15.6, -9.8],                   // лестница и лифт секции А
    [-2.5, 0.6, 13.2, 18.0], [17.2, 20.2, 13.2, 18.0],   // лестницы южного крыла
    [0.6, 0.9, 15.2, 18.0], [3.3, 9.6, 15.2, 18.0],      // лифтовой холл: простенок и стена с панно
    [25.7, 26.0, -35.75, -17.0]                    // стенка рампы
  ];
  var WALLS = [ [-13.65, 31.05, -36.1, -35.75], [30.7, 31.05, -35.75, -6.0], [-13.65, -13.3, -35.75, -26.75], [-19.6, -13.3, -27.1, -26.75], [28.1, 28.45, 11.75, 18.0] ];
  var strips = [];
  (function () {
    var SEG = [[-12.7, -7.5], [-6.1, -1.0], [0.4, 5.5], [6.9, 12.0], [13.4, 18.5], [19.9, 25.0]];
    [-33.0, -27.0, -21.0, -15.4, -9.3, -3.2, 2.4, 8.5].forEach(function (z) { SEG.forEach(function (s) { strips.push({ x0: s[0], x1: s[1], z0: z, z1: z }); }); });
    strips.push({ x0: 26.5, x1: 30.0, z0: -9.3, z1: -9.3 });
    [[-26.2, -21.6], [-21.0, -16.3], [-9.2, -4.6], [-4.0, 0.6], [1.2, 7.4]].forEach(function (s) { strips.push({ x0: -16.6, x1: -16.6, z0: s[0], z1: s[1] }); });
    [[-12.8, -8.2], [-7.6, -3.0], [10.1, 13.0], [13.6, 16.8], [20.7, 24.0], [24.6, 27.7]].forEach(function (s) { strips.push({ x0: s[0], x1: s[1], z0: 14.9, z1: 14.9 }); });
    strips.push({ x0: 1.0, x1: 9.2, z0: 13.3, z1: 13.3 });
  })();
  function lightAt(x, z, k) { var L = 0, i, s, dx, dz; for (i = 0; i < strips.length; i++) { s = strips[i]; dx = x < s.x0 ? s.x0 - x : x > s.x1 ? x - s.x1 : 0; dz = z < s.z0 ? s.z0 - z : z > s.z1 ? z - s.z1 : 0; L += 1 / Math.pow(1 + (dx * dx + dz * dz) / k, 1.5); } return L; }
  // места: x,z — центр, a — направление «носом вперёд» (0 = на юг, PI = на север, -PI/2 = на запад), w — ширина
  var bays = [];
  (function () {
    var i, k, n = 0, x0;
    for (i = 0; i < 6; i++) { x0 = -13.3 + 6.5 * i; bays.push({ x: x0 + 1.9, z: -33.0, a: PI, w: 2.7 }, { x: x0 + 4.6, z: -33.0, a: PI, w: 2.7 }); }
    [[-20.95, 0], [-15.35, PI], [-3.25, 0], [2.35, PI]].forEach(function (r) { for (k = 0; k < 4; k++) { x0 = -6.8 + 6.5 * k; bays.push({ x: x0 + 1.9, z: r[0], a: r[1], w: 2.7 }, { x: x0 + 4.6, z: r[0], a: r[1], w: 2.7 }); } });
    bays.push({ x: 28.9, z: -9.0, a: 0, w: 2.7 });
    [-25.0, -21.5, -18.0, -8.0, -4.5, -1.0, 2.5, 6.0].forEach(function (z) { bays.push({ x: -16.6, z: z, a: -PI / 2, w: 3.3 }); });
    [-11.4, -7.9, -4.4, 11.6, 15.1, 22.3, 25.8].forEach(function (x) { bays.push({ x: x, z: 14.9, a: 0, w: 3.3 }); });
    bays.forEach(function (b) { b.n = ++n; });
  })();
  var YOUR = null; bays.forEach(function (b) { if (Math.abs(b.x - 8.1) < 0.1 && Math.abs(b.z - 2.35) < 0.1) YOUR = b; });
  var SPOTS = [                                      // метки: кольцо на полу (rx,rz) и точка, где встаёт посетитель (ex,ez), куда смотрит
    { id: 'lift', name: 'Лифт на этажи', rx: 2.1, rz: 13.3, ex: 3.3, ez: 10.4, yaw: -0.24, pit: 0.02 },
    { id: 'place', name: 'Ваше место', rx: 8.1, rz: 2.6, ex: 7.0, ez: 9.2, yaw: 2.98, pit: -0.13 },
    { id: 'center', name: 'Центральный проезд', rx: 9.5, rz: -9.3, ex: 9.5, ez: -9.3, yaw: -PI / 2, pit: 0 },
    { id: 'ramp', name: 'Въезд', rx: 26.6, rz: -12.4, ex: 26.6, ez: -12.4, yaw: 3.04, pit: 0.07 },
    { id: 'north', name: 'Северный ряд', rx: 3.0, rz: -27.0, ex: 3.0, ez: -27.0, yaw: 2.45, pit: -0.03 },
    { id: 'west', name: 'Западное крыло', rx: -10.0, rz: -3.0, ex: -10.0, ez: -3.0, yaw: -1.92, pit: -0.02 }
  ];

  /* ---------- постройка (один раз, при первом входе) ---------- */
  function build() {
    built = true;
    root = new T.Group(); root.name = 'gk-parking'; root.visible = false; scene.add(root);
    ceilG = new T.Group(); mirrorG = new T.Group(); mirrorG.scale.y = -1; mirrorG.position.y = 2 * FY; schemeG = new T.Group(); schemeG.visible = false;
    root.add(ceilG, mirrorG, schemeG);
    var i, k, m;

    /* --- текстуры --- */
    var floorT = tex(512, 512, function (g, w, h) { g.fillStyle = '#8b8f93'; g.fillRect(0, 0, w, h); speck(g, w, h, 5200, 0.07);
      for (var j = 0; j < 9; j++) { g.strokeStyle = 'rgba(20,20,22,' + (0.03 + rnd() * 0.04) + ')'; g.lineWidth = 6 + rnd() * 10; g.beginPath(); var y = rnd() * h; g.moveTo(-20, y); g.bezierCurveTo(w * 0.3, y + rnd() * 80 - 40, w * 0.7, y + rnd() * 80 - 40, w + 20, y + rnd() * 60 - 30); g.stroke(); } }, true, true);
    var wallT = tex(512, 512, function (g, w, h) {
      var Y = function (hm) { return h - 146.8 * hm; };
      g.fillStyle = '#b9b6af'; g.fillRect(0, 0, w, h); speck(g, w, h, 4200, 0.06);
      g.fillStyle = 'rgba(0,0,0,.07)'; g.fillRect(0, 0, 2, h); g.fillRect(256, 0, 2, h); g.fillRect(0, Y(2.35), w, 2);
      var gr = g.createLinearGradient(0, 0, 0, 150); gr.addColorStop(0, 'rgba(8,8,10,.62)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, 150);
      g.fillStyle = '#2b2d32'; g.fillRect(0, Y(1.15), w, h); speck(g, w, h, 0, 0);
      gr = g.createLinearGradient(0, Y(1.15), 0, h); gr.addColorStop(0, 'rgba(255,255,255,.05)'); gr.addColorStop(0.75, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.5)'); g.fillStyle = gr; g.fillRect(0, Y(1.15), w, h);
      g.fillStyle = '#c18a5a'; g.fillRect(0, Y(1.19), w, 5);
      g.fillStyle = '#121316'; g.fillRect(0, 0, w, 5);
    }, true, false);
    var colT = tex(256, 1024, function (g, w, h) {
      var Y = function (hm) { return h - 301.2 * hm; }, j;
      g.fillStyle = '#c1beb7'; g.fillRect(0, 0, w, h); speck(g, w, h, 3000, 0.07);
      var gr = g.createLinearGradient(0, 0, 0, 260); gr.addColorStop(0, 'rgba(8,8,10,.6)'); gr.addColorStop(1, 'rgba(8,8,10,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, 260);
      g.save(); g.beginPath(); g.rect(0, Y(1.1), w, Y(0.06) - Y(1.1)); g.clip(); g.fillStyle = '#e3b21c'; g.fillRect(0, 0, w, h); g.fillStyle = '#17181a';
      for (j = -8; j < 16; j++) { g.beginPath(); g.moveTo(j * 86, Y(0.0)); g.lineTo(j * 86 + 43, Y(0.0)); g.lineTo(j * 86 + 43 + 340, Y(1.13)); g.lineTo(j * 86 + 340, Y(1.13)); g.closePath(); g.fill(); }
      g.restore(); speck(g, w, h, 1500, 0.05);
      g.fillStyle = '#c18a5a'; g.fillRect(0, Y(1.19), w, 6);
      gr = g.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.55)'); g.fillStyle = gr; g.fillRect(0, h - 90, w, 90);
      g.fillStyle = '#121316'; g.fillRect(0, 0, w, 5);
    });
    var rampT = tex(256, 256, function (g, w, h) { g.fillStyle = '#4a4c50'; g.fillRect(0, 0, w, h); speck(g, w, h, 2600, 0.1); g.fillStyle = 'rgba(0,0,0,.28)'; for (var j = 0; j < 8; j++) g.fillRect(0, j * 32, w, 5); }, true, true);
    var numT = tex(1024, 1024, function (g) { g.fillStyle = 'rgba(244,243,238,.92)'; g.font = '700 78px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      for (var j = 0; j < 64; j++) g.fillText((j + 1 < 10 ? '0' : '') + (j + 1), (j % 8) * 128 + 64, ((j / 8) | 0) * 128 + 68); });
    var blobT = tex(128, 256, function (g, w, h) { var gr = g.createRadialGradient(64, 128, 10, 64, 128, 64); gr.addColorStop(0, 'rgba(0,0,0,.86)'); gr.addColorStop(0.7, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.save(); g.translate(64, 128); g.scale(1, 2); g.translate(-64, -128); g.fillStyle = gr; g.fillRect(0, 0, w, h); g.restore(); });
    var glowT = tex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.35, 'rgba(255,255,255,.42)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); });
    var softT = tex(256, 128, function (g, w, h) { var gx = g.createLinearGradient(0, 0, w, 0); gx.addColorStop(0, 'rgba(255,255,255,0)'); gx.addColorStop(0.16, 'rgba(255,255,255,1)'); gx.addColorStop(0.84, 'rgba(255,255,255,1)'); gx.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gx; g.fillRect(0, 0, w, h);
      g.globalCompositeOperation = 'destination-in'; var gy = g.createLinearGradient(0, 0, 0, h); gy.addColorStop(0, 'rgba(0,0,0,0)'); gy.addColorStop(0.24, 'rgba(0,0,0,1)'); gy.addColorStop(0.76, 'rgba(0,0,0,1)'); gy.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gy; g.fillRect(0, 0, w, h); });
    var panelT = tex(1024, 512, function (g, w, h) {
      g.fillStyle = '#15161a'; g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(238,234,226,.88)'; g.lineWidth = 1.7;
      var leaf = function (x, y, s, r) { g.save(); g.translate(x, y); g.rotate(r); for (var q = 0; q < 8; q++) { var f = 1 - q * 0.115; g.beginPath(); g.moveTo(0, 0); g.bezierCurveTo(-s * 0.62 * f, -s * 0.3, -s * 0.46 * f, -s * 0.84, 0, -s * (0.5 + 0.5 * f)); g.bezierCurveTo(s * 0.46 * f, -s * 0.84, s * 0.62 * f, -s * 0.3, 0, 0); g.stroke(); } g.restore(); };
      [[70, 540, 330, -0.35], [205, 560, 420, 0.12], [370, 545, 350, -0.2], [520, 570, 440, 0.25], [690, 540, 340, -0.1], [830, 565, 410, 0.3], [975, 545, 330, -0.28], [455, 600, 300, -0.55], [760, 600, 290, 0.6]].forEach(function (L) { leaf(L[0], L[1], L[2], L[3]); });
      var gr = g.createLinearGradient(0, h - 90, 0, h); gr.addColorStop(0, 'rgba(255,196,128,0)'); gr.addColorStop(1, 'rgba(255,196,128,.75)'); g.fillStyle = gr; g.fillRect(0, h - 90, w, 90);
      gr = g.createLinearGradient(0, 0, 0, 200); gr.addColorStop(0, 'rgba(0,0,0,.55)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, w, 200);
    });
    var numeralT = tex(256, 512, function (g, w, h) { g.fillStyle = '#101114'; g.fillRect(0, 0, w, h); g.shadowColor = 'rgba(255,238,214,.95)'; g.shadowBlur = 26; g.fillStyle = '#fffaf0'; g.font = '700 230px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('-1', w / 2 - 6, h / 2 + 6); g.fillText('-1', w / 2 - 6, h / 2 + 6); });
    var signT = tex(512, 128, function (g, w, h) { g.fillStyle = '#0c0d10'; g.fillRect(0, 0, w, h); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 2; g.strokeRect(5, 5, w - 10, h - 10);
      g.fillStyle = '#f6f3ec'; g.font = '500 70px ' + FONT; g.textAlign = 'left'; g.textBaseline = 'middle'; g.fillText('Лифт', 66, h / 2 + 4);
      g.strokeStyle = '#f6f3ec'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round'; g.beginPath(); g.moveTo(300, 64); g.lineTo(430, 64); g.moveTo(396, 32); g.lineTo(432, 64); g.lineTo(396, 96); g.stroke(); });
    var exitT = tex(256, 96, function (g, w, h) { g.fillStyle = '#0f9a4d'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4fff8'; g.font = '700 50px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('ВЫХОД', w / 2, h / 2 + 3); });
    var liftT = tex(512, 512, function (g, w, h) {        // стена лифтового холла: 2,4 × 2,5 м, две кабины
      var X = function (mm) { return mm * 213.3; }, Y = function (hm) { return h - hm * 204.8; }, d, j;
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f1dfc2'); gr.addColorStop(0.55, '#d8c5a6'); gr.addColorStop(1, '#a8957a'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
      for (d = 0; d < 2; d++) { var x0 = X(0.2 + d * 1.1), x1 = X(1.1 + d * 1.1);
        g.fillStyle = '#4b4741'; g.fillRect(x0 - 14, Y(2.18), x1 - x0 + 28, Y(0) - Y(2.18));
        gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#8f9196'); gr.addColorStop(0.25, '#d4d6da'); gr.addColorStop(0.5, '#9b9da2'); gr.addColorStop(0.75, '#d0d2d6'); gr.addColorStop(1, '#85878c'); g.fillStyle = gr; g.fillRect(x0, Y(2.1), x1 - x0, Y(0) - Y(2.1));
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect((x0 + x1) / 2 - 1.5, Y(2.1), 3, Y(0) - Y(2.1));
        for (j = 0; j < 60; j++) { g.fillStyle = 'rgba(255,255,255,' + (rnd() * 0.05) + ')'; g.fillRect(x0, Y(2.1) + rnd() * (Y(0) - Y(2.1)), x1 - x0, 1); }
        g.fillStyle = '#16171a'; g.fillRect((x0 + x1) / 2 - 34, Y(2.42), 68, 34); g.fillStyle = '#ffb45c'; g.font = '700 24px Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('-1', (x0 + x1) / 2, Y(2.42) + 18); }
      g.fillStyle = '#2a2b2f'; g.fillRect(X(1.2) - 13, Y(1.3), 26, 62); g.fillStyle = '#ffb45c'; g.beginPath(); g.arc(X(1.2), Y(1.3) + 20, 6, 0, 6.3); g.fill(); g.fillStyle = '#8a8c90'; g.beginPath(); g.arc(X(1.2), Y(1.3) + 44, 6, 0, 6.3); g.fill();
    });
    var ringT = tex(256, 256, function (g) { var gr = g.createRadialGradient(128, 128, 0, 128, 128, 120); gr.addColorStop(0, 'rgba(255,222,186,.5)'); gr.addColorStop(0.5, 'rgba(226,168,120,.16)'); gr.addColorStop(1, 'rgba(226,168,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
      g.strokeStyle = 'rgba(255,240,220,.96)'; g.lineWidth = 7; g.beginPath(); g.arc(128, 128, 82, 0, 6.3); g.stroke(); g.strokeStyle = 'rgba(226,168,120,.75)'; g.lineWidth = 2.5; g.beginPath(); g.arc(128, 128, 104, 0, 6.3); g.stroke();
      g.fillStyle = 'rgba(255,244,228,.98)'; g.beginPath(); g.arc(128, 128, 15, 0, 6.3); g.fill(); });
    function labelT(text, accent) { return tex(512, 128, function (g, w, h) { var r = 52, x0 = 8, x1 = w - 8, y0 = 12, y1 = h - 12;
      g.beginPath(); g.moveTo(x0 + r, y0); g.lineTo(x1 - r, y0); g.arc(x1 - r, (y0 + y1) / 2, r, -PI / 2, PI / 2); g.lineTo(x0 + r, y1); g.arc(x0 + r, (y0 + y1) / 2, r, PI / 2, PI * 1.5); g.closePath();
      g.fillStyle = accent ? 'rgba(201,138,91,.96)' : 'rgba(13,16,24,.86)'; g.fill(); g.strokeStyle = accent ? 'rgba(255,236,214,.9)' : 'rgba(226,168,120,.85)'; g.lineWidth = 2.5; g.stroke();
      g.fillStyle = accent ? '#1a130d' : '#efe7da'; g.font = '500 ' + (text.length > 15 ? 39 : 45) + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, w / 2, h / 2 + 3); }); }

    /* --- материалы --- */
    var S = function (o) { return new T.MeshStandardMaterial(o); };
    var mFloor = S({ map: floorT, vertexColors: true, roughness: 0.3, metalness: 0, transparent: true, opacity: 0.94, envMapIntensity: 0.5 });
    mFloor.onBeforeCompile = function (sh) { sh.fragmentShader = sh.fragmentShader.replace('gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
      'float gkF = pow( 1.0 - clamp( abs( dot( normalize( vViewPosition ), normal ) ), 0.0, 1.0 ), 3.0 );\n\tgl_FragColor = vec4( outgoingLight, mix( diffuseColor.a, 0.45, gkF ) );'); };
    var mWall = S({ map: wallT, roughness: 0.86, metalness: 0, envMapIntensity: 0.12 });
    var mCol = S({ map: colT, roughness: 0.8, metalness: 0, envMapIntensity: 0.12 });
    var mCeil = S({ color: 0x3a3c41, vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0 });
    var mDuct = S({ color: 0xaeb4ba, roughness: 0.42, metalness: 0.55, envMapIntensity: 0.9 });
    var mPipe = S({ color: 0xa3261d, roughness: 0.45, metalness: 0.2, envMapIntensity: 0.4 });
    var mLine = S({ vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.2, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 });
    var mNum = S({ map: numT, transparent: true, depthWrite: false, roughness: 0.6, envMapIntensity: 0.1, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -3 });
    var mTrim = S({ vertexColors: true, roughness: 0.5, metalness: 0.35, envMapIntensity: 0.5 });
    var mRamp = S({ map: rampT, roughness: 0.9, envMapIntensity: 0.05 });
    var mLobby = S({ color: 0xd8cbb4, roughness: 0.7, emissive: 0xffd2a0, emissiveIntensity: 0.22, envMapIntensity: 0.2 });
    var mGlass = S({ color: 0xa9c0cc, roughness: 0.04, metalness: 0, transparent: true, opacity: 0.2, envMapIntensity: 1.3, depthWrite: false });
    var mStrip = new T.MeshBasicMaterial({ color: new T.Color(3.1, 3.2, 3.4) });
    var mWarm = new T.MeshBasicMaterial({ color: new T.Color(2.4, 1.75, 1.05) });
    var mPanel = S({ map: panelT, emissiveMap: panelT, emissive: 0xffffff, emissiveIntensity: 0.95, roughness: 0.6, envMapIntensity: 0.1 });
    var mSelf = function (t) { return new T.MeshBasicMaterial({ map: t, toneMapped: false }); };
    var mShadow = new T.MeshBasicMaterial({ map: blobT, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.78, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -2 });
    var mGlowAdd = function (col, op, t) { return new T.MeshBasicMaterial({ map: t || glowT, color: col, transparent: true, opacity: op, depthWrite: false, blending: T.AdditiveBlending, fog: false, toneMapped: false }); };

    /* --- пол --- */
    var bF = new Batch(), patch = function (b, x0, x1, z0, z1, y, step, down) { var g = new T.PlaneGeometry(x1 - x0, z1 - z0, Math.max(1, Math.round((x1 - x0) / step)), Math.max(1, Math.round((z1 - z0) / step))); g.rotateX(down ? PI / 2 : -PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); b.add(g); };
    patch(bF, -13.3, 30.7, -35.75, 11.75, FY, 1); patch(bF, -19.6, -13.3, -26.75, 8.0, FY, 1); patch(bF, -13.3, 28.1, 11.75, 18.0, FY, 1);
    var floor = bF.mesh(mFloor, function (x, y, z) { return [x / 5, z / 5]; }, function (x, y, z) { var L = 0.5 + 0.42 * Math.min(1.35, lightAt(x, z, 6.5)); return [L, L, L * 1.01]; });
    floor.renderOrder = 1; root.add(floor);

    /* --- стены, глухие объёмы, лифтовой холл --- */
    var bW = new Batch();
    BLOCKS.forEach(function (b) { bW.box(b[0], b[1], FY, CY, b[2], b[3]); obstacles.push([b[0], b[1], b[2], b[3]]); });
    WALLS.forEach(function (b) { bW.box(b[0], b[1], FY, CY, b[2], b[3]); });
    bW.box(0.9, 3.3, FY + 2.5, CY, 15.2, 18.0);                                  // перемычка над входом в холл
    bW.box(25.7, 26.0, CY, 0.9, -36.1, -21.0); bW.box(30.7, 31.05, CY, 0.9, -36.1, -21.0); bW.box(26.0, 30.7, CY, 0.9, -21.0, -20.7);   // парапеты проёма рампы
    bW.box(25.86, 26.0, FY, FY + 0.32, -17.0, -15.5);
    wallMesh = bW.mesh(mWall, function (x, y, z, nx, ny) { if (ny > 0.5) return [0.5, 0.997]; if (ny < -0.5) return [0.5, 0.82]; return [(Math.abs(nx) > 0.5 ? z : x) / HH, Math.min(0.975, Math.max(0, (y - FY) / HH) * 0.975)]; });
    root.add(wallMesh);
    var wm2 = new T.Mesh(wallMesh.geometry, mWall); mirrorG.add(wm2);

    /* --- колонны --- */
    var cols = [];
    COLX.forEach(function (x) { ROWZ.forEach(function (z) { cols.push([x, z]); }); }); cols.push([25.7, -12.55]);
    [-23.25, -19.75, -6.25, -2.75, 0.75, 4.25].forEach(function (z) { cols.push([-13.55, z]); });
    [-9.65, -6.15, 13.35, 24.05].forEach(function (x) { cols.push([x, 12.0]); });
    var cg = new T.BoxGeometry(0.5, HH, 0.5), cu = cg.attributes.uv.array; for (i = 8; i < 16; i++) { cu[i * 2] = 0.5; cu[i * 2 + 1] = 0.998; }
    colMesh = new T.InstancedMesh(cg, mCol, cols.length); colMesh.frustumCulled = false;
    cols.forEach(function (c, j) { colMesh.setMatrixAt(j, mat4(c[0], FY + HH / 2, c[1], 0)); obstacles.push([c[0] - 0.3, c[0] + 0.3, c[1] - 0.3, c[1] + 0.3]); });
    root.add(colMesh);
    var cm2 = new T.InstancedMesh(cg, mCol, cols.length); cm2.instanceMatrix = colMesh.instanceMatrix; cm2.frustumCulled = false; mirrorG.add(cm2);

    /* --- потолок: плита, балки --- */
    var bC = new Batch();
    patch(bC, -13.3, 26.0, -35.75, 11.75, CY, 1.6, true); patch(bC, 26.0, 30.7, -21.0, -6.0, CY, 1.6, true); patch(bC, -19.6, -13.3, -26.75, 8.0, CY, 1.6, true); patch(bC, -13.3, 28.1, 11.75, 18.0, CY, 1.6, true);
    COLX.forEach(function (x) { bC.box(x - 0.2, x + 0.2, CY - 0.45, CY, -35.75, 11.75, null, 1, 1, 30); });
    bC.box(25.5, 25.9, CY - 0.45, CY, -17.0, -6.0, null, 1, 1, 7);
    ROWZ.forEach(function (z) { bC.box(-13.3, z < -19 || z > -12 ? 25.7 : 30.7, CY - 0.45, CY, z - 0.2, z + 0.2, null, 26, 1, 1); });
    bC.box(-13.55, -13.05, CY - 0.6, CY, -26.75, 8.0, null, 1, 1, 22); bC.box(-13.3, 25.7, CY - 0.6, CY, 11.5, 12.0, null, 26, 1, 1);
    var ceil = bC.mesh(mCeil, null, function (x, y, z, nx, ny) { var L = 0.42 + 0.95 * Math.min(1.6, lightAt(x, z, 1.1)) + (ny < -0.5 && y < CY - 0.1 ? 0.12 : 0); return [L, L, L * 1.03]; });
    ceilG.add(ceil);

    /* --- светильники-линии (и их отражение в полу) --- */
    var sg = new T.BoxGeometry(1, 1, 1), stripM = new T.InstancedMesh(sg, mStrip, strips.length); stripM.frustumCulled = false;
    strips.forEach(function (s, j) { var lx = s.x1 - s.x0, lz = s.z1 - s.z0; stripM.setMatrixAt(j, mat4((s.x0 + s.x1) / 2, CY - 0.5, (s.z0 + s.z1) / 2, 0, lx > lz ? lx : 0.1, 0.05, lx > lz ? 0.1 : lz)); });
    ceilG.add(stripM);
    var sm2 = new T.InstancedMesh(sg, mStrip, strips.length); sm2.instanceMatrix = stripM.instanceMatrix; sm2.frustumCulled = false; mirrorG.add(sm2);

    /* --- вентиляция и спринклеры --- */
    var bD = new Batch(), duct = function (x0, x1, z0, z1) { bD.box(x0, x1, CY - 1.05, CY - 0.6, z0, z1); var alongX = x1 - x0 > z1 - z0, a, e = 0.025;
      for (a = (alongX ? x0 : z0) + 0.8; a < (alongX ? x1 : z1); a += 1.6) { if (alongX) bD.box(a - 0.02, a + 0.02, CY - 1.05 - e, CY - 0.6 + e, z0 - e, z1 + e); else bD.box(x0 - e, x1 + e, CY - 1.05 - e, CY - 0.6 + e, a - 0.02, a + 0.02); }
      for (a = (alongX ? x0 : z0) + 1.6; a < (alongX ? x1 : z1); a += 6.4) { if (alongX) { bD.box(a - 0.015, a + 0.015, CY - 0.6, CY, z0 + 0.08, z0 + 0.11); bD.box(a - 0.015, a + 0.015, CY - 0.6, CY, z1 - 0.11, z1 - 0.08); } } };
    duct(-12.4, 24.6, -7.95, -7.05); duct(-12.4, 24.6, -29.25, -28.35); duct(-12.35, -11.45, -28.35, -7.95);
    ceilG.add(bD.mesh(mDuct));
    var bP = new Batch(), pipe = function (x0, z0, x1, z1) { var alongX = Math.abs(x1 - x0) > Math.abs(z1 - z0), len = alongX ? x1 - x0 : z1 - z0, g = new T.CylinderGeometry(0.045, 0.045, len, 8, 1, true); if (alongX) g.rotateZ(PI / 2); else g.rotateX(PI / 2); g.translate((x0 + x1) / 2, CY - 0.52, (z0 + z1) / 2); bP.add(g);
      if (alongX) for (var a = x0 + 1.2; a < x1; a += 3.25) bP.box(a - 0.03, a + 0.03, CY - 0.64, CY - 0.55, z0 - 0.03, z0 + 0.03); };
    [-31.7, -25.7, -19.7, -14.1, -4.5, 1.1, 9.8].forEach(function (z) { pipe(-12.9, z, 25.4, z); });
    pipe(25.4, -31.7, 25.4, 16.4); pipe(-12.9, 16.4, 27.7, 16.4); pipe(-17.8, -26.3, -17.8, 7.6); pipe(-17.8, -4.5, -12.9, -4.5);
    ceilG.add(bP.mesh(mPipe));

    /* --- рампа и дневной свет --- */
    var bR = new Batch(), A = [26.0, FY, -15.5], B = [30.7, FY, -15.5], C = [30.7, -0.25, -35.75], D = [26.0, -0.25, -35.75], nr = new T.Vector3(0, 20.25, 4.15).normalize();
    [[A, [0, 0]], [B, [2.35, 0]], [C, [2.35, 10.3]], [A, [0, 0]], [C, [2.35, 10.3]], [D, [0, 10.3]]].forEach(function (q) { bR.p.push(q[0][0], q[0][1], q[0][2]); bR.n.push(nr.x, nr.y, nr.z); bR.u.push(q[1][0], q[1][1]); bR.c.push(1, 1, 1); });
    root.add(bR.mesh(mRamp));
    skyMat = new T.MeshBasicMaterial({ color: 0xffffff, fog: false, toneMapped: false, side: T.DoubleSide });
    var sk1 = new T.Mesh(new T.PlaneGeometry(16, 26), skyMat); sk1.rotation.x = PI / 2; sk1.position.set(28.3, 3.2, -30); ceilG.add(sk1);
    var sk2 = new T.Mesh(new T.PlaneGeometry(16, 10), skyMat); sk2.position.set(28.3, 2.4, -42); ceilG.add(sk2);
    rampGlow = new T.Sprite(new T.SpriteMaterial({ map: glowT, color: 0xdcebff, transparent: true, opacity: 0.5, depthWrite: false, blending: T.AdditiveBlending, fog: false })); rampGlow.position.set(28.35, -0.9, -27.5); rampGlow.scale.set(13, 9, 1); ceilG.add(rampGlow);

    /* --- разметка пола, номера, колесоотбойники, тени --- */
    var bL = new Batch(), bN = new Batch(), bT = new Batch(), bS = new Batch(), WH = [0.8, 0.8, 0.78], YE = [0.82, 0.6, 0.08], CO = [0.95, 0.56, 0.3], DK = [0.035, 0.036, 0.04];
    var loc = function (b, lx, lz) { var c = Math.cos(b.a), s = Math.sin(b.a); return [b.x + lx * c + lz * s, b.z - lx * s + lz * c]; };
    bays.forEach(function (b) {
      var p, your = b === YOUR, col = your ? CO : WH, n = b.n - 1;
      p = loc(b, -b.w / 2, 0); fq(bL, p[0], p[1], your ? 0.14 : 0.1, 5.3, b.a, col);
      p = loc(b, b.w / 2, 0); fq(bL, p[0], p[1], your ? 0.14 : 0.1, 5.3, b.a, col);
      p = loc(b, 0, 2.6); fq(bL, p[0], p[1], b.w, your ? 0.14 : 0.1, b.a, col);
      if (your) { p = loc(b, 0, -2.6); fq(bL, p[0], p[1], b.w, 0.14, b.a, col); }
      p = loc(b, 0, -2.05); fq(bN, p[0], p[1], 0.95, 0.95, b.a - PI, [1, 1, 1], [(n % 8) / 8, 1 - (((n / 8) | 0) + 1) / 8, (n % 8 + 1) / 8, 1 - ((n / 8) | 0) / 8], FY + 0.007);
      p = loc(b, 0, 1.95); bT.add(new T.BoxGeometry(1.7, 0.11, 0.16), mat4(p[0], FY + 0.055, p[1], b.a), DK); bT.add(new T.BoxGeometry(0.5, 0.115, 0.165), mat4(p[0], FY + 0.056, p[1], b.a), YE);
    });
    var arrow = function (x, z, rot) { fq(bL, x, z, 0.24, 2.0, rot, WH); ftri(bL, x, z, [[-0.55, 1.0], [0, 2.2], [0.55, 1.0]], rot, WH); };
    [[20, -27, -PI / 2], [9.5, -27, -PI / 2], [-3, -27, -PI / 2], [-10.05, -20, 0], [-10.05, -3.5, 0], [-5.5, 8.45, PI / 2], [14.5, 8.45, PI / 2], [22.45, 1.5, PI], [22.45, -19.5, PI], [16, -9.3, -PI / 2], [-1.5, -9.3, -PI / 2]].forEach(function (a) { arrow(a[0], a[1], a[2]); });
    for (k = 0; k < 6; k++) fq(bL, 2.1, 11.2 - k, 2.2, 0.5, 0, WH);                                    // «зебра» к лифтовому холлу
    fq(bL, 6.45, 12.0, 6.3, 0.1, 0, YE); fq(bL, 6.45, 15.1, 6.3, 0.1, 0, YE); fq(bL, 3.35, 13.55, 0.1, 3.2, 0, YE); fq(bL, 9.55, 13.55, 0.1, 3.2, 0, YE);
    for (k = 0; k < 7; k++) fq(bL, 4.15 + k * 0.82, 13.55, 0.09, 3.9, PI / 4 * 0.72, YE);
    var lines = bL.mesh(mLine); root.add(lines);
    var nums = bN.mesh(mNum); nums.renderOrder = 2; root.add(nums);

    /* --- лифтовой холл: панно, «-1», стеклянные двери, кабины --- */
    var bLo = new Batch(), bWarm = new Batch(), bG = new Batch(), bEx = new Batch(), GR = [0.09, 0.095, 0.105], BR = [0.75, 0.5, 0.28];
    bLo.box(0.9, 0.93, FY, FY + 2.5, 15.32, 18.0); bLo.box(3.27, 3.3, FY, FY + 2.5, 15.32, 18.0); bLo.box(0.9, 3.3, FY, FY + 0.014, 15.2, 18.0);
    bWarm.box(1.0, 3.2, FY + 2.46, FY + 2.5, 15.5, 17.8);                                            // светящийся потолок холла
    bWarm.box(5.15, 9.45, FY + 0.3, FY + 0.33, 15.13, 15.16);                                        // тёплая линия под панно
    root.add(bLo.mesh(mLobby));
    var liftWall = new T.Mesh(new T.PlaneGeometry(2.34, 2.46), new T.MeshStandardMaterial({ map: liftT, emissiveMap: liftT, emissive: 0xffffff, emissiveIntensity: 0.72, roughness: 0.5, envMapIntensity: 0.3 })); liftWall.rotation.y = PI; liftWall.position.set(2.1, FY + 1.23, 17.97); root.add(liftWall);
    bT.box(0.9, 3.3, FY + 2.4, FY + 2.5, 15.2, 15.3, GR); bT.box(0.9, 0.96, FY, FY + 2.4, 15.22, 15.3, GR); bT.box(3.24, 3.3, FY, FY + 2.4, 15.22, 15.3, GR); bT.box(2.07, 2.13, FY, FY + 2.4, 15.22, 15.3, GR);
    bT.box(1.9, 1.94, FY + 0.85, FY + 1.6, 15.14, 15.18, BR); bT.box(2.26, 2.3, FY + 0.85, FY + 1.6, 15.14, 15.18, BR);
    bG.plane(1.11, 2.4, mat4(1.515, FY + 1.2, 15.26, PI)); bG.plane(1.11, 2.4, mat4(2.685, FY + 1.2, 15.26, PI));
    var glass = bG.mesh(mGlass); glass.renderOrder = 4; root.add(glass);
    bT.box(3.45, 4.95, FY, CY, 15.08, 15.2, GR);                                                      // тёмная плита с цифрой
    var numeral = new T.Mesh(new T.PlaneGeometry(1.4, 2.8), new T.MeshBasicMaterial({ map: numeralT, toneMapped: false })); numeral.rotation.y = PI; numeral.position.set(4.2, FY + 1.72, 15.07); root.add(numeral);
    bT.box(5.15, 9.45, FY + 0.35, FY + 2.75, 15.12, 15.2, GR);
    var panel = new T.Mesh(new T.PlaneGeometry(4.3, 2.4), mPanel); panel.rotation.y = PI; panel.position.set(7.3, FY + 1.55, 15.11); root.add(panel);
    var halo = new T.Mesh(new T.PlaneGeometry(5.5, 3.5), mGlowAdd(new T.Color(1.0, 0.66, 0.36), 0.5, softT)); halo.rotation.y = PI; halo.position.set(7.3, FY + 1.55, 15.185); halo.renderOrder = 3; root.add(halo);
    var spill = new T.Mesh(new T.PlaneGeometry(6.5, 5.5), mGlowAdd(new T.Color(1.0, 0.72, 0.42), 0.2)); spill.rotation.x = -PI / 2; spill.position.set(2.1, FY + 0.012, 14.2); spill.renderOrder = 3; root.add(spill);
    // вывеска «Лифт →» под потолком
    var sign = new T.Group(), sb = new T.Mesh(new T.BoxGeometry(1.9, 0.44, 0.06), S({ color: 0x0c0d10, roughness: 0.5, envMapIntensity: 0.3 })), sf = new T.Mesh(new T.PlaneGeometry(1.84, 0.4), mSelf(signT));
    sf.rotation.y = PI; sf.position.z = -0.032; sign.add(sb, sf);
    [-0.8, 0.8].forEach(function (dx) { var r = new T.Mesh(new T.BoxGeometry(0.02, 0.5, 0.02), sb.material); r.position.set(dx, 0.47, 0); sign.add(r); });
    sign.position.set(6.2, CY - 0.72, 10.9); ceilG.add(sign);
    // двери выходов и таблички «ВЫХОД»
    var door = function (x, z, ry, noSign) { bT.add(new T.BoxGeometry(1.12, 2.2, 0.04), mat4(x, FY + 1.1, z, ry), [0.3, 0.31, 0.33]); var c = Math.sin(ry), s = Math.cos(ry); bT.add(new T.BoxGeometry(0.95, 2.08, 0.05), mat4(x + c * 0.02, FY + 1.04, z + s * 0.02, ry), [0.16, 0.19, 0.24]);
      bT.add(new T.BoxGeometry(0.03, 0.16, 0.05), mat4(x + c * 0.05 + s * 0.36, FY + 1.05, z + s * 0.05 - c * 0.36, ry), [0.7, 0.7, 0.72]);
      if (!noSign) bEx.plane(0.6, 0.225, mat4(x + c * 0.03, FY + 2.48, z + s * 0.03, ry)); };
    door(-0.95, 13.18, PI); door(18.7, 13.18, PI); door(-14.58, -11.0, PI / 2); door(-13.28, 9.7, PI / 2); door(-19.58, -23.2, PI / 2, true); door(-19.58, 0.8, PI / 2, true);
    bEx.plane(0.62, 0.23, mat4(2.1, FY + 2.74, 15.17, PI));
    root.add(bEx.mesh(mSelf(exitT)));
    var liftA = new Batch(); liftA.plane(1.06, 2.36, mat4(-14.57, FY + 1.18, -13.7, PI / 2), null, [0.05, 0, 0.4917, 0.944]); root.add(liftA.mesh(liftWall.material));
    root.add(bWarm.mesh(mWarm)); var wm = new T.Mesh(bWarm.geo(), mWarm); mirrorG.add(wm);

    /* --- машины --- */
    var PAL = [0xe8e8e4, 0x101114, 0x3b3e43, 0xa8acb1, 0x1c2a44, 0x5b1519, 0xb7a88b, 0xdcdcd8, 0x23262b, 0x6c7178];
    var parked = [];
    bays.forEach(function (b) {
      if (b === YOUR) return;
      var must = (Math.abs(b.z - 14.9) < 0.1 && (Math.abs(b.x - 11.6) < 0.1 || Math.abs(b.x + 4.4) < 0.1)) || (Math.abs(b.z - 2.35) < 0.1 && Math.abs(b.x - 8.1) < 3);
      if (!must && rnd() > 0.64) return;
      var rev = rnd() < 0.28, p = loc(b, (rnd() - 0.5) * 0.2, 0.12 + (rnd() - 0.5) * 0.2);
      parked.push({ x: p[0], z: p[1], ry: b.a + (rev ? PI : 0) + (rnd() - 0.5) * 0.05, a: b.a, col: Math.abs(b.x - 11.6) < 0.1 && b.z > 14 ? PAL[0] : Math.abs(b.x - 15.1) < 0.1 && b.z > 14 ? PAL[2] : PAL[(rnd() * PAL.length) | 0], b: b });
    });
    parked.forEach(function (c) { fq(bS, c.x, c.z, 2.5, 5.3, c.a, [1, 1, 1], null, FY + 0.004); var h = Math.abs(Math.sin(c.a)) > 0.5; obstacles.push(h ? [c.x - 2.4, c.x + 2.4, c.z - 1.05, c.z + 1.05] : [c.x - 1.05, c.x + 1.05, c.z - 2.4, c.z + 2.4]); });
    var shadows = bS.mesh(mShadow); shadows.renderOrder = 2; root.add(shadows);
    var carsG = new T.Group(); root.add(carsG);
    var usedReal = false;
    if (window.GKCars && typeof window.GKCars.make === 'function') {
      try {
        var TYPES = ['sedan', 'suv', 'sedan', 'hatch', 'suv', 'sedan'], probe = window.GKCars.make({ color: PAL[0], lights: false, type: 'sedan' }), meshN = 0;
        if (probe && probe.isObject3D) {
          probe.traverse(function (o) { if (o.isMesh) meshN++; });
          var maxCars = Math.max(14, Math.min(parked.length, Math.floor(260 / Math.max(1, meshN))));
          parked.forEach(function (c, j) {
            if (j >= maxCars) { c.fb = true; return; }
            var car = j === 0 && c.col === PAL[0] ? probe : window.GKCars.make({ color: c.col, lights: false, type: TYPES[j % TYPES.length] });
            car.position.set(c.x, FY, c.z); car.rotation.y = c.ry;
            car.traverse(function (o) { if (o.isLight) o.visible = false; if (o.isMesh) { o.castShadow = false; (Array.isArray(o.material) ? o.material : [o.material]).forEach(function (mm) { if (mm && mm.isMeshStandardMaterial && carMats.indexOf(mm) < 0) { mm.userData.gkpE0 = mm.envMapIntensity; mm.userData.gkpE = mm.roughness < 0.6 ? Math.max(mm.userData.env != null ? mm.userData.env : mm.envMapIntensity, 0.85) : (mm.userData.env != null ? mm.userData.env : mm.envMapIntensity); carMats.push(mm); } }); } });
            carsG.add(car);
          });
          usedReal = true;
        }
      } catch (err) { usedReal = false; while (carsG.children.length) carsG.remove(carsG.children[0]); carMats.length = 0; if (window.console) console.warn('GKParking: GKCars.make не сработал, ставлю свои машины', err); }
    }
    var fb = parked.filter(function (c) { return !usedReal || c.fb; });
    if (fb.length) fallbackCars(fb, carsG);

    /* --- колесоотбойники, двери, рамы --- */
    root.add(bT.mesh(mTrim));

    /* --- «Ваше место»: мягкое свечение --- */
    yourGlow = new T.Mesh(new T.PlaneGeometry(YOUR.w + 1.2, 6.6), mGlowAdd(new T.Color(1.0, 0.62, 0.34), 0.34, softT)); yourGlow.rotation.x = -PI / 2; yourGlow.position.set(YOUR.x, FY + 0.012, YOUR.z); yourGlow.renderOrder = 3; root.add(yourGlow);

    /* --- метки-переходы --- */
    SPOTS.forEach(function (s, j) {
      var ring = new T.Mesh(new T.PlaneGeometry(2.1, 2.1), new T.MeshBasicMaterial({ map: ringT, transparent: true, depthWrite: false, toneMapped: false, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -4 }));
      ring.rotation.x = -PI / 2; ring.position.set(s.rx, FY + 0.016, s.rz); ring.renderOrder = 5; ring.userData.hot = j; root.add(ring);
      var lab = new T.Sprite(new T.SpriteMaterial({ map: labelT(s.name, s.id === 'place'), transparent: true, depthWrite: false, sizeAttenuation: false, toneMapped: false, fog: false }));
      lab.position.set(s.rx, FY + 1.05, s.rz); lab.center.set(0.5, 0); lab.renderOrder = 6; lab.userData.hot = j; root.add(lab);
      hot.push({ s: s, ring: ring, label: lab }); pickList.push(ring, lab);
    });

    /* --- свет: только свой --- */
    hemiL = new T.HemisphereLight(0xe2e8f0, 0x6a655d, 0.6); root.add(hemiL);
    followL = new T.PointLight(0xf2f5ff, 0.95, 30, 1.5); followL.position.set(START.ex, CY - 0.55, START.ez); root.add(followL);
    var p1 = new T.PointLight(0xeef2ff, 0.7, 40, 1.5); p1.position.set(-3, CY - 0.6, -15); root.add(p1);
    var p2 = new T.PointLight(0xeef2ff, 0.7, 40, 1.5); p2.position.set(15.5, CY - 0.6, -15); root.add(p2);
    var pl = new T.PointLight(0xffc48c, 1.35, 15, 1.4); pl.position.set(3.4, FY + 2.2, 13.6); root.add(pl);
    rampL = new T.PointLight(0xd6e6ff, 1.9, 30, 1.3); rampL.position.set(28.35, -0.6, -25.5); root.add(rampL);

    /* --- окружение для отражений (тёмный зал со светящимися линиями) --- */
    try {
      var es = new T.Scene(), eb = function (w, h, d, x, y, z, col, back) { var o = new T.Mesh(new T.BoxGeometry(w, h, d), new T.MeshBasicMaterial({ color: col, side: back ? T.BackSide : T.FrontSide })); o.position.set(x, y, z); es.add(o); };
      eb(60, 9, 60, 0, 1.4, 0, new T.Color(0.09, 0.09, 0.1), true); eb(60, 0.1, 60, 0, -1.7, 0, new T.Color(0.22, 0.225, 0.235)); eb(60, 0.1, 60, 0, 1.9, 0, new T.Color(0.035, 0.036, 0.04));
      for (i = -3; i <= 3; i++) { eb(11, 0.05, 0.3, -7, 1.6, i * 5.5, new T.Color(15, 15.5, 16.5)); eb(11, 0.05, 0.3, 7, 1.6, i * 5.5, new T.Color(15, 15.5, 16.5)); }
      eb(0.2, 2.2, 6, -24, -0.2, 6, new T.Color(4, 2.8, 1.6));
      var pm = new T.PMREMGenerator(renderer); envTex = pm.fromScene(es, 0.02).texture; pm.dispose();
    } catch (err2) { envTex = scene.environment; }
    bgScheme = tex(512, 512, function (g, w, h) { var gr = g.createRadialGradient(w / 2, h * 0.46, 30, w / 2, h / 2, w * 0.74); gr.addColorStop(0, '#2a2e38'); gr.addColorStop(0.55, '#171a21'); gr.addColorStop(1, '#090a0d'); g.fillStyle = gr; g.fillRect(0, 0, w, h); });

    buildScheme(labelT);
    skySync();
  }

  /* ---------- свои машины (если модуль cars ещё не готов): 3 вызова отрисовки на все ---------- */
  function fallbackCars(list, parent) {
    var body = new Batch(), glassB = new Batch(), trim = new Batch(), sh, g, i;
    var P = [[-2.18, 0.3], [-2.27, 0.6], [-2.2, 0.95], [-1.5, 1.03], [1.0, 1.0], [1.92, 0.86], [2.25, 0.63], [2.2, 0.3]];
    sh = new T.Shape(); sh.moveTo(-P[0][0], P[0][1]); for (i = 1; i < P.length; i++) sh.lineTo(-P[i][0], P[i][1]); sh.closePath();
    g = new T.ExtrudeGeometry(sh, { depth: 1.62, bevelEnabled: true, bevelThickness: 0.09, bevelSize: 0.06, bevelSegments: 3, steps: 1 }); g.rotateY(PI / 2); g.translate(-0.81, 0, 0); body.add(g);
    body.box(-0.72, 0.72, 1.44, 1.478, -1.1, 0.34); body.box(-0.765, 0.765, 1.0, 1.45, -0.3, -0.2);
    var Q = [[-1.62, 1.0], [-1.05, 1.44], [0.3, 1.45], [1.02, 1.0]];
    sh = new T.Shape(); sh.moveTo(-Q[0][0], Q[0][1]); for (i = 1; i < Q.length; i++) sh.lineTo(-Q[i][0], Q[i][1]); sh.closePath();
    g = new T.ExtrudeGeometry(sh, { depth: 1.5, bevelEnabled: false, steps: 1 }); g.rotateY(PI / 2); g.translate(-0.75, 0, 0); glassB.add(g);
    trim.box(-0.87, 0.87, 0.17, 0.34, -2.12, 2.12, [0.03, 0.03, 0.035]);
    [-0.8, 0.8].forEach(function (x) { [-1.42, 1.42].forEach(function (z) {
      var w = new T.CylinderGeometry(0.34, 0.34, 0.24, 20); w.rotateZ(PI / 2); w.translate(x, 0.34, z); trim.add(w, null, [0.025, 0.025, 0.028]);
      var hgeo = new T.CylinderGeometry(0.21, 0.21, 0.25, 14); hgeo.rotateZ(PI / 2); hgeo.translate(x, 0.34, z); trim.add(hgeo, null, [0.5, 0.51, 0.53]); }); });
    trim.box(-0.26, 0.26, 0.42, 0.54, 2.25, 2.275, [0.85, 0.85, 0.83]); trim.box(-0.26, 0.26, 0.5, 0.62, -2.29, -2.265, [0.85, 0.85, 0.83]);
    [-0.6, 0.6].forEach(function (x) { trim.box(x - 0.2, x + 0.2, 0.7, 0.82, 2.17, 2.215, [0.9, 0.93, 0.97]); trim.box(x - 0.2, x + 0.2, 0.8, 0.93, -2.26, -2.215, [0.5, 0.02, 0.02]); });
    var mBody = new T.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.5, roughness: 0.36, clearcoat: 1, clearcoatRoughness: 0.07, envMapIntensity: 1.1 });
    var mGl = new T.MeshStandardMaterial({ color: 0x0b0e12, roughness: 0.05, metalness: 0.9, envMapIntensity: 1.3 });
    var mTr = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, metalness: 0.4, envMapIntensity: 0.6 });
    var n = list.length, ib = new T.InstancedMesh(body.geo(), mBody, n), ig = new T.InstancedMesh(glassB.geo(), mGl, n), it = new T.InstancedMesh(trim.geo(), mTr, n), c = new T.Color();
    list.forEach(function (car, j) { var m = mat4(car.x, FY, car.z, car.ry, 1, 0.96 + rnd() * 0.1, 0.96 + rnd() * 0.08); ib.setMatrixAt(j, m); ig.setMatrixAt(j, m); it.setMatrixAt(j, m); ib.setColorAt(j, c.setHex(car.col).convertSRGBToLinear()); });
    [ib, ig, it].forEach(function (im) { im.frustumCulled = false; im.instanceMatrix.needsUpdate = true; parent.add(im); });
    if (ib.instanceColor) ib.instanceColor.needsUpdate = true;
  }

  /* ---------- схема: полупрозрачный дом над паркингом и лифты ---------- */
  function buildScheme(labelT) {
    var D = ctx.dims || {}, H = D.H || 26.85, GH = D.GH || 4.8, FH = D.FH || 3.15, parts = (ctx.house && ctx.house.parts) || [], tw = (ctx.house && ctx.house.tower) || { x: -25.1, z: 23.75, r: 4.6 };
    var A = parts[0] || { x0: -28.1, x1: -13.3, z0: -26.75, z1: 26.75 }, B = parts[1] || { x0: -13.3, x1: 28.1, z0: 11.75, z1: 26.75 };
    var L = [[A.x0, A.z0], [A.x1, A.z0], [A.x1, B.z0], [B.x1, B.z0], [B.x1, B.z1], [A.x0, B.z1]], i, k, y;
    var sh = new T.Shape(); sh.moveTo(L[0][0], -L[0][1]); for (i = 1; i < L.length; i++) sh.lineTo(L[i][0], -L[i][1]); sh.closePath();
    var gg = new T.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false, steps: 1 }); gg.rotateX(-PI / 2);
    var gm = new T.MeshBasicMaterial({ color: 0x9fb2cc, transparent: true, opacity: 0.075, depthWrite: false, side: T.DoubleSide, fog: false });
    var ghost = new T.Mesh(gg, gm); ghost.renderOrder = 7; schemeG.add(ghost);
    var tower = new T.Mesh(new T.CylinderGeometry(tw.r, tw.r, H + 1.6, 40, 1, true), gm); tower.position.set(tw.x, (H + 1.6) / 2, tw.z); tower.renderOrder = 7; schemeG.add(tower);
    var main = [], dim = [], loop = function (arr, yy) { for (var j = 0; j < L.length; j++) { var a = L[j], b = L[(j + 1) % L.length]; arr.push(a[0], yy, a[1], b[0], yy, b[1]); } }, circle = function (arr, yy) { for (var j = 0; j < 48; j++) { var a0 = j / 48 * 6.2832, a1 = (j + 1) / 48 * 6.2832; arr.push(tw.x + Math.cos(a0) * tw.r, yy, tw.z + Math.sin(a0) * tw.r, tw.x + Math.cos(a1) * tw.r, yy, tw.z + Math.sin(a1) * tw.r); } };
    loop(main, 0.02); loop(main, H); L.forEach(function (p) { main.push(p[0], 0, p[1], p[0], H, p[1]); }); circle(main, H + 1.6); circle(main, 0.02);
    for (k = 0; k < 7; k++) { y = GH + k * FH; loop(dim, y); circle(dim, y); }
    // контур самого паркинга на отметке земли
    var F = [[-28.1, -26.75], [-13.3, -26.75], [-13.3, -35.75], [30.7, -35.75], [30.7, -6], [25.7, -6], [25.7, 11.75], [28.1, 11.75], [28.1, 26.75], [-28.1, 26.75]], foot = [];
    F.forEach(function (p, j) { var q = F[(j + 1) % F.length]; foot.push(p[0], -0.3, p[1], q[0], -0.3, q[1]); });
    var lm = function (col, op) { return new T.LineBasicMaterial({ color: col, transparent: true, opacity: op, fog: false, depthWrite: false }); };
    var ls = function (arr, mat) { var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(arr, 3)); var o = new T.LineSegments(g, mat); o.renderOrder = 8; schemeG.add(o); return o; };
    ls(main, lm(0xefe3cf, 0.6)); ls(dim, lm(0xefe3cf, 0.16)); ls(foot, lm(0xe2a878, 0.85));
    var fl = []; loop(fl, 0); floorFlash = ls(fl, lm(0xffc998, 0)); floorFlash.userData.GH = GH; floorFlash.userData.FH = FH;
    // лифтовые шахты
    var shM = new T.MeshBasicMaterial({ color: 0xe2a878, transparent: true, opacity: 0.2, depthWrite: false, blending: T.AdditiveBlending, fog: false, side: T.DoubleSide });
    var cabM = new T.MeshBasicMaterial({ color: new T.Color(2.2, 1.6, 1.0), fog: false }), glowM = new T.SpriteMaterial({ map: cabGlowTex(), color: 0xffc48a, transparent: true, opacity: 0.85, depthWrite: false, blending: T.AdditiveBlending, fog: false });
    [[2.1, 19.4, 0], [-17.1, -12.7, 0.37], [-16.5, 12.4, 0.71]].forEach(function (p, j) {
      var hh = H + 1.4 - FY, s = new T.Mesh(new T.BoxGeometry(2.3, hh, 2.3), shM); s.position.set(p[0], FY + hh / 2, p[1]); s.renderOrder = 9; schemeG.add(s);
      var e = new T.LineSegments(new T.EdgesGeometry(s.geometry), lm(0xffd3a6, 0.75)); e.position.copy(s.position); e.renderOrder = 9; schemeG.add(e);
      var cab = new T.Mesh(new T.BoxGeometry(1.9, 2.4, 1.9), cabM); cab.position.set(p[0], FY + 1.3, p[1]); schemeG.add(cab);
      var gl = new T.Sprite(glowM); gl.scale.set(11, 11, 1); gl.renderOrder = 10; cab.add(gl);
      shafts.push({ cab: cab, ph: p[2], i: j, GH: GH, FH: FH });
    });
    // подписи помещений на «срезе»
    var names = ['АУПТ', 'РЕЗЕРВУАРЫ', 'ЛИФТОВОЙ ХОЛЛ', 'КЛАДОВЫЕ'], rt = tex(1024, 512, function (g) { g.fillStyle = 'rgba(239,231,218,.8)'; g.font = '500 62px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'middle'; names.forEach(function (n, j) { g.fillText(n.split('').join(' '), 512, j * 128 + 66); }); });
    var bRm = new Batch(), row = function (j) { return [0, 1 - (j + 1) / 4, 1, 1 - j / 4]; };
    fq(bRm, -23.85, -13.0, 7.6, 0.95, PI, [1, 1, 1], row(0), CY + 0.03); fq(bRm, -23.85, 1.5, 7.6, 0.95, PI, [1, 1, 1], row(1), CY + 0.03); fq(bRm, 6.0, 20.6, 9.6, 1.2, PI, [1, 1, 1], row(2), CY + 0.03); fq(bRm, 18.5, 24.2, 8.0, 1.0, PI, [1, 1, 1], row(3), CY + 0.03);
    var rm = bRm.mesh(new T.MeshBasicMaterial({ map: rt, transparent: true, depthWrite: false, toneMapped: false, fog: false })); rm.renderOrder = 6; schemeG.add(rm);
    var tag = new T.Sprite(new T.SpriteMaterial({ map: labelT('Лифт: паркинг → ваш этаж', true), transparent: true, depthWrite: false, depthTest: false, sizeAttenuation: false, toneMapped: false, fog: false }));
    tag.position.set(2.1, H + 4.2, 19.4); tag.scale.set(0.2, 0.05, 1); tag.renderOrder = 12; schemeG.add(tag);
  }
  function cabGlowTex() { return tex(128, 128, function (g) { var gr = g.createRadialGradient(64, 64, 0, 64, 64, 64); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.3, 'rgba(255,255,255,.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }); }

  /* ---------- взгляд, камера ---------- */
  function dirOf(yaw, pit, out) { return out.set(Math.sin(yaw) * Math.cos(pit), Math.sin(pit), Math.cos(yaw) * Math.cos(pit)); }
  function place(ex, ez, yaw, pit) { camera.position.set(ex, FY + EYE, ez); controls.target.copy(camera.position).addScaledVector(dirOf(yaw, pit, v2), RAD); }
  function curLook() { v2.copy(controls.target).sub(camera.position).normalize(); return { yaw: Math.atan2(v2.x, v2.z), pit: Math.asin(Math.max(-1, Math.min(1, v2.y))) }; }
  function clearPath(x0, z0, x1, z1) {
    var n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.4), i, j, x, z, o;
    for (i = 1; i < n; i++) { x = x0 + (x1 - x0) * i / n; z = z0 + (z1 - z0) * i / n; for (j = 0; j < obstacles.length; j++) { o = obstacles[j]; if (x > o[0] - 0.3 && x < o[1] + 0.3 && z > o[2] - 0.3 && z < o[3] + 0.3) return false; } }
    return true;
  }
  function skySync() {
    if (!skyMat) return; var c = ctx.cur || {}, night = c.lamp || 0;
    if (c.hor && c.top) skyMat.color.copy(c.hor).lerp(c.top, 0.35).convertSRGBToLinear();
    if (rampL) { rampL.intensity = 1.9 * (1 - night * 0.86); rampGlow.material.opacity = 0.5 * (1 - night * 0.9); }
  }
  function hideOutdoor() {
    var ch = scene.children, i, o;
    for (i = 0; i < ch.length; i++) { o = ch[i]; if (o !== root && o.visible) { o.visible = false; if (st.hidden.indexOf(o) < 0) st.hidden.push(o); } }
  }
  function applyLook() {                                   // всё, что режимы сцены могут перезаписать, — возвращаем к «подземному» виду
    if (!st.taken) return;
    var inside = st.cur === 'inside', f = scene.fog, i;
    hideOutdoor();
    if (f && f.color) { f.color.setHex(inside ? 0x0a0b0e : 0x0d0f13); if ('near' in f) { f.near = inside ? 30 : 500; f.far = inside ? 150 : 4000; } }
    scene.background = inside ? bgInside : bgScheme; scene.environment = envTex;
    renderer.toneMappingExposure = inside ? 1.16 : 1.1;
    for (i = 0; i < carMats.length; i++) carMats[i].envMapIntensity = carMats[i].userData.gkpE;
    hemiL.intensity = inside ? 0.6 : 0.95;
    skySync();
  }
  function applyView() {
    var inside = st.view === 'inside', i, sz = ctx.size ? ctx.size() : { w: 4, h: 3 }, asp = sz.w / Math.max(1, sz.h), p;
    st.cur = st.view; st.fly = null; if (ctx.stopFly) ctx.stopFly();
    ceilG.visible = inside; mirrorG.visible = inside; schemeG.visible = !inside;
    camera.fov = inside ? 58 : 30; camera.near = inside ? 0.08 : 2; camera.far = inside ? 500 : 3000; camera.updateProjectionMatrix();
    if (inside) {
      ctx.limits({ minDistance: RAD, maxDistance: RAD, minPolarAngle: PI / 2 - 0.5, maxPolarAngle: PI / 2 + 0.6, enableZoom: false, enableRotate: true, rotateSpeed: -0.24 });
      p = st.pose || START; place(p.ex, p.ez, p.yaw, p.pit); st.poseDirty = false;
    } else {
      ctx.limits({ minDistance: 80, maxDistance: 300, minPolarAngle: 0.3, maxPolarAngle: 1.3, enableZoom: true, enableRotate: true, rotateSpeed: 0.55 });
      controls.target.set(1.5, 5.5, -3.5);
      camera.position.copy(controls.target).add(v1.setFromSpherical(new T.Spherical(asp >= 1.25 ? 168 : Math.min(300, 168 * Math.pow(1.25 / asp, 0.85)), 0.97, 2.52)));
      followL.position.set(6, CY + 6, -8);
    }
    for (i = 0; i < hot.length; i++) { hot[i].label.scale.set(inside ? 0.3 : 0.148, inside ? 0.075 : 0.037, 1); hot[i].label.position.y = inside ? FY + 1.02 : FY + 2.2; hot[i].label.material.depthTest = inside; }
    controls.update(); applyLook(); hudSync();
  }
  function take() {
    if (!built) build();
    var f = scene.fog;
    st.saved = { bg: scene.background, env: scene.environment, exp: renderer.toneMappingExposure, fov: camera.fov, near: camera.near, far: camera.far,
      fogC: f && f.color ? f.color.clone() : null, fogN: f ? f.near : 0, fogF: f ? f.far : 0 };
    st.taken = true; st.hidden.length = 0; root.visible = true;
    (ctx.zones || []).forEach(function (z) { if (z.group) z.group.position.y = -1e5; });
  }
  function release() {
    var s = st.saved, f = scene.fog, i, m;
    st.taken = false; st.cur = null; st.fly = null; root.visible = false;
    st.hidden.forEach(function (o) { o.visible = true; }); st.hidden.length = 0;
    (ctx.zones || []).forEach(function (z) { if (z.group) z.group.position.y = 0; });
    scene.background = s.bg; scene.environment = s.env; renderer.toneMappingExposure = s.exp;
    if (f && s.fogC) { f.color.copy(s.fogC); if ('near' in f) { f.near = s.fogN; f.far = s.fogF; } }
    camera.fov = s.fov; camera.near = s.near; camera.far = s.far; camera.updateProjectionMatrix();
    for (i = 0; i < carMats.length; i++) { m = carMats[i]; m.envMapIntensity = m.userData.env != null && ctx.cur && ctx.cur.env != null ? m.userData.env * ctx.cur.env : m.userData.gkpE0; }
    ctx.limits(); ctx.home(true);
    try { if (GKScene.setMode && GKScene.mode) GKScene.setMode(GKScene.mode()); } catch (e) {}      // сцена сама вернёт небо, солнце, туман и экспозицию по текущему режиму
    ctx.shadows();
  }
  function uiOn() { if (st.uiOn) return; st.uiOn = true; app.classList.add('view-parking'); ctx.picking(false); hud.classList.add('on'); hudSync(); emit('parking'); }
  function uiOff() { if (!st.uiOn) return; st.uiOn = false; app.classList.remove('view-parking'); ctx.picking(true); hud.classList.remove('on'); emit('home'); }
  function sync() {
    if (st.active) {
      if (!st.taken) take();
      if (st.cur !== st.view) applyView();
      else if (st.poseDirty && st.cur === 'inside') { st.fly = null; place(st.pose.ex, st.pose.ez, st.pose.yaw, st.pose.pit); st.poseDirty = false; controls.update(); }
    } else { if (st.taken) release(); uiOff(); }
    ctx.dirty();
  }
  function transition(fn) {
    var my = ++st.tok; fade.classList.add('on');
    setTimeout(function () {
      if (my !== st.tok) return;
      try { fn(); } catch (e) { if (window.console) console.error('GKParking:', e); }
      ctx.dirty();
      setTimeout(function () { if (my === st.tok) fade.classList.remove('on'); ctx.dirty(); }, 140);
    }, 340);
  }

  /* ---------- внешние команды ---------- */
  function enter() { if (st.active) return; st.active = true; st.view = 'inside'; st.pose = START; uiOn(); transition(sync); }
  function exit() { if (!st.active) return; st.active = false; transition(sync); }
  function setView(v) { if (v !== 'inside' && v !== 'scheme') return; if (!st.active) { enter(); } if (st.view === v && st.cur === v) return; st.view = v; if (v === 'inside' && !st.pose) st.pose = START; hudSync(); transition(sync); }
  function goTo(i) {
    if (typeof i === 'string') { for (var k = 0; k < SPOTS.length; k++) if (SPOTS[k].id === i) { i = k; break; } }
    var s = SPOTS[i]; if (!s || !st.active) return;
    st.pose = s; hintEl.classList.add('off');
    if (st.cur !== 'inside' || st.view !== 'inside') { st.view = 'inside'; st.poseDirty = true; hudSync(); transition(sync); return; }
    var cx = camera.position.x, cz = camera.position.z, d = Math.hypot(s.ex - cx, s.ez - cz), l = curLook(), dy;
    if (d > 0.3 && !clearPath(cx, cz, s.ex, s.ez)) { st.poseDirty = true; transition(sync); return; }      // на пути машины или стена — мягкая склейка через затемнение
    dy = s.yaw - l.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    st.fly = { e0: camera.position.clone(), e1: new T.Vector3(s.ex, FY + EYE, s.ez), t: 0, dur: Math.max(1.2, Math.min(3.0, d / 7)), y0: l.yaw, dy: dy, p0: l.pit, p1: s.pit, user: false };
    ctx.dirty();
  }

  /* ---------- кадр ---------- */
  ctx.onFrame(function (dt, tMs) {
    if (!st.taken) return false;
    controls.autoRotate = false;
    var inside = st.cur === 'inside', t = tMs / 1000, i, h, d, f, e, k;
    if (inside) {
      if (st.fly) {
        f = st.fly; f.t = Math.min(1, f.t + dt / f.dur); e = f.t < 0.5 ? 4 * f.t * f.t * f.t : 1 - Math.pow(-2 * f.t + 2, 3) / 2;
        v1.lerpVectors(f.e0, f.e1, e);
        if (f.user) { v2.copy(controls.target).sub(camera.position); camera.position.copy(v1); controls.target.copy(v1).add(v2); }
        else { camera.position.copy(v1); controls.target.copy(v1).addScaledVector(dirOf(f.y0 + f.dy * e, f.p0 + (f.p1 - f.p0) * e, v2), RAD); }
        if (f.t >= 1) st.fly = null;
      }
      followL.position.set(camera.position.x, CY - 0.55, camera.position.z);
    }
    for (i = 0; i < hot.length; i++) {
      h = hot[i]; d = Math.hypot(camera.position.x - h.s.rx, camera.position.z - h.s.rz); k = 1 + 0.08 * Math.sin(t * 2.1 + i * 1.3);
      h.ring.scale.set(inside ? k : k * 2.2, inside ? k : k * 2.2, 1); h.ring.material.opacity = inside ? (d < 1.6 ? 0 : Math.min(1, (d - 1.6) / 1.5)) * (0.78 + 0.22 * Math.sin(t * 2.1 + i * 1.3)) : 0.95;
      h.label.visible = !inside || d > 3.2;
    }
    if (yourGlow) yourGlow.material.opacity = 0.26 + 0.12 * Math.sin(t * 1.6);
    if (!inside) {
      for (i = 0; i < shafts.length; i++) {
        h = shafts[i]; var u = t * 0.085 + h.ph, cyc = Math.floor(u), w = u - cyc, pp = w < 0.08 ? 0 : w < 0.46 ? (w - 0.08) / 0.38 : w < 0.6 ? 1 : w < 0.94 ? 1 - (w - 0.6) / 0.34 : 0, flr = 2 + (cyc * 3 + h.i * 2) % 7;
        pp = pp * pp * (3 - 2 * pp); var yTop = h.GH + (flr - 2) * h.FH + 1.35;
        h.cab.position.y = FY + 1.3 + (yTop - FY - 1.3) * pp;
        if (i === 0 && floorFlash) { floorFlash.position.y = h.GH + (flr - 2) * h.FH + 0.05; floorFlash.material.opacity = Math.max(0, (pp - 0.9) / 0.1) * 0.95; }
      }
    }
    return true;
  });
  ctx.onMode(function () { if (st.taken) applyLook(); });

  /* ---------- нажатие на метку ---------- */
  var dn = null;
  ctx.canvas.addEventListener('pointerdown', function (e) { if (!st.taken) return; dn = { x: e.clientX, y: e.clientY, t: performance.now() }; if (st.fly) st.fly.user = true; });
  ctx.canvas.addEventListener('pointerup', function (e) {
    if (!st.taken || !dn) return;
    var d = Math.hypot(e.clientX - dn.x, e.clientY - dn.y), tt = performance.now() - dn.t; dn = null;
    if (d > 9 || tt > 600) { hintEl.classList.add('off'); return; }
    var r = ctx.canvas.getBoundingClientRect(); ndc.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera); root.updateMatrixWorld();
    var hits = ray.intersectObjects(pickList, false).filter(function (hh) { return hh.object.visible; });
    if (!hits.length) return;
    if (st.cur === 'inside') { var occ = ray.intersectObjects([wallMesh, colMesh], false); if (occ.length && occ[0].distance < hits[0].distance - 0.6) return; }
    goTo(hits[0].object.userData.hot);
  });

  window.GKParking = {
    enter: enter, exit: exit, active: function () { return st.active; }, setView: setView, view: function () { return st.view; },
    goTo: goTo, spots: function () { return SPOTS.map(function (s) { return { id: s.id, name: s.name }; }); }
  };
})();
