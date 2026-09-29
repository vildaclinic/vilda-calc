// P-SW-PRECACHE: pomiar instalacji i aktualizacji PRAWDZIWEGO service workera (pełne tablice precache) w Chromium na
// profilu trwałym. Nie wchodzi do `npm test` — to narzędzie do dowodu przy zmianie precache (liczby w PR i w
// docs/clinical/ALGORITHMS.md, wpis P-SW-PRECACHE).
//
//   node tests/scripts/pomiar-instalacji-sw.mjs [--nazwa X] [--kwota MiB] [--rate Mb/s] [--lat ms]
//        [--aktualizacja] [--offline] [--przed plik-sw.js] [--limit-min N]
//
//   --kwota        limit pamięci źródła (CDP Storage.overrideQuotaForOrigin);
//   --rate, --lat  dławienie łącza i opóźnienie na żądanie (serwer tests/support/serwer-pomiarowy.mjs);
//   --aktualizacja po instalacji rejestruje ten sam SW z następną wersją (przejście N → N+1);
//   --przed        pierwszą instalację robi podany starszy plik SW (np. `git show <ref>:service-worker-kalorii.js`),
//                  a aktualizację — SW z drzewa roboczego (scenariusz migracji);
//   --offline      po instalacji zatrzymuje serwer i otwiera DocPro, stronę główną, Klirens i Ustawienia.
// Wynik: test-results/pomiar-sw/<nazwa>.json i .log. Chromium: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH albo Playwright.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const arg = (n, d = null) => { const i = process.argv.indexOf(n); return i >= 0 ? process.argv[i + 1] : d; };
const flaga = (n) => process.argv.includes(n);
const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const NAZWA = arg('--nazwa', 'pomiar');
const KWOTA = arg('--kwota') ? Number(arg('--kwota')) : null;
const RATE = arg('--rate') ? Math.round((Number(arg('--rate')) * 1e6) / 8) : 0;
const LAT = Number(arg('--lat', 0));
const PRZED = arg('--przed') ? path.resolve(arg('--przed')) : '';
const LIMIT_MS = Number(arg('--limit-min', 20)) * 60_000;
const WYNIKI = path.join(korzen, 'test-results/pomiar-sw');
fs.mkdirSync(WYNIKI, { recursive: true });

const wersjaZ = (plik) => /const SW_VERSION = '([^']+)'/.exec(fs.readFileSync(plik, 'utf8'))[1];
const WERSJA = PRZED ? wersjaZ(PRZED) : wersjaZ(path.join(korzen, 'service-worker-kalorii.js'));
const log = (tekst) => { const w = `[${NAZWA} ${new Date().toISOString().slice(11, 19)}] ${tekst}`; console.log(w); fs.appendFileSync(path.join(WYNIKI, `${NAZWA}.log`), `${w}\n`); };

async function serwer() {
  const proces = spawn(process.execPath, [path.join(korzen, 'tests/support/serwer-pomiarowy.mjs')], {
    env: { ...process.env, ROOT: korzen, RATE: String(RATE), LAT: String(LAT), SW_PRZED: PRZED, PORT: '0' },
    stdio: ['ignore', 'pipe', 'inherit'],
  });
  const adres = await new Promise((ok) => { proces.stdout.on('data', (d) => { const m = /http:\/\/127\.0\.0\.1:\d+/.exec(String(d)); if (m) ok(m[0]); }); });
  return { adres, stop: () => new Promise((ok) => { if (proces.exitCode !== null) { ok(); return; } proces.once('exit', ok); proces.kill('SIGKILL'); }) };
}

const profil = fs.mkdtempSync(path.join(os.tmpdir(), `vilda-pomiar-sw-${NAZWA}-`));
const kontekst = await chromium.launchPersistentContext(profil, { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, headless: true });
const srv = await serwer();
const page = kontekst.pages()[0] || await kontekst.newPage();
const stanSerwera = async () => (await fetch(`${srv.adres}/__pomiar/stan`)).json();
const wynik = { nazwa: NAZWA, wersja: WERSJA, przed: Boolean(PRZED), kwotaMiB: KWOTA, rateMbps: RATE ? (RATE * 8) / 1e6 : null, latMs: LAT };

const probka = (wersja) => page.evaluate(async (w) => {
  const reg = await navigator.serviceWorker.getRegistration('/');
  const e = await navigator.storage.estimate();
  const nazwa = `pwa-kalorii-shell-v${w}`;
  const wpisy = (await caches.has(nazwa)) ? (await (await caches.open(nazwa)).keys()).length : null;
  return { installing: reg?.installing?.state || null, waiting: reg?.waiting?.state || null, active: reg?.active?.state || null, uzycieMiB: Math.round(e.usage / 1048576), wpisy, pamieci: await caches.keys() };
}, wersja);

