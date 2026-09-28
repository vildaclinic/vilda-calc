import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// P-SW-DOCPRO (zlecenie właściciela 2026-09-28): DocPro nie startował offline.
//
// Test używa PRAWDZIWEGO service workera (pełne tablice precache, nie przycięty wariant
// z /__test-service-worker-kalorii.js) i PRAWDZIWEGO braku sieci. Trzy decyzje pomiaru:
//
// 1. Brak sieci = zatrzymany serwer. context.setOffline(true) nie odcinał niezawodnie sieci service
//    workera (zmierzone w tej racie na Chromium 141 z Playwright 1.61.1): po nawigacji fetch z SW
//    znów dochodził do serwera, więc strona „działała offline", ciągnąc brakujące pliki z sieci.
//    Test stawia własny serwer, po instalacji SW go zabija, a sonda (fetch adresu spoza precache)
//    pilnuje, że sieci naprawdę nie ma — przed obchodem i po nim.
// 2. Profil trwały, nie incognito. Pełny precache zajmuje w Chromium ok. 1,2 GB, a limit pamięci
//    źródła w kontekście incognito jest losowany (zmierzone 0,91 i 1,12 GB na maszynie z 16 GB RAM):
//    przy niskim losie nie mieści się nawet wymagany rdzeń. Profil trwały ma limit liczony od dysku.
//    Zachowanie przy wyczerpanym limicie mierzy tests/unit/sw-precache-stron.test.mjs.
// 3. SW rejestruje pusta strona (fixture), nie DocPro: każda strona otwiera się pierwszy raz dopiero
//    bez sieci, więc nic nie ratuje jej z cache czasu działania — liczy się tylko wstępne pobranie.
//
// Poza zakresem: zasoby obcego pochodzenia (np. Google Fonts) nie są częścią precache — test liczy
// wyłącznie żądania do własnego serwera.

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Strony, które SW obiecuje offline: dokument główny i strony HTML z OPTIONAL_DOCUMENTS — czytane
// z pliku SW, żeby lista nie rozjechała się z tablicą. DocPro pierwszy, bo o niego było zgłoszenie.
const ZRODLO_SW = fs.readFileSync(path.join(korzen, 'service-worker-kalorii.js'), 'utf8');
const DOKUMENTY_SW = [.../const OPTIONAL_DOCUMENTS = \[([\s\S]*?)\n\];/.exec(ZRODLO_SW)[1].matchAll(/'(\/[^']+\.html)'/g)]
  .map((m) => m[1]);
const STRONY = [...new Set(['/docpro.html', '/index.html', ...DOKUMENTY_SW])];

