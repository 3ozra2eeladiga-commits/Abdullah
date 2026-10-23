#!/usr/bin/env bash
# Установка бота на чистый сервер Ubuntu 22.04/24.04 — одной командой:
#   curl -sSL https://raw.githubusercontent.com/3ozra2eeladiga-commits/Abdullah/main/deploy/setup.sh | sudo bash
# Скрипт сам спросит ключи, запустит бота и включит автообновление с GitHub (каждые 5 минут).
set -euo pipefail

REPO="https://github.com/3ozra2eeladiga-commits/Abdullah.git"
DIR=/opt/flowerbot

ask() {  # ask "Вопрос" ПЕРЕМЕННАЯ — читаем с клавиатуры, даже если скрипт пришёл через curl | bash
  local value=""
  while [ -z "$value" ]; do read -r -p "$1: " value </dev/tty; done
  printf -v "$2" '%s' "$value"
}

echo "=== 1/6 Устанавливаю программы (2–3 минуты) ==="
export DEBIAN_FRONTEND=noninteractive
apt-get update -y -q
apt-get install -y -q python3 python3-venv git curl debian-keyring debian-archive-keyring apt-transport-https gpg
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y -q && apt-get install -y -q caddy
fi

echo "=== 2/6 Скачиваю бота с GitHub ==="
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull -q; else git clone -q "$REPO" "$DIR"; fi
cd "$DIR"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt -r requirements-extra.txt
curl -sk -o "$DIR/russian_trusted_root_ca.pem" https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt || true

IP=$(curl -s https://api.ipify.org)
DOMAIN="$(echo "$IP" | tr . -).sslip.io"

echo "=== 3/6 Ключи ==="
if [ -f .env ]; then
  echo "Файл настроек уже есть — ключи не спрашиваю. Поменять: nano $DIR/.env"
else
  echo "Вставляйте значения по одному и нажимайте Enter (вставка в консоли — правой кнопкой мыши или Ctrl+Shift+V)."
  ask "Яндекс API-ключ (AQVN...)" YKEY
  ask "Яндекс ID каталога (b1g...)" YFOLDER
  ask "Telegram токен бота (цифры:буквы)" TGTOKEN
  ask "ID сотрудников в Telegram через запятую" TGIDS
  cat > .env <<ENV
LLM_PROVIDER=yandex
YANDEX_API_KEY=$YKEY
YANDEX_FOLDER_ID=$YFOLDER
YANDEX_MODEL=yandexgpt-lite/latest

TELEGRAM_TOKEN=$TGTOKEN
TELEGRAM_STAFF_IDS=$TGIDS

IG_ACCESS_TOKEN=
IG_APP_SECRET=
IG_VERIFY_TOKEN=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')
IG_API_VERSION=v21.0

PUBLIC_BASE_URL=https://$DOMAIN
PORT=8080
ENV
  chmod 600 .env
fi

echo "=== 4/6 Адрес для Инстаграма (https) ==="
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl restart caddy

echo "=== 5/6 Запускаю бота (будет работать всегда, и после перезагрузки) ==="
cat > /etc/systemd/system/flowerbot.service <<UNIT
[Unit]
Description=Flower shop bot
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/.venv/bin/python -m bot.app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

echo "=== 6/6 Включаю автообновление с GitHub (каждые 5 минут) ==="
cat > /etc/systemd/system/flowerbot-update.service <<UNIT
[Unit]
Description=Update flower shop bot from GitHub

[Service]
Type=oneshot
ExecStart=/bin/bash $DIR/deploy/update.sh --auto
UNIT
cat > /etc/systemd/system/flowerbot-update.timer <<UNIT
[Unit]
Description=Check GitHub for bot updates every 5 minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
UNIT

systemctl daemon-reload
systemctl enable --now flowerbot flowerbot-update.timer
systemctl restart flowerbot
sleep 5

echo
if systemctl is-active --quiet flowerbot; then
  echo "✅ ГОТОВО! Бот работает на сервере 24/7."
  echo "   Напишите боту в Telegram /test — он ответит."
  echo "   Адрес сервера: https://$DOMAIN"
else
  echo "❌ Бот не запустился. Пришлите эти строки:"
  journalctl -u flowerbot -n 20 --no-pager
fi
