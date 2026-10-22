import { expect, test } from '@playwright/test';
import { czekajNaUstabilizowanyUklad, kliknij } from '../support/uklad-czekanie.mjs';

// Rzeczywisty formularz i silnik; wyłącznie syntetyczna sesja gościa. Nie
// instalujemy DOM makiety i nie otwieramy sejfu. Liczby pochodzą z audytu Decimal80.
const formulaId = 'ckid_u25_cr_cys';
const assumptions = 'Założenia: stabilna czynność nerek, brak podejrzenia AKI, kreatynina standaryzowana do IDMS oraz oznaczenie cystatyny C standaryzowane do IFCC.';
const population = 'Wzór opracowano dla osób w wieku 1–25 lat z łagodną lub umiarkowaną PChN.';

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
  const decline = page.locator('#consent-decline');
  if (await decline.isVisible()) await decline.click();
}

async function selectFormula(page, id = formulaId) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await expect.poll(() => page.evaluate(() => ({
    active: window.ClcrUiWorkflow.state.activeFormulaId,
    picker: document.getElementById('formulaPicker').value,
    resetting: window.clcrIsResetting === true,
  }))).toEqual({ active: id, picker: id, resetting: false });
}

async function fillAverage(page, { age = '10', height = '140', scr = '0.6', cystatin = '1.0' } = {}) {
  await selectFormula(page);
  await page.locator('#age').fill(age);
  await page.locator('#sex').selectOption('F');
  await page.locator('#height').fill(height);
  await page.locator('#ScrUnit').selectOption('mg/dl');
  await page.locator('#Scr').fill(scr);
  await page.locator('#CystatinC').fill(cystatin);
  await page.locator('#CystatinC').blur();
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

async function expectAverage(page, display, raw) {
  const result = card(page);
  await expect(result).toBeVisible();
  await expect(result.locator('.clcr-result-value')).toHaveText(display);
  await expect.poll(async () => Number(await result.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 8);
  return result;
}

async function sourceInputs(page) {
  return page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
}

async function expectUnknownFacts(page) {
  expect(await sourceInputs(page)).toMatchObject({
    ScrAssay: '', CystatinCStandardization: '', CystatinCAssayMethod: '',
    CrCysStandardizationConfirmed: false, creatinineState: 'unknown', suspectedAKI: false,
  });
}

async function restoreAverage(page, fields) {
  expect(await page.evaluate(values => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'pro', selectedFormula: 'ckid_u25_cr_cys',
    inputs: {
      currentVersion: 'pro', formulaPicker: 'ckid_u25_cr_cys',
      age: '10', ageMonths: '', sex: 'F', height: '140', weight: '',
      Scr: '0.6', ScrUnit: 'mg/dl', CystatinC: '1.0',
      ScrAssay: '', CystatinCStandardization: '', CystatinCAssayMethod: '',
      CrCysStandardizationConfirmed: false, creatinineState: 'unknown', suspectedAKI: false,
      ...values,
    },
  }, {
    source: 'e2e-u25-average-synthetic-import', update: true,
    dispatchEvents: false, preserveAcrossVersions: true,
  }), fields)).toBe(true);
  await page.waitForFunction(() => (
    window.ClcrUiWorkflow.state.activeFormulaId === 'ckid_u25_cr_cys' &&
    document.getElementById('formulaPicker').value === 'ckid_u25_cr_cys' &&
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
      }));
  });
}

async function expectComponents(page, { creatinine, cystatin, creatinineRaw, cystatinRaw }) {
  const section = details(page).locator('[data-clcr-average-components]');
  await expect(section).toHaveCount(1);
  const cr = section.locator('[data-clcr-component="creatinine"]');
  const cys = section.locator('[data-clcr-component="cystatinC"]');
  await expect(cr.locator('td').last()).toHaveText(creatinine);
  await expect(cys.locator('td').last()).toHaveText(cystatin);
  await expect.poll(async () => Number(await cr.getAttribute('data-clcr-component-value'))).toBeCloseTo(creatinineRaw, 8);
  await expect.poll(async () => Number(await cys.getAttribute('data-clcr-component-value'))).toBeCloseTo(cystatinRaw, 8);
  await expect(section).toContainText('mL/min/1,73 m²');
  await expect(section).toContainText('Średnią obliczamy przed zaokrągleniem wartości.');
  await expect(section.locator('[data-clcr-series], [data-clcr-value]')).toHaveCount(0);
  return section;
}

