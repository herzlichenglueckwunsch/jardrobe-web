<?php
/* =====================================================================
   JUTEN TACH! – Sync-Speicher
   Bewahrt pro Sync-Code einen VERSCHLÜSSELTEN Datenblock auf. Der Server
   kann den Inhalt nicht lesen – entschlüsselt wird nur im Browser.

   GET  sync.php?id=<64 hex>               -> {rev, blob} oder 404
   POST sync.php?id=<64 hex>  {basis, blob} -> {rev}  oder 409 (jemand war schneller)

   Daten liegen in ./sync-daten/ (wird automatisch angelegt und gesperrt).
   ===================================================================== */

$ORDNER = getenv('JUTENTACH_SYNC_DIR') ?: __DIR__ . '/sync-daten'; // Umgebungsvariable nur für Tests
$MAX_BYTES = 3 * 1024 * 1024;

header('Content-Type: application/json; charset=utf-8');
header('Cache-Control: no-store');
header('X-Content-Type-Options: nosniff');

function antwort($code, $daten) { http_response_code($code); echo json_encode($daten); exit; }

$id = isset($_GET['id']) ? $_GET['id'] : '';
if (!is_string($id) || !preg_match('/^[a-f0-9]{64}$/', $id)) antwort(400, ['fehler' => 'ungültige id']);

if (!is_dir($ORDNER) && !@mkdir($ORDNER, 0700, true)) antwort(500, ['fehler' => 'Ordner sync-daten kann nicht angelegt werden (Schreibrechte?)']);
// Direkten Abruf der Dateien sperren (Apache); zusätzlich sind Namen unratbar und Inhalt verschlüsselt
if (!is_file("$ORDNER/.htaccess")) {
  @file_put_contents("$ORDNER/.htaccess", "<IfModule mod_authz_core.c>\n  Require all denied\n</IfModule>\n<IfModule !mod_authz_core.c>\n  Deny from all\n</IfModule>\n");
  @file_put_contents("$ORDNER/index.html", '');
}

$datei = "$ORDNER/$id.json";
$methode = $_SERVER['REQUEST_METHOD'];

if ($methode === 'GET') {
  if (!is_file($datei)) antwort(404, ['fehler' => 'nicht gefunden']);
  $fh = fopen($datei, 'r');
  flock($fh, LOCK_SH);
  $inhalt = stream_get_contents($fh);
  flock($fh, LOCK_UN); fclose($fh);
  echo $inhalt;
  exit;
}

if ($methode === 'POST') {
  $roh = file_get_contents('php://input', false, null, 0, $MAX_BYTES + 1);
  if (strlen($roh) > $MAX_BYTES) antwort(413, ['fehler' => 'Daten zu groß']);
  $in = json_decode($roh, true);
  if (!is_array($in) || !isset($in['blob']) || !is_string($in['blob']) || !isset($in['basis']) || !is_int($in['basis'])) {
    antwort(400, ['fehler' => 'ungültige Daten']);
  }
  $fh = fopen($datei, 'c+');
  if (!$fh) antwort(500, ['fehler' => 'kann nicht schreiben (Schreibrechte?)']);
  flock($fh, LOCK_EX);
  $alt = json_decode(stream_get_contents($fh), true);
  $rev = is_array($alt) && isset($alt['rev']) ? (int)$alt['rev'] : 0;
  if ($in['basis'] !== $rev) {           // anderes Gerät hat inzwischen gespeichert
    flock($fh, LOCK_UN); fclose($fh);
    antwort(409, ['fehler' => 'veraltet', 'rev' => $rev]);
  }
  $neu = json_encode(['rev' => $rev + 1, 'blob' => $in['blob'], 'zeit' => time()]);
  ftruncate($fh, 0); rewind($fh);
  fwrite($fh, $neu); fflush($fh);
  flock($fh, LOCK_UN); fclose($fh);
  antwort(200, ['rev' => $rev + 1]);
}

antwort(405, ['fehler' => 'nur GET/POST']);
