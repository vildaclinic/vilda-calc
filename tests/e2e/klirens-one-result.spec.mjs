import { expect, test } from '@playwright/test';

// Wyłącznie dane syntetyczne; test korzysta z produkcyjnego formularza i silnika.
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
    typeof window.applyClcrSessionSnapshot === 'function'
  ));
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible().catch(() => false)) await decline.click();
}

async function selectFormula(page, id) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await page.waitForFunction(value => (
    window.ClcrUiWorkflow.state.activeFormulaId === value &&
    document.getElementById('formulaPicker').value === value &&
    window.clcrIsResetting !== true
  ), id);
}

async function openFieldDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
}

async function fillField(page, selector, value) {
  await openFieldDetails(page, selector);
  await page.locator(selector).fill(value);
}

async function selectField(page, selector, value) {
  await openFieldDetails(page, selector);
  await page.locator(selector).selectOption(value);
}

function card(page, id) {
  return page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${id}"]`);
}

async function expectSingleResult(page, id, displayed) {
  await expect(page.locator('#clcrResultReport')).toHaveCount(1);
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page, id)).toBeVisible();
  await expect(card(page, id).locator('.clcr-result-value')).toHaveText(displayed);
  await expect(page.locator('#clcrRailHead, .clcr-rnum')).toHaveCount(0);
  await expect(page.locator('#clcrReadiness')).toBeHidden();
  await expect(page.locator('.clcr-progress')).toBeHidden();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function fillAcr(page) {
  await selectFormula(page, 'ACR');
  await page.locator('#U_Alb').fill('45');
  await page.locator('#Ucr_spot').fill('100');
  await fillField(page, '#age', '50');
  await selectField(page, '#spotSampleKind', 'firstMorning');
  await selectField(page, '#ui_spotSameSpecimen_answer', 'yes');
}

for (const width of [320, 390, 1440]) {
  test(`B: U25 przy ${width}px pokazuje pojedyncze 83 mimo pustych miesięcy i nieznanego kontekstu`, async ({ page }) => {
    await openCalculator(page, width);
    await selectFormula(page, 'ckid_u25');
    await page.locator('#age').fill('10');
    await page.locator('#sex').selectOption('F');
    await page.locator('#height').fill('140');
    await page.locator('#Scr').fill('0.6');
    await expect(page.locator('#ageMonths')).toHaveValue('');
    await expect(page.locator('[data-clcr-marker-context]')).toHaveValue('unknown');
    await expectSingleResult(page, 'ckid_u25', '83');
    expect(Number(await card(page, 'ckid_u25').getAttribute('data-clcr-value'))).toBeCloseTo(82.90160199882423, 8);
    await expect(card(page, 'ckid_u25')).toHaveAttribute('data-clcr-tone', 'warning');
    await expect(card(page, 'ckid_u25').locator('.clcr-result-interpretation')).toHaveText('Oszacowanie poniżej normy dla wieku');
    await expect(card(page, 'ckid_u25')).toHaveAttribute('data-clcr-category', '');
    await expect(card(page, 'ckid_u25').locator('[data-clcr-category-control]')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport [data-clcr-category-row][aria-current="true"]')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport')).not.toContainText(/4\s*\/\s*4|pełna interpretacja|komplet danych/i);
    const saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
    expect(saved.creatinineState).toBe('unknown');
    expect(saved.suspectedAKI).toBe(false);
  });

  test(`B: ACR ma wynik i normę, a klawiatura otwiera aktualny wiersz A2 przy ${width}px`, async ({ page }) => {
    await openCalculator(page, width);
    await fillAcr(page);
    const acr = card(page, 'ACR');
    await expect(acr).toBeVisible();
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
    expect(Number(await acr.getAttribute('data-clcr-value'))).toBeCloseTo(45, 10);
    await expect(acr.locator('.clcr-result-value')).toHaveCount(1);
    await expect(acr.locator('.clcr-result-unit')).toHaveText(/mg\/g/i);
    await expect(acr.locator('.clcr-result-reference')).toBeVisible();
    await expect(acr.locator('.clcr-result-reference-value')).toHaveText('<30');
    await expect(acr.locator('.clcr-result-reference-unit')).toHaveText('mg/g');
    await expect(acr).toHaveAttribute('data-clcr-category', 'A2');
    const category = acr.locator('[data-clcr-category-control]');
    await expect(category).toHaveAttribute('aria-expanded', 'false');
    const targetId = await category.getAttribute('aria-controls');
    expect(targetId).toBeTruthy();
    await category.focus();
    await page.keyboard.press('Enter');
    await expect(category).toHaveAttribute('aria-expanded', 'true');
    const details = page.locator(`#${targetId}`);
    await expect(details).toHaveAttribute('open', '');
    await expect(details.locator('[data-clcr-category-row="A2"]')).toHaveAttribute('aria-current', 'true');
    await expect(details.locator('[data-clcr-category-row="A2"]')).toContainText(/30.*300/);
    await expect(details.locator('[aria-current="true"]')).toHaveCount(1);
    await details.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    await expect(details).not.toHaveAttribute('open', '');
    await expect(category).toHaveAttribute('aria-expanded', 'false');
    expect(Number(await acr.getAttribute('data-clcr-value'))).toBeCloseTo(45, 10);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
  });
}

