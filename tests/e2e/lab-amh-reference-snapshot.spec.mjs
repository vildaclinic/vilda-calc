import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { expect, test } from '../support/test-czas.mjs';

// Every vault and patient is fictional and confined to this test's browser.
// These tests exercise the real converter, pin action, vault and saved UI.
test.use({ serviceWorkers: 'block', reducedMotion: 'reduce' });
const chart = page => page.locator('.vilda-hormone-lifespan');
const sourcePoint = page => chart(page).locator('[data-patient-concentration="amh"]');
const savedReference = root => root.locator('.vilda-hormone-reference');
const notes = (page, id) => page.evaluate(pid => window.VildaVault.listPatientNotesForPatient(pid), id);
const readNote = (page, id) => page.evaluate(noteId => window.VildaVault.getPatientNote(noteId), id);

async function prepare(page, { width = 1440, age = 15, sex = 'F', main = false } = {}) {
  await page.setViewportSize({ width, height: 1000 });
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.hostname === '127.0.0.1' || /^(data|blob):$/.test(url.protocol) ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('vilda-terms-accepted-v1', JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    const d = new Date(), iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    for (const key of ['shown', 'closed']) localStorage.setItem(`vilda-reminders-${key}-v1`, `${iso}|${Date.now()}`);
  });
  await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.evaluate(() => window.VildaSession.ensureAuthLoaded());
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(() => window.VildaVault.createUser('E2e#FictionalAmhReference!2026', {
    label: 'Fikcyjny sejf odniesień AMH', iterations: 10000,
  }));
  await page.goto(main ? '/index.html' : '/przelicznik-jednostek.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI &&
    !document.documentElement.classList.contains('vilda-auth-locked'));
  const consent = page.locator('#consent-decline');
  if (await consent.isVisible()) await consent.click();
  // The synthetic record must be loaded after the main form's bootstrap
  // restore, not merely after the vault has unlocked.
  if (main) await settleMain(page);
  const id = await page.evaluate(async ({ age, sex, main }) => {
    const user = { name: 'Fikcyjna Osoba AMH', lastName: 'Fikcyjna', firstName: 'Osoba AMH', sex, age, ageMonths: 0, height: 160, weight: 50 };
    const saved = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    const record = await window.VildaVault.getPatient(saved.patientId);
    if (main) window.applyLoadedData(record.snapshots[0].payload);
    else {
      window._vildaCurrentPatientId = saved.patientId;
      window.sessionStorage.setItem('vildaCurrentPatientId', saved.patientId);
      if (!window.VildaPersistence.writeShared(user, { force: true })) throw new Error('Cannot seed fictional current context');
    }
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: {
      patientId: saved.patientId, savedAtISO: record.snapshots[0].savedAtISO, snapshotCount: 1, source: 'pick',
    } }));
    return saved.patientId;
  }, { age, sex, main });
  if (main) {
    await expect(page.locator('#vildaLcmNew')).toBeVisible();
    await page.locator('#vildaLcmNew').click();
    await expect(page.locator('#vildaLoadChoiceModal')).toHaveCount(0);
    await settleMain(page);
    for (const [field, value] of Object.entries({ age, ageMonths: 0, height: 160, weight: 50 })) {
      await page.locator(`#${field}`).fill(String(value));
      await page.locator(`#${field}`).dispatchEvent('change');
    }
    await settleMain(page);
    await expect(page.locator('#name')).toHaveValue('Fikcyjna Osoba AMH');
    await expect.poll(() => page.evaluate(() => {
      const shared = window.VildaPersistence.readShared();
      return { age: Number(shared.age), name: shared.name };
    })).toEqual({ age, name: 'Fikcyjna Osoba AMH' });
    await page.goto('/przelicznik-jednostek.html', { waitUntil: 'load' });
  }
  await page.waitForFunction(() => window.VildaHormoneLifespanRuntime && window.VildaHormoneReferenceSnapshot &&
    window.VildaHormoneReferenceUI && window.VildaLabPinResult && window.VildaVault?.isUnlocked());
  await expect.poll(() => page.evaluate(id => ({
    storageId: window.sessionStorage.getItem('vildaCurrentPatientId'),
    windowId: window._vildaCurrentPatientId || null,
    windowCompatible: !window._vildaCurrentPatientId || window._vildaCurrentPatientId === id,
    patientName: window.VildaSession.getPatient()?.name || null,
    status: window.VildaPubertySource.kontekstPacjenta(id).status,
  }), id)).toMatchObject({ storageId: id, windowCompatible: true, patientName: 'Fikcyjna Osoba AMH', status: 'ready' });
  return id;
}