async function screenshot(page, testInfo, name, resultOnly = false) {
  await czekajNaUstabilizowanyUklad(page);
  const path = testInfo.outputPath(name);
  const options = {
    path, animations: 'disabled',
    style: '#mobileBottomDock, #scrollTopBtn { visibility: hidden !important; }',
  };
  if (resultOnly) {
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    const clip = await page.evaluate(() => {
      const result = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="ckid_u25_cr_cys"]').getBoundingClientRect();
      const expanded = document.querySelector('#clcrResultReport .clcr-result-details[data-clcr-formula="ckid_u25_cr_cys"]').getBoundingClientRect();
      return { x: result.left + window.scrollX, y: result.top + window.scrollY, width: result.width, height: expanded.bottom - result.top };
    });
    await page.screenshot({ ...options, fullPage: true, clip });
  } else {
    await page.locator('#clcrWorkspace').screenshot(options);
  }
  await testInfo.attach(name, { path, contentType: 'image/png' });
}

for (const width of [1440, 390]) {
  test(`średnia U25 ${width}px: pięć danych daje jeden wynik 81/G2; tylko miesiące są opcjonalne, a składowe są w Szczegółach`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await fillAverage(page);
    const result = await expectAverage(page, '81', 81.0831084231038);
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
    await expect(result).toHaveAttribute('data-clcr-category', 'G2');
    await expect(result).toHaveAttribute('data-clcr-tone', 'warning');
    await expect(result.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
    await expect(result.locator('.clcr-result-reference-label')).toHaveText('Zakres G1 (KDIGO)');
    await expect(result.locator('.clcr-result-reference-value')).toHaveText('≥90');
    await expect(result.locator('.clcr-result-reference-unit')).toHaveText('mL/min/1,73 m²');
    await expect(page.locator('#clcrDataCompletion')).toHaveText('✓ Dane kompletne · 5/5');
    await expect(page.locator('#clcrPairedMarkerNote')).toHaveText('Kreatynina i cystatyna C z tej samej próbki krwi.');
    await expect(page.locator('#clcrPairedMarkerNote')).toBeVisible();
    await expect(page.locator(`.clcr-result-assumptions[data-clcr-formula="${formulaId}"]`)).toHaveText(assumptions);
    await expect(page.locator(`.clcr-result-population-note[data-clcr-formula="${formulaId}"]`)).toHaveText(population);
    expect((await visibleFields(page)).map(field => field.id).sort()).toEqual(['CystatinC', 'Scr', 'ScrUnit', 'age', 'height', 'sex']);
    await expectUnknownFacts(page);
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();

    const optional = page.locator('#clcrForm details.clcr-context-details:visible');
    await expect(optional).toHaveCount(1);
    await expect(optional.locator(':scope > summary')).toHaveText('Dokładniejszy wiek (opcjonalnie)');
    await optional.locator(':scope > summary').evaluate(summary => summary.click());
    const fields = await visibleFields(page);
    expect(fields.filter(field => field.optional).map(field => field.id)).toEqual(['ageMonths']);
    for (const id of ['weight', 'ScrAssay', 'CystatinCStandardization', 'CystatinCAssayMethod', 'CrCysStandardizationConfirmed', 'creatinineState', 'suspectedAKI']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    if (width === 390) expect(fields.every(field => field.fontPx >= 16 && field.heightPx >= 48)).toBe(true);
    const geometry = await page.evaluate(() => {
      const legend = document.querySelector('#serumSet > legend');
      const note = document.getElementById('clcrPairedMarkerNote');
      const months = document.querySelector('[data-clcr-field-id="ageMonths"]').getBoundingClientRect();
      const optionalBody = document.querySelector('#ageMonths').closest('.clcr-context-details__body').getBoundingClientRect();
      const result = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="ckid_u25_cr_cys"]');
      const value = result.querySelector('.clcr-result-patient').getBoundingClientRect();
      const reference = result.querySelector('.clcr-result-reference').getBoundingClientRect();
      const save = document.getElementById('clcrVisitSaveCard');
      return {
        legendPosition: getComputedStyle(legend).position,
        noteGap: note.getBoundingClientRect().top - legend.getBoundingClientRect().bottom,
        monthsWidthRatio: months.width / optionalBody.width,
        overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        referenceBesideValue: reference.left >= value.right - 1 && Math.abs(reference.top - value.top) <= 2,
        savePadding: [getComputedStyle(save).paddingLeft, getComputedStyle(save).paddingRight],
      };
    });
    expect(geometry.legendPosition).toBe('static');
    expect(geometry.noteGap).toBeGreaterThanOrEqual(0);
    expect(geometry.monthsWidthRatio).toBeGreaterThan(0.9);
    expect(geometry.overflow).toBeLessThanOrEqual(1);
    expect(geometry.referenceBesideValue).toBe(true);
    expect(geometry.savePadding).toEqual(['20px', '20px']);
    await screenshot(page, testInfo, `u25-average-${width}-form.png`);

    const expanded = await openResultDetails(page);
    await expect(expanded.locator(':scope > summary')).toHaveText('Szczegóły — obliczenie i kategorie G');
    const components = await expectComponents(page, {
      creatinine: '82,90', cystatin: '79,26',
      creatinineRaw: 82.90160199882422, cystatinRaw: 79.26461484738338,
    });
    await expect(components).toContainText(/Zakres G1.*≥90/);
    for (const value of await components.locator('.clcr-result-component-value').all()) {
      await expect(value).toHaveCSS('color', 'rgb(154, 91, 0)');
      await expect(value).toHaveCSS('text-align', 'right');
    }
    expect(await components.evaluate(node => node.scrollWidth - node.clientWidth)).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
    await expect(expanded.locator('[data-clcr-category-row="G2"]')).toHaveAttribute('aria-current', 'true');
    await expect(expanded.locator('[data-clcr-average-sources] a')).toHaveCount(3);
    await expect(expanded).not.toContainText(/Ocena pediatryczna:|Profil równania:|Kategoria GFR wg KDIGO/);
    await screenshot(page, testInfo, `u25-average-${width}-details.png`, true);
    await expectUnknownFacts(page);
    expect(errors).toEqual([]);
  });
}

