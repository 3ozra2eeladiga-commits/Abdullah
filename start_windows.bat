@echo off
chcp 65001 >nul
set PYTHONUTF8=1
cd /d "%~dp0"
title Bot - cvetochnyj magazin

where py >nul 2>nul && (set PY=py) || (set PY=python)

if not exist .venv (
  echo Pervyj zapusk: ustanavlivayu programmy, 1-3 minuty...
  %PY% -m venv .venv || (echo Ne najden Python. Ustanovite ego s python.org i postav galochku "Add python.exe to PATH". & pause & exit /b)
  .venv\Scripts\python -m pip install -q -r requirements.txt
  .venv\Scripts\python -m pip install -q pillow
)

if not exist .env (
  copy test.env.example .env >nul
  echo.
  echo Otkroyu fajl nastroek. Vpishite klyuchi, sohranite (Ctrl+S^) i zakrojte Bloknot.
  notepad .env
)

echo.
echo Bot zapushchen. Ne zakryvajte eto okno. Ostanovit - Ctrl+C.
echo.
.venv\Scripts\python -m bot.app
pause
