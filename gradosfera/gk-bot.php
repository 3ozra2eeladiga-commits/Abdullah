<?php
/**
 * Телеграм-бот ЖК «Новый Квартал» (вебхук). Бот ЗАКРЫТ: отвечает только сотрудникам из gk-staff.php.
 * Чужому человеку бот пишет только его Telegram ID — чтобы Абдулла мог добавить его в список.
 * Кнопки:  📋 Заявки — последние заявки и сколько времени прошло;  🎫 Билеты — действующие золотые билеты;
 *          🔍 Проверить код — проверка кода клиента + кнопка «Погасить»;  📊 Статистика.
 */
require __DIR__ . '/gk-lib.php';
$cfg = gk_cfg();
$secret = substr(hash('sha256', ($cfg['telegram_token'] ?? '') . '|gk-webhook'), 0, 40);
if (empty($cfg['telegram_token']) || ($_SERVER['HTTP_X_TELEGRAM_BOT_API_SECRET_TOKEN'] ?? '') !== $secret) { http_response_code(403); exit; }
$u = json_decode((string)file_get_contents('php://input'), true);
// сразу отвечаем Telegram «принято», а работаем уже после — иначе он ждёт, считает это ошибкой и шлёт то же сообщение повторно
http_response_code(200);
ignore_user_abort(true); set_time_limit(90);
if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
else { header('Content-Length: 0'); header('Connection: close'); @ob_end_flush(); flush(); }
if (!is_array($u)) exit;
// одно и то же обновление обрабатываем один раз
$uidUp = (string)($u['update_id'] ?? '');
if ($uidUp !== '' && !gk_json_update('gs-updates.json', function (&$seen) use ($uidUp) { if (isset($seen[$uidUp])) return false; $seen[$uidUp] = time(); if (count($seen) > 300) $seen = array_slice($seen, -200, null, true); return true; })) exit;

const B_LEADS = '📋 Заявки', B_TICKETS = '🎫 Билеты', B_CHECK = '🔍 Проверить код', B_STATS = '📊 Статистика';
function menu() { return ['keyboard' => [[['text' => B_LEADS], ['text' => B_TICKETS]], [['text' => B_CHECK], ['text' => B_STATS]]], 'resize_keyboard' => true, 'is_persistent' => true]; }
function say($chat, $text, $kb = null) { $p = ['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => true]; $p['reply_markup'] = $kb ?: menu(); return gk_tg('sendMessage', $p); }
function who($from) { return trim(($from['first_name'] ?? '') . ' ' . ($from['last_name'] ?? '')) ?: ('id ' . ($from['id'] ?? '?')); }
function use_kb($code, $t) { return gk_ticket_status($t) === 'ok' ? ['inline_keyboard' => [[['text' => '✅ Погасить — подарок выдан', 'callback_data' => 'use:' . $code]]]] : null; }

// ---- нажали «Погасить» ----
if (!empty($u['callback_query'])) {
    $q = $u['callback_query']; $from = $q['from'];
    if (!gk_is_staff($from['id'])) { gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => 'Нет доступа', 'show_alert' => true]); exit; }
    $data = $q['data'] ?? '';
    $code = substr($data, 4);
    if (strpos($data, 'use:') === 0) {   // сначала подтверждение, чтобы не погасить случайно
        gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id']]);
        gk_tg('editMessageReplyMarkup', ['chat_id' => $q['message']['chat']['id'], 'message_id' => $q['message']['message_id'],
            'reply_markup' => ['inline_keyboard' => [[['text' => '❗ Да, погасить ' . $code, 'callback_data' => 'yes:' . $code]], [['text' => 'Отмена', 'callback_data' => 'no:' . $code]]]]]);
        exit;
    }
    $all = gk_json_read('gs-tickets.json'); $t = $all[$code] ?? null;
    if (!$t) { gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => 'Билет не найден']); exit; }
    if (strpos($data, 'no:') === 0) {
        gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => 'Отменено']);
        gk_tg('editMessageReplyMarkup', ['chat_id' => $q['message']['chat']['id'], 'message_id' => $q['message']['message_id'], 'reply_markup' => use_kb($code, $t) ?: ['inline_keyboard' => []]]);
        exit;
    }
    if (strpos($data, 'yes:') === 0) {
        $t = gk_json_update('gs-tickets.json', function (&$all) use ($code, $from) {
            if (gk_ticket_status($all[$code]) === 'ok') { $all[$code]['used'] = time(); $all[$code]['used_by'] = who($from); }
            return $all[$code];
        });
        gk_tg('answerCallbackQuery', ['callback_query_id' => $q['id'], 'text' => gk_ticket_status($t) === 'used' ? 'Погашено ✓' : 'Не удалось']);
        gk_tg('editMessageText', ['chat_id' => $q['message']['chat']['id'], 'message_id' => $q['message']['message_id'], 'text' => gk_ticket_text($code, $t)]);
        if (gk_ticket_status($t) === 'used') gk_send_group("☑️ Билет {$code} погашен — {$t['used_by']}\n👤 {$t['name']}, {$t['phone']}");
    }
    exit;
}

