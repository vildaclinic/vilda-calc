import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Produkcyjny formularz, rzeczywisty silnik i fikcyjny pacjent. Bez autoryzacji sejfu.
const formulaId = 'cl24';
const profileId = 'PATHWEST_CCL_2026_03_20';
const sourceUrl = 'https://pathwesttd.health.wa.gov.au/testdirectory/testdetail.aspx?TestID=521';
const adultBounds = [86.53155171550813, 135.67292676382138];

async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') &&
    typeof window.clcrUpdate === 'function' && typeof window.applyClcrSessionSnapshot === 'function' &&
    typeof window.buildClcrSessionSnapshot === 'function' && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
}

async function selectFormula(page, id = formulaId) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await expect.poll(() => page.evaluate(() => ({ active: window.ClcrUiWorkflow.state.activeFormulaId, resetting: window.clcrIsResetting === true })))
    .toEqual({ active: id, resetting: false });
  await expect(page.locator('#formulaPicker')).toHaveValue(id);
}

async function restorePatient(page, fields = {}, { legacy = false } = {}) {
  expect(await page.evaluate(({ values, old }) => {
    const inputs = {
      currentVersion: 'advanced', formulaPicker: 'cl24', age: '45', ageMonths: '', ageDays: '',
      sex: 'M', weight: '70', height: '175', Scr: '1', ScrUnit: 'mg/dl', Ucr: '100', V24: '1440',
      ScrAssay: '', creatinineState: 'unknown', suspectedAKI: false, Cl24CollectionProblem: false,
      ...(old ? {} : { Cl24DurationHours: '24', Cl24DurationSource: 'hours' }), ...values,
    };
    return window.applyClcrSessionSnapshot({ version: 2, currentVersion: 'advanced', selectedFormula: 'cl24', inputs }, {
      source: 'e2e-cl24-synthetic', update: true, dispatchEvents: false, preserveAcrossVersions: true,
    });
  }, { values: fields, old: legacy })).toBe(true);
  await page.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'cl24' &&
    document.getElementById('formulaPicker').value === 'cl24' && window.clcrIsResetting !== true);
}

const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cl24"]');
const details = page => page.locator('#clcrResultReport .clcr-result-details[data-clcr-formula="cl24"]');
const inputs = page => page.evaluate(() => window.buildClcrSessionSnapshot().inputs);

async function reference(page) {
  return JSON.parse(await card(page).getAttribute('data-clcr-measured-reference'));
}

async function expectResult(page, value = 100, tone = 'success') {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect.poll(async () => Number(await card(page).getAttribute('data-clcr-value'))).toBeCloseTo(value, 8);
  await expect(card(page).locator('.clcr-result-value')).toHaveText(String(Math.round(value)));
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('mL/min');
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  await expect(card(page).locator('.clcr-result-value')).toHaveCSS('color', {
    success: 'rgb(20, 122, 100)', warning: 'rgb(154, 91, 0)', neutral: 'rgb(68, 90, 100)',
  }[tone]);
  expect(await card(page).getAttribute('data-clcr-category') || '').toBe('');
  await expect(page.locator('#clcrDataCompletion')).toContainText('4/4');
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
}

async function openDetails(page) {
  if (await details(page).getAttribute('open') === null) await details(page).locator(':scope > summary').evaluate(node => node.click());
  await expect(details(page)).toHaveAttribute('open', '');
  return details(page);
}

async function visibleFields(page) {
  return page.evaluate(() => [...document.querySelectorAll('#clcrForm input, #clcrForm select, #clcrForm textarea')]
    .filter(element => {
      if (!element.getClientRects().length || element.closest('details:not([open])') ||
        element.matches('.clcr-canonical-picker,[type=hidden],[type=button],[type=submit],[type=reset],[type=file]')) return false;
      for (let node = element; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
      }
      return true;
    }).map(element => ({
      id: element.id, type: element.type, font: parseFloat(getComputedStyle(element).fontSize),
      height: element.getBoundingClientRect().height, left: element.getBoundingClientRect().left, right: element.getBoundingClientRect().right,
    })));
}

