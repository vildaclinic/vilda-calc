import { expect, test } from '@playwright/test';

// P-ZAPIS-USUNIETEJ (decyzja właściciela 2026-10-08, przegląd „co dalej po #518”, punkt A13) — zapis do karty, której
// już nie ma, na prawdziwej przeglądarce w dwóch kartach.
//
// Karta A ma wczytanego pacjenta X w kalkulatorze (albo otwartą edycję jego karty). W karcie B lekarz scala X z kartą Y
// („Scal pacjentów”) albo usuwa X. Przed zmianą (audyt 8c13b80) „Zapisz dane” w karcie A zakładał X od nowa z jedną
// wersją — na liście wracał duplikat albo usunięty pacjent, a pasek mówił „Zapisano nowego pacjenta”. Po zmianie: pasek
// mówi, z którą kartą pacjenta scalono, nic nie jest zapisane, formularz zostaje; drugie „Zapisz dane” dopisuje dane
// do karty Y z zachowaniem jej pomiarów. Edycja karty usuniętej: komunikat i zablokowany „Zapisz zmiany”.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#ZapisUsunietej!26aa';

const rekord = (wiersze) => ({
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 5, ageMonths: 6, height: 108, weight: 18 },
  growthBasic: { data: { measurements: wiersze.map(([m, h, w]) => ({ ageMonths: m, ageYears: m / 12, height: h, weight: w })) } },
});

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
  await page.waitForFunction(() => typeof window.saveUserData === 'function'
    && typeof window.collectUserData === 'function' && Boolean(window.VildaAuthUI));
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

/* Wczytanie jak lekarz: Karta Pacjenta → „Wczytaj tego pacjenta” → „Nowy pomiar”, potem dzisiejsza wizyta. */
async function wczytaj(page, patientId) {
  await page.evaluate((id) => window.VildaAuthUI.showPatientCard(id,
    (r) => { if (r) window.applyLoadedData(r); }, null), patientId);
  await page.getByRole('button', { name: 'Wczytaj tego pacjenta' }).click();
  await expect(page.locator('#vildaLoadChoiceModal')).toBeVisible();
  await page.locator('#vildaLcmNew').click();
  await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  await page.waitForFunction((id) => window._vildaCurrentPatientId === id, patientId);
  await page.waitForTimeout(1500); // kaskada zerowania pól wizyty
  await page.fill('#age', '6');
  await page.fill('#ageMonths', '0');
  await page.fill('#height', '112');
  await page.fill('#weight', '20');
}

