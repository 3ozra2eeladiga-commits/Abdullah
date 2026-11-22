#!/usr/bin/env bash
# Автообновление сайта «Новый Квартал» на хостинге Timeweb из GitHub.
# Запускается по расписанию (Crontab) каждые 5 минут:  /bin/bash $HOME/repo/deploy/hosting-update.sh
# С любым аргументом (например: force) — обновить сайт, даже если новых правок нет.
set -u
REPO="$HOME/repo"
WEB="$HOME/public_html"
cd "$REPO" || exit 0
# ===== ПЕРЕЕЗД НА ОТДЕЛЬНЫЕ РЕПОЗИТОРИИ (22.11.2026) =====
# Сайты теперь живут в своих репозиториях: vizkod и gradosfera (приватные, доступ — deploy-ключи ~/.ssh/deploy_*).
# Если ключи есть — скачиваем репозитории в ~/repos и дальше обновляем сайты ИХ скриптами; старая выкладка ниже не выполняется.
# Если что-то не так (нет ключей, не скачалось) — всё работает по-старому, сайты не ломаются.
git fetch -q --depth 1 origin main && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && git reset -q --hard origin/main
if [ -f "$HOME/.ssh/deploy_vizkod" ] && [ -f "$HOME/.ssh/deploy_gradosfera" ]; then
  mkdir -p "$HOME/repos"; NEWV=""; NEWG=""
  if [ ! -d "$HOME/repos/vizkod/.git" ]; then
    git clone -q --depth 1 git@github-vizkod:3ozra2eeladiga-commits/vizkod.git "$HOME/repos/vizkod" >> "$HOME/deploy.log" 2>&1 && NEWV=force
  fi
  if [ ! -d "$HOME/repos/gradosfera/.git" ]; then
    git clone -q --depth 1 git@github-gradosfera:3ozra2eeladiga-commits/gradosfera.git "$HOME/repos/gradosfera" >> "$HOME/deploy.log" 2>&1 && NEWG=force
  fi
  if [ -d "$HOME/repos/vizkod/.git" ] && [ -d "$HOME/repos/gradosfera/.git" ]; then
    [ -n "$NEWV$NEWG" ] && echo "$(date '+%F %T') переезд: сайты теперь из отдельных репозиториев" >> "$HOME/deploy.log"
    /bin/bash "$HOME/repos/vizkod/deploy/hosting-update.sh" $NEWV
    /bin/bash "$HOME/repos/gradosfera/deploy/hosting-update.sh" $NEWG
    exit 0
  fi
fi
# ===== дальше — старая выкладка (на случай, если переезд не удался) =====
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
# сайт студии VIZKOD (папка studio/ → ~/vizkod/public_html; домен vizkod.ru привязывается к этой папке в панели Timeweb)
VZ="$HOME/vizkod/public_html"
mkdir -p "$VZ"
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude cgi-bin --exclude logo/sheet.html "$REPO/studio/" "$VZ/"
else
  cp -a "$REPO/studio/." "$VZ/"
fi
# сброс кэша браузера: подставляем номер версии в ссылки на css/js (?v=__V__)
sed -i "s/__V__/$(git rev-parse --short HEAD)/g" "$WEB/index.html"
echo "$(date '+%F %T') сайт обновлён до $(git rev-parse --short HEAD)" >> "$HOME/deploy.log"
