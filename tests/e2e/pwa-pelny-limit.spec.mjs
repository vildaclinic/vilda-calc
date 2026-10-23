import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Projekt desktop-chromium domyślnie blokuje SW (playwright.config.mjs), a launchPersistentContext
// dziedziczy tę opcję; ten plik sprawdza prawdziwy SW, więc go włącza.
test.use({ serviceWorkers: 'allow' });

// P-SW-PUSTA-KOPIA (2026-10-20): zapis kopii dokumentu przy źródle zapełnionym do limitu pamięci.
//
// Firefox przy pełnym limicie „udanie” zapisuje 0 B (dobra kopia nadpisana pustą — mierzone skryptem
// tests/scripts/pomiar-pustej-kopii-sw.mjs; tego silnika nie ma w CI). Chromium odrzuca cały zapis
// (QuotaExceededError), a do SW 1.1.347 odrzucony zapis przerywał odpowiedź: strona bez kopii w pamięci powłoki
// nie otwierała się ONLINE (net::ERR_FAILED, zmierzone w Chromium 141). Test na prawdziwym SW i prawdziwym limicie
// (CDP Storage.overrideQuotaForOrigin) sprawdza, że:
//   1. strona bez kopii otwiera się online przy pełnym limicie (odpowiedź z sieci nie zależy od zapisu kopii);
//   2. odświeżenie w tle przy pełnym limicie nie psuje dobrej kopii dokumentu (odczyt kontrolny zostawia ją
//      nietkniętą), a strona startuje z niej bez sieci (serwer zatrzymany, jak w pwa-strony-offline.spec.mjs).

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const LIMIT_MIB = 120;

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

const bajtyWpisu = (page, klucz) => page.evaluate(async (k) => {
  const nazwa = (await caches.keys()).find((n) => n.startsWith('pwa-kalorii-shell-v'));
  const odp = nazwa ? await (await caches.open(nazwa)).match(k) : undefined;
  return odp ? (await odp.arrayBuffer()).byteLength : null;
}, klucz);

test('pełny limit pamięci: strona bez kopii otwiera się online, a dobra kopia dokumentu przeżywa odświeżenie i działa offline', async ({ playwright, browserName, launchOptions }) => {
  test.skip(browserName !== 'chromium', 'limit źródła ustawiany przez CDP (Storage.overrideQuotaForOrigin)');
  // Instalacja ok. 400 pobrań (P-SW-PRECACHE), wypełnienie ok. 70 MiB, kilka nawigacji.
  test.setTimeout(180_000);

  const katalogProfilu = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-sw-pelny-limit-'));
  const kontekst = await playwright[browserName].launchPersistentContext(katalogProfilu, { ...launchOptions, locale: 'pl-PL' });
  const serwer = await uruchomSerwer();
  try {
    const page = kontekst.pages()[0] || await kontekst.newPage();
    try {
      await page.goto(`${serwer.adres}/tests/fixtures/service-worker-runner.html`);
      const cdp = await kontekst.newCDPSession(page);
      await cdp.send('Storage.overrideQuotaForOrigin', { origin: serwer.adres, quotaSize: LIMIT_MIB * 1024 * 1024 });
      const stan = await page.evaluate(async () => {
        const rejestracja = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
        const sw = rejestracja.installing || rejestracja.waiting || rejestracja.active;
        const koniec = () => sw.state === 'activated' || sw.state === 'redundant';
        if (!koniec()) await new Promise((ok) => { sw.addEventListener('statechange', () => { if (koniec()) ok(); }); });
        return sw.state;
      });
      expect(stan, 'instalacja precache mieści się w limicie').toBe('activated');

      const kopiaKontaktu = await bajtyWpisu(page, '/kontakt.html');
      expect(kopiaKontaktu, 'kopia /kontakt.html z precache').toBeGreaterThan(10_000);
      // Scenariusz „bez kopii”: dokument główny znika z pamięci powłoki, zanim źródło się zapełni.
      await page.evaluate(async () => {
        const nazwa = (await caches.keys()).find((n) => n.startsWith('pwa-kalorii-shell-v'));
        await (await caches.open(nazwa)).delete('/index.html');
      });

      // Wypełnienie źródła losowymi bajtami do granicy limitu: rozmiar połowiony po każdym nieudanym zapisie, więc
      // pętla kończy się dopiero, gdy nie mieści się nawet 1 B. Bez navigator.storage.estimate(): Chromium 149 (CI)
      // podaje tam ok. 10 GiB wolnego mimo limitu z CDP, choć zapisy są już odrzucane.
      const wypelnienie = await page.evaluate(async () => {
        const c = await caches.open('wypelniacz-testu');
        const losowe = (n) => {
          const a = new Uint8Array(n);
          for (let o = 0; o < n; o += 65_536) crypto.getRandomValues(a.subarray(o, Math.min(n, o + 65_536)));
          return a;
        };
        let rozmiar = 4 << 20;
        let i = 0;
        let odrzucony = false;
        let ostatniBajtSieZmiescil = null;
        while (rozmiar >= 1) {
          const k = `/__wypelniacz/${i}`;
          let ok = false;
          try {
            await c.put(k, new Response(losowe(rozmiar)));
            const m = await c.match(k);
            ok = Boolean(m) && (await m.arrayBuffer()).byteLength === rozmiar;
          } catch (_) {
            odrzucony = true;
          }
          if (rozmiar === 1) ostatniBajtSieZmiescil = ok;
          if (ok) i += 1;
          else { await c.delete(k).catch(() => {}); rozmiar = Math.floor(rozmiar / 2); }
        }
        return { odrzucony, wpisy: i, ostatniBajtSieZmiescil };
      });
      expect(wypelnienie.odrzucony, 'źródło doszło do limitu').toBe(true);
      expect(wypelnienie.wpisy, 'wypełniacz zajął miejsce').toBeGreaterThan(0);
      expect(wypelnienie.ostatniBajtSieZmiescil, 'nie mieści się nawet 1 B').toBe(false);

      // 1. Strona bez kopii: zapis się nie mieści, ale odpowiedź z sieci dochodzi do strony.
      await page.goto(`${serwer.adres}/index.html`, { waitUntil: 'load' });
      await expect(page).toHaveTitle('wagaiwzrost.pl');
      expect(await bajtyWpisu(page, '/index.html'), 'kopia się nie zmieściła — nie ma też pustej').toBeNull();

      // 2. Dobra kopia przy pełnym limicie: odświeżenie w tle jej nie psuje.
      await page.goto(`${serwer.adres}/kontakt.html`, { waitUntil: 'load' });
      await expect(page).toHaveTitle(/Kontakt/);
      await page.waitForTimeout(2_000);
      expect(await bajtyWpisu(page, '/kontakt.html')).toBe(kopiaKontaktu);
    } finally {
      await serwer.zatrzymaj();
    }

    const sonda = await page.evaluate(() => fetch(`/README.md?sonda-offline=${Date.now()}`).then(() => 'sieć jest', () => 'brak sieci'));
    expect(sonda, 'serwer zatrzymany — sieci nie ma').toBe('brak sieci');
    await page.goto(`${serwer.adres}/kontakt.html`, { waitUntil: 'load' });
    await expect(page).toHaveTitle(/Kontakt/);
    expect((await page.locator('body').innerText()).trim().length, 'strona offline nie jest pusta').toBeGreaterThan(100);
  } finally {
    await kontekst.close();
    fs.rmSync(katalogProfilu, { recursive: true, force: true });
  }
});