async function zarejestrujICzekaj(wersja, zapytanie, etap) {
  await fetch(`${srv.adres}/__pomiar/reset`);
  await page.evaluate((u) => { navigator.serviceWorker.register(u, { scope: '/' }).catch(() => {}); }, `/service-worker-kalorii.js?wersja=${wersja}${zapytanie}`);
  const t0 = Date.now();
  let szczyt = 0; let widziana = false; let p;
  for (;;) {
    await page.waitForTimeout(2000);
    p = await probka(wersja);
    szczyt = Math.max(szczyt, p.uzycieMiB);
    if (p.installing) widziana = true;
    const s = await stanSerwera();
    const sek = Math.round((Date.now() - t0) / 1000);
    if (sek % 20 < 2) log(`${etap} ${sek}s: installing=${p.installing} waiting=${p.waiting} active=${p.active} wpisy=${p.wpisy} użycie=${p.uzycieMiB} MiB; serwer ${s.zadania} żądań, ${(s.bajty / 1e6).toFixed(0)} MB`);
    if (((widziana || Date.now() - t0 > 15_000) && !p.installing) || Date.now() - t0 > LIMIT_MS) {
      return { sekundy: sek, szczytMiB: szczyt, uzycieMiB: p.uzycieMiB, wpisy: p.wpisy, stan: { waiting: p.waiting, active: p.active }, pamieci: p.pamieci, zadania: s.zadania, pobraneMB: Math.round(s.bajty / 1e6), limitCzasu: Date.now() - t0 > LIMIT_MS };
    }
  }
}

try {
  if (KWOTA) await (await kontekst.newCDPSession(page)).send('Storage.overrideQuotaForOrigin', { origin: srv.adres, quotaSize: KWOTA * 1024 * 1024 });
  await page.goto(`${srv.adres}/tests/fixtures/service-worker-runner.html`);
  log(`start: SW ${WERSJA}${PRZED ? ` (starszy plik: ${path.basename(PRZED)})` : ''}, limit ${KWOTA ? `${KWOTA} MiB` : 'przeglądarki'}, łącze ${wynik.rateMbps || 'bez dławienia'} Mb/s, opóźnienie ${LAT} ms`);
  wynik.instalacja = await zarejestrujICzekaj(WERSJA, PRZED ? '&przed=1' : '', 'instalacja');
  wynik.instalacja.sukces = wynik.instalacja.stan.active === 'activated';
  log(`instalacja: ${wynik.instalacja.sukces ? 'OK' : 'NIEUDANA'} w ${wynik.instalacja.sekundy} s; ${wynik.instalacja.zadania} żądań, ${wynik.instalacja.pobraneMB} MB; pamięć ${wynik.instalacja.uzycieMiB} MiB (szczyt ${wynik.instalacja.szczytMiB})`);

  if (flaga('--aktualizacja') && wynik.instalacja.sukces) {
    const nowa = PRZED ? wersjaZ(path.join(korzen, 'service-worker-kalorii.js')) : `${WERSJA}-nast`;
    await page.reload();
    wynik.aktualizacja = await zarejestrujICzekaj(nowa, '', 'aktualizacja');
    wynik.aktualizacja.sukces = Boolean(wynik.aktualizacja.stan.waiting);
    log(`aktualizacja do ${nowa}: ${wynik.aktualizacja.sukces ? 'OK (czeka na aktywację)' : 'NIEUDANA'} w ${wynik.aktualizacja.sekundy} s; ${wynik.aktualizacja.zadania} żądań, ${wynik.aktualizacja.pobraneMB} MB; szczyt pamięci ${wynik.aktualizacja.szczytMiB} MiB`);
  }

  if (flaga('--offline') && wynik.instalacja.sukces) {
    await srv.stop();
    wynik.offline = { sonda: await page.evaluate(() => fetch(`/README.md?sonda=${Date.now()}`).then(() => 'sieć', () => 'brak sieci')), strony: {} };
    for (const strona of ['/docpro.html', '/index.html', '/kalkulator-klirens.html', '/ustawienia.html']) {
      const nieudane = [];
      const nasluch = (z) => { const u = new URL(z.url()); if (u.origin === srv.adres && !/^\/(videos|posters)\//.test(u.pathname) && z.failure()?.errorText !== 'net::ERR_ABORTED') nieudane.push(`${u.pathname}${u.search}`); };
      page.on('requestfailed', nasluch);
      try { await page.goto(`${srv.adres}${strona}`, { waitUntil: 'load', timeout: 30_000 }); await page.waitForTimeout(2500); } catch (e) { nieudane.push(`nawigacja: ${String(e.message).split('\n')[0]}`); }
      page.off('requestfailed', nasluch);
      wynik.offline.strony[strona] = { ok: nieudane.length === 0, nieudane: nieudane.slice(0, 10) };
    }
    log(`offline (sonda: ${wynik.offline.sonda}): ${Object.entries(wynik.offline.strony).map(([s, r]) => `${s} ${r.ok ? 'OK' : `BRAKI ${r.nieudane.length}`}`).join(', ')}`);
  }
} catch (e) {
  wynik.blad = String(e.stack || e);
  log(`BŁĄD: ${wynik.blad.split('\n')[0]}`);
} finally {
  fs.writeFileSync(path.join(WYNIKI, `${NAZWA}.json`), `${JSON.stringify(wynik, null, 2)}\n`);
  await kontekst.close().catch(() => {});
  await srv.stop();
  fs.rmSync(profil, { recursive: true, force: true });
}
