<?php
// ОБРАЗЕЦ. Настоящий файл: на хостинге В ДОМАШНЕЙ ПАПКЕ (рядом с public_html), имя gs-config.php. В git не кладём.
return [
    'telegram_token'    => '',          // токен бота от @BotFather
    'telegram_chat_ids' => [],          // id чатов/групп отдела продаж, например ['-1001234567890']
    'email_to'          => '',          // почта отдела продаж (можно вместо Telegram или вместе)
    'email_from'        => 'noreply@gradosfera.com',
];
