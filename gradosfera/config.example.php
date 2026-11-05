<?php
// Скопируйте этот файл в config.php и заполните. config.php НЕ коммитится в git.
return [
    // Telegram: токен бота от @BotFather и id чатов/групп, куда слать заявки
    'telegram_token'    => '',
    'telegram_chat_ids' => [ /* '123456789', '-1001234567890' */ ],

    // E-mail (можно вместе с Telegram или вместо него)
    'email_to'   => '',                         // например: sales@gradosfera.com
    'email_from' => 'noreply@gradosfera.com',   // ящик на домене сайта

    'timezone' => 'Europe/Moscow',
];
