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
    return { width: box.width, height: box.height, x: box.x, y: box.y,
      viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
  });
  // Opening motion may still be running when the native sheet becomes visible.
  // Observe its exact accepted final frame rather than an intermediate scale.
  await expect.poll(async () => {
    const value = await measure(), width = Math.min(1000, value.viewportWidth - 32), height = Math.min(820, value.viewportHeight - 32);
    return { width: value.width - width, height: value.height - height,
      x: value.x - (value.viewportWidth - width) / 2, y: value.y - (value.viewportHeight - height) / 2 };
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
async function saveEditor(frame) {
  await frame.locator(`${EDITOR} button[type="submit"]`).click();
  await expect(frame.locator(EDITOR)).toBeHidden();
}
async function createDiagnosis(frame, { name, code = '' }) {
  await frame.locator(`${TREATMENT} [data-treatment-action="new-diagnosis"]`).click();
  const editor = frame.locator(EDITOR); await expect(editor).toBeVisible(); await geometry(frame, EDITOR);
  await editor.locator('[name="name"]').fill(name); await editor.locator('[name="code"]').fill(code);
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
      await geometry(frame, EDITOR); expect(await editor.boundingBox()).toEqual(bounds);
      await editor.getByRole('button', { name: 'Anuluj', exact: true }).click();
      await expect(editor).toBeHidden();
      const notes = await selectSection(frame, 'notes');
      await notes.getByRole('button', { name: '+ Dodaj notatkę', exact: true }).click();
      const note = frame.locator('.vilda-pne.vhome-b1-native-note'); await expect(note).toBeVisible();
      await geometry(frame, '.vilda-pne.vhome-b1-native-note'); expect(await note.boundingBox()).toEqual(bounds);
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
  await editor.locator('[name="code"]').fill('I10');
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
  const gh = treatment.locator('.vilda-gh-summary', { hasText: 'Omnitrope 10 mg' });
  await expect(gh).toBeVisible();
  await expect(gh).toContainText('Leczony hormonem wzrostu (rhGH)');
  const obesity = treatment.locator('.vilda-gh-summary', { hasText: 'Wegovy' });
  await expect(obesity).toBeVisible();
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
  await editor.locator('[name="code"]').fill('I10'); const editorRoot = await editor.elementHandle();
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
  await frame.locator(`${EDITOR} [name="code"]`).fill('I10');
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
