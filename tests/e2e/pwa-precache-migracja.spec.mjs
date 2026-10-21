import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Projekt desktop-chromium domyślnie blokuje SW (playwright.config.mjs), a launchPersistentContext
// dziedziczy tę opcję; ten plik sprawdza prawdziwy SW, więc go włącza.
test.use({ serviceWorkers: 'allow' });

// P-SW-PRECACHE (decyzja właściciela 2026-09-29): migracja z SW, który instalował całą historię precache.
//
// Zmierzone na SW 1.1.103 (Chromium, profil trwały, limit źródła ustalony przez CDP): stara instalacja wypełniała
// limit 1000 MiB (rdzeń ok. 0,83 GB, potem kolejka opcjonalna, dopóki starczyło miejsca), a aktualizacja do następnej
// wersji padała na pierwszym wpisie — użytkownik zostawał na starej wersji na zawsze. Test odtwarza taki stan pamięci
// (pamięć powłoki `pwa-kalorii-shell-v1.1.104` wypełniona w tej samej kolejności co stara instalacja, aż do
// QuotaExceededError), instaluje prawdziwy SW i sprawdza, że:
//   1. SW się instaluje i aktywuje, a stara pamięć znika;
//   2. wpisy z ?v= obecne w starej pamięci nie idą z sieci (kopia), z sieci idą tylko te, których tam nie było;
//   3. DocPro i strona główna startują potem bez sieci (serwer zatrzymany, jak w pwa-strony-offline.spec.mjs).

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ZRODLO_SW = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
const sw = new Function('self', 'caches', 'fetch', `${ZRODLO_SW}
return { CORE_SHELL_URLS, OPTIONAL_PRECACHE_ORDER, INSTALL_CORE_URLS, INSTALL_OPTIONAL_URLS, DOCUMENT_PATHS };`)(
  { location: new URL('https://vilda.test/service-worker-kalorii.js'), registration: {}, clients: {}, addEventListener() {}, skipWaiting() {} },
  null,
  null,
);
const STARA_PAMIEC = 'pwa-kalorii-shell-v1.1.104';
// Historia precache rośnie: rdzeń ma już ok. 399 MiB samych plików, więc dawny stały limit 400 MiB
// kończył się przed kolejką opcjonalną (CacheStorage dolicza metadane). Najpierw mieścimy CAŁY rdzeń
// z ograniczonym zapasem, następnie mierzymy rzeczywiste zajęcie źródła i zostawiamy 16 MiB na kolejkę
// opcjonalną. Nadal musi ona dojść do QuotaExceededError przed instalacją produkcyjnego SW.
const MIB = 1024 * 1024;
const CORE_PAYLOAD_BYTES = sw.CORE_SHELL_URLS.reduce((suma, adres) => (
  suma + fs.statSync(path.join(korzen, new URL(adres, 'https://vilda.test').pathname)).size
), 0);
const INITIAL_QUOTA_BYTES = CORE_PAYLOAD_BYTES + 64 * MIB;
const OPTIONAL_HEADROOM_BYTES = 16 * MIB;
const POMIJANE = [/^\/videos\//, /^\/posters\//, /^\/lab_pin_result\.js\?v=/];

async function uruchomSerwer() {
  const proces = spawn(process.execPath, [path.join(korzen, 'tests/support/static-server.mjs')], {
    env: { ...process.env, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const adres = await new Promise((ok, blad) => {
    let wyjscie = '';
    proces.stdout.on('data', (kawalek) => {
      wyjscie += kawalek;
      const m = /http:\/\/127\.0\.0\.1:(\d+)/.exec(wyjscie);
      if (m) ok(`http://127.0.0.1:${m[1]}`);
    });
    proces.once('exit', (kod) => blad(new Error(`serwer testowy zakończył się przed startem (${kod})`)));
  });
  const zatrzymaj = () => new Promise((ok) => {
    if (proces.exitCode !== null || proces.signalCode !== null) { ok(); return; }
    proces.once('exit', () => ok());
    proces.kill('SIGKILL');
  });
  return { adres, zatrzymaj };
}

test('stara pamięć zajmuje cały limit źródła: nowy SW instaluje się, kopiuje wpisy ?v=, a strony startują offline', async ({ playwright, browserName, launchOptions }) => {
  test.skip(browserName !== 'chromium', 'limit źródła ustawiany przez CDP (Storage.overrideQuotaForOrigin)');
  // Wypełnienie starej pamięci to ok. 2 tys. pobrań po kolei (lokalnie ~60 s), instalacja nowego SW kilka sekund.
  test.setTimeout(420_000);

  const katalogProfilu = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-sw-migracja-'));
  const kontekst = await playwright[browserName].launchPersistentContext(katalogProfilu, { ...launchOptions, locale: 'pl-PL' });
  const serwer = await uruchomSerwer();
  try {
    const page = kontekst.pages()[0] || await kontekst.newPage();
    const cdp = await kontekst.newCDPSession(page);
    await cdp.send('Storage.overrideQuotaForOrigin', { origin: serwer.adres, quotaSize: INITIAL_QUOTA_BYTES });
    await page.goto(`${serwer.adres}/tests/fixtures/service-worker-runner.html`);

    // Stara instalacja (SW ≤ 1.1.104): rdzeń z historią, potem kolejka opcjonalna, dopóki starczy miejsca.
    const brakujacyRdzen = await page.evaluate(async ({ nazwa, adresy }) => {
      const cache = await caches.open(nazwa);
      for (const adres of adresy) {
        const odpowiedz = await fetch(adres, { cache: 'reload' });
        if (!odpowiedz.ok) throw new Error(`Nie udało się przygotować starego rdzenia: ${adres}`);
        await cache.put(adres, odpowiedz);
      }
      const brakujace = [];
      for (const adres of adresy) if (!(await cache.match(adres))) brakujace.push(adres);
      return brakujace;
    }, { nazwa: STARA_PAMIEC, adresy: sw.CORE_SHELL_URLS });
    expect(brakujacyRdzen, 'każdy wpis rdzenia z historią jest obecny w starej pamięci').toEqual([]);
    const { usage } = await cdp.send('Storage.getUsageAndQuota', { origin: serwer.adres });
    expect(usage, 'zmierzone zajęcie pełnego starego rdzenia').toBeGreaterThan(0);
    await cdp.send('Storage.overrideQuotaForOrigin', {
      origin: serwer.adres, quotaSize: Math.ceil(usage) + OPTIONAL_HEADROOM_BYTES,
    });
    const stara = await page.evaluate(async ({ nazwa, adresy, rdzen }) => {
      const cache = await caches.open(nazwa);
      let pelna = false;
      for (const adres of adresy) {
        const odpowiedz = await fetch(adres, { cache: 'reload' });
        if (!odpowiedz.ok) continue;
        try {
          await cache.put(adres, odpowiedz);
        } catch (blad) {
          if (blad && blad.name === 'QuotaExceededError') { pelna = true; break; }
          throw blad;
        }
      }
      const brakujace = [];
      for (const adres of rdzen) if (!(await cache.match(adres))) brakujace.push(adres);
      return { pelna, wpisy: (await cache.keys()).length, brakujace };
    }, { nazwa: STARA_PAMIEC, adresy: sw.OPTIONAL_PRECACHE_ORDER, rdzen: sw.CORE_SHELL_URLS });
    expect(stara.pelna, 'stara pamięć wypełniła limit źródła').toBe(true);
    expect(stara.wpisy, 'rdzeń z historią zmieścił się jak w starej instalacji').toBeGreaterThanOrEqual(sw.CORE_SHELL_URLS.length);
    expect(stara.brakujace, 'pełny limit nie usunął żadnego wpisu starego rdzenia').toEqual([]);

    // Wpisy ?v= nowej instalacji, których w starej pamięci nie ma — tylko one mogą pójść z sieci.
    const wersjonowane = [...new Set([...sw.INSTALL_CORE_URLS, ...sw.INSTALL_OPTIONAL_URLS])]
      .filter((adres) => /\?v=/.test(adres) && !sw.DOCUMENT_PATHS.has(adres.split('?')[0]));
    const nieobecne = await page.evaluate(async ({ nazwa, adresy }) => {
      const cache = await caches.open(nazwa);
      const out = [];
      for (const adres of adresy) if (!(await cache.match(adres))) out.push(adres);
      return out;
    }, { nazwa: STARA_PAMIEC, adresy: wersjonowane });

    await page.request.get(`${serwer.adres}/__test-pobrania?reset=1`);
    const instalacja = await page.evaluate(async () => {
      const rejestracja = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      const nowy = rejestracja.installing || rejestracja.waiting || rejestracja.active;
      const koniec = () => nowy.state === 'activated' || nowy.state === 'redundant';
      if (!koniec()) await new Promise((ok) => { nowy.addEventListener('statechange', () => { if (koniec()) ok(); }); });
      return { stan: nowy.state, pamieci: await caches.keys() };
    });
    expect(instalacja.stan, 'nowy SW zainstalowany mimo pełnego limitu').toBe('activated');
    expect(instalacja.pamieci, 'stara pamięć powłoki usunięta przy aktywacji').not.toContain(STARA_PAMIEC);

    const { zWersja } = await (await page.request.get(`${serwer.adres}/__test-pobrania`)).json();
    const zSieciMimoKopii = zWersja.filter((adres) => wersjonowane.includes(adres) && !nieobecne.includes(adres));
    expect(zSieciMimoKopii, 'wpis ?v= obecny w starej pamięci poszedł z sieci zamiast z kopii').toEqual([]);
    expect(wersjonowane.length - nieobecne.length, 'kopia naprawdę zadziałała').toBeGreaterThan(100);
  } finally {
    await serwer.zatrzymaj();
  }

  // Bez sieci: DocPro i strona główna z nowej pamięci powłoki.
  const page = kontekst.pages()[0];
  const sonda = await page.evaluate(() => fetch(`/README.md?sonda-offline=${Date.now()}`).then(() => 'sieć jest', () => 'brak sieci'));
  expect(sonda, 'serwer zatrzymany — sieci nie ma').toBe('brak sieci');
  const nieudane = [];
  page.on('requestfailed', (zadanie) => {
    const url = new URL(zadanie.url());
    const adres = `${url.pathname}${url.search}`;
    if (url.origin !== serwer.adres || url.searchParams.has('sonda-offline')) return;
    if (POMIJANE.some((wzorzec) => wzorzec.test(adres))) return;
    if (zadanie.failure()?.errorText === 'net::ERR_ABORTED') return;
    nieudane.push(`${new URL(page.url()).pathname}: ${adres} (${zadanie.failure()?.errorText})`);
  });
  for (const strona of ['/docpro.html', '/index.html']) {
    await page.goto(`${serwer.adres}${strona}`, { waitUntil: 'load' });
    await page.waitForTimeout(1500);
  }
  await page.goto(`${serwer.adres}/docpro.html`, { waitUntil: 'load' });
  await expect.poll(() => page.evaluate(() => typeof window.VildaVault), { message: 'sejf DocPro offline' }).toBe('object');
  expect(nieudane, nieudane.join('\n')).toEqual([]);
  await kontekst.close();
  fs.rmSync(katalogProfilu, { recursive: true, force: true });
});