async function settleMain(page) {
  await page.waitForFunction(() => {
    const persistence = window.VildaPersistence;
    const state = window.vildaGetPersistAutosaveCoalescingSnapshot?.();
    // Empty queues can occur during the restoration pause. Editing then lets
    // the pending older root overwrite the new fields when navigation flushes.
    return persistence && typeof persistence.isAutosaveSuppressed === 'function' &&
      !persistence.isAutosaveSuppressed() && !persistence.isRestoring() &&
      !window.VildaDobAge?.restorePending?.() && state && !state.hasPendingSaveTimer &&
      !state.hasPendingForceSaveTimer && !state.hasPendingElementRefreshTimer;
  });
}

async function choose(page, raw = '0.45', unit = 'ng/mL', target = unit) {
  await page.locator('#labSubstance').fill('AMH');
  await page.locator('#labSubstanceDropdown [data-id="amh"]').click();
  await page.locator('#labUnit').selectOption(unit);
  await page.locator('#labUnitTarget').selectOption(target);
  await page.locator('#labValue').fill(raw);
  await expect(page.locator('#labPinResultBtn')).toBeVisible();
}

async function pin(page, id, { comment, date } = {}) {
  const previous = new Set((await notes(page, id)).map(note => note.id));
  await page.locator('#labPinResultBtn').click();
  if (comment) await page.locator('#labPinComment').fill(comment);
  if (date) await page.locator('#labPinDate').fill(date);
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  return (await notes(page, id)).find(note => !previous.has(note.id));
}

async function history(page, id) {
  await page.evaluate(pid => window.VildaAuthUI.showPatientCard(pid), id);
  await page.locator('.vilda-patient-tab[data-tab="timeline"]').click();
  return page.locator('.vilda-patient-tab-content[data-tab="timeline"]');
}

async function editor(page, note) {
  await page.evaluate(async noteId => {
    const saved = await window.VildaVault.getPatientNote(noteId);
    window.VildaAuthUI.showPatientNoteEditor({ patientId: saved.patientId, note: saved });
  }, note.id);
  await expect(page.locator('.vilda-pne')).toBeVisible();
  return page.locator('.vilda-pne');
}

async function saveEditor(page) {
  await page.getByRole('button', { name: 'Zapisz zmiany', exact: true }).click();
  await expect(page.locator('.vilda-pne')).toHaveCount(0);
}

async function capture(page, host, name, data) {
  const directory = process.env.VILDA_AMH_SNAPSHOT_CAPTURE_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await host.screenshot({ path: join(directory, `${name}.png`), timeout: 10_000 });
  if (data) await writeFile(join(directory, `${name}.json`), JSON.stringify(data, null, 2) + '\n');
}

function expectF15(snapshot) {
  expect(snapshot).toMatchObject({ schemaVersion: 1, kind: 'educational-hormone-reference',
    scope: 'ordinary-patient-reference', analyte: 'amh', status: 'recorded', reasonCodes: [],
    context: { sex: 'female', ageYears: 15, ageUpperYears: 15 + 1 / 12, ageUpperInclusive: false },
    reference: { value: 21.14, unit: 'pmol/L', statistic: 'group-median',
      profileId: 'jopling2018-female-amh-age-15-under18', ageGroup: { label: '15–18,9 lat', n: 30 } },
  });
  expect(snapshot.reference.sourceLabel).toContain('Jopling');
  expect(snapshot.reference.method).toContain('Access');
  expect(snapshot.reference.provenance).toMatchObject({ doi: '10.1002/edm2.21' });
  for (const field of ['engine', 'data', 'runtime']) expect(snapshot.versions[field]).toEqual(expect.any(String));
  expect(snapshot.capturedAtISO).toMatch(/^\d{4}-\d{2}-\d{2}T/);
}

