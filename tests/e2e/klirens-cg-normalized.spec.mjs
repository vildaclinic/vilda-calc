import { expect, test } from '@playwright/test';
import { kliknij } from '../support/uklad-czekanie.mjs';

// Guest mode, synthetic fixtures, actual served production calculator.
// Expected numbers come from the independently audited CG/Du Bois cases.
const formulaId = 'cg_norm';
const expectedRaw = 65.51340637632256;
const assumptions = 'Założenia: stabilna czynność nerek oraz brak podejrzenia AKI.';
const referenceNote = 'Dla tego oszacowania nie stosujemy uniwersalnej normy ani kategorii G.';

async function selectFormula(page, id = formulaId) {
  await page.evaluate(value => window.ClcrUiWorkflow.selectFormula(value), id);
  await page.waitForFunction(value => (
    window.ClcrUiWorkflow.state.activeFormulaId === value &&
    document.getElementById('formulaPicker').value === value &&
    window.clcrIsResetting !== true
  ), id);
}

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
  await selectFormula(page);
}

async function fillPatient(page, { sex = 'M', weight = '80', height = '175', scr = '1.2' } = {}) {
  await page.locator('#age').fill('60');
  await page.locator('#sex').selectOption(sex);
  await page.locator('#weight').fill(weight);
  await page.locator('#height').fill(height);
  await page.locator('#ScrUnit').selectOption('mg/dl');
  await page.locator('#Scr').fill(scr);
  await page.locator('#Scr').blur();
}

function card(page, id = formulaId) {
  return page.locator(`#clcrResultReport .clcr-result-card[data-clcr-series="${id}"]`);
}

function details(page) {
  return page.locator(`#clcrResultReport .clcr-result-details[data-clcr-formula="${formulaId}"]`);
}

async function expectResult(page, raw = expectedRaw, display = '66') {
  const result = card(page);
  await expect(result).toBeVisible();
  await expect(result.locator('.clcr-result-value')).toHaveText(display);
  await expect.poll(async () => Number(await result.getAttribute('data-clcr-value'))).toBeCloseTo(raw, 10);
  return result;
}

async function sourceInputs(page) {
  return page.evaluate(() => window.buildClcrSessionSnapshot().inputs);
}

async function restorePatient(page, values = {}, id = formulaId) {
  expect(await page.evaluate(({ fields, active }) => window.applyClcrSessionSnapshot({
    version: 2, currentVersion: 'basic', selectedFormula: active,
    inputs: {
      currentVersion: 'basic', formulaPicker: active,
      age: '60', ageMonths: '6', sex: 'M', weight: '80', height: '175',
      Scr: '1.2', ScrUnit: 'mg/dl', creatinineState: 'unknown', suspectedAKI: false,
      ...fields,
    },
  }, {
    source: 'e2e-cg-normalized-synthetic', update: true,
    dispatchEvents: false, preserveAcrossVersions: true,
  }), { fields: values, active: id })).toBe(true);
  await page.waitForFunction(active => (
    window.ClcrUiWorkflow.state.activeFormulaId === active &&
    document.getElementById('formulaPicker').value === active &&
    window.clcrIsResetting !== true
  ), id);
}

