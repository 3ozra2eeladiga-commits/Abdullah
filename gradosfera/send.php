<?php
/**
 * Приём заявок с сайта → Telegram и/или e-mail.
 * Настройки — в config.php (скопируйте config.example.php → config.php и заполните).
 */
header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');

function out($ok, $error = null, $code = 200) {
    http_response_code($code);
    echo json_encode($ok ? ['ok' => true] : ['ok' => false, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') out(false, 'Метод не поддерживается', 405);

$cfgFile = __DIR__ . '/config.php';
if (!is_file($cfgFile)) out(false, 'Форма временно не настроена. Позвоните нам: +7 (938) 815-33-33', 500);
$cfg = require $cfgFile;

$raw = file_get_contents('php://input');
$in = json_decode($raw, true);
if (!is_array($in)) $in = $_POST;

// honeypot: боты заполняют скрытое поле
if (!empty($in['website'])) out(true);

$clean = function ($v, $max) {
    $v = trim(strip_tags((string)$v));
    $v = preg_replace('/\s+/u', ' ', $v);
    return mb_substr($v, 0, $max);
};
$name  = $clean($in['name'] ?? '', 80);
$topic = $clean($in['topic'] ?? 'Заявка с сайта', 160);
$page  = $clean($in['page'] ?? '', 300);
$digits = preg_replace('/\D/', '', (string)($in['phone'] ?? ''));
if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);

if ($name === '') out(false, 'Укажите имя', 422);
if (!preg_match('/^7\d{10}$/', $digits)) out(false, 'Проверьте номер телефона', 422);

// простое ограничение частоты: не чаще 1 заявки в 20 секунд с одного IP
$ip = $_SERVER['REMOTE_ADDR'] ?? '';
$rl = sys_get_temp_dir() . '/gs_rl_' . md5($ip);
if (is_file($rl) && time() - filemtime($rl) < 20) out(false, 'Заявка уже отправлена, подождите немного', 429);
@touch($rl);

$phone = sprintf('+7 (%s) %s-%s-%s', substr($digits, 1, 3), substr($digits, 4, 3), substr($digits, 7, 2), substr($digits, 9, 2));
$date = (new DateTime('now', new DateTimeZone($cfg['timezone'] ?? 'Europe/Moscow')))->format('d.m.Y H:i');

$text = "🏢 Новая заявка с сайта\n\n"
      . "Тема: {$topic}\n"
      . "Имя: {$name}\n"
      . "Телефон: {$phone}\n"
      . "Время: {$date}";

$sent = false;

// --- Telegram ---
if (!empty($cfg['telegram_token']) && !empty($cfg['telegram_chat_ids'])) {
    foreach ((array)$cfg['telegram_chat_ids'] as $chat) {
        $ch = curl_init('https://api.telegram.org/bot' . $cfg['telegram_token'] . '/sendMessage');
        curl_setopt_array($ch, [
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => http_build_query(['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => 1]),
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_TIMEOUT => 10,
        ]);
        $res = curl_exec($ch);
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);
        if ($res !== false && $code === 200) $sent = true;
    }
}

// --- E-mail ---
if (!empty($cfg['email_to'])) {
    $from = $cfg['email_from'] ?? ('noreply@' . ($_SERVER['HTTP_HOST'] ?? 'localhost'));
    $headers = "From: =?UTF-8?B?" . base64_encode('Сайт Градосфера') . "?= <{$from}>\r\n"
             . "MIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n";
    $subj = '=?UTF-8?B?' . base64_encode('Заявка с сайта: ' . $topic) . '?=';
    if (@mail($cfg['email_to'], $subj, $text . ($page ? "\nСтраница: {$page}" : ''), $headers)) $sent = true;
}

// --- запасной журнал заявок (на случай сбоя отправки) ---
$logDir = __DIR__ . '/leads';
if (!is_dir($logDir)) @mkdir($logDir, 0750);
@file_put_contents($logDir . '/leads.csv',
    implode(';', [$date, $topic, $name, $phone, $sent ? 'sent' : 'NOT_SENT']) . "\n", FILE_APPEND | LOCK_EX);

if (!$sent) out(false, 'Не удалось отправить заявку. Позвоните нам: +7 (938) 815-33-33', 502);
out(true);
