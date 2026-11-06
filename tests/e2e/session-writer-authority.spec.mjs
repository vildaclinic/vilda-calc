import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { prepareDocProUserFlow, readyClearPage } from '../support/clear-current-state-fixture.mjs';
import { observeRealSave, saveByVisibleMenu } from '../support/save-commit-reference-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', chwila: '2026-11-06T11:00:00.000Z' });
test.setTimeout(150_000);

// Observe real persistence effects, including a temporary rollback that another
// pane repairs before a final-state assertion. No facade or payload is replaced.
async function observeMainWrites(frame) {
  await frame.evaluate(() => {
    if (window.__sessionWriterProbe) return;
    const nativeSet = Storage.prototype.setItem;
    const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
    const probe = window.__sessionWriterProbe = { writes: [], armed: false };
    Storage.prototype.setItem = function (...args) {
      if (!probe.armed || !['vildaMainSessionV1', 'sharedUserData'].includes(String(args[0]))) return nativeSet.apply(this, args);
      const persistence = window.VildaPersistence;
      const before = clone(persistence.readMainSession());
      const sharedBefore = clone(persistence.readShared());
      const result = nativeSet.apply(this, args);
      probe.writes.push({
        key: String(args[0]), at: performance.timeOrigin + performance.now(), pane: window.frameElement?.title,
        hidden: window.frameElement?.hidden, owner: window.VildaPanelPacjent.wlasciciel(),
        stale: window.VildaPanelPacjent.nieaktualny(),
        sequence: window.VildaDataImportExport.getApplyLoadedDataSequence(),
        before, after: clone(persistence.readMainSession()),
        sharedBefore, sharedAfter: clone(persistence.readShared()), stack: new Error().stack,
      });
      return result;
    };
  });
}

async function reloadAsNewVisit(frame, patientId) {
  await frame.evaluate(id => window.VildaAuthUI.showPatientCard(id,
    payload => window.applyLoadedData(payload), null), patientId);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().ready)).toBe(true);
  await frame.getByRole('button', { name: 'Wczytaj tego pacjenta', exact: true }).click();
  const choice = frame.locator('#vildaLoadChoiceModal');
  const repeat = frame.getByRole('button', { name: 'Wczytaj ponownie', exact: true });
  const discard = frame.getByRole('button', { name: 'Odrzuć zmiany i wczytaj', exact: true });
  await expect(choice.or(repeat).or(discard)).toBeVisible();
  if (await repeat.isVisible()) await repeat.click();
  else if (await discard.isVisible()) await discard.click();
  await expect(choice).toBeVisible();
  await frame.locator('#vildaLcmNew').click();
  await expect(choice).toHaveCount(0);
  await readyClearPage(frame);
  await expect(frame.locator('#height')).toHaveValue('');
  await expect(frame.locator('#weight')).toHaveValue('');
}

const readModel = frame => frame.evaluate(() => {
  const live = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
  // Export-capture time is produced by this read itself, not a clinical input.
  delete live.timestampISO;
  return ({
  main: window.VildaPersistence.readMainSession(),
  shared: window.VildaPersistence.readShared(),
  controls: Object.fromEntries(['age', 'ageMonths', 'height', 'weight', 'dob', 'sex', 'lastName', 'firstName']
    .map(id => [id, document.getElementById(id)?.value ?? null])),
  live,
  patientId: sessionStorage.getItem('vildaCurrentPatientId'),
  owner: window.VildaPanelPacjent.wlasciciel(), stale: window.VildaPanelPacjent.nieaktualny(),
  hidden: window.frameElement.hidden,
}); });

