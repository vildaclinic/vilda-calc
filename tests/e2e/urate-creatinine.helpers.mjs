import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from '../support/klirens-patient-record.mjs';

// Fictional measurements only. The original encrypted vault stays locked.
export const REMOVED_RESULT_SENTENCE = 'Sam wynik nie rozpoznaje kamicy ani nie zastępuje oceny dobowego wydalania.';
export const card = scope => scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="KM_Cr"]');
export const details = scope => scope.locator('#clcr-urate-creatinine-details');
export const DEFAULT_RESULT = 0.6728927487954316;
export const base = {
  currentVersion: 'spot', formulaPicker: 'KM_Cr',
  age: '40', ageMonths: '', ageDays: '', sex: '', weight: '', height: '',
  URCR_inputMode: 'concentration', URCR_uricAcid: '100', URCR_uricAcidUnit: 'mg/dL',
  URCR_creatinine: '100', URCR_creatinineUnit: 'mg/dL',
  URCR_reportedValue: '', URCR_reportedUnit: 'mmol/mmol',
  URCR_specimen: 'random', URCR_outputUnit: 'mmol/mmol',
  U_UA: '', Ucr: '', V24: '', collectionStartAt: '', collectionEndAt: '',
};

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrUrateCreatinine && window.ClcrUrateCreatinineReferenceData && window.ClcrUrateCreatinineUi && window.ClcrUrateCreatininePersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(scope, session, formulaId = 'KM_Cr') {
  expect(await scope.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-urate-creatinine-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(scope, fields = {}) {
  await applySession(scope, { version: 2, currentVersion: 'spot', selectedFormula: 'KM_Cr', inputs: { ...base, ...fields } });
  await expect(scope.locator('#urateCreatinineInputCard')).toBeVisible();
}

export async function choose(scope) {
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.selectFormula('KM_Cr'))).toBe(true);
  await scope.waitForFunction(() => window.ClcrUiWorkflow.state.activeFormulaId === 'KM_Cr' && window.clcrIsResetting !== true);
}

export async function expectResult(scope, {
  raw = DEFAULT_RESULT, status = 'high', tone = 'warning', guest = true,
  reference = true, available = reference,
} = {}) {
  await expect(card(scope)).toBeVisible();
  await expect.poll(() => card(scope).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-urate-creatinine-snapshot'));
    const shown = model.presentation;
    return {
      status: model.status, tone: model.tone, unit: shown.unitText,
      reference: model.referenceActive, available: model.referenceAvailable,
      single: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length === 1 && node.querySelectorAll('.clcr-result-value').length === 1,
      consistent: Number(node.dataset.clcrValue) === model.rawValue &&
        node.querySelector('.clcr-result-value').textContent.trim() === shown.valueText &&
        node.dataset.clcrDisplayValue === shown.valueText && node.dataset.clcrDisplayUnit === shown.unitText && node.dataset.clcrTone === model.tone &&
        (!model.referenceAvailable || node.querySelector('.urate-creatinine-reference-value').textContent.trim() === shown.referenceValue && node.querySelector('.urate-creatinine-reference-unit').textContent.trim() === shown.unitText),
      ready: window.canComputeFormula('KM_Cr') && window.ClcrUiWorkflow.getFormulaReadiness('KM_Cr').valueReady,
      locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn').disabled,
    };
  })).toMatchObject({ status, tone, unit: 'mmol/mmol', reference, available, single: true, consistent: true, ready: true, locked: guest, saveDisabled: guest });
  await expect(card(scope)).not.toContainText(REMOVED_RESULT_SENTENCE);
  const model = await card(scope).evaluate(node => JSON.parse(node.getAttribute('data-clcr-urate-creatinine-snapshot')));
  expect(model).toMatchObject({ schema: 'clcr-urate-creatinine', version: 1, valid: true });
  expect(model.rawValue).toBeCloseTo(raw, 14);
  return model;
}

export async function expectBlocked(scope) {
  await expect(card(scope)).toHaveCount(0);
  expect(await scope.evaluate(() => window.canComputeFormula('KM_Cr'))).toBe(false);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('KM_Cr').valueReady)).toBe(false);
  expect(await scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'KM_Cr' }))).toEqual([]);
  await expect(scope.locator('#clcrVisitSaveCard')).toBeHidden();
}

export const displayedNumber = text => Number(String(text).replace(/\s|≈/g, '').replace(',', '.'));
