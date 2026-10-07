import { expect, test } from '@playwright/test';

// P-BLOKADA-IMPORT (zlecenie właściciela 2026-10-07, przegląd „co dalej po #518”, punkt 4, część 2) — import karty
// z pliku pod blokadą pacjenta, na prawdziwych Web Locks w dwóch kartach przeglądarki.
//
// Karta A zapisuje pacjenta i sejf pyta „Ktoś inny zmienił ten rekord”; lekarz jeszcze nie odpowiedział, więc zapis A
// trzyma blokadę tego pacjenta. Przed zmianą import w karcie B:
//   - INNEGO pacjenta (z notatką, po jego usunięciu) stał 30 s na blokadzie pacjenta z karty A (koniec scalania kosza
//     w wewnętrznym scalaniu notatek), a notatka z pliku przepadała po cichu;
//   - TEGO pacjenta szedł od razu, w środku zapisu A (licznik wersji i „ostatni zapis” liczone wtedy z odczytu sprzed
//     zapisu — przypadek z dokładnym przeplotem jest w tests/unit/blokada-importu.test.mjs).
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#BlokadaImportu!26aa';

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
  await page.waitForFunction(() => Boolean(window.VildaAuthUI)
    && typeof window.VildaVault.setSaveConflictResolver === 'function');
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

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

/* Karta A: pacjent z pomiarami 60 i 66 (jedna wersja w koszu), potem dopisane 80; zapis A (74) na formularzu sprzed 80
   — sejf pyta o 80 i czeka na odpowiedź, trzymając blokadę pacjenta. Odpowiedź daje test: window.__odpowiedz('scal'). */
async function zapisACzekaNaPytanie(page) {
  const patientId = await page.evaluate(async () => {
    const V = window.VildaVault;
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Kuba',
      user: { lastName: 'Testowy', firstName: 'Kuba', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const a = await V.savePatient(rekord([60]), { dedup: false });
    await V.savePatient(rekord([60, 66]), { patientId: a.patientId, dedup: false });
    await V.savePatient(rekord([60, 66, 80]), { patientId: a.patientId, dedup: false });
    const r = await V.getPatient(a.patientId);
    await V.moveSnapshotToTrash(a.patientId, r.snapshots[r.snapshots.length - 1].snapshotId);
    window.__odpowiedz = null;
    V.setSaveConflictResolver(() => new Promise((res) => { window.__odpowiedz = res; }));
    window.__zapisA = V.savePatient(rekord([60, 66, 74]), {
      patientId: a.patientId, dedup: false, baselinePayload: rekord([60, 66]),
    });
    return a.patientId;
  });
  await page.waitForFunction(() => typeof window.__odpowiedz === 'function');
  return patientId;
}

const odpowiedzWA = (page) => page.evaluate(async () => { window.__odpowiedz('scal'); await window.__zapisA; });

test.describe('P-BLOKADA-IMPORT — import karty i blokada pacjenta w innej karcie', () => {
  test('import INNEGO pacjenta z notatką nie czeka na pytanie bramy w pierwszej karcie i przywraca notatkę', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    // Karta B: pacjent z notatką, plik karty, potem usunięcie.
    const { plik, pid } = await b.evaluate(async () => {
      const V = window.VildaVault;
      const a = await V.savePatient({
        name: 'Probny Piotr',
        user: { lastName: 'Probny', firstName: 'Piotr', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      }, { dedup: false });
      await V.savePatientNote({ patientId: a.patientId, title: 'Morfologia', body: 'Bez odchyleń.', category: 'badanie' });
      const env = await V.exportPatientEnvelope(a.patientId);
      await V.removePatient(a.patientId);
      return { plik: env, pid: a.patientId };
    });
    await zapisACzekaNaPytanie(page);

    const wynik = await b.evaluate(async (a) => {
      const t0 = Date.now();
      const w = await window.VildaVault.importPatientFromEnvelope(a.plik, a.pw);
      const notatki = await window.VildaVault.listPatientNotesForPatient(a.pid);
      return { ms: Date.now() - t0, importedPatientNotes: w.importedPatientNotes, notatki: notatki.map((n) => n.title) };
    }, { plik, pid, pw: HASLO });
    expect(wynik.ms, 'import bez 30-sekundowego czekania na blokadę innego pacjenta').toBeLessThan(10_000);
    expect(wynik.importedPatientNotes).toBe(1);
    expect(wynik.notatki).toEqual(['Morfologia']);

    await odpowiedzWA(page);
  });

  test('import TEGO pacjenta czeka na odpowiedź w pierwszej karcie; potem licznik wersji zgadza się z wersjami', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await zapisACzekaNaPytanie(page);
    const plik = await b.evaluate((id) => window.VildaVault.exportPatientEnvelope(id), patientId);

    await b.evaluate((a) => {
      window.__imp = { koniec: false };
      window.VildaVault.importPatientFromEnvelope(a.plik, a.pw)
        .then((w) => { window.__imp.koniec = true; window.__imp.wynik = w; },
          (e) => { window.__imp.koniec = true; window.__imp.blad = String(e && e.message); });
    }, { plik, pw: HASLO });
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__imp.koniec), 'import czeka na blokadę z karty A').toBe(false);

    await odpowiedzWA(page);
    await b.waitForFunction(() => window.__imp.koniec, null, { timeout: 15_000 });
    expect(await b.evaluate(() => window.__imp.blad || null)).toBeNull();
    const rek = await b.evaluate(async (id) => {
      const r = await window.VildaVault.getPatient(id);
      return { wersje: r.snapshots.length, licznik: r.snapshotCount };
    }, patientId);
    expect(rek.licznik, 'licznik wersji zgadza się z liczbą wersji').toBe(rek.wersje);
  });
});
