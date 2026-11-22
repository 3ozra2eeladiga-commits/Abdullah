#!/usr/bin/env bash
# Автообновление сайта «Новый Квартал» на хостинге Timeweb из GitHub.
# Запускается по расписанию (Crontab) каждые 5 минут:  /bin/bash $HOME/repo/deploy/hosting-update.sh
# С любым аргументом (например: force) — обновить сайт, даже если новых правок нет.
set -u
# ===== проверка каждые 30 секунд: cron запускает раз в 5 минут, а скрипт внутри делает 9 проходов с паузой 30 с =====
if [ -z "${DEPLOY_INNER:-}" ]; then
  LOCK="$HOME/.deploy.lock"
  if ! mkdir "$LOCK" 2>/dev/null; then
    [ -n "$(find "$LOCK" -maxdepth 0 -mmin +9 2>/dev/null)" ] && rm -rf "$LOCK" && mkdir "$LOCK" || exit 0
  fi
  for i in 1 2 3 4 5 6 7 8 9; do
    DEPLOY_INNER=$i /bin/bash "$HOME/repo/deploy/hosting-update.sh" "$@"
    [ "$i" = 9 ] || sleep 30
  done
  rmdir "$LOCK" 2>/dev/null; exit 0
fi
REPO="$HOME/repo"
WEB="$HOME/public_html"
cd "$REPO" || exit 0
# ===== ПЕРЕЕЗД НА ОТДЕЛЬНЫЕ РЕПОЗИТОРИИ (22.11.2026) =====
# Сайты теперь живут в своих репозиториях: vizkod и gradosfera (приватные, доступ — deploy-ключи ~/.ssh/deploy_*).
# Если ключи есть — скачиваем репозитории в ~/repos и дальше обновляем сайты ИХ скриптами; старая выкладка ниже не выполняется.
# Если что-то не так (нет ключей, не скачалось) — всё работает по-старому, сайты не ломаются.
git fetch -q --depth 1 origin main && [ "$(git rev-parse HEAD)" != "$(git rev-parse origin/main)" ] && git reset -q --hard origin/main
[ "${DEPLOY_INNER:-1}" = 1 ] && {
ST="$HOME/vizkod/public_html/deploy-status.txt"   # диагностика переезда (без секретов), смотреть: https://vizkod.ru/deploy-status.txt
{ echo "$(date '+%F %T')"; ls -1 "$HOME/.ssh" 2>&1; ls -1d "$HOME"/repos/* 2>&1; for h in github-vizkod github-gradosfera; do echo "== $h"; timeout 20 ssh -o BatchMode=yes -T "git@$h" 2>&1 | head -3; done; tail -5 "$HOME/deploy.log" 2>&1; echo "== PUB"; cat "$HOME/.ssh/deploy_vizkod.pub" "$HOME/.ssh/deploy_gradosfera.pub" 2>&1; for k in deploy_vizkod deploy_gradosfera; do ssh-keygen -lf "$HOME/.ssh/$k.pub" 2>&1; done; echo "== VERBOSE"; ls -la "$HOME/.ssh" 2>&1; ssh -V 2>&1; timeout 20 ssh -v -o BatchMode=yes -T git@github-vizkod 2>&1 | grep -iE "config|identity|offering|authenticat|denied|key" | head -30; } > "$ST" 2>&1
}
# ключи создались с паролем из «кривых» кавычек (испортило копирование) — снимаем пароль; публичная часть не меняется
for k in deploy_vizkod deploy_gradosfera; do
  [ -f "$HOME/.ssh/$k" ] && ! ssh-keygen -y -P "" -f "$HOME/.ssh/$k" >/dev/null 2>&1 && ssh-keygen -q -p -P "“”" -N "" -f "$HOME/.ssh/$k" >/dev/null 2>&1
done
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
[ "${DEPLOY_INNER:-1}" = 1 ] && ( curl -s -m 90 "https://gradosfera.com/gk-watch.php" >/dev/null 2>&1 || wget -q -T 90 -O /dev/null "https://gradosfera.com/gk-watch.php" ) &
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
