import { expect, test } from '@playwright/test';
import { CARE_FORM, mutatePlan, noHorizontalOverflow, openCarePlans, readPlan, selectPlan } from '../support/care-plans-fixture.mjs';
import { careSyncPair, pullUntilPlan, watchCareBeacons } from '../support/care-plans-sync-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

async function createSharedPlan(desktop, patientId, large = false) {
  const created = await mutatePlan(desktop, patientId, null, 'create', {
    title: 'Fikcyjny plan między urządzeniami',
    goal: large ? 'Fikcyjny długi opis. ' + 'ąę '.repeat(5950) : 'Fikcyjne ustalenia lekarza dotyczące dwóch niezależnych kroków.',
  });
  const waiting = await mutatePlan(desktop, patientId, created.planId, 'addStep', {
    step: { title: 'Fikcyjny wynik rezonansu', kind: 'Oczekujący wynik', state: 'waiting', reminderDateISO: '2027-11-20' },
  });
  const control = await mutatePlan(desktop, patientId, created.planId, 'addStep', {
    step: { title: 'Fikcyjna przyszła kontrola', kind: 'Kontrola', state: 'pending', reminderDateISO: '2027-12-20', eventDateISO: '2027-12-22' },
  });
  return { id: created.planId, waiting: waiting.stepId, control: control.stepId };
}

for (const large of [false, true]) test(`care plans sync: desktop and phone exchange live workflow${large ? ' when the large parent beacon is rejected' : ''}`, async ({ page, context, browser, baseURL }) => {
  const pair = await careSyncPair({ page, context, browser, baseURL });
  const { desktop, phone, cloud, patientId } = pair;
  try {
    const phonePanel = await openCarePlans(phone);
    await expect(phonePanel.locator('[data-plan-id]')).toHaveCount(0);
    const beforePhonePatient = await phone.evaluate(id => window.VildaVault.getPatient(id), patientId);
    const baselineETag = cloud.etag;
    // Slow full uploads cannot conceal a broken note-delta channel. The
    // unchanged cloud blob contains only the baseline patient, without plans.
    cloud.pauseUploads();
    await watchCareBeacons(desktop, large);
    await desktop.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(true));
    const plan = await createSharedPlan(desktop, patientId, large);
    await pullUntilPlan(phone, plan.id, current => current?.steps.length === 2);
    await expect(phonePanel.locator(`[data-plan-id="${plan.id}"]`)).toBeVisible();
    expect(cloud.etag).toBe(baselineETag);
    expect(cloud.deltas.length).toBeGreaterThan(0);
    await selectPlan(phonePanel, plan.id);
    await expect(phonePanel.locator('.vcp-detail')).toContainText('Fikcyjny wynik rezonansu');
    await expect(phonePanel.locator('.vcp-detail')).toContainText('Fikcyjna przyszła kontrola');
    const source = await readPlan(desktop, plan.id), received = await readPlan(phone, plan.id);
    expect(received.steps).toEqual(source.steps);
    expect(received.goal).toBe(source.goal);
    expect(await phone.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(beforePhonePatient);
    if (large) {
      const rejected = await desktop.evaluate(() => window.__careSyncBeacons.filter(attempt => attempt.rejected));
      expect(rejected.length).toBeGreaterThan(0);
      expect(rejected.every(attempt => attempt.size > 65536)).toBe(true);
      const posted = cloud.requests.filter(request => request.method === 'POST' && request.endpoint === 'delta');
      expect(posted.some(request => request.kind === 'ping')).toBe(true);
      expect(posted.some(request => request.kind === 'fetch' && rejected.some(attempt => attempt.text === request.body))).toBe(true);
    }
    await noHorizontalOverflow(phone);

    await desktop.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(false));
    cloud.resumeUploads();
    await desktop.evaluate(() => window.VildaSync.syncPush());
    await phone.evaluate(() => window.VildaSync.syncPull());
    const desktopPanel = await openCarePlans(desktop); await selectPlan(desktopPanel, plan.id);
    const beforeDesktopPatient = await desktop.evaluate(id => window.VildaVault.getPatient(id), patientId);
    const reverseETag = cloud.etag;
    cloud.pauseUploads(); await watchCareBeacons(phone, large);
    await phone.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(true));
    await phonePanel.locator(`[data-step-id="${plan.waiting}"]`).getByRole('button', { name: 'Wpisz wynik', exact: true }).click();
    const form = phone.locator(CARE_FORM);
    await form.getByLabel('Treść wyniku', { exact: true }).fill('Fikcyjny wynik dopisany na telefonie.');
    const receivedAt = await form.getByLabel('Data otrzymania wyniku', { exact: true }).inputValue();
    await form.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
    await expect(form).toHaveCount(0);
    await pullUntilPlan(desktop, plan.id, current => current?.steps.find(step => step.id === plan.waiting)?.state === 'done');
    expect(cloud.etag).toBe(reverseETag);
    await expect(desktopPanel.locator(`[data-step-id="${plan.waiting}"]`)).toContainText('Zakończony');
    const final = await readPlan(desktop, plan.id), remoteFinal = await readPlan(phone, plan.id);
    expect(final.steps).toEqual(remoteFinal.steps);
    expect(final.steps.find(step => step.id === plan.control).state).toBe('pending');
    const resultId = final.steps.find(step => step.id === plan.waiting).resultNoteId;
    expect(await desktop.evaluate(id => window.VildaVault.getPatientNote(id), resultId)).toMatchObject({
      patientId, body: `Data otrzymania / wykonania: ${receivedAt}\n\nFikcyjny wynik dopisany na telefonie.`,
    });
    expect(await desktop.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(beforeDesktopPatient);
  } finally { await pair.close(); }
});

