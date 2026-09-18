import { expect, test } from '../support/test-czas.mjs';

// P-NOTATKI rata 3d — skok z monitora GH do punktu pacjenta, na PRAWDZIWYM docpro.html.
//
// G27c: skok ustawiał `location.hash` własnego okna. Zmierzone, że ustawienie hasha na wartość,
//       którą hash JUŻ ma, nie wywołuje `hashchange` — drugi skok w obrębie dokumentu był więc
//       bezczynny, a zamiar wisiał w sessionStorage do wygaśnięcia (60 s).
// G27b: skok wczytywał pacjenta i nic o tym nie mówił — 19 aktywnych na docpro nasłuchów
//       `vilda:patient-loaded` zostawało przy poprzednim dziecku.
//
// Dane wyłącznie fikcyjne, własne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#SkokGH!26a';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch { /* brak storage — pomiń */ }
  });
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }),
    HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.applyLoadedData === 'function' && Boolean(window.VildaAuthUI));
  await page.waitForTimeout(1200);
}

const zalozPacjenta = (page, dane) => page.evaluate(async (d) => {
  const w = await window.VildaVault.savePatient({
    name: `${d.lastName} ${d.firstName}`,
    user: {
      lastName: d.lastName, firstName: d.firstName, sex: 'M',
      age: d.age, ageMonths: 0, height: d.height, weight: d.weight,
    },
  }, { dedup: false });
  return w.patientId;
}, dane);

// Notatka, która renderuje przycisk „↗ Siatki / punkt GH": leczenie w mg/kg/d + ghPointId.
const zalozNotatkeGH = (page, patientId, ghPointId) => page.evaluate(async (d) => {
  const w = await window.VildaVault.savePatientNote({
    patientId: d.patientId, title: 'Somatropina', body: 'Dawka kontrolna.',
    category: 'treatment', ghPointId: d.ghPointId,
    // `action` jest obowiązkowe — bez niego sejf odrzuca cały obiekt `medication`,
    // a wtedy arkusz w ogóle nie renderuje przycisku skoku (zmierzone).
    medication: { name: 'Somatropina', action: 'start', doseUnit: 'mg/kg/d', doseNum: 0.03 },
  });
  const lista = await window.VildaVault.listPatientNotesForPatient(d.patientId);
  return lista.find((n) => n.id === w.id) || null;
}, { patientId, ghPointId });

/* Wczytanie tak, jak robi to zakładka Pacjenci. */
async function wczytaj(page, patientId) {
  await page.evaluate(async (pid) => {
    const p = await window.VildaVault.getPatient(pid);
    const snap = p.snapshots[0];
    window.applyLoadedData(snap.payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: snap.savedAtISO || null, snapshotCount: p.snapshotCount || 1, source: 'pick' },
    }));
  }, patientId);
  await page.waitForFunction((pid) => window._vildaCurrentPatientId === pid, patientId);
  await page.waitForTimeout(1500); // kaskada zerowania pól i modal „Co chcesz zrobić?"
  await zamknijModalWyboru(page);
}

// Modal „Co chcesz zrobić?" po ZWYKŁYM wczytaniu jest oczekiwany — wybieramy „Nowy pomiar",
// żeby nie blokował kliknięć w dalszej części scenariusza.
async function zamknijModalWyboru(page) {
  const jest = await page.evaluate(() => Boolean(document.getElementById('vildaLcmNew')));
  if (!jest) return;
  await page.evaluate(() => document.getElementById('vildaLcmNew').click());
  await page.waitForTimeout(400);
}

const nasluchuj = (page) => page.evaluate(() => {
  window.__skokZdarzenia = [];
  document.addEventListener('vilda:patient-loaded', (e) => {
    window.__skokZdarzenia.push({
      patientId: e.detail && e.detail.patientId,
      source: e.detail && e.detail.source,
      skipLoadChoice: Boolean(e.detail && e.detail.skipLoadChoice),
      name: e.detail && e.detail.name,
    });
  });
});

/* Otwiera arkusz notatki i klika prawdziwy przycisk „↗ Siatki / punkt GH". */
async function skocz(page, patientId, note) {
  await page.evaluate((d) => window.VildaAuthUI.showPatientNoteEditor({
    patientId: d.patientId, note: d.note,
  }), { patientId, note });
  const przycisk = page.locator('.vilda-pne button', { hasText: 'Siatki / punkt GH' });
  await expect(przycisk, 'przycisk skoku jest w arkuszu notatki').toBeVisible();
  await przycisk.click();
}

const stan = (page) => page.evaluate(() => ({
  biezacy: window._vildaCurrentPatientId || null,
  sesja: (() => { try { return window.sessionStorage.getItem('vildaCurrentPatientId'); } catch { return null; } })(),
  modalWyboru: Boolean(document.getElementById('vildaLoadChoiceModal')),
  guard: Boolean(document.querySelector('.vug')),
  zamiar: (() => { try { return window.sessionStorage.getItem('vilda:gh-jump'); } catch { return null; } })(),
  zdarzenia: window.__skokZdarzenia || [],
  hash: String(location.hash || ''),
}));

