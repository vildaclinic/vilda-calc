import { expect, test } from '../support/test-czas.mjs';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import {
  chooseVisit, clickSave, currentClinicalState, currentVisit, fillMeasurement,
  exerciseReadOnlyHistory, expectNoHorizontalOverflow, patientRecord, prepareVisit, saveVisit,
} from '../support/visit-identity-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

function advancedClinicalState(payload) {
  const advanced = structuredClone(payload.advanced);
  // Klucz cache zawiera techniczny tryb oceny pokwitania loaded/restored.
  // Po F5 zmienia się tryb odtworzenia, choć wszystkie wejścia i wyniki pozostają te same.
  if (advanced?.data) delete advanced.data.calculationFingerprint;
  return advanced;
}

test('pierwszy zapis nowego pacjenta przypisuje patientId do istniejącego ID wizyty i pozostawia stan Zapisano', async ({ page }) => {
  const { frame, ids } = await createFictionalVault(page);
  await frame.evaluate(() => window.clearAllData());
  await frame.waitForFunction(() => !window.VildaPersistence.isClearInProgress());
  await frame.locator('#lastName').fill('Fikcyjna');
  await frame.locator('#firstName').fill('NowaWizyta');
  await frame.locator('#sex').selectOption('F');
  await frame.locator('#age').fill('11');
  await frame.locator('#ageMonths').fill('3');
  await fillMeasurement(frame, { height: '145', weight: '38' });
  const pending = await currentVisit(frame);
  expect(pending).toMatchObject({ version: 1, patientId: null, origin: 'explicit' });
  expect(await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();

  await clickSave(page);
  try {
    await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  } catch (error) {
    const diagnostic = await frame.evaluate(async () => {
      const patientId = sessionStorage.getItem('vildaCurrentPatientId');
      return {
        patientId, state: window.VildaSaveStatusIndicator.getState(),
        reference: JSON.parse(sessionStorage.getItem('vilda-save-ref-v1')),
        canonical: window.VildaSaveStatusIndicator._computeCanonicalFingerprint(),
        current: window.collectUserData(),
        saved: patientId ? (await window.VildaVault.getPatient(patientId)).snapshots[0].payload : null,
      };
    });
    await test.info().attach('first-save-state.json', { body: JSON.stringify(diagnostic, null, 2), contentType: 'application/json' });
    throw error;
  }
  const patientId = await frame.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'));
  expect(patientId).toBeTruthy();
  expect(Object.values(ids)).not.toContain(patientId);
  const first = (await patientRecord(frame, patientId)).snapshots[0];
  expect(first.payload.visit).toEqual({ ...pending, patientId });
  expect(await currentVisit(frame)).toEqual(first.payload.visit);
  expect(first.payload.user).toMatchObject({ firstName: 'NowaWizyta', lastName: 'Fikcyjna', sex: 'F' });
  expect(Number(first.payload.user.height)).toBe(145);
  expect(Number(first.payload.user.weight)).toBe(38);
  const second = await saveVisit(page, frame, patientId);
  expect(second.payload.visit).toEqual(first.payload.visit);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getState())).toBe('saved');
  await expect(page.locator('#vildaPatientChip')).toHaveClass(/vilda-save-state--saved/);
  expect(await frame.evaluate(() => JSON.parse(sessionStorage.getItem('vilda-save-ref-v1')).dirty)).toBe(false);
});

