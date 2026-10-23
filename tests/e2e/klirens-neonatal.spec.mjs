import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Rzeczywisty formularz i silnik, świeży syntetyczny gość. Bez DOM makiety i sejfu.
const formulaId = 'neonatal_egfr';
const assumptions = 'Założenia obliczenia: brak podejrzenia AKI i kreatynina standaryzowana do IDMS.';
const earlyText = 'W pierwszych dniach kreatynina może odzwierciedlać stężenie matki — oceń także jej trend.';

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
    typeof window.buildClcrSessionSnapshot === 'function' &&
    window.clcrIsResetting !== true
  ));
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function selectFormula(page, id = formulaId, { waitForPicker = true } = {}) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await expect.poll(() => page.evaluate(() => ({
    active: window.ClcrUiWorkflow.state.activeFormulaId,
    resetting: window.clcrIsResetting === true,
  }))).toEqual({ active: id, resetting: false });
  if (waitForPicker) await expect(page.locator('#formulaPicker')).toHaveValue(id);
}

async function fillNeonatal(page) {
  await selectFormula(page);
  await page.locator('#ageDays').fill('14');
  await page.locator('#neonatalTermStatus').selectOption('term');
  await page.locator('#weight').fill('3.5');
  await page.locator('#height').fill('50');
  await page.locator('#ScrUnit').selectOption('mg/dl');
  await page.locator('#Scr').fill('0.5');
  await page.locator('#Scr').blur();
}

function card(page, id = formulaId) {
  return page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${id}"]`);
}

function details(page, id = formulaId) {
  return page.locator(`#clcrResultReport .clcr-result-details[data-clcr-formula="${id}"]`);
}

async function openResultDetails(page, id = formulaId) {
  const target = details(page, id);
  if (await target.getAttribute('open') === null) {
    await target.locator(':scope > summary').evaluate(summary => summary.click());
  }
  await expect(target).toHaveAttribute('open', '');
  return target;
}

async function sourceInputs(page) {
  return page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
}

async function expectNeonatal(page) {
  const result = card(page);
  await expect(result).toBeVisible();
  await expect(result.locator('.clcr-result-value')).toHaveText('31');
  await expect.poll(async () => Number(await result.getAttribute('data-clcr-value'))).toBeCloseTo(31, 10);
  await expect(result).toHaveAttribute('data-clcr-tone', 'neutral');
  expect(await result.getAttribute('data-clcr-category') || '').toBe('');
  await expect(result.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(68, 90, 100)');
  await expect(result.locator('.clcr-result-interpretation')).toHaveText('Szacowany eGFR');
  await expect(result.locator('.clcr-result-reference-label')).toHaveText('Ocena dla wieku');
  await expect(result.locator('.clcr-result-reference-value')).toHaveText('Zależy od dnia życia');
  await expect(result.locator('.clcr-result-reference')).toHaveAttribute('data-clcr-reference-kind', 'none');
  await expect(result.locator('.clcr-result-unit')).toHaveText('mL/min/1,73 m²');
  await expect(result.locator('.clcr-result-reference')).not.toContainText(/≥90|mL\/min|G[1-5]/);
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(page.locator('.clcr-result-assumptions[data-clcr-formula="neonatal_egfr"]')).toHaveText(assumptions);
  return result;
}

async function restoreNeonatal(page, fields = {}) {
  expect(await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'basic', selectedFormula: 'neonatal_egfr',
    inputs: {
      currentVersion: 'basic', formulaPicker: 'neonatal_egfr',
      age: '', ageMonths: '', ageDays: '14', neonatalTermStatus: 'term',
      sex: '', weight: '3.5', height: '50', Scr: '0.5', ScrUnit: 'mg/dl',
      ScrAssay: '', creatinineState: 'unknown', suspectedAKI: false,
      ...values,
    },
  }, {
    source: 'e2e-neonatal-synthetic-import', update: true,
    dispatchEvents: false, preserveAcrossVersions: true,
  }), fields)).toBe(true);
  await page.waitForFunction(() => (
    window.ClcrUiWorkflow.state.activeFormulaId === 'neonatal_egfr' &&
    document.getElementById('formulaPicker').value === 'neonatal_egfr' &&
    window.clcrIsResetting !== true
  ));
}

