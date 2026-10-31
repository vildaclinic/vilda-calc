import { expect, test } from '../support/test-czas.mjs';
import { rawCareStorage } from '../support/care-plans-model-fixture.mjs';
import { readyForPatient } from '../support/centile-live-fixture.mjs';
import { beginTemplate, ensureTemplates, fillTemplateFirstStep, getTemplate, listTemplates, openTemplates,
  previewTemplateDraft, pullTemplateUntil, rawTemplateStorage, saveSimpleTemplate, syncTemplates,
  templateFixture, templateMutation, templateRevisions, templateRow, templateSyncPair, templateSyncState } from '../support/care-templates-fixture.mjs';

test.use({ chwila: '2026-10-31T10:00:00+01:00', serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180000);

test('care template encrypted desktop-phone sync preserves concurrent revision and archive for explicit review and stays independent of replaced legacy credentials', async ({ page, context, browser, baseURL }) => {
  const pair = await templateSyncPair({ page, context, browser, baseURL });
  const { desktop, phone, cloud } = pair;
  try {
    const clinical = new Map();
    for (const device of [desktop, phone]) { await ensureTemplates(device); clinical.set(device, await rawCareStorage(device)); }
    const library = await openTemplates(desktop), item = await saveSimpleTemplate(library, desktop);
    await syncTemplates(desktop); await pullTemplateUntil(phone, item.templateId, value => value?.status === 'active');
    const base = await getTemplate(desktop, item.templateId), phoneBase = await getTemplate(phone, item.templateId);
    expect(phoneBase.definition).toEqual(base.definition);
    const definition = structuredClone(base.definition); definition.purpose = 'Fikcyjna niezależna zmiana treści na komputerze.';
    cloud.holdTemplateAppends();
    const revision = await templateMutation(desktop, 'save', item.templateId, { definition, baseToken: base.baseToken });
    const archived = await templateMutation(phone, 'archive', item.templateId, { archived: true, baseToken: phoneBase.baseToken });
    expect(revision.result.saved).toBe(true); expect(archived.result.saved).toBe(true);
    cloud.releaseTemplateAppends();
    await Promise.all([syncTemplates(desktop), syncTemplates(phone)]);
    for (const device of [desktop, phone]) await pullTemplateUntil(device, item.templateId, value => value?.status === 'conflict');
    const concurrent = await getTemplate(desktop, item.templateId);
    expect(concurrent.conflicts.heads.some(head => head.definition?.purpose === definition.purpose)).toBe(true);
    expect(await templateRevisions(desktop, item.templateId)).toHaveLength(2);
    await expect(templateRow(library, item.templateId).getByRole('button', { name: 'Przejrzyj zmiany', exact: true })).toBeVisible();
    await templateRow(library, item.templateId).getByRole('button', { name: 'Przejrzyj zmiany', exact: true }).click();
    const chosen = library.locator('.vct-conflict-version').filter({ hasText: definition.purpose });
    await chosen.getByRole('button', { name: /^Wybierz wersję / }).click();
    await library.getByLabel('Po przeglądzie szablon ma być', { exact: true }).selectOption('active');
    await library.getByRole('button', { name: 'Potwierdź wybrane zmiany', exact: true }).click();
    await expect(library.locator('.vct-library-list')).toBeVisible();
    await syncTemplates(desktop); await pullTemplateUntil(phone, item.templateId, value => value?.status === 'active' && value.definition?.purpose === definition.purpose);
    for (const device of [desktop, phone]) expect(await templateRevisions(device, item.templateId)).toHaveLength(2);

    // Mutable legacy KV/auth is a different authority. Replacing it must not
    // replace the protected verifier, erase revisions or block library ACKs.
    const state = await templateSyncState(desktop);
    cloud.replaceLegacyIdentity(state.slotId); cloud.setLegacyInvalidCredentials(true);
    cloud.blob = Buffer.from('Fikcyjna zastąpiona zawartość legacy KV.');
    const next = structuredClone(definition); next.purpose = 'Fikcyjna zmiana mimo niezależnego błędu starej synchronizacji.';
    const write = await templateMutation(desktop, 'save', item.templateId, { definition: next });
    expect(write.result.saved).toBe(true);
    const legacy = await desktop.evaluate(() => window.VildaSync.syncPull().then(() => ({ ok: true }), error => ({ ok: false, code: error.code })));
    expect(legacy.ok).toBe(false);
    await syncTemplates(desktop); await pullTemplateUntil(phone, item.templateId, value => value?.definition?.purpose === next.purpose);
    expect(cloud.legacyRejectedRequests.length).toBeGreaterThan(0);
    expect(cloud.templateRequests.some(request => request.endpoint === 'template-library/events' && request.status === 200)).toBe(true);
    for (const device of [desktop, phone]) {
      expect(await templateRevisions(device, item.templateId)).toHaveLength(3);
      expect(await rawCareStorage(device)).toEqual(clinical.get(device));
      expect(await device.evaluate(() => window.VildaVault.getCarePlanWriteCapability())).toMatchObject({ available: false });
    }
  } finally { await pair.close(); }
});

test('care template uncertain ACK and changed epoch retain the exact original durable pending ciphertext through F5', async ({ page }) => {
  const { frame, cloud } = await templateFixture(page, { syncEnabled: true }), library = await openTemplates(page);
  const item = await saveSimpleTemplate(library, frame); await syncTemplates(frame);
  const committed = await getTemplate(frame, item.templateId), definition = structuredClone(committed.definition);
  definition.purpose = 'Fikcyjna trwała zmiana oczekująca na potwierdzenie.';
  cloud.holdTemplateAppends(); cloud.dropNextTemplateAck({ bumpEpoch: true });
  const saved = await templateMutation(frame, 'save', item.templateId, { definition });
  expect(saved.result).toMatchObject({ saved: true, persistence: 'local' });
  const drain = syncTemplates(frame).catch(error => ({ error: error.message }));
  await expect.poll(() => cloud.templateRequests.some(request => request.endpoint === 'template-library/events' && request.status === null)).toBe(true);
  const pendingBefore = (await rawTemplateStorage(frame)).stores.events.find(event => event.eid === saved.request.operationId);
  expect(pendingBefore.pending).toBe(1); expect(pendingBefore.wire.epoch).toBe(1); expect(pendingBefore.accepted).toBeUndefined();
  cloud.releaseTemplateAppends(); await drain;
  await syncTemplates(frame).catch(() => {});
  expect(cloud.templatePolicies()[0].epoch).toBe(2);
  const pendingAfter = (await rawTemplateStorage(frame)).stores.events.find(event => event.eid === saved.request.operationId);
  expect(pendingAfter).toEqual(pendingBefore);
  expect((await getTemplate(frame, item.templateId)).syncState.pending).toBe(true);
  const appends = cloud.templateRequests.filter(request => request.endpoint === 'template-library/events' && JSON.parse(request.rawBody).events.some(event => event.eid === saved.request.operationId));
  expect(appends.length).toBeGreaterThan(0);
  for (const request of appends) {
    const body = JSON.parse(request.rawBody); expect(body.epoch).toBe(1);
    expect(body.events.find(event => event.eid === saved.request.operationId)).toEqual({ eid: saved.request.operationId, body: pendingBefore.wire.body });
  }
  const stateReadsBefore = cloud.templateRequests.filter(request => request.endpoint === 'template-library/state').length;
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  expect(await page.evaluate(() => localStorage.getItem('vilda-sync-enabled-v1'))).toBe('true');
  await page.waitForFunction(() => Boolean(window.VildaVault?.listCarePlanTemplates));
  await expect.poll(() => cloud.templateRequests.filter(request => request.endpoint === 'template-library/state').length).toBeGreaterThan(stateReadsBefore);
  expect((await rawTemplateStorage(page)).stores.events.find(event => event.eid === saved.request.operationId)).toEqual(pendingBefore);
  expect((await templateSyncState(page)).epoch).toBe(1);
  expect((await getTemplate(page, item.templateId)).syncState.pending).toBe(true);
});

test('care template ephemeral authoring never claims a save or creates a durable cache before protected ACK, then retries the same intent', async ({ page }) => {
  const { frame, cloud } = await templateFixture(page, { syncEnabled: true });
  await frame.evaluate(() => window.VildaVault.setEphemeralMode(true));
  cloud.setTemplateUnavailable(true);
  const clinicalBefore = await rawCareStorage(frame), library = await openTemplates(page);
  await frame.evaluate(() => {
    const original = window.VildaVault.saveCarePlanTemplateRevision;
    window.__fictionalTemplateSaveRequests = [];
    window.VildaVault.saveCarePlanTemplateRevision = function (request) {
      window.__fictionalTemplateSaveRequests.push(structuredClone(request)); return original.call(this, request);
    };
  });
  await beginTemplate(library, 'Fikcyjny schemat wymagający potwierdzenia serwera'); await fillTemplateFirstStep(library);
  await previewTemplateDraft(library);
  await library.getByRole('button', { name: 'Zapisz szablon', exact: true }).click();
  await expect(library.getByRole('button', { name: 'Ponów zapis', exact: true })).toBeEnabled();
  await expect(library.locator('.vct-errors')).not.toBeEmpty();
  await expect(library.locator('.vct-feedback')).not.toContainText('Zapisano');
  expect(await listTemplates(frame)).toEqual([]);
  expect(await rawTemplateStorage(frame)).toBeNull();
  expect(await frame.evaluate(() => window.VildaVault.getCarePlanTemplateCapability())).toMatchObject({ persistence: 'remote-ack' });
  cloud.setTemplateUnavailable(false);
  await library.getByRole('button', { name: 'Ponów zapis', exact: true }).click();
  await expect(library.locator('.vct-library-list')).toBeVisible();
  const requests = await frame.evaluate(() => window.__fictionalTemplateSaveRequests);
  expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  const items = await listTemplates(frame); expect(items).toHaveLength(1);
  expect((await getTemplate(frame, items[0].templateId)).syncState).toMatchObject({ pending: false, persistence: 'remote', state: 'synced' });
  expect(cloud.templatePolicies()[0].events).toHaveLength(1);
  expect(await rawTemplateStorage(frame)).toBeNull();
  expect(await rawCareStorage(frame)).toEqual(clinicalBefore);
});
