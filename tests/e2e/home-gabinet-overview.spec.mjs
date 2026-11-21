import { expect, test } from '@playwright/test';
import { createFictionalVault, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(180_000);

async function prepare(page) {
  await page.addInitScript(() => {
    window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true;
    window.__VILDA_HOME_GABINET_PREVIEW__ = true;
  });
  await page.route('**/*', route => {
    const { hostname, protocol } = new URL(route.request().url());
    return hostname === '127.0.0.1' || ['data:', 'blob:'].includes(protocol) ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell: true, waitForAccountReadyBeforeReload: true });
  await page.reload({ waitUntil: 'load' });
  const frame = await shellFrame(page);
  await readyForPatient(frame);
  return { ...fixture, frame };
}

async function choosePatient(frame, firstName) {
  const start = frame.locator('#vhomeGabinetStart');
  await expect(start).toBeVisible();
  await start.getByRole('searchbox').fill(firstName);
  await start.locator('#vgs-results').getByRole('button', { name: new RegExp(firstName) }).click();
  await expect(frame.locator('#vhomePatientOverview')).toBeVisible();
  await expect(frame.locator('#vhomeGabinetHeader')).toContainText(firstName);
}

async function headerGeometry(frame) {
  return frame.locator('#vhomeGabinetHeader').evaluate(header => {
    return [header, ...header.querySelectorAll('[role="tab"]')].map(node => {
      const { x, y, width, height } = node.getBoundingClientRect();
      return [x, y, width, height];
    });
  });
}

async function expectHeaderAppearance(frame) {
  const header = frame.locator('#vhomeGabinetHeader');
  const active = header.getByRole('tab', { selected: true });
  const inactive = header.getByRole('tab', { selected: false });
  const breadcrumb = header.locator('[data-start]');
  for (const button of [breadcrumb, active, inactive]) {
    await expect(button).toHaveCSS('box-shadow', 'none');
    await expect(button).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  }
  await expect(breadcrumb).toHaveCSS('color', 'rgb(0, 110, 117)');
  await expect(active).toHaveCSS('color', 'rgb(0, 107, 114)');
  await expect(active).toHaveCSS('border-bottom', '3px solid rgb(0, 131, 139)');
  await expect(inactive).toHaveCSS('color', 'rgb(86, 111, 117)');
  await expect(inactive).toHaveCSS('border-bottom-color', 'rgba(0, 0, 0, 0)');
  await expect(header.locator('[data-history]')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(header.locator('[data-home-encounter]')).toHaveCSS('background-color', 'rgb(0, 124, 132)');
}

async function horizontalEdges(locator) {
  return locator.evaluate(node => {
    const { left, right } = node.getBoundingClientRect();
    return { left, right };
  });
}

test('Gabinet uses one patient header for overview and analysis and displays reminders only in the overview', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const today = new Date().toISOString().slice(0, 10);
  await frame.evaluate(async ({ ids, today }) => {
    for (const [key, patientId] of Object.entries(ids)) {
      await window.VildaVault.savePatientNote({
        patientId, category: 'reminder-contact', title: 'Fikcyjne przypomnienie gabinetowe ' + key,
        dueDateISO: today,
      });
    }
  }, { ids, today });
  await choosePatient(frame, 'Antoni');
  const overview = frame.locator('#vhomeGabinetOverviewTab');
  const analysis = frame.locator('#vhomeGabinetAnalysisTab');
  const patientCard = frame.locator('#vhomePatientOverview > .vilda-auth-card');
  const measurements = frame.locator('#userSection fieldset.user-card');
  const summary = frame.locator('#currentSummaryCard');
  async function checkPatientLayout(width, rightEdge) {
    await page.setViewportSize({ width, height: 900 });
    await overview.click();
    await expect(overview).toHaveAttribute('aria-selected', 'true');
    await expect(patientCard.locator(':scope > .vhome-native-patient-card')).toBeVisible();
    await page.mouse.move(0, 0);
    await expectHeaderAppearance(frame);
    const before = await headerGeometry(frame);
    const cardEdges = await horizontalEdges(patientCard);

    await analysis.click();
    await expect(analysis).toHaveAttribute('aria-selected', 'true');
    await expect(measurements).toBeVisible();
    await expect(rightEdge).toBeVisible();
    await expect(frame.locator('#vhomePatientCard')).toBeHidden();
    await expect(frame.locator('#vhomeAdultVitalsCard')).toBeHidden();
    await expect(frame.locator('#remindersInline')).toBeHidden();
    await page.mouse.move(0, 0);
    await expectHeaderAppearance(frame);
    const formEdges = await horizontalEdges(measurements);
    const analysisEdges = await horizontalEdges(rightEdge);
    expect(Math.abs(formEdges.left - cardEdges.left), 'Lewa krawędź Pomiary / Karta pacjenta').toBeLessThanOrEqual(1);
    expect(Math.abs(analysisEdges.right - cardEdges.right), 'Prawa krawędź Analiza / Karta pacjenta').toBeLessThanOrEqual(1);
    expect(await headerGeometry(frame)).toEqual(before);
  }
  for (const width of [1440, 1920, 834, 390]) await checkPatientLayout(width, summary);

  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij wizytę', exact: true }).click();
  await expect(header.getByRole('button', { name: 'Zapisz wizytę', exact: true })).toBeVisible();
  // A visit can start without measurements. Its form grid is visible immediately.
  await expect(frame.locator('#weight')).toHaveValue('');
  for (const width of [1440, 390]) await checkPatientLayout(width, frame.locator('#calcForm'));
  await overview.click();
  await frame.locator('#vhomePatientOverview select.vhome-b1-mobile-select').selectOption('reminders');
  const slot = frame.locator('#vhomePatientRemindersSlot');
  await expect(slot).toContainText('Fikcyjne przypomnienie gabinetowe a');
  await expect(slot).not.toContainText('Fikcyjne przypomnienie gabinetowe b');
  await expect(frame.locator('#remindersInline')).toHaveCount(1);
});

async function saveReminderOnly(page) {
  const { frame, ids } = await prepare(page);
  const before = await frame.evaluate(id => window.VildaVault.getPatient(id), ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Rozpocznij wizytę', exact: true }).click();
  const save = header.getByRole('button', { name: 'Zapisz wizytę', exact: true });
  await expect(save).toBeVisible();
  const visit = await frame.evaluate(() => window.collectUserData().visit);
  expect(visit).toMatchObject({ patientId: ids.a, origin: 'explicit' });
  expect(visit.visitId).toBeTruthy();
  await expect(frame.locator('#weight')).toHaveValue('');
  await expect(frame.locator('#height')).toHaveValue('');

  const workspace = frame.locator('#vhomePatientOverview');
  await workspace.getByRole('tab', { name: 'Przypomnienia', exact: true }).click();
  const trigger = frame.locator('#vhomePatientRemindersSlot').getByRole('button', { name: 'Dodaj przypomnienie', exact: true });
  await trigger.click();
  const dialog = page.locator('dialog.vhome-reminders-dialog');
  const text = 'Fikcyjna kontrola wizyta bez pomiaru';
  await dialog.getByLabel('Treść przypomnienia', { exact: true }).fill(text);
  const date = new Date().toISOString().slice(0, 10);
  await dialog.getByLabel('Przypomnij w dniu', { exact: true }).fill(date);
  await dialog.getByRole('button', { name: 'Zapisz przypomnienie', exact: true }).click();
  await expect.poll(() => frame.evaluate(async ({ id, text }) => {
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    return notes.find(note => note.title === text)?.visitContext?.visitId;
  }, { id: ids.a, text })).toBe(visit.visitId);
  if (await dialog.isVisible()) {
    await dialog.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
  }
  const revisions = () => frame.evaluate(async ({ id, visitId }) => {
    const patient = await window.VildaVault.getPatient(id);
    return patient.snapshots.filter(snapshot => snapshot.payload?.visit?.visitId === visitId).length;
  }, { id: ids.a, visitId: visit.visitId });
  await expect.poll(revisions).toBe(1);
  return { frame, ids, before, save, text, visit, revisions };
}

test('a consultation containing only a reminder saves its own visit and leaves the previous measurements intact', async ({ page }) => {
  const { frame, ids, before, save, text, visit, revisions } = await saveReminderOnly(page);
  await save.click();
  await expect(frame.locator('#vhomeGabinetHeader').getByRole('button', { name: 'Rozpocznij wizytę', exact: true })).toBeVisible();
  expect(await revisions()).toBe(1);

  await page.reload({ waitUntil: 'load' });
  const restored = await shellFrame(page);
  await restored.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady());
  await expect.poll(() => restored.evaluate(async ({ id, text }) => {
    const records = await window.VildaVault.listPatientNotesForPatient(id);
    return records.find(note => note.title === text)?.visitContext?.visitId || '';
  }, { id: ids.a, text })).toBe(visit.visitId);
  const after = await restored.evaluate(id => window.VildaVault.getPatient(id), ids.a);
  const saved = after.snapshots.find(snapshot => snapshot.payload?.visit?.visitId === visit.visitId);
  expect(Number(saved.payload.user.height || 0)).toBe(0);
  expect(Number(saved.payload.user.weight || 0)).toBe(0);
  for (const previous of before.snapshots) {
    const original = after.snapshots.find(row => row.snapshotId === previous.snapshotId);
    expect(original?.payload.user).toEqual(previous.payload.user);
    expect(original?.payload.visit).toEqual(previous.payload.visit);
  }
  expect(await restored.evaluate(async ({ id, text }) =>
    (await window.VildaVault.listPatientNotesForPatient(id)).some(note => note.title === text),
  { id: ids.b, text })).toBe(false);
});

test('reloading right after saving a reminder keeps its measurement-free visit in history', async ({ page }) => {
  const { ids, visit, text } = await saveReminderOnly(page);
  await page.reload({ waitUntil: 'load' });
  const frame = await shellFrame(page);
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI?.isBootReady());
  const saved = await frame.evaluate(async ({ id, visitId, text }) => {
    const visits = await window.VildaVault.getPatientVisits(id);
    const notes = await window.VildaVault.listPatientNotesForPatient(id);
    return { visits: visits.filter(row => row.visitId === visitId).length,
      reminderVisit: notes.find(row => row.title === text)?.visitContext?.visitId };
  }, { id: ids.a, visitId: visit.visitId, text });
  expect(saved).toEqual({ visits: 1, reminderVisit: visit.visitId });
});

