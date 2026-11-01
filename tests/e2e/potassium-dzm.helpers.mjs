import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from '../support/klirens-patient-record.mjs';

// Only fictional measurements. The real encrypted vault remains locked.
export const card = scope => scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="K_mmol_d"]');
export const details = scope => scope.locator('#clcr-potassium-dzm-details');
export const base = {
  currentVersion: 'pro', formulaPicker: 'K_mmol_d',
  age: '40', ageMonths: '', ageDays: '', sex: 'M', weight: '', height: '',
  K_inputMode: 'concentration', K_concentration: '100',
  K_volume: '1500', K_volumeUnit: 'mL', K_collectionHours: '24',
  K_reportedValue: '', K_reportedUnit: 'mmol/24h', K_outputUnit: 'mmol/24h',
  K_unitConversions: '', K_collectionSource: 'assumed-24h',
  K_durationNeedsConfirmation: false,
  U_K: '', V24: '', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
  Cl24CollectionProblem: false, collectionStartAt: '', collectionEndAt: '',
  collectionStartVoidDiscarded: false, collectionFinalVoidIncluded: false,
  collectionNoMissedVoids: false, collectionNoSpillage: false,
  collectionNoExtraVoids: false, collectionStorageFollowed: false,
  ui_collectionStartVoidDiscarded_answer: '', ui_collectionFinalVoidIncluded_answer: '',
  ui_collectionNoMissedVoids_answer: '', ui_collectionNoSpillage_answer: '',
  ui_collectionNoExtraVoids_answer: '', ui_collectionStorageFollowed_answer: '',
};

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrPotassiumDzm && window.ClcrPotassiumDzmReferenceData && window.ClcrPotassiumDzmUi && window.ClcrPotassiumDzmPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(scope, session, formulaId = 'K_mmol_d') {
  expect(await scope.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-potassium-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(scope, fields = {}) {
  await applySession(scope, { version: 2, currentVersion: 'pro', selectedFormula: 'K_mmol_d', inputs: { ...base, ...fields } });
  await expect(scope.locator('#potassiumDzmInputCard')).toBeVisible();
}

export async function choose(scope, formulaId = 'K_mmol_d') {
  expect(await scope.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

// Input-unit conversion intentionally requires a real user action. A synthetic
// selectOption event is used by session restoration and must not rescale values.
export async function chooseNativeUnit(scope, selector, value) {
  const control = scope.locator(selector);
  const index = await control.evaluate((node, expected) => [...node.options].findIndex(option => option.value === expected), value);
  expect(index).toBeGreaterThanOrEqual(0);
  await control.focus(); await control.press('Home');
  for (let step = 0; step < index; step += 1) await control.press('ArrowDown');
  await expect(control).toHaveValue(value);
}

export async function expectResult(scope, { raw = 150, status = 'high', tone = 'warning', unit = 'mmol/24 h', guest = true, reference = true, available = reference } = {}) {
  await expect(card(scope)).toBeVisible();
  await expect.poll(() => card(scope).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-potassium-dzm-snapshot'));
    const shown = model.presentation;
    return { status: model.status, tone: model.tone, unit: shown.unitText, reference: model.referenceActive, available: model.referenceAvailable,
      single: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length === 1 && node.querySelectorAll('.clcr-result-value').length === 1 && document.querySelectorAll('[data-potassium-dzm-output-unit]').length === 0,
      consistent: Number(node.dataset.clcrValue) === shown.rawValue && node.querySelector('.clcr-result-value').textContent.trim() === shown.valueText && node.dataset.clcrDisplayValue === shown.valueText && node.dataset.clcrDisplayUnit === shown.unitText && node.dataset.clcrTone === model.tone &&
        (!model.referenceAvailable || node.querySelector('.potassium-dzm-reference-value').textContent.trim() === shown.referenceValue && node.querySelector('.potassium-dzm-reference-unit').textContent.trim() === shown.unitText),
      ready: window.canComputeFormula('K_mmol_d') && window.ClcrUiWorkflow.getFormulaReadiness('K_mmol_d').valueReady,
      locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn').disabled };
  })).toMatchObject({ status, tone, unit, reference, available, single: true, consistent: true, ready: true, locked: guest, saveDisabled: guest });
  const model = await card(scope).evaluate(node => JSON.parse(node.getAttribute('data-clcr-potassium-dzm-snapshot')));
  expect(model).toMatchObject({ schema: 'clcr-potassium-dzm', version: 1, valid: true });
  expect(model.rawValue).toBeCloseTo(raw, 10);
  return model;
}

export async function expectBlocked(scope) {
  await expect(card(scope)).toHaveCount(0);
  expect(await scope.evaluate(() => window.canComputeFormula('K_mmol_d'))).toBe(false);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('K_mmol_d').valueReady)).toBe(false);
  expect(await scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'K_mmol_d' }))).toEqual([]);
  await expect(scope.locator('#clcrVisitSaveCard')).toBeHidden();
}

export const displayedNumber = text => Number(String(text).replace(/\s|≈/g, '').replace(',', '.'));
