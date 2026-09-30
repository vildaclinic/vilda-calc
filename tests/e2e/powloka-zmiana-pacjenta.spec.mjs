import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC-RAMEK (2026-09-30): stan kart DocPro należy do pacjenta, a ramka DocPro w tle dowiaduje się o zmianie
// pacjenta w innej ramce.
//
// Ramki powłoki dzielą sessionStorage (w nim `vildaCurrentPatientId` i stan kart DocPro `wagaiwzrost:docproUi:v2`),
// ale każda ma własny DOM. Zmierzone na `audyt` (po P-TOZSAMOSC-RAMKI #489 i P-POWLOKA-ID #491): DocPro z A (karta SGA
// wypełniona) → wczytanie C na Start → powrót do DocPro: karta SGA dalej ma dane urodzeniowe A, a ściąga B.64 dla C
// pokazuje kryterium 1 jako „SPEŁNIONE” z liczb A (34 tc, −2,94 SD); to samo po przeładowaniu ramki DocPro i po zwykłej
// nawigacji index ↔ docpro w jednej karcie bez „Wyczyść”, bo stan kart DocPro jest odtwarzany z magazynu bez
// sprawdzenia, czyj to stan.
//
// Poprawka (docpro_state_persist.js): stan kart jest znakowany pacjentem; przy starcie strony stan innego pacjenta nie
// odtwarza kart; zmiana `vildaCurrentPatientId` w innej ramce (zdarzenie storage) czyści karty SGA i terapii GH/IGF.
//
// Pierwszy scenariusz (notatka do wizyty na Start po wczytaniu B w DocPro) padał na 21046aa; od P-POWLOKA-ID (#491)
// przechodzi — zostaje jako strażnik kierunku Start.
//
// Dane wyłącznie fikcyjne, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SgaSkokGH!26';

// Pacjent A: komplet danych okołoporodowych w Karcie Pacjenta (sekcja `perinatal`).
const PERINATAL_A = {
  gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650, birthLengthCm: 41, birthHeadCircCm: 29,
};
// Pacjent B (kontrola): własne, inne dane okołoporodowe.
const PERINATAL_B = {
  gestationalWeeks: 40, gestationalDays: 0, birthWeightG: 3500, birthLengthCm: 54, birthHeadCircCm: 35,
};
// Pacjent C (wczytywany w ramce Start): własne dane okołoporodowe.
const PERINATAL_C = {
  gestationalWeeks: 39, gestationalDays: 0, birthWeightG: 3300, birthLengthCm: 53, birthHeadCircCm: 34,
};

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
  if (dane.perinatal) payload.perinatal = dane.perinatal;
  const w = await window.VildaVault.savePatient(payload, { dedup: false });
  return w.patientId;
}, d);

// Notatka, która renderuje przycisk „↗ Siatki / punkt GH" (wzorzec z skok-gh-rozgloszenie.spec.mjs).
const zalozNotatkeGH = (ctx, patientId, ghPointId) => ctx.evaluate(async (d) => {
  const w = await window.VildaVault.savePatientNote({
    patientId: d.patientId, title: 'Somatropina', body: 'Dawka kontrolna.',
    category: 'treatment', ghPointId: d.ghPointId,
    medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.03 },
  });
  const lista = await window.VildaVault.listPatientNotesForPatient(d.patientId);
  return lista.find((n) => n.id === w.id) || null;
}, { patientId, ghPointId });

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
  await ctx.waitForTimeout(1500); // kaskada zerowania pól, prefill karty SGA i modal „Co chcesz zrobić?"
  const modal = await ctx.evaluate(() => Boolean(document.getElementById('vildaLcmNew')));
  if (modal) {
    await ctx.evaluate(() => document.getElementById('vildaLcmNew').click());
    await ctx.waitForTimeout(400);
  }
}

/* Jeden cykl synchronizacji z chmurą — dokładnie te zdarzenia, które wysyła vilda_sync_integration.js
   (`document.dispatchEvent(new CustomEvent("vilda:sync-status-changed",{detail:…,bubbles:!1}))`). */
async function cyklSynchronizacji(ctx) {
  await ctx.evaluate(() => {
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'syncing' }, bubbles: false }));
    document.dispatchEvent(new CustomEvent('vilda:sync-status-changed', { detail: { state: 'ok' }, bubbles: false }));
  });
  await ctx.waitForTimeout(1500); // odczyt rekordu z sejfu jest asynchroniczny
}

const polaSga = (ctx) => ctx.evaluate(() => {
  const v = (id) => (document.getElementById(id) || {}).value;
  return {
    weeks: v('sgaBirthWeeks'), weight: v('sgaBirthWeight'), length: v('sgaBirthLength'), head: v('sgaBirthHead'),
  };
});

/* Klik w prawdziwy przycisk „Kopiuj ściągę B.64" w karcie SGA. Karta żyje w module lekarskim, który
   w domyślnym stanie strony jest zwinięty — klikamy element bezpośrednio, jak b64-sciaga-przycisk.spec.mjs. */
