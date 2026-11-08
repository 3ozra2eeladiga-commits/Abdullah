/* «Безопасность»: иконки рисуются при появлении */
(function(){var s=document.getElementById("safe");if(!s)return;s.classList.add("js");function go(){s.classList.add("in");}if(!("IntersectionObserver" in window)){go();return;}var o=new IntersectionObserver(function(e){if(e[0].isIntersecting){go();o.disconnect();}},{threshold:0,rootMargin:"0px 0px -15% 0px"});o.observe(s);setTimeout(go,6000);})();
/* фото сложнее утащить: без меню «Сохранить изображение» и перетаскивания (полностью запретить в браузере невозможно) */
document.addEventListener('contextmenu', function (e) { if (e.target.closest('img, canvas, .pcard, .desk')) e.preventDefault(); });
document.addEventListener('dragstart', function (e) { if (e.target.tagName === 'IMG') e.preventDefault(); });
