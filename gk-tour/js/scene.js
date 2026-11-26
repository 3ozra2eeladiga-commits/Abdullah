/* Сцена: небо и свет, участок, город вокруг, режимы День/Закат/Ночь/Облака, вращение, нажатие на этаж.
   Наружу отдаёт window.GKScene (им пользуется js/ui.js) и GKScene.ctx — точки подключения модулей. */
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
  var camera = new T.PerspectiveCamera(30, 1, 1, 4500);
  var controls = new T.OrbitControls(camera, canvas);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
  controls.rotateSpeed = 0.55; controls.zoomSpeed = 0.7;
  controls.minPolarAngle = 0.35; controls.maxPolarAngle = 1.5; controls.minDistance = 80; controls.maxDistance = 330;
  controls.autoRotateSpeed = 0.45;

  var H = S.groundH + (S.floors - 1) * S.floorH;        // высота до кровли
  var HOME_T = new T.Vector3(0, H * 0.46, 0);
  var dirty = true, flying = null, lastT = 0, shadowKick = 4;
  var frameHooks = [], modeHooks = [], resizeHooks = [], pickOn = true, ctx = null;   // точки подключения модулей (паркинг, машины, эффекты, интерьер)
  function seeded(s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
  var rnd = seeded(77), sn = new T.SimplexNoise({ random: seeded(5) }), _c = new T.Color(), BGU = T.BufferGeometryUtils;

  /* ---------- небо: физическая атмосфера (THREE.Sky) + облака, луна, зарево города, дымка у горизонта ---------- */
  var SKY_DECL = [
    'uniform float uGain; uniform float uMaxL; uniform float uNight; uniform float uCloud; uniform float uEnv; uniform vec3 uHorL;',
    'uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uNTop; uniform vec3 uMoon; uniform vec3 uCloudLit; uniform vec3 uCloudDark; uniform vec3 uGlow;',
    'float gkH(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float gkN(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(gkH(i), gkH(i + vec2(1.0, 0.0)), f.x), mix(gkH(i + vec2(0.0, 1.0)), gkH(i + vec2(1.0, 1.0)), f.x), f.y); }',
    'float gkF(vec2 p){ float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * gkN(p); p = p * 2.03 + vec2(17.3, 9.1); a *= 0.5; } return s; }'
  ].join('\n');
  var SKY_TAIL = [
    'vec3 col = min(retColor * uGain, vec3(uMaxL));',
    'float gh = direction.y, ghp = max(direction.y, 0.0);',
    'vec3 nightC = mix(uHorL, uNTop, pow(ghp, 0.45));',
    'float md = max(dot(direction, uMoon), 0.0);',
    'nightC += vec3(0.95, 0.93, 0.85) * (smoothstep(0.99986, 0.99991, md) * (1.3 + 0.5 * gkN(direction.xy * 160.0)) + pow(md, 900.0) * 0.2 + pow(md, 50.0) * 0.03);',
    'nightC += uGlow * exp(-ghp * 15.0);',
    'col = mix(col, nightC, uNight);',
    'if (uCloud > 0.001 && gh > 0.0) {',
    '  vec2 cp = direction.xz / (gh + 0.1) * 0.85;',
    '  float cn = gkF(cp + vec2(3.7, 1.9));',
    '  float cov = smoothstep(0.5, 0.8, cn) * smoothstep(0.02, 0.2, gh) * uCloud;',
    '  float sd = max(dot(direction, vSunDirection), 0.0);',
    '  vec3 cl = mix(uCloudLit, uCloudDark, smoothstep(0.58, 0.92, cn)) + uCloudLit * pow(sd, 10.0) * 0.45 * (1.0 - uNight);',
    '  col = mix(col, cl, cov);',
    '}',
    'if (uEnv > 0.5) { col = mix(col, uHorL, exp(-ghp * 13.0)); col = mix(col, uBot, 1.0 - smoothstep(-0.05, 0.0, gh)); }',
    'gl_FragColor = vec4(col, 1.0);'
  ].join('\n');
  // туман three.js смешивается уже после тонмаппинга — дымку у горизонта кладём так же, тогда земля и небо сходятся без шва
  var SKY_POST = 'if (uEnv < 0.5) { float gkHz = max(exp(-max(direction.y, 0.0) * 13.0), 1.0 - smoothstep(-0.05, 0.0, direction.y)); gl_FragColor.rgb = mix(gl_FragColor.rgb, uHor, gkHz); }';
  function skyMaterial() {
    var sh = T.Sky.SkyShader, u = T.UniformsUtils.clone(sh.uniforms);
    u.uGain = { value: 0.55 }; u.uMaxL = { value: 30 }; u.uNight = { value: 0 }; u.uCloud = { value: 0.6 };
    u.uEnv = { value: 0 }; u.uHorL = { value: new T.Color() }; u.uHor = { value: new T.Color() }; u.uBot = { value: new T.Color() }; u.uNTop = { value: new T.Color() };
    u.uMoon = { value: new T.Vector3(0.5, 0.2, -0.84).normalize() };
    u.uCloudLit = { value: new T.Color(1, 1, 1) }; u.uCloudDark = { value: new T.Color(0.6, 0.65, 0.7) }; u.uGlow = { value: new T.Color(0, 0, 0) };
    var fs = sh.fragmentShader.replace('void main() {', SKY_DECL + '\nvoid main() {').replace('vWorldPosition - cameraPos', 'vWorldPosition - cameraPosition').replace('gl_FragColor = vec4( retColor, 1.0 );', SKY_TAIL).replace('#include <encodings_fragment>', '#include <encodings_fragment>\n' + SKY_POST);
    return new T.ShaderMaterial({ uniforms: u, vertexShader: sh.vertexShader, fragmentShader: fs, side: T.BackSide, depthWrite: false, fog: false });
  }
  function skySet(u, p, env) {                          // p — параметры режима (текущие или целевые)
    u.sunPosition.value.copy(p.sunP); u.turbidity.value = p.turb; u.rayleigh.value = p.ray; u.mieCoefficient.value = p.mie; u.mieDirectionalG.value = 0.8;
    u.uGain.value = p.skyG * 0.5 / p.exp; u.uMaxL.value = env ? 2.2 : 30; u.uNight.value = p.stars; u.uCloud.value = p.scl;
    u.uHor.value.copy(p.hor); u.uHorL.value.copy(p.hor).convertSRGBToLinear(); u.uEnv.value = env ? 1 : 0; u.uBot.value.copy(p.bot); u.uNTop.value.copy(p.top);
    u.uCloudLit.value.copy(p.cl); u.uCloudDark.value.copy(p.cd); u.uGlow.value.copy(p.glow);
  }
  var sky = new T.Mesh(new T.SphereGeometry(3000, 32, 16), skyMaterial()); sky.frustumCulled = false; sky.name = 'sky'; scene.add(sky);
  var skyU = sky.material.uniforms;
  scene.fog = new T.Fog(0xffffff, 200, 700);
  // отражения: карта окружения печётся из того же неба под каждый режим (кэш)
  var pm = new T.PMREMGenerator(renderer), envScene = new T.Scene(), envSky = new T.Mesh(new T.SphereGeometry(40, 24, 12), skyMaterial()), envCache = {}, envWant = null;
  envSky.frustumCulled = false; envScene.add(envSky);
  function envFor(m) { if (!envCache[m]) { skySet(envSky.material.uniforms, MODES[m], true); envCache[m] = pm.fromScene(envScene, 0.012).texture; } return envCache[m]; }

  /* ---------- свет ---------- */
  var hemi = new T.HemisphereLight(0xffffff, 0x8a8375, 0.7); scene.add(hemi);
  var sun = new T.DirectionalLight(0xffffff, 1.4); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048); sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.07; sun.shadow.radius = 2;
  var sc = sun.shadow.camera; sc.left = -118; sc.right = 118; sc.top = 118; sc.bottom = -118; sc.near = 20; sc.far = 640; sc.updateProjectionMatrix();
  scene.add(sun); scene.add(sun.target);
  var shopL = [new T.PointLight(0xffc98a, 0, 70, 2), new T.PointLight(0xffc98a, 0, 70, 2)];
  scene.add(shopL[0], shopL[1]);

  /* ---------- дом ---------- */
  var house = window.GKHouse.build(S), houseRoot = new T.Group();
  houseRoot.add(house.group); scene.add(houseRoot);
  var envMats = [];
  Object.keys(house.mats || {}).forEach(function (k) { var m = house.mats[k]; if (!m || !m.isMaterial) return;
    var e = m.userData.env != null ? m.userData.env : k.indexOf('glass') === 0 ? 1 : k === 'shop' ? 0.9 : /marble|metal|dark/.test(k) ? 0.45 : 0.2;
    m.envMapIntensity = e; m.userData.env = e; envMats.push(m); });

  /* ---------- материалы и текстуры (всё рисуется на холсте: цвет + рельеф + шероховатость) ---------- */
  var site = new T.Group(); scene.add(site);
  var M = function (o) { var m = new T.MeshStandardMaterial(o); m.envMapIntensity = 0.12; m.userData.env = 0.12; envMats.push(m); return m; };
  function canv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tex(c, srgb, rx, ry) { var t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8; t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rx || 1, ry || rx || 1); return t; }
  function ctex(w, h, draw, rep) { var c = canv(w, h); draw(c.getContext('2d'), w, h); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8; if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); } return t; }
  function gy(v) { v = Math.max(0, Math.min(255, v | 0)); return 'rgb(' + v + ',' + v + ',' + v + ')'; }
  function grain(g, w, h, amt) { var id = g.getImageData(0, 0, w, h), d = id.data; for (var i = 0; i < d.length; i += 4) { var n = (rnd() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; } g.putImageData(id, 0, 0); }
  function nmap(hc, k, rx, ry) {                       // карта нормалей из карты высот
    var w = hc.width, h = hc.height, s = hc.getContext('2d').getImageData(0, 0, w, h).data, c = canv(w, h), g = c.getContext('2d'), id = g.createImageData(w, h), d = id.data;
    for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) { var i = (y * w + x) * 4, l = s[(y * w + (x + w - 1) % w) * 4], r = s[(y * w + (x + 1) % w) * 4], u = s[((y + h - 1) % h * w + x) * 4], b = s[((y + 1) % h * w + x) * 4];
      var nx = (l - r) / 255 * k, ny = (b - u) / 255 * k, q = 127.5 / Math.sqrt(nx * nx + ny * ny + 1); d[i] = 127.5 + nx * q; d[i + 1] = 127.5 + ny * q; d[i + 2] = 127.5 + q; d[i + 3] = 255; }
    g.putImageData(id, 0, 0); return tex(c, false, rx, ry);
  }
  var SWF = 0.164;                                      // доля тротуара с каждой стороны на текстуре улицы
  function roadCanvas(kind, N, plain) {                 // kind: 0 цвет, 1 высота, 2 шероховатость; plain — просто асфальт без разметки
    var c = canv(N, N), g = c.getContext('2d'), R = seeded(plain ? 23 : 11), a0 = plain ? 0 : SWF * N, a1 = plain ? N : (1 - SWF) * N, wa = a1 - a0, pm_ = wa / 9, i, x, y, w, h, j;
    g.fillStyle = kind === 0 ? '#3a3c3f' : kind === 1 ? gy(120) : gy(236); g.fillRect(0, 0, N, N);
    for (i = 0; i < 46; i++) { x = a0 + R() * wa; y = R() * N; w = (40 + R() * 150) * N / 1024; var lt = R() < 0.55, al = 0.05 + R() * 0.09;
      if (kind === 0) { var gr = g.createRadialGradient(x, y, 0, x, y, w); gr.addColorStop(0, 'rgba(' + (lt ? '150,146,138,' : '12,12,14,') + al + ')'); gr.addColorStop(1, 'rgba(' + (lt ? '150,146,138,0)' : '12,12,14,0)')); g.fillStyle = gr; g.fillRect(x - w, y - w, w * 2, w * 2); } }
    if (!plain) [1.35, 3.15, 5.85, 7.65].forEach(function (m) { var cx = a0 + m * pm_, hw = 0.5 * pm_, gr = g.createLinearGradient(cx - hw, 0, cx + hw, 0), cc = kind === 0 ? '14,14,16,' : kind === 1 ? '104,104,104,' : '196,196,196,';
      gr.addColorStop(0, 'rgba(' + cc + '0)'); gr.addColorStop(0.5, 'rgba(' + cc + (kind === 0 ? 0.3 : 0.7) + ')'); gr.addColorStop(1, 'rgba(' + cc + '0)'); g.fillStyle = gr; g.fillRect(cx - hw, 0, hw * 2, N); });
    for (i = 0; i < (plain ? 3 : 4); i++) { w = (1.2 + R() * 2.2) * pm_; h = (1.5 + R() * 3.5) * N / 18; x = a0 + R() * (wa - w); y = R() * (N - h); var dk = R() < 0.6;
      g.fillStyle = kind === 0 ? (dk ? 'rgba(22,23,25,0.6)' : 'rgba(96,94,90,0.35)') : kind === 1 ? gy(134) : gy(214); g.fillRect(x, y, w, h);
      if (kind !== 2) { g.strokeStyle = kind === 0 ? 'rgba(8,8,9,0.7)' : gy(70); g.lineWidth = 1.6 * N / 1024; g.strokeRect(x, y, w, h); } }
    for (i = 0; i < (plain ? 16 : 22); i++) { x = a0 + R() * wa; y = R() * N; var a = R() * 6.283, tar = i < 3; g.beginPath(); g.moveTo(x, y);
      for (j = 0; j < 24 + R() * 40; j++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 7 * N / 1024; y += Math.sin(a) * 7 * N / 1024; if (x < a0 + 2 || x > a1 - 2) break; g.lineTo(x, y); }
      g.strokeStyle = kind === 0 ? (tar ? 'rgba(10,10,11,0.9)' : 'rgba(14,14,15,0.65)') : kind === 1 ? gy(tar ? 140 : 30) : gy(tar ? 110 : 240); g.lineWidth = (tar ? 3.2 : 1.3) * N / 1024; g.stroke(); }
    if (!plain) {
      g.fillStyle = kind === 0 ? 'rgba(226,224,214,0.88)' : kind === 1 ? gy(128) : gy(165);
      [0.5, 9.5].forEach(function (m) { g.fillRect(N / 2 - 0.07 * pm_, m * N / 18, 0.14 * pm_, 3 * N / 18); });
      [[0, a0], [a1, N]].forEach(function (b, side) {  // тротуар: плитка + бортовой камень + грязь у борта
        g.fillStyle = kind === 0 ? '#77756f' : kind === 1 ? gy(150) : gy(228); g.fillRect(b[0], 0, b[1] - b[0], N);
        var ts = N / 60; for (y = 0; y < N; y += ts) for (x = b[0]; x < b[1]; x += ts) { var v = R(); g.fillStyle = kind === 0 ? 'rgba(' + (v < 0.5 ? '255,255,255,' : '20,20,20,') + (0.03 + R() * 0.09) + ')' : kind === 1 ? gy(150 + v * 40) : gy(228); g.fillRect(x + 1, y + 1, ts - 2, ts - 2); }
        var kx = side ? a1 : a0 - 0.2 * pm_; g.fillStyle = kind === 0 ? '#a29f98' : kind === 1 ? gy(245) : gy(200); g.fillRect(kx, 0, 0.2 * pm_, N);
        if (kind === 0) { g.fillStyle = 'rgba(40,40,40,0.5)'; for (y = 0; y < N; y += N / 18) g.fillRect(kx, y, 0.2 * pm_, 1.5);
          var gx = side ? a1 : a0, gg = g.createLinearGradient(side ? gx - 0.6 * pm_ : gx, 0, side ? gx : gx + 0.6 * pm_, 0); gg.addColorStop(side ? 1 : 0, 'rgba(70,62,50,0.5)'); gg.addColorStop(side ? 0 : 1, 'rgba(70,62,50,0)'); g.fillStyle = gg; g.fillRect(side ? gx - 0.6 * pm_ : gx, 0, 0.6 * pm_, N); }
      });
    }
    grain(g, N, N, kind === 0 ? 20 : kind === 1 ? 70 : 12); return c;
  }
  function paveCanvas(kind, N) {                        // тротуарная плитка-«кирпичик» 20×10 см, плитка 3,2 м
    var c = canv(N, N), g = c.getContext('2d'), R = seeded(5), sw = N / 16, sh = N / 32, x, y;
    g.fillStyle = kind === 0 ? '#3f3d3a' : kind === 1 ? gy(40) : gy(240); g.fillRect(0, 0, N, N);
    for (y = 0; y < 32; y++) for (x = -1; x < 16; x++) { var v = R(), dk = R() < 0.16, b = dk ? 66 + v * 16 : 104 + v * 34;
      g.fillStyle = kind === 0 ? 'rgb(' + ((b + 4) | 0) + ',' + ((b + 2) | 0) + ',' + ((b - 3) | 0) + ')' : kind === 1 ? gy(185 + v * 50) : gy(dk ? 196 : 222);
      g.fillRect(x * sw + (y % 2) * sw / 2 + 1, y * sh + 1, sw - 2, sh - 2); }
    grain(g, N, N, kind === 0 ? 14 : kind === 1 ? 26 : 8); return c;
  }
  var roadH = roadCanvas(1, 1024), asphH = roadCanvas(1, 512, true), paveH = paveCanvas(1, 512);
  var mRoad = M({ map: tex(roadCanvas(0, 1024), true), normalMap: nmap(roadH, 2.2), roughnessMap: tex(roadCanvas(2, 512), false), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  var mAsph = M({ map: tex(roadCanvas(0, 512, true), true, 1 / 9), normalMap: nmap(asphH, 2.2, 1 / 9), roughness: 0.93, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
  var mPave = M({ map: tex(paveCanvas(0, 512), true, 1 / 3.2), normalMap: nmap(paveH, 1.6, 1 / 3.2), roughnessMap: tex(paveCanvas(2, 256), false, 1 / 3.2), roughness: 1 });
  var mLine = M({ color: new T.Color(0xe9e7de).convertSRGBToLinear(), roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
  var mKerb = M({ color: new T.Color(0xa7a49d).convertSRGBToLinear(), roughness: 0.82 });
  var mConc = M({ color: new T.Color(0x8b8a85).convertSRGBToLinear(), roughness: 0.9, normalMap: nmap(asphH, 1.2, 1 / 6) });
  var grassT = ctex(512, 512, function (g) { g.fillStyle = '#48622f'; g.fillRect(0, 0, 512, 512); var i, x, y, r, gr, c;
    for (i = 0; i < 90; i++) { x = rnd() * 512; y = rnd() * 512; r = 30 + rnd() * 80; c = rnd() < 0.5 ? '52,84,36' : rnd() < 0.6 ? '104,122,58' : '60,72,34'; gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + c + ',.3)'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    g.lineWidth = 1; for (i = 0; i < 7000; i++) { x = rnd() * 512; y = rnd() * 512; g.strokeStyle = 'rgba(' + (rnd() < 0.5 ? '38,66,26,' : rnd() < 0.6 ? '120,150,72,' : '82,112,48,') + (0.25 + rnd() * 0.35) + ')'; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (rnd() - 0.5) * 4, y - 2 - rnd() * 4); g.stroke(); }
    grain(g, 512, 512, 14); }, 1 / 6);
  var mGrass = M({ map: grassT, roughness: 1 });
  var groundT = ctex(1024, 1024, function (g) { g.fillStyle = '#5a6644'; g.fillRect(0, 0, 1024, 1024); var i, x, y, r, gr, c;
    for (i = 0; i < 620; i++) { x = rnd() * 1024; y = rnd() * 1024; r = 16 + rnd() * 70; c = rnd() < 0.42 ? '66,92,48' : rnd() < 0.5 ? '138,128,92' : rnd() < 0.5 ? '112,100,78' : '84,108,58';
      gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(' + c + ',.42)'); gr.addColorStop(1, 'rgba(' + c + ',0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2); }
    for (i = 0; i < 9000; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '40,56,30,' : '150,146,110,') + (0.1 + rnd() * 0.2) + ')'; g.fillRect(rnd() * 1024, rnd() * 1024, 1 + rnd() * 3, 1 + rnd() * 3); }
    grain(g, 1024, 1024, 12); }, 1 / 150);
  var mPlay = M({ map: ctex(256, 256, function (g) { g.fillStyle = '#3d8a55'; g.fillRect(0, 0, 256, 256); [[70, 80, 46, '#c98a4a'], [180, 150, 58, '#d9b98a'], [110, 210, 30, '#2f6e8a']].forEach(function (c) { g.fillStyle = c[3]; g.beginPath(); g.arc(c[0], c[1], c[2], 0, 6.3); g.fill(); }); grain(g, 256, 256, 22); }, 1 / 14), roughness: 0.95 });
  var mProp = M({ vertexColors: true, roughness: 0.78, metalness: 0.05 }), mVeg = M({ vertexColors: true, roughness: 1 });
  var mGlassC = M({ color: 0x9fb6c4, roughness: 0.08, metalness: 0.3, transparent: true, opacity: 0.38, side: T.DoubleSide, depthWrite: false }); mGlassC.userData.env = 1;

  /* ---------- сборка геометрии «пакетами»: один материал — один вызов отрисовки ---------- */
  function ni(g) { return g.index ? g.toNonIndexed() : g; }
  function mergeG(list, groups) { return BGU.mergeBufferGeometries(list.map(ni), !!groups); }
  function addMesh(list, mat, cast, name) { if (!list.length) return null; var m = new T.Mesh(mergeG(list), mat); m.castShadow = !!cast; m.receiveShadow = true; if (name) m.name = name; site.add(m); return m; }
  function quad(x0, x1, z0, z1, y, uvf) { var g = new T.PlaneGeometry(x1 - x0, z1 - z0); g.rotateX(-Math.PI / 2); g.translate((x0 + x1) / 2, y, (z0 + z1) / 2); var p = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) { if (uvf) uvf(uv, i, p.getX(i), p.getZ(i)); else uv.setXY(i, p.getX(i), -p.getZ(i)); } return g; }
  function box(x0, x1, y0, y1, z0, z1) { var g = new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0); g.translate((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); var p = g.attributes.position, uv = g.attributes.uv;
    for (var i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i)); return g; }
  function paint(g, hex) { g = ni(g); g.deleteAttribute('uv'); var n = g.attributes.position.count, a = new Float32Array(n * 3); _c.set(hex).convertSRGBToLinear();
    for (var i = 0; i < n; i++) { a[i * 3] = _c.r; a[i * 3 + 1] = _c.g; a[i * 3 + 2] = _c.b; } g.setAttribute('color', new T.BufferAttribute(a, 3)); return g; }
  var props = [];                                      // мелкие формы (беседки, площадка, ограда, шлагбаум…) — один общий меш с цветом по вершинам
  function pbox(w, h, d, x, y, z, hex, ry, rx, rz) { var g = new T.BoxGeometry(w, h, d); if (rx) g.rotateX(rx); if (rz) g.rotateZ(rz); if (ry) g.rotateY(ry); g.translate(x, y, z); props.push(paint(g, hex)); }
  function pcyl(r0, r1, h, x, y, z, hex, seg) { var g = new T.CylinderGeometry(r0, r1, h, seg || 10); g.translate(x, y, z); props.push(paint(g, hex)); }
  var WOOD = 0x93683f, WOODD = 0x5b4130, DARK = 0x1c1d21, CREAM = 0xe6e0d2;

  /* ---------- участок: размеры (контракт dims) ---------- */
  var P0 = house.parts[0], P1 = house.parts[1];       // два крыла дома (Г-образный план)
  var HX = P1.x1, HZ = P0.z1;                          // половины габарита: дом стоит в центре
  shopL[0].position.set(4, 3, HZ + 6); shopL[1].position.set(-HX - 6, 3, 0);
  var PX0 = -HX - 8, PX1 = HX + 5.5, PZ0 = -HZ - 5, PZ1 = HZ + 7.5;   // плитка: тротуары и двор
  var RW = [PX0 - 9, PX0], RS = [PZ1, PZ1 + 9];                         // улицы: западная и южная
  var CX0 = P1.x0 + 3.5, CX1 = HX + 3.5, CZ0 = -HZ + 1, CZ1 = P1.z0 - 3.5;   // двор
  var RAMP = { x0: 31, x1: 37, z0: -20, z1: -4, depth: 4.2 };          // въезд в подземный паркинг: спуск на север
  var EX = RAMP.x0 - 0.4, DX1 = RAMP.x1 + 0.4, FX = EX - 1.2, FZ = -HZ - 1.15;   // край плитки, край проезда, линия ограды двора
  var GR = 1400, pitch = 112, sx0 = (RW[0] + RW[1]) / 2, sz0 = (RS[0] + RS[1]) / 2, NB = 5, EXT = 640, TILE = 18;

  // земля до горизонта (с вырезом под рампу паркинга)
  (function () {
    var sh = new T.Shape(); sh.absarc(0, 0, GR, 0, Math.PI * 2, false);
    var h = new T.Path(), a = RAMP.x0 - 0.25, b = RAMP.x1 + 0.25, c = -RAMP.z1, d = -RAMP.z0 + 0.25; h.moveTo(a, c); h.lineTo(a, d); h.lineTo(b, d); h.lineTo(b, c); h.lineTo(a, c); sh.holes.push(h);
    var g = new T.ShapeGeometry(sh, 40); g.rotateX(-Math.PI / 2);
    var top = new T.Mesh(g, M({ map: groundT, roughness: 1, polygonOffset: true, polygonOffsetFactor: 2, polygonOffsetUnits: 2 })); top.receiveShadow = true; top.name = 'ground'; site.add(top);
  })();

  // улицы: полотно с тротуарами и разметкой одной текстурой, перекрёстки — заплатками
  var roadG = [], asphG = [], lineG = [], paveG = [], kerbG = [], lawnG = [], playG = [], concG = [];
  (function () {
    var wA = function (k) { return k === 0 ? 4.5 : 3.6; }, wT = function (k) { return wA(k) / (1 - 2 * SWF); }, ks = [], k;
    for (k = -NB; k <= NB; k++) ks.push(k);
    ks.forEach(function (k) { var xc = sx0 + k * pitch, w = wT(k);
      roadG.push(quad(xc - w, xc + w, -EXT, EXT, 0.02, function (uv, i, x, z) { uv.setXY(i, (x - xc) / (2 * w) + 0.5, z / TILE); })); });
    ks.forEach(function (j) { var zc = sz0 + j * pitch, w = wT(j);
      for (var k = -NB - 1; k <= NB; k++) { var xa = k < -NB ? -EXT : sx0 + k * pitch + wT(k), xb = k === NB ? EXT : sx0 + (k + 1) * pitch - wT(k + 1);
        roadG.push(quad(xa, xb, zc - w, zc + w, 0.02, function (uv, i, x, z) { uv.setXY(i, (z - zc) / (2 * w) + 0.5, x / TILE); })); }
      ks.forEach(function (k) { var xc = sx0 + k * pitch; asphG.push(quad(xc - wT(k), xc + wT(k), zc - wA(j), zc + wA(j), 0.03)); }); });
  })();
  // разметка у дома: «зебры» у угла, парковочные карманы вдоль бордюра, стоп-линии
  (function () {
    var i, L = function (x0, x1, z0, z1) { lineG.push(quad(x0, x1, z0, z1, 0.045)); };
    for (i = 0; i < 9; i++) { L(RW[0] + 0.35 + i * 0.95, RW[0] + 0.85 + i * 0.95, PZ1 - 7.2, PZ1 - 3.4); L(PX0 + 3.4, PX0 + 7.2, RS[0] + 0.35 + i * 0.95, RS[0] + 0.85 + i * 0.95); }
    L(RW[1] - 2.42, RW[1] - 2.3, -HZ + 1, HZ - 7); L(-HX + 4, EX - 4, RS[0] + 2.3, RS[0] + 2.42);
    for (i = 0; i <= 7; i++) L(RW[1] - 2.3, RW[1] - 0.25, -HZ + 1 + i * 6.5 - 0.06, -HZ + 1 + i * 6.5 + 0.06);
    for (i = 0; i <= 8; i++) L(-HX + 4 + i * 6.3 - 0.06, -HX + 4 + i * 6.3 + 0.06, RS[0] + 0.25, RS[0] + 2.3);
  })();

  // участок: плитка, бордюры, проезд к рампе, газоны, площадка
  (function () {
    var i, lawn = function (x0, x1, z0, z1) { lawnG.push(box(x0, x1, 0.1, 0.22, z0, z1)); kerbG.push(box(x0 - 0.08, x1 + 0.08, 0.1, 0.19, z0 - 0.08, z1 + 0.08)); };
    paveG.push(box(PX0, EX, 0, 0.15, PZ0, PZ1));
    kerbG.push(box(PX0, PX0 + 0.2, 0, 0.175, PZ0, PZ1), box(PX0, EX, 0, 0.175, PZ1 - 0.2, PZ1), box(EX - 0.2, EX, 0, 0.175, PZ0, PZ1), box(PX0, EX, 0, 0.175, PZ0, PZ0 + 0.2), box(DX1, DX1 + 0.2, 0, 0.16, RAMP.z1, PZ1));
    asphG.push(quad(EX, DX1, RAMP.z1, PZ1, 0.03));     // проезд от южной улицы к рампе
    // двор без машин: газоны с дорожками между ними
    lawn(-8, 3, -24, -9); lawn(-8, 3, -5.5, 7.6); lawn(21.6, FX - 0.9, -24, 7.6); lawn(5.2, 19.2, -24, -18.2); lawn(5.2, 19.2, 1.7, 7.6);
    lawn(PX0 + 2.4, FX, PZ0 + 0.6, FZ - 0.6); lawn(FX + 0.25, EX - 0.3, FZ, P1.z0 + 1);
    playG.push(box(5.2, 19.2, 0.1, 0.19, -15.75, -0.75));
    // клумбы вдоль улиц между деревьями
    for (i = 0; i < 5; i++) { lawn(PX0 + 0.45, PX0 + 1.95, -23.4 + i * 9, -17.6 + i * 9); lawn(-18.4 + i * 9, -12.6 + i * 9, PZ1 - 1.95, PZ1 - 0.45); }
  })();

  // рампа в подземный паркинг: срез грунта, подпорные стены, навес, шлагбаум (сам паркинг строит js/parking.js)
  var rampGroup = new T.Group(); rampGroup.name = 'ramp'; site.add(rampGroup);
  (function () {
    var x0 = RAMP.x0, x1 = RAMP.x1, z0 = RAMP.z0, z1 = RAMP.z1, dp = RAMP.depth, L = z1 - z0, sl = Math.sqrt(L * L + dp * dp), i, xm = (x0 + x1) / 2;
    var g = new T.PlaneGeometry(x1 - x0, sl, 1, 6); g.rotateX(-Math.PI / 2); g.rotateX(-Math.atan2(dp, L)); g.translate(xm, -dp / 2 + 0.01, (z0 + z1) / 2);
    var p = g.attributes.position, uv = g.attributes.uv; for (i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    var fl = new T.Mesh(g, mAsph); fl.receiveShadow = true; fl.name = 'rampFloor'; rampGroup.add(fl);
    concG.push(box(x0 - 0.25, x0, -dp - 0.2, 1.0, z0 - 0.25, z1), box(x1, x1 + 0.25, -dp - 0.2, 1.0, z0 - 0.25, z1), box(x0 - 0.25, x1 + 0.25, -dp + 2.7, 1.0, z0 - 0.25, z0));
    var dark = new T.Mesh(new T.PlaneGeometry(x1 - x0, 2.72), new T.MeshBasicMaterial({ color: 0x050506, fog: false })); dark.position.set(xm, -dp + 1.35, z0 - 0.2); dark.name = 'rampPortalDark'; rampGroup.add(dark);
    [z0 + 0.5, z0 + 4.5, z0 + 8.5].forEach(function (z) { pbox(0.12, 2.1, 0.12, x0 - 0.12, 2.05, z, DARK); pbox(0.12, 2.1, 0.12, x1 + 0.12, 2.05, z, DARK); pbox(x1 - x0 + 0.5, 0.12, 0.12, xm, 3.1, z, DARK); });
    pbox(0.12, 0.12, 8.3, x0 - 0.12, 3.1, z0 + 4.5, DARK); pbox(0.12, 0.12, 8.3, x1 + 0.12, 3.1, z0 + 4.5, DARK); pbox(0.08, 0.08, 8.3, xm, 3.14, z0 + 4.5, DARK);
    var gl = new T.Mesh(quad(x0 - 0.3, x1 + 0.3, z0 + 0.2, z0 + 8.8, 3.2), mGlassC); gl.name = 'rampCanopy'; rampGroup.add(gl);
    pbox(0.36, 1.05, 0.36, x0 - 0.05, 0.55, z1 + 1.6, CREAM); pbox(0.4, 0.06, 0.4, x0 - 0.05, 1.1, z1 + 1.6, DARK);
    for (i = 0; i < 7; i++) pbox(0.78, 0.1, 0.06, x0 + 0.55 + i * 0.78, 0.95, z1 + 1.6, i % 2 ? 0xf0eee6 : 0xb9382c);
  })();

  // беседки-перголы, скамьи, детская площадка, ограда закрытого двора
  (function () {
    var i, pergola = function (x, z, ry) {
      var c = Math.cos(ry || 0), s = Math.sin(ry || 0), at = function (lx, lz) { return [x + lx * c + lz * s, z - lx * s + lz * c]; }, pb = function (w, h, d, lx, y, lz, col) { var q = at(lx, lz); pbox(w, h, d, q[0], y, q[1], col, ry || 0); };
      pb(5.8, 0.12, 4.3, 0, 0.26, 0, WOODD);
      [[-2.7, -1.95], [0, -1.95], [2.7, -1.95], [-2.7, 1.95], [0, 1.95], [2.7, 1.95]].forEach(function (q) { pb(0.16, 2.7, 0.16, q[0], 1.65, q[1], WOODD); });
      pb(5.9, 0.18, 0.14, 0, 3.05, -1.95, WOODD); pb(5.9, 0.18, 0.14, 0, 3.05, 1.95, WOODD);
      for (var k = 0; k < 14; k++) pb(0.07, 0.14, 4.7, -2.8 + k * 0.43, 3.2, 0, WOOD);
      for (k = 0; k < 9; k++) { pb(5.4, 0.09, 0.04, 0, 0.62 + k * 0.26, -1.95, WOOD); pb(0.04, 0.09, 1.9, -2.7, 0.62 + k * 0.26, -0.95, WOOD); }
      pb(3.8, 0.07, 0.5, 0, 0.78, -1.5, WOOD); pb(3.8, 0.4, 0.08, 0, 1.12, -1.72, WOOD); pb(0.1, 0.46, 0.44, -1.6, 0.55, -1.5, DARK); pb(0.1, 0.46, 0.44, 1.6, 0.55, -1.5, DARK);
      pb(1.9, 0.07, 0.85, 0, 1.06, -0.2, WOOD); pb(0.12, 0.74, 0.6, -0.7, 0.69, -0.2, DARK); pb(0.12, 0.74, 0.6, 0.7, 0.69, -0.2, DARK);
    };
    pergola(-2.5, -16.5, Math.PI / 2); pergola(-2.5, 1, Math.PI / 2); pergola(25.3, -8, -Math.PI / 2);
    var bench = function (x, z, ry) { var c = Math.cos(ry), s = Math.sin(ry), pb = function (w, h, d, lx, y, lz, col) { pbox(w, h, d, x + lx * c + lz * s, y, z - lx * s + lz * c, col, ry); };
      for (var k = 0; k < 3; k++) pb(1.9, 0.05, 0.13, 0, 0.6, -0.16 + k * 0.16, WOOD); pb(1.9, 0.13, 0.05, 0, 0.86, -0.27, WOOD); pb(1.9, 0.13, 0.05, 0, 1.04, -0.3, WOOD);
      pb(0.07, 0.45, 0.5, -0.8, 0.375, 0, DARK); pb(0.07, 0.45, 0.5, 0.8, 0.375, 0, DARK); pb(0.07, 0.6, 0.07, -0.8, 0.85, -0.29, DARK); pb(0.07, 0.6, 0.07, 0.8, 0.85, -0.29, DARK); };
    bench(-10.6, -12, -Math.PI / 2); bench(-10.6, 2, -Math.PI / 2); bench(4.1, -11, Math.PI / 2); bench(4.1, -4, Math.PI / 2); bench(12.2, 9.4, Math.PI); bench(20.4, -8, -Math.PI / 2); bench(-22, PZ1 - 3.2, Math.PI); bench(PX0 + 3.2, -8, Math.PI / 2);
    // детская площадка: деревянный городок с горкой, качели, песочница, балансиры
    var px = 12.2, pz = -8.2, Y = 0.19, RED = 0xb9553a, YEL = 0xd9a441, GRN = 0x4f7a52;
    [[-1.1, -1.1], [1.1, -1.1], [-1.1, 1.1], [1.1, 1.1]].forEach(function (q) { pbox(0.15, 3.3, 0.15, px - 3 + q[0], Y + 1.65, pz - 2.4 + q[1], WOOD); });
    pbox(2.4, 0.12, 2.4, px - 3, Y + 1.45, pz - 2.4, WOODD); pbox(2.9, 0.08, 1.75, px - 3, Y + 3.5, pz - 3.05, GRN, 0, 0.62); pbox(2.9, 0.08, 1.75, px - 3, Y + 3.5, pz - 1.75, GRN, 0, -0.62);
    pbox(2.4, 0.7, 0.06, px - 3, Y + 1.9, pz - 3.52, WOOD); pbox(0.06, 0.7, 2.4, px - 4.14, Y + 1.9, pz - 2.4, WOOD);
    pbox(0.85, 0.07, 3.3, px - 3, Y + 0.76, pz + 0.2, YEL, 0, 0.47); pbox(0.06, 0.25, 3.3, px - 3.45, Y + 0.86, pz + 0.2, YEL, 0, 0.47); pbox(0.06, 0.25, 3.3, px - 2.55, Y + 0.86, pz + 0.2, YEL, 0, 0.47);
    for (i = 0; i < 5; i++) pbox(0.9, 0.06, 0.12, px - 1.45, Y + 0.25 + i * 0.27, pz - 2.4, WOODD, 0, 0, 0);
    pbox(0.07, 1.5, 0.07, px - 1.02, Y + 0.75, pz - 2.9, WOOD); pbox(0.07, 1.5, 0.07, px - 1.02, Y + 0.75, pz - 1.9, WOOD);
    [[-1, 0.28], [1, -0.28]].forEach(function (q) { pbox(0.13, 2.9, 0.13, px + 3.4 + q[0] * 1.9, Y + 1.38, pz - 3.4 - 0.4, WOOD, 0, 0.28); pbox(0.13, 2.9, 0.13, px + 3.4 + q[0] * 1.9, Y + 1.38, pz - 3.4 + 0.4, WOOD, 0, -0.28); });
    pbox(4.1, 0.14, 0.14, px + 3.4, Y + 2.74, pz - 3.4, WOODD);
    [-0.85, 0.85].forEach(function (d) { pbox(0.5, 0.05, 0.2, px + 3.4 + d, Y + 0.55, pz - 3.4, RED); pbox(0.02, 2.15, 0.02, px + 3.4 + d - 0.22, Y + 1.63, pz - 3.4, DARK); pbox(0.02, 2.15, 0.02, px + 3.4 + d + 0.22, Y + 1.63, pz - 3.4, DARK); });
    pbox(3.4, 0.3, 0.14, px + 3.2, Y + 0.15, pz + 1.3, WOOD); pbox(3.4, 0.3, 0.14, px + 3.2, Y + 0.15, pz + 4.5, WOOD); pbox(0.14, 0.3, 3.34, px + 1.57, Y + 0.15, pz + 2.9, WOOD); pbox(0.14, 0.3, 3.34, px + 4.83, Y + 0.15, pz + 2.9, WOOD);
    pbox(3.1, 0.16, 3.1, px + 3.2, Y + 0.1, pz + 2.9, 0xd8c49a);
    pbox(3.4, 0.2, 0.2, px - 3.6, Y + 0.55, pz + 4.6, WOOD); pcyl(0.2, 0.2, 0.5, px - 5.3, Y + 0.25, pz + 4.6, WOODD, 8); pcyl(0.2, 0.2, 0.5, px - 1.9, Y + 0.25, pz + 4.6, WOODD, 8);
    pcyl(0.95, 0.95, 0.1, px - 0.3, Y + 0.45, pz + 3.1, RED, 16); pcyl(0.06, 0.06, 1.0, px - 0.3, Y + 0.6, pz + 3.1, DARK, 6);
    pcyl(0.28, 0.2, 0.55, px + 5.9, Y + 0.5, pz - 0.6, YEL, 8); pcyl(0.28, 0.2, 0.55, px - 5.9, Y + 0.5, pz - 6, 0x3a7ea0, 8);
    // ограда двора: чёрный металл, столбики и поручни в общем пакете, прутья — полупрозрачной текстурой
    var fenceG = [], run = function (xa, za, xb, zb) { var dx = xb - xa, dz = zb - za, len = Math.sqrt(dx * dx + dz * dz), n = Math.max(1, Math.round(len / 2.6)), ry = Math.atan2(-dz, dx), k;
      for (k = 0; k <= n; k++) pbox(0.09, 1.95, 0.09, xa + dx * k / n, 1.1, za + dz * k / n, DARK);
      pbox(len, 0.05, 0.05, (xa + xb) / 2, 1.95, (za + zb) / 2, DARK, ry); pbox(len, 0.05, 0.05, (xa + xb) / 2, 0.38, (za + zb) / 2, DARK, ry);
      var g = new T.PlaneGeometry(len, 1.6), uv = g.attributes.uv; for (k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * len / 0.9); g.rotateY(ry); g.translate((xa + xb) / 2, 1.17, (za + zb) / 2); fenceG.push(g); };
    run(P0.x1, -HZ, P0.x1, FZ); run(P0.x1, FZ, FX, FZ); run(FX, FZ, FX, P1.z0 + 1.2); run(FX, P1.z0 + 1.2, HX, P1.z0 + 1.2);
    var fm = new T.Mesh(mergeG(fenceG), new T.MeshBasicMaterial({ color: 0x0c0d10, transparent: true, depthWrite: false, side: T.DoubleSide,
      map: ctex(64, 16, function (g) { g.clearRect(0, 0, 64, 16); g.fillStyle = '#fff'; for (var x = 0; x < 8; x++) g.fillRect(x * 8 + 3, 0, 2, 16); }, 1) })); fm.name = 'fence'; site.add(fm);
  })();

  /* ---------- город вокруг: сетка улиц, пятиэтажки из силикатного кирпича, частные дома с участками ---------- */
  var cityMats = [], cityTrees = [], blockRects = [];
  function roofG(L, D, h, hip) {                        // скатная кровля: hip = 0 — двускатная с фронтонами
    var r = L / 2 - hip, A = [-L / 2, 0, -D / 2], B = [L / 2, 0, -D / 2], Cc = [L / 2, 0, D / 2], Dd = [-L / 2, 0, D / 2], R0 = [-r, h, 0], R1 = [r, h, 0];
    var tris = [Dd, Cc, R1, Dd, R1, R0, B, A, R0, B, R0, R1, Cc, B, R1, A, Dd, R0], pos = [], uv = [];
    tris.forEach(function (v) { pos.push(v[0], v[1], v[2]); uv.push(v[0] + v[2] * 0.3, v[1] > 0 ? 1 : 0); });
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2)); g.computeVertexNormals(); return g;
  }
  (function () {
    var slabsA = [], houses = [], o = new T.Object3D(), col = new T.Color(), i, j;
    var BL = 64, BD = 12, BH = 16;
    [{ x: 2, z: -58, r: 0 }, { x: -66, z: -34, r: 1 }, { x: 57, z: -36, r: 1 }].forEach(function (b) { slabsA.push(b); blockRects.push(b.r ? [b.x - 9, b.x + 9, b.z - 35, b.z + 35] : [b.x - 35, b.x + 35, b.z - 9, b.z + 9]); });   // соседи по кварталу
    blockRects.push([39, 67, 9, 27]);
    for (i = -NB; i < NB; i++) for (j = -NB; j < NB; j++) {
      if (i === 0 && j === -1) continue;
      var x0 = sx0 + i * pitch + 10, x1 = sx0 + (i + 1) * pitch - 10, z0 = sz0 + j * pitch + 10, z1 = sz0 + (j + 1) * pitch - 10, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, d = Math.sqrt(cx * cx + cz * cz);
      if (d > 600) continue;
      if (d > 175 && rnd() < (d < 330 ? 0.42 : 0.14)) { var rot = rnd() < 0.5 ? 0 : 1;
        for (var q = -1; q <= 1; q++) { if (rnd() < 0.15) continue; slabsA.push({ x: cx + (rot ? q * 31 : 0), z: cz + (rot ? 0 : q * 31), r: rot });
          cityTrees.push([cx + (rot ? q * 31 + 15 : (rnd() - 0.5) * 70), cz + (rot ? (rnd() - 0.5) * 70 : q * 31 + 15)], [cx + (rot ? q * 31 - 15 : (rnd() - 0.5) * 80), cz + (rot ? (rnd() - 0.5) * 80 : q * 31 - 15)]); }
      } else for (var a = 0; a < 4; a++) for (var b = 0; b < 4; b++) { if (rnd() < 0.08) continue;
        var lw = (x1 - x0) / 4, ld = (z1 - z0) / 4, lx = x0 + (a + 0.5) * lw, lz = z0 + (b + 0.5) * ld, edge = (a === 0 || a === 3 || b === 0 || b === 3);
        var hx = lx + (rnd() - 0.5) * 6, hz = lz + (rnd() - 0.5) * 6, two = rnd() < 0.22;
        houses.push({ x: hx, z: hz, lx: lx, lz: lz, lw: lw - 2.5, ld: ld - 2.5, w: 8 + rnd() * 4.5, d: 6.5 + rnd() * 3, h: two ? 5.8 : 3.1 + rnd() * 0.5, r: rnd() < 0.5 ? 0 : 1, hip: rnd() < 0.3, edge: edge });
        if (rnd() < 0.75) cityTrees.push([lx + (rnd() < 0.5 ? -1 : 1) * (lw / 2 - 3), lz + (rnd() - 0.5) * (ld - 6)]); if (rnd() < 0.45) cityTrees.push([lx + (rnd() - 0.5) * (lw - 6), lz + (rnd() < 0.5 ? -1 : 1) * (ld / 2 - 3)]); }
    }
    // пятиэтажки: стены с окнами, скатная шиферная кровля, балконы
    var facade = function (lit) { return ctex(512, 512, function (g) { var R = seeded(31), x, y, k;
      if (lit) { g.fillStyle = '#000'; g.fillRect(0, 0, 512, 512); }
      else { g.fillStyle = '#a5a299'; g.fillRect(0, 0, 512, 512);
        for (y = 0; y < 512; y += 6) { g.fillStyle = 'rgba(70,66,60,0.17)'; g.fillRect(0, y, 512, 1); for (x = (y / 6 % 2) * 7; x < 512; x += 14) g.fillRect(x, y, 1, 6); }
        for (k = 0; k < 70; k++) { g.fillStyle = 'rgba(' + (R() < 0.5 ? '255,255,255,' : '90,80,70,') + (0.03 + R() * 0.06) + ')'; g.fillRect(R() * 512, R() * 512, 30 + R() * 120, 6 + R() * 40); }
        for (y = 0; y < 4; y++) { g.fillStyle = 'rgba(60,55,50,0.2)'; g.fillRect(0, y * 128 + 124, 512, 3); } }
      for (y = 0; y < 4; y++) for (x = 0; x < 4; x++) { var on = R() < 0.42, wx = x * 128 + 34, wy = y * 128 + 26;
        if (lit) { if (on) { g.fillStyle = R() < 0.7 ? '#f0b266' : R() < 0.5 ? '#d9e2f2' : '#e8c89a'; g.fillRect(wx + 4, wy + 4, 52, 62); } }
        else { g.fillStyle = '#e9e7df'; g.fillRect(wx, wy, 60, 70); var gr = g.createLinearGradient(0, wy, 0, wy + 70); gr.addColorStop(0, '#465a6e'); gr.addColorStop(1, '#1b232d'); g.fillStyle = gr; g.fillRect(wx + 4, wy + 4, 52, 62);
          g.fillStyle = '#e9e7df'; g.fillRect(wx + 28, wy + 4, 3, 62); g.fillRect(wx + 4, wy + 22, 24, 3);
          if (R() < 0.5) { g.fillStyle = 'rgba(235,230,215,0.55)'; g.fillRect(wx + 4, wy + 4, 10 + R() * 14, 62); }
          g.fillStyle = 'rgba(0,0,0,0.28)'; g.fillRect(wx, wy + 70, 60, 3); } } }); };
    var mWall = M({ map: facade(false), roughness: 0.95, emissive: 0xffffff, emissiveMap: facade(true), emissiveIntensity: 0 }); cityMats.push(mWall);
    var slateT = ctex(128, 128, function (g) { g.fillStyle = '#6c6a66'; g.fillRect(0, 0, 128, 128); for (var x = 0; x < 128; x += 8) { g.fillStyle = 'rgba(0,0,0,' + (0.1 + rnd() * 0.16) + ')'; g.fillRect(x, 0, 2, 128); g.fillStyle = 'rgba(255,255,255,0.07)'; g.fillRect(x + 3, 0, 2, 128); } for (var y = 0; y < 128; y += 32) { g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(0, y, 128, 2); } grain(g, 128, 128, 16); }, 1);
    slateT.wrapS = slateT.wrapT = T.RepeatWrapping;
    var mSlate = M({ map: slateT, roughness: 0.9 }), mTrim = M({ color: new T.Color(0xaeb3b0).convertSRGBToLinear(), roughness: 0.9 });
    var wallG = new T.BoxGeometry(BL, BH, BD), wuv = wallG.attributes.uv; for (i = 0; i < wuv.count; i++) { var f = Math.floor(i / 4), len = f < 2 ? BD : BL; wuv.setXY(i, wuv.getX(i) * len / 12.8, wuv.getY(i) * BH / 12.8); } wallG.translate(0, BH / 2, 0);
    var rg = roofG(BL + 1.4, BD + 1.4, 3.3, 5.5), ruv = rg.attributes.uv; for (i = 0; i < ruv.count; i++) ruv.setX(i, ruv.getX(i) / 2.2); rg.translate(0, BH + 0.2, 0);
    var trim = [new T.BoxGeometry(BL + 1.4, 0.3, BD + 1.4).translate(0, BH + 0.05, 0)];
    for (var fl = 1; fl < 5; fl++) for (i = 0; i < 20; i++) if (i % 3 === 1) [-1, 1].forEach(function (sd) { trim.push(new T.BoxGeometry(3.0, 1.15, 1.0).translate(-BL / 2 + (i + 0.5) * 3.2, fl * 3.2 + 0.5, sd * (BD / 2 + 0.5))); });
    for (i = 0; i < 4; i++) { trim.push(new T.BoxGeometry(2.6, 0.16, 1.7).translate(-BL / 2 + 8 + i * 16, 2.7, -BD / 2 - 0.85)); trim.push(new T.BoxGeometry(0.7, 1.1, 0.7).translate(-BL / 2 + 6 + i * 16, BH + 2.4, 0.8)); }
    var blocks = new T.InstancedMesh(mergeG([wallG, rg, mergeG(trim)], true), [mWall, mSlate, mTrim], slabsA.length);
    slabsA.forEach(function (b, n) { o.position.set(b.x, 0, b.z); o.rotation.set(0, b.r ? Math.PI / 2 : 0, 0); o.scale.set(1, 1, 1); o.updateMatrix(); blocks.setMatrixAt(n, o.matrix); var v = 0.86 + rnd() * 0.2; blocks.setColorAt(n, col.setRGB(v, v * (0.96 + rnd() * 0.05), v * (0.9 + rnd() * 0.08))); });
    blocks.castShadow = blocks.receiveShadow = true; blocks.frustumCulled = false; blocks.instanceColor.needsUpdate = true; site.add(blocks);
    // старое краснокирпичное здание к востоку
    (function () {
      var bt = ctex(512, 256, function (g) { g.fillStyle = '#8a4636'; g.fillRect(0, 0, 512, 256); var x, y, k;
        for (y = 0; y < 256; y += 5) { g.fillStyle = 'rgba(40,20,14,0.25)'; g.fillRect(0, y, 512, 1); for (x = (y / 5 % 2) * 6; x < 512; x += 12) g.fillRect(x, y, 1, 5); }
        for (k = 0; k < 80; k++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '190,120,90,' : '50,26,20,') + (0.05 + rnd() * 0.1) + ')'; g.fillRect(rnd() * 512, rnd() * 256, 20 + rnd() * 70, 5 + rnd() * 20); }
        g.fillStyle = '#6e3528'; g.fillRect(0, 118, 512, 9); g.fillRect(0, 0, 512, 12); g.fillStyle = '#5a5650'; g.fillRect(0, 236, 512, 20);
        for (y = 0; y < 2; y++) for (x = 0; x < 6; x++) { var wx = x * 85.3 + 26, wy = y * 118 + 34; g.fillStyle = '#d8d0c0'; g.beginPath(); g.moveTo(wx - 4, wy + 66); g.lineTo(wx - 4, wy + 12); g.arc(wx + 17, wy + 12, 21, Math.PI, 0); g.lineTo(wx + 38, wy + 66); g.fill();
          g.fillStyle = '#232c36'; g.beginPath(); g.moveTo(wx, wy + 62); g.lineTo(wx, wy + 13); g.arc(wx + 17, wy + 13, 17, Math.PI, 0); g.lineTo(wx + 34, wy + 62); g.fill(); g.fillStyle = '#d8d0c0'; g.fillRect(wx + 16, wy - 4, 2.5, 66); g.fillRect(wx, wy + 22, 34, 2.5); } });
      var bg = new T.BoxGeometry(22, 7.6, 11), u = bg.attributes.uv; for (var k = 0; k < u.count; k++) { var f = Math.floor(k / 4); u.setX(k, u.getX(k) * (f < 2 ? 1 : 2)); } bg.translate(0, 3.8, 0);
      var m = new T.Mesh(mergeG([bg, roofG(23, 12, 3.2, 0).translate(0, 7.6, 0)], true), [M({ map: bt, roughness: 0.95 }), M({ color: new T.Color(0x56595c).convertSRGBToLinear(), roughness: 0.6, metalness: 0.3, side: T.DoubleSide })]);
      bt.wrapS = T.RepeatWrapping; m.position.set(53, 0, 18); m.castShadow = m.receiveShadow = true; m.name = 'oldBrick'; site.add(m);
    })();
    // частные дома: стены, двускатные и вальмовые крыши, заборы участков, сараи
    var hWall = M({ map: ctex(256, 128, function (g) { g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 256, 128); g.fillStyle = 'rgba(0,0,0,0.05)'; for (var y = 0; y < 128; y += 7) g.fillRect(0, y, 256, 1); g.fillStyle = '#8e8b85'; g.fillRect(0, 108, 256, 20);
      [34, 150].forEach(function (x) { g.fillStyle = '#f7f5ef'; g.fillRect(x - 5, 30, 70, 62); g.fillStyle = '#2a3642'; g.fillRect(x, 35, 60, 52); g.fillStyle = '#f7f5ef'; g.fillRect(x + 28, 35, 4, 52); g.fillRect(x, 52, 60, 3); g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 7, 92, 74, 4); }); var gr = g.createLinearGradient(0, 0, 0, 22); gr.addColorStop(0, 'rgba(0,0,0,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 22); }), roughness: 0.95,
      emissive: 0xffffff, emissiveMap: ctex(256, 128, function (g) { g.fillStyle = '#000'; g.fillRect(0, 0, 256, 128); g.fillStyle = '#f0b060'; g.fillRect(34, 35, 60, 52); }), emissiveIntensity: 0 }); cityMats.push(hWall);
    var roofM = M({ map: slateT, color: 0xffffff, roughness: 0.75, metalness: 0.08, side: T.DoubleSide });
    var gab = houses.filter(function (h) { return !h.hip; }), hip = houses.filter(function (h) { return h.hip; }), sheds = houses.filter(function (h, n) { return n % 5 !== 0; });
    var bodies = new T.InstancedMesh(new T.BoxGeometry(1, 1, 1), hWall, houses.length), roofsG = new T.InstancedMesh(roofG(1, 1, 1, 0), roofM, Math.max(1, gab.length)), roofsH = new T.InstancedMesh(roofG(1, 1, 1, 0.34), roofM, Math.max(1, hip.length));
    var frame = mergeG([new T.BoxGeometry(1, 1, 0.012).translate(0, 0.5, 0.5), new T.BoxGeometry(1, 1, 0.012).translate(0, 0.5, -0.5), new T.BoxGeometry(0.012, 1, 1).translate(0.5, 0.5, 0), new T.BoxGeometry(0.012, 1, 1).translate(-0.5, 0.5, 0)]);
    var fences = new T.InstancedMesh(frame, M({ color: 0xffffff, roughness: 0.85 }), houses.length), shedM = new T.InstancedMesh(mergeG([new T.BoxGeometry(1, 1, 1).translate(0, 0.5, 0), roofG(1.12, 1.12, 0.28, 0).translate(0, 1, 0)]), M({ color: 0xffffff, roughness: 0.9 }), Math.max(1, sheds.length));
    var RC = [0x6e4034, 0x53565c, 0x7d3a2e, 0x46524a, 0x5e5044, 0x8a8d90, 0x35506a], WC = [0xf4f1ea, 0xe9dcc2, 0xd3bd9c, 0xdedede, 0xc49a80, 0xb8c2b0, 0xa8523c], FC = [0x4e5154, 0x5e4232, 0x3f4a40, 0x6a6862, 0x55302a, 0x54585c];
    var ng = 0, nh = 0, ns = 0, lin = function (hex) { return col.setHex(hex).convertSRGBToLinear(); };
    houses.forEach(function (h, n) { var ry = h.r ? Math.PI / 2 : 0, rm = h.hip ? roofsH : roofsG, ri = h.hip ? nh++ : ng++;
      o.rotation.set(0, ry, 0); o.position.set(h.x, h.h / 2, h.z); o.scale.set(h.w, h.h, h.d); o.updateMatrix(); bodies.setMatrixAt(n, o.matrix); bodies.setColorAt(n, lin(WC[(rnd() * WC.length) | 0]));
      o.position.set(h.x, h.h, h.z); o.scale.set(h.w * 1.14, h.hip ? 2.1 : 2.5, h.d * 1.16); o.updateMatrix(); rm.setMatrixAt(ri, o.matrix); rm.setColorAt(ri, lin(RC[(rnd() * RC.length) | 0]));
      o.rotation.set(0, 0, 0); o.position.set(h.lx, 0, h.lz); o.scale.set(h.lw, 1.1 + rnd() * 0.5, h.ld); o.updateMatrix(); fences.setMatrixAt(n, o.matrix); fences.setColorAt(n, lin(FC[(rnd() * FC.length) | 0])); });
    sheds.forEach(function (h, n) { o.rotation.set(0, rnd() < 0.5 ? 0 : Math.PI / 2, 0); o.position.set(h.lx + (rnd() < 0.5 ? -1 : 1) * (h.lw / 2 - 3), 0, h.lz + (rnd() < 0.5 ? -1 : 1) * (h.ld / 2 - 2.6)); o.scale.set(3 + rnd() * 2.5, 2.2 + rnd() * 0.5, 2.6 + rnd() * 1.6); o.updateMatrix(); shedM.setMatrixAt(n, o.matrix); shedM.setColorAt(n, lin(FC[(rnd() * FC.length) | 0])); });
    roofsG.count = Math.max(ng, 0); roofsH.count = Math.max(nh, 0);
    [bodies, roofsG, roofsH, fences, shedM].forEach(function (im) { im.castShadow = im.receiveShadow = true; im.frustumCulled = false; if (im.instanceColor) im.instanceColor.needsUpdate = true; site.add(im); });
  })();

  /* ---------- зелень: кроны из нескольких неровных «облаков» листвы, ветвистые стволы, ели и туи, кусты с цветами ---------- */
  (function () {
    function clump(r, sy, x, y, z, hue, lum, sw, shh, flower) {
      var g = new T.SphereGeometry(1, sw || 12, shh || 9), p = g.attributes.position, n = p.count, colr = new Float32Array(n * 3), ox = rnd() * 60, i, vx, vy, vz, k, l;
      for (i = 0; i < n; i++) { vx = p.getX(i); vy = p.getY(i); vz = p.getZ(i);
        k = 1 + sn.noise3d(vx * 1.3 + ox, vy * 1.3, vz * 1.3) * 0.26 + sn.noise3d(vx * 3.4 + ox, vy * 3.4, vz * 3.4) * 0.15 + sn.noise3d(vx * 8 + ox, vy * 8, vz * 8) * 0.05; if (vy < -0.25) k *= 0.8;
        p.setXYZ(i, vx * k * r + x, vy * k * r * sy + y, vz * k * r + z);
        l = lum * 0.8 * (0.42 + 0.58 * Math.min(1, vy * 0.7 + 0.75)) * (0.9 + sn.noise3d(vx * 3 + ox, vy * 3 + 7, vz * 3) * 0.24);
        if (flower && vy > -0.2 && sn.noise3d(vx * 6 + ox, vy * 6, vz * 6) > 0.1) _c.setHSL(flower, 0.72, 0.42); else _c.setHSL(hue - 0.012 + sn.noise3d(vx + ox, vy, vz + 3) * 0.025, 0.36, l);
        _c.convertSRGBToLinear(); colr[i * 3] = _c.r; colr[i * 3 + 1] = _c.g; colr[i * 3 + 2] = _c.b; }
      g.computeVertexNormals(); g.deleteAttribute('uv'); g.setAttribute('color', new T.BufferAttribute(colr, 3)); return g.toNonIndexed();
    }
    function limb(r0, r1, h, x, y, z, tilt, ry, hex) { var g = new T.CylinderGeometry(r0, r1, h, 6, 1, true); g.translate(0, h / 2, 0); if (tilt) g.rotateZ(tilt); if (ry) g.rotateY(ry); g.translate(x, y, z); return paint(g, hex); }
    function tier(r, h, y, lum) { var g = new T.ConeGeometry(r, h, 10, 2, true), p = g.attributes.position, n = p.count, colr = new Float32Array(n * 3), ox = rnd() * 40, i, vx, vy, vz, k, t;
      for (i = 0; i < n; i++) { vx = p.getX(i); vy = p.getY(i); vz = p.getZ(i); k = 1 + sn.noise3d(vx * 1.5 + ox, vy, vz * 1.5) * 0.25; t = 0.5 - vy / h; p.setXYZ(i, vx * k, vy + y - t * t * 0.25 * h, vz * k);
        _c.setHSL(0.38, 0.3, lum * (0.6 + 0.6 * t)).convertSRGBToLinear(); colr[i * 3] = _c.r; colr[i * 3 + 1] = _c.g; colr[i * 3 + 2] = _c.b; }
      g.computeVertexNormals(); g.deleteAttribute('uv'); g.setAttribute('color', new T.BufferAttribute(colr, 3)); return g.toNonIndexed(); }
    var BARK = 0x4b3c31, i, a;
    function species(kind) { var gs = [], th;
      if (kind === 'broad') { th = 3.4; gs.push(limb(0.17, 0.33, th + 2.2, 0, 0, 0, 0, 0, BARK));
        for (i = 0; i < 5; i++) gs.push(limb(0.06, 0.13, 3 + rnd(), 0, th - 0.7 + i * 0.35, 0, 0.6 + rnd() * 0.35, i * 1.3 + rnd(), BARK));
        gs.push(clump(2.5, 0.85, 0, th + 3.6, 0, 0.28, 0.3)); for (i = 0; i < 7; i++) { a = i / 7 * 6.283 + rnd() * 0.4; gs.push(clump(1.5 + rnd() * 0.7, 0.8, Math.cos(a) * (1.9 + rnd() * 0.5), th + 1.9 + rnd() * 1.9, Math.sin(a) * (1.9 + rnd() * 0.5), 0.27 + rnd() * 0.03, 0.27 + rnd() * 0.06)); }
        gs.push(clump(1.5, 0.8, 0.5, th + 5.3, -0.3, 0.27, 0.33)); }
      else if (kind === 'poplar') { gs.push(limb(0.14, 0.32, 6, 0, 0, 0, 0, 0, 0x5c5248));
        gs.push(clump(1.9, 3.4, 0, 9.2, 0, 0.26, 0.27, 12, 12)); for (i = 0; i < 4; i++) gs.push(clump(1.25, 2.3, (rnd() - 0.5) * 1.3, 5.6 + i * 2.6, (rnd() - 0.5) * 1.3, 0.255, 0.25 + rnd() * 0.04)); }
      else if (kind === 'birch') { th = 4.6; gs.push(limb(0.07, 0.17, th + 3, 0, 0, 0, 0.04, 0, 0xd9d5c8));
        for (i = 0; i < 3; i++) gs.push(limb(0.03, 0.07, 2.4, 0, th - 0.4 + i * 0.7, 0, 0.7, i * 2.1 + rnd(), 0xcfcabb));
        for (i = 0; i < 6; i++) { a = i / 6 * 6.283 + rnd() * 0.5; gs.push(clump(1.15 + rnd() * 0.5, 1.15, Math.cos(a) * (0.9 + rnd() * 0.7), th + 0.6 + rnd() * 3, Math.sin(a) * (0.9 + rnd() * 0.7), 0.23 + rnd() * 0.03, 0.34 + rnd() * 0.06)); } }
      else if (kind === 'young') { th = 2.3; gs.push(limb(0.045, 0.07, th + 0.9, 0, 0.16, 0, 0, 0, 0x5a4a3c));
        gs.push(paint(new T.BoxGeometry(1.3, 0.03, 1.3).translate(0, 0.165, 0), 0x202124)); gs.push(paint(new T.BoxGeometry(0.05, 1.5, 0.05).translate(0.28, 0.9, 0.1), WOOD)); gs.push(paint(new T.BoxGeometry(0.05, 1.5, 0.05).translate(-0.26, 0.9, -0.12), WOOD));
        gs.push(clump(1.05, 1.0, 0, th + 1.2, 0, 0.27, 0.32)); for (i = 0; i < 3; i++) { a = i * 2.1 + rnd(); gs.push(clump(0.7 + rnd() * 0.2, 0.9, Math.cos(a) * 0.65, th + 0.7 + rnd() * 0.8, Math.sin(a) * 0.65, 0.26 + rnd() * 0.03, 0.3 + rnd() * 0.05)); } }
      else if (kind === 'spruce') { gs.push(limb(0.1, 0.2, 2.2, 0, 0, 0, 0, 0, BARK)); for (i = 0; i < 6; i++) gs.push(tier(2.5 - i * 0.37, 2.6 - i * 0.12, 2.3 + i * 1.35, 0.2 + rnd() * 0.03)); }
      else if (kind === 'thuja') gs.push(clump(0.78, 2.7, 0, 2.2, 0, 0.31, 0.24));
      else if (kind === 'far') { gs.push(limb(0.14, 0.24, 3.2, 0, 0, 0, 0, 0, BARK)); gs.push(clump(2.6, 0.85, 0, 4.9, 0, 0.27, 0.29, 7, 5)); gs.push(clump(1.8, 0.8, 1.5, 4.0, 0.7, 0.28, 0.26, 6, 4)); gs.push(clump(1.6, 0.8, -1.2, 5.6, -0.9, 0.26, 0.31, 6, 4)); }
      else if (kind === 'farPoplar') { gs.push(limb(0.14, 0.26, 4, 0, 0, 0, 0, 0, BARK)); gs.push(clump(1.7, 3.3, 0, 8.6, 0, 0.26, 0.26, 7, 6)); }
      else if (kind === 'shrub') { gs.push(clump(0.8, 0.72, 0, 0.5, 0, 0.29, 0.3, 8, 6)); gs.push(clump(0.55, 0.75, 0.5, 0.42, 0.25, 0.27, 0.27, 7, 5)); }
      else if (kind === 'rose') { gs.push(clump(0.75, 0.75, 0, 0.5, 0, 0.3, 0.26, 9, 7, 0.985)); gs.push(clump(0.5, 0.8, -0.45, 0.42, 0.3, 0.3, 0.26, 8, 6, 0.0)); }
      return BGU.mergeBufferGeometries(gs, false);
    }
    function inst(kind, list, cast) { if (!list.length) return; var im = new T.InstancedMesh(species(kind), mVeg, list.length), o = new T.Object3D(), c = new T.Color();
      list.forEach(function (t, n) { var s = t.s || 1, v = 0.84 + rnd() * 0.3; o.position.set(t.x, t.y || 0, t.z); o.scale.set(s, s * (t.sy || 1), s); o.rotation.set(0, t.ry != null ? t.ry : rnd() * 6.283, 0); o.updateMatrix(); im.setMatrixAt(n, o.matrix); im.setColorAt(n, c.setRGB(v * (0.94 + rnd() * 0.12), v, v * (0.88 + rnd() * 0.16))); });
      im.castShadow = !!cast; im.receiveShadow = true; im.frustumCulled = false; im.instanceColor.needsUpdate = true; im.name = 'trees-' + kind; site.add(im); return im; }
    var L = { broad: [], poplar: [], birch: [], young: [], spruce: [], thuja: [], shrub: [], rose: [], far: [], farPoplar: [] }, x, z;
    for (i = 0; i < 6; i++) { L.young.push({ x: PX0 + 1.2, z: -25 + i * 9, y: 0, ry: 0, s: 0.92 + rnd() * 0.2 }); L.young.push({ x: -20 + i * 9, z: PZ1 - 1.2, ry: 0, s: 0.92 + rnd() * 0.2 }); }
    for (i = 0; i < 5; i++) for (a = 0; a < 4; a++) { L[a % 2 ? 'rose' : 'shrub'].push({ x: PX0 + 1.2, z: -22.7 + i * 9 + a * 1.45, y: 0.2, s: 0.75 + rnd() * 0.3 }); L[a % 2 ? 'shrub' : 'rose'].push({ x: -17.7 + i * 9 + a * 1.45, z: PZ1 - 1.2, y: 0.2, s: 0.75 + rnd() * 0.3 }); }
    [[-5.4, -21, 0.62], [-5.6, 5.2, 0.66], [24.6, -20.5, 0.6], [24.8, 4.6, 0.64]].forEach(function (q) { L.broad.push({ x: q[0], z: q[1], y: 0.2, s: q[2] }); });
    [[0.8, -11.4, 0.8], [23.6, -1.2, 0.85], [8, -21.6, 0.75], [16.6, 5.2, 0.8], [-6, -2, 0.7]].forEach(function (q) { L.birch.push({ x: q[0], z: q[1], y: 0.2, s: q[2] }); });
    [[-6.2, -11.2, 0.62], [22.9, -14, 0.7]].forEach(function (q) { L.spruce.push({ x: q[0], z: q[1], y: 0.2, s: q[2] }); });
    for (i = 0; i < 7; i++) L.thuja.push({ x: 6.2 + i * 2, z: -22.6, y: 0.2, s: 0.8 + rnd() * 0.25 });
    for (i = 0; i < 9; i++) L.thuja.push({ x: FX + 0.75, z: -25 + i * 4, y: 0.2, s: 0.7 + rnd() * 0.2 });
    [[-7, -9.8], [-4, -9.9], [1.6, -22.5], [2, -6.2], [-1.5, 6.8], [1.8, 6.6], [6.2, 2.6], [9, 6.6], [12.4, 2.5], [15.4, 6.8], [18.4, 2.6], [22.5, -22.8], [26.6, -17], [22.4, -5.5], [26.8, 1], [22.6, 6.6], [6, -19], [11, -19.2], [17.8, -19], [-7, -15], [-7.2, 0.5], [2.2, -14]].forEach(function (q, n) { L[n % 3 === 1 ? 'rose' : 'shrub'].push({ x: q[0], z: q[1], y: 0.2, s: 0.8 + rnd() * 0.45 }); });
    for (i = 0; i < 6; i++) L[i % 2 ? 'poplar' : 'birch'].push({ x: PX0 + 6 + i * 10.5, z: (PZ0 + FZ) / 2 - 0.3, y: 0.2, s: i % 2 ? 0.82 + rnd() * 0.15 : 0.9 });
    // крупные деревья вокруг участка — немного, но настоящие
    var free = function (x, z, r) { if (x > PX0 - r - 2 && x < DX1 + r + 2 && z > PZ0 - r - 2 && z < PZ1 + r) return false; if (x > RW[0] - r - 3 && x < RW[1] + r + 3) return false; if (z > RS[0] - r - 3 && z < RS[1] + r + 3) return false;
      if (x > sx0 + pitch - 9 || z < sz0 - pitch + 9) return false;
      return !blockRects.some(function (b) { return x > b[0] - r && x < b[1] + r && z > b[2] - r && z < b[3] + r; }); };
    var big = [], tries = 0;
    while (big.length < 26 && tries++ < 4000) { x = -34 + rnd() * 100; z = -66 + rnd() * 96; if (!free(x, z, 3.5)) continue; if (big.some(function (t) { return Math.abs(t.x - x) + Math.abs(t.z - z) < 9; })) continue; big.push({ x: x, z: z }); }
    big.forEach(function (t, n) { var k = n % 6; if (k < 3) L.broad.push({ x: t.x, z: t.z, s: 0.8 + rnd() * 0.45 }); else if (k === 3) L.birch.push({ x: t.x, z: t.z, s: 1 + rnd() * 0.3 }); else if (k === 4) L.poplar.push({ x: t.x, z: t.z, s: 0.85 + rnd() * 0.3 }); else L.spruce.push({ x: t.x, z: t.z, s: 0.8 + rnd() * 0.4 }); });
    cityTrees.forEach(function (t) { var d = Math.sqrt(t[0] * t[0] + t[1] * t[1]); if (d > 560) return; if (d < 150) { var k = rnd(); L[k < 0.6 ? 'broad' : k < 0.8 ? 'poplar' : 'birch'].push({ x: t[0], z: t[1], s: 0.7 + rnd() * 0.5 }); } else L[rnd() < 0.2 ? 'farPoplar' : 'far'].push({ x: t[0], z: t[1], s: 0.8 + rnd() * 0.6, sy: 0.85 + rnd() * 0.4 }); });
    Object.keys(L).forEach(function (k) { inst(k, L[k], k !== 'far' && k !== 'farPoplar'); });
  })();

  // сборка «пакетов» участка
  addMesh(roadG, mRoad, false, 'roads'); addMesh(asphG, mAsph, false, 'asphalt'); addMesh(lineG, mLine, false, 'marking'); addMesh(paveG, mPave, false, 'paving');
  addMesh(kerbG, mKerb, false, 'kerbs'); addMesh(lawnG, mGrass, false, 'lawns'); addMesh(playG, mPlay, false, 'playground'); addMesh(concG, mConc, true, 'rampWalls');

  // фонари (как на рендерах застройщика): тёмная стойка и три стеклянных цилиндра-светильника на разной высоте
  var lampMat = new T.MeshBasicMaterial({ color: 0x8a8a8a }), glowMat, poolMat;
  (function () {
    var spots = [], i, heads = [[0.42, 5.25, 0], [-0.42, 4.55, 0], [0.42, 3.85, 0]];
    for (i = 0; i < 5; i++) { spots.push([PX0 + 1.2, -20.5 + i * 9, 0]); spots.push([-15.5 + i * 9, PZ1 - 1.2, Math.PI / 2]); }
    spots.push([-10.6, -19, 0.6], [-10.6, -5, 0.6], [4.1, -7.5, 0], [20.4, -16.5, 0], [20.4, 0.5, 0], [8, 9.5, 1.57], [EX - 0.7, 22, 0], [EX - 0.7, -1, 0]);
    var metal = [new T.BoxGeometry(0.15, 5.6, 0.15).translate(0, 2.8, 0), new T.BoxGeometry(0.34, 0.3, 0.34).translate(0, 0.15, 0)], glass = [];
    heads.forEach(function (h) { metal.push(new T.BoxGeometry(Math.abs(h[0]), 0.06, 0.08).translate(h[0] / 2, h[1] + 0.34, 0)); metal.push(new T.CylinderGeometry(0.15, 0.15, 0.1, 10).translate(h[0], h[1] + 0.3, 0)); metal.push(new T.CylinderGeometry(0.15, 0.13, 0.07, 10).translate(h[0], h[1] - 0.3, 0)); glass.push(new T.CylinderGeometry(0.125, 0.125, 0.52, 10).translate(h[0], h[1], 0)); });
    var lamps = new T.InstancedMesh(mergeG([mergeG(metal), mergeG(glass)], true), [M({ color: new T.Color(0x1d1e22).convertSRGBToLinear(), roughness: 0.45, metalness: 0.6 }), lampMat], spots.length), o = new T.Object3D(), pts = [];
    var gt = ctex(128, 128, function (g) { var r = g.createRadialGradient(64, 64, 0, 64, 64, 64); r.addColorStop(0, 'rgba(255,220,160,1)'); r.addColorStop(0.2, 'rgba(255,196,120,.55)'); r.addColorStop(0.5, 'rgba(255,176,90,.14)'); r.addColorStop(1, 'rgba(255,170,80,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); });
    glowMat = new T.PointsMaterial({ map: gt, size: 2.3, sizeAttenuation: true, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
    poolMat = new T.MeshBasicMaterial({ map: gt, blending: T.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0, fog: false });
    var pools = new T.InstancedMesh(new T.PlaneGeometry(15, 15).rotateX(-Math.PI / 2), poolMat, spots.length);
    spots.forEach(function (p, n) { o.position.set(p[0], 0.15, p[1]); o.rotation.set(0, p[2], 0); o.scale.set(1, 1, 1); o.updateMatrix(); lamps.setMatrixAt(n, o.matrix);
      heads.forEach(function (h) { pts.push(p[0] + h[0] * Math.cos(p[2]), h[1] + 0.15, p[1] - h[0] * Math.sin(p[2])); });
      o.position.set(p[0], 0.3, p[1]); o.rotation.set(0, 0, 0); o.updateMatrix(); pools.setMatrixAt(n, o.matrix); });
    lamps.castShadow = true; lamps.frustumCulled = false; lamps.name = 'lamps'; pools.frustumCulled = false; pools.renderOrder = 2; pools.name = 'lampPools';
    var pg = new T.BufferGeometry(); pg.setAttribute('position', new T.Float32BufferAttribute(pts, 3)); var glow = new T.Points(pg, glowMat); glow.frustumCulled = false; glow.renderOrder = 3; glow.name = 'lampGlow';
    site.add(lamps, pools, glow);
  })();
  addMesh(props, mProp, true, 'props');

  /* ---------- звёзды, горы, облака ---------- */
  var stars = (function () {
    var n = 900, p = new Float32Array(n * 3), cl = new Float32Array(n * 3);
    for (var i = 0; i < n; i++) { var a = rnd() * 6.283, e = 0.06 + rnd() * 1.45, r = 2600, b = 0.35 + Math.pow(rnd(), 3) * 0.9; p[i * 3] = Math.cos(a) * Math.cos(e) * r; p[i * 3 + 1] = Math.sin(e) * r; p[i * 3 + 2] = Math.sin(a) * Math.cos(e) * r; cl[i * 3] = b; cl[i * 3 + 1] = b * (0.92 + rnd() * 0.1); cl[i * 3 + 2] = b * (0.85 + rnd() * 0.3); }
    var g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(p, 3)); g.setAttribute('color', new T.BufferAttribute(cl, 3));
    var m = new T.Points(g, new T.PointsMaterial({ color: 0xffffff, vertexColors: true, size: 1.8, sizeAttenuation: false, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.frustumCulled = false; scene.add(m); return m;
  })();
  // Кавказский хребет на южном горизонте: три плана, снежные вершины, дымка у подножия
  var mountMat = new T.MeshBasicMaterial({ transparent: true, fog: false, side: T.BackSide, depthWrite: false,
    map: ctex(2048, 256, function (g, W, Hh) {
      var ridge = function (amp, base, seed, top, bot, shade) { var hs = [], x, i, a, n, south, mx = 0;
        for (x = 0; x <= W; x += 2) { a = x / W * 6.283; south = Math.pow(Math.max(0, Math.cos(a)), 0.7);
          n = (1 - Math.abs(sn.noise(Math.cos(a) * 2.2 + seed, Math.sin(a) * 2.2))) * 0.52 + (1 - Math.abs(sn.noise(Math.cos(a) * 6 + seed, Math.sin(a) * 6))) * 0.27 + sn.noise(Math.cos(a) * 16 + seed, Math.sin(a) * 16) * 0.12 + sn.noise(Math.cos(a) * 44, Math.sin(a) * 44 + seed) * 0.07;
          n = south * (base + amp * Math.max(0.08, n)); hs.push(n); if (n > mx) mx = n; }
        g.beginPath(); g.moveTo(0, Hh); for (i = 0; i < hs.length; i++) g.lineTo(i * 2, Hh - hs[i] * Hh); g.lineTo(W, Hh); g.closePath();
        var gr = g.createLinearGradient(0, Hh - mx * Hh, 0, Hh); gr.addColorStop(0, top); gr.addColorStop(0.55, bot); gr.addColorStop(1, bot); g.fillStyle = gr; g.fill();
        if (shade) for (i = 1; i < hs.length - 1; i++) { var sl = (hs[i + 1] - hs[i - 1]) * Hh, al = Math.min(0.55, Math.abs(sl) * 0.22); g.fillStyle = sl > 0 ? 'rgba(255,255,255,' + al + ')' : 'rgba(74,96,140,' + al + ')'; g.fillRect(i * 2, Hh - hs[i] * Hh, 2, hs[i] * Hh * (0.25 + 0.3 * Math.abs(sn.noise(i * 0.05, seed)))); } };
      g.clearRect(0, 0, W, Hh);
      ridge(0.74, 0.1, 1.3, '#ffffff', '#aebdd4', true); ridge(0.4, 0.07, 7.1, '#93a5c0', '#a3b3ca', false); ridge(0.2, 0.05, 13.7, '#7f91aa', '#97a8bf', false);
      g.globalCompositeOperation = 'destination-out'; var fd = g.createLinearGradient(0, Hh * 0.6, 0, Hh * 0.95); fd.addColorStop(0, 'rgba(0,0,0,0)'); fd.addColorStop(1, 'rgba(0,0,0,1)'); g.fillStyle = fd; g.fillRect(0, Hh * 0.66, W, Hh); g.globalCompositeOperation = 'source-over';
    }) });
  var mount = new T.Mesh(new T.CylinderGeometry(1560, 1560, 240, 96, 1, true), mountMat); mount.position.y = 106; mount.renderOrder = -1; mount.name = 'mountains'; scene.add(mount);
  // режим «Облака»: дом над морем облаков
  var clouds = new T.Group(), cloudMats = [], deckMat; scene.add(clouds);
  (function () {
    for (var v = 0; v < 3; v++) {
      var t = ctex(256, 256, function (g) { for (var i = 0; i < 22; i++) { var x = 56 + rnd() * 144, y = 92 + rnd() * 76, r = 30 + rnd() * 50, gr = g.createRadialGradient(x, y - r * 0.25, 0, x, y, r);
        var sh = y > 140 ? '214,224,240' : '255,255,255'; gr.addColorStop(0, 'rgba(' + sh + ',.7)'); gr.addColorStop(0.5, 'rgba(' + sh + ',.3)'); gr.addColorStop(1, 'rgba(' + sh + ',0)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256); } });
      cloudMats.push(new T.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    }
    var add = function (rad, y, size, a) { var s = new T.Sprite(cloudMats[(rnd() * 3) | 0]); s.position.set(Math.cos(a) * rad, y, Math.sin(a) * rad); s.scale.set(size, size * 0.62, 1); s.userData = { y: y, ph: rnd() * 6.3 }; clouds.add(s); };
    for (var i = 0; i < 70; i++) add(105 + rnd() * 420, 6 + rnd() * 10, 130 + rnd() * 140, i / 70 * 6.283 * 3 + rnd() * 0.3);   // «море облаков» вокруг дома
    for (i = 0; i < 20; i++) add(76 + rnd() * 18, 3 + rnd() * 5, 46 + rnd() * 24, i / 20 * 6.283 + rnd() * 0.2);
    for (i = 0; i < 8; i++) add(70 + rnd() * 60, 10 + rnd() * 26, 30 + rnd() * 26, rnd() * 6.283);                             // облака, плывущие мимо этажей
    deckMat = new T.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false, fog: false, map: ctex(512, 512, function (g) { g.clearRect(0, 0, 512, 512); var gr = g.createRadialGradient(256, 256, 0, 256, 256, 256);
      gr.addColorStop(0, 'rgba(240,244,250,0)'); gr.addColorStop(0.035, 'rgba(240,244,250,0)'); gr.addColorStop(0.085, 'rgba(240,244,250,0.96)'); gr.addColorStop(1, 'rgba(246,248,252,1)'); g.fillStyle = gr; g.fillRect(0, 0, 512, 512); }) });
    var deck = new T.Mesh(new T.PlaneGeometry(4400, 4400).rotateX(-Math.PI / 2), deckMat); deck.position.y = 2.6; deck.renderOrder = -2; deck.userData = { y: 2.6, ph: 0, deck: true }; deck.name = 'cloudDeck'; clouds.add(deck);
    clouds.visible = false;
  })();

  /* ---------- режимы ---------- */
  var C = function (h) { return new T.Color(h); }, K = function (r, g, b) { return new T.Color(r, g, b); }, V = function (x, y, z) { return new T.Vector3(x, y, z); };
  var MODES = {
    day: { top: K(0.02, 0.05, 0.12), hor: K(0.74, 0.82, 0.9), bot: K(0.16, 0.17, 0.15), sunC: C(0xfff0dc), sun: 2.5, sunP: V(-120, 135, 150), hemiS: C(0xc4d8ff), hemiG: C(0x77705f), hemi: 0.42, exp: 0.9, win: 0, shop: 0.45, lamp: 0, stars: 0, cloud: 0, env: 1, fogN: 150, fogF: 1150, sh: 0.2,
      cl: K(0.95, 0.95, 0.95), cd: K(0.6, 0.65, 0.72), glow: K(0, 0, 0), mt: K(0.9, 0.94, 1), skyG: 1, scl: 0.8, turb: 2.5, ray: 1.1, mie: 0.004 },
    sunset: { top: K(0.02, 0.03, 0.08), hor: K(0.93, 0.75, 0.63), bot: K(0.13, 0.1, 0.09), sunC: C(0xffb27a), sun: 2.3, sunP: V(-290, 44, 95), hemiS: C(0x9aa6d8), hemiG: C(0x6a5448), hemi: 0.4, exp: 0.95, win: 0.85, shop: 1.2, lamp: 0.55, stars: 0, cloud: 0, env: 1, fogN: 150, fogF: 1100, sh: 0.25,
      cl: K(1, 0.6, 0.4), cd: K(0.42, 0.33, 0.44), glow: K(0, 0, 0), mt: K(1, 0.74, 0.62), skyG: 1, scl: 0.9, turb: 6, ray: 2.6, mie: 0.006 },
    night: { top: K(0.003, 0.006, 0.018), hor: K(0.085, 0.1, 0.17), bot: K(0.006, 0.007, 0.01), sunC: C(0x9db6ff), sun: 0.55, sunP: V(100, 180, 110), hemiS: C(0x4a5f98), hemiG: C(0x15171f), hemi: 0.3, exp: 1.0, win: 1.5, shop: 1.5, lamp: 1, stars: 1, cloud: 0, env: 0.9, fogN: 160, fogF: 1050, sh: 0.3,
      cl: K(0.05, 0.065, 0.11), cd: K(0.015, 0.02, 0.04), glow: K(0.1, 0.055, 0.022), mt: K(0.03, 0.045, 0.08), skyG: 1, scl: 0.55, turb: 2.5, ray: 1.1, mie: 0.004 },
    clouds: { top: K(0.02, 0.05, 0.12), hor: K(0.8, 0.87, 0.96), bot: K(0.8, 0.84, 0.9), sunC: C(0xfff3df), sun: 1.9, sunP: V(-95, 175, 135), hemiS: C(0xe6eeff), hemiG: C(0xb9c0cc), hemi: 0.6, exp: 0.92, win: 0, shop: 0.45, lamp: 0, stars: 0, cloud: 1, env: 1, fogN: 190, fogF: 700, sh: 0,
      cl: K(1, 1, 1), cd: K(0.7, 0.75, 0.82), glow: K(0, 0, 0), mt: K(1, 1, 1), skyG: 1, scl: 0.3, turb: 2, ray: 1, mie: 0.003 }
  };
  var NUM = ['sun', 'hemi', 'exp', 'win', 'shop', 'lamp', 'stars', 'cloud', 'env', 'fogN', 'fogF', 'sh', 'skyG', 'scl', 'turb', 'ray', 'mie'], COL = ['top', 'hor', 'bot', 'sunC', 'hemiS', 'hemiG', 'cl', 'cd', 'glow', 'mt'];
  var cur = {}, goal = MODES.day, mode = 'day', modeT = 0;
  NUM.forEach(function (k) { cur[k] = goal[k]; }); COL.forEach(function (k) { cur[k] = goal[k].clone(); }); cur.sunP = goal.sunP.clone();
  function applyMode() {
    skySet(skyU, cur, false);
    scene.fog.color.copy(cur.hor); scene.fog.near = cur.fogN; scene.fog.far = cur.fogF; mountMat.color.copy(cur.mt); cityMats.forEach(function (m) { m.emissiveIntensity = cur.win * 0.9; });
    sun.color.copy(cur.sunC); sun.intensity = cur.sun; sun.position.copy(cur.sunP);
    hemi.color.copy(cur.hemiS); hemi.groundColor.copy(cur.hemiG); hemi.intensity = cur.hemi;
    renderer.toneMappingExposure = cur.exp;
    for (var k = 1; k <= 3; k++) { var gm = house.mats['glass' + k]; if (gm) gm.emissiveIntensity = cur.win * (k === 3 ? 0.6 : 1); }
    if (house.mats.shop) house.mats.shop.emissiveIntensity = cur.shop;
    shopL[0].intensity = shopL[1].intensity = cur.lamp * 1.3;
    glowMat.opacity = cur.lamp; poolMat.opacity = cur.lamp * 0.3; lampMat.color.setRGB(0.5 + cur.lamp * 1.3, 0.51 + cur.lamp * 0.95, 0.53 + cur.lamp * 0.35);
    stars.material.opacity = cur.stars; stars.visible = cur.stars > 0.01;
    clouds.visible = cur.cloud > 0.01; cloudMats.forEach(function (m) { m.opacity = cur.cloud * 0.95; }); deckMat.opacity = cur.cloud;
    envMats.forEach(function (m) { m.envMapIntensity = m.userData.env * cur.env; });
    modeHooks.forEach(function (f) { f(cur, mode); });
    renderer.shadowMap.needsUpdate = true; dirty = true;
  }
  function setMode(m, instant) {                       // instant — без плавного перехода (например, при запуске)
    if (!MODES[m]) return; mode = m; goal = MODES[m]; modeT = 2.6; envWant = m; document.body.className = document.body.className.replace(/mode-\w+/, 'mode-' + m);
    if (instant) { modeT = 0; NUM.forEach(function (n) { cur[n] = goal[n]; }); COL.forEach(function (n) { cur[n].copy(goal[n]); }); cur.sunP.copy(goal.sunP);
      try { scene.environment = envFor(m); } catch (e) {} envWant = null; applyMode(); shadowKick = 3; }
  }

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
    if (!pickOn) return null;
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
    resizeHooks.forEach(function (f) { f(vw, vh, renderer.getPixelRatio()); });
  }
  function view() { if (inset.cr > 0.5 || inset.cb > 0.5) camera.setViewOffset(vw, vh, inset.cr / 2, inset.cb / 2, vw, vh); else camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  function fly(target, dist, azim, polar) { flying = { t: target.clone(), d: dist, az: azim, po: polar }; }
  function flyStep(dt) {
    if (!flying) return false;
    if (flying.pos) {                                   // свободный перелёт: позиция камеры + точка взгляда
      var kp = 1 - Math.exp(-dt * (flying.speed || 2.6)); camera.position.lerp(flying.pos, kp); controls.target.lerp(flying.t, kp);
      if (camera.position.distanceTo(flying.pos) < 0.08 && controls.target.distanceTo(flying.t) < 0.08) { camera.position.copy(flying.pos); controls.target.copy(flying.t); var cb = flying.cb; flying = null; if (cb) cb(); }
      return true;
    }
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
    if (envWant && modeT < 1.7) { try { scene.environment = envFor(envWant); } catch (e) {} envWant = null; dirty = true; }   // отражения меняем в середине перехода
    if (modeT > 0) { modeT -= dt; var k = 1 - Math.exp(-dt * 3.4);
      NUM.forEach(function (n) { cur[n] += (goal[n] - cur[n]) * k; }); COL.forEach(function (n) { cur[n].lerp(goal[n], k); }); cur.sunP.lerp(goal.sunP, k);
      if (modeT <= 0) { NUM.forEach(function (n) { cur[n] = goal[n]; }); COL.forEach(function (n) { cur[n].copy(goal[n]); }); cur.sunP.copy(goal.sunP); }
      applyMode(); }
    if (Math.abs(inset.r - inset.cr) > 0.5 || Math.abs(inset.b - inset.cb) > 0.5) { var ki = Math.min(1, dt * 7); inset.cr += (inset.r - inset.cr) * ki; inset.cb += (inset.b - inset.cb) * ki; view(); dirty = true; }
    else if (inset.cr !== inset.r || inset.cb !== inset.b) { inset.cr = inset.r; inset.cb = inset.b; view(); dirty = true; }
    if (flyStep(dt)) dirty = true;
    for (var fh = 0; fh < frameHooks.length; fh++) if (frameHooks[fh](dt, t)) dirty = true;
    if (zoneAnim(dt)) dirty = true;
    controls.update();
    if (clouds.visible) { clouds.rotation.y += dt * 0.012; var ch = clouds.children; for (var i = 0; i < ch.length; i++) if (!ch[i].userData.deck) ch[i].position.y = ch[i].userData.y + Math.sin(t / 2600 + ch[i].userData.ph) * 0.9; dirty = true; }
    if (controls.autoRotate) dirty = true;
    if (shadowKick > 0) { shadowKick--; renderer.shadowMap.needsUpdate = true; dirty = true; }   // первые кадры: тени пересчитать наверняка
    if (dirty) { dirty = false; ctx.render(); }
  }

  /* ---------- ctx: всё, что нужно модулям (js/cars.js, parking.js, interior.js, fx.js) ---------- */
  var LIM0 = { minDistance: controls.minDistance, maxDistance: controls.maxDistance, minPolarAngle: controls.minPolarAngle, maxPolarAngle: controls.maxPolarAngle, enableZoom: true, enableRotate: true, rotateSpeed: controls.rotateSpeed };
  var offList = ((location.search.match(/[?&]off=([^&]*)/) || [])[1] || '').split(',');
  ctx = {
    T: T, scene: scene, camera: camera, renderer: renderer, controls: controls, canvas: canvas, app: app,
    house: house, houseRoot: houseRoot, site: site, sun: sun, hemi: hemi, sky: sky, clouds: clouds, zones: zones,
    cur: cur, MODES: MODES, mode: function () { return mode; },
    dims: { HX: HX, HZ: HZ, P0: P0, P1: P1, H: H, GH: S.groundH, FH: S.floorH, floors: S.floors, PX0: PX0, PX1: PX1, PZ0: PZ0, PZ1: PZ1, RW: RW, RS: RS, CX0: CX0, CX1: CX1, CZ0: CZ0, CZ1: CZ1 },
    M: M, ctex: ctex, rnd: rnd,
    enabled: function (name) { return offList.indexOf(name) < 0 && offList.indexOf('all') < 0; },
    onFrame: function (f) { frameHooks.push(f); }, onMode: function (f) { modeHooks.push(f); f(cur, mode); }, onResize: function (f) { resizeHooks.push(f); f(vw, vh, renderer.getPixelRatio()); },
    dirty: function () { dirty = true; }, shadows: function () { shadowKick = 3; dirty = true; },
    render: function () { renderer.render(scene, camera); },                       // fx.js подменяет на рендер с эффектами
    size: function () { return { w: vw, h: vh }; },
    fly: fly, home: home, homeDist: homeDist,
    flyTo: function (pos, target, cb, speed) { controls.autoRotate = false; flying = { pos: pos.clone(), t: target.clone(), cb: cb, speed: speed }; dirty = true; },
    stopFly: function () { flying = null; },
    limits: function (o) { var k; o = o || LIM0; for (k in LIM0) if (o[k] !== undefined) controls[k] = o[k]; else if (o === LIM0) controls[k] = LIM0[k]; dirty = true; },
    picking: function (on) { pickOn = !!on; if (!on && hovered) { hovered = null; } dirty = true; },
    select: select,
    // дополнительно (новое): рампа паркинга и карта окружения режима
    ramp: { x0: RAMP.x0, x1: RAMP.x1, z0: RAMP.z0, z1: RAMP.z1, depth: RAMP.depth, group: rampGroup }, envFor: function (m) { return envFor(MODES[m] ? m : mode); }, setMode: setMode
  };

  resize(); home(true); applyMode();
  try { scene.environment = envFor('day'); } catch (e) { if (window.console) console.warn('env', e); }
  loadModel(function () {
    requestAnimationFrame(frame);
    setTimeout(function () { document.getElementById('load').classList.add('is-off'); }, 250);
  });

  return {
    setMode: setMode, mode: function () { return mode; }, select: select, home: home, setInset: setInset,
    autoRotate: function (on) { controls.autoRotate = !!on; dirty = true; },
    on: function (n, f) { listeners[n].push(f); },
    floors: S.floors, ctx: ctx, _dbg: { scene: scene, renderer: renderer, camera: camera, sun: sun, hemi: hemi, render: function () { ctx.render(); } }
  };
})();
