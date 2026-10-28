import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Fictional inputs only. Real encrypted vault objects remain locked throughout.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="UA_mgkg"]');
export const details = page => page.locator('#clcr-ua-details');
export const base = {
  currentVersion: 'pro', formulaPicker: 'UA_mgkg',
  age: '10', ageMonths: '', ageDays: '', sex: 'M', weight: '30', height: '',
  UA_inputMode: 'concentration', UA_concentration: '30', UA_concentrationUnit: 'mg/dL',
  UA_volume: '1200', UA_volumeUnit: 'mL', UA_collectionHours: '24',
  UA_reportedValue: '', UA_reportedUnit: 'mg/24h',
  U_UA: '', V24: '', collectionStartAt: '', collectionEndAt: '',
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
  await page.waitForFunction(() => Boolean(window.VildaClcrUa && window.ClcrUaReferenceData && window.ClcrUaUi && window.ClcrUaPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formulaId = 'UA_mgkg') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-ua-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'UA_mgkg', inputs: { ...base, ...fields } });
  await expect(page.locator('#uaInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, { raw = 12, status = 'high', tone = 'warning', unit = 'mg/kg/24 h', guest = true, reference = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect.poll(async () => card(page).evaluate(node => {
    const model = JSON.parse(node.getAttribute('data-clcr-ua-snapshot'));
    const value = node.querySelector('.clcr-result-value');
    return { raw: model.rawValue, status: model.status, tone: model.tone, unit: model.unit,
      reference: model.referenceActive,
      single: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length === 1 && node.querySelectorAll('.clcr-result-value').length === 1,
      consistent: Number(node.dataset.clcrValue) === model.rawValue && value.textContent.trim() === model.display.text && node.dataset.clcrDisplayValue === model.display.text && node.dataset.clcrDisplayUnit === model.unit && node.dataset.clcrTone === model.tone,
      ready: window.canComputeFormula('UA_mgkg') && window.ClcrUiWorkflow.getFormulaReadiness('UA_mgkg').valueReady,
      locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn').disabled };
  })).toEqual({ raw, status, tone, unit, reference, single: true, consistent: true, ready: true, locked: guest, saveDisabled: guest });
  const model = await card(page).evaluate(node => JSON.parse(node.getAttribute('data-clcr-ua-snapshot')));
  expect(model).toMatchObject({ schema: 'clcr-ua', version: 1, valid: true, rawValue: raw, value: raw });
  return model;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('UA_mgkg'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('UA_mgkg').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'UA_mgkg' }))).toEqual([]);
  // The shared workflow removes the whole save section when no datapoint is
  // available; its hidden button does not need a disabled attribute.
  await expect(page.locator('#clcrVisitSaveCard')).toBeHidden();
}

export async function setField(page, id, value) {
  const field = page.locator('#' + id);
  if (await field.evaluate(node => node.tagName === 'SELECT')) await field.selectOption(value);
  else await field.fill(value);
}
