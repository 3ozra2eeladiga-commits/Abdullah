<?php
/**
 * Заявки с сайта ЖК «Новый Квартал»:
 *  - «Перезвоните мне» из калькулятора рассрочки;
 *  - «Золотой билет»: код создаёт и запоминает СЕРВЕР (24 часа, один билет на номер телефона).
 * Каждая заявка: журнал ~/gs-leads.csv + сообщение в Telegram-группу отдела продаж.
 * Демо-сайт (предпросмотр на сервере бота) тоже шлёт сюда — такие заявки помечаются «ДЕМО».
 */
require __DIR__ . '/gk-lib.php';

// демо-сайт живёт на другом адресе — разрешаем ему отправлять заявки сюда
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
$demoOrigin = 'https://186-246-61-173.sslip.io';
if ($origin === $demoOrigin) {
    header('Access-Control-Allow-Origin: ' . $demoOrigin);
    header('Access-Control-Allow-Methods: POST, OPTIONS');
    header('Access-Control-Allow-Headers: Content-Type');
    header('Vary: Origin');
}
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

header('Content-Type: application/json; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: no-store');
function out($data, $code = 200) { http_response_code($code); echo json_encode($data, JSON_UNESCAPED_UNICODE); exit; }
function fail($msg, $code = 422) { out(['ok' => false, 'error' => $msg], $code); }

if (($_SERVER['REQUEST_METHOD'] ?? '') !== 'POST') fail('Метод не поддерживается', 405);
$in = json_decode((string)file_get_contents('php://input'), true);
if (!is_array($in)) $in = $_POST;
if (!empty($in['website'])) out(['ok' => true]);   // ловушка для ботов

$clean = function ($v, $max) { $v = trim(strip_tags((string)$v)); $v = preg_replace('/\s+/u', ' ', $v); return mb_substr($v, 0, $max); };
$kind    = ($in['kind'] ?? '') === 'ticket' ? 'ticket' : 'lead';
$name    = $clean($in['name'] ?? '', 80);
$details = $clean($in['details'] ?? '', 400);
$demo    = $origin === $demoOrigin || !empty($in['demo']);
$digits  = preg_replace('/\D/', '', (string)($in['phone'] ?? ''));
if (strlen($digits) === 11 && $digits[0] === '8') $digits = '7' . substr($digits, 1);
if ($name === '') fail('Напишите, пожалуйста, имя');
if (!preg_match('/^7\d{10}$/', $digits)) fail('Проверьте номер телефона');

// не чаще 1 заявки в 15 секунд с одного адреса
$rl = sys_get_temp_dir() . '/gs_rl_' . md5(($_SERVER['REMOTE_ADDR'] ?? '') . $kind);
if (is_file($rl) && time() - filemtime($rl) < 15) fail('Заявка уже отправлена — подождите немного', 429);
@touch($rl);

$phone = gk_fmt_phone($digits);
$tag = $demo ? '🧪 ДЕМО · ' : '';
$res = ['ok' => true];

if ($kind === 'ticket') {
    // один билет на номер: если действующий уже есть — возвращаем его же
    $ticket = gk_json_update('gs-tickets.json', function (&$all) use ($digits, $name, $phone, $details, $demo) {
        foreach ($all as $code => $t) {
            if (($t['digits'] ?? '') === $digits && gk_ticket_status($t) === 'ok') return [$code, $t, false];
        }
        do { $code = gk_new_code(); } while (isset($all[$code]));
        $now = time();
        $all[$code] = ['name' => $name, 'phone' => $phone, 'digits' => $digits, 'issued' => $now, 'until' => $now + GK_TICKET_HOURS * 3600, 'details' => $details, 'demo' => $demo];
        return [$code, $all[$code], true];
    });
    if (!$ticket) fail('Не получилось выдать билет. Позвоните нам: +7 (938) 815-33-33', 500);
    list($code, $t, $isNew) = $ticket;
    $res['code'] = $code; $res['until'] = $t['until'] * 1000; $res['issued'] = $t['issued'] * 1000;
    $text = "{$tag}🎫 Золотой билет {$code}" . ($isNew ? '' : ' (повторный запрос)') . "\n👤 {$name}\n📞 {$phone}\n🎁 Комплект De’Longhi (стиральная + сушильная)\n⏳ Действует до " . gk_date($t['until']) . ($details ? "\n🧮 {$details}" : '') . "\n\nПроверить код: написать его боту в личные сообщения.";
} else {
    $text = "{$tag}📞 Перезвонить: рассрочка\n👤 {$name}\n📞 {$phone}" . ($details ? "\n🧮 {$details}" : '');
}

// журнал (страховка: ни одна заявка не потеряется, даже если Telegram недоступен)
$fh = @fopen(GK_HOME . '/gs-leads.csv', 'a');
if ($fh) { flock($fh, LOCK_EX); fputcsv($fh, [date('d.m.Y H:i'), $demo ? 'ДЕМО' : '', $kind, $name, $phone, $res['code'] ?? '', $details], ';'); flock($fh, LOCK_UN); fclose($fh); }

gk_send_group($text);
// почта — запасной канал, если указана в настройках
$cfg = gk_cfg();
if (!empty($cfg['email_to'])) {
    $from = $cfg['email_from'] ?? 'noreply@gradosfera.com';
    @mail($cfg['email_to'], '=?UTF-8?B?' . base64_encode(($demo ? 'ДЕМО: ' : '') . ($kind === 'ticket' ? 'Золотой билет' : 'Заявка: рассрочка')) . '?=', $text,
        "From: =?UTF-8?B?" . base64_encode('Сайт Новый Квартал') . "?= <{$from}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n");
}
out($res);
