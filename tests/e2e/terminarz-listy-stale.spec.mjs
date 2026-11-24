import { expect, test } from '../support/test-czas.mjs';
import {
  addWaitingPatient, createList, exerciseWaitlistEditor, getNote, listMetadata,
  openWaitlists, reloadWaitlists, seedPatients, waitlistCard,
} from '../support/terminarz-waitlist-fixture.mjs';

test('lista: autocomplete nie przesuwa edytora, wybór zamyka wyniki, a edycja priorytetu zachowuje notatkę', async ({ page }) => {
  await exerciseWaitlistEditor(page);
});

test('nowa pusta lista zwykła i stała zapisują odrębny wybór, który przeżywa przeładowanie', async ({ page }) => {
  const { userId } = await openWaitlists(page);
  const ordinary = 'Fikcyjna lista zwykła';
  const permanent = 'Fikcyjna lista stała';
  await createList(page, ordinary, false);
  await createList(page, permanent, true);
  const saved = Object.values(await listMetadata(page));
  expect(saved.find(list => list.label === ordinary).permanent).toBe(false);
  expect(saved.find(list => list.label === permanent).permanent).toBe(true);
  await expect(waitlistCard(page, ordinary).locator('.tz-wl__row')).toHaveCount(0);
  await expect(waitlistCard(page, permanent).locator('.tz-wl__cmeta')).toContainText('Lista stała');
  await reloadWaitlists(page, userId);
  await expect(waitlistCard(page, ordinary)).toBeVisible();
  await expect(waitlistCard(page, permanent)).toBeVisible();
  expect(Object.values(await listMetadata(page)).map(list => [list.label, list.permanent]).sort())
    .toEqual([[ordinary, false], [permanent, true]].sort());
});

test('umówienie ostatniego pacjenta ostrzega i usuwa zwykłą listę, zachowując stałą i dawną bez flagi', async ({ page }) => {
  const { userId, dialogs } = await openWaitlists(page);
  const [patient] = await seedPatients(page);
  const ordinary = 'Fikcyjna lista jednorazowa';
  const permanent = 'Fikcyjna lista powtarzalna';
  const legacy = 'Fikcyjna dawna lista';
  await createList(page, ordinary, false);
  await createList(page, permanent, true);
  // An older client's real sync payload has no permanent flag. Exercise the
  // production merge API, rather than simulating the new interpretation in a stub.
  await page.evaluate(async label => {
    const payload = await window.VildaVault.exportSyncPayload();
    const time = new Date().toISOString();
    const lists = JSON.parse(payload.userPreferences.wllists.value);
    lists['fikcyjna dawna lista'] = { label, createdAtISO: time, updatedAtISO: time };
    payload.userPreferences.wllists = { value: JSON.stringify(lists), updatedAtISO: time };
    await window.VildaVault.mergeSyncPayload(payload);
    await window.VildaTerminarz.refresh();
  }, legacy);
  await expect(waitlistCard(page, legacy)).toBeVisible();
  await expect(waitlistCard(page, legacy).locator('.tz-wl__cmeta')).toContainText('Lista stała');

  const noteIds = {};
  for (const label of [ordinary, permanent, legacy]) {
    noteIds[label] = await addWaitingPatient(page, label, patient, `Fikcyjna notatka: ${label}`);
  }
  const date = '2027-04-12';
  for (const label of [ordinary, permanent, legacy]) {
    await waitlistCard(page, label).locator('[data-wl-schedall]').click();
    const batch = page.locator('#tzWlBatchOverlay');
    await expect(batch).toBeVisible();
    const notice = batch.locator('#tzWlbListNotice');
    if (label === ordinary) {
      await expect(notice).toContainText(label);
      await expect(notice).toContainText('zostanie usunięta');
      await batch.locator('#tzWlbCancel2').click();
      await expect(batch).toHaveCount(0);
      expect((await getNote(page, noteIds[label])).dueDateISO).toBeFalsy();
      await expect(waitlistCard(page, label)).toBeVisible();
      await waitlistCard(page, label).locator('[data-wl-schedall]').click();
      await expect(notice).toBeVisible();
    } else {
      await expect(batch).not.toContainText('zostanie usunięta');
    }
    await batch.locator('#tzWlbDate').fill(date);
    await batch.locator('#tzWlbSave2').click();
    await expect(batch).toHaveCount(0);
    await expect.poll(async () => String((await getNote(page, noteIds[label])).dueDateISO).slice(0, 10)).toBe(date);
    expect((await getNote(page, noteIds[label])).body).toBe(`Fikcyjna notatka: ${label}`);
    if (label === ordinary) await expect(waitlistCard(page, label)).toHaveCount(0);
    else {
      await expect(waitlistCard(page, label)).toBeVisible();
      await expect(waitlistCard(page, label).locator('.tz-wl__row')).toHaveCount(0);
    }
  }
  await reloadWaitlists(page, userId);
  await expect(waitlistCard(page, ordinary)).toHaveCount(0);
  await expect(waitlistCard(page, permanent)).toBeVisible();
  await expect(waitlistCard(page, legacy)).toBeVisible();
  expect(Object.values(await listMetadata(page)).map(list => list.label).sort()).toEqual([permanent, legacy].sort());
  expect(dialogs.filter(dialog => dialog.type === 'alert')).toEqual([]);
});
