import { test, expect } from '@playwright/test';
import { fictionalPatient, readyForPatient } from '../support/centile-live-fixture.mjs';
import { CARE_FORM, CARE_WORKSPACE, openCarePlans, selectPlan } from '../support/care-plans-fixture.mjs';

// Real fictional native accounts, IndexedDB, production models and UI. The
// production Worker is blocked: ordinary plans must not need its setup routes.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
test.setTimeout(120_000);
const PASSWORD = 'Fictional#NativeTemplateAccount2026!aA';
const TITLE = 'Fikcyjny plan bez przygotowania konta';
const FIRST_STEP = 'Fikcyjne otrzymanie dokumentu';

async function openNativePage(page) {
  const requests = [];
  // P-SYNC-DOMENA: synchronizacja V1 idzie na sync.vildasync.com, a rejestracja konta V2 (/account-root/v1/) na
  // związany adres workers.dev (PatientWorkspaceServiceOrigin) — przechwytujemy oba.
  for (const host of ['https://sync.vildasync.com', 'https://vilda-sync.maciej-4b9.workers.dev']) {
    await page.route(`${host}/**`, async route => {
      requests.push(new URL(route.request().url()).pathname);
      await route.abort();
    });
  }
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    localStorage.setItem('analyticsConsent', 'denied');
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault && window.VildaAuthUI?.isBootReady());
  return requests;
}

async function seedNativeAccount(page) {
  const requests = await openNativePage(page);
  await page.evaluate(password => window.VildaVault.createUser(password, {
    label: 'Fikcyjne konto planu bez migracji', iterations: 10000, deferServerContact: true,
  }), PASSWORD);
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  const ids = await page.evaluate(async records => {
    const vault = window.VildaVault;
    await window.VildaSyncIntegration.setSyncEnabled(false);
    const ids = {};
    for (const [key, payload] of Object.entries(records)) ids[key] = (await vault.savePatient(payload, { dedup: false })).patientId;
    const ordinary = await vault.savePatientNote({ patientId: ids.a, title: 'Fikcyjna wcześniejsza notatka', body: 'Treść sprzed utworzenia planu.', category: 'observation' });
    ids.note = ordinary.id;
    await window.VildaFileExport.setAutoBackupEnabled(true);
    await window.VildaCarePlans.ensureTemplateLibrary({ ui: false });
    const definition = window.VildaCareTemplateModel.createDefinitionDraft({ stageId: 'fictional-source-stage-a', stepId: 'fictional-source-step-a' }).definition;
    definition.name = 'Fikcyjny plan bez przygotowania konta';
    definition.stages[0].title = 'Fikcyjny etap dokumentacji';
    definition.steps[0].title = 'Fikcyjne otrzymanie dokumentu';
    definition.steps[0].requiredOutcome = 'resultReceipt';
    definition.steps[0].reminderRule = { kind: 'stage-offset', amount: 0, unit: 'day' };
    definition.steps[0].includedByDefault = true;
    definition.stageOrder.push('fictional-source-stage-b');
    definition.stages.push({ id: 'fictional-source-stage-b', title: 'Fikcyjny etap decyzji', stepIds: ['fictional-source-step-b'] });
    definition.steps.push({ id: 'fictional-source-step-b', stageId: 'fictional-source-stage-b', title: 'Fikcyjne dalsze ustalenie', taskKind: 'documentation', instruction: 'Fikcyjna instrukcja.', requiredOutcome: 'decision', reminderRule: { kind: 'none' }, includedByDefault: true });
    ids.template = crypto.randomUUID();
    const saved = await vault.saveCarePlanTemplateRevision({ templateId: ids.template, operationId: crypto.randomUUID(), baseToken: null, definition });
    if (!saved.saved) throw new Error('Fictional native template was not saved');
    return ids;
  }, { a: fictionalPatient(), b: fictionalPatient({ firstName: 'Beata', sex: 'F', age: 12, height: 150, weight: 41 }) });
  const original = await page.evaluate(async ids => ({
    first: await window.VildaVault.getPatient(ids.a), second: await window.VildaVault.getPatient(ids.b), note: await window.VildaVault.getPatientNote(ids.note),
  }), ids);
  return { ids, original, requests };
}

async function applyFromLibrary(page, ids) {
  await expect.poll(() => page.evaluate(() => window.VildaVault.getCarePlanApplicationProvider().getCapability()))
    .toMatchObject({ available: true });
  const panel = await openCarePlans(page);
  await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Moje szablony', exact: true }).click();
  const library = page.locator('.vct-dialog .vct');
  await expect(library).toBeVisible();
  await expect(library.getByRole('button', { name: 'Przygotuj plany z etapami', exact: true })).toHaveCount(0);
  await expect(page.getByRole('dialog', { name: 'Przygotowanie planów z etapami', exact: true })).toHaveCount(0);
  await library.getByRole('button', { name: 'Użyj u pacjenta: ' + TITLE, exact: true }).click();
  await library.locator('[data-patient-id="' + ids.a + '"]').click();
  await library.getByRole('button', { name: 'Dalej', exact: true }).click();
  await expect(library.getByLabel('Nazwa planu', { exact: true })).toHaveValue(TITLE);
  await library.getByRole('button', { name: 'Utwórz plan', exact: true }).click();
  await expect(library).toHaveCount(0);
  await expect(panel.getByRole('button', { name: 'Uruchom pierwszy etap', exact: true })).toBeVisible();
  const plans = await page.evaluate(id => window.VildaVault.listCarePlans({ patientId: id }), ids.a);
  expect(plans).toHaveLength(1);
  expect(plans[0]).toMatchObject({ patientId: ids.a, title: TITLE, careContext: { version: 2, facts: [] } });
  expect(plans[0].careContext.stages.map(stage => stage.control.state)).toEqual(['planned', 'planned']);
  expect(plans[0].careContext.stages[0].id).not.toBe('fictional-source-stage-a');
  expect(plans[0].careContext.steps[0].id).not.toBe('fictional-source-step-a');
  return { panel, plan: plans[0] };
}

async function activateFirstStage(page, panel) {
  const day = await page.evaluate(() => {
    const date = new Date();
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  });
  await panel.getByRole('button', { name: 'Uruchom pierwszy etap', exact: true }).click();
  const dialog = page.locator('.vcp-staged-dialog');
  await expect(dialog.getByLabel('Data uruchomienia etapu', { exact: true })).toHaveValue('');
  await dialog.getByLabel('Data uruchomienia etapu', { exact: true }).fill(day);
  await dialog.getByRole('button', { name: 'Uruchom etap', exact: true }).click();
  await expect(dialog).toHaveCount(0);
  return day;
}

