import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { expect, test } from '@playwright/test';

// Projekt desktop-chromium domyślnie blokuje SW (playwright.config.mjs), a launchPersistentContext
// dziedziczy tę opcję; ten plik sprawdza prawdziwy SW, więc go włącza.
test.use({ serviceWorkers: 'allow' });

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
// 2. Profil trwały, nie incognito. Do SW 1.1.104 pełny precache zajmował w Chromium ok. 1,2 GB, a limit pamięci
//    źródła w kontekście incognito jest losowany (zmierzone 0,91 i 1,12 GB na maszynie z 16 GB RAM):
//    przy niskim losie nie mieścił się nawet wymagany rdzeń. Od P-SW-PRECACHE instalacja bierze tylko wpisy
//    bieżące (ok. 50 MiB), ale profil trwały zostaje — to warunki użytkownika, a limit nie jest wtedy losowy.
//    Zachowanie przy wyczerpanym limicie mierzą tests/unit/sw-precache-stron.test.mjs i pwa-precache-migracja.spec.mjs.
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
  // P-SW-LAB-PIN (2026-09-29): lab_pin_result.js?v=4 jest już w precache — wyjątek usunięty, więc ten test
  // pilnuje, że Przelicznik jednostek ładuje go offline.
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
  // Instalacja to ok. 400 pobrań po kolei (P-SW-PRECACHE; do SW 1.1.104 ok. 2,5 tys. — lokalnie ~55 s, pod obciążeniem
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
      if (strona === '/docpro.html' || strona === '/index.html') {
        await expect.poll(() => page.evaluate(() => typeof window.VildaBoneAge?.restoreContext),
          { message: 'model pochodzenia wieku kostnego działa bez sieci' }).toBe('function');
      }
      if (strona === '/docpro.html') {
        await expect.poll(() => page.evaluate(() => typeof window.VildaVault), { message: 'sejf DocPro offline' }).toBe('object');
      }
      if (strona === '/przelicznik-jednostek.html') {
        // All diagram resources must come from the production precache. The
        // converter has never been opened online, and its server is stopped.
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'F', age: 12, ageMonths: 0 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await page.locator('#labSubstance').fill('AMH');
        await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
        const wykres = page.locator('#labHormoneLifespan');
        await expect(wykres).toBeVisible();
        await expect(wykres.locator('[data-hormone="amh"]')).toHaveAttribute('aria-pressed', 'true');
        await expect(wykres.locator('[data-patient-age-marker]')).toHaveAttribute('data-patient-age-marker', '12');
        await wykres.locator('[data-hormone="inhb"]').click();
        await expect(wykres.locator('[data-hormone="inhb"]')).toHaveAttribute('aria-pressed', 'true');
        await page.reload({ waitUntil: 'load' });
        await page.locator('#labSubstance').fill('AMH');
        await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
        await expect(wykres).toBeVisible();
        await expect(wykres.locator('[data-hormone="amh"]')).toHaveAttribute('aria-pressed', 'true');
        // The quantitative module and sources must also start from precache,
        // including after a reload while the server remains stopped.
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'M', age: 40, ageMonths: 0 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await page.locator('#labSubstance').fill('Testosteron');
        await page.locator('#labSubstanceDropdown [data-id="testosterone_total"]').click();
        await page.locator('#labUnit').selectOption('nmol/L');
        await page.locator('#labValue').fill('13');
        const punkt = wykres.locator('[data-patient-concentration="t"]');
        await expect(punkt).toHaveAttribute('data-value', '13');
        await expect.poll(async () => Number(await punkt.getAttribute('data-median'))).toBeCloseTo(18.1, 3);
        await wykres.locator('[data-view="puberty"]').click();
        await expect(punkt).toHaveCount(0);
        await wykres.locator('[data-view="life"]').click();
        await expect(punkt).toHaveAttribute('data-value', '13');
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'M', age: 5, ageMonths: 6 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await page.locator('#labSubstance').fill('AMH');
        await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
        await page.locator('#labUnit').selectOption('ng/mL');
        await page.locator('#labValue').fill('99.18');
        const amh = wykres.locator('[data-patient-concentration="amh"]');
        await expect(amh).toHaveAttribute('data-profile', 'wang2020-male-amh-age-5');
        await expect.poll(async () => Number(await amh.getAttribute('data-median'))).toBeCloseTo(99.18 / .1401, 6);
        await expect(wykres.locator('[data-lifespan="source-copy"] p').filter({ hasText: 'Odniesienie dla wyniku:' })).toContainText('5–<6 lat');
        await expect(wykres.locator('[data-lifespan="scale-note"]')).toContainText('Linia jest poglądowa.');
        const amhLine = wykres.locator('[data-stable-reference-line="amh"]');
        await expect(amhLine).toHaveAttribute('data-divisor', '1335.592934');
        const amhPath = await amhLine.getAttribute('d');
        await page.locator('#labValue').fill('10000');
        await expect(amh).toHaveAttribute('data-offscale', 'above');
        await expect(amh.locator('[data-result-overflow]')).toHaveCount(1);
        await expect(amhLine).toHaveAttribute('d', amhPath);
        await page.locator('#labValue').fill('');
        await expect(amh).toHaveCount(0);
        await expect(amhLine).toHaveAttribute('d', amhPath);
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'M', age: 44, ageMonths: 0 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await page.locator('#labValue').fill('5.77');
        await expect(amh).toHaveAttribute('data-profile', 'tehrani2017-male-amh');
        await expect.poll(async () => Number(await amh.getAttribute('data-median')) * .1401).toBeCloseTo(5.77, 8);
        await expect(amhLine).toHaveAttribute('d', amhPath);
        // The new observation renderer is a separate script. Verify its
        // actual numeric output after offline reload, not just its global.
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'M', age: 0, ageMonths: 3 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await page.locator('#labSubstance').fill('Inhibina B');
        await page.locator('#labSubstanceDropdown [data-id="inhibin_b"]').click();
        await page.locator('#labValue').fill('250');
        await wykres.locator('[data-view="mini"]').click();
        const obserwacje = wykres.locator('[data-lifespan="observations"]');
        await expect(obserwacje.locator('[data-inhibin-observation="mini"]')).toBeVisible();
        await expect(obserwacje.locator('[data-observation-series]')).toHaveCount(2);
        await expect(obserwacje.locator('[data-observation-point]')).toHaveCount(4);
        await expect(obserwacje.locator('[data-observation-series="term-male"] [data-observation-point="month3"]'))
          .toHaveAttribute('data-value', '335.5');
        await expect(obserwacje.locator('[data-observation-series="preterm-male"] [data-observation-point="day7"]'))
          .toHaveAttribute('data-value', '201.1');
        // The independent display spline must also load from precache. Its
        // shape and scale stay fixed offline when a result is added/removed.
        await page.evaluate(() => {
          window.VildaPersistence.writeShared({ sex: 'M', age: 44, ageMonths: 0 }, { force: true });
          document.dispatchEvent(new CustomEvent('vilda:session-changed'));
        });
        await wykres.locator('[data-view="life"]').click();
        await page.locator('#labValue').fill('');
        const stabilnaKrzywa = wykres.locator('[data-stable-reference-line="inhb"]');
        await expect(stabilnaKrzywa).toHaveCount(1);
        await expect(stabilnaKrzywa).toHaveAttribute('data-divisor', '309.779035');
        const przebieg = await stabilnaKrzywa.getAttribute('d');
        expect(przebieg).toContain('C');
        await page.locator('#labValue').fill('88');
        const inhibina = wykres.locator('[data-patient-concentration="inhb"]');
        await expect(inhibina).toHaveAttribute('data-value', '88');
        await expect.poll(async () => Number(await inhibina.getAttribute('data-median')))
          .toBeCloseTo(162.08470588235292, 10);
        await expect(stabilnaKrzywa).toHaveAttribute('d', przebieg);
        // The approved LH/FSH data and fixed display policy must survive a
        // real offline start too, including the independent source marker.
        for (const [id, label, reference, divisor] of [
          ['lh', 'LH', 3.91, 5.57], ['fsh', 'FSH', 4.56, 8.4178]
        ]) {
          await page.locator('#labSubstance').fill(label);
          await page.locator(`#labSubstanceDropdown [data-id="${id}"]`).click();
          await page.locator('#labUnit').selectOption('IU/L');
          await page.locator('#labValue').fill('');
          const line = wykres.locator(`[data-stable-reference-line="${id}"]`);
          await expect(line).toHaveAttribute('data-divisor', String(divisor));
          const emptyPath = await line.getAttribute('d');
          await page.locator('#labValue').fill('2');
          const result = wykres.locator(`[data-patient-concentration="${id}"]`);
          await expect(result).toHaveAttribute('data-value', '2');
          await expect.poll(async () => Number(await result.getAttribute('data-reference-value')))
            .toBeCloseTo(reference, 8);
          await expect(line).toHaveAttribute('d', emptyPath);
          await page.locator('#labValue').fill('');
          await expect(line).toHaveAttribute('d', emptyPath);
        }
        // INSL3 is an illustration, including after a first offline start.
        // Its retained infant evidence must not silently enable a result point.
        await wykres.locator('[data-hormone="insl3"]').click();
        await wykres.locator('[data-hormone="fsh"]').click();
        await wykres.locator('[data-view="mini"]').click();
        const insl3 = wykres.locator('[data-stable-reference-line="insl3"]');
        await expect(insl3).toHaveAttribute('stroke-dasharray', '6 5');
        const peak = await insl3.evaluate(path => {
          const rect = path.ownerSVGElement.querySelector('[data-sector="mini"]');
          const x = Number(rect.getAttribute('x')) + Number(rect.getAttribute('width')) * 27 / 365.25;
          let low = 0, high = path.getTotalLength();
          for (let i = 0; i < 27; i++) {
            const middle = (low + high) / 2;
            if (path.getPointAtLength(middle).x < x) low = middle; else high = middle;
          }
          return (Number(rect.getAttribute('y')) + Number(rect.getAttribute('height')) -
            path.getPointAtLength((low + high) / 2).y) / Number(rect.getAttribute('height'));
        });
        expect(peak).toBeCloseTo(.14, 3);
        for (const value of [null, .04]) {
          await page.evaluate(value => window.VildaHormoneLifespanRuntime.update({
            analyte: 'insl3', sex: 'male', ageYears: 30 / 365.25, preterm: 'no',
            sourceStatus: 'ready', identityKey: 'fictional-offline-insl3',
            measurement: value === null ? null : { value, unit: 'ug/L', operator: '=' },
          }), value);
          await expect(wykres.locator('[data-patient-concentration="insl3"], [data-reference-line="insl3"]')).toHaveCount(0);
        }
        await expect(insl3).toBeVisible();
        // The approved AMH comparison must start from the real precache too.
        // Population lines retain one common scale even without a qualified dot.
        const infantAmh = {
          analyte: 'amh', sex: 'female', ageYears: 90 / 365.25, preterm: 'no',
          sourceStatus: 'ready', identityKey: 'fictional-offline-amh-comparison',
          measurement: null,
        };
        await page.evaluate(context => window.VildaHormoneLifespanRuntime.update(context), infantAmh);
        await wykres.getByRole('button', { name: 'Porównaj płcie', exact: true }).click();
        const amhComparison = wykres.locator('[data-comparison-curve="amh"]');
        await expect(amhComparison).toHaveCount(2);
        await expect(wykres.locator('[data-lifespan="scale-note"]')).toContainText('10×');
        const fixedAmhPaths = await amhComparison.evaluateAll(paths => paths.map(path => path.getAttribute('d')));
        for (const value of [1.5, 10000, 0, null]) {
          await page.evaluate(({ context, value }) => window.VildaHormoneLifespanRuntime.update({
            ...context, measurement: value === null ? null : { value, unit: 'ng/mL', operator: '=' },
          }), { context: infantAmh, value });
          await expect.poll(() => amhComparison.evaluateAll(paths => paths.map(path => path.getAttribute('d'))))
            .toEqual(fixedAmhPaths);
          if (value === null) await expect(wykres.locator('[data-patient-concentration="amh"]')).toHaveCount(0);
          else if (value === 0 || value === 10000)
            await expect(wykres.locator('[data-result-overflow]')).toHaveAttribute('data-result-overflow', value === 0 ? 'below' : 'above');
          else await expect(wykres.locator('[data-result-point]')).toHaveCount(1);
        }
        // INHB uses the same fixed concentration axis for both periods. The
        // scoped female puberty source must be available after a real offline
        // reload and remain separate from the ordinary age-8–20 source below.
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.VildaHormoneLifespanRuntime &&
          window.VildaHormoneLifespanDisplay?.buildInhibinComparison);
        for (const [period, ageYears, profile, reference] of [
          ['mini', 90 / 365.25, 'ljubicic2022-female-inhb', 49.4717876166],
          ['puberty', 14, 'borelli2025-female-inhb-puberty-comparison', 46],
        ]) {
          const context = { analyte: 'inhibin_b', sex: 'female', ageYears, preterm: 'no',
            sourceStatus: 'ready', identityKey: 'fictional-offline-inhibin-comparison', measurement: null };
          await page.evaluate(context => window.VildaHormoneLifespanRuntime.update(context), context);
          await wykres.locator(`[data-view="${period}"]`).click();
          if (await wykres.locator('.vhl-compare-toggle').getAttribute('aria-pressed') !== 'true')
            await wykres.locator('.vhl-compare-toggle').click();
          const curves = wykres.locator('[data-comparison-curve="inhb"]');
          await expect(curves).toHaveCount(2);
          await expect(wykres.locator('[data-lifespan="chart"]')).toHaveAttribute('data-comparison-max', '400');
          const fixedPaths = await curves.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
          const result = wykres.locator('[data-patient-concentration="inhb"]');
          for (const value of [0, 40, 1000, null]) {
            await page.evaluate(({ context, value }) => window.VildaHormoneLifespanRuntime.update({
              ...context, measurement: value === null ? null : { value, unit: 'pg/mL' },
            }), { context, value });
            await expect.poll(() => curves.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(fixedPaths);
            if (value === null) await expect(result).toHaveCount(0);
            else {
              await expect(result).toHaveAttribute('data-profile', profile);
              await expect.poll(async () => Number(await result.getAttribute('data-reference-value'))).toBeCloseTo(reference, 8);
              if (value > 400) await expect(result.locator('[data-result-overflow]')).toHaveAttribute('data-result-overflow', 'above');
              else await expect(result.locator('[data-result-point]')).toHaveCount(1);
            }
          }
        }
        await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({
          analyte: 'inhibin_b', sex: 'female', ageYears: 14, sourceStatus: 'ready',
          identityKey: 'fictional-offline-inhibin-comparison', measurement: { value: 40, unit: 'pg/mL' },
        }));
        await expect(wykres.locator('[data-patient-concentration="inhb"]')).toHaveCount(1);
        await wykres.locator('[data-view="life"]').click();
        const ordinaryInhibin = wykres.locator('[data-patient-concentration="inhb"]');
        await expect(ordinaryInhibin).toHaveAttribute('data-profile', 'borelli2025-female-inhb-age-8-20');
        await expect(ordinaryInhibin).toHaveAttribute('data-value', '40');
        await expect(ordinaryInhibin).toHaveAttribute('data-reference-value', '46');
        await expect(ordinaryInhibin).toHaveAttribute('data-divisor', '52.474');
        await expect(ordinaryInhibin).toHaveAttribute('data-ceiling', '1');
        await expect(ordinaryInhibin.locator('[data-median-point]')).toHaveCount(1);
        await expect(ordinaryInhibin.locator('[data-result-point]')).toHaveCount(1);
        await expect(ordinaryInhibin.locator('[data-result-overflow]')).toHaveCount(0);
        expect(await page.evaluate(() => {
          const result = window.VildaHormoneLifespanReference.evaluate(window.VildaHormoneLifespanData, {
            analyte: 'inhibin_b', sex: 'female', ageYears: 14, measurement: { value: 40, unit: 'pg/mL' },
          });
          return { status: result.status, profile: result.profile?.id, value: result.value, reference: result.referenceValue };
        })).toEqual({ status: 'ready', profile: 'borelli2025-female-inhb-age-8-20', value: 40, reference: 46 });
        const ordinaryInhibinLines = wykres.locator('[data-female-stable-line="inhb"]');
        const ordinaryInhibinPaths = await ordinaryInhibinLines.evaluateAll(paths => paths.map(path => path.getAttribute('d')));
        expect(ordinaryInhibinPaths.length).toBeGreaterThan(0);
        await page.evaluate(() => window.VildaHormoneLifespanRuntime.update({
          analyte: 'inhibin_b', sex: 'female', ageYears: 14, sourceStatus: 'ready',
          identityKey: 'fictional-offline-inhibin-comparison', measurement: { value: 80, unit: 'pg/mL' },
        }));
        await expect(ordinaryInhibin).toHaveAttribute('data-profile', 'borelli2025-female-inhb-age-8-20');
        await expect(ordinaryInhibin).toHaveAttribute('data-value', '80');
        await expect(ordinaryInhibin).toHaveAttribute('data-reference-value', '46');
        await expect(ordinaryInhibin).toHaveAttribute('data-divisor', '52.474');
        await expect(ordinaryInhibin).toHaveAttribute('data-ceiling', '1');
        await expect(ordinaryInhibin.locator('[data-median-point]')).toHaveCount(1);
        await expect(ordinaryInhibin.locator('[data-result-point]')).toHaveCount(0);
        await expect(ordinaryInhibin.locator('[data-result-overflow]')).toHaveAttribute('data-result-overflow', 'above');
        await expect.poll(() => ordinaryInhibinLines.evaluateAll(paths => paths.map(path => path.getAttribute('d'))))
          .toEqual(ordinaryInhibinPaths);
        // The female longitudinal mean is packaged locally too. An offline
        // result never calibrates this unitless model into a concentration.
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.VildaHormoneLifespanRuntime &&
          window.VildaHormoneLifespanDisplay?.buildFemaleGonadotropins);
        const infantLh = { analyte: 'lh', sex: 'female', ageYears: 165 / 365.25,
          preterm: 'no', sourceStatus: 'ready', identityKey: 'fictional-offline-two-wave-lh' };
        await page.evaluate(context => window.VildaHormoneLifespanRuntime.update({
          ...context, measurement: { value: .3, unit: 'IU/L' },
        }), infantLh);
        await wykres.locator('[data-view="mini"]').click();
        await expect(wykres.locator('[data-lifespan="scale-note"]')).toContainText('100%');
        await expect(wykres.locator('[data-lifespan="scale-note"]')).toContainText('0,3 IU/L');
        await expect(wykres.locator('[data-patient-concentration]')).toHaveCount(0);
        await expect(wykres.locator('[data-patient-age-marker]')).toHaveCount(1);
        const relativePath = await wykres.locator('[data-line="lh"]').getAttribute('d');
        for (const value of [0, 100, null]) {
          await page.evaluate(({ context, value }) => window.VildaHormoneLifespanRuntime.update({
            ...context, measurement: value === null ? null : { value, unit: 'IU/L' },
          }), { context: infantLh, value });
          await expect(wykres.locator('[data-line="lh"]')).toHaveAttribute('d', relativePath);
          await expect(wykres.locator('[data-patient-concentration]')).toHaveCount(0);
        }
        await page.evaluate(context => window.VildaHormoneLifespanRuntime.update({
          ...context, measurement: { value: .3, unit: 'IU/L' },
        }), infantLh);
        await wykres.locator('[data-view="life"]').click();
        await expect(wykres.locator('[data-patient-concentration="lh"]')).toHaveCount(1);
        // The audited sex comparison is a separate concentration-median model.
        // Its scoped puberty data must also survive a first offline reload,
        // without changing the ordinary female longitudinal-mean chart above.
        await page.reload({ waitUntil: 'load' });
        await page.waitForFunction(() => window.VildaHormoneLifespanRuntime &&
          window.VildaHormoneLifespanDisplay?.buildGonadotropinComparison);
        for (const [period, id, sex, ageYears, reference] of [
          ['mini', 'lh', 'female', 90 / 365.25, .0863163248325721],
          ['mini', 'lh', 'male', 90 / 365.25, 2.05589],
          ['mini', 'fsh', 'female', 90 / 365.25, 3.6975114715026205],
          ['mini', 'fsh', 'male', 90 / 365.25, 1.127305],
          ['puberty', 'lh', 'female', 13, 2.0309931340891243],
          ['puberty', 'lh', 'male', 13, 1.3007184973188053],
          ['puberty', 'fsh', 'female', 13, 4.80572027357214],
          ['puberty', 'fsh', 'male', 13, 2.622651954012206],
        ]) {
          const context = { analyte: id, sex, ageYears, preterm: 'no', sourceStatus: 'ready',
            identityKey: 'fictional-offline-gonadotropin-comparison', measurement: null };
          await page.evaluate(context => window.VildaHormoneLifespanRuntime.update(context), context);
          await wykres.locator(`[data-view="${period}"]`).click();
          if (await wykres.locator('.vhl-compare-toggle').getAttribute('aria-pressed') !== 'true')
            await wykres.locator('.vhl-compare-toggle').click();
          const curves = wykres.locator(`[data-comparison-curve="${id}"]`);
          const result = wykres.locator(`[data-patient-concentration="${id}"]`);
          await expect(curves).toHaveCount(2);
          await expect(wykres.locator('[data-lifespan="chart"]')).toHaveAttribute('data-comparison-scale', 'linear');
          await expect(wykres.locator('[data-lifespan="chart"]')).toHaveAttribute('data-comparison-max', period === 'mini' ? '6' : '8');
          const fixedPaths = await curves.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')));
          for (const value of [0, 2, 80, null]) {
            await page.evaluate(({ context, value }) => window.VildaHormoneLifespanRuntime.update({
              ...context, measurement: value === null ? null : { value, unit: 'IU/L' },
            }), { context, value });
            await expect.poll(() => curves.evaluateAll(nodes => nodes.map(node => node.getAttribute('d')))).toEqual(fixedPaths);
            if (value === null) await expect(result).toHaveCount(0);
            else {
              await expect(result).toHaveAttribute('data-value', String(value));
              await expect(result).toHaveAttribute('data-reference-statistic', 'median');
              await expect(result).toHaveAttribute('data-unit', 'IU/L');
              await expect.poll(async () => Number(await result.getAttribute('data-reference-value'))).toBeCloseTo(reference, 8);
              if (value === 80) await expect(result.locator('[data-result-overflow]')).toHaveAttribute('data-result-overflow', 'above');
              else await expect(result.locator('[data-result-point]')).toHaveCount(1);
            }
          }
        }
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
