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

define('GK_HOME', dirname(__DIR__));
define('GK_TICKET_HOURS', 24);

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
    foreach ($urls as $i => $url) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [CURLOPT_POST => true, CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => $i ? 8 : 5, CURLOPT_TIMEOUT => $i ? 25 : 12,
            CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4, CURLOPT_HTTPHEADER => ['Content-Type: application/json'], CURLOPT_POSTFIELDS => $body]);
        $res = curl_exec($ch); $err = curl_error($ch); curl_close($ch);
        $j = json_decode((string)$res, true);
        if (is_array($j) && isset($j['ok'])) return $j;
        $last = $err ?: 'пустой ответ';
    }
    return ['ok' => false, 'description' => 'нет связи с Telegram', 'net' => $last];
}
function gk_tg($method, $params) {
    $cfg = gk_cfg();
    if (empty($cfg['telegram_token'])) return null;
    return gk_tg_raw($cfg['telegram_token'], $method, $params);
}
function gk_send_group($text, $extra = []) {
    $cfg = gk_cfg();
    if (empty($cfg['chat_id'])) return false;
    $r = gk_tg('sendMessage', array_merge(['chat_id' => $cfg['chat_id'], 'text' => $text, 'disable_web_page_preview' => true], $extra));
    return !empty($r['ok']);
}
function gk_fmt_phone($d) { return sprintf('+7 (%s) %s-%s-%s', substr($d, 1, 3), substr($d, 4, 3), substr($d, 7, 2), substr($d, 9, 2)); }
function gk_date($ts) { $d = new DateTime('@' . $ts); $d->setTimezone(new DateTimeZone('Europe/Moscow')); return $d->format('d.m H:i'); }
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
function gk_ticket_status($t) {
    if (!empty($t['used'])) return 'used';
    if (time() > $t['until']) return 'expired';
    return 'ok';
}
function gk_ticket_text($code, $t) {
    $st = gk_ticket_status($t);
    $head = ['ok' => '✅ Билет действителен', 'used' => '☑️ Билет уже погашен', 'expired' => '⌛ Билет просрочен'][$st];
    $s = "{$head}\n🎫 {$code}\n👤 {$t['name']}, {$t['phone']}\nВыдан: " . gk_date($t['issued']) . "\nДействует до: " . gk_date($t['until']);
    if ($st === 'used') $s .= "\nПогасил(а): " . ($t['used_by'] ?? '—') . ', ' . gk_date($t['used']);
    if (!empty($t['details'])) $s .= "\nРасчёт: {$t['details']}";
    return $s;
}
