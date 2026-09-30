import { expect, test } from '../support/test-czas.mjs';

// P-TOZSAMOSC-RAMKI (2026-09-30): w powłoce app.html ramka DocPro po wczytaniu pacjenta B wracała do
// poprzedniego pacjenta A. Regresja z P-WERDYKT rata 7 (#443).
//
// Mechanizm (zmierzony): kilkadziesiąt ms po wczytaniu B — zwykłym z listy albo skokiem „↗ Siatki / punkt GH"
// z notatki — powłoka odświeża ramkę (vildaPersistRestoreAll → refreshGHTherapyMonitor →
// `vilda:therapy-points-changed`). Nasłuch karty porównania w vilda_summary_cards.js wołał wtedy Y()
// z NIEAKTUALNEJ kotwicy `vildaPrevSummaryPid` (jeszcze A — odczyt B z sejfu trwa), a Y() zapisuje
// swój argument w `window._vildaCurrentPatientId`. Formularz i sessionStorage mówiły B, zmienna okna ramki — A.
// Skutki dla pacjenta B:
//  - karta „Porównanie z poprzednim pomiarem" pokazywała pomiar A;
//  - „Dodaj notatkę do wizyty" (custom-fixes.js czyta najpierw zmienną okna) zapisywała notatkę u A;
//  - najbliższy cykl synchronizacji (`vilda:sync-status-changed`) albo `vilda:auth-hidden` wpisywał do pustej
//    karty SGA masę, długość, obwód głowy i tydzień ciąży A, a ściąga B.64 liczyła kryterium urodzeniowe z liczb A.
//
// Hipoteza z P-NOTATKI rata 3d („prefill karty SGA wpisuje tylko do pustych pól, więc liczby A wygrywają")
// nie zachodzi: applyLoadedData() przy zmianie tożsamości czyści kartę SGA (identityReset) — patrz test
// kontrolny na samodzielnym docpro.html na końcu pliku, zielony przed poprawką i po niej.
//
// Poprawka: nasłuch `vilda:therapy-points-changed` odświeża kartę tylko wtedy, gdy kotwica jest bieżącym
// pacjentem, czytanym NAJPIERW z sessionStorage (wspólnego dla ramek powłoki i ustawianego synchronicznie przy
// wczytaniu). Pierwsza wersja bramki czytała najpierw zmienną okna — test „wczytanie C w ramce Start" pokazuje,
// dlaczego to za mało: ramka w tle ma tam nieaktualną zmienną okna.
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

test('powłoka: po skoku z Terminarza do punktu GH pacjenta B karta SGA i ściąga B.64 nie biorą liczb pacjenta A', async ({ page }) => {
  test.setTimeout(180_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idB = await zalozPacjenta(start, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });
  const notatkaB = await zalozNotatkeGH(start, idB, 'gh-fikcja-b1');
  expect(notatkaB, 'notatka leczenia dla B').toBeTruthy();

  const docpro = await docproZPacjentemA(page, start, idA);

  // Lekarz przechodzi do Terminarza, otwiera notatkę pacjenta B i klika „↗ Siatki / punkt GH".
  await page.evaluate(() => window.VildaShell.navigate('terminarz'));
  const terminarz = await ramka(page, 'Terminarz');
  await terminarz.waitForFunction(() => window.VildaVault.isUnlocked() && Boolean(window.VildaAuthUI));
  await page.waitForTimeout(1500);
  await terminarz.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.patientId, note: d.note }),
    { patientId: idB, note: notatkaB });
  const przycisk = terminarz.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' });
  await expect(przycisk, 'przycisk skoku jest w arkuszu notatki').toBeVisible();
  await przycisk.click();

  // Skok dochodzi: DocPro pokazuje pacjenta B (rata 3d), a karta SGA jest wyczyszczona przez identityReset.
  await expect(docpro.locator('#lastName'), 'DocPro pokazuje pacjenta B').toHaveValue('Probny', { timeout: 15000 });
  await page.waitForTimeout(2500); // odświeżenie ramki przez powłokę i podświetlenie punktu (450 ms)

  // Zwykły cykl synchronizacji z chmurą po skoku.
  await cyklSynchronizacji(docpro);

  await expect(docpro.locator('#lastName'), 'nadal pacjent B').toHaveValue('Probny');
  // B nie ma danych urodzeniowych — karta SGA MUSI zostać pusta.
  expect.soft(await polaSga(docpro), 'karta SGA pacjenta B nie może pokazywać liczb pacjenta A')
    .toEqual({ weeks: '', weight: '', length: '', head: '' });
  const sciaga = await sciagaB64(docpro);
  expect.soft(sciaga, 'ściąga B.64 dla B: kryterium urodzeniowe bez danych, nie z liczb A')
    .toMatch(/\n1\.[^\n]*— BRAK DANYCH/);
  expect.soft(sciaga, 'ściąga B.64 dla B nie zawiera wieku ciążowego pacjenta A').not.toMatch(/\b34(\+\d)? tc/);
  // Przyczyna: tożsamość w ramce DocPro wróciła do A, choć formularz i sessionStorage mówią B.
  const tozsamosc = await docpro.evaluate(() => ({
    okno: window._vildaCurrentPatientId || null,
    sesja: window.sessionStorage.getItem('vildaCurrentPatientId'),
  }));
  expect.soft(tozsamosc, 'bieżący pacjent ramki DocPro = B w obu magazynach').toEqual({ okno: idB, sesja: idB });
});

