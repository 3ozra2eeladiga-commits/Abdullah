"""Подключение к регистратору магазина (HiWatch / Hikvision): находит его в сети, спрашивает пароль,
проверяет картинку и запускает умную камеру. Запуск: python connect.py"""
import concurrent.futures
import getpass
import json
import os
import socket
import subprocess
import sys
from urllib.parse import quote

os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp")
import cv2  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SETTINGS = os.path.join(HERE, "camera_settings.json")
try:
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass


def my_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "192.168.1.100"
    finally:
        s.close()


def port_open(ip, port=554):
    try:
        with socket.create_connection((ip, port), timeout=0.4):
            return True
    except OSError:
        return False


def find_recorders():
    base = my_ip().rsplit(".", 1)[0]
    print("Ищу регистратор в сети %s.* ..." % base)
    ips = ["%s.%d" % (base, i) for i in range(1, 255)]
    with concurrent.futures.ThreadPoolExecutor(64) as ex:
        found = [ip for ip, ok in zip(ips, ex.map(port_open, ips)) if ok]
    return found


def url(ip, user, pw, channel, sub):
    return "rtsp://%s:%s@%s:554/Streaming/Channels/%d0%d" % (quote(user, safe=""), quote(pw, safe=""), ip, channel, 2 if sub else 1)


def try_open(u):
    cap = cv2.VideoCapture(u)
    ok, frame = cap.read() if cap.isOpened() else (False, None)
    cap.release()
    return ok and frame is not None, (frame.shape[1], frame.shape[0]) if ok and frame is not None else None


def ask(text, default=""):
    v = input("%s%s: " % (text, " [%s]" % default if default else "")).strip()
    return v or default


def main():
    st = {}
    if os.path.exists(SETTINGS):
        try:
            st = json.load(open(SETTINGS, encoding="utf-8"))
        except Exception:
            st = {}
    if st and ask("Есть сохранённое подключение к %s. Использовать? (1 - да, 2 - заново)" % st.get("ip"), "1") == "1":
        pass
    else:
        found = find_recorders()
        if found:
            print("Нашёл устройства с видео:", ", ".join(found))
        else:
            print("Сам не нашёл. Адрес видно на мониторе регистратора: Меню - Настройка - Сеть.")
        ip = ask("Адрес регистратора", found[0] if found else "")
        user = ask("Логин", "admin")
        pw = getpass.getpass("Пароль регистратора (буквы не видны — так и надо): ")
        st = {"ip": ip, "user": user, "pw": pw}
    ch = int(ask("Какая камера (1, 2, 3, 4)", str(st.get("channel", 1))))
    st["channel"] = ch
    print("Проверяю камеру %d ..." % ch)
    ok, size = try_open(url(st["ip"], st["user"], st["pw"], ch, False))
    sub = False
    if not ok:
        ok, size = try_open(url(st["ip"], st["user"], st["pw"], ch, True))
        sub = ok
    if not ok:
        print("\nНе получилось. Проверьте:")
        print(" - пароль (это пароль регистратора, не приложения);")
        print(" - ноутбук подключён к тому же роутеру, что и регистратор;")
        print(" - камера %d работает на мониторе регистратора;" % ch)
        print(" - в регистраторе включён RTSP: Настройка - Сеть - Дополнительно - Порт RTSP 554.")
        if os.path.exists(SETTINGS):
            os.remove(SETTINGS)
        input("\nНажмите Enter, чтобы закрыть.")
        return
    print("Есть картинка %dx%d. Запускаю умную камеру. Закрыть - Esc." % size)
    json.dump(st, open(SETTINGS, "w", encoding="utf-8"))
    cmd = [sys.executable, os.path.join(HERE, "watch.py"), "--source", url(st["ip"], st["user"], st["pw"], ch, sub),
           "--show", "--sound", "--record", "--min-frames", "4"]
    subprocess.call(cmd)


if __name__ == "__main__":
    main()