async function assertOrdinaryAccount(page, ids, original, requests) {
  expect(await page.evaluate(async ids => ({
    first: await window.VildaVault.getPatient(ids.a), second: await window.VildaVault.getPatient(ids.b), note: await window.VildaVault.getPatientNote(ids.note),
  }), ids)).toEqual(original);
  expect(await page.evaluate(id => window.VildaVault.listCarePlans({ patientId: id }), ids.b)).toEqual([]);
  expect(await page.evaluate(() => window.VildaVault.getPatientWorkspaceStatus())).toBeNull();
  expect(await page.evaluate(() => window.VildaFileExport.getAutoBackupStatus())).toMatchObject({ enabled: true, effectivelyEnabled: true });
  expect(requests.filter(path => /^\/(?:account-root\/|clinical-journal\/|clinical-snapshot\/|v1\/patient-clinical-vault\/)/u.test(path))).toEqual([]);
}

async function assertNativeReminderProjection(page, planId, patientId, day, { reminderId = null, active = true } = {}) {
  const rows = await page.evaluate(async ({ planId, patientId, day, reminderId }) => {
    const vault = window.VildaVault;
    if (!reminderId) {
      const reminders = (await vault.listPatientNotesForPatient(patientId))
        .filter(note => note.careContext?.version === 2 && note.careContext.planId === planId && note.careContext.role === 'step');
      if (reminders.length !== 1) throw new Error('Expected the one reserved reminder from the actual activated stage');
      reminderId = reminders[0].id;
    }
    const end = day + 'T23:59:59.999Z';
    const dueRows = groups => groups.flatMap(group => group.notes || []);
    const project = values => values.filter(note => note.id === reminderId)
      .map(note => ({ id: note.id, patientId: note.patientId, dueDateISO: note.dueDateISO }));
    const reader = vault.createCalendarReader({ isCurrent: () => true });
    try {
      return { expected: { id: reminderId, patientId, dueDateISO: day },
        directDue: project(dueRows(await vault.listPatientNotesDueByDate(end))),
        directRange: project(await vault.listPatientNotesInRange(day, end)),
        readerDue: project(dueRows(await reader.listPatientNotesDueByDate(end))),
        readerRange: project(await reader.listPatientNotesInRange(day, end)) };
    } finally { reader.dispose(); }
  }, { planId, patientId, day, reminderId });
  for (const name of ['directDue', 'directRange', 'readerDue', 'readerRange']) expect(rows[name], name).toEqual(active ? [rows.expected] : []);
  return rows.expected.id;
}

