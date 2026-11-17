"""«Тайный покупатель»: программа сама переписывается с ботом как разные клиенты и ищет нарушения правил.

Запуск (на сервере, где есть ключи ИИ):
    python -m tools.qa_shopper              — 12 случайных разговоров
    python -m tools.qa_shopper --all        — все разговоры
    python -m tools.qa_shopper --only roses_tomorrow,like8_smaller
    python -m tools.qa_shopper --list       — список разговоров

Безопасность: отдельная тестовая база (cache/qa/qa.db, стирается перед запуском); вся отправка в Telegram
подменена — ни клиентам, ни флористам ничего не уходит. Отчёт: cache/qa/report.txt (коротко) и
cache/qa/dialogs.txt (все переписки целиком). Бот (bot/app.py) запускает это по /qa и раз в сутки ночью и шлёт
отчёт только владельцу (QA_REPORT_TO).

Каждый разговор тратит ИИ так же, как живой клиент (~10–20 запросов).
"""
import argparse
import datetime as _real_dt
import json
import os
import random
import re
import sys
import time
import types

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
QA_DIR = os.path.join(ROOT, "cache", "qa")
os.makedirs(QA_DIR, exist_ok=True)
QA_DB = os.path.join(QA_DIR, "qa.db")
for _f in (QA_DB, QA_DB + "-journal", QA_DB + "-wal", QA_DB + "-shm"):
    if os.path.exists(_f):
        os.remove(_f)
os.chdir(ROOT)
os.environ["DB_PATH"] = QA_DB                 # ВАЖНО: до импорта bot.* — база берётся при импорте db
sys.path.insert(0, ROOT)

from bot import app, brain, config, db, llm, telegram_bot   # noqa: E402
from bot.catalog import catalog                               # noqa: E402

assert os.path.abspath(config.DB_PATH) == QA_DB, "тайный покупатель должен работать в отдельной базе"

MSK = _real_dt.timezone(_real_dt.timedelta(hours=3))

# ---------------------------------------------------------------- часы: разговоры идут «днём» (или «ночью»)
_OFFSET = [_real_dt.timedelta(0)]


class _FakeDT(_real_dt.datetime):
    @classmethod
    def now(cls, tz=None):
        return _real_dt.datetime.now(tz) + _OFFSET[0]


_shim = types.ModuleType("datetime")
_shim.__dict__.update(_real_dt.__dict__)
_shim.datetime = _FakeDT
brain.datetime = _shim
app.datetime = _shim


def set_clock(hour, minute=0):
    """Сдвигаем «часы» бота на сегодня hour:minute по Москве (дата — сегодняшняя)."""
    real = _real_dt.datetime.now(MSK)
    _OFFSET[0] = real.replace(hour=hour, minute=minute, second=0, microsecond=0) - real


# ---------------------------------------------------------------- подмена отправки: всё пишем в журнал
LOG = []            # [(client, kind, text, extra)]
STAFF_Q = []        # кнопки проверки наличия: [(client, qid)]


def _ev(client, kind, text="", extra=None):
    LOG.append((client, kind, text or "", extra))


def _qids(buttons, prefix):
    out = []
    for row in buttons or []:
        for b in row:
            m = re.match(prefix + r":ok:(\d+)", str(b.get("callback_data") or ""))
            if m:
                out.append(int(m.group(1)))
    return out


def _f_send_client(client, text):
    _ev(client, "bot", text)


def _f_send_client_photo(client, item):
    _ev(client, "photo", f"{item.get('title')} — {item.get('price')} ₽", [item])


def _f_send_client_photo_bytes(client, data, caption):
    _ev(client, "photo", caption or "(картинка)")


def _f_send_client_album(client, items, start=0):
    _ev(client, "album", "", {"items": list(items[:10]), "start": start})


def _f_notify_staff(client, text, buttons=None):
    _ev(client, "staff", text)
    for q in _qids(buttons, "ph"):
        STAFF_Q.append((client, q))


def _f_notify_staff_photo(client, photo, caption, buttons=None):
    _ev(client, "staff", caption)
    for q in _qids(buttons, "ph"):
        STAFF_Q.append((client, q))


def _f_notify_staff_order(client, items, text, buttons=None):
    _ev(client, "staff_order", text)


def _f_notify_staff_wait(client, text, buttons=None):
    _ev(client, "staff", text)


def _noop(*a, **k):
    return {}


for _name, _fn in {
    "call": _noop, "send": _noop, "send_photo": _noop, "typing": _noop, "ring": _noop, "ring_all": _noop,
    "stop_rings": _noop, "staff_answered": _noop, "remember_name": _noop, "ensure_staff_keyboard": _noop,
    "send_client": _f_send_client, "send_client_photo": _f_send_client_photo,
    "send_client_photo_bytes": _f_send_client_photo_bytes, "send_client_album": _f_send_client_album,
    "notify_staff": _f_notify_staff, "notify_staff_photo": _f_notify_staff_photo,
    "notify_staff_order": _f_notify_staff_order, "notify_staff_wait": _f_notify_staff_wait,
    "client_name": lambda client: "Тайный покупатель", "photo_bytes": lambda photo: b"",
}.items():
    setattr(telegram_bot, _name, _fn)
_USAGE = {"calls": 0, "chars": 0}
_real_complete = llm.complete


def _counted_complete(system, messages, attempts=3):
    _USAGE["calls"] += 1
    _USAGE["chars"] += len(system or "") + sum(len(str(m.get("content") or "")) for m in messages)
    return _real_complete(system, messages, attempts=attempts)


llm.complete = _counted_complete                   # считаем, сколько ИИ потратили (для отчёта о стоимости)
llm.classify_image = lambda data: "букет"          # фото «клиента» — считаем, что на нём букет
app.ALBUM_NUDGE_SEC = 10 ** 7                      # напоминания по таймеру в проверке не нужны
app.PHOTO_WAIT_SEC = 10 ** 7
app.PHOTO_NUDGE_SEC = 10 ** 7

# ---------------------------------------------------------------- «клиент»: данные по умолчанию
PERSONA = {
    "city": 1,                       # номер города в списке бота (1 — первый город магазина)
    "date": "завтра",
    "time": "к 15:00",
    "way": "доставка",               # доставка | самовывоз
    "address": "Крайнего, 90",
    "name": "Анна Петрова",
    "phone": "89281234567",
    "recipient": "Мария, 89280001122",
    "card": "нет",
    "card_text": "С днём рождения!",
    "pick": "2",                     # как выбирает букет из присланных
    "budget": "3000",
    "pack": "простая",
}

