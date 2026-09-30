import { expect, test } from '../support/test-czas.mjs';

// P-GH-BLOKADA (U1, 2026-09-30). Wiersz punktu terapii GH w karcie „Zaawansowane obliczenia wzrostowe”
// i jego lustro w tabeli „Szacowane spożycie” (strona główna) są projekcją punktu z monitora leczenia GH.
//
// ZMIERZONE przed zmianą (audyt przepływu GH, U1; `audyt` ca9638d):
// - w wierszu GH karty zablokowany był tylko wiek; wzrost 139,9 → 140,4 przechodził do lustra w tabeli
//   spożycia, punkt zostawał przy 139,9, a ponowny import cofał kartę, ale nie tabelę;
// - lustro w tabeli spożycia było w pełni edytowalne (także wiek), a jego edycja przechodziła do karty;
// - × przy wierszu GH (w karcie i w tabeli) usuwał wiersz i lustro, a punkt zostawał — wiersz wracał
//   przy następnym imporcie.
//
// REGUŁA: te pola i × są tylko do odczytu; pomiar punktu poprawia się w monitorze. Karta — disabled
// (jak wiek), tabela spożycia — readOnly, bo odtwarzanie stanu uznaje wiersz z czterema polami disabled
// za zablokowany wiersz bieżącego pomiaru. Wiersze ręczne zostają edytowalne.
// Dane wyłącznie FIKCYJNE; własne konto sejfu w efemerycznym profilu.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#GhBlokada!2026a';
const PUNKT = {
  id: 'gh-e2e-blokada', type: 'continue', ageYears: 13, ageMonths: 1, height: 139.9, weight: 45, boneAge: 12.5,
  dose: 0.033, doseUnit: 'mg/kg/d', doseAbs: 1.49, drug: 'Omnitrope 5 mg', program: 'SNP',
};

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
  await gotowa(page);
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
}

async function pacjentkaZPunktem(page) {
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
  await page.evaluate(() => {
    const t = document.getElementById('toggleAdvancedGrowth');
    const f = document.getElementById('advancedGrowthForm');
    if (f && getComputedStyle(f).display !== 'none') return;
    if (t) { t.disabled = false; t.click(); }
  });
  await expect(page.locator('#advancedGrowthForm')).toBeVisible({ timeout: 10000 });
  await page.waitForSelector('#advMeasurements .measure-row', { state: 'attached', timeout: 10000 });
  await page.evaluate(() => {
    const w = document.querySelector('#advMeasurements .measure-row');
    const set = (sel, v) => {
      const e = w.querySelector(sel);
      e.value = v;
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    };
    set('.adv-age-years', '11'); set('.adv-age-months', '0'); set('.adv-height', '123.9'); set('.adv-weight', '35');
    window.calculateGrowthAdvanced();
  });
  // Punkt terapii wchodzi tak, jak wprowadza go monitor leczenia GH.
  await page.evaluate((p) => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [p], { force: true });
    window.ghTherapyPoints = [p];
  }, PUNKT);
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(wierszGhKarty(page)).toHaveCount(1);
  await expect(lustroGh(page)).toHaveCount(1);
}

const wierszGhKarty = (page) => page.locator(`#advMeasurements .measure-row[data-gh-id="${PUNKT.id}"]`);
const lustroGh = (page) => page.locator(`#intakeMeasurements .measure-row-intake[data-gh-id="${PUNKT.id}"]`);
const wierszRecznyKarty = (page) => page.locator('#advMeasurements .measure-row:not([data-gh-id])')
  .filter({ has: page.locator('.adv-height') }).first();
const lustroReczne = (page) => page.locator('#intakeMeasurements .measure-row-intake:not([data-gh-id]):not([data-locked="true"])').first();

const POLA_KARTY = ['.adv-age-years', '.adv-age-months', '.adv-height', '.adv-weight', '.adv-bone-age'];
const POLA_TABELI = ['.intake-ageY', '.intake-ageM', '.intake-ht', '.intake-wt'];

async function wartosci(page) {
  return page.evaluate((id) => {
    const k = document.querySelector(`#advMeasurements .measure-row[data-gh-id="${id}"]`);
    const t = document.querySelector(`#intakeMeasurements .measure-row-intake[data-gh-id="${id}"]`);
    const [p] = window.VildaPersistence.readModuleJSON('GH_THERAPY_POINTS', []);
    return {
      karta: k ? [k.querySelector('.adv-height').value, k.querySelector('.adv-weight').value] : null,
      tabela: t ? [t.querySelector('.intake-ht').value, t.querySelector('.intake-wt').value] : null,
      punkt: p ? [String(p.height), String(p.weight)] : null,
    };
  }, PUNKT.id);
}

