<?php
/* =====================================================================
   JUTEN TACH! – Kalender-Proxy
   Holt einen ICS-Kalender (Apple/Google/Outlook/Meetup …) und gibt ihn an
   die App weiter. Nötig, weil Browser fremde Kalender wegen CORS nicht
   direkt laden dürfen.

   Sicherheit: Es werden NUR Adressen der unten erlaubten Anbieter geladen
   (kein offener Proxy). Eigene Club-/Event-Seiten bei $ERLAUBT ergänzen.
   ===================================================================== */

$ERLAUBT = [
  'calendar.google.com',
  'icloud.com',            // inkl. pXX-caldav.icloud.com
  'outlook.office365.com',
  'outlook.live.com',
  'meetup.com',
  'eventbrite.com',
  'eventbrite.de',
  // 'dein-club.de',
];
$MAX_BYTES = 5 * 1024 * 1024;

header('Content-Type: text/plain; charset=utf-8');
header('X-Content-Type-Options: nosniff');
header('Cache-Control: private, max-age=300');

function fail($code, $msg) { http_response_code($code); echo $msg; exit; }

function host_ok($host, $erlaubt) {
  $host = strtolower(rtrim($host, '.'));
  foreach ($erlaubt as $e) {
    if ($host === $e || substr($host, -strlen('.' . $e)) === '.' . $e) return true;
  }
  return false;
}

$url = isset($_GET['url']) ? trim($_GET['url']) : '';
$url = preg_replace('#^webcal://#i', 'https://', $url);
if ($url === '' || strlen($url) > 2000) fail(400, 'url fehlt');

if (!function_exists('curl_init')) fail(500, 'PHP-curl ist auf diesem Server nicht aktiv');

for ($hop = 0; $hop < 4; $hop++) {
  $p = parse_url($url);
  if (!$p || ($p['scheme'] ?? '') !== 'https' || empty($p['host'])) fail(400, 'nur https erlaubt');
  if (!host_ok($p['host'], $ERLAUBT)) fail(403, 'Anbieter nicht freigegeben: ' . $p['host']);

  $body = '';
  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => false,
    CURLOPT_FOLLOWLOCATION => false,     // Weiterleitungen selbst prüfen
    CURLOPT_CONNECTTIMEOUT => 8,
    CURLOPT_TIMEOUT => 20,
    CURLOPT_PROTOCOLS => CURLPROTO_HTTPS,
    CURLOPT_USERAGENT => 'jutenTach-ICS/1.0',
    CURLOPT_HTTPHEADER => ['Accept: text/calendar, text/plain;q=0.9, */*;q=0.5'],
    CURLOPT_WRITEFUNCTION => function ($ch, $chunk) use (&$body, $MAX_BYTES) {
      $body .= $chunk;
      return strlen($body) > $MAX_BYTES ? 0 : strlen($chunk);
    },
  ]);
  $ok = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
  $next = curl_getinfo($ch, CURLINFO_REDIRECT_URL);
  $err = curl_error($ch);
  curl_close($ch);

  if ($status >= 300 && $status < 400 && $next) { $url = $next; continue; }
  if ($ok === false && strlen($body) > $MAX_BYTES) fail(413, 'Kalender zu groß');
  if ($ok === false) fail(502, 'Abruf fehlgeschlagen: ' . $err);
  if ($status !== 200) fail(502, 'Anbieter antwortet mit ' . $status);
  if (strpos($body, 'BEGIN:VCALENDAR') === false) fail(502, 'Antwort ist kein Kalender');

  header('Content-Type: text/calendar; charset=utf-8');
  echo $body;
  exit;
}
fail(508, 'zu viele Weiterleitungen');