# ---------------------------------------------------------------- сценарии
# steps   — первые сообщения клиента (строка; {"photo": True, "caption": "..."} — фото от клиента).
# inject  — {событие: сообщение}: когда событие случилось впервые, клиент пишет это вместо обычного ответа.
#           События: album (прислали букеты), chosen (букет выбран, флористу ушла проверка), way (спросили
#           доставка/самовывоз), form (анкета по пунктам), summary (итог «Всё верно?»).
#           Сообщение — строка или {"text", "reply_to": N, "no_photos": True, "expect": рег.выр., "forbid": рег.выр.}.
# florist — как флорист отвечает на «есть в наличии?»: ok | no | none.   order — должен ли дойти заказ.
S = []


def sc(key, title, steps, order=True, clock=12, florist="ok", inject=None, char=None, **persona):
    S.append({"key": key, "title": title, "steps": steps, "order": order, "clock": clock, "florist": florist,
              "inject": inject or {}, "char": char, "persona": dict(PERSONA, **persona)})


sc("roses_tomorrow", "Розы на завтра", ["Здравствуйте, нужны розы на завтра"])
sc("hello_only", "Просто «здравствуйте»", ["Здравствуйте"])
sc("hello_emoji", "Только смайлы", ["🌹🌹🌹"])
sc("price_roses", "Сколько стоят розы?", ["Сколько стоят розы?"])
sc("budget_2500", "«На 2500» — итоговая цена", ["Нужен букет на 2500 на завтра в Пятигорске"])
sc("budget_upto", "«До 3000»", ["букет до 3000 на завтра"])
sc("budget_za", "«За 3000 рублей»", ["хочу букет за 3000 рублей, доставка послезавтра"], date="послезавтра")
sc("pick_word", "Выбор словом «второй»", ["букет на завтра"], pick="давайте второй")
sc("pick_word8", "Выбор словом «восьмой»", ["букет на завтра, любой"], pick="восьмой")
sc("pick_hash", "Выбор «№3»", ["букет на завтра"], pick="№3")
sc("pick_reply", "Выбор ответом на фото", ["букет на завтра"], pick={"reply_to": 2, "text": "вот этот"})
sc("like8_smaller", "«Как 8, но поменьше» без суммы", ["букет на завтра"],
   inject={"album": {"text": "а как 8, но поменьше можно?", "no_photos": True, "expect": r"бюджет",
                     "forbid": r"(?:повод|кому|какие цветы|какую гамму)[^.!?\n]*\?"}})
sc("like3_3000", "«Как 3, но на 3000»", ["букет на завтра"],
   inject={"album": {"text": "Как 3, но на 3000", "no_photos": True,
                     "forbid": r"бюджет|итог\w*\s+или|дешевле"}})
sc("like8_no_roses", "«Как 8, но без роз»", ["букет на завтра"],
   inject={"album": {"text": "как 8, но без роз", "no_photos": True}})
sc("wish_green", "Пожелание к выбранному: зелёная упаковка", ["букет на завтра"],
   inject={"chosen": {"text": "а можно в зелёной упаковке?", "no_photos": True}})
sc("fresh_after", "«Цветы свежие?» после букетов", ["букет роз на завтра"],
   inject={"album": {"text": "а розы свежие?", "no_photos": True}})
sc("fresh_first", "«У вас свежие розы?» первым сообщением", ["Здравствуйте, у вас свежие розы?"])
sc("more_12", "«Ещё» и выбор №12", ["букет на завтра"],
   inject={"album": "ещё варианты покажите"}, pick="12")
sc("apologize", "«Извинись» — без новых фото", ["букет на завтра"],
   inject={"album": {"text": "извинись", "no_photos": True}})
sc("change_mind", "Передумал после выбора", ["букет на завтра"],
   inject={"chosen": "подождите, я передумал, хочу другой букет"})
sc("urgent_now", "«Прямо сейчас»", ["Нужен букет прямо сейчас"], date="сегодня")
sc("in_hour", "«В течение часа»", ["можно букет в течение часа доставить?"], date="сегодня", time="как можно скорее")
sc("near_days", "«На ближайшие дни» — показать без даты", ["хочу посмотреть букеты на ближайшие дни"])
sc("weekend", "«На выходных»", ["нужны цветы на выходных"])
sc("no_date", "«Какие есть?» без даты — сначала дата", ["покажите какие есть букеты"])
sc("date_words", "Дата «25 ноября»", ["букет на 25 ноября"], date="25 ноября")
sc("date_dots", "Дата «20.11 к 12:00» и пионы", ["на 20.11 к 12:00 букет с пионами"], date="20.11", time="к 12:00")
sc("addr_first", "Сразу адрес и время", ["Доставка на Крайнего 90 завтра к 14, букет из роз"], time="к 14:00")
sc("all_in_one", "Всё одним сообщением",
   ["Здравствуйте! Завтра к 15:00 доставка в Пятигорске, Крайнего 90, букет роз до 4000, получатель "
    "Мария 89280001122, я Анна Петрова 89281234567"])
sc("minvody", "Минеральные Воды, доставка", ["цветы в Минводах на завтра"], city=2, address="22 Партсъезда, 10")
sc("pickup_minvody", "Самовывоз в Минводах", ["Здравствуйте, букет на завтра, заберу сама в Минводах"],
   city=2, way="самовывоз")
sc("pickup_pyat", "Самовывоз в Пятигорске", ["букет на завтра, самовывоз"], way="самовывоз")
sc("village", "Доставка в посёлок рядом", ["доставка в Горячеводск завтра"], address="Горячеводск, Ленина, 5")
sc("far_city", "Далёкий город (Ставрополь)", ["доставите в Ставрополь?"], order=False)
sc("deliv_price", "«Сколько стоит доставка?»", ["сколько стоит доставка?"])
sc("tulips", "«Тюльпаны есть?»", ["тюльпаны есть?"])
sc("peonies", "Пионы на завтра", ["пионы на завтра"])
sc("roses101", "101 роза", ["101 роза на завтра"])
sc("cheap", "Самый дешёвый", ["самый дешёвый букет на завтра"])
sc("card_yes", "С открыткой", ["букет на завтра маме на день рождения"], card="да", card_text="С днём рождения, мама!")
sc("card_text_first", "Текст открытки сразу", ["букет на завтра"],
   inject={"chosen": "и открытку с надписью «Люблю тебя»"})
sc("surprise", "Сюрприз — не звонить получателю", ["букет на завтра"],
   inject={"form": "это сюрприз, получателю не звоните"})
sc("no_own_phone", "Не хочет давать свой номер", ["букет на завтра"],
   inject={"form": "1. Анна\n2. свой номер не дам\n3. Мария 89280001122\n4. к 15:00, Крайнего 90"})
sc("addr_from_recipient", "«Адрес и время узнайте у получателя»", ["букет на завтра"],
   inject={"form": "1. Анна Петрова\n2. 89281234567\n3. Мария 89280001122\n4. адрес и время узнайте у неё"})
