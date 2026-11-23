import { expect, test } from '@playwright/test';
import { prepareGabinet, choosePatient } from '../support/gabinet-patient-fixture.mjs';

test.use({ serviceWorkers: 'block', actionTimeout: 20_000, contextOptions: { reducedMotion: 'reduce' } });
test.setTimeout(180_000);

const headerOf = frame => frame.locator('#vhomeGabinetHeader');

async function editVisit(frame, visitId) {
  const header = headerOf(frame);
  await header.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
  const history = frame.locator('#vhomeVisitHistory');
  await history.getByRole('button', { name: 'Lista', exact: true }).click();
  await history.locator(`.vhs-list button[data-visit-id="${visitId}"]`).click();
  const detail = frame.locator('#vhomeVisitDetail');
  await detail.getByRole('button', { name: 'Edytuj wizytę', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz zmiany', exact: true })).toBeEnabled({ timeout: 15_000 });
}

async function openTrashConfirmation(frame) {
  const header = headerOf(frame);
  await header.getByRole('button', { name: 'Działania', exact: true }).click();
  await header.getByText('Przenieś wizytę do kosza', { exact: true }).click();
  return frame.getByRole('dialog', { name: 'Przenieść wizytę do kosza?' });
}

async function restoreVisit(frame, expectedDate) {
  const header = headerOf(frame);
  await header.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
  await frame.locator('#vhomeVisitHistory').getByRole('button', { name: 'Kosz wizyt', exact: true }).click();
  const trash = frame.getByRole('dialog', { name: 'Kosz wizyt' });
  await expect(trash).toContainText(expectedDate);
  await trash.getByRole('button', { name: 'Przywróć wizytę', exact: true }).click();
  await expect(trash).toBeHidden();
  await expect(header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true })).toBeEnabled({ timeout: 15_000 });
}

function activeVisits(frame, patientId) {
  return frame.evaluate(async id => (await window.VildaVault.getPatientVisits(id)).map(
    row => ({ id: row.visitId, date: row.clinicalDateISO, weight: row.payload.user.weight, records: row.revisionCount }),
  ), patientId);
}

test('editing a historical visit can cancel, trash all its versions and restore the previous comparison', async ({ page }) => {
  const { frame, ids } = await prepareGabinet(page);
  await frame.evaluate(async patientId => {
    const vault = window.VildaVault;
    const [base] = await vault.getPatientVisits(patientId);
    for (const [day, weights] of [['2026-09-18', [49, 50]], ['2026-11-15', [54]]]) {
      const visit = window.VildaVisitContext.create({ patientId, clinicalDateISO: day });
      for (const weight of weights) {
        await vault.savePatient({ ...base.payload, visit, user: { ...base.payload.user, measuredAtISO: day, weight } },
          { patientId, dedup: false });
      }
    }
  }, ids.a);
  const all = await activeVisits(frame, ids.a);
  expect(all.map(row => [row.weight, row.records])).toEqual([[54, 1], [50, 2], [46, 1]]);
  const [latest, target, earlier] = all;
  await choosePatient(frame, 'Antoni');
  const header = headerOf(frame);
  const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
  const comparison = frame.locator('#vhomeVisitComparison');
  const weightDelta = comparison.locator('[data-comparison-metric="weight"]');
  const actions = header.getByRole('button', { name: 'Działania', exact: true });
  await expect(actions).toBeHidden();
  await analysis.click();
  await expect(comparison).toContainText('18.09.2026');
  await expect(weightDelta).toContainText('50');
  await editVisit(frame, target.id);
  await analysis.click();
  const weight = frame.locator('#weight');
  await weight.fill('52');
  const confirmation = await openTrashConfirmation(frame);
  await expect(confirmation).toContainText('Antoni');
  await expect(confirmation).toContainText('Fikcyjny');
  await expect(confirmation).toContainText('18.09.2026');
  await confirmation.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(confirmation).toBeHidden();
  await expect(actions).toBeFocused();
  await expect(weight).toHaveValue('52');
  expect(await activeVisits(frame, ids.a)).toEqual(all);

  await (await openTrashConfirmation(frame)).getByRole('button', { name: 'Przenieś do kosza', exact: true }).click();
  await expect(confirmation).toBeHidden({ timeout: 15_000 });
  await expect(header.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await expect(actions).toBeHidden();
  await expect.poll(() => activeVisits(frame, ids.a)).toEqual([latest, earlier]);
  await analysis.click();
  await expect(comparison).toContainText('17.06.2026');
  await expect(comparison).not.toContainText('18.09.2026');
  await expect(weightDelta).toContainText('46');
  await expect(weightDelta).toContainText('54');

  await restoreVisit(frame, '18.09.2026');
  await expect.poll(() => activeVisits(frame, ids.a)).toEqual(all);
  await analysis.click();
  await expect(comparison).toContainText('18.09.2026');
  await expect(weightDelta).toContainText('50');

  await editVisit(frame, latest.id);
  await (await openTrashConfirmation(frame)).getByRole('button', { name: 'Przenieś do kosza', exact: true }).click();
  await expect.poll(() => activeVisits(frame, ids.a)).toEqual([target, earlier]);
  await expect(header.getByRole('tab', { name: 'Przegląd' })).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 });
  await analysis.click();
  await expect(weight).toHaveValue('50');
  await expect(comparison).toContainText('17.06.2026');
  await expect(weightDelta).toContainText('46');
});

