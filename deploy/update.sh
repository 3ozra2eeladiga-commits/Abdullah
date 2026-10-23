#!/usr/bin/env bash
# Обновить бота до последней версии из GitHub:  bash /opt/flowerbot/deploy/update.sh
set -euo pipefail
cd /opt/flowerbot
git pull
.venv/bin/pip install -q -r requirements.txt -r requirements-extra.txt
systemctl restart flowerbot
echo "Обновлено ✅"