for (const width of [1440, 320]) test(`AMH F15 main-form reference survives pin, reload and history at ${width}px`, async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page, { width, main: true });
  await choose(page);
  await expect(sourcePoint(page)).toHaveAttribute('data-reference-value', '21.14');
  const originalCurve = await chart(page).locator('[data-female-stable-line="amh"]').evaluateAll(paths => paths.map(path => path.getAttribute('d')));
  const clinicalRange = await page.locator('#labResultSourceLine').innerText();
  const sourceState = await page.evaluate(() => window.VildaPersistence.readShared());
  await page.locator('#labPinResultBtn').click();
  const modal = page.locator('#labPinOverlay');
  await expect(savedReference(modal)).toHaveAttribute('data-reference-status', 'recorded');
  await expect(savedReference(modal)).toContainText('Mediana grupy');
  await expect(savedReference(modal)).toContainText('2,96 ng/mL');
  await expect(modal.locator('input, select, textarea')).toHaveCount(2);
  expect(await modal.evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true);
  await capture(page, modal, `${width}-pin`);
  await page.locator('#labPinSave').click();
  await expect(modal).toHaveCount(0);
  const all = await notes(page, id);
  expect(all).toHaveLength(1);
  const saved = all[0], snapshot = saved.labResult.hormoneReference;
  expectF15(snapshot);
  expect(snapshot.measurement).toMatchObject({ raw: '0.45', sourceUnit: 'ng/mL', sourceValue: .45, unit: 'pmol/L' });
  expect(snapshot.display.referenceValue).toBeCloseTo(2.961714, 8);
  expect(saved.labResult).not.toHaveProperty('assessment');
  expect(saved.labResult).not.toHaveProperty('norm');
  expect(await chart(page).locator('[data-female-stable-line="amh"]').evaluateAll(paths => paths.map(path => path.getAttribute('d')))).toEqual(originalCurve);
  expect(await page.locator('#labResultSourceLine').innerText()).toBe(clinicalRange);
  expect(await page.evaluate(() => window.VildaPersistence.readShared())).toEqual(sourceState);
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaAuthUI);
  expect((await readNote(page, saved.id)).labResult.hormoneReference).toEqual(snapshot);
  const series = await page.evaluate(pid => window.VildaVault.listPatientLabSeries(pid), id);
  const point = series.find(s => s.testKey === 'amh').points.find(p => p.noteId === saved.id);
  expect(point).toMatchObject({ valueNum: .45, unit: 'ng/mL', hormoneReference: snapshot });
  // Saved history must not ask today's source resolver or clinical evaluator.
  await page.evaluate(() => {
    window.__historicalReferenceCalls = 0;
    if (window.VildaHormoneLifespanReference) window.VildaHormoneLifespanReference.evaluate = () => {
      window.__historicalReferenceCalls++; throw new Error('Historical AMH requested a live reference');
    };
    if (window.LabUnitConverter) window.LabUnitConverter.evaluate = () => {
      window.__historicalReferenceCalls++; throw new Error('Historical AMH requested current norms');
    };
  });
  const timeline = await history(page, id);
  await expect(savedReference(timeline)).toHaveAttribute('data-reference-status', 'recorded');
  await expect(savedReference(timeline)).toContainText('2,96 ng/mL');
  await expect(timeline.locator('span').filter({ hasText: /^AMH.*:\s*0[.,]45 ng\/mL$/ })).toHaveCount(1);
  await expect(timeline).toBeVisible();
  await capture(page, timeline, `${width}-history`, saved);
  await savedReference(timeline).locator('summary').click();
  await expect(timeline).toBeVisible();
  await expect(page.locator('.vilda-pne')).toHaveCount(0);
  await expect(savedReference(timeline).locator('details')).toHaveAttribute('open', '');
  await expect(savedReference(timeline)).toContainText('Jopling');
  await expect(savedReference(timeline)).toContainText('15–18,9');
  await expect(savedReference(timeline)).toContainText('Access');
  expect(await page.evaluate(() => window.__historicalReferenceCalls)).toBe(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
  await capture(page, timeline, `${width}-history-expanded`, saved);
});

