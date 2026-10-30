import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Only fictional measurements. The real encrypted vault remains locked.
export const card = scope => scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="Prot_mg24"]');
export const details = scope => scope.locator('#clcr-protein-dzm-details');
export const base = {
  currentVersion: 'pro', formulaPicker: 'Prot_mgkg',
  age: '10', ageMonths: '', ageDays: '', sex: 'F', weight: '30', height: '140',
  Prot_inputMode: 'concentration', Prot_concentration: '200', Prot_concentrationUnit: 'mg/L',
  Prot_volume: '1500', Prot_volumeUnit: 'mL', Prot_collectionHours: '24',
  Prot_reportedValue: '', Prot_reportedUnit: 'mg/24h', Prot_outputUnit: 'mg/24h',
  Prot_unitConversions: '', Prot_collectionSource: 'assumed-24h',
  Prot_durationNeedsConfirmation: false,
  U_Prot: '', V24: '', Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h',
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
  await page.waitForFunction(() => Boolean(window.VildaClcrProteinDzm && window.ClcrProteinDzmReferenceData && window.ClcrProteinDzmUi && window.ClcrProteinDzmPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(scope, session, formulaId = 'Prot_mgkg') {
  expect(await scope.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-protein-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(scope, fields = {}) {
  await applySession(scope, { version: 2, currentVersion: 'pro', selectedFormula: 'Prot_mgkg', inputs: { ...base, ...fields } });
  await expect(scope.locator('#proteinDzmInputCard')).toBeVisible();
}

export async function choose(scope, formulaId = 'Prot_mgkg') {
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

export async function expectResult(scope, { raw = 300, status = 'high', tone = 'warning', unit = 'mg/24 h', guest = true, reference = true } = {}) {
  await expect(card(scope)).toBeVisible();
  await expect.poll(() => card(scope).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-protein-dzm-snapshot'));
    const shown = model.presentation;
    return { status: model.status, tone: model.tone, unit: shown.unitText, reference: model.referenceActive,
      single: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length === 1 && node.querySelectorAll('.clcr-result-value').length === 1,
      consistent: Number(node.dataset.clcrValue) === shown.rawValue && node.querySelector('.clcr-result-value').textContent.trim() === shown.valueText && node.dataset.clcrDisplayValue === shown.valueText && node.dataset.clcrDisplayUnit === shown.unitText && node.dataset.clcrTone === model.tone &&
        (!model.referenceActive || node.querySelector('.protein-dzm-reference-value').textContent.trim() === shown.referenceValue && node.querySelector('.protein-dzm-reference-unit').textContent.trim() === shown.unitText),
      ready: window.canComputeFormula('Prot_mgkg') && window.ClcrUiWorkflow.getFormulaReadiness('Prot_mgkg').valueReady,
      locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn').disabled };
  })).toMatchObject({ status, tone, unit, reference, single: true, consistent: true, ready: true, locked: guest, saveDisabled: guest });
  const model = await card(scope).evaluate(node => JSON.parse(node.getAttribute('data-clcr-protein-dzm-snapshot')));
  expect(model).toMatchObject({ schema: 'clcr-protein-dzm', version: 1, valid: true });
  expect(model.rawValue).toBeCloseTo(raw, 10);
  return model;
}

export async function expectBlocked(scope) {
  await expect(card(scope)).toHaveCount(0);
  expect(await scope.evaluate(() => window.canComputeFormula('Prot_mgkg'))).toBe(false);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('Prot_mgkg').valueReady)).toBe(false);
  expect(await scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'Prot_mgkg' }))).toEqual([]);
  await expect(scope.locator('#clcrVisitSaveCard')).toBeHidden();
}

export const displayedNumber = text => Number(String(text).replace(/\s/g, '').replace(',', '.'));
