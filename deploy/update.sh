#!/usr/bin/env bash
# Обновить бота до последней версии из GitHub:  bash /opt/flowerbot/deploy/update.sh
# С флагом --auto (так его запускает таймер каждые 5 минут) — молчит, если обновлений нет.
# Ключи (.env) и история переписок (flowerbot.db) не трогаются.
set -uo pipefail   # без -e: одна ошибка (например, pip) НЕ должна помешать перезапуску бота
cd /opt/flowerbot
git fetch -q origin main || { echo "git fetch не удался — выходим"; exit 0; }
if [ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ]; then
  [ "${1:-}" = "--auto" ] || echo "Уже последняя версия ✅"
  exit 0
fi
git reset -q --hard origin/main
# Зависимости ставим, но если что-то пошло не так — всё равно перезапускаем бот на новом коде.
.venv/bin/pip install -q -r requirements.txt -r requirements-extra.txt || echo "⚠️ pip: предупреждение, продолжаем"
systemctl restart flowerbot
echo "Обновлено ✅ $(git log -1 --format='%h %s')"
