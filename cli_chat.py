"""Проверка бота прямо в терминале, без Инстаграма и Telegram.

Запуск:  python cli_chat.py
"""
from bot import brain
from bot.catalog import catalog

catalog.refresh()
print(f"Каталог: {len(catalog.by_code)} товаров. Пишите как клиент (выход — пустая строка).\n")
while True:
    text = input("Клиент: ").strip()
    if not text:
        break
    r = brain.respond("cli:me", text)
    print(f"\nБот: {r.text}")
    for p in r.photos:
        print(f"   📷 {p['title']} — {p['price']} ₽")
    if r.order or r.order_raw:
        print(f"   🌸 ЗАКАЗ -> сотрудникам: {r.order or r.order_raw}")
    if r.question:
        print(f"   ❓ ВОПРОС -> сотрудникам: {r.question}")
    if r.handoff:
        print("   🙋 Передано живому сотруднику")
    print()
