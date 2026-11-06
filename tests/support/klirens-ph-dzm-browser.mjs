import { expect } from '@playwright/test';
import { enterGuest, prepareBrowser } from './klirens-patient-record.mjs';

// Only synthetic measurements; the encrypted browser vault remains locked.
export const card = page => page.locator('#clcrResultReport .clcr-result-card[data-clcr-series="pH24"]');
export const details = page => page.locator('#clcr-ph-dzm-details');
export const base = {
  currentVersion: 'pro', formulaPicker: 'pH24', pH24: '5.2',
  age: '', ageMonths: '', ageDays: '', sex: '', weight: '', height: '',
  Cl24DurationHours: '', Cl24DurationSource: '', Cl24CollectionProblem: '',
  collectionStartAt: '', collectionEndAt: '',
  PH24_sampleType: '', PH24_preservative: '', PH24_infection: '',
  stoneMetabolicEvaluationContext: false, stoneCollectionPlausibilityReviewed: false,
  stoneTwoCollectionsConfirmed: false, stonePhPersistent: false,
  stoneUtiExcluded: false, stoneKnownCystinuria: false,
};

export async function openCalculator(page, width = 1440) {
  await prepareBrowser(page);
  await page.setViewportSize({ width, height: 1000 });
  await page.goto('/kalkulator-klirens.html', { waitUntil: 'domcontentloaded' });
  await enterGuest(page, { calculator: true });
  await page.waitForFunction(() => Boolean(window.VildaClcrPhDzm && window.ClcrPhDzmUi && window.ClcrPhDzmPersistence));
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
}

export async function applySession(page, session, formulaId = 'pH24') {
  expect(await page.evaluate(value => window.applyClcrSessionSnapshot(value, {
    source: 'e2e-ph-dzm-fictional-only', update: true, dispatchEvents: false, preserveAcrossVersions: true,
  }), session)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id &&
    document.getElementById('formulaPicker').value === id && window.clcrIsResetting !== true, formulaId);
}

export async function restore(page, fields = {}) {
  await applySession(page, { version: 2, currentVersion: 'pro', selectedFormula: 'pH24', inputs: { ...base, ...fields } });
  await expect(page.locator('#phDzmInputCard')).toBeVisible();
}

export async function choose(page, formulaId) {
  expect(await page.evaluate(id => window.ClcrUiWorkflow.selectFormula(id), formulaId)).toBe(true);
  await page.waitForFunction(id => window.ClcrUiWorkflow.state.activeFormulaId === id && window.clcrIsResetting !== true, formulaId);
}

export async function expectResult(page, {
  raw = 5.2, tone = 'normal', status = 'within', guest = true, reference = true,
} = {}) {
  let model;
  await expect.poll(async () => {
    const result = await page.evaluate(() => {
      const node = document.querySelector('#clcrResultReport .clcr-result-card[data-clcr-series="pH24"]');
      const snapshot = node?.hasAttribute('data-clcr-ph-dzm-snapshot') ? JSON.parse(node.getAttribute('data-clcr-ph-dzm-snapshot')) : null;
      return {
        visible: node?.checkVisibility() === true,
        cards: [...document.querySelectorAll('#clcrResultReport .clcr-result-card')].filter(item => item.checkVisibility()).length,
        values: node?.querySelectorAll('.clcr-result-value').length ?? 0,
        display: node?.querySelector('.clcr-result-value')?.textContent.trim(),
        raw: node ? Number(node.getAttribute('data-clcr-value')) : null,
        tone: node?.getAttribute('data-clcr-tone'), snapshot,
        canCompute: window.canComputeFormula('pH24'), ready: window.ClcrUiWorkflow.getFormulaReadiness('pH24').valueReady,
        locked: !window.VildaVault.isUnlocked(), saveDisabled: document.getElementById('clcrVisitSaveBtn')?.disabled,
      };
    });
    model = result.snapshot;
    return { visible: result.visible, cards: result.cards, values: result.values,
      displayMatches: Boolean(model && model.display.text === result.display),
      rawMatches: result.raw === raw && model?.rawValue === raw,
      toneMatches: result.tone === tone && model?.tone === tone, status: model?.status,
      reference: model?.referenceActive, canCompute: result.canCompute, ready: result.ready,
      locked: result.locked, saveDisabled: result.saveDisabled };
  }).toEqual({ visible: true, cards: 1, values: 1, displayMatches: true, rawMatches: true,
    toneMatches: true, status, reference, canCompute: true, ready: true, locked: guest, saveDisabled: guest });
  expect(model).toMatchObject({ schema: 'clcr-ph-dzm', version: 1, valid: true, unit: '',
    outOfRange: status === 'unassessed' ? null : status !== 'within' });
  return model;
}

export async function expectBlocked(page) {
  await expect(card(page)).toHaveCount(0);
  expect(await page.evaluate(() => window.canComputeFormula('pH24'))).toBe(false);
  expect(await page.evaluate(() => window.ClcrUiWorkflow.getFormulaReadiness('pH24').valueReady)).toBe(false);
  expect(await page.evaluate(() => window.ClcrVisitSave.collectActiveDatapoints(document, { formulaId: 'pH24' }))).toEqual([]);
}

export async function captureSave(page, date = '2026-11-06') {
  return page.evaluate(async clinicalDateISO => {
    const api = window.ClcrVisitSave, originalVault = window.VildaVault, notes = [];
    const points = api.collectActiveDatapoints(document, { formulaId: 'pH24' });
    const originalPatientId = api.resolveCurrentPatientId();
    window.VildaVault = { isUnlocked: () => true,
      getPatient: async patientId => patientId === 'fictional-ph-dzm-e2e-only' ? { patientId, header: { name: 'Fikcyjny pacjent testu pH DZM' } } : null,
      savePatientNote: async note => notes.push({ ...note, body: originalVault.sanitizeNoteText(note.body), labResult: originalVault.sanitizeLabResult(note.labResult) }),
    };
    api._setPatientId('fictional-ph-dzm-e2e-only');
    try {
      const outcome = await api.saveActiveResultToCard({ patientId: 'fictional-ph-dzm-e2e-only', clinicalDateISO, root: document, formulaId: 'pH24' });
      window.__phDzmSyntheticNotes = [...(window.__phDzmSyntheticNotes || []), ...notes];
      return { outcome, points, notes, vaultLocked: !originalVault.isUnlocked() };
    } finally { window.VildaVault = originalVault; api._setPatientId(originalPatientId); }
  }, date);
}
