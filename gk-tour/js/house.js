/* Дом ЖК «Новый Квартал» (Моздок, ул. Шевченко, 20), собранный по рендерам и планам застройщика.
   Г-образный корпус: антрацитовый кирпич, белые вертикальные лопатки, светлый кирпич верхних этажей, эркеры с ленточным
   остеклением, чёрные кружевные ограждения, круглая стеклянная башня на углу, витрины первого этажа в чёрном мраморе,
   эксплуатируемая кровля. Реализм: кирпич с картой нормалей и шероховатости, двухслойные окна (отражающее стекло +
   «комната» в глубине — настоящий параллакс), профилированные карнизы, интерьеры магазинов за витринами.
   Вся геометрия складывается в одну сетку на материал (~20 отрисовок на весь дом).
   Оси: X — вдоль южного фасада, Y — вверх, Z — на зрителя (юг). Башня — на юго-западном углу. */
window.GKHouse = (function () {
  'use strict';
  var T = THREE;

  /* ---------- сборщик геометрии: коробки, дуги, кольца ---------- */
  function Builder() { this.buf = {}; }
  Builder.prototype.b = function (mat) { return this.buf[mat] || (this.buf[mat] = { p: [], n: [], uv: [], i: [] }); };
  function mapUV(b, uu, vv, s, r) {
    if (s) { uu *= s[0]; vv *= s[1]; }
    if (r) { uu = r[0] + (r[2] - r[0]) * uu; vv = r[1] + (r[3] - r[1]) * vv; }
    b.uv.push(uu, vv);
  }
  Builder.prototype.box = function (mat, cx, cy, cz, sx, sy, sz, opt) {
    if (sx <= 0 || sy <= 0 || sz <= 0) return;
    var b = this.b(mat);
    var hx = sx / 2, hy = sy / 2, hz = sz / 2, x0 = cx - hx, x1 = cx + hx, y0 = cy - hy, y1 = cy + hy, z0 = cz - hz, z1 = cz + hz;
    var F = [
      [[x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], [1, 0, 0]],
      [[x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], [-1, 0, 0]],
      [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], [0, 0, 1]],
      [[x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], [0, 0, -1]],
      [[x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], [0, 1, 0]],
      [[x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], [0, -1, 0]]
    ];
    var U01 = [[0, 0], [1, 0], [1, 1], [0, 1]], uv01 = opt && (opt.uv01 || opt.uv || opt.uvs), rc = opt && opt.uv, sc = opt && opt.uvs;
    var only = !opt ? null : opt.only != null ? opt.only : opt.top ? 4 : opt.bottom ? 5 : null;
    for (var f = 0; f < 6; f++) {
      if (only != null && only !== f) continue;
      var q = F[f], nn = q[4], base = b.p.length / 3;
      for (var k = 0; k < 4; k++) {
        var v = q[k];
        b.p.push(v[0], v[1], v[2]); b.n.push(nn[0], nn[1], nn[2]);
        if (uv01) mapUV(b, U01[k][0], U01[k][1], sc, rc);
        else if (nn[0]) b.uv.push(v[2], v[1]);
        else if (nn[2]) b.uv.push(v[0], v[1]);
        else b.uv.push(v[0], v[2]);
      }
      b.i.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }
  };
  // дуга цилиндра: точка = (cx + sin a · r, y, cz + cos a · r), нормаль наружу
  Builder.prototype.arc = function (mat, cx, cz, r, y0, y1, a0, a1, opt) {
    var b = this.b(mat), n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.09)), base = b.p.length / 3, i;
    var uv01 = opt && (opt.uv01 || opt.uv || opt.uvs), rc = opt && opt.uv, sc = opt && opt.uvs;
    for (i = 0; i <= n; i++) {
      var t = i / n, a = a0 + (a1 - a0) * t, s = Math.sin(a), c = Math.cos(a);
      for (var k = 0; k < 2; k++) {
        b.p.push(cx + s * r, k ? y1 : y0, cz + c * r); b.n.push(s, 0, c);
        if (uv01) mapUV(b, t, k, sc, rc); else b.uv.push(a * r, k ? y1 : y0);
      }
    }
    for (i = 0; i < n; i++) { var q = base + i * 2; b.i.push(q, q + 2, q + 3, q, q + 3, q + 1); }
  };
  // плоский сектор кольца (верх или низ)
  Builder.prototype.disc = function (mat, cx, cz, r0, r1, y, a0, a1, up, opt) {
    var b = this.b(mat), n = Math.max(1, Math.ceil(Math.abs(a1 - a0) / 0.09)), base = b.p.length / 3, i;
    var uv01 = opt && (opt.uv01 || opt.uv || opt.uvs), rc = opt && opt.uv, sc = opt && opt.uvs;
    for (i = 0; i <= n; i++) {
      var t = i / n, a = a0 + (a1 - a0) * t, s = Math.sin(a), c = Math.cos(a);
      for (var k = 0; k < 2; k++) {
        var rr = k ? r1 : r0;
        b.p.push(cx + s * rr, y, cz + c * rr); b.n.push(0, up ? 1 : -1, 0);
        if (uv01) mapUV(b, t, k, sc, rc); else b.uv.push(cx + s * rr, cz + c * rr);
      }
    }
    for (i = 0; i < n; i++) { var q = base + i * 2; if (up) b.i.push(q, q + 1, q + 3, q, q + 3, q + 2); else b.i.push(q, q + 3, q + 1, q, q + 2, q + 3); }
  };
  Builder.prototype.ring = function (mat, cx, cz, r0, r1, y0, y1, a0, a1) {
    this.arc(mat, cx, cz, r1, y0, y1, a0, a1);
    this.disc(mat, cx, cz, r0, r1, y1, a0, a1, true); this.disc(mat, cx, cz, r0, r1, y0, a0, a1, false);
  };
  // радиальная плоскость (откос проёма в цилиндре); dir = +1 — нормаль в сторону роста угла
  Builder.prototype.radial = function (mat, cx, cz, a, r0, r1, y0, y1, dir) {
    var b = this.b(mat), base = b.p.length / 3, s = Math.sin(a), c = Math.cos(a), nx = c * dir, nz = -s * dir;
    [[r0, y0], [r1, y0], [r1, y1], [r0, y1]].forEach(function (v) { b.p.push(cx + s * v[0], v[1], cz + c * v[0]); b.n.push(nx, 0, nz); b.uv.push(v[0], v[1]); });
    if (dir < 0) b.i.push(base, base + 1, base + 2, base, base + 2, base + 3); else b.i.push(base, base + 2, base + 1, base, base + 3, base + 2);
  };
  Builder.prototype.sphere = function (mat, cx, cy, cz, rx, ry, rz) {
    var b = this.b(mat), base = b.p.length / 3, NU = 9, NV = 6, i, j;
    for (j = 0; j <= NV; j++) for (i = 0; i <= NU; i++) {
      var th = i / NU * Math.PI * 2, ph = j / NV * Math.PI, sx = Math.sin(ph) * Math.cos(th), sy = Math.cos(ph), sz = Math.sin(ph) * Math.sin(th);
      b.p.push(cx + sx * rx, cy + sy * ry, cz + sz * rz); b.n.push(sx, sy, sz); b.uv.push(i / NU * 3, j / NV * 2);
    }
    for (j = 0; j < NV; j++) for (i = 0; i < NU; i++) { var q = base + j * (NU + 1) + i, q2 = q + NU + 1; b.i.push(q, q + 1, q2, q + 1, q2 + 1, q2); }
  };
  Builder.prototype.cone = function (mat, cx, y0, cz, r, h, n) {
    var b = this.b(mat), base = b.p.length / 3, l = Math.sqrt(r * r + h * h), i;
    for (i = 0; i <= n; i++) {
      var a = i / n * Math.PI * 2, s = Math.sin(a), c = Math.cos(a);
      b.p.push(cx + s * r, y0, cz + c * r, cx, y0 + h, cz); b.n.push(s * h / l, r / l, c * h / l, s * h / l, r / l, c * h / l); b.uv.push(i / n, 0, i / n, 1);
    }
    for (i = 0; i < n; i++) { var q = base + i * 2; b.i.push(q, q + 2, q + 1); }
  };
  Builder.prototype.meshes = function (mats, group) {
    for (var k in this.buf) {
      var b = this.buf[k], g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(b.p, 3));
      g.setAttribute('normal', new T.Float32BufferAttribute(b.n, 3));
      g.setAttribute('uv', new T.Float32BufferAttribute(b.uv, 2));
      g.setIndex(b.i);
      var m = new T.Mesh(g, mats[k]);
      m.castShadow = k.indexOf('glass') !== 0 && k !== 'shop' && k !== 'lace';
      m.receiveShadow = k !== 'lace' && k !== 'glassPane'; m.name = k;
      if (k === 'glassPane') m.renderOrder = 2; else if (k === 'lace') m.renderOrder = 3;
      group.add(m);
    }
  };

  /* ---------- «фасад»: своя система координат u (вдоль), y (вверх), n (наружу) ---------- */
  function Face(B, ox, oz, dx, dz, nx, nz) { this.B = B; this.ox = ox; this.oz = oz; this.dx = dx; this.dz = dz; this.nx = nx; this.nz = nz; this.fi = nx > 0 ? 0 : nx < 0 ? 1 : nz > 0 ? 2 : 3; }
  Face.prototype.R = function (m, u0, u1, y0, y1, n0, n1, opt) {
    var uc = (u0 + u1) / 2, nc = (n0 + n1) / 2, du = u1 - u0, dn = n1 - n0;
    if (opt && opt.front) opt.only = this.fi;      // только наружная грань (плоскость на отметке n1)
    this.B.box(m, this.ox + this.dx * uc + this.nx * nc, (y0 + y1) / 2, this.oz + this.dz * uc + this.nz * nc,
      Math.abs(this.dx) * du + Math.abs(this.nx) * dn, y1 - y0, Math.abs(this.dz) * du + Math.abs(this.nz) * dn, opt);
  };

  function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; var t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

  /* ---------- текстуры (рисуются на лету, файлов не нужно) ---------- */
  function cv(w, h) { var c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
  function tx(c, srgb, rep) {
    var t = new T.CanvasTexture(c); if (srgb) t.encoding = T.sRGBEncoding; t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = T.RepeatWrapping; t.repeat.set(rep, rep); }
    return t;
  }
  // кирпичная кладка: 1024 px = 4 м, кирпич 25 × 6,5 см, шов 1 см; цвет + нормали + шероховатость
  function brickSet(o) {
    var W = 1024, r = rng(o.seed), cols = 16, rows = 52, bw = W / cols, bh = W / rows, J = 2.6, i;
    var ca = cv(W, W), g = ca.getContext('2d'), ch = cv(W, W), h = ch.getContext('2d', { willReadFrequently: true });
    g.fillStyle = o.joint; g.fillRect(0, 0, W, W); h.fillStyle = '#000'; h.fillRect(0, 0, W, W);
    for (var row = 0; row < rows; row++) {
      var y = Math.round(row * bh), hh = Math.round((row + 1) * bh) - y - J, off = row % 2 ? bw / 2 : 0;
      for (var col = -1; col < cols; col++) {
        var x = col * bw + off + J / 2, c = o.pal[(r() * o.pal.length) | 0], l = (r() - 0.5) * o.vary, hv = 190 + (r() * 60 | 0);
        for (var k = 0; k < 2; k++) {
          if (k && x >= 0) break;
          var xx = x + k * W;
          g.fillStyle = c; g.fillRect(xx, y + J / 2, bw - J, hh);
          g.fillStyle = l > 0 ? 'rgba(255,244,230,' + l + ')' : 'rgba(0,0,0,' + (-l) + ')'; g.fillRect(xx, y + J / 2, bw - J, hh);
          h.fillStyle = 'rgb(' + hv + ',' + hv + ',' + hv + ')'; h.fillRect(xx, y + J / 2, bw - J, hh);
        }
      }
    }
    for (i = 0; i < 16000; i++) {                                   // зерно обжига
      var px = r() * W, py = r() * W, s = 1 + r() * 2.2, a = r() * 0.1;
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,' + a + ')' : 'rgba(255,240,220,' + a * 0.8 + ')'; g.fillRect(px, py, s, s);
      h.fillStyle = 'rgba(0,0,0,' + a * 1.6 + ')'; h.fillRect(px, py, s, s);
    }
    for (i = 0; i < 10; i++) {                                      // крупные пятна — чтобы не читался повтор
      var bx = 220 + r() * 580, by = 220 + r() * 580, br = 90 + r() * 110, gr = g.createRadialGradient(bx, by, 0, bx, by, br);
      gr.addColorStop(0, r() < 0.5 ? 'rgba(0,0,0,.05)' : 'rgba(255,235,210,.025)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr; g.fillRect(bx - br, by - br, 2 * br, 2 * br);
    }
    var src = h.getImageData(0, 0, W, W).data, cn = cv(W, W), gn = cn.getContext('2d'), im = gn.createImageData(W, W), d = im.data;
    var cr = cv(W, W), g2 = cr.getContext('2d'), im2 = g2.createImageData(W, W), d2 = im2.data;
    for (var yy = 0; yy < W; yy++) {
      var yu = ((yy + W - 1) % W) * W, yd = ((yy + 1) % W) * W, y0 = yy * W;
      for (var xq = 0; xq < W; xq++) {
        var q = (y0 + xq) * 4, hl = src[(y0 + (xq + W - 1) % W) * 4], hr = src[(y0 + (xq + 1) % W) * 4], hu = src[(yu + xq) * 4], hd = src[(yd + xq) * 4];
        var nx = -(hr - hl) / 255 * o.bump, ny = (hd - hu) / 255 * o.bump, il = 1 / Math.sqrt(nx * nx + ny * ny + 1);
        d[q] = (nx * il * 0.5 + 0.5) * 255; d[q + 1] = (ny * il * 0.5 + 0.5) * 255; d[q + 2] = (il * 0.5 + 0.5) * 255; d[q + 3] = 255;
        d2[q] = d2[q + 1] = d2[q + 2] = 255 - src[q] * o.gloss; d2[q + 3] = 255;
      }
    }
    gn.putImageData(im, 0, 0); g2.putImageData(im2, 0, 0);
    return { map: tx(ca, true, 0.25), normalMap: tx(cn, false, 0.25), roughnessMap: tx(cr, false, 0.25) };
  }
  // «комната» за стеклом: lit=false — дневной вид (тёмный интерьер, светлые шторы), lit=true — вечерний свет
  function roomTex(kind, lit) {
    var W = 256, H = 256, c = cv(W, H), g = c.getContext('2d'), gr = g.createLinearGradient(0, 0, 0, H), i;
    if (!lit) { gr.addColorStop(0, '#3c3f45'); gr.addColorStop(0.55, '#26282c'); gr.addColorStop(1, '#151618'); }
    else if (kind === 3) { gr.addColorStop(0, '#f1f4ff'); gr.addColorStop(0.6, '#c3cdea'); gr.addColorStop(1, '#5f6885'); }
    else if (kind === 2) { gr.addColorStop(0, '#fff3d6'); gr.addColorStop(0.6, '#f7c98c'); gr.addColorStop(1, '#8e5a30'); }
    else { gr.addColorStop(0, '#ffdfa6'); gr.addColorStop(0.6, '#f0a85e'); gr.addColorStop(1, '#7a4722'); }
    g.fillStyle = gr; g.fillRect(0, 0, W, H);
    g.fillStyle = lit ? 'rgba(255,255,255,.35)' : 'rgba(255,255,255,.07)'; g.fillRect(0, 0, W, 30);          // потолок
    g.fillStyle = lit ? 'rgba(90,50,20,.34)' : 'rgba(0,0,0,.38)';
    if (kind === 1) g.fillRect(104, 92, 48, 130);                                                             // дверной проём
    else if (kind === 2) g.fillRect(96, 84, 64, 42);                                                          // картина
    else if (kind === 3) g.fillRect(84, 156, 88, 66);                                                         // диван
    else g.fillRect(150, 110, 30, 112);                                                                       // шкаф
    if (lit) {
      var lx = 128 + (kind - 2) * 24, lg = g.createRadialGradient(lx, 54, 2, lx, 54, 74);
      lg.addColorStop(0, 'rgba(255,255,240,.95)'); lg.addColorStop(1, 'rgba(255,255,240,0)'); g.fillStyle = lg; g.fillRect(0, 0, W, 170);
    }
    g.fillStyle = lit ? 'rgba(70,40,18,.5)' : 'rgba(0,0,0,.4)'; g.fillRect(0, H - 34, W, 34);                // пол
    var cur = kind === 0 ? [[36, 54], [166, 54]] : kind === 1 ? [[36, 36], [184, 36]] : kind === 2 ? [[36, 66]] : [[176, 44]];
    cur.forEach(function (q) {                                                                                // шторы со складками
      for (i = 0; i < q[1]; i += 6) {
        var sh = 0.5 + 0.5 * Math.sin(i * 0.9 + q[0]);
        g.fillStyle = lit ? 'rgba(' + (255 - sh * 50 | 0) + ',' + (228 - sh * 60 | 0) + ',' + (186 - sh * 70 | 0) + ',.93)'
          : 'rgba(' + (200 - sh * 54 | 0) + ',' + (194 - sh * 54 | 0) + ',' + (184 - sh * 54 | 0) + ',.92)';
        g.fillRect(q[0] + i, 16, 6.5, H - 28);
      }
    });
    var t = tx(c, true); t.wrapS = t.wrapT = T.RepeatWrapping; return t;
  }
  // атлас интерьеров магазинов: 4 задние стены (верх), потолок со спотами и пол (низ)
  function shopAtlas() {
    var c = cv(1024, 512), g = c.getContext('2d'), r = rng(311), k, i, j, gr;
    for (k = 0; k < 4; k++) {
      var x = k * 256;
      gr = g.createLinearGradient(0, 0, 0, 384); gr.addColorStop(0, '#fff1d6'); gr.addColorStop(0.55, '#f3c890'); gr.addColorStop(1, '#a8743f');
      g.fillStyle = gr; g.fillRect(x, 0, 256, 384);
      g.fillStyle = 'rgba(120,75,35,.16)'; for (i = 1; i < 4; i++) g.fillRect(x + i * 64, 0, 2, 384);
      if (k === 0) {                                                 // стеллажи с товаром
        for (i = 0; i < 4; i++) {
          var sy = 132 + i * 58; g.fillStyle = 'rgba(70,42,20,.75)'; g.fillRect(x + 22, sy, 212, 5);
          for (j = 0; j < 9; j++) { var hh = 16 + r() * 26; g.fillStyle = ['rgba(90,60,40,.7)', 'rgba(170,120,80,.75)', 'rgba(240,225,195,.85)', 'rgba(60,70,60,.6)'][(r() * 4) | 0]; g.fillRect(x + 28 + j * 23, sy - hh, 15, hh); }
        }
      } else if (k === 1) {                                          // бутик: штанга с одеждой и зеркало
        g.fillStyle = 'rgba(60,40,22,.8)'; g.fillRect(x + 24, 150, 150, 4);
        for (i = 0; i < 8; i++) { g.fillStyle = ['rgba(40,40,46,.7)', 'rgba(150,110,80,.7)', 'rgba(240,230,210,.85)', 'rgba(110,60,50,.65)'][i % 4]; g.fillRect(x + 30 + i * 18, 156, 13, 110 + (i % 3) * 22); }
        g.fillStyle = 'rgba(255,255,245,.55)'; g.fillRect(x + 194, 120, 42, 190);
      } else if (k === 2) {                                          // кафе: стойка и панно
        g.fillStyle = 'rgba(50,34,22,.8)'; g.fillRect(x + 18, 270, 220, 114); g.fillStyle = 'rgba(214,166,106,.85)'; g.fillRect(x + 18, 264, 220, 8);
        g.fillStyle = 'rgba(40,30,24,.62)'; for (i = 0; i < 3; i++) g.fillRect(x + 30 + i * 70, 120, 56, 74);
      } else {                                                       // лобби: арочные ниши и зелень
        g.fillStyle = 'rgba(255,250,235,.45)';
        for (i = 0; i < 2; i++) { g.beginPath(); g.moveTo(x + 36 + i * 110, 384); g.lineTo(x + 36 + i * 110, 190); g.arc(x + 74 + i * 110, 190, 38, Math.PI, 0); g.lineTo(x + 112 + i * 110, 384); g.fill(); }
        g.fillStyle = 'rgba(60,90,50,.75)'; g.beginPath(); g.arc(x + 128, 318, 26, 0, 7); g.fill(); g.fillStyle = 'rgba(40,30,24,.7)'; g.fillRect(x + 116, 340, 24, 44);
      }
      for (i = 0; i < 3; i++) {                                      // подвесы
        var lx = x + 48 + i * 80, lg = g.createRadialGradient(lx, 64, 1, lx, 64, 46);
        lg.addColorStop(0, 'rgba(255,255,245,1)'); lg.addColorStop(1, 'rgba(255,255,245,0)'); g.fillStyle = lg; g.fillRect(lx - 46, 18, 92, 92);
        g.fillStyle = 'rgba(40,30,20,.8)'; g.fillRect(lx - 0.75, 0, 1.5, 56);
      }
    }
    g.fillStyle = '#e6caa0'; g.fillRect(0, 384, 512, 128);
    for (i = 0; i < 4; i++) for (k = 0; k < 2; k++) {
      var sx = 64 + i * 128, sy2 = 416 + k * 64, sg = g.createRadialGradient(sx, sy2, 1, sx, sy2, 24);
      sg.addColorStop(0, 'rgba(255,255,250,1)'); sg.addColorStop(1, 'rgba(255,255,250,0)'); g.fillStyle = sg; g.fillRect(sx - 24, sy2 - 24, 48, 48);
    }
    g.fillStyle = '#c4a172'; g.fillRect(512, 384, 512, 128);
    return tx(c, true);
  }
  function marbleTex() {                             // чёрный мрамор с тонкими золотисто-белыми прожилками
    var W = 512, c = cv(W, W), g = c.getContext('2d'), r = rng(77), i, k;
    g.fillStyle = '#0c0c0e'; g.fillRect(0, 0, W, W);
    for (i = 0; i < 24; i++) { var bx = r() * W, by = r() * W, br = 40 + r() * 90, gr = g.createRadialGradient(bx, by, 0, bx, by, br); gr.addColorStop(0, 'rgba(70,68,74,.22)'); gr.addColorStop(1, 'rgba(70,68,74,0)'); g.fillStyle = gr; g.fillRect(bx - br, by - br, 2 * br, 2 * br); }
    for (i = 0; i < 24; i++) {
      var x = r() * W, y = r() * W, a = r() * 6.28, big = r() < 0.3;
      g.strokeStyle = 'rgba(' + (big ? '230,216,188' : '176,170,164') + ',' + (big ? 0.36 : 0.17) + ')'; g.lineWidth = big ? 1.5 : 0.8; g.beginPath(); g.moveTo(x, y);
      for (k = 0; k < 16; k++) { a += (r() - 0.5) * 0.9; x += Math.cos(a) * 26; y += Math.sin(a) * 26; g.lineTo(x, y); }
      g.stroke();
    }
    return tx(c, true, 1 / 2.6);
  }
  function deckTex() {                               // террасная доска, терракот
    var W = 256, c = cv(W, W), g = c.getContext('2d'), r = rng(13), i, k;
    for (i = 0; i < 8; i++) {
      var v = 0.86 + r() * 0.26; g.fillStyle = 'rgb(' + (168 * v | 0) + ',' + (104 * v | 0) + ',' + (78 * v | 0) + ')'; g.fillRect(0, i * 32, W, 32);
      g.fillStyle = 'rgba(40,18,10,.75)'; g.fillRect(0, i * 32, W, 2.5);
      for (k = 0; k < 14; k++) { g.fillStyle = 'rgba(60,25,12,' + r() * 0.14 + ')'; g.fillRect(r() * W, i * 32 + 4 + r() * 24, 30 + r() * 80, 1); }
      if (r() < 0.7) { g.fillStyle = 'rgba(40,18,10,.6)'; g.fillRect(r() * W, i * 32, 2, 32); }
    }
    return tx(c, true, 1 / 1.2);
  }
  function leafTex() {
    var W = 128, c = cv(W, W), g = c.getContext('2d'), r = rng(21), i;
    g.fillStyle = '#3d6a33'; g.fillRect(0, 0, W, W);
    for (i = 0; i < 900; i++) { g.fillStyle = ['rgba(20,50,20,.5)', 'rgba(110,160,70,.5)', 'rgba(70,120,50,.5)'][(r() * 3) | 0]; g.beginPath(); g.arc(r() * W, r() * W, 1.5 + r() * 4, 0, 7); g.fill(); }
    return tx(c, true, 1);
  }
  function laceTex() {                               // кружевное кованое ограждение французского балкона
    var W = 512, H = 256, c = cv(W, H), g = c.getContext('2d'), i, n = 8, st = W / n, y0 = 52, y1 = H - 54, cy = (y0 + y1) / 2;
    g.clearRect(0, 0, W, H); g.strokeStyle = '#0b0b0d'; g.fillStyle = '#0b0b0d'; g.lineCap = 'round';
    g.fillRect(0, 0, W, 15); g.fillRect(0, H - 13, W, 13); g.fillRect(0, y0 - 7, W, 7); g.fillRect(0, y1, W, 7);
    for (i = 0; i <= n; i++) {
      var x = i * st, cx = x + st / 2;
      g.lineWidth = i === 0 || i === n ? 16 : 6; g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke();
      if (i === n) break;
      g.lineWidth = 4.6;
      g.beginPath(); g.moveTo(cx, y0); g.quadraticCurveTo(x + st - 3, cy, cx, y1); g.quadraticCurveTo(x + 3, cy, cx, y0); g.stroke();   // «миндаль»
      g.beginPath(); g.moveTo(x, y0); g.lineTo(x + st, y1); g.moveTo(x + st, y0); g.lineTo(x, y1); g.stroke();                         // перекрестье
      g.beginPath(); g.arc(cx, cy, 12, 0, 7); g.stroke(); g.beginPath(); g.arc(cx, cy, 4, 0, 7); g.fill();
      g.lineWidth = 4; g.beginPath(); g.arc(cx, 30, 11, 0, 7); g.stroke(); g.beginPath(); g.arc(x + st / 4, 30, 6, 0, 7); g.stroke(); g.beginPath(); g.arc(x + st * 3 / 4, 30, 6, 0, 7); g.stroke();
      g.beginPath(); g.arc(cx - 14, H - 33, 11, 0, 7); g.stroke(); g.beginPath(); g.arc(cx + 14, H - 33, 11, 0, 7); g.stroke();
    }
    return tx(c, true);
  }

  function materials() {
    var bD = brickSet({ seed: 5, joint: '#131112', pal: ['#262425', '#292627', '#232223', '#2c2726', '#25242a', '#201f20', '#302926', '#28262a'], vary: 0.09, bump: 1.7, gloss: 0.4 });
    var bL = brickSet({ seed: 9, joint: '#bdb5a7', pal: ['#ece6db', '#e6dfd2', '#f0ebe2', '#e8e1d5', '#dfd7c9', '#e9e0d0'], vary: 0.08, bump: 1.3, gloss: 0.2 });
    // r128 считает hex-цвета линейными — переводим из sRGB, иначе тёмные тона выходят серыми
    var S = function (o) { if (o.color != null) o.color = new T.Color(o.color).convertSRGBToLinear(); return new T.MeshStandardMaterial(o); }, NS = new T.Vector2(0.9, 0.9), atlas = shopAtlas();
    var m = {
      brickD: S({ map: bD.map, normalMap: bD.normalMap, roughnessMap: bD.roughnessMap, normalScale: NS, roughness: 0.9 }),      // антрацитовый кирпич
      brickL: S({ map: bL.map, normalMap: bL.normalMap, roughnessMap: bL.roughnessMap, normalScale: NS, roughness: 1, color: 0xf1e8da }), // светлый кирпич верхних этажей
      white: S({ map: bL.map, normalMap: bL.normalMap, normalScale: NS, roughness: 0.9, color: 0xffffff }),                     // белые вертикальные лопатки
      dark: S({ color: 0x2d2d31, roughness: 0.74, metalness: 0 }),                                                          // карнизы, пояса
      marble: S({ map: marbleTex(), roughness: 0.13, metalness: 0.22 }),                                                       // полированный чёрный мрамор
      metal: S({ color: 0x1a1b1e, roughness: 0.46, metalness: 0.35 }),                                                          // тёмный алюминий рам
      brass: S({ color: 0xc39a62, roughness: 0.34, metalness: 0.55 }),                                                         // латунные акценты
      roof: S({ color: 0x5a5a5e, roughness: 0.95 }),
      deck: S({ map: deckTex(), roughness: 0.82 }),                                                                            // терракотовый настил террасы
      wood: S({ color: 0x8a6243, roughness: 0.8 }),
      fabric: S({ color: 0xeee8dc, roughness: 0.95 }),
      green: S({ map: leafTex(), roughness: 0.95 }),
      lace: S({ map: laceTex(), transparent: true, alphaTest: 0.03, depthWrite: false, side: T.DoubleSide, roughness: 0.5, metalness: 0.4 }),
      glassPane: S({ color: 0xb9c8d6, roughness: 0.05, metalness: 1, transparent: true, opacity: 0.38, depthWrite: false }),   // само стекло: отражения неба
      glass0: S({ map: roomTex(0, false), roughness: 0.9 }),                                                                   // комната без света
      shop: S({ color: 0xa89078, map: atlas, roughness: 0.8, emissive: 0xffffff, emissiveMap: atlas, emissiveIntensity: 0.5 }) // интерьеры магазинов
    };
    for (var k = 1; k <= 3; k++) m['glass' + k] = S({ map: roomTex(k, false), roughness: 0.9, emissive: 0xffffff, emissiveMap: roomTex(k, true), emissiveIntensity: 0 });
    return m;
  }

  /* профили тяг: [смещение по высоте, высота, вынос] */
  var CROWN = [[0, 0.5, 0.04], [0.5, 0.1, 0.16], [0.6, 0.2, 0.3], [0.8, 0.06, 0.23], [0.86, 0.22, 0.55], [1.08, 0.06, 0.47], [1.14, 0.26, 0.85], [1.4, 0.1, 0.95]];
  var BELT = [[0, 0.34, 0.08], [0.34, 0.06, 0.17], [0.4, 0.16, 0.42], [0.56, 0.04, 0.33], [0.6, 0.08, 0.22]];
  var BELT2 = [[0, 0.06, 0.13], [0.06, 0.14, 0.25], [0.2, 0.04, 0.17]];
  var SW = [0, 1, 2, 3].map(function (k) { return [k / 4 + 0.004, 0.254, (k + 1) / 4 - 0.004, 0.996]; }), SCEIL = [0.004, 0.004, 0.496, 0.246], SFLOOR = [0.52, 0.02, 0.98, 0.23];

  /* ---------- сам дом ---------- */
  function build(cfg) {
    var GH = cfg.groundH, FH = cfg.floorH, NF = cfg.floors - 1, YR = GH + NF * FH, WT = 0.4;
    var AW = cfg.wingA[0], AL = cfg.wingA[1], BL = cfg.wingB[0], BD = cfg.wingB[1], TW = 6.5;   // TW — место под башню на фасадах
    var CX = (AW + BL) / 2, CZ = -AL / 2;                 // центр дома → в начало координат
    var B = new Builder(), R = rng(2028), mats = materials(), group = new T.Group(), fIdx = 0;
    var glass = function () { var x = R(); return x < 0.42 ? 'glass0' : x < 0.66 ? 'glass1' : x < 0.86 ? 'glass2' : 'glass3'; };
    var face = function (x, z, dx, dz, nx, nz) { return new Face(B, x - CX, z - CZ, dx, dz, nx, nz); };

    function frame(f, a, b, y0, y1, n0, n1, mu, tr) {      // тонкая тёмная рама с импостами
      var t = 0.055, j;
      f.R('metal', a, a + t, y0, y1, n0, n1); f.R('metal', b - t, b, y0, y1, n0, n1);
      f.R('metal', a + t, b - t, y0, y0 + t, n0, n1); f.R('metal', a + t, b - t, y1 - t, y1, n0, n1);
      for (j = 1; j <= mu; j++) { var x = a + (b - a) * j / (mu + 1); f.R('metal', x - 0.025, x + 0.025, y0 + t, y1 - t, n0, n1 - 0.015); }
      if (tr) f.R('metal', a + t, b - t, y1 - 0.64, y1 - 0.595, n0, n1 - 0.015);
    }
    function opening(f, a, b, y0, o, m) {                  // окно в кирпичной стене: откосы, стекло, комната в глубине
      var sill = y0 + o.sill, head = y0 + o.head, e = o.e == null ? 0.42 : o.e;
      f.R(m, a, b, head, y0 + FH, -WT, 0); f.R(m, a, b, y0, sill, -WT, 0);
      f.R(glass(), a - e, b + e, sill - 0.2, head + 0.12, -0.9, -0.84, { front: true, uv01: true });
      f.R('glassPane', a, b, sill, head, -0.26, -0.25, { front: true });
      frame(f, a, b, sill, head, -0.25, -0.17, o.mull == null ? 1 : o.mull, o.head - o.sill > 1.6);
      f.R('dark', a - 0.05, b + 0.05, sill - 0.05, sill, -0.2, 0.06);                                    // отлив
      if (o.lace) {
        f.R('dark', a - 0.1, b + 0.1, y0 + 0.04, y0 + 0.12, 0, 0.17);                                    // плита французского балкона
        f.R('lace', a - 0.06, b + 0.06, y0 + 0.12, y0 + 1.16, 0.12, 0.135, { front: true, uv01: true });
      }
    }
    function wall(f, u0, u1, y0, list, m) {
      var sum = 0; list.forEach(function (o) { sum += o.w; });
      var gap = (u1 - u0 - sum) / (list.length + 1), u = u0;
      list.forEach(function (o) { f.R(m, u, u + gap, y0, y0 + FH, -WT, 0); u += gap; opening(f, u, u + o.w, y0, o, m); u += o.w; });
      f.R(m, u, u1, y0, y0 + FH, -WT, 0);
    }
    // окна в пол с французскими балконами (кружевные ограждения)
    function winBay(f, u0, u1, y0, m) {
      var n = Math.max(1, Math.round((u1 - u0) / 3.1)), list = [];
      if (u1 - u0 < 2.4) { f.R(m, u0, u1, y0, y0 + FH, -WT, 0); return; }
      for (var i = 0; i < n; i++) list.push({ w: 1.6, sill: 0.28, head: 2.72, lace: true });
      wall(f, u0, u1, y0, list, m);
    }
    // эркер: выступающий объём с ленточным остеклением и стеклянными боковинами
    function bay(f, u0, u1, y0, m) {
      var a = u0 + 0.35, b = u1 - 0.35, out = 0.95, sp = 0.9, top = y0 + FH, yg0 = y0 + sp, yg1 = top - 0.32, i;
      f.R(m, u0, a, y0, top, -WT, 0); f.R(m, b, u1, y0, top, -WT, 0);
      f.R(m, a, b, y0 + 0.1, yg0, -0.1, out);                                                            // кирпичный подоконный пояс
      f.R('dark', a - 0.07, b + 0.07, y0 - 0.06, y0 + 0.1, -0.1, out + 0.07);                            // плита перекрытия
      f.R('dark', a - 0.035, b + 0.035, yg1, top - 0.06, -0.1, out + 0.035);                             // надоконная тяга
      f.R('fabric', a + 0.05, b - 0.05, yg0 - 0.02, yg0 + 0.03, -0.5, out - 0.09);                       // подоконник
      f.R(glass(), a - 0.3, b + 0.3, yg0 - 0.2, yg1 + 0.12, -0.66, -0.6, { front: true, uvs: [Math.max(1, Math.round((b - a) / 2.3)), 1] });
      f.R('glassPane', a + 0.04, b - 0.04, yg0, yg1, out - 0.06, out - 0.05, { front: true });
      f.R('glassPane', a + 0.04, a + 0.05, yg0, yg1, 0, out - 0.05); f.R('glassPane', b - 0.05, b - 0.04, yg0, yg1, 0, out - 0.05);
      var n = Math.max(2, Math.round((b - a) / 1.2));
      for (i = 0; i <= n; i++) { var x = a + 0.035 + (b - a - 0.07) * i / n; f.R('metal', x - 0.035, x + 0.035, yg0, yg1, out - 0.1, out); }
      f.R('metal', a, b, yg0, yg0 + 0.05, out - 0.09, out); f.R('metal', a, b, yg1 - 0.05, yg1, out - 0.09, out);
      f.R('metal', a, b, yg1 - 0.66, yg1 - 0.615, out - 0.085, out - 0.01);
      [[a, a + 0.07], [b - 0.07, b]].forEach(function (s) {                                              // боковины
        f.R('metal', s[0], s[1], yg0, yg0 + 0.05, 0, out - 0.1); f.R('metal', s[0], s[1], yg1 - 0.05, yg1, 0, out - 0.1);
        f.R('metal', s[0], s[1], yg1 - 0.66, yg1 - 0.615, 0, out - 0.1); f.R('metal', s[0], s[1], yg0, yg1, 0, 0.07);
      });
    }
    // зона белых вертикальных лопаток с узкими окнами между ними
    function strip(f, u0, u1, y0, m) {
      var n = Math.max(2, Math.round((u1 - u0) / 1.3)), st = (u1 - u0) / n;
      for (var i = 0; i < n; i++) {
        var a = u0 + i * st, c = a + st / 2;
        f.R(m, a, c - 0.4, y0, y0 + FH, -WT, 0); f.R(m, c + 0.4, a + st, y0, y0 + FH, -WT, 0);
        opening(f, c - 0.4, c + 0.4, y0, { sill: 0.5, head: 2.74, mull: 0, e: 0.22 }, m);
      }
    }
    function stripPilasters(f, u0, u1) {                    // сами лопатки — сплошные, на всю высоту
      var n = Math.max(2, Math.round((u1 - u0) / 1.3)), st = (u1 - u0) / n;
      for (var i = 0; i <= n; i++) {
        var x = u0 + i * st;
        f.R('white', x - 0.19, x + 0.19, GH + 0.02, YR - 0.25, 0, 0.21);
        f.R('dark', x - 0.23, x + 0.23, GH + 0.02, GH + 0.3, 0, 0.25);                                   // тёмная база
      }
    }
    // первый этаж: чёрный мрамор, витрины в пол, за стеклом — освещённые интерьеры
    function groundFloor(f, L, u0, u1, o, fo) {
      var yT = GH - 1.0, n = Math.max(1, Math.round((u1 - u0) / 3.45)), st = (u1 - u0) / n, pw = 0.34, D = 3.4, i;
      f.R('marble', u0, u1, 0, 0.32, -WT, 0.06);                                                         // цоколь
      f.R('marble', u0, u1, yT, GH - 0.66, -WT, 0.06);                                                   // фриз
      f.R('metal', u0, u1, yT - 0.12, yT, -0.34, 0.01);                                                  // металлическая перемычка
      f.R('shop', u0, u1, 0.2, 0.34 + fo, -D, -0.2, { top: true, uv: SFLOOR });                          // пол торгового зала
      if (u0 > 0) f.R('shop', u0 - 0.03, u0, 0.3, yT, -D, -0.2, { uv: SFLOOR });
      if (u1 < L) f.R('shop', u1, u1 + 0.03, 0.3, yT, -D, -0.2, { uv: SFLOOR });
      for (i = 0; i <= n; i++) { var x = u0 + i * st; f.R('marble', Math.max(u0, x - pw), Math.min(u1, x + pw), 0.32, yT, -WT, 0.1); }
      for (i = 0; i < n; i++) {
        var p0 = u0 + i * st, p1 = p0 + st, a = p0 + pw, b = p1 - pw, c = (a + b) / 2, door = (i + fIdx) % 3 === 1, k = (i * 3 + fIdx) % 4;
        f.R('shop', p0, p1, 0.3, yT, -D - 0.05, -D, { front: true, uv: SW[k] });                          // задняя стена
        f.R('shop', p0, p1, yT - 0.05 - fo, yT - fo, -D, -0.2, { bottom: true, uv: SCEIL });              // потолок со спотами
        f.R('glassPane', a, b, 0.32, yT - 0.12, -0.27, -0.26, { front: true });
        f.R('metal', a, b, 0.32, 0.4, -0.3, -0.2); f.R('metal', a, b, 3.0, 3.05, -0.28, -0.21);
        f.R('metal', a, a + 0.05, 0.32, yT - 0.12, -0.28, -0.2); f.R('metal', b - 0.05, b, 0.32, yT - 0.12, -0.28, -0.2);
        if (door) {                                                                                       // стеклянные двери
          [-0.95, 0, 0.95].forEach(function (d) { f.R('metal', c + d - 0.03, c + d + 0.03, 0.32, 3.0, -0.28, -0.2); });
          [-0.09, 0.09].forEach(function (d) { f.R('brass', c + d - 0.015, c + d + 0.015, 0.95, 1.55, -0.2, -0.15); });
          f.R('metal', c - 1.0, c + 1.0, yT + 0.06, yT + 0.3, 0.06, 0.11); f.R('brass', c - 0.72, c + 0.72, yT + 0.168, yT + 0.192, 0.11, 0.118);   // нейтральная вывеска
          if (o.court) { f.R('metal', c - 1.5, c + 1.5, yT - 0.16, yT, 0.06, 1.7); f.R('brass', c - 1.5, c + 1.5, yT - 0.11, yT - 0.08, 1.7, 1.706); }   // козырёк подъезда
        } else {
          [-1, 1].forEach(function (d) { var x = c + d * (b - a) / 6; f.R('metal', x - 0.025, x + 0.025, 0.4, yT - 0.12, -0.28, -0.21); });
        }
      }
    }

    function facade(f, bays, o) {
      var L = 0, fo = (fIdx++) * 0.013; bays.forEach(function (b) { L += b.w; });
      var lightFrom = o.lightFrom, g0 = 0, g1 = L, yb = GH + lightFrom * FH - 0.2, fl, u, i;
      for (fl = 0; fl < NF; fl++) {
        var y0 = GH + fl * FH, m = fl >= lightFrom ? 'brickL' : 'brickD';
        for (u = 0, i = 0; i < bays.length; i++) {
          var b = bays[i], u1 = u + b.w;
          if (b.t === 'win') winBay(f, u, u1, y0, m);
          else if (b.t === 'bay') bay(f, u, u1, y0, m);
          else if (b.t === 'strip') strip(f, u, u1, y0, 'brickD');
          u = u1;
        }
      }
      var prof = function (list, base, a, b, extra) {         // профилированная тяга с теневыми уступами
        list.forEach(function (c) { var p = c[2] + (extra || 0), w = extra ? c[2] : 0; f.R('dark', a - w, b + w, base + c[0], base + c[0] + c[1], -WT - 0.1, p); });
      };
      u = 0;
      bays.forEach(function (b, i) {
        if (b.t === 'strip') stripPilasters(f, u, u + b.w);
        if (b.t === 'win' && lightFrom < NF) prof(BELT2, yb, u, u + b.w);                                // пояс под светлыми этажами
        if (b.t === 'bay') prof(CROWN, YR - 0.25, u + 0.3, u + b.w - 0.3, 0.95);                         // карниз огибает эркер
        if (b.t === 'none') { if (i === 0) g0 = b.w; else g1 = L - b.w; }
        else if (i > 0 && bays[i - 1].t !== 'none') f.R('dark', u - 0.08, u + 0.08, GH, YR - 0.25, -0.05, 0.09);   // тёмная вертикальная тяга между осями
        u += b.w;
      });
      var run = function (list, base) {
        list.forEach(function (c) { f.R('dark', g0 ? g0 - 0.3 : -c[2], g1 < L ? g1 + 0.3 : L + c[2], base + c[0], base + c[0] + c[1], -WT - 0.1, c[2]); });
      };
      run(BELT, GH - 0.66);                                                                              // пояс над первым этажом
      run(CROWN, YR - 0.25);                                                                             // венчающий карниз-парапет
      groundFloor(f, L, g0, g1, o, fo);
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
    // двор: верхние четыре этажа светлые, подъезды с козырьками
    facade(face(SL, -BD, -1, 0, 0, -1), fit([W(7), Y(5.5), W(6), P(7.4), W(6), Y(5.5), W(4)], BL), { lightFrom: NF - 4, court: true });
    facade(face(AW, -BD, 0, -1, 1, 0), fit([W(6), Y(5.5), W(6.5), P(7), W(6), Y(5.5), W(2)], AL - BD), { lightFrom: NF - 4, court: true });

    // перекрытия, тёмное «ядро» (чтобы сквозь окна не было видно насквозь), кровля
    var bx = function (m, x0, x1, y0, y1, z0, z1, opt) { B.box(m, (x0 + x1) / 2 - CX, (y0 + y1) / 2, (z0 + z1) / 2 - CZ, x1 - x0, y1 - y0, z1 - z0, opt); };
    for (var fl = 0; fl <= NF; fl++) { var y = GH + fl * FH, mm = fl === NF ? 'roof' : 'dark'; bx(mm, 0.1, AW - 0.1, y - 0.3, y, -AL + 0.1, -0.1); bx(mm, AW - 0.2, SL - 0.1, y - 0.3, y, -BD + 0.1, -0.1); }
    bx('roof', 0.1, AW - 0.1, 0, 0.2, -AL + 0.1, -0.1); bx('roof', AW - 0.2, SL - 0.1, 0, 0.2, -BD + 0.1, -0.1);
    bx('dark', 1.6, AW - 1.6, GH, YR - 0.3, -AL + 1.6, -1.6); bx('dark', AW - 1.7, SL - 1.6, GH, YR - 0.3, -BD + 1.6, -1.6);
    bx('dark', 3.9, AW - 3.9, 0.2, GH, -AL + 3.9, -3.9); bx('dark', AW - 4, SL - 3.9, 0.2, GH, -BD + 3.9, -3.9);

    /* ---------- эксплуатируемая кровля: терраса-лаунж ---------- */
    var YD = YR + 0.1;
    bx('deck', 0.9, AW - 0.9, YR, YD, -AL + 0.9, -BD + 0.9); bx('deck', 7.9, SL - 0.9, YR, YD, -BD + 0.9, -0.9);
    function hut(x0, x1, z0, z1, dz) {                    // выходы на кровлю: светлый кирпич, тёмная нависающая плита
      bx('brickL', x0, x1, YR, YR + 2.9, z0, z1);
      bx('dark', x0 - 0.06, x1 + 0.06, YR + 2.74, YR + 2.9, z0 - 0.06, z1 + 0.06);
      bx('dark', x0 - 0.5, x1 + 0.5, YR + 2.96, YR + 3.2, z0 - 0.5, z1 + 0.5); bx('dark', x0 - 0.38, x1 + 0.38, YR + 2.9, YR + 2.96, z0 - 0.38, z1 + 0.38);
      var cx = (x0 + x1) / 2, zz = dz > 0 ? z1 : z0;
      bx('metal', cx - 0.6, cx + 0.6, YD, YR + 2.25, zz - 0.04, zz + 0.04); bx('brass', cx + 0.42, cx + 0.45, YR + 1.0, YR + 1.35, zz - 0.07, zz + 0.07);
    }
    hut(4, 10.5, -44, -31, 1); hut(4.5, 10, -17, -10, -1); hut(26, 33, -11, -4.5, 1); hut(43, 50, -11, -4.5, 1);
    function sofa(x0, x1, z0, z1) { bx('wood', x0, x1, YD, YD + 0.22, z0, z1); bx('fabric', x0 + 0.04, x1 - 0.04, YD + 0.22, YD + 0.42, z0 + 0.04, z1 - 0.04); }
    function pergola(x0, x1, z0, z1) {
      [[x0, z0], [x1, z0], [x0, z1], [x1, z1]].forEach(function (p) { bx('metal', p[0] - 0.07, p[0] + 0.07, YD, YR + 2.6, p[1] - 0.07, p[1] + 0.07); });
      bx('metal', x0 - 0.07, x1 + 0.07, YR + 2.5, YR + 2.62, z0 - 0.07, z0 + 0.07); bx('metal', x0 - 0.07, x1 + 0.07, YR + 2.5, YR + 2.62, z1 - 0.07, z1 + 0.07);
      for (var x = x0 + 0.2; x <= x1 - 0.1; x += 0.42) bx('wood', x - 0.035, x + 0.035, YR + 2.62, YR + 2.78, z0 - 0.3, z1 + 0.3);
      var zc = (z0 + z1) / 2;
      sofa(x0 + 0.5, x1 - 0.5, z0 + 0.25, z0 + 1.1); bx('fabric', x0 + 0.5, x1 - 0.5, YD + 0.42, YD + 0.8, z0 + 0.25, z0 + 0.45);
      bx('wood', (x0 + x1) / 2 - 0.6, (x0 + x1) / 2 + 0.6, YD, YD + 0.36, zc + 0.3, zc + 1.0);
    }
    pergola(3.5, 9.5, -28, -23.5); pergola(15, 21.5, -11, -5); pergola(35, 41, -11, -5.5);
    function lounger(x, z, alongX) {                      // шезлонг
      var l = 1.9, w = 0.66, sx = alongX ? l : w, sz = alongX ? w : l;
      bx('wood', x - sx / 2, x + sx / 2, YD + 0.16, YD + 0.24, z - sz / 2, z + sz / 2); bx('fabric', x - sx / 2 + 0.03, x + sx / 2 - 0.03, YD + 0.24, YD + 0.33, z - sz / 2 + 0.03, z + sz / 2 - 0.03);
      if (alongX) bx('fabric', x - sx / 2 + 0.03, x - sx / 2 + 0.5, YD + 0.33, YD + 0.5, z - sz / 2 + 0.03, z + sz / 2 - 0.03); else bx('fabric', x - sx / 2 + 0.03, x + sx / 2 - 0.03, YD + 0.33, YD + 0.5, z - sz / 2 + 0.03, z - sz / 2 + 0.5);
    }
    function umbrella(x, z) { bx('metal', x - 0.03, x + 0.03, YD, YD + 2.3, z - 0.03, z + 0.03); B.cone('fabric', x - CX, YD + 2.05, z - CZ, 1.45, 0.5, 8); }
    [-50, -47.6, -40.2, -37.8].forEach(function (z, i) { lounger(11.6, z, true); if (i % 2 === 0) umbrella(12.4, z - 1.2); });
    [14.5, 17, 23, 36.5, 39, 45, 47.5].forEach(function (x, i) { lounger(x, -2.9, false); if (i % 2 === 0) umbrella(x + 1.25, -3); });
    function planter(x, z, w, d) {
      bx('fabric', x - w / 2, x + w / 2, YD, YD + 0.6, z - d / 2, z + d / 2); bx('dark', x - w / 2 - 0.02, x + w / 2 + 0.02, YD, YD + 0.06, z - d / 2 - 0.02, z + d / 2 + 0.02);
      var n = Math.max(1, Math.round(Math.max(w, d) / 0.8)), i;
      for (i = 0; i < n; i++) { var t = n === 1 ? 0 : i / (n - 1) - 0.5, rr = 0.42 + R() * 0.2; B.sphere('green', x + (w > d ? t * (w - 0.7) : 0) - CX, YD + 0.62 + rr * 0.75, z + (w > d ? 0 : t * (d - 0.7)) - CZ, rr, rr * (0.95 + R() * 0.5), rr); }
    }
    [[2, -48, 1, 4], [2, -38, 1, 4], [2, -21, 1, 4], [12.7, -27, 1, 3], [13, -3, 1, 1], [23.5, -1.9, 4, 0.9], [34, -1.9, 4, 0.9], [42, -12.9, 4, 0.9], [52.5, -1.9, 3, 0.9], [54.2, -8, 1, 4], [21, -12.9, 4, 0.9], [12.7, -45, 1, 3]].forEach(function (p) { planter(p[0], p[1], p[2], p[3]); });

    /* ---------- круглая стеклянная башня на углу ---------- */
    (function () {
      var r = 4.6, tx0 = 3 - CX, tz0 = -3 - CZ, td = -Math.PI / 4, P2 = Math.PI * 2, YC = YR + 0.9, sA = 0.27, pA = 0.315, w0 = 0.5, w1 = 1.02, gy0 = GH + 0.3, yT = GH - 1.0, fl;
      var arc = function (m, rad, y0, y1, p0, p1, opt) { B.arc(m, tx0, tz0, rad, y0, y1, td + p0, td + p1, opt); };
      var ring = function (m, r0, r1, y0, y1, p0, p1) { if (p0 == null) { p0 = 0; p1 = P2; } B.ring(m, tx0, tz0, r0, r1, y0, y1, td + p0, td + p1); };
      var rad = function (m, p, r0, r1, y0, y1, dir) { B.radial(m, tx0, tz0, td + p, r0, r1, y0, y1, dir); };
      arc('dark', r - 1.2, GH, YC, 0, P2);                                                               // ядро
      for (fl = 0; fl < NF; fl++) {                                                                      // кирпичный барабан с гнутыми окнами
        var y0 = GH + fl * FH, ys = y0 + 0.82, yh = y0 + 2.72;
        arc('brickD', r, y0, ys, pA, P2 - pA); arc('brickD', r, yh, y0 + FH, pA, P2 - pA);
        arc('brickD', r, ys, yh, pA, w0); arc('brickD', r, ys, yh, w1, P2 - w1); arc('brickD', r, ys, yh, P2 - w0, P2 - pA);
        [1, -1].forEach(function (s) {
          var a0 = s > 0 ? w0 : -w1, a1 = s > 0 ? w1 : -w0, am = (a0 + a1) / 2, fr = r - 0.15, t = 0.013;
          arc(glass(), r - 0.85, ys - 0.2, yh + 0.12, a0 - 0.12, a1 + 0.12, { uv01: true });
          arc('glassPane', r - 0.17, ys, yh, a0, a1);
          rad('brickD', a0, r - 0.2, r, ys, yh, 1); rad('brickD', a1, r - 0.2, r, ys, yh, -1);
          B.disc('brickD', tx0, tz0, r - 0.2, r, ys, td + a0, td + a1, true); B.disc('brickD', tx0, tz0, r - 0.2, r, yh, td + a0, td + a1, false);
          arc('metal', fr, ys, yh, a0, a0 + t); arc('metal', fr, ys, yh, a1 - t, a1); arc('metal', fr, ys, yh, am - t / 2, am + t / 2);
          arc('metal', fr, ys, ys + 0.06, a0, a1); arc('metal', fr, yh - 0.06, yh, a0, a1); arc('metal', fr, yh - 0.64, yh - 0.595, a0, a1);
          ring('dark', r - 0.1, r + 0.1, ys - 0.1, ys, a0 - 0.03, a1 + 0.03);                             // гнутый отлив
        });
      }
      arc('dark', r + 0.02, YR - 0.25, YC, pA, P2 - pA);                                                 // тёмный барабан под короной
      // сплошной витраж на всю высоту
      arc('glass1', r - 1.1, gy0, YC, -0.6, 0.6, { uvs: [2, NF + 1] });
      arc('glassPane', r - 0.1, gy0, YC - 0.3, -sA, sA);
      for (fl = 0; fl <= NF; fl++) { var yy = GH + fl * FH; arc('metal', r - 0.08, yy - 0.2, yy + 0.14, -sA, sA); if (fl < NF) arc('metal', r - 0.08, yy + 2.05, yy + 2.1, -sA, sA); }
      arc('metal', r - 0.08, YC - 0.3, YC, -sA, sA); arc('metal', r - 0.07, gy0, YC, -0.011, 0.011);
      [1, -1].forEach(function (s) {                                                                     // стойки-пилоны витража с латунной нитью
        var p0 = s > 0 ? sA : -pA, p1 = s > 0 ? pA : -sA, pm = (p0 + p1) / 2;
        ring('metal', r - 0.25, r + 0.16, gy0, YC, p0, p1); rad('metal', p0, r - 0.25, r + 0.16, gy0, YC, -1); rad('metal', p1, r - 0.25, r + 0.16, gy0, YC, 1);
        arc('brass', r + 0.166, gy0, YC, pm - 0.004, pm + 0.004);
      });
      // круглый карниз над первым этажом и ступенчатая корона
      [[0, 0.34, 0.1], [0.34, 0.06, 0.2], [0.4, 0.16, 0.5], [0.56, 0.04, 0.41], [0.6, 0.1, 0.3], [0.7, 0.16, 0.14]].forEach(function (c) { ring('dark', r - 0.4, r + c[2], GH - 0.66 + c[0], GH - 0.66 + c[0] + c[1]); });
      var TC = [[0, 0.5, 0.07], [0.5, 0.1, 0.19], [0.6, 0.22, 0.35], [0.82, 0.06, 0.27], [0.88, 0.24, 0.62], [1.12, 0.06, 0.53], [1.18, 0.28, 0.92], [1.46, 0.1, 1.02]];
      TC.forEach(function (c, i) { ring('dark', i === TC.length - 1 ? 0 : r - 0.4, r + c[2], YC + c[0], YC + c[0] + c[1]); });
      // первый этаж башни: мраморные пилоны, гнутая витрина, вход
      ring('marble', r - 0.5, r + 0.05, 0, 0.32); ring('marble', r - 0.5, r + 0.05, yT, GH - 0.66);
      arc('marble', r, 0.32, yT, 1.585, P2 - 1.585);
      [-1.5, -0.9, -0.3, 0.3, 0.9, 1.5].forEach(function (c) { ring('marble', r - 0.4, r + 0.06, 0.32, yT, c - 0.085, c + 0.085); rad('marble', c - 0.085, r - 0.4, r + 0.06, 0.32, yT, -1); rad('marble', c + 0.085, r - 0.4, r + 0.06, 0.32, yT, 1); });
      arc('glassPane', r - 0.24, 0.32, yT - 0.12, -1.5, 1.5);
      ring('metal', r - 0.34, r - 0.02, yT - 0.12, yT, -1.5, 1.5); arc('metal', r - 0.22, 3.0, 3.05, -1.5, 1.5); arc('metal', r - 0.22, 0.32, 0.4, -1.5, 1.5);
      [-1.2, -0.6, 0.6, 1.2].forEach(function (c) { arc('metal', r - 0.22, 0.4, yT - 0.12, c - 0.006, c + 0.006); });
      [-0.2, 0, 0.2].forEach(function (c) { arc('metal', r - 0.22, 0.4, 3.0, c - 0.007, c + 0.007); });
      [-0.022, 0.022].forEach(function (c) { arc('brass', r - 0.19, 0.95, 1.55, c - 0.004, c + 0.004); });
      [[-1.62, -0.54, 1], [-0.54, 0.54, 3], [0.54, 1.62, 2]].forEach(function (q) { arc('shop', r - 2.3, 0.3, yT, q[0], q[1], { uv: SW[q[2]] }); });
      B.disc('shop', tx0, tz0, 0, r - 0.2, 0.33, 0, P2, true, { uv: SFLOOR }); B.disc('shop', tx0, tz0, 0, r, yT - 0.02, 0, P2, false, { uv: SFLOOR });
    })();

    B.meshes(mats, group);

    var parts = [{ x0: -CX, x1: AW - CX, z0: -AL - CZ, z1: -CZ }, { x0: AW - CX, x1: SL - CX, z0: -BD - CZ, z1: -CZ }];
    return { group: group, mats: mats, roofY: YR, parts: parts, tower: { x: 3 - CX, z: -3 - CZ, r: 4.6 } };
  }

  return { build: build };
})();