async function visibleFields(page) {
  return page.evaluate(() => {
    const visible = element => {
      if (!element.getClientRects().length || element.closest('details:not([open])')) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    };
    return [...document.querySelectorAll('#clcrForm input, #clcrForm select, #clcrForm textarea')]
      .filter(element => visible(element) && !element.matches('.clcr-canonical-picker,[type=hidden],[type=button],[type=submit],[type=reset],[type=file]'))
      .map(element => ({
        id: element.id, optional: Boolean(element.closest('details')),
        fontPx: parseFloat(getComputedStyle(element).fontSize), heightPx: element.getBoundingClientRect().height,
        leftPx: element.getBoundingClientRect().left, rightPx: element.getBoundingClientRect().right,
      }));
  });
}

async function expectMobileResultGap(page) {
  await czekajNaUstabilizowanyUklad(page);
  const geometry = await page.evaluate(() => ({
    gap: document.getElementById('clcrResultReport').getBoundingClientRect().top - document.getElementById('clearBtn').getBoundingClientRect().bottom,
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-20px')),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    viewportWidth: document.documentElement.clientWidth,
    clearLeft: document.getElementById('clearBtn').getBoundingClientRect().left,
    clearRight: document.getElementById('clearBtn').getBoundingClientRect().right,
  }));
  expect(geometry.token).toBe(20);
  expect(Math.abs(geometry.gap - geometry.token)).toBeLessThanOrEqual(1);
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.clearLeft).toBeGreaterThanOrEqual(0);
  expect(geometry.clearRight).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  for (const field of await visibleFields(page)) {
    expect(field.leftPx, `${field.id} znajduje się poza lewą krawędzią ekranu`).toBeGreaterThanOrEqual(0);
    expect(field.rightPx, `${field.id} znajduje się poza prawą krawędzią ekranu`).toBeLessThanOrEqual(geometry.viewportWidth + 1);
  }
}

