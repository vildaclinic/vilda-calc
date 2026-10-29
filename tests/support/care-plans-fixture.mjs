import { expect } from '@playwright/test';
import { createFictionalVault } from './centile-live-fixture.mjs';

export const CARE_WORKSPACE = 'dialog.vb22-modal';
export const CARE_PANEL = `${CARE_WORKSPACE} .vcp`;
export const CARE_FORM = 'dialog.vcp-dialog';
export const CARE_TODAY = '2026-10-29';

// Each browser context owns a synthetic encrypted vault. No real account,
// patient export or unlock credentials are read by these fixtures.
export async function mutatePlan(frame, patientId, planId, action, payload = {}) {
  return frame.evaluate(async ({ patientId, planId, action, payload }) => {
    const plan = planId ? await window.VildaVault.getCarePlan(planId) : null;
    const result = await window.VildaVault.mutateCarePlan({
      patientId, planId, baseRev: plan?.rev,
      operationId: 'e2e-care-' + crypto.randomUUID(), action, ...payload,
    });
    if (!result.saved) throw Error('Synthetic plan mutation failed: ' + (result.reason || action));
    return result;
  }, { patientId, planId, action, payload });
}

export async function careFixture(page, { shell = false, seed = true } = {}) {
  await page.clock.setFixedTime(new Date('2026-10-29T10:00:00+01:00'));
  const created = await createFictionalVault(page, { shell });
  await created.frame.waitForFunction(() => Boolean(window.VildaVault?.mutateCarePlan));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  if (!seed) return created;

  const biopsy = await mutatePlan(created.frame, created.ids.a, null, 'create', {
    title: 'Fikcyjny plan biopsji', goal: 'Fikcyjny plan lekarza: wynik i dalsze ustalenia.',
  });
  const examination = await mutatePlan(created.frame, created.ids.a, biopsy.planId, 'addStep', {
    step: { title: 'Fikcyjna biopsja', kind: 'Badanie', state: 'pending',
      reminderDateISO: '2026-10-20', eventDateISO: '2026-10-20', eventTime: '10:00' },
  });
  const awaiting = await mutatePlan(created.frame, created.ids.a, biopsy.planId, 'addStep', {
    step: { title: 'Fikcyjny wynik biopsji', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2026-10-27' },
  });
  await mutatePlan(created.frame, created.ids.a, biopsy.planId, 'complete', {
    stepId: examination.stepId, text: 'Fikcyjne badanie wykonano, oczekiwanie na opis.',
    dateISO: '2026-10-20', continuation: 'existing',
  });
  const gh = await mutatePlan(created.frame, created.ids.b, null, 'create', {
    title: 'Fikcyjny plan dokumentacji GH', goal: 'Indywidualny przykład lekarza, bez kwalifikacji do leczenia.',
  });
  const ghSteps = {};
  for (const [key, title, kind, state, reminderDateISO, eventDateISO] of [
    ['first', 'Fikcyjna pierwsza hospitalizacja', 'Hospitalizacja', 'pending', '2026-10-12', '2026-10-12'],
    ['second', 'Fikcyjna druga hospitalizacja', 'Hospitalizacja', 'pending', '2026-11-09', '2026-11-09'],
    ['mr', 'Fikcyjny opis MR', 'Oczekujący wynik', 'waiting', '2026-10-28', null],
    ['eye', 'Fikcyjna konsultacja okulistyczna', 'Konsultacja', 'pending', '2026-11-03', '2026-11-03'],
    ['application', 'Fikcyjne sprawdzenie dokumentacji', 'Dokumentacja', 'pending', '2026-11-16', null],
  ]) {
    ghSteps[key] = (await mutatePlan(created.frame, created.ids.b, gh.planId, 'addStep', {
      step: { title, kind, state, reminderDateISO, eventDateISO },
    })).stepId;
  }
  await mutatePlan(created.frame, created.ids.b, gh.planId, 'complete', {
    stepId: ghSteps.first, text: 'Fikcyjna dokumentacja pierwszego etapu zapisana.',
    dateISO: '2026-10-12', continuation: 'existing',
  });
  const event = await created.frame.evaluate(async patientId => {
    const saved = await window.VildaVault.savePatientNote({
      patientId, title: 'Fikcyjna konsultacja do powiązania', body: 'Fikcyjny istniejący termin.',
      category: 'followup', dueDateISO: '2026-11-12', dueTime: '12:00',
    });
    return saved.id;
  }, created.ids.a);
  return { ...created, plans: { biopsy: biopsy.planId, gh: gh.planId },
    steps: { biopsy: examination.stepId, awaiting: awaiting.stepId, gh: ghSteps }, event };
}

export async function openCarePlans(page) {
  await page.locator('#vildaRemindersBtn').click();
  const workspace = page.locator(CARE_WORKSPACE);
  await expect(workspace).toBeVisible();
  await workspace.getByRole('button', { name: 'Plany opieki', exact: true }).click();
  const panel = workspace.locator('.vcp');
  await expect(panel).toBeVisible();
  return panel;
}

export async function selectPlan(panel, id) {
  await panel.locator(`[data-plan-id="${id}"]`).click();
  await expect(panel.locator('.vcp-detail')).toBeVisible();
}

export const readPlan = (frame, id) => frame.evaluate(id => window.VildaVault.getCarePlan(id), id);

export async function noHorizontalOverflow(page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
}
