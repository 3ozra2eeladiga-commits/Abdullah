"""Оплата через СБП банка Точка: QR-код и ссылка на сумму заказа, проверка оплаты.

Настройки (.env на сервере): TOCHKA_JWT — ключ API из интернет-банка Точки («Интеграции и API»),
TOCHKA_MERCHANT_ID — ID торговой точки (вида MA0000000000), TOCHKA_ACCOUNT_ID — «счёт/БИК».
Ключ — секрет: только в .env, не в репозитории и не в чате.
"""
import base64
import logging

import requests

from . import config

log = logging.getLogger(__name__)
API = "https://enter.tochka.com/uapi/sbp/v1.0"


def configured():
    return bool(config.TOCHKA_JWT and config.TOCHKA_MERCHANT_ID and config.TOCHKA_ACCOUNT_ID)


def _headers():
    return {"Authorization": f"Bearer {config.TOCHKA_JWT}", "Content-Type": "application/json"}


def create_qr(amount_rub, purpose):
    """Динамический QR СБП на сумму. Возвращает (ссылка, png_байты или None, qrc_id). Ошибка — исключение."""
    amount = int(round(float(amount_rub) * 100)) if config.TOCHKA_AMOUNT_IN_KOPECKS else round(float(amount_rub), 2)
    r = requests.post(
        f"{API}/qr-code/merchant/{config.TOCHKA_MERCHANT_ID}/{config.TOCHKA_ACCOUNT_ID}",
        headers=_headers(), timeout=30,
        json={"Data": {"amount": amount, "currency": "RUB", "paymentPurpose": purpose[:140], "qrcType": "02",
                       "ttl": config.TOCHKA_QR_TTL_MIN,
                       "imageParams": {"width": 400, "height": 400, "mediaType": "image/png"}}})
    if r.status_code >= 300:
        raise RuntimeError(f"Точка ответила {r.status_code}: {r.text[:300]}")
    d = (r.json() or {}).get("Data") or {}
    img = (d.get("image") or {}).get("content")
    return d.get("payload"), (base64.b64decode(img) if img else None), d.get("qrcId")


def is_paid(qrc_id):
    """True — оплачено, False — ещё нет, None — не удалось узнать."""
    try:
        r = requests.get(f"{API}/qr-codes/{qrc_id}/payment-status", headers=_headers(), timeout=20)
        if r.status_code >= 300:
            return None
        items = ((r.json() or {}).get("Data") or {}).get("paymentList") or []
        return any(str(x.get("status", "")).lower() in ("accepted", "success", "paid") for x in items)
    except Exception as e:                                   # проверка оплаты не должна ронять бота
        log.warning("Точка: статус оплаты не получен: %s", e)
        return None