async function screenshot(page, testInfo, name, resultOnly = false) {
  // Focus korekty uruchamia produkcyjne smooth-scroll. Kończymy przewijanie
  // przed fotografią całego formularza, bez zmiany danych lub stylów pól.
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await czekajNaUstabilizowanyUklad(page);
  const path = testInfo.outputPath(name);
  const options = { path, animations: 'disabled', style: '#mobileBottomDock, #scrollTopBtn { visibility: hidden !important; }' };
  if (resultOnly) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const clip = await page.evaluate(() => {
      const result = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="neonatal_egfr"]').getBoundingClientRect();
      const expanded = document.querySelector('#clcrResultReport .clcr-result-details[data-clcr-formula="neonatal_egfr"]').getBoundingClientRect();
      return { x: result.left + window.scrollX, y: result.top + window.scrollY, width: result.width, height: expanded.bottom - result.top };
    });
    await page.screenshot({ ...options, fullPage: true, clip });
  } else {
    await page.locator('#clcrWorkspace').screenshot(options);
  }
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const width of [1440, 390]) {
  test(`neonatal ${width}px: pięć danych bez pytania o metodę daje jeden neutralny wynik i czytelne Szczegóły`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await fillNeonatal(page);
    await expectNeonatal(page);
    await expect(page.locator('#clcrDataCompletion')).toHaveText('✓ Dane kompletne · 5/5');
    expect((await visibleFields(page)).map(field => field.id).sort()).toEqual(['Scr', 'ScrUnit', 'ageDays', 'height', 'neonatalTermStatus', 'weight']);
    for (const id of ['age', 'ageMonths', 'sex', 'ScrAssay', 'creatinineState', 'suspectedAKI']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    expect(await sourceInputs(page)).toMatchObject({ age: '', ageMonths: '', sex: '', ScrAssay: '', creatinineState: 'unknown', suspectedAKI: false });
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    await expect(page.locator('#clcrResultReport .clcr-neonatal-early-note')).toHaveCount(0);
    const optional = page.locator('#clcrForm details.clcr-context-details:visible');
    await expect(optional).toHaveCount(1);
    await expect(optional.locator(':scope > summary')).toHaveText('Metoda oznaczenia (jeśli znana)');
    await screenshot(page, testInfo, `neonatal-${width}-form.png`);
    await optional.locator(':scope > summary').evaluate(summary => summary.click());
    const fields = await visibleFields(page);
    expect(fields.filter(field => field.optional).map(field => field.id)).toEqual(['ScrAssay']);
    await expect(page.locator('#ScrAssay option[value="enzymatic_idms"]')).toHaveText('Enzymatyczna (IDMS)');
    if (width === 390) {
      expect(fields.every(field => field.fontPx >= 16 && field.heightPx >= 48)).toBe(true);
      await expectMobileResultGap(page);
    }
    const geometry = await page.evaluate(() => {
      const legend = document.querySelector('#serumSet > legend');
      const firstLabel = document.querySelector('#serumSet .clcr-field__name');
      const result = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="neonatal_egfr"]');
      const value = result.querySelector('.clcr-result-patient').getBoundingClientRect();
      const reference = result.querySelector('.clcr-result-reference').getBoundingClientRect();
      const save = document.getElementById('clcrVisitSaveCard');
      return {
        legendPosition: getComputedStyle(legend).position,
        labelGap: firstLabel.getBoundingClientRect().top - legend.getBoundingClientRect().bottom,
        referenceBesideValue: reference.left >= value.right - 1 && Math.abs(reference.top - value.top) <= 2,
        savePadding: [getComputedStyle(save).paddingLeft, getComputedStyle(save).paddingRight],
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      };
    });
    expect(geometry.legendPosition).toBe('static');
    expect(geometry.labelGap).toBeGreaterThanOrEqual(0);
    expect(geometry.referenceBesideValue).toBe(true);
    expect(geometry.savePadding).toEqual(['20px', '20px']);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    const expanded = await openResultDetails(page);
    await expect(expanded.locator(':scope > summary')).toHaveText('Szczegóły — obliczenie i ograniczenia');
    await expect(expanded).toContainText(/0[,.]31/);
    await expect(expanded).toContainText(/0–28/);
    await expect(expanded).toContainText(/enzymatyczn/);
    await expect(expanded.locator('a[href]')).toHaveCount(3);
    await expect(expanded.locator('[data-clcr-category-row]')).toHaveCount(0);
    await expect(expanded).not.toContainText(/Powierzchnia ciała|\bBSA\b|Haycock|P30 wynosi|Profil równania|Kategoria GFR/);
    await screenshot(page, testInfo, `neonatal-${width}-details.png`, true);
    expect(await sourceInputs(page)).toMatchObject({ ScrAssay: '', creatinineState: 'unknown', suspectedAKI: false });
    if (width === 390) {
      // Wspólny odstęp ma działać także poza nową ścieżką noworodkową.
      await selectFormula(page, 'ckid_u25', { waitForPicker: false });
      await page.locator('#age').fill('10');
      await page.locator('#sex').selectOption('F');
      await page.locator('#height').fill('140');
      await page.locator('#Scr').fill('0.6');
      await expect(page.locator('#formulaPicker')).toHaveValue('ckid_u25');
      await expect(card(page, 'ckid_u25')).toBeVisible();
      expect((await sourceInputs(page)).ageDays).toBe('14');
      await expectMobileResultGap(page);
      await selectFormula(page, 'ACR');
      await page.locator('#U_Alb').fill('45');
      await page.locator('#Ucr_spot').fill('100');
      await expect(page.locator('#ACR_entry_mode')).toHaveValue('concentration');
      await expect(card(page, 'ACR')).toBeVisible();
      await expectMobileResultGap(page);
    }
    expect(errors).toEqual([]);
  });
}

test('neonatal: jednostki i dni 0/2/3/28 zachowują liczbę; uwaga pierwszych dni nie barwi wyniku, dzień 29 blokuje', async ({ page }, testInfo) => {
  await openCalculator(page, 390);
  await fillNeonatal(page);
  await page.locator('#ScrUnit').selectOption('umol');
  await page.locator('#Scr').fill('44.2');
  await expectNeonatal(page);
  for (const day of ['0', '2', '3', '28']) {
    await page.locator('#ageDays').fill(day);
    await expectNeonatal(page);
    const note = page.locator('#clcrResultReport .clcr-neonatal-early-note[data-neonatal-early-note="true"]');
    if (Number(day) < 3) {
      await expect(note).toBeVisible();
      await expect(note).toHaveText(earlyText);
      await expect(note).toHaveCSS('color', 'rgb(154, 91, 0)');
      expect(await note.evaluate(element => Boolean(element.closest('details')))).toBe(false);
      if (day === '0') {
        await expectMobileResultGap(page);
        await screenshot(page, testInfo, 'neonatal-390-day0.png', true);
      }
    } else {
      await expect(note).toHaveCount(0);
    }
  }
  await page.locator('#ageDays').fill('29');
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
  await expect(page.locator('#clcrDataCompletion')).toBeHidden();
});

