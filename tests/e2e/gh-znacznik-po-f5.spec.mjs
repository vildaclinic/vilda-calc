import { expect, test } from '../support/test-czas.mjs';

// P-GH-TOZSAMOSC rata 1 (decyzja właściciela 2026-09-28: opcja (a) w dwóch ratach).
//
// ZNALEZISKO (zbadane hakami na DOM przy audycie P-MINI-WYCZYSC): po zwykłym F5 z pacjentem w formularzu
// odtworzenie wspólnego stanu (vilda_persist_runtime) biegnie w dwóch przebiegach. Pierwszy odbudowuje
// wiersze ręczne i importuje punkty terapii GH (poprawnie, ze znacznikiem data-gh-sync). Drugi woła
// rehydrateAdvancedFromState, które czyści kontener i buduje wiersze WYŁĄCZNIE z modelu pomiarów
// ręcznych — be() celowo odsiewa wiersze ghSync, bo ich źródłem prawdy jest monitor terapii. Import
// z pierwszego przebiegu przepada, a parowanie zaawansowane↔spożycie dokleja z tabeli spożycia
// bliźniaka 13 lat 1 mies. / 139,9 cm bez znacznika. Import punktów (ghReczny) uznaje go za wiersz
// ręczny i punktu już nie oznacza. Skutek dla lekarza: punkt terapii wygląda jak pomiar ręczny.
//
// REGUŁA po racie 1: przebudowa tabeli z modelu nigdy nie kasuje wierszy punktów terapii — są odłączane
// przed czyszczeniem i doklejane po zbudowaniu wierszy ręcznych (obie funkcje przebudowujące).
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhF5!2026a';
// Dziewczynka 14 lat, 148,5 cm; wiersz ręczny 11 lat / 123,9 cm; punkt terapii 13 lat 1 mies. / 139,9 cm.
const PUNKT_GH = { id: 'gh-e2e-f5', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, type: 'gh' };

const wiersze = (page) => page.evaluate(() => Array.from(document.querySelectorAll('#advMeasurements .measure-row'))
  .map((r) => ({
    y: r.querySelector('.adv-age-years')?.value, m: r.querySelector('.adv-age-months')?.value,
    h: r.querySelector('.adv-height')?.value, gh: r.getAttribute('data-gh-sync') === 'true', id: r.getAttribute('data-gh-id') || '',
  }))
  .filter((r) => r.h !== ''));

async function otworz(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaProAccess));
  // Historia terapii wymaga trybu profesjonalnego. Usunięcie disabled bez
  // włączenia tego trybu ścigało się z kontrolą dostępu, która chowała kartę.
  await page.evaluate(() => {
    window.VildaProAccess.hasAccess = () => true;
    document.dispatchEvent(new CustomEvent('vildaProAccessChanged', { detail: { plan: 'pro' } }));
    const tryb = document.getElementById('resultsModeToggle');
    if (!tryb.checked) {
      tryb.checked = true;
      tryb.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
  await expect(page.locator('#resultsModeToggle')).toBeChecked();
}

async function policzPacjentke(page) {
  await page.fill('#lastName', 'Probna');
  await page.fill('#firstName', 'Alicja');
  await page.evaluate(() => {
    const set = (id, v) => {
      const e = document.getElementById(id);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('age', '14'); set('ageMonths', '0'); set('sex', 'F'); set('height', '148.5'); set('weight', '50.5');
    if (typeof window.update === 'function') window.update();
  });
  await page.waitForSelector('#toggleAdvancedGrowth[data-vilda-advanced-growth-toggle-attached="true"]', { state: 'attached' });
  await expect(page.locator('#toggleAdvancedGrowth')).toBeEnabled();
  if (!await page.locator('#advancedGrowthForm').isVisible()) await page.locator('#toggleAdvancedGrowth').click();
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => { const e = w.querySelector(sel); if (e) { e.value = v; e.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
    window.calculateGrowthAdvanced();
  });
  // Punkt terapii wchodzi tak, jak wprowadza go monitor leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT_GH);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await page.waitForFunction(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM) === 11);
}

test('po F5 z pacjentem w formularzu punkt terapii GH wraca ZE znacznikiem, bez bliźniaka', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await policzPacjentke(page);
  await expect.poll(() => wiersze(page), { message: 'przed F5: wiersz ręczny i oznaczony punkt terapii' }).toEqual([
    { y: '11', m: '0', h: '123.9', gh: false, id: '' },
    { y: '13', m: '1', h: '139.9', gh: true, id: 'gh-e2e-f5' },
  ]);

  // Jak u lekarza: zapis pacjenta do sejfu (to ustawia lastLoadedData i drugi przebieg odtworzenia po F5),
  // chwila na odroczony autozapis wspólnego stanu, potem F5.
  await page.locator('#saveDataBtnSidebar').click();
  await expect.poll(() => page.evaluate(async () => (await window.VildaVault.listPatients()).length),
    { message: 'sejf ma zapisanego pacjenta' }).toBe(1);
  await page.waitForTimeout(2500);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.calculateGrowthAdvanced === 'function');
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await expect(page.locator('#height'), 'F5 odtwarza ostatni pomiar').toHaveValue('148.5', { timeout: 15000 });

  // Zgłoszony przebieg (przed poprawką): rows = [123,9 ręczny, 139,9 BEZ znacznika] — punkt terapii
  // przebudowany z modelu i z tabeli spożycia udaje pomiar ręczny. Po poprawce znacznik i id zostają.
  await page.waitForTimeout(3000);
  const po = await wiersze(page);
  expect(po.filter((r) => r.h === '139.9'), 'jeden wiersz 139,9 — punkt terapii ze znacznikiem, bez bliźniaka').toEqual([
    { y: '13', m: '1', h: '139.9', gh: true, id: 'gh-e2e-f5' },
  ]);
  expect(po.filter((r) => r.h === '123.9'), 'wiersz ręczny zostaje ręczny').toEqual([
    { y: '11', m: '0', h: '123.9', gh: false, id: '' },
  ]);
  // Tempo wzrastania nadal liczy się z punktu terapii (odstęp 11 mies.), nie z wiersza sprzed trzech lat.
  await expect.poll(() => page.evaluate(() => Number(window.advancedGrowthData && window.advancedGrowthData.growthVelocityGapM)),
    { message: 'odstęp do ostatniego pomiaru z punktu terapii' }).toBe(11);
});