test('średnia U25 aktualizuje surowe składowe, jednostkę i granicę G bez uśredniania zaokrąglonych liczb', async ({ page }) => {
  await openCalculator(page);
  await fillAverage(page, { cystatin: '1.2' });
  await expectAverage(page, '74', 74.47772385248852);
  await openResultDetails(page);
  await expectComponents(page, {
    creatinine: '82,90', cystatin: '66,05', creatinineRaw: 82.90160199882422, cystatinRaw: 66.05384570615283,
  });
  await page.locator('#ScrUnit').selectOption('umol');
  await page.locator('#Scr').fill('53.04');
  await expectAverage(page, '74', 74.47772385248852);
  await expectComponents(page, {
    creatinine: '82,90', cystatin: '66,05', creatinineRaw: 82.90160199882422, cystatinRaw: 66.05384570615283,
  });

  // Niezależny wektor z audytu Decimal80, po obu stronach wyświetlenia 90.
  await fillAverage(page, { age: '18', height: '170', scr: '0.8708240534521158', cystatin: '0.6914355132617939' });
  const result = await expectAverage(page, '90', 89.8);
  await expect(result).toHaveAttribute('data-clcr-category', 'G2');
  await expect(result.locator('.clcr-result-boundary')).toContainText('<90');
  await openResultDetails(page);
  await expectComponents(page, {
    creatinine: '80,82', cystatin: '98,78', creatinineRaw: 80.82, cystatinRaw: 98.78,
  });
  await expect(details(page).locator('[data-clcr-component="creatinine"] .clcr-result-component-value')).toHaveCSS('color', 'rgb(154, 91, 0)');
  await expect(details(page).locator('[data-clcr-component="cystatinC"] .clcr-result-component-value')).toHaveCSS('color', 'rgb(20, 57, 61)');
  await expect(details(page).locator('[data-clcr-category-row="G2"][aria-current="true"]')).toHaveCount(1);
  await expectUnknownFacts(page);
});

test('średnia U25 przed 2. rokiem życia nie dopisuje G ani progu 90 także przy wartościach składowych', async ({ page }) => {
  await openCalculator(page);
  await fillAverage(page, { age: '1' });
  const optional = page.locator('#clcrForm details.clcr-context-details:visible');
  await optional.locator(':scope > summary').evaluate(summary => summary.click());
  await page.locator('#ageMonths').fill('6');
  const result = card(page);
  await expect(result).toBeVisible();
  await expect(result).toHaveAttribute('data-clcr-category', '');
  await expect(result.locator('.clcr-result-reference')).not.toContainText(/≥90|G1/);
  const expanded = await openResultDetails(page);
  await expect(expanded.locator('[data-clcr-average-components]')).toHaveCount(1);
  await expect(expanded.locator('[data-clcr-component]')).toHaveCount(2);
  await expect(expanded.locator('[data-clcr-average-components]')).not.toContainText(/≥90|Zakres G1/);
  await expect(expanded.locator('[data-clcr-category-row]')).toHaveCount(0);
  await expectUnknownFacts(page);
});

