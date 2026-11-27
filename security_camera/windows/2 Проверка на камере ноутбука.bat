@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo Умная камера: камера ноутбука. Пройдитесь перед камерой. Закрыть окно - клавиша Esc.
"python\python.exe" watch.py --source 0 --show --sound --skip 2 --min-frames 4
pause
