import { expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';
import { choosePatient } from '../support/gabinet-patient-fixture.mjs';
import { openMenuPatient, visibleChromeMenu } from '../support/chrome-menu-fixture.mjs';

test.use({ serviceWorkers: 'block' });
test.setTimeout(180_000);

async function prepareGabinet(page) {
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__VILDA_HOME_GABINET_PREVIEW__ = true;
    window.nativeVisitChooserCount = 0;
    // A chooser can be added and dismissed between two Playwright assertions.
    new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node.id === 'vildaLoadChoiceModal') window.nativeVisitChooserCount++;
        }
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol) ? route.continue() : route.abort();
  });
  const { ids } = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await page.reload({ waitUntil: 'load' });
  const start = await shellFrame(page);
  await readyForPatient(start);
  await expect(start.locator('#vhomeGabinetStart')).toBeVisible();
  return { start, ids };
}

async function selectFromDatabase(page, firstName) {
  const menu = await visibleChromeMenu(page);
  await menu.getByRole('button', { name: 'Baza pacjentów', exact: true }).click();
  // The shell keeps the list in DocPro when leaving would discard changes.
  const owner = page.frameLocator('iframe.app-pane:visible');
  const directory = owner.locator('.vilda-patient-database');
  await expect(directory.getByRole('heading', { name: 'Baza pacjentów', exact: true })).toBeVisible({ timeout: 15_000 });
  await clickDirectoryRow(directory, firstName);
}

async function clickDirectoryRow(directory, firstName) {
  await directory.locator('.pt-row', { hasText: firstName }).locator('.pt-row-open').click();
}

async function openDocPro(page) {
  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="docpro.html"]').click();
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  const confirmation = docpro.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  return docpro;
}

async function savedVisits(start, patientId) {
  return start.evaluate(async id => (await window.VildaVault.getPatient(id)).snapshots
    .map(({ snapshotId, rev, payload }) => ({
      snapshotId, rev, visitId: payload.visit.visitId, weight: payload.user.weight, height: payload.user.height,
    })), patientId);
}

async function expectNoLegacyChooser(page) {
  const origin = new URL(page.url()).origin;
  for (const frame of page.frames().filter(panel => new URL(panel.url()).origin === origin)) {
    expect(await frame.evaluate(() => window.nativeVisitChooserCount), frame.url()).toBe(0);
  }
}

