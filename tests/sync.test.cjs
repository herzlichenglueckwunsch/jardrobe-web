/* Sync-Test mit ECHTER sync.php: zwei Geräte (getrennte Browser-Profile) gleichen ab.
   Start:  npm run test:sync     (braucht PHP auf dem Rechner: `php -v`)
   Ohne PHP wird der Test übersprungen. */
const { chromium, devices } = require('playwright');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs'), os = require('os'), path = require('path');

if (spawnSync('php', ['-v']).status !== 0) { console.log('PHP nicht installiert – Sync-Test übersprungen.'); process.exit(0); }

const PORT = 8797, base = `http://127.0.0.1:${PORT}/`;
const daten = fs.mkdtempSync(path.join(os.tmpdir(), 'jt-sync-'));
const php = spawn('php', ['-S', `127.0.0.1:${PORT}`, '-t', path.join(__dirname, '../tagesblatt')], { env: { ...process.env, JUTENTACH_SYNC_DIR: daten }, stdio: 'ignore' });

(async () => {
  await new Promise((r) => setTimeout(r, 800));
  const b = await chromium.launch();
  const errors = [];
  const geraet = async (name, dev) => {
    const ctx = await b.newContext({ ...dev, timezoneId: 'Europe/Berlin', locale: 'de-DE' });
    await ctx.route(/fonts\.|itunes|rss\./, (r) => r.abort());
    const p = await ctx.newPage();
    p.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
    p.on('dialog', (d) => d.accept());
    await p.goto(base); await p.waitForSelector('.daycard');
    return p;
  };
  const step = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); } };
  const abgleichen = async (p) => {
    await p.goto(base + '#einstellungen'); await p.waitForSelector('[data-act="syncNow"]');
    await p.click('[data-act="syncNow"]'); await p.waitForSelector('.toast.on >> text=Abgeglichen');
    await p.waitForTimeout(200);
  };
  const projektAnlegen = async (p, name) => {
    await p.goto(base + '#projekte'); await p.fill('[data-form="project"] input[name="name"]', name);
    await p.click('[data-form="project"] button'); await p.waitForSelector(`.plist >> text=${name}`);
  };
  const A = await geraet('Handy', devices['iPhone 13']);
  const B = await geraet('Rechner', { viewport: { width: 1200, height: 900 } });
  let code = '';

  await step('Gerät A: Sync einrichten', async () => {
    await A.goto(base + '#einstellungen'); await A.click('[data-act="syncSetup"]');
    await A.waitForSelector('.synccode', { state: 'attached' });
    code = await A.getAttribute('.synccode', 'data-text');
    if (!/^([a-z2-9]{4}-){5}[a-z2-9]{4}$/.test(code)) throw new Error('Code: ' + code);
  });
  await step('Gerät A: Daten anlegen (Projekt, Aufgabe, Notiz, Präferenz)', async () => {
    await projektAnlegen(A, 'Projekt vom Handy');
    await A.goto(base + '#heute'); await A.fill('[data-form="addTask"] input', '18:00 Aufgabe vom Handy');
    await A.press('[data-form="addTask"] input', 'Enter'); await A.waitForSelector('.pl.task >> text=Aufgabe vom Handy');
    await A.fill('[data-note]', 'Notiz vom Handy'); await A.waitForTimeout(600);
    await A.goto(base + '#events'); await A.fill('[data-form="prefs"] input[name="stadt"]', 'Leipzig'); await A.click('[data-form="prefs"] button');
    await abgleichen(A);
  });
  await step('Falscher Code wird abgelehnt', async () => {
    await B.goto(base + '#einstellungen'); await B.fill('[data-form="syncJoin"] input[name="code"]', 'aaaa-bbbb-cccc-dddd-eeee-ffff');
    await B.click('[data-form="syncJoin"] button.btn'); await B.waitForSelector('.toast.on >> text=keinen Sync');
  });
  await step('Gerät B: mit Code verbinden (ersetzen) und alles ist da', async () => {
    await B.fill('[data-form="syncJoin"] input[name="code"]', code.toUpperCase().replace(/-/g, ' '));
    await B.click('[data-form="syncJoin"] button.btn'); await B.waitForSelector('.toast.on >> text=Verbunden');
    await B.goto(base + '#projekte'); await B.waitForSelector('.plist >> text=Projekt vom Handy');
    await B.goto(base + '#heute'); await B.waitForSelector('.pl.task >> text=Aufgabe vom Handy');
    if ((await B.inputValue('[data-note]')) !== 'Notiz vom Handy') throw new Error('Notiz fehlt');
    await B.goto(base + '#events');
    if ((await B.inputValue('[data-form="prefs"] input[name="stadt"]')) !== 'Leipzig') throw new Error('Präferenz fehlt');
  });
  await step('Keine doppelten Beispiel-Projekte nach dem Verbinden', async () => {
    await B.goto(base + '#projekte');
    const n = await B.$$eval('.plist li', (li) => li.filter((x) => x.textContent.includes('Rechtstexte')).length);
    if (n !== 1) throw new Error(`${n}x Rechtstexte`);
  });
  await step('B ändert & löscht -> kommt auf A an', async () => {
    await projektAnlegen(B, 'Projekt vom Rechner');
    await B.click('.plist li:has-text("Projekt vom Handy") [data-act="delProject"]');
    await B.waitForTimeout(200);
    await abgleichen(B); await abgleichen(A);
    await A.goto(base + '#projekte'); await A.waitForSelector('.plist >> text=Projekt vom Rechner');
    if (await A.$('.plist >> text=Projekt vom Handy')) throw new Error('Gelöschtes ist noch da');
  });
  await step('Gleichzeitig auf beiden Geräten geändert -> nichts geht verloren', async () => {
    for (const [p, t] of [[A, 'Gleichzeitig A'], [B, 'Gleichzeitig B']]) {
      await p.goto(base + '#heute'); await p.fill('[data-form="addTask"] input', t); await p.press('[data-form="addTask"] input', 'Enter');
    }
    await Promise.all([abgleichen(A), abgleichen(B)]);
    await abgleichen(A); await abgleichen(B);
    for (const p of [A, B]) {
      await p.goto(base + '#heute');
      for (const t of ['Gleichzeitig A', 'Gleichzeitig B']) await p.waitForSelector(`.pl.task >> text=${t}`, { timeout: 4000 });
    }
  });
  await step('Automatisch: Änderung kommt ohne Knopfdruck an', async () => {
    await B.goto(base + '#heute'); await B.fill('[data-note]', 'automatisch rüber'); // 2 s später wird gesendet
    await B.waitForTimeout(3500);
    await A.reload(); await A.waitForSelector('.daycard'); await A.waitForTimeout(1500); // beim Öffnen wird geholt
    await A.goto(base + '#heute');
    if ((await A.inputValue('[data-note]')) !== 'automatisch rüber') throw new Error('nicht angekommen: ' + await A.inputValue('[data-note]'));
  });
  await step('Podcast-Abo vom Handy erscheint am Rechner', async () => {
    await A.goto(base + '#medien'); await A.click('[data-act="followSuggest"] >> nth=0');
    const name = (await A.textContent('.chip.on')).replace(/[🎙×]/g, '').trim();
    await abgleichen(A); await abgleichen(B);
    await B.goto(base + '#medien'); await B.waitForSelector(`.chip.on >> text=${name}`);
  });
  await step('Server sieht nur verschlüsselte Daten', async () => {
    const dateien = fs.readdirSync(daten).filter((f) => f.endsWith('.json'));
    if (dateien.length !== 1) throw new Error('Dateien: ' + dateien.join(','));
    const roh = fs.readFileSync(path.join(daten, dateien[0]), 'utf8');
    if (/Projekt|Handy|Rechner|Leipzig|automatisch/.test(roh)) throw new Error('Klartext auf dem Server!');
    if (!fs.existsSync(path.join(daten, '.htaccess'))) throw new Error('.htaccess fehlt');
  });
  await step('Ungültige Anfragen werden abgelehnt', async () => {
    const r1 = await fetch(base + 'sync.php?id=../../etc/passwd'); if (r1.status !== 400) throw new Error('id ' + r1.status);
    const r2 = await fetch(base + 'sync.php?id=' + 'a'.repeat(64), { method: 'POST', body: '{"basis":"x"}' }); if (r2.status !== 400) throw new Error('body ' + r2.status);
    const r3 = await fetch(base + 'sync.php?id=' + 'a'.repeat(64), { method: 'POST', body: JSON.stringify({ basis: 5, blob: 'x' }) }); if (r3.status !== 409) throw new Error('rev ' + r3.status);
  });
  await step('Trennen: Daten bleiben auf dem Gerät', async () => {
    await A.goto(base + '#einstellungen'); await A.click('[data-act="syncOff"]'); await A.waitForSelector('[data-act="syncSetup"]');
    await A.goto(base + '#projekte'); await A.waitForSelector('.plist >> text=Projekt vom Rechner');
  });

  console.log(errors.length ? 'FEHLER: ' + JSON.stringify(errors, null, 1) : 'SYNC: KEINE FEHLER');
  await b.close(); php.kill(); fs.rmSync(daten, { recursive: true, force: true });
  process.exit(errors.length ? 1 : 0);
})().catch((e) => { console.error(e); php.kill(); process.exit(1); });