async function expectGeometry(page, width) {
  await czekajNaUstabilizowanyUklad(page);
  const geometry = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    width: document.documentElement.clientWidth,
    clear: { left: document.getElementById('clearBtn').getBoundingClientRect().left, right: document.getElementById('clearBtn').getBoundingClientRect().right },
    gap: document.getElementById('clcrResultReport').getBoundingClientRect().top - document.getElementById('clearBtn').getBoundingClientRect().bottom,
    token: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--space-20px')),
    legendGap: document.querySelector('#cl24MinimalFields .clcr-field__name').getBoundingClientRect().top -
      document.querySelector('#cl24MinimalFields > legend').getBoundingClientRect().bottom,
  }));
  expect(geometry.overflow).toBeLessThanOrEqual(1);
  expect(geometry.legendGap).toBeGreaterThanOrEqual(0);
  expect(geometry.clear.left).toBeGreaterThanOrEqual(0);
  expect(geometry.clear.right).toBeLessThanOrEqual(geometry.width + 1);
  const overlappingLabels = await page.evaluate(() => [...document.querySelectorAll('#cl24MinimalFields .clcr-field')]
    .filter(field => {
      const name = field.querySelector('.clcr-field__name');
      const info = field.querySelector('.clcr-info-button');
      if (!name || !info || !name.getClientRects().length) return false;
      const range = document.createRange();
      range.selectNodeContents(name);
      const button = info.getBoundingClientRect();
      return [...range.getClientRects()].some(text => Math.min(text.right, button.right) - Math.max(text.left, button.left) > 1 &&
        Math.min(text.bottom, button.bottom) - Math.max(text.top, button.top) > 1);
    }).map(field => field.querySelector('input,select')?.id));
  expect(overlappingLabels, 'Przycisk informacji nie zasłania etykiety pola').toEqual([]);
  for (const field of await visibleFields(page)) {
    expect(field.left, `${field.id}: lewa krawędź`).toBeGreaterThanOrEqual(0);
    expect(field.right, `${field.id}: prawa krawędź`).toBeLessThanOrEqual(geometry.width + 1);
    if (width < 980 && !['checkbox', 'radio'].includes(field.type)) {
      expect(field.font, `${field.id}: czcionka bez autozoomu`).toBeGreaterThanOrEqual(16);
      expect(field.height, `${field.id}: wysokość`).toBeGreaterThanOrEqual(48);
    }
  }
  if (width < 980) {
    expect(geometry.token).toBe(20);
    expect(Math.abs(geometry.gap - geometry.token)).toBeLessThanOrEqual(1);
  }
}

async function screenshot(page, testInfo, name) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
  await czekajNaUstabilizowanyUklad(page);
  const path = testInfo.outputPath(name);
  await page.locator('#clcrWorkspace').screenshot({ path, animations: 'disabled', style: '#mobileBottomDock, #scrollTopBtn { visibility: hidden !important; }' });
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

async function attachLoadedAssets(page, testInfo) {
  const assets = await page.evaluate(() => ({
    page: location.href,
    loaded: performance.getEntriesByType('resource').map(entry => entry.name).filter(url =>
      /\/(?:clcr_|inline_kalkulator_klirens_)/.test(url)),
  }));
  await testInfo.attach('cl24-loaded-assets.json', { body: JSON.stringify(assets, null, 2), contentType: 'application/json' });
}

