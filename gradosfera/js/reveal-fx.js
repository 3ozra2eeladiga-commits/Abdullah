/* Появление фото «как на стройке». У каждого фото свой эффект (data-fx):
   blueprint — чертёж превращается в фото лазерной линией
   bricks    — фото выкладывается кирпичиками снизу вверх
   crane     — фото опускается на тросе крана и чуть раскачивается
   fence     — доски забора/лесов поворачиваются и открывают фото
   floors    — фото открывается полосами-этажами снизу вверх
   weld      — искра сварки обегает рамку, фото вспыхивает
   Запускается, когда фото входит в экран (GSAP ScrollTrigger). */
(function () {
  'use strict';
  if (typeof window.gsap === 'undefined' || typeof window.ScrollTrigger === 'undefined') return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var gsap = window.gsap;
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  var mobile = window.innerWidth < 760;

  function el(tag, cls, parent) { var e = document.createElement(tag); e.className = cls; if (parent) parent.appendChild(e); return e; }

  // контейнер, поверх которого рисуем эффект
  function frameOf(node) {
    if (node.tagName === 'IMG') {
      var w = el('div', 'fx-wrap'); node.parentNode.insertBefore(w, node); w.appendChild(node); return w;
    }
    node.classList.add('fx-host'); return node;
  }

  var FX = {
    blueprint: function (box, img, done) {
      var clean = img.cloneNode(); clean.className = (img.className + ' fx-clean').trim(); clean.removeAttribute('loading');
      img.classList.add('fx-bp-img'); box.appendChild(clean);
      var grid = el('div', 'fx-grid', box), scan = el('div', 'fx-scan', box);
      gsap.set(clean, { clipPath: 'inset(0% 100% 0% 0%)' }); gsap.set(scan, { left: '0%' });
      var tl = gsap.timeline({ paused: true, onComplete: function () { img.classList.remove('fx-bp-img'); clean.remove(); grid.remove(); scan.remove(); done(); } });
      tl.from(grid, { opacity: 0, duration: 0.4 })
        .to(clean, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.5, ease: 'power2.inOut' }, 0.35)
        .to(scan, { left: '100%', duration: 1.5, ease: 'power2.inOut' }, 0.35)
        .to([grid, scan], { opacity: 0, duration: 0.4 }, 1.75);
      return tl;
    },

    bricks: function (box, img, done) {
      var rows = mobile ? 5 : 7, cols = mobile ? 5 : 8, cover = el('div', 'fx-cover', box), tiles = [];
      for (var r = 0; r < rows; r++) {
        var off = r % 2 ? -0.5 : 0;
        for (var c = off; c < cols; c++) {
          var t = el('i', 'fx-brick', cover);
          t.style.left = (c / cols * 100) + '%'; t.style.top = (r / rows * 100) + '%';
          t.style.width = (100 / cols + 0.4) + '%'; t.style.height = (100 / rows + 0.4) + '%';
          t.dataset.row = rows - 1 - r; tiles.push(t);
        }
      }
      var tl = gsap.timeline({ paused: true, onComplete: function () { cover.remove(); done(); } });
      tl.to(tiles, { opacity: 0, scale: 0.6, duration: 0.35, ease: 'power2.in',
        stagger: function (i, t) { return +t.dataset.row * 0.13 + Math.random() * 0.08; } });
      return tl;
    },

    crane: function (box, img, done) {
      box.classList.add('fx-crane');
      var cable = el('div', 'fx-cable', box); el('i', 'fx-hook', cable);
      gsap.set(box, { yPercent: -45, rotation: -3, opacity: 0 });
      var tl = gsap.timeline({ paused: true, onComplete: function () { cable.remove(); box.classList.remove('fx-crane'); done(); } });
      tl.to(box, { opacity: 1, duration: 0.3 })
        .to(box, { yPercent: 0, duration: 1.3, ease: 'power2.out' }, 0)
        .to(box, { rotation: 1.6, duration: 0.5, ease: 'sine.inOut' }, 0.6)
        .to(box, { rotation: -0.8, duration: 0.45, ease: 'sine.inOut' })
        .to(box, { rotation: 0, duration: 0.4, ease: 'sine.out' })
        .to(cable, { scaleY: 0, transformOrigin: 'top', opacity: 0, duration: 0.6, ease: 'power2.in' }, '-=0.3');
      return tl;
    },

    fence: function (box, img, done) {
      var n = mobile ? 6 : 9, cover = el('div', 'fx-cover fx-fence', box), boards = [];
      for (var i = 0; i < n; i++) {
        var b = el('i', 'fx-board', cover); b.style.left = (i / n * 100) + '%'; b.style.width = (100 / n + 0.3) + '%'; boards.push(b);
      }
      var tl = gsap.timeline({ paused: true, onComplete: function () { cover.remove(); done(); } });
      tl.to(boards, { rotationY: 92, duration: 0.7, ease: 'power2.inOut', stagger: 0.08, transformOrigin: 'left center' });
      return tl;
    },

    floors: function (box, img, done) {
      var n = 8, cover = el('div', 'fx-cover', box), bands = [];
      for (var i = 0; i < n; i++) {
        var b = el('i', 'fx-band', cover); b.style.top = ((n - 1 - i) / n * 100) + '%'; b.style.height = (100 / n + 0.4) + '%'; bands.push(b);
      }
      var tl = gsap.timeline({ paused: true, onComplete: function () { cover.remove(); done(); } });
      bands.forEach(function (b, i) { tl.to(b, { xPercent: i % 2 ? 101 : -101, duration: 0.55, ease: 'power3.inOut' }, i * 0.12); });
      return tl;
    },

    weld: function (box, img, done) {
      var ns = 'http://www.w3.org/2000/svg';
      var svg = document.createElementNS(ns, 'svg'); svg.setAttribute('class', 'fx-weld'); svg.setAttribute('preserveAspectRatio', 'none');
      var w = box.clientWidth || 400, h = box.clientHeight || 300;
      svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
      var rect = document.createElementNS(ns, 'rect');
      rect.setAttribute('x', 1.5); rect.setAttribute('y', 1.5); rect.setAttribute('width', w - 3); rect.setAttribute('height', h - 3);
      svg.appendChild(rect); box.appendChild(svg);
      var spark = el('i', 'fx-spark', box);
      var per = 2 * (w + h);
      gsap.set(rect, { strokeDasharray: per, strokeDashoffset: per });
      gsap.set(img, { opacity: 0.08, filter: 'brightness(0.4)' });
      var pos = { d: 0 };
      var place = function () {
        var d = pos.d % per, x, y;
        if (d < w) { x = d; y = 0; } else if (d < w + h) { x = w; y = d - w; } else if (d < 2 * w + h) { x = w - (d - w - h); y = h; } else { x = 0; y = h - (d - 2 * w - h); }
        spark.style.transform = 'translate(' + x + 'px,' + y + 'px)';
      };
      var tl = gsap.timeline({ paused: true, onComplete: function () { svg.remove(); spark.remove(); gsap.set(img, { clearProps: 'opacity,filter' }); done(); } });
      tl.to(rect, { strokeDashoffset: 0, duration: 1.2, ease: 'none' }, 0)
        .to(pos, { d: per, duration: 1.2, ease: 'none', onUpdate: place }, 0)
        .to(spark, { opacity: 0, duration: 0.2 }, 1.2)
        .to(img, { opacity: 1, filter: 'brightness(1.8)', duration: 0.18 }, 1.15)
        .to(img, { filter: 'brightness(1)', duration: 0.7, ease: 'power2.out' })
        .to(svg, { opacity: 0, duration: 0.6 }, '-=0.5');
      return tl;
    }
  };

  var auto = ['floors', 'fence', 'bricks'];   // для галереи — по кругу (лёгкие эффекты)
  function setup(node, kind) {
    var img = node.tagName === 'IMG' ? node : node.querySelector('img');
    if (!img || !FX[kind]) return;
    var box = frameOf(node);
    var tl = FX[kind](box, img, function () {});    // накладки создаём сразу, чтобы фото не мелькнуло до эффекта
    window.ScrollTrigger.create({ trigger: box, start: kind === 'crane' ? 'top 98%' : 'top 85%', once: true, onEnter: function () { tl.play(); } });
  }

  $$('[data-fx]').forEach(function (n) { setup(n, n.getAttribute('data-fx')); });
  // галерея: каждая фото по-своему, когда галерея появляется
  var gi = 0;
  $$('.gallery__item').forEach(function (n) { setup(n, auto[gi++ % auto.length]); });
})();
