import { expect, test } from '../support/test-czas.mjs';
import { computeSga, openSgaFixture, SGA_INPUT } from '../support/karta-pacjenta-sga.mjs';
import { prepareDocProUserFlow } from '../support/clear-current-state-fixture.mjs';
import { cancelNativeClear, expectSaveState, lastCommit, observeRealSave,
  openCommittedPatient, record, reference, saveByVisibleMenu,
} from '../support/save-commit-reference-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(150_000);

for (const shell of [false, true]) {
  test(`${shell ? 'shell' : 'standalone'}: immediate Save commits the current edit, then another edit warns without changing its reference`, async ({ page }) => {
    const { owner, ids } = await openCommittedPatient(page, { shell });
    const before = await record(owner, ids.a);
    await observeRealSave(owner);
    // Do not wait for the ordinary 300/400ms input debounces before Save.
    await owner.locator('#height').fill('159');
    const immediate = await owner.evaluate(() => window.VildaDataImportExport.getSaveReadiness?.() || null);
    if (immediate) expect(immediate.ready, 'ordinary input debounce does not block an explicit Save').toBe(true);
    await saveByVisibleMenu(page, owner);
    await expectSaveState(owner, 'saved');
    const committed = await lastCommit(owner);
    expect(committed.snapshot.payload.user.height).toBe(159);
    expect((await record(owner, ids.a)).snapshotCount).toBe(before.snapshotCount + 1);
    const savedReference = await reference(owner);
    expect(JSON.parse(savedReference).core.user.height).toBe(159);
    await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'saved');
    await owner.locator('#height').fill('160');
    await expectSaveState(owner, 'dirty');
    await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
    expect(await reference(owner)).toBe(savedReference);
    const stored = await record(owner, ids.a);
    await cancelNativeClear(owner);
    await expect(owner.locator('#height')).toHaveValue('160');
    expect(await record(owner, ids.a)).toEqual(stored);
    expect(await reference(owner)).toBe(savedReference);
  });
}