sc("bonus", "Вопрос про бонусную карту", ["букет на завтра"], inject={"form": "а что за бонусная карта?"})
sc("summary_fix", "«Нет» на итог и правка времени", ["букет на завтра"],
   inject={"summary": "нет, время к 17:00"})
sc("cancel", "Отмена на итоге", ["букет на завтра"], order=False, inject={"summary": "нет, отмените, передумала"})
sc("photo_client", "Фото букета от клиента", [{"photo": True, "caption": "есть такой букет на завтра?"}])
sc("photo_silent", "Фото без слов", [{"photo": True}])
sc("florist_no", "Флорист: нет в наличии", ["букет на завтра"], order=False, florist="no")
sc("salam", "«Салам алейкум»", ["Салам алейкум, нужен букет на завтра"])
sc("typos", "С опечатками", ["здраствуйте нужен букетик на зафтра дастафка"])
sc("split", "По одному слову", ["Здравствуйте", "мне на завтра", "розы красные"])
sc("human", "«Позовите человека»", ["позовите живого человека"], order=False)
sc("complaint", "Жалоба на вялые розы", ["вчера привезли вялые розы, я недовольна"], order=False)
sc("rude_once", "Грубость один раз", ["вы чё такие медленные блин, букет нужен на завтра"])
sc("hours", "«До скольки работаете?»", ["Добрый день, до скольки вы сегодня работаете?"])
sc("time_any", "«В любое время»", ["букет на завтра"], time="в любое время")
sc("time_on3", "Время «на 3»", ["букет на завтра"], time="на 3")
sc("night", "Ночью: заказ на завтра", ["Здравствуйте, нужен букет"], clock=23)
sc("night_late", "Глубокой ночью (2:00)", ["нужен букет на завтра утром"], clock=2, time="к 10:00")


# «Трудные» клиенты — их целиком играет ИИ (каждый ответ), со своим характером.
CHARS = {
    "hurry": ("Торопыга", "Очень спешишь. Пишешь коротко, без знаков препинания, часто «быстрее», «ну что», "
                          "иногда отвечаешь не на тот вопрос, лишь бы быстрее."),
    "noread": ("Не читает", "Не читаешь сообщения магазина целиком. Через раз отвечаешь невпопад или задаёшь свой вопрос "
                            "вместо ответа, иногда повторяешь то, что уже говорил."),
    "words": ("Пишет словами", "Все числа пишешь СЛОВАМИ: номер букета («девятый», «давайте третий»), время («в три часа "
                               "дня», «к пяти»), телефон словами по частям, сумму («тысячи на три»)."),
    "changer": ("Передумывает", "Посреди оформления меняешь решение: сначала доставка, потом самовывоз (или наоборот), "
                                "меняешь время или дату, один раз просишь другой букет."),
    "voice": ("Голосовой", "Пишешь как распознанное голосовое: длинно, без точек и запятых, с ошибками распознавания "
                           "(«дастафка», «завтро», «пятегорск»), с лишними словами «ну вот», «короче»."),
    "grumpy": ("Недовольный", "Раздражён, ворчишь («долго», «зачем столько вопросов», «вы же уже спрашивали»), "
                              "но без мата; всё же хочешь купить."),
    "lost": ("Пропадает", "Иногда пишешь «щас», «минуту», «алло», «ну что там?» вместо ответа, потом отвечаешь."),
    "mixnum": ("Путает номера", "Путаешь номера фото: называешь букет описанием («тот, с лилиями», «розовый») или "
                                "неверным номером, потом исправляешься."),
    "granny": ("Бабушка", "Пожилая, вежливая, многословная, плохо понимает, что значит «ответьте цифрой», "
                          "переспрашиваешь, пишешь «доченька»."),
    "allinone": ("Всё сразу", "Первым же сообщением пишешь почти всё: что, когда, куда, кому, свой телефон; потом "
                              "раздражаешься, если переспрашивают."),
    "questions": ("Много вопросов", "Задаёшь много вопросов: из каких цветов, сколько простоит, есть ли фото "
                                    "настоящего букета, как оплатить, можно ли картой, во сколько привезут."),
    "cheap": ("Экономный", "Ищешь подешевле, торгуешься: «а скидка есть?», «а дешевле можно?», «за 1500 что есть?»."),
    "husband": ("Муж-растерянный", "Мужчина, покупаешь жене, ничего не понимаешь в цветах: «ну красивый какой-нибудь», "
                                   "«а что обычно берут?», «на ваш вкус»."),
    "funeral": ("Траурный", "Нужны цветы на похороны/кладбище, чётное количество, скромно и с уважением."),
    "hospital": ("В больницу", "Доставка в больницу или роддом: отделение, палата, называешь всё постепенно."),
    "corporate": ("Корпоратив", "Заказываешь от фирмы несколько одинаковых букетов сотрудницам, нужна оплата по счёту."),
    "slang": ("Молодёжный сленг", "Пишешь сленгом и сокращениями: «прив», «норм», «оч», «спс», «го», «кринж», без заглавных."),
    "foreign": ("Плохо знает русский", "Плохо знаешь русский: короткие фразы, ошибки, иногда английские слова."),
    "anon": ("Аноним", "Хочешь анонимно: не называть отправителя получателю, сюрприз, свой номер давать не хочешь."),
    "today": ("Срочно сегодня", "Нужно СЕГОДНЯ через час-два, переживаешь, успеют ли, спрашиваешь «точно успеете?»."),
    "photo_q": ("Просит фото", "Просишь прислать ещё фото, «а покажите поближе», «а розовые есть?», долго выбираешь."),
    "callme": ("Перезвоните", "Просишь перезвонить, не хочешь переписываться, потом всё же отвечаешь коротко."),
}
_VARIANTS = [  # ИИ-клиенты получают разные данные — разнообразие разговоров
    {}, {"city": 2, "address": "22 Партсъезда, 10"}, {"way": "самовывоз"}, {"date": "послезавтра"},
    {"date": "сегодня", "time": "как можно скорее"}, {"time": "к 11:00"}, {"budget": "5000"}, {"budget": "1500"},
    {"recipient": "мама, Ольга 89280002233"}, {"date": "в субботу", "time": "к 18:00"},
]
for _k, (_t, _d) in CHARS.items():
    sc(f"ai_{_k}", f"ИИ-клиент: {_t}", [], char=_k, order=_k not in ("callme", "corporate"))

# Ещё «неудобные» начала и ответы (готовые фразы)
sc("hello_gone", "«Здрасте» и пропал, потом вернулся", ["здрасте", "ну так что", "букет нужен завтра"])
sc("photo_first_price", "Сразу «сколько стоит» (без букета)", ["сколько стоит?"])
sc("ignore_city", "Игнорирует вопрос про город", ["букет на завтра"],
   inject={"album": "а у вас доставка есть?"})