test('G27b/G27c — skok wczytuje pacjenta, rozgłasza to i nie pyta o nic', async ({ page }) => {
  await otworzZKontem(page);
  const idA = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Aniela', age: 8, height: 126, weight: 25 });
  const idB = await zalozPacjenta(page, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });
  const notatkaB = await zalozNotatkeGH(page, idB, 'gh-fikcja-b1');
  expect(notatkaB, 'notatka leczenia dla B').toBeTruthy();

  await wczytaj(page, idA);
  await nasluchuj(page);
  await skocz(page, idB, notatkaB);

  await expect.poll(async () => (await stan(page)).biezacy, { timeout: 15000 }).toBe(idB);
  const po = await stan(page);
  expect(po.sesja, 'sessionStorage też wskazuje B (rata 1)').toBe(idB);
  expect(po.zamiar, 'zamiar skoku skonsumowany').toBeNull();
  expect(po.modalWyboru, 'modal „Co chcesz zrobić?" wyciszony — lekarz już wybrał').toBe(false);
  expect(po.guard, 'brak blokującego dialogu niezapisanych zmian').toBe(false);

  const skok = po.zdarzenia.filter((z) => z.patientId === idB);
  expect(skok.length, 'skok rozgłosił vilda:patient-loaded').toBeGreaterThan(0);
  expect(skok[0].source).toBe('pick');
  expect(skok[0].skipLoadChoice, 'ze znacznikiem wyciszającym modal').toBe(true);
});

test('G27c — drugi skok z tego samego dokumentu też dochodzi do skutku', async ({ page }) => {
  // Sedno znaleziska: hash jest już „#/docpro", więc jego ponowne ustawienie nie wywołuje
  // hashchange. Bez syntetycznego zdarzenia ten skok byłby bezczynny, a zamiar wisiałby
  // w sessionStorage do wygaśnięcia.
  await otworzZKontem(page);
  const idA = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Aniela', age: 8, height: 126, weight: 25 });
  const idB = await zalozPacjenta(page, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });
  const notatkaA = await zalozNotatkeGH(page, idA, 'gh-fikcja-a1');
  const notatkaB = await zalozNotatkeGH(page, idB, 'gh-fikcja-b1');

  await wczytaj(page, idA);
  await skocz(page, idB, notatkaB);
  await expect.poll(async () => (await stan(page)).biezacy, { timeout: 15000 }).toBe(idB);
  expect((await stan(page)).hash, 'pierwszy skok ustawił hash').toBe('#/docpro');

  await nasluchuj(page);
  await skocz(page, idA, notatkaA);
  await expect.poll(async () => (await stan(page)).biezacy, { timeout: 15000 }).toBe(idA);

  const po = await stan(page);
  expect(po.zamiar, 'drugi zamiar też skonsumowany').toBeNull();
  expect(po.zdarzenia.some((z) => z.patientId === idA && z.skipLoadChoice),
    'drugi skok rozgłosił tak samo').toBe(true);
});

test('G27b — bramka jest wąska: zwykłe wczytanie nadal pyta „Co chcesz zrobić?"', async ({ page }) => {
  // Kontrola pozytywna dla WĄSKOŚCI bramki: zwykłe zdarzenie, bez znacznika, nadal pokazuje modal.
  // To, że sama bramka działa, mierzy test pierwszy — sprawdzone osobno: z rozgłoszeniem, ale bez
  // bramki w custom-fixes.js, tamten test czerwienieje właśnie na asercji o modalu.
  await otworzZKontem(page);
  const idA = await zalozPacjenta(page, { lastName: 'Testowa', firstName: 'Aniela', age: 8, height: 126, weight: 25 });
  const idB = await zalozPacjenta(page, { lastName: 'Probny', firstName: 'Bartosz', age: 11, height: 141, weight: 36 });
  const notatkaB = await zalozNotatkeGH(page, idB, 'gh-fikcja-b1');

  await wczytaj(page, idA);
  await skocz(page, idB, notatkaB);
  await expect.poll(async () => (await stan(page)).biezacy, { timeout: 15000 }).toBe(idB);
  expect((await stan(page)).modalWyboru, 'skok modalu nie pokazuje').toBe(false);

  // To samo zdarzenie BEZ znacznika — modal musi wrócić.
  await page.evaluate((pid) => {
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', {
      detail: { patientId: pid, savedAtISO: null, snapshotCount: 1, source: 'pick' },
    }));
  }, idB);
  await expect(page.locator('#vildaLcmNew'), 'zwykłe wczytanie dostaje modal jak dotąd').toBeVisible({ timeout: 10000 });
});
