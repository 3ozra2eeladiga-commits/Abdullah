"""Security камера, версия 2.

Смотрит видео (файл или камера/регистратор по RTSP), находит людей, обводит их на экране,
при появлении нового человека включает голосовое предупреждение из колонки.
Следит за руками: потянулся к полке (жёлтая рамка) -> та же рука спрятана/убрана к телу
(красная рамка «ПОДОЗРЕНИЕ», кадр сохраняется в alerts/, голос «не забудьте оплатить»).
При тревоге в углу экрана появляется окошко с сильным приближением лица этого человека.

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
try:   # чтобы русские сообщения не ломали консоль Windows
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
except Exception:
    pass
FONTS = ["C:/Windows/Fonts/arialbd.ttf", "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
         "/System/Library/Fonts/Supplemental/Arial Bold.ttf"]
GREEN, RED, WHITE, YELLOW = (60, 220, 60), (255, 40, 40), (255, 255, 255), (255, 210, 0)
REACH_X = 0.75      # кисть дальше этого от середины тела (в длинах туловища) = тянется к полке
REACH_SEC = 0.3     # сколько секунд подряд
HIDE_SEC = 0.5      # сколько секунд рука спрятана
WINDOW_SEC = 5.0    # сколько секунд после полки следим за рукой
ALERT_SEC = 6.0     # сколько секунд держим красную рамку
ZOOM_PART = 0.45    # размер окошка с лицом (доля от меньшей стороны кадра)
ZOOM_GROW = 0.4     # за сколько секунд окошко «вырастает»


def head_square(kp, box):
    """Квадрат вокруг головы: по точкам лица, а если лица не видно — верх фигуры."""
    x1, y1, x2, y2 = box
    face = [k for k in kp[:5] if k[2] > 0.5]
    sw = abs(kp[5][0] - kp[6][0]) if min(kp[5][2], kp[6][2]) > 0.5 else (x2 - x1) * 0.5
    size = max(sw * 1.5, (x2 - x1) * 0.55, 60.0)
    if face:
        cx = sum(k[0] for k in face) / len(face)
        cy = sum(k[1] for k in face) / len(face)
    else:
        cx, cy = (x1 + x2) / 2, y1 + size * 0.45
    return cx, cy, size


def zoom_crop(frame, cx, cy, size, out_px):
    """Вырезать квадрат и увеличить до out_px с лёгкой резкостью."""
    h, w = frame.shape[:2]
    size = int(min(size, w, h))
    x = int(min(max(cx - size / 2, 0), w - size))
    y = int(min(max(cy - size / 2, 0), h - size))
    crop = cv2.resize(frame[y:y + size, x:x + size], (out_px, out_px), interpolation=cv2.INTER_CUBIC)
    blur = cv2.GaussianBlur(crop, (0, 0), 2)
    crop = cv2.addWeighted(crop, 1.5, blur, -0.5, 0)
    return Image.fromarray(cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)), (x, y, x + size, y + size)


class Hands:
    """Состояние одного человека: спокойно -> взял с полки -> спрятал."""

    def __init__(self):
        self.state, self.until = "ok", 0.0
        self.reach = {9: 0.0, 10: 0.0}   # сколько секунд тянется каждая рука
        self.hide = 0.0
        self.hand = None                 # какая рука брала
        self.last = None
        self.alert_at = 0.0
        self.head = None                 # сглаженный квадрат головы для окошка

    def update(self, k, now):
        dt = 0.0 if self.last is None else min(0.5, max(0.0, now - self.last))
        self.last = now
        if min(k[5][2], k[6][2], k[11][2], k[12][2]) < 0.7:   # тело видно плохо — не судим
            return False
        hx, hy = (k[11][0] + k[12][0]) / 2, (k[11][1] + k[12][1]) / 2
        sx, sy = (k[5][0] + k[6][0]) / 2, (k[5][1] + k[6][1]) / 2
        torso = max(1.0, ((hx - sx) ** 2 + (hy - sy) ** 2) ** 0.5)
        new_alert = False
        for w in (9, 10):
            far = k[w][2] > 0.6 and abs(k[w][0] - hx) / torso > REACH_X
            self.reach[w] = self.reach[w] + dt if far else 0.0
            if self.reach[w] >= REACH_SEC and self.state != "alert":
                self.state, self.hand, self.until, self.hide = "reach", w, now + WINDOW_SEC, 0.0
        if self.state == "reach" and self.reach[self.hand] == 0.0:
            x, y, c = k[self.hand]
            hidden = c < 0.6 or (abs(x - hx) / torso < 0.25 and -0.6 < (y - hy) / torso < 0.4)
            self.hide = self.hide + dt if hidden else 0.0
            if self.hide >= HIDE_SEC:
                self.state, self.until, new_alert = "alert", now + ALERT_SEC, True
                self.alert_at = now
        if self.state != "ok" and now > self.until:
            self.state = "ok"
        return new_alert


def font(size):
    for p in FONTS:
        if os.path.exists(p):
            return ImageFont.truetype(p, size)
    return ImageFont.load_default()


WIN = "Smart camera"   # заголовок окна (латиницей — Windows иначе ломает буквы)


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
    ap.add_argument("--fullscreen", action="store_true", help="окно на весь экран (для экрана покупателей)")
    ap.add_argument("--sound", action="store_true", help="включать голос из колонки")
    ap.add_argument("--model", default="yolo11s-pose.pt")
    ap.add_argument("--skip", type=int, default=1, help="обрабатывать каждый N-й кадр (быстрее)")
    ap.add_argument("--min-frames", type=int, default=8, help="сколько кадров подряд видеть человека, чтобы считать его")
    ap.add_argument("--pause", type=int, default=40, help="пауза между приветствиями, секунд")
    a = ap.parse_args()

    local = os.path.join(HERE, a.model)
    model = YOLO(local if os.path.exists(local) else a.model)
    src = int(a.source) if a.source.isdigit() else a.source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit("Не открывается источник видео: %s" % a.source)
    fps = cap.get(cv2.CAP_PROP_FPS) or 25
    out = None
    seen = {}          # номер человека -> сколько кадров его видели
    counted = set()    # кого уже посчитали
    hands = {}         # номер человека -> Hands
    alerts = 0
    alert_banner = -1.0
    last_voice = 0.0
    banner_until = -1.0
    n = 0
    f_big, f_small = None, None

    while True:
        ok, frame = cap.read()
        if not ok:
            break
        n += 1
        if n % a.skip:
            continue
        now = n / fps if isinstance(src, str) and not src.startswith("rtsp") else time.time()
        h, w = frame.shape[:2]
        if f_big is None:
            f_big, f_small = font(max(16, min(w, h) // 30)), font(max(12, min(w, h) // 48))

        res = model.track(frame, persist=True, conf=0.35, verbose=False, tracker="bytetrack.yaml")[0]
        people = []
        if res.boxes is not None and res.boxes.id is not None:
            for box, tid, kp in zip(res.boxes.xyxy.tolist(), res.boxes.id.int().tolist(), res.keypoints.data.tolist()):
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
                    hd = hands.setdefault(tid, Hands())
                    if hd.update(kp, now):
                        alerts += 1
                        alert_banner = now + ALERT_SEC
                        print("%s ПОДОЗРЕНИЕ: взял с полки и спрятал руку" % time.strftime("%H:%M:%S"), flush=True)
                        os.makedirs(os.path.join(HERE, "alerts"), exist_ok=True)
                        cv2.imwrite(os.path.join(HERE, "alerts", time.strftime("%Y%m%d_%H%M%S") + "_%d.jpg" % alerts), frame)
                        if a.sound:
                            play("pay")
                    cx, cy, sz = head_square(kp, box)
                    if hd.head is None:
                        hd.head = (cx, cy, sz)
                    else:   # плавно, чтобы окошко не дёргалось
                        hd.head = tuple(0.7 * o + 0.3 * v for o, v in zip(hd.head, (cx, cy, sz)))
                    people.append((box, sorted(counted).index(tid) + 1, hd.state, kp, hd))

        img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
        d = ImageDraw.Draw(img, "RGBA")
        t = max(2, h // 300)
        for (x1, y1, x2, y2), num, st, kp, _ in people:
            col = {"ok": GREEN, "reach": YELLOW, "alert": RED}[st]
            d.rectangle([x1, y1, x2, y2], outline=col, width=t * (2 if st == "alert" else 1))
            for sh, el, wr in ((5, 7, 9), (6, 8, 10)):   # руки
                pts = [(kp[i][0], kp[i][1]) for i in (sh, el, wr) if kp[i][2] > 0.5]
                if len(pts) > 1:
                    d.line(pts, fill=col, width=t)
                if kp[wr][2] > 0.5:
                    r = t * 3
                    d.ellipse([kp[wr][0] - r, kp[wr][1] - r, kp[wr][0] + r, kp[wr][1] + r], outline=col, width=t)
            label = {"ok": "Человек %d · под наблюдением", "reach": "Человек %d · берёт товар с полки",
                     "alert": "Человек %d · ПОДОЗРЕНИЕ: спрятал товар"}[st] % num
            tw = d.textlength(label, font=f_small)
            th = f_small.size + 8
            lx = max(0, min(x1, w - tw - 12))
            d.rectangle([lx, y1 - th, lx + tw + 12, y1], fill=col)
            d.text((lx + 6, y1 - th + 3), label, font=f_small, fill=WHITE if st == "alert" else (0, 0, 0))
        # верхняя полоса
        bar = f_big.size + 20
        d.rectangle([0, 0, w, bar], fill=(0, 0, 0, 170))
        blink = int(now * 2) % 2 == 0
        d.ellipse([14, bar / 2 - 9, 32, bar / 2 + 9], fill=RED if blink else (120, 0, 0))
        d.text((44, 9), "УМНАЯ КАМЕРА · ЗАПИСЬ", font=f_big, fill=WHITE)
        right = "В зале: %d · Тревог: %d" % (len(people), alerts)
        d.text((w - d.textlength(right, font=f_big) - 16, 9), right, font=f_big, fill=WHITE)
        # окошко с приближением лица того, на ком тревога
        suspects = [p for p in people if p[2] == "alert"]
        if suspects:
            hd = max(suspects, key=lambda p: p[4].alert_at)[4]
            grow = min(1.0, max(0.0, (now - hd.alert_at) / ZOOM_GROW))
            grow = 1 - (1 - grow) ** 3
            full = int(min(w, h) * ZOOM_PART)
            sz = max(40, int(full * (0.25 + 0.75 * grow)))
            face, (fx1, fy1, fx2, fy2) = zoom_crop(frame, hd.head[0], hd.head[1], hd.head[2], sz)
            px, py = w - full - 16, bar + 16
            px, py = px + (full - sz), py
            d.rectangle([fx1, fy1, fx2, fy2], outline=RED, width=t)          # что увеличиваем
            d.line([(fx2, fy1), (px, py + sz)], fill=RED, width=t)
            img.paste(face, (px, py))
            d = ImageDraw.Draw(img, "RGBA")
            bw = t * 3
            d.rectangle([px - bw, py - bw, px + sz + bw, py + sz + bw], outline=RED if blink else WHITE, width=bw)
            if grow >= 1:
                cap_txt = "ВАШЕ ЛИЦО ЗАПИСАНО"
                tw = d.textlength(cap_txt, font=f_small)
                d.rectangle([px - bw, py + sz + bw, px + sz + bw, py + sz + bw + f_small.size + 14], fill=RED)
                d.text((px + (sz - tw) / 2, py + sz + bw + 6), cap_txt, font=f_small, fill=WHITE)
                rec = "● REC  ZOOM x%d" % max(2, round(min(w, h) * ZOOM_PART / max(1, fx2 - fx1)))
                d.text((px + 10, py + 8), rec, font=f_small, fill=RED if blink else WHITE)
        if now < alert_banner or now < banner_until:
            msg = "ВНИМАНИЕ! Оплатите товар на кассе" if now < alert_banner else "Вы под видеонаблюдением"
            tw = d.textlength(msg, font=f_big)
            d.rectangle([0, h - bar, w, h], fill=(200, 30, 30, 220))
            d.text(((w - tw) / 2, h - bar + 9), msg, font=f_big, fill=WHITE)
        frame = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)

        if a.save:
            if out is None:
                out = cv2.VideoWriter(a.save, cv2.VideoWriter_fourcc(*"mp4v"), fps / a.skip, (w, h))
            out.write(frame)
        if a.show:
            if n <= a.skip:
                cv2.namedWindow(WIN, cv2.WINDOW_NORMAL)
                if a.fullscreen:
                    cv2.setWindowProperty(WIN, cv2.WND_PROP_FULLSCREEN, cv2.WINDOW_FULLSCREEN)
            cv2.imshow(WIN, frame)
            if cv2.waitKey(1) & 0xFF == 27:  # Esc — выход
                break

    cap.release()
    if out:
        out.release()
    print("Готово. Людей за всё время: %d, тревог: %d" % (len(counted), alerts))


if __name__ == "__main__":
    main()
