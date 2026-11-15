<?php
/**
 * Общие функции для заявок и бота ЖК «Новый Квартал».
 * Все данные лежат В ДОМАШНЕЙ ПАПКЕ хостинга (рядом с public_html) — снаружи их не открыть,
 * автообновление сайта их не стирает, в git они не попадают:
 *   gs-config.php   — токен бота (вписывает владелец)
 *   gs-chat.json    — id группы заявок (записывает gk-setup.php)
 *   gs-tickets.json — золотые билеты
 *   gs-leads.csv    — журнал всех заявок
 */
if (basename($_SERVER['SCRIPT_FILENAME'] ?? '') === 'gk-lib.php') { http_response_code(404); exit; }

// данные храним в домашней папке хостинга; если хостинг туда не пускает (open_basedir) —
// в закрытой папке gk-data внутри сайта (снаружи доступ запрещён, автообновление её не трогает)
function gk_home() {
    // пробуем по-настоящему записать файл: is_writable на хостинге иногда врёт (open_basedir)
    $try = function ($d) {
        if (!@is_dir($d) && !@mkdir($d, 0700, true)) return false;
        $p = $d . '/.gk-probe';
        if (@file_put_contents($p, '1') === false) return false;
        @unlink($p); return true;
    };
    $up = dirname(__DIR__);
    if (@is_file($up . '/gs-config.php') || $try($up)) return $up;
    $d = __DIR__ . '/gk-data';
    if ($try($d) && !is_file($d . '/.htaccess')) @file_put_contents($d . '/.htaccess', "Require all denied\nDeny from all\n");
    return $d;
}
define('GK_HOME', gk_home());
define('GK_TICKET_HOURS', 48);
// офис продаж: пн–сб 10:00–17:00 (Москва)
function gk_msk($ts) { $d = new DateTime('@' . $ts); $d->setTimezone(new DateTimeZone('Europe/Moscow')); return $d; }
function gk_is_work($ts) { $d = gk_msk($ts); $m = (int)$d->format('G') * 60 + (int)$d->format('i'); return (int)$d->format('N') <= 6 && $m >= 600 && $m < 1020; }
/** срок билета: НЕ МЕНЬШЕ 24 часов. Если 24 часа кончаются в нерабочее время — срок до 17:00 ближайшего рабочего дня
 *  (вечер → до 17:00 следующего рабочего дня, раннее утро → до 17:00 этого дня, воскресенье → до понедельника 17:00). */