sc("wrong_answer_way", "На «доставка или самовывоз» отвечает не то", ["букет на завтра"],
   inject={"way": "а сколько по времени собирать будете?"})
sc("pick_ninth_word", "«Девятый» словом", ["букет на завтра"], pick="девятый")
sc("pick_desc", "Выбор описанием «тот, с лилиями»", ["букет на завтра"], pick="тот, где лилии")
sc("pick_two", "Выбрал два букета", ["букет на завтра"], pick="2 и 5")
sc("late_change_way", "Передумал: самовывоз вместо доставки", ["букет на завтра"],
   inject={"form": "ой, давайте лучше самовывоз"})
sc("late_change_date", "Передумал дату на итоге", ["букет на завтра"], inject={"summary": "ой, нет, на послезавтра"})
sc("voice_style", "Как голосовое, без знаков", ["ну короче мне надо букет завтро в пятегорск доставку к трём часам"])
sc("phone_words", "Телефон словами", ["букет на завтра"],
   inject={"form": "1. Анна\n2. восемь девятьсот двадцать восемь сто двадцать три сорок пять шестьдесят семь\n"
                   "3. Мария 89280001122\n4. к трём, Крайнего 90"})
sc("ask_twice", "Повторяет вопрос, не дождавшись", ["есть розы?", "есть розы?", "алло"])
sc("time_words", "Время словами «к пяти вечера»", ["букет на завтра"], time="к пяти вечера")
sc("emoji_answers", "Отвечает смайликами", ["букет на завтра"], inject={"album": "👍", "summary": "👍"})


# Розы — самые частые вопросы: начинают сразу с вопроса, без «здравствуйте» (Абдулла 17.11).
for _i, (_txt, _kw) in enumerate([
    ("розы есть?", {}), ("какие розы у вас есть", {}), ("красные розы есть?", {}),
    ("сколько стоит 51 роза", {}), ("101 роза цена", {}), ("21 роза красная сколько", {}),
    ("розы 60 см есть?", {}), ("а какой длины у вас розы?", {}), ("почём роза поштучно", {}),
    ("сколько стоит одна роза", {}), ("белые розы 15 штук на завтра", {}), ("кустовые розы есть?", {}),
    ("пионовидные розы в наличии?", {}), ("эквадорские розы есть?", {}),
    ("мне 25 роз красных к 18:00 сегодня", {"date": "сегодня", "time": "к 18:00"}),
    ("розы в коробке есть?", {}), ("букет из роз до 5000 на завтра", {"budget": "5000"}),
    ("11 роз маме на день рождения", {}), ("розы в шляпной коробке сколько стоят", {}),
    ("Вы работаете? срочно нужны розы", {"date": "сегодня", "time": "как можно скорее"}),
    ("цена?", {}), ("Добрый вечер. Хочу 35 роз микс", {}), ("роззы красные есть?", {}),
    ("здрасте мне розы нужны красные штук 25 на завтра", {}), ("фото роз покажите", {}),
    ("а розы свежие? когда привоз?", {}), ("сколько стоит 51 роза 70 см", {}),
    ("мне нужен букет из роз на юбилей 50 лет", {}), ("розы с доставкой в Ессентуки можно?", {}),
    ("Здравствуйте, 15 бордовых роз в крафте, сколько?", {}),
]):
    sc(f"rose_{_i + 1}", f"Розы: «{_txt}»", [_txt], **_kw)
CHARS["roses"] = ("Про розы", "Тебе нужны именно розы. Начинаешь сразу с вопроса, без «здравствуйте». Спрашиваешь цвет, "
                              "высоту стебля в см, сколько стоит 21/51/101 роза, поштучно или букетом, в коробке ли.")
CHARS["nohello"] = ("Без приветствия", "Никогда не здороваешься, пишешь одним-тремя словами: «цена?», «есть?», «а красные?».")
for _k in ("roses", "nohello"):
    sc(f"ai_{_k}", f"ИИ-клиент: {CHARS[_k][0]}", [], char=_k)
    sc(f"rose_ai_{_k}", f"ИИ-клиент: {CHARS[_k][0]} (2)", [], char=_k)


# ---------------------------------------------------------------- автоответчик «клиента»
def _city_answer(text, p):
    return str(p["city"])


def _form_answer(text, p):
    """Ответ на анкету «1. Ваши ФИО 2. Ваш телефон …» — по пунктам."""
    out = []
    for line in text.splitlines():
        m = re.match(r"\s*(\d+)\.\s*(.+)", line)
        if not m:
            continue
        n, item = m.group(1), m.group(2).lower()
        if "доставка или самовывоз" in item:
            v = p["way"]
        elif "фио" in item:
            v = p["name"]
        elif "ваш телефон" in item:
            v = p["phone"]
        elif "получател" in item:
            v = p["recipient"]
        elif "город" in item:
            v = ["Пятигорск", "Минеральные Воды"][min(p["city"], 2) - 1]
        elif "забирать" in item:
            v = p["time"]
        elif "время и адрес" in item or "адрес" in item:
            v = f"{p['time']}, {p['address']}"
        elif "время" in item:
            v = p["time"]
        else:
            v = "—"
        out.append(f"{n}. {v}")
    return "\n".join(out) or "да"


RULES_ANSWER = [
    # (регулярка по последнему сообщению бота, ответ: строка с {поле} или функция(text, persona), факты)
    (r"всё верно\?|все верно\?", "да", ()),
    (r"почти всё.*напишите «да»", "да", ()),
    (r"для заказа нужно:", _form_answer, ("name", "phone", "recipient", "time", "address", "way")),
    (r"по текущему заказу или .*новый", "2", ()),
    (r"1 — оформить заказ на завтра|оформить заказ на завтра", "1", ("date",)),
    (r"доставка или самовывоз", lambda t, p: "1" if p["way"] == "доставка" else "2", ("way",)),
    (r"из какого магазина заберёте", "1", ()),
    (r"на какую дату и в какой город", lambda t, p: f"{p['date']}, {p['city']}", ("date", "city")),
    (r"в какой город|из какого города", _city_answer, ("city",)),
    (r"1\s*—\s*да.*2\s*—\s*точно|точно к", "1", ()),
    (r"на какую дату и к какому времени", "{date} {time}", ("date", "time")),
    (r"на какую дату|напишите дату|подскажите дату|какого числа", "{date}", ("date",)),
    (r"с какого времени|к какому времени|во сколько|какое время", "{time}", ("time",)),
    (r"адрес доставки|какой адрес|куда доставить", "{address}", ("address",)),
    (r"ваше имя и телефон, и имя и телефон получателя", "я {name} {phone}, получатель {recipient}",
     ("name", "phone", "recipient")),
    (r"ваше имя и телефон", "{name} {phone}", ("name", "phone")),
    (r"а ваш номер телефона|ваш номер\?|оставите номер", "{phone}", ("phone",)),
    (r"имя и телефон получателя|телефон получателя", "{recipient}", ("recipient",)),
    (r"фамили", "Петрова", ("name",)),
    (r"упаковка", "{pack}", ()),
    (r"открытку добавим|открытк\w* нужн|добавить открытку", "{card}", ()),
    (r"напишем: «.*»\. верно", "да", ()),
    (r"какой текст", "{card_text}", ()),
    (r"выберите открытку", "1", ()),
    (r"берём\?", "да", ()),
    (r"бюджет", "{budget}", ("budget",)),
    (r"ответьте цифрой", "1", ()),
]


