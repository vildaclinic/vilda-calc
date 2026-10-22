import { expect, test } from '@playwright/test';

async function setMarkerContext(page, value) {
  const marker = page.locator('[data-clcr-marker-context]');
  for (const details of await marker.locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
  await marker.selectOption(value);
}


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
  return page.locator('.clcr-result-card[data-clcr-series="cg"]');
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
    await setMarkerContext(page, 'stable');
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
    await expect(card.locator('.clcr-result-value')).toHaveText('74');
    await expect(card.locator('.clcr-result-interpretation')).toHaveText('Oszacowany klirens kreatyniny');
    await expect(card.locator('.clcr-result-unit')).toHaveText('mL/min');
    await expect(card.locator('[data-clcr-category-control]')).toHaveCount(0);
    await expect(card.locator('.clcr-result-reference-value')).toContainText(/brak uniwersalnej normy/i);
    await expect(card.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(68, 90, 100)');
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
    await expect(page.locator('label:has([data-clcr-marker-context])')).toContainText('Kontekst czynności nerek');
    const report = page.locator('#clcrResultReport');
    await expect(report).toBeVisible();
    await expect(report.locator('[data-clcr-series="cg"]')).toHaveCount(1);
    await expect(report.locator('.clcr-result-value')).toHaveText('74');
    await expect(report.locator('.clcr-result-unit')).toHaveText('mL/min');
    await expect(report.locator('[data-clcr-category-control]')).toHaveCount(0);
    await expect(page.locator('#clcrRailHead, .clcr-rnum')).toHaveCount(0);
    await expect(card.locator('.clcr-result-interpretation')).not.toContainText(/prawidłowy|obniżony|Kategoria GFR/i);
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
    await setMarkerContext(page, 'stable');
    await expect(result(page).locator('.clcr-result-value')).toHaveText(displayed);
    expect(Number(await result(page).getAttribute('data-clcr-value'))).toBeCloseTo(expected, 10);
    await page.locator('#ScrUnit').selectOption('umol');
    await page.locator('#Scr').fill('88.4');
    await expect(result(page).locator('.clcr-result-value')).toHaveText(displayed);
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
  await expect(result(page).locator('.clcr-result-value')).toHaveText('74');
  await expect(page.locator('.clcr-result-details[data-clcr-formula="cg"]')).toContainText('Nie potwierdzono stabilności używanych markerów filtracji');
  await expect(result(page)).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(page.locator('.clcr-result-details[data-clcr-formula="cg"]')).toContainText('Wynik jest wyłącznie oszacowaniem');
  await setMarkerContext(page, 'stable');
  await expect(page.locator('.clcr-result-details[data-clcr-formula="cg"]')).not.toContainText('Nie potwierdzono stabilności');
  for (const state of ['aki', 'rapidlyChanging']) {
    await setMarkerContext(page, state);
    await expect(result(page)).toHaveCount(0);
    await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(0);
    await expect(page.locator('#clcrRailHead')).toBeHidden();
    await expect(page.locator('#clcrInfo')).toContainText(state === 'aki' ? 'AKI' : 'szybko');
    expect(await page.evaluate(() => window.canComputeFormula('cg'))).toBe(false);
  }
  await setMarkerContext(page, 'stable');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('74');
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
  await setMarkerContext(page, 'stable');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('74');
  await selectFormula(page, 'egfr');
  await expect(marker).toHaveValue('stable');
  await expect(page.locator('#weight')).toHaveValue('70');
  await selectFormula(page, 'cg');
  // Zmiana formuły zachowuje dane pacjenta, ale zgodnie z istniejącą polityką
  // czyści pomiar laboratoryjny. Ukrycie tożsamości nie zmienia tej polityki.
  await expect(page.locator('#Scr')).toHaveValue('');
  await page.locator('#Scr').fill('1');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('74');
  saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(saved).toMatchObject({
    fullName: 'Syntetyczna Pacjentka CG', height: '165', weight: '70',
    creatinineState: 'stable', suspectedAKI: false,
  });
});

test('CG zachowuje dolną granicę wieku, a CG indeksowany wymaga wzrostu i zachowuje własny wynik', async ({ page }) => {
  await openCalculator(page);
  await fillCg(page);
  await setMarkerContext(page, 'stable');
  await page.locator('#age').fill('17');
  expect(await page.evaluate(() => window.canComputeFormula('cg'))).toBe(false);
  await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(0);
  await page.locator('#age').fill('18');
  await selectFormula(page, 'cg');
  await page.locator('#Scr').fill('1');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('101');
  expect(Number(await result(page).getAttribute('data-clcr-value'))).toBeCloseTo(100.8194444444, 9);
  await selectFormula(page, 'cg_norm');
  await applySnapshot(page, {
    height: '165', creatinineState: 'stable', suspectedAKI: false,
  }, 2, 'cg_norm');
  await expect(page.locator('#height')).toBeVisible();
  await expect(page.locator('details.clcr-context-details:has([data-clcr-marker-context])')).toHaveCount(1);
  await expect(page.locator('[data-clcr-series="cg"]')).toHaveCount(0);
  const indexed = page.locator('[data-clcr-series="cg_norm"]');
  await expect(indexed).toBeVisible();
  await expect(indexed.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(indexed.locator('.clcr-result-reference-value')).toHaveText('Brak uniwersalnej normy');
  expect(Number(await indexed.getAttribute('data-clcr-value'))).toBeCloseTo(72.6547866225, 8);
  await expect(indexed).toContainText('73');
});
