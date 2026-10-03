import { expect, test } from '../support/test-czas.mjs';

// PR2 transport regressions remain independent of the new form. PR3 loads the
// engine on the converter; other pages only read snapshots and need a synthetic
// test producer to prepare historical fixtures.
// Every test creates a fresh, fictional vault in its isolated browser context.
const SAMPLE_DATE = '2026-06-17';
test.use({ serviceWorkers: 'block' });

async function openVault(page, path = '/index.html') {
  await page.route('**/*', (route) => route.request().url().startsWith('http://127.0.0.1:')
    ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date();
    const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    localStorage.setItem('vilda-reminders-shown-v1', `${iso}|${Date.now()}`);
    localStorage.setItem('vilda-reminders-closed-v1', `${iso}|${Date.now()}`);
  });
  await page.goto(path, { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession?.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault && window.VildaLabSnapshot));
  await page.evaluate(() => window.VildaVault.createUser('E2e#LhFsh!2026', { label: 'Fikcyjny sejf LH/FSH', iterations: 10000 }));
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && Boolean(window.VildaAuthUI));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  const converter = path === '/przelicznik-jednostek.html';
  expect(await page.evaluate(() => ({ engine: typeof window.VildaLabPuberty, data: typeof window.VildaLabPubertyData })))
    .toEqual({ engine: converter ? 'object' : 'undefined', data: converter ? 'object' : 'undefined' });
  return page.evaluate(async () => (await window.VildaVault.savePatient({
    name: 'Fikcyjny LHFSH', user: { name: 'Fikcyjny LHFSH', sex: 'M', age: 6, ageMonths: 0, height: 115, weight: 20 },
  }, { dedup: false })).patientId);
}

async function loadTestProducer(page) {
  if (await page.evaluate(() => Boolean(window.VildaLabPuberty && window.VildaLabPubertyData))) return;
  await page.addScriptTag({ url: '/vilda_lab_puberty_data.js' });
  await page.addScriptTag({ url: '/vilda_lab_puberty.js' });
}

async function saveAssessment(page, patientId, options = {}) {
  return page.evaluate(async ({ patientId: pid, date, value = '2', calendar = false }) => {
    const evaluation = window.VildaLabPuberty.evaluate({
      analyte: 'lh', value, unit: 'IU/L', sex: 'M',
      ...(calendar ? { age: { years: 6, months: 0, days: 0, precision: 'day' } }
        : { birthDateISO: '2020-06-17', sampleDateISO: date }),
      specimen: 'serum', measurementKind: 'basal',
      assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
      puberty: { kind: 'G', stage: 4, ...(calendar ? { appliesToSample: true } : { assessedAtISO: date }) },
      treatment: { gnrha: 'no', sexSteroids: 'no' },
    }, window.VildaLabPubertyData);
    const labResult = { test: 'LH', testKey: 'lh', value, unit: 'IU/L', assessment: window.VildaLabSnapshot.create(evaluation) };
    if (evaluation.measurement.isExact) labResult.valueNum = evaluation.measurement.plotValue;
    const saved = await window.VildaVault.savePatientNote({
      patientId: pid, title: 'Fikcyjne LH', body: 'Pierwotny komentarz', category: 'wynik-badania', labResult,
      ...(calendar ? { dueDateISO: date, dueTime: '10:00', durationMin: 30 } : { clinicalDateISO: date, linkedAgeMonths: 72 }),
    });
    return window.VildaVault.getPatientNote(saved.id);
  }, { patientId, date: SAMPLE_DATE, ...options });
}

const readNote = (page, id) => page.evaluate((noteId) => window.VildaVault.getPatientNote(noteId), id);

const saveLegacy = (page, patientId, calendar = false) => page.evaluate(async ({ patientId: pid, calendar: scheduled }) => {
  const saved = await window.VildaVault.savePatientNote({
    patientId: pid, title: 'Fikcyjny format starszego wyniku', body: 'Komentarz starszego zapisu', category: 'wynik-badania',
    labResult: { test: 'LH', testKey: 'lh', value: '2 IU/L = 2 mIU/mL', valueNum: 2, unit: 'IU/L' },
    ...(scheduled ? { dueDateISO: '2026-06-17', dueTime: '11:00', durationMin: 30 } : { clinicalDateISO: '2026-06-17' }),
  });
  return window.VildaVault.getPatientNote(saved.id);
}, { patientId, calendar });

async function openFullEditor(page, id) {
  await page.evaluate(async (noteId) => {
    const note = await window.VildaVault.getPatientNote(noteId);
    window.VildaAuthUI.showPatientNoteEditor({ patientId: note.patientId, note });
  }, id);
  await expect(page.locator('.vilda-pne')).toBeVisible();
}