test('AMH pin captures an ordinary source independently of selected lines and comparison view, with source and display units', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page);
  await choose(page, '21.14', 'pmol/L', 'ng/mL');
  await expect(sourcePoint(page)).toHaveAttribute('data-reference-value', '21.14');
  await chart(page).locator('[data-hormone="amh"]').click();
  await expect(sourcePoint(page)).toHaveCount(0);
  const deselected = await pin(page, id);
  expectF15(deselected.labResult.hormoneReference);
  expect(deselected.labResult.hormoneReference.measurement).toMatchObject({ raw: '21.14', sourceValue: 21.14,
    sourceUnit: 'pmol/L', value: 21.14, unit: 'pmol/L', conversionFactor: 1 });
  expect(deselected.labResult.hormoneReference.display).toMatchObject({ unit: 'pmol/L', factorFromCanonical: 1, referenceValue: 21.14 });
  expect(deselected.labResult.valueNum).toBe(21.14);
  expect(deselected.labResult.unit).toBe('pmol/L');
  await chart(page).locator('[data-hormone="amh"]').click();
  await chart(page).locator('[data-view="puberty"]').click();
  await chart(page).locator('.vhl-compare-toggle').click();
  const comparison = await pin(page, id);
  expectF15(comparison.labResult.hormoneReference);
  expect(comparison.labResult.hormoneReference.reference).toEqual(deselected.labResult.hormoneReference.reference);
  for (const [raw, value] of [['+21.14', 21.14], ['1 000', 1000]]) {
    await page.locator('#labValue').fill(raw);
    const grouped = await pin(page, id);
    expectF15(grouped.labResult.hormoneReference);
    expect(grouped.labResult.hormoneReference.measurement).toMatchObject({ raw, sourceValue: value, value, sourceUnit: 'pmol/L' });
    expect(grouped.labResult.valueNum).toBe(value);
  }
});

test('AMH stores model medians and explicit source gaps without replacing the measured trend value', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page, { age: 44, sex: 'M' });
  await choose(page, '5.77');
  await expect(sourcePoint(page)).toHaveAttribute('data-profile', 'tehrani2017-male-amh');
  const model = await pin(page, id);
  expect(model.labResult.hormoneReference).toMatchObject({ status: 'recorded', context: { sex: 'male', ageYears: 44 },
    reference: { statistic: 'median', profileId: 'tehrani2017-male-amh', ageGroup: null }, display: { unit: 'ng/mL' } });
  expect(model.labResult.hormoneReference.display.referenceValue).toBeCloseTo(5.77, 8);
  await page.evaluate(() => {
    window.VildaPersistence.writeShared({ name: 'Fikcyjny brak odniesienia AMH', sex: 'M', age: 19, ageMonths: 0 }, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:session-changed'));
  });
  await page.locator('#labValue').fill('2');
  await expect(sourcePoint(page)).toHaveCount(0);
  const gap = await pin(page, id);
  expect(gap.labResult.hormoneReference).toMatchObject({ status: 'unavailable', reference: null,
    context: { sex: 'male', ageYears: 19 }, measurement: { raw: '2', sourceUnit: 'ng/mL' } });
  expect(gap.labResult.hormoneReference.reasonCodes.length).toBeGreaterThan(0);
  const series = await page.evaluate(pid => window.VildaVault.listPatientLabSeries(pid), id);
  expect(series.find(s => s.testKey === 'amh').points.find(p => p.noteId === gap.id)).toMatchObject({ valueNum: 2, unit: 'ng/mL' });
  const timeline = await history(page, id);
  await expect(timeline.locator('.vilda-hormone-reference[data-reference-status="unavailable"]')).toBeVisible();
});

