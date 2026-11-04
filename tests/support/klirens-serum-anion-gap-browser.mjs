import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Clinical calculation, serialization and presentation stay production code.
// The shared patient-record fixture replaces encrypted I/O with fictional data.
export const FORMULA = 'AGs';
export const ELECTROLYTES = ['S_Na', 'S_Cl', 'S_HCO3'];
export const base = Object.freeze({
  currentVersion: 'advanced', formulaPicker: FORMULA,
  age: '40', ageMonths: '', ageDays: '', sex: '', weight: '', height: '',
  S_Na: '140', S_Cl: '100', S_HCO3: '18', S_K: '',
  AGS_albuminEnabled: false, S_Albumin: '', S_Albumin_unit: 'g/L',
});
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="AGs"]');
export const inputCard = page => page.locator('#agsInputCard');
export const details = page => page.locator('#clcr-serum-anion-gap-details');

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrSerumAnionGap?.evaluate && window.ClcrSerumAnionGapUi && window.ClcrSerumAnionGapPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formula = FORMULA) {
  expect(await page.evaluate(snapshot => window.applyClcrSessionSnapshot(snapshot, {
    source: 'e2e-serum-anion-gap-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formula);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'advanced', selectedFormula: FORMULA, inputs: { ...base, ...fields } });
  await expect(inputCard(page)).toBeVisible();
}

export async function choose(page, formula) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formula)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formula);
}

export async function expectResult(page, { raw = 22, assessment = 'high', tone = 'warn', guest = true, saveable = true } = {}) {
  await expect(card(page)).toBeVisible();
  await expect(page.locator('#clcrResultReport .clcr-result-card:visible')).toHaveCount(1);
  await expect(card(page)).toHaveAttribute('data-clcr-tone', tone);
  await expect(card(page)).toHaveAttribute('data-clcr-assessment', assessment);
  await expect(card(page).locator('.clcr-result-value')).toHaveCount(1);
  await expect(card(page).locator('.clcr-result-unit')).toHaveText('mmol/L');
  const snapshot = JSON.parse(await card(page).getAttribute('data-clcr-serum-anion-gap-snapshot'));
  expect(snapshot).toMatchObject({ schema: 'clcr-serum-anion-gap', version: 1, valid: true, unit: 'mmol/L' });
  expect(snapshot.rawValue).toBe(raw);
  expect(Number(await card(page).getAttribute('data-clcr-value'))).toBe(raw);
  const shown = await card(page).getAttribute('data-clcr-display-value');
  expect(shown).toBe(snapshot.display.text);
  expect(await page.evaluate(() => window.canComputeFormula('AGs'))).toBe(true);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('AGs').valueReady)).toBe(true);
  const points = await collect(page);
  expect(points).toHaveLength(saveable ? 1 : 0);
  if (saveable) expect(points[0]).toMatchObject({ rawValue: raw, valueNum: raw, serumAnionGapSnapshot: snapshot });
  if (guest || !saveable) await expect(page.locator('#clcrVisitSaveBtn')).toBeDisabled();
  if (guest) expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  return snapshot;
}

export const collect = page => page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'AGs' }));

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('AGs'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('AGs').valueReady)).toBe(false);
  expect(await collect(page)).toEqual([]);
}
