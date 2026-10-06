import { expect, test } from '../support/test-czas.mjs';

// P-ZRODLA-PRZEJECIE (2026-10-06, uwaga Codex P1 do #491): źródła pacjenta w panelu DocPro nadążają za pacjentem
// przejętym z sesji karty.
//
// Panel powłoki przejmuje pacjenta wczytanego na Start w vildaPersistRestoreAll (P-POWLOKA-ID) — bez
// `vilda:patient-loaded`, które dostaje tylko ramka wczytująca. Źródła rozpoznania DS (`vilda_ds_source.js`) i danych
// okołoporodowych (`vilda_perinatal_source.js`) przeładowywały się tylko na patient-loaded oraz przy okazji
// zamknięcia panelu konta (`vilda:auth-hidden`), które powłoka robi przy przejściu z menu. Przy powrocie przyciskiem
// „Wstecz” tego zamknięcia nie ma. Zmierzone na `audyt` `db8f26c`: DocPro z A (zespół Downa, 34+2 tc, 1650 g) → Start,
// wczytanie C (bez rozpoznania i bez danych okołoporodowych) → „Wstecz”: formularz C, a `VildaPopulacjaPacjenta()` =
// 'DS' i ściąga B.64 dla C z kryterium 1 „SPEŁNIONE” (masa −3,13 SD; długość −3,48 SD; 34+2 tc) — liczby A.
// Stan trwał do przypadkowego zdarzenia synchronizacji albo przeładowania ramki.
//
// Źródło dojrzewania (`vilda_puberty_source.js`) robiło to dobrze już wcześniej — zostaje jako strażnik.
//
// Dane wyłącznie fikcyjne, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ZrodlaWstecz!26';

async function przygotujStrone(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
    // Schowek ściągi B.64 — w każdej ramce osobno (init script działa też w ramkach powłoki).
    try {
      const writeText = (t) => { window.__schowek = t; return Promise.resolve(); };
      Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    } catch { /* brak schowka — pomiń */ }
  });
}

const zalozPacjenta = (ctx, d) => ctx.evaluate(async (dane) => {
  const payload = {
    name: `${dane.lastName} ${dane.firstName}`,
    user: {
      lastName: dane.lastName, firstName: dane.firstName, sex: 'M',
      age: dane.age, ageMonths: 0, height: dane.height, weight: dane.weight,
    },
  };
  for (const k of ['clinical', 'perinatal', 'puberty']) if (dane[k]) payload[k] = dane[k];
  const w = await window.VildaVault.savePatient(payload, { dedup: false });
  return w.patientId;
}, d);

/* Wczytanie tak, jak robi to lista pacjentów (ścieżka source:"pick" z vilda_auth_ui.js). */
async function wczytaj(ctx, patientId, nazwisko) {
  await ctx.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, patientId);
  await expect(ctx.locator('#lastName')).toHaveValue(nazwisko, { timeout: 15000 });
  await ctx.waitForTimeout(1500); // kaskada zerowania pól i modal „Co chcesz zrobić?"
  const modal = await ctx.evaluate(() => Boolean(document.getElementById('vildaLcmNew')));
  if (modal) {
    await ctx.evaluate(() => document.getElementById('vildaLcmNew').click());
    await ctx.waitForTimeout(400);
  }
}

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

/* To, co w panelu czytają silnik BMI (populacja), opis pacjenta i ściąga B.64 (dane urodzeniowe) oraz panel
   dojrzewania — przez publiczne API źródeł. */
const zrodla = (ctx) => ctx.evaluate(() => {
  const id = window.sessionStorage.getItem('vildaCurrentPatientId');
  const ur = window.VildaPerinatalSource.zKartyPacjenta();
  const dojrz = window.VildaPubertySource.kontekstPacjenta(id);
  return {
    populacja: window.VildaPopulacjaPacjenta(),
    urodzenie: ur ? `${ur.weeks}+${ur.days} tc, ${ur.weight} g` : null,
    urodzenieDlaKonsumentow: Boolean(window.VildaPerinatalSource.biezace()),
    dojrzewanie: dojrz.status === 'ready' && dojrz.puberty ? dojrz.puberty.wiekStartuPokwitaniaLat : null,
  };
});