test('an SGA producer changing the form after durable commit stays Dirty against the exact committed snapshot', async ({ page }) => {
  const fixture = await openSgaFixture(page);
  const owner = fixture.frame;
  await prepareDocProUserFlow(owner);
  const birth = await computeSga(owner, { inputs: { ...SGA_INPUT, head: '' } });
  await observeRealSave(owner, { holdAfterCommit: true });
  await saveByVisibleMenu(page, owner);
  await owner.waitForFunction(() => window.__committedReferenceProbe.held);
  const committed = await lastCommit(owner);
  expect(committed.snapshot.payload.birth).toEqual(birth);
  // Exercise a genuine second producer without relying on the separate SGA
  // prefill bug: its public restore changes a clinical input while Save awaits
  // its original vault receipt. No dirty flags, references or handlers are set.
  const changed = await owner.evaluate(() => {
    const api = window.vildaSgaBirthPersistApi;
    api.restoreState({ ...api.captureStateReadOnly(), head: '30' });
    const result = api.captureStateReadOnly();
    window.__committedReferenceProbe.release();
    return result;
  });
  expect(changed.head).toBe('30');
  expect(changed.assessment).toBeUndefined();
  await expect.poll(() => owner.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
  const refBirth = JSON.parse(await reference(owner)).core.birth;
  await test.info().attach('committed-sga-and-next-producer', { contentType: 'application/json', body: JSON.stringify({
    committed: committed.snapshot.payload.birth, changed, refBirth,
  }, null, 2) });
  // The canonical fingerprint deliberately omits null/false/empty display
  // values. The detached witness below tests exact snapshot bytes separately.
  expect(refBirth.assessment).toMatchObject({ computedAtISO: birth.assessment.computedAtISO,
    inputs: { sex: 'male', weeks: 34, days: 2, weightG: 1650, lengthCm: 41 }, requestedSourceKeys: ['niklasson'] });
  expect(refBirth.head || '').toBe('');
  await expectSaveState(owner, 'dirty');
  await expect(page.locator('aside.sidebar-v2 [data-menu-save-status]')).toHaveAttribute('data-save-state', 'dirty');
  const stored = await record(owner, fixture.ids.a);
  await cancelNativeClear(owner);
  expect(await record(owner, fixture.ids.a)).toEqual(stored);
  expect(await owner.evaluate(() => window.vildaSgaBirthPersistApi.captureStateReadOnly())).toEqual(changed);
});

test('save publication is bound to its own patient, snapshot and apply sequence, not a foreign vault notification', async ({ page }) => {
  const { owner, ids, patients } = await openCommittedPatient(page);
  await observeRealSave(owner);
  await owner.locator('#height').fill('159');
  await saveByVisibleMenu(page, owner);
  await expectSaveState(owner, 'saved');
  const committed = await lastCommit(owner);
  const publication = await owner.evaluate(() => window.__committedReferenceProbe.events.at(-1));
  expect(publication).toMatchObject({ source: 'save', patientId: ids.a,
    snapshotId: committed.receipt.snapshotId, referenceVerified: true });
  const ownWitness = await owner.evaluate(detail => window.VildaDataImportExport.getCommittedSaveWitness(detail), publication);
  expect(ownWitness).toMatchObject({ patientId: ids.a, sourcePatientId: ids.a,
    snapshotId: committed.receipt.snapshotId, applySequence: publication.applySequence });
  expect(ownWitness.payload).toEqual(committed.snapshot.payload);
  await owner.locator('#height').fill('160');
  await expectSaveState(owner, 'dirty');
  const savedReference = await reference(owner), savedA = await record(owner, ids.a);
  const foreign = await owner.evaluate(async ({ patientId, payload }) => window.VildaVault.savePatient(payload,
    { patientId, dedup: false }), { patientId: ids.b, payload: patients.b });
  expect(foreign.patientId).toBe(ids.b);
  await expectSaveState(owner, 'dirty');
  expect(await owner.evaluate(detail => window.VildaDataImportExport.getCommittedSaveWitness(detail),
    { ...publication, patientId: ids.b, snapshotId: foreign.snapshotId })).toBeNull();
  expect(await reference(owner)).toBe(savedReference);
  expect(await record(owner, ids.a)).toEqual(savedA);
  await cancelNativeClear(owner);
  await expect(owner.locator('#height')).toHaveValue('160');
});

test('Save is rejected during a real restore without another version, while an immediate ordinary edit is saveable afterward', async ({ page }) => {
  const { owner, ids } = await openCommittedPatient(page);
  const before = await record(owner, ids.a);
  await observeRealSave(owner);
  const attempt = await owner.evaluate(async () => {
    // Invoke the actual restore producer. The same-task attempt reaches its
    // genuine in-flight window without assigning guards or delaying its RAF.
    const started = window.vildaSession.restore();
    const restoring = window.__vildaPersistRestoring === true;
    const decision = window.VildaSaveStatusIndicator.getCurrentDecision();
    const readiness = window.VildaDataImportExport.getSaveReadiness?.() || null;
    const result = await window.VildaDataImportExport.saveUserDataWithReceipt();
    return { started, restoring, decision, readiness, result, calls: window.__committedReferenceProbe.calls };
  });
  await test.info().attach('save-during-real-main-session-restore', {
    contentType: 'application/json', body: JSON.stringify(attempt, null, 2),
  });
  expect(attempt.started).toBe(true);
  expect(attempt.restoring).toBe(true);
  expect(attempt.decision.ready).toBe(false);
  expect(attempt.result.saved).toBe(false);
  expect(attempt.calls).toBe(0);
  expect(attempt.readiness).toMatchObject({ ready: false });
  expect(attempt.readiness.reason).toBeTruthy();
  expect(await record(owner, ids.a)).toEqual(before);
  await expectSaveState(owner, 'saved');
  await owner.locator('#height').fill('159');
  await saveByVisibleMenu(page, owner);
  await expectSaveState(owner, 'saved');
  expect((await record(owner, ids.a)).snapshotCount).toBe(before.snapshotCount + 1);
});

test('a patient handoff invalidates an old queued save before it can create a snapshot or publish a reference', async ({ page }) => {
  const { owner, ids } = await openCommittedPatient(page);
  const beforeA = await record(owner, ids.a), beforeB = await record(owner, ids.b);
  await observeRealSave(owner);
  await owner.evaluate(id => {
    window.VildaAuthUI.showPatientCard(id, payload => {
      // Queue old-form Save immediately before the real incoming producer.
      // AuthUI itself sets the new PID after this callback; no identity is forged.
      window.__handoffSave = window.VildaDataImportExport.saveUserDataWithReceipt();
      window.applyLoadedData(payload);
    }, null);
  }, ids.b);
  await owner.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  await expect(owner.locator('#vildaLoadChoiceModal')).toBeVisible();
  await owner.locator('#vildaLcmRestore').click();
  await expect(owner.locator('#vildaLoadChoiceModal')).toHaveCount(0);
  const receipt = await owner.evaluate(() => window.__handoffSave);
  expect(receipt.saved).toBe(false);
  expect(await owner.evaluate(() => window.__committedReferenceProbe.calls)).toBe(0);
  await expect(owner.locator('#height')).toHaveValue('150');
  await expectSaveState(owner, 'saved');
  expect(await owner.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.b);
  expect(await record(owner, ids.a)).toEqual(beforeA);
  expect(await record(owner, ids.b)).toEqual(beforeB);
});
