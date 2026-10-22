import { expect, test } from '@playwright/test';

// Wyłącznie dane syntetyczne i tryb gościa. Sprawdzamy produkcyjne obliczenia,
// zachowanie metadanych i rzeczywistą geometrię formularza, bez otwierania sejfu.
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
    typeof window.applyClcrSessionSnapshot === 'function' &&
    window.clcrIsResetting !== true
  ));
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible().catch(() => false)) await decline.click();
}

async function selectFormula(page, formulaId) {
  await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId);
  await expect.poll(() => page.evaluate(() => ({
    active: window.ClcrUiWorkflow.state.activeFormulaId,
    picker: document.getElementById('formulaPicker').value,
    resetting: window.clcrIsResetting === true,
  })), { message: `Aktywna formuła ${formulaId} po zakończeniu zmiany formularza` }).toEqual({
    active: formulaId, picker: formulaId, resetting: false,
  });
}

async function openFieldDetails(page, selector) {
  for (const details of await page.locator(selector).locator('xpath=ancestor::details').all()) {
    if (await details.getAttribute('open') === null) {
      await details.locator(':scope > summary').click();
    }
  }
}

async function selectField(page, selector, value) {
  await openFieldDetails(page, selector);
  await page.locator(selector).selectOption(value);
}

async function fillU25(page, creatinine = '0.6') {
  await selectFormula(page, 'ckid_u25');
  await page.locator('#age').fill('10');
  await page.locator('#sex').selectOption('F');
  await page.locator('#height').fill('140');
  await page.locator('#Scr').fill(creatinine);
}

async function fillAdultCombined(page) {
  await selectFormula(page, 'egfr_cr_cys');
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('F');
  await page.locator('#Scr').fill('1.5');
  await page.locator('#CystatinC').fill('1.5');
}

async function restoreAdultCombined(page, inputs, version = 2) {
  const applied = await page.evaluate(({ values, snapshotVersion }) => (
    window.applyClcrSessionSnapshot({
      version: snapshotVersion, currentVersion: 'pro', selectedFormula: 'egfr_cr_cys',
      inputs: {
        currentVersion: 'pro', formulaPicker: 'egfr_cr_cys',
        age: '50', ageMonths: '', sex: 'F', Scr: '1.5', ScrUnit: 'mg/dl', CystatinC: '1.5',
        ScrAssay: '', CystatinCStandardization: '', CystatinCAssayMethod: '',
        creatinineState: 'unknown', suspectedAKI: false, ...values,
      },
    }, {
      source: 'e2e-approved-audit', update: true, dispatchEvents: false,
      preserveAcrossVersions: true,
    })
  ), { values: inputs, snapshotVersion: version });
  expect(applied).toBe(true);
  await page.waitForFunction(() => (
    window.ClcrUiWorkflow.state.activeFormulaId === 'egfr_cr_cys' &&
    document.getElementById('formulaPicker').value === 'egfr_cr_cys' &&
    window.clcrIsResetting !== true
  ));
}

function result(page, formulaId) {
  return page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${formulaId}"]`);
}

