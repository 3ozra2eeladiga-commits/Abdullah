/* cars.js — автомобили и уличная жизнь (всё процедурно, без внешних моделей).
   window.GKCars = { make(opts), makeInstanced(items, opts), types, colors, list, root, setTraffic(bool), traffic(), setVisible(bool) }
   Кузов — «лофт» по сечениям: боковой профиль (капот, наклонное лобовое, дуга крыши, багажник), скруглённые в плане углы,
   вырезанные колёсные арки, отдельное тёмное остекление, колёса с шинами и литыми дисками, фары/фонари, номера.
   Один автомобиль = 4 меша на общих материалах; любая группа машин через makeInstanced = не более 12 вызовов отрисовки. */
(function () {
  'use strict';
  var T = window.THREE; if (!T) return;
  var PI = Math.PI;
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  var seed = 90210;
  function rnd() { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; }

  /* ---------- типы кузова (метры; нос к +Z, начало координат — на земле по центру) ---------- */
  var SPECS = {
    sedan: { L: 4.70, W: 1.83, R: 0.335, tw: 0.225, ax: [-1.33, 1.42], sill: 0.20, belt: [0.975, 0.905], tum: 0.4, tumMax: 0.21, rEnd: [0.5, 0.5],
      top: [[-2.35, 0.70], [-2.30, 0.96], [-1.95, 1.03], [-1.55, 1.045], [-0.80, 1.40], [-0.15, 1.445], [0.40, 1.41], [1.18, 0.985], [1.65, 0.935], [2.12, 0.83], [2.33, 0.70], [2.35, 0.62]],
      ws: [0.44, 1.14], rw: [-1.50, -0.84], sg: [-1.02, 1.02], pil: [-0.05], seams: [0.95, -0.05, -0.88], spokes: 5 },
    suv: { L: 4.66, W: 1.90, R: 0.37, tw: 0.245, ax: [-1.34, 1.40], sill: 0.24, belt: [1.10, 1.03], tum: 0.33, tumMax: 0.17, rEnd: [0.42, 0.5],
      top: [[-2.33, 0.82], [-2.30, 1.12], [-2.21, 1.24], [-1.96, 1.63], [-1.20, 1.695], [-0.20, 1.70], [0.45, 1.64], [1.20, 1.14], [1.70, 1.08], [2.12, 0.97], [2.31, 0.82], [2.33, 0.70]],
      ws: [0.49, 1.16], rw: [-2.19, -1.99], sg: [-1.86, 1.04], pil: [-0.02, -1.08], seams: [0.92, -0.02, -0.86], spokes: 5, clad: true },
    hatch: { L: 4.12, W: 1.77, R: 0.315, tw: 0.205, ax: [-1.29, 1.27], sill: 0.19, belt: [0.985, 0.90], tum: 0.4, tumMax: 0.2, rEnd: [0.4, 0.46],
      top: [[-2.06, 0.74], [-2.04, 1.0], [-1.93, 1.10], [-1.52, 1.435], [-0.6, 1.475], [0.22, 1.445], [1.0, 1.0], [1.48, 0.945], [1.86, 0.85], [2.04, 0.72], [2.06, 0.63]],
      ws: [0.26, 0.96], rw: [-1.90, -1.56], sg: [-1.50, 0.86], pil: [-0.12], seams: [0.82, -0.12, -0.86], spokes: 6 }
  };
  var TYPES = ['sedan', 'suv', 'hatch'];
  var PAINTS = { white: 0xeceded, silver: 0xa7abb1, graphite: 0x3b3e44, black: 0x0b0c0e, blue: 0x15284b, red: 0x6b1219, beige: 0xb7a78a, steel: 0x566475 };
  var PAINT_W = [['white', 5], ['silver', 4], ['graphite', 4], ['black', 3.5], ['steel', 2], ['blue', 2], ['beige', 1.5], ['red', 1.3]];
  function pickPaint(r) { var sum = 0, i; for (i = 0; i < PAINT_W.length; i++) sum += PAINT_W[i][1]; r *= sum; for (i = 0; i < PAINT_W.length; i++) { r -= PAINT_W[i][1]; if (r <= 0) return PAINT_W[i][0]; } return 'white'; }
  function pickType(r) { return r < 0.4 ? 'sedan' : r < 0.75 ? 'suv' : 'hatch'; }
  function toColor(c) {
    if (c && c.isColor) return c.clone();
    if (typeof c === 'string' && PAINTS[c] != null) c = PAINTS[c];
    return new T.Color(c).convertSRGBToLinear();
  }

  /* ---------- сборщик геометрии: позиции, нормали, uv, цвет вершин ---------- */
  var _v = new T.Vector3(), _n = new T.Vector3(), _m3 = new T.Matrix3();
  function Acc() { this.p = []; this.n = []; this.u = []; this.c = []; }
  Acc.prototype.v = function (px, py, pz, nx, ny, nz, u, v, col) { this.p.push(px, py, pz); this.n.push(nx, ny, nz); this.u.push(u, v); this.c.push(col[0], col[1], col[2]); };
  Acc.prototype.geo = function (g, col, m) {
    var gg = g.index ? g.toNonIndexed() : g, P = gg.attributes.position, N = gg.attributes.normal;
    if (m) _m3.getNormalMatrix(m);
    for (var i = 0; i < P.count; i++) {
      _v.fromBufferAttribute(P, i); _n.fromBufferAttribute(N, i);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_m3).normalize(); }
      this.v(_v.x, _v.y, _v.z, _n.x, _n.y, _n.z, 0.5, 0.985, col);
    }
    return this;
  };
  Acc.prototype.add = function (a, m) {
    if (m) _m3.getNormalMatrix(m);
    for (var i = 0; i < a.p.length; i += 3) {
      _v.set(a.p[i], a.p[i + 1], a.p[i + 2]); _n.set(a.n[i], a.n[i + 1], a.n[i + 2]);
      if (m) { _v.applyMatrix4(m); _n.applyMatrix3(_m3).normalize(); }
      this.p.push(_v.x, _v.y, _v.z); this.n.push(_n.x, _n.y, _n.z);
    }
    for (i = 0; i < a.u.length; i++) this.u.push(a.u[i]);
    for (i = 0; i < a.c.length; i++) this.c.push(a.c[i]);
    return this;
  };
  Acc.prototype.build = function () {
    var g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(this.u, 2)); g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.computeBoundingSphere(); g.computeBoundingBox(); return g;
  };

  function chaikin(p, r) {
    var o = [p[0]], i, a, b;
    for (i = 0; i < p.length - 1; i++) { a = p[i]; b = p[i + 1]; o.push([a[0] + (b[0] - a[0]) * r, a[1] + (b[1] - a[1]) * r], [a[0] + (b[0] - a[0]) * (1 - r), a[1] + (b[1] - a[1]) * (1 - r)]); }
    o.push(p[p.length - 1]); return o;
  }
  function evalPoly(p, z) {
    if (z <= p[0][0]) return p[0][1];
    for (var i = 0; i < p.length - 1; i++) if (z <= p[i + 1][0]) { var d = p[i + 1][0] - p[i][0]; return d < 1e-6 ? p[i + 1][1] : p[i][1] + (p[i + 1][1] - p[i][1]) * (z - p[i][0]) / d; }
    return p[p.length - 1][1];
  }

  var C_TYRE = [0.022, 0.022, 0.024], C_DARK = [0.012, 0.012, 0.013], C_ALLOY = [0.62, 0.63, 0.65], C_HUB = [0.36, 0.37, 0.39], C_PLATE = [0.78, 0.78, 0.76], C_BLACK = [0.016, 0.016, 0.018],
    C_HEAD = [0.9, 0.95, 1], C_TAIL = [1, 0.055, 0.03], C_WHITE = [1, 1, 1];
  var PAINT = 0, GLASS = 1, TRIM = 2, HEAD = 3, TAIL = 4;

  /* колесо: ось X, внешняя сторона к +X, центр в начале координат */
  function wheel(s) {
    var R = s.R, w = s.tw, a = new Acc(), k;
    var prof = [[R * 0.93, -w / 2], [R, -w / 2 + 0.04], [R, w / 2 - 0.04], [R * 0.93, w / 2], [R * 0.62, w / 2]].map(function (p) { return new T.Vector2(p[0], p[1]); });
    a.geo(new T.LatheGeometry(prof, 14), C_TYRE);
    var disc = function (g, y, col) { g.rotateX(-PI / 2); g.translate(0, y, 0); a.geo(g, col); };
    disc(new T.CircleGeometry(R * 0.63, 16), w / 2 - 0.075, C_DARK);
    disc(new T.RingGeometry(R * 0.5, R * 0.645, 18, 1), w / 2 - 0.012, C_ALLOY);
    disc(new T.CircleGeometry(R * 0.17, 10), w / 2 - 0.02, C_HUB);
    var y = w / 2 - 0.028, r1 = R * 0.08, r2 = R * 0.56, h1 = R * 0.105, h2 = R * 0.055, n = s.spokes || 5;
    for (k = 0; k < n; k++) {
      var an = k / n * PI * 2, ux = Math.sin(an), uz = Math.cos(an), tx = Math.cos(an), tz = -Math.sin(an);
      var p = [[ux * r1 - tx * h1, uz * r1 - tz * h1], [ux * r1 + tx * h1, uz * r1 + tz * h1], [ux * r2 + tx * h2, uz * r2 + tz * h2], [ux * r2 - tx * h2, uz * r2 - tz * h2]];
      [0, 2, 1, 0, 3, 2].forEach(function (i) { a.v(p[i][0], y, p[i][1], 0, 1, 0, 0.5, 0.985, C_ALLOY); });
    }
    var out = new Acc(); out.add(a, new T.Matrix4().makeRotationZ(-PI / 2)); return out;
  }

  /* текстура кузова: швы дверей, ручки, затемнение у порога (проекция сбоку: u — вдоль машины, v — высота / 1.8 м) */
  function bodyTex(s) {
    var c = document.createElement('canvas'); c.width = 1024; c.height = 512;
    var g = c.getContext('2d'), hl = s.L / 2, X = function (z) { return (z + hl) / s.L * 1024; }, Y = function (y) { return (1 - y / 1.8) * 512; };
    var belt = function (z) { return s.belt[0] + (s.belt[1] - s.belt[0]) * (z + hl) / s.L; };
    g.fillStyle = '#fff'; g.fillRect(0, 0, 1024, 512);
    var gr = g.createLinearGradient(0, Y(s.sill + 0.36), 0, Y(s.sill - 0.02)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,.45)');
    g.fillStyle = gr; g.fillRect(0, Y(s.sill + 0.36), 1024, 512);
    if (s.clad) {                                        // у кроссовера — тёмный пластик по низу и вокруг арок
      g.fillStyle = '#1d1e20'; g.fillRect(0, Y(s.sill + 0.13), 1024, 512);
      s.ax.forEach(function (za) { g.beginPath(); g.ellipse(X(za), Y(s.R), (s.R + 0.12) * 1024 / s.L, (s.R + 0.12) * 512 / 1.8, 0, 0, PI * 2); g.fill(); });
    }
    g.strokeStyle = 'rgba(0,0,0,.62)'; g.lineWidth = 2.4; g.lineCap = 'round';
    s.seams.forEach(function (z) { g.beginPath(); g.moveTo(X(z), Y(s.sill + 0.05)); g.lineTo(X(z), Y(belt(z) - 0.012)); g.stroke(); });
    g.lineWidth = 1.6; g.beginPath(); g.moveTo(X(s.seams[2]), Y(s.sill + 0.11)); g.lineTo(X(s.seams[0]), Y(s.sill + 0.11)); g.stroke();
    g.fillStyle = 'rgba(0,0,0,.6)';
    [s.seams[1], s.seams[2]].forEach(function (z) { g.fillRect(X(z + 0.07), Y(belt(z) - 0.10), 0.17 * 1024 / s.L, 5); });
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 4; return t;
  }

  /* ---------- геометрия типа кузова (строится один раз и переиспользуется) ---------- */
  var GEO = {};
  function build(name) {
    if (GEO[name]) return GEO[name];
    var s = SPECS[name], hl = s.L / 2, hwm = s.W / 2, Ra = s.R + 0.055, top = chaikin(chaikin(s.top, 0.2), 0.22), i, k;
    var zA = -hl + s.rEnd[0], zB = hl - s.rEnd[1];
    var endD = function (z) { return z < zA ? Math.min(1, (zA - z) / s.rEnd[0]) : z > zB ? Math.min(1, (z - zB) / s.rEnd[1]) : 0; };
    var halfW = function (z) { var t = z / hl, d = endD(z); return hwm * (1 - 0.03 * t * t - (z > 0 ? 0.025 * t * t : 0)) * Math.pow(Math.max(0, 1 - Math.pow(d, 3.6)), 1 / 3.6); };
    var yBot = function (z) {
      var d = endD(z), y = s.sill + (z > 0 ? 0.04 : 0.09) * d * d;
      for (var q = 0; q < 2; q++) { var dz = Math.abs(z - s.ax[q]); if (dz <= Ra + 1e-6) y = Math.max(y, s.R + Math.sqrt(Math.max(0, Ra * Ra - dz * dz))); }
      return y;
    };
    var beltY = function (z) { return s.belt[0] + (s.belt[1] - s.belt[0]) * (z + hl) / s.L; };

    // станции вдоль кузова: ключевые (углы профиля, границы стёкол, арки, скругление носа/кормы) + равномерные
    var keys = [], D = [0, 0.25, 0.5, 0.7, 0.85, 0.94, 0.985, 1];
    D.forEach(function (d) { keys.push(-hl + s.rEnd[0] * (1 - d), hl - s.rEnd[1] * (1 - d)); });
    s.top.forEach(function (p) { keys.push(p[0]); });
    keys.push(s.ws[0], s.ws[1], s.rw[0], s.rw[1], s.sg[0], s.sg[1]);
    s.pil.forEach(function (p) { keys.push(p - 0.04, p + 0.04); });
    s.ax.forEach(function (za) { [-1, -0.93, -0.72, -0.4, 0, 0.4, 0.72, 0.93, 1].forEach(function (c) { keys.push(za + Ra * c); }); keys.push(za - Ra - 0.008, za + Ra + 0.008); });
    var nReg = Math.round((zB - zA) / 0.3);
    for (i = 1; i < nReg; i++) { var zr = zA + (zB - zA) * i / nReg; if (!keys.some(function (q) { return Math.abs(q - zr) < 0.1; })) keys.push(zr); }
    keys.sort(function (p, q) { return p - q; });
    var zs = [keys[0]]; for (i = 1; i < keys.length; i++) if (keys[i] - zs[zs.length - 1] > 0.004) zs.push(keys[i]);

    var NK = 23, pos = [], uvs = [];
    zs.forEach(function (z) {
      var hw = halfW(z), yb = yBot(z), yt = evalPoly(top, z), ys = Math.min(beltY(z), yt - 0.07), f = clamp(hw / 0.35, 0, 1), d = endD(z);
      if (ys < yb + 0.1) ys = yb + 0.1; if (yt < ys + 0.03) yt = ys + 0.03;
      var gh = yt - ys, crown = clamp(gh * 0.5, 0.02, 0.06), inset = clamp(gh * s.tum, 0.05, s.tumMax) * f, sh = ys - yb;
      var bx = hw - 0.03 * f, ex = Math.max(0, bx - inset), ey = yt - crown;
      var r = [[hw - 0.07 * f, yb], [hw - 0.012 * f, yb + Math.min(0.07, sh * 0.2)], [hw, yb + sh * 0.42], [hw - 0.006 * f, yb + sh * 0.72], [bx, ys],
        [bx + (ex - bx) / 3, ys + (ey - ys) / 3], [bx + (ex - bx) * 2 / 3, ys + (ey - ys) * 2 / 3], [ex, ey],
        [Math.max(0, ex - 0.07 * f), yt - crown * 0.45], [ex * 0.66, yt - crown * 0.14], [ex * 0.33, yt - crown * 0.03], [0, yt]];
      var ym = (yb + ys) * 0.5, hh = Math.max(0.1, sh * 0.5), sg = z > 0 ? 1 : -1;
      for (var kk = 0; kk < NK; kk++) {
        var j = kk <= 11 ? kk : 22 - kk, x = r[j][0] * (kk <= 11 ? 1 : -1), y = r[j][1], q = (y - ym) / hh;
        pos.push(x, y, z - sg * 0.075 * d * d * Math.min(1.6, q * q)); uvs.push((z + hl) / s.L, y / 1.8);
      }
    });

    var cls = function (zm, dm, j) {
      if (j >= 8 && ((zm > s.ws[0] && zm < s.ws[1]) || (zm > s.rw[0] && zm < s.rw[1]))) return GLASS;
      if (j >= 4 && j <= 6 && zm > s.sg[0] && zm < s.sg[1]) { for (var q = 0; q < s.pil.length; q++) if (Math.abs(zm - s.pil[q]) < 0.04) return TRIM; return GLASS; }
      if (dm > 0.5 && dm < 0.94 && j === 3) return zm > 0 ? HEAD : TAIL;
      if (zm > 0 && dm > 0.94 && (j === 1 || j === 2)) return TRIM;      // решётка радиатора
      if (zm < 0 && dm > 0.85 && j <= 1) return TRIM;                    // нижняя накладка заднего бампера
      return PAINT;
    };
    var idx = [], tris = [[], [], [], [], []];
    for (i = 0; i < zs.length - 1; i++) {
      var zm = (zs[i] + zs[i + 1]) / 2, dm = endD(zm);
      for (k = 0; k < NK - 1; k++) {
        var c = cls(zm, dm, k < 11 ? k : 21 - k), a = i * NK + k, b = a + 1, c2 = a + NK, d2 = c2 + 1;
        idx.push(a, b, c2, b, d2, c2); tris[c].push(a, b, c2, b, d2, c2);
      }
    }
    var full = new T.BufferGeometry(); full.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); full.setIndex(idx); full.computeVertexNormals();
    var nor = full.attributes.normal.array; full.dispose();
    var emit = function (acc, list, col) { for (var q = 0; q < list.length; q++) { var vi = list[q]; acc.v(pos[vi * 3], pos[vi * 3 + 1], pos[vi * 3 + 2], nor[vi * 3], nor[vi * 3 + 1], nor[vi * 3 + 2], uvs[vi * 2], uvs[vi * 2 + 1], col); } };
    var body = new Acc(), glass = new Acc(), trim = new Acc(), lights = new Acc(), m = new T.Matrix4(), m2 = new T.Matrix4();
    emit(body, tris[PAINT], C_WHITE); emit(glass, tris[GLASS], C_WHITE); emit(trim, tris[TRIM], C_BLACK); emit(lights, tris[HEAD], C_HEAD); emit(lights, tris[TAIL], C_TAIL);

    // колёса
    var wh = wheel(s);
    s.ax.forEach(function (za) { [1, -1].forEach(function (side) {
      var x = halfW(za) - 0.035 - s.tw / 2;
      m.makeTranslation(side * x, s.R, za); if (side < 0) { m2.makeRotationY(PI); m.multiply(m2); }
      trim.add(wh, m);
    }); });
    // днище и колёсные ниши (тёмный блок внутри оболочки)
    var bw = hwm * 0.955 - 0.265, bz0 = -hl + 0.44, bz1 = hl - 0.44, by0 = s.sill - 0.03, by1 = s.R + Ra + 0.03;
    m.makeTranslation(0, (by0 + by1) / 2, (bz0 + bz1) / 2); trim.geo(new T.BoxGeometry(bw * 2, by1 - by0, bz1 - bz0), C_DARK, m);
    // номера
    m.makeTranslation(0, yBot(hl) + 0.2, hl - 0.004); trim.geo(new T.BoxGeometry(0.5, 0.108, 0.022), C_PLATE, m);
    m.makeTranslation(0, yBot(-hl) + 0.3, -hl + 0.004); trim.geo(new T.BoxGeometry(0.5, 0.108, 0.022), C_PLATE, m);
    // зеркала
    var zmir = s.sg[1] - 0.1, ymir = Math.min(beltY(zmir), evalPoly(top, zmir) - 0.07) + 0.07;
    [1, -1].forEach(function (side) { m.makeTranslation(side * (halfW(zmir) + 0.065), ymir, zmir); m2.makeScale(0.115, 0.062, 0.058); m.multiply(m2); body.geo(new T.SphereGeometry(1, 8, 6), C_WHITE, m); });

    return GEO[name] = { spec: s, body: body.build(), glass: glass.build(), trim: trim.build(), lights: lights.build(), tex: null };
  }

  /* ---------- материалы (общие на все машины) ---------- */
  var envK = 1, envReg = [], MATS = null, BODY = {};
  function reg(m, base) { m.userData.env = base; m.envMapIntensity = base * envK; envReg.push(m); return m; }
  function mats() {
    if (MATS) return MATS;
    MATS = {
      glass: reg(new T.MeshStandardMaterial({ color: new T.Color(0x1d252e).convertSRGBToLinear(), roughness: 0.05, metalness: 0.72 }), 1.5),
      trim: reg(new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.52, metalness: 0.25 }), 0.55)
    };
    return MATS;
  }
  function bodyMat(type) {
    if (BODY[type]) return BODY[type];
    var Mat = T.MeshPhysicalMaterial || T.MeshStandardMaterial;
    var m = new Mat({ color: 0xffffff, map: bodyTex(SPECS[type]), roughness: 0.3, metalness: 0.42 });
    if (m.isMeshPhysicalMaterial) { m.clearcoat = 1; m.clearcoatRoughness = 0.06; }
    return BODY[type] = reg(m, 1.3);
  }
  function applyEnv(k) { envK = k; envReg.forEach(function (m) { m.envMapIntensity = m.userData.env * k; }); }

  /* ---------- группа машин одним «тиражом»: 4 меша на тип кузова ---------- */
  var _o = new T.Object3D();
  function makeInstanced(items, opts) {
    opts = opts || {};
    var M = mats(), group = new T.Group(), sets = {}, count = {}, ref = [], lm = new T.MeshBasicMaterial({ vertexColors: true }), single = items.length === 1;
    items.forEach(function (it) { if (!SPECS[it.type]) it.type = pickType(rnd()); count[it.type] = (count[it.type] || 0) + 1; });
    TYPES.forEach(function (tp) {
      if (!count[tp]) return;
      var g = build(tp), n = count[tp], ms = [new T.InstancedMesh(g.body, bodyMat(tp), n), new T.InstancedMesh(g.glass, M.glass, n), new T.InstancedMesh(g.trim, M.trim, n), new T.InstancedMesh(g.lights, lm, n)];
      ms.forEach(function (mesh, q) { mesh.castShadow = opts.shadow !== false && q < 3; mesh.receiveShadow = q < 3; mesh.frustumCulled = single; group.add(mesh); });
      ms[0].name = 'car-body'; ms[1].name = 'car-glass'; ms[2].name = 'car-trim'; ms[3].name = 'car-lights';
      sets[tp] = { meshes: ms, n: 0 };
    });
    var setT = function (i, x, y, z, ry, sc) {
      var r = ref[i]; if (!r) return;
      _o.position.set(x, y, z); _o.rotation.set(0, ry || 0, 0); _o.scale.setScalar(sc == null ? 1 : sc); _o.updateMatrix();
      for (var q = 0; q < 4; q++) r.set.meshes[q].setMatrixAt(r.i, _o.matrix);
    };
    var commit = function () { for (var k in sets) sets[k].meshes.forEach(function (m) { m.instanceMatrix.needsUpdate = true; }); };
    items.forEach(function (it, i) {
      var st = sets[it.type]; ref[i] = { set: st, i: st.n++ };
      if (it.color == null) it.color = pickPaint(rnd());
      st.meshes[0].setColorAt(ref[i].i, toColor(it.color));
      setT(i, it.x || 0, it.y || 0, it.z || 0, it.ry || 0, it.scale);
    });
    for (var k in sets) sets[k].meshes[0].instanceColor.needsUpdate = true;
    commit();
    var setLights = function (v) { v = clamp(+v || 0, 0, 1); lm.color.setScalar(0.5 + 2.8 * v); group.userData.lights = v; };
    group.userData = { items: items, setLights: setLights, setTransform: setT, commit: commit, lightsMaterial: lm, lights: 0 };
    setLights(opts.lights ? (opts.lights === true ? 1 : opts.lights) : 0);
    return group;
  }

  /* одна машина: THREE.Group, нос к +Z, центр на земле */
  function make(opts) {
    opts = opts || {};
    var type = SPECS[opts.type] ? opts.type : pickType(rnd()), color = opts.color != null ? opts.color : pickPaint(rnd());
    var g = makeInstanced([{ type: type, color: color }], { lights: opts.lights, shadow: opts.shadow });
    g.name = 'car-' + type; g.userData.type = type; g.userData.color = color; g.userData.size = { L: SPECS[type].L, W: SPECS[type].W };
    return g;
  }

  var api = window.GKCars = {
    make: make, makeInstanced: makeInstanced, types: TYPES.slice(), colors: PAINTS, list: [], root: null,
    setTraffic: function () {}, traffic: function () { return false; }, setVisible: function () {}
  };

  var ctx = window.GKScene && window.GKScene.ctx;
  if (!ctx) return;
  ctx.onMode(function (cur) { applyEnv(cur.env == null ? 1 : cur.env); });
  if (!ctx.enabled('cars')) return;

  /* ================= улицы: припаркованные машины и движение ================= */
  (function () {
    var d = ctx.dims, RW = d.RW, RS = d.RS, cxW = (RW[0] + RW[1]) / 2, czS = (RS[0] + RS[1]) / 2, HALF = (RW[1] - RW[0]) / 2;
    var LANE = 1.22, WRAP = 300, root = new T.Group(); root.name = 'cars';

    // высота асфальта: луч сверху вниз по полосам (сцена окружения может меняться)
    var roadY = (function () {
      var best = null;
      try {
        ctx.site.updateMatrixWorld(true);
        var rc = new T.Raycaster(); rc.camera = ctx.camera; var nrm = new T.Vector3();
        [[cxW - 1.3, -12], [cxW + 1.3, 6], [20, czS + 1.3], [-8, czS - 1.3]].forEach(function (p) {
          rc.set(new T.Vector3(p[0], 40, p[1]), new T.Vector3(0, -1, 0));
          var hits = rc.intersectObjects(ctx.site.children, true);
          for (var i = 0; i < hits.length; i++) { var h = hits[i];
            if (!h.object.isMesh || h.object.isInstancedMesh || !h.object.receiveShadow || !h.face || h.point.y > 0.6 || h.point.y < -0.5) continue;
            if (nrm.copy(h.face.normal).transformDirection(h.object.matrixWorld).y < 0.9) continue;
            if (best == null || h.point.y < best) best = h.point.y; break; }
        });
      } catch (e) { best = null; }
      return best == null ? 0.1 : best;
    })();

    // --- припаркованные вдоль бордюров (во дворе машин нет: он закрыт для транспорта) ---
    var parked = [], zeb0 = d.P1.x0 + 16 - 3, zeb1 = d.P1.x0 + 23.5 + 3;
    function row(street, side, a, b, fill) {
      for (var s = a + rnd() * 1.6; s < b - 2.4; s += 5.7 + rnd() * 0.5) {
        var r = rnd(), tp = pickType(rnd()), col = pickPaint(rnd()), off = HALF - 1.07 - rnd() * 0.1, jit = (rnd() - 0.5) * 0.03;
        if (r > fill) continue;
        if (street === 1 && s > zeb0 && s < zeb1) continue;
        if (street === 0) parked.push({ type: tp, color: col, x: cxW + side * off, y: roadY, z: s, ry: (side > 0 ? PI : 0) + jit });
        else parked.push({ type: tp, color: col, x: s, y: roadY, z: czS + side * off, ry: (side > 0 ? PI / 2 : -PI / 2) + jit });
      }
    }
    row(0, 1, -64, RS[0] - 7, 0.55); row(0, -1, -64, RS[0] - 7, 0.5);
    row(0, 1, RS[1] + 8, RS[1] + 52, 0.4); row(0, -1, RS[1] + 8, RS[1] + 52, 0.4);
    row(1, -1, RW[1] + 7, 60, 0.55); row(1, 1, RW[1] + 7, 60, 0.5);
    row(1, -1, RW[0] - 48, RW[0] - 8, 0.4); row(1, 1, RW[0] - 48, RW[0] - 8, 0.4);
    var parkedSet = makeInstanced(parked, { shadow: true }); parkedSet.name = 'cars-parked'; root.add(parkedSet);

    // --- движущиеся: правостороннее движение, две улицы, оба направления ---
    var movers = [];
    [[0, 1, 4], [0, -1, 3], [1, 1, 4], [1, -1, 3]].forEach(function (L) {
      for (var i = 0; i < L[2]; i++) {
        var v0 = 7 + rnd() * 3.5;
        movers.push({ type: pickType(rnd()), color: pickPaint(rnd()), street: L[0], dir: L[1], s: -WRAP + (i + 0.15 + rnd() * 0.6) * (2 * WRAP / L[2]), v0: v0, v: v0, x: 0, y: roadY, z: 0, ry: 0, sc: 1 });
      }
    });
    var movSet = makeInstanced(movers, { shadow: false }); movSet.name = 'cars-moving'; root.add(movSet);

    // --- мягкие контактные тени, пятна света фар, ореолы фар и фонарей ---
    var mkTex = function (w, h, draw) { var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d')); var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t; };
    var blobTex = mkTex(64, 128, function (g) { g.shadowColor = '#000'; g.shadowBlur = 13; g.shadowOffsetX = 300; g.fillStyle = '#000'; g.fillRect(-300 + 16, 18, 32, 92); g.shadowBlur = 7; g.fillRect(-300 + 18, 20, 28, 88); });
    var flat = function (shift) { var g = new T.PlaneGeometry(1, 1); g.rotateX(-PI / 2); if (shift) g.translate(0, 0, 0.5); return g; };
    var blobMat = new T.MeshBasicMaterial({ map: blobTex, transparent: true, opacity: 0.74, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    var blobs = function (list) {
      var im = new T.InstancedMesh(flat(), blobMat, list.length); im.frustumCulled = false; im.renderOrder = 1;
      list.forEach(function (c, i) { var sp = SPECS[c.type]; _o.position.set(c.x, roadY + 0.012, c.z); _o.rotation.set(0, c.ry, 0); _o.scale.set(sp.W + 0.95, 1, sp.L + 1.05); _o.updateMatrix(); im.setMatrixAt(i, _o.matrix); });
      root.add(im); return im;
    };
    blobs(parked); var movBlobs = blobs(movers);
    var beamTex = mkTex(128, 256, function (g) { g.translate(64, 62); g.scale(1, 2.9); var r = g.createRadialGradient(0, 0, 1, 0, 0, 62); r.addColorStop(0, 'rgba(255,238,206,.95)'); r.addColorStop(0.3, 'rgba(255,230,190,.42)'); r.addColorStop(1, 'rgba(255,225,180,0)'); g.fillStyle = r; g.fillRect(-64, -22, 128, 90); });
    var beamMat = new T.MeshBasicMaterial({ map: beamTex, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
    var beams = new T.InstancedMesh(flat(true), beamMat, movers.length); beams.frustumCulled = false; beams.renderOrder = 3; beams.visible = false; root.add(beams);
    var glowTex = mkTex(64, 64, function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.18, 'rgba(255,255,255,.55)'); r.addColorStop(0.5, 'rgba(255,255,255,.12)'); r.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); });
    var gPos = new Float32Array(movers.length * 12), gCol = new Float32Array(movers.length * 12), gGeo = new T.BufferGeometry();
    gGeo.setAttribute('position', new T.BufferAttribute(gPos, 3)); gGeo.setAttribute('color', new T.BufferAttribute(gCol, 3));
    var glow = new T.Points(gGeo, new T.PointsMaterial({ map: glowTex, size: 5.2, sizeAttenuation: true, vertexColors: true, transparent: true, depthWrite: false, blending: T.AdditiveBlending, fog: false }));
    glow.frustumCulled = false; glow.renderOrder = 4; glow.visible = false; root.add(glow);

    ctx.site.add(root);

    // --- список машин для других модулей (лёгкие «заместители» с положением и данными) ---
    var proxies = [];
    parked.concat(movers).forEach(function (c, i) { var p = new T.Group(); p.name = 'car'; p.position.set(c.x, c.y, c.z); p.rotation.y = c.ry; p.userData = { type: c.type, color: c.color, moving: i >= parked.length }; proxies.push(p); });

    var lampK = 0, traffic = true, appCl = ctx.app.classList;
    function place(m) {
      if (m.street === 0) { m.x = cxW - m.dir * LANE; m.z = m.s; m.ry = m.dir > 0 ? 0 : PI; }
      else { m.x = m.s; m.z = czS + m.dir * LANE; m.ry = m.dir > 0 ? PI / 2 : -PI / 2; }
      m.sc = clamp((WRAP - Math.abs(m.s)) / 18, 0.001, 1);
    }
    function sync() {
      for (var i = 0; i < movers.length; i++) {
        var m = movers[i], sp = SPECS[m.type], fx = Math.sin(m.ry), fz = Math.cos(m.ry), rx = fz, rz = -fx, hl = sp.L / 2, hw = sp.W / 2 - 0.22;
        movSet.userData.setTransform(i, m.x, roadY, m.z, m.ry, m.sc);
        _o.position.set(m.x, roadY + 0.012, m.z); _o.rotation.set(0, m.ry, 0); _o.scale.set((sp.W + 0.95) * m.sc, 1, (sp.L + 1.05) * m.sc); _o.updateMatrix(); movBlobs.setMatrixAt(i, _o.matrix);
        _o.position.set(m.x + fx * (hl - 0.4), roadY + 0.03, m.z + fz * (hl - 0.4)); _o.scale.set(6.2 * m.sc, 1, 14 * m.sc); _o.updateMatrix(); beams.setMatrixAt(i, _o.matrix);
        var o = i * 12, yh = roadY + sp.belt[1] * 0.74, yt = roadY + sp.belt[0] * 0.84, kh = lampK * m.sc, kt = lampK * m.sc * 0.8;
        gPos[o] = m.x + fx * (hl - 0.05) + rx * hw; gPos[o + 1] = yh; gPos[o + 2] = m.z + fz * (hl - 0.05) + rz * hw;
        gPos[o + 3] = m.x + fx * (hl - 0.05) - rx * hw; gPos[o + 4] = yh; gPos[o + 5] = m.z + fz * (hl - 0.05) - rz * hw;
        gPos[o + 6] = m.x - fx * (hl - 0.03) + rx * hw; gPos[o + 7] = yt; gPos[o + 8] = m.z - fz * (hl - 0.03) + rz * hw;
        gPos[o + 9] = m.x - fx * (hl - 0.03) - rx * hw; gPos[o + 10] = yt; gPos[o + 11] = m.z - fz * (hl - 0.03) - rz * hw;
        gCol[o] = gCol[o + 3] = kh; gCol[o + 1] = gCol[o + 4] = kh * 0.9; gCol[o + 2] = gCol[o + 5] = kh * 0.72;
        gCol[o + 6] = gCol[o + 9] = kt; gCol[o + 7] = gCol[o + 10] = kt * 0.06; gCol[o + 8] = gCol[o + 11] = kt * 0.03;
        var p = proxies[parked.length + i]; p.position.set(m.x, roadY, m.z); p.rotation.y = m.ry;
      }
      movSet.userData.commit(); movBlobs.instanceMatrix.needsUpdate = true; beams.instanceMatrix.needsUpdate = true;
      gGeo.attributes.position.needsUpdate = true; gGeo.attributes.color.needsUpdate = true;
    }
    function step(dt) {
      var i, j, m, o, n = movers.length;
      for (i = 0; i < n; i++) {
        m = movers[i]; var target = m.v0, cs = m.street === 0 ? czS : cxW;
        for (j = 0; j < n; j++) { o = movers[j]; if (o === m || o.street !== m.street || o.dir !== m.dir) continue;
          var gap = (o.s - m.s) * m.dir; if (gap < 0) gap += 2 * WRAP;
          if (gap < 16) target = Math.min(target, o.v * clamp((gap - 7.5) / 8, 0, 1)); }
        var dist = (cs - m.s) * m.dir - HALF - 2.7;                       // от носа до перекрёстка
        if (dist > 0 && dist < 18) {
          var giveWay = false;
          for (j = 0; j < n; j++) { o = movers[j]; if (o.street === m.street) continue;
            var oc = o.street === 0 ? czS : cxW, od = (oc - o.s) * o.dir, inside = Math.abs(o.s - oc) < HALF + 2.8;
            if (inside || (m.street === 1 && od > 0 && od < 26)) { giveWay = true; break; } }
          if (giveWay) target = Math.min(target, m.v0 * clamp((dist - 0.8) / 8, 0, 1));
        }
        m.v += clamp(target - m.v, -9 * dt, 2.4 * dt); if (m.v < 0) m.v = 0;
        m.s += m.v * dt * m.dir; if (m.s * m.dir > WRAP) m.s -= 2 * WRAP * m.dir;
        place(m);
      }
      sync();
    }
    movers.forEach(place); sync();

    ctx.onMode(function (cur) {
      lampK = clamp(((cur.lamp || 0) - 0.25) / 0.3, 0, 1);
      movSet.userData.setLights(lampK); parkedSet.userData.setLights(0);
      beamMat.opacity = lampK * 0.5; beams.visible = lampK > 0.01 && traffic; glow.visible = lampK > 0.01 && traffic;
      if (!traffic) return; sync();
    });
    ctx.onFrame(function (dt) {
      if (!traffic || !root.visible || !ctx.site.visible || appCl.contains('view-parking') || appCl.contains('view-interior')) return false;
      step(dt); return true;
    });

    api.list = proxies; api.root = root;
    api.setTraffic = function (on) {
      traffic = !!on; movSet.visible = movBlobs.visible = traffic; beams.visible = glow.visible = traffic && lampK > 0.01;
      ctx.dirty();
    };
    api.traffic = function () { return traffic; };
    api.setVisible = function (on) { root.visible = !!on; ctx.shadows(); };
    api.roadY = roadY;
    ctx.shadows();
  })();
})();