function gk_deadline($issued) {
    $t = $issued + GK_TICKET_HOURS * 3600;
    if (gk_is_work($t)) return $t;
    $d = gk_msk($t);
    $m = (int)$d->format('G') * 60 + (int)$d->format('i');
    if ((int)$d->format('N') <= 6 && $m >= 1020) $d->modify('+1 day');   // после 17:00 — на следующий день
    if ((int)$d->format('N') === 7) $d->modify('+1 day');                // воскресенье — на понедельник
    $d->setTime(17, 0, 0);
    return $d->getTimestamp();
}
function gk_wday($ts) { $n = ['', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс']; $d = gk_msk($ts); return $n[(int)$d->format('N')] . ' ' . $d->format('d.m, H:i'); }

function gk_cfg() {
    static $c = null;
    if ($c !== null) return $c;
    $c = is_file(GK_HOME . '/gs-config.php') ? (require GK_HOME . '/gs-config.php') : [];
    if (!is_array($c)) $c = [];
    $chat = gk_json_read('gs-chat.json');
    if (!empty($chat['chat_id'])) $c['chat_id'] = $chat['chat_id'];
    return $c;
}
function gk_json_read($name) {
    $f = GK_HOME . '/' . $name;
    if (!is_file($f)) return [];
    $d = json_decode((string)file_get_contents($f), true);
    return is_array($d) ? $d : [];
}
/** чтение-изменение-запись под блокировкой (чтобы два клиента одновременно не затёрли друг друга) */
function gk_json_update($name, callable $fn) {
    $fh = fopen(GK_HOME . '/' . $name, 'c+');
    if (!$fh) return null;
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $d = json_decode($raw ?: '[]', true); if (!is_array($d)) $d = [];
    $res = $fn($d);
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($d, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
    fflush($fh); flock($fh, LOCK_UN); fclose($fh);
    return $res;
}
/** запрос к Telegram Bot API: сначала напрямую, а если хостинг не достучался — через сервер бота (реле) */
function gk_tg_raw($token, $method, $params) {
    if (!function_exists('curl_init')) return ['ok' => false, 'description' => 'curl выключен', 'net' => 'нет модуля curl'];
    $body = json_encode($params ?: new stdClass(), JSON_UNESCAPED_UNICODE);
    $urls = ['https://api.telegram.org/bot' . $token . '/' . $method,
             'https://186-246-61-173.sslip.io/tg-relay/bot' . $token . '/' . $method];
    $last = '';
    // если недавно напрямую не достучались — 10 минут сразу идём через реле (не ждём тайм-аут)
    $flag = GK_HOME . '/.tg-direct-down';
    if (@is_file($flag) && time() - @filemtime($flag) < 600) array_shift($urls);
    foreach ($urls as $i => $url) {
        $relay = strpos($url, 'tg-relay') !== false;
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => $relay ? 8 : 4, CURLOPT_TIMEOUT => $relay ? 25 : 10,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => $body]);
        $res = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
        $j = json_decode((string)$res, true);
        if (is_array($j) && isset($j['ok'])) return $j;
        $last = $err ?: 'пустой ответ';
        if (!$relay) @touch($flag);
    }
    return ['ok' => false, 'description' => 'нет связи с Telegram', 'net' => $last];
}
function gk_tg($method, $params) {
    $cfg = gk_cfg();
    if (empty($cfg['telegram_token'])) return null;
    return gk_tg_raw($cfg['telegram_token'], $method, $params);
}
function gk_staff() {
    $f = __DIR__ . '/gk-staff.php';
    $l = is_file($f) ? (require $f) : [];
    return array_map('strval', is_array($l) ? $l : []);
}
function gk_is_staff($id) { return in_array((string)$id, gk_staff(), true); }
/** уведомление: в группу заявок (если подключена) — иначе каждому сотруднику в личку */
function gk_send_group($text, $extra = []) {
    $cfg = gk_cfg();
    $to = !empty($cfg['chat_id']) ? [$cfg['chat_id']] : gk_staff();
    $ok = false;
    foreach ($to as $chat) {
        $r = gk_tg('sendMessage', array_merge(['chat_id' => $chat, 'text' => $text, 'disable_web_page_preview' => true], $extra));
        if (!empty($r['ok'])) $ok = true;
    }
    return $ok;
}
function gk_ago($ts) {
    $m = max(0, intdiv(time() - $ts, 60));
    if ($m < 1) return 'только что';
    if ($m < 60) return $m . ' мин назад';
    $h = intdiv($m, 60);
    if ($h < 24) return $h . ' ч ' . ($m % 60) . ' мин назад';
    return intdiv($h, 24) . ' дн назад';
}
function gk_left($until) {
    $m = intdiv($until - time(), 60);
    if ($m <= 0) return 'истёк';
    return 'осталось ' . intdiv($m, 60) . ' ч ' . ($m % 60) . ' мин';
}
function gk_fmt_phone($d) { return sprintf('+7 (%s) %s-%s-%s', substr($d, 1, 3), substr($d, 4, 3), substr($d, 7, 2), substr($d, 9, 2)); }
function gk_date($ts) { return gk_wday($ts); }
function gk_new_code() {
    $A = 'ABCEHKMPTX23456789'; $s = '';
    for ($i = 0; $i < 8; $i++) $s .= $A[random_int(0, strlen($A) - 1)];
    return 'ЗБ-' . substr($s, 0, 4) . '-' . substr($s, 4);
}
/** латинские буквы-двойники → русские (Ольга может набрать «ZB-…» или «3Б-…») и обратно для поиска */
function gk_norm_code($s) {
    $s = mb_strtoupper(trim($s));
    $s = strtr($s, ['3Б' => 'ЗБ', 'ZB' => 'ЗБ', '3B' => 'ЗБ', 'ЗB' => 'ЗБ', ' ' => '', '—' => '-', '–' => '-']);
    $s = preg_replace('/^ЗБ-?/u', 'ЗБ-', $s);
    // кириллица, похожая на латиницу, в теле кода → латиница
    $body = mb_substr($s, 3);
    $body = strtr($body, ['А' => 'A', 'В' => 'B', 'С' => 'C', 'Е' => 'E', 'Н' => 'H', 'К' => 'K', 'М' => 'M', 'Р' => 'P', 'Т' => 'T', 'Х' => 'X']);
    $body = str_replace('-', '', $body);
    if (strlen($body) === 8) $body = substr($body, 0, 4) . '-' . substr($body, 4);
    return 'ЗБ-' . $body;
}
/** действующий срок билета: если правило поменялось (24 → 48 ч), уже выданные билеты тоже получают новый, более долгий срок */
function gk_until($t) { return max((int)($t['until'] ?? 0), gk_deadline((int)$t['issued'])); }
function gk_ticket_status($t) {
    if (!empty($t['used'])) return 'used';
    if (time() > gk_until($t)) return 'expired';
    return 'ok';
}
function gk_ticket_text($code, $t) {
    $st = gk_ticket_status($t);
    $head = ['ok' => '✅ Билет действителен', 'used' => '☑️ Билет уже погашен', 'expired' => '⌛ Билет просрочен'][$st];
    $s = "{$head}\n🎫 {$code}\n👤 {$t['name']}, {$t['phone']}\nВыдан: " . gk_date($t['issued']) . "\nДействует до: " . gk_date(gk_until($t));
    if ($st === 'used') $s .= "\nПогасил(а): " . ($t['used_by'] ?? '—') . ', ' . gk_date($t['used']);
    if (!empty($t['details'])) $s .= "\nРасчёт: {$t['details']}";
    return $s;
}
