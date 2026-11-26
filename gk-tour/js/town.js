/* Район вокруг дома (придуманный, не карта Моздока): сквер с фонтаном напротив башни, улица купеческих домов
   с кафе и лавками через дорогу, несколько девятиэтажек и мачта для силуэта города.
   Модуль сам расчищает кварталы, которые занимает (прячет типовые дома и деревья из scene.js). Выключается ?off=town. */
(function () {
  'use strict';
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('town')) return;
  var ctx = GKScene.ctx, T = ctx.T, U = T.BufferGeometryUtils, d = ctx.dims;
  var root = new T.Group(); root.name = 'town'; ctx.site.add(root);
  var lin = function (h) { return new T.Color(h).convertSRGBToLinear(); };
  var rnd = (function (s) { return function () { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; })(4242);

  var SX = (d.RW[0] + d.RW[1]) / 2, SZ = (d.RS[0] + d.RS[1]) / 2, PITCH = 112;
  var blk = function (i, j) { return { x0: SX + i * PITCH + 10, x1: SX + (i + 1) * PITCH - 10, z0: SZ + j * PITCH + 10, z1: SZ + (j + 1) * PITCH - 10 }; };

  /* ---------- расчистка: прячем типовую застройку там, где ставим своё ---------- */
  function clearRect(x0, x1, z0, z1, treesToo) {
    var m = new T.Matrix4(), p = new T.Vector3(), zero = new T.Matrix4().makeScale(0, 0, 0);
    ctx.site.traverse(function (o) {
      if (!o.isInstancedMesh || o.parent === root || /^lamp/.test(o.name)) return;
      if (/^trees/.test(o.name) && !treesToo) return;
      var ch = false;
      for (var i = 0; i < o.count; i++) { o.getMatrixAt(i, m); p.setFromMatrixPosition(m); if (p.x > x0 && p.x < x1 && p.z > z0 && p.z < z1) { o.setMatrixAt(i, zero); ch = true; } }
      if (ch) o.instanceMatrix.needsUpdate = true;
    });
  }

  /* ---------- сборщик: всё одного материала сливается в одну сетку, цвет — по вершинам ---------- */
  var buckets = {};
  function put(bucket, geo, color, x, y, z, ry) {
    if (geo.index) geo = geo.toNonIndexed();
    if (ry) geo.rotateY(ry);
    geo.translate(x || 0, y || 0, z || 0);
    var n = geo.attributes.position.count, c = new Float32Array(n * 3), k = color.isColor ? color : lin(color);
    for (var i = 0; i < n; i++) { c[i * 3] = k.r; c[i * 3 + 1] = k.g; c[i * 3 + 2] = k.b; }
    geo.setAttribute('color', new T.BufferAttribute(c, 3));
    (buckets[bucket] = buckets[bucket] || []).push(geo);
  }
  var box = function (b, col, x0, x1, y0, y1, z0, z1) { put(b, new T.BoxGeometry(x1 - x0, y1 - y0, z1 - z0), col, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); };
  var cyl = function (b, col, x, y0, y1, z, r0, r1, seg) { put(b, new T.CylinderGeometry(r1 == null ? r0 : r1, r0, y1 - y0, seg || 16), col, x, (y0 + y1) / 2, z); };
  var hip = function (b, col, x0, x1, y, h, z0, z1, over) {          // вальмовая крыша
    var g = new T.ConeGeometry(1, 1, 4); g.rotateY(Math.PI / 4); g.scale((x1 - x0 + over * 2) / Math.SQRT2, h, (z1 - z0 + over * 2) / Math.SQRT2);
    put(b, g, col, (x0 + x1) / 2, y + h / 2, (z0 + z1) / 2);
  };

  /* ====================== 1. СКВЕР С ФОНТАНОМ (квартал наискосок от башни) ====================== */
  var Q = blk(-1, 0), QX = (Q.x0 + Q.x1) / 2, QZ = (Q.z0 + Q.z1) / 2, QH = (Q.x1 - Q.x0) / 2;
  clearRect(Q.x0 - 4, Q.x1 + 4, Q.z0 - 4, Q.z1 + 4, false);
  clearRect(Q.x0 + 13, Q.x1 - 13, Q.z0 + 13, Q.z1 - 13, true);          // деревья оставляем только по краю сквера
  var paveTex = ctx.ctex(256, 256, function (g) {
    g.fillStyle = '#b9aa98'; g.fillRect(0, 0, 256, 256);
    for (var y = 0; y < 16; y++) for (var x = -1; x < 9; x++) { var v = rnd(); g.fillStyle = v < 0.33 ? 'rgba(150,110,90,.35)' : v < 0.66 ? 'rgba(255,245,230,.18)' : 'rgba(60,50,45,.16)'; g.fillRect(x * 32 + (y % 2) * 16 + 1, y * 16 + 1, 30, 14); }
  }, 1 / 4);
  var mPave = ctx.M({ map: paveTex, roughness: 0.9 }), mLawn = ctx.M({ map: ctx.ctex(256, 256, function (g) { g.fillStyle = '#4c7a3a'; g.fillRect(0, 0, 256, 256); for (var i = 0; i < 2400; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '35,70,28,' : '150,185,105,') + (0.05 + rnd() * 0.1) + ')'; g.fillRect(rnd() * 256, rnd() * 256, 2 + rnd() * 4, 2 + rnd() * 4); } }, 1 / 8), roughness: 1 });
  var flat = function (mat, geo, y) { geo.rotateX(-Math.PI / 2); var uv = geo.attributes.uv, p = geo.attributes.position; for (var i = 0; i < uv.count; i++) uv.setXY(i, p.getX(i), p.getZ(i)); var m = new T.Mesh(geo, mat); m.position.set(QX, y, QZ); m.receiveShadow = true; root.add(m); return m; };
  flat(mLawn, new T.PlaneGeometry(QH * 2, QH * 2), 0.17);
  flat(mPave, new T.CircleGeometry(15, 48), 0.2);                          // круглая площадь у фонтана
  [0, Math.PI / 2, Math.PI / 4, -Math.PI / 4].forEach(function (a, i) {    // аллеи: крест и диагонали
    var g = new T.PlaneGeometry(i < 2 ? 6 : 4, (i < 2 ? QH * 2 : QH * 2.75)); g.rotateZ(a); flat(mPave, g, 0.19 + i * 0.002);
  });
  var gran = 0xcfc8bd, granD = 0x8f8a82, hedge = 0x35602c, iron = 0x1c1d20, wood = 0x7a5536;
  // фонтан: гранитная чаша, вода, верхняя чаша на ножке
  put('solid', new T.CylinderGeometry(6.2, 6.4, 0.75, 48, 1, true), gran, QX, 0.57, QZ);
  put('solid', new T.RingGeometry(5.5, 6.3, 48).rotateX(-Math.PI / 2), gran, QX, 0.95, QZ);
  put('solid', new T.CylinderGeometry(5.5, 5.5, 0.6, 48, 1, true).scale(-1, 1, 1), granD, QX, 0.65, QZ);
  cyl('solid', gran, QX, 0.2, 1.9, QZ, 0.55, 0.38, 20); cyl('solid', gran, QX, 1.9, 2.15, QZ, 0.5, 2.1, 32); cyl('solid', gran, QX, 2.15, 3.1, QZ, 0.3, 0.2, 16); cyl('solid', gran, QX, 3.1, 3.25, QZ, 0.25, 0.9, 24);
  var mWater = new T.MeshStandardMaterial({ color: lin(0x4f8fa8), roughness: 0.06, metalness: 0.35, transparent: true, opacity: 0.9, emissive: lin(0x7fd0ff), emissiveIntensity: 0 });
  mWater.envMapIntensity = 1; mWater.userData.env = 1;
  var w1 = new T.Mesh(new T.CircleGeometry(5.5, 48).rotateX(-Math.PI / 2), mWater); w1.position.set(QX, 0.78, QZ); root.add(w1);
  var w2 = new T.Mesh(new T.CircleGeometry(2, 32).rotateX(-Math.PI / 2), mWater); w2.position.set(QX, 2.12, QZ); root.add(w2);
  var jetMat = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.42, depthWrite: false, fog: true });
  var jets = [new T.CylinderGeometry(0.05, 0.16, 2.2, 8).translate(0, 4.3, 0)];
  for (var a = 0; a < 12; a++) { var jg = new T.CylinderGeometry(0.03, 0.09, 1.9, 6); jg.rotateZ(0.5); jg.translate(3.2, 1.6, 0); jg.rotateY(a / 12 * 6.283); jets.push(jg); }
  for (a = 0; a < 8; a++) { var fg = new T.CylinderGeometry(0.04, 0.1, 1.1, 6); fg.rotateZ(0.9); fg.translate(1.5, 2.3, 0); fg.rotateY(a / 8 * 6.283 + 0.3); jets.push(fg); }
  var jet = new T.Mesh(U.mergeBufferGeometries(jets), jetMat); jet.position.set(QX, 0, QZ); root.add(jet);
  // скамьи, урны, живые изгороди, цветники, классические фонари
  var lampPos = [];
  for (a = 0; a < 8; a++) {
    var an = a / 8 * 6.283 + 0.39, bx = QX + Math.cos(an) * 12.2, bz = QZ + Math.sin(an) * 12.2, g1 = new T.BoxGeometry(2.4, 0.09, 0.62), g2 = new T.BoxGeometry(2.4, 0.5, 0.07).translate(0, 0.36, -0.3), g3 = new T.BoxGeometry(2.1, 0.42, 0.1).translate(0, -0.24, 0);
    [g1, g2].forEach(function (g) { put('solid', g, wood, bx, 0.68, bz, -an + Math.PI / 2); }); put('solid', g3, iron, bx, 0.68, bz, -an + Math.PI / 2);
    var la = an + 0.39; lampPos.push([QX + Math.cos(la) * 14, QZ + Math.sin(la) * 14]);
  }
  for (a = 0; a < 4; a++) for (var s = 20; s < QH - 3; s += 11) { var ca = Math.cos(a * Math.PI / 2), sa = Math.sin(a * Math.PI / 2); lampPos.push([QX + ca * s - sa * 3.6, QZ + sa * s + ca * 3.6]); lampPos.push([QX + ca * s + sa * 3.6, QZ + sa * s - ca * 3.6]); }
  lampPos.forEach(function (p) { cyl('solid', iron, p[0], 0.2, 0.5, p[1], 0.16, 0.1, 10); cyl('solid', iron, p[0], 0.5, 3.5, p[1], 0.05, 0.04, 8); cyl('solid', iron, p[0], 3.5, 3.6, p[1], 0.05, 0.22, 10); put('glow', new T.SphereGeometry(0.26, 12, 10), 0xffffff, p[0], 3.85, p[1]); cyl('solid', iron, p[0], 4.08, 4.2, p[1], 0.2, 0.03, 10); });
  var flowers = [0xa8322c, 0xd9a93a, 0xe9e4d6, 0x8f3f74];
  for (a = 0; a < 4; a++) {                                                // четыре партера между аллеями
    var qa = a * Math.PI / 2 + Math.PI / 4 + 0.39, r0 = 19, r1 = 33, n = 14;
    for (var k = 0; k < n; k++) { var aa = qa - 0.3 + 0.6 * k / (n - 1); [r0, r1].forEach(function (r) { put('solid', new T.BoxGeometry(r * 0.6 / (n - 1) + 0.3, 0.75, 0.8), hedge, QX + Math.cos(aa) * r, 0.55, QZ + Math.sin(aa) * r, -aa + Math.PI / 2); }); }
    for (k = 0; k < 3; k++) { var fr = 22.5 + k * 3.6, seg = new T.RingGeometry(fr - 0.55, fr + 0.55, 24, 1, qa - 0.22, 0.44).rotateX(-Math.PI / 2); put('solid', seg, flowers[(a + k) % 4], QX, 0.24, QZ); }
    cyl('solid', gran, QX + Math.cos(qa) * 26, 0.2, 0.9, QZ + Math.sin(qa) * 26, 0.9, 1.2, 20); put('solid', new T.SphereGeometry(1.25, 14, 10).scale(1, 0.75, 1), flowers[(a + 1) % 4], QX + Math.cos(qa) * 26, 1.4, QZ + Math.sin(qa) * 26);
  }
  // низкая кованая ограда по краю с воротами на аллеях
  [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(function (sd) {
    for (var t = -QH + 1; t < QH - 1; t += 2.6) { if (Math.abs(t) < 4.5) continue;
      var px = QX + (sd[0] ? sd[0] * (QH - 0.6) : t), pz = QZ + (sd[1] ? sd[1] * (QH - 0.6) : t);
      put('solid', new T.BoxGeometry(sd[0] ? 0.06 : 2.5, 0.06, sd[1] ? 0.06 : 2.5), iron, px, 1.0, pz); put('solid', new T.BoxGeometry(sd[0] ? 0.06 : 2.5, 0.06, sd[1] ? 0.06 : 2.5), iron, px, 0.45, pz);
      cyl('solid', gran, px + (sd[0] ? 0 : 1.3), 0.17, 1.15, pz + (sd[1] ? 0 : 1.3), 0.17, 0.17, 6); }
  });

  /* ====================== 2. КУПЕЧЕСКАЯ УЛИЦА (через южную улицу, напротив окон) ====================== */
  var Sb = blk(0, 0); clearRect(Sb.x0 - 4, Sb.x1 + 4, Sb.z0 - 4, Sb.z0 + 30, true);
  var houseMats = [], FH = 3.7;
  var HOUSES = [
    { w: 13, fl: 2, col: '#d9b98a', sign: 'ПЕКАРНЯ', roof: 0x6a3b30, aw: 0x8a2f2a },
    { w: 11, fl: 3, col: '#c9cdb8', sign: 'КНИГИ', roof: 0x4a5257, aw: 0x2f4a3a },
    { w: 14, fl: 2, col: '#b4654a', sign: 'КАФЕ', roof: 0x3d4347, aw: 0xe9e2d2, brick: true, cafe: true },
    { w: 10, fl: 2, col: '#e6dcc6', sign: 'ЦВЕТЫ', roof: 0x6a3b30, aw: 0x55703f },
    { w: 13, fl: 3, col: '#d2a779', sign: 'АПТЕКА', roof: 0x4a5257, aw: 0x2e5a50 },
    { w: 12, fl: 2, col: '#bcc7c9', sign: 'КОФЕЙНЯ', roof: 0x5a3a2c, aw: 0x3b3230, cafe: true },
    { w: 13, fl: 2, col: '#c98f6a', sign: 'АТЕЛЬЕ', roof: 0x3d4347, aw: 0x7a2e3a, brick: true }
  ];
  function facadeTex(h, lit) {
    var W = 768, Hh = 256 * h.fl, n = Math.max(3, Math.round(h.w / 3.1));
    return ctx.ctex(W, Hh, function (g) {
      var fy = function (f) { return Hh - (f + 1) * 256; };
      g.fillStyle = lit ? '#000' : h.col; g.fillRect(0, 0, W, Hh);
      if (!lit) {
        if (h.brick) for (var r = 0; r < Hh; r += 9) { g.fillStyle = 'rgba(40,20,10,.22)'; g.fillRect(0, r, W, 1.5); for (var bx = (r / 9 % 2) * 14; bx < W; bx += 28) g.fillRect(bx, r, 1.5, 9); }
        for (var i = 0; i < 500; i++) { g.fillStyle = 'rgba(' + (rnd() < 0.5 ? '255,255,255,' : '40,30,20,') + (0.02 + rnd() * 0.05) + ')'; g.fillRect(rnd() * W, rnd() * Hh, 20 + rnd() * 60, 2 + rnd() * 4); }
        var gr = g.createLinearGradient(0, Hh - 60, 0, Hh); gr.addColorStop(0, 'rgba(40,35,30,0)'); gr.addColorStop(1, 'rgba(40,35,30,.4)'); g.fillStyle = gr; g.fillRect(0, Hh - 60, W, 60);   // потёки у земли
      }
      // первый этаж: руст, витрины, дверь, вывеска
      var y0 = fy(0);
      if (!lit) { g.fillStyle = 'rgba(0,0,0,.1)'; for (var rr = 0; rr < 6; rr++) g.fillRect(0, y0 + 20 + rr * 38, W, 2); g.fillStyle = '#3a3532'; g.fillRect(0, Hh - 22, W, 22); }
      var sw = W / n;
      for (var c = 0; c < n; c++) { var x = c * sw + sw * 0.14, ww = sw * 0.72, door = c === Math.floor(n / 2);
        if (lit) { g.fillStyle = door ? '#b88a4a' : '#ffcf8a'; g.fillRect(x + 6, y0 + 66, ww - 12, door ? 166 : 136); }
        else { g.fillStyle = '#2a2622'; g.fillRect(x, y0 + 60, ww, door ? 174 : 148); g.fillStyle = door ? '#3c2f24' : '#51606a'; g.fillRect(x + 6, y0 + 66, ww - 12, door ? 166 : 136);
          if (!door) { g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(x + 6, y0 + 66); g.lineTo(x + ww * 0.6, y0 + 66); g.lineTo(x + 6, y0 + 180); g.fill(); g.fillStyle = '#2a2622'; g.fillRect(x + ww / 2 - 2, y0 + 66, 4, 136); }
          else { g.fillStyle = '#51606a'; g.fillRect(x + 14, y0 + 78, ww - 28, 70); g.fillStyle = '#c9a063'; g.fillRect(x + ww - 22, y0 + 160, 5, 18); } }
      }
      g.fillStyle = lit ? '#1a1206' : '#26221f'; g.fillRect(W * 0.2, y0 + 12, W * 0.6, 38);
      g.fillStyle = lit ? '#ffdca0' : '#e8dcc4'; g.font = '600 26px Georgia, "Times New Roman", serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(h.sign.split('').join(' '), W / 2, y0 + 32);
      // верхние этажи: арочные окна с белыми наличниками
      for (var f = 1; f < h.fl; f++) { var yy = fy(f);
        if (!lit) { g.fillStyle = '#efe9dc'; g.fillRect(0, yy + 244, W, 12); g.fillStyle = 'rgba(0,0,0,.18)'; g.fillRect(0, yy + 256, W, 5); }
        for (c = 0; c < n; c++) { var cx = c * sw + sw / 2, hw = Math.min(46, sw * 0.26), on = rnd() < 0.55;
          if (lit) { if (on) { g.fillStyle = rnd() < 0.8 ? '#f7bd72' : '#cfdcf5'; g.beginPath(); g.moveTo(cx - hw + 6, yy + 214); g.lineTo(cx - hw + 6, yy + 88); g.arc(cx, yy + 88, hw - 6, Math.PI, 0); g.lineTo(cx + hw - 6, yy + 214); g.fill(); } continue; }
          g.fillStyle = '#f2ecdf'; g.beginPath(); g.moveTo(cx - hw - 8, yy + 226); g.lineTo(cx - hw - 8, yy + 88); g.arc(cx, yy + 88, hw + 8, Math.PI, 0); g.lineTo(cx + hw + 8, yy + 226); g.fill();
          g.fillStyle = '#2b3640'; g.beginPath(); g.moveTo(cx - hw, yy + 214); g.lineTo(cx - hw, yy + 88); g.arc(cx, yy + 88, hw, Math.PI, 0); g.lineTo(cx + hw, yy + 214); g.fill();
          g.fillStyle = 'rgba(190,210,225,.25)'; g.fillRect(cx - hw, yy + 60, hw * 0.8, 150);
          g.fillStyle = '#f2ecdf'; g.fillRect(cx - 2, yy + 46, 4, 168); g.fillRect(cx - hw, yy + 120, hw * 2, 4); g.fillRect(cx - hw - 12, yy + 214, hw * 2 + 24, 9);
        }
      }
      if (!lit) { g.fillStyle = '#efe9dc'; g.fillRect(0, 0, W, 20); g.fillStyle = 'rgba(0,0,0,.25)'; for (var dx = 6; dx < W; dx += 18) g.fillRect(dx, 20, 9, 7);
        g.fillStyle = '#efe9dc'; g.fillRect(0, 0, 16, Hh - 22); g.fillRect(W - 16, 0, 16, Hh - 22); g.fillStyle = 'rgba(0,0,0,.12)'; g.fillRect(16, 0, 3, Hh); g.fillRect(W - 19, 0, 3, Hh); }
    });
  }
  var hx = Sb.x0 + 1, zf = Sb.z0 + 2.5, cafeSpots = [];
  HOUSES.forEach(function (h) {
    var x0 = hx, x1 = hx + h.w, Hh = h.fl * FH, z1 = zf + 12, wall = new T.Color(h.col).convertSRGBToLinear();
    hx = x1 + 0.25;
    box('solid', wall, x0, x1, 0.15, Hh, zf + 0.03, z1);
    var mat = new T.MeshStandardMaterial({ map: facadeTex(h, false), emissive: 0xffffff, emissiveMap: facadeTex(h, true), emissiveIntensity: 0, roughness: 0.9 });
    mat.envMapIntensity = 0.15; houseMats.push(mat);
    var fm = new T.Mesh(new T.PlaneGeometry(h.w, Hh - 0.15).rotateY(Math.PI), mat); fm.position.set((x0 + x1) / 2, (Hh + 0.15) / 2, zf); fm.receiveShadow = true; root.add(fm);
    var up = function (w, ry, px, pz) {                      // верхние этажи с окнами — на задней и боковых стенах
      var g = new T.PlaneGeometry(w, Hh - FH), uv = g.attributes.uv; for (var q = 0; q < uv.count; q++) uv.setY(q, 1 / h.fl + uv.getY(q) * (1 - 1 / h.fl));
      g.rotateY(ry); var m = new T.Mesh(g, mat); m.position.set(px, FH + (Hh - FH) / 2, pz); m.receiveShadow = true; root.add(m); };
    up(h.w, 0, (x0 + x1) / 2, z1 + 0.02); up(12, -Math.PI / 2, x0 - 0.02, (zf + z1) / 2); up(12, Math.PI / 2, x1 + 0.02, (zf + z1) / 2);
    box('solid', 0xefe9dc, x0 - 0.25, x1 + 0.25, Hh, Hh + 0.35, zf - 0.4, z1 + 0.25);                  // карниз
    hip('roofs', h.roof, x0, x1, Hh + 0.35, 2.4 + h.w * 0.08, zf, z1, 0.35);
    for (var c = 0; c < 2; c++) { var dxm = x0 + h.w * (0.3 + 0.4 * c); box('solid', wall, dxm - 0.8, dxm + 0.8, Hh + 0.35, Hh + 1.7, zf + 1.6, zf + 3.4); hip('roofs', h.roof, dxm - 0.8, dxm + 0.8, Hh + 1.7, 0.7, zf + 1.6, zf + 3.4, 0.15); box('solid', 0x2b3640, dxm - 0.5, dxm + 0.5, Hh + 0.6, Hh + 1.5, zf + 1.56, zf + 1.6); }
    box('solid', 0x8a4a3a, x0 + h.w * 0.78, x0 + h.w * 0.78 + 0.7, Hh + 1.2, Hh + 3.4, zf + 7, zf + 7.7);   // труба
    var n = Math.max(3, Math.round(h.w / 3.1)), sw = h.w / n;                                           // маркизы над витринами
    for (c = 0; c < n; c++) { if (c === Math.floor(n / 2)) continue; var ag = new T.BoxGeometry(sw * 0.8, 0.06, 1.5); ag.rotateX(0.36); put('solid', ag, h.aw, x1 - (c + 0.5) * sw, 2.95, zf - 0.72); }
    box('solid', 0x4a4540, x0 - 0.1, x1 + 0.1, 0, 0.16, zf - 0.6, zf + 0.05);                         // ступень
    if (h.cafe) cafeSpots.push([x0 + 2, x1 - 2]);
  });
  cafeSpots.forEach(function (r) {                                         // летняя веранда: столики, стулья, зонты, кадки
    for (var x = r[0]; x <= r[1]; x += 3.2) { var z = zf - 3.6;
      cyl('solid', 0x2a2623, x, 0.16, 0.86, z, 0.05, 0.05, 8); cyl('solid', 0xe9e2d2, x, 0.86, 0.9, z, 0.42, 0.42, 16);
      [[0.75, 0], [-0.75, 0]].forEach(function (o) { box('solid', 0x3a2c22, x + o[0] - 0.2, x + o[0] + 0.2, 0.16, 0.6, z - 0.2, z + 0.2); box('solid', 0x3a2c22, x + o[0] * 1.27 - 0.03, x + o[0] * 1.27 + 0.03, 0.6, 1.05, z - 0.2, z + 0.2); });
      cyl('solid', 0x2a2623, x, 0.9, 2.6, z, 0.03, 0.03, 6); cyl('solid', 0xf2ecdf, x, 2.2, 2.75, z, 1.45, 0.05, 8);
    }
    [r[0] - 1.4, r[1] + 1.4].forEach(function (x) { cyl('solid', 0x3a3532, x, 0.16, 0.8, zf - 3.6, 0.36, 0.45, 12); put('solid', new T.SphereGeometry(0.62, 12, 9), 0x3f6a34, x, 1.25, zf - 3.6); });
  });

  /* ====================== 3. СИЛУЭТ ГОРОДА: девятиэтажки и мачта ====================== */
  var towerTex = function (lit) { return ctx.ctex(256, 256, function (g) {
    g.fillStyle = lit ? '#000' : '#c9c6bd'; g.fillRect(0, 0, 256, 256);
    for (var y = 0; y < 4; y++) for (var x = 0; x < 4; x++) { var on = rnd() < 0.45;
      if (lit) { if (on) { g.fillStyle = rnd() < 0.7 ? '#f3b56a' : '#cdd8f0'; g.fillRect(x * 64 + 14, y * 64 + 16, 36, 30); } }
      else { g.fillStyle = '#aaa79e'; g.fillRect(x * 64, y * 64 + 56, 64, 8); g.fillStyle = '#2b3743'; g.fillRect(x * 64 + 14, y * 64 + 16, 36, 30); g.fillStyle = '#e9e6df'; g.fillRect(x * 64 + 31, y * 64 + 16, 2, 30); } } }); };
  var tw = ctx.M({ map: towerTex(false), emissive: 0xffffff, emissiveMap: towerTex(true), emissiveIntensity: 0, roughness: 0.95 }), twRoof = ctx.M({ color: lin(0x5c5a56), roughness: 1 });
  tw.map.wrapS = tw.map.wrapT = tw.emissiveMap.wrapS = tw.emissiveMap.wrapT = T.RepeatWrapping;
  var tg = new T.BoxGeometry(46, 28, 13), tuv = tg.attributes.uv;
  for (var i = 0; i < tuv.count; i++) { var f = Math.floor(i / 4); tuv.setXY(i, tuv.getX(i) * (f < 2 ? 13 : 46) / 12.4, tuv.getY(i) * 28 / 12.4); }
  var TOW = [[-268, -150, 0], [-300, 66, 1], [246, -262, 0], [332, -64, 1], [-190, -330, 0], [150, 300, 1]];
  var tim = new T.InstancedMesh(tg, [tw, tw, twRoof, twRoof, tw, tw], TOW.length), o3 = new T.Object3D();
  TOW.forEach(function (t, n) { clearRect(t[0] - 30, t[0] + 30, t[1] - 30, t[1] + 30, true); o3.position.set(t[0], 14, t[1]); o3.rotation.set(0, t[2] ? Math.PI / 2 : 0, 0); o3.updateMatrix(); tim.setMatrixAt(n, o3.matrix); });
  tim.receiveShadow = true; root.add(tim);
  var MX = 210, MZ = -360; cyl('solid', 0xb9382f, MX, 0, 26, MZ, 0.9, 0.6, 8); cyl('solid', 0xf2efe9, MX, 26, 52, MZ, 0.6, 0.35, 8); cyl('solid', 0xb9382f, MX, 52, 74, MZ, 0.35, 0.12, 8);
  var beaconMat = new T.SpriteMaterial({ color: 0xff3b2f, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: T.AdditiveBlending,
    map: ctx.ctex(64, 64, function (g) { var r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.3, 'rgba(255,120,100,.6)'); r.addColorStop(1, 'rgba(255,60,40,0)'); g.fillStyle = r; g.fillRect(0, 0, 64, 64); }) });
  [26, 52, 74].forEach(function (y) { var sp = new T.Sprite(beaconMat); sp.position.set(MX, y, MZ); sp.scale.set(7, 7, 1); root.add(sp); });

  /* ---------- сборка сеток ---------- */
  var mSolid = ctx.M({ vertexColors: true, roughness: 0.85 }), mRoofs = ctx.M({ vertexColors: true, roughness: 0.55, metalness: 0.35 });
  var mGlow = new T.MeshBasicMaterial({ color: 0x8a8578, fog: true });
  [['solid', mSolid, true], ['roofs', mRoofs, true], ['glow', mGlow, false]].forEach(function (b) {
    if (!buckets[b[0]]) return;
    var m = new T.Mesh(U.mergeBufferGeometries(buckets[b[0]]), b[1]); m.castShadow = b[2]; m.receiveShadow = b[2]; m.name = 'town-' + b[0]; root.add(m);
  });
  var haloMat = new T.PointsMaterial({ size: 26, sizeAttenuation: true, map: beaconMat.map, color: 0xffd9a0, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending, fog: false });
  var hp = []; lampPos.forEach(function (p) { hp.push(p[0], 3.85, p[1]); });
  var hg = new T.BufferGeometry(); hg.setAttribute('position', new T.Float32BufferAttribute(hp, 3)); var halo = new T.Points(hg, haloMat); halo.frustumCulled = false; root.add(halo);

  ctx.onMode(function (cur) {
    var lamp = cur.lamp || 0, win = cur.win || 0;
    houseMats.forEach(function (m) { m.emissiveIntensity = win * 0.85 + lamp * 0.25; });
    tw.emissiveIntensity = win * 0.9;
    mGlow.color.setRGB(0.54 + lamp * 0.46, 0.52 + lamp * 0.4, 0.47 + lamp * 0.25);
    haloMat.opacity = lamp * 0.55; beaconMat.opacity = lamp; mWater.emissiveIntensity = lamp * 0.18;
  });
  ctx.shadows();

  window.GKTown = { root: root, setVisible: function (v) { root.visible = !!v; ctx.shadows(); }, square: { x: QX, z: QZ } };
})();