async function sciagaB64(ctx) {
  await ctx.evaluate(() => { window.__schowek = null; document.getElementById('copyB64ChecklistBtn').click(); });
  await ctx.waitForFunction(() => typeof window.__schowek === 'string' && window.__schowek.length > 0);
  return ctx.evaluate(() => window.__schowek);
}

/* Pola wieku i wzrostu, które odblokowują „Dodaj notatkę do wizyty" (custom-fixes.js wymaga wieku i wzrostu
   albo masy). */
async function wypelnijPomiar(ctx, wiek, wzrost) {
  await ctx.evaluate((d) => {
    for (const [id, val] of [['age', d.wiek], ['height', d.wzrost]]) {
      const el = document.getElementById(id);
      el.value = String(val);
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
    }
  }, { wiek, wzrost });
  await ctx.waitForTimeout(800);
}

/* Do kogo trafi notatka z „Dodaj notatkę do wizyty": prawdziwy przycisk panelu bocznego, a edytor notatki
   podmieniony na sondę, która zapamiętuje patientId (nic nie zapisuje w sejfie). */
const celNotatki = (ctx) => ctx.evaluate(() => {
  const ui = window.VildaAuthUI;
  const oryginal = ui.showPatientNoteEditor;
  let cel = 'brak-wywołania';
  ui.showPatientNoteEditor = (o) => { cel = o && o.patientId; return null; };
  try { document.getElementById('addVisitNoteBtnSidebar').click(); } finally { ui.showPatientNoteEditor = oryginal; }
  return cel;
});

const tozsamoscRamki = (ctx) => ctx.evaluate(() => ({
  okno: window._vildaCurrentPatientId || null,
  sesja: window.sessionStorage.getItem('vildaCurrentPatientId'),
}));

async function ramka(page, tytul) {
  await page.waitForFunction((n) => {
    const f = [...document.querySelectorAll('iframe.app-pane')].find((x) => x.title === n);
    return Boolean(f && f.contentWindow && f.contentWindow.VildaVault);
  }, tytul, { timeout: 30000 });
  const uchwyt = await page.$(`iframe.app-pane[title="${tytul}"]`);
  return uchwyt.contentFrame();
}

async function powlokaZKontem(page) {
  await przygotujStrone(page);
  await page.goto('/app.html', { waitUntil: 'load' });
  let start = await ramka(page, 'Start');
  await start.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  start = await ramka(page, 'Start');
  await start.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(2000);
  return start;
}

async function docproZPacjentemA(page, start, idA) {
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function'
    && Boolean(window.vildaSgaBirthPersistApi) && Boolean(window.VildaPerinatalSource));
  await page.waitForTimeout(2000);
  await wczytaj(docpro, idA, 'Testowy');
  // Kontrola pozytywna: karta SGA pacjenta A jest NIEPUSTA (prefill z „Danych okołoporodowych").
  await expect.poll(() => polaSga(docpro), { timeout: 10000 })
    .toEqual({ weeks: '34', weight: '1650', length: '41', head: '29' });
  return docpro;
}


const SGA_A = { weeks: '34', weight: '1650', length: '41', head: '29' };
const SGA_C = { weeks: '39', weight: '3300', length: '53', head: '34' };

async function sciagaLinia1(ctx) {
  const t = await sciagaB64(ctx);
  return t.split('\n').filter((l) => /^1\./.test(l) || /\btc\b/.test(l)).slice(0, 2).join(' | ');
}

async function startPoPowrocie(page) {
  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.waitForTimeout(1500);
  return ramka(page, 'Start');
}

async function docproPoPowrocie(page, nazwisko) {
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const d = await ramka(page, 'DocPro');
  await expect(d.locator('#lastName'), `DocPro po powrocie pokazuje ${nazwisko}`).toHaveValue(nazwisko, { timeout: 15000 });
  await page.waitForTimeout(3000);
  return d;
}

test('powłoka: Start z A → wczytanie B w DocPro → powrót na Start — tożsamość i notatka do wizyty dla B', async ({ page }) => {
  test.setTimeout(240_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idB = await zalozPacjenta(start, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });
  await wczytaj(start, idA, 'Testowy');
  await page.waitForTimeout(1500);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(2500);
  await wczytaj(docpro, idB, 'Probny');
  await page.waitForTimeout(2000);

  const s2 = await startPoPowrocie(page);
  await expect(s2.locator('#lastName'), 'Start pokazuje B').toHaveValue('Probny', { timeout: 15000 });
  await page.waitForTimeout(1500);
  expect.soft(await tozsamoscRamki(s2), 'bieżący pacjent ramki Start = B w obu magazynach').toEqual({ okno: idB, sesja: idB });
  await wypelnijPomiar(s2, 11, 142);
  expect(await celNotatki(s2), '„Dodaj notatkę do wizyty” na Start przy B zapisuje notatkę u B, nie u A').toBe(idB);
});