async function expectPaintedGauge(page) {
  const gauge = card(page).locator('svg.clcr-measured-reference-gauge');
  await expect(gauge).toBeVisible();
  await expect(gauge.locator('.clcr-measured-reference-marker text')).toHaveText('Wynik');
  await expect(gauge.locator('.clcr-measured-reference-band-label')).toHaveText('Norma');
  const painted = await gauge.evaluate(element => {
    const shape = selector => {
      const node = element.querySelector(selector);
      const box = node.getBBox();
      const style = getComputedStyle(node);
      return { width: box.width, height: box.height, fill: style.fill, opacity: Number(style.opacity), visibility: style.visibility };
    };
    const track = element.querySelector('.clcr-measured-reference-track').getBoundingClientRect();
    const band = element.querySelector('.clcr-measured-reference-band').getBoundingClientRect();
    // Nested SVG bbox also includes the overflowing label. The triangle tip
    // represents the value; the label may extend beyond a reference boundary.
    const marker = element.querySelector('.clcr-measured-reference-marker path').getBoundingClientRect();
    const markerX = marker.left + marker.width / 2;
    return { shapes: [shape('.clcr-measured-reference-track'), shape('.clcr-measured-reference-band'),
      shape('.clcr-measured-reference-marker path'), shape('.clcr-measured-reference-marker text'), shape('.clcr-measured-reference-band-label')],
      bandInsideTrack: band.left >= track.left - 1 && band.right <= track.right + 1 && band.width < track.width,
      resultInsideNormalBand: markerX >= band.left - 1 && markerX <= band.right + 1 };
  });
  for (const shape of painted.shapes) {
    expect(shape.width).toBeGreaterThan(0);
    expect(shape.height).toBeGreaterThan(0);
    expect(shape.fill).not.toMatch(/^(?:none|transparent|rgba\(0, 0, 0, 0\))$/);
    expect(shape.opacity).toBeGreaterThan(0);
    expect(shape.visibility).toBe('visible');
  }
  expect(painted.bandInsideTrack).toBe(true);
  expect(painted.resultInsideNormalBand).toBe(true);
}

for (const width of [1440, 390, 320]) {
  test(`cl24 ${width}px: cztery dane, jawne 24 h i jeden wynik z normą pacjenta`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await restorePatient(page, { Scr: '', Ucr: '', V24: '', Cl24DurationHours: '', Cl24DurationSource: '' });
    await expect(page.locator('#Cl24DurationHours')).toHaveValue('');
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrDataCompletion')).toContainText('0/4');
    await expect(page.locator('#clcrReadiness')).toContainText('Tutaj pojawi się wynik');
    await page.locator('#Scr').fill('1');
    await page.locator('#Ucr').fill('100');
    await page.locator('#V24').fill('1440');
    await expect(page.locator('#clcrDataCompletion')).toContainText('3/4');
    await kliknij(page.locator('#cl24DurationShortcut'));
    await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
    await expectResult(page);
    expect((await visibleFields(page)).map(field => field.id).sort()).toEqual(['Cl24DurationHours', 'Scr', 'ScrUnit', 'Ucr', 'V24']);
    for (const id of ['age', 'sex', 'weight', 'height', 'collectionStartAt', 'collectionEndAt', 'serumSampleAt', 'creatinineState', 'ScrAssay']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    await expect(card(page).locator('.clcr-measured-reference-line')).toHaveText('Norma: ≈86,5–135,7 mL/min');
    await expect(card(page).locator('.clcr-measured-reference-source a')).toHaveAttribute('href', sourceUrl);
    await expect(card(page).locator('.clcr-measured-reference-gauge')).toHaveAttribute('role', 'img');
    await expect(card(page).locator('.clcr-measured-reference-gauge')).toHaveAttribute('aria-label', /100.*86,5.*135,7/);
    await expectPaintedGauge(page);
    const snapshot = await reference(page);
    expect(snapshot).toMatchObject({ available: true, status: 'within', profileId, value: 100, unit: 'mL/min', durationHours: 24, durationSource: 'hours', bsaMethod: 'Du Bois', referencePreview: true });
    expect(snapshot.absoluteRange.lower).toBeCloseTo(adultBounds[0], 8);
    expect(snapshot.absoluteRange.upper).toBeCloseTo(adultBounds[1], 8);
    expect(await inputs(page)).toMatchObject({ ScrAssay: '', creatinineState: 'unknown', suspectedAKI: false });
    await expectGeometry(page, width);
    await screenshot(page, testInfo, `cl24-${width}-form.png`);
    const expanded = await openDetails(page);
    await expect(expanded.locator(':scope > summary')).toHaveText('Szczegóły i źródła');
    await expect(expanded).toContainText(/24 h = 1440 min/);
    await expect(expanded).toContainText(/81–127/);
    await expect(expanded).toContainText(/Du Bois/);
    await expect(expanded).toContainText(/IDMS/);
    await expect(expanded).not.toContainText(/Kategoria GFR|Zakres G1/);
    await screenshot(page, testInfo, `cl24-${width}-details.png`);
    await attachLoadedAssets(page, testInfo);
    expect(errors).toEqual([]);
  });
}