async function expectSingleResult(page, formulaId, displayed, raw) {
  const card = result(page, formulaId);
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card.locator('.clcr-result-value')).toHaveText(displayed);
  expect(Number(await card.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  await expect(page.locator('#clcrReadiness')).toBeHidden();
  await expect(page.locator('.clcr-progress')).toBeHidden();
  return card;
}

async function expectNoAssignedCategory(page, card) {
  await expect(card).toHaveAttribute('data-clcr-category', '');
  await expect(card.locator('[data-clcr-category-control]')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport [data-clcr-category-row][aria-current="true"]')).toHaveCount(0);
}

async function expectUnknownMarkerMetadata(page) {
  const inputs = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(inputs.creatinineState).toBe('unknown');
  expect(inputs.suspectedAKI).toBe(false);
  expect(inputs.ScrAssay).toBe('');
}

test('dorosły cr-cys: cztery wartości i jedno jawne potwierdzenie obu standaryzacji, bez dodatkowych pytań', async ({ page }) => {
  await openCalculator(page);
  await fillAdultCombined(page);
  const confirmation = page.locator('#CrCysStandardizationConfirmed');
  await expect(confirmation).toBeVisible();
  await expect(confirmation).not.toBeChecked();
  await expect(page.locator('label:has(#CrCysStandardizationConfirmed)')).toContainText('IDMS');
  await expect(page.locator('label:has(#CrCysStandardizationConfirmed)')).toContainText('IFCC');
  await expect(result(page, 'egfr_cr_cys')).toHaveCount(0);
  for (const details of await page.locator('#clcrForm details.clcr-context-details:visible').all()) {
    if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
  }
  for (const id of ['ScrAssay', 'CystatinCStandardization', 'CystatinCAssayMethod', 'weight', 'height']) {
    await expect(page.locator(`#${id}`)).toBeHidden();
  }
  await confirmation.check();
  const card = await expectSingleResult(page, 'egfr_cr_cys', '43', 43.31634057743082);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expectNoAssignedCategory(page, card);
  await expect(card.locator('.clcr-result-interpretation')).toHaveText('Nie potwierdzono stabilności markerów.');
  await expectUnknownMarkerMetadata(page);
  const inputs = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(inputs).toMatchObject({
    CrCysStandardizationConfirmed: true, CystatinCStandardization: '', CystatinCAssayMethod: '',
  });
  expect(await page.evaluate(() => window.ClcrUiWorkflow.crCysStandardization())).toEqual({
    confirmed: true, creatinineStandardization: 'IDMS', cystatinCStandardization: 'ERM-DA471/IFCC',
  });
  await page.locator('#age').fill('10');
  await selectFormula(page, 'ckid_u25');
  await expect(page.locator('#CrCysStandardizationConfirmed')).toBeHidden();
  await expect(page.locator('#ScrAssay')).toHaveValue('');
  await expectUnknownMarkerMetadata(page);
});

test('dorosły cr-cys: stara sesja potwierdza wyłącznie pełną parę IDMS i IFCC; jawne false ma pierwszeństwo', async ({ page }) => {
  await openCalculator(page);
  for (const entry of [
    { inputs: { ScrAssay: 'enzymatic_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, expected: true, version: 1 },
    { inputs: { ScrAssay: 'jaffe_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, expected: true },
    { inputs: { ScrAssay: 'enzymatic_idms' }, expected: false },
    { inputs: { CystatinCStandardization: 'ERM-DA471/IFCC' }, expected: false },
    { inputs: { ScrAssay: 'not_idms', CystatinCStandardization: 'ERM-DA471/IFCC' }, expected: false },
    { inputs: { ScrAssay: 'enzymatic_idms', CystatinCStandardization: 'ERM-DA471/IFCC', CrCysStandardizationConfirmed: false }, expected: false },
  ]) {
    await restoreAdultCombined(page, { ...entry.inputs, creatinineState: 'stable' }, entry.version);
    const checkbox = page.locator('#CrCysStandardizationConfirmed');
    if (entry.expected) {
      await expect(checkbox).toBeChecked();
      const card = await expectSingleResult(page, 'egfr_cr_cys', '43', 43.31634057743082);
      await expect(card).toHaveAttribute('data-clcr-category', 'G3b');
      await expect(card).toHaveAttribute('data-clcr-tone', 'danger');
      await expect(card.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(198, 40, 40)');
    } else {
      await expect(checkbox).not.toBeChecked();
      await expect(result(page, 'egfr_cr_cys')).toHaveCount(0);
    }
    const saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
    expect(saved.ScrAssay).toBe(entry.inputs.ScrAssay || '');
    expect(saved.CystatinCAssayMethod).toBe('');
    expect(saved.CrCysStandardizationConfirmed).toBe(entry.expected);
  }
});

test('dorosły cr-cys: nowe potwierdzenie nie omija znanego AKI ani szybkiej zmiany markerów', async ({ page }) => {
  await openCalculator(page);
  for (const metadata of [
    { creatinineState: 'stable', suspectedAKI: true },
    { creatinineState: 'rapidlyChanging', suspectedAKI: false },
  ]) {
    await restoreAdultCombined(page, { CrCysStandardizationConfirmed: true, ...metadata });
    await expect(page.locator('#CrCysStandardizationConfirmed')).toBeChecked();
    await expect(result(page, 'egfr_cr_cys')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport .clcr-result-value')).toHaveCount(0);
    await expect(page.locator('#clcrInfo')).toContainText(metadata.suspectedAKI ? 'AKI' : /niestacjonarn|zmian|zmienia/i);
    const saved = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
    expect(saved).toMatchObject(metadata);
  }
});

test('dorosły cr-cys: roundtrip JSON po przeładowaniu zachowuje jawny fakt, a wyczyszczenie usuwa potwierdzenie', async ({ page }) => {
  await openCalculator(page);
  await fillAdultCombined(page);
  await page.locator('#CrCysStandardizationConfirmed').check();
  await expectSingleResult(page, 'egfr_cr_cys', '43', 43.31634057743082);
  // Produkcyjne API eksportu/importu sprawdzamy przez serializację danych
  // syntetycznych i nowy dokument strony, bez otwierania sejfu.
  const json = await page.evaluate(() => JSON.stringify(window.buildClcrSessionSnapshot()));
  await page.reload({ waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.evaluate(button => button.click());
  await page.waitForFunction(() => (
    !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.applyClcrSessionSnapshot === 'function' &&
    window.clcrIsResetting !== true
  ));
  expect(await page.evaluate(serialized => window.applyClcrSessionSnapshot(JSON.parse(serialized), {
    source: 'e2e-approved-json-roundtrip', update: true,
    dispatchEvents: false, preserveAcrossVersions: true,
  }), json)).toBe(true);
  await expect(page.locator('#CrCysStandardizationConfirmed')).toBeChecked();
  const card = await expectSingleResult(page, 'egfr_cr_cys', '43', 43.31634057743082);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expectNoAssignedCategory(page, card);
  await expectUnknownMarkerMetadata(page);
  const reloaded = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(reloaded).toMatchObject({
    CrCysStandardizationConfirmed: true, CystatinCStandardization: '', CystatinCAssayMethod: '',
  });
  await page.getByRole('button', { name: 'Wyczyść wszystkie pola', exact: true }).click();
  await expect(page.locator('#CrCysStandardizationConfirmed')).not.toBeChecked();
  await expect(page.locator('#age')).toHaveValue('');
  await expect(page.locator('#Scr')).toHaveValue('');
  await expect(page.locator('#CystatinC')).toHaveValue('');
  await expect(result(page, 'egfr_cr_cys')).toHaveCount(0);
  const cleared = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(cleared.CrCysStandardizationConfirmed).toBe(false);
});

test('U25: cztery dane dają 83 i ocenę oszacowania bez dopisywania metadanych ani kategorii G', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page);
  const card = await expectSingleResult(page, 'ckid_u25', '83', 82.90160199882423);
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card.locator('.clcr-result-interpretation')).toHaveText('Oszacowanie poniżej normy dla wieku');
  await expect(card.locator('.clcr-result-reference-label')).toHaveText('Norma dla wieku');
  await expect(card.locator('.clcr-result-reference-value')).toHaveText('≥90');
  await expectNoAssignedCategory(page, card);
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25"]')).toBeVisible();
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25"]')).toContainText('stabilna czynność nerek');
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="ckid_u25"]')).toContainText('IDMS');
  await expect(page.locator('#ageMonths')).toHaveValue('');
  await expectUnknownMarkerMetadata(page);
  const saved = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'ckid_u25' }));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    sourceFormulaId: 'ckid_u25', valueNum: 83, outOfRange: true, norm: '≥90 mL/min/1,73 m²',
  });
});

test('U25: oszacowanie 124 ma neutralny kolor i nadal nie przypisuje G1', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page, '0.4');
  const card = await expectSingleResult(page, 'ckid_u25', '124', 124.35240299823631);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(card.locator('.clcr-result-interpretation')).toHaveText('Oszacowanie nieobniżone dla wieku');
  await expectNoAssignedCategory(page, card);
  await expectUnknownMarkerMetadata(page);
  const saved = await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'ckid_u25' }));
  expect(saved).toHaveLength(1);
  expect(saved[0]).toMatchObject({
    sourceFormulaId: 'ckid_u25', valueNum: 124, outOfRange: false, norm: '≥90 mL/min/1,73 m²',
  });
});

