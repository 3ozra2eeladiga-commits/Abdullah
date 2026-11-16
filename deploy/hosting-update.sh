#!/usr/bin/env bash
# Автообновление сайта «Новый Квартал» на хостинге Timeweb из GitHub.
# Запускается по расписанию (Crontab) каждые 5 минут:  /bin/bash $HOME/repo/deploy/hosting-update.sh
# С любым аргументом (например: force) — обновить сайт, даже если новых правок нет.
set -u
REPO="$HOME/repo"
WEB="$HOME/public_html"
cd "$REPO" || exit 0
# сторож: проверяет сайт, бот ЖК и сервер бота цветов; при сбое пишет Абдулле в Telegram (в фоне, не мешает обновлению)
( curl -s -m 90 "https://gradosfera.com/gk-watch.php" >/dev/null 2>&1 || wget -q -T 90 -O /dev/null "https://gradosfera.com/gk-watch.php" ) &
# 3D-модель (gk-tour) на сайт НЕ выкладываем — она не готова и будет отдельно, для планшетов. Если папка осталась — убрать.
[ -f "$WEB/tour/js/house.js" ] && rm -rf "$WEB/tour"
git fetch -q --depth 1 origin main || exit 0
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ -z "${1:-}" ]; then exit 0; fi
git reset -q --hard origin/main
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude cgi-bin --exclude README.md --exclude gk-data "$REPO/gradosfera/" "$WEB/"   # gk-data — заявки и билеты бота ЖК, не стирать
else
  cp -a "$REPO/gradosfera/." "$WEB/"
fi
# сброс кэша браузера: подставляем номер версии в ссылки на css/js (?v=__V__)
sed -i "s/__V__/$(git rev-parse --short HEAD)/g" "$WEB/index.html"
echo "$(date '+%F %T') сайт обновлён до $(git rev-parse --short HEAD)" >> "$HOME/deploy.log"
