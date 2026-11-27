@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo Умная камера: проверка на видео с Кириллом. Закрыть окно - клавиша Esc.
"python\python.exe" watch.py --source samples\kirill.mp4 --show --sound --skip 2
pause