test('U25: rzeczywiście potwierdzone IDMS i stabilność zachowują 83 oraz kwalifikowaną kategorię G2', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page);
  await selectField(page, '#ScrAssay', 'enzymatic_idms');
  await selectField(page, '[data-clcr-marker-context]', 'stable');
  const card = await expectSingleResult(page, 'ckid_u25', '83', 82.90160199882423);
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card).toHaveAttribute('data-clcr-category', 'G2');
  await expect(card.locator('.clcr-result-interpretation')).toHaveText('Obniżony dla wieku');
  await card.locator('[data-clcr-category-control]').click();
  await expect(page.locator('#clcrResultReport [data-clcr-category-row="G2"]')).toHaveAttribute('aria-current', 'true');
  const inputs = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(inputs).toMatchObject({ ScrAssay: 'enzymatic_idms', creatinineState: 'stable', suspectedAKI: false });
});

test('U25: dawne niejednoznaczne not_idms nie zamienia się w zgodność z IDMS ani ocenę progową', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page);
  await selectField(page, '#ScrAssay', 'not_idms');
  const card = await expectSingleResult(page, 'ckid_u25', '83', 82.90160199882423);
  await expect(card).toHaveAttribute('data-clcr-tone', 'neutral');
  await expectNoAssignedCategory(page, card);
  await expect(page.locator('#clcrResultReport')).toContainText(/niepotwierdzon|nie potwierdzon/i);
  const inputs = await page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
  expect(inputs).toMatchObject({ ScrAssay: 'not_idms', creatinineState: 'unknown', suspectedAKI: false });
});