async function saveFullEditor(page) {
  await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(page.locator('.vilda-pne')).toHaveCount(0);
}

test('pin captures a detached assessment, survives reload and leaves legacy pinning unchanged', async ({ page }) => {
  const patientId = await openVault(page, '/przelicznik-jednostek.html');
  await loadTestProducer(page);
  await page.evaluate((pid) => {
    window._vildaCurrentPatientId = pid;
    window.VildaPersistence.writeShared({ name: 'Fikcyjny LHFSH', sex: 'M', age: 6, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: pid } }));
    window.__assessmentCalls = 0;
    window.VildaLabPinResult.setAssessmentProvider((input) => {
      window.__assessmentCalls += 1;
      const evaluation = window.VildaLabPuberty.evaluate({
        analyte: input.testKey, value: input.raw, unit: input.unit, sex: 'M',
        birthDateISO: '2020-06-17', sampleDateISO: '2026-06-17',
        specimen: 'serum', measurementKind: 'basal',
        assay: { profileId: 'mayo-lh-pediatric', methodId: 'anshlite-lh-clia', confirmation: 'reported' },
        puberty: { kind: 'G', stage: 4, assessedAtISO: '2026-06-17' },
        treatment: { gnrha: 'no', sexSteroids: 'no' },
      }, window.VildaLabPubertyData);
      window.__providedAssessment = window.VildaLabSnapshot.create(evaluation);
      return window.__providedAssessment;
    });
  }, patientId);
  await page.locator('#labSubstance').fill('LH');
  await page.locator('#labSubstanceDropdown .lab-substance-option[data-id="lh"]').click();
  await page.locator('#labValue').fill('2');
  await expect(page.locator('#labPinResultBtn')).toBeVisible();
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill(SAMPLE_DATE);
  // Mutate the producer object after opening the modal: the saved sample must
  // remain the one that was reviewed when the pin action began.
  await page.evaluate(() => { window.__providedAssessment.evaluation.input.puberty.stage = 1; });
  await page.locator('#labPinComment').fill('Komentarz do próbki');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const before = await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId);
  expect(before).toHaveLength(1);
  expect(before[0].labResult.assessment.status).toBe('recorded');
  expect(before[0].labResult.assessment.evaluation.input.puberty.stage).toBe(4);
  expect(before[0].labResult.assessment.evaluation.biochemical.byAge.status).toBe('above');
  expect(before[0].labResult.assessment.evaluation.biochemical.byStage.status).toBe('within');
  expect(before[0].labResult.assessment.evaluation.clinical.code).toBe('early_development');
  expect(await page.evaluate(() => window.__assessmentCalls)).toBe(1);

  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill('2026-06-16');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const changedDate = (await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId))
    .find((n) => n.id !== before[0].id);
  expect(changedDate.clinicalDateISO).toBe('2026-06-16');
  expect(changedDate.labResult.assessment.status).toBe('invalidated');

  await page.evaluate(() => window.VildaLabPinResult.setAssessmentProvider(null));
  await page.locator('#labPinResultBtn').click();
  await page.locator('#labPinDate').fill(SAMPLE_DATE);
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const legacy = (await page.evaluate((pid) => window.VildaVault.listPatientNotesForPatient(pid), patientId))
    .find((n) => !Object.hasOwn(n.labResult, 'assessment'));
  expect(legacy.labResult).not.toHaveProperty('assessment');
  expect(legacy.labResult.valueNum).toBe(2);

  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked());
  expect((await readNote(page, before[0].id)).labResult.assessment).toEqual(before[0].labResult.assessment);
  expect(await page.evaluate(() => typeof window.VildaLabPuberty)).toBe('object');
});

test('full editor preserves assessment for a comment and invalidates a changed result or sample date', async ({ page }) => {
  const patientId = await openVault(page);
  await loadTestProducer(page);
  const note = await saveAssessment(page, patientId);
  expect(note.labResult.assessment.status).toBe('recorded');
  await openFullEditor(page, note.id);
  await page.locator('.vilda-pne textarea').fill('Wyłącznie nowy komentarz');
  await saveFullEditor(page);
  expect((await readNote(page, note.id)).labResult.assessment).toEqual(note.labResult.assessment);

  await openFullEditor(page, note.id);
  await page.locator('.b3-lab-value').fill('3');
  await saveFullEditor(page);
  expect((await readNote(page, note.id)).labResult.assessment.status).toBe('invalidated');

  const dated = await saveAssessment(page, patientId);
  await openFullEditor(page, dated.id);
  await page.locator('.vilda-pne input[name="b3-anchor"][value="date"]').check();
  await page.locator('.vilda-pne .b3-clinical-date').fill('2026-06-16');
  await saveFullEditor(page);
  const changed = await readNote(page, dated.id);
  expect(changed.clinicalDateISO).toBe('2026-06-16');
  expect(changed.labResult.assessment.status).toBe('invalidated');

  const legacy = await saveLegacy(page, patientId);
  await openFullEditor(page, legacy.id);
  await page.locator('.vilda-pne textarea').fill('Nowy komentarz starszego zapisu');
  await saveFullEditor(page);
  expect((await readNote(page, legacy.id)).labResult).toEqual(legacy.labResult);
});

