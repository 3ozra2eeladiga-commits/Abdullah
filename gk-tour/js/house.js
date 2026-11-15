/* Дом ЖК «Новый Квартал» (Моздок, ул. Шевченко, 20), собранный по рендерам и планам застройщика —
   пока нет файла архитектора. Г-образный корпус: тёмный кирпич, белые вертикальные полосы, светлый кирпич
   верхних этажей, эркеры-лоджии, чёрные кружевные ограждения, круглая стеклянная башня на углу, витрины первого этажа.
   Все детали складываются в несколько больших сеток по материалам — модель легко крутится на планшете.
   Оси: X — вдоль южного фасада, Y — вверх, Z — на зрителя (юг). Башня — на юго-западном углу. */
window.GKHouse = (function () {
  'use strict';
  var T = THREE;

  /* ---------- сборщик коробок ---------- */
  function Builder() { this.buf = {}; }
  Builder.prototype.box = function (mat, cx, cy, cz, sx, sy, sz, opt) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    var b = this.buf[mat] || (this.buf[mat] = { p: [], n: [], uv: [], i: [] });
    var hx = sx / 2, hy = sy / 2, hz = sz / 2, x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    var F = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]]
    ];
    var U01 = [[0, 0], [1, 0], [1, 1], [0, 1]], uv01 = opt && opt.uv01;
    for (var f = 0; f < 6; f++) {
      var q = F[f], nn = q[4], base = b.p.length / 3;
      for (var k = 0; k < 4; k++) {
        var v = q[k];
        b.p.push(v[0], v[1], v[2]); b.n.push(nn[0], nn[1], nn[2]);
        if (uv01) b.uv.push(U01[k][0], U01[k][1]);
        else if (nn[0]) b.uv.push(v[2], v[1]);
        else if (nn[2]) b.uv.push(v[0], v[1]);
        else b.uv.push(v[0], v[2]);
      }
      b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  Builder.prototype.meshes = function (mats, group) {
    for (var k in this.buf) {
      var b = this.buf[k], g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.i);
      var m = new T.Mesh(g, mats[k]);
      m.castShadow = k.indexOf('glass') !== 0 && k !== 'shop' && k !== 'lace'; m.receiveShadow = k !== 'lace'; m.name = k;
      group.add(m);
    }
  };

  /* ---------- «фасад»: своя система координат u (вдоль), y (вверх), n (наружу) ---------- */
  function Face(B, ox, oz, dx, dz, nx, nz) { this.B = B; this.ox = ox; this.oz = oz; this.dx = dx; this.dz = dz; this.nx = nx; this.nz = nz; }
  Face.prototype.R = function (m, u0, u1, y0, y1, n0, n1, opt) {
    var uc = (u0 + u1) / 2, nc = (n0 + n1) / 2, du = u1 - u0, dn = n1 - n0;
    this.B.box(m, this.ox + this.dx * uc + this.nx * nc, (y0 + y1) / 2, this.oz + this.dz * uc + this.nz * nc,
      Math.abs(this.dx) * du + Math.abs(this.nx) * dn, y1 - y0, Math.abs(this.dz) * du + Math.abs(this.nz) * dn, opt);
  };

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- текстуры (рисуются на лету, файлов не нужно) ---------- */
  function canvasTex(w, h, draw, repeat) {
    var c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h);
    var t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(repeat, repeat); }
    return t;
  }
  function brickTex(base, joint, vary, seed) {     // кирпичная кладка: 512 px = 2 м, кирпич 25 × 7,5 см
    return canvasTex(512, 512, function (g, w, h) {
      var r = rng(seed), bw = 64, bh = 512 / 26;
      g.fillStyle = joint; g.fillRect(0, 0, w, h);
      for (var row = 0; row < 26; row++) for (var col = -1; col < 9; col++) {
        var x = col * bw + (row % 2 ? bw / 2 : 0), y = row * bh, v = (r() - 0.5) * vary;
        g.fillStyle = base; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
        g.fillStyle = v > 0 ? 'rgba(255,240,225,' + v + ')' : 'rgba(0,0,0,' + (-v) + ')'; g.fillRect(x + 1, y + 1, bw - 2, bh - 2);
      }
    }, 1 / 2);
  }
  function windowGlow(kind) {
    return canvasTex(128, 192, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h);
      if (kind === 2) { gr.addColorStop(0, '#ffe9c4'); gr.addColorStop(1, '#f3b877'); }
      else if (kind === 3) { gr.addColorStop(0, '#dfe6f5'); gr.addColorStop(1, '#b9c6e6'); }
      else { gr.addColorStop(0, '#ffd08a'); gr.addColorStop(1, '#f0a55a'); }
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(60,35,15,.5)';   // шторы
      if (kind === 1) { g.fillRect(0, 0, 30, h); g.fillRect(w - 34, 0, 34, h); }
      else if (kind === 2) { g.fillRect(0, 0, 46, h); g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.arc(88, 70, 12, 0, 7); g.fill(); }
      else { g.fillRect(w - 26, 0, 26, h); }
      g.fillStyle = 'rgba(40,25,10,.35)'; g.fillRect(0, h - 26, w, 26);
    });
  }
  function shopGlow() {
    return canvasTex(256, 128, function (g, w, h) {
      var gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#ffe2b0'); gr.addColorStop(0.7, '#f2b877'); gr.addColorStop(1, '#b98450');
      g.fillStyle = gr; g.fillRect(0, 0, w, h);
      g.fillStyle = 'rgba(90,55,25,.3)';
      for (var i = 0; i < 6; i++) g.fillRect(14 + i * 42, 46 + (i % 2) * 8, 26, 64);
      g.fillStyle = 'rgba(255,245,225,.55)'; for (var k = 0; k < 8; k++) g.fillRect(8 + k * 32, 10, 18, 3);
    });
  }
  function laceTex() {                              // кружевное кованое ограждение
    var t = canvasTex(256, 128, function (g, w, h) {
      g.clearRect(0, 0, w, h); g.strokeStyle = '#141416'; g.lineWidth = 5;
      g.strokeRect(3, 3, w - 6, h - 6);
      g.lineWidth = 3.5;
      for (var x = -h; x < w + h; x += 26) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h, h); g.stroke(); g.beginPath(); g.moveTo(x + h, 0); g.lineTo(x, h); g.stroke(); }
    });
    return t;
  }

  function materials() {
    var bD = brickTex('#2f2b2c', '#161415', 0.14, 5), bL = brickTex('#d8d1c5', '#aaa398', 0.1, 9);
    var S = function (o) { return new T.MeshStandardMaterial(o); };
    var m = {
      brickD: S({ map: bD, roughness: 0.9 }),                       // тёмный кирпич
      brickL: S({ map: bL, roughness: 0.92 }),                      // светлый кирпич верхних этажей
      white: S({ color: 0xe9e5dd, roughness: 0.85 }),               // белые вертикальные полосы
      dark: S({ color: 0x2c2c30, roughness: 0.7, metalness: 0.15 }),// карнизы, пояса, рамы эркеров
      marble: S({ color: 0x151517, roughness: 0.22, metalness: 0.3 }),
      metal: S({ color: 0x17181b, roughness: 0.45, metalness: 0.6 }),
      roof: S({ color: 0x55555a, roughness: 0.95 }),
      deck: S({ color: 0xb0725a, roughness: 0.85 }),                // терракотовый настил террасы на крыше
      wood: S({ color: 0x8a6243, roughness: 0.8 }),
      green: S({ color: 0x4f7a3e, roughness: 0.95 }),
      lace: S({ map: laceTex(), alphaTest: 0.4, side: T.DoubleSide, roughness: 0.5, metalness: 0.5 }),
      glass0: S({ color: 0x1c252e, roughness: 0.1, metalness: 0.5 }),
      shop: S({ color: 0x3a3026, roughness: 0.2, metalness: 0.2, emissive: 0xffffff, emissiveMap: shopGlow(), emissiveIntensity: 0.5 })
    };
    for (var k = 1; k <= 3; k++) m['glass' + k] = S({ color: 0x1c252e, roughness: 0.1, metalness: 0.5, emissive: 0xffffff, emissiveMap: windowGlow(k), emissiveIntensity: 0 });
    return m;
  }

  /* ---------- сам дом ---------- */
  function build(cfg) {
    var GH = cfg.groundH, FH = cfg.floorH, NF = cfg.floors - 1, YR = GH + NF * FH, WT = 0.4;
    var AW = cfg.wingA[0], AL = cfg.wingA[1], BL = cfg.wingB[0], BD = cfg.wingB[1], TW = 6.5;   // TW — место под башню на фасадах
    var CX = (AW + BL) / 2, CZ = -AL / 2;                 // центр дома → в начало координат
    var B = new Builder(), R = rng(2028), mats = materials(), group = new T.Group();
    var glass = function () { var x = R(); return x < 0.42 ? 'glass0' : x < 0.66 ? 'glass1' : x < 0.86 ? 'glass2' : 'glass3'; };
    var face = function (x, z, dx, dz, nx, nz) { return new Face(B, x - CX, z - CZ, dx, dz, nx, nz); };

    function glassBox(f, a, b, y0, y1, n0, n1, mu, tr) {   // стекло с тёмной рамой и импостами
      var t = 0.07;
      f.R(glass(), a, b, y0, y1, n0, n0 + 0.06, { uv01: true });
      f.R('metal', a, a + t, y0, y1, n0 + 0.06, n1); f.R('metal', b - t, b, y0, y1, n0 + 0.06, n1);
      f.R('metal', a, b, y0, y0 + t, n0 + 0.06, n1); f.R('metal', a, b, y1 - t, y1, n0 + 0.06, n1);
      for (var j = 1; j <= mu; j++) { var x = a + (b - a) * j / (mu + 1); f.R('metal', x - 0.03, x + 0.03, y0, y1, n0 + 0.06, n1 - 0.02); }
      if (tr) f.R('metal', a, b, y1 - 0.6, y1 - 0.55, n0 + 0.06, n1 - 0.02);
    }
    function opening(f, a, b, y0, o, m) {                  // окно в кирпичной стене
      var sill = y0 + o.sill, head = y0 + o.head;
      f.R(m, a, b, head, y0 + FH, -WT, 0); f.R(m, a, b, y0, sill, -WT, 0);
      glassBox(f, a, b, sill, head, -0.34, -0.2, o.mull == null ? 1 : o.mull, o.head - o.sill > 1.6);
      if (o.lace) f.R('lace', a - 0.05, b + 0.05, y0 + 0.12, y0 + 1.12, 0.1, 0.13, { uv01: true });
    }
    function wall(f, u0, u1, y0, list, m) {
      var sum = 0; list.forEach(function (o) { sum += o.w; });
      var gap = (u1 - u0 - sum) / (list.length + 1), u = u0;
      list.forEach(function (o) { f.R(m, u, u + gap, y0, y0 + FH, -WT, 0); u += gap; opening(f, u, u + o.w, y0, o, m); u += o.w; });
      f.R(m, u, u1, y0, y0 + FH, -WT, 0);
    }
    // окна с французскими балконами (кружевные ограждения)
    function winBay(f, u0, u1, y0, m) {
      var n = Math.max(1, Math.round((u1 - u0) / 3.1)), list = [];
      if (u1 - u0 < 2.4) { f.R(m, u0, u1, y0, y0 + FH, -WT, 0); return; }
      for (var i = 0; i < n; i++) list.push({ w: 1.6, sill: 0.35, head: 2.7, lace: true });
      wall(f, u0, u1, y0, list, m);
    }
    // эркер-лоджия: выступающий объём с ленточным остеклением
    function bay(f, u0, u1, y0, m) {
      var a = u0 + 0.35, b = u1 - 0.35, out = 0.95, sp = 0.95, top = y0 + FH;
      f.R(m, u0, a, y0, top, -WT, 0); f.R(m, b, u1, y0, top, -WT, 0);
      f.R(m, a, b, y0 + 0.12, y0 + sp, -WT, out);                        // кирпичный пояс под окнами
      f.R('dark', a - 0.06, b + 0.06, y0, y0 + 0.12, -WT, out + 0.06);   // тёмная плита-пояс
      f.R('dark', a - 0.04, b + 0.04, top - 0.3, top, -WT, out + 0.04);
      var g = glass();
      f.R(g, a + 0.05, b - 0.05, y0 + sp, top - 0.3, -WT, out - 0.05, { uv01: true });
      var n = Math.max(2, Math.round((b - a) / 1.15));
      for (var i = 0; i <= n; i++) { var x = a + (b - a) * i / n; f.R('metal', x - 0.04, x + 0.04, y0 + sp, top - 0.3, out - 0.08, out); }
      f.R('metal', a, b, y0 + sp + 1.15, y0 + sp + 1.2, out - 0.07, out);
      f.R('metal', a, a + 0.08, y0 + sp, top - 0.3, -0.05, out); f.R('metal', b - 0.08, b, y0 + sp, top - 0.3, -0.05, out);
    }
    // зона белых вертикальных полос с узкими окнами между ними
    function strip(f, u0, u1, y0, m) {
      var n = Math.max(2, Math.round((u1 - u0) / 1.3)), st = (u1 - u0) / n;
      for (var i = 0; i < n; i++) {
        var a = u0 + i * st, c = a + st / 2;
        f.R(m, a, c - 0.38, y0, y0 + FH, -WT, 0); f.R(m, c + 0.38, a + st, y0, y0 + FH, -WT, 0);
        opening(f, c - 0.38, c + 0.38, y0, { sill: 0.55, head: 2.75, mull: 0 }, m);
      }
    }
    function stripPilasters(f, u0, u1) {                    // сами полосы — сплошные, на всю высоту
      var n = Math.max(2, Math.round((u1 - u0) / 1.3)), st = (u1 - u0) / n;
      for (var i = 0; i <= n; i++) { var x = u0 + i * st; f.R('white', x - 0.2, x + 0.2, GH + 0.2, YR + 0.2, 0, 0.2); }
    }
    function groundFloor(f, L, u0, u1) {                    // первый этаж: чёрный мрамор и витрины в пол
      f.R('marble', u0, u1, 0, 0.3, -WT, 0.05); f.R('marble', u0, u1, GH - 0.95, GH - 0.45, -WT, 0.05);
      var n = Math.max(1, Math.round((u1 - u0) / 3.45)), st = (u1 - u0) / n;
      for (var i = 0; i <= n; i++) { var x = u0 + i * st; f.R('marble', Math.max(u0, x - 0.38), Math.min(u1, x + 0.38), 0.3, GH - 0.95, -WT, 0.08); }
      for (i = 0; i < n; i++) { var a = u0 + i * st + 0.38, b = u0 + (i + 1) * st - 0.38;
        f.R('shop', a, b, 0.3, GH - 0.95, -0.3, -0.24, { uv01: true });
        f.R('metal', (a + b) / 2 - 0.03, (a + b) / 2 + 0.03, 0.3, GH - 0.95, -0.24, -0.16); f.R('metal', a, b, 3, 3.06, -0.24, -0.17); }
    }

    function facade(f, bays, o) {
      var L = 0; bays.forEach(function (b) { L += b.w; });
      var lightFrom = o.lightFrom, g0 = 0, g1 = L;
      for (var fl = 0; fl < NF; fl++) {
        var y0 = GH + fl * FH, u = 0, m = fl >= lightFrom ? 'brickL' : 'brickD';
        for (var i = 0; i < bays.length; i++) {
          var b = bays[i], u1 = u + b.w;
          if (b.t === 'win') winBay(f, u, u1, y0, m);
          else if (b.t === 'bay') bay(f, u, u1, y0, m);
          else if (b.t === 'strip') strip(f, u, u1, y0, 'brickD');
          u = u1;
        }
      }
      u = 0;
      bays.forEach(function (b, i) {
        if (b.t === 'strip') stripPilasters(f, u, u + b.w);
        if (b.t === 'bay') f.R('dark', u + 0.2, u + b.w - 0.2, YR, YR + 0.3, -WT, 1.15);      // «шапка» эркера
        if (b.t === 'none') { if (i === 0) g0 = b.w; else g1 = L - b.w; }
        else if (i > 0 && bays[i - 1].t !== 'none') f.R('dark', u - 0.09, u + 0.09, GH, YR, -0.05, 0.1);   // тёмная вертикальная тяга между осями
        u += b.w;
      });
      var a0 = g0 ? g0 - 0.3 : -0.9, a1 = g1 < L ? g1 + 0.3 : L + 0.9;
      // пояс под светлыми этажами, пояс над первым этажом, венчающий карниз
      if (lightFrom < NF) { var yb = GH + lightFrom * FH; f.R('dark', a0 < 0 ? -0.3 : a0, a1 > L ? L + 0.3 : a1, yb - 0.14, yb + 0.14, 0, 0.3); }
      f.R('dark', a0 < 0 ? -0.55 : a0, a1 > L ? L + 0.55 : a1, GH - 0.45, GH, -WT, 0.55); f.R('dark', a0 < 0 ? -0.35 : a0, a1 > L ? L + 0.35 : a1, GH, GH + 0.22, -WT, 0.35);
      f.R('dark', 0, L, YR, YR + 1.15, -WT, 0.02);
      [[0.2, 0.3], [0.5, 0.6], [0.8, 0.95]].forEach(function (c, i) { f.R('dark', a0 < 0 ? -c[1] : a0, a1 > L ? L + c[1] : a1, YR + c[0], YR + c[0] + 0.32, -WT - 0.1, c[1]); });
      groundFloor(f, L, g0, g1);
    }

    var W = function (w) { return { t: 'win', w: w }; }, Y = function (w) { return { t: 'bay', w: w }; }, P = function (w) { return { t: 'strip', w: w }; }, N = function (w) { return { t: 'none', w: w }; };
    var fit = function (list, L) { var s = 0, fx = 0; list.forEach(function (b) { if (b.t === 'none' || b.t === 'bay') fx += b.w; else s += b.w; }); var k = (L - fx) / s; return list.map(function (b) { return b.t === 'none' || b.t === 'bay' ? b : { t: b.t, w: b.w * k }; }); };
    var SL = AW + BL;
    // улица: юг (от башни вправо) и запад (к башне)
    facade(face(0, 0, 1, 0, 0, 1), fit([N(TW), W(9), Y(5.5), P(7.5), Y(5.5), P(7.5), Y(5.5), W(9.2)], SL), { lightFrom: NF - 2 });
    facade(face(0, -AL, 0, 1, -1, 0), fit([W(7), P(6), Y(5.5), P(7.5), Y(5.5), P(7.5), W(8), N(TW)], AL), { lightFrom: NF - 2 });
    // торцы
    facade(face(SL, 0, 0, -1, 1, 0), fit([W(4.5), P(6), W(4.5)], BD), { lightFrom: NF - 2 });
    facade(face(AW, -AL, -1, 0, 0, -1), fit([W(4.4), P(6), W(4.4)], AW), { lightFrom: NF - 2 });
    // двор: верхние четыре этажа светлые
    facade(face(SL, -BD, -1, 0, 0, -1), fit([W(7), Y(5.5), W(6), P(7.4), W(6), Y(5.5), W(4)], BL), { lightFrom: NF - 4 });
    facade(face(AW, -BD, 0, -1, 1, 0), fit([W(6), Y(5.5), W(6.5), P(7), W(6), Y(5.5), W(2)], AL - BD), { lightFrom: NF - 4 });

    // перекрытия, кровля, терраса на крыше
    var bx = function (m, x0, x1, y0, y1, z0, z1) { B.box(m, (x0 + x1) / 2 - CX, (y0 + y1) / 2, (z0 + z1) / 2 - CZ, x1 - x0, y1 - y0, z1 - z0); };
    for (var fl = 0; fl <= NF; fl++) { var y = GH + fl * FH, mm = fl === NF ? 'roof' : 'dark'; bx(mm, 0.1, AW - 0.1, y - 0.3, y, -AL + 0.1, -0.1); bx(mm, AW - 0.2, SL - 0.1, y - 0.3, y, -BD + 0.1, -0.1); }
    bx('roof', 0.1, AW - 0.1, 0, 0.2, -AL + 0.1, -0.1); bx('roof', AW - 0.2, SL - 0.1, 0, 0.2, -BD + 0.1, -0.1);
    bx('deck', 1.2, AW - 1.2, YR, YR + 0.1, -AL + 1.2, -BD + 1.2); bx('deck', 7.9, SL - 1.2, YR, YR + 0.1, -BD + 1.2, -1.2);
    function hut(x0, x1, z0, z1) { bx('brickL', x0, x1, YR, YR + 3, z0, z1); bx('dark', x0 - 0.35, x1 + 0.35, YR + 3, YR + 3.45, z0 - 0.35, z1 + 0.35); }
    hut(4, 10.5, -44, -31); hut(4.5, 10, -17, -10); hut(26, 33, -11, -4.5); hut(43, 50, -11, -4.5);
    function pergola(x0, x1, z0, z1) {
      [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { bx('metal', p[0] - 0.08, p[0] + 0.08, YR, YR + 2.6, p[1] - 0.08, p[1] + 0.08); });
      for (var x = x0; x <= x1 + 0.01; x += 0.7) bx('wood', x - 0.05, x + 0.05, YR + 2.6, YR + 2.76, z0 - 0.3, z1 + 0.3);
      bx('white', x0 + 0.6, x1 - 0.6, YR + 0.1, YR + 0.55, (z0 + z1) / 2 - 0.45, (z0 + z1) / 2 + 0.45);
    }
    pergola(3.5, 9.5, -28, -23.5); pergola(15, 21.5, -11, -5); pergola(35, 41, -11, -5.5);
    [[2.2, -48], [2.2, -38], [2.2, -21], [12.6, -26], [13, -3], [23.5, -2.4], [34, -2.4], [42, -12.5], [52.5, -2.4], [53, -12.5]].forEach(function (p) {
      bx('white', p[0] - 0.5, p[0] + 0.5, YR + 0.1, YR + 0.65, p[1] - 0.5, p[1] + 0.5); bx('green', p[0] - 0.45, p[0] + 0.45, YR + 0.65, YR + 1.5, p[1] - 0.45, p[1] + 0.45); });

    B.meshes(mats, group);

    /* ---------- круглая башня на углу ---------- */
    (function () {
      var r = 4.6, tx = 3 - CX, tz = -3 - CZ, top = YR + 2.4, td = -Math.PI / 4;     // td — «наружу», на юго-запад
      var add = function (geo, mat, y, cast) { var m = new T.Mesh(geo, mat); m.position.set(tx, y, tz); m.castShadow = cast !== false; m.receiveShadow = true; group.add(m); return m; };
      var brick = mats.brickD.clone(); brick.map = mats.brickD.map.clone(); brick.map.needsUpdate = true; brick.map.repeat.set(Math.round(2 * Math.PI * r / 2), (top - GH) / 2);
      add(new T.CylinderGeometry(r, r, top - GH, 56), brick, (GH + top) / 2);
      add(new T.CylinderGeometry(r - 0.05, r - 0.05, GH - 0.5, 56), mats.marble, (GH - 0.5) / 2);
      var arc = function (rad, h, a0, len) { return new T.CylinderGeometry(rad, rad, h, Math.max(6, Math.round(len * 14)), 1, true, a0, len); };
      add(arc(r + 0.01, GH - 1.3, td - 1.9, 3.8), mats.shop, 0.3 + (GH - 1.3) / 2, false);                 // витрина по кругу
      add(arc(r + 0.06, top - GH - 0.9, td - 0.24, 0.48), mats.glass2, GH + (top - GH - 0.9) / 2, false);      // сплошной стеклянный витраж на всю высоту
      [td - 0.24, td + 0.24].forEach(function (a) { var m = add(new T.BoxGeometry(0.14, top - GH - 0.9, 0.14), mats.metal, GH + (top - GH - 0.9) / 2); m.position.x += Math.sin(a) * (r + 0.08); m.position.z += Math.cos(a) * (r + 0.08); });
      for (var fl = 0; fl < NF; fl++) {
        var y0 = GH + fl * FH;
        [[td - 1.2, 0.72], [td + 0.48, 0.72]].forEach(function (w) {                                        // гнутые окна по сторонам от витража
          add(arc(r + 0.04, 1.85, w[0], w[1]), mats[glass()], y0 + 0.8 + 0.925, false);
          add(arc(r + 0.07, 0.07, w[0], w[1]), mats.metal, y0 + 0.8, false); add(arc(r + 0.07, 0.07, w[0], w[1]), mats.metal, y0 + 2.65, false);
        });
        add(new T.CylinderGeometry(r + 0.16, r + 0.16, 0.24, 56), mats.dark, y0 + 0.02);                    // тёмные пояса по этажам
      }
      [[0.5, GH - 0.45, 0.45], [0.3, GH + 0.1, 0.24]].forEach(function (c) { add(new T.CylinderGeometry(r + c[0], r + c[0], c[2], 56), mats.dark, c[1] + c[2] / 2 - 0.1); });
      add(new T.CylinderGeometry(r - 0.3, r - 0.3, 0.3, 40), mats.roof, top + 0.16);
      [[0.3, 0], [0.6, 0.34], [0.95, 0.68]].forEach(function (c) { add(new T.CylinderGeometry(r + c[0], r + c[0], 0.34, 56), mats.dark, top - 1.02 + c[1] + 0.17); });
    })();

    var parts = [{ x0: -CX, x1: AW - CX, z0: -AL - CZ, z1: -CZ }, { x0: AW - CX, x1: SL - CX, z0: -BD - CZ, z1: -CZ }];
    return { group: group, mats: mats, roofY: YR, parts: parts, tower: { x: 3 - CX, z: -3 - CZ, r: 4.6 } };
  }

  return { build: build };
})();
