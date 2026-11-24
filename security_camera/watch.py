"""Security камера, версия 1.

Смотрит видео (файл или камера/регистратор по RTSP), находит людей, обводит их на экране,
при появлении нового человека включает голосовое предупреждение из колонки.

Запуск:
  python watch.py --source видео.mov --save demo.mp4          # проверка на записи, без окна
  python watch.py --source rtsp://логин:пароль@IP:554/Streaming/Channels/101 --show --sound
"""
import argparse
import os
import subprocess
import sys
import time

import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

HERE = os.path.dirname(os.path.abspath(__file__))
FONTS = ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
GREEN, RED, WHITE = (60, 220, 60), (255, 60, 60), (255, 255, 255)


def font(size):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


def play(name):
    """Проиграть voice/<name>.mp3 через колонку, не останавливая видео."""
    path = os.path.join(HERE, "voice", name + ".mp3")
    if not os.path.exists(path):
        return
    if sys.platform == "win32":
        cmd = ["powershell", "-c", "Add-Type -AssemblyName presentationCore; $p=New-Object System.Windows.Media.MediaPlayer;"
               "$p.Open('%s'); $p.Play(); Start-Sleep 12" % path]
    else:
        cmd = ["ffplay", "-nodisp", "-autoexit", "-loglevel", "quiet", path]
    try:
        subprocess.Popen(cmd)
    except OSError:
        pass


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, help="файл видео, номер веб-камеры или адрес rtsp://")
    ap.add_argument("--save", help="сохранить результат в файл mp4")
    ap.add_argument("--show", action="store_true", help="показывать окно на экране")
    ap.add_argument("--sound", action="store_true", help="включать голос из колонки")
    ap.add_argument("--model", default="yolo11s.pt")
    ap.add_argument("--min-frames", type=int, default=8, help="сколько кадров подряд видеть человека, чтобы считать его")
    ap.add_argument("--pause", type=int, default=40, help="пауза между приветствиями, секунд")
    a = ap.parse_args()

    model = YOLO(a.model)
    src = int(a.source) if a.source.isdigit() else a.source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit("Не открывается источник видео: %s" % a.source)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    out = None
    seen = {}          # номер человека -> сколько кадров его видели
    counted = set()    # кого уже посчитали
    last_voice = 0.0
    banner_until = -1.0
    n = 0
    f_big, f_small = None, None

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        n += 1
        now = n / fps if isinstance(src, str) and not src.startswith("rtsp") else time.time()
        h, w = frame.shape[:2]
        if f_big is None:
            f_big, f_small = font(max(16, min(w, h) // 30)), font(max(12, min(w, h) // 48))

        res = model.track(frame, persist=True, classes=[0], conf=0.35, verbose=False, tracker="bytetrack.yaml")[0]
        people = []
        if res.boxes is not None and res.boxes.id is not None:
            for box, tid in zip(res.boxes.xyxy.tolist(), res.boxes.id.int().tolist()):
                seen[tid] = seen.get(tid, 0) + 1
                if seen[tid] == a.min_frames and tid not in counted:
                    counted.add(tid)
                    print("%s новый человек №%d" % (time.strftime("%H:%M:%S"), len(counted)), flush=True)
                    if now - last_voice > a.pause or last_voice == 0:
                        last_voice = now
                        banner_until = now + 5
                        if a.sound:
                            play("welcome")
                if tid in counted:
                    people.append((box, sorted(counted).index(tid) + 1))

        img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        d = ImageDraw.Draw(img, "RGBA")
        t = max(2, h // 300)
        for (x1, y1, x2, y2), num in people:
            d.rectangle([x1, y1, x2, y2], outline=GREEN, width=t)
            label = "Человек %d · под наблюдением" % num
            tw = d.textlength(label, font=f_small)
            th = f_small.size + 8
            lx = max(0, min(x1, w - tw - 12))
            d.rectangle([lx, y1 - th, lx + tw + 12, y1], fill=GREEN)
            d.text((lx + 6, y1 - th + 3), label, font=f_small, fill=(0, 0, 0))
        # верхняя полоса
        bar = f_big.size + 20
        d.rectangle([0, 0, w, bar], fill=(0, 0, 0, 170))
        blink = int(now * 2) % 2 == 0
        d.ellipse([14, bar / 2 - 9, 32, bar / 2 + 9], fill=RED if blink else (120, 0, 0))
        d.text((44, 9), "УМНАЯ КАМЕРА · ЗАПИСЬ", font=f_big, fill=WHITE)
        right = "В зале: %d" % len(people)
        d.text((w - d.textlength(right, font=f_big) - 16, 9), right, font=f_big, fill=WHITE)
        if now < banner_until:
            msg = "Вы под видеонаблюдением"
            tw = d.textlength(msg, font=f_big)
            d.rectangle([0, h - bar, w, h], fill=(200, 30, 30, 220))
            d.text(((w - tw) / 2, h - bar + 9), msg, font=f_big, fill=WHITE)
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        if a.save:
            if out is None:
                out = cv2.VideoWriter(a.save, cv2.VideoWriter_fourcc(*"mp4v"), fps, (w, h))
            out.write(frame)
        if a.show:
            cv2.imshow("Security камера", frame)
            if cv2.waitKey(1) & 0xFF == 27:  # Esc — выход
                break

    cap.release()
    if out:
        out.release()
    print("Готово. Людей за всё время: %d" % len(counted))


if __name__ == "__main__":
    main()
