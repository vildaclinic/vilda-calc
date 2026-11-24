// Accepted B1, backed by real native Patient/Vault actors. All identities,
// diagnoses, medications and records in this file are deliberately fictional.
import { expect, test } from '@playwright/test';
import { createFictionalVault, fictionalPatient, loadPatient, readyForPatient, shellFrame } from '../support/centile-live-fixture.mjs';

const CARD = '#vhomePatientCard';
const NATIVE = '.vhome-native-patient-card';
const DIALOG = '.vilda-auth-card[role="dialog"]:has(.vhome-native-patient-card)';
const TREATMENT = `${NATIVE} [data-treatment-root]`;
const EDITOR = '#vhomePatientTreatmentDialog';
const SECTIONS = ['antro', 'treatment', 'traj', 'notes', 'timeline', 'lab', 'care'];

test.use({ serviceWorkers: 'block', reducedMotion: 'reduce', viewport: { width: 1440, height: 1000 } });
test.setTimeout(240_000);

async function settled(frame) {
  await frame.waitForFunction(() => window.VildaVault?.isUnlocked()
    && window.VildaAuthUI?.isBootReady()
    && !window.__vildaPersistRestoring && !window.__vildaLustroWpis
    && !window.__vildaSuspendIntakeUserReset
    && !window.VildaDataImportExport.isMainSessionRestorePending()
    && !window.VildaDobAge.restorePending());
}
function statusPatient(mass = 30.2) {
  const patient = fictionalPatient({ firstName: 'Jan-B1', age: 10, height: 139, weight: mass });
  Object.assign(patient.user, { ageMonths: 6, dobISO: '2016-05-03', measuredAtISO: '2026-11-03' });
  patient.advanced.fatherHeight = 179;
  Object.assign(patient.advanced.data, {
    currentAgeMonths: 126, fatherHeight: 179,
    measurements: [
      { ageMonths: 114, height: 133.8, weight: 27.5 },
      { ageMonths: 120, height: 136.4, weight: 28.8 },
      { ageMonths: 123, height: 137.6, weight: 29.6 },
    ],
  });
  patient.chartCreator.growth.free.height = [];
  return patient;
}
async function setup(page, { shell = false, payload } = {}) {
  await page.addInitScript(() => { window.__VILDA_HOME_WORKSPACE_PREVIEW__ = true; });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || ['data:', 'blob:'].includes(url.protocol)
      ? route.continue() : route.abort();
  });
  const fixture = await createFictionalVault(page, { shell, waitForAccountReadyBeforeReload: true });
  let id = fixture.ids.a;
  if (payload) id = await fixture.frame.evaluate(async value => (await window.VildaVault.savePatient(value, { dedup: false })).patientId, payload);
  await loadPatient(fixture.frame, id, 'restore'); await settled(fixture.frame);
  await fixture.frame.waitForFunction(() => Boolean(window.VildaHomePatient));
  await expect(fixture.frame.locator(CARD)).toBeVisible();
  await fixture.frame.evaluate(() => {
    window.vildaPersistFlushNow({ force: true });
    window.VildaDataImportExport.saveMainSessionNow({ force: true });
  });
  return { ...fixture, id };
}
async function records(frame, id) {
  return frame.evaluate(async patientId => ({
    patient: await window.VildaVault.getPatient(patientId),
    notes: (await window.VildaVault.listPatientNotesForPatient(patientId)).sort((a, b) => a.id.localeCompare(b.id)),
    plans: (await window.VildaVault.listCarePlans({ patientId })).sort((a, b) => a.id.localeCompare(b.id)),
  }), id);
}
async function clinical(frame) {
  return frame.evaluate(() => {
    const payload = window.VildaDataImportExport.captureCurrentUserDataReadOnly();
    const session = window.VildaPersistence.readMainSession();
    delete payload.timestampISO; if (session) delete session.timestampISO;
    return { payload, session };
  });
}
async function flushMain(frame) {
  await frame.evaluate(async () => {
    await window.vildaPersistFlushNow({ force: true });
    await window.VildaDataImportExport.saveMainSessionNow({ force: true });
  });
}
async function treatmentState(frame, id) {
  return frame.evaluate(async patientId => {
    const scope = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId, isCurrent: () => true });
    try { return await scope.read(); } finally { scope.dispose(); }
  }, id);
}
async function openCard(frame) {
  await frame.locator(CARD).getByRole('button', { name: 'Powiększ kartę pacjenta', exact: true }).click();
  await expect(frame.locator(NATIVE)).toBeVisible(); await expect(frame.locator(DIALOG)).toBeVisible();
  return frame.locator(DIALOG);
}
async function selectSection(frame, key) {
  const select = frame.locator(`${NATIVE} .vhome-b1-mobile-select`);
  if (await select.isVisible()) await select.selectOption(key);
  else await frame.locator(`${NATIVE} .vhome-b1-nav [data-tab="${key}"]`).click();
  const panel = frame.locator(`${NATIVE} .vilda-patient-tab-content[data-tab="${key}"]`);
  await expect(panel).toBeVisible(); return panel;
}
async function openTreatment(frame) {
  await openCard(frame); await selectSection(frame, 'treatment');
  await expect(frame.locator(TREATMENT)).toBeVisible();
  await expect(frame.locator(TREATMENT).getByRole('button', { name: 'Dodaj rozpoznanie', exact: true })).toBeEnabled();
  return frame.locator(TREATMENT);
}
async function closeCard(frame) {
  await frame.locator(DIALOG).getByRole('button', { name: /^Zamknij(?: kartę)?$/ }).last().click();
  await expect(frame.locator(NATIVE)).toBeHidden();
}
async function geometry(frame, selector = DIALOG) {
  const measure = () => frame.locator(selector).evaluate(node => {
    const box = node.getBoundingClientRect();
    // Overlay and classic scrollbars resolve 100vw differently while the
    // modal is locked; neither the root rect nor innerWidth works for both.
    const probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;width:100vw;height:0;margin:0;padding:0;border:0;visibility:hidden;pointer-events:none';
    document.body.append(probe);
    const viewportWidth = probe.getBoundingClientRect().width;
    probe.remove();
    return { width: box.width, height: box.height, x: box.x, y: box.y,
      viewportWidth, viewportHeight: innerHeight, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
  // Opening motion may still be running when the native sheet becomes visible.
  // Poll at CSS-pixel precision; the raw checks below retain their original
  // half-pixel bound, including WebKit's 1/64px layout rounding.
  await expect.poll(async () => {
    const value = await measure(), width = Math.min(1000, value.viewportWidth - 32), height = Math.min(820, value.viewportHeight - 32);
    const deltas = { width: value.width - width, height: value.height - height,
      x: value.x - (value.viewportWidth - width) / 2, y: value.y - (value.viewportHeight - height) / 2 };
    return Object.fromEntries(Object.entries(deltas).map(([key, value]) => [key, Math.round(value) || 0]));
  }).toEqual({ width: 0, height: 0, x: 0, y: 0 });
  const actual = await measure();
  expect(actual.width).toBeCloseTo(Math.min(1000, actual.viewportWidth - 32), 0);
  expect(actual.height).toBeCloseTo(Math.min(820, actual.viewportHeight - 32), 0);
  expect(actual.x).toBeCloseTo((actual.viewportWidth - actual.width) / 2, 0);
  expect(actual.y).toBeCloseTo((actual.viewportHeight - actual.height) / 2, 0);
  expect(actual.x).toBeGreaterThanOrEqual(0); expect(actual.y).toBeGreaterThanOrEqual(0);
  expect(actual.x + actual.width).toBeLessThanOrEqual(actual.viewportWidth + 1);
  expect(actual.y + actual.height).toBeLessThanOrEqual(actual.viewportHeight + 1);
  expect(actual.scrollWidth - actual.clientWidth).toBeLessThanOrEqual(1);
  expect(await frame.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(1);
  return actual;
}
function sameFrame(actual, expected) {
  for (const key of ['x', 'y', 'width', 'height']) expect(actual[key]).toBeCloseTo(expected[key], 0);
}
async function saveEditor(frame) {
  await frame.locator(`${EDITOR} button[type="submit"]`).click();
  await expect(frame.locator(EDITOR)).toBeHidden();
}
async function chooseDiagnosisCode(editor, code, { query = code, manual = false } = {}) {
  await editor.locator('.vpt-icd10-query').fill(query);
  const option = manual ? editor.locator('[data-icd10-manual="true"]') : editor.locator(`[data-icd10-code="${code}"]`);
  await expect(option).toBeVisible(); await option.click();
  await expect(editor.locator('input[type="hidden"][name="code"]')).toHaveValue(code);
}
async function createDiagnosis(frame, { name, code = '', manual = false }) {
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible(); await geometry(frame, EDITOR);
  await editor.locator('[name="name"]').fill(name);
  if (code) await chooseDiagnosisCode(editor, code, { manual });
  await editor.locator('[name="dateISO"]').fill('2026-09-15'); await saveEditor(frame);
}
async function createEpisode(frame, { title, diagnosisIds, method = 'nonpharmacological' }) {
  await frame.locator(`${TREATMENT} [data-treatment-action="new-therapy"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible(); await geometry(frame, EDITOR);
  await editor.locator('[name="title"]').fill(title); await editor.locator('[name="method"]').selectOption(method);
  await editor.locator('[name="startDateISO"]').fill('2026-10-01');
  for (const id of diagnosisIds) await editor.locator(`[name="diagnosisIds"][value="${id}"]`).check();
  await editor.locator('[name="notes"]').fill('Fikcyjny zapis uzgodnień. Bez automatycznego zalecenia ani dawki.');
  await saveEditor(frame);
}
async function addFollowup(frame, episodeId, dateISO, body) {
  await frame.locator(`${TREATMENT} [data-treatment-therapy-id="${episodeId}"] [data-treatment-action="show-therapy"]`).click();
  await frame.locator(`${TREATMENT} [data-treatment-detail-id="${episodeId}"] [data-treatment-action="new-followup"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible();
  await editor.locator('[name="dateISO"]').fill(dateISO); await editor.locator('[name="body"]').fill(body); await saveEditor(frame);
}

test('B1 native card: seven sections keep the accepted shared frame and do not mutate the patient', async ({ page }) => {
  const { frame, id } = await setup(page, { payload: statusPatient() });
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await expect(frame.locator(`${CARD} [role="tab"][aria-selected="true"]`)).toContainText('Notatki');
  await openCard(frame);
  await expect(frame.locator(`${NATIVE} .vhome-b1-nav [data-tab]`)).toHaveCount(7);
  await frame.locator(`${NATIVE} .vhome-b1-menu-toggle`).click();
  const actions = frame.locator(`${NATIVE} [role="menu"]`); await expect(actions).toBeVisible();
  for (const name of ['Edytuj pacjenta', 'Nowy pomiar', 'Historia wizyt', 'Historia wersji']) {
    await expect(actions.getByRole('menuitem', { name, exact: true })).toBeVisible();
  }
  await actions.press('Escape'); await expect(actions).toBeHidden(); await expect(frame.locator(DIALOG)).toBeVisible();
  for (const [width, height] of [[1440, 1000], [1920, 1000], [834, 1000], [850, 1000], [390, 1000], [320, 1000], [390, 844]]) {
    await page.setViewportSize({ width, height });
    for (const key of SECTIONS) { await selectSection(frame, key); await geometry(frame); }
    if ([1440, 850, 390].includes(width)) {
      const bounds = await frame.locator(DIALOG).boundingBox();
      await selectSection(frame, 'treatment');
      await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
      const editor = frame.locator(EDITOR); await expect(editor).toBeVisible();
      await geometry(frame, EDITOR); sameFrame(await editor.boundingBox(), bounds);
      await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
      await expect(editor).toBeHidden();
      const notes = await selectSection(frame, 'notes');
      await notes.getByRole('button', { name: '+ Dodaj notatkę', exact: true }).click();
      const note = frame.locator('.vilda-pne.vhome-b1-native-note'); await expect(note).toBeVisible();
      await geometry(frame, '.vilda-pne.vhome-b1-native-note'); sameFrame(await note.boundingBox(), bounds);
      await note.getByRole('button', { name: 'Anuluj', exact: true }).click();
      await expect(note).toBeHidden();
    }
  }
  await closeCard(frame);
  expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
});

test('B1 Status: native results retain independent clinical colors for height, mass, BMI and Cole', async ({ page }) => {
  const fixture = await setup(page, { payload: statusPatient() });
  // The unchanged native Status uses vildaWiekPomiaruMies for these saved
  // calendar dates (126.02874743326488 months), not a naive 126-month sample.
  // These formatted Cole values were observed through the real legacy Status
  // and its original VildaBmi.cole call; the presenter must preserve them.
  const cases = [
    { mass: 30.2, values: ['139', '30,2', '15,6', '90,3'], centiles: ['22.', '18.', '23.'], tones: ['normal', 'normal', 'normal', 'normal'], assessments: ['Prawidłowe', 'W normie'] },
    { mass: 40.5, values: ['139', '40,5', '21,0', '121,1'], centiles: ['22.', '69.', '85.'], tones: ['normal', 'normal', 'warn', 'danger'], assessments: ['Nadwaga', 'Otyłość'] },
    { mass: 52.4, values: ['139', '52,4', '27,1', '156,7'], centiles: ['22.', '93.', '98.'], tones: ['normal', 'warn', 'danger', 'danger'], assessments: ['Otyłość', 'Otyłość'] },
  ];
  const observedColors = new Map();
  for (const example of cases) {
    const id = await fixture.frame.evaluate(async payload => (await window.VildaVault.savePatient(payload, { dedup: false })).patientId, statusPatient(example.mass));
    await loadPatient(fixture.frame, id, 'restore'); await settled(fixture.frame); await openCard(fixture.frame);
    const panel = await selectSection(fixture.frame, 'antro');
    for (const [index, key] of ['height', 'weight', 'bmi', 'cole'].entries()) {
      const metric = panel.locator(`[data-home-patient-metric="${key}"]`);
      await expect(metric).toContainText(example.values[index]);
      if (index < 3) await expect(metric).toContainText(example.centiles[index]);
      if (index >= 2) await expect(metric.locator('.vhome-b1-assessment')).toHaveText(example.assessments[index - 2]);
      await expect(metric).toHaveAttribute('data-tone', example.tones[index]);
      const color = await metric.locator('[data-home-patient-metric-value]').evaluate(node => getComputedStyle(node).color);
      if (observedColors.has(example.tones[index])) expect(color).toBe(observedColors.get(example.tones[index]));
      observedColors.set(example.tones[index], color);
    }
    await closeCard(fixture.frame);
  }
  expect([...observedColors.keys()].sort()).toEqual(['danger', 'normal', 'warn']);
  expect(new Set(observedColors.values()).size).toBe(3);
});

test('B1 Leczenie: independent manual diagnoses, multiple therapies and completion persist through F5', async ({ page }) => {
  const fixture = await setup(page, { shell: true }); let frame = fixture.frame;
  const otherBefore = await records(frame, fixture.ids.b), clinicalBefore = await clinical(frame);
  await openTreatment(frame);
  await createDiagnosis(frame, { name: 'Fikcyjne rozpoznanie bez kodu' });
  let state = await treatmentState(frame, fixture.id);
  expect(state.diagnoses).toHaveLength(1); expect(state.episodes).toHaveLength(0);
  expect(state.diagnoses[0].context.code).toBe('');
  await createDiagnosis(frame, { name: 'Fikcyjne nadciśnienie samoistne', code: 'I10' });
  state = await treatmentState(frame, fixture.id);
  const hypertension = state.diagnoses.find(row => row.context.code === 'I10');
  expect(hypertension.context.codingSystem).toBe('ICD-10'); expect(hypertension.context.status).toBe('active');
  const diagnosisIds = state.diagnoses.map(row => row.id);
  await createEpisode(frame, { title: 'Fikcyjne postępowanie niefarmakologiczne', diagnosisIds });
  await createEpisode(frame, { title: 'Fikcyjna odrębna terapia', diagnosisIds: [hypertension.id], method: 'other' });
  state = await treatmentState(frame, fixture.id); expect(state.episodes).toHaveLength(2);
  const episode = state.episodes.find(row => row.context.title === 'Fikcyjne postępowanie niefarmakologiczne');
  expect(episode.context.diagnosisIds.slice().sort()).toEqual(diagnosisIds.slice().sort());
  await addFollowup(frame, episode.id, '2026-11-02', 'Fikcyjna najnowsza kontrola.');
  await addFollowup(frame, episode.id, '2026-10-15', 'Fikcyjna starsza kontrola dopisana później.');
  await expect(frame.locator(`${TREATMENT} [data-treatment-therapy-id="${episode.id}"]`)).toContainText('02.11.2026');
  state = await treatmentState(frame, fixture.id);
  expect(state.episodes.find(row => row.id === episode.id).context.followups.map(row => row.dateISO).sort())
    .toEqual(['2026-10-15', '2026-11-02']);
  await frame.locator(`${TREATMENT} [data-treatment-therapy-id="${episode.id}"] [data-treatment-action="edit-therapy"]`).click();
  await frame.locator(`${EDITOR} [name="status"]`).selectOption('closed');
  await frame.locator(`${EDITOR} [name="endDateISO"]`).fill('2026-11-03'); await saveEditor(frame);
  const saved = await treatmentState(frame, fixture.id);
  expect(saved.episodes.find(row => row.id === episode.id).context.status).toBe('closed');
  expect(saved.diagnoses.every(row => row.context.status === 'active')).toBe(true);
  expect(saved.episodes.find(row => row.id !== episode.id).context.status).toBe('active');
  const notesPanel = await selectSection(frame, 'notes');
  await expect(notesPanel.locator('.vilda-patient-empty-msg')).toContainText('Brak notatek dla tego pacjenta.');
  await expect(notesPanel).not.toContainText('Fikcyjne nadciśnienie samoistne');
  await expect(notesPanel).not.toContainText('Fikcyjne postępowanie niefarmakologiczne');
  await selectSection(frame, 'treatment');
  expect(await clinical(frame)).toEqual(clinicalBefore); expect(await records(frame, fixture.ids.b)).toEqual(otherBefore);
  await closeCard(frame); await page.reload({ waitUntil: 'load' }); frame = await shellFrame(page);
  await readyForPatient(frame); await settled(frame); await openTreatment(frame);
  const restored = await treatmentState(frame, fixture.id);
  expect(restored.diagnoses).toEqual(saved.diagnoses); expect(restored.episodes).toEqual(saved.episodes);
  await expect(frame.locator(TREATMENT)).toContainText('I10'); await expect(frame.locator(TREATMENT)).toContainText('Fikcyjne rozpoznanie bez kodu');
});

test('B1 diagnosis deletion: patient-chart editors confirm removal, preserve independent documentation and do not restore it after F5', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  await frame.evaluate(patientId => window.VildaVault.savePatientNote({ patientId, category: 'observation',
    title: 'Fikcyjna niezależna notatka przy usuwaniu rozpoznania', body: 'Fikcyjny wywiad pozostaje bez zmian.' }), id);
  const otherBefore = await records(frame, ids.b), clinicalBefore = await clinical(frame);
  await openTreatment(frame);
  const editor = frame.locator(EDITOR);
  const remove = editor.getByRole('button', { name: 'Usuń rozpoznanie', exact: true });
  const targetName = 'Fikcyjne rozpoznanie przeznaczone do usunięcia';
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByText('Zapis w kartotece pacjenta', { exact: true })).toBeVisible();
  await expect(remove).toBeHidden();
  await editor.locator('[name="name"]').fill(targetName);
  await editor.locator('[name="dateISO"]').fill('2026-09-15');
  await saveEditor(frame);
  await createDiagnosis(frame, { name: 'Fikcyjne inne rozpoznanie zachowane w kartotece' });
  const diagnoses = (await treatmentState(frame, id)).diagnoses;
  const target = diagnoses.find(entry => entry.context.name === targetName);
  expect(target).toBeDefined();
  const independent = diagnoses.find(entry => entry.id !== target.id);
  expect(independent).toBeDefined();
  expect(diagnoses).toHaveLength(2);
  expect(diagnoses.every(entry => entry.baseNote.visitContext == null)).toBe(true);
  await createEpisode(frame, { title: 'Fikcyjny osobny epizod leczenia', diagnosisIds: [independent.id], method: 'other' });
  const treatmentBefore = await treatmentState(frame, id), before = await records(frame, id);
  expect(treatmentBefore.episodes).toHaveLength(1);
  expect(treatmentBefore.episodes[0].context.diagnosisIds).toEqual([independent.id]);
  expect(treatmentBefore.episodes[0].baseNote.visitContext ?? null).toBeNull();
  expect(await clinical(frame)).toEqual(clinicalBefore);
  const targetRow = frame.locator(`${TREATMENT} [data-treatment-diagnosis-id="${target.id}"]`);
  await targetRow.getByRole('button', { name: 'Edytuj', exact: true }).click();
  await expect(editor).toBeVisible();
  await expect(editor.getByText('Zapis w kartotece pacjenta', { exact: true })).toBeVisible();
  await expect(remove).toBeEnabled();
  const confirmRemoval = accept => page.waitForEvent('dialog').then(async confirmation => {
    const type = confirmation.type(), message = confirmation.message();
    if (accept) await confirmation.accept(); else await confirmation.dismiss();
    expect(type).toBe('confirm'); expect(message).toMatch(/rozpoznani/i);
  });
  await Promise.all([confirmRemoval(false), remove.click()]);
  await expect(editor).toBeVisible();
  await expect(editor.locator('[name="name"]')).toHaveValue(targetName);
  await expect(targetRow).toHaveCount(1);
  expect(await records(frame, id)).toEqual(before);
  expect(await clinical(frame)).toEqual(clinicalBefore);

  await Promise.all([confirmRemoval(true), remove.click()]);
  await expect(editor).toBeHidden();
  await expect(targetRow).toHaveCount(0);
  const after = await records(frame, id), remaining = await treatmentState(frame, id);
  expect(after.patient.snapshots).toEqual(before.patient.snapshots);
  expect(after.patient.profile).toEqual(before.patient.profile);
  expect(after.notes).toEqual(before.notes.filter(note => note.id !== target.id));
  expect(after.plans).toEqual(before.plans);
  expect(remaining.diagnoses).toEqual([independent]);
  expect(remaining.episodes).toEqual(treatmentBefore.episodes);
  expect(await clinical(frame)).toEqual(clinicalBefore);
  expect(await records(frame, ids.b)).toEqual(otherBefore);

  await closeCard(frame);
  await page.reload({ waitUntil: 'load' });
  await readyForPatient(frame); await settled(frame);
  await openTreatment(frame);
  await expect(frame.locator(`${TREATMENT} [data-treatment-diagnosis-id="${target.id}"]`)).toHaveCount(0);
  await expect(frame.locator(`${TREATMENT} [data-treatment-diagnosis-id="${independent.id}"]`)).toBeVisible();
  const restored = await treatmentState(frame, id), restoredRecords = await records(frame, id);
  expect(restored.diagnoses).toEqual([independent]);
  expect(restored.episodes).toEqual(treatmentBefore.episodes);
  expect(restoredRecords.patient.snapshots).toEqual(before.patient.snapshots);
  expect(restoredRecords.patient.profile).toEqual(before.patient.profile);
  expect(restoredRecords.notes).toEqual(after.notes);
  expect(restoredRecords.plans).toEqual(before.plans);
  expect(await records(frame, ids.b)).toEqual(otherBefore);
});

test('B1 treatment editors: typing, a real sync refresh and Cancel preserve the draft and main clinical session', async ({ page }) => {
  const { frame, id } = await setup(page);
  const background = await frame.evaluate(async patientId => {
    const result = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjne tło synchronizacji B1',
      body: 'Fikcyjny pierwotny zapis innej notatki.', category: 'observation' });
    return window.VildaVault.getPatientNote(result.id);
  }, id);
  await openTreatment(frame);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR); await editor.locator('[name="name"]').fill('Fikcyjny niezapisany prywatny tekst B1');
  await chooseDiagnosisCode(editor, 'I10');
  const root = await editor.elementHandle();
  const parent = await frame.locator(NATIVE).elementHandle();
  const merged = await frame.evaluate(async noteId => {
    const payload = structuredClone(await window.VildaVault.exportSyncPayload());
    const note = payload.patientNotes.find(row => row.id === noteId);
    note.body = 'Fikcyjny nowszy zapis z innego urządzenia.';
    note.updatedAtISO = new Date(Math.max(Date.parse(note.updatedAtISO) + 1000, Date.now())).toISOString();
    await window.VildaVault.mergeSyncPayload(payload);
    document.dispatchEvent(new CustomEvent('vilda:sync-merged'));
    return window.VildaVault.getPatientNote(noteId);
  }, background.id);
  const expectedRecords = { ...before.records, notes: before.records.notes.map(note => note.id === background.id ? merged : note) };
  await expect(editor).toBeVisible(); await expect(editor.locator('[name="name"]')).toHaveValue('Fikcyjny niezapisany prywatny tekst B1');
  expect(await root.evaluate(node => node === document.querySelector('#vhomePatientTreatmentDialog'))).toBe(true);
  expect(await parent.evaluate(node => node === document.querySelector('.vhome-native-patient-card'))).toBe(true);
  expect(merged.body).toBe('Fikcyjny nowszy zapis z innego urządzenia.');
  expect(await records(frame, id)).toEqual(expectedRecords);
  await flushMain(frame);
  expect(await clinical(frame)).toEqual(before.clinical);
  page.once('dialog', dialog => dialog.dismiss()); await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeVisible(); await expect(editor.locator('[name="name"]')).toHaveValue('Fikcyjny niezapisany prywatny tekst B1');
  expect(await root.evaluate(node => node === document.querySelector('#vhomePatientTreatmentDialog'))).toBe(true);
  expect(await clinical(frame)).toEqual(before.clinical); expect(await records(frame, id)).toEqual(expectedRecords);
  page.once('dialog', dialog => dialog.accept()); await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeHidden();
  // The real merge changed the native card fingerprint. Wait for the queued
  // replacement, rather than accepting a transient focus on the old control.
  await expect.poll(() => parent.evaluate(node => node.isConnected)).toBe(false);
  await expect(frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`)).toBeFocused();
  await frame.locator(`${TREATMENT} [data-treatment-action="new-therapy"]`).click();
  await editor.locator('[name="title"]').fill('Fikcyjna niezapisana terapia');
  await editor.locator('[name="method"]').selectOption('pharmacological');
  await editor.locator('[name="medication"]').fill('Fikcyjny preparat testowy');
  await editor.locator('[name="dose"]').fill('Fikcyjny zapis z dokumentacji');
  await editor.locator('[name="notes"]').fill('Fikcyjny tekst odrzucany bez zapisu.');
  await flushMain(frame);
  expect(await clinical(frame)).toEqual(before.clinical);
  page.once('dialog', dialog => dialog.accept()); await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(await clinical(frame)).toEqual(before.clinical); expect(await records(frame, id)).toEqual(expectedRecords);
});

test('B1 Leczenie preserves genuine GH and obesity monitors without inventing a diagnosis or generic episode', async ({ page }) => {
  const payload = statusPatient();
  // Shapes and values are the existing native treatment fixtures, now attached
  // to this test's independently created, explicitly fictional patient.
  payload.ghTherapyPoints = [{ id: 'fictional-b1-gh', type: 'start', ageYears: 9, ageMonths: 0,
    weight: 24.7, height: 128, drug: 'Omnitrope 10 mg', program: 'SNP',
    dose: 0.7 / 24.7, doseAbs: 0.7, doseUnit: 'mg/kg/d' }];
  payload.obesityTherapyPoints = [{ id: 'fictional-b1-obesity', type: 'start', ageYears: 9, ageMonths: 0,
    weight: 40, height: 128, drug: 'Wegovy', substance: 'semaglutyd', dose: '0,5 mg', dateISO: '2026-01-15' }];
  const { frame, id } = await setup(page, { payload });
  const before = await records(frame, id), clinicalBefore = await clinical(frame);
  await expect(frame.locator(CARD)).toContainText(/GH|Leczenie/);
  const treatment = await openTreatment(frame);
  const gh = treatment.locator('.vilda-kg-karta', { hasText: 'Omnitrope 10 mg' });
  await expect(gh).toBeVisible();
  await expect(gh.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(gh).toContainText('Leczony hormonem wzrostu (rhGH)');
  const obesity = treatment.locator('.vilda-ko-karta', { hasText: 'Wegovy' });
  await expect(obesity).toBeVisible();
  await expect(obesity.getByRole('tab', { name: 'Przegląd', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(obesity).toContainText('Leczenie otyłości');
  const legacyOnly = await treatmentState(frame, id);
  expect(legacyOnly.diagnoses).toEqual([]); expect(legacyOnly.episodes).toEqual([]);
  await createDiagnosis(frame, { name: 'Fikcyjne niezależne rozpoznanie', code: 'I10' });
  const after = await records(frame, id), generic = await treatmentState(frame, id);
  expect(generic.diagnoses).toHaveLength(1); expect(generic.episodes).toEqual([]);
  expect(after.patient.snapshots).toEqual(before.patient.snapshots);
  expect(await clinical(frame)).toEqual(clinicalBefore);
  expect(after.notes.filter(note => !note.treatmentContext)).toEqual(before.notes);
});

test('B1 treatment: a delayed real pre-write read cannot save after closing the card and loading another patient', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const seeded = await frame.evaluate(async patientId => {
    const scope = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId, isCurrent: () => true });
    try { return await scope.createEpisode({ title: 'Fikcyjna terapia pacjenta A', method: 'other', status: 'active' }); }
    finally { scope.dispose(); }
  }, id);
  await openTreatment(frame);
  await frame.locator(`${TREATMENT} [data-treatment-therapy-id="${seeded.id}"] [data-treatment-action="edit-therapy"]`).click();
  await frame.locator(`${EDITOR} [name="title"]`).fill('Fikcyjna zmiana, której nie wolno zapisać po zmianie właściciela.');
  const beforeA = await records(frame, id), beforeB = await records(frame, ids.b);
  await frame.evaluate(patientId => {
    const vault = window.VildaVault, originalRead = vault.listPatientNotesForPatient;
    let release; const wait = new Promise(resolve => { release = resolve; });
    const gate = { entered: 0, completed: 0, writes: [], pending: [], originals: {} };
    vault.listPatientNotesForPatient = function (id, ...args) {
      const actual = Reflect.apply(originalRead, this, [id, ...args]);
      if (id !== patientId) return actual;
      const result = Promise.resolve(actual).then(rows => {
        gate.entered += 1; return wait.then(() => rows);
      }).finally(() => { gate.completed += 1; });
      gate.pending.push(result.then(() => {}, () => {})); return result;
    };
    for (const name of ['savePatientNoteOnce', 'updateExistingPatientNote']) {
      const original = vault[name]; gate.originals[name] = original;
      vault[name] = function (...args) { gate.writes.push(name); return Reflect.apply(original, this, args); };
    }
    gate.release = async () => {
      vault.listPatientNotesForPatient = originalRead; release(); await Promise.all(gate.pending);
    };
    gate.restore = () => { for (const [name, original] of Object.entries(gate.originals)) vault[name] = original; };
    window.__treatmentPreWriteRead = gate;
  }, id);
  await frame.locator(`${EDITOR} button[type="submit"]`).click();
  await expect.poll(() => frame.evaluate(() => window.__treatmentPreWriteRead.entered)).toBeGreaterThan(0);
  await frame.evaluate(() => window.VildaHomePatient.close(true, false));
  await expect(frame.locator(EDITOR)).toBeHidden(); await expect(frame.locator(NATIVE)).toBeHidden();
  await loadPatient(frame, ids.b, 'restore'); await settled(frame);
  await frame.evaluate(async () => {
    await window.__treatmentPreWriteRead.release();
    await new Promise(resolve => { requestAnimationFrame(() => requestAnimationFrame(resolve)); });
  });
  expect(await frame.evaluate(() => window.__treatmentPreWriteRead.writes)).toEqual([]);
  expect(await records(frame, id)).toEqual(beforeA); expect(await records(frame, ids.b)).toEqual(beforeB);
  await expect(frame.locator(EDITOR)).toBeHidden(); await expect(frame.locator(NATIVE)).toBeHidden();
  await frame.evaluate(() => { window.__treatmentPreWriteRead.restore(); delete window.__treatmentPreWriteRead; });
});

test('B1 treatment: an already pending native background read cannot replace a subsequently opened dirty editor', async ({ page }) => {
  const { frame, id } = await setup(page);
  const background = await frame.evaluate(async patientId => {
    const saved = await window.VildaVault.savePatientNote({ patientId, title: 'Fikcyjne tło opóźnionego odczytu B1',
      body: 'Fikcyjny początkowy zapis tła.', category: 'observation' });
    return window.VildaVault.getPatientNote(saved.id);
  }, id);
  await openTreatment(frame);
  const parent = await frame.locator(NATIVE).elementHandle(), clinicalBefore = await clinical(frame);
  await frame.evaluate(patientId => {
    const vault = window.VildaVault, original = vault.getPatient;
    let release; const wait = new Promise(resolve => { release = resolve; });
    const gate = { entered: 0, armed: true, pending: null };
    vault.getPatient = function (id, ...args) {
      const actual = Reflect.apply(original, this, [id, ...args]);
      if (id !== patientId || !gate.armed) return actual;
      gate.armed = false;
      return Promise.resolve(actual).then(record => { gate.entered += 1; return wait.then(() => record); });
    };
    // Invoke the genuine public card actor with the same background options as
    // native Gd9. Its returned promise is the deterministic completion witness;
    // neither the read result nor any authority flag is fabricated by the test.
    const native = window.VildaAuthUI.showPatientCard(patientId, null,
      { homePatientPresentation: true, homePatientOpenerId: 'vhomePatientExpand' },
      { activeTab: 'treatment', _navRestore: true, _syncRefresh: true });
    gate.pending = Promise.resolve(native).then(value => ({ ok: true, value }), error => ({ ok: false, error: String(error) }));
    gate.release = async () => { vault.getPatient = original; release(); return gate.pending; };
    window.__treatmentBackgroundRead = gate;
  }, id);
  await expect.poll(() => frame.evaluate(() => window.__treatmentBackgroundRead.entered)).toBe(1);
  // A changed ordinary note makes the old card fingerprint genuinely stale;
  // without the late gate this completed background actor would replace it.
  await frame.evaluate(async noteId => {
    const payload = structuredClone(await window.VildaVault.exportSyncPayload());
    const note = payload.patientNotes.find(row => row.id === noteId);
    note.body = 'Fikcyjny nowszy zapis ujawniany po zakończeniu edycji.';
    note.updatedAtISO = new Date(Math.max(Date.parse(note.updatedAtISO) + 1000, Date.now())).toISOString();
    await window.VildaVault.mergeSyncPayload(payload);
  }, background.id);
  const recordsBeforeDraft = await records(frame, id);
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible();
  await editor.locator('[name="name"]').fill('Fikcyjny prywatny tekst wpisany podczas odczytu w tle.');
  await chooseDiagnosisCode(editor, 'I10'); const editorRoot = await editor.elementHandle();
  const completed = await frame.evaluate(() => window.__treatmentBackgroundRead.release());
  expect(completed.ok).toBe(true);
  await expect(editor).toBeVisible(); await expect(editor.locator('[name="name"]')).toHaveValue('Fikcyjny prywatny tekst wpisany podczas odczytu w tle.');
  expect(await parent.evaluate(node => node === document.querySelector('.vhome-native-patient-card'))).toBe(true);
  expect(await editorRoot.evaluate(node => node === document.querySelector('#vhomePatientTreatmentDialog'))).toBe(true);
  expect(await records(frame, id)).toEqual(recordsBeforeDraft); expect(await clinical(frame)).toEqual(clinicalBefore);
  page.once('dialog', dialog => dialog.accept()); await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeHidden();
  await expect.poll(() => parent.evaluate(node => node.isConnected)).toBe(false);
  await expect(frame.locator(NATIVE)).toBeVisible();
  const notesPanel = await selectSection(frame, 'notes');
  await expect(notesPanel).toContainText('Fikcyjny nowszy zapis ujawniany po zakończeniu edycji.');
  expect(await records(frame, id)).toEqual(recordsBeforeDraft); expect(await clinical(frame)).toEqual(clinicalBefore);
  await frame.evaluate(() => { delete window.__treatmentBackgroundRead; });
});

test('B1 treatment: locking the real Vault wipes the open editor and never submits its draft', async ({ page }) => {
  const reports = []; await page.exposeFunction('__treatmentLockReport', value => { reports.push(value); });
  const { frame } = await setup(page); await openTreatment(frame);
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  await frame.locator(`${EDITOR} [name="name"]`).fill('Fikcyjny prywatny niezapisany wywiad B1.');
  await chooseDiagnosisCode(frame.locator(EDITOR), 'I10');
  await frame.evaluate(() => {
    const vault = window.VildaVault, root = document.querySelector('#vhomePatientTreatmentDialog');
    const fields = [...root.querySelectorAll('input,textarea,select')], writes = [];
    for (const name of ['savePatientNoteOnce', 'updateExistingPatientNote']) {
      const original = vault[name]; vault[name] = function (...args) { writes.push(name); return Reflect.apply(original, this, args); };
    }
    vault.onLock(() => {
      queueMicrotask(() => {
        void window.__treatmentLockReport({ connected: root.isConnected, text: root.textContent,
          values: fields.map(field => field.value), writes: writes.slice() }).catch(() => {});
      });
    });
    vault.lock();
  });
  await expect.poll(() => reports.length).toBeGreaterThan(0);
  expect(reports[0].connected).toBe(false); expect(reports[0].text).not.toContain('Fikcyjny prywatny niezapisany wywiad B1.');
  expect(reports[0].values.every(value => value === '')).toBe(true); expect(reports[0].writes).toEqual([]);
  await expect(frame.locator(EDITOR)).toHaveCount(0); await expect(frame.locator(NATIVE)).toHaveCount(0);
});

test('B1 treatment: native DocPro Notes preserves its card when the treatment editor capability is unavailable', async ({ page }) => {
  const fixture = await setup(page);
  const diagnosis = await fixture.frame.evaluate(async patientId => {
    const scope = window.VildaPatientTreatmentStore.createScope({ vault: window.VildaVault, patientId, isCurrent: () => true });
    try { return await scope.createDiagnosis({ name: 'Fikcyjne rozpoznanie do odczytu w DocPro', code: 'I10', status: 'active', dateISO: '2026-10-01' }); }
    finally { scope.dispose(); }
  }, fixture.id);
  await page.goto('/docpro.html', { waitUntil: 'load' });
  await readyForPatient(page); await settled(page);
  const confirmation = page.locator('#professionalConfirmBtn');
  if (await confirmation.isVisible()) await confirmation.click();
  await page.waitForFunction(() => window.VildaDocproStatePersistence?.isReady());
  expect(await page.evaluate(() => typeof window.VildaHomePatientNative?.decorate)).toBe('undefined');
  await page.evaluate(patientId => window.VildaAuthUI.showPatientCard(patientId, null, null, { activeTab: 'notes' }), fixture.id);
  const card = page.locator('.vilda-auth-patient-card:not(.vhome-native-patient-card)');
  const panel = card.locator('.vilda-patient-tab-content[data-tab="notes"]');
  await expect(card).toBeVisible(); await expect(panel).toBeVisible();
  const row = panel.locator(`.vilda-patient-note-card[data-note-id="${diagnosis.id}"]`);
  await expect(row).toBeVisible();
  await flushMain(page);
  const before = { patient: await records(page, fixture.id), other: await records(page, fixture.ids.b), clinical: await clinical(page),
    docpro: await page.evaluate(() => { const state = structuredClone(window.VildaPersistence.readDocproUi()); if (state) delete state.savedAt; return state; }) };
  await page.evaluate(() => {
    const vault = window.VildaVault, originals = {}, calls = [];
    for (const name of ['savePatientNote', 'savePatientNoteOnce', 'updateExistingPatientNote', 'saveReminderOutcome']) {
      if (typeof vault[name] !== 'function') continue;
      originals[name] = vault[name]; vault[name] = function (...args) { calls.push(name); return Reflect.apply(originals[name], this, args); };
    }
    window.__b1DocproGuard = { root: document.querySelector('.vilda-auth-patient-card'), panel: document.querySelector('.vilda-patient-tab-content[data-tab="notes"]'), calls,
      restore() { for (const name of Object.keys(originals)) vault[name] = originals[name]; } };
  });
  const question = page.waitForEvent('dialog');
  const editing = row.getByRole('button', { name: 'Edytuj', exact: true }).click();
  const alert = await question;
  expect(alert.type()).toBe('alert');
  expect(alert.message()).toBe('Dokumentację leczenia otworzysz na stronie głównej: Karta pacjenta → Leczenie.');
  await alert.accept();
  await editing;
  expect(await page.evaluate(() => document.querySelector('.vilda-auth-patient-card') === window.__b1DocproGuard.root
    && document.querySelector('.vilda-patient-tab-content[data-tab="notes"]') === window.__b1DocproGuard.panel)).toBe(true);
  await expect(card).toBeVisible(); await expect(panel).toBeVisible();
  await expect(card.locator('.vilda-patient-tab-content:visible')).toHaveCount(1);
  await expect(page.locator('.vilda-patient-note-editor-overlay, #vhomePatientTreatmentDialog')).toHaveCount(0);
  await flushMain(page);
  expect(await page.evaluate(() => window.__b1DocproGuard.calls)).toEqual([]);
  expect(await records(page, fixture.id)).toEqual(before.patient); expect(await records(page, fixture.ids.b)).toEqual(before.other);
  expect(await clinical(page)).toEqual(before.clinical);
  expect(await page.evaluate(() => { const state = structuredClone(window.VildaPersistence.readDocproUi()); if (state) delete state.savedAt; return state; })).toEqual(before.docpro);
  await page.evaluate(() => { window.__b1DocproGuard.restore(); delete window.__b1DocproGuard; });
});

test('B1 treatment: genuine reload veto retains an isolated dirty draft and releases protection after Cancel and Vault lock', async ({ page }) => {
  const { frame, id } = await setup(page);
  await frame.waitForFunction(() => window.VildaDataImportExport.getSaveReadiness().ready && !window.VildaPersistence.isAutosaveSuppressed());
  expect(await frame.evaluate(async () => Boolean(await window.saveUserData()))).toBe(true);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  await flushMain(frame);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await openTreatment(frame);
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible();
  await editor.locator('[name="name"]').fill('Fikcyjny szkic zachowany po odrzuconym F5');
  await chooseDiagnosisCode(editor, 'I10');
  await flushMain(frame);
  expect(await clinical(frame)).toEqual(before.clinical);
  await expect.poll(() => frame.evaluate(() => window.VildaSaveStatusIndicator.getCurrentDecision().state)).toBe('saved');
  const handles = { editor: await editor.elementHandle(), parent: await frame.locator(NATIVE).elementHandle() };
  const historyBefore = await frame.evaluate(() => ({ length: history.length, state: structuredClone(history.state), url: location.href }));
  const question = page.waitForEvent('dialog');
  const reloading = page.reload({ waitUntil: 'load' }).then(() => true, () => false);
  const confirmation = await question;
  expect(confirmation.type()).toBe('beforeunload'); expect(confirmation.message()).toBe('');
  // Chromium keeps the canceled load waiter pending. The retained live roots
  // prove the veto; the next accepted real reload settles that same waiter.
  await confirmation.dismiss();
  expect(await handles.editor.evaluate(node => node.isConnected)).toBe(true);
  expect(await handles.parent.evaluate(node => node.isConnected)).toBe(true);
  await expect(editor.locator('[name="name"]')).toHaveValue('Fikcyjny szkic zachowany po odrzuconym F5');
  await expect(editor.locator('[name="code"]')).toHaveValue('I10');
  expect(await frame.evaluate(() => ({ length: history.length, state: structuredClone(history.state), url: location.href }))).toEqual(historyBefore);
  expect(await clinical(frame)).toEqual(before.clinical); expect(await records(frame, id)).toEqual(before.records);
  page.once('dialog', dialog => dialog.accept());
  await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
  await expect(editor).toBeHidden();
  expect(await clinical(frame)).toEqual(before.clinical); expect(await records(frame, id)).toEqual(before.records);
  const unexpected = [];
  const rejectUnexpected = dialog => { unexpected.push({ type: dialog.type(), message: dialog.message() }); return dialog.dismiss(); };
  page.on('dialog', rejectUnexpected);
  try { await page.reload({ waitUntil: 'load' }); }
  finally { page.off('dialog', rejectUnexpected); }
  await reloading;
  expect(unexpected).toEqual([]);
  await readyForPatient(page); await settled(page);
  expect(await records(page, id)).toEqual(before.records);
  await openTreatment(page);
  await page.locator(`${TREATMENT} [data-treatment-action="new-therapy"]`).click();
  const lockedEditor = page.locator(EDITOR); await expect(lockedEditor).toBeVisible();
  await lockedEditor.locator('[name="title"]').fill('Fikcyjny szkic przed blokadą sejfu');
  await page.evaluate(() => window.VildaVault.lock());
  expect(await page.evaluate(() => window.VildaVault.isUnlocked())).toBe(false);
  await expect(lockedEditor).toBeHidden(); await expect(page.locator(NATIVE)).toBeHidden();
  page.on('dialog', rejectUnexpected);
  try { await page.reload({ waitUntil: 'load' }); }
  finally { page.off('dialog', rejectUnexpected); }
  expect(unexpected).toEqual([]);
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await expect(page.locator(EDITOR)).toHaveCount(0);
});

test('ICD-10: live catalogue narrowing and explicit keyboard choice preserve Polish source names, parent context and marked codes through F5', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  const before = { patient: await records(frame, id), other: await records(frame, ids.b), clinical: await clinical(frame) };
  await openTreatment(frame);
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR), query = editor.locator('.vpt-icd10-query');
  const popup = editor.getByRole('listbox', { name: 'Kody ICD-10', exact: true });
  const totals = [];
  for (const text of ['E', 'E1', 'E10', 'E102']) {
    await query.fill(text); await expect(popup).toBeVisible();
    const status = await editor.locator('.vpt-icd10-status').textContent(), count = status.match(/\d+/);
    expect(count).not.toBeNull(); totals.push(Number(count[0]));
    await expect(editor.locator('[name="code"]')).toHaveValue('');
    await expect(editor.locator('[name="name"]')).toHaveValue('');
  }
  for (let index = 1; index < totals.length; index++) expect(totals[index]).toBeLessThan(totals[index - 1]);
  expect(totals.at(-1)).toBe(1);
  await query.fill('cukrzyca powiklan nerkowymi');
  const marked = popup.locator('[data-icd10-code="E10.2†"]');
  await expect(marked).toContainText('E10.2† — Z powikłaniami nerkowymi');
  await expect(marked.locator('.vpt-icd10-parent')).toHaveText('Kategoria: E10 — Cukrzyca insulinozależna');
  await expect(popup.locator('[data-icd10-code="E11.2†"] .vpt-icd10-parent')).toHaveText('Kategoria: E11 — Cukrzyca insulinoniezależna');
  await query.fill('e102');
  await query.press('Enter');
  await expect(editor).toBeVisible(); await expect(popup).toBeVisible();
  await expect(editor.locator('[name="code"]')).toHaveValue('');
  expect((await treatmentState(frame, id)).diagnoses).toEqual([]);
  await flushMain(frame);
  expect(await records(frame, id)).toEqual(before.patient); expect(await clinical(frame)).toEqual(before.clinical);
  await query.press('ArrowDown');
  const activeId = await query.getAttribute('aria-activedescendant'); expect(activeId).toBeTruthy();
  await expect(popup.locator(`[id="${activeId}"]`)).toHaveAttribute('data-icd10-code', 'E10.2†');
  await query.press('Enter');
  await expect(popup).toBeHidden(); await expect(query).toHaveValue('E10.2†');
  await expect(editor.locator('[name="name"]')).toHaveValue('Z powikłaniami nerkowymi');
  await expect(editor.locator('[name="code"]')).toHaveValue('E10.2†');
  await expect(editor.locator('.vpt-icd10-selected .vpt-icd10-parent')).toHaveText('Kategoria: E10 — Cukrzyca insulinozależna');
  await expect(editor.locator('.vpt-icd10-source')).toHaveText('Polski katalog ICD-10 · Centrum e-Zdrowia · 31.03.2021');
  await saveEditor(frame);
  const saved = (await treatmentState(frame, id)).diagnoses;
  expect(saved).toHaveLength(1); expect(saved[0].context).toMatchObject({ code: 'E10.2†', name: 'Z powikłaniami nerkowymi', codingSystem: 'ICD-10' });
  expect(await clinical(frame)).toEqual(before.clinical); expect(await records(frame, ids.b)).toEqual(before.other);
  expect((await records(frame, id)).patient).toEqual(before.patient.patient);
  await closeCard(frame); await page.reload({ waitUntil: 'load' }); await readyForPatient(page); await settled(page);
  const reloaded = (await treatmentState(page, id)).diagnoses;
  expect(reloaded).toEqual(saved);
});

test('ICD-10: pending search cannot overwrite a saved code, physician names remain explicit and manual or empty codes persist', async ({ page }) => {
  const { frame, id, ids } = await setup(page);
  await page.setViewportSize({ width: 390, height: 844 });
  const before = { patient: await records(frame, id), other: await records(frame, ids.b), clinical: await clinical(frame) };
  await openTreatment(frame);
  const customName = 'Fikcyjny indywidualny opis rozpoznania lekarza';
  await createDiagnosis(frame, { name: customName, code: 'I10' });
  const selected = (await treatmentState(frame, id)).diagnoses[0];
  expect(selected.context).toMatchObject({ code: 'I10', name: customName });
  await frame.locator(`${TREATMENT} [data-treatment-diagnosis-id="${selected.id}"] [data-treatment-action="edit-diagnosis"]`).click();
  const editor = frame.locator(EDITOR), query = editor.locator('.vpt-icd10-query');
  await expect(editor.locator('.vpt-icd10-selected .vpt-icd10-official')).toHaveText('I10 — Nadciśnienie samoistne (pierwotne)');
  await query.fill('powiklan nerkowymi');
  await expect(editor.locator('[name="code"]')).toHaveValue('I10');
  await editor.locator('button[type="submit"]').click();
  await expect(editor).toBeVisible(); await expect(query).toHaveAttribute('aria-invalid', 'true');
  expect(await query.evaluate(node => node.validity.customError)).toBe(true);
  expect((await treatmentState(frame, id)).diagnoses).toEqual([selected]);
  await flushMain(frame); expect(await clinical(frame)).toEqual(before.clinical);
  await query.click(); await expect(editor.getByRole('listbox')).toBeVisible();
  await query.press('Escape');
  await expect(editor.getByRole('listbox')).toBeHidden(); await expect(editor).toBeVisible();
  await chooseDiagnosisCode(editor, 'E10.2†', { query: 'E102' });
  await expect(editor.locator('[name="name"]')).toHaveValue(customName);
  // Keep the edited query focused: this real click must blur it without a
  // native change event reopening the list between pointerdown and pointerup.
  await expect(query).toBeFocused();
  await editor.getByRole('button', { name: 'Użyj nazwy z katalogu', exact: true }).click();
  await expect(editor.locator('[name="name"]')).toHaveValue('Z powikłaniami nerkowymi');
  await expect(editor.getByRole('listbox')).toBeHidden();
  await saveEditor(frame);
  const canonical = (await treatmentState(frame, id)).diagnoses[0];
  expect(canonical.id).toBe(selected.id); expect(canonical.context).toMatchObject({ code: 'E10.2†', name: 'Z powikłaniami nerkowymi' });
  const manualName = 'Fikcyjny opis z kodem ręcznym lekarza', manualCode = 'QA-lekarza-2030';
  await createDiagnosis(frame, { name: manualName, code: manualCode, manual: true });
  let manual = (await treatmentState(frame, id)).diagnoses.find(row => row.id !== canonical.id);
  expect(manual.context).toMatchObject({ name: manualName, code: manualCode });
  await frame.locator(`${TREATMENT} [data-treatment-diagnosis-id="${manual.id}"] [data-treatment-action="edit-diagnosis"]`).click();
  await expect(editor.locator('.vpt-icd10-selected .vpt-icd10-official')).toHaveText('Kod ręczny: ' + manualCode);
  await query.fill(''); await expect(editor.locator('[name="code"]')).toHaveValue('');
  await expect(editor.locator('[name="name"]')).toHaveValue(manualName); await saveEditor(frame);
  const final = await treatmentState(frame, id); manual = final.diagnoses.find(row => row.id === manual.id);
  expect(manual.context).toMatchObject({ name: manualName, code: '' });
  expect(final.diagnoses.find(row => row.id === canonical.id)).toEqual(canonical); expect(final.episodes).toEqual([]);
  expect((await records(frame, id)).patient).toEqual(before.patient.patient);
  expect(await records(frame, ids.b)).toEqual(before.other); expect(await clinical(frame)).toEqual(before.clinical);
});

test('ICD-10: phone suggestions stay bounded and scroll by keyboard while search and Escape/Cancel leave clinical data unchanged', async ({ page }) => {
  const { frame, id } = await setup(page);
  const before = { records: await records(frame, id), clinical: await clinical(frame) };
  await openTreatment(frame);
  for (const [width, height] of [[390, 844], [320, 640]]) {
    await page.setViewportSize({ width, height });
    await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
    const editor = frame.locator(EDITOR), query = editor.locator('.vpt-icd10-query');
    await geometry(frame, EDITOR); await query.fill('E');
    const popup = editor.getByRole('listbox', { name: 'Kody ICD-10', exact: true });
    await expect(popup).toBeVisible(); await expect(popup.getByRole('option')).toHaveCount(13);
    await popup.scrollIntoViewIfNeeded();
    const bounds = await popup.evaluate(node => {
      const rect = node.getBoundingClientRect(), owner = node.closest('dialog').getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, height: rect.height,
        scrollHeight: node.scrollHeight, clientHeight: node.clientHeight, viewportWidth: innerWidth, viewportHeight: innerHeight,
        ownerTop: owner.top, ownerBottom: owner.bottom, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    expect(bounds.left).toBeGreaterThanOrEqual(0); expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
    expect(bounds.top).toBeGreaterThanOrEqual(bounds.ownerTop); expect(bounds.bottom).toBeLessThanOrEqual(bounds.ownerBottom);
    expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight); expect(bounds.scrollHeight).toBeGreaterThan(bounds.clientHeight);
    expect(bounds.height).toBeGreaterThan(0); expect(bounds.overflow).toBeLessThanOrEqual(1);
    await query.press('ArrowUp');
    await expect(popup.locator('[aria-selected="true"]')).toHaveAttribute('data-icd10-manual', 'true');
    expect(await popup.evaluate(node => node.scrollTop)).toBeGreaterThan(0);
    await expect(query).toHaveAttribute('aria-activedescendant', await popup.locator('[aria-selected="true"]').getAttribute('id'));
    await expect(editor.locator('[name="code"]')).toHaveValue('');
    await query.press('Escape');
    await expect(popup).toBeHidden(); await expect(editor).toBeVisible(); await expect(query).toBeFocused();
    await flushMain(frame); expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
    await editor.getByRole('button', { name: 'Anuluj', exact: true }).click(); await expect(editor).toBeHidden();
    expect(await records(frame, id)).toEqual(before.records); expect(await clinical(frame)).toEqual(before.clinical);
  }
});