test('ACR klasyfikuje surowy wynik: 30 i 300 należą do A2 mimo zaokrąglenia przy sąsiednich progach', async ({ page }) => {
  await openCalculator(page);
  await fillAcr(page);
  for (const [raw, category, displayed] of [
    [29.99, 'A1', 30], [30, 'A2', 30], [300, 'A2', 300], [300.01, 'A3', 300],
  ]) {
    await page.locator('#U_Alb').fill(String(raw));
    const acr = card(page, 'ACR');
    await expect(acr).toHaveAttribute('data-clcr-category', category);
    expect(Number(await acr.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 10);
    expect(Number((await acr.locator('.clcr-result-value').innerText()).replace(',', '.'))).toBe(displayed);
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  }
});

test('UAG nie wymaga surowicy ani wieku do liczby, a źródłowy markup zapisu pozostaje pojedynczy', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'AGu_spot');
  await page.locator('#U_Na_spot').fill('40');
  await page.locator('#U_K_spot').fill('20');
  await page.locator('#U_Cl_spot').fill('45');
  await expect(card(page, 'AGu_spot')).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
  await selectField(page, '#ui_spotSameSpecimen_answer', 'yes');
  const uag = card(page, 'AGu_spot');
  await expect(uag).toBeVisible();
  expect(Number(await uag.getAttribute('data-clcr-value'))).toBeCloseTo(15, 10);
  await expect(page.locator('#age')).toHaveValue('');
  await expect(page.locator('#S_Na_spot')).toBeHidden();
  await expect(page.locator('#S_K_spot')).toBeHidden();
  await expect(page.locator('#S_Cl_spot')).toBeHidden();
  await expect(page.locator('[data-clcr-series="AGu_spot"]')).toHaveCount(1);
  const values = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'AGu_spot' }));
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({ sourceFormulaId: 'AGu_spot', valueNum: 15 });
});

test('czasowy klirens liczy główne 100 mL/min bez wieku, wzrostu i masy po potwierdzeniu protokołu', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'cl24');
  for (const [selector, value] of [
    ['#Scr', '1'], ['#Ucr', '100'], ['#V24', '720'],
    ['#collectionStartAt', '2026-07-27T08:00'],
    ['#collectionEndAt', '2026-07-27T20:00'],
  ]) await fillField(page, selector, value);
  await page.locator('#clcrDzmQualityGroup .clcr-dzm-quality__confirm').click();
  await selectField(page, '#ui_serumSampleDuringCollection_answer', 'yes');
  await fillField(page, '#serumSampleAt', '2026-07-27T12:00');
  const measured = card(page, 'cl24');
  await expect(measured).toBeVisible();
  expect(Number(await measured.getAttribute('data-clcr-value'))).toBeCloseTo(100, 10);
  await expect(measured.locator('.clcr-result-unit')).toHaveText('mL/min');
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  for (const selector of ['#age', '#ageMonths', '#weight', '#height']) {
    await expect(page.locator(selector)).toHaveValue('');
    await expect(page.locator(selector)).not.toHaveAttribute('aria-required', 'true');
  }
  await expect(page.locator('#clcrReadiness')).toBeHidden();
  const values = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'cl24' }));
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({ sourceFormulaId: 'cl24', valueNum: 100, unit: 'mL/min' });
});

test('UAG odtwarza stary wynik -15 bez zmiany flag, a nowa odpowiedź Nie lub Nie wiem blokuje także ponowne odtworzenie', async ({ page }) => {
  await openCalculator(page);
  await page.waitForTimeout(1050);
  for (const answer of ['no', 'unknown']) {
    const restored = await page.evaluate(() => window.applyClcrSessionSnapshot({
      version: 1,
      currentVersion: 'spot',
      selectedFormula: 'AGu_spot',
      inputs: {
        currentVersion: 'spot', formulaPicker: 'AGu_spot',
        U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80',
        spotPairedChemistry: true, spotSameSpecimen: false,
        ui_spotSameSpecimen_answer: '',
      },
    }, { source: 'e2e-uag-legacy', update: true, dispatchEvents: false, preserveAcrossVersions: true }));
    expect(restored).toBe(true);
    const uag = card(page, 'AGu_spot');
    await expect(uag).toBeVisible();
    expect(Number(await uag.getAttribute('data-clcr-value'))).toBeCloseTo(-15, 10);
    const legacy = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
    expect(legacy.spotPairedChemistry).toBe(true);
    expect(legacy.spotSameSpecimen).toBe(false);
    // Widoczna odpowiedź może pokazywać zgodność wynikającą ze starego
    // potwierdzenia, ale kanoniczna flaga moczu pozostaje niezmieniona.
    expect(legacy.ui_spotSameSpecimen_answer).toBe('yes');
    const values = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'AGu_spot' }));
    expect(values).toHaveLength(1);
    expect(values[0]).toMatchObject({ sourceFormulaId: 'AGu_spot', valueNum: -15 });
    await selectField(page, '#ui_spotSameSpecimen_answer', answer);
    await expect(uag).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
    const snapshot = await page.evaluate(() => window.buildClcrSessionSnapshot());
    expect(snapshot.inputs.spotPairedChemistry).toBe(false);
    expect(snapshot.inputs.spotSameSpecimen).toBe(false);
    expect(snapshot.inputs.ui_spotSameSpecimen_answer).toBe(answer);
    expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
      source: 'e2e-uag-blocked-restore', update: true, dispatchEvents: false, preserveAcrossVersions: true,
    }), snapshot)).toBe(true);
    await expect(uag).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
  }
});
