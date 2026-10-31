import { expect, test } from '../support/test-czas.mjs';
import { loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { CARE_WORKSPACE, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { OMISSION_REASON, RECEIPT_DAY, expectOriginalPreview, getNote, omissionsFor, ordinaryResult,
  rawNote, seedStepActions, selectExistingResult, stepActionsFixture, stepFor,
  submitExistingResult, submitOmission } from '../support/care-plans-step-actions-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care step mobile shell keeps omission and external original through privacy, route changes and F5 without dirtying the loaded patient', async ({ page }) => {
  const created = await stepActionsFixture(page, { shell: true });
  let frame = created.frame;
  const seeded = await seedStepActions(frame, created.ids.a), source = await ordinaryResult(frame, created.ids.a, 'z telefonu');
  const originalRaw = await rawNote(frame, source.id);
  await loadPatient(frame, created.ids.a, 'restore');
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  const patientBefore = await frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a);
  let panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  await submitOmission(page, panel, seeded.firstStepId);
  const form = await selectExistingResult(page, panel, seeded.otherStepId, source);
  await noHorizontalOverflow(page);
  await submitExistingResult(form);
  const saved = await readPlan(frame, seeded.planId);
  expect(saved.steps.find(step => step.id === seeded.firstStepId).state).toBe('cancelled');
  expect(saved.steps.find(step => step.id === seeded.otherStepId)).toMatchObject({ state: 'done',
    resultNoteId: source.id, completedDateISO: RECEIPT_DAY });
  const evidence = (await omissionsFor(frame, seeded.planId)).omissions[seeded.firstStepId];
  expect(evidence).toMatchObject({ confirmed: true, protected: true, reason: OMISSION_REASON });
  expect(await rawNote(frame, source.id)).toEqual(originalRaw);
  const beforeRead = await rawCareStorage(frame);
  const preview = await expectOriginalPreview(panel, seeded.otherStepId, source);
  const workspace = page.locator(CARE_WORKSPACE);
  await workspace.getByRole('button', { name: 'Ukryj treść Przypomnień', exact: true }).click();
  await expect(workspace.locator('.vilda-reminders-private-cover')).toBeVisible();
  await expect(preview).toBeHidden();
  expect(await preview.evaluate(node => {
    const root = node.closest('.vb22-private-content');
    return Boolean(root?.inert && root.getAttribute('aria-hidden') === 'true' && getComputedStyle(node).visibility === 'hidden');
  })).toBe(true);
  await workspace.getByRole('button', { name: 'Pokaż treść Przypomnień', exact: true }).click();
  await expect(preview.locator('.vcp-record-body')).toHaveText(source.body);
  await panel.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
  await expect(stepFor(panel, seeded.firstStepId).locator('.vcp-omission-reason')).toContainText(OMISSION_REASON);
  expect(await rawCareStorage(frame)).toEqual(beforeRead);

  await page.evaluate(() => { location.hash = '#/klirens'; });
  const clearance = await shellFrame(page, 'Kalkulator klirensu');
  await clearance.waitForFunction(() => window.VildaVault?.isUnlocked());
  expect(await readPlan(clearance, seeded.planId)).toEqual(saved);
  expect(await getNote(clearance, source.id)).toEqual(source);
  await page.evaluate(() => { location.hash = '#/start'; });
  frame = await shellFrame(page);
  await readyForPatient(frame);
  expect(await rawCareStorage(frame)).toEqual(beforeRead);
  await page.reload({ waitUntil: 'load' }); frame = await shellFrame(page);
  await readyForPatient(frame);
  await frame.waitForFunction(() => window.VildaSaveStatusIndicator?.getState() === 'saved'
    && window.VildaSaveStatusIndicator?.isReadyForSharedReference?.());
  expect(await readPlan(frame, seeded.planId)).toEqual(saved);
  expect((await omissionsFor(frame, seeded.planId)).omissions[seeded.firstStepId]).toEqual(evidence);
  expect(await getNote(frame, source.id)).toEqual(source);
  expect(await rawCareStorage(frame)).toEqual(beforeRead);
  expect(await frame.evaluate(id => window.VildaVault.getPatient(id), created.ids.a)).toEqual(patientBefore);
  panel = await openCarePlans(page); await selectPlan(panel, seeded.planId);
  await expect(stepFor(panel, seeded.firstStepId).locator('.vcp-step-top')).toContainText('Pominięty');
  await expectOriginalPreview(panel, seeded.otherStepId, source);
  expect(await rawCareStorage(frame)).toEqual(beforeRead);
  expect(await frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  expect(await frame.evaluate(() => window.VildaVault.getCarePlanWriteCapability())).toMatchObject({ available: false });
  await noHorizontalOverflow(page);
});
