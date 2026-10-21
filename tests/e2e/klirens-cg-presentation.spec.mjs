import { expect, test } from '@playwright/test';

// Wyłącznie dane syntetyczne. Wartości oczekiwane są niezależnymi przypadkami
// liczbowymi; wynik, konwersję i blokady wykonuje rzeczywisty silnik strony.
async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort(),
  );
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => (
    !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.clcrUpdate === 'function' &&
    typeof window.applyClcrSessionSnapshot === 'function'
  ));
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible().catch(() => false)) await decline.click();
  await selectFormula(page, 'cg');
}

async function selectFormula(page, id) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await page.waitForFunction(value => (
    window.ClcrUiWorkflow.state.activeFormulaId === value &&
    document.getElementById('formulaPicker').value === value &&
    window.clcrIsResetting !== true
  ), id);
}

async function fillCg(page, sex = 'F') {
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill('70');
  await page.locator('#Scr').fill('1');
}

function result(page) {
  return page.locator('.clcr-cg-result[data-clcr-series="cg"]');
}

async function applySnapshot(page, inputs, version = 2, formula = 'cg') {
  const applied = await page.evaluate(({ values, snapshotVersion, formulaId }) => (
    window.applyClcrSessionSnapshot({
      version: snapshotVersion,
      currentVersion: 'basic',
      selectedFormula: formulaId,
      inputs: {
        currentVersion: 'basic', formulaPicker: formulaId,
        age: '50', ageMonths: '0', sex: 'F', weight: '70',
        Scr: '1', ScrUnit: 'mg/dl', ...values,
      },
    }, {
      source: 'e2e-cg-presentation', update: true,
      dispatchEvents: false, preserveAcrossVersions: true,
    })
  ), { values: inputs, snapshotVersion: version, formulaId: formula });
  expect(applied).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`CG wymaga tylko danych obliczenia i ma neutralny wynik bez kategorii G przy ${width}px`, async ({ page }) => {
    await openCalculator(page, width);
    await fillCg(page);
    const marker = page.locator('[data-clcr-marker-context]');
    await expect(marker).toHaveValue('unknown');
    await marker.selectOption('stable');
    if (width === 320) {
      // Czcionka CI zawija „Wiek (lata)” do dwóch wierszy. Taka etykieta
      // nadal musi ustawiać input na wysokości pola płci.
      await page.evaluate(() => {
        document.querySelectorAll('.clcr-field__name').forEach(element => {
          element.style.setProperty('font-family', 'DejaVu Sans', 'important');
        });
      });
    }
    const card = result(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
    await expect(card.locator('.clcr-egfr-value')).toHaveText('74');
    await expect(card.locator('.clcr-egfr-status')).toHaveText('Oszacowany klirens kreatyniny');
    await expect(card.locator('.clcr-egfr-unit')).toHaveText('mL/min');
    await expect(card.locator('.clcr-egfr-category')).toHaveCount(0);
    await expect(card.locator('.clcr-egfr-value')).toHaveCSS('color', 'rgb(68, 90, 100)');
    await expect(page.locator('#fullName')).toBeHidden();
    await expect(page.locator('#height')).toBeHidden();
    await expect(page.locator('#height')).toHaveValue('');
    await expect(page.locator('#ageMonths')).toBeHidden();
    await expect(page.locator('#ScrAssay')).toBeHidden();
    await expect(page.locator('#creatinineState')).toBeHidden();
    await expect(page.locator('#suspectedAKI')).toBeHidden();
    await expect(page.locator('.clcr-progress')).toBeHidden();
    await expect(page.locator('#clcrReadiness')).toBeHidden();
    for (const id of ['age', 'sex', 'weight', 'Scr', 'ScrUnit']) {
      await expect(page.locator(`#${id}`)).toBeVisible();
    }
    await expect(page.locator('label:has(#weight)')).toContainText('Aktualna masa ciała (kg)');
    await expect(page.locator('label:has([data-clcr-marker-context])')).toContainText('Kontekst kreatyniny');
    const rail = page.locator('#clcrRailHead');
    await expect(rail).toBeVisible();
    await expect(rail).toHaveAttribute('data-clcr-tone', 'neutral');
    await expect(rail.locator('.clcr-rnum')).toContainText('74');
    await expect(rail.locator('.clcr-rnum small')).toHaveText('mL/min');
    await expect(rail.locator('.clcr-rail-category')).toHaveCount(0);
    await expect(rail).not.toContainText(/prawidłowy|obniżony|Kategoria GFR/i);
    await expect(page.locator('#clcrInfo')).not.toContainText('Równania zakładają kreatyninę standaryzowaną do IDMS');
    await expect(page.locator('#clcrInfo')).not.toContainText('Do dawkowania sprawdź w ChPL wymagany wzór i jednostkę');
    const geometry = await page.evaluate(() => {
      const box = selector => document.querySelector(selector).getBoundingClientRect();
      return {
        ageSex: Math.abs(box('#age').top - box('#sex').top),
        creatinineUnit: Math.abs(box('#Scr').top - box('#ScrUnit').top),
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.ageSex).toBeLessThanOrEqual(2);
    expect(geometry.creatinineUnit).toBeLessThanOrEqual(2);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
  });
}

for (const [sex, expected, displayed] of [['F', 74.375, '74'], ['M', 87.5, '88']]) {
  test(`CG dla płci ${sex} zachowuje obliczenie i konwersję jednostek oraz zapis historii`, async ({ page }) => {
    await openCalculator(page);
    await fillCg(page, sex);
    await page.locator('[data-clcr-marker-context]').selectOption('stable');
    await expect(result(page).locator('.clcr-egfr-value')).toHaveText(displayed);
    expect(Number(await result(page).getAttribute('data-clcr-value'))).toBeCloseTo(expected, 10);
    await page.locator('#ScrUnit').selectOption('umol');
    await page.locator('#Scr').fill('88.4');
    await expect(result(page).locator('.clcr-egfr-value')).toHaveText(displayed);
    expect(Number(await result(page).getAttribute('data-clcr-value'))).toBeCloseTo(expected, 10);
    const values = await page.evaluate(() => (
      window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'cg' })
    ));
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({
      sourceFormulaId: 'cg', valueNum: Number(displayed), unit: 'mL/min',
    });
  });
}