test('trashing the sole visit leaves the patient available for a new consultation and restoration on a phone', { tag: '@gabinet-webkit' }, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { frame, ids } = await prepareGabinet(page);
  const original = await frame.evaluate(async patientId => {
    const vault = window.VildaVault;
    const payload = structuredClone((await vault.getPatient(patientId)).snapshots[0].payload);
    Object.assign(payload.advanced, { motherHeight: 166, fatherHeight: 183 });
    Object.assign(payload.advanced.data, { motherHeight: 166, fatherHeight: 183 });
    payload.perinatal = { gestationalWeeks: 34, gestationalDays: 2, birthWeightG: 1650,
      birthLengthCm: 41, birthHeadCircCm: 29, gravidity: 2, parity: 1 };
    payload.clinical = { ...payload.clinical, downSyndrome: true };
    await vault.savePatient(payload, { patientId, dedup: false });
    const patient = await vault.getPatient(patientId);
    return { profile: patient.profile,
      snapshots: patient.snapshots.map(({ snapshotId, payload }) => ({ snapshotId, payload }))
        .sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)) };
  }, ids.b);
  expect(original.profile.status).toBe('legacy');
  expect(original.profile.history).toHaveLength(0);
  expect(original.profile.data).toMatchObject({ advanced: { motherHeight: 166, fatherHeight: 183 },
    perinatal: { gestationalWeeks: 34, birthWeightG: 1650 }, clinical: { downSyndrome: true } });
  const profile = () => frame.evaluate(async id => (await window.VildaVault.getPatient(id)).profile.data, ids.b);
  const note = 'Fikcyjna notatka pacjentki pozostaje w kartotece';
  await frame.evaluate(({ patientId, title }) => window.VildaVault.savePatientNote({
    patientId, title, body: 'Fikcyjny wywiad ogólny', category: 'ogolna',
  }), { patientId: ids.b, title: note });
  const all = await activeVisits(frame, ids.b);
  expect(all).toHaveLength(1);
  await choosePatient(frame, 'Beata');
  await editVisit(frame, all[0].id);
  const confirm = await openTrashConfirmation(frame);
  await expect(confirm).toContainText('Beata');
  await expect(confirm).toContainText('17.06.2026');
  await confirm.getByRole('button', { name: 'Przenieś do kosza', exact: true }).click();
  await expect(confirm).toBeHidden({ timeout: 15_000 });
  await expect.poll(() => activeVisits(frame, ids.b)).toEqual([]);
  expect(await profile()).toEqual(original.profile.data);
  const header = headerOf(frame);
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible({ timeout: 15_000 });
  await expect(header).toContainText('Beata');
  await header.getByRole('button', { name: /Gabinet/ }).click();
  await choosePatient(frame, 'Beata');
  expect(await profile()).toEqual(original.profile.data);
  const patientCard = frame.locator('#vhomePatientOverview');
  await expect(patientCard).toContainText('Brak zapisanych wizyt.');
  await patientCard.getByRole('combobox', { name: 'Sekcja karty' }).selectOption({ label: 'Notatki' });
  await expect(patientCard).toContainText(note);
  const start = header.getByRole('button', { name: 'Rozpocznij nową wizytę', exact: true });
  await expect(start).toBeEnabled();
  const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
  await analysis.click();
  await expect(frame.locator('#weight')).toHaveValue('');
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#vhomeVisitComparison [data-comparison-metric]')).toHaveCount(0);
  await start.click();
  const save = header.getByRole('button', { name: 'Zapisz wizytę', exact: true });
  await expect(save).toBeEnabled({ timeout: 15_000 });
  expect(await frame.evaluate(() => ({
    advanced: { motherHeight: window.lastLoadedData.advanced.motherHeight,
      fatherHeight: window.lastLoadedData.advanced.fatherHeight },
    perinatal: window.lastLoadedData.perinatal,
    clinical: { downSyndrome: window.lastLoadedData.clinical.downSyndrome },
  }))).toEqual({ advanced: original.profile.data.advanced,
    perinatal: original.profile.data.perinatal, clinical: original.profile.data.clinical });
  await expect(frame.locator('#advMotherHeight')).toHaveValue('166');
  await expect(frame.locator('#advFatherHeight')).toHaveValue('183');
  await expect.poll(() => frame.evaluate(() => window.VildaDsSource.getState().population)).toBe('DS');
  await expect(header.getByRole('button', { name: 'Działania', exact: true })).toBeHidden();
  await save.click();
  await expect(start).toBeEnabled({ timeout: 15_000 });
  const fresh = await activeVisits(frame, ids.b);
  expect(fresh).toHaveLength(1);
  expect(fresh[0].id).not.toBe(all[0].id);
  expect(fresh[0].weight).toBeNull();
  await restoreVisit(frame, '17.06.2026');
  await expect.poll(() => activeVisits(frame, ids.b)).toHaveLength(2);
  expect(await activeVisits(frame, ids.b)).toEqual(expect.arrayContaining([fresh[0], all[0]]));
  expect(await profile()).toEqual(original.profile.data);
  const restored = await frame.evaluate(async ({ patientId, snapshotIds }) =>
    (await window.VildaVault.getPatient(patientId)).snapshots.filter(row => snapshotIds.includes(row.snapshotId))
      .map(({ snapshotId, payload }) => ({ snapshotId, payload }))
      .sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)),
  { patientId: ids.b, snapshotIds: original.snapshots.map(row => row.snapshotId) });
  // Native Restore renews the sync and pin clocks; every other payload field stays intact.
  expect(restored).toEqual(original.snapshots.map(row => {
    const actual = restored.find(snapshot => snapshot.snapshotId === row.snapshotId);
    expect(actual).toBeDefined();
    expect(Date.parse(actual.payload._contentAtISO)).toBeGreaterThan(Date.parse(row.payload._contentAtISO));
    expect(actual.payload._pinnedState.at).toBe(actual.payload._contentAtISO);
    return { ...row, payload: { ...row.payload, _contentAtISO: actual.payload._contentAtISO,
      _pinnedState: { ...row.payload._pinnedState, at: actual.payload._pinnedState.at } } };
  }));
});