test('cl24: jednostki i rzeczywisty czas z przecinkiem; pusty lub błędny czas nie staje się 24 h', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page);
  await page.locator('#ScrUnit').selectOption('umol');
  await page.locator('#Scr').fill('88.4');
  await expectResult(page);
  await page.locator('#Cl24DurationHours').fill('12,5');
  await expectResult(page, 192, 'warning');
  expect(await reference(page)).toMatchObject({ available: true, status: 'above', durationHours: 12.5, durationSource: 'hours' });
  await expect(card(page).locator('.clcr-measured-protocol-note')).toContainText('Porównanie z normą dla zbiórki dobowej.');
  const expanded = await openDetails(page);
  await expect(expanded).toContainText('12,5 h = 750 min');
  for (const value of ['0', '-1', 'abc', '']) {
    await page.locator('#Cl24DurationHours').fill(value);
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#Cl24DurationHours')).toHaveValue(value);
    expect(await page.evaluate(() => window.canComputeFormula('cl24'))).toBe(false);
  }
});

test('cl24: norma zależy od wieku, płci i BSA; dziecko nie wymaga płci, liczba nie ma progu eGFR', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page);
  for (const [volume, value, status] of [['720', 50, 'below'], ['2304', 160, 'above']]) {
    await page.locator('#V24').fill(volume);
    await expectResult(page, value, 'warning');
    expect((await reference(page)).status).toBe(status);
    await expect(card(page).locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
  }
  await restorePatient(page, { age: '8', sex: '', weight: '25', height: '125', V24: '720' });
  await expectResult(page, 50);
  let snapshot = await reference(page);
  expect(snapshot.bsaMethod).toBe('Haycock');
  expect(snapshot.absoluteRange.lower).toBeCloseTo(40.273810451920305, 8);
  expect(snapshot.absoluteRange.upper).toBeCloseTo(67.12301741986717, 8);
  await expect(card(page).locator('.clcr-measured-reference-line')).toContainText('≈40,3–67,1 mL/min');
  await restorePatient(page, { age: '82', V24: '1008' });
  await expectResult(page, 70);
  snapshot = await reference(page);
  expect(snapshot.absoluteRange.lower).toBeCloseTo(58.755991905591934, 8);
  expect(snapshot.absoluteRange.upper).toBeCloseTo(107.89736695390518, 8);
  await restorePatient(page, { age: '18', sex: '' });
  await expectResult(page);
  expect(await reference(page)).toMatchObject({ available: true, bsaMethod: 'Du Bois' });
  await restorePatient(page, { age: '19', sex: '' });
  await expectResult(page, 100, 'neutral');
  expect((await reference(page)).missingFields).toContain('sex');
  await restorePatient(page, { age: '2', sex: '' });
  await expectResult(page, 100, 'neutral');
  expect((await reference(page)).available).toBe(false);
  await expect(card(page)).toContainText(/3.*lat|pediatr/);
  await expect(card(page).locator('.clcr-measured-reference-gauge')).toHaveCount(0);
  await restorePatient(page, { age: '0', ageMonths: '', sex: '' });
  await expectResult(page, 100, 'neutral');
  expect((await reference(page)).available).toBe(false);
  await expect(card(page)).toContainText(/3.*lat|pediatr/);
  await expect(card(page).locator('[data-clcr-complete-reference]')).toHaveCount(0);
});

