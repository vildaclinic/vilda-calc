import { expect } from '@playwright/test';
import { prepareBrowser } from './klirens-patient-record.mjs';

// Only synthetic data. Saving is tested through an isolated in-memory adapter;
// no test unlocks, reads, or writes a real patient vault.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="TMP_GFR"]');
export const details = page => page.locator('#clcr-tmp-gfr-details');
export const base = {
  currentVersion: 'spot', formulaPicker: 'TMP_GFR', age: '10', ageMonths: '', ageDays: '',
  sex: 'M', weight: '', height: '', Scr: '',
  U_PO4_spot: '20', U_PO4_spot_unit: 'mmol/L', S_PO4_spot: '1.10', S_PO4_spot_unit: 'mmol/L',
  Ucr_spot: '5', Ucr_spot_unit: 'mmol/L', Scr_spot: '50', Scr_spot_unit: 'umol',
  FENa_sample_status: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
  spotPairedChemistry: false, ui_spotPairedChemistry_answer: '', spotSampleKind: '',
  tmpPairedSameTime: false, ui_tmpPairedSameTime_answer: '',
  tmpOvernightFasting: false, ui_tmpOvernightFasting_answer: '',
  spotKnownCKD: false, ui_spotKnownCKD_answer: '', suspectedAKI: false, creatinineState: '',
  tmpBurosumab: false, tmpDaysSinceDose: '',
};

export async function enterGuest(page) {
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrTmpGfr && window.ClcrTmpGfrUi && window.ClcrTmpGfrPersistence && window.ClcrVisitSave) && window.clcrIsResetting !== true);
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

export async function applySession(page, session, formulaId = 'TMP_GFR') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-tmpGfr-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'TMP_GFR', inputs: { ...base, ...fields } });
  await expect(page.locator('#tmpGfrInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, { raw, tone, guest = true } = {}) {
  let observation;
  await expect.poll(async () => {
    observation = await page.evaluate(() => {
      const node = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="TMP_GFR"]');
      return { visible: node?.checkVisibility() === true,
        count: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length,
        valueCount: node?.querySelectorAll('.clcr-result-value').length ?? 0,
        unit: node?.querySelector('.clcr-result-unit')?.textContent.trim(),
        shown: node?.querySelector('.clcr-result-value')?.textContent.trim(),
        display: node?.getAttribute('data-clcr-display-value'), tone: node?.getAttribute('data-clcr-tone'),
        raw: node ? Number(node.getAttribute('data-clcr-value')) : null,
        snapshot: node ? JSON.parse(node.getAttribute('data-clcr-tmp-gfr-snapshot')) : null,
        canCompute: window.canComputeFormula('TMP_GFR'),
        ready: window.ClcrUiWorkflow.getFormulaReadiness('TMP_GFR').valueReady,
        locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn')?.disabled,
      };
    });
    const snapshot = observation.snapshot;
    const numericMatch = raw === undefined || (raw === 0 ? observation.raw === 0
      : Number.isFinite(observation.raw) && Math.abs((observation.raw - raw) / raw) <= 1e-12);
    return { visible: observation.visible, count: observation.count, valueCount: observation.valueCount,
      unit: observation.unit, displayMatches: Boolean(snapshot && snapshot.display.text === observation.shown && observation.display === observation.shown),
      rawMatches: numericMatch && snapshot?.rawValue === observation.raw,
      toneMatches: snapshot?.tone === observation.tone && (tone === undefined || snapshot?.tone === tone),
      canCompute: observation.canCompute, ready: observation.ready, locked: observation.locked, saveDisabled: observation.saveDisabled };
  }).toEqual({ visible: true, count: 1, valueCount: 1, unit: 'mmol/L', displayMatches: true, rawMatches: true, toneMatches: true,
    canCompute: true, ready: true, locked: guest, saveDisabled: guest });
  expect(observation.snapshot).toMatchObject({ schema: 'clcr-tmp-gfr', version: 1, valid: true, unit: 'mmol/L' });
  return observation.snapshot;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('TMP_GFR'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('TMP_GFR').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'TMP_GFR' }))).toEqual([]);
}

export async function captureSave(page, date = '2026-10-25') {
  await page.locator('#clcrVisitDate').fill(date);
  await expect.poll(() => card(page).evaluate(node => JSON.parse(node.dataset.clcrTmpGfrSnapshot).input.clinicalDate)).toBe(date);
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'TMP_GFR' });
    const originalPatientId = api.resolveCurrentPatientId();
    // The clinical writer now requires an existing selected fictional card.
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'fictional-tmpGfr-e2e-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu Klirensu' } } : null, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    api._setPatientId('fictional-tmpGfr-e2e-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-tmpGfr-e2e-only', clinicalDateISO, root: document, formulaId: 'TMP_GFR' });
      window.__tmpGfrSyntheticNotes = [...(window.__tmpGfrSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  }, date);
}