test('dwa zapisy są jedną wizytą; nowy pomiar tego samego dnia ma odrębne ID, kontynuacja zachowuje ID', async ({ page }) => {
  const { frame, ids } = await prepareVisit(page);
  const pendingVisit = await currentVisit(frame);
  expect(pendingVisit).toMatchObject({ version: 1, patientId: ids.a, origin: 'explicit' });
  expect(pendingVisit.visitId).toMatch(/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i);

  const first = await saveVisit(page, frame, ids.a);
  expect(first.payload.visit).toEqual(pendingVisit);
  await fillMeasurement(frame, { height: '159.5', weight: '47.5' });
  const correction = await saveVisit(page, frame, ids.a);
  expect(correction.snapshotId).not.toBe(first.snapshotId);
  expect(correction.payload.visit).toEqual(first.payload.visit);
  expect(Number(correction.payload.user.height)).toBe(159.5);
  expect(Number(first.payload.user.height)).toBe(159);

  await chooseVisit(frame, ids.a, 'new', { clear: true });
  const nextVisit = await currentVisit(frame);
  expect(nextVisit.visitId).not.toBe(first.payload.visit.visitId);
  expect(nextVisit.clinicalDateISO).toBe(first.payload.visit.clinicalDateISO);
  await fillMeasurement(frame, { height: '160', weight: '48' });
  const next = await saveVisit(page, frame, ids.a, { sameAgeHistoryConflict: true });
  expect(next.payload.visit).toEqual(nextVisit);
  expect(Number(next.payload.user.height)).toBe(160);
  expect(next.payload.advanced.data.measurements).toEqual(expect.arrayContaining([
    expect.objectContaining({ ageMonths: 156, height: 159.5, weight: 47.5 }),
  ]));

  await chooseVisit(frame, ids.a, 'restore', { clear: true });
  await expect(frame.locator('#height')).toHaveValue('160');
  await expect(frame.locator('#weight')).toHaveValue('48');
  expect(await currentVisit(frame)).toEqual(nextVisit);
  await fillMeasurement(frame, { height: '160.2', weight: '48' });
  const restoredSave = await saveVisit(page, frame, ids.a);
  expect(restoredSave.payload.visit).toEqual(nextVisit);

  const visits = await frame.evaluate(id => window.VildaVault.getPatientVisits(id), ids.a);
  const firstGroup = visits.find(visit => visit.visitId === pendingVisit.visitId);
  const secondGroup = visits.find(visit => visit.visitId === nextVisit.visitId);
  expect(firstGroup.sourceSnapshotIds).toEqual(expect.arrayContaining([first.snapshotId, correction.snapshotId]));
  expect(secondGroup.sourceSnapshotIds).toEqual(expect.arrayContaining([next.snapshotId, restoredSave.snapshotId]));
  expect(firstGroup.snapshotId).toBe(correction.snapshotId);
  expect(secondGroup.snapshotId).toBe(restoredSave.snapshotId);
  expect(firstGroup.revisionCount).toBe(2);
  expect(secondGroup.revisionCount).toBe(2);
});

test('ID wizyty i dane kliniczne przetrwają F5 oraz przejście Start–DocPro w powłoce aplikacji', async ({ page }) => {
  const { frame, ids } = await prepareVisit(page, { shell: true });
  const saved = await saveVisit(page, frame, ids.a);
  const identity = saved.payload.visit;
  const beforeReload = await currentClinicalState(frame);

  await page.reload({ waitUntil: 'load' });
  let owner = await shellFrame(page);
  await readyForPatient(owner);
  await expect(owner.locator('#height')).toHaveValue('159');
  await expect(owner.locator('#weight')).toHaveValue('47');
  expect(await currentVisit(owner)).toEqual(identity);
  const afterReload = await currentClinicalState(owner);
  expect(afterReload.user).toEqual(beforeReload.user);
  expect(advancedClinicalState(afterReload)).toEqual(advancedClinicalState(beforeReload));
  expect(afterReload.chartCreator).toEqual(beforeReload.chartCreator);
  expect((await patientRecord(owner, ids.a)).snapshots.length).toBe(2);

  await page.evaluate(() => window.VildaShell.navigate('docpro'));
  owner = await shellFrame(page, 'DocPro');
  await readyForPatient(owner);
  const confirmation = owner.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(owner.locator('#height')).toHaveValue('159');
  await expect(owner.locator('#weight')).toHaveValue('47');
  expect(await currentVisit(owner)).toEqual(identity);
  const docpro = await currentClinicalState(owner);
  expect(docpro.user).toEqual(beforeReload.user);
  expect(advancedClinicalState(docpro)).toEqual(advancedClinicalState(beforeReload));
  expect(docpro.chartCreator).toEqual(beforeReload.chartCreator);

  const second = await saveVisit(page, owner, ids.a);
  expect(second.payload.visit).toEqual(identity);
  const visits = await owner.evaluate(id => window.VildaVault.getPatientVisits(id), ids.a);
  expect(visits.filter(visit => visit.visitId === identity.visitId)).toHaveLength(1);
  expect(visits.find(visit => visit.visitId === identity.visitId).revisionCount).toBe(2);
});