test('cl24: brak normy nie blokuje wyniku, a uzupełnianie odsłania tylko brakujące dane pacjenta', async ({ page }, testInfo) => {
  await openCalculator(page, 390);
  await restorePatient(page, { age: '', sex: '', weight: '', height: '' });
  await expectResult(page, 100, 'neutral');
  for (const id of ['age', 'sex', 'weight', 'height']) await expect(page.locator(`#${id}`)).toBeHidden();
  await restorePatient(page, { weight: '', height: '' });
  await expectResult(page, 100, 'neutral');
  const complete = card(page).locator('[data-clcr-complete-reference]');
  expect((await complete.getAttribute('data-clcr-missing-fields')).split(',').sort()).toEqual(['height', 'weight']);
  await kliknij(complete);
  await expect(page.locator('#cl24ReferenceFieldsDetails')).toHaveAttribute('open', '');
  for (const id of ['weight', 'height']) await expect(page.locator(`#${id}`)).toBeVisible();
  for (const id of ['age', 'sex']) await expect(page.locator(`#${id}`)).toBeHidden();
  await expectGeometry(page, 390);
  await screenshot(page, testInfo, 'cl24-390-missing-reference.png');
  await page.locator('#weight').fill('70');
  await page.locator('#height').fill('175');
  await expectResult(page);
  expect(await inputs(page)).toMatchObject({ age: '45', sex: 'M', weight: '70', height: '175' });
});

test('cl24: znany problem zbiórki i przeciwwskazania blokują, dawne niezaznaczenie i czas pobrania krwi nie blokują', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page, { collectionNoMissedVoids: false, serumSampleDuringCollection: false, ui_serumSampleDuringCollection_answer: 'no', serumSampleAt: '2026-10-01T08:00' });
  await expectResult(page);
  expect(await inputs(page)).toMatchObject({ collectionNoMissedVoids: false, ui_serumSampleDuringCollection_answer: 'no', serumSampleDuringCollection: false });
  await page.locator('#cl24CollectionProblemDetails > summary').click();
  await page.locator('#Cl24CollectionProblem').check();
  await expect(card(page)).toHaveCount(0);
  await page.locator('#Cl24CollectionProblem').uncheck();
  await expectResult(page);
  await restorePatient(page, { ui_collectionNoMissedVoids_answer: 'no', collectionNoMissedVoids: false });
  await expect(card(page)).toHaveCount(0);
  expect((await inputs(page)).ui_collectionNoMissedVoids_answer).toBe('no');
  if (await page.locator('#cl24CollectionProblemDetails').getAttribute('open') === null) await page.locator('#cl24CollectionProblemDetails > summary').click();
  await expect(page.locator('#Cl24CollectionProblem')).toBeChecked();
  await page.locator('#Cl24CollectionProblem').uncheck();
  await expectResult(page);
  expect((await inputs(page)).ui_collectionNoMissedVoids_answer).toBe('');
  for (const fields of [{ suspectedAKI: true }, { creatinineState: 'rapidlyChanging' }]) {
    await restorePatient(page, fields);
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('cl24'))).toBe(false);
  }
  // Iloraz UCr/Scr nie wprowadza nowej konieczności IDMS. Jawna metoda
  // pozostaje faktem źródłowym i nie dostaje sprzecznego założenia IDMS.
  await restorePatient(page, { ScrAssay: 'non_idms' });
  await expectResult(page);
  expect((await inputs(page)).ScrAssay).toBe('non_idms');
  expect(await card(page).getAttribute('data-clcr-assumptions')).not.toMatch(/standaryzowana do IDMS/);
  await restorePatient(page, {
    U_UA: '100', collectionStartAt: '2026-10-01T08:00', collectionEndAt: '2026-10-02T08:00',
    collectionStartVoidDiscarded: false, collectionFinalVoidIncluded: false,
    collectionNoMissedVoids: false, collectionNoSpillage: false,
    collectionNoExtraVoids: false, collectionStorageFollowed: false,
    ui_collectionStartVoidDiscarded_answer: '', ui_collectionFinalVoidIncluded_answer: '',
    ui_collectionNoMissedVoids_answer: '', ui_collectionNoSpillage_answer: '',
    ui_collectionNoExtraVoids_answer: '', ui_collectionStorageFollowed_answer: '',
  });
  await expectResult(page);
  await selectFormula(page, 'UA_mgkg');
  // Audited UA owns dedicated controls and assumes a complete 24-hour collection.
  await page.locator('#UA_concentration').fill('100');
  await page.locator('#UA_volume').fill('1440');
  await expect(page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cl24"]')).toHaveCount(0);
  await expect(page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="UA_mgkg"]')).toHaveCount(1);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('UA_mgkg').valueReady)).toBe(true);
  await selectFormula(page);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
  await expectResult(page);
  expect(await page.evaluate(() => window.currentVersion)).toBe('advanced');
});

