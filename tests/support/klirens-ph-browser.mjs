import { expect } from '@playwright/test';

// Synthetic inputs only; the original encrypted vault stays locked throughout.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH_spot"]');
export const details = page => page.locator('#clcr-ph-details');
export const base = {
  currentVersion: 'spot', formulaPicker: 'pH_spot', U_pH: '6.5',
  age: '', ageMonths: '', ageDays: '', sex: '', weight: '', height: '',
  Scr: '', Scr_spot: '', Ucr_spot: '', spotSampleKind: '',
  spotMenstruation: false, spotHematuria: false, spotInfection: false,
  spotExercise: false, spotAcuteIllness: false,
};

export async function openCalculator(page, width = 1440) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route(/^https:\/\/(?:fonts\.googleapis\.com|fonts\.gstatic\.com|cdn\.sheetjs\.com|cdn\.jsdelivr\.net)\//, route => route.abort());
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  const guest = page.getByRole('button', { name: 'Korzystaj bez logowania', exact: true });
  await guest.waitFor({ state: 'visible' });
  await guest.evaluate(button => button.click());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked') &&
    document.documentElement.classList.contains('clcr-workflow-ready') && typeof window.applyClcrSessionSnapshot === 'function' &&
    Boolean(window.VildaClcrPh && window.ClcrPhUi && window.ClcrPhPersistence && window.ClcrVisitSave) && window.clcrIsResetting !== true);
  if (await page.locator('#consent-decline').isVisible()) await page.locator('#consent-decline').click();
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formulaId = 'pH_spot') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-ph-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'spot', selectedFormula: 'pH_spot', inputs: { ...base, ...fields } });
  await expect(page.locator('#phInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, { raw = 6.5, tone = 'normal', status = 'within', guest = true } = {}) {
  let model;
  await expect.poll(async () => {
    const result = await page.evaluate(() => {
      const node = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="pH_spot"]');
      return {
        visible: node?.checkVisibility() === true,
        count: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length,
        valueCount: node?.querySelectorAll('.clcr-result-value').length ?? 0,
        shown: node?.querySelector('.clcr-result-value')?.textContent.trim(),
        display: node?.getAttribute('data-clcr-display-value'), tone: node?.getAttribute('data-clcr-tone'),
        raw: node ? Number(node.getAttribute('data-clcr-value')) : null,
        snapshot: node?.hasAttribute('data-clcr-ph-snapshot') ? JSON.parse(node.getAttribute('data-clcr-ph-snapshot')) : null,
        canCompute: window.canComputeFormula('pH_spot'),
        ready: window.ClcrUiWorkflow.getFormulaReadiness('pH_spot').valueReady,
        locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn')?.disabled,
      };
    });
    model = result.snapshot;
    return { visible: result.visible, count: result.count, valueCount: result.valueCount,
      displayMatches: Boolean(model && model.display.text === result.shown && result.display === result.shown),
      rawMatches: result.raw === raw && model?.rawValue === raw,
      toneMatches: model?.tone === tone && result.tone === tone, status: model?.status,
      canCompute: result.canCompute, ready: result.ready, locked: result.locked, saveDisabled: result.saveDisabled };
  }).toEqual({ visible: true, count: 1, valueCount: 1, displayMatches: true, rawMatches: true,
    toneMatches: true, status, canCompute: true, ready: true, locked: guest, saveDisabled: guest });
  expect(model).toMatchObject({ schema: 'clcr-ph', version: 1, valid: true, unit: '',
    outOfRange: status !== 'within', referenceActive: true });
  return model;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('pH_spot'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('pH_spot').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'pH_spot' }))).toEqual([]);
}

export async function captureSave(page, date = '2026-10-25') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'pH_spot' });
    const originalPatientId = api.resolveCurrentPatientId();
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'fictional-ph-e2e-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu pH' } } : null,
      savePatientNote: async note => notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) }),
    };
    api._setPatientId('fictional-ph-e2e-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-ph-e2e-only', clinicalDateISO, root: document, formulaId: 'pH_spot' });
      window.__phSyntheticNotes = [...(window.__phSyntheticNotes || []), ...notes];
      return { outcome, points, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  }, date);
}
