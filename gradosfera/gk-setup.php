<?php
/**
 * Одноразовое подключение бота: находит группу, куда добавили бота, запоминает её,
 * подключает вебхук (gk-bot.php) и отправляет в группу проверочное сообщение.
 * После подключения страница больше ничего не меняет (только показывает, что всё подключено).
 */
require __DIR__ . '/gk-lib.php';
header('Content-Type: text/html; charset=utf-8');
header('X-Robots-Tag: noindex');
$cfg = gk_cfg();
function page($title, $body) {
    echo '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Подключение бота</title>'
       . '<style>body{font:16px/1.5 system-ui,sans-serif;background:#121317;color:#efe7da;max-width:560px;margin:0 auto;padding:28px 18px}h1{font-size:22px}'
       . '.c{background:#1d2028;border:1px solid #333;border-radius:10px;padding:16px;margin:14px 0}button{font:600 16px system-ui;padding:12px 18px;border:0;border-radius:8px;background:#c98a5b;color:#1b1410;cursor:pointer}.ok{color:#9fd49a}.err{color:#ff9a7a}</style>'
       . "<h1>{$title}</h1>{$body}";
    exit;
}
// Шаг 1: токен можно вставить прямо здесь (пока бот ещё не подключён к группе)
$linked = !empty(gk_json_read('gs-chat.json')['linked']) || !empty(gk_json_read('gs-chat.json')['chat_id']);
if (!$linked && isset($_POST['token'])) {
    $tok = preg_replace('/\s+/u', '', (string)$_POST['token']);   // убираем пробелы и переносы, которые бывают при копировании
    $back = '<p><a href="gk-setup.php" style="color:#c98a5b">← Назад</a></p>';
    if (!preg_match('/^\d{6,12}:[A-Za-z0-9_-]{30,}$/', $tok)) page('Это не похоже на токен', '<p class="err">Токен выглядит так: <b>цифры</b>, затем <b>двоеточие</b>, затем длинная строка из букв и цифр, например<br><code>7123456789:AAHk3x…</code> (всего около 46 знаков).</p><p>Вы вставили ' . mb_strlen($tok) . ' знаков' . (strpos($tok, ':') === false ? ', и в них нет двоеточия' : '') . '. Скопируйте токен из сообщения BotFather целиком.</p>' . $back);
    $r = gk_tg_raw($tok, 'getMe', []);
    if (!empty($r['net'])) page('Нет связи с Telegram', '<p class="err">Ни хостинг, ни запасной сервер не достучались до Telegram (' . htmlspecialchars($r['net']) . ').</p><p>Попробуйте ещё раз через минуту. Если повторится — сообщите.</p>' . $back);
    if (empty($r['ok'])) page('Telegram не принял токен', '<p class="err">Telegram ответил: ' . htmlspecialchars($r['description'] ?? 'ошибка') . '.</p><p>Скорее всего, токен скопирован не полностью или его заменили у BotFather. Откройте BotFather → /mybots → ваш бот → API Token и скопируйте заново.</p>' . $back);
    $old = is_array($cfg) ? $cfg : [];
    unset($old['chat_id']);
    $old['telegram_token'] = $tok;
    if (empty($old['email_to'])) $old['email_to'] = 'grado.sfera@mail.ru';
    $w = @file_put_contents(GK_HOME . '/gs-config.php', "<?php\n// настройки бота ЖК «Новый Квартал» (создано gk-setup.php)\nreturn " . var_export($old, true) . ";\n", LOCK_EX);
    if (!$w) { $e = error_get_last(); page('Не удалось сохранить', '<p class="err">Хостинг не дал записать файл настроек в ' . htmlspecialchars(basename(dirname(GK_HOME)) . '/' . basename(GK_HOME)) . ' (' . htmlspecialchars($e['message'] ?? '') . ').</p><p>Сообщите об этом — исправим.</p>'); }
    header('Location: gk-setup.php', true, 303); exit;
}
$form = '<form method="post" class="c"><p>Вставьте токен бота — длинную строку из сообщения BotFather (вида <b>7123456789:AAH…</b>):</p><p><input name="token" type="password" autocomplete="off" required style="width:100%;box-sizing:border-box;padding:12px;font:16px monospace;border-radius:8px;border:1px solid #555;background:#111;color:#fff"></p><p><button>Сохранить токен</button></p><p style="font-size:13px;color:#999">Токен сохранится на хостинге в закрытом файле — снаружи его не прочитать.</p></form>';
if (empty($cfg['telegram_token'])) page('Шаг 1: токен бота', $form);
$me = gk_tg('getMe', []);
if (empty($me['ok'])) page('Токен не подошёл', '<p class="err">Telegram не принимает сохранённый токен. Вставьте его заново:</p>' . $form);
$bot = '@' . $me['result']['username'];