test('AMH modal freezes the source and patient target while a later patient gets an independent reference', async ({ page }) => {
  test.setTimeout(120_000);
  const a = await prepare(page);
  await choose(page);
  await page.locator('#labPinResultBtn').click();
  await expect(savedReference(page.locator('#labPinOverlay'))).toContainText('2,96 ng/mL');
  const b = await page.evaluate(async () => {
    const user = { name: 'Fikcyjny drugi pacjent AMH', sex: 'M', age: 44, ageMonths: 0, height: 178, weight: 75 };
    const next = await window.VildaVault.savePatient({ name: user.name, user, puberty: {} }, { dedup: false });
    window._vildaCurrentPatientId = next.patientId;
    window.sessionStorage.setItem('vildaCurrentPatientId', next.patientId);
    window.VildaPersistence.writeShared(user, { force: true });
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: next.patientId } }));
    return next.patientId;
  });
  await expect(savedReference(page.locator('#labPinOverlay'))).toContainText('2,96 ng/mL');
  await page.locator('#labPinSave').click();
  await expect(page.locator('#labPinOverlay')).toHaveCount(0);
  const aNotes = await notes(page, a);
  expect(aNotes).toHaveLength(1);
  expectF15(aNotes[0].labResult.hormoneReference);
  expect(await notes(page, b)).toHaveLength(0);
  await choose(page, '5.77');
  await expect(sourcePoint(page)).toHaveAttribute('data-profile', 'tehrani2017-male-amh');
  const bNote = await pin(page, b);
  expect(bNote.patientId).toBe(b);
  expect(bNote.labResult.hormoneReference).toMatchObject({ status: 'recorded', context: { sex: 'male', ageYears: 44 },
    reference: { profileId: 'tehrani2017-male-amh', statistic: 'median' } });
  expect((await readNote(page, aNotes[0].id)).labResult.hormoneReference).toEqual(aNotes[0].labResult.hormoneReference);
});

test('AMH saved editor preserves comments, invalidates result or date changes, and leaves legacy entries unchanged', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page);
  await choose(page);
  const saved = await pin(page, id), dated = await pin(page, id);
  let form = await editor(page, saved);
  await expect(savedReference(form)).toContainText('2,96 ng/mL');
  await form.locator('textarea').fill('Wyłącznie fikcyjny komentarz po zapisie');
  await saveEditor(page);
  expect((await readNote(page, saved.id)).labResult.hormoneReference).toEqual(saved.labResult.hormoneReference);
  form = await editor(page, saved);
  await form.locator('.b3-lab-norm').fill('1–10 ng/mL');
  await expect(savedReference(form)).toHaveAttribute('data-reference-status', 'recorded');
  await saveEditor(page);
  expect((await readNote(page, saved.id)).labResult.hormoneReference).toEqual(saved.labResult.hormoneReference);
  form = await editor(page, saved);
  await form.locator('.b3-lab-value').fill('0.9');
  await expect(savedReference(form)).toHaveAttribute('data-reference-status', 'invalidated');
  await saveEditor(page);
  const changed = await readNote(page, saved.id);
  expect(changed.labResult.hormoneReference.status).toBe('invalidated');
  expect(changed.labResult.hormoneReference.reference).toEqual(saved.labResult.hormoneReference.reference);
  form = await editor(page, dated);
  await form.locator('input[name="b3-anchor"][value="date"]').check();
  await form.locator('.b3-clinical-date').fill('2026-06-16');
  await saveEditor(page);
  expect((await readNote(page, dated.id)).labResult.hormoneReference.status).toBe('invalidated');
  const legacy = await page.evaluate(async pid => {
    const labResult = { test: 'AMH', testKey: 'amh', value: '2 ng/mL = 14,3 pmol/L', valueNum: 2, unit: 'ng/mL', norm: '1–10 ng/mL' };
    const saved = await window.VildaVault.savePatientNote({ patientId: pid, title: 'Fikcyjny dawny wynik AMH',
      body: 'Bez dawnego odniesienia', category: 'wynik-badania', clinicalDateISO: '2024-01-02', labResult });
    return window.VildaVault.getPatientNote(saved.id);
  }, id);
  form = await editor(page, legacy);
  await expect(savedReference(form)).toHaveCount(0);
  await form.locator('textarea').fill('Nowy komentarz starego wyniku');
  await saveEditor(page);
  expect((await readNote(page, legacy.id)).labResult).toEqual(legacy.labResult);
  const timeline = await history(page, id);
  await expect(timeline).toContainText('Nowy komentarz starego wyniku');
  await expect(timeline).toContainText('2 ng/mL = 14,3 pmol/L');
  await expect(timeline.locator('.vilda-hormone-reference[data-reference-status="invalidated"]')).toHaveCount(2);
  await expect(savedReference(timeline)).toHaveCount(2);
});

