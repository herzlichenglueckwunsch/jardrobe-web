/* Browser-Test (klickt die App einmal komplett durch):  npm run test:browser
   Einmalig vorher:  npm install  &&  npx playwright install chromium
   Apple/Kalender werden simuliert -> läuft ohne Internet.
   Screenshots landen in tests/screenshots/ */
const { chromium, devices } = require('playwright');
const path = require('path');
const OUT = path.join(__dirname, 'screenshots');
require('fs').mkdirSync(OUT, { recursive: true });
const now = Date.now(), day = 86400000;
const iso = (t) => new Date(t).toISOString();
function itunes(url) {
  const u = new URL(url); const p = Object.fromEntries(u.searchParams);
  let data = { results: [] };
  if (p.media === 'podcast') data.results = [
    { collectionId: 111, collectionName: 'OMR Podcast', artistName: 'OMR', artworkUrl100: '', collectionViewUrl: 'https://podcasts.apple.com/de/podcast/id111' },
    { collectionId: 222, collectionName: 'OMR Rabbit Hole', artistName: 'OMR', artworkUrl100: '', collectionViewUrl: 'https://podcasts.apple.com/de/podcast/id222' }];
  if (u.pathname.includes('lookup')) data.results = [
    { wrapperType: 'track', kind: 'podcast', collectionId: +p.id, collectionName: 'OMR Podcast' },
    { wrapperType: 'podcastEpisode', trackId: 9001, trackName: 'Folge 800: Wie man eine Marke baut', collectionName: 'OMR Podcast', releaseDate: iso(now - day/2), trackTimeMillis: 3600000, trackViewUrl: 'https://podcasts.apple.com/de/podcast/x?i=9001' },
    { wrapperType: 'podcastEpisode', trackId: 9002, trackName: 'Folge 799: Alte Folge', collectionName: 'OMR Podcast', releaseDate: iso(now - 40*day), trackViewUrl: 'https://podcasts.apple.com/de/podcast/x?i=9002' }];
  if (p.media === 'audiobook') data.results = [
    { collectionId: 333, collectionName: 'Der neue Thriller (ungekürzt)', artistName: 'Sebastian Fitzek', releaseDate: iso(now - 10*day), collectionViewUrl: 'https://books.apple.com/de/audiobook/id333' },
    { collectionId: 334, collectionName: 'Uralter Klassiker', artistName: 'Sebastian Fitzek', releaseDate: '2015-01-01T00:00:00Z', collectionViewUrl: 'https://books.apple.com/de/audiobook/id334' }];
  return `${p.callback}(${JSON.stringify(data)})`;
}
const ICS = ["BEGIN:VCALENDAR","VERSION:2.0","BEGIN:VEVENT","UID:t1",
  `DTSTART:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T090000Z`,
  `DTEND:${new Date().toISOString().slice(0,10).replace(/-/g,'')}T100000Z`,
  "SUMMARY:Team-Call","LOCATION:Büro","END:VEVENT","END:VCALENDAR"].join("\r\n");