if (!empty(gk_json_read('gs-chat.json')['linked']) || !empty($cfg['chat_id'])) {
    $hook = gk_tg('getWebhookInfo', []);
    page('✅ Бот подключён', '<div class="c"><p>Бот: <b>' . htmlspecialchars($bot) . '</b></p><p>Группа заявок: <b>' . htmlspecialchars(gk_json_read('gs-chat.json')['title'] ?? '') . '</b></p><p>Приём сообщений: ' . (!empty($hook['result']['url']) ? '<span class="ok">включён</span>' : '<span class="err">не включён</span>') . '</p></div><p>Менять ничего не нужно. Чтобы подключить другую группу — удалите файл gs-chat.json на хостинге и откройте эту страницу снова.</p>');
}

// ищем группы, куда добавили бота
gk_tg('deleteWebhook', []);   // пока вебхук включён, getUpdates не работает
$up = gk_tg('getUpdates', ['allowed_updates' => ['message', 'my_chat_member']]);
$groups = [];
foreach (($up['result'] ?? []) as $x) {
    $c = $x['my_chat_member']['chat'] ?? ($x['message']['chat'] ?? null);
    if ($c && in_array($c['type'], ['group', 'supergroup'], true)) $groups[$c['id']] = $c['title'] ?? 'Группа';
}
function gk_hook() {
    $cfg = gk_cfg();
    // Telegram не всегда достукивается до хостинга напрямую — вебхук идёт через сервер бота (он пересылает на gk-bot.php)
    $url = 'https://186-246-61-173.sslip.io/tg-hook/gk';
    $secret = substr(hash('sha256', $cfg['telegram_token'] . '|gk-webhook'), 0, 40);
    return gk_tg('setWebhook', ['url' => $url, 'secret_token' => $secret, 'allowed_updates' => ['message', 'callback_query'], 'drop_pending_updates' => true]);
}
$pick = $_POST['chat'] ?? '';
if ($pick === 'none') {   // без группы: заявки приходят каждому сотруднику в личку
    gk_json_update('gs-chat.json', function (&$d) { $d = ['chat_id' => '', 'title' => 'без группы — в личку сотрудникам', 'linked' => time()]; return true; });
    $wh = gk_hook();
    page('✅ Готово!', '<div class="c"><p class="ok">Бот подключён без группы: заявки будут приходить в личные сообщения сотрудникам из списка.</p><p>Приём сообщений: ' . (!empty($wh['ok']) ? '<span class="ok">включён</span>' : '<span class="err">ошибка</span>') . '</p><p>Откройте бота ' . htmlspecialchars($bot) . ' и нажмите «Старт».</p></div>');
}
if ($pick !== '' && isset($groups[$pick])) {
    gk_json_update('gs-chat.json', function (&$d) use ($pick, $groups) { $d = ['chat_id' => (string)$pick, 'title' => $groups[$pick], 'linked' => time()]; return true; });
    $wh = gk_hook();
    gk_tg('sendMessage', ['chat_id' => $pick, 'text' => "✅ Бот подключён к сайту ЖК «Новый Квартал».\nСюда будут приходить заявки и золотые билеты.\n\nПроверка кодов и списки заявок — в личке у бота {$bot} (кнопки внизу)."]);
    page('✅ Готово!', '<div class="c"><p class="ok">Группа «' . htmlspecialchars($groups[$pick]) . '» подключена.</p><p>Приём сообщений: ' . (!empty($wh['ok']) ? '<span class="ok">включён</span>' : '<span class="err">ошибка: ' . htmlspecialchars($wh['description'] ?? '') . '</span>') . '</p><p>В группу пришло проверочное сообщение.</p></div>');
}
$opts = '';
foreach ($groups as $id => $title) $opts .= '<p><button name="chat" value="' . htmlspecialchars($id) . '">Подключить группу «' . htmlspecialchars($title) . '»</button></p>';
page('Шаг 2: куда присылать заявки', '<p>Бот: <b>' . htmlspecialchars($bot) . '</b></p><form method="post" class="c">' . ($opts ?: '<p>Групп с ботом не найдено. Чтобы заявки шли в группу — добавьте туда бота, напишите в группе <b>/start@' . htmlspecialchars($me['result']['username']) . '</b> и обновите страницу.</p>') . '<p><button name="chat" value="none" style="background:#3a3d46;color:#efe7da">Без группы — в личку сотрудникам</button></p></form>');
