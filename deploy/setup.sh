#!/usr/bin/env bash
# Установка бота на чистый сервер Ubuntu 22.04/24.04.
# Запуск на сервере:  bash setup.sh
set -euo pipefail

REPO="https://github.com/3ozra2eeladiga-commits/Abdullah.git"
DIR=/opt/flowerbot

echo "=== 1/5 Устанавливаю программы ==="
apt-get update -y
apt-get install -y python3 python3-venv git curl debian-keyring debian-archive-keyring apt-transport-https
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi

echo "=== 2/5 Скачиваю код ==="
if [ -d "$DIR/.git" ]; then git -C "$DIR" pull; else git clone "$REPO" "$DIR"; fi
cd "$DIR"
python3 -m venv .venv
.venv/bin/pip install -q -r requirements.txt

echo "=== 3/5 Сертификат для GigaChat (нужен только для GigaChat) ==="
curl -sk -o "$DIR/russian_trusted_root_ca.pem" https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt || true

echo "=== 4/5 Настройки ==="
IP=$(curl -s https://api.ipify.org)
DOMAIN="$(echo "$IP" | tr . -).sslip.io"
if [ ! -f .env ]; then
  cp .env.example .env
  sed -i "s|^PUBLIC_BASE_URL=.*|PUBLIC_BASE_URL=https://$DOMAIN|" .env
  sed -i "s|^IG_VERIFY_TOKEN=.*|IG_VERIFY_TOKEN=$(head -c 12 /dev/urandom | od -An -tx1 | tr -d ' \n')|" .env
fi

echo "=== 5/5 Запускаю ==="
cat > /etc/caddy/Caddyfile <<CADDY
$DOMAIN {
    reverse_proxy 127.0.0.1:8080
}
CADDY
systemctl restart caddy

cat > /etc/systemd/system/flowerbot.service <<UNIT
[Unit]
Description=Flower shop Instagram bot
After=network-online.target

[Service]
WorkingDirectory=$DIR
ExecStart=$DIR/.venv/bin/python -m bot.app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable flowerbot

echo
echo "Готово! Адрес вашего сервера: https://$DOMAIN"
echo "Теперь заполните ключи:   nano $DIR/.env"
echo "и запустите бота:         systemctl restart flowerbot"
