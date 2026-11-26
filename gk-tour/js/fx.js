/* Пост-обработка «как рендер»: сглаживание, мягкие контактные тени (AO), свечение окон и фонарей,
   финальная цветокоррекция (контраст, тёплые света / холодные тени, виньетка, тонкое зерно).
   Наружу: window.GKFx = { setQuality('high'|'low'|'off'), quality(), label(), stats(), bench(n), params, apply(), setTiltShift(v), auto(on) }.

   Цвет: сцена рисуется В ТОЧНОСТИ так же, как на экран (ACES + sRGB внутри материалов), только в буфер
   с 4x MSAA. Поэтому яркость/насыщенность совпадают с обычным рендером по построению, а небо и спрайты
   с toneMapped:false не «проваливаются». Все эффекты считаются в линейном свете (декодирование sRGB в шейдере)
   и в конце кодируются обратно. Глубина для AO берётся из того же прохода (DepthTexture 24 бит) —
   сцена рисуется ОДИН раз. */
(function () {
  'use strict';
  var LABELS = { high: 'Качество: высокое', low: 'Качество: среднее', off: 'Качество: без эффектов' };
  function stub() {
    window.GKFx = { available: false, setQuality: function () { return 'off'; }, quality: function () { return 'off'; },
      label: function () { return LABELS.off; }, stats: function () { return { quality: 'off', available: false }; },
      bench: function () { return 0; }, params: {}, apply: function () {}, setTiltShift: function () {}, auto: function () { return false; } };
  }
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('fx') || !window.THREE) { stub(); return; }

  var ctx = GKScene.ctx, T = ctx.T, renderer = ctx.renderer, scene = ctx.scene, camera = ctx.camera;
  var gl = renderer.getContext(), caps = renderer.capabilities, ext = renderer.extensions;
  var plainRender = ctx.render;
  var qs = location.search || '';

  /* ---------- возможности устройства ---------- */
  var isGL2 = !!caps.isWebGL2;
  var canDepth = isGL2 || ext.has('WEBGL_depth_texture');            // без 24-битной глубины эффекты не включаем
  var canMSAA = isGL2 && !!T.WebGLMultisampleRenderTarget && !/[?&]fxmsaa=0/.test(qs);
  var canFloat = isGL2 && ext.has('EXT_color_buffer_float');         // HalfFloat — только маленьким буферам свечения
  var rname = '';
  try { var dbg = gl.getExtension('WEBGL_debug_renderer_info'); rname = String(dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { rname = ''; }
  var software = /swiftshader|llvmpipe|softpipe|software/i.test(rname);
  var ua = navigator.userAgent || '';
  var mobile = /Android|iPhone|iPad|iPod|Mobile|Silk/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  var weak = mobile || (navigator.deviceMemory && navigator.deviceMemory <= 4) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);

  /* ---------- настройки (можно крутить вживую: GKFx.params.… затем GKFx.apply()) ---------- */
  var P = {
    ao: { samples: 12, intensity: 5.2, bias: 0.09, radiusK: 0.011, rMin: 0.3, rMax: 2.2, protectDay: 0.55, protectNight: 0.9, maxPx: 0.11, fadeNear: 380, fadeFar: 950, day: 1.0, night: 0.7, tint: [0.045, 0.04, 0.06] },
    bloom: { day: 0.12, night: 0.75, thrDay: 0.84, thrNight: 0.42, knee: 0.16, scatter: 0.56 },
    grade: { contrast: 0.16, contrastNight: 0.11, saturation: 1.05, tone: 1.0, vignette: 0.15, grain: 0.018, grainAnimated: true, ca: 0.0032 },
    tilt: 0, tiltFocus: 0.5, debug: ''
  };

  /* ---------- шейдеры ---------- */
  var VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  var G_COL = [
    'vec3 toLin(vec3 c){ c = max(c, vec3(0.0)); return mix(pow(c * 0.9478672986 + 0.0521327014, vec3(2.4)), c * 0.0773993808, vec3(lessThanEqual(c, vec3(0.04045)))); }',
    'vec3 toSRGB(vec3 c){ c = max(c, vec3(0.0)); return mix(pow(c, vec3(0.41666)) * 1.055 - 0.055, c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308)))); }'
  ].join('\n');
  var G_BENC = [
    '#ifdef BYTE',
    '  #define BENC(c) sqrt(clamp(c, 0.0, 1.0))',
    '  #define BDEC(c) ((c) * (c))',
    '#else',
    '  #define BENC(c) min(c, vec3(32.0))',
    '  #define BDEC(c) (c)',
    '#endif'
  ].join('\n');
  var G_DEPTH = [
    'uniform vec2 uNF;',
    'float vz(float d){ return (uNF.x * uNF.y) / ((uNF.y - uNF.x) * d - uNF.y); }',
    'float key(vec3 k){ return dot(k, vec3(1.0, 0.00392156863, 0.0000153787005)); }'
  ].join('\n');

  // AO: затенённость по глубине (нормаль восстанавливается из глубины), спираль Фогеля + шум по пикселю
  var FS_AO = [
    'uniform sampler2D tDepth; uniform vec2 uDTexel; uniform vec2 uATexel; uniform vec4 uProj;',
    'uniform float uRadius; uniform float uProjScale; uniform float uMaxPx; uniform float uIntensity; uniform float uBias; uniform vec2 uFade;',
    'varying vec2 vUv;',
    G_DEPTH,
    'vec3 vpos(vec2 uv, float d){ float z = vz(d); return vec3(-z * (uv.x * 2.0 - 1.0 + uProj.z) / uProj.x, -z * (uv.y * 2.0 - 1.0 + uProj.w) / uProj.y, z); }',
    'vec3 pack24(float v){ vec3 r = fract(v * vec3(1.0, 255.0, 65025.0)); r.xy -= r.yz / 255.0; return r; }',
    'void main(){',
    '  float d = texture2D(tDepth, vUv).x;',
    '  if (d >= 0.99999) { gl_FragColor = vec4(1.0); return; }',
    '  vec3 P = vpos(vUv, d);',
    '  vec2 dx = vec2(uDTexel.x, 0.0), dy = vec2(0.0, uDTexel.y);',
    '  float dl = texture2D(tDepth, vUv - dx).x, dr = texture2D(tDepth, vUv + dx).x, db = texture2D(tDepth, vUv - dy).x, dt = texture2D(tDepth, vUv + dy).x;',
    '  vec3 ddx = abs(dl - d) < abs(dr - d) ? P - vpos(vUv - dx, dl) : vpos(vUv + dx, dr) - P;',
    '  vec3 ddy = abs(db - d) < abs(dt - d) ? P - vpos(vUv - dy, db) : vpos(vUv + dy, dt) - P;',
    '  vec3 n = normalize(cross(ddx, ddy));',
    '  float zl = -P.z;',
    '  float rpx = clamp(uRadius * uProjScale / zl, 2.0, uMaxPx);',
    '  float rw = rpx * zl / uProjScale;',
    '  float invR2 = 1.0 / (rw * rw);',
    '  float ang = 6.2831853 * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));',
    '  float occ = 0.0;',
    '  for (int i = 0; i < NS; i++) {',
    '    float fi = float(i) + 0.5;',
    '    float th = fi * 2.3999632 + ang;',
    '    vec2 suv = vUv + vec2(cos(th), sin(th)) * (sqrt(fi / float(NS)) * rpx) * uATexel;',
    '    vec3 v = vpos(suv, texture2D(tDepth, suv).x) - P;',
    '    float vv = dot(v, v);',
    '    float f = max(1.0 - vv * invR2, 0.0);',
    '    occ += f * max((dot(v, n) - 0.0005 * zl) * inversesqrt(vv + 1e-6) - uBias, 0.0);',
    '  }',
    '  float ao = clamp(1.0 - occ / float(NS) * uIntensity, 0.0, 1.0);',
    '  ao = mix(ao, 1.0, smoothstep(uFade.x, uFade.y, zl));',
    '  gl_FragColor = vec4(ao, pack24(min(zl / uNF.y, 0.99999)));',
    '}'
  ].join('\n');

  // размытие AO вдоль одной оси с учётом глубины И наклона поверхности (ореолов на краях нет)
  var FS_AOBLUR = [
    'uniform sampler2D tAO; uniform vec2 uDir;',
    'varying vec2 vUv;',
    G_DEPTH,
    'void main(){',
    '  vec4 c = texture2D(tAO, vUv); float z0 = key(c.gba);',
    '  if (z0 >= 0.9999) { gl_FragColor = c; return; }',
    '  vec4 a = texture2D(tAO, vUv + uDir), b = texture2D(tAO, vUv - uDir);',
    '  float za = key(a.gba), zb = key(b.gba);',
    '  float sl = abs(za - z0) < abs(z0 - zb) ? za - z0 : z0 - zb;',
    '  float tol = 1.0 / (z0 * 0.002 + 0.0000004);',
    '  float w, s = c.r, ws = 1.0;',
    '  w = 0.90 * max(0.0, 1.0 - abs(za - z0 - sl) * tol); s += a.r * w; ws += w;',
    '  w = 0.90 * max(0.0, 1.0 - abs(zb - z0 + sl) * tol); s += b.r * w; ws += w;',
    '  for (int i = 2; i <= 4; i++) {',
    '    float fi = float(i); float g = exp(-fi * fi * 0.105);',
    '    a = texture2D(tAO, vUv + uDir * fi); b = texture2D(tAO, vUv - uDir * fi);',
    '    w = g * max(0.0, 1.0 - abs(key(a.gba) - z0 - sl * fi) * tol); s += a.r * w; ws += w;',
    '    w = g * max(0.0, 1.0 - abs(key(b.gba) - z0 + sl * fi) * tol); s += b.r * w; ws += w;',
    '  }',
    '  gl_FragColor = vec4(s / ws, c.gba);',
    '}'
  ].join('\n');

  // свечение: выделение ярких мест (мягкий порог, усреднение с весами против мерцания)
  var FS_BRIGHT = [
    'uniform sampler2D tScene; uniform vec2 uTexel; uniform float uThr; uniform float uKnee;',
    'varying vec2 vUv;',
    G_COL, G_BENC,
    'void main(){',
    '  vec3 a = toLin(texture2D(tScene, vUv + uTexel * vec2(-1.0, -1.0)).rgb), b = toLin(texture2D(tScene, vUv + uTexel * vec2(1.0, -1.0)).rgb);',
    '  vec3 c = toLin(texture2D(tScene, vUv + uTexel * vec2(-1.0, 1.0)).rgb), d = toLin(texture2D(tScene, vUv + uTexel * vec2(1.0, 1.0)).rgb);',
    '  vec3 L = vec3(0.2126, 0.7152, 0.0722);',
    '  float wa = 1.0 / (1.0 + dot(a, L)), wb = 1.0 / (1.0 + dot(b, L)), wc = 1.0 / (1.0 + dot(c, L)), wd = 1.0 / (1.0 + dot(d, L));',
    '  vec3 m = (a * wa + b * wb + c * wc + d * wd) / (wa + wb + wc + wd);',
    '  float l = max(m.r, max(m.g, m.b));',
    '  float soft = clamp(l - uThr + uKnee, 0.0, 2.0 * uKnee); soft = soft * soft / (4.0 * uKnee + 0.0001);',
    '  m *= max(soft, l - uThr) / max(l, 0.0001);',
    '  gl_FragColor = vec4(BENC(m), 1.0);',
    '}'
  ].join('\n');
  var FS_DOWN = [
    'uniform sampler2D tSrc; uniform vec2 uTexel;',
    'varying vec2 vUv;',
    G_BENC,
    'void main(){',
    '  vec3 s = BDEC(texture2D(tSrc, vUv).rgb) * 4.0;',
    '  s += BDEC(texture2D(tSrc, vUv + uTexel).rgb) + BDEC(texture2D(tSrc, vUv - uTexel).rgb);',
    '  s += BDEC(texture2D(tSrc, vUv + vec2(uTexel.x, -uTexel.y)).rgb) + BDEC(texture2D(tSrc, vUv - vec2(uTexel.x, -uTexel.y)).rgb);',
    '  s *= 0.125;',
    '  gl_FragColor = vec4(BENC(s), 1.0);',
    '}'
  ].join('\n');
  var FS_UP = [
    'uniform sampler2D tSrc; uniform sampler2D tBase; uniform vec2 uTexel; uniform float uScatter;',
    'varying vec2 vUv;',
    G_BENC,
    'void main(){',
    '  vec2 h = uTexel * 0.5;',
    '  vec3 s = BDEC(texture2D(tSrc, vUv + vec2(-h.x * 2.0, 0.0)).rgb) + BDEC(texture2D(tSrc, vUv + vec2(h.x * 2.0, 0.0)).rgb);',
    '  s += BDEC(texture2D(tSrc, vUv + vec2(0.0, h.y * 2.0)).rgb) + BDEC(texture2D(tSrc, vUv + vec2(0.0, -h.y * 2.0)).rgb);',
    '  s += (BDEC(texture2D(tSrc, vUv + vec2(-h.x, h.y)).rgb) + BDEC(texture2D(tSrc, vUv + h).rgb)) * 2.0;',
    '  s += (BDEC(texture2D(tSrc, vUv + vec2(h.x, -h.y)).rgb) + BDEC(texture2D(tSrc, vUv - h).rgb)) * 2.0;',
    '  s /= 12.0;',
    '  s = mix(BDEC(texture2D(tBase, vUv).rgb), s, uScatter);',
    '  gl_FragColor = vec4(BENC(s), 1.0);',
    '}'
  ].join('\n');

  // финал: AO + свечение + цветокоррекция + виньетка + зерно (один проход на экран)
  var FS_GRADE = [
    'uniform sampler2D tScene; uniform sampler2D tBloom; uniform sampler2D tAO; uniform sampler2D tDepth;',
    'uniform vec2 uASize; uniform vec2 uTexel; uniform vec3 uAOTint;',
    'uniform float uAO; uniform float uProt; uniform float uBloom; uniform float uVig; uniform float uGrain; uniform float uSeed; uniform float uContrast; uniform float uSat; uniform float uCA; uniform float uTilt; uniform float uFocus; uniform float uTone;',
    'varying vec2 vUv;',
    G_COL, G_BENC, G_DEPTH,
    'float h12(vec2 p){ vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }',
    'void main(){',
    '  vec2 cc = vUv - 0.5;',
    '#ifdef TILT',
    '  float br = uTilt * smoothstep(0.08, 0.5, abs(vUv.y - uFocus));',
    '  vec3 e = texture2D(tScene, vUv).rgb * 2.0;',
    '  for (int i = 0; i < 8; i++) { float an = float(i) * 0.7853982 + 0.39; float rr = mod(float(i), 2.0) < 0.5 ? 1.0 : 0.55; e += texture2D(tScene, vUv + vec2(cos(an), sin(an)) * rr * br * uTexel).rgb; }',
    '  e *= 0.1;',
    '#else',
    '  #ifdef CA',
    '  vec2 off = cc * dot(cc, cc) * uCA;',
    '  vec3 e = vec3(texture2D(tScene, vUv + off).r, texture2D(tScene, vUv).g, texture2D(tScene, vUv - off).b);',
    '  #else',
    '  vec3 e = texture2D(tScene, vUv).rgb;',
    '  #endif',
    '#endif',
    '  vec3 col = toLin(e);',
    '#ifdef AO',
    '  float d = texture2D(tDepth, vUv).x; float aoV = 1.0;',
    '  if (d < 0.99999) {',
    '    float z0 = -vz(d) / uNF.y;',
    '    vec2 p = vUv * uASize - 0.5; vec2 f = fract(p); vec2 t = 1.0 / uASize; vec2 b = (floor(p) + 0.5) * t;',
    '    vec4 a00 = texture2D(tAO, b), a10 = texture2D(tAO, b + vec2(t.x, 0.0)), a01 = texture2D(tAO, b + vec2(0.0, t.y)), a11 = texture2D(tAO, b + t);',
    '    vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y) + 0.01;',
    '    w *= max(vec4(0.0), 1.0 - abs(vec4(key(a00.gba), key(a10.gba), key(a01.gba), key(a11.gba)) - z0) / (z0 * 0.004 + 0.0000004)) + 0.002;',
    '    float ao = dot(w, vec4(a00.r, a10.r, a01.r, a11.r)) / dot(w, vec4(1.0)); aoV = ao;',
    '    float l0 = dot(col, vec3(0.2126, 0.7152, 0.0722));',
    '    ao = mix(ao, 1.0, smoothstep(0.72, 1.0, l0) * uProt);',                                  // блики и горящие окна не пачкаем
    '    vec3 alb = clamp(col, 0.0, 1.0);',                                                      // «многократное отражение»: на светлом тень мягче
    '    vec3 mb = max(vec3(ao), ((ao * (2.0404 * alb - 0.3324) + (0.6417 - 4.7951 * alb)) * ao + (2.7552 * alb + 0.6903)) * ao);',
    '    col *= mix(vec3(1.0), mix(uAOTint, vec3(1.0), mix(vec3(ao), mb, 0.65)), uAO);',
    '  }',
    '  #ifdef DEBUG_AO',
    '  gl_FragColor = vec4(vec3(aoV), 1.0); return;',
    '  #endif',
    '#endif',
    '#ifdef BLOOM',
    '  vec3 bl = min(BDEC(texture2D(tBloom, vUv).rgb) * uBloom, vec3(1.0));',
    '  col = min(col, vec3(1.0)); col += bl * (1.0 - col);',
    '  #ifdef DEBUG_BLOOM',
    '  gl_FragColor = vec4(toSRGB(bl), 1.0); return;',
    '  #endif',
    '#endif',
    '  vec3 g = toSRGB(min(col, vec3(1.0)));',
    '  g = mix(g, g * g * (3.0 - 2.0 * g), uContrast);',                                          // плёночная S-кривая, середина не сдвигается
    '  float lum = dot(g, vec3(0.299, 0.587, 0.114));',
    '  g += uTone * (vec3(-0.010, 0.000, 0.014) * (1.0 - smoothstep(0.0, 0.5, lum)) + vec3(0.012, 0.005, -0.010) * smoothstep(0.5, 1.0, lum));',
    '  g = mix(vec3(lum), g, uSat);',
    '  g *= 1.0 - uVig * smoothstep(0.4, 1.0, length(cc) * 1.41421);',
    '  vec2 gp = gl_FragCoord.xy + uSeed * vec2(17.0, 59.0);',
    '  g += (h12(gp) + h12(gp + 71.37) - 1.0) * uGrain * (1.0 - 0.55 * lum);',
    '  gl_FragColor = vec4(g, 1.0);',
    '}'
  ].join('\n');

  /* ---------- полноэкранный треугольник ---------- */
  var qGeo = new T.BufferGeometry();
  qGeo.setAttribute('position', new T.Float32BufferAttribute([-1, 3, 0, -1, -1, 0, 3, -1, 0], 3));
  qGeo.setAttribute('uv', new T.Float32BufferAttribute([0, 2, 0, 0, 2, 0], 2));
  var qMesh = new T.Mesh(qGeo, null); qMesh.frustumCulled = false;
  var qScene = new T.Scene(); qScene.add(qMesh);
  var qCam = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  function mat(fs, uniforms, defines) {
    return new T.ShaderMaterial({ vertexShader: VS, fragmentShader: fs, uniforms: uniforms, defines: defines || {},
      depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false, fog: false });
  }
  function pass(m, target) { qMesh.material = m; renderer.setRenderTarget(target); renderer.render(qScene, qCam); }

  /* ---------- состояние ---------- */
  var quality = 'off', autoOn = false, broken = !canDepth, useMSAA = canMSAA;
  var vw = 2, vh = 2, basePR = 1, W = 2, H = 2, pr = 1;
  var R = null, M = null, aoOn = false, bloomOn = false, glow = 0;
  var tick = 0, lastTick = -9, lastNow = 0, nSamp = 0, nEval = 0, ema = null, cpuMs = 0, frames = 0, pending = null, lastInfo = { calls: 0, triangles: 0 };

  function v2(x, y) { return { value: new T.Vector2(x || 0, y || 0) }; }
  function f1(x) { return { value: x || 0 }; }
  function tx() { return { value: null }; }
  function rt(w, h, type, filter) {
    var t = new T.WebGLRenderTarget(Math.max(2, w), Math.max(2, h), { minFilter: filter || T.LinearFilter, magFilter: filter || T.LinearFilter,
      format: T.RGBAFormat, type: type || T.UnsignedByteType, depthBuffer: false, stencilBuffer: false });
    t.texture.generateMipmaps = false; return t;
  }
  function sceneTarget(w, h, msaa) {
    var o = { minFilter: T.LinearFilter, magFilter: T.LinearFilter, format: T.RGBAFormat, type: T.UnsignedByteType, depthBuffer: true, stencilBuffer: false };
    var t = msaa ? new T.WebGLMultisampleRenderTarget(w, h, o) : new T.WebGLRenderTarget(w, h, o);
    if (msaa) t.samples = Math.min(4, caps.maxSamples || 4);
    t.texture.encoding = T.sRGBEncoding;                       // материалы пишут в буфер то же, что писали бы на экран
    t.texture.generateMipmaps = false;
    t.depthTexture = new T.DepthTexture(w, h, T.UnsignedIntType);   // 24 бита: и для AO, и чтобы не было z-fighting
    return t;
  }
  function freeTargets() {
    if (!R) return;
    var all = [R.scene, R.aa, R.ao, R.aoB].concat(R.bd || [], R.bu || []);
    all.forEach(function (t) { if (t) { if (t.depthTexture) t.depthTexture.dispose(); t.dispose(); } });
    R = null;
  }
  function freeMats() { if (!M) return; for (var k in M) if (M[k] && M[k].dispose) M[k].dispose(); M = null; }

  // проверка, что буфер с MSAA и текстурой глубины реально работает на этом устройстве
  function probe(msaa) {
    var ok = false, t = null;
    try {
      t = sceneTarget(8, 8, msaa);
      while (gl.getError() !== gl.NO_ERROR) { /* сбрасываем старые ошибки */ }
      renderer.setRenderTarget(t);
      var st = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
      qMesh.material = probeMat; renderer.render(qScene, qCam);
      ok = st === gl.FRAMEBUFFER_COMPLETE && gl.getError() === gl.NO_ERROR;
    } catch (e) { ok = false; }
    renderer.setRenderTarget(null);
    if (t) { t.depthTexture.dispose(); t.dispose(); }
    return ok;
  }
  var probeMat = mat('void main(){ gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); }', {});

  function build() {
    freeTargets(); freeMats();
    if (quality === 'off') return;
    pr = Math.min(basePR, quality === 'high' ? 1.5 : 1);
    W = Math.max(2, Math.round(vw * pr)); H = Math.max(2, Math.round(vh * pr));
    aoOn = quality === 'high'; bloomOn = true;
    var hf = canFloat ? T.HalfFloatType : T.UnsignedByteType, i, w, h;
    R = { scene: sceneTarget(W, H, useMSAA), aa: useMSAA ? null : rt(W, H), bd: [], bu: [] };
    if (aoOn) {
      var s = Math.max(0.5, Math.min(1, 1 / pr));               // AO считаем примерно в «CSS-пикселях»
      w = Math.round(W * s); h = Math.round(H * s);
      R.ao = rt(w, h, T.UnsignedByteType, T.NearestFilter); R.aoB = rt(w, h, T.UnsignedByteType, T.NearestFilter);
    }
    var div = quality === 'high' ? 2 : 4, levels = quality === 'high' ? 5 : 4;
    for (i = 0; i < levels; i++) {
      w = Math.max(2, Math.round(W / div / Math.pow(2, i))); h = Math.max(2, Math.round(H / div / Math.pow(2, i)));
      R.bd.push(rt(w, h, hf)); if (i < levels - 1) R.bu.push(rt(w, h, hf));
    }
    var bdef = canFloat ? {} : { BYTE: 1 }, gdef = { BLOOM: 1 };
    if (!canFloat) gdef.BYTE = 1;
    if (aoOn) gdef.AO = 1;
    if (P.debug === 'ao' && aoOn) gdef.DEBUG_AO = 1; if (P.debug === 'bloom') gdef.DEBUG_BLOOM = 1;   // отладка: GKFx.params.debug = 'ao' | 'bloom'; GKFx.apply()
    if (P.tilt > 0) gdef.TILT = 1; else if (quality === 'high' && P.grade.ca > 0) gdef.CA = 1;
    M = {
      ao: aoOn ? mat(FS_AO, { tDepth: tx(), uDTexel: v2(), uATexel: v2(), uProj: { value: new T.Vector4() }, uNF: v2(1, 1000), uRadius: f1(1), uProjScale: f1(1), uMaxPx: f1(40), uIntensity: f1(1), uBias: f1(0.1), uFade: v2() }, { NS: P.ao.samples | 0 }) : null,
      blur: aoOn ? mat(FS_AOBLUR, { tAO: tx(), uDir: v2(), uNF: v2(1, 1000) }) : null,
      bright: mat(FS_BRIGHT, { tScene: tx(), uTexel: v2(), uThr: f1(0.9), uKnee: f1(0.2) }, bdef),
      down: mat(FS_DOWN, { tSrc: tx(), uTexel: v2() }, bdef),
      up: mat(FS_UP, { tSrc: tx(), tBase: tx(), uTexel: v2(), uScatter: f1(0.6) }, bdef),
      grade: mat(FS_GRADE, { tScene: tx(), tBloom: tx(), tAO: tx(), tDepth: tx(), uASize: v2(1, 1), uTexel: v2(), uAOTint: { value: new T.Vector3() }, uNF: v2(1, 1000),
        uAO: f1(1), uProt: f1(0.5), uBloom: f1(0), uVig: f1(0), uGrain: f1(0), uSeed: f1(0), uContrast: f1(0), uSat: f1(1), uCA: f1(0), uTilt: f1(0), uFocus: f1(0.5), uTone: f1(1) }, gdef),
      fxaa: null
    };
    if (!useMSAA && T.FXAAShader) {
      M.fxaa = new T.ShaderMaterial({ uniforms: T.UniformsUtils.clone(T.FXAAShader.uniforms), vertexShader: T.FXAAShader.vertexShader, fragmentShader: T.FXAAShader.fragmentShader,
        depthTest: false, depthWrite: false, blending: T.NoBlending, toneMapped: false, fog: false });
      M.fxaa.uniforms.resolution.value.set(1 / W, 1 / H);
    }
    applyParams();
  }

  // настройки → uniform'ы (всё, что не меняется каждый кадр)
  function applyParams() {
    if (!M) return;
    var g = M.grade.uniforms, G = P.grade, k = Math.max(0, Math.min(1, glow));
    g.uVig.value = G.vignette; g.uGrain.value = G.grain; g.uContrast.value = G.contrast + (G.contrastNight - G.contrast) * k; g.uSat.value = G.saturation; g.uCA.value = G.ca; g.uTone.value = G.tone;
    g.uTilt.value = P.tilt; g.uFocus.value = P.tiltFocus; g.uTexel.value.set(1 / W, 1 / H);
    g.uAOTint.value.set(P.ao.tint[0], P.ao.tint[1], P.ao.tint[2]);
    g.uAO.value = P.ao.day + (P.ao.night - P.ao.day) * k; g.uProt.value = P.ao.protectDay + (P.ao.protectNight - P.ao.protectDay) * k;
    g.uBloom.value = P.bloom.day + (P.bloom.night - P.bloom.day) * k;
    M.bright.uniforms.uThr.value = P.bloom.thrDay + (P.bloom.thrNight - P.bloom.thrDay) * k;
    M.bright.uniforms.uKnee.value = P.bloom.knee;
    M.up.uniforms.uScatter.value = P.bloom.scatter;
    if (M.ao) { var a = M.ao.uniforms; a.uIntensity.value = P.ao.intensity; a.uBias.value = P.ao.bias; a.uFade.value.set(P.ao.fadeNear, P.ao.fadeFar); }
  }

  /* ---------- кадр с эффектами ---------- */
  function fxRender() {
    if (!R || !M) { plainRender(); return; }
    var t0 = performance.now(), info = renderer.info, ar = info.autoReset, i, n, u;
    try {
      info.autoReset = false; info.reset();
      // 1. сцена — один раз, со сглаживанием и глубиной
      renderer.setRenderTarget(R.scene); renderer.render(scene, camera);
      var sceneTex = R.scene.texture, depthTex = R.scene.depthTexture;
      if (R.aa && M.fxaa) { M.fxaa.uniforms.tDiffuse.value = sceneTex; pass(M.fxaa, R.aa); sceneTex = R.aa.texture; }
      // 2. контактные тени
      if (aoOn) {
        var pe = camera.projectionMatrix.elements, dist = camera.position.distanceTo(ctx.controls.target);
        u = M.ao.uniforms;
        u.tDepth.value = depthTex; u.uDTexel.value.set(1 / W, 1 / H); u.uATexel.value.set(1 / R.ao.width, 1 / R.ao.height);
        u.uProj.value.set(pe[0], pe[5], pe[8], pe[9]); u.uNF.value.set(camera.near, camera.far);
        u.uRadius.value = Math.max(P.ao.rMin, Math.min(P.ao.rMax, dist * P.ao.radiusK));          // радиус в метрах — от дистанции камеры
        u.uProjScale.value = pe[5] * 0.5 * R.ao.height; u.uMaxPx.value = P.ao.maxPx * R.ao.height;
        pass(M.ao, R.ao);
        u = M.blur.uniforms; u.uNF.value.set(camera.near, camera.far);
        u.tAO.value = R.ao.texture; u.uDir.value.set(1 / R.ao.width, 0); pass(M.blur, R.aoB);
        u.tAO.value = R.aoB.texture; u.uDir.value.set(0, 1 / R.ao.height); pass(M.blur, R.ao);
      }
      // 3. свечение: яркое → цепочка уменьшений → цепочка увеличений
      if (bloomOn) {
        n = R.bd.length;
        u = M.bright.uniforms; u.tScene.value = sceneTex; var k = quality === 'high' ? 0.5 : 1.0; u.uTexel.value.set(k / W, k / H);
        pass(M.bright, R.bd[0]);
        u = M.down.uniforms;
        for (i = 1; i < n; i++) { u.tSrc.value = R.bd[i - 1].texture; u.uTexel.value.set(1 / R.bd[i - 1].width, 1 / R.bd[i - 1].height); pass(M.down, R.bd[i]); }
        u = M.up.uniforms;
        var src = R.bd[n - 1];
        for (i = n - 2; i >= 0; i--) { u.tSrc.value = src.texture; u.tBase.value = R.bd[i].texture; u.uTexel.value.set(1 / src.width, 1 / src.height); pass(M.up, R.bu[i]); src = R.bu[i]; }
      }
      // 4. финал на экран
      u = M.grade.uniforms;
      u.tScene.value = sceneTex; u.tBloom.value = bloomOn ? R.bu[0].texture : null;
      if (aoOn) { u.tAO.value = R.ao.texture; u.tDepth.value = depthTex; u.uASize.value.set(R.ao.width, R.ao.height); u.uNF.value.set(camera.near, camera.far); }
      u.uSeed.value = P.grade.grainAnimated ? Math.floor(t0 / 125) % 64 : 0;                      // зерно меняется, только пока кадры и так рисуются
      pass(M.grade, null);
      lastInfo.calls = info.render.calls; lastInfo.triangles = info.render.triangles;
      info.autoReset = ar;
    } catch (e) {
      info.autoReset = ar; renderer.setRenderTarget(null);
      if (window.console) console.warn('GKFx: эффекты отключены — ' + (e && e.message));
      broken = true; pending = null; setQ('off', false); plainRender(); return;
    }
    frames++; cpuMs = performance.now() - t0;
    // авто-качество: реальный интервал между соседними кадрами
    if (lastTick === tick - 1) { var dt = t0 - lastNow; if (dt < 1000) sample(dt); }
    lastTick = tick; lastNow = t0;
    if (pending) { var q = pending; pending = null; setQ(q, false); emit(true); }
  }
  function sample(dt) {
    nSamp++; if (nSamp <= 8) return;                                   // первые кадры — компиляция шейдеров, не считаем
    ema = ema === null ? dt : ema + (dt - ema) * 0.08; nEval++;
    if (autoOn && nEval >= 40 && ema > 45) { pending = quality === 'high' ? 'low' : 'off'; nSamp = 0; nEval = 0; ema = null; }
  }

  function setQ(q, persist) {
    if (q !== 'high' && q !== 'low') q = 'off';
    if (broken) q = 'off';
    quality = q;
    build();
    ctx.render = q === 'off' ? plainRender : fxRender;
    nSamp = 0; nEval = 0; lastTick = -9;
    if (persist) { try { localStorage.setItem('gk-fx-quality', q); } catch (e) { /* приватный режим */ } }
    ctx.dirty();
    return q;
  }
  function emit(auto) { try { document.dispatchEvent(new CustomEvent('gk:fx', { detail: { quality: quality, label: LABELS[quality], auto: !!auto } })); } catch (e) { /* старый браузер */ } }

  /* ---------- подключение к сцене ---------- */
  ctx.onFrame(function () { tick++; return false; });
  ctx.onResize(function (w, h, p) {
    var ch = w !== vw || h !== vh || p !== basePR;
    vw = w; vh = h; basePR = p || 1;
    if (ch && quality !== 'off') { build(); ctx.dirty(); }
  });
  ctx.onMode(function (cur) {
    glow = Math.max(cur.lamp || 0, Math.min(1, (cur.win || 0) / 1.5) * 0.9);      // 0 днём … 1 ночью
    applyParams();
  });

  /* ---------- стартовое качество ---------- */
  if (!broken) { if (useMSAA && !probe(true)) useMSAA = false; if (!useMSAA && !probe(false)) broken = true; }
  var start = software ? 'high' : (weak ? 'low' : 'high'), stored = null, forced = (qs.match(/[?&]fx=(high|low|off)/) || [])[1];
  try { stored = localStorage.getItem('gk-fx-quality'); } catch (e) { stored = null; }
  if (stored !== 'high' && stored !== 'low' && stored !== 'off') stored = null;
  autoOn = !software && !stored && !forced;                              // программный рендер (тестовые снимки) не понижаем
  setQ(forced || stored || start, false);

  window.GKFx = {
    available: !broken,
    setQuality: function (q, opts) {                                     // ручной выбор: запоминается и отключает авто-понижение
      autoOn = !!(opts && opts.auto); pending = null;
      var r = setQ(q, !(opts && opts.persist === false) && !autoOn); emit(false); return r;
    },
    quality: function () { return quality; },
    label: function () { return LABELS[quality]; },
    labels: LABELS,
    auto: function (on) {                                                // GKFx.auto(true) — вернуть авто-подбор и забыть ручной выбор
      if (on !== undefined) { autoOn = !!on && !software; if (on) { try { localStorage.removeItem('gk-fx-quality'); } catch (e) { /* нет хранилища */ } } }
      return autoOn;
    },
    stats: function () {
      return { quality: quality, label: LABELS[quality], auto: autoOn, available: !broken, software: software, renderer: rname, webgl2: isGL2, msaa: quality !== 'off' && useMSAA ? 4 : 0,
        aa: quality === 'off' ? 'canvas' : (useMSAA ? 'msaa4' : 'fxaa'), ao: quality !== 'off' && aoOn, bloomFloat: canFloat,
        size: [W, H], pixelRatio: pr, frameMs: ema === null ? null : Math.round(ema * 10) / 10, cpuMs: Math.round(cpuMs * 10) / 10, frames: frames,
        calls: quality === 'off' ? renderer.info.render.calls : lastInfo.calls, triangles: quality === 'off' ? renderer.info.render.triangles : lastInfo.triangles };
    },
    bench: function (n) {                                                // честное время кадра (с ожиданием видеокарты), мс
      n = n || 3; var px = new Uint8Array(4), t = 0;
      for (var i = 0; i < n; i++) { var a = performance.now(); ctx.render(); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); t += performance.now() - a; }
      return Math.round(t / n * 10) / 10;
    },
    params: P,
    apply: function () { if (quality !== 'off') { build(); ctx.dirty(); } },        // после правки GKFx.params
    setTiltShift: function (v, focusY) { P.tilt = Math.max(0, +v || 0); if (focusY !== undefined) P.tiltFocus = +focusY; if (quality !== 'off') { build(); ctx.dirty(); } }
  };
})();