test('ordinary native account applies a template, retains staged documents after reload and restores them from .wiw', async ({ page, browser, baseURL }) => {
  const { ids, original, requests } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  const day = await activateFirstStage(page, panel);
  let plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
  expect(plan.careContext.stages.map(stage => stage.control.state)).toEqual(['active', 'planned']);
  expect(plan.careContext.steps[0].reminderSchedule.dateISO).toBe(day);
  const reminderId = await assertNativeReminderProjection(page, saved.id, ids.a, day);
  const reminders = await page.evaluate(id => window.VildaVault.listPatientNotesForPatient(id), ids.a);
  expect(reminders).toEqual(expect.arrayContaining([expect.objectContaining({ patientId: ids.a, dueDateISO: day,
    careContext: expect.objectContaining({ version: 2, planId: saved.id, stepId: plan.careContext.steps[0].id }) })]));
  await panel.getByRole('button', { name: 'Zapisz otrzymanie wyniku', exact: true }).click();
  const form = page.locator(CARE_FORM);
  await form.getByLabel('Data otrzymania wyniku', { exact: true }).fill(day);
  await form.getByLabel('Treść dokumentacji', { exact: true }).fill('Fikcyjne potwierdzenie otrzymania dokumentu bez migracji konta.');
  await form.getByLabel('Potwierdzam, że dokumentuje to otrzymanie wyniku tego kroku', { exact: true }).check();
  await form.getByRole('button', { name: 'Zapisz potwierdzenie', exact: true }).click();
  await expect(form).toHaveCount(0);
  plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
  expect(plan.careContext.facts).toHaveLength(1);
  expect(plan.careContext.stages.map(stage => stage.control.state)).toEqual(['active', 'planned']);
  const evidence = await page.evaluate(id => window.VildaVault.getPatientNote(id), plan.careContext.facts[0].evidence.noteId);
  expect(evidence).toMatchObject({ patientId: ids.a, body: 'Fikcyjne potwierdzenie otrzymania dokumentu bez migracji konta.', clinicalDateISO: day });
  await assertNativeReminderProjection(page, saved.id, ids.a, day, { reminderId, active: false });
  await assertOrdinaryAccount(page, ids, original, requests);
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(page);
  expect(await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toEqual(plan);
  const reloadedPanel = await openCarePlans(page); await selectPlan(reloadedPanel, saved.id);
  await expect(reloadedPanel.getByRole('button', { name: 'Otwórz dokument', exact: true })).toBeVisible();
  await assertNativeReminderProjection(page, saved.id, ids.a, day, { reminderId, active: false });
  await assertOrdinaryAccount(page, ids, original, requests);
  const backup = await page.evaluate(async () => {
    const envelope = await window.VildaVault.exportVaultBackup();
    return typeof envelope === 'string' ? envelope : JSON.stringify(envelope);
  });
  expect(JSON.parse(backup).kind).toBe('vault-backup');
  const restoredContext = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block' });
  try {
    const restored = await restoredContext.newPage(), restoredRequests = await openNativePage(restored);
    await restored.evaluate(async ({ backup, password }) => {
      await window.VildaVault.restoreVaultBackup(backup, password, { label: 'Fikcyjne konto odtworzone z .wiw' });
    }, { backup, password: PASSWORD });
    await expect.poll(() => restored.evaluate(() => window.VildaVault.isUnlocked())).toBe(true);
    expect(await restored.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toEqual(plan);
    expect(await restored.evaluate(id => window.VildaVault.getPatientNote(id), evidence.id)).toEqual(evidence);
    const restoredOriginal = structuredClone(original);
    for (const key of ['first', 'second']) {
      const patient = restoredOriginal[key];
      expect(patient.snapshots).toHaveLength(1);
      const snapshot = patient.snapshots[0];
      expect(snapshot.payload).not.toHaveProperty('timestampISO');
      // Existing .wiw restore uses Bng_zJawnych/Bng_zTresci to rebuild this
      // header from its measurement and supplies savedAtISO when the payload
      // has no timestamp. Export omits the local snapshot ordering field seq.
      patient.header.timestampISO = snapshot.savedAtISO;
      delete snapshot.seq;
    }
    await assertOrdinaryAccount(restored, ids, restoredOriginal, restoredRequests);
  } finally { await restoredContext.close(); }
});

test('phone applies an ordinary native template without account preparation and keeps the controls in view', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { ids, original, requests } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  await activateFirstStage(page, panel);
  expect(await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toMatchObject({ patientId: ids.a, careContext: { stages: [expect.objectContaining({ control: expect.objectContaining({ state: 'active' }) }), expect.objectContaining({ control: expect.objectContaining({ state: 'planned' }) })] } });
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  await assertOrdinaryAccount(page, ids, original, requests);
});

test('a real failed legacy preparation leaves its marker intact and does not prevent ordinary template use', async ({ page }) => {
  const { ids, original, requests } = await seedNativeAccount(page);
  await page.evaluate(() => {
    // Invoke the retained compatibility entry point, not the ordinary library.
    // Its real modal and native onboarding write the partial encrypted marker.
    window.nativeFailedCompatibilitySetup = window.VildaVault.getCarePlanApplicationProvider().prepareWorkspace();
    window.nativeFailedCompatibilitySetup.catch(() => {});
  });
  const setup = page.getByRole('dialog', { name: 'Przygotowanie planów z etapami', exact: true });
  await expect(setup).toBeVisible();
  await setup.getByRole('button', { name: 'Przygotuj zapis', exact: true }).click();
  await expect(setup.getByRole('status')).toHaveText('Nie udało się zakończyć przygotowania. Dotychczasowe dane są zachowane. Możesz spróbować ponownie.');
  // The failed request can happen only after onboarding.prepare persisted its
  // native bootstrap and root recovery. No fake server receipt is supplied.
  expect(requests.some(path => /^\/account-root\/v1\//u.test(path))).toBe(true);
  const requestsAfterFailure = [...requests];
  async function readActualMarker() {
    return page.evaluate(async () => {
      const retained = await new Promise((resolve, reject) => {
        const accountId = window.VildaVault.getCurrentUser().userId;
        const request = indexedDB.open('vilda-clinical-workspace-native-v1');
        request.onupgradeneeded = () => request.transaction.abort();
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result, transaction = database.transaction('accounts', 'readonly');
          const read = transaction.objectStore('accounts').get(accountId);
          let value;
          read.onsuccess = () => { value = read.result; };
          transaction.oncomplete = () => { database.close(); resolve(value); };
          transaction.onabort = transaction.onerror = () => { database.close(); reject(transaction.error); };
        };
      });
      if (!retained) throw new Error('Real failed preparation did not retain its native marker');
      // Compare every byte without copying the encrypted recovery marker into
      // test output. The test never modifies or synthesizes routing storage.
      const bytes = new TextEncoder().encode(JSON.stringify(retained));
      const digest = await crypto.subtle.digest('SHA-256', bytes);
      return { keys: Object.keys(retained).sort(), revision: retained.revision,
        sealedKeys: Object.keys(retained.sealed).sort(), sealed: Boolean(retained.sealed.iv && retained.sealed.data),
        sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
    });
  }
  const preparedMarker = await readActualMarker();
  expect(preparedMarker.keys).toEqual(['accountId', 'revision', 'sealed']);
  expect(preparedMarker.revision).toBe(1);
  expect(preparedMarker.sealedKeys).toEqual(['data', 'iv']); expect(preparedMarker.sealed).toBe(true);
  await setup.getByRole('button', { name: 'Wróć', exact: true }).click();
  await expect(setup).toHaveCount(0);
  expect(await page.evaluate(() => window.nativeFailedCompatibilitySetup)).toEqual({ available: false });
  await assertOrdinaryAccount(page, ids, original, requests.slice(requestsAfterFailure.length));
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  await activateFirstStage(page, panel);
  const plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
  expect(plan.careContext.stages.map(stage => stage.control.state)).toEqual(['active', 'planned']);
  expect(await readActualMarker()).toEqual(preparedMarker);
  const backup = await page.evaluate(async () => {
    const envelope = await window.VildaVault.exportVaultBackup();
    return typeof envelope === 'string' ? JSON.parse(envelope) : envelope;
  });
  expect(backup.kind).toBe('vault-backup');
  await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
  expect(await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toEqual(plan);
  expect(await readActualMarker()).toEqual(preparedMarker);
  const preparationRequests = paths => paths.filter(path => /^\/(?:account-root\/|clinical-journal\/|clinical-snapshot\/|v1\/patient-clinical-vault\/)/u.test(path));
  expect(preparationRequests(requests)).toEqual(preparationRequests(requestsAfterFailure));
  await assertOrdinaryAccount(page, ids, original, requests.slice(requestsAfterFailure.length));
});

test('ordinary native sync retains concurrent plan versions, blocks further edits and includes both in .wiw', async ({ page, browser, baseURL }) => {
  const { ids, requests } = await seedNativeAccount(page);
  const { plan: saved } = await applyFromLibrary(page, ids);
  const otherContext = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block' });
  try {
    const other = await otherContext.newPage(), otherRequests = await openNativePage(other);
    const syncCode = await page.evaluate(password => window.VildaVault.exportSyncCode(password), PASSWORD);
    await other.evaluate(({ syncCode, password }) => window.VildaVault.importSyncCode(syncCode, password, {
      label: 'Fikcyjne drugie urządzenie tego samego konta',
    }), { syncCode, password: PASSWORD });
    await other.reload({ waitUntil: 'load' }); await readyForPatient(other);
    await other.evaluate(async () => {
      await window.VildaSyncIntegration.setSyncEnabled(false);
      await window.VildaFileExport.setAutoBackupEnabled(true);
    });
    const syncSlot = device => device.evaluate(async () => (await window.VildaVault.getSyncMaterial()).slotId);
    expect(await syncSlot(page)).toBeTruthy();
    expect(await syncSlot(other)).toBe(await syncSlot(page));
    async function acknowledgeNativeCredentialNotice() {
      for (const device of [page, other]) {
        const notice = device.getByRole('alertdialog', { name: 'Hasło do konta zostało zmienione', exact: true });
        if (await notice.isVisible()) await notice.getByRole('button', { name: 'Rozumiem', exact: true }).click();
      }
    }
    const initial = await page.evaluate(() => window.VildaVault.exportSyncPayload());
    await other.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), initial);
    // Establish the ordinary transport's existing metadata normalization before
    // either clinician enters the independent observations under test.
    const acknowledged = await other.evaluate(() => window.VildaVault.exportSyncPayload());
    await page.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), acknowledged);
    await acknowledgeNativeCredentialNotice();
    const readOriginal = device => device.evaluate(async ids => ({
      first: await window.VildaVault.getPatient(ids.a), second: await window.VildaVault.getPatient(ids.b), note: await window.VildaVault.getPatientNote(ids.note),
    }), ids);
    const [originalFirst, originalSecond] = await Promise.all([readOriginal(page), readOriginal(other)]);
    const day = await page.evaluate(() => {
      const value = new Date(); return value.getFullYear() + '-' + String(value.getMonth() + 1).padStart(2, '0') + '-' + String(value.getDate()).padStart(2, '0');
    });
    async function independentFact(device, kind, title, body) {
      return device.evaluate(async ({ planId, patientId, kind, title, body, day }) => {
        const plan = await window.VildaVault.getCarePlan(planId);
        const documentId = crypto.randomUUID(), operationId = crypto.randomUUID();
        const result = await window.VildaVault.mutateStagedCarePlan({ action: 'recordFact', operationId,
          planId, patientId, expectedRevision: plan.rev, stepId: plan.careContext.steps[0].id,
          factId: crypto.randomUUID(), kind, effectiveDateISO: day, document: { id: documentId, title, body } });
        if (!result.saved) throw new Error('Independent native fact was not saved');
        return { documentId, operationId, body };
      }, { planId: saved.id, patientId: ids.a, kind, title, body, day });
    }
    const firstFact = await independentFact(page, 'performance', 'Fikcyjne wykonanie na urządzeniu A', 'Fikcyjny pełny opis wykonania z urządzenia A.');
    const secondFact = await independentFact(other, 'resultReceipt', 'Fikcyjny wynik na urządzeniu B', 'Fikcyjny pełny opis otrzymania wyniku z urządzenia B.');
    const [firstPayload, secondPayload] = await Promise.all([
      page.evaluate(() => window.VildaVault.exportSyncPayload()), other.evaluate(() => window.VildaVault.exportSyncPayload()),
    ]);
    const expectedStates = [firstPayload, secondPayload].map(payload => payload.patientNotes.find(note => note.id === saved.id).careContext.nativeState);
    expect(expectedStates[0]).not.toEqual(expectedStates[1]);
    await page.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), secondPayload);
    await other.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), firstPayload);
    await acknowledgeNativeCredentialNotice();
    for (const device of [page, other]) {
      const merged = await device.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
      expect(merged.syncNeedsReview).toBe(true); expect(merged.nativeConflicts).toHaveLength(1);
      const factIds = [merged.careContext, ...merged.nativeConflicts.map(state => state.record.careContext)].flatMap(context => context.facts.map(fact => fact.evidence.noteId)).sort();
      expect(factIds).toEqual([firstFact.documentId, secondFact.documentId].sort());
      const refusal = await device.evaluate(async ({ planId, patientId, day }) => {
        const plan = await window.VildaVault.getCarePlan(planId);
        try {
          await window.VildaVault.mutateStagedCarePlan({ action: 'activateStage', operationId: crypto.randomUUID(),
            planId, patientId, expectedRevision: plan.rev, stageId: plan.careContext.stages[0].id, effectiveDateISO: day });
          return null;
        } catch (error) { return error.code || error.message; }
      }, { planId: saved.id, patientId: ids.a, day });
      expect(refusal).toMatch(/CONFLICT/u);
      expect(await device.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toEqual(merged);
    }
    await page.locator(CARE_WORKSPACE).getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
    // Same day as the reminder list (end of the local day, the vault default). The current UTC instant is still the
    // previous day between local midnight and the UTC midnight, which hid today's plan in that hour.
    const attention = await page.evaluate(async id => (await window.VildaVault.listPatientNotesDueByDate())
      .flatMap(group => group.notes || []).filter(note => note.id === id)
      .map(note => ({ id: note.id, planId: note.careContext?.planId, syncNeedsReview: note.syncNeedsReview })), saved.id);
    expect(attention).toEqual([{ id: saved.id, planId: saved.id, syncNeedsReview: true }]);
    await page.locator('#vildaRemindersBtn').click();
    const workspace = page.locator(CARE_WORKSPACE);
    await workspace.getByRole('button', { name: /^Do wykonania(?:\s|$)/u }).click();
    const attentionRow = workspace.locator('[data-note-id="' + saved.id + '"]');
    await expect(attentionRow).toBeVisible(); await attentionRow.click();
    const panel = workspace.locator('.vcp');
    await expect(panel.locator('.vcp-detail .vcp-title').first()).toHaveText(TITLE);
    await expect(panel.locator('.vcp-record')).toHaveCount(0);
    await expect(panel).toContainText('Konflikt synchronizacji. Ten plan jest dostępny tylko do odczytu.');
    const versions = panel.locator('.vcp-native-conflict-version');
    await expect(versions).toHaveCount(2);
    for (const version of await versions.all()) await version.locator('summary').first().click();
    await expect(panel.locator('.vcp-native-conflicts')).toContainText('Wykonanie:');
    await expect(panel.locator('.vcp-native-conflicts')).toContainText('Otrzymanie wyniku:');
    for (const title of ['Uruchom pierwszy etap', 'Uruchom etap', 'Zapisz wykonanie', 'Zapisz otrzymanie wyniku', 'Zapisz decyzję', 'Zamknij plan'])
      await expect(panel.getByRole('button', { name: title, exact: true })).toHaveCount(0);
    for (const fact of [firstFact, secondFact]) {
      const retained = panel.locator('.vcp-native-conflicts [data-record-id="' + fact.documentId + '"]');
      await retained.first().click();
      await expect(panel.locator('.vcp-record-body')).toHaveText(fact.body);
      await panel.getByRole('button', { name: '← Wróć do planu', exact: true }).click();
      await expect(panel.locator('.vcp-native-conflict-version[open]')).toHaveCount(2);
    }
    const backup = await page.evaluate(async ({ password, planId, documentIds }) => {
      const vault = window.VildaVault, cryptoApi = window.VildaCrypto;
      const value = await vault.exportVaultBackup(), envelope = cryptoApi.parseEnvelope(value);
      const key = await cryptoApi.unwrapMasterFromEnvelope(envelope, password);
      const payload = await cryptoApi.decryptJson(key, envelope.payload.iv, envelope.payload.data);
      const context = payload.patientNotes.find(note => note.id === planId).careContext;
      return { kind: envelope.kind, states: [context.nativeState, ...context.nativeConflicts],
        documents: payload.patientNotes.filter(note => documentIds.includes(note.id)).map(note => ({ id: note.id, body: note.body })) };
    }, { password: PASSWORD, planId: saved.id, documentIds: [firstFact.documentId, secondFact.documentId] });
    expect(backup.kind).toBe('vault-backup'); expect(backup.states).toHaveLength(2);
    expect(backup.states).toEqual(expect.arrayContaining(expectedStates));
    expect(backup.documents).toEqual(expect.arrayContaining([firstFact, secondFact].map(fact => ({ id: fact.documentId, body: fact.body }))));
    await assertOrdinaryAccount(page, ids, originalFirst, requests);
    await assertOrdinaryAccount(other, ids, originalSecond, otherRequests);
  } finally { await otherContext.close(); }
});

