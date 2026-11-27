@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo Умная камера: внешняя USB веб-камера, с записью видео в папку records.
echo Закрыть окно - клавиша Esc. Записи потом пришлите для настройки.
"python\python.exe" watch.py --source 1 --show --sound --record --min-frames 4
pause