test('calendar editor preserves assessment on comment edit and invalidates a changed value', async ({ page }) => {
  const patientId = await openVault(page, '/terminarz.html');
  await loadTestProducer(page);
  const note = await saveAssessment(page, patientId, { calendar: true });
  expect(note.labResult.assessment.status).toBe('recorded');
  await page.evaluate(() => { window.VildaTerminarz.setView('week'); window.VildaTerminarz.refresh(); });
  const edit = async (noteId = note.id) => {
    await page.locator(`.tz-wb[data-note-id="${noteId}"]`).waitFor({ state: 'attached' });
    await page.locator(`.tz-wb[data-note-id="${noteId}"]`).evaluate((el) => el.click());
    await page.locator('.tz-pop button[data-pop="edit"]').evaluate((el) => el.click());
    await expect(page.locator('#tzNewTermOverlay')).toBeVisible();
  };
  await edit();
  await page.locator('#tzNtBody').fill('Komentarz terminarza');
  await page.locator('#tzNtSave').evaluate((el) => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, note.id)).labResult.assessment).toEqual(note.labResult.assessment);
  await edit();
  await page.locator('#tzNtLabValue').fill('3 IU/L');
  await page.locator('#tzNtSave').evaluate((el) => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, note.id)).labResult.assessment.status).toBe('invalidated');

  const legacy = await saveLegacy(page, patientId, true);
  await page.evaluate(() => window.VildaTerminarz.refresh());
  await edit(legacy.id);
  await page.locator('#tzNtBody').fill('Nowy komentarz starszego zapisu');
  await page.locator('#tzNtSave').evaluate((el) => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, legacy.id)).labResult).toEqual(legacy.labResult);
});

test('history retains censored and unavailable assessments without inventing numeric trend points or legacy context', async ({ page }) => {
  const patientId = await openVault(page);
  await loadTestProducer(page);
  const censored = await saveAssessment(page, patientId, { value: '<LOD' });
  expect(censored.labResult.assessment.status).toBe('recorded');
  const ids = await page.evaluate(async (pid) => {
    const old = await window.VildaVault.savePatientNote({
      patientId: pid, title: 'Fikcyjny starszy wynik', body: 'Stary zapis bez kontekstu', category: 'wynik-badania',
      clinicalDateISO: '2026-06-16', labResult: { test: 'LH', testKey: 'lh', value: '1 IU/L', valueNum: 1, unit: 'IU/L' },
    });
    const unavailable = await window.VildaVault.savePatientNote({
      patientId: pid, title: 'Fikcyjny nieczytelny kontekst', body: 'Nieznana wersja', category: 'wynik-badania',
      clinicalDateISO: '2026-06-15', labResult: {
        test: 'LH', testKey: 'lh', value: '4 IU/L', valueNum: 4, unit: 'IU/L', assessment: { schemaVersion: 999 },
      },
    });
    return { old: old.id, unavailable: unavailable.id };
  }, patientId);
  const series = await page.evaluate((pid) => window.VildaVault.listPatientLabSeries(pid), patientId);
  const points = series.find((s) => s.testKey === 'lh').points;
  expect(points).toHaveLength(3);
  const limited = points.find((p) => p.noteId === censored.id);
  expect(limited.valueNum).toBeNull();
  expect(limited.assessment.evaluation.measurement.raw).toBe('<LOD');
  expect(limited.assessment.evaluation.measurement.plotValue).toBeNull();
  expect(points.find((p) => p.noteId === ids.unavailable)).toMatchObject({ valueNum: null, assessment: { status: 'unavailable' } });
  const legacy = points.find((p) => p.noteId === ids.old);
  expect(legacy.valueNum).toBe(1);
  expect(legacy).not.toHaveProperty('assessment');
  expect((await readNote(page, ids.old)).labResult).not.toHaveProperty('assessment');

  await page.evaluate((pid) => window.VildaAuthUI.showPatientCard(pid), patientId);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  const history = page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
  await expect(history).toContainText('Fikcyjne LH');
  await expect(history).toContainText('<LOD');
  await expect(history).toContainText('Fikcyjny starszy wynik');
  await expect(history).toContainText('Fikcyjny nieczytelny kontekst');
});