(async () => {
  const { startServer } = await import('../tools/dev-server.mjs');
  const server = await startServer(8799, { quiet: true });
  const b = await chromium.launch();
  const ctx = await b.newContext({ ...devices['iPhone 13'], timezoneId: 'Europe/Berlin', locale: 'de-DE' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/fonts\.g|ERR_FAILED|net::/.test(m.text())) errors.push('console: ' + m.text()); });
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  // iTunes-RSS-Charts (gleiches Format wie der echte Feed: label-Objekte, link mal Objekt, mal Array)
  const RSS = { feed: { entry: [{ 'im:name': { label: 'Chart-Podcast Eins' }, 'im:artist': { label: 'Sender' }, 'im:image': [{ label: '' }],
    link: { attributes: { rel: 'alternate', href: 'https://podcasts.apple.com/de/podcast/id1' } }, id: { label: 'https://podcasts.apple.com/de/podcast/id1', attributes: { 'im:id': '1' } },
    'im:releaseDate': { label: iso(now - day) } }] } };
  await ctx.route(/itunes\.apple\.com/, (r) => /\/rss\//.test(r.request().url())
    ? r.fulfill({ contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(RSS) })
    : r.fulfill({ contentType: 'text/javascript', body: itunes(r.request().url()) }));
  await ctx.route(/cal\.example\.test/, (r) => r.fulfill({ contentType: 'text/calendar', headers: { 'access-control-allow-origin': '*' }, body: ICS }));
  await ctx.route(/blocked\.example\.test/, (r) => r.abort());
  const step = async (name, fn) => { try { await fn(); console.log('✓', name); } catch (e) { console.log('✗', name, '-', e.message.split('\n')[0]); errors.push(name); } };
  const base = 'http://localhost:8799/';
  await page.goto(base);
  await page.waitForSelector('.daycard');
  await page.waitForTimeout(400);
  await page.screenshot({ path: OUT + '/1-heute-ausjestellt.png', fullPage: true });
  await step('Standard-Look ist ausjestellt', async () => {
    if ((await page.getAttribute('html', 'data-skin')) !== 'ausjestellt') throw new Error('falscher Look');
  });

  await step('Tagesplan: Eintrag mit Uhrzeit', async () => {
    await page.fill('[data-form="addTask"] input', '14:30 Zahnarzt');
    await page.press('[data-form="addTask"] input', 'Enter');
    await page.waitForSelector('.pl.task >> text=Zahnarzt');
    if ((await page.textContent('.pl.task .pt')) !== '14:30') throw new Error('Zeit falsch');
  });
  await step('Aufgabe abhaken bleibt nach Reload', async () => {
    await page.check('[data-task-done]');
    await page.fill('[data-note]', 'Idee: Beutel in Lila');
    await page.waitForTimeout(600);
    await page.reload(); await page.waitForSelector('.daycard');
    if (!(await page.isChecked('[data-task-done]'))) throw new Error('nicht gespeichert');
    if ((await page.inputValue('[data-note]')) !== 'Idee: Beutel in Lila') throw new Error('Notiz weg');
  });
  await step('Vormerken für morgen erscheint unter "Demnächst"', async () => {
    await page.click('summary:has-text("anderen Tag")');
    await page.fill('[data-form="vormerken"] input[name="text"]', 'Paket abholen');
    await page.click('[data-form="vormerken"] button');
    await page.waitForSelector('.uplist >> text=Paket abholen');
  });
  await step('Medien-Teaser auf Heute lädt', async () => { await page.waitForSelector('.mitem', { timeout: 5000 }); });
  await step('Projekt-Vorschlag "dran gearbeitet"', async () => {
    await page.click('.sug [data-act="worked"] >> nth=0');
    await page.waitForSelector('.sug >> text=✓ dran');
  });
  await step('Medien: Podcast suchen & folgen, neue Folge sichtbar', async () => {
    await page.goto(base + '#medien'); await page.waitForSelector('[data-form="follow"]');
    await page.fill('[data-form="follow"] input[name="term"]', 'OMR');
    await page.click('[data-form="follow"] button');
    await page.click('.picklist button >> nth=0');
    await page.waitForSelector('.mitem >> text=Folge 800', { timeout: 5000 });
    if (await page.$('.mitem >> text=Alte Folge')) throw new Error('alte Folge sollte gefiltert sein');
  });
  await step('Medien: Hörbuch-Autor folgen, nur neue Titel', async () => {
    await page.selectOption('[data-form="follow"] select', 'hoerbuch');
    await page.fill('[data-form="follow"] input[name="term"]', 'Sebastian Fitzek');
    await page.click('[data-form="follow"] button');
    await page.waitForSelector('.mitem >> text=Der neue Thriller', { timeout: 5000 });
    if (await page.$('.mitem >> text=Uralter Klassiker')) throw new Error('alter Titel nicht gefiltert');
    const href = await page.getAttribute('.mitem:has-text("Der neue Thriller") a:has-text("Audible")', 'href');
    if (!href.includes('audible.de/search')) throw new Error('Audible-Link');
  });
  await page.screenshot({ path: OUT + '/2-medien.png', fullPage: true });
  await step('Einstellungen: Kalender-Feed hinzufügen', async () => {
    await page.goto(base + '#einstellungen'); await page.waitForSelector('[data-form="feed"]');
    await page.fill('[data-form="feed"] input[name="name"]', 'Privat');
    await page.fill('[data-form="feed"] input[name="url"]', 'webcal://cal.example.test/privat.ics');
    await page.click('[data-form="feed"] button.btn:not(.ghost)');
    await page.waitForSelector('.plist >> text=1 Einträge', { timeout: 5000 });
  });
  await step('Blockierter Feed zeigt verständlichen Fehler', async () => {
    await page.fill('[data-form="feed"] input[name="name"]', 'Kaputt');
    await page.fill('[data-form="feed"] input[name="url"]', 'https://blocked.example.test/x.ics');
    await page.click('[data-form="feed"] button.btn:not(.ghost)');
    await page.waitForSelector('.plist >> text=Proxy', { timeout: 5000 });
    await page.once('dialog', (d) => d.accept());
    await page.click('.plist li:has-text("Kaputt") [data-act="delFeed"]');
  });
  await step('Kalender-Termin erscheint im Tagesplan', async () => {
    await page.goto(base + '#heute'); await page.waitForSelector('.pl.cal >> text=Team-Call');
  });
  await step('Events: Präferenz & Partyreihe', async () => {
    await page.goto(base + '#events'); await page.waitForSelector('[data-form="series"]');
    await page.fill('[data-form="series"] input[name="name"]', 'Testreihe Freitags');
    await page.selectOption('[data-form="series"] select[name="rhythmus"]', 'woechentlich');
    await page.selectOption('[data-form="series"] select[name="wochentag"]', '5');
    await page.click('[data-form="series"] button.btn:not(.ghost)');
    await page.waitForSelector('.evlist >> text=Testreihe Freitags');
    await page.click('.ev:has-text("Testreihe Freitags") [data-act="evMerken"] >> nth=0');
    await page.waitForSelector('.toast.on >> text=Vorgemerkt');
  });
  await step('Eigenes Event + .ics Download', async () => {
    await page.fill('[data-form="event"] input[name="title"]', 'Gründer-Frühstück');
    await page.click('[data-form="event"] button');
    await page.waitForSelector('.evlist >> text=Gründer-Frühstück');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('.ev:has-text("Gründer-Frühstück") [data-act="evIcs"]')]);
    const txt = require('fs').readFileSync(await dl.path(), 'utf8');
    if (!txt.includes('SUMMARY:Gründer-Frühstück')) throw new Error('ics Inhalt');
  });
  await page.screenshot({ path: OUT + '/3-events.png', fullPage: true });
  await step('Monatskalender & Tag öffnen', async () => {
    await page.goto(base + '#kalender'); await page.waitForSelector('.mcell.today');
    await page.screenshot({ path: OUT + '/4-kalender.png', fullPage: true });
    await page.click('.mcell.today + .mcell, .mcell.today ~ .mcell >> nth=0');
    await page.waitForSelector('.daycard >> text=morgen');
  });
  await step('Projekte: anlegen & bearbeiten', async () => {
    await page.goto(base + '#projekte');
    await page.fill('[data-form="project"] input[name="name"]', 'Lookbook-Shooting');
    await page.click('[data-form="project"] button');
    await page.waitForSelector('.plist >> text=Lookbook-Shooting');
    await page.click('.plist li:has-text("Lookbook-Shooting") [data-act="editProject"]');
    await page.fill('[data-form="project"] input[name="naechster"]', 'Location fragen');
    await page.click('[data-form="project"] button.btn:not(.ghost)');
    await page.waitForSelector('.plist >> text=Location fragen');
  });
  await step('Backup Export → Reset → Import', async () => {
    await page.goto(base + '#einstellungen');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act="export"]')]);
    const p = await dl.path();
    page.once('dialog', (d) => d.accept());
    await page.click('[data-act="reset"]');
    await page.setInputFiles('[data-import]', p);
    await page.waitForSelector('.toast.on >> text=Backup geladen');
    await page.goto(base + '#projekte'); await page.waitForSelector('.plist >> text=Lookbook-Shooting');
  });
  await step('XSS: Notiz mit HTML wird nicht ausgeführt', async () => {
    await page.goto(base + '#heute');
    await page.fill('[data-form="addTask"] input', '<img src=x onerror=window.__x=1>');
    await page.press('[data-form="addTask"] input', 'Enter');
    await page.waitForTimeout(300);
    if (await page.evaluate(() => window.__x)) throw new Error('XSS');
  });
  await step('Look-Knopf: jardrobe hell -> jardrobe dunkel -> ausjestellt', async () => {
    await page.click('[data-theme-btn]');
    if ((await page.getAttribute('html', 'data-skin')) !== 'jardrobe' || (await page.getAttribute('html', 'data-theme')) !== 'hell') throw new Error('nicht jardrobe hell');
    await page.waitForTimeout(400);
    await page.screenshot({ path: OUT + '/5-jardrobe-hell.png', fullPage: true });
    await page.click('[data-theme-btn]');
    if ((await page.getAttribute('html', 'data-theme')) !== 'dunkel') throw new Error('kein dunkel');
    await page.click('[data-theme-btn]');
    if ((await page.getAttribute('html', 'data-skin')) !== 'ausjestellt') throw new Error('nicht zurück');
  });
  await step('Look in Einstellungen wählbar & bleibt nach Reload', async () => {
    await page.goto(base + '#einstellungen');
    await page.selectOption('[data-form="basic"] select[name="skin"]', 'jardrobe');
    await page.click('[data-form="basic"] button');
    await page.reload(); await page.waitForSelector('[data-form="basic"]');
    if ((await page.getAttribute('html', 'data-skin')) !== 'jardrobe') throw new Error('nicht gespeichert');
    await page.selectOption('[data-form="basic"] select[name="skin"]', 'ausjestellt');
    await page.click('[data-form="basic"] button');
  });
  await step('Verlauf-Vorschau lädt', async () => {
    await page.goto(base + 'vorschau.html'); await page.waitForSelector('.tag');
    if ((await page.$$('.tag')).length !== 42) throw new Error('Anzahl');
    await page.selectOption('#skin', 'jardrobe'); await page.waitForSelector('.tag');
  });
  await step('Kein horizontales Scrollen (Handy)', async () => {
    for (const r of ['heute', 'medien', 'kalender', 'projekte', 'events', 'einstellungen']) {
      await page.goto(base + '#' + r); await page.waitForTimeout(250);
      const w = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      if (w > 1) throw new Error(`${r}: ${w}px zu breit`);
    }
  });
  const desk = await b.newPage({ viewport: { width: 1280, height: 900 } });
  await desk.route(/fonts\.|itunes/, (r) => r.abort());
  await desk.goto(base); await desk.waitForSelector('.daycard'); await desk.waitForTimeout(300); await desk.screenshot({ path: OUT + '/6-desktop.png' });
  await desk.goto(base + 'vorschau.html'); await desk.waitForSelector('.tag'); await desk.screenshot({ path: OUT + '/7-vorschau.png' });
  console.log(errors.length ? 'FEHLER: ' + JSON.stringify(errors, null, 1) : 'KEINE FEHLER');
  await b.close();
  server.close();
  process.exit(errors.length ? 1 : 0);
})();