def _fill(tpl, p):
    return tpl.format(**p) if isinstance(tpl, str) else tpl


def _llm_customer(p, dialog, char=None):
    """Отвечает ИИ в роли клиента (по своей легенде; char — «трудный» характер из CHARS)."""
    trait = f" Твой характер: {CHARS[char][1]}" if char in CHARS else ""
    sys_prompt = ("Ты — клиент цветочного магазина, переписываешься в мессенджере. Хочешь заказать букет." + trait + " "
                  f"Твои данные: город {['Пятигорск', 'Минеральные Воды'][min(int(p['city']), 2) - 1]}, дата — {p['date']}, время — {p['time']}, {p['way']}, "
                  f"адрес {p['address']}, тебя зовут {p['name']}, телефон {p['phone']}, получатель {p['recipient']}, "
                  f"бюджет {p['budget']} ₽, открытка не нужна. Отвечай коротко (1–2 фразы), как живой человек в "
                  "мессенджере, без кавычек и пояснений. Если магазин прислал фото букетов — выбери один. "
                  "Если разговора ещё нет — начни его так, как начал бы ты. Пиши ТОЛЬКО свою реплику, никогда не пиши "
                  "за магазин и не добавляй «Пользователь:»/«Ответ:».")
    # Для ИИ «клиент» — это он сам (assistant), а бот магазина — собеседник (user).
    msgs = []
    for who, t in dialog[-10:]:
        if who not in ("bot", "client", "photos"):
            continue
        role = "assistant" if who == "client" else "user"
        if msgs and msgs[-1]["role"] == role:
            msgs[-1]["content"] += "\n" + t
        else:
            msgs.append({"role": role, "content": t})
    while msgs and msgs[0]["role"] != "user":
        msgs.pop(0)
    try:
        ans = llm.complete(sys_prompt, msgs or [{"role": "user", "content": "Здравствуйте!"}], attempts=2).strip()
        # ИИ иногда дописывает за магазин («Пользователь: …», «Дана: …», «Ответ 1») — берём только реплику клиента.
        ans = re.split(r"\b(?:Пользователь|Ассистент|Магазин|Флорист|Дана|Бот|Вопрос\s*\d*|Ответ\s*\d*)\s*:", ans)[0]
        ans = re.sub(r"^\W*(?:Клиент|Я)\s*:\s*", "", ans.strip(), flags=re.I)
        return re.sub(r"\s+", " ", ans).strip(" \"«»")[:300] or "да"
    except Exception:
        return "хочу оформить заказ"


# ---------------------------------------------------------------- проверки (по «ТВЁРДЫМ ПРАВИЛАМ»)
ASKS = {   # что бот спрашивает → какой факт уже должен быть известен, чтобы это был переспрос
    "date": r"на какую дату|напишите дату|подскажите дату|какого числа",
    "city": r"в какой город|из какого города",
    "way": r"доставка или самовывоз",
    "address": r"адрес доставки\?|какой адрес|куда доставить",
    "phone": r"а ваш номер телефона|ваш телефон\?",
    "budget": r"на какой бюджет|какой бюджет",
}
FORM_KEYS = {"ваши фио": "name", "ваш телефон": "phone", "имя и телефон получателя": "recipient",
             "город доставки": "city", "доставка или самовывоз": "way"}
DATE_RE = re.compile(r"сегодня|завтра|послезавтра|\b\d{1,2}[./]\d{1,2}\b|\b\d{1,2}\s+(?:январ|феврал|март|апрел|ма[яй]|"
                     r"июн|июл|август|сентябр|октябр|ноябр|декабр)|сейчас|срочно|в\s+течени\w*\s+час|"
                     r"понедельник|вторник|сред[ау]|четверг|пятниц|суббот|воскресень", re.I)
VAGUE_RE = brain.VAGUE_DATE_RE
SUM_RE = re.compile(r"(?:\bна|\bза|\bдо|\bоколо|\bв\s+пределах)\s*\d[\d\s]{2,6}|\d[\d\s]{2,6}\s*(?:₽|р\b|руб|тыс)", re.I)
MORE_RE = re.compile(r"ещ[её]|друг|покаж|скин|пришл|вариант|какие|что\s+есть|есть\s+ли|не\s+нрав|подбер|посмотр|"
                     r"роз|пион|тюльпан|хризантем|гортенз|корзин|коробк|дешев|дорож|недорог|\d{4}", re.I)
PICK_RE = re.compile(r"^\W*(?:№\s*)?\d{1,2}\W*$|^\W*(?:давайте\s+)?(?:перв|втор|трет|четв[её]рт|пят|шест|седьм|восьм|"
                     r"девят|десят)\w*\W*$|вот\s+этот", re.I)
LEAK_RE = re.compile(r"\[ЗАКАЗ\]|\[ВОПРОС\]|\bnull\b|\bNone\b|\{\s*\"|\[[^\]\n]{1,40}\]")
FRESH_RE = re.compile(r"свеж", re.I)
DOUBLE_SUM_RE = re.compile(r"итог\w*\s+(?:цен\w*|сумм\w*)?\s*или|или\s+(?:подешевле|дешевле)|включая\s+доставку\s+или|"
                           r"с\s+доставкой\s+или\s+без", re.I)


# ---------------------------------------------------------------- живая страница (bot/app.py → /qa)
LIVE = {"running": True, "started": time.time(), "total": 0, "index": 0, "title": "", "char": "",
        "dialog": [], "runs": [], "usage": _USAGE}


def write_live():
    """cache/qa/live.json — что происходит прямо сейчас (страница /qa обновляется каждые 2–3 с)."""
    try:
        tmp = os.path.join(QA_DIR, "live.json.tmp")
        with open(tmp, "w", encoding="utf-8") as f:
            json.dump(LIVE, f, ensure_ascii=False)
        os.replace(tmp, os.path.join(QA_DIR, "live.json"))
    except OSError:
        pass