test('care plans sync: an updated phone repairs old note-only data at the already acknowledged cloud ETag and keeps it after F5', async ({ page, context, browser, baseURL }) => {
  const pair = await careSyncPair({ page, context, browser, baseURL });
  const { desktop, phone, cloud, patientId } = pair;
  try {
    const plan = await createSharedPlan(desktop, patientId);
    await desktop.evaluate(() => window.VildaSync.syncPush());
    // The actual pre-care-plan client imported/exported all these note fields
    // and acknowledged this blob, but its note decoder omitted careContext.
    // Reproduce that persisted shape through the production merge and pull;
    // the cloud ETag, revisions, dates and ordinary note content stay intact.
    const legacy = await phone.evaluate(async () => {
      const vault = window.VildaVault, merge = vault.mergeSyncPayload;
      vault.mergeSyncPayload = function (payload, options) {
        const old = structuredClone(payload);
        for (const note of old.patientNotes || []) delete note.careContext;
        return merge.call(vault, old, options);
      };
      try {
        const pulled = await window.VildaSync.syncPull();
        return { pulled: pulled.action, plans: await vault.listCarePlans(), notes: await vault.listAllPatientNotes() };
      } finally { vault.mergeSyncPayload = merge; }
    });
    expect(legacy.pulled).toBe('merged'); expect(legacy.plans).toEqual([]);
    expect(legacy.notes.some(note => note.title === 'Fikcyjny wynik rezonansu' && !note.careContext)).toBe(true);
    const phonePanel = await openCarePlans(phone);
    await expect(phonePanel.locator('[data-plan-id]')).toHaveCount(0);
    const patient = await phone.evaluate(id => window.VildaVault.getPatient(id), patientId);
    const untouchedCloudETag = cloud.etag;
    const beforeGETs = cloud.requests.filter(request => request.method === 'GET' && request.endpoint === 'blob').length;
    const repaired = await phone.evaluate(() => window.VildaSync.syncPull());
    expect(repaired.action).toBe('merged');
    expect(cloud.etag).toBe(untouchedCloudETag);
    expect(cloud.requests.filter(request => request.method === 'GET' && request.endpoint === 'blob')).toHaveLength(beforeGETs + 1);
    await expect(phonePanel.locator(`[data-plan-id="${plan.id}"]`)).toBeVisible();
    await selectPlan(phonePanel, plan.id);
    const source = await readPlan(desktop, plan.id), restored = await readPlan(phone, plan.id);
    expect(restored).toEqual(source);
    const linked = await phone.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), patientId);
    expect(linked).toHaveLength(legacy.notes.filter(note => note.patientId === patientId).length);
    expect(new Set(linked.map(note => note.id)).size).toBe(linked.length);
    for (const step of restored.steps) for (const key of ['reminderNoteId', 'calendarNoteId']) if (step[key]) {
      expect(linked.find(note => note.id === step[key])?.careContext).toMatchObject({ planId: plan.id, stepId: step.id });
    }
    expect(await phone.evaluate(id => window.VildaVault.getPatient(id), patientId)).toEqual(patient);
    const subsequent = await phone.evaluate(() => window.VildaSync.syncPull());
    expect(subsequent.action).toBe('up-to-date');
    expect(cloud.requests.filter(request => request.method === 'GET' && request.endpoint === 'blob')).toHaveLength(beforeGETs + 1);
    await noHorizontalOverflow(phone);
    await phone.reload({ waitUntil: 'load' });
    await phone.waitForFunction(() => window.VildaVault?.isUnlocked() && !document.documentElement.classList.contains('vilda-auth-locked'));
    expect(await readPlan(phone, plan.id)).toEqual(source);
    const reopened = await openCarePlans(phone);
    await expect(reopened.locator(`[data-plan-id="${plan.id}"]`)).toBeVisible();
    await noHorizontalOverflow(phone);
  } finally { await pair.close(); }
});
