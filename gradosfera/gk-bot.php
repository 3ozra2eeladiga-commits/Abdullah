<?php
/**
 * Телеграм-бот ЖК «Новый Квартал» (принимает обновления от Telegram — вебхук).
 * Проверка золотых билетов: сотрудник пишет боту в ЛИЧНЫЕ сообщения код (ЗБ-XXXX-XXXX) —
 * бот отвечает, действителен ли билет, и даёт кнопку «Погасить».
 * Проверять могут только участники группы заявок (бот сам спрашивает у Telegram, состоит ли человек в группе).
 */
require __DIR__ . '/gk-lib.php';
$cfg = gk_cfg();
// запрос должен прийти от Telegram с нашим секретом (его задаёт gk-setup.php при подключении)
$secret = substr(hash('sha256', ($cfg['telegram_token'] ?? '') . '|gk-webhook'), 0, 40);
if (empty($cfg['telegram_token']) || ($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '') !== $secret) { http_response_code(403); exit; }
$u = json_decode((string)file_get_contents('php://input'), true);
http_response_code(200);
if (!is_array($u)) exit;

function staff($userId) {
    $cfg = gk_cfg();
    if (empty($cfg['chat_id'])) return false;
    $r = gk_tg('getChatMember', ['chat_id' => $cfg['chat_id'], 'user_id' => $userId]);
    $st = $r['result']['status'] ?? '';
    return in_array($st, ['creator', 'administrator', 'member', 'restricted'], true);
}
function who($from) { return trim(($from['first_name'] ?? '') . ' ' . ($from['last_name'] ?? '')) ?: ('id ' . ($from['id'] ?? '?')); }
function kb($code, $t) { return gk_ticket_status($t) === 'ok' ? ['inline_keyboard' => [[['text' => '✅ Погасить (подарок выдан)', 'callback_data' => 'use:' . $code]]]] : null; }

// нажали «Погасить»
if (!empty($u['callback_query'])) {
    $q = $u['callback_query']; $from = $q['from'];
    $code = substr($q['data'] ?? '', 4);
    if (!staff($from['id'])) { gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => 'Нет доступа', 'show_alert' => true]); exit; }
    $t = gk_json_update('gs-tickets.json', function (&$all) use ($code, $from) {
        if (!isset($all[$code])) return null;
        if (gk_ticket_status($all[$code]) === 'ok') { $all[$code]['used'] = time(); $all[$code]['used_by'] = who($from); }
        return $all[$code];
    });
    if (!$t) { gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => 'Билет не найден']); exit; }
    gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => gk_ticket_status($t) === 'used' ? 'Погашено ✓' : 'Не удалось']);
    gk_tg('editMessageText', ['chat_id' => $q['message']['chat']['id'], 'message_id' => $q['message']['message_id'], 'text' => gk_ticket_text($code, $t)]);
    if (gk_ticket_status($t) === 'used') gk_send_group("☑️ Билет {$code} погашен — {$t['used_by']}\n👤 {$t['name']}, {$t['phone']}");
    exit;
}

$m = $u['message'] ?? null;
if (!$m || ($m['chat']['type'] ?? '') !== 'private') exit;   // в группе бот только пишет заявки
$text = trim($m['text'] ?? ''); $chat = $m['chat']['id'];
if (!staff($m['from']['id'])) { gk_tg('sendMessage', ['chat_id' => $chat, 'text' => 'Здравствуйте! Это служебный бот ЖК «Новый Квартал». По вопросам покупки звоните: +7 (938) 815-33-33']); exit; }
if ($text === '' || $text === '/start' || $text === '/help') {
    gk_tg('sendMessage', ['chat_id' => $chat, 'text' => "Здравствуйте, " . ($m['from']['first_name'] ?? '') . "!\nПришлите код золотого билета, например ЗБ-7K4M-29QX — я скажу, действителен ли он, и дам кнопку «Погасить»."]);
    exit;
}
$code = gk_norm_code($text);
$all = gk_json_read('gs-tickets.json');
if (!isset($all[$code])) { gk_tg('sendMessage', ['chat_id' => $chat, 'text' => "❌ Билет {$code} не найден.\nПроверьте код: 8 знаков после «ЗБ-»."]); exit; }
$t = $all[$code];
$p = ['chat_id' => $chat, 'text' => gk_ticket_text($code, $t)];
if ($k = kb($code, $t)) $p['reply_markup'] = $k;
gk_tg('sendMessage', $p);