STOP_FILE = os.path.join(QA_DIR, "stop")


class Stopped(Exception):
    pass


def stop_requested():
    return os.path.exists(STOP_FILE)


class Run:
    def __init__(self, s, idx):
        self.s = s
        self.p = dict(s["persona"], **(random.choice(_VARIANTS) if s.get("char") else {}))
        self.client = f"tg:{990000000 + idx}"
        self.dialog = []          # [(who, text)] who: client | bot | photos | florist
        self.problems = []        # [(правило, пример)]
        self.facts = set()
        self.done_inject = set()
        self.chosen = False
        self.album_seen = False
        self.order = None
        self.album_codes = []
        self.pending_q = []       # [(qid, через сколько ходов ответить)]
        self.last_bot = ""
        self.same_bot = 0
        self.turn = 0

    def problem(self, rule, example):
        if any(r == rule for r, _ in self.problems):
            return                                   # одно и то же нарушение в разговоре считаем один раз
        self.problems.append((rule, example.strip()[:300]))

    # ---- один ход клиента
    def say(self, msg):
        if isinstance(msg, dict) and msg.get("photo"):
            self.dialog.append(("client", "[фото букета]" + (f" «{msg.get('caption')}»" if msg.get("caption") else "")))
            start = len(LOG)
            app.on_client_photo(self.client, "qa-photo", msg.get("caption") or "")
            t = app._photo_timers.pop(self.client, None)
            if t:
                t.cancel()
            app._photos_settled(self.client)
            return self._collect(start, msg.get("caption") or "", {})
        spec = msg if isinstance(msg, dict) else {"text": msg}
        text, quote = spec["text"], ""
        if spec.get("reply_to"):
            n = int(spec["reply_to"]) - 1
            if 0 <= n < len(self.album_codes):
                it = catalog.get(self.album_codes[n])
                if it:
                    quote = f"{it['title']} — {it['price']} ₽"
        self.dialog.append(("client", text + (f"   (ответ на фото №{spec['reply_to']})" if quote else "")))
        self._learn(text)
        start = len(LOG)
        try:
            app.deliver(self.client, text, quote=quote)
        except Exception as e:
            self.problem("💥 Ошибка в боте", f"«{text}» → {e!r}")
        out = self._collect(start, text, spec)
        self.live()
        return out

    def live(self):
        LIVE["dialog"] = self.dialog[-60:]
        LIVE["problems_now"] = self.problems
        write_live()

    def _learn(self, text):
        try:
            text = brain._fix_common_typos(text)             # «завтро» — бот понимает, и проверка тоже
        except Exception:
            pass
        if DATE_RE.search(text) or VAGUE_RE.search(text):
            self.facts.add("date")
        if catalog.match_city(text):
            self.facts.add("city")
        if re.search(r"достав|самовывоз|заберу", text, re.I) or (
                "доставка или самовывоз" in (self.last_bot or "").lower() and re.match(r"\W*[12]\b", text)):
            self.facts.add("way")
        if SUM_RE.search(text):
            self.facts.add("budget")
        p = self.p                                  # данные «клиента», которые он сам назвал в сообщении
        if p["phone"] in text:
            self.facts.add("phone")
        if p["address"].split(",")[0] in text:
            self.facts.add("address")

    def _collect(self, start, text, spec):
        bot_texts, albums, photos = [], [], 0
        for client, kind, t, extra in LOG[start:]:
            if client != self.client:
                continue
            if kind == "bot":
                bot_texts.append(t)
                self.dialog.append(("bot", t))
            elif kind == "album":
                items = extra["items"]
                albums.append(items)
                self.album_codes = self.album_codes[:extra["start"]] + [it["code"] for it in items]
                self.dialog.append(("photos", "📷 альбом: " + "; ".join(
                    f"{extra['start'] + i}. {it['title']} — {it['price']} ₽" for i, it in enumerate(items, 1))))
            elif kind == "photo":
                photos += 1
                self.dialog.append(("photos", f"📷 фото: {t}"))
            elif kind == "staff_order":
                self.dialog.append(("florist", "🧾 ЗАЯВКА ФЛОРИСТУ:\n" + t))
            elif kind == "staff":
                self.dialog.append(("florist", "👩‍🌾 флористу: " + t.split("\n")[0][:160]))
                if "Клиент выбрал" in t or "Клиент прислал фото" in t:
                    self.chosen = True
        whole = "\n".join(bot_texts)
        self._check(text, spec, whole, albums, photos)
        if albums:
            self.album_seen = True
        if whole:
            self.last_bot = bot_texts[-1]
        return whole

    # ---- проверки ответа бота на одно сообщение клиента
    def _check(self, text, spec, whole, albums, photos):
        low = whole.lower()
        if not whole and not albums and not photos and not self.order and "human" not in self.s["key"]:
            if not db.is_paused(self.client):
                self.problem("🤐 Бот промолчал", f"Клиент: «{text}» — ответа нет")
        if app.SORRY in whole:
            self.problem("💥 Техническая заминка (SORRY)", f"Клиент: «{text}»")
        if DOUBLE_SUM_RE.search(whole):
            self.problem("💰 Переспросил сумму «итого или дешевле» (правило 1)", f"Клиент: «{text}»\nБот: {whole}")
        for line in whole.splitlines():
            if FRESH_RE.search(line) and not re.search(r"флорист|уточн|провер|спрош|узна", line, re.I):
                self.problem("🌹 Бот сам ответил про свежесть (правило 4)", f"Клиент: «{text}»\nБот: {line}")
        if albums and self.chosen and not MORE_RE.search(text):
            self.problem("📷 Прислал букеты без просьбы после выбора", f"Клиент: «{text}»")
        if albums and not ({"date"} & self.facts) and not self.s["key"].startswith("photo"):
            self.problem("📅 Показал букеты без даты (правило 6)", f"Клиент: «{text}»")
        if (albums or "какой букет" in low or "какой из" in low) and PICK_RE.search(text) and self.album_seen:
            self.problem("🔢 Не понял номер букета", f"Клиент: «{text}»\nБот: {whole[:200]}")
        if (albums or photos) and spec.get("no_photos"):
            self.problem("📷 Прислал фото, хотя клиент просил про выбранный букет (правило 2)", f"Клиент: «{text}»")
        if spec.get("expect") and not re.search(spec["expect"], whole, re.I):
            self.problem("❔ Ответ не по правилу", f"Клиент: «{text}»\nОжидали: {spec['expect']}\nБот: {whole[:300]}")
        if spec.get("forbid") and re.search(spec["forbid"], whole, re.I):
            self.problem("❔ Лишний вопрос/ответ не по правилу", f"Клиент: «{text}»\nБот: {whole[:300]}")
        if "для заказа нужно" in low and "way" not in self.facts:
            self.problem("📋 Анкета раньше «Доставка или самовывоз?» (правило 5)", f"Бот: {whole[:250]}")
        for key, rx in ASKS.items():
            if key in self.facts and re.search(rx, low):
                self.problem("🔁 Переспросил то, что клиент уже сказал (правило 3)",
                             f"Уже известно: {key}. Клиент: «{text}»\nБот: {whole[:250]}")
                break
        if "для заказа нужно" in low:
            for item, key in FORM_KEYS.items():
                if key in self.facts and re.search(r"\d\.\s*" + item, low):
                    self.problem("🔁 В анкете — уже известное (правило 3)", f"Пункт «{item}»\nБот: {whole[:250]}")
        body = whole.replace(app.AVAIL_NOTE, "")
        if len(body) > 650 and "всё верно" not in low and "для заказа нужно" not in low:
            self.problem("📏 Слишком длинный ответ (правило 7)", f"{len(body)} знаков: {body[:200]}…")
        if LEAK_RE.search(whole):
            self.problem("🧩 Служебный текст виден клиенту", whole[:250])
        if whole and whole == self.last_bot:
            self.same_bot += 1
            if self.same_bot == 2:
                self.problem("🔄 Бот повторяет одно и то же", whole[:200])
        else:
            self.same_bot = 0

    # ---- что ответить на последний вопрос бота
    def next_message(self):
        t = self.last_bot
        low = t.lower()
        ev = []
        if self.album_seen:
            ev.append("album")
        if self.chosen:
            ev.append("chosen")
        if "доставка или самовывоз" in low:
            ev.append("way")
        if "для заказа нужно" in low:
            ev.append("form")
        if "всё верно?" in low or "все верно?" in low:
            ev.append("summary")
        if self.s.get("char"):
            return _llm_customer(self.p, self.dialog, self.s["char"])
        for e in ev:
            if e in self.s["inject"] and e not in self.done_inject:
                self.done_inject.add(e)
                return self.s["inject"][e]
        if self.album_seen and not self.chosen and "album" in ev and "фото" in low and "номер" in low:
            return self.p["pick"]                     # только что прислали букеты — выбираем
        for rx, ans, facts in RULES_ANSWER:
            if re.search(rx, low, re.S):
                self.facts.update(f for f in facts if f in ("date", "city", "way", "address", "phone", "budget", "name"))
                return ans(t, self.p) if callable(ans) else _fill(ans, self.p)
        if self.album_seen and not self.chosen and re.search(r"номер|фото|выбер|приглянул|понрав", low):
            return self.p["pick"]
        return _llm_customer(self.p, self.dialog)

    def florist_turn(self):
        """Флорист отвечает на «есть в наличии?» — через ход после вопроса (как живой человек)."""
        for client, qid in [x for x in STAFF_Q if x[0] == self.client]:
            STAFF_Q.remove((client, qid))
            self.pending_q.append([qid, 1])
        out = []
        for q in self.pending_q:
            q[1] -= 1
            if q[1] < 0 and self.s["florist"] in ("ok", "no"):
                start = len(LOG)
                self.dialog.append(("florist", f"👩‍🌾 флорист нажала: {'✅ есть' if self.s['florist'] == 'ok' else '❌ нет'}"))
                app.on_photo_button(q[0], self.s["florist"])
                out.append(self._collect(start, "(ответ флориста)", {}))
                if self.s["florist"] == "no":
                    for _c, kind, _t, _e in LOG[start:]:
                        if kind == "album" and _c == self.client:
                            self.problem("📷 После «нет в наличии» бот сам предложил другие (правило 8)", "")
        self.pending_q = [q for q in self.pending_q if q[1] >= 0]
        return out

    def run(self, max_turns=26):
        if self.s.get("char"):
            max_turns = 18                            # ИИ-клиент дороже — держим разговор покороче
        set_clock(self.s["clock"])
        db.clear_history(self.client)
        for step in self.s["steps"]:
            if stop_requested():
                raise Stopped()
            self.say(step)
            self.florist_turn()
            self._order_check()
        last_answers = []
        while not self.order and self.turn < max_turns and not db.is_paused(self.client):
            if stop_requested():
                raise Stopped()
            if not self.s["order"] and self.turn >= 3:
                break
            self.turn += 1
            msg = self.next_message()
            self.say(msg)
            self.florist_turn()
            self._order_check()
            if any(r.startswith("💥 Техническая заминка") for r, _ in self.problems):
                break                                    # ИИ не отвечает — дальше гонять разговор бессмысленно
            m = msg if isinstance(msg, str) else msg.get("text", "")
            last_answers.append(m)
            if len(last_answers) >= 4 and len(set(last_answers[-4:])) == 1:
                self.problem("🌀 Разговор зациклился", f"Клиент 4 раза отвечал «{m}», бот: {self.last_bot[:200]}")
                break
        if self.s["order"] and not self.order:
            why = "бот передал разговор сотруднику" if db.is_paused(self.client) else f"за {self.turn} ходов"
            self.problem("🚫 Заказ не дошёл до флориста", f"{why}. Последний ответ бота: {self.last_bot[:200]}")
        if self.order:
            if not app._order_ready(self.order):
                self.problem("⚠️ Заявка неполная", json.dumps(self.order, ensure_ascii=False)[:300])
            wish = " ".join(str(self.order.get(k) or "") for k in ("комментарий", "пожелания"))
            m_w = re.search(r"Пожелание[^:]*:\s*([^\n‼]+)", wish)
            if m_w and (re.search(r"\d{3,5}\s*₽", m_w.group(1)) or not brain.WISH_SIGNAL_RE.search(m_w.group(1))):
                self.problem("🗒 Мусор в пожеланиях заявки", f"«{m_w.group(1).strip()[:120]}»")
            if re.fullmatch(r"\W*(?:втор\w*|перв\w*|трет\w*|этот|эту|да|нет|\d{1,2})\W*", wish.strip(), re.I) and wish.strip():
                self.problem("🗒 Мусор в пожеланиях заявки", f"«{wish.strip()}»")
        if not self.s["order"] and self.order and self.s["key"] in ("cancel", "florist_no", "human", "complaint"):
            self.problem("🚫 Заказ ушёл, хотя не должен был", json.dumps(self.order, ensure_ascii=False)[:200])

    def _order_check(self):
        rows = db._exec("SELECT data FROM orders WHERE client=? ORDER BY id DESC LIMIT 1", (self.client,)).fetchall()
        if rows and not self.order:
            try:
                self.order = json.loads(rows[0]["data"])
            except ValueError:
                self.order = {"_raw": rows[0]["data"]}


