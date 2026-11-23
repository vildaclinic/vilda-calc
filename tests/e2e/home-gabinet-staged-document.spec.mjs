import { expect, test } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { fictionalPatient } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(120_000);

test('a staged plan creates a visit document on the ordinary encrypted account and loses a race with whole-visit trash', async ({ page }) => {
  const { frame } = await prepareGabinet(page);
  const patientId = await frame.evaluate(async data => (await VildaVault.savePatient(data, { dedup: false })).patientId,
    fictionalPatient({ firstName: 'Etapowy' }));
  await choosePatient(frame, 'Etapowy');
  await frame.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => VildaHomeEncounter.state(id).mode, patientId)).toBe('new');
  const result = await frame.evaluate(async patientId => {
    const vault = VildaVault, id = () => crypto.randomUUID();
    const binding = VildaHomeEncounter.captureBinding(patientId);
    await VildaCarePlans.ensureTemplateLibrary({ ui: false });
    const templateId = id();
    const definition = VildaCareTemplateModel.createDefinitionDraft({ stageId: 'source-stage', stepId: 'source-step' }).definition;
    definition.name = 'Fikcyjny plan etapowy';
    definition.stages[0].title = 'Pierwszy etap';
    Object.assign(definition.steps[0], { title: 'Przyjęcie wyniku', requiredOutcome: 'resultReceipt', includedByDefault: true });
    await vault.saveCarePlanTemplateRevision({ templateId, operationId: id(), baseToken: null, definition });
    const source = { patientId, templateId, revisionId: (await vault.getCarePlanTemplate(templateId)).headRevisionId };
    const library = vault.getCarePlanApplicationProvider(), application = await library.prepare(source);
    const { planId } = await library.commit({ ...source, token: application.token, definition: application.definition, operationId: id() }, binding);
    const first = await vault.getCarePlan(planId), visitDate = binding.visitContext.clinicalDateISO;
    await vault.mutateStagedCarePlan({ action: 'activateStage', patientId, planId, expectedRevision: first.rev, operationId: id(),
      stageId: first.careContext.stages[0].id, effectiveDateISO: visitDate }, binding);
    const stepId = first.careContext.steps[0].id;
    function fact(plan, kind, documentId, operationId) {
      return vault.mutateStagedCarePlan({ action: 'recordFact', patientId, planId, expectedRevision: plan.rev, operationId,
        stepId, kind, factId: id(), effectiveDateISO: visitDate,
        document: { id: documentId, title: 'Fikcyjny wynik', body: 'Opis otrzymanego dokumentu.' } }, binding);
    }
    const documentId = id(), operationId = id();
    const recorded = await fact(await vault.getCarePlan(planId), 'resultReceipt', documentId, operationId);
    const after = await vault.getCarePlan(planId), child = await vault.getPatientNote(documentId);
    const exported = (await vault.exportSyncPayload()).patientNotes.find(note => note.id === documentId);
    const visit = (await vault.getPatientVisits(patientId)).find(row => row.visitId === binding.visitContext.visitId);

    // Hold the real portable-plan lease. Once the next operation queues behind it,
    // its ensureRecorded already returned, but its durable transaction has not started.
    const lockName = 'vilda-native-care-plan:' + vault.getCurrentUser().userId;
    let acquired, release;
    const ready = new Promise(resolve => { acquired = resolve; });
    const gate = new Promise(resolve => { release = resolve; });
    const holding = navigator.locks.request(lockName, async () => { acquired(); await gate; });
    await ready;
    const secondId = id(), pending = fact(after, 'performance', secondId, id())
      .then(value => ({ saved: value.saved }), error => ({ error: error.code }));
    try {
      const deadline = performance.now() + 10_000;
      while (!(await navigator.locks.query()).pending.some(lock => lock.name === lockName)) {
        if (performance.now() >= deadline) throw new Error('The staged operation did not enter the portable-plan queue');
        await new Promise(resolve => { setTimeout(resolve, 10); });
      }
      await vault.moveVisitToTrash(patientId, visit.visitId, { snapshotId: visit.snapshotId, revision: visit.rev, isCurrent: () => true });
    } finally { release(); await holding; }
    const secondOutcome = await pending;
    return { expected: binding.visitContext, saved: recorded.saved, child: child.visitContext, role: child.careContext.role,
      exported: exported.visitContext, format: exported.careContext.nativeFormat,
      ledger: after.careContext.log.find(entry => entry.operationId === operationId).visitContext,
      trashed: (await vault.listTrashedVisits(patientId)).some(row => row.visitId === visit.visitId),
      secondOutcome, secondExists: !!await vault.getPatientNote(secondId), oldRevision: after.rev, newRevision: (await vault.getCarePlan(planId)).rev };
  }, patientId);
  expect(result).toMatchObject({ saved: true, role: 'result', format: 'vilda-native-care-plan-v1', child: result.expected,
    ledger: result.expected, exported: result.expected, trashed: true, secondOutcome: { error: 'VISIT_DOCUMENT_STALE' },
    secondExists: false, newRevision: result.oldRevision });
});
