import { expect, test } from '@playwright/test';

// P-BLOKADA-USUWANIE (zlecenie właściciela 2026-10-06, przegląd „co dalej po #518”, punkt 4) — usunięcie pacjenta
// i scalanie duplikatów pod blokadą pacjenta, na prawdziwych Web Locks w dwóch kartach.
//
// Karta A zapisuje pacjenta i sejf pyta „Ktoś inny zmienił ten rekord”; lekarz jeszcze nie odpowiedział, więc zapis A
// trzyma blokadę pacjenta. Przed zmianą karta B usuwała pacjenta od razu, a zapis A po odpowiedzi odtwarzał kartę
// z jedną wersją (historia i notatki skasowane), bez nagrobka. Scalanie duplikatów w karcie B kasowało razem ze
// źródłem wersję, którą A zapisała w tym czasie.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#BlokadaUsuwania!26aa';
const CZEKAM = 'Czekam — ten pacjent jest zapisywany w innej karcie';

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

/* Karta A: pacjent z pomiarami 60 i 66 (+ notatka), potem dopisane 80; zapis A (74) na formularzu sprzed 80 — sejf
   pyta o 80 i czeka na odpowiedź, trzymając blokadę pacjenta. Odpowiedź daje test: window.__odpowiedz('scal'). */
async function zapisACzekaNaPytanie(page, imie = 'Jan') {
  const patientId = await page.evaluate(async (im) => {
    const V = window.VildaVault;
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: `Testowy ${im}`,
      user: { lastName: 'Testowy', firstName: im, sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const a = await V.savePatient(rekord([60, 66]), { dedup: false });
    await V.savePatient(rekord([60, 66, 80]), { patientId: a.patientId, dedup: false });
    await V.savePatientNote({ patientId: a.patientId, title: 'Morfologia', body: 'Bez odchyleń.', category: 'badanie' });
    window.__odpowiedz = null;
    V.setSaveConflictResolver(() => new Promise((r) => { window.__odpowiedz = r; }));
    window.__zapisA = V.savePatient(rekord([60, 66, 74]), {
      patientId: a.patientId, dedup: false, baselinePayload: rekord([60, 66]),
    });
    return a.patientId;
  }, imie);
  await page.waitForFunction(() => typeof window.__odpowiedz === 'function');
  return patientId;
}

const odpowiedzWA = (page) => page.evaluate(async () => { window.__odpowiedz('scal'); await window.__zapisA; });

const stan = (page, id) => page.evaluate(async (pid) => {
  const V = window.VildaVault;
  const r = await V.getPatient(pid);
  const ladunek = await V.exportSyncPayload();
  return {
    karta: Boolean(r),
    wersje: r ? r.snapshots.length : 0,
    notatki: (await V.listPatientNotesForPatient(pid)).length,
    nagrobek: (ladunek.tombstones || []).some((t) => t.patientId === pid),
  };
}, id);

test.describe('P-BLOKADA-USUWANIE — usunięcie i scalanie duplikatów czekają na zapis tego pacjenta w innej karcie', () => {
  test('„Usuń pacjenta” w drugiej karcie: „Czekam…”, a po odpowiedzi w pierwszej karta znika w całości, z nagrobkiem', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await zapisACzekaNaPytanie(page);

    await b.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
    b.once('dialog', (d) => d.accept()); // „Usunąć pacjenta … wraz z całą historią?”
    await b.getByRole('button', { name: 'Usuń pacjenta' }).click();
    await expect(b.locator('.vilda-zapis-czeka'), 'komunikat czekania na ekranie edycji').toHaveText(CZEKAM);
    await b.waitForTimeout(1000);
    expect((await stan(b, patientId)).karta, 'usunięcie czeka — karta jeszcze jest').toBe(true);

    await odpowiedzWA(page);
    await expect.poll(() => stan(b, patientId), { timeout: 15_000 })
      .toEqual({ karta: false, wersje: 0, notatki: 0, nagrobek: true });
    await expect(b.locator('.vilda-zapis-czeka')).toHaveCount(0);
  });

  test('„Usuń pacjenta” po 30 s: komunikat, że nic nie usunięto; karta zostaje', async ({ page, context }) => {
    test.setTimeout(90_000);
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await b.evaluate(async () => {
      const a = await window.VildaVault.savePatient({
        name: 'Testowy Adam',
        user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      }, { dedup: false });
      return a.patientId;
    });
    // Karta A trzyma blokadę tego pacjenta (jak czekające pytanie bramy) do końca testu.
    await page.evaluate((id) => {
      window.__zwolnij = null;
      navigator.locks.request(`vilda-save-pat:${id}`, () => new Promise((r) => { window.__zwolnij = r; }));
    }, patientId);
    await page.waitForFunction(() => typeof window.__zwolnij === 'function');

    await b.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), patientId);
    b.once('dialog', (d) => d.accept());
    await b.getByRole('button', { name: 'Usuń pacjenta' }).click();
    await expect(b.locator('.vilda-zapis-czeka')).toHaveText(CZEKAM);
    await expect(b.locator('.vilda-auth-error').filter({ hasText: 'Nie usunięto' }))
      .toHaveText('Nie usunięto — ten pacjent jest nadal zapisywany w innej karcie. Dokończ tam zapis i usuń pacjenta ponownie.',
        { timeout: 40_000 });
    await expect(b.locator('.vilda-zapis-czeka'), 'komunikat czekania znika po limicie').toHaveCount(0);
    expect(await stan(b, patientId)).toEqual({ karta: true, wersje: 1, notatki: 0, nagrobek: false });
    await page.evaluate(() => window.__zwolnij());
  });

  test('scalanie duplikatów w drugiej karcie czeka na zapis źródła; wersja z tego zapisu trafia do celu', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const zrodlo = await zapisACzekaNaPytanie(page);
    const cel = await b.evaluate(async () => {
      const a = await window.VildaVault.savePatient({
        name: 'Testowy Jan',
        user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
        advanced: { data: { measurements: [{ uid: 'm-48', ageMonths: 48, ageYears: 4, height: 104, weight: 17 }] } },
      }, { dedup: false });
      return a.patientId;
    });

    await b.evaluate((ids) => {
      window.__scal = { koniec: false };
      window.VildaVault.mergePatients(ids.zrodlo, ids.cel)
        .then((w) => { window.__scal.koniec = true; window.__scal.wynik = w; },
          (e) => { window.__scal.koniec = true; window.__scal.blad = String(e && e.message); });
    }, { zrodlo, cel });
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__scal.koniec), 'scalanie czeka na blokadę źródła z karty A').toBe(false);

    await odpowiedzWA(page);
    await b.waitForFunction(() => window.__scal.koniec, null, { timeout: 15_000 });
    expect(await b.evaluate(() => window.__scal.blad || null)).toBeNull();
    // Źródło miało 3 wersje (z zapisem A), cel 1; scalenie dokłada wersję scaloną.
    expect(await stan(b, cel)).toEqual({ karta: true, wersje: 5, notatki: 1, nagrobek: false });
    expect(await stan(b, zrodlo)).toEqual({ karta: false, wersje: 0, notatki: 0, nagrobek: true });
    const wieki = await b.evaluate(async (id) => {
      const r = await window.VildaVault.getPatient(id);
      return (((r.snapshots[0].payload.advanced || {}).data || {}).measurements || []).map((m) => m.ageMonths).sort((x, y) => x - y);
    }, cel);
    expect(wieki, 'bieżąca wersja celu ma pomiar 74 z zapisu A').toEqual([48, 60, 66, 74, 80]);
  });
});