test('cl24: migracja zapisanych dat jest jednorazowa; przełączenie i czyszczenie nie tworzą czasu ani starej normy', async ({ page }) => {
  await openCalculator(page);
  const dates = { collectionStartAt: '2026-10-01T08:00', collectionEndAt: '2026-10-02T08:00' };
  await restorePatient(page, dates, { legacy: true });
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('24');
  await expectResult(page);
  expect((await reference(page)).durationSource).toBe('legacy-dates');
  await restorePatient(page, { ...dates, Cl24DurationHours: '', Cl24DurationSource: '' });
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  await page.locator('#Cl24DurationHours').fill('12,5');
  await expectResult(page, 192, 'warning');
  await selectFormula(page, 'cg_norm');
  await expect(page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="cg_norm"]')).toBeVisible();
  expect(await page.evaluate(() => window.currentVersion)).toBe('basic');
  await expect(page.locator('#clcrResultReport [data-clcr-measured-reference]')).toHaveCount(0);
  await selectFormula(page);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('12,5');
  await expectResult(page, 192, 'warning');
  await page.locator('#Cl24DurationHours').clear();
  await selectFormula(page, 'cg_norm');
  await selectFormula(page);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
  await restorePatient(page, { ...dates, Cl24CollectionProblem: true, ui_collectionNoMissedVoids_answer: 'no' });
  await kliknij(page.locator('#clearBtn'));
  await page.waitForFunction(() => window.clcrIsResetting !== true);
  const cleared = await inputs(page);
  expect(cleared.Cl24DurationHours).toBe('');
  expect(cleared.Cl24DurationSource).toBe('');
  expect(cleared.Cl24CollectionProblem).toBe(false);
  expect(cleared.ui_collectionNoMissedVoids_answer || '').toBe('');
  await selectFormula(page);
  await expect(page.locator('#Cl24DurationHours')).toHaveValue('');
  await expect(card(page)).toHaveCount(0);
});

