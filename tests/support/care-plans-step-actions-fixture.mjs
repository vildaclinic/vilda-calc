import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';
import { CARE_FORM, mutatePlan } from './care-plans-fixture.mjs';
import { rawCareStorage } from './care-plans-model-fixture.mjs';

export const ACTION_DAY = '2026-10-30';
export const RECEIPT_DAY = '2026-10-29';
export const OMISSION_REASON = 'Fikcyjna indywidualna decyzja lekarza: odstąpiono od tego kroku.\nPozostałe ustalenia i rezerwacja pozostają aktualne.';
export const CONFIRM_RESULT = 'Potwierdzam, że to otrzymany wynik tego kroku';

// The test-czas fixture supplies a running clock. In particular, restoring a
// patient must let the real Date.now()+1600 autosave guard expire after F5.
export async function stepActionsFixture(page, options = {}) {
  await page.addInitScript(() => {
    localStorage.setItem('vilda-sync-enabled-v1', 'false');
    sessionStorage.setItem('vilda-probe-done-v1', '1');
    sessionStorage.setItem('vilda-new-device-restore-shown-v1', '1');
  });
  const created = await createFictionalVault(page, options);
  await created.frame.waitForFunction(() => Boolean(window.VildaVault?.getCarePlanStepOmissions
    && window.VildaVault?.getCarePlanResultCandidate));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  return created;
}

export async function seedStepActions(frame, patientId, title = 'Fikcyjny plan niezależnych kroków') {
  const parent = await mutatePlan(frame, patientId, null, 'create', { title });
  const first = await mutatePlan(frame, patientId, parent.planId, 'addStep', {
    step: { title: 'Fikcyjny krok z zachowaną rezerwacją', kind: 'Konsultacja', state: 'pending',
      reminderDateISO: '2026-10-31', eventDateISO: '2026-10-31', eventTime: '14:20',
      description: 'Fikcyjny pierwotny opis kroku, niezależny od powodu i treści wyniku.' },
  });
  const second = await mutatePlan(frame, patientId, parent.planId, 'addStep', {
    step: { title: 'Fikcyjny równoległy oczekiwany wynik', kind: 'Oczekujący wynik', state: 'waiting',
      reminderDateISO: '2026-11-12', description: 'Fikcyjny drugi niezależny opis.' },
  });
  return { planId: parent.planId, firstStepId: first.stepId, otherStepId: second.stepId };
}

export async function ordinaryResult(frame, patientId, suffix = '') {
  return frame.evaluate(async ({ patientId, suffix }) => {
    const saved = await window.VildaVault.savePatientNote({ patientId,
      title: 'Fikcyjny niezależny wynik ' + suffix, category: 'wynik-badania',
      body: 'Fikcyjny oryginalny pełny opis ' + suffix + '.\nTreść pozostaje wyłącznie w tym dokumencie.',
      clinicalDateISO: '2026-10-12', labResult: { test: 'Fikcyjne badanie ' + suffix,
        value: 'Fikcyjny opis bez interpretacji' }, careContext: null });
    return window.VildaVault.getPatientNote(saved.id);
  }, { patientId, suffix });
}

export async function otherPlanResult(frame, patientId) {
  const parent = await mutatePlan(frame, patientId, null, 'create', { title: 'Fikcyjny inny plan twórcy wyniku' });
  const child = await mutatePlan(frame, patientId, parent.planId, 'addStep', {
    step: { title: 'Fikcyjny wynik innego planu', kind: 'Oczekujący wynik', state: 'waiting' },
  });
  const saved = await mutatePlan(frame, patientId, parent.planId, 'result', {
    stepId: child.stepId, text: 'Fikcyjny pełny wynik pozostający własnością innego planu.',
    dateISO: '2026-10-20', continuation: 'later', decisionDateISO: '2026-11-10',
  });
  await mutatePlan(frame, patientId, parent.planId, 'close', {
    reason: 'Fikcyjny zakończony plan twórcy', text: 'Fikcyjna dokumentacja zamknięcia.',
  });
  const id = saved.plan.steps.find(step => step.id === child.stepId).resultNoteId;
  return frame.evaluate(id => window.VildaVault.getPatientNote(id), id);
}