test('neonatal: masa kwalifikuje populację, a wcześniactwo i nieznane donoszenie pozostają blokadami', async ({ page }) => {
  await openCalculator(page);
  await fillNeonatal(page);
  await page.locator('#weight').fill('2.5');
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
  await page.locator('#weight').fill('2.5001');
  await expectNeonatal(page);
  for (const term of ['preterm', '']) {
    await page.locator('#neonatalTermStatus').selectOption(term);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
    await expect(page.locator('#clcrDataCompletion')).toBeHidden();
  }
  await page.locator('#neonatalTermStatus').selectOption('term');
  await expectNeonatal(page);
});

test('neonatal: sprzeczne zapisane lata i miesiące odsłaniają właściwe pole; świadoma korekta przywraca wynik bez zerowania danych', async ({ page }, testInfo) => {
  await openCalculator(page, 390);
  for (const [field, value, other] of [['age', '1', 'ageMonths'], ['ageMonths', '1', 'age']]) {
    await restoreNeonatal(page, { [field]: value, [other]: '0', sex: 'F' });
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrNeonatalAgeCorrection')).toBeVisible();
    await expect(page.locator(`#${field}`)).toBeVisible();
    await expect(page.locator(`#${other}`)).toBeHidden();
    expect(await sourceInputs(page)).toMatchObject({ [field]: value, [other]: '0', ageDays: '14', sex: 'F' });
    await expect(page.locator('#ageDays')).not.toHaveClass(/error/);
    await expect(page.locator('#clcrDataCompletion')).toBeHidden();
    const link = page.locator('#clcrReadiness .clcr-missing-link');
    await expect(link).toHaveCount(1);
    await kliknij(link);
    await expect(page.locator(`#${field}`)).toBeFocused();
    await expectMobileResultGap(page);
    if (field === 'age') await screenshot(page, testInfo, 'neonatal-390-contrary-age.png');
    // Zaznaczenie i usunięcie starej cyfry jest etapem rzeczywistej edycji.
    // Pytanie nie może zniknąć spod kursora przed wpisaniem nowej wartości.
    await page.locator(`#${field}`).press('ControlOrMeta+A');
    await page.locator(`#${field}`).press('Backspace');
    await expect(page.locator(`#${field}`)).toBeVisible();
    await expect(page.locator(`#${field}`)).toBeFocused();
    await page.locator(`#${field}`).press('2');
    await expect(page.locator(`#${field}`)).toHaveValue('2');
    await expect(card(page)).toHaveCount(0);
    expect(await sourceInputs(page)).toMatchObject({ [field]: '2', [other]: '0', ageDays: '14', sex: 'F' });
    await page.locator(`#${field}`).fill('0');
    await page.locator(`#${field}`).blur();
    await expectNeonatal(page);
    await expect(page.locator('#clcrNeonatalAgeCorrection')).toBeHidden();
    await expect(page.locator(`#${field}`)).toBeHidden();
    expect(await sourceInputs(page)).toMatchObject({ age: '0', ageMonths: '0', ageDays: '14', sex: 'F' });
  }
});

test('neonatal: odświeżenie układu zachowuje fokus i niedokończoną korektę lat lub miesięcy', async ({ page }) => {
  await openCalculator(page, 390);
  for (const [field, other] of [['age', 'ageMonths'], ['ageMonths', 'age']]) {
    await restoreNeonatal(page, { [field]: '1', [other]: '0' });
    const control = page.locator(`#${field}`);
    await expect(page.locator('#clcrNeonatalAgeCorrection')).toBeVisible();
    await control.focus();
    await expect(control).toBeFocused();
    await page.evaluate(() => window.ClcrUiWorkflow.refresh());
    await expect(control).toBeVisible();
    await expect(control).toBeFocused();

    await control.press('ControlOrMeta+A');
    await control.press('Backspace');
    await expect(control).toHaveValue('');
    await page.evaluate(() => window.ClcrUiWorkflow.refresh());
    await expect(control).toBeVisible();
    await expect(control).toBeFocused();
    await control.press('2');
    await expect(control).toHaveValue('2');
    await expect(card(page)).toHaveCount(0);
    expect(await sourceInputs(page)).toMatchObject({ [field]: '2', [other]: '0', ageDays: '14' });

    await control.fill('0');
    await page.evaluate(() => window.ClcrUiWorkflow.refresh());
    await expect(control).toBeVisible();
    await expect(control).toBeFocused();
    await control.blur();
    await expectNeonatal(page);
    await expect(control).toBeHidden();
    await expect(page.locator('#clcrNeonatalAgeCorrection')).toBeHidden();
    expect(await sourceInputs(page)).toMatchObject({ age: '0', ageMonths: '0', ageDays: '14' });
  }
});