test('ordinary incoming sync cannot delete or reassign a staged plan, its patient, reminder or referenced source', async ({ page }) => {
  const { ids, original, requests } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  const day = await activateFirstStage(page, panel);
  const results = await page.evaluate(async ({ ids, planId, day }) => {
    const vault = window.VildaVault, source = await vault.getPatientNote(ids.note);
    const current = await vault.getCarePlan(planId);
    const recorded = await vault.mutateStagedCarePlan({ action: 'recordFact', operationId: crypto.randomUUID(),
      planId, patientId: ids.a, expectedRevision: current.rev, stepId: current.careContext.steps[0].id,
      factId: crypto.randomUUID(), kind: 'performance', effectiveDateISO: day,
      evidence: { noteId: source.id, sourceRecordRevAtCapture: source.rev } });
    if (!recorded.saved) throw new Error('Actual native evidence link was not saved');
    const baseline = await vault.exportSyncPayload();
    const parent = baseline.patientNotes.find(note => note.id === planId);
    const stepId = parent.careContext.nativeState.record.careContext.steps[0].id;
    const reminderId = parent.careContext.nativeState.documentIds.reminders[stepId];
    const reminder = baseline.patientNotes.find(note => note.id === reminderId);
    const patient = baseline.patients.find(patient => patient.patientId === ids.a);
    const destination = baseline.patients.find(patient => patient.patientId === ids.b);
    if (!reminder || !patient.snapshots.length || !destination) throw new Error('Actual native fixture is incomplete');
    const deletedAtISO = new Date(Date.now() + 60_000).toISOString();
    const noteTombstone = note => ({ id: note.id, rev: note.rev, deletedAtISO });
    const variants = [
      { name: 'patient deletion', code: 'CARE_NATIVE_PATIENT_REFERENCED', tombstones: [{ patientId: ids.a, deletedAtISO }] },
      { name: 'parent deletion', code: 'CARE_NATIVE_DOCUMENT_REFERENCED', patientNoteTombstones: [noteTombstone(parent)] },
      { name: 'reserved reminder deletion', code: 'CARE_NATIVE_DOCUMENT_REFERENCED', patientNoteTombstones: [noteTombstone(reminder)] },
      { name: 'ordinary evidence deletion', code: 'CARE_NATIVE_DOCUMENT_REFERENCED', patientNoteTombstones: [noteTombstone(source)] },
      { name: 'measurement reassignment', code: 'CARE_NATIVE_PATIENT_REFERENCED', patients: [{ ...destination,
        // A genuinely winning ownership claim, independent of random UUID
        // tie-breaking; the clinical measurement payload itself is unchanged.
        snapshots: patient.snapshots.map(snapshot => ({ ...snapshot, rev: snapshot.rev + 1, updatedAtISO: deletedAtISO })) }] },
    ];
    async function nativeSourceDigest() {
      const name = vault.USER_DB_PREFIX + vault.getCurrentUser().userId;
      const database = await new Promise((resolve, reject) => {
        const request = indexedDB.open(name);
        request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('Native source observer cannot create storage')); };
        request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
      });
      let image;
      try {
        const names = [...database.objectStoreNames].sort();
        image = await new Promise((resolve, reject) => {
          const transaction = database.transaction(names, 'readonly');
          const rows = names.map(name => transaction.objectStore(name).getAll());
          transaction.oncomplete = () => resolve(names.map((name, index) => [name, rows[index].result]));
          transaction.onabort = transaction.onerror = () => reject(transaction.error);
        });
      } finally { database.close(); }
      const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(image)));
      return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    }
    const originalDigest = await nativeSourceDigest(), results = [];
    for (const variant of variants) {
      const payload = { ...structuredClone(baseline), patients: [], patientNotes: [], notes: [],
        tombstones: [], patientNoteTombstones: [], noteTombstones: [] };
      for (const key of ['patients', 'tombstones', 'patientNoteTombstones']) if (variant[key]) payload[key] = structuredClone(variant[key]);
      let code = null;
      try { await vault.mergeSyncPayload(payload); } catch (error) { code = error.code || error.name; }
      // Keep complete encrypted and plaintext clinical payloads in the browser;
      // a rejected transport operation must leave every native store intact.
      results.push({ name: variant.name, code, expected: variant.code, unchanged: await nativeSourceDigest() === originalDigest });
    }
    return results;
  }, { ids, planId: saved.id, day });
  expect(results).toHaveLength(5);
  for (const result of results) {
    expect(result.code, result.name).toBe(result.expected);
    expect(result.unchanged, result.name).toBe(true);
  }
  await assertOrdinaryAccount(page, ids, original, requests);
});

