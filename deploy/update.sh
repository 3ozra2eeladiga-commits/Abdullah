#!/usr/bin/env bash
# Обновить бота до последней версии из GitHub:  bash /opt/flowerbot/deploy/update.sh
# С флагом --auto (так его запускает таймер каждые 5 минут) — молчит, если обновлений нет.
# Ключи (.env) и история переписок (flowerbot.db) не трогаются.
set -euo pipefail
cd /opt/flowerbot
git fetch -q origin main
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  [ "${1:-}" = "--auto" ] || echo "Уже последняя версия ✅"
  exit 0
fi
git reset -q --hard origin/main
.venv/bin/pip install -q -r requirements.txt -r requirements-extra.txt
systemctl restart flowerbot
echo "Обновлено ✅ $(git log -1 --format='%h %s')"