// Adresy, które offline ŚWIADOMIE nie działają — każdy z powodem.
const POMIJANE = [
  // SW omija filmy (shouldBypassCache) — nie są i nie mają być w pamięci.
  { wzorzec: /^\/videos\//, powod: 'filmy są poza cache z założenia' },
  // Plakaty filmów są w tablicy precache, ale plików nie ma w repozytorium (404 także online).
  { wzorzec: /^\/posters\//, powod: 'brak plików w repozytorium' },
  // Wyjątek opisany w tests/unit/sw-precache-stron.test.mjs (klucz dokumentu bez ?v=).
  { wzorzec: /^\/lab_pin_result\.js\?v=/, powod: 'lab_pin_result.js w OPTIONAL_DOCUMENTS' },
];

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

// Czeka, aż strona (z ramkami) nie ma żądań w toku przez `ciszaMs` — zamiast stałego odczekania,
// które pod obciążeniem pełnego zestawu okazało się za krótkie (ramki paneli app.html). Limit chroni
// przed stroną, która odpytuje coś bez końca.
function sledzRuch(page) {
  const stan = { wToku: 0, ostatni: Date.now() };
  page.on('request', () => { stan.wToku += 1; stan.ostatni = Date.now(); });
  const koniec = () => { stan.wToku = Math.max(0, stan.wToku - 1); stan.ostatni = Date.now(); };
  page.on('requestfinished', koniec);
  page.on('requestfailed', koniec);
  return async (ciszaMs = 1_000, limitMs = 10_000) => {
    const start = Date.now();
    while (Date.now() - start < limitMs) {
      if (stan.wToku === 0 && Date.now() - stan.ostatni >= ciszaMs) return;
      await page.waitForTimeout(100);
    }
  };
}

test('prawdziwy SW bez sieci: DocPro i pozostałe strony z precache startują bez brakujących zasobów', async ({ playwright, browserName, launchOptions }) => {
  // Instalacja pełnego precache to ok. 2,5 tys. pobrań po kolei (lokalnie ~55 s, pod obciążeniem
  // pełnego zestawu ~90 s), potem ~20 stron — każda najwyżej 10 s na uspokojenie ruchu.
  test.setTimeout(420_000);
  expect(STRONY.length, 'lista stron czytana z OPTIONAL_DOCUMENTS').toBeGreaterThan(15);

  const katalogProfilu = fs.mkdtempSync(path.join(os.tmpdir(), 'vilda-sw-offline-'));
  const kontekst = await playwright[browserName].launchPersistentContext(katalogProfilu, { ...launchOptions, locale: 'pl-PL' });
  const serwer = await uruchomSerwer();
  try {
    const page = kontekst.pages()[0] || await kontekst.newPage();
    try {
      await page.goto(`${serwer.adres}/tests/fixtures/service-worker-runner.html`);
      const stan = await page.evaluate(async () => {
        const rejestracja = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
        const sw = rejestracja.installing || rejestracja.waiting || rejestracja.active;
        const koniec = () => sw.state === 'activated' || sw.state === 'redundant';
        if (!koniec()) {
          await new Promise((ok) => {
            sw.addEventListener('statechange', () => { if (koniec()) ok(); });
          });
        }
        return sw.state;
      });
      expect(stan, 'instalacja pełnego precache').toBe('activated');
    } finally {
      await serwer.zatrzymaj();
    }

    const sonda = () => page.evaluate(() => fetch(`/README.md?sonda-offline=${Date.now()}`).then(() => 'sieć jest', () => 'brak sieci'));
    expect(await sonda(), 'serwer zatrzymany — sieci nie ma').toBe('brak sieci');

    const nieudane = [];
    const bledy = [];
    const cisza = sledzRuch(page);
    page.on('requestfailed', (zadanie) => {
      const url = new URL(zadanie.url());
      const adres = `${url.pathname}${url.search}`;
      if (url.origin !== serwer.adres || url.searchParams.has('sonda-offline')) return;
      if (POMIJANE.some(({ wzorzec }) => wzorzec.test(adres))) return;
      // Brak w pamięci SW kończy się net::ERR_FAILED (Response.error()). net::ERR_ABORTED to żądanie
      // przerwane nawigacją — zmierzone w pełnym przebiegu e2e, gdy ramki app.html jeszcze się ładowały.
      if (zadanie.failure()?.errorText === 'net::ERR_ABORTED') return;
      nieudane.push(`${new URL(page.url()).pathname}: ${adres} (${zadanie.failure()?.errorText})`);
    });
    page.on('pageerror', (blad) => bledy.push(`${new URL(page.url()).pathname}: ${blad.message}`));

    for (const strona of STRONY) {
      await page.goto(`${serwer.adres}${strona}`, { waitUntil: 'load' });
      // Doładowania leniwe (moduły sejfu z vilda_chrome.js, ramki paneli app.html) ruszają po zdarzeniu
      // load — przechodzimy dalej dopiero, gdy strona przestaje prosić o zasoby.
      await cisza();
      if (strona === '/docpro.html') {
        await expect.poll(() => page.evaluate(() => typeof window.VildaVault), { message: 'sejf DocPro offline' }).toBe('object');
      }
    }

    expect(await sonda(), 'po całym obchodzie sieci nadal nie ma').toBe('brak sieci');
    expect(nieudane, `zasoby, których offline zabrakło:\n${nieudane.join('\n')}`).toEqual([]);
    expect(bledy, `błędy stron offline:\n${bledy.join('\n')}`).toEqual([]);
  } finally {
    await serwer.zatrzymaj();
    await kontekst.close();
    fs.rmSync(katalogProfilu, { recursive: true, force: true });
  }
});
