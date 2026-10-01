import { expect, test } from '@playwright/test';

// P-SCALANIE-BLOKADA (decyzja właściciela 2026-10-01: „przeanalizuj i wprowadź to”) — scalanie synchronizacji pod tą
// samą blokadą pacjenta co zapis, na prawdziwych Web Locks w dwóch kartach.
//
// Karta A zapisuje pacjenta i sejf pyta „Ktoś inny zmienił ten rekord”; lekarz jeszcze nie odpowiedział, więc zapis A
// trzyma blokadę pacjenta. W tym czasie karta B scala ładunek synchronizacji z nowym zapisem tej karty (to samo, co robi
// vilda_sync.js po pobraniu z chmury):
//   1. scalanie czeka i kończy się po odpowiedzi w A; obie zmiany są, licznik wersji się zgadza;
//   2. blokada zajęta dłużej niż limit: scalanie kończy się błędem MERGE_BUSY i niczego nie dopisuje; po zwolnieniu
//      to samo scalanie przechodzi.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ScalanieBlokada!26aa';

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => typeof window.VildaVault.setSaveConflictResolver === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

/* Pierwsza karta: zakłada konto. Sesja sejfu żyje w sessionStorage, czyli per karta. */
async function pierwszaKarta(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const { userId } = await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return userId;
}

/* Kolejna karta tej samej przeglądarki: to samo konto, logowanie hasłem. */
async function kolejnaKarta(context, userId) {
  const page = await context.newPage();
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.pw), { userId, pw: HASLO });
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return page;
}

/* Karta pacjenta z pomiarami 60 i 66, potem 80. */
const nowaKarta = (page) => page.evaluate(async () => {
  const V = window.VildaVault;
  const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
  const rekord = (wieki) => ({
    name: 'Testowy Jan',
    user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
    advanced: { data: { measurements: wieki.map(pomiar) } },
  });
  const a = await V.savePatient(rekord([60, 66]), { dedup: false });
  await new Promise((r) => { setTimeout(r, 5); });
  await V.savePatient(rekord([60, 66, 80]), { patientId: a.patientId, dedup: false });
  return a.patientId;
});

/* Karta A: zapis (74) na formularzu sprzed 80 — sejf pyta o 80 i czeka na odpowiedź, trzymając blokadę pacjenta.
   Odpowiedź daje test: window.__odpowiedz('scal'). */
async function zapisACzekaNaPytanie(page, patientId) {
  await page.evaluate((id) => {
    const V = window.VildaVault;
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    window.__odpowiedz = null;
    V.setSaveConflictResolver(() => new Promise((r) => { window.__odpowiedz = r; }));
    window.__zapisA = V.savePatient(rekord([60, 66, 74]), {
      patientId: id, dedup: false, baselinePayload: rekord([60, 66]),
    });
  }, patientId);
  await page.waitForFunction(() => typeof window.__odpowiedz === 'function');
}

/* Karta B: ładunek synchronizacji, w którym inne urządzenie dopisało do karty zapis z pomiarem 90. */
const ladunekZInnegoUrzadzenia = (page, patientId) => page.evaluate(async (id) => {
  const p = await window.VildaVault.exportSyncPayload();
  const karta = p.patients.find((x) => x.patientId === id);
  const wzor = karta.snapshots.slice().sort((a, b) => (a.savedAtISO < b.savedAtISO ? 1 : -1))[0];
  const teraz = new Date(Date.now() + 1000).toISOString();
  const tresc = JSON.parse(JSON.stringify(wzor.payload));
  tresc.advanced.data.measurements.push({ uid: 'm-90', ageMonths: 90, ageYears: 7.5, height: 135, weight: 27 });
  karta.snapshots.push(Object.assign({}, wzor, {
    snapshotId: 'e2e-inne-urzadzenie-90', savedAtISO: teraz, updatedAtISO: teraz, rev: 0, payload: tresc,
  }));
  karta.lastSavedAtISO = teraz;
  return p;
}, patientId);

const stanKarty = (page, patientId) => page.evaluate(async (id) => {
  const r = await window.VildaVault.getPatient(id);
  return { liczbaWersji: r.snapshots.length, licznik: r.snapshotCount, ids: r.snapshots.map((s) => s.snapshotId) };
}, patientId);

test.describe('P-SCALANIE-BLOKADA — scalanie synchronizacji czeka na zapis tego pacjenta w innej karcie', () => {
  test('scalanie czeka na odpowiedź w karcie A, potem dopisuje zapis z innego urządzenia', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await nowaKarta(page);
    await zapisACzekaNaPytanie(page, patientId);
    const ladunek = await ladunekZInnegoUrzadzenia(b, patientId);

    await b.evaluate((p) => {
      window.__scal = { koniec: false };
      window.VildaVault.mergeSyncPayload(p).then(
        (w) => { window.__scal = { koniec: true, dodane: w.addedSnapshotCount }; },
        (e) => { window.__scal = { koniec: true, blad: String(e && e.message) }; });
    }, ladunek);
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__scal.koniec), 'scalanie czeka na blokadę z karty A').toBe(false);
    expect((await stanKarty(b, patientId)).liczbaWersji, 'w tym czasie nic nie dopisane').toBe(2);

    await page.evaluate(async () => { window.__odpowiedz('scal'); await window.__zapisA; });
    await b.waitForFunction(() => window.__scal.koniec);
    const wynik = await b.evaluate(() => window.__scal);
    expect(wynik.blad || null).toBeNull();
    expect(wynik.dodane, 'zapis z innego urządzenia dopisany').toBe(1);
    const s = await stanKarty(b, patientId);
    expect(s.liczbaWersji, 'dwa zapisy, zapis A i zapis z innego urządzenia').toBe(4);
    expect(s.licznik, 'licznik wersji w nagłówku').toBe(4);
    expect(s.ids).toContain('e2e-inne-urzadzenie-90');
  });

  test('blokada zajęta dłużej niż limit: MERGE_BUSY bez zmian w karcie, potem to samo scalanie przechodzi', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await nowaKarta(page);
    const ladunek = await ladunekZInnegoUrzadzenia(b, patientId);
    // Karta A trzyma blokadę tego pacjenta (jak czekające pytanie bramy).
    await page.evaluate((id) => {
      window.__zwolnij = null;
      navigator.locks.request(`vilda-save-pat:${id}`, () => new Promise((r) => { window.__zwolnij = r; }));
    }, patientId);
    await page.waitForFunction(() => typeof window.__zwolnij === 'function');

    const blad = await b.evaluate(async (p) => {
      let czekal = 0;
      try {
        await window.VildaVault.mergeSyncPayload(p, { onLockWait: () => { czekal += 1; }, lockTimeoutMs: 1000 });
        return null;
      } catch (e) {
        return { code: e.code, message: e.message, czekal };
      }
    }, ladunek);
    expect(blad && blad.code).toBe('MERGE_BUSY');
    expect(blad.message).toMatch(/^Synchronizacja wstrzymana — pacjent jest właśnie zapisywany w innej karcie/);
    expect(blad.czekal).toBe(1);
    expect((await stanKarty(b, patientId)).liczbaWersji, 'przerwane scalanie niczego nie dopisało').toBe(2);

    await page.evaluate(() => window.__zwolnij());
    const dodane = await b.evaluate(async (p) => (await window.VildaVault.mergeSyncPayload(p)).addedSnapshotCount, ladunek);
    expect(dodane).toBe(1);
    const s = await stanKarty(b, patientId);
    expect(s.liczbaWersji).toBe(3);
    expect(s.licznik).toBe(3);
  });
});
