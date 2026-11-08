#!/usr/bin/env bash
# Автообновление сайта «Новый Квартал» на хостинге Timeweb из GitHub.
# Запускается по расписанию (Crontab) каждые 5 минут:  /bin/bash $HOME/repo/deploy/hosting-update.sh
# С любым аргументом (например: force) — обновить сайт, даже если новых правок нет.
set -u
REPO="$HOME/repo"
WEB="$HOME/public_html"
cd "$REPO" || exit 0
git fetch -q --depth 1 origin main || exit 0
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] && [ -z "${1:-}" ]; then exit 0; fi
git reset -q --hard origin/main
if command -v rsync >/dev/null 2>&1; then
  rsync -a --delete --exclude cgi-bin --exclude README.md "$REPO/gradosfera/" "$WEB/"
else
  cp -a "$REPO/gradosfera/." "$WEB/"
fi
echo "$(date '+%F %T') сайт обновлён до $(git rev-parse --short HEAD)" >> "$HOME/deploy.log"