test('średnia U25 zachowuje importowaną masę i nie przenosi składowych między formułami; u 20-latka porównanie zostaje w Szczegółach', async ({ page }) => {
  await openCalculator(page);
  await restoreAverage(page, { weight: '35' });
  await expectAverage(page, '81', 81.0831084231038);
  await expect(page.locator('#weight')).toBeHidden();
  expect((await sourceInputs(page)).weight).toBe('35');
  await openResultDetails(page);
  await expectComponents(page, {
    creatinine: '82,90', cystatin: '79,26', creatinineRaw: 82.90160199882422, cystatinRaw: 79.26461484738338,
  });
  await expect(details(page)).not.toContainText(/Powierzchnia ciała|\bBSA\b/);

  // Wybór innego wzoru zgodnie z istniejącym resetApp(true) czyści markery,
  // zachowując podstawowe dane pacjenta. Wpisujemy aktualne oznaczenia ponownie.
  await selectFormula(page, 'ckid_u25_cys');
  await expect(page.locator('#clcrResultReport [data-clcr-average-components]')).toHaveCount(0);
  await expect(page.locator('#CystatinC')).toHaveValue('');
  await page.locator('#CystatinC').fill('1.0');
  await expect(card(page, 'ckid_u25_cys').locator('.clcr-result-value')).toHaveText('79');
  await expect(page.locator('#weight')).toBeHidden();
  await page.locator('#age').fill('20');
  await selectFormula(page, 'egfr_cr_cys');
  await expect(page.locator('#clcrResultReport [data-clcr-average-components]')).toHaveCount(0);
  await expect(page.locator('#Scr')).toHaveValue('');
  await expect(page.locator('#CystatinC')).toHaveValue('');
  await page.locator('#Scr').fill('0.6');
  await page.locator('#CystatinC').fill('1.0');
  await expect(card(page, 'egfr_cr_cys')).toBeVisible();
  await selectFormula(page);
  await expect(page.locator('#clcrResultReport [data-clcr-average-components]')).toHaveCount(0);
  await page.locator('#Scr').fill('0.6');
  await page.locator('#CystatinC').fill('1.0');
  const result = await expectAverage(page, '82', 82.44999999999999);
  await expect(result).toHaveAttribute('data-clcr-category', 'G2');
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  const expanded = await openResultDetails(page);
  await expect(expanded.locator('.clcr-result-card[data-clcr-series="egfr_cr_cys"]')).toHaveCount(1);
  await expectComponents(page, {
    creatinine: '96,60', cystatin: '68,30', creatinineRaw: 96.6, cystatinRaw: 68.3,
  });
  await expect(expanded).not.toContainText(/Powierzchnia ciała|\bBSA\b/);
  expect((await sourceInputs(page)).weight).toBe('35');
  await expectUnknownFacts(page);

  await selectFormula(page, 'cg_norm');
  await expect(page.locator('#weight')).toBeVisible();
  await expect(page.locator('#weight')).toHaveValue('35');
  await page.locator('#Scr').fill('0.6');
  await expect(card(page, 'cg_norm')).toBeVisible();
  await expect(await openResultDetails(page, 'cg_norm')).toContainText(/Powierzchnia ciała|\bBSA\b/);
  await selectFormula(page);
  await page.locator('#Scr').fill('0.6');
  await page.locator('#CystatinC').fill('1.0');
  await expectAverage(page, '82', 82.44999999999999);
  await expect(await openResultDetails(page)).not.toContainText(/Powierzchnia ciała|\bBSA\b/);
  expect((await sourceInputs(page)).weight).toBe('35');
});

test('średnia U25 respektuje zapisane AKI i niezgodny standard oraz zachowuje znane ograniczenia metod', async ({ page }) => {
  await openCalculator(page);
  for (const fields of [
    { suspectedAKI: true },
    { creatinineState: 'rapidlyChanging' },
    { CystatinCStandardization: 'non_ifcc' },
    { ScrAssay: 'non_idms' },
  ]) {
    await restoreAverage(page, fields);
    await expect(card(page)).toHaveCount(0);
    await expect(page.locator('#clcrResultReport [data-clcr-average-components]')).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('ckid_u25_cr_cys'))).toBe(false);
    expect(await sourceInputs(page)).toMatchObject(fields);
  }
  await restoreAverage(page, { ScrAssay: 'jaffe_idms', CystatinCAssayMethod: 'immunoturbidimetric' });
  await expectAverage(page, '81', 81.0831084231038);
  const expanded = await openResultDetails(page);
  await expect(expanded).toContainText(/Jaff|Jaffe/);
  await expect(expanded).toContainText(/immunoturbid|Immunoturbid/);
  expect(await sourceInputs(page)).toMatchObject({ ScrAssay: 'jaffe_idms', CystatinCAssayMethod: 'immunoturbidimetric' });
});