test('cl24: zapis, historia i eksporty zachowują jeden wynik, źródło normy, czas oraz założenia', async ({ page }, testInfo) => {
  await openCalculator(page);
  await restorePatient(page);
  await expectResult(page);
  const before = await inputs(page);
  const snapshot = await reference(page);
  const saved = await page.evaluate(async () => {
    const api = window.ClcrVisitSave;
    const points = api.collectActiveDatapoints(document, { formulaId: 'cl24' });
    const notes = [];
    const original = window.VildaVault;
    const originalPatientId = api.resolveCurrentPatientId();
    // The clinical writer now requires an existing selected fictional card.
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'synthetic-cl24-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu Klirensu' } } : null, savePatientNote: async note => { notes.push(JSON.parse(JSON.stringify(note))); } };
    api._setPatientId('synthetic-cl24-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'synthetic-cl24-only', clinicalDateISO: '2026-10-23', root: document, formulaId: 'cl24' });
      window.__cl24SavedNotes = JSON.parse(JSON.stringify(notes));
      return { outcome, points, notes, series: api.buildSeriesFromNotes(notes, { formulaId: 'cl24' }) };
    } finally { window.VildaVault = original; api._setPatientId(originalPatientId); }
  });
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1, total: 1 });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0]).toMatchObject({ sourceFormulaId: 'cl24', valueNum: 100, unit: 'mL/min', outOfRange: false });
  expect(saved.points[0].measuredClearanceReference).toEqual(snapshot);
  expect(saved.points[0].norm).toContain('86,5–135,7');
  expect(saved.notes).toHaveLength(1);
  expect(saved.notes[0].labResult).toMatchObject({ valueNum: 100, unit: 'mL/min', norm: saved.points[0].norm });
  expect(saved.notes[0].labResult).not.toHaveProperty('measuredClearanceReference');
  for (const text of ['PathWest', profileId, 'Du Bois', '24 h', '1440 min', 'IDMS', sourceUrl]) expect(saved.notes[0].body).toContain(text);
  expect(saved.series).toHaveLength(1);
  expect(saved.series[0].points).toHaveLength(1);
  expect(saved.series[0].points[0]).toMatchObject({ valueNum: 100, norm: saved.points[0].norm });
  const session = await page.evaluate(() => window.buildClcrSessionSnapshot());
  expect(session.inputs).toMatchObject({ Cl24DurationHours: '24', Cl24DurationSource: 'hours', Cl24CollectionProblem: false });
  await restorePatient(page, { age: '82', V24: '1008' });
  await expectResult(page, 70);
  expect(await page.evaluate(() => window.ClcrVisitSave.buildSeriesFromNotes(window.__cl24SavedNotes, { formulaId: 'cl24' }))).toEqual(saved.series);
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, { source: 'e2e-cl24-roundtrip', update: true, dispatchEvents: false, preserveAcrossVersions: true }), session)).toBe(true);
  await expectResult(page);
  expect(await reference(page)).toEqual(snapshot);
  await page.evaluate(() => {
    window.__cl24Exports = { pdf: [], pdfNames: [], docx: [], ai: [] };
    // Rzeczywiste ścieżki i DOM eksportu. Odbiorniki zastępują jedynie biblioteki
    // kodujące pliki; binarny format bibliotek vendor nie jest zakresem testu.
    window.vildaEnsurePdfLibraries = async () => {};
    window.jspdf = { jsPDF: class { addImage() {} save(name) { window.__cl24Exports.pdfNames.push(name); } } };
    window.html2canvas = async element => {
      window.__cl24Exports.pdf.push({ text: element.textContent, visible: element.getClientRects().length > 0,
        primaryCount: element.querySelectorAll('.clcr-result-main .clcr-result-value').length });
      return { width: 100, height: 100, toDataURL: () => 'data:image/png;base64,iVBORw0KGgo=' };
    };
    class TextRun { constructor(options) { this.text = options.text; } }
    class Paragraph { constructor(options) { this.children = options.children || []; } }
    class Document { constructor() { this.sections = []; } addSection(section) { this.sections.push(section); } }
    window.docx = { TextRun, Paragraph, Document, AlignmentType: { CENTER: 'center' }, Packer: { toBlob: async document => {
      window.__cl24Exports.docx.push(document.sections.flatMap(section => section.children).map(paragraph => paragraph.children.map(run => run.text).join('')).join('\n'));
      return new Blob(['synthetic-export-content-sink'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    } } };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__cl24Exports.ai.push(text) } });
  });
  await kliknij(page.locator('#downloadPDF'));
  await expect.poll(() => page.evaluate(() => window.__cl24Exports.pdfNames.length)).toBe(1);
  await expect(details(page)).not.toHaveAttribute('open', '');
  const download = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  page.once('dialog', dialog => dialog.accept());
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__cl24Exports.ai.length)).toBe(1);
  const exports = await page.evaluate(() => window.__cl24Exports);
  expect(exports.pdf[0]).toMatchObject({ visible: true, primaryCount: 1 });
  for (const text of [exports.pdf[0].text, exports.docx[0], exports.ai[0]]) {
    for (const fragment of ['100', '86,5–135,7', 'mL/min', 'PathWest', '24 h = 1440 min', 'IDMS', 'AKI']) expect(text).toContain(fragment);
    expect(text).toMatch(/pełna, prawidłowa zbiórka/);
    expect(text).not.toMatch(/Kategoria GFR|Zakres G1/);
  }
  expect(await inputs(page)).toEqual(before);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  await attachLoadedAssets(page, testInfo);
});