test('Historia wizyt pokazuje ostatnią wersję każdej wizyty bez wczytywania i zmiany danych pacjenta', async ({ page }) => {
  await exerciseReadOnlyHistory(page, { screenshotPath: test.info().outputPath('historia-wizyt-desktop.png') });
});

test('samodzielny przelicznik: dynamiczny loader udostępnia Kartę pacjenta i historię bez zmiany zapisanej wizyty', async ({ page }) => {
  const { frame, ids } = await prepareVisit(page);
  const saved = await saveVisit(page, frame, ids.a);
  const html = await (await page.request.get('/przelicznik-jednostek.html')).text();
  expect(html, 'strona rzeczywiście korzysta z loadera, nie ze statycznego AuthUI')
    .not.toMatch(/<script\b[^>]*\bsrc=["'][^"']*vilda_(?:auth_ui|visit_context|visit_history_ui)\.js/u);
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaAuthUI?.isBootReady()
    && window.VildaVault?.isUnlocked() && window.VildaVisitContext && window.VildaVisitHistory
    && !document.documentElement.classList.contains('vilda-auth-locked'));
  const dependencies = await page.evaluate(() => {
    const scripts = Array.from(document.scripts, script => new URL(script.src || location.href).pathname.split('/').pop());
    const css = document.querySelector('link[href*="vilda_visit_history_ui.css"]');
    return {
      context: scripts.indexOf('vilda_visit_context.js'),
      history: scripts.indexOf('vilda_visit_history_ui.js'), auth: scripts.indexOf('vilda_auth_ui.js'),
      cssReady: Boolean(css?.sheet),
    };
  });
  expect(dependencies.context).toBeGreaterThanOrEqual(0);
  expect(dependencies.history).toBeGreaterThanOrEqual(0);
  expect(dependencies.context).toBeLessThan(dependencies.auth);
  expect(dependencies.history).toBeLessThan(dependencies.auth);
  expect(dependencies.cssReady).toBe(true);
  const session = () => page.evaluate(() => ({
    patientId: sessionStorage.getItem('vildaCurrentPatientId'),
    main: window.VildaPersistence.readMainSession(),
    choice: sessionStorage.getItem('vildaLoadChoiceV1'),
  }));
  const before = await session();
  expect(before.patientId).toBe(ids.a);
  expect(before.main.visit).toEqual(saved.payload.visit);
  const vaultBefore = await patientRecord(page, ids.a);

  await page.getByRole('button', { name: 'Karta pacjenta — Fikcyjny Antoni', exact: true }).click();
  await page.getByRole('button', { name: 'Historia wizyt', exact: true }).click();
  const dialog = page.locator('.vvisit-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.vvisit-visit')).toHaveCount(2);
  await expectNoHorizontalOverflow(page, dialog);
  for (let index = 0; index < 2; index++) {
    await dialog.locator('.vvisit-visit').nth(index).click();
    await expect(dialog.locator('.vvisit-visit[aria-pressed="true"]')).toHaveCount(1);
    expect(await session()).toEqual(before);
  }
  await expect(dialog.locator('.vvisit-detail')).toContainText('158 cm');
  await page.screenshot({ path: test.info().outputPath('historia-wizyt-dynamiczny-loader.png') });
  await dialog.locator('.vvisit-close').click();
  await expect(dialog).toHaveCount(0);
  expect(await session()).toEqual(before);
  expect(await patientRecord(page, ids.a)).toEqual(vaultBefore);
});
