/* Макет квартиры 45,64 м²: после видео «чертёж оживает» — белая 3D-модель (по утверждённой планировке),
   строитель заходит, по комнатам расставляет мебель, комментирует, потом свободно гуляет.
   Размеры — по планировке (зал 19,25, кухня 13,66, прихожая 4,44, санузел 4,80, балкон 3,49). */
(function () {
  'use strict';
  var T = window.THREE;
  var stageEl = document.getElementById('stage'), sayEl = document.getElementById('say'), stepEl = document.getElementById('hudStep');
  var intro = document.getElementById('intro'), tap = document.getElementById('tap');

  // ---------- сцена ----------
  var renderer = new T.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding; renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
  stageEl.appendChild(renderer.domElement);
  var scene = new T.Scene(); scene.background = new T.Color(0xe9e4dc);
  var CX = 3.66, CZ = 3.8;
  var cam = new T.PerspectiveCamera(38, 1, 0.1, 200);
  cam.position.set(CX - 2.6, 10.5, CZ + 9.6);
  var ctl = new T.OrbitControls(cam, renderer.domElement);
  ctl.target.set(CX, 0.6, CZ); ctl.enableDamping = true; ctl.minDistance = 7; ctl.maxDistance = 26;
  ctl.minPolarAngle = 0.25; ctl.maxPolarAngle = 1.2; ctl.enablePan = false; ctl.autoRotateSpeed = 0.6;
  scene.add(new T.HemisphereLight(0xfff3e2, 0x6f675c, 0.42));
  var sun = new T.DirectionalLight(0xffdcb0, 1.15); sun.position.set(-6, 14, 9); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); var sc = sun.shadow.camera; sc.left = -9; sc.right = 9; sc.top = 9; sc.bottom = -9; sun.target.position.set(CX, 0, CZ);
  scene.add(sun); scene.add(sun.target);

  function mat(c, r) { return new T.MeshStandardMaterial({ color: c, roughness: r === undefined ? 0.85 : r, metalness: 0 }); }
  var M = { wall: mat(0xfbf9f5), floor: mat(0xcdbfa9), glass: new T.MeshStandardMaterial({ color: 0xbfd8e6, transparent: true, opacity: 0.35, roughness: 0.1 }),
    paper: mat(0xf2efe9) };
  function box(w, h, d, m, x, y, z) { var b = new T.Mesh(new T.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; b.receiveShadow = true; return b; }

  // подложка-бумага и пол
  var paper = new T.Mesh(new T.PlaneGeometry(40, 40), M.paper); paper.rotation.x = -Math.PI / 2; paper.position.set(CX, -0.02, CZ); paper.receiveShadow = true; scene.add(paper);
  var floor = box(7.02, 0.04, 7.17, M.floor, 3.66, 0, 3.815); floor.castShadow = false; scene.add(floor);

  // ---------- стены по планировке (метры: x — вправо, z — вниз по чертежу) ----------
  var H = 1.35, home = new T.Group(); scene.add(home);
  function wall(x1, z1, x2, z2, th, gaps) {     // gaps: [{a, b, type:'door'|'win'|'glass'}] в метрах вдоль стены
    var len = Math.hypot(x2 - x1, z2 - z1), ang = Math.atan2(z2 - z1, x2 - x1), ux = (x2 - x1) / len, uz = (z2 - z1) / len;
    var g = (gaps || []).slice().sort(function (p, q) { return p.a - q.a; }), cur = 0;
    function seg(a, b, y0, y1, m) {
      if (b - a < 0.01) return; var mx = x1 + ux * (a + b) / 2, mz = z1 + uz * (a + b) / 2;
      var s = box(b - a, y1 - y0, th, m, mx, (y0 + y1) / 2, mz); s.rotation.y = -ang; home.add(s);
    }
    g.forEach(function (p) {
      seg(cur, p.a, 0, H, M.wall);
      if (p.type === 'win') { seg(p.a, p.b, 0, 0.6, M.wall); seg(p.a, p.b, 0.6, H, M.glass); }
      if (p.type === 'glass') { seg(p.a, p.b, 0, 0.7, M.wall); seg(p.a, p.b, 0.7, H, M.glass); }
      cur = p.b;
    });
    seg(cur, len, 0, H, M.wall);
  }
  var XL = 0.15, XM = 3.59, XB = 5.13, XR = 7.17, ZT = 0.23, ZH = 3.02, ZB = 5.89, ZE = 7.4;
  wall(XL, ZT, XR, ZT, 0.25, [{ a: 3.8, b: 4.6, type: 'door' }]);                            // верх: входная дверь в прихожую
  wall(XL, ZT, XL, ZE, 0.25, [{ a: 2.0, b: 3.6, type: 'win' }]);                             // лево: окно зала
  wall(XR, ZT, XR, ZE, 0.25, [{ a: 4.4, b: 5.9, type: 'win' }]);                             // право: окно кухни
  wall(XL, ZE, XR, ZE, 0.25, [{ a: 0.1, b: 3.35, type: 'glass' }, { a: 4.5, b: 6.1, type: 'win' }]);   // низ: остекление балкона, окно кухни
  wall(XM, ZT, XM, ZE, 0.15, [{ a: 1.07, b: 1.87, type: 'door' }]);                          // зал | прихожая-кухня
  wall(XB, ZT, XB, ZH, 0.15, [{ a: 0.47, b: 1.27, type: 'door' }]);                          // прихожая | санузел
  wall(XM, ZH, XR, ZH, 0.15, [{ a: 0.78, b: 1.42, type: 'door' }]);                          // прихожая | кухня, санузел | кухня
  wall(XL, ZB, XM, ZB, 0.15, [{ a: 0.95, b: 1.75, type: 'door' }]);                          // зал | балкон

  // ---------- мебель (появляется по ходу) ----------
  var C = { wood: mat(0xb98a5e, 0.7), dark: mat(0x5c4a3d, 0.7), fab: mat(0xc9b8a4), fab2: mat(0x8fa3ad), white: mat(0xf5f5f2, 0.4), steel: mat(0xd9dcdf, 0.35),
    rug: mat(0xb7a48f), green: mat(0x6f8f5a), black: mat(0x222222, 0.4), bed: mat(0xece6dc) };
  function item(parts) { var g = new T.Group(); parts.forEach(function (p) { g.add(p); }); g.visible = false; scene.add(g); return g; }
  var F = {
    wardrobe: item([box(0.6, 2.1, 1.0, C.wood, 3.97, 1.05, 2.4)]),
    fridge: item([box(0.65, 1.9, 0.65, C.steel, 6.8, 0.95, 3.5)]),
    kitchen: item([box(0.6, 0.88, 2.4, C.white, 6.82, 0.44, 5.05), box(0.62, 0.04, 2.4, C.dark, 6.81, 0.9, 5.05), box(0.35, 0.7, 2.4, C.white, 6.95, 1.85, 5.05)]),
    table: item([box(1.2, 0.05, 0.8, C.wood, 4.9, 0.75, 5.7), box(0.06, 0.73, 0.06, C.dark, 4.35, 0.37, 5.35), box(0.06, 0.73, 0.06, C.dark, 5.45, 0.37, 5.35), box(0.06, 0.73, 0.06, C.dark, 4.35, 0.37, 6.05), box(0.06, 0.73, 0.06, C.dark, 5.45, 0.37, 6.05),
      box(0.42, 0.45, 0.42, C.fab2, 4.6, 0.23, 5.0), box(0.42, 0.45, 0.42, C.fab2, 5.2, 0.23, 5.0), box(0.42, 0.45, 0.42, C.fab2, 4.6, 0.23, 6.4), box(0.42, 0.45, 0.42, C.fab2, 5.2, 0.23, 6.4)]),
    bed: item([box(1.6, 0.45, 2.0, C.bed, 1.35, 0.23, 1.4), box(1.6, 0.9, 0.1, C.wood, 1.35, 0.45, 0.42), box(0.5, 0.12, 0.35, C.white, 0.95, 0.52, 0.7), box(0.5, 0.12, 0.35, C.white, 1.75, 0.52, 0.7)]),
    sofa: item([box(0.9, 0.42, 2.1, C.fab, 3.05, 0.21, 4.2), box(0.25, 0.8, 2.1, C.fab, 3.37, 0.4, 4.2), box(0.9, 0.6, 0.2, C.fab, 3.05, 0.3, 3.2), box(0.9, 0.6, 0.2, C.fab, 3.05, 0.3, 5.2)]),
    tv: item([box(0.45, 0.5, 1.6, C.dark, 0.5, 0.25, 4.2), box(0.06, 0.75, 1.3, C.black, 0.42, 1.0, 4.2)]),
    rug: item([box(1.8, 0.02, 2.2, C.rug, 1.45, 0.02, 4.2), box(0.9, 0.4, 0.55, C.wood, 1.4, 0.2, 4.2)]),
    plant: item([box(0.35, 0.35, 0.35, C.dark, 0.5, 0.18, 5.5), new T.Mesh(new T.SphereGeometry(0.35, 12, 10), C.green)]),
    bath: item([box(1.6, 0.55, 0.72, C.white, 6.3, 0.28, 2.55), box(0.55, 0.8, 0.45, C.white, 6.92, 0.4, 1.35), box(0.4, 0.45, 0.6, C.white, 6.9, 0.23, 0.6), box(0.6, 0.85, 0.6, C.steel, 5.55, 0.43, 0.6)]),
    balcony: item([box(0.6, 0.04, 0.6, C.wood, 2.4, 0.6, 6.6), box(0.05, 0.6, 0.05, C.dark, 2.4, 0.3, 6.6), box(0.45, 0.45, 0.45, C.fab2, 1.85, 0.23, 6.6), box(0.45, 0.45, 0.45, C.fab2, 2.95, 0.23, 6.6)])
  };
  F.plant.children[1].position.set(0.5, 0.65, 5.5); F.plant.children[1].castShadow = true;

  var drops = [];
  function place(name) { var g = F[name]; g.visible = true; g.position.y = 3; g.scale.set(0.8, 0.8, 0.8); drops.push({ g: g, t0: performance.now() }); }
  function updDrops(now) {
    drops = drops.filter(function (d) {
      var k = Math.min(1, (now - d.t0) / 650), e = 1 - Math.pow(1 - k, 3), bounce = k < 1 ? Math.sin(k * Math.PI) * 0.08 * (1 - k) : 0;
      d.g.position.y = 3 * (1 - e) + bounce; var s = 0.8 + 0.2 * e; d.g.scale.set(s, s, s); return k < 1;
    });
  }

  // ---------- строитель ----------
  var man = new T.Group(), legL = new T.Group(), legR = new T.Group(), armL = new T.Group(), armR = new T.Group();
  var skin = mat(0xf1d3b3), vest = mat(0xf07832), jeans = mat(0x3b4a66), hat = mat(0xffb000, 0.5);
  function limb(g, m, len, w, x, y) { var b = box(w, len, w, m, 0, -len / 2, 0); g.add(b); g.position.set(x, y, 0); man.add(g); }
  limb(legL, jeans, 0.82, 0.16, -0.11, 0.84); limb(legR, jeans, 0.82, 0.16, 0.11, 0.84);
  man.add(box(0.46, 0.62, 0.28, vest, 0, 1.15, 0));
  limb(armL, vest, 0.6, 0.12, -0.31, 1.42); limb(armR, vest, 0.6, 0.12, 0.31, 1.42);
  var head = new T.Mesh(new T.SphereGeometry(0.17, 16, 12), skin); head.position.y = 1.62; head.castShadow = true; man.add(head);
  var helm = new T.Mesh(new T.SphereGeometry(0.19, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), hat); helm.position.y = 1.66; man.add(helm);
  var brim = box(0.42, 0.03, 0.42, hat, 0, 1.66, 0.03); man.add(brim);
  man.position.set(4.2, 0, -1.2); scene.add(man);

  // комнаты: центр и «дверь к родителю» (маршруты идут через прихожую)
  var R = {
    out: { c: [4.2, -1.2], door: [4.2, 0.23], up: 'hall' },
    hall: { c: [4.4, 1.7] },
    kitchen: { c: [5.4, 4.6], door: [4.69, 3.02], up: 'hall' },
    zal: { c: [2.4, 3.0], door: [3.59, 1.7], up: 'hall' },
    balcony: { c: [1.0, 6.9], door: [1.5, 5.89], up: 'zal' },
    bath: { c: [6.0, 1.6], door: [5.13, 1.1], up: 'hall' }
  };
  function chain(r) { var a = [r]; while (R[a[a.length - 1]].up) a.push(R[a[a.length - 1]].up); return a; }
  function route(from, to) {
    var A = chain(from), B = chain(to), common = A.filter(function (x) { return B.indexOf(x) >= 0; })[0], pts = [];
    for (var i = 0; A[i] !== common; i++) pts.push(R[A[i]].door);
    if (from === common) {} else pts.push(R[common].c);
    var down = []; for (var j = 0; B[j] !== common; j++) down.unshift(B[j]);
    down.forEach(function (r) { pts.push(R[r].door); pts.push(R[r].c); });
    if (to === common) pts.push(R[to].c);
    return pts;
  }
  var where = 'out', path = [], walking = false, onArrive = null, walkT = 0;
  function goTo(room, offs, cb) {
    path = route(where, room).map(function (p) { return p.slice(); });
    if (offs) { var l = path[path.length - 1]; l[0] += offs[0]; l[1] += offs[1]; }
    where = room; walking = true; onArrive = cb || null;
  }
  function updMan(dt) {
    if (walking && path.length) {
      var p = path[0], dx = p[0] - man.position.x, dz = p[1] - man.position.z, d = Math.hypot(dx, dz), sp = 1.25 * dt;
      man.rotation.y = Math.atan2(dx, dz);
      if (d <= sp) { man.position.x = p[0]; man.position.z = p[1]; path.shift(); }
      else { man.position.x += dx / d * sp; man.position.z += dz / d * sp; }
      walkT += dt * 9;
      if (!path.length) { walking = false; var cb = onArrive; onArrive = null; if (cb) cb(); }
    }
    var sw = walking ? Math.sin(walkT) * 0.55 : 0;
    legL.rotation.x = sw; legR.rotation.x = -sw; armL.rotation.x = -sw * 0.8; armR.rotation.x = placing > 0 ? -1.6 : sw * 0.8;
    man.position.y = walking ? Math.abs(Math.sin(walkT)) * 0.04 : 0;
  }
  var placing = 0;

  // ---------- реплики ----------
  var sayT = 0;
  function say(t, ms) { sayEl.textContent = t; sayEl.classList.add('on'); clearTimeout(sayT); sayT = setTimeout(function () { sayEl.classList.remove('on'); }, ms || 2600); }
  var v3 = new T.Vector3();
  function updSay() {
    v3.set(man.position.x, 2.05, man.position.z).project(cam);
    var w = stageEl.clientWidth, h = stageEl.clientHeight;
    sayEl.style.left = Math.max(170, Math.min(w - 170, (v3.x * 0.5 + 0.5) * w)) + 'px';
    sayEl.style.top = Math.max(120, (-v3.y * 0.5 + 0.5) * h) + 'px';
  }

  // ---------- сценарий ----------
  var STORY = [
    ['hall', null, 'Привет! Давайте обставим квартиру 👋', null],
    ['hall', [-0.1, 0.1], 'Шкаф в прихожую — места хватает 👌', 'wardrobe'],
    ['kitchen', [0.6, -0.8], 'Холодильник — сюда, у входа на кухню', 'fridge'],
    ['kitchen', [0.5, 0.3], 'Кухня вдоль стены — 13,66 м² простора', 'kitchen'],
    ['kitchen', [0.6, 1.0], 'И стол на четверых 🍽', 'table'],
    ['zal', [-0.3, -0.5], 'Кровать — в тихий угол зала', 'bed'],
    ['zal', [-0.2, 1.1], 'Диван — для вечеров всей семьёй', 'sofa'],
    ['zal', [-0.2, 1.6], 'Телевизор напротив дивана 📺', 'tv'],
    ['zal', [-0.3, 1.1], 'Ковёр и столик — уютно 🙂', 'rug'],
    ['zal', [-1.2, 2.3], 'И зелени немного 🌿', 'plant'],
    ['bath', [0.2, 0.3], 'Ванна, раковина и стиральная машина — всё помещается', 'bath'],
    ['balcony', [0, -0.2], 'Столик на балкон…', 'balcony'],
    ['balcony', [0.4, 0.1], 'А с балкона — вид на город 🌇', null]
  ];
  var FINAL = 'Готово! Так может выглядеть ваша квартира. Сдаётся без отделки — обставите по-своему 😉';
  var FREE = ['Зал 19,25 м² — светло весь день ☀️', 'Тут уютно 🙂', 'Кухня 13,66 м² — готовить одно удовольствие 🍳', 'Окна большие — много света', 'С балкона — вечерний город 🌇', 'Здесь будет ваш дом 🏡'];
  var run = 0, mode = 'idle', freeT = 0, fi = 0;
  function step(i, my) {
    if (my !== run) return;
    if (i >= STORY.length) { say(FINAL, 4200); stepEl.textContent = 'Готово — можно покрутить макет'; mode = 'free'; ctl.autoRotate = true; freeT = performance.now() + 4500; return; }
    var s = STORY[i];
    stepEl.textContent = 'Строитель обставляет квартиру · ' + (i + 1) + '/' + STORY.length;
    goTo(s[0], s[1], function () {
      if (my !== run) return;
      if (s[3]) { placing = 1; place(s[3]); setTimeout(function () { placing = 0; }, 500); }
      say(s[2], 2300);
      setTimeout(function () { step(i + 1, my); }, 2500);
    });
  }
  function reset() {
    run++; Object.keys(F).forEach(function (k) { F[k].visible = false; }); drops = [];
    man.position.set(4.2, 0, -1.2); where = 'out'; walking = false; path = []; mode = 'story'; ctl.autoRotate = false;
  }
  function startStory() { reset(); var my = run; setTimeout(function () { step(0, my); }, 600); }
  function freeMode() {
    run++; Object.keys(F).forEach(function (k) { if (!F[k].visible) { F[k].visible = true; F[k].position.y = 0; F[k].scale.set(1, 1, 1); } });
    mode = 'free'; freeT = 0; ctl.autoRotate = false; stepEl.textContent = 'Свободный осмотр';
  }
  document.getElementById('btnReplay').addEventListener('click', function () { playIntro(); });
  document.getElementById('btnFree').addEventListener('click', freeMode);

  // ---------- видео-вступление → 3D ----------
  function playIntro() {
    tap.classList.add('gone'); reset(); mode = 'intro'; intro.classList.remove('gone'); stepEl.textContent = 'Чертёж оживает…';
    intro.currentTime = 0; var p = intro.play(); if (p && p.catch) p.catch(function () { toModel(); });
  }
  function toModel() { intro.classList.add('gone'); stepEl.textContent = 'Белый макет по планировке'; startStory(); }
  intro.addEventListener('ended', toModel);
  tap.addEventListener('click', playIntro);

  // ---------- цикл ----------
  function size() { var w = stageEl.clientWidth, h = stageEl.clientHeight; renderer.setSize(w, h); cam.aspect = w / h;
    cam.fov = w < h ? 52 : 40; cam.updateProjectionMatrix(); }
  window.addEventListener('resize', size); size();
  var last = performance.now();
  (function loop(now) {
    var dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (mode === 'free' && !walking && now > freeT) {
      var rooms = ['hall', 'kitchen', 'zal', 'balcony', 'bath'].filter(function (r) { return r !== where; });
      var r = rooms[Math.floor(Math.random() * rooms.length)];
      freeT = Infinity;
      goTo(r, [(Math.random() - 0.5) * 0.6, (Math.random() - 0.5) * 0.6], function () { if (Math.random() < 0.6) say(FREE[fi++ % FREE.length], 2400); freeT = performance.now() + 1800 + Math.random() * 1500; });
    }
    updMan(dt); updDrops(now); ctl.update(); renderer.render(scene, cam); updSay();
    requestAnimationFrame(loop);
  })(last);
})();
