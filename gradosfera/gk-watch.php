<?php
/**
 * Сторож: каждые 5 минут его открывает расписание хостинга (deploy/hosting-update.sh).
 * Проверяет бот ЖК (приём сообщений), сервер бота цветов (он же реле для Telegram) и сайт.
 * Сбои записывает в журнал watch.log на хостинге (в Telegram-бот ЖК ничего не пишет).
 */
require __DIR__ . '/gk-lib.php';
header('Content-Type: text/plain; charset=utf-8');
header('X-Robots-Tag: noindex');
$stateFile = GK_HOME . '/.watch.json';
$st = is_file($stateFile) ? (json_decode((string)file_get_contents($stateFile), true) ?: []) : [];
if (time() - ($st['_run'] ?? 0) < 200) { echo "skip\n"; exit; }   // не чаще раза в ~4 минуты
$st['_run'] = time();

function http_ok($url, $need = '') {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_CONNECTTIMEOUT => 8, CURLOPT_TIMEOUT => 20, CURLOPT_IPRESOLVE => CURL_IPRESOLVE_V4]);
    $r = curl_exec($ch); $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); $err = curl_error($ch); curl_close($ch);
    if ($code !== 200) return $err ?: "ответ $code";
    if ($need !== '' && mb_strpos((string)$r, $need) === false) return 'страница без «' . $need . '»';
    return '';
}
$problems = [];
// 1) сервер бота цветов (через него же бот ЖК получает сообщения)
if ($e = http_ok('https://186-246-61-173.sslip.io/', 'Бот работает')) $problems['vps'] = "Сервер бота цветов не отвечает ($e). Бот цветов и кнопки бота ЖК могут не работать.";
// 2) сайт
if ($e = http_ok('https://gradosfera.com/', 'Новый Квартал')) $problems['site'] = "Сайт gradosfera.com открывается с ошибкой ($e).";
// 3) бот ЖК: Telegram доставляет ему сообщения?
$cfg = gk_cfg();
if (!empty($cfg['telegram_token'])) {
    $w = gk_tg('getWebhookInfo', []);
    if (empty($w['ok'])) $problems['tg'] = 'Хостинг не может связаться с Telegram (' . ($w['net'] ?? $w['description'] ?? '?') . '). Заявки в бот могут не приходить — они сохраняются на сайте.';
    else {
        $r = $w['result'];
        if (empty($r['url'])) $problems['hook'] = 'У бота ЖК выключен приём сообщений (вебхук). Откройте gradosfera.com/gk-setup.php.';
        elseif (($r['pending_update_count'] ?? 0) >= 3 && !empty($r['last_error_date']) && time() - $r['last_error_date'] < 900)
            $problems['hook'] = 'Бот ЖК не получает сообщения: ' . ($r['last_error_message'] ?? 'ошибка') . ' (в очереди ' . $r['pending_update_count'] . ').';
    }
}
$names = ['vps' => 'Сервер бота цветов', 'site' => 'Сайт', 'tg' => 'Связь с Telegram', 'hook' => 'Бот ЖК'];
$msgs = [];
foreach ($names as $k => $n) {
    $prev = $st[$k] ?? null;
    if (isset($problems[$k])) {
        $st[$k]['n'] = ($prev['n'] ?? 0) + 1;
        $st[$k]['since'] = $prev['since'] ?? time();
        // тревога со второй проверки подряд (одиночный сбой сети — не повод будить), потом не чаще раза в 30 минут
        if ($st[$k]['n'] >= 2 && time() - ($prev['sent'] ?? 0) >= 1800) { $msgs[] = '⚠️ ' . $problems[$k]; $st[$k]['sent'] = time(); }
    } elseif ($prev) {
        if (!empty($prev['sent'])) $msgs[] = "✅ {$n} снова работает (сбой длился " . max(1, intdiv(time() - $prev['since'], 60)) . ' мин).';
        unset($st[$k]);
    }
}
@file_put_contents($stateFile, json_encode($st), LOCK_EX);
// В бот ЖК технические сообщения НЕ шлём (Абдулла 17.11: бот — только для заявок). Пишем в журнал на хостинге.
if ($msgs) @file_put_contents(GK_HOME . '/watch.log', date('d.m.Y H:i') . ' ' . str_replace("\n", ' ', implode(' | ', $msgs)) . "\n", FILE_APPEND | LOCK_EX);
echo $problems ? "problems: " . implode(', ', array_keys($problems)) . "\n" : "ok\n";