test('neonatal: założenie IDMS nie tworzy faktów, znane AKI/Jaffe/non-IDMS blokują, a zmiana formuły zachowuje źródłowe dane', async ({ page }) => {
  await openCalculator(page);
  await fillNeonatal(page);
  const assayDetails = page.locator('#ScrAssay').locator('xpath=ancestor::details');
  await assayDetails.locator(':scope > summary').click();
  const nonIdmsOption = page.locator('#ScrAssay option[value="non_idms"]');
  await expect(nonIdmsOption).toHaveText('Bez standaryzacji IDMS');
  expect(await nonIdmsOption.getAttribute('hidden')).toBeNull();
  await expect(nonIdmsOption).toBeEnabled();
  await page.locator('#ScrAssay').selectOption('non_idms');
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
  expect((await sourceInputs(page)).ScrAssay).toBe('non_idms');
  await page.locator('#ScrAssay').selectOption('');
  await expectNeonatal(page);
  expect((await sourceInputs(page)).ScrAssay).toBe('');
  for (const facts of [
    { suspectedAKI: true }, { creatinineState: 'rapidlyChanging' },
    { ScrAssay: 'jaffe_idms' }, { ScrAssay: 'non_idms' },
    { ScrAssay: 'enzymatic_non_idms' }, { ScrAssay: 'jaffe_non_idms' },
  ]) {
    await restoreNeonatal(page, facts);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('neonatal_egfr'))).toBe(false);
    expect(await sourceInputs(page)).toMatchObject(facts);
    await expect(page.locator('#clcrDataCompletion')).toBeHidden();
  }
  await restoreNeonatal(page, { ScrAssay: 'not_idms', sex: 'F', age: '0', ageMonths: '0' });
  await expectNeonatal(page);
  expect(await sourceInputs(page)).toMatchObject({ ScrAssay: 'not_idms', creatinineState: 'unknown', suspectedAKI: false });
  await restoreNeonatal(page, { sex: 'F', age: '0', ageMonths: '0' });
  await expectNeonatal(page);
  const resolved = await page.evaluate(() => window.VildaClcrCalculationAssumptions.resolve('neonatal_egfr', {
    creatinineState: 'unknown', suspectedAKI: false, scrAssay: '',
    markerPolicy: window.ClcrClinicalSafety.creatininePolicy('unknown', false),
  }));
  expect(resolved).toMatchObject({
    allowed: true, assumptionsText: assumptions,
    calculationContext: { creatinineState: 'unknown', scrAssay: '', markerPolicy: { calculationAllowed: true, categoryAllowed: false, status: 'unknown' } },
    provenance: { creatinineStandardization: 'assumed' },
  });
  expect(await sourceInputs(page)).toMatchObject({ age: '0', ageMonths: '0', sex: 'F', weight: '3.5', ScrAssay: '' });
  await selectFormula(page, 'cg_norm', { waitForPicker: false });
  await page.locator('#age').fill('50');
  await page.locator('#weight').fill('70');
  await page.locator('#height').fill('175');
  await page.locator('#Scr').fill('1');
  await expect(page.locator('#formulaPicker')).toHaveValue('cg_norm');
  await expect(page.locator('#sex')).toHaveValue('F');
  await expect(card(page, 'cg_norm')).toBeVisible();
  await expect(await openResultDetails(page, 'cg_norm')).toContainText(/Powierzchnia ciała|\bBSA\b/);
  expect(await sourceInputs(page)).toMatchObject({ age: '50', ageMonths: '0', ageDays: '14', sex: 'F', ScrAssay: '', creatinineState: 'unknown' });
});