test('U25: 89,8 zaokrąglone do 90 pozostaje poniżej normy i pokazuje granicę bez kategorii G', async ({ page }) => {
  await openCalculator(page);
  // Ta niezależna para wynika z przypadku 82,90160199882423 przy Scr=0,6;
  // U25cr jest odwrotnie proporcjonalne do kreatyniny. Nie pytamy silnika o oczekiwaną ocenę.
  const creatinine = String(0.6 * 82.90160199882423 / 89.8);
  await fillU25(page, creatinine);
  const card = await expectSingleResult(page, 'ckid_u25', '90', 89.8);
  await expect(card).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(card.locator('.clcr-result-interpretation')).toHaveText('Oszacowanie poniżej normy dla wieku');
  await expect(card.locator('.clcr-result-boundary')).toContainText('<90');
  await expectNoAssignedCategory(page, card);
});

test('U25: znane AKI i szybka zmiana markera blokują liczbę zamiast porównania oszacowania z normą', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page);
  await expect(result(page, 'ckid_u25')).toBeVisible();
  for (const context of ['aki', 'rapidlyChanging']) {
    await selectField(page, '[data-clcr-marker-context]', context);
    await expect(result(page, 'ckid_u25')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport .clcr-result-value')).toHaveCount(0);
    await expect(page.locator('#clcrInfo')).toContainText(context === 'aki' ? 'AKI' : /zmian|zmienia/i);
  }
});