for (const width of [1440, 390, 320]) {
  test(`CG na 1,73 m² ${width}px: minimalny formularz, jeden neutralny wynik i czytelne ograniczenia`, async ({ page }, testInfo) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await openCalculator(page, width);
    await fillPatient(page);
    const result = await expectResult(page);
    await expect(page.locator('.clcr-active-panel__title')).toHaveText('Cockcroft–Gault (1,73 m²)');
    await expect(page.locator('.clcr-active-panel__note')).toHaveText('Dorośli · rzeczywista masa ciała');
    await expect(page.locator('#clcr-label-age')).toHaveText('Wiek (ukończone lata)');
    await expect(page.locator('#clcrDataCompletion')).toHaveText('✓ Dane kompletne · 5/5');
    await expect(page.locator('#clcrReadiness')).toBeHidden();
    await expect(page.locator('#ageMonths')).toBeHidden();
    await expect(page.locator('#patientSet .clcr-context-details')).toHaveCount(0);
    for (const id of ['ScrAssay', 'creatinineState', 'suspectedAKI', 'fullName']) {
      await expect(page.locator(`#${id}`)).toBeHidden();
    }
    await expect(result).toHaveAttribute('data-clcr-tone', 'neutral');
    await expect(result).toHaveAttribute('data-clcr-category', '');
    await expect(result).toHaveAttribute('data-clcr-reference-comparison', 'false');
    await expect(result).toHaveAttribute('data-clcr-age-used-years', '60');
    await expect(result).toHaveAttribute('data-clcr-age-policy', 'completed-years');
    await expect(result.locator('.clcr-result-value')).toHaveCSS('color', 'rgb(68, 90, 100)');
    await expect(result.locator('.clcr-result-unit')).toHaveText('mL/min/1,73 m²');
    await expect(result.locator('[data-clcr-reference-note="cg_norm"]')).toHaveText(referenceNote);
    await expect(result.locator('.clcr-result-reference, [data-clcr-category-control]')).toHaveCount(0);
    await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
    await expect(page.locator('#clcrResultReport .clcr-result-assumptions')).toHaveText(assumptions);
    await expect(page.locator('#clcr-cg-indexed-height-note')).toHaveText('Do przeliczenia wyniku na 1,73 m².');
    await expect(page.locator('#height')).toHaveAttribute('aria-describedby', /\bclcr-cg-indexed-height-note\b/);
    const measurements = await page.evaluate(() => {
      const visible = element => {
        if (!element.getClientRects().length || element.closest('details:not([open])')) return false;
        for (let node = element; node; node = node.parentElement) {
          const style = getComputedStyle(node);
          if (node.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      };
      const fields = [...document.querySelectorAll('#clcrForm input, #clcrForm select')]
        .filter(element => visible(element) && !element.matches('.clcr-canonical-picker,[type=hidden],[type=button],[type=submit],[type=reset],[type=file]'))
        .map(element => ({ id: element.id, font: parseFloat(getComputedStyle(element).fontSize), height: element.getBoundingClientRect().height }));
      const report = document.getElementById('clcrResultRail').getBoundingClientRect();
      const clear = document.getElementById('clearBtn').getBoundingClientRect();
      return { fields, gap: report.top - clear.bottom, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    expect(measurements.fields.map(field => field.id).sort()).toEqual(['Scr', 'ScrUnit', 'age', 'height', 'sex', 'weight'].sort());
    expect(measurements.overflow).toBeLessThanOrEqual(1);
    if (width < 600) {
      expect(measurements.fields.every(field => field.font >= 16 && field.height >= 48)).toBe(true);
      expect(measurements.gap).toBeGreaterThanOrEqual(20);
    }
    await details(page).locator(':scope > summary').evaluate(summary => summary.click());
    await expect(details(page)).toHaveAttribute('open', '');
    await expect(details(page)).toContainText('60 ukończonych lat');
    await expect(details(page)).toContainText('1,96 m²');
    await expect(details(page)).toContainText(/rzeczywist.*mas/);
    await expect(details(page)).toContainText(/otyło|Otyło/);
    await expect(details(page)).toContainText('obrzęki');
    await expect(details(page)).toContainText(/standaryzacj/);
    await expect(details(page)).not.toContainText(/ChPL|dawkowan|jawna polityka masy/);
    await expect(details(page).locator('[data-clcr-series], .clcr-result-value')).toHaveCount(0);
    await expect(details(page).locator('a[href="https://doi.org/10.1001/archinte.1916.00080130010002"]')).toHaveCount(1);
    const image = testInfo.outputPath(`cg-normalized-${width}.png`);
    await page.locator('#clcrWorkspace').screenshot({ path: image, animations: 'disabled', style: '#mobileBottomDock,#scrollTopBtn{visibility:hidden!important}' });
    await testInfo.attach(`cg-normalized-${width}`, { path: image, contentType: 'image/png' });
    expect(errors).toEqual([]);
  });
}

for (const [sex, raw, display] of [['M', expectedRaw, '66'], ['F', 55.68639541987418, '56']]) {
  test(`CG na 1,73 m² ${sex}: jednostki kreatyniny i końcowe zaokrąglenie bez podwójnego indeksowania`, async ({ page }) => {
    await openCalculator(page);
    await fillPatient(page, { sex });
    await expectResult(page, raw, display);
    await page.locator('#ScrUnit').selectOption('umol');
    await page.locator('#Scr').fill('106.08');
    await page.locator('#Scr').blur();
    await expectResult(page, raw, display);
    await page.locator('#ScrUnit').selectOption('mg/dl');
    await page.locator('#Scr').fill('1.2');
    await page.locator('#weight').fill('100');
    await page.locator('#weight').blur();
    await expectResult(page, sex === 'M' ? 74.48236166682872 : 63.31000741680441, sex === 'M' ? '74' : '63');
    await page.locator('#height').fill('');
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('cg_norm'))).toBe(false);
  });
}

test('CG na 1,73 m² używa ukończonych lat, ale zachowuje miesiące dla zwykłego CG i odtworzenia sesji', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page);
  await expectResult(page);
  await expect(page.locator('#ageMonths')).toHaveValue('6');
  await expect(page.locator('#ageMonths')).toBeHidden();
  expect(await sourceInputs(page)).toMatchObject({ age: '60', ageMonths: '6' });
  await restorePatient(page, { ageMonths: '12' });
  await expectResult(page);
  expect(await sourceInputs(page)).toMatchObject({ age: '60', ageMonths: '12' });
  expect(await page.evaluate(() => window.readClcrFormulaAge('cg').valid)).toBe(false);
  expect(await sourceInputs(page)).toMatchObject({ age: '60', ageMonths: '12' });
  // Preserve a valid nonzero age across actual switches. The separate legacy
  // input handler normalizes invalid12 to11 when another formula activates;
  // that shared behavior is outside the indexed CG age policy.
  await restorePatient(page);
  await selectFormula(page, 'cg');
  await expect(page.locator('#clcr-label-age')).toHaveText('Wiek (lata)');
  await expect(page.locator('#clcr-cg-indexed-height-note')).toBeHidden();
  await page.locator('#Scr').fill('1.2');
  await expect(card(page, 'cg').locator('.clcr-result-value')).toHaveText('74');
  expect(Number(await card(page, 'cg').getAttribute('data-clcr-value'))).toBeCloseTo(73.61111111111111, 10);
  expect(await sourceInputs(page)).toMatchObject({ age: '60', ageMonths: '6' });
  await selectFormula(page);
  await page.locator('#Scr').fill('1.2');
  await expectResult(page);
  await expect(page.locator('#clcr-cg-indexed-height-note')).toBeVisible();
  expect(await sourceInputs(page)).toMatchObject({ age: '60', ageMonths: '6' });
  await kliknij(page.locator('#clearBtn'));
  await expect(card(page)).toHaveCount(0);
  await expect(page.locator('#ageMonths')).toHaveValue('');
});