test('Edytuj wizytę corrects only the chosen historical record and returns to the latest patient overview', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  const seed = await frame.evaluate(async patientId => {
    const vault = window.VildaVault;
    const [older] = await vault.getPatientVisits(patientId);
    const newer = structuredClone(older.payload);
    newer.visit = window.VildaVisitContext.create({ patientId, clinicalDateISO: '2026-11-21' });
    newer.user = { ...newer.user, measuredAtISO: '2026-11-21', weight: 55, height: 160 };
    const latest = await vault.savePatient(newer, { patientId, dedup: false });
    return { olderId: older.visitId, olderSnapshot: older.snapshotId, revision: older.rev,
      row: (await vault.getPatientVisits(patientId)).findIndex(item => item.visitId === older.visitId),
      latestId: latest.snapshotId };
  }, ids.a);
  await choosePatient(frame, 'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button', { name: 'Historia wizyt' }).click();
  const history = frame.locator('dialog.vvisit-dialog');
  await history.locator('.vvisit-visit').nth(seed.row).click();
  await expect(header.getByRole('button', { name: 'Rozpocznij wizytę' })).toBeAttached();
  await history.getByRole('button', { name: 'Edytuj wizytę' }).click();
  await expect(header).toContainText('Edycja wizyty');
  await header.getByRole('tab', { name: 'Analiza', exact: true }).click();
  await frame.locator('#weight').fill('44');
  await header.getByRole('button', { name: 'Zapisz wizytę' }).click();
  await expect.poll(() => frame.evaluate(async ({ pid, snapshotId }) => {
    const patient = await window.VildaVault.getPatient(pid);
    const edited = patient.snapshots.find(item => item.snapshotId === snapshotId);
    return [patient.snapshots[0].snapshotId, edited.rev, edited.payload.user.weight];
  }, { pid: ids.a, snapshotId: seed.olderSnapshot })).toEqual([seed.latestId, seed.revision + 1, 44]);
  await expect(header.getByRole('button', { name: 'Rozpocznij wizytę' })).toBeVisible();
  await expect(frame.locator('#weight')).toHaveValue('55');
});

