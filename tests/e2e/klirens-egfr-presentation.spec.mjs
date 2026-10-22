import { expect, test } from '@playwright/test';

async function openFieldDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
}

async function setMarkerContext(page, value) {
  const marker = page.locator('[data-clcr-marker-context]');
  for (const details of await marker.locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
  await marker.selectOption(value);
}


// Dane wyłącznie syntetyczne. Testujemy produkcyjny workflow, nie broad/testowy widok.
async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(
    /^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//,
    route => route.abort(),
  );
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', {
    name: 'Korzystaj bez logowania', exact: true,
  });
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
}

async function selectFormula(page, id) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await page.waitForFunction(value => (
    window.ClcrUiWorkflow.state.activeFormulaId === value &&
    document.getElementById('formulaPicker').value === value &&
    window.clcrIsResetting !== true
  ), id);
}

async function openDetailsFor(page, id) {
  const details = page.locator(`details:has(#${id})`);
  for (let i = 0; i < await details.count(); i += 1) {
    const current = details.nth(i);
    if (await current.getAttribute('open') === null) {
      await current.locator(':scope > summary').click();
    }
  }
}

async function setAssay(page, value) {
  await openDetailsFor(page, 'ScrAssay');
  await page.locator('#ScrAssay').selectOption(value);
}

async function fillAdult(page, { creatinine = '3', assay = 'enzymatic_idms' } = {}) {
  await selectFormula(page, 'egfr');
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#Scr').fill(creatinine);
  await setAssay(page, assay);
  await setMarkerContext(page, 'stable');
}

function result(page, id = 'egfr') {
  return page.locator(`.clcr-result-card[data-clcr-series="${id}"]`);
}

async function creatinineForTarget(page, target, overrides = {}) {
  // Rzeczywista funkcja służy tylko do trafienia w granicę widoku. Jej poprawność
  // matematyczną sprawdzają niezależne liczbowe przypadki jednostkowe.
  return page.evaluate(({ expected, settings }) => {
    const input = { sex: 'M', ageYears: 50, ...settings };
    const compute = input.formulaId === 'ckid_u25'
      ? window.ClcrClinicalSafety.computeCkidU25Creatinine
      : window.ClcrClinicalSafety.computeCkdEpi2021Cr;
    let lower = 0.01;
    let upper = 20;
    for (let i = 0; i < 60; i += 1) {
      const mid = (lower + upper) / 2;
      const calculated = compute({ ...input, creatinineMgDl: mid });
      if (calculated > expected) lower = mid;
      else upper = mid;
    }
    return String((lower + upper) / 2);
  }, { expected: target, settings: overrides });
}

