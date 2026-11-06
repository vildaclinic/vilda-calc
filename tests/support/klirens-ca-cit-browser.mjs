import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// All data are fictional. Exercise production input, result and save collectors.
export const FORMULA = 'Ca_Cit';
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-formula="Ca_Cit"]');
export const details = page => page.locator('#clcr-ca-cit-details');
export const base = Object.freeze({
  currentVersion: 'pro', formulaPicker: FORMULA,
  age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140',
  CACIT_inputMode: 'concentration', CACIT_calcium: '2', CACIT_calciumUnit: 'mmol/L',
  CACIT_citrate: '40', CACIT_citrateUnit: 'mg/dL',
  CACIT_reportedValue: '', CACIT_reportedUnit: 'mg/mg',
  CACIT_sameSpecimen: 'assumed', CACIT_collectionProblem: '', CACIT_collectionHours: '',
  CACIT_durationKnown: '', CACIT_sampleType: 'timed', CACIT_sampleSource: 'assumed-current', CACIT_durationSource: '',
  U_Ca: '', U_Cit: '', V24: '', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
  Cl24CollectionProblem: false, collectionStartAt: '', collectionEndAt: '',
});

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrCaCit?.evaluate && window.ClcrCaCitUi && window.ClcrCaCitPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formulaId = FORMULA) {
  expect(await page.evaluate(snapshot => window.applyClcrSessionSnapshot(snapshot, {
    source: 'e2e-ca-cit-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: FORMULA, inputs: { ...base, ...fields } });
  await expect(page.locator('#caCitInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export const collect = page => page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Ca_Cit' }));

export async function expectResult(page, { raw = 0.20039, unit = 'mg/mg', reference = true, outOfRange = false, guest = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect.poll(() => card(page).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-ca-cit-snapshot'));
    const localized = model.display.text.replace(/\./g, ',').replace(/^≈\s*/, '≈ ');
    return { valid: model.valid, raw: model.rawValue, unit: model.unit, reference: model.referenceAvailable,
      outOfRange: model.category === 'above' ? true : model.category === 'within' ? false : null,
      consistent: node.querySelector('.clcr-result-value').textContent.trim() === localized &&
        node.dataset.clcrDisplayValue === localized && Number(node.dataset.clcrValue) === model.rawValue && node.dataset.clcrDisplayUnit === model.unit,
      ready: window.canComputeFormula('Ca_Cit') && window.ClcrUiWorkflow.getFormulaReadiness('Ca_Cit').valueReady };
  })).toMatchObject({ valid: true, raw, unit, reference, outOfRange, consistent: true, ready: true });
  const result = await card(page).evaluate(node => JSON.parse(node.getAttribute('data-clcr-ca-cit-snapshot')));
  expect(result).toMatchObject({ schema: 'clcr-ca-cit', version: 1 });
  const points = await collect(page);
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ id: unit === 'mg/mg' ? 'Ca_Cit' : 'Ca_Cit_mol', sourceFormulaId: 'Ca_Cit', rawValue: raw, valueNum: raw, unit, outOfRange });
  expect(points[0].caCitSnapshot).toEqual(result);

  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return result;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('Ca_Cit'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Ca_Cit').valueReady)).toBe(false);
  expect(await collect(page)).toEqual([]);
}