test('polityka porównania U25 nie obejmuje dorosłego eGFR ani Cockcrofta; ACR zachowuje A2 i normę <30', async ({ page }) => {
  await openCalculator(page);
  await selectFormula(page, 'egfr');
  await page.locator('#age').fill('50');
  await page.locator('#sex').selectOption('M');
  await page.locator('#Scr').fill('3');
  const adult = await expectSingleResult(page, 'egfr', '25', 24.5348535798);
  await expect(adult).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(adult.locator('.clcr-result-interpretation')).toContainText('ocena ograniczona');
  await expectNoAssignedCategory(page, adult);
  await expect(page.locator('.clcr-result-assumptions')).toHaveCount(0);

  await selectFormula(page, 'cg');
  await page.locator('#weight').fill('75');
  await page.locator('#Scr').fill('3');
  const cg = await expectSingleResult(page, 'cg', '31', 31.25);
  await expect(cg).toHaveAttribute('data-clcr-tone', 'neutral');
  await expect(cg.locator('.clcr-result-reference-value')).toHaveText('Brak uniwersalnej normy');
  await expectNoAssignedCategory(page, cg);

  await selectFormula(page, 'ACR');
  await page.locator('#U_Alb').fill('45');
  await page.locator('#Ucr_spot').fill('100');
  await selectField(page, '#spotSampleKind', 'firstMorning');
  await selectField(page, '#ui_spotSameSpecimen_answer', 'yes');
  const acr = await expectSingleResult(page, 'ACR', '45,0', 45);
  await expect(acr).toHaveAttribute('data-clcr-category', 'A2');
  await expect(acr).toHaveAttribute('data-clcr-tone', 'warning');
  await expect(acr.locator('.clcr-result-reference-value')).toHaveText('<30');
  await acr.locator('[data-clcr-category-control]').click();
  await expect(page.locator('#clcrResultReport [data-clcr-category-row="A2"]')).toHaveAttribute('aria-current', 'true');
});

async function expectReadableLegends(page) {
  const measurements = await page.locator('#clcrForm fieldset > legend').evaluateAll(legends => {
    const visible = element => element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden';
    return legends.filter(visible).map(legend => {
      const box = legend.getBoundingClientRect();
      const fieldset = legend.parentElement.getBoundingClientRect();
      const firstField = [...legend.parentElement.children].find(child => child !== legend && visible(child));
      return {
        title: legend.textContent.trim(), position: getComputedStyle(legend).position,
        withinTop: box.top - fieldset.top, withinBottom: fieldset.bottom - box.bottom,
        gap: firstField ? firstField.getBoundingClientRect().top - box.bottom : null,
      };
    });
  });
  expect(measurements.some(item => item.title === 'Parametry z surowicy')).toBe(true);
  for (const item of measurements) {
    expect(item.position, item.title).toBe('static');
    expect(item.withinTop, item.title).toBeGreaterThanOrEqual(-1);
    expect(item.withinBottom, item.title).toBeGreaterThanOrEqual(0);
    if (item.gap !== null) expect(item.gap, item.title).toBeGreaterThanOrEqual(15.5);
  }
}

async function expectMobileControlSizes(page) {
  const controls = await page.locator([
    '#clcrForm input[type="number"]', '#clcrForm input[type="text"]',
    '#clcrForm select', '#clcrForm textarea', '#formulaSearch',
    '.clcr-module-variant-select', '#clcrVisitDate',
  ].join(',')).evaluateAll(elements => elements.filter(element => (
    element.getClientRects().length && getComputedStyle(element).visibility !== 'hidden' &&
    !element.matches('.clcr-canonical-picker')
  )).map(element => ({
    name: element.id || element.className || element.tagName,
    font: parseFloat(getComputedStyle(element).fontSize),
    height: element.getBoundingClientRect().height,
  })));
  expect(controls.length).toBeGreaterThan(4);
  for (const control of controls) {
    expect(control.font, control.name).toBeGreaterThanOrEqual(16);
    expect(control.height, control.name).toBeGreaterThanOrEqual(47.5);
  }
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
}