test('AMH calendar editor preserves the stored source on comments and invalidates a changed result', async ({ page }) => {
  test.setTimeout(120_000);
  const id = await prepare(page);
  await choose(page);
  const saved = await pin(page, id);
  const scheduled = await page.evaluate(async noteId => {
    const note = await window.VildaVault.getPatientNote(noteId);
    // A new due-only calendar note has its own binding. Keep the production
    // reference untouched; remove only the previous note's date/result binding.
    const labResult = structuredClone(note.labResult);
    delete labResult.hormoneReference.binding;
    const created = await window.VildaVault.savePatientNote({ patientId: note.patientId, title: 'Fikcyjne AMH w terminarzu',
      body: 'Komentarz terminarza', category: 'wynik-badania',
      dueDateISO: '2026-06-17', dueTime: '10:00', durationMin: 30, labResult });
    return window.VildaVault.getPatientNote(created.id);
  }, saved.id);
  expect(scheduled.labResult.hormoneReference.status).toBe('recorded');
  expect(scheduled.labResult.hormoneReference.binding.clinicalDateISO).toBeNull();
  expect((await readNote(page, saved.id)).labResult.hormoneReference).toEqual(saved.labResult.hormoneReference);
  await page.goto('/terminarz.html', { waitUntil: 'load' });
  await page.waitForFunction(() => window.VildaVault?.isUnlocked() && window.VildaTerminarz && window.VildaHormoneReferenceUI);
  await page.evaluate(() => { window.VildaTerminarz.setView('week'); window.VildaTerminarz.refresh(); });
  const edit = async () => {
    await page.locator(`.tz-wb[data-note-id="${scheduled.id}"]`).waitFor({ state: 'attached' });
    await page.locator(`.tz-wb[data-note-id="${scheduled.id}"]`).evaluate(el => el.click());
    await page.locator('.tz-pop button[data-pop="edit"]').evaluate(el => el.click());
    await expect(page.locator('#tzNewTermOverlay')).toBeVisible();
  };
  await edit();
  await expect(savedReference(page.locator('#tzNewTermOverlay'))).toContainText('2,96 ng/mL');
  await page.locator('#tzNtBody').fill('Nowy komentarz terminarza');
  await page.locator('#tzNtSave').evaluate(el => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, scheduled.id)).labResult.hormoneReference).toEqual(scheduled.labResult.hormoneReference);
  await edit();
  await page.locator('#tzNtLabNorm').fill('1–10 ng/mL');
  await expect(savedReference(page.locator('#tzNewTermOverlay'))).toHaveAttribute('data-reference-status', 'recorded');
  await page.locator('#tzNtSave').evaluate(el => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, scheduled.id)).labResult.hormoneReference).toEqual(scheduled.labResult.hormoneReference);
  await edit();
  await page.locator('#tzNtLabValue').fill('0.9');
  await expect(savedReference(page.locator('#tzNewTermOverlay'))).toHaveAttribute('data-reference-status', 'invalidated');
  await page.locator('#tzNtSave').evaluate(el => el.click());
  await expect(page.locator('#tzNewTermOverlay')).toHaveCount(0);
  expect((await readNote(page, scheduled.id)).labResult.hormoneReference.status).toBe('invalidated');
});