test('an actual encrypted parent-only delta hides a stale physical reminder before its child delta arrives', async ({ page, browser, baseURL }) => {
  const { ids, original, requests } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  const day = await activateFirstStage(page, panel);
  const reminderId = await assertNativeReminderProjection(page, saved.id, ids.a, day);
  const otherContext = await browser.newContext({ baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block' });
  try {
    const other = await otherContext.newPage(), otherRequests = await openNativePage(other);
    const syncCode = await page.evaluate(password => window.VildaVault.exportSyncCode(password), PASSWORD);
    await other.evaluate(({ syncCode, password }) => window.VildaVault.importSyncCode(syncCode, password, {
      label: 'Fikcyjne urządzenie z opóźnionym przypomnieniem',
    }), { syncCode, password: PASSWORD });
    await other.reload({ waitUntil: 'load' }); await readyForPatient(other);
    await other.evaluate(async () => {
      await window.VildaSyncIntegration.setSyncEnabled(false);
      await window.VildaFileExport.setAutoBackupEnabled(true);
    });
    const initial = await page.evaluate(() => window.VildaVault.exportSyncPayload());
    await other.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), initial);
    const otherOriginal = await other.evaluate(async ids => ({ first: await window.VildaVault.getPatient(ids.a),
      second: await window.VildaVault.getPatient(ids.b), note: await window.VildaVault.getPatientNote(ids.note) }), ids);
    await assertNativeReminderProjection(other, saved.id, ids.a, day);
    async function physicalReminder(device) {
      return device.evaluate(async id => {
        const vault = window.VildaVault;
        const database = await new Promise((resolve, reject) => {
          const request = indexedDB.open(vault.USER_DB_PREFIX + vault.getCurrentUser().userId);
          request.onupgradeneeded = () => { request.transaction.abort(); reject(new Error('The stale-reminder observer cannot create storage')); };
          request.onerror = () => reject(request.error); request.onsuccess = () => resolve(request.result);
        });
        let row;
        try {
          row = await new Promise((resolve, reject) => {
            const transaction = database.transaction('patientNotes', 'readonly'), read = transaction.objectStore('patientNotes').get(id);
            transaction.oncomplete = () => resolve(read.result);
            transaction.onabort = transaction.onerror = () => reject(transaction.error);
          });
        } finally { database.close(); }
        if (!row) throw new Error('The genuine reserved reminder is physically missing');
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(row)));
        return { rev: row.rev, dueDateISO: row.dueDateISO,
          sha256: Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('') };
      }, reminderId);
    }
    const staleChild = await physicalReminder(other);
    // Existing native import canonicalizes the physical due column to an ISO
    // timestamp. The authoritative staged DTO retains the calendar-day form.
    expect(staleChild.dueDateISO).toBe(day + 'T00:00:00.000Z');
    const { delta, idsInDelta, plan } = await page.evaluate(async ({ planId, patientId, noteId, day }) => {
      const vault = window.VildaVault, before = await vault.getCarePlan(planId), source = await vault.getPatientNote(noteId);
      const saved = await vault.mutateStagedCarePlan({ action: 'recordFact', operationId: crypto.randomUUID(),
        planId, patientId, expectedRevision: before.rev, stepId: before.careContext.steps[0].id,
        factId: crypto.randomUUID(), kind: 'resultReceipt', effectiveDateISO: day,
        evidence: { noteId, sourceRecordRevAtCapture: source.rev } });
      if (!saved.saved) throw new Error('The genuine source-device receipt was not saved');
      const delta = await vault.buildNoteDelta(planId);
      const plaintext = await vault.decryptPayloadForCurrentUser(delta.iv, delta.data);
      return { delta, idsInDelta: plaintext.patientNotes.map(note => note.id), plan: await vault.getCarePlan(planId) };
    }, { planId: saved.id, patientId: ids.a, noteId: ids.note, day });
    expect(idsInDelta).toEqual([saved.id]);
    await other.evaluate(delta => window.VildaVault.applyEncryptedDelta(delta), delta);
    expect(await physicalReminder(other)).toEqual(staleChild);
    expect((await other.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).careContext).toEqual(plan.careContext);
    await assertNativeReminderProjection(other, saved.id, ids.a, day, { reminderId, active: false });
    await assertOrdinaryAccount(page, ids, original, requests);
    await assertOrdinaryAccount(other, ids, otherOriginal, otherRequests);
    await other.reload({ waitUntil: 'load' }); await readyForPatient(other);
    expect(await physicalReminder(other)).toEqual(staleChild);
    await assertNativeReminderProjection(other, saved.id, ids.a, day, { reminderId, active: false });
    expect((await other.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).careContext.facts).toEqual(plan.careContext.facts);
    await assertOrdinaryAccount(other, ids, otherOriginal, otherRequests);
  } finally { await otherContext.close(); }
});