test('CG na 1,73 m² zachowuje granicę 18 lat i blokady znanych sprzeczności bez nowych pytań', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page, { age: '17', ageMonths: '11' });
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('cg_norm'))).toBe(false);
  await restorePatient(page, { age: '18', ageMonths: '0' });
  await expectResult(page, 99.90794472389192, '100');
  for (const context of [{ suspectedAKI: true }, { creatinineState: 'rapidlyChanging' }]) {
    await restorePatient(page, { age: '60', ageMonths: '6', ...context });
    await expect(card(page)).toHaveCount(0);
    expect(await page.evaluate(() => window.canComputeFormula('cg_norm'))).toBe(false);
    await expect(page.locator('#suspectedAKI')).toBeHidden();
    await expect(page.locator('#creatinineState')).toBeHidden();
  }
  await restorePatient(page);
  await expectResult(page);
  await expect(page.locator('#creatinineState')).toHaveValue('unknown');
  await expect(page.locator('#suspectedAKI')).not.toBeChecked();
});

test('CG na 1,73 m² zapisuje jeden wynik, zachowuje historię i wiek źródłowy w eksporcie PDF/DOCX/AI', async ({ page }) => {
  await openCalculator(page);
  await restorePatient(page);
  await expectResult(page);
  const before = await sourceInputs(page);
  const saved = await page.evaluate(async () => {
    const api = window.ClcrVisitSave;
    const points = api.collectActiveDatapoints(document, { formulaId: 'cg_norm' });
    const history = { id: 'synthetic-historical-cg-norm', body: 'Historyczny wynik bez przeliczania.', labResult: { valueNum: 65, unit: 'mL/min/1,73 m²' } };
    const historyBefore = JSON.stringify(history);
    const notes = [history];
    const originalVault = window.VildaVault;
    // Memory-only sink, never opening or reading a real vault.
    window.VildaVault = {
      isUnlocked: () => true,
      savePatientNote: async note => {
        const copy = JSON.parse(JSON.stringify({ ...note, id: 'synthetic-current-cg-norm' }));
        notes.push(copy);
        return copy;
      },
    };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'synthetic-cg-norm-only', clinicalDateISO: '2026-10-23', root: document, formulaId: 'cg_norm' });
      return { points, outcome, notes, historyUnchanged: JSON.stringify(history) === historyBefore };
    } finally {
      window.VildaVault = originalVault;
    }
  });
  expect(saved.outcome).toMatchObject({ ok: true, saved: 1, total: 1 });
  expect(saved.points).toHaveLength(1);
  expect(saved.points[0]).toMatchObject({ sourceFormulaId: formulaId, valueNum: 66, unit: 'mL/min/1,73 m²', assumptions, ageUsedYears: 60, agePolicy: 'completed-years' });
  expect(saved.notes).toHaveLength(2);
  expect(saved.notes[1].labResult).toMatchObject({ valueNum: 66, unit: 'mL/min/1,73 m²' });
  expect(saved.notes[1].body).toContain(assumptions);
  expect(saved.notes[1].body).toContain('Wiek użyty we wzorze: 60 ukończonych lat.');
  expect(saved.historyUnchanged).toBe(true);
  expect(await sourceInputs(page)).toEqual(before);

  await page.evaluate(() => {
    window.__cgNormalizedExports = { pdf: [], pdfNames: [], docx: [], ai: [] };
    window.vildaEnsurePdfLibraries = async () => {};
    window.jspdf = { jsPDF: class {
      addImage() {}
      save(name) { window.__cgNormalizedExports.pdfNames.push(name); }
    } };
    window.html2canvas = async element => {
      const limitations = [...element.querySelectorAll('p')].find(node => node.querySelector(':scope > strong')?.textContent === 'Ograniczenia:');
      const visible = node => {
        if (!node?.getClientRects().length || node.closest('details:not([open])')) return false;
        for (let ancestor = node; ancestor; ancestor = ancestor.parentElement) {
          const style = getComputedStyle(ancestor);
          if (ancestor.hidden || style.display === 'none' || style.visibility === 'hidden') return false;
        }
        return true;
      };
      window.__cgNormalizedExports.pdf.push({ text: element.textContent, limitationsVisible: visible(limitations), mainValueCount: element.querySelectorAll('.clcr-result-value').length });
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
        window.__cgNormalizedExports.docx.push(document.sections.flatMap(section => section.children).map(paragraph => paragraph.children.map(run => run.text).join('')).join('\n'));
        return new Blob(['synthetic-cg-norm-content'], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
      } },
    };
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async text => window.__cgNormalizedExports.ai.push(text) } });
  });
  await kliknij(page.locator('#downloadPDF'));
  await expect.poll(() => page.evaluate(() => window.__cgNormalizedExports.pdfNames.length)).toBe(1);
  await expect(details(page)).not.toHaveAttribute('open', '');
  const download = page.waitForEvent('download');
  await kliknij(page.locator('#downloadDOCX'));
  expect((await download).suggestedFilename()).toMatch(/\.docx$/);
  await expect.poll(() => page.evaluate(() => window.__cgNormalizedExports.docx.length)).toBe(1);
  page.once('dialog', dialog => dialog.accept());
  await kliknij(page.locator('#askAI'));
  await expect.poll(() => page.evaluate(() => window.__cgNormalizedExports.ai.length)).toBe(1);
  const exports = await page.evaluate(() => window.__cgNormalizedExports);
  expect(exports.pdf[0]).toMatchObject({ limitationsVisible: true, mainValueCount: 1 });
  for (const text of [exports.pdf[0].text, exports.docx[0], exports.ai[0]]) {
    expect(text).toContain('66');
    expect(text).toContain('mL/min/1,73 m²');
    expect(text).toContain('60 ukończonych lat');
    expect(text).toContain(assumptions);
    expect(text).toContain(referenceNote);
    expect(text).not.toMatch(/ChPL|jawna polityka masy/);
  }
  expect(await sourceInputs(page)).toEqual(before);
});