$m = $u['message'] ?? null;
if (!$m || ($m['chat']['type'] ?? '') !== 'private') exit;   // в группах бот только присылает заявки
$text = trim($m['text'] ?? ''); $chat = $m['chat']['id']; $uid = $m['from']['id'];
if (!gk_is_staff($uid)) {
    gk_tg('sendMessage', ['chat_id' => $chat, 'text' => "⛔ Это закрытый служебный бот ЖК «Новый Квартал».\nВаш Telegram ID: {$uid}\nЕсли вы сотрудник — передайте этот номер руководителю.\n\nПо вопросам покупки: +7 (938) 815-33-33", 'reply_markup' => ['remove_keyboard' => true]]);
    exit;
}
$state = gk_json_read('gs-state.json');
$waiting = !empty($state[$uid]) && $state[$uid] > time() - 600;   // ждём код после кнопки «Проверить код»
function set_wait($uid, $on) { gk_json_update('gs-state.json', function (&$s) use ($uid, $on) { if ($on) $s[$uid] = time(); else unset($s[$uid]); return true; }); }

if ($text === '/start' || $text === '/help' || $text === 'Меню') {
    set_wait($uid, false);
    say($chat, "Здравствуйте, " . ($m['from']['first_name'] ?? '') . "! 👋\n\n" . B_LEADS . " — последние заявки с сайта\n" . B_TICKETS . " — действующие золотые билеты\n" . B_CHECK . " — клиент пришёл с кодом: проверить и погасить\n" . B_STATS . " — сколько заявок и билетов");
    exit;
}
if ($text === B_LEADS) {
    set_wait($uid, false);
    $all = array_reverse(gk_json_read('gs-leads.json'));
    if (!$all) { say($chat, 'Заявок пока нет.'); exit; }
    $s = "📋 Последние заявки (всего " . count($all) . "):\n";
    foreach (array_slice($all, 0, 10) as $i => $l) {
        $s .= "\n" . ($i + 1) . ". " . ($l['demo'] ? '🧪 ' : '') . ($l['kind'] === 'ticket' ? '🎫 Билет ' . $l['code'] : '📞 Перезвонить') . "\n   👤 {$l['name']}, {$l['phone']}\n   🕐 " . gk_date($l['t']) . ' — ' . gk_ago($l['t']) . "\n";
    }
    say($chat, $s); exit;
}
if ($text === B_TICKETS) {
    set_wait($uid, false);
    $all = gk_json_read('gs-tickets.json'); $act = [];
    foreach ($all as $c => $t) if (gk_ticket_status($t) === 'ok') $act[$c] = $t;
    if (!$act) { say($chat, '🎫 Действующих билетов сейчас нет.'); exit; }
    uasort($act, function ($a, $b) { return $a['until'] - $b['until']; });
    $s = "🎫 Действующие билеты (" . count($act) . "):\n";
    foreach ($act as $c => $t) $s .= "\n{$c}" . (!empty($t['demo']) ? ' 🧪' : '') . "\n   👤 {$t['name']}, {$t['phone']}\n   ⏳ " . gk_left($t['until']) . " (до " . gk_date($t['until']) . ")\n";
    say($chat, $s); exit;
}
if ($text === B_STATS) {
    set_wait($uid, false);
    $leads = gk_json_read('gs-leads.json'); $tickets = gk_json_read('gs-tickets.json');
    $day = time() - 86400; $week = time() - 7 * 86400; $c = ['d' => 0, 'w' => 0, 'a' => 0]; $last = 0;
    foreach ($leads as $l) { if (!empty($l['demo'])) continue; $c['a']++; if ($l['t'] > $week) $c['w']++; if ($l['t'] > $day) $c['d']++; $last = max($last, $l['t']); }
    $st = ['ok' => 0, 'used' => 0, 'expired' => 0];
    foreach ($tickets as $t) if (empty($t['demo'])) $st[gk_ticket_status($t)]++;
    say($chat, "📊 Статистика (без демо-заявок)\n\nЗаявки: сегодня {$c['d']} · за неделю {$c['w']} · всего {$c['a']}\n" . ($last ? 'Последняя: ' . gk_ago($last) . "\n" : '') . "\n🎫 Золотые билеты:\nдействуют — {$st['ok']}\nпогашены (подарок выдан) — {$st['used']}\nпросрочены — {$st['expired']}");
    exit;
}
if ($text === B_CHECK) {
    set_wait($uid, true);
    say($chat, "🔍 Пришлите код, который показывает клиент.\nНапример: ЗБ-7K4M-29QX\n\nМожно маленькими буквами и без чёрточек — я пойму.", ['force_reply' => true, 'input_field_placeholder' => 'ЗБ-XXXX-XXXX']);
    exit;
}
// всё остальное считаем кодом билета (если похоже на код или ждали код)
$code = gk_norm_code($text);
if (!$waiting && !preg_match('/^ЗБ-[A-Z0-9]{4}-[A-Z0-9]{4}$/u', $code)) { say($chat, 'Выберите кнопку внизу 👇'); exit; }
set_wait($uid, false);
$all = gk_json_read('gs-tickets.json');
if (!isset($all[$code])) { say($chat, "❌ Билет {$code} не найден.\nТакой код сайт не выдавал — возможна подделка. Проверьте ещё раз: 8 знаков после «ЗБ-»."); exit; }
$t = $all[$code];
$s = gk_ticket_text($code, $t);
if (gk_ticket_status($t) === 'ok') $s .= "\n\nСверьте имя и телефон с паспортом/номером клиента.";
$p = ['chat_id' => $chat, 'text' => $s];
if ($k = use_kb($code, $t)) $p['reply_markup'] = $k;
gk_tg('sendMessage', $p);