test('nieznana stabilność pozostawia oszacowanie z ograniczeniem, AKI i szybka zmiana usuwają liczbę', async ({ page }) => {
  await openCalculator(page);
  await fillCg(page);
  const marker = page.locator('[data-clcr-marker-context]');
  await expect(marker).toHaveValue('unknown');
  await expect(result(page).locator('.clcr-egfr-value')).toHaveText('74');
  await expect(result(page)).toContainText('Nie potwierdzono stabilności kreatyniny — wynik orientacyjny');
  await expect(result(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  await marker.selectOption('stable');
  await expect(result(page)).not.toContainText('Nie potwierdzono stabilności');
  for (const state of ['aki', 'rapidlyChanging']) {
    await marker.selectOption(state);
    await expect(result(page)).toHaveCount(0);
    await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(0);
    await expect(page.locator('#clcrRailHead')).toBeHidden();
    await expect(page.locator('#clcrInfo')).toContainText(state === 'aki' ? 'AKI' : 'szybko');
    expect(await page.evaluate(() => window.canComputeFormula('cg'))).toBe(false);
  }
  await marker.selectOption('stable');
  await expect(result(page).locator('.clcr-egfr-value')).toHaveText('74');
});

test('odtworzenie starej sesji zachowuje ukrytą tożsamość, dane i atomowy kontekst kreatyniny', async ({ page }) => {
  await openCalculator(page);
  await page.waitForTimeout(1050);
  await applySnapshot(page, {
    fullName: 'Syntetyczna Pacjentka CG', height: '165',
    creatinineState: 'stable', suspectedAKI: true,
  }, 1);
  const marker = page.locator('[data-clcr-marker-context]');
  await expect(marker).toHaveValue('aki');
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('#fullName')).toBeHidden();
  await expect(page.locator('#fullName')).toHaveValue('Syntetyczna Pacjentka CG');
  expect(await marker.getAttribute('id')).toBeNull();
  expect(await marker.getAttribute('name')).toBeNull();
  let saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(saved).toMatchObject({
    fullName: 'Syntetyczna Pacjentka CG', height: '165',
    creatinineState: 'stable', suspectedAKI: true,
  });
  await marker.selectOption('stable');
  await expect(result(page).locator('.clcr-egfr-value')).toHaveText('74');
  await selectFormula(page, 'egfr');
  await expect(marker).toHaveValue('stable');
  await expect(page.locator('#weight')).toHaveValue('70');
  await selectFormula(page, 'cg');
  // Zmiana formuły zachowuje dane pacjenta, ale zgodnie z istniejącą polityką
  // czyści pomiar laboratoryjny. Ukrycie tożsamości nie zmienia tej polityki.
  await expect(page.locator('#Scr')).toHaveValue('');
  await page.locator('#Scr').fill('1');
  await expect(result(page).locator('.clcr-egfr-value')).toHaveText('74');
  saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(saved).toMatchObject({
    fullName: 'Syntetyczna Pacjentka CG', height: '165', weight: '70',
    creatinineState: 'stable', suspectedAKI: false,
  });
});

test('nie rozszerza CG na dzieci ani kompaktowego widoku na CG indeksowany', async ({ page }) => {
  await openCalculator(page);
  await fillCg(page);
  await page.locator('[data-clcr-marker-context]').selectOption('stable');
  await page.locator('#age').fill('17');
  expect(await page.evaluate(() => window.canComputeFormula('cg'))).toBe(false);
  await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(0);
  await page.locator('#age').fill('18');
  await selectFormula(page, 'cg');
  await page.locator('#Scr').fill('1');
  await expect(result(page).locator('.clcr-egfr-value')).toHaveText('101');
  expect(Number(await result(page).getAttribute('data-clcr-value'))).toBeCloseTo(100.8194444444, 9);
  await selectFormula(page, 'cg_norm');
  await applySnapshot(page, {
    height: '165', creatinineState: 'stable', suspectedAKI: false,
  }, 2, 'cg_norm');
  await expect(page.locator('#height')).toBeVisible();
  await expect(page.locator('#creatinineState')).toBeVisible();
  await expect(page.locator('[data-clcr-marker-context]')).toBeHidden();
  await expect(page.locator('.clcr-cg-result')).toHaveCount(0);
  const indexed = page.locator('[data-clcr-series="cg_norm"]');
  await expect(indexed).toBeVisible();
  expect(Number(await indexed.getAttribute('data-clcr-value'))).toBeCloseTo(72.6547866225, 8);
  await expect(indexed).toContainText('73');
});
