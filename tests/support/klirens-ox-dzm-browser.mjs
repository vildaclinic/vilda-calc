import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Production calculator and result collector, with fictional inputs only.
export const FORMULA = 'Ox_mgkg';
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="Ox_total24"]');
export const details = page => page.locator('#clcr-ox-dzm-details');
export const base = Object.freeze({
  currentVersion: 'pro', formulaPicker: FORMULA,
  age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140',
  OXDZM_inputMode: 'concentration', OXDZM_concentration: '200', OXDZM_concentrationUnit: 'µmol/L',
  OXDZM_volume: '1500', OXDZM_volumeUnit: 'mL', OXDZM_collectionHours: '24',
  OXDZM_collectionSource: 'assumed-24h', OXDZM_durationNeedsConfirmation: 'false',
  OXDZM_reportedValue: '', OXDZM_reportedUnit: 'mmol/24h',
  OXDZM_reportingEntity: 'unknown', OXDZM_unitConversions: '',
  U_Ox: '', oxalateReportingEntity: '', V24: '',
  Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h', Cl24CollectionProblem: false,
  collectionStartAt: '', collectionEndAt: '',
  collectionStartVoidDiscarded: false, collectionFinalVoidIncluded: false,
  collectionNoMissedVoids: false, collectionNoSpillage: false,
  collectionNoExtraVoids: false, collectionStorageFollowed: false,
  ui_collectionStartVoidDiscarded_answer: '', ui_collectionFinalVoidIncluded_answer: '',
  ui_collectionNoMissedVoids_answer: '', ui_collectionNoSpillage_answer: '',
  ui_collectionNoExtraVoids_answer: '', ui_collectionStorageFollowed_answer: '',
});

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrOxDzm?.evaluate && window.ClcrOxDzmUi && window.ClcrOxDzmPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formulaId = FORMULA) {
  expect(await page.evaluate(snapshot => window.applyClcrSessionSnapshot(snapshot, {
    source: 'e2e-ox-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: FORMULA, inputs: { ...base, ...fields } });
  await expect(page.locator('#oxDzmInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export const collect = page => page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Ox_mgkg' }));

export async function expectResult(page, { raw = 0.3, unit = 'mmol/24 h', reference = true, outOfRange = true, guest = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect.poll(() => card(page).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-ox-dzm-snapshot'));
    return { valid: model.valid, raw: model.rawValue, unit: model.unit, reference: model.referenceAvailable, outOfRange: model.outOfRange,
      consistent: node.querySelector('.clcr-result-value').textContent.trim() === model.presentation.valueText &&
        node.dataset.clcrDisplayValue === model.presentation.valueText && Number(node.dataset.clcrValue) === model.rawValue && node.dataset.clcrDisplayUnit === model.unit,
      ready: window.canComputeFormula('Ox_mgkg') && window.ClcrUiWorkflow.getFormulaReadiness('Ox_mgkg').valueReady };
  })).toMatchObject({ valid: true, raw, unit, reference, outOfRange, consistent: true, ready: true });
  const result = await card(page).evaluate(node => JSON.parse(node.getAttribute('data-clcr-ox-dzm-snapshot')));
  expect(result).toMatchObject({ schema: 'clcr-ox-dzm', version: 1 });
  const points = await collect(page);
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ id: 'Ox_total24', sourceFormulaId: 'Ox_mgkg', rawValue: raw, valueNum: raw, unit, outOfRange, oxDzmSnapshot: result });
  if (guest) {
    await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
    expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  }
  return result;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('Ox_mgkg'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Ox_mgkg').valueReady)).toBe(false);
  expect(await collect(page)).toEqual([]);
}

export async function chooseNativeUnit(page, selector, value) {
  await page.locator(selector).focus();
  const options = await page.locator(selector).evaluate(node => [...node.options].map(option => option.value));
  const index = options.indexOf(value);
  expect(index).toBeGreaterThanOrEqual(0);
  await page.locator(selector).press('Home');
  for (let i = 0; i < index; i += 1) await page.locator(selector).press('ArrowDown');
  await expect(page.locator(selector)).toHaveValue(value);
}
