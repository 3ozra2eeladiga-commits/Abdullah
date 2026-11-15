/* Сцена: свет, небо, двор, режимы День/Ночь/Облака, вращение, нажатие на этаж.
   Наружу отдаёт window.GKScene (им пользуется js/ui.js). */
window.GKScene = (function () {
  'use strict';
  var T = THREE, GK = window.GK, S = GK.size;
  var canvas = document.getElementById('gl'), app = document.getElementById('app');
  var renderer;
  try { renderer = new T.WebGLRenderer({ canvas: canvas, antialias: true, powerPreference: 'high-performance' }); }
  catch (e) { document.getElementById('nogl').hidden = false; document.getElementById('load').hidden = true; return null; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.shadowMap.autoUpdate = false;

  var scene = new T.Scene();
  var camera = new T.PerspectiveCamera(30, 1, 1, 2000);
  var controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.5; controls.minDistance = 80; controls.maxDistance = 330;
  controls.autoRotateSpeed = 0.45;

  var H = S.groundH + (S.floors - 1) * S.floorH;        // высота до кровли
  var HOME_T = new T.Vector3(0, H * 0.46, 0);
  var dirty = true, flying = null, lastT = 0, shadowKick = 4;

  /* ---------- небо ---------- */
  var skyU = { top: { value: new T.Color() }, hor: { value: new T.Color() }, bot: { value: new T.Color() } };
  var skyMat = function (u) { return new T.ShaderMaterial({ uniforms: u, side: T.BackSide, depthWrite: false, fog: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 hor; uniform vec3 bot; varying vec3 vP; void main(){ float h = normalize(vP).y; vec3 c = h > 0.0 ? mix(hor, top, pow(max(h, 0.0001), 0.55)) : mix(hor, bot, pow(clamp(-h * 6.0, 0.0001, 1.0), 0.7)); gl_FragColor = vec4(c, 1.0);\n#include <encodings_fragment>\n}', toneMapped: false }); };
  var sky = new T.Mesh(new T.SphereGeometry(900, 32, 16), skyMat(skyU)); sky.frustumCulled = false; scene.add(sky);
  scene.fog = new T.Fog(0xffffff, 200, 700);

  // отражения в стёклах — маленькая «картинка неба»
  (function () {
    var es = new T.Scene(), u = { top: { value: new T.Color(0x6aa6e6).convertSRGBToLinear() }, hor: { value: new T.Color(0xf2f4f6).convertSRGBToLinear() }, bot: { value: new T.Color(0x8a8f86).convertSRGBToLinear() } };
    es.add(new T.Mesh(new T.SphereGeometry(50, 24, 12), skyMat(u)));
    var pm = new T.PMREMGenerator(renderer); scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
  })();

  /* ---------- свет ---------- */
  var hemi = new T.HemisphereLight(0xffffff, 0x8a8375, 0.7); scene.add(hemi);
  var sun = new T.DirectionalLight(0xffffff, 1.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.08;
  var sc = sun.shadow.camera; sc.left = -92; sc.right = 92; sc.top = 92; sc.bottom = -92; sc.near = 20; sc.far = 560; sc.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);
  var shopL = [new T.PointLight(0xffc98a, 0, 70, 2), new T.PointLight(0xffc98a, 0, 70, 2)];
  scene.add(shopL[0], shopL[1]);

  /* ---------- дом ---------- */
  var house = window.GKHouse.build(S), houseRoot = new T.Group();
  houseRoot.add(house.group); scene.add(houseRoot);
  var envMats = [];
  Object.keys(house.mats).forEach(function (k) { var m = house.mats[k]; m.envMapIntensity = k.indexOf('glass') === 0 ? 0.75 : 0.14; m.userData.env = m.envMapIntensity; envMats.push(m); });

  /* ---------- двор и окружение (в духе макета в офисе продаж) ---------- */
  var site = new T.Group(); scene.add(site);
  var rnd = (function (s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(77);
  var M = function (o) { var m = new T.MeshStandardMaterial(o); m.envMapIntensity = 0.12; m.userData.env = 0.12; envMats.push(m); return m; };
  function ctex(w, h, draw, rep) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); } return t; }
  var paveT = ctex(256, 256, function (g) { g.fillStyle = '#8f8d89'; g.fillRect(0, 0, 256, 256);
    for (var y = 0; y < 8; y++) for (var x = -1; x < 4; x++) { var v = rnd() * 0.16; g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255,' : '30,30,30,') + v + ')'; g.fillRect(x * 64 + (y % 2) * 32 + 1, y * 32 + 1, 62, 30); } }, 1 / 3.2);
  var grassT = ctex(256, 256, function (g) { g.fillStyle = '#5c8744'; g.fillRect(0, 0, 256, 256); for (var i = 0; i < 2600; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '40,80,30,' : '170,200,120,') + (0.05 + rnd() * 0.1) + ')'; g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 3, 2 + rnd() * 3); } }, 1 / 9);
  var mGrass = M({ map: grassT, roughness: 1 }), mPave = M({ map: paveT, roughness: 0.92 }), mAsph = M({ color: 0x4b4d52, roughness: 0.95 }),
    mLine = M({ color: 0xf1f1ee, roughness: 0.8 }), mBase = M({ color: 0x23252b, roughness: 0.6 }), mWood = M({ color: 0x8a6243, roughness: 0.8 }),
    mPlay = M({ color: 0x4f9a55, roughness: 1 }), mDark = M({ color: 0x1b1c20, roughness: 0.5, metalness: 0.5 }), mTrunk = M({ color: 0x5b4a3c, roughness: 1 });
  var P0 = house.parts[0], P1 = house.parts[1];       // два крыла дома (Г-образный план)
  var HX = P1.x1, HZ = P0.z1;                          // половины габарита: дом стоит в центре
  shopL[0].position.set(4, 3, HZ + 6); shopL[1].position.set(-HX - 6, 3, 0);
  var SR = 74;                                        // радиус «подмакетника»
  (function () {
    var top = new T.Mesh(new T.CircleGeometry(SR, 72), mGrass); top.rotation.x = -Math.PI / 2; top.receiveShadow = true;
    var uv = top.geometry.attributes.uv; for (var i = 0; i < uv.count; i++) uv.setXY(i, (uv.getX(i) - 0.5) * 2 * SR, (uv.getY(i) - 0.5) * 2 * SR);
    var rim = new T.Mesh(new T.CylinderGeometry(SR + 0.5, SR + 0.5, 2.2, 72, 1, true), mBase); rim.position.y = -1.12;
    var lip = new T.Mesh(new T.RingGeometry(SR, SR + 0.5, 72), mBase); lip.rotation.x = -Math.PI / 2; lip.position.y = -0.02;
    site.add(top, rim, lip);
  })();
  var floorMat = new T.MeshBasicMaterial({ color: 0xffffff }), floor = new T.Mesh(new T.CircleGeometry(900, 48), floorMat);
  floor.rotation.x = -Math.PI / 2; floor.position.y = -2.2; site.add(floor);
  var shadowCatch = new T.Mesh(new T.CircleGeometry(230, 48), new T.ShadowMaterial({ opacity: 0.18 })); shadowCatch.rotation.x = -Math.PI / 2; shadowCatch.position.y = -2.18; shadowCatch.receiveShadow = true; site.add(shadowCatch);
  var rimCaster = new T.Mesh(new T.CylinderGeometry(SR + 0.5, SR + 0.5, 0.2, 48), new T.MeshBasicMaterial({ colorWrite: false, depthWrite: false })); rimCaster.position.y = -0.3; rimCaster.castShadow = true; site.add(rimCaster);

  var layer = 0;
  function slab(mat, x0, x1, z0, z1, h) {            // плоская площадка (плитка, асфальт…)
    var gm = new T.BoxGeometry(x1 - x0, h, z1 - z0), uv = gm.attributes.uv, p = gm.attributes.position;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i) + (x0 + x1) / 2, p.getZ(i) + (z0 + z1) / 2);
    var m = new T.Mesh(gm, mat); m.position.set((x0 + x1) / 2, h / 2 + (layer += 0.004), (z0 + z1) / 2); m.receiveShadow = true; site.add(m); return m;
  }
  var PX0 = -HX - 8, PX1 = HX + 5.5, PZ0 = -HZ - 5, PZ1 = HZ + 7.5;   // плитка: тротуары и двор
  var RW = [PX0 - 9, PX0], RS = [PZ1, PZ1 + 9];                         // улицы: западная и южная
  slab(mPave, PX0, PX1, PZ0, PZ1, 0.08);
  slab(mAsph, RW[0], RW[1], -56, 56, 0.05); slab(mAsph, -56, 56, RS[0], RS[1], 0.05);
  for (var i = -5; i <= 5; i++) { slab(mLine, RW[0] + 4.42, RW[0] + 4.58, i * 9 - 1.5, i * 9 + 1.5, 0.06); slab(mLine, i * 9 - 1.5, i * 9 + 1.5, RS[0] + 4.42, RS[0] + 4.58, 0.06); }
  for (i = 0; i < 8; i++) slab(mLine, P1.x0 + 16 + i * 0.9, P1.x0 + 16.45 + i * 0.9, RS[0] + 0.6, RS[1] - 0.6, 0.06);   // «зебра»
  // двор: проезд, газоны, детская площадка, беседки
  var CX0 = P1.x0 + 3.5, CX1 = HX + 3.5, CZ0 = -HZ + 1, CZ1 = P1.z0 - 3.5;
  slab(mAsph, CX0, CX1, CZ0, CZ1, 0.05);
  slab(mGrass, CX0 + 6, CX1 - 6, CZ0 + 7, CZ1 - 6, 0.12);
  slab(mPlay, CX0 + 15, CX0 + 29, CZ0 + 10, CZ1 - 9, 0.14);
  for (i = 0; i <= 12; i++) slab(mLine, CX0 + 4 + i * 2.7 - 0.07, CX0 + 4 + i * 2.7 + 0.07, CZ0 + 0.3, CZ0 + 5.3, 0.06);        // парковка во дворе
  (function () {
    var box = new T.BoxGeometry(1, 1, 1), egg = new T.SphereGeometry(1, 16, 12);
    var add = function (g, mat, x, y, z, sx, sy, sz) { var m = new T.Mesh(g, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = m.receiveShadow = true; site.add(m); };
    var px = CX0 + 22, pz = (CZ0 + CZ1) / 2;
    add(egg, mWood, px - 3, 1.5, pz - 2, 1.4, 1.9, 1.4); add(egg, mWood, px + 3, 1.2, pz + 3, 1.1, 1.5, 1.1);
    [[-1, 2], [-1, 5], [3.5, -4], [3.5, -1]].forEach(function (p) { add(box, mWood, px + p[0], 1.3, pz + p[1], 0.2, 2.6, 0.2); });
    var perg = function (x, z) {                       // беседка-пергола
      [[-2.4, -1.8], [2.4, -1.8], [-2.4, 1.8], [2.4, 1.8]].forEach(function (p) { add(box, mDark, x + p[0], 1.4, z + p[1], 0.16, 2.8, 0.16); });
      for (var k = -4; k <= 4; k++) add(box, mWood, x + k * 0.6, 2.85, z, 0.12, 0.14, 4.4);
      add(box, mWood, x, 0.5, z, 3.2, 0.1, 1); add(box, mDark, x, 0.25, z, 2.8, 0.45, 0.7);
    };
    perg(CX0 + 10, pz - 4); perg(CX0 + 10, pz + 5); perg(CX1 - 11, pz + 2);
  })();

  // деревья: лиственные (шары кроны), туи и ели — одним «тиражом», чтобы не грузить планшет
  (function () {
    var free = function (x, z, r) {
      if (Math.sqrt(x * x + z * z) > SR - r - 1) return false;
      var inR = function (x0, x1, z0, z1) { return x > x0 - r && x < x1 + r && z > z0 - r && z < z1 + r; };
      return !(inR(PX0, PX1, PZ0, PZ1) || inR(RW[0], RW[1], -80, 80) || inR(-80, 80, RS[0], RS[1]));
    };
    var dec = [], con = [], tries = 0;
    while (dec.length < 34 && tries++ < 6000) { var a = rnd() * 6.283, d = 30 + rnd() * 42, x = Math.cos(a) * d, z = Math.sin(a) * d, r = 2.3 + rnd() * 1.6;
      if (!free(x, z, r * 0.9)) continue; if (dec.some(function (t) { return Math.hypot(t.x - x, t.z - z) < (t.r + r) * 0.8; })) continue; dec.push({ x: x, z: z, r: r }); }
    for (var i = 0; i < 6; i++) dec.push({ x: P1.x0 + 9 + i * 7.2, z: PZ1 - 1.6, r: 1.25, young: true });             // молодые деревья вдоль южного тротуара
    for (i = 0; i < 6; i++) dec.push({ x: PX0 + 1.6, z: -HZ + 6 + i * 7.5, r: 1.25, young: true });                       // и вдоль западного
    [[CX0 + 8, CZ0 + 9.5], [CX1 - 8, CZ0 + 9.5], [CX0 + 8, CZ1 - 8], [CX1 - 9, CZ1 - 8]].forEach(function (p) { dec.push({ x: p[0], z: p[1], r: 1.9, young: true }); });
    [[HX + 9, -HZ + 4], [HX + 9, 6], [-HX + 6, -HZ - 9], [8, -HZ - 9], [HX + 8, HZ + 1]].forEach(function (p) { if (free(p[0], p[1], 1.5)) con.push({ x: p[0], z: p[1] }); });
    for (i = 0; i < 7; i++) con.push({ x: PX1 - 1.2, z: CZ0 + 4 + i * 1.5, thuja: true });
    var blobG = new T.SphereGeometry(1, 22, 16), bp = blobG.attributes.position;
    for (i = 0; i < bp.count; i++) { var k = 1 + (Math.sin(bp.getX(i) * 9.1) * Math.cos(bp.getY(i) * 7.3) * Math.sin(bp.getZ(i) * 8.2)) * 0.07; bp.setXYZ(i, bp.getX(i) * k, bp.getY(i) * k, bp.getZ(i) * k); }
    blobG.computeVertexNormals();
    var mLeaf = M({ color: 0xffffff, roughness: 1 });
    var blobs = new T.InstancedMesh(blobG, mLeaf, dec.length * 4 + con.length), trunks = new T.InstancedMesh(new T.CylinderGeometry(0.16, 0.26, 1, 7), mTrunk, dec.length + con.length);
    var cones = new T.InstancedMesh(new T.ConeGeometry(1, 1, 18), mLeaf, Math.max(1, con.length * 3));
    var o = new T.Object3D(), col = new T.Color(), nb = 0, nt = 0, nc = 0;
    var put = function (im, n, x, y, z, sx, sy, sz, c) { o.position.set(x, y, z); o.scale.set(sx, sy, sz); o.rotation.set(0, rnd() * 6, 0); o.updateMatrix(); im.setMatrixAt(n, o.matrix); if (c) im.setColorAt(n, c); };
    dec.forEach(function (t) {
      var th = t.young ? 2.2 : 2.6 + rnd() * 1.6; put(trunks, nt++, t.x, th / 2, t.z, t.young ? 0.6 : 1, th, t.young ? 0.6 : 1);
      for (var j = 0; j < (t.young ? 2 : 4); j++) { var rr = t.r * (j ? 0.55 + rnd() * 0.25 : 1), ox = j ? (rnd() - 0.5) * t.r * 1.3 : 0, oz = j ? (rnd() - 0.5) * t.r * 1.3 : 0;
        col.setHSL(0.27 + rnd() * 0.05, 0.36 + rnd() * 0.12, 0.25 + rnd() * 0.08); put(blobs, nb++, t.x + ox, th + t.r * 0.75 + (j ? rnd() * t.r * 0.5 : 0), t.z + oz, rr, rr * 0.88, rr, col); }
    });
    con.forEach(function (t) {
      if (t.thuja) { var h = 4.4 + rnd() * 1.2; col.setHSL(0.3, 0.33, 0.2 + rnd() * 0.04); put(blobs, nb++, t.x, h / 2 + 0.2, t.z, 0.8, h / 2, 0.8, col); put(trunks, nt++, t.x, 0.3, t.z, 0.8, 0.6, 0.8); }
      else { var s = 0.85 + rnd() * 0.5; put(trunks, nt++, t.x, 0.9 * s, t.z, 1, 1.8 * s, 1); col.setHSL(0.36, 0.3, 0.17 + rnd() * 0.04);
        put(cones, nc++, t.x, 3.2 * s, t.z, 2.5 * s, 4.4 * s, 2.5 * s, col); put(cones, nc++, t.x, 5.4 * s, t.z, 1.9 * s, 3.8 * s, 1.9 * s, col); put(cones, nc++, t.x, 7.3 * s, t.z, 1.25 * s, 3 * s, 1.25 * s, col); }
    });
    blobs.count = nb; trunks.count = nt; cones.count = nc;
    [blobs, trunks, cones].forEach(function (im) { im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.needsUpdate = true; if (im.instanceColor) im.instanceColor.needsUpdate = true; site.add(im); });
  })();

  // фонари: столб, светильник, ночью — пятно света на земле
  var lampMat = new T.MeshBasicMaterial({ color: 0x55504a }), glowMat, poolMat;
  (function () {
    var spots = [];
    for (var i = 0; i < 6; i++) { spots.push([PX0 + 1.2, -HZ + 2 + i * 10.5]); spots.push([-HX + 4 + i * 11, PZ1 - 1.2]); }
    spots.push([CX0 + 5, CZ0 + 8], [CX1 - 5, CZ0 + 8], [CX0 + 5, CZ1 - 5], [CX1 - 6, CZ1 - 5], [(CX0 + CX1) / 2, CZ1 - 5], [HX + 4.5, HZ - 6]);
    var gt = ctex(128, 128, function (g) { var r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,214,150,1)'); r.addColorStop(0.25, 'rgba(255,190,110,.5)'); r.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    glowMat = new T.SpriteMaterial({ map: gt, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
    poolMat = new T.MeshBasicMaterial({ map: gt, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
    var poleG = new T.CylinderGeometry(0.07, 0.09, 5.2, 6), headG = new T.BoxGeometry(0.34, 0.6, 0.34), poolG = new T.PlaneGeometry(15, 15);
    spots.forEach(function (p) {
      var pole = new T.Mesh(poleG, mDark); pole.position.set(p[0], 2.6, p[1]); pole.castShadow = true;
      var head = new T.Mesh(headG, lampMat); head.position.set(p[0], 5.3, p[1]);
      var gl = new T.Sprite(glowMat); gl.position.set(p[0], 5.3, p[1]); gl.scale.set(3.6, 3.6, 1);
      var pool = new T.Mesh(poolG, poolMat); pool.rotation.x = -Math.PI / 2; pool.position.set(p[0], 0.24, p[1]); pool.renderOrder = 2;
      site.add(pole, head, gl, pool);
    });
  })();

  /* ---------- звёзды и облака ---------- */
  var stars = (function () {
    var n = 700, p = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var a = rnd() * 6.283, e = 0.06 + rnd() * 1.45, r = 800; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3));
    var m = new T.Points(g, new T.PointsMaterial({ color: 0xdfe8ff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.frustumCulled = false; scene.add(m); return m;
  })();
  var clouds = new T.Group(), cloudMats = []; scene.add(clouds);
  (function () {
    for (var v = 0; v < 3; v++) {
      var t = ctex(256, 256, function (g) { for (var i = 0; i < 16; i++) { var x = 60 + rnd() * 136, y = 90 + rnd() * 80, r = 34 + rnd() * 48, gr = g.createRadialGradient(x, y, 0, x, y, r);
        var sh = y > 150 ? '226,234,246' : '255,255,255'; gr.addColorStop(0, 'rgba(' + sh + ',.75)'); gr.addColorStop(0.55, 'rgba(' + sh + ',.3)'); gr.addColorStop(1, 'rgba(' + sh + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } });
      cloudMats.push(new T.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    }
    var add = function (rad, y, size, a) { var s = new T.Sprite(cloudMats[(rnd() * 3) | 0]); s.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); s.scale.set(size, size * 0.62, 1); s.userData = { y: y, ph: rnd() * 6.3 }; clouds.add(s); };
    for (var i = 0; i < 46; i++) add(86 + rnd() * 150, -9 + rnd() * 9, 80 + rnd() * 90, i / 46 * 6.283 + rnd() * 0.3);   // «море облаков» вокруг дома
    for (i = 0; i < 20; i++) add(72 + rnd() * 16, -3 + rnd() * 5, 42 + rnd() * 22, i / 20 * 6.283 + rnd() * 0.2);
    for (i = 0; i < 10; i++) add(66 + rnd() * 60, 10 + rnd() * 26, 30 + rnd() * 26, rnd() * 6.283);                           // облака, плывущие мимо этажей
    clouds.visible = false;
  })();

  /* ---------- режимы ---------- */
  var C = function (h) { return new T.Color(h); };
  var MODES = {
    day: { top: C(0x4f93dd), hor: C(0xe4edf4), bot: C(0xd9d6cf), sunC: C(0xfff0dc), sun: 2.1, sunP: new T.Vector3(-120, 135, 150), hemiS: C(0xcfe0ff), hemiG: C(0x6f695d), hemi: 0.29, exp: 0.92, win: 0, shop: 0.45, lamp: 0, stars: 0, cloud: 0, env: 1, fogN: 320, fogF: 890, sh: 0.2 },
    night: { top: C(0x050915), hor: C(0x1c2744), bot: C(0x0c0f18), sunC: C(0x9db6ff), sun: 0.5, sunP: new T.Vector3(100, 180, 110), hemiS: C(0x4a5f98), hemiG: C(0x15171f), hemi: 0.26, exp: 1.0, win: 1.5, shop: 1.5, lamp: 1, stars: 1, cloud: 0, env: 0.1, fogN: 300, fogF: 890, sh: 0.3 },
    clouds: { top: C(0x3f8ae0), hor: C(0xc4dcf5), bot: C(0xf3f6fa), sunC: C(0xfff3df), sun: 1.55, sunP: new T.Vector3(-95, 175, 135), hemiS: C(0xe6eeff), hemiG: C(0xb9c0cc), hemi: 0.6, exp: 0.95, win: 0, shop: 0.45, lamp: 0, stars: 0, cloud: 1, env: 1, fogN: 230, fogF: 900, sh: 0 }
  };
  var NUM = ['sun', 'hemi', 'exp', 'win', 'shop', 'lamp', 'stars', 'cloud', 'env', 'fogN', 'fogF', 'sh'], COL = ['top', 'hor', 'bot', 'sunC', 'hemiS', 'hemiG'];
  var cur = {}, goal = MODES.day, mode = 'day', modeT = 0;
  NUM.forEach(function (k) { cur[k] = goal[k]; }); COL.forEach(function (k) { cur[k] = goal[k].clone(); }); cur.sunP = goal.sunP.clone();
  function applyMode() {
    skyU.top.value.copy(cur.top).convertSRGBToLinear(); skyU.hor.value.copy(cur.hor).convertSRGBToLinear(); skyU.bot.value.copy(cur.bot).convertSRGBToLinear();
    scene.fog.color.copy(cur.hor); scene.fog.near = cur.fogN; scene.fog.far = cur.fogF; floorMat.color.copy(cur.bot);
    sun.color.copy(cur.sunC); sun.intensity = cur.sun; sun.position.copy(cur.sunP);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemi;
    renderer.toneMappingExposure = cur.exp;
    for (var k = 1; k <= 3; k++) house.mats['glass' + k].emissiveIntensity = cur.win * (k === 3 ? 0.6 : 1);
    house.mats.shop.emissiveIntensity = cur.shop;
    shopL[0].intensity = shopL[1].intensity = cur.lamp * 1.3;
    glowMat.opacity = cur.lamp; poolMat.opacity = cur.lamp * 0.3; lampMat.color.setRGB(0.33 + cur.lamp * 0.67, 0.31 + cur.lamp * 0.55, 0.29 + cur.lamp * 0.3);
    stars.material.opacity = cur.stars; stars.visible = cur.stars > 0.01;
    clouds.visible = cur.cloud > 0.01; cloudMats.forEach(function (m) { m.opacity = cur.cloud * 0.95; });
    shadowCatch.material.opacity = cur.sh;
    envMats.forEach(function (m) { m.envMapIntensity = m.userData.env * cur.env; });
    renderer.shadowMap.needsUpdate = true; dirty = true;
  }
  function setMode(m) { if (!MODES[m]) return; mode = m; goal = MODES[m]; modeT = 2.6; document.body.className = document.body.className.replace(/mode-\w+/, 'mode-' + m); }

  /* ---------- этажи: зоны нажатия и подсветка (работают и с домом архитектора) ---------- */
  var zones = [], zoneByKey = {}, selected = null, hovered = null;
  (function () {
    var hlCol = 0xe8943f, pad = 2.3;
    var mk = function (key, y0, y1) {
      var mat = new T.MeshBasicMaterial({ color: hlCol, transparent: true, opacity: 0, depthWrite: false, fog: false }), g = new T.Group(), meshes = [];
      var lmat = new T.LineBasicMaterial({ color: 0xffe3c2, transparent: true, opacity: 0, fog: false });
      house.parts.forEach(function (d, i) {
        var x0 = d.x0 - pad / 2 + (i ? pad : 0), geo = new T.BoxGeometry(d.x1 + pad / 2 - x0, y1 - y0 - 0.06, d.z1 - d.z0 + pad), m = new T.Mesh(geo, mat);
        m.position.set((x0 + d.x1 + pad / 2) / 2, (y0 + y1) / 2, (d.z0 + d.z1) / 2); m.userData.key = key; m.renderOrder = 5; g.add(m); meshes.push(m);
        var e = new T.LineSegments(new T.EdgesGeometry(geo), lmat); e.position.copy(m.position); e.renderOrder = 6; g.add(e);
      });
      var tg = new T.CylinderGeometry(house.tower.r + 1.2, house.tower.r + 1.2, y1 - y0 - 0.06, 40), tm = new T.Mesh(tg, mat);
      tm.position.set(house.tower.x, (y0 + y1) / 2, house.tower.z); tm.userData.key = key; tm.renderOrder = 5; g.add(tm); meshes.push(tm);
      g.visible = false; scene.add(g);
      var z = { key: key, y0: y0, y1: y1, mat: mat, lmat: lmat, group: g, meshes: meshes, a: 0 }; zones.push(z); zoneByKey[key] = z;
    };
    mk(1, 0, S.groundH);
    for (var f = 2; f <= S.floors; f++) mk(f, S.groundH + (f - 2) * S.floorH, S.groundH + (f - 1) * S.floorH);
    mk('roof', H, H + 4);
  })();
  var pickList = []; zones.forEach(function (z) { z.meshes.forEach(function (m) { pickList.push(m); }); });
  var ray = new T.Raycaster(), ndc = new T.Vector2();
  function pick(cx, cy) {
    var r = canvas.getBoundingClientRect(); ndc.set((cx - r.left) / r.width * 2 - 1, -(cy - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, camera); scene.updateMatrixWorld();
    var hit = ray.intersectObjects(pickList, false); return hit.length ? hit[0].object.userData.key : null;
  }
  function zoneAnim(dt) {
    var moving = false;
    zones.forEach(function (z) {
      var g = z === selected ? 1 : z === hovered ? 0.4 : 0, d = g - z.a;
      if (Math.abs(d) > 0.004) { z.a += d * Math.min(1, dt * 9); moving = true; } else z.a = g;
      z.group.visible = z.a > 0.004; z.mat.opacity = z.a * 0.46; z.lmat.opacity = Math.min(1, z.a * 1.4);
    });
    return moving;
  }

  /* ---------- камера ---------- */
  var inset = { r: 0, b: 0, cr: 0, cb: 0 }, vw = 1, vh = 1;
  function homeDist() { var a = vw / vh; return a >= 1.25 ? 172 : Math.min(330, 172 * Math.pow(1.25 / a, 0.85)); }
  function resize() {
    vw = app.clientWidth || window.innerWidth; vh = app.clientHeight || window.innerHeight;
    renderer.setSize(vw, vh, false); camera.aspect = vw / vh; view(); dirty = true;
  }
  function view() { if (inset.cr > 0.5 || inset.cb > 0.5) camera.setViewOffset(vw, vh, inset.cr / 2, inset.cb / 2, vw, vh); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  function fly(target, dist, azim, polar) { flying = { t: target.clone(), d: dist, az: azim, po: polar }; }
  function flyStep(dt) {
    if (!flying) return false;
    var k = 1 - Math.exp(-dt * 3.2), off = camera.position.clone().sub(controls.target), sp = new T.Spherical().setFromVector3(off);
    controls.target.lerp(flying.t, k); sp.radius += (flying.d - sp.radius) * k;
    if (flying.po != null) sp.phi += (flying.po - sp.phi) * k;
    if (flying.az != null) { var da = flying.az - sp.theta; da = Math.atan2(Math.sin(da), Math.cos(da)); sp.theta += da * k; }
    camera.position.copy(controls.target).add(new T.Vector3().setFromSpherical(sp));
    if (controls.target.distanceTo(flying.t) < 0.05 && Math.abs(flying.d - sp.radius) < 0.2) flying = null;
    return true;
  }
  function home(instant) {
    if (instant) { controls.target.copy(HOME_T); camera.position.copy(HOME_T).add(new T.Vector3().setFromSpherical(new T.Spherical(homeDist(), 1.36, -0.66))); controls.update(); }
    else fly(HOME_T, homeDist(), -0.66, 1.36);
    dirty = true;
  }
  function select(key) {
    selected = key == null ? null : zoneByKey[key] || null;
    if (selected) { var y = (selected.y0 + selected.y1) / 2; fly(new T.Vector3(0, Math.max(H * 0.3, Math.min(H * 0.72, y)), 0), homeDist() * (key === 'roof' ? 0.82 : 0.86), null, key === 'roof' ? 0.98 : null); }
    dirty = true;
  }
  function setInset(r, b) { inset.r = r; inset.b = b; dirty = true; }

  /* ---------- нажатия ---------- */
  var listeners = { pick: [], act: [] }, down = null;
  var emit = function (n, v) { listeners[n].forEach(function (f) { f(v); }); };
  canvas.addEventListener('pointerdown', function (e) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; emit('act'); });
  canvas.addEventListener('pointerup', function (e) {
    if (!down) return; var d = Math.hypot(e.clientX - down.x, e.clientY - down.y), t = performance.now() - down.t; down = null;
    if (d < 9 && t < 600) { var k = pick(e.clientX, e.clientY); if (k != null) emit('pick', k); }
  });
  canvas.addEventListener('pointermove', function (e) {
    if (e.pointerType !== 'mouse' || e.buttons) return;
    var k = pick(e.clientX, e.clientY), z = k == null ? null : zoneByKey[k];
    if (z !== hovered) { hovered = z; canvas.style.cursor = z ? 'pointer' : 'grab'; dirty = true; emit('hover', { key: k, x: e.clientX, y: e.clientY }); }
    else if (z) emit('hover', { key: k, x: e.clientX, y: e.clientY });
  });
  canvas.addEventListener('pointerleave', function () { if (hovered) { hovered = null; dirty = true; emit('hover', { key: null }); } });
  listeners.hover = [];
  controls.addEventListener('start', function () { flying = null; controls.autoRotate = false; emit('act'); });
  controls.addEventListener('change', function () { dirty = true; });
  canvas.addEventListener('wheel', function () { emit('act'); }, { passive: true });
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(app);

  /* ---------- файл дома от архитектора (когда появится) ---------- */
  function loadModel(done) {
    var m = GK.model; if (!m || !m.url || !T.GLTFLoader) return done();
    new T.GLTFLoader().load(m.url, function (g) {
      var o = g.scene; o.scale.setScalar(m.scale || 1); o.rotation.y = m.rotY || 0; o.position.set(m.x || 0, m.y || 0, m.z || 0);
      o.traverse(function (c) { if (c.isMesh) { c.castShadow = c.receiveShadow = true; } });
      houseRoot.remove(house.group); houseRoot.add(o); shadowKick = 4; dirty = true; done();
    }, undefined, function () { done(); });
  }

  /* ---------- кадр ---------- */
  function frame(t) {
    requestAnimationFrame(frame);
    var dt = Math.min(0.05, (t - lastT) / 1000 || 0.016); lastT = t;
    if (modeT > 0) { modeT -= dt; var k = 1 - Math.exp(-dt * 3.4);
      NUM.forEach(function (n) { cur[n] += (goal[n] - cur[n]) * k; }); COL.forEach(function (n) { cur[n].lerp(goal[n], k); }); cur.sunP.lerp(goal.sunP, k);
      if (modeT <= 0) { NUM.forEach(function (n) { cur[n] = goal[n]; }); COL.forEach(function (n) { cur[n].copy(goal[n]); }); cur.sunP.copy(goal.sunP); }
      applyMode(); }
    if (Math.abs(inset.r - inset.cr) > 0.5 || Math.abs(inset.b - inset.cb) > 0.5) { var ki = Math.min(1, dt * 7); inset.cr += (inset.r - inset.cr) * ki; inset.cb += (inset.b - inset.cb) * ki; view(); dirty = true; }
    else if (inset.cr !== inset.r || inset.cb !== inset.b) { inset.cr = inset.r; inset.cb = inset.b; view(); dirty = true; }
    if (flyStep(dt)) dirty = true;
    if (zoneAnim(dt)) dirty = true;
    controls.update();
    if (clouds.visible) { clouds.rotation.y += dt * 0.012; var ch = clouds.children; for (var i = 0; i < ch.length; i++) ch[i].position.y = ch[i].userData.y + Math.sin(t / 2600 + ch[i].userData.ph) * 0.9; dirty = true; }
    if (controls.autoRotate) dirty = true;
    if (shadowKick > 0) { shadowKick--; renderer.shadowMap.needsUpdate = true; dirty = true; }   // первые кадры: тени пересчитать наверняка
    if (dirty) { dirty = false; renderer.render(scene, camera); }
  }

  resize(); home(true); applyMode();
  loadModel(function () {
    requestAnimationFrame(frame);
    setTimeout(function () { document.getElementById('load').classList.add('is-off'); }, 250);
  });

  return {
    setMode: setMode, mode: function () { return mode; }, select: select, home: home, setInset: setInset,
    autoRotate: function (on) { controls.autoRotate = !!on; dirty = true; },
    on: function (n, f) { listeners[n].push(f); },
    floors: S.floors, _dbg: { scene: scene, renderer: renderer, camera: camera, sun: sun, hemi: hemi, render: function () { renderer.render(scene, camera); } }
  };
})();