# ---------------------------------------------------------------- отчёт
def report(runs, secs):
    probs = [(r, rule, ex) for r in runs for rule, ex in r.problems]
    orders = sum(1 for r in runs if r.order)
    want = sum(1 for r in runs if r.s["order"])
    head = (f"🕵️ Тайный покупатель: {len(runs)} разговоров за {int(secs // 60)} мин.\n"
            f"Заявок дошло до флориста: {orders} из {want} ожидаемых.\n"
            f"ИИ: {_USAGE['calls']} запросов, ~{_USAGE['chars'] // 3500} тыс. токенов.\n")
    if not probs:
        return head + "✅ Нарушений правил не найдено."
    by_rule = {}
    for r, rule, ex in probs:
        by_rule.setdefault(rule, []).append((r, ex))
    lines = [head + f"Найдено проблем: {len(probs)} (видов: {len(by_rule)})\n"]
    for i, (rule, items) in enumerate(sorted(by_rule.items(), key=lambda x: -len(x[1])), 1):
        names = ", ".join(sorted({r.s["title"] for r, _ in items}))
        r0, ex0 = items[0]
        lines.append(f"{i}. {rule} — {len(items)} раз\n   Где: {names[:300]}\n   Пример ({r0.s['title']}):\n   "
                     + ex0.replace("\n", "\n   ")[:400])
    lines.append("\nПолные переписки — в файле. Чтобы исправить, напишите, например: «исправь 1 и 3».")
    return "\n\n".join(lines)


