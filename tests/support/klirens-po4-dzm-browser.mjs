import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Fictional measurements only; the original encrypted vault remains locked.
export const card = scope => scope.locator('#clcrResultReport .clcr-result-card[data-clcr-series="PO4_mgkg"]');
export const details = scope => scope.locator('#clcr-po4-dzm-details');
export const base = {
  currentVersion: 'pro', formulaPicker: 'PO4_mgkg',
  age: '10', ageMonths: '', ageDays: '', sex: 'M', weight: '', height: '',
  PO4_inputMode: 'concentration', PO4_concentration: '10', PO4_concentrationUnit: 'mgP/dL',
  PO4_volume: '1500', PO4_volumeUnit: 'mL', PO4_collectionHours: '24',
  PO4_reportedValue: '', PO4_reportedUnit: 'mgP/24h', PO4_outputUnit: 'mgP/24h',
  PO4_unitConversions: '',
  PO4_collectionSource: 'assumed-24h', U_PO4: '', V24: '',
  Cl24DurationHours: '24', Cl24DurationSource: 'assumed-24h', Cl24CollectionProblem: false,
  collectionStartAt: '', collectionEndAt: '',
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
  await page.waitForFunction(() => Boolean(window.VildaClcrPo4Dzm && window.ClcrPo4DzmReferenceData && window.ClcrPo4DzmUi && window.ClcrPo4DzmPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(scope, session, formulaId = 'PO4_mgkg') {
  expect(await scope.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-po4-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(scope, fields = {}) {
  await applySession(scope, { version: 2, currentVersion: 'pro', selectedFormula: 'PO4_mgkg', inputs: { ...base, ...fields } });
  await expect(scope.locator('#po4DzmInputCard')).toBeVisible();
}

export async function choose(scope, formulaId) {
  expect(await scope.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(scope, { raw = 150, status = 'within', tone = 'normal', unit = 'mg P/24 h', guest = true, reference = true } = {}) {
  await expect(card(scope)).toBeVisible();
  await expect.poll(() => card(scope).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-po4-dzm-snapshot'));
    const value = node.querySelector('.clcr-result-value');
    const shown = model.presentation;
    return { raw: model.rawValue, status: model.status, tone: model.tone, unit: shown.unitText,
      reference: model.referenceActive,
      single: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length === 1 && node.querySelectorAll('.clcr-result-value').length === 1,
      consistent: Number(node.dataset.clcrValue) === shown.rawValue && value.textContent.trim() === shown.valueText && node.dataset.clcrDisplayValue === shown.valueText && node.dataset.clcrDisplayUnit === shown.unitText && node.dataset.clcrTone === model.tone &&
        (!model.referenceActive || node.querySelector('.po4-dzm-reference-value').textContent.trim() === shown.referenceValue && node.querySelector('.po4-dzm-reference-unit').textContent.trim() === shown.unitText),
      ready: window.canComputeFormula('PO4_mgkg') && window.ClcrUiWorkflow.getFormulaReadiness('PO4_mgkg').valueReady,
      locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn').disabled };
  })).toMatchObject({ status, tone, unit, reference, single: true, consistent: true, ready: true, locked: guest, saveDisabled: guest });
  const model = await card(scope).evaluate(node => JSON.parse(node.getAttribute('data-clcr-po4-dzm-snapshot')));
  expect(model).toMatchObject({ schema: 'clcr-po4-dzm', version: 1, valid: true });
  expect(model.rawValue).toBeCloseTo(raw, 10);
  return model;
}

export async function expectBlocked(scope) {
  await expect(card(scope)).toHaveCount(0);
  expect(await scope.evaluate(() => window.canComputeFormula('PO4_mgkg'))).toBe(false);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('PO4_mgkg').valueReady)).toBe(false);
  expect(await scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'PO4_mgkg' }))).toEqual([]);
  await expect(scope.locator('#clcrVisitSaveCard')).toBeHidden();
}

export const displayedNumber = text => Number(String(text).replace(/\s/g, '').replace(',', '.'));
