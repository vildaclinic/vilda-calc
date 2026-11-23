import { expect, test } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
test.setTimeout(150_000);

test('a result received during a new visit keeps the old reminder origin and its independent receipt date', { tag: '@gabinet-webkit' }, async ({ page }) => {
  const { frame, ids } = await prepareGabinet(page);
  const title = 'Fikcyjne zlecenie wyniku z dawnej wizyty';
  const seed = await frame.evaluate(async ({ patientId, title }) => {
    const vault = window.VildaVault, old = (await vault.getPatientVisits(patientId))[0];
    const visitContext = { version: 1, visitId: old.visitId, clinicalDateISO: old.clinicalDateISO };
    const receipt = await vault.savePatientNoteOnce({ id: crypto.randomUUID(), patientId, title,
      body: 'Fikcyjne wcześniejsze zlecenie.', category: 'wynik-badania',
      dueDateISO: new Date().toISOString().slice(0, 10), visitContext,
      reminderContext: { version: 1, kind: 'reminder' } });
    return { parent: await vault.getPatientNote(receipt.id), snapshots: (await vault.getPatient(patientId)).snapshots,
      visits: await vault.getPatientVisits(patientId) };
  }, { patientId: ids.a, title });
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true }).click();
  await expect.poll(() => frame.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  const visit = await frame.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().visit);
  const currentOrigin = { version: 1, visitId: visit.visitId, clinicalDateISO: visit.clinicalDateISO };
  expect(visit.patientId).toBe(ids.a);
  expect(visit.visitId).not.toBe(seed.parent.visitContext.visitId);
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
  await header.getByRole('tab', { name: 'Przegląd', exact: true }).click();
  await frame.locator('#vhomePatientOverview select.vhome-b1-mobile-select').selectOption('reminders');
  await frame.locator('#vhomePatientRemindersSlot').getByRole('button', { name: new RegExp(title) }).click();
  const reminders = page.locator('dialog.vhome-reminders-dialog');
  await reminders.getByRole('button', { name: 'Dodaj wynik do kartoteki', exact: true }).click();
  const outcome = page.getByRole('dialog', { name: 'Dodaj wynik do kartoteki', exact: true });
  await expect(outcome).toBeVisible({ timeout: 15_000 });
  const receiptDate = new Date(visit.clinicalDateISO + 'T12:00:00Z');
  receiptDate.setUTCDate(receiptDate.getUTCDate() - 2);
  const received = receiptDate.toISOString().slice(0, 10);
  expect(received).not.toBe(visit.clinicalDateISO);
  const body = 'Fikcyjny wynik opisowy otrzymany podczas obecnej wizyty.';
  await outcome.getByLabel('Opis otrzymanego wyniku', { exact: true }).fill(body);
  await outcome.getByLabel('Data otrzymania wyniku', { exact: true }).fill(received);
  await outcome.getByRole('button', { name: 'Zapisz wynik', exact: true }).click();
  await expect(outcome).toBeHidden();
  const saved = await frame.evaluate(async ({ patientId, parentId }) => {
    const vault = window.VildaVault, parent = await vault.getPatientNote(parentId);
    return { parent, result: await vault.getPatientNote(parent.reminderContext.resultNoteId),
      snapshots: (await vault.getPatient(patientId)).snapshots, visits: await vault.getPatientVisits(patientId) };
  }, { patientId: ids.a, parentId: seed.parent.id });
  expect(saved.parent.visitContext).toEqual(seed.parent.visitContext);
  expect(saved.parent).toMatchObject({ id: seed.parent.id, title: seed.parent.title,
    dueDateISO: seed.parent.dueDateISO, createdAtISO: seed.parent.createdAtISO });
  expect(saved.parent.completedAtISO).toBeTruthy();
  expect(saved.result).toMatchObject({ patientId: ids.a, category: 'wynik-badania', visitContext: currentOrigin,
    clinicalDateISO: null, reminderContext: { dateISO: received } });
  expect(saved.result.body).toContain(body);
  expect(saved.snapshots.filter(row => row.payload?.visit?.visitId !== visit.visitId)).toEqual(seed.snapshots);
  expect(saved.visits.filter(row => row.visitId !== visit.visitId)).toEqual(seed.visits);
  expect(saved.visits.filter(row => row.visitId === visit.visitId)).toHaveLength(1);
  expect(saved.snapshots).toHaveLength(seed.snapshots.length + 1);
});