for (const driver of ['forced flush', 'delayed input/change']) {
test(`${driver}: hidden same-patient DocPro cannot replace a newer Start visit or its archived measurement`, async ({ page, context }) => {
  await context.route(/https?:\/\/[^/]+\.workers\.dev(?:\/|$)/, route => route.fulfill({
    status: 404, headers: { 'access-control-allow-origin': '*' }, body: '{}',
  }));
  await context.routeWebSocket(/wss?:\/\/[^/]+\.workers\.dev(?:\/|$)/, socket => socket.close());
  const fixture = await createFictionalVault(page, { shell: true });
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  await prepareDocProUserFlow(docpro);
  await loadPatient(docpro, fixture.ids.a, 'restore');
  await readyClearPage(docpro);
  await expect(docpro.locator('#height')).toHaveValue('158');
  await page.evaluate(() => window.VildaShell.navigate('start'));
  const start = await shellFrame(page, 'Start');
  await readyClearPage(start);
  await observeMainWrites(start);
  await observeMainWrites(docpro);
  await reloadAsNewVisit(start, fixture.ids.a);
  await start.locator('#height').fill('160');
  await start.locator('#weight').fill('48');
  await observeRealSave(start);
  await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.getSaveReadiness().ready)).toBe(true);
  await saveByVisibleMenu(page, start);
  await expect.poll(() => start.evaluate(() => window.VildaDataImportExport.isSaveUserDataPending())).toBe(false);
  const stored = await start.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a);
  const before = await readModel(start), hidden = await readModel(docpro);
  await test.info().attach('new-visit-and-hidden-old-visit', { contentType: 'application/json',
    body: JSON.stringify({ before, hidden }, null, 2) });
  const today = await start.evaluate(() => { const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; });
  expect(before.main.user.measuredAtISO).toBe(today);
  expect(before.main.advanced.data.measurements).toContainEqual(expect.objectContaining({ ageMonths: 156, height: 158, weight: 46 }));
  expect(hidden.hidden).toBe(true);
  expect(hidden.patientId).toBe(fixture.ids.a);
  expect(hidden.owner).toBe(fixture.ids.a);
  expect(hidden.live.advanced.data.measurements, 'the hidden pane still owns the older visit without the archived current measurement')
    .not.toContainEqual(expect.objectContaining({ ageMonths: 156, height: 158, weight: 46 }));
  for (const frame of [start, docpro]) await frame.evaluate(() => { window.__sessionWriterProbe.armed = true; });

  // The same public persistence entry used by pending producer callbacks and
  // shell handoff must reject the hidden older visit, even with the same PID.
  let attempted = null;
  if (driver === 'forced flush') attempted = await docpro.evaluate(() => window.vildaSession.saveNow({ force: true }));
  else await docpro.evaluate(async () => {
    // A producer replay carries the same local value through the real capture
    // listeners. Do not assign patient data, status flags or source ownership.
    const field = document.getElementById('ageMonths');
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    // Observe beyond the actual 300ms autosave, rather than calling its callback.
    await new Promise(resolve => { setTimeout(resolve, 700); });
  });
  const after = await readModel(start);
  const writes = (await Promise.all([start, docpro].map(frame => frame.evaluate(() => window.__sessionWriterProbe.writes))))
    .flat().sort((a, b) => a.at - b.at);
  await test.info().attach('hidden-writer-effects', { contentType: 'application/json',
    body: JSON.stringify({ attempted, after, writes }, null, 2) });
  if (driver === 'forced flush') expect(attempted, 'old hidden DocPro must not publish its old visit').toBe(false);
  expect(writes.filter(row => row.pane === 'DocPro')).toEqual([]);
  expect(after.main).toEqual(before.main);
  expect(after.shared).toEqual(before.shared);
  expect(after.controls).toEqual(before.controls);
  expect(after.live).toEqual(before.live);
  expect(await start.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(stored);

  // A real active edit remains saveable; the fence does not disable autosave.
  await start.locator('#height').fill('161');
  await start.locator('#weight').fill('49');
  await expect.poll(() => start.evaluate(() => window.VildaPersistence.readMainSession().user.height)).toBe(161);
  await expect.poll(() => start.evaluate(() => window.VildaPersistence.readMainSession().user.weight)).toBe(49);
  expect((await readModel(start)).main.advanced.data.measurements)
    .toContainEqual(expect.objectContaining({ ageMonths: 156, height: 158, weight: 46 }));
  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  const currentDocpro = await shellFrame(page, 'DocPro');
  await prepareDocProUserFlow(currentDocpro);
  await expect(currentDocpro.locator('#height')).toHaveValue('161');
  await expect(currentDocpro.locator('#weight')).toHaveValue('49');
  expect((await readModel(currentDocpro)).live.user.measuredAtISO).toBe(today);
  expect(await currentDocpro.evaluate(id => window.VildaVault.getPatient(id), fixture.ids.a)).toEqual(stored);
});

}