async function expectAlignedGuestSaveCard(page) {
  const card = page.locator('#clcrVisitSaveCard');
  await expect(card).toBeVisible();
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await expect(page.locator('#clcrVisitHint')).toContainText('Liczenie działa bez logowania');
  await expect(page.locator('#clcrOpenCardBtn')).toBeHidden();
  const layout = await card.evaluate(element => {
    const rect = target => target.getBoundingClientRect();
    const title = element.querySelector('h2');
    const label = element.querySelector('.cvs-date');
    const date = element.querySelector('#clcrVisitDate');
    const hint = element.querySelector('#clcrVisitHint');
    const button = element.querySelector('#clcrVisitSaveBtn');
    const css = getComputedStyle(element);
    const buttonCss = getComputedStyle(button);
    return {
      padding: [css.paddingTop, css.paddingRight, css.paddingBottom, css.paddingLeft].map(parseFloat),
      titleLeft: rect(title).left, labelLeft: rect(label).left, hintLeft: rect(hint).left,
      dateLeft: rect(date).left, buttonLeft: rect(button).left,
      dateWidth: rect(date).width, buttonWidth: rect(button).width,
      dateHeight: rect(date).height, buttonHeight: rect(button).height,
      titleAlign: getComputedStyle(title).textAlign,
      disabled: button.disabled, disabledColor: buttonCss.color,
      disabledBackground: buttonCss.backgroundColor, disabledOpacity: buttonCss.opacity,
      emptyStatusDisplay: getComputedStyle(element.querySelector('#clcrVisitStatus')).display,
      emptyOpenRowDisplay: getComputedStyle(element.querySelector('.cvs-open-row')).display,
    };
  });
  expect(layout.padding).toEqual([20, 20, 20, 20]);
  expect(layout.titleAlign).toBe('left');
  for (const left of [layout.labelLeft, layout.hintLeft, layout.dateLeft, layout.buttonLeft]) {
    expect(Math.abs(left - layout.titleLeft)).toBeLessThanOrEqual(1);
  }
  expect(Math.abs(layout.dateWidth - layout.buttonWidth)).toBeLessThanOrEqual(1);
  expect(layout.dateHeight).toBeGreaterThanOrEqual(47.5);
  expect(layout.buttonHeight).toBeGreaterThanOrEqual(47.5);
  expect(layout).toMatchObject({
    disabled: true, disabledColor: 'rgb(91, 112, 117)',
    disabledBackground: 'rgb(237, 242, 243)', disabledOpacity: '1',
    emptyStatusDisplay: 'none', emptyOpenRowDisplay: 'none',
  });
}

for (const width of [320, 390]) {
  test(`formularz ${width}px: widoczne nagłówki, czytelne kontrolki i symetryczny zapis bez odblokowania gościa`, async ({ page }) => {
    await openCalculator(page, width);
    await fillU25(page);
    await expect(result(page, 'ckid_u25')).toBeVisible();
    await expectReadableLegends(page);
    await expectMobileControlSizes(page);
    await expectAlignedGuestSaveCard(page);
    await page.locator('#age').fill('50');
    for (const formulaId of ['egfr', 'cg', 'ACR']) {
      await selectFormula(page, formulaId);
      for (const details of await page.locator('#clcrForm details.clcr-context-details:visible').all()) {
        if (await details.getAttribute('open') === null) await details.locator(':scope > summary').click();
      }
      if (formulaId !== 'ACR') await expectReadableLegends(page);
      await expectMobileControlSizes(page);
    }
  });
}

test('formularz desktop: legenda surowicy nie nachodzi na pola, a zapis ma tę samą lewą oś', async ({ page }) => {
  await openCalculator(page);
  await fillU25(page);
  await expect(result(page, 'ckid_u25')).toBeVisible();
  await expectReadableLegends(page);
  await expectAlignedGuestSaveCard(page);
});
