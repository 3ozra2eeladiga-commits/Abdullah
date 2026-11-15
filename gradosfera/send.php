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
    $dev = preg_replace('/[^a-z0-9]/i', '', (string)($in['dev'] ?? '')); $dev = substr($dev, 0, 40);
    $fp  = preg_replace('/[^a-z0-9]/i', '', (string)($in['fp'] ?? ''));  $fp  = substr($fp, 0, 40);
    $ip = $_SERVER['REMOTE_ADDR'] ?? '';
    // один билет на номер телефона НАВСЕГДА: повторный запрос возвращает тот же код и тот же срок (даже если он уже истёк)
    $ticket = gk_json_update('gs-tickets.json', function (&$all) use ($digits, $name, $phone, $details, $demo, $dev, $fp, $ip) {
        foreach ($all as $code => $t) {
            if (($t['digits'] ?? '') === $digits) return [$code, $t, false, [], 'phone'];
        }
        // это устройство уже получало билет (на любой номер) — второй не даём, показываем тот же код и срок
        foreach ($all as $code => $t) {
            $sameDev = $dev !== '' && ($t['dev'] ?? '') === $dev;
            $sameFpIp = $fp !== '' && ($t['fp'] ?? '') === $fp && $ip !== '' && ($t['ip'] ?? '') === $ip;
            if ($sameDev || $sameFpIp) { $all[$code]['tries'][] = ['t' => time(), 'name' => $name, 'phone' => $phone]; return [$code, $all[$code], false, [], 'device']; }
        }
        // тот же телефон/компьютер или тот же интернет-адрес уже получал билет на другой номер — отметим для менеджера
        $same = [];
        foreach ($all as $code => $t) {
            if (($dev !== '' && ($t['dev'] ?? '') === $dev) || ($ip !== '' && ($t['ip'] ?? '') === $ip && time() - $t['issued'] < 7 * 86400)) $same[] = $code . ' (' . $t['name'] . ', ' . $t['phone'] . ')';
        }
        do { $code = gk_new_code(); } while (isset($all[$code]));
        $now = time();
        $all[$code] = ['name' => $name, 'phone' => $phone, 'digits' => $digits, 'issued' => $now, 'until' => gk_deadline($now), 'details' => $details, 'demo' => $demo, 'dev' => $dev, 'fp' => $fp, 'ip' => $ip];
        if ($same) $all[$code]['same'] = $same;
        return [$code, $all[$code], true, $same, ''];
    });
    if (!$ticket) fail('Не получилось выдать билет. Позвоните нам: +7 (938) 815-33-33', 500);
    list($code, $t, $isNew, $same, $why) = $ticket;
    $res['code'] = $code; $res['until'] = $t['until'] * 1000; $res['issued'] = $t['issued'] * 1000; $res['status'] = gk_ticket_status($t);
    $res['untilText'] = gk_wday($t['until']); $res['repeat'] = !$isNew; $res['why'] = $why;
    $text = "{$tag}🎫 Золотой билет {$code}" . ($isNew ? '' : ($why === 'device' ? " — ⛔ ПОПЫТКА ВЗЯТЬ ВТОРОЙ БИЛЕТ с того же устройства\nВвели: {$name}, {$phone}\nБилет был выдан " . gk_date($t['issued']) . " на: {$t['name']}, {$t['phone']}" : ' — повторный запрос (выдан ' . gk_date($t['issued']) . ')')) . "\n👤 " . ($why === 'device' ? $t['name'] : $name) . "\n📞 " . ($why === 'device' ? $t['phone'] : $phone) . "\n🎁 Комплект De’Longhi (стиральная + сушильная)\n⏳ Действует до " . gk_date($t['until']) . ($details ? "\n🧮 {$details}" : '')
          . ($same ? "\n\n⚠️ С этого же устройства или интернета уже получали билет:\n" . implode("\n", array_slice($same, 0, 3)) : '');
} else {
    $text = "{$tag}📞 Перезвонить: рассрочка\n👤 {$name}\n📞 {$phone}" . ($details ? "\n🧮 {$details}" : '');
}

// журнал заявок для бота (кнопка «Заявки»)
gk_json_update('gs-leads.json', function (&$all) use ($kind, $name, $phone, $details, $demo, $res) {
    $all[] = ['t' => time(), 'kind' => $kind, 'name' => $name, 'phone' => $phone, 'code' => $res['code'] ?? '', 'details' => $details, 'demo' => $demo];
    if (count($all) > 1000) $all = array_slice($all, -1000);
    return true;
});
// журнал (страховка: ни одна заявка не потеряется, даже если Telegram недоступен)
$fh = @fopen(GK_HOME . '/gs-leads.csv', 'a');
if ($fh) { flock($fh, LOCK_EX); fputcsv($fh, [date('d.m.Y H:i'), $demo ? 'ДЕМО' : '', $kind, $name, $phone, $res['code'] ?? '', $details], ';'); flock($fh, LOCK_UN); fclose($fh); }

if (!gk_is_work(time())) $text .= "\n\n🌙 Заявка в нерабочее время — перезвонить в ближайший рабочий день с 10:00.";
gk_send_group($text);
// почта — запасной канал, если указана в настройках
$cfg = gk_cfg();
if (!empty($cfg['email_to'])) {
    $from = $cfg['email_from'] ?? 'noreply@gradosfera.com';
    @mail($cfg['email_to'], '=?UTF-8?B?' . base64_encode(($demo ? 'ДЕМО: ' : '') . ($kind === 'ticket' ? 'Золотой билет' : 'Заявка: рассрочка')) . '?=', $text,
        "From: =?UTF-8?B?" . base64_encode('Сайт Новый Квартал') . "?= <{$from}>\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n");
}
out($res);