test('neonatal: jeden zapis i spójna treść PDF/DOCX/AI bez BSA, kategorii G ani dopisanej metody', async ({ page }) => {
  await openCalculator(page);
  await fillNeonatal(page);
  await page.locator('#ageDays').fill('0');
  await expectNeonatal(page);
  await expect(page.locator('[data-neonatal-early-note="true"]')).toHaveText(earlyText);
  const before = await sourceInputs(page);
  const saved = await page.evaluate(async () => {
    const api = window.ClcrVisitSave;
    const points = api.collectActiveDatapoints(document, { formulaId: 'neonatal_egfr' });
    const previous = { id: 'synthetic-history-neonatal', body: 'Historyczny wynik bez przeliczania.', labResult: { valueNum: 26 } };
    const previousJson = JSON.stringify(previous);
    const notes = [previous];
    const original = window.VildaVault;
    // Adapter wyłącznie w pamięci; bez tworzenia, otwierania lub odczytu sejfu.
    window.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async note => { notes.push(JSON.parse(JSON.stringify(note))); },
    };
    try {
      const outcome = await api.saveActiveResultToCard({
        patientId: 'synthetic-neonatal-only', clinicalDateISO: '2026-10-22',
        root: document, formulaId: 'neonatal_egfr',
      });
      return { outcome, points, notes, historyUnchanged: JSON.stringify(previous) === previousJson };
    } finally { window.VildaVault = original; }
  });
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1, total: 1 });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0]).toMatchObject({ sourceFormulaId: formulaId, valueNum: 31, unit: 'mL/min/1,73 m²', outOfRange: false, assumptions });
  expect(saved.points[0].norm || '').not.toMatch(/≥90|G[1-5]/);
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes[1].labResult).toMatchObject({ valueNum: 31, unit: 'mL/min/1,73 m²' });
  expect(saved.notes[1].labResult.norm || '').not.toMatch(/≥90|G[1-5]/);
  expect(saved.notes[1].body).toContain(assumptions);
  expect(saved.historyUnchanged).toBe(true);
  expect(await sourceInputs(page)).toEqual(before);
  await page.evaluate(() => {
    window.__neonatalExports = { pdf: [], pdfNames: [], docx: [], ai: [] };
    // Produkcyjne ścieżki i DOM eksportu; biblioteki kodujące zastępują odbiorniki
    // treści. Test nie sprawdza binarnego formatu plików vendor.
    window.vildaEnsurePdfLibraries = async () => {};
    window.jspdf = { jsPDF: class {
      addImage() {}
      save(name) { window.__neonatalExports.pdfNames.push(name); }
    } };
    window.html2canvas = async element => {
      window.__neonatalExports.pdf.push({
        text: element.textContent,
        visible: element.getClientRects().length > 0,
        // Eksporter klonuje childNodes karty do .result-item; jej zewnętrzne
        // data-* nie są kopiowane. Liczymy rzeczywiście widoczne liczby główne.
        primaryCount: element.querySelectorAll('.clcr-result-main .clcr-result-value').length,
      });
      return { width: 100, height: 100, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=' };
    };
    class TextRun { constructor(options) { this.text = options.text; } }
    class Paragraph { constructor(options) { this.children = options.children || []; } }
    class Document {
      constructor() { this.sections = []; }
      addSection(section) { this.sections.push(section); }
    }
    window.docx = {
      TextRun, Paragraph, Document, AlignmentType: { CENTER: 'center' },
      Packer: { toBlob: async document => {
        window.__neonatalExports.docx.push(document.sections.flatMap(section => section.children).map(paragraph => paragraph.children.map(run => run.text).join('')).join('\n'));
        return new Blob(['synthetic-export-content-sink'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      } },
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => window.__neonatalExports.ai.push(text) },
    });
  });
  await kliknij(page.locator('#downloadPDF'));
  await expect.poll(() => page.evaluate(() => window.__neonatalExports.pdfNames.length)).toBe(1);
  await expect(details(page)).not.toHaveAttribute('open', '');
  const docxDownload = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  expect((await docxDownload).suggestedFilename()).toMatch(/\.docx$/);
  await expect.poll(() => page.evaluate(() => window.__neonatalExports.docx.length)).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__neonatalExports.ai.length)).toBe(1);
  const exports = await page.evaluate(() => window.__neonatalExports);
  expect(exports.pdf[0].visible).toBe(true);
  expect(exports.pdf[0].primaryCount).toBe(1);
  for (const text of [exports.pdf[0].text, exports.docx[0], exports.ai[0]]) {
    expect(text).toContain(assumptions);
    expect(text).toContain('31');
    expect(text).toContain('Zależy od dnia życia');
    expect(text).toContain('Szacowany eGFR');
    expect(text.split(earlyText)).toHaveLength(2);
    expect(text).not.toMatch(/Powierzchnia ciała|\bBSA\b|Haycock|Kategoria GFR|Zakres G1|P30 wynosi|stabilna czynność nerek/);
  }
  expect(await sourceInputs(page)).toEqual(before);
  expect(before.ScrAssay).toBe('');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
});
