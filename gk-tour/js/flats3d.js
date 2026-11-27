/* Квартиры прямо на доме: каждая квартира — светящаяся ячейка на фасаде своего этажа.
   Пока клиент крутит дом пальцем, ячейки мягко светятся; под пальцем/мышкой — ярче, с подписью; нажатие открывает карточку квартиры.
   Когда к экрану никто не подходит, ячейки по очереди «подмигивают» с подсказкой «Нажмите на квартиру».
   Расположение квартир на этаже условное (шахматки застройщика пока нет). Выключается ?off=flats3d. */
(function () {
  'use strict';
  if (!window.GKScene || !GKScene.ctx || !GKScene.ctx.enabled('flats3d')) return;
  var ctx = GKScene.ctx, T = ctx.T, d = ctx.dims, GK = window.GK || {};
  var flats = (GK.flats || []).slice(); if (!flats.length) return;
  var byId = {}; flats.forEach(function (f) { byId[f.id] = f; });

  /* ---------- раскладка: 13 квартир по периметру этажа ---------- */
  var A = d.P0, B = d.P1, OUT = 1.35;                     // ячейки на 1,35 м перед фасадом — не прячутся за эркерами
  var FACES = [                                            // [x0,z0] → [x1,z1], наружу (nx,nz), сколько квартир
    { a: [A.x0, A.z0 + 0.5], b: [A.x0, A.z1 - 9.2], n: [-1, 0], k: 4 },     // западная улица
    { a: [A.x0 + 9.2, A.z1], b: [B.x1, B.z1], n: [0, 1], k: 6 },            // южная улица
    { a: [B.x1, B.z1], b: [B.x1, B.z0], n: [1, 0], k: 1 },                  // восточный торец
    { a: [A.x1, A.z0], b: [A.x0 + 0.5, A.z0], n: [0, -1], k: 1 }            // северный торец
  ];
  var tw = ctx.house.tower;
  // какая планировка где: на углу с башней — 2-комнатная с полукруглой гостиной (86,56), на торцах — 3-комнатная и евро-двушка
  var ORDER = ['3a', '2b', '1a', '2d', '1c', '2f', '2c', '1b', '2g', '1d', '2a', '2e', '2h'];
  ORDER = ORDER.filter(function (id) { return byId[id]; }); flats.forEach(function (f) { if (ORDER.indexOf(f.id) < 0) ORDER.push(f.id); });

  var root = new T.Group(); root.name = 'flats3d'; ctx.scene.add(root);
  var mat = function () { return new T.MeshBasicMaterial({ color: 0xd9782e, transparent: true, opacity: 0, depthWrite: false, fog: false, side: T.DoubleSide, toneMapped: false }); };
  var lineM = function () { return new T.LineBasicMaterial({ color: 0xffb36b, transparent: true, opacity: 0, fog: false, toneMapped: false }); };
  var cells = [];
  function addCell(floor, flatId, geo, pos, ry) {
    var m = mat(), l = lineM(), mesh = new T.Mesh(geo, m), edge = new T.LineSegments(new T.EdgesGeometry(geo), l);
    mesh.position.copy(pos); edge.position.copy(pos); mesh.rotation.y = edge.rotation.y = ry || 0;
    mesh.renderOrder = 7; edge.renderOrder = 8; mesh.userData.cell = cells.length;
    root.add(mesh, edge); cells.push({ floor: floor, id: flatId, mesh: mesh, edge: edge, m: m, l: l, a: 0, goal: 0, pos: pos.clone() });
  }
  for (var fl = 2; fl <= d.floors; fl++) {
    var y0 = d.GH + (fl - 2) * d.FH + 0.12, h = d.FH - 0.24, yc = y0 + h / 2, i = 0;
    // угол с башней — полукруглая ячейка
    var tg = new T.CylinderGeometry(tw.r + OUT, tw.r + OUT, h, 28, 1, true, Math.PI * 1.5 - 0.35, Math.PI / 2 + 0.7);   // дуга вокруг башни: от запада до юга
    addCell(fl, ORDER[ORDER.length - 1], tg, new T.Vector3(tw.x, yc, tw.z), 0);
    FACES.forEach(function (F) {
      var dx = F.b[0] - F.a[0], dz = F.b[1] - F.a[1], L = Math.hypot(dx, dz), step = L / F.k;
      for (var k = 0; k < F.k; k++, i++) {
        var t = (k + 0.5) / F.k, cx = F.a[0] + dx * t + F.n[0] * OUT, cz = F.a[1] + dz * t + F.n[1] * OUT;
        var g = new T.PlaneGeometry(step - 0.35, h);
        addCell(fl, ORDER[i % (ORDER.length - 1)], g, new T.Vector3(cx, yc, cz), Math.atan2(F.n[0], F.n[1]));
      }
    });
  }
  root.visible = false;

  /* ---------- подпись над ячейкой ---------- */
  var css = '.f3-tag{position:absolute;z-index:6;left:0;top:0;pointer-events:none;transform:translate(-50%,-100%) translateY(-14px);padding:9px 14px 10px;border-radius:14px;' +
    'background:rgba(15,18,27,.86);border:1px solid rgba(226,168,120,.55);color:#efe7da;font:500 13.5px/1.25 "Onest",system-ui,sans-serif;white-space:nowrap;' +
    'box-shadow:0 12px 34px rgba(0,0,0,.35);-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);opacity:0;transition:opacity .25s}' +
    '.f3-tag.is-on{opacity:1}.f3-tag small{display:block;font-size:10.5px;letter-spacing:.16em;text-transform:uppercase;color:#e2a878;margin-bottom:4px}' +
    '.f3-tag b{font-family:"Forum",Georgia,serif;font-weight:400;font-size:19px}.f3-tag i{font-style:normal;color:rgba(239,231,218,.7);margin-left:8px}' +
    '.f3-tag.is-demo{border-color:#e2a878}.f3-tag.is-demo:after{content:"";position:absolute;left:50%;bottom:-26px;width:22px;height:22px;margin-left:-11px;border-radius:50%;' +
    'border:2px solid #e2a878;animation:f3tap 1.6s ease-out infinite}@keyframes f3tap{0%{transform:scale(.5);opacity:1}100%{transform:scale(1.6);opacity:0}}' +
    '.view-parking .f3-tag,.view-interior .f3-tag,.is-start .f3-tag,.has-panel .f3-tag.is-demo{display:none}';
  var st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  var tag = document.createElement('div'); tag.className = 'f3-tag'; ctx.app.appendChild(tag);
  var rub = function (x) { return (Math.round(x / 10000) / 100).toFixed(2).replace('.', ',') + ' млн ₽'; };
  var P0 = (GK.pricePts && GK.pricePts[GK.pricePts.length - 1][1]) || 88000;
  function showTag(c, demo) {
    var f = byId[c.id]; if (!f) return;
    tag.innerHTML = (demo ? '<small>Нажмите на квартиру</small>' : '<small>' + c.floor + ' этаж</small>') + '<b>' + f.name + '</b><i>' + f.area.toFixed(2).replace('.', ',') + ' м² · ' + rub(f.area * P0) + '</i>';
    tag.classList.toggle('is-demo', !!demo); tag.classList.add('is-on'); tag._c = c; placeTag();
  }
  function hideTag() { tag.classList.remove('is-on'); tag._c = null; }
  var v = new T.Vector3();
  function placeTag() {
    var c = tag._c; if (!c) return;
    v.copy(c.pos); v.y += d.FH * 0.4; v.project(ctx.camera);
    var r = ctx.canvas.getBoundingClientRect(), ar = ctx.app.getBoundingClientRect();
    tag.style.left = ((v.x + 1) / 2 * r.width + r.left - ar.left) + 'px'; tag.style.top = ((1 - v.y) / 2 * r.height + r.top - ar.top) + 'px';
  }

  /* ---------- состояния ---------- */
  var S = { drag: false, hover: null, demo: null, demoT: 0, lastAct: performance.now(), floorSel: null };
  function blocked() { var c = ctx.app.classList; return c.contains('view-parking') || c.contains('view-interior') || c.contains('is-start'); }
  function setGoals() {
    var any = !blocked() && (S.drag || S.hover != null || S.demo != null || S.floorSel != null);
    cells.forEach(function (c, i) {
      var g = 0;
      if (S.drag) g = 0.32;
      if (S.floorSel != null && c.floor === S.floorSel) g = Math.max(g, 0.45);
      if (S.demo === i) g = 0.85;
      if (S.hover === i) g = 1;
      c.goal = any ? g : 0;
    });
    ctx.dirty();
  }
  ctx.onFrame(function (dt) {
    var moving = false, vis = false;
    for (var i = 0; i < cells.length; i++) {
      var c = cells[i], dd = c.goal - c.a;
      if (Math.abs(dd) > 0.003) { c.a += dd * Math.min(1, dt * 8); moving = true; } else c.a = c.goal;
      c.m.opacity = c.a * c.a * 0.62; c.l.opacity = Math.min(1, c.a * 2.8); c.mesh.visible = c.edge.visible = c.a > 0.004; if (c.a > 0.004) vis = true;
    }
    root.visible = vis;
    if (tag._c) placeTag();
    // «подмигивание» для привлечения внимания
    var idle = performance.now() - S.lastAct;
    if (!blocked() && !ctx.app.classList.contains('has-panel') && !S.drag && S.hover == null && idle > 5000) {
      S.demoT -= dt;
      if (S.demoT <= 0) {
        var vis2 = cells.filter(function (c) { v.copy(c.pos).project(ctx.camera); return Math.abs(v.x) < 0.7 && Math.abs(v.y) < 0.75 && v.z < 1 && facing(c); });
        var pick = vis2.length ? vis2[Math.floor(Math.random() * vis2.length)] : null;
        S.demo = pick ? cells.indexOf(pick) : null; S.demoT = 3.2; setGoals();
        if (pick) showTag(pick, true); else hideTag();
      }
      moving = true;
    } else if (S.demo != null) { S.demo = null; if (S.hover == null) hideTag(); setGoals(); }
    return moving;
  });
  function facing(c) {                                     // ячейка смотрит на камеру (а не на обратную сторону дома)
    var n = new T.Vector3(0, 0, 1).applyAxisAngle(new T.Vector3(0, 1, 0), c.mesh.rotation.y);
    if (c.mesh.geometry.type === 'CylinderGeometry') n.set(-1, 0, 1).normalize();
    return n.dot(new T.Vector3().subVectors(ctx.camera.position, c.pos)) > 0;
  }

  /* ---------- нажатия: перехватываем тап раньше выбора этажа ---------- */
  var ray = new T.Raycaster(), ndc = new T.Vector2(), meshes = cells.map(function (c) { return c.mesh; });
  function hit(x, y) {
    if (blocked()) return null;
    var r = ctx.canvas.getBoundingClientRect(); ndc.set((x - r.left) / r.width * 2 - 1, -(y - r.top) / r.height * 2 + 1);
    ray.setFromCamera(ndc, ctx.camera); root.updateMatrixWorld(true);
    var vis = root.visible; root.visible = true; meshes.forEach(function (m) { m.visible = true; });
    var hs = ray.intersectObjects(meshes, false);
    root.visible = vis; cells.forEach(function (c) { c.mesh.visible = c.a > 0.004; });
    for (var i = 0; i < hs.length; i++) { var c = cells[hs[i].object.userData.cell]; if (facing(c)) return hs[i].object.userData.cell; }
    return null;
  }
  ctx.tapHook = function (x, y) {
    var i = hit(x, y); if (i == null) return false;
    var c = cells[i]; S.hover = i; setGoals(); showTag(c, false);
    if (window.GKUI && GKUI.openFlat) { GKUI.openFlat(c.id, c.floor); if (GKScene.select) GKScene.select(c.floor); }
    setTimeout(function () { S.hover = null; S.floorSel = c.floor; setGoals(); hideTag(); }, 900);
    return true;
  };
  ctx.hoverHook = function (x, y) {
    var i = hit(x, y);
    if (i !== S.hover) { S.hover = i; setGoals(); if (i != null) showTag(cells[i], false); else hideTag(); }
    ctx.canvas.style.cursor = i != null ? 'pointer' : '';
    return i != null;
  };
  var act = function () { S.lastAct = performance.now(); if (S.demo != null) { S.demo = null; hideTag(); setGoals(); } };
  ['pointerdown', 'wheel', 'keydown'].forEach(function (n) { document.addEventListener(n, act, { passive: true, capture: true }); });
  // палец ведёт по экрану: подсвечиваем все квартиры и ту, что под пальцем
  ctx.controls.addEventListener('start', function () { S.drag = true; setGoals(); });
  ctx.controls.addEventListener('end', function () { S.drag = false; S.hover = null; hideTag(); setGoals(); });
  ctx.canvas.addEventListener('pointermove', function (e) {
    if (!S.drag || e.pointerType === 'mouse') return;
    var i = hit(e.clientX, e.clientY); if (i !== S.hover) { S.hover = i; setGoals(); if (i != null) showTag(cells[i], false); else hideTag(); }
  });
  document.addEventListener('gk:view', function () { S.floorSel = null; S.hover = null; hideTag(); setGoals(); });
  // панель закрыли — снимаем подсветку этажа
  new MutationObserver(function () { if (!ctx.app.classList.contains('has-panel') && S.floorSel != null) { S.floorSel = null; setGoals(); } }).observe(ctx.app, { attributes: true, attributeFilter: ['class'] });

  window.GKFlats3D = { cells: cells, show: function (floor) { S.floorSel = floor; setGoals(); }, root: root };
})();