test('powłoka: DocPro z A → wczytanie C na Start → powrót do DocPro — karta SGA i ściąga B.64 bez danych A', async ({ page }) => {
  test.setTimeout(240_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idC = await zalozPacjenta(start, { lastName: 'Cezary', firstName: 'Celny', age: 10, height: 138, weight: 33, perinatal: PERINATAL_C });
  await docproZPacjentemA(page, start, idA);

  const s2 = await startPoPowrocie(page);
  await wczytaj(s2, idC, 'Cezary');
  await page.waitForTimeout(2500);

  let docpro = await docproPoPowrocie(page, 'Cezary');
  await cyklSynchronizacji(docpro);
  expect.soft(await tozsamoscRamki(docpro), 'bieżący pacjent ramki DocPro = C').toEqual({ okno: idC, sesja: idC });
  // Prefill z „Danych okołoporodowych” C po cyklu synchronizacji — karta SGA niesie dane C, nie A.
  await expect.poll(() => polaSga(docpro), { timeout: 10000, message: 'karta SGA po powrocie: dane C, nie A' }).toEqual(SGA_C);
  const linia = await sciagaLinia1(docpro);
  expect.soft(linia, 'ściąga B.64 dla C nie liczy kryterium z 34 tc pacjenta A').not.toMatch(/\b34(\+\d)? tc/);

  // Przeładowanie samej ramki DocPro: stan kart z magazynu nie wraca do A.
  await docpro.evaluate(() => window.location.reload());
  await page.waitForTimeout(1000);
  docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && Boolean(window.vildaSgaBirthPersistApi));
  await page.waitForTimeout(4000);
  await cyklSynchronizacji(docpro);
  expect(await polaSga(docpro), 'po przeładowaniu ramki DocPro karta SGA nie wraca do danych A').not.toEqual(SGA_A);
});

test('bez powłoki: docpro.html z A → index.html, wczytanie C bez „Wyczyść” → docpro.html — karta SGA bez danych A', async ({ page }) => {
  test.setTimeout(240_000);
  await przygotujStrone(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  const gotowyDocpro = () => page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && Boolean(window.vildaSgaBirthPersistApi) && Boolean(window.VildaPerinatalSource));
  await gotowyDocpro();
  await page.waitForTimeout(1500);
  const idA = await zalozPacjenta(page, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idC = await zalozPacjenta(page, { lastName: 'Cezary', firstName: 'Celny', age: 10, height: 138, weight: 33, perinatal: PERINATAL_C });
  await wczytaj(page, idA, 'Testowy');
  await expect.poll(() => polaSga(page), { timeout: 10000 }).toEqual(SGA_A);
  await page.waitForTimeout(1000); // zapis stanu kart DocPro (debounce 180 ms) i pagehide

  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked() && typeof window.applyLoadedData === 'function');
  await page.waitForTimeout(1500);
  // Wczytanie C bez „Wyczyść” — jak autouzupełnianie nazwiska (applyLoadedData + vilda:patient-loaded); „Wyczyść”
  // na stronie głównej czyści też stan kart DocPro, więc tamta droga była bezpieczna.
  await wczytaj(page, idC, 'Cezary');
  await page.waitForTimeout(1500);

  await page.goto('/docpro.html', { waitUntil: 'load' });
  await gotowyDocpro();
  await page.waitForTimeout(4000);
  await expect(page.locator('#lastName'), 'docpro pokazuje C').toHaveValue('Cezary', { timeout: 15000 });
  await cyklSynchronizacji(page);
  expect(await polaSga(page), 'karta SGA na docpro po wczytaniu C gdzie indziej nie niesie danych A').not.toEqual(SGA_A);
});

test('kontrola: DocPro z A → Start bez zmiany pacjenta → powrót i przeładowanie ramki — karta SGA A zostaje', async ({ page }) => {
  test.setTimeout(240_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  await docproZPacjentemA(page, start, idA);
  await page.waitForTimeout(1000);
  await startPoPowrocie(page);
  await page.waitForTimeout(1500);
  let docpro = await docproPoPowrocie(page, 'Testowy');
  expect(await polaSga(docpro), 'bez zmiany pacjenta karta SGA A zostaje').toEqual(SGA_A);
  // Ręczna poprawka w karcie SGA (tylko w DocPro) — przeładowanie ramki ją odtwarza, bo stan należy do A.
  await docpro.evaluate(() => {
    const e = document.getElementById('sgaBirthLength');
    e.value = '42';
    e.dispatchEvent(new Event('input', { bubbles: true }));
    e.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await page.waitForTimeout(1200);
  await docpro.evaluate(() => window.location.reload());
  await page.waitForTimeout(1000);
  docpro = await ramka(page, 'DocPro');
  await docpro.waitForFunction(() => window.VildaVault && window.VildaVault.isUnlocked() && Boolean(window.vildaSgaBirthPersistApi));
  await page.waitForTimeout(4000);
  expect(await polaSga(docpro), 'stan karty SGA tego samego pacjenta wraca po przeładowaniu').toEqual({ ...SGA_A, length: '42' });
});
