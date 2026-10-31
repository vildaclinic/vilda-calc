import { expect, test } from '@playwright/test';
import { careFixture } from '../support/care-plans-fixture.mjs';
import { dormantModelNote, legacyModelReadScenario, rawCareStorage } from '../support/care-plans-model-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care-plan model: reading legacy parallel steps and reloading preserves encrypted records and saved patient state', async ({ page }) => {
  await legacyModelReadScenario(page);
});

test('care-plan model: prelinked result and appointment leave a future stage planned and all writes unavailable', async ({ page }) => {
  const created = await careFixture(page, { seed: false });
  await page.waitForFunction(() => Boolean(window.VildaCarePlanModel));
  const before = await rawCareStorage(page);
  const result = await page.evaluate(note => {
    const model = window.VildaCarePlanModel, before = JSON.stringify(note);
    const freeze = value => { if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); } return value; };
    freeze(note);
    const decoded = model.decodeCarePlanRecord(note);
    const view = model.projectCarePlan(decoded, { todayLocalDateISO: '2026-10-29' });
    const reversed = JSON.parse(before); reversed.careContext.associations.reverse();
    const reverseView = model.projectCarePlan(model.decodeCarePlanRecord(reversed), { todayLocalDateISO: '2026-10-29' });
    const active = JSON.parse(before);
    active.careContext.stages[0].control = { state: 'active', review: null, activation: {
      operationId: 'fictional-manual-activation', effectiveDateISO: '2026-10-29',
      recordedAtISO: '2026-10-29T09:05:00.000Z', recordedLocalDateISO: '2026-10-29',
    } };
    const activeView = model.projectCarePlan(model.decodeCarePlanRecord(active), { todayLocalDateISO: '2026-10-29' });
    const ready = JSON.parse(JSON.stringify(active));
    ready.careContext.facts.push({ ...ready.careContext.facts[0], id: 'fictional-receipt-fact-a', stepId: 'fictional-step-a',
      operationId: 'fictional-receipt-operation-a', evidence: { noteId: 'fictional-original-result-a', sourceRecordRevAtCapture: 1 } });
    const readyView = model.projectCarePlan(model.decodeCarePlanRecord(ready), { todayLocalDateISO: '2026-10-29' });
    return { decodedKind: decoded.kind, view, reverseView, activeView, readyView, inputUnchanged: JSON.stringify(note) === before,
      offset: model.calculateStageReminderDate('2026-01-31', 2, 'month'),
      capability: model.getWriteCapability({ available: true, formatVersion: 2 }) };
  }, dormantModelNote(created.ids.a));
  expect(result.decodedKind).toBe('v2');
  expect(result.inputUnchanged).toBe(true);
  expect(result.view).toMatchObject({ kind: 'v2', readOnly: true, provenanceVerified: false,
    writeCapability: { available: false, code: 'CARE_V2_WRITER_DISABLED' }, nextAction: { type: 'startStage', stageId: 'fictional-stage-a' } });
  const future = result.view.stages[1];
  expect(future).toMatchObject({ id: 'fictional-stage-b', controlState: 'planned',
    control: { state: 'planned', activation: null, review: null }, readyForReview: false });
  expect(future.steps[0]).toMatchObject({ progress: 'resolved', reminderSchedule: null,
    workflowEligibility: { canLinkResult: true, canLinkEvent: true }, capabilities: { canLinkResult: false, canLinkEvent: false } });
  expect(future.steps[0].facts.map(fact => fact.kind)).toEqual(['resultReceipt']);
  expect(future.steps[0].associations.map(association => association.noteId).sort()).toEqual(['fictional-original-event', 'fictional-original-result']);
  expect(result.reverseView.stages[1].steps[0].workflowEligibility).toEqual(future.steps[0].workflowEligibility);
  expect(result.view.attentionItems.some(item => item.stageId === future.id)).toBe(false);
  expect(result.activeView.attentionItems).toEqual([expect.objectContaining({
    type: 'work', stageId: 'fictional-stage-a', stepId: 'fictional-step-a', dueDateISO: null, overdue: false,
  })]);
  expect(result.readyView).toMatchObject({ nextAction: { type: 'reviewStage', stageId: 'fictional-stage-a' } });
  expect(result.readyView.stages[0]).toMatchObject({ controlState: 'active', readyForReview: true, control: { review: null } });
  expect(result.readyView.stages[1]).toMatchObject({ controlState: 'planned', control: { activation: null, review: null } });
  expect(result.capability).toMatchObject({ available: false, code: 'CARE_V2_WRITER_DISABLED' });
  expect(result.offset).toEqual({ ok: true, dateISO: '2026-03-31', code: null });
  expect(await rawCareStorage(page)).toEqual(before);
});
