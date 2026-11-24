"""Один раз создаёт голосовые фразы в папке voice/ (нужен интернет). Запуск: python make_voice.py"""
import asyncio
import os

import edge_tts

PHRASES = {
    "welcome": "Здравствуйте! В магазине работает умная система видеонаблюдения. Все действия покупателей записываются.",
    "pay": "Пожалуйста, не забудьте оплатить товар на кассе.",
}


async def main():
    folder = os.path.join(os.path.dirname(os.path.abspath(__file__)), "voice")
    os.makedirs(folder, exist_ok=True)
    for name, text in PHRASES.items():
        await edge_tts.Communicate(text, "ru-RU-DmitryNeural").save(os.path.join(folder, name + ".mp3"))
        print("готово:", name)


asyncio.run(main())
