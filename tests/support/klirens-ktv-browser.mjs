import { expect } from '@playwright/test';
import { enterGuest, installMemoryVault, PATIENT_ID, prepareBrowser, selectPatient } from './klirens-patient-record.mjs';

// Fictional fixtures only. The encrypted browser vault is never unlocked.
export const SERIES = Object.freeze({ spktv: 'KTV_spktv', ektv: 'KTV_ektv', urr: 'KTV_urr' });
export const card = scope => scope.locator('#clcrResultReport .ktv-proposal-card[data-clcr-ktv-snapshot]');
export const details = scope => scope.locator('#clcr-ktv-details');
export const variantButton = (scope, variant) => scope.locator(`[data-clcr-ktv-variant="${variant}"]`).and(scope.getByRole('button'));
export const BASE = Object.freeze({
  currentVersion: 'pro', formulaPicker: 'KTV', ktvVariant: 'spktv',
  fullName: 'Fikcyjna Pacjentka Nerkowa', age: '50', ageMonths: '0', ageDays: '', sex: 'F', height: '', weight: '',
  UreaPre: '20', UreaPost: '6', ktvDurationMinutes: '240', ktvUF: '2', ktvW: '70', ktvSessionsPerWeek: '3', ktvPidiDays: '2', ktvAccessType: 'AVF',
  ktvModality: '', ktvUreaAnalyte: '', ktvUreaUnit: '', ktvPostMethod: '',
  ktvSameSession: false, ktvPreBeforeDialysis: false, ktvPreNoDilution: false,
  ui_ktvSameSession_answer: '', ui_ktvPreBeforeDialysis_answer: '', ui_ktvPreNoDilution_answer: '',
  ktvKru: '', ktvKruMeasuredAt: '', ktvTreatmentsDelivered: false,
  ktvKnownFacts: '',
});
export const EMPTY = Object.freeze({
  UreaPre: '', UreaPost: '', ktvDurationMinutes: '', ktvUF: '', ktvW: '', ktvSessionsPerWeek: '', ktvPidiDays: '', ktvAccessType: '',
});

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page); await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrKtv && window.ClcrKtvUi && window.ClcrKtvPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function installFictionalPatient(scope, age = 50) {
  if (!await scope.evaluate(() => Boolean(window.__clcrRecordOriginalVault))) await installMemoryVault(scope, { select: false });
  await scope.evaluate(({ patientId, years }) => {
    const patient = window.top.__clcrRecordStore.payloads.get(patientId);
    patient.user.age = years; patient.user.ageMonths = 0;
    patient.user.weight = 70; patient.user.height = 175;
  }, { patientId: PATIENT_ID, years: age });
  await selectPatient(scope);
}

export async function applySession(scope, session, formulaId = 'KTV') {
  expect(await scope.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-ktv-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await scope.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(scope, fields = {}) {
  await applySession(scope, { version: 2, currentVersion: 'pro', selectedFormula: 'KTV', inputs: { ...BASE, ...fields } });
  await expect(scope.locator('#ktvInputCard')).toBeVisible();
}

export async function chooseVariant(scope, variant) {
  await variantButton(scope, variant).click();
  await expect(scope.locator('#ktvVariant')).toHaveValue(variant);
  await expect(variantButton(scope, variant)).toHaveAttribute('aria-pressed', 'true');
}

export const collect = scope => scope.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'KTV' }));
export const snapshot = scope => card(scope).evaluate(node => JSON.parse(node.getAttribute('data-clcr-ktv-snapshot')));

export async function expectResult(scope, {
  variant = 'spktv', raw = 1.4010540127569946, status = 'within', tone = 'normal', reference = true,
} = {}) {
  await expect(card(scope)).toHaveCount(1); await expect(card(scope)).toBeVisible();
  await expect(card(scope)).toHaveAttribute('data-clcr-series', SERIES[variant]);
  let model;
  await expect.poll(async () => {
    const observed = await card(scope).evaluate(node => ({ model: JSON.parse(node.getAttribute('data-clcr-ktv-snapshot')),
      raw: Number(node.getAttribute('data-clcr-value')), tone: node.getAttribute('data-clcr-tone'),
      visibleCards: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(n => n.checkVisibility()).length,
    }));
    model = observed.model;
    return { cards: observed.visibleCards, valid: model.valid, status: model.status, tone: model.tone,
      rawMatches: Number.isFinite(model.rawValue) && (raw === null || Math.abs(model.rawValue - raw) < 1e-12) && observed.raw === model.rawValue,
      reference: model.referenceActive, cardTone: observed.tone };
  }).toEqual({ cards: 1, valid: true, status, tone, rawMatches: true, reference, cardTone: tone });
  expect(model).toMatchObject({ schema: 'clcr-ktv', version: 1, outOfRange: status === 'unassessed' ? null : status !== 'within', unit: variant === 'urr' ? '%' : '' });
  expect(await scope.evaluate(() => window.canComputeFormula('KTV'))).toBe(true);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('KTV').valueReady)).toBe(true);
  const points = await collect(scope);
  expect(points).toHaveLength(1);
  expect(points[0]).toMatchObject({ id: SERIES[variant], sourceFormulaId: 'KTV', unit: variant === 'urr' ? '%' : '—', valueNum: model.rawValue, rawValue: model.rawValue,
    outOfRange: model.outOfRange, ktvSnapshot: model });
  if (!await scope.evaluate(() => window.VildaVault.isUnlocked())) await expect(scope.locator('#clcrVisitSaveBtn')).toBeDisabled();
  return model;
}

export async function expectBlocked(scope) {
  await expect(card(scope)).toHaveCount(0);
  expect(await scope.evaluate(() => window.canComputeFormula('KTV'))).toBe(false);
  expect(await scope.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('KTV').valueReady)).toBe(false);
  expect(await collect(scope)).toEqual([]);
  // With no result the existing save section is hidden before its button's
  // disabled property is refreshed. Either state must make the action unavailable.
  await expect.poll(() => scope.locator('#clcrVisitSaveBtn').evaluate(node => !node.checkVisibility() || node.disabled)).toBe(true);
}

export async function readFrozen(scope, note) {
  return scope.evaluate(value => window.ClcrKtvPersistence.savedAssessment(value), note);
}
