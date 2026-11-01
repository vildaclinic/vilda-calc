import { expect } from '@playwright/test';
import { prepareBrowser } from './klirens-patient-record.mjs';

// Only synthetic data. Saving is tested through an isolated in-memory adapter;
// no test unlocks, reads, or writes a real patient vault.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="AGu_spot"]');
export const details = page => page.locator('#clcr-uag-details');
export const base = {
  currentVersion: 'spot', formulaPicker: 'AGu_spot', age: '', ageMonths: '', ageDays: '',
  sex: '', weight: '', height: '', Scr: '', Ucr_spot: '', Scr_spot: '',
  U_Na_spot: '40', U_K_spot: '25', U_Cl_spot: '80',
  FENa_sample_status: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
  spotPairedChemistry: false, ui_spotPairedChemistry_answer: '', spotSampleKind: '',
  spotKnownCKD: false, ui_spotKnownCKD_answer: '', suspectedAKI: false, creatinineState: '',
  spotNagmaContext: false, ui_spotNagmaContext_answer: '',
};

export async function enterGuest(page) {
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrUag && window.ClcrUagUi && window.ClcrUagPersistence && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).waitFor({ state: 'visible' });
  await enterGuest(page);
}

export async function applySession(page, session, formulaId = 'AGu_spot') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-uag-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'AGu_spot', inputs: { ...base, ...fields } });
  await expect(page.locator('#uagInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, { raw, tone = 'neutral', guest = true } = {}) {
  let observation;
  await expect.poll(async () => {
    observation = await page.evaluate(() => {
      const node = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="AGu_spot"]');
      return { visible: node?.checkVisibility() === true,
        count: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length,
        valueCount: node?.querySelectorAll('.clcr-result-value').length ?? 0,
        unit: node?.querySelector('.clcr-result-unit')?.textContent.trim(),
        shown: node?.querySelector('.clcr-result-value')?.textContent.trim(),
        display: node?.getAttribute('data-clcr-display-value'), tone: node?.getAttribute('data-clcr-tone'),
        raw: node ? Number(node.getAttribute('data-clcr-value')) : null,
        snapshot: node ? JSON.parse(node.getAttribute('data-clcr-uag-snapshot')) : null,
        canCompute: window.canComputeFormula('AGu_spot'),
        ready: window.ClcrUiWorkflow.getFormulaReadiness('AGu_spot').valueReady,
        locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn')?.disabled,
      };
    });
    const snapshot = observation.snapshot;
    const numericMatch = raw === undefined || (raw === 0 ? observation.raw === 0
      : Number.isFinite(observation.raw) && Math.abs((observation.raw - raw) / raw) <= 1e-12);
    return { visible: observation.visible, count: observation.count, valueCount: observation.valueCount,
      unit: observation.unit, displayMatches: Boolean(snapshot && snapshot.display.text === observation.shown && observation.display === observation.shown),
      rawMatches: numericMatch && snapshot?.rawValue === observation.raw,
      toneMatches: snapshot?.tone === tone && observation.tone === tone,
      noClassification: snapshot?.outOfRange === null && snapshot?.referenceActive === false,
      canCompute: observation.canCompute, ready: observation.ready, locked: observation.locked, saveDisabled: observation.saveDisabled };
  }).toEqual({ visible: true, count: 1, valueCount: 1, unit: 'mmol/L', displayMatches: true, rawMatches: true, toneMatches: true,
    noClassification: true, canCompute: true, ready: true, locked: guest, saveDisabled: guest });
  expect(observation.snapshot).toMatchObject({ schema: 'clcr-uag', version: 1, valid: true, unit: 'mmol/L' });
  return observation.snapshot;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('AGu_spot'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('AGu_spot').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'AGu_spot' }))).toEqual([]);
}

export async function captureSave(page, date = '2026-10-25') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'AGu_spot' });
    const originalPatientId = api.resolveCurrentPatientId();
    // The clinical writer now requires an existing selected fictional card.
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'fictional-uag-e2e-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu Klirensu' } } : null, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    api._setPatientId('fictional-uag-e2e-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-uag-e2e-only', clinicalDateISO, root: document, formulaId: 'AGu_spot' });
      window.__uagSyntheticNotes = [...(window.__uagSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  }, date);
}