// 2c (P-DOWOD-KROKU): new field in two releases — this release reads and compares the document content instant
// (sourceRecordContentAtISOAtCapture: the instant of the document's last content change when it was linked; owner's
// decision of 2026-11-17) in step evidence and associations; a second release starts writing it after the owner confirms
// that every device runs this one. The field replaces the former write-instant field sourceRecordUpdatedAtISOAtCapture,
// which this release refuses. An older model refuses such a plan together with the whole payload, copy or file, so this
// release must carry it on every path. The plan is written here through the real protected writer, as the second release
// will write it; each path is the first to bring it to a separate device of the same account that holds the plan
// without the field.
const CAPTURED = 'sourceRecordContentAtISOAtCapture', FORMER = 'sourceRecordUpdatedAtISOAtCapture';

test('a plan holding the document content instant reaches another device by every sync and copy path', async ({ page, browser, baseURL }) => {
  test.setTimeout(300_000);
  const options = { baseURL, locale: 'pl-PL', timezoneId: 'Europe/Warsaw', serviceWorkers: 'block' };
  const { ids } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  const day = await activateFirstStage(page, panel);
  // The linked document is written again without a content change: a new write instant and the earlier content instant
  // anchored to it. The plan screen opens it at the end because it compares the content instant, not the write instant.
  await page.evaluate(({ patientId, id }) => window.VildaVault.savePatientNote({ patientId, id, title: 'Fikcyjna wcześniejsza notatka',
    body: 'Treść sprzed utworzenia planu.', category: 'observation' }), { patientId: ids.a, id: ids.note });
  const syncCode = await page.evaluate(password => window.VildaVault.exportSyncCode(password), PASSWORD);
  const initial = await page.evaluate(() => window.VildaVault.exportSyncPayload());
  const source = await page.evaluate(id => window.VildaVault.getPatientNote(id), ids.note);
  expect(typeof source.updatedAtISO).toBe('string');
  // The document's effective content instant as the vault reads it: contentAtISO is given only with a valid anchor.
  const contentInstant = source.contentAtISO === undefined ? source.updatedAtISO : source.contentAtISO;
  expect(contentInstant < source.updatedAtISO, 'the document holds a content instant earlier than its write instant').toBe(true);
  const written = await page.evaluate(async ({ planId, patientId, source, captured, contentInstant, day }) => {
    const vault = window.VildaVault, outcome = {};
    const evidence = { noteId: source.id, sourceRecordRevAtCapture: source.rev, [captured]: contentInstant };
    for (const action of ['associate', 'recordFact']) {
      const plan = await vault.getCarePlan(planId), common = { action, operationId: crypto.randomUUID(), planId, patientId, expectedRevision: plan.rev, stepId: plan.careContext.steps[0].id, evidence };
      const request = action === 'associate' ? { ...common, associationId: crypto.randomUUID(), kind: 'document' }
        : { ...common, factId: crypto.randomUUID(), kind: 'resultReceipt', effectiveDateISO: day };
      try { const result = await vault.mutateStagedCarePlan(request); outcome[action] = result && result.saved === true ? 'saved' : result && (result.code || result.reason) || 'not saved'; }
      catch (error) { outcome[action] = error && (error.code || error.message) || 'error'; }
    }
    return outcome;
  }, { planId: saved.id, patientId: ids.a, source, captured: CAPTURED, contentInstant, day });
  expect(written, 'the transaction model accepts evidence with the content instant').toEqual({ associate: 'saved', recordFact: 'saved' });
  const plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
  const holdsInstant = value => !!value && value.careContext.associations.some(item => item.noteId === source.id && item[CAPTURED] === contentInstant)
    && value.careContext.facts.some(fact => fact.evidence.noteId === source.id && fact.evidence[CAPTURED] === contentInstant);
  expect(holdsInstant(plan)).toBe(true); expect(JSON.stringify(plan)).not.toContain(FORMER);
  const beside = await page.evaluate(async ({ ids, day }) => ({
    a: (await window.VildaVault.savePatientNote({ patientId: ids.a, title: 'Fikcyjna notatka obok planu', body: 'Fikcyjna zmiana obok planu.', category: 'observation' })).id,
    b: (await window.VildaVault.savePatientNote({ patientId: ids.b, title: 'Fikcyjne przypomnienie obok planu', body: 'Fikcyjna zmiana drugiego pacjenta.', category: 'reminder-contact', dueDateISO: day })).id,
  }), { ids, day });
  const transfers = await page.evaluate(async ({ planId, patientId }) => {
    const vault = window.VildaVault, text = value => typeof value === 'string' ? value : JSON.stringify(value);
    return { payload: await vault.exportSyncPayload(), delta: await vault.buildNoteDelta(planId),
      backup: text(await vault.exportVaultBackup()), patient: text(await vault.exportPatientEnvelope(patientId)) };
  }, { planId: saved.id, patientId: ids.a });
  expect(JSON.stringify(transfers.payload.patientNotes.find(note => note.id === saved.id).careContext.nativeState)).toContain(CAPTURED);
  async function read(device) {
    return device.evaluate(async ({ planId, patientId, noteIds, day }) => {
      const vault = window.VildaVault, attempt = async run => { try { return await run(); } catch (error) { return 'error: ' + (error && (error.code || error.message)); } };
      const present = {};
      for (const id of noteIds) present[id] = !!(await vault.getPatientNote(id));
      return { plan: await vault.getCarePlan(planId), present,
        patientNotes: await attempt(async () => (await vault.listPatientNotesForPatient(patientId)).some(note => note.id === planId)),
        accountNotes: await attempt(async () => (await vault.listAllPatientNotes()).some(note => note.id === planId)),
        reminders: await attempt(async () => Array.isArray(await vault.listPatientNotesDueByDate(day + 'T23:59:59.999Z'))) };
    }, { planId: saved.id, patientId: ids.a, noteIds: [ids.note, beside.a, beside.b], day });
  }
  const contexts = [];
  async function device(label) {
    const context = await browser.newContext(options); contexts.push(context);
    const other = await context.newPage(); await openNativePage(other);
    await other.evaluate(({ syncCode, password, label }) => window.VildaVault.importSyncCode(syncCode, password, { label }), { syncCode, password: PASSWORD, label });
    await other.reload({ waitUntil: 'load' }); await readyForPatient(other);
    await other.evaluate(() => window.VildaSyncIntegration.setSyncEnabled(false));
    await other.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), initial);
    for (const current of [page, other]) {
      const notice = current.getByRole('alertdialog', { name: 'Hasło do konta zostało zmienione', exact: true });
      if (await notice.isVisible()) await notice.getByRole('button', { name: 'Rozumiem', exact: true }).click();
    }
    const before = await other.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
    expect(before.rev, label).toBeLessThan(plan.rev); expect(JSON.stringify(before), label).not.toContain(CAPTURED);
    expect(JSON.stringify(before), label).not.toContain(FORMER);
    return other;
  }
  function expectCarried(state, name, besideIds) {
    expect(state.plan && state.plan.rev, name).toBe(plan.rev);
    expect(holdsInstant(state.plan), name).toBe(true);
    expect(state.plan.careContext.associations, name).toEqual(plan.careContext.associations);
    expect(state.plan.careContext.facts, name).toEqual(plan.careContext.facts);
    for (const id of besideIds) expect(state.present[id], name + ': note beside the plan').toBe(true);
    expect({ patientNotes: state.patientNotes, accountNotes: state.accountNotes, reminders: state.reminders }, name).toEqual({ patientNotes: true, accountNotes: true, reminders: true });
  }
  const paths = [
    ['full sync payload', other => other.evaluate(payload => window.VildaVault.mergeSyncPayload(payload), transfers.payload), [beside.a, beside.b]],
    ['plan delta', other => other.evaluate(delta => window.VildaVault.applyEncryptedDelta(delta), transfers.delta), []],
    ['journal event', async other => {
      expect(await other.evaluate(delta => window.VildaVault._eventLog.applyEncryptedEvent(delta), transfers.delta)).toMatchObject({ status: 'applied' });
    }, []],
    ['account copy merge', async other => {
      const preview = await other.evaluate(({ backup, password }) => window.VildaVault.previewVaultBackupMerge(backup, password), { backup: transfers.backup, password: PASSWORD });
      expect(preview.updatedPatientNoteCount).toBeGreaterThan(0);
      await other.evaluate(({ backup, password }) => window.VildaVault.mergeVaultBackup(backup, password), { backup: transfers.backup, password: PASSWORD });
    }, [beside.a, beside.b]],
    ['patient file import', other => other.evaluate(({ envelope, password }) => window.VildaVault.importPatientFromEnvelope(envelope, password), { envelope: transfers.patient, password: PASSWORD }), [beside.a]],
  ];
  try {
    let last = null;
    for (const [name, bring, besideIds] of paths) {
      const other = await device('Fikcyjne urządzenie: ' + name);
      await bring(other);
      expectCarried(await read(other), name, besideIds);
      last = other;
    }
    const restoredContext = await browser.newContext(options); contexts.push(restoredContext);
    const restored = await restoredContext.newPage(); await openNativePage(restored);
    await restored.evaluate(({ backup, password }) => window.VildaVault.restoreVaultBackup(backup, password, { label: 'Fikcyjne konto odtworzone z planem' }), { backup: transfers.backup, password: PASSWORD });
    await expect.poll(() => restored.evaluate(() => window.VildaVault.isUnlocked())).toBe(true);
    expectCarried(await read(restored), '.wiw restore', [ids.note, beside.a, beside.b]);
    // The device holding the plan keeps its notes, reminders and exports, and accepts a change from another device.
    const fromOther = await last.evaluate(async patientId => {
      const note = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjna notatka z drugiego urządzenia', body: 'Fikcyjna zmiana z drugiego urządzenia.', category: 'observation' });
      return { id: note.id, delta: await window.VildaVault.buildNoteDelta(note.id) };
    }, ids.b);
    await page.evaluate(delta => window.VildaVault.applyEncryptedDelta(delta), fromOther.delta);
    const local = await read(page);
    expectCarried(local, 'device holding the plan', [ids.note, beside.a, beside.b]);
    expect(await page.evaluate(async ({ planId, noteId }) => {
      const vault = window.VildaVault;
      return { delta: !!(await vault.getPatientNote(noteId)), exported: (await vault.exportSyncPayload()).patientNotes.some(note => note.id === planId),
        backup: typeof (await vault.exportVaultBackup()) !== 'undefined' };
    }, { planId: saved.id, noteId: fromOther.id })).toEqual({ delta: true, exported: true, backup: true });
    const workspace = page.locator(CARE_WORKSPACE);
    if (await workspace.isVisible()) await workspace.getByRole('button', { name: 'Zamknij Przypomnienia', exact: true }).click();
    await expect(workspace).toHaveCount(0);
    await page.locator('#vildaRemindersBtn').click();
    await workspace.getByRole('button', { name: /^Do wykonania(?:\s|$)/u }).click();
    await expect(workspace.locator('[data-note-id="' + beside.b + '"]')).toBeVisible();
    await expect(workspace).not.toContainText('Nie udało się wczytać przypomnień');
    await workspace.getByRole('button', { name: 'Plany opieki', exact: true }).click();
    const reopened = workspace.locator('.vcp');
    await selectPlan(reopened, saved.id);
    await reopened.getByRole('button', { name: 'Otwórz dokument', exact: true }).first().click();
    await expect(reopened.locator('.vcp-record-body')).toHaveText('Treść sprzed utworzenia planu.');
    await expect(reopened).not.toContainText('Dokument został zmieniony po powiązaniu z planem.');
  } finally { for (const context of contexts) await context.close(); }
});

