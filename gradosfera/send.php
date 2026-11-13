<?php
/**
 * Заявки с сайта («Перезвоните мне» в калькуляторе рассрочки).
 * 1) Каждая заявка ВСЕГДА сохраняется в файл ~/gs-leads.csv (вне сайта — снаружи его не открыть).
 * 2) Если настроен ~/gs-config.php — дополнительно уходит в Telegram и/или на почту.
 *    Конфиг лежит вне папки сайта, поэтому автообновление его не стирает и он не попадает в git.
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');

function out($ok, $error = null, $code = 200) {
    http_response_code($code);
    echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}
if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') out(false, 'Метод не поддерживается', 405);

$home = dirname(__DIR__);                       // на хостинге: /home/c/ci910477  (сайт — в public_html)
$cfg = is_file($home . '/gs-config.php') ? (require $home . '/gs-config.php') : [];
if (!is_array($cfg)) $cfg = [];

$in = json_decode(file_get_contents('php://input'), true);
if (!is_array($in)) $in = $_POST;
if (!empty($in['website'])) out(true);          // ловушка для ботов

$clean = function ($v, $max) { $v = trim(strip_tags((string)$v)); $v = preg_replace('/\s+/u', ' ', $v); return mb_substr($v, 0, $max); };
$name    = $clean($in['name'] ?? '', 80);
$topic   = $clean($in['topic'] ?? 'Заявка с сайта', 120);
$details = $clean($in['details'] ?? '', 400);
$digits  = preg_replace('/\D/', '', (string)($in['phone'] ?? ''));
if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);
if ($name === '') out(false, 'Напишите, пожалуйста, имя', 422);
if (!preg_match('/^7\d{10}$/', $digits)) out(false, 'Проверьте номер телефона', 422);

// не чаще 1 заявки в 20 секунд с одного адреса
$rl = sys_get_temp_dir() . '/gs_rl_' . md5($_SERVER['REMOTE_ADDR'] ?? '');
if (is_file($rl) && time() - filemtime($rl) < 20) out(false, 'Заявка уже отправлена — подождите немного', 429);
@touch($rl);

$phone = sprintf('+7 (%s) %s-%s-%s', substr($digits, 1, 3), substr($digits, 4, 3), substr($digits, 7, 2), substr($digits, 9, 2));
$date = (new DateTime('now', new DateTimeZone('Europe/Moscow')))->format('d.m.Y H:i');

// 1) файл-журнал заявок (страховка: ни одна заявка не потеряется)
$saved = false;
$fh = @fopen($home . '/gs-leads.csv', 'a');
if ($fh) {
    if (flock($fh, LOCK_EX)) { $saved = fputcsv($fh, [$date, $topic, $name, $phone, $details], ';') !== false; flock($fh, LOCK_UN); }
    fclose($fh);
}

$text = "🏢 Заявка с сайта «Новый Квартал»\n\n{$topic}\nИмя: {$name}\nТелефон: {$phone}\n" . ($details !== '' ? "Расчёт: {$details}\n" : '') . "Время: {$date}";
$sent = false;

// 2) Telegram
if (!empty($cfg['telegram_token']) && !empty($cfg['telegram_chat_ids']) && function_exists('curl_init')) {
    foreach ((array)$cfg['telegram_chat_ids'] as $chat) {
        $ch = curl_init('https://api.telegram.org/bot' . $cfg['telegram_token'] . '/sendMessage');
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 10,
            CURLOPT_POSTFIELDS => http_build_query(['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => 1])]);
        $res = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
        if ($res !== false && $code === 200) $sent = true;
    }
}
// 3) почта
if (!empty($cfg['email_to'])) {
    $from = $cfg['email_from'] ?? 'noreply@gradosfera.com';
    $headers = "From: =?UTF-8?B?" . base64_encode('Сайт Новый Квартал') . "?= <{$from}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    if (@mail($cfg['email_to'], '=?UTF-8?B?' . base64_encode('Заявка: ' . $topic) . '?=', $text, $headers)) $sent = true;
}

if ($saved || $sent) out(true);
out(false, 'Не получилось отправить. Позвоните нам: +7 (938) 815-33-33', 500);
