import { expect, test } from '@playwright/test';

// P-BLOKADA-ZAPISU-WERSJI (decyzja właściciela 2026-09-30: „b) teraz jako osobny PR”) — pozostałe zapisy rekordu
// pacjenta pod tą samą blokadą co „Zapisz dane” (P-ZAPISY-DWIE-KARTY), na prawdziwych Web Locks w dwóch kartach.
//
// Karta A zapisuje pacjenta i sejf pyta „Ktoś inny zmienił ten rekord” (pomiar 80 dopisany wcześniej gdzie indziej);
// lekarz jeszcze nie odpowiedział, więc zapis A trzyma blokadę pacjenta. W tym czasie w karcie B:
//   1. korekta pomiaru w oknie Karty Pacjenta — czeka z komunikatem „Czekam…”, a po odpowiedzi w A trafia do
//      bieżącej wersji (przed zmianą trafiała do wersji sprzed zapisu A i znikała z bieżącej);
//   2. „Zapisz zmiany” w edycji pacjenta — po 30 s ten sam komunikat co przy „Zapisz dane”, z nazwą przycisku;
//   3. usunięcie pomiaru — czeka, a usunięty pomiar nie wraca z zapisem A.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#BlokadaWersji!26aa';
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

/* Karta A: pacjent z pomiarami 60 i 66, potem ktoś dopisuje 80; zapis A (74) na formularzu sprzed 80 — sejf pyta
   o 80 i czeka na odpowiedź, trzymając blokadę pacjenta. Odpowiedź daje test: window.__odpowiedz('scal'). */
async function zapisACzekaNaPytanie(page) {
  const patientId = await page.evaluate(async () => {
    const V = window.VildaVault;
    const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
    const rekord = (wieki) => ({
      name: 'Testowy Jan',
      user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
      advanced: { data: { measurements: wieki.map(pomiar) } },
    });
    const a = await V.savePatient(rekord([60, 66]), { dedup: false });
    await V.savePatient(rekord([60, 66, 80]), { patientId: a.patientId, dedup: false });
    window.__odpowiedz = null;
    V.setSaveConflictResolver(() => new Promise((r) => { window.__odpowiedz = r; }));
    window.__zapisA = V.savePatient(rekord([60, 66, 74]), {
      patientId: a.patientId, dedup: false, baselinePayload: rekord([60, 66]),
    });
    return a.patientId;
  });
  await page.waitForFunction(() => typeof window.__odpowiedz === 'function');
  return patientId;
}

const odpowiedzWA = (page) => page.evaluate(async () => { window.__odpowiedz('scal'); await window.__zapisA; });

const glowa = (page, patientId) => page.evaluate(async (id) => {
  const r = await window.VildaVault.getPatient(id);
  const m = ((r.snapshots[0].payload.advanced || {}).data || {}).measurements || [];
  return {
    liczbaWersji: r.snapshots.length,
    wieki: m.map((x) => x.ageMonths).sort((x, y) => x - y),
    wzrost66: (m.find((x) => x.ageMonths === 66) || {}).height,
  };
}, patientId);

test.describe('P-BLOKADA-ZAPISU-WERSJI — zapisy w miejscu czekają na zapis tego pacjenta w innej karcie', () => {
  test('korekta pomiaru w oknie Karty Pacjenta: „Czekam…”, potem trafia do bieżącej wersji', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await zapisACzekaNaPytanie(page);

    await b.evaluate(async (id) => {
      const r = await window.VildaVault.getPatient(id);
      window.VildaAuthUI.showQuickMeasureModal(id, {
        mode: 'edit', snapshotId: r.snapshots[0].snapshotId, rowRef: { uid: 'm-66', key: null },
        rowValues: { ageMonths: 66, height: 123, weight: 23 },
      });
    }, patientId);
    const okno = b.locator('.vilda-quick-measure-overlay');
    await expect(okno).toBeVisible();
    await okno.locator('input[inputmode="decimal"]').nth(0).fill('150');
    await okno.locator('input[inputmode="decimal"]').nth(1).fill('23');
    await okno.getByRole('button', { name: 'Zapisz korektę' }).click();

    await expect(okno.locator('.vilda-zapis-czeka'), 'komunikat czekania w oknie').toHaveText(CZEKAM);
    await b.waitForTimeout(1500);
    expect((await glowa(b, patientId)).wzrost66, 'korekta czeka — rekord jeszcze bez niej').toBe(123);

    await odpowiedzWA(page);
    await expect(okno, 'okno zamknięte po zapisie').toHaveCount(0);
    const g = await glowa(b, patientId);
    expect(g.wieki, 'bieżąca wersja: pomiary z obu zapisów').toEqual([60, 66, 74, 80]);
    expect(g.wzrost66, 'korekta w bieżącej wersji').toBe(150);
    expect(g.liczbaWersji).toBe(3);
  });

  test('„Zapisz zmiany” po 30 s: ten sam komunikat co przy „Zapisz dane”, bez nowej wersji', async ({ page, context }) => {
    test.setTimeout(90_000);
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    // Ekran edycji otwarty na wersji 2 (80 już jest) — kontrola „ktoś zapisał w międzyczasie” nie ma o co pytać.
    const patientId = await b.evaluate(async () => {
      const V = window.VildaVault;
      const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
      const a = await V.savePatient({
        name: 'Testowy Adam',
        user: { lastName: 'Testowy', firstName: 'Adam', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
        advanced: { data: { measurements: [60, 66].map(pomiar) } },
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
    const zapisz = b.getByRole('button', { name: 'Zapisz zmiany' });
    await expect(zapisz).toBeVisible();
    await zapisz.click();
    await expect(b.locator('.vilda-zapis-czeka'), 'komunikat czekania na ekranie edycji').toHaveText(CZEKAM);
    await expect(b.locator('.vilda-auth-error').filter({ hasText: 'Nie zapisano' }))
      .toHaveText('Nie zapisano — ten pacjent jest nadal zapisywany w innej karcie. Dokończ tam zapis i kliknij „Zapisz zmiany” ponownie.',
        { timeout: 40_000 });
    await expect(b.locator('.vilda-zapis-czeka'), 'komunikat czekania znika po limicie').toHaveCount(0);
    expect((await b.evaluate(async (id) => (await window.VildaVault.getPatient(id)).snapshots.length, patientId)),
      'przerwany zapis niczego nie dopisał').toBe(1);
    await page.evaluate(() => window.__zwolnij());
  });

  test('usunięcie pomiaru w drugiej karcie czeka, a usunięty pomiar nie wraca z zapisem A', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const patientId = await zapisACzekaNaPytanie(page);

    await b.evaluate((id) => {
      window.__usun = { koniec: false };
      window.VildaVault.deleteMeasurementRow(id, { uid: 'm-80' })
        .then(() => { window.__usun.koniec = true; }, (e) => { window.__usun.koniec = true; window.__usun.blad = String(e && e.message); });
    }, patientId);
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__usun.koniec), 'usunięcie czeka na blokadę z karty A').toBe(false);

    await odpowiedzWA(page);
    await b.waitForFunction(() => window.__usun.koniec);
    expect(await b.evaluate(() => window.__usun.blad || null)).toBeNull();
    const g = await glowa(b, patientId);
    expect(g.wieki, 'usunięty pomiar 80 nie wrócił').toEqual([60, 66, 74]);
  });
});