async function applySnapshot(page, inputs, version = 2) {
  const applied = await page.evaluate(({ values, snapshotVersion }) => (
    window.applyClcrSessionSnapshot({
      version: snapshotVersion,
      currentVersion: 'basic',
      selectedFormula: 'egfr',
      inputs: {
        currentVersion: 'basic', formulaPicker: 'egfr',
        age: '50', ageMonths: '0', sex: 'M',
        Scr: '3', ScrUnit: 'mg/dl', ScrAssay: 'enzymatic_idms',
        ...values,
      },
    }, {
      source: 'e2e-egfr-presentation', update: true,
      dispatchEvents: false, preserveAcrossVersions: true,
    })
  ), { values: inputs, snapshotVersion: version });
  expect(applied).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`eGFR 25/G4 jest czerwony w liczbie i karcie, również przy szerokości ${width}px`, async ({ page }) => {
    await openCalculator(page, width);
    await fillAdult(page);
    const card = result(page);
    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute('data-clcr-tone', 'danger');
    await expect(card.locator('.clcr-result-value')).toHaveText('25');
    await expect(card.locator('.clcr-result-interpretation')).toContainText('Znacznie zmniejszony');
    await expect(card.locator('[data-clcr-category-control]')).toContainText('G4');
    await expect(card.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(198, 40, 40)');
    await expect(card.locator('.clcr-result-interpretation')).toHaveCSS('color', 'rgb(198, 40, 40)');
    const geometry = await card.evaluate(node => {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect();
      return {
        shadow: style.boxShadow,
        background: style.backgroundColor,
        left: rect.left,
        right: rect.right,
        viewport: document.documentElement.clientWidth,
        cardOverflow: node.scrollWidth - node.clientWidth,
        pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.shadow).toContain('rgb(198, 40, 40)');
    expect(geometry.background).not.toBe('rgb(255, 255, 255)');
    expect(geometry.left).toBeGreaterThanOrEqual(-1);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 1);
    expect(geometry.cardOverflow).toBeLessThanOrEqual(1);
    expect(geometry.pageOverflow).toBeLessThanOrEqual(1);
    const report = page.locator('#clcrResultReport');
    await expect(report.locator('[data-clcr-series="egfr"]')).toHaveCount(1);
    await expect(report.locator('.clcr-result-interpretation')).toContainText('Znacznie zmniejszony');
    await expect(report.locator('.clcr-result-value')).toHaveText('25');
    await expect(report.locator('.clcr-result-unit')).toHaveText(/mL\/min\/1,73\s*m²/i);
    await expect(page.locator('#clcrRailHead, .clcr-rnum')).toHaveCount(0);
  });
}

test('U25 83/G2 u dziecka ma pomarańczowy status obniżenia dla wieku', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'ckid_u25');
  await page.locator('#age').fill('10');
  await openFieldDetails(page, '#ageMonths');
  await page.locator('#ageMonths').fill('0');
  const patientDetails = page.locator('details.clcr-context-details:has(#ageMonths)');
  if (await patientDetails.count() && await patientDetails.getAttribute('open') !== null) {
    await patientDetails.locator(':scope > summary').click();
  }
  await page.locator('#sex').selectOption('F');
  await page.locator('#height').fill('140');
  await page.locator('#Scr').fill('0.6');
  await setAssay(page, 'enzymatic_idms');
  await setMarkerContext(page, 'stable');
  const card = result(page, 'ckid_u25');
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card.locator('.clcr-result-value')).toHaveText('83');
  await expect(card.locator('.clcr-result-interpretation')).toContainText('Obniżony dla wieku');
  await expect(card.locator('[data-clcr-category-control]')).toContainText('G2');
  await expect(card.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
  await expect(card.locator('.clcr-result-interpretation')).toHaveCSS('color', 'rgb(154, 91, 0)');
  await expect(page.locator('#weight')).toBeHidden();
  await expect(page.locator('#height')).toBeVisible();
});

test('nieznana stabilność i niepotwierdzone IDMS dają neutralny wynik bez kategorii', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page, { creatinine: await creatinineForTarget(page, 59.8) });
  const marker = page.locator('[data-clcr-marker-context]');
  await setMarkerContext(page, 'unknown');
  let card = result(page);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card.locator('.clcr-result-value')).toHaveText('60');
  await expect(card.locator('.clcr-result-interpretation')).toContainText('ocena ograniczona');
  await expect(card.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(card.locator('.clcr-result-boundary')).toHaveCount(0);
  await expect(page.locator('#clcrRailHead')).toHaveCount(0);
  await setMarkerContext(page, 'stable');
  await setAssay(page, 'not_idms');
  card = result(page);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(card.locator('.clcr-result-boundary')).toHaveCount(0);
  await expect(page.locator('#clcrRailHead')).toHaveCount(0);
  await expect(page.locator('#clcrInfo')).toContainText('IDMS');
  await expect(card.locator('.clcr-result-value')).not.toHaveCSS('color', 'rgb(198, 40, 40)');
});

test('przed 2. rokiem życia nie ujawnia kategorii przez dopisek o zaokrągleniu', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'ckid_u25');
  await page.locator('#age').fill('1');
  await openFieldDetails(page, '#ageMonths');
  await page.locator('#ageMonths').fill('6');
  await page.locator('#sex').selectOption('F');
  await page.locator('#height').fill('80');
  const creatinine = await creatinineForTarget(page, 89.8, {
    formulaId: 'ckid_u25', sex: 'F', ageYears: 1.5, heightCm: 80,
  });
  await page.locator('#Scr').fill(creatinine);
  await setAssay(page, 'enzymatic_idms');
  await setMarkerContext(page, 'stable');
  const card = result(page, 'ckid_u25');
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card.locator('.clcr-result-value')).toHaveText('90');
  await expect(card.locator('.clcr-result-interpretation')).toContainText('Ocena zależna od wieku');
  await expect(card.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(card.locator('.clcr-result-boundary')).toHaveCount(0);
  await expect(page.locator('#clcrRailHead')).toHaveCount(0);
});