test('średnia U25 zapisuje tylko średnią, a treść PDF/DOCX/AI zawiera te same składowe i założenia', async ({ page }) => {
  await openCalculator(page);
  await fillAverage(page);
  await expectAverage(page, '81', 81.0831084231038);
  const before = await sourceInputs(page);
  const saved = await page.evaluate(async () => {
    const api = window.ClcrVisitSave;
    const points = api.collectActiveDatapoints(document, { formulaId: 'ckid_u25_cr_cys' });
    const previous = {
      id: 'synthetic-history-average', patientId: 'synthetic-average-only',
      category: 'wynik-klirens', clinicalDateISO: '2025-01-01', title: points[0].label,
      body: 'Historyczny wynik bez przeliczania. clcr:ckid_u25_cr_cys',
      labResult: { test: points[0].label, value: '123,4', valueNum: 123.4, unit: points[0].unit, norm: 'Historyczny zakres' },
    };
    const previousJson = JSON.stringify(previous);
    const notes = [previous];
    const original = window.VildaVault;
    // Adapter tylko w pamięci, bez tworzenia, otwierania lub odczytu sejfu.
    window.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async note => {
        const copy = JSON.parse(JSON.stringify({ ...note, id: 'synthetic-current-average' }));
        notes.push(copy);
        return copy;
      },
    };
    try {
      const outcome = await api.saveActiveResultToCard({
        patientId: 'synthetic-average-only', clinicalDateISO: '2026-10-22',
        root: document, formulaId: 'ckid_u25_cr_cys',
      });
      return { outcome, points, notes, historyUnchanged: JSON.stringify(previous) === previousJson };
    } finally {
      window.VildaVault = original;
    }
  });
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1, total: 1 });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0]).toMatchObject({ sourceFormulaId: formulaId, valueNum: 81, outOfRange: true, assumptions });
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes[1].labResult).toMatchObject({ valueNum: 81, unit: 'mL/min/1,73 m²', norm: '≥90 mL/min/1,73 m²' });
  expect(saved.notes[1].body).toContain(assumptions);
  expect(saved.historyUnchanged).toBe(true);
  expect(await sourceInputs(page)).toEqual(before);

  await page.evaluate(() => {
    window.__averageExports = { pdf: [], pdfNames: [], docx: [], ai: [] };
    // Przechwytujemy wejścia produkcyjnych ścieżek eksportu. Ten test sprawdza
    // ich treść i widoczność składowych, nie kodowanie plików bibliotek vendor.
    window.vildaEnsurePdfLibraries = async () => {};
    window.jspdf = { jsPDF: class {
      addImage() {}
      save(name) { window.__averageExports.pdfNames.push(name); }
    } };
    window.html2canvas = async element => {
      const components = [...element.querySelectorAll('[data-clcr-average-components]')];
      window.__averageExports.pdf.push({
        text: element.textContent,
        componentsVisible: components.length === 1 && components.every(node => node.getClientRects().length > 0 && !node.closest('details:not([open])')),
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
        window.__averageExports.docx.push(document.sections.flatMap(section => section.children).map(paragraph => paragraph.children.map(run => run.text).join('')).join('\n'));
        return new Blob(['synthetic-export-content-sink'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      } },
    };
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true, value: { writeText: async text => window.__averageExports.ai.push(text) },
    });
  });
  await kliknij(page.locator('#downloadPDF'));
  await expect.poll(() => page.evaluate(() => window.__averageExports.pdfNames.length)).toBe(1);
  await expect(details(page)).not.toHaveAttribute('open', '');
  const docxDownload = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  expect((await docxDownload).suggestedFilename()).toMatch(/\.docx$/);
  await expect.poll(() => page.evaluate(() => window.__averageExports.docx.length)).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__averageExports.ai.length)).toBe(1);
  const exports = await page.evaluate(() => window.__averageExports);
  expect(exports.pdf[0].componentsVisible).toBe(true);
  for (const text of [exports.pdf[0].text, exports.docx[0], exports.ai[0]]) {
    expect(text).toContain(assumptions);
    expect(text).toContain('81');
    expect(text).toContain('82,90');
    expect(text).toContain('79,26');
    expect(text).toMatch(/Z kreatyniny\s+82,90/);
    expect(text).toMatch(/Z cystatyny C\s+79,26/);
    expect(text).toContain('Średnią obliczamy przed zaokrągleniem wartości.');
    expect(text).not.toMatch(/podejrzenie AKI:\s*nie/i);
  }
  expect(await sourceInputs(page)).toEqual(before);
  await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
});