/* Klik w prawdziwy przycisk „Kopiuj ściągę B.64" (wzorzec z powloka-zmiana-pacjenta.spec.mjs); pierwsza linia
   kryterium 1 z uzasadnieniem. */
async function b64Kryterium1(ctx) {
  await ctx.evaluate(() => { window.__schowek = null; document.getElementById('copyB64ChecklistBtn').click(); });
  await ctx.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
  const t = await ctx.evaluate(() => window.__schowek);
  const linie = t.split('\n');
  const i = linie.findIndex((l) => /^1\./.test(l));
  return `${linie[i]} | ${(linie[i + 1] || '').trim()}`;
}

test('powłoka: DocPro z A → Start, wczytanie C → „Wstecz” — populacja DS, dane urodzeniowe i B.64 należą do C', async ({ page }) => {
  test.setTimeout(240_000);
  await przygotujStrone(page);
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(2000);

  const idA = await zalozPacjenta(start, {
    lastName: 'Testowy', firstName: 'Adam', age: 12, height: 140, weight: 40,
    clinical: { downSyndrome: true },
    perinatal: { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29 },
    puberty: { onsetAgeYears: 11 },
  });
  const idC = await zalozPacjenta(start, { lastName: 'Probny', firstName: 'Cezary', age: 12, height: 150, weight: 42 });
  await wczytaj(start, idA, 'Testowy');

  // Kontrola pozytywna: DocPro (przejście z menu) zna A — inaczej reszta testu niczego by nie dowodziła.
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked() && Boolean(window.VildaPerinatalSource)
    && Boolean(window.VildaPubertySource) && typeof window.VildaPopulacjaPacjenta === 'function');
  await expect.poll(() => zrodla(docpro), { timeout: 15000 })
    .toEqual({ populacja: 'DS', urodzenie: '34+2 tc, 1650 g', urodzenieDlaKonsumentow: true, dojrzewanie: 11 });
  // Karta SGA (pierwszeństwo przed rekordem) wypełniona z „Danych okołoporodowych” razem z dniami ciąży (P-SGA-DNI).
  expect(await b64Kryterium1(docpro)).toMatch(/SPEŁNIONE \| .*; 34\+2 tc;/);

  await page.evaluate(() => window.VildaShell.navigate('start'));
  start = await ramka(page, 'Start');
  await page.waitForTimeout(1500);
  await wczytaj(start, idC, 'Probny');

  // Panel DocPro w tle przejmuje C (vildaPersistRestoreAll na ping vilda:sharedLoadSeq) — źródła razem z nim.
  await expect.poll(() => docpro.evaluate(() => window._vildaCurrentPatientId), { timeout: 15000 }).toBe(idC);
  await expect.poll(() => zrodla(docpro), { timeout: 15000, message: 'DocPro w tle: źródła pacjenta C' })
    .toEqual({ populacja: 'OGOLNA', urodzenie: null, urodzenieDlaKonsumentow: false, dojrzewanie: null });

  // Powrót przyciskiem „Wstecz” (popstate) — bez zamykania panelu konta w ramce DocPro.
  await page.evaluate(() => window.history.back());
  await expect.poll(() => page.evaluate(() => window.location.hash)).toBe('#/docpro');
  await expect(docpro.locator('#lastName'), 'DocPro po „Wstecz” pokazuje C').toHaveValue('Probny', { timeout: 15000 });
  await page.waitForTimeout(3000); // dłużej niż odczyt rekordu z sejfu — stan ma być trwały, nie chwilowy
  expect(await zrodla(docpro), 'DocPro po „Wstecz”: populacja, dane urodzeniowe i dojrzewanie C')
    .toEqual({ populacja: 'OGOLNA', urodzenie: null, urodzenieDlaKonsumentow: false, dojrzewanie: null });
  const kryterium1 = await b64Kryterium1(docpro);
  expect(kryterium1, 'ściąga B.64 dla C bez danych urodzeniowych A').not.toMatch(/SPEŁNIONE|34(\+\d)? tc/);
  expect(kryterium1).toMatch(/BRAK DANYCH/);
});