test('the plan screen of this release links a document without its content instant or the former write instant', async ({ page }) => {
  const { ids, original, requests } = await seedNativeAccount(page);
  const { panel, plan: saved } = await applyFromLibrary(page, ids);
  const day = await activateFirstStage(page, panel);
  const source = await page.evaluate(id => window.VildaVault.getPatientNote(id), ids.note);
  expect(typeof source.updatedAtISO, 'the document has an instant the screen could copy').toBe('string');
  const firstStep = panel.locator('.vcp-step', { hasText: FIRST_STEP });
  await firstStep.getByRole('button', { name: 'Powiąż dokument lub termin', exact: true }).click();
  let form = page.locator(CARE_FORM);
  await form.getByLabel('Dokument pacjenta', { exact: true }).selectOption(ids.note);
  await expect(form.locator('.vcp-result-preview')).toContainText('Treść sprzed utworzenia planu.');
  await form.getByLabel('Potwierdzam powiązanie wybranego dokumentu z tym krokiem', { exact: true }).check();
  await form.getByRole('button', { name: 'Zapisz powiązanie', exact: true }).click();
  await expect(form).toHaveCount(0);
  await firstStep.getByRole('button', { name: 'Zapisz otrzymanie wyniku', exact: true }).click();
  form = page.locator(CARE_FORM);
  await form.getByLabel('Data otrzymania wyniku', { exact: true }).fill(day);
  await form.getByLabel('Dokumentacja', { exact: true }).selectOption('existing');
  await form.getByLabel('Dokument pacjenta', { exact: true }).selectOption(ids.note);
  await expect(form.locator('.vcp-result-preview')).toContainText('Treść sprzed utworzenia planu.');
  await form.getByLabel('Potwierdzam, że dokumentuje to otrzymanie wyniku tego kroku', { exact: true }).check();
  await form.getByRole('button', { name: 'Zapisz potwierdzenie', exact: true }).click();
  await expect(form).toHaveCount(0);
  const plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
  expect(plan.careContext.associations).toEqual([expect.objectContaining({ noteId: ids.note, sourceRecordRevAtCapture: source.rev })]);
  expect(plan.careContext.facts.map(fact => fact.evidence)).toEqual([{ noteId: ids.note, sourceRecordRevAtCapture: source.rev }]);
  const stored = await page.evaluate(async ({ password, planId }) => {
    const vault = window.VildaVault, cryptoApi = window.VildaCrypto;
    const payload = await vault.exportSyncPayload(), envelope = cryptoApi.parseEnvelope(await vault.exportVaultBackup());
    const key = await cryptoApi.unwrapMasterFromEnvelope(envelope, password);
    const backup = await cryptoApi.decryptJson(key, envelope.payload.iv, envelope.payload.data);
    return { payload: payload.patientNotes.find(note => note.id === planId), backup: backup.patientNotes.find(note => note.id === planId) };
  }, { password: PASSWORD, planId: saved.id });
  expect(stored.payload.careContext.nativeState.record.careContext.associations).toHaveLength(1);
  expect(stored.backup.careContext.nativeState.record.careContext.facts).toHaveLength(1);
  for (const [name, value] of [['plan', plan], ['sync payload', stored.payload], ['account copy', stored.backup]]) {
    expect(JSON.stringify(value), name).not.toContain(CAPTURED); expect(JSON.stringify(value), name).not.toContain(FORMER);
  }
  await assertOrdinaryAccount(page, ids, original, requests);
});