async function dopiszPomiar(page, { lat, mies, wzrost, masa }) {
  await page.evaluate(() => {
    const f = document.getElementById('growthCalculationsForm');
    if (f && getComputedStyle(f).display === 'none') document.getElementById('toggleGrowthCalculations').click();
  });
  await page.getByRole('button', { name: 'Dodaj kolejny pomiar' }).click();
  await page.evaluate((w) => {
    const wiersze = document.querySelectorAll('#basicGrowthMeasurements .measure-row');
    const r = wiersze[wiersze.length - 1];
    const ustaw = (sel, v) => {
      const e = r.querySelector(sel);
      e.value = String(v);
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    ustaw('.bg-age-years', w.lat);
    ustaw('.bg-age-months', w.mies);
    ustaw('.bg-height', w.wzrost);
    ustaw('.bg-weight', w.masa);
  }, { lat, mies, wzrost, masa });
  await expect.poll(() => page.evaluate(() => ((((window.collectUserData() || {}).growthBasic || {})
    .data || {}).measurements || []).map((m) => m.ageMonths))).toContain(lat * 12 + mies);
}

const zapisz = (page) => page.locator('#saveDataBtnSidebar').click();
const pasek = (page) => page.locator('#vildaStatusSide');

/* Pomiary bieżącej wersji: wiersze historii (obie sekcje — formularz dzieli je między „podstawowe” i „zaawansowane”)
   oraz bieżąca wizyta z pól pacjenta. */
const wiekiGlowy = (page, patientId) => page.evaluate(async (id) => {
  const r = await window.VildaVault.getPatient(id);
  if (!r) return null;
  const p = r.snapshots[0].payload;
  const wiersze = ['growthBasic', 'advanced'].flatMap((l) => (((p[l] || {}).data || {}).measurements || []));
  const wynik = new Set(wiersze.map((m) => `${m.ageMonths}:${m.height}`));
  const u = p.user || {};
  if (u.age != null && u.height != null) wynik.add(`${Number(u.age) * 12 + Number(u.ageMonths || 0)}:${Number(u.height)}`);
  return [...wynik].sort();
}, patientId);

const liczbaKart = (page) => page.evaluate(async () => (await window.VildaVault.listPatients()).length);

test.describe('P-ZAPIS-USUNIETEJ — zapis do karty scalonej albo usuniętej w innej karcie', () => {
  test('„Zapisz dane” po scaleniu w drugiej karcie: odmowa z nazwą karty, a drugi klik dopisuje do niej', async ({ page, context }) => {
    test.setTimeout(120_000);
    const userId = await pierwszaKarta(page);
    const { x, y } = await page.evaluate(async (r) => {
      const V = window.VildaVault;
      const a = await V.savePatient(r.x, { dedup: false });
      const b = await V.savePatient(Object.assign({}, r.y, { ghTherapyPoints: [{ ageMonths: 54, dose: 0.03 }], birth: { weightG: 3200 } }), { dedup: false });
      return { x: a.patientId, y: b.patientId };
    }, { x: rekord([[60, 105, 17], [66, 108, 18]]), y: rekord([[48, 98, 15], [54, 101, 16]]) });
    const kartaB = await kolejnaKarta(context, userId);

    await wczytaj(page, x);
    await dopiszPomiar(page, { lat: 6, mies: 0, wzrost: 112, masa: 20 });
    await kartaB.evaluate(async (ids) => window.VildaVault.mergePatients(ids.x, ids.y), { x, y });

    await page.bringToFront();
    await zapisz(page);
    await expect(pasek(page)).toContainText('Nie zapisano — tego pacjenta scalono z kartą „Testowy Jan”. Dane w formularzu zostały.');
    expect(await page.evaluate(() => ((window.collectUserData().growthBasic || {}).data || {}).measurements
      .map((m) => m.ageMonths)), 'formularz bez zmian').toContain(72);
    expect(await wiekiGlowy(page, x), 'X nie wraca').toBeNull();
    expect(await liczbaKart(page), 'bez duplikatu').toBe(1);

    await zapisz(page);
    await expect(pasek(page)).toContainText('Zapisano');
    expect(await wiekiGlowy(page, y), 'pomiary Y zostają, nowy pomiar trafia do Y')
      .toEqual(['48:98', '54:101', '60:105', '66:108', '72:112'].sort());
    expect(await page.evaluate(async (id) => {
      const g = (await window.VildaVault.getPatient(id)).snapshots[0].payload;
      return { punkty: g.ghTherapyPoints, urodzenie: g.birth, plec: g.user && g.user.sex };
    }, y), 'P-ZAPIS-USUNIETEJ-2: dane karty Y zostają w bieżącej wersji')
      .toEqual({ punkty: [{ ageMonths: 54, dose: 0.03 }], urodzenie: { weightG: 3200 }, plec: 'M' });
    expect(await wiekiGlowy(page, x)).toBeNull();
    expect(await liczbaKart(page)).toBe(1);
  });

  test('edycja karty usuniętej w drugiej karcie: komunikat, „Zapisz zmiany” zablokowany, pacjent nie wraca', async ({ page, context }) => {
    test.setTimeout(120_000);
    const userId = await pierwszaKarta(page);
    const x = await page.evaluate(async (r) => (await window.VildaVault.savePatient(r, { dedup: false })).patientId,
      rekord([[60, 105, 17], [66, 108, 18]]));
    const kartaB = await kolejnaKarta(context, userId);

    await page.evaluate((id) => window.VildaAuthUI.showPatientEditScreen(id), x);
    const zapiszZmiany = page.getByRole('button', { name: 'Zapisz zmiany' });
    await expect(zapiszZmiany).toBeVisible();
    await kartaB.evaluate(async (id) => window.VildaVault.removePatient(id), x);

    await page.bringToFront();
    await zapiszZmiany.click();
    await expect(page.getByText('Nie zapisano — tego pacjenta usunięto albo scalono z inną kartą. Wpisanych zmian nie zapisano.')).toBeVisible();
    await expect(zapiszZmiany).toBeDisabled();
    expect(await wiekiGlowy(page, x), 'X nie wraca').toBeNull();
    expect(await liczbaKart(page)).toBe(0);
  });
});