test('powłoka: zwykłe wczytanie pacjenta B w ramce DocPro też nie może zostawić karty SGA z liczbami A', async ({ page }) => {
  // Ta sama przyczyna bez skoku — pokazuje, że źródłem nie jest sam monitor GH, tylko powrót tożsamości
  // ramki do poprzedniego pacjenta po odświeżeniu przez powłokę.
  test.setTimeout(180_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idB = await zalozPacjenta(start, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });

  const docpro = await docproZPacjentemA(page, start, idA);
  await wczytaj(docpro, idB, 'Probny');
  await page.waitForTimeout(1500);
  await cyklSynchronizacji(docpro);

  await expect(docpro.locator('#lastName'), 'nadal pacjent B').toHaveValue('Probny');
  expect.soft(await polaSga(docpro), 'karta SGA pacjenta B nie może pokazywać liczb pacjenta A')
    .toEqual({ weeks: '', weight: '', length: '', head: '' });
  expect.soft(await tozsamoscRamki(docpro), 'bieżący pacjent ramki DocPro = B w obu magazynach')
    .toEqual({ okno: idB, sesja: idB });
  // Ta sama tożsamość decyduje, u kogo zapisze się notatka z panelu bocznego.
  await wypelnijPomiar(docpro, 11, 142);
  expect(await celNotatki(docpro), '„Dodaj notatkę do wizyty" przy B zapisuje notatkę u B, nie u A').toBe(idB);
});

test('powłoka: karta „Porównanie z poprzednim pomiarem" po wczytaniu B nie pokazuje poprzedniego pomiaru A', async ({ page }) => {
  // Ta sama przyczyna, inny objaw: nasłuch `vilda:therapy-points-changed` rysuje kartę porównania z kotwicy A
  // (starsza migawka A), więc „Poprzednio" przy pacjencie B to wzrost i masa pacjenta A.
  test.setTimeout(180_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  // Druga wizyta A — karta porównania ma wtedy z czego wziąć „poprzedni pomiar" A.
  await start.evaluate(async (d) => {
    await window.VildaVault.savePatient({
      name: 'Testowy Adam',
      user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 8, ageMonths: 6, height: 129, weight: 27 },
      perinatal: d.perinatal,
    }, { patientId: d.id, dedup: false });
  }, { id: idA, perinatal: PERINATAL_A });
  const idB = await zalozPacjenta(start, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });

  const docpro = await docproZPacjentemA(page, start, idA);
  await wczytaj(docpro, idB, 'Probny');
  await page.waitForTimeout(2500);

  const karta = docpro.locator('#prevSummaryCard');
  await expect(karta, 'karta porównania dla B pokazuje poprzedni pomiar B').toContainText('wiek 11 lat');
  await expect(karta, 'ani śladu poprzedniego pomiaru A').not.toContainText('wiek 8 lat');
});