test.describe('ordinary staged plans with the production PWA cache', () => {
  test.use({ serviceWorkers: 'allow' });

  test('cold offline reload imports the precached modules and applies a template without account preparation', async ({ page, context }) => {
    const { ids, original, requests } = await seedNativeAccount(page);
    expect(await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => /\/runtime\/clinical-workspace-v1\/.*\.mjs(?:\?|$)/u.test(entry.name)).map(entry => entry.name))).toEqual([]);
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.register('/service-worker-kalorii.js', { scope: '/' });
      await navigator.serviceWorker.ready;
      const worker = registration.installing || registration.waiting || registration.active;
      if (worker.state !== 'activated') await new Promise((resolve, reject) => {
        worker.addEventListener('statechange', () => {
          if (worker.state === 'activated') resolve();
          else if (worker.state === 'redundant') reject(new Error('Production service worker installation failed'));
        });
      });
    });
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const cached = await page.evaluate(async () => {
      const response = await fetch('/runtime/clinical-workspace-v1/manifest.json');
      if (!response.ok) throw new Error('Missing production module manifest');
      const manifest = await response.json();
      return Promise.all(manifest.files.map(async file => ({ path: file.path, present: Boolean(await caches.match('/' + file.path)) })));
    });
    expect(cached.length).toBeGreaterThan(0);
    expect(cached.filter(file => !file.present)).toEqual([]);
    const moduleResponses = [];
    page.on('response', response => {
      if (/\/runtime\/clinical-workspace-v1\/.*\.mjs(?:\?|$)/u.test(response.url()))
        moduleResponses.push({ path: new URL(response.url()).pathname, fromServiceWorker: response.fromServiceWorker() });
    });
    await context.setOffline(true);
    await page.reload({ waitUntil: 'load' });
    await readyForPatient(page);
    expect(await page.evaluate(() => performance.getEntriesByType('resource')
      .filter(entry => /\/runtime\/clinical-workspace-v1\/.*\.mjs(?:\?|$)/u.test(entry.name)).map(entry => entry.name))).toEqual([]);
    expect(await page.evaluate(() => fetch('/__native-care-uncached-offline-probe', { cache: 'no-store' }).then(() => false, () => true))).toBe(true);
    expect(await page.evaluate(() => new URL(navigator.serviceWorker.controller.scriptURL).pathname)).toBe('/service-worker-kalorii.js');
    const { panel, plan: saved } = await applyFromLibrary(page, ids);
    const day = await activateFirstStage(page, panel);
    await panel.getByRole('button', { name: 'Zapisz otrzymanie wyniku', exact: true }).click();
    const dialog = page.locator(CARE_FORM);
    await dialog.getByLabel('Data otrzymania wyniku', { exact: true }).fill(day);
    await dialog.getByLabel('Treść dokumentacji', { exact: true }).fill('Fikcyjny dokument utworzony po zimnym uruchomieniu offline.');
    await dialog.getByLabel('Potwierdzam, że dokumentuje to otrzymanie wyniku tego kroku', { exact: true }).check();
    await dialog.getByRole('button', { name: 'Zapisz potwierdzenie', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    const plan = await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id);
    expect(plan.careContext.stages.map(stage => stage.control.state)).toEqual(['active', 'planned']);
    expect(plan.careContext.facts).toHaveLength(1);
    const documentId = plan.careContext.facts[0].evidence.noteId;
    const evidence = await page.evaluate(id => window.VildaVault.getPatientNote(id), documentId);
    expect(evidence).toMatchObject({ patientId: ids.a, clinicalDateISO: day, body: 'Fikcyjny dokument utworzony po zimnym uruchomieniu offline.' });
    expect(moduleResponses.length).toBeGreaterThan(0);
    expect(moduleResponses.every(response => response.fromServiceWorker)).toBe(true);
    await assertOrdinaryAccount(page, ids, original, requests);
    await page.reload({ waitUntil: 'load' }); await readyForPatient(page);
    expect(await page.evaluate(id => window.VildaVault.getCarePlan(id), saved.id)).toEqual(plan);
    expect(await page.evaluate(id => window.VildaVault.getPatientNote(id), documentId)).toEqual(evidence);
    await assertOrdinaryAccount(page, ids, original, requests);
  });
});