test('A: pola i × wiersza punktu GH w karcie zaawansowanej są zablokowane; wiersz ręczny zostaje edytowalny', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page);
  const gh = wierszGhKarty(page);
  for (const s of POLA_KARTY) await expect(gh.locator(s), s).toBeDisabled();
  await expect(gh.locator('.remove-measure')).toBeDisabled();
  await expect(gh.locator('.adv-height')).toHaveAttribute('title', /Monitorowanie leczenia hormonem wzrostu/);
  await expect(gh.locator('.remove-measure')).toHaveAttribute('title', /usuń go w module/);

  const reczny = wierszRecznyKarty(page);
  for (const s of POLA_KARTY) await expect(reczny.locator(s), s).toBeEditable();
  await expect(reczny.locator('.remove-measure')).toBeEnabled();
  await expect(reczny.locator('.remove-measure')).toHaveAttribute('title', 'Usuń ten pomiar');
});

test('B: lustro punktu GH w tabeli spożycia jest tylko do odczytu, × zablokowany; wiersz ręczny i bieżący bez zmian', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page);
  const lustro = lustroGh(page);
  for (const s of POLA_TABELI) {
    await expect(lustro.locator(s), s).not.toBeEditable();
    await expect(lustro.locator(s), s).toBeEnabled();
    await expect(lustro.locator(s), s).toHaveJSProperty('readOnly', true);
  }
  await expect(lustro.locator('.remove-intake-row')).toBeDisabled();
  await expect(lustro).not.toHaveAttribute('data-locked', 'true');

  const reczne = lustroReczne(page);
  await expect(reczne.locator('.intake-ht')).toHaveValue('123.9');
  for (const s of POLA_TABELI) await expect(reczne.locator(s), s).toBeEditable();
  await expect(reczne.locator('.remove-intake-row')).toBeEnabled();

  // Wiersz bieżącego pomiaru (pierwszy, data-locked) zostaje zablokowany tak jak dotąd.
  const biezacy = page.locator('#intakeMeasurements .measure-row-intake[data-locked="true"]');
  await expect(biezacy).toHaveCount(1);
  for (const s of POLA_TABELI) await expect(biezacy.locator(s), s).toBeDisabled();
});

test('C: po F5 karta, lustro w tabeli spożycia i punkt mają ten sam pomiar, a lustro nie staje się wierszem bieżącym', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page);
  expect(await wartosci(page)).toEqual({ karta: ['139.9', '45'], tabela: ['139.9', '45'], punkt: ['139.9', '45'] });

  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  await expect(wierszGhKarty(page)).toHaveCount(1, { timeout: 15000 });
  await expect(lustroGh(page)).toHaveCount(1, { timeout: 15000 });
  expect(await wartosci(page)).toEqual({ karta: ['139.9', '45'], tabela: ['139.9', '45'], punkt: ['139.9', '45'] });

  const lustro = lustroGh(page);
  await expect(lustro).not.toHaveAttribute('data-locked', 'true');
  for (const s of POLA_TABELI) await expect(lustro.locator(s), s).not.toBeEditable();
  await expect(page.locator('#intakeMeasurements .measure-row-intake[data-locked="true"]')).toHaveCount(1);
  for (const s of ['.adv-height', '.adv-weight', '.adv-bone-age']) await expect(wierszGhKarty(page).locator(s), s).toBeDisabled();
});

test('D: wiersz, który przestaje być wierszem punktu, wraca do edycji; ręczne wiersze po usunięciu punktu są edytowalne', async ({ page }) => {
  test.setTimeout(120_000);
  await otworz(page);
  await pacjentkaZPunktem(page);
  // Zdjęcie tożsamości punktu z lustra (droga obronna: element wiersza użyty ponownie jako ręczny).
  await page.evaluate((id) => {
    const t = document.querySelector(`#intakeMeasurements .measure-row-intake[data-gh-id="${id}"]`);
    t.setAttribute('data-gh-marker-test', '1');
    t.removeAttribute('data-gh-id');
    t.removeAttribute('data-gh-sync');
  }, PUNKT.id);
  const byly = page.locator('#intakeMeasurements .measure-row-intake[data-gh-marker-test="1"]');
  for (const s of POLA_TABELI) await expect(byly.locator(s), s).toBeEditable();
  await expect(byly.locator('.remove-intake-row')).toBeEnabled();
  await expect(byly.locator('.intake-ht')).not.toHaveClass(/vild-pole-z-kartoteki/);

  // Usunięcie punktu w pamięci modułu (tak jak robi to monitor) i ponowny import: zostają tylko wiersze ręczne.
  await page.evaluate(() => {
    window.VildaPersistence.writeModuleJSON('GH_THERAPY_POINTS', [], { force: true });
    window.ghTherapyPoints = [];
  });
  await page.evaluate(() => window.importTherapyPointsToAdvancedGrowth());
  await expect(wierszGhKarty(page)).toHaveCount(0);
  const reczny = wierszRecznyKarty(page);
  for (const s of POLA_KARTY) await expect(reczny.locator(s), s).toBeEditable();
});