async function expectOverview(start, id, name, weight) {
  const header = start.locator('#vhomeGabinetHeader');
  await expect(header.getByRole('heading', { name: new RegExp(name) })).toBeVisible({ timeout: 15_000 });
  await expect(start.locator('.vilda-patient-database')).toBeHidden();
  await expect(header.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(header.getByRole('button', { name: 'Nowa wizyta', exact: true })).toBeVisible();
  await expect(start.locator('#vhomePatientOverview > .vilda-auth-card')).toBeVisible();
  await expect(start.locator('#vildaLoadChoiceModal')).toBeHidden();
  await expect(start.locator('#weight')).toHaveValue(weight);
  expect(await start.evaluate(patientId => ({
    selected: sessionStorage.getItem('vildaCurrentPatientId'),
    mode: window.VildaHomeEncounter.state(patientId).mode,
  }), id)).toEqual({ selected: id, mode: 'browse' });
}

test('Gabinet opens the selected patient in Overview from the sidebar database on Start, DocPro and lab', async ({ page }) => {
  const { start, ids } = await prepareGabinet(page);
  const beforeA = await savedVisits(start, ids.a), beforeB = await savedVisits(start, ids.b);
  await selectFromDatabase(page, 'Antoni');
  await expectOverview(start, ids.a, 'Antoni', '46');

  await openDocPro(page);
  await selectFromDatabase(page, 'Beata');
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  await expectOverview(start, ids.b, 'Beata', '41');

  const menu = await visibleChromeMenu(page);
  await menu.locator('a[href="przelicznik-jednostek.html"]').click();
  await expect(page.locator('iframe.app-pane[title="Jednostki laboratoryjne"]')).toBeVisible();
  const lab = await shellFrame(page, 'Jednostki laboratoryjne');
  await lab.waitForFunction(() => window.VildaVault.isUnlocked() && window.VildaAuthUI?.isBootReady());
  await selectFromDatabase(page, 'Antoni');
  await expectOverview(start, ids.a, 'Antoni', '46');
  expect(await savedVisits(start, ids.a)).toEqual(beforeA);
  expect(await savedVisits(start, ids.b)).toEqual(beforeB);
  await expectNoLegacyChooser(page);
});

test('DocPro patient-card route keeps the active measurement-free visit and attaches its note without changing archived visits', async ({ page }) => {
  let { start, ids } = await prepareGabinet(page);
  await choosePatient(start, 'Antoni');
  const records = () => start.evaluate(async id => ({
    snapshots: (await window.VildaVault.getPatient(id)).snapshots,
    visits: await window.VildaVault.getPatientVisits(id),
  }), ids.a);
  const before = await records();
  await start.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await expect.poll(() => start.evaluate(id => window.VildaHomeEncounter.state(id).mode, ids.a)).toBe('new');
  const visit = await start.evaluate(() => window.VildaDataImportExport.captureCurrentUserDataReadOnly().visit);
  expect(visit).toMatchObject({ patientId: ids.a, origin: 'explicit' });
  expect(visit.visitId).toBeTruthy();
  await expect(start.locator('#height')).toHaveValue('');
  await expect(start.locator('#weight')).toHaveValue('');

  const docpro = await openDocPro(page);
  await expect(docpro.locator('#height')).toHaveValue('');
  await expect(docpro.locator('#weight')).toHaveValue('');
  await openMenuPatient(page);
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible({ timeout: 15_000 });
  start = await shellFrame(page);
  const header = start.locator('#vhomeGabinetHeader');
  await expect(header.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect.poll(() => start.evaluate(id => ({
    selected: sessionStorage.getItem('vildaCurrentPatientId'),
    mode: window.VildaHomeEncounter.state(id).mode,
    visitId: window.VildaHomeEncounter.state(id).visitId,
  }), ids.a)).toEqual({ selected: ids.a, mode: 'new', visitId: visit.visitId });
  await expect(start.locator('#height')).toHaveValue('');
  await expect(start.locator('#weight')).toHaveValue('');
  const overview = start.locator('#vhomePatientOverview');
  await overview.getByRole('tab', { name: 'Notatki', exact: true }).click();
  await overview.getByRole('button', { name: /Dodaj notatkę/ }).click();
  const editor = start.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible({ timeout: 15_000 });
  await expect(editor.locator('[name="b3-anchor"]')).toHaveCount(0);
  expect(await records()).toEqual(before);
  const title = 'Fikcyjna notatka DocPro z wizyty bez pomiarów';
  await editor.getByPlaceholder('np. Wprowadzono Euthyrox').fill(title);
  await editor.locator('textarea').first().fill('Fikcyjna konsultacja bez wprowadzania masy ani wzrostu.');
  await editor.getByLabel('Data badania lub zdarzenia (opcjonalnie)').fill('2025-12-19');
  await editor.getByRole('button', { name: 'Dodaj notatkę', exact: true }).click();
  await expect(editor).toHaveCount(0);
  const note = await start.evaluate(async ({ patientId, title }) =>
    (await window.VildaVault.listPatientNotesForPatient(patientId)).find(row => row.title === title),
  { patientId: ids.a, title });
  expect(note).toMatchObject({ patientId: ids.a, clinicalDateISO: '2025-12-19', visitContext: {
    version: 1, visitId: visit.visitId, clinicalDateISO: visit.clinicalDateISO,
  } });
  const after = await records();
  expect(after.snapshots.filter(row => row.payload?.visit?.visitId !== visit.visitId)).toEqual(before.snapshots);
  expect(after.visits.filter(row => row.visitId !== visit.visitId)).toEqual(before.visits);
  const recorded = after.visits.filter(row => row.visitId === visit.visitId);
  expect(recorded).toHaveLength(1);
  expect(recorded[0].payload.visit).toEqual(visit);
  expect(Number(recorded[0].payload.user.height || 0)).toBe(0);
  expect(Number(recorded[0].payload.user.weight || 0)).toBe(0);
  await expect(start.locator('#height')).toHaveValue('');
  await expect(start.locator('#weight')).toHaveValue('');
  await expect(docpro.locator('#height')).toHaveValue('');
  await expect(docpro.locator('#weight')).toHaveValue('');
  await expectNoLegacyChooser(page);
});

test('DocPro keeps an active visit on cancellation and saves its local measurements once before switching patients', async ({ page }) => {
  const { start, ids } = await prepareGabinet(page);
  await choosePatient(start, 'Antoni');
  const beforeA = await savedVisits(start, ids.a), beforeB = await savedVisits(start, ids.b);
  const header = start.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę', exact: true })).toBeVisible();
  const { visitId } = await start.evaluate(id => window.VildaHomeEncounter.state(id), ids.a);
  expect(visitId).toBeTruthy();
  const docpro = await openDocPro(page);
  await docpro.locator('#height').fill('159');
  await docpro.locator('#weight').fill('48');
  await selectFromDatabase(page, 'Beata');
  const guard = docpro.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem/ });
  await expect(guard).toBeVisible({ timeout: 15_000 });
  await guard.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(guard).toBeHidden();
  await expect(page.locator('iframe.app-pane[title="DocPro"]')).toBeVisible();
  await expect(docpro.locator('#weight')).toHaveValue('48');
  expect(await docpro.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.a);
  expect(await savedVisits(start, ids.a)).toEqual(beforeA);
  expect(await savedVisits(start, ids.b)).toEqual(beforeB);

  const directory = docpro.locator('.vilda-patient-database');
  if (await directory.isVisible()) await clickDirectoryRow(directory, 'Beata');
  else await selectFromDatabase(page, 'Beata');
  await expect(guard).toBeVisible();
  await guard.getByRole('button', { name: /^Zapisz.*i wczytaj/ }).click();
  await expect(page.locator('iframe.app-pane[title="Start"]')).toBeVisible();
  await expectOverview(start, ids.b, 'Beata', '41');

  const afterA = await savedVisits(start, ids.a);
  const newVisit = afterA.filter(row => row.visitId === visitId);
  expect(afterA.filter(row => row.visitId !== visitId)).toEqual(beforeA);
  expect(newVisit).toHaveLength(1);
  expect(Number(newVisit[0].weight)).toBe(48);
  expect(Number(newVisit[0].height)).toBe(159);
  expect(await savedVisits(start, ids.b)).toEqual(beforeB);
  await expectNoLegacyChooser(page);
});

