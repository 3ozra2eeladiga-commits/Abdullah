#!/usr/bin/env bash
# =====================================================================
#  Разнести сайты по отдельным репозиториям GitHub.
#  Бот остаётся в репозитории Abdullah — его сервер НЕ трогается.
#
#  Создаёт два репозитория и заливает в них файлы сайтов:
#    vizkod      ← папка studio/      (сайт vizkod.ru)
#    gradosfera  ← папка gradosfera/  (сайт gradosfera.com)
#
#  Что нужно:
#    • Git          — https://git-scm.com  (на Windows вместе с ним ставится Git Bash)
#    • GitHub CLI   — https://cli.github.com
#  Как запустить:
#    Windows: правой кнопкой по папке с файлом → «Open Git Bash here» → bash split-repos.sh
#    Mac/Linux: открыть Терминал в папке с файлом → bash split-repos.sh
#
#  Скрипт можно запускать повторно: уже созданные репозитории он не пересоздаёт.
#  Сайты на хостинге продолжают работать как раньше — переключение хостинга делается отдельно.
# =====================================================================
set -euo pipefail

OWNER="3ozra2eeladiga-commits"   # ваш аккаунт GitHub
SRC="Abdullah"                    # репозиторий, где сейчас всё лежит
VIS="--public"                    # --public (проще для хостинга) или --private

say(){ printf '\n\033[1;34m▶ %s\033[0m\n' "$*"; }
die(){ printf '\n\033[1;31m✖ %s\033[0m\n' "$*"; exit 1; }

command -v git >/dev/null 2>&1 || die "Не найден Git. Установите: https://git-scm.com"
command -v gh  >/dev/null 2>&1 || die "Не найден GitHub CLI. Установите: https://cli.github.com"

say "Проверяю вход в GitHub"
if ! gh auth status >/dev/null 2>&1; then
  echo "Сейчас откроется вход в GitHub. Выберите: GitHub.com → HTTPS → Login with a web browser."
  gh auth login
fi
gh auth setup-git >/dev/null 2>&1 || true

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
cd "$WORK"

say "Скачиваю $OWNER/$SRC (только последнюю версию)"
gh repo clone "$OWNER/$SRC" src -- --depth 1 -q

move_site(){  # $1 — имя нового репозитория, $2 — папка в Abdullah, $3 — описание
  local name="$1" dir="$2" desc="$3"
  [ -d "src/$dir" ] || die "В $SRC нет папки $dir"

  say "Репозиторий $name"
  if gh repo view "$OWNER/$name" >/dev/null 2>&1; then
    echo "Уже существует — не создаю заново."
  else
    gh repo create "$OWNER/$name" $VIS --description "$desc"
    echo "Создан: https://github.com/$OWNER/$name"
  fi

  rm -rf "$name"; mkdir "$name"
  cp -a "src/$dir/." "$name/"
  cd "$name"
  # служебные файлы, которые не должны попадать в репозиторий сайта
  if [ ! -f .gitignore ]; then
    printf '%s\n' '.DS_Store' '*.log' '*.zip' '.env' 'gs-config.php' 'gs-*.json' 'gs-leads.csv' 'gk-data/' > .gitignore
  fi
  git init -q -b main
  git add -A
  git -c user.name="$OWNER" -c user.email="$OWNER@users.noreply.github.com" \
      commit -q -m "Сайт перенесён из $SRC/$dir"
  git remote add origin "https://github.com/$OWNER/$name.git"
  if git push -q -u origin main; then
    echo "Файлы залиты ✅  ($(git ls-files | wc -l | tr -d ' ') файлов)"
  else
    echo "⚠ Не удалось залить: в репозитории $name уже есть другие файлы. Его нужно сделать пустым или удалить и запустить скрипт снова."
  fi
  cd ..
}

move_site vizkod     studio     "Сайт студии VIZKOD — vizkod.ru"
move_site gradosfera gradosfera "Сайт ЖК «Новый Квартал» — gradosfera.com"

say "Готово"
echo "  https://github.com/$OWNER/vizkod"
echo "  https://github.com/$OWNER/gradosfera"
echo
echo "Напишите Claude «репозитории созданы» — он подключит их, подготовит переключение хостинга"
echo "и после проверки уберёт сайты из репозитория бота."