test('a new note in Overview keeps the active encounter and an independent clinical date', async ({ page }) => {
  const { frame, ids } = await prepare(page);
  await choosePatient(frame,'Antoni');
  const header = frame.locator('#vhomeGabinetHeader');
  await header.getByRole('button',{name:'Rozpocznij wizytę',exact:true}).click();
  await expect(header.getByRole('button',{name:'Zapisz wizytę',exact:true})).toBeVisible();
  const visit = await frame.evaluate(() => window.collectUserData().visit);
  const overview = frame.locator('#vhomePatientOverview');
  await overview.getByRole('tab',{name:'Notatki',exact:true}).click();
  await overview.getByRole('button',{name:/Dodaj notatkę/}).click();
  const editor = frame.locator('.vilda-patient-note-editor-overlay');
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="b3-anchor"]')).toHaveCount(0);
  const title = 'Fikcyjny wpis z przypisanej wizyty';
  await editor.getByPlaceholder('np. Wprowadzono Euthyrox').fill(title);
  await editor.locator('textarea').first().fill('Treść kontrolna end-to-end.');
  await editor.getByLabel('Data badania lub zdarzenia (opcjonalnie)').fill('2025-12-19');
  await editor.getByRole('button',{name:'Dodaj notatkę',exact:true}).click();
  await expect(editor).toHaveCount(0);
  const saved = await frame.evaluate(async ({patientId,title}) =>
    (await window.VildaVault.listPatientNotesForPatient(patientId)).find(note => note.title === title), {patientId:ids.a,title});
  expect(saved).toMatchObject({clinicalDateISO:'2025-12-19',visitContext:{
    version:1,visitId:visit.visitId,clinicalDateISO:visit.clinicalDateISO
  }});
});
