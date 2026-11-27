@echo off
chcp 65001 >nul
set PYTHONIOENCODING=utf-8
cd /d "%~dp0"
echo Умная камера: подключение к регистратору магазина.
echo Ноутбук должен быть подключён к роутеру магазина (Wi-Fi или кабель).
"python\python.exe" connect.py
pause