test('a trash confirmation cannot remove another revision or survive a patient switch', async ({ page }) => {
  const { frame, ids } = await prepareGabinet(page);
  await choosePatient(frame, 'Antoni');
  const [visit] = await activeVisits(frame, ids.a);
  await editVisit(frame, visit.id);
  const consent = await frame.evaluateHandle(id => window.VildaHomeEncounter.captureVisitTrash(id), ids.a);
  const confirmation = await openTrashConfirmation(frame);
  await frame.evaluate(async id => {
    const vault = window.VildaVault;
    const [row] = await vault.getPatientVisits(id);
    const payload = { ...row.payload, user: { ...row.payload.user, weight: 47 } };
    await vault.updateSnapshotPayload(id, row.snapshotId, payload, { expectedVisit: {
      visitId: row.visitId, revision: row.rev, isCurrent: () => true,
    } });
  }, ids.a);
  await confirmation.getByRole('button', { name: 'Przenieś do kosza', exact: true }).click();
  await expect(frame.locator('.vhome-gabinet-message')).toContainText('Nie przeniesiono wizyty');
  expect(await activeVisits(frame, ids.a)).toEqual([{ ...visit, weight: 47 }]);

  await headerOf(frame).getByRole('button', { name: /Gabinet/ }).click();
  await choosePatient(frame, 'Beata');
  expect(await consent.evaluate(ticket => ticket.isCurrent())).toBe(false);
  expect(await consent.evaluate(ticket => ticket.moveToTrash())).toBe(false);
  await consent.dispose();
  expect(await frame.evaluate(id => window.VildaVault.listTrashedVisits(id), ids.a)).toEqual([]);
  await expect(headerOf(frame)).toContainText('Beata');
});