for (const visitKind of ['new', 'edit']) {
  test(`Gabinet keeps the ${visitKind} visit and its measurements when the physician cancels a patient change`, async ({ page }) => {
    const { start, ids } = await prepareGabinet(page);
    await choosePatient(start, 'Antoni');
    const beforeA = await savedVisits(start, ids.a), beforeB = await savedVisits(start, ids.b);
    const header = start.locator('#vhomeGabinetHeader');
    const saveLabel = visitKind === 'new' ? 'Zapisz wizytę' : 'Zapisz zmiany';
    if (visitKind === 'new') {
      await header.getByRole('button', { name: 'Nowa wizyta', exact: true }).click();
    } else {
      await header.getByRole('tab', { name: 'Historia wizyt', exact: true }).click();
      await start.locator('#vhomeVisitHistory').getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
      await start.locator('#vhomeVisitDetail').getByRole('button', { name: 'Edytuj wizytę' }).click();
    }
    await expect(header.getByRole('button', { name: saveLabel, exact: true })).toBeVisible();
    await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
    await start.locator('#height').fill('159');
    await start.locator('#weight').fill('47');
    const current = () => start.evaluate(id => window.VildaHomeEncounter.state(id), ids.a);
    const working = await current();
    expect(working.mode).toBe(visitKind);
    expect(working.visitId).toBeTruthy();
    if (visitKind === 'edit') {
      await openDocPro(page);
    } else {
      await header.getByRole('tab', { name: 'Historia wizyt', exact: true }).click();
      const history = start.getByRole('tabpanel', { name: 'Historia wizyt', exact: true });
      await history.getByRole('button', { name: 'Otwórz podgląd wizyty' }).click();
      await start.locator('#vhomeVisitDetail').getByRole('button', { name: 'Edytuj wizytę' }).click();
      const editGuard = start.getByRole('dialog', { name: 'Zapisać zmiany w otwartej wizycie?', exact: true });
      await expect(editGuard).toBeVisible();
      await expect(history).toBeVisible();
      await editGuard.getByRole('button', { name: 'Anuluj', exact: true }).click();
      await expect(editGuard).toBeHidden();
      const detail = start.locator('#vhomeVisitDetail');
      await expect(detail).toBeVisible();
      await detail.getByRole('button', { name: 'Zamknij podgląd wizyty', exact: true }).click();
      await expect(history).toBeVisible();
      const analysis = header.getByRole('tab', { name: 'Analiza', exact: true });
      await analysis.click();
      await expect(analysis).toBeFocused();
      await expect(analysis).toHaveAttribute('aria-selected', 'true');
      expect(await current()).toEqual(working);
      await expect(start.locator('#height')).toHaveValue('159');
      await expect(start.locator('#weight')).toHaveValue('47');
    }
    await selectFromDatabase(page, 'Antoni');
    await expect(start.locator('#vhomePatientOverview > .vilda-auth-card')).toBeVisible({ timeout: 15_000 });
    await expect(start.locator('.vilda-patient-database')).toBeHidden();
    await expect(header.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(header.getByRole('button', { name: saveLabel, exact: true })).toBeVisible();
    expect(await current()).toEqual(working);
    await selectFromDatabase(page, 'Beata');
    const guard = start.getByRole('dialog', { name: /^Zapisać (wpisane dane|zmiany) przed wczytaniem/ });
    await expect(guard).toBeVisible({ timeout: 15_000 });
    await guard.getByRole('button', { name: 'Anuluj', exact: true }).click();
    await expect(guard).toBeHidden();
    expect(await start.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBe(ids.a);
    expect(await current()).toEqual(working);
    await expect(start.locator('#height')).toHaveValue('159');
    await expect(start.locator('#weight')).toHaveValue('47');
    expect(await savedVisits(start, ids.a)).toEqual(beforeA);
    expect(await savedVisits(start, ids.b)).toEqual(beforeB);
    await expectNoLegacyChooser(page);
  });
}

test('leaving rapid intake keeps a cancelled draft and clears discarded values before DocPro opens', async ({ page }) => {
  const { start } = await prepareGabinet(page);
  await start.locator('[data-entry="rapid"]').click();
  const name = start.locator('#firstName');
  await expect(name).toBeEditable();
  await name.fill('Szkic');
  const menu = await visibleChromeMenu(page);
  const link = menu.locator('a[href="docpro.html"]');
  const confirmLeave = page.waitForEvent('dialog').then(async dialog => {
    expect(dialog.message()).toContain('niezapisane dane');
    await dialog.dismiss();
  });
  await Promise.all([confirmLeave, link.click()]);
  await expect(name).toHaveValue('Szkic');
  await expect(page).toHaveURL(/#\/start$/);
  const menuAfterCancel = await visibleChromeMenu(page);
  const discard = page.waitForEvent('dialog').then(dialog => dialog.accept());
  await Promise.all([discard, menuAfterCancel.locator('a[href="docpro.html"]').click()]);
  const docpro = await shellFrame(page, 'DocPro');
  await readyForPatient(docpro);
  await expect(docpro.locator('#firstName')).toHaveValue('');
  expect(await docpro.evaluate(() => sessionStorage.getItem('vildaCurrentPatientId'))).toBeNull();
});
