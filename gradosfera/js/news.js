/* Новости квартала: строитель-репортёр с микрофоном. Сам ничего не рассказывает — зазывает:
   «Нажмите на меня!», стучит по микрофону, подпрыгивает, стучит в телевизор, зевает от скуки.
   Нажали — телевизор включается, он «болтает» одну новость, потом экран гаснет: «Ещё? Нажмите!» */
(function () {
  'use strict';
  var box = document.getElementById('news'), say = document.getElementById('newsSay'), man = document.getElementById('newsMan');
  var ask = document.getElementById('newsAsk'), scr = document.getElementById('newsScreen');
  if (!box || !say || !man || !ask) return;
  var NEWS = [
    '🎁 Скоро акция! Оформите квартиру до Нового года — и получите подарок от «Градосферы».',
    '🥧 Живёте у нас — и самые вкусные осетинские пироги совсем рядом. Горячие, с пылу с жару!',
    '🏗 Строим быстро и сдаём в срок: сдача — I квартал 2028. Покупаете сейчас — заезжаете вовремя.'
  ];
  var ASK = [
    ['Нажмите на меня! 👆', 'hop'], ['Раз-раз… меня слышно? 🎤', 'tapmic'], ['Скучно? Нажмите — расскажу новость!', 'knock'],
    ['У меня свежие новости! Жмите!', 'hop'], ['Ну нажмите же… 🥺', 'bored'], ['Эй! Я тут! Новости! 📢', 'tapmic']
  ];
  var MORE = ['Ещё новость? Нажмите! 😉', 'Это не всё! Нажмите ещё 👆', 'Новости кончились… но могу повторить! 😄'];
  var cur = 0, ai = 0, busy = false, visible = false, askT = 0, typeT = 0, offT = 0;
  function act(name) { box.classList.remove('hop', 'tapmic', 'knock', 'bored'); void man.getBoundingClientRect(); if (name) box.classList.add(name); }
  function setAsk(txt) { ask.classList.remove('on'); setTimeout(function () { ask.textContent = txt; ask.classList.add('on'); }, 180); }
  function beg() {
    clearTimeout(askT); if (busy) return;
    if (visible) { var a = ASK[ai++ % ASK.length]; setAsk(a[0]); act(a[1]); }
    askT = setTimeout(beg, 3600);
  }
  function tell() {
    if (busy) return; busy = true; clearTimeout(askT); clearTimeout(offT); ask.classList.remove('on'); act('');
    box.classList.add('tv-on');
    var txt = Array.from(NEWS[cur]), k = 0, n = cur; cur = (cur + 1) % NEWS.length;
    say.textContent = '';
    setTimeout(function () {
      box.classList.add('talking');
      (function type() {
        k += 1; say.textContent = txt.slice(0, k).join('');
        if (k < txt.length) { typeT = setTimeout(type, 36); return; }
        box.classList.remove('talking');
        offT = setTimeout(function () {
          box.classList.remove('tv-on'); busy = false;
          setAsk(n === NEWS.length - 1 ? MORE[2] : MORE[n % 2]); act('hop');
          askT = setTimeout(beg, 4200);
        }, 3200);
      })();
    }, 450);
  }
  man.addEventListener('click', tell);
  man.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tell(); } });
  if (scr) scr.addEventListener('click', tell);
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(function (es) { es.forEach(function (e) { visible = e.isIntersecting; if (visible && !busy) { clearTimeout(askT); askT = setTimeout(beg, 500); } }); }, { threshold: 0.3 }).observe(box);
  } else { visible = true; beg(); }
})();