def dialogs_text(runs):
    out = []
    for r in runs:
        out.append("=" * 60 + f"\n{r.s['title']}  [{r.s['key']}]  часы {r.s['clock']}:00, "
                   f"{'заказ дошёл' if r.order else 'заказа нет'}, проблем: {len(r.problems)}\n" + "=" * 60)
        for who, t in r.dialog:
            mark = {"client": "👤 КЛИЕНТ", "bot": "🤖 БОТ", "photos": "   ", "florist": "   "}[who]
            out.append(f"{mark}: {t}" if who in ("client", "bot") else f"{mark}{t}")
        for rule, ex in r.problems:
            out.append(f"   ❗ {rule}: {ex}")
        out.append("")
    return "\n".join(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--n", type=int, default=12)
    ap.add_argument("--only", default="")
    ap.add_argument("--next", type=int, default=0, help="следующие N разговоров по кругу (для ночного запуска)")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--loop", action="store_true", help="по кругу, пока не нажмут «Стоп» (файл cache/qa/stop)")
    ap.add_argument("--hours", type=float, default=3, help="страховка: не дольше N часов")
    ap.add_argument("--tag", default="", help="только разговоры, чей ключ начинается так (например rose_)")
    a = ap.parse_args()
    if a.list:
        for s in S:
            print(f"{s['key']:22} {s['title']}")
        return
    if a.tag:
        S[:] = [x for x in S if x["key"].startswith(a.tag)]
    if a.only:
        keys = [k.strip() for k in a.only.split(",") if k.strip()]
        chosen = [s for s in S if s["key"] in keys]
    elif a.next:
        pos_file = os.path.join(QA_DIR, "next.txt")
        try:
            pos = int(open(pos_file).read().strip()) % len(S)
        except (OSError, ValueError):
            pos = 0
        chosen = [S[(pos + i) % len(S)] for i in range(min(a.next, len(S)))]
        with open(pos_file, "w") as f:
            f.write(str((pos + len(chosen)) % len(S)))
    elif a.all:
        chosen = list(S)
    else:
        chosen = random.sample(S, min(a.n, len(S)))
    if a.loop:
        chosen = None                                   # без конца, по кругу, пока не нажмут «Стоп»
    catalog.refresh()
    t0 = time.time()
    runs = []
    LIVE["total"] = 0 if chosen is None else len(chosen)
    LIVE["loop"] = chosen is None
    order = []
    i = 0
    while True:
        if chosen is not None:
            if i >= len(chosen):
                break
            s = chosen[i]
        else:
            if not order:
                order = random.sample(S, len(S))
                order.sort(key=lambda x: not x.get("char"))   # ИИ-клиенты с характером — в начале круга
            s = order.pop(0)
        if stop_requested() or time.time() - t0 > a.hours * 3600:
            break
        r = Run(s, i)
        i += 1
        LIVE.update(index=i, title=s["title"], key=s["key"], dialog=[], problems_now=[])
        write_live()
        stopped = False
        try:
            r.run()
        except Stopped:
            stopped = True
        except Exception as e:
            r.problem("💥 Ошибка в тайном покупателе", repr(e))
        runs.append(r)
        LIVE["runs"].append({"title": s["title"] + (" (остановлен)" if stopped else ""), "key": s["key"],
                             "order": bool(r.order), "problems": r.problems, "dialog": r.dialog})
        write_live()
        save(runs, t0)
        add_stats(r)
        print(f"[{i}] {s['title']}: {'заказ' if r.order else 'без заказа'}, проблем {len(r.problems)}", flush=True)
        if stopped:
            break
        if len(runs) == 2 and all(any(x.startswith("💥 Техническая заминка") for x, _ in z.problems) for z in runs):
            with open(os.path.join(QA_DIR, "report.txt"), "w", encoding="utf-8") as f:
                f.write("❌ ИИ не отвечает (сбой Yandex или ключи) — проверку остановил после 2 разговоров.\n"
                        "Посмотрите страницу статуса сервера.")
            LIVE.update(running=False, report="❌ ИИ не отвечает — проверка остановлена", finished=time.time())
            write_live()
            return
    rep = save(runs, t0)
    LIVE.update(running=False, report=rep, finished=time.time())
    write_live()
    if os.path.exists(STOP_FILE):
        os.remove(STOP_FILE)
    print("\n" + rep)


def add_stats(r):
    """Счётчики за всё время (для «офиса агента»): сколько чатов, заявок, найденных проблем."""
    path = os.path.join(QA_DIR, "stats.json")
    try:
        st = json.load(open(path, encoding="utf-8"))
    except (OSError, ValueError):
        st = {}
    st["chats"] = st.get("chats", 0) + 1
    st["orders"] = st.get("orders", 0) + (1 if r.order else 0)
    st["found"] = st.get("found", 0) + len(r.problems)
    st["last"] = time.time()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(st, f)


def save(runs, t0):
    rep = report(runs, time.time() - t0)
    with open(os.path.join(QA_DIR, "report.txt"), "w", encoding="utf-8") as f:
        f.write(rep)
    with open(os.path.join(QA_DIR, "dialogs.txt"), "w", encoding="utf-8") as f:
        f.write(dialogs_text(runs))
    return rep


if __name__ == "__main__":
    main()
