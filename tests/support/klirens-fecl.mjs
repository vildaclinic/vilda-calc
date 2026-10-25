import { expect } from '@playwright/test';

// Only synthetic data. Saving is tested through an isolated in-memory adapter;
// no test unlocks, reads, or writes a real patient vault.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="FECl_spot"]');
export const details = page => page.locator('#clcr-fecl-details');
export const base = {
  currentVersion: 'spot', formulaPicker: 'FECl_spot', age: '8', ageMonths: '', ageDays: '',
  sex: '', weight: '', height: '', Scr: '', U_Cl_spot: '20', S_Cl_spot: '100',
  Ucr_spot: '100', Ucr_spot_unit: 'mg/dl', Scr_spot: '1', Scr_spot_unit: 'mg/dl',
  FENa_sample_status: '', spotSameSpecimen: false, ui_spotSameSpecimen_answer: '',
  spotPairedChemistry: false, ui_spotPairedChemistry_answer: '', spotSampleKind: '',
  spotDiureticUse: false, ui_spotDiureticUse_answer: '', spotKnownCKD: false, ui_spotKnownCKD_answer: '',
  suspectedAKI: false, creatinineState: '',
};

export async function enterGuest(page) {
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  if (await guest.isVisible()) await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrFecl && window.ClcrFeclUi && window.ClcrFeclPersistence && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true }).waitFor({ state: 'visible' });
  await enterGuest(page);
}

export async function applySession(page, session, formulaId = 'FECl_spot') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-fecl-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'FECl_spot', inputs: { ...base, ...fields } });
  await expect(page.locator('#feclInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, { raw, tone = 'neutral' } = {}) {
  let observation;
  await expect.poll(async () => {
    observation = await page.evaluate(() => {
      const node = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="FECl_spot"]');
      return { visible: node?.checkVisibility() === true,
        count: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length,
        valueCount: node?.querySelectorAll('.clcr-result-value').length ?? 0,
        unit: node?.querySelector('.clcr-result-unit')?.textContent.trim(),
        shown: node?.querySelector('.clcr-result-value')?.textContent.trim(),
        display: node?.getAttribute('data-clcr-display-value'), tone: node?.getAttribute('data-clcr-tone'),
        raw: node ? Number(node.getAttribute('data-clcr-value')) : null,
        snapshot: node ? JSON.parse(node.getAttribute('data-clcr-fecl-snapshot')) : null,
        canCompute: window.canComputeFormula('FECl_spot'),
        ready: window.ClcrUiWorkflow.getFormulaReadiness('FECl_spot').valueReady,
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
  }).toEqual({ visible: true, count: 1, valueCount: 1, unit: '%', displayMatches: true, rawMatches: true, toneMatches: true,
    noClassification: true, canCompute: true, ready: true, locked: true, saveDisabled: true });
  expect(observation.snapshot).toMatchObject({ schema: 'clcr-fecl', version: 1, valid: true, unit: '%' });
  return observation.snapshot;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('FECl_spot'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('FECl_spot').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'FECl_spot' }))).toEqual([]);
}

export async function captureSave(page, date = '2026-10-25') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, rawNotes = [], notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'FECl_spot' });
    window.VildaVault = { isUnlocked: () => true, savePatientNote: async note => {
      rawNotes.push(JSON.parse(JSON.stringify(note)));
      notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) });
    } };
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-fecl-e2e-only', clinicalDateISO, root: document, formulaId: 'FECl_spot' });
      window.__feclSyntheticNotes = [...(window.__feclSyntheticNotes || []), ...notes];
      return { outcome, points, rawNotes, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; }
  }, date);
}