test('jedno pole stabilności zachowuje osobne stare dane i usuwa wynik po AKI', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page);
  const marker = page.locator('[data-clcr-marker-context]');
  await expect(result(page)).toBeVisible();
  await expect(page.locator('#creatinineState')).toBeHidden();
  await expect(page.locator('#suspectedAKI')).toBeHidden();

  await setMarkerContext(page, 'aki');
  await expect(page.locator('#suspectedAKI')).toBeChecked();
  await expect(result(page)).toHaveCount(0);
  await expect(page.locator('.clcr-rail-head')).toBeHidden();
  await expect(page.locator('#clcrInfo')).toContainText('AKI');

  await setMarkerContext(page, 'rapidlyChanging');
  await expect(page.locator('#creatinineState')).toHaveValue('rapidlyChanging');
  await expect(page.locator('#suspectedAKI')).not.toBeChecked();
  await expect(result(page)).toHaveCount(0);

  await setMarkerContext(page, 'stable');
  await expect(page.locator('#creatinineState')).toHaveValue('stable');
  await expect(page.locator('#suspectedAKI')).not.toBeChecked();
  await expect(result(page).locator('.clcr-result-value')).toHaveText('25');
});

test('masa i wzrost dorosłego są zwinięte, a przejście do Cockcrofta odsłania potrzebną masę', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page);
  await expect(page.locator('#weight')).toBeHidden();
  await expect(page.locator('#height')).toBeHidden();
  const details = page.locator('details.clcr-context-details:has(#weight)');
  await expect(details).toHaveCount(1);
  await details.locator(':scope > summary').click();
  await page.locator('#weight').fill('75');
  await page.locator('#height').fill('180');
  await details.locator(':scope > summary').click();
  await expect(page.locator('#weight')).toHaveValue('75');
  await expect(page.locator('#height')).toHaveValue('180');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('25');
  await selectFormula(page, 'cg');
  await expect(page.locator('#weight')).toBeVisible();
  await expect(page.locator('[data-clcr-marker-context]')).toBeVisible();
  await expect(page.locator('#creatinineState')).toBeHidden();
});

test('odtworzenie starej sesji synchronizuje nowe pole bez dodawania klucza do zapisu', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page);
  // Czekamy na zakończenie inicjalizacyjnego odświeżenia, jak w teście delayed-restore.
  await page.waitForTimeout(1050);
  await applySnapshot(page, { creatinineState: 'stable', suspectedAKI: true }, 1);
  const marker = page.locator('[data-clcr-marker-context]');
  await expect(marker).toHaveValue('aki');
  await expect(result(page)).toHaveCount(0);
  expect(await marker.getAttribute('id')).toBeNull();
  expect(await marker.getAttribute('name')).toBeNull();
  const saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(saved.creatinineState).toBe('stable');
  expect(saved.suspectedAKI).toBe(true);

  await applySnapshot(page, { creatinineState: 'stable', suspectedAKI: false });
  await expect(marker).toHaveValue('stable');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('25');
  await applySnapshot(page, { creatinineState: 'unknown', suspectedAKI: false });
  await expect(marker).toHaveValue('unknown');
  await expect(result(page)).toHaveAttribute('data-clcr-tone', 'neutral');
});

test('zmiana jednostki kreatyniny zachowuje wynik i liczbę przekazywaną do historii', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page);
  const before = Number(await result(page).getAttribute('data-clcr-value'));
  await page.locator('#ScrUnit').selectOption('umol');
  await page.locator('#Scr').fill('265.2');
  await expect(result(page).locator('.clcr-result-value')).toHaveText('25');
  const after = Number(await result(page).getAttribute('data-clcr-value'));
  expect(before).toBeCloseTo(24.5348535798, 9);
  expect(after).toBeCloseTo(before, 10);
  const values = await page.evaluate(() => (
    window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'egfr' })
  ));
  expect(values).toHaveLength(1);
  expect(values[0]).toMatchObject({
    valueNum: 25,
    sourceFormulaId: 'egfr',
    unit: 'mL/min/1,73 m²',
  });
});

test('kategoria i kolor pozostają po właściwej stronie progu mimo zaokrąglenia liczby', async ({ page }) => {
  await openCalculator(page);
  await fillAdult(page);
  for (const [target, category, displayed, threshold] of [
    [59.8, 'G3a', '60', '<60'],
    [89.8, 'G2', '90', '<90'],
  ]) {
    const creatinine = await creatinineForTarget(page, target);
    await page.locator('#Scr').fill(creatinine);
    const card = result(page);
    await expect(card.locator('.clcr-result-value')).toHaveText(displayed);
    await expect(card.locator('[data-clcr-category-control]')).toContainText(category);
    await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
    await expect(card.locator('.clcr-result-boundary')).toContainText(threshold);
    await expect(page.locator('#clcrResultReport .clcr-result-boundary')).toContainText(threshold);
    await expect(page.locator('#clcrResultReport .clcr-result-value')).toHaveCount(1);
  }
});