test('powłoka: wczytanie C w ramce Start, gdy DocPro ma A — po powrocie DocPro pracuje na C', async ({ page }) => {
  // Przypadek, w którym pierwsza wersja bramki (zmienna okna przed sessionStorage) zawodziła: ramka DocPro
  // w tle ma w zmiennej okna nadal A, a wspólna kotwica i sessionStorage mówią już C.
  test.setTimeout(240_000);
  const start = await powlokaZKontem(page);
  const idA = await zalozPacjenta(start, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idC = await zalozPacjenta(start, { lastName: 'Cezary', firstName: 'Celny', age: 10, height: 138, weight: 33, perinatal: PERINATAL_C });

  const docpro = await docproZPacjentemA(page, start, idA);

  await page.evaluate(() => window.VildaShell.navigate('start'));
  await page.waitForTimeout(1500);
  const startPonownie = await ramka(page, 'Start');
  await wczytaj(startPonownie, idC, 'Cezary');
  await page.waitForTimeout(2500);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  await expect(docpro.locator('#lastName'), 'DocPro po powrocie pokazuje C').toHaveValue('Cezary', { timeout: 15000 });
  await page.waitForTimeout(3000);
  await cyklSynchronizacji(docpro);

  await expect(docpro.locator('#lastName'), 'nadal pacjent C').toHaveValue('Cezary');
  expect.soft(await tozsamoscRamki(docpro), 'bieżący pacjent ramki DocPro = C w obu magazynach')
    .toEqual({ okno: idC, sesja: idC });
  await wypelnijPomiar(docpro, 10, 139);
  expect(await celNotatki(docpro), '„Dodaj notatkę do wizyty" przy C zapisuje notatkę u C, nie u A').toBe(idC);
});

test('kontrola: samodzielny docpro.html — skok do B czyści niepustą kartę SGA i wpisuje dane B (identityReset)', async ({ page }) => {
  // Kontrola hipotezy z raty 3d: niepusta karta SGA NIE przetrwa skoku, bo applyLoadedData() przy zmianie
  // tożsamości woła vildaSgaBirthPersistApi.resetState. Zielony przed poprawką i po niej.
  test.setTimeout(120_000);
  await przygotujStrone(page);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.applyLoadedData === 'function' && Boolean(window.VildaAuthUI) && Boolean(window.vildaSgaBirthPersistApi));
  await page.waitForTimeout(1200);

  const idA = await zalozPacjenta(page, { lastName: 'Testowy', firstName: 'Adam', age: 8, height: 126, weight: 25, perinatal: PERINATAL_A });
  const idB = await zalozPacjenta(page, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36, perinatal: PERINATAL_B });
  const notatkaB = await zalozNotatkeGH(page, idB, 'gh-fikcja-b1');

  await wczytaj(page, idA, 'Testowy');
  await expect.poll(() => polaSga(page), { timeout: 10000 })
    .toEqual({ weeks: '34', weight: '1650', length: '41', head: '29' });

  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({ patientId: d.patientId, note: d.note }),
    { patientId: idB, note: notatkaB });
  const przycisk = page.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' });
  await expect(przycisk).toBeVisible();
  await przycisk.click();
  await expect(page.locator('#lastName')).toHaveValue('Probny', { timeout: 15000 });
  await page.waitForTimeout(1500);
  await cyklSynchronizacji(page);

  expect(await polaSga(page), 'karta SGA po skoku niesie dane B, nie A')
    .toEqual({ weeks: '40', weight: '3500', length: '54', head: '35' });
  expect(await sciagaB64(page), 'ściąga B.64 liczy z danych B').toMatch(/\b40(\+0)? tc/);
});