export const stepFor = (panel, id) => panel.locator(`[data-step-id="${id}"]`);
export const getNote = (frame, id) => frame.evaluate(id => window.VildaVault.getPatientNote(id), id);
export const omissionsFor = (frame, planId) => frame.evaluate(id => window.VildaVault.getCarePlanStepOmissions(id), planId);
export const notesFor = (frame, patientId) => frame.evaluate(async id =>
  (await window.VildaVault.listPatientNotesForPatient(id)).sort((a, b) => a.id.localeCompare(b.id)), patientId);
export const resultOriginalsFor = async (frame, patientId) => (await notesFor(frame, patientId))
  .filter(note => note.category === 'wynik-badania' && note.careContext?.role !== 'step');

export async function rawNote(frame, id) {
  const storage = await rawCareStorage(frame);
  const notes = Object.values(storage).flatMap(database => database.stores.patientNotes || []);
  const found = notes.find(note => note.id === id);
  expect(found, 'the exact encrypted fictional original is stored').toBeTruthy();
  return found;
}

export async function openOmission(page, panel, stepId) {
  await stepFor(panel, stepId).getByRole('button', { name: 'Pomiń krok', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await expect(form.getByRole('heading', { name: 'Pomiń krok', exact: true })).toBeVisible();
  return form;
}

export async function submitOmission(page, panel, stepId, reason = OMISSION_REASON, day = ACTION_DAY) {
  const form = await openOmission(page, panel, stepId);
  await form.getByLabel('Powód pominięcia', { exact: true }).fill(reason);
  await form.getByLabel('Data decyzji', { exact: true }).fill(day);
  await form.getByRole('button', { name: 'Zapisz pominięcie', exact: true }).click();
  await expect(form).toHaveCount(0);
  await expect(stepFor(panel, stepId).locator('.vcp-step-top')).toContainText('Pominięty');
}

export async function selectExistingResult(page, panel, stepId, source) {
  await stepFor(panel, stepId).getByRole('button', { name: 'Podepnij istniejący wynik', exact: true }).click();
  const form = page.locator(CARE_FORM), select = form.getByLabel('Wybierz wynik', { exact: true });
  await expect(select).toBeEnabled();
  await expect(select.locator(`option[value="${source.id}"]`)).toHaveCount(1);
  await select.selectOption(source.id);
  const preview = form.getByRole('region', { name: 'Podgląd wybranego wyniku', exact: true });
  await expect(preview).toHaveAttribute('data-note-id', source.id);
  await expect(preview.locator('.vcp-record-body')).toHaveText(source.body);
  // A sample/clinical day or original creation stamp is not a receipt date.
  await expect(form.getByLabel('Data otrzymania wyniku', { exact: true })).toHaveValue('');
  await expect(form.getByLabel(CONFIRM_RESULT, { exact: true })).not.toBeChecked();
  return form;
}

export async function submitExistingResult(form, receiptDay = RECEIPT_DAY) {
  await form.getByLabel('Data otrzymania wyniku', { exact: true }).fill(receiptDay);
  await form.getByLabel(CONFIRM_RESULT, { exact: true }).check();
  await form.getByRole('button', { name: 'Podepnij wynik', exact: true }).click();
  await expect(form).toHaveCount(0);
}

export async function expectOriginalPreview(panel, stepId, source) {
  await stepFor(panel, stepId).getByRole('button', { name: 'Otwórz wynik', exact: true }).click();
  const preview = panel.locator(`.vcp-record[data-note-id="${source.id}"]`);
  await expect(preview.locator('.vcp-record-body')).toHaveText(source.body);
  return preview;
}
